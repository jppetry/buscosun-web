/**
 * terrain.ts — das Gelände am Punkt aus zwei Kachelskalen (Phase FI, AP1, E-F-6).
 *
 * ── Warum zwei Skalen ──────────────────────────────────────────────────────
 * PAP 1 braucht am Punkt: Höhe, TPI (500 m und 2 km), Hangneigung/Exposition,
 * Horizontwinkel in acht Oktanten bis 20 km und daraus den Sky-View-Faktor. AP0 hat
 * gemessen, was das mit EINER Skala kostet: die z9-Box des Live-Pfads (4 Kacheln,
 * ≈ 0,5 MB) braucht 0,7–1,0 s — mehr als drei warme Cube-Chunks — und war damit der
 * kritische Pfad, sobald das CDN warm ist (§9.0.4, Punkt 3). Der §0.2-Auslöser für ein
 * statisches Terrain-Produkt (> 400 ms) war gerissen; das Repo hat mit 307 MiB aber
 * keinen Platz dafür (R10). Entscheidung E-F-6: **kein Produkt, sondern zwei Skalen** —
 *
 *   • **Nahfeld z11** (≈ 76 m/px bei 47 °N): Höhe, TPI, Neigung, die ersten 2,5 km
 *     jedes Horizontstrahls. Radius 2,5 km ⇒ 1–4 Kacheln, gemessen 283 KB p50, 0,26 s.
 *   • **Fernfeld z8** (≈ 415 m/px bei 47 °N): der Rest der Horizontstrahlen bis 20 km.
 *     Radius 20,5 km ⇒ 1–4 Kacheln à 100–150 KB. Ein Gipfel in 15 km Entfernung ändert
 *     seinen Winkel über 400 m Strahlweg nicht messbar — dieselbe Überlegung, mit der
 *     `horizonAngles` die Schrittweite wachsen lässt.
 *
 * Beide Skalen laden PARALLEL zu den Cube-Chunks; das Ergebnis wird je Ort EINMAL
 * gerechnet und im Cache gehalten (Schlüssel: Ort auf 4 Nachkommastellen ≈ 11 m).
 *
 * ── Was hier NICHT steht ───────────────────────────────────────────────────
 * Die Rechenvorschriften (TPI, Horizont, SVF, Neigung) — die stehen pur in
 * `terrainPoint.ts` und sind dort gegen analytisches Gelände geprüft. Hier steht nur,
 * WOHER die Höhenfunktion ihre Zahlen nimmt. Landbedeckung (z0 aus WorldCover) und
 * `d_water` bleiben AP5.
 */

import {
  tpiAt, horizonAngles, skyViewFactor, slopeAspect, TPI_RADII_M, SX_RADIUS_M, M_PER_DEG_LAT, mPerDegLon,
  type ElevationAt,
} from '../terrainPoint';
import { terrainScales, type TerrainScales } from '../../pointForecast/fusion/terrainScale';
import type { CacheBackend } from './cache';
import type { DecodedRgba } from './browserPng';

export const TERRARIUM_TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export interface TerrainScale { z: number; radiusM: number }

/** Die zwei Skalen (E-F-6). `far.radiusM` = Horizontsuche + eine halbe z8-Zelle Rand. */
export const TERRAIN_SCALES: Readonly<{ near: TerrainScale; far: TerrainScale }> = Object.freeze({
  near: Object.freeze({ z: 11, radiusM: 2_500 }),
  far: Object.freeze({ z: 8, radiusM: SX_RADIUS_M + 500 }),
});

export type RgbaDecoder = (bytes: Uint8Array) => Promise<DecodedRgba> | DecodedRgba;

