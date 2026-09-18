/**
 * V-FI-17 (Phase FI) — Rauhigkeitslänge z0 am Punkt und je Modellzelle aus ESA WorldCover, für die zweistufige
 * Windkorrektur von buscosun Fusion (`fusion/terrainTerms.ts`, `windBlendingFactor`).
 *
 * Zwei Rauhigkeiten, beide aus derselben Quelle (Entscheidung, set — `audit/fusion-implementierung.md` §9.16.2):
 *   • z0_true  = log-Mittel der Klassen-z0 im Kreis `Z0_POINT_RADIUS_M` um den Punkt (die Anströmstrecke des
 *                10-m-Winds, nicht ein einzelnes 37-m-Pixel);
 *   • z0_mod   = je Cube-Stufe das log-Mittel über die Zellweite der Stufe (t1 0,05°, t2 0,10°, t3 0,25°) um den
 *                Punkt — so sieht ein Modell die Landbedeckung seiner Zelle. Das GRIB-Feld z0 der Modelle trägt der
 *                Cube nicht (V-FI-58); ohne Orographie-Anteil.
 * Klassen → z0: `WORLDCOVER_Z0` (Davenport/Wieringa, `literature`). Unter `MIN_COVERAGE` bekannter Pixel ⇒ `null`
 * (nie ein Ersatzwert).
 *
 * Quelle: der SHA-gepinnte Spiegel `jppetry/buscosun-worldcover` (SAT2d, V-SAT-15) über jsDelivr — eine Ebene
 * 9 000 px je 3°-Kachel (≈ 37 m), 1024²-Kacheln ≈ 38 km, Deflate. Ein Ort braucht den Kopf jeder berührten
 * 3°-Datei und die Kacheln, die die t3-Zelle schneidet (gemessen 18.09.: 1–4 Kacheln à ≈ 100 KB). Das Ergebnis
 * ist zeitlos (Landbedeckung 2021) und liegt danach im Cache-Backend; die Kachelbytes ebenfalls (Nachbarorte).
 *
 * Nie auf dem kritischen Pfad: `cubeSource.ts` startet den Abruf im progressiven Modus erst mit dem Kern; fehlt z0,
 * bleibt die Windkorrektur inaktiv (Flag `windBlendingInactive`) — benannt, nicht erfunden.
 */
import { WORLDCOVER_Z0, M_PER_DEG_LAT, mPerDegLon } from '../terrainPoint';
import { TIER_BY_ID, type TierId } from '../cubeFormat';
import { parseCogIfds, decodeTile, COG_HEADER_BYTES, type CogIfd } from '../../fire/detail/cogTiff';
import { WC_MIRROR_SHA, WC_TILE_DEG, WC_TILE_PX, WC_PX_DEG, wcMirrorUrl, wcTileName } from '../../fire/detail/worldCover';
import type { CacheBackend } from './cache';

/** Radius der Anströmstrecke am Punkt (set). */
export const Z0_POINT_RADIUS_M = 500;
/** Mindestanteil bekannter Pixel, damit ein log-Mittel gilt (set). */
export const Z0_MIN_COVERAGE = 0.5;
/** Abtastschritt je Fläche (m) — Punktkreis ≈ ein Pixel, Zellboxen gröber (≈ 2 000–3 000 Stützstellen je Box). */
const SAMPLE_STEP_M: Readonly<Record<'point' | TierId, number>> = Object.freeze({ point: 40, t1: 100, t2: 200, t3: 400 });
const Z0_TIERS: readonly TierId[] = ['t1', 't2', 't3'];
export const Z0_SOURCE = `ESA WorldCover 2021 v200 (CC BY 4.0), Spiegel jppetry/buscosun-worldcover@${WC_MIRROR_SHA.slice(0, 7)}`;
const CACHE_VERSION = 1;

export interface Z0AtPoint {
  /** log-Mittel im Kreis `radiusM` um den Punkt, m; `null` unter der Mindestabdeckung. */
  z0True: number | null;
  /** Je Stufe das log-Mittel über die Zellweite der Stufe, m. */
  z0Mod: Partial<Record<TierId, number | null>>;
  /** Anteil bekannter Pixel je Fläche (0…1). */
  coverage: { point: number } & Partial<Record<TierId, number>>;
  /** Klassenanteile im Punktkreis, absteigend: [WorldCover-Klasse, Anteil]. */
  shares: Array<[number, number]>;
  radiusM: number;
  source: string;
  fetched?: { files: number; tiles: number; bytes: number; ms: number; fromCache: boolean };
}

