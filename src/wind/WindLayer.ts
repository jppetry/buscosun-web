import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import {
  bindAttribute,
  bindFramebuffer,
  bindTexture,
  createBuffer,
  createDataTexture,
  createIndexBuffer,
  createProgram,
  createTexture,
  getColorRamp,
  pickWindTextureKind,
  uploadPackedTexture,
  type DataTextureFormat,
  type PackedTexture,
  type ProgramWrapper,
} from './glUtil';
import { drawFrag, drawVert, drawVertProjected, heatmapFrag, heatmapVert, heatmapVertProjected, quadVert, screenFrag, segDrawFrag, segDrawVert, segDrawVertProjected, updateFrag } from './shaders';
import { FrameGovernor, readDeviceCaps, initialTier, tierToLevelIndex, type DeviceCaps } from './perfGovernor';
import { refineNormalizedUV } from './windRefine';
import { lookupZoomTable, makeSegmentPreset, type SegmentPreset, type WindParticleStyle } from './particlePreset';
import {
  advectionStepScale,
  deadBandStep,
  screenSpeedPxPerSec,
  screenTempoGain,
  LAT_REF_DEG,
  NS_ASPECT,
  TILE_SIZE_CSS,
  type ScreenTempoOptions,
} from './advection';

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
  // Optional: Frames, die als bereits gepackter GPU-Puffer angewendet wurden
  // (s. setWindDataPacked — Slider-Interpolation off-main) haben kein Quell-
  // Image mehr (der Blend+Refine-Schritt lief bereits im Worker). Nur der
  // Dev-Diagnose-Probe (sampleSourceWind) braucht es und bricht ohne sauber ab.
  image?: HTMLImageElement | HTMLCanvasElement;
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

/** Dauer des Auffrisch-Pulses nach einem Zoomwechsel (ms). */
const ZOOM_SETTLE_MS = 1100;
/** Spitzen-Zuschlag auf die Drop-Rate zu Beginn des Pulses (×(1+gain)). */
const ZOOM_SETTLE_GAIN = 4;

export interface WindLayerOptions {
  id?: string;
  /** Feste Partikelzahl. Wenn gesetzt, wird die viewport-Skalierung DEAKTIVIERT
   *  (Override für Tests/Sonderfälle). Default: nicht gesetzt → Auto-Skalierung. */
  numParticles?: number;
  /** Partikel pro 1 Mio. CSS-Pixel **sichtbarer Datenfläche** bei
   *  densityMultiplier = 1 (Auto-Skalierung). Default 2200 → mittlerer
   *  Partikelabstand ~21 px, passend zu 19–45 px langen Schweifen. */
  baseDensity?: number;
  /** Dichte-Regler (UI): multipliziert die viewport-skalierte Partikelzahl.
   *  Default 1. „Intensiv" ≈ 2.x. */
  densityMultiplier?: number;
  /** Untere/obere Klammer der Auto-Partikelzahl. Default 1800 / 22000. */
  minParticles?: number;
  maxParticles?: number;
  /** ALT-Zoomausdünnung („Rule 2"-Fallback, seit 2026-08-08 **default-off**).
   *  Bis dahin dünnte der points-Pfad oberhalb z6 um diesen Teiler je Zoomstufe
   *  aus und unterhalb z6 über eine lineare Rampe — zusammen eine Zeltkurve mit
   *  Scheitel bei z6 und Faktor 3,3 Schwankung der gezeichneten Zahl
   *  (audit/windpartikel-zoom.md §2). Ersetzt durch konstante Dichte je
   *  sichtbarer Datenfläche (s. getEffectiveParticleCount). Wird dieser Wert
   *  **ausdrücklich gesetzt**, kommt die Alt-Kurve zusätzlich zur Anwendung. */
  zoomThinBase?: number;
  /** Untergrenze der ALT-Zoomausdünnung als Anteil der Vollzahl. Wirkt nur,
   *  wenn `zoomThinBase` ausdrücklich gesetzt ist. Default 0.3. */
  zoomThinFloor?: number;
  /** Zulässige Belegung des Positions-Rasters (s. `latticeParticleCap`): Anteil
   *  der auflösbaren Rasterzellen, der höchstens besetzt sein darf. Dünn besetzt
   *  liest sich das Raster als Streuung, dicht besetzt als Gitter-Muster.
   *  Default 0.06. */
  latticeOccupancy?: number;
  fadeOpacity?: number;
  /**
   * TEMPO-REGLER: CSS-px/s je 1 m/s GRIB-Wind, bei 51°N (`LAT_REF_DEG`).
   * Die Abbildung ist strikt linear — doppelter Wind = doppeltes Tempo.
   * Default 6 (10 m/s ⇒ 60 px/s ⇒ ~25 px Schweif bei fadeOpacity 0.972,
   * die Referenzoptik aus `audit/windkarte-vorbild-wetteronline.md`).
   */
  speedPxPerMs?: number;
  /** Dimensionsloser Gesamt-Multiplikator auf `speedPxPerMs`. Default 1. */
  speedFactor?: number;
  /** Referenz-Zoom für `screenTempoZoomExp`. Default 5.5. */
  speedRefZoom?: number;
  /**
   * Zoomgesetz-Exponent — die EINZIGE Stelle, an der der Zoom das Tempo
   * beeinflusst (der Windwert bleibt in jedem Fall unangetastet):
   *   0    = Bildschirmtempo konstant über alle Zoomstufen (Default, windy-artig)
   *   0.75 = Alt-Verhalten von buscosun (früher `speedZoomDamping: 0.25`)
   *   1    = rein geografisch, konstanter Zeitraffer
   */
  screenTempoZoomExp?: number;
  /**
   * ALT-Kennlinie, standardmäßig NEUTRAL (γ = 1 ⇒ aus). Nur setzen, wer die
   * frühere Stauchung des Dynamikumfangs zurückwill — sie bricht die
   * Proportionalität zum GRIB-Wert („Rule 2"-Fallback, s.
   * `audit/wind-partikel-grib-treue.md` §3). Default 1.
   */
  speedGamma?: number;
  /** Anker-Windgeschwindigkeit (m/s) der Alt-Kennlinie. Wirkungslos bei γ = 1. Default 5. */
  speedRef?: number;
  /** ALT: Mindest-Anzeigetempo (m/s). Default 0 = aus (jeder Wind zeigt seinen echten Wert). */
  speedMin?: number;
  /**
   * ALT: Tempo-Dämpfung nach Kartenbreite. Default 0 = AUS — ein
   * gerätespezifischer Faktor auf der Geschwindigkeit widerspricht dem
   * Ehrlichkeitsvertrag (dieselben m/s müssen überall dieselben px/s ergeben).
   */
  viewportSpeedRefPx?: number;
  dropRate?: number;
  dropRateBump?: number;
  /** Zoom-Zuschlag auf die Auffrischrate: je Zoomstufe UNTER `speedRefZoom`
   *  steigt die Drop-Rate um diesen Anteil (gedeckelt bei 2,6×). Löst die
   *  Partikel-Klumpen auf, die weit draußen in Konvergenzzonen entstehen —
   *  0 = altes Verhalten (Default). */
  zoomDropBoost?: number;
  /** Z3 (2026-08-15): Umverteilung der Partikel bei Rechteckwechsel im Update-
   *  Pass — beim Rauszoomen wird der Überschuss-Anteil 1 − 1/A (A = Flächen-
   *  faktor) sofort recycelt und wie Out-of-bounds-Partikel gleichverteilt in
   *  den neu sichtbaren Ring/Streifen gesetzt (audit/windpartikel-rauszoom.md).
   *  Default true. `false` = Alt-Verhalten (Shader rechnerisch identisch,
   *  Auffrisch-Puls nach zoomend springt wieder ein) — Rule-2-Fallback. */
  zoomRedistribute?: boolean;
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
  /** Deckelt die Wind-Animations-Repaint-Rate (fps). 0 = ungedeckelt → der Loop
   *  läuft mit der Display-Rate (Desktop-Referenz). Auf Touch-/Schwachgeräten
   *  z. B. 30 → halbiert die Idle-GPU/Compositor-Last + Wind-Draw-Arbeit. Die
   *  Advektion ist dt-normalisiert (`frameDtScale`), Geschwindigkeit UND Trail-
   *  Länge bleiben identisch. Default 0. */
  maxParticleFps?: number;
  /** Laufzeit-FPS-Governor: passt die GEZEICHNETE Partikelzahl an die real
   *  gemessene Bildrate an (EMA + Hysterese), damit schwache GPUs/CPUs flüssig
   *  bleiben und starke die volle Dichte behalten. Oberstes Tier = ×1.0 = keine
   *  Änderung (Desktop bleibt identisch). Default true; für Globus/Tests abschaltbar. */
  adaptiveQuality?: boolean;
  /** Partikel-Stil (Phase WP1): 'segments' = windy-artige Strich-Quads zwischen
   *  zwei Zeitschritt-Positionen mit zoomgestaffelter Dichte/Breite und
   *  bildschirmkonstantem Tempo (Parameter: particlePreset.ts); 'points' =
   *  der unveränderte Alt-Pfad (weiche Punkte). Default 'points' (Rule 2:
   *  benannter Fallback — die 2D-Karte aktiviert 'segments' explizit). */
  particleStyle?: WindParticleStyle;
  /** Abschnittsweise Overrides für das Segment-Preset (Tests/Varianten). */
  segmentPreset?: Partial<SegmentPreset>;
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

// Cross-device parity FPS + trail ladder for coarse-pointer devices, ascending,
// modelled as ONE monotonic index (Phase P = FPS lever, Phase P2 = trail lever):
//
//   idx 0: { 20 fps, trail 0.5 }  ← bottom rung, LAST resort (RGBA8 trail buffers
//   idx 1: { 20 fps, trail 1.0 }    at half resolution — engaged only below the
//   idx 2: { 24 fps, trail 1.0 }    FPS floor; particle count still full)
//   idx 3: { 30 fps, trail 1.0 }  ← top = the requested mobile cap (reference)
//
// The governor steps DOWN only when the measured render duration says the device
// can't hold the current rung, and the FPS is spent BEFORE the trail: 30→24→20 fps
// all keep trail 1.0; only the very bottom rung halves the trail resolution. On
// recovery the single index climbs back through idx 1 first, so trail sharpness
// returns before the FPS target rises. The particle count stays full at EVERY rung
// — FPS and trail resolution are the particle-neutral levers. Capable phones (e.g.
// iPhone 12 Pro) never reach idx 0, so they stay sharp.
const MOBILE_FPS_LADDER = [20, 20, 24, 30];
const MOBILE_TRAIL_LADDER = [0.5, 1.0, 1.0, 1.0];

export class WindLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  fadeOpacity: number;
  speedPxPerMs: number;
  speedFactor: number;
  speedRefZoom: number;
  screenTempoZoomExp: number;
  speedGamma: number;
  speedRef: number;
  speedMin: number;
  viewportSpeedRefPx: number;
  dropRate: number;
  dropRateBump: number;
  zoomDropBoost: number;
  private zoomRedistribute: boolean;
  pointSize: number;
  showHeatmap: boolean;
  heatmapOpacity: number;
  particleColor: [number, number, number, number];
  speedTint: number;
  subSteps: number;
  private upsample: number;

  // ---- Segment style (Phase WP1) — inert on the 'points' fallback ----------
  /** Aktiver Partikel-Stil; fix pro Instanz (steuert Shader-Wahl + Buffer). */
  readonly particleStyle: WindParticleStyle;
  /** Laufzeit-tunbare Kopie des Segment-Presets (Dev-Handle:
   *  `__map.style._layers.wind.implementation.segPreset`). */
  segPreset: SegmentPreset;
  /** Quad-Vertexbuffer (index, end, side) ×4 je Partikel + Index-Buffer. */
  private segVertexBuffer: WebGLBuffer | null = null;
  private segIndexBuffer: WebGLBuffer | null = null;
  /** Globales Layer-Alpha: 0→1-Rampe nach zoomend (windy-artiges Fade-in). */
  private layerAlpha = 1;
  /** zoomend (nur Segments): Dichte-Staffel neu ableiten + weicher Neustart. */
  /** Bis zu diesem Zeitstempel läuft der Auffrisch-Puls nach einem Zoomwechsel
   *  (s. zoomDropScale). 0 = inaktiv. */
  private zoomSettleUntil = 0;

