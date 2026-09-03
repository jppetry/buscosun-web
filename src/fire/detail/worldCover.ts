/**
 * SAT2d — Landbedeckung je Pixel für die Ernte-Sprenkel-Dämpfung des dNBR-Overlays
 * (V-SAT-14, `audit/brandradar-satellitenbilder.md` §12).
 *
 * Quelle: **ESA WorldCover 2021 v200** (10 m global, CC BY 4.0) — 3°-Kachel-COGs in exakt
 * der Bauart des SAT2a-Lesers (uint8 · 1 Band · Deflate · Predictor 1 · 1024²-Kacheln ·
 * Pyramide 36000…562 px). Das Gitter ist EPSG:4326 (3°/36000 ≈ 9,26 m N-S je Pixel),
 * der Kachelname ist die SW-Ecke im 3°-Raster (`N48E006`) — deterministisch, kein STAC.
 *
 * Transport: der AWS-Bucket ist CORS-los (gemessen: ACAO null, Preflight 403); der
 * **Microsoft Planetary Computer** liefert DIESELBE Datei byte-identisch (94 225 409 B
 * an N48E006 nachgemessen) über einen anonymen SAS-Token (`ACAO *`, ~1 h gültig) und
 * Azure-Blob mit Range 206 + `ACAO *` + Preflight-OK für `range` (§12.1 (3)).
 *
 * Regeln (§12.2): jeder Abruf ist fehlertolerant (catch ⇒ null) — ein Ausfall nimmt nur
 * die Dämpfung, nie das dNBR-Overlay; die exakte UTM→Grad-Umtastung je Pixel wäre ein
 * Long-Task-Risiko (51,5 ms je 256²-Kachel gemessen), deshalb 16er-Stützgitter + bilineare
 * Interpolation (< 1 ms, Fehler ≪ 1 WorldCover-Pixel).
 */

import { parseCogIfds, pickLevel, decodeTile, COG_HEADER_RETRY_BYTES, type CogIfd } from './cogTiff';
import { utmInv } from './sentinelGeo';

export const WC_ATTRIBUTION =
  '© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021), CC BY 4.0';
export const WC_TILE_DEG = 3;
export const WC_TILE_PX = 36000;
/** Grad je Vollauflösungs-Pixel. */
export const WC_PX_DEG = WC_TILE_DEG / WC_TILE_PX;
/** N-S-Meter je Vollauflösungs-Pixel — die Bezugsgröße der Ebenenwahl. */
export const WC_M_PER_PX = (WC_TILE_DEG * 111_320) / WC_TILE_PX;

const WC_TOKEN_URL = 'https://planetarycomputer.microsoft.com/api/sas/v1/token/esa-worldcover';
const WC_BLOB_BASE = 'https://ai4edataeuwest.blob.core.windows.net/esa-worldcover/v200/2021/map/';

// --- V-SAT-15: eigener jsDelivr-Spiegel als benannter Ersatzweg (§12.7) ------------------------
//
// Fällt der Planetary Computer aus, fällt NICHT die Dämpfung: das statische Repo
// `jppetry/buscosun-worldcover` trägt je DACH-3°-Kachel die 9000-px-Ebene (≈ 37 m/px) des
// Original-COGs, Kachel-Nutzlasten byte-identisch remuxt (`scripts/fire/wc/build-wc-mirror.mjs`).
// Der Client pinnt den Commit-SHA (unveränderlich, BW-2-Muster) — nie `@main`, und kein Abruf
// vor Existenz des Commits (jsDelivr hält vorzeitig angefragte 404 fest).

/** EIN unveränderlicher Commit des Spiegel-Repos; Änderungen nur als neuer Commit + neuer Pin. */
export const WC_MIRROR_SHA = 'cc3ce5590dd47a0fe002338607ba7c0b07ce9ea4';
export const WC_MIRROR_BASE = `https://cdn.jsdelivr.net/gh/jppetry/buscosun-worldcover@${WC_MIRROR_SHA}/map/`;
/** Auflösung des Spiegels (einzige Ebene; 18 000 px wäre 22,9 MB > 20-MB-Dateigrenze). */
export const WC_MIRROR_LEVEL_PX = 9000;

export function wcMirrorUrl(name: string): string {
  return `${WC_MIRROR_BASE}${name}.tif`;
}

/** `?wcm=1` erzwingt den Spiegel (Beleg/Debug), `?wcm=0` schaltet den Ersatzweg ab — Query schlägt `localStorage.wcm`. */
export function wcMirrorFlag(search?: string, stored?: string | null): 'force' | 'off' | 'auto' {
  const s = search ?? (typeof window !== 'undefined' ? window.location.search : undefined);
  if (s === undefined) return 'auto';
  try {
    const q = new URLSearchParams(s).get('wcm');
    if (q === '0') return 'off';
    if (q === '1') return 'force';
    const st = stored !== undefined ? stored : window.localStorage?.getItem('wcm');
    if (st === '0') return 'off';
    if (st === '1') return 'force';
    return 'auto';
  } catch {
    return 'auto';
  }
}

/** Latch nach RD2-Muster: nur harte Fehler (Netz/Timeout) zählen — ein 404 (Nordsee) zählt NICHT. */
export const WC_PC_FAIL_LATCH = 2;
export const WC_MIRROR_FAIL_LATCH = 2;

