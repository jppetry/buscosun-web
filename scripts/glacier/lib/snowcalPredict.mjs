/**
 * Phase GM, GM-10b (audit/gletscher-schneemodell/gm10-diagnose.md §13; E-GM-43, E-GM-44) — the PREDICTED precipitation factor of Swiss glaciers
 * without a measurement: the form C of the size measurement (grid predictor x1 + median elevation + northness, no size term), the rule Jan set on
 * 25.11.2026 (E-GM-44 point 4 and the GM-10b order), the table of predicted factors, its rules and its reader. Pure: no network, no files.
 *
 * The table lies in the repository as `scripts/glacier/snow-factor-predicted-ch.json` (since GLAMOS confirmed the use by mail to Jan on 25.11.2026,
 * audit/gletscher/licences.md), with its source attribution `SNOW_FACTOR_SOURCES`; it is built by `snowcal-predict.mjs --mode=table` from the local cache.
 *
 * PRODUCER SWITCH of the melt run (`melt.mjs`): `--glacier-factor=off|on|predicted` (`GLACIER_SNOW_GLACIER_FACTOR`), default `off` (unchanged).
 *  - `predicted` = every glacier with an entry of its own in `snow-calibration-glaciers.json` keeps that factor (GM-5b); every other Swiss glacier with a
 *    row in the table runs on the table's factor; everything else (Austria, Germany, a Swiss glacier with basis `country`) keeps the value of its region.
 *  - the table is named by `--glacier-factor-table=<json>` (`GLACIER_SNOW_GLACIER_FACTOR_TABLE`); a run with `predicted` and no readable table, or a
 *    table that breaks a rule of its own or does not fit the run (own factors, country value, catalogue), STOPS with the reason — never a silent fall back.
 */
export const SNOW_FACTOR_TABLE_KIND = 'glacier/snow-factor-predicted';
/** Basis of a row: the glacier's own measured factor (GM-5b), form C, form C halfway to the country value, the country value. */
export const SNOW_FACTOR_BASES = Object.freeze(['own', 'predicted', 'predicted-shrunk', 'country']);
/** Search bounds of every factor (the bounds of GM-5b) and the grid of k of the tables. */
export const SNOW_FACTOR_BOUNDS = Object.freeze({ F: [0.3, 5], kStep: 0.02 });
/**
 * The rule (Jan, 25.11.2026, E-GM-44 and the GM-10b order — his decision, not a script verdict; every threshold `set`):
 *  - form C: ln F̂ = c + Σ β_j · (x_j − μ_j) / s_j over x1, zMed, north (fitted on the scored measure of the calibration, no shrinkage inside the fit);
 *  - at least `minCells` Q20 cells inside the outline ⇒ full C (`predicted`);
 *  - below that ⇒ C shrunk halfway to the country value in ln (`predicted-shrunk`) — chosen because it beat the country value in BOTH small classes in the
 *    leave-one-glacier-out table of step 1 (`smallClasses`), otherwise the small glaciers would keep the country value;
 *  - a glacier smaller (catalogue area) than every calibration glacier ⇒ country value;
 *  - x1, zMed or north outside [min, max] of the calibration glaciers ⇒ country value;
 *  - every predicted factor is clamped to [min, max] of the own factors of the calibration glaciers that do not sit at a search bound;
 *  - a glacier with an own factor keeps it (GM-5b); one whose own factor sits at a bound keeps the country value (GM-5b does not use it).
 */
export const SNOW_FACTOR_RULE = Object.freeze({
  decision: 'E-GM-44 (Jan, 25.11.2026)', form: 'C', predictors: Object.freeze(['x1', 'zMed', 'north']), minCells: 5, shrink: 0.5,
  smallArea: 'country', outside: 'country', clamp: 'own factors of the calibration glaciers, not at a search bound', origin: 'set',
});
/** Minimum number of Q20 winters with a positive snow gain for x1 (the rule of step 0, `minGridWinters`). */
export const SNOW_FACTOR_MIN_GRID_WINTERS = 3;
export const SNOW_FACTOR_NOTE = 'vorhergesagter Faktor aus Gitter und Gelände (eigene Rechnung), nicht gemessen; auf dem Eis nicht nachgeprüft';
/**
 * Source attribution of the table (CC BY 4.0 duty; GLAMOS confirmed the use by mail to Jan on 25.11.2026, audit/gletscher/licences.md). The contract
 * requires exactly this block, so a table without the recommended citation of GLAMOS release 2025 is refused.
 */
