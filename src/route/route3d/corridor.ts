/**
 * R3D · Zeitkorridor (pur, DOM-frei, headless prüfbar) — Vorlage `reference/1b-zeitkorridor-*`.
 *
 * 1a fragt „wie sieht es bei km X aus", 1b fragt **„wo bin ich um Uhrzeit T"**.
 * Dieselbe Szene, umgekehrte Führungsachse — und vier zusätzliche Aussagen:
 * Wetterperlen zur ETA, das getroffene Regenfenster, die Zeitfenster-Liste und
 * die Empfehlung einer besseren Startzeit.
 *
 * **Was hier bewusst NICHT entsteht** (`audit/route-3d.md` §13.3):
 *
 *  – **B10** — eine Zellgeschwindigkeit über Grund („Zug 32 km/h") und die
 *    gestrichelte Zellellipse der Vorlage. Der Radar-Sampler exponiert einen
 *    Punktabgriff, keine Bilder; eine Zuggeschwindigkeit bräuchte Zellverfolgung
 *    (KONRAD3D, DE-only, nur konvektiv) oder eine Kreuzkorrelation, die es hier
 *    nicht gibt. Was das Radarprodukt dagegen **selbst** schon extrapoliert hat,
 *    steht an jedem Sample: welcher Abschnitt zu welcher Zeit nass ist. Genau das
 *    ist `rainWindows` — die Aussage, die der Nutzer sucht, ohne die erfundene.
 *
 *  – **B8** — eine „Treffer-Wahrscheinlichkeit". Die Punkt-Kette führt nirgends
 *    eine Niederschlagswahrscheinlichkeit. An ihrer Stelle steht `startAdvice`
 *    auf `StartWindowEntry[]`: gerechnete Regenminuten je Startzeit, keine
 *    Prozentzahl.
 *
 * Die Zeitformatierung ist hier lokal (`hhmm`), damit das Modul JSX-frei bleibt
 * und der Verifier es unter `--experimental-strip-types` importieren kann.
 */

import type { StartWindowEntry, RadarHorizon } from '../../pointForecast/weatherEnrichment';
import { RAIN_MIN_MMH, segmentEdges, type SceneColumn, type WarnZone } from './model';

/* ============================ Regenfenster ============================ */

export interface RainWindow {
  fromM: number;
  toM: number;
  fromMs: number;
  toMs: number;
  peakMmH: number;
  /** Woher die Werte des Fensters kamen — Radar und Modell sind nicht dasselbe. */
  source: 'radar' | 'nwp' | 'gemischt';
  type: 'rain' | 'sleet' | 'snow';
}

/**
 * Zusammenhängende nasse Abschnitte entlang der Strecke — je Fenster der
 * km-Bereich UND das Zeitfenster, in dem man ihn nach dem eigenen Fahrplan
 * durchquert. Beides ist dieselbe Diagonale (km ↔ ETA), nicht zwei Aussagen.
 *
 * Ein Sample steht für seine **Umgebung**, nicht für einen Punkt: das Fenster
 * reicht deshalb bis zur Mitte zum jeweils trockenen Nachbarn. Ohne diese
 * Ausdehnung hätte ein einzelnes nasses Sample die Ausdehnung null — im
 * Browser gesehen als „22:24–22:24 · km 0,0–0,0" und als blauer Abschnitt,
 * der gar nicht gezeichnet wurde. An den Streckenenden gibt es keinen
 * Nachbarn; dort bleibt die Kante, wo sie ist.
 */
