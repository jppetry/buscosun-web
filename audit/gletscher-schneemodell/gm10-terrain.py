"""Phase GM-10, step 0 - terrain per glacier for the factor pre-check. Measurement only; reads the local cache, writes one JSON into the cache.

    <venv>/python -I audit/gletscher-schneemodell/gm10-terrain.py --truth <gy.json> --static <static/20261120-1> --dem <raw/dem> --out <gm10/terrain.json>

From the catalogue of build 20261120-1: median elevation, elevation range (max - min), area. From Copernicus GLO-30 (the tiles on disk, 1 arcsec),
on the cells inside the L1 outline: mean slope, northness = mean cos(aspect), and two optional indices:
  tpi1k  = mean over glacier cells of (z - mean z of the square of +-1 km around the cell)  [m; < 0 sheltered hollow, > 0 exposed]
  aval   = area of OFF-glacier cells with slope >= 30 deg whose D8 steepest-descent path reaches the glacier, divided by the glacier area
           (window = outline box + 3 km; propagation stops at the first glacier cell; a proxy, not an avalanche model)
"""
import argparse, json, math, os, glob
import numpy as np, rasterio
from rasterio.merge import merge
from rasterio.features import rasterize

ap = argparse.ArgumentParser()
for k in ('truth', 'static', 'dem', 'out'): ap.add_argument('--' + k, required=True)
a = ap.parse_args()
truth = json.load(open(a.truth, encoding='utf8'))['gy']
cat = {g['id']: g for g in json.load(open(os.path.join(a.static, 'catalog.json'), encoding='utf8'))['glaciers']}
outl = {}
for fn in glob.glob(os.path.join(a.static, 'outline', '*-L1.json')):
    for ft in json.load(open(fn, encoding='utf8'))['features']: outl[ft['properties']['id']] = ft['geometry']
tiles = [rasterio.open(p) for p in sorted(glob.glob(os.path.join(a.dem, '*.tif')))]

ids = {}
for o in truth: ids.setdefault(o['catId'], o['key'])
for g in cat.values():
    if g['country'] == 'DE': ids.setdefault(g['id'], None)

def boxmean(z, r):
    """mean over the (2r+1)^2 square, edges by the cells inside (integral image)."""
    p = np.pad(z, ((1, 0), (1, 0))).cumsum(0).cumsum(1); one = np.pad(np.ones_like(z), ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    H, W = z.shape; i0 = np.clip(np.arange(H) - r, 0, H); i1 = np.clip(np.arange(H) + r + 1, 0, H); j0 = np.clip(np.arange(W) - r, 0, W); j1 = np.clip(np.arange(W) + r + 1, 0, W)
    S = p[i1][:, j1] - p[i0][:, j1] - p[i1][:, j0] + p[i0][:, j0]; C = one[i1][:, j1] - one[i0][:, j1] - one[i1][:, j0] + one[i0][:, j0]
    return S / C

out = {}
for gid, key in ids.items():
    g = cat[gid]; geom = outl[gid]
    xs = []; ys = []
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    for p in polys:
        for x, y in p[0]: xs.append(x); ys.append(y)
    lat = (min(ys) + max(ys)) / 2; mlat = 3000 / 110540; mlon = 3000 / (111320 * math.cos(math.radians(lat)))
    Z, T = merge(tiles, bounds=(min(xs) - mlon, min(ys) - mlat, max(xs) + mlon, max(ys) + mlat), nodata=-32768)
    Z = Z[0].astype(float); Z[Z < -1000] = np.nan
    mask = rasterize([(geom, 1)], out_shape=Z.shape, transform=T, fill=0, dtype='uint8').astype(bool)
    dx = abs(T.a) * 111320 * math.cos(math.radians(lat)); dy = abs(T.e) * 110540
    gy_, gx_ = np.gradient(np.nan_to_num(Z, nan=np.nanmean(Z)), dy, dx)   # gy_ along rows (southwards), gx_ eastwards
    slope = np.degrees(np.arctan(np.hypot(gx_, gy_)))
    # aspect: direction the slope faces; downhill vector = -grad; north = -row direction
    down_e, down_n = -gx_, gy_
    north = np.where(np.hypot(down_e, down_n) > 1e-6, down_n / np.maximum(np.hypot(down_e, down_n), 1e-9), 0.0)
    r = int(round(1000 / dy)); rx = int(round(1000 / dx))
    zf = np.nan_to_num(Z, nan=np.nanmean(Z))
    tpi = zf - boxmean(zf, max(r, rx))   # square of +-1 km (cells are ~31 x 21 m; the larger radius in cells keeps >= 1 km both ways)
    # D8 inflow of steep off-glacier terrain
    H, W = Z.shape; idx = np.arange(H * W).reshape(H, W); best = np.zeros((H, W)); recv = np.full((H, W), -1)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            if di == 0 and dj == 0: continue
            sh = np.full((H, W), np.nan); sh[max(0, -di):H - max(0, di), max(0, -dj):W - max(0, dj)] = zf[max(0, di):H - max(0, -di) or H, max(0, dj):W - max(0, -dj) or W]
            ri = np.full((H, W), -1); ri[max(0, -di):H - max(0, di), max(0, -dj):W - max(0, dj)] = idx[max(0, di):H - max(0, -di) or H, max(0, dj):W - max(0, -dj) or W]
            drop = (zf - sh) / math.hypot(di * dy, dj * dx)
            better = np.nan_to_num(drop, nan=-1) > best
            best = np.where(better, drop, best); recv = np.where(better, ri, recv)
    acc = ((slope >= 30) & ~mask).astype(float).ravel() * dx * dy
    rv = recv.ravel(); gl = mask.ravel(); order = np.argsort(-zf.ravel())
    inflow = 0.0
    for i in order:
        if gl[i] or acc[i] == 0: continue
        j = rv[i]
        if j < 0: continue
        if gl[j]: inflow += acc[i]
        else: acc[j] += acc[i]
    garea = mask.sum() * dx * dy
    out[gid] = {'key': key, 'country': g['country'], 'region': g['region'], 'zMed': g['z'][1], 'zRange': g['z'][2] - g['z'][0], 'areaKm2': g['area']['km2'],
                'slope': round(float(slope[mask].mean()), 2), 'north': round(float(north[mask].mean()), 3), 'tpi1k': round(float(tpi[mask].mean()), 1),
                'aval': round(float(inflow / garea), 4), 'cells': int(mask.sum())}
    print(gid, out[gid], flush=True)
json.dump({'kind': 'gm10/terrain', 'dem': 'Copernicus DEM GLO-30, tiles of the local cache', 'build': '20261120-1', 'glaciers': out}, open(a.out, 'w', encoding='utf8'), indent=1)
