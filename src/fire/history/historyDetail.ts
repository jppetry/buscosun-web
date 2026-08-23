/**
 * BH4 — Detail eines Historie-Ereignisses (`audit/brand-historie.md` §5 BH4).
 *
 *  - `loadHistoryShard`   holt den Detail-Shard (`ev/<jahr>/<monat>/<lat>_<lon>.json`, eine 1°-Zelle
 *                         je Klick), `cache: 'no-store'`, einmal je Sitzung und Shard; Fehler ist ein
 *                         Ergebnis, nie ein leerer Eintrag.
 *  - `fireDayWeather`     **Wetterlage am Brandtag** — aus den Quellen der Wetterhistorie
 *                         (`src/history/*`, dynamisch importiert: eigener Chunk, das Brandradar-Bundle
 *                         wächst nicht): Tag = nächste Station (Meteostat/DWD, **gemessen**), Stunde der
 *                         Erstdetektion = ERA5 (Open-Meteo Archive, **Reanalyse ~25 km**). Jede Zahl
 *                         trägt Quelle und Wertart; Tage seit dem letzten Niederschlag aus der
 *                         Tagesreihe vor dem Brand (Schwelle `RAIN_DAY_MM`). ICON/Fusion haben kein
 *                         Archiv — der Satz „hat kein anderer Anbieter" aus dem Konzept ist damit NICHT
 *                         einlösbar (W4); gesagt statt behauptet.
 *
 * Die reinen Ableitungen (`daysSinceRain`, `pickHour`, `weatherSummary`) sind netzfrei und stehen in
 * der Selbstverifikation; der Netzteil ist bewusst dünn.
 */

import type { DailyRecord } from '../../history/historyModel';
import type { HourlyPoint } from '../../history/historySource';
import { HISTORY_ARTIFACT_VERSION, HISTORY_BASE_URL, detectionsOf, shardPath, type HistoryShardEvent, type HistoryShardFile } from './historyArtifacts';
import type { HistoryEvent } from './historyEvents';

// ---------------------------------------------------------------------------
// Shard
// ---------------------------------------------------------------------------

export type ShardLoad =
  | { kind: 'loading' }
  | { kind: 'ok'; file: HistoryShardFile }
  | { kind: 'error'; message: string };

const _shards = new Map<string, Promise<ShardLoad>>();

export function loadHistoryShard(e: Pick<HistoryEvent, 'lat' | 'lon' | 'firstMs'>): Promise<ShardLoad> {
  const path = shardPath(e);
  let p = _shards.get(path);
  if (!p) {
    p = fetch(`${HISTORY_BASE_URL}/ev/${path}`, { cache: 'no-store' })
      .then(async (r): Promise<ShardLoad> => {
        if (!r.ok) return { kind: 'error', message: `HTTP ${r.status}` };
        const file = (await r.json()) as HistoryShardFile;
        if (file.version !== HISTORY_ARTIFACT_VERSION || !Array.isArray(file.events)) return { kind: 'error', message: 'unbekanntes Dateiformat' };
        return { kind: 'ok', file };
      })
      .catch((err: unknown) => ({ kind: 'error', message: err instanceof Error ? err.message : String(err) } as ShardLoad));
    p.then((res) => { if (res.kind === 'error') _shards.delete(path); });
    _shards.set(path, p);
  }
  return p;
}

export function resetShardCache(): void { _shards.clear(); }

/** Das volle Ereignis aus dem Shard — mit entpackten Detektionen. */
export function eventFromShard(file: HistoryShardFile, id: string): HistoryEvent | null {
  const s = file.events.find((x) => x.id === id);
  if (!s) return null;
  return { ...(s as HistoryShardEvent), detections: detectionsOf(s, file.detectionFields) } as HistoryEvent;
}

// ---------------------------------------------------------------------------
// Wetterlage am Brandtag
// ---------------------------------------------------------------------------

/** Ab dieser Tagessumme gilt ein Tag als Regentag (DWD-Konvention „Niederschlagstag" ≥ 0,1 mm wäre zu fein für „seit wann trocken"). */
export const RAIN_DAY_MM = 1.0;
/** Wie weit die Tagesreihe zurückgesucht wird — darüber hinaus heißt es „länger als …". */
export const RAIN_LOOKBACK_DAYS = 60;

export interface FireDayWeather {
  /** Brandtag (UTC-Datum der Erstdetektion). */
  dateISO: string;
  day: {
    source: string;
    kind: 'measured' | 'reanalysis';
    station: { name: string; distanceKm: number } | null;
    tMaxC: number | null;
    humidityPct: number | null;
    windMaxKmh: number | null;
    precipMm: number | null;
    /** Felder, die der Anbieter mit Modellwerten gefüllt hat — dort gilt „gemessen" nicht. */
    modelFilled: NonNullable<DailyRecord['modelFilled']>;
  } | null;
  hour: {
    /** Stunde der Erstdetektion, lokal beschriftet vom Aufrufer. */
    atMs: number;
    tempC: number | null;
    windKmh: number | null;
    precipMm: number | null;
    source: string;
    kind: 'reanalysis';
  } | null;
  /** Tage seit dem letzten Regentag vor dem Brand; `null` = nicht bestimmbar; `>= RAIN_LOOKBACK_DAYS` = „länger als". */
  daysSinceRain: number | null;
  rainLookbackHit: boolean;
  /** Was fehlt und warum — für die Karte, nie still. */
  notes: string[];
}

