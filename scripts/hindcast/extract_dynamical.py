"""extract_dynamical.py — AP10a: dynamical.org forecast archives (Icechunk v2 on AWS Open Data, CC BY 4.0 + ECMWF terms
for the ECMWF sets) → hindcast cache.

Datasets (STAC https://stac.dynamical.org/<slug>/collection.json, asset `icechunk`; measured 19.09.):
  ifs-ens   ecmwf-ifs-ens-forecast-15-day-0-25-degree  init 2024-04-01 →, 00z, 51 members (0 = control), 85 leads 0–360 h
            chunks (1, 85, 51, 32, 32): one DACH read = 4 chunks ≈ 15 MiB per variable and init
  aifs      ecmwf-aifs-single-forecast                 init 2024-04-01 →, 4 runs/day, 61 leads 0–360 h (6-hourly)
            chunks (1, 61, 241, 240): DACH in one chunk ≈ 2.5 MiB per variable and init
  icon-eu   dwd-icon-eu-forecast-5-day                 init 2026-02-10 →, 4 runs/day, 93 leads 0–120 h
Units as stored by dynamical: °C, Pa, %, m/s, precipitation as a RATE kg m−2 s−1 averaged over the preceding lead
step (deaccumulated by dynamical). Values are binary-rounded floats; the cache keeps them as float32 (lossless).

The read loads the chunks covering the DACH box once per (dataset, variable, init) and keeps ONLY the cells of
cells/extract-<grid>.json (ecmwf025 for the ECMWF sets, icon_eu for ICON-EU), selected by exact coordinate.
Members are kept for the σ_ens variables of the IFS ENS (t2m, u10, v10, precip, gust); every other variable keeps
member 0 (the control = the `ifs_hres` stand-in, V-HC stand-in list).

Cache: cache/dyn-<ds>/<variable>/<YYYYMMDDHH>.hcv.gz, format HCV1 (see extract_openmeteo.py) with dtype float32,
shape [n cells, n members, n leads] (members = 1 unless listed). Resumable: an existing file is skipped.

  .venv/Scripts/python.exe scripts/hindcast/extract_dynamical.py --ds ifs-ens --from 2026-08-01 --to 2026-09-19 [--vars …] [--threads 6]
"""
import argparse, gzip, io, json, os, struct, sys, time, threading
import datetime as dt
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np
import icechunk, xarray as xr
from zarr.storage import WrapperStore

ROOT = os.environ.get("HINDCAST_ROOT", "C:/dev/buscosun-hindcast")

DATASETS = {
    "ifs-ens": {"slug": "ecmwf-ifs-ens-forecast-15-day-0-25-degree", "bucket": "dynamical-ecmwf-ifs-ens",
                "prefix": "ecmwf-ifs-ens-forecast-15-day-0-25-degree/v0.1.0.icechunk/", "grid": "ecmwf025",
                "vars": ["temperature_2m", "wind_u_10m", "wind_v_10m", "precipitation_surface", "wind_gust_10m",
                         "dew_point_temperature_2m", "total_cloud_cover_atmosphere", "pressure_surface",
                         "temperature_850hpa", "temperature_925hpa"],
                "members": {"temperature_2m", "wind_u_10m", "wind_v_10m", "precipitation_surface", "wind_gust_10m"},
                "licence": "CC BY 4.0 (dynamical.org) + ECMWF Terms of Use"},
    "aifs": {"slug": "ecmwf-aifs-single-forecast", "bucket": "dynamical-ecmwf-aifs-single",
             "prefix": "ecmwf-aifs-single-forecast/v0.1.0.icechunk/", "grid": "ecmwf025",
             "vars": ["temperature_2m", "dew_point_temperature_2m", "wind_u_10m", "wind_v_10m", "precipitation_surface",
                      "total_cloud_cover_atmosphere", "pressure_surface", "temperature_850hpa", "temperature_925hpa"],
             "members": set(), "licence": "CC BY 4.0 (dynamical.org) + ECMWF Terms of Use"},
    "icon-eu": {"slug": "dwd-icon-eu-forecast-5-day", "bucket": "dynamical-dwd-icon-eu",
                "prefix": "dwd-icon-eu-forecast-5-day/v0.2.0.icechunk/", "grid": "icon_eu",
                "vars": ["temperature_2m", "dew_point_temperature_2m", "wind_u_10m", "wind_v_10m", "wind_gust_10m",
                         "precipitation_surface", "total_cloud_cover_atmosphere", "cloud_cover_low", "cloud_cover_medium",
                         "cloud_cover_high", "pressure_surface"],
             "members": set(), "licence": "CC BY 4.0 (dynamical.org); Datenbasis: Deutscher Wetterdienst"},
}

