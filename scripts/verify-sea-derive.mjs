/**
 * verify:sea-derive — Phase SW (audit/seewetter.md §6): the field/spot line, the text line, the publisher and the
 * archive end to end, OFFLINE: the real producer modules on the real CWAM excerpts of run 07.10.2026 00 UTC
 * (`scripts/lib/fixtures/sea/cwam-2026100700/`, every step reads the excerpt of its parameter), the real bulletins
 * (`audit/seewetter/fixtures/`), a LOCAL bare repo instead of buscosun-data, a stand-in DWD for the texts — and the
 * SW-6 rules (classes, windows, shore angle) on the real spot series of that run (`fixtures/sea/spots-2026100700.json`).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-sea-derive.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { decodeGrib2 } from '../src/sources/gribDecode.ts';
import { decompressBz2 } from './lib/bz2.mjs';
import { decodePng, toRgba } from './lib/png.mjs';
import {
  SEA_MODELS, SEA_F_STEPS, SEA_C_STEPS, SEA_SPOT_STEPS, decodeHs, decodeDir, decodePeriod, seaRunJsonPath, seaSpotsPath, seaFieldPath, seaCompPath,
  SEA_STATUS_PATH, seaMaskHashPath, seaQuarantinePath, SEA_PARAMS, decodeSpotValue,
} from '../src/sea/seaContract.ts';
import { seaTextProductOfFile } from '../src/sea/seaText.ts';
import { seaTextPath } from '../src/sea/seaContract.ts';
import { SEA_PROFILE_BY_ID, classify, windows, shoreAngle, nextAndLongest, fmtWind, knToBft, loadLimits, saveLimits } from '../src/sea/seaProfiles.ts';
import { buildRun, dueRun, parseInventory, pruneRuns } from './sea/sea-derive.mjs';
import { pollTexts } from './sea/sea-text.mjs';
import { publishSea } from './sea/sea-publish.mjs';
import { archiveSea, parsePoi } from './sea/sea-archive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'lib', 'fixtures', 'sea');
const GRIB = join(FIX, 'cwam-2026100700');
const TXT = join(HERE, '..', 'audit', 'seewetter', 'fixtures');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const tmp = mkdtempSync(join(tmpdir(), 'sea-derive-'));
const T = (iso) => Date.parse(iso);
const RUN = '2026100700';
const g = SEA_MODELS.cwam.grid;

// Every step of a parameter reads the excerpt of that parameter (024, else the first one there is).
const files = readdirSync(GRIB).filter((f) => f.endsWith('.bz2'));
const fileOf = (p, s) => {
  const P = p.toUpperCase();
  const own = files.find((f) => f === `CWAM_${P}_${RUN}_${String(s).padStart(3, '0')}.grib2.bz2`);
  return join(GRIB, own ?? files.find((f) => f === `CWAM_${P}_${RUN}_024.grib2.bz2`) ?? files.find((f) => f.startsWith(`CWAM_${P}_`)));
};
const field = async (p, s = 24) => decodeGrib2(new Uint8Array(await decompressBz2(readFileSync(fileOf(p, s))))).values;

// Static files of the store: the catalogue as the builder writes it (two real spots).
const store = join(tmp, 'store');
mkdirSync(join(store, 'static'), { recursive: true });
const spotsCat = [
  { id: 'st-peter-ording', name: 'St. Peter-Ording', region: 'nordsee', kinds: ['kite'], lat: 54.3, lon: 8.6, normal: 235, normalFrom: 'mask', cell: { model: 'cwam', i: 174, j: 259, km: 1.52 }, seaArea: { id: '401000008', name: 'Deutsche Bucht' }, coast: { id: '501000003', name: 'Elbmuendung' }, wodlCoast: 'Nordseekueste', station: { id: '10028', name: 'ST. PETER ORDING', km: 3.7 } },
  { id: 'fehmarn-gruener-brink', name: 'Fehmarn Grüner Brink', region: 'ostsee', kinds: ['kite'], lat: 54.528, lon: 11.17, normal: 36, normalFrom: 'mask', cell: { model: 'cwam', i: 360, j: 230, km: 0.27 }, seaArea: { id: '401000014', name: 'Westliche Ostsee' }, coast: { id: '501000006', name: 'Flensburg bis Fehmarn' }, wodlCoast: 'Ostseekueste', station: { id: '10055', name: 'WESTERMARKELSDORF', km: 6.7 } },
];
writeFileSync(join(store, 'static', 'spots.json'), JSON.stringify({ schema: 1, product: 'sea-spots', spots: spotsCat }));
const inv = parseInventory(SEA_PARAMS.flatMap((p) => SEA_MODELS.cwam.steps.map((s) => `./wave_models/cwam/grib/00/${p}/CWAM_${p.toUpperCase()}_${RUN}_${String(s).padStart(3, '0')}.grib2.bz2|1000|2026-10-07 04:07:00`)).join('\n'));
const nowMs = T('2026-10-07T05:10:00Z');

// Wind stand-in: the shape of `spotWind` (buscosun Fusion needs the cube; tested live in the run of §6, not here).
const windOk = async ({ spots }) => ({
  series: Object.fromEntries(spots.map((s) => [s.id, {
    wind: SEA_SPOT_STEPS.map((h) => (h < 5 ? null : 80 + h)), gust: SEA_SPOT_STEPS.map((h) => (h < 5 ? null : h === 42 ? 60 : 110 + h)), windDir: SEA_SPOT_STEPS.map((h) => (h < 5 ? null : (h * 7) % 360)),
  }])),
  failed: [], meta: { engine: 'buscosun Fusion 9', version: 9, computedAt: new Date(nowMs).toISOString(), runs: { t1: '2026100703' } },
});

// --- A: field line ----------------------------------------------------------------------------------------
add('A0 Inventar: erwarteter Lauf vollständig (13 × 79) und noch nicht im Speicher ⇒ fällig', dueRun(inv, store, nowMs).run === RUN, JSON.stringify(dueRun(inv, store, nowMs)));
const res = await buildRun({ storeDir: store, dataDir: 'cdn', cacheDir: join(tmp, 'cache'), run: RUN, inv, nowMs, ewam: false, windImpl: windOk, fileOf, killed: false });
add('A1 Lauf gebaut: f 59, c 27, Spots, run.json, Maskenhash, status.json', res.built
  && SEA_F_STEPS.every((s) => existsSync(join(store, seaFieldPath('cwam', RUN, s)))) && SEA_C_STEPS.every((s) => existsSync(join(store, seaCompPath('cwam', RUN, s))))
  && existsSync(join(store, seaSpotsPath(RUN))) && existsSync(join(store, seaRunJsonPath('cwam', RUN))) && existsSync(join(store, seaMaskHashPath('cwam'))) && existsSync(join(store, SEA_STATUS_PATH)),
  JSON.stringify({ built: res.built, mb: res.mb, reason: res.reason }));
const runDoc = JSON.parse(readFileSync(join(store, seaRunJsonPath('cwam', RUN)), 'utf8'));
const maskHash = readFileSync(join(store, seaMaskHashPath('cwam')), 'utf8').trim();
add('A2 Maskenhash = verify:sea-decode (55cf783d…), Bilanz mit Platzhaltern, 0 außerhalb in swh', maskHash.startsWith('55cf783db5fcdee6') && runDoc.maskHash === maskHash && runDoc.balance.swh.invalid === 0 && runDoc.balance.tm10.placeholder > 0, `${maskHash.slice(0, 16)} · tm10 Platzhalter ${runDoc.balance.tm10.placeholder}`);
// PNG round trip against the source fields.
const [hs, mwd, tm] = await Promise.all([field('swh'), field('mwd'), field('tm10')]);
const f24 = decodePng(readFileSync(join(store, seaFieldPath('cwam', RUN, 24))));
const rgba = toRgba(f24);
let water = 0, worstHs = 0, worstTm = 0, worstDir = 0, landOk = true, nullHs = 0;
for (let k = 0; k < g.ni * g.nj; k++) {
  const o = k * 4;
  if (Number.isNaN(hs[k])) { if (rgba[o + 3] !== 0) landOk = false; continue; }
  if (rgba[o + 3] !== 255) { landOk = false; continue; }
  water++;
  const h = decodeHs(rgba[o]);
  if (h == null) { nullHs++; continue; }
  worstHs = Math.max(worstHs, Math.abs(h - hs[k]));
  const p = decodePeriod(rgba[o + 2]);
  if (p != null) worstTm = Math.max(worstTm, Math.abs(p - tm[k]));
  worstDir = Math.max(worstDir, Math.abs(((decodeDir(rgba[o + 1]) - (mwd[k] % 360) + 540) % 360) - 180));
}
add('A3 f/024.png hin und zurück: 124 011 Wasserpixel (A = 255), Land A = 0, Hs ≤ 2,5 cm, Periode ≤ 0,05 s, Richtung ≤ 0,70°',
  f24.width === 630 && f24.height === 387 && landOk && water === 124011 && worstHs <= 0.025 + 1e-6 && worstTm <= 0.05 + 1e-6 && worstDir <= 0.71,
  `${f24.width}×${f24.height} · Wasser ${water} · null ${nullHs} · Hs ${worstHs.toFixed(4)} · Tm ${worstTm.toFixed(4)} · Richtung ${worstDir.toFixed(3)}`);
const c24 = toRgba(decodePng(readFileSync(join(store, seaCompPath('cwam', RUN, 24)))));
const [shww, shts] = await Promise.all([field('shww'), field('shts')]);
let worstC = 0;
for (let k = 0; k < g.ni * g.nj; k += 7) {
  if (Number.isNaN(shww[k])) continue;
  const r = Math.floor(k / g.ni), c = k % g.ni;
  const L = (r * 2 * g.ni + c) * 4, R = (r * 2 * g.ni + g.ni + c) * 4;
  const a = decodeHs(c24[L]), b = decodeHs(c24[R]);
  if (a != null) worstC = Math.max(worstC, Math.abs(a - shww[k]));
  if (b != null) worstC = Math.max(worstC, Math.abs(b - shts[k]));
}
add('A4 c/024.png doppelte Breite: links Windsee (shww), rechts Dünung (shts), je ≤ 2,5 cm', worstC <= 0.025 + 1e-6, `${worstC.toFixed(4)} m`);
const spots = JSON.parse(readFileSync(join(store, seaSpotsPath(RUN)), 'utf8'));
const sp = spots.spots['st-peter-ording'];
const k0 = 259 * g.ni + 174;
add('A5 Spot-Reihe = Feldwert an der Zelle (Hs cm, Periode 0,1 s), Herkunft je Spalte: Welle Modell, Wind Fusion',
  sp && sp.v.hs[24] === Math.round(hs[k0] * 100) && decodeSpotValue('tm', sp.v.tm[24]) === Math.round(tm[k0] * 10) / 10 && spots.origin.hs === 'model' && spots.origin.wind === 'fusion' && spots.wind.engine === 'buscosun Fusion 9',
  `hs ${sp?.v.hs[24]} ↔ ${(hs[k0] * 100).toFixed(1)} · tm ${sp?.v.tm[24]} ↔ ${(tm[k0] * 10).toFixed(1)}`);
add('A6 Böe unter Wind (Stunde 42 im Stand-in) wird null, gezählt; WAM-Wind (sp_10m) steht nirgends in Datei oder Lauf',
  sp.v.gust[42] === null && sp.gustDropped === 1 && !JSON.stringify(spots).includes('sp_10m') && !JSON.stringify(runDoc).includes('"sp_10m"'),
  `gust[42] ${sp.v.gust[42]} · dropped ${sp.gustDropped}`);
add('A7 run.json zuletzt geschrieben (nach spots und PNGs) und Lauf erneut nicht fällig', dueRun(inv, store, nowMs).run === null, JSON.stringify(dueRun(inv, store, nowMs)));
// Without wind: the waves are published, the spot says so.
const store2 = join(tmp, 'store2');
cpSync(join(store, 'static'), join(store2, 'static'), { recursive: true });
rmSync(join(store2, 'static', 'mask-cwam.hash'), { force: true });
const res2 = await buildRun({ storeDir: store2, dataDir: 'cdn', cacheDir: join(tmp, 'cache2'), run: RUN, inv, nowMs, ewam: false, windImpl: async () => { throw new Error('Cube nicht lesbar'); }, fileOf, killed: false });
const sp2 = JSON.parse(readFileSync(join(store2, seaSpotsPath(RUN)), 'utf8'));
add('A8 Wind-Fehler hält die Welle nicht auf: Lauf frei, Wind je Spot null, Grund benannt', res2.built && sp2.spots['st-peter-ording'].v.wind.every((x) => x === null) && sp2.wind.failed.length === 2 && /Cube nicht lesbar/.test(sp2.wind.failed[0].error), sp2.wind.failed[0]?.error);
// Quarantine: a foreign mask hash.
const store3 = join(tmp, 'store3');
cpSync(join(store, 'static'), join(store3, 'static'), { recursive: true });
writeFileSync(join(store3, 'static', 'mask-cwam.hash'), 'deadbeef\n');
const res3 = await buildRun({ storeDir: store3, dataDir: null, cacheDir: join(tmp, 'cache3'), run: RUN, inv, nowMs, ewam: false, fileOf, killed: false });
const st3 = JSON.parse(readFileSync(join(store3, SEA_STATUS_PATH), 'utf8'));
add('A9 fremde Landmaske ⇒ Quarantäne-Datei, KEIN Lauf, status.blocked mit Regel', !res3.built && existsSync(join(store3, seaQuarantinePath(`cwam-${RUN}`))) && !existsSync(join(store3, seaRunJsonPath('cwam', RUN))) && st3.field.blocked?.reasons?.[0]?.rule === 'mask', res3.reason);
// Incomplete inventory.
const invShort = parseInventory(SEA_PARAMS.flatMap((p) => SEA_MODELS.cwam.steps.filter((s) => s < 78).map((s) => `./wave_models/cwam/grib/00/${p}/CWAM_${p.toUpperCase()}_${RUN}_${String(s).padStart(3, '0')}.grib2.bz2|1000|2026-10-07 04:05:00`)).join('\n'));
add('A10 Lauf noch nicht vollständig (13 × 78) ⇒ nicht fällig, letzter guter Lauf bleibt', dueRun(invShort, join(tmp, 'empty'), nowMs).run === null && /1014\/1027/.test(dueRun(invShort, join(tmp, 'empty'), nowMs).reason), dueRun(invShort, join(tmp, 'empty'), nowMs).reason);
add('A11 Lauf älter als 30 h wird nicht mehr gebaut', dueRun(inv, join(tmp, 'empty'), T('2026-10-08T07:00:00Z')).run === null, dueRun(inv, join(tmp, 'empty'), T('2026-10-08T07:00:00Z')).reason);
// Retention.
for (const r of ['2026100512', '2026100600', '2026100612']) { mkdirSync(join(store, 'run', 'cwam', r), { recursive: true }); writeFileSync(join(store, 'run', 'cwam', r, 'run.json'), '{}'); mkdirSync(join(store, 'spots'), { recursive: true }); writeFileSync(join(store, 'spots', `${r}.json`), '{}'); }
mkdirSync(join(store, 'run', 'cwam', '2026100800', 'f'), { recursive: true });
const removed = pruneRuns(store);
const left = readdirSync(join(store, 'run', 'cwam')).sort();
add('A12 Aufbewahrung: nur aktueller + voriger Lauf (und Spots); halber Ordner ohne run.json fliegt', JSON.stringify(left) === '["2026100612","2026100700"]' && readdirSync(join(store, 'spots')).length === 2, `${left.join(',')} · entfernt ${removed.join(',')}`);
// Kill switch.
const store4 = join(tmp, 'store4');
cpSync(join(store, 'static'), join(store4, 'static'), { recursive: true });
const res4 = await buildRun({ storeDir: store4, cacheDir: join(tmp, 'c4'), run: RUN, inv, nowMs, ewam: false, fileOf, killed: true });
add('A13 Kill-Schalter SEA_KILL=1 ⇒ nichts gebaut, status.killSwitch = true', !res4.built && JSON.parse(readFileSync(join(store4, SEA_STATUS_PATH), 'utf8')).killSwitch === true, res4.reason);

// --- C: text line (stand-in DWD) -----------------------------------------------------------------------------
const fixtures = readdirSync(TXT).filter((f) => seaTextProductOfFile(f));
const dwdText = (overrides = {}) => async (url) => {
  const name = url.split('/').pop();
  if (url.endsWith('/german/')) return new Response(fixtures.concat(Object.keys(overrides)).map((f) => `<a href="${f}">${f}</a>`).join('\n'));
  const buf = overrides[name] ?? (fixtures.includes(name) ? readFileSync(join(TXT, name)) : null);
  return buf ? new Response(buf, { headers: { 'last-modified': 'Wed, 07 Oct 2026 11:45:29 GMT' } }) : new Response('', { status: 404 });
};
const tStore = join(tmp, 'tstore');
mkdirSync(tStore, { recursive: true });
const tNow = T('2026-10-07T12:40:00Z');
const r1 = await pollTexts({ storeDir: tStore, nowMs: tNow, fetchImpl: dwdText(), killed: false });
const w12 = JSON.parse(readFileSync(join(tStore, seaTextPath('WODL45', '2610071200')), 'utf8'));
add('C1 Texte: Stufe-1-Fixtures abgelegt (FQDL60 = Stufe 2 nicht), raw/sha256/dwdAt da, Warnfall wörtlich', r1.added === 5 && !existsSync(join(tStore, 'text', 'FQDL60')) && w12.sha256 === 'e0f44b31e1cb289aa9d4221fb368ac8becff64b1ceeecd75e40cdd5830659d04' && w12.parts.seaAreas[0].text === 'N to NW 7 later.',
  JSON.stringify(r1));
const r2 = await pollTexts({ storeDir: tStore, nowMs: tNow + 60_000, fetchImpl: dwdText(), killed: false });
add('C2 zweiter Durchlauf: nichts Neues (nichts doppelt)', r2.added === 0 && r2.rejected === 0, JSON.stringify(r2));
const broken = Buffer.from(readFileSync(join(TXT, 'FQEN50_EDZW_070800')).toString('latin1').replace(/=\r\r\n[\s\S]*$/, ''), 'latin1');
const r3 = await pollTexts({ storeDir: tStore, nowMs: tNow, fetchImpl: dwdText({ FQEN50_EDZW_071100: broken }), killed: false });
const r4 = await pollTexts({ storeDir: tStore, nowMs: tNow, fetchImpl: dwdText({ FQEN50_EDZW_071100: broken }), killed: false });
add('C3 abgeschnittenes Bulletin ⇒ Quarantäne mit Regel, einmal (nicht in jedem Durchlauf), kein Text', r3.rejected === 1 && r4.rejected === 0 && existsSync(join(tStore, seaQuarantinePath('text-FQEN50_EDZW_071100'))) && !existsSync(join(tStore, seaTextPath('FQDL50', '2610071100'))),
  JSON.stringify({ r3, r4 }));
const r5 = await pollTexts({ storeDir: tStore, nowMs: T('2026-10-09T13:00:00Z'), fetchImpl: dwdText(), killed: false });
add('C4 Texte älter als 48 h werden aufgeräumt, je Produkt bleiben mindestens 2', readdirSync(join(tStore, 'text', 'WODL45')).length === 2 && r5.added === 0, `${readdirSync(join(tStore, 'text', 'WODL45')).join(',')} · entfernt ${r5.removed}`);

// --- B: publisher against a local bare repo ---------------------------------------------------------------------
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const bare = join(tmp, 'remote.git');
execFileSync('git', ['init', '--bare', '-q', '-b', 'main', bare]);
const seed = join(tmp, 'seed');
execFileSync('git', ['init', '-q', '-b', 'main', seed]);
mkdirSync(join(seed, 'radar'), { recursive: true }); mkdirSync(join(seed, 'point'), { recursive: true });
writeFileSync(join(seed, 'radar', 'a.txt'), 'radar 1\n'); writeFileSync(join(seed, 'point', 'b.txt'), 'point 1\n'); writeFileSync(join(seed, 'README.md'), 'readme\n');
git(seed, 'add', '-A'); git(seed, 'commit', '-qm', 'seed'); git(seed, 'remote', 'add', 'origin', bare); git(seed, 'push', '-q', 'origin', 'main');
const clone = join(tmp, 'clone');
execFileSync('git', ['clone', '-q', '--depth=1', '--no-checkout', `file://${bare.replace(/\\/g, '/')}`, clone]);
git(clone, 'sparse-checkout', 'set', 'sea'); git(clone, 'checkout', '-q', 'main');
git(clone, 'config', 'user.name', 't'); git(clone, 'config', 'user.email', 't@t');
const pubStore = join(tmp, 'pubstore');
cpSync(store, pubStore, { recursive: true });
const tree = (rev = 'main') => execFileSync('git', ['--git-dir', bare, 'ls-tree', '-r', '--name-only', rev], { encoding: 'utf8' }).trim().split('\n');
const p1 = publishSea({ repoDir: clone, storeDir: pubStore, message: 'sea: test 1', sleepMs: () => 10 });
const t1 = tree();
add('B1 erster Push: sea/v1 vollständig auf main, radar/point/README unverändert', p1.pushed && t1.includes('sea/v1/status.json') && t1.includes(`sea/v1/${seaRunJsonPath('cwam', RUN)}`) && t1.includes('radar/a.txt') && t1.includes('point/b.txt') && t1.includes('README.md'),
  `${t1.filter((f) => f.startsWith('sea/')).length} sea-Dateien · ${JSON.stringify({ pushed: p1.pushed, attempts: p1.attempts })}`);
const changed = execFileSync('git', ['--git-dir', bare, 'diff', '--name-only', 'main~1', 'main'], { encoding: 'utf8' }).trim().split('\n');
add('B2 der Commit berührt nur sea/', changed.every((f) => f.startsWith('sea/')), `${changed.length} Pfade`);
// A foreign push in between (the radar mirror) — the publisher builds on the new head.
git(seed, 'pull', '-q', '--rebase', 'origin', 'main'); writeFileSync(join(seed, 'radar', 'a.txt'), 'radar 2\n'); git(seed, 'commit', '-qam', 'radar 2'); git(seed, 'push', '-q', 'origin', 'main');
writeFileSync(join(pubStore, 'status.json'), JSON.stringify({ product: 'sea-status', n: 2 }));
const p2 = publishSea({ repoDir: clone, storeDir: pubStore, message: 'sea: test 2', sleepMs: () => 10 });
const radar2 = execFileSync('git', ['--git-dir', bare, 'show', 'main:radar/a.txt'], { encoding: 'utf8' });
add('B3 fremder Push dazwischen: kein Konflikt, Radar-Stand bleibt („radar 2“), sea aktualisiert', p2.pushed && radar2 === 'radar 2\n' && execFileSync('git', ['--git-dir', bare, 'show', 'main:sea/v1/status.json'], { encoding: 'utf8' }).includes('"n":2'), JSON.stringify({ attempts: p2.attempts }));
// Force-push of a fresh history without sea/ (map line) — the next publish heals.
const fresh = join(tmp, 'fresh');
execFileSync('git', ['init', '-q', '-b', 'main', fresh]);
mkdirSync(join(fresh, 'radar'), { recursive: true }); mkdirSync(join(fresh, 'runs'), { recursive: true });
writeFileSync(join(fresh, 'radar', 'a.txt'), 'radar 3\n'); writeFileSync(join(fresh, 'runs', 'x.txt'), 'runs\n');
git(fresh, 'add', '-A'); git(fresh, 'commit', '-qm', 'fresh'); git(fresh, 'push', '-q', '--force', bare, 'main');
const p3 = publishSea({ repoDir: clone, storeDir: pubStore, message: 'sea: heal', sleepMs: () => 10 });
const t3 = tree();
add('B4 Force-Push einer frischen Historie ohne sea/: nächster Lauf heilt (ganzer Bestand), runs/radar der neuen Historie bleiben', p3.pushed && t3.includes(`sea/v1/${seaSpotsPath(RUN)}`) && t3.includes('runs/x.txt') && execFileSync('git', ['--git-dir', bare, 'show', 'main:radar/a.txt'], { encoding: 'utf8' }) === 'radar 3\n',
  `${t3.filter((f) => f.startsWith('sea/')).length} sea-Dateien`);
const p4 = publishSea({ repoDir: clone, storeDir: pubStore, message: 'sea: same', sleepMs: () => 10 });
add('B5 nichts geändert ⇒ kein Commit', !p4.pushed && p4.unchanged, JSON.stringify(p4));
{
  const st = JSON.parse(readFileSync(join(pubStore, 'status.json'), 'utf8'));
  writeFileSync(join(pubStore, 'status.json'), JSON.stringify({ ...st, updatedAt: '2026-10-07T13:00:00.000Z', job: 'x', textPass: { at: 'later' } }));
  const p5 = publishSea({ repoDir: clone, storeDir: pubStore, message: 'sea: ticks only', sleepMs: () => 10 });
  writeFileSync(join(pubStore, 'status.json'), JSON.stringify({ ...st, killSwitch: true }));
  const p6 = publishSea({ repoDir: clone, storeDir: pubStore, message: 'sea: kill', sleepMs: () => 10 });
  add('B7 nur Zeitstempel im Status (updatedAt, job, textPass) ⇒ kein Commit; eine echte Statusänderung (Kill-Schalter) ⇒ Commit',
    !p5.pushed && p5.statusOnly && p6.pushed, JSON.stringify({ p5, p6: p6.pushed }));
}
const src = readFileSync(join(HERE, 'sea', 'sea-publish.mjs'), 'utf8');
add('B6 Publisher ohne Force und ohne Rebase (frische Basis je Versuch)', !/['"]--force['"]|push\s+-f\b|'-f'/.test(src) && !/rebase/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')) && src.includes("'checkout', '--quiet', '-B'"), 'ok');

// --- W: workflow templates -----------------------------------------------------------------------------------
const wf = readFileSync(join(HERE, 'sea', 'workflow-sea.yml'), 'utf8');
const wfa = readFileSync(join(HERE, 'sea', 'workflow-sea-archiv.yml'), 'utf8');
add('W1 sea.yml: Leerlauf „producer not on main yet“ mit Exit 0, alle 15 min, sparse sea, Veröffentlichung über sea-publish, nie --force',
  /producer not on main yet/.test(wf) && /exit 0/.test(wf) && /cron: '4,19,34,49 \* \* \* \*'/.test(wf) && /sparse-checkout: sea\b/.test(wf) && /sea-publish\.mjs/.test(wf) && !/push[^\n]*--force|push -f/.test(wf) && /REPACK_BZIP2: '1'/.test(wf),
  'ok');
add('W2 sea-archiv.yml: Leerlauf mit Exit 0, schreibt nur sea/, append-only, nie --force', /producer not on main yet/.test(wfa) && /git add -A -- sea/.test(wfa) && !/push[^\n]*--force|push -f/.test(wfa) && /sparse-checkout: sea\b/.test(wfa), 'ok');
add('W3 Paketliste des Workflows = Laufzeit-Pakete des Producers (bz2, jsfive)', /npm install --no-save --no-audit --no-fund bz2@1 jsfive@0\.4/.test(wf), '');

// --- R: archive ---------------------------------------------------------------------------------------------
const arch = join(tmp, 'archiv', 'sea', 'v1');
const poiCsv = readFileSync(join(FIX, 'poi-10091.csv'), 'utf8');
const poiFetch = async () => new Response(poiCsv);
const ar1 = await archiveSea({ storeDir: store, archiveDir: arch, nowMs, fetchImpl: poiFetch });
const ar2 = await archiveSea({ storeDir: store, archiveDir: arch, nowMs, fetchImpl: poiFetch });
const day = readdirSync(arch).filter((d) => /^\d{4}-/.test(d)).sort();
const poiDoc = JSON.parse(gunzipSync(readFileSync(join(arch, day[day.length - 1], 'poi.json.gz'))).toString('utf8'));
add('R1 Archiv: Spot-Reihen je Lauf, POI je Station, Index; zweiter Lauf ohne Doppel', ar1.spotsAdded >= 1 && ar2.spotsAdded === 0 && ar2.poiRows === 0 && existsSync(join(arch, '2026-10-07', `spots-${RUN}.json.gz`)) && Object.keys(poiDoc.stations).length >= 1,
  JSON.stringify({ ar1, ar2 }));
const pr = parsePoi(poiCsv);
add('R2 POI-Leser: km/h → m/s, „---“ → null, Zeit UTC', pr.length >= 20 && pr.every((r) => r.ff == null || (r.ff >= 0 && r.ff < 60)) && /Z$/.test(pr[0].t), `${pr.length} Zeilen, erste ${JSON.stringify(pr[0])}`);

// --- P: SW-6 rules on the real spot series ---------------------------------------------------------------------
const real = JSON.parse(readFileSync(join(FIX, 'spots-2026100700.json'), 'utf8'));
const ser = real.spots['st-peter-ording'].v;
const hours = SEA_SPOT_STEPS.map((h) => ({ t: real.runMs + h * 3_600_000, windMs: decodeSpotValue('wind', ser.wind[h]), gustMs: decodeSpotValue('gust', ser.gust[h]), windDir: decodeSpotValue('windDir', ser.windDir[h]), hs: decodeSpotValue('hs', ser.hs[h]), ws: decodeSpotValue('ws', ser.ws[h]), wsPer: decodeSpotValue('wsPer', ser.wsPer[h]) }));
const vK = hours.map((h) => classify(h, SEA_PROFILE_BY_ID.kite.limits, 235, 54.3, 8.6));
const counts = vK.reduce((m, v) => ((m[v.cls] = (m[v.cls] ?? 0) + 1), m), {});
add('P1 echte Reihe St. Peter-Ording (Lauf 07.10. 00 UTC, Wind buscosun Fusion 9), Profil Kite: jede Stunde hat eine Klasse und einen Grund; Stunden ohne Wind (vor der Rechnung) nie passt/knapp',
  vK.every((v) => v.reasons.length > 0) && hours.every((h, i) => h.windMs != null || (vK[i].cls !== 'passt' && vK[i].cls !== 'knapp')) && (counts.ausserhalb ?? 0) > 0, JSON.stringify(counts));
const ws = windows(vK, hours.map((h) => h.t));
add('P2 Fenster: nur Folgen ≥ 2 h aus passt/knapp, nie über eine Lücke', ws.every((w) => w.hours >= 2 && w.to - w.from === w.hours * 3_600_000), JSON.stringify(ws.slice(0, 3).map((w) => [new Date(w.from).toISOString().slice(5, 13), w.hours, w.tight])));
const base = { t: T('2026-10-08T10:00:00Z'), windMs: 20 / 1.943844, gustMs: 25 / 1.943844, windDir: 270, hs: 1, ws: 0.8, wsPer: 4 };
const k = SEA_PROFILE_BY_ID.kite.limits;
const c1 = classify(base, k, 270, 54.3, 8.6), c2 = classify({ ...base, windMs: 15.5 / 1.943844 }, k, 270, 54.3, 8.6), c3 = classify({ ...base, gustMs: 34 / 1.943844 }, k, 270, 54.3, 8.6);
const c4 = classify({ ...base, windDir: 90 }, k, 270, 54.3, 8.6), c5 = classify({ ...base, windDir: 135 }, k, 270, 54.3, 8.6), c6 = classify({ ...base, t: T('2026-10-08T22:00:00Z') }, k, 270, 54.3, 8.6);
const c7 = classify({ ...base, windDir: null }, k, 270, 54.3, 8.6), c8 = classify({ ...base, windMs: null, gustMs: null }, SEA_PROFILE_BY_ID.yacht.limits, 270, 54.3, 8.6);
add('P3 Kite: 20/25 kn auflandig, Tag ⇒ passt; 15,5 kn ⇒ knapp (10 % an 15); Böe 34 ⇒ außerhalb „Böen über 33 kn“', c1.cls === 'passt' && c2.cls === 'knapp' && c3.cls === 'ausserhalb' && c3.reasons[0] === 'Böen über 33 kn', `${c1.cls}/${c2.cls}/${c3.cls}: ${c3.reasons[0]}`);
add('P4 Kite ablandig und schräg ablandig ⇒ außerhalb; Nacht ⇒ außerhalb „Dunkelheit“; fehlende Richtung ⇒ keine Daten', c4.cls === 'ausserhalb' && c4.reasons.includes('Wind ablandig') && c5.cls === 'ausserhalb' && c5.reasons.includes('Wind schräg ablandig') && c6.reasons.includes('Dunkelheit') && c7.cls === 'keine',
  `${c4.reasons} · ${c5.reasons} · ${c6.reasons} · ${c7.reasons}`);
add('P5 Yacht ohne Wind ⇒ „keine Daten“, nie „passt“ (keine Daten ≠ ruhige See)', c8.cls === 'keine' && c8.reasons.includes('Wind fehlt'), c8.reasons.join());
const y = SEA_PROFILE_BY_ID.yacht.limits;
const y1 = classify({ ...base, windMs: 15 / 1.943844, gustMs: 20 / 1.943844, hs: 1.5, wsPer: 3.0 }, y, 270, 54.3, 8.6);
add('P6 Yacht: Welle 1,5 m mit Windsee-Periode 3,0 s ⇒ außerhalb „kurze steile See“', y1.cls === 'ausserhalb' && /kurze steile See/.test(y1.reasons[0]), y1.reasons[0]);
add('P7 Uferwinkel: 0° auflandig, 50° schräg auflandig, 90° sideshore, 130° schräg ablandig, 180° ablandig (Normale 0°)',
  [0, 50, 90, 130, 180].map((d) => shoreAngle(d, 0)).join() === 'auflandig,schraeg-auflandig,sideshore,schraeg-ablandig,ablandig' && shoreAngle(350, 10) === 'auflandig', '');
add('P8 Einheiten: 10 m/s = 19 kn = Bft 5 = 36 km/h; Bft 6 = 22–27 kn, 7 = 28–33', fmtWind(10, 'kn') === '19' && fmtWind(10, 'bft') === '5' && fmtWind(10, 'kmh') === '36' && knToBft(22) === 6 && knToBft(27) === 6 && knToBft(28) === 7 && knToBft(33) === 7 && knToBft(34) === 8, '');
const mem = new Map();
const stor = { getItem: (key) => mem.get(key) ?? null, setItem: (key, v) => mem.set(key, v) };
saveLimits('kite', { ...k, gustMax: 30 }, stor);
add('P9 Grenzen lokal änderbar (je Profil), kaputter Speicher ⇒ Startwerte', loadLimits('kite', stor).gustMax === 30 && loadLimits('sup', stor).gustMax === 14 && loadLimits('kite', { getItem: () => '{kaputt' }).gustMax === 33, '');
const nl = nextAndLongest([{ from: 1, to: 5, hours: 4, tight: false }, { from: 10, to: 20, hours: 10, tight: true }], 6);
add('P10 nächstes und längstes Fenster ab jetzt', nl.next?.from === 10 && nl.longest?.hours === 10, JSON.stringify(nl));

// --- V: V-SW-10 verdict cache = uncached reference (real catalogue, real run 2026100700, all profiles) ----------
{
  const { isDeepStrictEqual } = await import('node:util');
  const { SeaVerdictCache, verdictRow, verdictOf } = await import('../src/sea/seaVerdicts.ts');
  const { SEA_PROFILES } = await import('../src/sea/seaProfiles.ts');
  const cat = JSON.parse(readFileSync(join(FIX, 'static', 'spots.json'), 'utf8')).spots;
  const series = Object.fromEntries(Object.entries(real.spots).map(([id, s]) => [id, Object.fromEntries(Object.entries(s.v).map(([k2, q]) => [k2, q.map((x) => decodeSpotValue(k2, x))]))]));
  const firstIdx = 9, nHours = 79 - firstIdx, nowHour = real.runMs + firstIdx * 3_600_000;
  let equalRows = 0, equalWins = 0, rows = 0;
  for (const p of SEA_PROFILES) {
    const inp = { series, limits: p.limits, firstIdx, nowHour, nHours };
    const cache = new SeaVerdictCache(inp);
    for (const sp of cat) {
      rows++;
      const ref = verdictRow(inp, sp);
      if (isDeepStrictEqual(cache.row(sp), ref)) equalRows++;
      if (isDeepStrictEqual(cache.windows(sp), windows(ref, ref.map((_, kk) => nowHour + kk * 3_600_000)))) equalWins++;
    }
  }
  add(`V1 Klassen-Cache = ungecachte Referenz: ${SEA_PROFILES.length} Profile × ${cat.length} Spots × ${nHours} Stunden, Zeilen und Fenster tief gleich`,
    equalRows === rows && equalWins === rows && rows === SEA_PROFILES.length * cat.length, `${equalRows}/${rows} Zeilen, ${equalWins}/${rows} Fenster`);
  const inpK = { series, limits: SEA_PROFILE_BY_ID.kite.limits, firstIdx, nowHour, nHours };
  const ck = new SeaVerdictCache(inpK);
  for (let kk = 0; kk < nHours; kk += 7) for (const sp of cat) ck.at(sp, kk);
  add('V2 Stundenwechsel rechnet nichts neu: 10 Stunden × 56 Spots ⇒ 56 Zeilen je einmal gerechnet', ck.computed === cat.length, `computed ${ck.computed}`);
  const empty = new SeaVerdictCache({ series: null, limits: inpK.limits, firstIdx: 0, nowHour, nHours: 0 });
  add('V3 ohne Daten (nHours 0): at() = Referenz an der Stunde, Klasse „keine“ bzw. ohne Werte', isDeepStrictEqual(empty.at(cat[0], 3), verdictOf({ ...empty.inputs }, cat[0], 3)) && empty.computed === 0, empty.at(cat[0], 3).cls);
  // Negative controls: the comparison must see a different limit or a shifted hour axis.
  const negL = verdictRow({ ...inpK, limits: { ...inpK.limits, gustMax: inpK.limits.gustMax - 8 } }, cat.find((s) => s.id === 'st-peter-ording'));
  const negT = verdictRow({ ...inpK, nowHour: nowHour + 3_600_000 }, cat.find((s) => s.id === 'st-peter-ording'));
  const ckRow = ck.row(cat.find((s) => s.id === 'st-peter-ording'));
  add('V4 Gegenprobe: andere Böengrenze (−8 kn) oder um 1 h verschobene Achse ⇒ NICHT tief gleich', !isDeepStrictEqual(ckRow, negL) && !isDeepStrictEqual(ckRow, negT), '');
}

// --- N: V-SW-9 shore normal rules (scripts/sea/shoreNormal.mjs) ------------------------------------------------------
{
  const { maskCoastNormal, maskVectorNormal, angleDiff } = await import('./sea/shoreNormal.mjs');
  const g = SEA_MODELS.cwam.grid, R = Math.PI / 180, lat0 = 54.3, lon0 = 11.0, kx = 111.32 * Math.cos(lat0 * R), ky = 110.574;
  const straight = (a, flip = false) => (i, j) => {
    const x = (g.lon1 + i * g.di - lon0) * kx, y = (g.lat1 - j * g.dj - lat0) * ky;
    return ((x * Math.sin(a * R) + y * Math.cos(a * R)) > 0.3) !== flip;
  };
  let w05 = 0, w11 = 0, flipMin = 180;
  for (let a = 0; a < 360; a += 7) {
    w05 = Math.max(w05, angleDiff(maskCoastNormal(straight(a), g, lat0, lon0, { bandKm: 0.5 }).normal, a));
    w11 = Math.max(w11, angleDiff(maskCoastNormal(straight(a), g, lat0, lon0, { bandKm: 1, smooth: 1 }).normal, a));
    flipMin = Math.min(flipMin, angleDiff(maskCoastNormal(straight(a, true), g, lat0, lon0, { bandKm: 0.5 }).normal, a));
  }
  add('N1 Küstenregel an geraden Küsten (52 Winkel, CWAM-Gitter): roh/Band 0,5 km ≤ 20° (Treppe der 0,93-km-Zellen), Glättung 1/Band 1 km ≤ 10°',
    w05 <= 20 && w11 <= 10, `größte Abweichung ${w05}° bzw. ${w11}°`);
  add('N2 Gegenprobe: vertauschte Maske ⇒ Normale zeigt landwärts (≥ 160° daneben)', flipMin >= 160, `kleinste Abweichung ${flipMin}°`);
  const swh10 = decodeGrib2(new Uint8Array(await decompressBz2(readFileSync(join(FIX, 'cwam-2026100700', 'CWAM_SWH_2026100700_010.grib2.bz2'))))).values;
  const wet = (i, j) => i >= 0 && j >= 0 && i < g.ni && j < g.nj && !Number.isNaN(swh10[j * g.ni + i]);
  const catN = JSON.parse(readFileSync(join(FIX, 'static', 'spots.json'), 'utf8')).spots;
  const same = catN.filter((s) => maskVectorNormal(wet, g, s.lat, s.lon) === (s.normalFrom === 'set' ? s.normalMask : s.normal)).length;
  add('N3 Katalogregel nach dem Umzug in shoreNormal.mjs: alle 56 Masken-Normalen gleich dem Katalog (bei „set“ normalMask)', same === catN.length, `${same}/${catN.length}`);
}

// --- W: V-SW-2 wind refresh on a newer t1 cube (on the store of block A: run 2026100700, wind with t1 2026100703) ---
{
  const { windDue, windRefresh } = await import('./sea/sea-derive.mjs');
  const { seaSpotsWindPath, mergeSpotWind, SEA_SPOT_VARS, SEA_RETENTION } = await import('../src/sea/seaContract.ts');
  const { mergeWindDoc, windPointerOf, withWindRefresh } = await import('../src/sea/seaClient.ts');
  const windT1 = (t1, at, base) => async ({ spots }) => ({
    series: Object.fromEntries(spots.map((s) => [s.id, {
      wind: SEA_SPOT_STEPS.map((h) => base + h), gust: SEA_SPOT_STEPS.map((h) => base + 40 + h), windDir: SEA_SPOT_STEPS.map((h) => (h * 11) % 360),
    }])),
    failed: [], meta: { engine: 'buscosun Fusion 9', version: 9, computedAt: new Date(at).toISOString(), runs: { t1 } },
  });
  const d0 = windDue(store, '2026100703'), d1 = windDue(store, '2026100706'), dN = windDue(store, null);
  add('W1 Wind fällig nur bei neuerem t1: gleicher t1 wie der Lauf ⇒ nein, neuerer ⇒ ja, Index ohne t1 ⇒ nein',
    d0.due === false && d1.due === true && d1.run === RUN && d1.usedT1 === '2026100703' && dN.due === false, JSON.stringify({ d0: d0.reason, d1, dN: dN.reason }));
  const at1 = T('2026-10-07T09:20:00Z');
  const r1 = await windRefresh({ storeDir: store, dataDir: 'cdn', nowMs: at1, indexT1: '2026100706', windImpl: windT1('2026100706', at1, 50) });
  const p1 = seaSpotsWindPath(RUN, '2026100706');
  const st1 = JSON.parse(readFileSync(join(store, SEA_STATUS_PATH), 'utf8'));
  const w1 = existsSync(join(store, p1)) ? JSON.parse(readFileSync(join(store, p1), 'utf8')) : null;
  add('W2 Auffrischung geschrieben: spots/<lauf>-w<t1>.json ab Stunde 9 (Rechenstunde 09 UTC), Zeiger status.wind, Feld-Status unverändert, Lauf-Datei unverändert',
    r1.built && w1?.product === 'sea-spots-wind' && w1.from === 9 && w1.t1 === '2026100706' && Object.keys(w1.spots).length === 2
    && st1.wind?.path === p1 && st1.wind.run === RUN && st1.wind.t1 === '2026100706' && st1.field.lastPublishedRun === RUN
    && JSON.parse(readFileSync(join(store, seaSpotsPath(RUN)), 'utf8')).wind.runs.t1 === '2026100703',
    JSON.stringify({ built: r1.built, from: w1?.from, ptr: st1.wind?.path }));
  const r1b = await windRefresh({ storeDir: store, dataDir: 'cdn', nowMs: at1 + 15 * 60_000, indexT1: '2026100706', windImpl: windT1('2026100706', at1, 50) });
  const rStale = await windRefresh({ storeDir: store, dataDir: 'cdn', nowMs: at1, indexT1: '2026100709', windImpl: windT1('2026100706', at1, 50) });
  add('W3 Gegenproben: derselbe t1 ein zweites Mal ⇒ nicht fällig; Index nennt neueren t1, die Rechnung trägt aber den alten ⇒ nichts geschrieben',
    r1b.built === false && /schon mit t1 2026100706/.test(r1b.reason) && rStale.built === false && readdirSync(join(store, 'spots')).filter((f) => f.includes('-w')).length === 1,
    `${r1b.reason} · ${rStale.reason}`);
  const at2 = T('2026-10-07T12:20:00Z');
  const r2 = await windRefresh({ storeDir: store, dataDir: 'cdn', nowMs: at2, indexT1: '2026100709', windImpl: windT1('2026100709', at2, 60) });
  const left = readdirSync(join(store, 'spots')).filter((f) => f.includes('-w')).sort();
  add('W4 nächster t1 ⇒ neue Datei ab Stunde 12, Zeiger folgt; die vorige Auffrischung des Laufs BLEIBT (V-SW-15: das Archiv sieht jede)',
    r2.built && r2.from === 12 && left.join() === `${RUN}-w2026100706.json,${RUN}-w2026100709.json` && JSON.parse(readFileSync(join(store, SEA_STATUS_PATH), 'utf8')).wind.t1 === '2026100709', left.join());
  // Client: the decoded run doc + the refresh ⇒ hours < from keep the run's wind, from on the refresh's (all three columns).
  const baseJ = JSON.parse(readFileSync(join(store, seaSpotsPath(RUN)), 'utf8'));
  const decoded = { run: RUN, runMs: baseJ.runMs, steps: baseJ.steps, wind: baseJ.wind, gustDropped: {}, rejected: [],
    series: Object.fromEntries(Object.entries(baseJ.spots).map(([id, s]) => [id, Object.fromEntries(SEA_SPOT_VARS.map((k) => [k, s.v[k].map((q) => decodeSpotValue(k, q))]))])) };
  const w2 = JSON.parse(readFileSync(join(store, 'spots', `${RUN}-w2026100709.json`), 'utf8'));
  const merged = mergeWindDoc(decoded, { from: w2.from, wind: w2.wind, spots: w2.spots });
  const s0 = decoded.series['st-peter-ording'], s1 = merged.series['st-peter-ording'];
  add('W5 Seite: vor Stunde 12 Wind/Böe/Richtung des Laufs, ab 12 die der Auffrischung; Wellen unverändert; Metadaten nennen den neuen t1 und windFrom 12',
    s1.wind[11] === s0.wind[11] && s1.gust[11] === s0.gust[11] && s1.wind[12] === (60 + 12) / 10 && s1.gust[12] === (100 + 12) / 10 && s1.windDir[12] === (12 * 11) % 360
    && s1.hs.every((x, i) => x === s0.hs[i]) && merged.windFrom === 12 && merged.wind.runs.t1 === '2026100709' && decoded.series['st-peter-ording'].wind[12] === s0.wind[12],
    `h11 ${s1.wind[11]}/${s0.wind[11]} · h12 ${s1.wind[12]}`);
  const enc = { wind: [1, 2, 3], gust: [4, 5, 6], windDir: [7, 8, 9] }, upd = { wind: [10, 20, null], gust: [40, 50, 60], windDir: [70, 80, 90] };
  const m = mergeSpotWind(enc, upd, 1);
  add('W6 mergeSpotWind: ab `from` alle drei Spalten aus der Auffrischung, auch ihre null; davor unverändert; Eingaben unverändert',
    JSON.stringify(m) === JSON.stringify({ wind: [1, 20, null], gust: [4, 50, 60], windDir: [7, 80, 90] }) && enc.wind[1] === 2);
  const ptr = windPointerOf({ wind: { run: RUN, t1: '2026100709', path: `spots/${RUN}-w2026100709.json` } });
  const same = await withWindRefresh(decoded, { run: '2026100612', t1: '2026100709', path: 'spots/2026100612-w2026100709.json' });
  add('W7 Zeiger: gültig nur mit passendem Pfad (sonst keiner); Zeiger eines anderen Laufs ⇒ Reihen unverändert (kein Abruf)',
    ptr?.t1 === '2026100709' && windPointerOf({ wind: { run: RUN, t1: '2026100709', path: 'spots/x.json' } }) === null && windPointerOf(null) === null && same === decoded);
  // V-SW-15: the archive (one pass) takes every refresh of the store; the cap keeps the newest 8 per run; refreshes of a
  // run that is no longer kept go with it.
  const archW = join(tmp, 'archiv-w');
  const aw = await archiveSea({ storeDir: store, archiveDir: archW, nowMs: at2, fetchImpl: poiFetch });
  const awIdx = JSON.parse(readFileSync(join(archW, 'index.json'), 'utf8'));
  const awKeys = Object.values(awIdx.days).flatMap((d) => d.wind ?? []).sort();
  const sd = join(store, 'spots');
  const one = readFileSync(join(sd, `${RUN}-w2026100709.json`));
  const extraT1 = ['2026100712', '2026100715', '2026100718', '2026100721', '2026100800', '2026100803', '2026100806', '2026100809'];
  for (const t of extraT1) writeFileSync(join(sd, `${RUN}-w${t}.json`), one);
  writeFileSync(join(sd, '2026100512-w2026100515.json'), one);   // refresh of a run that is not kept
  const pr = pruneRuns(store);
  const after = readdirSync(sd).filter((f) => f.includes('-w')).sort();
  add('W8 V-SW-15: ein Archivdurchlauf nimmt BEIDE Auffrischungen des Laufs; Obergrenze 8 je Lauf (die ältesten gehen), Auffrischung eines nicht behaltenen Laufs geht mit',
    awKeys.join() === `${RUN}-w2026100706,${RUN}-w2026100709` && aw.spotsAdded >= 2 && SEA_RETENTION.windPerRunKept === 8
    && after.length === 8 && after[0] === `${RUN}-w2026100712.json` && after[7] === `${RUN}-w2026100809.json` && !after.includes('2026100512-w2026100515.json')
    && pr.includes(`spots/${RUN}-w2026100706.json`) && pr.includes(`spots/${RUN}-w2026100709.json`),
    `Archiv ${awKeys.join(' ')} · Speicher ${after.length}: ${after[0]} … ${after[after.length - 1]}`);
}

rmSync(tmp, { recursive: true, force: true });
const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`\nverify:sea-derive — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
