/**
 * Generic scalar heatmap as a MapLibre custom layer.
 * Reuses the wind-heatmap mesh approach: a footprint mesh over the data bounds
 * (`equiFootprintMesh`, lon/lat for the texture uv + CPU-projected Mercator for
 * the position — KL9), fragment shader samples a normalised value from a
 * 1-channel (R) texture and looks it up in a color-ramp gradient.
 *
 * Used for temperature_2m and cloud_cover layers.
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
} from '../wind/glUtil';
import { equiFootprintMesh, mercatorOf } from './quadWarpMesh';

// KL9/V-KL-3 (2026-08-27, Jans Go): Position aus `a_merc` (CPU-double,
// `mercatorOf`) statt log(tan()) im Shader — GPU-Transzendente lagen bis 280 m
// daneben (`audit/karten-layer-verortung.md` §15.6). `a_lnglat` bleibt für die
// Textur-uv (exakt in Float32: 0,2 m). `highp` gegen fp16-mediump (V-KL-4).
const meshVert = `
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

const meshFrag = `
precision mediump float;
uniform sampler2D u_value;
uniform sampler2D u_color_ramp;
uniform sampler2D u_dem;          // High-res DEM, R channel = elev / u_dem_max
uniform vec4 u_data_uv_bounds;
uniform float u_opacity;
// alpha curve: smoothstep(visStart, visFull, value_t). For temperature usually
// (0, 0) so always opaque; for cloud cover use (0.02, 0.6) to fade out clear sky.
uniform vec2 u_vis_range;
// === DEM-aware temperature refinement ===
// When u_use_dem == 1, the value texture's red channel carries the cell's
// lapse-corrected temperature (normalised to [vMin,vMax]) AND the green
// channel carries the cell's mean elevation (normalised to [0, demMax]).
// The shader inverts back to sea-level temperature, then re-applies the
// lapse rate using the DEM elevation sampled at the FRAGMENT location.
// Net effect: a single 6-km IDW cell containing both a 500-m valley and a
// 2500-m peak renders the valley 13 °C warmer than the peak — exactly as
// reality, but smoothly continuous instead of staircased at cell borders.
uniform float u_use_dem;          // 0 = off, 1 = on
uniform float u_dem_max;          // metres encoded as 1.0 in the DEM R channel
uniform float u_v_min;            // physical min of the value
uniform float u_v_max;            // physical max of the value
uniform float u_lapse_per_m;      // °C / m, sign-correct (positive = cooling with altitude)
varying vec2 v_equi_uv;

void main() {
  vec2 uv = (v_equi_uv - u_data_uv_bounds.xy) /
            (u_data_uv_bounds.zw - u_data_uv_bounds.xy);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  vec4 raw = texture2D(u_value, uv);
  // alpha doubles as a data-availability mask (0 = no station data)
  if (raw.a < 0.05) discard;
  float t = raw.r;
  // Per-pixel DEM refinement for the temperature layer.
  if (u_use_dem > 0.5) {
    float cellElev = raw.g * u_dem_max;
    float demElev = texture2D(u_dem, uv).r * u_dem_max;
    float tPhys = u_v_min + t * (u_v_max - u_v_min);
    // (cellElev - demElev) > 0 ⇔ pixel is below cell mean → warmer.
    tPhys += (cellElev - demElev) * u_lapse_per_m;
    t = clamp((tPhys - u_v_min) / (u_v_max - u_v_min), 0.0, 1.0);
  }
  vec2 ramp_pos = vec2(fract(16.0 * t), floor(16.0 * t) / 16.0);
  vec4 c = texture2D(u_color_ramp, ramp_pos);
  float vis = u_vis_range.y > u_vis_range.x
      ? smoothstep(u_vis_range.x, u_vis_range.y, t)
      : 1.0;
  gl_FragColor = vec4(c.rgb, c.a * u_opacity * vis * raw.a);
}
`;

export interface ScalarMeta {
  width: number;
  height: number;
  vMin: number;
  vMax: number;
  uvBounds: [number, number, number, number];
}

export interface ScalarLayerOptions {
  id: string;
  colorRamp: Record<number, string>;
  /** smoothstep(start, end) applied to the normalised value. Use {start:0,end:0} to disable. */
  visRange?: { start: number; end: number };
  opacity?: number;
  /** Attenuate opacity with zoom; if `{ from, perStep, floor }` is set, opacity *= max(floor, 1 - max(0, zoom - from) * perStep). */
  zoomAttenuation?: { from: number; perStep: number; floor: number };
  /**
   * Enable per-pixel DEM lapse refinement (temperature only). When set, the
   * fragment shader reads the cell's mean elevation from the value texture's
   * green channel and applies a per-pixel correction using the DEM texture
   * (uploaded via `setDem`).
   */
  demRefine?: {
    /** °C/m positive = temperature cools with altitude. Default 0.0065. */
    lapseRatePerM: number;
    /** Max elevation encoded as 1.0 in both DEM and value G channels. Default 4500. */
    demMax: number;
  };
}

