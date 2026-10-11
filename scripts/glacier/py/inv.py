"""Inventory loaders for the glacier static build (Phase GL, plan §6).

Every loader returns plain dicts with a shapely geometry in the inventory's NATIVE projected CRS (`crs`), so area,
simplification and overlap run in metres. Raw files live in the cache outside every repo (`RAW`).
"""
import io
import json
import re
import zipfile

import shapefile
from shapely import make_valid
from shapely.geometry import shape
from shapely.ops import unary_union

RAW = "C:/dev/buscosun-glacier-cache/raw/"

CRS_LV95, CRS_LV03, CRS_MGI = 2056, 21781, 31287
CRS_UTM32 = 25832  # ETRS89 / UTM 32N for the German glaciers (RGI is WGS84 lon/lat)


def _valid(g):
    if g.is_valid:
        return g
    g2 = make_valid(g)
    if g2.geom_type not in ("Polygon", "MultiPolygon"):
        g2 = unary_union([p for p in getattr(g2, "geoms", [g2]) if p.geom_type in ("Polygon", "MultiPolygon")])
    return g2


def slug(s):
    """ASCII slug — the same rule as `glacierSlug` in src/glacier/glacierContract.ts."""
    m = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss", "Ä": "ae", "Ö": "oe", "Ü": "ue"}
    s = "".join(m.get(c, c) for c in s)
    import unicodedata
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", s))


def _shp(zip_path, member_base, encoding="latin-1"):
    z = zipfile.ZipFile(zip_path)
    names = z.namelist()
    return shapefile.Reader(
        shp=io.BytesIO(z.read(member_base + ".shp")), dbf=io.BytesIO(z.read(member_base + ".dbf")),
        shx=io.BytesIO(z.read(member_base + ".shx")) if member_base + ".shx" in names else None, encoding=encoding)


# --- Switzerland ------------------------------------------------------------------------------------

def ch_current():
    """SGI2016: one record per glacier entity (unique SGI id)."""
    r = _shp(RAW + "glamos/inventory_sgi2016_r2020.zip", "SGI_2016_glaciers", "utf-8")
    cols = [f[0] for f in r.fields[1:]]
    out = []
    for sr in r.iterShapeRecords():
        d = dict(zip(cols, sr.record))
        out.append({
            "country": "CH", "inv": "SGI2016", "invId": d["sgi-id"], "name": (d["name"] or "").strip() or None,
            "region": "ch-" + str(d["rl_0"]).lower(), "area_km2": float(d["area_km2"]), "refYear": int(d["year_acq"]),
            "z": (int(d["masl_min"]), int(d["masl_med"]), int(d["masl_max"])), "asp": float(d["aspect_deg"]) if d["aspect_deg"] not in (None, "") else None,
            "geom": _valid(shape(sr.shape.__geo_interface__)), "crs": CRS_LV95,
        })
    return out


def ch_debris_share():
    """Debris-covered share per SGI id from `SGI_2016_debriscover.shp` (intersection with the glacier outline)."""
    from shapely.strtree import STRtree
    gl = {g["invId"]: g["geom"] for g in ch_current()}
    r = _shp(RAW + "glamos/inventory_sgi2016_r2020.zip", "SGI_2016_debriscover", "utf-8")
    polys = [_valid(shape(s.__geo_interface__)) for s in r.iterShapes()]
    tree = STRtree(polys)
    out = {}
    for gid, g in gl.items():
        a = g.area
        if a <= 0:
            continue
        hit = 0.0
        for i in tree.query(g):
            hit += g.intersection(polys[i]).area
        out[gid] = min(1.0, hit / a)
    return out


def ch_epoch(year):
    """Historical SGI polygons (1850 / 1931 / 1973 / 2010): id, geometry, CRS."""
    spec = {
        1850: ("inventory_sgi1850_r1992.zip", "SGI_1850", CRS_LV95, "SGI"),
        1931: ("inventory_sgi1931_r2022.zip", "SGI_1931", CRS_LV03, "SGI"),
        1973: ("inventory_sgi1973_r1976.zip", "SGI_1973", CRS_LV95, "SGI"),
        2010: ("inventory_sgi2010_r2010.zip", "SGI_2010", CRS_LV95, "SGI"),
    }[year]
    r = _shp(RAW + "glamos/" + spec[0], spec[1], "latin-1")
    cols = [f[0] for f in r.fields[1:]]
    out = []
    for sr in r.iterShapeRecords():
        d = dict(zip(cols, sr.record))
        out.append({"id": d.get(spec[3]), "geom": _valid(shape(sr.shape.__geo_interface__)), "crs": spec[2]})
    return out


# --- Austria ------------------------------------------------------------------------------------------

