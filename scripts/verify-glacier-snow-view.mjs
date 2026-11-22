#!/usr/bin/env node
/**
 * verify-glacier-snow-view.mjs — Phase GV (`audit/gletscher-schnee-anzeige.md`): the snow analysis (GN) and the model snow fields (GS)
 * on the dossier level "Heute", variant A "Höhenleiter". No network, no browser: a real excerpt read 22.11.2026 from buscosun-data
 * (`scripts/lib/fixtures/glacier/snow/view-extract.json`: snow days 15.–21.11., cells file, weather run 2026112211 with two hourly chunks,
 * three catalogue entries) and the station excerpt of phase DK-H.
 *
 *   A  fixture byte-exact; every document passes the contract rules the page applies
 *   B  Austrian glacier with data (Hintereisferner): value, place in words, cells in words, last seven days; nearest cell shared (Diem Ferner E1)
 *   C  Swiss glacier (Aletsch): one neutral sentence, no value
 *   D  missing day: no pointer, too old, not published, unreadable, glacier missing with reason, no entry; a gap in the week
 *   E  origin of the analysis is "analysis", never `measured` (rendered, with negative control); `GlacierOrigin` not widened
 *   F  model fields: new snow per day at three heights with the spread of THAT day, gust spread, snowfall line with its gaps; no p10/p90 summed
 *      over days (negative control); neighbour forcing; a run without spread; a stale run
 *   G  unit mm water equivalent, no cm in the model part
 *   H  ladder order by elevation (rendered), stations numbered as in the map list
 *   I  wording: forbidden words, no condition or warning language, nothing about crevasses or snow bridges (negative control)
 *   J  build rules: lazy chunk after the weather card (card unchanged), no flag, phone rules in the dossier's media query, touch targets,
 *      glacier tokens only, no new dependency, nothing in buscosun Fusion
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-snow-view.mjs
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as V from '../src/glacier/glacierSnowView.ts';
import { snowDayProblems, snowCellsProblems, SNOW_MISSING_TEXT } from '../src/glacier/glacierSnowContract.ts';
import { weatherProblems, weatherHourlyProblems, weatherSnowProblems, weatherHourlySnowProblems } from '../src/glacier/glacierWeatherContract.ts';
import { glacierForbiddenWords, GLACIER_ORIGINS, isGlacierOrigin } from '../src/glacier/glacierContract.ts';
import { stationView } from '../src/glacier/glacierStationView.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });
const clone = (x) => JSON.parse(JSON.stringify(x));

const FIX_FILE = join(ROOT, 'scripts/lib/fixtures/glacier/snow/view-extract.json');
const FIX_SHA = 'f95fdd15cbab811359e6d47431325f0add6305acd61594a005da3e6dc2f6a7b9';
const fixRaw = readFileSync(FIX_FILE);
const FX = JSON.parse(fixRaw.toString('utf8'));
const HEF = 'gl_at_hintereisferner-mit-toteis', ALE = 'gl_ch_grosser-aletschgletscher', DIE = 'gl_at_diem-ferner-e1';
const gOf = (id) => FX.catalog.find((g) => g.id === id);
const NOW = Date.parse('2026-11-22T12:00:00Z');
const daysMap = (over = {}) => new Map(Object.entries({ ...FX.snowDays, ...over }));
const snowOf = (id, o = {}) => V.snowAnalysisView({ g: gOf(id), pointer: FX.index.snow, days: daysMap(), cells: FX.cells, nowMs: NOW, ...o });
const hourlyOf = (g) => FX.hourly[g.region];

// ── A ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const dayProblems = Object.values(FX.snowDays).flatMap((d) => snowDayProblems(d));
add('A1 Fixture byte-genau (sha256) mit den Prüfsummen der Quelldateien; echte Form: sieben Schneetage 15.–21.11. (Zeiger `index.snow` = 21.11., Zellen 20261120-1.1), Lauf 2026112211 von buscosun Fusion 14 mit `rules.spread`; jedes Dokument besteht die Regeln, die die Seite anwendet (Tag, Zellen, Tages- und Stundendokument, Schneefelder)',
  createHash('sha256').update(fixRaw).digest('hex') === FIX_SHA && Object.keys(FX.sources).length === 12 && Object.values(FX.sources).every((s) => /^[0-9a-f]{64}$/.test(s))
  && Object.keys(FX.snowDays).join() === '20261115,20261116,20261117,20261118,20261119,20261120,20261121' && FX.index.snow.day === '20261121'
  && dayProblems.length === 0 && snowCellsProblems(FX.cells).length === 0 && weatherProblems(FX.weather).length === 0 && weatherSnowProblems(FX.weather).length === 0
  && Object.values(FX.hourly).every((h) => weatherHourlyProblems(h, FX.weather).length === 0 && weatherHourlySnowProblems(h, FX.weather).length === 0)
  && FX.weather.engine.name === 'buscosun Fusion 14' && FX.weather.rules.spread?.sums === 'scenarios', dayProblems.join(' '));

// ── B ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const vHef = snowOf(HEF);
const hefWeek = Object.values(FX.snowDays).map((d) => d.glaciers[HEF][0]);
add('B1 österreichischer Gletscher mit Wert (Hintereisferner, 21.11.): 38 cm Schneehöhe, 69 mm Wasserwert, Lage 3 von 100 in Worten („weniger als in 9 von 10 Wintern“), Herkunft der Zelle in Worten („Mittel aus 7 Gitterzellen“, keine Zelle geteilt), die letzten sieben Tage 15.–21.11. aus den sieben Dokumenten (28 … 38 cm), Änderung +10 cm seit 15.11.',
  vHef.kind === 'ok' && vHef.hs === 38 && vHef.swe === 69 && vHef.place === 3 && vHef.flag === 0 && vHef.placeText === 'weniger als in 9 von 10 Wintern 1991–2020 an diesem Kalendertag'
  && vHef.cellsText === 'Mittel aus 7 Gitterzellen von 1 km², deren Mittelpunkt im Umriss liegt' && vHef.sharedText === null
  && JSON.stringify(vHef.week.map((w) => w.hs)) === JSON.stringify(hefWeek) && hefWeek.join() === '28,28,30,30,37,39,38' && vHef.week.every((w) => w.why === null)
  && vHef.change?.cm === 10 && vHef.change.from === '20261115', JSON.stringify(vHef).slice(0, 300));
const vDie = snowOf(DIE);
add('B2 kein Zellmittelpunkt im Umriss (Diem Ferner E1): „nächste Zelle“ mit Abstand in Worten (0,2 km), und dass dieselbe Zelle auch in den Wert eines weiteren Gletschers einfließt (Diem Ferner E2) — ein Wert je Gletscher, keine Auflösung vorgetäuscht',
  vDie.kind === 'ok' && /^nächste Zelle: kein Zellmittelpunkt liegt im Umriss, der Wert gehört zur nächsten Gitterzelle von 1 km² \(Mittelpunkt 0,2 km vom Punkt des Gletschers\)$/.test(vDie.cellsText)
  && vDie.sharedText === 'Dieselbe Zelle fließt auch in den Wert von einem weiteren Gletscher ein.' && FX.cells.glaciers[DIE].how === 'nearest', vDie.kind === 'ok' ? vDie.cellsText : vDie.kind);
const pw = [[null, -1], [null, 1], [null, 0], [0, 0], [9, 0], [10, 0], [24, 0], [25, 0], [75, 0], [76, 0], [90, 0], [91, 0], [100, 0]].map(([p, f]) => V.snowPlaceWords(p, f));
add('B3 Lage in Worten an allen Kanten: unter / über jedem Winter (Kennzeichen), ohne Einordnung, < 10 „9 von 10“, < 25 „3 von 4“, 25–75 mittlere Hälfte, ≤ 90 „3 von 4“, darüber „9 von 10“ — beschreibend, ohne Urteil',
  /^weniger Schnee als .* in jedem Winter/.test(pw[0]) && /^mehr Schnee als .* in jedem Winter/.test(pw[1]) && pw[2] === V.SNOW_VIEW_TEXT.noPlace
  && pw[3] === pw[4] && /9 von 10/.test(pw[4]) && /^weniger/.test(pw[4]) && /3 von 4/.test(pw[5]) && pw[5] === pw[6] && /mittleren Hälfte/.test(pw[7]) && pw[7] === pw[8]
  && /^mehr als in 3 von 4/.test(pw[9]) && pw[9] === pw[10] && /^mehr als in 9 von 10/.test(pw[11]) && pw[11] === pw[12], pw.join(' | '));

// ── render without a browser ───────────────────────────────────────────────────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'gv-'));
const bundleFile = join(tmp, 'ladder.mjs');
await build({
  stdin: { resolveDir: ROOT, loader: 'ts', contents: `
    export { SnowLadderBody } from './src/glacier/GlacierSnowLadder.tsx';
    export { createElement } from 'react';
    export { renderToStaticMarkup } from 'react-dom/server';
  ` },
  bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile: bundleFile, logLevel: 'silent', jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'process.env.NODE_ENV': '"production"' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const R = await import(pathToFileURL(bundleFile).href);
const render = (id, { snow, model, stations = null } = {}) => {
  const g = gOf(id);
  return R.renderToStaticMarkup(R.createElement(R.SnowLadderBody, { g, nowMs: NOW, stations, snow: snow ?? snowOf(id), model: model ?? V.snowModelView(FX.weather, hourlyOf(g), id, NOW) }));
};
const textOf = (s) => s.replace(/<title>[\s\S]*?<\/title>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
/** The analysis part of a rendered card. */
const areaOf = (h) => /<div class="gl-sv-area"[\s\S]*?(?=<p class="gl-fine">Nach Höhe geordnet)/.exec(h)?.[0] ?? '';
/** Every `data-origin` inside the analysis part is `analysis`, there is at least one, and none is `measured`. */
const areaHonest = (a) => { const o = [...a.matchAll(/data-origin="([^"]+)"/g)].map((m) => m[1]); return o.length > 0 && o.every((x) => x === 'analysis'); };

const dkh = JSON.parse(readFileSync(join(ROOT, 'scripts/lib/fixtures/glacier/stations/dossier-heute-extract.json'), 'utf8'));
const stnAle = stationView(dkh.map, dkh.hour, ALE, Date.parse('2026-11-22T09:20:00Z'));
const hHef = render(HEF), hAle = render(ALE, { stations: stnAle.stations }), hDie = render(DIE);

// ── C ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const vAle = snowOf(ALE), aAle = areaOf(hAle);
add('C1 Schweizer Gletscher (Aletsch): ein neutraler Satz „Schneeanalyse nur für österreichische Gletscher.“ — kein Wert, kein Balken, keine Woche, kein Abruf eines Schneetags (der Lader fragt nur für Österreich)',
  vAle.kind === 'outside' && vAle.text === 'Schneeanalyse nur für österreichische Gletscher.' && textOf(aAle) === 'Im Gebiet, ohne Höhe Analyse Schneeanalyse nur für österreichische Gletscher.'
  && !/gl-sv-ruler|gl-sv-week|gl-num/.test(aAle) && /const snowDay = g\.country === 'AT' \? snowPointer\?\.day \?\? null : null/.test(src('src/glacier/GlacierSnowLadder.tsx')),
  textOf(aAle));

// ── D ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const dMiss = clone(FX.snowDays['20261121']); delete dMiss.glaciers[HEF]; dMiss.missing.push([HEF, 'nodata']); dMiss.count--;
const dNone = clone(FX.snowDays['20261121']); delete dNone.glaciers[HEF]; dNone.count--;
const cases = {
  noPointer: snowOf(HEF, { pointer: null }),
  old: snowOf(HEF, { nowMs: Date.parse('2026-11-26T00:00:01Z') }),
  absent: snowOf(HEF, { days: daysMap({ 20261121: 'absent' }) }),
  unreadable: snowOf(HEF, { days: daysMap({ 20261121: null }) }),
  missing: snowOf(HEF, { days: daysMap({ 20261121: dMiss }) }),
  noEntry: snowOf(HEF, { days: daysMap({ 20261121: dNone }) }),
  loading: snowOf(HEF, { days: new Map() }),
};
add('D1 fehlender Tag ⇒ „Keine Daten“ mit Grund, nie eine Zahl: kein Zeiger; Zeiger älter als 4 Tage (gesetzt); Tag nicht veröffentlicht (404); Tag nicht ladbar oder verletzt die Regeln; Gletscher unter `missing` mit dem Grund des Vertrags; Gletscher ohne Eintrag; während des Ladens ein Satz',
  cases.noPointer.why === 'Der Datenspeicher nennt noch keine Schneeanalyse.' && /^Die letzte Schneeanalyse ist vom 21\.11\.2026; älter als 4 Tage/.test(cases.old.why) && V.SNOW_VIEW_MAX_AGE_DAYS === 4
  && snowOf(HEF, { nowMs: Date.parse('2026-11-25T00:00:00Z') }).kind === 'ok'
  && cases.absent.why === 'Die Schneeanalyse vom 21.11.2026 ist an diesem Tag nicht veröffentlicht.' && cases.unreadable.why === 'Die Schneeanalyse vom 21.11.2026 ist nicht ladbar.'
  && cases.missing.why === `Die Schneeanalyse vom 21.11.2026 hat für diesen Gletscher keinen Wert: ${SNOW_MISSING_TEXT.nodata}.` && cases.noEntry.why === 'Die Schneeanalyse vom 21.11.2026 hat für diesen Gletscher keinen Eintrag.'
  && cases.loading.kind === 'loading' && snowDayProblems(dMiss).length === 0,
  JSON.stringify(Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, v.why ?? v.kind]))));
