/**
 * verify:road-archive — AW-6a (audit/autobahnwetter.md §12): the road line's store in buscosun-archiv.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-road-archive.mjs
 *
 * Offline. A  half days and merge on synthetic rings in the contract's form (parseRoadH24 must accept them)
 *          B  the real producer: the frozen slot 03.10.2026 08:00 derived by road-derive.mjs, then archived
 *          C  the workflow template (scripts/punktarchiv-repo/workflow-road-archiv.yml) against the constants
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import {
  ROAD_SLOT_MS, ROAD_RETENTION, ROAD_REPO_DIR, ROAD_CLASS_NONE, parseRoadH24, roadStamp, roadStampToMs,
} from '../src/road/roadContract.ts';
import { exportRoadWindow, readRoadStore } from './road/road-export.mjs';
import {
  ROAD_ARCHIVE_EVERY_H, ROAD_HALF_SLOTS, ROAD_ARCHIVE_STALE_MIN, halfDayOf, halfDaySlots, buildHalfDays, mergeHalfDay,
  mergeSlotLog, slotEntriesByDay, archiveRoad, archiveReadme, readQuarantine,
} from './road/road-archive.mjs';
import { ROAD_RECENT_SLOTS } from './road/road-mirror.mjs';
import { deriveRoadSlot } from './road/road-derive.mjs';
import { rebuildIndexes } from './punktarchiv/lib/punktarchiv.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FIX = join(HERE, 'lib', 'fixtures', 'road');
const results = [];
const add = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  [${detail}]` : ''}`); };
const gz = (p) => JSON.parse(gunzipSync(readFileSync(p)).toString('utf8'));

// --- synthetic store in the contract's form ----------------------------------------------------------
/** One 24-h ring of `group` ending at `endStamp` (96 slots); `val(id, i, stamp)` gives { rs, ta, td, k }. */
function makeRing(group, endStamp, ids, val, n = 96) {
  const endMs = roadStampToMs(endStamp);
  const slots = Array.from({ length: n }, (_, i) => roadStamp(endMs - (n - 1 - i) * ROAD_SLOT_MS));
  const stations = {};
  for (const id of ids) {
    const v = slots.map((s, i) => val(id, i, s));
    stations[id] = { rs: v.map((x) => x.rs), ta: v.map((x) => x.ta), td: v.map((x) => x.td), k: v.map((x) => x.k).join('') };
  }
  return { schema: 1, product: 'road-h24', group, slot: endStamp, slots, stations };
}
function writeStore(dir, rings, { quarantine = {}, status = null } = {}) {
  for (const r of rings) {
    mkdirSync(join(dir, 'h24', r.group), { recursive: true });
    writeFileSync(join(dir, 'h24', r.group, `${r.slot}.json`), JSON.stringify(r));
  }
  mkdirSync(join(dir, 'quarantine'), { recursive: true });
  for (const [s, entries] of Object.entries(quarantine)) {
    writeFileSync(join(dir, 'quarantine', `${s}.json`), JSON.stringify({ schema: 1, product: 'road-quarantine', slot: s, slotMs: roadStampToMs(s), entries }));
  }
  if (status) writeFileSync(join(dir, 'status.json'), JSON.stringify(status));
}
const valA = (id, i, s) => ({ rs: i * 10, ta: i * 10 + 5, td: -i, k: i % 2 ? 'w' : 'd' });
const msOf = (s) => roadStampToMs(s);

