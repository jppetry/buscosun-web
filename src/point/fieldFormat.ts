/**
 * NP-0b — Vertrag der Kartenfelder aus dem Punkt-Cube (audit/np0-datenprodukte.md §3, §8; E-NP0-4/-5). EINE Datei für den
 * Producer (`scripts/point/build-point-fields.mjs`, im Punkt-Cron nach jedem Stufenbau), den Publisher (Aufbewahrung,
 * CDN), den Client (NP-2) und den Verifier (`verify:np0-fields`): Pfade, Raster, Kodierung mit Kodierer UND Dekodierer,
 * Manifest mit Bauer und Prüfer, Index. Rein, ohne Netz und ohne Node-Module.
 *
 * Ablage (eigener Index, `run.json` und `point/index.json` bleiben unberührt — E-NP0-5 a):
 *   point/field/v1/index.json                         jüngster Lauf je Stufe (veränderlich ⇒ purgen)
 *   point/field/v1/<lauf>/<stufe>/field.json          Manifest des Felds (zuletzt geschrieben)
 *   point/field/v1/<lauf>/<stufe>/precip-<LLL>.png    Niederschlag je nativem Vorlauf LLL (Stunden, dreistellig)
 *   point/field/v1/<lauf>/<stufe>/snowlmt-<LLL>.png   Schneefallgrenze je nativem Vorlauf (t3: keine — keine Quelle führt sie)
 *
 * Etikett: **„Modell · Cube"** — nie „buscosun Fusion 8". Das Feld ist die Fusion-Kette mit dem Cube als EINZIGER Quelle
 * (E-NP0-4 F1): keine Station, kein Radar, kein Gelände am Ort; am Zellmittelpunkt. Der Ort bekommt Fusion 8.
 *
 * Raster = das Gitter der Stufe (`TIERS`): reguläres Breite/Länge-Gitter, Zellmitten `lat0 + iy·deg`, `lon0 + ix·deg`.
 * Die PNG-Zeile 0 ist der NORDRAND (Zelle iy = ny − 1). Ein Bild deckt die Zellen ganz (Ecken = Zellmitten ± deg/2).
 * ⚠ Das Raster ist in Grad regulär, nicht in Mercator — eine MapLibre-`image`-Source mit vier Ecken verzerrt es in der
 * Breite (Darstellung = NP-2, Mesh wie die Radar-Ebenen).
 */

import { POINT_DIR, TIERS, TIER_BY_ID, type CubeTier, type TierId } from './cubeFormat';

export const FIELD_VERSION = 'v1';
export const FIELD_DIR = `${POINT_DIR}/field/${FIELD_VERSION}`;
export const FIELD_INDEX_PATH = `${FIELD_DIR}/index.json`;
export const FIELD_MANIFEST_FILE = 'field.json';
export const FIELD_LABEL = 'Modell · Cube';
export const FIELD_PROVENANCE = 'cube';

export function fieldRunDir(run: string, tierId: TierId): string {
  return `${FIELD_DIR}/${run}/${tierId}`;
}
export function fieldFileName(kind: 'precip' | 'snowlmt' | 'precipcum', leadH: number): string {
  return `${kind}-${String(leadH).padStart(3, '0')}.png`;
}

// --- Raster ------------------------------------------------------------------------------------

export interface FieldGrid {
  tier: TierId;
  width: number; height: number; deg: number;
  /** Zellmitte der Zelle (0, 0) = Südwesten. */
  lat0: number; lon0: number;
  /** Zeile 0 der PNG = Norden. */
  rowOrder: 'north-first';
  /** Bildecken (Zellränder), lon/lat, im Uhrzeigersinn ab oben links. */
  corners: [[number, number], [number, number], [number, number], [number, number]];
}

export function fieldGrid(tier: CubeTier): FieldGrid {
  const h = tier.deg / 2;
  const west = tier.lon0 - h, east = tier.lon0 + (tier.nx - 1) * tier.deg + h;
  const south = tier.lat0 - h, north = tier.lat0 + (tier.ny - 1) * tier.deg + h;
  const r = (x: number) => Math.round(x * 1e6) / 1e6;
  return {
    tier: tier.id, width: tier.nx, height: tier.ny, deg: tier.deg, lat0: tier.lat0, lon0: tier.lon0, rowOrder: 'north-first',
    corners: [[r(west), r(north)], [r(east), r(north)], [r(east), r(south)], [r(west), r(south)]],
  };
}

