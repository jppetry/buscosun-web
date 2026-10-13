/**
 * Phase SE (`audit/radar-stoerecho.md`) — echoes of the DWD radar composite that are not precipitation (birds, insects,
 * residual clutter), recognised from the polarimetric correlation coefficient ρHV of the SAME precipitation scan the
 * composite is made of. ONE file for the producer (`scripts/radar-mirror/radar-derive.mjs`), the verifier
 * (`scripts/verify-radar-clutter.mjs`) and the measurement (`audit/radar-stoerecho/*.mjs`).
 *
 * Inputs per slot: the 17 px250 site images (Cartesian 250-m DBZH, `dwdPx250.ts` — which site has an echo where) and
 * the 17 URHOHV sweeps (`dwdSweep.ts`). Output: a mask on the RV 1-km grid (1100 × 1200) that the producer applies to
 * the DISPLAY products only (log plane of the `g` frames, 250-m tiles) — everything that computes stays byte-identical.
 *
 * Fail-open by construction: a cell is masked only on positive evidence. No site image, no sweep, no ρHV at the bin,
 * a sweep of another slot ⇒ the cell stays as the DWD delivered it.
 */

import type { Px250Grid } from './dwdPx250.ts';
import { sweepRayLut, type PolarSweep } from './dwdSweep.ts';
import { psInv } from './radolanGeo.ts';
import { px250Shift, HD250_COLS, HD250_ROWS, HD250_FACTOR } from './radarHd250.ts';

export const RV_COLS = HD250_COLS / HD250_FACTOR;   // 1100
export const RV_ROWS = HD250_ROWS / HD250_FACTOR;   // 1200

const DEG = Math.PI / 180;
/** Mean earth radius (m) of the azimuthal mapping site → cell. The DWD's own px250 gridding is reproduced with it to
 *  the bin (`audit/radar-stoerecho.md` §2.4: 90 % of the echo cells, 57 % of the values to 0,05 dB). */
const EARTH_R = 6371000;

/** Azimuth (degrees from north, clockwise) and great-circle distance (m) from (lat0, lon0) to (lat, lon). */
export function azimuthDistance(lat0: number, lon0: number, lat: number, lon: number): [number, number] {
  const p0 = lat0 * DEG, p1 = lat * DEG, dl = (lon - lon0) * DEG;
  const h = Math.sin((p1 - p0) / 2) ** 2 + Math.cos(p0) * Math.cos(p1) * Math.sin(dl / 2) ** 2;
  const s = 2 * EARTH_R * Math.asin(Math.sqrt(h));
  const az = Math.atan2(Math.sin(dl) * Math.cos(p1), Math.cos(p0) * Math.sin(p1) - Math.sin(p0) * Math.cos(p1) * Math.cos(dl)) / DEG;
  return [(az + 360) % 360, s];
}

/** Lattice step (cells) of the east/north table of a site image; between the nodes the offsets are bilinear. */
const LATTICE = 16;

/**
 * East/north offsets (m, true distances on the ground) of every lattice node of a site image against the radar.
 * The exact mapping (inverse projection + great circle) is evaluated at the nodes only; the functions are smooth, the
 * bilinear error stays under 2 m over 16 cells (verifier A3).
 */
export interface SiteLattice { n: number; step: number; east: Float32Array; north: Float32Array }
export function siteLattice(g: Pick<Px250Grid, 'size' | 'cellM' | 'x0' | 'y0' | 'lon' | 'lat'>): SiteLattice {
  const n = Math.floor(g.size / LATTICE) + 1;
  const east = new Float32Array(n * n), north = new Float32Array(n * n);
  for (let q = 0; q < n; q++) for (let p = 0; p < n; p++) {
    const [lon, lat] = psInv(p * LATTICE * g.cellM - g.x0, -q * LATTICE * g.cellM - g.y0);
    const [az, s] = azimuthDistance(g.lat, g.lon, lat, lon);
    east[q * n + p] = s * Math.sin(az * DEG);
    north[q * n + p] = s * Math.cos(az * DEG);
  }
  return { n, step: LATTICE, east, north };
}

