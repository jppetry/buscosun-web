/**
 * AP16 (Phase FI, Vollform) — Landbedeckung am Punkt aus DENSELBEN WorldCover-Kacheln wie z0 (`z0Point.ts`, 0 Byte mehr):
 *
 *   • z0 v1 — unverändert aus `z0FromClassField` (dieselbe Funktion, dieselbe Klassenfunktion ⇒ dieselben Zahlen);
 *   • κ-Eingang (PAP 3, E-F-16) — Klassengruppen-Anteile p im Punktkreis (500 m, der Fußabdruck der Station) und je
 *     Stufe t1/t2 q in den 3×3 Zellen um die nächste Zelle, jeweils über die Box um die ZELLMITTE (absolut adressiert:
 *     Stufe, iy, ix) — dazu je Zelle das log-Mittel z0 für die Modellzell-Box (V-FI-65);
 *   • d_water (E-F-17) — Abstand zum nächsten Gewässer ≥ A_min, zensiert statt Platzhalter.
 *
 * Warum 3×3 und nicht der 2×2-Block: das Ergebnis liegt je Ort im Cache (Schlüssel auf 0,001° gerundet). Ein zweiter Punkt
 * im selben Schlüssel kann am Zellrand eine andere nächste Zelle oder an der Zellmitte eine andere Blockseite haben; beide
 * Blöcke liegen im 3×3 der ersten nächsten Zelle (der Block der Nachbarzelle zeigt zurück) ⇒ jeder Treffer ist richtig
 * adressiert. t3 bekommt keine Zellen: t3-Blockzellen reichen bis 0,375° vom Punkt, geladen ist nur ±0,125° (κ = 1, benannt).
 *
 * Gruppen (TV-Abstand, E-F-16): Wasser 80 · Stadt 50 · Wald 10 · Offen 20/30/40/90/95/100 · Kahl 60 · Schnee 70.
 * κ = exp(−δ/λ), δ = ½·Σ|p − q|, λ = 1 (set). Unter 80 % bekannter Pixel (Punktkreis oder Zelle) ⇒ nicht entscheidbar.
 *
 * d_water: Fenster in Pixeln der Spiegel-Ebene (1/3 000° ≈ 37 m N–S), Schnitt aus den geladenen Kacheln und der 20-km-Box;
 * Ringsuche vom Punktpixel nach außen, Abstand metrisch zur Pixelmitte; ein Wasserpixel zählt nur, wenn sein Körper
 * (8er-Nachbarschaft) mindestens `minBodyPx` Pixel hat — gemessen (§0): ein 1-px-Rauschpixel versetzte die Zugspitze von
 * 3 479 auf 394 m. r_c = Abstand zum nächsten unbekannten Pixel (nicht geladen, Klasse 0), höchstens 20 km; ohne Treffer
 * diesseits r_c: `m: null`, `aboveM: r_c` — nie ein Platzhalter. Grenze des Spiegels: ≈ 37 m, Flüsse < ~40 m fehlen (V-FI-75).
 *
 * Rein bis auf den Lader; headless prüfbar (`verify:point-client` (10r)).
 */
import { DWATER_MAX_M, WORLDCOVER_WATER, WORLDCOVER_Z0, M_PER_DEG_LAT, mPerDegLon } from '../terrainPoint';
import { TIER_BY_ID, cellOf, cellCenter, type TierId } from '../cubeFormat';
import { WC_TILE_DEG, WC_PX_DEG, WC_MIRROR_SHA, WC_MIRROR_LEVEL_PX } from '../../fire/detail/worldCover';
import {
  z0FromClassField, classAtOf, loadWorldCoverTiles, z0CacheKey, Z0_SOURCE, Z0_MIN_COVERAGE,
  type ClassAt, type WcLoadedFile, type Z0AtPoint, type Z0Options,
} from './z0Point';

