/**
 * FastScalarLayer — Perf-Prototyp-Variante von ScalarLayer.
 *
 * Unterschied zur Produktions-`ScalarLayer`:
 *   • Hält ZWEI zeitliche Frames (A/B) gleichzeitig als Texturen und
 *     interpoliert sie IM SHADER per `mix(a, b, u_frac)`. Das Sub-Stunden-
 *     Scrubbing der Zeitleiste kostet dadurch KEINE CPU: kein `lerpFrameImage`-
 *     Canvas-Rebuild pro Tick, nur ein `uniform1f`-Update. Nur beim Überschreiten
 *     einer Stundengrenze wird eine neue Textur hochgeladen (`swapFrames`).
 *   • Color-Ramp wird im Shader angewandt (identisch zu ScalarLayer).
 *   • Kein DEM-Refinement-Pass (bewusst schlank — der Prototyp misst den
 *     Render-Pfad, nicht die Höhen-Korrektur).
 *
 * Gültig nur für Felder mit FESTER Normalisierung (Temperatur [-20,40]),
 * genau wie `lerpFrameImage` — Wind (per-Frame-min/max) wäre unzulässig.
 *
 * Reines Prototyp-Modul unter src/dev/ — nicht Teil des Prod-Bundles, kein
 * Eingriff in MapView/Shader-Pipeline.
 */

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import {
  bindAttribute,
  bindTexture,
  createBuffer,
  createProgram,
  createTexture,
  getColorRamp,
  type ProgramWrapper,
} from '../../wind/glUtil';

const MERC_MAX_LAT = 85.05112878;

const meshVert = `
precision mediump float;
attribute vec2 a_lnglat;
uniform mat4 u_matrix;
varying vec2 v_equi_uv;
const float PI = 3.14159265358979323846;
void main() {
  float lng = a_lnglat.x;
  float lat = a_lnglat.y;
  v_equi_uv = vec2((lng + 180.0) / 360.0, (90.0 - lat) / 180.0);
  float lat_rad = lat * PI / 180.0;
  float mx = (lng + 180.0) / 360.0;
  float my = 0.5 - log(tan(PI * 0.25 + lat_rad * 0.5)) / (2.0 * PI);
  gl_Position = u_matrix * vec4(mx, my, 0.0, 1.0);
}
`;

// Zwei Wert-Texturen + GPU-Zeitmischung. R = normierter Wert, A = Datenmaske.
const meshFrag = `
precision mediump float;
uniform sampler2D u_valueA;
uniform sampler2D u_valueB;
uniform sampler2D u_color_ramp;
uniform vec4 u_data_uv_bounds;
uniform float u_opacity;
uniform float u_frac;        // 0 = nur A, 1 = nur B (Sub-Stunden-Position)
uniform vec2 u_vis_range;
varying vec2 v_equi_uv;
void main() {
  vec2 uv = (v_equi_uv - u_data_uv_bounds.xy) /
            (u_data_uv_bounds.zw - u_data_uv_bounds.xy);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  vec4 a = texture2D(u_valueA, uv);
  vec4 b = texture2D(u_valueB, uv);
  // Maske: nur zeichnen, wo BEIDE Frames Daten haben (verhindert Rand-Artefakte
  // beim Blenden über die Gittergrenze).
  float mask = min(a.a, b.a);
  if (mask < 0.05) discard;
  float t = mix(a.r, b.r, u_frac);
  vec2 ramp_pos = vec2(fract(16.0 * t), floor(16.0 * t) / 16.0);
  vec4 c = texture2D(u_color_ramp, ramp_pos);
  float vis = u_vis_range.y > u_vis_range.x
      ? smoothstep(u_vis_range.x, u_vis_range.y, t)
      : 1.0;
  gl_FragColor = vec4(c.rgb, c.a * u_opacity * vis * mask);
}
`;

export interface FastScalarMeta {
  uvBounds: [number, number, number, number];
}

export interface FastScalarLayerOptions {
  id: string;
  colorRamp: Record<number, string>;
  visRange?: { start: number; end: number };
  opacity?: number;
  zoomAttenuation?: { from: number; perStep: number; floor: number };
}

type ImgSource = HTMLImageElement | HTMLCanvasElement;

