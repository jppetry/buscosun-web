/**
 * Feature „Wetterhistorie" — Datenquelle Meteostat (Open-Source, frei, ohne Key).
 *
 * Meteostat ist eine offene Plattform (Lib MIT). Tagesdaten kommen über die
 * **CORS-fähige** `data.meteostat.net` (eine gzip-CSV je Station & Jahr) — kein
 * Key, **kein Rate-Limit**. Für deutsche Orte sind das DWD-Stationsmessungen
 * (`*_source: dwd_daily`). Erfüllt die Projekt-Vorgabe (DWD, frei, unlimitiert).
 *
 * Die Stationsliste (`bulk.meteostat.net`) hat KEIN CORS → wird stattdessen als
 * DACH-Auszug mit Tages-Inventory in der App gebündelt (`meteostatStations.ts`,
 * dynamisch importiert/code-split). So findet die nächste Station ohne Netzwerk
 * statt; geladen werden nur die Jahre, die die Station tatsächlich abdeckt.
 *
 * Trade-offs ggü. ERA5: Stationsdaten (nächste Station) statt Gitter; das Tages-
 * file hat keine Windrichtung → Windrose entfällt (graceful), dafür Luftfeuchte.
 * Stundenwerte (Drill-down) kommen aus dem Open-Meteo-Archiv (winziger Einzeltag-
 * Call). Gunzip client-seitig via `DecompressionStream` (kein Backend/keine Lib).
 */

import type { DailyRecord } from './historyModel';
import { doyOf } from './historyModel';
import type { HistorySource, HourlyPoint } from './historySource';
import type { StationTuple } from './meteostatStations';

const DAILY_URL = (year: number, id: string) => `https://data.meteostat.net/daily/${year}/${id}.csv.gz`;

const num = (x: string | undefined): number | null => {
  if (x == null || x === '') return null;
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
};

async function gunzipText(res: Response): Promise<string> {
  if (typeof DecompressionStream !== 'undefined' && res.body) {
    return new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
  }
  return res.text();
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Begrenzte Parallelität für die Jahres-Fetches. */
async function pMap<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await worker(items[idx]); }
  }));
  return out;
}

export interface NearestStation { id: string; name: string; lat: number; lon: number; elevation: number | null; startYear: number; endYear: number; distanceKm: number }

/** Meteostat — DWD-/Stations-Tagesmessungen. */
export class MeteostatSource implements HistorySource {
  readonly id = 'meteostat';
  readonly label = 'DWD-Stationsmessungen (Meteostat)';
  readonly kind = 'measured' as const;
  readonly minYear = 1931;

  lastStation: { name: string; distanceKm: number; elevation: number | null } | null = null;

  private stationsP: Promise<StationTuple[]> | null = null;
  private dailyCache = new Map<string, Promise<DailyRecord[]>>();

  private stations(): Promise<StationTuple[]> {
    if (!this.stationsP) this.stationsP = import('./meteostatStations').then((m) => m.METEOSTAT_STATIONS);
    return this.stationsP;
  }

  async nearestStation(lat: number, lon: number): Promise<NearestStation> {
    const stations = await this.stations();
    let best = stations[0], bestD = Infinity;
    for (const s of stations) { const d = haversineKm(lat, lon, s[2], s[3]); if (d < bestD) { bestD = d; best = s; } }
    return { id: best[0], name: best[1], lat: best[2], lon: best[3], elevation: best[4], startYear: best[5], endYear: best[6], distanceKm: Math.round(bestD) };
  }

