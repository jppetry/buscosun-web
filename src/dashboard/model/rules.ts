/**
 * Regeln des Dashboards (Phase DB) — alles, was die Vorlage zeigt, aber nicht festlegt (audit/dashboard.md §6.6).
 *
 * Provenienz jeder Regel: `set` = hier gesetzt, aus den gezeichneten Beispielen der Vorlage abgeleitet (Jans
 * Entscheidung 29.09.: „streng aus Bausteinen ableiten"); `literature` = mit Quelle. Keine Regel erfindet einen
 * Wert — sie ordnen, fassen zusammen oder beschriften Werte der Fusion bzw. der Alternativquellen.
 */
import type { IconKind } from './types';

/** Tagesphasen (set): Morgen 06–12, Mittag 12–18, Abend 18–24, Nacht 00–06 des FOLGETAGS (die Nacht nach dem Abend). */
export const PHASES = Object.freeze([
  { id: 'MORGEN', from: 6, to: 12, nextDay: false },
  { id: 'MITTAG', from: 12, to: 18, nextDay: false },
  { id: 'ABEND', from: 18, to: 24, nextDay: false },
  { id: 'NACHT', from: 0, to: 6, nextDay: true },
] as const);
export type PhaseId = typeof PHASES[number]['id'];

/**
 * Böen-Hervorhebung (literature): DWD-Warnkriterium „Windböen" ab 50 km/h ≈ 14 m/s (Bft 7). Eine Phase mit Böen
 * ≥ 14 m/s zeigt „Böen N" statt des Mittelwinds und wird hervorgehoben (Vorlage: ABEND · „Böen 17").
 */
export const GUST_WARN_MS = 14;

/** Messbarer Niederschlag (literature: 0,1 mm/h, WMO-Nachweisgrenze) — Schwelle für „trocken" und für Balken. */
export const DRY_MMH = 0.1;

/**
 * Starker Niederschlag (literature: DWD-Intensitätsstufen, Grenze leicht/mäßig 2,5 mm/h) — Balken violett
 * (Vorlage: der höchste Balken im Stundenverlauf und im Nowcast ist #9B8CE0).
 */
export const HEAVY_MMH = 2.5;

/** Regen-Summe blau hervorheben ab 1 mm/Tag (set; Vorlage: 0,2 mm schwarz, 4,1/11,6 mm blau). */
export const WET_DAY_MM = 1;

/** Farbe/Gewicht der Niederschlagswahrscheinlichkeit (set; Vorlage: ≤ 5 % hell, sonst Stahlblau, ab 60 % fett). */
export function popLevel(p: number | null): 'faint' | 'mid' | 'high' {
  if (p == null) return 'faint';
  if (p <= 0.05) return 'faint';
  return p >= 0.6 ? 'high' : 'mid';
}

/** Konfidenz-Klasse (set; Vorlage: 86/74 % grün, 61 % ocker). */
export function confidenceClass(score: number | null): 'good' | 'fair' {
  return score != null && score >= 0.7 ? 'good' : 'fair';
}

/** Einstufung des Konfidenz-Werts (set; Vorlage „82 % · solide"). Kein Wahrscheinlichkeitsmaß (uncertainty.ts). */
export function confidenceWord(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 0.9) return 'hoch';
  if (score >= 0.7) return 'solide';
  if (score >= 0.5) return 'mäßig';
  return 'unsicher';
}

/**
 * Symbolregel (set; aus den 15 gezeichneten Symbolen der Vorlage abgeleitet):
 *  - Wahrscheinlichkeit ≥ 50 % ⇒ Regenwolke; Tropfen nach der stärksten Stunde: < 1 mm/h 1, < 2,5 mm/h 2, sonst 3
 *  - sonst nach der mittleren Gesamtbewölkung: < 20 % Sonne/Mond, < 60 % Sonne/Mond mit Wolke, sonst Wolke
 *  - Nacht ⇒ Mond statt Sonne; dunkle Wolke bei 3 Tropfen oder bei Wolke ohne Tropfen und ≥ 40 %
 */
export function symbolFor(a: { clct: number | null; popMax: number | null; mmhMax: number | null; night: boolean }): { kind: IconKind; drops?: 1 | 2 | 3; dark?: boolean } | null {
  if (a.clct == null && a.popMax == null) return null;
  const pop = a.popMax ?? 0;
  if (pop >= 0.5 && (a.mmhMax ?? 0) >= DRY_MMH) {
    const mm = a.mmhMax ?? 0;
    const drops: 1 | 2 | 3 = mm < 1 ? 1 : mm < HEAVY_MMH ? 2 : 3;
    return { kind: 'rain', drops, dark: drops === 3 };
  }
  const c = a.clct ?? 0;
  if (c < 20) return { kind: a.night ? 'moon' : 'sun' };
  if (c < 60) return { kind: a.night ? 'moonCloud' : 'sunCloud' };
  return { kind: 'cloud', dark: pop >= 0.4 };
}

