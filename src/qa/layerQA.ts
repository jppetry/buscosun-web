/**
 * Automatisierter Layer-QA-Check (Regression) — QA P1-3.
 *
 * Vergleicht die buscosun-Punktwerte (aus `layerSampler`, also dem dekodierten
 * Gitter) an ~10 DACH-Punkten gegen die UNABHÄNGIGE Open-Meteo-`dwd-icon`-API
 * (eigene Pipeline, gleiches ICON-D2) zur AKTUELL ANGEZEIGTEN Validzeit. Pro
 * Variable ein Toleranz-Gate. Fängt künftige Valid-Time- (D1) und Decode-/
 * Einheits-Regressionen automatisch ab.
 *
 * Aufruf (dev): `await window.__bsQA()` — vorher die zu prüfenden Layer einmal
 * aktivieren (Temp/Wind/Böen/Wolken), damit ihre Gitter geladen sind.
 */
import type { WindSample, CloudSample } from './layerSampler';

export interface SampleApi {
  hour: () => number;
  temp: (lon: number, lat: number) => number | null;
  gust: (lon: number, lat: number) => number | null;
  wind: (lon: number, lat: number) => WindSample | null;
  clouds: (lon: number, lat: number) => CloudSample | null;
}

/** Repräsentative DACH-Punkte (Flachland/urban — Extremgipfel bewusst ausgespart,
 *  die unterliegen der bekannten Auflösungsgrenze D2/D3). */
const QA_POINTS: ReadonlyArray<readonly [string, number, number]> = [
  ['Hamburg', 53.551, 9.993], ['Berlin', 52.520, 13.405], ['Hannover', 52.375, 9.732],
  ['Köln', 50.937, 6.960], ['Frankfurt', 50.110, 8.682], ['Dresden', 51.050, 13.738],
  ['Stuttgart', 48.776, 9.182], ['München', 48.137, 11.575], ['Wien', 48.208, 16.373],
  ['Zürich', 47.377, 8.541],
];

const TOL = { temp: 1.5, windSpeed: 2, windDir: 25, gust: 3 } as const;

interface QaRow {
  layer: string; point: string; bus: number | string; ref: number | string;
  delta: number | null; tol: number; pass: boolean | null; note?: string;
}

function dirDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export async function runLayerQA(api: SampleApi): Promise<{
  pass: boolean; validHourUTC: string; tested: string[]; failed: QaRow[]; rows: QaRow[];
}> {
  const hour = api.hour();
  const targetMs = Date.now() + hour * 3600_000;
  const vh = new Date(Math.round(targetMs / 3600_000) * 3600_000); // nächste volle UTC-Stunde
  const date = vh.toISOString().slice(0, 10);
  const stamp = `${date}T${String(vh.getUTCHours()).padStart(2, '0')}:00`;

  const lats = QA_POINTS.map((p) => p[1]).join(',');
  const lons = QA_POINTS.map((p) => p[2]).join(',');
  const url = `https://api.open-meteo.com/v1/dwd-icon?latitude=${lats}&longitude=${lons}`
    + `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover`
    + `&wind_speed_unit=ms&start_date=${date}&end_date=${date}&timezone=UTC`;
  const om = await fetch(url).then((r) => r.json());
  const arr: any[] = Array.isArray(om) ? om : [om];

  const rows: QaRow[] = [];
  const tested = new Set<string>();

  for (let i = 0; i < QA_POINTS.length; i++) {
    const [name, lat, lon] = QA_POINTS[i];
    const h = arr[i]?.hourly; if (!h) continue;
    const k = h.time.indexOf(stamp); if (k < 0) continue;

    // Temperatur
    const t = api.temp(lon, lat);
    if (t != null) {
      tested.add('temp');
      const ref = h.temperature_2m[k]; const d = +(t - ref).toFixed(2);
      rows.push({ layer: 'temp', point: name, bus: +t.toFixed(1), ref, delta: d, tol: TOL.temp, pass: Math.abs(d) <= TOL.temp });
    }
    // Böen
    const g = api.gust(lon, lat);
    if (g != null) {
      tested.add('gust');
      const ref = h.wind_gusts_10m[k]; const d = +(g - ref).toFixed(2);
      rows.push({ layer: 'gust', point: name, bus: +g.toFixed(1), ref, delta: d, tol: TOL.gust, pass: Math.abs(d) <= TOL.gust });
    }
    // Wind (Speed + Richtung; Richtung nur bei nennenswerter Geschwindigkeit)
    const w = api.wind(lon, lat);
    if (w != null) {
      tested.add('wind');
      const rs = h.wind_speed_10m[k]; const ds = +(w.speed - rs).toFixed(2);
      rows.push({ layer: 'wind.speed', point: name, bus: +w.speed.toFixed(1), ref: rs, delta: ds, tol: TOL.windSpeed, pass: Math.abs(ds) <= TOL.windSpeed });
      if (w.speed >= 1 && rs >= 1) {
        const rd = h.wind_direction_10m[k]; const dd = +dirDelta(w.dir, rd).toFixed(0);
        rows.push({ layer: 'wind.dir', point: name, bus: Math.round(w.dir), ref: rd, delta: dd, tol: TOL.windDir, pass: dd <= TOL.windDir });
      }
    }
    // Wolken — Info (Gesamt vs. max der Schichten; ungated, da Total≠geschichtet)
    const c = api.clouds(lon, lat);
    if (c != null) {
      tested.add('clouds');
      const busTot = Math.max(c.low, c.mid, c.high); const ref = h.cloud_cover[k];
      rows.push({ layer: 'clouds(info)', point: name, bus: busTot, ref, delta: +(busTot - ref).toFixed(0), tol: 0, pass: null, note: `L${c.low}/M${c.mid}/H${c.high}` });
    }
  }

  const failed = rows.filter((r) => r.pass === false);
  return { pass: failed.length === 0, validHourUTC: stamp, tested: [...tested], failed, rows };
}

