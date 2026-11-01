import { MERC_TABLE_DIM, MERC_TABLE_SIZE, MERC_TABLE_Y0, MERC_TABLE_Y1 } from '../scalar/quadWarpMesh';

// KL10 (2026-08-27, Jans Go): Mercator-y der Partikel aus einer 64 × 64-RGBA8-
// Tabelle (`mercYTable`, CPU-double, 32-bit-Festkomma) — zwei Taps + Mischung
// statt log(tan()): GPU-Transzendente lagen bis 280 m daneben
// (`audit/karten-layer-verortung.md` §15.6). Wird in alle vier Zeichen-Shader
// eingesetzt; die Simulation (updateFrag) bleibt unverändert.
export const MERC_TABLE_GLSL = `
uniform highp sampler2D u_merc_table;
const float MT_Y0 = ${MERC_TABLE_Y0};
const float MT_Y1 = ${MERC_TABLE_Y1};
const float MT_N = ${MERC_TABLE_SIZE.toFixed(1)};
const float MT_DIM = ${MERC_TABLE_DIM.toFixed(1)};
float mercTableAt(float i) {
  vec2 tc = vec2((mod(i, MT_DIM) + 0.5) / MT_DIM, (floor(i / MT_DIM) + 0.5) / MT_DIM);
  vec4 c = texture2D(u_merc_table, tc);
  return dot(c, vec4(1.0, 1.0 / 256.0, 1.0 / 65536.0, 1.0 / 16777216.0)) * (255.0 / 256.0);
}
float mercYOf(float equiY) {
  float f = clamp((equiY - MT_Y0) / (MT_Y1 - MT_Y0), 0.0, 1.0) * (MT_N - 1.0);
  float i = floor(min(f, MT_N - 2.0));
  return mix(mercTableAt(i), mercTableAt(i + 1.0), f - i);
}
`;

export const drawVert = `
// highp is REQUIRED here (and mandatory-supported in vertex shaders per GLSL ES).
// The particle position is a 16-bit value packed across two bytes and rebuilt as
// color.r/255.0 + color.b — recovering the fine byte needs ~2^-16 resolution near
// magnitude 1.0, far beyond mediump's guaranteed 2^-10 mantissa. Under mediump a
// phone that honors it strictly drops the fine byte, snapping every particle to a
// coarse ~1/255-of-world grid → sparse stationary DOTS instead of flowing streaks
// (desktop treats mediump as highp, so the bug is mobile-only). highp fixes it and
// is byte-identical on desktop.
precision highp float;

attribute float a_index;

// GLSL ES gives sampler types their OWN default precision (lowp), separate from
// "precision highp float" above — a spec detail desktop/ANGLE drivers commonly
// ignore (promoting everything to highp) but a real mobile GPU may honor. This
// texture is NEAREST-filtered and addressed by exact fract()/floor() texel math
// (see below); lowp coordinate precision there can snap to the WRONG texel —
// i.e. fetch a neighboring particle's state — which reads as scrambled
// position/direction/speed on hardware while looking correct on desktop AND in
// Chrome's device-mode emulation (same desktop driver). highp makes the
// coordinate math spec-guaranteed full precision on both.
uniform highp sampler2D u_particles;
uniform float u_particles_res;
uniform mat4 u_matrix;
uniform float u_point_size;
// Bezugsrechteck der Positionskodierung (equirect x0,y0,x1,y1). Die 2 Byte je
// Achse spannen NICHT mehr die ganze Welt, sondern genau dieses Rechteck — s.
// updateFrag. Hier steht das Rechteck, mit dem der LETZTE Update-Pass kodiert
// hat (der Draw läuft vor dem Update, s. WindLayer.render).
uniform vec4 u_bounds;

varying vec2 v_particle_pos;
${MERC_TABLE_GLSL}
void main() {
  vec4 color = texture2D(u_particles, vec2(
      fract(a_index / u_particles_res),
      floor(a_index / u_particles_res) / u_particles_res));

  // bounds-relative Position [0,1]² → absolute equirect-Position [0,1]²
  vec2 local = vec2(
      color.r / 255.0 + color.b,
      color.g / 255.0 + color.a);
  v_particle_pos = u_bounds.xy + local * (u_bounds.zw - u_bounds.xy);

  // Mercator-x = equirect-x (linear); Mercator-y aus der Tabelle (KL10).
  float merc_x = v_particle_pos.x;
  float merc_y = mercYOf(v_particle_pos.y);

  gl_PointSize = u_point_size;
  gl_Position = u_matrix * vec4(merc_x, merc_y, 0.0, 1.0);
}
`;

