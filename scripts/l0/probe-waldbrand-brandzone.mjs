/**
 * L0-Sonde der Phase BA3 („Detektionsraster", Gate GWBBZ1).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
 *        scripts/l0/probe-waldbrand-brandzone.mjs
 *
 * Beantwortet die vier Fragen, die vor der Verdrahtung zu klären sind:
 *
 *   BZ-1  Wie viele Zonen entstehen aus einem echten Lauf (24 h / 7 Tage),
 *         und wie sind Pixelzahl und Fläche verteilt?
 *   BZ-2  Was kostet die Berechnung im Hauptthread? (Gate-Schwelle: 200 ms)
 *   BZ-3  Wie groß ist das Raster im Vergleich zur EFFIS-Kartierung DESSELBEN
 *         Brandes? Das ist die Zahl, die die Beschriftung tragen muss.
 *   BZ-4  Wie groß wird die GeoJSON-Nutzlast der Karte?
 *
 * Netz: FIRMS über den echten Edge-Handler (Schlüssel aus `.env.local`),
 * EFFIS-Wochenlayer direkt. Schreibt nichts.
 */
import { readFileSync } from 'node:fs';

function loadEnvLocal() {
  try {
    const txt = readFileSync('.env.local', 'utf8').replace(/^﻿/, '');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* ohne .env.local bleibt die FIRMS-Seite leer */ }
}

const head = (s) => console.log(`\n${'='.repeat(78)}\n${s}\n${'='.repeat(78)}`);
const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : NaN);

