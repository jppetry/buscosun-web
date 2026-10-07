/**
 * verify:road-positions — M6 (`audit/autobahnwetter-datenpruefung.md` §5, Jan 06.10.2026): one position per road-weather
 * station for the measured marker AND the forecast point, chosen by evidence (`scripts/road/station-positions.mjs`).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-road-positions.mjs
 *
 *   A  road numbers keep every digit (`St 2260` ≠ `St 226`, D-10) · B  the rule · C  distance to the own road
 *   D  stationPosition: decision, stale decision, unverified, fallbacks · E  derive on the REAL bulletins of
 *   2610030800: P101 Kahl moves to the catalogue (A 45), every other point byte-equal to the derive without a table
 *   (negative control: a stale decision moves nothing) · F  forecast points share the marker's position
 *   · G  the client accepts `posCatalog` + `rpos` and names both flags · H  the committed table: real cases, consistency
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  roadKeyOf, refKeys, pickPosition, distToOwnRoadM, stationPosition, readStationPositions, kmBetween,
  ROAD_POS_ON_ROAD_M, ROAD_POS_SAME_KM,
} from './road/station-positions.mjs';
import { deriveRoadSlot } from './road/road-derive.mjs';
import { stationPointsOf } from './road/build-fc-points.mjs';
import { parseRoadObs } from '../src/road/roadContract.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'lib', 'fixtures', 'road', 'swis-2610030800');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const key = (k) => (k ? `${k.cls}/${k.num}` : null);

// --- A: road numbers ----------------------------------------------------------------------------------
{
  const cases = [['St2260', 'L/2260'], ['St. 2289', 'L/2289'], ['L3078x', 'L/3078'], ['A045S', 'A/45'], ['A 8', 'A/8'], ['B410', 'B/410'],
    ['S 177', 'L/177'], ['K20', 'K/20'], ['BAB 9', 'A/9'], ['RWYx', null], ['', null], [null, null]];
  const bad = cases.filter(([s, want]) => key(roadKeyOf(s)) !== want);
  add('A1 roadKeyOf behält alle Ziffern und ordnet die Klassen (St/S/L → L)', bad.length === 0, bad.map(([s, w]) => `${s}→${key(roadKeyOf(s))}≠${w}`).join(' '));
  add('A2 refKeys: „A 45;E 41" → nur A/45 (E-Straßen sind keine Klasse), „St 2260" ≠ „St 226"',
    refKeys('A 45;E 41').map(key).join() === 'A/45' && key(roadKeyOf('St 2260')) !== key(roadKeyOf('ST226')));
}

// --- B: the rule ---------------------------------------------------------------------------------------
{
  const P = (distKm, reportOn, catalogOn) => pickPosition({ distKm, reportOn, catalogOn });
  const t = [
    [P(0.2, false, true), 'report', 'same'], [P(5, true, true), 'report', 'both'], [P(5, true, false), 'report', 'report'],
    [P(5, false, true), 'catalog', 'catalog'], [P(5, false, false), 'report', 'neither'], [P(5, null, true), 'report', 'unchecked'],
  ];
  const bad = t.filter(([r, use, check]) => r.use !== use || r.check !== check);
  add('B1 Regel: eigene Straße gewinnt, beide → Meldung, keine → Meldung (gekennzeichnet), ≤ 0,3 km → Meldung, ungeprüft → Meldung', bad.length === 0, JSON.stringify(bad));
}

// --- C: distance to the own road -----------------------------------------------------------------------
{
  // A way of the A 45 running north–south at lon 9.0; a B 8 next to it at lon 9.01.
  const ways = [
    { tags: { ref: 'A 45' }, geometry: [{ lat: 50.0, lon: 9.0 }, { lat: 50.2, lon: 9.0 }] },
    { tags: { ref: 'B 8' }, geometry: [{ lat: 50.0, lon: 9.01 }, { lat: 50.2, lon: 9.01 }] },
  ];
  const a45 = [roadKeyOf('A45')];
  const onA = distToOwnRoadM([9.001, 50.1], a45, ways);          // ≈ 71 m east of the A 45
  const nextToB = distToOwnRoadM([9.0105, 50.1], a45, ways);     // on the B 8, ≈ 750 m from the A 45
  const none = distToOwnRoadM([9.0, 50.1], [roadKeyOf('A7')], ways);
  add('C1 Abstand zur EIGENEN Straße: 71 m an der A 45, an der B 8 ≈ 750 m (zählt nicht als A 45), andere Nummer = ∞',
    Math.abs(onA - 71.5) < 3 && Math.abs(nextToB - 751) < 10 && nextToB > ROAD_POS_ON_ROAD_M && none === Infinity, `${onA.toFixed(1)} / ${nextToB.toFixed(1)} / ${none}`);
}

// --- D: stationPosition --------------------------------------------------------------------------------
{
  const table = { stations: {
    P101: { use: 'catalog', check: 'catalog', report: [49.20859, 10.24814], catalog: [50.08435, 9.03535] },
    H371: { use: 'report', check: 'neither', report: [51.6, 8.35], catalog: [51.62, 8.37] },
    H508: { use: 'report', check: 'report', report: [51.19289, 6.37886], catalog: [51.21667, 6.5] },
  } };
  const r1 = stationPosition(table, 'P101', { lat: 49.20859, lon: 10.24814 }, { lat: 50.08435, lon: 9.03535 });
  const r2 = stationPosition(table, 'P101', { lat: 50.0841, lon: 9.0355 }, null);   // DWD corrected the bulletin
  const r3 = stationPosition(table, 'H371', { lat: 51.6, lon: 8.35 }, null);
  const r4 = stationPosition(table, 'H508', { lat: 51.19289, lon: 6.37886 }, { lat: 51.21667, lon: 6.5 });
  const r5 = stationPosition(table, 'X1', { lat: 52, lon: 10 }, { lat: 52.1, lon: 10 });
  const r6 = stationPosition(table, 'X1', null, { lat: 52.1, lon: 10 });
  const r7 = stationPosition(null, 'P101', { lat: 49.20859, lon: 10.24814 }, { lat: 50.08435, lon: 9.03535 });
  add('D1 Entscheidung „Katalog" gilt, solange die Meldung dieselbe Lage nennt (P101 → 50.08435, 9.03535, posCatalog)', r1.lat === 50.08435 && r1.lon === 9.03535 && r1.flag === 'posCatalog');
  add('D2 korrigiert der DWD die Meldung, zählt wieder die Meldung (Entscheidung veraltet)', r2.lat === 50.0841 && r2.flag === null);
  add('D3 keine Lage an der Straße → Meldung mit posUnverified', r3.lat === 51.6 && r3.flag === 'posUnverified');
  add('D4 Entscheidung „Meldung" und Stationen ohne Eintrag → Meldung ohne Kennzeichen; ohne Meldung → Katalog; ohne Tabelle → Meldung',
    r4.lat === 51.19289 && r4.flag === null && r5.lat === 52 && r5.flag === null && r6.lat === 52.1 && r7.lat === 49.20859 && r7.flag === null);
}

// --- E: derive on the real bulletins ---------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'road-positions-'));
try {
  const store = join(tmp, 'store');
  mkdirSync(store, { recursive: true });
  const nowIso = '2026-10-03T08:04:00.000Z';
  const run = (name, positions) => {
    const out = join(tmp, name);
    const s = deriveRoadSlot({ inDir: FIX, storeDir: store, outDir: out, stamp: '2610030800', nowIso, positions });
    return { s, obs: JSON.parse(readFileSync(join(out, 'obs', '2610030800.json'), 'utf8')) };
  };
  const base = run('base', null);
  const p101 = base.obs.points.find((p) => p.id === 'P101');
  add('E0 Fixture trägt P101 Kahl mit der falschen Meldelage (49.20859, 10.24814 — 131 km von der A 45)', p101 && p101.lat === 49.20859 && p101.lon === 10.24814, p101 ? `${p101.lat}, ${p101.lon}` : 'fehlt');
  const table = { schema: 1, product: 'road-station-positions', builtAt: 'test', stations: {
    P101: { use: 'catalog', check: 'catalog', report: [49.20859, 10.24814], catalog: [50.08435, 9.03535] },
  } };
  const moved = run('moved', table);
  const m101 = moved.obs.points.find((p) => p.id === 'P101');
  add('E1 Ableitung: P101 steht auf der Kataloglage an der A 45, Kennzeichen posCatalog, Meldelage in rpos',
    m101 && m101.lat === 50.08435 && m101.lon === 9.03535 && m101.f?.includes('posCatalog') && m101.rpos?.[0] === 49.20859 && m101.rpos?.[1] === 10.24814,
    m101 ? JSON.stringify({ lat: m101.lat, lon: m101.lon, f: m101.f, rpos: m101.rpos }) : 'fehlt');
  const strip = (pts) => JSON.stringify(pts.filter((p) => p.id !== 'P101'));
  add('E2 alle übrigen Punkte bytegleich zur Ableitung ohne Tabelle; Werte von P101 unverändert',
    strip(base.obs.points) === strip(moved.obs.points) && base.obs.points.length === moved.obs.points.length
    && JSON.stringify({ ...p101, lat: 0, lon: 0 }) === JSON.stringify({ ...m101, lat: 0, lon: 0, f: undefined, rpos: undefined }),
    `${base.obs.points.length} / ${moved.obs.points.length}`);
  add('E3 Zusammenfassung zählt die Kennzeichen (posCatalog 1)', moved.s.positions?.posCatalog === 1 && base.s.positions === null, JSON.stringify(moved.s.positions));
  add('E4 die geschriebene Datei besteht den Client-Prüfer ohne Verlust', (() => { const o = parseRoadObs(moved.obs); return o && o.dropped === 0; })());
  // Negative control: a decision taken on another bulletin position is stale ⇒ nothing moves.
  const stale = run('stale', { ...table, stations: { P101: { ...table.stations.P101, report: [49.3, 10.3] } } });
  add('E5 Gegenprobe: veraltete Entscheidung (andere Meldelage) bewegt nichts — Datei gleich der ohne Tabelle',
    JSON.stringify(stale.obs.points) === JSON.stringify(base.obs.points));

  // --- F: forecast points ---------------------------------------------------------------------------------
  const catalogRows = { P101: { n: 'Kahl', bl: 'BY', lat: 50.084348264, lon: 9.035351543 }, H999: { n: 'still', bl: 'NW', lat: 51.5, lon: 7.5 } };
  const reporting = moved.obs.points.filter((p) => p.id === 'P101');
  const withPos = stationPointsOf(catalogRows, [], reporting, table);
  const without = stationPointsOf(catalogRows, [], reporting, null);
  const fp = withPos.find((p) => p.id === 'P101'), fq = withPos.find((p) => p.id === 'H999');
  add('F1 Prognosepunkt P101 = Lage des Messmarkers (Katalog, pos: catalog), gelesen über rpos des Slots', fp.lat === m101.lat && fp.lon === m101.lon && fp.pos === 'catalog', JSON.stringify(fp));
  const reportingH = [{ id: 'H508', lat: 51.19289, lon: 6.37886 }];
  const h = stationPointsOf({ H508: { n: 'MG', bl: 'NW', lat: 51.21667, lon: 6.5 } }, [], reportingH, { stations: { H508: { use: 'report', check: 'report', report: [51.19289, 6.37886], catalog: [51.21667, 6.5] } } })[0];
  add('F2 Prognosepunkt H508 MG West = Meldelage (Katalog lag 8 km neben der A 61), pos: report', h.lat === 51.19289 && h.lon === 6.37886 && h.pos === 'report', JSON.stringify(h));
  add('F3 nicht meldende Station: Katalogposition ohne pos; ohne Tabelle alles wie vorher (Katalog)',
    fq.lat === 51.5 && fq.pos === undefined && without.find((p) => p.id === 'P101').lat === 50.08435 && without.every((p) => p.pos === undefined));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// --- G: client --------------------------------------------------------------------------------------------
{
  const src = readFileSync(join(HERE, '..', 'src', 'road', 'RoadReadout.tsx'), 'utf8');
  add('G1 die Seite nennt beide Kennzeichen in der Quellenzeile der Station',
    src.includes("s.f?.includes('posCatalog')") && src.includes('Position aus dem DWD-Stationskatalog') && src.includes("s.f?.includes('posUnverified')") && src.includes('Position nicht bestätigt'));
}

// --- H: the committed table ---------------------------------------------------------------------------------
{
  const t = readStationPositions();
  add('H0 Tabelle scripts/road/station-positions.json lesbar (schema 1)', !!t, t ? t.builtAt : 'fehlt');
  if (t) {
    const s = t.stations;
    const want = { P101: 'catalog', P301: 'catalog', P142: 'catalog', K441: 'catalog', P670: 'catalog', H508: 'report', H453: 'report', H179: 'report' };
    const bad = Object.entries(want).filter(([id, use]) => s[id]?.use !== use);
    add('H1 reale Fälle der Messung vom 06.10.: Kahl/Ensbrücke/Wildbach/Daleiden/Laabertal → Katalog; MG West/AK Hagen/Bielefelder Berg → Meldung',
      bad.length === 0, bad.map(([id, w]) => `${id}: ${s[id]?.use ?? 'fehlt'} statt ${w}`).join(' '));
    const inconsOf = (rows) => rows.filter(([, e]) => {
      const d = kmBetween(e.report[0], e.report[1], e.catalog[0], e.catalog[1]);
      const onR = e.reportToRoadM != null && e.reportToRoadM <= ROAD_POS_ON_ROAD_M, onC = e.catalogToRoadM != null && e.catalogToRoadM <= ROAD_POS_ON_ROAD_M;
      const unchecked = e.reportToRoadM == null && e.catalogToRoadM == null && e.check === 'unchecked';
      const r = unchecked ? { use: 'report', check: 'unchecked' } : pickPosition({ distKm: d, reportOn: onR, catalogOn: onC });
      return d <= ROAD_POS_SAME_KM || r.use !== e.use || r.check !== e.check;
    });
    const incons = inconsOf(Object.entries(s));
    add('H2 jede Zeile folgt aus ihren eigenen Abständen nach der Regel (> 0,3 km, use/check stimmen)', incons.length === 0, incons.slice(0, 5).map(([id]) => id).join(' '));
    // Negative control: P101 flipped to "report" must be caught by the same predicate.
    const tampered = inconsOf(Object.entries({ ...s, P101: { ...s.P101, use: 'report', check: 'report' } }));
    add('H2b Gegenprobe: eine verfälschte Zeile (P101 → Meldung) wird erkannt', tampered.length === 1 && tampered[0][0] === 'P101');
    const c = Object.values(s).reduce((m, e) => ((m[e.check] = (m[e.check] ?? 0) + 1), m), {});
    add('H3 Zählung im Kopf = Zeilen', ['report', 'catalog', 'both', 'neither', 'unchecked'].every((k) => (t.counts[k] ?? 0) === (c[k] ?? 0)) && t.counts.listed === Object.keys(s).length, JSON.stringify(t.counts));
  }
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
console.log(`\nverify:road-positions ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
