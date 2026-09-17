/**
 * lab.ts — der In-Page-Teil des Laufzeit-Harnischs (Phase FI, AP0/AP1).
 *
 * Wird von `scripts/verify-pv-latency.mjs` mit esbuild zu EINEM ESM-Bündel gebaut und in
 * eine leere Seite unter `http://127.0.0.1:<port>/` geladen. Das Bündel enthält die echten
 * Module des Repos (Cube-Leser `src/point/client`, Live-Pfad `getPointForecast`, DEM-Sampler)
 * — nichts davon berührt das App-Bundle, die Ratsche in `budget.json` bleibt unangetastet.
 *
 * Warum eine eigene Seite und nicht die App: die App hat für keinen dieser Pfade einen
 * Einstieg, den ein Skript ohne UI auslösen könnte, und ein Debug-Haken im Start-Chunk
 * kostete eagerJs (0 KB Luft). Die Seite misst denselben Browser-Netzstapel gegen dasselbe
 * CDN; nur das Bündel ist ein anderes.
 *
 * Jede Messfunktion gibt Wandzeiten je Phase (performance.now) zurück; die Bytes und
 * `x-cache` je Abruf liest der Harnisch über CDP mit (Network.*), nicht die Seite.
 *
 * AP1: `bundle()` ist der parallele Leseweg (`readPointBundle`) mit IndexedDB-Cache,
 * Worker-Dekodierung und Zwei-Skalen-DEM — das, was der Cube-Pfad von buscosun Fusion ab
 * AP2 als Eingabe bekommt. Der Worker liegt unter `/decodeWorker.ts` (der Harnisch bündelt
 * und bedient ihn; `new URL('./decodeWorker.ts', import.meta.url)` löst dorthin auf).
 *
 * Nicht Teil von `npm run typecheck` (tsconfig.app.json: include = src) — esbuild streift
 * die Typen; die Typen hier sind Lesehilfe, keine Prüfung.
 */

import {
  httpStore, planPointSources, readCubePoint, loadHmodelManifest, readHmodelPoint,
  readStationPoint, readNowcastPoint,
  readPointBundle, cachedStore, idbBackend, memoryBackend, newCacheStats,
  decodeGrayPngBrowser, decodeRgbaPngBrowser, configureDecodePool, decodePoolInfo,
  loadTerrainAtPoint, TERRAIN_SCALES,
} from '../../src/point/client';
import type { DecodedGrayPng } from '../../src/point/nowcastSample';
import { getPointForecast } from '../../src/pointForecast/pointForecast';
// AP2: der Cube-Pfad registriert sich beim Laden — das Lab ist der Verbraucher, der ihn lädt.
import { clearCubeForecastCache } from '../../src/pointForecast/cubeSource';
import { quantileOf } from '../../src/pointForecast/fusion/dist';
import { loadElevationLookup } from '../../src/fusion/elevation';
import type { Country } from '../../src/types';
import type { PointForecast } from '../../src/pointForecast/types';

const H = 3_600_000;
const now = () => performance.now();

/** PNG → Pixel über den Browser-Decoder (das, was ein Client wirklich täte). */
async function decodePngBrowser(bytes: Uint8Array): Promise<DecodedGrayPng> {
  return decodeGrayPngBrowser(bytes);
}

interface PhaseTimes { [phase: string]: number }

/**
 * Der PD-D-Leser, genau in der Reihenfolge von `scripts/point/read-point.mjs` (seriell).
 * `parallel: true` zieht die Produkte nach dem Plan nebeneinander — die AP1-Frage, ohne
 * eine Zeile in `src/` zu ändern. Bleibt als BASISLINIE im Harnisch.
 */
