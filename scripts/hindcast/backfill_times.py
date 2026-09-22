"""backfill_times.py — one-off repair (19.09.): data_run cache files written before the fix carry `times: null`
(omfiles' async child readers are coroutines that were not awaited). Reads only the `time` child and
`forecast_reference_time` of the om file (header + LUT of a 1-D array, a few hundred bytes) and rewrites the HCV1
header; the values are untouched. Idempotent: files with times are skipped.

  .venv/Scripts/python.exe scripts/hindcast/backfill_times.py [--conc 32]
"""
import asyncio, glob, gzip, io, json, os, struct, sys
import numpy as np, s3fs
from omfiles import OmFileReaderAsync

ROOT = os.environ.get("HINDCAST_ROOT", "C:/dev/buscosun-hindcast")


async def aw(x):
    return (await x) if hasattr(x, "__await__") else x


def read_raw(path):
    raw = gzip.decompress(open(path, "rb").read())
    n = struct.unpack("<I", raw[4:8])[0]
    return json.loads(raw[8:8 + n].decode("utf-8")), raw[8 + n:]


def write_raw(path, header, payload):
    h = json.dumps(header, separators=(",", ":")).encode("utf-8")
    buf = b"HCV1" + struct.pack("<I", len(h)) + h + payload
    tmp = f"{path}.tmp{os.getpid()}"
    open(tmp, "wb").write(gzip.compress(buf, compresslevel=6))
    os.replace(tmp, path)


async def main():
    conc = int(sys.argv[sys.argv.index("--conc") + 1]) if "--conc" in sys.argv else 32
    files = [p for p in glob.glob(os.path.join(ROOT, "cache", "*", "*", "run", "*.hcv.gz"))]
    todo = []
    for p in files:
        try:
            h, _ = read_raw(p)
        except Exception:
            continue
        if not h.get("times"):
            todo.append((p, h["key"]))
    print(f"[backfill] {len(files)} run files, {len(todo)} without times", flush=True)
    fs = s3fs.S3FileSystem(anon=True, asynchronous=True, client_kwargs={"region_name": "us-west-2"}, config_kwargs={"max_pool_connections": conc + 8})
    await fs.set_session()
    sem = asyncio.Semaphore(conc)
    done = {"ok": 0, "bad": 0}

    async def one(p, key):
        async with sem:
            try:
                rd = await OmFileReaderAsync.from_fsspec(fs, f"openmeteo/{key}")
                t = np.asarray(await aw((await aw(rd.get_child_by_name("time"))).read_array((slice(None),))))
                init = int(await aw((await aw(rd.get_child_by_name("forecast_reference_time"))).read_scalar()))
                h, payload = read_raw(p)
                if len(t) != h["nt"]:
                    raise ValueError(f"{len(t)} times for nt {h['nt']}")
                h["times"] = [int(x) for x in t.tolist()]
                h["init"] = init
                h["timesBackfilled"] = True
                write_raw(p, h, payload)
                done["ok"] += 1
            except Exception as e:
                done["bad"] += 1
                print("  FAIL", key, type(e).__name__, e, flush=True)

    await asyncio.gather(*[one(p, k) for p, k in todo])
    print(f"[backfill] ok {done['ok']} failed {done['bad']}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
