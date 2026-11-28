"""GM-11 phase 1d part B (copy of gm10-q20.py, days and output changed). Phase GM-10, step 0 - snow water equivalent of the SLF snow dataset 2016-2025 (Q20, Zenodo 10.5281/zenodo.17313889, version 1.0, CC BY 4.0)
on the glaciers of the GM-5b truth and on all Swiss glacier cells of the catalogue (region reference). Measurement only; reads the local cache,
writes one JSON into the cache. Never writes into a repo.

    <venv>/python -I audit/gletscher-schneemodell/gm10-q20.py --truth <gm3/truth/gy.json> --static <static/20261120-1> --q20 <gm10/q20> --out <gm10/q20-glaciers.json>

Format (measured 25.11.): one zip per water year (Sep-Aug), one NetCDF-4 per month, variables hs (m), swe (kg m-2), scf, smro as (easting, northing, time),
LV95 (EPSG:2056), 250 m, daily at 06:00 UTC+1, fill -9999. Version 1.0 labels northing 2000 m too far south (Zenodo notice, Nov 2026): +2000 m is added
here; the check against the model DEM (OSHD_MODEL_DOMAIN.tif) is repeated and written into the output.

Day of a value: the value of calendar day D (06:00 UTC+1 = 05 UTC) stands for the start of D. The truth window t0 00 UTC .. t1 24 UTC is read as
SWE(t1 + 1) - SWE(t0). Cells of a glacier: 250-m cell centres inside its L1 outline; none inside => the nearest cell to the outline centroid (named).
"""
import argparse, json, math, os, re, tempfile, zipfile, datetime as dt
import h5py, numpy as np, rasterio
from pyproj import Transformer
from shapely.geometry import shape, Point
from shapely.prepared import prep

ap = argparse.ArgumentParser()
ap.add_argument('--truth', required=True); ap.add_argument('--static', required=True); ap.add_argument('--q20', required=True); ap.add_argument('--out', required=True)
# GM-10b: version 1.1 (Zenodo record 24088217) has the corrected northing and the zip names OSHD_DATA_WY_<year>.zip
ap.add_argument('--north-fix', type=float, default=2000.0); ap.add_argument('--zip-fmt', default='OSHD_DATA_WY{wy}.zip'); ap.add_argument('--version', default='1.0')
a = ap.parse_args()
NORTH_FIX = a.north_fix
tr = Transformer.from_crs('EPSG:4326', 'EPSG:2056', always_xy=True)

truth = json.load(open(a.truth, encoding='utf8'))['gy']
cat = json.load(open(os.path.join(a.static, 'catalog.json'), encoding='utf8'))['glaciers']
catById = {g['id']: g for g in cat}

# --- grid -------------------------------------------------------------------------------------------------------------------------------------
def month_file(y, m):
    wy = y + 1 if m >= 9 else y
    return os.path.join(a.q20, a.zip_fmt.format(wy=wy)), f'OSHD_DATA_{y:04d}-{m:02d}.nc'

zp, nm = month_file(2020, 4)
tmp = tempfile.mkdtemp(prefix='gm10q20-')
with zipfile.ZipFile(zp) as z: z.extract(nm, tmp)
with h5py.File(os.path.join(tmp, nm), 'r') as f:
    E = f['easting'][:]; N = f['northing'][:] + NORTH_FIX
    probe = f['swe'][:, :, 29]
os.remove(os.path.join(tmp, nm))
dem = rasterio.open(os.path.join(a.q20, 'OSHD_MODEL_DOMAIN.tif')); D = dem.read(1); T = dem.transform
colsE = np.round((E - T.c) / T.a - 0.5).astype(int)
def dem_rows(Nv): return np.round((Nv - T.f) / T.e - 0.5).astype(int)

# check of the northing fix: correlation of log SWE (30.04.2020) with the model DEM for shifts of the LABELLED northing
fixcheck = []
for off in range(0, 4001, 500):
    rows = dem_rows(N - NORTH_FIX + off); mr = (rows >= 0) & (rows < D.shape[0]); mc = (colsE >= 0) & (colsE < D.shape[1])
    sub = probe[np.ix_(mc, mr)]; zz = D[np.ix_(rows[mr], colsE[mc])].T; v = sub > -9000
    fixcheck.append({'shiftM': off, 'corr': round(float(np.corrcoef(np.log1p(np.clip(sub[v], 0, None)), zz[v])[0, 1]), 4)})
rowsN = dem_rows(N)
ZC = np.full((len(E), len(N)), np.nan)
mr = (rowsN >= 0) & (rowsN < D.shape[0]); mc = (colsE >= 0) & (colsE < D.shape[1])
ZC[np.ix_(mc, mr)] = D[np.ix_(rowsN[mr], colsE[mc])].T
dx = 250.0

# --- outlines and cells ---------------------------------------------------------------------------------------------------------------------
def lv95_geom(geom):
    def tx(ring): return [tr.transform(x, y) for x, y in ring]
    if geom['type'] == 'Polygon': return shape({'type': 'Polygon', 'coordinates': [tx(r) for r in geom['coordinates']]})
    return shape({'type': 'MultiPolygon', 'coordinates': [[tx(r) for r in p] for p in geom['coordinates']]})

