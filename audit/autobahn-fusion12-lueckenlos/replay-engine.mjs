// V-AF-9, verification C (not in CI): buscosun Fusion (stage of the newest stand, the producer's chain = getPointForecastFromCube →
// fuseCubePoint) on the SAME cube bundle of a local clone of the data repo, with the measurements of every saved version of
// obs/v1/latest.json, clock = builtAt of the version — the reader before V-AF-9 against the per-variable reader, at 20 axis
// points (the axis point nearest to each of 20 German cities).
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/autobahn-fusion12-lueckenlos/replay-engine.mjs <data clone> [--only=<dir with latest.json + stations.json>,<window label>]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseObsCatalog, parseObsLatest, obsStoreOf, nearestObsStations, OBS_DENSE_MAX } from '../../src/sources/obsStore.ts';
import { cubeObsOf } from '../../src/pointForecast/cubeSource.ts';
import { FUSION_NAME } from '../../src/pointForecast/fusion/fusionRelease.ts';
import { COMMITS, readFull } from './obs-fixtures/make-fixtures.mjs';
import * as P from '../../scripts/road/road-forecast.mjs';
import { installNodeShims } from '../../scripts/punktarchiv/lib/nodeShims.mjs';

installNodeShims();
const [, , dataDir] = process.argv;
// --only=<dir>,<label>: ONE further snapshot of the product instead of the saved versions (e.g. the live product at the top of an hour)
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',') ?? null;
const SOURCES = only ? [[only[0], '', only[1] ?? 'live']] : COMMITS;
// --ancpre=0: the engine before V-AF-10 (the anchor without the cube steps before the axis start) — the counter-probe of §8.4
const ancpreOff = process.argv.includes('--ancpre=0');
const readDoc = (sha, kind) => (only ? JSON.parse(readFileSync(join(sha, kind + '.json'), 'utf8')) : JSON.parse(readFull(sha.slice(0, 7) + '.' + kind + '.json')));
const fcDir = join(dataDir, 'road/fc/v1');
const all = JSON.parse(readFileSync(join(fcDir, 'static/points.json'), 'utf8')).points.filter((p) => p.kind === 'axis');
const geoDoc = JSON.parse(readFileSync(join(fcDir, 'static/geo.json'), 'utf8'));
const CITIES = [['München', 48.137, 11.575], ['Berlin', 52.52, 13.405], ['Hamburg', 53.551, 9.994], ['Frankfurt', 50.11, 8.682], ['Stuttgart', 48.776, 9.183],
  ['Dresden', 51.05, 13.737], ['Köln', 50.938, 6.96], ['Leipzig', 51.34, 12.375], ['Nürnberg', 49.453, 11.077], ['Hannover', 52.375, 9.732],
  ['Bremen', 53.079, 8.802], ['Rostock', 54.092, 12.099], ['Freiburg', 47.999, 7.842], ['Erfurt', 50.985, 11.03], ['Kassel', 51.313, 9.497],
  ['Saarbrücken', 49.24, 6.997], ['Dortmund', 51.514, 7.465], ['Magdeburg', 52.131, 11.64], ['Regensburg', 49.013, 12.102], ['Kiel', 54.323, 10.123]];
const km = (a, b, c, d) => Math.hypot((d - b) * 111.2 * Math.cos(a * Math.PI / 180), (c - a) * 111.2);
const points = CITIES.map(([name, la, lo]) => ({ city: name, ...all.reduce((best, p) => (km(la, lo, p.lat, p.lon) < km(la, lo, best.lat, best.lon) ? p : best)) }));

