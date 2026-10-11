"""Gate C — calibration and hold-out of the glacier melt model (audit/gletscher/gate-c-method-frozen.md, criteria claims-frozen.md C-1 … C-5).

  C:/dev/buscosun-glacier-cache/.venv/Scripts/python.exe -I gate_c.py --gc=<gate-c dir> --data=<v1 dir> --truth=<b1/truth.json> --out=<report.json>

Enhanced temperature index per 50 m band (Pellicciotti et al. 2005), measured SwissMetNet forcing (T, global radiation, precipitation), precipitation factor from the winter
balance, TF and SRF from the summer balance, baseline BL-C (degree-day with standard lapse). Folds: leave-year-out, leave-glacier-out, Hintereisferner 2024/25.
All glacier-years run in ONE vectorised simulation (arrays glacier-year × band, loop over hours).
"""
import argparse
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import series as ser  # noqa: E402

# --- fixed model constants (gate-c-method-frozen.md) --------------------------------------------------------------------------
GAMMA = -0.0065          # K/m, standard lapse
B_ICE = 0.85             # on-ice damping of positive temperatures
T_T = 1.0                # °C melt threshold
FS_T0, FS_T1 = 2.0, 0.0  # solid fraction = clip((2 − T)/2, 0, 1)
P_GRAD = 0.04            # per 100 m
A_FRESH, A_FIRN_SNOW, A_ICE, A_FIRN = 0.85, 0.55, 0.30, 0.50
TAU_H = 6 * 24
SWE_MIN = 5.0            # mm: below, the surface is ice/firn
FROM_MS = 1664582400000  # 2022-10-01T00:00Z (index i = hour ending at FROM + (i+1) h)
YEARS = (2023, 2024, 2025)
# Nachtrag 1 (gate-c-method-frozen-amendment-1.md): TF upper bound 0.06 → 0.12 (literature range 0.01–0.11 h⁻¹ K⁻¹, Gabbi et al. 2012); DDF bounds in the right unit
# (mm h⁻¹ K⁻¹: Hock 2003 gives 2.5–11.6 mm d⁻¹ K⁻¹ = 0.10–0.48) — the first bound (0.0005, 0.02) was set in the wrong unit and ended on its edge
TF_B, SRF_B, PF_B, DDF_B = (0.002, 0.12), (0.0, 0.04), (0.5, 4.0), (0.02, 0.5)


