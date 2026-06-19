/* Offline-Generator für das gebündelte DACH-Klima-Grid (public/climaGrid.json).
 *
 * Quelle: DWD-Stationsmessungen über Meteostat (data.meteostat.net, CORS-frei,
 * KEIN Rate-Limit — dieselbe Quelle wie das Historie-Feature). Aus der
 * gebündelten DACH-Stationsliste wird ein räumlich entzerrtes Subset gewählt
 * (eine gut abgedeckte Station je ~0,6°-Bin) und je Station die ML-#1-
 * Klimatologie ({@link fitClimatology}) gefittet. Gespeichert werden NUR die
 * kompakten Fourier-Koeffizienten — der Runtime-Sampler (`climaField.ts`)
 * rekonstruiert daraus pro Karten-Zelle Mittel/Streuung/Nassrate.
 *
 * Lauf:
 *   npx esbuild src/ml/_buildClimaGrid.ts --bundle --platform=node --format=esm \
 *     --define:import.meta.env.DEV=false --outfile=src/ml/_buildClimaGrid.mjs \
 *     && node src/ml/_buildClimaGrid.mjs
 */
import { writeFileSync } from 'node:fs';
import { METEOSTAT_STATIONS, type StationTuple } from '../history/meteostatStations';
import { parseDailyCsv } from '../history/meteostatSource';
import { fitClimatology, fitHarmonic, type ClimaInput, type DayValue } from './climatology';
import { fitSnowCurve, transitionTemp, type SnowSample } from './snowModel';

const YEAR_START = 1995;
const YEAR_END = 2024;
const BIN_DEG = 0.6;          // räumliche Entzerrung
const MIN_RECORDS = 2500;     // ~8 Jahre Tageswerte → belastbarer Fit
const K = 3;
const TAU = 1;
const CONCURRENCY = 12;

const DAILY_URL = (year: number, id: string) => `https://data.meteostat.net/daily/${year}/${id}.csv.gz`;

async function gunzipText(res: Response): Promise<string> {
  if (typeof DecompressionStream !== 'undefined' && res.body) {
    return new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
  }
  return res.text();
}

/** Eine gut abgedeckte Station je Bin (max. Jahresspanne, möglichst aktuell). */
function decimate(stations: StationTuple[]): StationTuple[] {
  const byBin = new Map<string, StationTuple>();
  for (const s of stations) {
    const [, , lat, lon, , startY, endY] = s;
    if (endY < YEAR_START) continue; // keine relevante Abdeckung
    const key = `${Math.floor(lat / BIN_DEG)},${Math.floor(lon / BIN_DEG)}`;
    const cur = byBin.get(key);
    if (!cur) { byBin.set(key, s); continue; }
    const span = (t: StationTuple) => Math.min(YEAR_END, t[6]) - Math.max(YEAR_START, t[5]);
    // bevorzugt: größere Spanne, bei Gleichstand aktuelleres Enddatum
    if (span(s) > span(cur) || (span(s) === span(cur) && s[6] > cur[6])) byBin.set(key, s);
  }
  return [...byBin.values()];
}

interface StationData { recs: ClimaInput[]; tmin: DayValue[]; tmax: DayValue[]; snow: SnowSample[] }

async function fetchStation(s: StationTuple): Promise<StationData | null> {
  const [id, , , , , startY, endY] = s;
  const y0 = Math.max(YEAR_START, startY);
  const y1 = Math.min(YEAR_END, endY);
  const years: number[] = [];
  for (let y = y0; y <= y1; y++) years.push(y);
  const recs: ClimaInput[] = [];
  const tmin: DayValue[] = [];
  const tmax: DayValue[] = [];
  const snow: SnowSample[] = [];
  await Promise.all(years.map(async (year) => {
    try {
      const res = await fetch(DAILY_URL(year, id));
      if (!res.ok) return;
      for (const r of parseDailyCsv(await gunzipText(res))) {
        const tMean = r.tMeanC ?? (r.tMaxC != null && r.tMinC != null ? (r.tMaxC + r.tMinC) / 2 : null);
        if (r.tMinC != null) tmin.push({ doy: r.doy, y: r.tMinC });
        if (r.tMaxC != null) tmax.push({ doy: r.doy, y: r.tMaxC });
        // Schnee-Sample (ML #2): an Niederschlagstagen → Schneefall registriert?
        if (tMean != null && r.precipMm != null && r.precipMm >= TAU) {
          snow.push({ tempC: tMean, rh: r.humidityPct ?? null, isSnow: (r.snowCm != null && r.snowCm > 0) ? 1 : 0 });
        }
        if (tMean == null && r.precipMm == null) continue;
        recs.push({ doy: r.doy, year: r.year, tMean, precipMm: r.precipMm });
      }
    } catch { /* einzelnes Jahr fehlt → ignorieren */ }
  }));
  return recs.length >= MIN_RECORDS ? { recs, tmin, tmax, snow } : null;
}