export function isoDayUtc(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }

/** Tage seit dem letzten Regentag (≥ `thresholdMm`) VOR `dateISO`; der Brandtag selbst zählt nicht. */
export function daysSinceRain(days: readonly DailyRecord[], dateISO: string, thresholdMm = RAIN_DAY_MM, lookback = RAIN_LOOKBACK_DAYS): { days: number | null; hit: boolean } {
  const byDate = new Map(days.map((d) => [d.dateISO, d]));
  const t0 = Date.parse(`${dateISO}T00:00:00Z`);
  let seen = 0;
  for (let i = 1; i <= lookback; i++) {
    const d = byDate.get(isoDayUtc(t0 - i * 86_400_000));
    if (!d) break;                         // Lücke in der Reihe ⇒ nicht bestimmbar ab hier
    seen = i;
    if (d.precipMm != null && d.precipMm >= thresholdMm) return { days: i - 1, hit: true };
  }
  return seen === lookback ? { days: lookback, hit: false } : { days: seen > 0 ? null : null, hit: false };
}

/** Der Stundenwert, der der Erstdetektion am nächsten liegt (ERA5 liefert volle Stunden). */
export function pickHour(hours: readonly HourlyPoint[], atMs: number): HourlyPoint | null {
  let best: HourlyPoint | null = null;
  for (const h of hours) if (!best || Math.abs(h.tMs - atMs) < Math.abs(best.tMs - atMs)) best = h;
  return best && Math.abs(best.tMs - atMs) <= 90 * 60_000 ? best : null;
}

/**
 * Holt Tages- und Stundenwerte. Die Historie-Module kommen per dynamischem Import (eigener Chunk).
 * Jeder Teil fällt einzeln aus und sagt es in `notes`; ein Ausfall beider ist kein Fehlerwurf, sondern
 * eine Karte mit zwei Sätzen.
 */
export async function fireDayWeather(lat: number, lon: number, firstMs: number, signal?: AbortSignal): Promise<FireDayWeather> {
  const dateISO = isoDayUtc(firstMs);
  const year = Number(dateISO.slice(0, 4));
  const out: FireDayWeather = { dateISO, day: null, hour: null, daysSinceRain: null, rainLookbackHit: false, notes: [] };
  let mod: typeof import('../../history/historySource') | null = null;
  try { mod = await import('../../history/historySource'); } catch { out.notes.push('Wetterhistorie-Modul nicht ladbar.'); return out; }
  const src = mod.defaultHistorySource;
  // Tagesreihe: Brandjahr, dazu das Vorjahr, wenn der Rückblick über den Jahreswechsel reicht.
  const startYear = new Date(firstMs - RAIN_LOOKBACK_DAYS * 86_400_000).getUTCFullYear();
  try {
    // OHNE Abbruchsignal: `MeteostatSource` merkt sich das Jahres-Promise je Station — hinge es am
    // Signal des ersten Aufrufers, bekäme jeder spätere Aufruf (Reacts doppelter Dev-Effekt, der
    // nächste Klick auf dieselbe Zelle) „signal is aborted" aus dem Cache (Lehre GBP1 (3), im
    // Browser reproduziert). Die Stundenabfrage darunter ist nicht gecacht und darf abbrechen.
    let days = await src.fetchDailyRange(lat, lon, startYear, year);
    let d = days.find((x) => x.dateISO === dateISO) ?? null;
    const st = src.lastStation ?? null;
    let source = src.label; let kind: 'measured' | 'reanalysis' = src.kind; let station = st ? { name: st.name, distanceKm: st.distanceKm } : null;
    if (!d) {
      // Das gebündelte Stationsverzeichnis endet für ~die Hälfte der Stationen 2022 (Browser-Befund
      // GBH4: Hürtgenwald ⇒ Station ohne 2026) — dann die Reanalyse als Tagesquelle, gekennzeichnet.
      out.notes.push(`Station ${st ? `${st.name} (${st.distanceKm.toFixed(0)} km)` : '—'} hat für den ${dateISO} keinen Messwert — Tageswerte aus der ERA5-Reanalyse.`);
      const era = new mod.OpenMeteoArchive();
      days = await era.fetchDailyRange(lat, lon, startYear, year, signal);
      d = days.find((x) => x.dateISO === dateISO) ?? null;
      source = era.label; kind = era.kind; station = null;
    }
    if (d) {
      out.day = { source, kind, station, tMaxC: d.tMaxC, humidityPct: d.humidityPct, windMaxKmh: d.windMaxKmh, precipMm: d.precipMm, modelFilled: d.modelFilled ?? [] };
    } else {
      out.notes.push(`Kein Tageswert für den ${dateISO} — weder Station noch Reanalyse.`);
    }
    const r = daysSinceRain(days, dateISO);
    out.daysSinceRain = r.days; out.rainLookbackHit = r.hit;
    if (r.days == null) out.notes.push('Tage seit Regen nicht bestimmbar — Lücke in der Tagesreihe vor dem Brand.');
  } catch (e) {
    out.notes.push(`Tageswerte nicht erreichbar (${e instanceof Error ? e.message : String(e)}).`);
  }
  try {
    const hours = await src.fetchHourlyDay(lat, lon, dateISO, signal);
    const h = pickHour(hours, firstMs);
    if (h) out.hour = { atMs: h.tMs, tempC: h.tempC, windKmh: h.windKmh, precipMm: h.precipMm, source: 'ERA5-Reanalyse (Open-Meteo Archive), ~25 km', kind: 'reanalysis' };
    else out.notes.push('Kein Stundenwert nahe der Erstdetektion (ERA5 liefert volle Stunden; Lücke > 90 min).');
  } catch (e) {
    out.notes.push(`Stundenwerte nicht erreichbar (${e instanceof Error ? e.message : String(e)}).`);
  }
  return out;
}