LOCK = threading.Lock()


class CountingStore(WrapperStore):
    """Counts the bytes the store hands to zarr (= the chunk objects/ranges fetched from S3, compressed) — the transfer
    per source and route that the log must carry (RK4, V7). zarr reads sharded arrays through get_ranges[_sync], plain
    ones through get[_sync]; every path is wrapped (measured 19.09.: 2.57 MB for one AIFS variable and init, values
    identical to the unwrapped store)."""

    def __init__(self, store):
        super().__init__(store)
        self.nbytes = 0
        self.requests = 0

    def _add(self, b):
        if b is not None:
            with LOCK:
                self.nbytes += len(b); self.requests += 1

    async def get(self, key, prototype, byte_range=None):
        b = await self._store.get(key, prototype, byte_range); self._add(b); return b

    def get_sync(self, key, *, prototype=None, byte_range=None):
        b = self._store.get_sync(key, prototype=prototype, byte_range=byte_range); self._add(b); return b

    async def get_ranges(self, key, byte_ranges, *, prototype, **kw):
        async for group in self._store.get_ranges(key, byte_ranges, prototype=prototype, **kw):
            for _, b in group:
                self._add(b)
            yield group

    def get_ranges_sync(self, key, byte_ranges, *, prototype, **kw):
        res = self._store.get_ranges_sync(key, byte_ranges, prototype=prototype, **kw)
        for _, b in res:
            self._add(b)
        return res

    async def _get_many(self, requests):
        async for key, b in self._store._get_many(requests):
            self._add(b)
            yield key, b

    async def get_partial_values(self, prototype, key_ranges):
        res = await self._store.get_partial_values(prototype, key_ranges)
        for b in res:
            self._add(b)
        return res


def open_ds(d):
    storage = icechunk.s3_storage(bucket=d["bucket"], prefix=d["prefix"], region="us-west-2", anonymous=True)
    repo = icechunk.Repository.open(storage)
    sess = repo.readonly_session("main")
    cs = CountingStore(sess.store)
    return xr.open_zarr(cs, consolidated=False, chunks=None), sess.snapshot_id, cs