export interface TerrainOptions {
  fetchImpl?: typeof fetch;
  /** RGBA-Dekoder. Browser: `decodeRgbaPngBrowser`; Node: `png.mjs` + `toRgba`. */
  decodeRgba: RgbaDecoder;
  /** Kachel-Bytes und das fertige Ergebnis je Ort werden hier abgelegt. */
  cache?: CacheBackend | null;
  tileUrl?: string;
  near?: TerrainScale;
  far?: TerrainScale;
  /** Frist je Kachel (S3 antwortet gemessen in 135–2 500 ms). */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Nur Ergebnis rechnen, nie den Ergebnis-Cache lesen (für Vorher/Nachher-Messungen). */
  noResultCache?: boolean;
}

export interface TerrainPointResult {
  lat: number;
  lon: number;
  elevationM: number | null;
  tpi500M: number | null;
  tpi2000M: number | null;
  slopeDeg: number | null;
  aspectDeg: number | null;
  /** Acht Oktanten ab Nord im Uhrzeigersinn, Grad über dem Horizont. */
  horizonDeg: number[] | null;
  svf: number | null;
  /**
   * Phase FI, AP2: die sechs Ringradien (0,5–12 km) der Repräsentativitäts-Geometrie von
   * buscosun Fusion (`terrainScale.ts`: Höhenstreuung je Footprint, TPI je Skala, Horizont
   * je Oktant) — aus DERSELBEN Höhenfunktion wie die Größen darüber, damit der Cube-Pfad
   * keinen zweiten DEM-Abruf braucht. `null`, wenn die Höhe am Punkt fehlt.
   */
  scales: TerrainScales | null;
  /**
   * Senkentiefe in m (≥ 0): Ringmittel in 2 km Radius minus Punkthöhe, wie
   * `terrainPhysics.terrainContext` sie für das Kaltluftsee-Regime führt. `null` ohne Höhe.
   */
  sinkDepthM: number | null;
  /** Woher die Zahlen stammen — z11 für das Nahfeld, z8 für die Ferne. */
  source: string;
  tiles: { near: number; far: number; failed: number; bytes: number; fromCache: number };
  /** Ergebnis kam fertig aus dem Cache (keine Kachel geholt). */
  fromCache: boolean;
  timing: { totalMs: number; fetchMs: number; decodeMs: number; computeMs: number };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const lng2x = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z;
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

/** Die Kacheln, die ein Radius um den Punkt WIRKLICH schneidet (nicht pauschal 3×3). */
export function tilesForRadius(lat: number, lon: number, z: number, radiusM: number): Array<{ x: number; y: number }> {
  const dLat = radiusM / M_PER_DEG_LAT;
  const dLon = radiusM / mPerDegLon(lat);
  const x0 = Math.floor(lng2x(lon - dLon, z)), x1 = Math.floor(lng2x(lon + dLon, z));
  const y0 = Math.floor(lat2y(lat + dLat, z)), y1 = Math.floor(lat2y(lat - dLat, z));
  const out: Array<{ x: number; y: number }> = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ x, y });
  return out;
}

interface TileSet {
  z: number;
  tiles: Map<string, DecodedRgba>;
}

/** Terrarium: h = R·256 + G + B/256 − 32768. */
function terrariumAt(px: DecodedRgba, i: number, j: number): number {
  const k = (j * px.width + i) * 4;
  return px.data[k] * 256 + px.data[k + 1] + px.data[k + 2] / 256 - 32768;
}

function sampleTileSet(set: TileSet, lat: number, lon: number): number | null {
  const fx = lng2x(lon, set.z), fy = lat2y(lat, set.z);
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const t = set.tiles.get(`${tx}/${ty}`);
  if (!t) return null;
  const w = t.width, h = t.height;
  const px = (fx - tx) * w, py = (fy - ty) * h;
  const i0 = Math.max(0, Math.min(w - 1, Math.floor(px)));
  const j0 = Math.max(0, Math.min(h - 1, Math.floor(py)));
  const i1 = Math.min(w - 1, i0 + 1), j1 = Math.min(h - 1, j0 + 1);
  const fxr = px - i0, fyr = py - j0;
  const e00 = terrariumAt(t, i0, j0), e10 = terrariumAt(t, i1, j0);
  const e01 = terrariumAt(t, i0, j1), e11 = terrariumAt(t, i1, j1);
  const e0 = e00 * (1 - fxr) + e10 * fxr;
  const e1 = e01 * (1 - fxr) + e11 * fxr;
  const v = e0 * (1 - fyr) + e1 * fyr;
  return Number.isFinite(v) ? v : null;
}

