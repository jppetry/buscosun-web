"""Terrain table per glacier and elevation: slope, aspect (northness, eastness), curvature. Local tool: reads the catalogue build and the GLO-30 tiles of
the cache, writes ONE JSON into the cache. Never writes into a repo. Nothing on the runner.

    <venv>/python -I scripts/glacier/py/terrain_params.py --static <view>/static/<build> --dem <dir of GLO-30 tiles> --out <json>
                    [--only id,id,...] [--count] [--north-ref <predictors-ch.json of snowcal_predictors.py>]

Every glacier of the catalogue (all countries), its three elevations as the catalogue gives them (tongue, median, top = `z`). Cells = GLO-30 cells inside
the L1 outline (rasterised as in snowcal_predictors.py) whose elevation lies within +-BAND_M of the elevation; none => the cells of the outline whose
elevation lies within BAND_M of the NEAREST elevation the outline has (`how: nearest`, `dz` = that distance in m).
Gradient in metres, the rule of snowcal_predictors.py (np.gradient on the elevation with the NaN filled by the window mean, dy = |e| * 110540,
dx = |a| * 111320 * cos(lat of the outline box centre)); aspect = direction the slope faces (down-slope), northness = cos, eastness = sin.
Curvature = cell elevation - mean elevation of the ring of cells RING_M away (cells whose centre distance differs from RING_M by at most half a cell);
positive = bump, negative = hollow.
"""
import argparse, glob, json, math, os, re, time, datetime as dt
import numpy as np, rasterio
from rasterio.merge import merge
from rasterio.features import rasterize

BAND_M = 50     # set
RING_M = 150    # set
MARGIN_M = 3000   # window = outline box + 3 km, as snowcal_predictors.py (same grid, so the northness agrees); >= RING_M

ap = argparse.ArgumentParser()
for k in ('static', 'dem', 'out'): ap.add_argument('--' + k, required=True)
ap.add_argument('--only', default=None)
ap.add_argument('--count', action='store_true')
ap.add_argument('--north-ref', default=None)
a = ap.parse_args()
t0 = time.time()
catDoc = json.load(open(os.path.join(a.static, 'catalog.json'), encoding='utf8'))
only = set(a.only.split(',')) if a.only else None
glaciers = [g for g in catDoc['glaciers'] if only is None or g['id'] in only]
outl = {}
for fn in sorted(os.listdir(os.path.join(a.static, 'outline'))):
    if not re.match(r'^[a-z]{2}-.*-L1\.json$', fn): continue
    for ft in json.load(open(os.path.join(a.static, 'outline', fn), encoding='utf8'))['features']: outl[ft['properties']['id']] = ft['geometry']

tilePaths = {}
for p in sorted(glob.glob(os.path.join(a.dem, '*.tif'))):
    m = re.search(r'_([NS])(\d{2})_00_([EW])(\d{3})_00_', os.path.basename(p))
    if m: tilePaths[((1 if m[1] == 'N' else -1) * int(m[2]), (1 if m[3] == 'E' else -1) * int(m[4]))] = p
tileOpen = {}
def tile(k):
    if k not in tileOpen: tileOpen[k] = rasterio.open(tilePaths[k])
    return tileOpen[k]

def bbox(geom):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    xs = [x for p in polys for x, _ in p[0]]; ys = [y for p in polys for _, y in p[0]]
    return min(xs), min(ys), max(xs), max(ys)

def r3(x): return None if x is None or not math.isfinite(x) else round(float(x), 3)
def r1(x): return None if x is None or not math.isfinite(x) else round(float(x), 1)