/**
 * Schneegrenzen-Geometrie-Check (P2-3): vergleicht die Gelände-Höhe der
 * Schneegrenzen-Linie mit der unabhängigen OM-Frostgrenze (`freezing_level_height`).
 * Die Linie markiert terrainTemp ≈ T50 (~+1 °C) → sollte ~150 m UNTER der 0-°C-
 * Frostgrenze liegen. Greift erst bei winterlicher Lage; ist keine Linie sichtbar
 * (Frostgrenze über allem Gelände), wird ehrlich `snow:false` gemeldet.
 */
export async function runSnowlineQA(
  geojson: GeoJSON.FeatureCollection | null,
  demAt: (lon: number, lat: number) => number | null,
): Promise<{ snow: boolean; pass: boolean; note: string; validHourUTC?: string; rows?: unknown[] }> {
  const verts: [number, number][] = [];
  for (const f of geojson?.features ?? []) {
    const g = f.geometry as GeoJSON.Geometry;
    const lns = g?.type === 'MultiLineString' ? g.coordinates : g?.type === 'LineString' ? [g.coordinates] : [];
    for (const ln of lns as number[][][]) for (const c of ln) verts.push([c[0], c[1]]);
  }
  if (verts.length === 0) {
    return { snow: false, pass: true, note: 'Keine Schneegrenze sichtbar (Frostgrenze über allem DACH-Gelände) — die Geometrie-Verifikation greift bei winterlicher Lage.' };
  }
  const step = Math.max(1, Math.floor(verts.length / 12));
  const pick = verts.filter((_, i) => i % step === 0).slice(0, 12);
  const vh = new Date(Math.round(Date.now() / 3600_000) * 3600_000);
  const date = vh.toISOString().slice(0, 10);
  const stamp = `${date}T${String(vh.getUTCHours()).padStart(2, '0')}:00`;
  const lats = pick.map((p) => p[1].toFixed(3)).join(',');
  const lons = pick.map((p) => p[0].toFixed(3)).join(',');
  const url = `https://api.open-meteo.com/v1/dwd-icon?latitude=${lats}&longitude=${lons}`
    + `&hourly=freezing_level_height&start_date=${date}&end_date=${date}&timezone=UTC`;
  const om = await fetch(url).then((r) => r.json());
  const arr: any[] = Array.isArray(om) ? om : [om];
  const OFFSET = 150; // T50≈+1 °C ⇒ Schneegrenze ~150 m unter der 0-°C-Frostgrenze
  const TOL = 350;    // m — gröberes Konturgitter + gelernte T50-Anomalie
  const rows: Array<{ lon: number; lat: number; snowlineAlt: number; freezingLevel: number; delta: number; pass: boolean }> = [];
  for (let i = 0; i < pick.length; i++) {
    const [lon, lat] = pick[i];
    const h = arr[i]?.hourly; if (!h) continue;
    const k = h.time.indexOf(stamp); if (k < 0) continue;
    const frz = h.freezing_level_height[k];
    const busAlt = demAt(lon, lat);
    if (busAlt == null || frz == null) continue;
    const delta = Math.round(busAlt - (frz - OFFSET));
    rows.push({ lon: +lon.toFixed(2), lat: +lat.toFixed(2), snowlineAlt: Math.round(busAlt), freezingLevel: Math.round(frz), delta, pass: Math.abs(delta) <= TOL });
  }
  const failed = rows.filter((r) => !r.pass);
  return { snow: true, pass: failed.length === 0, validHourUTC: stamp, note: `${rows.length} Stützpunkte vs. OM-Frostgrenze (±${TOL} m).`, rows };
}