export function rainWindows(columns: SceneColumn[]): RainWindow[] {
  const out: RainWindow[] = [];
  let from = -1;

  const flush = (to: number) => {
    if (from < 0) return;
    let peak = 0;
    let radar = 0;
    let nwp = 0;
    const types = new Map<string, number>();
    for (let i = from; i <= to; i++) {
      const c = columns[i];
      const mm = c.precipMmH ?? 0;
      if (mm > peak) peak = mm;
      if (c.precipSource === 'radar') radar++;
      else if (c.precipSource === 'nwp') nwp++;
      if (c.precipType !== 'none') types.set(c.precipType, (types.get(c.precipType) ?? 0) + 1);
    }
    let type: RainWindow['type'] = 'rain';
    let best = 0;
    for (const [t, n] of types) if (n > best) { best = n; type = t as RainWindow['type']; }
    // Die Kantenregel ist geteilt (§17.3 C10) — sie steht in `model.ts`.
    const e = segmentEdges(columns, from, to);
    out.push({
      fromM: e.fromM,
      toM: e.toM,
      fromMs: e.fromMs,
      toMs: e.toMs,
      peakMmH: Math.round(peak * 10) / 10,
      source: radar > 0 && nwp > 0 ? 'gemischt' : radar > 0 ? 'radar' : 'nwp',
      type,
    });
    from = -1;
  };

  for (let i = 0; i < columns.length; i++) {
    if ((columns[i].precipMmH ?? 0) >= RAIN_MIN_MMH) { if (from < 0) from = i; }
    else flush(i - 1);
  }
  flush(columns.length - 1);
  return out;
}

/** Das Fenster, in dem eine Position liegt — `null`, wenn dort trocken ist. */
export function windowAtDist(windows: RainWindow[], distM: number): RainWindow | null {
  for (const w of windows) if (distM >= w.fromM && distM <= w.toM) return w;
  return null;
}

/** Das nächste Fenster, das nach dieser Position noch kommt. */
export function nextWindow(windows: RainWindow[], distM: number): RainWindow | null {
  for (const w of windows) if (w.fromM > distM) return w;
  return null;
}

/* ============================ Wetterperlen ============================ */

export type PearlKind = 'start' | 'hour' | 'goal';

/** Mindestabstand zweier Perlen als Anteil der Streckenlänge. */
export const PEARL_MIN_GAP = 0.07;

export interface Pearl {
  kind: PearlKind;
  atMs: number;
  distM: number;
  col: SceneColumn;
}

/**
 * Perlen zur ETA: Start, jede volle Stunde dazwischen, Ziel. Die Vorlage zeigt
 * genau dieses Raster („08:30 · km 0", „09:30 · km 5,4", …, „12:14 · Ziel").
 * Passen nicht alle in die Breite, werden die **Stunden** ausgedünnt — Start
 * und Ziel bleiben immer, weil sie die Ränder der Aussage sind.
 *
 * `minGapFrac` ist eine **Zeichen**-Auflage, keine fachliche: in der Szene
 * dürfen sich zwei Karten nicht decken. Die Zeitfenster-Liste ruft deshalb mit
 * 0 auf — dort wäre eine fehlende Stunde eine unbeantwortete Frage („wo bin ich
 * um 01:00?"), gerade wenn eine lange Pause die Position kaum bewegt.
 */
export function buildPearls(columns: SceneColumn[], maxCount = 6, minGapFrac = PEARL_MIN_GAP): Pearl[] {
  if (columns.length === 0) return [];
  const first = columns[0];
  const last = columns[columns.length - 1];
  const hours: Pearl[] = [];

  // Mindestabstand: eine Stundenperle direkt neben Start oder Ziel deckt deren
  // Karte zu (im Browser gesehen: „22:00 · km 0,5" lag auf „21:50 · km 0,0").
  // Die Zeit ist trotzdem richtig — sie steht dann in der Zeitfenster-Liste.
  const total = Math.max(1, last.distM - first.distM);
  const minGapM = total * minGapFrac;

  const HOUR = 3_600_000;
  let t = Math.ceil(first.etaMs / HOUR) * HOUR;
  for (; t < last.etaMs; t += HOUR) {
    const col = columnAtEta(columns, t);
    if (!col) continue;
    // Zwei Regeln, verschiedene Gründe: die Spalte muss eine ANDERE sein
    // (sonst steht dieselbe Zeile zweimal — im Browser gesehen: "21:57 Start"
    // und "21:57 km 0,0"), und in der Szene braucht sie zusätzlich Abstand.
    if (col.index === first.index || col.index === last.index) continue;
    if (col.distM - first.distM < minGapM || last.distM - col.distM < minGapM) continue;
    const prev = hours[hours.length - 1];
    if (prev && (prev.col.index === col.index || col.distM - prev.distM < minGapM)) continue;
    hours.push({ kind: 'hour', atMs: col.etaMs, distM: col.distM, col });
  }

  const room = Math.max(0, maxCount - 2);
  const kept = thin(hours, room);
  return [
    { kind: 'start', atMs: first.etaMs, distM: first.distM, col: first },
    ...kept,
    { kind: 'goal', atMs: last.etaMs, distM: last.distM, col: last },
  ];
}

