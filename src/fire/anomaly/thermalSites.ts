/**
 * Thermalanomalien — statische Standortliste persistenter Wärmequellen (TA2/TA3).
 *
 * Die Liste `public/fire/ta/thermal-sites-v1.json` wird im Batch aus dem FIRMS-SP-Archiv
 * (2020–2026, Feld `type`) gebaut (`scripts/fire/ta/*.mjs`): je 0,01°-Zelle werden Tage je
 * Kalenderjahr gezählt; persistent ist eine Zelle, wenn sie in ≥ 2 Kalenderjahren je ≥ 5
 * verschiedene Detektionstage trägt (gemessen 2026-08-22: 462 Zellen; die wiederholt
 * brennende Jüterbog-Fläche erfüllt das nicht). Zellen mit EFFIS-Kartierung zählen in dem
 * Jahr nicht. Standorte = benachbarte Zellen, dazu ein Geodaten-Treffer (E-PRTR CC-BY 4.0,
 * MaStR DL-DE/BY-2.0, BFE OPEN BY) im Umkreis von 1,5 km.
 *
 * Klassen: A = persistent + benannte Anlage · B = persistent, unbenannt („Dauerquelle") ·
 * C = persistent, aber 0 % Nachtanteil („Tagessignal" — Reflexion wahrscheinlicher als Wärme).
 *
 * **Die Zellkonvention ist EINE Funktion** (`cellKey`, Floor-Zellen wie `clcMask.cellIndex`):
 * Batch und Client importieren sie beide — sonst entstehen zwei Raster (Lehre KL0:
 * Rundung ≠ Floor ist ein Verortungsfehler).
 *
 * Der Client lädt die Liste einmal, still (Fehler ⇒ `null` ⇒ alles verhält sich wie ohne
 * Liste). Kill-Switch `?ta=0` (Rule 2: neuer Pfad default-on, benannter Fallback = heute).
 *
 * Pur (bis auf den Loader), DOM-frei — `npm run verify:fire-anomalies`.
 */

export const THERMAL_SITES_URL = '/fire/ta/thermal-sites-v1.json';
export const THERMAL_SITES_VERSION = 1;

/** Zellraster: identisch zur CORINE-Maske (`clcMask.ts`) — 0,01°, Floor, DACH-Box. */
export const TA_STEP = 0.01;
export const TA_BBOX = { west: 5.5, south: 45.5, east: 17.5, north: 55.5 } as const;

/** Zellschlüssel `"<row>,<col>"` (Zeile von Nord nach Süd, Spalte von West nach Ost); `null` außerhalb. */
export function cellKey(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lon < TA_BBOX.west || lon >= TA_BBOX.east || lat <= TA_BBOX.south || lat > TA_BBOX.north) return null;
  // Exakt die Rechnung von `clcMask.cellIndex` (kein Epsilon) — sonst fallen Punkte auf Zellgrenzen
  // in der CLC-Maske und hier in verschiedene Zellen.
  const c = Math.floor((lon - TA_BBOX.west) / TA_STEP);
  const r = Math.floor((TA_BBOX.north - lat) / TA_STEP);
  return `${r},${c}`;
}

/** Zellmitte eines Schlüssels. */
export function cellCenter(key: string): { lat: number; lon: number } {
  const [r, c] = key.split(',').map(Number);
  return { lat: TA_BBOX.north - (r + 0.5) * TA_STEP, lon: TA_BBOX.west + (c + 0.5) * TA_STEP };
}

/** Die 8 Nachbarn plus die Zelle selbst. */
export function cellNeighbourhood(key: string): string[] {
  const [r, c] = key.split(',').map(Number);
  const out: string[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) out.push(`${r + dr},${c + dc}`);
  return out;
}

export type SiteClass = 'A' | 'B' | 'C';
export type FacilitySource = 'eprtr' | 'mastr' | 'bfe';
export type FacilityKind =
  | 'steel' | 'refinery' | 'cement' | 'glass' | 'waste' | 'biomass' | 'power' | 'chemical' | 'pulp' | 'metals' | 'ceramics' | 'mining' | 'other';

export interface ThermalFacility {
  name: string;
  /** Betreiber/Muttergesellschaft, wenn die Quelle ihn führt — sonst `null`. */
  operator: string | null;
  kind: FacilityKind;
  /** Quellenangabe im Klartext (Aktivitätscode, Energieträger …). */
  detail: string | null;
  source: FacilitySource;
  id: string;
  distanceM: number;
  lat: number;
  lon: number;
}

