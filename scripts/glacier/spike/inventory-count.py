"""GL-0 spike: count glaciers and area per country and size class (A >= 1 km2, B 0.1-1, C < 0.1) from the raw inventories.

Reads only the cache (C:/dev/buscosun-glacier-cache/raw, outside every repo). Writes the numbers as JSON next to the
audit so the report can quote them. Run with the pinned venv:  .venv/Scripts/python.exe -I inventory-count.py
"""
import io, json, sys, zipfile
from collections import defaultdict

import shapefile  # pyshp

RAW = "C:/dev/buscosun-glacier-cache/raw/"
OUT = sys.argv[1] if len(sys.argv) > 1 else "C:/dev/buscosun-glacier-cache/spike/inventory-count.json"


def klass(a):
    return "A" if a >= 1.0 else ("B" if a >= 0.1 else "C")


def tally(areas, label, year):
    """areas: dict id -> km2 (a glacier with several parts is summed first)."""
    t = {"A": [0, 0.0], "B": [0, 0.0], "C": [0, 0.0]}
    for a in areas.values():
        k = klass(a)
        t[k][0] += 1
        t[k][1] += a
    n = sum(v[0] for v in t.values())
    s = sum(v[1] for v in t.values())
    return {"label": label, "refYear": year, "glaciers": n, "area_km2": round(s, 3),
            "classes": {k: {"n": v[0], "area_km2": round(v[1], 3)} for k, v in t.items()}}


def read_shp(zpath, member):
    z = zipfile.ZipFile(zpath)
    base = member[:-4]
    names = z.namelist()
    return shapefile.Reader(
        shp=io.BytesIO(z.read(base + ".shp")), dbf=io.BytesIO(z.read(base + ".dbf")),
        shx=io.BytesIO(z.read(base + ".shx")) if base + ".shx" in names else None, encoding="latin-1")


res = {}

# CH: SGI2016 (record = glacier part; the SGI id is unique per glacier)
r = read_shp(RAW + "glamos/inventory_sgi2016_r2020.zip", "SGI_2016_glaciers.shp")
cols = [f[0] for f in r.fields[1:]]
areas = defaultdict(float)
years = defaultdict(int)
for rec in r.iterRecords():
    d = dict(zip(cols, rec))
    areas[d["sgi-id"]] += float(d["area_km2"])
    years[int(d["year_acq"])] += 1
res["CH_SGI2016"] = tally(areas, "SGI2016 (swisstopo/GLAMOS)", "2013-2018 (year_acq %s)" % dict(sorted(years.items())))

# AT: GI4 2015 (Shape_Area in m2, nr = glacier number)
r = read_shp(RAW + "gi4/GI_4_2015.zip", "GI_4_2015/GI_4_2015.shp")
cols = [f[0] for f in r.fields[1:]]
areas = defaultdict(float)
for rec in r.iterRecords():
    d = dict(zip(cols, rec))
    areas[d["nr"]] += float(d["Shape_Area"]) / 1e6
res["AT_GI4_2015"] = tally(areas, "GI4 2015 (Buckel & Otto 2018)", "2015")

# AT: AGI5 2021-2023 (GeoJSON, id = glacier id, area in m2; fragments share an id)
z = zipfile.ZipFile(RAW + "agi5/GI5_vector_files.zip")
areas = defaultdict(float)
years = defaultdict(int)
for n in z.namelist():
    if not n.endswith(".geojson"):
        continue
    g = json.loads(z.read(n))
    for f in g["features"]:
        p = f["properties"]
        areas[int(p["id"])] += float(p["area"]) / 1e6
        years[int(p["year"]) if p.get("year") else 0] += 1
res["AT_AGI5"] = tally(areas, "AGI 5 (Hartig et al. 2026)", "2021-2023 (parts per year %s)" % dict(sorted(years.items())))
v = json.load(open(RAW + "agi5/vanishing_glaciers.geojson", encoding="utf-8"))
st = defaultdict(int)
for f in v["features"]:
    st[f["properties"]["status_GI5"]] += 1
res["AT_AGI5_vanishing"] = dict(st)

# Alps (Paul et al. 2020): all countries, to cross-check the three inventories and to find the German glaciers
r = read_shp(RAW + "paul2020/paul2020.zip", "c3s_gi_rgi11_s2_2015_v2/c3s_gi_rgi11_s2_2015_v2.shp")
cols = [f[0] for f in r.fields[1:]]
by = defaultdict(lambda: defaultdict(float))
de_list = []
for rec in r.iterRecords():
    d = dict(zip(cols, rec))
    by[d["Country"]][d["GLACIER_NR"]] += float(d["AREA_KM2"])
    if d["Country"] == "DE":
        de_list.append({"nr": d["GLACIER_NR"], "lat": d["LAT"], "lon": d["LON"], "area_km2": round(float(d["AREA_KM2"]), 4),
                        "zmax": d["ELEV_MAX"]})
for c, a in sorted(by.items()):
    res["Paul2020_" + c] = tally(a, "Paul et al. 2020, Country=" + c, "2015/16 (Sentinel-2)")
res["Paul2020_DE_list"] = sorted(de_list, key=lambda x: -x["area_km2"])

json.dump(res, open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
for k, v in res.items():
    if isinstance(v, dict) and "glaciers" in v:
        c = v["classes"]
        print("%-16s %5d glaciers %9.2f km2  A %4d/%8.1f  B %4d/%7.1f  C %4d/%6.2f  ref %s" % (
            k, v["glaciers"], v["area_km2"], c["A"]["n"], c["A"]["area_km2"], c["B"]["n"], c["B"]["area_km2"],
            c["C"]["n"], c["C"]["area_km2"], str(v["refYear"])[:60]))
print("AGI5 vanished/vanishing:", res["AT_AGI5_vanishing"])
print("DE glaciers in Paul2020:", res["Paul2020_DE_list"])
