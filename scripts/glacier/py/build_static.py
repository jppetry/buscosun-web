#!/usr/bin/env python
"""Static build of the glacier data line (Phase GL, plan §6): catalogue, points, outlines (3 levels + epochs), hypsometry,
series, projection, official numbers, sources, report. Output goes to `<out>/static/<build>/` (the data repo's `v1/`).

  C:/dev/buscosun-glacier-cache/.venv/Scripts/python.exe -I scripts/glacier/py/build_static.py --out C:/dev/buscosun-glacier/v1 [--build 20261011-1] [--limit N] [--no-dem]

All inputs come from the cache (`C:/dev/buscosun-glacier-cache/raw`, outside every repo). Geometry runs in the inventory's native
projected CRS (metres); only the final coordinates are WGS84 lon/lat rounded to 5 decimals (≈ 1 m).
"""
import argparse
import datetime
import gzip
import json
import math
import os
import sys
import time
import warnings

import numpy as np
from pyproj import Transformer
from shapely import make_valid
from shapely.geometry import mapping, shape, Polygon, MultiPolygon, Point
from shapely.geometry.polygon import orient
from shapely.ops import transform as shp_transform, unary_union
from shapely.strtree import STRtree

warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.dirname(__file__))
import inv  # noqa: E402
import series as ser  # noqa: E402
import official_data  # noqa: E402

TOL = {1: 60.0, 2: 15.0, 3: 4.0}
EPOCH_TOL = 15.0
AREA_TOL = 0.02  # acceptance in the builder; the contract's 3 % must still hold after the lon/lat rounding (verifier recomputes from the output)
BAND_M = 50
RAW = inv.RAW
DEM_DIR = RAW + "dem/"
SNAP_DIR = "C:/dev/buscosun-glacier-cache/spike"

_T = {}


def tr(a, b):
    k = (a, b)
    if k not in _T:
        _T[k] = Transformer.from_crs(a, b, always_xy=True)
    return _T[k]


def proj(geom, a, b):
    if a == b:
        return geom
    t = tr(a, b)
    return shp_transform(lambda x, y, z=None: t.transform(x, y), geom)


def round_geom(g, nd=5):
    def r(c):
        return [round(c[0], nd), round(c[1], nd)] if isinstance(c[0], (int, float)) else [r(x) for x in c]
    m = mapping(g)
    m["coordinates"] = r(m["coordinates"])
    return m


def valid_poly(g):
    if g.is_empty:
        return g
    if not g.is_valid:
        g = make_valid(g)
    if g.geom_type == "GeometryCollection":
        g = unary_union([p for p in g.geoms if p.geom_type in ("Polygon", "MultiPolygon")])
    return g


def simplify_level(geom_work, tol, area_m2):
    """Douglas–Peucker with a tolerance scaled to the glacier (small ones would collapse at 60 m), then the ±3 % rule."""
    eff = max(1.5, min(tol, 0.08 * math.sqrt(max(area_m2, 1.0))))
    while True:
        s = valid_poly(geom_work.simplify(eff, preserve_topology=True))
        if (not s.is_empty) and abs(s.area / geom_work.area - 1) <= AREA_TOL:
            return s, eff, False
        if eff <= 1.6:
            return geom_work, eff, True  # level rejected for this glacier: the original geometry stands in
        eff = max(1.5, eff / 2)


def ring_area_km2(ring):
    """Equirectangular ring area — the SAME formula as `ringAreaKm2` in src/glacier/glacierContract.ts (the verifier recomputes with it)."""
    if len(ring) < 4:
        return 0.0
    lat0 = sum(p[1] for p in ring) / len(ring)
    kx, ky = 111.320 * math.cos(math.radians(lat0)), 110.574
    a = 0.0
    for i in range(len(ring) - 1):
        a += (ring[i][0] * kx) * (ring[i + 1][1] * ky) - (ring[i + 1][0] * kx) * (ring[i][1] * ky)
    return abs(a) / 2


def geom_area_km2(m):
    polys = [m["coordinates"]] if m["type"] == "Polygon" else m["coordinates"]
    return sum((ring_area_km2(r) if i == 0 else -ring_area_km2(r)) for poly in polys for i, r in enumerate(poly))


def to_ll_rounded(g_work, work_crs, target_km2=None, tol=0.025):
    """WGS84 lon/lat coordinates with as few decimals as keep the outline valid AND within `tol` of the target area (very small
    glaciers need 6–7 decimals; 5 decimals = 1 m would move a 700 m² outline by more than the 3 % of the contract)."""
    ll = proj(g_work, work_crs, 4326)
    for nd in (5, 6, 7):
        m = round_geom(ll, nd)
        if not shape(m).is_valid:
            continue
        if target_km2 and abs(geom_area_km2(m) / target_km2 - 1) > tol:
            continue
        return m
    return mapping(ll)


