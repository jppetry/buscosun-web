"""
make_fixtures.py — reference values of the Prüfstand measures from the Python package `scores` (Bureau of Meteorology,
Leeuwenburg et al. 2024), written ONCE offline to metrics.scores.json (plan PS-1-5). Not needed at run time.

    pip install scores scipy
    python scripts/pruefstand/fixtures/make_fixtures.py

Deterministic: fixed seed, values rounded to 6 decimals before both sides compute, so the JSON is byte-stable.
"""
import json, os
import numpy as np
import xarray as xr
import scipy.stats as st
import scores
import scores.continuous as sc
import scores.probability as sp
import scores.categorical as scat

rng = np.random.default_rng(20261005)
TAUS = [round(0.05 * i, 2) for i in range(1, 20)]
out = {"generator": "scripts/pruefstand/fixtures/make_fixtures.py", "scores": scores.__version__, "numpy": np.__version__, "taus": TAUS}

def da(a, dims):
    return xr.DataArray(np.asarray(a, dtype=float), dims=dims)

# 1 quantile score and CRPS_Q: N cases, K quantiles each (sorted), plus point forecasts
N = 40
q = np.round(np.sort(rng.normal(0, 3, (N, len(TAUS))) + rng.normal(0, 5, (N, 1)), axis=1), 6)
y = np.round(rng.normal(0, 6, N), 6)
qs = np.zeros((N, len(TAUS)))
for k, tau in enumerate(TAUS):
    qs[:, k] = sc.quantile_score(da(q[:, k], ["i"]), da(y, ["i"]), tau, preserve_dims="all").values
out["quantile"] = {"q": q.tolist(), "y": y.tolist(), "qs": qs.tolist(), "crpsQ": (2 * qs.mean(axis=1)).tolist()}
pt = np.round(rng.normal(0, 4, N), 6)
out["point"] = {"x": pt.tolist(), "y": y.tolist(), "mae": float(sc.mae(da(pt, ["i"]), da(y, ["i"])).values), "abs": np.abs(pt - y).tolist(),
                "rmse": float(sc.rmse(da(pt, ["i"]), da(y, ["i"])).values), "bias": float(sc.additive_bias(da(pt, ["i"]), da(y, ["i"])).values)}

# 2 threshold-weighted CRPS_Q, upper tail (rectangular weight on [thr, inf))
thr = 2.5
tw = np.zeros((N, len(TAUS)))
for k, tau in enumerate(TAUS):
    tw[:, k] = sc.tw_quantile_score(da(q[:, k], ["i"]), da(y, ["i"]), tau, interval_where_one=(thr, np.inf), preserve_dims="all").values
out["tw"] = {"thr": thr, "twCrpsQ": (2 * tw.mean(axis=1)).tolist()}

# 3 Brier score, decomposition identity on discrete probabilities, isotonic regression (CORP)
M = 300
p = np.round(rng.integers(0, 11, M) / 10.0, 6)
o = (rng.random(M) < np.clip(p * 0.8 + 0.05, 0, 1)).astype(float)
bs = float(sp.brier_score(da(p, ["i"]), da(o, ["i"])).values)
base = o.mean()
rel = sum((p == v).sum() * (v - o[p == v].mean()) ** 2 for v in np.unique(p)) / M
res = sum((p == v).sum() * (o[p == v].mean() - base) ** 2 for v in np.unique(p)) / M
iso = sp.isotonic_fit(p, o)
fs, rv = np.asarray(iso["fcst_sorted"]), np.asarray(iso["regression_values"])
fit = {float(f): float(r) for f, r in zip(fs, rv)}
recal = np.array([fit[float(v)] for v in p])
out["brier"] = {"p": p.tolist(), "o": o.tolist(), "brier": bs, "reliability": float(rel), "resolution": float(res), "uncertainty": float(base * (1 - base)),
                "isotonic": recal.tolist(), "mcb": bs - float(((recal - o) ** 2).mean()), "dsc": float(base * (1 - base) - ((recal - o) ** 2).mean())}
