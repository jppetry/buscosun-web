/**
 * verify-np0-radar.mjs — Phase NP-0a (audit/np0-datenprodukte.md §2.4, §8): Rückblick 2 h + Blitz-Spiegel.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-np0-radar.mjs
 *        [--derive-head=<HEAD-Worktree von buscosun-web>]   echte Eingaben: Derive byte-gleich zu HEAD (+ Negativkontrolle)
 *        [--live]                                           nach Jans Push: Bestand und Metas im Daten-Repo
 *
 * A Vertrag (netzfrei): Rückblick-Konstanten, heutige Gates unverändert, Blitz-Raster, Kodierer/Dekodierer im Rundlauf,
 *   Klassen gegen das SLD der Quelle, Rasterung echter WCS-Fixtures (+ erfundener Null-Frame und gestörte Palette als
 *   Negativkontrollen), Meta-Bauer/-Prüfer, Schalter.
 * B Retention des Spiegels (netzfrei, reine Funktionen): Zählregel, Altersregel, Lücke, Untergrenze, Rückweg; Tabelle
 *   des Spiegels = Tabelle des Vertrags.
 * C Spiegel Ende-zu-Ende (netzfrei, Bare-Repo): storeSeed → publish mit Voreinstellung und mit dem Rückweg
 *   `PAST_KEEP=12 LIGHTNING=0`; fremde Linien (road/, point/) byte-gleich, `.tmp-`-Reste weg, rv-past = f000 byte-gleich.
 * D (optional) Derive mit echten Eingaben aus HEAD und Arbeitsbaum byte-gleich.
 * E (optional, --live) Daten-Repo nach dem Push.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readTiff, tiffGeo } from './lib/tiff.mjs';
import { decodePng, toRgba, encodePng } from './lib/png.mjs';
import {
  RV_PAST_KEEP, RADAR_PAST_WINDOW_MS, rvPastDir, rvPastEligible, RADAR_CDN_WINDOW_MS, RV_IMG_GATE_MS, RV_CDN_GATE_MS,
  RADAR_IMG_VERSION, RADAR_IMG_BASE, rvStamp,
} from '../src/sources/radolanRuns.ts';
import { RADAR_IMG_KEEP, RADAR_IMG_AGE_RULE, RADAR_IMG_MIN_KEEP, KONRAD_IMG_GATE_MS } from '../src/sources/radarImg.ts';
import {
  LIGHTNING_GRID, LIGHTNING_SOURCES, LIGHTNING_KEEP, LIGHTNING_GATE_MS, LIGHTNING_WINDOW_MS, BD_CLASSES, MTG_COLORS,
  lightningGridCorners, encodeLightningPixel, decodeLightningPixel, bdClassOf, mtgClassOf, capsTimeEnd,
  rasterizeLightning, lightningFrameProblem, makeLightningMeta, parseLightningMeta, lightningValidAtMs,
  lightningSourceTimeIso, lightningStamp, lightningStampToMs, lightningImgDir, lightningImgFlagFrom,
} from '../src/sources/lightningImg.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = join(ROOT, 'audit', 'np0-datenprodukte', 'fixtures');
const MIRROR_SCRIPT = join(ROOT, 'scripts', 'radar-mirror', 'radar-mirror.mjs');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));

let pass = 0, fail = 0;
function add(name, ok, detail = '') {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);

// ─── A Vertrag ────────────────────────────────────────────────────────────────────────────────
console.log('\n== A Vertrag ==');
add('A1 heutige Gates und Fenster unverändert (55 min, 270 s, 240 s, 330 s, v1)',
  RADAR_CDN_WINDOW_MS === 55 * 60_000 && RV_IMG_GATE_MS === 270_000 && RV_CDN_GATE_MS === 240_000
  && KONRAD_IMG_GATE_MS === 330_000 && RADAR_IMG_VERSION === 'v1');
add('A2 Rückblick: 24 Slots, Fenster 115 min, Pfad rv-past/<YYMMDDHHMM>',
  RV_PAST_KEEP === 24 && RADAR_PAST_WINDOW_MS === 115 * 60_000 && rvPastDir('2610031540') === `${RADAR_IMG_BASE}/rv-past/2610031540`);
{
  const t = Date.UTC(2026, 9, 3, 15, 40);
  const ts = rvStamp(new Date(t));
  add('A3 rvPastEligible: vor dem Gate nein, 4,5 min…115 min ja, danach nein',
    !rvPastEligible(ts, t + RV_IMG_GATE_MS - 1) && rvPastEligible(ts, t + RV_IMG_GATE_MS)
    && rvPastEligible(ts, t + 115 * 60_000) && !rvPastEligible(ts, t + 115 * 60_000 + 1));
}
add('A4 Aufbewahrungstabelle: rv/inca 12, rv-past/rzc/konrad3d/Blitze 24, Altersregel für die fünf, Untergrenze 2',
  RADAR_IMG_KEEP.rv === 12 && RADAR_IMG_KEEP.inca === 12 && ['rv-past', 'rzc', 'konrad3d', 'lightning-de', 'lightning-mtg'].every((k) => RADAR_IMG_KEEP[k] === 24)
  && RADAR_IMG_AGE_RULE.length === 5 && RADAR_IMG_MIN_KEEP === 2 && LIGHTNING_KEEP === 24);
{
  const c = lightningGridCorners();
  const near = (a, b) => Math.abs(a - b) < 0.02;
  add('A5 Blitz-Raster 668 × 880 à 2 000 m deckt DACH 5,5–17,5 °E × 45,5–55,5 °N (Ecken ±0,02°)',
    LIGHTNING_GRID.width === 668 && LIGHTNING_GRID.height === 880 && near(c[0][0], 5.5) && near(c[1][0], 17.5)
    && near(c[0][1], 55.5) && Math.abs(c[2][1] - 45.5) < 0.02, JSON.stringify(c.map((p) => p.map((v) => +v.toFixed(3)))));
}
{
  const vals = [0, 0.1, 0.25, 1, 13.37, 99.99, 127];
  const px = new Uint8Array(4);
  let ok = true;
  for (const v of vals) { encodeLightningPixel('de', v, px, 0); ok &&= decodeLightningPixel('de', px[0], px[1], px[2], px[3]) === v && px[3] === 255; }
  encodeLightningPixel('de', NaN, px, 0); ok &&= px[3] === 0 && Number.isNaN(decodeLightningPixel('de', px[0], px[1], px[2], px[3]));
  for (let k = 0; k <= 20; k++) { encodeLightningPixel('mtg', k, px, 0); ok &&= decodeLightningPixel('mtg', px[0], px[1], px[2], px[3]) === k; }
  add('A6 Kodierer/Dekodierer im Rundlauf: BD-Werte exakt (2 Nachkommastellen), fehlt = A 0 = NaN (nie 0), MTG-Klassen 0…20', ok);
}
{
  const sld = readFileSync(join(FIX, 'bd-sld-blitzdichte.xml'), 'utf8');
  const entries = [...sld.matchAll(/<(?:sld:)?ColorMapEntry[^>]*>/g)].map((m) => ({
    color: /color="([^"]+)"/.exec(m[0])?.[1]?.toLowerCase(), q: Number(/quantity="([^"]+)"/.exec(m[0])?.[1]),
  }));
  const same = entries.length === BD_CLASSES.length && entries.every((e, k) => e.color === BD_CLASSES[k].color && e.q === BD_CLASSES[k].q);
  add('A7 BD-Klassen = ColorMap des SLD der Quelle (Farben und Grenzen, 15 Einträge)', same, `${entries.length} Einträge im SLD`);
  add('A8 bdClassOf folgt GeoServer-intervals (0 → „0", 0,05 → „0,1", 1,0 → „1,0 - 1,9"‑Grenze, ≥ 127 → außerhalb)',
    BD_CLASSES[bdClassOf(0)].label === '0' && BD_CLASSES[bdClassOf(0.05)].label === '0,1' && bdClassOf(127) === -1
    && BD_CLASSES[bdClassOf(1.5)].q === 2.0);
}
add('A9 MTG-Palette exakt: jede der 20 Farben → k, Schwarz → 0, Nachbarfarbe (±1 im Rotkanal) → verworfen',
  MTG_COLORS.every((c, k) => mtgClassOf(c[0], c[1], c[2]) === k + 1) && mtgClassOf(0, 0, 0) === 0
  && MTG_COLORS.every((c) => mtgClassOf(c[0] === 255 ? 254 : c[0] + 1, c[1], c[2]) === -1 || (c[0] === 255 && mtgClassOf(254, c[1], c[2]) === -1)));
{
  const bd = capsTimeEnd(readFileSync(join(FIX, 'bd-caps-20261003T1424Z.xml'), 'utf8'));
  const mtg = capsTimeEnd(readFileSync(join(FIX, 'mtg-caps-20261003T1424Z.xml'), 'utf8'));
  add('A10 TIME-Ende aus echten Capabilities beider Quellen; Fremdes → null',
    bd === '2026-10-03T14:15:00.000Z' && typeof mtg === 'string' && mtg.startsWith('2026-10-03T14:') && capsTimeEnd('<x/>') === null, `${bd} · ${mtg}`);
}
function rasterFixture(id, file, mutate) {
  const t = readTiff(readFileSync(join(FIX, file)));
  if (mutate) mutate(t);
  return rasterizeLightning(id, { W: t.W, H: t.H, spp: t.spp, data: t.data, ...tiffGeo(t) });
}
{
  const r = rasterFixture('de', 'bd-wcs-dach-20261003T1400Z.tif');
  add('A11 BD echter Frame (03.10. 14:00Z): angenommen, Nodata-Pixel vorhanden, 0 unbekannt',
    lightningFrameProblem('de', r.stats) === null && r.stats.nodata > 0 && r.stats.unknown === 0, JSON.stringify(r.stats));
  const neg = rasterFixture('de', 'bd-wcs-dach-zukunft-18Z-negativ.tif');
  add('A12 Negativkontrolle: erfundener Null-Frame der Quelle (nicht veröffentlichte Zeit, ohne Nodata) wird verworfen',
    /erfundener Null-Frame/.test(lightningFrameProblem('de', neg.stats) ?? ''), lightningFrameProblem('de', neg.stats) ?? 'angenommen!');
  const m = rasterFixture('mtg', 'mtg-wcs-dach-20250801T1500Z.tif');
  const png = encodePng(LIGHTNING_GRID.width, LIGHTNING_GRID.height, m.rgba, 4);
  const back = { data: toRgba(decodePng(png)) };
  let same = back.data.length === m.rgba.length;
  for (let i = 0; same && i < m.rgba.length; i++) same = back.data[i] === m.rgba[i];
  add('A13 MTG echtes Gewitter (01.08.2025 15Z): angenommen, Klassen bis 20, PNG-Rundlauf byte-gleich',
    lightningFrameProblem('mtg', m.stats) === null && m.stats.active > 1000 && m.stats.max === 20 && same,
    `aktiv ${m.stats.active} px, PNG ${(png.length / 1024).toFixed(1)} KB`);
  // Klasse 20 (177,0,38) wird überall zu (177,1,38) — eine Farbe, die es in der Palette nicht gibt.
  const bad = rasterFixture('mtg', 'mtg-wcs-dach-20250801T1500Z.tif', (t) => {
    for (let p = 0; p < t.W * t.H; p++) if (t.data[p * 3] === 177 && t.data[p * 3 + 1] === 0 && t.data[p * 3 + 2] === 38) t.data[p * 3 + 1] = 1;
  });
  add('A14 Negativkontrolle: eine fremde Farbe im MTG-Mosaik (Palettenwechsel) ⇒ Frame verworfen',
    bad.stats.unknown > 0 && lightningFrameProblem('mtg', bad.stats) !== null, `${bad.stats.unknown} Pixel unbekannt`);
  const meta = makeLightningMeta('mtg', '2025-08-01T15:00:00.000Z', Date.now(), m.stats);
  const ok = parseLightningMeta(JSON.parse(JSON.stringify(meta)));
  const broken = [
    { ...meta, grid: { ...meta.grid, px: 1000 } }, { ...meta, windowMin: 15 }, { ...meta, validAtMs: meta.validAtMs + 1 },
    { ...meta, overlapping: true }, { ...meta, stats: { ...meta.stats, unknown: 1 } }, { ...meta, license: '' },
  ].map((x) => parseLightningMeta(JSON.parse(JSON.stringify(x))));
  add('A15 Meta: Bauer → Prüfer angenommen; sechs Verfälschungen (Raster, Fenster, validAt, Überlappung, unbekannte Pixel, Lizenz) abgelehnt',
    !!ok && broken.every((b) => b === null));
  add('A16 MTG-Meta: validAt = Fensterende (Quell-Zeit = Fensterbeginn + 5 min), Stempel = Fensterende; BD: validAt = Quell-Zeit, überlappend',
    meta.validAtMs === Date.UTC(2025, 7, 1, 15, 5) && lightningStamp(meta.validAtMs) === '20250801T1505'
    && lightningSourceTimeIso('mtg', meta.validAtMs) === '2025-08-01T15:00:00.000Z'
    && lightningValidAtMs('de', '2026-10-03T14:00:00.000Z') === Date.UTC(2026, 9, 3, 14, 0) && LIGHTNING_SOURCES.de.overlapping === true
    && lightningStampToMs('20261003T1400') === Date.UTC(2026, 9, 3, 14, 0));
  add('A17 Ehrlichkeit im Meta: Parallaxe (MTG), „nie aufsummieren" (BD), AT/CH ohne Bodennetz, Nil zweideutig, Lizenzzeilen',
    meta.notes.some((n) => /Parallaxe/.test(n)) && LIGHTNING_SOURCES.de.notes.some((n) => /nie aufsummieren/.test(n))
    && /Österreich und die Schweiz/.test(LIGHTNING_SOURCES.de.coverage) && meta.notes.some((n) => /keine Messung/.test(n))
    && /Deutscher Wetterdienst/.test(LIGHTNING_SOURCES.de.license) && /EUMETSAT/.test(LIGHTNING_SOURCES.mtg.license));
}
add('A18 Pfade + Gate: lightning-de|mtg/<Stempel>, Gate 25 min, Fenster 120 min',
  lightningImgDir('de', '20261003T1400') === `${RADAR_IMG_BASE}/lightning-de/20261003T1400`
  && lightningImgDir('mtg', 'x').endsWith('/lightning-mtg/x') && LIGHTNING_GATE_MS === 25 * 60_000 && LIGHTNING_WINDOW_MS === 120 * 60_000);
add('A19 Kill-Switch ?ltg=0 schlägt localStorage, ?ltg=1 schlägt ltg=0 im Speicher',
  lightningImgFlagFrom('?ltg=0', '1') === false && lightningImgFlagFrom('?ltg=1', '0') === true
  && lightningImgFlagFrom('', '0') === false && lightningImgFlagFrom('', null) === true);

// ─── B Retention ──────────────────────────────────────────────────────────────────────────────
console.log('\n== B Retention des Spiegels ==');
const mirror = await import(pathToFileURL(MIRROR_SCRIPT).href);
add('B1 Tabelle des Spiegels (Voreinstellung KEEP 12, PAST_KEEP 24) = Tabelle des Vertrags',
  JSON.stringify(mirror.IMG_KEEP) === JSON.stringify(RADAR_IMG_KEEP) && JSON.stringify(mirror.IMG_AGE_RULE) === JSON.stringify([...RADAR_IMG_AGE_RULE])
  && mirror.IMG_MIN_KEEP === RADAR_IMG_MIN_KEEP, JSON.stringify(mirror.IMG_KEEP));
const step = 300_000;
const t0 = Date.UTC(2026, 9, 3, 12, 0);
const rvStamps = (n, from = t0) => Array.from({ length: n }, (_, i) => rvStamp(new Date(from + i * step)));
const isoStamps = (n, from = t0, secs = '') => Array.from({ length: n }, (_, i) => lightningStamp(from + i * step) + secs);
add('B2 imgSlotMs liest alle drei Stempelformen (rv, inca/rzc/Blitze, KONRAD mit Sekunden)',
  mirror.imgSlotMs('2610031540') === Date.UTC(2026, 9, 3, 15, 40) && mirror.imgSlotMs('20261003T1540') === Date.UTC(2026, 9, 3, 15, 40)
  && mirror.imgSlotMs('20261003T154000') === Date.UTC(2026, 9, 3, 15, 40) && Number.isNaN(mirror.imgSlotMs('x')));
{
  const rv = rvStamps(15);
  add('B3 Zählregel rv: 15 Slots → die 3 ältesten fallen (wie vor NP-0a)', JSON.stringify(mirror.imgSlotsToDrop('rv', rv)) === JSON.stringify(rv.slice(0, 3)));
  const past = rvStamps(30);
  add('B4 Altersregel rv-past: 30 lückenlose Slots → die 6 ältesten fallen, 24 bleiben', JSON.stringify(mirror.imgSlotsToDrop('rv-past', past)) === JSON.stringify(past.slice(0, 6)));
  const gap = [...rvStamps(10), ...rvStamps(5, t0 + 3 * 3600_000)];   // 10 alte, 3 h Lücke, 5 neue
  add('B5 Altersregel nach einem Ausfall: Slots > 115 min hinter dem jüngsten fallen, auch wenn < 24 bleiben',
    JSON.stringify(mirror.imgSlotsToDrop('rv-past', gap)) === JSON.stringify(gap.slice(0, 10)));
  const two = [...rvStamps(1), ...rvStamps(1, t0 + 5 * 3600_000)];
  add('B6 Untergrenze: nie weniger als 2 Slots (der ältere bleibt trotz 5 h Abstand)', mirror.imgSlotsToDrop('rv-past', two).length === 0);
  const ko = isoStamps(30, t0, '00');
  add('B7 Altersregel KONRAD (`…HHMM00`) und Blitze: 30 → 24', mirror.imgSlotsToDrop('konrad3d', ko).length === 6 && mirror.imgSlotsToDrop('lightning-mtg', isoStamps(30)).length === 6);
  // Mit PAST aus rechnet der Spiegel `IMG_KEEP` schon beim Import auf KEEP um — hier nur die Regelwahl: 30 rzc-Slots
  // werden mit pastOn=false nach Zählregel geschnitten (Zahl aus der Tabelle), nie nach Alter.
  const rzc30 = isoStamps(30);
  add('B8 Regelwahl: ohne Rückblick Zählregel (rzc 30 → die ältesten über der Tabelle), unbekannte Quelle immer Zählregel KEEP',
    JSON.stringify(mirror.imgSlotsToDrop('rzc', rzc30, false)) === JSON.stringify(rzc30.slice(0, 30 - mirror.IMG_KEEP.rzc))
    && mirror.imgSlotsToDrop('inca', isoStamps(14), false).length === 2 && mirror.imgSlotsToDrop('unbekannt', isoStamps(14), true).length === 2);
}

{
  const { createLightningMirror } = await import(pathToFileURL(join(ROOT, 'scripts', 'lightning', 'lightning-mirror.mjs')).href);
  const dir = mkdtempSync(join(tmpdir(), 'np0-hook-'));
  const h = createLightningMirror({ appDir: ROOT, mirrorDir: dir, log: () => {}, quiet: () => true });
  const t = performance.now();
  for (let i = 0; i < 100; i++) h.poll();
  const ms = performance.now() - t;
  add('B9 Haken: poll() blockiert nie (100 Aufrufe) und startet im RV-Fenster (quiet) keinen Kindprozess',
    h.enabled && !h.busy && h.status.runs === 0 && ms < 50, `${ms.toFixed(1)} ms`);
  const prev = process.env.LIGHTNING;
  process.env.LIGHTNING = '0';
  const off = createLightningMirror({ appDir: ROOT, mirrorDir: dir, log: () => {} });
  if (prev === undefined) delete process.env.LIGHTNING; else process.env.LIGHTNING = prev;
  add('B10 LIGHTNING=0 ⇒ Haken aus (poll meldet nie etwas); der Spiegel übergibt sein RV-Fenster als `quiet`',
    !off.enabled && off.poll().changed === false && readFileSync(MIRROR_SCRIPT, 'utf8').includes('quiet: rvQuiet'));
  rmSync(dir, { recursive: true, force: true });
}

// ─── C Spiegel Ende-zu-Ende gegen ein Bare-Repo ───────────────────────────────────────────────
console.log('\n== C Spiegel Ende-zu-Ende (Bare-Repo, netzfrei) ==');
const T = mkdtempSync(join(tmpdir(), 'np0-radar-'));
const git = (cwd, a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const GIT_ENV = { GIT_AUTHOR_NAME: 'np0', GIT_AUTHOR_EMAIL: 'np0@x', GIT_COMMITTER_NAME: 'np0', GIT_COMMITTER_EMAIL: 'np0@x' };
const w = (p, data) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, data); };
function buildSeed(dir) {
  const now = Date.UTC(2026, 9, 3, 15, 0);
  w(join(dir, 'README.md'), '# test\n');
  w(join(dir, 'point', 'index.json'), '{"x":1}\n');
  w(join(dir, 'road', 'v1', 'obs', '2610031500.json'), '{"road":1}\n');
  w(join(dir, 'radar', 'status.json'), '{"schema":2}\n');
  const img = join(dir, 'radar', 'img', 'v1');
  for (let i = 0; i < 14; i++) {
    const ms = now - (13 - i) * step, s = rvStamp(new Date(ms));
    w(join(dir, 'radar', 'rv', `composite_rv_20${s.slice(0, 6)}_${s.slice(6)}.tar`), `raw-rv-${s}`);
    w(join(img, 'rv', s, 'f000.png'), `f000-${s}`);
    w(join(img, 'rv', s, 'f005.png'), `f005-${s}`);
    w(join(img, 'rv', s, 'meta.json'), `{"s":"${s}"}`);
    w(join(img, 'inca', lightningStamp(ms), 'f015.png'), `inca-${s}`);
  }
  w(join(img, 'inca', '20260920T0030.tmp-3300', 'f015.png'), 'abgebrochener Derive');
  for (let i = 0; i < 30; i++) {
    const ms = now - (29 - i) * step;
    w(join(img, 'rzc', lightningStamp(ms), 'frame.png'), `rzc-${i}`);
    w(join(img, 'konrad3d', `${lightningStamp(ms)}00`, 'cells.json'), `konrad-${i}`);
    w(join(img, 'lightning-de', lightningStamp(ms), 'frame.png'), `ltg-de-${i}`);
    w(join(img, 'lightning-mtg', lightningStamp(ms), 'frame.png'), `ltg-mtg-${i}`);
  }
}
function runMirror(env, label) {
  const job = join(T, `job-${label}`);
  git(T, ['clone', '--quiet', join(T, 'bare.git'), job]);
  const store = join(T, `store-${label}`);
  // Reste im lokalen Bestand: ein alter (> 10 min) und ein frischer `.tmp-` — der alte muss weg, beide nie ins Repo.
  const old = join(store, 'img', 'inca', '20261003T1000.tmp-1'), fresh = join(store, 'img', 'inca', '20261003T1005.tmp-2');
  w(join(old, 'x'), 'alt'); w(join(fresh, 'x'), 'frisch');
  const past = new Date(Date.now() - 3600_000); utimesSync(old, past, past);
  const driver = join(T, `driver-${label}.mjs`);
  writeFileSync(driver, `const m = await import(${JSON.stringify(pathToFileURL(MIRROR_SCRIPT).href)}); m.storeSeed(); const p = m.publish('np0 test ${label}'); console.log(JSON.stringify(p));`);
  const out = execFileSync(process.execPath, [driver], {
    cwd: job, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...GIT_ENV, MIRROR: store, REMOTE: 'origin', BRANCH: 'main', KEEP: '12', APP_DIR: '', PAST_KEEP: '', LIGHTNING: '', ...env },
  });
  return { job, store, out, oldGone: !existsSync(old), freshKept: existsSync(fresh) };
}
function tree(ref = 'main') {
  const list = git(join(T, 'bare.git'), ['ls-tree', '-r', ref]).split('\n').filter(Boolean);
  return new Map(list.map((l) => { const [meta, path] = l.split('\t'); return [path, meta.split(' ')[2]]; }));
}
const countDirs = (tr, prefix) => new Set([...tr.keys()].filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length).split('/')[0])).size;
try {
  git(T, ['init', '--quiet', '--bare', '-b', 'main', 'bare.git']);
  const seed = join(T, 'seed');
  mkdirSync(seed);
  git(seed, ['init', '--quiet', '-b', 'main']);
  buildSeed(seed);
  execFileSync('git', ['add', '-A'], { cwd: seed });
  execFileSync('git', ['commit', '--quiet', '-m', 'seed'], { cwd: seed, env: { ...process.env, ...GIT_ENV } });
  execFileSync('git', ['push', '--quiet', join(T, 'bare.git'), 'main'], { cwd: seed });
  const before = tree();

  // C-a Voreinstellung
  const a = runMirror({}, 'default');
  const ta = tree();
  const img = 'radar/img/v1/';
  add('C1 Voreinstellung: rv 12 Slots, inca 12, rohe RV-Tars 12 (Zählregel unverändert)',
    countDirs(ta, `${img}rv/`) === 12 && countDirs(ta, `${img}inca/`) === 12 && [...ta.keys()].filter((p) => p.startsWith('radar/rv/')).length === 12);
  add('C2 Voreinstellung: rzc, konrad3d, lightning-de, lightning-mtg je 24 Slots (Altersregel; vorher kürzte die Naht auf 12 bzw. 3)',
    ['rzc', 'konrad3d', 'lightning-de', 'lightning-mtg'].every((s) => countDirs(ta, `${img}${s}/`) === 24),
    ['rzc', 'konrad3d', 'lightning-de', 'lightning-mtg'].map((s) => `${s} ${countDirs(ta, `${img}${s}/`)}`).join(', '));
  const pastPaths = [...ta.keys()].filter((p) => p.startsWith(`${img}rv-past/`));
  const pastSame = pastPaths.length === 14 && pastPaths.every((p) => {
    const s = p.split('/')[4];
    return p.endsWith('/f000.png') && ta.get(p) === before.get(`${img}rv/${s}/f000.png`);
  });
  add('C3 rv-past: f000 aller 14 vorhandenen RV-Slots, Blob-gleich zur f000 des RV-Slots (auch die 2, deren voller Slot herausfällt)', pastSame, `${pastPaths.length} Dateien`);
  const keptSame = [...ta.keys()].filter((p) => p.startsWith(img) && !p.includes('/rv-past/')).every((p) => ta.get(p) === before.get(p));
  add('C4 jede übernommene Datei Blob-gleich zum Seed (Bestand nur kopiert, nie neu geschrieben)', keptSame);
  const foreign = ['README.md', 'point/index.json', 'road/v1/obs/2610031500.json'].every((p) => ta.get(p) === before.get(p));
  add('C5 fremde Linien (README, point/, road/) Blob-gleich — publish fasst nur radar/ an', foreign);
  add('C6 V-NP0-4: der `.tmp-`-Rest auf main ist weg; im Bestand: alter Rest gelöscht, frischer bleibt, aber nie im Repo',
    ![...ta.keys()].some((p) => p.includes('.tmp-')) && before.has(`${img}inca/20260920T0030.tmp-3300/f015.png`) && a.oldGone && a.freshKept);
  const st = JSON.parse(git(join(T, 'bare.git'), ['show', 'main:radar/status.json']));
  add('C7 status.json Schema 3 mit Aufbewahrung je Quelle und Altersregel', st.schema === 3 && st.imgKeep?.['rv-past'] === 24 && st.imgAgeRule?.length === 5 && st.pastKeep === 24);

  // C-b Rückweg auf denselben Seed (erst main auf den Seed zurück)
  execFileSync('git', ['push', '--quiet', '--force', join(T, 'bare.git'), 'main'], { cwd: seed });
  runMirror({ PAST_KEEP: '12', LIGHTNING: '0' }, 'rollback');
  const tb = tree();
  add('C8 Rückweg PAST_KEEP=12 LIGHTNING=0: kein rv-past, keine Blitze, rzc/konrad3d/rv/inca je 12 — der Spiegel vor NP-0a',
    countDirs(tb, `${img}rv-past/`) === 0 && countDirs(tb, `${img}lightning-de/`) === 0 && countDirs(tb, `${img}lightning-mtg/`) === 0
    && ['rv', 'inca', 'rzc', 'konrad3d'].every((s) => countDirs(tb, `${img}${s}/`) === 12));
  // Erwartung „vor NP-0a" unabhängig gerechnet: je Quelle die 12 jüngsten Slots des Seeds, alle Blobs unverändert.
  const expect = new Map();
  for (const s of ['rv', 'inca', 'rzc', 'konrad3d']) {
    const slots = [...new Set([...before.keys()].filter((p) => p.startsWith(`${img}${s}/`) && !p.includes('.tmp-')).map((p) => p.split('/')[4]))].sort().slice(-12);
    for (const [p, b] of before) if (p.startsWith(`${img}${s}/`) && slots.includes(p.split('/')[4])) expect.set(p, b);
  }
  const imgB = new Map([...tb].filter(([p]) => p.startsWith(img)));
  add('C9 Rückweg = unabhängig gerechneter Stand vor NP-0a (je Quelle die 12 jüngsten Slots, Blob für Blob)',
    imgB.size === expect.size && [...expect].every(([p, b]) => imgB.get(p) === b), `${imgB.size} / ${expect.size} Dateien`);
  add('C10 Negativkontrolle: dieselbe Erwartung trifft den Voreinstellungs-Lauf NICHT (rv-past/Blitze/24er-Quellen wären übersehen)',
    !(new Map([...ta].filter(([p]) => p.startsWith(img))).size === expect.size));
} catch (e) {
  add('C Ende-zu-Ende lief durch', false, String(e.stderr ?? e.message).split('\n').slice(0, 3).join(' | '));
} finally {
  rmSync(T, { recursive: true, force: true });
}

// ─── D Derive byte-gleich zu HEAD (echte Eingaben) ────────────────────────────────────────────
if (args['derive-head']) {
  console.log('\n== D Derive mit echten Eingaben: HEAD gegen Arbeitsbaum ==');
  const head = args['derive-head'];
  const D = mkdtempSync(join(tmpdir(), 'np0-derive-'));
  const UA = { 'user-agent': 'buscosun-verify-np0' };
  const get = async (u) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`${u}: ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
  const derive = (app, source, inPath, stamp, tag) => {
    const out = join(D, tag, source, stamp);
    execFileSync(process.execPath, ['--experimental-strip-types', '--import', pathToFileURL(join(app, 'scripts', 'lib', 'register-ts.mjs')).href,
      join(app, 'scripts', 'radar-mirror', 'radar-derive.mjs'), source, inPath, out, stamp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, REPACK_BZIP2: '1' }, timeout: 180_000 });
    // Einzige erlaubte Abweichung: INCA-`meta.json#fetchedAtMs` ist die Wanduhr des Derive (radar-derive.mjs:90) —
    // nur dieses Feld wird vor dem Vergleich genullt; jedes PNG und jedes andere Feld bleibt streng.
    const norm = (f, b) => (source === 'inca' && f === 'meta.json' ? Buffer.from(JSON.stringify({ ...JSON.parse(b.toString()), fetchedAtMs: 0 })) : b);
    return Object.fromEntries(readdirSync(out).sort().map((f) => [f, sha(norm(f, readFileSync(join(out, f))))]));
  };
  try {
    const inputs = [];
    for (let back = 5; back <= 30 && inputs.filter((x) => x.source === 'rv').length < 2; back += 5) {
      const s = rvStamp(new Date(Math.floor((Date.now() - back * 60_000) / step) * step));
      try { const b = await get(`https://opendata.dwd.de/weather/radar/composite/rv/composite_rv_20${s.slice(0, 6)}_${s.slice(6)}.tar`); const p = join(D, `rv-${s}.tar`); writeFileSync(p, b); inputs.push({ source: 'rv', p, stamp: s }); } catch { /* noch nicht da */ }
    }
    for (let back = 10; back <= 40 && !inputs.some((x) => x.source === 'konrad3d'); back += 5) {
      const ms = Math.floor((Date.now() - back * 60_000) / step) * step;
      const s = `${lightningStamp(ms)}00`;
      try { const b = await get(`https://opendata.dwd.de/weather/radar/konrad3d/KONRAD3D_${s}.xml`); const p = join(D, `k-${s}.xml`); writeFileSync(p, b); inputs.push({ source: 'konrad3d', p, stamp: s }); } catch { /* */ }
    }
    try {
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const item = JSON.parse((await get(`https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-precip/items/${day}-ch`)).toString());
      const k = Object.keys(item.assets).filter((x) => x.startsWith('rzc')).sort().pop();
      const p = join(D, 'rzc.h5'); writeFileSync(p, await get(item.assets[k].href)); inputs.push({ source: 'rzc', p, stamp: '20261003T0000' });
    } catch (e) { console.log(`  (rzc nicht geladen: ${e.message})`); }
    try {
      const p = join(D, 'inca.nc');
      writeFileSync(p, await get('https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km?parameters=rr&output_format=netcdf&bbox=45.51,8.11,49.47,17.73'));
      inputs.push({ source: 'inca', p, stamp: '20261003T0000' });
    } catch (e) { console.log(`  (inca nicht geladen: ${e.message})`); }
    const results = [];
    for (const x of inputs) {
      const h = derive(head, x.source, x.p, x.stamp, 'head'), c = derive(ROOT, x.source, x.p, x.stamp, 'cur');
      results.push({ ...x, h, c, same: JSON.stringify(h) === JSON.stringify(c) });
      add(`D ${x.source} ${x.stamp}: ${Object.keys(c).length} Dateien byte-gleich HEAD ↔ Arbeitsbaum`, JSON.stringify(h) === JSON.stringify(c), `${Object.keys(h).length} vs ${Object.keys(c).length}`);
    }
    const rvs = results.filter((r) => r.source === 'rv');
    if (rvs.length >= 2) add('D Negativkontrolle: zwei verschiedene RV-Läufe ergeben verschiedene f000 (der Vergleich ist scharf)', rvs[0].c['f000.png'] !== rvs[1].c['f000.png']);
    add('D Eingaben vorhanden: RV ×2, KONRAD, rzc, INCA', ['rv', 'konrad3d', 'rzc', 'inca'].every((s) => inputs.some((x) => x.source === s)), inputs.map((x) => x.source).join(', '));
  } finally { rmSync(D, { recursive: true, force: true }); }
}