// --- A: half days and merge ---------------------------------------------------------------------------
{
  const a = halfDayOf('2610031145'), b = halfDayOf('2610031200'), c = halfDayOf('2610032345');
  const s = halfDaySlots(b.startMs);
  add('A1 Halbtag: 11:45 → 03.10./00, 12:00 und 23:45 → 03.10./12; 48 Slots 12:00…23:45',
    a.day === '2026-10-03' && a.half === '00' && b.half === '12' && c.half === '12' && c.day === '2026-10-03'
    && s.length === ROAD_HALF_SLOTS && s[0] === '2610031200' && s.at(-1) === '2610032345', `${a.day}/${a.half} ${b.half} ${c.half} ${s[0]}…${s.at(-1)}`);

  const ringA = makeRing('AA-AA', '2610031530', ['A1', 'A2'], valA);
  add('A0 Testringe in der Form des Vertrags (parseRoadH24 nimmt sie an)', parseRoadH24(JSON.parse(JSON.stringify(ringA))) !== null);
  const win = exportRoadWindow({ rings: [ringA], obs: null });
  const halves = buildHalfDays({ window: win, quarantine: { '2610030000': [{ id: 'A1', g: 'AA-AA', field: 'rs', raw: -75, rule: 'placeholder' }] } });
  const keys = halves.map((h) => `${h.day}/${h.half}`);
  const h0 = halves.find((h) => h.half === '00');
  add('A2 nur geschlossene Halbtage: 02.10./12 (ab 15:45, Teil) und 03.10./00 — der offene 03.10./12 wartet',
    JSON.stringify(keys) === JSON.stringify(['2026-10-02/12', '2026-10-03/00']), keys.join(' '));
  // 03.10. 00:00 is ring index 33 (15:45 + 33 × 15 min).
  add('A3 Werte am richtigen Slot: 03.10. 00:00 = Ringindex 33, 11:45 = 80; Klasse je Slot',
    h0.stations.A1.rs[0] === 330 && h0.stations.A1.rs[47] === 800 && h0.stations.A1.ta[0] === 335 && h0.stations.A1.k[0] === 'w' && h0.stations.A1.k[1] === 'd',
    `${h0.stations.A1.rs[0]} ${h0.stations.A1.rs[47]} ${h0.stations.A1.k.slice(0, 4)}`);
  const h12 = halves.find((h) => h.day === '2026-10-02');
  add('A4 Teil-Halbtag: Slots vor dem Fenster null/„-", ab 15:45 gefüllt; Quarantäne nur der eigenen Slots',
    h12.stations.A1.rs[14] === null && h12.stations.A1.rs[15] === 0 && h12.stations.A1.k[14] === ROAD_CLASS_NONE
    && Object.keys(h0.quarantine).join() === '2610030000' && Object.keys(h12.quarantine).length === 0);

  // Late series: ring BB-BB ends 4 slots before AA-AA when the half day closes; the next run brings the rest.
  const ids = ['B1'];
  const valB = (id, i) => ({ rs: 7, ta: 8, td: 1, k: 'f' });
  const run1 = buildHalfDays({ window: exportRoadWindow({ rings: [makeRing('AA-AA', '2610031200', ['A1'], valA), makeRing('BB-BB', '2610031100', ids, valB)], obs: null }) });
  const old = run1.find((h) => h.day === '2026-10-03' && h.half === '00');
  const valA2 = (id, i, s) => ({ ...valA(id, i, s), rs: 999 });     // a different value for the same slot
  const run2 = buildHalfDays({ window: exportRoadWindow({ rings: [makeRing('AA-AA', '2610031300', ['A1'], valA2), makeRing('BB-BB', '2610031215', ids, valB)], obs: null }) });
  const add2 = run2.find((h) => h.day === '2026-10-03' && h.half === '00');
  const m = mergeHalfDay(old, add2);
  add('A5 verspätete Reihe: der nächste Lauf füllt 11:15–11:45, nichts anderes ändert sich',
    old.stations.B1.rs[45] === null && m.changed && m.doc.stations.B1.rs.slice(45).every((v) => v === 7) && m.doc.stations.B1.k.slice(45) === 'fff'
    && m.doc.rings['BB-BB'] === '2610031215', `${old.stations.B1.k.slice(40)} → ${m.doc.stations.B1.k.slice(40)}`);
  add('A6 ein Archivwert wird nie überschrieben (anderer Wert im neuen Ring ⇒ alter bleibt)',
    m.doc.stations.A1.rs.every((v, i) => v === old.stations.A1.rs[i]) && add2.stations.A1.rs[0] === 999);
  const again = mergeHalfDay(m.doc, add2);
  add('A7 derselbe Lauf noch einmal ⇒ unverändert (kein Schreiben)', !again.changed && again.doc === m.doc);
  const qOld = { ...old, quarantine: { '2610030000': [{ id: 'X', rule: 'limit' }] } };
  const qAdd = { ...old, quarantine: { '2610030000': [{ id: 'Y', rule: 'stuck' }], '2610030015': [{ id: 'Z', rule: 'limit' }] } };
  const qm = mergeHalfDay(qOld, qAdd);
  add('A8 Quarantäne: neue Slots kommen dazu, ein archivierter Slot bleibt wie er ist',
    qm.changed && qm.doc.quarantine['2610030000'][0].id === 'X' && qm.doc.quarantine['2610030015'][0].id === 'Z');

  const recent1 = [{ slot: '2610031530', publish: true, derivedAt: '2026-10-03T15:33:00Z' }, { slot: '2610032345', publish: false, reasons: [{ rule: 'slotGroups' }], derivedAt: '2026-10-03T23:58:00Z' }];
  const byDay = slotEntriesByDay(recent1);
  const l1 = mergeSlotLog(null, '2026-10-03', byDay.get('2026-10-03'));
  const l2 = mergeSlotLog(l1.doc, '2026-10-03', { '2610031530': { slot: '2610031530', publish: true, derivedAt: '2026-10-03T15:33:00Z' } });
  const l3 = mergeSlotLog(l1.doc, '2026-10-03', { '2610031530': { slot: '2610031530', publish: false, derivedAt: '2026-10-03T16:40:00Z' }, '2610031545': { slot: '2610031545', publish: true, derivedAt: '2026-10-03T15:48:00Z' } });
  add('A9 Slot-Protokoll: je Tag, Sperrgrund bleibt, gleicher Eintrag ⇒ unverändert, neu abgeleitet (späteres derivedAt) ersetzt',
    l1.changed && Object.keys(l1.doc.slots).length === 2 && l1.doc.slots['2610032345'].reasons[0].rule === 'slotGroups'
    && !l2.changed && l3.changed && l3.doc.slots['2610031530'].publish === false && Object.keys(l3.doc.slots).length === 3);
}