def at_current():
    """AGI 5 (2021-2023): fragments merged per glacier id; the region is the file with the largest fragment."""
    z = zipfile.ZipFile(RAW + "agi5/GI5_vector_files.zip")
    by = {}
    for n in z.namelist():
        if not n.endswith(".geojson"):
            continue
        reg = "at-" + slug(re.sub(r"_GI5.*$", "", n.split("/")[-1]))
        for f in json.loads(z.read(n))["features"]:
            p = f["properties"]
            gid = int(p["id"])
            e = by.setdefault(gid, {"parts": [], "attrs": []})
            e["parts"].append(_valid(shape(f["geometry"])))
            e["attrs"].append((float(p["area"]), reg, p))
    out = []
    for gid, e in by.items():
        attrs = sorted(e["attrs"], key=lambda t: -t[0])
        p = attrs[0][2]
        years = {}
        for a, _, q in e["attrs"]:
            years[int(q["year"])] = years.get(int(q["year"]), 0.0) + a
        ref = max(years.items(), key=lambda kv: kv[1])[0]
        name = (p.get("name") or "").strip()
        dbr = max((int(q["debris"]) for _, _, q in e["attrs"] if q.get("debris") not in (None, "")), default=None)
        out.append({
            "country": "AT", "inv": "AGI5", "invId": gid, "name": None if name in ("", "NN") else name,
            "region": attrs[0][1], "area_km2": sum(a for a, _, _ in e["attrs"]) / 1e6, "refYear": ref,
            "z": (int(round(min(float(q["min_elev"]) for _, _, q in e["attrs"]))), int(round(float(p["median_elev"]))), int(round(max(float(q["max_elev"]) for _, _, q in e["attrs"])))),
            "asp": None, "geom": _valid(unary_union(e["parts"])), "crs": CRS_MGI,
            "debris": None if dbr == 4 else dbr, "years": years,
        })
    return out


def at_vanishing():
    d = json.load(open(RAW + "agi5/vanishing_glaciers.geojson", encoding="utf-8"))
    return [{"id": int(f["properties"]["id"]), "name": f["properties"].get("name"), "status": f["properties"]["status_GI5"],
             "areaGI3": f["properties"].get("area_GI3"), "yearGI3": f["properties"].get("year_GI3"), "region": f["properties"].get("region"),
             "lon_lat_crs": CRS_MGI, "geometry": f["geometry"]} for f in d["features"]]


def at_gi4():
    r = _shp(RAW + "gi4/GI_4_2015.zip", "GI_4_2015/GI_4_2015", "latin-1")
    cols = [f[0] for f in r.fields[1:]]
    out = []
    for sr in r.iterShapeRecords():
        d = dict(zip(cols, sr.record))
        out.append({"id": d["nr"], "geom": _valid(shape(sr.shape.__geo_interface__)), "crs": CRS_MGI, "name": d.get("name")})
    return out


# --- Germany ----------------------------------------------------------------------------------------------

# BAdW, Pressemitteilung 19.03.2026 (Tabelle "Flächenänderungen", ha): the authority's own areas per glacier 2023 → 2025.
DE_BADW = {
    "Nördlicher Schneeferner": {"rgi": ["RGI60-11.03246"], "ha2023": 13.0, "ha2025": 9.4},
    "Höllentalferner": {"rgi": ["RGI60-11.03249"], "ha2023": 14.1, "ha2025": 12.8},
    "Blaueis": {"rgi": ["RGI60-11.03250", "RGI60-11.03251"], "ha2023": 2.7, "ha2025": 1.5},
    "Watzmanngletscher": {"rgi": ["RGI60-11.03252"], "ha2023": 4.7, "ha2025": 2.5},
}
# The Southern Schneeferner lost its glacier status in 2022 (BAdW) — kept out of the 4, listed separately.
DE_LOST = {"Südlicher Schneeferner": ["RGI60-11.03247", "RGI60-11.03248"]}


def rgi6_region11():
    r = _shp(RAW + "rgi6/11_rgi62_CentralEurope.zip", "11_rgi62_CentralEurope", "latin-1")
    cols = [f[0] for f in r.fields[1:]]
    out = {}
    for sr in r.iterShapeRecords():
        d = dict(zip(cols, sr.record))
        out[d["RGIId"]] = {"id": d["RGIId"], "geom": _valid(shape(sr.shape.__geo_interface__)), "crs": 4326, "name": d.get("Name"),
                           "area_km2": float(d["Area"]), "z": (int(d["Zmin"]), int(d["Zmed"]), int(d["Zmax"])), "cenlon": float(d["CenLon"]), "cenlat": float(d["CenLat"]),
                           "begin": d.get("BgnDate"), "aspect": d.get("Aspect")}
    return out


def de_current():
    rg = rgi6_region11()
    out = []
    for name, spec in DE_BADW.items():
        parts = [rg[i] for i in spec["rgi"]]
        geom = unary_union([p["geom"] for p in parts])
        zmin = min(p["z"][0] for p in parts); zmax = max(p["z"][2] for p in parts)
        zmed = int(round(sum(p["z"][1] * p["area_km2"] for p in parts) / sum(p["area_km2"] for p in parts)))
        out.append({
            "country": "DE", "inv": "RGI6.2", "invId": spec["rgi"][0], "name": name, "region": "de",
            "area_km2": spec["ha2025"] / 100.0, "area_ref": "2025", "area_source": "BAdW 2025", "refYear": "2003 (RGI 6.2)",
            "z": (zmin, zmed, zmax), "asp": None, "geom": geom, "crs": 4326, "rgi": spec["rgi"],
            "ha2023": spec["ha2023"], "ha2025": spec["ha2025"], "rgi_area_km2": sum(p["area_km2"] for p in parts),
        })
    return out


def to_ll(geom, crs):
    """Reproject a native-CRS geometry to WGS84 lon/lat."""
    if crs == 4326:
        return geom
    from pyproj import Transformer
    from shapely.ops import transform
    t = Transformer.from_crs(crs, 4326, always_xy=True)
    return transform(lambda x, y, z=None: t.transform(x, y), geom)


def from_ll(geom, crs):
    if crs == 4326:
        return geom
    from pyproj import Transformer
    from shapely.ops import transform
    t = Transformer.from_crs(4326, crs, always_xy=True)
    return transform(lambda x, y, z=None: t.transform(x, y), geom)
