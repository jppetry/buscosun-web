/**
 * 3D-Wetter · Vorhang-Layer (3D-Gelände-Modus).
 *
 * MapLibre-Custom-Layer (`renderingMode:'3d'`), die den Wind-/Wolken-Schnitt als
 * senkrechten, texturierten „Vorhang" entlang der Schnittlinie auf das 3D-Relief
 * stellt. Geometrie aus `buildCurtain` (pur), Textur aus `sectionImage`
 * (dieselben Heatmaps wie der 2D-Schnitt). WebGL-Helfer aus `../wind/glUtil`.
 *
 * Höhe wird echt berücksichtigt: jeder Vertex wird per
 * `MercatorCoordinate.fromLngLat([lon,lat], altMeter)` in Mercator-Koordinaten
 * (inkl. z) gebracht und mit der MapLibre-Projektionsmatrix transformiert.
 * Tiefen-Test an → Berge verdecken den Vorhang dahinter. Die Geländeüberhöhung
 * (`exaggeration`) wird auf die Vertex-Höhe gespiegelt, damit der Vorhang zum
 * gerenderten Relief passt.
 */

import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MapLibreMap } from 'maplibre-gl';
import { createProgram, createTexture, type ProgramWrapper } from '../wind/glUtil';
import { buildCurtain, type CurtainColumn, type LineVertex } from './curtainMesh';

const curtainVert = `
precision highp float;
attribute vec3 a_pos;
attribute vec2 a_uv;
uniform mat4 u_matrix;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}
`;

