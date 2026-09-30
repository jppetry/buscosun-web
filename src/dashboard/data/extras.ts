/**
 * Alternativquellen des Dashboards (Phase DB, audit/dashboard.md §4) — nur Wege, die es auf der Plattform schon gibt:
 * zuerst `buscosun-data` (Radar-Spiegel, KONRAD3D, ICON-D2-Repack, Stationskatalog), dann bestehende Datenpfade von
 * buscosun-web (DWD-CAP/MeteoAlarm/GeoSphere, DWD-UV, DWD-Pollen, Terrarium). Keine neue externe Quelle.
 *
 * Jeder Loader liefert einen Zustand (`ok` / `na` mit Grund / `error`) statt eines Ersatzwerts; kein stiller Rückfall.
 * Warntexte bleiben wörtlich (Warn-Layer-Sonderregel, docs/API.md §7).
 */
import type { CellsIn, HailIn, IconD2In, NowcastIn, PlaceIn, PollenIn, TerrainIn, UvIn, WarningIn, WarningsIn } from '../model/types';
import { compass8 } from '../format';

const H = 3_600_000;
const isAbort = (e: unknown) => (e as { name?: string })?.name === 'AbortError';
const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------------------
// Amtliche Warnungen (P18–P21, P42)
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<string, number> = { Minor: 1, Moderate: 2, Severe: 3, Extreme: 4, Unknown: 0 };

export function warnChannel(country: PlaceIn['country']): string {
  return country === 'AT' ? 'GeoSphere Austria' : country === 'CH' ? 'MeteoAlarm CAP' : 'DWD CAP';
}

/** Warnungen, die am Punkt jetzt gelten oder in den nächsten 72 h beginnen. */
export async function loadWarnings(p: PlaceIn, nowMs: number, signal: AbortSignal): Promise<WarningsIn> {
  const channel = warnChannel(p.country);
  try {
    if (p.country === 'AT') {
      // Kopie mit Wächter des Brandradar-Lesers (atWarnings.ts) — sonst spaltet sich ein Chunk ab (+ eagerJs).
      const { fetchAtWarnings, parseAtTime } = await import('./atWarnings');
      const ctx = await fetchAtWarnings(p.lat, p.lon, signal);
      if (!ctx) return { state: 'error', channel, items: [], stampMs: null, note: 'GeoSphere-Abfrage ohne Antwort' };
      const items: WarningIn[] = ctx.warnings.map((w) => ({
        headline: w.typeLabel ? `${w.levelLabel ? `${w.levelLabel} · ` : ''}${w.typeLabel}` : null,
        description: w.text || null,
        sender: 'GeoSphere Austria',
        channel,
        onsetMs: parseAtTime(w.beginRaw),
        expiresMs: parseAtTime(w.endRaw),
        severityRank: w.level,
      })).filter((w) => (w.expiresMs ?? Infinity) > nowMs);
      return { state: 'ok', channel, items, stampMs: ctx.fetchedMs, note: ctx.gemeinde ? `Gemeinde ${ctx.gemeinde}` : null };
    }
    const { pointInRings } = await import('../../countryMask');
    const run = p.country === 'CH'
      ? await (await import('../../sources/meteoAlarmCh')).fetchChWarnings(signal)
      : await (await import('../../sources/dwdCapAlerts')).fetchDwdWarnings(signal);
    const { isActiveAt } = await import('../../warnings/warnField');
    const items: WarningIn[] = [];
    for (const a of run.alerts) {
      const hit = a.areas.some((ar) => pointInRings(ar.rings as unknown as number[][][], p.lon, p.lat));
      if (!hit) continue;
      const startsSoon = (a.onsetMs ?? a.effectiveMs ?? 0) < nowMs + 72 * H;
      if (!isActiveAt(a, nowMs) && !(startsSoon && (a.onsetMs ?? 0) > nowMs)) continue;
      items.push({
        headline: a.headline || null, description: a.description || null, sender: a.senderName || null, channel,
        onsetMs: a.onsetMs ?? a.effectiveMs, expiresMs: a.expiresMs, severityRank: SEVERITY_RANK[a.severity] ?? 0,
      });
    }
    const textMissing = 'textUnavailable' in run && typeof run.textUnavailable === 'number' && run.textUnavailable > 0
      ? `${run.textUnavailable} Meldung(en) ohne ladbaren Wortlaut nicht gezeigt` : null;
    return { state: 'ok', channel, items, stampMs: run.publishedMs ?? run.latestSentMs, note: textMissing };
  } catch (e) {
    if (isAbort(e)) throw e;
    return { state: 'error', channel, items: [], stampMs: null, note: `Warnungen nicht abrufbar (${why(e)}) — kein Ersatztext` };
  }
}

