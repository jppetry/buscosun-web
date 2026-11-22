/**
 * verify:wind-hd — Phase WH (`audit/wind-2km.md`): the wind picture at full ICON-D2 resolution (family `windHd`).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-wind-hd.mjs [--live]
 *
 * Fixtures `scripts/lib/fixtures/wind-hd/` are REAL:
 *   uv-2026112206-001.json     80 × 60 cells of ICON-D2 u_10m / v_10m (run 22.11.2026 06 UTC, step 1) over the northern
 *                              Alps, values unchanged
 *   repack-2026112206.json     `repack.json` as the producer of this phase wrote it for that run (steps 1 and 6)
 *
 *   A  the picture: every pixel is the model value of ITS cell (within half a quantisation step), north up, the
 *      normalisation of the step; the sampled picture carries every second cell only; PNG round trip; where it lies
 *   B  contract producer ↔ reader: the family in both lists, the real manifest passes the reader's lock, each broken
 *      section is refused, the old family is untouched by the new one
 *   C  client rules: the switch, the upsampling handed to the particle layer, one grid per run, the status words
 *   D  wiring by source
 *   E  (`--live`, network: opendata.dwd.de and the data repo) a whole real step value by value against the GRIB; the
 *      sampled picture byte-equal to the published one
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWindRgba } from '../src/wind/windFrameBuild.ts';
import { refineNormalizedUV } from '../src/wind/windRefine.ts';
import { subsampledCorners } from '../src/sources/gribDecode.ts';
import * as RS from '../src/sources/repackSource.ts';
import { FAMILIES, FAMILY_KEYS, sectionFor, indexEntry, SCHEMA, CDN_BASE } from './lib/repackManifest.mjs';
import { encodePng, decodePng, toRgba } from './lib/png.mjs';
import { repackWindStep, repackWindHdStep, TARGET_WIDTH, fetchField, urls } from './repack-icon-d2.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FX = join(ROOT, 'scripts/lib/fixtures/wind-hd');
const src = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const LIVE = process.argv.includes('--live');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: ok ? '' : String(detail) });
const f32 = (b64) => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };

// --- A: the picture ----------------------------------------------------------------------------------------------
const FXD = JSON.parse(readFileSync(join(FX, 'uv-2026112206-001.json'), 'utf8'));
const field = (values) => ({ ni: FXD.ni, nj: FXD.nj, lat1: FXD.lat1, lon1: FXD.lon1, lat2: FXD.lat2, lon2: FXD.lon2, di: FXD.di, dj: FXD.dj, scanMode: FXD.scanMode, values });
const U = field(f32(FXD.u)), V = field(f32(FXD.v));
/** Largest distance between a picture's decoded value and the model value of the cell it stands for, in quantisation steps. */
function worst(b, f, comp, ss) {
  const [lo, hi, ch] = comp === 'u' ? [b.uMin, b.uMax, 0] : [b.vMin, b.vMax, 1];
  let w = 0;
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
    // A cell without a model value (outside the domain) is calm in the picture — the rule of `buildWindRgba`.
    const raw = f.values[Math.min(f.nj - 1, (b.height - 1 - y) * ss) * f.ni + Math.min(f.ni - 1, x * ss)];
    const val = Number.isFinite(raw) ? raw : 0;
    const got = lo + (b.rgba[(y * b.width + x) * 4 + ch] / 255) * (hi - lo);
    w = Math.max(w, Math.abs(got - val) / ((hi - lo) / 255));
  }
  return w;
}
const hd = buildWindRgba(U, V, U.ni), lo = buildWindRgba(U, V, Math.ceil(U.ni / 2));
const mm = (a) => { let n = Infinity, x = -Infinity; for (const v of a) { if (v < n) n = v; if (v > x) x = v; } return [n, x]; };
add('A1 volle Auflösung = jede Modellzelle: Bildgröße wie das Gitter; das abgetastete Bild hat ein Viertel der Zellen',
  hd.width === U.ni && hd.height === U.nj && lo.width === U.ni / 2 && lo.height === U.nj / 2 && hd.width * hd.height === 4 * lo.width * lo.height, `${hd.width}x${hd.height} / ${lo.width}x${lo.height}`);