// Projection-aware variants for MapLibre custom-layer rendering (mercator AND
// globe). These are compiled with MapLibre's projection prelude prepended
// (`shaderData.define` + `vertexShaderPrelude`), which provides `PI`,
// `u_projection_matrix` and `projectTile()`. The body must therefore NOT
// redeclare PI or any u_projection_* uniform. `projectTile(vec2 mercatorXY)`
// handles both projections (and clips the back of the globe via Z).
export const drawVertProjected = `
// highp required for the 2-byte position decode — see drawVert above (mediump
// snaps particles to a coarse grid on mobile → dots instead of streaks).
precision highp float;

attribute float a_index;

// highp sampler2D — see drawVert above (sampler precision is separate from
// "precision highp float"; NEAREST exact-texel addressing needs it explicit).
uniform highp sampler2D u_particles;
uniform float u_particles_res;
uniform float u_point_size;
// Bezugsrechteck der Positionskodierung — s. drawVert/updateFrag.
uniform vec4 u_bounds;

varying vec2 v_particle_pos;
${MERC_TABLE_GLSL}
void main() {
  vec4 color = texture2D(u_particles, vec2(
      fract(a_index / u_particles_res),
      floor(a_index / u_particles_res) / u_particles_res));

  vec2 local = vec2(
      color.r / 255.0 + color.b,
      color.g / 255.0 + color.a);
  v_particle_pos = u_bounds.xy + local * (u_bounds.zw - u_bounds.xy);

  // Mercator-x = equirect-x (linear); Mercator-y aus der Tabelle (KL10).
  float merc_x = v_particle_pos.x;
  float merc_y = mercYOf(v_particle_pos.y);

  gl_PointSize = u_point_size;
  gl_Position = projectTile(vec2(merc_x, merc_y));
}
`;

export const heatmapVertProjected = `
precision highp float;

attribute vec2 a_lnglat;
attribute vec2 a_merc;

varying vec2 v_equi_uv;

void main() {
  v_equi_uv = vec2((a_lnglat.x + 180.0) / 360.0, (90.0 - a_lnglat.y) / 180.0);
  gl_Position = projectTile(a_merc);
}
`;

export const drawFrag = `
precision mediump float;

uniform sampler2D u_wind;
uniform sampler2D u_color_ramp;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform vec4 u_particle_color;
uniform vec4 u_data_uv_bounds;
uniform float u_speed_tint;   // 0 = reine particleColor, 1 = reine Speed-Farbe

varying vec2 v_particle_pos;

void main() {
  // Weiche, runde Punkte statt harter Quadrate (gl_PointCoord-Radius).
  vec2 pc = gl_PointCoord - 0.5;
  float d = length(pc);
  float soft = smoothstep(0.5, 0.18, d);
  if (soft <= 0.0) discard;

  vec2 wind_uv = (v_particle_pos - u_data_uv_bounds.xy) /
                 (u_data_uv_bounds.zw - u_data_uv_bounds.xy);
  bool inside = wind_uv.x >= 0.0 && wind_uv.x <= 1.0 &&
                wind_uv.y >= 0.0 && wind_uv.y <= 1.0;
  vec2 sampleUV = inside ? wind_uv : vec2(0.5);
  vec2 velocity = mix(u_wind_min, u_wind_max, texture2D(u_wind, sampleUV).rg);
  float speed_t = inside ? clamp(length(velocity) / length(u_wind_max), 0.0, 1.0) : 0.0;

  // Geschwindigkeitsabhängige Farbe aus der 16×16-Color-Ramp (wie die Heatmap),
  // dezent in die Basisfarbe gemischt → nullschool-artige farbige Fäden.
  vec2 ramp_pos = vec2(fract(16.0 * speed_t), floor(16.0 * speed_t) / 16.0);
  vec3 rampColor = texture2D(u_color_ramp, ramp_pos).rgb;
  vec3 rgb = mix(u_particle_color.rgb, rampColor, u_speed_tint);

  float alpha = u_particle_color.a * clamp(0.7 + speed_t * 0.4, 0.7, 1.0) * soft;
  gl_FragColor = vec4(rgb, alpha);
}
`;

// ---- Segment style (Phase WP1, windy.com parity) ---------------------------
// Each particle is a QUAD: head = its position in the CURRENT state texture,
// tail = head advected BACKWARDS by one 60-fps step of the exact same
// display-velocity math the update pass uses. The accumulated chain of these
// per-frame segments forms the windy-style streak.
//
// Deliberately NOT read from the second (previous) state texture: the two
// ping-pong textures do not reliably hold adjacent time steps on every
// GL stack (measured on ANGLE/D3D11: the pair decorrelates into two
// independent populations — viewport-long garbage segments). Deriving the
// tail from the wind field keeps every vertex self-contained and makes
// respawn jumps structurally impossible to draw.

