"""Truth tables for Gate B1 (audit/gletscher/claims-frozen.md B1-1 … B1-3): GLAMOS equilibrium-line altitudes and the TSLA end-of-summer snow lines,
both matched to the glaciers of the static catalogue.

  python -I b1_truth.py <catalog.json> <out.json>

GLAMOS: `massbalance_observation.csv` (observation period), rows ending in 2023, 2024 or 2025 with a numeric ELA and an AAR between 5 and 95 %, matched by the
SGI id the catalogue carries (`inv.sgi`), class A or B. TSLA (Zenodo 18223929, Sommer et al.): `Alps_Glacier_EoS_SLA_2000-2025.csv` (RGI v7 ids) and
`..._stats.csv` (centroid, area); a TSLA glacier is matched to the catalogue glacier whose centroid is within 800 m and whose area is within a factor 2
(RGI 7 and SGI2016/AGI 5 outline the same glacier differently). Unmatched ones are counted in the output, never guessed.
"""
import csv
import io
import json
import math
import sys
import zipfile

sys.path.insert(0, __file__.replace("\\", "/").rsplit("/", 1)[0])
from glamos_csv import read_glamos_csv, num  # noqa: E402

RAW = "C:/dev/buscosun-glacier-cache/raw/"
YEARS = (2023, 2024, 2025)


def hav(lon1, lat1, lon2, lat2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def main(cat_path, out_path):
    cat = json.load(open(cat_path, encoding="utf-8"))["glaciers"]
    by_sgi = {g["inv"]["sgi"]: g for g in cat if g.get("inv", {}).get("sgi")}
    out = {"glamos": {}, "glamosUnmatched": [], "tsla": {}, "tslaUnmatched": []}
    t = read_glamos_csv(RAW + "glamos/massbalance_observation.csv")
    for r in t["rows"]:
        end = r["end date of observation"]
        y = int(end[:4]) if end[:4].isdigit() else None
        if y not in YEARS:
            continue
        ela, aar, area = num(r["equilibrium line altitude"]), num(r["accumulation area ratio"]), num(r["glacier area"])
        gid = r["glacier id"]
        g = by_sgi.get(gid)
        if ela is None or aar is None:
            continue
        if g is None:
            out["glamosUnmatched"].append({"sgi": gid, "name": r["glacier name"], "year": y, "why": "SGI-Kennung nicht im Katalog"})
            continue
        if g["country"] != "CH" or g["klass"] not in ("A", "B"):
            continue
        out["glamos"].setdefault(g["id"], {})[str(y)] = {"ela": ela, "aar": aar, "area": area, "end": end, "sgi": gid, "counted": 5 <= aar <= 95}
    z = zipfile.ZipFile(RAW + "tsla/TABLES.zip")
    base = "transient_snow_line_altitudes_of_glaciers_europ_alps/02_end_of_summer_glacier_snow_lines/"
    eos = list(csv.reader(io.StringIO(z.read(base + "Alps_Glacier_EoS_SLA_2000-2025.csv").decode("utf-8", "replace"))))
    stats = list(csv.DictReader(io.StringIO(z.read(base + "Alps_Glacier_EoS_SLA_2000-2025_stats.csv").decode("utf-8", "replace"))))
    head = eos[0]
    cols = {h: i for i, h in enumerate(head)}
    s_by = {s["rgi_id"].replace("RGI2000-v7.0-G-", ""): s for s in stats}
    for key, s in s_by.items():
        if key not in cols:
            continue
        lon, lat, area = float(s["cenlon"]), float(s["cenlat"]), float(s["area_km2"])
        best = None
        for g in cat:
            if g["country"] == "DE":
                continue
            d = hav(lon, lat, g["lon"], g["lat"])
            if d <= 800 and 0.5 <= g["area"]["km2"] / area <= 2.0 and (best is None or d < best[0]):
                best = (d, g)
        if best is None:
            out["tslaUnmatched"].append({"rgi7": key, "name": s["glac_name"], "area": area, "lon": lon, "lat": lat})
            continue
        g = best[1]
        series, flags = {}, {}
        for row in eos[1:]:
            v = row[cols[key]] if cols[key] < len(row) else ""
            if not (row and row[0].isdigit()) or v in ("", "NA"):
                continue
            try:
                series[row[0]] = float(v)
            except ValueError:
                flags[row[0]] = v          # 'SO' / 'TO': TSLA's own markers for years without a snow line (kept apart, never a number)
        out["tsla"][g["id"]] = {"rgi7": key, "dM": round(best[0]), "area7": area, "eos": series, "flags": flags}
    json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    n_g = sum(1 for g in out["glamos"].values() for v in g.values() if v["counted"])
    print("glamos glacier-years counted:", n_g, "glaciers:", len(out["glamos"]), "unmatched rows:", len(out["glamosUnmatched"]))
    print("tsla matched:", len(out["tsla"]), "unmatched:", len(out["tslaUnmatched"]))


main(sys.argv[1], sys.argv[2])