/** Gleichmäßig ausdünnen — nie die Ränder, immer den Abstand erhalten. */
function thin<T>(items: T[], keep: number): T[] {
  if (items.length <= keep) return items;
  if (keep <= 0) return [];
  const out: T[] = [];
  const stride = items.length / keep;
  for (let i = 0; i < keep; i++) out.push(items[Math.min(items.length - 1, Math.round(i * stride))]);
  return out;
}

/** Spalte, deren ETA einer Uhrzeit am nächsten liegt. */
export function columnAtEta(columns: SceneColumn[], etaMs: number): SceneColumn | null {
  if (columns.length === 0) return null;
  let best = columns[0];
  let bd = Math.abs(best.etaMs - etaMs);
  for (const c of columns) {
    const d = Math.abs(c.etaMs - etaMs);
    if (d < bd) { best = c; bd = d; }
  }
  return best;
}

/* ============================ Zeitfenster ============================ */

export type Tone = 'ok' | 'watch' | 'alert';

export interface TimelineRow {
  atMs: number;
  distM: number;
  /** Kurztext — trägt die Aussage allein, Farbe ist nur Beiwerk (Ehrlichkeit). */
  text: string;
  tone: Tone;
  kind: PearlKind;
}

/** Böen-Schwellen (km/h), an denen sich die Aussage ändert. */
export const GUST_WATCH_KMH = 45;
export const GUST_ALERT_KMH = 60;
/** Ab dieser Rate ist Regen kein Beiwerk mehr (mm/h). */
export const RAIN_ALERT_MMH = 4;

/**
 * Die Liste „Dein Zeitfenster". Eine Zeile je Perle, Priorität von oben:
 * amtliche Warnung → Regen → Böen → Bewölkung/Wind. Jede Zeile sagt es in
 * Worten; der Farbpunkt daneben wiederholt nur, was dort schon steht.
 */
export function buildTimeline(
  pearls: Pearl[],
  windows: RainWindow[],
  warnZones: WarnZone[],
): TimelineRow[] {
  return pearls.map((p) => {
    const c = p.col;
    // 1b fragt „wo bin ich um Uhrzeit T" — die Zeile muss den Ort nennen,
    // sonst beantwortet sie nur die halbe Frage. Nennt der Text ohnehin einen
    // km-Bereich (Regenfenster), wäre die Position davor eine Wiederholung.
    const edge = p.kind === 'start' ? 'Start · ' : p.kind === 'goal' ? 'Ankunft · ' : null;
    const here = `km ${km(c.distM)} · `;
    const prefix = edge ?? here;
    const warn = warnZones.find(
      (z) => c.distM >= z.fromM && c.distM <= z.toM && c.etaMs >= z.fromMs && c.etaMs <= z.toMs,
    );
    if (warn) {
      return { atMs: p.atMs, distM: p.distM, kind: p.kind, tone: 'alert' as Tone, text: `${prefix}${warn.event} · amtliche Warnung` };
    }

    const w = windowAtDist(windows, c.distM);
    if (w) {
      const word = w.type === 'snow' ? 'Schnee' : w.type === 'sleet' ? 'Schneeregen' : 'Regen';
      // Zwei Stunden im selben Fenster ergaben sonst zweimal exakt denselben
      // Text (im Browser gesehen). Die Position vorn unterscheidet sie und
      // beantwortet die Frage der Ansicht; das Fenster steht dahinter.
      const range = `km ${km(w.fromM)}–${km(w.toM)}`;
      return {
        atMs: p.atMs, distM: p.distM, kind: p.kind,
        tone: w.peakMmH >= RAIN_ALERT_MMH ? 'alert' : 'watch',
        text: edge ? `${edge}${word} (${range})` : `${here}${word} (${range})`,
      };
    }

    const gust = c.gustKmh ?? 0;
    if (gust >= GUST_ALERT_KMH) {
      return { atMs: p.atMs, distM: p.distM, kind: p.kind, tone: 'alert' as Tone, text: `${prefix}Böen über ${GUST_ALERT_KMH} km/h` };
    }
    if (gust >= GUST_WATCH_KMH) {
      return { atMs: p.atMs, distM: p.distM, kind: p.kind, tone: 'watch' as Tone, text: `${prefix}Böen nehmen zu · ${Math.round(gust)} km/h` };
    }

    const parts = [skyWord(c.cloudCoverPct), windWord(c)].filter(Boolean);
    const text = parts.length ? `${prefix}${parts.join(', ')}` : `${prefix}keine Auffälligkeit`;
    return { atMs: p.atMs, distM: p.distM, kind: p.kind, tone: 'ok' as Tone, text };
  });
}

