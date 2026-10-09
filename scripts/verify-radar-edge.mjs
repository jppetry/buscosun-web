// ---------------------------------------------------------------------------
// Phase RS — verify:radar-edge (audit/radar-randsaum.md, gate GRS)
//
// Light-blue ring around rain areas: the filter and the in-between pictures mixed a wet texel with the 0 of its dry
// neighbour; on the log plane that is the light-rain classes. The edge rule decides wet/dry from the measured texels.
//
// A  switch grammar (`radarEdgeFlagFrom`): `?hdedge=0|1|round|nearest|off`, store, default off (Rule 2)
// B  synthetic frames (Node replica of the shader, `scripts/lib/rainEdgeAlgebra.mjs`): a disc of 5 mm/h on the log plane —
//    old path paints where the nearest texel is dry (negative control), `round` only inside corner rounding, `nearest` never;
//    inside the disc the edge rule shows the measurement (no fade towards the border); a lone texel stays visible
// C  morph replica (flow 0) and `lerpValuesWet`: no picture of a texel that is dry on the nearer side in time, both-wet
//    texels mix as before, the old mix fades through small bytes (negative control)
// D  shader text: uniform `u_edge`, `sampleWet`, the edge branch before the old one, the old branch unchanged
// E  wiring: `RainLayer` default `off`, `MapView` passes the switch to the three HD layers and the 250-m tiles, the HD mixes
//    use `lerpValuesWet` with the switch, the composite mix stays `lerpValues`
// F  real frames when `RADAR_EDGE_RAW=<dir>` holds slot dirs with dual PNGs (`g<lead>.png`): halo area per filter, old vs.
//    edge rule (GRS: round ≤ 1 % of the wet area, nearest 0, fade inside ≤ 1 %), and the CPU mix of two consecutive RV slots
//
// Call: npm run verify:radar-edge   (optional: RADAR_EDGE_RAW=<dir>)
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { radarEdgeFlagFrom, RAIN_EDGES, RAIN_EDGE_CODE, RADAR_EDGE_DEFAULT } from '../src/scalar/radarHd.ts';
import { lerpValues, lerpValuesWet } from '../src/map/mapProfile.ts';
import { precipToU8Log, precipFromU8Log } from '../src/scalar/RainLayer.ts';
import { texelReader, shade, shadeMorph } from './lib/rainEdgeAlgebra.mjs';
import { decodePng } from './lib/png.mjs';