function resultKey(lat: number, lon: number, near: TerrainScale, far: TerrainScale): string {
  // v2 seit AP2: das Ergebnis trägt zusätzlich `scales` und `sinkDepthM` — ein v1-Eintrag
  // im Cache hätte beides nicht und sähe aus wie ein Ort ohne Gelände.
  return `terrain/v2/z${near.z}r${near.radiusM}+z${far.z}r${far.radiusM}/${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/**
 * Lädt beide Skalen, rechnet die Geländegrößen, legt das Ergebnis ab.
 *
 * Fehlende Kacheln machen die Rechnung nicht kaputt, sondern LÖCHRIG: `tpiAt` mittelt
 * über die Abfragen, die einen Wert haben, `horizonAngles` bricht den Strahl dort ab, wo
 * die Daten enden — und `tiles.failed` sagt, wie viele fehlten.
 */
export async function loadTerrainAtPoint(lat: number, lon: number, opts: TerrainOptions): Promise<TerrainPointResult> {
  const T0 = now();
  const near = opts.near ?? TERRAIN_SCALES.near;
  const far = opts.far ?? TERRAIN_SCALES.far;
  const cache = opts.cache ?? null;
  const key = resultKey(lat, lon, near, far);

  if (cache && !opts.noResultCache) {
    try {
      const hit = await cache.get(key);
      if (hit) {
        const r = JSON.parse(new TextDecoder().decode(hit.bytes)) as TerrainPointResult;
        r.fromCache = true;
        r.timing = { totalMs: now() - T0, fetchMs: 0, decodeMs: 0, computeMs: 0 };
        return r;
      }
    } catch { /* Cache-Fehler sind kein Grund, nichts zu liefern */ }
  }

  const f = opts.fetchImpl ?? fetch;
  const tpl = opts.tileUrl ?? TERRARIUM_TILE_URL;
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const stats = { near: 0, far: 0, failed: 0, bytes: 0, fromCache: 0 };
  let fetchMs = 0, decodeMs = 0;

  const loadSet = async (scale: TerrainScale): Promise<TileSet> => {
    const list = tilesForRadius(lat, lon, scale.z, scale.radiusM);
    const tiles = new Map<string, DecodedRgba>();
    await Promise.all(list.map(async ({ x, y }) => {
      const url = tpl.replace('{z}', String(scale.z)).replace('{x}', String(x)).replace('{y}', String(y));
      let bytes: Uint8Array | null = null;
      try {
        if (cache) {
          const hit = await cache.get(url).catch(() => null);
          if (hit) { bytes = hit.bytes; stats.fromCache += 1; }
        }
        if (!bytes) {
          const t0 = now();
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(new Error(`Frist ${timeoutMs} ms: ${url}`)), timeoutMs);
          if (opts.signal) opts.signal.addEventListener('abort', () => ac.abort(opts.signal?.reason), { once: true });
          try {
            // `priority: 'high'`: das Gelände ist Teil der ersten Darstellung; auf 4G konkurriert
            // es sonst mit den Fernstufen-Chunks um dieselbe Leitung.
            const r = await f(url, { signal: ac.signal, mode: 'cors', priority: 'high' } as RequestInit);
            if (!r.ok) { stats.failed += 1; return; }
            bytes = new Uint8Array(await r.arrayBuffer());
          } finally { clearTimeout(timer); }
          fetchMs += now() - t0;
          stats.bytes += bytes.length;
          if (cache) cache.put(url, { bytes, storedAt: Date.now() }).catch(() => { /* gezählt reicht */ });
        }
        const d0 = now();
        const px = await opts.decodeRgba(bytes);
        decodeMs += now() - d0;
        // Laut statt später „undefined": ein Dekoder, der nur die Bytes liefert (wie `toRgba`
        // aus png.mjs), fiele sonst erst in der Abtastung mit einer nichtssagenden Meldung um.
        if (!px || !px.data || !Number.isFinite(px.width) || !Number.isFinite(px.height) || px.data.length < px.width * px.height * 4) {
          throw new Error('terrain: decodeRgba muss { data (RGBA), width, height } liefern');
        }
        tiles.set(`${x}/${y}`, px);
        if (scale === near) stats.near += 1; else stats.far += 1;
      } catch {
        stats.failed += 1;
      }
    }));
    return { z: scale.z, tiles };
  };

  const [nearSet, farSet] = await Promise.all([loadSet(near), loadSet(far)]);

  const c0 = now();
  const dLatNear = near.radiusM / M_PER_DEG_LAT;
  const dLonNear = near.radiusM / mPerDegLon(lat);
  const elev: ElevationAt = (la, lo) => {
    if (Math.abs(la - lat) <= dLatNear && Math.abs(lo - lon) <= dLonNear) {
      const v = sampleTileSet(nearSet, la, lo);
      if (v != null) return v;
    }
    return sampleTileSet(farSet, la, lo);
  };
  const h = elev(lat, lon);
  const hor = horizonAngles(lat, lon, elev, { radiusM: SX_RADIUS_M });
  const sa = slopeAspect(lat, lon, elev, 90);
  // AP2: die Ringgeometrie des Motors — Sampler in (lng, lat)-Ordnung, NaN statt null.
  const scales = h == null ? null : terrainScales((lo, la) => { const v = elev(la, lo); return v == null ? NaN : v; }, lon, lat);
  const ring2km = scales ? scales.ringMeanM[2] : null;   // RADII_M[2] = 2 000 m
  const result: TerrainPointResult = {
    lat, lon,
    elevationM: h == null ? null : Math.round(h * 10) / 10,
    tpi500M: round1(tpiAt(lat, lon, TPI_RADII_M.small, elev)),
    tpi2000M: round1(tpiAt(lat, lon, TPI_RADII_M.large, elev)),
    slopeDeg: round1(sa?.slopeDeg ?? null),
    aspectDeg: round1(sa?.aspectDeg ?? null),
    horizonDeg: hor ? hor.map((x) => Math.round(x * 100) / 100) : null,
    svf: hor ? Math.round(skyViewFactor(hor) * 1000) / 1000 : null,
    scales: scales && scales.sampledCount > 0 ? scales : null,
    sinkDepthM: h == null || ring2km == null ? null : Math.max(0, Math.min(400, Math.round((ring2km - h) * 10) / 10)),
    source: `terrarium z${near.z} (≤ ${near.radiusM} m) + z${far.z} (≤ ${far.radiusM} m)`,
    tiles: stats,
    fromCache: false,
    timing: { totalMs: 0, fetchMs: Math.round(fetchMs), decodeMs: Math.round(decodeMs), computeMs: 0 },
  };
  result.timing.computeMs = Math.round(now() - c0);
  result.timing.totalMs = Math.round(now() - T0);

  if (cache && result.elevationM != null && stats.failed === 0) {
    const { timing: _t, fromCache: _c, ...persist } = result;
    void _t; void _c;
    cache.put(key, { bytes: new TextEncoder().encode(JSON.stringify(persist)), storedAt: Date.now() })
      .catch(() => { /* gezählt vom Aufrufer, nicht hier */ });
  }
  return result;
}

function round1(v: number | null): number | null {
  return v == null ? null : Math.round(v * 10) / 10;
}