export const SNOW_FACTOR_SOURCES = Object.freeze({
  note: 'Abgeleitete Modellgrößen aus einer eigenen Rechnung (vorhergesagter Niederschlagsfaktor je Schweizer Gletscher). Die Tabelle enthält keine Zeile und keinen Messwert der Quelldateien (E-GL-17); GLAMOS wirkt nur über die Anpassung an die Eichgletscher.',
  attribution: Object.freeze([
    Object.freeze({ id: 'glamos', name: 'GLAMOS — Glacier Monitoring Switzerland: Swiss Glacier Mass Balance, Release 2025', doi: '10.18750/massbalance.2025.r2025', licence: 'CC BY 4.0',
      citation: 'GLAMOS (2025). Swiss Glacier Mass Balance, release 2025, Glacier Monitoring Switzerland, doi:10.18750/massbalance.2025.r2025.',
      permission: 'schriftliche Bestätigung von GLAMOS per Mail an Jan, 25.11.2026 (abgeleitete Modellparameter in einem kostenlosen Webdienst)',
      use: 'Winterbilanz der Schweizer Eichgletscher (Wahrheit der Anpassung)' }),
    Object.freeze({ id: 'slf-q20', name: 'SLF snow dataset 2016–2025 (Q20), version 1.1', doi: '10.5281/zenodo.17313889', licence: 'CC BY 4.0', use: 'Gitter-Prädiktor x1 (Schneezuwachs 1.10.–1.5.)' }),
    Object.freeze({ id: 'meteoswiss', name: 'MeteoSwiss Open Data: SwissMetNet, RhiresD', licence: 'CC BY 4.0', credit: 'Quelle: MeteoSchweiz', use: 'Antrieb der vergangenen Winter' }),
    Object.freeze({ id: 'glo30', name: 'Copernicus DEM GLO-30', licence: 'Copernicus DEM licence (free basis)', use: 'Medianhöhe und Exposition' }),
  ]),
});

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : null; };
export const clampK = (F) => Math.min(SNOW_FACTOR_BOUNDS.F[1], Math.max(SNOW_FACTOR_BOUNDS.F[0], F));
export const atSearchBound = (F) => F <= SNOW_FACTOR_BOUNDS.F[0] + 1e-3 || F >= SNOW_FACTOR_BOUNDS.F[1] - 1e-3;

/**
 * k at which the glacier-mean balance reaches `target` (mm) — the rule of `kFor` of step 0 (first crossing on the grid `KS`, linear in between, capped
 * at the ends), found by bisection on the grid: `totAt(j)` is the balance at KS[j] and is evaluated only where needed. For a balance that does not fall
 * with k (more snow never gives less balance) the result equals the full table exactly; the tool checks that at the calibration glaciers.
 */
export function kForLazy(totAt, target, KS) {
  const n = KS.length, memo = new Map(), at = (j) => { if (!memo.has(j)) memo.set(j, totAt(j)); return memo.get(j); };
  if (target <= at(0)) return { k: KS[0], capped: true, evals: memo.size };
  if (at(n - 1) < target) return { k: KS[n - 1], capped: true, evals: memo.size };
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (at(mid) >= target) hi = mid; else lo = mid; }
  const j = hi - 1, d = at(hi) - at(j);
  return { k: KS[j] + (d > 0 ? ((target - at(j)) / d) * (KS[1] - KS[0]) : 0), capped: false, evals: memo.size };
}

