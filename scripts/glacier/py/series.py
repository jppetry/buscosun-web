"""Series, linking and projection for the glacier static build (Phase GL, plan §6).

Linking rule (plan §6 "Identität"): external glacier ids (GLAMOS, WGMS, ÖAV, RGI 6) are attached to catalogue glaciers by
position/overlap with the inventory of record; whatever cannot be attached goes to the report's "unlinked" lists instead of
being guessed.
"""
import csv
import difflib
import glob
import io
import os
import re
import sys
import zipfile

import numpy as np
from shapely.geometry import Point
from shapely.strtree import STRtree

sys.path.insert(0, os.path.dirname(__file__))
from glamos_csv import read_glamos_csv, num  # noqa: E402
import inv  # noqa: E402

RAW = inv.RAW


def _yr(s):
    m = re.match(r"(\d{4})", str(s or ""))
    return int(m.group(1)) if m else None


# --- GLAMOS (CH) -------------------------------------------------------------------------------------------

def glamos_length():
    """{sgi id: [[yearStart, yearEnd, dL m], ...]} from the length-change release."""
    t = read_glamos_csv(RAW + "glamos/lengthchange.csv")
    out = {}
    for r in t["rows"]:
        gid = r["glacier id"]
        a, b, d = _yr(r["start date of observation"]), _yr(r["end date of observation"]), num(r["length change"])
        if gid and a and b and d is not None:
            out.setdefault(gid, []).append([a, b, round(d, 2)])
    for v in out.values():
        v.sort(key=lambda x: (x[1], x[0]))
    return out


def glamos_mass():
    """{sgi id: [[yearEnd, Bw, Bs, Ba (mm w.e.), ELA m, AAR 0..1], ...]} — hydrological year (fixed dates)."""
    t = read_glamos_csv(RAW + "glamos/massbalance_fixdate.csv")
    out = {}
    for r in t["rows"]:
        gid = r["glacier id"]
        y = _yr(r["end date of observation"])
        if not gid or not y:
            continue
        bw, bs, ba = num(r["winter mass balance"]), num(r["summer mass balance"]), num(r["annual mass balance"])
        ela, aar = num(r["equilibrium line altitude"]), num(r["accumulation area ratio"])
        out.setdefault(gid, []).append([y, bw, bs, ba, ela, None if aar is None else round(aar / 100.0, 3)])
    for v in out.values():
        v.sort(key=lambda x: x[0])
    return out


def glamos_positions():
    """{GLAMOS glacier id: (x, y) in LV95} from `glacier_list.csv` — the bridge for ids that SGI2016 does not carry."""
    t = read_glamos_csv(RAW + "glamos/glacier_list.csv")
    out = {}
    for r in t["rows"]:
        x, y = num(r.get("coordx")), num(r.get("coordy"))
        if r.get("glacier id") and x and y:
            out[r["glacier id"]] = (x, y, num(r.get("glacier area")))
    return out


# --- ÖAV (AT, PANGAEA) ----------------------------------------------------------------------------------------

def oeav_length():
    """{aut id: {name, lat, lon, wgms, rows:[[yStart, yEnd, dL]]}} from all yearly PANGAEA tables (1969/70 … 2022/23)."""
    out = {}
    files = sorted(glob.glob(RAW + "oeav/*.tsv"))
    seen_year = {}
    for f in files:
        t = open(f, encoding="utf-8", errors="replace").read()
        i = t.find("*/")
        lines = [l for l in t[i + 2:].lstrip("\n").split("\n") if l.strip()]
        head = lines[0].split("\t")
        col = {}
        for k, h in enumerate(head):
            hl = h.lower()
            if hl.startswith("date/time"): col["date"] = k
            elif hl.startswith("latitude"): col["lat"] = k
            elif hl.startswith("longitude"): col["lon"] = k
            elif hl.startswith("id (aut") or hl == "id": col["aut"] = k
            elif hl.startswith("id (wgms"): col["wgms"] = k
            elif hl.startswith("glacier"): col["name"] = k
            elif hl.startswith("diff"): col["diff"] = k
        if not all(k in col for k in ("date", "aut", "diff")):
            continue
        for l in lines[1:]:
            c = l.split("\t")
            if len(c) <= max(col.values()):
                continue
            aut = c[col["aut"]].strip()
            y = _yr(c[col["date"]])
            d = num(c[col["diff"]].replace(",", "."))
            if not aut or not y or d is None:
                continue
            e = out.setdefault(aut, {"name": None, "lat": None, "lon": None, "wgms": None, "rows": {}})
            if "name" in col and c[col["name"]].strip(): e["name"] = c[col["name"]].strip()
            if "lat" in col and num(c[col["lat"]]) is not None: e["lat"], e["lon"] = num(c[col["lat"]]), num(c[col["lon"]])
            if "wgms" in col and c[col["wgms"]].strip().isdigit(): e["wgms"] = c[col["wgms"]].strip()
            # a year can come from two datasets (the 2007–2011 re-issues): the later file wins, one value per year
            e["rows"][y] = [y - 1, y, round(d, 1)]
    for e in out.values():
        e["rows"] = [e["rows"][y] for y in sorted(e["rows"])]
    return out