async function reader(lat: number, lon: number, opts: { parallel?: boolean; hours?: number; nowcast?: boolean } = {}) {
  const t: PhaseTimes = {};
  const T0 = now();
  const store = httpStore({ timeoutMs: 20_000 });
  const nowMs = Date.now();
  const hours = opts.hours ?? 336;

  let s = now();
  const plan = await planPointSources(store, { lat, lon, elevationM: null, nowMs, stepH: 1, fromMs: nowMs, toMs: nowMs + hours * H });
  t.plan = now() - s;
  if (!plan) return { error: 'kein Plan (index.json?)', total: now() - T0, t, stats: store.stats };

  const needTiers = new Set<string>();
  let needStation = false, needNowcast = false;
  for (const d of plan.decisions) {
    for (const c of [d.primary, d.alternative, d.precip, d.uncertainty]) {
      if (!c) continue;
      if (c.product.startsWith('cube-')) needTiers.add(c.product.slice(5));
      if (c.product === 'stations') needStation = true;
      if (c.product === 'nowcast') needNowcast = true;
    }
  }
  const tiers = [...needTiers] as Array<'t1' | 't2' | 't3'>;
  const nowcastDecision = plan.decisions.find((d) => d.precip?.product === 'nowcast');
  const doNowcast = needNowcast && opts.nowcast !== false && !!nowcastDecision;

  const skips: string[] = [];
  const readTier = async (tier: 't1' | 't2' | 't3') => {
    const s0 = now();
    const r = await readCubePoint(store, plan.index, tier, lat, lon, { onSkip: (reason) => skips.push(reason) });
    t[`cube.${tier}`] = now() - s0;
    return r ? { steps: r.steps?.length ?? null, manifestFrom: r.manifestFrom ?? null } : null;
  };
  const readHm = async () => {
    const s0 = now();
    const hm = await loadHmodelManifest(store);
    const r = hm && tiers[0] ? await readHmodelPoint(store, hm, tiers[0], lat, lon) : null;
    t.hmodel = now() - s0;
    return r ? 'ok' : null;
  };
  const readSt = async () => {
    if (!(needStation && plan.station.manifest && plan.station.candidate)) return null;
    const s0 = now();
    const r = await readStationPoint(store, plan.station.manifest, plan.station.candidate);
    t.station = now() - s0;
    return r ? { steps: r.steps?.length ?? null } : null;
  };
  const readNc = async () => {
    if (!doNowcast) return null;
    const s0 = now();
    const r = await readNowcastPoint(store, nowcastDecision!.precip!.detail as never, lat, lon, {
      nowMs, decodePng: decodePngBrowser,
      fromMs: nowcastDecision!.atMs - 30 * 60_000,
      untilMs: nowMs + 3 * H + 30 * 60_000,
    });
    t.nowcast = now() - s0;
    return r ? { frames: r.frames?.length ?? null, probes: r.probes } : null;
  };

  let cube: Record<string, unknown> = {}, hmodel: unknown = null, station: unknown = null, nowcast: unknown = null;
  s = now();
  if (opts.parallel) {
    const [c, h, st, nc] = await Promise.all([
      Promise.all(tiers.map(async (tier) => [tier, await readTier(tier)] as const)),
      readHm(), readSt(), readNc(),
    ]);
    cube = Object.fromEntries(c); hmodel = h; station = st; nowcast = nc;
  } else {
    for (const tier of tiers) cube[tier] = await readTier(tier);
    hmodel = await readHm();
    station = await readSt();
    nowcast = await readNc();
  }
  t.read = now() - s;
  const total = now() - T0;
  return {
    total, t, stats: store.stats, tiers, cube, hmodel, station, nowcast, skips,
    plan: { segments: plan.segments?.length ?? null, station: plan.station?.accepted ?? null, nowcast: plan.nowcast?.covering ?? null },
  };
}

// ── AP1: der parallele Leseweg ────────────────────────────────────────────
// EIN Cache-Backend je Seite (= je Browser-Kontext im Harnisch): der erste Aufruf in
// einem Kontext ist „kalt-neu", der zweite „warm" (IndexedDB), ohne dass die Seite
// etwas dafür tun muss.
const cacheBackend = idbBackend() ?? memoryBackend();
const poolDefault = () => Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 3));

