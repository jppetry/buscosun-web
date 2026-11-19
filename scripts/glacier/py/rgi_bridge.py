#!/usr/bin/env python
"""Phase GH — the RGI 6 bridge with BOTH overlap shares (audit/gletscher-hugonnet.md, rule R1).

The static build links the catalogue to RGI 6 by overlap for GloGEM (`build_static.py` step 4) and keeps only the share of the RGI glacier
lying in ours. A per-glacier value that cannot be weighted (Hugonnet et al. 2021) needs the 1 : 1 question answered, i.e. both shares.
This script recomputes the same geometry from the same inventories and writes one pair per overlapping (glacier, RGI glacier):

  [glacier id, RGI id, intersection km², aG = intersection / OUR area, aR = intersection / RGI area]

It refuses to write when the inventories in the cache do not reproduce the catalogue of the named build (ids and `inv.rgi6`) — a bridge
for another catalogue would attach values to the wrong glaciers.

  C:/dev/buscosun-glacier-cache/.venv/Scripts/python.exe -I scripts/glacier/py/rgi_bridge.py \
      --catalog C:/dev/buscosun-glacier-cache/pub-static/static/20261012-1/catalog.json --out C:/dev/buscosun-glacier-cache/hugonnet/bridge.json
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from shapely.strtree import STRtree  # noqa: E402

import build_static as bs  # noqa: E402
import inv  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", required=True, help="catalog.json of the build the bridge is for")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    t0 = time.time()
    cat = json.load(open(args.catalog, encoding="utf-8"))
    want = {g["id"]: g for g in cat["glaciers"]}

    ch, at, de = bs.load_all(None)
    gls = ch + at + de
    bs.assign_ids(gls)
    for g in gls:
        if g["crs"] == 4326:
            g["wcrs"], g["gw"] = 25832, bs.proj(g["geom"], 4326, 25832)
        else:
            g["wcrs"], g["gw"] = g["crs"], g["geom"]
        g["g3035"] = bs.proj(g["gw"], g["wcrs"], 3035)
    print("inventories:", len(ch), "CH", len(at), "AT", len(de), "DE", f"{time.time()-t0:.0f}s")

    rg = inv.rgi6_region11()
    tree = STRtree([g["g3035"] for g in gls])
    pairs, weights = [], {g["id"]: {} for g in gls}
    for rid, r in rg.items():
        rgeom = bs.proj(r["geom"], 4326, 3035)
        ra = rgeom.area
        for i in tree.query(rgeom):
            gi = gls[i]
            a = gi["g3035"].intersection(rgeom).area
            if a <= 0:
                continue
            pairs.append([gi["id"], rid, round(a / 1e6, 6), round(a / gi["g3035"].area, 6), round(a / ra, 6)])
            if a / ra >= 0.02:
                weights[gi["id"]][rid] = round(a / ra, 4)   # the build's own weights (step 4), for the identity check below

    # identity check against the catalogue of the build: same ids, and the same `inv.rgi6` by the build's own rule
    ids = {g["id"] for g in gls}
    problems = []
    if ids != set(want):
        problems.append(f"ids differ: {len(ids - set(want))} only here, {len(set(want) - ids)} only in the catalogue")
    bad = 0
    for g in gls:
        w = want.get(g["id"])
        if not w:
            continue
        mine = g["invId"] if g["country"] == "DE" else (max(weights[g["id"]].items(), key=lambda kv: kv[1])[0] if weights[g["id"]] else None)
        if mine != w["inv"].get("rgi6"):
            bad += 1
    if bad:
        problems.append(f"inv.rgi6 differs for {bad} glaciers")
    if problems:
        raise SystemExit("the cache does not reproduce the catalogue of build " + cat["build"] + ": " + "; ".join(problems))

    pairs.sort(key=lambda p: (p[0], p[1]))
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"schema": 1, "kind": "glacier/rgi-bridge", "build": cat["build"], "rgiGlaciers": len(rg), "glaciers": len(gls), "pairs": pairs},
                  f, ensure_ascii=False, separators=(",", ":"))
    print("bridge:", len(pairs), "pairs,", sum(1 for w in weights.values() if w), "glaciers with an RGI share >= 2 %, identity check passed,", f"{time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
