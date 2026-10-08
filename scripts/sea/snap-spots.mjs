#!/usr/bin/env node
/**
 * E-SW-31 (b) — pulls the positions of marked spots onto their beach: the nearest point of the BKG DLM250 sea coastline
 * (AX_Meer 44007 edges against land, `dlmCoast.mjs`) whose seaward side faces the beach the spot names. The facing is
 * the hand input (`snap.facing` in `spots-src.json`, with `snap.why`); it only picks WHICH shore, the catalogue normal is
 * still computed from the CWAM mask (`build-spots.mjs`). The start position is kept as `snap.was`, so a second run
 * starts from the same point and gives the same result.
 *
 * Candidate rule: closest point of every sea-coast segment within 4 km whose own seaward normal is within ±60° of the
 * facing; the nearest candidate whose 0.5-km band normal of the DLM coast (`normalFromSegments`) is within ±45° of the
 * facing wins. Position rounded to 4 decimals (≈ 10 m).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/snap-spots.mjs
 *     --dlm=<dir with dlm-44007.json …> [--write]   (default: print only)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDlm, dlmSegments } from './dlmCoast.mjs';
import { normalFromSegments, angleDiff } from './shoreNormal.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));

export const SNAP_SEG_DEG = 45 + 15;
export const SNAP_BAND_DEG = 45;
export const SNAP_RADIUS_KM = 4;

const nearestOnSeg = (s) => {
  const dx = s.q[0] - s.p[0], dy = s.q[1] - s.p[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, -(s.p[0] * dx + s.p[1] * dy) / l2)) : 0;
  return [s.p[0] + t * dx, s.p[1] + t * dy];
};

/** Snapped position for a start point and a facing, or null when no shore of that facing lies within the radius. */
export function snapToBeach(polys, lat, lon, facing) {
  const { segs, kx, ky } = dlmSegments(polys, lat, lon, SNAP_RADIUS_KM);
  const cands = segs
    .filter((s) => s.t === '44007')
    .filter((s) => angleDiff((Math.atan2(s.nx, s.ny) * 180) / Math.PI, facing) <= SNAP_SEG_DEG)
    .map((s) => { const p = nearestOnSeg(s); return { p, d: Math.hypot(p[0], p[1]) }; })
    .filter((c) => c.d <= SNAP_RADIUS_KM)
    .sort((a, b) => a.d - b.d);
  for (const c of cands) {
    const nLat = +(lat + c.p[1] / ky).toFixed(4), nLon = +(lon + c.p[0] / kx).toFixed(4);
    const band = normalFromSegments(dlmSegments(polys, nLat, nLon, 2).segs, 0.5);
    if (band && angleDiff(band.normal, facing) <= SNAP_BAND_DEG) return { lat: nLat, lon: nLon, movedKm: +c.d.toFixed(3), dlmNormal: band.normal, coastKm: band.coastKm };
  }
  return null;
}

/** The hand list's own layout: one spot per line. */
const fmt = (v) => (Array.isArray(v) ? `[ ${v.map(fmt).join(', ')} ]` : v && typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${fmt(x)}`).join(', ')} }` : JSON.stringify(v));
export const formatSrc = (src) => `{\n "about": ${JSON.stringify(src.about)},\n "spots": [\n  ${src.spots.map(fmt).join(',\n  ')}\n ]\n}\n`;

async function main() {
  const file = join(HERE, 'spots-src.json');
  const src = JSON.parse(readFileSync(file, 'utf8'));
  const polys = loadDlm(args.dlm);
  let failed = 0;
  for (const s of src.spots) {
    if (!s.snap) continue;
    const [lat0, lon0] = s.snap.was ?? [s.lat, s.lon];
    const r = snapToBeach(polys, lat0, lon0, s.snap.facing);
    if (!r) { failed++; console.log(`${s.id.padEnd(22)} kein Ufer mit Blick ${s.snap.facing}° in ${SNAP_RADIUS_KM} km`); continue; }
    console.log(`${s.id.padEnd(22)} ${lat0}/${lon0} → ${r.lat}/${r.lon}  ${r.movedKm.toFixed(2)} km  Blick ${s.snap.facing}° · DLM ${r.dlmNormal}° (${s.snap.why})`);
    if (args.write) { s.snap.was = [lat0, lon0]; s.lat = r.lat; s.lon = r.lon; }
  }
  if (args.write && !failed) writeFileSync(file, formatSrc(src));
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
