import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import {
  bindAttribute,
  bindFramebuffer,
  bindTexture,
  createBuffer,
  createDataTexture,
  createProgram,
  createTexture,
  getColorRamp,
  type DataTextureFormat,
  type ProgramWrapper,
} from './glUtil';
import { drawFrag, drawVert, drawVertProjected, heatmapFrag, heatmapVert, heatmapVertProjected, quadVert, screenFrag, updateFrag } from './shaders';
import { FrameGovernor, readDeviceCaps, initialTier, tierToLevelIndex, type DeviceCaps } from './perfGovernor';

/** MapLibre v5 projection data passed to custom layers (subset we use). */
interface ProjectionUniforms {
  mainMatrix: Float32List;
  tileMercatorCoords: [number, number, number, number];
  clippingPlane: [number, number, number, number];
  projectionTransition: number;
  fallbackMatrix: Float32List;
}

export interface WindMeta {
  width: number;
  height: number;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  /** Equirectangular UV bounds (x0,y0,x1,y1) of the wind data within global [0,1]². Default: full world. */
  uvBounds?: [number, number, number, number];
}

interface WindData extends WindMeta {
  image: HTMLImageElement | HTMLCanvasElement;
  uvBounds: [number, number, number, number];
}

const MERC_MAX_LAT = 85.05112878;
const PI = Math.PI;

function lngToMercX(lng: number): number {
  return (lng + 180) / 360;
}
function latToMercY(lat: number): number {
  const clamped = Math.max(-MERC_MAX_LAT, Math.min(MERC_MAX_LAT, lat));
  return 0.5 - Math.log(Math.tan(PI / 4 + (clamped * PI) / 360)) / (2 * PI);
}
function lngToEquiX(lng: number): number {
  return (lng + 180) / 360;
}
function latToEquiY(lat: number): number {
  return (90 - lat) / 180;
}

export interface WindLayerOptions {
  id?: string;
  /** Feste Partikelzahl. Wenn gesetzt, wird die viewport-Skalierung DEAKTIVIERT
   *  (Override für Tests/Sonderfälle). Default: nicht gesetzt → Auto-Skalierung. */
  numParticles?: number;
  /** Partikel pro 1 Mio. CSS-Pixel bei densityMultiplier = 1 (Auto-Skalierung).
   *  Default 3600 → ~4–5k auf einem Laptop, ~9k auf 4K. */
  baseDensity?: number;
  /** Dichte-Regler (UI): multipliziert die viewport-skalierte Partikelzahl.
   *  Default 1. „Intensiv" ≈ 2.x. */
  densityMultiplier?: number;
  /** Untere/obere Klammer der Auto-Partikelzahl. Default 1800 / 22000. */
  minParticles?: number;
  maxParticles?: number;
  fadeOpacity?: number;
  speedFactor?: number;
  /** Referenz-Zoom, bei dem speedFactor exakt gilt (Übersicht). Default 5.5. */
  speedRefZoom?: number;
  /** Zoom-Dämpfung k: 0 = roh (beschleunigt beim Reinzoomen), 1 = konstantes
   *  Bildschirmtempo, >1 = wird beim Reinzoomen langsamer (windy-artig). Default 1.15. */
  speedZoomDamping?: number;
  /** Anzeige-Kennlinie γ (<1 hebt schwache Winde an, damit sie nicht einfrieren). Default 0.5. */
  speedGamma?: number;
  /** Anker-Windgeschwindigkeit (m/s), bei der γ nichts ändert. Default 5. */
  speedRef?: number;
  /** Mindest-Anzeigetempo (m/s) für JEDEN vorhandenen Wind → nie Stillstand. Default 2. */
  speedMin?: number;
  dropRate?: number;
  dropRateBump?: number;
  pointSize?: number;
  windPngUrl?: string;
  windJsonUrl?: string;
  colorRamp?: Record<number, string>;
  showHeatmap?: boolean;
  heatmapOpacity?: number;
  particleColor?: [number, number, number, number];
  /** Anteil der geschwindigkeitsabhängigen Farbe (Color-Ramp), die in die
   *  Partikelfarbe gemischt wird. 0 = reine particleColor, 1 = reine Ramp.
   *  Gibt den Strömungsfäden den nullschool-artigen Farbverlauf. Default 0. */
  speedTint?: number;
  /** Advektions-Sub-Schritte pro Frame: höher = glattere, gekrümmte Pfade bei
   *  hohem speedFactor (gegen „gestrichelte" Trails). 1..4 sinnvoll. Default 1. */
  subSteps?: number;
  /** CPU-Upsampling-Faktor des Windfelds vor dem Half-Float-Upload. Das grobe
   *  1°-Quellgitter (360×180) wird so kontinuierlicher → weichere Strömung.
   *  1 = aus. Default 2. */
  upsample?: number;
  /** Auf Touch-/Schwachgeräten (coarse pointer) die teuren Partikel-Pässe
   *  (Trail-Komposit + Advektions-Update) WÄHREND aktiver Karten-Bewegung
   *  auslassen — nur die Heatmap folgt der Karte, die Partikel kehren bei
   *  `moveend` zurück. Trails werden pro Move-Frame ohnehin verworfen, also kein
   *  sichtbarer Verlust. Default false (Desktop bleibt voll-fidel). */
  reduceMotionOnMove?: boolean;
  /** Laufzeit-FPS-Governor: passt die GEZEICHNETE Partikelzahl an die real
   *  gemessene Bildrate an (EMA + Hysterese), damit schwache GPUs/CPUs flüssig
   *  bleiben und starke die volle Dichte behalten. Oberstes Tier = ×1.0 = keine
   *  Änderung (Desktop bleibt identisch). Default true; für Globus/Tests abschaltbar. */
  adaptiveQuality?: boolean;
}

// Saubere, perzeptuell gleichmäßige Wind-Rampe im nullschool-Charakter:
// dunkles Navy → Teal → Grün → klares Amber → Orange → Rot → Violett → Weiß.
// Bewusst OHNE die matschigen Oliv-/Brauntöne der alten windy-Rampe, die das
// Bild „dreckig" wirken ließen.
const defaultColorRamp: Record<number, string> = {
  0.0:  'rgb(20, 30, 55)',
  0.15: 'rgb(30, 90, 140)',
  0.3:  'rgb(40, 150, 160)',
  0.45: 'rgb(70, 180, 120)',
  0.6:  'rgb(200, 200, 90)',
  0.75: 'rgb(230, 140, 60)',
  0.85: 'rgb(220, 70, 70)',
  0.95: 'rgb(180, 70, 160)',
  1.0:  'rgb(240, 220, 245)',
};

