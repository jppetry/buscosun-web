/**
 * Vertrauens-Schleier als MapLibre-Custom-Layer — Kreuzschraffur über den
 * Basis-Layern, deren Dichte/Deckkraft mit der UNSICHERHEIT wächst (1 −
 * confidence). Sichere Zellen bleiben klar, unsichere bekommen ein dichtes
 * Schraffurmuster. Bewusst Muster statt Farbe: liest sich als „Interpretation",
 * nicht als neue Messung, und überlagert den Regen-/Temperatur-Layer, ohne
 * dessen Farben zu verfälschen.
 *
 * Geometrie/Projektion wie {@link ScalarLayer} (Footprint-Mesh, Mercator auf der
 * CPU als Attribut `a_merc` — KL9). Die Werte-Textur trägt im R-Kanal die Confidence (0..1) und
 * im A-Kanal die Datenmaske. Das Schraffurmuster entsteht aus `gl_FragCoord`
 * (Bildschirm-Pixel) → bildschirmstabil, zoom-unabhängig dicht.
 */

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import { bindAttribute, bindTexture, createBuffer, createProgram, createTexture, type ProgramWrapper } from '../wind/glUtil';
import type { ScalarMeta } from './ScalarLayer';
import { equiFootprintMesh, mercatorOf } from './quadWarpMesh';

// KL9/V-KL-3 (2026-08-27, Jans Go): Position aus `a_merc` (CPU-double,
// `mercatorOf`) statt log(tan()) im Shader — GPU-Transzendente lagen bis 280 m
// daneben (`audit/karten-layer-verortung.md` §15.6). `a_lnglat` bleibt für die
// Textur-uv (exakt in Float32: 0,2 m). `highp` gegen fp16-mediump (V-KL-4).
const vert = `
precision highp float;
attribute vec2 a_lnglat;
attribute vec2 a_merc;
uniform mat4 u_matrix;
varying vec2 v_equi_uv;
void main() {
  v_equi_uv = vec2((a_lnglat.x + 180.0) / 360.0, (90.0 - a_lnglat.y) / 180.0);
  gl_Position = u_matrix * vec4(a_merc, 0.0, 1.0);
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
  /** Footprint-Mesh über die Daten-uvBounds (`equiFootprintMesh`, ≤ 1 m) — s. ScalarLayer. */
  private mesh: WebGLBuffer | null = null;
  /** Dieselben Knoten als Mercator-Paare (Attribut a_merc, `mercatorOf`). */
  private mercBuf: WebGLBuffer | null = null;
  private meshVertexCount = 0;
  private meshKey = '';
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
    if (this._pending) { const { image, meta } = this._pending; this._pending = null; this.setData(image, meta); }
  }

  onRemove(_map: MapLibreMap, gl: WebGLRenderingContext) {
    gl.deleteProgram(this.program.program);
    if (this.mesh) gl.deleteBuffer(this.mesh);
    if (this.mercBuf) gl.deleteBuffer(this.mercBuf);
    this.mesh = null; this.mercBuf = null; this.meshKey = '';
    if (this.valueTexture) gl.deleteTexture(this.valueTexture);
  }

  /** Footprint-Mesh statt Weltmesh (Mercator-Rest ≤ 1 m statt 2 km) — s. ScalarLayer.ensureMesh. */
  private ensureMesh(uvBounds: ScalarMeta['uvBounds']) {
    const gl = this.gl!;
    const key = uvBounds.join(',');
    if (this.mesh && key === this.meshKey) return;
    const verts = equiFootprintMesh(uvBounds);
    if (this.mesh) gl.deleteBuffer(this.mesh);
    this.mesh = createBuffer(gl, verts);
    if (this.mercBuf) gl.deleteBuffer(this.mercBuf);
    this.mercBuf = createBuffer(gl, mercatorOf(verts));
    this.meshVertexCount = verts.length / 2;
    this.meshKey = key;
  }

  setData(image: HTMLCanvasElement | HTMLImageElement, meta: ScalarMeta) {
    const gl = this.gl;
    if (!gl) { this._pending = { image, meta }; return; }
    if (this.valueTexture) gl.deleteTexture(this.valueTexture);
    this.valueTexture = createTexture(gl, gl.LINEAR, image);
    this.data = { ...meta, image };
    this.ensureMesh(meta.uvBounds);
    this.map?.triggerRepaint();
  }

  render(gl: WebGLRenderingContext, args: CustomRenderMethodInput | number[] | Float32Array) {
    if (!this.data || !this.valueTexture || !this.mesh || !this.mercBuf) return;
    const matrix: Float32List = Array.isArray(args) || args instanceof Float32Array
      ? (args as Float32List)
      : (args.defaultProjectionData.mainMatrix as unknown as Float32List);

    const prevBlend = gl.getParameter(gl.BLEND) as boolean;
    const prevDepth = gl.getParameter(gl.DEPTH_TEST) as boolean;
    const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
    // MapLibre's Custom-Layer-Vertrag: Depth-Test bleibt AN (LEQUAL, per
    // Default) — nur so respektieren später gezeichnete opake Layer (Länder-
    // Maske) bzw. wird dieser Layer von ihnen respektiert. Ein
    // `disable(DEPTH_TEST)` unterbindet den Depth-Write komplett (WebGL-Spec).
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const p = this.program;
    gl.useProgram(p.program);
    bindAttribute(gl, this.mesh, p.a_lnglat as number, 2);
    bindAttribute(gl, this.mercBuf, p.a_merc as number, 2);
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
    gl.depthMask(prevDepthMask);
    if (!prevDepth) gl.disable(gl.DEPTH_TEST);
  }
}
