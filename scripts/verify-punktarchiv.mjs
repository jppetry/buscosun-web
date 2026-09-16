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
import { pointsSelfTest, selectPoints, countryOfWmo, inCubeBox, COLOCATE, DACH, PROFILE_OF } from './punktarchiv/points.mjs';
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
    const cnt = (k) => doc.points.filter((x) => x.country === k).length;
    add('(4) points.json: Schema 1, gebaut mit Datum, Zählwerte je Land summieren sich zur Punktzahl', doc.schema === 1 && doc.kind === 'punktarchiv/points' && !!doc.builtAt
      && Object.values(doc.counts.byCountry).reduce((a, b) => a + b, 0) === doc.points.length && Object.entries(doc.counts.byCountry).every(([k, v]) => cnt(k) === v),
      `${doc.points.length} Punkte (${Object.entries(doc.counts.byCountry).map(([k, v]) => `${k} ${v}`).join(' · ')})`);
    add('(4) points.json: Kennungen eindeutig', new Set(ids).size === ids.length);
    add('(4) points.json: Positionen eindeutig (3 Dezimalen)', new Set(doc.points.map((x) => `${x.lat.toFixed(3)}/${x.lon.toFixed(3)}`)).size === ids.length);
    // Land: ohne Netzpaar aus dem WMO-BEREICH der Kennung (nicht dem Block — PA1 nannte Prag „AT"); mit Netzpaar aus dem Netz (TAWES ⇒ AT, SMN ⇒ CH/LI).
    add('(4) points.json: jeder Punkt liegt in der Cube-Box; Land aus dem WMO-Bereich bzw. aus dem Netz der Messstelle', doc.points.every((x) => inCubeBox(x.lat, x.lon)
      && (x.mosmix ? (x.truth.tawes ? x.country === 'AT' : x.truth.smn ? ['CH', 'LI'].includes(x.country) : false) : countryOfWmo(x.id) === x.country)));
    add('(4) points.json: jeder Punkt hat eine endliche DEM-Höhe', doc.points.every((x) => Number.isFinite(x.demM)));
    add('(4) points.json: jeder Punkt hat mindestens eine Wahrheit; TAWES nur in AT, SMN nur in CH/LI; Punkte ohne POI tragen ein Katalog-Paar (mosmix)',
      doc.points.every((x) => (x.truth.poi === true || x.truth.tawes || x.truth.smn) && (!x.truth.tawes || x.country === 'AT') && (!x.truth.smn || ['CH', 'LI'].includes(x.country)) && (x.truth.poi === true || !!x.mosmix)),
      `POI ${doc.counts.withPoi} · TAWES ${doc.counts.withTawes} · SMN ${doc.counts.withSmn} · nur Netz ${doc.counts.networkOnly}`);
    add('(4) points.json: DEM und Punkthöhe weichen im Median < 100 m ab (Verortung)', (() => {
      const d = doc.points.map((x) => Math.abs(x.demM - x.elev)).sort((a, b) => a - b);
      return d.length ? d[Math.floor(d.length / 2)] < 100 : false;
    })());
    // PA2 (§9.3): DE unverändert, Nachbarn getrennt, AT/CH-Dichte, Paar-Grenzen.
    const de = doc.points.filter((x) => x.country === 'DE');
    add('(4) PA2: DE unverändert — nur POI, Katalogposition (kein mosmix-Feld), Profil DE, WMO 10000–10999', de.length > 0 && de.every((x) => x.truth.poi === true && !x.truth.tawes && !x.truth.smn && !x.mosmix && x.profile === 'DE' && countryOfWmo(x.id) === 'DE'), `${de.length} Punkte`);
    const nb = doc.points.filter((x) => !DACH.includes(x.country));
    add('(4) PA2: Nachbarn (CZ/SK/DK/NL/BE/LU) nur mit POI, ohne Netz, im Länderprofil von PA1 (Block 11 ⇒ AT, Block 06 ⇒ CH)',
      nb.every((x) => x.truth.poi === true && !x.truth.tawes && !x.truth.smn && x.profile === PROFILE_OF[x.country] && x.profile === (x.id.startsWith('11') ? 'AT' : 'CH')), `${nb.length} Punkte`);
    add('(4) PA2 (GPA2/E-F-9): ≥ 60 AT-Punkte mit TAWES und ≥ 40 CH-Punkte mit SMN — mindestens die DE-Dichte (208 Punkte auf 357 000 km² ⇒ AT 49, CH 24)',
      doc.points.filter((x) => x.country === 'AT' && x.truth.tawes).length >= 60 && doc.points.filter((x) => x.country === 'CH' && x.truth.smn).length >= 40,
      `AT ${doc.points.filter((x) => x.country === 'AT' && x.truth.tawes).length} · CH ${doc.points.filter((x) => x.country === 'CH' && x.truth.smn).length}`);
    const pairs = doc.points.filter((x) => x.mosmix);
    add(`(4) PA2: jedes Katalog-Paar hält die gemessenen Grenzen (gleiche Kennung ≤ ${COLOCATE.idMaxKm} km, sonst ≤ ${COLOCATE.maxKm} km, |Δz| ≤ ${COLOCATE.maxDzM} m) und nennt die Katalogstation mit ihrer Kennung`,
      pairs.length > 0 && pairs.every((x) => x.mosmix.id === x.id && Math.abs(x.mosmix.dzM) <= COLOCATE.maxDzM && x.mosmix.distanceKm <= (x.mosmix.match === 'id' ? COLOCATE.idMaxKm : COLOCATE.maxKm)),
      `${pairs.length} Paare (id ${pairs.filter((x) => x.mosmix.match === 'id').length} · Ort ${pairs.filter((x) => x.mosmix.match === 'colocated').length})`);
    const netIds = doc.points.flatMap((x) => [x.truth.tawes && `tawes:${x.truth.tawes}`, x.truth.smn && `smn:${x.truth.smn}`].filter(Boolean));
    add('(4) PA2: keine TAWES- oder SMN-Station trägt zwei Punkte', new Set(netIds).size === netIds.length, `${netIds.length} Netzstationen`);

    // Negativkontrollen an der reinen Auswahl.
    const sel = selectPoints([...doc.points.slice(0, 3), doc.points[0], { id: '10001', name: 'ROM', lat: 41.9, lon: 12.5, elev: 20 }], new Set([...ids, '10001']));
    add('(4) Negativkontrolle: Duplikat und Punkt außerhalb der Box fallen aus der Auswahl', sel.points.length === 3 && sel.dropped.dupId === 1 && sel.dropped.outsideBox === 1);
    const pa2 = doc.points.find((x) => x.mosmix && !x.truth.poi && x.truth.tawes);
    if (pa2) {
      const cat = { id: pa2.mosmix.id, name: pa2.mosmix.name, lat: pa2.mosmix.lat, lon: pa2.mosmix.lon, elev: pa2.mosmix.elev };
      const netSt = { net: 'tawes', id: pa2.truth.tawes, wmo: pa2.wmo, name: pa2.name, country: 'AT', lat: pa2.lat, lon: pa2.lon, h: pa2.elev };
      const ok = selectPoints([cat], new Set(), { networkStations: [netSt] });
      add(`(4) Gegenprobe: ${pa2.id} ${pa2.mosmix.name} wird aus Katalogstation + TAWES ${pa2.truth.tawes} ohne POI wieder ausgewählt, an der Messstelle`, ok.points.length === 1 && ok.points[0].lat === pa2.lat && ok.points[0].truth.tawes === pa2.truth.tawes);
      const noTruth = selectPoints([cat], new Set(), {});
      add('(4) Negativkontrolle: dieselbe Station ohne Netzstation und ohne POI ⇒ keine Wahrheit ⇒ verworfen', noTruth.points.length === 0 && noTruth.dropped.noTruth === 1);
      const high = selectPoints([cat], new Set(), { networkStations: [{ ...netSt, h: pa2.mosmix.elev + COLOCATE.maxDzM + 10 }] });
      add(`(4) Negativkontrolle: Netzstation ${COLOCATE.maxDzM + 10} m über der Katalogstation ⇒ kein Paar ⇒ verworfen (Murau/Stolzalpe-Fall)`, high.points.length === 0 && high.dropped.colocateDz === 1);
      const far = selectPoints([cat], new Set(), { networkStations: [{ ...netSt, wmo: null, lat: pa2.mosmix.lat + 0.03 }] });
      add(`(4) Negativkontrolle: andere Kennung ${(0.03 * 111.2).toFixed(1)} km neben der Katalogstation (> ${COLOCATE.maxKm} km) ⇒ kein Paar ⇒ verworfen`, far.points.length === 0);
      const outside = selectPoints([{ ...cat, lat: 44.9 }], new Set(), { networkStations: [{ ...netSt, lat: 44.9 }] });
      add('(4) Negativkontrolle: dasselbe Paar außerhalb der Cube-Box ⇒ verworfen', outside.points.length === 0 && outside.dropped.outsideBox === 1);
      const dupPos = selectPoints([cat, { id: '10002', name: 'GLEICHE MESSSTELLE', lat: pa2.lat, lon: pa2.lon, elev: pa2.elev }], new Set(['10002']), { networkStations: [netSt] });
      add('(4) Negativkontrolle: eine zweite Station an derselben Position (3 Dezimalen) ⇒ verworfen', dupPos.points.length === 1 && dupPos.dropped.dupPos === 1);
    } else add('(4) PA2: points.json enthält einen AT-Punkt nur mit TAWES (für die Gegenprobe)', false);
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
  add('(5) PA2: das Stationsprodukt kommt über die Katalogkennung (mosmix.id), nicht über die Nähe', /p\.mosmix\?\.id \?\? p\.id/.test(src) && !/nearestStations\(/.test(src));
  add('(5) PA2: POI wird nur für Punkte mit POI-Datei abgefragt; der Live-Pfad bekommt das Länderprofil', /truth\?\.poi !== false/.test(src) && /country: p\.profile \?\? p\.country/.test(src));
  add('(5) PA2: TAWES/SMN tragen rr1h aus den 10-min-Werten (tenMinColumns) und benennen es als die mit POI vergleichbare Größe', /tenMinColumns\(/.test(src) && /rr1h \(PA2\)/.test(src) && TRUTH_SCALES.rr1h?.unit === 'mm');
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

// (7) V-FI-5 im Sammler (§9.3.2): ein 403 von jsDelivr ist verlorene Archivzeit — Ausweichweg raw, am SELBEN Ref.
{
  const { withRawSameRef, rawRefOf } = await import('./punktarchiv/lib/rawFallback.mjs');
  const { httpStore } = await import('../src/point/client/store.ts');
  const text = (b) => (b ? new TextDecoder().decode(b) : null);
  const echo = (status) => async (url) => (status(url) === 200
    ? { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(url).buffer }
    : { ok: false, status: status(url), arrayBuffer: async () => new ArrayBuffer(0) });
  const cdn403 = echo((u) => (u.startsWith('https://cdn.jsdelivr.net/') ? 403 : 200));
  const s = withRawSameRef(httpStore({ fetchImpl: cdn403, retries: 0 }));
  const b = text(await s.bytes('point/2026091615/t1/07_06.bin'));
  add('(7) @main antwortet 403 ⇒ derselbe Pfad von raw.githubusercontent/main, als Ausweichweg gezählt',
    b === 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/point/2026091615/t1/07_06.bin' && s.stats.fallbacks === 1, b);
  const pinned = s.withBase('https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@abc1234');
  const b2 = text(await pinned.bytes('point/static/hmodel/v1/static.json'));
  add('(7) gepinnt (@abc1234) antwortet 403 ⇒ raw AM SELBEN COMMIT, nicht main (Manifest und Chunks aus EINEM Stand)',
    b2 === 'https://raw.githubusercontent.com/jppetry/buscosun-data/abc1234/point/static/hmodel/v1/static.json', b2);
  const seen = [];
  const s404 = withRawSameRef(httpStore({ fetchImpl: async (u) => { seen.push(u); return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }; }, retries: 0 }));
  add('(7) Negativkontrolle: 404 ist eine Antwort ⇒ null, kein Ausweichweg', (await s404.bytes('point/x.bin')) === null && seen.length === 1 && s404.stats.fallbacks === 0);
  add('(7) rawRefOf: nur jsDelivr-gh-Basen, sonst null', rawRefOf('https://cdn.jsdelivr.net/gh/o/r@main') === 'https://raw.githubusercontent.com/o/r/main' && rawRefOf('https://raw.githubusercontent.com/o/r/main') === null);
  const csrc = readFileSync(join(ROOT, 'scripts/punktarchiv/collect.mjs'), 'utf8');
  add('(7) collect.mjs liest über den Ausweichweg (außer mit --raw) und schreibt die Zahl der Ausweichwege in den Slot', /withRawSameRef\(httpStore\(\{\}\)\)/.test(csrc) && /fallbacks: store\.stats\.fallbacks/.test(csrc));
}

console.log(`\n${passed}/${total} Prüfungen bestanden.`);
process.exitCode = passed === total ? 0 : 1;