/** One site's view of its own echoes: per px250 cell with an echo the ρHV of the polar bin that covers it. */
export interface SiteRho {
  site: string;
  /** ρHV per cell (row 0 = north); `NaN` = no echo in px250, or no ρHV for the bin */
  rho: Float32Array;
  /** ground distance to the radar per cell (km), filled only where `rho` is finite */
  rangeKm: Float32Array;
  /** echo cells in px250 / of those with a ρHV value */
  echoCells: number;
  rhoCells: number;
}

/**
 * ρHV of a sweep at every px250 cell that carries an echo. The sweep must be of the same site and the same slot —
 * the caller checks that (`sameScan`); here only geometry.
 */
export function siteRho(g: Px250Grid, sweep: PolarSweep, lattice: SiteLattice = siteLattice(g)): SiteRho {
  const S = g.size, n = lattice.n, step = lattice.step;
  const rho = new Float32Array(S * S).fill(NaN), rangeKm = new Float32Array(S * S);
  const lut = sweepRayLut(sweep);
  const cosEl = new Float32Array(sweep.nrays);
  for (let r = 0; r < sweep.nrays; r++) cosEl[r] = Math.cos(sweep.elDeg[r] * DEG);
  let echoCells = 0, rhoCells = 0;
  for (let b = 0; b < S; b++) {
    const q = Math.min(n - 2, Math.floor(b / step)), fy = (b - q * step) / step;
    for (let a = 0; a < S; a++) {
      const z = g.dbz[b * S + a];
      if (!(z > -Infinity)) continue;                       // NaN (not covered) or −Infinity (no echo)
      echoCells++;
      const p = Math.min(n - 2, Math.floor(a / step)), fx = (a - p * step) / step;
      const k00 = q * n + p, k01 = k00 + 1, k10 = k00 + n, k11 = k10 + 1;
      const w00 = (1 - fx) * (1 - fy), w01 = fx * (1 - fy), w10 = (1 - fx) * fy, w11 = fx * fy;
      const e = lattice.east[k00] * w00 + lattice.east[k01] * w01 + lattice.east[k10] * w10 + lattice.east[k11] * w11;
      const nn = lattice.north[k00] * w00 + lattice.north[k01] * w01 + lattice.north[k10] * w10 + lattice.north[k11] * w11;
      const s = Math.sqrt(e * e + nn * nn);
      let az = Math.atan2(e, nn) / DEG;
      if (az < 0) az += 360;
      const ray = lut[Math.min(3599, Math.floor(az * 10))];
      if (ray < 0) continue;
      const bin = Math.floor((s / cosEl[ray] - sweep.rstartM) / sweep.rscaleM);
      if (bin < 0 || bin >= sweep.nbins) continue;
      const v = sweep.values[ray * sweep.nbins + bin];
      if (!(v > -Infinity)) continue;
      rho[b * S + a] = v;
      rangeKm[b * S + a] = s / 1000;
      rhoCells++;
    }
  }
  return { site: g.site, rho, rangeKm, echoCells, rhoCells };
}

/** A sweep belongs to a site image when both name the same site and the same slot. */
export function sameScan(g: Pick<Px250Grid, 'site' | 'timeMs'>, sweep: Pick<PolarSweep, 'site' | 'slotMs' | 'quantity'>): boolean {
  return g.site !== '' && g.site === sweep.site && g.timeMs === sweep.slotMs && sweep.quantity === 'URHOHV';
}

/** Signal-to-noise ratio (dB) of an echo of `dbz` at `rangeKm` for a radar whose noise equals `dbz0` at 1 km. */
export function snrDb(dbz: number, rangeKm: number, dbz0: number): number {
  return dbz - dbz0 - 20 * Math.log10(Math.max(0.25, rangeKm));
}

/**
 * URHOHV is not noise-corrected: in rain its median falls from 0,97 (SNR ≥ 20 dB) to 0,84 (9–12 dB) and 0,61 (3–6 dB) —
 * the textbook factor 1 / (1 + 1/snr) with a noise level `CLUTTER_SNR_OFFSET_DB` above the file's `dBZ0`
 * (`audit/radar-stoerecho.md` §2.5, fitted on the rain of 2026-10-11). The corrected value is what the rule reads.
 */