const gapWeek = snowOf(HEF, { days: daysMap({ 20261117: 'absent', 20261115: null }) });
const hGap = render(HEF, { snow: gapWeek }), hMiss = render(HEF, { snow: cases.missing });
add('D2 Lücke in der Woche: ein fehlender Tag bleibt eine Lücke mit Grund (kein Auffüllen), die Änderung zählt vom ersten Tag mit Wert; im Kleingedruckten „Ohne Wert: 15.11. (nicht ladbar), 17.11. (an diesem Tag nicht veröffentlicht)“; der fehlende Tag des Zeigers zeigt „Keine Daten.“ mit dem Grund und keine Zahl',
  gapWeek.kind === 'ok' && gapWeek.week[0].hs === null && gapWeek.week[2].hs === null && gapWeek.week[1].hs === 28 && gapWeek.change.from === '20261116' && gapWeek.change.cm === 10
  && textOf(hGap).includes('Ohne Wert: 15.11. (nicht ladbar), 17.11. (an diesem Tag nicht veröffentlicht).')
  && textOf(areaOf(hMiss)).includes(`Keine Daten. ${cases.missing.why}`) && !/gl-num|gl-sv-ruler/.test(areaOf(hMiss)), textOf(areaOf(hMiss)));

// ── E ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const aHef = areaOf(hHef);
const ladderSrc = src('src/glacier/GlacierSnowLadder.tsx'), viewSrc = src('src/glacier/glacierSnowView.ts');
const areaSrc = /<div className="gl-sv-area"[\s\S]*?\n      <\/div>\n/.exec(ladderSrc)?.[0] ?? '';
add('E1 Herkunft der Analyse ist immer „Analyse“: im gerenderten Block jedes `data-origin` = `analysis` (Block, Chip, beide Zahlen), kein `measured`, kein `model`; Chip „Analyse“ in eigener Farbe (Schiefer); im Quelltext des Blocks steht kein `measured`; Gegenprobe: derselbe Block mit einem eingeschmuggelten `data-origin="measured"` fällt durch',
  areaHonest(aHef) && (aHef.match(/class="gl-num[^"]*" data-origin="analysis"/g) ?? []).length === 2 && /class="gl-chip is-analysis" data-origin="analysis"/.test(aHef) && />Analyse<\/span>/.test(aHef)
  && !/measured/.test(areaSrc) && areaSrc.length > 500 && V.SNOW_VIEW_ORIGIN === 'analysis'
  && !areaHonest(aHef.replace(/(class="gl-chip is-analysis" )data-origin="analysis"/, '$1data-origin="measured"')) && areaHonest(areaOf(hAle)) && areaHonest(areaOf(hMiss))
  && /--gl-prov-analysis-text: #3D4F6B;/.test(src('src/glacier/glacierDeck.css')) && /\.gl-chip\.is-analysis \{/.test(src('src/glacier/glacierDeck.css')),
  [...aHef.matchAll(/data-origin="([^"]+)"/g)].map((m) => m[1]).join());
add('E2 kein Wert der Analyse je Höhe: der Block heißt „Im Gebiet, ohne Höhe“ und steht abgesetzt unter der Leiter; keine Sprosse der Leiter trägt die Analyse; der Satz „ein Wert für den ganzen Gletscher“ steht da; `GlacierOrigin` ist nicht erweitert (die Herkunftsprüfung anderer Linien verwirft „analysis“ weiter)',
  /<b>Im Gebiet, ohne Höhe<\/b>/.test(aHef) && hHef.indexOf('gl-sv-area') > hHef.lastIndexOf('gl-sv-rung') && ![...hHef.matchAll(/<li class="gl-sv-rung[\s\S]*?<\/li>/g)].some((m) => /analysis/.test(m[0]))
  && textOf(hHef).includes('keine Messung und keine Höhenstufe: ein Wert für den ganzen Gletscher.') && GLACIER_ORIGINS.join() === 'measured,satellite,model,official' && !isGlacierOrigin('analysis'));

// ── F ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const mHef = V.snowModelView(FX.weather, FX.hourly['at-oetztaler-alpen'], HEF, NOW);
const rowHef = FX.weather.glaciers.find((r) => r.id === HEF), chunkHef = FX.hourly['at-oetztaler-alpen'].glaciers[HEF];
add('F1 Neuschnee je Tag an Zunge, Mitte und Oberkante mit der Spanne DIESES Tages: fünf Tage ab dem Block von „jetzt“ (12 UTC, Lauf 11 UTC ⇒ Tag 0), Erwartungswert und p10/p90 je Tag und Höhe Zahl für Zahl aus `sn`/`snq` des Laufs; stärkste Böe je Tag mit p10/p90 aus `gx`/`gq`',
  mHef.kind === 'ok' && mHef.hour === 1 && mHef.days.length === 5 && mHef.days.map((d) => d.d).join() === '0,1,2,3,4'
  && mHef.days.every((d) => [0, 1, 2].every((lv) => d.sn[lv] === rowHef.sn[lv][d.d] && JSON.stringify(d.snq[lv]) === JSON.stringify(rowHef.snq[lv][d.d])) && d.gx === rowHef.gx[d.d] && JSON.stringify(d.gq) === JSON.stringify(rowHef.gq[d.d])),
  mHef.kind === 'ok' ? JSON.stringify(mHef.days[0]) : mHef.why);
const sumP = (k) => [0, 1, 2].map((lv) => mHef.days.reduce((s, d) => s + d.snq[lv][k], 0));
const tHef = textOf(hHef);
const sumLines = [...tHef.matchAll(/\d Tage zusammen[^.]*?ohne Spanne/g)].map((m) => m[0]);
const noQuantileSum = (lines) => lines.length === 3 && lines.every((l) => !/Szenarien|p10|p90|–/.test(l));
add('F2 keine Spanne über Tage: die Summe der fünf Tage ist nur die der Erwartungswerte (Zahl für Zahl) und sagt „ohne Spanne“; nirgends steht eine Summe von p10 oder p90 (Gegenprobe: ein Satz „5 Tage zusammen in 8 von 10 Szenarien …“ fällt durch); im Code der Sicht summiert nichts `snq`',
  JSON.stringify(mHef.sum) === JSON.stringify([0, 1, 2].map((lv) => Math.round(mHef.days.reduce((s, d) => s + d.sn[lv], 0) * 10) / 10)) && noQuantileSum(sumLines)
  && !noQuantileSum([...sumLines.slice(0, 2), `5 Tage zusammen in 8 von 10 Szenarien ${sumP(0)[0].toFixed(1)}–${sumP(1)[0].toFixed(1)} mm, ohne Spanne`])
  && !/snq[^\n]{0,80}reduce|reduce[^\n]{0,80}snq|gq[^\n]{0,40}reduce/.test(code(viewSrc)) && textOf(hHef).includes('Für mehrere Tage zusammen gibt es keine Spanne.'), sumLines.join(' | '));
const runs = (a) => a.reduce((n, v, i) => n + (v != null && (i === 0 || a[i - 1] == null) ? 1 : 0), 0);
const slPath = /<path d="([^"]+)" class="gl-sv-sl"/.exec(hHef)?.[1] ?? '';
add('F3 Schneefallgrenze je Stunde ab jetzt bis +120 h vor der Höhenspanne des Gletschers: Werte Zahl für Zahl aus `sl` ab Stunde 1, `null` bleibt Lücke (die Linie bricht dort ab: so viele Teilstücke wie Wertfolgen), jetzt = Wert der Stunde, Spanne der nächsten 24 h; das Band ist die Höhenspanne des Katalogs',
  mHef.sl && mHef.sl.from === 1 && JSON.stringify(mHef.sl.values) === JSON.stringify(chunkHef.sl.slice(1)) && mHef.sl.values.length === 119 && mHef.sl.now === chunkHef.sl[1]
  && (slPath.match(/M/g) ?? []).length === runs(chunkHef.sl.slice(1)) && runs(chunkHef.sl.slice(1)) >= 1
  && JSON.stringify(mHef.sl.next24) === JSON.stringify([Math.min(...chunkHef.sl.slice(1, 26).filter((v) => v != null)), Math.max(...chunkHef.sl.slice(1, 26).filter((v) => v != null))])
  && hHef.includes(`Gletscher ${gOf(HEF).z[0].toLocaleString('de-DE')}–${gOf(HEF).z[2].toLocaleString('de-DE')} m`),
  `${chunkHef.sl.filter((v) => v == null).length} Lücken, ${runs(chunkHef.sl.slice(1))} Teilstücke, jetzt ${mHef.sl?.now}`);
const gustRendered = [...hHef.matchAll(/<dd><b class="gl-num" data-origin="model">(\d+)<\/b><small>(\d+)–(\d+)<\/small><\/dd>/g)].map((m) => [+m[1], +m[2], +m[3]]);
add('F4 Böe: je Tag die stärkste Böe und ihre Spanne (p10/p90 dieser einen Stunde), gerendert an der mittleren Höhe, mit dem Vermerk „freie Höhe“; der Wortlaut „8 von 10 Szenarien“ steht bei jeder Spanne',
  gustRendered.length === 5 && gustRendered.every((g, i) => g[0] === mHef.days[i].gx && g[1] === mHef.days[i].gq[0] && g[2] === mHef.days[i].gq[1]) && tHef.includes('freie Höhe, nicht die Gletscherfläche')
  && (tHef.match(/in 8 von 10 Szenarien/g) ?? []).length >= 3 && /in 8 von 10 Szenarien/.test(V.spreadText([1, 2], 'mm')), JSON.stringify(gustRendered));
const mDie = V.snowModelView(FX.weather, FX.hourly['at-oetztaler-alpen'], DIE, NOW);
const noSpread = clone(FX.weather); delete noSpread.rules.spread; for (const r of noSpread.glaciers) { delete r.pq; delete r.snq; delete r.gq; }
const badSn = clone(FX.weather); badSn.glaciers.find((r) => r.id === HEF).snq[1][0] = [9, 1];
add('F5 kein Wert ohne Grundlage: Nachbar-Antrieb (Diem Ferner E1) ⇒ der Satz zum Nachbarn, keine Zahl in der Leiter; ein Lauf ohne Spanne (vor Phase GS) ⇒ „trägt noch keine Spanne“; verletzte Schneefelder ⇒ „bestehen die Prüfung nicht“; ein Lauf älter als 18 h ⇒ der Grund der Wetterkarte; Stundenwerte nicht ladbar ⇒ Satz statt Linie',
  mDie.kind === 'nodata' && mDie.why === V.SNOW_VIEW_TEXT.neighbour && !/class="gl-num"/.test(hDie.slice(0, hDie.indexOf('gl-sv-area')))
  && V.snowModelView(noSpread, FX.hourly['at-oetztaler-alpen'], HEF, NOW).why === V.SNOW_VIEW_TEXT.noSpread && weatherSnowProblems(noSpread).length === 0
  && V.snowModelView(badSn, FX.hourly['at-oetztaler-alpen'], HEF, NOW).why === V.SNOW_VIEW_TEXT.badFields
  && /^Der letzte Lauf ist \d+ Stunden alt/.test(V.snowModelView(FX.weather, null, HEF, NOW + 20 * 3_600_000).why ?? '')
  && V.snowModelView(FX.weather, null, HEF, NOW).slWhy === V.SNOW_VIEW_TEXT.noHourly, mDie.why);

// ── G ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ladderPart = hHef.slice(0, hHef.indexOf('gl-sv-area'));
add('G1 Einheit wie entschieden: Neuschnee in mm Wasserwert (Zahl mit „mm“), nirgends in der Leiter „cm“ — der Satz „ohne Umrechnung in cm: die Dichte frischen Schnees ist nicht bekannt“ steht da; Schneehöhe der Analyse in cm, Wasserwert in mm',
  !/\bcm\b/.test(textOf(ladderPart)) && /mm<\/small><\/b>/.test(ladderPart) && tHef.includes(V.SNOW_VIEW_TEXT.unit) && /cm Schnee/.test(aHef) && /Wasserwert <b[^>]*>69 mm<\/b>/.test(aHef));

// ── H ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const zs = (h) => [...h.matchAll(/<li class="gl-sv-rung[^"]*" data-origin="[^"]+" data-z="(\d+)"/g)].map((m) => +m[1]);
const zAle = zs(hAle), zHef = zs(hHef);
const mAle = V.snowModelView(FX.weather, FX.hourly['ch-mitte-west'], ALE, NOW);
const stnRungs = [...hAle.matchAll(/<li class="gl-sv-rung is-stn[^"]*" data-origin="measured"[\s\S]*?<span class="gl-sv-sn([^"]*)" aria-hidden="true">(\d)<\/span><b>([^<]+)<\/b>/g)].map((m) => [m[2], m[3], m[1]]);
add('H1 die Leiter steht in der Reihenfolge der Höhe (gerendert, von oben nach unten): Oberkante, Mitte, Zunge, die Schneefallgrenze von jetzt an ihrer Höhe und jede Station an ihrer; Stationen tragen die Nummer der Kartenliste (Jungfraujoch 1, gefüllt = beste, Flesch 2) und `data-origin="measured"`; ohne Stationen nur Modell',
  zAle.length === 6 && zAle.every((v, i) => i === 0 || v <= zAle[i - 1]) && zHef.length === 4 && zHef.every((v, i) => i === 0 || v <= zHef[i - 1])
  && mAle.kind === 'ok' && zAle.includes(mAle.z[2]) && zAle.includes(mAle.z[0]) && (mAle.sl?.now == null || zAle.includes(mAle.sl.now))
  && JSON.stringify(stnRungs) === JSON.stringify([['1', 'Jungfraujoch', ' is-best'], ['2', 'Flesch', '']])
  && JSON.stringify(V.ladderRungs([2000, 2500, 3000], 2500, [{ id: 'a', elev: 3500 }, { id: 'b', elev: 1000 }]).map((r) => r.kind)) === JSON.stringify(['stn', 'ice', 'ice', 'sl', 'ice', 'stn'])
  && !/is-stn/.test(hHef), `${zAle.join(' ')} | ${JSON.stringify(stnRungs)}`);

// ── I ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const BAD = /gefahr|gefährlich|warnung|achtung|lawine|spalte|schneebrücke|schneearm|schneereich|durchschnittlich|normal\b|zu wenig|zu viel|gut\b|schlecht|ideal|riskant/i;
const texts = [...Object.values(V.SNOW_VIEW_TEXT), ...pw, ...Object.values(cases).map((c) => c.why ?? c.text ?? ''), vHef.cellsText, vDie.cellsText, vDie.sharedText, textOf(hHef), textOf(hAle), textOf(hDie), textOf(hGap), textOf(hMiss)];
add('I1 Wortlaut: kein gesperrtes Wort (`glacierForbiddenWords`), keine Warn-, Urteils- oder Zustandssprache, nichts über Spalten, Schneebrücken oder Lawinen, kein amtlicher Wortlaut; Gegenproben: „begehbar“ und „Lawinengefahr“ schlagen an',
  texts.length > 30 && texts.every((t) => glacierForbiddenWords(t).length === 0 && !BAD.test(t)) && glacierForbiddenWords('Der Gletscher ist begehbar.').join() === 'begehbar' && BAD.test('Lawinengefahr'),
  texts.filter((t) => glacierForbiddenWords(t).length || BAD.test(t)).map((t) => t.slice(0, 120)).join(' | '));
rmSync(tmp, { recursive: true, force: true });

// ── J ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const brief = src('src/glacier/GlacierBrief.tsx'), board = src('src/glacier/GlacierHeuteBoard.tsx'), css = src('src/glacier/glacierSnow.css');
const at = (re) => board.search(re);
let changed = [];
try { changed = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); } catch { changed = ['<git nicht lesbar>']; }
const pkgNow = JSON.parse(src('package.json')).dependencies, pkgHead = (() => { try { return JSON.parse(execFileSync('git', ['show', 'HEAD:package.json'], { cwd: ROOT, encoding: 'utf8' })).dependencies; } catch { return null; } })();
add('J1 neue UI als Lazy-Chunk NACH der Karte „Wetter am Gletscher“ auf der Ebene Wetter (Ebene 1 des Dossiers, Jan 22.11.): `lazy(() => import(\'./GlacierSnowLadder\'))`, kein statischer Import, CSS am Chunk; im Steckbrief steht die Leiter direkt nach der Wetterkarte; die Wetterkarte ist unverändert (kein Unterschied zu HEAD, nicht in diesem Arbeitsbaum geändert); nur im Dossier; ohne Schalter (keine URL-, Flag- oder Speicherabfrage in den neuen Dateien)',
  /const GlacierSnowLadder = lazy\(\(\) => import\('\.\/GlacierSnowLadder'\)\);/.test(brief) && !/^import .*GlacierSnowLadder/m.test(brief) && /^import '\.\/glacierSnow\.css';\r?$/m.test(ladderSrc)
  && /\{weatherCard \? <div className="gl-hb-wx">\{weatherCard\}<\/div> : null\}\s*\{snowLadder\}/.test(brief) && brief.indexOf("{ tab: 'wetter', title: 'Wetter'") > 0 && brief.indexOf("{ tab: 'wetter'") < brief.indexOf("{ tab: 'heute'")
  && !changed.includes('src/glacier/GlacierWeatherCard.tsx') && !/Snow|snq|gq/.test(src('src/glacier/GlacierWeatherCard.tsx')) && /const snowLadder = onWetter \|\| onHeute \?/.test(brief) && /weather=\{weatherCard\} snow=\{snowLadder\}/.test(brief)
  && /const onWetter = layout === 'dossier' && LEVELS\[levelOf\(state\.tab\)\]\.tab === 'wetter';/.test(brief)
  && !/location|URLSearchParams|localStorage|sessionStorage|glacierFlag/.test(code(ladderSrc) + code(viewSrc)));
const MQ = '@media (max-width: 767px), (max-width: 1439px) and (pointer: coarse) {';
const mqAt = css.indexOf(MQ), mq = css.slice(mqAt);
add('J2 Telefon allein in der Media Query des Dossiers: Leiter schmaler, Bilder untereinander; Trefferflächen ≥ 44 px (die einzigen Bedienelemente sind die Quellenlinks: 44 px hoch); nur Gletscher-Tokens als Farben (außer Weiß), keine Animation; keine neue Abhängigkeit, nichts an buscosun Fusion, Edge Functions, Shadern',
  mqAt > 0 && css.split('@media').length === 2 && /\.gl-sv-rung \{ grid-template-columns: 46px/.test(mq) && /\.gl-sv-fig, \.gl-sv-areagrid \{ grid-template-columns: minmax\(0, 1fr\)/.test(mq) && /\.gl-sv-src a \{ display: inline-flex; align-items: center; min-height: 44px; \}/.test(mq)
  && !/<button|onClick|<input|<select/.test(ladderSrc) && !/#[0-9a-fA-F]{3,8}/.test(css.replace(/#fff\b/gi, '')) && !/@keyframes|animation:|transition:/.test(css)
  && pkgHead && JSON.stringify(Object.keys(pkgNow).sort()) === JSON.stringify(Object.keys(pkgHead).sort()) && !changed.some((f) => /^src\/pointForecast\/|^netlify\/edge-functions\/|^src\/wind\/|shaders?\.|\.glsl$/.test(f)),
  changed.join(', '));

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok ? '' : `\n       ${c.detail}`}`);
console.log(`\nverify:glacier-snow-view ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
