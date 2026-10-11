"""Swiss glacier inventory from the GLIMS Glacier Database (Phase GL, GLAMOS detour — audit/gletscher.md §GL-1b).

GLIMS holds the Swiss inventories as polygon PARTS (one row per polygon; SGI2016: 1 834 parts of 1 400 glacier entities), with the analysis id,
the GLIMS glacier id, name, area and acquisition date — and nothing of the SGI attributes (SGI id, elevations, aspect, river basin). So the
entity, the id, the region and the heights are derived here, from the geometry, the name and the DEM, and the GLAMOS files are not read.

Entity rule (`group_entities`): two parts are ONE glacier when they carry the same non-empty name and lie within `NAME_LINK_M` of each other,
or when both are unnamed and lie within `UNNAMED_LINK_M`. The rule is tested against the SGI2016 entities in `audit/gletscher/glims-entities.py`
(the GLAMOS file is the test oracle there, never an input of the build).
"""
import json
import re
import unicodedata

import shapely
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

import inv

G = inv.RAW + "glims/"
CRS_LV95 = 2056
NAME_LINK_M = 500.0      # chosen by the sweep in audit/gletscher/glims-entities.py (96.4 % of the SGI2016 entities reproduced exactly)
UNNAMED_LINK_M = 20.0

_t = Transformer.from_crs(4326, CRS_LV95, always_xy=True)


def load_set(name):
    d = json.load(open(G + name + ".json", encoding="utf-8"))
    return d


def to_lv95(geom):
    return transform(lambda x, y, z=None: _t.transform(x, y), geom)


def parts_of(setname):
    """Polygon parts of one GLIMS set in LV95 (valid), with their attributes."""
    d = load_set(setname)
    out = []
    for f in d["features"]:
        p = f["properties"]
        g = inv._valid(to_lv95(shape(f["geometry"])))
        if g.is_empty:
            continue
        out.append({
            "anlys": p["anlys_id"], "glims": p["glac_id"], "name": (p.get("glac_name") or "").strip() or None, "area_db": p["db_area"],
            "date": (p.get("src_date") or "")[:10], "geom": g,
        })
    return out


def _norm(name):
    s = unicodedata.normalize("NFKD", name or "").lower()
    return re.sub(r"[^a-z0-9]+", "", "".join(c for c in s if not unicodedata.combining(c)))


def group_entities(parts, name_link_m=NAME_LINK_M, unnamed_link_m=UNNAMED_LINK_M):
    """Union-find over the parts → list of lists of part indices (each sorted by descending area)."""
    n = len(parts)
    uf = list(range(n))

    def find(a):
        while uf[a] != a:
            uf[a] = uf[uf[a]]
            a = uf[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            uf[ra] = rb

    geoms = [p["geom"] for p in parts]
    tree = STRtree(geoms)
    nm = [_norm(p["name"]) if p["name"] else "" for p in parts]
    for i in range(n):
        reach = name_link_m if nm[i] else unnamed_link_m
        for j in tree.query(geoms[i].buffer(max(name_link_m, unnamed_link_m))):
            if j <= i:
                continue
            if nm[i] and nm[j]:
                if nm[i] != nm[j]:
                    continue
                lim = name_link_m
            elif not nm[i] and not nm[j]:
                lim = unnamed_link_m
            else:
                continue
            if geoms[i].distance(geoms[j]) <= lim:
                union(i, j)
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    return [sorted(v, key=lambda k: -geoms[k].area) for v in groups.values()]


# --- Switzerland: current inventory (SGI2016 via GLIMS) --------------------------------------------------------------------------------

# Our own partition of the Swiss glaciers into five areas (file split + label) — the SGI's river basins are an attribute of the GLAMOS files that
# GLIMS does not carry, so the partition is plain geography (the centroid of the entity, WGS84). Contract: CH_REGION_RULE in glacierContract.ts.
CH_REGIONS = ("ch-west", "ch-mitte-west", "ch-mitte-ost", "ch-ost", "ch-sued")


def ch_region(lon, lat):
    if lat < 46.45 and lon >= 8.35:
        return "ch-sued"
    if lon < 7.55:
        return "ch-west"
    if lon < 8.2:
        return "ch-mitte-west"
    if lon < 8.75:
        return "ch-mitte-ost"
    return "ch-ost"


def _entity_name(ps):
    names = [p["name"] for p in ps if p["name"]]
    return max(set(names), key=lambda n: (sum(p["geom"].area for p in ps if p["name"] == n), n)) if names else None


def ch_current():
    """SGI2016 glacier entities from the GLIMS parts: dicts in the shape of `inv.at_current()` (geometry in LV95). Heights come later from the DEM."""
    parts = parts_of("sgi2016")
    out = []
    t_ll = Transformer.from_crs(CRS_LV95, 4326, always_xy=True)
    for idxs in group_entities(parts):
        ps = [parts[i] for i in idxs]
        # the parts of one entity touch or overlap within the digitising precision (GLIMS keeps 0.1 m): snapped to a 0.1 m grid the union stays a valid polygon
        # after the round trip LV95 → WGS84 (without it 88 of the 296 multi-part entities came out self-intersecting)
        geom = inv._valid(shapely.set_precision(unary_union([p["geom"] for p in ps]), 0.1))
        years = {}
        for p in ps:
            if p["date"][:4].isdigit():
                years[int(p["date"][:4])] = years.get(int(p["date"][:4]), 0.0) + p["geom"].area
        c = geom.centroid
        lon, lat = t_ll.transform(c.x, c.y)
        main = ps[0]
        out.append({
            "country": "CH", "inv": "SGI2016", "invId": main["glims"], "name": _entity_name(ps), "region": ch_region(lon, lat),
            "area_km2": geom.area / 1e6, "refYear": max(years.items(), key=lambda kv: kv[1])[0] if years else 2016,
            "z": None, "asp": None, "geom": geom, "crs": CRS_LV95, "parts": len(ps), "glims": sorted(p["glims"] for p in ps),
        })
    out.sort(key=lambda e: e["invId"])
    return out


def ch_debris_share(entities):
    """Debris-covered share per entity (`invId`): the GLIMS debris lines of the SGI2016 submission intersected with the entity outline."""
    d = load_set("sgi2016-debris")
    polys = [inv._valid(to_lv95(shape(f["geometry"]))) for f in d["features"]]
    tree = STRtree(polys)
    out = {}
    for e in entities:
        g = e["geom"]
        if g.area <= 0:
            continue
        hit = 0.0
        for i in tree.query(g):
            hit += g.intersection(polys[i]).area
        out[e["invId"]] = min(1.0, hit / g.area)
    return out


# --- Switzerland: the earlier inventories (SGI1850 / 1931 / 1973 / 2010 via GLIMS) ----------------------------------------------------------------

EPOCH_SETS = {1850: ("sgi1850-a", "sgi1850-b"), 1931: ("sgi1931",), 1973: ("sgi1973",), 2010: ("sgi2010-a",)}


def ch_epoch(year):
    """Historical polygons: id (GLIMS analysis id), geometry in LV95 — the same shape as `inv.ch_epoch`."""
    out = []
    for name in EPOCH_SETS[year]:
        for p in parts_of(name):
            out.append({"id": p["anlys"], "geom": p["geom"], "crs": CRS_LV95})
    return out
