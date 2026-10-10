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
  createIndexBuffer,
  createProgram,
  getColorRamp,
  type ProgramWrapper,
} from '../wind/glUtil';
import { warpMeshGeometry, mercatorOf } from './quadWarpMesh';
import { RAIN_EDGE_CODE, RAIN_FILTER_CODE, RADAR_MORPH_MAX_TEXELS, type RainEdge, type RainFilter } from './radarHd';

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

// Bikubische B-Spline-Abtastung der Werte-Textur (statt nur GPU-bilinear):
// glättet die 1-km-Zellstufen weicher, damit das Raster „HD-iger" wirkt — ohne
// echte Mehrinformation. B-Spline-Gewichte sind ALLE nicht-negativ und summieren
// zu 1 → reine konvexe Mischung: kein Überschwingen, keine negativen Werte,
// nichts oberhalb des lokalen Maximums (also kein künstlicher Regen an Kanten).
// 4-Tap-Variante (nutzt die bereits aktive LINEAR-Filterung der Textur).
//
// Phase HD-2 (`audit/radar-hochaufloesung.md` §1.4): der B-Spline geht nicht durch
// die Messwerte — ein Einzeltexel behält an seiner Mitte (4/6)² = 44 %. `u_filter`
// wählt deshalb je Layer: 0 = B-Spline (wie bisher, Voreinstellung), 1 = Catmull-Rom
// 16 Taps an Texelmitten, geklemmt auf Min/Max der inneren 2×2 (interpolierend,
// kein Überschwingen), 2 = bilinear, 3 = nearest. Phase HD-1: `u_mask` (NEAREST,
// 0/255) verwirft Texel, die nach `pickCountry` einem anderen Land gehören.
const frag = `
precision highp float;
uniform sampler2D u_value;        // LUMINANCE: r = mm/h / vMax  (0 = trocken/keine Abdeckung)
uniform sampler2D u_color_ramp;   // 16x16 Farbverlauf (rgba)
uniform sampler2D u_mask;         // HD-1: LUMINANCE 0/255 je Texel (1 = zeichnen), nur mit u_mask_on
uniform float u_opacity;
uniform vec2 u_texsize;           // (Breite, Höhe) der Werte-Textur
uniform int u_filter;             // HD-2: 0 B-Spline · 1 Catmull-Rom geklemmt · 2 bilinear · 3 nearest
uniform float u_mask_on;
varying vec2 v_uv;

vec4 catmullWeights(float t) {
  float t2 = t * t, t3 = t2 * t;
  return vec4((-t3 + 2.0 * t2 - t) * 0.5, (3.0 * t3 - 5.0 * t2 + 2.0) * 0.5, (-3.0 * t3 + 4.0 * t2 + t) * 0.5, (t3 - t2) * 0.5);
}

// HD-4: zweiter Frame + Bewegungsfeld für Zwischenbilder (Morph) — A rückwärts, B vorwärts entlang des Felds verschoben.
uniform sampler2D u_value_b;      // Frame B (gleiche Form wie u_value), nur mit u_morph_on
uniform sampler2D u_flow;         // RG8: (u, v) in [−1, 1] · u_flow_scale Texel je Frame-Intervall, grobes Gitter, LINEAR
uniform float u_morph_on;
uniform float u_frac;             // 0 = Frame A … 1 = Frame B
uniform float u_flow_scale;       // Texel je Einheit der Flusstextur

// Texelwert an der GANZZAHLIGEN Texelkoordinate ij (Mitte = (ij + 0,5)/n; CLAMP_TO_EDGE klemmt den Rand).
float texelAt(sampler2D s, vec2 ij) {
  return texture2D(s, (ij + 0.5) / u_texsize).r;
}

float sampleCatmull(sampler2D sm, vec2 uv) {
  vec2 coord = uv * u_texsize - 0.5;
  vec2 f = fract(coord);
  vec2 i0 = coord - f;
  vec4 wx = catmullWeights(f.x);
  vec4 wy = catmullWeights(f.y);
  float s = 0.0;
  float lo = 1.0, hi = 0.0;
  for (int j = 0; j < 4; j++) {
    float row = 0.0;
    for (int i = 0; i < 4; i++) {
      float t = texelAt(sm, i0 + vec2(float(i) - 1.0, float(j) - 1.0));
      row += wx[i] * t;
      if (i >= 1 && i <= 2 && j >= 1 && j <= 2) { lo = min(lo, t); hi = max(hi, t); }
    }
    s += wy[j] * row;
  }
  return clamp(s, lo, hi);
}

float sampleNearest(sampler2D sm, vec2 uv) {
  return texelAt(sm, floor(uv * u_texsize));
}

vec4 cubicWeights(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  float w = 6.0 - x - y - z;
  return vec4(x, y, z, w) * (1.0 / 6.0);
}

float sampleBicubic(sampler2D sm, vec2 uv) {
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
  float s0 = texture2D(sm, off.xz).r;
  float s1 = texture2D(sm, off.yz).r;
  float s2 = texture2D(sm, off.xw).r;
  float s3 = texture2D(sm, off.yw).r;
  float sx = s.x / (s.x + s.y);
  float sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}

float sampleAny(sampler2D sm, vec2 uv) {
  if (u_filter == 1) return sampleCatmull(sm, uv);
  if (u_filter == 2) return texture2D(sm, uv).r;
  if (u_filter == 3) return sampleNearest(sm, uv);
  return sampleBicubic(sm, uv);
}

// Phase RS (audit/radar-randsaum.md): edge rule. Wet/dry comes from the measured texels, never from the filtered value
// (mixing a wet byte with the 0 of a dry neighbour painted a ring of light-rain classes on the log plane). ind = share of
// wet texels (u_edge 1: bilinear over the inner 2×2; u_edge 2: the texel under the point, 0/1). Dry texels of the 4×4
// neighbourhood take the wet fill (bilinear mean of the wet inner texels) before the filter; Catmull-Rom is clamped to the
// range of the WET inner texels. Returns 0 when no inner texel is wet.
uniform int u_edge;               // 0 = off (path before RS) · 1 = round · 2 = nearest
const float WET = 0.5 / 255.0;
float sampleWet(sampler2D sm, vec2 uv, out float ind) {
  vec2 coord = uv * u_texsize - 0.5;
  vec2 f = fract(coord);
  vec2 i0 = coord - f;
  vec4 v = vec4(texelAt(sm, i0), texelAt(sm, i0 + vec2(1.0, 0.0)), texelAt(sm, i0 + vec2(0.0, 1.0)), texelAt(sm, i0 + vec2(1.0, 1.0)));
  vec4 bw = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  vec4 w = step(WET, v);
  float iw = dot(bw, w);
  float own = sampleNearest(sm, uv);
  ind = u_edge == 2 ? step(WET, own) : iw;
  if (iw <= 0.0) return 0.0;
  if (u_filter == 3) return own;
  float fill = dot(bw * w, v) / iw;
  if (u_filter == 2) return fill;
  vec4 lo4 = mix(vec4(1.0), v, w), hi4 = v * w;
  float lo = min(min(lo4.x, lo4.y), min(lo4.z, lo4.w)), hi = max(max(hi4.x, hi4.y), max(hi4.z, hi4.w));
  vec4 wx = u_filter == 1 ? catmullWeights(f.x) : cubicWeights(f.x);
  vec4 wy = u_filter == 1 ? catmullWeights(f.y) : cubicWeights(f.y);
  float s = 0.0;
  for (int j = 0; j < 4; j++) {
    float row = 0.0;
    for (int i = 0; i < 4; i++) {
      float t = texelAt(sm, i0 + vec2(float(i) - 1.0, float(j) - 1.0));
      row += wx[i] * (t >= WET ? t : fill);
    }
    s += wy[j] * row;
  }
  return u_filter == 1 ? clamp(s, lo, hi) : max(s, 0.0);
}

void main() {
  if (v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0) discard;
  if (u_mask_on > 0.5 && texture2D(u_mask, (floor(v_uv * u_texsize) + 0.5) / u_texsize).r < 0.5) discard;
  float t;
  if (u_edge != 0) {
    float ia, ib;
    if (u_morph_on > 0.5) {
      // the contour moves continuously from A to B (mixed wet share); a side that is dry here never enters the value
      vec2 d = (texture2D(u_flow, v_uv).rg * 2.0 - 1.0) * u_flow_scale / u_texsize;
      float ta = sampleWet(u_value, v_uv - u_frac * d, ia);
      float tb = sampleWet(u_value_b, v_uv + (1.0 - u_frac) * d, ib);
      if (mix(ia, ib, u_frac) < 0.5) discard;
      t = ta > 0.0 && tb > 0.0 ? mix(ta, tb, u_frac) : max(ta, tb);
    } else {
      t = sampleWet(u_value, v_uv, ia);
      if (ia < 0.5) discard;
    }
  } else if (u_morph_on > 0.5) {
    // HD-4: Verschiebung (Texel) aus dem Bewegungsfeld an dieser Stelle; A um −frac, B um +(1 − frac) versetzt lesen.
    vec2 d = (texture2D(u_flow, v_uv).rg * 2.0 - 1.0) * u_flow_scale / u_texsize;
    float ta = sampleAny(u_value, v_uv - u_frac * d);
    float tb = sampleAny(u_value_b, v_uv + (1.0 - u_frac) * d);
    t = mix(ta, tb, u_frac);
  } else {
    t = sampleAny(u_value, v_uv);
  }
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
   * Optionales fein unterteiltes Warp-Mesh: (warpN+1)·(warpRows+1) lon/lat-Paare,
   * Index `(j*(warpN+1)+i)*2`, i = u (West→Ost), j = v (Nord→Süd). Wenn gesetzt,
   * rendert der Layer ein Mesh statt des linearen 4-Eck-Quads — nötig für
   * projektionskorrekte Verortung gekrümmter Gitter (RADOLAN DE1200, sonst bis
   * ~40 km) UND für jedes lat/lon-Gitter mit Breitenspanne (Mercator-Interpolation,
   * `quadWarpMesh.ts`; das Komposit-Quad lag 29 km daneben). Ohne Mesh: Quad.
   */
  warpLnglat?: Float32Array;
  /** Spalten des Meshs. */
  warpN?: number;
  /** Zeilen des Meshs; Default = `warpN` (quadratisch — projizierte Gitter). */
  warpRows?: number;
  /**
   * Phase HD-1: Besitz-Maske, `width·height` Bytes, 1 = Texel zeichnen (gehört nach `pickCountry` diesem Land), 0 =
   * verwerfen (`radarCountryMask.ts`). Wird nur bei neuer Referenz hochgeladen; ohne Maske zeichnet der Layer alles.
   */
  mask?: Uint8Array | null;
}

export interface RainLayerOptions {
  id: string;
  colorRamp: Record<number, string>;
  opacity?: number;
  /** Phase HD-2: Abtastung zwischen den Texelmitten; Voreinstellung `bspline` = Stand vor HD (byte-gleich). */
  filter?: RainFilter;
  /** Phase RS: edge rule (`audit/radar-randsaum.md`); default `off` = the path before RS. */
  edge?: RainEdge;
}

/**
 * Phase HD-4: Bewegungsfeld auf einem GROBEN Gitter (`w × h`), Werte in NATIVEN Texeln je Frame-Intervall (Frame A → B),
 * x nach Osten (Spalten), y nach Süden (Zeilen) — die Konvention von `estimateFlowHS` auf dem north-up-Werte-Grid.
 */
export interface RainFlow { u: Float32Array; v: Float32Array; w: number; h: number }
/** Phase HD-4: Morph-Auftrag — Frame B (gleiche Form wie der gesetzte Frame A), Fluss, Anteil 0…1. */
export interface RainMorph { b: Uint8Array; flow: RainFlow; frac: number }

export class RainLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  opacity: number;
  /** HD-2: aktive Abtastung (`setFilter`). */
  filter: RainFilter;
  /** Phase RS: active edge rule (`setEdge`). */
  edge: RainEdge;
  private colorRampStops: Record<number, string>;
  private map: MapLibreMap | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program!: ProgramWrapper;
  /** Knoten als Mercator-Paare (`mercatorOf`), Attribut a_merc. */
  private mercBuf: WebGLBuffer | null = null;
  private uvBuf: WebGLBuffer | null = null;
  private valueTex: WebGLTexture | null = null;
  /** HD-1: Masken-Textur (NEAREST) und die Referenz, die sie trägt. */
  private maskTex: WebGLTexture | null = null;
  private maskRef: Uint8Array | null = null;
  /** HD-4: Frame B + Flusstextur des Morphs; `morph` = aktueller Auftrag (null = aus). */
  private valueTexB: WebGLTexture | null = null;
  private flowTex: WebGLTexture | null = null;
  private morph: RainMorph | null = null;
  private morphRefs: { b: Uint8Array | null; flow: RainFlow | null } = { b: null, flow: null };
  private colorRampTex!: WebGLTexture;
  private ready = false;
  private _pending: RainFrameData | null = null;
  /** Dimensionen der aktuellen Werte-Textur (für die bikubische Abtastung). */
  private texW = 1;
  private texH = 1;
  /** Index-Puffer (Dreiecksliste über die Knoten — 6 Indizes für das Quad,
   *  nx·ny·6 für das Warp-Mesh; Uint32 ab 65 537 Knoten, WebGL2-Kern). */
  private indexBuf: WebGLBuffer | null = null;
  private indexCount = 0;
  private indexType: number = 0;
  /** Geometrie nur neu bauen, wenn sich das Gitter ändert (Mesh-/Ecken-Referenz). */
  private lastGeomKey: unknown = null;

  constructor(options: RainLayerOptions) {
    this.id = options.id;
    this.opacity = options.opacity ?? 0.85;
    this.filter = options.filter ?? 'bspline';
    this.edge = options.edge ?? 'off';
    this.colorRampStops = options.colorRamp;
  }

  /** HD-2: Abtastung zur Laufzeit wechseln (ein Uniform, kein Upload). */
  setFilter(filter: RainFilter) {
    this.filter = filter;
    this.map?.triggerRepaint();
  }

  /** Phase RS: edge rule at runtime (one uniform, no upload). */
  setEdge(edge: RainEdge) {
    this.edge = edge;
    this.map?.triggerRepaint();
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext) {
    this.map = map;
    this.gl = gl;
    this.program = createProgram(gl, vert, frag);
    // Geometrie (merc + uv + Indizes) wird in setFrame gebaut — Quad oder Warp-Mesh.
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
    if (this.mercBuf) gl.deleteBuffer(this.mercBuf);
    if (this.uvBuf) gl.deleteBuffer(this.uvBuf);
    if (this.indexBuf) gl.deleteBuffer(this.indexBuf);
    this.mercBuf = null; this.uvBuf = null; this.indexBuf = null; this.lastGeomKey = null;
    if (this.valueTex) gl.deleteTexture(this.valueTex);
    this.valueTex = null;
    if (this.maskTex) gl.deleteTexture(this.maskTex);
    this.maskTex = null; this.maskRef = null;
    if (this.valueTexB) gl.deleteTexture(this.valueTexB);
    if (this.flowTex) gl.deleteTexture(this.flowTex);
    this.valueTexB = null; this.flowTex = null; this.morph = null; this.morphRefs = { b: null, flow: null };
    gl.deleteTexture(this.colorRampTex);
    this.ready = false;
  }

  /**
   * HD-4: Zwischenbild zwischen dem gesetzten Frame A (`setFrame`) und Frame B entlang des Bewegungsfelds — `null`
   * schaltet den Morph aus (Frame A allein, wie ohne HD-4). Frame B und Fluss werden nur bei neuer Referenz hochgeladen,
   * ein reiner `frac`-Wechsel ist ein Uniform. Form von B muss der von A gleichen, sonst wird der Auftrag verworfen.
   */
  setMorph(morph: RainMorph | null) {
    const gl = this.gl;
    if (!gl || !this.ready) { this.morph = morph; return; }
    if (morph && morph.b.length !== this.texW * this.texH) morph = null;
    this.morph = morph;
    if (!morph) { this.map?.triggerRepaint(); return; }
    if (morph.b !== this.morphRefs.b) {
      this.morphRefs.b = morph.b;
      if (!this.valueTexB) this.valueTexB = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.valueTexB);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, this.texW, this.texH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, morph.b);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    }
    if (morph.flow !== this.morphRefs.flow) {
      this.morphRefs.flow = morph.flow;
      if (!this.flowTex) this.flowTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.flowTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, morph.flow.w, morph.flow.h, 0, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, encodeFlow(morph.flow));
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    }
    this.map?.triggerRepaint();
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
    if (geomKey !== this.lastGeomKey || !this.mercBuf) {
      this.lastGeomKey = geomKey;
      let lnglat: Float32Array, uv: Float32Array, indices: Uint16Array | Uint32Array;
      if (frame.warpLnglat && frame.warpN) {
        // Knoten = das Mesh selbst (indiziert, nicht expandiert: 320² expandiert
        // wären 9,8 MB); uv + Dreiecksliste (NW,NE,SE / NW,SE,SW) aus der EINEN
        // Stelle `warpMeshGeometry` — Konvention wie das Quad, uv(0,0) = NW.
        const nx = frame.warpN, ny = frame.warpRows ?? frame.warpN;
        if (frame.warpLnglat.length !== (nx + 1) * (ny + 1) * 2) {
          throw new Error(`RainLayer: warpLnglat hat ${frame.warpLnglat.length / 2} Knoten, erwartet ${(nx + 1) * (ny + 1)} (${nx}×${ny})`);
        }
        lnglat = frame.warpLnglat;
        ({ uv, indices } = warpMeshGeometry(nx, ny));
      } else {
        const [nw, ne, se, sw] = frame.corners;
        lnglat = new Float32Array([nw[0], nw[1], ne[0], ne[1], se[0], se[1], sw[0], sw[1]]);
        uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
        indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
      }
      if (this.mercBuf) gl.deleteBuffer(this.mercBuf);
      this.mercBuf = createBuffer(gl, mercatorOf(lnglat));
      if (this.uvBuf) gl.deleteBuffer(this.uvBuf);
      this.uvBuf = createBuffer(gl, uv);
      if (this.indexBuf) gl.deleteBuffer(this.indexBuf);
      this.indexBuf = createIndexBuffer(gl, indices);
      this.indexCount = indices.length;
      this.indexType = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
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
    // HD-1: Maske nur bei neuer Referenz hochladen (NEAREST — exakter Texelbesitz, keine Mischung am Rand).
    const mask = frame.mask ?? null;
    if (mask !== this.maskRef) {
      this.maskRef = mask;
      if (mask) {
        if (!this.maskTex) this.maskTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        const bytes = new Uint8Array(mask.length);
        for (let i = 0; i < mask.length; i++) bytes[i] = mask[i] ? 255 : 0;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, frame.width, frame.height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
      }
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); // Default wiederherstellen (MapLibre)
    this.map?.triggerRepaint();
  }

  render(gl: WebGLRenderingContext, args: CustomRenderMethodInput | number[] | Float32Array) {
    if (!this.mercBuf || !this.uvBuf || !this.valueTex) return;
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
    bindTexture(gl, this.colorRampTex, 1);
    // HD-1: Einheit 2 trägt die Maske — ohne Maske die Werte-Textur (nie eine unvollständige Textur am Sampler).
    const maskOn = !!(this.maskRef && this.maskTex);
    bindTexture(gl, maskOn ? this.maskTex! : this.valueTex, 2);
    gl.uniform1i(p.u_value as WebGLUniformLocation, 0);
    gl.uniform1i(p.u_color_ramp as WebGLUniformLocation, 1);
    gl.uniform1i(p.u_mask as WebGLUniformLocation, 2);
    gl.uniform1f(p.u_mask_on as WebGLUniformLocation, maskOn ? 1 : 0);
    gl.uniform1i(p.u_filter as WebGLUniformLocation, RAIN_FILTER_CODE[this.filter]);
    gl.uniform1i(p.u_edge as WebGLUniformLocation, RAIN_EDGE_CODE[this.edge]);
    // HD-4: Einheiten 3/4 tragen Frame B und den Fluss — ohne Morph die Werte-Textur (nie eine unvollständige Textur).
    const morphOn = !!(this.morph && this.valueTexB && this.flowTex && this.morphRefs.b === this.morph.b);
    bindTexture(gl, morphOn ? this.valueTexB! : this.valueTex, 3);
    bindTexture(gl, morphOn ? this.flowTex! : this.valueTex, 4);
    gl.uniform1i(p.u_value_b as WebGLUniformLocation, 3);
    gl.uniform1i(p.u_flow as WebGLUniformLocation, 4);
    gl.uniform1f(p.u_morph_on as WebGLUniformLocation, morphOn ? 1 : 0);
    gl.uniform1f(p.u_frac as WebGLUniformLocation, morphOn ? Math.max(0, Math.min(1, this.morph!.frac)) : 0);
    gl.uniform1f(p.u_flow_scale as WebGLUniformLocation, RADAR_MORPH_MAX_TEXELS);
    gl.uniform1f(p.u_opacity as WebGLUniformLocation, this.opacity);
    gl.uniform2f(p.u_texsize as WebGLUniformLocation, this.texW, this.texH);
    gl.uniformMatrix4fv(p.u_matrix as WebGLUniformLocation, false, matrix);

    // MapLibre löst vor Custom-Layern sein VAO (`unbindVAO`) und markiert den
    // Kontext danach als dirty — die ELEMENT_ARRAY_BUFFER-Bindung bleibt lokal.
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuf);
    gl.drawElements(gl.TRIANGLES, this.indexCount, this.indexType, 0);

    if (!prevBlend) gl.disable(gl.BLEND);
    gl.depthMask(prevDepthMask);
    if (!prevDepth) gl.disable(gl.DEPTH_TEST);
  }
}

/**
 * HD-4: Fluss (native Texel je Intervall) → LUMINANCE_ALPHA-Bytes, u = L, v = A, je in [−MAX, MAX] auf 0…255
 * (Nullpunkt 127,5 → im Shader `· 2 − 1`). Rein, für den Verifier nachrechenbar.
 */
export function encodeFlow(flow: RainFlow): Uint8Array {
  const out = new Uint8Array(flow.w * flow.h * 2);
  const q = (x: number) => { const c = x < -RADAR_MORPH_MAX_TEXELS ? -RADAR_MORPH_MAX_TEXELS : x > RADAR_MORPH_MAX_TEXELS ? RADAR_MORPH_MAX_TEXELS : x; return Math.round(((c / RADAR_MORPH_MAX_TEXELS) + 1) * 127.5); };
  for (let i = 0; i < flow.w * flow.h; i++) { out[i * 2] = q(flow.u[i]); out[i * 2 + 1] = q(flow.v[i]); }
  return out;
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

// Phase HD-3 (`audit/radar-hochaufloesung.md` §5): die zweite, LOGARITHMISCHE Ebene des Spiegels
// (`g<lead>.png`, Kanal 2) — 0,06 … 200 mm/h in 254 Stufen (3,2 % je Stufe), damit Starkregen über 20 mm/h
// nicht mehr auf einen Wert fällt. Dieselbe Trocken-Schwelle wie `precipToU8` (0 ⇔ 0): die Masken beider
// Ebenen sind gleich. Kanal 1 bleibt der `precipToU8`-Byte, byte-gleich zu v1 — alle Verbraucher lesen ihn weiter.
export const PRECIP_LOG_MIN = 0.06;
export const PRECIP_LOG_MAX = 200;
export const PRECIP_LOG_STEPS = 254;
const LOG_SPAN = Math.log(PRECIP_LOG_MAX / PRECIP_LOG_MIN);

/**
 * Phase RG (`audit/radar-regenschwelle.md` §6, V-RG-7): Toleranz an der Untergrenze. Die nativen RV-Werte liegen als
 * Float32 vor, und 0,06 ist dort 0,0599999986 — ohne Toleranz fiele genau die gemessene Schwellenstufe (5 · 0,012 mm/h)
 * aus dem Bild. 1e-6 liegt weit unter jeder Quellstufe (0,01 / 0,012 / 0,04 mm/h); kein heute gespiegelter Wert liegt in
 * (0,06 − 1e-6, 0,06), die bestehenden Produkte bleiben byte-gleich (`verify:radar-threshold` B4, `verify:radar-hd` F).
 */
export const PRECIP_LOG_EPS = 1e-6;

/** mm/h → Uint8 logarithmisch (0 = trocken, 1 = 0,06 mm/h … 255 = 200 mm/h). */
export function precipToU8Log(mmph: number): number {
  if (!(mmph >= PRECIP_LOG_MIN - PRECIP_LOG_EPS)) return 0;
  const u = 1 + Math.round((PRECIP_LOG_STEPS * Math.log(mmph / PRECIP_LOG_MIN)) / LOG_SPAN);
  return u < 1 ? 1 : u > 255 ? 255 : u;
}

/** Umkehrung von {@link precipToU8Log}: Stufenmitte in mm/h (0 für 0). */
export function precipFromU8Log(u: number): number {
  if (!(u >= 1)) return 0;
  return PRECIP_LOG_MIN * Math.exp((LOG_SPAN * (Math.min(255, u) - 1)) / PRECIP_LOG_STEPS);
}

/**
 * Farbskala für die Log-Ebene. Ab 0,5 mm/h dieselben Farben an denselben mm/h wie `precipRainRamp` (die Stützen wandern
 * nur auf ihre Log-Position — der Rückfall auf den v1-Byte wechselt dort die Farbe nicht), darüber die Starkregen-Stufen
 * 30 / 50 / 100 / 200 mm/h (`set`, E-HD-4).
 *
 * E-HD-6 (Jan 08.10.2026, „verfeinere die Farbskala auf der Log-Ebene"): der leichte Regen 0,06 … 0,5 mm/h — auf dem
 * v1-Byte sechs Werte, auf der Log-Ebene 66 Stufen — bekommt sechs abgestufte Stützen statt zwei fast gleicher Blautöne
 * (vorher 0,06 und 0,2 mm/h beide α 0,59; ein Landregen-Gebiet war EINE Fläche): Helligkeit und Deckkraft steigen mit
 * der Rate (über der Basiskarte ΔE ≥ 5 je Schritt, L* streng fallend — `verify:radar-hd` F3b). Die Stützen zwischen
 * 0,5 und 20 mm/h bleiben, weil die Rampe dazwischen ohnehin linear verläuft (zusätzliche Stützen auf der Geraden
 * änderten nichts). `set` — Farben nach Augenmaß, kein Messwert.
 */
export const PRECIP_LOG_RAMP_LIGHT_STOPS = 6; // Stützen in 0,06 … 0,5 mm/h (für den Verifier)
export const precipRainRampLog: Record<number, string> = Object.fromEntries([
  [0, 'rgba(196,224,250,0)'],
  [0.06, 'rgba(196,224,250,0.42)'],
  [0.1, 'rgba(170,210,247,0.52)'],
  [0.15, 'rgba(142,194,243,0.60)'],
  [0.2, 'rgba(114,174,238,0.66)'],
  [0.3, 'rgba(84,148,230,0.72)'],
  [0.5, 'rgba(50,120,220,0.78)'],
  [1, 'rgba(40,175,230,0.78)'],
  [2, 'rgba(60,200,120,0.90)'],
  [3, 'rgba(200,215,60,0.90)'],
  [5, 'rgba(240,150,50,0.90)'],
  [8, 'rgba(228,75,55,0.90)'],
  [12, 'rgba(190,40,95,0.90)'],
  [20, 'rgba(150,40,140,0.90)'],
  [30, 'rgba(110,30,170,0.92)'],
  [50, 'rgba(80,20,190,0.94)'],
  [100, 'rgba(190,130,255,0.96)'],
  [200, 'rgba(255,255,255,0.98)'],
].map(([mm, c]) => [mm === 0 ? 0 : precipToU8Log(mm as number) / 255, c as string]));

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

/** Obergrenze der CAPE-Quantisierung (J/kg) — DACH-Extremkonvektion liegt
 *  darunter. Hier statt in iconD2Cape.ts, damit gribGridDecode.ts (Worker-
 *  fähig) sie ohne Zyklus über iconD2Precip.ts importieren kann. */
export const CAPE_MAX = 4000;

/** CAPE (J/kg) → Uint8 (0 = keine Labilität, sonst J/kg ÷ CAPE_MAX · 255). */
export function capeToU8(v: number): number {
  if (!(v > 0)) return 0;
  const u = Math.round((v / CAPE_MAX) * 255);
  return u < 0 ? 0 : u > 255 ? 255 : u;
}
