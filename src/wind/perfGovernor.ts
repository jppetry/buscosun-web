/**
 * Adaptive performance governor for the GPU particle wind field.
 *
 * Goal (cross-device parity): hold a smooth frame rate on any GPU/CPU while
 * keeping the *look* as close as the hardware allows. Naively using the same
 * particle count everywhere either janks weak phones or wastes strong desktops.
 * So we regulate the workload in two stages:
 *
 *  1. STATIC capability tier (`readDeviceCaps` + `initialTier`) — picks a sensible
 *     STARTING quality from DPR, core count, device memory, pointer type and the
 *     GPU renderer string. This is only a starting point so the runtime loop
 *     converges fast; it is deliberately NOT a hard cap.
 *  2. RUNTIME governor (`FrameGovernor`) — an EMA of the real frame interval steps
 *     a discrete quality level up or down with HYSTERESIS (separate up/down
 *     thresholds) and a COOLDOWN, so it settles instead of oscillating. Quality is
 *     a multiplier on the drawn particle count (a flicker-free lever: no texture
 *     realloc, it only draws fewer of the existing particles → less overdraw).
 *
 * Desktop safety: a healthy device sits at the TOP level, whose multiplier is
 * exactly 1.0 → identical to the un-governed behaviour. The governor only pulls a
 * device DOWN when its measured frame interval is sustainedly bad; it never makes
 * a smooth device render differently.
 *
 * Pure module (no DOM beyond an optional WebGL context read) → the stepping logic
 * is verified deterministically by `scripts/verify-governor.mjs` with synthetic
 * frame-time sequences.
 */

export type PerfTier = 'low' | 'mid' | 'high';
export type GpuClass = 'weak' | 'mid' | 'strong' | 'unknown';

export interface DeviceCaps {
  dpr: number;
  /** navigator.hardwareConcurrency (logical cores); 0 if unknown. */
  cores: number;
  /** navigator.deviceMemory in GB; 0 if unknown (Safari/Firefox don't expose it). */
  memoryGB: number;
  coarsePointer: boolean;
  /** UNMASKED_RENDERER_WEBGL string, '' if the extension is unavailable. */
  gpu: string;
  gpuClass: GpuClass;
}

/**
 * Best-effort GPU strength bucket from the renderer string. Heuristic and
 * intentionally conservative: an unrecognised GPU is 'unknown' (NOT penalised) —
 * the runtime governor will still pull it down if it actually can't keep up.
 */
export function classifyGpu(renderer: string): GpuClass {
  const r = (renderer || '').toLowerCase();
  if (!r) return 'unknown';
  // Desktop / strong discrete + Apple Silicon.
  if (/(nvidia|geforce|rtx|gtx|radeon rx|radeon pro|apple m[0-9]|arc a[0-9])/.test(r)) return 'strong';
  // Known weak mobile / old integrated.
  if (/(adreno \(tm\) [1-5]|adreno [1-5][0-9][0-9]|mali-[4t]|mali-g5|powervr|videocore|swiftshader|llvmpipe|intel.*(hd|gma)|apple a[0-9]\b|apple a1[01])/.test(r)) return 'weak';
  // Mid mobile / mid integrated (recent Adreno/Mali, Apple A12+, Intel Iris/UHD).
  if (/(adreno \(tm\) [67]|adreno [67][0-9][0-9]|mali-g[67]|apple a1[2-9]|apple a[2-9][0-9]|intel.*(iris|uhd)|radeon|amd)/.test(r)) return 'mid';
  return 'unknown';
}

/** Read device capabilities. `gl` optional — without it, GPU class is 'unknown'. */
export function readDeviceCaps(gl?: WebGLRenderingContext | WebGL2RenderingContext | null): DeviceCaps {
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  const cores = (nav as Navigator).hardwareConcurrency || 0;
  const memoryGB = (nav as unknown as { deviceMemory?: number }).deviceMemory || 0;
  const coarsePointer =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
  let gpu = '';
  try {
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    }
  } catch {
    /* renderer info blocked (privacy) → leave '' */
  }
  return { dpr, cores, memoryGB, coarsePointer, gpu, gpuClass: classifyGpu(gpu) };
}

/**
 * Pick the STARTING tier. Coarse rules — the runtime governor does the fine
 * regulation. A strong GPU or a fine-pointer (desktop) device starts high; a
 * weak GPU or an evidently constrained device (few cores / little memory) starts
 * low; everything else starts mid so it converges from the middle.
 */