export function rhoNoiseCorrected(rho: number, snrEffDb: number): number {
  return rho * (1 + Math.pow(10, -snrEffDb / 10));
}

/** Parameters of the rule. `rhoMax`, `zCapDbz`, `kernel` are chosen by the frozen protocol (§4), the rest is set. */
export interface ClutterParams {
  /** a site votes "no precipitation" when the median corrected ρHV of the block is below this */
  rhoMax: number;
  /** … and its strongest echo in the block is below this (dBZ) — strong echoes are never masked */
  zCapDbz: number;
  /** neighbourhood of the statistic in 1-km blocks (1 = the block, 3 = 3 × 3 blocks) */
  kernel: 1 | 3;
  /** effective SNR (dB, after the offset) below which a cell carries no ρHV evidence */
  snrMinDb: number;
  /** measured noise offset (dB) against `dBZ0` of the sweep file */
  snrOffsetDb: number;
  /** cells with evidence a site needs in the neighbourhood to vote at all (per block of the kernel) */
  minCells: number;
  /** close the mask over wet cells without any vote whose voted neighbours are all "no precipitation" */
  fill: boolean;
  /** Nachtrag A1 (§5a) "N": a site votes for a cell whose neighbourhood carries the evidence even when its own block
   *  holds no echo there (the composite closes sectors a site does not see). Only with `kernel` 3. */
  neighbourVote: boolean;
  /** Nachtrag A1 "R": with at least `richCells` evidence cells in the neighbourhood this threshold replaces `rhoMax`
   *  (equal to `rhoMax` = off). */
  rhoMaxRich: number;
  richCells: number;
}
export const CLUTTER_SNR_OFFSET_DB = 2.5;   // measured, §2.5 (2026-10-11 09–14 UTC, 17 sites: corrected median 0,974–0,981 over 3–20 dB)
export const CLUTTER_SNR_MIN_DB = 3;        // set: below it the correction factor exceeds 1,5
export const CLUTTER_MIN_CELLS = 4;         // set: a quarter of the block
export const CLUTTER_RICH_CELLS = 72;       // set: half of the 144 cells of a 3 × 3 neighbourhood

/**
 * The rule the producer applies (provenance `measured`, date below; `audit/radar-stoerecho.md`):
 *   `rhoMax` 0,80 · `zCapDbz` 15 · `kernel` 3   = θ* of the frozen protocol (§4.4, result §5),
 *   `rhoMaxRich` 0,85 at ≥ 72 evidence cells     = variant "R85" of Nachtrag A1 (§5a, R-SE-6/7, result §5b),
 *   `fill` on                                    = R-SE-5 (§5b), `neighbourVote` off (not chosen by R-SE-6).
 * Changing a number here needs a new measurement.
 */
export const CLUTTER_RULE: Readonly<ClutterParams> = Object.freeze({
  rhoMax: 0.8, zCapDbz: 15, kernel: 3,
  snrMinDb: CLUTTER_SNR_MIN_DB, snrOffsetDb: CLUTTER_SNR_OFFSET_DB, minCells: CLUTTER_MIN_CELLS, fill: true,
  neighbourVote: false, rhoMaxRich: 0.85, richCells: CLUTTER_RICH_CELLS,
});
export const CLUTTER_RULE_MEASURED = '2026-10-13';

const BLOCK_CELLS = HD250_FACTOR * HD250_FACTOR;   // 16

/** One site's echoes binned on the RV 1-km grid (window = the site image's footprint inside the RV domain). */
export interface SiteBlocks {
  site: string;
  /** false: the site has a px250 image but no usable sweep — its echoes count as precipitation (fail-open) */
  hasSweep: boolean;
  i0: number; j0: number; w: number; h: number;
  /** px250 echo cells per block (0 … 16) */
  nEcho: Uint8Array;
  /** of those with ρHV evidence (SNR ≥ minimum) */
  nEv: Uint8Array;
  /** strongest echo per block (dBZ), −Infinity without echo */
  zMax: Float32Array;
  /** corrected ρHV of the evidence cells, 16 slots per block, filled from slot 0 */
  vals: Float32Array;
}

