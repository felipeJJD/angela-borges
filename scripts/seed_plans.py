# Seed/atualização da tabela workout_plans a partir de scripts/plans/*.json.
# Idempotente (upsert por workout_id). Uso: SUPABASE_PAT=... python3 scripts/seed_plans.py
import glob
import json
import os
import urllib.request

PAT = os.environ["SUPABASE_PAT"]
REF = "avkmryapdiwsgwbvgkwe"
API = f"https://api.supabase.com/v1/projects/{REF}"
UA = "angela-borges-setup/1.0"
PLANS_DIR = os.path.join(os.path.dirname(__file__), "plans")


def mgmt_query(sql):
    req = urllib.request.Request(
        f"{API}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {PAT}",
                 "Content-Type": "application/json", "User-Agent": UA},
        method="POST")
    return json.loads(urllib.request.urlopen(req).read().decode())


def main():
    workouts = mgmt_query("select id, pdf_path from workouts")
    by_path = {w["pdf_path"]: w["id"] for w in workouts}

    files = sorted(glob.glob(os.path.join(PLANS_DIR, "treino-*.json")))
    stmts = []
    for f in files:
        doc = json.load(open(f))
        wid = by_path.get(doc["pdf_path"])
        if not wid:
            raise SystemExit(f"workout não encontrado para {doc['pdf_path']}")
        payload = json.dumps(doc["plan"], ensure_ascii=False)
        if "$plan$" in payload:
            raise SystemExit(f"payload contém $plan$: {f}")
        stmts.append(
            f"insert into public.workout_plans (workout_id, plan, updated_at)\n"
            f"values ('{wid}', $plan${payload}$plan$::jsonb, now())\n"
            f"on conflict (workout_id) do update set plan = excluded.plan, "
            f"updated_at = now();")

    BATCH = 5
    for i in range(0, len(stmts), BATCH):
        mgmt_query("\n".join(stmts[i:i + BATCH]))
        print(f"upsert {min(i + BATCH, len(stmts))}/{len(stmts)}")

    n = mgmt_query("select count(*) as n from workout_plans")[0]["n"]
    print(f"workout_plans: {n} linhas")


if __name__ == "__main__":
    main()
