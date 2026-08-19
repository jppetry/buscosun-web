/**
 * **Überflüge** — die Zwischenstufe zwischen Einzeldetektion und Zeitreihe
 * (Phase AF1, Gate GAF1, `audit/aktivfeuer.md` §3 E / §5).
 *
 * ── Warum es diese Stufe braucht ─────────────────────────────────────────────
 * Alle Zeitreihenmaße (FRP-Verlauf, FRE, Tendenz, Ausbreitung) rechnen auf
 * Überflügen, nicht auf Pixeln — sonst wiegt ein Überflug mit fünf Pixeln
 * fünfmal so viel wie einer mit einem (Konzept §3). Ein Überflug ist die Menge
 * der Detektionen **eines Satelliten** innerhalb einer Zeitlücke von höchstens
 * `PASS_GAP_MS` (10 min).
 *
 * ── Warum 10 min je Satellit und nicht die Minute ────────────────────────────
 * Bis AF1 zählten `fireEvents.ts` und `fireClusters.ts` 1-Minuten-Slots ohne
 * Satelliten-Trennung. Praktisch fast gleich (SNPP/NOAA-20/NOAA-21 überfliegen
 * dieselbe Stelle ~50 min versetzt, `dedupe`-Kommentar in `firmsHotspots.ts`),
 * aber ein Überflug, dessen Pixel über eine Minutengrenze fallen, zählte
 * doppelt. Die Regel steht jetzt an **einer** Stelle — beide Module importieren
 * sie (V-AF-2). Die Ortsfest-Einstufung (F2) hängt nicht daran.
 *
 * ── Was ein Überflug mitbringt ───────────────────────────────────────────────
 * Zeit (erste/letzte Detektion), Satellit, Tag/Nacht, Pixel, ΣFRP und maxFRP,
 * FRP-gewichteter Schwerpunkt, mittlere Pixelbreite (`scan`, Off-Nadir-Maß) und
 * die Pixelgrundfläche in ha (Σ scan×track) — die Größenordnung, gegen die man
 * jede Fläche liest. Detektionen **ohne** `frp` zählen für Geometrie und Pixel,
 * nicht für die FRP-Aggregate (Konzept §10).
 *
 * Pur, DOM-frei, ohne `Date.now()` (D-12) — `npm run verify:fire-activity`.
 */

import type { FirmsRow } from '../sources/firmsHotspots';

/** Größte Zeitlücke innerhalb EINES Überflugs desselben Satelliten. */
export const PASS_GAP_MS = 10 * 60_000;

export interface FirePass {
  /** `${satellite}@${fromMs}` — stabil bei gleicher Eingabe. */
  key: string;
  satellite: string;
  /** Erste / letzte Detektion des Überflugs (ms UTC). */
  fromMs: number;
  toMs: number;
  /** Zeitstempel für Sortierung und Anzeige (= `fromMs`). */
  atMs: number;
  /** `true` Tag, `false` Nacht, `null` gemischt (kommt bei echten Überflügen nicht vor). */
  day: boolean | null;
  pixels: number;
  /** Pixel mit FRP-Angabe — nur sie tragen zu `sumFrp`/`maxFrp` bei. */
  frpPixels: number;
  /** ΣFRP in MW (zwei Nachkommastellen). Leistung, NIE Fläche. */
  sumFrp: number;
  maxFrp: number;
  /** FRP-gewichteter Schwerpunkt; ohne FRP ungewichtet. */
  lat: number;
  lon: number;
  /** Mittlere Pixelbreite quer zur Bahn in km — wächst zum Schwadrand hin. */
  meanScanKm: number | null;
  /** Σ Pixelgrundfläche (scan × track) in ha — Abdeckung, keine Brandfläche. */
  pixelAreaHa: number | null;
  /** [west, süd, ost, nord] der Pixelmitten — AF2: Randwachstum gegen die vorigen Überflüge. */
  bbox: [number, number, number, number];
}