function skyWord(pct: number | null): string {
  if (pct == null) return 'trocken';
  if (pct < 25) return 'klar';
  if (pct < 60) return 'wechselnd bewölkt';
  if (pct < 90) return 'stark bewölkt';
  return 'bedeckt';
}

function windWord(c: SceneColumn): string {
  if (c.windRel === 'tail') return 'Rückenwind';
  if (c.windRel === 'head') return 'Gegenwind';
  if (c.windRel === 'cross') return 'Seitenwind';
  return '';
}

/* ============================ Bessere Startzeit ============================ */

export interface StartAdvice {
  offsetMin: number;
  newStartMs: number;
  wetMinNow: number;
  wetMinNew: number;
  peakNowMmH: number;
  peakNewMmH: number;
  /** Vergleich der Böenspitze — nur als Wort, die Zahl ist nicht höhenkorrigiert. */
  gustWord: 'unverändert' | 'schwächer' | 'stärker';
  /** Ein Satz, der die Empfehlung trägt — ohne Farbe, ohne Superlativ. */
  reason: string;
}

/** Ab dieser Ersparnis lohnt die Empfehlung (min) — darunter ist sie Rauschen. */
export const ADVICE_MIN_GAIN_MIN = 10;
/** Unterschied der Böenspitze, ab dem das Wort wechselt (m/s). */
const GUST_SAME_MPS = 1;

/**
 * Die beste Startzeit im bewerteten Fenster — oder `null`, wenn keine spürbar
 * besser ist. Verglichen wird zuerst die Zeit im Regen, dann die Menge, dann
 * der Abstand zur geplanten Zeit: bei gleichem Ergebnis gewinnt die Zeit, die
 * am wenigsten am Plan rüttelt.
 */
export function startAdvice(entries: StartWindowEntry[], startMs: number): StartAdvice | null {
  const base = entries.find((e) => e.offsetMin === 0 && e.complete);
  if (!base) return null;
  const cands = entries.filter((e) => e.offsetMin !== 0 && e.complete);
  if (cands.length === 0) return null;

  let best = cands[0];
  for (const e of cands) {
    if (e.wetMin < best.wetMin) { best = e; continue; }
    if (e.wetMin > best.wetMin) continue;
    if (e.totalMm < best.totalMm - 0.05) { best = e; continue; }
    if (e.totalMm > best.totalMm + 0.05) continue;
    if (Math.abs(e.offsetMin) < Math.abs(best.offsetMin)) best = e;
  }

  const gain = base.wetMin - best.wetMin;
  const worthwhile = gain >= ADVICE_MIN_GAIN_MIN || (base.wetMin > 0 && best.wetMin === 0);
  if (!worthwhile) return null;

  const dg = best.peakGustMps - base.peakGustMps;
  const gustWord: StartAdvice['gustWord'] =
    Math.abs(dg) < GUST_SAME_MPS ? 'unverändert' : dg < 0 ? 'schwächer' : 'stärker';

  const newStartMs = startMs + best.offsetMin * 60_000;
  // Deckt der Vergleich nicht die ganze Strecke, steht das im Satz — sonst
  // klänge eine Empfehlung sicherer, als sie ist.
  const cover = Math.min(base.coverage, best.coverage);
  const gap = cover < 0.995
    ? ` Für ${Math.round((1 - cover) * 100)} % der Strecke liegt in diesem Fenster kein Wert vor.`
    : '';
  const reason =
    `Start um ${hhmm(newStartMs)} statt ${hhmm(startMs)}: ${best.wetMin} statt ${base.wetMin} Minuten im Regen, ` +
    `Spitze ${num(base.peakMmH)} → ${num(best.peakMmH)} mm/h, Böen ${gustWord}. ` +
    `Gerechnet mit denselben Fahrzeiten — nach dem Übernehmen rechnen wir sie neu.${gap}`;

  return {
    offsetMin: best.offsetMin,
    newStartMs,
    wetMinNow: base.wetMin,
    wetMinNew: best.wetMin,
    peakNowMmH: base.peakMmH,
    peakNewMmH: best.peakMmH,
    gustWord,
    reason,
  };
}