/** Die sechs Gruppen des TV-Abstands, in dieser Reihenfolge in `p` und `q`. */
export const LC_GROUPS = Object.freeze(['water', 'urban', 'forest', 'open', 'bare', 'snow'] as const);
const GROUP_INDEX: Readonly<Record<number, number>> = Object.freeze({ 80: 0, 50: 1, 10: 2, 20: 3, 30: 3, 40: 3, 90: 3, 95: 3, 100: 3, 60: 4, 70: 5 });

/** Setzungen dieser Etappe (alle `set`, E-F-16/17). */
export const LANDCOVER_SET = Object.freeze({
  /** κ-Skala λ (konservativ; bei 0,5 lag die Spreizung ≥ 1,5 an 24/42 Orten, §0). */
  lambda: 1,
  /** Mindestanteil bekannter Pixel für κ (höher als z0: Teilabdeckung verzerrt Anteile). */
  minCoverage: 0.8,
  /** A_min des Gewässers (≈ 0,014 km² bei 37 × 25 m). */
  minBodyPx: 10,
  /** Die Körpergröße wird bis hierhin gezählt (Ausgabe `bodyPx`, gedeckelt). */
  bodyCapPx: 10_000,
  /** Suchradius d_water. */
  maxM: DWATER_MAX_M,
  /** Abtastschritt der Zellboxen (m) — wie die z0-Boxen der Stufe. */
  cellStepM: Object.freeze({ t1: 100, t2: 200 }),
});
export const LC_TIERS = Object.freeze(['t1', 't2'] as const);
export type LcTier = (typeof LC_TIERS)[number];
const LC_CACHE_VERSION = 1;

export interface LandCoverCell {
  iy: number;
  ix: number;
  /** Anteil bekannter Pixel der Box um die Zellmitte (0…1). */
  cov: number;
  /** Gruppenanteile (Reihenfolge `LC_GROUPS`) über die bekannten Pixel. */
  q: number[];
  /** log-Mittel der Klassen-z0 der Box, m; `null` unter `Z0_MIN_COVERAGE`. */
  z0: number | null;
}

export interface DWater {
  /** Abstand zur nächsten Wasserpixel-Mitte eines Körpers ≥ A_min, m (auf 10 m); `null` = keiner diesseits r_c. */
  m: number | null;
  /** Ohne Treffer: kein Gewässer ≥ A_min innerhalb dieses Radius (r_c, auf 10 m abgerundet). */
  aboveM: number | null;
  /** `none` = r_c reicht über die garantiert geladene Breite; `coverage` = eine Datei/Kachel fehlt ⇒ r_c kleiner. */
  reason: 'found' | 'none' | 'coverage';
  /** Pixel des getroffenen Körpers (8er-Nachbarschaft), gedeckelt bei `bodyCapPx`. */
  bodyPx: number | null;
}

export interface LandCover {
  v: 1;
  /** Gruppenanteile im Punktkreis (aus den Klassenanteilen von z0 v1) und dessen bekannter Anteil. */
  point: { cov: number; p: number[] };
  /** Je Stufe die 3×3 Zellen um die nächste Zelle (am Gitterrand weniger). */
  cells: Partial<Record<LcTier, LandCoverCell[]>>;
  dWater: DWater | null;
}

export interface LandCoverAtPoint extends Z0AtPoint {
  landCover: LandCover;
  /** Rechenzeit des Durchgangs (Klassenfeld → Ergebnis, ohne Abruf), ms — nur frisch gerechnet. */
  computeMs?: number;
}

export const isLandCover = (z: Z0AtPoint | null | undefined): z is LandCoverAtPoint => !!z && !!(z as Partial<LandCoverAtPoint>).landCover;

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

// ---------------------------------------------------------------------------
// κ und Zellboxen (rein)
// ---------------------------------------------------------------------------

/**
 * Gruppenanteile, bekannter Anteil und log-Mittel z0 über die Box einer Zelle. Stützraster um die Zellmitte wie die
 * z0-Boxen, aber abgerundet (`floor`): jede Stützstelle liegt IN der Zelle — die Anteile gehören zu genau einer Zelle
 * (mit `round` ragte das Raster bis 0,0003° in die Nachbarzelle).
 */