/** Roh-Akkumulator — bleibt intern, damit Merge exakt bleibt. */
interface Acc {
  satellite: string; fromMs: number; toMs: number;
  dayCount: number; nightCount: number;
  pixels: number; frpPixels: number; sumFrp: number; maxFrp: number;
  wLat: number; wLon: number; w: number;       // FRP-gewichtet
  uLat: number; uLon: number;                  // ungewichtet (Rückfall)
  scanSum: number; scanN: number;
  areaHa: number; areaN: number;
  bw: number; bs: number; be: number; bn: number;   // Bbox der Pixelmitten
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function newAcc(satellite: string, ms: number): Acc {
  return {
    satellite, fromMs: ms, toMs: ms, dayCount: 0, nightCount: 0,
    pixels: 0, frpPixels: 0, sumFrp: 0, maxFrp: 0,
    wLat: 0, wLon: 0, w: 0, uLat: 0, uLon: 0, scanSum: 0, scanN: 0, areaHa: 0, areaN: 0,
    bw: Infinity, bs: Infinity, be: -Infinity, bn: -Infinity,
  };
}

function addRow(a: Acc, r: FirmsRow): void {
  a.fromMs = Math.min(a.fromMs, r.acqMs); a.toMs = Math.max(a.toMs, r.acqMs);
  if (r.day) a.dayCount++; else a.nightCount++;
  a.pixels++;
  a.uLat += r.lat; a.uLon += r.lon;
  if (r.lon < a.bw) a.bw = r.lon; if (r.lon > a.be) a.be = r.lon;
  if (r.lat < a.bs) a.bs = r.lat; if (r.lat > a.bn) a.bn = r.lat;
  if (r.frp != null && r.frp > 0) {
    a.frpPixels++; a.sumFrp += r.frp; if (r.frp > a.maxFrp) a.maxFrp = r.frp;
    a.wLat += r.lat * r.frp; a.wLon += r.lon * r.frp; a.w += r.frp;
  } else if (r.frp === 0) {
    // FRP 0 ist eine Angabe (kein Beitrag), keine fehlende — zählt als FRP-Pixel.
    a.frpPixels++;
  }
  if (r.scanKm != null) { a.scanSum += r.scanKm; a.scanN++; }
  if (r.scanKm != null && r.trackKm != null) { a.areaHa += r.scanKm * r.trackKm * 100; a.areaN++; }
}

function finish(a: Acc): FirePass {
  const weighted = a.w > 0;
  return {
    key: `${a.satellite}@${a.fromMs}`,
    satellite: a.satellite,
    fromMs: a.fromMs, toMs: a.toMs, atMs: a.fromMs,
    day: a.dayCount > 0 && a.nightCount > 0 ? null : a.dayCount > 0,
    pixels: a.pixels,
    frpPixels: a.frpPixels,
    sumFrp: round2(a.sumFrp),
    maxFrp: a.maxFrp,
    lat: weighted ? a.wLat / a.w : a.uLat / a.pixels,
    lon: weighted ? a.wLon / a.w : a.uLon / a.pixels,
    meanScanKm: a.scanN > 0 ? Math.round((a.scanSum / a.scanN) * 100) / 100 : null,
    pixelAreaHa: a.areaN > 0 ? Math.round(a.areaHa * 10) / 10 : null,
    bbox: [a.bw, a.bs, a.be, a.bn],
  };
}

/**
 * Detektionen → Überflüge, aufsteigend nach Zeit (bei gleicher Zeit nach
 * Satellit). Rein und reihenfolgeunabhängig: gleiche Menge ⇒ gleiche Liste.
 */
export function groupPasses(rows: readonly FirmsRow[]): FirePass[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) =>
    (a.satellite || '').localeCompare(b.satellite || '') || a.acqMs - b.acqMs
    || a.lat - b.lat || a.lon - b.lon);
  const out: FirePass[] = [];
  let cur: Acc | null = null;
  for (const r of sorted) {
    const sat = r.satellite || '';
    if (!cur || cur.satellite !== sat || r.acqMs - cur.toMs > PASS_GAP_MS) {
      if (cur) out.push(finish(cur));
      cur = newAcc(sat, r.acqMs);
    }
    addRow(cur, r);
  }
  if (cur) out.push(finish(cur));
  return sortPasses(out);
}

/** Aufsteigend nach `atMs`, dann Satellit — die eine Reihenfolge für Verlauf und Anzeige. */
export function sortPasses(passes: readonly FirePass[]): FirePass[] {
  return [...passes].sort((a, b) => a.atMs - b.atMs || a.satellite.localeCompare(b.satellite));
}