// ---------------------------------------------------------------------------
// Rein: aus einer Klassenfunktion
// ---------------------------------------------------------------------------

/** WorldCover-Klasse an (lat, lon) oder `null` (keine Daten, Kachel fehlt, Klasse 0). */
export type ClassAt = (lat: number, lon: number) => number | null;

interface LogMean { z0: number | null; coverage: number; counts: Map<number, number>; known: number }

function logMeanOver(classAt: ClassAt, lat: number, lon: number, halfLatDeg: number, halfLonDeg: number, stepM: number, circleM: number | null): LogMean {
  const dLat = stepM / M_PER_DEG_LAT, dLon = stepM / mPerDegLon(lat);
  const ny = Math.max(1, Math.round(halfLatDeg / dLat)), nx = Math.max(1, Math.round(halfLonDeg / dLon));
  let sum = 0, known = 0, total = 0;
  const counts = new Map<number, number>();
  for (let j = -ny; j <= ny; j++) {
    for (let i = -nx; i <= nx; i++) {
      if (circleM != null && Math.hypot(j * stepM, i * stepM) > circleM) continue;
      total++;
      const c = classAt(lat + j * dLat, lon + i * dLon);
      const z = c == null ? null : WORLDCOVER_Z0[c] ?? null;
      if (z == null || !(z > 0)) continue;
      sum += Math.log(z);
      known++;
      counts.set(c as number, (counts.get(c as number) ?? 0) + 1);
    }
  }
  const coverage = total ? known / total : 0;
  return { z0: known && coverage >= Z0_MIN_COVERAGE ? Math.exp(sum / known) : null, coverage, counts, known };
}

/** z0 am Punkt und je Stufe aus einer Klassenfunktion — rein, headless prüfbar (synthetische Felder im Verifier). */
export function z0FromClassField(classAt: ClassAt, lat: number, lon: number): Omit<Z0AtPoint, 'source' | 'fetched'> {
  const rDeg = Z0_POINT_RADIUS_M / M_PER_DEG_LAT;
  const pt = logMeanOver(classAt, lat, lon, rDeg, Z0_POINT_RADIUS_M / mPerDegLon(lat), SAMPLE_STEP_M.point, Z0_POINT_RADIUS_M);
  const z0Mod: Partial<Record<TierId, number | null>> = {};
  const coverage: Z0AtPoint['coverage'] = { point: round4(pt.coverage) };
  for (const t of Z0_TIERS) {
    const half = TIER_BY_ID[t].deg / 2;
    const m = logMeanOver(classAt, lat, lon, half, half, SAMPLE_STEP_M[t], null);
    z0Mod[t] = m.z0 == null ? null : round6(m.z0);
    coverage[t] = round4(m.coverage);
  }
  const shares = [...pt.counts.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, round4(n / pt.known)] as [number, number]);
  return { z0True: pt.z0 == null ? null : round6(pt.z0), z0Mod, coverage, shares, radiusM: Z0_POINT_RADIUS_M };
}
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

// ---------------------------------------------------------------------------
// Lader: Spiegel → Klassenfunktion → z0
// ---------------------------------------------------------------------------

export interface Z0Options {
  fetchImpl?: typeof fetch;
  /** Ergebnis je Ort und Kachelbytes (zeitlos). */
  cache?: CacheBackend | null;
  /** Frist je Abruf (ms). */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Nur den Cache lesen, nie das Netz (für den schnellen Blick vor dem Kern). */
  cacheOnly?: boolean;
}

/** Cache-Schlüssel des Ergebnisses je Ort (0,001° ≈ 100 m; Spiegel-Commit im Schlüssel). */
export const z0CacheKey = (lat: number, lon: number) => `z0:v${CACHE_VERSION}:${WC_MIRROR_SHA.slice(0, 12)}:${lat.toFixed(3)},${lon.toFixed(3)}`;
const pointKey = z0CacheKey;

