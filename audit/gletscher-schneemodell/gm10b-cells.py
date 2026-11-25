"""Phase GM-10b, size measurement (post hoc, V-GM-118) - 250-m cells of the SLF snow dataset (Q20 v1.1) inside the L1 outline of EVERY Swiss
catalogue glacier, with its catalogue area. Measurement only; reads the local cache, writes one JSON into the cache. Never writes into a repo.

    <venv>/python -I audit/gletscher-schneemodell/gm10b-cells.py --static <static/20261120-1> --q20 <gm10/q20-v1.1> --q20gl <gm10/q20-glaciers.json> --out <gm10/cells-ch.json>

Cell rule as gm10-q20.py: a cell belongs to a glacier when its centre lies inside the L1 outline; nIn = number of such cells (0 is allowed: Q20 then
uses the nearest cell, `how: nearest`). Version 1.1 carries the corrected northing (no shift); the row order is read from the coordinates (V-GM-121).
Gegenprobe: for the glaciers of q20-glaciers.json (step 0, version 1.0 + 2000 m) nIn and `how` must be equal; the script stops otherwise.
"""
import argparse, json, math, os, re, tempfile, zipfile
import h5py, numpy as np
from pyproj import Transformer
from shapely.geometry import shape, Point
from shapely.prepared import prep

ap = argparse.ArgumentParser()
ap.add_argument('--static', required=True); ap.add_argument('--q20', required=True); ap.add_argument('--q20gl', required=True); ap.add_argument('--out', required=True)
a = ap.parse_args()
tr = Transformer.from_crs('EPSG:4326', 'EPSG:2056', always_xy=True)
cat = json.load(open(os.path.join(a.static, 'catalog.json'), encoding='utf8'))
glaciers = [g for g in cat['glaciers'] if g['country'] == 'CH']

tmp = tempfile.mkdtemp(prefix='gm10bcells-'); nm = 'OSHD_DATA_2020-04.nc'
with zipfile.ZipFile(os.path.join(a.q20, 'OSHD_DATA_WY_2020.zip')) as z: z.extract(nm, tmp)
with h5py.File(os.path.join(tmp, nm), 'r') as f: E = f['easting'][:]; N = f['northing'][:]
os.remove(os.path.join(tmp, nm)); os.rmdir(tmp)
dx = 250.0; E0, N0 = E[0], N[0]; dN = float(N[1] - N[0])
assert abs(abs(dN) - dx) < 1e-6 and abs(float(E[1] - E[0]) - dx) < 1e-6
def j_of(y): return (y - N0) / dN

def lv95_geom(geom):
    def tx(ring): return [tr.transform(x, y) for x, y in ring]
    if geom['type'] == 'Polygon': return shape({'type': 'Polygon', 'coordinates': [tx(r) for r in geom['coordinates']]})
    return shape({'type': 'MultiPolygon', 'coordinates': [[tx(r) for r in p] for p in geom['coordinates']]})
outlines = {}
for fn in sorted(os.listdir(os.path.join(a.static, 'outline'))):
    if not re.match(r'^ch-.*-L1\.json$', fn): continue
    for ft in json.load(open(os.path.join(a.static, 'outline', fn), encoding='utf8'))['features']: outlines[ft['properties']['id']] = ft['geometry']

def n_inside(gid):
    g = lv95_geom(outlines[gid]); x0, y0, x1, y1 = g.bounds
    i0 = max(0, int(math.floor((x0 - E0) / dx)) - 1); i1 = min(len(E) - 1, int(math.ceil((x1 - E0) / dx)) + 1)
    ja, jb = sorted((j_of(y0), j_of(y1))); j0 = max(0, int(math.floor(ja)) - 1); j1 = min(len(N) - 1, int(math.ceil(jb)) + 1)
    if i0 > i1 or j0 > j1: return None
    pg = prep(g); return sum(1 for i in range(i0, i1 + 1) for j in range(j0, j1 + 1) if pg.contains(Point(E[i], N[j])))

out = {'kind': 'gm10b/cells-ch', 'source': 'Q20 v1.1 (Zenodo record 24088217) grid, 250 m, cell centre inside the L1 outline', 'catalogue': cat.get('build'), 'glaciers': {}}
noOutline = 0
for g in glaciers:
    if g['id'] not in outlines: noOutline += 1; out['glaciers'][g['id']] = {'area': g['area']['km2'], 'nIn': None}; continue
    out['glaciers'][g['id']] = {'area': g['area']['km2'], 'nIn': n_inside(g['id'])}
out['noOutline'] = noOutline

# Gegenprobe against step 0 (version 1.0 + 2000 m)
q = json.load(open(a.q20gl, encoding='utf8'))['glaciers']; checked = 0
for k, r in q.items():
    if r.get('country') != 'CH' or r.get('nCells') is None: continue
    c = out['glaciers'][r['catId']]['nIn']; exp = 0 if r['how'] == 'nearest' else r['nCells']
    if c != exp: raise SystemExit(f'Gegenprobe: {k} {r["catId"]} nIn {c} != step 0 {exp} ({r["how"]})')
    checked += 1
out['checkedAgainstStep0'] = checked
json.dump(out, open(a.out, 'w', encoding='utf8'), indent=0)
print(f'{len(glaciers)} Schweizer Gletscher, ohne Umriss {noOutline}, Gegenprobe {checked} gleich')
