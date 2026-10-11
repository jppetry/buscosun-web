"""Download the Copernicus DEM GLO-30 tiles that cover the glaciers of DE/AT/CH (AWS Open Data bucket, COG, no key).

Cache only (`C:/dev/buscosun-glacier-cache/raw/dem`, outside every repo). Sequential, resumable, `If-Modified-Since`-style
skip (an existing file with the right Content-Length is kept). The tile list comes from the bounding boxes of the current
inventories (SGI2016, AGI 5, RGI 6.2 region 11 for DE) so no tile without a glacier is fetched.

  python -I fetch_dem.py [--list]
"""
import io, json, math, os, sys, urllib.request, zipfile

import shapefile

RAW = "C:/dev/buscosun-glacier-cache/raw/"
OUT = RAW + "dem/"
BASE = "https://copernicus-dem-30m.s3.amazonaws.com/"
UA = "buscosun-glacier/0.1 (jppetry94@gmail.com)"


def tile_name(lat0, lon0):
    ns = "N" if lat0 >= 0 else "S"
    ew = "E" if lon0 >= 0 else "W"
    return "Copernicus_DSM_COG_10_%s%02d_00_%s%03d_00_DEM" % (ns, abs(lat0), ew, abs(lon0))


def bboxes():
    from pyproj import Transformer
    out = []
    t_ch = Transformer.from_crs(2056, 4326, always_xy=True)
    z = zipfile.ZipFile(RAW + "glamos/inventory_sgi2016_r2020.zip")
    r = shapefile.Reader(shp=io.BytesIO(z.read("SGI_2016_glaciers.shp")), dbf=io.BytesIO(z.read("SGI_2016_glaciers.dbf")))
    for s in r.iterShapes():
        x0, y0, x1, y1 = s.bbox
        a = t_ch.transform(x0, y0); b = t_ch.transform(x1, y1)
        out.append((min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])))
    t_at = Transformer.from_crs(31287, 4326, always_xy=True)
    za = zipfile.ZipFile(RAW + "agi5/GI5_vector_files.zip")
    for n in za.namelist():
        if n.endswith(".geojson"):
            for f in json.loads(za.read(n))["features"]:
                xs, ys = [], []
                def walk(c):
                    if isinstance(c[0], (int, float)): xs.append(c[0]); ys.append(c[1])
                    else:
                        for q in c: walk(q)
                walk(f["geometry"]["coordinates"])
                a = t_at.transform(min(xs), min(ys)); b = t_at.transform(max(xs), max(ys))
                out.append((min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])))
    zr = zipfile.ZipFile(RAW + "rgi6/11_rgi62_CentralEurope.zip")
    r = shapefile.Reader(shp=io.BytesIO(zr.read("11_rgi62_CentralEurope.shp")), dbf=io.BytesIO(zr.read("11_rgi62_CentralEurope.dbf")))
    for s in r.iterShapes():
        x0, y0, x1, y1 = s.bbox
        if 47.2 < (y0 + y1) / 2 < 47.7 and 10.2 < (x0 + x1) / 2 < 13.2:  # the German glaciers
            out.append((x0, y0, x1, y1))
    return out


def needed_tiles():
    tiles = set()
    for x0, y0, x1, y1 in bboxes():
        for la in range(math.floor(y0), math.floor(y1) + 1):
            for lo in range(math.floor(x0), math.floor(x1) + 1):
                tiles.add((la, lo))
    return sorted(tiles)


if __name__ == "__main__":
    tl = needed_tiles()
    print(len(tl), "tiles:", ", ".join("%d/%d" % t for t in tl))
    if "--list" in sys.argv:
        sys.exit(0)
    os.makedirs(OUT, exist_ok=True)
    for la, lo in tl:
        name = tile_name(la, lo)
        path = OUT + name + ".tif"
        url = BASE + name + "/" + name + ".tif"
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                size = int(r.headers["Content-Length"])
        except Exception as e:  # tile does not exist (sea, or not public)
            print("skip", name, e)
            continue
        if os.path.exists(path) and os.path.getsize(path) == size:
            print("have", name)
            continue
        print("get ", name, size)
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=600) as r, open(path + ".part", "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b: break
                f.write(b)
        os.replace(path + ".part", path)
    print("done")