add('A2 jeder Bildpunkt trägt den Modellwert SEINER Zelle (u und v, höchstens ein halber Quantisierungsschritt), Norden oben',
  worst(hd, U, 'u', 1) <= 0.5001 && worst(hd, V, 'v', 1) <= 0.5001, `u ${worst(hd, U, 'u', 1)} v ${worst(hd, V, 'v', 1)}`);
{
  // Negative controls on the measure itself: south up, u and v swapped, and one cell shifted are all noticed.
  const flipped = { ...hd, rgba: (() => { const o = new Uint8ClampedArray(hd.rgba.length); for (let y = 0; y < hd.height; y++) o.set(hd.rgba.subarray(y * hd.width * 4, (y + 1) * hd.width * 4), (hd.height - 1 - y) * hd.width * 4); return o; })() };
  const shifted = { ...hd, rgba: (() => { const o = new Uint8ClampedArray(hd.rgba.length); o.set(hd.rgba.subarray(4), 0); return o; })() };
  add('A3 Gegenprobe auf das Maß: Süden oben, u/v vertauscht und um eine Zelle verschoben fallen alle auf',
    worst(flipped, U, 'u', 1) > 5 && worst(hd, V, 'u', 1) > 5 && worst(shifted, U, 'u', 1) > 2, `${worst(flipped, U, 'u', 1)} ${worst(hd, V, 'u', 1)} ${worst(shifted, U, 'u', 1)}`);
}
const [uN, uX] = mm(U.values), [vN, vX] = mm(V.values);
add('A4 Normierung = Minimum und Maximum DIESES Schritts über alle Zellen (die abgetastete Normierung kann enger sein)',
  hd.uMin === uN && hd.uMax === uX && hd.vMin === vN && hd.vMax === vX && lo.uMin >= hd.uMin && lo.uMax <= hd.uMax && lo.vMin >= hd.vMin && lo.vMax <= hd.vMax);
add('A5 das abgetastete Bild trägt genau jede zweite Zelle — die Werte dazwischen stehen nur im vollen Bild',
  worst(lo, U, 'u', 2) <= 0.5001 && worst(lo, V, 'v', 2) <= 0.5001);
{
  const rgb = new Uint8Array(hd.width * hd.height * 3);
  for (let p = 0, s = 0, d = 0; p < hd.width * hd.height; p++, s += 4, d += 3) { rgb[d] = hd.rgba[s]; rgb[d + 1] = hd.rgba[s + 1]; rgb[d + 2] = hd.rgba[s + 2]; }
  const back = toRgba(decodePng(encodePng(hd.width, hd.height, rgb, 3)));
  add('A6 PNG-Rundlauf: RGB geschrieben, RGBA gelesen — Byte für Byte das Bild des Clients (B = 0, A = 255)', Buffer.from(back).equals(Buffer.from(hd.rgba)) && hd.rgba[2] === 0 && hd.rgba[3] === 255);
}
{
  // Where the picture lies: the corners are the outer edges of the cells; the centre of pixel x is the cell's longitude.
  const c = subsampledCorners(U, 1), c2 = subsampledCorners(U, 2);
  const lonOf = (x, w, cc) => cc[0][0] + ((x + 0.5) / w) * (cc[1][0] - cc[0][0]);
  const latOf = (y, h, cc) => cc[0][1] - ((y + 0.5) / h) * (cc[0][1] - cc[2][1]);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  add('A7 Lage: die Ecken sind die Außenkanten der Zellen; die Mitte von Bildpunkt x liegt auf der Länge seiner Zelle, die oberste Zeile auf der nördlichsten Breite — im vollen wie im abgetasteten Bild',
    near(c[0][0], U.lon1 - U.di / 2) && near(c[1][0], U.lon2 + U.di / 2) && near(c[0][1], U.lat2 + U.dj / 2) && near(c[2][1], U.lat1 - U.dj / 2)
    && near(lonOf(0, U.ni, c), U.lon1) && near(lonOf(U.ni - 1, U.ni, c), U.lon2) && near(lonOf(37, U.ni, c), U.lon1 + 37 * U.di) && near(latOf(0, U.nj, c), U.lat2) && near(latOf(U.nj - 1, U.nj, c), U.lat1)
    && near(lonOf(5, U.ni / 2, c2), U.lon1 + 10 * U.di) && near(latOf(0, U.nj / 2, c2), U.lat1 + (U.nj - 2) * U.dj), JSON.stringify([c, c2]));
}
{
  const px = hd.rgba, one = refineNormalizedUV(px, hd.width, hd.height, 1), two = refineNormalizedUV(lo.rgba, lo.width, lo.height, 2);
  add('A8 Partikel-Schicht: das volle Bild ohne Hochrechnen und das abgetastete mit Faktor 2 ergeben dieselbe Texturgröße',
    one.width === hd.width && one.height === hd.height && two.width === one.width && two.height === one.height, `${one.width}x${one.height} / ${two.width}x${two.height}`);
}

