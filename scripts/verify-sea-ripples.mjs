#!/usr/bin/env node
/**
 * verify:sea-ripples — phase SR, the surface current as moving ripple fronts on the map of /seewetter
 * (audit/seewetter-riffel.md). No network, no browser, no canvas: the pure functions, the particle state, the producer
 * on the real cut of phase ST, and the source text. What this verifier cannot say: how the layer LOOKS and which frame
 * rate it holds — nobody measured that in this phase (Jan checks the look himself).
 *
 * Fixtures `scripts/lib/fixtures/sea/ripples/`: two hourly u/v images of the real BSH run 2026111812, byte-exact copies
 * of the local producer run of the phase (manifest with sha256). `scripts/lib/fixtures/sea/current/`: the real GRIB cut
 * and the ecCodes reference of phase ST.
 *
 *   A  u/v field: grid, coding round trip, never data in alpha, refusals; the producer on the real cut against ecCodes
 *   B  flow between two hours: components mixed linearly — through zero at slack water (real field, negative control)
 *   C  one front: tip downstream, bends with the field, cut at land; spacing, widths, the curve, the way behind a packet
 *   D  particles: spawn rule, never on land, calm water stays empty, speed per frame, fade at slack, lives, determinism
 *   E  area scaling with its cap; visible water; the three levers of the frame governor in their order
 *   F  colour area: tint by speed over the layer's own water tone, land transparent, rows in web mercator
 *   G  reduced motion, hidden tab, no WebGL, no switch, link and dock, legend words, no new dependency
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as C from '../src/sea/seaCurrent.ts';
import * as R from '../src/sea/seaRipples.ts';
import { RippleSim } from '../src/sea/seaRippleSim.ts';
import { FrameGovernor } from '../src/wind/perfGovernor.ts';
import { SEA_MODELS, seaCurrentPath, seaCurrentUvPath, seaCurrentFieldPath, mergeSpotCatalogs } from '../src/sea/seaContract.ts';
import { SEA_LAYERS, SEA_DEFAULT_STATE, parseSeaUrl, buildSeaUrl } from '../src/sea/seaState.ts';
import { LAYER_LABEL, SEA_OUT_ROWS, SEA_ROW_MAP, SEA_FIELD_BOUNDS } from '../src/sea/seaView.ts';
import { readRun, buildCurrent, pruneCurrent } from './sea/sea-current.mjs';
import { readStatus } from './sea/sea-derive.mjs';
import { decodePng, toRgba } from './lib/png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FIX = join(HERE, 'lib', 'fixtures', 'sea');
const FR = join(FIX, 'ripples'), FC = join(FIX, 'current');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail ?? '') });
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const H = 3_600_000, G = SEA_MODELS.cwam.grid, UV = C.SEA_CURRENT_UV;

const MAN = JSON.parse(readFileSync(join(FR, 'manifest.json'), 'utf8'));
const realGrid = (name) => C.decodeUvField(toRgba(decodePng(readFileSync(join(FR, name)))));
const REAL6 = realGrid('uv-2026111812-006.png'), REAL9 = realGrid('uv-2026111812-009.png');

/** A synthetic grid of the contract's size: `fn(x, y)` → { u, v } in m/s, or null for land. */
function grid(fn) {
  const n = UV.nx * UV.ny, g = { nx: UV.nx, ny: UV.ny, u: new Float32Array(n), v: new Float32Array(n), ok: new Uint8Array(n) };
  for (let y = 0; y < UV.ny; y++) for (let x = 0; x < UV.nx; x++) { const f = fn(x, y); if (f) { const p = y * UV.nx + x; g.ok[p] = 1; g.u[p] = f.u; g.v[p] = f.v; } }
  return g;
}
/** A view of 680 × 380 px at zoom 8 with its top-left corner at 7.2° E / 54.6° N (German Bight, inside the grid). */
const VIEW = (() => { const a = 512 * 256; return { ax: a, bx: -a * R.mercX(7.2), ay: a, by: -a * R.mercY(54.6), w: 680, h: 380 }; })();
const gridXOfPx = (px) => ((R.lonOfMercX((px - VIEW.bx) / VIEW.ax) - G.lon1) / G.di - UV.off) / UV.stride;
const pxOfGridX = (gx) => VIEW.ax * R.mercX(G.lon1 + (UV.off + gx * UV.stride) * G.di) + VIEW.bx;