// --- A (IO): two runs on temp dirs ---------------------------------------------------------------------
{
  const tmp = mkdtempSync(join(tmpdir(), 'road-archive-'));
  const store = join(tmp, 'store'), archive = join(tmp, 'archiv', ROAD_REPO_DIR);
  const recent = Array.from({ length: ROAD_RECENT_SLOTS }, (_, i) => ({ slot: roadStamp(msOf('2610031530') - i * ROAD_SLOT_MS), publish: true, derivedAt: new Date(msOf('2610031530') - i * ROAD_SLOT_MS + 200_000).toISOString() }));
  writeStore(store, [makeRing('AA-AA', '2610031530', ['A1', 'A2'], valA)], { quarantine: { '2610030800': [{ id: 'A1', g: 'AA-AA', field: 'rs', raw: 80, rule: 'limit' }] }, status: { killSwitch: false, recent } });
  const now = Date.UTC(2026, 9, 3, 15, 40);
  const r1 = archiveRoad({ storeDir: store, archiveDir: archive, nowMs: now });
  const idx1 = readFileSync(join(archive, 'index.json'), 'utf8');
  const h0 = gz(join(archive, '2026-10-03', '00.json.gz'));
  add('A10 erster Lauf schreibt die zwei geschlossenen Halbtage, das Slot-Protokoll, Index und README',
    r1.ok && r1.written.join() === '2026-10-02/12.json.gz,2026-10-03/00.json.gz' && existsSync(join(archive, '2026-10-03', 'slots.json'))
    && readFileSync(join(archive, 'README.md'), 'utf8') === archiveReadme() && h0.quarantine['2610030800'][0].raw === 80,
    JSON.stringify({ written: r1.written, slotLogs: r1.slotLogs }));
  const r2 = archiveRoad({ storeDir: store, archiveDir: archive, nowMs: now + 3 * 3_600_000 });
  add('A11 zweiter Lauf auf demselben Bestand schreibt nichts (Index byte-gleich, kein Commit)',
    r2.ok && !r2.written.length && !r2.merged.length && !r2.slotLogs.length && readFileSync(join(archive, 'index.json'), 'utf8') === idx1,
    JSON.stringify({ unchanged: r2.unchanged }));
  writeFileSync(join(archive, 'README.md'), archiveReadme().replace(/\n/g, '\r\n'));   // a Windows checkout (autocrlf)
  const rCrlf = archiveRoad({ storeDir: store, archiveDir: archive, nowMs: now + 6 * 3_600_000 });
  add('A17 README mit CRLF (Windows-Checkout) gilt als unverändert — kein neuer Index-Stempel, kein leerer Commit',
    readFileSync(join(archive, 'index.json'), 'utf8') === idx1 && !rCrlf.written.length && !rCrlf.slotLogs.length);
  const idx = JSON.parse(idx1);
  add('A12 Index: je Halbtag Stationen, gefüllte Slots, Quarantäne; je Tag Slot-Protokoll',
    idx.days['2026-10-03'].halves['00'].stations === 2 && idx.days['2026-10-03'].halves['00'].filledSlots === 48
    && idx.days['2026-10-02'].halves['12'].filledSlots === 33 && idx.days['2026-10-03'].slots.logged === ROAD_RECENT_SLOTS && idx.days['2026-10-03'].halves['00'].quarantineEntries === 1,
    JSON.stringify(idx.days['2026-10-02']));
  const stale = archiveRoad({ storeDir: store, archiveDir: archive, nowMs: msOf('2610031530') + (ROAD_ARCHIVE_STALE_MIN + 1) * 60_000 });
  const fresh = archiveRoad({ storeDir: store, archiveDir: archive, nowMs: msOf('2610031530') + (ROAD_ARCHIVE_STALE_MIN - 1) * 60_000 });
  writeFileSync(join(store, 'status.json'), JSON.stringify({ killSwitch: true, recent }));
  const killed = archiveRoad({ storeDir: store, archiveDir: archive, nowMs: msOf('2610031530') + 10 * 3_600_000 });
  add(`A13 Lebenszeichen: Ring > ${ROAD_ARCHIVE_STALE_MIN} min alt ⇒ stale (Exit 3), darunter grün, Kill-Schalter ⇒ grün`, stale.stale && !fresh.stale && !killed.stale && killed.killSwitch);
  const empty = mkdtempSync(join(tmpdir(), 'road-archive-empty-'));
  add('A14 Bestand ohne Ringe ⇒ ok:false (Exit 1), nichts geschrieben', !archiveRoad({ storeDir: empty, archiveDir: join(empty, 'a'), nowMs: now }).ok && !existsSync(join(empty, 'a')));
  writeFileSync(join(archive, '2026-10-03', '00.json.gz'), 'kaputt');
  let threw = false;
  try { archiveRoad({ storeDir: store, archiveDir: archive, nowMs: now }); } catch { threw = true; }
  add('A15 unlesbare Archivdatei ⇒ Abbruch statt Überschreiben (Datei bleibt, wie sie war)', threw && readFileSync(join(archive, '2026-10-03', '00.json.gz'), 'utf8') === 'kaputt');
  // The point archive next door rebuilds its index from the root's day folders only.
  const root = join(tmp, 'archiv');
  mkdirSync(join(root, '2026-10-03'), { recursive: true });
  const snap = () => ['index.json', 'README.md', '2026-10-02/12.json.gz'].map((f) => readFileSync(join(archive, f)).toString('base64')).join('|');
  const before = snap();
  const pIdx = rebuildIndexes(root);
  add('A16 Punktarchiv daneben: sein Index sieht nur Tagesordner, road/ bleibt Byte für Byte unberührt',
    pIdx.days.length === 1 && pIdx.days[0].day === '2026-10-03' && snap() === before);
}