// --- B: contract ------------------------------------------------------------------------------------------------
const MAN = JSON.parse(readFileSync(join(FX, 'repack-2026112206.json'), 'utf8'));
const COMMIT = 'a'.repeat(40);
const entry = indexEntry(MAN);   // what the publisher writes into index.json
add('B1 die Familie steht in beiden Listen, drei Kanäle, gleicher Horizont und gleiche Felder wie `wind`; die Listen sind gleich',
  FAMILIES.windHd && FAMILIES.windHd.hd === true && FAMILIES.windHd.of === 'wind' && FAMILIES.windHd.file === 'windhd' && FAMILIES.windHd.manifest === null
  && FAMILIES.windHd.channels === 3 && RS.REPACK_FAMILIES.windHd.channels === 3 && FAMILIES.windHd.minStep === FAMILIES.wind.minStep && FAMILIES.windHd.maxStep === FAMILIES.wind.maxStep
  && JSON.stringify(FAMILIES.windHd.params) === JSON.stringify(FAMILIES.wind.params) && JSON.stringify(FAMILY_KEYS) === JSON.stringify(Object.keys(RS.REPACK_FAMILIES))
  && FAMILY_KEYS.indexOf('windHd') === FAMILY_KEYS.indexOf('wind') + 1);
add('B2 echtes Manifest des Producers: eigenes Gitter mit jeder Zelle (1215 × 746), Normierung je Schritt, Dateien `windhd-<SSS>.png`; `wind` daneben wie bisher (608 × 373)',
  MAN.windHd?.grid?.ss === 1 && MAN.windHd.grid.width === 1215 && MAN.windHd.grid.height === 746 && MAN.grid.ss === 2 && MAN.grid.width === 608 && MAN.grid.height === 373 && MAN.targetWidth === TARGET_WIDTH
  && MAN.windHd.steps.length === MAN.wind.steps.length && MAN.windHd.steps.every((s, i) => s.file === `windhd-${String(s.step).padStart(3, '0')}.png` && s.step === MAN.wind.steps[i].step && s.uMax > s.uMin && s.vMax > s.vMin && s.bytes > 3 * MAN.wind.steps[i].bytes)
  && MAN.wind.steps.every((s) => /^wind-\d{3}\.png$/.test(s.file)));