function boxStats(classAt: ClassAt, lat: number, lon: number, halfDeg: number, stepM: number): Omit<LandCoverCell, 'iy' | 'ix'> {
  const dLat = stepM / M_PER_DEG_LAT, dLon = stepM / mPerDegLon(lat);
  const ny = Math.max(1, Math.floor(halfDeg / dLat)), nx = Math.max(1, Math.floor(halfDeg / dLon));
  const n = [0, 0, 0, 0, 0, 0];
  let known = 0, total = 0, sumLn = 0;
  for (let j = -ny; j <= ny; j++) {
    for (let i = -nx; i <= nx; i++) {
      total++;
      const c = classAt(lat + j * dLat, lon + i * dLon);
      const g = c == null ? undefined : GROUP_INDEX[c];
      if (g === undefined) continue;
      known++;
      n[g]++;
      sumLn += Math.log(WORLDCOVER_Z0[c as number]);
    }
  }
  const cov = total ? known / total : 0;
  return { cov: round4(cov), q: n.map((x) => (known ? round4(x / known) : 0)), z0: known && cov >= Z0_MIN_COVERAGE ? round6(Math.exp(sumLn / known)) : null };
}

/** κ aus zwei Gruppenverteilungen: exp(−½·Σ|p − q| / λ). */
export function kappaOf(p: readonly number[], q: readonly number[], lambda: number = LANDCOVER_SET.lambda): number {
  let d = 0;
  for (let g = 0; g < LC_GROUPS.length; g++) d += Math.abs((p[g] ?? 0) - (q[g] ?? 0));
  return Math.exp(-(d / 2) / lambda);
}

/** Die Zelle (Stufe, iy, ix) aus dem Ergebnis — `null`, wenn sie nicht im 3×3 liegt oder die Stufe keine Zellen hat. */
export function landCoverCell(lc: LandCover, tier: TierId, iy: number, ix: number): LandCoverCell | null {
  if (tier !== 't1' && tier !== 't2') return null;
  return lc.cells[tier]?.find((c) => c.iy === iy && c.ix === ix) ?? null;
}

/** κ einer Zelle; `null` = nicht entscheidbar (t3, Zelle nicht im 3×3, Punktkreis oder Zelle < 80 % bekannt). */
export function kappaAt(lc: LandCover, tier: TierId, iy: number, ix: number, lambda: number = LANDCOVER_SET.lambda): number | null {
  if (lc.point.cov < LANDCOVER_SET.minCoverage) return null;
  const c = landCoverCell(lc, tier, iy, ix);
  if (!c || c.cov < LANDCOVER_SET.minCoverage) return null;
  return kappaOf(lc.point.p, c.q, lambda);
}

// ---------------------------------------------------------------------------
// d_water (rein): Fenster + Ringsuche
// ---------------------------------------------------------------------------

export interface WcWindow {
  /** Klassen je Pixel (Zeile für Zeile von Nord nach Süd), 0 = unbekannt. */
  data: Uint8Array;
  w: number;
  h: number;
  /** Punktpixel im Fenster. */
  cx: number;
  cy: number;
  /** Mitte des Punktpixels minus Punkt, m (Ost bzw. Nord positiv). */
  offX: number;
  offY: number;
  /** Pixelmaße, m. */
  pxW: number;
  pxH: number;
  maxM: number;
  /** Garantiert geladener Radius (t3-Box O–W minus ein Pixel): ein r_c darunter heißt „coverage". */
  safeM: number;
}

/** Pixelgröße der Spiegel-Ebene in Grad (1/3 000°). */
export const WC_LEVEL_PX_DEG = WC_TILE_DEG / WC_MIRROR_LEVEL_PX;

