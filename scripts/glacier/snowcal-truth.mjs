#!/usr/bin/env node
/**
 * Phase GM, GM-3 — truth of the snow calibration: winter balance PER ELEVATION BIN of every glacier-winter that has one.
 *
 *   node scripts/glacier/snowcal-truth.mjs --glamos=<dir with massbalance_fixdate_elevationbins.csv> --wgms=<dir with mass_balance*.csv, glacier.csv>
 *        --catalog=<static/<build>/catalog.json> --out=<gy.json> [--from=2012 --to=2025]
 *
 * Sources: GLAMOS (2025), Swiss Glacier Mass Balance, release 2025, doi:10.18750/massbalance.2025.r2025 (fixed-date system, CC BY 4.0) for Switzerland;
 * WGMS Fluctuations of Glaciers 2026-02-10 (`mass_balance_band`, dates from `mass_balance`) for Austria. Swiss glaciers are taken from GLAMOS only (no double count).
 * Nothing is modelled here: the script only joins, converts units (WGMS m w. e. → mm) and drops what the frozen method drops (audit/gletscher-schneemodell/gm3-method-frozen.md §2).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const FROM = Number(arg('from', 2012)), TO = Number(arg('to', 2025));

/** Minimal RFC 4180 reader (quoted fields with commas and doubled quotes). */
export function csv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const h = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}

/** Area-weighted median elevation of a set of bins (linear inside the bin that holds the half). */
export function medianElevation(bins) {
  const total = bins.reduce((s, b) => s + b.area, 0);
  let acc = 0;
  for (const b of [...bins].sort((x, y) => x.z0 - y.z0)) {
    if (acc + b.area >= total / 2) return b.z0 + ((total / 2 - acc) / b.area) * (b.z1 - b.z0);
    acc += b.area;
  }
  return null;
}

const hav = (lon1, lat1, lon2, lat2) => { const r = 6371, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180; const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((lon2 - lon1) * Math.PI / 360) ** 2; return 2 * r * Math.asin(Math.sqrt(a)); };