export type WcVia = 'pc' | 'mirror';
type WcSrc = { via: 'pc'; token: string } | { via: 'mirror' };

let _pcFails = 0;
let _mirrorFails = 0;
let _via: WcVia | null = null;
let _mirrorAnnounced = false;

function notePcFailure(): void { _pcFails++; }
function noteMirrorFailure(): void { _mirrorFails++; }
function pcUsable(): boolean { return _pcFails < WC_PC_FAIL_LATCH; }
function mirrorUsable(): boolean { return _mirrorFails < WC_MIRROR_FAIL_LATCH; }
/** Summe beider Zähler — Aufrufer unterscheiden damit „harte Störung" von „definitiver Antwort (404)". */
function wcFailCount(): number { return _pcFails + _mirrorFails; }

/** Zuletzt aufgelöster Transportweg — der Viewer sagt damit ehrlich „Spiegel (37 m statt 10 m)". */
export function wcVia(): WcVia | null { return _via; }

/** Test-Haken des Verifiers: Latches, Wegwahl, Token und Caches zurücksetzen. */
export function _resetWc(): void {
  _pcFails = 0;
  _mirrorFails = 0;
  _via = null;
  _mirrorAnnounced = false;
  _tok = null;
  _wcHeaders.clear();
  _wcTiles.clear();
}

/**
 * DIE Wegwahl-Stelle: PC (10 m, Primärweg) → Spiegel (37 m, Latch) → null (Dämpfung aus —
 * heutiges Verhalten). Ein Latch-Kipp mitten in der Sitzung (Token-Ablauf + PC weg) wandert
 * transparent auf den Spiegel, weil die Sampler-Closure je Aufruf hier durchläuft.
 */
async function wcSource(): Promise<WcSrc | null> {
  const mode = wcMirrorFlag();
  if (mode !== 'force' && pcUsable()) {
    const token = await fetchWcToken();
    if (token) { _via = 'pc'; return { via: 'pc', token }; }
    notePcFailure(); // die Token-Eingangstür ist unerreichbar = harter PC-Fehler ⇒ sofort zum Spiegel
  }
  if (mode !== 'off' && mirrorUsable()) {
    if (!_mirrorAnnounced) {
      _mirrorAnnounced = true;
      console.info(mode === 'force'
        ? '[buscosun] WorldCover-Dämpfung → Spiegel erzwungen (?wcm=1; jsDelivr, 37 m).'
        : '[buscosun] Planetary Computer nicht erreichbar → WorldCover-Spiegel (jsDelivr, 37 m) für diese Sitzung.');
    }
    _via = 'mirror';
    return { via: 'mirror' };
  }
  _via = null;
  return null;
}

/** Kill-Switch `?wc=0` / `localStorage.wc` — neue externe Quelle (Rule 2), Query schlägt Speicher. */
export function wcEnabled(search?: string, stored?: string | null): boolean {
  const s = search ?? (typeof window !== 'undefined' ? window.location.search : undefined);
  if (s === undefined) return false;
  try {
    const q = new URLSearchParams(s).get('wc');
    if (q === '0') return false;
    if (q === '1') return true;
    const st = stored !== undefined ? stored : window.localStorage?.getItem('wc');
    return st !== '0';
  } catch {
    return true;
  }
}

// --- V-SAT-16: die Kachel als GANZZAHL statt als Name (§12.8) -----------------------------------
//
// Die Pixel-Schleife des Samplers verglich Kacheln über ihren NAMEN — je 1024²-Kachel rund
// eine Million Strings (`wcTileName`), dazu `indexOf` und Template-Literale als Map-Schlüssel:
// gemessen ~500 ms je Kachel, der Hauptteil des 1-Sekunden-Blockers aus §12.7.6. Der Code
// trägt dieselbe Information (SW-Ecke im 3°-Raster) als eine Zahl; Namen entstehen nur noch
// dort, wo eine URL gebaut wird (≤ 4 je Block).

/** Bits für den Längen-Anteil — 7 fassen 0…127, die 121 möglichen 3°-Spalten kollisionsfrei. */
const WC_CODE_SHIFT = 7;

/** Ganzzahl-Kennung der 3°-Kachel, die den Punkt trägt — Bijektion zu `wcTileName`. */
export function wcTileCode(lat: number, lon: number): number {
  const la = Math.floor(lat / WC_TILE_DEG);
  const lo = Math.floor(lon / WC_TILE_DEG);
  return ((la + 30) << WC_CODE_SHIFT) + (lo + 60);
}

/** Rückweg Code → Name; DIE Stelle, an der ein Kachelname entsteht. */
export function wcNameFromCode(code: number): string {
  const la = ((code >> WC_CODE_SHIFT) - 30) * WC_TILE_DEG;
  const lo = ((code & ((1 << WC_CODE_SHIFT) - 1)) - 60) * WC_TILE_DEG;
  return `${la < 0 ? 'S' : 'N'}${String(Math.abs(la)).padStart(2, '0')}${lo < 0 ? 'W' : 'E'}${String(Math.abs(lo)).padStart(3, '0')}`;
}

/** SW-Ecken-Name der 3°-Kachel, die den Punkt trägt (`N48E006`). */
export function wcTileName(lat: number, lon: number): string {
  return wcNameFromCode(wcTileCode(lat, lon));
}