/** Die 3°-Dateien, die das Rechteck berührt (SW-Ecken). */
function filesFor(latMin: number, latMax: number, lonMin: number, lonMax: number): Array<{ name: string; la0: number; lo0: number }> {
  const out: Array<{ name: string; la0: number; lo0: number }> = [];
  for (let la = Math.floor(latMin / WC_TILE_DEG); la <= Math.floor(latMax / WC_TILE_DEG); la++) {
    for (let lo = Math.floor(lonMin / WC_TILE_DEG); lo <= Math.floor(lonMax / WC_TILE_DEG); lo++) {
      out.push({ name: wcTileName(la * WC_TILE_DEG + 1e-9, lo * WC_TILE_DEG + 1e-9), la0: la * WC_TILE_DEG, lo0: lo * WC_TILE_DEG });
    }
  }
  return out;
}

/**
 * Eine geladene 3°-Datei des Spiegels: Geometrie der Ebene und die dekodierten Kacheln (Klassenbytes, 0 = keine Daten).
 * AP16: aus `loadZ0AtPoint` herausgelöst, damit der Landbedeckungs-Durchgang (`landCover.ts`) dieselben Kacheln liest.
 */
export interface WcLoadedFile {
  la0: number;
  lo0: number;
  ifd: Pick<CogIfd, 'width' | 'height' | 'tileW' | 'tileH' | 'tilesAcross'>;
  /** Verhältnis volle Auflösung / Ebene (36 000 / 9 000 = 4). */
  fac: number;
  tiles: Map<number, Uint8Array>;
}

/** Die Klassenfunktion über geladenen Dateien — `null` außerhalb, ohne Kachel oder bei Klasse 0 (wortgleich zu vorher). */
export function classAtOf(usable: readonly WcLoadedFile[]): ClassAt {
  return (la, lo) => {
    const f = usable.find((u) => la >= u.la0 && la < u.la0 + WC_TILE_DEG && lo >= u.lo0 && lo < u.lo0 + WC_TILE_DEG);
    if (!f) return null;
    const { ifd, fac } = f;
    const px = Math.min(ifd.width - 1, Math.floor((lo - f.lo0) / WC_PX_DEG / fac));
    const py = Math.min(ifd.height - 1, Math.floor((f.la0 + WC_TILE_DEG - la) / WC_PX_DEG / fac));
    const col = Math.floor(px / ifd.tileW), row = Math.floor(py / ifd.tileH);
    const t = f.tiles.get(row * ifd.tilesAcross + col);
    if (!t) return null;
    const v = t[(py - row * ifd.tileH) * ifd.tileW + (px - col * ifd.tileW)];
    return v > 0 ? v : null;
  };
}

export async function loadZ0AtPoint(lat: number, lon: number, opts: Z0Options = {}): Promise<Z0AtPoint | null> {
  const T0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const cache = opts.cache ?? null;
  const key = pointKey(lat, lon);
  if (cache) {
    const hit = await cache.get(key).catch(() => null);
    if (hit) {
      try {
        const r = JSON.parse(new TextDecoder().decode(hit.bytes)) as Z0AtPoint;
        return { ...r, fetched: { files: 0, tiles: 0, bytes: 0, ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - T0), fromCache: true } };
      } catch { /* kaputter Eintrag ⇒ neu holen */ }
    }
  }
  if (opts.cacheOnly) return null;
  const tiles = await loadWorldCoverTiles(lat, lon, opts);
  if (!tiles.usable.length) return null;
  const r: Z0AtPoint = { ...z0FromClassField(classAtOf(tiles.usable), lat, lon), source: Z0_SOURCE };
  if (cache && r.z0True != null) cache.put(key, { bytes: new TextEncoder().encode(JSON.stringify(r)), storedAt: Date.now() }).catch(() => { /* gezählt reicht */ });
  return {
    ...r,
    fetched: { files: tiles.usable.length, tiles: tiles.tilesFetched, bytes: tiles.bytes, ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - T0), fromCache: false },
  };
}

/**
 * Die Kacheln, die die t3-Box ±0,125° um den Punkt schneidet (Kopf je Datei, dann die Kacheln) — über den Cache je URL
 * und Bereich. AP16: gemeinsamer Teil von `loadZ0AtPoint` und `loadLandCoverAtPoint` (dieselben Bytes).
 */
