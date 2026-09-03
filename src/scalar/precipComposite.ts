/**
 * Niederschlags-Komposit über DACH — länderrichtiges Radar unabhängig vom
 * gesuchten Ort.
 *
 * Bisher wählte der Niederschlags-Layer EINE Quelle nach `location.country`
 * (DE→RADOLAN, AT→INCA, CH→rzc, sonst ICON-D2). Folge: schaut man von einem
 * DE-Ort auf Österreich, lief die DE-Kette — RADOLAN deckt AT aber nicht ab →
 * kein Radar über AT. Dieser Compositor mischt stattdessen pro Karten-Zelle die
 * fachlich richtige Quelle ein:
 *   • DE-Fläche  → RADOLAN-RV  (0–2 h)
 *   • AT-Fläche  → GeoSphere INCA (0–3 h)
 *   • CH-Fläche  → MeteoSchweiz rzc (nur „jetzt")
 *   • sonst / jenseits des jeweiligen Nowcast-Horizonts → ICON-D2 (Forecast)
 * Die Länderzuordnung nutzt dieselbe Box-Heuristik wie der Punktforecast
 * ({@link pickCountry}) und partitioniert jede Zelle eindeutig — INCA übermalt
 * also nicht mehr Süddeutschland/Schweiz.
 *
 * Gerendert wird EIN reguläres lat/lon-Gitter über DACH (ein RainLayer-Frame).
 * Die Zelle→Quellgitter-Zuordnung ist geometrisch fix → wird je Quelle EINMAL
 * vorberechnet (Index-Map, s. precipIndexMap.ts); pro Slider-Schritt nur noch
 * Array-Gather (flüssig). RADOLAN ist polar-stereografisch → exakte Inverse
 * über `psFwd`; INCA/rzc/ICON-D2 über inverse Bilinear-Interpolation ihrer
 * vier Geo-Ecken.
 */

import { pickCountry } from '../pointForecast/clustering';
import { G, buildIndexMap, buildCompositeIndexMap, gridLatLon, type GridKind } from './precipIndexMap';
import type { QuadCorners } from './RainLayer';
import { quadWarpMesh, quadWarpRows, QUAD_WARP_COLS } from './quadWarpMesh';
import type { RvNowcast } from '../sources/radolan';
import type { IncaGrid } from '../sources/geosphereIncaGrid';
import type { RadarFrame } from '../sources/meteoSwissRadar';
import type { IconD2Precip } from '../sources/iconD2Precip';

/** Ecken [NW, NE, SE, SW] für RainLayer.setFrame (north-up). */
export const COMPOSITE_CORNERS: QuadCorners = [
  [G.lonMin, G.latMax], [G.lonMax, G.latMax], [G.lonMax, G.latMin], [G.lonMin, G.latMin],
];

/**
 * Warp-Mesh des Komposit-Gitters für `RainLayer.setFrame` — PFLICHT, kein
 * Zusatz. Das Gitter ist zwar regulär in lon/lat (keine Projektion aufzuheben),
 * aber der RainLayer interpoliert ein nacktes 4-Eck-Quad linear in Mercator,
 * während die Texturzeilen breiten-linear liegen: über die 10,2° von
 * `G.latMin…G.latMax` lag der Niederschlag dadurch bis **30,5 km zu weit
 * nördlich** (bei 49 N ≈ 29 km — live gemessen, `audit/karten-layer-verortung.md`
 * §14; an den Rändern 0, deshalb nie als Versprung sichtbar). Die Zeilenzahl
 * kommt aus der Zeilenregel in `quadWarpMesh.ts` (§15: ≤ 1 m Rest — 213 Zeilen
 * über 10,2°, gemessen 0,9 m; Spalten tragen bei lat/lon-Gittern nichts zur
 * Verortung bei).
 */
export const COMPOSITE_WARP_N = QUAD_WARP_COLS;
export const COMPOSITE_WARP_ROWS = quadWarpRows(COMPOSITE_CORNERS);
export function compositeWarpMesh(): Float32Array {
  return quadWarpMesh(COMPOSITE_CORNERS, COMPOSITE_WARP_N, COMPOSITE_WARP_ROWS);
}

/** Nowcast-Horizonte je Land (Stunden) — jenseits davon ICON-D2. */
export const RV_MAX_H = 2;     // DE RADOLAN-RV
export const INCA_MAX_H = 3;   // AT GeoSphere INCA
export const RZC_MAX_H = 0.5;  // CH rzc (nur „jetzt")

export interface CompositeSources {
  rv?: RvNowcast | null;
  inca?: IncaGrid | null;
  rzc?: RadarFrame | null;
  d2?: IconD2Precip | null;
}