// ---------------------------------------------------------------------------
// UV (P44, P81) und Pollen (P82) — DWD, nur DE
// ---------------------------------------------------------------------------

export async function loadUv(p: PlaceIn, signal: AbortSignal): Promise<UvIn> {
  if (p.country !== 'DE') return { state: 'na', city: null, distanceKm: null, days: [], note: 'UV-Vorhersage des DWD nur für Deutschland' };
  try {
    const { fetchUvDailyForecast } = await import('../../sources/dwdUvForecast');
    const r = await fetchUvDailyForecast(p.lat, p.lon, signal);
    if (!r) return { state: 'na', city: null, distanceKm: null, days: [], note: 'kein DWD-UV-Ort mit Daten' };
    return { state: 'ok', city: r.city, distanceKm: Math.round(r.distanceMeters / 1000), days: [r.today, r.tomorrow, r.dayAfter], note: null };
  } catch (e) {
    if (isAbort(e)) throw e;
    return { state: 'error', city: null, distanceKm: null, days: [], note: `DWD-UV nicht abrufbar (${why(e)})` };
  }
}

/** Reihenfolge der Vorlage: Erle, Birke, Gräser, Roggen, Beifuß, Ambrosia, Esche, Hasel. */
const POLLEN_ORDER = ['Erle', 'Birke', 'Graeser', 'Roggen', 'Beifuss', 'Ambrosia', 'Esche', 'Hasel'] as const;

export async function loadPollen(p: PlaceIn, signal: AbortSignal): Promise<PollenIn> {
  if (p.country !== 'DE') return { state: 'na', region: null, species: [], note: 'DWD-Pollenflug nur für Deutschland' };
  try {
    const { fetchPollenForecast, POLLEN_LABEL } = await import('../../sources/dwdPollen');
    const r = await fetchPollenForecast(p.lat, p.lon, signal);
    if (!r) return { state: 'na', region: null, species: [], note: 'keine DWD-Pollenregion' };
    return {
      state: 'ok',
      region: r.region.includes(' · ') ? r.region.split(' · ').slice(1).join(' · ') : r.region,
      species: POLLEN_ORDER.map((k) => ({ name: POLLEN_LABEL[k], levels: [r.species[k].today, r.species[k].tomorrow, r.species[k].dayAfter] })),
      note: null,
    };
  } catch (e) {
    if (isAbort(e)) throw e;
    return { state: 'error', region: null, species: [], note: `DWD-Pollen nicht abrufbar (${why(e)})` };
  }
}

// ---------------------------------------------------------------------------
// Nowcast (P54–P56) — Radar-Spiegel in buscosun-data, derselbe Leser wie buscosun Fusion
// ---------------------------------------------------------------------------

const NOWCAST_LABEL: Record<string, string> = { radvor_rv: '0–2 h DE', inca: '0–3 h AT', combiprecip: 'nur Analyse CH' };

