"""Safe, idempotent bootstrap for Angela's workout content.

Dry-run is the default. Remote writes require the explicit ``--apply`` flag and
server-only credentials injected through the process environment.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, Protocol, Sequence, TextIO


PROJECT_REF = "roovdrcksjfinxhbuxxo"
PROJECT_URL = f"https://{PROJECT_REF}.supabase.co"
EXPECTED_ASSET_COUNT = 34


class BootstrapError(RuntimeError):
    """A safe, operator-facing bootstrap failure."""


@dataclass(frozen=True)
class Asset:
    team: int
    sort_order: int
    title: str
    storage_path: str
    local_file: Path
    pdf_sha256: str
    plan: dict[str, Any]
    plan_sha256: str


@dataclass(frozen=True)
class BootstrapBundle:
    assets: tuple[Asset, ...]
    bundle_sha256: str

    @property
    def pdf_count(self) -> int:
        return len(self.assets)

    @property
    def plan_count(self) -> int:
        return len(self.assets)


class BootstrapRemote(Protocol):
    def preflight(self) -> None: ...

    def download_pdf(self, storage_path: str) -> bytes | None: ...

    def upload_pdf(self, asset: Asset) -> None: ...

    def upsert_content(self, bundle: BootstrapBundle) -> None: ...

    def verify(self, bundle: BootstrapBundle) -> dict[str, int | str]: ...


class SupabaseApi(Protocol):
    def management_query(self, sql: str) -> list[dict[str, Any]]: ...

    def download_object(self, storage_path: str) -> bytes | None: ...

    def upload_object(self, storage_path: str, contents: bytes) -> None: ...


class SupabaseHttpApi:
    """Minimal HTTP client that keeps credentials in headers and redacts errors."""

    def __init__(
        self,
        management_pat: str,
        service_role_key: str,
        *,
        opener: Any = urllib.request.urlopen,
    ) -> None:
        if not management_pat or not service_role_key:
            raise BootstrapError("server-only Supabase credentials are required")
        self._management_pat = management_pat
        self._service_role_key = service_role_key
        self._opener = opener

    @staticmethod
    def _user_agent() -> str:
        return "nexus-angela-safe-bootstrap/1.0"

    def _request(
        self,
        request: urllib.request.Request,
        *,
        surface: str,
        allow_not_found: bool = False,
    ) -> bytes | None:
        try:
            with self._opener(request, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            exc.read()
            if allow_not_found and exc.code == 404:
                return None
            raise BootstrapError(f"{surface} returned HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise BootstrapError(f"{surface} request failed") from None

    def management_query(self, sql: str) -> list[dict[str, Any]]:
        body = self._request(
            urllib.request.Request(
                f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
                data=json.dumps({"query": sql}).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {self._management_pat}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": self._user_agent(),
                },
                method="POST",
            ),
            surface="Supabase Management API",
        )
        try:
            decoded = json.loads(body or b"[]")
        except json.JSONDecodeError as exc:
            raise BootstrapError("Supabase Management API returned invalid JSON") from exc
        if not isinstance(decoded, list) or any(
            not isinstance(item, dict) for item in decoded
        ):
            raise BootstrapError("Supabase Management API returned an invalid result")
        return decoded

    def _storage_url(self, storage_path: str) -> str:
        encoded = urllib.parse.quote(storage_path, safe="/")
        return f"{PROJECT_URL}/storage/v1/object/treinos/{encoded}"

    def _storage_headers(self) -> dict[str, str]:
        return {
            "apikey": self._service_role_key,
            "Authorization": f"Bearer {self._service_role_key}",
            "User-Agent": self._user_agent(),
        }

    def download_object(self, storage_path: str) -> bytes | None:
        return self._request(
            urllib.request.Request(
                self._storage_url(storage_path),
                headers=self._storage_headers(),
                method="GET",
            ),
            surface="Supabase Storage",
            allow_not_found=True,
        )

    def upload_object(self, storage_path: str, contents: bytes) -> None:
        headers = self._storage_headers()
        headers.update({"Content-Type": "application/pdf", "x-upsert": "true"})
        self._request(
            urllib.request.Request(
                self._storage_url(storage_path),
                data=contents,
                headers=headers,
                method="POST",
            ),
            surface="Supabase Storage",
        )


def _sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _render_content_upsert(bundle: BootstrapBundle) -> str:
    workout_rows = ",\n".join(
        "(" + ", ".join(
            (
                str(asset.team),
                _sql_text(asset.title),
                _sql_text(asset.storage_path),
                str(asset.sort_order),
            )
        ) + ")"
        for asset in bundle.assets
    )
    plan_rows = ",\n".join(
        "(" + ", ".join(
            (
                str(asset.team),
                str(asset.sort_order),
                _sql_text(_canonical_json(asset.plan).decode("utf-8")) + "::jsonb",
            )
        ) + ")"
        for asset in bundle.assets
    )
    return f"""begin;