const curtainFrag = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_opacity;
varying vec2 v_uv;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  if (c.a < 0.01) discard;
  gl_FragColor = vec4(c.rgb, c.a * u_opacity);
}
`;

const lineVert = `
precision highp float;
attribute vec3 a_pos;
uniform mat4 u_matrix;
void main() { gl_Position = u_matrix * vec4(a_pos, 1.0); }
`;

const lineFrag = `
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }
`;

export class CurtainLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  /** Geländeüberhöhung — muss mit `map.setTerrain({ exaggeration })` übereinstimmen. */
  exaggeration: number;
  opacity: number;

  private map: MapLibreMap | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program: ProgramWrapper | null = null;
  private lineProgram: ProgramWrapper | null = null;

  private posBuffer: WebGLBuffer | null = null;
  private uvBuffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private vertexCount = 0;
  private geomKey = '';

  private lineBuffer: WebGLBuffer | null = null;
  private lineVertexCount = 0;

  /** Bis onAdd den GL-Kontext gesetzt hat zwischengespeicherte Vorhang-Daten. */
  private pending: { columns: CurtainColumn[]; topM: number; image: HTMLCanvasElement } | null = null;
  private pendingLines: LineVertex[] | null = null;

  constructor(opts: { id?: string; exaggeration?: number; opacity?: number } = {}) {
    this.id = opts.id ?? 'td-curtain';
    this.exaggeration = opts.exaggeration ?? 1.0;
    this.opacity = opts.opacity ?? 0.9;
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext) {
    this.map = map;
    this.gl = gl;
    this.program = createProgram(gl, curtainVert, curtainFrag);
    this.lineProgram = createProgram(gl, lineVert, lineFrag);
    if (this.pending) {
      const { columns, topM, image } = this.pending;
      this.pending = null;
      this.setCurtain(columns, topM, image);
    }
    if (this.pendingLines) { const l = this.pendingLines; this.pendingLines = null; this.setStreamlines(l); }
  }

  onRemove(_map: MapLibreMap, gl: WebGLRenderingContext) {
    if (this.program) gl.deleteProgram(this.program.program);
    if (this.lineProgram) gl.deleteProgram(this.lineProgram.program);
    if (this.posBuffer) gl.deleteBuffer(this.posBuffer);
    if (this.uvBuffer) gl.deleteBuffer(this.uvBuffer);
    if (this.lineBuffer) gl.deleteBuffer(this.lineBuffer);
    if (this.texture) gl.deleteTexture(this.texture);
    this.program = null; this.lineProgram = null; this.posBuffer = null; this.uvBuffer = null;
    this.lineBuffer = null; this.texture = null; this.vertexCount = 0; this.lineVertexCount = 0; this.geomKey = '';
  }

  /** Windlinien setzen (oder mit leerem Array löschen). Höhe wie beim Vorhang via exaggeration. */
  setStreamlines(lines: LineVertex[]) {
    const gl = this.gl;
    if (!gl) { this.pendingLines = lines; return; }
    if (!lines.length) { this.lineVertexCount = 0; this.map?.triggerRepaint(); return; }
    const pos = new Float32Array(lines.length * 3);
    for (let i = 0; i < lines.length; i++) {
      const m = MercatorCoordinate.fromLngLat([lines[i].lon, lines[i].lat], lines[i].altM * this.exaggeration);
      pos[i * 3] = m.x; pos[i * 3 + 1] = m.y; pos[i * 3 + 2] = m.z;
    }
    if (this.lineBuffer) gl.deleteBuffer(this.lineBuffer);
    this.lineBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    this.lineVertexCount = lines.length;
    this.map?.triggerRepaint();
  }

  /**
   * Vorhang aktualisieren: Geometrie wird nur bei strukturellen Änderungen
   * (Höhe/Decke der Schnittlinie) neu gebaut, die Heatmap-Textur jedes Mal
   * (Zeit-/Layer-Wechsel). `image` ist ein Canvas aus `sectionImage`.
   */
  setCurtain(columns: CurtainColumn[], topM: number, image: HTMLCanvasElement) {
    const gl = this.gl;
    if (!gl || !this.program) { this.pending = { columns, topM, image }; return; }

    // Geometrie nur neu bauen, wenn sich Decke/Spalten/Gelände geändert haben.
    const key = geometryKey(columns, topM);
    if (key !== this.geomKey) {
      const verts = buildCurtain(columns, topM);
      const pos = new Float32Array(verts.length * 3);
      const uv = new Float32Array(verts.length * 2);
      for (let i = 0; i < verts.length; i++) {
        const m = MercatorCoordinate.fromLngLat([verts[i].lon, verts[i].lat], verts[i].altM * this.exaggeration);
        pos[i * 3] = m.x; pos[i * 3 + 1] = m.y; pos[i * 3 + 2] = m.z;
        uv[i * 2] = verts[i].u; uv[i * 2 + 1] = verts[i].v;
      }
      if (this.posBuffer) gl.deleteBuffer(this.posBuffer);
      if (this.uvBuffer) gl.deleteBuffer(this.uvBuffer);
      this.posBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
      this.uvBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
      this.vertexCount = verts.length;
      this.geomKey = key;
    }

    // Textur jedes Mal neu hochladen (Wind-/Wolkenbild für den Zeitpunkt).
    if (this.texture) gl.deleteTexture(this.texture);
    this.texture = createTexture(gl, gl.LINEAR, image);
    this.map?.triggerRepaint();
  }

  render(gl: WebGLRenderingContext, args: CustomRenderMethodInput | number[] | Float32Array) {
    if (!this.program || !this.posBuffer || !this.uvBuffer || !this.texture || this.vertexCount < 4) return;

    let matrix: Float32List;
    if (Array.isArray(args) || args instanceof Float32Array) matrix = args as Float32List;
    else matrix = args.defaultProjectionData.mainMatrix as unknown as Float32List;

    const prevBlend = gl.getParameter(gl.BLEND) as boolean;
    const prevDepth = gl.getParameter(gl.DEPTH_TEST) as boolean;
    const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;

    const p = this.program;
    gl.useProgram(p.program);

    // Tiefen-Test: das zuvor gezeichnete 3D-Terrain verdeckt den Vorhang hinter
    // Bergen. Kein Tiefen-Schreiben (transparente Fläche), aber Test gegen Relief.
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const aPos = p.a_pos as number, aUv = p.a_uv as number;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(p.u_tex as WebGLUniformLocation, 0);
    gl.uniform1f(p.u_opacity as WebGLUniformLocation, this.opacity);
    gl.uniformMatrix4fv(p.u_matrix as WebGLUniformLocation, false, matrix);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.vertexCount);

    // Windlinien (über dem Vorhang, gleiche Tiefen-Logik). Helles Casing + dunkler
    // Kern via zwei Durchgänge → auch über farbiger Wand sichtbar.
    if (this.lineProgram && this.lineBuffer && this.lineVertexCount > 1) {
      const lp = this.lineProgram;
      gl.useProgram(lp.program);
      const la = lp.a_pos as number;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
      gl.enableVertexAttribArray(la);
      gl.vertexAttribPointer(la, 3, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(lp.u_matrix as WebGLUniformLocation, false, matrix);
      gl.lineWidth(2);
      gl.uniform4f(lp.u_color as WebGLUniformLocation, 0.98, 0.965, 0.918, 0.55); // Casing
      gl.drawArrays(gl.LINES, 0, this.lineVertexCount);
      gl.uniform4f(lp.u_color as WebGLUniformLocation, 0.13, 0.20, 0.29, 0.92);   // Kern
      gl.drawArrays(gl.LINES, 0, this.lineVertexCount);
    }

    // GL-Status für MapLibre wiederherstellen.
    gl.depthMask(prevDepthMask);
    if (!prevDepth) gl.disable(gl.DEPTH_TEST);
    if (prevBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
  }
}

/** Signatur über Decke + Geländeprofil — Geometrie nur bei Änderung neu bauen. */
function geometryKey(columns: CurtainColumn[], topM: number): string {
  let sum = 0;
  for (const c of columns) sum += c.terrainM;
  return `${topM}:${columns.length}:${Math.round(sum)}`;
}