# --- WGMS FoG (mass balance AT / DE / CH, length CH, ids) -------------------------------------------------------------------

FOG_COUNTRIES = ("AT", "DE", "CH")


def _fog_rd(z, name):
    return csv.DictReader(io.TextIOWrapper(z.open("data/" + name), encoding="utf-8", errors="replace"))


def wgms_tables():
    """({fog id: glacier row}, {fog id: [[year, Bw, Bs, Ba (mm w.e.), ELA m, AAR 0..1], ...]}) for AT, DE and CH."""
    z = zipfile.ZipFile(RAW + "wgms/FoG-2026-02-10.zip")
    gl = {g["id"]: g for g in _fog_rd(z, "glacier.csv") if g["country"] in FOG_COUNTRIES}
    mass = {}
    for m in _fog_rd(z, "mass_balance.csv"):
        g = gl.get(m["glacier_id"])
        if not g:
            continue
        y = int(m["year"] or 0)
        if y < 1900:
            continue
        f = lambda k: (num(m[k]) * 1000.0 if num(m[k]) is not None else None)  # m w.e. -> mm w.e.
        ela, aar = num(m["ela"]), num(m["aar"])
        row = [y, f("winter_balance"), f("summer_balance"), f("annual_balance"), ela, aar]
        if row[1] is None and row[2] is None and row[3] is None and ela is None and aar is None:
            continue
        mass.setdefault(m["glacier_id"], []).append(row)
    for v in mass.values():
        v.sort(key=lambda x: x[0])
    return gl, mass


def wgms_length(country="CH"):
    """{fog id: [[yearStart, yearEnd, dL m], ...]} from `front_variation.csv`. One glacier can carry several series (different observers); the series 0 is
    the canonical one of the database, any other series is used only when 0 is absent (the one with the most rows)."""
    z = zipfile.ZipFile(RAW + "wgms/FoG-2026-02-10.zip")
    gl = {g["id"] for g in _fog_rd(z, "glacier.csv") if g["country"] == country}
    by = {}
    for r in _fog_rd(z, "front_variation.csv"):
        if r["glacier_id"] not in gl:
            continue
        a, b, d = _yr(r["begin_date"]), _yr(r["end_date"]), num(r["length_change"])
        if a and b and d is not None:
            by.setdefault(r["glacier_id"], {}).setdefault(r["series_id"], []).append([a, b, round(d, 2)])
    out = {}
    for gid, sers in by.items():
        key = "0" if "0" in sers else max(sers, key=lambda k: len(sers[k]))
        out[gid] = sorted(sers[key], key=lambda x: (x[1], x[0]))
    return out


# --- Linking ------------------------------------------------------------------------------------------------------

class Linker:
    """Nearest-polygon attachment of external points on a metric CRS (EPSG:3035)."""

    def __init__(self, ids, geoms3035, names):
        self.ids = ids
        self.geoms = geoms3035
        self.tree = STRtree(geoms3035)
        self.names = names

    def at(self, lat, lon, name=None, tol_m=600.0):
        from pyproj import Transformer
        if not hasattr(self, "_t"):
            self._t = Transformer.from_crs(4326, 3035, always_xy=True)
        x, y = self._t.transform(lon, lat)
        p = Point(x, y)
        cand = self.tree.query(p.buffer(tol_m))
        best = None
        for i in cand:
            d = self.geoms[i].distance(p)
            if d > tol_m:
                continue
            sim = 0.0
            if name and self.names[i]:
                sim = difflib.SequenceMatcher(None, inv.slug(name), inv.slug(self.names[i])).ratio()
            score = (d - 400.0 * sim, -self.geoms[i].area)
            if best is None or score < best[0]:
                best = (score, i, d, sim)
        return None if best is None else {"index": int(best[1]), "id": self.ids[best[1]], "dist_m": round(best[2], 1), "sim": round(best[3], 2)}