export const segDrawVert = `
// highp + the exact 2-byte RGBA8 position decode are REQUIRED and copied
// verbatim from drawVert — see the rationale there (mediump snaps particles to
// a coarse grid on mobile; default-lowp sampler coords fetch the WRONG texel).
precision highp float;

// (particleIndex, end, side): end 0 = head / 1 = tail (one step upwind);
// side ±1 = across-track extrusion direction.
attribute vec3 a_vert;

uniform highp sampler2D u_particles;
// highp on the shared sampler — the mediump fragment shader declares it highp
// too (linker rejects mismatched uniform precision; updateFrag ships fragment
// highp samplers already, so device support is proven).
uniform highp sampler2D u_wind;
uniform float u_particles_res;
uniform mat4 u_matrix;
uniform vec2 u_viewport;     // trail-buffer size in px (extrusion pixel space)
// mediump on uniforms SHARED with the (mediump) fragment shader — the linker
// rejects mismatched uniform precision, and fragment-side highp floats are not
// guaranteed on older mobile GPUs. All these values fit mediump comfortably.
uniform mediump float u_half_width;  // half stroke width in trail-buffer px
uniform mediump float u_aa_edge;     // soft across-track margin per side in px
uniform mediump vec2 u_wind_min;
uniform mediump vec2 u_wind_max;
uniform mediump vec4 u_data_uv_bounds;
uniform float u_length_ex;   // minimum along-track length in px (calm areas)
// Equirect-X-Schritt je 1 m/s für die Länge des Kopfsegments (headFrames
// 60-fps-Schritte) — JS-seitig aus advectionStepScale(), s. advection.ts.
uniform float u_step_scale;
uniform float u_speed_gamma;
uniform float u_speed_ref;
uniform float u_speed_min;
// Bezugsrechteck der Positionskodierung — s. drawVert/updateFrag.
uniform vec4 u_bounds;

varying vec2 v_particle_pos;
varying float v_cross;

const float PI = 3.14159265358979323846;
const float MERC_MAX_LAT = 85.05112878;
${MERC_TABLE_GLSL}
// equirect Y spannt 180°, X spannt 360° → die N-S-Komponente braucht den
// Faktor 2, sonst ist die Advektion anisotrop (s. advection.ts, NS_ASPECT).
const float NS_ASPECT = 2.0;

vec2 decodePos(vec4 color) {
  vec2 local = vec2(color.r / 255.0 + color.b, color.g / 255.0 + color.a);
  return u_bounds.xy + local * (u_bounds.zw - u_bounds.xy);
}

vec4 projectEqui(vec2 equi) {
  // Mercator-x = equirect-x (linear); Mercator-y aus der Tabelle (KL10).
  return u_matrix * vec4(equi.x, mercYOf(equi.y), 0.0, 1.0);
}

// One 60-fps advection step at this position — the SAME math as updateFrag's
// dispVelocity, so head→tail is exactly the last frame's travel: linear in the
// GRIB speed (γ/floor are the neutral legacy knobs) and isotropic via NS_ASPECT.
vec2 advectStep(vec2 p) {
  vec2 wind_uv = (p - u_data_uv_bounds.xy) /
                 (u_data_uv_bounds.zw - u_data_uv_bounds.xy);
  bool in_data = wind_uv.x >= 0.0 && wind_uv.x <= 1.0 &&
                 wind_uv.y >= 0.0 && wind_uv.y <= 1.0;
  vec2 raw = in_data ? texture2D(u_wind, wind_uv).rg : vec2(0.5);
  vec2 velocity = mix(vec2(u_wind_min), vec2(u_wind_max), raw);
  if (!in_data) velocity = vec2(0.0);
  float speed = length(velocity);
  if (speed < 0.001) return vec2(0.0);
  float dispSpeed = speed;
  if (u_speed_gamma != 1.0) dispSpeed = pow(speed / u_speed_ref, u_speed_gamma) * u_speed_ref;
  dispSpeed = max(u_speed_min, dispSpeed);
  vec2 dispVel = velocity / speed * dispSpeed;
  float distortion = max(0.05, cos(radians(p.y * 180.0 - 90.0)));
  return vec2(dispVel.x / distortion, -NS_ASPECT * dispVel.y) * u_step_scale;
}

void main() {
  vec2 tc = vec2(
      fract(a_vert.x / u_particles_res),
      floor(a_vert.x / u_particles_res) / u_particles_res);
  vec2 posA = decodePos(texture2D(u_particles, tc));
  v_particle_pos = posA;
  v_cross = a_vert.z * (u_half_width + u_aa_edge);

  vec2 posB = posA - advectStep(posA);
  vec4 clipA = projectEqui(posA);
  vec4 clipB = projectEqui(posB);
  if (clipA.w <= 0.0 || clipB.w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  // Screen-space segment vector in trail-buffer px (NDC spans 2 → ×0.5).
  vec2 dirPx = (clipA.xy / clipA.w - clipB.xy / clipB.w) * u_viewport * 0.5;
  float len = length(dirPx);
  // Near-zero motion falls back to a fixed direction so calm-area particles
  // still rasterize as a tiny dash (never NaN).
  vec2 dirN = len > 0.0001 ? dirPx / len : vec2(1.0, 0.0);
  vec2 perpN = vec2(-dirN.y, dirN.x);

  float head = 1.0 - a_vert.y;          // 1 at the head end
  vec4 clip = mix(clipB, clipA, head);
  float endSign = head * 2.0 - 1.0;     // +1 head, −1 tail
  vec2 offsetPx = perpN * v_cross + dirN * (endSign * u_length_ex * 0.5);
  clip.xy += offsetPx * 2.0 / u_viewport * clip.w;
  gl_Position = clip;
}
`;

