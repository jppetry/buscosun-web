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
import argparse, base64, glob, json, math, os, re, time, datetime as dt
import ctypes
import numpy as np, rasterio
from rasterio.merge import merge
from rasterio.features import rasterize

BAND_M = 50     # set
RING_M = 150    # set
HOR_KM = 10      # set: horizon search radius
HOR_SAMPLES = 25 # set: sample cells per level
HOR_AZ = [15 * k for k in range(24)]   # 0 = north, clockwise
# steps along the ray (m): 30 m to 1 km, 60 m to 3 km, 120 m to 10 km
HOR_STEPS = np.concatenate([np.arange(30, 1000 + 1e-6, 30), np.arange(1060, 3000 + 1e-6, 60), np.arange(3120, HOR_KM * 1000 + 1e-6, 120)])
EARTH_R = 6371000.0
MIN_FREE_GB = 3.0
SUN_YEAR = 2026  # set: the calendar the day of year is taken from (not a leap year)
SUN_DAY = 15     # set: day of the month


def sun_pos(lat_deg, lon_deg, month, hour, minute=30):
    """cos of the zenith angle and azimuth (degrees from north, clockwise) at UTC `hour`:`minute` of SUN_DAY.`month`.SUN_YEAR.
    cosZenith of scripts/glacier/lib/meltcore.mjs (Spencer 1971) line by line; azimuth from the same declination and hour angle."""
    doy = np.array([0] + [(dt.date(SUN_YEAR, m, SUN_DAY) - dt.date(SUN_YEAR, 1, 1)).days + 1 for m in range(1, 13)])[np.asarray(month)]
    gam = (2 * np.pi / 365) * (doy - 1 + (hour - 12) / 24)
    eqt = 229.18 * (0.000075 + 0.001868 * np.cos(gam) - 0.032077 * np.sin(gam) - 0.014615 * np.cos(2 * gam) - 0.040849 * np.sin(2 * gam))
    decl = 0.006918 - 0.399912 * np.cos(gam) + 0.070257 * np.sin(gam) - 0.006758 * np.cos(2 * gam) + 0.000907 * np.sin(2 * gam) - 0.002697 * np.cos(3 * gam) + 0.00148 * np.sin(3 * gam)
    minutes = hour * 60 + minute
    ha = ((minutes + eqt + 4 * lon_deg) / 4 - 180) * np.pi / 180
    lat = np.radians(lat_deg)
    cosz = np.sin(lat) * np.sin(decl) + np.cos(lat) * np.cos(decl) * np.cos(ha)
    az = (np.degrees(np.arctan2(np.sin(ha), np.cos(ha) * np.sin(lat) - np.tan(decl) * np.cos(lat))) + 180) % 360
    return cosz, az
MARGIN_M = 3000   # window = outline box + 3 km, as snowcal_predictors.py (same grid, so the northness agrees); >= RING_M

ap = argparse.ArgumentParser()
for k in ('static', 'dem'): ap.add_argument('--' + k)
ap.add_argument('--out', required=True)
ap.add_argument('--sun-out', default=None, help='write only the compact sun file from the existing --out (no computation)')
ap.add_argument('--only', default=None)
ap.add_argument('--count', action='store_true')
ap.add_argument('--north-ref', default=None)
a = ap.parse_args()
if a.sun_out:
    src = json.load(open(a.out, encoding='utf8'))
    hd = src['horizon']
    comp = {'kind': 'glacier/sun-table', 'build': src['build'], 'builtAt': src['builtAt'], 'from': os.path.basename(a.out), 'dem': src['dem'],
            'sun': {**hd['sun'], 'day': SUN_DAY, 'year': SUN_YEAR}, 'svf': hd['svf'], 'glaciers': {}}
    for gid, g in src['glaciers'].items():
        lv = g.get('levels', [])
        if len(lv) == 3 and all(x.get('sun') and x.get('svf') is not None for x in lv):
            comp['glaciers'][gid] = {'z': [x['z'] for x in lv], 'sun': [x['sun'] for x in lv], 'svf': [x['svf'] for x in lv]}
    json.dump(comp, open(a.sun_out, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
    print(f"{len(comp['glaciers'])} von {len(src['glaciers'])} Gletschern -> {a.sun_out}")
    raise SystemExit(0)
if not a.static or not a.dem: ap.error('--static and --dem are required unless --sun-out')
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

def free_gb():
    class MS(ctypes.Structure):
        _fields_ = [('l', ctypes.c_ulong), ('load', ctypes.c_ulong), ('tp', ctypes.c_ulonglong), ('ap', ctypes.c_ulonglong), ('tf', ctypes.c_ulonglong),
                    ('af', ctypes.c_ulonglong), ('tv', ctypes.c_ulonglong), ('av', ctypes.c_ulonglong), ('ae', ctypes.c_ulonglong)]
    m = MS(); m.l = ctypes.sizeof(MS)
    return ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)) and m.ap / 2**30 or float('nan')

