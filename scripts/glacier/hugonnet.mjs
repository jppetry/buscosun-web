#!/usr/bin/env node
/**
 * Phase GH — producer of the elevation-change block (static line; audit/gletscher-hugonnet.md):
 * per-glacier table of Hugonnet et al. 2021 (RGI region 11) + RGI bridge + catalogue of ONE static build
 *   → `static/<build>/dhdt/<region>.json` and `static/<build>/dhdt/report.json` (match count, every glacier without a block and why).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/hugonnet.mjs \
 *        --table=<dh_11_rgi60_pergla_rates.csv> --bridge=<bridge.json of rgi_bridge.py> --catalog=<catalog.json of the build> \
 *        --out=<package dir, mirrors glacier/v1/> [--index-patch=<file>]
 *
 * Second product, same glaciers (`--product=hugonnet --cumul=<dh_11_rgi60_pergla_cumul.csv>`): mass balance, volume and mass change, the
 * decades and the yearly cumulative series → `static/<build>/hugonnet/<region>.json` + `hugonnet/report.json` (`glacierHugonnetContract.ts`).
 * No client reads it yet; give it an `--out` of its own, so that a publish does not send the `dhdt/` files again.
 *
 * The package is published with `glacier-publish.mjs --line=static --src=<out> --index-patch=<file>`: it only ADDS the `dhdt/` files
 * to the existing build on the branch `glacier` and sets `static.dhdt = <build>` in the pointer on `main`.
 * The raw table stays outside every repo; only the per-glacier values of the matched glaciers leave this script.
 * Rules (frozen before the first run, `audit/gletscher-hugonnet/regel-eingefroren.md`): 1 : 1 by mutual largest overlap and at least half
 * of both outlines, values unchanged, nothing averaged. Stops with a reason instead of writing a partial tree.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { GLACIER_REGIONS, catalogProblems, glacierStaticPath } from '../../src/glacier/glacierContract.ts';
import {
  GLACIER_ELEV_PERIODS, GLACIER_ELEV_REF, GLACIER_ELEV_REPORT_FILE, GLACIER_ELEV_SOURCE, elevBlockOf, elevMatch, elevProblems, glacierElevFile, parseHugonnetRates,
} from '../../src/glacier/glacierElevContract.ts';
import {
  GLACIER_HUGONNET_PERIODS, GLACIER_HUGONNET_QUANTITIES, GLACIER_HUGONNET_REF, GLACIER_HUGONNET_REPORT_FILE, GLACIER_HUGONNET_SERIES_REF, GLACIER_HUGONNET_SOURCE,
  cumulYearly, glacierHugonnetFile, hugonnetBlockOf, hugonnetProblems, parseHugonnetCumul,
} from '../../src/glacier/glacierHugonnetContract.ts';

/** Catalogue and bridge checked, every glacier judged by the frozen 1 : 1 rule — shared by both products. */
function judged(catalog, bridge) {
  if (bridge?.kind !== 'glacier/rgi-bridge' || bridge.build !== catalog.build) throw new Error(`Brücke gehört zu Build ${bridge?.build}, Katalog zu ${catalog.build}`);
  const bad = catalogProblems(catalog);
  if (bad.length) throw new Error(`Katalog verletzt den Vertrag: ${bad.slice(0, 3).join('; ')}`);
  const ids = catalog.glaciers.map((g) => g.id);
  const idSet = new Set(ids);
  const stray = bridge.pairs.find((p) => !idSet.has(p[0]));
  if (stray) throw new Error(`Brücke nennt einen Gletscher außerhalb des Katalogs: ${stray[0]}`);
  return { ids, idSet, match: elevMatch(ids, bridge.pairs) };
}