/** Byte-Offset (RGBA) der Zelle (iy, ix) im Bild — Zeile 0 = Norden. */
export function fieldPixelOffset(tier: CubeTier, iy: number, ix: number): number {
  return ((tier.ny - 1 - iy) * tier.nx + ix) * 4;
}

// --- Kodierung Niederschlag ---------------------------------------------------------------------

/**
 * precip-<LLL>.png, RGBA, Alpha nur 0/255 (Canvas liest vormultipliziert):
 *   R = Chance P(nass) = round(254 · p), 0…254
 *   G = Median der Rate, WENN es regnet (Median | nass): 0 = kein nasser Teil (p = 0), sonst Log-Code 1…255
 *   B = q90 der Rate unbedingt („ungünstiger Fall"): 0 = 0 mm/h, sonst Log-Code 1…255
 *   A = 255 gerechnet, 0 = fehlt (keine Verteilung) — **fehlt ist nie 0**
 * Log-Code(x > 0) = 1 + round(254 · ln(1 + x/x₀) / ln(1 + x_max/x₀)), x₀ 0,1, x_max 100 mm/h (gemessen max q90 29,3 mm/h,
 * D-NP0-9; darüber Sättigung bei 255, gezählt). Relativer Quantisierungsfehler von (1 + x/x₀) ≤ ±1,4 %.
 * Einheit: mittlere Rate in mm/h über das Intervall (t − stepH, t] der Stufe (1/3/6 h) — `field.json#stepH`.
 */
export const PRECIP_X0 = 0.1;
export const PRECIP_XMAX = 100;
const PRECIP_L = Math.log(1 + PRECIP_XMAX / PRECIP_X0);

export function precipLogCode(x: number): number {
  if (!(x > 0)) return 0;
  return Math.max(1, Math.min(255, 1 + Math.round((254 * Math.log(1 + x / PRECIP_X0)) / PRECIP_L)));
}
export function precipLogValue(c: number): number {
  if (c <= 0) return 0;
  return PRECIP_X0 * (Math.exp(((c - 1) / 254) * PRECIP_L) - 1);
}

export interface PrecipCell { chance: number; medianWet: number | null; q90: number }

export function encodePrecipPixel(v: PrecipCell | null, out: Uint8Array, o: number): void {
  if (!v || !Number.isFinite(v.chance) || !Number.isFinite(v.q90)) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; return; }
  const p = Math.max(0, Math.min(1, v.chance));
  out[o] = Math.round(254 * p);
  out[o + 1] = p > 0 && v.medianWet != null && v.medianWet > 0 ? precipLogCode(v.medianWet) : 0;
  out[o + 2] = precipLogCode(v.q90);
  out[o + 3] = 255;
}
export function decodePrecipPixel(r: number, g: number, b: number, a: number): PrecipCell | null {
  if (a !== 255) return null;
  return { chance: r / 254, medianWet: g === 0 ? null : precipLogValue(g), q90: precipLogValue(b) };
}

// --- Kodierung kumulierte Erwartung (Phase NS, E-NS-9) -------------------------------------------

/**
 * precipcum-<LLL>.png, RGBA — die über die Vorläufe AUFSUMMIERTE Erwartung des Niederschlags (mm) ab dem Beginn des ersten
 * Intervalls der Stufe: C(L) = Σ_{k ≤ L} meanOf(Hürde_k) · stepH. Mittelwerte addieren sich ohne Annahme über die
 * Abhängigkeit der Stunden (`audit/niederschlagssummen.md` §9.2/§9.4); die Summe über ein Fenster ist C(Ende) − C(Anfang),
 * zwei Dateien statt aller Vorläufe. Quantile stehen hier bewusst NICHT — sie addieren sich nicht.
 *   R·65536 + G·256 + B = C in 0,01 mm (24 bit, bis 167 772 mm)
 *   A = 255 gerechnet; 0 = fehlt — und bleibt für ALLE späteren Vorläufe der Zelle 0 (eine fehlende Stufe macht jede
 *       Summe über sie unbekannt; nie wird sie als 0 mm weitergezählt)
 */
export const PRECIP_CUM_UNIT_MM = 0.01;
export const PRECIP_CUM_MAX_MM = (2 ** 24 - 1) * PRECIP_CUM_UNIT_MM;