/**
 * Überflüge mehrerer Cluster zu einer Liste — für `mergeClusters()` in der
 * Registry (mehrere Cluster in EINER Kartierung sind EIN Brand). Zwei Überflüge
 * desselben Satelliten, deren Zeitspannen sich bis auf `PASS_GAP_MS` berühren,
 * werden zu einem: Zahlen summiert, Schwerpunkt nach ΣFRP (ohne FRP nach
 * Pixeln) gewichtet, Pixelbreite pixelgewichtet.
 */
export function mergePasses(lists: readonly (readonly FirePass[])[]): FirePass[] {
  const all = lists.flat().sort((a, b) =>
    a.satellite.localeCompare(b.satellite) || a.fromMs - b.fromMs || a.key.localeCompare(b.key));
  const out: FirePass[] = [];
  let cur: FirePass | null = null;
  for (const p of all) {
    if (cur && cur.satellite === p.satellite && p.fromMs - cur.toMs <= PASS_GAP_MS) {
      cur = mergeTwo(cur, p);
    } else {
      if (cur) out.push(cur);
      cur = { ...p };
    }
  }
  if (cur) out.push(cur);
  return sortPasses(out);
}

function mergeTwo(a: FirePass, b: FirePass): FirePass {
  const wa = a.sumFrp > 0 ? a.sumFrp : a.pixels;
  const wb = b.sumFrp > 0 ? b.sumFrp : b.pixels;
  const w = wa + wb;
  const pixels = a.pixels + b.pixels;
  const scanN = (a.meanScanKm != null ? a.pixels : 0) + (b.meanScanKm != null ? b.pixels : 0);
  const scanSum = (a.meanScanKm ?? 0) * (a.meanScanKm != null ? a.pixels : 0)
    + (b.meanScanKm ?? 0) * (b.meanScanKm != null ? b.pixels : 0);
  const fromMs = Math.min(a.fromMs, b.fromMs);
  const dayA = a.day; const dayB = b.day;
  return {
    key: `${a.satellite}@${fromMs}`,
    satellite: a.satellite,
    fromMs, toMs: Math.max(a.toMs, b.toMs), atMs: fromMs,
    day: dayA === dayB ? dayA : null,
    pixels,
    frpPixels: a.frpPixels + b.frpPixels,
    sumFrp: round2(a.sumFrp + b.sumFrp),
    maxFrp: Math.max(a.maxFrp, b.maxFrp),
    lat: w > 0 ? (a.lat * wa + b.lat * wb) / w : a.lat,
    lon: w > 0 ? (a.lon * wa + b.lon * wb) / w : a.lon,
    meanScanKm: scanN > 0 ? Math.round((scanSum / scanN) * 100) / 100 : null,
    pixelAreaHa: a.pixelAreaHa == null && b.pixelAreaHa == null ? null
      : Math.round(((a.pixelAreaHa ?? 0) + (b.pixelAreaHa ?? 0)) * 10) / 10,
    bbox: [Math.min(a.bbox[0], b.bbox[0]), Math.min(a.bbox[1], b.bbox[1]), Math.max(a.bbox[2], b.bbox[2]), Math.max(a.bbox[3], b.bbox[3])],
  };
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface PassCheck { name: string; ok: boolean; detail?: string }

function row(lat: number, lon: number, acqMs: number, opts: Partial<FirmsRow> = {}): FirmsRow {
  return {
    lat, lon, acqMs, frp: 5, confidence: 'nominal', brightTi4: 320, brightTi5: 290,
    scanKm: 0.4, trackKm: 0.4, satellite: 'N', day: false, source: 'VIIRS_SNPP_NRT', ...opts,
  };
}

export function verifyOverpasses(): { checks: PassCheck[]; passed: number; total: number } {
  const checks: PassCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const t0 = Date.UTC(2026, 7, 15, 1, 39);
  const MIN = 60_000;

  add('leere Eingabe ⇒ keine Überflüge', groupPasses([]).length === 0);

  // Ein Satellit über die Minutengrenze: 01:39 und 01:41 ⇒ EIN Überflug (vorher zwei).
  const spanMinute = groupPasses([row(48, 11, t0), row(48.004, 11, t0 + 2 * MIN)]);
  add('ein Satellit, 2 min auseinander (Minutengrenze) ⇒ EIN Überflug',
    spanMinute.length === 1 && spanMinute[0].pixels === 2 && spanMinute[0].fromMs === t0 && spanMinute[0].toMs === t0 + 2 * MIN,
    `${spanMinute.length}`);
  // Zwei Satelliten in derselben Minute ⇒ ZWEI Überflüge (zwei Beobachtungen).
  const twoSats = groupPasses([row(48, 11, t0), row(48, 11, t0, { satellite: 'N20' })]);
  add('zwei Satelliten in derselben Minute ⇒ zwei Überflüge', twoSats.length === 2
    && twoSats.map((p) => p.satellite).join(',') === 'N,N20');
  // Derselbe Satellit, 11 min später ⇒ neuer Überflug.
  add('derselbe Satellit nach > 10 min ⇒ neuer Überflug',
    groupPasses([row(48, 11, t0), row(48, 11, t0 + 11 * MIN)]).length === 2);
  add('… nach genau 10 min noch derselbe', groupPasses([row(48, 11, t0), row(48, 11, t0 + PASS_GAP_MS)]).length === 1);
  add('Reihenfolge der Eingabe ändert nichts',
    JSON.stringify(groupPasses([row(48.004, 11, t0 + 2 * MIN), row(48, 11, t0)])) === JSON.stringify(spanMinute));

  // Kennzahlen je Überflug.
  const p = groupPasses([
    row(48, 11, t0, { frp: 10, scanKm: 0.4, trackKm: 0.5 }),
    row(48.01, 11, t0, { frp: 30, scanKm: 0.6, trackKm: 0.5 }),
    row(48.02, 11, t0, { frp: null, scanKm: 0.5, trackKm: 0.5 }),
  ])[0];
  add('ΣFRP/maxFRP nur aus Pixeln MIT FRP; Pixel zählen alle',
    p.pixels === 3 && p.frpPixels === 2 && p.sumFrp === 40 && p.maxFrp === 30, JSON.stringify(p));
  add('Schwerpunkt ist FRP-gewichtet (liegt näher am 30-MW-Pixel)',
    Math.abs(p.lat - 48.0075) < 1e-9, String(p.lat));
  add('mittlere Pixelbreite und Pixelgrundfläche (Σ scan×track in ha)',
    p.meanScanKm === 0.5 && p.pixelAreaHa === 75, `${p.meanScanKm} / ${p.pixelAreaHa}`);
  add('ohne scan/track: Pixelbreite/Fläche null, nicht 0',
    (() => { const q = groupPasses([row(48, 11, t0, { scanKm: null, trackKm: null })])[0]; return q.meanScanKm === null && q.pixelAreaHa === null; })());
  add('Tag/Nacht wird je Überflug geführt', groupPasses([row(48, 11, t0, { day: true })])[0].day === true
    && groupPasses([row(48, 11, t0)])[0].day === false);
  add('FRP 0 ist eine Angabe (kein Beitrag), fehlende FRP nicht',
    (() => { const q = groupPasses([row(48, 11, t0, { frp: 0 })])[0]; return q.frpPixels === 1 && q.sumFrp === 0; })());

  // Merge (Registry): zwei Cluster, derselbe Überflug ⇒ ein Überflug.
  const a = groupPasses([row(48, 11, t0, { frp: 10 })]);
  const b = groupPasses([row(48.03, 11, t0 + MIN, { frp: 30 })]);
  const m = mergePasses([a, b]);
  add('Merge: derselbe Satellit, 1 min versetzt ⇒ EIN Überflug mit Summe und gewichtetem Schwerpunkt',
    m.length === 1 && m[0].pixels === 2 && m[0].sumFrp === 40 && Math.abs(m[0].lat - 48.0225) < 1e-9, JSON.stringify(m));
  add('Merge: anderer Satellit bleibt getrennt',
    mergePasses([a, groupPasses([row(48.03, 11, t0, { satellite: 'N21' })])]).length === 2);
  add('Merge ist idempotent', JSON.stringify(mergePasses([m])) === JSON.stringify(m));
  add('Merge ohne Eingabe ⇒ leer', mergePasses([]).length === 0);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
