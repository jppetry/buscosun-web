/**
 * SAT2a/SAT2b — zoombarer 10-m-Viewer im Brand-Dossier (`audit/brandradar-satellitenbilder.md` §9/§10).
 *
 * Ein BILDbetrachter, keine zweite Karten-Instanz (BD2-Regel B2): Canvas 2D, Nord oben, keine
 * Basemap, kein WebGL (⇒ kein STOPP-&-FRAGEN-Fall). Er liest die Sentinel-2-Originale direkt
 * vom CORS-offenen AWS-Bucket über den handgeschriebenen COG-Leser — strikt on-demand: der
 * Chunk lädt erst mit dem Klick (NerdPanel-Muster), Kacheln erst, wenn sie sichtbar werden,
 * und die Statuszeile zählt die geladenen Bytes ehrlich mit.
 *
 * Drei Ansichten (SAT2b): Echtfarbe (TCI, 10 m), SWIR-Falschfarbe (B12/B8A/B04, 20 m —
 * verbrannte Flächen leuchten rot-orange) und „Verbrannt (dNBR)" — ein unkalibriertes Overlay
 * aus dem Vergleich mit der letzten wolkenarmen Vorher-Szene DESSELBEN Granulats (identisches
 * Pixelgitter, §10.1 (3)). Jede Lücke (kein Band, keine Vorher-Szene, fremdes Format) ist ein
 * BENANNTER Zustand mit dem Copernicus-Link als Ausweg — nie ein stilles Falschbild.
 *
 * SAT3 (§13): die FIRMS-Detektionen liegen als Pixelgrundflächen über jedem Modus (Rechteck =
 * scan × track, das Feuer liegt irgendwo darin; gestrichelt = Aufnahme erst NACH diesem Bild),
 * und im dNBR-Modus bekommt die zusammenhängende Narbe, die die Detektionen berührt, einen
 * hellen Umriss samt Hektarzahl — mit ihrer Auflösung im Satz, nie als „Brandfläche".
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  COG_HEADER_BYTES, COG_HEADER_RETRY_BYTES, decodeTile, decodeTileU16, estimateBytes,
  parseCogIfds, pickLevel, subTileU16, tilesFor, type CogIfd, type CogTileRef,
} from './detail/cogTiff';
import { dnbrTileRgba, swirTileRgba, DNBR_CLASSES } from './detail/burnIndex';
import { floodScar, scarHa, seedsFromRects, SCAR_MIN_CLASS, type ScarResult } from './detail/burnScar';
import { detectionPolysPx, type DetPoly } from './detail/satDetections';
import type { FirmsRow } from './sources/firmsHotspots';
import { fetchS2CogRef, fetchS2PreCogRef, type S2CogRef, type S2PreRef } from './detail/fireSatImagery';
import { pixelOf } from './detail/sentinelGeo';
import { prepareWcSampler, wcEnabled, wcVia, type WcSampler, type WcVia } from './detail/worldCover';

export interface CogViewerProps {
  lat: number;
  lon: number;
  dayIso: string;
  /**
   * UTC-Kalendertag des Brandbeginns (`null` = unbekannt). Der dNBR-Vergleich sucht seine
   * Vorher-Szene VOR diesem Tag — nicht vor dem Betrachtungstag: sonst verglich die Nachher-
   * Sicht gegen den Brandtag selbst (am Hürtgenwald live passiert, §10.3).
   */
  fireStartIso: string | null;
  /** Copernicus-Deep-Link als Ausweg im Fehlerfall (kommt vom Aufrufer, EINE URL-Stelle). */
  fallbackUrl: string;
  /**
   * SAT3: die FIRMS-Zeilen des Laufs (alle, nicht „die dieses Brands" — §13.2 (1)); `null` =
   * der Aufrufer hat keine (Historie-Ereignis). Die Narbe sät dann am Brandort.
   */
  detections?: readonly FirmsRow[] | null;
  onClose: () => void;
}

const FULL_M_PER_PX = 10;
/** Datenauflösung der SWIR/NIR-Bänder — die Modi SWIR und dNBR sagen sie in der Statuszeile. */
const BAND_M_PER_PX = 20;
/** Anzeige höchstens 2× über der Datenauflösung — dann Endanschlag, kein „unendlich". */
const MIN_M_PER_CSS_PX = FULL_M_PER_PX / 2;
const MAX_M_PER_CSS_PX = 250;
/** Startfenster um den Brand (halbe Kantenlänge) — dieselbe Größenordnung wie `snapshotBbox`. */
const START_HALF_M = 9_000;
/** SAT3: Detektionen bis so weit außerhalb der Szene werden projiziert (zwei Startfenster). */
const DET_MARGIN_PX = (2 * START_HALF_M) / FULL_M_PER_PX;
/**
 * Detektions-Rechtecke: helles Signal-Terracotta über dunklem Halo. Bewusst KEIN Deck-Token —
 * das matte `--terracotta-500` (#C97B47) war auf braun-grünem Gelände gemessen unsichtbar
 * (§13.5); ein Overlay auf einem Foto ist kein UI-Chrome und braucht Leuchtkraft. Der Wert MUSS
 * mit `.br-sat-det rect` in `fireDeck.css` übereinstimmen: dasselbe Rechteck in zwei Bildern.
 */
const DET_COLOR = '#FFB08A';
/** Füllung der Rechtecke — es ist eine FLÄCHE („das Feuer liegt irgendwo darin"), keine Linie. */
const DET_FILL = 'rgba(255, 176, 138, 0.28)';
/** „Danach": schwächer, aber NIE leer — der Rahmen muss in jedem Bild zu finden sein (§13.6). */
const DET_FILL_AFTER = 'rgba(255, 176, 138, 0.14)';
const DET_HALO = 'rgba(44, 42, 38, 0.85)';
/** Narben-Umriss: Creme wie Fadenkreuz und Maßstab — eine Farbe, die KEINE dNBR-Klasse trägt. */
const SCAR_COLOR = '#FDFBF4';
/** SAT3d Kill-Switch `?scar=0` (Rule 2, Muster `?sat10=0`): dNBR-Overlay wie vor SAT3, ohne Fill — auch der Kontrolllauf der Long-Task-Messung. */
function scarEnabled(): boolean {
  try { return new URLSearchParams(window.location.search).get('scar') !== '0'; } catch { return true; }
}
/**
 * Wartezeit, bis der Narben-Fill läuft (§13.4 (3)). Beim Zoomen kommen die Kacheln einzeln an, und
 * JEDE ändert den Fill-Schlüssel (`present`) — ohne Entprellung rechnete der Fill je Kachel einmal.
 * Gemessen brachte das 4 Tasks > 200 ms je Zoomfolge gegen 0–1 im Kontrolllauf `?scar=0`. Der
 * Auftrag wird deshalb bei jeder Änderung neu gestellt und der vorige verworfen: gerechnet wird
 * erst, wenn der Kachelsatz steht.
 */
const SCAR_SETTLE_MS = 400;

type CogMode = 'tci' | 'swir' | 'dnbr';
const MODE_LABEL: Record<CogMode, string> = { tci: 'Echtfarbe', swir: 'SWIR', dnbr: 'Verbrannt (dNBR)' };

// --- Kachel-Caches (Sitzung; Deckel geben ImageBitmaps wieder frei) ----------------------------

const _tiles = new Map<string, Promise<ImageBitmap>>();
const TILE_CACHE_MAX = 24;
/**
 * V-SAT-17: wie viele TEURE Kachelbauten ein Bild anstoßen darf. Der dNBR-Bau mit
 * Landbedeckungs-Dämpfung rechnet `wcGeoGrid` + `wcMapBlock` SYNCHRON beim Start (~37 ms je
 * 512²-Kachel, §12.9.1) — sechs davon in einem `draw()` ergaben EINEN Task von 237–245 ms.
 * Einer je Bild macht daraus sechs Scheiben, die meist nicht einmal Long Tasks sind. Der
 * Deckel gilt NUR dort: ohne Dämpfung kostet ein Start praktisch nichts (Kontrolllauf C).
 */
