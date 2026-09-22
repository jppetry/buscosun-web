"""extract_openmeteo.py — AP10a: Open-Meteo on AWS Open Data (s3://openmeteo, CC BY 4.0) → hindcast cache.

Reads ONLY the source cells listed in <HINDCAST_ROOT>/cells/extract-<grid>.json (built by cells.mjs) from
  --route series  data/<model>/<variable>/chunk_<n>.om            the stitched "day-0" time series
  --route run     data_run/<model>/YYYY/MM/DD/hhmmZ/<variable>.om  whole runs (Open-Meteo keeps ~3 months)
and writes one cache file per om file: cache/<model>/<variable>/<route>/<key>.hcv.gz (format below).

Never downloads a whole om file (kickoff rule): per om file
  1. open (header/trailer) and fetch the LUT region between the first and the last needed row;
  2. pass 1 — every needed row span is read once with a store that RECORDS the data ranges omfiles asks for and
     answers with an exception (omfiles validates the compressed bytes, zeros are refused — measured 19.09.);
     repeated until no new range appears (3 rounds on ICON-D2);
  3. the recorded ranges are fetched concurrently (merged when closer than --gap bytes);
  4. pass 2 — the same reads, now served from memory; the values of the listed cells are kept.
Measured 19.09. on data_run ICON-D2 cloud_cover (18.3 MiB): 5.7 MiB transferred, values equal to a direct read.

Cache format "HCV1" (gzip): b'HCV1' · uint32 LE header length · header JSON (utf-8) · data (int16 LE, shape
[n cells, n times], row-major). int16 = round(value × scale_factor) of the om file — Open-Meteo stores exactly
these integers (pfor_delta_2d_int16), so the cache is lossless against the source; −32768 = missing (NaN).

Resumable: a cache file with `complete: true` is skipped (0 bytes transferred); a series chunk that ends after
the model's data_end_time is written with `complete: false` and re-read next time.

  .venv/Scripts/python.exe scripts/hindcast/extract_openmeteo.py --model dwd_icon_d2 --route run \
      --from 2026-09-01 --to 2026-09-19 [--vars temperature_2m,…] [--hours 0,3,…] [--workers 4] [--files 12]
"""
import argparse, asyncio, gzip, hashlib, io, json, os, struct, sys, time, traceback
import datetime as dt
from concurrent.futures import ProcessPoolExecutor
import numpy as np

ROOT = os.environ.get("HINDCAST_ROOT", "C:/dev/buscosun-hindcast")