// ─── E Live ───────────────────────────────────────────────────────────────────────────────────
if (args.live) {
  console.log('\n== E Live (Daten-Repo nach Jans Push) ==');
  const api = async (u) => { const r = await fetch(u, { headers: { 'user-agent': 'buscosun-verify-np0', accept: 'application/vnd.github+json' } }); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); };
  const ref = await api('https://api.github.com/repos/jppetry/buscosun-data/commits/main');
  const treeOf = async (path) => {
    let sha = ref.commit.tree.sha;
    for (const seg of path.split('/')) {
      const t = await api(`https://api.github.com/repos/jppetry/buscosun-data/git/trees/${sha}`);
      const e = t.tree.find((x) => x.path === seg);
      if (!e) return [];
      sha = e.sha;
    }
    return (await api(`https://api.github.com/repos/jppetry/buscosun-data/git/trees/${sha}`)).tree.map((x) => x.path).filter((p) => !p.includes('.tmp-')).sort();
  };
  const status = await (await fetch(`https://raw.githubusercontent.com/jppetry/buscosun-data/${ref.sha}/radar/status.json`)).json();
  add('E1 status.json Schema 3, Rückblick an (pastKeep 24), Blitz-Haken an', status.schema === 3 && status.pastKeep === 24 && !!status.lightning?.enabled,
    `schema ${status.schema}, Blitz-Läufe ${status.lightning?.runs}, geschrieben ${status.lightning?.written}, Fehler ${status.lightning?.failed}`);
  for (const [dir, min] of [['rv-past', 22], ['rzc', 20], ['konrad3d', 20], ['lightning-de', 20], ['lightning-mtg', 20]]) {
    const slots = await treeOf(`radar/img/v1/${dir}`);
    add(`E ${dir}: ≥ ${min} Slots (Ziel 24 nach ≥ 2 h)`, slots.length >= min && slots.length <= 24, `${slots.length} Slots, ${slots[0] ?? '—'} … ${slots.at(-1) ?? '—'}`);
    if (dir.startsWith('lightning')) {
      const id = dir === 'lightning-de' ? 'de' : 'mtg';
      const last = slots.at(-1);
      if (last) {
        const base = `https://raw.githubusercontent.com/jppetry/buscosun-data/${ref.sha}/radar/img/v1/${dir}/${last}`;
        const meta = parseLightningMeta(await (await fetch(`${base}/meta.json`)).json());
        const png = decodePng(Buffer.from(await (await fetch(`${base}/frame.png`)).arrayBuffer()));
        add(`E ${dir} jüngster Slot: Meta besteht den Prüfer, Bild ${LIGHTNING_GRID.width}×${LIGHTNING_GRID.height}, Alter des Fensterendes`,
          !!meta && png.width === LIGHTNING_GRID.width && png.height === LIGHTNING_GRID.height,
          meta ? `${((Date.now() - meta.validAtMs) / 60_000).toFixed(1)} min, aktiv ${meta.stats.active} px, gebrochen ${meta.stats.fractionalPx} px` : 'Meta abgelehnt');
        void id;
      }
    }
  }
  const rv = (status.recent ?? []).filter((r) => r.product === 'rv' && r.dwdAt);
  const lags = rv.map((r) => (Date.parse(r.pushedAt) - Date.parse(r.dwdAt)) / 1000).sort((a, b) => a - b);
  add('E RV-Lag DWD→Push nicht schlechter als vor NP-0a (Median ≤ 12 s, max ≤ 30 s; vorher 10 / 16 s)',
    lags.length > 0 && lags[lags.length >> 1] <= 12 && lags.at(-1) <= 30, `n ${lags.length}, Median ${lags[lags.length >> 1]} s, max ${lags.at(-1)} s`);
}

console.log(`\nverify:np0-radar — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