export async function loadWorldCoverTiles(lat: number, lon: number, opts: Z0Options = {}): Promise<{ usable: WcLoadedFile[]; bytes: number; tilesFetched: number }> {
  const cache = opts.cache ?? null;
  const fetchImpl = opts.fetchImpl ?? fetch;
  let bytes = 0, tilesFetched = 0;
  const get = async (url: string, range: string): Promise<Uint8Array | null> => {
    const ck = `${url}#${range}`;
    if (cache) {
      const hit = await cache.get(ck).catch(() => null);
      if (hit) return hit.bytes;
    }
    // Frist je Abruf, verbunden mit dem Abbruch des Aufrufers (ohne `AbortSignal.any` — Safari < 17.4).
    const ctl = new AbortController();
    const timer = opts.timeoutMs ? setTimeout(() => ctl.abort(), opts.timeoutMs) : null;
    const onAbort = () => ctl.abort();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    let r: Response;
    try { r = await fetchImpl(url, { headers: { range }, signal: ctl.signal }); }
    finally { if (timer) clearTimeout(timer); opts.signal?.removeEventListener('abort', onAbort); }
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    // Ein 200 statt 206 wäre die ganze Datei (≈ 8 MB) — nie annehmen, nie cachen.
    if (r.status !== 206) return null;
    bytes += b.byteLength;
    if (cache) cache.put(ck, { bytes: b, storedAt: Date.now() }).catch(() => { /* gezählt reicht */ });
    return b;
  };

  // Das größte Rechteck (t3-Zelle) bestimmt, welche Dateien und Kacheln gebraucht werden.
  const half = TIER_BY_ID.t3.deg / 2;
  const box = { latMin: lat - half, latMax: lat + half, lonMin: lon - half, lonMax: lon + half };
  const files = filesFor(box.latMin, box.latMax, box.lonMin, box.lonMax);
  const loaded = await Promise.all(files.map(async (f): Promise<WcLoadedFile | null> => {
    const url = wcMirrorUrl(f.name);
    let head = await get(url, `bytes=0-${COG_HEADER_BYTES - 1}`).catch(() => null);
    if (!head) return null;
    let parsed = parseCogIfds(head.buffer.slice(head.byteOffset, head.byteOffset + head.byteLength) as ArrayBuffer);
    if (parsed.kind === 'needMoreBytes') {
      head = await get(url, `bytes=0-${parsed.upTo - 1}`).catch(() => null);
      if (!head) return null;
      parsed = parseCogIfds(head.buffer.slice(head.byteOffset, head.byteOffset + head.byteLength) as ArrayBuffer);
    }
    if (parsed.kind !== 'ok' || !parsed.ifds.length) return null;
    const ifd = parsed.ifds[0];
    const fac = WC_TILE_PX / ifd.width;
    // Pixelbereich der Box in dieser Datei (auf der Ebene), daraus die Kacheln.
    const pxOf = (lo: number) => Math.min(ifd.width - 1, Math.max(0, Math.floor((lo - f.lo0) / WC_PX_DEG / fac)));
    const pyOf = (la: number) => Math.min(ifd.height - 1, Math.max(0, Math.floor((f.la0 + WC_TILE_DEG - la) / WC_PX_DEG / fac)));
    const x0 = pxOf(Math.max(box.lonMin, f.lo0)), x1 = pxOf(Math.min(box.lonMax, f.lo0 + WC_TILE_DEG - 1e-9));
    const y0 = pyOf(Math.min(box.latMax, f.la0 + WC_TILE_DEG - 1e-9)), y1 = pyOf(Math.max(box.latMin, f.la0));
    const want: number[] = [];
    for (let row = Math.floor(y0 / ifd.tileH); row <= Math.floor(y1 / ifd.tileH); row++) {
      for (let col = Math.floor(x0 / ifd.tileW); col <= Math.floor(x1 / ifd.tileW); col++) want.push(row * ifd.tilesAcross + col);
    }
    const tiles = new Map<number, Uint8Array>();
    await Promise.all(want.map(async (idx) => {
      const off = ifd.tileOffsets[idx], n = ifd.tileByteCounts[idx];
      if (!(n > 0)) return;
      const raw = await get(url, `bytes=${off}-${off + n - 1}`).catch(() => null);
      if (!raw) return;
      tilesFetched++;
      try { tiles.set(idx, await decodeTile(raw, ifd)); } catch { /* Kachel unlesbar ⇒ ihre Pixel bleiben unbekannt */ }
    }));
    return { la0: f.la0, lo0: f.lo0, ifd, fac, tiles };
  }));
  return { usable: loaded.filter((x): x is WcLoadedFile => !!x), bytes, tilesFetched };
}