let passed = 0, failed = 0, skipped = 0;
const add = (name, ok, detail) => { if (ok) passed++; else failed++; console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`); };
const skip = (name, why) => { skipped++; console.log(`⊘ ${name} — ${why}`); };

// ── A: switch ────────────────────────────────────────────────────────────────
add('A1 default off without a vote (Rule 2)', RADAR_EDGE_DEFAULT === 'off' && radarEdgeFlagFrom('', null) === 'off');
add('A2 `?hdedge=1` = round, `?hdedge=0` = off, words pick the rule', radarEdgeFlagFrom('?hdedge=1', null) === 'round' && radarEdgeFlagFrom('?hdedge=0', 'round') === 'off'
  && radarEdgeFlagFrom('?hdedge=nearest', null) === 'nearest' && radarEdgeFlagFrom('?hdedge=round', '0') === 'round');
add('A3 store counts without a query vote, unknown word / broken query = no vote', radarEdgeFlagFrom('', '1') === 'round' && radarEdgeFlagFrom('', 'nearest') === 'nearest'
  && radarEdgeFlagFrom('?hdedge=foo', 'nearest') === 'nearest' && radarEdgeFlagFrom('%E0%A4%A', null) === 'off');
add('A4 codes off 0 · round 1 · nearest 2', RAIN_EDGES.length === 3 && RAIN_EDGE_CODE.off === 0 && RAIN_EDGE_CODE.round === 1 && RAIN_EDGE_CODE.nearest === 2);

// ── shared measurement ───────────────────────────────────────────────────────
const S = 4;
/** Halo = drawn sub-sample whose nearest texel is dry; fade = sub-sample in a wet texel drawn < ½ of its own rate (or not at all). */
function measure(vals, W, H, filter, edge) {
  const at = texelReader(vals, W, H);
  const near = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (vals[y * W + x]) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) near[yy * W + xx] = 1; }
  }
  let halo = 0, haloLight = 0, fade = 0, wet = 0;
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (!near[ty * W + tx]) continue;
    const own = vals[ty * W + tx];
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const t = shade(at, tx + (sx + 0.5) / S, ty + (sy + 0.5) / S, filter, edge);
      const shown = t > 0 ? Math.max(1, Math.round(t * 255)) : 0;
      if (!own) { if (shown) { halo++; if (precipFromU8Log(shown) < 0.5) haloLight++; } }
      else { wet++; if (!shown || precipFromU8Log(shown) < 0.5 * precipFromU8Log(own)) fade++; }
    }
  }
  return { wetKm2: wet / (S * S), haloKm2: halo / (S * S), haloPct: (100 * halo) / Math.max(1, wet), haloLightPct: (100 * haloLight) / Math.max(1, halo), fadePct: (100 * fade) / Math.max(1, wet) };
}
const fmt = (m) => `Saum ${m.haloPct.toFixed(2)} % (${Math.round(m.haloKm2)} km², ${m.haloLightPct.toFixed(0)} % < 0,5 mm/h) · Abschwächung innen ${m.fadePct.toFixed(2)} %`;

// ── B: synthetic disc ────────────────────────────────────────────────────────
{
  const W = 64, H = 64, disc = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x + 0.5 - 32) ** 2 + (y + 0.5 - 32) ** 2 <= 12 ** 2) disc[y * W + x] = precipToU8Log(5);
  const old = measure(disc, W, H, 'catmull', 'off'), oldB = measure(disc, W, H, 'bspline', 'off');
  add('B1 negative control: the old path paints a light-blue ring outside the disc', old.haloPct > 5 && old.haloLightPct > 90 && oldB.haloPct > old.haloPct, `catmull ${fmt(old)} · bspline ${fmt(oldB)}`);
  for (const filter of ['catmull', 'bspline', 'bilinear', 'nearest']) {
    const r = measure(disc, W, H, filter, 'round'), n = measure(disc, W, H, filter, 'nearest');
    add(`B2 ${filter}: round ≤ 1 % out and in (corners rounded), nearest exactly the wet texels`, r.haloPct <= 1 && r.fadePct <= 1 && n.haloKm2 === 0 && n.fadePct === 0, `round ${fmt(r)} · nearest ${fmt(n)}`);
  }
  // inside a uniform disc the edge rule shows the texel's own byte everywhere (no fade towards the border)
  const at = texelReader(disc, W, H);
  let off = 0, cnt = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (disc[y * W + x]) for (let s = 0; s < 16; s++) {
    const t = shade(at, x + ((s % 4) + 0.5) / 4, y + (Math.floor(s / 4) + 0.5) / 4, 'catmull', 'round');
    cnt++; if (t > 0 && Math.abs(t * 255 - disc[y * W + x]) > 1e-6) off++;
  }
  add('B3 uniform disc: every drawn point carries exactly the measured byte (catmull, round)', off === 0 && cnt > 0, `${cnt} Punkte`);
  // a lone wet texel of light rain stays visible (round: the rounded core, nearest: the whole texel)
  const lone = new Uint8Array(9 * 9); lone[4 * 9 + 4] = precipToU8Log(0.1);
  const la = texelReader(lone, 9, 9);
  add('B4 a lone texel of 0,1 mm/h stays visible at its centre (round + nearest) and nowhere outside its texel (nearest)',
    shade(la, 4.5, 4.5, 'catmull', 'round') > 0 && shade(la, 4.5, 4.5, 'catmull', 'nearest') > 0 && shade(la, 5.2, 4.5, 'catmull', 'nearest') === 0 && shade(la, 3.9, 4.5, 'catmull', 'nearest') === 0);
}

// ── C: time mix ──────────────────────────────────────────────────────────────
{
  // A: disc at x 26, B: same disc moved 6 texels east (rain arriving in the east, leaving in the west)
  const W = 64, H = 40, A = new Uint8Array(W * H), B = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if ((x + 0.5 - 26) ** 2 + (y + 0.5 - 20) ** 2 <= 9 ** 2) A[y * W + x] = precipToU8Log(4);
    if ((x + 0.5 - 32) ** 2 + (y + 0.5 - 20) ** 2 <= 9 ** 2) B[y * W + x] = precipToU8Log(6);
  }
  const atA = texelReader(A, W, H), atB = texelReader(B, W, H);
  const farSide = (edge, frac) => {
    let far = 0, faded = 0, both = 0, bothOk = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = A[y * W + x], b = B[y * W + x];
      const t = shadeMorph(atA, atB, x + 0.5, y + 0.5, 'catmull', edge, frac);
      const nearer = frac < 0.5 ? a : b;
      if (!nearer && t > 0) { far++; if (precipFromU8Log(Math.round(t * 255)) < 0.5) faded++; }
      if (a && b) { both++; if (t > 0) bothOk++; }
    }
    return { far, faded, both, bothOk };
  };
  const o = [0.2, 0.4, 0.6, 0.8].map((f) => farSide('off', f)), e = [0.2, 0.4, 0.6, 0.8].map((f) => farSide('round', f)), n = [0.2, 0.4, 0.6, 0.8].map((f) => farSide('nearest', f));
  add('C1 negative control: the old morph mix shows texels dry on the nearer side, faded into light classes', o.every((r) => r.far > 0 && r.faded > 0), o.map((r) => `${r.far}/${r.faded}`).join(' · '));
  add('C2 edge rule (round, nearest): no texel centre drawn that is dry on the nearer side; both-wet texels always drawn', [...e, ...n].every((r) => r.far === 0 && r.bothOk === r.both), e.map((r) => r.far).join('/') + ' · ' + n.map((r) => r.far).join('/'));
  // CPU mix
  const buf = new Uint8Array(W * H), buf2 = new Uint8Array(W * H);
  let bad = 0, sameBoth = 0, nBoth = 0, oldFar = 0;
  for (const f of [0.05, 0.25, 0.49, 0.5, 0.75, 0.95]) {
    lerpValuesWet(A, B, f, buf); lerpValues(A, B, f, buf2);
    for (let i = 0; i < W * H; i++) {
      const nearer = f < 0.5 ? A[i] : B[i];
      if (!nearer && buf[i]) bad++;
      if (nearer && !buf[i]) bad++;
      if (!nearer && buf2[i]) oldFar++;
      if (A[i] && B[i]) { nBoth++; if (buf[i] === Math.max(1, buf2[i])) sameBoth++; }
    }
  }
  add('C3 `lerpValuesWet`: a value exactly where the nearer side is wet; both-wet = `lerpValues`; the old mix shows the far side (control)', bad === 0 && sameBoth === nBoth && oldFar > 0, `alt ${oldFar} Texel auf der fernen Seite`);
  const z = new Uint8Array(4);
  add('C4 `lerpValuesWet` dry ⇔ dry and clamps frac', lerpValuesWet(z, z, 0.5, new Uint8Array(4)).every((v) => v === 0)
    && lerpValuesWet(Uint8Array.of(10), Uint8Array.of(0), -1, new Uint8Array(1))[0] === 10 && lerpValuesWet(Uint8Array.of(10), Uint8Array.of(0), 2, new Uint8Array(1))[0] === 0);
}

// ── D: shader text ───────────────────────────────────────────────────────────
const rain = readFileSync('src/scalar/RainLayer.ts', 'utf8');
const fragSrc = rain.slice(rain.indexOf('const frag = `'), rain.indexOf('`;', rain.indexOf('const frag = `')));
add('D1 shader declares `u_edge` and `sampleWet`, wet threshold ½ byte', /uniform int u_edge;/.test(fragSrc) && /float sampleWet\(sampler2D sm, vec2 uv, out float ind\)/.test(fragSrc) && /const float WET = 0\.5 \/ 255\.0;/.test(fragSrc));
add('D2 edge branch: discard on the wet share (frame and morph), dry side never enters the morph value',
  /if \(u_edge != 0\) \{/.test(fragSrc) && /if \(ia < 0\.5\) discard;/.test(fragSrc) && /if \(mix\(ia, ib, u_frac\) < 0\.5\) discard;/.test(fragSrc)
  && /t = ta > 0\.0 && tb > 0\.0 \? mix\(ta, tb, u_frac\) : max\(ta, tb\);/.test(fragSrc));
add('D3 old branch unchanged (`else if` morph mix, single frame, discard < 0.002)', /\} else if \(u_morph_on > 0\.5\) \{/.test(fragSrc) && /t = mix\(ta, tb, u_frac\);/.test(fragSrc)
  && /t = sampleAny\(u_value, v_uv\);/.test(fragSrc) && /if \(t < 0\.002\) discard;/.test(fragSrc));
add('D4 no backtick inside the shader source (would end the template literal)', !/[`]/.test(fragSrc.slice('const frag = `'.length)));
add('D5 the replica follows the shader: fill for dry texels, clamp to the wet inner range, nearest = step(own)',
  /row \+= wx\[i\] \* \(t >= WET \? t : fill\);/.test(fragSrc) && /return u_filter == 1 \? clamp\(s, lo, hi\) : max\(s, 0\.0\);/.test(fragSrc)
  && /ind = u_edge == 2 \? step\(WET, own\) : iw;/.test(fragSrc) && /vec4 lo4 = mix\(vec4\(1\.0\), v, w\), hi4 = v \* w;/.test(fragSrc));
add('D6 render sets `u_edge` from the layer', /gl\.uniform1i\(p\.u_edge as WebGLUniformLocation, RAIN_EDGE_CODE\[this\.edge\]\);/.test(rain));

// ── E: wiring ────────────────────────────────────────────────────────────────
const mv = readFileSync('src/MapView.tsx', 'utf8');
add('E1 RainLayer default edge `off`', /this\.edge = options\.edge \?\? 'off';/.test(rain));
add('E2 MapView: switch read once, passed to the three HD layers and the 250-m tiles',
  /const hdEdgeRef = useRef\(radarEdgeFlagFrom\(\)\);/.test(mv) && (mv.match(/filter: hd\.filter, edge: hdEdgeRef\.current \}/g) ?? []).length === 4);
add('E3 HD mixes use `mixHd` (= `lerpValuesWet` with the switch), the composite mix stays `lerpValues`',
  /const mixHd = hdEdgeRef\.current === 'off' \? lerpValues : lerpValuesWet;/.test(mv) && (mv.match(/mixHd\(/g) ?? []).length === 7
  && /shown = \{ \.\.\.a, values: lerpValues\(a\.values, b\.values, q, buf\) \};/.test(mv) && (mv.match(/lerpValues\(/g) ?? []).length === 1);

// ── F: real frames ───────────────────────────────────────────────────────────
const RAW = process.env.RADAR_EDGE_RAW;
if (!RAW || !existsSync(RAW)) skip('F real frames', 'RADAR_EDGE_RAW nicht gesetzt (Ordner mit Slot-Ordnern rv-*/inca-* und g<lead>.png)');
else {
  const logPlane = (file) => { const p = decodePng(readFileSync(file)); const n = p.width * p.height, out = new Uint8Array(n); for (let i = 0; i < n; i++) out[i] = p.data[i * p.channels + 1]; return { W: p.width, H: p.height, v: out }; };
  const slots = readdirSync(RAW).filter((d) => existsSync(join(RAW, d, 'meta.json'))).sort();
  const rv = [];
  for (const d of slots) {
    const g = readdirSync(join(RAW, d)).filter((f) => /^g\d{3}\.png$/.test(f)).sort()[0];
    if (!g) continue;
    const f = logPlane(join(RAW, d, g));
    if (d.startsWith('rv-')) rv.push({ d, ...f });
    const old = measure(f.v, f.W, f.H, 'catmull', 'off'), r = measure(f.v, f.W, f.H, 'catmull', 'round'), n = measure(f.v, f.W, f.H, 'catmull', 'nearest');
    add(`F1 ${d}/${g} (catmull): round ≤ 1 %, nearest 0, fade inside ≤ 1 %; old path > 1 % (control)`,
      r.haloPct <= 1 && n.haloKm2 === 0 && r.fadePct <= 1 && n.fadePct <= 1 && old.haloPct > 1,
      `alt ${fmt(old)} · round ${fmt(r)} · nearest ${fmt(n)}`);
  }
  if (rv.length >= 2) {
    const [a, b] = rv.slice(-2);
    const buf = new Uint8Array(a.v.length), buf2 = new Uint8Array(a.v.length);
    let bad = 0, oldLight = 0, oneSide = 0;
    for (let i = 0; i < a.v.length; i++) if (!a.v[i] !== !b.v[i]) oneSide++;
    for (const q of [0.25, 0.75]) {
      lerpValuesWet(a.v, b.v, q, buf); lerpValues(a.v, b.v, q, buf2);
      for (let i = 0; i < a.v.length; i++) {
        const nearer = q < 0.5 ? a.v[i] : b.v[i];
        if (!nearer && buf[i]) bad++;
        if (!nearer && buf2[i] && precipFromU8Log(buf2[i]) < 0.5) oldLight++;
      }
    }
    add(`F2 CPU mix ${a.d} → ${b.d}: no texel drawn that is dry on the nearer side; old mix painted light classes there (control)`, bad === 0 && oldLight > 0,
      `${oneSide} Texel nur auf einer Seite nass · alt ${oldLight} km² Hellblau auf der fernen Seite (q ¼ + ¾)`);
  } else skip('F2 CPU mix', 'weniger als zwei RV-Slots');
}

console.log(`\nverify:radar-edge — ${passed} ✔, ${failed} ✘, ${skipped} ⊘`);
process.exit(failed ? 1 : 0);
