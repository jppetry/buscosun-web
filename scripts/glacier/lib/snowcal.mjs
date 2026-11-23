/**
 * Phase GM, GM-3 — the calibration table of the glacier snow model (`scripts/glacier/snow-calibration.json`): its rules and its readers. Pure: no network,
 * no files.
 *
 * GM-3b (E-GM-7, E-GM-8; audit §3d): the two PRODUCER SWITCHES that let the table into the run. Both are ON by default since 23.11.2026 (E-GM-12, Jan;
 * audit §3e): `country` and `board`; the fall back is `gate-c` and `helfricht` —
 *   precipitation  `--precip=gate-c|country` / `GLACIER_SNOW_PRECIP`: `gate-c` = the factor of Gate C and the set 4 % per 100 m, the run exactly as before,
 *                  the table is not opened; `country` = the level F of the glacier's region from the table × bridge, NO profile (gradient 0, `set`: K-4 is red);
 *   density        `--density=helfricht|board` / `GLACIER_SNOW_DENSITY`: `helfricht` = the constants of the snow core as they are (68 kg m⁻³); `board` = the
 *                  density and the measured span of the table as a second set of constants. Read by the snowpack step of the melt run (GM-3c, audit §3f; behind
 *                  `--snowpack=shadow`) and by its seed tool — nowhere else.
 * `board` without `country` is refused: 96 kg m⁻³ were measured against the water equivalent on the board, i.e. against true water (audit §3c.5). A density
 * that is not named follows the precipitation rule (E-GM-15), so the fall back to `gate-c` needs one word.
 *
 * The table carries
 *   precip   per catalogue region the level `F` and the slopes `gu` (below the median elevation) and `go` (above) of the winter accumulation against the named
 *            precipitation analysis, each with its origin; the bridge to buscosun Fusion (measured, NOT applied: value 1, origin `set`); the verdict of the
 *            frozen criteria and `gate` — a table with `gate: false` is delivered, but whether it goes into the producer is Jan's decision;
 *   density  the new-snow density rule of the snow core chosen against measured new snow on the board, with its span.
 */
export const SNOWCAL_KIND = 'glacier/snow-calibration';
export const SNOWCAL_FORMS = Object.freeze(['P1', 'P2', 'P3']);
export const SNOWCAL_DENSITY_RULES = Object.freeze(['D0', 'D1', 'D2', 'D3']);
export const SNOWCAL_ORIGINS = Object.freeze(['measured', 'transferred']);
export const SNOWCAL_BOUNDS = Object.freeze({ F: [0.3, 5], g: [-0.10, 0.20], floor: 0.2, rho: [40, 200] });

/** Profile of the accumulation at `d` metres above (+) or below (−) the glacier's median elevation: never below the floor. */
export const precipProfile = (d, gu, go, floor = SNOWCAL_BOUNDS.floor) => Math.max(floor, 1 + (gu * Math.min(d, 0)) / 100 + (go * Math.max(d, 0)) / 100);

/** Multiplier of the precipitation for a band of a glacier of `region`, `d` metres from the median elevation: F · bridge · profile. `null` for an unknown region. */
export function precipFactorOf(doc, region, d) {
  const r = doc?.precip?.regions?.[region];
  if (!r) return null;
  return r.F * doc.precip.bridge.value * precipProfile(d, r.gu, r.go, doc.precip.floor);
}