// Projection-aware segment variant (MapLibre prelude prepended at compile
// time — provides PI, u_projection_* and projectTile(); see drawVertProjected).
export const segDrawVertProjected = `
// highp + verbatim RGBA8 decode — see drawVert/segDrawVert.
precision highp float;

attribute vec3 a_vert;

uniform highp sampler2D u_particles;
uniform highp sampler2D u_wind;
uniform float u_particles_res;
uniform vec2 u_viewport;
// mediump/highp split mirrors segDrawVert (shared-uniform precision contract).
uniform mediump float u_half_width;
uniform mediump float u_aa_edge;
uniform mediump vec2 u_wind_min;
uniform mediump vec2 u_wind_max;
uniform mediump vec4 u_data_uv_bounds;
uniform float u_length_ex;
uniform float u_step_scale;
uniform float u_speed_gamma;
uniform float u_speed_ref;
uniform float u_speed_min;
uniform vec4 u_bounds;

varying vec2 v_particle_pos;
varying float v_cross;

const float MERC_MAX_LAT = 85.05112878;
${MERC_TABLE_GLSL}
const float NS_ASPECT = 2.0;

vec2 decodePos(vec4 color) {
  vec2 local = vec2(color.r / 255.0 + color.b, color.g / 255.0 + color.a);
  return u_bounds.xy + local * (u_bounds.zw - u_bounds.xy);
}

vec4 projectEqui(vec2 equi) {
  // Mercator-x = equirect-x (linear); Mercator-y aus der Tabelle (KL10).
  return projectTile(vec2(equi.x, mercYOf(equi.y)));
}

vec2 advectStep(vec2 p) {
  vec2 wind_uv = (p - u_data_uv_bounds.xy) /
                 (u_data_uv_bounds.zw - u_data_uv_bounds.xy);
  bool in_data = wind_uv.x >= 0.0 && wind_uv.x <= 1.0 &&
                 wind_uv.y >= 0.0 && wind_uv.y <= 1.0;
  vec2 raw = in_data ? texture2D(u_wind, wind_uv).rg : vec2(0.5);
  vec2 velocity = mix(vec2(u_wind_min), vec2(u_wind_max), raw);
  if (!in_data) velocity = vec2(0.0);
  float speed = length(velocity);
  if (speed < 0.001) return vec2(0.0);
  float dispSpeed = speed;
  if (u_speed_gamma != 1.0) dispSpeed = pow(speed / u_speed_ref, u_speed_gamma) * u_speed_ref;
  dispSpeed = max(u_speed_min, dispSpeed);
  vec2 dispVel = velocity / speed * dispSpeed;
  float distortion = max(0.05, cos(radians(p.y * 180.0 - 90.0)));
  return vec2(dispVel.x / distortion, -NS_ASPECT * dispVel.y) * u_step_scale;
}

void main() {
  vec2 tc = vec2(
      fract(a_vert.x / u_particles_res),
      floor(a_vert.x / u_particles_res) / u_particles_res);
  vec2 posA = decodePos(texture2D(u_particles, tc));
  v_particle_pos = posA;
  v_cross = a_vert.z * (u_half_width + u_aa_edge);

  vec2 posB = posA - advectStep(posA);
  vec4 clipA = projectEqui(posA);
  vec4 clipB = projectEqui(posB);
  if (clipA.w <= 0.0 || clipB.w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  vec2 dirPx = (clipA.xy / clipA.w - clipB.xy / clipB.w) * u_viewport * 0.5;
  float len = length(dirPx);
  vec2 dirN = len > 0.0001 ? dirPx / len : vec2(1.0, 0.0);
  vec2 perpN = vec2(-dirN.y, dirN.x);

  float head = 1.0 - a_vert.y;
  vec4 clip = mix(clipB, clipA, head);
  float endSign = head * 2.0 - 1.0;
  vec2 offsetPx = perpN * v_cross + dirN * (endSign * u_length_ex * 0.5);
  clip.xy += offsetPx * 2.0 / u_viewport * clip.w;
  gl_Position = clip;
}
`;

