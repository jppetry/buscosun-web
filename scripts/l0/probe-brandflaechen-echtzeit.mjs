/**
 * L0-Sonde der Phase **BF0** („Brandflächen in Echtzeit", Gate GBF1).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
 *        scripts/l0/probe-brandflaechen-echtzeit.mjs
 *
 * Misst die sechs Fragen des Kickoffs `prompt-brandflaechen-echtzeit.md` §BF0.
 * Schreibt nichts, ändert nichts — reine Messung für `audit/brandflaechen-echtzeit.md`.
 *
 * Quellen: FIRMS über den echten Edge-Handler (Schlüssel aus `.env.local`),
 * EFFIS-WFS direkt, CLC-Maske aus `public/fire/clc-industry-mask.png`.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function loadEnvLocal() {
  try {
    const txt = readFileSync('.env.local', 'utf8').replace(/^﻿/, '');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* ohne Schlüssel bleibt die FIRMS-Seite leer */ }
}

const head = (s) => console.log(`\n${'='.repeat(78)}\n${s}\n${'='.repeat(78)}`);
const q = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor((arr.length - 1) * p))] : NaN);
const f1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : '—');

const {
  parseFirmsCsv, windowPlan, firmsUrl, FIRMS_SOURCES, dedupe, metersBetween, footprintRing,
} = await import('../../src/fire/sources/firmsHotspots.ts');
const { buildFireEvents, LINK_RADIUS_M, STATIC_MIN_DAYS } = await import('../../src/fire/fireEvents.ts');
const { buildFireZones } = await import('../../src/fire/fireZones.ts');
const { burntUrl } = await import('../../src/fire/sources/euContext.ts');
const { parseBurntFeature, nearPolygon, timeMatches, TOLERANCE_M } = await import('../../src/fire/fireCorroboration.ts');
const { landcoverAt } = await import('../../src/fire/clcMask.ts');

// ---------------------------------------------------------------------------
// Eingaben
// ---------------------------------------------------------------------------

async function firmsRows(windowH) {
  loadEnvLocal();
  const { default: handler } = await import('../../netlify/edge-functions/firms.ts');
  const now = Date.now();
  const rows = [];
  for (const src of FIRMS_SOURCES) {
    for (const chunk of windowPlan(windowH, now)) {
      const res = await handler(new Request(`http://localhost${firmsUrl(src, chunk)}`));
      if (!res.ok) { console.log(`  ⚠ ${src}: HTTP ${res.status}`); continue; }
      rows.push(...parseFirmsCsv(await res.text(), src).rows);
    }
  }
  return rows;
}

async function effis(which) {
  const res = await fetch(burntUrl(which));
  const fc = await res.json();
  const feats = Array.isArray(fc?.features) ? fc.features : [];
  return { status: res.status, raw: feats.length, polys: feats.map(parseBurntFeature).filter(Boolean) };
}

function clcMask() {
  const buf = readFileSync(new URL('../../public/fire/clc-industry-mask.png', import.meta.url));
  let p = 8, w = 0, h = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)); const data = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) data.set(raw.subarray(r * (w + 1) + 1, (r + 1) * (w + 1)), r * w);
  return { width: w, height: h, data };
}

// ---------------------------------------------------------------------------
// Geometrie: Union-Find-Clustering und konvexe Hülle
// ---------------------------------------------------------------------------

function clusterRows(rows, linkM) {
  const cell = linkM / 111_320;
  const parent = rows.map((_, i) => i);
  const find = (i) => { let r = i; while (parent[r] !== r) r = parent[r]; while (parent[i] !== r) { const n = parent[i]; parent[i] = r; i = n; } return r; };
  const uni = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const grid = new Map();
  rows.forEach((r, i) => {
    const cos = Math.cos((r.lat * Math.PI) / 180) || 1;
    const k = `${Math.floor(r.lat / cell)}|${Math.floor(r.lon / (cell / cos))}`;
    const l = grid.get(k); if (l) l.push(i); else grid.set(k, [i]);
  });
  rows.forEach((r, i) => {
    const cos = Math.cos((r.lat * Math.PI) / 180) || 1;
    const gi = Math.floor(r.lat / cell), gj = Math.floor(r.lon / (cell / cos));
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const l = grid.get(`${gi + di}|${gj + dj}`); if (!l) continue;
      for (const j of l) if (j > i && metersBetween(r, rows[j]) <= linkM) uni(i, j);
    }
  });
  const byRoot = new Map();
  rows.forEach((r, i) => { const k = find(i); const g = byRoot.get(k); if (g) g.push(r); else byRoot.set(k, [r]); });
  return [...byRoot.values()];
}

