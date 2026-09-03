/**
 * R3D-4 · Messung "Wie exakt ist das Gelaende — und wie exakt das Wetter?"
 *
 * Importiert die ECHTEN Module (TS-Strip-Loader) und misst an den vier
 * Test-Strecken des Repos:
 *
 *   M1  Profil-Aufloesung — die 3D-Szene zeichnet ihr Gelaende durch die
 *       WETTER-Samples (`scene.columns`), nicht durch den Track. Wie weit
 *       liegt diese Kette vom aufbereiteten Track entfernt?
 *   M2  Hoehenquelle — der Track behaelt seine eigenen Hoehen, das DEM wird nur
 *       geholt, wenn sie unbrauchbar sind (`tourTrack.ts:100`). Wie weit liegen
 *       beide auseinander?
 *   M3  Wetter-Ortsbezug — jeder Sample bekommt den Punktforecast SEINES
 *       Clusters. Wie weit ist der Abfragepunkt vom Sample entfernt?
 *   M4  Relief — wie viele DEM-Kacheln kostet ein zweites, echtes Profil
 *       seitlich der Strecke?
 *
 * Netz nur fuer M2/M4 (AWS-Terrarium). Ohne Netz werden die Zeilen als (leer)
 * ausgewiesen, nicht als Fehler.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, toRgba } from '../../scripts/lib/png.mjs';

import { buildTourTrack } from '../../src/route/tourTrack.ts';
import { haversine } from '../../src/route/routeModel.ts';
import { clusterSamples, clusterRepIndex, radiusForTerrain, DEFAULT_ELEV_BAND_M } from '../../src/pointForecast/clustering.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'test-routes');

/* --- GPX minimal (nur fuer die Messung; die App nimmt DOMParser) --------- */
function parseGpx(text) {
  const pts = [];
  const re = /<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  let m;
  while ((m = re.exec(text))) {
    const ele = /<ele>([-\d.]+)<\/ele>/.exec(m[3]);
    pts.push({ lat: +m[1], lon: +m[2], ele: ele ? +ele[1] : null });
  }
  return { points: pts, waypoints: [] };
}

/* --- Terrarium ----------------------------------------------------------- */
const TPL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const tileCache = new Map();
const lng2x = (lng, z) => ((lng + 180) / 360) * (1 << z);
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (1 << z);
};
async function tile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key);
  let out = null;
  try {
    const res = await fetch(TPL.replace('{z}', z).replace('{x}', x).replace('{y}', y));
    if (res.ok) out = toRgba(decodePng(Buffer.from(await res.arrayBuffer())));
  } catch { out = null; }
  tileCache.set(key, out);
  return out;
}
async function demAt(lat, lon, z = 13) {
  const fx = lng2x(lon, z), fy = lat2y(lat, z);
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const t = await tile(z, tx, ty);
  if (!t) return NaN;
  const px = (fx - tx) * 256, py = (fy - ty) * 256;
  const i0 = Math.min(255, Math.max(0, Math.floor(px))), j0 = Math.min(255, Math.max(0, Math.floor(py)));
  const i1 = Math.min(255, i0 + 1), j1 = Math.min(255, j0 + 1);
  const fxr = px - i0, fyr = py - j0;
  const d = t;
  const at = (i, j) => { const k = (j * 256 + i) * 4; return d[k] * 256 + d[k + 1] + d[k + 2] / 256 - 32768; };
  const e0 = at(i0, j0) * (1 - fxr) + at(i1, j0) * fxr;
  const e1 = at(i0, j1) * (1 - fxr) + at(i1, j1) * fxr;
  return e0 * (1 - fyr) + e1 * fyr;
}

