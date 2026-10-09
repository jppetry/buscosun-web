/**
 * Phase NS, Stufe B2/B3 — Vertrag der gemessenen Flächensummen `buscosun-data/precipsum/v1/` (Producer
 * `scripts/precipsum/precipsum-derive.mjs`, Leser `sumMapEngine.ts`). `audit/niederschlagssummen.md` §11.
 *
 * Quellen (amtlich, mit Regenmessern angeeicht, je Stunde; gemessen 08.10.2026, §11.1):
 *   DE (und alles, was die Länderregel nicht AT/CH zuordnet) — DWD RADOLAN RW, HDF5, 1100 × 1200, 0,1 mm, Stempel = Ende
 *   AT — GeoSphere INCA-Analyse `RR`, NetCDF, 701 × 401, 0,001 mm, Stempel = Ende (gegen 269 TAWES-Stationen: r 0,93
 *        am Fensterende gegen 0,27 am Fensteranfang)
 *   CH — MeteoSchweiz CombiPrecip `_00060`, ODIM-HDF5, 710 × 640, float64 mm, Stempel = Ende
 *
 * Ablage (ein Lauf = EIN Ende E, volle UTC-Stunde; alle Fenster enden an E):
 *   latest.json                         Manifest (mutabel; raw zuerst lesen)
 *   <JJJJMMTTHH>-<länder>/sum-<WWW>h.png   je Fenster W ∈ {1,3,6,12,24,48} ein Bild auf dem DACH-Gitter G (600 × 512,
 *                                       `precipIndexMap.ts`, Zeile 0 = Norden, Zellmitten wie `gridLatLon`), Kodierung
 *                                       wie `precipcum` (`fieldFormat.ts`): R·65536 + G·256 + B in 0,01 mm, A 255 = gemessen,
 *                                       A 0 = Lücke. Der Ordnername trägt die Länder, deren Stunde E vorlag — derselbe Name
 *                                       hat immer denselben Inhalt (unveränderlich, CDN-tauglich).
 *
 * Regeln (§3): eine Zelle hat nur dann einen Wert, wenn ALLE Stunden des Fensters in der Quelle ihres Landes gültig sind
 * (fehlende Datei, `nodata`, NaN ⇒ Lücke, nie 0 mm, nie eine Teilsumme; E-NS-5). `undetect` (RW 0) zählt als 0 mm. Die
 * Zelle liest das nächste Quellpixel (Index-Map wie die Niederschlagskarte) — keine Flächenmittelung. Kein Randstück: das
 * Fenster endet an E, nicht „jetzt" (E-NS-3 „Stand"); die Legende nennt E.
 */

import { decodePrecipCumPixel, encodePrecipCumPixel, PRECIP_CUM_UNIT_MM } from '../point/fieldFormat';

export const PAST_SUM_SCHEMA = 1;
/** Ordner eines Laufs: `<JJJJMMTTHH>-<länder>[-rw]-<8 hex>` (ältere Läufe ohne Hash bleiben lesbar). */
export const PAST_SUM_DIR_RE = /^\d{10}-[a-z0-9-]+$/;
export const PAST_SUM_DIR = 'precipsum/v1';
export const PAST_SUM_WINDOWS_H = [1, 3, 6, 12, 24, 48] as const;
export const PAST_SUM_HOURS = 48;
export const PAST_SUM_UNIT_MM = PRECIP_CUM_UNIT_MM;
/** Wie viele Läufe die Ablage hält (der jüngste + Reserve für einen veralteten Manifest-Stand). */
export const PAST_SUM_KEEP_RUNS = 3;
/** Älter als das ⇒ der Leser nennt den Stand „veraltet" statt ihn still zu zeigen. */
export const PAST_SUM_STALE_MS = 3 * 3_600_000;

export type PastSumCountry = 'DE' | 'AT' | 'CH';
export const PAST_SUM_COUNTRIES: readonly PastSumCountry[] = ['DE', 'AT', 'CH'];
/** Index wie `SumGeometry.country` (0 DE, 1 AT, 2 CH). */
export const PAST_SUM_COUNTRY_INDEX: Record<PastSumCountry, number> = { DE: 0, AT: 1, CH: 2 };