const WC_STARTS_PER_FRAME = 1;
/** Dekodierte uint16-Bandkacheln (SAT2b) — je 512² × 2 B ≈ 0,5 MB, Deckel hält ~16 MB. */
const _bandTiles = new Map<string, Promise<Uint16Array>>();
const BAND_CACHE_MAX = 32;
/** SAT2c: dekodierte SCL-Kacheln (uint8, 5–12 KB je Kachel) — eigener kleiner Deckel. */
const _sclTiles = new Map<string, Promise<Uint8Array>>();
const SCL_CACHE_MAX = 32;
/**
 * SAT3d: die Klasse je Pixel der dNBR-Kacheln (uint8, 256 KB je 512²) — unter DEMSELBEN Schlüssel
 * wie das Bitmap, synchron lesbar, damit der Narben-Fill im Draw ohne Promise auskommt.
 */
const _clsTiles = new Map<string, Uint8Array>();
const CLS_CACHE_MAX = 24;
function putCls(key: string, cls: Uint8Array): void {
  if (_clsTiles.size >= CLS_CACHE_MAX) _clsTiles.delete(_clsTiles.keys().next().value as string);
  _clsTiles.set(key, cls);
}
const MAX_IN_FLIGHT = 4;
let _inFlight = 0;
const _queue: Array<() => void> = [];

function withSlot<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      _inFlight++;
      job().then(resolve, reject).finally(() => {
        _inFlight--;
        _queue.shift()?.();
      });
    };
    if (_inFlight < MAX_IN_FLIGHT) run(); else _queue.push(run);
  });
}

function putBitmap(key: string, p: Promise<ImageBitmap>): Promise<ImageBitmap> {
  p.catch(() => _tiles.delete(key)); // Ausfall nicht merken — der nächste Blick versucht es neu
  if (_tiles.size >= TILE_CACHE_MAX) {
    const [oldKey, oldP] = _tiles.entries().next().value as [string, Promise<ImageBitmap>];
    _tiles.delete(oldKey);
    void oldP.then((b) => b.close(), () => undefined);
  }
  _tiles.set(key, p);
  return p;
}