/** Pure core: documents per region and the report. `tableSha` only travels into the report. */
export function buildElev({ catalog, bridge, table, tableSha = null, builtAt = new Date().toISOString().slice(0, 19) + 'Z' }) {
  const { ids, idSet, match } = judged(catalog, bridge);
  const docs = new Map();
  // a document for EVERY region of the catalogue, also one without a single block: the client asks per region and must never meet a 404
  const docOf = (region) => {
    let d = docs.get(region);
    if (!d) {
      d = {
        schema: 1, kind: 'glacier/elev', build: catalog.build, region,
        periods: GLACIER_ELEV_PERIODS.map((p) => ({ from: p.from, to: p.to, label: p.label })), unit: 'm/a', sigma: 1, ref: GLACIER_ELEV_REF,
        source: { ...GLACIER_ELEV_SOURCE }, glaciers: {},
      };
      docs.set(region, d);
    }
    return d;
  };
  for (const g of catalog.glaciers) docOf(g.region);
  const none = [];
  const why = {};
  const byCountry = {};
  let matched = 0;
  for (const g of catalog.glaciers) {
    const c = (byCountry[g.country] ??= { n: 0, matched: 0 });
    c.n++;
    let m = match.get(g.id);
    let block = null;
    if (m.ok) {
      block = elevBlockOf(m.rgi, table.rows.get(m.rgi));
      if (!block) m = { ok: false, why: 'no-value', rgi: m.rgi, aG: m.aG, aR: m.aR };
    }
    if (!block) {
      why[m.why] = (why[m.why] ?? 0) + 1;
      none.push([g.id, m.why, m.rgi ?? null, m.aG ?? null, m.aR ?? null]);
      continue;
    }
    matched++; c.matched++;
    docOf(g.region).glaciers[g.id] = block;
  }
  for (const [region, d] of docs) {
    const p = elevProblems(d, region, idSet);
    if (p.length) throw new Error(`${region}: ${p.slice(0, 3).join('; ')}`);
  }
  // one RGI row must never reach two glaciers (the mutual rule guarantees it; checked, not assumed)
  const seen = new Set();
  for (const d of docs.values()) for (const b of Object.values(d.glaciers)) { if (seen.has(b.rgi)) throw new Error(`RGI-Zeile doppelt vergeben: ${b.rgi}`); seen.add(b.rgi); }
  const rangeOnly = GLACIER_ELEV_PERIODS.map((_, i) => { let n = 0, of = 0; for (const d of docs.values()) for (const b of Object.values(d.glaciers)) { const x = b.r[i]; if (x) { of++; if (x[1] >= Math.abs(x[0])) n++; } } return { n, of }; });
  const report = {
    schema: 1, kind: 'glacier/elev-report', build: catalog.build, builtAt,
    source: { ...GLACIER_ELEV_SOURCE }, table: { file: 'dh_11_rgi60_pergla_rates.csv', sha256: tableSha, lines: table.lines, glaciers: table.glaciers },
    rule: 'gegenseitig größte Schnittfläche und mindestens die Hälfte beider Umrisse; nie Name oder Abstand; nichts gemittelt',
    glaciers: ids.length, matched, unmatched: none.length, why, byCountry,
    /** per period: how many blocks carry a value, and for how many of them the uncertainty is at least the value ("range only") */
    periods: GLACIER_ELEV_PERIODS.map((p, i) => ({ label: p.label, values: rangeOnly[i].of, rangeOnly: rangeOnly[i].n })),
    cols: ['id', 'why', 'rgi', 'aG', 'aR'], none,
  };
  return { docs, report };
}

/** The RGI glaciers the 1 : 1 rule assigns — the only rows of the cumulative table the second product can ask for. */
export function matchedRgi(catalog, bridge) {
  const { match } = judged(catalog, bridge);
  return new Set([...match.values()].filter((m) => m.ok).map((m) => m.rgi));
}

/**
 * Second product (pure core): every per-glacier quantity for the SAME glaciers as `buildElev` — `table` read with
 * `GLACIER_HUGONNET_PERIODS`, `cumul` = the cumulative table (`parseHugonnetCumul`). A matched glacier without rows in the
 * cumulative table keeps its block with `c: null`.
 */
export function buildHugonnet({ catalog, bridge, table, cumul, tableSha = null, cumulSha = null, builtAt = new Date().toISOString().slice(0, 19) + 'Z' }) {
  const { ids, idSet, match } = judged(catalog, bridge);
  let times = null;
  const docs = new Map();
  const docOf = (region) => {
    let d = docs.get(region);
    if (!d) {
      d = {
        schema: 1, kind: 'glacier/hugonnet', build: catalog.build, region,
        periods: GLACIER_HUGONNET_PERIODS.map((p) => ({ from: p.from, to: p.to, label: p.label })),
        quantities: GLACIER_HUGONNET_QUANTITIES.map((q) => ({ key: q.key, unit: q.unit, label: q.label })),
        sigma: 1, ref: GLACIER_HUGONNET_REF, series: { unit: 'm', times: null, ref: GLACIER_HUGONNET_SERIES_REF },
        source: { ...GLACIER_HUGONNET_SOURCE }, glaciers: {},
      };
      docs.set(region, d);
    }
    return d;
  };
  for (const g of catalog.glaciers) docOf(g.region);
  let matched = 0, withSeries = 0;
  for (const g of catalog.glaciers) {
    const m = match.get(g.id);
    if (!m.ok) continue;
    let c = null;
    const cr = cumul.rows.get(m.rgi);
    if (cr) {
      const y = cumulYearly(cr);
      // one time axis for all glaciers, as the table has it; a glacier with other dates is a stop
      if (!times) times = y.times;
      else if (y.times.join() !== times.join()) throw new Error(`Hugonnet-Jahresreihe: ${m.rgi} trägt andere Zeitpunkte`);
      c = y.c;
    }
    const block = hugonnetBlockOf(m.rgi, table.rows.get(m.rgi), c);
    if (!block) continue;
    matched++;
    if (block.c) withSeries++;
    docOf(g.region).glaciers[g.id] = block;
  }
  if (!times) throw new Error('Hugonnet-Jahresreihe: kein einziger zugeordneter Gletscher steht in der Tabelle');
  for (const [region, d] of docs) {
    d.series.times = times;
    const p = hugonnetProblems(d, region, idSet);
    if (p.length) throw new Error(`${region}: ${p.slice(0, 3).join('; ')}`);
  }
  const seen = new Set();
  for (const d of docs.values()) for (const b of Object.values(d.glaciers)) { if (seen.has(b.rgi)) throw new Error(`RGI-Zeile doppelt vergeben: ${b.rgi}`); seen.add(b.rgi); }
  const all = [...docs.values()].flatMap((d) => Object.values(d.glaciers));
  const report = {
    schema: 1, kind: 'glacier/hugonnet-report', build: catalog.build, builtAt,
    source: { ...GLACIER_HUGONNET_SOURCE },
    tables: {
      rates: { file: 'dh_11_rgi60_pergla_rates.csv', sha256: tableSha, lines: table.lines, glaciers: table.glaciers },
      cumul: { file: 'dh_11_rgi60_pergla_cumul.csv', sha256: cumulSha, lines: cumul.lines, glaciers: cumul.glaciers },
    },
    rule: 'gegenseitig größte Schnittfläche und mindestens die Hälfte beider Umrisse; nie Name oder Abstand; nichts gemittelt',
    /** the glaciers without a block and why are listed in the report of the first product */
    unmatchedIn: GLACIER_ELEV_REPORT_FILE,
    glaciers: ids.length, matched, unmatched: ids.length - matched,
    periods: GLACIER_HUGONNET_PERIODS.map((p, i) => ({ label: p.label, values: all.filter((b) => b.r[i]).length })),
    series: { times, glaciers: withSeries, points: all.reduce((s, b) => s + (b.c ? b.c.filter(Boolean).length : 0), 0) },
  };
  return { docs, report };
}

