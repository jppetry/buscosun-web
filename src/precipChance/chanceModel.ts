/**
 * Phase RC — Regenchance im Regenradar (`audit/regenchance.md`): Schalter, Schwellen, Stufen, Stunde, Wörter, Punktraster.
 *
 * Rein (kein DOM, kein Netz): Dock, Karte, Ortskarte und `verify:regenchance` lesen dieselben Konstanten.
 *
 * Die Chance ist immer die einer Verteilung von buscosun Fusion in EINEM nativen Schritt (Intervall (t − Δ, t], t1 1 h,
 * t2 3 h): „> 0" = 1 − pDry der Hürde (E-RC-3, dieselbe Größe wie der R-Kanal der Kartenfelder), „≥ 1 mm"/„≥ 5 mm" =
 * Menge im Intervall (E-RC-2). Stundenwerte werden nie zu Fensterwerten verrechnet (E-RC-5). Fehlt ein Wert, ist das eine
 * Lücke — nie 0 %.
 */

export type ChanceThreshold = 'any' | 'ge1' | 'ge5';
export const CHANCE_THRESHOLDS: readonly ChanceThreshold[] = Object.freeze(['any', 'ge1', 'ge5'] as const);
export const CHANCE_THRESHOLD_LABEL: Record<ChanceThreshold, string> = { any: '> 0', ge1: '≥ 1 mm', ge5: '≥ 5 mm' };
/** Schwelle als Menge im Intervall (mm); `any` = jede messbare Menge (Hürde: Stationsstunde ≥ 0,1 mm). */
export const CHANCE_THRESHOLD_MM: Record<ChanceThreshold, number> = { any: 0, ge1: 1, ge5: 5 };

export function isChanceThreshold(x: unknown): x is ChanceThreshold {
  return x === 'any' || x === 'ge1' || x === 'ge5';
}

/** `?rc=1` = Ansicht „Chance" an; voreingestellt aus (Regel 2, E-RC-6). Ohne Schalter bleibt das Regenradar wie vorher. */
export function chanceEnabledFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('rc') === '1'; } catch { return false; }
}

// --- Stufen der Karte --------------------------------------------------------------------------------

/** Untergrenzen der Punktdichte-Bänder (Wahrscheinlichkeit); unter 10 % bleibt die Karte leer (nicht schraffiert). */
export const CHANCE_BANDS: readonly number[] = Object.freeze([0.1, 0.3, 0.5, 0.7, 0.9]);
/** Konturen mit Beschriftung (Auftrag: 30 / 50 / 70 / 90 %). */
export const CHANCE_CONTOURS: readonly number[] = Object.freeze([0.3, 0.5, 0.7, 0.9]);

/**
 * Geordnete Rastermatrix (Bayer 8 × 8, Werte 0…63). Band k zeichnet genau die Zellen mit Wert in
 * [64·Band_{k−1}, 64·Band_k) — übereinander ergeben die Bänder die Dichte der Untergrenze des Bands (10 % ⇒ 6 von 64 Punkten,
 * 90 % ⇒ 58 von 64). Ein Punkt wird nie doppelt gezeichnet.
 */
export const BAYER8: readonly number[] = Object.freeze([
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
]);

/** Zellen (Index 0…63) des Musters für Band k (nur der Zuwachs gegen Band k − 1). */
export function bandDotCells(k: number): number[] {
  const lo = k === 0 ? 0 : Math.round(64 * CHANCE_BANDS[k - 1]);
  const hi = Math.round(64 * CHANCE_BANDS[k]);
  const out: number[] = [];
  for (let i = 0; i < 64; i++) if (BAYER8[i] >= lo && BAYER8[i] < hi) out.push(i);
  return out;
}

/** Punkte je 64 bis einschließlich Band k (= Dichte, die man im Band sieht). */
export function bandDensity(k: number): number {
  return Math.round(64 * CHANCE_BANDS[k]) / 64;
}

// --- Stunde ------------------------------------------------------------------------------------------

const H = 3_600_000;

/**
 * Die Stunde, für die Karte und Satz die Chance zeigen: das Stundenintervall [HH:00, HH+1:00), in dem `tMs` liegt.
 * Liegt `tMs` vor der laufenden Stunde (Slider im Rückblick), gilt die laufende Stunde (E-RC-4: „nächste volle Stunde ab
 * jetzt" — als laufende Stunde gelesen, damit Slider 5 min zurück und Slider „jetzt" dieselbe Stunde zeigen); `past`
 * sagt es der Legende. Stundengrenzen in UTC = in Mitteleuropa (volle Stunden fallen gleich).
 */
export function chanceHourAt(tMs: number, nowMs: number): { fromMs: number; toMs: number; past: boolean } {
  const running = Math.floor(nowMs / H) * H;
  const hour = Math.floor(tMs / H) * H;
  if (hour < running) return { fromMs: running, toMs: running + H, past: true };
  return { fromMs: hour, toMs: hour + H, past: false };
}

// --- Wörter -------------------------------------------------------------------------------------------

/** Prozent auf 5 gerundet; die Ränder ehrlich: „< 5 %" statt 0, „> 95 %" statt 100. */
export function fmtChancePct(p: number): string {
  if (!(p >= 0)) return '–';
  if (p < 0.05) return '< 5 %';
  if (p > 0.95) return '> 95 %';
  return `${Math.round(p * 20) * 5} %`;
}

function hh(ms: number): number {
  const s = new Date(ms).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false });
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n % 24 : new Date(ms).getHours();
}
function dayKey(ms: number): string {
  return new Date(ms).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
}

/** „heute", „morgen", sonst Wochentag (Europe/Berlin). */
export function chanceDayWord(ms: number, nowMs: number): string {
  if (dayKey(ms) === dayKey(nowMs)) return 'heute';
  if (dayKey(ms) === dayKey(nowMs + 24 * H)) return 'morgen';
  return new Date(ms).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long' });
}

/** „14–15 Uhr", Mitternacht als „24" am Ende. */
export function fmtHourSpan(fromMs: number, toMs: number): string {
  const a = hh(fromMs), b = hh(toMs);
  return `${a}–${b === 0 ? 24 : b} Uhr`;
}

/** Hauptwort der Schwelle im Satz. */
export function thresholdNoun(t: ChanceThreshold): string {
  return t === 'any' ? 'Regen' : `Regen ${CHANCE_THRESHOLD_LABEL[t]}`;
}

/**
 * Der Satz am Ort: „Regen heute 14–15 Uhr: 70 % wahrscheinlich" — das Intervall ist das des Schritts (3-h-Werte der Stufe t2
 * nennen ihr ganzes Intervall), nie eine verrechnete Fensterwahrscheinlichkeit.
 */
export function chanceSentence(t: ChanceThreshold, p: number, stepFromMs: number, stepToMs: number, nowMs: number): string {
  const day = chanceDayWord(stepFromMs, nowMs);
  return `${thresholdNoun(t)} ${day} ${fmtHourSpan(stepFromMs, stepToMs)}: ${fmtChancePct(p)} wahrscheinlich`;
}

/** „Lauf 06 UTC". */
export function fmtRunUtcShort(ms: number): string {
  return `Lauf ${String(new Date(ms).getUTCHours()).padStart(2, '0')} UTC`;
}