export interface CompositeFrame {
  values: Uint8Array;
  width: number;
  height: number;
  corners: QuadCorners;
  /** Immer gesetzt (s. `compositeWarpMesh`) — Aufrufer reichen beide an
   *  `RainLayer.setFrame` durch; ohne sie zeichnet der Layer das Quad. */
  warpLnglat: Float32Array;
  warpN: number;
  warpRows: number;
}

// ---------------------------------------------------------------------------
// Index-Map-Pool: buildCompositeIndexMap() (s. precipIndexMap.ts) läuft off-main
// im precipIndexWorker — vorher blockierte der Newton-Solver (8 Iterationen ×
// 307.200 Zellen, ~250-370 ms je Quelle, 4×-CPU-Throttle gemessen) synchron im
// build()-Render-Pfad, sobald eine Quelle (RADOLAN/INCA/rzc/ICON-D2) neu
// zuschaltet. Fällt bei fehlendem/abgestürztem Worker transparent auf denselben
// Code zurück (gleiches Muster wie decompress.ts/gribGridWorker/radolanWorker).
// ---------------------------------------------------------------------------
interface PiMsg { id: number; ok: boolean; error?: string; idxBuf?: ArrayBuffer }
const PI_POOL_SIZE = Math.max(1, Math.min((navigator.hardwareConcurrency || 2) - 1, 2));
let piWorkers: Worker[] = [];
let piUsable = true, piInited = false, piRr = 0, piNextId = 1;
const piPending = new Map<number, { resolve: (r: Int32Array) => void; reject: (e: Error) => void }>();

