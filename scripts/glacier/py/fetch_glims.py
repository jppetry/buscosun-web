#!/usr/bin/env python
"""Fetch outlines of named GLIMS submissions from the public GLIMS WFS into the cache (Phase GL, GLAMOS detour — audit/gletscher.md §GL-1b).

The Swiss glacier inventories (SGI1850 / 1931 / 1973 / 2010 / 2016) are also in the GLIMS Glacier Database, submitted by their authors; the
GLIMS service needs no account (https://www.glims.org/geoserver/ows, layer GLIMS:GLIMS_Glacier_Outlines, WGS84, lat/lon axis order in CQL BBOX).
Cache only (`C:/dev/buscosun-glacier-cache/raw/glims`, outside every repo), one request per set, resumable (a finished set is not fetched again).

  C:/dev/buscosun-glacier-cache/.venv/Scripts/python.exe -I scripts/glacier/py/fetch_glims.py [--only sgi2016,sgi1973] [--force]

Each set is a GeoJSON FeatureCollection `<name>.json`: `{ "set", "subm", "line", "fetchedAt", "count", "features": [...] }`.
"""
import argparse
import datetime
import json
import os
import sys
import time
import urllib.parse
import urllib.request

RAW = "C:/dev/buscosun-glacier-cache/raw/glims/"
WFS = "https://www.glims.org/geoserver/ows"
UA = "buscosun-glacier/0.1 (jppetry94@gmail.com)"
# name -> (submission id, line type). The submission ids were identified by geometry (audit/gletscher/glims-identity.md), not by their labels.
SETS = {
    "sgi2016": (869, "glac_bound"),
    "sgi2016-debris": (869, "debris_cov"),
    "sgi2010-a": (596, "glac_bound"),
    "sgi2010-b": (579, "glac_bound"),
    "sgi1973": (599, "glac_bound"),
    "sgi1931": (868, "glac_bound"),
    "sgi1850-a": (594, "glac_bound"),
    "sgi1850-b": (595, "glac_bound"),
}


def get(url, tries=5):
    last = None
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except Exception as e:  # network, 5xx
            last = e
            time.sleep(3 * (a + 1))
    raise RuntimeError(f"{url[:120]}…: {last}")


def fetch_set(name, subm, line):
    q = f"subm_id={subm} AND line_type='{line}'"
    base = (f"{WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=GLIMS:GLIMS_Glacier_Outlines&outputFormat=application/json"
            f"&sortBy=anlys_id&cql_filter={urllib.parse.quote(q)}")
    hits = get(base.replace("request=GetFeature", "request=GetFeature&resultType=hits").replace("&outputFormat=application/json", ""))
    n = int(hits.decode().split('numberMatched="')[1].split('"')[0])
    # ONE request per set (the service answers 30 000 features at once): a paged read of rows that share an `anlys_id` (the debris lines) is not stable
    d = json.loads(get(f"{base}&count={n}"))
    feats = d["features"]
    print(f"  {name}: {len(feats)}/{n}")
    if len(feats) != n:
        raise RuntimeError(f"{name}: {len(feats)} Merkmale statt {n}")
    if line == "glac_bound":
        ids = [f["properties"]["anlys_id"] for f in feats]
        if len(set(ids)) != len(ids):
            raise RuntimeError(f"{name}: doppelte anlys_id")
    return {"set": name, "subm": subm, "line": line, "fetchedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "count": n, "features": feats}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    os.makedirs(RAW, exist_ok=True)
    only = [s for s in args.only.split(",") if s]
    for name, (subm, line) in SETS.items():
        if only and name not in only:
            continue
        path = RAW + name + ".json"
        if os.path.exists(path) and not args.force:
            print(f"{name}: vorhanden ({os.path.getsize(path) // 1024} KiB)")
            continue
        doc = fetch_set(name, subm, line)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        print(f"{name}: {doc['count']} Merkmale, {os.path.getsize(path) // 1024} KiB")


if __name__ == "__main__":
    sys.exit(main())
