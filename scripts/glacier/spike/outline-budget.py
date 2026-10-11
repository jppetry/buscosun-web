"""GL-0 spike (plan §5.10): size of the outlines in three simplification levels (WGS84 GeoJSON, 5 decimals, gzip) and the
topology rules of plan §6 (closed rings, no self-intersection, area within +-3 % of the original per level).
Inputs: SGI2016 (CH), AGI 5 (AT). Cache-only.
"""
import gzip, io, json, sys, zipfile
import shapefile
from pyproj import Transformer
from shapely.geometry import shape, mapping
from shapely.ops import transform as shp_transform
from shapely import make_valid
import warnings; warnings.filterwarnings("ignore")

RAW = "C:/dev/buscosun-glacier-cache/raw/"
LEVELS = [("L1", 60.0), ("L2", 15.0), ("L3", 4.0)]  # metres, tolerance of Douglas-Peucker in the local metric CRS

def load_ch():
    z = zipfile.ZipFile(RAW + "glamos/inventory_sgi2016_r2020.zip")
    r = shapefile.Reader(shp=io.BytesIO(z.read("SGI_2016_glaciers.shp")), dbf=io.BytesIO(z.read("SGI_2016_glaciers.dbf")), encoding="latin-1")
    cols = [f[0] for f in r.fields[1:]]
    out = []
    for sr in r.iterShapeRecords():
        d = dict(zip(cols, sr.record))
        out.append((d["sgi-id"], shape(sr.shape.__geo_interface__)))
    return out, 2056

def load_at():
    z = zipfile.ZipFile(RAW + "agi5/GI5_vector_files.zip")
    by = {}
    for n in z.namelist():
        if n.endswith(".geojson"):
            for f in json.loads(z.read(n))["features"]:
                by.setdefault(int(f["properties"]["id"]), []).append(shape(f["geometry"]))
    from shapely.ops import unary_union
    return [(k, unary_union(v)) for k, v in by.items()], 31287

def measure(name, items, epsg):
    to_ll = Transformer.from_crs(epsg, 4326, always_xy=True)
    res = {}
    base_area = sum(g.area for _, g in items)
    for lvl, tol in LEVELS:
        feats, area, bad_self, bad_open, nverts = [], 0.0, 0, 0, 0
        for gid, g in items:
            s = g.simplify(tol, preserve_topology=True)
            if s.is_empty:
                s = g
            if not s.is_valid:
                bad_self += 1
                s = make_valid(s)
            area += s.area
            ll = shp_transform(lambda x, y, z=None: to_ll.transform(x, y), s)
            geom = mapping(ll)
            def rnd(c):
                return [round(c[0], 5), round(c[1], 5)] if isinstance(c[0], (int, float)) else [rnd(x) for x in c]
            geom["coordinates"] = rnd(geom["coordinates"])
            nverts += len(str(geom["coordinates"]).split("],"))
            feats.append({"type": "Feature", "properties": {"id": gid}, "geometry": geom})
        txt = json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")).encode()
        res[lvl] = {"tolM": tol, "bytes": len(txt), "gzip": len(gzip.compress(txt, 6)), "areaVsOriginal": round(area / base_area - 1, 5), "invalidAfterSimplify": bad_self, "approxVertices": nverts}
    print(name, len(items), "glaciers", json.dumps(res))
    return res

ch, e1 = load_ch(); at, e2 = load_at()
out = {"CH": measure("CH SGI2016", ch, e1), "AT": measure("AT AGI5", at, e2)}
json.dump(out, open("C:/dev/buscosun-glacier-cache/spike/outline-budget.json", "w"), indent=1)
