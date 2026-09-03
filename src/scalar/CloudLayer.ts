/**
 * CloudLayer — Multi-Layer-Bewölkung als MapLibre-Custom-Layer.
 *
 * Wie der `RainLayer` warpt er eine Werte-Textur auf 4 echte Geo-Ecken (Frame-
 * Wechsel = Textur-Upload, kein PNG → flüssiges Slider-Scrubbing) — seit KL8
 * über ein fein unterteiltes Mesh (`quadWarpMesh`), nicht mehr als nacktes
 * 4-Eck-Quad: das Quad wurde linear in Mercator interpoliert, die Textur liegt
 * breiten-linear, über die 14,9° des nativen ICON-D2-Gitters ergab das
 * rechnerisch bis 66 km Versatz (`audit/karten-layer-verortung.md` §14). Anders als
 * der RainLayer ist die Textur aber **3-kanalig**: R = tiefe (CLCL), G = mittlere
 * (CLCM), B = hohe (CLCH) Bewölkung (je 0..1). Der Fragment-Shader komponiert
 * die drei Schichten höhen-bewusst (tief = dicht/grau mit Tiefe, hoch = hell &
 * kühl wie Cirrus) mit echtem Over-Operator → deutlich mehr Struktur/Detail als
 * eine flache Gesamtdecke (CLCT).
 */

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import { bindAttribute, bindTexture, createBuffer, createIndexBuffer, createProgram, type ProgramWrapper } from '../wind/glUtil';
import type { QuadCorners } from './RainLayer';
import { quadWarpMesh, quadWarpRows, warpMeshGeometry, mercatorOf, QUAD_WARP_COLS } from './quadWarpMesh';

// KL9/V-KL-3 (2026-08-27, Jans Go): die Knoten kommen als fertige Mercator-
// Koordinaten (`a_merc`, auf der CPU in double — `mercatorOf`). Vorher rechnete
// der Shader log(tan(π/4 + φ/2)) selbst: GPU-Transzendente in Float32 haben
// ~1e-6 relativen Fehler, auf 40 075 km Weltumfang bis 280 m (gemessen,
// `audit/karten-layer-verortung.md` §15.6). `highp`: ein fp16-mediump würde
// a_merc auf 20 km quantisieren (V-KL-4).
const vert = `
precision highp float;
attribute vec2 a_merc;
attribute vec2 a_uv;
uniform mat4 u_matrix;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = u_matrix * vec4(a_merc, 0.0, 1.0);
}
`;

const frag = `
precision mediump float;
uniform sampler2D u_value;   // R=tief G=mittel B=hoch Bedeckungsgrad (0..1)
uniform float u_opacity;
varying vec2 v_uv;

// Over-Operator (top über bottom), unprämultipliziert.
vec4 over(vec4 top, vec4 bot){
  float a = top.a + bot.a * (1.0 - top.a);
  vec3 c = a > 1e-4 ? (top.rgb * top.a + bot.rgb * bot.a * (1.0 - top.a)) / a : vec3(0.0);
  return vec4(c, a);
}

void main(){
  if (v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0) discard;
  vec3 cov = texture2D(u_value, v_uv).rgb;
  float cl = cov.r, cm = cov.g, ch = cov.b;

  // Tonwerte: dichte tiefe Wolken werden grauer (Tiefe/Schatten), hohe Wolken
  // hell & leicht kühl (Cirrus). Das erzeugt Plastizität → wirkt detaillierter.
  vec3 colLow  = mix(vec3(0.92, 0.93, 0.95), vec3(0.62, 0.65, 0.70), smoothstep(0.35, 1.0, cl));
  vec3 colMid  = vec3(0.90, 0.92, 0.95);
  vec3 colHigh = vec3(0.96, 0.98, 1.00);

  // Alpha aus Bedeckungsgrad mit Kontrast-Kurve (schärfere Kanten als die alte
  // weiche CLCT-Skala). Hohe Wolken bleiben halbtransparent (Cirrus).
  float aLow  = smoothstep(0.05, 0.80, cl) * 0.95;
  float aMid  = smoothstep(0.06, 0.85, cm) * 0.74;
  float aHigh = smoothstep(0.06, 1.00, ch) * 0.45;

  // Komposit von unten (tief) nach oben (hoch) — Aufsicht von oben auf den Stapel.
  vec4 acc = over(vec4(colMid, aMid), vec4(colLow, aLow));
  acc = over(vec4(colHigh, aHigh), acc);
  if (acc.a < 0.012) discard;
  gl_FragColor = vec4(acc.rgb, acc.a * u_opacity);
}
`;

export interface CloudFrameData {
  /** w·h·4 Bytes, north-up. RGBA: R=tief, G=mittel, B=hoch (0..255), A=255. */
  values: Uint8Array;
  width: number;
  height: number;
  corners: QuadCorners;
}

export interface CloudLayerOptions {
  id: string;
  opacity?: number;
}

