/**
 * **VB0 — welche Form soll die vorläufige Brandfläche haben?** (Gate GVB1, Plan §VB0)
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
 *        scripts/fire/geometry-eval.mjs [--years 2020-2026] [--limit N] [--cap 120000]
 *
 * Die Frage ist NICHT „kann man aus Detektionen eine Fläche zeichnen" (kann man, beliebig
 * viele), sondern: **schlägt irgendeine dieser Formen das Detektionsraster, an der echten
 * Kartierung gemessen?** Deshalb ist das hier eine Messung mit vorab festgelegtem
 * Abbruchkriterium und keine Vorführung.
 *
 * ── Datenlage: alles liegt lokal ────────────────────────────────────────────────────────
 * Kein Netz, kein FIRMS-Schlüssel. Der Cache aus AF4 (`.cache/firms-archive/`) enthält die
 * EFFIS-Kartierungen 2020–2025 als Jahreslayer, 2026 als Saison-Korb und alle VIIRS-SP-CSVs.
 *
 * ── Paarbildung: identisch zu AF4 ───────────────────────────────────────────────────────
 * Zeitfenster, Ortsfenster, `type ≠ 0`-Filter und die Modulkette (parseFirmsCsv → dedupe →
 * buildFireClusters → buildFireZones → reconcileZones → buildFireRegistry → featuresOf) sind
 * 1:1 die aus `pairs-from-archive.mjs`. Beleg statt Behauptung: der Lauf meldet die Paarzahl
 * je Jahr, sie muss die AF4-Berichte reproduzieren (2020–2025: 531 · 2026: 87). Weicht sie ab,
 * ist die Auswertung wertlos — dann misst man auf Paaren, die im Betrieb nie entstehen.
 *
 * ── Die Kandidatenregeln ────────────────────────────────────────────────────────────────
 *   R0   Detektionsraster unverändert — die Nullhypothese
 *   R1   Raster von außen erodiert, bis die Fläche der AF4-Schätzung entspricht
 *   R2   FRP-gewichteter Kern: Zellen nach Strahlungsdichte absteigend bis zur Zielfläche
 *   R3   Kreis am FRP-Schwerpunkt mit der Zielfläche (anspruchsloseste Variante)
 *   +b   Zusatzregel R0b für R1–R3: Zielfläche < mittlere Einzelpixelfläche ⇒ NICHT schrumpfen
 *
 * Ohne AF4-Schätzung (außerhalb des Kalibrierbereichs, ortsfest, keine Detektion) gibt es für
 * R1–R3 keine Zielfläche. Gemessen wird deshalb zweierlei: die Regel dort, wo sie **anwendbar**
 * ist, und die Regel **mit Rückfall auf R0** — nur letzteres ist die Zahl, die das Produkt
 * erreichen würde.
 *
 * ── Wie verglichen wird ─────────────────────────────────────────────────────────────────
 * Beide Formen werden auf dasselbe metrische Gitter gerastert (lokale äquidistante Projektion,
 * dieselben Konstanten wie `fireZones.ts`); daraus IoU, Flächenverhältnis und Schwerpunkt-
 * versatz. Kein Polygon-Boolean, keine Dependency — die Zellenmenge IST der Vergleich.
 *
 * Schreibt `data/fire/vb/geometry-eval.report.json` (Kennzahlen) und `.pairs.jsonl` (je Paar).
 * Trainingsnahe Daten liegen wie bei AF4 in `data/`, nicht in `public/` — der Client lädt sie nie.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { parseFirmsCsv, dedupe, footprintRing } from '../../src/fire/sources/firmsHotspots.ts';
import { parseBurntFeature } from '../../src/fire/fireCorroboration.ts';
import { assertDachAxis } from '../../src/fire/sources/wfsAxis.ts';
import { buildFireClusters } from '../../src/fire/fireClusters.ts';
import { buildFireZones, zoneAt } from '../../src/fire/fireZones.ts';
import { reconcileZones } from '../../src/fire/footprint/reconcile.ts';
import { buildFireRegistry } from '../../src/fire/footprint/fireRegistry.ts';
import { featuresOf } from '../../src/fire/activity/features.ts';
import { estimateArea } from '../../src/fire/activity/estimate.ts';

// ---------------------------------------------------------------------------
// Argumente
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const range = (s) => { const [a, b] = s.split('-').map(Number); return b == null ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i); };
const YEARS = range(opt('years', '2020-2026'));
const LIMIT = Number(opt('limit', '0')) || 0;         // 0 = alle Kartierungen je Jahr
const CAP_CELLS = Number(opt('cap', '120000'));       // Gitterdeckel je Paar
const MIN_CELL_M = Number(opt('min-cell', '5'));      // feiner als 5 m ist Selbstbetrug
const CACHE = opt('cache', '.cache/firms-archive');
const OUT = opt('out', 'data/fire/vb/geometry-eval');
const MODEL_PATH = opt('model', 'public/fire/af/area-estimate-v1.json');

const D = 86_400_000;
const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON = 111_320;

// ---------------------------------------------------------------------------
// Cache lesen — EFFIS je Jahr, FIRMS je Jahr
// ---------------------------------------------------------------------------

/** Wortgleich aus `pairs-from-archive.mjs`: FIRMS-SP führt `type` (1 Vulkan, 2 andere ortsfeste
 *  Quelle, 3 offshore). Nur `type = 0` ist ein vermuteter Vegetationsbrand. */