function piInit(): void {
  if (piInited) return;
  piInited = true;
  try {
    for (let i = 0; i < PI_POOL_SIZE; i++) {
      const w = new Worker(new URL('./precipIndexWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<PiMsg>) => {
        const d = e.data;
        const p = piPending.get(d.id);
        if (!p) return;
        piPending.delete(d.id);
        if (d.ok && d.idxBuf) p.resolve(new Int32Array(d.idxBuf));
        else p.reject(new Error(d.error || 'precip index worker error'));
      };
      w.onerror = () => {
        piUsable = false;
        for (const [id, p] of piPending) { piPending.delete(id); p.reject(new Error('precip index worker crashed')); }
      };
      piWorkers.push(w);
    }
  } catch {
    piUsable = false;
    piWorkers = [];
  }
}

async function buildIndexMapOffMain(corners: QuadCorners, sCols: number, sRows: number, grid: GridKind): Promise<Int32Array> {
  piInit();
  if (!piUsable || piWorkers.length === 0) return buildCompositeIndexMap(corners, sCols, sRows, grid);
  const w = piWorkers[piRr++ % piWorkers.length];
  const id = piNextId++;
  try {
    return await new Promise<Int32Array>((resolve, reject) => {
      piPending.set(id, { resolve, reject });
      w.postMessage({ id, corners, sCols, sRows, grid });
    });
  } catch {
    piPending.delete(id);
    return buildCompositeIndexMap(corners, sCols, sRows, grid);
  }
}

/**
 * Hält das feste Komposit-Gitter + die je Quelle einmalig berechneten Index-Maps
 * und mischt pro Slider-Stunde den Frame zusammen.
 */
export class PrecipCompositor {
  readonly width = G.w;
  readonly height = G.h;
  readonly corners = COMPOSITE_CORNERS;
  private readonly lat: Float32Array;
  private readonly lon: Float32Array;
  private readonly country = new Uint8Array(G.w * G.h); // 0=DE, 1=AT, 2=CH
  private deIdx: Int32Array | null = null; private deKey = '';
  private atIdx: Int32Array | null = null; private atKey = '';
  private chIdx: Int32Array | null = null; private chKey = '';
  private d2Idx: Int32Array | null = null; private d2Key = '';

  constructor() {
    const { lat, lon } = gridLatLon();
    this.lat = lat; this.lon = lon;
    for (let i = 0; i < lat.length; i++) {
      const cc = pickCountry(lat[i], lon[i]);
      this.country[i] = cc === 'AT' ? 1 : cc === 'CH' ? 2 : 0;
    }
  }

  private ensureDe(rv: RvNowcast) {
    const f = rv.frames[0]; const key = `${f.width}x${f.height}`;
    if (key === this.deKey && this.deIdx) return;
    this.deIdx = buildIndexMap(rv.corners, f.width, f.height, this.lat, this.lon, 'radolan');
    this.deKey = key;
  }
  private ensureAt(inca: IncaGrid) {
    const f = inca.frames[0]; const key = `${f.width}x${f.height}:${inca.corners[0][0]}`;
    if (key === this.atKey && this.atIdx) return;
    this.atIdx = buildIndexMap(inca.corners, f.width, f.height, this.lat, this.lon, 'inca');
    this.atKey = key;
  }
  private ensureCh(rzc: RadarFrame) {
    const key = `${rzc.width}x${rzc.height}:${rzc.corners[0][0]}`;
    if (key === this.chKey && this.chIdx) return;
    this.chIdx = buildIndexMap(rzc.corners, rzc.width, rzc.height, this.lat, this.lon, 'rzc');
    this.chKey = key;
  }
  private ensureD2(d2: IconD2Precip) {
    const f = d2.frames[0]; const key = `${f.width}x${f.height}`;
    if (key === this.d2Key && this.d2Idx) return;
    this.d2Idx = buildIndexMap(d2.corners, f.width, f.height, this.lat, this.lon, 'lonlat');
    this.d2Key = key;
  }

  // -- Off-main-Vorwärmen -----------------------------------------------------
  // Dieselbe Key-Logik wie ensureXxx, aber die Index-Map wird im Worker gebaut
  // und NUR das Ergebnis (Cache-Feld) synchron übernommen. MapView ruft diese
  // Methoden auf, sobald eine Quelle lädt — VOR dem React-Tick, der build()
  // auslöst, damit ensureXxx() dort nur noch den (bereits warmen) Cache trifft.

  async primeDe(rv: RvNowcast): Promise<void> {
    const f = rv.frames[0]; const key = `${f.width}x${f.height}`;
    if (key === this.deKey && this.deIdx) return;
    const idx = await buildIndexMapOffMain(rv.corners, f.width, f.height, 'radolan');
    this.deIdx = idx; this.deKey = key;
  }
  async primeAt(inca: IncaGrid): Promise<void> {
    const f = inca.frames[0]; const key = `${f.width}x${f.height}:${inca.corners[0][0]}`;
    if (key === this.atKey && this.atIdx) return;
    const idx = await buildIndexMapOffMain(inca.corners, f.width, f.height, 'inca');
    this.atIdx = idx; this.atKey = key;
  }
  async primeCh(rzc: RadarFrame): Promise<void> {
    const key = `${rzc.width}x${rzc.height}:${rzc.corners[0][0]}`;
    if (key === this.chKey && this.chIdx) return;
    const idx = await buildIndexMapOffMain(rzc.corners, rzc.width, rzc.height, 'rzc');
    this.chIdx = idx; this.chKey = key;
  }
  async primeD2(d2: IconD2Precip): Promise<void> {
    const f = d2.frames[0]; const key = `${f.width}x${f.height}`;
    if (key === this.d2Key && this.d2Idx) return;
    const idx = await buildIndexMapOffMain(d2.corners, f.width, f.height, 'lonlat');
    this.d2Idx = idx; this.d2Key = key;
  }

  /** Komposit-Frame für Vorlaufstunde `h` (nowMs = aktuelle Zeit für ICON-D2-Wahl). */
  build(h: number, s: CompositeSources, nowMs: number): CompositeFrame {
    const out = new Uint8Array(G.w * G.h);

    const rv = h <= RV_MAX_H + 1e-6 && s.rv?.frames.length ? nearestBy(s.rv.frames, (f) => Math.abs(f.leadMinutes - h * 60)) : null;
    const inca = h <= INCA_MAX_H + 1e-6 && s.inca?.frames.length ? nearestBy(s.inca.frames, (f) => Math.abs(f.leadHours - h)) : null;
    const rzc = h < RZC_MAX_H && s.rzc ? s.rzc : null;
    const d2 = s.d2?.frames.length ? nearestBy(s.d2.frames, (f) => Math.abs(f.validAt.getTime() - (nowMs + h * 3600_000))) : null;

    if (rv) this.ensureDe(s.rv!);
    if (inca) this.ensureAt(s.inca!);
    if (rzc) this.ensureCh(s.rzc!);
    if (d2) this.ensureD2(s.d2!);

    for (let i = 0; i < out.length; i++) {
      const c = this.country[i];
      let v = 0; let filled = false;
      if (c === 0 && rv && this.deIdx) { const j = this.deIdx[i]; if (j >= 0) { v = rv.values[j]; filled = true; } }
      else if (c === 1 && inca && this.atIdx) { const j = this.atIdx[i]; if (j >= 0) { v = inca.values[j]; filled = true; } }
      else if (c === 2 && rzc && this.chIdx) { const j = this.chIdx[i]; if (j >= 0) { v = rzc.values[j]; filled = true; } }
      if (!filled && d2 && this.d2Idx) { const j = this.d2Idx[i]; if (j >= 0) v = d2.values[j]; }
      out[i] = v;
    }
    return {
      values: out, width: G.w, height: G.h, corners: COMPOSITE_CORNERS,
      warpLnglat: compositeWarpMesh(), warpN: COMPOSITE_WARP_N, warpRows: COMPOSITE_WARP_ROWS,
    };
  }
}

function nearestBy<T>(arr: T[], dist: (x: T) => number): T {
  let best = arr[0], bd = dist(arr[0]);
  for (const x of arr) { const d = dist(x); if (d < bd) { bd = d; best = x; } }
  return best;
}
