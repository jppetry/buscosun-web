/**
 * Phase GM, GM-5b (audit/gletscher-schneemodell/gm5b-diagnose.md; E-GM-9, E-GM-31) — the second calibration table of the glacier snow model
 * (`scripts/glacier/snow-calibration-glaciers.json`): per MEASURED glacier a precipitation factor of its own and a persistent shape of the winter
 * accumulation over the elevation. Its rules and its readers. Pure: no network, no files. The first table (`snow-calibration.json`) is not touched.
 *
 * Two PRODUCER SWITCHES of the melt run, both OFF by default, both only next to the precipitation rule `country`:
 *   `--glacier-factor=off|on` / `GLACIER_SNOW_GLACIER_FACTOR`   `on` = a glacier with an entry runs on ITS factor instead of the one of its region
 *   `--glacier-shape=off|on`  / `GLACIER_SNOW_GLACIER_SHAPE`    `on` = a glacier with an entry spreads the accumulation over its bands by its shape —
 *                                                                area-weighted mean-free, so the mean of the glacier stays with the factor
 * A glacier without an entry, or whose factor sits at a bound of the search range (`atBound`), keeps the value of its region and the run counts it.
 * The snowpack line (three elevations) does not read this table (its state names the rule it was computed with, audit V-GM-86).
 */
export const SNOWCAL_GLACIERS_KIND = 'glacier/snow-calibration-glaciers';
export const SNOWCAL_GLACIERS_BOUNDS = Object.freeze({ F: [0.3, 5], floor: 0.2, stepM: 50, minWinters: 4 });
/**
 * E-GM-37 (Jan 24.11.2026: the table stays in the repository) — where the truth of the fit came from, and what the table is: DERIVED model parameters
 * (a factor per glacier, a shape per 50 m), no row and no measured value of the source files (E-GL-17 stays in force). The generator writes this block
 * into the head of the table; the rules of the table require it. Licence statements as recorded in `audit/gletscher/licences.md`.
 */
export const SNOWCAL_GLACIERS_SOURCES = Object.freeze({
  note: 'Abgeleitete Modellgrößen aus einer eigenen Eichung (Niederschlagsfaktor je Gletscher, Form der Winterakkumulation je 50 m). Die Tabelle enthält keine Zeile und keinen Messwert der Quelldateien (E-GL-17).',
  attribution: Object.freeze([
    Object.freeze({ id: 'glamos', name: 'GLAMOS — Glacier Monitoring Switzerland: Swiss Glacier Mass Balance, Release 2025', doi: '10.18750/massbalance.2025.r2025', licence: 'CC BY 4.0', use: 'Winterbilanz je Höhenstufe der Schweizer Gletscher (Wahrheit der Eichung)' }),
    Object.freeze({ id: 'wgms', name: 'WGMS — Fluctuations of Glaciers Database, Version 2026-02-10', doi: '10.5904/wgms-fog-2026-02-10', licence: 'CC BY 4.0 (open access under the requirement of correct citation)', use: 'Winterbilanz je Höhenstufe der österreichischen Gletscher (Wahrheit der Eichung)' }),
  ]),
});
export const GLACIER_FACTOR_MODES = Object.freeze(['off', 'on']);
export const GLACIER_FACTOR_DEFAULT = 'off';
export const GLACIER_SHAPE_MODES = Object.freeze(['off', 'on']);
export const GLACIER_SHAPE_DEFAULT = 'off';
const wordOf = (value, allowed, fallback, name) => {
  if (value == null || value === '') return fallback;
  if (!allowed.includes(value)) throw new Error(`${name}: unbekannte Stellung „${value}“ (erlaubt: ${allowed.join(', ')})`);
  return value;
};
export const glacierFactorModeOf = (value) => wordOf(value, GLACIER_FACTOR_MODES, GLACIER_FACTOR_DEFAULT, 'Faktor je Gletscher');
export const glacierShapeModeOf = (value) => wordOf(value, GLACIER_SHAPE_MODES, GLACIER_SHAPE_DEFAULT, 'Form je Band');

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const within = (v, [lo, hi]) => num(v) && v >= lo - 1e-9 && v <= hi + 1e-9;

/** The shape of an entry at elevation `z` (m): linear between its support points (`z0`, every `stepM`), outside them the nearest point. */
export function shapeAtElevation(shape, z) {
  const x = (z - shape.z0) / shape.stepM, n = shape.s.length;
  if (x <= 0) return shape.s[0];
  if (x >= n - 1) return shape.s[n - 1];
  const i = Math.floor(x);
  return shape.s[i] + (shape.s[i + 1] - shape.s[i]) * (x - i);
}

/**
 * Multiplier of the accumulation per band of a glacier (`zb` mid elevations, `w` area weights summing to 1): 1 + m · (shape − its area-weighted mean),
 * never below the floor. The area-weighted mean of the multipliers is 1 unless the floor acts — the factor of the glacier keeps the level.
 */
export function shapeCorrOf(shape, zb, w, floor = SNOWCAL_GLACIERS_BOUNDS.floor) {
  const s = zb.map((z) => shapeAtElevation(shape, z));
  const bar = s.reduce((t, v, b) => t + w[b] * v, 0);
  return s.map((v) => Math.max(floor, 1 + shape.m * (v - bar)));
}