# --- GloGEM (projection) ---------------------------------------------------------------------------------------

SSPS = ["ssp126", "ssp245", "ssp370", "ssp585"]
SSP_LABEL = {"ssp126": "SSP1-2.6", "ssp245": "SSP2-4.5", "ssp370": "SSP3-7.0", "ssp585": "SSP5-8.5"}
PROJ_YEARS = list(range(2020, 2101, 5))


def glogem_region11():
    import netCDF4
    ds = netCDF4.Dataset(RAW + "glogem/RGI_region_11.nc")
    ids = [str(x) for x in ds.variables["ID"][:]]
    ssp = [str(x) for x in ds.variables["SSP"][:]]
    years = [int(x) for x in ds.variables["year"][:]]
    vol = np.asarray(ds.variables["Volume"][:], dtype=np.float32)  # (gcm, ssp, year, id) in m3
    area = np.asarray(ds.variables["Area"][:], dtype=np.float32)   # m2
    return {"ids": ids, "ssp": ssp, "years": years, "vol": vol, "area": area, "gcm": [str(x) for x in ds.variables["GCM"][:]]}


def projection_for(weights, g):
    """weights: {rgi id: share w_j of that RGI glacier lying in our glacier}. Returns the range per scenario or None."""
    idx = {rid: k for k, rid in enumerate(g["ids"])}
    use = [(idx[r], w) for r, w in weights.items() if r in idx and w > 0]
    if not use:
        return None
    cols = [k for k, _ in use]
    w = np.array([wt for _, wt in use], dtype=np.float64)
    out = {"rgi": sorted(weights), "v2020km3": None, "f": {}, "u10": {}, "a2100": {}}
    y0 = g["years"].index(2020)
    sel = [g["years"].index(y) for y in PROJ_YEARS]
    vol = g["vol"][:, :, :, cols].astype(np.float64)   # gcm, ssp, year, k
    V = (vol * w).sum(axis=-1)                           # gcm, ssp, year
    base = V[:, :, y0]
    out["v2020km3"] = round(float(np.median(V[:, 0, y0])) / 1e9, 5)
    ar = (g["area"][:, :, :, cols].astype(np.float64) * w).sum(axis=-1)
    for s, name in enumerate(g["ssp"]):
        if name not in SSP_LABEL:
            continue
        # a fraction of the 2020 volume exists only for climate models in which the glacier still has ice in 2020 (very small
        # glaciers are gone in some models already); fewer than 6 of 12 models ⇒ no range for this scenario (never a NaN)
        okm = base[:, s] > 0
        if okm.sum() < 6:
            continue
        V_s = V[okm]
        frac = V_s[:, s, :] / base[okm, s][:, None]        # gcm, year
        q = np.percentile(frac[:, sel], [10, 50, 90], axis=0)
        out["f"][name] = [[round(float(v), 3) for v in row] for row in q]
        # first year below 10 % of 2020 per GCM (None = after 2100), then the 10/50/90 range over the GCMs
        firsts = []
        for gi in range(frac.shape[0]):
            below = np.where(frac[gi, y0:] < 0.10)[0]
            firsts.append(2020 + int(below[0]) if below.size else None)
        known = sorted(v for v in firsts if v is not None)
        share_known = len(known) / len(firsts)
        def pick(p):
            # p-quantile of the first-year distribution with "never" counted as +inf
            order = sorted(firsts, key=lambda v: (v is None, v or 0))
            k = min(len(order) - 1, int(np.ceil(p * len(order))) - 1)
            return order[k]
        out["u10"][name] = [pick(0.10), pick(0.50), pick(0.90)]
        a0 = ar[okm, s, y0]
        aok = a0 > 0
        if aok.sum() >= 6:
            out["a2100"][name] = [round(float(x), 3) for x in np.percentile(ar[okm, s, -1][aok] / a0[aok], [10, 50, 90])]
        out["nGcm"] = int(okm.sum()) if "nGcm" not in out else min(out["nGcm"], int(okm.sum()))
    if not out["f"]:
        return None
    return out
