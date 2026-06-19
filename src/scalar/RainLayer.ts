/**
 * RainLayer — Niederschlags-Overlay als MapLibre-Custom-Layer.
 *
 * Warum nicht der generische `ScalarLayer`? Der mappt die Werte-Textur über
 * achsparallele `uvBounds` (Rechteck in equirektangulär). RADOLAN-RV liegt
 * aber auf einem polar-stereografischen Gitter, dessen WGS84-Footprint ein
 * **Trapez** ist (Nordkante breiter als Südkante) — ein Rechteck würde es um
 * Dutzende km verschieben. Stattdessen warpt dieser Layer die Textur auf die
 * **4 echten Geo-Ecken** (wie eine MapLibre-`image`-Source), tauscht den Frame
 * aber per Textur-Upload statt PNG-Decode → sofortiges Slider-Scrubbing.
 *
 * Die Werte-Textur ist 1-kanalig (LUMINANCE): r = mm/h ÷ `vMax` (0..1). Die
 * Farbskala (inkl. intensitätsabhängigem Alpha) liegt im Fragment-Shader, also
 * kostet ein Frame-Wechsel nur einen ~1-MB-Textur-Upload, kein PNG.
 */

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import {
  bindAttribute,
  bindTexture,
  createBuffer,
  createProgram,
  getColorRamp,
  type ProgramWrapper,
} from '../wind/glUtil';

const vert = `
precision mediump float;
attribute vec2 a_lnglat;
attribute vec2 a_uv;
uniform mat4 u_matrix;
varying vec2 v_uv;
const float PI = 3.14159265358979323846;
void main() {
  v_uv = a_uv;
  float lat_rad = a_lnglat.y * PI / 180.0;
  float mx = (a_lnglat.x + 180.0) / 360.0;
  float my = 0.5 - log(tan(PI * 0.25 + lat_rad * 0.5)) / (2.0 * PI);
  gl_Position = u_matrix * vec4(mx, my, 0.0, 1.0);
}
`;

// Bikubische B-Spline-Abtastung der Werte-Textur (statt nur GPU-bilinear):
// glättet die 1-km-Zellstufen weicher, damit das Raster „HD-iger" wirkt — ohne
// echte Mehrinformation. B-Spline-Gewichte sind ALLE nicht-negativ und summieren
// zu 1 → reine konvexe Mischung: kein Überschwingen, keine negativen Werte,
// nichts oberhalb des lokalen Maximums (also kein künstlicher Regen an Kanten).
// 4-Tap-Variante (nutzt die bereits aktive LINEAR-Filterung der Textur).
const frag = `
precision highp float;
uniform sampler2D u_value;        // LUMINANCE: r = mm/h / vMax  (0 = trocken/keine Abdeckung)
uniform sampler2D u_color_ramp;   // 16x16 Farbverlauf (rgba)
uniform float u_opacity;
uniform vec2 u_texsize;           // (Breite, Höhe) der Werte-Textur
varying vec2 v_uv;

vec4 cubicWeights(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  float w = 6.0 - x - y - z;
  return vec4(x, y, z, w) * (1.0 / 6.0);
}

float sampleBicubic(vec2 uv) {
  vec2 texSize = u_texsize;
  vec2 invTex = 1.0 / texSize;
  vec2 coord = uv * texSize - 0.5;
  vec2 fxy = fract(coord);
  coord -= fxy;
  vec4 xw = cubicWeights(fxy.x);
  vec4 yw = cubicWeights(fxy.y);
  vec4 c = coord.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xw.xz + xw.yw, yw.xz + yw.yw);
  vec4 off = c + vec4(xw.yw, yw.yw) / s;
  off *= invTex.xxyy;
  float s0 = texture2D(u_value, off.xz).r;
  float s1 = texture2D(u_value, off.yz).r;
  float s2 = texture2D(u_value, off.xw).r;
  float s3 = texture2D(u_value, off.yw).r;
  float sx = s.x / (s.x + s.y);
  float sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}

void main() {
  if (v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0) discard;
  float t = sampleBicubic(v_uv);
  if (t < 0.002) discard; // 0 = trocken oder außerhalb der Abdeckung
  vec2 rp = vec2(fract(16.0 * t), floor(16.0 * t) / 16.0);
  vec4 c = texture2D(u_color_ramp, rp);
  gl_FragColor = vec4(c.rgb, c.a * u_opacity);
}
`;

/** Eck-Reihenfolge wie MapLibre-image-Source: [NW, NE, SE, SW]. */
export type QuadCorners = [
  [number, number], [number, number], [number, number], [number, number],
];

