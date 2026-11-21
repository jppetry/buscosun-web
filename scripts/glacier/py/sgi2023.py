"""Swiss glacier inventory SGI2023 from the GLAMOS file — the Swiss inventory of record since Jan 20.11.2026 ("GLAMOS direkt").

SGI2023 (GLAMOS 2026, doi:10.18750/inventory.sgi2023.r2026, CC BY 4.0 on the DOI page; acquisition 2021–2024) is not in the GLIMS Glacier
Database, so this one file is read from glamos.ch directly. It replaces the SGI2016 entities derived from the GLIMS parts
(`glims_inv.ch_current`); the earlier Swiss outlines (1850 … 2016) still come from GLIMS and the series from the WGMS FoG.

The file carries real glacier entities (one row per SGI id) with name, area, acquisition year, heights (swissALTI3D release 2025) and aspect,
plus the debris cover as polygons — nothing is derived from parts any more.

Identity (`_carry`): a glacier keeps the id it had in the builds made from SGI2016 when the two outlines are each other's largest overlap
and at least half of the NEW outline lies inside the old one — links, pages and the measuring lines keyed by id go on. Every other glacier
(a tributary that separated, a newly listed one) gets an id from its name; an id of the builds before is never given to another glacier.
The GLIMS glacier ids of the SGI2016 parts travel with the glacier they lie in: the WGMS FoG names a glacier by that id (`build_static` step 4).
"""
import hashlib

from pyproj import Transformer
from shapely.geometry import shape
from shapely.strtree import STRtree

import glims_inv
import inv

ZIP = inv.RAW + "glamos-sgi2023/inventory_sgi2023_r2026.zip"
ZIP_SHA256 = "3dd627a803da9e277b14e271a461c91a41756f0c1ad3e9d4c8688ce17bacb61c"
CARRY_MIN_SHARE = 0.5     # share of the NEW outline inside the old one (glaciers shrink: the old outline is rarely half covered by the new one)
PART_MIN_SHARE = 0.5      # a SGI2016 part belongs to the glacier it overlaps most, when that overlap is half of the smaller of the two
NAMELESS = ("", "noname", "nn")

_cache = {}


def _old():
    """The Swiss entities of the builds before (SGI2016 via GLIMS) with the ids they carried there (`inv.plain_ids`, the rule of those builds)."""
    if "old" not in _cache:
        old = glims_inv.ch_current()
        inv.plain_ids(old)
        _cache["old"] = old
    return _cache["old"]


def _records(layer):
    if "sha" not in _cache:
        _cache["sha"] = hashlib.sha256(open(ZIP, "rb").read()).hexdigest()
        if _cache["sha"] != ZIP_SHA256:
            raise SystemExit(f"SGI2023: {ZIP} is not release 2026 (sha256 {_cache['sha']})")
    r = inv._shp(ZIP, layer, "utf-8")
    cols = [f[0] for f in r.fields[1:]]
    for sr in r.iterShapeRecords():
        yield dict(zip(cols, sr.record)), inv._valid(shape(sr.shape.__geo_interface__))


def _carry(new):
    """Sets `carry` (id of the builds before, or None), `carryWhy`, `glimsMain` and `glims` on every new entity."""
    old = _old()
    tree = STRtree([o["geom"] for o in old])
    fwd, back = {}, {}                      # new index -> {old index: m²} and the reverse
    for i, n in enumerate(new):
        for j in tree.query(n["geom"]):
            a = n["geom"].intersection(old[int(j)]["geom"]).area
            if a > 0:
                fwd.setdefault(i, {})[int(j)] = a
                back.setdefault(int(j), {})[i] = a
    for i, n in enumerate(new):
        n["carry"], n["carryWhy"], n["partOf"], n["glimsMain"], n["glims"] = None, None, None, None, []
        if i not in fwd:
            n["carryWhy"] = "kein Umriss im SGI2016"
            continue
        j = max(fwd[i], key=fwd[i].get)
        if max(back[j], key=back[j].get) != i:
            n["carryWhy"], n["partOf"] = "im SGI2016 Teil von " + old[j]["id"], old[j]["id"]
        elif fwd[i][j] / n["geom"].area < CARRY_MIN_SHARE:
            n["carryWhy"] = "weniger als die Hälfte im Umriss von " + old[j]["id"]
        else:
            n["carry"], n["glimsMain"] = old[j]["id"], old[j]["invId"]
    # GLIMS glacier id of every SGI2016 part -> the glacier it lies in
    ntree = STRtree([n["geom"] for n in new])
    for p in glims_inv.parts_of("sgi2016"):
        best, ba = None, 0.0
        for i in ntree.query(p["geom"]):
            a = p["geom"].intersection(new[int(i)]["geom"]).area
            if a > ba:
                best, ba = int(i), a
        if best is not None and ba >= PART_MIN_SHARE * min(p["geom"].area, new[best]["geom"].area):
            new[best]["glims"].append(p["glims"])
    for n in new:
        n["glims"] = sorted(set(n["glims"]))
    taken = {n["carry"] for n in new if n["carry"]}
    _cache["retired"] = sorted(({"id": o["id"], "name": o["name"], "km2": round(o["area_km2"], 4)} for o in old if o["id"] not in taken), key=lambda r: r["id"])