insert into public.workouts (team, title, pdf_path, sort_order)
values
{workout_rows}
on conflict (team, sort_order) do update
set title = excluded.title,
    pdf_path = excluded.pdf_path
where public.workouts.title is distinct from excluded.title
   or public.workouts.pdf_path is distinct from excluded.pdf_path;

with plan_source (team, sort_order, plan) as (
  values
{plan_rows}
)
insert into public.workout_plans (workout_id, plan)
select workouts.id, plan_source.plan
from plan_source
join public.workouts as workouts
  on workouts.team = plan_source.team
 and workouts.sort_order = plan_source.sort_order
on conflict (workout_id) do update
set plan = excluded.plan,
    updated_at = statement_timestamp()
where public.workout_plans.plan is distinct from excluded.plan;
commit;"""


class SupabaseBootstrapRemote:
    """Domain-specific adapter over the Supabase HTTP boundary."""

    def __init__(self, api: SupabaseApi) -> None:
        self._api = api

    def preflight(self) -> None:
        rows = self._api.management_query(
            """
select
  to_regclass('public.workouts') is not null as workouts_ready,
  to_regclass('public.workout_plans') is not null as workout_plans_ready,
  exists(select 1 from storage.buckets where id = 'treinos') as bucket_ready,
  (select public from storage.buckets where id = 'treinos') as bucket_public;
""".strip()
        )
        if len(rows) != 1 or not isinstance(rows[0], dict):
            raise BootstrapError("remote preflight returned an invalid result")
        row = rows[0]
        if (
            row.get("workouts_ready") is not True
            or row.get("workout_plans_ready") is not True
            or row.get("bucket_ready") is not True
            or row.get("bucket_public") is not False
        ):
            raise BootstrapError("required migrated schema or private bucket is unavailable")

    def download_pdf(self, storage_path: str) -> bytes | None:
        return self._api.download_object(storage_path)

    def upload_pdf(self, asset: Asset) -> None:
        self._api.upload_object(asset.storage_path, asset.local_file.read_bytes())

    def upsert_content(self, bundle: BootstrapBundle) -> None:
        self._api.management_query(_render_content_upsert(bundle))

    def verify(self, bundle: BootstrapBundle) -> dict[str, int | str]:
        rows = self._api.management_query(
            """
select
  (select count(*)::int from public.workouts) as workout_count,
  (select count(*)::int from public.workout_plans) as workout_plan_count,
  (select count(*)::int from storage.objects where bucket_id = 'treinos')
    as storage_object_count,
  coalesce((
    select json_agg(json_build_object(
      'team', workouts.team,
      'sort_order', workouts.sort_order,
      'title', workouts.title,
      'pdf_path', workouts.pdf_path,
      'plan', workout_plans.plan
    ) order by workouts.team, workouts.sort_order)
    from public.workouts as workouts
    left join public.workout_plans as workout_plans
      on workout_plans.workout_id = workouts.id
  ), '[]'::json) as content;