export const segDrawFrag = `
precision mediump float;

// highp: shared with the vertex shader, which samples the wind field for the
// tail advection — uniform precision must match across stages (see segDrawVert).
uniform highp sampler2D u_wind;
uniform sampler2D u_color_ramp;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform vec4 u_particle_color;
uniform vec4 u_data_uv_bounds;
uniform float u_speed_tint;    // 0 = pure particleColor, 1 = pure ramp color
uniform float u_half_width;
uniform float u_aa_edge;
uniform float u_global_alpha;  // zoomend fade-in ramp (1 in steady state)

varying vec2 v_particle_pos;
varying float v_cross;

void main() {
  // Soft across-track edge: full opacity in the core, u_aa_edge px falloff.
  float aa = clamp((u_half_width + u_aa_edge - abs(v_cross)) / max(u_aa_edge, 0.0001), 0.0, 1.0);
  if (aa <= 0.0) discard;

  // Speed sampling + coloring identical to drawFrag (keeps the two styles'
  // color behavior interchangeable).
  vec2 wind_uv = (v_particle_pos - u_data_uv_bounds.xy) /
                 (u_data_uv_bounds.zw - u_data_uv_bounds.xy);
  bool inside = wind_uv.x >= 0.0 && wind_uv.x <= 1.0 &&
                wind_uv.y >= 0.0 && wind_uv.y <= 1.0;
  vec2 sampleUV = inside ? wind_uv : vec2(0.5);
  vec2 velocity = mix(u_wind_min, u_wind_max, texture2D(u_wind, sampleUV).rg);
  float speed_t = inside ? clamp(length(velocity) / length(u_wind_max), 0.0, 1.0) : 0.0;

  vec2 ramp_pos = vec2(fract(16.0 * speed_t), floor(16.0 * speed_t) / 16.0);
  vec3 rampColor = texture2D(u_color_ramp, ramp_pos).rgb;
  vec3 rgb = mix(u_particle_color.rgb, rampColor, u_speed_tint);

  float alpha = u_particle_color.a * clamp(0.7 + speed_t * 0.4, 0.7, 1.0) * aa * u_global_alpha;
  gl_FragColor = vec4(rgb, alpha);
}
`;

// KL9/V-KL-3 (2026-08-27): Lage aus `a_merc` (CPU-double, `mercatorOf`) statt
// log(tan()) im Shader — GPU-Transzendente lagen bis 280 m daneben
// (`audit/karten-layer-verortung.md` §15.6); `a_lnglat` bleibt für die uv.
// Die Partikel-Shader (drawVert/segDrawVert) rechnen weiter im Shader: ihre
// Position entsteht erst auf der GPU (Simulation), dort gibt es keine CPU-Stelle.
export const heatmapVert = `
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

export const heatmapFrag = `
precision mediump float;

uniform sampler2D u_wind;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform sampler2D u_color_ramp;
uniform float u_opacity;
uniform vec4 u_data_uv_bounds;

varying vec2 v_equi_uv;

void main() {
  vec2 wind_uv = (v_equi_uv - u_data_uv_bounds.xy) /
                 (u_data_uv_bounds.zw - u_data_uv_bounds.xy);
  if (wind_uv.x < 0.0 || wind_uv.x > 1.0 ||
      wind_uv.y < 0.0 || wind_uv.y > 1.0) discard;
  vec2 velocity = mix(u_wind_min, u_wind_max, texture2D(u_wind, wind_uv).rg);
  float speed_t = clamp(length(velocity) / length(u_wind_max), 0.0, 1.0);
  vec2 ramp_pos = vec2(fract(16.0 * speed_t), floor(16.0 * speed_t) / 16.0);
  vec4 c = texture2D(u_color_ramp, ramp_pos);
  float vis = smoothstep(0.02, 0.5, speed_t);
  gl_FragColor = vec4(c.rgb, c.a * u_opacity * vis);
}
`;

export const quadVert = `
precision mediump float;

attribute vec2 a_pos;

varying vec2 v_tex_pos;

void main() {
  v_tex_pos = a_pos;
  gl_Position = vec4(1.0 - 2.0 * a_pos, 0, 1);
}
`;

export const screenFrag = `
precision mediump float;

uniform sampler2D u_screen;
uniform float u_opacity;
// Kamera-Nachführung des Trail-Puffers (Phase WZ1 / ZA-1). Der Puffer liegt im
// BILDSCHIRMRAUM; bewegt sich die Kamera, passt der aufgezeichnete Schweif nicht
// mehr zur Karte darunter. Statt ihn zu verwerfen (bis 2026-08-08: 173
// Löschungen in 189 Bildern je Zoomfahrt — der Layer brach während jeder Geste
// auf ein Punktfeld zusammen) wird er hier um die Kamerabewegung seit dem
// letzten Bild verschoben und skaliert. Für Schwenken + Zoomen ohne Drehung und
// Neigung ist das im Bildschirmraum eine exakte affine Abbildung (Mercator);
// sonst setzt WindLayer die Identität und löscht weiterhin.
// (1,1)/(0,0) = Identität ⇒ byte-identisch zum Alt-Verhalten. Der Komposit-Pass
// benutzt IMMER die Identität.
uniform vec2 u_uv_scale;
uniform vec2 u_uv_offset;