/** New-snow density (kg m⁻³) of the table for an hour with air temperature `tC`; D0 and D1 are the rules of the snow core itself and give `null` here. */
export function newSnowDensityOf(doc, tC = null) {
  const d = doc?.density;
  if (!d) return null;
  if (d.rule === 'D2') return d.rhoNew;
  if (d.rule === 'D3') return Number.isFinite(tC) ? Math.min(d.clip[1], Math.max(d.clip[0], d.a + d.b * tC)) : null;
  return null;
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const within = (v, [lo, hi]) => num(v) && v >= lo - 1e-9 && v <= hi + 1e-9;

// --- GM-3b: the switches ------------------------------------------------------------------------------------------------------------------

/** E-GM-7: precipitation factor of the melt run. `gate-c` = as before GM-3b (the fall back), `country` = level per country from the table, no profile (on, E-GM-12). */
export const SNOW_PRECIP_RULES = Object.freeze(['gate-c', 'country']);
export const SNOW_PRECIP_DEFAULT = 'country';
/** E-GM-8: new-snow density of the snow core. `helfricht` = as before GM-3b (the fall back), `board` = density and span of the table (on, E-GM-12). */
export const SNOW_DENSITY_SOURCES = Object.freeze(['helfricht', 'board']);
export const SNOW_DENSITY_SOURCE_DEFAULT = 'board';

const switchOf = (value, allowed, fallback, name) => {
  if (value == null || value === '') return fallback;
  if (!allowed.includes(value)) throw new Error(`${name}: unbekannte Stellung „${value}“ (erlaubt: ${allowed.join(', ')})`);
  return value;
};
/** The precipitation switch from an argument or an environment variable; empty = the default, an unknown word throws. */
export const snowPrecipOf = (value) => switchOf(value, SNOW_PRECIP_RULES, SNOW_PRECIP_DEFAULT, 'Niederschlagsfaktor');
/** The density switch, same rules. */
export const snowDensitySourceOf = (value) => switchOf(value, SNOW_DENSITY_SOURCES, SNOW_DENSITY_SOURCE_DEFAULT, 'Neuschneedichte');
/** The density that goes with a precipitation rule when the run names none (E-GM-15, Jan 23.11.2026; audit §3f): 96 kg m⁻³ hold for true water only (E-GM-13). */
export const SNOW_DENSITY_FOLLOWS = Object.freeze({ 'gate-c': 'helfricht', country: 'board' });
/** Both switches of one run. A density that is NOT named follows the precipitation rule, so the fall back needs one word (`gate-c` ⇒ `helfricht`); the run
 *  says which pair applied. A density that IS named is taken as named — and `board` next to `gate-c` is refused. */
export function snowSwitchesOf({ precip = null, density = null } = {}) {
  const p = snowPrecipOf(precip);
  const out = { precip: p, density: density == null || density === '' ? SNOW_DENSITY_FOLLOWS[p] : snowDensitySourceOf(density) };
  if (out.density === 'board' && out.precip !== 'country') throw new Error('Neuschneedichte „board“ gilt nur mit dem Niederschlagsfaktor „country“ (96 kg/m³ sind am wahren Wasserwert gemessen)');
  return out;
}

/** Level of the precipitation for a glacier of `region`: F · bridge, WITHOUT the profile of the table (E-GM-7). `null` for an unknown region. */
export function precipLevelOf(doc, region) {
  const r = doc?.precip?.regions?.[region];
  if (!r) return null;
  return { F: r.F * doc.precip.bridge.value, origin: r.fOrigin, from: r.fFrom };
}

/**
 * What a melt run with `country` needs from the table: the factor per region and the block the run writes into its document (`params.precip`).
 * `regions` = the region ids of the catalogue of the run. Throws with the reason when the table breaks a rule of its own or does not know a region —
 * a run that was told to use the table never falls back to another factor on its own.
 */
export function precipRunOf(doc, regions) {
  const problems = snowCalibrationProblems(doc);
  for (const r of regions) if (!doc?.precip?.regions?.[r]) problems.push(`precip.regions: Region ${r} fehlt`);
  if (problems.length) throw new Error(`Eichtabelle des Schneemodells nicht nutzbar: ${problems.slice(0, 5).join('; ')}`);
  const by = Object.fromEntries([...regions].sort().map((r) => [r, precipLevelOf(doc, r)]));
  return {
    factorOf: (region) => by[region].F,
    gradient: 0,
    block: {
      rule: 'country', replaces: 'pf',
      regions: Object.fromEntries(Object.entries(by).map(([r, v]) => [r, { F: v.F, origin: v.origin, from: v.from }])),
      gradient: 0, bridge: doc.precip.bridge.value, origin: { gradient: 'set', bridge: doc.precip.bridge.origin },
      against: doc.precip.against, gate: doc.precip.gate, ...(doc.precip.gate ? {} : { reason: doc.precip.reason }), method: doc.method.sha256,
    },
  };
}

/**
 * Rules of the block `params.precip` of a melt document (the producer checks what it wrote). `regions` = the regions of the rows of a run WITH `country`:
 * such a run must carry the block; without `regions` a missing block is the run as before. Empty = valid.
 */
export function meltPrecipProblems(block, regions = null) {
  if (block == null) return regions ? ['params.precip fehlt (Lauf mit „country“)'] : [];
  const out = [];
  if (block.rule !== 'country' || block.replaces !== 'pf') out.push('params.precip: Regel/replaces');
  if (block.gradient !== 0 || block.origin?.gradient !== 'set') out.push('params.precip: Gradient 0 (set) erwartet');
  if (!num(block.bridge) || !['set', 'measured'].includes(block.origin?.bridge)) out.push('params.precip: Brücke ohne Wert oder Herkunft');
  if (typeof block.gate !== 'boolean' || (block.gate === false && !block.reason)) out.push('params.precip: Urteil der Eichung fehlt');
  if (!/^[0-9a-f]{64}$/.test(block.method ?? '')) out.push('params.precip: Hash der Methode fehlt');
  for (const [id, r] of Object.entries(block.regions ?? {})) if (!within(r?.F, SNOWCAL_BOUNDS.F) || !SNOWCAL_ORIGINS.includes(r.origin) || !r.from) out.push(`params.precip: Region ${id}`);
  if (!Object.keys(block.regions ?? {}).length) out.push('params.precip: keine Region');
  for (const r of regions ?? []) if (!block.regions?.[r]) out.push(`params.precip: Region ${r} fehlt`);
  return out;
}

/**
 * The constants of the snow core with the new-snow density of the table (E-GM-8): `base` (the `SNOW` of lib/snowcore.mjs) is left as it is, the result
 * carries the density and the measured p10 / p90. Only the rule D2 (one constant) is built into the core; another rule throws.
 */
export function snowConstantsOf(base, doc) {
  const d = doc?.density;
  if (d?.rule !== 'D2') throw new Error(`Eichtabelle: Dichteregel „${d?.rule ?? '—'}“ ist im Schneekern nicht gebaut (nur D2, eine Konstante)`);
  if (!within(d.rhoNew, SNOWCAL_BOUNDS.rho) || !(d.span?.p10 < d.rhoNew && d.rhoNew < d.span?.p90)) throw new Error('Eichtabelle: Dichte oder Spanne unlesbar');
  return Object.freeze({ ...base, rhoNew: d.rhoNew, rhoNewP10: d.span.p10, rhoNewP90: d.span.p90 });
}
/** Origins that go with `snowConstantsOf`: the density and its span are measured (the table says against what). */
export const snowOriginOf = (baseOrigin) => Object.freeze({ ...baseOrigin, rhoNew: 'measured', rhoNewP10: 'measured', rhoNewP90: 'measured' });

/** Constants and origins of the snow core for a density switch: `helfricht` = `base` itself (the same object), `board` = from the table. */
export function snowCoreSetup({ density = SNOW_DENSITY_SOURCE_DEFAULT, base, baseOrigin, table = null }) {
  const source = snowDensitySourceOf(density);
  if (source === 'helfricht') return { source, c: base, origin: baseOrigin };
  return { source, c: snowConstantsOf(base, table), origin: snowOriginOf(baseOrigin) };
}

/** Rules of the table. `regions` = the region ids of the catalogue the table must cover (every one, no other). Empty = valid. */
export function snowCalibrationProblems(doc, regions = null) {
  const out = [];
  if (!doc || doc.schema !== 1 || doc.kind !== SNOWCAL_KIND) return ['kein Eichdokument (schema/kind)'];
  if (!/^[0-9a-f]{64}$/.test(doc.method?.sha256 ?? '')) out.push('method.sha256 fehlt');
  const p = doc.precip;
  if (!p) out.push('precip fehlt');
  else {
    if (!SNOWCAL_FORMS.includes(p.form)) out.push(`precip.form „${p.form}“ unbekannt`);
    if (p.floor !== SNOWCAL_BOUNDS.floor) out.push('precip.floor weicht von der Methode ab');
    if (typeof p.gate !== 'boolean') out.push('precip.gate fehlt');
    const verdicts = Object.values(p.verdict ?? {});
    if (verdicts.length !== 4 || verdicts.some((v) => typeof v?.pass !== 'boolean')) out.push('precip.verdict: vier Kriterien mit pass erwartet');
    else if (p.gate !== verdicts.every((v) => v.pass)) out.push('precip.gate widerspricht dem Urteil');
    if (p.gate === false && !p.reason) out.push('precip.gate ist false, der Grund fehlt');
    if (!p.bridge || p.bridge.value !== 1 || p.bridge.origin !== 'set' || p.bridge.applied !== false) out.push('precip.bridge: in GM-3 nicht angewandt (value 1, origin set, applied false)');
    if (!p.against?.CH || !p.against?.AT) out.push('precip.against nennt die Analysen nicht');
    const ids = Object.keys(p.regions ?? {});
    if (!ids.length) out.push('precip.regions leer');
    if (regions) {
      for (const r of regions) if (!ids.includes(r)) out.push(`precip.regions: Region ${r} fehlt`);
      for (const r of ids) if (!regions.includes(r)) out.push(`precip.regions: Region ${r} steht nicht im Katalog`);
    }
    for (const [id, r] of Object.entries(p.regions ?? {})) {
      if (!within(r.F, SNOWCAL_BOUNDS.F)) out.push(`${id}: F ${r.F} außerhalb der Grenzen`);
      if (!within(r.gu, SNOWCAL_BOUNDS.g) || !within(r.go, SNOWCAL_BOUNDS.g)) out.push(`${id}: Steigung außerhalb der Grenzen`);
      if (p.form === 'P1' && r.gu !== r.go) out.push(`${id}: Form P1 mit zwei Steigungen`);
      if (p.form === 'P2' && r.go !== 0) out.push(`${id}: Form P2 mit Steigung über der Medianhöhe`);
      if (!SNOWCAL_ORIGINS.includes(r.fOrigin) || !SNOWCAL_ORIGINS.includes(r.gOrigin)) out.push(`${id}: Herkunft fehlt`);
      if (!r.fFrom || !r.gFrom) out.push(`${id}: Quelle des Werts (fFrom/gFrom) fehlt`);
      if (!Number.isInteger(r.glaciers) || !Number.isInteger(r.winters) || r.glaciers < 0 || r.winters < r.glaciers) out.push(`${id}: Zahl der Gletscher/Winter unlesbar`);
      if ((r.fOrigin === 'measured' || r.gOrigin === 'measured') && r.glaciers === 0) out.push(`${id}: „measured“ ohne eigenen Gletscher in der Eichmenge`);
    }
  }
  const d = doc.density;
  if (!d) out.push('density fehlt');
  else {
    if (!SNOWCAL_DENSITY_RULES.includes(d.rule)) out.push(`density.rule „${d.rule}“ unbekannt`);
    if (d.rule === 'D2' && !within(d.rhoNew, SNOWCAL_BOUNDS.rho)) out.push('density.rhoNew außerhalb der Grenzen');
    if (d.rule === 'D3' && (!num(d.a) || !num(d.b) || !Array.isArray(d.clip))) out.push('density: a, b, clip fehlen');
    if ((d.rule === 'D2' || d.rule === 'D3') && d.origin !== 'measured') out.push('density.origin: eine gewählte Regel ist „measured“');
    if (!d.span || !(d.span.p10 < d.span.p50 && d.span.p50 < d.span.p90)) out.push('density.span: p10 < p50 < p90 erwartet');
    if (!(d.events > 0) || !(d.sites > 0)) out.push('density: Zahl der Ereignistage/Messfelder fehlt');
  }
  return out;
}