function dropNonFireTypes(csv) {
  const lines = csv.split(/\r?\n/); if (lines.length < 2) return csv;
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const iType = header.indexOf('type'); if (iType < 0) return csv;
  const keep = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]; if (!l.trim()) continue;
    const v = l.split(','); if ((v[iType] ?? '0').trim() === '0') keep.push(l);
  }
  return keep.join('\n');
}

function effisFileFor(year) {
  const plain = join(CACHE, `effis-${year}.geojson`);
  if (existsSync(plain)) return plain;
  // Laufendes Jahr: Saison-Korb mit Abrufdatum im Namen — den jüngsten nehmen.
  const seasons = readdirSync(CACHE).filter((f) => f.startsWith(`effis-season-${year}`) && f.endsWith('.geojson')).sort();
  return seasons.length ? join(CACHE, seasons[seasons.length - 1]) : null;
}

function loadEffisYear(year) {
  const file = effisFileFor(year);
  if (!file) return { polys: [], file: null };
  const fc = JSON.parse(readFileSync(file, 'utf8'));
  const feats = Array.isArray(fc?.features) ? fc.features : [];
  assertDachAxis(feats, `EFFIS ${year}`);
  const from = Date.UTC(year, 0, 1); const to = Date.UTC(year + 1, 0, 1);
  const polys = [];
  for (const f of feats) {
    const p = parseBurntFeature(f);
    if (!p || p.firedateMs == null || p.areaHa == null) continue;
    if (p.firedateMs < from || p.firedateMs >= to) continue;
    polys.push(p);
  }
  return { polys, file };
}

function loadFirmsYear(year) {
  const re = new RegExp(`^VIIRS_(SNPP|NOAA20)_SP-${year}-\\d{2}-\\d{2}\\.csv$`);
  const files = readdirSync(CACHE).filter((f) => re.test(f)).sort();
  const all = [];
  for (const f of files) {
    const text = readFileSync(join(CACHE, f), 'utf8');
    if (!/^\s*latitude/i.test(text)) continue;
    const src = f.startsWith('VIIRS_SNPP_SP') ? 'VIIRS_SNPP_SP' : 'VIIRS_NOAA20_SP';
    all.push(...parseFirmsCsv(dropNonFireTypes(text), src).rows);
  }
  const rows = dedupe(all);
  const byDay = new Map();
  for (const r of rows) { const k = Math.floor(r.acqMs / D); const l = byDay.get(k); if (l) l.push(r); else byDay.set(k, [r]); }
  return { rows, byDay, files: files.length };
}

// ---------------------------------------------------------------------------
// Paar: Kartierung + der Registry-Eintrag, den der Client daraus bauen würde
// ---------------------------------------------------------------------------