export function wcMapUrl(name: string): string {
  return `${WC_BLOB_BASE}ESA_WorldCover_10m_2021_v200_${name}_Map.tif`;
}

/** Kachelname + Vollauflösungs-Pixel (Ursprung = NW-Ecke der Kachel). */
export function wcLocate(lat: number, lon: number): { name: string; x: number; y: number } {
  const la0 = Math.floor(lat / WC_TILE_DEG) * WC_TILE_DEG;
  const lo0 = Math.floor(lon / WC_TILE_DEG) * WC_TILE_DEG;
  const clamp = (v: number) => Math.min(WC_TILE_PX - 1, Math.max(0, v));
  return {
    name: wcTileName(lat, lon),
    x: clamp(Math.floor((lon - lo0) / WC_PX_DEG)),
    y: clamp(Math.floor((la0 + WC_TILE_DEG - lat) / WC_PX_DEG)),
  };
}

// --- Token (anonym, ~1 h) ----------------------------------------------------------------------

let _tok: { token: string; expMs: number } | null = null;

/** Anonymer SAS-Token, Sitzungs-Cache mit Ablauf-Wächter; Fehlschlag ⇒ null, nie memoiert. */
export async function fetchWcToken(): Promise<string | null> {
  if (_tok && _tok.expMs - Date.now() > 5 * 60_000) return _tok.token;
  try {
    const r = await fetch(WC_TOKEN_URL);
    if (!r.ok) return null;
    const j: unknown = await r.json();
    const token = (j as { token?: unknown } | null)?.token;
    if (typeof token !== 'string' || token.length === 0) return null;
    const exp = Date.parse(String((j as Record<string, unknown>)['msft:expiry'] ?? ''));
    _tok = { token, expMs: Number.isFinite(exp) ? exp : Date.now() + 30 * 60_000 };
    return token;
  } catch {
    return null;
  }
}

// --- Geo-Stützgitter ---------------------------------------------------------------------------

export const WC_GRID_STEP = 16;

/**
 * lat/lon je Ausgabe-Pixel (Pixelmitten) eines UTM-Blocks — `utmInv` nur am Stützgitter,
 * dazwischen bilinear (§12.1 (5): exakt wären 51,5 ms je 256²-Kachel, so < 1 ms bei
 * einem Fehler ≪ 1 WorldCover-Pixel).
 *
 * V-SAT-16 hat versucht, diese Ausdehnung in `wcMapBlock` zu verschmelzen (zwei
 * `Float64Array` über den ganzen Block = 16 MB je 1024²-Kachel weniger). **Gemessen bringt
 * das nichts** — Node 135 → 133 ms, Browser 209 → 236 ms —, also bleibt es bei zwei
 * schlanken Schleifen statt einer breiten (§12.8.2 E6).
 */
export function wcGeoGrid(
  epsg: number, e0: number, n0: number, stepM: number, outW: number, outH: number,
): { lat: Float64Array; lon: Float64Array } | null {
  const G = WC_GRID_STEP;
  const gw = Math.max(2, Math.ceil((outW - 1) / G) + 1);
  const gh = Math.max(2, Math.ceil((outH - 1) / G) + 1);
  const sLat = new Float64Array(gw * gh);
  const sLon = new Float64Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const g = utmInv(e0 + (gx * G + 0.5) * stepM, n0 - (gy * G + 0.5) * stepM, epsg);
      if (!g) return null;
      sLat[gy * gw + gx] = g.lat;
      sLon[gy * gw + gx] = g.lon;
    }
  }
  const lat = new Float64Array(outW * outH);
  const lon = new Float64Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    const fy = y / G;
    const y0 = Math.min(Math.floor(fy), gh - 2);
    const ty = fy - y0;
    for (let x = 0; x < outW; x++) {
      const fx = x / G;
      const x0 = Math.min(Math.floor(fx), gw - 2);
      const tx = fx - x0;
      const i00 = y0 * gw + x0;
      const i01 = i00 + gw;
      const k = y * outW + x;
      lat[k] = (1 - ty) * ((1 - tx) * sLat[i00] + tx * sLat[i00 + 1]) + ty * ((1 - tx) * sLat[i01] + tx * sLat[i01 + 1]);
      lon[k] = (1 - ty) * ((1 - tx) * sLon[i00] + tx * sLon[i00 + 1]) + ty * ((1 - tx) * sLon[i01] + tx * sLon[i01 + 1]);
    }
  }
  return { lat, lon };
}

// --- Pixel-Zuordnung (V-SAT-16) ----------------------------------------------------------------

/** Eine im Block vorkommende WorldCover-Kachel samt gewählter Ebene. `fac === 0` = Header-Ausfall. */
export interface WcSlot {
  /** `wcTileCode` der Kachel — der Vergleich je Pixel ist damit ein Ganzzahl-Vergleich. */
  code: number;
  /** `WC_TILE_PX / ifd.width`; `0` heißt „keine Ebene" ⇒ die Pixel bleiben unbekannt. */
  fac: number;
  width: number; height: number; tileW: number; tileH: number; tilesAcross: number;
}

/** Packung von Slot und Kachel-Index in `tileOf` (unverändert zur Fassung vor V-SAT-16). */
export const WC_SLOT_SHIFT = 20;