const secHd = sectionFor(entry, 'windHd', COMMIT), secLo = sectionFor(entry, 'wind', COMMIT);
const pHd = RS.parseRepackSection(secHd, 'windHd', MAN.run), pLo = RS.parseRepackSection(secLo, 'wind', MAN.run);
add('B3 der Leser nimmt den echten Abschnitt: Gitter der Familie mit jeder Zelle, alle Schritte mit Normierung; Lage aus diesem Gitter',
  pHd?.windHd && pHd.windHd.grid.ss === 1 && pHd.windHd.grid.width === 1215 && pHd.windHd.steps.length === 2 && pHd.windHd.steps[0].uMin === MAN.windHd.steps[0].uMin
  && RS.sectionCovers(pHd, 'windHd', [1, 6]) && !RS.sectionCovers(pHd, 'windHd', [1, 2, 6])
  && JSON.stringify(RS.uvBoundsOfGrid(pHd.windHd.grid)) !== JSON.stringify(RS.uvBoundsOf(pHd)) && RS.uvBoundsOfGrid(pHd.grid).every((x, i) => x === RS.uvBoundsOf(pHd)[i]));
add('B4 die alte Familie ist unberührt: derselbe Abschnitt wie ohne die neue, kein `windHd` darin — ein Client mit altem Bündel liest wie bisher',
  pLo?.wind && !pLo.windHd && JSON.stringify(pLo) === JSON.stringify(RS.parseRepackSection(sectionFor({ ...entry, windHd: undefined }, 'wind', COMMIT), 'wind', MAN.run)) && !secLo.windHd && !secHd.wind);
{
  const bad = (mut) => RS.parseRepackSection(sectionFor({ ...entry, windHd: mut(structuredClone(MAN.windHd)) }, 'windHd', COMMIT), 'windHd', MAN.run);
  add('B5 abgelehnt wird: ohne eigenes Gitter, mit abgetastetem Gitter, mit anderer Kanalzahl, ohne Normierung, mit leerer Spanne, für einen anderen Lauf',
    bad((w) => { delete w.grid; return w; }) === null && bad((w) => { w.grid.ss = 2; return w; }) === null && bad((w) => { w.channels = 4; return w; }) === null
    && bad((w) => { for (const s of w.steps) delete s.uMin; return w; }) === null && bad((w) => { for (const s of w.steps) s.vMax = s.vMin; return w; }) === null
    && RS.parseRepackSection(secHd, 'windHd', '2026112203') === null && bad((w) => { delete w.steps[1].vMax; return w; })?.windHd.steps.length === 1);
}
{
  // The way of the client: index.json → the run's entry → the section of the family → the reader's lock.
  const index = { schema: SCHEMA, commit: COMMIT, base: CDN_BASE, publishedAt: MAN.runAt, runs: [entry] };
  const viaIndex = RS.parseRepackSection(RS.sectionFromIndex(index, MAN.run, 'windHd'), 'windHd', MAN.run);
  const newest = RS.newestRunFromIndex(index, 'windHd', Date.parse(MAN.runAt) + 2 * 3_600_000);
  const old = { ...index, runs: [{ ...entry, windHd: undefined }] };
  add('B6 über den Index: der Eintrag des Publishers trägt die Familie, der Leser findet Lauf und Schritte; ein Lauf OHNE die Familie (älterer Producer) liefert keinen Abschnitt — der Client liest dann `wind`',
    entry.windHd && entry.path === `runs/${MAN.run}` && viaIndex?.windHd?.steps.length === 2 && newest?.runStr === MAN.run && JSON.stringify(newest.steps) === '[1,6]'
    && RS.sectionFromIndex(old, MAN.run, 'windHd') == null && RS.newestRunFromIndex(old, 'windHd', Date.parse(MAN.runAt) + 2 * 3_600_000) === null
    && RS.parseRepackSection(RS.sectionFromIndex(old, MAN.run, 'wind'), 'wind', MAN.run)?.wind?.steps.length === 2, JSON.stringify([newest, viaIndex?.windHd?.steps.length]));
}