# continuous probabilities for the isotonic fit (no ties)
p2 = np.round(rng.random(80), 6)
o2 = (rng.random(80) < p2 ** 1.5).astype(float)
iso2 = sp.isotonic_fit(p2, o2)
fit2 = {float(f): float(r) for f, r in zip(np.asarray(iso2["fcst_sorted"]), np.asarray(iso2["regression_values"]))}
out["isotonic"] = {"p": p2.tolist(), "o": o2.tolist(), "fit": [fit2[float(v)] for v in p2]}

# 4 SEDI from a 2×2 table
fe = (rng.random(500) < 0.2).astype(float)
oe = ((rng.random(500) < 0.15) | ((fe == 1) & (rng.random(500) < 0.5))).astype(float)
bcm = scat.BinaryContingencyManager(da(fe, ["i"]), da(oe, ["i"])).transform()
c = bcm.get_counts()
out["sedi"] = {"a": float(c["tp_count"]), "b": float(c["fp_count"]), "c": float(c["fn_count"]), "d": float(c["tn_count"]), "sedi": float(bcm.symmetric_extremal_dependence_index().values)}

# 5 angular error
fa, oa = np.round(rng.random(60) * 360, 3), np.round(rng.random(60) * 360, 3)
out["angle"] = {"fc": fa.tolist(), "ob": oa.tolist(), "mae": float(sc.mae(da(fa, ["i"]), da(oa, ["i"]), is_angular=True).values)}

# 6 RPS: the sum of the Brier scores of the cumulative classes
C = 4
pr = rng.dirichlet(np.ones(C), 30)
cum = np.round(np.cumsum(pr, axis=1), 6); cum[:, -1] = 1.0
cat = rng.integers(0, C, 30)
rps = []
for i in range(30):
    s = 0.0
    for k in range(C - 1):
        s += float(sp.brier_score(da([cum[i, k]], ["i"]), da([1.0 if cat[i] <= k else 0.0], ["i"])).values)
    rps.append(s)
out["rps"] = {"cum": cum.tolist(), "cat": cat.tolist(), "rps": rps}

# 7 empirical quantile (type 7), normal quantile, Student t
smp = np.round(np.sort(rng.gamma(2.0, 2.0, 37)), 6)
out["sortedQuantile"] = {"sample": smp.tolist(), "taus": TAUS, "q": [float(np.quantile(smp, t)) for t in TAUS]}
ps = [0.001, 0.01, 0.025, 0.05, 0.2, 0.5, 0.8, 0.9, 0.95, 0.975, 0.99, 0.999]
out["normalQuantile"] = {"p": ps, "z": [float(st.norm.ppf(v)) for v in ps]}
ts = [(-3.2, 5), (-1.1, 12), (0.0, 7), (0.7, 3), (1.96, 30), (2.5, 9), (4.0, 20)]
out["studentT"] = {"t": [a for a, _ in ts], "nu": [b for _, b in ts], "cdf": [float(st.t.cdf(a, b)) for a, b in ts]}

# 8 AR(2) inflation of the standard error of a mean (Geer 2016): Yule-Walker from r1, r2
d = np.round(np.convolve(rng.normal(0, 1, 140), [1, 0.6, 0.3], mode="valid") + 0.2, 6)
m = d.mean(); v = ((d - m) ** 2).sum()
r1 = float(((d[1:] - m) * (d[:-1] - m)).sum() / v); r2 = float(((d[2:] - m) * (d[:-2] - m)).sum() / v)
f1 = r1 * (1 - r2) / (1 - r1 ** 2); f2 = (r2 - r1 ** 2) / (1 - r1 ** 2)
k = float(np.sqrt((1 + f2) * (1 + f1 - f2) / ((1 - f2) * (1 - f1 - f2))))
out["ar2"] = {"d": d.tolist(), "r1": r1, "r2": r2, "phi1": f1, "phi2": f2, "k": k, "mean": float(m), "sd": float(d.std(ddof=1))}

# 9 Benjamini-Hochberg
pv = np.round(rng.random(25) ** 2, 6)
out["bh"] = {"p": pv.tolist(), "adjusted": st.false_discovery_control(pv, method="bh").tolist()}

here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "metrics.scores.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump(out, f, indent=1)
    f.write("\n")
print("ok", {k: (len(v) if isinstance(v, (list, dict)) else v) for k, v in out.items()})