/** Andrews Monotone Chain in lokalen Metern; Fläche in ha. */
function convexHullHa(rows) {
  if (rows.length < 3) return 0;
  const lat0 = rows.reduce((s, r) => s + r.lat, 0) / rows.length;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180), ky = 110_574;
  const pts = rows.map((r) => [r.lon * kx, r.lat * ky]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = []; for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let a = 0;
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) a += hull[j][0] * hull[i][1] - hull[i][0] * hull[j][1];
  return Math.abs(a / 2) / 10_000;
}

const centroid = (rows) => ({
  lat: rows.reduce((s, r) => s + r.lat, 0) / rows.length,
  lon: rows.reduce((s, r) => s + r.lon, 0) / rows.length,
});

// ---------------------------------------------------------------------------
head('Eingaben');
// ---------------------------------------------------------------------------

const raw24 = await firmsRows(24);
const rows24 = dedupe(raw24);
const raw7d = await firmsRows(168);
const rows7d = dedupe(raw7d);
console.log(`FIRMS 24 h: ${raw24.length} roh → ${rows24.length} nach Dedup`);
console.log(`FIRMS 7 d : ${raw7d.length} roh → ${rows7d.length} nach Dedup`);
const bySrc = {};
for (const r of rows24) bySrc[r.source] = (bySrc[r.source] ?? 0) + 1;
console.log('  je Strom (nach Dedup):', Object.entries(bySrc).map(([k, v]) => `${k} ${v}`).join(' · '));
const conf = {};
for (const r of rows24) conf[r.confidence ?? 'null'] = (conf[r.confidence ?? 'null'] ?? 0) + 1;
console.log('  Konfidenz:', Object.entries(conf).map(([k, v]) => `${k} ${v}`).join(' · '));
const slots = new Set(rows24.map((r) => Math.round(r.acqMs / 60_000)));
console.log(`  Erfassungsminuten (Überflüge) in 24 h: ${slots.size}`);

const week = await effis('week');
const season = await effis('season');
console.log(`EFFIS week  : HTTP ${week.status} · ${week.polys.length} Flächen`);
console.log(`EFFIS season: HTTP ${season.status} · ${season.polys.length} Flächen`);

// ---------------------------------------------------------------------------
head('BF0-3  Welche Verknüpfungsdistanz? (gepoolt vs. je Überflug)');
// ---------------------------------------------------------------------------

console.log('gepoolt über 24 h:');
console.log(`  ${'Distanz'.padStart(8)} ${'Cluster'.padStart(8)} ${'Einzel'.padStart(7)} ${'in Gruppen'.padStart(11)} ${'größtes'.padStart(8)}`);
const pooled = {};
for (const m of [500, 1000, 1500, 2000]) {
  const cs = clusterRows(rows24, m);
  pooled[m] = cs;
  const single = cs.filter((c) => c.length === 1).length;
  const inGroups = rows24.length - single;
  const biggest = Math.max(...cs.map((c) => c.length));
  console.log(`  ${String(m + ' m').padStart(8)} ${String(cs.length).padStart(8)} ${String(single).padStart(7)}`
    + ` ${String(`${inGroups} (${((inGroups / rows24.length) * 100).toFixed(1)} %)`).padStart(11)} ${String(biggest).padStart(8)}`);
}
// Je Überflug: Zeilen nach Erfassungsminute gruppieren, dann je Gruppe clustern.
const byPass = new Map();
for (const r of rows24) {
  const k = `${r.source}@${Math.round(r.acqMs / 60_000)}`;
  const l = byPass.get(k); if (l) l.push(r); else byPass.set(k, [r]);
}
for (const m of [1000, 1500]) {
  let cs = 0, single = 0;
  for (const g of byPass.values()) { const c = clusterRows(g, m); cs += c.length; single += c.filter((x) => x.length === 1).length; }
  console.log(`je Überflug (${byPass.size} Pässe), ${m} m: ${cs} Cluster · ${single} Einzelpixel (${((single / rows24.length) * 100).toFixed(0)} %)`);
}
console.log(`\nBestand im Code: LINK_RADIUS_M = ${LINK_RADIUS_M} m (fireEvents.ts), zusätzlich Zeitlücke 48 h.`);

// ---------------------------------------------------------------------------
head('BF0-1  Wie viele Cluster schneiden eine EFFIS-Fläche?');
// ---------------------------------------------------------------------------