const store0 = P.dirStore(dataDir), cache = P.geoBackend(geoDoc);
const H = 3_600_000;
const VALID = [Date.parse('2026-10-10T11:00:00Z'), Date.parse('2026-10-10T12:00:00Z')];
const stampsOf = (obs) => { const m = {}; for (const o of obs) if (o.temperature != null) { const k = new Date(o.validAtMs).toISOString().slice(11, 16); m[k] = (m[k] ?? 0) + 1; } return m; };
const versions = [];
for (const [sha, , window] of SOURCES) {
  const s7 = only ? 'live' : sha.slice(0, 7);
  const latest = parseObsLatest(readDoc(sha, 'latest'));
  const nowMs = Date.parse(latest.builtAt);
  const obsStore = obsStoreOf(parseObsCatalog(readDoc(sha, 'stations')), latest, nowMs);
  const io = { ...P.makeIo({ store: store0, cache, nowMs }), ...(ancpreOff ? { anchorBeforeAxis: false } : {}) };
  const res = { s7, window: window.replace(/ \(.*/, ''), at: latest.builtAt.slice(11, 16), old: [], neu: [] };
  for (const p of points) {
    for (const [k, opt] of [['old', {}], ['neu', { perVar: 'split' }]]) {
      const obs = cubeObsOf(nearestObsStations(obsStore, p.lat, p.lon, 'DE', { max: OBS_DENSE_MAX, nowMs, dense: true, ...opt }), nowMs);
      const r = await P.computePoint(p, io, nowMs, obs);
      if (r.error) { res[k].push({ error: r.error }); continue; }
      const note = r.fc.cube.notes.find((n) => n.startsWith('anchor: ')) ?? '';
      const m = /^anchor: (\d+) Paar\(e\)/.exec(note);
      const tAt = (ms) => r.fc.hours.find((h) => h.timestamp.getTime() === ms)?.temperature ?? null;
      res[k].push({ pairsT: m ? Number(m[1]) : 0, note: note.slice(0, 110), stage: r.stage, t: VALID.map(tAt), hours: JSON.stringify(r.fc.hours), obsN: obs.length, tStamps: stampsOf(obs), sv: (r.fc.cube.notes.find((n) => n.startsWith('stationValue: ')) ?? '').slice(0, 160) });
    }
  }
  versions.push(res);
  console.error(`… ${s7} ${res.at} gerechnet`);
}

console.log(`${FUSION_NAME}${ancpreOff ? ' mit anchorBeforeAxis: false (Motor vor V-AF-10)' : ''}, ${points.length} Achspunkte (nächster Achspunkt je Stadt), dichter Satz, derselbe Cube (Klon ${dataDir}); T-Paare = Zahl im Anker-Vermerk des Motors\n`);
console.log('| Version | Fenster | Punkte mit T-Paaren > 0: alt | neu | T-Paare je Punkt (Mittel) alt | neu | Vorhersage alt = neu (alle Stunden byte-gleich) | Fehler |');
console.log('|---|---|---|---|---|---|---|---|');
for (const v of versions) {
  const ok = (a) => a.filter((x) => !x.error);
  const o = ok(v.old), n = ok(v.neu);
  const same = v.old.filter((x, i) => !x.error && !v.neu[i].error && x.hours === v.neu[i].hours).length;
  const mean = (a) => (a.reduce((s, x) => s + x.pairsT, 0) / Math.max(1, a.length)).toFixed(1);
  console.log(`| \`${v.s7}\` ${v.at} | ${v.window} | ${o.filter((x) => x.pairsT > 0).length}/${points.length} | ${n.filter((x) => x.pairsT > 0).length}/${points.length} | ${mean(o)} | ${mean(n)} | ${same}/${points.length} | ${v.old.filter((x) => x.error).length + v.neu.filter((x) => x.error).length} |`);
}
// good windows: where the two readers still differ, and by which measurements (stamps of the temperatures handed to the engine)
for (const v of versions.filter((x) => x.window.startsWith('good'))) {
  const diff = points.map((p, pi) => ({ p, o: v.old[pi], n: v.neu[pi] })).filter((x) => !x.o.error && !x.n.error && x.o.hours !== x.n.hours);
  for (const d of diff) console.log(`\nabweichend im guten Fenster ${v.at}: ${d.p.city} — alt ${d.o.note} · T-Stempel ${JSON.stringify(d.o.tStamps)} | neu ${d.n.note} · T-Stempel ${JSON.stringify(d.n.tStamps)}`);
}
console.log(`\nStufe = ${FUSION_NAME} an allen Punkten: ${versions.every((v) => [...v.old, ...v.neu].every((x) => x.error || x.stage)) ? 'ja' : 'NEIN'}`);

// continuity: the temperature at a FIXED valid time between consecutive versions
for (const [vi, label] of [[0, '11:00 UTC'], [1, '12:00 UTC']]) {
  console.log(`\nStetigkeit — Temperatur für ${label} zwischen aufeinanderfolgenden Versionen (|Δ| in K), alt gegen neu:`);
  console.log('| Übergang | größter Sprung alt | größter Sprung neu | Mittel alt | Mittel neu | Punkte mit Sprung neu > alt (+0,005 K) |');
  console.log('|---|---|---|---|---|---|');
  let worstOld = 0, worstNew = 0, worse = 0;
  for (let i = 1; i < versions.length; i++) {
    const a = versions[i - 1], b = versions[i];
    const d = (k) => points.map((_, pi) => (a[k][pi].error || b[k][pi].error || a[k][pi].t[vi] == null || b[k][pi].t[vi] == null ? null : Math.abs(b[k][pi].t[vi] - a[k][pi].t[vi])));
    const dOld = d('old'), dNew = d('neu');
    const mx = (x) => Math.max(0, ...x.filter((y) => y != null)), mean = (x) => { const y = x.filter((z) => z != null); return y.reduce((s, z) => s + z, 0) / Math.max(1, y.length); };
    const w = dNew.filter((x, pi) => x != null && dOld[pi] != null && x > dOld[pi] + 0.005).length;
    worstOld = Math.max(worstOld, mx(dOld)); worstNew = Math.max(worstNew, mx(dNew)); worse += w;
    console.log(`| ${a.at} ${a.window} → ${b.at} ${b.window} | ${mx(dOld).toFixed(2)} | ${mx(dNew).toFixed(2)} | ${mean(dOld).toFixed(3)} | ${mean(dNew).toFixed(3)} | ${w} |`);
  }
  console.log(`größter Sprung über alle Übergänge: alt ${worstOld.toFixed(2)} K, neu ${worstNew.toFixed(2)} K; Übergänge × Punkte mit neu > alt: ${worse}`);
  // per point: the largest jump over all transitions
  const perPoint = points.map((p, pi) => {
    let o = 0, n = 0;
    for (let i = 1; i < versions.length; i++) for (const [k, set] of [['old', (x) => { o = Math.max(o, x); }], ['neu', (x) => { n = Math.max(n, x); }]]) {
      const x = versions[i - 1][k][pi], y = versions[i][k][pi];
      if (!x.error && !y.error && x.t[vi] != null && y.t[vi] != null) set(Math.abs(y.t[vi] - x.t[vi]));
    }
    return { city: p.city, id: p.id, o, n };
  });
  console.log(`je Punkt (größter Sprung alt / neu, K): ${perPoint.map((x) => `${x.city} ${x.o.toFixed(2)}/${x.n.toFixed(2)}`).join(', ')}`);
  console.log(`Gate C(iii) — größter Sprung je Punkt neu ≤ alt: ${perPoint.filter((x) => x.n <= x.o + 0.005).length}/${perPoint.length} Punkte`);
}
console.log('\nBeispiel München (Anker-Vermerk je Version, alt | neu):');
for (const v of versions) console.log(`  ${v.at} ${v.window}: ${v.old[0].error ?? v.old[0].note} | ${v.neu[0].error ?? v.neu[0].note}`);
console.log('\nStationswert-Vermerk München (neu):');
for (const v of versions) console.log(`  ${v.at}: ${v.neu[0].sv || '—'}`);