// --- A  the u/v field ---------------------------------------------------------------------------------------------
{
  add('A1 Gitter: jede zweite CWAM-Zelle, 315 × 194, Stufe 0,02 m/s; Grenze 4 MB je Lauf benannt', UV.stride === 2 && UV.off === 0 && UV.nx === 315 && UV.ny === 194 && UV.stepMs === 0.02 && C.SEA_CURRENT_UV_MAX_RUN_BYTES === 4_000_000);
  const px = new Uint8Array(4);
  let worst = 0, alpha = true, okSign = true;
  for (let i = 0; i < 4000; i++) {
    const u = (Math.sin(i * 12.9898) * 2.5), v = (Math.cos(i * 78.233) * 2.5);
    C.encodeUvPixel(px, 0, { u, v });
    const d = C.decodeUvPixel(px, 0);
    worst = Math.max(worst, Math.abs(d.u - u), Math.abs(d.v - v));
    if (px[3] !== 255) alpha = false;
    if (Math.abs(u) > 0.02 && Math.sign(d.u) !== Math.sign(u)) okSign = false;
  }
  add('A2 Hin und zurück: u und v bis ± 2,5 m/s auf eine halbe Stufe genau (0,01 m/s), Vorzeichen erhalten', worst <= 0.01 + 1e-9 && okSign, `größte Abweichung ${worst}`);
  add('A3 Alpha ist immer 255 — mit Wert und ohne', alpha && (C.encodeUvPixel(px, 0, null), px[3] === 255 && px[2] === C.SEA_CURRENT_UV_NULL && C.decodeUvPixel(px, 0) === null));
  C.encodeUvPixel(px, 0, { u: 9, v: -9 });
  const clip = C.decodeUvPixel(px, 0);
  add('A4 über ± 2,54 m/s wird gekappt, nie umgebrochen; das Byte 0 kommt bei einem Wert nicht vor', near(clip.u, 2.54) && near(clip.v, -2.54) && px[0] === 255 && px[1] === 1);
  C.encodeUvPixel(px, 0, { u: 0, v: 0 });
  add('A5 stehendes Wasser ist der Wert 0 / 0, kein Loch', px[0] === 128 && px[1] === 128 && px[2] === 0 && C.decodeUvPixel(px, 0)?.u === 0);
  C.encodeUvPixel(px, 0, { u: NaN, v: 1 });
  add('A6 ein nicht endlicher Wert wird „kein Wert“, nie eine Zahl', C.decodeUvPixel(px, 0) === null);

  // fixtures are what was recorded
  const bad = Object.entries(MAN.files).filter(([n, f]) => !existsSync(join(FR, n)) || sha(readFileSync(join(FR, n))) !== f.sha256 || readFileSync(join(FR, n)).length !== f.bytes);
  add('A7 die beiden echten Stundenbilder sind byte-gleich mit ihrer Aufzeichnung (sha256, Länge)', Object.keys(MAN.files).length === 2 && bad.length === 0, bad.map((b) => b[0]).join(', '));
  const raw6 = toRgba(decodePng(readFileSync(join(FR, 'uv-2026111812-006.png'))));
  let a255 = true, marks = true;
  for (let o = 0; o < raw6.length; o += 4) { if (raw6[o + 3] !== 255) a255 = false; if (raw6[o + 2] !== 0 && raw6[o + 2] !== 255) marks = false; }
  add('A8 echtes Bild: 315 × 194, jedes Alpha 255, Marke nur 0 oder 255', raw6.length === 315 * 194 * 4 && a255 && marks);
  let n6 = 0, n9 = 0, same = true, max = 0;
  for (let p = 0; p < REAL6.ok.length; p++) { n6 += REAL6.ok[p]; n9 += REAL9.ok[p]; if (REAL6.ok[p] !== REAL9.ok[p]) same = false; if (REAL6.ok[p]) max = Math.max(max, Math.hypot(REAL6.u[p], REAL6.v[p])); }
  add('A9 echtes Feld: 31 066 Wasserpunkte, dieselbe Maske in beiden Stunden, Betrag plausibel (unter 2,54 m/s, über 0,5 m/s)', n6 === 31066 && n9 === 31066 && same && max < 2.54 && max > 0.5, `${n6} / ${n9}, max ${max}`);
  add('A10 Größe: der gemessene Lauf (72 Bilder) liegt unter der Grenze, die beiden Bilder passen dazu', MAN.runUvBytes === 2468697 && MAN.runUvBytes < C.SEA_CURRENT_UV_MAX_RUN_BYTES && Object.values(MAN.files).every((f) => Math.abs(f.bytes - MAN.runUvBytes / 72) < 6000));

  // refusals of the reader
  const good = new Uint8Array(raw6);
  const t1 = new Uint8Array(good); t1[3] = 254;
  const t2 = new Uint8Array(good); t2[2] = 7;
  let firstVal = 0; while (good[firstVal + 2] !== 0) firstVal += 4;
  const t3 = new Uint8Array(good); t3[firstVal] = 0;
  add('A11 der Leser lehnt ab: ein Alpha ungleich 255, eine fremde Marke, das Byte 0 bei einem Wert, eine falsche Größe', C.decodeUvField(good) !== null && C.decodeUvField(t1) === null && C.decodeUvField(t2) === null && C.decodeUvField(t3) === null && C.decodeUvField(good.subarray(0, good.length - 4)) === null);

  // the producer on the real cut of phase ST, against ecCodes
  const CAT = mergeSpotCatalogs(JSON.parse(readFileSync(join(FIX, 'static', 'spots.json'), 'utf8')).spots, JSON.parse(readFileSync(join(FIX, 'dk', 'spots-dk.json'), 'utf8')).spots);
  const CUT = { db: new Uint8Array(readFileSync(join(FC, 'run', 'Current_db_2026111800_00.grb2'))), wb: new Uint8Array(readFileSync(join(FC, 'run', 'Current_wb_2026111800_00.grb2'))) };
  const REF = JSON.parse(readFileSync(join(FC, 'reference-eccodes.json'), 'utf8'));
  const rr = readRun({ buffers: { db: [CUT.db], wb: [CUT.wb] }, spots: CAT });
  const cutGrid = rr.uvPngs.length === 1 ? C.decodeUvField(toRgba(decodePng(rr.uvPngs[0]))) : null;
  add('A12 Producer am echten Ausschnitt: ein u/v-Bild je voller Stunde, lesbar nach Vertrag', rr.uvPngs.length === 1 && rr.hours === 1 && !!cutGrid);
  let cmp = 0, off = [];
  for (const [id, s] of Object.entries(rr.spots)) {
    const [i, j] = s.cell;
    if (i % 2 || j % 2 || (s.pkg === 'wb' && i < 240)) continue;      // only cells the stride keeps; the overlap belongs to db
    const ref = REF.files[`Current_${s.pkg}_2026111800_00.grb2`], k = String(C.bshIndexOfCwam(s.pkg, i, j));
    const u = ref[2].at[k], v = ref[3].at[k], p = (j / 2) * UV.nx + i / 2;
    if (u == null || v == null) continue;
    cmp++;
    const still = Math.hypot(u, v) < C.BSH_CURRENT_ZERO_MS;
    if (!cutGrid?.ok[p] || Math.abs(cutGrid.u[p] - (still ? 0 : u)) > 0.0101 || Math.abs(cutGrid.v[p] - (still ? 0 : v)) > 0.0101) off.push(id);
  }
  add('A13 … u und v an den Zellen der Spots = ecCodes an derselben Zelle, auf eine halbe Stufe (mindestens 8 Zellen verglichen)', cmp >= 8 && off.length === 0, `${cmp} verglichen, abweichend: ${off.join(', ')}`);
  // against the thinned arrow field of the same run (speed and bearing) at the cells both grids carry
  const thin = toRgba(decodePng(rr.pngs[0])), fx = C.SEA_CURRENT_FIELD;
  let both = 0, bad2 = 0;
  for (let y = 0; y < fx.ny; y++) for (let x = 0; x < fx.nx; x++) {
    const c = C.currentFieldCell(x, y);
    if (c.i % 2 || c.j % 2) continue;
    const t = C.decodeCurrentPixel(thin, (y * fx.nx + x) * 4), p = (c.j / 2) * UV.nx + c.i / 2;
    if (!t || !cutGrid?.ok[p]) continue;
    both++;
    const sp = Math.hypot(cutGrid.u[p], cutGrid.v[p]) * 100, to = ((Math.atan2(cutGrid.u[p], cutGrid.v[p]) * 180) / Math.PI + 360) % 360;
    const dAng = Math.abs(((to - t.to + 540) % 360) - 180);
    if (Math.abs(sp - t.cms) > 2.5 || (t.cms > 25 && dAng > 6)) bad2++;
  }
  add('A14 … und passt zum Pfeilfeld desselben Laufs (Betrag auf 2,5 cm/s, Richtung auf 6° ab 25 cm/s; über 300 gemeinsame Zellen)', both > 300 && bad2 === 0, `${both} gemeinsam, ${bad2} abweichend`);
  add('A15 ohne u/v-Feld (uv: false) schreibt der Leser keines — der Rest ist derselbe', (() => { const r0 = readRun({ buffers: { db: [CUT.db], wb: [CUT.wb] }, spots: CAT, uv: false }); return r0.uvPngs.length === 0 && r0.pngs.length === 1 && JSON.stringify(r0.spots) === JSON.stringify(rr.spots); })());

  // the whole producer into a store
  const tmp = mkdtempSync(join(tmpdir(), 'sea-ripples-'));
  try {
    const mkStore = (name) => { const d = join(tmp, name); mkdirSync(join(d, 'static'), { recursive: true }); cpSync(join(FIX, 'static', 'spots.json'), join(d, 'static', 'spots.json')); cpSync(join(FIX, 'dk', 'spots-dk.json'), join(d, 'static', 'spots-dk.json')); return d; };
    const NOW = Date.parse('2026-11-18T07:00:00Z'), RUN = '2026111800';
    const source = () => ({ name: 'filebox', base: 'fixture',
      async list(pkg) { return [{ name: `Current_${pkg}_${RUN}_00.grb2`, size: CUT[pkg].length, mtimeMs: NOW - H }]; },
      async get(pkg) { return CUT[pkg]; } });
    const st = mkStore('uv');
    const b1 = await buildCurrent({ storeDir: st, nowMs: NOW, sources: [source()], uv: true });
    const doc = JSON.parse(readFileSync(join(st, seaCurrentPath(RUN)), 'utf8')), ptr = C.currentPointerOf(readStatus(st));
    add('A16 ganzer Producer: Bild unter current/<lauf>/uv/, Angaben in der Datei, Zeiger in status.json — das Pfeilfeld bleibt daneben', b1.built && existsSync(join(st, seaCurrentUvPath(RUN, 0))) && existsSync(join(st, seaCurrentFieldPath(RUN, 0))) && doc.uv?.nx === 315 && doc.uv.stride === 2 && doc.uv.stepMs === 0.02 && doc.uv.hours === 1 && doc.uv.bytes === readFileSync(join(st, seaCurrentUvPath(RUN, 0))).length && ptr?.uv === true && readStatus(st).current.uvBytes === doc.uv.bytes && C.seaCurrentProblems(doc).length === 0);
    const st0 = mkStore('nouv');
    await buildCurrent({ storeDir: st0, nowMs: NOW, sources: [source()], uv: false });
    const doc0 = JSON.parse(readFileSync(join(st0, seaCurrentPath(RUN)), 'utf8'));
    add('A17 Producer-Schalter SEA_CURRENT_UV=0: kein Verzeichnis, uv = null, Zeiger ohne Feld — die Ebene hat dann „keine Daten“', !existsSync(join(st0, 'current', RUN, 'uv')) && doc0.uv === null && C.currentPointerOf(readStatus(st0))?.uv === false && C.currentUvHour(doc0, doc0.t0) === null && /process\.env\.SEA_CURRENT_UV !== '0'/.test(src('scripts/sea/sea-current.mjs')));
    add('A18 Aufbewahrung: mit dem Lauf geht sein u/v-Verzeichnis', (() => { pruneCurrent(st, 0); return !existsSync(join(st, 'current', RUN)) && !existsSync(join(st, seaCurrentPath(RUN))); })());
    const foreign = { ...doc, uv: { ...doc.uv, stride: 1 } };
    const old = JSON.parse(readFileSync(join(FC, 'doc.json'), 'utf8'));
    add('A19 Werteprüfung: ein fremdes Gitter fällt auf; eine Datei von vor der Phase (ohne uv) bleibt gültig und trägt kein Feld', C.seaCurrentProblems(foreign).some((x) => /uv/.test(x)) && C.seaCurrentProblems(old).length === 0 && old.uv === undefined && C.currentUvHour(old, old.t0) === null);
    add('A20 Stunde des Felds: innerhalb des Laufs der Index, davor und dahinter null', C.currentUvHour(doc, doc.t0) === 0 && C.currentUvHour(doc, doc.t0 + 20 * 60_000) === 0 && C.currentUvHour(doc, doc.t0 - H) === null && C.currentUvHour(doc, doc.t0 + H) === null);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  const c = C.currentUvCell(10, 20), back = C.currentUvXY(c.lat, c.lon);
  add('A21 Lage: Zelle (x, y) ↔ Position, hin und zurück', c.i === 20 && c.j === 40 && near(back.x, 10, 1e-6) && near(back.y, 20, 1e-6) && near(c.lon, G.lon1 + 20 * G.di) && near(c.lat, G.lat1 - 40 * G.dj));
}

// --- B  flow between two hours ---------------------------------------------------------------------------------------
{
  const a = { u: 0.6, v: 0 }, b = { u: -0.6, v: 0 };
  const speeds = [0, 0.25, 0.5, 0.75, 1].map((w) => R.flowSpeed(R.lerpFlow(a, b, w)));
  add('B1 kenternder Strom: zwischen +0,6 und −0,6 m/s geht der Betrag durch null (0,6 · 0,3 · 0 · 0,3 · 0,6)', speeds.every((s, i) => near(s, [0.6, 0.3, 0, 0.3, 0.6][i], 1e-9)));
  // negative control: mixing speed and bearing keeps the full speed at the turn
  const naive = (w) => { const sa = Math.hypot(a.u, a.v), sb = Math.hypot(b.u, b.v); return sa + (sb - sa) * w; };
  add('B2 Gegenprobe: Betrag und Richtung gemischt hielte am Kentern die volle Stärke (0,6) — das ist NICHT die Regel', near(naive(0.5), 0.6) && R.flowSpeed(R.lerpFlow(a, b, 0.5)) < 1e-9);
  const ga = grid(() => ({ u: 0.6, v: 0.2 })), gb = grid(() => ({ u: -0.6, v: -0.2 })), out = { u: 9, v: 9 };
  const at = (w) => (R.sampleBlend(ga, gb, w, 100.3, 80.7, out) ? Math.hypot(out.u, out.v) : NaN);
  add('B3 dasselbe am Gitter: Gewicht 0 = Stunde davor, 1 = gewählte Stunde, 0,5 = stehendes Wasser', near(at(0), Math.hypot(0.6, 0.2), 1e-6) && near(at(1), Math.hypot(0.6, 0.2), 1e-6) && at(0.5) < 1e-6 && near(at(0.25), 0.5 * Math.hypot(0.6, 0.2), 1e-6));
  // the real field: cells whose flow reverses between 07:00 and 10:00 UTC
  let rev = 0, through = 0, x0 = -1, y0 = -1;
  for (let p = 0; p < REAL6.ok.length; p++) {
    if (!REAL6.ok[p] || !REAL9.ok[p]) continue;
    const sa = Math.hypot(REAL6.u[p], REAL6.v[p]), sb = Math.hypot(REAL9.u[p], REAL9.v[p]);
    if (!(REAL6.u[p] * REAL9.u[p] + REAL6.v[p] * REAL9.v[p] < 0 && sa > 0.2 && sb > 0.2)) continue;
    rev++;
    let min = Infinity;
    for (let w = 0; w <= 1.0001; w += 0.05) { R.sampleBlend(REAL6, REAL9, w, p % UV.nx, Math.floor(p / UV.nx), out); min = Math.min(min, Math.hypot(out.u, out.v)); }
    if (min < Math.min(sa, sb) - 1e-4) through++;
    if (x0 < 0 && (REAL6.u[p] * REAL9.u[p] + REAL6.v[p] * REAL9.v[p]) / sa / sb < -0.98) { x0 = p % UV.nx; y0 = Math.floor(p / UV.nx); }
  }
  add('B4 echtes Feld: 202 Zellen drehen zwischen 07 und 10 UTC um; an jeder wird der Strom dazwischen schwächer als an beiden Enden', rev === 202 && through === rev, `${rev} drehen, ${through} werden schwächer`);
  let minReal = Infinity;
  for (let w = 0; w <= 1.0001; w += 0.01) { R.sampleBlend(REAL6, REAL9, w, x0, y0, out); minReal = Math.min(minReal, Math.hypot(out.u, out.v)); }
  add('B5 … und wo er genau umkehrt, geht er durch (fast) null: unter 0,05 m/s — die Fronten verschwinden dort', x0 >= 0 && minReal < R.RIPPLE.packetMinMs, `Minimum ${minReal.toFixed(3)} m/s an Zelle ${x0}/${y0}`);

  // bilinear sampling and land
  const ramp = grid((x) => (x >= 50 ? { u: x * 0.01, v: 0 } : null));
  add('B6 zwischen den Zellen linear: u(60,5) = 0,605', R.sampleUv(ramp, 60.5, 30, out) && near(out.u, 0.605, 1e-6));
  add('B7 Land: die nächste Zelle ohne Wasserpunkt ⇒ kein Wert; außerhalb des Gitters ⇒ kein Wert', !R.sampleUv(ramp, 49.4, 30, out) && !R.sampleUv(ramp, -3, 30, out) && !R.sampleUv(ramp, 60, 500, out) && !R.sampleUv(ramp, 400, 30, out));
  add('B8 an der Küste zählen nur die Wasserpunkte: u(49,6) = u der Wasserzelle 50, kein halbierter Wert', R.sampleUv(ramp, 49.6, 30, out) && near(out.u, 0.5, 1e-6));
  const sea = grid(() => ({ u: 0.4, v: 0 })), half = grid((x) => (x >= 100 ? { u: 0.4, v: 0 } : null));
  const okMid = R.sampleBlend(sea, half, 0.5, 80, 30, out), uMid = out.u;
  add('B9 Wasser nur in einer der beiden Stunden: es läuft aus (0,4 → 0,2 bei halbem Gewicht) und ist am Ende Land', okMid && near(uMid, 0.2, 1e-6) && !R.sampleBlend(sea, half, 1, 80, 30, out) && R.sampleBlend(sea, half, 0, 80, 30, out));
  add('B10 ohne Stunde davor zählt allein die gewählte', R.sampleBlend(null, sea, 0.3, 80, 30, out) && near(out.u, 0.4, 1e-6));
  add('B11 geladen werden nur die gewählte Stunde und die danach; am Ende des Laufs nur sie selbst', R.rippleHours(5, 72).join() === '5,6' && R.rippleHours(71, 72).join() === '71' && R.rippleHours(0, 1).join() === '0');
}

// --- C  one front --------------------------------------------------------------------------------------------------
const uniform = (dx, dy, v = 1) => (_x, _y, o) => { o.dx = dx; o.dy = dy; o.v = v; return true; };
{
  add('C1 Zahlen des Auftrags: Halbbreite 5 + min(12, 11 v), je Front 16 % schmaler; Abstand 7 + min(7, 7 v); Strich 2,2 − 0,4 k; Stärke 1 − 0,28 k',
    near(R.frontHalfWidth(1, 0), 16) && near(R.frontHalfWidth(0.2, 0), 7.2) && near(R.frontHalfWidth(3, 0), 17) && near(R.frontHalfWidth(1, 1), 16 * 0.84) && near(R.frontHalfWidth(1, 2), 16 * 0.68)
    && near(R.frontSpacing(0), 7) && near(R.frontSpacing(0.5), 10.5) && near(R.frontSpacing(4), 14) && near(R.frontLineWidth(0), 2.2) && near(R.frontLineWidth(2), 1.4) && near(R.frontFade(1), 0.72) && near(R.frontFade(2), 0.44) && R.RIPPLE.fronts === 3 && R.RIPPLE.reliefPx === 1.8);
  const f = R.newFront();
  const n = R.frontPoints(uniform(1, 0), 100, 50, 1, 0, f), w = 16;
  const xs = [...f.xs.subarray(0, n)], ys = [...f.ys.subarray(0, n)];
  add('C2 Strom nach Osten: neun Punkte quer zum Strom, je w/4 auseinander, von −w bis +w', n === 9 && ys.every((y, i) => near(y, 50 + (i - 4) * (w / 4), 1e-4)) && [...f.step.subarray(0, 9)].join() === '-4,-3,-2,-1,0,1,2,3,4');
  add('C3 Spitze stromab: die Mitte liegt 0,385 w vor, die Enden 0,315 w zurück, dazwischen fallend', near(xs[4], 100 + 0.385 * w, 1e-4) && near(xs[0], 100 - 0.315 * w, 1e-4) && near(xs[8], 100 - 0.315 * w, 1e-4) && xs[4] > xs[3] && xs[3] > xs[2] && xs[2] > xs[1] && xs[1] > xs[0] && near(xs[3], xs[5], 1e-4));
  add('C4 Formel der Verschiebung: 0,7 w (1 − (i/4)²) − 0,315 w', near(R.frontOffset(16, 0), 0.385 * 16) && near(R.frontOffset(16, 4), -0.315 * 16) && near(R.frontOffset(16, 2), 0.7 * 16 * 0.75 - 0.315 * 16));
  // any direction: the centre is the point furthest along the flow
  const dirs = [[0, -1], [0, 1], [-1, 0], [Math.SQRT1_2, -Math.SQRT1_2], [-0.6, 0.8]];
  add('C5 in jeder Richtung zeigt die Spitze stromab (nach Norden heißt auf dem Bildschirm nach oben)', dirs.every(([dx, dy]) => {
    const g2 = R.newFront(), m = R.frontPoints(uniform(dx, dy), 0, 0, 0.6, 0, g2);
    const along = [...Array(m)].map((_, i) => g2.xs[i] * dx + g2.ys[i] * dy);
    return m === 9 && along.every((a, i) => i === 4 || a < along[4]) && near(g2.ux, dx) && near(g2.uy, dy);
  }));
  // bends with the field: a flow straight away from the origin — every step is perpendicular to the LOCAL flow
  const source = (x, y, o) => { const r = Math.hypot(x, y); if (!(r > 0)) return false; o.dx = x / r; o.dy = y / r; o.v = 1; return true; };
  const fb = R.newFront(), nb = R.frontPoints(source, 40, 0, 1, 0, fb), s = 16 / 4;
  const radius = [...Array(nb)].map((_, i) => Math.hypot(fb.xs[i], fb.ys[i]));
  const want = (i) => Math.sqrt(40 * 40 + Math.abs(i) * s * s) + R.frontOffset(16, Math.abs(i));
  add('C6 die Front biegt sich mit dem Feld: in einem Strom, der von einem Punkt wegläuft, steht jeder Schritt quer zum Strom AN SEINEM Ort', nb === 9 && radius.every((r, i) => near(r, want(i - 4), 1e-3)), radius.map((r) => r.toFixed(2)).join(' '));
  const straight = Math.sqrt(40 * 40 + (4 * s) ** 2) + R.frontOffset(16, 4);
  add('C7 Gegenprobe: eine gerade Front (quer nur zur Mitte) läge am Ende 2,3 px woanders', Math.abs(straight - radius[0]) > 2 && Math.abs(straight - want(4)) > 2);
  // land: the side stops where the water ends
  const coast = (x, y, o) => { if (y > 56) return false; o.dx = 1; o.dy = 0; o.v = 1; return true; };
  const fc = R.newFront(), nc = R.frontPoints(coast, 100, 50, 1, 0, fc);
  add('C8 am Land endet die Seite: ein Schritt statt vier auf der Landseite, die andere bleibt ganz; kein Punkt liegt an Land', nc === 6 && [...fc.step.subarray(0, nc)].join() === '-4,-3,-2,-1,0,1' && [...fc.ys.subarray(0, nc)].every((y) => y <= 56));
  add('C9 Mitte an Land oder in stehendem Wasser: keine Front; beide Seiten sofort an Land: ein Punkt, nicht gezeichnet', R.frontPoints(() => false, 0, 0, 1, 0, fc) === 0 && R.frontPoints(uniform(0, 0, 0), 0, 0, 0, 0, fc) === 0 && R.frontPoints((x, y, o) => { if (Math.abs(y) > 1) return false; o.dx = 1; o.dy = 0; o.v = 1; return true; }, 0, 0, 1, 0, fc) === 1);
  R.frontPoints(uniform(1, 0), 100, 50, 1, 0, f);
  add('C10 mittlere Hälfte: die Schritte −2 bis +2 (fünf von neun Punkten); an einer gekappten Front, was davon da ist', R.crestRange(f).join() === '2,6' && (R.frontPoints(coast, 100, 50, 1, 0, fc), R.crestRange(fc).join() === '2,5'));
  const calls = [];
  const sink = { moveTo: (x, y) => calls.push(['M', x, y]), lineTo: (x, y) => calls.push(['L', x, y]), quadraticCurveTo: (a, b, x, y) => calls.push(['Q', a, b, x, y]) };
  R.frontCurve(sink, f, 0, 8);
  add('C11 die Kurve: beginnt am ersten Punkt, endet am letzten, sieben Bögen durch die Punkte dazwischen', calls[0][0] === 'M' && near(calls[0][1], f.xs[0]) && calls.length === 8 && calls.slice(1).every((c) => c[0] === 'Q') && near(calls[7][3], f.xs[8]) && near(calls[7][4], f.ys[8]) && near(calls[1][1], f.xs[1]) && near(calls[1][3], (f.xs[1] + f.xs[2]) / 2));
  const shifted = [];
  R.frontCurve({ moveTo: (x, y) => shifted.push([x, y]), lineTo: () => {}, quadraticCurveTo: (a, b, x, y) => shifted.push([x, y]) }, f, 0, 8, -f.ux * R.RIPPLE.reliefPx, -f.uy * R.RIPPLE.reliefPx);
  add('C12 Relief: dieselbe Kurve 1,8 px STROMAUF', near(shifted[0][0], f.xs[0] - 1.8, 1e-4) && near(shifted[0][1], f.ys[0], 1e-4) && near(shifted[7][0], f.xs[8] - 1.8, 1e-4));
  const two = [];
  R.frontCurve({ moveTo: () => two.push('M'), lineTo: () => two.push('L'), quadraticCurveTo: () => two.push('Q') }, f, 3, 4);
  add('C13 zwei Punkte ergeben eine Strecke, drei einen Bogen', two.join('') === 'ML' && (() => { const t = []; R.frontCurve({ moveTo: () => t.push('M'), lineTo: () => t.push('L'), quadraticCurveTo: () => t.push('Q') }, f, 3, 5); return t.join('') === 'MQ'; })());
  // the way behind a packet
  const wx = [50, 47, 44, 41, 38], wy = [0, 0, 0, 0, 0], pt = { x: 0, y: 0 };
  add('C14 die k-te Front sitzt k · Abstand hinter der ersten auf dem eigenen Weg; ist der Weg kürzer, gibt es sie noch nicht', R.pointBehind(wx, wy, 5, 0, pt) && pt.x === 50 && R.pointBehind(wx, wy, 5, 7, pt) && near(pt.x, 43) && R.pointBehind(wx, wy, 5, 12, pt) && near(pt.x, 38) && !R.pointBehind(wx, wy, 5, 14, pt) && !R.pointBehind(wx, wy, 1, 7, pt));
  const weak = R.legendFront(0.1, 0, 0), strong = R.legendFront(1.03, 0, 0);
  add('C15 Legende mit der Geometrie der Ebene: bei mehr Strom größer und heller, Relief stromauf', weak && strong && strong.a > weak.a && near(weak.a, 0.33, 1e-6) && strong.a === 1 && /^M-5\.1 -16\.3/.test(strong.whole) && /^M-1\.9 -6\.1/.test(weak.whole) && /^M-6\.9 -16\.3/.test(strong.relief) && strong.crest.length < strong.whole.length, `${weak?.whole.slice(0, 14)} / ${strong?.whole.slice(0, 14)} / ${strong?.relief.slice(0, 14)}`);
}

// --- D  particles ----------------------------------------------------------------------------------------------------
{
  const P = R.spawnProbability;
  add('D1 Annahme einer neuen Position: min(1, 0,12 + 1,3 v) — 12 % in stehendem Wasser, sicher ab 0,68 m/s', near(P(0), 0.12) && near(P(0.5), 0.77) && P(0.67) < 1 && P(0.68) === 1 && P(3) === 1);
  const pf = { dx: 0, dy: 0, v: 0 };
  // land on the left half of the view
  const LANDX = Math.round(gridXOfPx(340));
  const halfLand = grid((x) => (x >= LANDX ? { u: 0.5, v: 0.2 } : null));
  const sLand = R.makePxSampler(VIEW, null, halfLand, 1);
  const sim = new RippleSim(3);
  sim.setCounts(130, 190);
  let onLand = 0, alive = 0;
  for (let i = 0; i < 300; i++) {
    sim.step(VIEW, sLand, 1);
    if (i % 20 !== 19) continue;
    for (let k = 0; k < sim.threads; k++) if (sim.tAlive[k]) { alive++; if (!sLand(VIEW.ax * sim.tX[k] + VIEW.bx, VIEW.ay * sim.tY[k] + VIEW.by, pf)) onLand++; }
    for (let k = 0; k < sim.packets; k++) if (sim.pAlive[k]) { alive++; if (!sLand(VIEW.ax * sim.pX[k] + VIEW.bx, VIEW.ay * sim.pY[k] + VIEW.by, pf)) onLand++; }
  }
  // a particle that stepped onto land this frame is removed on the next: count those separately after one more step
  sim.step(VIEW, sLand, 1);
  let spawnedOnLand = 0;
  const fresh = new RippleSim(11); fresh.setCounts(520, 760); fresh.step(VIEW, sLand, 1);
  for (let k = 0; k < fresh.threads; k++) if (fresh.tAlive[k] && !sLand(VIEW.ax * fresh.tX[k] + VIEW.bx, VIEW.ay * fresh.tY[k] + VIEW.by, pf)) spawnedOnLand++;
  for (let k = 0; k < fresh.packets; k++) if (fresh.pAlive[k] && !sLand(VIEW.ax * fresh.pX[k] + VIEW.bx, VIEW.ay * fresh.pY[k] + VIEW.by, pf)) spawnedOnLand++;
  let freshAlive = 0; for (let k = 0; k < fresh.threads; k++) freshAlive += fresh.tAlive[k];
  add('D2 nie an Land: keine neue Position liegt auf einer Zelle ohne Wasserpunkt (1 280 Plätze, über 300 besetzt)', spawnedOnLand === 0 && freshAlive > 100, `${spawnedOnLand} an Land, ${freshAlive} Fäden gesetzt`);
  add('D3 … und wer an Land treibt, ist im nächsten Bild weg (höchstens einzelne für ein Bild)', alive > 3000 && onLand <= alive * 0.01, `${onLand} von ${alive}`);

  // spawning follows the flow; calm water stays empty
  const SPLIT = Math.round(gridXOfPx(340));
  const twoSpeeds = grid((x) => (x >= SPLIT ? { u: 0.8, v: 0 } : { u: 0.02, v: 0 }));
  const sTwo = R.makePxSampler(VIEW, null, twoSpeeds, 1);
  const s2 = new RippleSim(5);
  s2.setCounts(520, 760);
  s2.step(VIEW, sTwo, 1);
  const splitPx = pxOfGridX(SPLIT - 0.5);
  let fast = 0, slow = 0, slowVisible = 0, fastVisible = 0;
  for (let k = 0; k < s2.packets; k++) if (s2.pAlive[k]) {
    const x = VIEW.ax * s2.pX[k] + VIEW.bx;
    if (x >= splitPx + 2) fast++; else if (x < splitPx - 2) slow++;
  }
  for (let i = 0; i < 40; i++) s2.step(VIEW, sTwo, 1);
  for (let k = 0; k < s2.packets; k++) if (s2.pAlive[k]) {
    const a = s2.packetFade(k) * R.packetStrength(s2.pV[k]);
    if (s2.pV[k] < 0.05) { if (a > 0) slowVisible++; } else if (a > 0.5) fastVisible++;
  }
  add('D4 neue Positionen folgen dem Strom: im schnellen Wasser (0,8 m/s) landen über sechsmal so viele wie im stehenden (0,02 m/s) — erwartet 1 : 0,146', fast > 6 * slow * 0.85 && slow > 0, `${fast} schnell, ${slow} langsam`);
  add('D5 ruhiges Wasser bleibt leer: unter 0,05 m/s ist kein Paket sichtbar, unter 0,04 m/s kein Faden', slowVisible === 0 && fastVisible > 100 && R.packetAlpha(1, 0.049) === 0 && R.threadAlpha(1, 0.039) === 0 && R.packetAlpha(1, 0.05) > 0 && R.threadAlpha(1, 0.04) > 0, `${slowVisible} sichtbar im ruhigen Wasser, ${fastVisible} im schnellen`);
  add('D6 Stärke nach Auftrag: Faden fade · min(0,2, 0,05 + 0,22 v), Paket fade · min(1, 0,2 + 1,3 v)', near(R.threadAlpha(1, 0.1), 0.072) && near(R.threadAlpha(1, 1), 0.2) && near(R.threadAlpha(0.5, 1), 0.1) && near(R.packetAlpha(1, 0.5), 0.85) && near(R.packetAlpha(1, 1), 1) && near(R.packetAlpha(0.5, 0.1), 0.165));

  // speed of the fallback `?srtempo=lin` (the tempo before phase SR-B): 0.75 px per frame per m/s, independent of the frame rate
  const east = R.makePxSampler(VIEW, null, grid(() => ({ u: 1, v: 0 })), 1), north = R.makePxSampler(VIEW, null, grid(() => ({ u: 0, v: 2 })), 1);
  const one = new RippleSim(9, true); one.setCounts(1, 1);
  one.step(VIEW, east, 1);
  const x0 = one.tX[0], px0 = one.pX[0];
  one.step(VIEW, east, 1);
  const d1 = (one.tX[0] - x0) * VIEW.ax, dp1 = (one.pX[0] - px0) * VIEW.ax, x1 = one.tX[0];
  one.step(VIEW, east, 2);
  const d2 = (one.tX[0] - x1) * VIEW.ax;
  add('D7 Tempo des Rückfalls (linear): 0,75 px je Bild je m/s bei 60 Bildern — bei 30 Bildern der doppelte Schritt (dieselbe Geschwindigkeit), Fäden und Pakete gleich', one.tAlive[0] === 1 && near(d1, 0.75, 1e-6) && near(dp1, 0.75, 1e-6) && near(d2, 1.5, 1e-6));
  const up = new RippleSim(9, true); up.setCounts(1, 0); up.step(VIEW, north, 1);
  const y0 = up.tY[0], ux0 = up.tX[0]; up.step(VIEW, north, 1);
  add('D8 Richtung: v nach Norden bewegt auf dem Bildschirm nach oben, 1,5 px bei 2 m/s', near((up.tY[0] - y0) * VIEW.ay, -1.5, 1e-6) && near(up.tX[0], ux0, 1e-12));

  // threads and the way of a packet
  const wxs = new Float32Array(64), wys = new Float32Array(64);
  const lane = new RippleSim(4, true); lane.setCounts(1, 1);
  // a slow flow, so nothing leaves the view within the test
  const slowEast = R.makePxSampler(VIEW, null, grid(() => ({ u: 0.4, v: 0 })), 1);
  for (let i = 0; i < 120; i++) lane.step(VIEW, slowEast, 1);
  const nT = lane.threadWay(0, VIEW, 56, wxs, wys);
  const gapsT = [...Array(nT - 1)].map((_, i) => wxs[i] - wxs[i + 1]);
  add('D9 Faden: die letzten 56 Positionen, die neueste zuerst, je 0,3 px auseinander bei 0,4 m/s', nT === 56 && R.RIPPLE.threadLen === 56 && gapsT.every((g) => Math.abs(g - 0.3) < 0.02) && near(wxs[0], VIEW.ax * lane.tX[0] + VIEW.bx, 0.01), `${nT} Positionen`);
  add('D10 … bei weniger Bildern je Sekunde decken weniger Positionen dieselbe Zeit; die Regelung kürzt zuerst hier', R.threadPositions(60, 1) === 56 && R.threadPositions(30, 1) === 28 && R.threadPositions(60, 0.5) === 28 && R.threadPositions(20, 0.5) === 9);
  const nP = lane.packetWay(0, VIEW, wxs, wys);
  const gapsP = [...Array(nP - 2)].map((_, i) => wxs[i + 1] - wxs[i + 2]);
  const pt = { x: 0, y: 0 }, gap = R.frontSpacing(0.4);
  add('D11 Paket: sein Weg in Punkten von 1,5 px, höchstens 24 — reicht für die dritte Front (2 × 9,8 px)', nP === 25 && gapsP.every((g) => Math.abs(g - 1.5) < 0.05) && R.pointBehind(wxs, wys, nP, 2 * gap, pt) && near(wxs[0] - pt.x, 2 * gap, 0.01));
  const young = new RippleSim(4, true); young.setCounts(0, 1);
  for (let i = 0; i < 12; i++) young.step(VIEW, slowEast, 1);      // 11 moves = 3.3 px
  const nY = young.packetWay(0, VIEW, wxs, wys);
  add('D12 ein junges Paket trägt erst eine Front („bis zu 3“): der Weg ist kürzer als der Abstand', R.pointBehind(wxs, wys, nY, 0, pt) && !R.pointBehind(wxs, wys, nY, gap, pt));

  // slack water: fronts and threads fade out, they are not cut
  const flow = grid(() => ({ u: 0.5, v: 0 })), stand = grid(() => ({ u: 0, v: 0 }));
  const sFlow = R.makePxSampler(VIEW, null, flow, 1), sStand = R.makePxSampler(VIEW, null, stand, 1);
  const sl = new RippleSim(6); sl.setCounts(60, 60);
  for (let i = 0; i < 60; i++) sl.step(VIEW, sFlow, 1);
  const visOf = (arrAlive, arrVis, n) => { let s = 0, c = 0; for (let k = 0; k < n; k++) if (arrAlive[k]) { s += arrVis[k]; c++; } return c ? s / c : NaN; };
  const v0 = visOf(sl.pAlive, sl.pVis, sl.packets);
  const before = new Set([...Array(sl.packets)].map((_, k) => k).filter((k) => sl.pAlive[k] && sl.pAge[k] > 40 && sl.pLife[k] - sl.pAge[k] > 80));
  for (let i = 0; i < 15; i++) sl.step(VIEW, sStand, 1);
  const mid = [...before].map((k) => sl.pVis[k]);
  for (let i = 0; i < 17; i++) sl.step(VIEW, sStand, 1);
  const end = [...before].map((k) => sl.packetFade(k)), endT = [...Array(sl.threads)].map((_, k) => (sl.tAlive[k] ? sl.threadFade(k) : 0));
  add('D13 Stauwasser: fällt der Strom unter die Grenze, blenden die Pakete über 30 Bilder aus (nach 15 Bildern halb), kein harter Schnitt', near(v0, 1, 1e-6) && before.size > 20 && mid.every((v) => near(v, 0.5, 1e-4)) && end.every((v) => v === 0) && endT.every((v) => v === 0), `vorher ${v0}, nach 15 Bildern ${mid[0]}, nach 32 ${Math.max(...end)}`);
  for (let i = 0; i < 31; i++) sl.step(VIEW, sFlow, 1);
  add('D14 … und kommen mit dem Strom wieder', [...before].filter((k) => sl.pAlive[k]).every((k) => near(sl.pVis[k], 1, 1e-4)));

  // lives
  add('D15 Ein- und Ausblenden über 30 Bilder an den Enden eines Lebens', R.lifeFade(0, 400) === 0 && near(R.lifeFade(15, 400), 0.5) && R.lifeFade(30, 400) === 1 && R.lifeFade(200, 400) === 1 && near(R.lifeFade(385, 400), 0.5) && R.lifeFade(400, 400) === 0 && R.RIPPLE.fadeFrames === 30);
  const lives = new RippleSim(8); lives.setCounts(130, 190);
  let lo = Infinity, hi = 0, tlo = Infinity, thi = 0;
  for (let i = 0; i < 400; i++) { lives.step(VIEW, slowEast, 1); for (let k = 0; k < 190; k++) if (lives.pAlive[k]) { lo = Math.min(lo, lives.pLife[k]); hi = Math.max(hi, lives.pLife[k]); } for (let k = 0; k < 130; k++) if (lives.tAlive[k]) { tlo = Math.min(tlo, lives.tLife[k]); thi = Math.max(thi, lives.tLife[k]); } }
  add('D16 ein Paket lebt 260 bis 600 Bilder, ein Faden länger (700 bis 1 500, gesetzt)', lo >= 260 && hi <= 600 && hi - lo > 250 && tlo >= 700 && thi <= 1500, `${lo.toFixed(0)}–${hi.toFixed(0)} / ${tlo.toFixed(0)}–${thi.toFixed(0)}`);
  const old = new RippleSim(8); old.setCounts(0, 40);
  let born = 0, seenAges = 0;
  for (let i = 0; i < 700; i++) { old.step(VIEW, sStand, 1); for (let k = 0; k < 40; k++) if (old.pAlive[k] && old.pAge[k] === 0) born++; for (let k = 0; k < 40; k++) if (old.pAlive[k] && old.pAge[k] > old.pLife[k] + 1) seenAges++; }
  add('D17 am Ende seines Lebens gibt ein Paket den Platz frei, ein neues entsteht', born > 60 && seenAges === 0, `${born} Geburten in 700 Bildern auf 40 Plätzen`);
  // leaving the view
  const fastEast = R.makePxSampler(VIEW, null, grid(() => ({ u: 2.4, v: 0 })), 1);
  const out = new RippleSim(2); out.setCounts(200, 0);
  let beyond = 0;
  for (let i = 0; i < 600; i++) { out.step(VIEW, fastEast, 1); for (let k = 0; k < 200; k++) if (out.tAlive[k] && VIEW.ax * out.tX[k] + VIEW.bx > VIEW.w + R.RIPPLE.marginPx + 2) beyond++; }
  add('D18 wer den Kartenrand um mehr als 40 px verlässt, wird ersetzt', beyond === 0);
  // determinism
  const run = (seed) => { const s = new RippleSim(seed); s.setCounts(130, 190); for (let i = 0; i < R.RIPPLE.stillFrames; i++) s.step(VIEW, sLand, 1); return sha(Buffer.from(s.pX.buffer)) + sha(Buffer.from(s.tY.buffer)); };
  add('D19 dieselbe Saat, dieselben Partikel (das Standbild ist jedes Mal dasselbe); eine andere Saat, andere', run(7) === run(7) && run(7) !== run(8));
  const again = new RippleSim(1); again.setCounts(50, 50); for (let i = 0; i < 30; i++) again.step(VIEW, sLand, 1);
  const snap = sha(Buffer.from(again.pX.buffer));
  again.reset(1); again.setCounts(50, 50); for (let i = 0; i < 30; i++) again.step(VIEW, sLand, 1);
  add('D20 reset() beginnt von vorn', sha(Buffer.from(again.pX.buffer)) === snap);
}

// --- H  phase SR-B: the tempo curve of the wind particles, and the two fallbacks from the link ---------------------------
{
  const T = R.RIPPLE_TEMPO, step = R.rippleStepPx;
  // second rule, written out independently: px per second = 27.455 · (max(v, 0.05) / 1)^0.7
  const pxPerSec = (v) => (v <= 0 ? 0 : 27.455 * Math.exp(0.7 * Math.log(Math.max(v, 0.05))));
  const vs = [0.001, 0.02, 0.05, 0.08, 0.1, 0.26, 0.3, 0.51, 0.75, 1, 1.03, 1.5, 2, 3];
  add('H1 Tempo wie die Windpartikel (E-SR-16; viermal langsamer: E-SR-18, E-SR-21, E-SR-24, E-SR-25 = je −15 % von 38): px/s = 27,455 · (max(v, 0,05) / 1 m/s)^0,7 — 0,1 m/s ⇒ 5, 0,3 ⇒ 12, 1 ⇒ 27, 2 ⇒ 45 px/s; an 14 Stärken dieselbe Zahl wie eine zweite Rechnung; unterlinear (doppelter Strom ⇒ 1,62-faches Tempo), monoton, mit Boden bei 0,05 m/s',
    T.pxPerSec === 27.455 && near(T.pxPerSec, 38 * 0.85 * 0.85, 1e-9) && T.refMs === 1 && T.gamma === 0.7 && T.minMs === 0.05 && T.minMs === R.RIPPLE.packetMinMs && vs.every((v) => near(step(v) * 60, pxPerSec(v), 1e-9))
    && near(step(0.1) * 60, 5.48, 0.01) && near(step(0.3) * 60, 11.82, 0.01) && near(step(1) * 60, 27.455, 1e-9) && near(step(2) * 60, 44.6, 0.01) && near(step(2) / step(1), Math.pow(2, 0.7), 1e-12)
    && step(0.02) === step(0.05) && step(0.001) === step(0.05) && near(step(0.05) * 60, 3.37, 0.01) && vs.slice(2).every((v, i, a) => i === 0 || step(v) > step(a[i - 1])),
    vs.map((v) => (step(v) * 60).toFixed(1)).join(' '));
  add('H2 stehendes Wasser bewegt nichts (kein Boden bei v = 0, auch kein negativer Wert); der Rückfall ist linear: 0,75 px je Bild je m/s — die Kurve ist bis etwa 0,19 m/s schneller als er (bei 0,1 m/s das 1,2-Fache), darüber langsamer (bei 0,3 m/s das 0,88-Fache, bei 1 m/s das 0,61-Fache)', step(0) === 0 && step(-1) === 0 && step(0, true) === 0 && near(step(0.4, true), 0.3, 1e-12) && near(step(2, true), 1.5, 1e-12) && R.RIPPLE.pxPerFrame === 0.75
    && near(step(0.3) / step(0.3, true), 0.88, 0.01) && near(step(0.1) / step(0.1, true), 1.22, 0.01) && step(0.15) > step(0.15, true) && step(0.25) < step(0.25, true) && near(step(1) / step(1, true), 0.61, 0.01) && step(2) < step(2, true));
  // the particle state uses it: threads and packets alike, twice the step at half the frame rate
  const east = (u) => R.makePxSampler(VIEW, null, grid(() => ({ u, v: 0 })), 1);
  const move = (u, dtN, linear) => { const one = new RippleSim(9, linear); one.setCounts(1, 1); for (let i = 0; i < 400 && !(one.tAlive[0] && one.pAlive[0]); i++) one.step(VIEW, east(u), 1); const t0 = one.tX[0], p0 = one.pX[0]; one.step(VIEW, east(u), dtN); return [(one.tX[0] - t0) * VIEW.ax, (one.pX[0] - p0) * VIEW.ax, one.tAlive[0] + one.pAlive[0]]; };
  const m1 = move(1, 1), m04 = move(0.4, 1), m04half = move(0.4, 2), mLin = move(0.4, 1, true), mStand = move(0, 1);
  add('H3 der Partikelzustand rechnet mit der Kurve: 1 m/s ⇒ 0,458 px je Bild, 0,4 m/s ⇒ 0,241 px — Fäden und Pakete gleich, bei 30 Bildern der doppelte Schritt; mit dem Rückfall 0,30 px; in stehendem Wasser 0',
    m1[2] === 2 && near(m1[0], 27.455 / 60, 1e-6) && near(m1[1], 27.455 / 60, 1e-6) && near(m04[0], (27.455 / 60) * Math.pow(0.4, 0.7), 1e-6) && near(m04[1], m04[0], 1e-9) && near(m04half[0], 2 * m04[0], 1e-6) && near(mLin[0], 0.3, 1e-6) && near(mLin[1], 0.3, 1e-6)
    && mStand[2] === 2 && mStand[0] === 0 && mStand[1] === 0, JSON.stringify([m1, m04, m04half, mLin, mStand].map((m) => m.slice(0, 2).map((x) => +x.toFixed(4)))));
  const up = new RippleSim(9); up.setCounts(1, 0); up.step(VIEW, R.makePxSampler(VIEW, null, grid(() => ({ u: 0, v: 2 })), 1), 1);
  const y0 = up.tY[0], x0 = up.tX[0]; up.step(VIEW, R.makePxSampler(VIEW, null, grid(() => ({ u: 0, v: 2 })), 1), 1);
  add('H4 die Richtung bleibt die des Stroms: 2 m/s nach Norden ⇒ 0,74 px nach oben, kein Schritt zur Seite', near((up.tY[0] - y0) * VIEW.ay, -(27.455 / 60) * Math.pow(2, 0.7), 1e-6) && near(up.tX[0], x0, 1e-12));
  // V-SR-13: while the map moves it draws the layer itself (on every 'move'); the loop steps the particles and leaves the drawing out
  const LP = R.loopPaints, MV = R.RIPPLE_MOVE;
  add('H6 ein Bild je Bildschirmbild, auch wenn die Karte sich bewegt (V-SR-13): hat die Karte gerade gezeichnet, lässt die Schleife ihr Bild aus — bei 60 Bildern bis 25 ms nach dem letzten Kartenbild (das nächste Bild, 16,7 ms später, entfällt; das übernächste zeichnet wieder), bei einer Karte mit 30 Bildern bis 50 ms, nie länger als 100 ms; ohne Kartenbewegung zeichnet sie immer',
    MV.minMs === 25 && MV.maxMs === 100 && MV.factor === 1.5 && LP(1000, -Infinity, 16.7) === true && LP(1016.7, 1000, 16.7) === false && LP(1025, 1000, 16.7) === false && LP(1025.1, 1000, 16.7) === true && LP(1033.4, 1000, 16.7) === true
    && LP(1033.4, 1000, 33.3) === false && LP(1049.9, 1000, 33.3) === false && LP(1050.1, 1000, 33.3) === true && LP(1099, 1000, 500) === false && LP(1100.1, 1000, 500) === true && LP(1020, 1000, 0) === false && LP(1026, 1000, 0) === true && LP(1026, 1000, NaN) === true);
  // a second of map movement at 60 frames, the loop's turn before the map's in every frame, then a second of rest: every frame gets exactly one picture
  { let movedAt = -Infinity, every = 16.7, once = 0, twice = 0, none = 0;
    for (let i = 0; i < 120; i++) { const t = 1000 + i * 16.7, moving = i < 60; let n = 0; if (LP(t, movedAt, every)) n++; if (moving) { every = t + 1 - movedAt; movedAt = t + 1; n++; } if (n === 1) once++; else if (n === 2) twice++; else none++; }
    add('H7 … über eine Sekunde Bewegung und eine Sekunde Ruhe gerechnet: in der Bewegung nur das erste Bild doppelt (die Schleife weiß noch nichts von ihr), danach genau ein Bild je Bildschirmbild; nach dem Ende entfällt EIN Bild, dann zeichnet die Schleife wieder', twice === 1 && none === 1 && once === 118, `${once} einfach, ${twice} doppelt, ${none} ohne`); }
  // E-SR-22: zoomed in beyond the start view the layer shows 25 % fewer packets (Jan, 19.11.); the start view keeps its count
  const Z = R.zoomPacketScale, c8 = R.rippleCounts, ref8 = 680 * 380;
  add('H8 beim Hineinzoomen ein Viertel weniger Pakete (E-SR-22): in der Startansicht und weiter draußen die volle Zahl, eine Zoomstufe weiter hinein und darüber 75 %, dazwischen gleitend (halbe Stufe ⇒ 87,5 %); ohne bekannte Startansicht die volle Zahl; die Fäden bleiben; mit dem letzten Hebel der Regelung multipliziert',
    R.RIPPLE_ZOOM.levels === 1 && R.RIPPLE_ZOOM.packets === 0.75 && Z(0) === 1 && Z(-2) === 1 && Z(0.5) === 0.875 && Z(1) === 0.75 && Z(1.01) === 0.75 && Z(6) === 0.75 && near(Z(0.2), 0.95, 1e-12) && Z(NaN) === 1 && Z(undefined) === 1 && Z(Infinity) === 0.75
    && [0, 0.1, 0.25, 0.5, 0.75, 1, 2].every((z, i, a) => i === 0 || Z(z) <= Z(a[i - 1])) && c8(ref8, Z(1)).packets === 143 && c8(ref8, Z(1)).tracers === 130 && c8(2 * ref8, Z(1)).packets === 285 && c8(ref8, Z(0)).packets === 190
    && c8(ref8, 0.6 * Z(1)).packets >= 85 && c8(ref8, 0.6 * Z(1)).packets <= 86, [0, 0.25, 0.5, 0.75, 1, 2].map((z) => Z(z)).join(' '));
  {
    const HOME = [6.4, 53.4, 12.0, 56.08], Zi = R.rippleZoomIn;
    // second rule: the scale (px per mercator unit) at which HOME fits a 706 × 840 box with 10 px free, from the map's own definition of zoom (512 · 2^zoom)
    const sx = (706 - 20) / ((12.0 - 6.4) / 360), my = (lat) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI), sy = (840 - 20) / (my(53.4) - my(56.08));
    const fit = Math.min(sx, sy), fitZoom = Math.log2(fit / 512), at = (zoom, w = 706, h = 840) => ({ ax: 512 * 2 ** zoom, ay: 512 * 2 ** zoom, bx: 0, by: 0, w, h });
    add('H9 wie weit hineingezoomt ist, rechnet die Ebene aus ihrer eigenen Sicht (nicht aus der Kamera-Hilfe der Karte, die den Innenabstand für die Legende mitzählt): in der Startansicht 0, eine Stufe weiter 1, weiter draußen negativ; auf dem Telefon (390 × 780) gilt dessen eigene Startansicht, in einer breiten, flachen Karte entscheidet die Höhe; ohne Startansicht unbekannt ⇒ volle Zahl',
      sx < sy && near(Zi(at(fitZoom), HOME), 0, 1e-9) && near(Zi(at(fitZoom + 1), HOME), 1, 1e-9) && near(Zi(at(fitZoom - 0.5), HOME), -0.5, 1e-9) && near(Zi(at(fitZoom + 0.37), HOME), 0.37, 1e-9) && fitZoom > 5.5 && fitZoom < 6.6
      && Zi(at(fitZoom, 390, 780), HOME) > 0.8 && near(Zi(at(Math.log2(Math.min((390 - 20) / ((12.0 - 6.4) / 360), (780 - 20) / (my(53.4) - my(56.08))) / 512), 390, 780), HOME), 0, 1e-9)
      // a wide, low map box (1600 × 500): the HEIGHT decides where the start view fits
      && (500 - 20) / (my(53.4) - my(56.08)) < (1600 - 20) / ((12.0 - 6.4) / 360) && near(Zi(at(Math.log2((500 - 20) / (my(53.4) - my(56.08)) / 512), 1600, 500), HOME), 0, 1e-9)
      && Zi(at(fitZoom), null) === null && Zi(at(fitZoom), undefined) === null && Zi({ ...at(fitZoom), w: 10, h: 10 }, HOME) === null && R.zoomPacketScale(Zi(at(fitZoom), HOME)) === 1 && near(R.zoomPacketScale(Zi(at(fitZoom + 1), HOME)), 0.75, 1e-9) && R.zoomPacketScale(Zi(at(fitZoom), null)) === 1
      && src('src/sea/SeaMap.tsx').includes('export const SEA_START_BOUNDS: [number, number, number, number] = [6.4, 53.4, 12.0, 56.08];'), 'Startansicht passt bei Zoom ' + fitZoom.toFixed(2));
  }
  const M = R.rippleMotionFrom, same = (m, still, linear) => m.still === still && m.linear === linear;
  add('H5 die zwei Rückfälle stehen im Link (E-SR-15, E-SR-16): „srstill=1“ ⇒ Standbild, „srtempo=lin“ ⇒ das alte Tempo; ohne sie, mit anderem Wert, mit kaputter Abfrage ⇒ Bewegung mit der Kurve; neben anderen Parametern gelesen',
    same(M(''), false, false) && same(M('?srstill=1'), true, false) && same(M('?srtempo=lin'), false, true) && same(M('?l=cur&srstill=1&srtempo=lin'), true, true) && same(M('?srstill=0'), false, false) && same(M('?srstill=true'), false, false)
    && same(M('?srtempo=linear'), false, false) && same(M('?srtempo='), false, false) && same(M('?still=1&tempo=lin'), false, false) && same(M('%E0%A4%A'), false, false) && same(M(undefined), false, false));
}

