#!/usr/bin/env node
/**
 * verify-glacier-dossier-heute.mjs — Phase DK-H (`audit/gletscher-dossier-heute.md`): the stations in the dossier map, level "Heute".
 * No network, no browser: a real excerpt of the station mapping and of one slot (`scripts/lib/fixtures/glacier/stations/
 * dossier-heute-extract.json`, read 22.11.2026 from buscosun-data) and the real L1 outlines of the stations verifier.
 *
 *   A  fixture byte-exact; the view carries the station positions from the mapping
 *   B  frame of the map: outline plus every station (negative control: the outline's box alone misses a station), padding for the cards
 *   C  the dashed line starts at the nearest point of the OUTLINE, not at the centre; its label is the mapping's distance
 *   D  the three meters with every edge of the thresholds; the best match
 *   E  a glacier without a station: no layer content, one neutral sentence, framing as before
 *   F  the IMIS operator line (Flesch at the Aletsch): "Betreiber: <SLF link>" without ". ." (negative control: the old glued sentence)
 *   G  the list rendered without a browser: every station, all values, meters, origin, fixed sentence, sources; wording
 *   H  build rules: lazy chunk, MapLibre markers and a line layer only, no flag, no new dependency, no change outside the glacier line;
 *      order of the blocks below the map; phone rules only in the dossier's media query, touch targets ≥ 44 px
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-dossier-heute.mjs
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as C from '../src/glacier/glacierStationContract.ts';
import { stationView, stationViewTexts } from '../src/glacier/glacierStationView.ts';
import * as M from '../src/glacier/glacierStationMap.ts';
import { bboxOf } from '../src/glacier/glacierGeo.ts';
import { glacierForbiddenWords } from '../src/glacier/glacierContract.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FX = join(ROOT, 'scripts/lib/fixtures/glacier/stations');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
/** Source without comments — a rule checked in code must not be satisfied by a comment. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });

const FIX_FILE = join(FX, 'dossier-heute-extract.json');
const FIX_SHA = '1c62e50b21d11e663291c609910f1eaa09e99e6d14f459fec6e8c4c232d8718b';
const fixRaw = readFileSync(FIX_FILE);
const FIX = JSON.parse(fixRaw.toString('utf8'));
const OUTLINES = JSON.parse(readFileSync(join(FX, 'glacier-outline-extract.json'), 'utf8'));
const CAT = JSON.parse(readFileSync(join(FX, 'glacier-obs-extract.json'), 'utf8')).catalog.glaciers;
const geomOf = (id) => { for (const f of Object.values(OUTLINES.files)) { const x = f.features.find((y) => y.properties.id === id); if (x) return x.geometry; } return null; };
const gOf = (id) => CAT.find((g) => g.id === id);
const NOW = Date.parse('2026-11-22T09:20:00Z');
const ALE = 'gl_ch_grosser-aletschgletscher', ALP = 'gl_at_alpeiner-ferner-3055', BLA = 'gl_de_blaueis';
const km = (a, b) => C.stnDistanceKm(a[1], a[0], b[1], b[0]);
const inBox = (b, lon, lat) => lon >= b[0][0] && lon <= b[1][0] && lat >= b[0][1] && lat <= b[1][1];

// ── A ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const vAle = stationView(FIX.map, FIX.hour, ALE, NOW), vAlp = stationView(FIX.map, FIX.hour, ALP, NOW), vBla = stationView(FIX.map, FIX.hour, BLA, NOW);
const ext = FIX.map.ext;
add('A1 Fixture byte-genau (sha256) und echte Form: Zuordnung mit Abschnitt `ext` (Regel „outline“), Slot 2026112209; Aletsch → Jungfraujoch und Flesch, Alpeiner Ferner → zwei Tiroler Stationen, Blaueis ohne Station',
  createHash('sha256').update(fixRaw).digest('hex') === FIX_SHA && ext.rule.from === 'outline' && FIX.hour.hour === '2026112209'
  && vAle?.stations.map((s) => s.id).join() === 'ch:JUN,imis:EGH2' && vAlp?.stations.length === 2 && vAlp.stations.every((s) => s.net === 'tirol') && vBla === null,
  `${vAle?.stations.map((s) => s.id)} | ${vAlp?.stations.map((s) => s.name)}`);
add('A2 die Sicht trägt die Lage jeder Station aus der Zuordnung (kein zweiter Abruf, kein anderer Weg)',
  [...vAle.stations, ...vAlp.stations].every((s) => s.lat === ext.stations[s.id].lat && s.lon === ext.stations[s.id].lon) && /lat: meta\.lat, lon: meta\.lon/.test(src('src/glacier/glacierStationView.ts')));

// ── B frame ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const gAle = geomOf(ALE), gAlp = geomOf(ALP), bbAle = bboxOf(gAle), bbAlp = bboxOf(gAlp);
const frAle = M.heuteFrame(bbAle, vAle.stations), frAlp = M.heuteFrame(bbAlp, vAlp.stations);
const outlineOnly = M.heuteFrame(bbAle, []);
const fle = vAle.stations.find((s) => s.net === 'imis');
add('B1 Rahmen in Heute = Umriss plus ALLE Stationen: jede Station und die Box des Umrisses liegen darin (Aletsch, Alpeiner Ferner); Gegenprobe: die Box des Umrisses allein enthält Flesch nicht — ohne die Stationen wäre sie abgeschnitten',
  [...vAle.stations.map((s) => [frAle, s]), ...vAlp.stations.map((s) => [frAlp, s])].every(([f, s]) => inBox(f, s.lon, s.lat))
  && inBox(frAle, bbAle[0], bbAle[1]) && inBox(frAle, bbAle[2], bbAle[3]) && !inBox(outlineOnly, fle.lon, fle.lat) && inBox(frAle, fle.lon, fle.lat),
  `Aletsch ${JSON.stringify(frAle)} | Flesch ${fle.lon},${fle.lat}`);
const cssSt = src('src/glacier/glacierStations.css');
const cardMax = Number(/\.gl-sm-card \{[^}]*max-width: (\d+)px/.exec(cssSt)?.[1]), cardBottom = Number(/\.gl-sm-card \{[^}]*bottom: (\d+)px/.exec(cssSt)?.[1]);
const P = M.HEUTE_FRAME_PADDING;
add('B2 Innenabstand, damit die Wertekarten nicht abgeschnitten werden: links/rechts mindestens die halbe Kartenbreite (CSS `max-width`), oben Kartenabstand + Karte (≈ 100 px); mobil kleiner (nur die Wert-Pille); die Karte stutzt den Abstand auf die Größe des Bildes, statt dass MapLibre die Einpassung verweigert',
  P.desktop.left >= cardMax / 2 && P.desktop.right >= cardMax / 2 && P.desktop.top >= cardBottom + 100 && P.mobile.top < P.desktop.top && P.mobile.left < P.desktop.left
  && /function fitPadding\(map: maplibregl\.Map/.test(src('src/glacier/GlacierSheetMap.tsx')) && /fb\.padding \? fitPadding\(map, fb\.padding\) : 48/.test(src('src/glacier/GlacierSheetMap.tsx')),
  `${JSON.stringify(P)} | Karte ${cardMax} px, Abstand ${cardBottom} px`);
const brief = src('src/glacier/GlacierBrief.tsx');
add('B3 nur die Ebenen Heute und Wetter des Dossiers (beide zeigen die Karte, Jan 22.11.) bekommen den Rahmen, und nur mit eingeschalteter Ebene „Stationen“; ohne Rahmen rahmt die Karte wie bisher (Box des Umrisses, 48 px — auch beim Wechsel 2D/3D)',
  /if \(!stnView \|\| !showStations \|\| !\(onHeute \|\| onWetter\)\) return null;/.test(code(brief)) && /const onHeute = layout === 'dossier' && LEVELS\[levelOf\(state\.tab\)\]\.tab === 'heute';/.test(brief)
  && /if \(fr\) return \{ bounds: fr\.bounds, padding: fr\.padding \};/.test(src('src/glacier/GlacierSheetMap.tsx')) && /return bb \? \{ bounds: \[\[bb\[0\], bb\[1\]\], \[bb\[2\], bb\[3\]\]\], padding: null \} : null;/.test(src('src/glacier/GlacierSheetMap.tsx')));

// ── C line from the outline ────────────────────────────────────────────────────────────────────────────────────────────
const linesAle = M.stnLines(vAle.stations, gAle), linesAlp = M.stnLines(vAlp.stations, gAlp);
const lFle = linesAle.find((l) => l.id === fle.id);
const centre = [(bbAle[0] + bbAle[2]) / 2, (bbAle[1] + bbAle[3]) / 2];
const polys = gAle.type === 'Polygon' ? [gAle.coordinates] : gAle.coordinates;
const lineErr = [...linesAle.map((l) => [l, vAle]), ...linesAlp.map((l) => [l, vAlp])].map(([l, v]) => Math.abs(km(l.from, l.to) - v.stations.find((s) => s.id === l.id).km));
add('C1 die gestrichelte Linie beginnt am nächsten Punkt des UMRISSES: ihr Anfang liegt auf dem Umriss (< 10 m), ihre Länge ist der Abstand der Zuordnung (±0,1 km, Rundung), ihre Zahl ist genau dieser Abstand; Gegenprobe: vom Mittelpunkt des Gletschers wäre Flesch über 1 km weiter',
  lFle && C.stnOutlineKm(polys, lFle.from[1], lFle.from[0]) < 0.01 && lineErr.every((e) => e <= 0.1) && lFle.km === fle.km && fle.km === 1.9
  && km(centre, lFle.to) - fle.km > 1 && linesAlp.length === 2,
  `Fehler ${lineErr.map((e) => e.toFixed(3)).join(', ')} km | Mitte→Flesch ${km(centre, lFle?.to ?? centre).toFixed(2)} km`);
const jun = vAle.stations.find((s) => s.id === 'ch:JUN');
const onEdge = M.stnLines([{ ...jun, km: 0.04 }], gAle), inside = M.nearestOnOutline(gAle, (bbAle[1] + bbAle[3]) / 2, (bbAle[0] + bbAle[2]) / 2);
add('C2 eine Station am Rand (unter 0,05 km — der Text sagt „am Rand des Gletschers“) oder auf dem Eis bekommt keine Linie; Jungfraujoch (0,1 km) bekommt eine; ohne Umriss gibt es keine Linie',
  onEdge.length === 0 && linesAle.some((l) => l.id === 'ch:JUN') && M.stnLines(vAle.stations, null).length === 0 && M.nearestOnOutline(null, 46.5, 8) === null && (inside === null || inside.km >= 0),
  `inside ${JSON.stringify(inside)}`);
const heute = src('src/glacier/GlacierStationsHeute.tsx');
add('C3 die Zahl an der Linie ist der Abstand der Zuordnung, nicht eine eigene Rechnung der Seite (`l.km` aus `s.km`)',
  /el\.textContent = `\$\{fmt1\(l\.km\)\} km`/.test(heute) && /km: s\.km \}\);/.test(src('src/glacier/glacierStationMap.ts')));

// ── D meters ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const z = [2701, 3065, 3286], H = 3_600_000;
const mt = (k, elev, age) => M.stnMatch({ km: k, elev, ms: age == null ? null : NOW - age }, z, NOW);
const near = [[0, 3], [1, 3], [1.01, 2], [3, 2], [3.01, 1], [5, 1], [5.01, 0]].map(([k, want]) => mt(k, 3000, 0).near === want);
const hgt = [[2701, 3], [3286, 3], [2401, 2], [2400, 1], [2399, 1], [3586, 2], [3587, 1]].map(([e, want]) => mt(1, e, 0).height === want);
const frs = [[0, 3], [H - 1, 3], [H, 2], [3 * H - 1, 2], [3 * H, 1], [null, 0]].map(([a, want]) => mt(1, 3000, a).fresh === want);
add('D1 Striche mit allen Kanten: Nähe 1 km → 3, 1,01 → 2, 3 → 2, 3,01 → 1, 5 → 1, darüber 0; Höhe an beiden Enden der Spanne → 3, 300 m außerhalb → 2, 301 m → 1; Aktuell unter 1 h → 3, genau 1 h → 2, genau 3 h → 1, ohne gezeigten Wert → 0; die Grenzen sind die Konstanten (`set`)',
  near.every(Boolean) && hgt.every(Boolean) && frs.every(Boolean) && M.STN_MATCH_NEAR_KM.join() === '1,3,5' && M.STN_MATCH_DZ_M === 300 && M.STN_MATCH_AGE_MS.join() === `${H},${3 * H}`,
  `Nähe ${near} | Höhe ${hgt} | Aktuell ${frs}`);
const mJun = M.stnMatch(jun, gOf(ALE).z, NOW), mFle = M.stnMatch(fle, gOf(ALE).z, NOW);
const tie = [{ ...jun, id: 'b', km: 2 }, { ...jun, id: 'a', km: 2 }, { ...jun, id: 'c', km: 1.5 }];
add('D2 beste Station = größte Summe der Striche, bei Gleichstand die nähere, dann die Kennung: am Aletsch das Jungfraujoch (0,1 km, in der Spanne, 20 min alt = 9) vor Flesch (1,9 km = 8); gefüllter Marker nur für sie',
  M.stnMatchSum(mJun) === 9 && M.stnMatchSum(mFle) === 8 && M.stnBest(vAle.stations, gOf(ALE).z, NOW) === 'ch:JUN' && M.stnBest(tie, gOf(ALE).z, NOW) === 'c' && M.stnBest(tie.slice(0, 2), gOf(ALE).z, NOW) === 'a' && M.stnBest([], z, NOW) === null
  && /className=\{`gl-sm-pin\$\{best \? ' is-best' : ''\}`\}/.test(heute),
  `${JSON.stringify(mJun)} ${JSON.stringify(mFle)}`);
const mvJun = M.stnMainValues(jun).map((v) => v.q).join(), mvFle = M.stnMainValues(fle).map((v) => v.q).join();
const sch = vAlp.stations.find((s) => s.values.some((v) => v.q === 'dsnow'));
add('D3 Wertekarte an der Station: ein bis drei gezeigte Werte in fester Reihenfolge (Jungfraujoch Temperatur, Wind, Böe — die Strahlung bleibt in der Liste; Flesch nur die Schneehöhe); die Änderung der Schneehöhe steht nie auf der Karte; ohne Wert „Keine Daten“',
  mvJun === 't,wind,gust' && mvFle === 'snow' && sch && !M.stnMainValues(sch).some((v) => v.q === 'dsnow') && M.stnMainValues({ ...jun, values: jun.values.map((v) => ({ ...v, text: null })) }).length === 0 && /Keine Daten<\/span>/.test(heute),
  `${mvJun} | ${mvFle} | ${sch && M.stnMainValues(sch).map((v) => v.q)}`);

// ── E glacier without a station ────────────────────────────────────────────────────────────────────────────────────────
const bbBla = bboxOf(geomOf(BLA));
add('E1 Gletscher ohne Station in Reichweite (Blaueis): keine Sicht, kein Ebeneninhalt (die Stationsebene wird gar nicht gerendert, der Knopf ist aus), EIN neutraler Satz mit dem Fenster der Zuordnung, Rahmen wie heute (ohne Stationen = Box des Umrisses)',
  vBla === null && JSON.stringify(M.heuteFrame(bbBla, [])) === JSON.stringify([[bbBla[0], bbBla[1]], [bbBla[2], bbBla[3]]])
  && /\{stnView \? \(\s*<Suspense/.test(brief) && /disabled=\{!stnView\}/.test(brief)
  && /`Keine Messstation in der Nähe: bis \$\{STN_MAP_KM\} km vom Rand und höchstens \$\{STN_MAP_DZ\} m über oder unter der Höhenspanne des Gletschers steht keine\.`/.test(brief)
  && C.STN_MAP_KM === 5 && C.STN_MAP_DZ === 300);

// ── F, G: rendered without a browser ───────────────────────────────────────────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'dkh-'));
writeFileSync(join(tmp, 'maplibre-stub.mjs'), 'class Marker { setLngLat() { return this; } addTo() { return this; } remove() {} }\nexport default { Marker };\n');
const bundleFile = join(tmp, 'heute.mjs');
await build({
  stdin: { resolveDir: ROOT, loader: 'ts', contents: `
    export { default as GlacierStationsHeute } from './src/glacier/GlacierStationsHeute.tsx';
    export { GlacierStationBlock, StnOperator } from './src/glacier/GlacierStationCard.tsx';
    export { createElement } from 'react';
    export { renderToStaticMarkup } from 'react-dom/server';
  ` },
  bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile: bundleFile, logLevel: 'silent', jsx: 'automatic',
  loader: { '.css': 'empty' }, alias: { 'maplibre-gl': join(tmp, 'maplibre-stub.mjs') },
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'process.env.NODE_ENV': '"production"' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const R = await import(pathToFileURL(bundleFile).href);
const html = (comp, props) => R.renderToStaticMarkup(R.createElement(comp, props));
const textOf = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const opLine = (m) => /<p class="gl-stn-op">[\s\S]*?<\/p>/.exec(m)?.[0] ?? '';
const bad = (line) => /\.\s*\.|\s\.(\s|$)/.test(textOf(line));
const opFle = html(R.StnOperator, { s: fle });
const slf = '<a href="https://www.slf.ch" target="_blank" rel="noopener noreferrer">WSL-Institut für Schnee- und Lawinenforschung SLF</a>';
// negative control: the sentence as it was glued before phase DK-H, read with the link not seen as a word
const oldGlue = `<p class="gl-stn-where">1,9 km vom Rand des Gletschers, 647 m unter der mittleren Höhe des Gletschers. ${slf}.</p>`;
const cardAle = html(R.GlacierStationBlock, { view: vAle, z: gOf(ALE).z, nowMs: NOW });
const allOps = [...vAle.stations, ...vAlp.stations].map((s) => html(R.StnOperator, { s }));
add('F1 Betreiber-Zeile der IMIS-Station (Flesch am Aletsch): eigene Zeile „Betreiber: ‹Link auf www.slf.ch›“ ohne angeklebte Satzzeichen — weder „. .“ noch „..“ noch „ .“, auch für jede andere Station; der Satz davor endet mit genau einem Punkt; Gegenprobe: die alte Klebung zeigt „. .“, sobald der Link nicht als Wort gelesen wird',
  opFle === `<p class="gl-stn-op"><span>Betreiber:</span> ${slf}</p>` && !bad(opFle) && allOps.every((o) => !bad(o) && o.startsWith('<p class="gl-stn-op"><span>Betreiber:</span> '))
  && cardAle.includes(`647 m unter der mittleren Höhe des Gletschers.</p>${opFle}`) && !cardAle.includes('Gletschers. <a') && bad(oldGlue.replace(slf, '')) && !bad(opFle.replace(slf, ''))
  && !/\.\s*\./.test(textOf(opLine(cardAle))),
  `${textOf(opFle)} | alt ohne Link: „${textOf(oldGlue.replace(slf, ''))}“`);

const panelAle = html(R.GlacierStationsHeute, { g: gOf(ALE), view: vAle, map: null, geometry: gAle, show: true, view3d: false, nowMs: NOW, selected: null, onSelect: () => {} });
const panelAlp = html(R.GlacierStationsHeute, { g: gOf(ALP), view: vAlp, map: null, geometry: gAlp, show: true, view3d: false, nowMs: NOW, selected: vAlp.stations[1].id, onSelect: () => {} });
const shownAle = vAle.stations.flatMap((s) => s.values).filter((v) => v.text != null).length, shownAlp = vAlp.stations.flatMap((s) => s.values).filter((v) => v.text != null).length;
const nMeas = (m) => (m.match(/data-origin="measured"/g) ?? []).length;
add('G1 die Liste (ohne Browser): jede Station mit Nummer, Name, Höhe, Alter; ALLE Werte der bisherigen Karte (jeder gezeigte als `gl-num` mit `data-origin="measured"`, kein `model`); die drei Striche je Station mit Worten („Nähe 3 von 3“); der feste Satz; Abstand und Höhe in Worten; der Vermerk je Netz mit Lizenz',
  vAle.stations.every((s, i) => panelAle.includes(`<b>${s.name}</b>`) && panelAle.includes(`aria-hidden="true">${i + 1}</span>`))
  && (panelAle.match(/class="gl-num" data-origin="measured"/g) ?? []).length === shownAle && (panelAlp.match(/class="gl-num" data-origin="measured"/g) ?? []).length === shownAlp
  && nMeas(panelAle) === vAle.stations.length + shownAle && !/data-origin="model"/.test(panelAle + panelAlp)
  && panelAle.includes(`aria-label="Nähe ${mJun.near} von 3"`) && (panelAle.match(/role="img" aria-label="(Nähe|Höhe|Aktuell) \d von 3"/g) ?? []).length === 3 * vAle.stations.length
  && panelAle.includes(`${C.GLACIER_STN_SITE_NOTE}.`) && panelAle.includes('1,9 km vom Rand des Gletschers, 647 m unter der mittleren Höhe des Gletschers.')
  && panelAle.includes('<span>Betreiber:</span> MeteoSchweiz</p>') && panelAle.includes(slf) && panelAlp.includes('>Datenquelle: Land Tirol - data.tirol.gv.at</a>')
  && panelAlp.includes('Änderung der Schneehöhe') && panelAle.includes('Die Werte des SLF sind Mittel über 30 Minuten'),
  `Aletsch gezeigt ${shownAle}, measured ${nMeas(panelAle)} | Alpeiner gezeigt ${shownAlp}`);
add('G2 Auswahl: der gewählte Eintrag trägt `is-sel` und `aria-pressed="true"` (Liste) — dieselbe Kennung färbt den Marker (`is-sel`, `aria-pressed`); ein Eintrag ohne Auswahl trägt `aria-pressed="false"`; Höhenstreifen mit allen Stationen in Worten',
  panelAlp.includes(`class="gl-sl-item is-sel`) && (panelAlp.match(/aria-pressed="true"/g) ?? []).length === 1 && (panelAle.match(/aria-pressed="false"/g) ?? []).length === vAle.stations.length
  && /el\.classList\.toggle\('is-sel', id === selected\)/.test(heute) && /aria-pressed=\{sel\}/.test(heute)
  && /Station 1 Jungfraujoch auf 3[\s\S]?571 m, Station 2 Flesch auf 2[\s\S]?500 m/.test(panelAle));
const texts = [...stationViewTexts(vAle, NOW), ...stationViewTexts(vAlp, NOW), textOf(panelAle), textOf(panelAlp), M.dzShort(424), M.dzShort(-647), ...Object.values(M.STN_SHORT_LABEL),
  ...[...brief.matchAll(/'(Stationen werden geladen …|Die Zuordnung der Messstationen ist nicht ladbar\.|Der Datenspeicher nennt noch keine Stationsmessungen\.)'/g)].map((m) => m[1])];
add('G3 Wortlaut: kein gesperrtes Wort (`glacierForbiddenWords`), keine Warn- oder Zustandssprache, kein Vergleich mit dem Modell, nichts über Spalten oder Schneebrücken; „Eine Messung ersetzt keinen Modellwert.“ steht da',
  texts.length > 20 && texts.every((t) => glacierForbiddenWords(t).length === 0 && !/gefahr|gefährlich|warnung|wärmer|kälter|abweichung|spalte|schneebrücke|sicher\b|begehbar|frei\b/i.test(t))
  && panelAle.includes('Eine Messung ersetzt keinen Modellwert.'), texts.filter((t) => glacierForbiddenWords(t).length).join(' | '));
rmSync(tmp, { recursive: true, force: true });

// ── H build rules ──────────────────────────────────────────────────────────────────────────────────────────────────────
const board = src('src/glacier/GlacierHeuteBoard.tsx');
const at = (re) => board.search(re);
const order = [at(/<div className="gl-hb-wx">/), at(/gl-hb-row--melt/), at(/gl-hb-row--week/), at(/<section className="gl-hb-tour"/), at(/\{sources\}/)];
add('H1 Reihenfolge unter der Karte: Wetter am Gletscher (Modell an drei Höhen, darin die Tage) → Schmelze und Frost (im Winter kleiner) → Tour → Quellen (eingeklappt); „Gemessen in der Nähe“ steht im Dossier nicht mehr unter dem Modell, sondern in der Liste neben der Karte',
  order.every((i) => i > 0) && order.every((v, i) => i === 0 || v > order[i - 1]) && (board.match(/gl-hb-wx/g) ?? []).length === 1
  && /const stationCard = stationPointer && layout !== 'dossier' \?/.test(brief) && /winter=\{isHeuteWinter\(nowMs\)\}/.test(brief) && /<details className="gl-ds-card gl-ds-sec gl-ds-fold" data-tab="quellen">/.test(brief)
  && M.isHeuteWinter(Date.parse('2026-11-22T12:00:00Z')) && M.isHeuteWinter(Date.parse('2026-04-30T12:00:00Z')) && !M.isHeuteWinter(Date.parse('2026-05-01T12:00:00Z')) && !M.isHeuteWinter(Date.parse('2026-07-15T12:00:00Z')),
  `Positionen ${order.join(', ')}`);
add('H2 Karte nur mit MapLibre-Mitteln: eine GeoJSON-Linienebene (gestrichelt) und DOM-Marker; keine eigene Ebene (`custom`), kein Shader, kein WebGL; in 3D setzt MapLibre die Marker aufs Gelände und eine senkrechte Linie (`gl-sm-stem`) trägt die Nummer',
  /new maplibregl\.Marker\(\{ element: el, anchor: 'center' \}\)/.test(heute) && /type: 'line', source: SRC, paint: \{ 'line-color': '#FFFFFF', 'line-width': 2\.2, 'line-dasharray'/.test(heute)
  && !/type: 'custom'|getContext|WebGL|gl_Frag|precision |shader/i.test(code(heute) + code(src('src/glacier/glacierStationMap.ts'))) && /el\.classList\.toggle\('is-3d', view3d\)/.test(heute)
  && /\.gl-sm\.is-3d \.gl-sm-stem \{ display: block; \}/.test(cssSt));
add('H3 neue UI als Lazy-Chunk: der Steckbrief lädt `GlacierStationsHeute` nur per `lazy(() => import(…))` (kein statischer Import), die CSS-Datei hängt am Chunk; ohne Schalter an für alle (Ebene „Stationen“ ab Werk an; keine URL-, Flag- oder Speicherabfrage in den neuen Dateien)',
  /const GlacierStationsHeute = lazy\(\(\) => import\('\.\/GlacierStationsHeute'\)\);/.test(brief) && !/^import .*GlacierStationsHeute/m.test(brief) && /^import '\.\/glacierStations\.css';\r?$/m.test(heute)
  && /const \[showStations, setShowStations\] = useState\(true\);/.test(brief) && !/location|URLSearchParams|localStorage|glacierFlag|sessionStorage/.test(code(heute) + code(src('src/glacier/glacierStationMap.ts'))));
let changed = [];
try { changed = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); } catch { changed = ['<git nicht lesbar>']; }
const pkgNow = JSON.parse(src('package.json')).dependencies, pkgHead = (() => { try { return JSON.parse(execFileSync('git', ['show', 'HEAD:package.json'], { cwd: ROOT, encoding: 'utf8' })).dependencies; } catch { return null; } })();
add('H4 keine neue Abhängigkeit, nichts an buscosun Fusion, an Edge Functions, Shadern oder an der Windpartikel-Klasse (Arbeitsbaum gegen HEAD)',
  pkgHead && JSON.stringify(Object.keys(pkgNow).sort()) === JSON.stringify(Object.keys(pkgHead).sort()) && !changed.some((f) => /^src\/pointForecast\/|^netlify\/edge-functions\/|^src\/wind\/|shaders?\.|\.glsl$/.test(f)),
  changed.join(', '));
const sheetCss = src('src/glacier/glacierSheet.css');
const MQ = '@media (max-width: 767px), (max-width: 1439px) and (pointer: coarse) {';
const mqBlock = cssSt.slice(cssSt.indexOf(MQ));
add('H5 Telefon allein in der Media Query des Dossiers (767 px / grob bis 1439 px): Karte mit Nummer und EINEM Wert (Karte aus, Pille an), Blatt für die gewählte Station, die übrigen als Zeilen; Ebenen-Chips scrollen waagrecht; Trefferflächen ≥ 44 px (Marker 30 px + 2 × 9 px, Zeile 48/52 px, Schließen 44 px, Chips 44 px); nur Gletscher-Tokens als Farben (außer Weiß)',
  cssSt.includes(MQ) && /\.gl-sm-card \{ display: none; \}/.test(mqBlock) && /\.gl-sm-pill \{ display: block; \}/.test(mqBlock) && /\.gl-sl-item\.is-sel \.gl-sl-body \{ display: flex; \}/.test(mqBlock) && /\.gl-sl-body \{ display: none; \}/.test(mqBlock)
  && /\.gl-sm-pin \{[^}]*width: 30px; height: 30px;/.test(cssSt) && /\.gl-sm-pin::before \{ content: ''; position: absolute; inset: -9px;/.test(cssSt) && /\.gl-sl-head \{[^}]*min-height: 48px;/.test(cssSt) && /\.gl-sl-close \{ display: block; min-height: 44px;/.test(mqBlock)
  && /\.gl-ds-maptools \{ flex-wrap: nowrap; overflow-x: auto;/.test(sheetCss.slice(sheetCss.lastIndexOf(MQ))) && /\.gl-ds-lay, \.gl-ds-maptools \.gl-input \{ height: 44px; \}/.test(sheetCss)
  && !/#[0-9a-fA-F]{3,8}/.test(cssSt.replace(/#fff\b/gi, '')) && !/@keyframes|animation:/.test(cssSt));

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok ? '' : `\n       ${c.detail}`}`);
console.log(`\nverify:glacier-dossier-heute ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