/**
 * Ausgabe-Pixel → (Slot, Kachel-Index) und Pixel-Index in der Kachel; `tileOf[k] === -1`
 * heißt „unbekannt" (Pixel außerhalb der Blockecken-Kacheln oder Kachel ohne Ebene).
 * `onNeed` meldet jede gebrauchte Kachel GENAU EINMAL, in der Reihenfolge des ersten Treffers —
 * damit beginnt der Abruf wie bisher schon während der Schleife.
 *
 * Rein, ohne Netz und ohne DOM: `audit/brandradar-satellitenbilder/wc-sampler-bench.mjs` und
 * `verify:fire-detail` rechnen sie Pixel für Pixel gegen die Fassung von vorher nach.
 */
export function wcMapBlock(
  grid: { lat: Float64Array; lon: Float64Array },
  nPix: number,
  slots: readonly WcSlot[],
  onNeed: (slot: number, idx: number) => void,
): { tileOf: Int32Array; pixOf: Int32Array } {
  const tileOf = new Int32Array(nPix);
  const pixOf = new Int32Array(nPix);
  tileOf.fill(-1);
  const nSlots = slots.length;

  // Slot-Felder als typisierte Spalten statt als Objektfelder: die Schleife liest sonst je
  // Pixel aus einem Array gemischter Formen (`fac === 0` neben echten Ebenen) — gemessen der
  // teuerste verbliebene Posten nach dem Wegfall der Strings.
  const sCode = new Int32Array(nSlots);
  const sFac = new Float64Array(nSlots);
  const sW = new Int32Array(nSlots);
  const sH = new Int32Array(nSlots);
  const sTw = new Int32Array(nSlots);
  const sTh = new Int32Array(nSlots);
  const sAcross = new Int32Array(nSlots);
  const sSeenAt = new Int32Array(nSlots);
  let seenLen = 0;
  for (let i = 0; i < nSlots; i++) {
    const s = slots[i];
    sCode[i] = s.code; sFac[i] = s.fac; sW[i] = s.width; sH[i] = s.height;
    sTw[i] = s.tileW; sTh[i] = s.tileH; sAcross[i] = s.tilesAcross;
    sSeenAt[i] = seenLen;
    seenLen += s.fac > 0 ? s.tilesAcross * Math.ceil(s.height / s.tileH) : 0;
  }
  // EIN flacher Merker über alle Slots — ersetzt den `Set<string>` von vorher.
  const seen = new Uint8Array(seenLen);

  const lats = grid.lat;
  const lons = grid.lon;
  const MAX = WC_TILE_PX - 1;

  // Die 3°-Kachel wechselt nur an ihren Grenzen — im Normalfall gar nicht. Deshalb bleiben die
  // Felder der aktuellen Kachel in lokalen Variablen und werden NUR beim Wechsel nachgeladen;
  // das erspart je Pixel sieben indizierte Lasten, ohne den Rumpf zu verdoppeln (E5).
  let curCode = -1, slot = -1;
  let fac = 0, sw = 0, sh = 0, tw = 1, th = 1, across = 1, seenAt = 0;

  for (let k = 0; k < nPix; k++) {
    const lat = lats[k];
    const lon = lons[k];
    const laI = Math.floor(lat / WC_TILE_DEG);
    const loI = Math.floor(lon / WC_TILE_DEG);
    const code = ((laI + 30) << WC_CODE_SHIFT) + (loI + 60);
    if (code !== curCode) {
      curCode = code;
      // Höchstens vier Kacheln ⇒ ein bis vier int-Vergleiche (vorher: `indexOf` über Strings).
      slot = -1;
      for (let i = 0; i < nSlots; i++) if (sCode[i] === code) { slot = i; break; }
      if (slot >= 0) {
        fac = sFac[slot]; sw = sW[slot]; sh = sH[slot];
        tw = sTw[slot]; th = sTh[slot]; across = sAcross[slot]; seenAt = sSeenAt[slot];
      } else { fac = 0; }
    }
    if (slot < 0 || fac === 0) continue;

    // Vollauflösungs-Pixel in der Kachel — wortgleich zu `wcLocate`, nur ohne Objekt.
    const lo0 = loI * WC_TILE_DEG;
    const la0 = laI * WC_TILE_DEG;
    const cx = Math.min(MAX, Math.max(0, Math.floor((lon - lo0) / WC_PX_DEG)));
    const cy = Math.min(MAX, Math.max(0, Math.floor((la0 + WC_TILE_DEG - lat) / WC_PX_DEG)));

    const px = Math.min(sw - 1, Math.floor(cx / fac));
    const py = Math.min(sh - 1, Math.floor(cy / fac));
    const col = Math.floor(px / tw);
    const row = Math.floor(py / th);
    const idx = row * across + col;

    const at = seenAt + idx;
    if (seen[at] === 0) { seen[at] = 1; onNeed(slot, idx); }
    tileOf[k] = slot * (1 << WC_SLOT_SHIFT) + idx;
    pixOf[k] = (py - row * th) * tw + (px - col * tw);
  }
  return { tileOf, pixOf };
}

// --- Header- und Kachel-Caches (Sitzung, fehlertolerant) ---------------------------------------

const _wcHeaders = new Map<string, Promise<readonly CogIfd[] | null>>();
const _wcTiles = new Map<string, Promise<Uint8Array | null>>();
const WC_TILE_CACHE_MAX = 16;