varying vec2 v_tex_pos;

void main() {
  vec2 src = (1.0 - v_tex_pos) * u_uv_scale + u_uv_offset;
  // Neu ins Bild gekommene Fläche hat keine Schweif-Historie — dort transparent
  // statt CLAMP_TO_EDGE-Schlieren vom Rand.
  if (src.x < 0.0 || src.x > 1.0 || src.y < 0.0 || src.y > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec4 color = texture2D(u_screen, src);
  // Fade ONLY the alpha channel. The trail buffer holds STRAIGHT (un-premultiplied)
  // color: heads are written with BLEND off as rgb = particleColor.rgb, a = 0.85·soft.
  // Fading all four channels dimmed the colour as well — and since the composite pass
  // (drawScreen → drawTexture(screenTexture, 1.0), blendFunc SRC_ALPHA/ONE_MINUS_SRC_ALPHA)
  // multiplies the colour by that same faded alpha a SECOND time, the visible trail decayed
  // with fadeOpacity² per frame: 0.972 behaved like 0.9448, i.e. HALF the documented
  // lifetime (~10 px instead of ~19 px at the DACH median of 2.2 m/s → a dot, no readable
  // direction). Measured and belegt in audit/windpartikel-schweif.md.
  // Keeping rgb and decaying only alpha makes the visible decay exactly fadeOpacity per
  // frame — what WindLayerOptions.fadeOpacity and MapView's comment have always claimed.
  // The composite pass (u_opacity = 1.0) is unaffected: rgb passes through and
  // floor(255·a)/255 is the identity on a value that already came from an 8-bit texture.
  // The floor() stays on alpha so the trail still terminates instead of decaying forever.
  gl_FragColor = vec4(color.rgb, floor(255.0 * color.a * u_opacity) / 255.0);
}
`;

export const updateFrag = `
precision highp float;

// highp sampler2D on both — see drawVert. u_particles is the exact-texel
// NEAREST position fetch; u_wind feeds the advection direction/speed directly,
// so a lowp-default coordinate/LOD computation here would corrupt the very
// (u,v) the whole shader advects by.
uniform highp sampler2D u_particles;
uniform highp sampler2D u_wind;
uniform vec2 u_wind_res;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform float u_rand_seed;
// DER Umrechnungsfaktor: equirect-X-Schritt je 1 m/s Wind und Frame.
// JS-seitig aus advectionStepScale() (s. advection.ts) — enthält Zoomgesetz,
// Weltbreite und dt-Normierung. Es gibt KEINEN weiteren Geschwindigkeits-
// Skalar mehr im Shader (früher: u_speed_factor · u_dt_scale · u_zoom_speed).
uniform float u_step_scale;
// Alt-Kennlinie („Rule 2"-Fallback), standardmäßig NEUTRAL: gamma 1 + min 0
// ⇒ dispSpeed == speed, also strikt proportional zum GRIB-Wert. Nur wer die
// frühere Stauchung zurückwill, setzt sie wieder (WindLayerOptions).
uniform float u_speed_gamma;
uniform float u_speed_ref;
uniform float u_speed_min;
uniform float u_drop_rate;
uniform float u_drop_rate_bump;
uniform float u_sub_steps;     // Advektions-Sub-Schritte (gekrümmte, glatte Pfade)
// Z3 — Umverteilung bei Rechteckwechsel (audit/windpartikel-rauszoom.md), 0/1.
// Bei 0 ist dieser Shader rechnerisch identisch zum Stand vor Z3 (Rule 2).
uniform float u_redistribute;
// Bezugsrechteck der Positionskodierung, equirect (x0,y0,x1,y1):
//   u_bounds_prev = Rechteck, mit dem der EINGEHENDE Zustand kodiert wurde
//   u_bounds      = Rechteck, mit dem der AUSGEHENDE Zustand kodiert wird
// Beim Schwenken/Zoomen unterscheiden sie sich; die Position wird exakt
// umgerechnet (dekodieren mit prev → advektieren absolut → kodieren mit neu).
uniform vec4 u_bounds;
uniform vec4 u_bounds_prev;
uniform vec4 u_data_uv_bounds;

varying vec2 v_tex_pos;

// equirect Y spannt 180°, X spannt 360° → N-S braucht Faktor 2 (s. advection.ts).
const float NS_ASPECT = 2.0;

const vec3 rand_constants = vec3(12.9898, 78.233, 4375.85453);
float rand(const vec2 co) {
  float t = dot(rand_constants.xy, co);
  return fract(sin(t) * (rand_constants.z + t));
}

vec2 lookup_wind(const vec2 uv) {
  vec2 px = 1.0 / u_wind_res;
  vec2 vc = (floor(uv * u_wind_res)) * px;
  vec2 f = fract(uv * u_wind_res);
  vec2 tl = texture2D(u_wind, vc).rg;
  vec2 tr = texture2D(u_wind, vc + vec2(px.x, 0)).rg;
  vec2 bl = texture2D(u_wind, vc + vec2(0, px.y)).rg;
  vec2 br = texture2D(u_wind, vc + px).rg;
  return mix(mix(tl, tr, f.x), mix(bl, br, f.x), f.y);
}

// Wertet den Wind an einer Position aus → Anzeige-Geschwindigkeitsvektor in m/s.
//
// EHRLICHKEITS-VERTRAG: der zurückgegebene Betrag IST die GRIB-Geschwindigkeit
// (u_speed_gamma = 1, u_speed_min = 0). Es findet hier keine Stauchung, kein
// Anheben und kein Mindesttempo statt — die einzige Umrechnung nach Pixeln
// steckt in u_step_scale und ist strikt linear.
//
// hasWind steuert AUSSCHLIESSLICH die Lebensdauer (Recycling), nicht das
// Tempo: in echter Flaute stauen sich Partikel sonst zu Klumpen.
vec2 dispVelocity(const vec2 p, out float speed_t, out float hasWind) {
  vec2 wind_uv = (p - u_data_uv_bounds.xy) /
                 (u_data_uv_bounds.zw - u_data_uv_bounds.xy);
  bool in_data = wind_uv.x >= 0.0 && wind_uv.x <= 1.0 &&
                 wind_uv.y >= 0.0 && wind_uv.y <= 1.0;
  vec2 raw_wind = in_data ? lookup_wind(wind_uv) : vec2(0.5);
  vec2 velocity = mix(u_wind_min, u_wind_max, raw_wind);
  if (!in_data) velocity = vec2(0.0);
  float speed = length(velocity);
  speed_t = speed / length(u_wind_max);
  hasWind = step(0.05, speed);
  if (speed < 0.001) return vec2(0.0);
  float dispSpeed = speed;
  if (u_speed_gamma != 1.0) dispSpeed = pow(speed / u_speed_ref, u_speed_gamma) * u_speed_ref;
  dispSpeed = max(u_speed_min, dispSpeed);
  return (velocity / speed) * dispSpeed;
}

const int MAX_SUB_STEPS = 4;

// Z3 — gleichverteilte Zufallsposition in new ohne (prev ∩ new), also in dem Ring
// bzw. Streifen des NEUEN Rechtecks, der im alten noch nicht enthalten war.
// o0/o1 = Überlappung prev∩new in lokalen Koordinaten des neuen Rechtecks.
// Der Rest zerfällt in vier Rechtecke (oben, unten, links, rechts der
// Überlappungszeilen); flächengewichtet eines wählen, darin gleichverteilt.
// Ist der Rest (praktisch) leer — Reinzoomen, unverändertes Rechteck — wird
// fallback (gleichverteilt im ganzen Rechteck) zurückgegeben.
vec2 ring_sample(const vec2 o0, const vec2 o1, const vec2 seed, const vec2 fallback) {
  float aTop = o0.y;
  float aBot = 1.0 - o1.y;
  float h = max(o1.y - o0.y, 0.0);
  float aLeft = o0.x * h;
  float aRight = (1.0 - o1.x) * h;
  float total = aTop + aBot + aLeft + aRight;
  if (total < 1e-4) return fallback;
  float r = rand(seed + 4.9) * total;
  vec2 u = vec2(rand(seed + 5.3), rand(seed + 6.1));
  if (r < aTop) return vec2(u.x, u.y * o0.y);
  r -= aTop;
  if (r < aBot) return vec2(u.x, o1.y + u.y * (1.0 - o1.y));
  r -= aBot;
  if (r < aLeft) return vec2(u.x * o0.x, o0.y + u.y * h);
  return vec2(o1.x + u.x * (1.0 - o1.x), o0.y + u.y * h);
}

void main() {
  vec4 color = texture2D(u_particles, v_tex_pos);

  // Dekodieren: bounds-relativ [0,1]² → absolute equirect-Position.
  vec2 spanPrev = max(u_bounds_prev.zw - u_bounds_prev.xy, vec2(1e-9));
  vec2 pos = u_bounds_prev.xy
      + vec2(color.r / 255.0 + color.b, color.g / 255.0 + color.a) * spanPrev;

  // Advektion in Sub-Schritten: der Gesamt-Schritt wird auf N Teilschritte
  // verteilt, der Wind bei jedem Teilschritt NEU abgetastet. So folgen die
  // Partikel gekrümmten Bahnen statt geraden Sprüngen → keine „gestrichelten"
  // Trails. Die Schrittweite selbst kommt vollständig aus u_step_scale.
  //
  // Zwei Achsenkorrekturen, beide geometrisch zwingend:
  //   /distortion  — Meridiankonvergenz: ein Ost-Wind legt bei hoher Breite
  //                  mehr Längengrade zurück (cos φ).
  //   ·NS_ASPECT   — equirect Y spannt 180°, X spannt 360°. OHNE diesen
  //                  Faktor läuft Nord-Süd nur halb so schnell wie Ost-West
  //                  (Richtungsfehler bis 19,47°; s. audit/wind-partikel-grib-treue.md).
  float steps = max(1.0, u_sub_steps);
  float speed_t = 0.0;
  float hasWind = 0.0;
  float hasWindAny = 0.0;
  for (int i = 0; i < MAX_SUB_STEPS; i++) {
    if (float(i) >= steps) break;
    vec2 dispVel = dispVelocity(pos, speed_t, hasWind);
    hasWindAny = max(hasWindAny, hasWind);
    float distortion = max(0.05, cos(radians(pos.y * 180.0 - 90.0)));
    vec2 offset = vec2(dispVel.x / distortion, -NS_ASPECT * dispVel.y)
        * u_step_scale / steps;
    pos = pos + offset;
  }
  hasWind = hasWindAny;

  // Kodieren: absolute equirect-Position → bounds-relativ [0,1]².
  vec2 span = max(u_bounds.zw - u_bounds.xy, vec2(1e-9));
  vec2 local = (pos - u_bounds.xy) / span;

  vec2 seed = (pos + v_tex_pos) * u_rand_seed;

  // Lebensdauer/Recycling. Zellen MIT Wind sollen lange leben, damit sie
  // sichtbare Streifen ziehen. Nur ECHTE Flaute (hasWind = 0) wird aggressiv
  // recycelt, damit sich dort nichts staut (Pile-up).
  //
  // Ausserhalb des Bezugsrechtecks ist ZWINGEND sofortiges Recycling nötig:
  // Werte ausserhalb [0,1] lassen sich in der bounds-relativen Kodierung nicht
  // darstellen. Das Rechteck ist Sichtfeld + 10 % — recycelt wird also erst,
  // wenn das Partikel deutlich ausserhalb des Bildes ist (früher: drop_rate
  // 0,07/Frame ≈ 14 Frames, ebenfalls unsichtbar).
  bool out_of_bounds =
      local.x < 0.0 || local.x > 1.0 || local.y < 0.0 || local.y > 1.0;
  float calm_boost = (1.0 - hasWind) * u_drop_rate_bump * 4.0;
  float drop_rate = u_drop_rate + speed_t * u_drop_rate_bump + calm_boost;
  float drop = step(1.0 - drop_rate, rand(seed));
  if (out_of_bounds) drop = 1.0;

  // Neustart-Position: gleichverteilt IM Bezugsrechteck (also direkt in
  // lokalen Koordinaten — kein Umweg über equirect nötig).
  vec2 random_local = vec2(rand(seed + 1.3), rand(seed + 2.1));

  // Z3 — Umverteilung bei Rechteckwechsel (audit/windpartikel-rauszoom.md).
  // Wächst das Rechteck (Rauszoomen) um den Faktor A = area(new)/area(prev),
  // liegen ALLE Partikel im alten Ausschnitt und würden nur über die normale
  // Lebensdauer (Sekunden) auslaufen. Stattdessen: Überschuss-Anteil 1 − 1/A
  // sofort recyceln — und Überschuss WIE Out-of-bounds-Partikel gleichverteilt
  // in new ohne (prev ∩ new) neu setzen (Ring beim Rauszoomen, nachrückender
  // Streifen beim Schwenken). Die Dichte ist damit nach JEDEM Frame gleich;
  // die verbleibenden Partikel behalten ihre Bahn. Bei u_redistribute = 0
  // bleibt exakt das Alt-Verhalten (excess 0, Spawn im ganzen Rechteck).
  vec2 o0 = clamp((u_bounds_prev.xy - u_bounds.xy) / span, 0.0, 1.0);
  vec2 o1 = clamp((u_bounds_prev.zw - u_bounds.xy) / span, 0.0, 1.0);
  float areaPrev = spanPrev.x * spanPrev.y;
  float areaNew = span.x * span.y;
  float excess = u_redistribute * clamp(1.0 - areaPrev / areaNew, 0.0, 1.0);
  float redrop = step(1.0 - excess, rand(seed + 3.7));
  float ring_drop = u_redistribute * max(redrop, out_of_bounds ? 1.0 : 0.0);
  vec2 spawn_local = random_local;
  if (ring_drop > 0.5) spawn_local = ring_sample(o0, o1, seed, random_local);
  drop = max(drop, redrop);

  local = mix(local, spawn_local, drop);
  local = clamp(local, 0.0, 1.0);

  gl_FragColor = vec4(
      fract(local * 255.0),
      floor(local * 255.0) / 255.0);
}
`;
