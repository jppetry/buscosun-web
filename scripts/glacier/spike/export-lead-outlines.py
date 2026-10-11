"""GL-0 spike: export WGS84 outlines of the five spike glaciers to a small JSON for the Node measurements.
Sources: AGI 5 (Hintereisferner, Pasterze), SGI2016 (Grosser Aletsch B36-26, Rhone B43-03), RGI 6.2 region 11
(Noerdlicher Schneeferner RGI60-11.03246). Cache-only, nothing is published.
"""
import io, json, sys, zipfile
import shapefile
from pyproj import Transformer
from shapely.geometry import shape, mapping, Polygon, MultiPolygon
from shapely.ops import transform as shp_transform
import warnings; warnings.filterwarnings("ignore", category=DeprecationWarning)

RAW = "C:/dev/buscosun-glacier-cache/raw/"
OUT = "C:/dev/buscosun-glacier-cache/spike/lead-outlines.json"
res = {}

def add(key, geom_ll, props):
    g = geom_ll
    res[key] = {"props": props, "bbox": list(g.bounds), "area_km2_geodesic_approx": None,
                "geometry": mapping(g)}

# AGI5 (EPSG:31287 -> 4326)
t_at = Transformer.from_crs(31287, 4326, always_xy=True)
z = zipfile.ZipFile(RAW + "agi5/GI5_vector_files.zip")
want = {"hintereisferner": 2125, "pasterze": 4027}  # AGI 5 ids: "Hintereisferner mit Toteis", "Pasterzen Kees"
found = {k: [] for k in want}
for n in z.namelist():
    if not n.endswith(".geojson"):
        continue
    for f in json.loads(z.read(n))["features"]:
        for k, w in want.items():
            if int(f["properties"]["id"]) == w:
                found[k].append(f)
for k, fs in found.items():
    polys = [shape(f["geometry"]) for f in fs]
    geom = polys[0] if len(polys) == 1 else MultiPolygon([p for g in polys for p in (g.geoms if g.geom_type == "MultiPolygon" else [g])])
    ll = shp_transform(lambda x, y, zz=None: t_at.transform(x, y), geom)
    p = fs[0]["properties"]
    add(k, ll, {"src": "AGI5", "id": p["id"], "name": p["name"], "year": p["year"], "area_km2": sum(f["properties"]["area"] for f in fs) / 1e6, "parts": len(fs)})

# SGI2016 (LV95 -> 4326)
t_ch = Transformer.from_crs(2056, 4326, always_xy=True)
zz = zipfile.ZipFile(RAW + "glamos/inventory_sgi2016_r2020.zip")
r = shapefile.Reader(shp=io.BytesIO(zz.read("SGI_2016_glaciers.shp")), dbf=io.BytesIO(zz.read("SGI_2016_glaciers.dbf")), encoding="latin-1")
cols = [f[0] for f in r.fields[1:]]
ids = {"B36-26": "aletsch", "B43-03": "rhone"}
for sr in r.iterShapeRecords():
    d = dict(zip(cols, sr.record))
    if d["sgi-id"] in ids:
        geom = shape(sr.shape.__geo_interface__)
        ll = shp_transform(lambda x, y, zz_=None: t_ch.transform(x, y), geom)
        add(ids[d["sgi-id"]], ll, {"src": "SGI2016", "id": d["sgi-id"], "name": d["name"], "year": d["year_acq"], "area_km2": d["area_km2"], "zmin": d["masl_min"], "zmax": d["masl_max"]})

# RGI 6.2 Noerdlicher Schneeferner
zr = zipfile.ZipFile(RAW + "rgi6/11_rgi62_CentralEurope.zip")
r = shapefile.Reader(shp=io.BytesIO(zr.read("11_rgi62_CentralEurope.shp")), dbf=io.BytesIO(zr.read("11_rgi62_CentralEurope.dbf")), encoding="latin-1")
cols = [f[0] for f in r.fields[1:]]
for sr in r.iterShapeRecords():
    d = dict(zip(cols, sr.record))
    if d["RGIId"] == "RGI60-11.03246":
        add("noerdl-schneeferner", shape(sr.shape.__geo_interface__), {"src": "RGI6.2", "id": d["RGIId"], "name": d["Name"], "year": d["BgnDate"], "area_km2": d["Area"], "zmin": d["Zmin"], "zmax": d["Zmax"]})

json.dump(res, open(OUT, "w"), ensure_ascii=False)
for k, v in res.items():
    print(k, v["props"], [round(x, 4) for x in v["bbox"]])