// --- E  area scaling and the frame governor ---------------------------------------------------------------------------
{
  const ref = 680 * 380, c = R.rippleCounts;
  add('E1 Zähler je 680 × 380 px sichtbares Wasser: 130 Fäden und 190 Pakete; halbe Fläche die Hälfte, doppelte das Doppelte', c(ref).tracers === 130 && c(ref).packets === 190 && c(ref / 2).tracers === 65 && c(ref / 2).packets === 95 && c(2 * ref).tracers === 260 && c(2 * ref).packets === 380 && c(0).tracers === 0 && c(0).packets === 0);
  add('E2 Deckel beim Vierfachen (gesetzt): 520 Fäden und 760 Pakete, auch auf einem 4K-Schirm voller Wasser', c(4 * ref).tracers === 520 && c(40 * ref).tracers === 520 && c(40 * ref).packets === 760 && R.RIPPLE_MAX.tracers === 520 && R.RIPPLE_MAX.packets === 760 && new RippleSim().maxPackets === 760);
  add('E3 letzter Hebel der Regelung: weniger Pakete, die Fäden bleiben', c(ref, 0.6).packets === 114 && c(ref, 0.6).tracers === 130);
  const LANDX = Math.round(gridXOfPx(340));
  const sHalf = R.makePxSampler(VIEW, null, grid((x) => (x >= LANDX ? { u: 0.3, v: 0 } : null)), 1), sAll = R.makePxSampler(VIEW, null, grid(() => ({ u: 0, v: 0 })), 1), sNone = R.makePxSampler(VIEW, null, grid(() => null), 1);
  const wHalf = R.visibleWaterPx(sHalf, 680, 380), wAll = R.visibleWaterPx(sAll, 680, 380);
  add('E4 sichtbares Wasser: ganz Wasser = die ganze Karte, halb Land ≈ die Hälfte, ganz Land = 0 — stehendes Wasser zählt als Wasser', wAll === ref && Math.abs(wHalf / ref - 0.5) < 0.04 && R.visibleWaterPx(sNone, 680, 380) === 0, `${(wHalf / ref).toFixed(3)}`);
  const sim = new RippleSim(1); sim.setCounts(130, 190);
  for (let i = 0; i < 30; i++) sim.step(VIEW, sHalf, 1);
  sim.setCounts(40, 50);
  add('E5 sinkt der Zähler, sind die Plätze darüber sofort leer', sim.threads === 40 && sim.packets === 50 && sim.tAlive.subarray(40).every((x) => x === 0) && sim.pAlive.subarray(50).every((x) => x === 0) && sim.tAlive.subarray(0, 40).some((x) => x === 1));

  for (const [name, L] of Object.entries(R.RIPPLE_LADDER)) {
    const n = L.fps.length, top = n - 1;
    const fpsFloor = L.fps.indexOf(Math.min(...L.fps)) === 0 ? L.fps.lastIndexOf(L.fps[0]) : -1;      // highest level at the lowest frame rate
    const firstShort = L.trail.lastIndexOf(0.5), firstFew = L.packets.lastIndexOf(0.6);
    add(`E6 Leiter „${name}“: eine Stufe, drei Hebel in der Reihenfolge des Auftrags — erst die Bildrate (${L.fps[top]} → ${L.fps[0]}), dann kürzere Fäden, zuletzt weniger Pakete`,
      n === 5 && L.trail.length === n && L.packets.length === n && L.fps[top] > L.fps[top - 1] && L.fps[top - 1] > L.fps[top - 2] && L.trail[top] === 1 && L.packets[top] === 1
      && fpsFloor === 2 && firstShort === 1 && firstFew === 0 && L.trail[2] === 1 && L.packets[1] === 1 && L.fps[0] === L.fps[2]);
  }
  add('E7 Maus 60 → 45 → 30 Bilder, Touch 30 → 24 → 20', R.RIPPLE_LADDER.fine.fps.join() === '30,30,30,45,60' && R.RIPPLE_LADDER.coarse.fps.join() === '20,20,20,24,30');
  // the wind layer's FrameGovernor with this ladder (read only — src/wind is not changed)
  const L = R.RIPPLE_LADDER.fine, gov = new FrameGovernor({ fpsLadder: [...L.fps], trailLadder: [...L.trail] });
  const startTop = gov.levelIndex === 4 && gov.targetFps === 60 && gov.trailScale === 1;
  const seen = [];
  for (let i = 0; i < 400; i++) { gov.feed(60); if (seen[seen.length - 1] !== gov.levelIndex) seen.push(gov.levelIndex); }
  const bottom = gov.levelIndex === 0 && gov.targetFps === 30 && gov.trailScale === 0.5 && L.packets[gov.levelIndex] === 0.6;
  for (let i = 0; i < 400; i++) gov.feed(3);
  add('E8 FrameGovernor mit dieser Leiter: startet oben (60 Bilder, volle Fäden), geht bei 60 ms Renderzeit Stufe um Stufe hinunter und bei 3 ms wieder ganz hinauf', startTop && seen.join() === '4,3,2,1,0' && bottom && gov.levelIndex === 4 && gov.targetFps === 60 && gov.trailScale === 1, seen.join());
  const calm = new FrameGovernor({ fpsLadder: [...L.fps], trailLadder: [...L.trail] });
  for (let i = 0; i < 400; i++) calm.feed(9);
  add('E9 ein Gerät, das 9 ms je Bild braucht, bleibt oben', calm.levelIndex === 4);
}