export function encodePrecipCumPixel(mm: number | null, out: Uint8Array, o: number): boolean {
  if (mm == null || !Number.isFinite(mm) || mm < 0) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; return false; }
  const q = Math.min(2 ** 24 - 1, Math.round(mm / PRECIP_CUM_UNIT_MM));
  out[o] = (q >>> 16) & 255; out[o + 1] = (q >>> 8) & 255; out[o + 2] = q & 255; out[o + 3] = 255;
  return q === 2 ** 24 - 1;
}
export function decodePrecipCumPixel(r: number, g: number, b: number, a: number): number | null {
  if (a !== 255) return null;
  return ((r << 16) | (g << 8) | b) * PRECIP_CUM_UNIT_MM;
}

// --- Kodierung Schneefallgrenze -----------------------------------------------------------------

/**
 * snowlmt-<LLL>.png, RGBA:
 *   R = Mitte in 25-m-Schritten (0…6 375 m ü. NN; darüber Sättigung, gezählt)
 *   G = halbe Bandbreite in 25-m-Schritten — das Band ist symmetrisch, Mitte ∓ 1,2816·σ (p10…p90), dieselbe Regel wie
 *       buscosun Fusion 8 am Punkt (`fusion/output.ts` fromCell, D-NP0-11); 0 = kein Band
 *   B = Herkunft der Spanne: 0 kein Band, 2 σ_div (Spanne der Modelle), 3 σ_ens (Ensemble) — nie gemischt; die
 *       Quantile einer Quelle (C-LAEF q10/q90) nimmt Fusion 8 dafür nicht, das Feld deshalb auch nicht
 *   A = 255 gerechnet, 0 = fehlt (keine Quelle führt die Grenze, z. B. ICON-CH ohne Niederschlag maskiert)
 */
export const SNOW_STEP_M = 25;
export const SNOW_PROV = Object.freeze({ none: 0, divergence: 2, ensemble: 3 });
export type SnowProv = 'none' | 'divergence' | 'ensemble';

export interface SnowCell { mid: number; half: number; prov: SnowProv }

export function encodeSnowPixel(v: SnowCell | null, out: Uint8Array, o: number): boolean {
  if (!v || !Number.isFinite(v.mid)) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; return false; }
  const m = Math.round(Math.max(0, v.mid) / SNOW_STEP_M);
  const h = v.prov === 'none' || !Number.isFinite(v.half) ? 0 : Math.round(Math.max(0, v.half) / SNOW_STEP_M);
  out[o] = Math.min(255, m); out[o + 1] = Math.min(255, h); out[o + 2] = SNOW_PROV[v.prov]; out[o + 3] = 255;
  return m > 255 || h > 255;
}
export function decodeSnowPixel(r: number, g: number, b: number, a: number): SnowCell | null {
  if (a !== 255) return null;
  const prov: SnowProv = b === 3 ? 'ensemble' : b === 2 ? 'divergence' : 'none';
  return { mid: r * SNOW_STEP_M, half: prov === 'none' ? 0 : g * SNOW_STEP_M, prov };
}

// --- Bedeutung (Text im Manifest, gemessen) -----------------------------------------------------

/** E-NP0-4 F1 mit den Messwerten D-NP0-12 (Archiv 16.09.–01.10., 389 Stationspunkte, t1, Wahrheit Stationsstunde ≥ 0,1 mm). */
export const CHANCE_DEFINITION = Object.freeze({
  id: 'F1',
  text: 'Chance = 1 − pDry der Niederschlags-Hürde von buscosun Fusion (Stufe fs, K-2 → gelernte Hürde) mit dem Cube als EINZIGER Quelle — ohne Station, Radar und Gelände am Ort, am Zellmittelpunkt. Am Ort ohne Station rechnet Fusion 8 dieselbe Kette (gemessen: mittlerer Abstand |Δp| 0,004–0,007).',
  measured: 'Brier 3–6 h 0,0268 · 7–24 h 0,0256 · 25–48 h 0,0281 (Skill gegen die Orts-Klimatologie 0,18 / 0,30 / 0,17); Spread-Verteilung der Quellen 19–25 % schlechter; Archiv 16.09.–01.10., 389 Stationspunkte, 15 Ausgabetage, nach Benjamini-Hochberg kein Paar signifikant (audit/np0-datenprodukte.md §8.1).',
  caveat: 'Im Mittel etwas zu nass (p̄ 5,6–6,9 % bei 3,3–3,7 % Regenstunden, V-NP0-17); jenseits 6 h ist Niederschlag laut Lernphase ohne Skill gegen den Cube — Chance und Spanne, keine exakte Menge.',
});

