# Extração one-time dos planos de treino a partir dos PDFs do bucket `treinos`.
# Gera scripts/plans/<slug>.json (revisáveis, commitados) + scripts/plans/_audit.txt.
# Service key obtida via Management API e usada apenas em memória (padrão setup_db.py).
# Uso: SUPABASE_PAT=... /tmp/ab-venv/bin/python scripts/extract_plans.py
#
# Os 34 PDFs vêm de templates Canva heterogêneos:
#  - dias rotulados por dia da semana OU "TREINO A..F"
#  - headers de coluna com/sem acento, às vezes ausentes
#  - alguns PDFs com texto espaçado letra a letra ("C A D E I R A")
# Por isso o matching usa texto "folded" (sem acento/espaço) a nível de caractere,
# e zonas de coluna caem para frações da largura quando o header não existe.
import io
import json
import os
import re
import unicodedata
import urllib.request

from pypdf import PdfReader

PAT = os.environ["SUPABASE_PAT"]
REF = "avkmryapdiwsgwbvgkwe"
API = f"https://api.supabase.com/v1/projects/{REF}"
PROJECT_URL = f"https://{REF}.supabase.co"
UA = "angela-borges-setup/1.0"
OUT_DIR = os.path.join(os.path.dirname(__file__), "plans")
PDF_CACHE = "/tmp/ab-pdfs"

WEEKDAYS = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO", "DOMINGO"]
WEEKDAY_LABEL = {
    "SEGUNDA": "SEGUNDA-FEIRA", "TERCA": "TERÇA-FEIRA", "QUARTA": "QUARTA-FEIRA",
    "QUINTA": "QUINTA-FEIRA", "SEXTA": "SEXTA-FEIRA", "SABADO": "SÁBADO",
    "DOMINGO": "DOMINGO",
}
# frações da largura para âncoras de coluna quando o header não existe na página
DEFAULT_ANCHORS = {"sets": 0.37, "reps": 0.50, "rest": 0.62, "notes": 0.81}


def http(url, data=None, headers=None):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode() if data is not None else None,
        headers={"User-Agent": UA, **(headers or {})},
        method="POST" if data is not None else "GET",
    )
    return urllib.request.urlopen(req).read()


def mgmt_query(sql):
    body = http(
        f"{API}/database/query",
        data={"query": sql},
        headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
    )
    return json.loads(body.decode())


def mat_mult(t, c):
    a, b, c2, d, e, f = t
    A, B, C, D, E, F = c
    return (a * A + b * C, a * B + b * D, c2 * A + d * C, c2 * B + d * D,
            e * A + f * C + E, e * B + f * D + F)


def fold(s):
    """Maiúsculas, sem acentos."""
    s = unicodedata.normalize("NFKD", s)
    return "".join(ch for ch in s if not unicodedata.combining(ch)).upper()


def despace(s):
    """Conserta texto letra-a-letra: 'C A D E I R A  F L E X O R A' -> 'CADEIRA FLEXORA'."""
    tokens = s.split(" ")
    singles = sum(1 for t in tokens if len(t) == 1)
    if len(tokens) >= 4 and singles / len(tokens) > 0.55:
        parts = re.split(r"\s{2,}", s)
        return " ".join("".join(p.split()) for p in parts if p.strip())
    return re.sub(r"\s+", " ", s).strip()