async function fetchFirmsRows(windowH) {
  loadEnvLocal();
  const { default: handler } = await import('../../netlify/edge-functions/firms.ts');
  const { parseFirmsCsv, windowPlan, firmsUrl, FIRMS_SOURCES } = await import('../../src/fire/sources/firmsHotspots.ts');
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

const { buildFireZones, zonesToGeoJSON, zoneAt } = await import('../../src/fire/fireZones.ts');
const { dedupe, inDach } = await import('../../src/fire/sources/firmsHotspots.ts');
const { burntUrl } = await import('../../src/fire/sources/euContext.ts');
const { parseBurntFeature, nearPolygon, timeMatches } = await import('../../src/fire/fireCorroboration.ts');

// ---------------------------------------------------------------------------
head('BZ-1/BZ-2  Zonen aus einem echten Lauf');
// ---------------------------------------------------------------------------

const stats = {};
for (const windowH of [24, 168]) {
  const raw = await fetchFirmsRows(windowH);
  const rows = (typeof dedupe === 'function' ? dedupe(raw) : raw).filter((r) => (typeof inDach === 'function' ? inDach(r) : true));
  const t0 = performance.now();
  const zones = buildFireZones(rows);
  const ms = performance.now() - t0;
  const areas = zones.map((z) => z.areaHa).sort((a, b) => a - b);
  const px = zones.map((z) => z.pixels).sort((a, b) => a - b);
  const single = zones.filter((z) => z.pixels === 1).length;
  const fc = zonesToGeoJSON(zones);
  const bytes = JSON.stringify(fc).length;
  const verts = fc.features.reduce((n, f) => n + f.geometry.coordinates.flat(2).length, 0);
  stats[windowH] = { rows: rows.length, zones: zones.length, ms, areas, px, single, bytes, verts };

  console.log(`\n${windowH} h — ${rows.length} Detektionen ⇒ ${zones.length} Zonen  (${ms.toFixed(1)} ms)`);
  console.log(`  Pixel je Zone   min ${px[0]} · Median ${pct(px, 0.5)} · p90 ${pct(px, 0.9)} · max ${px[px.length - 1]}`);
  console.log(`  Fläche je Zone  min ${areas[0]} ha · Median ${pct(areas, 0.5)} ha · p90 ${pct(areas, 0.9)} ha · max ${areas[areas.length - 1]} ha`);
  console.log(`  Einzelpixel-Zonen: ${single} von ${zones.length} (${Math.round((single / zones.length) * 100)} %)`);
  console.log(`  GeoJSON: ${(bytes / 1024).toFixed(1)} KB · ${verts} Stützpunkte`);
  console.log(`  Die fünf größten Zonen:`);
  for (const z of zones.slice(0, 5)) {
    console.log(`    ${z.areaHa.toString().padStart(7)} ha · ${String(z.pixels).padStart(4)} px`
      + ` · ~${z.meanPixelHa} ha/px · ${z.lat.toFixed(3)},${z.lon.toFixed(3)}`
      + ` · ${new Date(z.firstMs).toISOString().slice(5, 16)} → ${new Date(z.lastMs).toISOString().slice(5, 16)}`);
  }
}

// ---------------------------------------------------------------------------
head('BZ-3  Raster gegen EFFIS-Kartierung — DIE Zahl für die Beschriftung');
// ---------------------------------------------------------------------------

const res = await fetch(burntUrl('week'));
console.log(`EFFIS-Wochenlayer: HTTP ${res.status}`);
const fc = await res.json();
const polys = (fc.features ?? []).map(parseBurntFeature).filter(Boolean);
console.log(`  ${polys.length} kartierte Flächen in DACH (7 Tage)`);

const rows7 = (await fetchFirmsRows(168));
const rows = typeof dedupe === 'function' ? dedupe(rows7) : rows7;
const zones = buildFireZones(rows);
const pairs = [];
for (const p of polys) {
  // Die Zone, die die Fläche trifft: irgendein Zonenpunkt in/nahe dem Polygon.
  const hit = zones.find((z) => {
    if (!timeMatches(p, z.lastMs) && !timeMatches(p, z.firstMs)) return false;
    return nearPolygon(z.lon, z.lat, p);
  });
  if (hit) pairs.push({ p, z: hit });
}
console.log(`\n  ${pairs.length} Paare (kartierte Fläche ↔ Detektionszone):`);
console.log(`  ${'EFFIS ha'.padStart(9)} ${'Raster ha'.padStart(10)} ${'Faktor'.padStart(7)}  px  Ort`);
const factors = [];
for (const { p, z } of pairs) {
  if (p.areaHa == null || p.areaHa <= 0) continue;
  const f = z.areaHa / p.areaHa;
  factors.push(f);
  console.log(`  ${String(p.areaHa).padStart(9)} ${String(z.areaHa).padStart(10)} ${f.toFixed(1).padStart(7)}`
    + `  ${String(z.pixels).padStart(3)}  ${p.country ?? '??'} ${p.province ?? ''}`);
}
factors.sort((a, b) => a - b);
if (factors.length) {
  console.log(`\n  Faktor Raster/Kartierung: min ${factors[0].toFixed(1)} · Median ${pct(factors, 0.5).toFixed(1)}`
    + ` · max ${factors[factors.length - 1].toFixed(1)}  (n=${factors.length})`);
} else {
  console.log('\n  ⚠ Kein Paar gefunden — in diesem Lauf gibt es keine kartierte Fläche mit Detektion.');
}

// ---------------------------------------------------------------------------
head('BZ-4  Klickziel');
// ---------------------------------------------------------------------------
const probe = zones[0];
if (probe) {
  console.log(`  größte Zone bei ${probe.lat.toFixed(4)},${probe.lon.toFixed(4)}:`
    + ` zoneAt(Schwerpunkt) ⇒ ${zoneAt(probe.lon, probe.lat, zones) ? 'Treffer' : 'KEIN Treffer (Schwerpunkt liegt im Loch)'}`);
  console.log(`  zoneAt(1° daneben) ⇒ ${zoneAt(probe.lon + 1, probe.lat, zones) ? 'FEHLER: Treffer' : 'kein Treffer'}`);
}
console.log(`\nZusammenfassung: 24 h ${stats[24]?.zones} Zonen / ${stats[24]?.ms.toFixed(0)} ms`
  + ` · 7 Tage ${stats[168]?.zones} Zonen / ${stats[168]?.ms.toFixed(0)} ms`);
