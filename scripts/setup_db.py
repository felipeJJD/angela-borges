# Setup inicial: upload PDFs -> Storage, seed workouts, cria admin.
# Service key obtida via Management API e usada apenas em memoria.
import os, re, sys, json, unicodedata, requests

PAT = os.environ["SUPABASE_PAT"]
REF = "avkmryapdiwsgwbvgkwe"
BASE = f"https://api.supabase.com/v1/projects/{REF}"
PROJECT_URL = f"https://{REF}.supabase.co"
ROOT = r"C:\Users\<usuario>\Projetos\angela-app\drive-material\Treinos - Angela Borges"

mgmt = {"Authorization": f"Bearer {PAT}"}

# 1. service role key (ephemeral)
keys = requests.get(f"{BASE}/api-keys?reveal=true", headers=mgmt).json()
service_key = next(k["api_key"] for k in keys if k["name"] == "service_role")
anon_key = next(k["api_key"] for k in keys if k["name"] == "anon")
print("anon key (publica, vai no .env):", anon_key)

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s

def team1_order(name):
    n = name.upper()
    if "INICIANTES 1" in n: return 1, "Treino Iniciante 1"
    if "INICIANTES 2" in n: return 2, "Treino Iniciante 2"
    if "INTERMEDI" in n: return 3, "Treino Intermediário"
    m = re.search(r"AVAN[ÇC]ADOS? (\d+)", n)
    return 3 + int(m.group(1)), f"Treino Avançado {m.group(1)}"

manifest = []
for team, folder in [(1, "Team 1.0"), (2, "Team 2.0"), (3, "Team 3.0")]:
    files = sorted(os.listdir(os.path.join(ROOT, folder)))
    entries = []
    for f in files:
        if not f.lower().endswith(".pdf"): continue
        if team == 1:
            order, title = team1_order(f)
        elif team == 2:
            m = re.search(r"AVAN[ÇC]ADOS? (\d+)", f.upper())
            order = int(m.group(1)) - 9
            title = f"Treino Avançado {m.group(1)}"
        else:
            m = re.search(r"#(\d+)", f)
            order = int(m.group(1))
            title = f"Treino #{m.group(1).zfill(2)}"
        path = f"team-{team}/{slug(os.path.splitext(f)[0])}.pdf"
        entries.append((order, title, path, os.path.join(ROOT, folder, f)))
    entries.sort()
    manifest += [(team, *e) for e in entries]

# 2. upload PDFs
sb = {"Authorization": f"Bearer {service_key}"}
for team, order, title, path, local in manifest:
    with open(local, "rb") as fh:
        r = requests.post(f"{PROJECT_URL}/storage/v1/object/treinos/{path}",
                          headers={**sb, "Content-Type": "application/pdf", "x-upsert": "true"},
                          data=fh.read())
    status = "ok" if r.status_code == 200 else f"FAIL {r.status_code} {r.text[:100]}"
    print(f"[T{team} #{order:02d}] {title} -> {path} {status}")
    if r.status_code != 200: sys.exit(1)

# 3. seed workouts
values = ",\n".join(
    f"({team}, '{title.replace(chr(39), chr(39)*2)}', '{path}', {order})"
    for team, order, title, path, _ in manifest)
seed = f"delete from public.workouts;\ninsert into public.workouts (team, title, pdf_path, sort_order) values\n{values};"
r = requests.post(f"{BASE}/database/query", headers={**mgmt, "Content-Type": "application/json"},
                  json={"query": seed})
print("seed workouts:", r.status_code, r.text[:200])

# 4. admin user
admin_email = "admin@angelaborges.app"
admin_pass = os.environ["ADMIN_PASS"]
r = requests.post(f"{PROJECT_URL}/auth/v1/admin/users",
                  headers={**sb, "apikey": service_key, "Content-Type": "application/json"},
                  json={"email": admin_email, "password": admin_pass, "email_confirm": True,
                        "user_metadata": {"full_name": "Angela Borges", "role": "admin"}})
print("admin user:", r.status_code, r.text[:200])

# 5. validacao
r = requests.post(f"{BASE}/database/query", headers={**mgmt, "Content-Type": "application/json"},
                  json={"query": "select team, count(*) from public.workouts group by team order by team; "})
print("workouts por team:", r.text)
r = requests.post(f"{BASE}/database/query", headers={**mgmt, "Content-Type": "application/json"},
                  json={"query": "select count(*) as pdfs from storage.objects where bucket_id='treinos';"})
print("pdfs no storage:", r.text)
r = requests.post(f"{BASE}/database/query", headers={**mgmt, "Content-Type": "application/json"},
                  json={"query": "select email, (select role from public.profiles p where p.id=u.id) as role from auth.users u;"})
print("users:", r.text)