// ---- fit on the scored measure (the code of step 0, gm10-factor.mjs, unchanged in what it computes) ----------------------------------------------
/** mean |T(F̂) − BW| over rows { tot, BW, country, x }; theta = [c_CH, c_AT, β…]. `tabVal(tot, k)` = the balance of the table at k. */
function lossOf(rows, theta, nb, tabVal) {
  let s = 0;
  for (const r of rows) { let l = r.country === 'AT' ? theta[1] : theta[0]; for (let j = 0; j < nb; j++) l += theta[2 + j] * r.x[j]; s += Math.abs(tabVal(r.tot, clampK(Math.exp(l))) - r.BW); }
  return s / rows.length;
}
function nelderMead(f, x0, step, iters) {
  const n = x0.length; let P = [x0.slice()]; for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step[i]; P.push(p); }
  let V = P.map(f);
  for (let it = 0; it < iters; it++) {
    const o = V.map((v, i) => i).sort((a, b) => V[a] - V[b]); P = o.map((i) => P[i]); V = o.map((i) => V[i]);
    if (Math.abs(V[n] - V[0]) < 1e-9 * (1 + Math.abs(V[0]))) break;
    const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += P[i][j] / n;
    const at = (t) => c.map((v, j) => v + t * (P[n][j] - v));
    const xr = at(-1), fr = f(xr);
    if (fr < V[0]) { const xe = at(-2), fe = f(xe); if (fe < fr) { P[n] = xe; V[n] = fe; } else { P[n] = xr; V[n] = fr; } }
    else if (fr < V[n - 1]) { P[n] = xr; V[n] = fr; }
    else { const xc = at(0.5), fc = f(xc); if (fc < V[n]) { P[n] = xc; V[n] = fc; } else { for (let i = 1; i <= n; i++) { P[i] = P[i].map((v, j) => P[0][j] + 0.5 * (v - P[0][j])); V[i] = f(P[i]); } } }
  }
  const i = V.indexOf(Math.min(...V)); return { x: P[i], v: V[i] };
}
/** Nelder–Mead (400 iterations) and two restarts from the found point, as step 0. */
export function fitTheta(rows, nb, tabVal, { nmIter = 400, cStart = { CH: Math.log(1.8), AT: Math.log(2.4) } } = {}) {
  const f = (t) => lossOf(rows, t, nb, tabVal);
  let best = nelderMead(f, [cStart.CH, cStart.AT, ...new Array(nb).fill(0)], [0.1, 0.1, ...new Array(nb).fill(0.2)], nmIter);
  for (let r = 0; r < 2; r++) { const b = nelderMead(f, best.x, [0.05, 0.05, ...new Array(nb).fill(0.1)], nmIter); if (b.v <= best.v) best = b; }
  return best.x;
}
/**
 * One fit of a form on training glaciers: `train` = [{ key, x: raw predictor vector, items: [{ tot, BW }] }] (all Swiss). Centring and scaling by the
 * training glaciers (sample sd), as step 0. Returns the model { c, beta, mu, sc } and `c0` (the country constant fitted on the same measure).
 */
export function fitForm(train, tabVal, { withConstant = true } = {}) {
  const nb = train[0].x.length, mu = [], sc = [];
  for (let j = 0; j < nb; j++) { const col = train.map((g) => g.x[j]); mu.push(mean(col)); sc.push(sd(col) || 1); }
  const rows = train.flatMap((g) => g.items.map((it) => ({ tot: it.tot, BW: it.BW, country: 'CH', x: g.x.map((v, j) => (v - mu[j]) / sc[j]) })));
  const th = nb ? fitTheta(rows, nb, tabVal) : null;
  const th0 = withConstant ? fitTheta(rows, 0, tabVal) : null;
  return { c: th ? th[0] : th0[0], beta: th ? th.slice(2) : [], mu, sc, c0: th0 ? th0[0] : null };
}
/** The predicted factor of a model for a raw predictor vector, capped at the search bounds. */
export const predictOf = (m, x) => clampK(Math.exp(m.c + m.beta.reduce((s, b, j) => s + b * ((x[j] - m.mu[j]) / m.sc[j]), 0)));

/**
 * The rule for ONE glacier (not one with an own factor — the caller decides that first). `g` = { x1, zMed, north, nIn, areaKm2 };
 * `cal` = { ranges: { x1: [lo, hi], zMed, north }, minArea, own: [lo, hi] }; `countryF` = the country value the glacier would otherwise run on.
 * Returns { basis, F, raw?, why? }.
 */
export function ruleOf(g, model, cal, countryF, rule = SNOW_FACTOR_RULE) {
  if (!num(g.x1)) return { basis: 'country', F: countryF, why: 'no-grid-predictor' };
  if (!(g.areaKm2 >= cal.minArea)) return { basis: 'country', F: countryF, why: 'smaller-than-calibration' };
  const outside = rule.predictors.filter((n) => !(g[n] >= cal.ranges[n][0] && g[n] <= cal.ranges[n][1]));
  if (outside.length) return { basis: 'country', F: countryF, why: `outside:${outside.join('+')}` };
  const Fc = predictOf(model, rule.predictors.map((n) => g[n]));
  const full = g.nIn >= rule.minCells;
  const raw = full ? Fc : Math.exp(rule.shrink * Math.log(Fc) + (1 - rule.shrink) * Math.log(countryF));
  const F = Math.min(cal.own[1], Math.max(cal.own[0], raw));
  return { basis: full ? 'predicted' : 'predicted-shrunk', F, raw, ...(F !== raw ? { clamped: true } : {}) };
}

