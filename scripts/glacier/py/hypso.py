"""Area per elevation band of one glacier outline from the Copernicus DEM GLO-30 tiles (1 arc-second, WGS84)."""
import math
import os

import numpy as np
import rasterio
from rasterio import features
from rasterio.windows import from_bounds

_DS = {}


def _tile(dem_dir, lat0, lon0):
    ns = "N" if lat0 >= 0 else "S"
    ew = "E" if lon0 >= 0 else "W"
    name = "Copernicus_DSM_COG_10_%s%02d_00_%s%03d_00_DEM" % (ns, abs(lat0), ew, abs(lon0))
    key = (lat0, lon0)
    if key not in _DS:
        p = os.path.join(dem_dir, name + ".tif")
        _DS[key] = rasterio.open(p) if os.path.exists(p) else None
    return _DS[key]


def band_areas(geom_ll, dem_dir, band_m=50):
    """Returns {z0, a:[km² per band from z0 upwards], zr:[min,max], px} or None when no DEM pixel centre lies inside the outline."""
    x0, y0, x1, y1 = geom_ll.bounds
    pad = 0.0004
    bands = {}
    zmin, zmax, px = 1e9, -1e9, 0
    for la in range(math.floor(y0 - pad), math.floor(y1 + pad) + 1):
        for lo in range(math.floor(x0 - pad), math.floor(x1 + pad) + 1):
            ds = _tile(dem_dir, la, lo)
            if ds is None:
                continue
            b = ds.bounds
            wx0, wy0, wx1, wy1 = max(x0 - pad, b.left), max(y0 - pad, b.bottom), min(x1 + pad, b.right), min(y1 + pad, b.top)
            if wx1 <= wx0 or wy1 <= wy0:
                continue
            win = from_bounds(wx0, wy0, wx1, wy1, ds.transform).round_offsets().round_lengths()
            if win.width < 1 or win.height < 1:
                continue
            z = ds.read(1, window=win, boundless=False).astype("float64")
            t = ds.window_transform(win)
            mask = features.geometry_mask([geom_ll], out_shape=z.shape, transform=t, invert=True, all_touched=False)
            if ds.nodata is not None:
                mask &= z != ds.nodata
            if not mask.any():
                continue
            rows = np.arange(z.shape[0])
            lat = t.f + (rows + 0.5) * t.e
            km2_row = (abs(t.a) * 111.320 * np.cos(np.radians(lat))) * (abs(t.e) * 110.574)
            area = np.broadcast_to(km2_row[:, None], z.shape)[mask]
            zz = z[mask]
            idx = np.floor(zz / band_m).astype(int)
            for i, a in zip(idx.tolist(), area.tolist()):
                bands[i] = bands.get(i, 0.0) + float(a)
            zmin, zmax, px = min(zmin, zz.min()), max(zmax, zz.max()), px + int(mask.sum())
    if not bands:
        return None
    lo, hi = min(bands), max(bands)
    return {"z0": int(lo) * band_m, "a": [round(bands.get(i, 0.0), 4) for i in range(int(lo), int(hi) + 1)], "zr": [int(round(zmin)), int(round(zmax))], "px": int(px)}