  /** Points-Pfad: nach jedem Zoomwechsel kurz kräftiger nachsäen, damit sich das
   *  Partikelfeld auf die neue Fläche verteilt, statt langsam „auszufransen"
   *  (Jans Befund 2026-08-09: beim Rauszoomen normalisiert es sich zu träge). */
  private onZoomSettle = () => {
    // Z3: mit aktiver Umverteilung ist die Dichte nach jedem Frame bereits
    // gleichverteilt — der Puls wäre nur noch globale Schweif-Verkürzung.
    if (this.zoomDropBoost <= 0 || this.zoomRedistribute) return;
    this.zoomSettleUntil = (typeof performance !== 'undefined' ? performance.now() : 0) + ZOOM_SETTLE_MS;
    this.map?.triggerRepaint();
  };

  private onZoomEnd = () => {
    this.applyTargetParticleCount();
    this.layerAlpha = 0;
    this.clearOnNextFrame = true;
    this.map?.triggerRepaint();
  };

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
  // ALT-Zoomausdünnung („Rule 2"-Fallback, s. getEffectiveParticleCount).
  // Nur aktiv, wenn der Aufrufer `zoomThinBase` ausdrücklich setzt.
  private zoomThinBase: number;
  private zoomThinFloor: number;
  private legacyZoomThinning: boolean;
  private latticeOccupancy: number;

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

  // Trail-color-buffer dimensions (backgroundTexture/screenTexture). These are the
  // DRAWING-BUFFER size scaled by the current trailScale (Phase P2) — NOT the CSS
  // or full drawing-buffer size. The trail passes render at this resolution; the
  // composite pass upscales it (LINEAR) to the full map framebuffer.
  private screenWidth = 0;
  private screenHeight = 0;
  // Trail-buffer resolution scale (Phase P2): the governor's LAST-RESORT lever.
  // 1.0 = full drawing-buffer resolution (desktop reference, and every mobile rung
  // above the FPS floor). Drops to 0.5 only on the governor's bottom rung. Read
  // live in drawParticles (point-size compensation) and in allocScreenTextures
  // (texture sizing). Stays 1.0 whenever the governor does not drive FPS.
  private trailScale = 1;
  // Source values the current trail textures were allocated against, so the realloc
  // fires exactly when (drawingBuffer, trailScale) changes — the governor steps with
  // a cooldown, so this is rare.
  private _texDrawW = 0;
  private _texDrawH = 0;
  private _texTrailScale = 1;
  // Bezugsrechteck (equirect x0,y0,x1,y1), mit dem die AKTUELLE Partikel-
  // Zustandstextur kodiert ist. Die 2 Byte je Achse spannen dieses Rechteck
  // statt der ganzen Welt — dadurch wächst die Positionsauflösung mit dem Zoom
  // mit und die frühere Totzone (Schritt < ½ Quantum ⇒ Partikel friert ein)
  // verschwindet; erst DAS erlaubt eine strikt lineare Anzeige ohne γ-Kennlinie
  // und Mindesttempo (s. audit/wind-partikel-grib-treue.md §4).
  //
  // Der Draw-Pass läuft VOR dem Update (s. render), liest also das Rechteck des
  // letzten Updates. null = noch nie advektiert; der Initialzustand ist
  // gleichverteiltes [0,1]² und damit für jedes Rechteck gültig.
  private encodeBounds: [number, number, number, number] | null = null;
  // Summe der TATSÄCHLICH advektierten Simulationszeit (Sekunden, 60-fps-Basis).
  // Nur die Dev-Probe liest das: die Advektion ist dt-normiert und auf 66 ms je
  // Frame geklemmt, unter starker rAF-Drosselung (Automations-Browser!) fällt die
  // Wanduhr-Geschwindigkeit deshalb ab, OBWOHL die Physik stimmt. Gegen diese
  // Zeitbasis gemessen ist px/s frameraten- und drosselungs-immun.
  private advectedSeconds = 0;
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

  // Adaptive FPS governor. Cross-device PARITY (Phase P): on coarse-pointer
  // devices the governor regulates the FPS TARGET (30→24→20) from the measured
  // per-frame render duration — the particle count is left at full density on
  // every device. On desktop (fine pointer) it stays in legacy mode, pinned to the
  // top tier and uncapped → byte-identical reference. Null when disabled
  // (globe/tests). See perfGovernor.ts.
  private adaptiveQuality: boolean;
  private governor: FrameGovernor | null = null;
  // True when the governor drives the FPS cap (coarse-pointer / maxParticleFps>0);
  // false on desktop where the cap stays 0 (uncapped, pinned reference).
  private governorDrivesFps = false;
  private perfCaps: DeviceCaps | null = null;

  // Actual GPU upload format of the wind texture (half-float / float / byte).
  // Captured for the on-device diagnostic (glDiag) — a mobile GPU without float
  // sampling extensions falls back to 'byte' (still correct, just quantized).
  private _windTexFormat: DataTextureFormat = { kind: 'byte' };
  // Run the WebGL capability + framebuffer-completeness probe exactly once.
  private _diagLogged = false;

  private clearOnNextFrame = true;
  // Phase WZ1 / ZA-1 — Kamera-Nachführung des Trail-Puffers.
  //
  // Der Trail-Puffer liegt im BILDSCHIRMRAUM. Bis 2026-08-08 wurde er bei jedem
  // Kamerabild verworfen (gemessen: 173 Löschungen in 189 Bildern über eine
  // 3-s-Zoomfahrt), weil ein stehengelassener Schweif als Geisterbild am Schirm
  // klebt. Folge: Während JEDER Geste — auch beim bloßen Schieben — brach der
  // Layer auf ein nacktes Punktfeld zusammen, danach ~1,4 s Wiederaufbau.
  //
  // Statt zu verwerfen wird der Puffer jetzt beim Abblenden um die
  // Kamerabewegung seit dem letzten gezeichneten Bild verschoben und skaliert.
  // Ohne Drehung und Neigung ist das im Bildschirmraum eine exakte affine
  // Abbildung; die Bezugspunkte sind die beiden Bildecken des LETZTEN Bildes
  // (dort per Konstruktion (0,0) und (W,H)), heute neu projiziert.
  // Geht das nicht (Drehung/Neigung, Globus, Projektionswechsel, entartete
  // Zahlen), fällt der Layer auf das alte Verhalten zurück: löschen.
  private cameraMoved = false;
  private trailUvScale: [number, number] | null = null;
  private trailUvOffset: [number, number] = [0, 0];
  private _trailAnchorTL: { lng: number; lat: number } | null = null;
  private _trailAnchorBR: { lng: number; lat: number } | null = null;
  private _trailAnchorW = 0;
  private _trailAnchorH = 0;
  private onMove = () => {
    this.cameraMoved = true;
  };
  // Skip the per-frame particle passes while the camera is actively moving
  // (mobile/coarse-pointer only — see reduceMotionOnMove). MapLibre repaints the
  // heatmap from the camera change anyway; particles resume on moveend.
  private reduceMotionOnMove = false;
  // Deckel für die Wind-Repaint-Rate (fps); 0 = ungedeckelt (Display-Rate).
  // Frame-Zeit-Gate-Zustand s. scheduleParticleRepaint().
  private maxParticleFps = 0;
  private lastRepaintReqMs = 0;
  private repaintCapTimer: number | null = null;
  private moving = false;
  private onMoveStart = () => { this.moving = true; };
  private onMoveEnd = () => { this.moving = false; this.map?.triggerRepaint(); };
  // Resize: Trails verwerfen UND Partikelzahl an die neue Viewport-Größe anpassen
  // (windy-artig — mehr Bildschirmfläche ⇒ mehr Partikel, gleichbleibende Dichte).
  private onResize = () => {
    this.clearOnNextFrame = true;
    this.applyTargetParticleCount();
  };