""".strip()
        )
        if len(rows) != 1 or not isinstance(rows[0], dict):
            raise BootstrapError("remote verification returned an invalid result")
        row = rows[0]
        expected_count = len(bundle.assets)
        counts = {
            "storage_object_count": row.get("storage_object_count"),
            "workout_count": row.get("workout_count"),
            "workout_plan_count": row.get("workout_plan_count"),
        }
        if any(value != expected_count for value in counts.values()):
            raise BootstrapError("remote counts do not match the complete bundle")

        content = row.get("content")
        if isinstance(content, str):
            try:
                content = json.loads(content)
            except json.JSONDecodeError as exc:
                raise BootstrapError("remote content verification is invalid") from exc
        if not isinstance(content, list) or len(content) != expected_count:
            raise BootstrapError("remote workout rows do not match the complete bundle")
        by_identity = {
            (item.get("team"), item.get("sort_order")): item
            for item in content
            if isinstance(item, dict)
        }
        if len(by_identity) != expected_count:
            raise BootstrapError("remote workout identities are not unique")
        for asset in bundle.assets:
            item = by_identity.get((asset.team, asset.sort_order))
            if (
                item is None
                or item.get("title") != asset.title
                or item.get("pdf_path") != asset.storage_path
                or item.get("plan") != asset.plan
            ):
                raise BootstrapError("remote workout content hash verification failed")
            contents = self._api.download_object(asset.storage_path)
            if contents is None or _sha256_bytes(contents) != asset.pdf_sha256:
                raise BootstrapError("remote PDF hash verification failed")

        return {
            "storage_object_count": expected_count,
            "workout_count": expected_count,
            "workout_plan_count": expected_count,
            "verified_bundle_sha256": bundle.bundle_sha256,
        }


def _base_report(bundle: BootstrapBundle, mode: str) -> dict[str, Any]:
    return {
        "mode": mode,
        "project_ref": PROJECT_REF,
        "pdf_count": bundle.pdf_count,
        "plan_count": bundle.plan_count,
        "bundle_sha256": bundle.bundle_sha256,
        "remote_verified": False,
    }


def run_bootstrap(
    bundle: BootstrapBundle,
    *,
    remote: BootstrapRemote | None = None,
    apply: bool = False,
    verify_only: bool = False,
) -> dict[str, Any]:
    """Plan or apply a complete bundle; dry-run never touches the remote seam."""

    if apply and verify_only:
        raise BootstrapError("apply and verify-only are mutually exclusive")
    if verify_only:
        if remote is None:
            raise BootstrapError("verify-only requires a configured remote")
        remote.preflight()
        report = _base_report(bundle, "verify-only")
        report.update({"remote_verified": True, **remote.verify(bundle)})
        return report
    if not apply:
        return _base_report(bundle, "dry-run")
    if remote is None:
        raise BootstrapError("apply mode requires a configured remote")

    remote.preflight()
    uploaded = 0
    replaced = 0
    skipped = 0
    for asset in bundle.assets:
        existing = remote.download_pdf(asset.storage_path)
        if existing is not None and _sha256_bytes(existing) == asset.pdf_sha256:
            skipped += 1
            continue
        remote.upload_pdf(asset)
        if existing is None:
            uploaded += 1
        else:
            replaced += 1

    remote.upsert_content(bundle)
    verified = remote.verify(bundle)
    report = _base_report(bundle, "apply")
    report.update(
        {
            "remote_verified": True,
            "uploaded_pdf_count": uploaded,
            "replaced_pdf_count": replaced,
            "skipped_pdf_count": skipped,
            **verified,
        }
    )
    return report


def _canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _ascii(value: str) -> str:
    return (
        unicodedata.normalize("NFKD", value)
        .encode("ascii", "ignore")
        .decode("ascii")
    )


def _slug(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "-", _ascii(value)).strip("-").lower()


def _workout_identity(team: int, filename: str) -> tuple[int, str]:
    normalized = _ascii(filename).upper()
    if team == 1:
        if "INICIANTES 1" in normalized:
            return 1, "Treino Iniciante 1"
        if "INICIANTES 2" in normalized:
            return 2, "Treino Iniciante 2"
        if "INTERMEDI" in normalized:
            return 3, "Treino Intermediário"
        match = re.search(r"AVANCADOS?\s+(\d+)", normalized)
        if not match:
            raise BootstrapError("unrecognized Team 1 PDF naming convention")
        number = int(match.group(1))
        return 3 + number, f"Treino Avançado {number}"
    if team == 2:
        match = re.search(r"AVANCADOS?\s+(\d+)", normalized)
        if not match:
            raise BootstrapError("unrecognized Team 2 PDF naming convention")
        number = int(match.group(1))
        return number - 9, f"Treino Avançado {number}"
    match = re.search(r"#(\d+)", filename)
    if not match:
        raise BootstrapError("unrecognized Team 3 PDF naming convention")
    number = int(match.group(1))
    return number, f"Treino #{number:02d}"


def build_bundle(
    pdf_root: Path,
    plans_dir: Path,
    *,
    expected_count: int = EXPECTED_ASSET_COUNT,
) -> BootstrapBundle:
    """Build and validate the complete one-PDF/one-plan deployment bundle."""

    if expected_count < 1:
        raise BootstrapError("expected_count must be positive")
    if not pdf_root.is_dir() or not plans_dir.is_dir():
        raise BootstrapError("PDF root and plans directory must exist")

    discovered: list[tuple[int, int, str, str, Path]] = []
    for team, folder_name in ((1, "Team 1.0"), (2, "Team 2.0"), (3, "Team 3.0")):
        folder = pdf_root / folder_name
        if not folder.is_dir():
            raise BootstrapError(f"required Team {team} PDF directory is missing")
        for path in sorted(folder.iterdir(), key=lambda item: item.name.casefold()):
            if not path.is_file() or path.suffix.casefold() != ".pdf":
                continue
            sort_order, title = _workout_identity(team, path.name)
            storage_path = f"team-{team}/{_slug(path.stem)}.pdf"
            discovered.append((team, sort_order, title, storage_path, path))

    if len(discovered) != expected_count:
        raise BootstrapError("PDF count does not match the expected complete bundle")

    plan_by_path: dict[str, dict[str, Any]] = {}
    plan_files = sorted(plans_dir.glob("*.json"), key=lambda item: item.name.casefold())
    if len(plan_files) != expected_count:
        raise BootstrapError("plan count does not match the expected complete bundle")
    for plan_file in plan_files:
        try:
            document = json.loads(plan_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise BootstrapError("a plan file is not valid UTF-8 JSON") from exc
        if not isinstance(document, dict):
            raise BootstrapError("a plan document is not an object")
        storage_path = document.get("pdf_path")
        plan = document.get("plan")
        if not isinstance(storage_path, str) or not isinstance(plan, dict):
            raise BootstrapError("a plan document is missing pdf_path or plan")
        if storage_path in plan_by_path:
            raise BootstrapError("duplicate pdf_path in plan documents")
        plan_by_path[storage_path] = plan

    storage_paths = [item[3] for item in discovered]
    identities = [(item[0], item[1]) for item in discovered]
    if len(set(storage_paths)) != expected_count or len(set(identities)) != expected_count:
        raise BootstrapError("duplicate workout identity in PDF bundle")
    if set(storage_paths) != set(plan_by_path):
        raise BootstrapError("PDF and plan paths are not a one-to-one match")

    assets = tuple(
        Asset(
            team=team,
            sort_order=sort_order,
            title=title,
            storage_path=storage_path,
            local_file=local_file,
            pdf_sha256=_sha256_file(local_file),
            plan=plan_by_path[storage_path],
            plan_sha256=_sha256_bytes(_canonical_json(plan_by_path[storage_path])),
        )
        for team, sort_order, title, storage_path, local_file in sorted(
            discovered,
            key=lambda item: (item[0], item[1]),
        )
    )
    digest_input = [
        {
            "team": asset.team,
            "sort_order": asset.sort_order,
            "title": asset.title,
            "storage_path": asset.storage_path,
            "pdf_sha256": asset.pdf_sha256,
            "plan_sha256": asset.plan_sha256,
        }
        for asset in assets
    ]
    return BootstrapBundle(
        assets=assets,
        bundle_sha256=_sha256_bytes(_canonical_json(digest_input)),
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Safely bootstrap Angela workout PDFs and structured plans.",
    )
    parser.add_argument("--pdf-root", type=Path, required=True)
    parser.add_argument(
        "--plans-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "plans",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--apply",
        action="store_true",
        help="Explicitly enable remote idempotent writes; default is offline dry-run.",
    )
    mode.add_argument(
        "--verify-only",
        action="store_true",
        help="Read and hash remote state without performing writes.",
    )
    return parser


def main(
    argv: Sequence[str] | None = None,
    *,
    environ: Mapping[str, str] | None = None,
    expected_count: int = EXPECTED_ASSET_COUNT,
    stdout: TextIO = sys.stdout,
    stderr: TextIO = sys.stderr,
    remote_factory: Callable[[str, str], BootstrapRemote] | None = None,
) -> int:
    args = _parser().parse_args(argv)
    source = os.environ if environ is None else environ
    try:
        bundle = build_bundle(
            args.pdf_root,
            args.plans_dir,
            expected_count=expected_count,
        )
        if args.apply or args.verify_only:
            management_pat = source.get("SUPABASE_PAT", "")
            service_role_key = source.get("SUPABASE_SERVICE_ROLE_KEY", "")
            if not management_pat or not service_role_key:
                raise BootstrapError(
                    "remote mode requires server-only management and service credentials"
                )
            factory = remote_factory or (
                lambda pat, key: SupabaseBootstrapRemote(SupabaseHttpApi(pat, key))
            )
            report = run_bootstrap(
                bundle,
                remote=factory(management_pat, service_role_key),
                apply=args.apply,
                verify_only=args.verify_only,
            )
        else:
            report = run_bootstrap(bundle, apply=False)
        print(json.dumps(report, sort_keys=True), file=stdout)
        return 0
    except BootstrapError as exc:
        print(
            json.dumps({"status": "error", "error": str(exc)}, sort_keys=True),
            file=stderr,
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