const CLUSTERS = pooled[1500];
const matchOf = (rowsOfCluster, polys) => {
  for (const r of rowsOfCluster) {
    for (const p of polys) {
      if (!timeMatches(p, r.acqMs)) continue;
      if (nearPolygon(r.lon, r.lat, p, TOLERANCE_M)) return p;
    }
  }
  return null;
};
for (const [name, basket] of [['week (7 Tage)', week.polys], ['season (Saison)', season.polys]]) {
  let hit = 0; let px = 0;
  for (const c of CLUSTERS) if (matchOf(c, basket)) { hit++; px += c.length; }
  console.log(`  gegen ${name}: ${hit} von ${CLUSTERS.length} Clustern (${((hit / CLUSTERS.length) * 100).toFixed(0)} %)`
    + ` · ${px} von ${rows24.length} Pixeln`);
}

// ---------------------------------------------------------------------------
head('BF0-2  Überschätzungsfaktor: Hülle bzw. Pixelraster gegen AREA_HA');
// ---------------------------------------------------------------------------

const pairs = [];
for (const c of CLUSTERS) {
  const p = matchOf(c, season.polys);
  if (!p || p.areaHa == null || p.areaHa <= 0) continue;
  const hull = convexHullHa(c);
  const zone = buildFireZones(c).reduce((s, z) => s + z.areaHa, 0);
  pairs.push({ p, px: c.length, hull, zone, fHull: hull / p.areaHa, fZone: zone / p.areaHa });
}
console.log(`  ${pairs.length} Paare (Cluster ↔ kartierte Fläche)`);
console.log(`  ${'EFFIS'.padStart(7)} ${'Hülle'.padStart(9)} ${'Raster'.padStart(9)} ${'f_Hülle'.padStart(8)} ${'f_Raster'.padStart(9)}  px  Ort`);
for (const x of pairs.sort((a, b) => b.p.areaHa - a.p.areaHa)) {
  console.log(`  ${String(x.p.areaHa).padStart(7)} ${f1(x.hull).padStart(9)} ${f1(x.zone).padStart(9)}`
    + ` ${f1(x.fHull).padStart(8)} ${f1(x.fZone).padStart(9)}  ${String(x.px).padStart(3)}`
    + `  ${x.p.country ?? '??'} ${x.p.province ?? ''}`);
}
for (const [label, key] of [['Hülle', 'fHull'], ['Raster', 'fZone']]) {
  const fs = pairs.map((x) => x[key]).filter(Number.isFinite).sort((a, b) => a - b);
  if (!fs.length) continue;
  console.log(`  Faktor ${label}: min ${f1(fs[0])} · p25 ${f1(q(fs, 0.25))} · Median ${f1(q(fs, 0.5))}`
    + ` · p75 ${f1(q(fs, 0.75))} · max ${f1(fs[fs.length - 1])}  (n=${fs.length})`);
}
// Wie groß ist ein Einzelpixel wirklich?
const pxHa = rows24.map((r) => {
  const g = footprintRing(r); if (!g) return null;
  return (r.scanKm * r.trackKm) * 100;
}).filter(Number.isFinite).sort((a, b) => a - b);
console.log(`  Einzelpixelfläche: min ${f1(pxHa[0])} ha · Median ${f1(q(pxHa, 0.5))} ha · max ${f1(pxHa[pxHa.length - 1])} ha`);

// ---------------------------------------------------------------------------
head('BF0-4  Wie wird der Industrieblock ausgeschlossen?');
// ---------------------------------------------------------------------------

