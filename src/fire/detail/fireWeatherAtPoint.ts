/**
 * BD1 — Wetterlage am Brandort (`audit/brand-detail.md` §2 D1/D2).
 *
 * Der Brandradar kennt live nur ICON-D2 ab „jetzt"; ein Brand liegt bis zu 7 Tage zurück.
 * Die Stundenwerte der Vergangenheit kommen deshalb von der Open-Meteo-Vorhersage-API mit
 * `past_days` und `models=icon_seamless` (DWD ICON-D2/EU/global) — derselbe Host wie
 * `src/sources/openMeteoForecast.ts`, dieselbe Lizenzzeile in `scripts/seo/licenses.mjs`.
 * Gemessen 2026-08-25: 7 Tage stündlich ≈ 9,4 KB, 31 Tage täglich ≈ 0,8 KB. Nur auf Klick,
 * einmal je Brand und Sitzung; kein Netlify-Traffic.
 *
 * Regeln:
 *  • „Zeitpunkt des Brands" = Stunde der Erstdetektion; dazu letzte Detektion und jetzt.
 *  • Modellwerte, keine Messung — steht in jeder Beschriftung (`FIRE_WEATHER_SOURCE_LABEL`).
 *  • Jeder fehlende Teil ist ein Satz in `notes`, nie ein stilles Loch; die 24-h-Summe gibt
 *    es nur bei vollständiger Stundenreihe.
 *  • Der Cache hängt an keinem Abbruchsignal (Lehre GBP1 (3)): der erste Aufrufer darf
 *    verschwinden, ohne den zweiten zu vergiften.
 */

import { RAIN_DAY_MM } from '../history/historyDetail';
import { compassLabel } from '../activity/dynamics';

export const FIRE_WEATHER_SOURCE_LABEL = 'DWD ICON über Open-Meteo · Modellwerte (2–13 km), keine Messung';
export const FIRE_WEATHER_ATTRIBUTION = 'Wetterdaten: Open-Meteo.com (CC BY 4.0) · Modell DWD ICON';
export const HOURLY_PAST_DAYS = 7;
export const DAILY_PAST_DAYS = 31;
/** Rückblick für „Tage seit Regen" — ein Tag weniger als die Tagesreihe, weil der Brandtag selbst nicht zählt. */
export const RAIN_LOOKBACK_DAYS_LIVE = 30;
export const HOUR_TOLERANCE_MS = 90 * 60_000;
export const WEATHER_TTL_MS = 30 * 60_000;
const H_MS = 3_600_000;

export interface FireWeatherHour {
  atMs: number;
  tempC: number | null;
  rhPct: number | null;
  windKmh: number | null;
  /** „kommt aus", Grad. */
  windFromDeg: number | null;
  gustKmh: number | null;
  precipMm: number | null;
}

export interface FireWeatherDay {
  dateISO: string;
  tMaxC: number | null;
  rhMinPct: number | null;
  gustMaxKmh: number | null;
  precipMm: number | null;
  /** Der Brandtag ist noch nicht vorbei — Werte bis jetzt. */
  partial: boolean;
}

export interface FireWeatherAtPoint {
  fetchedAt: number;
  atFirst: FireWeatherHour | null;
  /** Stunde der letzten Detektion — `null`, wenn sie in dieselbe Stunde wie die erste fällt. */
  atLast: FireWeatherHour | null;
  now: FireWeatherHour | null;
  fireDay: FireWeatherDay | null;
  /** Niederschlag der 24 h VOR der Erstdetektion; `null` ohne vollständige Reihe. */
  precip24hBeforeMm: number | null;
  daysSinceRain: number | null;
  rainLookbackHit: boolean;
  notes: string[];
}

/** Rohform der Open-Meteo-Antworten — nur die Felder, die hier gelesen werden. */
export interface OmHourlyJson {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_direction_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
    precipitation?: (number | null)[];
  };
}
export interface OmDailyJson {
  daily?: { time?: string[]; precipitation_sum?: (number | null)[] };
}