export interface RainFrameData {
  /** 1 Byte/Zelle, north-up. 0 = transparent, 1..255 = mm/h ÷ vMax · 255. */
  values: Uint8Array;
  width: number;
  height: number;
  corners: QuadCorners;
  /**
   * Optionales fein unterteiltes Warp-Mesh: (warpN+1)² lon/lat-Paare, Index
   * `(j*(warpN+1)+i)*2`, i = u (West→Ost), j = v (Nord→Süd). Wenn gesetzt, rendert
   * der Layer ein gekrümmtes Mesh statt des linearen 4-Eck-Quads — nötig für
   * projektionskorrekte Verortung gekrümmter Gitter (z. B. polar-stereografisches
   * RADOLAN DE1200, sonst bis ~40 km Versatz). Ohne Mesh: 4-Eck-Quad wie bisher.
   */
  warpLnglat?: Float32Array;
  warpN?: number;
}

export interface RainLayerOptions {
  id: string;
  colorRamp: Record<number, string>;
  opacity?: number;
}

export class RainLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  opacity: number;
  private colorRampStops: Record<number, string>;
  private map: MapLibreMap | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program!: ProgramWrapper;
  private lnglatBuf: WebGLBuffer | null = null;
  private uvBuf: WebGLBuffer | null = null;
  private valueTex: WebGLTexture | null = null;
  private colorRampTex!: WebGLTexture;
  private ready = false;
  private _pending: RainFrameData | null = null;
  /** Dimensionen der aktuellen Werte-Textur (für die bikubische Abtastung). */
  private texW = 1;
  private texH = 1;
  /** Anzahl der zu zeichnenden Vertices (6 für das Quad, N·N·6 für das Warp-Mesh). */
  private vertexCount = 6;
  /** Geometrie nur neu bauen, wenn sich das Gitter ändert (Mesh-/Ecken-Referenz). */
  private lastGeomKey: unknown = null;

  constructor(options: RainLayerOptions) {
    this.id = options.id;
    this.opacity = options.opacity ?? 0.85;
    this.colorRampStops = options.colorRamp;
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext) {
    this.map = map;
    this.gl = gl;
    this.program = createProgram(gl, vert, frag);
    // Geometrie (lnglat + uv) wird in setFrame gebaut — Quad oder Warp-Mesh.
    const ramp = getColorRamp(this.colorRampStops);
    this.colorRampTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.colorRampTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 16, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, ramp);
    this.ready = true;
    if (this._pending) { const p = this._pending; this._pending = null; this.setFrame(p); }
  }

  onRemove(_map: MapLibreMap, gl: WebGLRenderingContext) {
    gl.deleteProgram(this.program.program);
    if (this.lnglatBuf) gl.deleteBuffer(this.lnglatBuf);
    if (this.uvBuf) gl.deleteBuffer(this.uvBuf);
    if (this.valueTex) gl.deleteTexture(this.valueTex);
    gl.deleteTexture(this.colorRampTex);
    this.ready = false;
  }

  /**
   * Tauscht die Farbskala zur Laufzeit (ohne Frame-Neuladen) — für Paletten-
   * /Akkumulations-Wechsel des Regenradars. Re-uploadet die 16×16-Ramp-Textur.
   */
  setColorRamp(stops: Record<number, string>) {
    this.colorRampStops = stops;
    const gl = this.gl;
    if (!gl || !this.ready || !this.colorRampTex) return;
    const ramp = getColorRamp(stops);
    gl.bindTexture(gl.TEXTURE_2D, this.colorRampTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 16, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, ramp);
    this.map?.triggerRepaint();
  }

  /** Tauscht den angezeigten Frame: lädt die Werte-Textur hoch + setzt die Ecken. */
  setFrame(frame: RainFrameData) {
    const gl = this.gl;
    if (!gl || !this.ready) { this._pending = frame; return; }

    // --- Geometrie: feines Warp-Mesh (projektionskorrekt) ODER 4-Eck-Quad ---
    // Nur neu bauen, wenn sich das Gitter ändert (Mesh-/Ecken-Referenz); reine
    // Frame-Wechsel (neue Werte, gleiches Gitter) tauschen nur die Textur unten.
    const geomKey = frame.warpLnglat ?? frame.corners;
    if (geomKey !== this.lastGeomKey || !this.lnglatBuf) {
      this.lastGeomKey = geomKey;
      let lnglat: Float32Array, uv: Float32Array;
      if (frame.warpLnglat && frame.warpN) {
        const N = frame.warpN, V = frame.warpLnglat, stride = N + 1;
        lnglat = new Float32Array(N * N * 6 * 2);
        uv = new Float32Array(N * N * 6 * 2);
        let p = 0;
        const put = (i: number, j: number) => {
          const k = (j * stride + i) * 2;
          lnglat[p] = V[k]; lnglat[p + 1] = V[k + 1];
          uv[p] = i / N; uv[p + 1] = j / N;
          p += 2;
        };
        // je Gitterzelle 2 Dreiecke (NW,NE,SE / NW,SE,SW) — uv-Konvention wie das Quad.
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          put(i, j); put(i + 1, j); put(i + 1, j + 1);
          put(i, j); put(i + 1, j + 1); put(i, j + 1);
        }
        this.vertexCount = N * N * 6;
      } else {
        const [nw, ne, se, sw] = frame.corners;
        lnglat = new Float32Array([nw[0], nw[1], ne[0], ne[1], se[0], se[1], nw[0], nw[1], se[0], se[1], sw[0], sw[1]]);
        uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
        this.vertexCount = 6;
      }
      if (this.lnglatBuf) gl.deleteBuffer(this.lnglatBuf);
      this.lnglatBuf = createBuffer(gl, lnglat);
      if (this.uvBuf) gl.deleteBuffer(this.uvBuf);
      this.uvBuf = createBuffer(gl, uv);
    }

    // 1-kanalige Werte-Textur (LUMINANCE). UNPACK_ALIGNMENT=1, da Zeilenbreite
    // (z.B. 1215) kein Vielfaches von 4 ist.
    this.texW = frame.width;
    this.texH = frame.height;
    if (!this.valueTex) this.valueTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.valueTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.LUMINANCE, frame.width, frame.height, 0,
      gl.LUMINANCE, gl.UNSIGNED_BYTE, frame.values,
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); // Default wiederherstellen (MapLibre)
    this.map?.triggerRepaint();
  }

  render(gl: WebGLRenderingContext, args: CustomRenderMethodInput | number[] | Float32Array) {
    if (!this.lnglatBuf || !this.uvBuf || !this.valueTex) return;
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
    bindAttribute(gl, this.lnglatBuf, p.a_lnglat as number, 2);
    bindAttribute(gl, this.uvBuf, p.a_uv as number, 2);
    bindTexture(gl, this.valueTex, 0);
    bindTexture(gl, this.colorRampTex, 1);
    gl.uniform1i(p.u_value as WebGLUniformLocation, 0);
    gl.uniform1i(p.u_color_ramp as WebGLUniformLocation, 1);
    gl.uniform1f(p.u_opacity as WebGLUniformLocation, this.opacity);
    gl.uniform2f(p.u_texsize as WebGLUniformLocation, this.texW, this.texH);
    gl.uniformMatrix4fv(p.u_matrix as WebGLUniformLocation, false, matrix);

    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);

    if (!prevBlend) gl.disable(gl.BLEND);
    if (prevDepth) gl.enable(gl.DEPTH_TEST);
  }
}