function main() {
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const need = (n) => { const v = arg(n); if (!v) { console.error(`--${n}= fehlt`); process.exit(2); } return resolve(v); };
  const tablePath = need('table'), out = need('out');
  const raw = readFileSync(tablePath);
  const catalog = JSON.parse(readFileSync(need('catalog'), 'utf8'));
  const bridge = JSON.parse(readFileSync(need('bridge'), 'utf8'));
  const product = arg('product') ?? 'dhdt';
  if (product === 'hugonnet') {
    // second product: its own directory `hugonnet/`, the published `dhdt/` files are not touched
    const cumulRaw = readFileSync(need('cumul'));
    const table = parseHugonnetRates(raw.toString('utf8'), GLACIER_HUGONNET_PERIODS);
    const cumul = parseHugonnetCumul(cumulRaw.toString('utf8'), matchedRgi(catalog, bridge));
    const sha = (b) => createHash('sha256').update(b).digest('hex');
    const { docs, report } = buildHugonnet({ catalog, bridge, table, cumul, tableSha: sha(raw), cumulSha: sha(cumulRaw) });
    rmSync(join(out, glacierStaticPath(catalog.build, 'hugonnet')), { recursive: true, force: true });
    const write = (file, obj) => { const p = join(out, glacierStaticPath(catalog.build, file)); mkdirSync(dirname(p), { recursive: true }); const s = JSON.stringify(obj); writeFileSync(p, s); return s.length; };
    let bytes = 0;
    for (const region of Object.keys(GLACIER_REGIONS)) { const d = docs.get(region); if (d) bytes += write(glacierHugonnetFile(region), d); }
    bytes += write(GLACIER_HUGONNET_REPORT_FILE, report);
    const patch = arg('index-patch');
    if (patch) writeFileSync(resolve(patch), JSON.stringify({ static: { hugonnet: catalog.build } }));
    console.log(JSON.stringify({ product, build: catalog.build, glaciers: report.glaciers, matched: report.matched, periods: report.periods, series: report.series, files: docs.size + 1, bytes }));
    return;
  }
  if (product !== 'dhdt') { console.error(`--product=${product} kennt das Skript nicht (dhdt | hugonnet)`); process.exit(2); }
  const table = parseHugonnetRates(raw.toString('utf8'));
  const { docs, report } = buildElev({ catalog, bridge, table, tableSha: createHash('sha256').update(raw).digest('hex') });
  const dir = join(out, glacierStaticPath(catalog.build, 'dhdt'));
  rmSync(dir, { recursive: true, force: true });
  const write = (file, obj) => { const p = join(out, glacierStaticPath(catalog.build, file)); mkdirSync(dirname(p), { recursive: true }); const s = JSON.stringify(obj); writeFileSync(p, s); return s.length; };
  let bytes = 0;
  for (const region of Object.keys(GLACIER_REGIONS)) { const d = docs.get(region); if (d) bytes += write(glacierElevFile(region), d); }
  bytes += write(GLACIER_ELEV_REPORT_FILE, report);
  const patch = arg('index-patch');
  if (patch) writeFileSync(resolve(patch), JSON.stringify({ static: { dhdt: catalog.build } }));
  console.log(JSON.stringify({ build: catalog.build, glaciers: report.glaciers, matched: report.matched, unmatched: report.unmatched, why: report.why, byCountry: report.byCountry, periods: report.periods, files: docs.size + 1, bytes }));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) main();
