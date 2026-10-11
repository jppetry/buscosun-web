/**
 * GL-1 — Contract of the glacier data line (`buscosun-glacier/v1/`): ONE file for producer
 * (`scripts/glacier/*`), client (`src/glacier/*`) and verifiers (`verify:glacier-*`) — paths, origins, size classes,
 * identity, area stamps, catalogue/series/official rules, geometry rules, client freshness rules and units.
 * Pattern: `src/sea/seaContract.ts`, `src/road/roadContract.ts`. Numbers are measured in `audit/gletscher.md` §2 (GL-0)
 * or decided at Gate A (§5). Dependency-free on purpose (start page, route and verifiers import it).
 *
 * Layout (versioned path — a format change bumps `v1` → `v2`):
 *   v1/index.json                                 pointer: current static build, newest scene per tile, newest melt run, season stand, feed week
 *   v1/status.json                                lines, rule balance, kill switch
 *   v1/static/<build>/catalog.json                one entry per glacier (id, names, country, region, class, area + reference year, heights, inventory ids)
 *   v1/static/<build>/points.json                 points for zoom ≤ 8 (id, lat, lon, class, area)
 *   v1/static/<build>/outline/<region>-L<1..3>.json   current outlines in three simplification levels (GeoJSON, WGS84)
 *   v1/static/<build>/outline/<region>-e<year>.json   earlier outlines (SGI1850/1931/1973/2010, GI4 2015, RGI 2003), each with its reference year
 *   v1/static/<build>/hypso/<region>.json         area per 50 m band
 *   v1/static/<build>/series/<region>.json        length, mass and area series, one method and source each
 *   v1/static/<build>/proj/<region>.json          GloGEM CMIP6 v2 projection as a range per scenario
 *   v1/static/<build>/official.json               official numbers with date, verbatim key sentence and link
 *   v1/static/<build>/sources.json                source, licence, attribution, reference per data set
 *   (later packages add) obs/<year>/<tile>/<date>.json, season/…, melt/<run>.json, melt/state/<date>.json, feed/<year>-W<week>.json, card/<year>-W<week>.png
 *
 * Every file except `index.json` and `status.json` carries an immutable name (build, scene, stand, run, week), so `@main` is
 * safe at the CDN once `index.json` names it; the client reads `index.json` with a raw ↔ CDN hedge (pattern obs/v1).
 */

// --- Paths -------------------------------------------------------------------------------------

export const GLACIER_VERSION = 'v1';
export const GLACIER_REPO = 'jppetry/buscosun-glacier';
export const GLACIER_CDN_BASE = `https://cdn.jsdelivr.net/gh/${GLACIER_REPO}@main/${GLACIER_VERSION}`;
/** Same files on raw.githubusercontent (CORS *): hedge when jsDelivr hangs or answers 403 (pattern V-FI-5). */
export const GLACIER_RAW_BASE = `https://raw.githubusercontent.com/${GLACIER_REPO}/main/${GLACIER_VERSION}`;
/** Repo-relative directory of the line (producer side). */
export const GLACIER_REPO_DIR = GLACIER_VERSION;

export const GLACIER_INDEX_PATH = 'index.json';
export const GLACIER_STATUS_PATH = 'status.json';
export const GLACIER_BUILD_RE = /^\d{8}-\d+$/;

export const glacierStaticDir = (build: string) => `static/${build}`;
export const glacierStaticPath = (build: string, file: string) => `static/${build}/${file}`;
export const GLACIER_CATALOG_FILE = 'catalog.json';
export const GLACIER_POINTS_FILE = 'points.json';
export const GLACIER_OFFICIAL_FILE = 'official.json';
export const GLACIER_SOURCES_FILE = 'sources.json';
export const glacierOutlineFile = (region: string, level: 1 | 2 | 3) => `outline/${region}-L${level}.json`;
export const glacierEpochFile = (region: string, year: number | string) => `outline/${region}-e${year}.json`;
export const glacierHypsoFile = (region: string) => `hypso/${region}.json`;
export const glacierSeriesFile = (region: string) => `series/${region}.json`;
export const glacierProjFile = (region: string) => `proj/${region}.json`;