def write_hcv(path, header, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    h = json.dumps(header, separators=(",", ":")).encode("utf-8")
    buf = io.BytesIO()
    buf.write(b"HCV1"); buf.write(struct.pack("<I", len(h))); buf.write(h)
    buf.write(np.ascontiguousarray(data, dtype="<f4").tobytes())
    tmp = f"{path}.tmp{os.getpid()}.{threading.get_ident()}"
    with open(tmp, "wb") as f:
        f.write(gzip.compress(buf.getvalue(), compresslevel=6))
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ds", required=True, choices=sorted(DATASETS))
    ap.add_argument("--from", dest="from_", required=True)
    ap.add_argument("--to", required=True)
    ap.add_argument("--vars")
    ap.add_argument("--hours", help="init hours to keep, e.g. 0,12")
    ap.add_argument("--threads", type=int, default=6)
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    d = DATASETS[args.ds]
    t_start = time.time()
    ds, snapshot, counter = open_ds(d)
    cells = json.load(open(os.path.join(ROOT, "cells", f"extract-{d['grid']}.json"), encoding="utf-8"))
    lat_axis = ds.latitude.values; lon_axis = ds.longitude.values
    # exact coordinate lookup (cells.mjs writes lat/lon rounded to 1e-6)
    lat_ix = {round(float(v), 6): i for i, v in enumerate(lat_axis)}
    lon_ix = {round(((float(v) + 180) % 360) - 180, 6): i for i, v in enumerate(lon_axis)}
    rows, cols = [], []
    for la, lo in cells["latlon"]:
        rows.append(lat_ix[round(la, 6)]); cols.append(lon_ix[round(((lo + 180) % 360) - 180, 6)])
    rows = np.array(rows); cols = np.array(cols)
    r0, r1, c0, c1 = rows.min(), rows.max(), cols.min(), cols.max()
    inits = ds.init_time.values
    d0 = np.datetime64(args.from_); d1 = np.datetime64(args.to) + np.timedelta64(1, "D")
    sel = [i for i, t in enumerate(inits) if d0 <= t < d1]
    if args.hours:
        hs = set(int(h) for h in args.hours.split(","))
        sel = [i for i in sel if int(str(inits[i])[11:13]) in hs]
    variables = args.vars.split(",") if args.vars else d["vars"]
    leads_h = (ds.lead_time.values / np.timedelta64(1, "h")).astype(int).tolist()
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    os.makedirs(os.path.join(ROOT, "log"), exist_ok=True)
    logf = os.path.join(ROOT, "log", f"dyn-{args.ds}-{stamp}.jsonl")
    jobs = []
    for i in sel:
        init = str(inits[i])[:13].replace("-", "").replace("T", "")
        for v in variables:
            out = os.path.join(ROOT, "cache", f"dyn-{args.ds}", v, f"{init}.hcv.gz")
            if not os.path.exists(out):
                jobs.append((i, init, v, out))
    print(f"[dyn] {args.ds} snapshot {snapshot} · {len(sel)} inits {args.from_}…{args.to} · {len(variables)} vars · {len(jobs)} to read (of {len(sel) * len(variables)}) · box rows {r0}-{r1} cols {c0}-{c1} · log {logf}", flush=True)
    if args.dry or not jobs:
        # a finished range still reports (V7: a re-run transfers 0 bytes beyond the store metadata of the open)
        summary = {"kind": "summary", "ds": args.ds, "from": args.from_, "to": args.to, "inits": len(sel), "jobs": len(jobs), "read": 0, "failed": 0,
                   "bytes": 0, "requests": 0, "metaBytes": counter.nbytes, "dry": bool(args.dry), "s": round(time.time() - t_start, 1)}
        if not args.dry:
            open(logf, "a").write(json.dumps(summary) + "\n")
        print(json.dumps(summary), flush=True)
        return
    meta_bytes, meta_req = counter.nbytes, counter.requests
    have_member = "ensemble_member" in ds.dims
    stats = {"read": 0, "failed": 0, "cells": 0}

    def one(job):
        i, init, v, out = job
        t0 = time.time()
        for attempt in range(3):
            try:
                a = ds[v].isel(init_time=i, latitude=slice(int(r0), int(r1) + 1), longitude=slice(int(c0), int(c1) + 1)).values
                break
            except Exception as e:
                err = f"{type(e).__name__}: {e}"
                time.sleep(3 * (attempt + 1))
        else:
            with LOCK:
                stats["failed"] += 1
                open(logf, "a").write(json.dumps({"init": init, "var": v, "ok": False, "error": err[:300]}) + "\n")
            return
        # a: (lead, [member,] lat, lon)
        rr, cc = rows - r0, cols - c0
        if have_member:
            if v in d["members"]:
                sub = a[:, :, rr, cc]                 # lead, member, cell
            else:
                sub = a[:, 0:1, rr, cc]
            data = np.transpose(sub, (2, 1, 0))       # cell, member, lead
            members = list(range(sub.shape[1]))
        else:
            sub = a[:, rr, cc]                        # lead, cell
            data = np.transpose(sub, (1, 0))[:, None, :]
            members = [None]
        header = {"format": "HCV1", "provider": "dynamical.org", "dataset": d["slug"], "licence": d["licence"],
                  "icechunk": {"bucket": d["bucket"], "prefix": d["prefix"], "snapshot": snapshot},
                  "grid": d["grid"], "cellsHash": cells["hash"], "n": int(data.shape[0]), "members": members,
                  "nt": int(data.shape[2]), "shape": list(data.shape), "dtype": "float32", "var": v,
                  "units": ds[v].attrs.get("units"), "init": init, "leadsH": leads_h,
                  "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                  "transfer": {"boxShape": list(a.shape), "boxBytesDecoded": int(a.nbytes)}, "complete": True}
        write_hcv(out, header, data.astype(np.float32))
        with LOCK:
            stats["read"] += 1
            open(logf, "a").write(json.dumps({"init": init, "var": v, "ok": True, "s": round(time.time() - t0, 2), "nanShare": float(np.isnan(data).mean())}) + "\n")
            if stats["read"] % 25 == 0:
                print(f"[dyn] {args.ds} {stats['read']}/{len(jobs)} · {time.time() - t_start:.0f} s", flush=True)

    with ThreadPoolExecutor(args.threads) as ex:
        list(ex.map(one, jobs))
    summary = {"kind": "summary", "ds": args.ds, "from": args.from_, "to": args.to, "inits": len(sel), "jobs": len(jobs), **stats,
               "bytes": counter.nbytes - meta_bytes, "requests": counter.requests - meta_req, "metaBytes": meta_bytes, "s": round(time.time() - t_start, 1)}
    open(logf, "a").write(json.dumps(summary) + "\n")
    print(json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
