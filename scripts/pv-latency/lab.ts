/**
 * lab.ts — der In-Page-Teil des Laufzeit-Harnischs (Phase FI, AP0).
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
 * Nicht Teil von `npm run typecheck` (tsconfig.app.json: include = src) — esbuild streift
 * die Typen; die Typen hier sind Lesehilfe, keine Prüfung.
 */

import {
  httpStore, planPointSources, readCubePoint, loadHmodelManifest, readHmodelPoint,
  readStationPoint, readNowcastPoint,
} from '../../src/point/client';
import type { DecodedGrayPng } from '../../src/point/nowcastSample';
import { getPointForecast } from '../../src/pointForecast/pointForecast';
import { loadElevationLookup } from '../../src/fusion/elevation';
import type { Country } from '../../src/types';

const H = 3_600_000;
const now = () => performance.now();

/** PNG → Pixel über den Browser-Decoder (das, was ein Client wirklich täte). */
async function decodePngBrowser(bytes: Uint8Array): Promise<DecodedGrayPng> {
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close();
  // `sampleNowcastFrame` verlangt EINEN Kanal (der Node-Decoder liefert Graustufen nativ);
  // der Browser gibt immer RGBA — der Rotkanal IST der Grauwert. Befund für AP1: der
  // Client-Leser braucht genau diese Umsetzung, sonst wirft der erste INCA-Frame.
  const rgba = img.data;
  const gray = new Uint8Array(img.width * img.height);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = rgba[j];
  return { data: gray, width: img.width, height: img.height, channels: 1 };
}

interface PhaseTimes { [phase: string]: number }

/**
 * Der PD-D-Leser, genau in der Reihenfolge von `scripts/point/read-point.mjs` (seriell).
 * `parallel: true` zieht die Produkte nach dem Plan nebeneinander — die AP1-Frage, ohne
 * eine Zeile in `src/` zu ändern.
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

/** Der Live-Pfad von heute (das Produkt), wie ihn das Archiv mitschreibt. */
async function live(lat: number, lng: number, country: Country, hours = 240) {
  const T0 = now();
  try {
    const fc = await getPointForecast({ lat, lng, country, hours, includeRadarNowcast: false, distribution: true, anchorMode: 'offset', signal: AbortSignal.timeout(90_000) });
    return {
      total: now() - T0, hours: fc.hours?.length ?? null, sourcesAvailable: fc.sourcesAvailable, nearestStations: fc.nearestStations?.length ?? null,
      elevation: fc.query?.elevation ?? null, withFusion: fc.hours?.some((h: { fusion?: unknown }) => h.fusion) ?? false,
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

/** Der DEM-Sampler des Live-Pfads (±0,2°-Box bei z9), allein gemessen. */
async function demLive(lat: number, lng: number) {
  const T0 = now();
  const lookup = await loadElevationLookup({ lngMin: lng - 0.2, lngMax: lng + 0.2, latMin: lat - 0.2, latMax: lat + 0.2 }, 9);
  const h = lookup.sample(lng, lat);
  return { total: now() - T0, elevation: Number.isFinite(h) ? Math.round(h) : null };
}

(window as unknown as { pfLab: unknown }).pfLab = { reader, live, terrain, demLive, ready: true };
