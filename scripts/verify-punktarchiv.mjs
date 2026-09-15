/**
 * verify-punktarchiv.mjs — Gate GPA1 (PA1), netzfrei.
 *
 *   npm run verify:punktarchiv
 *
 * Prüft die Form des Punktarchivs, bevor ein Byte davon gepusht wird: Schema-Rundweg,
 * Skalen und Sentinel, Lead-Raster gegen die Cube-Achse, Punktliste (eindeutig, DACH, DEM
 * endlich), Merge-Idempotenz, As-of-Wächter mit Negativkontrolle, Node-Shim, und die
 * Workflow-Vorlage (Slot nach dem letzten t1-Bau, eigene Concurrency-Gruppe, kein
 * Force-Push, kein Push aus dem Sammler selbst).
 */
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { punktarchivSelfTest, tierForLead, LIVE_SCALES, TRUTH_SCALES, SENTINEL, encodeValue, ARCHIVE_SCHEMA } from './punktarchiv/lib/punktarchiv.mjs';
import { truthSelfTest } from './punktarchiv/lib/truth.mjs';
import { nodeShimsSelfTest } from './punktarchiv/lib/nodeShims.mjs';
import { pointsSelfTest, selectPoints, countryOfWmo, inCubeBox } from './punktarchiv/points.mjs';
import { TIERS, CUBE_STEP_COUNT } from '../src/point/cubeFormat.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, total = 0;
const add = (name, ok, detail) => { total++; if (ok) passed++; console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
const suite = (label, r) => { for (const c of r.checks) add(`(${label}) ${c.name}`, c.ok, c.detail); };

// (1) Bibliothek, Wahrheit, Punkte, Shim — die Selbsttests der Module.
{
  const tmp = join(ROOT, 'data', `_verify-punktarchiv-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  suite('lib', punktarchivSelfTest(tmp));
  rmSync(tmp, { recursive: true, force: true });
  suite('truth', truthSelfTest());
  suite('points', pointsSelfTest());
  suite('shim', await nodeShimsSelfTest());
}

// (2) Lead-Raster: die Archiv-Achse ist GENAU die Cube-Achse — abgeleitet aus TIERS, nicht abgeschrieben.
{
  const fromTiers = new Map();
  for (const t of TIERS) for (const h of t.leadHours) fromTiers.set(h, t.id);
  let agree = 0, disagree = [];
  for (let h = 0; h <= 340; h++) {
    const a = tierForLead(h), b = fromTiers.get(h) ?? null;
    if (a === b) agree++; else disagree.push(`${h}:${a}≠${b}`);
  }
  add('(2) tierForLead stimmt an allen 341 Stunden mit TIERS[].leadHours überein', disagree.length === 0, disagree.slice(0, 5).join(' '));
  add('(2) die Achse hat CUBE_STEP_COUNT belegte Stunden und die zwei bekannten Lücken (49–50, 121–125)',
    [...fromTiers.keys()].length === CUBE_STEP_COUNT && tierForLead(49) === null && tierForLead(50) === null && tierForLead(121) === null && tierForLead(125) === null, `${fromTiers.size}`);
}

// (3) Skalen: kein Sentinel-Zusammenstoß, jede Live- und Wahrheits-Spalte hat Skala, Versatz, Einheit.
{
  const all = [...Object.entries(LIVE_SCALES), ...Object.entries(TRUTH_SCALES)];
  add('(3) jede Skala trägt scale > 0, offset und unit', all.every(([, s]) => s.scale > 0 && Number.isFinite(s.offset) && typeof s.unit === 'string'), `${all.length} Spalten`);
  add('(3) der größte plausible Wert je Spalte bleibt unter dem Sentinel-Betrag (kein stilles Klemmen)',
    encodeValue(60, LIVE_SCALES.temperature) < 32767 && encodeValue(1100, TRUTH_SCALES.p) < 32767 && encodeValue(100, LIVE_SCALES.precipitation) < 32767);
  add('(3) Sentinel ist -32768 wie im Cube (MISSING), Schema 1', SENTINEL === -32768 && ARCHIVE_SCHEMA === 1);
}

// (4) Die materialisierte Punktliste (falls gebaut): eindeutig, DACH, in der Box, DEM endlich.
{
  const p = join(ROOT, 'scripts/punktarchiv/points.json');
  if (existsSync(p)) {
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    const ids = doc.points.map((x) => x.id);
    add('(4) points.json: Schema 1, gebaut mit Datum, Zählwerte je Land', doc.schema === 1 && doc.kind === 'punktarchiv/points' && !!doc.builtAt && doc.counts.byCountry.DE + doc.counts.byCountry.AT + doc.counts.byCountry.CH === doc.points.length, `${doc.points.length} Punkte (DE ${doc.counts.byCountry.DE} · AT ${doc.counts.byCountry.AT} · CH ${doc.counts.byCountry.CH})`);
    add('(4) points.json: Kennungen eindeutig', new Set(ids).size === ids.length);
    add('(4) points.json: Positionen eindeutig (3 Dezimalen)', new Set(doc.points.map((x) => `${x.lat.toFixed(3)}/${x.lon.toFixed(3)}`)).size === ids.length);
    add('(4) points.json: jeder Punkt liegt in der Cube-Box und in DE/AT/CH', doc.points.every((x) => inCubeBox(x.lat, x.lon) && countryOfWmo(x.id) === x.country));
    add('(4) points.json: jeder Punkt hat eine endliche DEM-Höhe', doc.points.every((x) => Number.isFinite(x.demM)));
    add('(4) points.json: jeder Punkt hat POI-Wahrheit; TAWES nur in AT, SMN nur in CH', doc.points.every((x) => x.truth.poi === true && (!x.truth.tawes || x.country === 'AT') && (!x.truth.smn || x.country === 'CH')),
      `TAWES ${doc.counts.withTawes} · SMN ${doc.counts.withSmn}`);
    add('(4) points.json: DEM und Katalog-Höhe weichen im Median < 100 m ab (Verortung)', (() => {
      const d = doc.points.map((x) => Math.abs(x.demM - x.elev)).sort((a, b) => a - b);
      return d.length ? d[Math.floor(d.length / 2)] < 100 : false;
    })());
    // Negativkontrolle an der reinen Auswahl: ein Duplikat und ein Punkt außerhalb fallen.
    const sel = selectPoints([...doc.points.slice(0, 3), doc.points[0], { id: '10001', name: 'ROM', lat: 41.9, lon: 12.5, elev: 20 }], new Set([...ids, '10001']));
    add('(4) Negativkontrolle: Duplikat und Punkt außerhalb der Box fallen aus der Auswahl', sel.points.length === 3 && sel.dropped.dupId === 1 && sel.dropped.outsideBox === 1);
  } else {
    console.log('  ⚠ scripts/punktarchiv/points.json nicht gebaut — Punktlisten-Prüfungen uebersprungen (npm run punktarchiv:points)');
  }
}

// (5) Der Sammler pusht nie und importiert den Publisher nicht.
{
  const src = readFileSync(join(ROOT, 'scripts/punktarchiv/collect.mjs'), 'utf8');
  add('(5) collect.mjs ruft kein git push/commit auf und importiert publish-point.mjs nicht', !/git\s+(push|commit)/.test(src) && !/publish-point/.test(src));
  add('(5) collect.mjs liest BEIDE Pfade: src/point/client UND getPointForecast', /point\/client\/cubePoint\.ts/.test(src) && /getPointForecast/.test(src));
  add('(5) collect.mjs installiert den Node-Shim VOR dem Import des Live-Pfads', src.indexOf('installNodeShims()') < src.indexOf("from '../../src/pointForecast/pointForecast.ts'"));
  add('(5) collect.mjs benennt die Grenzen des Live-Pfads (Radar, DEM-Shim, UV-Umschreibung, GFS-Schwanz) als caveats', /KEIN Radar-Nowcast/.test(src) && /nodeShims/.test(src) && /_dwd_opendata/.test(src) && /GFS-Schwanz/.test(src));
  add('(5) collect.mjs serialisiert über serialiseSlot (As-of-Wächter) und schreibt über mergeSlot (append-only)', /serialiseSlot\(slot\)/.test(src) && /mergeSlot\(outRoot/.test(src));
}

// (6) Workflow-Vorlage: Slot NACH dem letzten t1-Bau des Tages und vor Mitternacht, eigene Gruppe, kein Force-Push.
{
  const wfPath = join(ROOT, 'scripts/punktarchiv-repo/workflow-punktarchiv.yml');
  const pointWf = readFileSync(join(ROOT, 'scripts/repack-repo/workflow-point.yml'), 'utf8');
  const cronsOf = (text) => text.split(/\r?\n/).map((l) => /-\s*cron:\s*'([^']+)'/.exec(l)?.[1]).filter(Boolean)
    .flatMap((spec) => { const [min, hrs] = spec.split(/\s+/); return hrs.split(',').filter((h) => /^\d+$/.test(h)).map((h) => +h * 60 + +min); });
  const t1Slots = cronsOf(pointWf.split('\n').filter((l) => /# t1/.test(l)).join('\n'));
  const lastT1 = Math.max(...t1Slots);
  const T1_JOB_MAX_MIN = 20;   // JOB_MAX_MIN_BY_TIER.t1 im Punkt-Verifier
  if (existsSync(wfPath)) {
    const wf = readFileSync(wfPath, 'utf8');
    const slots = cronsOf(wf);
    add('(6) die Vorlage hat genau EINEN täglichen Slot', slots.length === 1, slots.map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`).join());
    add(`(6) der Slot liegt nach dem letzten t1-Bau des Tages (${Math.floor(lastT1 / 60)}:${String(lastT1 % 60).padStart(2, '0')} + ${T1_JOB_MAX_MIN} min + 5 min CDN) und vor Mitternacht UTC`,
      slots.length === 1 && slots[0] >= lastT1 + T1_JOB_MAX_MIN + 5 && slots[0] < 24 * 60, `${slots[0] - lastT1} min nach dem t1-Slot`);
    add('(6) Negativkontrolle: ein Slot um 22:45 läge im t1-Bau und fiele durch', !(22 * 60 + 45 >= lastT1 + T1_JOB_MAX_MIN + 5));
    add('(6) eigene Concurrency-Gruppe (nicht `point`, nicht `repack-build`, nicht `radar-mirror`), kein cancel-in-progress',
      /concurrency:\s*[\s\S]*?group:\s*punktarchiv/.test(wf) && !/group:\s*point\s*$/m.test(wf) && /cancel-in-progress:\s*false/.test(wf));
    const wfCode = wf.replace(/#[^\n]*/g, '');   // Kommentare raus — dort darf „PAT" als Wort stehen
    add('(6) kein Force-Push, Push mit Wiederholung (pull --rebase) und Standard-Token (kein secrets.*)', !/push[^\n]*--force/.test(wfCode) && /pull --rebase/.test(wfCode) && !/secrets\./.test(wfCode));
    add('(6) der Job klont buscosun-web sparse inkl. public/climaGrid.json (buscosun Fusion verweigert ohne Klimatologie)', /sparse-checkout set --no-cone[^\n]*public\/climaGrid\.json/.test(wf));
    add('(6) der Job ruft collect.mjs mit POINTARCHIVE_OUT auf das Archiv-Repo und nie auf buscosun-data', /POINTARCHIVE_OUT/.test(wf) && /scripts\/punktarchiv\/collect\.mjs/.test(wf) && !/buscosun-data/.test(wf.replace(/#[^\n]*/g, '')));
    add('(6) timeout-minutes gesetzt und ≤ 120', (() => { const m = /timeout-minutes:\s*(\d+)/.exec(wf); return !!m && Number(m[1]) <= 120; })());
  } else {
    add('(6) Workflow-Vorlage scripts/punktarchiv-repo/workflow-punktarchiv.yml vorhanden', false);
  }
}

console.log(`\n${passed}/${total} Prüfungen bestanden.`);
process.exitCode = passed === total ? 0 : 1;