def horizon_of(geom, x0, y0, x1, y1, pts):
    """pts = [(lon, lat, z0)]; returns (hor[ns][24] in degrees, edge[ns]) on a window outline + HOR_KM (own window, A1 untouched)."""
    lat = (y0 + y1) / 2; mlat = (HOR_KM * 1000 + 200) / 110540; mlon = (HOR_KM * 1000 + 200) / (111320 * math.cos(math.radians(lat)))
    b = (x0 - mlon, y0 - mlat, x1 + mlon, y1 + mlat)
    allk = [(la, lo) for la in range(math.floor(b[1]), math.floor(b[3]) + 1) for lo in range(math.floor(b[0]), math.floor(b[2]) + 1)]
    have = [k for k in allk if k in tilePaths]
    W, T = merge([tile(k) for k in have], bounds=b, nodata=-32768)
    W = W[0].astype(np.float32); W[W < -1000] = np.nan
    P = np.array(pts, dtype=float)                            # ns x 3
    az = np.radians(np.array(HOR_AZ, dtype=float)); d = HOR_STEPS
    dE = np.sin(az)[:, None] * d[None, :]; dN = np.cos(az)[:, None] * d[None, :]   # 24 x S metres
    lon = P[:, 0, None, None] + dE[None] / (111320 * np.cos(np.radians(P[:, 1, None, None])))
    la = P[:, 1, None, None] + dN[None] / 110540
    col = np.floor((lon - T.c) / T.a).astype(int); row = np.floor((la - T.f) / T.e).astype(int)
    inside = (row >= 0) & (row < W.shape[0]) & (col >= 0) & (col < W.shape[1])
    zr = np.full(col.shape, np.nan, dtype=np.float32); zr[inside] = W[row[inside], col[inside]]
    edge = (~np.isfinite(zr)).any(axis=(1, 2))                      # per sample
    ang = np.degrees(np.arctan((zr - P[:, 2, None, None] - d[None, None, :] ** 2 / (2 * EARTH_R)) / d[None, None, :]))
    hor = np.nanmax(np.where(np.isfinite(ang), ang, -90.0), axis=2)   # ns x 24
    return hor, edge