export function buildTruth({ glamosDir, wgmsDir, catalogPath, from = FROM, to = TO }) {
  const cat = JSON.parse(readFileSync(catalogPath, 'utf8')).glaciers;
  const out = [], dropped = [];

  // --- Switzerland: GLAMOS, fixed dates ----------------------------------------------------------------------------------------
  const lines = readFileSync(join(glamosDir, 'massbalance_fixdate_elevationbins.csv'), 'utf8').split(/\r?\n/).filter((l) => /^[^,]+,[A-Z]\d/.test(l));
  const bySgi = new Map();
  for (const g of cat) if (g.country === 'CH' && g.inv?.sgi) { const k = g.inv.sgi; if (!bySgi.has(k) || bySgi.get(k).area.km2 < g.area.km2) bySgi.set(k, g); }
  const gy = new Map();
  for (const l of lines) {
    const c = l.split(',');
    const year = Number(c[4].slice(0, 4));
    if (!(year >= from && year <= to)) continue;
    const k = `${c[1]}|${year}`;
    if (!gy.has(k)) gy.set(k, { src: 'glamos', country: 'CH', name: c[0], key: c[1], year, t0: c[2], t1: c[3], bins: [] });
    gy.get(k).bins.push({ z0: Number(c[9]), z1: Number(c[10]), area: Number(c[8]), bw: c[5] === '' || c[5] === 'NaN' ? null : Number(c[5]) });
  }
  for (const o of gy.values()) {
    // catalogue entry: the same SGI id, else the largest entry whose id starts with it (GLAMOS names a glacier the catalogue holds in parts)
    const g = bySgi.get(o.key) ?? [...bySgi.entries()].filter(([k]) => k.startsWith(o.key)).map(([, v]) => v).sort((a, b) => b.area.km2 - a.area.km2)[0] ?? null;
    if (!g) { dropped.push(`${o.name} ${o.year}: no catalogue entry for ${o.key}`); continue; }
    Object.assign(o, { catId: g.id, region: g.region, lat: g.lat, lon: g.lon });
    out.push(o);
  }

  // --- Austria: WGMS bands, the dates of the survey ------------------------------------------------------------------------------
  const allGlac = new Map(csv(readFileSync(join(wgmsDir, 'glacier.csv'), 'utf8')).map((r) => [r.id, r]));
  const glac = new Map([...allGlac].filter(([, r]) => r.country === 'AT'));
  const dates = new Map(csv(readFileSync(join(wgmsDir, 'mass_balance.csv'), 'utf8')).filter((r) => r.country === 'AT').map((r) => [`${r.glacier_id}|${r.year}`, r]));
  const at = new Map();
  for (const r of csv(readFileSync(join(wgmsDir, 'mass_balance_band.csv'), 'utf8'))) {
    if (r.country !== 'AT') continue;
    const year = Number(r.year);
    if (!(year >= from && year <= to) || r.winter_balance === '') continue;
    const k = `${r.glacier_id}|${year}`;
    if (!at.has(k)) at.set(k, { src: 'wgms', country: 'AT', name: r.glacier_name, key: r.glacier_id, year, bins: [] });
    at.get(k).bins.push({ z0: Number(r.lower_elevation), z1: Number(r.upper_elevation), area: Number(r.area) / 1e6, bw: Math.round(Number(r.winter_balance) * 1000) });
  }
  const atCat = cat.filter((g) => g.country === 'AT');
  // a band without an area takes the area of the same band in the nearest year of the same glacier that has one (named in `areaFrom`)
  const areaOf = new Map();
  for (const o of at.values()) for (const b of o.bins) if (b.area > 0) { const k = `${o.key}|${b.z0}|${b.z1}`; if (!areaOf.has(k)) areaOf.set(k, []); areaOf.get(k).push({ year: o.year, area: b.area }); }
  for (const o of at.values()) {
    for (const b of o.bins) {
      if (b.area > 0) continue;
      const c = (areaOf.get(`${o.key}|${b.z0}|${b.z1}`) ?? []).sort((x, y) => Math.abs(x.year - o.year) - Math.abs(y.year - o.year))[0];
      if (c) { b.area = c.area; o.areaFrom = [...new Set([...(o.areaFrom ?? []), c.year])].sort(); }
    }
  }
  for (const o of at.values()) {
    const d = dates.get(`${o.key}|${o.year}`), g = glac.get(o.key);
    if (!d?.begin_date || !d?.midseason_date) { dropped.push(`${o.name} ${o.year}: no begin or mid-season date`); continue; }
    if (o.bins.some((b) => !(b.area > 0))) { dropped.push(`${o.name} ${o.year}: band without area`); continue; }
    const lat = Number(g.latitude), lon = Number(g.longitude);
    const near = atCat.map((c) => ({ c, km: hav(lon, lat, c.lon, c.lat) })).sort((a, b) => a.km - b.km)[0];
    // GM-11 (V-GM-136): the catalogue glacier of a series — first the WGMS id the catalogue carries (`inv.wgms`), then the chain of
    // `parent_glacier_id`, the distance only for a series with neither. A series whose chain reaches a catalogue glacier only through an
    // ancestor measures a PART of that glacier: it names the ancestor (`catAncestor`) and gets no catalogue glacier (`catId: null`) — it stays
    // truth for the country value and the shape, it gives no glacier its own factor. `region` stays the nearest entry's (the forcing station).
    const byWgms = atCat.find((c) => String(c.inv?.wgms ?? '') === o.key);
    let via = null, catId = null, ancestor = null;
    if (byWgms) { via = 'wgms'; catId = byWgms.id; }
    else if (g.parent_glacier_id) {
      via = 'parent';
      for (let p = g.parent_glacier_id, hops = 0; p && hops < 5; hops++) {
        const hit = atCat.find((c) => String(c.inv?.wgms ?? '') === p);
        if (hit) { ancestor = { wgms: p, id: hit.id, hops: hops + 1 }; break; }
        p = allGlac.get(p)?.parent_glacier_id || null;
      }
    } else if (near.km <= 3) { via = 'distance'; catId = near.c.id; }
    Object.assign(o, { t0: d.begin_date, t1: d.midseason_date, timeSystem: d.time_system || null, catId, catVia: via, ...(ancestor ? { catAncestor: ancestor } : {}), catKm: Math.round(near.km * 10) / 10, region: near.c.region, lat, lon });
    out.push(o);
  }

  for (const o of out) {
    o.bins.sort((a, b) => a.z0 - b.z0);
    if (o.bins.some((b) => b.bw == null)) { dropped.push(`${o.name} ${o.year}: bin without winter balance`); o.drop = true; continue; }
    const days = (Date.parse(o.t1) - Date.parse(o.t0)) / 86_400_000;
    if (!(days >= 150 && days <= 270)) { dropped.push(`${o.name} ${o.year}: winter of ${days} days (${o.t0} … ${o.t1})`); o.drop = true; continue; }
    const area = o.bins.reduce((s, b) => s + b.area, 0);
    o.area = Math.round(area * 1000) / 1000;
    o.zMed = Math.round(medianElevation(o.bins));
    o.bw = Math.round(o.bins.reduce((s, b) => s + b.area * b.bw, 0) / area);
  }
  return { gy: out.filter((o) => !o.drop), dropped };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const { gy, dropped } = buildTruth({ glamosDir: arg('glamos'), wgmsDir: arg('wgms'), catalogPath: arg('catalog') });
  writeFileSync(arg('out'), JSON.stringify({ kind: 'glacier/snowcal-truth', from: FROM, to: TO, sources: ['GLAMOS (2025), Swiss Glacier Mass Balance, release 2025, doi:10.18750/massbalance.2025.r2025', 'WGMS (2026), Fluctuations of Glaciers Database, 2026-02-10'], dropped, gy }));
  const gl = new Map();
  for (const o of gy) { const k = `${o.country} ${o.region} | ${o.name}`; const e = gl.get(k) ?? { n: 0, o }; e.n++; gl.set(k, e); }
  for (const [k, e] of [...gl].sort()) console.log(k.padEnd(62), String(e.n).padStart(2), `zMed ${e.o.zMed}`, `bins ${e.o.bins.length}`, e.o.catId ? `${e.o.catId} (${e.o.catVia ?? "sgi"})` : e.o.catAncestor ? `(Teil von ${e.o.catAncestor.id} über die Elternkette, kein eigener Katalog-Gletscher)` : `(kein Katalogeintrag, nächster ${e.o.catKm} km)`);
  console.log(`${gy.length} glacier-winters, ${gl.size} glaciers (CH ${gy.filter((o) => o.country === 'CH').length}, AT ${gy.filter((o) => o.country === 'AT').length}); dropped ${dropped.length}`);
  for (const d of dropped) console.log('  dropped:', d);
}