export class WindLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  fadeOpacity: number;
  speedFactor: number;
  speedRefZoom: number;
  speedZoomDamping: number;
  speedGamma: number;
  speedRef: number;
  speedMin: number;
  dropRate: number;
  dropRateBump: number;
  pointSize: number;
  showHeatmap: boolean;
  heatmapOpacity: number;
  particleColor: [number, number, number, number];
  speedTint: number;
  subSteps: number;
  private upsample: number;

  /** Partikel-Animation an/aus (Heatmap bleibt). UI „Aus". */
  showParticles = true;
  /** Globus-Modus: keine Zoom-Ausdünnung, stabiles Tempo (ganze Erde sichtbar). */
  private globeMode = false;
  /** Aktive MapLibre-Projektionsvariante (Mercator/Globe) — steuert Shader-Neubau. */
  private projVariant: string | null = null;
  /** Projektions-Uniforms des aktuellen Frames (null = alte rohe-Matrix-API). */
  private projData: ProjectionUniforms | null = null;
  /** Viewport-Auto-Skalierung der Partikelzahl (aus, wenn numParticles fix gesetzt). */
  private autoScale: boolean;
  private baseDensity: number;
  private densityMultiplier: number;
  private minParticles: number;
  private maxParticles: number;

  private windPngUrl: string;
  private windJsonUrl: string;
  private colorRampStops: Record<number, string>;

  private map: MapLibreMap | null = null;
  private gl: WebGLRenderingContext | null = null;
  private windData: WindData | null = null;

  // Identity of the wind field currently resident on the GPU. Re-applying the
  // SAME frame — e.g. the layer toggled off→on at an unchanged slider hour, or
  // an unrelated layer toggling and re-running the active-keyed effect — used to
  // re-run decodeAndRefine (CPU upsample + 3×3 smooth) and a HALF_FLOAT upload,
  // the dominant per-toggle cost. Frame images are stable references per
  // (hour, dataset) (windFrameInterpolated returns the original/cached frame),
  // so reference identity + the normalization scalars uniquely key the texture;
  // an identical re-apply is now a no-op.
  private _lastWindImage: HTMLImageElement | HTMLCanvasElement | null = null;
  private _lastWindMetaKey = '';

  private _numParticles: number;
  private particleStateResolution = 0;

  private drawProgram!: ProgramWrapper;
  private screenProgram!: ProgramWrapper;
  private updateProgram!: ProgramWrapper;
  private heatmapProgram!: ProgramWrapper;

  private quadBuffer!: WebGLBuffer;
  private framebuffer!: WebGLFramebuffer;
  private particleIndexBuffer!: WebGLBuffer;
  private heatmapBuffer!: WebGLBuffer;
  private heatmapVertexCount = 0;

  private particleStateTexture0!: WebGLTexture;
  private particleStateTexture1!: WebGLTexture;
  private windTexture: WebGLTexture | null = null;
  private colorRampTexture!: WebGLTexture;
  private backgroundTexture!: WebGLTexture;
  private screenTexture!: WebGLTexture;

  private screenWidth = 0;
  private screenHeight = 0;
  // Zeitstempel des letzten Update-Schritts für die delta-time-Normierung der
  // Advektion (entkoppelt die Partikelgeschwindigkeit von der Bildwiederholrate).
  private lastFrameTime = 0;
  // Per-frame delta-time scale (relative to 60 fps), computed once per render and
  // shared by BOTH the advection step and the trail fade. Time-normalizing the
  // fade makes the trail LENGTH frame-rate-independent — otherwise a slower
  // (mobile) frame rate stretches trails in wall-clock, a key cause of the
  // mobile↔desktop particle mismatch (advection was already dt-normalized).
  private frameDtScale = 1;
  // Effective pixel ratio (drawingBuffer ÷ CSS width), cached. Used to keep the
  // particle CSS thickness DPR-independent. Reading canvas.clientWidth is a DOM
  // layout query — doing it every frame (as drawParticles used to) forces a
  // reflow each frame whenever styles are dirty (confirmed as a ForcedReflow in
  // the model-switch trace). It only changes on resize, so recompute it in
  // allocScreenTextures (which already runs on buffer-size change) and read the
  // cache in the hot per-frame path.
  private _epr = 1;

  // Adaptive FPS governor: regulates the DRAWN particle count from the measured
  // frame interval so weak devices stay smooth and strong ones keep full density.
  // Null when disabled (globe/tests). See perfGovernor.ts.
  private adaptiveQuality: boolean;
  private governor: FrameGovernor | null = null;
  private perfCaps: DeviceCaps | null = null;

  // Actual GPU upload format of the wind texture (half-float / float / byte).
  // Captured for the on-device diagnostic (glDiag) — a mobile GPU without float
  // sampling extensions falls back to 'byte' (still correct, just quantized).
  private _windTexFormat: DataTextureFormat = { kind: 'byte' };
  // Run the WebGL capability + framebuffer-completeness probe exactly once.
  private _diagLogged = false;

  private clearOnNextFrame = true;
  private onMove = () => {
    this.clearOnNextFrame = true;
  };
  // Skip the per-frame particle passes while the camera is actively moving
  // (mobile/coarse-pointer only — see reduceMotionOnMove). MapLibre repaints the
  // heatmap from the camera change anyway; particles resume on moveend.
  private reduceMotionOnMove = false;
  private moving = false;
  private onMoveStart = () => { this.moving = true; };
  private onMoveEnd = () => { this.moving = false; this.map?.triggerRepaint(); };
  // Resize: Trails verwerfen UND Partikelzahl an die neue Viewport-Größe anpassen
  // (windy-artig — mehr Bildschirmfläche ⇒ mehr Partikel, gleichbleibende Dichte).
  private onResize = () => {
    this.clearOnNextFrame = true;
    this.applyTargetParticleCount();
  };

  /**
   * Ziel-Partikelzahl. Bei Auto-Skalierung proportional zur sichtbaren CSS-Fläche
   * (× Dichte-Regler), geklemmt auf [min, max] — so bleibt die *Dichte* über
   * Laptop bis 4K konstant, statt einer festen Zahl, die auf großen Schirmen
   * dünn und auf kleinen überladen wirkt. Bei fixem numParticles unverändert.
   */
  private targetParticleCount(): number {
    if (!this.autoScale) return this._numParticles;
    const canvas = this.map?.getCanvas();
    // clientWidth/Height = CSS-Pixel (DPR-unabhängig → kein Explodieren auf Retina).
    const cssW = canvas?.clientWidth || 1280;
    const cssH = canvas?.clientHeight || 720;
    const megapixels = (cssW * cssH) / 1_000_000;
    const raw = this.baseDensity * megapixels * this.densityMultiplier;
    return Math.round(Math.max(this.minParticles, Math.min(this.maxParticles, raw)));
  }

  /** Re-init nur, wenn sich die Partikel-Textur-Auflösung tatsächlich ändert
   *  (Resize/Density feuern oft; Texturen neu zu allozieren ist nicht gratis). */
  private applyTargetParticleCount(): void {
    if (!this.gl) return;
    const target = this.targetParticleCount();
    const targetRes = Math.ceil(Math.sqrt(Math.max(1, target)));
    if (targetRes === this.particleStateResolution) return;
    this.reinitParticles(target);
  }

  /** Dichte-Regler (UI). Multipliziert die viewport-skalierte Partikelzahl. */
  setDensityMultiplier(multiplier: number): void {
    this.densityMultiplier = Math.max(0.05, multiplier);
    // Dichte greift nur im Auto-Modus; sonst ist die feste Zahl gewollt.
    this.autoScale = true;
    this.applyTargetParticleCount();
    this.map?.triggerRepaint();
  }

  /** Partikel-Animation an/aus (Heatmap bleibt sichtbar). UI „Aus". */
  setShowParticles(on: boolean): void {
    if (this.showParticles === on) return;
    this.showParticles = on;
    this.clearOnNextFrame = true;
    this.map?.triggerRepaint();
  }

  /** Globus-Modus aktivieren: volle Partikeldichte unabhängig vom (niedrigen)
   *  Globus-Zoom und gleichmäßiges Bildschirmtempo. */
  setGlobeMode(on: boolean): void {
    this.globeMode = on;
    this.map?.triggerRepaint();
  }

  /** Setzt die Positions-Uniforms eines Programms — Projektions-Prelude (Mercator
   *  & Globus) wenn vorhanden, sonst der alte rohe-Matrix-Pfad (u_matrix). */
  private setPositionUniforms(p: ProgramWrapper, matrix: Float32List): void {
    const gl = this.gl!;
    const pd = this.projData;
    if (pd) {
      const setM = (loc: unknown, m: Float32List) => { if (loc) gl.uniformMatrix4fv(loc as WebGLUniformLocation, false, m); };
      const set4 = (loc: unknown, v: [number, number, number, number]) => { if (loc) gl.uniform4f(loc as WebGLUniformLocation, v[0], v[1], v[2], v[3]); };
      const set1 = (loc: unknown, x: number) => { if (loc) gl.uniform1f(loc as WebGLUniformLocation, x); };
      setM(p.u_projection_matrix, pd.mainMatrix);
      set4(p.u_projection_tile_mercator_coords, pd.tileMercatorCoords);
      set4(p.u_projection_clipping_plane, pd.clippingPlane);
      set1(p.u_projection_transition, pd.projectionTransition);
      setM(p.u_projection_fallback_matrix, pd.fallbackMatrix);
    } else if (p.u_matrix) {
      gl.uniformMatrix4fv(p.u_matrix as WebGLUniformLocation, false, matrix);
    }
  }

  /** Partikel-Punktgröße (UI „Intensiv" verbreitert leicht). */
  setPointSize(px: number): void {
    this.pointSize = Math.max(0.5, px);
    this.map?.triggerRepaint();
  }

  /** Schweif-Länge: höher = längere Trails (UI „Intensiv"). 0.90–0.99 sinnvoll. */
  setFadeOpacity(v: number): void {
    this.fadeOpacity = Math.max(0.5, Math.min(0.995, v));
    this.map?.triggerRepaint();
  }

  private fbStatusName(status: number): string {
    const gl = this.gl!;
    switch (status) {
      case gl.FRAMEBUFFER_COMPLETE: return 'COMPLETE';
      case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT: return 'INCOMPLETE_ATTACHMENT';
      case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT: return 'INCOMPLETE_MISSING_ATTACHMENT';
      case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS: return 'INCOMPLETE_DIMENSIONS';
      case gl.FRAMEBUFFER_UNSUPPORTED: return 'UNSUPPORTED';
      default: return `0x${status.toString(16)}`;
    }
  }

  /**
   * One-time WebGL capability + framebuffer-completeness probe. Directly answers
   * the "float render target INCOMPLETE on mobile" hypothesis with real numbers
   * from the actual device (the sandbox can't reach a phone GPU). Note this layer
   * uses ONLY RGBA8 render targets — the trail buffers (background/screen) and the
   * ping-pong particle-state buffers are all UNSIGNED_BYTE, so they must be
   * COMPLETE on any GPU; the only float texture (the wind field) is SAMPLED, never
   * a render target, and already falls back to 'byte' without float extensions.
   * Warns loudly only if a framebuffer is genuinely incomplete (→ no trail
   * accumulation). Reachable on-device via
   * `__map.style._layers.wind.implementation.glDiag`.
   */
  diagnose(): Record<string, unknown> {
    const gl = this.gl;
    if (!gl) return { error: 'no gl context' };
    const prevFB = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const check = (tex: WebGLTexture | null): string => {
      if (!tex) return 'no-texture';
      bindFramebuffer(gl, this.framebuffer, tex);
      return this.fbStatusName(gl.checkFramebufferStatus(gl.FRAMEBUFFER));
    };
    const highp = (shaderType: number): boolean => {
      const f = gl.getShaderPrecisionFormat(shaderType, gl.HIGH_FLOAT);
      return f ? f.precision > 0 : false;
    };
    const diag = {
      contextType: 'texImage3D' in gl ? 'webgl2' : 'webgl1',
      windTextureFormat: this._windTexFormat.kind,
      fb_background: check(this.backgroundTexture),
      fb_screen: check(this.screenTexture),
      fb_particleState: check(this.particleStateTexture1),
      vertexHighpSupported: highp(gl.VERTEX_SHADER),
      fragmentHighpSupported: highp(gl.FRAGMENT_SHADER),
      ext: {
        OES_texture_half_float: !!gl.getExtension('OES_texture_half_float'),
        OES_texture_half_float_linear: !!gl.getExtension('OES_texture_half_float_linear'),
        OES_texture_float: !!gl.getExtension('OES_texture_float'),
        OES_texture_float_linear: !!gl.getExtension('OES_texture_float_linear'),
        EXT_color_buffer_float: !!gl.getExtension('EXT_color_buffer_float'),
        EXT_color_buffer_half_float: !!gl.getExtension('EXT_color_buffer_half_float'),
      },
    };
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFB);
    const incomplete = [diag.fb_background, diag.fb_screen, diag.fb_particleState]
      .some((s) => s !== 'COMPLETE' && s !== 'no-texture');
    if (incomplete) {
      console.warn('[WindLayer] framebuffer INCOMPLETE — trails cannot accumulate:', diag);
    }
    return diag;
  }

  /** Dev handle: `__map.style._layers.wind.implementation.glDiag` on-device. */
  get glDiag(): Record<string, unknown> { return this.diagnose(); }

  // ---- On-device motion probe (dev-only; inert until called) -----------------
  // Measures the GROUND TRUTH of the two reported mobile↔desktop symptoms —
  // reversed direction and excessive speed — straight from the GPU, so the
  // comparison is hard numbers, never "feels off". It reads the ping-pong
  // particle-state texture back with readPixels (RGBA8 → FBO-readable on ANY GPU,
  // unlike the float wind texture), decodes the SAME 2-byte position packing the
  // shader uses, and diffs two snapshots `ms` apart. It changes no physics and
  // adds zero per-frame cost (runs only when invoked from the console via
  // `__map.style._layers.wind.implementation.windMotionDiag()`).

  /** Cached scratch canvas for re-deriving source (u,v) at a sample point. */
  private _probeCanvas: HTMLCanvasElement | null = null;
  private _probeCtx: CanvasRenderingContext2D | null = null;

  /** Read the whole committed particle-state texture (RGBA8) back to the CPU.
   *  particleStateTexture0 holds the latest state (updateParticles swaps into it).
   *  Saves/restores the FBO binding like diagnose(). */
  private readParticleState(): Uint8Array | null {
    const gl = this.gl;
    if (!gl || !this.particleStateTexture0) return null;
    const res = this.particleStateResolution;
    const prevFB = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    bindFramebuffer(gl, this.framebuffer, this.particleStateTexture0);
    const buf = new Uint8Array(res * res * 4);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
      gl.readPixels(0, 0, res, res, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFB);
    return buf;
  }

  /** Decode particle `i`'s equirectangular position from a readback buffer using
   *  the EXACT packing of drawVert/updateFrag: pos = hiByte/255 + loByte/65025.
   *  Particle i lives at texel (i%res, floor(i/res)); readPixels is row-major from
   *  the lower-left, which matches the un-flipped upload order → linear index i. */
  private decodeParticle(buf: Uint8Array, i: number): { x: number; y: number } {
    const o = i * 4;
    return {
      x: buf[o + 2] / 255 + buf[o] / 65025,
      y: buf[o + 3] / 255 + buf[o + 1] / 65025,
    };
  }

  /** Re-derive the source wind (u,v) at an equirectangular point exactly as the
   *  shader samples it (same uvBounds + uMin/uMax mapping). Lets the probe detect a
   *  GPU-side texture flip: if the measured drift sign disagrees with this, the
   *  wind field is mirrored on this device. Returns null outside the data bounds. */
  private sampleSourceWind(x: number, y: number): { u: number; v: number } | null {
    const wd = this.windData;
    if (!wd) return null;
    const [dx0, dy0, dx1, dy1] = wd.uvBounds;
    const wx = (x - dx0) / (dx1 - dx0);
    const wy = (y - dy0) / (dy1 - dy0);
    if (wx < 0 || wx > 1 || wy < 0 || wy > 1) return null;
    const img = wd.image;
    const iw = (img as HTMLImageElement).naturalWidth || img.width;
    const ih = (img as HTMLImageElement).naturalHeight || img.height;
    if (!this._probeCanvas) {
      this._probeCanvas = document.createElement('canvas');
      this._probeCtx = this._probeCanvas.getContext('2d', { willReadFrequently: true });
    }
    const cv = this._probeCanvas!;
    const ctx = this._probeCtx!;
    if (cv.width !== iw || cv.height !== ih) {
      cv.width = iw; cv.height = ih;
      ctx.drawImage(img, 0, 0, iw, ih);
    }
    const px = Math.max(0, Math.min(iw - 1, Math.round(wx * (iw - 1))));
    const py = Math.max(0, Math.min(ih - 1, Math.round(wy * (ih - 1))));
    const d = ctx.getImageData(px, py, 1, 1).data;
    return {
      u: wd.uMin + (wd.uMax - wd.uMin) * (d[0] / 255),
      v: wd.vMin + (wd.vMax - wd.vMin) * (d[1] / 255),
    };
  }

  /**
   * Record N particle trajectories over `ms` and report the two symptoms
   * separately. Run it identically on desktop and mobile and compare:
   *   • DIRECTION — `dirSign` = [sign(median Δlng/s), sign(median Δlat/s)] must be
   *     IDENTICAL across devices. `windSignAtStart` is the sign of the sampled
   *     (u, v); `advectionMatchesWind` is true when the drift agrees with the wind
   *     (Δlng↔u, Δlat↔ +v = northward). A mismatch on ONE device = a platform flip.
   *   • SPEED — `cssPxPerSec` (median) is DPR-independent screen speed; it must
   *     match within tolerance. `degPerSec` is the raw geographic rate.
   * Recycled/wrapped particles are filtered out (Δ unwrapped at the 0/1 seam,
   * jumps > 0.02 equirect dropped as respawns).
   */
  async windMotionDiag(opts: { count?: number; ms?: number } = {}): Promise<Record<string, unknown>> {
    const gl = this.gl;
    const map = this.map;
    if (!gl || !map || !this.windData) return { error: 'layer not ready' };
    const ms = opts.ms ?? 1000;
    const n = this._numParticles;
    const count = Math.max(1, Math.min(opts.count ?? 32, n));
    const step = Math.max(1, Math.floor(n / count));
    const idxs: number[] = [];
    for (let i = 0; i < n && idxs.length < count; i += step) idxs.push(i);

    const bufA = this.readParticleState();
    if (!bufA) return { error: 'readback failed' };
    const tA = performance.now();
    const posA = idxs.map((i) => this.decodeParticle(bufA, i));

    // Count display frames over the window (fps ground truth) while the layer
    // keeps animating; then snapshot again.
    map.triggerRepaint();
    let frames = 0;
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (performance.now() - tA >= ms) { resolve(); return; }
        frames++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const tB = performance.now();
    const bufB = this.readParticleState();
    if (!bufB) return { error: 'readback failed (B)' };
    const dtSec = (tB - tA) / 1000;

    const unwrap = (d: number) => (d > 0.5 ? d - 1 : d < -0.5 ? d + 1 : d);
    const dLng: number[] = [], dLat: number[] = [], pxs: number[] = [];
    let windAgree = 0, windTotal = 0;
    const uSigns: number[] = [], vSigns: number[] = [];
    for (let k = 0; k < idxs.length; k++) {
      const a = posA[k];
      const b = this.decodeParticle(bufB, idxs[k]);
      const dxe = unwrap(b.x - a.x);
      const dye = unwrap(b.y - a.y);
      if (Math.abs(dxe) > 0.02 || Math.abs(dye) > 0.02) continue; // respawn/drop
      // equirect → geographic; Δlat = -Δy (equirect y grows southward)
      const dLngK = dxe * 360;
      const dLatK = -dye * 180;
      dLng.push(dLngK / dtSec);
      dLat.push(dLatK / dtSec);
      const lngA = a.x * 360 - 180, latA = 90 - a.y * 180;
      const lngB = b.x * 360 - 180, latB = 90 - b.y * 180;
      const pA = map.project([lngA, latA]);
      const pB = map.project([lngB, latB]);
      pxs.push(Math.hypot(pB.x - pA.x, pB.y - pA.y) / dtSec);
      const w = this.sampleSourceWind(a.x, a.y);
      if (w) {
        windTotal++;
        uSigns.push(Math.sign(w.u));
        vSigns.push(Math.sign(w.v));
        // drift east ↔ u>0 ; drift north (Δlat>0) ↔ v>0
        if (Math.sign(dLngK) === Math.sign(w.u) && Math.sign(dLatK) === Math.sign(w.v)) windAgree++;
      }
    }
    const median = (arr: number[]) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((p, q) => p - q);
      return s[Math.floor(s.length / 2)];
    };
    const mLng = median(dLng), mLat = median(dLat);
    const report = {
      // --- SPEED (must match desktop↔mobile within tolerance) ---
      cssPxPerSec: Math.round(median(pxs) * 10) / 10,
      degPerSec: { lng: Math.round(mLng * 1000) / 1000, lat: Math.round(mLat * 1000) / 1000 },
      // --- DIRECTION (sign vector must be IDENTICAL across devices) ---
      dirSign: [Math.sign(mLng), Math.sign(mLat)] as [number, number],
      windSignAtStart: [Math.sign(median(uSigns)), Math.sign(median(vSigns))] as [number, number],
      advectionMatchesWind: windTotal ? `${windAgree}/${windTotal}` : 'n/a',
      // --- context for correlating the two ---
      sampled: dLng.length,
      measuredFps: Math.round((frames / dtSec) * 10) / 10,
      frameDtScale: Math.round(this.frameDtScale * 100) / 100,
      windTexFormat: this._windTexFormat.kind,
      epr: Math.round(this._epr * 100) / 100,
      upsample: this.upsample,
      zoom: Math.round((map.getZoom() ?? 0) * 100) / 100,
    };
    // eslint-disable-next-line no-console
    console.table(report);
    return report;
  }

  /** Telemetry for the adaptive governor (null if disabled). Exposed for the
   *  dev `__map` inspector so tier/quality/frame-rate can be watched on-device. */
  get perfState(): { tier: string; quality: number; ema: number; level: number; caps: DeviceCaps | null } | null {
    if (!this.governor) return null;
    return {
      tier: this.governor.tierName,
      quality: this.governor.quality,
      ema: Math.round(this.governor.ema * 10) / 10,
      level: this.governor.levelIndex,
      caps: this.perfCaps,
    };
  }

  constructor(options: WindLayerOptions = {}) {
    this.id = options.id ?? 'wind';
    // Auto-Skalierung nach Viewport, außer numParticles ist explizit fix gesetzt.
    this.autoScale = options.numParticles == null;
    this.baseDensity = options.baseDensity ?? 3600;
    this.densityMultiplier = options.densityMultiplier ?? 1;
    // Floor kept low enough that typical phone viewports (~0.33 CSS-MP) still
    // resolve to the AREA-PROPORTIONAL count (~baseDensity × area) instead of
    // being clamped up — the old 1800 floor over-densified small screens to
    // ~1.5× desktop, a key cause of the mobile↔desktop particle mismatch.
    this.minParticles = options.minParticles ?? 1200;
    this.maxParticles = options.maxParticles ?? 22000;
    // Startwert; bei autoScale in onAdd aus der echten Canvas-Größe ersetzt.
    this._numParticles = options.numParticles ?? 4500;
    this.fadeOpacity = options.fadeOpacity ?? 0.955;
    this.speedFactor = options.speedFactor ?? 0.12;
    this.speedRefZoom = options.speedRefZoom ?? 5.5;
    this.speedZoomDamping = options.speedZoomDamping ?? 1.15;
    this.speedGamma = options.speedGamma ?? 0.5;
    this.speedRef = options.speedRef ?? 5;
    this.speedMin = options.speedMin ?? 2;
    this.dropRate = options.dropRate ?? 0.003;
    this.dropRateBump = options.dropRateBump ?? 0.01;
    this.pointSize = options.pointSize ?? 1.5;
    this.showHeatmap = options.showHeatmap ?? true;
    this.heatmapOpacity = options.heatmapOpacity ?? 0.85;
    this.particleColor = options.particleColor ?? [1.0, 1.0, 1.0, 0.85];
    this.speedTint = options.speedTint ?? 0;
    this.subSteps = Math.max(1, Math.min(4, Math.round(options.subSteps ?? 1)));
    this.upsample = Math.max(1, Math.min(4, Math.round(options.upsample ?? 2)));
    this.reduceMotionOnMove = options.reduceMotionOnMove ?? false;
    this.adaptiveQuality = options.adaptiveQuality ?? true;
    this.windPngUrl = options.windPngUrl ?? '/wind/wind.png';
    this.windJsonUrl = options.windJsonUrl ?? '/wind/wind.json';
    this.colorRampStops = options.colorRamp ?? defaultColorRamp;
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext) {
    this.map = map;
    this.gl = gl;

    // Adaptive governor: read device capabilities (GPU string, cores, memory,
    // DPR, pointer) to pick a starting quality tier; the runtime loop then
    // regulates from the measured frame rate. Disabled in globe/test mode.
    if (this.adaptiveQuality) {
      this.perfCaps = readDeviceCaps(gl);
      this.governor = new FrameGovernor({ startLevelIndex: tierToLevelIndex(initialTier(this.perfCaps)) });
    }

    this.drawProgram = createProgram(gl, drawVert, drawFrag);
    this.screenProgram = createProgram(gl, quadVert, screenFrag);
    this.updateProgram = createProgram(gl, quadVert, updateFrag);
    this.heatmapProgram = createProgram(gl, heatmapVert, heatmapFrag);

    this.quadBuffer = createBuffer(
      gl,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
    );
    this.framebuffer = gl.createFramebuffer()!;

    this.buildHeatmapMesh();

    this.colorRampTexture = createTexture(gl, gl.LINEAR, getColorRamp(this.colorRampStops), 16, 16);

    this.initParticles(this.targetParticleCount());
    this.allocScreenTextures();

    map.on('move', this.onMove);
    map.on('zoom', this.onMove);
    map.on('rotate', this.onMove);
    map.on('pitch', this.onMove);
    map.on('resize', this.onResize);
    map.on('movestart', this.onMoveStart);
    map.on('moveend', this.onMoveEnd);

    if (this._pendingWindData) {
      const { image, meta } = this._pendingWindData;
      this._pendingWindData = null;
      this.setWindData(image, meta);
    } else if (this.windPngUrl) {
      void this.loadWindData();
    }
  }

  onRemove(map: MapLibreMap, gl: WebGLRenderingContext) {
    map.off('move', this.onMove);
    map.off('zoom', this.onMove);
    map.off('rotate', this.onMove);
    map.off('pitch', this.onMove);
    map.off('resize', this.onResize);
    map.off('movestart', this.onMoveStart);
    map.off('moveend', this.onMoveEnd);

    gl.deleteProgram(this.drawProgram.program);
    gl.deleteProgram(this.screenProgram.program);
    gl.deleteProgram(this.updateProgram.program);
    gl.deleteProgram(this.heatmapProgram.program);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.particleIndexBuffer);
    gl.deleteBuffer(this.heatmapBuffer);
    gl.deleteFramebuffer(this.framebuffer);
    gl.deleteTexture(this.particleStateTexture0);
    gl.deleteTexture(this.particleStateTexture1);
    if (this.windTexture) gl.deleteTexture(this.windTexture);
    gl.deleteTexture(this.colorRampTexture);
    gl.deleteTexture(this.backgroundTexture);
    gl.deleteTexture(this.screenTexture);
  }

  private async loadWindData() {
    try {
      const res = await fetch(this.windJsonUrl);
      if (!res.ok) throw new Error(`wind.json: ${res.status}`);
      const meta = (await res.json()) as WindMeta;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('wind.png load failed'));
        img.src = this.windPngUrl;
      });
      this.setWindData(img, meta);
    } catch (err) {
      console.error('[WindLayer] failed to load wind data:', err);
    }
  }

  setWindData(image: HTMLImageElement | HTMLCanvasElement, meta: WindMeta) {
    const gl = this.gl;
    if (!gl) {
      // queue until onAdd has set up gl context
      this._pendingWindData = { image, meta };
      return;
    }

    // Skip the decode + re-upload when the exact same field is already on the
    // GPU. This is what makes a layer on/off toggle cheap: enabling re-runs the
    // active-keyed effect which re-applies the current frame, but the pixels are
    // unchanged, so there is nothing to do. New frames (slider scrub, new model
    // run) carry a different image reference / normalization and fall through.
    const metaKey = `${meta.width}x${meta.height}|${meta.uMin},${meta.uMax},${meta.vMin},${meta.vMax}|${(meta.uvBounds ?? [0, 0, 1, 1]).join(',')}`;
    if (this.windTexture && image === this._lastWindImage && metaKey === this._lastWindMetaKey) {
      return;
    }

    if (this.windTexture) gl.deleteTexture(this.windTexture);

    // Quelle ist ein grobes, 8-bit-quantisiertes Gitter (z. B. 360×180). Wir
    // dekodieren es zu kontinuierlichen Floats, glätten + upsamplen das Feld auf
    // CPU und laden es als HALF_FLOAT hoch — das entfernt die blockigen
    // 1°-Stufen und gibt der Strömung den weichen nullschool-Charakter. Fällt bei
    // fehlender Float-Extension automatisch auf 8-bit zurück.
    const { rgba, width, height } = this.decodeAndRefine(image, meta);
    this.windTexture = createDataTexture(gl, gl.LINEAR, rgba, width, height, this._windTexFormat);

    this.windData = {
      ...meta,
      width,
      height,
      image,
      uvBounds: meta.uvBounds ?? [0, 0, 1, 1],
    };
    this._lastWindImage = image;
    this._lastWindMetaKey = metaKey;
    this.clearOnNextFrame = true;
    this.map?.triggerRepaint();
  }

  /**
   * Dekodiert das Wind-Bild zu normierten u/v-Floats (R/G in [0,1]), upsampelt
   * bilinear um `this.upsample` und glättet anschließend leicht (3×3) — so wird
   * aus dem groben Quellgitter ein kontinuierliches Feld. Liefert RGBA-Floats
   * (R=u, G=v, B=0, A=1) für den Half-Float-Upload.
   */
  private decodeAndRefine(
    image: HTMLImageElement | HTMLCanvasElement,
    meta: WindMeta,
  ): { rgba: Float32Array; width: number; height: number } {
    const sw = meta.width;
    const sh = meta.height;
    const cv = document.createElement('canvas');
    cv.width = sw;
    cv.height = sh;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0, sw, sh);
    const px = ctx.getImageData(0, 0, sw, sh).data;

    // Quell-u/v normiert (0..1).
    const su = new Float32Array(sw * sh);
    const sv = new Float32Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) {
      su[i] = px[i * 4] / 255;
      sv[i] = px[i * 4 + 1] / 255;
    }

    const f = this.upsample;
    const dw = sw * f;
    const dh = sh * f;

    // Bilineares Upsampling. Längengrad wrappt (zyklisch), Breitengrad geklemmt.
    const sampleSrc = (arr: Float32Array, fx: number, fy: number): number => {
      const gx = fx * sw - 0.5;
      const gy = fy * sh - 0.5;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = gx - x0;
      const ty = gy - y0;
      const wrapX = (x: number) => ((x % sw) + sw) % sw;
      const clampY = (y: number) => Math.max(0, Math.min(sh - 1, y));
      const x1 = wrapX(x0 + 1);
      const x0w = wrapX(x0);
      const y0c = clampY(y0);
      const y1c = clampY(y0 + 1);
      const a = arr[y0c * sw + x0w];
      const b = arr[y0c * sw + x1];
      const c = arr[y1c * sw + x0w];
      const d = arr[y1c * sw + x1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };

    const uu = new Float32Array(dw * dh);
    const vv = new Float32Array(dw * dh);
    for (let y = 0; y < dh; y++) {
      const fy = (y + 0.5) / dh;
      for (let x = 0; x < dw; x++) {
        const fx = (x + 0.5) / dw;
        const di = y * dw + x;
        uu[di] = sampleSrc(su, fx, fy);
        vv[di] = sampleSrc(sv, fx, fy);
      }
    }

    // Leichte 3×3-Glättung (zyklisch in X), um Interpolations-Kanten zu brechen.
    const smooth = (arr: Float32Array): Float32Array => {
      const out = new Float32Array(arr.length);
      for (let y = 0; y < dh; y++) {
        for (let x = 0; x < dw; x++) {
          let sum = 0;
          let wsum = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = Math.max(0, Math.min(dh - 1, y + dy));
            for (let dx = -1; dx <= 1; dx++) {
              const xx = ((x + dx) % dw + dw) % dw;
              const w = dx === 0 && dy === 0 ? 4 : (dx === 0 || dy === 0 ? 2 : 1);
              sum += arr[yy * dw + xx] * w;
              wsum += w;
            }
          }
          out[y * dw + x] = sum / wsum;
        }
      }
      return out;
    };
    const us = this.upsample > 1 ? smooth(uu) : uu;
    const vs = this.upsample > 1 ? smooth(vv) : vv;

    const rgba = new Float32Array(dw * dh * 4);
    for (let i = 0; i < dw * dh; i++) {
      rgba[i * 4] = us[i];
      rgba[i * 4 + 1] = vs[i];
      rgba[i * 4 + 2] = 0;
      rgba[i * 4 + 3] = 1;
    }
    return { rgba, width: dw, height: dh };
  }

  private _pendingWindData: { image: HTMLImageElement | HTMLCanvasElement; meta: WindMeta } | null = null;

  private buildHeatmapMesh() {
    const gl = this.gl!;
    const cols = 128;
    const rows = 64;
    const verts: number[] = [];
    const lngStep = 360 / cols;
    const latRange = 2 * MERC_MAX_LAT;
    const latStep = latRange / rows;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const lng0 = -180 + i * lngStep;
        const lng1 = -180 + (i + 1) * lngStep;
        const lat0 = -MERC_MAX_LAT + j * latStep;
        const lat1 = -MERC_MAX_LAT + (j + 1) * latStep;
        verts.push(
          lng0, lat0, lng1, lat0, lng0, lat1,
          lng0, lat1, lng1, lat0, lng1, lat1,
        );
      }
    }
    this.heatmapBuffer = createBuffer(gl, new Float32Array(verts));
    this.heatmapVertexCount = verts.length / 2;
  }

  private initParticles(n: number) {
    const gl = this.gl!;
    const res = Math.ceil(Math.sqrt(n));
    this.particleStateResolution = res;
    this._numParticles = res * res;

    const state = new Uint8Array(this._numParticles * 4);
    for (let i = 0; i < state.length; i++) state[i] = Math.floor(Math.random() * 256);

    this.particleStateTexture0 = createTexture(gl, gl.NEAREST, state, res, res);
    this.particleStateTexture1 = createTexture(gl, gl.NEAREST, state, res, res);

    const indices = new Float32Array(this._numParticles);
    for (let i = 0; i < this._numParticles; i++) indices[i] = i;
    this.particleIndexBuffer = createBuffer(gl, indices);
  }

  /** Partikelzahl zur Laufzeit ändern (Resize/Dichte): alte Textur/Buffer
   *  freigeben, neu mit n Partikeln initialisieren, Trails verwerfen. */
  private reinitParticles(n: number): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.particleStateTexture0) gl.deleteTexture(this.particleStateTexture0);
    if (this.particleStateTexture1) gl.deleteTexture(this.particleStateTexture1);
    if (this.particleIndexBuffer) gl.deleteBuffer(this.particleIndexBuffer);
    this.initParticles(n);
    this.clearOnNextFrame = true;
  }

  private allocScreenTextures() {
    const gl = this.gl!;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    if (w === this.screenWidth && h === this.screenHeight && this.backgroundTexture) return;
    this.screenWidth = w;
    this.screenHeight = h;
    // Recompute the cached effective pixel ratio here (buffer size just changed)
    // instead of per-frame in drawParticles — avoids a per-frame clientWidth
    // reflow. DPR-1 desktop → 1 (unchanged).
    const canvas = this.map?.getCanvas();
    this._epr = canvas && canvas.clientWidth ? w / canvas.clientWidth : 1;
    const empty = new Uint8Array(w * h * 4);
    if (this.backgroundTexture) gl.deleteTexture(this.backgroundTexture);
    if (this.screenTexture) gl.deleteTexture(this.screenTexture);
    this.backgroundTexture = createTexture(gl, gl.NEAREST, empty, w, h);
    this.screenTexture = createTexture(gl, gl.NEAREST, empty, w, h);
    this.clearOnNextFrame = true;
  }

  private clearScreen() {
    const gl = this.gl!;
    const prevFB = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    bindFramebuffer(gl, this.framebuffer, this.backgroundTexture);
    gl.viewport(0, 0, this.screenWidth, this.screenHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    bindFramebuffer(gl, this.framebuffer, this.screenTexture);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFB);
  }

  private getEquirectangularBounds(): [number, number, number, number] {
    // Globus: über die ganze Welt streuen (die Rückseite wird ohnehin geclippt),
    // damit beim Drehen überall Partikel sind. Auf die Daten-UV-Bounds begrenzt.
    if (this.globeMode) {
      return this.windData ? this.windData.uvBounds : [0, 0, 1, 1];
    }
    const map = this.map!;
    const b = map.getBounds();
    const west = b.getWest();
    const east = b.getEast();
    const south = b.getSouth();
    const north = b.getNorth();
    let xMin = lngToEquiX(west);
    let xMax = lngToEquiX(east);
    let yMin = latToEquiY(north);
    let yMax = latToEquiY(south);
    const padX = Math.max((xMax - xMin) * 0.1, 0.02);
    const padY = Math.max((yMax - yMin) * 0.1, 0.02);
    xMin = Math.max(0, xMin - padX);
    xMax = Math.min(1, xMax + padX);
    yMin = Math.max(0, yMin - padY);
    yMax = Math.min(1, yMax + padY);
    // Intersect with the wind-data uv bounds so particles never spawn in
    // areas where we don't have any wind data (they'd be invisible anyway).
    if (this.windData) {
      const [dx0, dy0, dx1, dy1] = this.windData.uvBounds;
      xMin = Math.max(xMin, dx0);
      yMin = Math.max(yMin, dy0);
      xMax = Math.min(xMax, dx1);
      yMax = Math.min(yMax, dy1);
      if (xMax <= xMin) {
        xMin = dx0; xMax = dx1;
      }
      if (yMax <= yMin) {
        yMin = dy0; yMax = dy1;
      }
    }
    return [xMin, yMin, xMax, yMax];
  }

  private getEffectiveParticleCount(): number {
    const zoom = this.map?.getZoom() ?? 5;
    // Globus zeigt die ganze Erde bei niedrigem Zoom — dort volle Dichte (die
    // Mercator-Ausdünnung würde den Globus fast leer machen).
    if (this.globeMode) return this._numParticles;
    // Heavily thin out particles when zoomed out so the map stays readable;
    // ramps from ~5 % at world-view to full count at zoom 6.
    let frac = 1.0;
    if (zoom < 6) {
      frac = Math.max(0.05, Math.min(1.0, 0.05 + Math.max(0, zoom - 1) * 0.19));
    }
    // Adaptive quality multiplier from the FPS governor (1.0 = top tier = no
    // change; lower on weak GPUs/CPUs that can't sustain the frame budget).
    const q = this.governor ? this.governor.quality : 1;
    return Math.min(this._numParticles, Math.floor(this._numParticles * frac * q));
  }

  render(gl: WebGLRenderingContext, args: CustomRenderMethodInput | number[] | Float32Array) {
    if (!this.windData || !this.windTexture) {
      this.map?.triggerRepaint();
      return;
    }

    // MapLibre v5: args is CustomRenderMethodInput with defaultProjectionData +
    // shaderData (projection prelude → works on Mercator AND Globe). Older API /
    // tests: args is a raw 16-number matrix → fall back to the self-contained
    // u_matrix shaders compiled in onAdd.
    let matrix: Float32List;
    if (Array.isArray(args) || args instanceof Float32Array) {
      matrix = args as Float32List;
      this.projData = null;
    } else {
      const pd = args.defaultProjectionData;
      matrix = pd.mainMatrix as unknown as Float32List;
      this.projData = {
        mainMatrix: pd.mainMatrix as unknown as Float32List,
        tileMercatorCoords: pd.tileMercatorCoords as [number, number, number, number],
        clippingPlane: pd.clippingPlane as [number, number, number, number],
        projectionTransition: pd.projectionTransition,
        fallbackMatrix: pd.fallbackMatrix as unknown as Float32List,
      };
      // Geo-projizierende Programme pro Projektionsvariante (Mercator/Globe) neu
      // bauen: MapLibre-Prelude voranstellen, projectTile() im Body.
      const sd = args.shaderData;
      if (sd && this.projVariant !== sd.variantName) {
        const prelude = `${sd.define}\n${sd.vertexShaderPrelude}\n`;
        gl.deleteProgram(this.drawProgram.program);
        gl.deleteProgram(this.heatmapProgram.program);
        this.drawProgram = createProgram(gl, prelude + drawVertProjected, drawFrag);
        this.heatmapProgram = createProgram(gl, prelude + heatmapVertProjected, heatmapFrag);
        this.projVariant = sd.variantName;
      }
    }

    this.allocScreenTextures();

    // One-time capability + framebuffer-completeness probe (wind now present and
    // screen textures allocated). Silent unless a framebuffer is actually
    // incomplete; the full report is readable on-device via `glDiag`.
    if (!this._diagLogged) {
      this._diagLogged = true;
      this.diagnose();
    }

    // Delta-time since the previous rendered frame, referenced to 60 fps and
    // clamped 1–66 ms (a tab-switch / first frame must not jump). Shared by the
    // trail fade (drawScreen) and the advection (updateParticles).
    const now = performance.now();
    const dtMs = this.lastFrameTime ? now - this.lastFrameTime : 16.667;
    this.lastFrameTime = now;
    this.frameDtScale = Math.min(Math.max(dtMs, 1), 66) / 16.667;

    // Decide once whether to skip the expensive particle passes this frame. Only
    // skip when a coarse-pointer device is actively moving AND the governor has
    // throttled it to the FLOOR tier — i.e. it genuinely can't afford particles
    // during a pan. A capable device keeps its particles VISIBLE while panning
    // (no blackout / no flicker); if that starts to jank, the governor lowers the
    // tier and the skip engages automatically. No governor → fall back to the old
    // blanket skip. Desktop (reduceMotionOnMove=false) never skips.
    const skipParticlesDuringMove =
      this.reduceMotionOnMove && this.moving &&
      (!this.governor || this.governor.levelIndex === 0);

    // Feed the adaptive governor the real frame interval — but NOT on frames whose
    // particle work we skipped (artificially cheap → unrepresentative), and NOT in
    // globe mode (full density there). It steps the drawn-particle quality up/down.
    if (this.governor && !this.globeMode && !skipParticlesDuringMove) {
      this.governor.feed(dtMs);
    }

    if (this.clearOnNextFrame) {
      this.clearScreen();
      this.clearOnNextFrame = false;
    }

    const prevFB = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    const prevBlend = gl.getParameter(gl.BLEND) as boolean;
    const prevDepth = gl.getParameter(gl.DEPTH_TEST) as boolean;
    const prevStencil = gl.getParameter(gl.STENCIL_TEST) as boolean;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.BLEND);

    bindTexture(gl, this.windTexture, 0);
    bindTexture(gl, this.particleStateTexture0, 1);

    if (this.showHeatmap) {
      this.drawHeatmap(matrix, prevFB, prevViewport);
    }
    // Particle passes (two full-viewport trail composites + the advection update).
    // Skipped only for a floor-tier device mid-pan (see skipParticlesDuringMove) —
    // capable devices keep particles visible while panning instead of blacking out.
    if (this.showParticles && !skipParticlesDuringMove) {
      this.drawScreen(matrix, prevFB, prevViewport);
      this.updateParticles();
    }

    // restore state for MapLibre
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFB);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
    if (prevBlend) gl.enable(gl.BLEND);
    else gl.disable(gl.BLEND);
    if (prevDepth) gl.enable(gl.DEPTH_TEST);
    if (prevStencil) gl.enable(gl.STENCIL_TEST);

    // Nur weiter animieren, solange Partikel sichtbar sind. Bei reiner Heatmap
    // („Aus") rendert MapLibre ohnehin bei jeder Karten-/Slider-Bewegung neu —
    // ein Dauer-Repaint wäre reine Akku-Verschwendung.
    if (this.showParticles) this.map?.triggerRepaint();
  }

  private drawHeatmap(matrix: Float32List, mapFB: WebGLFramebuffer | null, mapViewport: Int32Array) {
    const gl = this.gl!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, mapFB);
    gl.viewport(mapViewport[0], mapViewport[1], mapViewport[2], mapViewport[3]);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const p = this.heatmapProgram;
    gl.useProgram(p.program);
    bindAttribute(gl, this.heatmapBuffer, p.a_lnglat as number, 2);
    bindTexture(gl, this.windTexture!, 0);
    bindTexture(gl, this.colorRampTexture, 2);
    gl.uniform1i(p.u_wind as WebGLUniformLocation, 0);
    gl.uniform1i(p.u_color_ramp as WebGLUniformLocation, 2);
    gl.uniform2f(p.u_wind_min as WebGLUniformLocation, this.windData!.uMin, this.windData!.vMin);
    gl.uniform2f(p.u_wind_max as WebGLUniformLocation, this.windData!.uMax, this.windData!.vMax);
    // attenuate heatmap when zoomed in close so the underlying map stays readable
    const zoom = this.map?.getZoom() ?? 5;
    const opacityFactor = Math.max(0.35, Math.min(1.0, 1.0 - Math.max(0, zoom - 9) * 0.12));
    gl.uniform1f(p.u_opacity as WebGLUniformLocation, this.heatmapOpacity * opacityFactor);
    const [dx0, dy0, dx1, dy1] = this.windData!.uvBounds;
    gl.uniform4f(p.u_data_uv_bounds as WebGLUniformLocation, dx0, dy0, dx1, dy1);
    this.setPositionUniforms(p, matrix);
    gl.drawArrays(gl.TRIANGLES, 0, this.heatmapVertexCount);

    gl.disable(gl.BLEND);
  }

  private drawScreen(matrix: Float32List, mapFB: WebGLFramebuffer | null, mapViewport: Int32Array) {
    const gl = this.gl!;

    bindFramebuffer(gl, this.framebuffer, this.screenTexture);
    gl.viewport(0, 0, this.screenWidth, this.screenHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // fade-redraw previous frame. fadeOpacity is a per-FRAME factor; raising it
    // to the dt-scale power makes the trail decay per unit of WALL-CLOCK time
    // instead of per frame, so trail length matches across frame rates
    // (desktop↔mobile parity). At 60 fps dtScale≈1 → unchanged.
    const fade = Math.pow(this.fadeOpacity, this.frameDtScale);
    this.drawTexture(this.backgroundTexture, fade);

    // draw new particle positions on top
    this.drawParticles(matrix);

    // composite into MapLibre framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, mapFB);
    gl.viewport(mapViewport[0], mapViewport[1], mapViewport[2], mapViewport[3]);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawTexture(this.screenTexture, 1.0);
    gl.disable(gl.BLEND);

    // swap buffers
    const temp = this.backgroundTexture;
    this.backgroundTexture = this.screenTexture;
    this.screenTexture = temp;
  }

  private drawTexture(texture: WebGLTexture, opacity: number) {
    const gl = this.gl!;
    const p = this.screenProgram;
    gl.useProgram(p.program);
    bindAttribute(gl, this.quadBuffer, p.a_pos as number, 2);
    bindTexture(gl, texture, 2);
    gl.uniform1i(p.u_screen as WebGLUniformLocation, 2);
    gl.uniform1f(p.u_opacity as WebGLUniformLocation, opacity);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private drawParticles(matrix: Float32List) {
    const gl = this.gl!;
    const p = this.drawProgram;
    gl.useProgram(p.program);

    bindAttribute(gl, this.particleIndexBuffer, p.a_index as number, 1);

    bindTexture(gl, this.colorRampTexture, 2);
    gl.uniform1i(p.u_wind as WebGLUniformLocation, 0);
    gl.uniform1i(p.u_particles as WebGLUniformLocation, 1);
    gl.uniform1i(p.u_color_ramp as WebGLUniformLocation, 2);
    gl.uniform1f(p.u_speed_tint as WebGLUniformLocation, this.speedTint);

    gl.uniform1f(p.u_particles_res as WebGLUniformLocation, this.particleStateResolution);
    gl.uniform2f(p.u_wind_min as WebGLUniformLocation, this.windData!.uMin, this.windData!.vMin);
    gl.uniform2f(p.u_wind_max as WebGLUniformLocation, this.windData!.uMax, this.windData!.vMax);
    // scale point size with zoom so particles stay readable when zoomed in
    const zoom = this.map?.getZoom() ?? 5;
    const zoomFactor = Math.max(0.85, Math.min(3.4, 1.0 + (zoom - 5) * 0.3));
    // gl_PointSize is in FRAMEBUFFER pixels, so apparent CSS thickness would be
    // pointSize / effectivePixelRatio — i.e. thinner on high-DPR desktops and on
    // the DPR-capped mobile buffer (a key cause of the mobile↔desktop mismatch).
    // Multiply by the effective pixel ratio (drawingBuffer ÷ CSS width) so the
    // CSS-space thickness is identical across devices. DPR-1 desktop → ×1. The
    // ratio is cached (see _epr) so this hot path does no per-frame DOM query.
    gl.uniform1f(p.u_point_size as WebGLUniformLocation, this.pointSize * zoomFactor * this._epr);
    const c = this.particleColor;
    gl.uniform4f(p.u_particle_color as WebGLUniformLocation, c[0], c[1], c[2], c[3]);
    const [dx0, dy0, dx1, dy1] = this.windData!.uvBounds;
    gl.uniform4f(p.u_data_uv_bounds as WebGLUniformLocation, dx0, dy0, dx1, dy1);
    this.setPositionUniforms(p, matrix);

    gl.drawArrays(gl.POINTS, 0, this.getEffectiveParticleCount());
  }

  private updateParticles() {
    const gl = this.gl!;
    bindFramebuffer(gl, this.framebuffer, this.particleStateTexture1);
    gl.viewport(0, 0, this.particleStateResolution, this.particleStateResolution);

    const p = this.updateProgram;
    gl.useProgram(p.program);
    bindAttribute(gl, this.quadBuffer, p.a_pos as number, 2);

    gl.uniform1i(p.u_wind as WebGLUniformLocation, 0);
    gl.uniform1i(p.u_particles as WebGLUniformLocation, 1);
    gl.uniform1f(p.u_rand_seed as WebGLUniformLocation, Math.random());
    gl.uniform2f(p.u_wind_res as WebGLUniformLocation, this.windData!.width, this.windData!.height);
    gl.uniform2f(p.u_wind_min as WebGLUniformLocation, this.windData!.uMin, this.windData!.vMin);
    gl.uniform2f(p.u_wind_max as WebGLUniformLocation, this.windData!.uMax, this.windData!.vMax);
    gl.uniform1f(p.u_speed_factor as WebGLUniformLocation, this.speedFactor);
    // delta-time scale (relative to 60 fps) computed once per frame in render();
    // keeps the advection speed independent of the frame rate.
    gl.uniform1f(p.u_dt_scale as WebGLUniformLocation, this.frameDtScale);
    // Zoom-Dämpfung: 2^(-(zoom - Z0)·k). Beim Reinzoomen wird der geografische
    // Schritt kleiner, damit die Bildschirmgeschwindigkeit nicht mit 2^zoom
    // hochschießt. Geklemmt, damit Extrem-Zoomstufen nicht ausreißen.
    // Globus: gleichmäßiges Bildschirmtempo (kein 2^zoom-Ausreißen beim
    // niedrigen Globus-Zoom) — referenziert auf einen mittleren Zoom.
    const z = this.globeMode ? this.speedRefZoom : (this.map?.getZoom() ?? this.speedRefZoom);
    let zoomSpeed = Math.pow(2, -(z - this.speedRefZoom) * this.speedZoomDamping);
    // Floor nur sehr tief gegen komplettes Einfrieren bei Extrem-Zoom — höher
    // gesetzt würde er die gewünschte Verlangsamung beim Reinzoomen aufheben.
    zoomSpeed = Math.min(4, Math.max(0.002, zoomSpeed));
    gl.uniform1f(p.u_zoom_speed as WebGLUniformLocation, zoomSpeed);
    gl.uniform1f(p.u_speed_gamma as WebGLUniformLocation, this.speedGamma);
    gl.uniform1f(p.u_speed_ref as WebGLUniformLocation, this.speedRef);
    gl.uniform1f(p.u_speed_min as WebGLUniformLocation, this.speedMin);
    gl.uniform1f(p.u_drop_rate as WebGLUniformLocation, this.dropRate);
    gl.uniform1f(p.u_drop_rate_bump as WebGLUniformLocation, this.dropRateBump);
    // Frame-rate-DETERMINISTIC advection (cross-device parity of speed AND
    // direction). u_dt_scale already normalizes the AVERAGE speed, but a single
    // Euler step of size ∝ dt makes a low-fps device take big steps that cut
    // corners through the curving wind field → it drifts onto a different
    // streamline (looks like a different direction) and covers less arc per
    // second (looks slower). Fix: scale the SUB-STEP COUNT with dt so the
    // per-sub-step offset is constant across devices — a 30 fps phone (dtScale≈2)
    // runs 2 sub-steps of exactly the size a 60 fps desktop runs across 2 frames,
    // re-sampling wind each time → identical discrete trajectory. Total per-frame
    // offset is unchanged (the shader divides by `steps`), so average speed is
    // preserved. At 60 fps (dtScale≈1) this equals the static subSteps → desktop
    // byte-identical. Capped at MAX_SUB_STEPS (4) in the shader; dtScale is
    // clamped to ≤3.96 in render(), so round() lands in [1,4].
    const simSubSteps = Math.max(1, Math.min(4, Math.round(this.frameDtScale * this.subSteps)));
    gl.uniform1f(p.u_sub_steps as WebGLUniformLocation, simSubSteps);

    const bounds = this.getEquirectangularBounds();
    gl.uniform4f(p.u_bounds as WebGLUniformLocation, bounds[0], bounds[1], bounds[2], bounds[3]);
    const [dx0, dy0, dx1, dy1] = this.windData!.uvBounds;
    gl.uniform4f(p.u_data_uv_bounds as WebGLUniformLocation, dx0, dy0, dx1, dy1);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const tmp = this.particleStateTexture0;
    this.particleStateTexture0 = this.particleStateTexture1;
    this.particleStateTexture1 = tmp;
  }
}

// helpers used inside layer; exported only for testing if needed
export const _internals = { lngToMercX, latToMercY, lngToEquiX, latToEquiY };