export function initialTier(caps: DeviceCaps): PerfTier {
  // Fine-pointer (desktop/laptop) ALWAYS starts high, even on weak integrated
  // GPUs (e.g. Intel UHD): the reference must be unchanged there, and the runtime
  // governor pulls it down only if the measured frame rate is actually bad. This
  // guarantees "no desktop regression" (top tier → quality 1.0 → byte-identical).
  if (!caps.coarsePointer) return 'high';
  // Touch devices: start from the GPU/resource class and let the loop converge.
  if (caps.gpuClass === 'strong') return 'high';
  if (caps.gpuClass === 'weak') return 'low';
  if ((caps.cores && caps.cores <= 4) || (caps.memoryGB && caps.memoryGB <= 3)) return 'low';
  return 'mid';
}

export interface GovernorOptions {
  /** Quality multipliers, ascending; the LAST must be 1.0 (top = un-governed). */
  levels?: number[];
  /** Step DOWN when the frame-interval EMA exceeds this (ms). ~24 ms ≈ 42 fps. */
  downMs?: number;
  /** Step UP when the EMA is below this (ms). Must be < downMs (hysteresis gap).
   *  MUST be ABOVE the vsync frame time (~16.7 ms @ 60 Hz): a display-capped
   *  device sits at ~16.7 ms even with headroom, so a lower threshold would trap
   *  it below full quality forever. 18 ms lets any ~56 fps+ device climb to top;
   *  only a device that measurably drops below that stops climbing. */
  upMs?: number;
  /** EMA smoothing factor (0..1); higher = reacts faster. */
  emaAlpha?: number;
  /** Min frames between level changes (prevents rapid stepping / flicker). */
  cooldownFrames?: number;
  /** Ignore the first N frames (load spikes / cold GPU compile). */
  warmupFrames?: number;
  /** Starting level index into `levels`. */
  startLevelIndex?: number;
}

const DEFAULT_LEVELS = [0.4, 0.6, 0.8, 1.0];

/**
 * Frame-interval governor. Feed the wall-clock interval between rendered frames;
 * it maintains an EMA and steps the quality level with hysteresis + cooldown.
 */
export class FrameGovernor {
  private levels: number[];
  private downMs: number;
  private upMs: number;
  private alpha: number;
  private cooldownFrames: number;
  private warmupFrames: number;

  private i: number;
  private _ema = 0;
  private frames = 0;
  private cooldown = 0;

  constructor(opts: GovernorOptions = {}) {
    this.levels = opts.levels && opts.levels.length ? opts.levels.slice() : DEFAULT_LEVELS.slice();
    this.downMs = opts.downMs ?? 24;
    this.upMs = opts.upMs ?? 18;
    // Etwas schneller reagierend + kürzeres Cooldown als die ursprünglichen
    // 0.08/45 (moderat nachjustiert, s. Performance-Optimierungsplan #7): auf
    // einem schwachen Gerät soll die Qualität schneller herunterfahren, sobald
    // ein echter Slowdown (z. B. Pinch-Zoom-Geste) einsetzt, ohne die gegen
    // Oszillation/Flackern getunte Hysterese/Totzone selbst anzufassen.
    // Gegen scripts/verify-governor.mjs validiert (alle 18 Checks weiterhin PASS).
    this.alpha = opts.emaAlpha ?? 0.12;
    this.cooldownFrames = opts.cooldownFrames ?? 25;
    this.warmupFrames = opts.warmupFrames ?? 30;
    const maxI = this.levels.length - 1;
    this.i = Math.max(0, Math.min(maxI, opts.startLevelIndex ?? maxI));
  }

  /** Feed the interval (ms) since the previous rendered frame. */
  feed(dtMs: number): void {
    // Clamp: a tab-switch / GC pause / first frame must not swing the EMA.
    const dt = Math.min(100, Math.max(4, dtMs));
    this.frames++;
    this._ema = this._ema === 0 ? dt : this._ema * (1 - this.alpha) + dt * this.alpha;
    if (this.frames <= this.warmupFrames) return;
    if (this.cooldown > 0) { this.cooldown--; return; }
    if (this._ema > this.downMs && this.i > 0) {
      this.i--;
      this.cooldown = this.cooldownFrames;
    } else if (this._ema < this.upMs && this.i < this.levels.length - 1) {
      this.i++;
      this.cooldown = this.cooldownFrames;
    }
  }

  /** Current quality multiplier (drawn-particle fraction). Top level = 1.0. */
  get quality(): number { return this.levels[this.i]; }
  get levelIndex(): number { return this.i; }
  get levelCount(): number { return this.levels.length; }
  get ema(): number { return this._ema; }
  /** Coarse tier name derived from the current level (for display/debug). */
  get tierName(): PerfTier {
    const n = this.levels.length;
    if (this.i >= n - 1) return 'high';
    if (this.i <= 0) return 'low';
    return 'mid';
  }
}

/** Map a starting tier to a level index for the default 4-level ladder. */
export function tierToLevelIndex(tier: PerfTier, levelCount = DEFAULT_LEVELS.length): number {
  const last = levelCount - 1;
  if (tier === 'high') return last;
  if (tier === 'low') return 0;
  return Math.round(last / 2);
}