def wjson(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return os.path.getsize(path)


def gz_size(path):
    return len(gzip.compress(open(path, "rb").read(), 6))


# --------------------------------------------------------------------------------------------------------------------
def load_all(limit=None):
    ch = inv.ch_current(); at = inv.at_current(); de = inv.de_current()
    if limit:
        ch, at = ch[:limit], at[:limit]
    return ch, at, de


def assign_ids(gls):
    """Unique names get the plain slug, duplicates/nameless the inventory id appended (stable under rebuilds)."""
    counts = {}
    for g in gls:
        if g["name"]:
            counts[(g["country"], inv.slug(g["name"]))] = counts.get((g["country"], inv.slug(g["name"])), 0) + 1
    for g in gls:
        base = inv.slug(g["name"]) if g["name"] else ""
        invs = inv.slug(str(g["invId"]))
        unique = base and counts[(g["country"], base)] == 1
        slug = base if unique else (f"{base}-{invs}" if base else f"nn-{invs}")
        g["id"] = f"gl_{g['country'].lower()}_{slug}"
    ids = [g["id"] for g in gls]
    assert len(set(ids)) == len(ids), "duplicate ids"


def debris_class_ch(share):
    return 0 if share < 0.05 else 1 if share < 0.20 else 2 if share < 0.50 else 3


def build(args):
    t0 = time.time()
    build_id = args.build
    out_dir = os.path.join(args.out, "static", build_id)
    os.makedirs(out_dir, exist_ok=True)
    rep = {"build": build_id, "steps": {}, "warnings": []}

    # 1 — inventories of record
    ch, at, de = load_all(args.limit)
    gls = ch + at + de
    assign_ids(gls)
    print("inventories:", len(ch), "CH", len(at), "AT", len(de), "DE", f"{time.time()-t0:.0f}s")
    deb = {} if args.limit else inv.ch_debris_share()

    # 2 — geometry in the working CRS (metres) and in EPSG:3035 (matching)
    for g in gls:
        if g["crs"] == 4326:
            g["wcrs"] = 25832
            g["gw"] = proj(g["geom"], 4326, 25832)
        else:
            g["wcrs"] = g["crs"]
            g["gw"] = g["geom"]
        g["g3035"] = proj(g["gw"], g["wcrs"], 3035)
        c = g["gw"].centroid
        lon, lat = tr(g["wcrs"], 4326).transform(c.x, c.y)
        g["lat"], g["lon"] = round(lat, 5), round(lon, 5)
        g["areaWork_km2"] = g["gw"].area / 1e6

    # 3 — catalogue entries
    cat = []
    for g in gls:
        if g["country"] == "CH":
            area = {"km2": round(g["area_km2"], 6), "refYear": str(g["refYear"]), "source": "SGI2016"}
            zsrc = "swissALTI3D 2019 (SGI2016)"
            invids = {"sgi": g["invId"]}
            dbr = debris_class_ch(deb[g["invId"]]) if g["invId"] in deb else None
        elif g["country"] == "AT":
            area = {"km2": round(g["area_km2"], 6), "refYear": g["refYear"], "source": "AGI5"}
            zsrc = "DGM Österreich (AGI 5)"
            invids = {"agi5": g["invId"]}
            dbr = g.get("debris")
        else:
            area = {"km2": round(g["area_km2"], 6), "refYear": g["area_ref"], "source": g["area_source"]}
            zsrc = "RGI 6.2 (2003)"
            invids = {"rgi6": g["invId"]}
            dbr = None
        klass = "A" if area["km2"] >= 1 else "B" if area["km2"] >= 0.1 else "C"
        g["entry"] = {
            "id": g["id"], "name": g["name"], "country": g["country"], "region": g["region"], "klass": klass, "area": area,
            "z": list(g["z"]), "zSource": zsrc, "asp": g.get("asp"), "lat": g["lat"], "lon": g["lon"], "inv": invids, "debris": dbr,
        }
        cat.append(g["entry"])
    byid = {g["id"]: g for g in gls}

    # 4 — link RGI 6.2 (GloGEM bridge) by overlap, WGMS FoG and the ÖAV length tables by position
    rg = inv.rgi6_region11()
    rg3035 = {k: proj(v["geom"], 4326, 3035) for k, v in rg.items()}
    tree = STRtree([g["g3035"] for g in gls])
    weights = {g["id"]: {} for g in gls}      # {our id: {rgi id: share of the RGI glacier lying in ours}}
    best_rgi = {}
    for rid, rgeom in rg3035.items():
        ra = rgeom.area
        for i in tree.query(rgeom):
            gi = gls[i]
            a = gi["g3035"].intersection(rgeom).area
            if a <= 0:
                continue
            w = a / ra
            if w >= 0.02:
                weights[gi["id"]][rid] = round(w, 4)
            if rid not in best_rgi or a > best_rgi[rid][1]:
                best_rgi[rid] = (gi["id"], a)
    for gid, wd in weights.items():
        if wd and "rgi6" not in byid[gid]["entry"]["inv"]:
            byid[gid]["entry"]["inv"]["rgi6"] = max(wd.items(), key=lambda kv: kv[1])[0]
    rep["steps"]["rgi6"] = {"rgiGlaciers": len(rg), "oursWithRgi": sum(1 for w in weights.values() if w)}

    at_gls = [g for g in gls if g["country"] in ("AT", "DE")]
    link_at = ser.Linker([g["id"] for g in at_gls], [g["g3035"] for g in at_gls], [g["name"] for g in at_gls])
    fog_gl, fog_mass = ser.wgms_tables()
    fog_link, fog_unlinked = {}, []
    for fid, row in fog_gl.items():
        try:
            lat, lon = float(row["latitude"]), float(row["longitude"])
        except (TypeError, ValueError):
            continue
        nm = (row.get("short_name") or row.get("names") or "").title()
        hit = link_at.at(lat, lon, nm, tol_m=900.0)
        if hit and (hit["sim"] >= 0.35 or hit["dist_m"] <= 250):
            fog_link[fid] = hit["id"]
            byid[hit["id"]]["entry"]["inv"].setdefault("wgms", fid)
        elif fid in fog_mass and any(r[0] >= 2000 for r in fog_mass[fid]):
            fog_unlinked.append({"fog": fid, "name": row.get("short_name"), "country": row["country"], "hit": hit})
    oeav = ser.oeav_length()
    oeav_link, oeav_unlinked = {}, []
    for aut, e in oeav.items():
        if e["lat"] is None:
            oeav_unlinked.append({"aut": aut, "name": e["name"], "why": "no position"})
            continue
        hit = link_at.at(e["lat"], e["lon"], e["name"], tol_m=600.0)
        # a tongue position can sit on a smaller neighbour: when the name fits another candidate better the linker already says so
        if hit:
            oeav_link[aut] = hit["id"]
        else:
            oeav_unlinked.append({"aut": aut, "name": e["name"], "why": "no outline within 600 m"})
    rep["steps"]["link"] = {"fogLinked": len(fog_link), "fogUnlinkedWithRecentBalance": fog_unlinked, "oeavLinked": len(oeav_link),
                            "oeavUnlinked": oeav_unlinked}
    print("linked:", len(fog_link), "FoG,", len(oeav_link), "ÖAV,", f"{time.time()-t0:.0f}s")

    # 5 — leading glaciers (audit §2.4)
    lead_ch = set()
    mb_obs = ser.read_glamos_csv(RAW + "glamos/massbalance_observation.csv")["rows"]
    for r in mb_obs:
        if r["end date of observation"][:4] == "2025" and r["glacier id"]:
            lead_ch.add(r["glacier id"])
    lead_at = {gid for fid, gid in fog_link.items() if fid in fog_mass and any(r[0] >= 2023 for r in fog_mass[fid])}
    lead_at |= {gid for gid in byid if gid.startswith("gl_de_")}
    for g in gls:
        if (g["country"] == "CH" and g["invId"] in lead_ch) or g["id"] in lead_at:
            g["entry"]["lead"] = True
    rep["steps"]["lead"] = {"ch": sum(1 for g in gls if g["country"] == "CH" and g["entry"].get("lead")), "atde": sum(1 for g in gls if g["country"] != "CH" and g["entry"].get("lead")),
                            "ids": sorted(g["id"] for g in gls if g["entry"].get("lead"))}

    # 6 — status (authority only): AGI 5 vanished/vanishing are NOT in the catalogue (excluded from the inventory); the Southern Schneeferner lost status
    vanishing = inv.at_vanishing()
    rep["steps"]["status"] = {"agi5": {"vanished": sum(1 for v in vanishing if v["status"] == "vanished"), "vanishing": sum(1 for v in vanishing if v["status"] == "vanishing")},
                              "deLost": list(inv.DE_LOST)}

    # 7 — outlines (three levels per region) with the area rule; epochs afterwards
    by_region = {}
    stat = {1: {"rejected": 0, "maxDev": 0.0}, 2: {"rejected": 0, "maxDev": 0.0}, 3: {"rejected": 0, "maxDev": 0.0}}
    files = {}
    for g in gls:
        area_m2 = g["gw"].area
        for lv in (1, 2, 3):
            s, eff, rej = simplify_level(g["gw"], TOL[lv], area_m2)
            geom = to_ll_rounded(orient(s, 1.0) if s.geom_type == "Polygon" else s, g["wcrs"], g["area_km2"] if g["country"] != "DE" else None)
            stat[lv]["maxDev"] = max(stat[lv]["maxDev"], abs(s.area / g["gw"].area - 1))
            stat[lv]["rejected"] += 1 if rej else 0
            by_region.setdefault((g["region"], lv), []).append({"type": "Feature", "properties": {"id": g["id"]}, "geometry": geom})
    for (reg, lv), feats in by_region.items():
        p = os.path.join(out_dir, "outline", f"{reg}-L{lv}.json")
        n = wjson(p, {"type": "FeatureCollection", "schema": 1, "kind": "glacier/outline", "build": build_id, "region": reg, "level": lv, "tolM": TOL[lv], "features": feats})
        files[f"outline/{reg}-L{lv}.json"] = [n, gz_size(p)]
    rep["steps"]["outline"] = {"levels": {str(k): v for k, v in stat.items()}, "tol": TOL}
    print("outlines done", f"{time.time()-t0:.0f}s")

    # 8 — epochs (CH SGI 1850/1931/1973/2010, AT GI4 2015): outline of the older inventory with the current glaciers it covers
    cur_tree = STRtree([g["g3035"] for g in gls])
    epoch_areas = {g["id"]: [] for g in gls}  # {id: [[year, km2]]}
    ep_specs = [("SGI1850", 1850, inv.ch_epoch, "CH"), ("SGI1931", 1931, inv.ch_epoch, "CH"), ("SGI1973", 1973, inv.ch_epoch, "CH"), ("SGI2010", 2010, inv.ch_epoch, "CH")]
    ep_all = []
    for label, year, loader, country in ep_specs:
        ep_all.append((label, year, loader(year), country))
    ep_all.append(("GI4", 2015, inv.at_gi4(), "AT"))
    ep_stats = {}
    for label, year, polys, country in ep_all:
        feats_by_reg = {}
        shared = unmatched = 0
        for ep in polys:
            g3035 = proj(ep["geom"], ep["crs"], 3035)
            ids = []
            for i in cur_tree.query(g3035):
                gi = gls[i]
                if gi["country"] != country:
                    continue
                a = gi["g3035"].intersection(g3035).area
                if gi["g3035"].area > 0 and a / gi["g3035"].area >= inv_min_overlap():
                    ids.append(gi["id"])
            ids = sorted(set(ids))
            area_ep_km2 = g3035.area / 1e6
            if len(ids) == 1:
                epoch_areas[ids[0]].append((year, area_ep_km2, label, ep["id"]))
            elif len(ids) > 1:
                shared += 1
            else:
                unmatched += 1
            # region: the region of the first matched glacier, else of the nearest current one
            if ids:
                reg = byid[ids[0]]["region"]
            else:
                c = g3035.centroid
                near = cur_tree.nearest(c)
                reg = gls[int(near)]["region"] if near is not None else None
                if reg is None or gls[int(near)]["country"] != country:
                    continue
            s, eff, _ = simplify_level(proj(ep["geom"], ep["crs"], ep["crs"]), EPOCH_TOL, ep["geom"].area)
            feats_by_reg.setdefault(reg, []).append({"type": "Feature", "properties": {"ids": ids, "e": year, "n": str(ep["id"])}, "geometry": to_ll_rounded(orient(s, 1.0) if s.geom_type == "Polygon" else s, ep["crs"])})
        for reg, feats in feats_by_reg.items():
            p = os.path.join(out_dir, "outline", f"{reg}-e{year}.json")
            n = wjson(p, {"type": "FeatureCollection", "schema": 1, "kind": "glacier/epoch", "build": build_id, "region": reg, "year": year, "source": label, "tolM": EPOCH_TOL, "features": feats})
            files[f"outline/{reg}-e{year}.json"] = [n, gz_size(p)]
        ep_stats[label] = {"polygons": len(polys), "shared": shared, "unmatched": unmatched}
    rep["steps"]["epochs"] = ep_stats
    print("epochs done", f"{time.time()-t0:.0f}s")

    # 9 — hypsometry per region
    hyp_stats = {"glaciers": 0, "noPixels": 0, "maxCoverDev": 0.0}
    if not args.no_dem:
        import hypso
        by_reg_h = {}
        for g in gls:
            h = hypso.band_areas(proj(g["gw"], g["wcrs"], 4326), DEM_DIR, BAND_M)
            hyp_stats["glaciers"] += 1
            if h is None:
                hyp_stats["noPixels"] += 1
                h = {"z0": (g["z"][1] // BAND_M) * BAND_M, "a": [round(g["area_km2"], 4)], "zr": [g["z"][0], g["z"][2]], "px": 0}
            cov = sum(h["a"]) / g["areaWork_km2"] if g["areaWork_km2"] else 1.0
            hyp_stats["maxCoverDev"] = max(hyp_stats["maxCoverDev"], abs(cov - 1)) if h.get("px", 1) > 20 else hyp_stats["maxCoverDev"]
            by_reg_h.setdefault(g["region"], {})[g["id"]] = {"z0": h["z0"], "a": h["a"], "zr": h["zr"], "cov": round(cov, 3)}
        for reg, d in by_reg_h.items():
            p = os.path.join(out_dir, "hypso", f"{reg}.json")
            n = wjson(p, {"schema": 1, "kind": "glacier/hypso", "build": build_id, "region": reg, "bandM": BAND_M,
                          "demRef": "Copernicus DEM GLO-30 (Epoche 2011–2015, Oberfläche); Flächen aus den Umrissen des Inventars", "glaciers": d})
            files[f"hypso/{reg}.json"] = [n, gz_size(p)]
    rep["steps"]["hypso"] = hyp_stats
    print("hypso done", f"{time.time()-t0:.0f}s")

    # 9b — elevation grids of the satellite line (classes A and B, not DE: the four German glaciers get no satellite numbers)
    dem_stats = {"glaciers": 0, "cells": 0}
    if not args.no_dem:
        import dem_grids
        by_reg_d = {}
        for g in gls:
            if g["country"] == "DE" or g["area_km2"] < 0.1:
                continue
            d = dem_grids.grid_for(proj(g["gw"], g["wcrs"], 4326), DEM_DIR)
            if d is None:
                rep["warnings"].append("no DEM grid: " + g["id"])
                continue
            by_reg_d.setdefault(g["region"], {})[g["id"]] = d
            dem_stats["glaciers"] += 1
            dem_stats["cells"] += d["nx"] * d["ny"]
        for reg, d in by_reg_d.items():
            p = os.path.join(out_dir, "dem", f"{reg}.json")
            n = wjson(p, {"schema": 1, "kind": "glacier/dem", "build": build_id, "region": reg, "cell": dem_grids.CELL, "nodata": dem_grids.NODATA,
                          "demRef": "Copernicus DEM GLO-30 (1 Bogensekunde, Int16, Zeile 0 = Nord); Zelle (i, j) deckt [x0 + i, x0 + i + 1] / 3600 Grad Länge und [y1 - j - 1, y1 - j] / 3600 Grad Breite",
                          "glaciers": d})
            files[f"dem/{reg}.json"] = [n, gz_size(p)]
    rep["steps"]["dem"] = dem_stats
    print("dem grids done", f"{time.time()-t0:.0f}s")

    # 9c — snow-line climatology per class-A glacier from TSLA (needs the catalogue file, so it runs after the catalogue is written; see below)

    # 10 — series per region
    ch_len, ch_mass = ser.glamos_length(), ser.glamos_mass()
    series_by_reg = {}
    unlinked_ch = {"length": [], "mass": []}
    sgi2id = {g["invId"]: g["id"] for g in gls if g["country"] == "CH"}
    # Plan §6 "Identität": GLAMOS ids that SGI2016 does not carry are attached by the position GLAMOS itself publishes
    # (glacier_list.csv) — each case goes into the exception table with its reason, nothing is guessed.
    cur_ch = [g for g in gls if g["country"] == "CH"]
    link_ch = ser.Linker([g["id"] for g in cur_ch], [g["g3035"] for g in cur_ch], [g["name"] for g in cur_ch])
    gl_pos = ser.glamos_positions()
    id_exceptions = []
    t2056 = tr(2056, 4326)
    for sid in sorted(set(ch_len) | set(ch_mass)):
        if sid in sgi2id:
            continue
        if sid in gl_pos:
            lon, lat = t2056.transform(gl_pos[sid][0], gl_pos[sid][1])
            hit = link_ch.at(lat, lon, None, tol_m=400.0)
            a_gl = gl_pos[sid][2]
            a_sgi = byid[hit["id"]]["entry"]["area"]["km2"] if hit else None
            if hit and a_gl and not (0.5 <= a_sgi / a_gl <= 2.0):
                id_exceptions.append({"from": sid, "to": None, "reason": f"GLAMOS-ID nicht in SGI2016; der Umriss an der Position ({hit['id']}) hat {a_sgi:.2f} km² gegen {a_gl:.2f} km² bei GLAMOS (Faktor außerhalb 0,5–2) — vermutlich zusammengelegt, Reihe nicht zugeordnet"})
                continue
            if hit:
                sgi2id[sid] = hit["id"]
                byid[hit["id"]]["entry"]["inv"].setdefault("glamos", sid)
                if sid in lead_ch:
                    byid[hit["id"]]["entry"]["lead"] = True
                id_exceptions.append({"from": sid, "to": hit["id"], "reason": f"GLAMOS-ID nicht in SGI2016; Position aus glacier_list.csv liegt {hit['dist_m']} m von der Umrisskante"})
                continue
        id_exceptions.append({"from": sid, "to": None, "reason": "GLAMOS-ID nicht in SGI2016 und ohne Umriss in 400 m — Reihe nicht zugeordnet"})
    rep["steps"]["idExceptions"] = id_exceptions
    def put(gid, entry):
        series_by_reg.setdefault(byid[gid]["region"], {}).setdefault(gid, []).append(entry)
    for sgi, rows in ch_len.items():
        if sgi in sgi2id:
            put(sgi2id[sgi], {"kind": "length", "method": "tongue-survey", "origin": "measured", "source": "GLAMOS (2025), Swiss Glacier Length Change, release 2025", "doi": "10.18750/lengthchange.2025.r2025", "unit": "m", "rows": rows})
        else:
            unlinked_ch["length"].append(sgi)
    for sgi, rows in ch_mass.items():
        if sgi in sgi2id:
            put(sgi2id[sgi], {"kind": "mass", "method": "glaciological", "origin": "measured", "source": "GLAMOS (2025), Swiss Glacier Mass Balance, release 2025 (hydrologisches Jahr, feste Termine)", "doi": "10.18750/massbalance.2025.r2025", "unit": "mm w.e.", "rows": rows})
        else:
            unlinked_ch["mass"].append(sgi)
    for aut, e in oeav.items():
        gid = oeav_link.get(aut)
        if gid and e["rows"]:
            put(gid, {"kind": "length", "method": "tongue-survey", "origin": "measured", "source": "Österreichischer Alpenverein, Gletschermessdienst (PANGAEA, Kellerer-Pirklbauer & Lieb u. a.)", "doi": "10.1594/PANGAEA.971350", "unit": "m", "rows": e["rows"]})
    for fid, rows in fog_mass.items():
        gid = fog_link.get(fid)
        if gid and rows:
            put(gid, {"kind": "mass", "method": "glaciological", "origin": "measured", "source": "WGMS (2026), Fluctuations of Glaciers Database (FoG), 2026-02-10", "doi": "10.5904/wgms-fog-2026-02-10", "unit": "mm w.e.", "rows": rows})
    # area series: the inventory epochs a current glacier is the ONLY member of (shared older outlines give no value)
    for g in gls:
        rows = []
        for year, km2, label, eid in sorted(epoch_areas[g["id"]]):
            rows.append([year, round(km2, 4)])
        cur_year = int(str(g["entry"]["area"]["refYear"])[:4]) if str(g["entry"]["area"]["refYear"])[:4].isdigit() else None
        if g["country"] == "DE":
            rows = [[2003, round(g["rgi_area_km2"], 4)], [2023, round(g["ha2023"] / 100, 4)], [2025, round(g["ha2025"] / 100, 4)]]
            src = "RGI 6.2 (2003) · BAdW (2023, 2025)"
        else:
            rows = [r for r in rows if cur_year is None or r[0] < cur_year] + ([[cur_year, g["entry"]["area"]["km2"]]] if cur_year else [])
            src = {"CH": "SGI1850 · SGI1931 · SGI1973 · SGI2010 · SGI2016", "AT": "GI4 2015 · AGI 5"}[g["country"]]
        if len(rows) >= 2:
            put(g["id"], {"kind": "area", "method": "inventory", "origin": "official", "source": src, "unit": "km²", "rows": sorted(rows)})
    nser = 0
    for reg, d in series_by_reg.items():
        out_s = {}
        for gid, lst in d.items():
            out_s[gid] = lst
            nser += len(lst)
            byid[gid]["entry"].setdefault("ser", sorted({x["kind"] for x in lst}))
        p = os.path.join(out_dir, "series", f"{reg}.json")
        n = wjson(p, {"schema": 1, "kind": "glacier/series", "build": build_id, "region": reg, "glaciers": out_s})
        files[f"series/{reg}.json"] = [n, gz_size(p)]
    rep["steps"]["series"] = {"series": nser, "unlinkedCH": {k: len(v) for k, v in unlinked_ch.items()}, "unlinkedCHIds": {k: sorted(v)[:20] for k, v in unlinked_ch.items()}}
    print("series done", nser, f"{time.time()-t0:.0f}s")

    # 10b — summary for the situation page: newest values per glacier and yearly country means of what was MEASURED
    latest, ctry = {}, {c: {"ba": {}, "len": {}} for c in ("CH", "AT", "DE")}
    for reg, d in series_by_reg.items():
        for gid, lst in d.items():
            e = {}
            for s in lst:
                rows = s["rows"]
                if s["kind"] == "length" and rows:
                    y0, y1, dl = rows[-1]
                    e["len"] = [y1, dl, y0]
                    for r in rows:
                        c = ctry[byid[gid]["country"]]["len"].setdefault(r[1], []); c.append(r[2])
                elif s["kind"] == "mass":
                    rr = [r for r in rows if r[3] is not None]
                    if rr:
                        r = rr[-1]
                        e["ba"] = [r[0], r[3], r[2], r[1]]
                        for r in rr:
                            c = ctry[byid[gid]["country"]]["ba"].setdefault(r[0], []); c.append(r[3])
                elif s["kind"] == "area" and len(rows) >= 2:
                    a0, a1 = rows[0], rows[-1]
                    if a0[1] > 0:
                        e["da"] = [a0[0], a1[0], round((a1[1] / a0[1] - 1) * 100, 1)]
            if e:
                latest[gid] = e
    countries = {}
    for c, d in ctry.items():
        countries[c] = {k: [[y, round(sum(v) / len(v), 1), len(v)] for y, v in sorted(d[k].items()) if y >= 1960 and len(v) >= (3 if k == "len" else 2)] for k in ("ba", "len")}
    p_sum = os.path.join(out_dir, "summary.json")
    files["summary.json"] = [wjson(p_sum, {"schema": 1, "kind": "glacier/summary", "build": build_id, "latest": latest, "countries": countries}), 0]
    files["summary.json"][1] = gz_size(p_sum)

    # 11 — projection (GloGEM CMIP6 v2, region 11)
    gg = ser.glogem_region11()
    proj_by_reg, nproj = {}, 0
    for g in gls:
        pr = ser.projection_for(weights[g["id"]], gg)
        if pr:
            proj_by_reg.setdefault(g["region"], {})[g["id"]] = pr
            nproj += 1
    for reg, d in proj_by_reg.items():
        p = os.path.join(out_dir, "proj", f"{reg}.json")
        n = wjson(p, {"schema": 1, "kind": "glacier/proj", "build": build_id, "region": reg, "model": "GloGEM CMIP6 v2 (Zekollari et al. 2024), 12 GCM",
                      "years": ser.PROJ_YEARS, "ssp": {k: ser.SSP_LABEL[k] for k in ser.SSPS}, "base": "Volumen 2020 = 1; Quantile p10/p50/p90 über 12 Klimamodelle; u10 = erstes Jahr unter 10 % des Volumens von 2020 (null = nach 2100)",
                      "glaciers": d})
        files[f"proj/{reg}.json"] = [n, gz_size(p)]
    rep["steps"]["proj"] = {"glaciers": nproj, "of": len(gls)}

    # 12 — official numbers, sources, points, catalogue
    checked, problems = official_data.verify_against_snapshots(SNAP_DIR)
    rep["steps"]["official"] = {"quotePartsChecked": checked, "problems": problems}
    if problems:
        raise SystemExit("official quotes not verbatim: " + "; ".join(problems))
    name2id = {}
    for g in gls:
        if g["name"]:
            name2id.setdefault(g["name"].lower(), g["id"])
    items = []
    for key, it in official_data.ITEMS:
        it = dict(it)
        gname = it.pop("glacier", None)
        if gname:
            gid = next((g["id"] for g in gls if g["name"] and gname.lower() in g["name"].lower()), None)
            if gid:
                it["glacierId"] = gid
        items.append(it)
    p = os.path.join(out_dir, "official.json")
    files["official.json"] = [wjson(p, {"schema": 1, "kind": "glacier/official", "build": build_id, "items": items}), 0]
    files["official.json"][1] = gz_size(p)

    src_list = [
        {"id": "sgi2016", "label": "Swiss Glacier Inventory SGI2016 (GLAMOS)", "licence": "CC BY 4.0 (DOI-Seite; Widerspruch im Impressum, Klärung offen)", "attribution": "GLAMOS (2020). Swiss Glacier Inventory 2016, release 2020, Glacier Monitoring Switzerland, doi:10.18750/inventory.sgi2016.r2020", "url": "https://doi.org/10.18750/inventory.sgi2016.r2020", "refYear": "2013–2018", "used": "Umrisse, Flächen, Höhen CH"},
        {"id": "sgi-hist", "label": "SGI1850 / SGI1931 / SGI1973 / SGI2010 (GLAMOS)", "licence": "CC BY 4.0 (DOI-Seite; Widerspruch im Impressum, Klärung offen)", "attribution": "GLAMOS, Swiss Glacier Inventories (Maisch et al. 2000; Mannerfelt et al. 2022; Müller et al. 1976; Fischer et al. 2014)", "url": "https://glamos.ch/en/downloads", "refYear": "1850, 1931, 1973, 2010", "used": "frühere Umrisse, Flächenreihe CH"},
        {"id": "agi5", "label": "Austrian Glacier Inventory 5 (AGI 5)", "licence": "CC BY 4.0", "attribution": "Hartig, A. et al. (2026): The Austrian Glacier Inventory GI 5, 2021-2023, as vector files. PANGAEA, doi:10.1594/PANGAEA.991106", "url": "https://doi.org/10.1594/PANGAEA.991106", "refYear": "2021–2023", "used": "Umrisse, Flächen, Höhen AT"},
        {"id": "gi4", "label": "Austrian Glacier Inventory GI 4 (2015)", "licence": "CC BY 3.0", "attribution": "Buckel, J. & Otto, J.-C. (2018): The Austrian Glacier Inventory GI 4 (2015) in ArcGis (shapefile) format. PANGAEA, doi:10.1594/PANGAEA.887415", "url": "https://doi.org/10.1594/PANGAEA.887415", "refYear": "2015", "used": "frühere Umrisse AT"},
        {"id": "rgi6", "label": "Randolph Glacier Inventory 6.2, Region 11 (Brücke, deutsche Umrisse)", "licence": "CC BY 4.0 (RGI Consortium; Bezug über den Server der OGGM-Gruppe)", "attribution": "RGI Consortium (2017). Randolph Glacier Inventory – A Dataset of Global Glacier Outlines: Version 6.0", "url": "https://rgidata.org/versions/", "refYear": "≈ 2003", "used": "Umrisse der vier deutschen Gletscher, Zuordnung zu GloGEM"},
        {"id": "badw", "label": "BAdW / Hochschule München, bayerische Gletscher", "licence": "keine Datenlizenz — nur Zitat", "attribution": "Bayerische Akademie der Wissenschaften und Hochschule München, Pressemitteilung vom 19.03.2026", "url": "https://badw.de/presse/news-pressemitteilungen/artikel/neue-vermessung-zeigt-beschleunigten-gletscherschwund", "refYear": "2023, 2025", "used": "Flächen der vier deutschen Gletscher 2023/2025 (Zitat, Tabelle der Pressemitteilung)"},
        {"id": "glamos-series", "label": "GLAMOS Längenänderung und Massenbilanz (Release 2025)", "licence": "CC BY 4.0 (DOI-Seiten; Widerspruch im Impressum, Klärung offen)", "attribution": "GLAMOS (2025). Swiss Glacier Length Change, release 2025, doi:10.18750/lengthchange.2025.r2025 · Swiss Glacier Mass Balance, release 2025, doi:10.18750/massbalance.2025.r2025", "url": "https://glamos.ch/en/downloads", "refYear": "bis 2025", "used": "Längen- und Massenreihen CH"},
        {"id": "oeav", "label": "Österreichischer Alpenverein — Längenänderungen (PANGAEA)", "licence": "CC BY 4.0 (ab 2016/17), CC BY 3.0 (davor)", "attribution": "Kellerer-Pirklbauer, A. & Lieb, G. K. u. a., Length changes of Austrian glaciers (Jahrgänge 1969/70–2022/23), PANGAEA", "url": "https://doi.org/10.1594/PANGAEA.971350", "refYear": "1969–2023", "used": "Längenreihen AT (2023/24 und 2024/25 stehen dort noch nicht)"},
        {"id": "wgms", "label": "WGMS Fluctuations of Glaciers Database 2026-02-10", "licence": "offen mit Zitierpflicht (laut WGMS gleichwertig CC BY 4.0)", "attribution": "WGMS (2026): Fluctuations of Glaciers (FoG) Database. World Glacier Monitoring Service, Zurich. doi:10.5904/wgms-fog-2026-02-10", "url": "https://doi.org/10.5904/wgms-fog-2026-02-10", "refYear": "bis 2025", "used": "Massenbilanzen AT/DE, Gletscher-IDs"},
        {"id": "glogem", "label": "GloGEM CMIP6 global glacier projections (v2)", "licence": "CC BY 4.0", "attribution": "Zekollari, H. et al. (2024), GloGEM CMIP6 global glacier projections, Zenodo, doi:10.5281/zenodo.17632573", "url": "https://doi.org/10.5281/zenodo.17632573", "refYear": "2015–2100", "used": "Projektion als Spanne je Szenario; Bezug RGI 6, Volumen 2020 = 1"},
        {"id": "copdem", "label": "Copernicus DEM GLO-30", "licence": "Copernicus-DEM-Lizenz (frei, mit Vermerk)", "attribution": "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved", "url": "https://registry.opendata.aws/copernicus-dem/", "refYear": "2011–2015", "used": "Höhenbänder (Hypsometrie)"},
    ]
    p = os.path.join(out_dir, "sources.json")
    files["sources.json"] = [wjson(p, {"schema": 1, "kind": "glacier/sources", "build": build_id, "sources": src_list}), 0]
    files["sources.json"][1] = gz_size(p)

    cat.sort(key=lambda e: e["id"])
    p = os.path.join(out_dir, "catalog.json")
    files["catalog.json"] = [wjson(p, {"schema": 1, "kind": "glacier/catalog", "build": build_id, "builtAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "glaciers": cat}), 0]
    files["catalog.json"][1] = gz_size(p)
    rows = [[e["id"], e["lat"], e["lon"], e["klass"], round(e["area"]["km2"], 4)] for e in cat]
    p = os.path.join(out_dir, "points.json")
    files["points.json"] = [wjson(p, {"schema": 1, "kind": "glacier/points", "build": build_id, "cols": ["id", "lat", "lon", "k", "km2"], "rows": rows}), 0]
    # snow-line climatology (TSLA) — written next to the catalogue it is matched against
    try:
        import tsla_clima
        if os.path.exists(tsla_clima.RAW + "tsla/TABLES.zip"):
            tsla_clima.main(os.path.join(out_dir, "catalog.json"), out_dir)
            for f in sorted(os.listdir(os.path.join(out_dir, "clima"))):
                pth = os.path.join(out_dir, "clima", f)
                files[f"clima/{f}"] = [os.path.getsize(pth), gz_size(pth)]
    except Exception as e:  # the climatology is optional: a failure is a warning, never a missing catalogue
        rep["warnings"].append(f"TSLA climatology not built: {e}")
    files["points.json"][1] = gz_size(p)

    # 13 — report
    cls = {}
    for e in cat:
        k = (e["country"], e["klass"])
        c = cls.setdefault(k, [0, 0.0]); c[0] += 1; c[1] += e["area"]["km2"]
    rep["counts"] = {f"{k[0]}-{k[1]}": {"n": v[0], "km2": round(v[1], 3)} for k, v in sorted(cls.items())}
    rep["totals"] = {c: {"n": sum(1 for e in cat if e["country"] == c), "km2": round(sum(e["area"]["km2"] for e in cat if e["country"] == c), 3)} for c in ("CH", "AT", "DE")}
    rep["files"] = {k: {"bytes": v[0], "gzip": v[1]} for k, v in sorted(files.items())}
    rep["bytesTotal"] = sum(v[0] for v in files.values())
    rep["seconds"] = round(time.time() - t0)
    p = os.path.join(out_dir, "report.json")
    wjson(p, rep)
    # pointer files of the line: read, change only the static part, write (other lines' fields stay — plan §6 "Veröffentlichung")
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for name, kind, patch in (
        ("index.json", "glacier/index", lambda d: d.update({"builtAt": now, "static": {"build": build_id}})),
        ("status.json", "glacier/status", lambda d: (d.setdefault("lines", {}).update({"static": {"build": build_id, "at": now, "glaciers": len(cat)}}), d.update({"checkedAt": now}), d.setdefault("killed", False))),
    ):
        pth = os.path.join(args.out, name)
        d = {}
        if os.path.exists(pth):
            try:
                d = json.load(open(pth, encoding="utf-8"))
            except ValueError:
                d = {}
        d["schema"], d["kind"] = 1, kind
        patch(d)
        wjson(pth, d)
    print("report:", json.dumps(rep["totals"]), "bytes", rep["bytesTotal"], f"{time.time()-t0:.0f}s")
    return out_dir, rep


def inv_min_overlap():
    return 0.5


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="the v1/ directory of the data repo")
    ap.add_argument("--build", default=datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d") + "-1")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--no-dem", action="store_true")
    build(ap.parse_args())
