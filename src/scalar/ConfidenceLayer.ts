/**
 * Vertrauens-Schleier als MapLibre-Custom-Layer — Kreuzschraffur über den
 * Basis-Layern, deren Dichte/Deckkraft mit der UNSICHERHEIT wächst (1 −
 * confidence). Sichere Zellen bleiben klar, unsichere bekommen ein dichtes
 * Schraffurmuster. Bewusst Muster statt Farbe: liest sich als „Interpretation",
 * nicht als neue Messung, und überlagert den Regen-/Temperatur-Layer, ohne
 * dessen Farben zu verfälschen.
 *
 * Geometrie/Projektion wie {@link ScalarLayer} (lat-lng-Mesh → Mercator im
 * Vertex-Shader). Die Werte-Textur trägt im R-Kanal die Confidence (0..1) und
 * im A-Kanal die Datenmaske. Das Schraffurmuster entsteht aus `gl_FragCoord`
 * (Bildschirm-Pixel) → bildschirmstabil, zoom-unabhängig dicht.
 */

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import { bindAttribute, bindTexture, createBuffer, createProgram, createTexture, type ProgramWrapper } from '../wind/glUtil';
import type { ScalarMeta } from './ScalarLayer';

const MERC_MAX_LAT = 85.05112878;

const vert = `
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

const frag = `
precision mediump float;
uniform sampler2D u_value;      // R = confidence 0..1, A = Stations-Deckung 0..1 (0 = keine Referenz)
uniform vec4 u_data_uv_bounds;
uniform float u_opacity;
uniform float u_spacing;        // Linienabstand (Pixel)
uniform vec3 u_color;
uniform float u_show_above;     // erst ab dieser Unsicherheit schraffieren
varying vec2 v_equi_uv;

