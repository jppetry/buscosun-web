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
    // Cache je Station UND Jahr (V-BH-4, Jans Vorgabe „hochperformant"): vorher lud JEDER Aufruf
    // das ganze Stationsinventar (bis 33 Jahresdateien, ~15 s) — die Brandradar-Detailkarte braucht
    // ein bis zwei Jahre. Die Historie-Seite fragt weiter die volle Reihe und bekommt dieselben Dateien.
    const yStart = Math.max(this.minYear, st.startYear, startYear);
    const yEnd = Math.min(new Date().getFullYear(), st.endYear, endYear);
    const years: number[] = [];
    for (let y = yStart; y <= yEnd; y++) years.push(y);
    const perYear = await pMap(years, 6, async (year) => {
      const key = `${st.id}:${year}`;
      let p = this.dailyCache.get(key);
      if (!p) {
        // OHNE das Signal des Aufrufers: ein geteilter Cache darf nicht am Abbruch des ERSTEN
        // Aufrufers hängen — sonst bekommt jeder spätere „signal is aborted" (BH4-Browserbefund;
        // Lehre GBP1 (3)). Abgebrochen wird unten, nach dem Warten, über das eigene Signal.
        p = (async () => {
          try {
            const res = await fetch(DAILY_URL(year, st.id));
            if (!res.ok) return [] as DailyRecord[];
            return parseDailyCsv(await gunzipText(res));
          } catch {
            return [] as DailyRecord[];
          }
        })();
        this.dailyCache.set(key, p);
        p.catch(() => { if (this.dailyCache.get(key) === p) this.dailyCache.delete(key); });
      }
      return p;
    });
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const all = perYear.flat().sort((a, b) => a.dateISO.localeCompare(b.dateISO));
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
/**
 * Spalten **aus dem Header**, nicht aus festen Indizes: die Dateien haben je Station einen
 * anderen Spaltensatz (Nideggen-Schmidt führt weder `wpgt` noch `tsun` — mit festem Index 17
 * stand dort der Luftdruck 1017,5 hPa als „Wind max 1.018 km/h", BH4-Browserbefund 2026-08-23).
 * Dazu je Wert die `*_source`-Spalte: Meteostat füllt Lücken mit Modellwerten
 * (`metno_forecast`, `model`) — die stehen in `modelFilled`, damit eine Karte, die „gemessen"
 * sagt, es nur für Messwerte sagt.
 */
const DAILY_FALLBACK_HEADER = 'year,month,day,temp,temp_source,tmin,tmin_source,tmax,tmax_source,rhum,rhum_source,prcp,prcp_source,snwd,snwd_source,wspd,wspd_source,wpgt,wpgt_source,pres,pres_source,tsun,tsun_source,cldc,cldc_source';

export function parseDailyCsv(text: string): DailyRecord[] {
  const out: DailyRecord[] = [];
  const lines = text.split('\n');
  const headerLine = lines.find((l) => /^year,month,day/.test(l)) ?? DAILY_FALLBACK_HEADER;
  const col = new Map(headerLine.split(',').map((h, i) => [h.trim(), i]));
  const idx = (name: string) => col.get(name) ?? -1;
  const I = { temp: idx('temp'), tmin: idx('tmin'), tmax: idx('tmax'), rhum: idx('rhum'), prcp: idx('prcp'), snwd: idx('snwd'), wspd: idx('wspd'), wpgt: idx('wpgt'), tsun: idx('tsun') };
  const isModel = (src: string | undefined) => !!src && /forecast|model|era5/i.test(src);
  for (const line of lines) {
    if (!line) continue;
    const c = line.split(',');
    const y = Number(c[0]);
    if (!Number.isInteger(y) || y < 1700) continue; // Header/leere Zeilen
    const m = Number(c[1]), day = Number(c[2]);
    if (!m || !day) continue;
    const at = (i: number) => (i >= 0 ? num(c[i]) : null);
    const srcAt = (i: number) => (i >= 0 ? c[i + 1] : undefined);
    const snwd = at(I.snwd);
    const tsun = at(I.tsun);
    const gust = at(I.wpgt), wspd = at(I.wspd);
    const windMaxKmh = gust ?? wspd;
    const modelFilled: NonNullable<DailyRecord['modelFilled']> = [];
    if (at(I.tmax) != null && isModel(srcAt(I.tmax))) modelFilled.push('tMaxC');
    if (at(I.temp) != null && isModel(srcAt(I.temp))) modelFilled.push('tMeanC');
    if (at(I.tmin) != null && isModel(srcAt(I.tmin))) modelFilled.push('tMinC');
    if (at(I.rhum) != null && isModel(srcAt(I.rhum))) modelFilled.push('humidityPct');
    if (at(I.prcp) != null && isModel(srcAt(I.prcp))) modelFilled.push('precipMm');
    if (windMaxKmh != null && isModel(gust != null ? srcAt(I.wpgt) : srcAt(I.wspd))) modelFilled.push('windMaxKmh');
    out.push({
      dateISO: `${c[0]}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      year: y, month: m, day, doy: doyOf(y, m, day),
      tMeanC: at(I.temp), tMinC: at(I.tmin), tMaxC: at(I.tmax),
      humidityPct: at(I.rhum), precipMm: at(I.prcp),
      snowCm: snwd == null ? null : snwd / 10,
      windMaxKmh, windDirDeg: null,
      sunshineH: tsun == null ? null : tsun / 60,
      ...(modelFilled.length ? { modelFilled } : {}),
    });
  }
  return out;
}