export function siteBlocks(g: Px250Grid, sr: SiteRho | null, dbz0: number, p: Pick<ClutterParams, 'snrMinDb' | 'snrOffsetDb'>): SiteBlocks {
  const { dk, dl } = px250Shift(g);
  const S = g.size;
  const i0 = Math.max(0, Math.floor(dk / HD250_FACTOR)), j0 = Math.max(0, Math.floor(dl / HD250_FACTOR));
  const i1 = Math.min(RV_COLS, Math.floor((dk + S - 1) / HD250_FACTOR) + 1), j1 = Math.min(RV_ROWS, Math.floor((dl + S - 1) / HD250_FACTOR) + 1);
  const w = Math.max(0, i1 - i0), h = Math.max(0, j1 - j0);
  const nEcho = new Uint8Array(w * h), nEv = new Uint8Array(w * h);
  const zMax = new Float32Array(w * h).fill(-Infinity);
  const hasSweep = !!sr && Number.isFinite(dbz0);
  const vals = hasSweep ? new Float32Array(w * h * BLOCK_CELLS) : new Float32Array(0);
  for (let b = 0; b < S; b++) {
    const l = b + dl;
    if (l < 0 || l >= HD250_ROWS) continue;
    const j = Math.floor(l / HD250_FACTOR) - j0;
    for (let a = 0; a < S; a++) {
      const z = g.dbz[b * S + a];
      if (!(z > -Infinity)) continue;
      const k = a + dk;
      if (k < 0 || k >= HD250_COLS) continue;
      const blk = j * w + Math.floor(k / HD250_FACTOR) - i0;
      nEcho[blk]++;
      if (z > zMax[blk]) zMax[blk] = z;
      if (!hasSweep) continue;
      const rho = sr!.rho[b * S + a];
      if (!(rho === rho)) continue;
      const snr = snrDb(z, sr!.rangeKm[b * S + a], dbz0) - p.snrOffsetDb;
      if (snr < p.snrMinDb) continue;
      vals[blk * BLOCK_CELLS + nEv[blk]++] = rhoNoiseCorrected(rho, snr);
    }
  }
  return { site: g.site, hasSweep, i0, j0, w, h, nEcho, nEv, zMax, vals };
}

/** Statistic of one site at RV cell (i, j): echo cells, evidence cells, strongest echo, median corrected ρHV. */
export interface BlockStat { nEcho: number; nEv: number; zMax: number; med: number }
const scratch = new Float32Array(9 * BLOCK_CELLS);
export function blockStat(sb: SiteBlocks, i: number, j: number, kernel: 1 | 3): BlockStat | null {
  const r = kernel === 3 ? 1 : 0;
  let nEcho = 0, nEv = 0, zMax = -Infinity;
  for (let dj = -r; dj <= r; dj++) {
    const y = j + dj - sb.j0;
    if (y < 0 || y >= sb.h) continue;
    for (let di = -r; di <= r; di++) {
      const x = i + di - sb.i0;
      if (x < 0 || x >= sb.w) continue;
      const blk = y * sb.w + x;
      nEcho += sb.nEcho[blk];
      if (sb.zMax[blk] > zMax) zMax = sb.zMax[blk];
      const n = sb.nEv[blk];
      for (let t = 0; t < n; t++) scratch[nEv++] = sb.vals[blk * BLOCK_CELLS + t];
    }
  }
  if (nEcho === 0) return null;
  let med = NaN;
  if (nEv > 0) {
    const v = scratch.subarray(0, nEv).slice().sort();
    med = nEv % 2 ? v[(nEv - 1) / 2] : (v[nEv / 2 - 1] + v[nEv / 2]) / 2;
  }
  return { nEcho, nEv, zMax, med };
}