export async function loadNowcast(p: PlaceIn, nowMs: number, signal: AbortSignal): Promise<NowcastIn> {
  // Punkt-Leser über das Cube-Modul (Re-Export), damit die Punkt-Module im Cube-Chunk bleiben (AP11).
  const cs = await import('../../pointForecast/cubeSource');
  const { nowcastSourcesFor, readNowcastPoint, defaultCubeIo } = cs;
  const sources = nowcastSourcesFor(p.lat, p.lon);
  const horizonLabel = sources.map((s) => NOWCAST_LABEL[s] ?? s).join(' · ') || 'kein Radar';
  if (!sources.length) return { state: 'na', sources, horizonLabel, frames: [], slotMs: null, note: 'kein Radar-Nowcast deckt diesen Ort' };
  const io = defaultCubeIo();
  if (!io.decodePng) return { state: 'na', sources, horizonLabel, frames: [], slotMs: null, note: 'kein PNG-Dekoder' };
  // Die Quelle mit dem weitesten Horizont zuerst (INCA 3 h > RV 2 h > RZC 0 h); Frames alle 10 min (INCA alle 15 min).
  const order = [...sources].sort((a, b) => (b === 'inca' ? 1 : 0) - (a === 'inca' ? 1 : 0) || (a === 'combiprecip' ? 1 : 0) - (b === 'combiprecip' ? 1 : 0));
  for (const src of order) {
    const stepMin = src === 'inca' ? 15 : 10;
    const horizonMin = src === 'inca' ? 180 : src === 'combiprecip' ? 0 : 120;
    const atMs: number[] = [];
    for (let m = 0; m <= horizonMin; m += stepMin) atMs.push(nowMs - 10 * 60_000 + m * 60_000);
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    try {
      const series = await readNowcastPoint(io.store, src, p.lat, p.lon, { nowMs, decodePng: io.decodePng, atMs, toleranceMin: stepMin / 2 + 1, probeBatch: 4, priority: 'low' });
      if (!series || !series.frames.length) continue;
      const frames = series.frames
        .filter((f) => f.validAtMs != null && f.mmh != null)
        .map((f) => ({ t: f.validAtMs as number, mmh: f.mmh as number }));
      if (!frames.length) continue;
      const seen = new Set<number>();
      return {
        state: 'ok', sources, horizonLabel, slotMs: frames[0].t,
        frames: frames.filter((f) => (seen.has(f.t) ? false : (seen.add(f.t), true))),
        note: series.slotAgeMin > 30 ? `Radar-Slot ${series.slotAgeMin} min alt` : null,
      };
    } catch (e) {
      if (isAbort(e)) throw e;
    }
  }
  return { state: 'na', sources, horizonLabel, frames: [], slotMs: null, note: 'kein aktueller Radar-Slot im Spiegel' };
}

// ---------------------------------------------------------------------------
// Zellen (P57) — KONRAD3D, Hagel (P59) — MeteoSchweiz POH
// ---------------------------------------------------------------------------

export async function loadCells(p: PlaceIn, signal: AbortSignal): Promise<CellsIn> {
  const { nowcastSourcesFor } = await import('../../pointForecast/cubeSource');
  if (!nowcastSourcesFor(p.lat, p.lon).includes('radvor_rv')) return { state: 'na', text: 'außerhalb des DWD-Radarverbunds' };
  try {
    const { fetchKonrad3d } = await import('../../sources/dwdKonrad3d');
    const { cellLocationRelevance } = await import('../../radar/cellPolygons');
    const run = await fetchKonrad3d(signal);
    const rel = cellLocationRelevance(run, [p.lon, p.lat]);
    if (!rel) return { state: 'ok', text: 'keine' };
    if (rel.kind === 'eta') return { state: 'ok', text: `Ankunft in ${rel.earliestMin}–${rel.latestMin} min` };
    const km = rel.missKm < 10 ? Math.round(rel.missKm) : Math.round(rel.missKm / 5) * 5;
    return { state: 'ok', text: `Vorbeizug in ~${km} km` };
  } catch (e) {
    if (isAbort(e)) throw e;
    return { state: 'error', text: 'nicht abrufbar' };
  }
}

export async function loadHail(p: PlaceIn, nowMs: number, signal: AbortSignal): Promise<HailIn> {
  if (p.country !== 'CH') return { state: 'na', text: '— (nur CH)' };
  try {
    const { fetchSwissHail, isSwissHailSeason } = await import('../../sources/meteoSwissHail');
    if (!isSwissHailSeason(new Date(nowMs))) return { state: 'na', text: '— (Saison 1.4.–30.9.)' };
    const { inverseBilinear } = await import('../../pointForecast/quadSampler');
    const r = await fetchSwissHail('poh', signal);
    const uv = inverseBilinear(r.corners, p.lat, p.lon);
    if (!uv) return { state: 'na', text: '— (außerhalb des CH-Radars)' };
    const col = Math.min(r.width - 1, Math.max(0, Math.round(uv.u * (r.width - 1))));
    const row = Math.min(r.height - 1, Math.max(0, Math.round(uv.v * (r.height - 1))));
    const poh = r.values[row * r.width + col];
    return { state: 'ok', text: Number.isFinite(poh) ? `POH ${Math.round(poh * 100)} %` : '— (keine Abdeckung)' };
  } catch (e) {
    if (isAbort(e)) throw e;
    return { state: 'error', text: 'nicht abrufbar' };
  }
}

