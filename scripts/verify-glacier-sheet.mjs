/**
 * verify:glacier-sheet — Phase GL, package GL-4 (audit/gletscher.md §GL-4): the pure logic of the glacier sheet against REAL documents of four glaciers
 * (`scripts/lib/fixtures/glacier/sheet-extract.json`, cut from a full tree by `make-sheet-fixture.mjs`): length and area series, mass balance,
 * the albedo anomaly (and when it is refused), the TSLA band against a snow line, the projection as a range, the melt view and its freshness,
 * the tour lines and their forbidden words, the table of sources, the meridian clipping of the compare slider and the snow-zone image from the
 * elevation grid (independent of the canvas). Every rule with a negative control.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-sheet.mjs
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  longestLength, cumulativeLength, massRows, latestMass, areaChange, seasonSummary, albedoAnomaly, climaBand, againstBand, projectionView, projectionSentence,
  meltView, indexWord, tourLines, tourProblems, TOUR_DISCLAIMER, sourceRows, isoDoy, sceneOf, STATE_TEXT, seriesCsv,
} from '../src/glacier/glacierSheetModel.ts';
import { readFavs, writeFavs, toggleFav, readLast, writeLast, newSinceLastVisit, GLACIER_FAV_MAX } from '../src/glacier/glacierFollow.ts';
import { bboxOf, clipAtLng, renderSnowZone, renderSnowZoneAsync, polygonMask, mercY } from '../src/glacier/glacierGeo.ts';
import { demDecode, demSample, glacierFlagsMask } from '../src/glacier/glacierSatContract.ts';
import { glacierForbiddenWords } from '../src/glacier/glacierContract.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'glacier', 'sheet-extract.json'), 'utf8'));
const SAT = JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'glacier', 'sat-extract.json'), 'utf8'));
const STATIC = JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'glacier', 'static-extract.json'), 'utf8'));
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
const hef = FX.glaciers.hef, hefCat = STATIC.catalogRows.hef, cCat = STATIC.catalogRows.cClassCh;
const withId = (list, id) => list.map((s) => ({ ...s, id }));

// F — fixture
const sha = createHash('sha256').update(JSON.stringify({ g: FX.glaciers, m: FX.melt })).digest('hex');
add('F1 Fixture: Prüfsumme stimmt; vier Gletscher (A, B, C, DE) mit Umriss, früheren Umrissen, Reihen, Projektion; die Schmelzzeilen sind die eines echten Laufs (nur der Laufstempel verschoben)', sha === FX.sha256 && Object.keys(FX.glaciers).length === 4 && FX.glaciers.hef.dem && FX.glaciers.hef.clima && FX.glaciers.hef.epochs.length >= 1 && /echten Laufs/.test(FX.melt.note), `${sha.slice(0, 12)} ${Object.keys(FX.glaciers)}`);

// S — series
{
  const series = withId(hef.series, hefCat.id);
  const len = longestLength(series), cum = cumulativeLength(len);
  const raw = len.rows.reduce((s, r) => s + r[2], 0);
  add('S1 Längenreihe: die längste Messreihe wird gewählt (50 Jahre, nicht die mit 2), kumuliert vom ersten Jahr; Summe = Summe der Jahreswerte, Lücken benannt', len.rows.length >= 40 && cum.points[0].cum === 0 && near(cum.total, Math.round(raw * 10) / 10, 0.11) && cum.from === len.rows[0][0] && cum.to === len.rows[len.rows.length - 1][1] && cum.gaps >= 0, JSON.stringify({ n: len.rows.length, total: cum.total, raw, gaps: cum.gaps }));
  const lucky = cumulativeLength({ ...len, rows: [[2000, 2001, -10], [2003, 2004, -5]] });
  add('S1b Gegenprobe: eine Reihe mit Lücke von 2 Jahren meldet 2 Jahre ohne Messung und setzt sie NICHT auf 0', lucky.gaps === 2 && lucky.total === -15, JSON.stringify(lucky));
  const mass = latestMass(massRows(series));
  add('S2 Massenbilanz: die jüngste Zeile mit Jahr, Winter-, Sommer-, Jahresbilanz, Gleichgewichtslinie und AAR (HEF 2025: Ba −1 793 mm w. e., GWL 3 302 m, AAR 0,24 — UIBK)', mass.year === 2025 && mass.ba === -1793 && mass.ela === 3302 && near(mass.aar, 0.24, 0.001), JSON.stringify(mass));
  const ac = areaChange(series);
  add('S3 Flächenänderung: von der ersten zur letzten Inventarzeile, in Prozent, mit beiden Jahren (2015 → 2023)', ac && ac.from[0] === 2015 && ac.to[0] === 2023 && near(ac.pct, ((ac.to[1] - ac.from[1]) / ac.from[1]) * 100, 1e-9) && ac.pct < 0, JSON.stringify(ac));
  add('S3b Gegenprobe: eine einzelne Flächenzeile ergibt keine Änderung (null), kein „0 %“', areaChange([{ kind: 'area', rows: [[2015, 6.1]] }]) === null, '');
}

// A — satellite season
const rowsHef = SAT.seasons['2026/at-oetztaler-alpen'].glaciers[hefCat.id];
{
  const sum = seasonSummary(rowsHef, 'A');
  add('A1 Saison Klasse A: Szenen nach Datum, höchste Schneegrenze (nur Zustand „Schneegrenze“), AAR der jüngsten Szene mit AAR; Klasse B bekommt weder Schneegrenze noch AAR', sum.scenes.length === rowsHef.length && sum.scenes.every((s, i, a) => i === 0 || a[i - 1].date <= s.date) && (sum.highest == null || sum.scenes.filter((s) => s.state === 1).every((s) => s.sla <= sum.highest.sla)) && seasonSummary(rowsHef, 'B').highest === null && seasonSummary(rowsHef, 'B').aar === null, JSON.stringify({ n: sum.scenes.length, hi: sum.highest, aar: sum.aar }));
  add('A2 Zustandstexte: schneebedeckt / Schneegrenze im Gletscher / schneefrei (keine Schneegrenze „unter der Zunge“ oder „über dem Gipfel“ als Höhe)', STATE_TEXT[0] === 'schneebedeckt' && STATE_TEXT[2] === 'schneefrei' && !/unter der Zunge|über dem Gipfel/.test(Object.values(STATE_TEXT).join(' ')), '');
  add('A3 Tag des Jahres: 1. Januar = 1, 1. Mai 2026 = 121, 31. Dezember 2024 = 366', isoDoy('2026-01-01') === 1 && isoDoy('2026-05-01') === 121 && isoDoy('2024-12-31') === 366, `${isoDoy('2026-05-01')}`);
  // albedo anomaly: needs ≥ 3 scenes now and ≥ 2 earlier years with ≥ 3 scenes in the window
  const mk = (y, vals, doy0 = 230) => vals.map((a, i) => { const d = new Date(Date.UTC(y, 0, doy0 + i * 2)); return [d.toISOString().slice(0, 10), 0.95, 0.2, 2, null, null, null, a, 0]; });
  const by = new Map([[2023, mk(2023, [0.30, 0.31, 0.29])], [2024, mk(2024, [0.31, 0.32, 0.30])], [2025, mk(2025, [0.26, 0.25, 0.27])]]);
  const an = albedoAnomaly(by, 2025);
  add('A4 Albedo-Anomalie: Mittel dieses Jahres gegen das Mittel der früheren Jahre im selben Zeitfenster (−0,05), mit Zahl der Szenen und Jahre', an && near(an.delta, -0.05, 0.011) && an.nNow === 3 && an.nBefore === 6 && an.years.join() === '2023,2024', JSON.stringify(an));
  const thin = new Map([[2024, mk(2024, [0.31, 0.32, 0.30])], [2025, mk(2025, [0.26, 0.25, 0.27])]]);
  const few = new Map([[2023, mk(2023, [0.30, 0.31, 0.29])], [2024, mk(2024, [0.31, 0.32, 0.30])], [2025, mk(2025, [0.26, 0.25])]]);
  const far = new Map([[2023, mk(2023, [0.30, 0.31, 0.29], 120)], [2024, mk(2024, [0.31, 0.32, 0.30], 120)], [2025, mk(2025, [0.26, 0.25, 0.27])]]);
  add('A5 keine dünne Anomalie: nur ein früheres Jahr, nur zwei Szenen dieses Jahres, oder frühere Szenen in einem anderen Teil des Jahres ⇒ null (Gegenproben)', albedoAnomaly(thin, 2025) === null && albedoAnomaly(few, 2025) === null && albedoAnomaly(far, 2025) === null, '');
  const snowy = new Map([[2023, mk(2023, [0.30, 0.31, 0.29])], [2024, mk(2024, [0.31, 0.32, 0.30])], [2025, mk(2025, [0.26, 0.25, 0.27]).map((r) => { r[8] = glacierFlagsMask(['neuschnee']); return r; })]]);
  add('A5b Szenen mit Neuschnee-Marke zählen nicht in die Anomalie (Gegenprobe zu A4)', albedoAnomaly(snowy, 2025) === null, '');
  const flagged = rowsHef.map(sceneOf);
  add('A6 Marken der Szene werden aus der Bitmaske gelesen (Neuschnee, Schatten, Schutt)', glacierFlagsMask(['neuschnee']) === 1 && flagged.every((s) => Array.isArray(s.flags)), JSON.stringify(flagged.map((s) => s.flags)));
}

// B — TSLA band
{
  const band = climaBand(hef.clima.entry, hef.clima.doy0, hef.clima.bin);
  add('B1 Band 2000–2025: Wochen mit p10 ≤ p50 ≤ p90 und mindestens 15 Beobachtungen, Lage in der Mitte der Woche; Wochen ohne Daten fehlen (nicht als Null)', band.length >= 15 && band.every((b) => b.p10 <= b.p50 && b.p50 <= b.p90 && b.n >= 15) && band.every((b, i, a) => i === 0 || b.doy > a[i - 1].doy), `${band.length} Wochen, ${band[0].doy}–${band[band.length - 1].doy}`);
  const mid = band[Math.floor(band.length / 2)];
  const above = againstBand(band, mid.doy, mid.p90 + 120), within = againstBand(band, mid.doy, mid.p50), below = againstBand(band, mid.doy, mid.p10 - 120), none = againstBand(band, 5, 3000);
  add('B2 Schneegrenze gegen das Band: darüber / innerhalb / darunter mit Abweichung vom Median in m; eine Szene außerhalb der Wochen des Bandes ⇒ null', above.where === 'above' && within.where === 'within' && within.dev === 0 && below.where === 'below' && above.dev === Math.round(mid.p90 + 120 - mid.p50) && none === null, JSON.stringify({ above: above.where, within: within.where, below: below.where, none }));
  add('B2b Gegenprobe: ohne Klimatologie (Klasse B, DE) ist das Band leer', climaBand(undefined, 120, 7).length === 0, '');
}

// P — projection
{
  const pv = projectionView(hef.proj, hef.proj.entry);
  const sentence = projectionSentence(pv);
  const m = /(\d{4})–(\d{4}|nach 2100)/.exec(sentence);
  add('P1 Projektion: je Szenario Median und Spanne p10–p90 in Prozent des Volumens 2020, die Spanne über die Szenarien als Satz „von–bis“, nie ein einzelnes Jahr', pv.scenarios.length === 4 && pv.scenarios.every((s) => s.p50[0] === 100 && s.p10.every((v, i) => v <= s.p50[i] + 1e-9 && s.p50[i] <= s.p90[i] + 1e-9)) && !!m && Number(m[1]) < (m[2] === 'nach 2100' ? 2101 : Number(m[2])) && /nie ein einzelnes Jahr/.test(sentence), sentence);
  const never = projectionSentence({ ...pv, range: null });
  add('P1b Gegenprobe: ohne Jahr unter 10 % in irgendeinem Szenario steht „in keinem Szenario vor 2100“, kein Jahr', /in keinem Szenario vor 2100/.test(never) && !/\d{4}–/.test(never), never);
  add('P1c ein offenes Ende (ein Modell erreicht 10 % nicht vor 2100) steht als „nach 2100“, nie als Zahl', /nach 2100/.test(projectionSentence({ ...pv, range: { from: 2060, to: null } })), '');
  add('P2 Projektion fehlt ⇒ null (DE und kleine Gletscher ohne Zuordnung bekommen kein erfundenes Band)', projectionView(null, undefined) === null && projectionView(hef.proj, undefined) === null && FX.glaciers.blaueis.proj === null, '');
}

// M — melt view
{
  const doc = FX.melt, row = doc.glaciers.find((r) => r.id === hefCat.id);
  const now = Date.parse(doc.runAt) + 3 * 3_600_000;
  const v = meltView(doc, row, now);
  add('M1 Schmelzansicht: frisch (≤ 30 h), Index des heutigen Tages (Tag 0) als [p10, p50, p90], Einheit gesperrt, Stand von buscosun Fusion benannt', v.fresh && v.ageH === 3 && v.unit === false && v.todayIdx.join() === row.idx[0].join() && /buscosun Fusion \d+/.test(v.engine) && /nicht bestanden/.test(v.gateReason), JSON.stringify({ today: v.todayIdx, ageH: v.ageH, engine: v.engine }));
  const stale = meltView(doc, row, Date.parse(doc.runAt) + 31 * 3_600_000);
  add('M2 ab 30 Stunden Alter: nicht frisch — die Oberfläche zeigt „Keine Daten“, keine Zahl (Gegenprobe zu M1)', stale.fresh === false && stale.ageH === 31, '');
  add('M3 zweiter Tag: 25 Stunden nach dem Lauf ist „heute“ der Index von Tag 1', meltView(doc, row, Date.parse(doc.runAt) + 25 * 3_600_000).todayIdx.join() === row.idx[1].join(), '');
  add('M4 ohne Dokument oder Zeile: null (keine Ersatzzahl)', meltView(null, row, now) === null && meltView(doc, null, now) === null, '');
  add('M5 Index in Worten: relativ, nie Gefahr oder Freigabe (kaum / schwach / mäßig / stark / sehr starke Schmelze)', ['kaum Schmelze', 'schwache Schmelze', 'mäßige Schmelze', 'starke Schmelze', 'sehr starke Schmelze'].join() === [3, 20, 40, 70, 95].map(indexWord).join(), [3, 20, 40, 70, 95].map(indexWord).join());
}

// T — tour
{
  const doc = FX.melt, row = doc.glaciers.find((r) => r.id === hefCat.id);
  const mv = meltView(doc, row, Date.parse(doc.runAt) + 2 * 3_600_000);
  const sum = seasonSummary(rowsHef, 'A');
  const lines = tourLines({ ...hefCat }, mv, sum, Date.parse('2026-10-11T12:00:00Z'));
  add('T1 Tour: Zeile zum Zustand per Satellit — mit Herkunft; kein Wort „begehbar“, „sicher“, „frei“ (Prüfer über Zeilen und Vorbehalt)', lines.length >= 1 && lines.every((l) => l.origin && l.source && l.title && l.text) && tourProblems(lines).length === 0 && glacierForbiddenWords(TOUR_DISCLAIMER).length === 0 && /Kein Urteil über Begehbarkeit/.test(TOUR_DISCLAIMER), JSON.stringify(lines.map((l) => l.key)));
  const bad = tourProblems([...lines, { key: 'x', title: 'Zustand', text: 'Der Gletscher ist sicher begehbar und frei von Spalten', origin: 'model', source: 'x' }]);
  add('T1b Gegenprobe: ein Satz mit „sicher“, „begehbar“ und „frei“ wird vom Prüfer gefunden', bad.length === 1 && /sicher/.test(bad[0]) && /begehbar/.test(bad[0]) && /frei/.test(bad[0]), bad.join('|'));
  const none = tourLines({ ...hefCat }, null, null, Date.parse('2026-10-11T12:00:00Z'));
  add('T2 ohne Schmelzlauf und ohne Szene gibt es keine Zeilen — keine Zeilen mit erfundenen Werten', none.length === 0, JSON.stringify(none.map((l) => l.key)));
  const old = tourLines({ ...hefCat }, mv, { ...sum, last: { ...sum.last, date: '2026-08-01' } }, Date.parse('2026-10-11T12:00:00Z'));
  add('T3 eine Szene älter als 20 Tage erzeugt keine Satellitenzeile (Frische-Regel des Vertrags)', !old.some((l) => l.key === 'sat') && lines.some((l) => l.key === 'sat'), '');
}

// Q — sources
{
  const doc = FX.melt, row = doc.glaciers.find((r) => r.id === hefCat.id);
  const mv = meltView(doc, row, Date.parse(doc.runAt) + 3_600_000);
  const sum = seasonSummary(rowsHef, 'A');
  const series = withId(hef.series, hefCat.id);
  const len = longestLength(series);
  const full = sourceRows({ g: hefCat, hasLength: true, hasMass: true, area: areaChange(series), melt: mv, season: sum, clima: true, proj: true, anomaly: false, mass: latestMass(massRows(series)), lengthSeries: len, nowMs: Date.now() });
  const minimal = sourceRows({ g: cCat, hasLength: false, hasMass: false, area: null, melt: null, season: null, clima: false, proj: false, anomaly: false, mass: null, lengthSeries: null, nowMs: Date.now() });
  add('Q1 Quellenliste: eine Zeile je gezeigter Zahl mit Herkunft und Stand (Fläche, Änderung, Länge, Bilanz, Satellit, TSLA-Band, Schmelzindex, Projektion); der Schmelzindex nennt „nicht in mm geeicht (Gate C nicht bestanden)“', full.length === 8 && full.every((r) => ['measured', 'satellite', 'model', 'official'].includes(r.origin) && r.stand && r.source) && /Gate C nicht bestanden/.test(full.find((r) => r.what.startsWith('Schmelzindex')).source) && full.find((r) => r.what.startsWith('Schmelzindex')).origin === 'model', full.map((r) => r.what.slice(0, 18)).join(' | '));
  add('Q1b Gegenprobe: ein Gletscher ohne Reihen, ohne Szene, ohne Schmelzlauf und ohne Projektion bekommt nur die Zeile der Fläche — nichts wird auf Vorrat gelistet', minimal.length === 1 && /Fläche/.test(minimal[0].what), JSON.stringify(minimal.map((r) => r.what)));
}

// G — geometry
{
  const geo = hef.geometry;
  const bb = bboxOf(geo);
  const area = (g) => { const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; let s = 0; for (const p of polys) p.forEach((ring, i) => { let a = 0; for (let k = 0; k + 1 < ring.length; k++) a += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1]; s += (i === 0 ? 1 : -1) * Math.abs(a) / 2; }); return s; };
  const mid = (bb[0] + bb[2]) / 2;
  const west = clipAtLng(geo, mid, 'west'), east = clipAtLng(geo, mid, 'east');
  add('G1 Vergleichsregler: der Umriss an einem Längengrad geteilt — Westteil + Ostteil = ganzer Umriss (Fläche auf 1 %), jeder Teil liegt auf seiner Seite', west && east && near((area(west) + area(east)) / area(geo), 1, 0.01) && bboxOf(west)[2] <= mid + 1e-9 && bboxOf(east)[0] >= mid - 1e-9, `${(area(west) / area(geo)).toFixed(3)} + ${(area(east) / area(geo)).toFixed(3)}`);
  add('G1b Gegenprobe: links der gesamten Ausdehnung bleibt von der Westseite nichts, rechts davon alles; der Schnitt ändert die Eingabe nicht', clipAtLng(geo, bb[0] - 0.1, 'west') === null && near(area(clipAtLng(geo, bb[2] + 0.1, 'west')) / area(geo), 1, 1e-9) && bboxOf(geo)[0] === bb[0], '');
  // snow zone from the elevation grid: independent check against the area-weighted hypsometry
  const grid = hef.dem;
  const sla = hefCat.z[1];
  const zone = renderSnowZone({ geometry: geo, grid, sla, mask: polygonMask });
  const h = hef.hypso;
  let above = 0, total = 0;
  h.a.forEach((a, i) => { const z = h.z0 + 50 * (i + 0.5); total += a; if (z >= sla) above += a; });
  add('G2 Schneezone aus dem Höhengitter: der Anteil der Fläche ab der Schneegrenze (Medianhöhe) stimmt mit der Höhenband-Fläche überein (±5 Punkte); Bild liegt auf dem Umrisskasten, Zeile 0 = Norden', zone && near(zone.snowShare, above / total, 0.05) && zone.coordinates[0][1] > zone.coordinates[3][1] && zone.data.length === zone.width * zone.height * 4, `${zone?.snowShare.toFixed(3)} gegen ${(above / total).toFixed(3)}`);
  const z0 = renderSnowZone({ geometry: geo, grid, sla: -1e9, mask: polygonMask }), z1 = renderSnowZone({ geometry: geo, grid, sla: 1e9, mask: polygonMask });
  add('G2b Grenzfälle: „schneebedeckt“ (Grenze −∞) = 100 % Schnee, „schneefrei“ (+∞) = 0 % (Gegenproben)', z0.snowShare === 1 && z1.snowShare === 0, `${z0.snowShare} ${z1.snowShare}`);
  // the sliced variant: same image byte for byte, yields to the event loop between slices, stops when it is no longer wanted
  let yields = 0;
  const tick = setInterval(() => { yields++; }, 0);
  const asyncZone = await renderSnowZoneAsync({ geometry: geo, grid, sla, mask: polygonMask }, () => true, 0.2);
  clearInterval(tick);
  let calls = 0;
  const stopped = await renderSnowZoneAsync({ geometry: geo, grid, sla, mask: polygonMask }, () => ++calls < 3, 0.2);
  add('G2c Schneezone in Zeitscheiben: dasselbe Bild Byte für Byte wie am Stück, der Ereignisablauf kommt zwischen den Scheiben dran (ein 200-ms-Block würde auf dem Handy zur Long Task), und ein Abbruch („neue Szene“) liefert null statt eines veralteten Bildes', asyncZone && Buffer.compare(Buffer.from(asyncZone.data), Buffer.from(zone.data)) === 0 && asyncZone.snowShare === zone.snowShare && yields >= 2 && stopped === null, `${yields} Wechsel in den Ereignisablauf, Abbruch → ${stopped}`);
  const ele = demDecode(grid);
  add('G3 Höhengitter: Zellen im Umriss liegen im Höhenbereich des Katalogs (± Mischzellen), Stichprobe in der Mitte des Gitters gültig', (() => { let lo = Infinity, hi = -Infinity; for (let j = 5; j < grid.ny - 5; j += 3) for (let i = 5; i < grid.nx - 5; i += 3) { const e = demSample(grid, ele, (grid.x0 + i + 0.5) / 3600, (grid.y1 - j - 0.5) / 3600); if (e != null) { lo = Math.min(lo, e); hi = Math.max(hi, e); } } return lo > hefCat.z[0] - 700 && hi < hefCat.z[2] + 400; })(), '');
  add('G4 Mercator: die Zeilen des Schneebildes folgen der Web-Mercator-Projektion (Breite nördlich > südlich, mercY monoton)', mercY(47) > mercY(46) && near(mercY(0), 0, 1e-12), '');
}

// D — CSV download
{
  const series = withId(hef.series, hefCat.id);
  const csv = seriesCsv(hefCat, series, '2026-10-11');
  const lines = csv.split('\n').filter(Boolean);
  const head = lines.filter((l) => l.startsWith('#')), data = lines.filter((l) => !l.startsWith('#'));
  // a small RFC-4180 reader for the check (quotes, doubled quotes)
  const parse = (l) => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
  const cells = data.slice(1).map(parse);
  const expectedLen = series.filter((x) => x.kind === 'length').reduce((n, x) => n + x.rows.length, 0);
  add('D1 CSV: Kommentarkopf (Gletscher, Abrufdatum, Lizenzhinweis), Spaltenkopf, je Zeile genau 8 Spalten; die Zahl der Längenzeilen stimmt mit den Reihen überein; Herkunft nur gemessen/amtlich; Quelle mit Komma bleibt EINE Zelle', head.length >= 3 && /Hintereisferner/.test(head[0]) && /2026-10-11/.test(head[1]) && /Lizenzen/.test(head[1]) && data[0] === 'reihe,herkunft,einheit,jahr_von,jahr,groesse,wert,quelle' && cells.every((c) => c.length === 8) && cells.filter((c) => c[0] === 'Länge').length === expectedLen && cells.every((c) => ['measured', 'official'].includes(c[1])) && cells.some((c) => c[7].includes(',')), `${cells.length} Zeilen, ${expectedLen} Längenzeilen`);
  const first = series.find((x) => x.kind === 'length').rows[0];
  const row = cells.find((c) => c[0] === 'Länge' && Number(c[3]) === first[0]);
  add('D2 CSV: die erste Längenzeile trägt die Jahre und den Wert der Reihe unverändert; Massenbilanz mit Winter, Sommer, Jahr, Gleichgewichtslinie und AAR; kein Wert für eine fehlende Zelle (kein „null“, kein „NaN“)', row && Number(row[4]) === first[1] && Number(row[6]) === first[2] && cells.some((c) => c[5] === 'Gleichgewichtslinie') && cells.some((c) => c[5] === 'AAR') && !/null|NaN|undefined/.test(csv), JSON.stringify(row));
  const tricky = seriesCsv({ ...hefCat, name: 'Ferner, "Nord"' }, [{ id: hefCat.id, kind: 'area', method: 'inventory', origin: 'official', source: 'Quelle, mit "Zitat"', unit: 'km²', rows: [[2015, 6.1], [2023, 5.6]] }], '2026-10-11');
  const tcells = tricky.split('\n').filter((l) => l && !l.startsWith('#')).slice(1).map(parse);
  add('D3 Gegenprobe Maskierung: Komma und Anführungszeichen in der Quelle bleiben eine Zelle und kommen unverändert zurück', tcells.length === 2 && tcells.every((c) => c.length === 8 && c[7] === 'Quelle, mit "Zitat"'), JSON.stringify(tcells[0]));
}

// R — follow list
{
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, m }; };
  const st = mem();
  const a = 'gl_ch_aaa', b = 'gl_at_bbb';
  add('R1 Folgen: neu gefolgt steht vorn, doppelt wird entfernt, die Liste hält höchstens 50, ungültige Kennungen und beschädigte Werte lesen sich als leer', (() => {
    let l = toggleFav([], a); l = toggleFav(l, b);
    const big = Array.from({ length: 55 }, (_, i) => `gl_ch_g${i}`).reduce((acc, id) => toggleFav(acc, id), []);
    st.setItem('gl.favs', JSON.stringify([...l, 'kein-id', 42, a]));
    const read = readFavs(st);
    st.setItem('gl.favs', '{kaputt');
    return l.join() === `${b},${a}` && toggleFav(l, a).join() === b && big.length === GLACIER_FAV_MAX && read.join() === `${b},${a}` && readFavs(st).length === 0 && readFavs(null).length === 0;
  })(), '');
  const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  add('R1b blockierter Speicher: Lesen = keine Gefolgten, Schreiben meldet false — nie ein Fehler in der Seite (Gegenprobe zu R1)', readFavs(throwing).length === 0 && writeFavs([a], throwing) === false && readLast(throwing) === null && (() => { writeLast(5, throwing); return true; })() && writeFavs([a], st) === true && readFavs(st).join() === a, '');
  const ev = (id, at, glacier) => ({ id, type: glacier ? 'snowline' : 'official', at, glacier, origin: glacier ? 'satellite' : 'official', text: 't', source: 's', w: 1 });
  const events = [ev('e1', '2026-10-09', a), ev('e2', '2026-10-09', 'gl_x'), ev('e3', '2026-10-10', null), ev('e4', '2026-10-01', a)];
  const last = Date.parse('2026-10-05T18:00:00Z');
  add('R2 Neu seit dem letzten Besuch: Ereignisse NACH dem Tag des Besuchs, die zu einem gefolgten Gletscher gehören oder amtlich sind (e1, e3); ein anderer Gletscher (e2), ein älteres (e4) nicht; ohne Besuch nichts', newSinceLastVisit(events, [a], last).map((e) => e.id).join() === 'e1,e3' && newSinceLastVisit(events, [a], null).length === 0 && newSinceLastVisit(events, [], last).map((e) => e.id).join() === 'e3', '');
  add('R2b derselbe Tag zählt nicht als neu (ein Ereignis vom Besuchstag ist schon gesehen)', newSinceLastVisit([ev('e5', '2026-10-05', a)], [a], last).length === 0, '');
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok ? '' : `\n       ${c.detail}`}`);
console.log(`\nverify:glacier-sheet ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