/** Quantiles of an array (linear), as the measurement tools. */
export const quantOf = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
/** The spread pair of a basis from errors e = ln(F / F_own): p10 / p90 as factor ratios exp(q10), exp(q90), plus n and the sd in ln. */
export function spreadOfErrors(e) {
  if (e.length < 3) return null;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  return { n: e.length, p10: r3(Math.exp(quantOf(e, 0.1))), p90: r3(Math.exp(quantOf(e, 0.9))), sdLn: r3(sd(e)) };
}

// ---- the table: rules and reader --------------------------------------------------------------------------------------------------------------
const within = (v, [lo, hi]) => num(v) && v >= lo - 1e-9 && v <= hi + 1e-9;
/**
 * Rules of the table. `catalog` = Map id → { country } of the catalogue the rows must be part of (optional). Empty = valid.
 * A row: { b: basis, F, q: [F·p10, F·p90] of its basis, n: cells inside the outline, why: reason of a `country` row }.
 */
export function snowFactorTableProblems(doc, catalog = null) {
  if (!doc || doc.schema !== 1 || doc.kind !== SNOW_FACTOR_TABLE_KIND) return ['keine Tabelle vorhergesagter Faktoren (schema/kind)'];
  const out = [];
  if (doc.country !== 'CH') out.push('country: nur CH');
  if (doc.origin !== 'computed') out.push(`Herkunft ${doc.origin} (nur „computed“)`);
  if (doc.verified !== false || !doc.note) out.push('Vermerk „nicht nachgeprüft“ fehlt');
  if (!/^[0-9a-f]{64}$/.test(doc.inputs?.ownTable ?? '')) out.push('inputs.ownTable: Hash der Tabelle der eigenen Faktoren fehlt');
  if (JSON.stringify(doc.sources) !== JSON.stringify(SNOW_FACTOR_SOURCES)) out.push('sources: Quellenangabe (mit dem Zitierwortlaut von GLAMOS, Release 2025) fehlt oder weicht ab');
  if (!within(doc.inputs?.countryF, SNOW_FACTOR_BOUNDS.F)) out.push('inputs.countryF fehlt');
  const r = doc.rule;
  if (!r || r.form !== 'C' || JSON.stringify(r.predictors) !== JSON.stringify(SNOW_FACTOR_RULE.predictors) || !Number.isInteger(r.minCells) || r.minCells < 1 || !(r.shrink > 0 && r.shrink < 1) || r.origin !== 'set') out.push('rule: Form C, Prädiktoren, Mindestzellen, Schrumpfung, Herkunft');
  if (!['shrunk', 'country'].includes(doc.smallClasses?.rule)) out.push('smallClasses: Entscheidung für die kleinen Gletscher fehlt');
  const m = doc.model;
  if (!m || !num(m.c) || !Array.isArray(m.beta) || m.beta.length !== 3 || !m.beta.every(num) || !Array.isArray(m.mu) || !m.mu.every(num) || !Array.isArray(m.sc) || !m.sc.every((v) => num(v) && v > 0)) out.push('model: c, β, μ, s');
  const cal = m?.cal;
  if (!cal || !SNOW_FACTOR_RULE.predictors.every((n) => Array.isArray(cal.ranges?.[n]) && cal.ranges[n].length === 2 && cal.ranges[n][0] <= cal.ranges[n][1]) || !(cal.minArea > 0) || !Array.isArray(cal.own) || !within(cal.own[0], SNOW_FACTOR_BOUNDS.F) || !within(cal.own[1], SNOW_FACTOR_BOUNDS.F) || cal.own[0] > cal.own[1]) out.push('model.cal: Spannen, kleinste Fläche, eigene Faktoren');
  const sp = doc.spread;
  for (const b of SNOW_FACTOR_BASES) { const s = sp?.[b]; if (!s || !(s.p10 > 0 && s.p10 <= 1 && s.p90 >= 1) || !Number.isInteger(s.n) || s.n < 3) out.push(`spread.${b}: p10 ≤ 1 ≤ p90 und n ≥ 3`); }
  if (sp && sp.origin !== 'measured') out.push('spread: Herkunft „measured“ (ein Gletscher ausgelassen)');
  const rows = Object.entries(doc.glaciers ?? {});
  if (!rows.length) out.push('glaciers leer');
  const counts = Object.fromEntries(SNOW_FACTOR_BASES.map((b) => [b, 0]));
  for (const [id, g] of rows) {
    if (catalog && catalog.get(id)?.country !== 'CH') out.push(`${id}: nicht als Schweizer Gletscher im Katalog`);
    if (!SNOW_FACTOR_BASES.includes(g?.b)) { out.push(`${id}: Grundlage`); continue; }
    counts[g.b]++;
    if (!within(g.F, SNOW_FACTOR_BOUNDS.F)) out.push(`${id}: Faktor außerhalb der Grenzen`);
    if (g.b === 'country' && (Math.abs(g.F - doc.inputs?.countryF) > 1e-9 || !g.why)) out.push(`${id}: Landeswert ohne Grund oder mit anderem Wert`);
    if (g.b !== 'country' && g.why != null) out.push(`${id}: Grund nur beim Landeswert`);
    if ((g.b === 'predicted' || g.b === 'predicted-shrunk') && cal && !within(g.F, cal.own)) out.push(`${id}: vorhergesagter Faktor nicht an die eigenen Faktoren gekappt`);
    if (g.b === 'predicted' && !(g.n >= r?.minCells)) out.push(`${id}: volle Form C unter der Mindestzahl der Zellen`);
    if (g.b === 'predicted-shrunk' && !(Number.isInteger(g.n) && g.n < r?.minCells)) out.push(`${id}: geschrumpfte Form ab der Mindestzahl der Zellen`);
    if (g.b === 'predicted-shrunk' && doc.smallClasses?.rule !== 'shrunk') out.push(`${id}: geschrumpfte Form, obwohl die kleinen Gletscher den Landeswert behalten`);
    const s = sp?.[g.b];
    if (!Array.isArray(g.q) || g.q.length !== 2 || !s || Math.abs(g.q[0] - Math.round(g.F * s.p10 * 1000) / 1000) > 1.5e-3 || Math.abs(g.q[1] - Math.round(g.F * s.p90 * 1000) / 1000) > 1.5e-3) out.push(`${id}: Spanne passt nicht zur Grundlage`);
  }
  if (doc.counts && SNOW_FACTOR_BASES.some((b) => doc.counts[b] !== counts[b])) out.push('counts widerspricht den Zeilen');
  return out;
}