def terrain_of(g):
    geom = outl.get(g['id'])
    if geom is None: return {'why': 'no outline'}
    x0, y0, x1, y1 = bbox(geom)
    lat = (y0 + y1) / 2; mlat = MARGIN_M / 110540; mlon = MARGIN_M / (111320 * math.cos(math.radians(lat)))
    b = (x0 - mlon, y0 - mlat, x1 + mlon, y1 + mlat)
    # the outline itself must lie on tiles of the cache; the 3-km margin takes what is there (as snowcal_predictors.py)
    core = [(la, lo) for la in range(math.floor(y0), math.floor(y1) + 1) for lo in range(math.floor(x0), math.floor(x1) + 1)]
    miss = [k for k in core if k not in tilePaths]
    if miss: return {'why': 'no DEM tile ' + ','.join(f'N{la:02d}E{lo:03d}' for la, lo in miss)}
    need = [(la, lo) for la in range(math.floor(b[1]), math.floor(b[3]) + 1) for lo in range(math.floor(b[0]), math.floor(b[2]) + 1) if (la, lo) in tilePaths]
    Z, T = merge([tile(k) for k in need], bounds=b, nodata=-32768)
    Z = Z[0].astype(float); Z[Z < -1000] = np.nan
    mask = rasterize([(geom, 1)], out_shape=Z.shape, transform=T, fill=0, dtype='uint8').astype(bool)
    if not mask.any(): return {'why': 'no cells'}
    if np.isnan(Z[mask]).all(): return {'why': 'no DEM values'}
    dxm = abs(T.a) * 111320 * math.cos(math.radians(lat)); dym = abs(T.e) * 110540
    gy_, gx_ = np.gradient(np.nan_to_num(Z, nan=np.nanmean(Z)), dym, dxm)
    down_e, down_n = -gx_, gy_
    h = np.hypot(down_e, down_n)
    north = np.where(h > 1e-6, down_n / np.maximum(h, 1e-9), 0.0)
    east = np.where(h > 1e-6, down_e / np.maximum(h, 1e-9), 0.0)
    slope = np.degrees(np.arctan(h))
    # ring of cells RING_M away
    ri, rj = int(math.ceil(RING_M / dym)) + 1, int(math.ceil(RING_M / dxm)) + 1
    half = 0.5 * max(dxm, dym)
    ring = [(di, dj) for di in range(-ri, ri + 1) for dj in range(-rj, rj + 1) if abs(math.hypot(di * dym, dj * dxm) - RING_M) <= half]
    valid = mask & np.isfinite(Z)
    whole = {'north': r3(north[valid].mean())}
    levels = []
    for zz in g['z']:
        if zz is None or not math.isfinite(zz): levels.append({'z': zz, 'why': 'no elevation'}); continue
        d = np.abs(Z - zz); sel = valid & (d <= BAND_M); how = 'band'; dz = None
        if not sel.any():
            dmin = float(np.nanmin(np.where(valid, d, np.nan))); sel = valid & (d <= dmin + BAND_M); how = 'nearest'; dz = round(dmin)
        I, J = np.nonzero(sel)
        acc = np.zeros(len(I)); cnt = np.zeros(len(I))
        for di, dj in ring:
            ii, jj = I + di, J + dj
            ok = (ii >= 0) & (ii < Z.shape[0]) & (jj >= 0) & (jj < Z.shape[1])
            v = np.full(len(I), np.nan); v[ok] = Z[ii[ok], jj[ok]]
            f = np.isfinite(v); acc[f] += v[f]; cnt[f] += 1
        curv = Z[I, J] - np.where(cnt > 0, acc / np.maximum(cnt, 1), np.nan)
        e = {'z': zz, 'how': how, 'n': int(len(I)), 'slope': r1(slope[sel].mean()), 'north': r3(north[sel].mean()), 'east': r3(east[sel].mean()),
             'curv': r1(np.nanmean(curv)) if np.isfinite(curv).any() else None}
        if dz is not None: e['dz'] = dz
        if e['curv'] is None: e['why'] = 'no ring cells'
        levels.append(e)
    return {**whole, 'levels': levels}

out = {'kind': 'glacier/terrain-params', 'build': catDoc.get('build'), 'builtAt': dt.date.today().isoformat(),
       'dem': {'source': 'Copernicus DEM GLO-30 (tiles of the cache)', 'attribution': '© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved'},
       'constants': {'bandM': {'v': BAND_M, 'origin': 'set'}, 'ringM': {'v': RING_M, 'origin': 'set'}},
       'rules': {'cells': 'GLO-30 cells inside the L1 outline within +-bandM of the elevation, else within bandM of the nearest elevation of the outline (how: nearest, dz)',
                 'gradient': 'np.gradient in metres as snowcal_predictors.py; aspect = down-slope direction', 'curv': 'cell elevation - mean of the ring ringM away (m)',
                 'levels': 'catalogue z = [tongue, median, top]'},
       'glaciers': {}}
for n, g in enumerate(glaciers):
    try: r = terrain_of(g)
    except Exception as ex: r = {'why': f'error: {ex}'}
    out['glaciers'][g['id']] = {'country': g['country'], 'region': g['region'], **r}
    if n % 200 == 0: print(f'{n}/{len(glaciers)}', flush=True)
json.dump(out, open(a.out, 'w', encoding='utf8'))
secs = time.time() - t0
print(f'{len(glaciers)} Gletscher, {secs:.0f} s -> {a.out}')

if a.count:
    G = out['glaciers']
    full = sum(1 for r in G.values() if len(r.get('levels', [])) == 3 and all(lv.get('slope') is not None for lv in r['levels']))
    near = sum(1 for r in G.values() if any(lv.get('how') == 'nearest' for lv in r.get('levels', [])))
    whys = {}
    for r in G.values():
        if r.get('why'): k = re.sub(r' N\d.*', '', r['why']); whys[k] = whys.get(k, 0) + 1
    def med(k, i):
        v = [r['levels'][i][k] for r in G.values() if len(r.get('levels', [])) == 3 and r['levels'][i].get(k) is not None]
        return round(float(np.median(v)), 3) if v else None
    lines = {'glaciers': len(G), 'allThree': full, 'withNearest': near, 'missing': whys,
             'median': {name: {'slope': med('slope', i), 'north': med('north', i), 'curv': med('curv', i)} for i, name in enumerate(('tongue', 'median', 'top'))}}
    if a.north_ref:
        ref = json.load(open(a.north_ref, encoding='utf8'))['glaciers']
        d = [G[k]['north'] - v['north'] for k, v in ref.items() if k in G and G[k].get('north') is not None and v.get('north') is not None]
        ad = np.abs(d)
        lines['northVsPredictors'] = {'n': len(d), 'medianAbs': round(float(np.median(ad)), 4), 'p95Abs': round(float(np.percentile(ad, 95)), 4), 'maxAbs': round(float(ad.max()), 4),
                                      'equal3dp': int((ad < 0.0005).sum())}
    print(json.dumps(lines, indent=1))