const HOURLY_VARS = 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation';

export function hourlyUrl(lat: number, lon: number): string {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude', lat.toFixed(4));
  u.searchParams.set('longitude', lon.toFixed(4));
  u.searchParams.set('hourly', HOURLY_VARS);
  u.searchParams.set('models', 'icon_seamless');
  u.searchParams.set('past_days', String(HOURLY_PAST_DAYS));
  u.searchParams.set('forecast_days', '1');
  u.searchParams.set('timezone', 'UTC');
  return u.toString();
}

export function dailyUrl(lat: number, lon: number): string {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude', lat.toFixed(4));
  u.searchParams.set('longitude', lon.toFixed(4));
  u.searchParams.set('daily', 'precipitation_sum');
  u.searchParams.set('models', 'icon_seamless');
  u.searchParams.set('past_days', String(DAILY_PAST_DAYS));
  u.searchParams.set('forecast_days', '1');
  u.searchParams.set('timezone', 'UTC');
  return u.toString();
}

/** Open-Meteo schreibt UTC-Zeiten ohne `Z` („2026-08-18T00:00"). */
export function omTimeMs(t: string): number {
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(t) ? t : `${t}Z`);
}

export function isoDayUtc(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function hoursOf(json: OmHourlyJson | null): FireWeatherHour[] {
  const h = json?.hourly;
  if (!h?.time) return [];
  const out: FireWeatherHour[] = [];
  for (let i = 0; i < h.time.length; i++) {
    const atMs = omTimeMs(h.time[i]);
    if (!Number.isFinite(atMs)) continue;
    out.push({
      atMs,
      tempC: num(h.temperature_2m?.[i]),
      rhPct: num(h.relative_humidity_2m?.[i]),
      windKmh: num(h.wind_speed_10m?.[i]),
      windFromDeg: num(h.wind_direction_10m?.[i]),
      gustKmh: num(h.wind_gusts_10m?.[i]),
      precipMm: num(h.precipitation?.[i]),
    });
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** Die Stunde, die `atMs` am nächsten liegt — höchstens 90 min entfernt, sonst `null`. */
export function pickHour(hours: readonly FireWeatherHour[], atMs: number): FireWeatherHour | null {
  let best: FireWeatherHour | null = null;
  for (const h of hours) if (!best || Math.abs(h.atMs - atMs) < Math.abs(best.atMs - atMs)) best = h;
  return best && Math.abs(best.atMs - atMs) <= HOUR_TOLERANCE_MS ? best : null;
}

/** Niederschlagssumme über die 24 vollen Stunden vor `atMs` — nur bei lückenloser Reihe. */
export function precipBefore(hours: readonly FireWeatherHour[], atMs: number, spanH = 24): number | null {
  const from = atMs - spanH * H_MS;
  let n = 0; let sum = 0;
  for (const h of hours) {
    if (h.atMs < from || h.atMs >= atMs) continue;
    if (h.precipMm == null) return null;
    n++; sum += h.precipMm;
  }
  return n === spanH ? Math.round(sum * 10) / 10 : null;
}

export function daySummary(hours: readonly FireWeatherHour[], dateISO: string, nowMs: number): FireWeatherDay | null {
  const day = hours.filter((h) => isoDayUtc(h.atMs) === dateISO && h.atMs <= nowMs);
  if (day.length === 0) return null;
  const max = (xs: (number | null)[]) => xs.reduce<number | null>((m, v) => (v == null ? m : m == null || v > m ? v : m), null);
  const min = (xs: (number | null)[]) => xs.reduce<number | null>((m, v) => (v == null ? m : m == null || v < m ? v : m), null);
  const precip = day.every((h) => h.precipMm != null) ? Math.round(day.reduce((s, h) => s + (h.precipMm ?? 0), 0) * 10) / 10 : null;
  return {
    dateISO,
    tMaxC: max(day.map((h) => h.tempC)),
    rhMinPct: min(day.map((h) => h.rhPct)),
    gustMaxKmh: max(day.map((h) => h.gustKmh)),
    precipMm: precip,
    partial: day.length < 24,
  };
}

/** Tage seit dem letzten Regentag (≥ `RAIN_DAY_MM`) VOR `dateISO`; der Brandtag zählt nicht. */
export function daysSinceRainDaily(daily: OmDailyJson | null, dateISO: string, lookback = RAIN_LOOKBACK_DAYS_LIVE): { days: number | null; hit: boolean } {
  const d = daily?.daily;
  if (!d?.time) return { days: null, hit: false };
  const byDate = new Map<string, number | null>();
  d.time.forEach((t, i) => byDate.set(t.slice(0, 10), num(d.precipitation_sum?.[i])));
  const t0 = Date.parse(`${dateISO}T00:00:00Z`);
  let seen = 0;
  for (let i = 1; i <= lookback; i++) {
    const key = isoDayUtc(t0 - i * 86_400_000);
    if (!byDate.has(key)) break;
    const mm = byDate.get(key);
    if (mm == null) break;
    seen = i;
    if (mm >= RAIN_DAY_MM) return { days: i - 1, hit: true };
  }
  return seen === lookback ? { days: lookback, hit: false } : { days: null, hit: false };
}

/** Pure Zusammenführung — netzfrei prüfbar. */
export function parseFireWeather(
  hourly: OmHourlyJson | null, daily: OmDailyJson | null,
  firstMs: number | null, lastMs: number | null, nowMs: number,
): FireWeatherAtPoint {
  const out: FireWeatherAtPoint = {
    fetchedAt: nowMs, atFirst: null, atLast: null, now: null, fireDay: null,
    precip24hBeforeMm: null, daysSinceRain: null, rainLookbackHit: false, notes: [],
  };
  const hours = hoursOf(hourly);
  if (hours.length === 0) {
    out.notes.push('Stundenwerte nicht verfügbar — keine Aussage zu Temperatur, Feuchte und Wind.');
  } else {
    if (firstMs == null) {
      out.notes.push('Keine Detektion im Fenster — es gibt keinen Zeitpunkt, für den die Wetterlage gelten könnte.');
    } else {
      out.atFirst = pickHour(hours, firstMs);
      if (!out.atFirst) out.notes.push('Keine Modellstunde nahe der Erstdetektion (Reihe reicht nicht so weit zurück).');
      if (lastMs != null && lastMs - firstMs >= H_MS) {
        out.atLast = pickHour(hours, lastMs);
        if (out.atLast && out.atFirst && out.atLast.atMs === out.atFirst.atMs) out.atLast = null;
      }
      out.precip24hBeforeMm = precipBefore(hours, firstMs);
      if (out.precip24hBeforeMm == null) out.notes.push('Niederschlag der 24 h vor der Erstdetektion nicht bestimmbar (Reihe unvollständig).');
      out.fireDay = daySummary(hours, isoDayUtc(firstMs), nowMs);
    }
    let latest: FireWeatherHour | null = null;
    for (const h of hours) if (h.atMs <= nowMs && (!latest || h.atMs > latest.atMs)) latest = h;
    out.now = latest && nowMs - latest.atMs <= 3 * H_MS ? latest : null;
    if (!out.now) out.notes.push('Keine Modellstunde für „jetzt" (Reihe endet früher).');
  }
  if (firstMs != null) {
    const r = daysSinceRainDaily(daily, isoDayUtc(firstMs));
    out.daysSinceRain = r.days; out.rainLookbackHit = r.hit;
    if (r.days == null) out.notes.push(daily ? 'Tage seit Regen nicht bestimmbar — Lücke in der Tagesreihe vor dem Brand.' : 'Tagesreihe nicht verfügbar — „Tage seit Regen" fehlt.');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Abruf mit Sitzungs-Cache
// ---------------------------------------------------------------------------

const _cache = new Map<string, { at: number; p: Promise<FireWeatherAtPoint> }>();

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

export function fetchFireWeatherAtPoint(lat: number, lon: number, firstMs: number | null, lastMs: number | null, nowMs = Date.now()): Promise<FireWeatherAtPoint> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}|${firstMs ?? 0}|${lastMs ?? 0}`;
  const hit = _cache.get(key);
  if (hit && nowMs - hit.at < WEATHER_TTL_MS) return hit.p;
  const p = Promise.all([getJson<OmHourlyJson>(hourlyUrl(lat, lon)), getJson<OmDailyJson>(dailyUrl(lat, lon))])
    .then(([h, d]) => {
      const out = parseFireWeather(h, d, firstMs, lastMs, nowMs);
      if (!h) out.notes.unshift('Stundenabruf fehlgeschlagen (Open-Meteo nicht erreichbar oder Fehler).');
      if (!d) out.notes.unshift('Tagesabruf fehlgeschlagen (Open-Meteo nicht erreichbar oder Fehler).');
      // Ein Totalausfall wird nicht gemerkt — der nächste Klick versucht es erneut.
      if (!h && !d) _cache.delete(key);
      return out;
    });
  _cache.set(key, { at: nowMs, p });
  return p;
}

export function resetFireWeatherCache(): void { _cache.clear(); }

// ---------------------------------------------------------------------------
// Beschriftungen — EINE Stelle für Karte und Verifier
// ---------------------------------------------------------------------------

const de = (n: number, frac = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: frac });

export function hourLine(h: FireWeatherHour): string {
  const parts: string[] = [];
  parts.push(h.tempC != null ? `${de(h.tempC, 1)} °C` : '— °C');
  parts.push(h.rhPct != null ? `RH ${de(h.rhPct)} %` : 'RH —');
  if (h.windKmh != null) parts.push(`Wind ${h.windFromDeg != null ? `aus ${compassLabel(h.windFromDeg)} ` : ''}${de(h.windKmh)} km/h`);
  else parts.push('Wind —');
  if (h.gustKmh != null) parts.push(`Böen ${de(h.gustKmh)} km/h`);
  parts.push(h.precipMm != null ? `${de(h.precipMm, 1)} mm` : '— mm');
  return parts.join(' · ');
}

export function rainLabelLive(w: Pick<FireWeatherAtPoint, 'daysSinceRain' | 'rainLookbackHit'>): string {
  if (w.daysSinceRain == null) return 'nicht bestimmbar';
  if (!w.rainLookbackHit) return `länger als ${RAIN_LOOKBACK_DAYS_LIVE} Tage kein Regentag (≥ ${de(RAIN_DAY_MM, 1)} mm)`;
  if (w.daysSinceRain === 0) return `Regentag am Vortag (≥ ${de(RAIN_DAY_MM, 1)} mm)`;
  return `${w.daysSinceRain} ${w.daysSinceRain === 1 ? 'Tag' : 'Tage'} seit dem letzten Regentag (≥ ${de(RAIN_DAY_MM, 1)} mm)`;
}

/** Einordnung der Feuchte — konservative Worte, keine Gefahrenstufe (Ehrlichkeitsregel). */
export function rhWord(rhPct: number | null): string | null {
  if (rhPct == null) return null;
  if (rhPct < 30) return 'sehr trockene Luft';
  if (rhPct < 45) return 'trockene Luft';
  if (rhPct < 65) return 'mäßig feuchte Luft';
  return 'feuchte Luft';
}

/** Ein Satz für die Kachel: Feuchte-Wort + Böen + Regenlage. */
export function weatherSummary(w: FireWeatherAtPoint): string | null {
  const h = w.atFirst ?? w.now;
  if (!h) return null;
  const parts: string[] = [];
  const word = rhWord(h.rhPct);
  if (word) parts.push(`${word} (RH ${de(h.rhPct as number)} %)`);
  if (h.gustKmh != null) parts.push(`Böen ${de(h.gustKmh)} km/h${h.windFromDeg != null ? ` aus ${compassLabel(h.windFromDeg)}` : ''}`);
  if (w.precip24hBeforeMm != null) parts.push(w.precip24hBeforeMm < 0.1 ? 'kein Regen in den 24 h davor' : `${de(w.precip24hBeforeMm, 1)} mm in den 24 h davor`);
  return parts.length ? parts.join(' · ') : null;
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface FireWeatherCheck { name: string; ok: boolean; detail?: string }

export function verifyFireWeatherAtPoint(): { checks: FireWeatherCheck[]; passed: number; total: number } {
  const checks: FireWeatherCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // Fixture: 3 Tage stündlich, Regen nur am ersten Tag 03:00 (2,4 mm).
  const t0 = Date.UTC(2026, 7, 20, 0, 0);
  const time: string[] = []; const temp: number[] = []; const rh: number[] = []; const ws: number[] = []; const wd: number[] = []; const gu: number[] = []; const pr: number[] = [];
  for (let i = 0; i < 72; i++) {
    time.push(new Date(t0 + i * H_MS).toISOString().slice(0, 16));
    temp.push(10 + (i % 24)); rh.push(80 - (i % 24) * 2.5); ws.push(10 + (i % 5)); wd.push(225); gu.push(20 + (i % 7)); pr.push(i === 3 ? 2.4 : 0);
  }
  const hourly: OmHourlyJson = { hourly: { time, temperature_2m: temp, relative_humidity_2m: rh, wind_speed_10m: ws, wind_direction_10m: wd, wind_gusts_10m: gu, precipitation: pr } };
  const dailyTime: string[] = []; const dailySum: number[] = [];
  for (let i = -31; i <= 1; i++) { dailyTime.push(isoDayUtc(t0 + i * 86_400_000)); dailySum.push(i === -5 ? 3.2 : i === 0 ? 2.4 : 0); }
  const daily: OmDailyJson = { daily: { time: dailyTime, precipitation_sum: dailySum } };

  add('Zeitstempel ohne Z werden als UTC gelesen', omTimeMs('2026-08-20T00:00') === t0);
  add('Stundenreihe vollständig geparst (72 Stunden)', hoursOf(hourly).length === 72);

  const first = t0 + 36 * H_MS + 20 * 60_000; // Tag 2, 12:20 UTC
  const last = t0 + 50 * H_MS;                 // Tag 3, 02:00 UTC
  const now = t0 + 60 * H_MS + 10 * 60_000;
  const w = parseFireWeather(hourly, daily, first, last, now);
  add('Stunde der Erstdetektion: die nächste volle Stunde (12:00)', w.atFirst?.atMs === t0 + 36 * H_MS, String(w.atFirst?.atMs));
  add('Stunde der letzten Detektion getrennt (02:00 Tag 3)', w.atLast?.atMs === t0 + 50 * H_MS);
  add('„jetzt" = jüngste Modellstunde ≤ jetzt (11:00 Tag 3 → 60 h)', w.now?.atMs === t0 + 60 * H_MS);
  add('24 h vor der Erstdetektion: 0,0 mm (Regen lag 33 h zurück)', w.precip24hBeforeMm === 0, String(w.precip24hBeforeMm));
  add('Brandtag-Summe: Tmax, RHmin, Böenmax bis jetzt — Tag 2 ist voll (24 h)', !!w.fireDay && w.fireDay.partial === false && w.fireDay.tMaxC === 33 && w.fireDay.rhMinPct === 22.5 && w.fireDay.gustMaxKmh === 26, JSON.stringify(w.fireDay));
  add('Tage seit Regen: Brandtag Tag 2 ⇒ Vortag (Tag 1) 2,4 mm ⇒ 0 Tage, Treffer', w.daysSinceRain === 0 && w.rainLookbackHit, String(w.daysSinceRain));
  add('Regen-Beschriftung nennt den Vortag', /Vortag/.test(rainLabelLive(w)));
  add('keine Hinweise bei vollständiger Lage', w.notes.length === 0, w.notes.join(' | '));

  const w2 = parseFireWeather(hourly, { daily: { time: dailyTime, precipitation_sum: dailySum.map((v, i) => (i === 31 ? 0 : v)) } }, first, null, now);
  // Brandtag = Tag 1 (t0 + 36 h); Regen an Tag −5 ⇒ die Tage −4…0 (fünf) sind trocken.
  add('ohne Regen am Vortag: 5 Tage seit Regen (Regen an Tag −5, Brandtag Tag +1)', w2.daysSinceRain === 5 && w2.rainLookbackHit, String(w2.daysSinceRain));
  const w3 = parseFireWeather(hourly, { daily: { time: dailyTime, precipitation_sum: dailySum.map(() => 0) } }, first, null, now);
  add('ohne Regen im Rückblick: „länger als 30 Tage"', w3.daysSinceRain === RAIN_LOOKBACK_DAYS_LIVE && !w3.rainLookbackHit && /länger als 30/.test(rainLabelLive(w3)));

  const early = parseFireWeather(hourly, daily, t0 - 5 * H_MS, null, now);
  add('Erstdetektion vor der Reihe: atFirst null MIT Hinweis, kein Absturz', early.atFirst === null && early.notes.some((n) => /Erstdetektion/.test(n)));
  add('24-h-Summe fehlt bei unvollständiger Reihe — null, nicht 0', early.precip24hBeforeMm === null);

  const none = parseFireWeather(null, null, first, last, now);
  add('ohne Antworten: alles null, zwei Hinweise (Stunden, Tagesreihe)', none.atFirst === null && none.now === null && none.daysSinceRain === null && none.notes.length === 2, none.notes.join(' | '));
  const noDet = parseFireWeather(hourly, daily, null, null, now);
  add('ohne Detektion: kein Zeitpunkt, aber „jetzt" da', noDet.atFirst === null && noDet.now !== null && noDet.notes.some((n) => /Keine Detektion/.test(n)));

  add('URL: Vorhersage-Host, icon_seamless, past_days 7, UTC', /api\.open-meteo\.com\/v1\/forecast/.test(hourlyUrl(48, 11)) && /models=icon_seamless/.test(hourlyUrl(48, 11)) && /past_days=7/.test(hourlyUrl(48, 11)) && /timezone=UTC/.test(hourlyUrl(48, 11)));
  add('Tages-URL: precipitation_sum, past_days 31', /daily=precipitation_sum/.test(dailyUrl(48, 11)) && /past_days=31/.test(dailyUrl(48, 11)));
  add('Stundenzeile: Grad, RH, Wind aus SW, Böen, mm', /°C · RH \d+ % · Wind aus SW \d+ km\/h · Böen \d+ km\/h · \d+(,\d)? mm/.test(hourLine(w.atFirst as FireWeatherHour)), hourLine(w.atFirst as FireWeatherHour));
  add('Feuchte-Wort: konservativ, keine Stufe', rhWord(22.5) === 'sehr trockene Luft' && rhWord(70) === 'feuchte Luft' && rhWord(null) === null);
  add('Kachel-Satz nennt Feuchte-Wort mit RH, Böen mit Richtung, Regenlage', /Luft \(RH \d+ %\) · Böen \d+ km\/h aus SW · kein Regen in den 24 h davor/.test(weatherSummary(w) ?? ''), weatherSummary(w) ?? '');
  add('Quellenlabel sagt „Modellwerte" und „keine Messung"', /Modellwerte/.test(FIRE_WEATHER_SOURCE_LABEL) && /keine Messung/.test(FIRE_WEATHER_SOURCE_LABEL));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