async function bundle(lat: number, lon: number, opts: {
  hours?: number; cache?: boolean; decode?: 'worker' | 'main'; terrain?: boolean; nowcast?: boolean; timeoutMs?: number;
} = {}) {
  const T0 = now();
  const cacheStats = newCacheStats();
  const inner = httpStore({ timeoutMs: opts.timeoutMs ?? 8_000 });
  const store = opts.cache === false ? inner : cachedStore(inner, cacheBackend, { stats: cacheStats });
  configureDecodePool({ workers: opts.decode === 'main' ? 0 : poolDefault() });
  const nowMs = Date.now();
  const progress: Record<string, number> = {};
  // §6: kein Long Task > 200 ms im Hauptthread — hier mitgeschrieben, nicht behauptet.
  const longTasks: number[] = [];
  let po: PerformanceObserver | null = null;
  try {
    po = new PerformanceObserver((list) => { for (const e of list.getEntries()) longTasks.push(Math.round(e.duration)); });
    po.observe({ type: 'longtask', buffered: false });
  } catch { po = null; }
  const b = await readPointBundle(
    { lat, lon, nowMs, fromMs: nowMs, toMs: nowMs + (opts.hours ?? 336) * H, stepH: 1 },
    {
      store,
      decodePng: decodeGrayPngBrowser,
      nowcast: opts.nowcast !== false,
      terrain: opts.terrain === false ? false : {
        decodeRgba: decodeRgbaPngBrowser,
        cache: opts.cache === false ? null : cacheBackend,
        noResultCache: opts.cache === false,
      },
      onProgress: (e) => { progress[e.stage] = e.ms; },
    },
  );
  const total = now() - T0;
  await new Promise((r) => setTimeout(r, 0));
  po?.disconnect();
  const cube = Object.fromEntries(Object.entries(b.cube).map(([t, s]) => [t, s
    ? { steps: s.steps.length, manifestFrom: s.manifestFrom, bytes: s.chunk.bytes, filled: s.filledPlanes.length, sources: s.sources.length, note: s.provenanceNote ?? null }
    : null]));
  return {
    total, timing: b.timing, progress, stats: b.stats, cache: cacheStats, decode: decodePoolInfo(),
    longTasks, longTaskMax: longTasks.length ? Math.max(...longTasks) : 0,
    tiers: b.tiers, cube,
    station: b.station ? { id: b.station.station.id, steps: b.station.steps.length, bytes: b.station.bundle.bytes, path: b.station.bundle.path } : null,
    stationChoice: b.stationChoice ? { accepted: b.stationChoice.accepted, reason: b.stationChoice.reason, elevationM: b.stationChoice.elevationM } : null,
    nowcast: b.nowcast.map((n) => ({ source: n.sourceId, frames: n.frames.length, inSlot: n.framesInSlot, fetched: n.framesFetched, probes: n.probes, bytes: n.bytes, leads: n.frames.map((f) => f.lead) })),
    hmodel: Object.fromEntries(Object.entries(b.hmodel).map(([t, h]) => [t, h ? h.byColumn : null])),
    urban: b.urban ? b.urban.byColumn : null,
    terrain: b.terrain ? {
      elevationM: b.terrain.elevationM, tpi500M: b.terrain.tpi500M, tpi2000M: b.terrain.tpi2000M, svf: b.terrain.svf,
      slopeDeg: b.terrain.slopeDeg, tiles: b.terrain.tiles, fromCache: b.terrain.fromCache, timing: b.terrain.timing,
    } : null,
    plan: b.plan ? { segments: b.plan.segments.length, gaps: b.plan.gaps.length, primary0: b.plan.decisions[0]?.primary?.product ?? null } : null,
    skips: b.skips, notes: b.notes, errors: b.errors,
  };
}

/** Die Zeitreihe einer Vorhersage, kompakt — für den Vergleich Cube ↔ Live im Harnisch (AP2). */
function seriesOf(fc: PointForecast) {
  const r2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
  return fc.hours.map((h) => ({
    t: h.timestamp.getTime(), T: r2(h.temperature), ws: r2(h.windSpeed), gust: r2(h.gustSpeed), rr: r2(h.precipitation),
    clct: r2(h.cloudCoverTotal), rh: r2(h.relativeHumidity), src: h.contributingSources,
    // Verteilung, wo vorhanden: q10/q90 der Temperatur.
    Tq10: h.fusion?.temperature ? r2(quantileOf(h.fusion.temperature.dist, 0.1)) : null,
    Tq90: h.fusion?.temperature ? r2(quantileOf(h.fusion.temperature.dist, 0.9)) : null,
  }));
}

/** Der Live-Pfad von heute (das Produkt), wie ihn das Archiv mitschreibt. */
async function live(lat: number, lng: number, country: Country, hours = 240, opts: { series?: boolean; radar?: boolean } = {}) {
  const T0 = now();
  try {
    const fc = await getPointForecast({ lat, lng, country, hours, includeRadarNowcast: !!opts.radar, distribution: true, anchorMode: 'offset', signal: AbortSignal.timeout(90_000) });
    return {
      total: now() - T0, hours: fc.hours?.length ?? null, sourcesAvailable: fc.sourcesAvailable, nearestStations: fc.nearestStations?.length ?? null,
      elevation: fc.query?.elevation ?? null, withFusion: fc.hours?.some((h: { fusion?: unknown }) => h.fusion) ?? false,
      series: opts.series ? seriesOf(fc) : undefined,
    };
  } catch (e) {
    return { total: now() - T0, error: String((e as Error)?.message ?? e) };
  }
}

/**
 * AP2: der Cube-Pfad Ende-zu-Ende — `getPointForecast({ pointSource: 'cube' })`, also Lesen
 * (AP1-Leser mit IndexedDB, Worker, Zwei-Skalen-DEM), Klimatologie, buscosun Fusion auf der
 * Cube-Achse und Abbildung auf `PointForecast`. `fresh: true` leert vorher den Ergebnis-Cache
 * des Pfads (der zweite Aufruf misst dann IndexedDB + Rechnung, nicht ein gemerktes Objekt).
 */