// --- Countries, regions, classes -----------------------------------------------------------------

export type GlacierCountry = 'CH' | 'AT' | 'DE';
export const GLACIER_COUNTRIES: readonly GlacierCountry[] = ['CH', 'AT', 'DE'];
export const GLACIER_COUNTRY_LABEL: Readonly<Record<GlacierCountry, string>> = { CH: 'Schweiz', AT: 'Österreich', DE: 'Deutschland' };

/** Outline/hypsometry/series files are split by region (< 20 MB each, lazy per view). */
export const GLACIER_REGIONS: Readonly<Record<string, { country: GlacierCountry; label: string }>> = Object.freeze({
  'ch-a': { country: 'CH', label: 'Rhein' },
  'ch-b': { country: 'CH', label: 'Rhone' },
  'ch-c': { country: 'CH', label: 'Po' },
  'ch-e': { country: 'CH', label: 'Inn' },
  'at-allgaeuer-alpen': { country: 'AT', label: 'Allgäuer Alpen' },
  'at-ankogel-hochalmspitzgruppe': { country: 'AT', label: 'Ankogel-/Hochalmspitzgruppe' },
  'at-dachstein': { country: 'AT', label: 'Dachstein' },
  'at-defreggergruppe': { country: 'AT', label: 'Defreggergruppe' },
  'at-hochkoenig': { country: 'AT', label: 'Hochkönig' },
  'at-glocknergruppe': { country: 'AT', label: 'Glocknergruppe' },
  'at-goldberggruppe': { country: 'AT', label: 'Goldberggruppe (Sonnblickgruppe)' },
  'at-granatspitzgruppe': { country: 'AT', label: 'Granatspitzgruppe' },
  'at-karnische-alpen': { country: 'AT', label: 'Karnische Alpen' },
  'at-lechtaler-alpen': { country: 'AT', label: 'Lechtaler Alpen' },
  'at-oetztaler-alpen': { country: 'AT', label: 'Ötztaler Alpen' },
  'at-raetikon': { country: 'AT', label: 'Rätikon' },
  'at-rieserfernergruppe': { country: 'AT', label: 'Rieserfernergruppe' },
  'at-samnaungruppe': { country: 'AT', label: 'Samnaungruppe' },
  'at-schobergruppe': { country: 'AT', label: 'Schobergruppe' },
  'at-silvrettagruppe': { country: 'AT', label: 'Silvrettagruppe' },
  'at-stubaier-alpen': { country: 'AT', label: 'Stubaier Alpen' },
  'at-venedigergruppe': { country: 'AT', label: 'Venedigergruppe' },
  'at-verwallgruppe': { country: 'AT', label: 'Verwallgruppe' },
  'at-zillertaler-alpen': { country: 'AT', label: 'Zillertaler Alpen' },
  'de': { country: 'DE', label: 'Bayerische Alpen' },
});
export const GLACIER_REGION_IDS = Object.freeze(Object.keys(GLACIER_REGIONS));

/** Size classes (E-GL-2, plan §7): A ≥ 1 km² (everything), B 0.1–1 km² (extent and albedo anomaly, no snow line), C < 0.1 km² (no satellite number). */
export type GlacierClass = 'A' | 'B' | 'C';
export const GLACIER_CLASS_A_KM2 = 1;
export const GLACIER_CLASS_B_KM2 = 0.1;
export function glacierClassOf(areaKm2: number): GlacierClass {
  return areaKm2 >= GLACIER_CLASS_A_KM2 ? 'A' : areaKm2 >= GLACIER_CLASS_B_KM2 ? 'B' : 'C';
}

// --- Provenance --------------------------------------------------------------------------------