// ---------------------------------------------------------------------------
// Terrain (P68, P74, P79) — Terrarium-DEM entlang der Achse + Stationskatalog aus buscosun-data
// ---------------------------------------------------------------------------

const KM_PER_DEG_LAT = 111.32;
function offset(lat: number, lon: number, bearingDeg: number, km: number): [number, number] {
  const b = (bearingDeg * Math.PI) / 180;
  const dLat = (km * Math.cos(b)) / KM_PER_DEG_LAT;
  const dLon = (km * Math.sin(b)) / (KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lon + dLon];
}

/**
 * Schnitt durch den Ort in Windrichtung: von der Seite, aus der der Wind kommt (`axisDeg`), zur Gegenseite.
 * `s` < 0 liegt auf der Luv-Seite. Zoom 10 (≈ 150 m) für ±20 km, Zoom 9 für ±50 km.
 */
export async function loadTerrain(p: PlaceIn, axisDeg: number, halfKm: 20 | 50, signal: AbortSignal): Promise<TerrainIn> {
  const N = 181;
  const pts: Array<{ s: number; lat: number; lon: number }> = [];
  for (let i = 0; i < N; i++) {
    const s = -halfKm + (2 * halfKm * i) / (N - 1);
    const [lat, lon] = offset(p.lat, p.lon, s < 0 ? axisDeg : axisDeg + 180, Math.abs(s));
    pts.push({ s, lat, lon });
  }
  const lats = pts.map((x) => x.lat), lons = pts.map((x) => x.lon);
  try {
    const { loadElevationLookup } = await import('../../fusion/elevation');
    const grid = await loadElevationLookup({ latMin: Math.min(...lats), latMax: Math.max(...lats), lngMin: Math.min(...lons), lngMax: Math.max(...lons) }, halfKm === 20 ? 10 : 9, signal);
    const profile = pts.map((x) => ({ s: x.s, h: grid.sample(x.lon, x.lat) })).filter((x) => Number.isFinite(x.h));
    if (profile.length < N * 0.8) return { state: 'na', halfKm, axisDeg, profile: [], stations: [], outside: [], note: 'Geländekacheln unvollständig' };
    // Stationen des MOSMIX-Katalogs (buscosun-data point/stations/catalog.json — liegt nach der Fusion im Cache).
    const stations: TerrainIn['stations'] = [];
    const outside: string[] = [];
    try {
      const { defaultCubeIo, loadStationCatalog } = await import('../../pointForecast/cubeSource');
      const cat = await loadStationCatalog(defaultCubeIo().store, { priority: 'low' });
      if (cat) {
        const b = ((axisDeg + 180) * Math.PI) / 180; // Richtung +s
        const ex = Math.sin(b), ey = Math.cos(b);
        const cand = cat.stations.map((st) => {
          const dx = (st.lon - p.lon) * KM_PER_DEG_LAT * Math.cos((p.lat * Math.PI) / 180);
          const dy = (st.lat - p.lat) * KM_PER_DEG_LAT;
          return { st, along: dx * ex + dy * ey, across: -dx * ey + dy * ex, dist: Math.hypot(dx, dy) };
        }).filter((c) => c.dist <= 70 && c.dist > 1).sort((a, b2) => a.dist - b2.dist);
        const acrossMax = halfKm === 20 ? 3 : 5;
        for (const c of cand) {
          if (Math.abs(c.along) <= halfKm && Math.abs(c.across) <= acrossMax) stations.push({ name: c.st.name, s: c.along, h: c.st.elev, t: null });
          else if (outside.length < 2) outside.push(c.st.name);
        }
      }
    } catch (e) {
      if (isAbort(e)) throw e;
    }
    return { state: 'ok', halfKm, axisDeg, profile, stations: stations.slice(0, 4), outside, note: `Schnitt ${compass8(axisDeg)} → ${compass8(axisDeg + 180)}` };
  } catch (e) {
    if (isAbort(e)) throw e;
    return { state: 'error', halfKm, axisDeg, profile: [], stations: [], outside: [], note: `Gelände nicht abrufbar (${why(e)})` };
  }
}

// ---------------------------------------------------------------------------
// ICON-D2-Kasten (P84–P87) — Repack-Bilder aus buscosun-data, am Ort abgelesen
// ---------------------------------------------------------------------------

