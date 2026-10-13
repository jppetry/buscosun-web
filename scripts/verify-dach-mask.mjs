/**
 * verify-dach-mask.mjs — Phase LM (`audit/laendermaske.md`): the map's country mask shows DE + AT + CH + LI without gaps.
 *
 * A  `public/countries/DACH.geojson` is the generator's output (byte-equal regeneration; MultiPolygon of outer rings only,
 *    every ring closed and counter-clockwise).
 * B  Points: Liechtenstein, the Bodensee, the Rhine-valley seam, the Schaffhausen and Salzburg overlaps, Büsingen and
 *    Helgoland lie INSIDE; Strasbourg, Milan, Prague, Bozen, Mulhouse lie OUTSIDE.
 * C  Superset: every edge midpoint of the four source outlines, nudged 300 m inwards (the generator's tolerance), is
 *    inside the dissolved outline — the mask never cuts a country that the single outlines showed (functional preservation).
 * D  Seam-free: no sample point that lies in two source outlines (overlap) or in none but within 2 km of two countries
 *    (gap) is outside the dissolved outline — the sand slivers of the diagnosis are gone.
 * E  Flag grammar: `?mask=legacy` is the only spelling that selects the old mask; `countryMask.ts` serves the file.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-dach-mask.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDachMask, dachMaskFeature, ringsOf, DACH_MASK_MEMBERS, DACH_MASK_FILE } from './gen-dach-mask.mjs';
import { dachMaskLegacyFrom, DACH_MASK_URL } from '../src/countryMask.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const results = [];
const add = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

const pip = (rings, lng, lat) => { let inside = false; for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside; } return inside; };
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * r[i][1] - r[i][0] * r[j][1]); return a / 2; };
/** Distance (km) from a point to the nearest segment of a ring set. */
const distKm = (rings, lng, lat) => {
  const kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57;
  let best = Infinity;
  for (const r of rings) for (let i = 0; i < r.length - 1; i++) {
    const ax = (r[i][0] - lng) * kx, ay = (r[i][1] - lat) * ky, bx = (r[i + 1][0] - lng) * kx, by = (r[i + 1][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) best = d;
  }
  return best;
};

// A — file = generator output
const committed = readFileSync(join(ROOT, DACH_MASK_FILE), 'utf8');
const feat = JSON.parse(committed);
const src = Object.fromEntries(DACH_MASK_MEMBERS.map((c) => [c, ringsOf(c)]));
const { rings, stats } = buildDachMask(src, { cell: feat.properties.cell, tol: feat.properties.tol });
add('A1 DACH.geojson ist byte-gleich mit der Neuerzeugung (gen-dach-mask.mjs)', JSON.stringify(dachMaskFeature(rings, stats)) === committed, `${stats.rings} Ringe, ${stats.vertices} Punkte, ${stats.filledKm2} km² gefüllt`);
const dach = feat.geometry.coordinates.map((p) => p[0]);
add('A2 MultiPolygon nur aus Außenringen (kein Polygon trägt Löcher)', feat.geometry.type === 'MultiPolygon' && feat.geometry.coordinates.every((p) => p.length === 1));
add('A3 jeder Ring geschlossen, ≥ 4 Punkte, gegen den Uhrzeigersinn', dach.every((r) => r.length >= 4 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] && area(r) > 0));
add('A4 Mitglieder DE, AT, CH, LI und LI.geojson vorhanden', JSON.stringify(feat.properties.members) === JSON.stringify(['DE', 'AT', 'CH', 'LI']) && src.LI.length >= 1 && src.LI[0].length >= 4);

// B — named points
const inside = [['Vaduz', 9.521, 47.141], ['Balzers', 9.502, 47.067], ['Ruggell', 9.531, 47.236], ['Malbun', 9.609, 47.103], ['Bodensee Obersee', 9.55, 47.52], ['Rheintal-Naht', 9.559, 47.40], ['Schaffhausen-Überlappung', 8.872, 47.704], ['Salzburg-Überlappung', 12.781, 47.673], ['Büsingen', 8.69, 47.70], ['Helgoland', 7.89, 54.18], ['Bregenz', 9.747, 47.503], ['Basel', 7.59, 47.56], ['Konstanz', 9.17, 47.66]];
const outside = [['Strasbourg', 7.75, 48.57], ['Milano', 9.19, 45.46], ['Praha', 14.42, 50.08], ['Bozen', 11.35, 46.50], ['Mulhouse', 7.34, 47.75], ['Kopenhagen', 12.57, 55.68], ['Ljubljana', 14.51, 46.06]];
const inFail = inside.filter(([, x, y]) => !pip(dach, x, y)).map(([n]) => n);
const outFail = outside.filter(([, x, y]) => pip(dach, x, y)).map(([n]) => n);
add('B1 Liechtenstein, Bodensee, Nähte, Überlappungen, Enklaven liegen innen', inFail.length === 0, inFail.join(', ') || `${inside.length} Punkte`);
add('B2 Nachbarstädte liegen außen', outFail.length === 0, outFail.join(', ') || `${outside.length} Punkte`);