/**
 * The decision on a site's neighbourhood statistic — the rule itself, shared by `siteVote`, the scorer's fixture check
 * and the verifier: too little evidence ⇒ no vote; median corrected ρHV below the threshold (the "rich" one from
 * `richCells` evidence cells on) AND strongest echo below the cap ⇒ "no precipitation"; else "precipitation".
 */
export function voteFromStat(st: Pick<BlockStat, 'nEv' | 'zMax' | 'med'> | null, p: ClutterParams): 0 | 1 | 2 {
  if (!st || st.nEv < p.minCells * (p.kernel === 3 ? 3 : 1)) return 0;
  const limit = st.nEv >= p.richCells ? p.rhoMaxRich : p.rhoMax;
  return st.med < limit && st.zMax < p.zCapDbz ? 1 : 2;
}

/** Vote of one site for one RV cell: 0 = none (no echo, or no evidence), 1 = no precipitation, 2 = precipitation. */
export function siteVote(sb: SiteBlocks, i: number, j: number, p: ClutterParams): 0 | 1 | 2 {
  const x = i - sb.i0, y = j - sb.j0;
  const own = x >= 0 && y >= 0 && x < sb.w && y < sb.h && sb.nEcho[y * sb.w + x] > 0;   // does the site see an echo HERE?
  if (!own && !(p.neighbourVote && p.kernel === 3)) return 0;
  if (!sb.hasSweep) return own ? 2 : 0;
  return voteFromStat(blockStat(sb, i, j, p.kernel), p);
}

/**
 * Per block and site, everything `siteVote` needs for ONE rule without sorting: evidence cells below each of the two
 * thresholds and, for the even-count tie, the largest value below and the smallest value at or above each threshold.
 * `siteVoteFast` reads nine blocks instead of sorting up to 144 values and returns exactly what `siteVote` returns
 * (verifier C6: equal on every cell of real slots and of random fields).
 */
export interface SiteSummary {
  sb: SiteBlocks;
  below: Uint8Array; belowRich: Uint8Array;
  maxBelow: Float32Array; minAbove: Float32Array; maxBelowRich: Float32Array; minAboveRich: Float32Array;
}
export function siteSummary(sb: SiteBlocks, p: ClutterParams): SiteSummary {
  const n = sb.w * sb.h;
  const below = new Uint8Array(n), belowRich = new Uint8Array(n);
  const maxBelow = new Float32Array(n).fill(-Infinity), minAbove = new Float32Array(n).fill(Infinity);
  const maxBelowRich = new Float32Array(n).fill(-Infinity), minAboveRich = new Float32Array(n).fill(Infinity);
  if (sb.hasSweep) for (let blk = 0; blk < n; blk++) {
    const m = sb.nEv[blk];
    for (let t = 0; t < m; t++) {
      const v = sb.vals[blk * BLOCK_CELLS + t];
      if (v < p.rhoMax) { below[blk]++; if (v > maxBelow[blk]) maxBelow[blk] = v; } else if (v < minAbove[blk]) minAbove[blk] = v;
      if (v < p.rhoMaxRich) { belowRich[blk]++; if (v > maxBelowRich[blk]) maxBelowRich[blk] = v; } else if (v < minAboveRich[blk]) minAboveRich[blk] = v;
    }
  }
  return { sb, below, belowRich, maxBelow, minAbove, maxBelowRich, minAboveRich };
}
export function siteVoteFast(su: SiteSummary, i: number, j: number, p: ClutterParams): 0 | 1 | 2 {
  const sb = su.sb, x = i - sb.i0, y = j - sb.j0;
  const own = x >= 0 && y >= 0 && x < sb.w && y < sb.h && sb.nEcho[y * sb.w + x] > 0;
  if (!own && !(p.neighbourVote && p.kernel === 3)) return 0;
  if (!sb.hasSweep) return own ? 2 : 0;
  const r = p.kernel === 3 ? 1 : 0;
  let nEcho = 0, nEv = 0, zMax = -Infinity, cA = 0, cB = 0, mbA = -Infinity, maA = Infinity, mbB = -Infinity, maB = Infinity;
  for (let dj = -r; dj <= r; dj++) {
    const yy = y + dj;
    if (yy < 0 || yy >= sb.h) continue;
    for (let di = -r; di <= r; di++) {
      const xx = x + di;
      if (xx < 0 || xx >= sb.w) continue;
      const blk = yy * sb.w + xx;
      nEcho += sb.nEcho[blk];
      if (sb.zMax[blk] > zMax) zMax = sb.zMax[blk];
      nEv += sb.nEv[blk]; cA += su.below[blk]; cB += su.belowRich[blk];
      if (su.maxBelow[blk] > mbA) mbA = su.maxBelow[blk];
      if (su.minAbove[blk] < maA) maA = su.minAbove[blk];
      if (su.maxBelowRich[blk] > mbB) mbB = su.maxBelowRich[blk];
      if (su.minAboveRich[blk] < maB) maB = su.minAboveRich[blk];
    }
  }
  if (nEcho === 0 || nEv < p.minCells * (p.kernel === 3 ? 3 : 1)) return 0;
  const rich = nEv >= p.richCells;
  const limit = rich ? p.rhoMaxRich : p.rhoMax, c = rich ? cB : cA;
  let low: boolean;
  if (nEv % 2) low = c >= (nEv + 1) / 2;
  else if (c > nEv / 2) low = true;
  else if (c < nEv / 2) low = false;
  else low = ((rich ? mbB : mbA) + (rich ? maB : maA)) / 2 < limit;   // the two middle values straddle the threshold
  return low && zMax < p.zCapDbz ? 1 : 2;
}

