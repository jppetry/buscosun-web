"""Phase GM, GM-10b (audit/gletscher-schneemodell/gm10-diagnose.md §13) - grid and terrain predictors of the predicted precipitation factor for EVERY Swiss
glacier of a catalogue build. Local tool: reads the cache, writes one JSON into the cache. Never writes into a repo.

    <venv>/python -I scripts/glacier/py/snowcal_predictors.py --static <view>/static/<build> --q20 <dir of Q20 v1.1> --dem <dir of GLO-30 tiles> --out <json>
                    [--from 2016 --to 2025] [--only id,id,...]

Grid (SLF snow dataset 2016-2025, Q20, Zenodo record 24088217, version 1.1, CC BY 4.0): the 250-m cells whose centre lies inside the L1 outline of the
glacier (none inside => the nearest cell to the outline centroid, `how: nearest`); nIn = number of cells inside (0 allowed). Snow water equivalent of the
glacier = mean over its cells with a value, on 1 October of year Y-1 and on 1 May of year Y (the value of calendar day D, 06:00 UTC+1, stands for the
start of D), water years Y = --from .. --to. The fixed window 1 Oct 00 UTC .. 1 May 00 UTC is the window of the build: a glacier without measurement has
no truth window. Version 1.1 stores the northing ascending and needs no shift; the row order is read from the coordinates (V-GM-121).

Terrain (Copernicus DEM GLO-30, tiles of the cache): northness = mean cos(aspect) over the GLO-30 cells inside the L1 outline, the rule of
audit/gletscher-schneemodell/gm10-terrain.py (same window of outline box + 3 km, same gradient), median elevation and area from the catalogue.
"""
import argparse, glob, json, math, os, re, tempfile, zipfile, datetime as dt
import h5py, numpy as np, rasterio
from rasterio.merge import merge
from rasterio.features import rasterize
from pyproj import Transformer
from shapely.geometry import shape, Point
from shapely.prepared import prep

ap = argparse.ArgumentParser()
for k in ('static', 'q20', 'dem', 'out'): ap.add_argument('--' + k, required=True)
ap.add_argument('--from', dest='y0', type=int, default=2016); ap.add_argument('--to', dest='y1', type=int, default=2025)
ap.add_argument('--only', default=None)
a = ap.parse_args()
tr = Transformer.from_crs('EPSG:4326', 'EPSG:2056', always_xy=True)
catDoc = json.load(open(os.path.join(a.static, 'catalog.json'), encoding='utf8'))
only = set(a.only.split(',')) if a.only else None
glaciers = [g for g in catDoc['glaciers'] if g['country'] == 'CH' and (only is None or g['id'] in only)]
outl = {}
for fn in sorted(os.listdir(os.path.join(a.static, 'outline'))):
    if not re.match(r'^ch-.*-L1\.json$', fn): continue
    for ft in json.load(open(os.path.join(a.static, 'outline', fn), encoding='utf8'))['features']: outl[ft['properties']['id']] = ft['geometry']

# ---- Q20 grid ----------------------------------------------------------------------------------------------------------------------------------
def month_file(y, m):
    wy = y + 1 if m >= 9 else y
    return os.path.join(a.q20, f'OSHD_DATA_WY_{wy}.zip'), f'OSHD_DATA_{y:04d}-{m:02d}.nc'
tmp = tempfile.mkdtemp(prefix='snowcalpred-')
zp, nm = month_file(2020, 4)
with zipfile.ZipFile(zp) as z: z.extract(nm, tmp)
with h5py.File(os.path.join(tmp, nm), 'r') as f: E = f['easting'][:]; N = f['northing'][:]
os.remove(os.path.join(tmp, nm))
dx = 250.0; E0, N0 = E[0], N[0]; dN = float(N[1] - N[0])
assert abs(abs(dN) - dx) < 1e-6 and abs(float(E[1] - E[0]) - dx) < 1e-6, 'Q20: unexpected grid step'
def j_of(y): return (y - N0) / dN

def lv95_geom(geom):
    def tx(ring): return [tr.transform(x, y) for x, y in ring]
    if geom['type'] == 'Polygon': return shape({'type': 'Polygon', 'coordinates': [tx(r) for r in geom['coordinates']]})
    return shape({'type': 'MultiPolygon', 'coordinates': [[tx(r) for r in p] for p in geom['coordinates']]})

def cells_of(gid):
    g = lv95_geom(outl[gid]); x0, y0, x1, y1 = g.bounds
    i0 = max(0, int(math.floor((x0 - E0) / dx)) - 1); i1 = min(len(E) - 1, int(math.ceil((x1 - E0) / dx)) + 1)
    ja, jb = sorted((j_of(y0), j_of(y1))); j0 = max(0, int(math.floor(ja)) - 1); j1 = min(len(N) - 1, int(math.ceil(jb)) + 1)
    if i0 > i1 or j0 > j1: return None, 'outside', 0
    pg = prep(g); out = [(i, j) for i in range(i0, i1 + 1) for j in range(j0, j1 + 1) if pg.contains(Point(E[i], N[j]))]
    if out: return out, 'outline', len(out)
    c = g.centroid; i = int(round((c.x - E0) / dx)); j = int(round(j_of(c.y)))
    if not (0 <= i < len(E) and 0 <= j < len(N)): return None, 'outside', 0
    return [(i, j)], 'nearest', 0

