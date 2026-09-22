"""hsurf_cells.py — the model orography Open-Meteo publishes (data/<model>/static/HSURF.om) at the extract cells of
each grid, for the independent cell-mapping proof V2 (verify-hindcast.mjs). −999 = sea in Open-Meteo's HSURF
(measured 19.09.: 223 447 such cells in ICON-D2), NaN = outside the model domain. Writes cells/hsurf-<model>.json.

  .venv/Scripts/python.exe scripts/hindcast/hsurf_cells.py
"""
import json, os
import numpy as np, s3fs
from omfiles import OmFileReader

ROOT = os.environ.get("HINDCAST_ROOT", "C:/dev/buscosun-hindcast")
PAIRS = {"dwd_icon_d2": "icon_d2", "dwd_icon_eu": "icon_eu", "dwd_icon": "icon_global_om", "ecmwf_ifs025": "ecmwf025",
         "ecmwf_aifs025_single": "ecmwf025", "meteoswiss_icon_ch1": "icon_ch1_om", "meteoswiss_icon_ch2": "icon_ch2_om"}
fs = s3fs.S3FileSystem(anon=True, client_kwargs={"region_name": "us-west-2"})
for model, grid in PAIRS.items():
    local = os.path.join(ROOT, "cache", f"hsurf_{model}.om")
    if not os.path.exists(local):
        open(local, "wb").write(fs.cat(f"openmeteo/data/{model}/static/HSURF.om"))
    a = OmFileReader(local)[:]
    doc = json.load(open(os.path.join(ROOT, "cells", f"extract-{grid}.json"), encoding="utf-8"))
    vals = [None if np.isnan(a[r, c]) else float(a[r, c]) for r, c in doc["cells"]]
    json.dump({"model": model, "grid": grid, "cellsHash": doc["hash"], "values": vals}, open(os.path.join(ROOT, "cells", f"hsurf-{model}.json"), "w"))
    v = np.array([x for x in vals if x is not None])
    print(model, grid, len(vals), "cells · sea(−999)", int((v == -999).sum()), "· NaN", sum(x is None for x in vals))

# Full HSURF arrays as raw float32 (row-major, shape = the om array = GRIDS ny × nx):
#  • ICON-CH (rotated) for cells.mjs: the producer takes the native triangle nearest to the cube centre; Open-Meteo's
#    rotated point nearest to that centre often carries a neighbouring triangle (nn_weights.om). cells.mjs picks, among
#    the rotated points around the centre, the one whose orography equals the producer's hmodel column (V-HC-3);
#  • every model for V2's argmin proof (the recipe shifted by up to ±2 source cells must fit the hmodel column worse).
for model in PAIRS:
    a = OmFileReader(os.path.join(ROOT, "cache", f"hsurf_{model}.om"))[:].astype("<f4")
    a.tofile(os.path.join(ROOT, "cells", f"hsurf-{model}.f32"))
    print(model, "full HSURF", a.shape, "written")
