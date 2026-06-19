/**
 * Pollen für AT/CH (und überall) via Open-Meteo Air-Quality (CAMS Europa).
 *
 * DWD-Pollen deckt nur DE ab; GeoSphere/MeteoSwiss haben keinen offenen Feed.
 * CAMS (über Open-Meteo, CORS-fähig, kein Key) liefert Konzentrationen
 * (Körner/m³) für Erle, Birke, Gräser, Beifuß, Ambrosia, Olive. Wir mappen sie
 * auf eine 0..6-Skala wie die DWD-Anzeige (Farb-/Label-Wiederverwendung).
 *
 * NUR per Opt-in (siehe ../optIn.ts) — Rate-Limit/Lizenz. Niemals Default.
 * Konzentrations-Schwellen sind gängige Richtwerte, keine medizinische Aussage.
 */

const ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';

type PollenCategory = 'tree' | 'grass' | 'weed';

interface SpeciesDef { variable: string; label: string; category: PollenCategory; }

/** CAMS-Pollenarten → deutsche Labels + Reizkategorie. */
const SPECIES: SpeciesDef[] = [
  { variable: 'alder_pollen', label: 'Erle', category: 'tree' },
  { variable: 'birch_pollen', label: 'Birke', category: 'tree' },
  { variable: 'grass_pollen', label: 'Gräser', category: 'grass' },
  { variable: 'mugwort_pollen', label: 'Beifuß', category: 'weed' },
  { variable: 'ragweed_pollen', label: 'Ambrosia', category: 'weed' },
  { variable: 'olive_pollen', label: 'Olive', category: 'tree' },
];

/** Untergrenzen (Körner/m³) für Belastungsstufe 1..4 je Kategorie. */
const THRESHOLDS: Record<PollenCategory, [number, number, number, number]> = {
  tree: [1, 10, 50, 100],
  grass: [1, 20, 50, 200],
  weed: [1, 6, 12, 25], // Kräuter (Ambrosia/Beifuß) reizen schon bei wenigen Körnern
};

/** Konzentration (Körner/m³) → Stufe 0..4 → 0..6-Skala (für DWD-Farben/Labels). */
export function concentrationToScale(value: number | null, category: PollenCategory): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  const th = THRESHOLDS[category];
  let level = 0;
  for (const t of th) if (value >= t) level++;
  return level * 1.5; // 0,1.5,3,4.5,6 ⇒ deckt sich mit der DWD-0..6-Skala
}

export interface OmPollenSpecies { key: string; label: string; today: number; tomorrow: number; dayAfter: number; }
export interface OpenMeteoPollen { fetchedAt: number; species: OmPollenSpecies[]; }

interface OmAirQualityJson { hourly?: { time?: string[] } & Record<string, (number | null)[] | string[] | undefined>; }

/** Pure Parse-/Aggregations-Logik (headless testbar): hourly → 3-Tages-Stufen. */
export function parseOmPollen(json: OmAirQualityJson, fetchedAt: number): OpenMeteoPollen {
  const time = json.hourly?.time;
  if (!Array.isArray(time) || time.length === 0) return { fetchedAt, species: [] };

  // Eindeutige lokale Kalendertage in Reihenfolge (timezone=auto ⇒ lokale Strings).
  const dayKeys: string[] = [];
  const dayOfIndex: number[] = [];
  for (const ts of time) {
    const day = String(ts).slice(0, 10);
    let di = dayKeys.indexOf(day);
    if (di < 0) { di = dayKeys.length; dayKeys.push(day); }
    dayOfIndex.push(di);
  }

  const species: OmPollenSpecies[] = SPECIES.map((sp) => {
    const series = json.hourly?.[sp.variable] as (number | null)[] | undefined;
    const dayMax = [0, 0, 0].map(() => -Infinity);
    if (Array.isArray(series)) {
      for (let i = 0; i < series.length; i++) {
        const d = dayOfIndex[i];
        if (d > 2) continue;
        const v = series[i];
        if (typeof v === 'number' && Number.isFinite(v) && v > dayMax[d]) dayMax[d] = v;
      }
    }
    const lvl = (d: number) => concentrationToScale(dayMax[d] > -Infinity ? dayMax[d] : null, sp.category);
    return { key: sp.variable, label: sp.label, today: lvl(0), tomorrow: lvl(1), dayAfter: lvl(2) };
  });

  return { fetchedAt, species };
}

/** Holt CAMS-Pollen für einen Ort (nur aufrufen, wenn Open-Meteo-Opt-in aktiv ist). */
export async function fetchOpenMeteoPollen(lat: number, lon: number, signal?: AbortSignal): Promise<OpenMeteoPollen> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: SPECIES.map((s) => s.variable).join(','),
    timezone: 'auto',
    forecast_days: '4',
  });
  const res = await fetch(`${ENDPOINT}?${params}`, { signal });
  if (!res.ok) throw new Error(`Open-Meteo Air-Quality ${res.status}`);
  const json = (await res.json()) as OmAirQualityJson;
  return parseOmPollen(json, Date.now());
}

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface OmPollenCheck { case: string; ok: boolean }

export function verifyOmPollen(): { checks: OmPollenCheck[]; passed: number; failed: number } {
  const checks: OmPollenCheck[] = [];
  const add = (c: string, ok: boolean) => checks.push({ case: c, ok });

  add('tree 0 → 0', concentrationToScale(0, 'tree') === 0);
  add('tree null → 0', concentrationToScale(null, 'tree') === 0);
  add('tree 5 → niedrig (1.5)', concentrationToScale(5, 'tree') === 1.5);
  add('tree 60 → hoch (4.5)', concentrationToScale(60, 'tree') === 4.5);
  add('tree 200 → sehr hoch (6)', concentrationToScale(200, 'tree') === 6);
  add('grass 30 → mittel (3)', concentrationToScale(30, 'grass') === 3);
  add('weed 8 → mittel (3)', concentrationToScale(8, 'weed') === 3);
  add('weed 30 → sehr hoch (6)', concentrationToScale(30, 'weed') === 6);

  const json: OmAirQualityJson = {
    hourly: {
      time: ['2026-06-12T00:00', '2026-06-12T13:00', '2026-06-13T13:00', '2026-06-14T13:00'],
      birch_pollen: [2, 80, 5, 0],
      grass_pollen: [10, 250, 30, 1],
      ragweed_pollen: [null, null, null, null],
    } as OmAirQualityJson['hourly'],
  };
  const parsed = parseOmPollen(json, 123);
  const birke = parsed.species.find((s) => s.label === 'Birke')!;
  const graeser = parsed.species.find((s) => s.label === 'Gräser')!;
  const ambrosia = parsed.species.find((s) => s.label === 'Ambrosia')!;
  add('parse: Birke heute (max 80 tree) → hoch 4.5', birke.today === 4.5);
  add('parse: Birke übermorgen (0) → 0', birke.dayAfter === 0);
  add('parse: Gräser heute (max 250 grass) → 6', graeser.today === 6);
  add('parse: Ambrosia alle null → 0', ambrosia.today === 0 && ambrosia.tomorrow === 0);
  add('parse: 6 Arten zurück', parsed.species.length === 6);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyOmPollen: typeof verifyOmPollen }).__verifyOmPollen = verifyOmPollen;
}
