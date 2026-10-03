/**
 * verify:road-derive — Phase AW (audit/autobahnwetter.md §4): the road product of the radar mirror end to end
 * against a LOCAL bare repo, offline: the real `scripts/road/road-mirror.mjs` (hooks) spawns the real
 * `road-derive.mjs` per slot; the DWD is a stand-in `fetch` serving the frozen slot of all series.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-road-derive.mjs
 *
 * The publish step is the mirror's `publish()` sequence (fetch → checkout -B origin/main → copyInto → add radar road
 * → commit → push), copied here line for line; A0 checks that `radar-mirror.mjs` still carries exactly these hooks.
 *
 *   A  hooks in radar-mirror.mjs · B  first slots: atomic write, files, status, catalogue
 *   C  slot lock (too few series) · D  healing after a simulated force-push · E  retention by age
 *   F  derive failure keeps the store · G  offline-built corridors survive the mirror's publish
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoadMirror } from './road/road-mirror.mjs';
import { ROAD_GROUPS, roadBulletinUrl, roadStamp, parseRoadObs, parseRoadH24 } from '../src/road/roadContract.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');
const FIX = join(HERE, 'lib', 'fixtures', 'road', 'swis-2610030800');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

// --- A: the hooks in the mirror script ------------------------------------------------------------
{
  const src = readFileSync(join(HERE, 'radar-mirror', 'radar-mirror.mjs'), 'utf8');
  add('A0 radar-mirror.mjs trägt die drei Haken (seed, poll + publish, copyInto) und schützt den Radar-Push',
    src.includes("join(APP_DIR, 'scripts', 'road', 'road-mirror.mjs')") && src.includes('road.seed(ROOT)') && src.includes('await road.poll()')
    && src.includes('road?.copyInto(ROOT)') && src.includes("const paths = roadOn ? ['radar', 'road'] : ['radar'];")
    && /catch \(e\) \{ log\(`road: \$\{String\(e\.message \?\? e\)/.test(src) && src.includes("process.env.ROAD !== '0'"));
}

// --- setup: bare repo, clone, stand-in DWD --------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'road-derive-'));
const bare = join(tmp, 'remote.git');
const clone = join(tmp, 'clone');
const other = join(tmp, 'other');
const mirror = join(tmp, 'mirror-store');
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', bare]);
execFileSync('git', ['clone', '--quiet', bare, clone], { stdio: 'ignore' });
for (const d of [clone]) { git(d, ['config', 'user.name', 'verify']); git(d, ['config', 'user.email', 'verify@local']); git(d, ['config', 'core.autocrlf', 'false']); }
mkdirSync(join(clone, 'radar'), { recursive: true });
writeFileSync(join(clone, 'radar', 'status.json'), '{}\n');
mkdirSync(join(clone, 'road', 'v1', 'static'), { recursive: true });
writeFileSync(join(clone, 'road', 'v1', 'static', 'corridors.json'), JSON.stringify({ schema: 1, product: 'road-corridors', corridors: [] }) + '\n');
git(clone, ['add', '-A']);
git(clone, ['commit', '--quiet', '-m', 'seed']);
git(clone, ['push', '--quiet', 'origin', 'HEAD:main']);

// The frozen bulletins carry obs time 08:00 UTC — so the test only uses slots 08:00 … 11:00 (the `time` rule allows
// ≤ 3 h of age and no future). SD-BW is sporadic and off the slot raster in reality: not served.
const fixture = new Map(readdirSync(FIX).filter((f) => f.endsWith('.bin') && !f.startsWith('SD')).map((f) => [f.replace('.bin', ''), readFileSync(join(FIX, f))]));
let clock = Date.UTC(2026, 9, 3, 8, 4, 30);       // 4.5 min after the 08:00 slot
let missingGroups = new Set();
const served = [];
const fakeFetch = async (url, init = {}) => {
  served.push(`${init.method ?? 'GET'} ${url}`);
  for (const g of ROAD_GROUPS) {
    for (let s = Math.floor(clock / 900_000) * 900_000; s > clock - 48 * 3_600_000; s -= 900_000) {
      if (roadBulletinUrl(g, s) !== url) continue;
      if (missingGroups.has(g.id) || !fixture.has(g.id)) return new Response('', { status: 404 });
      const body = fixture.get(g.id);
      return new Response(init.method === 'HEAD' ? null : body, { status: 200, headers: { 'last-modified': new Date(s + 60_000).toUTCString() } });
    }
  }
  return new Response('', { status: 404 });
};

// Same steps as radar-mirror.mjs publish() (radar/ unchanged here: the test has no radar store).
function publish(road, msg) {
  git(clone, ['fetch', '--quiet', '--depth=1', 'origin', 'main']);
  git(clone, ['checkout', '--quiet', '-B', 'main', 'origin/main']);
  const roadOn = !!road.copyInto(clone);
  const paths = roadOn ? ['radar', 'road'] : ['radar'];
  git(clone, ['add', '-A', ...paths]);
  if (!git(clone, ['status', '--porcelain', ...paths])) return { noop: true };
  git(clone, ['commit', '--quiet', '-m', msg]);
  git(clone, ['push', '--quiet', 'origin', 'HEAD:main']);
  return { noop: false };
}
const remoteFiles = (prefix) => git(clone, ['ls-tree', '-r', '--name-only', 'origin/main']).split('\n').filter((f) => f.startsWith(prefix));
const show = (path) => JSON.parse(git(clone, ['show', `origin/main:${path}`]));
const logs = [];
const catalogXlsx = join(tmp, 'sws.xlsx');
// No network for the catalogue: the stand-in is the fixture slot's own stations, built through the real builder.
writeFileSync(catalogXlsx, '');

async function pollUntilIdle(road, max = 40) {
  const msgs = [];
  for (let i = 0; i < max; i++) {
    const m = await road.poll();
    if (m) msgs.push(m);
    if (!m && road.pendingSlot && road.pendingSlot > roadStamp(Math.floor(clock / 900_000) * 900_000)) break;
    if (!m && i > 2) break;
  }
  return msgs;
}

// --- B: first slots -------------------------------------------------------------------------------
const road = createRoadMirror({
  appDir: APP, mirrorDir: mirror, log: (s) => logs.push(s), now: () => clock, fetchImpl: fakeFetch,
  maxCatchUpSlots: 0, publishEvery: 1, catalogFile: join(HERE, '..', 'scripts', 'lib', 'fixtures', 'road', 'missing.xlsx'),
});
git(clone, ['fetch', '--quiet', 'origin', 'main']);
road.seed(clone);
add('B0 Hook aktiv: Plan aus dem Vertrag geladen, ohne Zustand Start beim laufenden Slot (Nachholen 0)', road.enabled && road.pendingSlot === '2610030800', `${road.pendingSlot} · ${logs[0] ?? ''}`);
let msgs = await pollUntilIdle(road);
for (const m of msgs) publish(road, m);
const obs = remoteFiles('road/v1/obs/');
add('B1 Slot 08:00 abgeleitet und gepusht', obs.length === 1 && obs[0] === 'road/v1/obs/2610030800.json', obs.join(' '));
const o800 = parseRoadObs(show('road/v1/obs/2610030800.json'));
add('B2 obs-Datei vom CDN-Weg besteht den Client-Prüfer, ohne verworfene Punkte', o800 && o800.dropped === 0 && o800.points.length > 1400, `${o800?.points.length} Punkte`);
const h24 = remoteFiles('road/v1/h24/');
const ring = parseRoadH24(show('road/v1/h24/FN-NB/2610030800.json'));
add('B3 24-h-Ring je Reihe und Slot (23 Ring-Dateien, Client-Prüfer grün)', ring && ring.slots.length === 1 && h24.length === 23, `${h24.length} Ring-Dateien`);
const st = show('road/v1/status.json');
add('B4 status.json: letzter Slot, Bilanz je Regel, Reihen, Katalog-Zustand, recent', st.lastPublishedSlot === '2610030800' && st.balance?.byRule && Object.keys(st.groups).length >= 23 && st.recent.length === 1 && st.catalog?.state && st.balance.share < 0.03, JSON.stringify({ last: st.lastPublishedSlot, cat: st.catalog?.state, share: st.balance?.share }));
add('B5 Katalog-Bau ohne Quelle ⇒ Status „missing", Spiegel läuft weiter', st.catalog.state === 'missing' && logs.some((l) => l.includes('Katalog-Bau fehlgeschlagen')));
add('B6 state.json (Producer-Zustand) und quarantine/ liegen im Repo', remoteFiles('road/v1/state.json').length === 1 && remoteFiles('road/v1/quarantine/').length === 1);
add('B7 atomares Schreiben: keine .tmp-Reste im Bestand', !JSON.stringify(readdirSync(join(mirror, 'road'), { recursive: true })).includes('.tmp-'));
add('B8 je Reihe ein HEAD + GET auf den erwarteten Slot-Pfad (kein Listing, kein LATEST; SD-BW 404)', !served.some((s) => s.includes('LATEST') || s.endsWith('/')) && served.filter((s) => s.startsWith('GET')).length === 23, `${served.length} Anfragen`);

// --- C: slot lock — four series missing (19 < 23 − 3) ⇒ obs/h24 of the slot NOT published ----------
clock = Date.UTC(2026, 9, 3, 8, 28, 0);            // slot 08:15, past its 12-min deadline
missingGroups = new Set(['FN-BY', 'FN-NB', 'KM-NW', 'HV-NI']);
msgs = await pollUntilIdle(road);
for (const m of msgs) publish(road, m);
const st2 = show('road/v1/status.json');
add('C1 Slot 08:15 mit 19 Reihen ⇒ gesperrt: keine obs-Datei, Status nennt die Sperre, 08:00 bleibt stehen',
  !remoteFiles('road/v1/obs/').includes('road/v1/obs/2610030815.json') && st2.blocked?.slot === '2610030815' && st2.blocked.reasons.some((r) => r.rule === 'slotGroups') && remoteFiles('road/v1/obs/').includes('road/v1/obs/2610030800.json'),
  JSON.stringify(st2.blocked));
add('C2 gesperrter Slot: Quarantäne und Zustand werden trotzdem fortgeschrieben (Diagnose, Lauflängen)', remoteFiles('road/v1/quarantine/').includes('road/v1/quarantine/2610030815.json') && show('road/v1/state.json').slot === '2610030815');
add('C3 Slot-Protokoll (recent) trägt beim gesperrten Slot den Sperrgrund, beim freigegebenen keinen (AW-6a: Gate B aus dem Archiv)',
  st2.recent[0]?.slot === '2610030815' && st2.recent[0].publish === false && st2.recent[0].reasons?.some((r) => r.rule === 'slotGroups')
  && st2.recent[1]?.slot === '2610030800' && st2.recent[1].publish === true && !('reasons' in st2.recent[1]),
  JSON.stringify(st2.recent.map((r) => [r.slot, r.publish, r.reasons?.map((x) => x.rule)])));
missingGroups = new Set();

// --- D: force-push of another line wipes road/ — the next publish heals it ------------------------
execFileSync('git', ['clone', '--quiet', bare, other], { stdio: 'ignore' });
git(other, ['config', 'user.name', 'repack']); git(other, ['config', 'user.email', 'repack@local']);
git(other, ['checkout', '--quiet', '--orphan', 'fresh']);
rmSync(join(other, 'road'), { recursive: true, force: true });
mkdirSync(join(other, 'runs'), { recursive: true });
writeFileSync(join(other, 'runs', 'x.txt'), 'map line\n');
git(other, ['add', '-A']);
git(other, ['commit', '--quiet', '-m', 'data: fresh history (simulated publish-repack)']);
git(other, ['push', '--quiet', '--force', 'origin', 'HEAD:main']);
add('D0 simulierter Force-Push hat road/ vom Remote entfernt', (git(clone, ['fetch', '--quiet', 'origin', 'main']), remoteFiles('road/').length === 0));
clock = Date.UTC(2026, 9, 3, 8, 34, 30);           // slot 08:30
msgs = await pollUntilIdle(road);
for (const m of msgs) publish(road, m);
const healed = remoteFiles('road/v1/obs/');
add('D1 nächste Veröffentlichung heilt: 08:00 wieder da, dazu 08:30, Status und Zustand', ['2610030800', '2610030830'].every((s) => healed.includes(`road/v1/obs/${s}.json`)) && remoteFiles('road/v1/status.json').length === 1 && remoteFiles('road/v1/state.json').length === 1, healed.join(' '));
add('D2 die Kartenlinie (runs/) bleibt unangetastet', remoteFiles('runs/').length === 1);
add('D3 Ring nach der Heilung fortgesetzt (08:15 gesperrt ⇒ Lücke: 08:00, 08:30)', parseRoadH24(show('road/v1/h24/FN-NB/2610030830.json'))?.slots.join(',') === '2610030800,2610030830');

// --- E: retention by age (obs ≤ 3 h, ≥ 2; h24 ≤ 1 h, ≥ 2 per series; quarantine 24 h) -------------
clock = Date.UTC(2026, 9, 3, 11, 4, 0);            // slot 11:00 ⇒ obs 08:00 is > 3 h old, 08:30 is not
const r2 = createRoadMirror({ appDir: APP, mirrorDir: mirror, log: (s) => logs.push(s), now: () => clock, fetchImpl: fakeFetch, maxCatchUpSlots: 1, publishEvery: 1, catalogFile: join(tmp, 'none.xlsx') });
git(clone, ['fetch', '--quiet', 'origin', 'main']);
r2.seed(clone);
msgs = await pollUntilIdle(r2);
for (const m of msgs) publish(r2, m);
const kept = remoteFiles('road/v1/obs/');
add('E1 Aufbewahrung obs: > 3 h alte Slots fallen (08:00), jüngere bleiben (08:30, 10:45, 11:00)', !kept.includes('road/v1/obs/2610030800.json') && ['2610030830', '2610031045', '2610031100'].every((s) => kept.includes(`road/v1/obs/${s}.json`)), kept.join(' '));
const ringFiles = remoteFiles('road/v1/h24/FN-NB/');
add('E2 Aufbewahrung h24: höchstens 1 h, mindestens 2 je Reihe', ringFiles.length === 2, ringFiles.join(' '));
add('E3 quarantine/ hält 24 h (08:00 bleibt)', remoteFiles('road/v1/quarantine/').includes('road/v1/quarantine/2610030800.json'));
add('E4 Nachfolger-Job: Zustand älter als die Nachholgrenze ⇒ Start an der Grenze (10:45), dann 11:00', logs.some((l) => /road: Start · Slot 2610031045/.test(l)) && kept.includes('road/v1/obs/2610031045.json'), logs.filter((l) => l.startsWith('road: Start')).pop());

// --- F: a failing derive keeps the store (atomic) --------------------------------------------------
{
  const before = JSON.stringify(readdirSync(join(mirror, 'road', 'obs')).sort());
  const bad = createRoadMirror({ appDir: join(tmp, 'no-app'), mirrorDir: mirror, log: () => {}, now: () => clock, fetchImpl: fakeFetch });
  add('F1 ohne Derive-Skript (APP_DIR falsch) ⇒ Hook aus, Bestand unberührt', !bad.enabled && JSON.stringify(readdirSync(join(mirror, 'road', 'obs')).sort()) === before);
}

// --- G: corridors pushed by hand survive the mirror ------------------------------------------------
{
  git(clone, ['fetch', '--quiet', 'origin', 'main']);
  git(clone, ['checkout', '--quiet', '-B', 'main', 'origin/main']);
  mkdirSync(join(clone, 'road', 'v1', 'static'), { recursive: true });
  writeFileSync(join(clone, 'road', 'v1', 'static', 'corridors.json'), JSON.stringify({ schema: 1, product: 'road-corridors', corridors: [{ id: 'a8' }] }) + '\n');
  git(clone, ['add', '-A', 'road']);
  git(clone, ['commit', '--quiet', '-m', 'road: corridors (by hand)']);
  git(clone, ['push', '--quiet', 'origin', 'HEAD:main']);
  // The next radar push of the mirror copies the road store again (publish() calls copyInto on every push).
  const res = publish(r2, 'radar: rv (simulated)');
  git(clone, ['fetch', '--quiet', 'origin', 'main']);
  const storeCopy = JSON.parse(readFileSync(join(mirror, 'road', 'static', 'corridors.json'), 'utf8'));
  add('G1 von Hand gepushte corridors.json überlebt den nächsten Push des Spiegels (Bestand übernimmt sie, kein Rückschreiben)',
    show('road/v1/static/corridors.json').corridors[0]?.id === 'a8' && storeCopy.corridors[0]?.id === 'a8' && remoteFiles('road/v1/obs/').length >= 2, res.noop ? 'nichts zu committen' : 'gepusht');
}

// --- H: class column of the ring + archive export (E-AW-6: prepared, no archive) -------------------
{
  const { exportRoadWindow, readRoadStore } = await import('./road/road-export.mjs');
  // The 11:00 ring carries 08:00, 08:30, 10:45, 11:00 (08:15 locked, the rest not caught up) — k across a gap.
  const r830 = parseRoadH24(show('road/v1/h24/FN-NB/2610031100.json'));
  const o830 = parseRoadObs(show('road/v1/obs/2610031100.json'));
  const okK = r830 && Object.values(r830.stations).every((s) => typeof s.k === 'string' && s.k.length === r830.slots.length && /^[ifwdun-]+$/.test(s.k));
  const byId = new Map(o830.points.map((p) => [p.id, p]));
  const code = { ice: 'i', frost: 'f', wet: 'w', dry: 'd', unknown: 'u', nodata: 'n' };
  const ids = Object.keys(r830?.stations ?? {}).filter((id) => byId.has(id));
  const match = ids.filter((id) => r830.stations[id].k.at(-1) === code[byId.get(id).cls]).length;
  add('H1 Ring trägt die Klasse je Slot (k, ein Zeichen je Slot) — letzte Stelle = Klasse des Punkts im obs-Slot', okK && ids.length > 20 && match === ids.length, `${match}/${ids.length}`);
  const bad = JSON.parse(JSON.stringify(r830));
  const first = Object.keys(bad.stations)[0];
  bad.stations[first].k = 'x';
  const legacy = JSON.parse(JSON.stringify(r830));
  for (const s of Object.values(legacy.stations)) delete s.k;
  add('H2 Client-Prüfer: k mit falscher Länge/Zeichen ⇒ null; Ring ohne k (älterer Stand) bleibt gültig', parseRoadH24(bad) === null && !!parseRoadH24(legacy));
  const store = readRoadStore(join(mirror, 'road'));
  const ex = exportRoadWindow(store);
  const ringEnd = parseRoadH24(JSON.parse(readFileSync(join(mirror, 'road', 'h24', 'FN-NB', '2610031100.json'), 'utf8')));
  const sid = Object.keys(ringEnd.stations).find((id) => ex.stations[id]);
  const e = ex.stations[sid];
  const at = (stamp) => ex.slots.indexOf(stamp);
  add('H3 Export-Fenster: 96 Slots bis zum jüngsten Ring (11:00), je Station Reihen der Länge 96, Werte am Slot = Ring',
    ex.product === 'road-window' && ex.slots.length === 96 && ex.slots.at(-1) === '2610031100' && e.rs.length === 96 && e.k.length === 96
      && e.rs[at('2610031100')] === ringEnd.stations[sid].rs.at(-1) && e.k[at('2610031100')] === ringEnd.stations[sid].k.at(-1) && e.rs[0] === null && e.k[0] === '-',
    `${Object.keys(ex.stations).length} Stationen · ${sid}`);
  add('H4 Export nennt Herkunft, Reihen, Lizenz und die Stammdaten aus dem jüngsten obs-Slot', /GeoNutzV/.test(ex.source) && ex.groups.length >= 20 && typeof e.lat === 'number' && typeof e.n === 'string' && e.g, JSON.stringify({ g: e.g, n: e.n, groups: ex.groups.length }));
  const legacyEx = exportRoadWindow({ ...store, rings: store.rings.map((r) => ({ ...r, stations: Object.fromEntries(Object.entries(r.stations).map(([id, s]) => [id, { rs: s.rs, ta: s.ta, td: s.td }])) })) });
  add('H5 Export aus Ringen ohne k: Klassen „-" (unbekannt), Werte unverändert', Object.values(legacyEx.stations).every((s) => /^-+$/.test(s.k)) && legacyEx.stations[sid].rs.join() === e.rs.join());
}

// --- I: job seam and a slow/hanging DWD (review findings #1, #2) ----------------------------------------
{
  const { checkRoadStatus } = await import('./health-manifests.mjs');
  git(clone, ['fetch', '--quiet', 'origin', 'main']);
  git(clone, ['checkout', '--quiet', '-B', 'main', 'origin/main']);
  // I1: the successor job starts with an EMPTY store, 2 min after the predecessor published 11:00.
  clock = Date.UTC(2026, 9, 3, 11, 6, 0);
  const succ = createRoadMirror({ appDir: APP, mirrorDir: join(tmp, 'mirror-succ'), log: (s) => logs.push(s), now: () => clock, fetchImpl: fakeFetch, maxCatchUpSlots: 96, publishEvery: 1, catalogFile: join(tmp, 'none.xlsx') });
  succ.seed(clone);
  const root = join(tmp, 'seam-root');
  mkdirSync(root, { recursive: true });
  succ.copyInto(root);
  const st = JSON.parse(readFileSync(join(root, 'road', 'v1', 'status.json'), 'utf8'));
  const before = show('road/v1/status.json');
  // This verifier has no catalogue source on purpose (B5: "missing") — R4 must carry the predecessor's state, not reset.
  const res = checkRoadStatus(st, { nowMs: clock }).filter((r) => r.id !== 'R4 Katalog');
  add('I1 Job-Naht: der Nachfolger schreibt beim ersten Radar-Push einen Status, der den Wächter grün lässt (letzter freigegebener Slot, Katalog, Ableitung übernommen)',
    res.every((r) => r.pass) && st.lastPublishedSlot === '2610031100' && st.catalog?.state === before.catalog?.state && st.catalog?.etag === before.catalog?.etag,
    res.filter((r) => !r.pass).map((r) => `${r.id}: ${r.detail}`).join(' · ') || `${st.lastPublishedSlot} · Katalog ${st.catalog?.state}`);
  add('I2 Job-Naht: der zuletzt veröffentlichte Slot wird nicht noch einmal abgeleitet (nächster ist 11:15)', succ.pendingSlot === '2610031115', succ.pendingSlot);

  // I3/I4: DWD hangs. A hanging request must not hold the radar mirror's loop (fetch timeout + poll budget).
  const hang = (pred) => async (url, init = {}) => {
    if (pred(url)) {
      return new Promise((_, reject) => {
        const sig = init.signal;
        if (sig?.aborted) { reject(sig.reason ?? new Error('aborted')); return; }
        sig?.addEventListener('abort', () => reject(sig.reason ?? new Error('aborted')), { once: true });
      });
    }
    return fakeFetch(url, init);
  };
  const raceMs = async (p, ms) => { const t0 = Date.now(); const r = await Promise.race([p.then(() => 'done'), new Promise((r2) => setTimeout(() => r2('timeout'), ms))]); return { r, ms: Date.now() - t0 }; };
  clock = Date.UTC(2026, 9, 3, 11, 16, 0);           // live slot 11:15
  const opts = { appDir: APP, log: (s) => logs.push(s), now: () => clock, maxCatchUpSlots: 96, publishEvery: 1, catalogFile: join(tmp, 'none.xlsx'), fetchTimeoutMs: 300, pollBudgetMs: 1500 };
  const one = createRoadMirror({ ...opts, mirrorDir: join(tmp, 'mirror-hang1'), fetchImpl: hang((u) => u.includes('/FN/') && u.includes('-BY--')) });
  one.seed(clone);
  const a = await raceMs(one.poll(), 6000);
  const have = one.pendingInfo?.have ?? [];
  add('I3 eine hängende Reihe (FN-BY): poll() kehrt binnen Zeitbudget zurück, die übrigen Reihen sind geholt',
    a.r === 'done' && a.ms < 3000 && have.length >= 20 && !have.includes('FN-BY'), `${a.r} nach ${a.ms} ms · ${have.length} Reihen`);
  const all = createRoadMirror({ ...opts, mirrorDir: join(tmp, 'mirror-hang2'), fetchImpl: hang(() => true) });
  all.seed(clone);
  const b = await raceMs(all.poll(), 6000);
  add('I4 DWD hängt komplett: poll() kehrt binnen Zeitbudget zurück (der Radar-Takt bleibt frei)', b.r === 'done' && b.ms < 3000, `${b.r} nach ${b.ms} ms`);
}

rmSync(tmp, { recursive: true, force: true });
const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
if (failed) console.log(logs.slice(-12).map((l) => `    log: ${l}`).join('\n'));
console.log(`\nverify:road-derive — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