def page_data(page):
    frags = []

    def vis(text, cm, tm, fd, fs):
        t = unicodedata.normalize("NFC", text).rstrip("\n")
        if not t.strip():
            return
        m = mat_mult(tm, cm)
        eff = abs(m[3]) or abs(m[1]) or 1.0
        size = (fs or 1.0) * eff if (fs or 0) < 4 else (fs or 10.0)
        frags.append({"y": m[5], "x": m[4], "size": size, "t": t})

    page.extract_text(visitor_text=vis)

    links = []
    for a in page.get("/Annots") or []:
        o = a.get_object()
        act = o.get("/A")
        if act and act.get("/URI"):
            x0, y0, x1, y1 = (float(v) for v in o["/Rect"])
            links.append({"url": str(act["/URI"]),
                          "cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2})
    return frags, links


def to_lines(frags, tol=2.5):
    lines = []
    for f in sorted(frags, key=lambda f: (-f["y"], f["x"])):
        target = None
        for ln in lines:
            if abs(ln["y"] - f["y"]) <= tol:
                target = ln
                break
        if target:
            target["frags"].append(f)
        else:
            lines.append({"y": f["y"], "frags": [f]})
    for ln in lines:
        ln["frags"].sort(key=lambda f: f["x"])
        raw = " ".join(f["t"].strip() for f in ln["frags"] if f["t"].strip())
        ln["text"] = despace(raw)
        # string compacta (sem espaços, folded) com x do primeiro char de cada posição
        chars, xs = [], []
        for f in ln["frags"]:
            ft = fold(f["t"])
            step = f["size"] * 0.55 or 5
            for i, ch in enumerate(ft):
                if ch.isspace():
                    continue
                chars.append(ch)
                xs.append(f["x"] + i * step)
        ln["compact"] = "".join(chars)
        ln["cxs"] = xs
    lines.sort(key=lambda l: -l["y"])
    return lines


def find_in_line(ln, needle):
    """Retorna x central aproximado do needle (folded, sem espaço) na linha."""
    i = ln["compact"].find(needle)
    if i < 0:
        return None
    j = min(i + len(needle) - 1, len(ln["cxs"]) - 1)
    return (ln["cxs"][i] + ln["cxs"][j]) / 2


def day_label_of(lines):
    """(label, y) do rótulo do dia: dia da semana ou TREINO A..F."""
    for ln in lines:
        for wd in WEEKDAYS:
            pos = ln["compact"].find(wd)
            if pos >= 0:
                # evita falso positivo tipo 'TREINOAVANCADO' contendo nada
                return WEEKDAY_LABEL[wd], ln["y"]
    for ln in lines:
        m = re.search(r"TREINO([A-F])(?![A-Z])", ln["compact"])
        if m and "TREINOAVANCADO" not in ln["compact"] and \
                "TREINOINICIANTE" not in ln["compact"]:
            return f"TREINO {m.group(1)}", ln["y"]
    return None, None


HEADER_PATTERNS = {
    "intervalos": r"INTERVALOS ENTRE AS SERIES:?\s*(.+)",
    "velocidade": r"VELOCIDADE:?\s*(.+)",
    "pausa": r"PAUSA ENTRE OS EXERCICIOS:?\s*(.+)",
    "metodo": r"METODO:?\s*(.+)",
    "aquecimento": r"(AQUECIMENTO DE .+)",
    "objetivo_geral": r"OBJETIVO GERAL:?\s*(.+)",
    "objetivo_especifico": r"OBJETIVO ESPECIFICO:?\s*(.+)",
}


def parse_header_fields(lines):
    """Extrai campos do cabeçalho preservando o texto original (com acentos)."""
    out = {}
    for ln in lines:
        folded = fold(ln["text"])
        for key, pat in HEADER_PATTERNS.items():
            m = re.match(pat, folded)
            if m and key not in out:
                # recorta o valor do texto original pela posição do match folded
                start = len(folded) - len(m.group(1))
                out[key] = ln["text"][start:].strip()
    out.pop("aquecimento_dup", None)
    return out


def parse_page(page, audit, page_no):
    frags, links = page_data(page)
    lines = to_lines(frags)
    full_compact = "".join(ln["compact"] for ln in lines)
    width = float(page.mediabox.width)

    header = parse_header_fields(lines)
    label, label_y = day_label_of(lines)

    if label is None and "NAOAVANCE" in full_compact:
        body = [ln["text"] for ln in lines if ln["y"] < 700]
        return {"kind": "intro", "intro": "\n".join(body), "header": header,
                "links": links}

    # header de colunas
    col, header_y = {}, None
    for ln in lines:
        x = find_in_line(ln, "SERIES")
        # ignora 'INTERVALOS ENTRE AS SERIES' e '3 SERIES DE...'
        if x is not None and "INTERVALO" not in ln["compact"] and (
                ln["compact"].startswith("N") or ln["compact"].startswith("SERIES")):
            col["sets"] = x
            header_y = ln["y"] if header_y is None else max(header_y, ln["y"])
        x = find_in_line(ln, "REPETICOES") or find_in_line(ln, "NREP")
        if x is not None and ("NREPETICOES" in ln["compact"]
                              or "NREP" in ln["compact"]
                              or ln["compact"].startswith("REPETICOES")):
            col["reps"] = x
            header_y = ln["y"] if header_y is None else max(header_y, ln["y"])
        x = find_in_line(ln, "DESCANSO")
        if x is not None and len(ln["compact"]) < 60 and (
                "OBSERVA" in ln["compact"] or "REPETICOES" in ln["compact"]
                or ln["compact"] == "DESCANSO"):
            col["rest"] = x
        x = find_in_line(ln, "OBSERVA")
        if x is not None:
            col["notes"] = x
            header_y = ln["y"] if header_y is None else max(header_y, ln["y"])
        x = find_in_line(ln, "EXERCICIOS")
        if x is not None and ln["compact"].startswith("EXERCICIOS"):
            col["name"] = x

    has_table_header = header_y is not None and ("sets" in col or "notes" in col)
    # template 2 colunas (EXERCÍCIOS + OBSERVAÇÃO, sem séries/reps no PDF)
    two_col = has_table_header and "sets" not in col and "reps" not in col \
        and "notes" in col

    # página de descanso: tem rótulo de dia (ou SABADO E DOMINGO) e nenhuma tabela
    if not has_table_header or not links:
        is_resty = ("DESCANSO" in full_compact or "AEROBIO" in full_compact
                    or "CARDIO" in full_compact)
        if is_resty and label is not None:
            body = []
            for ln in lines:
                if label_y is not None and ln["y"] >= label_y - 4:
                    continue
                c = ln["compact"]
                if c.startswith("TREINO") and ("AVANCADO" in c or "INICIANTE" in c
                                               or "INTERMEDIARIO" in c or "#" in ln["text"]):
                    continue
                body.append(ln["text"])
            if links:
                audit.append(
                    f"  AVISO: p{page_no} descanso com {len(links)} link(s) — warmup")
            return {"kind": "descanso", "weekday": label,
                    "rest_text": "\n".join(body).strip(), "header": header,
                    "links": links,
                    "warmup": links[0]["url"] if links else None}
        return {"kind": "other", "header": header, "links": links, "label": label}

    # âncoras de coluna; ausentes -> fração da largura
    if two_col:
        name_anchor = col.get("name", 0.28 * width)
        mid = (name_anchor + col["notes"]) / 2
        bounds = {"name": (-(10 ** 6), mid), "notes": (mid, 10 ** 6)}
    else:
        anchors = {}
        for z in ("sets", "reps", "rest", "notes"):
            if z in col:
                anchors[z] = col[z]
        for z, frac in DEFAULT_ANCHORS.items():
            if z not in anchors and (z != "rest" or "rest" in col):
                anchors[z] = frac * width
        ordered = sorted(anchors.items(), key=lambda kv: kv[1])
        name_end = ordered[0][1] - 0.06 * width
        edges = [name_end] + [
            (ordered[i][1] + ordered[i + 1][1]) / 2 for i in range(len(ordered) - 1)
        ] + [10 ** 6]
        bounds = {"name": (-(10 ** 6), name_end)}
        for i, (z, _) in enumerate(ordered):
            bounds[z] = (edges[i], edges[i + 1])

    def zone_of(xc):
        for z, (lo, hi) in bounds.items():
            if lo <= xc < hi:
                return z
        return "notes"

    # foco do dia: linhas entre o header de colunas e o rótulo do dia
    focus = None
    if label_y is not None:
        cand = []
        for ln in lines:
            if header_y + 3 < ln["y"] < label_y - 2:
                t = ln["text"].strip()
                c = ln["compact"]
                if (t and not c.startswith("CLIQUE") and "AQUECIMENTO" not in c
                        and not c.startswith("TREINOAVANCADO")
                        and not c.startswith("TREINOINICIANTE")
                        and not c.startswith("PARAASSISTIR")
                        and not c.startswith("ASSISTIR")
                        and not c.startswith("VIDEO")
                        and not c.startswith("DOEXERCICIO")
                        and not c.startswith("LADODECADA")
                        and not c.startswith("EXERCICIO")
                        and not c.startswith("AEXPLICACAO")
                        and not c.startswith("ESTRUTURADO")
                        and not re.match(r"TREINO[A-F]$", c)
                        and len(t) < 60):
                    cand.append(t)
        if cand:
            focus = cand[0]

    # warmup: link acima do header da tabela
    warmup = None
    table_links = []
    for lk in links:
        if lk["cy"] > header_y:
            if "AQUECIMENTO" in full_compact and warmup is None:
                warmup = lk["url"]
            else:
                audit.append(
                    f"  FLAG: p{page_no} link acima da tabela sem destino: {lk['url']}")
        else:
            table_links.append(lk)

    name_links = [lk for lk in table_links if zone_of(lk["cx"]) == "name"]
    other_links = [lk for lk in table_links if zone_of(lk["cx"]) != "name"]
    if not name_links:
        audit.append(f"  FLAG: p{page_no} tabela sem links na coluna de nomes")
        return {"kind": "other", "header": header, "links": links, "label": label}

    name_links.sort(key=lambda l: -l["cy"])
    clusters = []
    for lk in name_links:
        if clusters and clusters[-1][-1]["cy"] - lk["cy"] < 40:
            clusters[-1].append(lk)
        else:
            clusters.append([lk])

    centers = [sum(l["cy"] for l in c) / len(c) for c in clusters]
    band_edges = [header_y - 3]
    for i in range(len(centers) - 1):
        band_edges.append((centers[i] + centers[i + 1]) / 2)
    band_edges.append(-(10 ** 6))

    exercises = []
    placed = 1 if warmup else 0
    for i, cluster in enumerate(clusters):
        top, bot = band_edges[i], band_edges[i + 1]
        cells = {"name": [], "sets": [], "reps": [], "rest": [], "notes": []}
        for ln in lines:
            if not (bot < ln["y"] <= top):
                continue
            # agrupa frags contíguos da linha por zona
            for f in ln["frags"]:
                t = f["t"].strip()
                if not t:
                    continue
                xc = f["x"] + len(t) * f["size"] * 0.27
                cells[zone_of(xc)].append((ln["y"], f["x"], t))

        def cell_text(z, multiline=False):
            items = sorted(cells[z], key=lambda c: (-c[0], c[1]))
            rows, cur_y = [], None
            for y, x, t in items:
                if cur_y is None or abs(y - cur_y) > 2.5:
                    rows.append([t])
                    cur_y = y
                else:
                    rows[-1].append(t)
            row_texts = [despace(" ".join(r)) for r in rows]
            return ("\n".join if multiline else " ".join)(
                [r for r in row_texts if r]).strip()

        name = despace(cell_text("name"))
        sets_txt = cell_text("sets")
        m = re.search(r"\d+", sets_txt)
        sets = int(m.group(0)) if m else None
        reps = cell_text("reps", multiline=True)
        rest = cell_text("rest") or None
        notes = cell_text("notes", multiline=True) or None
        if notes in ("-", "—"):
            notes = None
        if rest in ("-", "—"):
            rest = None
        if reps in ("-", "—"):
            reps = ""

        ex = {"name": name, "sets": sets, "reps": reps,
              "video_urls": [lk["url"] for lk in cluster]}
        if rest:
            ex["rest"] = rest
        if notes:
            ex["notes"] = notes

        for lk in other_links:
            if bot < lk["cy"] <= top:
                z = zone_of(lk["cx"])
                if z in ("reps", "sets"):
                    ex["reps_video_url"] = lk["url"]
                else:
                    ex["notes_video_url"] = lk["url"]
                placed += 1
        placed += len(cluster)

        if not name:
            audit.append(f"  FLAG: p{page_no} exercício sem nome "
                         f"(links {[l['url'][-8:] for l in cluster]})")
        if not two_col:
            if sets is None:
                audit.append(f"  FLAG: p{page_no} '{name}': séries não numérico "
                             f"({sets_txt!r})")
            if not reps:
                audit.append(f"  FLAG: p{page_no} '{name}': repetições vazias")
        exercises.append(ex)

    day = {"weekday": label or f"DIA {page_no}", "kind": "treino",
           "exercises": exercises}
    if focus:
        day["focus"] = focus
    if warmup:
        day["warmup_video_url"] = warmup
    return {"kind": "treino", "day": day, "header": header,
            "links": links, "placed": placed}


def fetch_pdf(path, service_key):
    os.makedirs(PDF_CACHE, exist_ok=True)
    cache = os.path.join(PDF_CACHE, path.replace("/", "__"))
    if os.path.exists(cache):
        return open(cache, "rb").read()
    data = http(
        f"{PROJECT_URL}/storage/v1/object/treinos/{path}",
        headers={"Authorization": f"Bearer {service_key}", "apikey": service_key},
    )
    open(cache, "wb").write(data)
    return data


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    keys = json.loads(http(
        f"{API}/api-keys?reveal=true",
        headers={"Authorization": f"Bearer {PAT}"},
    ).decode())
    service_key = next(k["api_key"] for k in keys if k["name"] == "service_role")

    workouts = mgmt_query(
        "select id, team, title, pdf_path from workouts order by team, sort_order")

    audit_all = []
    for w in workouts:
        slug = os.path.splitext(os.path.basename(w["pdf_path"]))[0]
        audit = [f"{w['team']}/{w['title']}  ({w['pdf_path']})"]
        reader = PdfReader(io.BytesIO(fetch_pdf(w["pdf_path"], service_key)))

        plan = {"version": 1, "header": {}, "days": []}
        total_links = 0
        total_placed = 0
        by_label = {}
        for pi, page in enumerate(reader.pages):
            try:
                res = parse_page(page, audit, pi + 1)
            except Exception as e:
                audit.append(f"  FLAG: p{pi + 1} erro de parse: {e!r}")
                continue
            total_links += len(res.get("links", []))
            for k, v in res.get("header", {}).items():
                plan["header"].setdefault(k, v)
            if res["kind"] == "intro":
                plan["header"]["intro"] = res["intro"]
            elif res["kind"] == "descanso":
                day = {"weekday": res["weekday"], "kind": "descanso",
                       "rest_text": res["rest_text"]}
                if res.get("warmup"):
                    day["warmup_video_url"] = res["warmup"]
                    total_placed += 1
                plan["days"].append(day)
            elif res["kind"] == "treino":
                lab = res["day"]["weekday"]
                if lab in by_label:
                    by_label[lab]["exercises"].extend(res["day"]["exercises"])
                    audit.append(f"  AVISO: {lab} em mais de uma página (merge)")
                else:
                    by_label[lab] = res["day"]
                    plan["days"].append(res["day"])
                total_placed += res.get("placed", 0)
            else:
                if res.get("links"):
                    audit.append(f"  FLAG: p{pi + 1} não classificada "
                                 f"(label={res.get('label')}) com "
                                 f"{len(res['links'])} link(s)")

        days_treino = [d for d in plan["days"] if d["kind"] == "treino"]
        n_ex = sum(len(d["exercises"]) for d in days_treino)
        audit.append(
            f"  páginas={len(reader.pages)} dias={len(plan['days'])} "
            f"(treino={len(days_treino)}) exercícios={n_ex} "
            f"links_pdf={total_links} links_json={total_placed}")
        if total_links != total_placed:
            audit.append(f"  FLAG: paridade de links {total_placed}/{total_links}")
        for d in days_treino:
            if not d["exercises"]:
                audit.append(f"  FLAG: {d['weekday']} sem exercícios")
            for ex in d["exercises"]:
                if not ex["video_urls"]:
                    audit.append(f"  FLAG: '{ex['name']}' sem vídeo")
                for u in (ex["video_urls"]
                          + [ex.get(k) for k in ("reps_video_url", "notes_video_url")
                             if ex.get(k)]):
                    if "youtu" not in u:
                        audit.append(f"  FLAG: URL não-YouTube: {u}")

        with open(os.path.join(OUT_DIR, slug + ".json"), "w") as fh:
            json.dump({"pdf_path": w["pdf_path"], "plan": plan},
                      fh, ensure_ascii=False, indent=2)
        audit_all.extend(audit)
        flags = sum(1 for a in audit if "FLAG" in a)
        print(f"{w['pdf_path']}: dias={len(plan['days'])} ex={n_ex} "
              f"links {total_placed}/{total_links} flags={flags}")

    with open(os.path.join(OUT_DIR, "_audit.txt"), "w") as fh:
        fh.write("\n".join(audit_all) + "\n")
    nflag = sum(1 for a in audit_all if "FLAG" in a)
    print(f"\naudit: {nflag} flags -> {os.path.join(OUT_DIR, '_audit.txt')}")


if __name__ == "__main__":
    main()