export class FastScalarLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  opacity: number;
  visRange: { start: number; end: number };
  zoomAttenuation: { from: number; perStep: number; floor: number } | null;

  private colorRampStops: Record<number, string>;
  private map: MapLibreMap | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program!: ProgramWrapper;
  private mesh!: WebGLBuffer;
  private meshVertexCount = 0;
  private texA: WebGLTexture | null = null;
  private texB: WebGLTexture | null = null;
  private colorRampTexture!: WebGLTexture;
  private uvBounds: [number, number, number, number] | null = null;
  private frac = 0;
  // Frame-Wechsel, die vor onAdd (GL-Kontext) eintreffen, zwischenspeichern.
  private _pendingPair: { a: ImgSource; b: ImgSource; meta: FastScalarMeta } | null = null;

  constructor(options: FastScalarLayerOptions) {
    this.id = options.id;
    this.opacity = options.opacity ?? 0.95;
    this.visRange = options.visRange ?? { start: 0, end: 0 };
    this.zoomAttenuation = options.zoomAttenuation ?? null;
    this.colorRampStops = options.colorRamp;
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext) {
    this.map = map;
    this.gl = gl;
    this.program = createProgram(gl, meshVert, meshFrag);
    this.colorRampTexture = createTexture(gl, gl.LINEAR, getColorRamp(this.colorRampStops), 16, 16);
    this.buildMesh();
    if (this._pendingPair) {
      const { a, b, meta } = this._pendingPair;
      this._pendingPair = null;
      this.setPair(a, b, meta);
    }
  }

  onRemove(_map: MapLibreMap, gl: WebGLRenderingContext) {
    gl.deleteProgram(this.program.program);
    gl.deleteBuffer(this.mesh);
    if (this.texA) gl.deleteTexture(this.texA);
    if (this.texB) gl.deleteTexture(this.texB);
    gl.deleteTexture(this.colorRampTexture);
  }

  private buildMesh() {
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
    this.mesh = createBuffer(gl, new Float32Array(verts));
    this.meshVertexCount = verts.length / 2;
  }

  /** Beide Bracketing-Frames hochladen (nur bei Stundenwechsel nötig). */
  setPair(a: ImgSource, b: ImgSource, meta: FastScalarMeta) {
    const gl = this.gl;
    if (!gl) {
      this._pendingPair = { a, b, meta };
      return;
    }
    if (this.texA) gl.deleteTexture(this.texA);
    if (this.texB) gl.deleteTexture(this.texB);
    this.texA = createTexture(gl, gl.LINEAR, a);
    this.texB = createTexture(gl, gl.LINEAR, b);
    this.uvBounds = meta.uvBounds;
    this.map?.triggerRepaint();
  }

  /** Sub-Stunden-Position setzen — reines Uniform-Update, KEIN Textur-Upload. */
  setFrac(frac: number) {
    const f = Math.max(0, Math.min(1, frac));
    if (f === this.frac) return;
    this.frac = f;
    this.map?.triggerRepaint();
  }

  setColorRamp(stops: Record<number, string>) {
    this.colorRampStops = stops;
    const gl = this.gl;
    if (!gl) return;
    gl.deleteTexture(this.colorRampTexture);
    this.colorRampTexture = createTexture(gl, gl.LINEAR, getColorRamp(stops), 16, 16);
    this.map?.triggerRepaint();
  }

  render(gl: WebGLRenderingContext, args: CustomRenderMethodInput | number[] | Float32Array) {
    if (!this.uvBounds || !this.texA || !this.texB) return;
    let matrix: Float32List;
    if (Array.isArray(args) || args instanceof Float32Array) {
      matrix = args as Float32List;
    } else {
      matrix = args.defaultProjectionData.mainMatrix as unknown as Float32List;
    }

    const prevBlend = gl.getParameter(gl.BLEND) as boolean;
    const prevDepth = gl.getParameter(gl.DEPTH_TEST) as boolean;
    const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const p = this.program;
    gl.useProgram(p.program);
    bindAttribute(gl, this.mesh, p.a_lnglat as number, 2);
    bindTexture(gl, this.texA, 0);
    bindTexture(gl, this.texB, 1);
    bindTexture(gl, this.colorRampTexture, 2);
    gl.uniform1i(p.u_valueA as WebGLUniformLocation, 0);
    gl.uniform1i(p.u_valueB as WebGLUniformLocation, 1);
    gl.uniform1i(p.u_color_ramp as WebGLUniformLocation, 2);
    const [dx0, dy0, dx1, dy1] = this.uvBounds;
    gl.uniform4f(p.u_data_uv_bounds as WebGLUniformLocation, dx0, dy0, dx1, dy1);
    let effectiveOpacity = this.opacity;
    if (this.zoomAttenuation) {
      const zoom = this.map?.getZoom() ?? 5;
      const { from, perStep, floor } = this.zoomAttenuation;
      const factor = Math.max(floor, Math.min(1, 1 - Math.max(0, zoom - from) * perStep));
      effectiveOpacity *= factor;
    }
    gl.uniform1f(p.u_opacity as WebGLUniformLocation, effectiveOpacity);
    gl.uniform1f(p.u_frac as WebGLUniformLocation, this.frac);
    gl.uniform2f(p.u_vis_range as WebGLUniformLocation, this.visRange.start, this.visRange.end);
    gl.uniformMatrix4fv(p.u_matrix as WebGLUniformLocation, false, matrix);

    gl.drawArrays(gl.TRIANGLES, 0, this.meshVertexCount);

    if (!prevBlend) gl.disable(gl.BLEND);
    gl.depthMask(prevDepthMask);
    if (!prevDepth) gl.disable(gl.DEPTH_TEST);
  }
}