outlines = {}
for fn in sorted(os.listdir(os.path.join(a.static, 'outline'))):
    if not re.match(r'^(ch|at|de)-.*-L1\.json$', fn): continue
    for ft in json.load(open(os.path.join(a.static, 'outline', fn), encoding='utf8'))['features']:
        outlines[ft['properties']['id']] = ft['geometry']

E0, N0 = E[0], N[0]   # E ascending; N descending in v1.0, ascending in v1.1 (GM-10b) => row index from the signed step
dN = float(N[1] - N[0])
def j_of(y): return (y - N0) / dN
def cells_of(gid):
    g = lv95_geom(outlines[gid]); x0, y0, x1, y1 = g.bounds
    i0 = max(0, int(math.floor((x0 - E0) / dx)) - 1); i1 = min(len(E) - 1, int(math.ceil((x1 - E0) / dx)) + 1)
    ja, jb = sorted((j_of(y0), j_of(y1)))
    j0 = max(0, int(math.floor(ja)) - 1); j1 = min(len(N) - 1, int(math.ceil(jb)) + 1)
    if i0 > i1 or j0 > j1: return None, 'outside'
    pg = prep(g); out = [(i, j) for i in range(i0, i1 + 1) for j in range(j0, j1 + 1) if pg.contains(Point(E[i], N[j]))]
    how = 'outline'
    if not out:
        c = g.centroid; i = int(round((c.x - E0) / dx)); j = int(round(j_of(c.y)))
        if not (0 <= i < len(E) and 0 <= j < len(N)): return None, 'outside'
        out = [(i, j)]; how = 'nearest'
    return out, how

# truth glaciers
keys = {}
for o in truth: keys.setdefault(o['key'], o)
tg = {}
for k, o in keys.items():
    gid = o.get('catId')
    if gid not in outlines: tg[k] = {'catId': gid, 'how': 'no-outline'}; continue
    cells, how = cells_of(gid)
    tg[k] = {'catId': gid, 'country': o['country'], 'how': how, 'cells': cells}

# all Swiss catalogue glaciers for the region reference (cells shared by two glaciers count once per region)
regionCells = {}
for g in cat:
    if g['country'] != 'CH' or g['id'] not in outlines: continue
    cells, how = cells_of(g['id'])
    if cells: regionCells.setdefault(g['region'], set()).update(cells)

# --- days to read (GM-11 1d B: 1 Oct and the four dates of every winter of the truth, water years 2016-2025) ----------------------------------
def d(s): return dt.date.fromisoformat(s)
need = set(); wins = []
for o in truth:
    if tg.get(o['key'], {}).get('cells') is None: continue
    Y = o['year']
    if not (2016 <= Y <= 2025): continue
    days = [dt.date(Y - 1, 10, 1)] + [dt.date(Y, m, 1) for m in (1, 2, 3, 4)]
    for x in days: need.add(x)
    wins.append((o['key'], Y, days))
byMonth = {}
for day in sorted(need): byMonth.setdefault((day.year, day.month), []).append(day)
vals = {}   # (key, day) -> mean swe over glacier cells ; region: (region, day) -> mean
missing = {}
for (y, m), days in sorted(byMonth.items()):
    zp, nm = month_file(y, m)
    with zipfile.ZipFile(zp) as z: z.extract(nm, tmp)
    p = os.path.join(tmp, nm)
    with h5py.File(p, 'r') as f:
        units = f['time'].attrs['units'].decode()
        base = dt.date.fromisoformat(re.search(r'since (\d{4}-\d{2}-\d{2})', units).group(1))
        tt = f['time'][:]
        for day in days:
            idx = int(np.where(np.isclose(tt, (day - base).days))[0][0])
            S = f['swe'][:, :, idx]
            for k, e in tg.items():
                if not e.get('cells'): continue
                v = np.array([S[i, j] for i, j in e['cells']]); ok = v > -9000
                if ok.sum() < len(v): missing[k] = missing.get(k, 0) + int((~ok).sum())
                vals[(k, day)] = float(v[ok].mean()) if ok.any() else None
            for r, cs in regionCells.items():
                v = np.array([S[i, j] for i, j in cs]); ok = v > -9000
                vals[(r, day)] = float(v[ok].mean()) if ok.any() else None
    os.remove(p)
    print(f'{y}-{m:02d}: {len(days)} Tage', flush=True)

out = {'kind': 'gm11/oshd-dates', 'source': f'SLF snow dataset 2016-2025, Zenodo v{a.version} (CC BY 4.0), northing +{NORTH_FIX:.0f} m; Analyse, keine Messung',
       'rule': 'swe at 06:00 UTC+1 of 1 Oct, 1 Jan, 1 Feb, 1 Mar, 1 Apr; mean over cell centres inside the L1 outline', 'glaciers': {}}
for k, yr, days in wins:
    out['glaciers'].setdefault(k, {'how': tg[k]['how'], 'nCells': len(tg[k]['cells']), 'winters': {}})
    out['glaciers'][k]['winters'][str(yr)] = [None if vals.get((k, x)) is None else round(vals[(k, x)], 1) for x in days]
json.dump(out, open(a.out, 'w', encoding='utf8'), indent=1)
os.rmdir(tmp)