export class CloudLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  opacity: number;
  private map: MapLibreMap | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program!: ProgramWrapper;
  /** Knoten als Mercator-Paare (`mercatorOf`), Attribut a_merc. */
  private mercBuf: WebGLBuffer | null = null;
  private uvBuf: WebGLBuffer | null = null;
  private indexBuf: WebGLBuffer | null = null;
  private indexCount = 0;
  private indexType: number = 0;
  /** Ecken-Referenz des aktuellen Meshs — nur bei Wechsel wird es neu gebaut. */
  private lastCorners: QuadCorners | null = null;
  private valueTex: WebGLTexture | null = null;
  private ready = false;
  private _pending: CloudFrameData | null = null;

  constructor(options: CloudLayerOptions) {
    this.id = options.id;
    this.opacity = options.opacity ?? 0.95;
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext) {
    this.map = map;
    this.gl = gl;
    this.program = createProgram(gl, vert, frag);
    this.ready = true;
    if (this._pending) { const p = this._pending; this._pending = null; this.setFrame(p); }
  }

  onRemove(_map: MapLibreMap, gl: WebGLRenderingContext) {
    gl.deleteProgram(this.program.program);
    if (this.mercBuf) gl.deleteBuffer(this.mercBuf);
    if (this.uvBuf) gl.deleteBuffer(this.uvBuf);
    if (this.indexBuf) gl.deleteBuffer(this.indexBuf);
    this.mercBuf = null; this.uvBuf = null; this.indexBuf = null; this.lastCorners = null;
    if (this.valueTex) gl.deleteTexture(this.valueTex);
    this.valueTex = null;
    this.ready = false;
  }

  /** Tauscht den angezeigten Frame: RGBA-Werte-Textur hochladen + Ecken setzen. */
  setFrame(frame: CloudFrameData) {
    const gl = this.gl;
    if (!gl || !this.ready) { this._pending = frame; return; }

    // --- Geometrie: fein unterteiltes Mesh (Konvention wie RainLayer.setFrame).
    // Nur neu bauen, wenn sich die Ecken-Referenz ändert; reine Frame-Wechsel
    // (neue Werte, gleiches Gitter) tauschen nur die Textur unten. Der
    // Fusions-Pfad (`uvBoundsToCorners`) liefert je Aufruf neue Ecken und baut
    // deshalb je Frame neu — 33² Knoten, wie vorher das Quad je Frame.
    if (frame.corners !== this.lastCorners || !this.mercBuf || !this.uvBuf) {
      this.lastCorners = frame.corners;
      // Zeilen aus der Zeilenregel (≤ 1 m, §15), Spalten QUAD_WARP_COLS; Knoten =
      // Mesh, uv + Dreiecksliste (NW,NE,SE / NW,SE,SW) indiziert aus der EINEN Stelle.
      const nx = QUAD_WARP_COLS, ny = quadWarpRows(frame.corners);
      const lnglat = quadWarpMesh(frame.corners, nx, ny);
      const { uv, indices } = warpMeshGeometry(nx, ny);
      if (this.mercBuf) gl.deleteBuffer(this.mercBuf);
      this.mercBuf = createBuffer(gl, mercatorOf(lnglat));
      if (this.uvBuf) gl.deleteBuffer(this.uvBuf);
      this.uvBuf = createBuffer(gl, uv);
      if (this.indexBuf) gl.deleteBuffer(this.indexBuf);
      this.indexBuf = createIndexBuffer(gl, indices);
      this.indexCount = indices.length;
      this.indexType = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    }

    if (!this.valueTex) this.valueTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.valueTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, frame.width, frame.height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, frame.values,
    );
    this.map?.triggerRepaint();
  }

  render(gl: WebGLRenderingContext, args: CustomRenderMethodInput | number[] | Float32Array) {
    if (!this.mercBuf || !this.uvBuf || !this.indexBuf || !this.valueTex) return;
    const matrix: Float32List = Array.isArray(args) || args instanceof Float32Array
      ? (args as Float32List)
      : (args.defaultProjectionData.mainMatrix as unknown as Float32List);

    const prevBlend = gl.getParameter(gl.BLEND) as boolean;
    const prevDepth = gl.getParameter(gl.DEPTH_TEST) as boolean;
    const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
    // MapLibre's Custom-Layer-Vertrag: Depth-Test bleibt AN (LEQUAL, per
    // Default) — nur so respektiert dieser Layer opake Layer, die SPÄTER in
    // der Stack-Reihenfolge gezeichnet werden (hier: die Länder-Maske). Ein
    // `disable(DEPTH_TEST)` unterbindet den Depth-Write komplett (WebGL-Spec),
    // wodurch die Maske später nichts mehr zu testen hat und der Layer über
    // die Landesgrenzen hinaus durchscheint (User-Report).
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const p = this.program;
    gl.useProgram(p.program);
    bindAttribute(gl, this.mercBuf, p.a_merc as number, 2);
    bindAttribute(gl, this.uvBuf, p.a_uv as number, 2);
    bindTexture(gl, this.valueTex, 0);
    gl.uniform1i(p.u_value as WebGLUniformLocation, 0);
    gl.uniform1f(p.u_opacity as WebGLUniformLocation, this.opacity);
    gl.uniformMatrix4fv(p.u_matrix as WebGLUniformLocation, false, matrix);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuf);
    gl.drawElements(gl.TRIANGLES, this.indexCount, this.indexType, 0);

    if (!prevBlend) gl.disable(gl.BLEND);
    gl.depthMask(prevDepthMask);
    if (!prevDepth) gl.disable(gl.DEPTH_TEST);
  }
}
