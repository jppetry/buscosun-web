/**
 * clima-product.mjs — builds the climatology product of phase FX-4 (E-FX-1; `audit/fusion-forschung.md` §6.4) LOCALLY:
 * from the station climatology (`fit\<date>\clima.hindcast.json`) and the feature table, the trend, the per-coefficient
 * height slopes and the station coefficients an estimator of `src/point/fusionFit/climaProduct.ts` needs at a browser
 * point — the same estimator the leave-station-out diagnosis and Scorecard 5c measured (`lib/climaCandidates.mjs`).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/clima-product.mjs
 *       --estimator=ridgeTx [--clima=<root>\fit\2026-09-23\clima.hindcast.json] [--features=<root>\features\points.v1.json]
 *       [--out=<root>\product\<date>\clima\v1\stations.json] [--fitTables=<root>\fit\<date>\fusion.hindcast.json]
 *       [--vars=t,td,gust]
 *
 * `--vars` (phase FX-5, E-FX-8, §6.5): the product carries trend, height slopes and station coefficients ONLY for the named
 * variables (`doc.vars`); every station's position stays (provenance, nearest station). Default: every climatology variable.
 *
 * Writes the product document (`point/static/clima/v1/stations.json` in the data repo is the publisher path — Jan's gate,
 * nothing here copies anything) with its provenance: source stations and licence per truth network (DWD CDC, GeoSphere
 * Austria, MeteoSwiss — all CC BY 4.0, no NC, no unclear licence), fit version, coefficient definition (`C_NAMES`),
 * estimator, trend-feature set. Prints size (raw/gzip), station counts and a few example estimates.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { HINDCAST_ROOT, parseArgs, codeHash } from '../hindcast/lib/common.mjs';
import { siteOf, topTiles } from './lib/rowFeatures.mjs';
import { regionOf } from '../../src/point/fusionFit/strata.ts';
import { C_NAMES, C_DIM, CLIMA_VARS } from '../../src/point/fusionFit/fitClima.ts';
import { fitLapse, fitTrend, trendVector, TREND_SETS, validateClimaProduct, estimateCoefficients, muAt, CLIMA_PRODUCT_KIND, CLIMA_PRODUCT_SCHEMA } from '../../src/point/fusionFit/climaProduct.ts';
import { FIT_VERSION, parseClimaVars } from '../../src/point/fusionFit/tables.ts';
import { CLIMA_PRODUCT, CLIMA_VERSION } from '../../src/point/cubeFormat.ts';
import { CLIMA_CANDIDATES, specOf, setOf, needsStations, stationVarsOf, needsLapse } from './lib/climaCandidates.mjs';

const flags = parseArgs(process.argv.slice(2));
const root = typeof flags.root === 'string' ? flags.root : HINDCAST_ROOT;
const name = typeof flags.estimator === 'string' ? flags.estimator : null;
if (!name || !CLIMA_CANDIDATES[name]) throw new Error(`--estimator fehlt oder unbekannt (${Object.keys(CLIMA_CANDIDATES).join(', ')})`);
const cand = CLIMA_CANDIDATES[name];
const climaPath = typeof flags.clima === 'string' ? flags.clima : join(root, 'fit', '2026-09-23', 'clima.hindcast.json');
const featPath = typeof flags.features === 'string' ? flags.features : join(root, 'features', 'points.v1.json');
const stamp = new Date().toISOString().slice(0, 10);
const out = typeof flags.out === 'string' ? flags.out : join(root, 'product', stamp, CLIMA_PRODUCT, CLIMA_VERSION, 'stations.json');
const fitTablesPath = typeof flags.fitTables === 'string' ? flags.fitTables : null;
const say = (s) => console.log(`[clima-product] ${s}`);

const climaBytes = readFileSync(climaPath);
const clima = JSON.parse(climaBytes.toString('utf8'));
const climaSha = createHash('sha256').update(climaBytes).digest('hex');
const featBytes = readFileSync(featPath);
const feat = JSON.parse(featBytes.toString('utf8'));
const NET = { DE: 'cdc', AT: 'tawes', CH: 'smn', LI: 'smn' };
const LICENCE = {
  cdc: 'Deutscher Wetterdienst (DWD), Climate Data Center — CC BY 4.0 (GeoNutzV); Quellenvermerk „Datenbasis: Deutscher Wetterdienst, Daten verändert (stündliche Klimatologie-Koeffizienten)"',
  tawes: 'GeoSphere Austria, TAWES-Stationsdaten — CC BY 4.0; Quellenvermerk „Datenquelle: GeoSphere Austria"',
  smn: 'MeteoSchweiz / MeteoSwiss, SwissMetNet (Open Government Data) — CC BY 4.0; Quellenvermerk „Quelle: MeteoSchweiz"',
};
const set = setOf(cand);
// phase FX-5: a narrowed variable list (checked against FIT_VARS = CLIMA_VARS)
const VARS = typeof flags.vars === 'string' ? parseClimaVars(flags.vars) : [...CLIMA_VARS];
const stations = [];
for (const [id, byVar] of Object.entries(clima.byPoint)) {
  const fr = feat.byPoint[id]; if (!fr) continue;
  const so = siteOf(fr);
  const mu = {};
  // every station with ANY written series stays in the list (position = provenance); its coefficients only for VARS
  if (!Object.values(byVar).some((e) => e && e.status === 'written')) continue;
  for (const v of VARS) { const e = byVar[v]; if (e && e.status === 'written') mu[v] = e.mu; }
  stations.push({ id, name: fr.name, lat: fr.lat, lon: fr.lon, elevM: fr.elevM, country: fr.country, tile: fr.tile, net: NET[fr.country] ?? null, mu, feat: set ? Array.from(trendVector(so.site, fr.lat, TREND_SETS[set])) : null });
}
stations.sort((a, b) => a.id.localeCompare(b.id));
const regions = topTiles(stations.map((s) => ({ tile: s.tile })), 12);
const regionFn = (id) => regionOf(stations.find((s) => s.id === id).tile, regions);
say(`${stations.length} Stationen aus ${climaPath} (sha256 ${climaSha.slice(0, 12)}), Schätzer ${name} ${JSON.stringify(specOf(cand))}, Trendmerkmale ${set ?? '—'}`);

// height slopes and trend on ALL stations (the product serves points that are not stations)
const lapse = needsLapse(cand) ? Object.fromEntries(VARS.map((v) => [v, fitLapse(stations, v)]).filter(([, l]) => l).map(([v, l]) => [v, Array.from(l).map((x) => Math.round(x * 1e5) / 1e5)])) : null;
let trend = null;
if (set) {
  const beta = {}, lambda = {}, cv = {};
  for (const v of VARS) {
    const rows = stations.filter((s) => s.mu[v]).map((s) => ({ id: s.id, x: s.feat, y: s.mu[v] }));
    const f = fitTrend(rows, regionFn);
    if (!f) { say(`Trend ${v}: zu wenige Stationen (${rows.length})`); continue; }
    beta[v] = f.beta.map((b) => Array.from(b).map((x) => Math.round(x * 1e6) / 1e6)); lambda[v] = f.lambda; cv[v] = f.cvMse;
  }
  trend = { names: TREND_SETS[set], beta, lambda };
  say(`Trend: λ ${Object.entries(lambda).map(([v, l]) => `${v} ${l}`).join(' · ')}`);
}
// the station list: EVERY station's position (provenance — the client names the nearest station; a later station-based
// fallback needs no new product), the coefficients only where the estimator reads them (all variables for idw/kriging,
// only the idw-override variables for a ridge product), `feat` only for kriging
const carryVars = stationVarsOf(cand, VARS);
const carry = stations.map((s) => ({
  id: s.id, name: s.name, lat: Math.round(s.lat * 1e4) / 1e4, lon: Math.round(s.lon * 1e4) / 1e4, elevM: s.elevM, country: s.country, net: s.net,
  mu: Object.fromEntries(carryVars.filter((v) => s.mu[v]).map((v) => [v, s.mu[v]])),
  ...(cand.kind === 'kriging' ? { feat: s.feat.map((x) => Math.round(x * 1e4) / 1e4) } : {}),
}));
void needsStations;
const nets = [...new Set(stations.map((s) => s.net).filter(Boolean))].sort();
const fitTables = fitTablesPath && existsSync(fitTablesPath) ? JSON.parse(readFileSync(fitTablesPath, 'utf8')) : null;
const doc = {
  schema: CLIMA_PRODUCT_SCHEMA, kind: CLIMA_PRODUCT_KIND, fitVersion: FIT_VERSION, provenance: 'hindcast', builtAt: new Date().toISOString(), codeHash: codeHash(),
  product: CLIMA_PRODUCT, version: CLIMA_VERSION, candidate: name,
  estimator: specOf(cand), design: C_NAMES, vars: VARS, lapse, trend, stations: carry,
  source: { clima: climaPath, sha256: climaSha, period: clima.period ?? null, days: clima.days ?? null, points: stations.length, features: { path: featPath, sha256: createHash('sha256').update(featBytes).digest('hex') },
    ...(fitTables ? { fitTables: { path: fitTablesPath, fitVersion: fitTables.fitVersion, builtAt: fitTables.builtAt, climaMu: fitTables.climaMu?.candidate ?? null } } : {}) },
  licence: nets.map((n) => LICENCE[n]).filter(Boolean),
  stationsByNet: Object.fromEntries(nets.map((n) => [n, stations.filter((s) => s.net === n).length])),
  what: 'Stündliche Stationsklimatologie μ_c (13 Koeffizienten je Größe: Jahres- und Tagesgang, C_NAMES) als Trend auf Standortmerkmalen und/oder Stationsliste — der Client schätzt daraus μ_c am Punkt (climaProduct.ts estimateCoefficients) für die μ_c-Spalte der Lernstufe (fusionFit station-Tabellen).',
  featureSources: ['Terrarium-DEM (AWS Terrain Tiles, Mapzen) für Höhe/TPI/svf/Senke/Hang', 'ESA WorldCover 2021 (CC BY 4.0) für z0/Landbedeckung/d_water', 'GHSL (CC BY 4.0) für imperv/d0 — der Client rechnet die Merkmale selbst; das Produkt trägt nur Koeffizienten'],
  notes: [
    `Leave-Station-out-Beleg: audit/fusion-forschung/diag-fx4.md (Kandidat ${name}); Fit/Scorecard 5c/5d mit GESCHÄTZTEM μ_c: audit/fusion-forschung.md §6.4`,
    ...(VARS.length < CLIMA_VARS.length ? [`Phase FX-5 (E-FX-8, §6.5): Produkt nur für ${VARS.join(', ')} — Trend, Höhensteigungen und Stationskoeffizienten anderer Größen fehlen absichtlich (Regel je Größe × Bin); Stationsliste vollständig (Provenienz)`] : []),
    'Provenienz hindcast (E-F-23): aus Stationsreihen fremder Archive gerechnet, nie am eigenen Produkt gemessen',
    'Nicht im Produkt: σ_c (der Client liest nur μ_c), Stationen ohne geschriebene Reihe (< 300 Tage)',
  ],
};
const errs = validateClimaProduct(doc);
if (errs.length) throw new Error(`Produkt ungültig: ${errs.join('; ')}`);
mkdirSync(dirname(out), { recursive: true });
const json = JSON.stringify(doc);
writeFileSync(out, json);
const gz = gzipSync(Buffer.from(json)).length;
say(`geschrieben ${out}: ${Math.round(json.length / 1024)} KB roh, ${(gz / 1024).toFixed(1)} KB gz; Größen ${VARS.join(',')}; Stationen im Produkt ${carry.length} (Koeffizienten für ${carryVars.join(',') || 'keine'}: ${carry.filter((s) => Object.keys(s.mu).length).length}), Netze ${JSON.stringify(doc.stationsByNet)}, Lizenzen ${doc.licence.length}`);
// example estimates and an in-sample sanity check (the product against the stations it was built from — not a skill number)
const ex = [['München', 48.1372, 11.5755, 525], ['Zugspitze', 47.4211, 10.9853, 2962], ['Wien', 48.2082, 16.3738, 171], ['Zürich', 47.3769, 8.5417, 408], ['Hamburg', 53.5511, 9.9937, 6]];
for (const [n, lat, lon, h] of ex) {
  const fr = feat.byPoint[Object.keys(feat.byPoint).find((id) => feat.byPoint[id].name && feat.byPoint[id].name.toUpperCase().startsWith(n.toUpperCase().slice(0, 4)))];
  const site = fr ? siteOf(fr).site : { hTrueM: h, tpi500M: 0, tpi2000M: 0, svf: 1, sinkDepthM: 0, slopeDeg: 0, aspectDeg: 0, z0True: 0.1, lcShares: null, dWaterM: null, dLakeM: null, impervPct: null, d0M: null, lonDeg: lon };
  const est = estimateCoefficients(doc, { lat, lon, elevM: h, feat: set ? trendVector({ ...site, hTrueM: h, lonDeg: lon }, lat, TREND_SETS[set]) : null });
  const jul = muAt(est, Date.UTC(2025, 6, 15, 13), lon), jan = muAt(est, Date.UTC(2025, 0, 15, 4), lon);
  say(`${n.padEnd(10)} h ${String(h).padStart(4)} m · nächste Station ${est.nearestKm == null ? '—' : est.nearestKm.toFixed(1) + ' km'} · μ_c T Juli 13 UTC ${jul.t?.toFixed(1)} °C, Januar 04 UTC ${jan.t?.toFixed(1)} °C · Wind |u,v| Juli ${jul.u != null ? Math.hypot(jul.u, jul.v).toFixed(1) : '—'} m/s · Böe ${jul.gust?.toFixed(1)} · Weg ${[...new Set(Object.values(est.how))].join('/')}`);
}