function windowGeometry(lat: number, lon: number, pxDeg: number, maxM: number) {
  const pxW = pxDeg * mPerDegLon(lat), pxH = pxDeg * M_PER_DEG_LAT;
  const gx = Math.floor((lon + 180) / pxDeg), gy = Math.floor((90 - lat) / pxDeg);
  const kx = Math.ceil(maxM / pxW), ky = Math.ceil(maxM / pxH);
  return {
    gx0: gx - kx, gy0: gy - ky, w: 2 * kx + 1, h: 2 * ky + 1, cx: kx, cy: ky,
    offX: ((gx + 0.5) * pxDeg - 180 - lon) * mPerDegLon(lat), offY: (90 - (gy + 0.5) * pxDeg - lat) * M_PER_DEG_LAT,
    pxW, pxH, maxM, safeM: (TIER_BY_ID.t3.deg / 2) * mPerDegLon(lat) - pxW,
  };
}

/** Das Fenster aus den geladenen Kacheln — zeilenweise kopiert (schnell, der Produktweg). */
export function windowFromTiles(usable: readonly WcLoadedFile[], lat: number, lon: number, maxM: number = LANDCOVER_SET.maxM): WcWindow | null {
  if (!usable.length) return null;
  const pxDeg = WC_PX_DEG * usable[0].fac;
  const { gx0, gy0, ...g } = windowGeometry(lat, lon, pxDeg, maxM);
  const data = new Uint8Array(g.w * g.h);
  for (const f of usable) {
    if (WC_PX_DEG * f.fac !== pxDeg) continue;   // eine andere Ebene passt nicht ins Raster (benannt: bleibt unbekannt)
    const baseX = Math.round((f.lo0 + 180) / pxDeg), baseY = Math.round((90 - f.la0 - WC_TILE_DEG) / pxDeg);
    const { width, height, tileW, tileH, tilesAcross } = f.ifd;
    for (const [idx, t] of f.tiles) {
      const row = Math.floor(idx / tilesAcross), col = idx % tilesAcross;
      const px0 = col * tileW, py0 = row * tileH;
      const X0 = Math.max(baseX + px0, gx0), X1 = Math.min(baseX + Math.min(px0 + tileW, width), gx0 + g.w);
      const Y0 = Math.max(baseY + py0, gy0), Y1 = Math.min(baseY + Math.min(py0 + tileH, height), gy0 + g.h);
      if (X0 >= X1 || Y0 >= Y1) continue;
      for (let Y = Y0; Y < Y1; Y++) {
        const src = (Y - baseY - py0) * tileW + (X0 - baseX - px0);
        data.set(t.subarray(src, src + (X1 - X0)), (Y - gy0) * g.w + (X0 - gx0));
      }
    }
  }
  return { data, ...g };
}

/** Dasselbe Fenster aus einer Klassenfunktion (Pixelmitten) — für synthetische Felder und als Gegenprobe des Kopierwegs. */
export function windowFromClassAt(classAt: ClassAt, lat: number, lon: number, maxM: number = LANDCOVER_SET.maxM, pxDeg: number = WC_LEVEL_PX_DEG): WcWindow {
  const { gx0, gy0, ...g } = windowGeometry(lat, lon, pxDeg, maxM);
  const data = new Uint8Array(g.w * g.h);
  for (let y = 0; y < g.h; y++) {
    const la = 90 - (gy0 + y + 0.5) * pxDeg;
    for (let x = 0; x < g.w; x++) {
      const v = classAt(la, (gx0 + x + 0.5) * pxDeg - 180);
      if (v != null && v > 0 && v < 256) data[y * g.w + x] = v;
    }
  }
  return { data, ...g };
}