MONTHS = np.repeat(np.arange(1, 13), 24); HOURS = np.tile(np.arange(24), 12)
def sun_table(S, H):
    """S = samples [lon, lat, z, dz/dcol, dz/drow-grid]; H = their horizons [ns][24]. Returns (base64 of 288 bytes, 12 ratios)."""
    cz, az = sun_pos(S[:, 1, None], S[:, 0, None], MONTHS[None, :], HOURS[None, :])        # ns x 288
    elev = np.degrees(np.arcsin(np.clip(cz, -1, 1)))
    # surface normal (east, north, up) from the A1 gradient: dz/dE = gx, dz/dN = -gy (rows run south)
    nE, nN = -S[:, 3], S[:, 4]; nU = np.ones(len(S)); nn = np.sqrt(nE ** 2 + nN ** 2 + 1)
    ce = np.cos(np.radians(elev)); sE, sN, sU = np.sin(np.radians(az)) * ce, np.cos(np.radians(az)) * ce, np.sin(np.radians(elev))
    inc = (nE[:, None] * sE + nN[:, None] * sN + nU[:, None] * sU) / nn[:, None]
    # horizon in the sun's direction, linear in azimuth between the 24 directions
    x = az / 15.0; i0 = np.floor(x).astype(int) % 24; i1 = (i0 + 1) % 24; w = x - np.floor(x)
    rows = np.arange(len(S))[:, None]
    hz = H[rows, i0] * (1 - w) + H[rows, i1] * w
    c = np.where((elev > hz) & (elev > 0), np.maximum(0.0, inc), 0.0).mean(axis=0)        # 288
    flat = np.where(elev > 0, cz, 0.0).mean(axis=0)
    q = np.clip(np.round(c * 255), 0, 255).astype(np.uint8)
    day = [round(float(c[m * 24:(m + 1) * 24].sum() / flat[m * 24:(m + 1) * 24].sum()), 2) if flat[m * 24:(m + 1) * 24].sum() > 0 else None for m in range(12)]
    return base64.b64encode(q.tobytes()).decode('ascii'), day

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
    levels = []; samples = []
    for zz in g['z']:
        if zz is None or not math.isfinite(zz): levels.append({'z': zz, 'why': 'no elevation'}); samples.append([]); continue
        d = np.abs(Z - zz); sel = valid & (d <= BAND_M); how = 'band'; dz = None
        if not sel.any():
            dmin = float(np.nanmin(np.where(valid, d, np.nan))); sel = valid & (d <= dmin + BAND_M); how = 'nearest'; dz = round(dmin)
        I, J = np.nonzero(sel)
        k = np.unique(np.round(np.linspace(0, len(I) - 1, min(HOR_SAMPLES, len(I)))).astype(int))
        samples.append([(T.c + (J[q] + 0.5) * T.a, T.f + (I[q] + 0.5) * T.e, float(Z[I[q], J[q]]), float(gx_[I[q], J[q]]), float(gy_[I[q], J[q]])) for q in k])
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
    # A2: horizon and sky view at up to HOR_SAMPLES cells of each level (own window outline + HOR_KM)
    flat = [p for s_ in samples for p in s_]
    if flat:
        hor, edge = horizon_of(geom, x0, y0, x1, y1, flat)
        o = 0
        for e, s_ in zip(levels, samples):
            if not s_: continue
            h_, ed = hor[o:o + len(s_)], edge[o:o + len(s_)]; o += len(s_)
            e['hor'] = [round(float(v), 1) for v in h_.mean(axis=0)]
            e['svf'] = r3(np.mean(np.cos(np.radians(np.maximum(h_, 0))) ** 2))
            e['ns'] = len(s_); e['edge'] = bool(ed.any())
            e['sun'], e['sunDay'] = sun_table(np.array(s_, dtype=float), h_)
    return {**whole, 'levels': levels}

out = {'kind': 'glacier/terrain-params', 'build': catDoc.get('build'), 'builtAt': dt.date.today().isoformat(),
       'dem': {'source': 'Copernicus DEM GLO-30 (tiles of the cache)', 'attribution': '© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved'},
       'constants': {'bandM': {'v': BAND_M, 'origin': 'set'}, 'ringM': {'v': RING_M, 'origin': 'set'}, 'horKm': {'v': HOR_KM, 'origin': 'set'}, 'horSamples': {'v': HOR_SAMPLES, 'origin': 'set'}},
       'horizon': {'azimuths': HOR_AZ, 'steps': '30 m to 1 km, 60 m to 3 km, 120 m to 10 km', 'curvature': 'earth drop d^2/(2R), R = 6371 km', 'window': 'outline box + 10 km (own window; A1 fields use outline box + 3 km)',
                   'samples': 'up to horSamples cells of the level, evenly spread over its cells in row order', 'edge': 'a ray of a sample met no DEM value (window ran out of tiles): the horizon may be too low',
                   'sun': {'definition': 'per hour: mean over the samples of max(0, cos(angle sun - surface normal of the sample)) where the sun stands above the own horizon of the sample in its direction (horizon linear in azimuth), else 0; normal from the A1 gradient of the sample cell',
                           'encoding': '288 bytes, c x 255 rounded, base64; index = 24 * (month - 1) + hour, months first', 'day': f'the {SUN_DAY}th of each month, year {SUN_YEAR}',
                           'time': 'UTC, the middle of each hour (hh:30); solar position at the longitude and latitude of each sample (the own longitude of the glacier), cosZenith of meltcore.mjs (Spencer 1971)',
                           'sunDay': 'per month: sum of c over the day / sum of the flat cos zenith over the hours with the sun above 0 deg (free horizon), two decimals'},
                   'svf': {'formula': 'mean over the 24 directions of cos^2(max(horizon, 0)), mean over the samples', 'origin': 'literature', 'source': 'sky-view factor of a horizontal surface, Dozier & Frew (1990), IEEE TGRS 28(5)'}},
       'rules': {'cells': 'GLO-30 cells inside the L1 outline within +-bandM of the elevation, else within bandM of the nearest elevation of the outline (how: nearest, dz)',
                 'gradient': 'np.gradient in metres as snowcal_predictors.py; aspect = down-slope direction', 'curv': 'cell elevation - mean of the ring ringM away (m)',
                 'levels': 'catalogue z = [tongue, median, top]'},
       'glaciers': {}}