/**
 * What a run needs from the table, checked against the run: `own` = the GM-5b reader (`glacierRunOf` of `snowcalGlaciers.mjs`, factor on) and the sha256
 * of its file; `countryOf(id)` = the country value the run gives a glacier; `catalog` = Map id → { country }. Throws with the reason — a run that was told
 * to use the table never falls back on its own. Returns `factorOf(id)` (number or `null` = the value of its region), `basisOf(id)`, `spread` and the
 * block the run writes into its documents (`applied` is filled by the caller).
 */
export function factorTableRunOf(doc, { own, ownSha, countryOf, catalog, tableSha }) {
  const problems = snowFactorTableProblems(doc, catalog);
  if (!problems.length && doc.inputs.ownTable !== ownSha) problems.push('die Tabelle wurde gegen eine andere Tabelle der eigenen Faktoren gebaut (inputs.ownTable)');
  if (!problems.length) {
    for (const [id, g] of Object.entries(doc.glaciers)) {
      const o = own.factorOf(id);
      if (g.b === 'own' && (o == null || Math.abs(o - g.F) > 1e-9)) { problems.push(`${id}: Zeile „own“ ohne denselben eigenen Faktor im Lauf`); break; }
      if (g.b !== 'own' && o != null) { problems.push(`${id}: Gletscher mit eigenem Faktor, Zeile aber „${g.b}“`); break; }
      if (Math.abs(countryOf(id) - doc.inputs.countryF) > 1e-9) { problems.push(`${id}: der Lauf gibt der Region ${countryOf(id)}, die Tabelle wurde mit ${doc.inputs.countryF} gebaut`); break; }
    }
  }
  if (problems.length) throw new Error(`Tabelle vorhergesagter Faktoren nicht nutzbar: ${problems.slice(0, 5).join('; ')}`);
  const g = doc.glaciers;
  return {
    factorOf: (id) => (g[id] && g[id].b !== 'country' ? g[id].F : null),
    basisOf: (id) => g[id]?.b ?? null,
    spread: Object.fromEntries(SNOW_FACTOR_BASES.map((b) => [b, { p10: doc.spread[b].p10, p90: doc.spread[b].p90, n: doc.spread[b].n }])),
    block: { rule: 'predicted', table: tableSha, form: doc.rule.form, minCells: doc.rule.minCells, shrink: doc.rule.shrink, small: doc.smallClasses.rule,
      origin: 'computed', verified: false, counts: doc.counts },
  };
}

/** The factor rule a run's state records: `null` for `off` (every glacier on its region), else the word and the table it read. */
export const factorRuleOf = (mode, sha) => (mode === 'off' ? null : `${mode}:${sha.slice(0, 16)}`);