const big = [...CLUSTERS].sort((a, b) => b.length - a.length).slice(0, 6);
const mask = clcMask();
const events7d = buildFireEvents(rows7d, Date.now());
console.log(`  Ereignisse aus 7 Tagen (fireEvents.ts): ${events7d.length}, davon ortsfest: ${events7d.filter((e) => e.suspectedStatic).length}`);
console.log(`\n  Die größten Cluster des 24-h-Laufs:`);
console.log(`  ${'px'.padStart(5)} ${'FRP'.padStart(8)} ${'Tage'.padStart(5)} ${'CLC'.padStart(11)} ${'ortsfest'.padStart(9)} ${'EFFIS'.padStart(6)}  Ort`);
for (const c of big) {
  const ctr = centroid(c);
  const ev = events7d.find((e) => metersBetween(e, ctr) < 3000);
  const frp = c.reduce((s, r) => s + (r.frp ?? 0), 0);
  console.log(`  ${String(c.length).padStart(5)} ${String(Math.round(frp)).padStart(8)}`
    + ` ${String(ev?.distinctDays ?? '?').padStart(5)} ${String(landcoverAt(mask, ctr.lat, ctr.lon) ?? '—').padStart(11)}`
    + ` ${String(ev ? (ev.suspectedStatic ? 'JA' : 'nein') : '?').padStart(9)}`
    + ` ${String(matchOf(c, season.polys) ? 'ja' : 'nein').padStart(6)}  ${ctr.lat.toFixed(3)},${ctr.lon.toFixed(3)}`);
}
// Falsch-Positiv-Rate der beiden Kandidaten: wie oft treffen sie eine EFFIS-kartierte Fläche?
let mappedTotal = 0, mappedStatic = 0, mappedArtif = 0, unmappedTotal = 0, unmappedStatic = 0, unmappedArtif = 0;
for (const c of CLUSTERS) {
  const ctr = centroid(c);
  const ev = events7d.find((e) => metersBetween(e, ctr) < 3000);
  const isStatic = !!ev?.suspectedStatic;
  const isArtif = landcoverAt(mask, ctr.lat, ctr.lon) === 'industrial';
  if (matchOf(c, season.polys)) { mappedTotal++; if (isStatic) mappedStatic++; if (isArtif) mappedArtif++; }
  else { unmappedTotal++; if (isStatic) unmappedStatic++; if (isArtif) unmappedArtif++; }
}
console.log(`\n  Falsch-Positiv-Test (ein Merkmal ist falsch positiv, wenn es eine EFFIS-KARTIERTE Fläche als Dauerquelle einstuft):`);
console.log(`    kartierte Cluster:   ${mappedTotal} · davon ortsfest ${mappedStatic} (${mappedTotal ? ((mappedStatic / mappedTotal) * 100).toFixed(0) : 0} % FP) · davon CLC-Industrie ${mappedArtif} (${mappedTotal ? ((mappedArtif / mappedTotal) * 100).toFixed(0) : 0} % FP)`);
console.log(`    unkartierte Cluster: ${unmappedTotal} · davon ortsfest ${unmappedStatic} · davon CLC-Industrie ${unmappedArtif}`);
console.log(`    (Bestand: STATIC_MIN_DAYS = ${STATIC_MIN_DAYS} Tage, plus Bewegung < 1 Pixelbreite)`);

// ---------------------------------------------------------------------------
head('BF0-5  Kartierschwelle: min(AREA_HA) je Korb');
// ---------------------------------------------------------------------------

for (const [name, b] of [['week', week], ['season', season]]) {
  const has = b.polys.map((p) => p.areaHa).filter((n) => n != null).sort((a, b2) => a - b2);
  console.log(`  ${name.padEnd(7)} n=${String(has.length).padStart(4)} · min ${has[0]} ha · p25 ${q(has, 0.25)} · Median ${q(has, 0.5)} · max ${has[has.length - 1]} ha`);
  const under = has.filter((h) => h < 5).length;
  console.log(`          davon < 5 ha: ${under} (${((under / has.length) * 100).toFixed(0)} %)`);
}

// ---------------------------------------------------------------------------
head('BF0-6  Ist week ⊂ season? (nach id)');
// ---------------------------------------------------------------------------

const seasonIds = new Set(season.polys.map((p) => p.id));
const missing = week.polys.filter((p) => !seasonIds.has(p.id));
console.log(`  week: ${week.polys.length} · season: ${season.polys.length} · in week, aber NICHT in season: ${missing.length}`);
for (const p of missing.slice(0, 10)) {
  console.log(`    id=${p.id} ${p.country} ${p.province} ${p.areaHa} ha · FIREDATE ${p.firedateMs ? new Date(p.firedateMs).toISOString().slice(0, 10) : '—'}`);
}
// Und die Gegenrichtung: wie viele season-Flächen sind jünger als 7 Tage?
const cut = Date.now() - 7 * 86_400_000;
const fresh = season.polys.filter((p) => p.firedateMs != null && p.firedateMs >= cut);
console.log(`  season-Flächen mit FIREDATE in den letzten 7 Tagen: ${fresh.length} (week hat ${week.polys.length})`);

// Latenz FIREDATE → LASTUPDATE im Wochenkorb.
const lat = week.polys.filter((p) => p.firedateMs != null && p.lastUpdateMs != null)
  .map((p) => (p.lastUpdateMs - p.firedateMs) / 86_400_000).sort((a, b) => a - b);
if (lat.length) {
  console.log(`  Latenz FIREDATE→LASTUPDATE: min ${f1(lat[0])} d · Median ${f1(q(lat, 0.5))} d · max ${f1(lat[lat.length - 1])} d (n=${lat.length})`);
}