export const SNOWLINE_DEFINITION = 'Mitte = Zellwert `snowlmt` (m ü. NN) wie bei buscosun Fusion am Punkt; Band Mitte ∓ 1,2816·σ (p10…p90) mit σ = σ_ens, sonst σ_div (Spanne der Modelle, unkalibriert — V-NP0-15).';

// --- Manifest ----------------------------------------------------------------------------------

export interface FieldLead {
  leadH: number;
  validAtMs: number;
  precip: string | null;
  snowlmt: string | null;
  /** Phase NS (E-NS-9): kumulierte Erwartung bis zu diesem Vorlauf; fehlt in Feldern vor Phase NS (additiv). */
  precipcum?: string | null;
}

export interface FieldStats {
  cells: number;
  /** Zell·Schritte ohne Niederschlagsverteilung (A = 0). */
  precipMissing: number;
  /** Zell·Schritte ohne Schneefallgrenze (A = 0). */
  snowMissing: number;
  /** Log-Code 255 (q90 oder Median ≥ x_max) bzw. Schneefallgrenze über 6 375 m. */
  saturated: number;
  /** Zellen, an denen die Kette einen Fehler warf (gezählt, Feld dort A = 0). */
  errors: number;
  /** Phase NS: Zellen, deren kumulierte Erwartung ab einem Vorlauf fehlt (eine Stufe ohne Verteilung). */
  cumBroken?: number;
}

export interface FieldManifest {
  schema: 1;
  product: 'point-field';
  version: typeof FIELD_VERSION;
  label: typeof FIELD_LABEL;
  provenance: typeof FIELD_PROVENANCE;
  run: string;
  tier: TierId;
  runAtMs: number;
  builtAtMs: number;
  stepH: number;
  rate: string;
  grid: FieldGrid;
  leads: FieldLead[];
  encoding: { precip: string; snowlmt: string; x0: number; xMax: number; snowStepM: number; precipcum?: string; cumUnitMm?: number };
  chance: typeof CHANCE_DEFINITION;
  snowline: string;
  /** Kette: Motor-Optionen, Tabellen (sha256 von `fusion.client.json`), Code-Stand des Producers. */
  chain: { options: Record<string, unknown>; tables: { path: string; sha256: string | null } | null; codeCommit: string | null; notes: string[] };
  stats: FieldStats;
  timing: { ms: number; workers: number };
}

export function makeFieldManifest(p: Omit<FieldManifest, 'schema' | 'product' | 'version' | 'label' | 'provenance' | 'grid' | 'stepH' | 'rate' | 'encoding' | 'chance' | 'snowline'> & { cum?: boolean }): FieldManifest {
  const tier = TIER_BY_ID[p.tier];
  return {
    schema: 1, product: 'point-field', version: FIELD_VERSION, label: FIELD_LABEL, provenance: FIELD_PROVENANCE,
    run: p.run, tier: p.tier, runAtMs: p.runAtMs, builtAtMs: p.builtAtMs, stepH: tier.stepH,
    rate: `mittlere Rate in mm/h über (t − ${tier.stepH} h, t] — eine t${tier.index + 1}-Rate ist ein ${tier.stepH}-h-Mittel`,
    grid: fieldGrid(tier), leads: p.leads,
    encoding: {
      precip: 'R = round(254·Chance); G = Median | nass (0 = kein nasser Teil); B = q90 unbedingt (0 = 0 mm/h); Log-Code 1 + round(254·ln(1 + x/x0)/ln(1 + xMax/x0)); A = 255 gerechnet, 0 fehlt',
      snowlmt: 'R = Mitte / 25 m; G = halbe Bandbreite / 25 m (p10…p90 symmetrisch); B = Herkunft 0 kein Band · 2 σ_div · 3 σ_ens; A = 255 gerechnet, 0 fehlt',
      x0: PRECIP_X0, xMax: PRECIP_XMAX, snowStepM: SNOW_STEP_M,
      ...(p.cum ? {
        precipcum: 'R·65536 + G·256 + B = kumulierte Erwartung C(L) = Σ meanOf(Hürde) · stepH ab dem ersten Intervall der Stufe, in 0,01 mm; A = 255 gerechnet, 0 fehlt (ab einer fehlenden Stufe für alle späteren Vorläufe); Fenstersumme = C(Ende) − C(Anfang); keine Quantile',
        cumUnitMm: PRECIP_CUM_UNIT_MM,
      } : {}),
    },
    chance: CHANCE_DEFINITION, snowline: SNOWLINE_DEFINITION,
    chain: p.chain, stats: p.stats, timing: p.timing,
  };
}