MODELS = {
    # model → (grid in cells.mjs, cube source ids it serves, OM variables the producer's adapter reads)
    "dwd_icon_d2": ("icon_d2", ["icon_d2"], [
        "temperature_2m", "relative_humidity_2m", "wind_u_component_10m", "wind_v_component_10m", "wind_gusts_10m",
        "precipitation", "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "pressure_msl",
        "snowfall_height", "temperature_850hPa", "temperature_700hPa", "relative_humidity_850hPa", "relative_humidity_700hPa"]),
    "dwd_icon_eu": ("icon_eu", ["icon_eu"], [
        "temperature_2m", "relative_humidity_2m", "wind_u_component_10m", "wind_v_component_10m", "wind_gusts_10m",
        "precipitation", "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "pressure_msl",
        "snowfall_height", "temperature_925hPa", "temperature_850hPa", "temperature_700hPa",
        "relative_humidity_925hPa", "relative_humidity_850hPa", "relative_humidity_700hPa"]),
    "dwd_icon": ("icon_global_om", ["icon_global"], [
        "temperature_2m", "relative_humidity_2m", "wind_u_component_10m", "wind_v_component_10m", "wind_gusts_10m",
        "precipitation", "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "pressure_msl",
        "temperature_925hPa", "temperature_850hPa", "temperature_700hPa",
        "relative_humidity_925hPa", "relative_humidity_850hPa", "relative_humidity_700hPa"]),
    # ECMWF adapter PARAMS (ecmwf.mjs): t2m td2m u10 v10 gust precip clct ps — no layer clouds.
    "ecmwf_ifs025": ("ecmwf025", ["ifs_hres"], [
        "temperature_2m", "relative_humidity_2m", "wind_u_component_10m", "wind_v_component_10m", "wind_gusts_10m",
        "precipitation", "cloud_cover", "pressure_msl", "surface_pressure",
        "temperature_925hPa", "temperature_850hPa", "temperature_700hPa",
        "relative_humidity_925hPa", "relative_humidity_850hPa", "relative_humidity_700hPa"]),
    # PL_HAS_RH.aifs_single = false: AIFS carries only T on pressure levels in the cube.
    "ecmwf_aifs025_single": ("ecmwf025", ["aifs_single"], [
        "temperature_2m", "relative_humidity_2m", "wind_u_component_10m", "wind_v_component_10m",
        "precipitation", "cloud_cover", "pressure_msl", "surface_pressure",
        "temperature_925hPa", "temperature_850hPa", "temperature_700hPa"]),
    "meteoswiss_icon_ch1": ("icon_ch1_om", ["icon_ch1_eps"], [
        "temperature_2m", "relative_humidity_2m", "wind_u_component_10m", "wind_v_component_10m", "wind_gusts_10m",
        "precipitation", "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "pressure_msl", "snowfall_height"]),
    "meteoswiss_icon_ch2": ("icon_ch2_om", ["icon_ch2_eps"], [
        "temperature_2m", "relative_humidity_2m", "wind_u_component_10m", "wind_v_component_10m", "wind_gusts_10m",
        "precipitation", "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "pressure_msl", "snowfall_height"]),
}

BUCKET = "openmeteo"
CHECK_DIRECT = False

# ─── byte / request accounting (RK4) ───────────────────────────────────────────
import s3fs
STATS = {"requests": 0, "bytes": 0}
_orig_call = s3fs.S3FileSystem._call_s3
async def _counted_call(self, method, *a, **kw):
    out = await _orig_call(self, method, *a, **kw)
    if method == "get_object":
        STATS["requests"] += 1
        STATS["bytes"] += int(out.get("ContentLength", 0) or 0)
    elif method in ("list_objects_v2", "head_object"):
        STATS["requests"] += 1
    return out
s3fs.S3FileSystem._call_s3 = _counted_call

from omfiles import OmFileReaderAsync


async def aw(x):
    return (await x) if hasattr(x, "__await__") else x


class Recorded(Exception):
    pass


class MemStore:
    """fsspec-compatible async store for ONE om file: serves prefetched segments, records or fetches the rest."""
    def __init__(self, fs, path, size):
        self.fs, self.path, self.size = fs, path, size
        self.seg = []
        self.record = None
        self.n = 0
        self.b = 0

    async def _size(self, path):
        return self.size

    def _hit(self, start, end):
        for s, b in self.seg:
            if start >= s and end <= s + len(b):
                return b[start - s:end - s]
        return None

    async def _cat_file(self, path, start=None, end=None, **kw):
        start = 0 if start is None else (start if start >= 0 else self.size + start)
        end = self.size if end is None else (end if end >= 0 else self.size + end)
        h = self._hit(start, end)
        if h is not None:
            return h
        if self.record is not None:
            self.record.append((start, end))
            raise Recorded()
        data = await self.fs._cat_file(self.path, start=start, end=end)
        self.n += 1; self.b += len(data)
        self.seg.append((start, data))
        return data

    async def fetch(self, ranges, sem):
        async def one(a, b):
            async with sem:
                d = await self.fs._cat_file(self.path, start=a, end=b)
                self.n += 1; self.b += len(d)
                self.seg.append((a, d))
        await asyncio.gather(*[one(a, b) for a, b in ranges])


def merge(ranges, gap):
    rs = sorted(set(ranges))
    out = [list(rs[0])]
    for a, b in rs[1:]:
        if a <= out[-1][1] + gap:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return [tuple(x) for x in out]


def load_cells(grid):
    doc = json.load(open(os.path.join(ROOT, "cells", f"extract-{grid}.json"), encoding="utf-8"))
    rows = {}
    for k, (r, c) in enumerate(doc["cells"]):
        rows.setdefault(r, []).append((c, k))
    return doc, rows


def write_hcv(path, header, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    h = json.dumps(header, separators=(",", ":")).encode("utf-8")
    buf = io.BytesIO()
    buf.write(b"HCV1")
    buf.write(struct.pack("<I", len(h)))
    buf.write(h)
    buf.write(np.ascontiguousarray(data, dtype="<i2").tobytes())
    tmp = f"{path}.tmp{os.getpid()}"
    with open(tmp, "wb") as f:
        f.write(gzip.compress(buf.getvalue(), compresslevel=6))
    os.replace(tmp, path)


def read_hcv_header(path):
    with gzip.open(path, "rb") as f:
        head = f.read(8)
        n = struct.unpack("<I", head[4:8])[0]
        return json.loads(f.read(n).decode("utf-8"))


async def extract_file(fs, key, out_path, cells_doc, rows, meta_extra, sem, gap):
    """One om file → one cache file. Returns a log record."""
    t0 = time.time()
    path = f"{BUCKET}/{key}"
    size = await fs._size(path)
    st = MemStore(fs, path, size)
    rd = await OmFileReaderAsync.from_fsspec(st, path)
    shape, scale, offset = tuple(rd.shape), float(rd.scale_factor), float(rd.add_offset)
    # Open-Meteo changed the layout of the series files: chunks up to ~2025-01 store the area FLAT
    # (ny*nx, nt), later ones as (ny, nx, nt) — measured 20.09. on dwd_icon_d2 chunk_3967 (906 390 = 746 x 1215)
    # against chunk_4100. A grid row stays contiguous in the flat layout (index = r*nx + c), so the same
    # row-span reading works; only the selection and the axis of the result differ.
    flat = len(shape) == 2
    gnx = int(cells_doc["gridDef"]["nx"]) if flat else None
    if flat and shape[0] != int(cells_doc["gridDef"]["ny"]) * gnx:
        raise ValueError(f"{key}: flat shape {shape[0]} != ny*nx {cells_doc['gridDef']['ny']}x{gnx}")

    def sel(r, c0, c1):
        """selection of row r, columns [c0, c1] over all times, in this file's layout"""
        return (slice(r * gnx + c0, r * gnx + c1 + 1), slice(None)) if flat else (slice(r, r + 1), slice(c0, c1 + 1), slice(None))

    def col(arr, i):
        """the i-th column of a row span read with `sel`"""
        return arr[i, :] if flat else arr[0, i, :]

    nrow_all = shape[0]
    rmin, rmax = min(rows), max(rows)
    cmin = min(c for r in rows.values() for c, k in r)
    cmax = max(c for r in rows.values() for c, k in r)
    # LUT: each probe read fetches its LUT piece(s) first and the data chunk LAST (omfiles resolves the offset
    # before it reads the chunk); the LUT region between the pieces of the first and the last needed row covers
    # every row in between and is prefetched in one range.
    lut = []
    for rr, cc in ((rmin, cmin), (rmax, cmax)):
        k = len(st.seg)
        await rd.read_array(sel(rr, cc, cc))
        pieces = [(s, s + len(b)) for s, b in st.seg[k:]]
        lut += pieces[:-1]
    if lut:
        a, b = min(p[0] for p in lut), max(p[1] for p in lut)
        await st.fetch([(a, b)], sem)
    # pass 1: record, fetch, repeat
    rounds = 0
    async def read_row(r, cs, swallow):
        cols = [c for c, k in cs]
        try:
            return r, np.asarray(await rd.read_array(sel(r, min(cols), max(cols))))
        except Recorded:
            if swallow:
                return r, None
            raise
        except Exception:
            if swallow:
                return r, None
            raise
    while True:
        st.record = []
        await asyncio.gather(*[read_row(r, cs, True) for r, cs in rows.items()])
        rec, st.record = st.record, None
        rounds += 1
        if not rec or rounds > 6:
            break
        await st.fetch(merge(rec, gap), sem)
    # pass 2: from memory
    nt = shape[-1]
    data = np.full((cells_doc["n"], nt), -32768, dtype=np.int32)
    got = await asyncio.gather(*[read_row(r, cs, False) for r, cs in rows.items()])
    for r, arr in got:
        cs = rows[r]
        c0 = min(c for c, k in cs)
        for c, k in cs:
            v = col(arr, c - c0).astype(np.float64)
            q = np.where(np.isnan(v), -32768, np.rint((v - offset) * scale))
            data[k, :] = q
    if np.any((data < -32768) | (data > 32767)):
        raise ValueError(f"{key}: value outside int16 after scaling (scale {scale})")
    # exactness guard: the stored integer must reproduce the float omfiles returned
    for r, arr in got[:3]:
        cs = rows[r]; c0 = min(c for c, k in cs)
        c, k = cs[0]
        v = col(arr, c - c0)
        back = np.where(data[k] == -32768, np.nan, data[k] / scale + offset)
        if not np.allclose(back, v, rtol=0, atol=1e-4, equal_nan=True):
            raise ValueError(f"{key}: int16 cache is not lossless (scale {scale})")
    header = {
        "format": "HCV1", "provider": "open-meteo", "licence": "CC BY 4.0", "bucket": BUCKET, "key": key,
        "grid": cells_doc["grid"], "cellsHash": cells_doc["hash"], "n": int(cells_doc["n"]), "nt": int(nt),
        "shape": list(shape), "scale": scale, "offset": offset, "missing": -32768,
        "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "transfer": {"bytes": st.b, "requests": st.n + 1, "fileBytes": size, "rounds": rounds},
        **meta_extra,
    }
    # valid times: data_run files carry a `time` child (epoch s); series chunks follow from the chunk index
    if header.get("route") == "run":
        # omfiles' async children are Rust coroutines (not `inspect.iscoroutine`) — always await (19.09.)
        tchild = await aw(rd.get_child_by_name("time"))
        header["times"] = [int(x) for x in np.asarray(await aw(tchild.read_array((slice(None),)))).tolist()]
        header["init"] = int(await aw((await aw(rd.get_child_by_name("forecast_reference_time"))).read_scalar()))
        if len(header["times"]) != nt:
            raise ValueError(f"{key}: {len(header['times'])} times for {nt} steps")
    if CHECK_DIRECT:
        # independent control: a fresh reader on the plain store (no MemStore) must return the same values
        ref = await OmFileReaderAsync.from_fsspec(fs, path)
        rlist = sorted(rows)
        for r in rlist[:: max(1, len(rlist) // 4)][:5]:
            cs = rows[r]; cols = [c for c, k in cs]
            a = np.asarray(await ref.read_array(sel(r, min(cols), max(cols))))
            for c, k in cs:
                back = np.where(data[k] == -32768, np.nan, data[k] / scale + offset)
                if not np.allclose(back, col(a, c - min(cols)), rtol=0, atol=1e-4, equal_nan=True):
                    raise ValueError(f"{key}: direct read differs at row {r} col {c}")
        header["checkedDirect"] = True
    write_hcv(out_path, header, data.astype(np.int16))
    return {"key": key, "out": out_path, "ok": True, "s": round(time.time() - t0, 2), "bytes": header["transfer"]["bytes"],
            "requests": header["transfer"]["requests"], "fileBytes": size, "rounds": rounds, "complete": header.get("complete", True)}


def plan_files(args, fs_sync):
    """List (key, out_path, meta) for the requested model/route/vars/days."""
    grid = MODELS[args.model][0]
    variables = args.vars.split(",") if args.vars else MODELS[args.model][2]
    d0 = dt.date.fromisoformat(args.from_)
    d1 = dt.date.fromisoformat(args.to)
    out = []
    if args.route == "run":
        hours = set(int(h) for h in args.hours.split(",")) if args.hours else None
        day = d0
        while day <= d1:
            prefix = f"{BUCKET}/data_run/{args.model}/{day:%Y/%m/%d}"
            try:
                runs = sorted(p.split("/")[-1] for p in fs_sync.ls(prefix) if p.endswith("Z"))
            except FileNotFoundError:
                runs = []
            for run in runs:
                hh = int(run[:2])
                if hours is not None and hh not in hours:
                    continue
                files = set(p.split("/")[-1] for p in fs_sync.ls(f"{prefix}/{run}"))
                for v in variables:
                    if f"{v}.om" not in files:
                        continue
                    init = f"{day:%Y%m%d}{hh:02d}"
                    key = f"data_run/{args.model}/{day:%Y/%m/%d}/{run}/{v}.om"
                    outp = os.path.join(ROOT, "cache", args.model, v, "run", f"{init}.hcv.gz")
                    out.append((key, outp, {"route": "run", "model": args.model, "var": v, "run": init, "complete": True}))
            day += dt.timedelta(days=1)
    else:
        meta = json.loads(fs_sync.cat(f"{BUCKET}/data/{args.model}/static/meta.json"))
        L = meta["chunk_time_length"] * meta["temporal_resolution_seconds"]
        step = meta["temporal_resolution_seconds"]
        t0 = int(dt.datetime(d0.year, d0.month, d0.day, tzinfo=dt.timezone.utc).timestamp())
        t1 = int(dt.datetime(d1.year, d1.month, d1.day, tzinfo=dt.timezone.utc).timestamp()) + 86400
        for v in variables:
            try:
                have = set(int(p.split("_")[-1][:-3]) for p in fs_sync.ls(f"{BUCKET}/data/{args.model}/{v}") if p.endswith(".om") and "/chunk_" in p)
            except FileNotFoundError:
                continue
            for n in range(t0 // L, (t1 - 1) // L + 1):
                if n not in have:
                    continue
                key = f"data/{args.model}/{v}/chunk_{n}.om"
                outp = os.path.join(ROOT, "cache", args.model, v, "series", f"chunk_{n}.hcv.gz")
                complete = (n + 1) * L <= meta["data_end_time"]
                out.append((key, outp, {"route": "series", "model": args.model, "var": v, "chunk": n, "chunkSeconds": L, "stepSeconds": step,
                                        "times": [n * L + k * step for k in range(meta["chunk_time_length"])], "complete": complete,
                                        "dataEndTime": meta["data_end_time"]}))
    return grid, out


def done(outp, cells_hash):
    if not os.path.exists(outp):
        return False
    try:
        h = read_hcv_header(outp)
        return h.get("complete", True) and h.get("cellsHash") == cells_hash
    except Exception:
        return False


async def run_worker(jobs, grid, conc_files, conc_req, gap, logf):
    cells_doc, rows = load_cells(grid)
    fs = s3fs.S3FileSystem(anon=True, asynchronous=True, client_kwargs={"region_name": "us-west-2"},
                           config_kwargs={"max_pool_connections": max(32, conc_req)})
    await fs.set_session()
    sem_req = asyncio.Semaphore(conc_req)
    sem_file = asyncio.Semaphore(conc_files)
    results = []
    async def one(job):
        key, outp, meta = job
        async with sem_file:
            for attempt in range(3):
                try:
                    rec = await extract_file(fs, key, outp, cells_doc, rows, meta, sem_req, gap)
                    break
                except Exception as e:
                    rec = {"key": key, "ok": False, "error": f"{type(e).__name__}: {e}", "attempt": attempt + 1,
                           "where": [x.strip() for x in traceback.format_exc().strip().splitlines()[-4:]]}
                    await asyncio.sleep(2 * (attempt + 1))
            rec["t"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
            with open(logf, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec) + "\n")
            results.append(rec)
    await asyncio.gather(*[one(j) for j in jobs])
    return results


def worker_main(payload):
    jobs, grid, conc_files, conc_req, gap, logf, check = payload
    global CHECK_DIRECT
    CHECK_DIRECT = check
    return asyncio.run(run_worker(jobs, grid, conc_files, conc_req, gap, logf))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, choices=sorted(MODELS))
    ap.add_argument("--route", required=True, choices=["run", "series"])
    ap.add_argument("--from", dest="from_", required=True)
    ap.add_argument("--to", required=True)
    ap.add_argument("--vars")
    ap.add_argument("--hours")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--files", type=int, default=6, help="concurrent om files per worker")
    ap.add_argument("--conc", type=int, default=48, help="concurrent range requests per worker")
    ap.add_argument("--gap", type=int, default=4096)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--check", action="store_true", help="compare a few rows per file with a direct read")
    args = ap.parse_args()
    global CHECK_DIRECT
    CHECK_DIRECT = bool(args.check)
    fs_sync = s3fs.S3FileSystem(anon=True, client_kwargs={"region_name": "us-west-2"})
    t0 = time.time()
    grid, plan = plan_files(args, fs_sync)
    cells_hash = json.load(open(os.path.join(ROOT, "cells", f"extract-{grid}.json"), encoding="utf-8"))["hash"]
    todo = [j for j in plan if not done(j[1], cells_hash)]
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    os.makedirs(os.path.join(ROOT, "log"), exist_ok=True)
    logf = os.path.join(ROOT, "log", f"om-{args.route}-{args.model}-{stamp}.jsonl")
    print(f"[om] {args.model} {args.route} {args.from_}…{args.to}: {len(plan)} files planned, {len(plan) - len(todo)} already complete, {len(todo)} to read · log {logf}", flush=True)
    if args.dry or not todo:
        summary = {"kind": "summary", "model": args.model, "route": args.route, "from": args.from_, "to": args.to, "planned": len(plan), "skipped": len(plan) - len(todo), "read": 0, "bytes": 0, "requests": 0, "s": round(time.time() - t0, 1)}
        with open(logf, "a", encoding="utf-8") as f:
            f.write(json.dumps(summary) + "\n")
        print(json.dumps(summary)); return
    shares = [todo[k::args.workers] for k in range(args.workers)]
    results = []
    with ProcessPoolExecutor(args.workers) as ex:
        for r in ex.map(worker_main, [(s, grid, args.files, args.conc, args.gap, logf, CHECK_DIRECT) for s in shares if s]):
            results += r
    ok = [r for r in results if r.get("ok")]
    bad = [r for r in results if not r.get("ok")]
    summary = {"kind": "summary", "model": args.model, "route": args.route, "from": args.from_, "to": args.to, "planned": len(plan),
               "skipped": len(plan) - len(todo), "read": len(ok), "failed": len(bad), "bytes": sum(r["bytes"] for r in ok),
               "requests": sum(r["requests"] for r in ok), "fileBytes": sum(r["fileBytes"] for r in ok), "s": round(time.time() - t0, 1)}
    with open(logf, "a", encoding="utf-8") as f:
        f.write(json.dumps(summary) + "\n")
    print(json.dumps(summary), flush=True)
    for r in bad[:10]:
        print("  FAIL", r["key"], r.get("error"), flush=True)


if __name__ == "__main__":
    main()
