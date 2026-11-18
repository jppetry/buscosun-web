"""
Phase ST — reference values of an INDEPENDENT decoder for `verify:sea-current` (audit/seewetter-stroemung.md §4).

Reads the byte-exact fixture cuts with ecCodes (Python bindings, OpenJPEG underneath) and writes, per message: valid
time, parameter number, number of valid points, minimum, maximum, sum, and the value at the cells the request names
(index in the file's own scan order). The producer reader `scripts/sea/bshGrib.mjs` + `jp2k.mjs` must reproduce these.
Nothing of this runs in the product; it needs `pip install eccodes numpy`.

  python -I scripts/sea/spike/current-reference.py <fixtures dir> <out dir>
"""
import json
import sys
import os

import numpy as np
import eccodes as ec

fx, out = sys.argv[1], sys.argv[2]
req = json.load(open(os.path.join(fx, 'reference-request.json')))
res = {'decoder': 'ecCodes %s (Python)' % ec.codes_get_api_version(), 'missing': 9999.0, 'files': {}}
for name in sorted(os.listdir(os.path.join(fx, 'run'))):
    pkg = name.split('_')[1]
    msgs = []
    with open(os.path.join(fx, 'run', name), 'rb') as f:
        while True:
            g = ec.codes_grib_new_from_file(f)
            if g is None:
                break
            ec.codes_set(g, 'missingValue', 9999.0)
            v = ec.codes_get_values(g)
            ok = v != 9999.0
            msgs.append({
                'date': int(ec.codes_get(g, 'validityDate')), 'time': int(ec.codes_get(g, 'validityTime')),
                'discipline': int(ec.codes_get(g, 'discipline')), 'category': int(ec.codes_get(g, 'parameterCategory')), 'number': int(ec.codes_get(g, 'parameterNumber')),
                'points': int(v.size), 'valid': int(ok.sum()), 'min': float(v[ok].min()), 'max': float(v[ok].max()), 'sum': float(v[ok].sum()),
                'at': {str(k): (None if v[k] == 9999.0 else float(v[k])) for k in req[pkg]},
            })
            ec.codes_release(g)
    res['files'][name] = msgs
json.dump(res, open(os.path.join(out, 'reference-eccodes.json'), 'w'))
print({k: len(v) for k, v in res['files'].items()}, res['decoder'])