def hour_index(y, m, d):
    import datetime
    return int((datetime.datetime(y, m, d, tzinfo=datetime.timezone.utc).timestamp() * 1000 - FROM_MS) // 3_600_000)


def fill_gaps(a, max_gap=3):
    """Linear fill of gaps ≤ max_gap hours; longer gaps stay NaN."""
    a = a.copy()
    n = len(a)
    i = 0
    while i < n:
        if np.isnan(a[i]):
            j = i
            while j < n and np.isnan(a[j]):
                j += 1
            if i > 0 and j < n and j - i <= max_gap:
                a[i:j] = np.linspace(a[i - 1], a[j], j - i + 2)[1:-1]
            i = j
        else:
            i += 1
    return a


def load_forcing(gc, abbr):
    d = json.load(open(os.path.join(gc, f"forcing-{abbr}.json"), encoding="utf-8"))
    f = lambda k: np.array([np.nan if v is None else v for v in d[k]], dtype=float)
    return {"height": d["height"], "t": fill_gaps(f("t")), "g": fill_gaps(f("g")), "p": f("p")}


class Gy:
    """One glacier-year: bands, weights, elevations of the stations, hour slices, targets."""
    pass


def build(args):
    index = json.load(open(os.path.join(args.data, "index.json"), encoding="utf-8"))
    base = os.path.join(args.data, "static", index["static"]["build"])
    cat = {g["id"]: g for g in json.load(open(os.path.join(base, "catalog.json"), encoding="utf-8"))["glaciers"]}
    truth = json.load(open(args.truth, encoding="utf-8"))
    assign = json.load(open(os.path.join(args.gc, "stations.json"), encoding="utf-8"))["assign"]
    mass = ser.glamos_mass()
    sgi2id = {g["inv"]["sgi"]: g["id"] for g in cat.values() if g.get("inv", {}).get("sgi")}
    forcing = {}
    hy = {}
    gys = []
    for sgi, rows in mass.items():
        gid = sgi2id.get(sgi)
        if gid is None or gid not in truth["glamos"] or not assign.get(gid):
            continue
        g = cat[gid]
        a = assign[gid]
        ela_hist = [r[4] for r in rows if r[0] <= 2022 and r[4] is not None]
        ela_ref = float(np.mean(ela_hist)) if len(ela_hist) >= 5 else float(g["z"][1])
        reg = g["region"]
        if reg not in hy:
            hy[reg] = json.load(open(os.path.join(base, "hypso", f"{reg}.json"), encoding="utf-8"))["glaciers"]
        h = hy[reg][gid]
        areas = np.array(h["a"], dtype=float)
        zb = h["z0"] + 50.0 * (np.arange(len(areas)) + 0.5)
        keep = areas > 0
        for abbr in (a["tg"]["abbr"], a["p"]["abbr"]):
            if abbr not in forcing:
                forcing[abbr] = load_forcing(args.gc, abbr)
        for r in rows:
            y = r[0]
            if y not in YEARS:
                continue
            o = Gy()
            o.id, o.name, o.year, o.sgi = gid, g.get("name") or gid, y, sgi
            o.zb, o.w = zb[keep], areas[keep] / areas[keep].sum()
            o.ela_ref = ela_ref
            o.tg, o.pp = a["tg"]["abbr"], a["p"]["abbr"]
            o.bw, o.bs = r[1], r[2]
            gys.append(o)
    return cat, gys, forcing


def slices(gys, forcing):
    """Winter (Oct 1 → Apr 30 end) and summer (May 1 → Sep 30 end) hour arrays per glacier-year, padded to the longest."""
    out = {}
    for per, (m0, d0, m1, d1, dy0, dy1) in {"w": (10, 1, 5, 1, -1, 0), "s": (5, 1, 10, 1, 0, 0)}.items():
        seqs = []
        for o in gys:
            i0, i1 = hour_index(o.year + dy0, m0, d0), hour_index(o.year + dy1, m1, d1)
            tg, pp = forcing[o.tg], forcing[o.pp]
            sl = slice(i0, i1)
            seqs.append((tg["t"][sl], tg["g"][sl], pp["p"][sl], tg["height"], pp["height"]))
        L = max(len(s[0]) for s in seqs)
        pad = lambda a: np.concatenate([a, np.full(L - len(a), np.nan)])
        out[per] = {
            "t": np.stack([pad(s[0]) for s in seqs]), "g": np.stack([pad(s[1]) for s in seqs]), "p": np.stack([pad(s[2]) for s in seqs]),
            "len": np.array([len(s[0]) for s in seqs]), "zt": np.array([s[3] for s in seqs]), "zp": np.array([s[4] for s in seqs]),
        }
    return out


def band_arrays(gys):
    nb = max(len(o.zb) for o in gys)
    zb = np.zeros((len(gys), nb))   # padding bands (weight 0) keep a finite elevation
    w = np.zeros((len(gys), nb))
    ela = np.array([o.ela_ref for o in gys])
    for i, o in enumerate(gys):
        zb[i, :len(o.zb)] = o.zb
        w[i, :len(o.w)] = o.w
    return zb, w, ela


def winter(sl, zb, pf, idx):
    """Accumulation only: SWE and the snow albedo state at the end of April, per band (mm w.e.)."""
    t, p, zt, zp = sl["t"][idx], sl["p"][idx], sl["zt"][idx], sl["zp"][idx]
    zbi = zb[idx]
    swe = np.zeros_like(zbi)
    aS = np.full_like(zbi, A_FIRN_SNOW)
    decay = math.exp(-1.0 / TAU_H)
    corr = (1 + P_GRAD * (zbi - zp[:, None]) / 100.0)
    for h in range(t.shape[1]):
        Tb = t[:, h, None] + GAMMA * (zbi - zt[:, None])
        fs = np.where(np.isnan(Tb), 0.5, np.clip((FS_T0 - Tb) / (FS_T0 - FS_T1), 0, 1))
        ph = np.nan_to_num(p[:, h, None], nan=0.0)
        S = pf * ph * corr * fs
        swe += S
        aS = np.where(S > 0, aS + (A_FRESH - aS) * np.minimum(1.0, S / 5.0), A_FIRN_SNOW + (aS - A_FIRN_SNOW) * decay)
    return swe, aS


def summer(sl, zb, ela, pf, swe0, aS0, idx, model, par):
    """Summer balance per band (mm w.e.): solid summer precipitation − melt (snow first, then ice). model 'eti' (TF, SRF) or 'ddf' (DDF)."""
    t, g, p, zt, zp = sl["t"][idx], sl["g"][idx], sl["p"][idx], sl["zt"][idx], sl["zp"][idx]
    zbi = zb[idx]
    swe, aS = swe0.copy(), aS0.copy()
    bal = np.zeros_like(zbi)
    a_bare = np.where(zbi < ela[idx][:, None], A_ICE, A_FIRN)
    decay = math.exp(-1.0 / TAU_H)
    corr = (1 + P_GRAD * (zbi - zp[:, None]) / 100.0)
    for h in range(t.shape[1]):
        Tb = t[:, h, None] + GAMMA * (zbi - zt[:, None])
        fs = np.where(np.isnan(Tb), 0.5, np.clip((FS_T0 - Tb) / (FS_T0 - FS_T1), 0, 1))
        ph = np.nan_to_num(p[:, h, None], nan=0.0)
        S = pf * ph * corr * fs
        swe += S
        aS = np.where(S > 0, aS + (A_FRESH - aS) * np.minimum(1.0, S / 5.0), A_FIRN_SNOW + (aS - A_FIRN_SNOW) * decay)
        if model == "eti":
            Ti = np.where(Tb <= 0, Tb, B_ICE * Tb)
            alb = np.where(swe > SWE_MIN, aS, a_bare)
            Gh = np.nan_to_num(g[:, h, None], nan=0.0)
            melt = np.where(Ti > T_T, par[0] * Ti + par[1] * (1 - alb) * Gh, 0.0)
        else:
            f = np.where(swe > 0, 1.0, 1.6)
            melt = par[0] * f * np.maximum(np.nan_to_num(Tb, nan=0.0), 0.0)
        melt = np.where(np.isnan(t[:, h, None]), 0.0, melt)
        swe -= np.minimum(swe, melt)
        bal += S - melt
    return bal


def nelder_mead(f, x0, bounds, step, iters=60):
    n = len(x0)
    clip = lambda x: np.array([min(max(v, b[0]), b[1]) for v, b in zip(x, bounds)])
    pts = [clip(np.array(x0, float))] + [clip(np.array(x0, float) + np.eye(n)[i] * step[i]) for i in range(n)]
    vals = [f(p) for p in pts]
    for _ in range(iters):
        order = np.argsort(vals)
        pts, vals = [pts[i] for i in order], [vals[i] for i in order]
        c = np.mean(pts[:-1], axis=0)
        xr = clip(c + (c - pts[-1]))
        fr = f(xr)
        if fr < vals[0]:
            xe = clip(c + 2 * (c - pts[-1]))
            fe = f(xe)
            pts[-1], vals[-1] = (xe, fe) if fe < fr else (xr, fr)
        elif fr < vals[-2]:
            pts[-1], vals[-1] = xr, fr
        else:
            xc = clip(c + 0.5 * (pts[-1] - c))
            fc = f(xc)
            if fc < vals[-1]:
                pts[-1], vals[-1] = xc, fc
            else:
                pts = [pts[0]] + [clip(pts[0] + 0.5 * (p - pts[0])) for p in pts[1:]]
                vals = [vals[0]] + [f(p) for p in pts[1:]]
        if max(abs(vals[0] - v) for v in vals) < 1e-5 and max(np.max(np.abs(pts[0] - p)) for p in pts) < 1e-5:
            break
    i = int(np.argmin(vals))
    return pts[i], vals[i]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gc", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--truth", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--dump-case", default=None, help="glacier-id:year of a real case to dump for the JS port")
    ap.add_argument("--dump-case-out", default=None)
    ap.add_argument("--export-targets", default=None, help="write the glacier-years (targets, bands, stations) as JSON for the Node calibration and stop")
    ap.add_argument("--fixed", default=None, help="pf,TF,SRF,DDF: skip all fits, only evaluate the given parameters (cross-check of the Node port, with --dump-case)")
    ap.add_argument("--quick", action="store_true", help="only the full fit and the folds with a coarse optimiser budget (development)")
    args = ap.parse_args()
    cat, gys, forcing = build(args)
    sl = slices(gys, forcing)
    zb, w, ela = band_arrays(gys)
    N = len(gys)
    bw = np.array([np.nan if o.bw is None else o.bw for o in gys])
    bs = np.array([np.nan if o.bs is None else o.bs for o in gys])
    # glacier-years with too many gaps in T/G (summer) are not counted
    gap = np.array([np.mean(np.isnan(sl["s"]["t"][i, :sl["s"]["len"][i]])) + 0.0 for i in range(N)])
    gapg = np.array([np.mean(np.isnan(sl["s"]["g"][i, :sl["s"]["len"][i]])) for i in range(N)])
    usable = (gap <= 0.15) & (gapg <= 0.15)
    print(f"glacier-years: {N}, usable {int(usable.sum())}; gaps dropped: {[(gys[i].name, gys[i].year, round(float(max(gap[i], gapg[i])), 2)) for i in range(N) if not usable[i]]}")

    def run_winter(pf, idx):
        swe, aS = winter(sl["w"], zb, pf, idx)
        return swe, aS

    def wmean(arr, idx):
        return (arr * w[idx]).sum(axis=1)

    def fit_pf(idx):
        """Least squares through the origin: Bw_model = pf · X."""
        sel = [i for i in idx if usable[i] and not np.isnan(bw[i])]
        swe, _ = winter(sl["w"], zb, 1.0, np.array(sel))
        x = wmean(swe, np.array(sel))
        pf = float((x * bw[sel]).sum() / (x * x).sum())
        return min(max(pf, PF_B[0]), PF_B[1])

    def bs_model(idx, pf, model, par):
        idx = np.array(idx)
        swe, aS = winter(sl["w"], zb, pf, idx)
        bal = summer(sl["s"], zb, ela, pf, swe, aS, idx, model, par)
        return wmean(bal, idx)

    def fit_melt(idx, pf, model, warm=None):
        """Nelder–Mead on the summer balance; `warm` = parameters of the full fit (the folds start there with one simplex, the full fit uses three starts)."""
        sel = np.array([i for i in idx if usable[i] and not np.isnan(bs[i])])
        if model == "eti":
            f = lambda p: float(np.mean((bs_model(sel, pf, "eti", p) - bs[sel]) ** 2))
            starts = [list(warm)] if warm is not None else [[0.05, 0.01], [0.03, 0.02], [0.08, 0.005]]
            best = None
            for x0 in starts:
                p, v = nelder_mead(f, x0, [TF_B, SRF_B], [0.01, 0.004] if warm is not None else [0.02, 0.01], iters=30 if warm is not None else (25 if args.quick else 60))
                if best is None or v < best[1]:
                    best = (p, v)
            return best[0]
        f = lambda p: float(np.mean((bs_model(sel, pf, "ddf", p) - bs[sel]) ** 2))
        p, v = nelder_mead(f, list(warm) if warm is not None else [0.15], [DDF_B], [0.03], iters=20 if args.quick else 40)
        return p

    allidx = [i for i in range(N) if usable[i]]
    if args.export_targets:
        json.dump([{"id": o.id, "name": o.name, "year": o.year, "sgi": o.sgi, "bw": o.bw, "bs": o.bs, "ela": o.ela_ref, "zb": [float(v) for v in o.zb], "w": [float(v) for v in o.w], "tg": o.tg, "pp": o.pp, "usable": bool(usable[i]),
                    "gapT": float(gap[i]), "gapG": float(gapg[i])} for i, o in enumerate(gys)], open(args.export_targets, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print("targets ->", args.export_targets, N)
        return
    years = np.array([o.year for o in gys])
    ids = [o.id for o in gys]
    report = {"n": N, "usable": int(usable.sum()), "glacierYears": [{"id": o.id, "name": o.name, "year": o.year, "bw": o.bw, "bs": o.bs, "usable": bool(usable[i])} for i, o in enumerate(gys)]}

    # full fit (information) -----------------------------------------------------------------------------
    import time
    t_0 = time.time()
    if args.fixed:
        v = [float(x) for x in args.fixed.split(",")]
        pf_all, eti_all, ddf_all = v[0], np.array([v[1], v[2]]), np.array([v[3]])
    else:
        pf_all = fit_pf(allidx)
        print("pf fit", round(pf_all, 3), round(time.time() - t_0, 1), "s", flush=True)
        eti_all = fit_melt(allidx, pf_all, "eti")
        ddf_all = fit_melt(allidx, pf_all, "ddf", warm=None)
    report["full"] = {"pf": pf_all, "TF": float(eti_all[0]), "SRF": float(eti_all[1]), "DDF": float(ddf_all[0])}
    print("full fit:", report["full"], flush=True)

    def wmean_idx(arr, idx):
        return (arr * w[idx]).sum(axis=1)

    # a real glacier-year as the fixture of the JS port (verify:glacier-melt compares the two implementations)
    if args.dump_case:
        gid, yr = args.dump_case.split(":")
        k = next(i for i, o in enumerate(gys) if o.id == gid and o.year == int(yr))
        idx = np.array([k])
        swe_w, aS_w = winter(sl["w"], zb, pf_all, idx)
        bal_eti = summer(sl["s"], zb, ela, pf_all, swe_w, aS_w, idx, "eti", eti_all)
        bal_ddf = summer(sl["s"], zb, ela, pf_all, swe_w, aS_w, idx, "ddf", ddf_all)
        o = gys[k]
        nn = lambda a, L: [None if np.isnan(v) else round(float(v), 3) for v in a[:L]]
        case = {"schema": 1, "kind": "glacier/melt-case", "glacier": o.id, "year": o.year, "stations": {"tg": o.tg, "p": o.pp}, "zb": [float(v) for v in o.zb], "w": [float(v) for v in o.w], "ela": o.ela_ref,
                "zT": float(sl["w"]["zt"][k]), "zP": float(sl["w"]["zp"][k]), "pf": pf_all, "TF": float(eti_all[0]), "SRF": float(eti_all[1]), "ddf": float(ddf_all[0]),
                "winter": {"t": nn(sl["w"]["t"][k], sl["w"]["len"][k]), "p": nn(sl["w"]["p"][k], sl["w"]["len"][k])},
                "summer": {"t": nn(sl["s"]["t"][k], sl["s"]["len"][k]), "g": nn(sl["s"]["g"][k], sl["s"]["len"][k]), "p": nn(sl["s"]["p"][k], sl["s"]["len"][k])},
                "expected": {"bw": float(wmean_idx(swe_w, idx)[0]), "bsEti": float(wmean_idx(bal_eti, idx)[0]), "bsDdf": float(wmean_idx(bal_ddf, idx)[0]), "bwObs": o.bw, "bsObs": o.bs}}
        json.dump(case, open(args.dump_case_out, "w", encoding="utf-8"), separators=(",", ":"))
        print("case ->", args.dump_case_out)
    if args.fixed:
        return

    def fold(name, tests):
        pe_eti, pe_ddf, pe_pw, rec = [], [], [], []
        for test in tests:
            train = [i for i in allidx if i not in test]
            tst = [i for i in test if usable[i]]
            if not tst or not train:
                continue
            pf = fit_pf(train)
            eti = fit_melt(train, pf, "eti")
            ddf = fit_melt(train, pf, "ddf")
            b_eti = bs_model(tst, pf, "eti", eti)
            b_ddf = bs_model(tst, pf, "ddf", ddf)
            swe, _ = winter(sl["w"], zb, pf, np.array(tst))
            bw_m = wmean(swe, np.array(tst))
            for k, i in enumerate(tst):
                rec.append({"id": ids[i], "year": int(years[i]), "bs": bs[i], "eti": float(b_eti[k]), "ddf": float(b_ddf[k]), "bw": bw[i], "bwModel": float(bw_m[k]), "pf": pf, "TF": float(eti[0]), "SRF": float(eti[1])})
        return rec

    def stats(rec):
        v = [r for r in rec if not np.isnan(r["bs"])]
        e = np.array([r["eti"] - r["bs"] for r in v]) / 1000.0
        d = np.array([r["ddf"] - r["bs"] for r in v]) / 1000.0
        wv = [r for r in rec if not np.isnan(r["bw"])]
        ew = np.array([r["bwModel"] - r["bw"] for r in wv]) / 1000.0
        return {"n": len(v), "etiMAE": float(np.mean(np.abs(e))), "etiBias": float(np.mean(e)), "ddfMAE": float(np.mean(np.abs(d))), "ddfBias": float(np.mean(d)),
                "ratio": float(np.mean(np.abs(e)) / np.mean(np.abs(d))), "nW": len(wv), "bwMAE": float(np.mean(np.abs(ew))) if len(ew) else None, "bwBias": float(np.mean(ew)) if len(ew) else None}

    lyo = fold("lyo", [[i for i in allidx if years[i] == y] for y in YEARS])
    report["lyo"] = {"records": lyo, **stats(lyo)}
    print("LYO", {k: (round(v, 3) if isinstance(v, float) else v) for k, v in report["lyo"].items() if k != "records"})
    glaciers = sorted(set(ids))
    lgo = fold("lgo", [[i for i in allidx if ids[i] == gid] for gid in glaciers])
    report["lgo"] = {"records": lgo, **stats(lgo)}
    print("LGO", {k: (round(v, 3) if isinstance(v, float) else v) for k, v in report["lgo"].items() if k != "records"})
    # per fold-year summaries of the leave-year-out (each year alone)
    report["lyoByYear"] = {str(y): stats([r for r in lyo if r["year"] == y]) for y in YEARS}
    json.dump(report, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=lambda o: float(o) if isinstance(o, np.floating) else str(o))
    print("report ->", args.out)


if __name__ == "__main__":
    main()