export interface PastSumSource {
  id: 'rw' | 'inca' | 'cpc';
  label: string;
  provider: string;
  /** Gemessene Lieferverzögerung nach dem Stundenende (min), `audit/niederschlagssummen.md` §2. */
  latencyMin: number;
}
export const PAST_SUM_SOURCES: Record<PastSumCountry, PastSumSource> = {
  DE: { id: 'rw', label: 'RADOLAN RW', provider: 'DWD', latencyMin: 26 },
  AT: { id: 'inca', label: 'INCA-Analyse', provider: 'GeoSphere Austria', latencyMin: 35 },
  CH: { id: 'cpc', label: 'CombiPrecip', provider: 'MeteoSchweiz', latencyMin: 5 },
};

export interface PastSumCountryState {
  /** Gültige Stunden der Quelle im 48-h-Bereich bis E (0…48). */
  hours: number;
  /** Lag die Stunde E vor? Ohne sie ist das Land in jedem Fenster eine Lücke. */
  hasEnd: boolean;
  /** Längstes Fenster, für das alle Stunden vorlagen (0 = keins). */
  maxWindowH: number;
  note?: string;
}

export interface PastSumWindowEntry {
  file: string;
  /** DE: welches Produkt das Fenster trägt und wo es endet (SF endet 10 min vor E). */
  de?: PastSumWindowDe;
  /** Zellen mit Wert / Lücken / Zellen > 0 mm. */
  valid: number;
  gap: number;
  wet: number;
  maxMm: number;
}

export interface PastSumManifest {
  schema: typeof PAST_SUM_SCHEMA;
  kind: 'precipsum/past';
  /** Ende aller Fenster, ISO (volle UTC-Stunde). */
  end: string;
  dir: string;
  grid: { w: number; h: number; lonMin: number; lonMax: number; latMin: number; latMax: number };
  unitMm: number;
  countries: Record<PastSumCountry, PastSumCountryState>;
  windows: Record<string, PastSumWindowEntry>;
  sources: Record<PastSumCountry, PastSumSource>;
  builtAt: string;
}

const two = (n: number) => String(n).padStart(2, '0');
export function pastSumStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}${two(d.getUTCHours())}`;
}
export function pastSumStampMs(stamp: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})/.exec(stamp);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]);
}
/**
 * Grundname eines Laufs: Stempel + die Länder mit Stunde E (in fester Reihenfolge) + `-rw`, wenn DE 24/48 h ohne SF
 * gerechnet ist. Der Producer hängt einen Inhalts-Hash an (`-<8 hex>`): gleiches Ende und gleiche Länder heißen nicht
 * gleicher Inhalt — eine nachgeholte Stunde (z. B. eine verlorene CombiPrecip-Datei) ändert die Bilder, nicht den Grundnamen
 * (V-NS-17, erster Live-Lauf 08.10.). Erst mit dem Hash trägt derselbe Name immer denselben Inhalt.
 */
export function pastSumRunDir(endMs: number, withEnd: readonly PastSumCountry[], deDailyFallback = false): string {
  const cc = PAST_SUM_COUNTRIES.filter((c) => withEnd.includes(c)).map((c) => c.toLowerCase());
  return `${pastSumStamp(endMs)}-${cc.length ? cc.join('-') : 'none'}${deDailyFallback ? '-rw' : ''}`;
}
export function pastSumFileName(windowH: number): string {
  return `sum-${String(windowH).padStart(3, '0')}h.png`;
}

export const encodePastSumPixel = encodePrecipCumPixel;
export const decodePastSumPixel = decodePrecipCumPixel;

/**
 * Alpha außerhalb von DE · AT · CH (Landesumrisse `public/countries/*.geojson`): keine Aussage — die Quellen sind nur im
 * eigenen Land mit Regenmessern angeeicht (RW außerhalb DE = reines Radar, §2.1), deshalb zeigt die Karte dort nichts
 * statt einer Lücke. Der Browser hält den Alphakanal beim Dekodieren exakt (nur RGB wird vormultipliziert).
 */