interface OutStation {
  id: string; name: string; lat: number; lon: number; elev: number | null;
  tc: number[]; sc: number[]; wc: number[]; base: number; n: number;
  /** Tagesgang-Harmonische: tmin/tmax je doy → erwartete Stunden-Temperatur. */
  tnc: number[]; txc: number[];
  /** Gelernte Regen/Schnee-Übergangstemperatur T50 (°C, ML #2) — null, wenn
   *  zu wenige Schneetage für eine belastbare Kurve. */
  t50: number | null;
}

async function main() {
  const round = (v: number) => Math.round(v * 1e5) / 1e5;
  const chosen = decimate(METEOSTAT_STATIONS);
  console.log(`Stationen gesamt ${METEOSTAT_STATIONS.length} → entzerrt ${chosen.length} (Bin ${BIN_DEG}°)`);

  const out: OutStation[] = [];
  let done = 0, skipped = 0, ptr = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (ptr < chosen.length) {
      const s = chosen[ptr++];
      const data = await fetchStation(s).catch(() => null);
      done++;
      if (!data) { skipped++; if (done % 10 === 0) console.log(`  ${done}/${chosen.length} (${skipped} übersprungen)`); continue; }
      const m = fitClimatology(data.recs, TAU, K);
      // Tagesgang nur fitten, wenn genug tmin/tmax-Tage da sind (sonst leer → Runtime
      // fällt auf das Tagesmittel zurück).
      const tnc = data.tmin.length >= MIN_RECORDS ? fitHarmonic(data.tmin, K).map(round) : [];
      const txc = data.tmax.length >= MIN_RECORDS ? fitHarmonic(data.tmax, K).map(round) : [];
      // ML #2: Schnee/Regen-Grenze. Gate wie im Punktforecast: ≥50 Schneetage
      // UND physikalisch plausible T50 ∈ [−6,+6 °C] — sonst null (Tieflandstationen
      // mit zu wenigen/verrauschten Schneetagen liefern keine belastbare Kurve).
      const snowM = fitSnowCurve(data.snow, { minSnow: 50 });
      const t50raw = transitionTemp(snowM);
      const t50 = snowM.reliable && t50raw >= -6 && t50raw <= 6 ? round(t50raw) : null;
      out.push({
        id: s[0], name: s[1], lat: s[2], lon: s[3], elev: s[4],
        tc: m.tempCoeffs.map(round), sc: m.tempStdCoeffs.map(round),
        wc: m.wetCoeffs.map(round), base: round(m.baseWetRate), n: data.recs.length,
        tnc, txc, t50,
      });
      if (done % 10 === 0) console.log(`  ${done}/${chosen.length} (${skipped} übersprungen)`);
    }
  }));

  out.sort((a, b) => a.lat - b.lat || a.lon - b.lon);
  const payload = {
    meta: {
      source: 'DWD-Stationsmessungen via Meteostat (data.meteostat.net)',
      region: 'DACH', years: [YEAR_START, YEAR_END], binDeg: BIN_DEG, K, tau: TAU,
      lapsePerM: 0.0065, peakHour: 15, stationCount: out.length,
    },
    stations: out,
  };
  writeFileSync('public/climaGrid.json', JSON.stringify(payload));
  const withT50 = out.filter((o) => o.t50 != null).length;
  console.log(`\nGeschrieben: public/climaGrid.json — ${out.length} Stationen, ${skipped} ohne ausreichende Daten.`);
  console.log(`  davon mit gelernter T50 (ML #2): ${withT50}`);
}

main().catch((e) => { console.error(e); (globalThis as { process?: { exit: (n: number) => void } }).process?.exit(1); });