/** Der Satz, wenn es keine Empfehlung gibt — er sagt, was geprüft wurde. */
export function startAdviceNote(entries: StartWindowEntry[]): string {
  const usable = entries.filter((e) => e.complete);
  if (usable.length === 0) {
    const best = entries.reduce((a, b) => (b.coverage > a.coverage ? b : a), entries[0]);
    const pct = best ? Math.round(best.coverage * 100) : 0;
    return `Andere Startzeiten lassen sich nicht vergleichen — die Quellen decken im verschobenen Fenster nur ${pct} % der Strecke ab.`;
  }
  const base = usable.find((e) => e.offsetMin === 0);
  const span = Math.max(...usable.map((e) => Math.abs(e.offsetMin)));
  if (base && base.wetMin === 0) {
    return `Im Fenster ±${Math.round(span / 60)} h gibt es nichts zu verbessern — deine Startzeit liegt schon trocken.`;
  }
  return `Keine Startzeit im Fenster ±${Math.round(span / 60)} h ist spürbar besser (Schwelle ${ADVICE_MIN_GAIN_MIN} Minuten weniger Regen).`;
}

/* ============================ Radar-Vorlauf ============================ */

const COUNTRY_LABEL: Record<string, string> = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz' };
const SOURCE_LABEL: Record<string, string> = {
  radolan_rv: 'RADOLAN-RV', inca_grid: 'INCA', meteoswiss_rzc: 'MeteoSwiss rzc',
};

/**
 * „Radar-Nowcast bis 11:45 · danach Modell" — aber als das, was es ist: **je
 * Land verschieden** (DE 2 h, AT 3 h, CH ein einziges Bild ohne Vorlauf,
 * `audit/route-3d.md` B9). Deckt der Vorlauf die ganze Tour, sagt der Satz das;
 * gibt es gar keinen, sagt er auch das — statt zu schweigen.
 */
export function radarHorizonNote(radar: RadarHorizon[], endMs: number): string {
  if (radar.length === 0) return 'Kein Radar-Vorlauf geladen — alle Werte sind Modellwerte.';
  const parts = radar.map((r) => {
    const land = COUNTRY_LABEL[r.country] ?? r.country;
    const src = SOURCE_LABEL[r.source] ?? r.source;
    if (r.frameCount <= 1) return `${land}: nur ein Radarbild von jetzt (${src}), kein Vorlauf — der Rest ist Modell`;
    if (r.validUntilMs >= endMs) return `${land}: Radar-Nowcast (${src}) deckt die ganze Tour`;
    return `${land}: Radar-Nowcast (${src}) bis ${hhmm(r.validUntilMs)}, danach Modell`;
  });
  return parts.join(' · ');
}

/** Kurzform für das Abzeichen über der Szene. */
export function radarHorizonChip(radar: RadarHorizon[], endMs: number): string {
  if (radar.length === 0) return 'ohne Radar-Vorlauf · nur Modell';
  const multi = radar.filter((r) => r.frameCount > 1);
  if (multi.length === 0) return 'ohne Radar-Vorlauf · nur Modell';
  const until = Math.min(...multi.map((r) => r.validUntilMs));
  if (until >= endMs) return 'Radar-Nowcast über die ganze Tour';
  return `Radar-Nowcast bis ${hhmm(until)} · danach Modell`;
}

/* ============================ Hilfen ============================ */

/** HH:MM ohne JSX-Abhängigkeit — dieses Modul muss headless importierbar bleiben. */
export function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function km(m: number): string {
  return (m / 1000).toFixed(1).replace('.', ',');
}

function num(v: number): string {
  return v.toFixed(1).replace('.', ',');
}