/**
 * Niederschlags-Farbskala für RainLayer (normalisiert gegen PRECIP_VMAX mm/h),
 * nachgebildet aus der bisherigen `precipColor`-Skala inkl. intensitäts-
 * abhängigem Alpha — hellblau (Niesel) → blau → grün → gelb → orange → rot →
 * magenta.
 */
export const PRECIP_VMAX = 20; // mm/h am oberen Ende der Skala
export const precipRainRamp: Record<number, string> = {
  0.0:   'rgba(150,200,245,0)',
  0.003: 'rgba(150,200,245,0.59)', // 0,06 mm/h
  0.01:  'rgba(95,165,235,0.59)',  // 0,2
  0.025: 'rgba(50,120,220,0.78)',  // 0,5
  0.05:  'rgba(40,175,230,0.78)',  // 1
  0.1:   'rgba(60,200,120,0.90)',  // 2
  0.15:  'rgba(200,215,60,0.90)',  // 3
  0.25:  'rgba(240,150,50,0.90)',  // 5
  0.4:   'rgba(228,75,55,0.90)',   // 8
  0.6:   'rgba(190,40,95,0.90)',   // 12
  1.0:   'rgba(150,40,140,0.90)',  // 20
};

/** mm/h → Uint8 (0 = transparent, sonst mm/h ÷ PRECIP_VMAX · 255, min. 1). */
export function precipToU8(mmph: number): number {
  if (!(mmph >= 0.06)) return 0; // NaN, ≤0 oder unter Schwelle → transparent
  const t = mmph / PRECIP_VMAX;
  return Math.max(1, Math.min(255, Math.round(t * 255)));
}

/**
 * Wolken-Farbskala (Bewölkungsgrad % → weiß/grau, Alpha steigt mit dem Grad).
 * Wird vom Wolken-RainLayer genutzt (ICON-D2 CLCT/CLCL/CLCM/CLCH).
 */
export const CLOUD_VMAX = 100; // % am oberen Ende
export const cloudRamp: Record<number, string> = {
  0.0:  'rgba(255,255,255,0)',
  0.05: 'rgba(250,251,253,0.10)',
  0.25: 'rgba(245,247,250,0.32)',
  0.5:  'rgba(238,241,246,0.55)',
  0.75: 'rgba(232,236,242,0.74)',
  1.0:  'rgba(238,241,247,0.90)',
};

/** Bewölkungsgrad % → Uint8 (0 = klar/transparent, sonst % ÷ 100 · 255, min. 1). */
export function cloudToU8(pct: number): number {
  if (!(pct >= 3)) return 0; // NaN oder < 3 % → transparent (klarer Himmel)
  return Math.max(1, Math.min(255, Math.round(pct / CLOUD_VMAX * 255)));
}