/** Zeit- und Ortsfenster exakt wie AF4 (`pairFor`). */
function pairFor(P, byDay, counters) {
  const start = P.firedateMs - 3 * D;
  const endEvent = P.finaldateMs != null && P.finaldateMs > P.firedateMs ? P.finaldateMs : P.firedateMs;
  const end = endEvent + 7 * D;
  const dLat = 3000 / 111_320;
  const dLon = 3000 / (111_320 * Math.cos((P.bbox[1] + P.bbox[3]) / 2 * Math.PI / 180));
  const [w, s, e, n] = [P.bbox[0] - dLon, P.bbox[1] - dLat, P.bbox[2] + dLon, P.bbox[3] + dLat];
  const rows = [];
  for (let k = Math.floor(start / D); k <= Math.floor(end / D); k++) {
    const l = byDay.get(k); if (!l) continue;
    for (const r of l) if (r.acqMs >= start && r.acqMs <= end && r.lon >= w && r.lon <= e && r.lat >= s && r.lat <= n) rows.push(r);
  }
  if (rows.length === 0) { counters.noDetection++; return null; }
  const clusters = buildFireClusters(rows);
  const zones = buildFireZones(rows);
  const reconciled = reconcileZones(zones, [P]);
  const records = buildFireRegistry({
    clusters, zones, reconciled, polys: [P],
    effisWindow: { fromMs: P.firedateMs - 14 * D, toMs: end + D }, emsActs: [], nowMs: end,
  });
  const rec = records.find((r) => r.sources.cluster && r.sources.effis && r.sources.effis.id === P.id);
  if (!rec) { counters.noMatch++; return null; }
  // Nur die Detektionen DIESES Eintrags — die Nachbarschaft kann weitere Cluster tragen.
  const mine = rows.filter((r) => zoneAt(r.lon, r.lat, rec.sources.zones) != null);
  return { rec, rows: mine, nowMs: end };
}

// ---------------------------------------------------------------------------
// Gitter — lokale äquidistante Projektion, dieselben Konstanten wie fireZones.ts
// ---------------------------------------------------------------------------

function makeGrid(bboxes) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const b of bboxes) { w = Math.min(w, b[0]); s = Math.min(s, b[1]); e = Math.max(e, b[2]); n = Math.max(n, b[3]); }
  const lat0 = (s + n) / 2;
  const kLon = M_PER_DEG_LON * Math.cos((lat0 * Math.PI) / 180);
  const margin = 200; // m Luft, damit Randzellen nicht abgeschnitten werden
  const W = (e - w) * kLon + 2 * margin;
  const H = (n - s) * M_PER_DEG_LAT + 2 * margin;
  const cell = Math.max(MIN_CELL_M, Math.sqrt((W * H) / CAP_CELLS));
  const nx = Math.max(1, Math.ceil(W / cell));
  const ny = Math.max(1, Math.ceil(H / cell));
  const lon0 = w - margin / kLon;
  const latB = s - margin / M_PER_DEG_LAT;
  return {
    nx, ny, cell, cellAreaM2: cell * cell, kLon, lon0, latB,
    gx: (lon) => ((lon - lon0) * kLon) / cell,
    gy: (lat) => ((lat - latB) * M_PER_DEG_LAT) / cell,
  };
}

/** Even-odd-Scanline über Zellmittelpunkte. Löcher fallen durch die Parität heraus. */
function rasterizePolys(polys, g) {
  const mask = new Uint8Array(g.nx * g.ny);
  const ex0 = []; const ey0 = []; const ex1 = []; const ey1 = [];
  for (const poly of polys) {
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const y0 = g.gy(ring[j][1]); const y1 = g.gy(ring[i][1]);
        if (y0 === y1) continue;
        ex0.push(g.gx(ring[j][0])); ey0.push(y0); ex1.push(g.gx(ring[i][0])); ey1.push(y1);
      }
    }
  }
  const xs = [];
  for (let j = 0; j < g.ny; j++) {
    const yc = j + 0.5; xs.length = 0;
    for (let k = 0; k < ey0.length; k++) {
      const y0 = ey0[k]; const y1 = ey1[k];
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(ex0[k] + ((yc - y0) * (ex1[k] - ex0[k])) / (y1 - y0));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5));
      const b = Math.min(g.nx - 1, Math.floor(xs[k + 1] - 0.5));
      for (let i = a; i <= b; i++) mask[j * g.nx + i] = 1;
    }
  }
  return mask;
}

/** Pixelrechtecke einer Detektionsmenge — dieselben Kanten, die die Karte zeichnet. */
function rectsOf(rows) {
  const out = [];
  for (const r of rows) {
    const ring = footprintRing(r);
    if (!ring) continue;
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
    out.push({ w, s, e, n, frp: Number.isFinite(r.frp) ? r.frp : 0 });
  }
  return out;
}

