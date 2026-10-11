"""zip-range.py — list a remote ZIP via HTTP range requests and fetch single members (spike helper, stdlib only).

  zip-range.py <url> list [regex]
  zip-range.py <url> get  <regex> <outdir>      (each member's CRC32 and size are checked against the central directory)

Why: the plan asks to load a big archive once and keep only one region; a range request reads only the central
directory and the wanted members (GloGEM 3.4 GB -> 45 MB, RGI 6.2 402 MB -> a few MB), gentle on the server.
Note: this checks the member CRC32, NOT the md5 of the whole archive (recorded as a deviation in audit/gletscher.md).
"""
import os, re, struct, sys, urllib.request, zlib

UA = "buscosun-glacier-spike/0.1 (jppetry94@gmail.com)"


def rng(url, a, b):
    req = urllib.request.Request(url, headers={"Range": "bytes=%d-%d" % (a, b), "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def total_size(url):
    req = urllib.request.Request(url, headers={"Range": "bytes=0-0", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        cr = r.headers.get("Content-Range")
        return int(cr.split("/")[1])


def central_directory(url):
    n = total_size(url)
    tail = rng(url, max(0, n - 1_000_000), n - 1)
    i = tail.rfind(b"PK\x05\x06")
    _, _, _, _, entries, cd_size, cd_off, _ = struct.unpack("<4sHHHHIIH", tail[i:i + 22])
    if entries == 0xFFFF or cd_off == 0xFFFFFFFF:
        j = tail.rfind(b"PK\x06\x07")
        off64 = struct.unpack("<4sIQI", tail[j:j + 20])[2]
        d = rng(url, off64, off64 + 55)
        _, _, _, _, _, _, _, entries, cd_size, cd_off = struct.unpack("<4sQHHIIQQQQ", d[:56])
    cd = rng(url, cd_off, cd_off + cd_size - 1)
    out, p = [], 0
    while p < len(cd) and struct.unpack("<I", cd[p:p + 4])[0] == 0x02014B50:
        (_, _, _, comp, _, _, crc, csz, usz, nl, el, cl, _, _, _, lho) = struct.unpack("<HHHHHHIIIHHHHHII", cd[p + 4:p + 46])
        name = cd[p + 46:p + 46 + nl].decode("utf-8", "replace")
        extra = cd[p + 46 + nl:p + 46 + nl + el]
        if 0xFFFFFFFF in (csz, usz, lho):  # zip64 extra field
            q = 0
            while q + 4 <= len(extra):
                hid, sz = struct.unpack("<HH", extra[q:q + 4])
                if hid == 1:
                    vals = struct.unpack("<%dQ" % (sz // 8), extra[q + 4:q + 4 + sz])
                    k = 0
                    if usz == 0xFFFFFFFF: usz = vals[k]; k += 1
                    if csz == 0xFFFFFFFF: csz = vals[k]; k += 1
                    if lho == 0xFFFFFFFF: lho = vals[k]; k += 1
                q += 4 + sz
        out.append({"name": name, "comp": comp, "crc": crc, "csz": csz, "usz": usz, "lho": lho})
        p += 46 + nl + el + cl
    return out


def fetch_member(url, e):
    lh = rng(url, e["lho"], e["lho"] + 29)
    nl, el = struct.unpack("<HH", lh[26:30])
    start = e["lho"] + 30 + nl + el
    raw = rng(url, start, start + e["csz"] - 1)
    data = zlib.decompress(raw, -15) if e["comp"] == 8 else raw
    if len(data) != e["usz"] or (zlib.crc32(data) & 0xFFFFFFFF) != e["crc"]:
        raise SystemExit("CRC/size mismatch for " + e["name"])
    return data


if __name__ == "__main__":
    url, cmd = sys.argv[1], sys.argv[2]
    rx = re.compile(sys.argv[3]) if len(sys.argv) > 3 else None
    ents = [e for e in central_directory(url) if not e["name"].endswith("/") and (rx is None or rx.search(e["name"]))]
    if cmd == "list":
        for e in ents: print(e["usz"], e["csz"], e["name"])
        print(len(ents), "members")
    else:
        out = sys.argv[4]
        os.makedirs(out, exist_ok=True)
        for e in ents:
            data = fetch_member(url, e)
            path = os.path.join(out, os.path.basename(e["name"]))
            open(path, "wb").write(data)
            print("ok %s %d bytes (CRC32 ok)" % (path, len(data)))