/** Where a value comes from — shown at EVERY number (plan §6 "Herkunft"). A value without one is invalid. */
export type GlacierOrigin = 'measured' | 'satellite' | 'model' | 'official';
export const GLACIER_ORIGINS: readonly GlacierOrigin[] = ['measured', 'satellite', 'model', 'official'];
export const GLACIER_ORIGIN_LABEL: Readonly<Record<GlacierOrigin, string>> = { measured: 'gemessen', satellite: 'Satellit', model: 'Modell', official: 'amtlich' };
/** Provenance of a PARAMETER (not a value): `set`/`literature` are shown with their label, only `measured` acts silently. */
export type GlacierParamOrigin = 'measured' | 'set' | 'literature';
export const isGlacierOrigin = (x: unknown): x is GlacierOrigin => typeof x === 'string' && (GLACIER_ORIGINS as readonly string[]).includes(x);

// --- Identity (plan §6 "Identität") --------------------------------------------------------------

const GLACIER_ID_RE = /^gl_(ch|at|de)_[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isGlacierId = (x: unknown): x is string => typeof x === 'string' && GLACIER_ID_RE.test(x) && x.length <= 80;
export const glacierCountryOfId = (id: string): GlacierCountry | null => (isGlacierId(id) ? (id.slice(3, 5).toUpperCase() as GlacierCountry) : null);

/** ASCII slug of a name: umlauts transliterated (ä→ae, ö→oe, ü→ue, ß→ss), accents removed, everything else → "-". */
export function glacierSlug(name: string): string {
  const map: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' };
  const s = name.replace(/[äöüßÄÖÜ]/g, (c) => map[c] ?? c).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
/**
 * Stable id: `gl_<country>_<slug of the name>`; a name used twice in a country, an empty name or "NN" gets the inventory id
 * appended (`gl_ch_steigletscher-a54e-12`, `gl_at_nn-9027`). `inventoryId` is the id of the inventory of record.
 */
export function glacierIdOf(country: GlacierCountry, name: string | null, inventoryId: string | number, nameIsUnique: boolean): string {
  const base = name && name.trim() && name.trim().toUpperCase() !== 'NN' ? glacierSlug(name) : '';
  const inv = glacierSlug(String(inventoryId));
  const slug = base && nameIsUnique ? base : base ? `${base}-${inv}` : `nn-${inv}`;
  return `gl_${country.toLowerCase()}_${slug}`;
}

/** Overlap rule for matching two inventories: the intersection must cover ≥ 50 % of BOTH polygons (plan §6); exceptions are listed with a reason. */
export const GLACIER_MATCH_MIN_OVERLAP = 0.5;
export interface GlacierMatchException { from: string; to: string | null; reason: string }

// --- Area stamps ---------------------------------------------------------------------------------

/** An area with its reference year and source — an area without a year is rejected at build (plan §6 "Fläche"). */
export interface GlacierAreaStamp {
  km2: number;
  /** Reference year of the inventory, `2016` or a range `"2013-2018"`; countries with different years are never shown as the same year. */
  refYear: number | string;
  /** Short source name (`SGI2016`, `AGI5`, `BAdW 2025`, `RGI6.2`). */
  source: string;
}
export const hasAreaStamp = (a: unknown): a is GlacierAreaStamp => {
  const x = a as GlacierAreaStamp | null;
  return !!x && typeof x.km2 === 'number' && Number.isFinite(x.km2) && x.km2 > 0
    && (typeof x.refYear === 'number' ? Number.isFinite(x.refYear) : typeof x.refYear === 'string' && x.refYear.length >= 4)
    && typeof x.source === 'string' && x.source.length > 0;
};

// --- Catalogue -----------------------------------------------------------------------------------

export interface GlacierInventoryIds {
  /** SGI id (`B36-26`), also the GLAMOS glacier id. */
  sgi?: string;
  /** AGI 5 glacier number. */
  agi5?: number;
  gi4?: number;
  rgi6?: string;
  /** WGMS FoG glacier id. */
  wgms?: string;
}
export interface GlacierCatalogEntry {
  id: string;
  /** Display name; `null` = nameless (the inventory id stands in). */
  name: string | null;
  country: GlacierCountry;
  region: string;
  klass: GlacierClass;
  area: GlacierAreaStamp;
  /** Elevation (m) of the lowest point, median and highest point; origin = the inventory (`zSource`). */
  z: [number, number, number];
  zSource: string;
  /** Mean aspect (°, 0 = north) where the inventory gives one. */
  asp: number | null;
  lat: number;
  lon: number;
  inv: GlacierInventoryIds;
  /** Leading glacier (archive, calibration, check) — list in `audit/gletscher.md` §2.4. */
  lead?: true;
  /** Authority status: `vanished`/`vanishing` — only from the authority's own criterion, never from a satellite image. */
  status?: 'vanished' | 'vanishing' | 'lost-status';
  /** Debris cover class of the inventory (AGI 5 `debris` 0–3; SGI2016 share) or `null`. */
  debris: number | null;
}
export interface GlacierCatalog {
  schema: 1;
  kind: 'glacier/catalog';
  build: string;
  builtAt: string;
  glaciers: GlacierCatalogEntry[];
}

export function catalogProblems(c: GlacierCatalog): string[] {
  const out: string[] = [];
  if (c.schema !== 1 || c.kind !== 'glacier/catalog') out.push('schema/kind');
  if (!GLACIER_BUILD_RE.test(c.build)) out.push(`build "${c.build}"`);
  const seen = new Set<string>();
  for (const g of c.glaciers) {
    const t = `${g.id}:`;
    if (!isGlacierId(g.id)) { out.push(`${t} id invalid`); continue; }
    if (seen.has(g.id)) out.push(`${t} id duplicate`);
    seen.add(g.id);
    if (glacierCountryOfId(g.id) !== g.country) out.push(`${t} country ${g.country} ≠ id`);
    if (!GLACIER_REGIONS[g.region] || GLACIER_REGIONS[g.region].country !== g.country) out.push(`${t} region ${g.region}`);
    if (!hasAreaStamp(g.area)) out.push(`${t} area without km²/refYear/source`);
    else if (glacierClassOf(g.area.km2) !== g.klass) out.push(`${t} class ${g.klass} ≠ ${glacierClassOf(g.area.km2)} for ${g.area.km2} km²`);
    if (!(g.z[0] <= g.z[1] && g.z[1] <= g.z[2]) || g.z[0] < 300 || g.z[2] > 4900) out.push(`${t} elevations ${g.z.join('/')}`);
    if (!(g.lat > 45 && g.lat < 48.5 && g.lon > 5.5 && g.lon < 14)) out.push(`${t} position`);
    if (!g.inv || Object.keys(g.inv).length === 0) out.push(`${t} no inventory id`);
    if (g.name != null && g.name.trim() === '') out.push(`${t} empty name`);
  }
  return out;
}

/** Country sums of the inventory of record against the figure the authority publishes (± 2 %, plan §6 "Summe"); outside ⇒ quarantine. */
export const GLACIER_SUM_TOLERANCE = 0.02;
export interface GlacierCountrySum { km2: number; n: number | null; refYear: string; source: string }
export const GLACIER_OFFICIAL_SUMS: Readonly<Record<GlacierCountry, GlacierCountrySum>> = Object.freeze({
  CH: { km2: 961, n: 1400, refYear: '2013-2018', source: 'SGI2016 (Linsbauer et al. 2021: 1 400 glaciers, 961 ± 22 km²)' },
  AT: { km2: 285, n: 799, refYear: '2021-2023', source: 'AGI 5 (Hartl et al. 2026: 799 glaciers, 285 ± 12 km²)' },
  DE: { km2: 0.262, n: 4, refYear: '2025', source: 'BAdW, Pressemitteilung 19.03.2026: Summe der vier Gletscher 26,2 ha (Herbst 2025)' },
});
export function countrySumProblems(c: GlacierCatalog): string[] {
  const out: string[] = [];
  for (const co of GLACIER_COUNTRIES) {
    const list = c.glaciers.filter((g) => g.country === co);
    const km2 = list.reduce((s, g) => s + g.area.km2, 0);
    const want = GLACIER_OFFICIAL_SUMS[co];
    if (Math.abs(km2 / want.km2 - 1) > GLACIER_SUM_TOLERANCE) out.push(`${co}: ${km2.toFixed(3)} km² gegen amtlich ${want.km2} km² (> ${GLACIER_SUM_TOLERANCE * 100} %)`);
    if (want.n != null && Math.abs(list.length / want.n - 1) > GLACIER_SUM_TOLERANCE) out.push(`${co}: ${list.length} Gletscher gegen ${want.n}`);
  }
  return out;
}

// --- Geometry (plan §6 "Geometrie") ----------------------------------------------------------------

export type LonLat = [number, number];
export const GLACIER_AREA_TOLERANCE = 0.03;

/** Planar area (km²) of a lon/lat ring by an equirectangular projection at the ring's mean latitude (< 0.1 % off at glacier size). */
export function ringAreaKm2(ring: readonly LonLat[]): number {
  if (ring.length < 4) return 0;
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const kx = 111.320 * Math.cos((lat0 * Math.PI) / 180), ky = 110.574;
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += (ring[i][0] * kx) * (ring[i + 1][1] * ky) - (ring[i + 1][0] * kx) * (ring[i][1] * ky);
  return Math.abs(a) / 2;
}
export const ringClosed = (r: readonly LonLat[]) => r.length >= 4 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];

function segCross(a: LonLat, b: LonLat, c: LonLat, d: LonLat): boolean {
  const o = (p: LonLat, q: LonLat, r: LonLat) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0; // proper crossing only (touching at a shared vertex of consecutive edges is not a self-intersection)
}
/** True when two non-adjacent edges of the ring properly cross (O(n²) — the L1/L2 rings are short, L3 is checked per glacier). */
export function ringSelfIntersects(ring: readonly LonLat[]): boolean {
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segCross(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

type GeoJsonPolygon = { type: 'Polygon'; coordinates: LonLat[][] };
type GeoJsonMulti = { type: 'MultiPolygon'; coordinates: LonLat[][][] };
export const polygonsOfGeometry = (g: GeoJsonPolygon | GeoJsonMulti): LonLat[][][] => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
/** Area of the outer rings minus holes (km²). */
export function geometryAreaKm2(g: GeoJsonPolygon | GeoJsonMulti): number {
  let a = 0;
  for (const poly of polygonsOfGeometry(g)) poly.forEach((r, i) => { a += (i === 0 ? 1 : -1) * ringAreaKm2(r); });
  return a;
}
/** Rules for ONE outline feature of a level: closed rings, no self-intersection, area within ±3 % of the inventory area. */
export function outlineProblems(g: GeoJsonPolygon | GeoJsonMulti, inventoryKm2: number, checkSelf = true): string[] {
  const out: string[] = [];
  for (const poly of polygonsOfGeometry(g)) {
    for (const r of poly) {
      if (!ringClosed(r)) { out.push('ring not closed'); break; }
      if (checkSelf && ringSelfIntersects(r)) { out.push('ring self-intersects'); break; }
    }
  }
  const a = geometryAreaKm2(g);
  if (inventoryKm2 > 0 && Math.abs(a / inventoryKm2 - 1) > GLACIER_AREA_TOLERANCE) out.push(`area ${a.toFixed(4)} km² vs ${inventoryKm2.toFixed(4)} km² (> ${GLACIER_AREA_TOLERANCE * 100} %)`);
  return out;
}

// --- Series (plan §6 "Reihe") --------------------------------------------------------------------

export type GlacierSeriesKind = 'length' | 'mass' | 'area';
export type GlacierSeriesMethod = 'tongue-survey' | 'glaciological' | 'geodetic' | 'inventory';
/**
 * One series of ONE glacier with ONE method and source. Columns by kind:
 *   length: [yearStart, yearEnd, dL (m)]                     mass: [yearEnd, Bw, Bs, Ba (mm w.e.), ELA (m), AAR (0..1)] (null where missing)
 *   area:   [refYear, km²]
 */
export interface GlacierSeries {
  id: string;
  kind: GlacierSeriesKind;
  method: GlacierSeriesMethod;
  origin: 'measured' | 'official';
  source: string;
  doi?: string;
  unit: string;
  rows: Array<Array<number | null>>;
}
const SERIES_WIDTH: Readonly<Record<GlacierSeriesKind, number>> = { length: 3, mass: 6, area: 2 };
const SERIES_METHODS: Readonly<Record<GlacierSeriesKind, readonly GlacierSeriesMethod[]>> = {
  length: ['tongue-survey'], mass: ['glaciological', 'geodetic'], area: ['inventory'],
};
export function seriesProblems(s: GlacierSeries, ids: ReadonlySet<string>): string[] {
  const out: string[] = [];
  if (!ids.has(s.id)) out.push(`${s.id}: series without a glacier in the catalogue`);
  if (!SERIES_METHODS[s.kind]?.includes(s.method)) out.push(`${s.id}/${s.kind}: method ${s.method}`);
  if (!isGlacierOrigin(s.origin) || (s.origin !== 'measured' && s.origin !== 'official')) out.push(`${s.id}/${s.kind}: origin`);
  if (!s.source) out.push(`${s.id}/${s.kind}: source`);
  if (!s.unit) out.push(`${s.id}/${s.kind}: unit`);
  if (!Array.isArray(s.rows) || s.rows.length === 0) out.push(`${s.id}/${s.kind}: no rows`);
  let prev = -Infinity;
  for (const r of s.rows ?? []) {
    if (r.length !== SERIES_WIDTH[s.kind]) { out.push(`${s.id}/${s.kind}: row width ${r.length}`); break; }
    const key = r[s.kind === 'length' ? 1 : 0];
    if (typeof key !== 'number' || key < 1800 || key > 2100) { out.push(`${s.id}/${s.kind}: year ${key}`); break; }
    if (key < prev) { out.push(`${s.id}/${s.kind}: years not ascending`); break; }
    prev = key;
    if (s.kind === 'mass') {
      const aar = r[5];
      if (aar != null && (aar < 0 || aar > 1)) { out.push(`${s.id}/mass: AAR ${aar}`); break; }
      if (r.slice(1, 4).some((v) => v != null && Math.abs(v) > 15000)) { out.push(`${s.id}/mass: balance out of range`); break; }
    }
    if (s.kind === 'length' && typeof r[2] === 'number' && Math.abs(r[2]) > 4000) { out.push(`${s.id}/length: dL ${r[2]} m`); break; }
    if (s.kind === 'area' && !(typeof r[1] === 'number' && r[1] > 0)) { out.push(`${s.id}/area: km²`); break; }
  }
  return out;
}

// --- Official numbers (plan §6, "amtliche Zahlen nur wörtlich mit Quelle und Datum") ------------------

export interface GlacierOfficialItem {
  id: string;
  scope: 'CH' | 'AT' | 'DE' | 'DACH';
  /** `report` = annual report/bulletin of the authority, `status` = loss of glacier status by the authority's criterion. */
  kind: 'report' | 'status';
  /** Date the authority published it (ISO). */
  date: string;
  /** Observation period the numbers describe, free text (`2025/26`, `Herbst 2025`). */
  period: string;
  title: string;
  /** VERBATIM sentence(s) of the source — never shortened, reworded, sharpened or softened. */
  quote: string;
  /** `status` only: the authority's own criterion for "vanished" (never derived from a satellite image of ours). */
  criterion?: string;
  source: string;
  url: string;
  /** Machine-readable key figures with unit; every one repeats a number that stands in the quote or the source table. */
  values?: Array<{ key: string; value: number; unit: string; label: string }>;
}
export function officialProblems(items: readonly GlacierOfficialItem[], snapshots?: Readonly<Record<string, string>>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const t = `${it.id}:`;
    if (seen.has(it.id)) out.push(`${t} duplicate`);
    seen.add(it.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it.date)) out.push(`${t} date`);
    if (!it.quote || it.quote.length < 20) out.push(`${t} quote missing`);
    if (!it.source || !/^https:\/\//.test(it.url)) out.push(`${t} source/url`);
    if (it.kind === 'status' && !(it.criterion && it.criterion.length > 5)) out.push(`${t} status without the authority's criterion`);
    if (it.quote && /\bbegehbar\b|\bsicher\b|\bfrei\b/i.test(it.quote) && it.kind !== 'report') out.push(`${t} forbidden wording in a non-report`);
    const snap = snapshots?.[it.id];
    if (snap != null && it.quote) {
      // each quoted sentence must occur verbatim in the saved source text (whitespace-normalised)
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
      for (const part of it.quote.split(' … ')) if (!norm(snap).includes(norm(part))) out.push(`${t} quote not verbatim in the source`);
    }
  }
  return out;
}

// --- Client rules (plan §6 "Client") ---------------------------------------------------------------

/** A satellite value older than this shows "keine klare Szene seit … Tagen", no number, no colour. */
export const GLACIER_SAT_MAX_AGE_DAYS = 20;
/** A melt run older than this is "Keine Daten" (the run cadence is ≤ 4 per day, runs stay 72 h). */
export const GLACIER_MELT_MAX_AGE_MS = 30 * 3_600_000;
export const GLACIER_MELT_KEEP_MS = 72 * 3_600_000;
export type GlacierFreshness = { state: 'ok' } | { state: 'stale'; ageDays: number } | { state: 'none' };
export function glacierSatFreshness(lastSceneMs: number | null, nowMs: number): GlacierFreshness {
  if (lastSceneMs == null) return { state: 'none' };
  const d = (nowMs - lastSceneMs) / 86_400_000;
  return d > GLACIER_SAT_MAX_AGE_DAYS ? { state: 'stale', ageDays: Math.floor(d) } : { state: 'ok' };
}
export const glacierMeltFresh = (runMs: number | null, nowMs: number): boolean => runMs != null && nowMs - runMs <= GLACIER_MELT_MAX_AGE_MS;
/** Wording of the stale-satellite state (never a number). */
export const glacierSatStaleText = (ageDays: number) => `keine klare Szene seit ${ageDays} Tagen`;

// --- Units (plan §6 "Einheit") -----------------------------------------------------------------------

/** Ice density used for "cm Eis" — named wherever the unit appears (plan §6). */
export const GLACIER_ICE_DENSITY = 900;
/** Melt is stored in mm w.e. (= kg/m²). Ice thickness (cm) of that melt on a band with an ICE surface; invalid on snow/firn. */
export const iceCmOfMmWe = (mmWe: number): number => (mmWe / GLACIER_ICE_DENSITY) * 100;
/** Water volume (m³) of a melt depth over an area. */
export const waterM3 = (mmWe: number, areaKm2: number): number => mmWe * areaKm2 * 1000;

/** Display of a surface: "cm Eis" only where the band has an ice surface (plan §6). */
export function glacierMeltUnitProblem(unit: string, surface: 'ice' | 'snow' | 'firn' | 'mixed'): string | null {
  if (unit === 'mm w.e.' || unit === 'm³') return null;
  if (unit === 'cm Eis') return surface === 'ice' ? null : `"cm Eis" auf einer ${surface}-Fläche`;
  return `unbekannte Einheit "${unit}"`;
}

// --- Words that must never appear in the tour tab (plan §11 question 4) --------------------------------

export const GLACIER_FORBIDDEN_TOUR_WORDS = Object.freeze(['begehbar', 'sicher', 'frei']);
export const glacierForbiddenWords = (text: string): string[] =>
  GLACIER_FORBIDDEN_TOUR_WORDS.filter((w) => new RegExp(`(^|[^a-zäöüß])${w}([^a-zäöüß]|$)`, 'i').test(text));