function rasterizeRects(rects, g) {
  const mask = new Uint8Array(g.nx * g.ny);
  for (const r of rects) {
    const i0 = Math.max(0, Math.ceil(g.gx(r.w) - 0.5)); const i1 = Math.min(g.nx - 1, Math.floor(g.gx(r.e) - 0.5));
    const j0 = Math.max(0, Math.ceil(g.gy(r.s) - 0.5)); const j1 = Math.min(g.ny - 1, Math.floor(g.gy(r.n) - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) mask[j * g.nx + i] = 1;
  }
  return mask;
}

/** FRP-Dichte je Zelle (MW/m²), aufsummiert über alle überdeckenden Pixel. */
function frpDensity(rects, g) {
  const wgt = new Float64Array(g.nx * g.ny);
  for (const r of rects) {
    const areaM2 = Math.max(1, (r.e - r.w) * g.kLon * (r.n - r.s) * M_PER_DEG_LAT);
    const dens = r.frp / areaM2;
    const i0 = Math.max(0, Math.ceil(g.gx(r.w) - 0.5)); const i1 = Math.min(g.nx - 1, Math.floor(g.gx(r.e) - 0.5));
    const j0 = Math.max(0, Math.ceil(g.gy(r.s) - 0.5)); const j1 = Math.min(g.ny - 1, Math.floor(g.gy(r.n) - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) wgt[j * g.nx + i] += dens;
  }
  return wgt;
}

/** Abstand jeder Maskenzelle zum Rand (Chamfer 3-4, Ergebnis in Zellen). */
function distanceToEdge(mask, g) {
  const { nx, ny } = g; const INF = 1 << 28;
  const d = new Int32Array(nx * ny);
  for (let k = 0; k < d.length; k++) d[k] = mask[k] ? INF : 0;
  const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : d[j * nx + i]);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (!mask[k]) continue;
    let v = d[k];
    v = Math.min(v, at(i - 1, j) + 3, at(i, j - 1) + 3, at(i - 1, j - 1) + 4, at(i + 1, j - 1) + 4);
    d[k] = v;
  }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; if (!mask[k]) continue;
    let v = d[k];
    v = Math.min(v, at(i + 1, j) + 3, at(i, j + 1) + 3, at(i + 1, j + 1) + 4, at(i - 1, j + 1) + 4);
    d[k] = v;
  }
  return d;
}

/** Die `keep` stärksten Zellen einer Maske nach `score` (absteigend, Index als Gleichstandsregel). */
function takeTop(mask, score, keep) {
  const idx = [];
  for (let k = 0; k < mask.length; k++) if (mask[k]) idx.push(k);
  if (keep >= idx.length) return { mask, count: idx.length };
  idx.sort((a, b) => (score[b] - score[a]) || (a - b));
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < keep; i++) out[idx[i]] = 1;
  return { mask: out, count: keep };
}

function diskMask(cx, cy, rCells, g) {
  const out = new Uint8Array(g.nx * g.ny);
  const i0 = Math.max(0, Math.floor(cx - rCells - 1)); const i1 = Math.min(g.nx - 1, Math.ceil(cx + rCells + 1));
  const j0 = Math.max(0, Math.floor(cy - rCells - 1)); const j1 = Math.min(g.ny - 1, Math.ceil(cy + rCells + 1));
  const r2 = rCells * rCells;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const dx = i + 0.5 - cx; const dy = j + 0.5 - cy;
    if (dx * dx + dy * dy <= r2) out[j * g.nx + i] = 1;
  }
  return out;
}

function metrics(a, b, g) {
  let inter = 0; let ca = 0; let cb = 0; let sx = 0; let sy = 0; let sxB = 0; let syB = 0;
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const k = j * g.nx + i;
    if (a[k]) { ca++; sx += i; sy += j; }
    if (b[k]) { cb++; sxB += i; syB += j; }
    if (a[k] && b[k]) inter++;
  }
  const union = ca + cb - inter;
  const offset = ca > 0 && cb > 0
    ? Math.hypot(sx / ca - sxB / cb, sy / ca - syB / cb) * g.cell
    : null;
  return {
    iou: union > 0 ? inter / union : 0,
    areaHa: (ca * g.cellAreaM2) / 10_000,
    refHa: (cb * g.cellAreaM2) / 10_000,
    ratio: cb > 0 ? ca / cb : null,
    offsetM: offset == null ? null : Math.round(offset),
  };
}

// ---------------------------------------------------------------------------
// Kennzahlen
// ---------------------------------------------------------------------------
const median = (xs) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const quantile = (xs, q) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))]; };
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);

const SIZE_CLASSES = [['0–2 ha', 0, 2], ['2–20 ha', 2, 20], ['20–200 ha', 20, 200], ['> 200 ha', 200, Infinity]];
const classOf = (ha) => (SIZE_CLASSES.find(([, lo, hi]) => ha >= lo && ha < hi) ?? SIZE_CLASSES[0])[0];