async function cube(lat: number, lng: number, country: Country, opts: { hours?: number; nowcast?: boolean; fresh?: boolean; series?: boolean } = {}) {
  if (opts.fresh) clearCubeForecastCache();
  const T0 = now();
  try {
    const fc = await getPointForecast({ lat, lng, country, hours: opts.hours ?? 336, pointSource: 'cube', includeRadarNowcast: opts.nowcast !== false });
    const c = fc.cube as { timing?: Record<string, unknown>; provenance?: Record<string, unknown>; flags?: unknown[]; notes?: string[]; skips?: string[]; errors?: string[]; stats?: unknown; axis?: { native?: number[]; seams?: number[]; perTier?: unknown } } | undefined;
    return {
      total: now() - T0, hours: fc.hours.length, sourcesAvailable: fc.sourcesAvailable, elevation: fc.query.elevation,
      timing: c?.timing ?? null, provenance: c?.provenance ?? null, axis: c?.axis ? { native: c.axis.native?.length, seams: c.axis.seams, perTier: c.axis.perTier } : null,
      flags: c?.flags?.length ?? 0, notes: c?.notes ?? [], skips: c?.skips ?? [], errors: c?.errors ?? [], stats: c?.stats ?? null, decode: decodePoolInfo(),
      series: opts.series ? seriesOf(fc) : undefined,
    };
  } catch (e) {
    return { total: now() - T0, error: String((e as Error)?.message ?? e) };
  }
}

const TPL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const lng2x = (lng: number, z: number) => (lng + 180) / 360 * 2 ** z;
const lat2y = (lat: number, z: number) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z; };

/**
 * Terrain-Kacheln, die ein Radius `radiusM` um den Punkt WIRKLICH braucht (Schnitt der
 * Bounding-Box mit dem Kachelraster) — nicht pauschal 3×3. Holen + im Browser dekodieren
 * (createImageBitmap + getImageData), wie der DEM-Sampler es täte.
 */
async function terrain(lat: number, lon: number, z: number, radiusM: number) {
  const dLat = radiusM / 110_574, dLon = radiusM / (111_320 * Math.cos(lat * Math.PI / 180));
  const x0 = Math.floor(lng2x(lon - dLon, z)), x1 = Math.floor(lng2x(lon + dLon, z));
  const y0 = Math.floor(lat2y(lat + dLat, z)), y1 = Math.floor(lat2y(lat - dLat, z));
  const list: Array<[number, number]> = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) list.push([x, y]);
  const T0 = now();
  let bytes = 0, decodeMs = 0, failed = 0;
  await Promise.all(list.map(async ([x, y]) => {
    try {
      const r = await fetch(TPL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
      const b = await r.arrayBuffer(); bytes += b.byteLength;
      const d0 = now();
      const bmp = await createImageBitmap(new Blob([b], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height); const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0); ctx.getImageData(0, 0, bmp.width, bmp.height); bmp.close();
      decodeMs += now() - d0;
    } catch { failed += 1; }
  }));
  return { z, radiusM, tiles: list.length, bytes, total: now() - T0, decodeMs, failed };
}

/** AP1: das Zwei-Skalen-DEM (z11 Nahfeld + z8 Fernfeld) samt Rechnung, ohne Cache. */
async function terrain2(lat: number, lon: number) {
  const T0 = now();
  const r = await loadTerrainAtPoint(lat, lon, { decodeRgba: decodeRgbaPngBrowser, cache: null });
  return {
    total: now() - T0, scales: TERRAIN_SCALES, elevationM: r.elevationM, tpi500M: r.tpi500M, tpi2000M: r.tpi2000M,
    svf: r.svf, slopeDeg: r.slopeDeg, horizonDeg: r.horizonDeg, tiles: r.tiles, timing: r.timing,
  };
}

/**
 * Verbindungen wärmen, ohne eine Messdatei zu berühren: DNS + TLS zu jsDelivr und S3 kosten
 * beim ERSTEN Abruf eines Browser-Prozesses 1–2,5 s (München-Lauf 16.09.: index.json HIT mit
 * 2,4 s TTFB, S3-Kacheln 2,8 s). Das ist Maschine, nicht Leseweg — der Harnisch ruft es einmal
 * je Profil in einem eigenen Kontext auf, bevor er misst.
 */
async function prime() {
  const T0 = now();
  await Promise.allSettled([
    fetch('https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/point/sources.json', { cache: 'no-store' }),
    fetch('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/4/8/5.png', { cache: 'no-store' }),
  ]);
  return { total: now() - T0 };
}

/** Der DEM-Sampler des Live-Pfads (±0,2°-Box bei z9), allein gemessen. */
async function demLive(lat: number, lng: number) {
  const T0 = now();
  const lookup = await loadElevationLookup({ lngMin: lng - 0.2, lngMax: lng + 0.2, latMin: lat - 0.2, latMax: lat + 0.2 }, 9);
  const h = lookup.sample(lng, lat);
  return { total: now() - T0, elevation: Number.isFinite(h) ? Math.round(h) : null };
}

(window as unknown as { pfLab: unknown }).pfLab = { reader, bundle, live, cube, terrain, terrain2, demLive, prime, ready: true };