/** Ringsuche: nächstes Gewässer ≥ `minBodyPx` diesseits r_c. */
export function dWaterFromWindow(win: WcWindow, minBodyPx: number = LANDCOVER_SET.minBodyPx): DWater {
  const { data, w, h, cx, cy, offX, offY, pxW, pxH } = win;
  const minPx = Math.min(pxW, pxH);
  // Der Fensterrand liegt um mindestens ein halbes Pixel jenseits von maxM (ceil in windowGeometry) ⇒ r_c ≤ maxM.
  let rc = win.maxM, best = Infinity, bestIdx = -1;
  const label = new Uint8Array(w * h);   // 0 offen · 1 zu klein · 2 groß genug · 3 unentscheidbar (berührt Unbekanntes) · 4 gezählt
  const dist = (x: number, y: number) => Math.hypot((x - cx) * pxW + offX, -(y - cy) * pxH + offY);
  const classify = (start: number): number => {
    const queue = [start];
    const seen = new Set<number>(queue);
    let touches = false;
    for (let qi = 0; qi < queue.length && queue.length < minBodyPx; qi++) {
      const i = queue[qi], x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) { touches = true; continue; }
          const j = ny * w + nx, v = data[j];
          if (v === 0) { touches = true; continue; }
          if (v !== WORLDCOVER_WATER || seen.has(j)) continue;
          if (label[j] === 2) { for (const s of queue) label[s] = 2; return 2; }   // Teil eines schon großen Körpers
          seen.add(j);
          queue.push(j);
        }
      }
    }
    const lab = queue.length >= minBodyPx ? 2 : touches ? 3 : 1;
    for (const s of queue) label[s] = lab;
    return lab;
  };
  const visit = (x: number, y: number) => {
    const i = y * w + x, v = data[i];
    if (v === 0) { const d = dist(x, y); if (d < rc) rc = d; return; }
    if (v !== WORLDCOVER_WATER) return;
    const d = dist(x, y);
    if (d >= best) return;
    const lab = label[i] || classify(i);
    if (lab === 2) { best = d; bestIdx = i; } else if (lab === 3 && d < rc) rc = d;
  };
  const kMax = Math.max(cx, cy, w - 1 - cx, h - 1 - cy);
  for (let k = 0; k <= kMax; k++) {
    // Jedes Pixel im Ring k liegt mindestens (k − ½)·min(Pixelbreite, Pixelhöhe) vom Punkt.
    if (k > 0 && (k - 0.5) * minPx > Math.min(best, rc)) break;
    const y0 = cy - k, y1 = cy + k, x0 = cx - k, x1 = cx + k;
    const xa = Math.max(0, x0), xb = Math.min(w - 1, x1);
    if (y0 >= 0) for (let x = xa; x <= xb; x++) visit(x, y0);
    if (k > 0 && y1 < h) for (let x = xa; x <= xb; x++) visit(x, y1);
    if (k === 0) continue;
    const ya = Math.max(0, y0 + 1), yb = Math.min(h - 1, y1 - 1);
    if (x0 >= 0) for (let y = ya; y <= yb; y++) visit(x0, y);
    if (x1 < w) for (let y = ya; y <= yb; y++) visit(x1, y);
  }
  if (bestIdx >= 0 && best <= rc) {
    // Körpergröße des Treffers (gedeckelt): Flutfüllung ab dem Treffer, markiert mit 4.
    let n = 0;
    const stack = [bestIdx];
    label[bestIdx] = 4;
    while (stack.length && n < LANDCOVER_SET.bodyCapPx) {
      const i = stack.pop() as number, x = i % w, y = (i - x) / w;
      n++;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (data[j] !== WORLDCOVER_WATER || label[j] === 4) continue;
          label[j] = 4;
          stack.push(j);
        }
      }
    }
    return { m: Math.round(best / 10) * 10, aboveM: null, reason: 'found', bodyPx: n };
  }
  return { m: null, aboveM: Math.floor(rc / 10) * 10, reason: rc < win.safeM ? 'coverage' : 'none', bodyPx: null };
}

// ---------------------------------------------------------------------------
// Aus einer Klassenfunktion (rein) und der Lader
// ---------------------------------------------------------------------------

