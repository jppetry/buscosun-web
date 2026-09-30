/**
 * f6-live-check.mjs — phase AX, AX-12b (`audit/fusion-ausbau.md` §6g.6): "buscosun Fusion 6" end to end against the REAL cube and
 * the REAL tables at the CDN (data repo `1aaec969`), with the io of the browser's default (`learnedSource`, `climaSource`,
 * `stackSource`, `stage: 'fs'`). No overlay, no bundle: what the browser computes now.
 *   • the tables the client loads from the CDN: atoms present, country entries present, Td country entries absent
 *   • per point (DE/AT/CH): the seven stage lines in calib, the station-value note (country entries at the CH/AT point),
 *     the cloud distribution family (`cloudMix` at a DE point where a stratum carries both atoms)
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-ausbau/f6-live-check.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HINDCAST_ROOT } from '../../scripts/hindcast/lib/common.mjs';
import { terrainOf } from '../../scripts/fusionfit/lib/archiveAdapter.mjs';
import { getPointForecastFromCube, clearCubeForecastCache } from '../../src/pointForecast/cubeSource.ts';
import { httpStore } from '../../src/point/client/store.ts';
import { loadLearned } from '../../src/point/client/learnedPoint.ts';
import { loadStack } from '../../src/point/client/stackPoint.ts';
import { ClimaField } from '../../src/ml/climaField.ts';

const store = httpStore({ timeoutMs: 20_000 });
const L = await loadLearned(store), S = await loadStack(store);
const atoms = L.tables?.atoms ? Object.values(L.tables.atoms) : [];
const stackKeys = S.table ? Object.keys(S.table.entries) : [];
const cc = (v) => stackKeys.filter((k) => { const p = k.split('|'); return p.length === 4 && p[0] === v; }).length;
const md = ['# f6-live-check — „buscosun Fusion 6" gegen den echten Cube und die echten Tabellen am CDN', '', `Stand ${new Date().toISOString().slice(0, 16)}Z. Store = ${store.base}.`, '',
  '## Tabellen, wie der Client sie lädt', '',
  `- fusion.client.json: ${L.tables ? `${L.tables.fitVersion}, ${Object.keys(L.tables.mean).length} Mittel-Einträge, **${atoms.length} Atome** (${atoms.filter((e) => e.status === 'written').length} geschrieben)` : `FEHLT: ${L.notes.join('; ')}`}`,
  `- stack.client.json: ${S.table ? `${S.table.fitVersion}, ${stackKeys.length} Einträge — Landeseinträge T ${cc('t')}, Wind ${cc('ws')}, Böe ${cc('gust')}, **Td ${cc('td')}** (V-AX-15: 0 erwartet)` : `FEHLT: ${S.notes.join('; ')}`}`, ''];
let ok = !!L.tables && atoms.length === 16 && !!S.table && stackKeys.length === 701 && cc('td') === 0 && cc('ws') > 0;

const feat = JSON.parse(readFileSync(join(HINDCAST_ROOT, 'features', 'points.v1.json'), 'utf8'));
const clima = new ClimaField(JSON.parse(readFileSync(new URL('../../public/climaGrid.json', import.meta.url), 'utf8')));
const pick = (pred) => Object.values(feat.byPoint).find(pred);
const POINTS = [
  pick((r) => r.country === 'DE' && /M.NCHEN/i.test(r.name ?? '')) ?? pick((r) => r.country === 'DE' && r.elevM < 600),
  pick((r) => r.country === 'AT' && r.elevM > 500 && r.elevM < 1000),
  pick((r) => r.country === 'CH' && r.elevM < 800),
].filter(Boolean);
const io = { store, terrain: false, clima: async () => clima, obs: null, learnedSource: 'json', climaSource: 'json', stackSource: 'json', stage: 'fs' };
const need = ['learned:hindcast', 'learnedSpeed:hindcast', 'learnedPrecip:hindcast', 'learnedAtPoint:set', 'learnedClouds:hindcast', 'priorShrink:off', 'stationValue:archive'];
md.push('## Punkte', '');
for (const row of POINTS) {
  clearCubeForecastCache();
  const f = await getPointForecastFromCube({ lat: row.lat, lng: row.lon, country: row.country, hours: 336, pointSource: 'cube', includeRadarNowcast: false }, { ...io, terrainOverride: terrainOf(row), elevationM: row.elevM });
  const c = f.cube;
  const keys = c.calib.map((x) => x.split(' — ')[0]);
  const has = need.filter((k) => keys.includes(k)), missing = need.filter((k) => !keys.includes(k));
  const js = JSON.stringify(f);
  const nMix = (js.match(/"kind":"cloudMix"/g) ?? []).length, nCens = (js.match(/"kind":"censoredNormal"/g) ?? []).length;
  const svNote = c.notes.find((n) => /^stationValue: gesetzt/.test(n)) ?? c.notes.find((n) => /^stationValue/.test(n)) ?? '—';
  const countryUsed = /Landeseinträge/.test(svNote);
  const pointOk = missing.length === 0 && (row.country === 'DE' ? nMix > 0 : true) && (row.country !== 'DE' ? countryUsed : true);
  if (!pointOk) ok = false;
  md.push(`### ${row.name?.trim()} (${row.country}, ${row.elevM} m) — ${pointOk ? 'OK' : 'FEHLER'}`, '',
    `- Stufe: ${has.length} von 7 Zeilen in calib${missing.length ? ` — FEHLT ${missing.join(', ')}` : ''}`,
    `- Stationswert: ${svNote.slice(0, 260)}`,
    `- Bewölkung: ${nMix} Verteilungen \`cloudMix\`, ${nCens} \`censoredNormal\` im ganzen Produkt${row.country === 'DE' ? ' (DE: Atome erwartet)' : ' (Atome sind an DE-Strata gelernt; hier je nach Stratum)'}`,
    `- T: ${[1, 6, 24, 48, 120].map((h) => `+${h} h ${f.hours?.[h]?.temperature?.toFixed?.(1) ?? '—'} °C`).join(' · ')}`,
    `- Zeiten: gesamt ${c.timing.totalMs} ms, Rechnung ${c.timing.algoMs} ms`, '');
}
md.push(ok ? '**OK** — der Browser rechnet „buscosun Fusion 6": Atome und Landesparameter kommen aus dem CDN an und wirken.' : '**FEHLER** — siehe oben.');
writeFileSync(new URL('./f6-live-check.md', import.meta.url), md.join('\n'));
console.log(md.join('\n'));
process.exit(ok ? 0 : 1);