// C — superset of the source outlines: vertices nudged 150 m towards the ring's interior side
let cTested = 0, cFail = 0; const cSample = [];
for (const [c, rs] of Object.entries(src)) for (const r of rs) {
  const ccw = area(r) > 0;
  for (let i = 0; i < r.length - 1; i++) {
    const [x0, y0] = r[i], [x1, y1] = r[i + 1];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const kx = 111.32 * Math.cos(my * Math.PI / 180), ky = 110.57;
    let nx = -(y1 - y0) * ky, ny = (x1 - x0) * kx; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;   // left normal (km)
    const s = ccw ? 1 : -1;   // interior is on the left of a CCW ring
    // 300 m = the generator's stated deviation (DP 0,002° ≈ 220 m + half a cell); closer than that a cut-off corner of a
    // 0,5-km² pocket (Vennbahn) is tolerance, not a lost area
    const px = mx + s * nx * 0.3 / kx, py = my + s * ny * 0.3 / ky;
    if (!pip(rs, px, py)) continue;   // the nudge landed outside the source ring itself (sharp spike) — not a test point
    cTested++;
    // outside the dissolved outline AND farther than the tolerance from its boundary = a lost area (a cut-off tip of a
    // 0,5-km² pocket within 300 m of the boundary is the stated deviation, not a hole)
    if (!pip(dach, px, py) && distKm(dach, px, py) > 0.3) { cFail++; if (cSample.length < 5) cSample.push(`${c} ${px.toFixed(3)},${py.toFixed(3)}`); }
  }
}
add('C1 Obermenge: jeder Quellpunkt 300 m einwärts (= Generator-Toleranz) liegt in der aufgelösten Fläche', cFail === 0, cFail ? `${cFail}/${cTested}: ${cSample.join(' | ')}` : `${cTested} Punkte`);

// D — the seams of the diagnosis: sample the shared-border zone on a 0.004° grid
let dOver = 0, dOverFail = 0, dGap = 0, dGapFail = 0; const dSample = []; const dGapAt = {};
const near = (rs, x, y) => [[0.02, 0], [-0.02, 0], [0, 0.018], [0, -0.018], [0.014, 0.013], [-0.014, 0.013], [0.014, -0.013], [-0.014, -0.013]].some(([dx, dy]) => pip(rs, x + dx, y + dy));
for (const [x0, y0, x1, y1] of [[9.4, 46.8, 10.6, 47.7], [9.4, 47.2, 13.9, 49.1], [7.4, 47.3, 9.8, 47.9]]) {
  for (let y = y0; y < y1; y += 0.004) for (let x = x0; x < x1; x += 0.004) {
    const d = pip(src.DE, x, y), a = pip(src.AT, x, y), c = pip(src.CH, x, y), l = pip(src.LI, x, y);
    const n = d + a + c + l;
    if (n >= 2) { dOver++; if (!pip(dach, x, y)) { dOverFail++; if (dSample.length < 5) dSample.push(`Ü ${x.toFixed(3)},${y.toFixed(3)}`); } }
    else if (n === 0) {
      const m = near(src.DE, x, y) + near(src.AT, x, y) + near(src.CH, x, y) + near(src.LI, x, y);
      if (m >= 2) { dGap++; if (!pip(dach, x, y)) { dGapFail++; const b = `${(Math.floor(x * 10) / 10).toFixed(1)},${(Math.floor(y * 10) / 10).toFixed(1)}`; dGapAt[b] = (dGapAt[b] ?? 0) + 1; } }
    }
  }
}
add('D1 Überlappungen zweier Umrisse (Even-Odd-Sand) sind innen', dOverFail === 0, `${dOver - dOverFail}/${dOver}` + (dSample.length ? ` — ${dSample.join(' | ')}` : ''));
// A gap that opens towards a non-DACH neighbour is not enclosed and stays open by construction (V-LM-4): the tri-points
// Basel (DE–CH–FR), Nauders/Reschen (AT–CH–IT) and the Bodensee-free DE–AT–CZ corner at Passau. Every remaining gap must
// lie in one of these 0,1°-bins — anywhere else a gap between two DACH countries is a regression.
const TRI_POINT_BINS = new Set(['7.5,47.5', '7.6,47.5', '10.4,46.8', '10.5,46.8', '13.7,48.7', '13.8,48.7', '13.8,48.8']);
const gapBins = {}; for (const [k, v] of Object.entries(dGapAt)) gapBins[k] = v;
const strayBins = Object.keys(gapBins).filter((k) => !TRI_POINT_BINS.has(k));
add('D2 Nahtlücken zwischen zwei Ländern sind innen — Reste nur an den Dreiländerecken mit FR/IT/CZ', dGap > 0 && strayBins.length === 0, `${dGap - dGapFail}/${dGap} innen; offen je 0,1°-Bin: ${Object.entries(gapBins).map(([k, v]) => `${k}:${v}`).join(' ') || 'keine'}` + (strayBins.length ? ` — AUSSERHALB der Ecken: ${strayBins.join(' ')}` : ''));

// E — flag grammar and the URL the client reads
add('E1 ?mask=legacy wählt die alte Maske, nichts anderes', dachMaskLegacyFrom('?mask=legacy') && dachMaskLegacyFrom('?a=1&mask=legacy') && !dachMaskLegacyFrom('') && !dachMaskLegacyFrom('?mask=1') && !dachMaskLegacyFrom('?mask=Legacy') && !dachMaskLegacyFrom('?mask=0'));
add('E2 der Client liest genau die erzeugte Datei', DACH_MASK_URL === '/' + DACH_MASK_FILE.replace(/^public\//, ''));

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} grün`);
process.exit(fails ? 1 : 0);