/** z0 v1 + Landbedeckung aus einer Klassenfunktion; d_water nur mit Fenster (sonst `null`). */
export function landCoverFromClassField(classAt: ClassAt, lat: number, lon: number, win: WcWindow | null = null): Omit<LandCoverAtPoint, 'source' | 'fetched' | 'computeMs'> {
  const z = z0FromClassField(classAt, lat, lon);
  const p = [0, 0, 0, 0, 0, 0];
  for (const [c, share] of z.shares) { const g = GROUP_INDEX[c]; if (g !== undefined) p[g] += share; }
  const cells: LandCover['cells'] = {};
  for (const t of LC_TIERS) {
    const tier = TIER_BY_ID[t];
    const c = cellOf(tier, lat, lon);
    if (!c) continue;
    const list: LandCoverCell[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const iy = c.iy + dy, ix = c.ix + dx;
        if (iy < 0 || ix < 0 || iy >= tier.ny || ix >= tier.nx) continue;
        const m = cellCenter(tier, iy, ix);
        list.push({ iy, ix, ...boxStats(classAt, m.lat, m.lon, tier.deg / 2, LANDCOVER_SET.cellStepM[t]) });
      }
    }
    cells[t] = list;
  }
  return {
    ...z,
    landCover: { v: 1, point: { cov: z.coverage.point, p: p.map(round4) }, cells, dWater: win ? dWaterFromWindow(win) : null },
  };
}

/** Cache-Schlüssel des Ergebnisses je Ort — eigener Namensraum neben `z0:v1` (0,001°, Spiegel-Commit im Schlüssel). */
export const landCoverCacheKey = (lat: number, lon: number) => `lc:v${LC_CACHE_VERSION}:${WC_MIRROR_SHA.slice(0, 12)}:${lat.toFixed(3)},${lon.toFixed(3)}`;

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * z0 v1 + Landbedeckung am Punkt. Dieselben Kacheln wie `loadZ0AtPoint` (gemeinsamer Lader, Kachelbytes je URL im Cache).
 * `cacheOnly`: liest zuerst `lc:v1`, dann den alten `z0:v1`-Eintrag — ein bekannter Ort verliert z0 in der ersten Ausgabe
 * nicht; das Ergebnis ist dann ein reines `Z0AtPoint` (ohne `landCover`), der Aufrufer holt die Landbedeckung nach.
 */
export async function loadLandCoverAtPoint(lat: number, lon: number, opts: Z0Options = {}): Promise<Z0AtPoint | null> {
  const T0 = nowMs();
  const cache = opts.cache ?? null;
  const key = landCoverCacheKey(lat, lon);
  const fromCache = (r: Z0AtPoint): Z0AtPoint => ({ ...r, fetched: { files: 0, tiles: 0, bytes: 0, ms: Math.round(nowMs() - T0), fromCache: true } });
  if (cache) {
    const hit = await cache.get(key).catch(() => null);
    if (hit) {
      try {
        const r = JSON.parse(new TextDecoder().decode(hit.bytes)) as Z0AtPoint;
        if (isLandCover(r)) return fromCache(r);
      } catch { /* kaputter Eintrag ⇒ neu rechnen */ }
    }
    if (opts.cacheOnly) {
      const old = await cache.get(z0CacheKey(lat, lon)).catch(() => null);
      if (old) {
        try { return fromCache(JSON.parse(new TextDecoder().decode(old.bytes)) as Z0AtPoint); } catch { /* kaputt ⇒ nichts */ }
      }
    }
  }
  if (opts.cacheOnly) return null;
  const tiles = await loadWorldCoverTiles(lat, lon, opts);
  if (!tiles.usable.length) return null;
  const T1 = nowMs();
  const r: LandCoverAtPoint = { ...landCoverFromClassField(classAtOf(tiles.usable), lat, lon, windowFromTiles(tiles.usable, lat, lon)), source: Z0_SOURCE };
  const computeMs = Math.round((nowMs() - T1) * 10) / 10;
  if (cache && r.z0True != null) cache.put(key, { bytes: new TextEncoder().encode(JSON.stringify(r)), storedAt: Date.now() }).catch(() => { /* gezählt reicht */ });
  const out: LandCoverAtPoint = {
    ...r,
    computeMs,
    fetched: { files: tiles.usable.length, tiles: tiles.tilesFetched, bytes: tiles.bytes, ms: Math.round(nowMs() - T0), fromCache: false },
  };
  return out;
}
