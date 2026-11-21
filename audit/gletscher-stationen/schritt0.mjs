#!/usr/bin/env node
/**
 * Phase GO, step 0 — measurements for `audit/gletscher-stationen.md` §2 (run BEFORE the product code existed; the product's own
 * report `stn/map/<file>.json` → `report` must give the same counts for the same inputs).
 *
 *   node audit/gletscher-stationen/schritt0.mjs --catalog=<catalog.json> --obs=<obs/v1 stations.json> [--km=5 --dz=300]
 *
 * Reads the recorded answers in `scripts/lib/fixtures/glacier/stations/` (Tirol OGD file, South Tyrol stations + sensors), the glacier
 * catalogue of the static build and the catalogue of `obs/v1`. Prints markdown tables. Read-only.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', '..', 'scripts', 'lib', 'fixtures', 'glacier', 'stations');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const KM = Number(args.km ?? 5), DZ = Number(args.dz ?? 300);

const band = (h) => (h < 1500 ? '< 1500' : h < 2000 ? '1500–1999' : h < 2500 ? '2000–2499' : h < 3000 ? '2500–2999' : '≥ 3000');
const BANDS = ['< 1500', '1500–1999', '2000–2499', '2500–2999', '≥ 3000'];
const distKm = (la1, lo1, la2, lo2) => {
  const r = Math.PI / 180, a = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(a));
};
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

// --- Tirol -----------------------------------------------------------------------------------------------------------------------------
const tirol = readJson(join(FIX, 'tirol-ogd.geojson')).features;
const Q_TIROL = { t: 'LT', wind: 'WG', gust: 'WG_BOE', snow: 'HS', precip: 'N24', rad: 'GS_O' };
const opRows = new Map();
for (const f of tirol) {
  const op = f.properties.operator, b = band(f.geometry.coordinates[2]);
  if (!opRows.has(op)) opRows.set(op, Object.fromEntries(BANDS.map((x) => [x, 0])));
  opRows.get(op)[b]++;
}
console.log(`### Tirol: Stationen je Betreiber und Höhenband (${tirol.length} Stationen)\n`);
console.log(table(['Betreiber', ...BANDS, 'Summe'], [...opRows].sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y) - Object.values(a[1]).reduce((x, y) => x + y)).map(([op, r]) => [op, ...BANDS.map((b) => r[b]), Object.values(r).reduce((x, y) => x + y)])));
console.log(`\n### Tirol: Stationen mit Wert je Größe und Höhenband\n`);
console.log(table(['Größe (Feld)', ...BANDS, 'Summe'], Object.entries(Q_TIROL).map(([q, k]) => { const c = BANDS.map((b) => tirol.filter((f) => band(f.geometry.coordinates[2]) === b && f.properties[k] != null).length); return [`${q} (${k})`, ...c, c.reduce((x, y) => x + y)]; })));
const stamps = tirol.map((f) => f.properties.date).filter(Boolean).map((d) => Date.parse(d));
const newest = Math.max(...stamps);
const lag = (ms) => Math.round((newest - ms) / 60000);
const lagBins = { '0 min': 0, '10–60 min': 0, '61–180 min': 0, '> 180 min': 0 };
for (const s of stamps) { const m = lag(s); lagBins[m === 0 ? '0 min' : m <= 60 ? '10–60 min' : m <= 180 ? '61–180 min' : '> 180 min']++; }
console.log(`\nStempel: neuester ${new Date(newest).toISOString()}; Abstand der Stationen zum neuesten Stempel: ${Object.entries(lagBins).map(([k, v]) => `${k}: ${v}`).join(', ')}; ohne Stempel: ${tirol.length - stamps.length}`);

// --- South Tyrol ---------------------------------------------------------------------------------------------------------------------
const bzSt = readJson(join(FIX, 'bz-stations.json')).features.map((f) => f.properties);
const bzSe = readJson(join(FIX, 'bz-sensors.json'));
const bzBy = new Map();
for (const s of bzSe) { if (!bzBy.has(s.SCODE)) bzBy.set(s.SCODE, {}); bzBy.get(s.SCODE)[s.TYPE] = s; }
const Q_BZ = { t: 'LT', wind: 'WG', gust: 'WG.BOE', snow: 'HS', precip: 'N', rad: 'GS' };
const MET = new Set(['LT', 'LF', 'WG', 'WG.BOE', 'WR', 'HS', 'N', 'GS']);
const bzMet = bzSt.filter((s) => Object.keys(bzBy.get(s.SCODE) ?? {}).some((t) => MET.has(t)));
console.log(`\n### Südtirol: ${bzSt.length} Stationen, davon ${bzMet.length} mit mindestens einer Wettergröße; je Größe und Höhenband\n`);
console.log(table(['Größe (Sensor)', ...BANDS, 'Summe'], Object.entries(Q_BZ).map(([q, k]) => { const c = BANDS.map((b) => bzMet.filter((s) => band(s.ALT) === b && bzBy.get(s.SCODE)?.[k]).length); return [`${q} (${k})`, ...c, c.reduce((x, y) => x + y)]; })));
const hi = bzMet.filter((s) => s.ALT >= 2000).sort((a, b) => b.ALT - a.ALT);
console.log(`\n### Südtirol: Stationen ab 2 000 m mit Wettersensoren (${hi.length})\n`);
console.log(table(['Kennung', 'Name', 'Höhe m', 'Sensoren', 'Stempel'], hi.map((s) => { const se = bzBy.get(s.SCODE); const k = Object.keys(se).filter((t) => MET.has(t)); return [s.SCODE, s.NAME_D, Math.round(s.ALT), k.join(' '), (se[k[0]].DATE ?? '—').slice(5, 16)]; })));

// --- Mapping glacier -> nearest station per quantity --------------------------------------------------------------------------
if (args.catalog && args.obs) {
  const glaciers = readJson(resolve(String(args.catalog))).glaciers;
  const obs = readJson(resolve(String(args.obs))).stations;
  const OBS_VAR = { t: 't', wind: 'ff', gust: 'fx', snow: 'snow', precip: 'rr', rad: 'gr' };
  /** station = { net, lat, lon, elev, has: Set(quantity) } */
  const stations = [
    ...tirol.map((f) => ({ net: 'tirol', name: f.properties.name, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], elev: f.geometry.coordinates[2], has: new Set(Object.entries(Q_TIROL).filter(([, k]) => f.properties[k] != null).map(([q]) => q)) })),
    ...bzMet.map((s) => ({ net: 'bz', name: s.NAME_D, lat: s.LAT, lon: s.LONG, elev: s.ALT, has: new Set(Object.entries(Q_BZ).filter(([, k]) => bzBy.get(s.SCODE)?.[k]).map(([q]) => q)) })),
    ...obs.filter((s) => (s.networks ?? []).some((n) => ['dwd10', 'tawes', 'smn', 'smnp'].includes(n))).map((s) => ({ net: `obs:${s.country}`, name: s.name, lat: s.lat, lon: s.lon, elev: s.elev, has: new Set(Object.entries(OBS_VAR).filter(([, k]) => (s.vars ?? []).includes(k)).map(([q]) => q)) })),
  ];
  const QS = ['t', 'wind', 'gust', 'snow', 'precip', 'rad'];
  const run = (km, dz) => {
    const per = new Map(); // key (country or region) -> { n, any, q: {..}, net: {...} }
    const bump = (key, g, hit) => {
      if (!per.has(key)) per.set(key, { n: 0, any: 0, q: Object.fromEntries(QS.map((q) => [q, 0])), net: {} });
      const r = per.get(key); r.n++;
      let any = false;
      for (const q of QS) if (hit[q]) { r.q[q]++; any = true; r.net[hit[q].net] = (r.net[hit[q].net] ?? 0) + 1; }
      if (any) r.any++;
    };
    for (const g of glaciers) {
      const hit = {};
      const near = stations.filter((s) => s.elev >= g.z[0] - dz && s.elev <= g.z[2] + dz).map((s) => ({ s, km: distKm(g.lat, g.lon, s.lat, s.lon) })).filter((x) => x.km <= km).sort((a, b) => a.km - b.km);
      for (const q of QS) { const x = near.find((c) => c.s.has.has(q)); if (x) hit[q] = x.s; }
      bump(`Land ${g.country}`, g, hit); bump(g.region, g, hit); bump('alle', g, hit);
    }
    return per;
  };
  for (const [km, dz] of [[KM, DZ], [10, 500]]) {
    const per = run(km, dz);
    console.log(`\n### Zuordnung: nächste Station je Größe innerhalb ${km} km und ±${dz} m gegen die Höhenspanne des Gletschers (${glaciers.length} Gletscher)\n`);
    const keys = ['alle', ...[...per.keys()].filter((k) => k.startsWith('Land ')).sort(), ...[...per.keys()].filter((k) => k !== 'alle' && !k.startsWith('Land ')).sort()];
    console.log(table(['Land / Region', 'Gletscher', 'mit Station', 'Temperatur', 'Wind', 'Böe', 'Schneehöhe', 'Niederschlag', 'Strahlung', 'Treffer je Netz'],
      keys.map((k) => { const r = per.get(k); return [k, r.n, r.any, ...QS.map((q) => r.q[q]), Object.entries(r.net).sort().map(([n, c]) => `${n} ${c}`).join(', ') || '—']; })));
  }
}