// --- F  colour area ----------------------------------------------------------------------------------------------------
{
  add('F1 Farbfläche: Alpha min(1, 0,82 · v^0,8) · 0,5 — 0 im stehenden Wasser, 0,41 bei 1 m/s, höchstens 0,5 (ab 1,28 m/s)', R.tintAlpha(0) === 0 && near(R.tintAlpha(1), 0.41) && near(R.tintAlpha(0.5), 0.82 * 0.5 ** 0.8 * 0.5) && R.tintAlpha(1.3) === 0.5 && R.tintAlpha(5) === 0.5 && R.tintAlpha(1.27) < 0.5);
  const rgb = R.RIPPLE_RGB;
  add('F2 Farben des Auftrags: Fläche 120/214/222, Faden 150/222/228, Relief 3/38/46, Front 176/232/237, Mitte 232/250/251', rgb.tint.join() === '120,214,222' && rgb.thread.join() === '150,222,228' && rgb.relief.join() === '3,38,46' && rgb.front.join() === '176,232,237' && rgb.crest.join() === '232,250,251' && R.rgbCss(rgb.relief) === 'rgb(3,38,46)');
  // contrast of the brief: light front and dark upstream line on mid-dark water (relative luminance, WCAG)
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const calm = R.areaRgb(0), strong = R.areaRgb(1.3), base = [27, 27, 29];
  const mid = R.areaRgb(0.45);
  add('F3 eigener Wasserton unter der Fläche (gerechnet, nicht gesehen): helle Front über 6 : 1 auf ruhigem, über 4 : 1 auf mittlerem (0,45 m/s), über 2,5 : 1 auf starkem Strom; dunkle Linie über 1,8 : 1 / 2,5 : 1 / 4 : 1; auf dem Wasser der Basiskarte hätte sie unter 1,1 : 1',
    calm.join() === rgb.water.join() && rgb.water.join() === '28,80,102' && ratio(rgb.front, calm) > 6 && ratio(rgb.front, mid) > 4 && ratio(rgb.front, strong) > 2.5 && ratio(rgb.crest, strong) > 3 && ratio(rgb.relief, calm) > 1.8 && ratio(rgb.relief, mid) > 2.5 && ratio(rgb.relief, strong) > 4 && ratio(rgb.relief, base) < 1.1,
    `Front/ruhig ${ratio(rgb.front, calm).toFixed(1)}, Front/stark ${ratio(rgb.front, strong).toFixed(1)}, Mitte/stark ${ratio(rgb.crest, strong).toFixed(1)}, Relief/ruhig ${ratio(rgb.relief, calm).toFixed(2)}, Relief/stark ${ratio(rgb.relief, strong).toFixed(1)}, Relief/Basiskarte ${ratio(rgb.relief, base).toFixed(2)}`);
  const img = R.colourCurrentArea(REAL6), ni = G.ni;
  add('F4 Bildform wie die Seegangsfläche: 630 Spalten × 774 Zeilen RGBA', img.length === ni * SEA_OUT_ROWS * 4 && SEA_OUT_ROWS === 774);
  const top = R.mercY(SEA_FIELD_BOUNDS.north), bot = R.mercY(SEA_FIELD_BOUNDS.south);
  const at = (lat, lon) => { const i = Math.round((lon - G.lon1) / G.di), y = Math.floor(((R.mercY(lat) - top) / (bot - top)) * SEA_OUT_ROWS); return (y * ni + i) * 4; };
  const seaPx = at(54.5, 7.5), landPx = at(54.3, 9.6);
  let alphas = new Set(); for (let o = 3; o < img.length; o += 4) alphas.add(img[o]);
  add('F5 echtes Feld: offene Deutsche Bucht gefärbt (Alpha 235), Land in Schleswig-Holstein durchsichtig; es gibt nur diese beiden Alphas', img[seaPx + 3] === 235 && img[landPx + 3] === 0 && [...alphas].sort((a, b) => a - b).join() === '0,235');
  // tint by speed: a still grid is the water tone, a fast one the full mix
  const still = R.colourCurrentArea(grid(() => ({ u: 0, v: 0 }))), fastImg = R.colourCurrentArea(grid(() => ({ u: 1.3, v: 0 })));
  const o = at(55, 9);
  add('F6 stehendes Wasser = der Wasserton der Ebene, starker Strom = halb in die Flächenfarbe gemischt', [still[o], still[o + 1], still[o + 2]].join() === rgb.water.join() && [fastImg[o], fastImg[o + 1], fastImg[o + 2]].every((v, k) => Math.abs(v - (rgb.water[k] + (rgb.tint[k] - rgb.water[k]) * 0.5)) <= 1));
  // rows in web mercator: a band of water rows lands on the rows the wave image maps to the same CWAM rows
  const band = R.colourCurrentArea(grid((_x, y) => (y >= 50 && y <= 59 ? { u: 0.5, v: 0 } : null)));
  let wrong = 0, lit = 0;
  for (let y = 0; y < SEA_OUT_ROWS; y++) {
    const on = band[(y * ni + 300) * 4 + 3] === 235, j = SEA_ROW_MAP[y];
    if (on) lit++;
    // uv rows 50–59 are CWAM rows 100–118; the nearest-row rule reaches half a uv cell (one CWAM row) beyond
    if (on !== (j >= 99 && j <= 119) && !(j === 98 || j === 99 || j === 119 || j === 120)) wrong++;
  }
  add('F7 Zeilen linear in Web-Mercator, wie die Seegangsfläche: ein Band aus zehn Feldzeilen liegt auf denselben Bildzeilen', wrong === 0 && lit >= 38 && lit <= 44, `${lit} Bildzeilen, ${wrong} falsch`);
  add('F8 Schlüssel der Legende: sieben Farbstufen vom Wasserton bis zur vollen Fläche, 0 bis 1,3 m/s', R.CUR_STOPS.length === 7 && R.CUR_STOPS[0][0] === 0 && R.CUR_STOPS[0][1] === '#1c5066' && R.CUR_STOPS[6][0] === 1.3 && R.CUR_STOPS[6][1] === '#4a93a2' && R.LEGEND_SPEEDS.join() === '0.1,0.26,0.51,1.03');
  // map coordinates
  const m = { x: R.mercX(8.5), y: R.mercY(54.2) };
  const v2 = R.viewFromTwo({ x: R.mercX(6), y: R.mercY(57) }, { x: VIEW.ax * R.mercX(6) + VIEW.bx, y: VIEW.ay * R.mercY(57) + VIEW.by }, { x: R.mercX(15), y: R.mercY(53) }, { x: VIEW.ax * R.mercX(15) + VIEW.bx, y: VIEW.ay * R.mercY(53) + VIEW.by }, 680, 380);
  add('F9 Kartenlage: Mercator hin und zurück; die Sicht aus zwei Punkten der Karte ist die ganze Sicht', near(R.lonOfMercX(m.x), 8.5, 1e-9) && near(R.latOfMercY(m.y), 54.2, 1e-9) && near(v2.ax, VIEW.ax, 1e-3) && near(v2.ay, VIEW.ay, 1e-3) && near(v2.bx, VIEW.bx, 1e-3) && near(v2.by, VIEW.by, 1e-3));
  // the sampler in screen px: direction on the screen, y down
  const pf = { dx: 0, dy: 0, v: 0 };
  const sN = R.makePxSampler(VIEW, null, grid(() => ({ u: 0.3, v: 0.4 })), 1);
  add('F10 Strom auf dem Bildschirm: u nach rechts, v nach OBEN; Betrag in m/s; stehendes Wasser ohne Richtung', sN(300, 200, pf) && near(pf.v, 0.5, 1e-6) && near(pf.dx, 0.6, 1e-6) && near(pf.dy, -0.8, 1e-6) && R.makePxSampler(VIEW, null, grid(() => ({ u: 0, v: 0 })), 1)(300, 200, pf) && pf.v === 0 && pf.dx === 0 && pf.dy === 0);
}