export interface ThermalSiteStats {
  detections: number;
  distinctDays: number;
  /** Verschiedene Detektionstage je Kalenderjahr. */
  years: Record<string, number>;
  nightShare: number;
  nasaType2Share: number;
  frp: { p50: number | null; p95: number | null; max: number | null };
  /** Letzte Archiv-Detektion, ms UTC. */
  lastMs: number | null;
}

export interface ThermalSite {
  id: string;
  lat: number;
  lon: number;
  cells: string[];
  bbox: [number, number, number, number];
  cls: SiteClass;
  stats: ThermalSiteStats;
  facility: ThermalFacility | null;
  /** Zweitbester Treffer (z. B. MaStR-Block neben E-PRTR-Werk), nur zur Anzeige. */
  facilityAlt: ThermalFacility | null;
  landcover: 'industrial' | 'other' | null;
  /** Ortsname aus dem Ortsverzeichnis des Batch (GeoNames), falls kein Anlagenname. */
  place: string | null;
  country: 'DE' | 'AT' | 'CH' | 'outside' | null;
  note: string | null;
}

export interface ThermalSitesFile {
  version: number;
  built: string;
  archive: { from: string; to: string; months: string; sources: string[] };
  rule: { yearsMin: number; daysPerYearMin: number; joinRadiusM: number };
  attributions: string[];
  sites: ThermalSite[];
}

export interface ThermalSitesIndex {
  file: ThermalSitesFile;
  sites: ThermalSite[];
  /** Zellschlüssel → Standortindex (nur die Zellen des Standorts, ohne Toleranz). */
  byCell: Map<string, number>;
}

export function indexSites(file: ThermalSitesFile): ThermalSitesIndex {
  const byCell = new Map<string, number>();
  file.sites.forEach((s, i) => { for (const c of s.cells) byCell.set(c, i); });
  return { file, sites: file.sites, byCell };
}

/** Standort an einer Zelle — mit ±1-Zelle-Toleranz (ein VIIRS-Pixel ist 375–800 m). */
export function siteAt(idx: ThermalSitesIndex | null, lat: number, lon: number): ThermalSite | null {
  if (!idx) return null;
  const k = cellKey(lat, lon);
  if (!k) return null;
  const direct = idx.byCell.get(k);
  if (direct != null) return idx.sites[direct];
  for (const n of cellNeighbourhood(k)) {
    const i = idx.byCell.get(n);
    if (i != null) return idx.sites[i];
  }
  return null;
}

/** Liegt der Punkt in den Standortzellen ± 1 Zelle? */
export function inSiteFootprint(site: ThermalSite, lat: number, lon: number): boolean {
  const k = cellKey(lat, lon);
  if (!k) return false;
  const set = new Set(site.cells);
  if (set.has(k)) return true;
  for (const n of cellNeighbourhood(k)) if (set.has(n)) return true;
  return false;
}

export const SITE_CLASS_LABEL: Record<SiteClass, string> = {
  A: 'Anlage (benannt)',
  B: 'Dauerquelle (unbenannt)',
  C: 'Tagessignal',
};

export const FACILITY_KIND_LABEL: Record<FacilityKind, string> = {
  steel: 'Eisen/Stahl', refinery: 'Raffinerie', cement: 'Zement/Kalk', glass: 'Glas',
  waste: 'Abfallverbrennung', biomass: 'Biomasse/Biogas', power: 'Kraftwerk', chemical: 'Chemie',
  pulp: 'Zellstoff/Papier', metals: 'NE-Metalle', ceramics: 'Keramik/Ziegel', mining: 'Bergbau/Tagebau', other: 'Industrie (sonstige)',
};

// ---------------------------------------------------------------------------
// Loader — Browser, einmal, still
// ---------------------------------------------------------------------------

let _idx: ThermalSitesIndex | null = null;
let _inflight: Promise<ThermalSitesIndex | null> | null = null;

/** Kill-Switch `?ta=0` bzw. `localStorage.ta = '0'` — dann verhält sich alles wie ohne Liste. */
export function thermalSitesEnabled(): boolean {
  try {
    if (typeof location !== 'undefined' && /[?&]ta=0(&|$)/.test(location.search)) return false;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('ta') === '0') return false;
  } catch { /* privater Modus */ }
  return true;
}