fg = free_gb(); print(f'frei {fg:.1f} GB (Start)', flush=True)
if fg < MIN_FREE_GB: raise SystemExit(f'weniger als {MIN_FREE_GB} GB frei - Abbruch')
for n, g in enumerate(glaciers):
    if n % 50 == 0 and free_gb() < MIN_FREE_GB: raise SystemExit(f'weniger als {MIN_FREE_GB} GB frei bei {n}/{len(glaciers)} - Abbruch, nichts geschrieben')
    try: r = terrain_of(g)
    except Exception as ex: r = {'why': f'error: {ex}'}
    out['glaciers'][g['id']] = {'country': g['country'], 'region': g['region'], **r}
    if n % 200 == 0: print(f'{n}/{len(glaciers)}', flush=True)
json.dump(out, open(a.out, 'w', encoding='utf8'), ensure_ascii=False)
print(f'frei {free_gb():.1f} GB (Ende)', flush=True)
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
    L = [(gid, r, lv) for gid, r in G.items() for lv in r.get('levels', [])]
    for i, name in enumerate(('tongue', 'median', 'top')):
        sv = [r['levels'][i]['svf'] for r in G.values() if len(r.get('levels', [])) == 3 and r['levels'][i].get('svf') is not None]
        hs = [r['levels'][i]['hor'][12] for r in G.values() if len(r.get('levels', [])) == 3 and r['levels'][i].get('hor')]
        lines['median'][name]['svf'] = round(float(np.median(sv)), 3); lines['median'][name]['horSouth'] = round(float(np.median(hs)), 1)
    lines['levelsEdge'] = sum(1 for _, _, lv in L if lv.get('edge'))
    names = {g['id']: g.get('name') or g['id'] for g in glaciers}
    mid = [(gid, r) for gid, r in G.items() if len(r.get('levels', [])) == 3 and r['levels'][1].get('svf') is not None]
    lines['lowestSvfMedian'] = [f"{names[gid]} ({r['country']}, {r['region']}) {r['levels'][1]['svf']}" for gid, r in sorted(mid, key=lambda x: x[1]['levels'][1]['svf'])[:5]]
    lines['highestHorSouthMedian'] = [f"{names[gid]} ({r['country']}, {r['region']}) {r['levels'][1]['hor'][12]}°" for gid, r in sorted(mid, key=lambda x: -x[1]['levels'][1]['hor'][12])[:5]]
    for i, name in enumerate(('tongue', 'median', 'top')):
        for mname, m in (('dec', 11), ('mar', 2), ('jun', 5), ('sep', 8)):
            v = [r['levels'][i]['sunDay'][m] for r in G.values() if len(r.get('levels', [])) == 3 and r['levels'][i].get('sunDay') and r['levels'][i]['sunDay'][m] is not None]
            lines['median'][name]['sunDay_' + mname] = round(float(np.median(v)), 2)
    lines['zeroSunDecMedian'] = sum(1 for _, r in mid if r['levels'][1].get('sunDay') and r['levels'][1]['sunDay'][11] == 0)
    jun = [(gid, r) for gid, r in mid if r['levels'][1].get('sunDay')]
    fmt = lambda gid, r: f"{names[gid]} ({r['country']}, {r['region']}) {r['levels'][1]['sunDay'][5]}"
    lines['highestSunJunMedian'] = [fmt(*x) for x in sorted(jun, key=lambda x: -x[1]['levels'][1]['sunDay'][5])[:5]]
    lines['lowestSunJunMedian'] = [fmt(*x) for x in sorted(jun, key=lambda x: x[1]['levels'][1]['sunDay'][5])[:5]]
    if a.north_ref:
        ref = json.load(open(a.north_ref, encoding='utf8'))['glaciers']
        d = [G[k]['north'] - v['north'] for k, v in ref.items() if k in G and G[k].get('north') is not None and v.get('north') is not None]
        ad = np.abs(d)
        lines['northVsPredictors'] = {'n': len(d), 'medianAbs': round(float(np.median(ad)), 4), 'p95Abs': round(float(np.percentile(ad, 95)), 4), 'maxAbs': round(float(ad.max()), 4),
                                      'equal3dp': int((ad < 0.0005).sum())}
    print(json.dumps(lines, indent=1, ensure_ascii=False))
