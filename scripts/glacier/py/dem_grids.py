"""Elevation grids of the glaciers the satellite line evaluates (classes A and B, not DE), cropped from the Copernicus DEM GLO-30.

The scanner needs the elevation of every Sentinel-2 pixel of a glacier (snow line = elevation where the snow share crosses 50 %).
Reading the DEM tiles at run time would put a second network dependency into every job; the grids are tiny, so they ship with the
static build: `dem/<region>.json`, one lattice cell = 1/3600 degree (the DEM's own 1 arc-second lattice, cell edges at integer
multiples of 1/3600), Int16 little-endian, row 0 = north, base64.
"""
import base64
import math
import os

import numpy as np
import rasterio
from rasterio.windows import Window

CELL = 3600          # lattice cells per degree
NODATA = -32768
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


def grid_for(geom_ll, dem_dir, pad=2):
    """{x0, y1, nx, ny, z(base64 int16)} covering the bounding box of the outline (lon/lat) plus `pad` cells; None without any DEM."""
    x0, y0, x1, y1 = geom_ll.bounds
    gx0, gx1 = math.floor(x0 * CELL) - pad, math.ceil(x1 * CELL) + pad
    gy0, gy1 = math.floor(y0 * CELL) - pad, math.ceil(y1 * CELL) + pad
    nx, ny = gx1 - gx0, gy1 - gy0
    z = np.full((ny, nx), NODATA, dtype=np.int16)
    have = False
    for la in range(math.floor(gy0 / CELL), math.floor((gy1 - 1) / CELL) + 1):
        for lo in range(math.floor(gx0 / CELL), math.floor((gx1 - 1) / CELL) + 1):
            ds = _tile(dem_dir, la, lo)
            if ds is None:
                continue
            # lattice columns/rows of this tile that fall inside the canvas
            c0, c1 = max(gx0, lo * CELL), min(gx1, (lo + 1) * CELL)
            r_top, r_bot = max(gy0, la * CELL), min(gy1, (la + 1) * CELL)        # south-to-north cell indices of the canvas
            if c1 <= c0 or r_bot <= r_top:
                continue
            # tile row j counts from the tile's north edge (la + 1) * CELL; canvas row r counts from gy1
            j0, j1 = (la + 1) * CELL - r_bot, (la + 1) * CELL - r_top
            win = Window(c0 - lo * CELL, j0, c1 - c0, j1 - j0)
            a = ds.read(1, window=win).astype("float64")
            bad = ~np.isfinite(a)
            if ds.nodata is not None:
                bad |= a == ds.nodata
            q = np.where(bad, NODATA, np.clip(np.rint(a), -500, 6000)).astype(np.int16)
            r0 = gy1 - r_bot
            z[r0:r0 + q.shape[0], c0 - gx0:c0 - gx0 + q.shape[1]] = q
            have = True
    if not have:
        return None
    return {"x0": int(gx0), "y1": int(gy1), "nx": int(nx), "ny": int(ny), "z": base64.b64encode(z.astype("<i2").tobytes()).decode("ascii")}