export const PAST_SUM_ALPHA_OUTSIDE = 128;
export function encodePastSumOutside(out: Uint8Array, o: number): void { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = PAST_SUM_ALPHA_OUTSIDE; }
/** 'value' (gemessen), 'gap' (in DACH, aber keine vollständige Messung), 'outside' (außerhalb DACH). */
export function pastSumCellState(a: number): 'value' | 'gap' | 'outside' {
  return a === 255 ? 'value' : a === PAST_SUM_ALPHA_OUTSIDE ? 'outside' : 'gap';
}

/** Gerade-ungerade-Regel je Zeile über alle Ringe (lng/lat-Paare) — Maske „Zellmitte liegt im Umriss". */
export function insideMaskOnGrid(lat: Float32Array, lon: Float32Array, width: number, height: number, rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>>): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let r = 0; r < height; r++) {
    const y = lat[r * width];
    const cuts: number[] = [];
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y)) cuts.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
      }
    }
    cuts.sort((a, b) => a - b);
    let k = 0;
    for (let c = 0; c < width; c++) {
      const x = lon[r * width + c];
      while (k < cuts.length && cuts[k] <= x) k++;
      out[r * width + c] = k & 1;
    }
  }
  return out;
}

/** Prüft ein Manifest; wirft mit Grund statt still Unsinn zu zeigen. */
export function parsePastSumManifest(j: unknown): PastSumManifest {
  const m = j as Partial<PastSumManifest> | null;
  if (!m || m.schema !== PAST_SUM_SCHEMA || m.kind !== 'precipsum/past') throw new Error('precipsum: Manifest unbekannt');
  if (typeof m.end !== 'string' || !Number.isFinite(Date.parse(m.end))) throw new Error('precipsum: Ende fehlt');
  if (typeof m.dir !== 'string' || !PAST_SUM_DIR_RE.test(m.dir)) throw new Error('precipsum: Ordner ungültig');
  if (!m.windows || !m.countries || !m.grid) throw new Error('precipsum: Manifest unvollständig');
  for (const [k, w] of Object.entries(m.windows)) {
    if (!PAST_SUM_WINDOWS_H.includes(Number(k) as typeof PAST_SUM_WINDOWS_H[number])) throw new Error(`precipsum: Fenster ${k}`);
    if (!w || w.file !== pastSumFileName(Number(k))) throw new Error(`precipsum: Datei für ${k} h`);
  }
  return m as PastSumManifest;
}

/**
 * DE, Fenster 24/48 h: DWD RADOLAN SF (24-h-Summe, täglich angeeicht mit mehr Regenmessern) statt der Kette aus 24/48 RW.
 * Gemessen 08.10.2026 an 1 251 DWD-Stationen (24 h): SF r 0,94 · MAE 1,35 mm, RW-Kette r 0,84 · MAE 2,15 mm
 * (`audit/niederschlagssummen.md` §11.3; die Regenmesser stecken teils in beiden Eichungen). SF hat Stempel :50 ⇒ das
 * DE-Fenster endet 10 min vor E — die Legende nennt das. 48 h = SF(E − 10 min) + SF(E − 10 min − 24 h), nicht überlappend.
 * Fehlt eine SF-Datei, gilt die RW-Kette (Ordnername mit `-rw`, Manifest nennt das Produkt).
 */
export const PAST_SUM_DE_DAILY = { id: 'sf', label: 'RADOLAN SF', provider: 'DWD', endOffsetMin: 10, windowsH: [24, 48] as const } as const;

export interface PastSumWindowDe { product: 'RW' | 'SF'; end: string }

/**
 * Fenstersumme je Zelle: Land je Zelle (0/1/2), je Land die Liste der Felder, die das Fenster ausmachen (Stundenfelder oder
 * 24-h-Felder; `null` = Datei fehlt). Rein — der Producer und der Verifier rechnen damit.
 */
export function windowSumOnGrid(
  country: Uint8Array,
  lists: ReadonlyArray<ReadonlyArray<Float32Array | null>>,
): Float32Array {
  const n = country.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const hs = lists[country[i]];
    let s = 0;
    for (let k = 0; k < hs.length; k++) {
      const f = hs[k];
      const v = f ? f[i] : NaN;
      if (!(v >= 0)) { s = NaN; break; }   // NaN, negativ oder fehlende Datei ⇒ Lücke
      s += v;
    }
    out[i] = hs.length ? s : NaN;
  }
  return out;
}
