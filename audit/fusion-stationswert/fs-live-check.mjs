/**
 * fs-live-check.mjs — phase FS, the newest stage end to end: `getPointForecastFromCube` against the REAL cube at the CDN, with
 * the io of the browser's default (`learnedSource`, `climaSource`, `stackSource`, `stage: 'fs'`).
 *   A  the store as it is today (the three files are not in the data repo ⇒ the path must run as before and say so)
 *   B  the same store with the publish bundle laid over it (what the browser gets once the files are in the data repo)
 * Builds the publish bundle first and validates every file with the client's own readers.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-stationswert/fs-live-check.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { HINDCAST_ROOT } from '../../scripts/hindcast/lib/common.mjs';
import { terrainOf } from '../../scripts/fusionfit/lib/archiveAdapter.mjs';
import { getPointForecastFromCube, clearCubeForecastCache } from '../../src/pointForecast/cubeSource.ts';
import { httpStore, memoryStore } from '../../src/point/client/store.ts';
import { loadLearned } from '../../src/point/client/learnedPoint.ts';
import { loadClimaProduct } from '../../src/point/client/climaPoint.ts';
import { loadStack } from '../../src/point/client/stackPoint.ts';
import { POINT_LEARNED_PATH, POINT_CLIMA_PATH, POINT_STACK_PATH } from '../../src/point/cubeFormat.ts';
import { ClimaField } from '../../src/ml/climaField.ts';

const BUNDLE = join(HINDCAST_ROOT, 'publish', '2026-09-28-fs');
const SRC = {
  [POINT_LEARNED_PATH]: join(HINDCAST_ROOT, 'fit', '2026-09-27-fx5e', 'fusion.client.json'),
  [POINT_CLIMA_PATH]: join(HINDCAST_ROOT, 'product', '2026-09-27', 'clima', 'v1', 'stations.json'),
  [POINT_STACK_PATH]: join(HINDCAST_ROOT, 'fit', '2026-09-28-fs', 'stack.archive.json'),
};
const files = new Map();
const sums = [];
for (const [rel, src] of Object.entries(SRC)) {
  const b = readFileSync(src);
  const dst = join(BUNDLE, rel);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  files.set(rel, new Uint8Array(b));
  sums.push({ rel, src, bytes: b.length, gz: gzipSync(b).length, sha256: createHash('sha256').update(b).digest('hex') });
}
const mem = memoryStore(files);
const L = await loadLearned(mem), C = await loadClimaProduct(mem), S = await loadStack(mem);
const valid = !!L.tables && !!C.product && !!S.table;
writeFileSync(join(BUNDLE, 'SHA256SUMS'), sums.map((s) => `${s.sha256}  ${s.rel}`).join('\n') + '\n');
console.log(`Paket ${BUNDLE}`);
for (const s of sums) console.log(`  ${s.rel}  ${s.bytes} B (${s.gz} B gz)  sha256 ${s.sha256.slice(0, 16)}…`);
console.log(`  Leser des Clients: Tabellen ${L.tables ? 'gültig' : L.notes.join('; ')} · Klimatologieprodukt ${C.product ? 'gültig' : C.notes.join('; ')} · Stationswert ${S.table ? 'gültig' : S.notes.join('; ')}`);
if (!valid) process.exit(1);

// the store of the browser with the bundle laid over it
const overlay = (base) => {
  const wrap = (st) => ({
    base: st.base, stats: st.stats,
    bytes: async (path, o) => files.get(path.replace(/^\/+/, '')) ?? st.bytes(path, o),
    json: async (path, o) => { const b = files.get(path.replace(/^\/+/, '')); return b ? JSON.parse(new TextDecoder().decode(b)) : st.json(path, o); },
    ...(st.withBase ? { withBase: (b) => wrap(st.withBase(b)) } : {}),
  });
  return wrap(base);
};
const feat = JSON.parse(readFileSync(join(HINDCAST_ROOT, 'features', 'points.v1.json'), 'utf8'));
const clima = new ClimaField(JSON.parse(readFileSync(new URL('../../public/climaGrid.json', import.meta.url), 'utf8')));
const pick = (pred) => Object.values(feat.byPoint).find(pred);
const POINTS = [
  pick((r) => r.country === 'DE' && /M.NCHEN/i.test(r.name ?? '')) ?? pick((r) => r.country === 'DE' && r.elevM < 600),
  pick((r) => r.country === 'AT' && r.elevM > 500 && r.elevM < 1000),
  pick((r) => r.country === 'CH' && r.elevM > 1200),
].filter(Boolean);
const io = (store) => ({ store, terrain: false, clima: async () => clima, obs: null, learnedSource: 'json', climaSource: 'json', stackSource: 'json', stage: 'fs' });
const md = ['# fs-live-check — die neueste Stufe gegen den echten Cube', '', `Stand ${new Date().toISOString().slice(0, 16)}Z. A = Daten-Repo wie heute, B = mit dem Veröffentlichungspaket.`, ''];
let ok = true;
for (const row of POINTS) {
  const opts = { lat: row.lat, lng: row.lon, country: row.country, hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  const out = {};
  for (const [name, store] of [['A', httpStore({ timeoutMs: 20_000 })], ['B', overlay(httpStore({ timeoutMs: 20_000 }))]]) {
    clearCubeForecastCache();
    const f = await getPointForecastFromCube(opts, { ...io(store), terrainOverride: terrainOf(row), elevationM: row.elevM });
    out[name] = f;
  }
  const a = out.A.cube, b = out.B.cube;
  const keys = (c) => c.calib.map((x) => x.split(' — ')[0]).filter((k) => /^(learned|learnedClima|learnedSpeed|learnedPrecip|learnedAtPoint|learnedClouds|priorShrink|stationValue)/.test(k));
  const stageA = a.notes.filter((n) => /^stage:fs|^learned: |^stationValue: /.test(n)), stageB = b.notes.filter((n) => /^stage:fs|^stationValue: /.test(n));
  const need = ['learned:hindcast', 'learnedSpeed:hindcast', 'learnedPrecip:hindcast', 'learnedAtPoint:set', 'learnedClouds:hindcast', 'priorShrink:off', 'stationValue:archive'];
  const has = need.every((k) => keys(b).includes(k)), none = keys(a).filter((k) => k !== 'learned:absent').length === 0;
  if (!has || !none) ok = false;
  const hrs = [1, 6, 24, 48, 120].map((h) => { const x = out.A.hours?.[h], y = out.B.hours?.[h]; return `+${h} h ${x?.temperature?.toFixed?.(1) ?? '—'} → ${y?.temperature?.toFixed?.(1) ?? '—'} °C`; });
  md.push(`## ${row.name?.trim()} (${row.country}, ${row.elevM} m)`, '',
    `- **A (heute):** Stufe ${none ? 'wirkt nicht' : 'WIRKT — Fehler'}; ${stageA.map((n) => n.slice(0, 150)).join(' · ')}`,
    `- **B (mit Paket):** ${has ? 'alle sieben Zeilen der Stufe in calib' : `FEHLT: ${need.filter((k) => !keys(b).includes(k)).join(', ')}`}; ${stageB.map((n) => n.slice(0, 190)).join(' · ')}`,
    `- T (A → B): ${hrs.join(' · ')}`, `- Zeiten B: gesamt ${b.timing.totalMs} ms, Rechnung ${b.timing.algoMs} ms, Ausgabe ${b.timing.outputMs} ms (A: Rechnung ${a.timing.algoMs} ms)`, '');
}
md.push(ok ? '**OK** — ohne die Dateien rechnet der Pfad wie bisher und nennt es; mit dem Paket trägt jede Abfrage die neueste Stufe.' : '**FEHLER**');
writeFileSync(new URL('./fs-live-check.md', import.meta.url), md.join('\n'));
console.log(md.join('\n'));
process.exit(ok ? 0 : 1);