export interface ClutterMask {
  /** per RV cell: 1 = echo without precipitation (mask it), 0 = leave */
  mask: Uint8Array;
  /** per RV cell: 0 = no vote, 1 = only "no precipitation" votes, 2 = at least one "precipitation" vote */
  vote: Uint8Array;
  /** wet cells / of those masked by votes / masked by the fill / with a precipitation vote / without any vote */
  wet: number; masked: number; filled: number; kept: number; unvoted: number;
}

/**
 * The mask of one analysis: a wet RV cell is masked when at least one site votes "no precipitation" and none votes
 * "precipitation". `wet[k] > 0` marks the cells the display would draw (the caller's choice: log byte > 0).
 */
export function clutterMask(wet: ArrayLike<number>, blocks: SiteBlocks[], p: ClutterParams): ClutterMask {
  const N = RV_COLS * RV_ROWS;
  if (wet.length !== N) throw new Error(`clutterMask: ${wet.length} Zellen statt ${N}`);
  const mask = new Uint8Array(N), vote = new Uint8Array(N);
  const summaries = blocks.map((sb) => siteSummary(sb, p));
  let nWet = 0, masked = 0, filled = 0, kept = 0;
  for (let j = 0; j < RV_ROWS; j++) for (let i = 0; i < RV_COLS; i++) {
    const k = j * RV_COLS + i;
    if (!(wet[k] > 0)) continue;
    nWet++;
    let v = 0;
    for (const su of summaries) {
      const s = siteVoteFast(su, i, j, p);
      if (s === 2) { v = 2; break; }
      if (s === 1) v = 1;
    }
    vote[k] = v;
    if (v === 1) { mask[k] = 1; masked++; } else if (v === 2) kept++;
  }
  if (p.fill && masked > 0) {
    // one pass, read from `vote` only: an unvoted wet cell joins the mask when its 5 × 5 neighbourhood holds at least
    // three "no precipitation" cells and not one "precipitation" cell
    for (let j = 0; j < RV_ROWS; j++) for (let i = 0; i < RV_COLS; i++) {
      const k = j * RV_COLS + i;
      if (!(wet[k] > 0) || vote[k] !== 0) continue;
      let c = 0, pr = 0;
      for (let dj = -2; dj <= 2 && !pr; dj++) {
        const y = j + dj;
        if (y < 0 || y >= RV_ROWS) continue;
        for (let di = -2; di <= 2; di++) {
          const x = i + di;
          if (x < 0 || x >= RV_COLS) continue;
          const vv = vote[y * RV_COLS + x];
          if (vv === 2) { pr = 1; break; }
          if (vv === 1) c++;
        }
      }
      if (!pr && c >= 3) { mask[k] = 1; filled++; }
    }
  }
  return { mask, vote, wet: nWet, masked, filled, kept, unvoted: nWet - masked - kept };
}