/** Beschriftung der Regen-Aussage — eine Stelle, damit Karte und Verifier dasselbe sagen. */
export function rainLabel(w: Pick<FireDayWeather, 'daysSinceRain' | 'rainLookbackHit'>): string {
  if (w.daysSinceRain == null) return 'nicht bestimmbar';
  if (!w.rainLookbackHit) return `länger als ${RAIN_LOOKBACK_DAYS} Tage kein Regentag (≥ ${RAIN_DAY_MM} mm)`;
  if (w.daysSinceRain === 0) return `Regentag am Vortag (≥ ${RAIN_DAY_MM} mm)`;
  return `${w.daysSinceRain} ${w.daysSinceRain === 1 ? 'Tag' : 'Tage'} seit dem letzten Regentag (≥ ${RAIN_DAY_MM} mm)`;
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface DetailCheck { name: string; ok: boolean; detail?: string }

export function verifyHistoryDetail(): { checks: DetailCheck[]; passed: number; total: number } {
  const checks: DetailCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const day = (dateISO: string, precipMm: number | null): DailyRecord => {
    const [y, m, d] = dateISO.split('-').map(Number);
    return { dateISO, year: y, month: m, day: d, doy: 0, tMaxC: 20, tMinC: 10, tMeanC: 15, precipMm, sunshineH: null, windMaxKmh: null, windDirDeg: null, humidityPct: null, snowCm: null };
  };
  const series = (from: string, n: number, rainAt: Record<string, number>): DailyRecord[] => {
    const t0 = Date.parse(`${from}T00:00:00Z`);
    return Array.from({ length: n }, (_, i) => { const iso = isoDayUtc(t0 + i * 86_400_000); return day(iso, rainAt[iso] ?? 0); });
  };
  const s = series('2026-06-01', 80, { '2026-08-05': 3.2, '2026-08-09': 0.4 });
  add('Regentag 5.8. ⇒ Brand 10.8.: 4 Tage seit Regen (0,4 mm zählt nicht)', daysSinceRain(s, '2026-08-10').days === 4 && daysSinceRain(s, '2026-08-10').hit);
  add('Brandtag selbst zählt nicht; Vortag regnerisch ⇒ 0', daysSinceRain(s, '2026-08-06').days === 0);
  add('ohne Regentag im Rückblick: Deckel mit hit=false', daysSinceRain(series('2026-01-01', 200, {}), '2026-07-01').days === RAIN_LOOKBACK_DAYS && !daysSinceRain(series('2026-01-01', 200, {}), '2026-07-01').hit);
  add('Lücke in der Reihe ⇒ null, nie geraten', daysSinceRain(series('2026-08-08', 5, {}), '2026-08-10').days === null);
  add('Beschriftung: Deckel sagt „länger als"', /länger als 60 Tage/.test(rainLabel({ daysSinceRain: 60, rainLookbackHit: false })) && rainLabel({ daysSinceRain: null, rainLookbackHit: false }) === 'nicht bestimmbar');
  const hp = (h: number): HourlyPoint => ({ tMs: Date.UTC(2026, 7, 10, h), hour: h, tempC: 20 + h, precipMm: 0, windKmh: 10 });
  const hours = [hp(11), hp(12), hp(13)];
  add('Stundenwert: nächste volle Stunde zur Erstdetektion (12:20 ⇒ 12:00)', pickHour(hours, Date.UTC(2026, 7, 10, 12, 20))?.hour === 12);
  add('Stundenwert: nichts näher als 90 min ⇒ null', pickHour(hours, Date.UTC(2026, 7, 10, 16, 0)) === null);
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