/** Prüfer: null bei fremdem/kaputtem Manifest. */
export function parseFieldManifest(j: unknown): FieldManifest | null {
  if (!j || typeof j !== 'object') return null;
  const m = j as Partial<FieldManifest>;
  if (m.schema !== 1 || m.product !== 'point-field' || m.version !== FIELD_VERSION) return null;
  if (m.label !== FIELD_LABEL || m.provenance !== FIELD_PROVENANCE) return null;
  const tier = m.tier ? TIER_BY_ID[m.tier] : undefined;
  if (!tier || typeof m.run !== 'string' || !/^\d{10}$/.test(m.run) || !Number.isFinite(m.runAtMs)) return null;
  const g = fieldGrid(tier);
  if (!m.grid || m.grid.width !== g.width || m.grid.height !== g.height || m.grid.deg !== g.deg
    || m.grid.lat0 !== g.lat0 || m.grid.lon0 !== g.lon0 || m.grid.rowOrder !== 'north-first') return null;
  if (m.stepH !== tier.stepH || !Array.isArray(m.leads) || m.leads.length === 0) return null;
  const leadSet = new Set(tier.leadHours);
  for (const l of m.leads) {
    if (!leadSet.has(l.leadH) || l.validAtMs !== (m.runAtMs as number) + l.leadH * 3_600_000) return null;
    if (l.precip !== null && l.precip !== fieldFileName('precip', l.leadH)) return null;
    if (l.snowlmt !== null && l.snowlmt !== fieldFileName('snowlmt', l.leadH)) return null;
    if (l.precipcum != null && l.precipcum !== fieldFileName('precipcum', l.leadH)) return null;
  }
  if (!m.encoding || m.encoding.x0 !== PRECIP_X0 || m.encoding.xMax !== PRECIP_XMAX || m.encoding.snowStepM !== SNOW_STEP_M) return null;
  if (!m.chance || m.chance.id !== CHANCE_DEFINITION.id || !m.stats || typeof m.stats.cells !== 'number') return null;
  return m as FieldManifest;
}

// --- Index -------------------------------------------------------------------------------------

export interface FieldIndexEntry { run: string; runAtMs: number; builtAtMs: number; durationMs: number; leads: number }
export interface FieldIndex {
  schema: 1;
  product: 'point-field-index';
  version: typeof FIELD_VERSION;
  label: typeof FIELD_LABEL;
  updatedAtMs: number;
  /** Jüngster Lauf mit Feld je Stufe. */
  latestByTier: Partial<Record<TierId, FieldIndexEntry>>;
  /** Alle vorgehaltenen Läufe je Stufe, jüngster zuerst. */
  runsByTier: Partial<Record<TierId, string[]>>;
}

export function makeFieldIndex(latestByTier: FieldIndex['latestByTier'], runsByTier: FieldIndex['runsByTier'], updatedAtMs: number): FieldIndex {
  return { schema: 1, product: 'point-field-index', version: FIELD_VERSION, label: FIELD_LABEL, updatedAtMs, latestByTier, runsByTier };
}

export function parseFieldIndex(j: unknown): FieldIndex | null {
  if (!j || typeof j !== 'object') return null;
  const m = j as Partial<FieldIndex>;
  if (m.schema !== 1 || m.product !== 'point-field-index' || m.version !== FIELD_VERSION || m.label !== FIELD_LABEL) return null;
  if (!m.latestByTier || typeof m.latestByTier !== 'object' || !m.runsByTier) return null;
  for (const t of TIERS) {
    const e = m.latestByTier[t.id];
    if (e && (!/^\d{10}$/.test(e.run) || !Number.isFinite(e.runAtMs))) return null;
  }
  return m as FieldIndex;
}