void main() {
  vec2 uv = (v_equi_uv - u_data_uv_bounds.xy) / (u_data_uv_bounds.zw - u_data_uv_bounds.xy);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  vec4 raw = texture2D(u_value, uv);
  if (raw.a < 0.05) discard;                 // keine Daten → nichts zeichnen
  float uncertainty = clamp(1.0 - raw.r, 0.0, 1.0);
  if (uncertainty <= u_show_above) discard;  // sichere Zellen bleiben klar

  // Unsicherheit oberhalb der Schwelle auf 0..1 strecken.
  float u = (uncertainty - u_show_above) / max(1e-3, 1.0 - u_show_above);

  // Zwei diagonale Linienscharen (Kreuzschraffur), bildschirmstabil.
  float lineW = 0.06 + 0.40 * u;             // unsicherer → dickere Linien
  float a = fract((gl_FragCoord.x + gl_FragCoord.y) / u_spacing);
  float b = fract((gl_FragCoord.x - gl_FragCoord.y) / u_spacing);
  float onLine = max(
    1.0 - smoothstep(lineW, lineW + 0.04, a),
    1.0 - smoothstep(lineW, lineW + 0.04, b)
  );
  // raw.a = Stations-Deckung → blendet den Schleier dort weich aus, wo die
  // nächste DWD-Station zu weit weg ist (Klimatologie unzuverlässig → keine
  // Aussage, statt Rand-Artefakt-Schraffur).
  float alpha = onLine * (0.35 + 0.65 * u) * u_opacity * raw.a;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(u_color, alpha);
}
`;

export interface ConfidenceLayerOptions {
  id: string;
  opacity?: number;
  /** Linienabstand in CSS-Pixeln (mit devicePixelRatio skaliert). Default 9. */
  spacingPx?: number;
  /** Schraffurfarbe rgb 0..1. Default dunkles Schiefergrau. */
  color?: [number, number, number];
  /** Erst ab dieser Unsicherheit (0..1) schraffieren. Default 0.15. */
  showAbove?: number;
}

interface ConfData extends ScalarMeta { image: HTMLCanvasElement | HTMLImageElement }

export class ConfidenceLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  opacity: number;
  spacingPx: number;
  color: [number, number, number];
  showAbove: number;

  private map: MapLibreMap | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program!: ProgramWrapper;
  private mesh!: WebGLBuffer;
  private meshVertexCount = 0;
  private valueTexture: WebGLTexture | null = null;
  private data: ConfData | null = null;
  private _pending: { image: HTMLCanvasElement | HTMLImageElement; meta: ScalarMeta } | null = null;

  constructor(opts: ConfidenceLayerOptions) {
    this.id = opts.id;
    this.opacity = opts.opacity ?? 0.85;
    this.spacingPx = opts.spacingPx ?? 9;
    this.color = opts.color ?? [0.18, 0.20, 0.27];
    this.showAbove = opts.showAbove ?? 0.15;
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext) {
    this.map = map;
    this.gl = gl;
    this.program = createProgram(gl, vert, frag);
    this.buildMesh();
    if (this._pending) { const { image, meta } = this._pending; this._pending = null; this.setData(image, meta); }
  }

  onRemove(_map: MapLibreMap, gl: WebGLRenderingContext) {
    gl.deleteProgram(this.program.program);
    gl.deleteBuffer(this.mesh);
    if (this.valueTexture) gl.deleteTexture(this.valueTexture);
  }

  private buildMesh() {
    const gl = this.gl!;
    const cols = 128, rows = 64;
    const verts: number[] = [];
    const lngStep = 360 / cols;
    const latRange = 2 * MERC_MAX_LAT;
    const latStep = latRange / rows;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const lng0 = -180 + i * lngStep, lng1 = -180 + (i + 1) * lngStep;
        const lat0 = -MERC_MAX_LAT + j * latStep, lat1 = -MERC_MAX_LAT + (j + 1) * latStep;
        verts.push(lng0, lat0, lng1, lat0, lng0, lat1, lng0, lat1, lng1, lat0, lng1, lat1);
      }
    }
    this.mesh = createBuffer(gl, new Float32Array(verts));
    this.meshVertexCount = verts.length / 2;
  }

  setData(image: HTMLCanvasElement | HTMLImageElement, meta: ScalarMeta) {
    const gl = this.gl;
    if (!gl) { this._pending = { image, meta }; return; }
    if (this.valueTexture) gl.deleteTexture(this.valueTexture);
    this.valueTexture = createTexture(gl, gl.LINEAR, image);
    this.data = { ...meta, image };
    this.map?.triggerRepaint();
  }

  render(gl: WebGLRenderingContext, args: CustomRenderMethodInput | number[] | Float32Array) {
    if (!this.data || !this.valueTexture) return;
    const matrix: Float32List = Array.isArray(args) || args instanceof Float32Array
      ? (args as Float32List)
      : (args.defaultProjectionData.mainMatrix as unknown as Float32List);

    const prevBlend = gl.getParameter(gl.BLEND) as boolean;
    const prevDepth = gl.getParameter(gl.DEPTH_TEST) as boolean;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const p = this.program;
    gl.useProgram(p.program);
    bindAttribute(gl, this.mesh, p.a_lnglat as number, 2);
    bindTexture(gl, this.valueTexture, 0);
    gl.uniform1i(p.u_value as WebGLUniformLocation, 0);
    const [dx0, dy0, dx1, dy1] = this.data.uvBounds;
    gl.uniform4f(p.u_data_uv_bounds as WebGLUniformLocation, dx0, dy0, dx1, dy1);
    gl.uniform1f(p.u_opacity as WebGLUniformLocation, this.opacity);
    const dpr = this.map?.getPixelRatio?.() ?? (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1);
    gl.uniform1f(p.u_spacing as WebGLUniformLocation, this.spacingPx * dpr);
    gl.uniform3f(p.u_color as WebGLUniformLocation, this.color[0], this.color[1], this.color[2]);
    gl.uniform1f(p.u_show_above as WebGLUniformLocation, this.showAbove);
    gl.uniformMatrix4fv(p.u_matrix as WebGLUniformLocation, false, matrix);

    gl.drawArrays(gl.TRIANGLES, 0, this.meshVertexCount);

    if (!prevBlend) gl.disable(gl.BLEND);
    if (prevDepth) gl.enable(gl.DEPTH_TEST);
  }
}
