"""Phase GM, GM-3 - daily precipitation of the MeteoSwiss grid RhiresD (1 km, CC BY 4.0, "Source: MeteoSwiss") at the nearest cell of every Swiss glacier of the
calibration truth.

    python scripts/glacier/py/snowcal_grid.py --truth <gy.json> --dir <folder with rhiresd_<year>.nc> --out <rhires.json> [--from 2011 --to 2025]
    python scripts/glacier/py/snowcal_grid.py --points <points.json> --files <a.nc,b.nc,...> --out <out.json>     (any daily files of the collection, e.g. RprelimD)

The yearly files are NetCDF-4 (HDF5) and read with h5py: variable `RhiresD(time, N, E)` in mm, `lat(N, E)`, `lon(N, E)`, fill value -999.99. A RhiresD day D is the sum
from 06 UTC of D to 06 UTC of D + 1 (MeteoSwiss, product documentation); the output keeps the day index and says so. Nothing is interpolated: one cell per glacier.
"""
import argparse
import json
import math
import re

import h5py
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--truth', default=None)
ap.add_argument('--dir', default=None)
ap.add_argument('--files', default=None, help='comma-separated NetCDF files instead of --dir/--from/--to; the 3-D variable is found by its shape')
ap.add_argument('--out', required=True)
ap.add_argument('--from', dest='y0', type=int, default=2011)
ap.add_argument('--to', dest='y1', type=int, default=2025)
ap.add_argument('--points', default=None, help='optional JSON list of {key, lat, lon} instead of the Swiss glaciers of the truth')
a = ap.parse_args()

if a.points:
    pts = {p['key']: p for p in json.load(open(a.points, encoding='utf8'))}
else:
    pts = {}
    for o in json.load(open(a.truth, encoding='utf8'))['gy']:
        if o['country'] == 'CH':
            pts[o['key']] = {'key': o['key'], 'name': o['name'], 'lat': o['lat'], 'lon': o['lon']}

cells = None
series = {k: [] for k in pts}
dates = []
files = a.files.split(',') if a.files else [f'{a.dir}/rhiresd_{y}.nc' for y in range(a.y0, a.y1 + 1)]
for y in files:
    with h5py.File(y, 'r') as f:
        if cells is None:
            lat, lon = f['lat'][:], f['lon'][:]
            cells = {}
            for k, p in pts.items():
                d = (lat - p['lat']) ** 2 + ((lon - p['lon']) * math.cos(math.radians(p['lat']))) ** 2
                i, j = np.unravel_index(np.argmin(d), d.shape)
                km = math.sqrt(float(d[i, j])) * 111.2
                cells[k] = (int(i), int(j), float(lat[i, j]), float(lon[i, j]), round(km, 2))
        v = next(f[k] for k in f.keys() if isinstance(f[k], h5py.Dataset) and f[k].ndim == 3)
        fill = float(v.attrs['_FillValue'][0])
        n = v.shape[0]
        units = f['time'].attrs['units']
        units = units.decode() if isinstance(units, bytes) else units
        base = np.datetime64(re.search(r'since (\d{4}-\d{2}-\d{2})', units).group(1))
        dates.extend(str(base + np.timedelta64(int(round(float(t))), 'D')) for t in f['time'][:])
        data = v[:]                                    # (days, N, E), 140 MB as float32
        for k, (i, j, _, _, _) in cells.items():
            col = data[:, i, j].astype(float)
            series[k].extend([None if (x <= fill + 1 or not math.isfinite(x)) else round(float(x), 2) for x in col])
        print(str(y).replace(chr(92), '/').split('/')[-1], n, 'days')

out = {
    'kind': 'glacier/snowcal-rhires', 'source': 'MeteoSwiss RhiresD (ch.meteoschweiz.ogd-surface-derived-grid), CC BY 4.0, Quelle: MeteoSchweiz',
    'day0': dates[0], 'dates': None if not a.files else dates, 'dayMeaning': 'index d = sum from 06 UTC of day0 + d to 06 UTC of the following day',
    'points': {k: {**pts[k], 'cell': {'n': cells[k][0], 'e': cells[k][1], 'lat': cells[k][2], 'lon': cells[k][3], 'km': cells[k][4]}, 'p': series[k]} for k in pts},
}
json.dump(out, open(a.out, 'w', encoding='utf8'))
for k in pts:
    s = [x for x in series[k] if x is not None]
    print(f"{pts[k].get('name', k):44s} cell {cells[k][4]:5.2f} km  days {len(series[k])}  missing {len(series[k]) - len(s)}  mean/yr {sum(s) / (len(series[k]) / 365.25):7.0f} mm")
