/**
 * DWD open data, NEW scheme (`/weather/nwp/v1/m/<model>/p/<PARAM>/r/<ISO run>/s/PT<HHH>H<MM>M.grib2`) — the only one that
 * survives 30.11.2026 (QUELLENMATRIX §6). Native triangular grid, raw GRIB2 with CCSDS (no bz2). The glacier job reads
 * `HZEROCL` (freezing level height, m) and, for the radiation comparison, `ASWDIR_S` / `ASWDIFD_S` from it.
 *
 * Reuses the app's GRIB2 decoder (`src/sources/gribDecode.ts`, CCSDS-AEC) — no second decoder.
 */
import { decodeGrib2 } from '../../../src/sources/gribDecode.ts';

export const DWD_NEW = process.env.DWD_NEW_BASE || 'https://opendata.dwd.de/weather/nwp/v1/m';
const UA = 'buscosun-glacier/0.1 (+https://buscosun.com; jppetry94@gmail.com)';
const pad = (n, w) => String(n).padStart(w, '0');

export const isoRun = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}T${pad(d.getUTCHours(), 2)}%3A00`; };
export const stepName = (minutes) => `PT${pad(Math.floor(minutes / 60), 3)}H${pad(minutes % 60, 2)}M.grib2`;
export const fieldUrl = (model, param, runMs, minutes) => `${DWD_NEW}/${model}/p/${param}/r/${isoRun(runMs)}/s/${stepName(minutes)}`;

export const net = { requests: 0, bytes: 0 };

export async function getBytes(url, { tries = 3 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA } });
      if (r.status === 404) return null;
      if (r.ok) { const b = new Uint8Array(await r.arrayBuffer()); net.requests++; net.bytes += b.length; return b; }
      last = new Error(`HTTP ${r.status} ${url}`);
    } catch (e) { last = e; }
    await new Promise((res) => setTimeout(res, 500 * (i + 1)));
  }
  throw last;
}

/** Decoded GRIB2 field, or `null` when the file is not there (yet). */
export async function getField(model, param, runMs, minutes) {
  const b = await getBytes(fieldUrl(model, param, runMs, minutes));
  return b ? decodeGrib2(b) : null;
}

/** Newest run whose LAST wanted step of `probeParam` exists (HEAD). Runs are 3-hourly for ICON-D2 and ICON-EU. */
export async function newestRun(model, probeParam, probeMinutes, nowMs = Date.now(), slotH = 3, back = 8) {
  const slot = slotH * 3_600_000;
  let t = Math.floor(nowMs / slot) * slot;
  for (let i = 0; i < back; i++, t -= slot) {
    const r = await fetch(fieldUrl(model, probeParam, t, probeMinutes), { method: 'HEAD', headers: { 'user-agent': UA } });
    if (r.status === 200) return t;
  }
  return null;
}

/** Cell coordinates in degrees from the time-invariant CLAT / CLON fields (radians in the file, checked). */
export async function cellCoords(model, runMs) {
  const la = await getField(model, 'CLAT', runMs, 0), lo = await getField(model, 'CLON', runMs, 0);
  if (!la || !lo) return null;
  const k = Math.max(...la.values.slice(0, 1000).map(Math.abs)) < 2 ? 180 / Math.PI : 1;
  const lat = new Float32Array(la.values.length), lon = new Float32Array(lo.values.length);
  for (let i = 0; i < lat.length; i++) { lat[i] = la.values[i] * k; lon[i] = lo.values[i] * k; }
  return { lat, lon, n: lat.length };
}

/** Nearest cell for each point by a brute-force pass (≈ 0.5 M cells × ~1 000 points is a few seconds; exact enough at 2 km). */
export function nearestCells(cells, points) {
  const out = new Int32Array(points.length);
  for (let p = 0; p < points.length; p++) {
    const { lat, lon } = points[p];
    const cl = Math.cos((lat * Math.PI) / 180);
    let best = Infinity, bi = -1;
    for (let i = 0; i < cells.n; i++) {
      const dy = cells.lat[i] - lat; if (dy > 0.2 || dy < -0.2) continue;
      const dx = (cells.lon[i] - lon) * cl;
      const d = dy * dy + dx * dx;
      if (d < best) { best = d; bi = i; }
    }
    out[p] = bi;
  }
  return out;
}