const RULES = ['R0', 'R1', 'R1b', 'R2', 'R2b', 'R3', 'R3b'];

function summarize(rows, pick) {
  const out = {};
  for (const rule of RULES) {
    const sel = rows.map((r) => r.rules[rule]).filter((m) => m && pick(m));
    out[rule] = {
      n: sel.length,
      iouMedian: r3(median(sel.map((m) => m.iou))),
      iouP25: r3(quantile(sel.map((m) => m.iou), 0.25)),
      iouP75: r3(quantile(sel.map((m) => m.iou), 0.75)),
      zeroShare: sel.length ? r3(sel.filter((m) => m.iou === 0).length / sel.length) : null,
      ratioMedian: r3(median(sel.map((m) => m.ratio).filter((v) => v != null))),
      offsetMedian: median(sel.map((m) => m.offsetM).filter((v) => v != null)),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------
function main() {
  if (!existsSync(CACHE)) { console.error(`Cache fehlt: ${CACHE}`); process.exit(2); }
  const model = JSON.parse(readFileSync(MODEL_PATH, 'utf8'));

  const perPair = [];
  const report = { years: {}, model: { version: model.modelVersion, pairs: model.pairsEligible }, cap: CAP_CELLS, minCellM: MIN_CELL_M, limit: LIMIT || null };

  for (const year of YEARS) {
    const counters = { polygons: 0, noDetection: 0, noMatch: 0, pairs: 0, noEstimate: 0, subPixel: 0 };
    const { polys, file } = loadEffisYear(year);
    if (!file) { console.log(`${year}: keine EFFIS-Datei im Cache — übersprungen`); continue; }
    process.stdout.write(`${year}: ${polys.length} Kartierungen · FIRMS … `);
    const { byDay, files } = loadFirmsYear(year);
    process.stdout.write(`${files} CSV · auswerten … `);
    counters.polygons = polys.length;

    const list = LIMIT ? polys.slice(0, LIMIT) : polys;
    for (const P of list) {
      const pair = pairFor(P, byDay, counters);
      if (!pair) continue;
      counters.pairs++;
      const { rec, rows, nowMs } = pair;

      const rects = rectsOf(rows);
      if (rects.length === 0) continue;
      const g = makeGrid([rec.sources.cluster.bbox, P.bbox]);
      const ref = rasterizePolys(P.polys, g);
      const r0 = rasterizeRects(rects, g);
      const rasterHa = (r0.reduce((s, v) => s + v, 0) * g.cellAreaM2) / 10_000;

      const est = estimateArea(featuresOf(rec, nowMs), model);
      const targetHa = est.estimate?.ha ?? null;
      if (targetHa == null) counters.noEstimate++;
      const meanPixelHa = rec.sources.zones.length
        ? rec.sources.zones.reduce((s, z) => s + z.meanPixelHa, 0) / rec.sources.zones.length
        : null;
      const subPixel = targetHa != null && meanPixelHa != null && targetHa < meanPixelHa;
      if (subPixel) counters.subPixel++;

      const rules = { R0: metrics(r0, ref, g) };
      if (targetHa != null && targetHa < rasterHa) {
        const keep = Math.max(1, Math.round((targetHa * 10_000) / g.cellAreaM2));
        const dist = distanceToEdge(r0, g);
        rules.R1 = metrics(takeTop(r0, dist, keep).mask, ref, g);
        const dens = frpDensity(rects, g);
        // Gleichstand bei der Dichte (überall dasselbe Pixel) über den Randabstand lösen —
        // sonst entschiede die Zeilenreihenfolge des Gitters.
        const score = new Float64Array(dens.length);
        for (let k = 0; k < score.length; k++) score[k] = dens[k] * 1e6 + dist[k] * 1e-6;
        rules.R2 = metrics(takeTop(r0, score, keep).mask, ref, g);
        let sw = 0; let cx = 0; let cy = 0;
        for (const r of rects) { const w = r.frp > 0 ? r.frp : 1e-6; sw += w; cx += w * g.gx((r.w + r.e) / 2); cy += w * g.gy((r.s + r.n) / 2); }
        const rCells = Math.sqrt((targetHa * 10_000) / Math.PI) / g.cell;
        rules.R3 = metrics(diskMask(cx / sw, cy / sw, rCells, g), ref, g);
      }
      // Zusatzregel R0b: unter einer Pixelfläche wird nicht geschrumpft.
      for (const r of ['R1', 'R2', 'R3']) rules[`${r}b`] = subPixel || !rules[r] ? rules.R0 : rules[r];
      // Rückfall auf R0, wo die Regel nicht anwendbar ist (Produktsicht).
      for (const r of ['R1', 'R2', 'R3']) if (!rules[r]) rules[r] = null;

      perPair.push({
        year, effisId: P.id, effisHa: P.areaHa, sizeClass: classOf(P.areaHa),
        rasterHa: r3(rasterHa), estimateHa: targetHa == null ? null : r3(targetHa),
        meanPixelHa: r3(meanPixelHa), subPixel, detections: rec.hotspots, overpasses: rec.overpasses,
        cell: r3(g.cell), rules,
      });
    }
    console.log(`${counters.pairs} Paare (ohne Detektion ${counters.noDetection}, ohne Zuordnung ${counters.noMatch}; ohne Schätzung ${counters.noEstimate}, Sub-Pixel ${counters.subPixel})`);
    report.years[year] = counters;
  }

  // --- Auswertung ----------------------------------------------------------
  // Zwei Sichten, absichtlich getrennt:
  //   R1/R2/R3   nur die Paare, auf die die Regel überhaupt anwendbar ist (Schätzung vorhanden
  //              UND Zielfläche kleiner als das Raster) — die Güte der Regel als solcher.
  //   R1b/R2b/R3b  was das Produkt zeigen würde: dieselbe Regel plus Sonderregel R0b
  //              (Sub-Pixel ⇒ nicht schrumpfen) plus Rückfall auf R0, wo sie nicht greift.
  const applied = summarize(perPair, () => true);
  report.overall = { pairs: perPair.length, rules: applied };
  report.bySizeClass = {};
  for (const [name] of SIZE_CLASSES) {
    const sel = perPair.filter((p) => p.sizeClass === name);
    if (sel.length) report.bySizeClass[name] = { n: sel.length, ...summarize(sel, () => true) };
  }
  report.subPixelShare = perPair.length ? r3(perPair.filter((p) => p.subPixel).length / perPair.length) : null;
  report.noEstimateShare = perPair.length ? r3(perPair.filter((p) => p.estimateHa == null).length / perPair.length) : null;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(`${OUT}.report.json`, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(`${OUT}.pairs.jsonl`, perPair.map((p) => JSON.stringify(p)).join('\n') + (perPair.length ? '\n' : ''));

  // --- Konsolenbild --------------------------------------------------------
  console.log(`\nPaare gesamt: ${perPair.length} · ohne Schätzung ${report.noEstimateShare} · Sub-Pixel ${report.subPixelShare}`);
  const fmt = (v) => (v == null ? '   —  ' : String(v).padStart(6));
  const LABEL = {
    R0: 'R0  Raster (Nullhypothese)',
    R1: 'R1  Erosion, nur wo anwendbar',
    R1b: 'R1b Erosion, Produktsicht',
    R2: 'R2  FRP-Kern, nur wo anwendbar',
    R2b: 'R2b FRP-Kern, Produktsicht',
    R3: 'R3  Kreis, nur wo anwendbar',
    R3b: 'R3b Kreis, Produktsicht',
  };
  console.log('\nRegel                              n   IoU-Med    p25    p75  IoU=0  Fläche/EFFIS  Versatz m');
  for (const rule of RULES) {
    const m = applied[rule];
    console.log(`${LABEL[rule].padEnd(32)} ${String(m.n).padStart(4)}  ${fmt(m.iouMedian)} ${fmt(m.iouP25)} ${fmt(m.iouP75)} ${fmt(m.zeroShare)}  ${fmt(m.ratioMedian)}      ${fmt(m.offsetMedian)}`);
  }
  // Verglichen wird die PRODUKTSICHT — nur sie ist das, was Nutzer sähen.
  const best = ['R1b', 'R2b', 'R3b'].map((r) => [r, applied[r].iouMedian ?? 0]).sort((a, b) => b[1] - a[1])[0];
  const base = applied.R0.iouMedian ?? 0;
  console.log(`\nAbbruchkriterium: beste Regel ${best[0]} = ${best[1]} gegen R0 = ${base} ⇒ ${best[1] > base ? 'BAUEN' : 'NICHT BAUEN'}`);
  console.log(`geschrieben: ${OUT}.report.json · ${OUT}.pairs.jsonl`);
}

main();
