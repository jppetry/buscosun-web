export const drawVert = `
precision mediump float;

attribute float a_index;

uniform sampler2D u_particles;
uniform float u_particles_res;
uniform mat4 u_matrix;
uniform float u_point_size;

varying vec2 v_particle_pos;

const float PI = 3.14159265358979323846;
const float MERC_MAX_LAT = 85.05112878;

void main() {
  vec4 color = texture2D(u_particles, vec2(
      fract(a_index / u_particles_res),
      floor(a_index / u_particles_res) / u_particles_res));

  // equirectangular position in [0,1]
  v_particle_pos = vec2(
      color.r / 255.0 + color.b,
      color.g / 255.0 + color.a);

  float lng = v_particle_pos.x * 360.0 - 180.0;
  float lat = 90.0 - v_particle_pos.y * 180.0;
  lat = clamp(lat, -MERC_MAX_LAT, MERC_MAX_LAT);

  float lat_rad = lat * PI / 180.0;
  float merc_x = (lng + 180.0) / 360.0;
  float merc_y = 0.5 - log(tan(PI * 0.25 + lat_rad * 0.5)) / (2.0 * PI);

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
precision mediump float;

attribute float a_index;

uniform sampler2D u_particles;
uniform float u_particles_res;
uniform float u_point_size;

varying vec2 v_particle_pos;

const float MERC_MAX_LAT = 85.05112878;

void main() {
  vec4 color = texture2D(u_particles, vec2(
      fract(a_index / u_particles_res),
      floor(a_index / u_particles_res) / u_particles_res));

  v_particle_pos = vec2(
      color.r / 255.0 + color.b,
      color.g / 255.0 + color.a);

  float lng = v_particle_pos.x * 360.0 - 180.0;
  float lat = 90.0 - v_particle_pos.y * 180.0;
  lat = clamp(lat, -MERC_MAX_LAT, MERC_MAX_LAT);

  float lat_rad = lat * PI / 180.0;
  float merc_x = (lng + 180.0) / 360.0;
  float merc_y = 0.5 - log(tan(PI * 0.25 + lat_rad * 0.5)) / (2.0 * PI);

  gl_PointSize = u_point_size;
  gl_Position = projectTile(vec2(merc_x, merc_y));
}
`;

export const heatmapVertProjected = `
precision mediump float;

attribute vec2 a_lnglat;

varying vec2 v_equi_uv;

void main() {
  float lng = a_lnglat.x;
  float lat = a_lnglat.y;
  v_equi_uv = vec2((lng + 180.0) / 360.0, (90.0 - lat) / 180.0);
  float lat_rad = lat * PI / 180.0;
  float mx = (lng + 180.0) / 360.0;
  float my = 0.5 - log(tan(PI * 0.25 + lat_rad * 0.5)) / (2.0 * PI);
  gl_Position = projectTile(vec2(mx, my));
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

export const heatmapVert = `
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

varying vec2 v_tex_pos;

void main() {
  vec4 color = texture2D(u_screen, 1.0 - v_tex_pos);
  gl_FragColor = vec4(floor(255.0 * color * u_opacity) / 255.0);
}
`;

export const updateFrag = `
precision highp float;

uniform sampler2D u_particles;
uniform sampler2D u_wind;
uniform vec2 u_wind_res;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform float u_rand_seed;
uniform float u_speed_factor;
uniform float u_dt_scale;
uniform float u_zoom_speed;
uniform float u_speed_gamma;   // <1 hebt schwache Winde an (Anzeige-Kennlinie)
uniform float u_speed_ref;     // Anker-Windgeschwindigkeit (m/s), dort unverändert
uniform float u_speed_min;     // Mindest-Anzeigetempo (m/s) für JEDEN vorhandenen Wind
uniform float u_drop_rate;
uniform float u_drop_rate_bump;
uniform float u_sub_steps;     // Advektions-Sub-Schritte (gekrümmte, glatte Pfade)
uniform vec4 u_bounds;
uniform vec4 u_data_uv_bounds;

varying vec2 v_tex_pos;

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

// Wertet Wind an einer Position aus → Anzeige-Geschwindigkeit + „hat Wind?".
// (Anzeige-Kennlinie γ + Mindesttempo: schwache Winde anheben, damit JEDER Wind
//  sichtbar driftet; echte Flaute bleibt 0.)
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
  float dispSpeed = hasWind > 0.5
      ? max(u_speed_min, pow(speed / u_speed_ref, u_speed_gamma) * u_speed_ref)
      : 0.0;
  return speed > 0.001 ? (velocity / speed) * dispSpeed : vec2(0.0);
}

const int MAX_SUB_STEPS = 4;

void main() {
  vec4 color = texture2D(u_particles, v_tex_pos);
  vec2 pos = vec2(
      color.r / 255.0 + color.b,
      color.g / 255.0 + color.a);

  // Advektion in Sub-Schritten: der Gesamt-Schritt wird auf N Teilschritte
  // verteilt, der Wind bei jedem Teilschritt NEU abgetastet. So folgen die
  // Partikel gekrümmten Bahnen statt geraden Sprüngen → keine „gestrichelten"
  // Trails mehr, auch bei hohem speedFactor. u_dt_scale/u_zoom_speed wie gehabt.
  float steps = max(1.0, u_sub_steps);
  float speed_t = 0.0;
  float hasWind = 0.0;
  float hasWindAny = 0.0;
  for (int i = 0; i < MAX_SUB_STEPS; i++) {
    if (float(i) >= steps) break;
    vec2 dispVel = dispVelocity(pos, speed_t, hasWind);
    hasWindAny = max(hasWindAny, hasWind);
    float distortion = cos(radians(pos.y * 180.0 - 90.0));
    vec2 offset = vec2(dispVel.x / distortion, -dispVel.y)
        * 0.0001 * u_speed_factor * u_dt_scale * u_zoom_speed / steps;
    pos = fract(1.0 + pos + offset);
  }
  hasWind = hasWindAny;

  vec2 seed = (pos + v_tex_pos) * u_rand_seed;

  // Lebensdauer/Recycling. Zellen MIT Wind sollen lange leben, damit sie sichtbare
  // Streifen ziehen (vorher wurden schon schwach-windige Partikel in ~0,6 s neu
  // gewürfelt → wirkte wie Stillstand). Nur ECHTE Flaute (hasWind=0) wird aggressiv
  // recycelt, damit sich dort nichts staut (Pile-up). Da jeder Wind jetzt mit
  // mindestens u_speed_min driftet, verklumpen langsame Zellen ohnehin kaum.
  bool out_of_bounds =
      pos.x < u_bounds.x || pos.x > u_bounds.z ||
      pos.y < u_bounds.y || pos.y > u_bounds.w;
  float calm_boost = (1.0 - hasWind) * u_drop_rate_bump * 4.0;
  float drop_rate = u_drop_rate + speed_t * u_drop_rate_bump + calm_boost;
  if (out_of_bounds) drop_rate = max(drop_rate, 0.07);
  float drop = step(1.0 - drop_rate, rand(seed));

  // random position within the visible bounds (equirectangular space)
  vec2 random_pos = vec2(
      mix(u_bounds.x, u_bounds.z, rand(seed + 1.3)),
      mix(u_bounds.y, u_bounds.w, rand(seed + 2.1)));
  pos = mix(pos, random_pos, drop);

  gl_FragColor = vec4(
      fract(pos * 255.0),
      floor(pos * 255.0) / 255.0);
}
`;
