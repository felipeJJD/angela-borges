import json
import io
import urllib.error
import tempfile
import unittest
from pathlib import Path

from scripts import setup_db


class SafeBootstrapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.pdf_root = self.root / "pdfs"
        self.plans_dir = self.root / "plans"
        self.plans_dir.mkdir()

        fixtures = (
            ("Team 1.0", "INICIANTES 1.pdf", "team-1/iniciantes-1.pdf", b"abc"),
            ("Team 2.0", "AVANÇADOS 10.pdf", "team-2/avancados-10.pdf", b"pdf-two"),
            ("Team 3.0", "TREINO #1.pdf", "team-3/treino-1.pdf", b"pdf-three"),
        )
        for index, (folder, filename, storage_path, contents) in enumerate(fixtures):
            team_dir = self.pdf_root / folder
            team_dir.mkdir(parents=True, exist_ok=True)
            (team_dir / filename).write_bytes(contents)
            (self.plans_dir / f"plan-{index}.json").write_text(
                json.dumps(
                    {
                        "pdf_path": storage_path,
                        "plan": {"days": [{"label": f"day-{index}"}]},
                    }
                ),
                encoding="utf-8",
            )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_build_bundle_requires_one_plan_for_each_pdf(self) -> None:
        bundle = setup_db.build_bundle(
            self.pdf_root,
            self.plans_dir,
            expected_count=3,
        )

        self.assertEqual(bundle.pdf_count, 3)
        self.assertEqual(bundle.plan_count, 3)
        self.assertEqual(
            [asset.storage_path for asset in bundle.assets],
            [
                "team-1/iniciantes-1.pdf",
                "team-2/avancados-10.pdf",
                "team-3/treino-1.pdf",
            ],
        )
        self.assertEqual(
            bundle.assets[0].pdf_sha256,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        )

    def test_dry_run_is_offline_and_reports_only_counts_and_hashes(self) -> None:
        bundle = setup_db.build_bundle(
            self.pdf_root,
            self.plans_dir,
            expected_count=3,
        )

        class ForbiddenRemote:
            def preflight(self, _bundle: object) -> object:
                raise AssertionError("dry-run touched the network boundary")

        report = setup_db.run_bootstrap(
            bundle,
            remote=ForbiddenRemote(),
            apply=False,
        )

        self.assertEqual(
            report,
            {
                "mode": "dry-run",
                "project_ref": "roovdrcksjfinxhbuxxo",
                "pdf_count": 3,
                "plan_count": 3,
                "bundle_sha256": bundle.bundle_sha256,
                "remote_verified": False,
            },
        )

    def test_apply_skips_equal_pdfs_and_verifies_all_remote_content(self) -> None:
        bundle = setup_db.build_bundle(
            self.pdf_root,
            self.plans_dir,
            expected_count=3,
        )

        class RecordingRemote:
            def __init__(self) -> None:
                self.objects = {
                    bundle.assets[0].storage_path: bundle.assets[0].local_file.read_bytes(),
                    bundle.assets[2].storage_path: b"stale-pdf",
                }
                self.upserted = False

            def preflight(self) -> None:
                return None

            def download_pdf(self, storage_path: str) -> bytes | None:
                return self.objects.get(storage_path)

            def upload_pdf(self, asset: setup_db.Asset) -> None:
                self.objects[asset.storage_path] = asset.local_file.read_bytes()

            def upsert_content(self, _bundle: setup_db.BootstrapBundle) -> None:
                self.upserted = True

            def verify(self, expected: setup_db.BootstrapBundle) -> dict[str, int]:
                self.assert_complete(expected)
                return {
                    "storage_object_count": 3,
                    "workout_count": 3,
                    "workout_plan_count": 3,
                }

            def assert_complete(self, expected: setup_db.BootstrapBundle) -> None:
                if not self.upserted:
                    raise AssertionError("database upsert was not committed")
                for asset in expected.assets:
                    if self.objects.get(asset.storage_path) != asset.local_file.read_bytes():
                        raise AssertionError("storage hash mismatch")

        remote = RecordingRemote()
        report = setup_db.run_bootstrap(bundle, remote=remote, apply=True)

        self.assertEqual(report["uploaded_pdf_count"], 1)
        self.assertEqual(report["replaced_pdf_count"], 1)
        self.assertEqual(report["skipped_pdf_count"], 1)
        self.assertEqual(report["storage_object_count"], 3)
        self.assertEqual(report["workout_count"], 3)
        self.assertEqual(report["workout_plan_count"], 3)
        self.assertTrue(report["remote_verified"])

    def test_database_bootstrap_is_transactional_upsert_without_global_delete(self) -> None:
        bundle = setup_db.build_bundle(
            self.pdf_root,
            self.plans_dir,
            expected_count=3,
        )

        class RecordingApi:
            def __init__(self) -> None:
                self.queries: list[str] = []

            def management_query(self, sql: str) -> list[dict[str, object]]:
                self.queries.append(sql)
                return []

        api = RecordingApi()
        remote = setup_db.SupabaseBootstrapRemote(api)
        remote.upsert_content(bundle)

        self.assertEqual(len(api.queries), 1)
        sql = api.queries[0].lower()
        self.assertTrue(sql.lstrip().startswith("begin;"))
        self.assertTrue(sql.rstrip().endswith("commit;"))
        self.assertGreaterEqual(sql.count("on conflict"), 2)
        self.assertNotIn("delete ", sql)
        self.assertNotIn("truncate ", sql)
        self.assertNotIn("drop ", sql)

    def test_remote_verification_checks_counts_rows_plans_and_pdf_hashes(self) -> None:
        bundle = setup_db.build_bundle(
            self.pdf_root,
            self.plans_dir,
            expected_count=3,
        )

        class VerifiedApi:
            def management_query(self, _sql: str) -> list[dict[str, object]]:
                return [
                    {
                        "workout_count": 3,
                        "workout_plan_count": 3,
                        "storage_object_count": 3,
                        "content": [
                            {
                                "team": asset.team,
                                "sort_order": asset.sort_order,
                                "title": asset.title,
                                "pdf_path": asset.storage_path,
                                "plan": asset.plan,
                            }
                            for asset in bundle.assets
                        ],
                    }
                ]

            def download_object(self, storage_path: str) -> bytes | None:
                asset = next(
                    item for item in bundle.assets if item.storage_path == storage_path
                )
                return asset.local_file.read_bytes()

        remote = setup_db.SupabaseBootstrapRemote(VerifiedApi())
        verification = remote.verify(bundle)

        self.assertEqual(
            verification,
            {
                "storage_object_count": 3,
                "workout_count": 3,
                "workout_plan_count": 3,
                "verified_bundle_sha256": bundle.bundle_sha256,
            },
        )

    def test_preflight_requires_migrated_schema_and_private_bucket(self) -> None:
        class Api:
            def __init__(self, row: dict[str, object]) -> None:
                self.row = row

            def management_query(self, _sql: str) -> list[dict[str, object]]:
                return [self.row]

        valid = {
            "workouts_ready": True,
            "workout_plans_ready": True,
            "bucket_ready": True,
            "bucket_public": False,
        }
        setup_db.SupabaseBootstrapRemote(Api(valid)).preflight()

        for unsafe in (
            {**valid, "workouts_ready": False},
            {**valid, "workout_plans_ready": False},
            {**valid, "bucket_ready": False},
            {**valid, "bucket_public": True},
        ):
            with self.subTest(unsafe=unsafe):
                with self.assertRaises(setup_db.BootstrapError):
                    setup_db.SupabaseBootstrapRemote(Api(unsafe)).preflight()

    def test_cli_defaults_to_safe_dry_run_and_never_prints_credentials(self) -> None:
        stdout = io.StringIO()
        stderr = io.StringIO()
        sensitive_pat = "synthetic-management-secret"
        sensitive_service_key = "synthetic-service-secret"

        exit_code = setup_db.main(
            ["--pdf-root", str(self.pdf_root), "--plans-dir", str(self.plans_dir)],
            environ={
                "SUPABASE_PAT": sensitive_pat,
                "SUPABASE_SERVICE_ROLE_KEY": sensitive_service_key,
            },
            expected_count=3,
            stdout=stdout,
            stderr=stderr,
        )

        self.assertEqual(exit_code, 0)
        self.assertEqual(json.loads(stdout.getvalue())["mode"], "dry-run")
        combined = stdout.getvalue() + stderr.getvalue()
        self.assertNotIn(sensitive_pat, combined)
        self.assertNotIn(sensitive_service_key, combined)

    def test_http_failures_never_surface_provider_bodies_or_credentials(self) -> None:
        sensitive_pat = "synthetic-management-secret"
        sensitive_service_key = "synthetic-service-secret"

        def failing_opener(*_args: object, **_kwargs: object) -> object:
            raise urllib.error.HTTPError(
                url="https://api.supabase.com/v1/projects/redacted/database/query",
                code=500,
                msg="server error",
                hdrs=None,
                fp=io.BytesIO(
                    json.dumps(
                        {"message": sensitive_pat + sensitive_service_key}
                    ).encode()
                ),
            )

        api = setup_db.SupabaseHttpApi(
            sensitive_pat,
            sensitive_service_key,
            opener=failing_opener,
        )

        with self.assertRaises(setup_db.BootstrapError) as raised:
            api.management_query("select 1")

        message = str(raised.exception)
        self.assertIn("HTTP 500", message)
        self.assertNotIn(sensitive_pat, message)
        self.assertNotIn(sensitive_service_key, message)

    def test_modern_secret_key_uses_apikey_without_bearer_authorization(self) -> None:
        modern_secret_key = "sb_secret_synthetic-regression-key"
        observed_headers: dict[str, str] = {}

        class AcceptedResponse:
            def __enter__(self) -> "AcceptedResponse":
                return self

            def __exit__(self, *_args: object) -> None:
                return None

            def read(self) -> bytes:
                return b"{}"

        def storage_gateway(request: object, **_kwargs: object) -> AcceptedResponse:
            nonlocal observed_headers
            observed_headers = {
                name.lower(): value for name, value in request.header_items()
            }
            if "authorization" in observed_headers:
                raise urllib.error.HTTPError(
                    url="https://synthetic.supabase.co/storage/v1/object/treinos/test.pdf",
                    code=400,
                    msg="opaque key is not a JWT",
                    hdrs=None,
                    fp=io.BytesIO(b"discarded-provider-body"),
                )
            return AcceptedResponse()

        api = setup_db.SupabaseHttpApi(
            "synthetic-management-secret",
            modern_secret_key,
            opener=storage_gateway,
        )
        api.upload_object("team-1/test.pdf", b"synthetic-pdf")

        self.assertEqual(observed_headers["apikey"], modern_secret_key)
        self.assertNotIn("authorization", observed_headers)

    def test_legacy_service_role_jwt_keeps_bearer_authorization(self) -> None:
        legacy_service_role = "synthetic-header.synthetic-payload.synthetic-signature"
        observed_headers: dict[str, str] = {}

        class AcceptedResponse:
            def __enter__(self) -> "AcceptedResponse":
                return self

            def __exit__(self, *_args: object) -> None:
                return None

            def read(self) -> bytes:
                return b"synthetic-pdf"

        def storage_gateway(request: object, **_kwargs: object) -> AcceptedResponse:
            nonlocal observed_headers
            observed_headers = {
                name.lower(): value for name, value in request.header_items()
            }
            return AcceptedResponse()

        api = setup_db.SupabaseHttpApi(
            "synthetic-management-secret",
            legacy_service_role,
            opener=storage_gateway,
        )
        self.assertEqual(api.download_object("team-1/test.pdf"), b"synthetic-pdf")

        self.assertEqual(observed_headers["apikey"], legacy_service_role)
        self.assertEqual(
            observed_headers["authorization"],
            f"Bearer {legacy_service_role}",
        )

    def test_storage_normalizes_exact_400_not_found_envelope_to_missing_object(self) -> None:
        def missing_object_gateway(*_args: object, **_kwargs: object) -> object:
            raise urllib.error.HTTPError(
                url="https://synthetic.supabase.co/storage/v1/object/treinos/missing.pdf",
                code=400,
                msg="storage envelope",
                hdrs=None,
                fp=io.BytesIO(b'{"error":"not_found","statusCode":"404"}'),
            )

        api = setup_db.SupabaseHttpApi(
            "synthetic-management-secret",
            "sb_secret_synthetic-regression-key",
            opener=missing_object_gateway,
        )

        self.assertIsNone(api.download_object("team-1/missing.pdf"))

    def test_storage_all_other_400_envelopes_fail_closed_without_body_leak(self) -> None:
        bodies = (
            b'{"error":"permission_denied","statusCode":"404"}',
            b'{"error":"not_found","statusCode":"403"}',
            b'{"error":"not_found","statusCode":404}',
            b"non-json-sensitive-provider-body",
            b'{"error":"not_found","statusCode":"404","padding":"'
            + (b"x" * setup_db.MAX_ERROR_BODY_BYTES)
            + b'"}',
        )

        for body in bodies:
            with self.subTest(body_length=len(body)):
                def rejected_gateway(*_args: object, **_kwargs: object) -> object:
                    raise urllib.error.HTTPError(
                        url="https://synthetic.supabase.co/storage/v1/object/treinos/test.pdf",
                        code=400,
                        msg="storage envelope",
                        hdrs=None,
                        fp=io.BytesIO(body),
                    )

                api = setup_db.SupabaseHttpApi(
                    "synthetic-management-secret",
                    "sb_secret_synthetic-regression-key",
                    opener=rejected_gateway,
                )
                with self.assertRaises(setup_db.BootstrapError) as raised:
                    api.download_object("team-1/test.pdf")

                self.assertEqual(
                    str(raised.exception),
                    "Supabase Storage returned HTTP 400",
                )
                self.assertNotIn("provider-body", str(raised.exception))

    def test_storage_plain_http_404_remains_a_missing_object(self) -> None:
        def missing_object_gateway(*_args: object, **_kwargs: object) -> object:
            raise urllib.error.HTTPError(
                url="https://synthetic.supabase.co/storage/v1/object/treinos/missing.pdf",
                code=404,
                msg="not found",
                hdrs=None,
                fp=io.BytesIO(b"discarded-provider-body"),
            )

        api = setup_db.SupabaseHttpApi(
            "synthetic-management-secret",
            "sb_secret_synthetic-regression-key",
            opener=missing_object_gateway,
        )

        self.assertIsNone(api.download_object("team-1/missing.pdf"))

    def test_cli_apply_uses_server_only_credentials_without_printing_them(self) -> None:
        stdout = io.StringIO()
        stderr = io.StringIO()
        sensitive_pat = "synthetic-management-secret"
        sensitive_service_key = "synthetic-service-secret"

        class Remote:
            def preflight(self) -> None:
                return None

            def download_pdf(self, storage_path: str) -> bytes | None:
                asset = next(
                    item
                    for item in self.bundle.assets
                    if item.storage_path == storage_path
                )
                return asset.local_file.read_bytes()

            def upload_pdf(self, _asset: setup_db.Asset) -> None:
                raise AssertionError("equal PDF should not be uploaded")

            def upsert_content(self, _bundle: setup_db.BootstrapBundle) -> None:
                return None

            def verify(
                self, bundle: setup_db.BootstrapBundle
            ) -> dict[str, int | str]:
                return {
                    "storage_object_count": 3,
                    "workout_count": 3,
                    "workout_plan_count": 3,
                    "verified_bundle_sha256": bundle.bundle_sha256,
                }

        remote = Remote()

        def factory(pat: str, service_key: str) -> Remote:
            self.assertEqual(pat, sensitive_pat)
            self.assertEqual(service_key, sensitive_service_key)
            remote.bundle = setup_db.build_bundle(
                self.pdf_root,
                self.plans_dir,
                expected_count=3,
            )
            return remote

        exit_code = setup_db.main(
            [
                "--pdf-root",
                str(self.pdf_root),
                "--plans-dir",
                str(self.plans_dir),
                "--apply",
            ],
            environ={
                "SUPABASE_PAT": sensitive_pat,
                "SUPABASE_SERVICE_ROLE_KEY": sensitive_service_key,
            },
            expected_count=3,
            stdout=stdout,
            stderr=stderr,
            remote_factory=factory,
        )

        self.assertEqual(exit_code, 0)
        self.assertEqual(json.loads(stdout.getvalue())["mode"], "apply")
        combined = stdout.getvalue() + stderr.getvalue()
        self.assertNotIn(sensitive_pat, combined)
        self.assertNotIn(sensitive_service_key, combined)

    def test_verify_only_performs_no_upload_or_database_upsert(self) -> None:
        bundle = setup_db.build_bundle(
            self.pdf_root,
            self.plans_dir,
            expected_count=3,
        )

        class ReadOnlyRemote:
            def preflight(self) -> None:
                return None

            def download_pdf(self, _storage_path: str) -> bytes | None:
                raise AssertionError("run_bootstrap should delegate verification")

            def upload_pdf(self, _asset: setup_db.Asset) -> None:
                raise AssertionError("verify-only attempted a storage write")

            def upsert_content(self, _bundle: setup_db.BootstrapBundle) -> None:
                raise AssertionError("verify-only attempted a database write")

            def verify(
                self, expected: setup_db.BootstrapBundle
            ) -> dict[str, int | str]:
                return {
                    "storage_object_count": 3,
                    "workout_count": 3,
                    "workout_plan_count": 3,
                    "verified_bundle_sha256": expected.bundle_sha256,
                }

        report = setup_db.run_bootstrap(
            bundle,
            remote=ReadOnlyRemote(),
            verify_only=True,
        )

        self.assertEqual(report["mode"], "verify-only")
        self.assertTrue(report["remote_verified"])

    def test_cli_exposes_read_only_remote_verification_mode(self) -> None:
        stdout = io.StringIO()
        stderr = io.StringIO()

        class Remote:
            def preflight(self) -> None:
                return None

            def verify(
                self, bundle: setup_db.BootstrapBundle
            ) -> dict[str, int | str]:
                return {
                    "storage_object_count": 3,
                    "workout_count": 3,
                    "workout_plan_count": 3,
                    "verified_bundle_sha256": bundle.bundle_sha256,
                }

        exit_code = setup_db.main(
            [
                "--pdf-root",
                str(self.pdf_root),
                "--plans-dir",
                str(self.plans_dir),
                "--verify-only",
            ],
            environ={
                "SUPABASE_PAT": "synthetic-management-secret",
                "SUPABASE_SERVICE_ROLE_KEY": "synthetic-service-secret",
            },
            expected_count=3,
            stdout=stdout,
            stderr=stderr,
            remote_factory=lambda _pat, _key: Remote(),
        )

        self.assertEqual(exit_code, 0)
        self.assertEqual(json.loads(stdout.getvalue())["mode"], "verify-only")


if __name__ == "__main__":
    unittest.main()
