#!/usr/bin/env node
/**
 * Phase GI, step 0 — measurements for `audit/gletscher-imis.md` §2 (run BEFORE the product code existed; the product's own report
 * `stn/map/<file>.json` must give the same counts for the same inputs). Read-only, prints markdown tables.
 *
 *   node audit/gletscher-imis/schritt0.mjs --fetched=<ISO time of the recording> --catalog=<static catalog.json> --outlines=<dir with <region>-L1.json>
 *        --stn=<glacier/v1/stn/stations.json> --obs=<obs/v1 stations.json> --obs-latest=<obs/v1 latest.json>
 *        [--precip=<measurements-precipitation answer> --daily=<daily-snow answer>]
 *
 * Reads the recorded SLF answers in `scripts/lib/fixtures/glacier/stations/` (`imis-stations.json` as served,
 * `imis-measurements.json.gz` = the body as transferred with `Content-Encoding: gzip`).
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', '..', 'scripts', 'lib', 'fixtures', 'glacier', 'stations');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const readJson = (p) => JSON.parse(readFileSync(resolve(String(p)), 'utf8'));
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const band = (h) => (h < 1500 ? '< 1500' : h < 2000 ? '1500–1999' : h < 2500 ? '2000–2499' : h < 3000 ? '2500–2999' : '≥ 3000');
const BANDS = ['< 1500', '1500–1999', '2000–2499', '2500–2999', '≥ 3000'];
const sum = (a) => a.reduce((x, y) => x + y, 0);

// --- IMIS ----------------------------------------------------------------------------------------------------------------------------------
const st = readJson(join(FIX, 'imis-stations.json'));
const rows = JSON.parse(gunzipSync(readFileSync(join(FIX, 'imis-measurements.json.gz'))).toString('utf8'));
const fetched = Date.parse(String(args.fetched ?? ''));
const elevOf = new Map(st.map((s) => [s.code, s.elevation]));
const by = new Map();
for (const r of rows) { if (!by.has(r.station_code)) by.set(r.station_code, []); by.get(r.station_code).push(r); }
for (const a of by.values()) a.sort((x, y) => (x.measure_date < y.measure_date ? -1 : 1));

console.log(`### IMIS: ${st.length} Stationen (${Object.entries(st.reduce((a, s) => ((a[s.country_code] = (a[s.country_code] ?? 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join(', ')}), ${rows.length} Zeilen für ${by.size} Stationen; ohne Zeile: ${st.filter((s) => !by.has(s.code)).map((s) => s.code).join(', ') || '—'}\n`);
const types = [...new Set(st.map((s) => s.type))].sort((a, b) => st.filter((s) => s.type === b).length - st.filter((s) => s.type === a).length);
console.log(`#### IMIS: Stationen je Typ und Höhenband\n`);
console.log(table(['Typ', ...BANDS, 'Summe'], types.map((t) => { const c = BANDS.map((b) => st.filter((s) => s.type === t && band(s.elevation) === b).length); return [t, ...c, sum(c)]; })));

const F = { 't (TA_30MIN_MEAN)': 'TA_30MIN_MEAN', 'Feuchte (RH_30MIN_MEAN)': 'RH_30MIN_MEAN', 'wind (VW_30MIN_MEAN)': 'VW_30MIN_MEAN', 'gust (VW_30MIN_MAX)': 'VW_30MIN_MAX', 'Richtung (DW_30MIN_MEAN)': 'DW_30MIN_MEAN', 'snow (HS)': 'HS', 'Oberfläche (TSS_30MIN_MEAN)': 'TSS_30MIN_MEAN', 'reflektierte Strahlung (RSWR_30MIN_MEAN)': 'RSWR_30MIN_MEAN' };
console.log(`\n#### IMIS: Stationen mit Wert in der jüngsten Zeile je Größe und Höhenband\n`);
console.log(table(['Größe (Feld)', ...BANDS, 'Summe', 'in 24 h je einmal'], Object.entries(F).map(([q, k]) => {
  const c = BANDS.map((b) => [...by].filter(([code, a]) => band(elevOf.get(code)) === b && a[a.length - 1][k] != null).length);
  return [q, ...c, sum(c), [...by.values()].filter((a) => a.some((r) => r[k] != null)).length];
})));
if (args.precip) {
  const p = readJson(args.precip), pb = new Map();
  for (const r of p) { if (!pb.has(r.station_code)) pb.set(r.station_code, []); pb.get(r.station_code).push(r); }
  const have = [...pb].filter(([, a]) => a.some((r) => r.RR_10MIN_SUM != null));
  const c = BANDS.map((b) => have.filter(([code]) => band(elevOf.get(code)) === b).length);
  console.log(`\nNiederschlag (\`measurements-precipitation\`, RR_10MIN_SUM): ${p.length} Zeilen, ${have.length} Stationen mit Wert — je Höhenband ${BANDS.map((b, i) => `${b}: ${c[i]}`).join(', ')}`);
  if (args.daily) {
    const d = readJson(args.daily), newest = d.map((r) => r.measure_date).sort().pop();
    const hn = new Map(d.filter((r) => r.measure_date === newest && r.HN_1D != null).map((r) => [r.station_code, r.HN_1D]));
    const cmp = have.filter(([code, a]) => (hn.get(code) ?? 0) >= 10 && a.filter((r) => r.RR_10MIN_SUM != null).length > 100).map(([code, a]) => ({ code, hn: hn.get(code), rr: sum(a.map((r) => r.RR_10MIN_SUM ?? 0)) }));
    const rr = cmp.map((x) => x.rr).sort((a, b) => a - b);
    console.log(`Gegenprobe Regenmesser: ${cmp.length} Stationen mit HN_1D ≥ 10 cm (\`daily-snow\`, ${newest}) und Regenmesser — 24-h-Summe des Regenmessers im Median ${rr[rr.length >> 1]?.toFixed(1)} mm, unter 1 mm an ${cmp.filter((x) => x.rr < 1).length}`);
  }
}
if (Number.isFinite(fetched)) {
  const last = [...by.values()].map((a) => Date.parse(a[a.length - 1].measure_date));
  const lag = last.map((ms) => Math.round((fetched - ms) / 60000)).sort((a, b) => a - b);
  const bins = { '≤ 30 min': 0, '31–60 min': 0, '61–180 min': 0, '> 180 min': 0 };
  for (const m of lag) bins[m <= 30 ? '≤ 30 min' : m <= 60 ? '31–60 min' : m <= 180 ? '61–180 min' : '> 180 min']++;
  console.log(`\nStempel (Abruf ${new Date(fetched).toISOString()}): Alter der jüngsten Zeile je Station — ${Object.entries(bins).map(([k, v]) => `${k}: ${v}`).join(', ')}; Median ${lag[lag.length >> 1]} min; Minuten der Stempel: ${[...new Set(rows.map((r) => r.measure_date.slice(14, 16)))].sort().join(', ')}; Zeilen je Station: ${Math.min(...[...by.values()].map((a) => a.length))}–${Math.max(...[...by.values()].map((a) => a.length))}`);
}
console.log(`\n#### IMIS: Stationen ab 3 000 m\n`);
console.log(table(['Kennung', 'Name', 'Höhe m', 'Typ', 'Kanton'], st.filter((s) => s.elevation >= 3000).sort((a, b) => b.elevation - a.elevation).map((s) => [s.code, s.label, Math.round(s.elevation), s.type, s.canton_code])));

// --- Mapping -------------------------------------------------------------------------------------------------------------------------------
if (args.catalog && args.outlines && args.stn && args.obs && args['obs-latest']) {
  const glaciers = readJson(args.catalog).glaciers;
  const regions = [...new Set(glaciers.map((g) => g.region))].sort();
  /** glacier id -> polygons (array of rings arrays) */
  const outline = new Map();
  for (const r of regions) for (const f of readJson(join(String(args.outlines), `${r}-L1.json`)).features) outline.set(f.properties.id, f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
  const QS = ['t', 'wind', 'gust', 'snow', 'precip', 'rad'];
  const HAS = { t: 't', wind: 'ff', gust: 'fx', snow: 'snow', precip: 'rr', rad: 'gr' };
  const own = readJson(args.stn).stations.map((s) => ({ net: s.networks[0] === 'bz' ? 'bz' : 'tirol', id: s.id, name: s.name, lat: s.lat, lon: s.lon, elev: s.elev, has: new Set(QS.filter((q) => s.vars.includes(HAS[q]))) }));
  const latest = readJson(args['obs-latest']).stations;
  const obsNow = (e) => { if (!e) return []; const v = { ...(e.older ?? {}), ...(e.v ?? {}) }; return [...Object.keys(v), ...(e.rr1h || e.rr24h ? ['rr'] : [])]; };
  const obs = readJson(args.obs).stations.filter((s) => (s.networks ?? []).some((n) => ['dwd10', 'tawes', 'smn', 'smnp'].includes(n)))
    .map((s) => ({ net: `obs:${s.country}`, id: s.id, name: s.name, lat: s.lat, lon: s.lon, elev: s.elev, has: new Set(QS.filter((q) => obsNow(latest[s.id]).includes(HAS[q]))) })).filter((s) => s.has.size);
  const IMIS_HAS = { t: 'TA_30MIN_MEAN', wind: 'VW_30MIN_MEAN', gust: 'VW_30MIN_MAX', snow: 'HS' };
  const imis = st.map((s) => ({ net: 'imis', id: `imis:${s.code}`, name: s.label, lat: s.lat, lon: s.lon, elev: s.elevation, has: new Set(Object.entries(IMIS_HAS).filter(([, k]) => (by.get(s.code) ?? []).some((r) => r[k] != null)).map(([q]) => q)) })).filter((s) => s.has.size);

  const R = Math.PI / 180;
  const distKm = (la1, lo1, la2, lo2) => { const a = Math.sin(((la2 - la1) * R) / 2) ** 2 + Math.cos(la1 * R) * Math.cos(la2 * R) * Math.sin(((lo2 - lo1) * R) / 2) ** 2; return 2 * 6371.0088 * Math.asin(Math.sqrt(a)); };
  /** Distance of a point to the outline in km: 0 on the ice, else to the nearest edge (local plane around the point). */
  const outlineKm = (polys, lat, lon) => {
    const kx = 111.195 * Math.cos(lat * R), ky = 111.195;
    let best = Infinity, inside = false;
    for (const poly of polys) {
      let inPoly = false;
      poly.forEach((ring, ri) => {
        let c = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const ax = (ring[j][0] - lon) * kx, ay = (ring[j][1] - lat) * ky, bx = (ring[i][0] - lon) * kx, by2 = (ring[i][1] - lat) * ky;
          if ((ay > 0) !== (by2 > 0) && 0 < ((bx - ax) * (0 - ay)) / (by2 - ay) + ax) c = !c;
          const dx = bx - ax, dy = by2 - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
          best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
        }
        if (ri === 0) inPoly = c; else if (c) inPoly = false;
      });
      if (inPoly) inside = true;
    }
    return inside ? 0 : best;
  };
  const run = (stations, mode, km = 5, dz = 300) => {
    const per = new Map(), hits = new Map();
    const bump = (key, hit) => {
      if (!per.has(key)) per.set(key, { n: 0, any: 0, q: Object.fromEntries(QS.map((q) => [q, 0])), net: {} });
      const r = per.get(key); r.n++;
      let any = false;
      for (const q of QS) if (hit[q]) { r.q[q]++; any = true; r.net[hit[q].s.net] = (r.net[hit[q].s.net] ?? 0) + 1; }
      if (any) r.any++;
    };
    for (const g of glaciers) {
      const polys = outline.get(g.id);
      const near = stations.filter((s) => s.elev >= g.z[0] - dz && s.elev <= g.z[2] + dz)
        .map((s) => ({ s, km: mode === 'outline' && polys ? (distKm(g.lat, g.lon, s.lat, s.lon) > 60 ? Infinity : outlineKm(polys, s.lat, s.lon)) : distKm(g.lat, g.lon, s.lat, s.lon) }))
        .filter((x) => x.km <= km).sort((a, b) => a.km - b.km || (a.s.id < b.s.id ? -1 : 1));
      const hit = {};
      for (const q of QS) { const x = near.find((c) => c.s.has.has(q)); if (x) hit[q] = x; }
      hits.set(g.id, hit);
      bump(`Land ${g.country}`, hit); bump(g.region, hit); bump('alle', hit);
    }
    return { per, hits };
  };
  const keysOf = (per) => ['alle', ...[...per.keys()].filter((k) => k.startsWith('Land ')).sort(), ...[...per.keys()].filter((k) => k !== 'alle' && !k.startsWith('Land ')).sort()];
  const full = (title, res) => {
    console.log(`\n#### ${title} (${glaciers.length} Gletscher)\n`);
    console.log(table(['Land / Region', 'Gletscher', 'mit Station', 'Temperatur', 'Wind', 'Böe', 'Schneehöhe', 'Niederschlag', 'Strahlung', 'Treffer je Netz'],
      keysOf(res.per).map((k) => { const r = res.per.get(k); return [k, r.n, r.any, ...QS.map((q) => r.q[q]), Object.entries(r.net).sort().map(([n, c]) => `${n} ${c}`).join(', ') || '—']; })));
  };
  console.log(`\n### Zuordnung — Kandidaten: Tirol/Südtirol ${own.length}, obs/v1 mit Lieferung ${obs.length}, IMIS ${imis.length}; Umrisse L1 für ${outline.size} von ${glaciers.length} Gletschern`);
  const A = run([...own, ...obs], 'point'), B = run([...own, ...obs], 'outline'), C = run([...own, ...obs, ...imis], 'outline'), P = run([...own, ...obs, ...imis], 'point');
  full('A — heute: Abstand zum Katalogpunkt, ohne IMIS', A);
  full('C — neu: Abstand zum Umriss, mit IMIS', C);
  console.log(`\n#### Gewinn „mit Station“ je Land und Region: A (Punkt, ohne IMIS) → B (Umriss, ohne IMIS) → C (Umriss, mit IMIS); P = Punkt mit IMIS\n`);
  console.log(table(['Land / Region', 'Gletscher', 'A', 'P', 'B', 'C', 'C − A', 'Temperatur A → C', 'Wind A → C', 'Schneehöhe A → C'],
    keysOf(C.per).map((k) => { const a = A.per.get(k), b = B.per.get(k), c = C.per.get(k), p = P.per.get(k); return [k, c.n, a.any, p.any, b.any, c.any, `+${c.any - a.any}`, `${a.q.t} → ${c.q.t}`, `${a.q.wind} → ${c.q.wind}`, `${a.q.snow} → ${c.q.snow}`]; })));
  const show = (id) => {
    const g = glaciers.find((x) => x.id === id);
    console.log(`\n#### ${g.name} (${id}, ${g.z.join(' / ')} m)\n`);
    console.log(table(['Größe', 'A (Punkt, ohne IMIS)', 'C (Umriss, mit IMIS)'], QS.map((q) => { const f = (h) => (h ? `${h.s.name} (${h.s.net}, ${Math.round(h.s.elev)} m, ${h.km.toFixed(1)} km)` : '—'); return [q, f(A.hits.get(id)[q]), f(C.hits.get(id)[q])]; })));
  };
  for (const id of String(args.show ?? 'gl_ch_grosser-aletschgletscher').split(',')) show(id);
  const zero = [...C.hits].filter(([, h]) => Object.values(h).some((x) => x.km === 0)).length;
  console.log(`\nStationen innerhalb des L1-Umrisses (Abstand 0) als Treffer: an ${zero} Gletschern.`);
}