type ScalarFamily = 'thunder' | 'rotation' | 'gust' | 'snowFresh';

async function familyAtPoint(
  p: PlaceIn, nowMs: number, family: ScalarFamily, param: string, pick: (steps: number[], nowStep: number) => number[], signal: AbortSignal,
): Promise<{ values: Array<{ step: number; v: number | null }>; run: string } | null> {
  const { resolveLatestRun } = await import('../../sources/iconD2Precip');
  const { resolveRepackForRun, loadScalarStep, uvBoundsOf } = await import('../../sources/repackSource');
  const { runStr, runAt, steps } = await resolveLatestRun(param, signal, family);
  const nowStep = Math.max(0, Math.ceil((nowMs - runAt.getTime()) / H));
  const wanted = pick(steps, nowStep);
  if (!wanted.length) return null;
  const section = await resolveRepackForRun(runStr, family, wanted);
  const fam = section?.[family];
  if (!section || !fam) return null;
  const [x0, y0, x1, y1] = uvBoundsOf(section);
  const tu = ((p.lon + 180) / 360 - x0) / (x1 - x0);
  const tv = ((90 - p.lat) / 180 - y0) / (y1 - y0);
  if (tu < 0 || tu > 1 || tv < 0 || tv > 1) return { values: [], run: runStr };
  const values = await Promise.all(wanted.map(async (step) => {
    const img = await loadScalarStep(section, family, step, signal);
    if (!img) return { step, v: null };
    const col = Math.min(img.width - 1, Math.max(0, Math.floor(tu * img.width)));
    const row = Math.min(img.height - 1, Math.max(0, Math.floor(tv * img.height)));
    const i = (row * img.width + col) * 4;
    if (img.rgba[i + 3] < 15) return { step, v: null };
    return { step, v: fam.vMin + (img.rgba[i] / 255) * (fam.vMax - fam.vMin) };
  }));
  return { values, run: runStr };
}

export async function loadIconD2(p: PlaceIn, nowMs: number, signal: AbortSignal): Promise<IconD2In> {
  const every3 = (lim: number) => (steps: number[], now: number) => steps.filter((s) => s >= now && s <= now + lim && (s - now) % 3 === 0);
  try {
    const [thunder, rotation, gust, snow] = await Promise.all([
      familyAtPoint(p, nowMs, 'thunder', 'cape_ml', every3(12), signal),
      familyAtPoint(p, nowMs, 'rotation', 'uh_max', every3(12), signal),
      familyAtPoint(p, nowMs, 'gust', 'vmax_10m', every3(24), signal),
      // Neuschnee ist seit Laufbeginn aufsummiert ⇒ 24 h = Wert(jetzt + 24 h) − Wert(jetzt), gekappt am Horizont.
      familyAtPoint(p, nowMs, 'snowFresh', 'snow_gsp', (steps, now) => {
        const a = steps.filter((s) => s >= Math.max(1, now)).sort((x, y) => x - y)[0];
        const b = steps.filter((s) => s <= now + 24).sort((x, y) => y - x)[0];
        return a != null && b != null && b > a ? [a, b] : [];
      }, signal),
    ]);
    const max = (r: typeof thunder) => {
      const xs = (r?.values ?? []).map((x) => x.v).filter((x): x is number => x != null);
      return xs.length ? Math.max(...xs) : null;
    };
    const s = snow?.values ?? [];
    const fresh = s.length === 2 && s[0].v != null && s[1].v != null ? Math.max(0, s[1].v - s[0].v) : null;
    if (!thunder && !rotation && !gust && !snow) return { state: 'na', thunderMax: null, rotationMax: null, snowFresh24: null, gustMax: null, run: null, note: 'ICON-D2-Repack für den laufenden Lauf nicht im Daten-Repo' };
    return {
      state: 'ok', thunderMax: max(thunder), rotationMax: max(rotation), snowFresh24: fresh, gustMax: max(gust),
      run: thunder?.run ?? gust?.run ?? null, note: null,
    };
  } catch (e) {
    if (isAbort(e)) throw e;
    return { state: 'error', thunderMax: null, rotationMax: null, snowFresh24: null, gustMax: null, run: null, note: `ICON-D2 nicht abrufbar (${why(e)})` };
  }
}