/**
 * Forecast frames: the RV forecast advects the analysis, so the mask has to travel with the echo. Labels of the
 * previous frame (0 dry, 1 precipitation, 2 masked) are handed to the wet cells of the next frame by the NEAREST
 * labelled cell within `maxKm` (chamfer 3-4 distance, two passes); a wet cell with no labelled cell in reach is new
 * echo and counts as precipitation, and on equal distance precipitation wins. With no masked cell in the previous
 * frame the result is "all precipitation" — the frame is not touched.
 * The distance transform runs only in the window of the masked cells ± 2 · maxKm (a nearer precipitation cell of a cell
 * that can become masked at all lies inside it); everything outside is precipitation by definition.
 */
export function propagateLabels(prev: Uint8Array, nextWet: ArrayLike<number>, maxKm = 8): Uint8Array {
  const W = RV_COLS, H = RV_ROWS, N = W * H;
  const out = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (nextWet[k] > 0) out[k] = 1;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (prev[j * W + i] === 2) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
  if (x1 < 0) return out;
  const pad = Math.ceil(maxKm) * 2 + 1;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, INF = 0x7fff, lim = Math.round(maxKm * 3);
  const dist = new Int16Array(w * h).fill(INF), lab = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const p = prev[(j + y0) * W + i + x0]; if (p) { dist[j * w + i] = 0; lab[j * w + i] = p; } }
  const relax = (k: number, from: number, cost: number): void => {
    const d = dist[from] + cost;
    if (d < dist[k] || (d === dist[k] && lab[from] === 1 && lab[k] === 2)) { dist[k] = d; lab[k] = lab[from]; }
  };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (i > 0) relax(k, k - 1, 3);
    if (j > 0) { relax(k, k - w, 3); if (i > 0) relax(k, k - w - 1, 4); if (i < w - 1) relax(k, k - w + 1, 4); }
  }
  for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
    const k = j * w + i;
    if (i < w - 1) relax(k, k + 1, 3);
    if (j < h - 1) { relax(k, k + w, 3); if (i < w - 1) relax(k, k + w + 1, 4); if (i > 0) relax(k, k + w - 1, 4); }
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const g = (j + y0) * W + i + x0;
    if (out[g] && dist[j * w + i] <= lim && lab[j * w + i] === 2) out[g] = 2;
  }
  return out;
}

/** Labels of the analysis: 0 dry, 1 wet and kept, 2 wet and masked. */
export function analysisLabels(wet: ArrayLike<number>, mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(wet.length);
  for (let k = 0; k < out.length; k++) if (wet[k] > 0) out[k] = mask[k] ? 2 : 1;
  return out;
}

/**
 * Applies the analysis mask to the display plane of a whole RV run: `planes` = the log planes by ascending lead
 * (lead 0 first); the masked cells are set to 0 IN PLACE, frame by frame with the labels handed on. Returns the masked
 * cells per frame. With an empty mask nothing is read or written.
 */
export function applyClutterToRun(planes: Uint8Array[], mask: Uint8Array, maxKm = 8): number[] {
  const counts: number[] = [];
  let any = false;
  for (let k = 0; k < mask.length; k++) if (mask[k]) { any = true; break; }
  if (!any || !planes.length) return planes.map(() => 0);
  let labels = analysisLabels(planes[0], mask);
  for (let f = 0; f < planes.length; f++) {
    if (f > 0) labels = propagateLabels(labels, planes[f], maxKm);
    let n = 0;
    const p = planes[f];
    for (let k = 0; k < p.length; k++) if (labels[k] === 2) { p[k] = 0; n++; }
    counts.push(n);
  }
  return counts;
}

export { px250Shift };