/** Datei-URL je Transportweg — die EINE Stelle, an der PC- und Spiegel-Pfad auseinandergehen. */
function wcFileUrl(name: string, src: WcSrc): string {
  return src.via === 'pc' ? `${wcMapUrl(name)}?${src.token}` : wcMirrorUrl(name);
}

/** Range-Abruf mit Latch-Buchführung: nur ein GEWORFENER fetch (Netz/Timeout) zählt als harter
 *  Fehler des Wegs — eine Antwort (`!r.ok`, z. B. der Nordsee-404) ist keine Störung. */
async function wcFetchRange(name: string, src: WcSrc, range: string): Promise<ArrayBuffer | null> {
  let r: Response;
  let buf: ArrayBuffer;
  try {
    r = await fetch(wcFileUrl(name, src), { headers: { range } });
    if (!r.ok) return null;
    buf = await r.arrayBuffer();
  } catch (e) {
    if (src.via === 'pc') notePcFailure(); else noteMirrorFailure();
    throw e; // der Aufrufer bleibt catch ⇒ null (E2)
  }
  return buf;
}

function wcIfds(name: string, src: WcSrc, onHeaderBytes: (n: number) => void): Promise<readonly CogIfd[] | null> {
  const key = `${src.via}|${name}`;
  const hit = _wcHeaders.get(key);
  if (hit) return hit;
  const p = (async (): Promise<readonly CogIfd[] | null> => {
    // Gemessen brauchen die IFDs 18 828 B (16 KB ⇒ needMoreBytes) — direkt der Retry-Puffer.
    const buf = await wcFetchRange(name, src, `bytes=0-${COG_HEADER_RETRY_BYTES - 1}`);
    if (!buf) return null;
    onHeaderBytes(Math.min(buf.byteLength, COG_HEADER_RETRY_BYTES));
    const parsed = parseCogIfds(buf);
    return parsed.kind === 'ok' ? parsed.ifds : null;
  })().catch(() => null);
  p.then((v) => { if (v == null) _wcHeaders.delete(key); }, () => _wcHeaders.delete(key));
  _wcHeaders.set(key, p);
  return p;
}

function loadWcTile(
  name: string, src: WcSrc, ifd: CogIfd, idx: number, onBytes: (n: number) => void,
): Promise<Uint8Array | null> {
  const key = `${src.via}|${name}|${ifd.width}|${idx}`;
  const hit = _wcTiles.get(key);
  if (hit) return hit;
  const p = (async (): Promise<Uint8Array | null> => {
    const offset = ifd.tileOffsets[idx];
    const byteCount = ifd.tileByteCounts[idx];
    if (!(byteCount > 0)) return null;
    const buf = await wcFetchRange(name, src, `bytes=${offset}-${offset + byteCount - 1}`);
    if (!buf) return null;
    // Härtung: antwortet ein Edge 200 (ganze Datei) statt 206, den Ausschnitt selbst schneiden —
    // sonst würfe `decodeTile` und die Dämpfung fiele still, ohne dass der Weg gestört ist.
    let bytes = new Uint8Array(buf);
    if (bytes.length > byteCount) bytes = bytes.slice(offset, offset + byteCount);
    const out = await decodeTile(bytes, ifd);
    onBytes(byteCount);
    return out;
  })().catch(() => null);
  p.then((v) => { if (v == null) _wcTiles.delete(key); }, () => _wcTiles.delete(key));
  if (_wcTiles.size >= WC_TILE_CACHE_MAX) {
    const oldKey = _wcTiles.keys().next().value as string;
    _wcTiles.delete(oldKey);
  }
  _wcTiles.set(key, p);
  return p;
}

// --- Sampler -----------------------------------------------------------------------------------

/**
 * Klassen je Pixel eines UTM-Blocks (Zeilen von NW, `0` = unbekannt/Ausfall).
 * `stepM` ist zugleich die Zielauflösung der Ebenenwahl.
 */
export type WcSampler = (
  epsg: number, e0: number, n0: number, stepM: number, outW: number, outH: number,
  onBytes: (n: number) => void,
) => Promise<Uint8Array | null>;

/**
 * Verfügbarkeitsprobe + Sampler: Token und die Kachel des Brandpunkts müssen lesbar sein —
 * sonst `null`, und der Aufrufer läuft ohne Dämpfung weiter (Satz sagt es).
 */