// --- B: the real producer ------------------------------------------------------------------------------
{
  const tmp = mkdtempSync(join(tmpdir(), 'road-archive-real-'));
  const inDir = join(tmp, 'in');
  mkdirSync(inDir, { recursive: true });
  for (const f of readdirSync(join(FIX, 'swis-2610030800'))) if (f.endsWith('.bin') && !f.startsWith('SD')) cpSync(join(FIX, 'swis-2610030800', f), join(inDir, f));
  writeFileSync(join(inDir, 'groups.json'), '{}');
  const storeDir = join(tmp, 'store'), site = join(tmp, 'site');
  mkdirSync(storeDir, { recursive: true });
  deriveRoadSlot({ inDir, storeDir, outDir: site, stamp: '2610030800', nowIso: '2026-10-03T08:04:30Z' });
  // A second (synthetic) series up to 12:00 closes the half day 03.10./00 — the real rings carry only 08:00.
  writeStore(site, [makeRing('ZZ-ZZ', '2610031200', ['Z1'], () => ({ rs: 1, ta: 2, td: 0, k: 'd' }))]);
  const real = readRoadStore(site);
  const quarantine = readQuarantine(join(site, 'quarantine'));
  const archive = join(tmp, 'archiv', ROAD_REPO_DIR);
  const r = archiveRoad({ storeDir: site, archiveDir: archive, nowMs: Date.UTC(2026, 9, 3, 12, 10) });
  const doc = gz(join(archive, '2026-10-03', '00.json.gz'));
  const i = 32;                                             // 08:00 in the half day 00:00…11:45
  let same = 0, total = 0, meta = 0;
  for (const ring of real.rings.filter((x) => x.group !== 'ZZ-ZZ')) {
    for (const [id, v] of Object.entries(ring.stations)) {
      total++;
      const e = doc.stations[id];
      if (e && e.rs[i] === v.rs[0] && e.ta[i] === v.ta[0] && e.td[i] === v.td[0] && e.k[i] === v.k[0]) same++;
      if (e && e.n && Number.isFinite(e.lat)) meta++;
    }
  }
  add('B1 echter Producer: jede Station des Rings steht im Halbtag mit denselben Werten und derselben Klasse um 08:00',
    r.ok && total > 1000 && same === total, `${same}/${total}`);
  add('B2 Stammdaten aus dem obs-Slot (Name, Lage) an jeder Station', meta === total, `${meta}/${total}`);
  add('B3 Quarantäne des Slots unverändert im Halbtag (Rohwert, Regel, Beobachtungsmodus)',
    JSON.stringify(doc.quarantine['2610030800']) === JSON.stringify(quarantine['2610030800']) && quarantine['2610030800'].length > 0,
    `${quarantine['2610030800'].length} Einträge`);
}