  async fetchDailyRange(lat: number, lon: number, startYear: number, endYear: number, signal?: AbortSignal): Promise<DailyRecord[]> {
    const st = await this.nearestStation(lat, lon);
    this.lastStation = { name: st.name, distanceKm: st.distanceKm, elevation: st.elevation };
    let p = this.dailyCache.get(st.id);
    if (!p) {
      const yStart = Math.max(this.minYear, st.startYear);
      const yEnd = Math.min(new Date().getFullYear(), st.endYear);
      const years: number[] = [];
      for (let y = yStart; y <= yEnd; y++) years.push(y);
      p = (async () => {
        const perYear = await pMap(years, 6, async (year) => {
          try {
            const res = await fetch(DAILY_URL(year, st.id), { signal });
            if (!res.ok) return [] as DailyRecord[];
            return parseDailyCsv(await gunzipText(res));
          } catch (e) {
            if ((e as { name?: string })?.name === 'AbortError') throw e;
            return [] as DailyRecord[];
          }
        });
        return perYear.flat().sort((a, b) => a.dateISO.localeCompare(b.dateISO));
      })();
      this.dailyCache.set(st.id, p);
    }
    const all = await p;
    if (!all.length) throw new Error('Für diesen Ort liegen keine Stationsdaten vor.');
    return all.filter((d) => d.year >= startYear && d.year <= endYear);
  }

  /** Stundenwerte aus dem Open-Meteo-Archiv (Einzeltag, kein Limit-Problem). */
  async fetchHourlyDay(lat: number, lon: number, dateISO: string, signal?: AbortSignal): Promise<HourlyPoint[]> {
    const url = new URL('https://archive-api.open-meteo.com/v1/archive');
    url.searchParams.set('latitude', lat.toFixed(4));
    url.searchParams.set('longitude', lon.toFixed(4));
    url.searchParams.set('start_date', dateISO);
    url.searchParams.set('end_date', dateISO);
    url.searchParams.set('hourly', ['temperature_2m', 'precipitation', 'wind_speed_10m'].join(','));
    url.searchParams.set('timezone', 'auto');
    const res = await fetch(url.toString(), { signal });
    if (!res.ok) throw new Error(`Stundenwerte: HTTP ${res.status}`);
    const data = (await res.json()) as { hourly?: Record<string, unknown> & { time?: string[] } };
    const h = data.hourly;
    if (!h?.time?.length) return [];
    const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
    const n = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const t = arr(h.temperature_2m), p = arr(h.precipitation), w = arr(h.wind_speed_10m);
    return h.time.map((ts, i) => ({ tMs: new Date(ts).getTime(), hour: new Date(ts).getHours(), tempC: n(t[i]), precipMm: n(p[i]), windKmh: n(w[i]) }));
  }
}

/**
 * Meteostat-Tages-CSV (data.meteostat.net, MIT Header):
 * year,month,day,temp,temp_source,tmin,…,tmax,…,rhum,…,prcp,…,snwd,…,wspd,…,wpgt,…,pres,…,tsun,…,cldc,…
 * Einheiten: °C · % · mm · mm(Schneehöhe) · km/h · km/h(Böe) · hPa · min(Sonne).
 * Keine Windrichtung in dieser Variante → windDirDeg bleibt null.
 */
export function parseDailyCsv(text: string): DailyRecord[] {
  const out: DailyRecord[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const c = line.split(',');
    const y = Number(c[0]);
    if (!Number.isInteger(y) || y < 1700) continue; // Header/leere Zeilen
    const m = Number(c[1]), day = Number(c[2]);
    if (!m || !day) continue;
    const snwd = num(c[13]);
    const tsun = num(c[21]);
    const gust = num(c[17]), wspd = num(c[15]);
    out.push({
      dateISO: `${c[0]}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      year: y, month: m, day, doy: doyOf(y, m, day),
      tMeanC: num(c[3]), tMinC: num(c[5]), tMaxC: num(c[7]),
      humidityPct: num(c[9]), precipMm: num(c[11]),
      snowCm: snwd == null ? null : snwd / 10,
      windMaxKmh: gust ?? wspd, windDirDeg: null,
      sunshineH: tsun == null ? null : tsun / 60,
    });
  }
  return out;
}
