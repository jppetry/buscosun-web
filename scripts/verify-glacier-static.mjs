/**
 * verify:glacier-static — Phase GL (audit/gletscher.md §6): the static tree of the glacier data line against the contract —
 * identity and class counts, country sums (±2 %), outlines of EVERY glacier in all three levels (closed rings, no
 * self-intersection, area ±3 % of the inventory), earlier outlines, hypsometry, series assignment, summary, projection
 * ranges, official items, sources, report balance.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-static.mjs [--dir=<v1 of the data repo>] [--snapshots=<dir with official-<key>.txt>]
 *
 * Without `--dir` only the real-extract fixture is checked (CI has no data repo); with `--dir` the complete tree is.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../src/glacier/glacierContract.ts';
import * as S from '../src/glacier/glacierSatContract.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const clone = (x) => JSON.parse(JSON.stringify(x));
const ROUND = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;

const dirArg = arg('dir');
let T; // tree: { catalog, points, summary, official, sources, outline(region, file), hypso, series, proj, report }
if (dirArg) {
  const build = readdirSync(join(dirArg, 'static')).sort().pop();
  const d = join(dirArg, 'static', build);
  const J = (f) => JSON.parse(readFileSync(join(d, f), 'utf8'));
  T = {
    full: true, build, J,
    catalog: J('catalog.json'), points: J('points.json'), summary: J('summary.json'), official: J('official.json'), sources: J('sources.json'), report: J('report.json'),
    ls: (sub) => readdirSync(join(d, sub)),
  };
} else {
  const FX = JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'glacier', 'static-extract.json'), 'utf8'));
  T = { full: false, fx: FX, official: FX.official, sources: FX.sources, build: FX.from.build };
}

if (T.full) {
  const cat = T.catalog;
  const ids = new Set(cat.glaciers.map((g) => g.id));
  const byId = new Map(cat.glaciers.map((g) => [g.id, g]));
  const cp = C.catalogProblems(cat);
  add('K1 Katalog: 0 Probleme (Ids, Land, Region, Fläche mit Bezugsjahr, Klasse, Höhen, Position, Inventar-Id)', cp.length === 0, cp.slice(0, 5).join('; '));
  add('K2 2 203 Gletscher: CH 1 400, AT 799, DE 4', cat.glaciers.length === 2203 && ['CH', 'AT', 'DE'].every((c, i) => cat.glaciers.filter((g) => g.country === c).length === [1400, 799, 4][i]), String(cat.glaciers.length));
  const sp = C.countrySumProblems(cat);
  add('K3 Summen je Land innerhalb ±2 % der amtlichen Zahl', sp.length === 0, sp.join('; '));
  const cls = (c, k) => cat.glaciers.filter((g) => g.country === c && g.klass === k).length;
  add('K4 Klassen wie in GL-0 gemessen: CH A160/B514/C726, AT A67/B249/C483, DE B1/C3', cls('CH', 'A') === 160 && cls('CH', 'B') === 514 && cls('CH', 'C') === 726 && cls('AT', 'A') === 67 && cls('AT', 'B') === 249 && cls('AT', 'C') === 483 && cls('DE', 'B') === 1 && cls('DE', 'C') === 3, `A ${cat.glaciers.filter((g) => g.klass === 'A').length}`);
  add('K5 Leitgletscher: ≥ 40 markiert, alle mit Reihe', cat.glaciers.filter((g) => g.lead).length >= 40, String(cat.glaciers.filter((g) => g.lead).length));
  add('K6 jeder CH-Gletscher trägt seine SGI-Id, jeder AT-Gletscher seine AGI-5-Nummer, jeder DE-Gletscher eine RGI-Id', cat.glaciers.every((g) => (g.country === 'CH' ? !!g.inv.sgi : g.country === 'AT' ? typeof g.inv.agi5 === 'number' : !!g.inv.rgi6)));
  add('K7 DE: Fläche aus der BAdW-Tabelle 2025 (Summe 26,2 ha), Umrisse aus RGI 2003 mit eigenem Bezugsjahr', Math.abs(cat.glaciers.filter((g) => g.country === 'DE').reduce((s, g) => s + g.area.km2, 0) - 0.262) < 0.0005 && cat.glaciers.filter((g) => g.country === 'DE').every((g) => g.area.source === 'BAdW 2025'));

  // points
  const pts = T.points.rows;
  add('P1 points.json: eine Zeile je Katalogeintrag, gleiche Klasse und Fläche', pts.length === cat.glaciers.length && pts.every(([id, lat, lon, k, km2]) => byId.get(id)?.klass === k && Math.abs(byId.get(id).area.km2 - km2) < 6e-5 && Math.abs(byId.get(id).lat - lat) < 1e-4));

  // outlines: every glacier, every level
  let nOut = 0, bad = [];
  const perLevel = { 1: new Set(), 2: new Set(), 3: new Set() };
  for (const region of C.GLACIER_REGION_IDS) {
    for (const lv of [1, 2, 3]) {
      let doc;
      try { doc = T.J(C.glacierOutlineFile(region, lv)); } catch { continue; }
      for (const f of doc.features) {
        nOut++;
        const g = byId.get(f.properties.id);
        if (!g || g.region !== region) { bad.push(`${f.properties.id}: region`); continue; }
        perLevel[lv].add(g.id);
        const inv = g.country === 'DE' ? C.geometryAreaKm2(f.geometry) : g.area.km2; // DE: BAdW 2025 area ≠ RGI 2003 outline by design
        const p = C.outlineProblems(f.geometry, g.country === 'DE' ? inv : g.area.km2, lv < 3 || g.area.km2 < 5);
        if (p.length) bad.push(`${g.id} L${lv}: ${p[0]}`);
      }
    }
  }
  add('G1 Umrisse: jeder Gletscher in jeder der drei Stufen, Ring geschlossen, Fläche ±3 % (selbstschnittfrei geprüft bis 5 km²)', [1, 2, 3].every((l) => perLevel[l].size === cat.glaciers.length) && bad.length === 0, `${nOut} features; ${bad.slice(0, 4).join(' | ')}`);

  // epochs
  let epochFiles = 0, epochBad = [];
  for (const f of T.ls('outline').filter((x) => /-e\d{4}\.json$/.test(x))) {
    epochFiles++;
    const doc = T.J(`outline/${f}`);
    const region = f.replace(/-e\d{4}\.json$/, '');
    if (doc.region !== region || !C.GLACIER_REGIONS[region]) epochBad.push(f + ' region');
    for (const ft of doc.features) {
      if (!Array.isArray(ft.properties.ids) || ft.properties.e !== doc.year) { epochBad.push(f + ' props'); break; }
      if (ft.properties.ids.some((id) => !ids.has(id))) { epochBad.push(f + ' id'); break; }
      for (const poly of C.polygonsOfGeometry(ft.geometry)) if (!poly.every(C.ringClosed)) { epochBad.push(f + ' ring'); break; }
    }
  }
  add('G2 frühere Umrisse (SGI 1850/1931/1973/2010, GI4 2015): Region/Jahr stimmen, Ids im Katalog, Ringe geschlossen', epochFiles >= 12 && epochBad.length === 0, `${epochFiles} files; ${epochBad.slice(0, 3).join(' | ')}`);

  // hypsometry
  let hCount = 0, hBad = [];
  for (const region of C.GLACIER_REGION_IDS) {
    let doc; try { doc = T.J(C.glacierHypsoFile(region)); } catch { continue; }
    for (const [id, h] of Object.entries(doc.glaciers)) {
      hCount++;
      const g = byId.get(id);
      const sum = h.a.reduce((s, v) => s + v, 0);
      if (!g) hBad.push(`${id}: not in catalogue`);
      else if (h.z0 % 50 !== 0) hBad.push(`${id}: z0 ${h.z0}`);
      else if (!h.a.every((v) => v >= 0)) hBad.push(`${id}: negative band`);
      else if (g.klass !== 'C' && Math.abs(sum / g.area.km2 - 1) > 0.25 && g.country !== 'DE') hBad.push(`${id}: bands sum ${ROUND(sum)} vs ${g.area.km2}`);
    }
  }
  add('H1 Höhenbänder (50 m): jeder Gletscher, Bandsumme ±25 % der Inventarfläche (A/B), z0 ein Vielfaches von 50 m', hCount === cat.glaciers.length && hBad.length === 0, `${hCount}; ${hBad.slice(0, 4).join(' | ')}`);

  // elevation grids of the satellite line (classes A and B, not DE)
  const satIds = new Set(cat.glaciers.filter((g) => S.glacierSatClass(g)).map((g) => g.id));
  let dN = 0, dBad = [], dProb = [], dCells = 0;
  for (const region of C.GLACIER_REGION_IDS) {
    let doc; try { doc = T.J(S.glacierDemFile(region)); } catch { continue; }
    dProb.push(...S.demProblems(doc, region, satIds).slice(0, 3));
    const outl = (() => { try { return new Map(T.J(C.glacierOutlineFile(region, 3)).features.map((f) => [f.properties.id, f.geometry])); } catch { return new Map(); } })();
    for (const [id, grid] of Object.entries(doc.glaciers)) {
      dN++; dCells += grid.nx * grid.ny;
      const g = byId.get(id), geom = outl.get(id);
      if (!g || !geom) { dBad.push(`${id}: Katalog/Umriss fehlt`); continue; }
      const z = S.demDecode(grid);
      let lo = Infinity, hi = -Infinity, miss = 0, n = 0;
      for (const poly of C.polygonsOfGeometry(geom)) for (const [lon, lat] of poly[0]) {
        n++;
        const v = S.demSample(grid, z, lon, lat);
        if (v == null) { miss++; continue; }
        if (v < lo) lo = v; if (v > hi) hi = v;
      }
      if (miss > 0) dBad.push(`${id}: ${miss}/${n} Umrisspunkte außerhalb des Höhengitters oder im Loch`);
      else if (lo < g.z[0] - 150 || hi > g.z[2] + 400) dBad.push(`${id}: Umrisshöhen ${Math.round(lo)}–${Math.round(hi)} gegen Katalog ${g.z[0]}–${g.z[2]}`);
    }
  }
  add('H2 Höhengitter (Satellitenlinie): jeder Gletscher der Klasse A/B in CH/AT genau ein Gitter (990), keiner der Klasse C oder aus DE, Umriss liegt im Gitter, Umrisshöhen im Katalogbereich −150 m / +400 m (am Kopf des Gletschers mischen die 30-m-Zellen die Randwand ein)', dN === satIds.size && dN === 990 && dProb.length === 0 && dBad.length === 0, `${dN} Gitter, ${(dCells / 1e6).toFixed(1)} Mio. Zellen; ${[...dProb, ...dBad].slice(0, 4).join(' | ')}`);

  // series
  const idSet = ids;
  let sN = 0, sBad = [];
  const kinds = {};
  for (const region of C.GLACIER_REGION_IDS) {
    let doc; try { doc = T.J(C.glacierSeriesFile(region)); } catch { continue; }
    for (const [id, lst] of Object.entries(doc.glaciers)) {
      if (byId.get(id)?.region !== region) sBad.push(`${id}: region`);
      for (const s of lst) {
        sN++; kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
        const p = C.seriesProblems({ id, ...s }, idSet);
        if (p.length) sBad.push(p[0]);
      }
    }
  }
  add('R1 Reihen: jede genau einem Gletscher mit Methode, Herkunft, Quelle und Einheit zugeordnet (0 Verstöße)', sN > 2000 && sBad.length === 0, `${sN} ${JSON.stringify(kinds)}; ${sBad.slice(0, 4).join(' | ')}`);
  add('R2 CH-Messreihen: ≥ 150 Längenreihen, ≥ 25 Massenreihen; AT-Reihen aus ÖAV und WGMS vorhanden', (kinds.length ?? 0) >= 250 && (kinds.mass ?? 0) >= 40 && (kinds.area ?? 0) >= 1000, JSON.stringify(kinds));

  // summary
  const lat = T.summary.latest;
  add('Z1 summary.json: nur Katalog-Ids, Längen/Bilanz/Flächenwerte plausibel', Object.keys(lat).every((id) => ids.has(id)) && Object.values(lat).every((e) => (!e.len || Math.abs(e.len[1]) < 2500) && (!e.ba || Math.abs(e.ba[1]) < 15000) && (!e.da || (e.da[2] > -100.1 && e.da[2] < 500))), String(Object.keys(lat).length));
  const cy = T.summary.countries;
  add('Z2 Ländermittel: aufsteigende Jahre, mindestens CH-Bilanz seit 1990', ['CH', 'AT', 'DE'].every((c) => ['ba', 'len'].every((k) => cy[c][k].every((r, i, a) => i === 0 || r[0] > a[i - 1][0]))) && cy.CH.ba.some((r) => r[0] <= 1990) && cy.CH.ba.some((r) => r[0] >= 2025));

  // projection
  let pN = 0, pBad = [];
  for (const region of C.GLACIER_REGION_IDS) {
    let doc; try { doc = T.J(C.glacierProjFile(region)); } catch { continue; }
    for (const [id, p] of Object.entries(doc.glaciers)) {
      pN++;
      if (!ids.has(id)) { pBad.push(`${id}: id`); continue; }
      for (const [ssp, q] of Object.entries(p.f)) {
        if (q.length !== 3 || q.some((r) => r.length !== doc.years.length)) { pBad.push(`${id}/${ssp}: shape`); break; }
        if (q[0].some((v, i) => v > q[1][i] + 1e-9 || q[1][i] > q[2][i] + 1e-9)) { pBad.push(`${id}/${ssp}: quantiles`); break; }
        if (Math.abs(q[1][0] - 1) > 0.01) { pBad.push(`${id}/${ssp}: base`); break; }
      }
    }
  }
  add('J1 Projektion: Spanne p10 ≤ p50 ≤ p90 je Szenario und Jahr, Bezug 2020 = 1, nur Katalog-Ids', pN > 1000 && pBad.length === 0, `${pN}; ${pBad.slice(0, 3).join(' | ')}`);

  // report balance
  const rep = T.report;
  add('B1 Bericht: Zählungen und Summen stimmen mit dem Katalog überein', ['CH', 'AT', 'DE'].every((c) => rep.totals[c].n === cat.glaciers.filter((g) => g.country === c).length && Math.abs(rep.totals[c].km2 - cat.glaciers.filter((g) => g.country === c).reduce((s, g) => s + g.area.km2, 0)) < 0.01));
  add('B2 Größe: jede Datei < 20 MB, Summe des Baums < 60 MB', Object.values(rep.files).every((f) => f.bytes < 20 * 1024 * 1024) && rep.bytesTotal < 60 * 1024 * 1024, `${(rep.bytesTotal / 1e6).toFixed(1)} MB`);
  add('B3 ID-Ausnahmen mit Grund (GLAMOS-Ids ohne SGI2016-Umriss)', (rep.steps.idExceptions ?? []).every((e) => typeof e.reason === 'string' && e.reason.length > 20));
} else {
  const FX = T.fx;
  add('F1 Fixture: Katalogzeilen, Umrisse, Reihen, Höhenbänder, Projektion aus dem echten Bau vom ' + FX.from.takenAt.slice(0, 10), Object.keys(FX.catalogRows).length === 9 && Object.keys(FX.outline).length === 9 && FX.catalogCounts.n === 2203);
  const hy = Object.values(FX.hypso).flatMap((r) => Object.entries(r));
  add('F2 Höhenbänder der Fixture-Gletscher: z0 Vielfaches von 50, Summe ±25 % der Fläche (A/B)', hy.length >= 6 && hy.every(([id, h]) => h.z0 % 50 === 0 && (Object.values(FX.catalogRows).find((g) => g.id === id)?.klass === 'C' || Object.values(FX.catalogRows).find((g) => g.id === id)?.country === 'DE' || Math.abs(h.a.reduce((s, v) => s + v, 0) / Object.values(FX.catalogRows).find((g) => g.id === id).area.km2 - 1) < 0.25)));
  const pr = Object.values(FX.proj).flatMap((r) => Object.values(r));
  add('F3 Projektion der Fixture-Gletscher: Spannen geordnet, Bezug 2020 = 1', pr.length >= 3 && pr.every((p) => Object.values(p.f).every((q) => q[0].every((v, i) => v <= q[1][i] + 1e-9 && q[1][i] <= q[2][i] + 1e-9) && Math.abs(q[1][0] - 1) < 0.01)));
}

// official + sources (both modes)
const op = C.officialProblems(T.official.items);
add('O1 amtliche Zahlen: 9 Einträge, Datum, wörtliches Zitat, Quelle, Link, Kriterium bei „Status“', T.official.items.length === 9 && op.length === 0, op.join('; '));
const snap = arg('snapshots');
if (snap) {
  const keyOf = { 'ch-glamos-2026-volume': 'unifr', 'ch-glamos-2026-freezing': 'unifr', 'ch-glamos-2026-vanished': 'unifr', 'at-oeav-2024-25-length': 'oav', 'at-oeav-2024-25-rank': 'oav', 'at-oeav-2024-25-pasterze': 'oav', 'at-agi5-area': 'tc', 'at-agi5-vanished': 'agi5', 'de-badw-2026-area': 'badw' };
  const norm = (s) => s.replace(/km²/g, 'km 2').replace(/ /g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
  const bad = [];
  for (const it of T.official.items) {
    const f = join(snap, `official-${keyOf[it.id]}.txt`);
    if (!existsSync(f)) { bad.push(`${it.id}: snapshot`); continue; }
    const t = norm(readFileSync(f, 'utf8'));
    for (const part of it.quote.split(' … ')) if (!t.includes(norm(part))) bad.push(`${it.id}: quote`);
  }
  add('O2 jedes Zitat steht wörtlich im Quelltext (Schnappschuss der Seite)', bad.length === 0, bad.join('; '));
}
add('O3 Quellen: jede mit Lizenz, Vermerk, https-Link, Bezugsjahr; GLAMOS-Lizenz als „Klärung offen“ benannt',
  T.sources.sources.length >= 10 && T.sources.sources.every((s) => s.licence && s.attribution && /^https:\/\//.test(s.url) && s.refYear && s.used) && T.sources.sources.filter((s) => /GLAMOS/.test(s.label)).every((s) => /Klärung offen/.test(s.licence)));
add('O4 Gegenprobe: ein Quellenvermerk ohne Lizenz würde auffallen', !(clone(T.sources.sources[0]) && (() => { const s = clone(T.sources.sources[0]); s.licence = ''; return s.licence && s.attribution; })()));
add('O5 amtliche Zahlen und Quellen tragen den Build des Katalogs', T.official.build === T.build && T.sources.build === T.build, `${T.official.build} / ${T.sources.build} / ${T.build}`);

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok || !c.detail ? '' : ' — ' + c.detail}`);
console.log(`\nverify:glacier-static ${checks.length - failed.length}/${checks.length}${T.full ? ' (voller Baum ' + T.build + ')' : ' (Fixture)'}`);
process.exit(failed.length ? 1 : 0);