export async function prepareWcSampler(
  lat: number, lon: number, onHeaderBytes: (n: number) => void,
): Promise<WcSampler | null> {
  // Verfügbarkeitsprobe mit Wegwahl (V-SAT-15): max. 3 Runden — ein harter PC-Fehler zählt in
  // den Latch und die nächste Runde probiert ggf. den Spiegel; eine DEFINITIVE Antwort
  // (z. B. 404 außerhalb der Abdeckung) bricht sofort ab, denn ein Wegwechsel hilft dort nicht.
  const probeName = wcTileName(lat, lon);
  let ifds: readonly CogIfd[] | null = null;
  for (let round = 0; round < 3 && (!ifds || ifds.length === 0); round++) {
    const probeSrc = await wcSource();
    if (!probeSrc) return null;
    const before = wcFailCount();
    ifds = await wcIfds(probeName, probeSrc, onHeaderBytes);
    if ((!ifds || ifds.length === 0) && wcFailCount() === before) return null;
  }
  if (!ifds || ifds.length === 0) return null;

  return async (epsg, e0, n0, stepM, outW, outH, onBytes) => {
    try {
      // Je Aufruf durch die Wegwahl — ein Latch-Kipp mitten in der Sitzung (Token-Ablauf +
      // PC weg) wandert damit transparent auf den Spiegel.
      const src = await wcSource();
      if (!src) return null;
      const grid = wcGeoGrid(epsg, e0, n0, stepM, outW, outH);
      if (!grid) return null;
      // Kachelnamen: die 3°-Grenzen sind lat/lon-parallel — die vier Blockecken sehen jede
      // geschnittene Kachel (31UGS schneidet die 51°-Grenze wirklich, §12.3). Es sind höchstens
      // vier; nur HIER entstehen Namen (für die URL), nicht mehr je Pixel (V-SAT-16).
      const nPix = outW * outH;
      const cornerIdx = [0, outW - 1, (outH - 1) * outW, nPix - 1];
      const codes = [...new Set(cornerIdx.map((k) => wcTileCode(grid.lat[k], grid.lon[k])))];
      const names = codes.map(wcNameFromCode);
      const ifdOf: (CogIfd | null)[] = codes.map(() => null);
      await Promise.all(codes.map(async (_code, i) => {
        const list = await wcIfds(names[i], src, onHeaderBytes);
        if (!list || list.length === 0) return;
        ifdOf[i] = pickLevel(list, stepM, WC_M_PER_PX).ifd;
      }));
      const slots: WcSlot[] = codes.map((code, i) => {
        const ifd = ifdOf[i];
        return ifd
          ? { code, fac: WC_TILE_PX / ifd.width, width: ifd.width, height: ifd.height,
              tileW: ifd.tileW, tileH: ifd.tileH, tilesAcross: ifd.tilesAcross }
          : { code, fac: 0, width: 0, height: 0, tileW: 1, tileH: 1, tilesAcross: 1 };
      });

      // Zuordnung je Pixel; jede gebrauchte Kachel wird beim ersten Treffer angefordert, der
      // Abruf läuft also wie bisher schon neben der Schleife.
      const pending: (Promise<Uint8Array | null> | undefined)[][] = slots.map(() => []);
      const { tileOf, pixOf } = wcMapBlock(grid, nPix, slots, (slot, idx) => {
        pending[slot][idx] = loadWcTile(names[slot], src, ifdOf[slot]!, idx, onBytes);
      });

      const decoded: (Uint8Array | null)[][] = slots.map(() => []);
      for (let s = 0; s < slots.length; s++) {
        for (let i = 0; i < pending[s].length; i++) {
          const p = pending[s][i];
          if (p) decoded[s][i] = await p;
        }
      }
      const cls = new Uint8Array(nPix);
      const MASK = (1 << WC_SLOT_SHIFT) - 1;
      for (let k = 0; k < nPix; k++) {
        const t = tileOf[k];
        if (t < 0) continue;
        const dec = decoded[t >> WC_SLOT_SHIFT][t & MASK];
        if (dec) cls[k] = dec[pixOf[k]];
      }
      return cls;
    } catch {
      return null;
    }
  };
}

// --- Selbstverifikation ------------------------------------------------------------------------

export interface WcCheck { name: string; ok: boolean; detail?: string }

