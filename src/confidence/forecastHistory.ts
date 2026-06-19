/**
 * Feature „Mehrere Modelle, ehrlicher Spread" — Verlaufshistorie (EPIC 3, US-6.3).
 *
 * Holt aus Open-Meteos Previous-Runs-API die Temperatur des aktuellen Laufs +
 * der letzten Läufe (vor 1/2/3 Tagen) für dieselben Zeitpunkte. Daraus wird je
 * Tag die Run-Serie der Tages-Tmax/Tmin (max/min über die Tagesstunden je Lauf)
 * sowie die stündlichen Ghost-Kurven (US-3.3) abgeleitet.
 */

const PREV_DAYS = 3;
/** Label je Lauf, älteste → neueste. */
export const RUN_LABELS = ['vor 3 Tagen', 'vorgestern', 'gestern', 'heute'];

export interface DayRuns {
  dateISO: string;
  /** Tages-Tmax je Lauf (älteste→neueste, „heute" zuletzt). NaN wo kein Lauf. */
  tMaxRuns: number[];
  tMinRuns: number[];
}

export interface GhostRun { label: string; points: { tMs: number; temp: number }[] }
export interface DayGhosts {
  dateISO: string;
  current: { tMs: number; temp: number }[];
  /** Frühere Läufe, neuester zuerst (für gestaffelte Deckkraft). */
  ghosts: GhostRun[];
}

export interface ForecastHistory {
  fetchedAt: number;
  runLabels: string[];
  days: DayRuns[];
  ghostsByDay: Record<string, DayGhosts>;
}

const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : NaN);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

export async function fetchForecastHistory(lat: number, lon: number, signal?: AbortSignal): Promise<ForecastHistory> {
  const prevKeys = Array.from({ length: PREV_DAYS }, (_, i) => `temperature_2m_previous_day${i + 1}`);
  const url = new URL('https://previous-runs-api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat.toFixed(4));
  url.searchParams.set('longitude', lon.toFixed(4));
  url.searchParams.set('hourly', ['temperature_2m', ...prevKeys].join(','));
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Open-Meteo Verlauf: HTTP ${res.status}`);
  const raw = (await res.json()) as { hourly?: Record<string, unknown> & { time?: string[] } } | Array<{ hourly?: Record<string, unknown> & { time?: string[] } }>;
  const data = Array.isArray(raw) ? raw[0] : raw;
  const hourly = data?.hourly;
  if (!hourly?.time?.length) throw new Error('Keine Verlaufsdaten für diesen Ort.');

  // Lauf-Serien älteste→neueste: [prev3, prev2, prev1, current].
  const runKeys = [...prevKeys.slice().reverse(), 'temperature_2m'];
  const times = hourly.time;

  // Stunden je Tag gruppieren.
  const byDay = new Map<string, number[]>(); // dateISO → hour indices
  times.forEach((t, h) => {
    const iso = t.slice(0, 10);
    (byDay.get(iso) ?? byDay.set(iso, []).get(iso)!).push(h);
  });

  const days: DayRuns[] = [];
  const ghostsByDay: Record<string, DayGhosts> = {};

  for (const [dateISO, idxs] of byDay) {
    const tMaxRuns: number[] = [], tMinRuns: number[] = [];
    for (const key of runKeys) {
      const series = arr(hourly[key]);
      const temps = idxs.map((h) => num(series[h])).filter(Number.isFinite);
      tMaxRuns.push(temps.length ? Math.max(...temps) : NaN);
      tMinRuns.push(temps.length ? Math.min(...temps) : NaN);
    }
    days.push({ dateISO, tMaxRuns, tMinRuns });

    // Ghost-Kurven: aktueller Lauf + frühere (neuester zuerst).
    const curSeries = arr(hourly['temperature_2m']);
    const current = idxs.map((h) => ({ tMs: new Date(times[h]).getTime(), temp: num(curSeries[h]) })).filter((p) => Number.isFinite(p.temp));
    const ghosts: GhostRun[] = prevKeys.map((key, i) => {
      const series = arr(hourly[key]);
      const points = idxs.map((h) => ({ tMs: new Date(times[h]).getTime(), temp: num(series[h]) })).filter((p) => Number.isFinite(p.temp));
      return { label: RUN_LABELS[RUN_LABELS.length - 2 - i], points }; // prev1→'gestern', prev2→'vorgestern', …
    }).filter((g) => g.points.length >= 2);
    ghostsByDay[dateISO] = { dateISO, current, ghosts };
  }

  return { fetchedAt: Date.now(), runLabels: RUN_LABELS, days, ghostsByDay };
}