rows = {}
for g in glaciers:
    if g['id'] not in outl: rows[g['id']] = {'how': 'no-outline'}; continue
    cells, how, nIn = cells_of(g['id'])
    rows[g['id']] = {'how': how, 'nIn': nIn, 'cells': cells}

days = []
for y in range(a.y0, a.y1 + 1): days += [dt.date(y - 1, 10, 1), dt.date(y, 5, 1)]
byMonth = {}
for day in days: byMonth.setdefault((day.year, day.month), []).append(day)
vals = {}
for (y, m), ds in sorted(byMonth.items()):
    zp, nm = month_file(y, m)
    with zipfile.ZipFile(zp) as z: z.extract(nm, tmp)
    p = os.path.join(tmp, nm)
    with h5py.File(p, 'r') as f:
        units = f['time'].attrs['units']; units = units.decode() if isinstance(units, bytes) else units
        base = dt.date.fromisoformat(re.search(r'since (\d{4}-\d{2}-\d{2})', units).group(1)); tt = f['time'][:]
        for day in ds:
            idx = int(np.where(np.isclose(tt, (day - base).days))[0][0]); S = f['swe'][:, :, idx]
            for gid, r in rows.items():
                if not r.get('cells'): continue
                v = np.array([S[i, j] for i, j in r['cells']]); ok = v > -9000
                vals[(gid, day)] = round(float(v[ok].mean()), 1) if ok.any() else None
    os.remove(p)
    print(f'{y}-{m:02d}: {len(ds)} Tage', flush=True)
os.rmdir(tmp)

# ---- terrain (northness, as gm10-terrain.py) -----------------------------------------------------------------------------------------------------
tiles = [rasterio.open(p) for p in sorted(glob.glob(os.path.join(a.dem, '*.tif')))]
def north_of(geom):
    xs = []; ys = []
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    for p in polys:
        for x, y in p[0]: xs.append(x); ys.append(y)
    lat = (min(ys) + max(ys)) / 2; mlat = 3000 / 110540; mlon = 3000 / (111320 * math.cos(math.radians(lat)))
    Z, T = merge(tiles, bounds=(min(xs) - mlon, min(ys) - mlat, max(xs) + mlon, max(ys) + mlat), nodata=-32768)
    Z = Z[0].astype(float); Z[Z < -1000] = np.nan
    mask = rasterize([(geom, 1)], out_shape=Z.shape, transform=T, fill=0, dtype='uint8').astype(bool)
    if not mask.any(): return None, 0
    dxm = abs(T.a) * 111320 * math.cos(math.radians(lat)); dym = abs(T.e) * 110540
    gy_, gx_ = np.gradient(np.nan_to_num(Z, nan=np.nanmean(Z)), dym, dxm)
    down_e, down_n = -gx_, gy_
    north = np.where(np.hypot(down_e, down_n) > 1e-6, down_n / np.maximum(np.hypot(down_e, down_n), 1e-9), 0.0)
    return round(float(north[mask].mean()), 3), int(mask.sum())

out = {'kind': 'glacier/snowcal-predictors', 'build': catDoc.get('build'),
       'grid': 'SLF snow dataset 2016-2025 (Q20), Zenodo record 24088217, version 1.1, CC BY 4.0; 250 m; cell centre inside the L1 outline, else the nearest cell',
       'window': 'swe(1 May of Y) - swe(1 Oct of Y-1), values of 06:00 UTC+1', 'years': [a.y0, a.y1],
       'terrain': 'Copernicus DEM GLO-30 (tiles of the cache); northness = mean cos(aspect) inside the L1 outline (rule of gm10-terrain.py)',
       'glaciers': {}}
for n, g in enumerate(glaciers):
    gid = g['id']; r = rows[gid]
    row = {'region': g['region'], 'zMed': g['z'][1], 'areaKm2': g['area']['km2'], 'how': r['how'], 'nIn': r.get('nIn')}
    if gid in outl:
        row['north'], row['demCells'] = north_of(outl[gid])
    if r.get('cells'):
        row['nCells'] = len(r['cells'])
        row['winters'] = {str(y): {'swe0': vals.get((gid, dt.date(y - 1, 10, 1))), 'swe1': vals.get((gid, dt.date(y, 5, 1)))} for y in range(a.y0, a.y1 + 1)}
    out['glaciers'][gid] = row
    if n % 100 == 0: print(f'Gelände {n}/{len(glaciers)}', flush=True)
json.dump(out, open(a.out, 'w', encoding='utf8'))
print(f"{len(glaciers)} Schweizer Gletscher; ohne Umriss {sum(1 for r in rows.values() if r['how'] == 'no-outline')}; nächste Zelle {sum(1 for r in rows.values() if r['how'] == 'nearest')}")