export function loadThermalSites(): Promise<ThermalSitesIndex | null> {
  if (_idx) return Promise.resolve(_idx);
  if (_inflight) return _inflight;
  if (!thermalSitesEnabled()) return Promise.resolve(null);
  _inflight = (async () => {
    try {
      // `no-store`: der Service Worker führt `.json` als gehashtes Asset (AF4-Lehre).
      const res = await fetch(THERMAL_SITES_URL, { cache: 'no-store' });
      if (!res.ok) return null;
      const file = (await res.json()) as ThermalSitesFile;
      if (!file || file.version !== THERMAL_SITES_VERSION || !Array.isArray(file.sites)) return null;
      _idx = indexSites(file);
      return _idx;
    } catch {
      return null;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}
export function resetThermalSites(): void { _idx = null; _inflight = null; }

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface TaCheck { name: string; ok: boolean; detail?: string }

export function fixtureSite(over: Partial<ThermalSite> = {}): ThermalSite {
  const k = cellKey(51.48, 6.72)!;
  return {
    id: `ta:${k}`, lat: 51.48, lon: 6.72, cells: [k], bbox: [6.71, 51.47, 6.73, 51.49], cls: 'A',
    stats: { detections: 500, distinctDays: 300, years: { 2020: 60, 2021: 60, 2022: 60, 2023: 60, 2024: 60 }, nightShare: 0.85, nasaType2Share: 0.9, frp: { p50: 8, p95: 40, max: 120 }, lastMs: Date.UTC(2026, 4, 30) },
    facility: { name: 'Fixture-Stahlwerk', operator: null, kind: 'steel', detail: 'E-PRTR 2.2', source: 'eprtr', id: 'x', distanceM: 300, lat: 51.481, lon: 6.721 },
    facilityAlt: null, landcover: 'industrial', place: null, country: 'DE', note: null,
    ...over,
  };
}

export function verifyThermalSites(): { checks: TaCheck[]; passed: number; total: number } {
  const checks: TaCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  add('Zellschlüssel: Nord-West-Ecke ist 0,0', cellKey(55.499, 5.5) === '0,0', String(cellKey(55.499, 5.5)));
  add('Zellschlüssel: Süd-Ost-Ecke ist 999,1199', cellKey(45.501, 17.499) === '999,1199', String(cellKey(45.501, 17.499)));
  add('außerhalb DACH ⇒ null', cellKey(40, 0) === null && cellKey(NaN, 6) === null);
  add('Floor, nicht Runden: 51,486 und 51,4801 liegen in derselben Zelle wie 51,485 — 51,479 nicht', cellKey(51.486, 6.725) === cellKey(51.485, 6.725) && cellKey(51.4801, 6.725) === cellKey(51.485, 6.725) && cellKey(51.479, 6.725) !== cellKey(51.485, 6.725));
  const cc = cellCenter(cellKey(51.485, 6.725)!);
  add('Zellmitte liegt in der Zelle', cellKey(cc.lat, cc.lon) === cellKey(51.485, 6.725) && Math.abs(cc.lat - 51.485) < 1e-9 && Math.abs(cc.lon - 6.725) < 1e-9, `${cc.lat},${cc.lon}`);
  add('Dieselbe Zellrechnung wie die CORINE-Maske (Grenzfall 51,48 / 6,72 ohne Epsilon)', cellKey(51.48, 6.72) === `${Math.floor((TA_BBOX.north - 51.48) / TA_STEP)},${Math.floor((6.72 - TA_BBOX.west) / TA_STEP)}`);
  add('Nachbarschaft hat 9 Zellen', cellNeighbourhood('10,10').length === 9 && cellNeighbourhood('10,10').includes('9,9') && cellNeighbourhood('10,10').includes('11,11'));
  const file: ThermalSitesFile = { version: 1, built: '2026-08-22', archive: { from: '2020-01-01', to: '2026-05-31', months: '1-12', sources: [] }, rule: { yearsMin: 2, daysPerYearMin: 5, joinRadiusM: 1500 }, attributions: [], sites: [fixtureSite()] };
  const idx = indexSites(file);
  add('siteAt trifft die Zelle selbst', siteAt(idx, 51.48, 6.72)?.id === file.sites[0].id);
  add('siteAt trifft die Nachbarzelle (~700 m)', siteAt(idx, 51.487, 6.727)?.id === file.sites[0].id);
  add('siteAt: 3 km entfernt ⇒ null', siteAt(idx, 51.51, 6.76) === null);
  add('siteAt ohne Index ⇒ null', siteAt(null, 51.48, 6.72) === null);
  add('inSiteFootprint: Zelle ± 1 ja, 3 km nein', inSiteFootprint(file.sites[0], 51.487, 6.727) && !inSiteFootprint(file.sites[0], 51.51, 6.76));
  add('Klassenlabels: „Industrie" kommt nur mit Quelle vor, B/C behaupten keine Anlage', !/Industrie/.test(SITE_CLASS_LABEL.B) && !/Anlage/.test(SITE_CLASS_LABEL.C));
  add('Version der Datei ist 1', THERMAL_SITES_VERSION === 1);
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
