// Scratch measurement: affected places per KONRAD3D cell (core vs edge), real data.
// Usage: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs <this> [xmlFile...]
import { readFileSync } from 'node:fs';
import { parseKonrad3d } from 'file:///C:/dev/buscosun-web/src/radar/konrad3d.ts';
import { pointInEllipse } from 'file:///C:/dev/buscosun-web/src/radar/cellPolygons.ts';

const ROOT = 'C:/dev/buscosun-web/';
const places = JSON.parse(readFileSync(ROOT + 'public/fire/places-dach.json', 'utf8')).places;
const files = process.argv.slice(2);
const KM_LAT = 110.57, KM_LON = 111.32;
const dist = (a, b) => { const c = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180); return Math.hypot((a[0] - b[0]) * KM_LON * c, (a[1] - b[1]) * KM_LAT); };

// Interpolated official track at 1-min resolution (linear between neighbouring official steps).
function track(cell) {
  const st = [{ lead: 0, lon: cell.lon, lat: cell.lat, maj: 0, min: 0, ang: 0 },
    ...cell.forecast.map((f) => ({ lead: f.leadMin, lon: f.lon, lat: f.lat, maj: f.majorKm, min: f.minorKm, ang: f.ellipseAngleDeg ?? 0 }))];
  const out = [];
  for (let i = 1; i < st.length; i++) {
    const a = st[i - 1], b = st[i];
    for (let m = a.lead; m < b.lead || (i === st.length - 1 && m <= b.lead); m++) {
      const t = (m - a.lead) / (b.lead - a.lead);
      out.push({ lead: m, lon: a.lon + (b.lon - a.lon) * t, lat: a.lat + (b.lat - a.lat) * t,
        maj: (a.maj ?? 0) + ((b.maj ?? 0) - (a.maj ?? 0)) * t, min: (a.min ?? 0) + ((b.min ?? 0) - (a.min ?? 0)) * t,
        ang: b.ang });
    }
  }
  return out;
}

const summary = {};
for (const file of files) {
  const run = parseKonrad3d(readFileSync(file, 'utf8'), file.split(/[\\/]/).pop());
  const cells = run.cells.filter((c) => c.forecast.length > 0 && c.forecast.some((f) => f.majorKm > 0));
  console.log(`\n${file.split(/[\\/]/).pop()}: ${run.cells.length} Zellen, ${cells.length} mit Ellipsen`);
  const rs = [], ax60 = [];
  for (const c of cells) {
    const r = c.areaKm2 > 0 ? Math.sqrt(c.areaKm2 / Math.PI) : 3;
    rs.push(r);
    const last = c.forecast[c.forecast.length - 1]; if (last.majorKm) ax60.push([last.majorKm, last.minorKm]);
    const tr = track(c);
    const res = {};
    for (const T of [1500, 5000, 10000, 20000]) {
      let core = 0, edgeU = 0, edgeM = 0, wsum = 0, wn = 0, maxW = 0;
      for (const p of places) {
        if (p[5] < T) continue;
        const pt = [p[1], p[0]];
        if (dist(pt, [c.lon, c.lat]) > 120) continue;
        let isCore = false, hitU = [], hitM = [];
        for (const s of tr) {
          const d = dist(pt, [s.lon, s.lat]);
          if (d <= r) isCore = true;
          if (s.maj > 0) {
            const inE = pointInEllipse(pt, s.lon, s.lat, s.maj, s.min, s.ang);
            if (inE || d <= r) hitU.push(s.lead);
            // Minkowski approx: ellipse with semi-axes +r
            if (pointInEllipse(pt, s.lon, s.lat, s.maj + 2 * r, s.min + 2 * r, s.ang)) hitM.push(s.lead);
          }
        }
        if (isCore) core++;
        else if (hitU.length) edgeU++;
        if (!isCore && hitM.length) edgeM++;
        const h = hitU.length ? hitU : null;
        if (h) { const w = Math.max(...h) - Math.min(...h); wsum += w; wn++; maxW = Math.max(maxW, w); }
      }
      res[T] = `Kern ${core} · Rand ${edgeU} (Minkowski ${edgeM}) · Fenster Ø ${wn ? Math.round(wsum / wn) : '-'} max ${maxW} min`;
    }
    console.log(`  Zelle ${c.id} sev ${(c.severityDecimal ?? c.severity ?? 0).toFixed(2)} r ${r.toFixed(1)} km, v ${c.speedKmh?.toFixed(0)} km/h, +60 Ellipse ${last.majorKm?.toFixed(1)}×${last.minorKm?.toFixed(1)}`);
    for (const T of Object.keys(res)) console.log(`    ≥${T}: ${res[T]}`);
  }
  rs.sort((a, b) => a - b);
  if (rs.length) console.log(`  Zellradius p10/p50/p90: ${rs[Math.floor(rs.length * .1)].toFixed(1)} / ${rs[Math.floor(rs.length * .5)].toFixed(1)} / ${rs[Math.floor(rs.length * .9)].toFixed(1)} km`);
}