// --- C: client rules ---------------------------------------------------------------------------------------------
const W = await import('../src/wind/iconD2WindSource.ts').catch((e) => ({ err: e }));
add('C0 die Windquelle lässt sich ohne Browser laden (reine Teile)', !W.err, String(W.err?.message ?? ''));
if (!W.err) {
  add('C1 Schalter: feiner Zeiger = volle Auflösung, Touch = abgetastet; `?windhd=1` / `?windhd=0` entscheiden je Link',
    W.windHdFrom('', false) === true && W.windHdFrom('', true) === false && W.windHdFrom('?windhd=1', true) === true && W.windHdFrom('?windhd=0', false) === false
    && W.windHdFrom('?l=wind&windhd=0', false) === false && W.windHdFrom('?windhd=ja', true) === false && W.windHdFrom('?windhd=ja', false) === true);
  add('C2 an die Partikel-Schicht: volles Bild ⇒ Faktor 1, sonst kein Wert (die Voreinstellung der Schicht gilt)',
    W.windUpsampleOf({ hd: true }) === 1 && W.windUpsampleOf({ hd: false }) === undefined && W.windUpsampleOf({}) === undefined && W.windUpsampleOf(null) === undefined);
  add('C3 Statuszeile nennt, was gezeichnet wird: „2,2 km“ nur beim vollen Bild, sonst „jede zweite Zelle (4,4 km)“',
    /2,2 km$/.test(W.windModelLabel({ hd: true })) && /jede zweite Zelle \(4,4 km\)$/.test(W.windModelLabel({ hd: false })) && /4,4 km/.test(W.windModelLabel(null)));
}