// --- G  source text ------------------------------------------------------------------------------------------------------
{
  const code0 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const layer = src('src/sea/SeaRippleLayer.ts'), sim = src('src/sea/seaRippleSim.ts'), pure = src('src/sea/seaRipples.ts'), page = src('src/sea/SeaPage.tsx'), map = src('src/sea/SeaMap.tsx'), dock = src('src/sea/SeaDock.tsx');
  const css = src('src/sea/seaDeck.css'), client = src('src/sea/seaClient.ts'), contract = src('src/sea/seaCurrent.ts'), prod = src('scripts/sea/sea-current.mjs');
  add('G1 Bewegung wie die Windebene (E-SR-15): die Ebene liest „prefers-reduced-motion“ nicht mehr; das Standbild gibt es nur über den Rückfall im Link — dann hält der Fall die Schleife an und zeichnet einmal, aus fester Saat und im eingeschwungenen Zustand', !/reduced-motion/.test(code0(layer)) && /matchMedia\('\(pointer: coarse\)'\)/.test(layer) && /private readonly motion = rippleMotionFrom\(/.test(layer) && /private still\(\): boolean \{ return this\.motion\.still; \}/.test(layer) && /new RippleSim\(STILL_SEED, this\.motion\.linear\)/.test(layer) && /if \(this\.still\(\)\) \{ this\.stop\(\); this\.stillFrame\(\); return; \}/.test(layer) && /this\.sim\.reset\(STILL_SEED\)/.test(layer) && /this\.sim\.settle\(\)/.test(layer) && !/requestAnimationFrame/.test(/private stillFrame\(\): void \{[\s\S]*?\n {2}\}/.exec(layer)?.[0] ?? 'requestAnimationFrame') && /rippleStepPx\(f\.v, this\.linear\) \* dtN/.test(sim) && (sim.match(/rippleStepPx\(f\.v, this\.linear\) \* dtN/g) ?? []).length === 2 && !/RIPPLE\.pxPerFrame/.test(sim));
  const st = new RippleSim(7); st.setCounts(60, 60);
  const sFlow = R.makePxSampler(VIEW, null, grid((x) => (x % 40 < 20 ? { u: 0.5, v: 0 } : { u: 0.01, v: 0 })), 1);
  for (let i = 0; i < R.RIPPLE.stillFrames; i++) st.step(VIEW, sFlow, 1);
  st.settle();
  let full = 0, hidden = 0, part = 0;
  for (let k = 0; k < st.packets; k++) if (st.pAlive[k]) { const f = st.packetFade(k); if (f === 1) full++; else if (f === 0) hidden++; else part++; }
  add('G2 … das Standbild zeigt keinen Moment des Ein- oder Ausblendens: jedes Paket ganz da oder (in ruhigem Wasser) gar nicht', full > 10 && part === 0 && [...Array(st.packets)].every((_, k) => !st.pAlive[k] || (st.packetFade(k) === 0) === (st.pV[k] < 0.05)), `${full} voll, ${hidden} verborgen, ${part} halb`);
  add('G3 die Schleife steht bei verborgenem Tab, ausgeschalteter Ebene und außerhalb der Bühne; beim Abbau wird sie abgemeldet', /document\.addEventListener\('visibilitychange', this\.kick\)/.test(layer) && /if \(document\.hidden\) \{ this\.stop\(\); return; \}/.test(layer) && /if \(!this\.shown\(\)\) \{ this\.stop\(\); this\.clear\(\); return; \}/.test(layer) && /cancelAnimationFrame\(this\.raf\)/.test(layer) && /document\.removeEventListener\('visibilitychange', this\.kick\)/.test(layer) && /rippleOn=\{stage !== 'dossier'\}/.test(page) && /rippleLayer\.current\?\.destroy\(\)/.test(map));
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  add('G4 2D-Canvas, kein WebGL, kein Shader — in keiner Datei der Ebene', /getContext\('2d'\)/.test(layer) && !/webgl|gl_Position|getContext\('experimental|createShader|type: 'custom'/i.test(code(layer) + code(sim) + code(pure)));
  add('G5 Gegenprobe zu G4: das Muster findet WebGL, wenn es dasteht', /webgl|gl_Position/i.test("canvas.getContext('webgl2')"));
  add('G6 Bildrate nur über das FrameGovernor-Muster: FPS-Leiter und Faden-Leiter an den Governor, gefüttert mit der Renderdauer; Paketzahl über dieselbe Stufe', /new FrameGovernor\(\{ fpsLadder: \[\.\.\.this\.ladder\.fps\], trailLadder: \[\.\.\.this\.ladder\.trail\] \}\)/.test(layer) && /this\.gov\.feed\(performance\.now\(\) - t0 \+ /.test(layer) && /this\.ladder\.packets\[this\.gov\.levelIndex\]/.test(layer) && /1000 \/ this\.gov\.targetFps/.test(layer));
  const windImports = [...(layer + sim + pure + map + page + dock).matchAll(/from '\.\.\/wind\/([^']+)'/g)].map((m) => m[1]);
  add('G7 aus src/wind/ wird nur der Governor gelesen; die Fusion wird nicht berührt', windImports.length === 1 && windImports[0] === 'perfGovernor' && !/pointForecast|fusion/i.test(code(layer) + code(sim) + code(pure)));
  add('G8 Partikel leben in Kartenkoordinaten und werden je Bild neu projiziert; Größen bleiben in px', /this\.map\.project\(REF_A\)/.test(layer) && /Float64Array/.test(sim) && /view\.ax \* this\.pX\[i\] \+ view\.bx/.test(sim) && /\(f\.dx \* d\) \/ view\.ax/.test(sim));
  add('G9 Zeichenreihenfolge je Front: Relief dunkel (Breite + 0,6, Alpha 0,5 a), ganze Front hell (0,55 a), mittlere Hälfte am hellsten (a); runde Enden', /ctx\.lineCap = 'round'/.test(layer) && layer.indexOf('RIPPLE_RGB.relief') < layer.indexOf('rgbCss(RIPPLE_RGB.front)') && layer.indexOf('rgbCss(RIPPLE_RGB.front)') < layer.indexOf('rgbCss(RIPPLE_RGB.crest)') && /ctx\.globalAlpha = 0\.5 \* this\.fAlpha\[f\]; ctx\.lineWidth = frontLineWidth\(this\.fK\[f\]\) \+ 0\.6;/.test(layer) && /ctx\.globalAlpha = 0\.55 \* this\.fAlpha\[f\]; ctx\.lineWidth = frontLineWidth\(this\.fK\[f\]\);/.test(layer) && /-fr\.ux \* RIPPLE\.reliefPx, -fr\.uy \* RIPPLE\.reliefPx/.test(layer) && /this\.fAlpha\[nf\] = a \* frontFade\(k\)/.test(layer));
  add('G10 Faden: eine 1 px breite Linie aus den letzten Positionen', /ctx\.strokeStyle = rgbCss\(RIPPLE_RGB\.thread\); ctx\.lineWidth = 1;/.test(layer) && /sim\.threadFade\(i\) \* threadStrength\(sim\.tV\[i\]\)/.test(layer));
  add('G11 Spots, Pegel und Stationen bleiben frei (ausgestanzt), Marker liegen über dem Canvas, Klicks gehen durch', /destination-out/.test(layer) && /map\.getCanvas\(\)\.after\(this\.canvas\)/.test(layer) && /\.sw-ripples \{[^}]*pointer-events: none/.test(css) && /setKeepOut\(w\.keep\)/.test(map));

  add('G12 fünfte Hauptebene „Strömung“: im Link (l=cur), im Dock, nicht die Voreinstellung', SEA_LAYERS.join() === 'hs,ws,sw,per,cur' && LAYER_LABEL.cur === 'Strömung' && R.RIPPLE_LAYER_LABEL === 'Strömung' && SEA_DEFAULT_STATE.l === 'hs' && parseSeaUrl('sylt-hoernum', '?l=cur').state.l === 'cur' && parseSeaUrl(null, '?l=cur').invalid.length === 0 && buildSeaUrl({ ...SEA_DEFAULT_STATE, l: 'cur' }) === '/seewetter?l=cur' && buildSeaUrl(SEA_DEFAULT_STATE) === '/seewetter' && /SEA_LAYERS\.map\(\(l\) =>/.test(dock) && /cur: </.test(dock));
  add('G13 kein Schalter für die Ebene selbst: weder Flag noch Query-Parameter; die zwei Rückfälle der Bewegung (srstill, srtempo) stehen an EINER Stelle im reinen Teil', !/SEA_RIPPLE_LIVE|seaRippleFrom|[?&](sr|riffel|ripple|ripples)=/.test(src('src/sea/seaFlag.ts') + page + pure + layer + client + contract) && (pure.match(/get\('srstill'\)/g) ?? []).length === 1 && (pure.match(/get\('srtempo'\)/g) ?? []).length === 1 && !/srstill|srtempo/.test(code0(layer) + code0(sim) + code0(page).replace(/RIPPLE_STILL_NOTE/g, '')));
  add('G14 ist die Ebene gewählt, ersetzt ihre Fläche die Seegangsfläche; Spots, Pegel, Planer und die Pfeile bleiben', /field=\{isCur \? curArea : coloured\}/.test(page) && /arrows=\{isCur \? null : arrows\}/.test(page) && /currents=\{toggles\.current \? currents : null\}/.test(page) && /plan=\{mapPlan\}/.test(page) && /gauges=\{mapGauges\}/.test(page) && /\['current', 'Strömungspfeile'/.test(dock) && /current: false, particles: false \}/.test(page));
  add('G15 gelesen wird nur bei gewählter Ebene, nur die Stunde und die danach; kein Seegangsfeld daneben', /const curAt = currentDocAt\(curDoc, curPrev, validMs\);/.test(page) && /const uvHour = isCur && curAt \? currentUvHour\(curAt, validMs\) : null;/.test(page) && /rippleHours\(uvHour, curAt\.uv\.hours\)/.test(page) && /fStep != null && !isCur \?/.test(page) && (page.match(/loadCurrentUv\(/g) ?? []).length === 2 && /currentUvCache\.size > 6/.test(client));
  add('G16 Legende: „Bögen zeigen stromab · größer und heller = stärker“, der Modellhinweis, und dass die Bewegung keine Wellen zeigt', R.RIPPLE_LEGEND_LINE === 'Bögen zeigen stromab · größer und heller = stärker' && /\{RIPPLE_LEGEND_LINE\}/.test(page) && /\{RIPPLE_MOTION_NOTE\}/.test(page) && /keine Wellen/.test(R.RIPPLE_MOTION_NOTE) && /Richtung und Stärke/.test(R.RIPPLE_MOTION_NOTE) && C.SEA_CURRENT_MODEL_NOTE === 'Modell, Mittel der oberen 5 m, keine Navigationsgrundlage' && /`\$\{SEA_CURRENT_MODEL_NOTE\}\. \$\{curRunTxt\}`/.test(page) && /<RippleKey className="sw-rp-key" \/>/.test(page));
  // ST-N (audit/seewetter-stroemung.md §7): the run before speaks only for the hours before the newest run begins
  // (`currentDocAt`, checked in verify:sea-current block G) — for every hour the newest run covers, never an older field.
  add('G17 ohne Lauf, ohne Feld, außerhalb der Läufe, unlesbar: „keine Daten“ mit dem Grund — ein älteres Feld nie für eine Stunde, die der neueste Lauf trägt', /Strömung: keine Daten\. \$\{curWhy\}/.test(page) && /<strong>Keine Daten\.<\/strong> \{curWhy\} Es werden keine Riffel gezeigt\./.test(page) && /!curAt\?\.uv \? RIPPLE_WHY\.noField/.test(page)
    && C.currentDocAt({ t0: 100 * 3_600_000, run: 'n' }, { t0: 76 * 3_600_000, run: 'p' }, 100 * 3_600_000).run === 'n' && C.currentDocAt({ t0: 100 * 3_600_000, run: 'n' }, { t0: 76 * 3_600_000, run: 'p' }, 99 * 3_600_000 + 59 * 60_000).run === 'p' && /uvHour == null \? `\$\{RIPPLE_WHY\.outside\}/.test(page) && /uvState === 'error' \? RIPPLE_WHY\.unreadable/.test(page) && /if \(!grid\) \{ setUv\(null\); setUvState\('error'\); return; \}/.test(page) && /current\.why \?\? SEA_CURRENT_WHY\.none/.test(page));
  add('G18 kein „sicher“ in den Texten der Phase (Gegenprobe: das Muster findet es)', !/sicher/i.test(code(pure)) && !/sicher/i.test(Object.values(R.RIPPLE_WHY).join(' ') + R.RIPPLE_LEGEND_LINE + R.RIPPLE_MOTION_NOTE + R.RIPPLE_STILL_NOTE) && /sicher/i.test('Das ist sicher.'));
  add('G19 das Standbild sagt, dass es eines ist und woher es kommt (der Link, nicht das Gerät)', /stillMotion \? ` \$\{RIPPLE_STILL_NOTE\}` : ''/.test(page) && /const stillMotion = useMemo\(\(\) => rippleMotionFrom\(window\.location\.search\)\.still, \[\]\);/.test(page) && !/prefers-reduced-motion/.test(page) && /^Standbild: /.test(R.RIPPLE_STILL_NOTE) && /srstill=1/.test(R.RIPPLE_STILL_NOTE) && !/Gerät/.test(R.RIPPLE_STILL_NOTE));
  add('G20 die Ebene kommt als eigener, träge geladener Baustein: erst wenn sie gewählt wird', /void import\('\.\/SeaRippleLayer'\)/.test(map) && !/^import \{[^}]*\} from '\.\/SeaRippleLayer'/m.test(map) && !/SeaRippleLayer|seaRippleSim/.test(page + dock));
  add('G21 Producer: schreibt u und v über den Vertrag (Alpha 255), neben dem Pfeilfeld; der Workflow ruft denselben Producer', /encodeUvPixel\(uvImg, o,/.test(prod) && /seaCurrentUvPath\(pick\.run, h\)/.test(prod) && /seaCurrentFieldPath\(pick\.run, h\)/.test(prod) && /scripts\/sea\/sea-current\.mjs --store=\.\.\/store/.test(src('scripts/sea/workflow-sea.yml')) && /out\[o \+ 3\] = 255;/.test(contract));
  const sr = css.indexOf('Phase SR — Strömungs-Riffel'), sp = css.indexOf('Phase SP — „Ausfahrt planen“');
  const block = css.slice(sr, sp), outside = block.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  add('G22 Stile der Phase stehen vor dem Planer-Abschnitt; mobil nur per Media Query (767 px / 1439 px mit grobem Zeiger)', sr > 0 && sr < sp && css.indexOf('Phase ST — Strömung') < sr && !/\.sw-m-/.test(outside) && /@media \(max-width: 767px\), \(max-width: 1439px\) and \(pointer: coarse\) \{\s*\.sw-m-legend \.sw-rp-line/.test(block) && !/@media \(max-width: (?!767|1439)\d+px\)/.test(block));
  const deps = (j) => JSON.stringify(Object.keys({ ...j.dependencies, ...j.devDependencies }).sort());
  let headPkg = null; try { headPkg = JSON.parse(execFileSync('git', ['show', 'HEAD:package.json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 })); } catch { /* no git */ }
  const pkg = JSON.parse(src('package.json'));
  add('G23 keine neue Abhängigkeit (Liste der Pakete wie an HEAD); der Prüfer ist als verify:sea-ripples eingetragen', !!headPkg && deps(pkg) === deps(headPkg) && /scripts\/verify-sea-ripples\.mjs$/.test(pkg.scripts['verify:sea-ripples'] ?? ''));
  add('G25 Verdrahtung zu H6: die Schleife rechnet immer, zeichnet aber nur, wenn die Karte es nicht gerade getan hat; das Bild der Karte merkt sich Zeit, Abstand und Dauer nur bei laufender Schleife (im Standbild nicht), und seine Dauer geht statt der eigenen in die Regelung', /const own = loopPaints\(t0, this\.movedAt, this\.moveEvery\);/.test(layer) && /this\.sim\.step\(view, sample, dt \/ FRAME_MS\);\s*\n[^\n]*\n\s*const own = loopPaints/.test(layer) && /if \(own\) this\.paint\(view, sample, this\.gov\.targetFps\);/.test(layer) && /this\.gov\.feed\(performance\.now\(\) - t0 \+ \(own \? 0 : this\.movePaintMs\)\);/.test(layer) && /if \(this\.raf\) \{ this\.moveEvery = t0 - this\.movedAt; this\.movedAt = t0; this\.movePaintMs = performance\.now\(\) - t0; \}/.test(layer) && (layer.match(/this\.paint\(/g) ?? []).length === 3);
  add('G26 Verdrahtung zu H8/H9: die Karte gibt der Ebene ihre Startansicht mit; die Ebene zählt die Pakete mit dem Abstand ihrer Sicht dazu — neu bei jedem Ende einer Bewegung und jeder Größenänderung; die Kamera-Hilfe der Karte und deren Zoomzahl liest sie dafür nicht', /new m\.SeaRippleLayer\(map, SEA_START_BOUNDS\)/.test(map) && /constructor\(map: maplibregl\.Map, home: \[number, number, number, number\] \| null = null\)/.test(layer) && /this\.ladder\.packets\[this\.gov\.levelIndex\] \* zoomPacketScale\(rippleZoomIn\(view, this\.home\)\)/.test(layer) && !/cameraForBounds|getZoom\(/.test(layer) && /fitBoundsOptions: \{ padding: 10 \}/.test(map) && /private onSettle = \(\): void => \{\s*\n\s*if \(!this\.shown\(\)\) return;\s*\n\s*if \(this\.still\(\)\) this\.stillFrame\(\); else this\.recount\(\);/.test(layer) && /private onResize = \(\): void => \{ this\.resize\(\); this\.onSettle\(\); \};/.test(layer));
  add('G24 Bildrate: am Desktop gemessen (60 Bilder/s, Audit §7), am Telefon nicht — beides steht in der Ebene und im Audit', /Measured 19\.11\.2026 on a desktop GPU: 60 frames per second/.test(layer) && /no phone yet/.test(layer) && /\*\*60 Bilder\/s\*\*/.test(src('audit/seewetter-riffel.md')) && /Nicht gemessen:\*\* Telefon/.test(src('audit/seewetter-riffel.md')));
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail && !c.ok ? `  — ${c.detail}` : ''}`);
console.log(`\n  ${checks.length - failed.length}/${checks.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
void readdirSync;