  // Phase P3 (Hebel 5) — Repaint-Disziplin. Der selbst-perpetuierende Wind-
  // Repaint-Loop (scheduleParticleRepaint) ist der einzige Dauerloop der 2D-
  // Karte; er wird pausiert, sobald NICHTS sichtbar ist: Tab im Hintergrund
  // (document.hidden) ODER Karte aus dem Viewport gescrollt (IntersectionObserver
  // ratio 0). Beide Quellen sind oder-verknüpft (`paused`). Reines Scheduling —
  // sichtbar/aktiv ist byte-identisch, keine Optik-Änderung, keine Desktop-
  // Regression; gilt auf allen Geräten.
  private paused = false;
  private _docHidden = false;
  private _offscreen = false;
  private _intersectionObserver: IntersectionObserver | null = null;
  private onVisibilityChange = () => {
    this._docHidden = typeof document !== 'undefined' && document.hidden;
    this.updatePausedState();
  };
  private onIntersect = (entries: IntersectionObserverEntry[]) => {
    const e = entries[entries.length - 1];
    if (!e) return;
    this._offscreen = e.intersectionRatio === 0;
    this.updatePausedState();
  };
  /** Vereint hidden/offscreen zu einem `paused`-Flag (P3-3: gated NUR den selbst-
   *  perpetuierenden Repaint-Pfad; ein Kamera-Move-Repaint von MapLibre rendert
   *  weiter korrekt). Übergang → pausiert: ausstehenden Nachschlag-Timer clearen.
   *  Übergang → sichtbar: eingefrorenen Alt-Trail verwerfen (P3-4) und den Loop
   *  einmalig neu anstoßen (`triggerRepaint`). */
  private updatePausedState(): void {
    const next = this._docHidden || this._offscreen;
    if (next === this.paused) return;
    this.paused = next;
    if (next) {
      if (this.repaintCapTimer != null) { clearTimeout(this.repaintCapTimer); this.repaintCapTimer = null; }
    } else {
      // Resume-Hygiene: stale Trail verwerfen, dann den Loop genau einmal
      // wieder anstoßen (MapLibre rendert nur auf ein triggerRepaint hin).
      this.clearOnNextFrame = true;
      this.map?.triggerRepaint();
    }
  }

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
    if (this.particleStyle === 'segments') {
      // Windy-Dichte-Staffel: Fläche ÷ (divisor · zoomBase^(zWindy − refZoom)) —
      // ÷1,6 pro Zoomstufe rein (dichtes Filament-Feld in der Übersicht, wenige
      // breite Striche in der Detail-Ansicht). Windy-z = MapLibre-z + 1.
      // BEWUSST ohne Mobile-Halbierung (CSS-Flächen-Parität, Phase P).
      // × dataViewFraction: windy hat globale Daten, wir nur die D2-Region —
      // die Partikel spawnen NUR in Sicht∩Daten. Ohne den Faktor würde die
      // volle Viewport-Zahl in die kleine Datenfläche gestopft (Übersicht =
      // weißer Klumpen über DACH).
      const d = this.segPreset.density;
      const zWindy = (this.map?.getZoom() ?? 4) + 1;
      const raw = ((cssW * cssH * this.dataViewFraction())
        / (d.divisor * Math.pow(d.zoomBase, zWindy - d.refZoom))) * this.densityMultiplier;
      const clamped = Math.max(d.min, Math.min(d.max, Math.round(raw)));
      return Math.min(clamped, this.segPreset.maxParticles);
    }
    const megapixels = (cssW * cssH) / 1_000_000;
    const raw = this.baseDensity * megapixels * this.densityMultiplier;
    return Math.round(Math.max(this.minParticles, Math.min(this.maxParticles, raw)));
  }

  /** Anteil des Viewports, der von der Wind-Datenregion abgedeckt ist (0..1,
   *  Equirect-Näherung ohne Mercator-y-Korrektur — für die Dichte-Skalierung
   *  ausreichend). 1 solange keine Daten/Karte da sind oder im Globus. */
  private dataViewFraction(): number {
    const map = this.map;
    const wd = this.windData;
    if (!map || !wd || this.globeMode) return 1;
    const b = map.getBounds();
    const vx0 = lngToEquiX(b.getWest());
    const vx1 = lngToEquiX(b.getEast());
    const vy0 = latToEquiY(b.getNorth());
    const vy1 = latToEquiY(b.getSouth());
    const viewArea = Math.max(1e-9, (vx1 - vx0) * (vy1 - vy0));
    const [dx0, dy0, dx1, dy1] = wd.uvBounds;
    const ox = Math.max(0, Math.min(vx1, dx1) - Math.max(vx0, dx0));
    const oy = Math.max(0, Math.min(vy1, dy1) - Math.max(vy0, dy0));
    return Math.max(0, Math.min(1, (ox * oy) / viewArea));
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

  /** GPU-Upload-Format dieses Layers (einmalig in onAdd bestimmt) — ein
   *  off-main Wind-Blend-Worker braucht das VORAB, um passend zu packen
   *  (s. windFrameAtValidTimeAsync in iconD2WindSource.ts). */
  get windTextureKind(): DataTextureFormat['kind'] { return this._windTexFormat.kind; }

  /** CPU-Upsampling-Faktor (Konstruktor-Option, s. WindLayerOptions.upsample) —
   *  der Wind-Blend-Worker muss denselben Faktor verwenden wie decodeAndRefine,
   *  damit Slider-Scrub und exakte Stunden-Frames dieselbe Feld-Auflösung haben. */
  get upsampleFactor(): number { return this.upsample; }

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

  /** Decode particle `i`'s BOUNDS-RELATIVE position from a readback buffer using
   *  the EXACT packing of drawVert/updateFrag: local = hiByte/255 + loByte/65025.
   *  Particle i lives at texel (i%res, floor(i/res)); readPixels is row-major from
   *  the lower-left, which matches the un-flipped upload order → linear index i.
   *  `bounds` maps it back to absolute equirect — the same step the shaders do. */
  private decodeParticle(
    buf: Uint8Array,
    i: number,
    bounds: [number, number, number, number],
  ): { x: number; y: number } {
    const o = i * 4;
    const lx = buf[o + 2] / 255 + buf[o] / 65025;
    const ly = buf[o + 3] / 255 + buf[o + 1] / 65025;
    return {
      x: bounds[0] + lx * (bounds[2] - bounds[0]),
      y: bounds[1] + ly * (bounds[3] - bounds[1]),
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
    if (!img) return null; // Frame per setWindDataPacked angewendet — kein Quell-Image mehr vorhanden.
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
   * Misst N Partikel-Trajektorien über `ms` und vergleicht sie mit dem
   * ZUGRUNDELIEGENDEN WINDFELD. Deckt zwei Fragestellungen ab:
   *
   * A) GRIB-TREUE (Auftrag „Partikel = GRIB-Werte", `audit/wind-partikel-grib-treue.md`)
   *    • `bearingErrDeg`    Winkel zwischen gemessener Schirmbewegung und der aus
   *                         (u, −v) erwarteten Richtung. Mercator ist konform, die
   *                         Erwartung ist also direkt der Windvektor. Vor der
   *                         Korrektur lag der Median hier bei ~15–19°, jetzt ~0°.
   *    • `pxPerSecPerMs`    gemessene Verstärkung px/s je m/s, gegen
   *                         `expectedPxPerSecPerMs` aus `advection.ts`. Muss über
   *                         ALLE Zoomstufen und für JEDE Windstärke gleich sein.
   *    • `nsEwGainRatio`    Verstärkung meridionaler ÷ zonaler Partikel. 1,00 = isotrop;
   *                         **0,50 war der Faktor-2-Fehler**.
   *    • `linearityR2`      Bestimmtheitsmaß der Ursprungsgeraden px/s = k·|V|.
   *                         1,00 = strikt proportional (γ-Kennlinie ⇒ deutlich < 1).
   *    • `stalledPct`       Anteil Partikel mit Schritt unter der Rundungsschwelle
   *                         der Positionskodierung (Totzone). Muss 0 sein.
   *
   * B) GERÄTE-PARITÄT (Phase P, unverändert): `cssPxPerSec`, `degPerSec`,
   *    `dirSign`, `windSignAtStart`, `advectionMatchesWind`, `measuredFps`.
   *
   * Windwahrheit: entweder der optionale `sampler` (empfohlen — die GRIB-Werte
   * direkt aus der Quelle) oder ersatzweise `sampleSourceWind` aus der
   * Textur-Quelle. Aus der Konsole:
   *
   *   const w = __map.style._layers.wind.implementation;
   *   await w.windMotionDiag({ sampler: (lon, lat) => __bsSample.wind(lon, lat) });
   *
   * Recycelte Partikel werden verworfen (Sprünge > 0,02 equirect).
   */
  async windMotionDiag(opts: {
    count?: number;
    /** Messfenster in ANGEZEIGTEN Frames. MUSS GERADE sein (s. u.). Default 4. */
    frames?: number;
    /** GRIB-Wahrheit am Punkt (m/s). Ohne ihn greift `sampleSourceWind`. */
    sampler?: (lon: number, lat: number) => { u: number; v: number } | null;
  } = {}): Promise<Record<string, unknown>> {
    const gl = this.gl;
    const map = this.map;
    if (!gl || !map || !this.windData) return { error: 'layer not ready' };
    // Das Messfenster wird in FRAMES abgesteckt, nicht in Millisekunden, und ist
    // zwingend GERADE. Grund (gemessen auf ANGLE/D3D11 und in headless Chromium,
    // vorbestehend — s. den Kommentar über segDrawVert in shaders.ts): das
    // Ping-Pong-Paar zerfällt auf manchen GL-Stacks in ZWEI unabhängige
    // Populationen, die sich frameweise abwechseln. Zwei aufeinanderfolgende
    // Frames zeigen dann verschiedene Partikel und jede Differenz daraus ist
    // Rauschen; über eine GERADE Frame-Zahl ist die Population dieselbe und die
    // Messung sauber. Die Physik ist davon unberührt — jede Population advektiert
    // mit der vollen, korrekten Schrittweite.
    const frameGap = Math.max(2, 2 * Math.round((opts.frames ?? 4) / 2));
    const n = this._numParticles;
    const count = Math.max(1, Math.min(opts.count ?? 32, n));
    const step = Math.max(1, Math.floor(n / count));
    const idxs: number[] = [];
    for (let i = 0; i < n && idxs.length < count; i += step) idxs.push(i);

    const boundsA = this.encodeBounds ?? this.getEquirectangularBounds();
    const simA = this.advectedSeconds;
    const bufA = this.readParticleState();
    if (!bufA) return { error: 'readback failed' };
    const tA = performance.now();
    const posA = idxs.map((i) => this.decodeParticle(bufA, i, boundsA));

    // Genau `frameGap` angezeigte Frames abwarten (gerade Zahl, s. oben).
    map.triggerRepaint();
    let frames = 0;
    await new Promise<void>((resolve) => {
      const tick = () => {
        frames++;
        if (frames >= frameGap) { resolve(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const tB = performance.now();
    const boundsB = this.encodeBounds ?? boundsA;
    const bufB = this.readParticleState();
    if (!bufB) return { error: 'readback failed (B)' };
    const dtSec = (tB - tA) / 1000;
    // Simulierte Zeit für die GRIB-Treue-Metriken (s. advectedSeconds). Fällt bei
    // ungedrosseltem Lauf mit dtSec zusammen.
    const simSec = Math.max(1e-6, this.advectedSeconds - simA);

    const unwrap = (d: number) => (d > 0.5 ? d - 1 : d < -0.5 ? d + 1 : d);
    const dLng: number[] = [], dLat: number[] = [], pxs: number[] = [];
    let windAgree = 0, windTotal = 0;
    const uSigns: number[] = [], vSigns: number[] = [];
    // GRIB-Treue-Statistik
    const gains: number[] = [];            // px/s je m/s (roh, inkl. Mercator-Dehnung)
    const gainsNorm: number[] = [];        // dito, Breiteneinfluss herausgerechnet
    const cosRef = Math.cos((LAT_REF_DEG * Math.PI) / 180);
    const gainsNS: number[] = [], gainsEW: number[] = [];
    const bearingErr: number[] = [];
    const fitXY: Array<[number, number]> = []; // (|V|, px/s)
    const lats: number[] = [];
    const speedsMs: number[] = [];
    let stalled = 0, stalledTotal = 0, respawned = 0;
    // Rundungsschwelle der Positionskodierung im AKTUELLEN Bezugsrechteck.
    const quantX = deadBandStep(Math.max(1e-9, boundsA[2] - boundsA[0]));
    // Respawn-Erkennung aus der PHYSIK statt per Pauschalwert: mehr als das
    // Vierfache dessen, was der stärkste Wind im Feld in dieser Zeit schafft,
    // kann kein advektiertes Partikel zurücklegen — das war ein Neustart.
    const worldCss = TILE_SIZE_CSS * Math.pow(2, this.tempoZoom());
    const vMaxField = Math.hypot(
      Math.max(Math.abs(this.windData.uMin), Math.abs(this.windData.uMax)),
      Math.max(Math.abs(this.windData.vMin), Math.abs(this.windData.vMax)),
    );
    const maxStep = 4 * NS_ASPECT
      * (screenTempoGain(this.tempoZoom(), this.tempoOptions()) * vMaxField / worldCss) * simSec;
    const sampleWind = (lon: number, lat: number, ex: number, ey: number) =>
      (opts.sampler ? opts.sampler(lon, lat) : null) ?? this.sampleSourceWind(ex, ey);

    for (let k = 0; k < idxs.length; k++) {
      const a = posA[k];
      const b = this.decodeParticle(bufB, idxs[k], boundsB);
      const dxe = unwrap(b.x - a.x);
      const dye = unwrap(b.y - a.y);
      if (Math.abs(dxe) > maxStep || Math.abs(dye) > maxStep) { respawned++; continue; }
      // equirect → geographic; Δlat = -Δy (equirect y grows southward)
      const dLngK = dxe * 360;
      const dLatK = -dye * 180;
      dLng.push(dLngK / dtSec);
      dLat.push(dLatK / dtSec);
      const lngA = a.x * 360 - 180, latA = 90 - a.y * 180;
      const lngB = b.x * 360 - 180, latB = 90 - b.y * 180;
      const pA = map.project([lngA, latA]);
      const pB = map.project([lngB, latB]);
      const mx = (pB.x - pA.x) / dtSec;      // Schirm-px/s, x nach rechts (Ost)
      const my = (pB.y - pA.y) / dtSec;      // Schirm-px/s, y nach unten (Süd)
      pxs.push(Math.hypot(mx, my));
      // Für die GRIB-Treue gegen SIMULIERTE Zeit — drosselungs-immun.
      const mLen = Math.hypot(pB.x - pA.x, pB.y - pA.y) / simSec;
      const w = sampleWind(lngA, latA, a.x, a.y);
      if (w) {
        windTotal++;
        uSigns.push(Math.sign(w.u));
        vSigns.push(Math.sign(w.v));
        // drift east ↔ u>0 ; drift north (Δlat>0) ↔ v>0
        if (Math.sign(dLngK) === Math.sign(w.u) && Math.sign(dLatK) === Math.sign(w.v)) windAgree++;

        const speedMs = Math.hypot(w.u, w.v);
        // Totzonen-Prüfung: bewegt sich das Partikel überhaupt, obwohl Wind da ist?
        if (speedMs > 0.05) {
          stalledTotal++;
          if (Math.abs(dxe) < quantX && Math.abs(dye) < quantX) stalled++;
        }
        if (speedMs > 0.2 && mLen > 0) {
          gains.push(mLen / speedMs);
          // Breiten-NORMIERTE Verstärkung: die Mercator-Dehnung (cos φ_ref/cos φ)
          // ist ein Eigenschaft der KARTE und in der Rohverstärkung enthalten.
          // Herausgerechnet muss hier auf jeder Breite und bei jeder Windstärke
          // exakt `speedPxPerMs` stehen — das ist der eigentliche Linearitätstest.
          gainsNorm.push((mLen / speedMs) * (Math.cos((latA * Math.PI) / 180) / cosRef));
          fitXY.push([speedMs, mLen]);
          lats.push(latA);
          // Erwartete Schirmrichtung: Mercator ist konform ⇒ (u, −v).
          const ex = w.u, ey = -w.v;
          const cross = mx * ey - my * ex;
          const dot = mx * ex + my * ey;
          bearingErr.push(Math.abs((Math.atan2(cross, dot) * 180) / Math.PI));
          speedsMs.push(speedMs);
          // Achsen-Isotropie: rein meridionale gegen rein zonale Partikel.
          const frac = Math.abs(w.v) / speedMs;      // 1 = Nord/Süd, 0 = Ost/West
          if (frac > 0.9) gainsNS.push(mLen / speedMs);
          else if (frac < 0.1) gainsEW.push(mLen / speedMs);
        }
      }
    }
    const median = (arr: number[]) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((p, q) => p - q);
      return s[Math.floor(s.length / 2)];
    };
    const pct = (arr: number[], q: number) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((p, r) => p - r);
      return s[Math.min(s.length - 1, Math.floor(q * s.length))];
    };
    // R² einer URSPRUNGSgeraden px/s = k·|V| — misst die Proportionalität.
    const r2Origin = (): number => {
      if (fitXY.length < 3) return NaN;
      let sxy = 0, sxx = 0;
      for (const [x, y] of fitXY) { sxy += x * y; sxx += x * x; }
      const k = sxx > 0 ? sxy / sxx : 0;
      let ssRes = 0, ssTot = 0;
      const mean = fitXY.reduce((s, [, y]) => s + y, 0) / fitXY.length;
      for (const [x, y] of fitXY) { ssRes += (y - k * x) ** 2; ssTot += (y - mean) ** 2; }
      return ssTot > 0 ? 1 - ssRes / ssTot : NaN;
    };
    const mLng = median(dLng), mLat = median(dLat);
    const zoomNow = map.getZoom() ?? 0;
    const latMed = lats.length ? median(lats) : LAT_REF_DEG;
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    const report = {
      // --- A) GRIB-TREUE ---
      pxPerSecPerMs: r3(median(gains)),
      expectedPxPerSecPerMs: r3(screenSpeedPxPerSec(1, this.tempoZoom(), latMed, this.tempoOptions())),
      // Breiten-normiert; Soll = speedPxPerMs · speedFactor, unabhängig von
      // Zoom, Breite UND Windstärke.
      gainNorm: r3(median(gainsNorm)),
      gainNormSoll: r3(screenTempoGain(this.tempoZoom(), this.tempoOptions())),
      bearingErrDeg: { median: r3(median(bearingErr)), p90: r3(pct(bearingErr, 0.9)) },
      // Nach Windstärke aufgeschlüsselt. Ein RICHTUNGSFEHLER wäre stärkeunabhängig;
      // fällt der Wert mit steigender Windstärke, ist der Rest die Quantisierung
      // des Feldes (8 Bit je Komponente + 3×3-Glättung), nicht die Advektion.
      ...(() => {
        const bands: Array<[string, number, number]> = [
          ['<1 m/s', 0, 1], ['1-2', 1, 2], ['2-4', 2, 4], ['4-8', 4, 8], ['>8', 8, Infinity],
        ];
        const ang: Record<string, string> = {};
        const gain: Record<string, string> = {};
        for (const [label, lo, hi] of bands) {
          const pick = (arr: number[]) => arr.filter((_, i) => speedsMs[i] >= lo && speedsMs[i] < hi);
          const a = pick(bearingErr), g = pick(gainsNorm);
          ang[label] = a.length >= 5 ? `${r3(median(a))}° (n=${a.length})` : `n=${a.length}`;
          gain[label] = g.length >= 5 ? `${r3(median(g))} (n=${g.length})` : `n=${g.length}`;
        }
        // LINEARITÄT: die breiten-normierte Verstärkung muss in JEDEM Band
        // denselben Wert (= speedPxPerMs) haben. Unter der alten γ-Kennlinie fiel
        // sie über diese Bänder um rund das Sechsfache.
        return { bearingErrBySpeed: ang, gainNormBySpeed: gain };
      })(),
      nsEwGainRatio: gainsNS.length && gainsEW.length
        ? r3(median(gainsNS) / median(gainsEW))
        : `n/a (NS ${gainsNS.length} / EW ${gainsEW.length})`,
      linearityR2: r3(r2Origin()),
      stalledPct: stalledTotal ? r3((100 * stalled) / stalledTotal) : 0,
      nsAspectApplied: NS_ASPECT,
      // --- B) GERÄTE-PARITÄT (unverändert) ---
      cssPxPerSec: Math.round(median(pxs) * 10) / 10,
      degPerSec: { lng: r3(mLng), lat: r3(mLat) },
      dirSign: [Math.sign(mLng), Math.sign(mLat)] as [number, number],
      windSignAtStart: [Math.sign(median(uSigns)), Math.sign(median(vSigns))] as [number, number],
      advectionMatchesWind: windTotal ? `${windAgree}/${windTotal}` : 'n/a',
      // --- Kontext ---
      sampled: dLng.length,
      respawned,
      windSamples: gains.length,
      frameGap,
      windSource: opts.sampler ? 'sampler (GRIB)' : (this.windData.image ? 'texture image' : 'none'),
      screenTempoGain: r3(screenTempoGain(this.tempoZoom(), this.tempoOptions())),
      encodeSpanDeg: r3((boundsA[2] - boundsA[0]) * 360),
      positionQuantumM: r3(quantX * 2 * 40075016.686 * Math.cos((latMed * Math.PI) / 180)),
      measuredFps: Math.round((frames / dtSec) * 10) / 10,
      // < 1 heißt: die Advektion lief langsamer als die Wanduhr (rAF gedrosselt
      // und/oder dt auf 66 ms geklemmt). Die GRIB-Treue-Metriken oben sind
      // gegen die simulierte Zeit gemessen und davon unberührt.
      simTimeRatio: r3(simSec / dtSec),
      frameDtScale: Math.round(this.frameDtScale * 100) / 100,
      windTexFormat: this._windTexFormat.kind,
      epr: Math.round(this._epr * 100) / 100,
      upsample: this.upsample,
      zoom: Math.round(zoomNow * 100) / 100,
    };
    // eslint-disable-next-line no-console
    console.table(report);
    return report;
  }

  /** Telemetry for the adaptive governor (null if disabled). Exposed for the
   *  dev `__map` inspector so tier/quality/frame-rate can be watched on-device. */
  get perfState(): { tier: string; quality: number; ema: number; level: number; targetFps: number; maxParticleFps: number; trailScale: number; drivesFps: boolean; paused: boolean; caps: DeviceCaps | null } | null {
    if (!this.governor) return null;
    return {
      tier: this.governor.tierName,
      quality: this.governor.quality,
      ema: Math.round(this.governor.ema * 10) / 10,
      level: this.governor.levelIndex,
      // Phase P: the governor's active FPS target and the cap actually applied.
      targetFps: this.governor.targetFps,
      maxParticleFps: this.maxParticleFps,
      // Phase P2: the active trail-buffer resolution scale (< 1.0 only on the
      // bottom rung). On desktop / capable phones this reads 1.0 → sharp.
      trailScale: this.trailScale,
      drivesFps: this.governorDrivesFps,
      // Phase P3: repaint loop paused because nothing is visible (hidden tab OR
      // map scrolled offscreen). JS-observable for V-PARITY-3.
      paused: this.paused,
      caps: this.perfCaps,
    };
  }

  constructor(options: WindLayerOptions = {}) {
    this.id = options.id ?? 'wind';
    // Auto-Skalierung nach Viewport, außer numParticles ist explizit fix gesetzt.
    this.autoScale = options.numParticles == null;
    // Partikel je 1 Mio. CSS-Pixel DATENFLÄCHE (nicht Viewport — s.
    // getEffectiveParticleCount). 2200 ⇒ mittlerer Partikelabstand ~21 px, was
    // zu den 19–45 px langen Schweifen passt: Striche bleiben unterscheidbar,
    // die Fläche bleibt gefüllt. Vorher 3600 (Abstand 16,6 px) — zusammen mit
    // der alten Zoom-Zeltkurve schwankte die gezeichnete Zahl über den Zoom um
    // Faktor 3,3 (2 025 bei z6 gegen 607 ab z11); Messreihe in
    // audit/windpartikel-zoom.md §2.
    this.baseDensity = options.baseDensity ?? 2200;
    this.densityMultiplier = options.densityMultiplier ?? 1;
    // Floor kept low enough that typical phone viewports (~0.33 CSS-MP) still
    // resolve to the AREA-PROPORTIONAL count (~baseDensity × area) instead of
    // being clamped up — the old 1800 floor over-densified small screens to
    // ~1.5× desktop, a key cause of the mobile↔desktop particle mismatch.
    this.minParticles = options.minParticles ?? 400;
    this.maxParticles = options.maxParticles ?? 22000;
    this.zoomThinBase = Math.max(1, options.zoomThinBase ?? 1.3);
    this.zoomThinFloor = Math.max(0.05, Math.min(1, options.zoomThinFloor ?? 0.3));
    // Rule 2: die alte Zoom-Zeltkurve wird nicht gelöscht, sondern default-off
    // gestellt. Wer sie zurückwill, setzt `zoomThinBase` ausdrücklich.
    this.legacyZoomThinning = options.zoomThinBase != null;
    this.latticeOccupancy = Math.max(0.005, Math.min(1, options.latticeOccupancy ?? 0.06));
    // Startwert; bei autoScale in onAdd aus der echten Canvas-Größe ersetzt.
    this._numParticles = options.numParticles ?? 4500;
    this.fadeOpacity = options.fadeOpacity ?? 0.955;
    // Ehrlichkeits-Defaults: ein Tempo-Faktor, sonst nichts. Die drei Alt-Regler
    // (γ / Mindesttempo / Gerätedämpfung) stehen neutral und sind nur noch als
    // benannter Fallback erreichbar — s. WindLayerOptions und advection.ts.
    this.speedPxPerMs = Math.max(0, options.speedPxPerMs ?? 6);
    this.speedFactor = options.speedFactor ?? 1;
    this.speedRefZoom = options.speedRefZoom ?? 5.5;
    this.screenTempoZoomExp = options.screenTempoZoomExp ?? 0;
    this.speedGamma = options.speedGamma ?? 1;
    this.speedRef = options.speedRef ?? 5;
    this.speedMin = Math.max(0, options.speedMin ?? 0);
    this.viewportSpeedRefPx = Math.max(0, options.viewportSpeedRefPx ?? 0);
    this.dropRate = options.dropRate ?? 0.003;
    this.dropRateBump = options.dropRateBump ?? 0.01;
    this.zoomDropBoost = Math.max(0, options.zoomDropBoost ?? 0);
    this.zoomRedistribute = options.zoomRedistribute ?? true;
    this.pointSize = options.pointSize ?? 1.5;
    this.showHeatmap = options.showHeatmap ?? true;
    this.heatmapOpacity = options.heatmapOpacity ?? 0.85;
    this.particleColor = options.particleColor ?? [1.0, 1.0, 1.0, 0.85];
    this.speedTint = options.speedTint ?? 0;
    this.subSteps = Math.max(1, Math.min(4, Math.round(options.subSteps ?? 1)));
    this.upsample = Math.max(1, Math.min(4, Math.round(options.upsample ?? 2)));
    this.reduceMotionOnMove = options.reduceMotionOnMove ?? false;
    this.maxParticleFps = Math.max(0, options.maxParticleFps ?? 0);
    this.adaptiveQuality = options.adaptiveQuality ?? true;
    this.windPngUrl = options.windPngUrl ?? '/wind/wind.png';
    this.windJsonUrl = options.windJsonUrl ?? '/wind/wind.json';
    this.colorRampStops = options.colorRamp ?? defaultColorRamp;
    this.particleStyle = options.particleStyle ?? 'points';
    this.segPreset = makeSegmentPreset(options.segmentPreset);
    // Segments: auch der allererste Aufbau blendet weich ein (windy-artig).
    if (this.particleStyle === 'segments') this.layerAlpha = 0;
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext) {
    this.map = map;
    this.gl = gl;

    // Upload-Format VORAB bestimmen (statt es erst als Nebeneffekt des ersten
    // createDataTexture-Aufrufs zu erfahren) — ein off-main Wind-Blend-Worker
    // muss wissen, in welches Format er packen soll, BEVOR er rechnet (im
    // Worker steht kein GL-Context zur Verfügung). S. setWindDataPacked.
    this._windTexFormat = { kind: pickWindTextureKind(gl, true) };

    // Adaptive governor: read device capabilities (GPU string, cores, memory,
    // DPR, pointer) to pick a starting quality tier; the runtime loop then
    // regulates from the measured frame rate. Disabled in globe/test mode.
    if (this.adaptiveQuality) {
      this.perfCaps = readDeviceCaps(gl);
      if (this.maxParticleFps > 0 && !this.globeMode) {
        // Coarse-pointer / mobile (a cap was requested): the governor regulates
        // the FPS TARGET (parity lever) instead of the particle count. Start at
        // the top tier (= the requested cap) and only step down under load.
        this.governorDrivesFps = true;
        this.governor = new FrameGovernor({
          fpsLadder: MOBILE_FPS_LADDER,
          trailLadder: MOBILE_TRAIL_LADDER,
          startLevelIndex: MOBILE_FPS_LADDER.length - 1,
        });
      } else {
        // Desktop / fine pointer (uncapped) or globe: legacy governor, pinned to
        // the starting tier. With the particle multiplier removed (Phase P) this
        // no longer alters rendering — the desktop reference stays byte-identical.
        this.governor = new FrameGovernor({ startLevelIndex: tierToLevelIndex(initialTier(this.perfCaps)) });
      }
    }

    this.drawProgram = this.particleStyle === 'segments'
      ? createProgram(gl, segDrawVert, segDrawFrag)
      : createProgram(gl, drawVert, drawFrag);
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
    // Segments: Dichte-Staffel + weicher Neustart hängen am Zoom-ENDE (der
    // Points-Pfad registriert den Listener bewusst nicht — byte-identisch).
    if (this.particleStyle === 'segments') map.on('zoomend', this.onZoomEnd);
    map.on('zoomend', this.onZoomSettle);

    // Phase P3 — Repaint-Disziplin: den Dauerloop pausieren, wenn nichts sichtbar
    // ist. Haupt-Win = visibilitychange (Hintergrund-Tab); Offscreen-Scroll über
    // einen IntersectionObserver auf dem Karten-Canvas.
    if (typeof document !== 'undefined') {
      this._docHidden = document.hidden;
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    const p3Canvas = map.getCanvas();
    if (p3Canvas && typeof IntersectionObserver !== 'undefined') {
      this._intersectionObserver = new IntersectionObserver(this.onIntersect, { threshold: 0 });
      this._intersectionObserver.observe(p3Canvas);
    }
    // Startzustand einmal auswerten (Layer könnte in einem versteckten Tab
    // hinzugefügt werden) — setzt `paused` ohne einen Resume-Repaint auszulösen.
    this.updatePausedState();

    if (this._pendingWindData) {
      const { image, meta } = this._pendingWindData;
      this._pendingWindData = null;
      this.setWindData(image, meta);
    } else if (this._pendingWindDataPacked) {
      const { packed, width, height, meta, key } = this._pendingWindDataPacked;
      this._pendingWindDataPacked = null;
      this.setWindDataPacked(packed, width, height, meta, key);
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
    if (this.particleStyle === 'segments') map.off('zoomend', this.onZoomEnd);
    map.off('zoomend', this.onZoomSettle);
    if (this.repaintCapTimer != null) { clearTimeout(this.repaintCapTimer); this.repaintCapTimer = null; }

    // Phase P3 — Listener/Observer sauber abmelden (keine Leaks) und den Pause-
    // Zustand zurücksetzen, falls der Layer später erneut hinzugefügt wird.
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (this._intersectionObserver) { this._intersectionObserver.disconnect(); this._intersectionObserver = null; }
    this.paused = false;
    this._docHidden = false;
    this._offscreen = false;

    gl.deleteProgram(this.drawProgram.program);
    gl.deleteProgram(this.screenProgram.program);
    gl.deleteProgram(this.updateProgram.program);
    gl.deleteProgram(this.heatmapProgram.program);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.particleIndexBuffer);
    if (this.segVertexBuffer) { gl.deleteBuffer(this.segVertexBuffer); this.segVertexBuffer = null; }
    if (this.segIndexBuffer) { gl.deleteBuffer(this.segIndexBuffer); this.segIndexBuffer = null; }
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
    // Segments: die Dichte hängt am Sichtanteil der Datenregion (uvBounds) —
    // jetzt, wo die Bounds bekannt sind, einmal nachziehen (res-gedämpft).
    if (this.particleStyle === 'segments') this.applyTargetParticleCount();
    this.clearOnNextFrame = true;
    this.map?.triggerRepaint();
  }

  /**
   * Wendet einen bereits fertig gepackten GPU-Puffer an (Half-Float/Float/Byte,
   * s. `packRgbaFloats` in glUtil.ts) — der Gegenpart zu `setWindData` für
   * Frames, deren Blend+Upsample+Pack bereits OFF-MAIN (Worker) gelaufen ist,
   * s. `windFrameAtValidTimeAsync` in iconD2WindSource.ts. Der einzige noch
   * nötige Main-Thread-Schritt ist der `texImage2D`-Upload selbst (WebGL-Calls
   * sind zwingend Main-Thread-only). Kein Quell-Image → `windData.image`
   * bleibt undefined (nur der Dev-Motion-Probe braucht es, s. sampleSourceWind).
   */
  setWindDataPacked(
    packed: PackedTexture,
    width: number,
    height: number,
    meta: WindMeta,
    /** Stabiler Cache-Key des Aufrufers (z. B. "stepA|stepB|frac") — erlaubt
     *  dasselbe No-op-Dedup wie setWindData, obwohl es keine Image-Referenz
     *  gibt, mit der man vergleichen könnte. */
    key: string,
  ): void {
    const gl = this.gl;
    if (!gl) {
      // queue until onAdd has set up gl context (s. _pendingWindData oben —
      // ohne das blieb der erste Frame auf Kaltstart stumm verworfen, sichtbar
      // erst nach einem zufälligen Repaint durch einen unrelated Layer-Toggle).
      this._pendingWindDataPacked = { packed, width, height, meta, key };
      return;
    }
    const metaKey = `packed|${key}|${meta.width}x${meta.height}|${(meta.uvBounds ?? [0, 0, 1, 1]).join(',')}`;
    if (this.windTexture && metaKey === this._lastWindMetaKey) return;

    if (this.windTexture) gl.deleteTexture(this.windTexture);
    this.windTexture = uploadPackedTexture(gl, gl.LINEAR, packed, width, height);

    this.windData = {
      ...meta,
      width,
      height,
      uvBounds: meta.uvBounds ?? [0, 0, 1, 1],
    };
    // Kein Image-Objekt für diesen Frame → der reference-basierte Dedup in
    // setWindData darf nicht versehentlich auf einen alten Treffer laufen.
    this._lastWindImage = null;
    this._lastWindMetaKey = metaKey;
    if (this.particleStyle === 'segments') this.applyTargetParticleCount();
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
    // Der eigentliche (teure) Upsample+Glätten-Kern ist in windRefine.ts
    // ausgelagert — DOM-frei, damit derselbe Code auch im Wind-Blend-Worker
    // läuft (s. setWindDataPacked/windBlendRefine.ts). Hier bleibt nur die
    // Bild→Bytes-Beschaffung, die zwingend Main-Thread-Canvas braucht.
    return refineNormalizedUV(px, sw, sh, this.upsample);
  }

  private _pendingWindData: { image: HTMLImageElement | HTMLCanvasElement; meta: WindMeta } | null = null;
  private _pendingWindDataPacked: {
    packed: PackedTexture; width: number; height: number; meta: WindMeta; key: string;
  } | null = null;

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
    // Segments: harte Obergrenze aus dem Uint16-Index-Budget (4 Verts/Partikel
    // → res ≤ 127 → res² ≤ 16 129 ≤ 16 383). Die Preset-Dichte (Cap 15 000)
    // bleibt darunter; das hier ist der Guard gegen fixe numParticles-Overrides.
    if (this.particleStyle === 'segments') n = Math.min(n, this.segPreset.maxParticles);
    const res = Math.ceil(Math.sqrt(n));
    this.particleStateResolution = res;
    this._numParticles = res * res;

    // Zufälliger Startzustand. Die Bytes dekodieren zu gleichverteilten
    // BOUNDS-RELATIVEN Positionen in [0,1]² — also direkt im Spawn-Rechteck,
    // unabhängig davon, welches gerade gilt. Deshalb hat er kein Bezugsrechteck:
    // `encodeBounds = null` lässt den ersten Update-Pass prev = bounds setzen.
    const state = new Uint8Array(this._numParticles * 4);
    for (let i = 0; i < state.length; i++) state[i] = Math.floor(Math.random() * 256);
    this.encodeBounds = null;

    this.particleStateTexture0 = createTexture(gl, gl.NEAREST, state, res, res);
    this.particleStateTexture1 = createTexture(gl, gl.NEAREST, state, res, res);

    const indices = new Float32Array(this._numParticles);
    for (let i = 0; i < this._numParticles; i++) indices[i] = i;
    this.particleIndexBuffer = createBuffer(gl, indices);

    if (this.particleStyle === 'segments') this.buildSegmentBuffers();
  }

  /** Quad-Geometrie des Segment-Stils: 4 Vertices (index, end, side) + 6
   *  Indizes je Partikel. end 0 = Kopf (Zustand t), 1 = Ende (Zustand t−1);
   *  side ±1 = Quer-Extrusionsrichtung im Vertex-Shader. */
  private buildSegmentBuffers(): void {
    const gl = this.gl!;
    if (this.segVertexBuffer) gl.deleteBuffer(this.segVertexBuffer);
    if (this.segIndexBuffer) gl.deleteBuffer(this.segIndexBuffer);
    const n = this._numParticles;
    const verts = new Float32Array(n * 4 * 3);
    let o = 0;
    for (let i = 0; i < n; i++) {
      verts[o++] = i; verts[o++] = 0; verts[o++] = -1;
      verts[o++] = i; verts[o++] = 0; verts[o++] = 1;
      verts[o++] = i; verts[o++] = 1; verts[o++] = 1;
      verts[o++] = i; verts[o++] = 1; verts[o++] = -1;
    }
    const indices = new Uint16Array(n * 6);
    for (let i = 0; i < n; i++) {
      const b = i * 4;
      const j = i * 6;
      indices[j] = b; indices[j + 1] = b + 1; indices[j + 2] = b + 2;
      indices[j + 3] = b; indices[j + 4] = b + 2; indices[j + 5] = b + 3;
    }
    this.segVertexBuffer = createBuffer(gl, verts);
    this.segIndexBuffer = createIndexBuffer(gl, indices);
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
    const dbW = gl.drawingBufferWidth;
    const dbH = gl.drawingBufferHeight;
    const scale = this.trailScale;
    // Realloc only when the drawing buffer OR the trail scale changes — the
    // governor steps the trail rung with a cooldown, so this is rare. A rebuild
    // clears the trails; they re-accumulate in < 1 s (clearOnNextFrame below).
    if (dbW === this._texDrawW && dbH === this._texDrawH && scale === this._texTrailScale && this.backgroundTexture) return;
    this._texDrawW = dbW;
    this._texDrawH = dbH;
    this._texTrailScale = scale;
    // Phase P2: the trail-color buffers are sized at trailScale × the DRAWING
    // buffer (0.5 only on the governor's bottom rung, else 1.0 = a 1:1 blit).
    const w = Math.max(1, Math.round(dbW * scale));
    const h = Math.max(1, Math.round(dbH * scale));
    this.screenWidth = w;
    this.screenHeight = h;
    // Recompute the cached effective pixel ratio here (buffer size just changed)
    // instead of per-frame in drawParticles — avoids a per-frame clientWidth
    // reflow. DPR-1 desktop → 1 (unchanged). CRITICAL (P2-2): _epr is the FULL
    // ratio (drawingBuffer ÷ CSS width) — it must NOT be derived from the shrunk
    // trail buffer `w`, or the point size would halve twice. trailScale is applied
    // as a SEPARATE factor in drawParticles.
    const canvas = this.map?.getCanvas();
    this._epr = canvas && canvas.clientWidth ? dbW / canvas.clientWidth : 1;
    const empty = new Uint8Array(w * h * 4);
    if (this.backgroundTexture) gl.deleteTexture(this.backgroundTexture);
    if (this.screenTexture) gl.deleteTexture(this.screenTexture);
    // Phase P2: LINEAR (not NEAREST) so the composite pass upscales a half-res
    // trail buffer smoothly instead of blocky. At trailScale 1.0 it is a 1:1 blit
    // → LINEAR is harmless. Still RGBA8/UNSIGNED_BYTE (createTexture) — no float
    // target, no packing-path change.
    this.backgroundTexture = createTexture(gl, gl.LINEAR, empty, w, h);
    this.screenTexture = createTexture(gl, gl.LINEAR, empty, w, h);
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
    // Rand um das Sichtfeld, damit Partikel von außen HEREINwehen statt an der
    // Kante zu entstehen — bewusst RELATIV zur Sichtfeldgröße. Der frühere
    // absolute Boden (0.02 Equirect ≈ 7° Länge / 3,6° Breite) war beim
    // Reinzoomen der dominante Term: ab z6 streute er die Partikel über ein
    // Vielfaches des Sichtfelds, sodass fast nichts mehr im Bild landete
    // (gemessen z7 6,2 % · z9 0,55 % · z11 0,04 % der Partikel im Sichtfeld —
    // die Karte lief beim Reinzoomen leer). Der verbleibende Mini-Boden ist ein
    // reiner Numerik-Schutz gegen eine entartete Null-Fläche.
    const padX = Math.max((xMax - xMin) * 0.1, 1e-5);
    const padY = Math.max((yMax - yMin) * 0.1, 1e-5);
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

  /**
   * Obergrenze aus der Positions-AUFLÖSUNG. Die Partikelposition steckt in einer
   * RGBA8-Textur: 2 Byte je Achse → 1/65 025 der Welt (Kodierung in `updateFrag`,
   * unantastbar — sie ist der Fix für die bekannten Mobil-GPU-Probleme). Dieser
   * Raster-Schritt ist bei Übersichtszoom weit unter einem Pixel, wächst beim
   * Reinzoomen aber mit 2^zoom: ~1 px bei z7, ~4 px bei z9, ~23 px bei z11,5.
   * Sobald er sichtbar wird, sitzen ALLE Partikel auf denselben Gitterpunkten —
   * dicht besetzt liest sich das als Punktraster statt als Strömung (gemessen bei
   * z11,5: 1 138 Zellen im Bild). Deshalb die Zahl auf einen kleinen Anteil der
   * auflösbaren Zellen deckeln: dünn besetzt wirkt dasselbe Gitter wie Streuung.
   * Läuft mit steigendem Zoom gegen null — die Detailansicht wird also bewusst
   * partikelarm statt gemustert (Ist-Zustand dort ohnehin: vor dem Rand-Fix war
   * bei z11 rechnerisch EIN Partikel im Bild). Unterhalb ~z7 ohne Wirkung.
   */
  private latticeParticleCap(): number {
    if (this.globeMode) return Infinity;
    const zoom = this.map?.getZoom() ?? 5;
    // Raster-Schritt in CSS-px. Seit der Umstellung auf eine BOUNDS-RELATIVE
    // Positionskodierung spannen die 2 Byte je Achse nur noch das Spawn-Rechteck
    // (Sichtfeld + 10 %) statt der ganzen Welt — der Schritt bleibt damit auf
    // JEDER Zoomstufe bei ~1,2·Kartenbreite/65 025 ≈ 0,02 px und ist nie
    // sichtbar. Die Klammer bleibt als Schutz stehen (sie greift nur, falls das
    // Rechteck einmal auf die ganze Datenregion zurückfällt), wird im Normalfall
    // aber nicht mehr aktiv — die Detailansicht läuft dadurch nicht mehr leer.
    const b = this.encodeBounds ?? this.getEquirectangularBounds();
    const spanX = Math.max(1e-9, b[2] - b[0]);
    const gridPx = (spanX * 512 * Math.pow(2, zoom)) / 65025;
    if (gridPx <= 1) return Infinity;
    // CSS-Größe aus den GECACHTEN Puffermaßen (÷ _epr) statt clientWidth —
    // dieser Pfad läuft pro Frame, ein DOM-Reflow hätte hier nichts zu suchen.
    const cssW = (this._texDrawW || 1280) / (this._epr || 1);
    const cssH = (this._texDrawH || 720) / (this._epr || 1);
    return Math.max(0, Math.floor(((cssW / gridPx) * (cssH / gridPx)) * this.latticeOccupancy));
  }

  /**
   * Geräte-Anpassung des Partikeltempos an die KARTENBREITE.
   *
   * Die Advektion ist bereits bildwiederholraten-normiert (`u_dt_scale`), das
   * Tempo ist also über Geräte hinweg in px/s identisch — und genau das ist das
   * Problem: Eine Telefonkarte ist ~390 CSS-px breit, die Desktop-Kartenfläche
   * ~800. Dieselben 36 px/s queren das Telefon in 11 s und den Desktop in 22 s,
   * das Telefonbild wirkt dadurch hektisch. Gedämpft mit der WURZEL des
   * Breitenverhältnisses (nicht linear): Ein linear skaliertes Tempo fiele auf
   * dem Telefon unter die Auflösung der Positionskodierung, dort stünden die
   * Partikel dann wieder (V-174). Geklemmt, damit sehr breite oder sehr schmale
   * Flächen nicht ausreißen.
   */
  /** Faktor auf Drop-Rate/Bump: 1 ab `speedRefZoom`, darunter linear steigend
   *  (gedeckelt bei 2,6×). Bei zoomDropBoost 0 exakt 1 = Alt-Verhalten. */
  private zoomDropScale(): number {
    if (this.zoomDropBoost <= 0) return 1;
    const z = this.map?.getZoom?.() ?? this.speedRefZoom;
    const below = Math.max(0, this.speedRefZoom - z);
    const base = Math.min(2.6, 1 + this.zoomDropBoost * below);
    // Auffrisch-Puls direkt nach einem Zoomwechsel: linear auslaufend über
    // ZOOM_SETTLE_MS, damit das Feld in ~1 s wieder gleichmäßig steht.
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (now < this.zoomSettleUntil) {
      const t = (this.zoomSettleUntil - now) / ZOOM_SETTLE_MS;
      this.map?.triggerRepaint();
      return base * (1 + ZOOM_SETTLE_GAIN * t);
    }
    return base;
  }

  private viewportSpeedFactor(): number {
    if (!this.viewportSpeedRefPx) return 1;
    // CSS-Breite aus den GECACHTEN Puffermaßen (÷ _epr) — dieser Pfad läuft pro
    // Frame, ein DOM-Reflow hätte hier nichts zu suchen (wie latticeParticleCap).
    const cssW = (this._texDrawW || this.viewportSpeedRefPx) / (this._epr || 1);
    return Math.max(0.72, Math.min(1.15, Math.sqrt(cssW / this.viewportSpeedRefPx)));
  }

  /**
   * Gezeichnete Partikelzahl. Ziel: die *wahrgenommene Dichte* ist auf JEDER
   * Zoomstufe gleich — nie zu voll, nie zu leer (Jans Auftrag 2026-08-08).
   *
   * Bezugsgröße ist die sichtbare **Datenfläche**, nicht der Viewport: die
   * Partikel entstehen ausschließlich in Sicht ∩ Datenregion
   * (`getEquirectangularBounds`). Beim Herauszoomen schrumpft dieser Anteil
   * (bei z4 nur noch 53 % des Bildes) — dieselbe Zahl in eine kleinere Fläche
   * gestopft ergäbe genau den „Klumpen über DACH", den die alte Rampe umgehen
   * wollte. `dataViewFraction()` (bisher nur vom Segment-Stil benutzt) leistet
   * das direkt und ohne Zoom-Sonderfälle.
   *
   * VORHER (bis 2026-08-08) waren es zwei ad-hoc-Rampen mit Scheitel bei z6:
   * unterhalb linear hoch (0,05 → 1,0), oberhalb ÷1,3 je Stufe bis zum Boden
   * 0,3. Gemessen ergab das eine Zeltkurve mit Faktor **3,3** Schwankung —
   * 2 025 Partikel bei z6 gegen 607 ab z11, also gleichzeitig „zu viel" in der
   * Regionalansicht und „zu wenig" in der Detailansicht
   * (audit/windpartikel-zoom.md §2). Die Begründung der oberen Rampe („die
   * Punktgröße wächst mit dem Zoom, also muss die Zahl fallen") ist mit der
   * abgeflachten Punktgrößen-Kennlinie in `drawParticles` entfallen.
   *
   * Cross-device PARITY (Phase P) bleibt gewahrt: die Zahl ist rein aus
   * CSS-Fläche und Kartenausschnitt abgeleitet, also geräteunabhängig; geregelt
   * wird weiterhin ausschließlich über den partikel-NEUTRALEN FPS-Hebel.
   */
  private getEffectiveParticleCount(): number {
    // Globus zeigt die ganze Erde bei niedrigem Zoom — dort volle Dichte (die
    // Mercator-Ausdünnung würde den Globus fast leer machen).
    if (this.globeMode) return this._numParticles;
    // Segments: die Zoom-Staffel steckt bereits in targetParticleCount (÷1,6
    // pro Stufe) — die zusätzliche Ausdünnung des Points-Pfads entfällt.
    if (this.particleStyle === 'segments') return this._numParticles;
    let frac = Math.max(0.05, Math.min(1, this.dataViewFraction()));
    if (this.legacyZoomThinning) {
      // Alt-Verhalten, nur auf ausdrückliche Anforderung (s. Konstruktor).
      const zoom = this.map?.getZoom() ?? 5;
      const legacy = zoom < 6
        ? Math.max(0.05, Math.min(1, 0.05 + Math.max(0, zoom - 1) * 0.19))
        : Math.max(this.zoomThinFloor, Math.pow(this.zoomThinBase, 6 - zoom));
      frac = Math.min(frac, legacy);
    }
    return Math.max(0, Math.min(
      this._numParticles,
      Math.floor(this._numParticles * frac),
      this.latticeParticleCap(),
    ));
  }

  render(gl: WebGLRenderingContext, args: CustomRenderMethodInput | number[] | Float32Array) {
    if (!this.windData || !this.windTexture) {
      // Zweiter selbst-perpetuierender Repaint-Pfad („warte auf Wind-Daten"-
      // Spinner). Fällt unter dieselbe P3-Repaint-Disziplin wie
      // scheduleParticleRepaint: nicht weiter drehen, wenn nichts sichtbar ist
      // (Tab hidden / offscreen). Beim Resume stößt updatePausedState einen
      // triggerRepaint an → dieser Pfad läuft wieder an, bis Daten da sind.
      if (!this.paused) this.map?.triggerRepaint();
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
        this.drawProgram = this.particleStyle === 'segments'
          ? createProgram(gl, prelude + segDrawVertProjected, segDrawFrag)
          : createProgram(gl, prelude + drawVertProjected, drawFrag);
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

    // Segments: globale Fade-in-Rampe (0→1) nach zoomend/Erstaufbau — maskiert
    // den harten Dichte-/Positions-Neustart, windy-artig ~0,55 s bis voll.
    if (this.particleStyle === 'segments' && this.layerAlpha < 1) {
      this.layerAlpha = Math.min(
        1,
        this.layerAlpha + this.frameDtScale * (16.667 / 1000) * this.segPreset.transition.fadeInPerSec,
      );
    }

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

    // NOTE (Phase P): the governor is fed the actual per-frame RENDER duration
    // AFTER the passes below — NOT the wall-clock interval `dtMs`. Under an active
    // FPS cap `dtMs` is pinned near ~1000/cap by design, so feeding it would drive
    // the governor to the floor forever (self-sabotage). See the feed() call after
    // the particle passes.

    // ZA-1 — Kamerabewegung: nachführen statt verwerfen, wo es exakt geht.
    // Nur auswerten, wenn der Trail-Pass gleich auch WIRKLICH läuft; sonst
    // bleibt `cameraMoved` stehen und wird im nächsten gezeichneten Bild gegen
    // den dann noch gültigen (älteren) Bezug abgearbeitet.
    const willDrawTrail = this.showParticles && !skipParticlesDuringMove;
    this.trailUvScale = null;
    if (willDrawTrail && this.cameraMoved) {
      this.cameraMoved = false;
      const x = this.computeTrailReprojection();
      if (x) {
        this.trailUvScale = x.scale;
        this.trailUvOffset = x.offset;
      } else {
        // Drehung/Neigung/Globus/entartet → Alt-Verhalten: verwerfen.
        this.clearOnNextFrame = true;
      }
    }

    if (this.clearOnNextFrame) {
      this.clearScreen();
      this.clearOnNextFrame = false;
      this.trailUvScale = null;
    }

    const prevFB = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    const prevBlend = gl.getParameter(gl.BLEND) as boolean;
    const prevDepth = gl.getParameter(gl.DEPTH_TEST) as boolean;
    const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
    const prevStencil = gl.getParameter(gl.STENCIL_TEST) as boolean;

    // MapLibre's Custom-Layer-Vertrag: Depth-Test bleibt AN (LEQUAL, per
    // Default) — nur so respektiert der Heatmap/Partikel-Composite auf dem
    // Karten-Framebuffer opake Layer, die SPÄTER in der Stack-Reihenfolge
    // gezeichnet werden (hier: die Länder-Maske). Ein `disable(DEPTH_TEST)`
    // unterbindet den Depth-Write komplett (WebGL-Spec), wodurch die Maske
    // später nichts mehr zu testen hat und Wind über die Landesgrenzen hinaus
    // durchscheint (User-Report). Die Offscreen-Compute-Pässe (Partikel-FBO)
    // haben ohnehin keinen Depth-Attachment — depthMask(false) verhindert nur
    // versehentliches Beschreiben des Karten-Depth-Buffers.
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.BLEND);

    bindTexture(gl, this.windTexture, 0);
    bindTexture(gl, this.particleStateTexture0, 1);

    // Measure the actual render-work duration of the custom-layer passes. This is
    // the governor's input (Phase P): it reflects whether the device can hold the
    // target rate, and is independent of the FPS cap (unlike the wall-clock
    // interval). CPU-side draw-submission time — no GPU sync / no readback added.
    const renderStart = performance.now();

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

    // Feed the governor the measured render duration — but NOT on frames whose
    // particle work we skipped (artificially cheap → unrepresentative), and NOT in
    // globe mode (full density there). In FPS-target mode this steps the FPS cap
    // (30→24→20); the particle count is never touched. Then apply the current
    // target to the repaint gate so the cap follows the governor dynamically.
    if (this.governor && !this.globeMode && !skipParticlesDuringMove) {
      this.governor.feed(performance.now() - renderStart);
      if (this.governorDrivesFps) {
        this.maxParticleFps = this.governor.targetFps;
        // Phase P2: the trail rung is the last-resort lever below the FPS floor.
        // Picked up by allocScreenTextures next frame (rare — cooldown-gated).
        this.trailScale = this.governor.trailScale;
      }
    }

    // restore state for MapLibre
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFB);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
    if (prevBlend) gl.enable(gl.BLEND);
    else gl.disable(gl.BLEND);
    gl.depthMask(prevDepthMask);
    if (!prevDepth) gl.disable(gl.DEPTH_TEST);
    if (prevStencil) gl.enable(gl.STENCIL_TEST);

    // Nur weiter animieren, solange Partikel sichtbar sind. Bei reiner Heatmap
    // („Aus") rendert MapLibre ohnehin bei jeder Karten-/Slider-Bewegung neu —
    // ein Dauer-Repaint wäre reine Akku-Verschwendung. Optional auf maxParticleFps
    // gedeckelt (mobil) — s. scheduleParticleRepaint.
    if (this.showParticles) this.scheduleParticleRepaint();
  }

  /** Fordert den nächsten Wind-Frame an. Bei `maxParticleFps` > 0 über ein Frame-
   *  Zeit-Gate, das den selbst-perpetuierenden Repaint-Loop auf ~cap fps hält
   *  (statt der ungedeckelten Display-Rate) — halbiert auf Mobile die GPU-/
   *  Compositor-Last. Bei 0 unverändert direktes `triggerRepaint` (Desktop-
   *  Referenz). Die Advektion ist dt-normalisiert (`frameDtScale`), daher bleiben
   *  Partikel-Geschwindigkeit und Trail-Länge über die Bildrate hinweg gleich. */
  private scheduleParticleRepaint(): void {
    // Phase P3: Nichts sichtbar (Tab hidden / Karte offscreen) → den selbst-
    // perpetuierenden Loop nicht weiter befeuern. Ein etwaiger Nachschlag-Timer
    // wurde beim Pausieren (updatePausedState) bereits gecleart; der Loop wird
    // beim Resume via triggerRepaint neu angestoßen.
    if (this.paused) return;
    const cap = this.maxParticleFps;
    if (!cap || cap <= 0) { this.map?.triggerRepaint(); return; }
    const minInterval = 1000 / cap;
    const now = performance.now();
    const elapsed = now - this.lastRepaintReqMs;
    if (elapsed >= minInterval) {
      this.lastRepaintReqMs = now;
      this.map?.triggerRepaint();
    } else if (this.repaintCapTimer == null) {
      // Genau EINEN Nachschlag-Timer auf die Restzeit legen → der Loop läuft mit
      // der gedeckelten Rate weiter (ohne Timer bliebe er nach dem Skip stehen,
      // da MapLibre nur auf ein triggerRepaint hin die nächste Frame rendert).
      this.repaintCapTimer = window.setTimeout(() => {
        this.repaintCapTimer = null;
        if (!this.showParticles || !this.map) return;
        this.lastRepaintReqMs = performance.now();
        this.map.triggerRepaint();
      }, minInterval - elapsed);
    }
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
    // ZA-1: bei bewegter Kamera den Vorframe um die Bewegung versetzt/skaliert
    // abtasten, damit der Schweif an der Karte klebt statt am Bildschirm.
    // Ohne Bewegung ist das die Identität → byte-identisch zum Alt-Verhalten.
    this.drawTexture(
      this.backgroundTexture,
      fade,
      this.trailUvScale ?? [1, 1],
      this.trailUvScale ? this.trailUvOffset : [0, 0],
    );

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

    // Bezugsecken für die Nachführung im nächsten Bild (ZA-1). Bewusst HIER,
    // nach einem tatsächlich gezeichneten Pass: wird der Pass ausgelassen
    // (skipParticlesDuringMove), bleibt der ältere Bezug gültig.
    this.captureTrailAnchors();
  }

  /** `uvScale`/`uvOffset` verschieben die Quelle des Vollbild-Passes (ZA-1,
   *  s. `computeTrailReprojection`). Ohne Angabe: Identität — der Komposit-Pass
   *  benutzt sie IMMER. */
  private drawTexture(
    texture: WebGLTexture,
    opacity: number,
    uvScale: [number, number] = [1, 1],
    uvOffset: [number, number] = [0, 0],
  ) {
    const gl = this.gl!;
    const p = this.screenProgram;
    gl.useProgram(p.program);
    bindAttribute(gl, this.quadBuffer, p.a_pos as number, 2);
    bindTexture(gl, texture, 2);
    gl.uniform1i(p.u_screen as WebGLUniformLocation, 2);
    gl.uniform1f(p.u_opacity as WebGLUniformLocation, opacity);
    gl.uniform2f(p.u_uv_scale as WebGLUniformLocation, uvScale[0], uvScale[1]);
    gl.uniform2f(p.u_uv_offset as WebGLUniformLocation, uvOffset[0], uvOffset[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * ZA-1: UV-Transformation, die den Trail-Puffer des letzten Bildes auf die
   * AKTUELLE Kamera abbildet. `null` = nicht möglich ⇒ Aufrufer löscht.
   *
   * Bezugspunkte sind die beiden Bildecken des letzten gezeichneten Bildes:
   * Deren geografische Lage wurde damals gemerkt, ihre Bildschirmposition war
   * per Konstruktion (0,0) und (W,H). Heute neu projiziert liefern sie
   * unmittelbar Maßstab und Versatz — ohne Annahme über Mercator-Interna.
   *
   * Voraussetzung: keine Drehung, keine Neigung, kein Globus/Projektionswechsel
   * (dort ist die Abbildung im Bildschirmraum nicht mehr affin).
   */
  private computeTrailReprojection(): { scale: [number, number]; offset: [number, number] } | null {
    const map = this.map;
    const tl = this._trailAnchorTL;
    const br = this._trailAnchorBR;
    if (!map || !tl || !br || this.globeMode) return null;
    if (map.getBearing() !== 0 || map.getPitch() !== 0) return null;
    if (this.projData && this.projData.projectionTransition !== 0) return null;
    const w = this._trailAnchorW;
    const h = this._trailAnchorH;
    if (w <= 0 || h <= 0) return null;
    // Puffergröße darf sich zwischen den Bildern nicht geändert haben — sonst
    // ist der gemerkte Bezug ungültig (Resize löscht ohnehin separat).
    const cssW = (this._texDrawW || 0) / (this._epr || 1);
    const cssH = (this._texDrawH || 0) / (this._epr || 1);
    if (Math.abs(cssW - w) > 0.5 || Math.abs(cssH - h) > 0.5) return null;

    const p1 = map.project([tl.lng, tl.lat]);
    const p2 = map.project([br.lng, br.lat]);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) < 1 || Math.abs(dy) < 1) return null;
    const sx = w / dx;
    const sy = h / dy;
    // Plausibilitätsklammer: mehr als Faktor 5 Maßstabsänderung in EINEM Bild
    // ist kein Zoomen, sondern ein Sprung (oder eine entartete Projektion) —
    // dann lieber löschen als etwas Falsches stehenlassen.
    if (!(sx > 0.2 && sx < 5 && sy > 0.2 && sy < 5)) return null;
    // Bildschirm→UV: uv.x = px/W (rechts = 1), uv.y = 1 − py/H (oben = 1).
    // Quelle q = (p − p1) · s, daher uv_src = uv · s + t.
    const tx = (-p1.x * sx) / w;
    const ty = 1 - sy + (p1.y * sy) / h;
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    return { scale: [sx, sy], offset: [tx, ty] };
  }

  /** Merkt sich die geografische Lage der beiden Bildecken des gerade
   *  gezeichneten Bildes — der Bezug für die Nachführung im nächsten Bild.
   *  Nur nach einem TATSÄCHLICH gezeichneten Trail-Pass aufrufen (wird der Pass
   *  ausgelassen, gilt weiter der ältere Bezug). */
  private captureTrailAnchors(): void {
    const map = this.map;
    if (!map || this.globeMode) { this._trailAnchorTL = null; return; }
    const w = (this._texDrawW || 0) / (this._epr || 1);
    const h = (this._texDrawH || 0) / (this._epr || 1);
    if (w <= 0 || h <= 0) { this._trailAnchorTL = null; return; }
    const a = map.unproject([0, 0]);
    const b = map.unproject([w, h]);
    this._trailAnchorTL = { lng: a.lng, lat: a.lat };
    this._trailAnchorBR = { lng: b.lng, lat: b.lat };
    this._trailAnchorW = w;
    this._trailAnchorH = h;
  }

  private drawParticles(matrix: Float32List) {
    if (this.particleStyle === 'segments') {
      this.drawParticleSegments(matrix);
      return;
    }
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
    // Punktgröße über den Zoom — bewusst FAST FLACH.
    //
    // Der gezeichnete Punkt ist der KOPF eines Kometen; die Länge des Schweifs
    // ist zoom-unabhängig (screenTempoZoomExp 0 ⇒ px/s hängt nur vom Wind ab),
    // sie liegt je nach Windstärke bei 19–45 px. Die alte Kennlinie
    // (1 + (z−5)·0,3, gedeckelt bei 3,4) blies den Kopf beim Reinzoomen auf
    // 8,5 px auf, während der Schweif gleich lang blieb — das Verhältnis
    // Schweif : Kopf fiel von 9 : 1 (z4) auf 2,2 : 1 (z13), und aus dem Strich
    // wurde wieder ein fetter Klecks (gemessen: audit/windpartikel-zoom.md §3).
    // 0,08 je Stufe, gedeckelt bei 1,5, hält den Kopf bei 2,3–3,8 px: sichtbar,
    // aber nie breiter als der Schweif. Untergrenze 0,85 unverändert, damit der
    // Globus (Zoom ~0–2, ohnehin geklemmt) exakt gleich bleibt.
    const zoom = this.map?.getZoom() ?? 5;
    const zoomFactor = Math.max(0.85, Math.min(1.5, 1.0 + (zoom - 5) * 0.08));
    // gl_PointSize is in FRAMEBUFFER pixels, so apparent CSS thickness would be
    // pointSize / effectivePixelRatio — i.e. thinner on high-DPR desktops and on
    // the DPR-capped mobile buffer (a key cause of the mobile↔desktop mismatch).
    // Multiply by the effective pixel ratio (drawingBuffer ÷ CSS width) so the
    // CSS-space thickness is identical across devices. DPR-1 desktop → ×1. The
    // ratio is cached (see _epr) so this hot path does no per-frame DOM query.
    // Phase P2: also multiply by trailScale — particles are drawn INTO the trail
    // buffer, whose gl_PointSize is in that buffer's pixels; at trailScale 0.5 a
    // point must be half the pixels so it upscales back to the same CSS thickness.
    // At trailScale 1.0 this is ×1 → unchanged.
    gl.uniform1f(p.u_point_size as WebGLUniformLocation, this.pointSize * zoomFactor * this._epr * this.trailScale);
    const c = this.particleColor;
    gl.uniform4f(p.u_particle_color as WebGLUniformLocation, c[0], c[1], c[2], c[3]);
    const [dx0, dy0, dx1, dy1] = this.windData!.uvBounds;
    gl.uniform4f(p.u_data_uv_bounds as WebGLUniformLocation, dx0, dy0, dx1, dy1);
    this.setEncodeBoundsUniform(p);
    this.setPositionUniforms(p, matrix);

    gl.drawArrays(gl.POINTS, 0, this.getEffectiveParticleCount());
  }

  /** `u_bounds` für die DRAW-Pässe: das Rechteck, mit dem die aktuelle
   *  Zustandstextur kodiert ist. Der Draw läuft vor dem Update, also das des
   *  letzten Updates (beim ersten Frame das aktuelle — der Initialzustand ist
   *  gleichverteilt und damit unter jedem Rechteck gültig). */
  private setEncodeBoundsUniform(p: ProgramWrapper): void {
    const b = this.encodeBounds ?? this.getEquirectangularBounds();
    this.gl!.uniform4f(p.u_bounds as WebGLUniformLocation, b[0], b[1], b[2], b[3]);
  }

  /** Der aktuell wirksame Zoom für alle Tempo-/Auflösungsrechnungen. Im
   *  Globus-Modus ist `getZoom()` kein Mercator-Zoom → fester Referenzwert. */
  private tempoZoom(): number {
    return this.globeMode ? this.speedRefZoom : (this.map?.getZoom() ?? this.speedRefZoom);
  }

  /** Die Tempo-Parameter dieses Layers als reines Datenobjekt (s. advection.ts).
   *  `viewportSpeedFactor()` ist die abgeschaltete Alt-Gerätedämpfung und steckt
   *  hier im Multiplikator — bei `viewportSpeedRefPx: 0` (Default) exakt 1. */
  private tempoOptions(): ScreenTempoOptions {
    return {
      speedPxPerMs: this.speedPxPerMs,
      speedFactor: this.speedFactor * this.viewportSpeedFactor(),
      speedRefZoom: this.speedRefZoom,
      screenTempoZoomExp: this.screenTempoZoomExp,
    };
  }

  /**
   * `u_step_scale`: equirect-X-Schritt je 1 m/s Wind. Der EINZIGE
   * Geschwindigkeits-Skalar der Engine — Herleitung und Vertrag in
   * `advection.ts`. Von Update-Pass UND Segment-Draw benutzt (der Draw
   * advektiert das Schwanzende rückwärts mit derselben Skala).
   *
   * `dtScale60` = Schrittlänge in 60-fps-Frames: im Update-Pass die
   * dt-Normierung des Layers, im Segment-Draw `headFrames`.
   */
  private advectionStepScale(dtScale60: number): number {
    return advectionStepScale(this.tempoZoom(), dtScale60, this.tempoOptions());
  }

  /** Segment-Stil (WP1): ein Quad je Partikel — Kopf = Position aus der
   *  Zustandstextur, Schwanzende = im Vertex-Shader um einen 60-fps-Schritt
   *  RÜCKWÄRTS advektiert (bewusst NICHT aus der zweiten Ping-Pong-Textur:
   *  die zwei Texturen halten auf manchen GL-Stacks nachweislich keine
   *  benachbarten Zeitschritte, s. Shader-Kommentar). Breite aus der
   *  Windy-Tabelle, Quer-AA im Fragment-Shader, echtes Alpha-Blending in den
   *  Trail-Buffer (Köpfe malen ÜBER die Spur statt sie zu ersetzen — bei
   *  POINTS bewusst nicht angefasst). */
  private drawParticleSegments(matrix: Float32List) {
    const gl = this.gl!;
    const p = this.drawProgram;
    gl.useProgram(p.program);

    bindAttribute(gl, this.segVertexBuffer!, p.a_vert as number, 3);

    bindTexture(gl, this.colorRampTexture, 2);
    gl.uniform1i(p.u_wind as WebGLUniformLocation, 0);
    gl.uniform1i(p.u_particles as WebGLUniformLocation, 1);
    gl.uniform1i(p.u_color_ramp as WebGLUniformLocation, 2);
    gl.uniform1f(p.u_speed_tint as WebGLUniformLocation, this.speedTint);
    gl.uniform1f(p.u_particles_res as WebGLUniformLocation, this.particleStateResolution);
    gl.uniform2f(p.u_wind_min as WebGLUniformLocation, this.windData!.uMin, this.windData!.vMin);
    gl.uniform2f(p.u_wind_max as WebGLUniformLocation, this.windData!.uMax, this.windData!.vMax);

    // Strichbreite aus der Windy-Tabelle (Windy-z = MapLibre-z + 1), in
    // Trail-Buffer-px: × effektive Pixel-Ratio und trailScale (wie die
    // Punktgröße im Points-Pfad). pointSize/2.5 = UI-„Intensiv"-Faktor
    // (Standard 2.5 → ×1, Intensiv 2.9 → ×1.16) — die UI-API bleibt gleich.
    const w = this.segPreset.width;
    const s = this.segPreset.speed;
    const zWindy = (this.map?.getZoom() ?? 4) + 1;
    const widthPx = Math.max(1, lookupZoomTable(w.lineWidth, zWindy) * w.scale * (this.pointSize / 2.5))
      * this._epr * this.trailScale;
    gl.uniform1f(p.u_half_width as WebGLUniformLocation, widthPx * 0.5);
    gl.uniform1f(p.u_aa_edge as WebGLUniformLocation, w.aaEdgePx);
    gl.uniform1f(p.u_length_ex as WebGLUniformLocation, w.lengthExPx * this._epr * this.trailScale);
    // Rückwärts-Advektion des Schwanzendes: EXAKT dieselbe Skala + Kennlinie wie
    // der Update-Pass, nur über `headFrames` 60-fps-Schritte statt über den
    // aktuellen dt (1 ≙ windy). Das Tempo-Preset (`s.pxPerSec`, `s.zoom2speed`,
    // `s.gamma/refMs/minMs`) ist damit stillgelegt — Tempo kommt für BEIDE Stile
    // aus speedPxPerMs, sonst würden Kopf und Schweif auseinanderlaufen.
    gl.uniform1f(p.u_step_scale as WebGLUniformLocation, this.advectionStepScale(s.headFrames));
    gl.uniform1f(p.u_speed_gamma as WebGLUniformLocation, this.speedGamma);
    gl.uniform1f(p.u_speed_ref as WebGLUniformLocation, this.speedRef);
    gl.uniform1f(p.u_speed_min as WebGLUniformLocation, this.speedMin);
    gl.uniform2f(p.u_viewport as WebGLUniformLocation, this.screenWidth, this.screenHeight);
    gl.uniform1f(p.u_global_alpha as WebGLUniformLocation, this.layerAlpha);
    const c = this.particleColor;
    gl.uniform4f(p.u_particle_color as WebGLUniformLocation, c[0], c[1], c[2], c[3]);
    const [dx0, dy0, dx1, dy1] = this.windData!.uvBounds;
    gl.uniform4f(p.u_data_uv_bounds as WebGLUniformLocation, dx0, dy0, dx1, dy1);
    this.setEncodeBoundsUniform(p);
    this.setPositionUniforms(p, matrix);

    // Straight-alpha „over" (separate Alpha-Funktion, damit der Ziel-Alpha
    // korrekt Richtung 1 akkumuliert) — Köpfe übermalen die Fade-Spur weich.
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.segIndexBuffer);
    gl.drawElements(gl.TRIANGLES, this.getEffectiveParticleCount() * 6, gl.UNSIGNED_SHORT, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.disable(gl.BLEND);
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
    // DER Geschwindigkeits-Skalar: equirect-X-Schritt je 1 m/s Wind, inklusive
    // Zoomgesetz und dt-Normierung (relativ zu 60 fps, einmal pro Frame in
    // render() bestimmt → Tempo bleibt bildratenunabhängig). Es gibt keinen
    // weiteren versteckten Faktor mehr: `px/s = A(z) · |V|`, s. advection.ts.
    // Der Segment-Stil benutzt dieselbe Skala — sein Preset steuert nur noch
    // Dichte/Breite/Schweif, nicht mehr das Tempo.
    gl.uniform1f(p.u_step_scale as WebGLUniformLocation, this.advectionStepScale(this.frameDtScale));
    // Alt-Kennlinie, per Default neutral (γ = 1, Boden 0) → dispSpeed == speed.
    gl.uniform1f(p.u_speed_gamma as WebGLUniformLocation, this.speedGamma);
    gl.uniform1f(p.u_speed_ref as WebGLUniformLocation, this.speedRef);
    gl.uniform1f(p.u_speed_min as WebGLUniformLocation, this.speedMin);
    // Weit draußen sammeln sich die Partikel in Konvergenzzonen zu Klumpen:
    // dort deckt ein Pixel viel mehr Fläche ab, also laufen mehr Bahnen in
    // dieselben Zellen. Die Auffrischrate steigt deshalb mit dem Rauszoomen
    // (zoomDropScale) — die Bahn selbst bleibt unverändert.
    const dropScale = this.zoomDropScale();
    gl.uniform1f(p.u_drop_rate as WebGLUniformLocation, this.dropRate * dropScale);
    gl.uniform1f(p.u_drop_rate_bump as WebGLUniformLocation, this.dropRateBump * dropScale);
    // Z3 — Umverteilung bei Rechteckwechsel (s. zoomRedistribute).
    gl.uniform1f(p.u_redistribute as WebGLUniformLocation, this.zoomRedistribute ? 1 : 0);
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

    // Bezugsrechteck der Positionskodierung. `prev` ist das Rechteck, mit dem
    // die EINGEHENDE Zustandstextur kodiert wurde — beim Schwenken/Zoomen
    // unterscheiden sich beide, der Shader rechnet die Position exakt um
    // (dekodieren mit prev → advektieren absolut → kodieren mit bounds).
    // Beim allerersten Pass gibt es kein prev: der Initialzustand ist
    // gleichverteiltes [0,1]² und damit unter jedem Rechteck gültig.
    const bounds = this.getEquirectangularBounds();
    const prev = this.encodeBounds ?? bounds;
    gl.uniform4f(p.u_bounds as WebGLUniformLocation, bounds[0], bounds[1], bounds[2], bounds[3]);
    gl.uniform4f(p.u_bounds_prev as WebGLUniformLocation, prev[0], prev[1], prev[2], prev[3]);
    const [dx0, dy0, dx1, dy1] = this.windData!.uvBounds;
    gl.uniform4f(p.u_data_uv_bounds as WebGLUniformLocation, dx0, dy0, dx1, dy1);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.encodeBounds = bounds;
    this.advectedSeconds += this.frameDtScale / 60;

    const tmp = this.particleStateTexture0;
    this.particleStateTexture0 = this.particleStateTexture1;
    this.particleStateTexture1 = tmp;
  }
}

// helpers used inside layer; exported only for testing if needed
export const _internals = { lngToMercX, latToMercY, lngToEquiX, latToEquiY };
