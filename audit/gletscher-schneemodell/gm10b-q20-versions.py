"""Phase GM-10, step 0b - sample check: Q20 version 1.1 against version 1.0 with the northing shifted by +2000 m (V-GM-110). Measurement only; reads the
local cache, prints one JSON. Never writes into a repo.

    <python> -I audit/gletscher-schneemodell/gm10b-q20-versions.py --v10 <gm10/q20> --v11 <gm10/q20-v1.1> --months 2017-04,2020-04,2023-10

Per sampled month: easting arrays equal?, northing(v1.1) - northing(v1.0) (all cells), swe/hs equal cell by cell on three days (first, middle, last)
when v1.0 is read at the SAME labelled coordinates as v1.1 after +2000 m.
"""
import argparse, json, os, tempfile, zipfile
import h5py, numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--v10', required=True); ap.add_argument('--v11', required=True); ap.add_argument('--months', required=True)
a = ap.parse_args()
tmp = tempfile.mkdtemp(prefix='gm10bver-')

def open_month(root, fmt, y, m):
    wy = y + 1 if m >= 9 else y
    zp = os.path.join(root, fmt.format(wy=wy))
    with zipfile.ZipFile(zp) as z:
        names = [n for n in z.namelist() if n.endswith(f'{y:04d}-{m:02d}.nc')]
        if len(names) != 1: raise SystemExit(f'{zp}: {names}')
        sub = os.path.join(tmp, os.path.basename(root)); os.makedirs(sub, exist_ok=True)
        z.extract(names[0], sub)
        return os.path.join(sub, names[0]), names[0]

out = []
for ym in a.months.split(','):
    y, m = map(int, ym.split('-'))
    p0, n0 = open_month(a.v10, 'OSHD_DATA_WY{wy}.zip', y, m)
    p1, n1 = open_month(a.v11, 'OSHD_DATA_WY_{wy}.zip', y, m)
    with h5py.File(p0, 'r') as f0, h5py.File(p1, 'r') as f1:
        E0, N0, E1, N1 = f0['easting'][:], f0['northing'][:], f1['easting'][:], f1['northing'][:]
        dN = N1 - N0 if N0.shape == N1.shape else None
        row = {'month': ym, 'files': [n0, n1], 'vars': [sorted(f0.keys()), sorted(f1.keys())], 'shape': [list(f0['swe'].shape), list(f1['swe'].shape)],
               'eastingEqual': bool(E0.shape == E1.shape and np.array_equal(E0, E1)),
               'northingDiff': None if dN is None else [float(dN.min()), float(dN.max())], 'time': [f0['time'].attrs['units'].decode(), f1['time'].attrs['units'].decode()], 'days': {}}
        # map v1.0 rows (labelled northing + 2000) to v1.1 rows
        idx = {float(v) + 2000.0: i for i, v in enumerate(N0)}
        rows1 = [j for j, v in enumerate(N1) if float(v) in idx]; rows0 = [idx[float(N1[j])] for j in rows1]
        row['rowsMatched'] = [len(rows1), len(N1)]
        nt = f1['swe'].shape[2]
        for t in sorted({0, nt // 2, nt - 1}):
            for var in ('swe', 'hs'):
                A = f0[var][:, :, t][:, rows0]; B = f1[var][:, :, t][:, rows1]
                va, vb = A > -9000, B > -9000
                both = va & vb
                row['days'][f'{t}:{var}'] = {'equalExact': bool(np.array_equal(A, B)), 'maskEqual': bool(np.array_equal(va, vb)),
                                            'maxAbsDiff': float(np.abs(A[both] - B[both]).max()) if both.any() else None, 'cells': int(both.sum())}
                # same labelled coordinate WITHOUT the shift: how different would it be (negative control of the check)
                if var == 'swe':
                    lab = {float(v): i for i, v in enumerate(N0)}
                    r1 = [j for j, v in enumerate(N1) if float(v) in lab]; r0 = [lab[float(N1[j])] for j in r1]
                    C = f0[var][:, :, t][:, r0]; D = f1[var][:, :, t][:, r1]; ok = (C > -9000) & (D > -9000)
                    row['days'][f'{t}:{var}:noShift'] = {'equalExact': bool(np.array_equal(C, D)), 'meanAbsDiff': float(np.abs(C[ok] - D[ok]).mean()) if ok.any() else None}
    os.remove(p0); os.remove(p1)
    out.append(row)
print(json.dumps(out, indent=1))