/** Rules of the table. `catalogIds` = the ids of a catalogue the entries must be part of. Empty = valid. */
export function snowGlaciersProblems(doc, catalogIds = null) {
  if (!doc || doc.schema !== 1 || doc.kind !== SNOWCAL_GLACIERS_KIND) return ['keine Gletscher-Eichtabelle (schema/kind)'];
  const out = [];
  if (!/^[0-9a-f]{64}$/.test(doc.method?.sha256 ?? '')) out.push('method.sha256 fehlt');
  if (doc.melt?.model !== 'eti' || !(doc.melt.TF > 0) || !(doc.melt.SRF > 0)) out.push('melt: die Schmelze des Betriebs (eti, TF, SRF) fehlt');
  if (!doc.against?.CH || !doc.against?.AT) out.push('against nennt die Analysen nicht');
  // E-GM-37: the source attribution — GLAMOS and WGMS each with name, DOI and licence — and the note that the table holds derived parameters only
  const src = doc.sources?.attribution;
  if (!doc.sources?.note || !Array.isArray(src) || !SNOWCAL_GLACIERS_SOURCES.attribution.every((want) => src.some((x) => x?.id === want.id && x.name && x.doi && x.licence))) out.push('sources: Quellenangabe (GLAMOS und WGMS mit Name, DOI, Lizenz) oder der Vermerk „abgeleitete Modellgrößen“ fehlt');
  if (!Number.isInteger(doc.shrink?.n0) || !Number.isInteger(doc.shrink?.n0s) || doc.shrink.n0 < 0 || doc.shrink.n0s < 0) out.push('shrink fehlt');
  if (!within(doc.country?.CH, SNOWCAL_GLACIERS_BOUNDS.F) || !within(doc.country?.AT, SNOWCAL_GLACIERS_BOUNDS.F)) out.push('country: Landeswerte fehlen');
  const v = doc.verdict;
  if (typeof v?.K6?.carries !== 'boolean' || typeof v?.K7?.carries !== 'boolean' || !num(v.K6.gain) || !num(v.K7.gain) || !num(v.K6.p10) || !num(v.K7.p10)) out.push('verdict: K6 und K7 mit Gewinn, p10 und Urteil erwartet');
  else {
    if (doc.gate?.factor !== v.K6.carries) out.push('gate.factor widerspricht dem Urteil K6');
    if (doc.gate?.shape !== v.K7.carries) out.push('gate.shape widerspricht dem Urteil K7');
  }
  const ids = Object.keys(doc.glaciers ?? {});
  if (!ids.length) out.push('glaciers leer');
  for (const [id, g] of Object.entries(doc.glaciers ?? {})) {
    if (catalogIds && !catalogIds.has(id)) out.push(`${id}: nicht im Katalog`);
    if (!['CH', 'AT'].includes(g.country)) out.push(`${id}: Land`);
    if (!Number.isInteger(g.winters) || g.winters < SNOWCAL_GLACIERS_BOUNDS.minWinters) out.push(`${id}: weniger als ${SNOWCAL_GLACIERS_BOUNDS.minWinters} Winter`);
    if (!Array.isArray(g.years) || g.years.length !== 2 || !(g.years[0] <= g.years[1])) out.push(`${id}: Zeitraum`);
    if (!within(g.F, SNOWCAL_GLACIERS_BOUNDS.F) || g.origin !== 'measured') out.push(`${id}: Faktor außerhalb der Grenzen oder ohne Herkunft`);
    const atBound = num(g.F) && (g.F <= SNOWCAL_GLACIERS_BOUNDS.F[0] + 1e-9 || g.F >= SNOWCAL_GLACIERS_BOUNDS.F[1] - 1e-9);
    if (atBound !== (g.atBound === true) || (g.atBound != null && g.atBound !== true)) out.push(`${id}: Vermerk „atBound“ passt nicht zum Faktor`);
    const sh = g.shape;
    if (!sh || !num(sh.z0) || sh.stepM !== SNOWCAL_GLACIERS_BOUNDS.stepM || !Array.isArray(sh.s) || sh.s.length < 2 || !sh.s.every(num) || !within(sh.m, [0, 1])) out.push(`${id}: Form unlesbar`);
    else if (sh.s.some((x) => Math.abs(x) > 4)) out.push(`${id}: Form außerhalb jeder Grenze`);
  }
  return out;
}

/**
 * What a melt run needs from the table for its switches (`factor`, `shape`: booleans). Throws with the reason when the table breaks a rule of its own or a
 * switch asks for a part whose verdict does not carry (`gate`) — a run that was told to use the table never falls back on its own.
 * Returns `factorOf(id)` (the glacier's factor, or `null`: no entry or at a bound — the caller keeps the regional value), `corrOf(id, zb, w)` (multipliers
 * per band, or `null`) and the block the run writes into its document.
 */
export function glacierRunOf(doc, { factor = false, shape = false } = {}, catalogIds = null) {
  const problems = snowGlaciersProblems(doc, catalogIds);
  if (!problems.length && factor && doc.gate.factor !== true) problems.push('der Faktor je Gletscher trägt nach dem Urteil der Eichung nicht (gate.factor)');
  if (!problems.length && shape && doc.gate.shape !== true) problems.push('die Form je Band trägt nach dem Urteil der Eichung nicht (gate.shape)');
  if (problems.length) throw new Error(`Gletscher-Eichtabelle nicht nutzbar: ${problems.slice(0, 5).join('; ')}`);
  const g = doc.glaciers;
  return {
    factor, shape,
    has: (id) => !!g[id],
    factorOf: (id) => (factor && g[id] && g[id].atBound !== true ? g[id].F : null),
    corrOf: (id, zb, w) => (shape && g[id] ? shapeCorrOf(g[id].shape, zb, w) : null),
    block: { factor, shape, method: doc.method.sha256, melt: doc.melt.model, shrink: doc.shrink, entries: Object.keys(g).length, atBound: Object.values(g).filter((x) => x.atBound === true).length, verdict: { K6: doc.verdict.K6.carries, K7: doc.verdict.K7.carries } },
  };
}
