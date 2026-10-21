/**
 * Regeln des Dashboards (Phase DB) — alles, was die Vorlage zeigt, aber nicht festlegt (audit/dashboard.md §6.6).
 *
 * Provenienz jeder Regel: `set` = hier gesetzt, aus den gezeichneten Beispielen der Vorlage abgeleitet (Jans
 * Entscheidung 29.09.: „streng aus Bausteinen ableiten"); `literature` = mit Quelle. Keine Regel erfindet einen
 * Wert — sie ordnen, fassen zusammen oder beschriften Werte der Fusion bzw. der Alternativquellen.
 */
import type { IconKind } from './types';
import { confidenceClassOf, confidenceTypicalError, confidenceWordOf } from '../../pointForecast/fusion/confidenceClasses';

const NBSP_R = ' ';

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

/**
 * Intensitätsklassen des Regens (literature/set: untere Grenzen 0,1 mm/h Nachweis · 0,5 Nieseln→leicht · 2,5 leicht→mäßig
 * (DWD-Intensitätsstufen) · 10 mäßig→stark). Index = Klasse; die Detailansicht des Nowcasts färbt und benennt danach.
 */
export const RAIN_CLASSES: ReadonlyArray<{ label: string; min: number }> = [
  { label: 'trocken', min: 0 }, { label: 'Nieseln', min: DRY_MMH }, { label: 'leicht', min: 0.5 }, { label: 'mäßig', min: 2.5 }, { label: 'stark', min: 10 },
];
export function rainClass(mmh: number | null): number {
  if (mmh == null) return 0;
  let c = 0;
  RAIN_CLASSES.forEach((k, i) => { if (mmh >= k.min) c = i; });
  return c;
}

/** Regen-Summe blau hervorheben ab 1 mm/Tag (set; Vorlage: 0,2 mm schwarz, 4,1/11,6 mm blau). */
export const WET_DAY_MM = 1;

/** Farbe/Gewicht der Niederschlagswahrscheinlichkeit (set; Vorlage: ≤ 5 % hell, sonst Stahlblau, ab 60 % fett). */
export function popLevel(p: number | null): 'faint' | 'mid' | 'high' {
  if (p == null) return 'faint';
  if (p <= 0.05) return 'faint';
  return p >= 0.6 ? 'high' : 'mid';
}

/**
 * Konfidenz-Klasse der Temperatur (E-KF-3): „good" = solide oder hoch nach der Klassentabelle des Motors
 * (`confidenceClasses.ts`, Schwellen = Score-Perzentile am Archiv, Provenienz `archive`) — nicht mehr die Vorlagenzahl 0,7.
 */
export function confidenceClass(score: number | null): 'good' | 'fair' {
  return confidenceClassOf('t2m', score);
}

/** Einstufung des Konfidenz-Werts der Temperatur (E-KF-3, Klassentabelle des Motors). Kein Wahrscheinlichkeitsmaß (uncertainty.ts). */
export function confidenceWord(score: number | null): string | null {
  return confidenceWordOf('t2m', score);
}

/** E-KF-4: der gemessene typische Fehler der Klasse („±0,8 °C") — was das Wort am Archiv bedeutet. */
export function confidenceTypical(score: number | null): string | null {
  const t = confidenceTypicalError('t2m', score);
  return t == null ? null : `typisch ±${t.value.toFixed(1).replace('.', ',')}${NBSP_R}°C`;
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

// ---------------------------------------------------------------------------
// Jan 17.10.: Gelände am Punkt (Terrain-Feld, P97) — Wörter zu den Kennwerten von `v2.point.terrain` (set)
// ---------------------------------------------------------------------------

/** Geländelage aus dem Topographic Position Index (m über dem Mittel der Umgebung; 500 m und 2 km Radius). */
export function tpiWord(tpi500: number | null, tpi2000: number | null): string | null {
  const a = tpi500, b = tpi2000;
  if (a == null && b == null) return null;
  const x = a ?? b!, y = b ?? a!;
  if (x >= 40 && y >= 60) return 'Kuppe / Gipfel';
  if (x >= 25 || y >= 40) return 'Rücken / Oberhang';
  if (x <= -40 && y <= -60) return 'Talgrund';
  if (x <= -25 || y <= -40) return 'Mulde / Unterhang';
  return 'Ebene / Mittelhang';
}

/** Himmelssicht (Sky-View-Factor 0…1) in Worten. */
export function svfWord(svf: number | null): string | null {
  if (svf == null) return null;
  if (svf >= 0.97) return 'freier Horizont';
  if (svf >= 0.9) return 'weitgehend frei';
  if (svf >= 0.75) return 'teils verdeckt';
  return 'stark eingeengt';
}

/** Oberfläche aus Rauigkeitslänge z0 (m) und Versiegelung (%). */
export function surfaceWord(z0: number | null, imperv: number | null): string | null {
  if (imperv != null && imperv >= 50) return 'dicht bebaut';
  if (imperv != null && imperv >= 20) return 'Siedlung';
  if (z0 == null) return imperv != null ? 'offen' : null;
  if (z0 >= 0.5) return 'Wald / hohe Bebauung';
  if (z0 >= 0.1) return 'Gehölz / locker bebaut';
  if (z0 >= 0.03) return 'Acker / Wiese';
  return 'glatt (Wasser, Schnee, Flachland)';
}

/** Kaltluftmulde: Tiefe der Senke (m) in Worten — ab 5 m sammelt sich nachts Kaltluft. */
export function sinkWord(depthM: number | null): string | null {
  if (depthM == null) return null;
  if (depthM >= 30) return 'tiefe Mulde — nachts Kaltluftsee, Frost und Nebel begünstigt';
  if (depthM >= 10) return 'Mulde — nachts Kaltluft sammelt sich';
  if (depthM >= 5) return 'leichte Senke — nachts etwas kühler';
  return 'keine Senke — Kaltluft fließt ab';
}
