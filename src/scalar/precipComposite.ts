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
 * Die Länderzuordnung ist dieselbe wie die der Punktvorhersage ({@link countryRowPicker}
 * = `pickCountry` je Zelle): Box, wo nur eine Box gilt, sonst die Landesgrenze —
 * jede Zelle eindeutig. Bis V-FR-11 (07.10.2026) entschied allein die tiefere Lage
 * in der Box; Südbayern samt München fiel dabei an AT und zeigte INCA statt RADOLAN.
 *
 * Gerendert wird EIN reguläres lat/lon-Gitter über DACH (ein RainLayer-Frame).
 * Die Zelle→Quellgitter-Zuordnung ist geometrisch fix → wird je Quelle EINMAL
 * vorberechnet (Index-Map, s. precipIndexMap.ts); pro Slider-Schritt nur noch
 * Array-Gather (flüssig). RADOLAN ist polar-stereografisch → exakte Inverse
 * über `psFwd`; INCA/rzc/ICON-D2 über inverse Bilinear-Interpolation ihrer
 * vier Geo-Ecken.
 */

import { countryRowPicker } from '../pointForecast/countryOfPoint';
import { G, buildIndexMap, buildCompositeIndexMap, gridLatLon, type GridKind } from './precipIndexMap';
import { countryMaskForGrid, type HdGridKind } from './radarCountryMask';
import { estimateMorphFlow } from './radarMorphFlow';
import type { QuadCorners, RainFlow } from './RainLayer';
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
  /**
   * Phase RR (audit/regenradar-datenangleich.md §4 RR-b): measured RV analyses BEFORE the run of `rv` (DE1200 grid,
   * same width/height as the `rv` frames) — the look-back of the radar profile. When this field is present (even as an
   * empty list), `build()` picks the RV frame by VALIDITY TIME: among these analyses and the `rv` frames
   * (`runAt + leadMinutes`) the one nearest to `nowMs + h·1 h`, at most `RV_PICK_TOL_MS` away, else no RV. Without the
   * field `build()` is byte-identical to before (RV frame by lead from the run, as the Wetterkarte slider uses it).
   */
  rvPast?: ReadonlyArray<RvPastFrame> | null;
}

/** One measured RV analysis of the look-back (Phase RR). */
export interface RvPastFrame {
  validAt: Date;
  values: Uint8Array;
  width: number;
  height: number;
}

/** Phase RR: farthest an RV frame may be from the asked validity time in the `rvPast` mode — one RV step (5 min). */
export const RV_PICK_TOL_MS = 5 * 60_000;

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
interface PiMsg { id: number; ok: boolean; error?: string; idxBuf?: ArrayBuffer; maskBuf?: ArrayBuffer; flow?: { uBuf: ArrayBuffer; vBuf: ArrayBuffer; w: number; h: number } }
const PI_POOL_SIZE = Math.max(1, Math.min((navigator.hardwareConcurrency || 2) - 1, 2));
let piWorkers: Worker[] = [];
let piUsable = true, piInited = false, piRr = 0, piNextId = 1;
const piPending = new Map<number, { resolve: (r: Int32Array | Uint8Array) => void; reject: (e: Error) => void }>();

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
        else if (d.ok && d.maskBuf) p.resolve(new Uint8Array(d.maskBuf));
        else if (d.ok && d.flow) (p.resolve as unknown as (r: RainFlow) => void)({ u: new Float32Array(d.flow.uBuf), v: new Float32Array(d.flow.vBuf), w: d.flow.w, h: d.flow.h });
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
      piPending.set(id, { resolve: resolve as (r: Int32Array | Uint8Array) => void, reject });
      w.postMessage({ id, corners, sCols, sRows, grid });
    });
  } catch {
    piPending.delete(id);
    return buildCompositeIndexMap(corners, sCols, sRows, grid);
  }
}

/**
 * Phase HD-1: ownership mask of a native radar grid (`countryMaskForGrid`), built in the same worker pool — the same
 * fallback to the main thread as the index maps. Memoised per grid (kind + size + first corner), the promise is shared.
 */
const hdMasks = new Map<string, Promise<Uint8Array>>();
export function countryMaskOffMain(kind: HdGridKind, corners: QuadCorners, sCols: number, sRows: number): Promise<Uint8Array> {
  const key = `${kind}:${sCols}x${sRows}:${corners[0][0]},${corners[0][1]}`;
  const hit = hdMasks.get(key);
  if (hit) return hit;
  const p = (async () => {
    piInit();
    if (!piUsable || piWorkers.length === 0) return countryMaskForGrid(kind, corners, sCols, sRows);
    const w = piWorkers[piRr++ % piWorkers.length];
    const id = piNextId++;
    try {
      return await new Promise<Uint8Array>((resolve, reject) => {
        piPending.set(id, { resolve: resolve as (r: Int32Array | Uint8Array) => void, reject });
        w.postMessage({ id, op: 'mask', corners, sCols, sRows, grid: kind });
      });
    } catch {
      piPending.delete(id);
      return countryMaskForGrid(kind, corners, sCols, sRows);
    }
  })();
  hdMasks.set(key, p);
  p.catch(() => hdMasks.delete(key));
  return p;
}

/**
 * Phase HD-4: motion field A → B (native texels per interval) in the worker pool, memoised per frame pair (weak on A).
 * `flowCached` answers synchronously what is already there; `flowOffMain` starts the estimate (fallback: main thread).
 */
