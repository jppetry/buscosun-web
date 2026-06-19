export interface ProgramWrapper {
  program: WebGLProgram;
  [key: string]: WebGLProgram | number | WebGLUniformLocation | null;
}

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    throw new Error(`Shader compile error: ${log}\n\n${source}`);
  }
  return shader;
}

export function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
): ProgramWrapper {
  const program = gl.createProgram()!;
  gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
  }

  const wrapper: ProgramWrapper = { program };
  const numAttribs = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < numAttribs; i++) {
    const a = gl.getActiveAttrib(program, i)!;
    wrapper[a.name] = gl.getAttribLocation(program, a.name);
  }
  const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < numUniforms; i++) {
    const u = gl.getActiveUniform(program, i)!;
    wrapper[u.name] = gl.getUniformLocation(program, u.name);
  }
  return wrapper;
}

export function createTexture(
  gl: WebGLRenderingContext,
  filter: number,
  data: Uint8Array | TexImageSource,
  width?: number,
  height?: number,
): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  if (data instanceof Uint8Array) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width!, height!, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

/** IEEE-754 float → half-float (Uint16) Bit-Muster. Für HALF_FLOAT-Uploads,
 *  da WebGL1 keine Float32→Half-Konvertierung beim Upload macht. */
function floatToHalf(val: number): number {
  const f = new Float32Array(1);
  const i = new Int32Array(f.buffer);
  f[0] = val;
  const x = i[0];
  const sign = (x >> 16) & 0x8000;
  let exp = ((x >> 23) & 0xff) - 127 + 15;
  let mant = x & 0x7fffff;
  if (exp <= 0) {
    // Subnormal/Underflow → 0 (für Wind-Normwerte 0..1 irrelevant).
    return sign;
  }
  if (exp >= 0x1f) {
    return sign | 0x7c00; // Inf/NaN
  }
  // Runden zum nächsten geraden.
  mant += 0x1000;
  if (mant & 0x800000) {
    mant = 0;
    exp += 1;
    if (exp >= 0x1f) return sign | 0x7c00;
  }
  return sign | (exp << 10) | (mant >> 13);
}

export interface DataTextureFormat {
  /** Tatsächlich verwendeter GL-Typ-Name (Diagnose/Logging). */
  kind: 'half-float' | 'float' | 'byte';
}

/**
 * Lädt ein Float-Datenfeld (RGBA, Werte i. d. R. normiert 0..1) als Textur hoch.
 * Bevorzugt HALF_FLOAT (kontinuierliche Werte, halber Speicher), fällt auf FLOAT
 * und zuletzt auf UNSIGNED_BYTE (8-bit, quantisiert) zurück, je nach
 * Extension-Verfügbarkeit. Für die Wind-Engine: kontinuierliche Geschwindigkeit
 * statt 256 Stufen.
 */
export function createDataTexture(
  gl: WebGLRenderingContext,
  filter: number,
  rgbaFloats: Float32Array,
  width: number,
  height: number,
  out?: DataTextureFormat,
): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

  const halfExt = gl.getExtension('OES_texture_half_float');
  const halfLinear = gl.getExtension('OES_texture_half_float_linear');
  const floatExt = gl.getExtension('OES_texture_float');
  const floatLinear = gl.getExtension('OES_texture_float_linear');
  const wantLinear = filter === gl.LINEAR;

  if (halfExt && (!wantLinear || halfLinear)) {
    const half = new Uint16Array(rgbaFloats.length);
    for (let i = 0; i < rgbaFloats.length; i++) half[i] = floatToHalf(rgbaFloats[i]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, halfExt.HALF_FLOAT_OES, half);
    if (out) out.kind = 'half-float';
  } else if (floatExt && (!wantLinear || floatLinear)) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, rgbaFloats);
    if (out) out.kind = 'float';
  } else {
    const bytes = new Uint8Array(rgbaFloats.length);
    for (let i = 0; i < rgbaFloats.length; i++) {
      bytes[i] = Math.max(0, Math.min(255, Math.round(rgbaFloats[i] * 255)));
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    if (out) out.kind = 'byte';
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

export function bindTexture(gl: WebGLRenderingContext, texture: WebGLTexture, unit: number) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}

export function createBuffer(gl: WebGLRenderingContext, data: Float32Array): WebGLBuffer {
  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

export function bindAttribute(
  gl: WebGLRenderingContext,
  buffer: WebGLBuffer,
  attribute: number,
  numComponents: number,
) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, numComponents, gl.FLOAT, false, 0, 0);
}

export function bindFramebuffer(
  gl: WebGLRenderingContext,
  framebuffer: WebGLFramebuffer | null,
  texture: WebGLTexture | null = null,
) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  if (texture) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  }
}

export function getColorRamp(colors: Record<number, string>): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 256, 0);
  for (const stop of Object.keys(colors)) {
    gradient.addColorStop(+stop, colors[+stop]);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 1);
  return new Uint8Array(ctx.getImageData(0, 0, 256, 1).data.buffer);
}