// --- C: the workflow template --------------------------------------------------------------------------
{
  const wfPath = join(HERE, 'punktarchiv-repo', 'workflow-road-archiv.yml');
  const wf = readFileSync(wfPath, 'utf8');
  const code = wf.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const cron = /cron:\s*'([^']+)'/.exec(code)?.[1];
  const every = /^\d+ \*\/(\d+) \* \* \*$/.exec(cron ?? '')?.[1];
  const slotsPerRun = ROAD_ARCHIVE_EVERY_H * 4;
  add(`C1 Takt = ROAD_ARCHIVE_EVERY_H (${ROAD_ARCHIVE_EVERY_H} h); das Slot-Protokoll (${ROAD_RECENT_SLOTS} Slots) und die Quarantäne (24 h) sieht jeder Slot mindestens zweimal`,
    Number(every) === ROAD_ARCHIVE_EVERY_H && ROAD_RECENT_SLOTS >= 2 * slotsPerRun && ROAD_RETENTION.quarantineMaxAgeMs >= 2 * ROAD_ARCHIVE_EVERY_H * 3_600_000 && cron !== '10 23 * * *', cron);
  add('C2 append-only: kein --force, Push mit Wiederholung und Rebase, contents: write, eigene concurrency-Gruppe',
    !/--force|-f\b.*push|push\s+-f/.test(code) && /git pull --rebase origin main/.test(code) && /contents:\s*write/.test(code) && /group:\s*road-archiv\b/.test(code));
  add('C3 Commit nur unter road/, Archiv-Ziel = ROAD_REPO_DIR, Bestand = road/v1 des Daten-Repos (sparse)',
    /git add -A -- road\s*$/m.test(code) && code.includes(`--archive=../${ROAD_REPO_DIR}`) && code.includes(`--store=../data/${ROAD_REPO_DIR}`) && /sparse-checkout set --no-cone road\/v1\b/.test(code)
    && /sparse-checkout:\s*road\s*$/m.test(code) && /filter:\s*blob:none/.test(code));
  add('C4 rot erst nach dem Commit: Archivschritt continue-on-error, letzter Schritt prüft dessen outcome',
    /id:\s*archive\s*\n\s*continue-on-error:\s*true/.test(code) && /if:\s*steps\.archive\.outcome == 'failure'/.test(code)
    && code.indexOf('Commit and push') < code.indexOf("steps.archive.outcome"));
  // Every local file the archiver imports must be inside the sparse patterns of the app clone.
  const patterns = /sparse-checkout set --no-cone (scripts\/road [^\n]+)/.exec(code)?.[1].trim().split(/\s+/) ?? [];
  const seen = new Set();
  const walk = (abs) => {
    if (seen.has(abs)) return;
    seen.add(abs);
    const src = readFileSync(abs, 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*'(\.{1,2}\/[^']+)'/g)) {
      let p = resolve(dirname(abs), m[1]);
      if (!existsSync(p)) for (const ext of ['.ts', '.mjs', '.js']) if (existsSync(p + ext)) { p += ext; break; }
      if (existsSync(p)) walk(p);
    }
    for (const m of src.matchAll(/register\('(\.\/[^']+)'/g)) walk(resolve(dirname(abs), m[1]));
  };
  walk(join(HERE, 'road', 'road-archive.mjs'));
  walk(join(HERE, 'lib', 'register-ts.mjs'));
  const files = [...seen].map((p) => relative(ROOT, p).replace(/\\/g, '/'));
  const outside = files.filter((f) => !patterns.some((pt) => f === pt || f.startsWith(`${pt}/`)));
  add('C5 jede Datei, die der Archivierer lädt, liegt im sparse-Muster des App-Klons', files.length >= 5 && !outside.length && patterns.includes('package.json'),
    outside.length ? outside.join(' ') : `${files.length} Dateien unter ${patterns.join(' ')}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\nverify:road-archive — ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