def ch_current():
    """SGI2023 glacier entities in the shape of `inv.at_current()` (geometry in LV95), each with `carry` / `glims` (see the module header)."""
    t_ll = Transformer.from_crs(inv.CRS_LV95, 4326, always_xy=True)
    out = []
    for d, geom in _records("SGI_2023_glaciers"):
        name = (d["name"] or "").strip()
        c = geom.centroid
        lon, lat = t_ll.transform(c.x, c.y)
        out.append({
            "country": "CH", "inv": "SGI2023", "invId": d["sgi-id"], "name": None if name.lower() in NAMELESS else name, "region": glims_inv.ch_region(lon, lat),
            "area_km2": float(d["area_km2"]), "refYear": int(d["year_acq"]),
            "z": (int(d["masl_min"]), int(d["masl_med"]), int(d["masl_max"])), "asp": float(d["aspect_deg"]) if d["aspect_deg"] not in (None, "") else None,
            "geom": geom, "crs": inv.CRS_LV95,
        })
    out.sort(key=lambda e: e["invId"])
    _carry(out)
    return out


def assign_ids(ch):
    """Carried ids stay; the others follow the plain rule (slug of the name, the SGI id appended when the slug is not free or the name is missing)."""
    taken = {o["id"] for o in _old()}       # carried or retired: never handed to another glacier
    fresh = [e for e in ch if not e["carry"]]
    counts = {}
    for e in fresh:
        if e["name"]:
            counts[inv.slug(e["name"])] = counts.get(inv.slug(e["name"]), 0) + 1
    for e in ch:
        if e["carry"]:
            e["id"] = e["carry"]
            continue
        base = inv.slug(e["name"]) if e["name"] else ""
        sgi = inv.slug(str(e["invId"]))
        free = base and counts[base] == 1 and f"gl_ch_{base}" not in taken
        e["id"] = "gl_ch_" + (base if free else f"{base}-{sgi}" if base else f"nn-{sgi}")
        assert e["id"] not in taken, e["id"]


def carry_report(ch):
    """What happened to the ids — for the build report."""
    fresh = [{"id": e["id"], "sgi": e["invId"], "name": e["name"], "km2": round(e["area_km2"], 4), "why": e["carryWhy"]} for e in ch if not e["carry"]]
    return {"rule": f"gegenseitig größte Schnittfläche und ≥ {int(CARRY_MIN_SHARE * 100)} % des neuen Umrisses im alten", "carried": sum(1 for e in ch if e["carry"]),
            "fresh": sorted(fresh, key=lambda r: r["id"]), "retired": _cache.get("retired", [])}


def ch_debris_share(entities):
    """Debris-covered share per entity (`invId`): the debris polygons of SGI2023 intersected with the glacier outline."""
    polys = [g for _, g in _records("SGI_2023_debriscover")]
    tree = STRtree(polys)
    out = {}
    for e in entities:
        g = e["geom"]
        if g.area <= 0:
            continue
        hit = 0.0
        for i in tree.query(g):
            hit += g.intersection(polys[int(i)]).area
        out[e["invId"]] = min(1.0, hit / g.area)
    return out


def old_entities():
    """The Swiss glaciers of the builds before (id, name, geometry in LV95, GLIMS ids of their parts) — `build_static` keeps the series links made on them."""
    return _old()


def ch_epoch_2016():
    """SGI2016 as an EARLIER outline: the entities of the builds before, each with the acquisition year and area the catalogue showed until then."""
    return [{"id": o["invId"], "geom": o["geom"], "crs": inv.CRS_LV95, "year": int(o["refYear"]), "km2": o["area_km2"]} for o in _old()]