/* --- Statistik ----------------------------------------------------------- */
const med = (a) => { const s = a.filter(Number.isFinite).slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
const p95 = (a) => { const s = a.filter(Number.isFinite).slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : NaN; };
const mx = (a) => a.filter(Number.isFinite).reduce((m, v) => Math.max(m, v), 0);
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-');

/** Hoehe der Sample-Kette bei einer Distanz (das, was `terrainPath` zeichnet). */
function eleOfChain(chain, dist) {
  if (dist <= chain[0].dist) return chain[0].ele;
  for (let i = 1; i < chain.length; i++) {
    if (chain[i].dist >= dist) {
      const a = chain[i - 1], b = chain[i];
      const t = (dist - a.dist) / Math.max(1e-9, b.dist - a.dist);
      return a.ele + (b.ele - a.ele) * t;
    }
  }
  return chain[chain.length - 1].ele;
}
function ascentOf(eles, thr = 3) {
  let asc = 0, ref = null;
  for (const e of eles) {
    if (!Number.isFinite(e)) continue;
    if (ref == null) { ref = e; continue; }
    const d = e - ref;
    if (d >= thr) { asc += d; ref = e; } else if (d <= -thr) ref = e;
  }
  return asc;
}

async function main() {
  const netOk = Number.isFinite(await demAt(47.5, 11.0));
  console.log(netOk ? 'DEM: erreichbar\n' : 'DEM: NICHT erreichbar - M2/M4 uebersprungen\n');

  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.gpx'))) {
    const raw = parseGpx(readFileSync(join(DIR, file), 'utf8'));
    const track = await buildTourTrack(raw, 'gpx');
    const { points, samples, meta } = track;
    const km = meta.totalDistanceM / 1000;

    console.log(`## ${file}  (${km.toFixed(1)} km · ${meta.terrain})`);
    console.log(`   Track ${meta.pointCount} Punkte · Samples ${meta.sampleCount} · Hoehen ${meta.elevationEnriched ? 'aus DEM' : 'aus Datei'}`);

    /* M1 — was die Szene zeichnet gegen den Track ------------------------- */
    const chain = samples.map((s) => ({ dist: s.dist, ele: s.ele }));
    const dev = points.map((pt) => Math.abs(pt.ele - eleOfChain(chain, pt.dist)));
    let maxGap = 0;
    for (let i = 1; i < samples.length; i++) maxGap = Math.max(maxGap, samples[i].dist - samples[i - 1].dist);
    const ascPts = ascentOf(points.map((p) => p.ele));
    const ascSmp = ascentOf(samples.map((s) => s.ele));
    console.log(`   M1 Profil:  Abstand max ${Math.round(maxGap)} m · Abweichung med ${f1(med(dev))} m · p95 ${f1(p95(dev))} m · max ${f1(mx(dev))} m`);
    console.log(`      Anstieg  Track ${Math.round(ascPts)} hm -> Sample-Kette ${Math.round(ascSmp)} hm  (${ascPts > 0 ? Math.round((1 - ascSmp / ascPts) * 100) : 0} % fehlen)`);

    /* M2 — Datei-Hoehe gegen DEM ------------------------------------------ */
    if (netOk) {
      const step = Math.max(1, Math.floor(points.length / 120));
      const probe = points.filter((_, i) => i % step === 0);
      const demE = [];
      for (const pt of probe) demE.push(await demAt(pt.lat, pt.lon));
      const diff = probe.map((pt, i) => Math.abs(pt.ele - demE[i]));
      const signed = probe.map((pt, i) => pt.ele - demE[i]).filter(Number.isFinite);
      const bias = signed.reduce((a, b) => a + b, 0) / Math.max(1, signed.length);
      console.log(`   M2 Hoehe:   Datei - DEM  med ${f1(med(diff))} m · p95 ${f1(p95(diff))} m · max ${f1(mx(diff))} m · Versatz ${f1(bias)} m  (${probe.length} Punkte)`);
    } else {
      console.log('   M2 Hoehe:   uebersprungen (kein Netz)');
    }

    /* M3 — wie weit ist der Wetter-Abfragepunkt weg? ---------------------- */
    const radius = radiusForTerrain(meta.terrain);
    const geo = samples.map((s) => ({ lat: s.lat, lon: s.lon, ele: s.ele }));
    const clusters = clusterSamples(geo, radius, DEFAULT_ELEV_BAND_M);
    const dists = [];
    const eleDiffs = [];
    for (const c of clusters) {
      const rep = clusterRepIndex(c.sampleIndices, geo);
      for (const i of c.sampleIndices) {
        dists.push(haversine(geo[i].lat, geo[i].lon, geo[rep].lat, geo[rep].lon));
        eleDiffs.push(Math.abs(geo[i].ele - geo[rep].ele));
      }
    }
    console.log(`   M3 Wetter:  Radius ${radius / 1000} km · ${clusters.length} Cluster fuer ${samples.length} Samples`);
    console.log(`      Sample -> Abfragepunkt  med ${(med(dists) / 1000).toFixed(2)} km · p95 ${(p95(dists) / 1000).toFixed(2)} km · max ${(mx(dists) / 1000).toFixed(2)} km · Hoehe max ${f1(mx(eleDiffs))} m`);

    /* M1b — derselbe Verlauf mit realistischer Track-Dichte + echtem DEM ---- */
    if (netOk) {
      const dense = [];
      const STEP = 25;                                   // m — 1-Hz-Rad/Wander-Track
      for (let d = 0; d <= meta.totalDistanceM; d += STEP) {
        let i = 1;
        while (i < points.length - 1 && points[i].dist < d) i++;
        const a = points[i - 1], b = points[i];
        const t = (d - a.dist) / Math.max(1e-9, b.dist - a.dist);
        dense.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, ele: null });
      }
      for (const q of dense) q.ele = await demAt(q.lat, q.lon);
      const t2 = await buildTourTrack({ points: dense, waypoints: [] }, 'gpx');
      const chain2 = t2.samples.map((s) => ({ dist: s.dist, ele: s.ele }));
      const dev2 = t2.points.map((pt) => Math.abs(pt.ele - eleOfChain(chain2, pt.dist)));
      let gap2 = 0;
      for (let i = 1; i < t2.samples.length; i++) gap2 = Math.max(gap2, t2.samples[i].dist - t2.samples[i - 1].dist);
      const asc2p = ascentOf(t2.points.map((p) => p.ele));
      const asc2s = ascentOf(t2.samples.map((s) => s.ele));
      console.log(`   M1b echt:   ${t2.meta.pointCount} Punkte (${STEP} m) · ${t2.meta.sampleCount} Samples · Abstand max ${Math.round(gap2)} m`);
      console.log(`      Abweichung Profil med ${f1(med(dev2))} m · p95 ${f1(p95(dev2))} m · max ${f1(mx(dev2))} m · Anstieg ${Math.round(asc2p)} -> ${Math.round(asc2s)} hm (${asc2p > 0 ? Math.round((1 - asc2s / asc2p) * 100) : 0} % fehlen)`);
    }

    /* M4 — Kacheln fuer ein seitliches Relief ------------------------------ */
    const tilesOf = (offKm) => {
      const set = new Set();
      for (let i = 0; i < points.length; i++) {
        const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
        const brg = Math.atan2(b.lon - a.lon, b.lat - a.lat) + Math.PI / 2;
        const dLat = (offKm / 111.32) * Math.cos(brg);
        const dLon = (offKm / (111.32 * Math.cos((points[i].lat * Math.PI) / 180))) * Math.sin(brg);
        set.add(`${Math.floor(lng2x(points[i].lon + dLon, 13))}/${Math.floor(lat2y(points[i].lat + dLat, 13))}`);
      }
      return set;
    };
    const base = tilesOf(0);
    const all = new Set([...base, ...tilesOf(2), ...tilesOf(5)]);
    console.log(`   M4 Relief:  Strecke ${base.size} Kacheln (z13) -> mit zwei seitlichen Profilen (2 km, 5 km) ${all.size}\n`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