/**
 * Tagestext (set; aus „heiter, später auflockernd" · „wechselnd bewölkt, Schauer" · „Regen, kühler, Schneegrenze
 * sinkt" abgeleitet). Höchstens drei Teile: Grundwort, Niederschlag, Tendenz.
 */
export function dayText(a: {
  clctDay: number | null; clctMorning: number | null; clctAfternoon: number | null;
  rainSum: number | null; popMax: number | null; snowShare: number | null;
  tmaxDelta: number | null; snowlineDrop: number | null;
}): string | null {
  if (a.clctDay == null && a.rainSum == null) return null;
  const parts: string[] = [];
  const rain = a.rainSum ?? 0;
  const pop = a.popMax ?? 0;
  const snow = (a.snowShare ?? 0) >= 0.5;
  if (rain >= 5 && pop >= 0.7) parts.push(snow ? 'Schnee' : 'Regen');
  else {
    const c = a.clctDay ?? 0;
    parts.push(c < 20 ? 'sonnig' : c < 45 ? 'heiter' : c < 75 ? 'wechselnd bewölkt' : 'bedeckt');
    if (rain >= 0.5 && pop >= 0.4) parts.push(snow ? 'Schneeschauer' : 'Schauer');
  }
  if (a.tmaxDelta != null && a.tmaxDelta <= -3) parts.push('kühler');
  else if (a.tmaxDelta != null && a.tmaxDelta >= 3) parts.push('wärmer');
  if (a.snowlineDrop != null && a.snowlineDrop >= 300) parts.push('Schneegrenze sinkt');
  else if (parts.length < 3 && a.clctMorning != null && a.clctAfternoon != null) {
    if (a.clctMorning - a.clctAfternoon >= 25) parts.push('später auflockernd');
    else if (a.clctAfternoon - a.clctMorning >= 25) parts.push('später bewölkt');
  }
  return parts.slice(0, 3).join(', ');
}

/**
 * Schneegrenze statt Böen in der Tageskarte (set; Vorlage Tag 3): Tag mit Regen ≥ 1 mm, kleinste Schneegrenze
 * unter Ortshöhe + 1 000 m und keine Warnung am Tag.
 */
export function snowlineShown(a: { rainSum: number | null; snowlineMin: number | null; hOrt: number | null; warn: boolean }): boolean {
  return !a.warn && (a.rainSum ?? 0) >= WET_DAY_MM && a.snowlineMin != null && a.hOrt != null && a.snowlineMin < a.hOrt + 1000;
}

/**
 * Streuungs-Text (set; Vorlage „Ensemble vollständig (< 78 h)"): woher die Bandbreite der Temperatur an der ersten
 * Stunde kommt (`sigmaKind` der Fusion) und bis zu welchem Vorlauf ohne Wechsel. In der Stufe fs ist sie gelernt.
 */
export function spreadText(kind: string | null, reachH: number | null, rangeH: number): string {
  const until = reachH == null ? '' : ` bis ${reachH} h`;
  switch (kind) {
    case 'ensemble': return reachH == null ? `Ensemble vollständig (< ${rangeH + 6} h)` : `Ensemble${until}`;
    case 'learned': return `Streuung gelernt${until}`;
    case 'divergence': return `Streuung aus Modellunterschied${until}`;
    case 'sys-only': case 'set': return `Streuung gesetzt${until}`;
    default: return 'ohne Streuung';
  }
}

/** UV-Farbe (set, Stufen nach WHO-Klassen; Vorlage: 4 #D6D24E, 5 #E9A33C, 6 #D4632E). */
export function uvColor(uv: number): string {
  if (uv <= 2) return '#7A9466';
  if (uv <= 4) return '#D6D24E';
  if (uv <= 5) return '#E9A33C';
  if (uv <= 7) return '#D4632E';
  if (uv <= 10) return '#A32B1E';
  return '#9B8CE0';
}
/** UV-Balkenhöhe in % (set; Vorlage: 5 ⇒ 62 %, 6 ⇒ 78 %, 4 ⇒ 50 % ⇒ 12,5 % je Stufe, gedeckelt). */
export function uvBarPct(uv: number): number {
  return Math.max(4, Math.min(100, Math.round(uv * 12.5)));
}

/**
 * Pollen-Farbe (set; DWD-Gefahrenindex 0 … 3 in Halbstufen, Vorlage: neutral / grün / amber / rot):
 * 0 keine · 0–1, 1 gering · 1–2, 2 mittel · 2–3, 3 hoch.
 */