async function fetchRange(href: string, offset: number, byteCount: number): Promise<Uint8Array> {
  const r = await fetch(href, { headers: { Range: `bytes=${offset}-${offset + byteCount - 1}` } });
  if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

function loadTile(
  href: string, levelKey: string, ifd: CogIfd, idx: number, offset: number, byteCount: number,
  onBytes: (n: number) => void,
): Promise<ImageBitmap> {
  const key = `${href}|${levelKey}|${idx}`;
  const hit = _tiles.get(key);
  if (hit) return hit;
  return putBitmap(key, withSlot(async () => {
    const raw = await decodeTile(await fetchRange(href, offset, byteCount), ifd);
    onBytes(byteCount);
    const img = new ImageData(ifd.tileW, ifd.tileH);
    for (let i = 0, j = 0; i < raw.length; i += 3, j += 4) {
      img.data[j] = raw[i]; img.data[j + 1] = raw[i + 1]; img.data[j + 2] = raw[i + 2]; img.data[j + 3] = 255;
    }
    return createImageBitmap(img);
  }));
}

/** Eine uint16-Bandkachel (B8A/B12/B04), dekodiert und gecacht — die Rohware für SWIR und dNBR. */
function loadBandTile(
  href: string, ifd: CogIfd, idx: number, onBytes: (n: number) => void,
): Promise<Uint16Array> {
  const key = `${href}|${ifd.width}/${ifd.tileW}|${idx}`;
  const hit = _bandTiles.get(key);
  if (hit) return hit;
  const offset = ifd.tileOffsets[idx];
  const byteCount = ifd.tileByteCounts[idx];
  const p = withSlot(async () => {
    const out = await decodeTileU16(await fetchRange(href, offset, byteCount), ifd);
    onBytes(byteCount);
    return out;
  });
  p.catch(() => _bandTiles.delete(key));
  if (_bandTiles.size >= BAND_CACHE_MAX) {
    const oldKey = _bandTiles.keys().next().value as string;
    _bandTiles.delete(oldKey);
  }
  _bandTiles.set(key, p);
  return p;
}

/** Eine SCL-Kachel (uint8, 1 Kanal — der vorhandene `decodeTile`-Pfad liest sie unverändert). */
function loadSclTile(
  href: string, ifd: CogIfd, idx: number, onBytes: (n: number) => void,
): Promise<Uint8Array> {
  const key = `${href}|${ifd.width}/${ifd.tileW}|${idx}`;
  const hit = _sclTiles.get(key);
  if (hit) return hit;
  const offset = ifd.tileOffsets[idx];
  const byteCount = ifd.tileByteCounts[idx];
  const p = withSlot(async () => {
    const out = await decodeTile(await fetchRange(href, offset, byteCount), ifd);
    onBytes(byteCount);
    return out;
  });
  p.catch(() => _sclTiles.delete(key));
  if (_sclTiles.size >= SCL_CACHE_MAX) {
    const oldKey = _sclTiles.keys().next().value as string;
    _sclTiles.delete(oldKey);
  }
  _sclTiles.set(key, p);
  return p;
}

// --- SAT2b: Ebenen-Paarung der Bänder (§10.1 (4)) ----------------------------------------------

export interface SwirLevel { s12: CogIfd; n8a: CogIfd; r04: CogIfd }
export interface DnbrLevel {
  postN: CogIfd; postS: CogIfd; preN: CogIfd; preS: CogIfd;
  /** SAT2c: SCL-Ebenen — `null`, wenn das Band fehlt oder das Gitter nicht passt (Maske entfällt). */
  postScl: CogIfd | null; preScl: CogIfd | null;
}

/**
 * Die Kachelgitter decken sich nur ebenenweise: B8A/B12 sind strukturgleich, B04 nutzt unterhalb
 * der 5490er-Ebene 512er- statt 256er-Kacheln — zulässig ist eine Ebene nur, wenn die Breiten
 * gleich sind und die B04-Kachelbreite die Ausgabe-Kachelbreite TEILT (dann liegt jede
 * Ausgabe-Kachel vollständig in EINER B04-Kachel). Alles andere fällt still heraus — der
 * Viewer arbeitet dann mit den Ebenen, die es sauber gibt.
 */
export function pairSwirLevels(s12: readonly CogIfd[], n8a: readonly CogIfd[], r04: readonly CogIfd[]): SwirLevel[] {
  const out: SwirLevel[] = [];
  for (const a of s12) {
    const b = n8a.find((x) => x.width === a.width && x.tileW === a.tileW && x.tileH === a.tileH);
    const c = r04.find((x) => x.width === a.width && x.tileW % a.tileW === 0 && x.tileH % a.tileH === 0);
    if (b && c) out.push({ s12: a, n8a: b, r04: c });
  }
  return out;
}

export function pairDnbrLevels(
  postN: readonly CogIfd[], postS: readonly CogIfd[], preN: readonly CogIfd[], preS: readonly CogIfd[],
  postScl?: readonly CogIfd[] | null, preScl?: readonly CogIfd[] | null,
): DnbrLevel[] {
  const out: DnbrLevel[] = [];
  for (const a of postS) {
    const same = (list: readonly CogIfd[]) =>
      list.find((x) => x.width === a.width && x.tileW === a.tileW && x.tileH === a.tileH);
    const b = same(postN);
    const c = same(preN);
    const d = same(preS);
    // SCL ist deckungsgleich zu B8A/B12 (§11.1 (1)); passt es auf einer Ebene nicht, entfällt
    // dort nur die MASKE, nie das Overlay.
    if (b && c && d) out.push({ postN: b, postS: a, preN: c, preS: d, postScl: (postScl && same(postScl)) ?? null, preScl: (preScl && same(preScl)) ?? null });
  }
  return out;
}

/** Der B04-Ausschnitt zur Ausgabe-Kachel: die eine deckende Quellkachel + Integer-Offset. */
async function bandSubTile(
  href: string, srcIfd: CogIfd, outIfd: CogIfd, t: CogTileRef, onBytes: (n: number) => void,
): Promise<Uint16Array> {
  if (srcIfd.tileW === outIfd.tileW && srcIfd.tileH === outIfd.tileH) {
    return loadBandTile(href, srcIfd, t.idx, onBytes);
  }
  const col = Math.floor((t.col * outIfd.tileW) / srcIfd.tileW);
  const row = Math.floor((t.row * outIfd.tileH) / srcIfd.tileH);
  const src = await loadBandTile(href, srcIfd, row * srcIfd.tilesAcross + col, onBytes);
  return subTileU16(
    src, srcIfd.tileW,
    t.col * outIfd.tileW - col * srcIfd.tileW, t.row * outIfd.tileH - row * srcIfd.tileH,
    outIfd.tileW, outIfd.tileH,
  );
}

function loadSwirTile(
  bands: NonNullable<S2CogRef['bands']>, lv: SwirLevel, t: CogTileRef, onBytes: (n: number) => void,
): Promise<ImageBitmap> {
  const key = `swir|${bands.swir22}|${lv.s12.width}|${t.idx}`;
  const hit = _tiles.get(key);
  if (hit) return hit;
  return putBitmap(key, (async () => {
    const [s12, n8a, r04] = await Promise.all([
      loadBandTile(bands.swir22, lv.s12, t.idx, onBytes),
      loadBandTile(bands.nir08, lv.n8a, t.idx, onBytes),
      bandSubTile(bands.red, lv.r04, lv.s12, t, onBytes),
    ]);
    const rgba = swirTileRgba(s12, n8a, r04, bands);
    return createImageBitmap(new ImageData(rgba, lv.s12.tileW, lv.s12.tileH));
  })());
}

/** SAT2d: Landbedeckungs-Sampler + UTM-Lage der Kachel — `null` heißt „ohne Dämpfung". */
export interface WcTileArgs { wc: WcSampler; via: WcVia | null; epsg: number; e0: number; n0: number; stepM: number }

/** V-SAT-15: der Kachel-Schlüssel trägt den Transportweg — ein Latch-Kipp mitten in der
 *  Sitzung mischt so nie 10-m- (PC) und 37-m-gedämpfte (Spiegel) Kacheln unter einem Schlüssel. */
function wcKeySuffix(on: boolean): string {
  return on ? (wcVia() === 'mirror' ? '|wcm' : '|wc') : '';
}

function loadDnbrTile(
  post: NonNullable<S2CogRef['bands']>, pre: NonNullable<S2CogRef['bands']>,
  lv: DnbrLevel, t: CogTileRef, onBytes: (n: number) => void, wcArgs: WcTileArgs | null,
): Promise<ImageBitmap> {
  // Der Schlüssel trägt die Dämpfungs-Lage mit — sonst mischte ein früher Fehlversuch
  // ungedämpfte Kacheln unter gedämpfte derselben Sitzung (§12.3).
  const key = `dnbr|${post.swir22}|${pre.swir22}|${lv.postS.width}|${t.idx}${wcArgs ? (wcArgs.via === 'mirror' ? '|wcm' : '|wc') : ''}`;
  const hit = _tiles.get(key);
  if (hit) return hit;
  return putBitmap(key, (async () => {
    // SAT2c: die SCL-Maske ist ein Zusatz — ihr Ausfall (Netz, Gitter) bricht das Overlay nie.
    const scl = (href: string | null, ifd: CogIfd | null): Promise<Uint8Array | null> =>
      href && ifd ? loadSclTile(href, ifd, t.idx, onBytes).catch(() => null) : Promise.resolve(null);
    const [postN, postS, preN, preS, postScl, preScl, wcCls] = await Promise.all([
      loadBandTile(post.nir08, lv.postN, t.idx, onBytes),
      loadBandTile(post.swir22, lv.postS, t.idx, onBytes),
      loadBandTile(pre.nir08, lv.preN, t.idx, onBytes),
      loadBandTile(pre.swir22, lv.preS, t.idx, onBytes),
      scl(post.scl, lv.postScl),
      scl(pre.scl, lv.preScl),
      // SAT2d: die Landbedeckung ist derselbe Vertrag — Ausfall nimmt nur die Dämpfung.
      wcArgs
        ? wcArgs.wc(wcArgs.epsg, wcArgs.e0, wcArgs.n0, wcArgs.stepM, lv.postS.tileW, lv.postS.tileH, onBytes).catch(() => null)
        : Promise.resolve(null),
    ]);
    // SAT3d: die Klassenkachel entsteht in derselben Schleife und bleibt für den Narben-Fill.
    const cls = new Uint8Array(lv.postS.tileW * lv.postS.tileH);
    const rgba = dnbrTileRgba(preN, preS, postN, postS, pre, post, preScl, postScl, wcCls, cls);
    putCls(key, cls);
    return createImageBitmap(new ImageData(rgba, lv.postS.tileW, lv.postS.tileH));
  })());
}

// --- Maßstabsbalken ---------------------------------------------------------------------------

const SCALE_STEPS_M = [100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000];

export function scaleBar(mPerCssPx: number): { widthPx: number; label: string } {
  const target = 120 * mPerCssPx;
  const m = SCALE_STEPS_M.find((s) => s >= target) ?? SCALE_STEPS_M[SCALE_STEPS_M.length - 1];
  return { widthPx: m / mPerCssPx, label: m >= 1000 ? `${m / 1000} km` : `${m} m` };
}

// --- Header laden (iterativ, needMoreBytes ist ein Vertrag, kein Fehler) -----------------------

const _headers = new Map<string, Promise<CogIfd[]>>();

function fetchIfds(href: string, onBytes: (n: number) => void): Promise<CogIfd[]> {
  const hit = _headers.get(href);
  if (hit) return hit;
  const p = (async () => {
    let end = COG_HEADER_BYTES;
    for (let i = 0; i < 3; i++) {
      const r = await fetch(href, { headers: { Range: `bytes=0-${end - 1}` } });
      if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`);
      onBytes(end);
      const parsed = parseCogIfds(await r.arrayBuffer());
      if (parsed.kind === 'ok') return parsed.ifds;
      if (parsed.kind === 'unsupported') throw new Error(`cog-unsupported: ${parsed.reason}`);
      end = Math.max(parsed.upTo, COG_HEADER_RETRY_BYTES);
    }
    throw new Error('cog-unsupported: Header konvergiert nicht');
  })();
  p.catch(() => _headers.delete(href));
  _headers.set(href, p);
  return p;
}

// --- Viewer -----------------------------------------------------------------------------------

type Phase =
  | { kind: 'loading'; word: string }
  | { kind: 'ready' }
  | { kind: 'error'; reason: string };

/** Zustand der SAT2b-Zusatzdaten je Modus — jede Lücke ein benannter Satz, kein leeres Bild. */
type ExtraState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'absent'; sentence: string }
  | { kind: 'error'; sentence: string };

/** SAT3d: was der Satz unter dem Bild über die Narbe sagt — aus dem Draw, mit Gleichheitswächter. */
interface ScarNote {
  ha: number;
  stepM: number;
  /** Kacheln der Sicht fehlen noch — die Zahl ist eine Untergrenze. */
  partial: boolean;
  /** Die Narbe berührt den Rand der geladenen Sicht — reicht wahrscheinlich darüber hinaus. */
  edge: boolean;
  /** Saat waren die Detektions-Rechtecke oder (ohne Zeilen) der Brandort. */
  seed: 'det' | 'point';
  /** Kein Saatpixel hatte Narbenklasse — an den Detektionen gibt es keine zusammenhängende Fläche. */
  none: boolean;
}

export default function FireCogViewer({ lat, lon, dayIso, fireStartIso, fallbackUrl, detections = null, onClose }: CogViewerProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading', word: 'Szene wird gesucht …' });
  const [full, setFull] = useState(false);
  const [mode, setMode] = useState<CogMode>('tci');
  const [swirState, setSwirState] = useState<ExtraState>({ kind: 'idle' });
  const [dnbrState, setDnbrState] = useState<ExtraState>({ kind: 'idle' });
  /** SAT2d: dämpft die Landbedeckung wirklich (Token + Kachel lesbar)? Steuert Satz + Chip. */
  const [wcOn, setWcOn] = useState(false);
  // V-SAT-15: der zuletzt aufgelöste Transportweg der Landbedeckung — der Satz sagt beim
  // Spiegel ehrlich „37 m statt 10 m" (aufgefrischt im Draw, damit ein Latch-Kipp sichtbar wird).
  const [wcSrcVia, setWcSrcVia] = useState<WcVia | null>(null);
  const [status, setStatus] = useState({ tiles: 0, mb: 0, mPerPx: 0, viewMpp: 0, edge: false });
  /** SAT3: Detektions-Rechtecke ein-/ausblenden (Sitzungszustand, default an). */
  const [showDet, setShowDet] = useState(true);
  const showDetRef = useRef(true);
  showDetRef.current = showDet;
  const [scar, setScar] = useState<ScarNote | null>(null);
  const detectionsRef = useRef(detections);
  detectionsRef.current = detections;

  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataRef = useRef<{
    ref: S2CogRef; ifds: CogIfd[]; fire: { px: number; py: number };
    swirLevels?: SwirLevel[];
    pre?: S2PreRef | null;
    dnbrLevels?: DnbrLevel[];
    /** SAT2c: läuft die SCL-Maske auf der Überblicks-Ebene? Steuert nur den Satz. */
    sclMask?: boolean;
    /** SAT2d: Landbedeckungs-Sampler — `null`/fehlend heißt „ohne Dämpfung" (Satz sagt es). */
    wc?: WcSampler | null;
    /** SAT3: Detektions-Rechtecke in Vollauflösungs-Pixeln des Granulats (leer ohne Zeilen). */
    det: DetPoly[];
  } | null>(null);
  /** SAT3d: der letzte Narben-Fill — Schlüssel = Ebene + Kachelmenge + Ladestand + Saat. */
  const scarRef = useRef<{
    key: string; result: ScarResult; gx0: number; gy0: number; gw: number; fac: number; stepM: number; partial: boolean;
  } | null>(null);
  /** Der Fill läuft in einem EIGENEN Task nach dem Draw (Muster V-SAT-17) — hier der ausstehende Aufruf. */
  const scarJobRef = useRef<{ key: string; id: number } | null>(null);
  // Sichtzustand: Zentrum in Vollauflösungs-Pixeln + Meter je CSS-Pixel.
  const viewRef = useRef({ cx: 0, cy: 0, mpp: 30 });
  const bytesRef = useRef({ tiles: 0, bytes: 0 });
  const rafRef = useRef(0);
  const modeRef = useRef<CogMode>('tci');
  modeRef.current = mode;

  const onBytes = (n: number) => {
    bytesRef.current = { tiles: bytesRef.current.tiles + 1, bytes: bytesRef.current.bytes + n };
  };
  /** Header-Bytes zählen mit, aber nicht als „Kachel". */
  const onHeaderBytes = (n: number) => {
    bytesRef.current = { ...bytesRef.current, bytes: bytesRef.current.bytes + n };
  };

  useEffect(() => {
    let alive = true;
    dataRef.current = null;
    setMode('tci');
    setSwirState({ kind: 'idle' });
    setDnbrState({ kind: 'idle' });
    setWcOn(false);
    setWcSrcVia(null);
    setPhase({ kind: 'loading', word: 'Szene wird gesucht …' });
    void (async () => {
      const ref = await fetchS2CogRef(lat, lon, dayIso, pixelOf);
      if (!alive) return;
      if (!ref) { setPhase({ kind: 'error', reason: 'Für diesen Tag nennt der Katalog kein 10-m-Original.' }); return; }
      const fire = pixelOf(lat, lon, ref.epsg, ref.transform);
      if (!fire) { setPhase({ kind: 'error', reason: `Unbekannte Projektion (EPSG ${ref.epsg}).` }); return; }
      setPhase({ kind: 'loading', word: 'Inhaltsverzeichnis wird gelesen …' });
      try {
        const ifds = await fetchIfds(ref.href, onHeaderBytes);
        if (!alive) return;
        dataRef.current = {
          ref, ifds, fire,
          det: detectionsRef.current
            ? detectionPolysPx(detectionsRef.current, ref.epsg, ref.transform, ref.shape, DET_MARGIN_PX, dayIso, pixelOf)
            : [],
        };
        scarRef.current = null;
        viewRef.current = { cx: fire.px, cy: fire.py, mpp: 30 };
        setStatus((s) => ({ ...s, edge: ref.marginPx * FULL_M_PER_PX < START_HALF_M }));
        setPhase({ kind: 'ready' });
      } catch (e) {
        if (!alive) return;
        const msg = String(e);
        setPhase({
          kind: 'error',
          reason: msg.includes('cog-unsupported')
            ? `Dieses Original kann die App nicht lesen (${msg.replace(/^.*cog-unsupported:\s*/, '')}).`
            : 'Der Bild-Speicher (AWS) ist gerade nicht erreichbar.',
        });
      }
    })();
    return () => { alive = false; };
  }, [lat, lon, dayIso]);

  // SAT3: kommen neue FIRMS-Zeilen (Lauf), ziehen die Rechtecke nach — die Szene bleibt.
  useEffect(() => {
    const d = dataRef.current;
    if (!d || phase.kind !== 'ready') return;
    d.det = detections
      ? detectionPolysPx(detections, d.ref.epsg, d.ref.transform, d.ref.shape, DET_MARGIN_PX, dayIso, pixelOf)
      : [];
    scarRef.current = null;
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detections, phase.kind]);

  // --- SAT2b: Band-Header (SWIR) und Vorher-Szene (dNBR) on-demand mit dem Moduswechsel --------
  useEffect(() => {
    const d = dataRef.current;
    if (phase.kind !== 'ready' || !d || mode === 'tci') return;
    let alive = true;
    const bands = d.ref.bands;
    if (!bands) {
      const s = { kind: 'absent' as const, sentence: 'Für diese Szene nennt der Katalog keine Band-Originale (B8A/B12).' };
      if (mode === 'swir') setSwirState(s); else setDnbrState(s);
      return;
    }
    if (mode === 'swir' && !d.swirLevels) {
      setSwirState({ kind: 'loading' });
      void (async () => {
        try {
          const [s12, n8a, r04] = await Promise.all([
            fetchIfds(bands.swir22, onHeaderBytes), fetchIfds(bands.nir08, onHeaderBytes), fetchIfds(bands.red, onHeaderBytes),
          ]);
          if (!alive) return;
          const levels = pairSwirLevels(s12, n8a, r04);
          if (levels.length === 0) throw new Error('cog-unsupported: Band-Kachelgitter passen nicht zusammen');
          d.swirLevels = levels;
          setSwirState({ kind: 'ready' });
          schedule();
        } catch (e) {
          if (alive) setSwirState({ kind: 'error', sentence: swirErrorSentence(e) });
        }
      })();
    }
    if (mode === 'dnbr' && !d.dnbrLevels && d.pre !== null) {
      setDnbrState({ kind: 'loading' });
      void (async () => {
        try {
          // Anker der Vorher-Suche: der Brandbeginn, nicht der Betrachtungstag — sonst wäre
          // die „Vorher"-Szene einer Nachher-Sicht der Brandtag selbst (§10.3 (1)).
          const preEnd = fireStartIso != null && fireStartIso < dayIso ? fireStartIso : dayIso;
          const pre = d.pre ?? (d.ref.square
            ? await fetchS2PreCogRef(lat, lon, preEnd, d.ref.square, pixelOf)
            : null);
          if (!alive) return;
          d.pre = pre;
          if (!pre || !pre.ref.bands) {
            setDnbrState({
              kind: 'absent',
              sentence: `Keine wolkenarme Vorher-Szene desselben Granulats in den 35 Tagen vor dem ${fmtDay(preEnd)} — kein Vergleich möglich.`,
            });
            return;
          }
          // SAT2c: die SCL-Header laufen fehlertolerant mit — ein Ausfall lässt das Overlay
          // ohne Maske laufen (der Satz sagt es), er bricht den Modus NIE (§11.3 (3)).
          const sclIfds = (href: string | null) =>
            href ? fetchIfds(href, onHeaderBytes).catch(() => null) : Promise.resolve(null);
          const [postN, postS, preN, preS, postScl, preScl] = await Promise.all([
            fetchIfds(bands.nir08, onHeaderBytes), fetchIfds(bands.swir22, onHeaderBytes),
            fetchIfds(pre.ref.bands.nir08, onHeaderBytes), fetchIfds(pre.ref.bands.swir22, onHeaderBytes),
            sclIfds(bands.scl), sclIfds(pre.ref.bands.scl),
          ]);
          if (!alive) return;
          const levels = pairDnbrLevels(postN, postS, preN, preS, postScl, preScl);
          if (levels.length === 0) throw new Error('cog-unsupported: Vorher/Nachher-Kachelgitter passen nicht zusammen');
          d.dnbrLevels = levels;
          d.sclMask = levels.some((l) => l.postScl != null && l.preScl != null);
          // SAT2d: die Landbedeckungs-Dämpfung wird VOR dem ersten Kachelbau entschieden —
          // sonst mischte die Sitzung gedämpfte und ungedämpfte Kacheln. Fehlertolerant:
          // ein Token-/Blob-Ausfall nimmt nur die Dämpfung, nie das Overlay (§12.2 E2).
          const wc = wcEnabled() ? await prepareWcSampler(lat, lon, onHeaderBytes).catch(() => null) : null;
          if (!alive) return;
          d.wc = wc;
          setWcOn(wc != null);
          setWcSrcVia(wc != null ? wcVia() : null);
          setDnbrState({ kind: 'ready' });
          schedule();
        } catch (e) {
          if (alive) setDnbrState({ kind: 'error', sentence: swirErrorSentence(e) });
        }
      })();
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, phase.kind]);

  // --- Zeichnen -------------------------------------------------------------------------------
  const draw = () => {
    const d = dataRef.current;
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!d || !canvas || !box) return;
    const cssW = box.clientWidth;
    const cssH = box.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(cssW * dpr)) canvas.width = Math.round(cssW * dpr);
    if (canvas.height !== Math.round(cssH * dpr)) canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const m = modeRef.current;
    const { cx, cy, mpp } = viewRef.current;
    const fullPxPerCss = mpp / FULL_M_PER_PX;
    const px0 = cx - (cssW / 2) * fullPxPerCss;
    const py0 = cy - (cssH / 2) * fullPxPerCss;
    const px1 = cx + (cssW / 2) * fullPxPerCss;
    const py1 = cy + (cssH / 2) * fullPxPerCss;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2C2A26';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Über der Datenauflösung keine Glättung — echte Pixel statt weichgezeichneter Behauptung.
    const dataResM = m === 'tci' ? FULL_M_PER_PX : BAND_M_PER_PX;
    ctx.imageSmoothingEnabled = mpp / dpr >= dataResM;

    const fullW = d.ref.shape[1];
    const sameView = () => {
      const v = viewRef.current;
      return v.cx === cx && v.cy === cy && v.mpp === mpp && modeRef.current === m;
    };
    const place = (ifd: CogIfd, t: CogTileRef, bmp: ImageBitmap) => {
      const fac = ifd.width / fullW;
      const tx0F = (t.col * ifd.tileW) / fac;
      const ty0F = (t.row * ifd.tileH) / fac;
      ctx.drawImage(
        bmp,
        ((tx0F - px0) / fullPxPerCss) * dpr, ((ty0F - py0) / fullPxPerCss) * dpr,
        ((ifd.tileW / fac) / fullPxPerCss) * dpr, ((ifd.tileH / fac) / fullPxPerCss) * dpr,
      );
    };
    const budget = { n: 0 };
    const frame = { deferred: false };
    /**
     * Eine Pyramide zeichnen: grob → fein bis zur gewählten Ebene; nur die gewählte fordert
     * fehlende Kacheln an (Deckel 12 je Bild). Overlays (`chosenOnly`) zeichnen NUR die gewählte
     * Ebene — zwei gestapelte halbtransparente Ebenen würden die Deckkraft verdoppeln.
     *
     * `maxStarts` ist das Frame-Budget (V-SAT-17): mehr als so viele NEUE Bauten stößt dieses
     * Bild nicht an, der Rest kommt im nächsten. Weil jedes Bild `tilesFor` aus der AKTUELLEN
     * Sicht neu ableitet, wird eine inzwischen weggezoomte Kachel dabei gar nicht erst gebaut.
     */
    const drawPyramid = (
      levels: Array<{ ifd: CogIfd; key: (t: CogTileRef) => string; request: (t: CogTileRef) => Promise<ImageBitmap> }>,
      chosenW: number, chosenOnly: boolean, maxStarts = 12,
    ) => {
      let started = 0;
      const sorted = [...levels].sort((a, b) => a.ifd.width - b.ifd.width);
      for (const lv of sorted) {
        if (lv.ifd.width > chosenW) continue;
        if (chosenOnly && lv.ifd.width !== chosenW) continue;
        const fac = lv.ifd.width / fullW;
        for (const t of tilesFor(lv.ifd, px0 * fac, py0 * fac, px1 * fac, py1 * fac)) {
          const cached = _tiles.get(lv.key(t));
          if (!cached) {
            if (lv.ifd.width === chosenW && budget.n < 12) {
              if (started >= maxStarts) { frame.deferred = true; continue; }
              budget.n++; started++;
              lv.request(t).then(() => schedule(), () => schedule());
            }
            continue;
          }
          void cached.then((bmp) => { if (sameView()) { place(lv.ifd, t, bmp); drawOverlays(); } }, () => undefined);
        }
      }
    };

    // Grundbild: Echtfarbe (auch unter dem dNBR-Overlay) bzw. SWIR-Falschfarbe.
    let shownMPerPx: number;
    if (m === 'swir' && d.swirLevels && d.swirLevels.length > 0) {
      const bands = d.ref.bands as NonNullable<S2CogRef['bands']>;
      const chosen = pickLevel(d.swirLevels.map((l) => l.s12), mpp / dpr, BAND_M_PER_PX);
      shownMPerPx = chosen.mPerPx;
      drawPyramid(d.swirLevels.map((lv) => ({
        ifd: lv.s12,
        key: (t) => `swir|${bands.swir22}|${lv.s12.width}|${t.idx}`,
        request: (t) => loadSwirTile(bands, lv, t, onBytes),
      })), chosen.ifd.width, false);
    } else {
      const chosen = pickLevel(d.ifds, mpp / dpr, FULL_M_PER_PX);
      shownMPerPx = m === 'tci' ? chosen.mPerPx : Math.max(chosen.mPerPx, BAND_M_PER_PX);
      drawPyramid(d.ifds.map((ifd) => ({
        ifd,
        key: (t) => `${d.ref.href}|${ifd.width}|${t.idx}`,
        request: (t) => loadTile(d.ref.href, String(ifd.width), ifd, t.idx, t.offset, t.byteCount, onBytes),
      })), chosen.ifd.width, false);
    }

    // dNBR-Overlay über der Echtfarbe — nur die gewählte Ebene (Deckkraft, s. o.).
    let scarNote: ScarNote | null = null;
    if (m === 'dnbr' && d.dnbrLevels && d.dnbrLevels.length > 0 && d.pre?.ref.bands && d.ref.bands) {
      const post = d.ref.bands;
      const pre = d.pre.ref.bands;
      const chosen = pickLevel(d.dnbrLevels.map((l) => l.postS), mpp / dpr, BAND_M_PER_PX);
      shownMPerPx = Math.min(shownMPerPx, chosen.mPerPx);
      // SAT2d: UTM-Lage der Kachel für die Landbedeckungs-Dämpfung — aus dem 10-m-Transform
      // des Granulats (`proj:transform`), Ebenen-Faktor wie beim Zeichnen.
      const wcArgsFor = (lv: DnbrLevel, t: CogTileRef): WcTileArgs | null => {
        if (!d.wc) return null;
        const fac = lv.postS.width / fullW;
        const stepM = FULL_M_PER_PX / fac;
        return {
          wc: d.wc, via: wcVia(), epsg: d.ref.epsg, stepM,
          e0: d.ref.transform[2] + t.col * lv.postS.tileW * stepM,
          n0: d.ref.transform[5] - t.row * lv.postS.tileH * stepM,
        };
      };
      const keyOf = (lv: DnbrLevel, t: CogTileRef) =>
        `dnbr|${post.swir22}|${pre.swir22}|${lv.postS.width}|${t.idx}${wcKeySuffix(d.wc != null)}`;
      drawPyramid(d.dnbrLevels.map((lv) => ({
        ifd: lv.postS,
        key: (t) => keyOf(lv, t),
        request: (t) => loadDnbrTile(post, pre, lv, t, onBytes, wcArgsFor(lv, t)),
      })), chosen.ifd.width, true, d.wc ? WC_STARTS_PER_FRAME : 12);

      // SAT3d: die zusammenhängende Narbe an den Detektionen — auf der gezeigten Ebene, aus den
      // Kacheln dieser Sicht, die schon da sind. Der Schlüssel trägt den Ladestand: jede neu
      // angekommene Kachel rechnet einmal nach, ein bloßes Verschieben im selben Kachelsatz nicht.
      const lv = scarEnabled() ? d.dnbrLevels.find((l) => l.postS.width === chosen.ifd.width) : undefined;
      if (lv) {
        const fac = lv.postS.width / fullW;
        // Das Raster ist die Sicht, GESCHNITTEN mit dem Startfenster um den Brand (±9 km): so bleibt
        // der Fill unter ~0,8 Mio Pixel, egal wie weit herausgezoomt wird — im Vollbild über die
        // ganze Sicht lief er auf 185–208 ms (§13.4 (3)). Eine Narbe über 18 km gibt es in DACH nicht.
        const half = START_HALF_M / FULL_M_PER_PX;
        const tiles = tilesFor(
          lv.postS,
          Math.max(px0, d.fire.px - half) * fac, Math.max(py0, d.fire.py - half) * fac,
          Math.min(px1, d.fire.px + half) * fac, Math.min(py1, d.fire.py + half) * fac,
        );
        if (tiles.length > 0) {
          const present = tiles.map((t) => (_clsTiles.has(keyOf(lv, t)) ? 1 : 0));
          const seedKind = d.det.length > 0 ? 'det' : 'point';
          const key = `${lv.postS.width}|${tiles.map((t) => t.idx).join(',')}|${present.join('')}|${wcKeySuffix(d.wc != null)}|${seedKind}|${d.det.length}`;
          let sc = scarRef.current;
          const computeScar = () => {
            const tw = lv.postS.tileW, th = lv.postS.tileH;
            const c0 = Math.min(...tiles.map((t) => t.col)), c1 = Math.max(...tiles.map((t) => t.col));
            const r0 = Math.min(...tiles.map((t) => t.row)), r1 = Math.max(...tiles.map((t) => t.row));
            const gw = (c1 - c0 + 1) * tw, gh = (r1 - r0 + 1) * th;
            const grid = new Uint8Array(gw * gh);
            let partial = false;
            for (const t of tiles) {
              const cls = _clsTiles.get(keyOf(lv, t));
              if (!cls) { partial = true; continue; }
              const ox = (t.col - c0) * tw, oy = (t.row - r0) * th;
              for (let y = 0; y < th; y++) grid.set(cls.subarray(y * tw, y * tw + tw), (oy + y) * gw + ox);
            }
            const gx0 = c0 * tw, gy0 = r0 * th;
            // Saat: die Rechtecke der Aufnahmen bis zum Szenentag; ohne Zeilen der Brandort (3×3).
            const rects = seedKind === 'det'
              ? d.det.filter((q) => !q.after).map((q) => ({
                x0: q.minX * fac - gx0, y0: q.minY * fac - gy0, x1: q.maxX * fac - gx0, y1: q.maxY * fac - gy0,
              }))
              : [{ x0: d.fire.px * fac - gx0 - 1, y0: d.fire.py * fac - gy0 - 1, x1: d.fire.px * fac - gx0 + 1, y1: d.fire.py * fac - gy0 + 1 }];
            const result = floodScar(grid, gw, gh, seedsFromRects(rects, gw, gh), SCAR_MIN_CLASS);
            return { key, result, gx0, gy0, gw, fac, stepM: FULL_M_PER_PX / fac, partial };
          };
          // Der Fill (Rasterkopie + Flood + Umriss, gemessen ~40–120 ms auf 900²) läuft NICHT im
          // Draw-Task: er stapelte sich sonst mit Kachelbau und Zeichnen zu 225–355 ms (§13.4 (3)).
          // Er wird als eigener Makrotask angestoßen; dieses Bild zeichnet den vorigen Stand.
          if ((!sc || sc.key !== key) && scarJobRef.current?.key !== key) {
            if (scarJobRef.current) clearTimeout(scarJobRef.current.id);
            const job = { key, id: 0 };
            job.id = window.setTimeout(() => {
              if (scarJobRef.current !== job) return;
              scarJobRef.current = null;
              scarRef.current = computeScar();
              schedule();
            }, SCAR_SETTLE_MS);
            scarJobRef.current = job;
          }
          // Ein Stand aus einer ANDEREN Ebene/Saat wird nicht gezeigt — lieber kurz nichts als etwas Falsches.
          if (sc && sc.key.split('|')[0] !== String(lv.postS.width)) sc = null;
          if (sc) {
            scarNote = {
              ha: scarHa(sc.result.count, sc.stepM), stepM: sc.stepM, partial: sc.partial || sc.key !== key,
              edge: sc.result.touchesEdge, seed: seedKind, none: sc.result.seeded === 0,
            };
          }
        }
      }
    }

    /** SAT3d: der Umriss der Narbe — Kanten des Rasters in Vollauflösungs-Pixel, dann auf die Canvas. */
    const drawScar = () => {
      const sc = scarRef.current;
      if (m !== 'dnbr' || !sc || sc.result.count === 0 || !scarEnabled()) return;
      const e = sc.result.edges;
      const X = (gx: number) => (((sc.gx0 + gx) / sc.fac - px0) / fullPxPerCss) * dpr;
      const Y = (gy: number) => (((sc.gy0 + gy) / sc.fac - py0) / fullPxPerCss) * dpr;
      ctx.setLineDash([]);
      ctx.lineCap = 'square';
      for (const [color, width] of [[DET_HALO, 4], [SCAR_COLOR, 2]] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width * dpr;
        ctx.beginPath();
        for (let i = 0; i < e.length; i += 4) { ctx.moveTo(X(e[i]), Y(e[i + 1])); ctx.lineTo(X(e[i + 2]), Y(e[i + 3])); }
        ctx.stroke();
      }
    };
    /** SAT3: die Detektions-Rechtecke — nur die in Sicht; gestrichelt, wenn die Aufnahme nach dem Bild lag. */
    const drawDet = () => {
      if (!showDetRef.current || d.det.length === 0) return;
      const X = (px: number) => ((px - px0) / fullPxPerCss) * dpr;
      const Y = (py: number) => ((py - py0) / fullPxPerCss) * dpr;
      ctx.lineCap = 'butt';
      const path = (after: boolean) => {
        ctx.beginPath();
        for (const q of d.det) {
          if (q.after !== after || q.maxX < px0 || q.minX > px1 || q.maxY < py0 || q.minY > py1) continue;
          const p = q.pts;
          ctx.moveTo(X(p[0]), Y(p[1])); ctx.lineTo(X(p[2]), Y(p[3])); ctx.lineTo(X(p[4]), Y(p[5])); ctx.lineTo(X(p[6]), Y(p[7]));
          ctx.closePath();
        }
      };
      // BEIDE Lagen sind gefüllt — bei ~10 px Kantenlänge trägt die Fläche die Sichtbarkeit,
      // nicht der Strich (§13.5). „Danach" ist schwächer gefüllt und gestrichelt, aber nie leer:
      // der Rahmen sagt „das Feuer liegt irgendwo darin", und das gilt auch auf dem Vorher-Bild
      // (§13.6). Unterschieden wird über Deckung und Strichmuster, nicht über An/Aus.
      ctx.setLineDash([]);
      ctx.fillStyle = DET_FILL;
      path(false);
      ctx.fill();
      ctx.fillStyle = DET_FILL_AFTER;
      path(true);
      ctx.fill();
      for (const after of [false, true]) {
        ctx.setLineDash(after ? [5 * dpr, 3 * dpr] : []);
        for (const [color, width] of [[DET_HALO, 4], [DET_COLOR, 2]] as const) {
          ctx.strokeStyle = color;
          ctx.lineWidth = width * dpr;
          path(after);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    };
    const drawCross = () => {
      const fx = ((d.fire.px - px0) / fullPxPerCss) * dpr;
      const fy = ((d.fire.py - py0) / fullPxPerCss) * dpr;
      ctx.strokeStyle = '#FDFBF4';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      ctx.moveTo(fx - 14 * dpr, fy); ctx.lineTo(fx - 5 * dpr, fy);
      ctx.moveTo(fx + 5 * dpr, fy); ctx.lineTo(fx + 14 * dpr, fy);
      ctx.moveTo(fx, fy - 14 * dpr); ctx.lineTo(fx, fy - 5 * dpr);
      ctx.moveTo(fx, fy + 5 * dpr); ctx.lineTo(fx, fy + 14 * dpr);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(fx, fy, 5 * dpr, 0, Math.PI * 2);
      ctx.stroke();
    };
    /** Reihenfolge: Narbe (Fläche) → Detektionen → Fadenkreuz — das Kleinste liegt obenauf. */
    const drawOverlays = () => { drawScar(); drawDet(); drawCross(); };
    drawOverlays();
    setScar((prev) => (prev === scarNote || (prev && scarNote && prev.ha === scarNote.ha && prev.stepM === scarNote.stepM
      && prev.partial === scarNote.partial && prev.edge === scarNote.edge && prev.seed === scarNote.seed && prev.none === scarNote.none)
      ? prev : scarNote));

    // V-SAT-17: was das Frame-Budget stehen ließ, holt das nächste Bild — `schedule()` ist
    // rAF-koalesziert, es entsteht also genau ein weiterer Durchlauf, keine Schleife.
    if (frame.deferred) schedule();

    // V-SAT-15: ein Latch-Kipp (PC → Spiegel) mitten in der Sitzung wird beim nächsten Draw
    // sichtbar — der Satz unten wechselt mit, neue Kacheln laufen unter dem `|wcm`-Schlüssel.
    if (dataRef.current?.wc) setWcSrcVia((v) => (v === wcVia() ? v : wcVia()));

    setStatus((s) => {
      // viewMpp gehört in den Zustand: ein Zoom OHNE Nachladung muss den Maßstabsbalken
      // trotzdem neu rendern (§10.3 — sonst stand „5 km" an einer 2-km-Sicht).
      const next = {
        tiles: bytesRef.current.tiles, mb: bytesRef.current.bytes / 1048576,
        mPerPx: shownMPerPx, viewMpp: mpp, edge: s.edge,
      };
      return s.tiles === next.tiles && s.mb === next.mb && s.mPerPx === next.mPerPx
        && s.viewMpp === next.viewMpp ? s : next;
    });
  };

  const schedule = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; draw(); });
  };

  useEffect(() => {
    if (phase.kind !== 'ready') return;
    schedule();
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => schedule());
    ro.observe(box);
    return () => {
      ro.disconnect();
      // Die ID MUSS zurück auf 0: `schedule()` hält eine stehengebliebene ID sonst für einen
      // ausstehenden Frame und zeichnet nie wieder — latenter SAT2a-Fehler, der erst auslöste,
      // als der Moduswechsel die Aufräumung mit ausstehendem Draw traf (§10.3).
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
      if (scarJobRef.current) { clearTimeout(scarJobRef.current.id); scarJobRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind, full, mode, swirState.kind, dnbrState.kind, showDet]);

  // --- Gesten ---------------------------------------------------------------------------------
  const clampView = () => {
    const d = dataRef.current;
    if (!d) return;
    const v = viewRef.current;
    v.mpp = Math.min(MAX_M_PER_CSS_PX, Math.max(MIN_M_PER_CSS_PX, v.mpp));
    const w = d.ref.shape[1];
    const h = d.ref.shape[0];
    v.cx = Math.min(w, Math.max(0, v.cx));
    v.cy = Math.min(h, Math.max(0, v.cy));
  };

  const zoomBy = (factor: number, atCssX?: number, atCssY?: number) => {
    const box = boxRef.current;
    if (!box) return;
    const v = viewRef.current;
    const cssW = box.clientWidth;
    const cssH = box.clientHeight;
    const ax = atCssX ?? cssW / 2;
    const ay = atCssY ?? cssH / 2;
    const before = v.mpp / FULL_M_PER_PX;
    const wx = v.cx + (ax - cssW / 2) * before;
    const wy = v.cy + (ay - cssH / 2) * before;
    v.mpp = Math.min(MAX_M_PER_CSS_PX, Math.max(MIN_M_PER_CSS_PX, v.mpp * factor));
    const after = v.mpp / FULL_M_PER_PX;
    v.cx = wx - (ax - cssW / 2) * after;
    v.cy = wy - (ay - cssH / 2) * after;
    clampView();
    schedule();
  };

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchRef.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 2 && pinchRef.current != null) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 8) {
        const box = boxRef.current?.getBoundingClientRect();
        zoomBy(pinchRef.current / dist, box ? (a.x + b.x) / 2 - box.left : undefined, box ? (a.y + b.y) / 2 - box.top : undefined);
        pinchRef.current = dist;
      }
      return;
    }
    const v = viewRef.current;
    const fullPxPerCss = v.mpp / FULL_M_PER_PX;
    v.cx -= (cur.x - prev.x) * fullPxPerCss;
    v.cy -= (cur.y - prev.y) * fullPxPerCss;
    clampView();
    schedule();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
  };

  // Rad-Zoom braucht `passive: false` (React-onWheel kann den Seiten-Scroll nicht verhindern).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || phase.kind !== 'ready') return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomBy(Math.pow(1.25, e.deltaY / 100), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind, full]);

  // Esc: erst das Vollbild, dann den Viewer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (full) setFull(false); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full, onClose]);

  // Vollbild sperrt den Seiten-Scroll, solange es offen ist.
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [full]);

  const resetView = () => {
    const d = dataRef.current;
    if (!d) return;
    viewRef.current = { cx: d.fire.px, cy: d.fire.py, mpp: 30 };
    schedule();
  };

  const bar = scaleBar(viewRef.current.mpp);
  const estimate = (() => {
    const d = dataRef.current;
    if (!d || phase.kind !== 'ready' || mode !== 'tci') return null;
    const fullIfd = [...d.ifds].sort((a, b) => b.width - a.width)[0];
    const half = START_HALF_M / FULL_M_PER_PX;
    return estimateBytes(tilesFor(fullIfd, d.fire.px - half, d.fire.py - half, d.fire.px + half, d.fire.py + half));
  })();

  const d = dataRef.current;
  const hasBands = phase.kind === 'ready' && d?.ref.bands != null;
  const hasDet = phase.kind === 'ready' && (d?.det.length ?? 0) > 0;
  const fmtHa = (ha: number) => (ha < 10 ? ha.toFixed(1).replace('.', ',') : String(Math.round(ha)));
  const extra: ExtraState = mode === 'swir' ? swirState : mode === 'dnbr' ? dnbrState : { kind: 'idle' };
  const preInfo = mode === 'dnbr' && dnbrState.kind === 'ready' && d?.pre ? d.pre : null;

  const body = (
    <div className={full ? 'br-cog-full' : 'br-cog-inline'} ref={boxRef}>
      {phase.kind === 'ready' && (
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          aria-label={`Sentinel-2-Original vom ${dayIso} (10 m) — ziehen verschiebt, Rad/Pinch zoomt`}
        />
      )}
      {phase.kind === 'loading' && <p className="br-sat-wait br-muted">{phase.word}</p>}
      {phase.kind === 'error' && (
        <p className="br-sat-wait br-muted">
          {phase.reason}{' '}
          <a href={fallbackUrl} target="_blank" rel="noopener">Im Copernicus Browser öffnen</a>
        </p>
      )}
      {hasBands && (
        <div className="br-cog-mode" role="group" aria-label="Darstellung der 10-m-Ansicht">
          {(['tci', 'swir', 'dnbr'] as const).map((k) => (
            <button
              key={k} type="button" aria-pressed={mode === k}
              className={mode === k ? 'is-active' : undefined}
              onClick={() => setMode(k)}
            >
              {MODE_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      {hasDet && (
        <div className="br-cog-over" role="group" aria-label="Overlays der 10-m-Ansicht">
          <button type="button" aria-pressed={showDet} className={showDet ? 'is-active' : undefined} onClick={() => setShowDet((v) => !v)}>
            Detektionen
          </button>
        </div>
      )}
      <div className="br-cog-ctrl" role="group" aria-label="10-m-Ansicht steuern">
        <button type="button" onClick={() => zoomBy(0.5)} aria-label="Hineinzoomen">+</button>
        <button type="button" onClick={() => zoomBy(2)} aria-label="Herauszoomen">−</button>
        <button type="button" onClick={resetView} aria-label="Ansicht auf den Brand zurücksetzen">⌂</button>
        <button type="button" onClick={() => setFull((f) => !f)} aria-label={full ? 'Vollbild verlassen' : 'Vollbild'}>
          {full ? '⇲' : '⤢'}
        </button>
        <button type="button" onClick={() => { setFull(false); onClose(); }} aria-label="10-m-Ansicht schließen">×</button>
      </div>
      {phase.kind === 'ready' && (
        <div className="br-cog-status">
          <span className="br-cog-scale" style={{ width: `${Math.round(bar.widthPx)}px` }} aria-hidden="true" />
          <span>{bar.label}</span>
          <span>
            {status.tiles} Kacheln · {status.mb < 0.05 ? '<0,1' : status.mb.toFixed(1).replace('.', ',')} MB geladen
            · ~{Math.round(status.mPerPx)} m/px
            {estimate != null && status.mPerPx > FULL_M_PER_PX
              ? ` · volle 10 m hier ≈ ${Math.max(1, Math.round(estimate / 1048576))} MB`
              : ''}
          </span>
        </div>
      )}
      {phase.kind === 'ready' && (
        <div className="br-cog-notes">
          {mode === 'dnbr' && dnbrState.kind === 'ready' && (
            <div className="br-cog-legend" aria-label="dNBR-Klassen (unkalibriert)">
              {DNBR_CLASSES.map((c) => (
                <span key={c.min}>
                  <i style={{ background: `rgba(${c.rgba[0]},${c.rgba[1]},${c.rgba[2]},${(c.rgba[3] / 255).toFixed(2)})` }} aria-hidden="true" />
                  {c.label}
                </span>
              ))}
              {d?.sclMask && (
                <span>
                  <i style={{ background: `rgba(${DNBR_CLASSES[2].rgba[0]},${DNBR_CLASSES[2].rgba[1]},${DNBR_CLASSES[2].rgba[2]},${(DNBR_CLASSES[2].rgba[3] / 2 / 255).toFixed(2)})` }} aria-hidden="true" />
                  blasser: Wolke/Schatten nachher möglich
                </span>
              )}
              {wcOn && (
                <span>
                  <i style={{ background: `rgba(${DNBR_CLASSES[2].rgba[0]},${DNBR_CLASSES[2].rgba[1]},${DNBR_CLASSES[2].rgba[2]},${(DNBR_CLASSES[2].rgba[3] / 2 / 255).toFixed(2)})` }} aria-hidden="true" />
                  blasser: Acker/Siedlung — Ernte statt Brand möglich
                </span>
              )}
              {scar && !scar.none && (
                <span>
                  <i style={{ background: 'transparent', borderColor: SCAR_COLOR, borderWidth: 2 }} aria-hidden="true" />
                  Umriss: zusammenhängende Narbe an den Detektionen
                </span>
              )}
            </div>
          )}
          {/* SAT3d: die Narbe in Zahlen — Auflösung und Vollständigkeit stehen im selben Satz. */}
          {mode === 'dnbr' && dnbrState.kind === 'ready' && scar && (
            <p className="br-cog-note br-muted">
              {scar.none
                ? `Keine zusammenhängende, volldeckende Narbe (dNBR ≥ 0,27) an ${scar.seed === 'det' ? 'den Detektionen' : 'diesem Brandort'}${scar.partial ? ' — Kacheln laden noch' : ''}; unter Wolke/Schatten und auf Acker/Siedlung bleibt sie unentschieden.`
                : `Heller Umriss: verbrannt wirkende Fläche an ${scar.seed === 'det' ? 'den Detektionen' : 'diesem Brandort (keine Detektionen im Umkreis der Szene)'} ≈ ${fmtHa(scar.ha)} ha bei ${Math.round(scar.stepM)} m/px, dNBR ≥ 0,27, unkalibriert, nur volldeckende Pixel (Wolke/Schatten, Acker/Siedlung verbinden nichts)${scar.partial ? '; Kacheln laden noch — Untergrenze' : ''}${scar.edge ? '; reicht bis an den Rand — herauszoomen' : ''}.`}
            </p>
          )}
          {/* SAT3: was die Rechtecke sind — und was nicht. */}
          {hasDet && showDet && (
            <p className="br-cog-note br-muted">
              ▭ FIRMS-Pixelgrundfläche — das Feuer liegt irgendwo darin, nicht in der Mitte · gestrichelt und blasser: Detektion erst nach dieser Aufnahme.
            </p>
          )}
          {(extra.kind === 'loading' || extra.kind === 'absent' || extra.kind === 'error') && (
            <p className="br-cog-note br-muted">
              {extra.kind === 'loading'
                ? (mode === 'dnbr' ? 'Vorher-Szene wird gesucht …' : 'Band-Originale werden gelesen …')
                : (<>
                  {extra.sentence}{' '}
                  <a href={fallbackUrl} target="_blank" rel="noopener">Im Copernicus Browser öffnen</a>
                </>)}
            </p>
          )}
          {mode === 'swir' && swirState.kind === 'ready' && (
            <p className="br-cog-note br-muted">
              SWIR-Falschfarbe (B12/B8A/B04, 20 m): vitale Vegetation leuchtet grün, verbrannte
              Flächen verlieren das Grün und wirken dunkel bis bräunlich; aktives Feuer leuchtet
              orange. Am deutlichsten trennt der dNBR-Modus.
            </p>
          )}
          {preInfo && (
            <p className="br-cog-note br-muted">
              Verbrannt wirkende Fläche (dNBR, unkalibriert): Vergleich {fmtDay(preInfo.dayIso)} → {fmtDay(dayIso)} aus
              B8A/B12 (20 m), Konventionsschwellen{d?.sclMask
                ? ' — Wolken/Schatten laut Szenenklassifikation: in der Vorher-Szene maskiert, in der Nachher-Szene blasser dargestellt (dünner Zirrus läuft durch)'
                : ' — keine Wolkenmaske (Szenenklassifikation nicht verfügbar): Wolken und Schatten können ein Signal erzeugen'}{wcOn
                ? `; auf Acker, Siedlung und anderen Nicht-Wildvegetationsflächen (ESA WorldCover 2021, CC BY 4.0) blasser: dort ist Ernte oder Nutzung wahrscheinlicher als Brand${wcSrcVia === 'mirror' ? ' — Landbedeckung hier aus dem eigenen Spiegel (37 m statt 10 m)' : ''}`
                : '; Feldwechsel (Ernte) können außerhalb von Wald ein Signal erzeugen'}; belastbar
              ist die zusammenhängende Fläche am Brandort.
            </p>
          )}
          {status.edge && (
            <p className="br-cog-note br-muted">
              Der Brand liegt nahe am Rand dieser Aufnahme-Kachel — schwarze Flächen sind der
              Szenenrand, kein Bildfehler.
            </p>
          )}
        </div>
      )}
    </div>
  );

  // Vollbild als Portal an <body>: `position: fixed` bliebe sonst im `overflow: hidden` des
  // Bildrahmens gefangen, sobald ein Vorfahr eine transform trägt.
  return full ? createPortal(body, document.body) : body;
}

function fmtDay(dayIso: string): string {
  const [, m, dd] = dayIso.split('-');
  return `${dd}.${m}.`;
}

function swirErrorSentence(e: unknown): string {
  const msg = String(e);
  return msg.includes('cog-unsupported')
    ? `Diese Band-Originale kann die App nicht lesen (${msg.replace(/^.*cog-unsupported:\s*/, '')}).`
    : 'Der Bild-Speicher (AWS) ist gerade nicht erreichbar.';
}
