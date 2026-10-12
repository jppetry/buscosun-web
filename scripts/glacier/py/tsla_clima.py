"""Snow-line climatology per glacier from TSLA (Sommer et al., Zenodo 18223929, CC BY 4.0): the transient snow-line altitudes 2000–2025 of the glaciers
> 1 km² in the Alps, matched to the catalogue (centroid ≤ 800 m, area ratio within 2 — RGI 7 and SGI2016/AGI 5 outline the same glacier differently),
reduced to weekly quantiles of the snow-line altitude (days of year 120 … 300) for the "Saison" tab: "350 m higher than usual for early August".

  python -I tsla_clima.py <catalog.json> <out dir>      → <out>/clima/<region>.json

Only observations with QA flag ≥ 0.5 count, the corrected altitude `SLA_CORR` is used. A week bin needs ≥ 15 observations, otherwise it is null.
"""
import csv
import io
import json
import math
import os
import sys
import zipfile

RAW = "C:/dev/buscosun-glacier-cache/raw/"
BASE = "transient_snow_line_altitudes_of_glaciers_europ_alps/"
DOY0, DOY1, BIN = 120, 300, 7


def hav(lon1, lat1, lon2, lat2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def quant(v, q):
    v = sorted(v)
    i = (len(v) - 1) * q
    lo, hi = int(math.floor(i)), int(math.ceil(i))
    return v[lo] + (v[hi] - v[lo]) * (i - lo)


def main(cat_path, out_dir):
    cat = json.load(open(cat_path, encoding="utf-8"))
    builds = cat["build"]
    gls = [g for g in cat["glaciers"] if g["country"] != "DE" and g["klass"] == "A"]
    z = zipfile.ZipFile(RAW + "tsla/TABLES.zip")
    stats = list(csv.DictReader(io.StringIO(z.read(BASE + "02_end_of_summer_glacier_snow_lines/Alps_Glacier_EoS_SLA_2000-2025_stats.csv").decode("utf-8", "replace"))))
    names = set(z.namelist())
    nbin = -(-(DOY1 - DOY0) // BIN)
    by_region = {}
    matched = 0
    for s in stats:
        key = s["rgi_id"].replace("RGI2000-v7.0-G-", "")
        lon, lat, area = float(s["cenlon"]), float(s["cenlat"]), float(s["area_km2"])
        best = None
        for g in gls:
            d = hav(lon, lat, g["lon"], g["lat"])
            if d <= 800 and 0.5 <= g["area"]["km2"] / area <= 2.0 and (best is None or d < best[0]):
                best = (d, g)
        if not best:
            continue
        name = BASE + f"01_glacier_snow_lines/11-01_RGI2000-v7.0-G-{key}.csv"
        if name not in names:
            continue
        g = best[1]
        bins = [[] for _ in range(nbin)]
        n = 0
        for r in csv.DictReader(io.StringIO(z.read(name).decode("utf-8", "replace"))):
            try:
                doy, sla, qa = int(float(r["Doy"])), float(r["SLA_CORR"]), float(r["QA_FLAG"])
            except (ValueError, KeyError):
                continue
            if qa < 0.5 or doy < DOY0 or doy >= DOY0 + nbin * BIN:
                continue
            bins[(doy - DOY0) // BIN].append(sla)
            n += 1
        weeks = [[round(quant(b, 0.1)), round(quant(b, 0.5)), round(quant(b, 0.9)), len(b)] if len(b) >= 15 else None for b in bins]
        by_region.setdefault(g["region"], {})[g["id"]] = {"rgi7": key, "n": n, "weeks": weeks}
        matched += 1
    os.makedirs(os.path.join(out_dir, "clima"), exist_ok=True)
    total = 0
    for region, d in by_region.items():
        p = os.path.join(out_dir, "clima", f"{region}.json")
        json.dump({"schema": 1, "kind": "glacier/clima", "build": builds, "region": region, "doy0": DOY0, "bin": BIN, "cols": ["p10", "p50", "p90", "n"],
                   "source": "TSLA 2000–2025 (Sommer et al. 2026, Zenodo 18223929, CC BY 4.0): transiente Schneegrenzen, QA ≥ 0,5, SLA_CORR; Wochen ab Tag 120",
                   "glaciers": d}, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        total += os.path.getsize(p)
    print("tsla matched:", matched, "regions:", len(by_region), "bytes:", total)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