export function pollenColor(level: number | null): string {
  if (level == null || level <= 0) return '#E0D6BE';
  if (level <= 1) return '#7A9466';
  if (level <= 2) return '#E9A33C';
  return '#A32B1E';
}

/** Gewitterpotenzial-Wort (set; Index 0–100 des Layers F1, Viertel). */
export function thunderWord(score: number | null): string | null {
  if (score == null) return null;
  if (score < 25) return 'gering';
  if (score < 50) return 'mäßig';
  if (score < 75) return 'erhöht';
  return 'hoch';
}

/** Isothermen (set): Vielfache von 4 °C mit Rest 2 (… 2, 6, 10, 14, 18 …), die ≥ 150 m über dem Ort und unter der Achsenobergrenze − 150 m liegen. */
export function isotherms(tOrt: number, hOrt: number, gammaKperKm: number, topM: number): Array<{ t: number; h: number }> {
  if (!(gammaKperKm > 0.5)) return [];
  const out: Array<{ t: number; h: number }> = [];
  const tTop = tOrt - (gammaKperKm * (topM - hOrt)) / 1000;
  for (let t = Math.ceil((tTop - 2) / 4) * 4 + 2; t <= tOrt; t += 4) {
    const h = hOrt + ((tOrt - t) / gammaKperKm) * 1000;
    if (h >= hOrt + 150 && h <= topM - 150) out.push({ t, h });
  }
  return out.sort((a, b) => b.h - a.h);
}

/** Temperatur in der Höhe h mit EINEM Gradienten (Vorlage: „Zwischenwerte folgen dem einen Gradienten"). */
export function tempAt(tOrt: number, hOrt: number, gammaKperKm: number, h: number): number {
  return tOrt - (gammaKperKm * (h - hOrt)) / 1000;
}

/** Isothermenfarbe (set; Vorlage 6 °C #5B9BD5, 10 °C #7A9466, 14 °C #C99A4E). */
export function isothermColor(t: number): string {
  if (t <= 2) return '#3A6FA8';
  if (t <= 6) return '#5B9BD5';
  if (t <= 10) return '#7A9466';
  if (t <= 14) return '#C99A4E';
  if (t <= 18) return '#D4A373';
  return '#C97B47';
}

/** Einordnung des Gradienten (set; Standardatmosphäre 6,5 K/km). */
export function gammaWord(g: number): string {
  if (g >= 7) return 'steil';
  if (g >= 5.5) return 'normal';
  if (g >= 0) return 'flach';
  return 'umgekehrt';
}

// ---------------------------------------------------------------------------
// E-DB-23 (audit/dashboard.md §12): Bandbreiten-Marken und Leitsatz
// ---------------------------------------------------------------------------

/** Schwellen der halben 80 %-Bandbreite der Temperatur (K), ab denen Marken gesetzt werden (set). */
export const BAND_MARK_K: readonly number[] = Object.freeze([2, 3, 4]);

/** Erste Stunde je Schwelle, an der die halbe Bandbreite sie erreicht (set). Eingabe zeitlich sortiert. */
export function bandMarks(pts: ReadonlyArray<{ t: number; half: number | null }>, limits: readonly number[] = BAND_MARK_K): Array<{ t: number; k: number }> {
  const out: Array<{ t: number; k: number }> = [];
  for (const k of limits) {
    const p = pts.find((x) => x.half != null && x.half >= k);
    if (p) out.push({ t: p.t, k });
  }
  return out;
}

export interface LeadDay { name: string; text: string | null; tmax: string | null; rain: number | null; rainText: string | null }

/**
 * Leitsatz über den Tageskarten (set), aus denselben Tagesdaten wie die Karten — er kann ihnen nicht widersprechen:
 * „Heute {Tagestext}, bis {Tmax}." und danach der erste nasse Tag (Regen ≥ WET_DAY_MM) von morgen/übermorgen mit
 * Tagestext und Menge, sonst morgen mit Tagestext und Tmax. Ohne Tagestext und Tmax für heute: kein Satz.
 */
export function leadSentence(days: readonly LeadDay[]): string | null {
  const [d0, ...next] = days;
  if (!d0 || (d0.text == null && d0.tmax == null)) return null;
  const part = (d: LeadDay, tail: string | null) => [d.name, d.text].filter(Boolean).join(' ') + (tail ? `${d.text ? ',' : ''} ${tail}` : '') + '.';
  const out = [part(d0, d0.tmax ? `bis ${d0.tmax}` : null)];
  const wet = next.slice(0, 2).find((d) => (d.rain ?? 0) >= WET_DAY_MM && d.rainText);
  const d1 = next[0];
  if (wet) out.push(part(wet, wet.rainText));
  else if (d1 && (d1.text || d1.tmax)) out.push(part(d1, d1.tmax ? `bis ${d1.tmax}` : null));
  return out.join(' ');
}