export function verifyWorldCover(): { checks: WcCheck[]; passed: number; total: number } {
  const checks: WcCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  add('wcTileName: Hürtgenwald 50,7N/6,35E liegt in N48E006', wcTileName(50.7, 6.35) === 'N48E006');
  add('wcTileName: 51,0N exakt gehört zur N51-Kachel (Grenzregel)', wcTileName(51, 6.35) === 'N51E006');
  add('wcTileName: Südwest-Halbkugel mit Floor Richtung Süd/West', wcTileName(-1.2, -3.5) === 'S03W006');
  add('wcMapUrl: Blob-Pfad trägt v200/2021 + Namen + _Map.tif',
    wcMapUrl('N48E006') === `${'https://ai4edataeuwest.blob.core.windows.net/esa-worldcover/v200/2021/map/'}ESA_WorldCover_10m_2021_v200_N48E006_Map.tif`);

  {
    const l = wcLocate(50.7, 6.35);
    add('wcLocate: Brandpunkt fällt auf Pixel ~4200/3600 der N48E006',
      l.name === 'N48E006' && Math.abs(l.x - 4200) <= 1 && Math.abs(l.y - 3600) <= 1, `${l.x}/${l.y}`);
    const b = wcLocate(51, 6);
    add('wcLocate: die 51°-Grenze landet in der untersten Zeile der N51-Kachel',
      b.name === 'N51E006' && b.y === WC_TILE_PX - 1, `${b.name} y=${b.y}`);
  }

  {
    // Stützgitter gegen die exakte Inverse: 31UGS-Block, Fehler in Metern.
    const e0 = 732_000, n0 = 5_618_000, stepM = 20, W = 64, H = 64;
    const g = wcGeoGrid(32631, e0, n0, stepM, W, H);
    let maxM = Infinity;
    if (g) {
      maxM = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const exact = utmInv(e0 + (x + 0.5) * stepM, n0 - (y + 0.5) * stepM, 32631);
        if (!exact) { maxM = Infinity; break; }
        const k = y * W + x;
        const dy = (g.lat[k] - exact.lat) * 111_320;
        const dx = (g.lon[k] - exact.lon) * 111_320 * Math.cos((exact.lat * Math.PI) / 180);
        maxM = Math.max(maxM, Math.hypot(dx, dy));
      }
    }
    add('wcGeoGrid: bilineare Interpolation ≤ 0,5 m gegen die exakte Inverse',
      maxM <= 0.5, `${maxM.toFixed(3)} m`);
  }

  {
    // Ebenenwahl an der echten Pyramide: 20-m-Anzeige nimmt die 18,5-m-Ebene usw.
    const mk = (width: number): CogIfd => ({
      width, height: width, tileW: 1024, tileH: 1024, samplesPerPixel: 1, bitsPerSample: 8,
      littleEndian: true, compression: 8, predictor: 1,
      tilesAcross: Math.ceil(width / 1024), tilesDown: Math.ceil(width / 1024),
      tileOffsets: [], tileByteCounts: [],
    });
    const ifds = [36000, 18000, 9000, 4500, 2250, 1125, 562].map(mk);
    const w = (target: number) => pickLevel(ifds, target, WC_M_PER_PX).ifd.width;
    add('pickLevel: dNBR-Ebenen 20/40/80/160 m paaren auf 18000/9000/4500/2250',
      w(20) === 18000 && w(40) === 9000 && w(80) === 4500 && w(160) === 2250,
      `${w(20)}/${w(40)}/${w(80)}/${w(160)}`);
  }

  add('wcEnabled: Query schlägt Speicher in beide Richtungen',
    !wcEnabled('?wc=0', '1') && wcEnabled('?wc=1', '0') && !wcEnabled('', '0') && wcEnabled('', null));

  // --- V-SAT-15: Spiegel als benannter Ersatzweg -----------------------------------------------

  add('Spiegel-URL: Commit-SHA-Pin (40 hex, nie @main) + map/<name>.tif',
    /^https:\/\/cdn\.jsdelivr\.net\/gh\/jppetry\/buscosun-worldcover@[0-9a-f]{40}\/map\/$/.test(WC_MIRROR_BASE)
    && wcMirrorUrl('N48E006') === `${WC_MIRROR_BASE}N48E006.tif`
    && !WC_MIRROR_BASE.includes('@main'));

  add('wcMirrorFlag: Query schlägt Speicher in beide Richtungen, sonst auto',
    wcMirrorFlag('?wcm=1', '0') === 'force' && wcMirrorFlag('?wcm=0', '1') === 'off'
    && wcMirrorFlag('', '1') === 'force' && wcMirrorFlag('', '0') === 'off'
    && wcMirrorFlag('', null) === 'auto' && wcMirrorFlag('?foo=1', null) === 'auto');

  {
    _resetWc();
    const start = pcUsable() && mirrorUsable() && wcVia() === null;
    notePcFailure();
    const one = pcUsable(); // 1 < 2 — PC bleibt im Rennen
    notePcFailure();
    const latched = !pcUsable() && mirrorUsable(); // 2 harte Fehler ⇒ PC-Latch, Spiegel offen
    noteMirrorFailure();
    noteMirrorFailure();
    const allOut = !pcUsable() && !mirrorUsable(); // beide Wege zu ⇒ Dämpfung aus (heutiges Verhalten)
    _resetWc();
    add('Latch: 2 harte Fehler je Weg (RD2-Muster), _resetWc stellt zurück',
      start && one && latched && allOut && pcUsable() && mirrorUsable());
  }

  {
    // Der Spiegel trägt EINE Ebene (9000 px ≈ 37 m) — pickLevel muss mit der Ein-IFD-Liste
    // für alle dNBR-Anzeigeebenen dieselbe Ebene liefern (der Sampler rechnet `fac` selbst).
    const lone: CogIfd = {
      width: WC_MIRROR_LEVEL_PX, height: WC_MIRROR_LEVEL_PX, tileW: 1024, tileH: 1024,
      samplesPerPixel: 1, bitsPerSample: 8, littleEndian: true, compression: 8, predictor: 1,
      tilesAcross: 9, tilesDown: 9, tileOffsets: [], tileByteCounts: [],
    };
    add('pickLevel: Ein-IFD-Spiegel bedient die Ziele 20/40/80/160 m',
      [20, 40, 80, 160].every((t) => pickLevel([lone], t, WC_M_PER_PX).ifd.width === WC_MIRROR_LEVEL_PX));
  }

  {
    _resetWc();
    _via = 'mirror';
    const reports = wcVia() === 'mirror';
    _resetWc();
    add('wcVia meldet den aufgelösten Weg (Viewer-Satz „Spiegel, 37 m")', reports && wcVia() === null);
  }

  // --- V-SAT-16: Ganzzahl-Kachelcode + Pixel-Zuordnung -----------------------------------------

  {
    // Bijektion Code ↔ Name über das ganze WorldCover-Raster (60 Zeilen × 120 Spalten).
    let bij = true;
    const seenCodes = new Set<number>();
    for (let la = -87; la <= 87 && bij; la += 3) {
      for (let lo = -180; lo < 180 && bij; lo += 3) {
        const lat = la + 1.5, lon = lo + 1.5;
        const code = wcTileCode(lat, lon);
        if (seenCodes.has(code)) bij = false; // Kollision zweier Kacheln = stille Fehlzuordnung
        seenCodes.add(code);
        if (wcNameFromCode(code) !== wcTileName(lat, lon)) bij = false;
      }
    }
    add('wcTileCode: kollisionsfreie Bijektion zum Namen über das ganze 3°-Raster',
      bij && seenCodes.size === 59 * 120, `${seenCodes.size} Codes`);
  }

  add('wcTileCode: Grenzfälle wie wcTileName (51°-Kante, Südwest-Halbkugel)',
    wcNameFromCode(wcTileCode(51, 6.35)) === 'N51E006'
    && wcNameFromCode(wcTileCode(50.7, 6.35)) === 'N48E006'
    && wcNameFromCode(wcTileCode(-1.2, -3.5)) === 'S03W006');

  {
    // Zuordnung gegen die Fassung VOR V-SAT-16 (Strings + indexOf + Template-Schlüssel),
    // hier als Orakel nachgebaut: jedes Pixel muss dieselbe Kachel und denselben Index bekommen.
    const W = 96, H = 96, stepM = 300;
    // Block ÜBER der 51°-Grenze: er muss wirklich zwei Kacheln schneiden, sonst prüft der
    // Vergleich den Mehr-Kachel-Fall nicht (genau das ist beim ersten Anlauf passiert).
    const g = wcGeoGrid(32631, 732_000, 5_660_000, stepM, W, H);
    let same = false, needOk = false;
    if (g) {
      const nPix = W * H;
      const corner = [0, W - 1, (H - 1) * W, nPix - 1];
      const codes = [...new Set(corner.map((k) => wcTileCode(g.lat[k], g.lon[k])))];
      const names = codes.map(wcNameFromCode);
      const ifd: CogIfd = {
        width: 9000, height: 9000, tileW: 1024, tileH: 1024, samplesPerPixel: 1, bitsPerSample: 8,
        littleEndian: true, compression: 8, predictor: 1, tilesAcross: 9, tilesDown: 9,
        tileOffsets: [], tileByteCounts: [],
      };
      const fac = WC_TILE_PX / ifd.width;
      const refTile = new Int32Array(nPix).fill(-1);
      const refPix = new Int32Array(nPix);
      const refNeed: string[] = [];
      const refSeen = new Set<string>();
      for (let k = 0; k < nPix; k++) {
        const loc = wcLocate(g.lat[k], g.lon[k]);
        const si = names.indexOf(loc.name);
        if (si < 0) continue;
        const x = Math.min(ifd.width - 1, Math.floor(loc.x / fac));
        const y = Math.min(ifd.height - 1, Math.floor(loc.y / fac));
        const col = Math.floor(x / ifd.tileW);
        const row = Math.floor(y / ifd.tileH);
        const idx = row * ifd.tilesAcross + col;
        const key = `${loc.name}|${idx}`;
        if (!refSeen.has(key)) { refSeen.add(key); refNeed.push(`${si}:${idx}`); }
        refTile[k] = si * (1 << WC_SLOT_SHIFT) + idx;
        refPix[k] = (y - row * ifd.tileH) * ifd.tileW + (x - col * ifd.tileW);
      }
      const slots: WcSlot[] = codes.map((code) => ({
        code, fac, width: ifd.width, height: ifd.height,
        tileW: ifd.tileW, tileH: ifd.tileH, tilesAcross: ifd.tilesAcross,
      }));
      const gotNeed: string[] = [];
      const got = wcMapBlock(g, nPix, slots, (s, i) => gotNeed.push(`${s}:${i}`));
      same = names.length === 2; // der Block MUSS die 51°-Grenze schneiden, sonst prüft er nichts
      for (let k = 0; k < nPix && same; k++) {
        if (got.tileOf[k] !== refTile[k] || got.pixOf[k] !== refPix[k]) same = false;
      }
      needOk = gotNeed.join(',') === refNeed.join(',') && gotNeed.length === new Set(gotNeed).size;
    }
    add('wcMapBlock: Pixel für Pixel identisch zur Fassung vor V-SAT-16 (2 Kacheln)', same);
    add('wcMapBlock: jede gebrauchte Kachel wird genau einmal angefordert, in Trefferreihenfolge', needOk);
  }

  {
    // Fremde Kachel und Header-Ausfall bleiben „unbekannt" — nie eine falsche Klasse.
    const g = { lat: Float64Array.from([50.7, 50.7]), lon: Float64Array.from([6.35, 12.35]) };
    const base = {
      fac: 4, width: 9000, height: 9000, tileW: 1024, tileH: 1024, tilesAcross: 9,
    };
    const only = wcMapBlock(g, 2, [{ code: wcTileCode(50.7, 6.35), ...base }], () => {});
    const dead = wcMapBlock(g, 2, [{ code: wcTileCode(50.7, 6.35), ...base, fac: 0 }], () => {});
    add('wcMapBlock: Pixel ohne Kachel und Kachel ohne Ebene bleiben -1 (bleiben Klasse 0)',
      only.tileOf[0] >= 0 && only.tileOf[1] === -1 && dead.tileOf[0] === -1 && dead.tileOf[1] === -1,
      `${only.tileOf[0]}/${only.tileOf[1]} ${dead.tileOf[0]}/${dead.tileOf[1]}`);
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