const flows = new WeakMap<Uint8Array, Map<Uint8Array, { flow: RainFlow | null; p: Promise<RainFlow> }>>();
export function flowCached(a: Uint8Array, b: Uint8Array): RainFlow | null {
  return flows.get(a)?.get(b)?.flow ?? null;
}
export function flowOffMain(a: Uint8Array, b: Uint8Array, w: number, h: number, factor: number): Promise<RainFlow> {
  let per = flows.get(a);
  if (!per) { per = new Map(); flows.set(a, per); }
  const hit = per.get(b);
  if (hit) return hit.p;
  const entry: { flow: RainFlow | null; p: Promise<RainFlow> } = { flow: null, p: Promise.resolve({ u: new Float32Array(0), v: new Float32Array(0), w: 0, h: 0 }) };
  entry.p = (async () => {
    piInit();
    let f: RainFlow;
    if (!piUsable || piWorkers.length === 0) f = estimateMorphFlow(a, b, w, h, factor);
    else {
      const wk = piWorkers[piRr++ % piWorkers.length];
      const id = piNextId++;
      try {
        f = await new Promise<RainFlow>((resolve, reject) => {
          piPending.set(id, { resolve: resolve as unknown as (r: Int32Array | Uint8Array) => void, reject });
          // copies (no transfer): the frames stay in use by the layers
          wk.postMessage({ id, op: 'flow', corners: [[0, 0], [0, 0], [0, 0], [0, 0]], sCols: w, sRows: h, grid: 'radolan', aBuf: a.slice().buffer, bBuf: b.slice().buffer, factor });
        });
      } catch {
        piPending.delete(id);
        f = estimateMorphFlow(a, b, w, h, factor);
      }
    }
    entry.flow = f;
    return f;
  })();
  per.set(b, entry);
  entry.p.catch(() => per!.delete(b));
  return entry.p;
}

/** The frames `build()` draws for slider hour `h` — one rule for the composite and the HD layers (Phase HD-1). */
export interface CompositePick {
  /** `values2` (HD-3): Log-Ebene, wenn der Frame eine trägt. */
  rv: { values: Uint8Array; values2?: Uint8Array } | null;
  inca: IncaGrid['frames'][number] | null;
  rzc: RadarFrame | null;
  d2: IconD2Precip['frames'][number] | null;
}
export function pickCompositeFrames(h: number, s: CompositeSources, nowMs: number): CompositePick {
  const rv = s.rvPast != null
    ? rvAtValidTime(s.rv ?? null, s.rvPast, nowMs + h * 3600_000)
    : h <= RV_MAX_H + 1e-6 && s.rv?.frames.length ? nearestBy(s.rv.frames, (f) => Math.abs(f.leadMinutes - h * 60)) : null;
  const inca = h <= INCA_MAX_H + 1e-6 && s.inca?.frames.length ? nearestBy(s.inca.frames, (f) => Math.abs(f.leadHours - h)) : null;
  const rzc = h < RZC_MAX_H && s.rzc ? s.rzc : null;
  const d2 = s.d2?.frames.length ? nearestBy(s.d2.frames, (f) => Math.abs(f.validAt.getTime() - (nowMs + h * 3600_000))) : null;
  return { rv, inca, rzc, d2 };
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
    // V-FR-11: dieselbe Länderregel wie die Punktvorhersage (Landesgrenze, wo sich die Boxen überlappen), je Gitterzeile
    // einmal die Grenzschnitte — Zelle für Zelle gleich `pickCountry` (verify:fusion-release C6).
    let rowLat = NaN;
    let pick = countryRowPicker(lat[0]);
    for (let i = 0; i < lat.length; i++) {
      if (lat[i] !== rowLat) { rowLat = lat[i]; pick = countryRowPicker(rowLat); }
      const cc = pick(lon[i]);
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

    const { rv, inca, rzc, d2 } = pickCompositeFrames(h, s, nowMs);

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

/**
 * Phase RR (`rvPast` mode): the RV values valid nearest to `targetMs` — the look-back analyses older than the run, then the
 * run's own frames (`runAt + leadMinutes`, lead ≤ RV_MAX_H). Frames on another grid than the run are skipped (the DE
 * index map belongs to the run). `null` when nothing lies within `RV_PICK_TOL_MS` — a gap stays a gap.
 */
function rvAtValidTime(rv: RvNowcast | null, past: ReadonlyArray<RvPastFrame>, targetMs: number): { values: Uint8Array; values2?: Uint8Array } | null {
  if (!rv || !rv.frames.length) return null;
  const runMs = rv.runAt.getTime();
  const w = rv.frames[0].width, hgt = rv.frames[0].height;
  let best: { values: Uint8Array; values2?: Uint8Array } | null = null;
  let bd = Infinity;
  for (const p of past) {
    const t = p.validAt.getTime();
    if (t >= runMs || p.width !== w || p.height !== hgt) continue;
    const d = Math.abs(t - targetMs);
    if (d < bd) { bd = d; best = p; }
  }
  for (const f of rv.frames) {
    if (f.leadMinutes > RV_MAX_H * 60 + 1e-6) continue;
    const d = Math.abs(runMs + f.leadMinutes * 60_000 - targetMs);
    if (d < bd) { bd = d; best = f; }
  }
  return bd <= RV_PICK_TOL_MS ? best : null;
}

function nearestBy<T>(arr: T[], dist: (x: T) => number): T {
  let best = arr[0], bd = dist(arr[0]);
  for (const x of arr) { const d = dist(x); if (d < bd) { bd = d; best = x; } }
  return best;
}