// --- D: wiring by source -------------------------------------------------------------------------------------------
const ws = src('src/wind/iconD2WindSource.ts'), wl = src('src/wind/WindLayer.ts'), mv = src('src/MapView.tsx'), mm2 = src('src/dashboard/MiniMap.tsx'), sl = src('src/sea/SeaParticleLayer.ts'), prod = src('scripts/repack-icon-d2.mjs');
const count = (s, re) => (s.match(re) ?? []).length;
add('D1 ein Lauf, EIN Gitter: das volle Bild nur, wenn seine Familie JEDEN geladenen Schritt trägt; sonst der ganze Lauf abgetastet — und nie ein GRIB-Bild dazwischen',
  /if \(hd\?\.windHd && sectionCovers\(hd, 'windHd', r\.wanted\)\) hdSection = hd;/.test(ws) && /if \(windHdWanted\(\)\) \{\n\s+const hd = await resolveRepackSection\(r\.runStr, 'windHd', null, r\.wanted\)/.test(ws)
  && /const png = hdSection \? await loadWindHdStep\(hdSection, step, signal\) : section \? await loadWindStep\(section, step, signal\) : null;/.test(ws)
  && /if \(!png && \(repoOnly \|\| hdSection\)\) return false;/.test(ws) && count(ws, /hdSection = /g) === 1);
add('D2 die Lage des Bilds kommt aus dem Gitter der benutzten Familie; der Lauf sagt, welches es ist',
  /uvBounds = hdSection\?\.windHd \? uvBoundsOfGrid\(hdSection\.windHd\.grid\) : uvBoundsOf\(section!\);/.test(ws) && /return \{ runAt: r\.runAt, frames, uvBounds, hd: !!hdSection \};/.test(ws)
  && /onProgress\(\{ runAt: ra, frames: \[\.\.\.frames\], uvBounds, hd: !!hdSection \}\)/.test(ws));
add('D3 Partikel-Schicht: der Faktor je Feld schlägt die Voreinstellung, in den Grenzen 1–4; ohne Angabe wie bisher; kein Shader berührt',
  /return refineNormalizedUV\(px, sw, sh, meta\.upsample != null \? Math\.max\(1, Math\.min\(4, Math\.round\(meta\.upsample\)\)\) : this\.upsample\);/.test(wl)
  && count(wl, /meta\.upsample/g) === 2 && /this\.upsample = Math\.max\(1, Math\.min\(4, Math\.round\(options\.upsample \?\? 2\)\)\);/.test(wl));
add('D4 jede Stelle, die ein ICON-D2-Bild an die Schicht gibt, nennt den Faktor: Wetterkarte (Sofortbild, Bild, Arbeiter-Weg), Kachel (zwei), Seekarte',
  count(mv, /upsample: windUpsampleOf\(/g) === 2 && /windFrameAtValidTimeAsync\(wd, targetMs, windUpsampleOf\(wd\) \?\? wind\.upsampleFactor, wind\.windTextureKind\)/.test(mv)
  && count(mm2, /upsample: windUpsampleOf\(/g) === 2 && count(sl, /upsample: windUpsampleOf\(wd\)/g) === 1 && /saveWindNowCache\(wd\.frames\[0\], wd\.uvBounds, wd\.hd === true\)/.test(mv)
  && /hd: record\.hd === true,/.test(ws));
add('D5 Producer: das volle Bild entsteht aus den Feldern des Windschritts (kein zweiter Abruf), mit `buildWindRgba` ohne Abtastung; `REPACK_WIND_HD=0` lässt die Familie weg',
  /const r = await repackWindHdStep\(run, step, lastWind\?\.step === step \? lastWind : null\);/.test(prod) && /return packWind\(u, v, u\.ni\);/.test(prod) && /return packWind\(u, v, TARGET_WIDTH\);/.test(prod)
  && /if \(!entry\.grid\) entry\.grid = gridOf\(r\.field, 1\);/.test(prod) && /\.filter\(\(f\) => !FAMILIES\[f\]\.hd \|\| process\.env\.REPACK_WIND_HD !== '0'\)/.test(prod));

// --- E: live -------------------------------------------------------------------------------------------------------
if (LIVE) {
  const idx = await (await fetch(`${RS.DATA_RAW_BASE}/main/index.json?t=${Date.now()}`)).json();
  const run = idx.runs[0].run, step = 1;
  const [u, v] = await Promise.all([fetchField(urls.step(run, 'u_10m', step)), fetchField(urls.step(run, 'v_10m', step))]);
  const r = await repackWindHdStep(run, step, { u, v });
  const dec = toRgba(decodePng(r.png));
  const b = { rgba: dec, width: r.width, height: r.height, ...r.norm };
  add(`E1 live, Lauf ${run} Schritt ${step}: das volle Bild trägt an ${u.ni} × ${u.nj} Zellen den Wert des GRIB (u und v, höchstens ein halber Schritt)`,
    r.width === u.ni && r.height === u.nj && worst(b, u, 'u', 1) <= 0.5001 && worst(b, v, 'v', 1) <= 0.5001, `${r.width}x${r.height} u ${worst(b, u, 'u', 1)} v ${worst(b, v, 'v', 1)}`);
  const std = await repackWindStep(run, step);
  const pub = Buffer.from(await (await fetch(`${RS.DATA_RAW_BASE}/main/runs/${run}/wind-${String(step).padStart(3, '0')}.png`)).arrayBuffer());
  const sha = (x) => createHash('sha256').update(x).digest('hex');
  add('E2 live: das abgetastete Bild dieses Producers ist Byte für Byte das veröffentlichte (die alte Familie ist unverändert)', sha(std.png) === sha(pub), `${sha(std.png).slice(0, 12)} / ${sha(pub).slice(0, 12)}`);
  add('E3 live: Größe des vollen Bilds 3- bis 4-mal die des abgetasteten', r.png.length > 3 * std.png.length && r.png.length < 4 * std.png.length, `${r.png.length} / ${std.png.length}`);
}

const passed = checks.filter((x) => x.ok).length;
const failed = checks.length - passed;
for (const x of checks) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? `  [${x.detail.slice(0, 300)}]` : ''}`);
console.log(`\nverify:wind-hd${LIVE ? ' --live' : ''} — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}${LIVE ? '' : '  (ohne Block E: --live)'}`);
process.exit(failed ? 1 : 0);