interface ScalarData extends ScalarMeta {
  image: HTMLImageElement | HTMLCanvasElement;
}

export class ScalarLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  opacity: number;
  visRange: { start: number; end: number };
  zoomAttenuation: { from: number; perStep: number; floor: number } | null;
  demRefine: { lapseRatePerM: number; demMax: number } | null;

  private colorRampStops: Record<number, string>;
  private map: MapLibreMap | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program!: ProgramWrapper;
  /** Footprint-Mesh über die Daten-uvBounds (`equiFootprintMesh`, ≤ 1 m Mercator-
   *  Rest) — gebaut in `setData`, neu nur bei geänderten Bounds. */
  private mesh: WebGLBuffer | null = null;
  /** Dieselben Knoten als Mercator-Paare (Attribut a_merc, `mercatorOf`). */
  private mercBuf: WebGLBuffer | null = null;
  private meshVertexCount = 0;
  private meshKey = '';
  private valueTexture: WebGLTexture | null = null;
  private demTexture: WebGLTexture | null = null;
  private colorRampTexture!: WebGLTexture;
  private data: ScalarData | null = null;
  private _pending: { image: HTMLImageElement | HTMLCanvasElement; meta: ScalarMeta } | null = null;
  private _pendingDem: HTMLImageElement | HTMLCanvasElement | null = null;

  constructor(options: ScalarLayerOptions) {
    this.id = options.id;
    this.opacity = options.opacity ?? 0.85;
    this.visRange = options.visRange ?? { start: 0, end: 0 };
    this.zoomAttenuation = options.zoomAttenuation ?? null;
    this.colorRampStops = options.colorRamp;
    this.demRefine = options.demRefine ?? null;
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext) {
    this.map = map;
    this.gl = gl;
    this.program = createProgram(gl, meshVert, meshFrag);
    this.colorRampTexture = createTexture(gl, gl.LINEAR, getColorRamp(this.colorRampStops), 16, 16);
    if (this._pending) {
      const { image, meta } = this._pending;
      this._pending = null;
      this.setData(image, meta);
    }
    if (this._pendingDem) {
      const img = this._pendingDem;
      this._pendingDem = null;
      this.setDem(img);
    }
  }

  onRemove(_map: MapLibreMap, gl: WebGLRenderingContext) {
    gl.deleteProgram(this.program.program);
    if (this.mesh) gl.deleteBuffer(this.mesh);
    if (this.mercBuf) gl.deleteBuffer(this.mercBuf);
    this.mesh = null; this.mercBuf = null; this.meshKey = '';
    if (this.valueTexture) gl.deleteTexture(this.valueTexture);
    if (this.demTexture) gl.deleteTexture(this.demTexture);
    gl.deleteTexture(this.colorRampTexture);
  }

  /**
   * Mesh über den Daten-Footprint statt über die ganze Welt: das frühere
   * 128 × 64-Weltmesh (Bänder 2,66°) legte jeden Wert bis 2,0 km zu weit
   * nördlich — die GPU interpoliert `v_equi_uv` linear in Mercator-y, die Textur
   * liegt breiten-linear (`audit/karten-layer-verortung.md` §15). Zeilen aus der
   * Zeilenregel in `quadWarpMesh.ts` (≤ 1 m), neu gebaut nur bei neuen Bounds.
   */
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

  setData(image: HTMLImageElement | HTMLCanvasElement, meta: ScalarMeta) {
    const gl = this.gl;
    if (!gl) {
      this._pending = { image, meta };
      return;
    }
    if (this.valueTexture) gl.deleteTexture(this.valueTexture);
    this.valueTexture = createTexture(gl, gl.LINEAR, image);
    this.data = { ...meta, image };
    this.ensureMesh(meta.uvBounds);
    this.map?.triggerRepaint();
  }

  /**
   * Upload a high-resolution DEM image for per-pixel lapse refinement. The
   * DEM image's R channel must encode elevation 0..demMax → 0..255 across
   * the same uvBounds as the value texture. Used by the temperature layer.
   */
  setDem(image: HTMLImageElement | HTMLCanvasElement) {
    const gl = this.gl;
    if (!gl) {
      this._pendingDem = image;
      return;
    }
    if (this.demTexture) gl.deleteTexture(this.demTexture);
    this.demTexture = createTexture(gl, gl.LINEAR, image);
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
    if (!this.data || !this.valueTexture || !this.mesh || !this.mercBuf) return;
    let matrix: Float32List;
    if (Array.isArray(args) || args instanceof Float32Array) {
      matrix = args as Float32List;
    } else {
      matrix = args.defaultProjectionData.mainMatrix as unknown as Float32List;
    }

    const prevFB = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
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
    bindAttribute(gl, this.mesh, p.a_lnglat as number, 2);
    bindAttribute(gl, this.mercBuf, p.a_merc as number, 2);
    // V-RL-1 (2026-08-25): Vertex-Attribut-Arrays sind globaler GL-Zustand. Ein
    // zuvor gezeichneter RainLayer lässt sein `a_uv` (Index 1) aktiviert; baut er
    // seine Puffer neu (Geometriewechsel, Stilwechsel), zeigt das Attribut auf
    // einen GELÖSCHTEN Puffer — beim nächsten `drawArrays` dieses Layers warnt
    // WebGL „no buffer is bound to enabled attribute". Dieser Layer nutzt genau
    // ein Attribut; alle anderen werden deaktiviert (MapLibre löst vor
    // Custom-Layern das VAO, `drawCustom` → `unbindVAO`, wir ändern also nur den
    // Default-Zustand). Seit KL9 zwei Attribute (a_lnglat für uv, a_merc für die Lage).
    const maxAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;
    for (let i = 0; i < maxAttribs; i++) {
      if (i !== (p.a_lnglat as number) && i !== (p.a_merc as number) && gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_ENABLED)) {
        gl.disableVertexAttribArray(i);
      }
    }
    bindTexture(gl, this.valueTexture, 0);
    bindTexture(gl, this.colorRampTexture, 1);
    // Bind DEM to texture unit 2 (or use the value texture as a benign
    // fallback when no DEM has been uploaded — the shader will skip its
    // sample because u_use_dem will be 0).
    bindTexture(gl, this.demTexture ?? this.valueTexture, 2);
    gl.uniform1i(p.u_value as WebGLUniformLocation, 0);
    gl.uniform1i(p.u_color_ramp as WebGLUniformLocation, 1);
    gl.uniform1i(p.u_dem as WebGLUniformLocation, 2);
    const [dx0, dy0, dx1, dy1] = this.data.uvBounds;
    gl.uniform4f(p.u_data_uv_bounds as WebGLUniformLocation, dx0, dy0, dx1, dy1);
    let effectiveOpacity = this.opacity;
    if (this.zoomAttenuation) {
      const zoom = this.map?.getZoom() ?? 5;
      const { from, perStep, floor } = this.zoomAttenuation;
      const factor = Math.max(floor, Math.min(1, 1 - Math.max(0, zoom - from) * perStep));
      effectiveOpacity *= factor;
    }
    gl.uniform1f(p.u_opacity as WebGLUniformLocation, effectiveOpacity);
    gl.uniform2f(p.u_vis_range as WebGLUniformLocation, this.visRange.start, this.visRange.end);
    // DEM refinement uniforms (no-op when disabled).
    const useDem = this.demRefine && this.demTexture ? 1.0 : 0.0;
    gl.uniform1f(p.u_use_dem as WebGLUniformLocation, useDem);
    gl.uniform1f(p.u_dem_max as WebGLUniformLocation, this.demRefine?.demMax ?? 4500);
    gl.uniform1f(p.u_v_min as WebGLUniformLocation, this.data.vMin);
    gl.uniform1f(p.u_v_max as WebGLUniformLocation, this.data.vMax);
    gl.uniform1f(p.u_lapse_per_m as WebGLUniformLocation, this.demRefine?.lapseRatePerM ?? 0.0065);
    gl.uniformMatrix4fv(p.u_matrix as WebGLUniformLocation, false, matrix);

    gl.drawArrays(gl.TRIANGLES, 0, this.meshVertexCount);

    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFB);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
    if (!prevBlend) gl.disable(gl.BLEND);
    gl.depthMask(prevDepthMask);
    if (!prevDepth) gl.disable(gl.DEPTH_TEST);
  }
}

// Color ramps — Windy-inspired

// Windy temperature ramp — extracted from windy.com legend (-20°C..+40°C).
// 17 equally-spaced stops on a 0..1 normalised temperature axis.
export const temperatureRamp: Record<number, string> = {
  0.0:   'rgb(149, 137, 212)',
  0.25:  'rgb(150, 209, 216)',
  0.3125:'rgb(128, 204, 197)',
  0.375: 'rgb(102, 179, 186)',
  0.4375:'rgb(95, 143, 197)',
  0.5:   'rgb(80, 140, 61)',
  0.5625:'rgb(122, 146, 28)',
  0.625: 'rgb(171, 161, 14)',
  0.6875:'rgb(223, 177, 6)',
  0.75:  'rgb(243, 150, 6)',
  0.8125:'rgb(236, 94, 21)',
  0.875: 'rgb(190, 65, 18)',
  1.0:   'rgb(138, 42, 10)',
};

// Generic "any cloud cover" — pure white. Used by the legacy single-channel
// cloud layer; the new multi-layer cloud shader picks per-altitude tints in
// the fragment shader directly and ignores this ramp.
export const cloudRamp: Record<number, string> = {
  0.0: '#ffffff',
  1.0: '#ffffff',
};
