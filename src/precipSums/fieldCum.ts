/**
 * Phase NS (E-NS-9, `audit/niederschlagssummen.md` §9.4): Leser der kumulierten Erwartung `precipcum-<LLL>.png` der
 * Kartenfelder von buscosun Fusion (Modell · Cube) — die Summe über ein Fenster ist C(Ende) − C(Anfang).
 *
 * C(t) einer Stufe ist an den Vorlauf-Grenzen bekannt: C(t_k) = Bild k; der Beginn des ersten Intervalls t_0 − stepH hat
 * C = 0. Dazwischen linear (= gleichmäßige Rate in der Stufe, dieselbe Annahme wie am Ort, §9.2). Gebraucht werden nur die
 * zwei Bilder, die einen Zeitpunkt einschließen — ein Fenster kostet höchstens vier Bilder je Stufe.
 *
 * Rein bis auf `loadFieldCum` (Netz + PNG-Dekoder, injizierbar).
 */

import { TIER_BY_ID, type TierId } from '../point/cubeFormat';
import {
  FIELD_INDEX_PATH, FIELD_MANIFEST_FILE, fieldRunDir, parseFieldIndex, parseFieldManifest, decodePrecipCumPixel,
  type FieldGrid, type FieldManifest,
} from '../point/fieldFormat';

const H = 3_600_000;

/** Eine Stufe mit den Bildern, die geladen sind (Schlüssel = Vorlauf h). */
export interface CumTier {
  tier: TierId;
  run: string;
  runAtMs: number;
  builtAtMs: number;
  stepH: number;
  grid: FieldGrid;
  /** Vorläufe der Stufe mit kumulierter Erwartung, aufsteigend. */
  leads: Array<{ leadH: number; validAtMs: number; file: string }>;
  /** RGBA je geladenem Vorlauf. */
  images: Map<number, Uint8Array | Uint8ClampedArray>;
  /** Stand von buscosun Fusion, mit dem das Feld GEBAUT wurde (Manifest `chain.options.fusionName`). */
  fusionName: string | null;
}

/** Zeitspanne, über die die Stufe C(t) kennt. */
export function cumSpan(t: Pick<CumTier, 'leads' | 'stepH'>): { fromMs: number; toMs: number } | null {
  if (!t.leads.length) return null;
  return { fromMs: t.leads[0].validAtMs - t.stepH * H, toMs: t.leads[t.leads.length - 1].validAtMs };
}

/** Die (höchstens zwei) Vorläufe, deren Bilder C(tMs) braucht; `null` außerhalb der Spanne. */
export function leadsFor(t: Pick<CumTier, 'leads' | 'stepH'>, tMs: number): number[] | null {
  const span = cumSpan(t);
  if (!span || tMs < span.fromMs - 1000 || tMs > span.toMs + 1000) return null;
  const L = t.leads;
  if (tMs <= L[0].validAtMs) return [L[0].leadH];
  for (let k = 1; k < L.length; k++) {
    if (tMs <= L[k].validAtMs) {
      // Lücke in den Vorläufen (ein Bild fehlt im Manifest) ⇒ das Intervall ist nicht lückenlos bekannt.
      if (L[k].validAtMs - L[k - 1].validAtMs > t.stepH * H + 1000) return null;
      return tMs >= L[k].validAtMs - 1000 ? [L[k].leadH] : [L[k - 1].leadH, L[k].leadH];
    }
  }
  return null;
}

/** Pixel-Index (RGBA-Offset / 4) der Zelle, in der (lat, lon) liegt; `null` außerhalb des Felds. */
export function cumPixelOf(grid: FieldGrid, lat: number, lon: number): number | null {
  const ix = Math.round((lon - grid.lon0) / grid.deg), iy = Math.round((lat - grid.lat0) / grid.deg);
  if (ix < 0 || iy < 0 || ix >= grid.width || iy >= grid.height) return null;
  return (grid.height - 1 - iy) * grid.width + ix;
}

/**
 * Was C an einem Zeitpunkt braucht — je Zeitpunkt EINMAL (nicht je Zelle): C = (1 − w)·A + w·B mit den Bildern A, B
 * (A = null ⇒ 0, der Beginn des ersten Intervalls). `null` = Zeit außerhalb oder ein Bild fehlt.
 */
export interface CumPrep { a: Uint8Array | Uint8ClampedArray | null; b: Uint8Array | Uint8ClampedArray; w: number }

export function prepareCumAt(t: CumTier, tMs: number): CumPrep | null {
  const need = leadsFor(t, tMs);
  if (!need) return null;
  const first = t.leads[0];
  if (need.length === 1) {
    const L = need[0];
    const img = t.images.get(L);
    if (!img) return null;
    if (L !== first.leadH || tMs >= first.validAtMs - 1000) return { a: null, b: img, w: 1 };
    // Im ersten Intervall: linear von 0 am Intervallbeginn.
    const start = first.validAtMs - t.stepH * H;
    return { a: null, b: img, w: Math.max(0, (tMs - start) / (first.validAtMs - start)) };
  }
  const [la, lb] = need;
  const ia = t.images.get(la), ib = t.images.get(lb);
  if (!ia || !ib) return null;
  const ta = t.leads.find((l) => l.leadH === la)!.validAtMs, tb = t.leads.find((l) => l.leadH === lb)!.validAtMs;
  return { a: ia, b: ib, w: (tMs - ta) / (tb - ta) };
}

/** C an einem Pixel mit vorbereitetem Zeitpunkt; `null` = Pixel fehlt (A 0) in einem der Bilder. */
export function cumAtPix(p: CumPrep, pix: number): number | null {
  const o = pix * 4;
  const cb = decodePrecipCumPixel(p.b[o], p.b[o + 1], p.b[o + 2], p.b[o + 3]);
  if (cb == null) return null;
  if (!p.a) return cb * p.w;
  const ca = decodePrecipCumPixel(p.a[o], p.a[o + 1], p.a[o + 2], p.a[o + 3]);
  if (ca == null) return null;
  return ca + (cb - ca) * p.w;
}

/** C(tMs) an einem Pixel; `null` = Bild fehlt, Pixel fehlt (A 0) oder Zeit außerhalb. */
export function cumAt(t: CumTier, pix: number, tMs: number): number | null {
  const p = prepareCumAt(t, tMs);
  return p ? cumAtPix(p, pix) : null;
}

/** Summe (mm) über (aMs, bMs] an einem Pixel; `null`, wenn eine Grenze unbekannt ist. */
export function cumWindow(t: CumTier, pix: number, aMs: number, bMs: number): number | null {
  if (bMs <= aMs) return 0;
  const ca = cumAt(t, pix, aMs), cb = cumAt(t, pix, bMs);
  if (ca == null || cb == null) return null;
  return Math.max(0, cb - ca);
}

// --- Laden ----------------------------------------------------------------------------------------

export type BytesFetcher = (path: string) => Promise<Uint8Array>;
export type JsonFetcher = (path: string) => Promise<unknown>;
export type RgbaDecoder = (bytes: Uint8Array) => Promise<{ data: Uint8Array | Uint8ClampedArray; width: number; height: number }>;

export interface FieldCumSet {
  tiers: CumTier[];
  /** Warum eine Stufe fehlt (Index ohne Stufe, Feld vor Phase NS ohne `precipcum`, Manifest ungültig). */
  notes: string[];
}

/** Index + Manifeste der Stufen t1, t2 (48 h reichen nie bis t3). Bilder lädt `ensureCumImages`. */
export async function loadFieldCumSet(getJson: JsonFetcher, tiers: TierId[] = ['t1', 't2']): Promise<FieldCumSet> {
  const idx = parseFieldIndex(await getJson(FIELD_INDEX_PATH));
  if (!idx) return { tiers: [], notes: ['Index der Kartenfelder unbekannt'] };
  const out: CumTier[] = [];
  const notes: string[] = [];
  for (const tierId of tiers) {
    const e = idx.latestByTier[tierId];
    if (!e) { notes.push(`${tierId}: kein Feld im Index`); continue; }
    let man: FieldManifest | null = null;
    try { man = parseFieldManifest(await getJson(`${fieldRunDir(e.run, tierId)}/${FIELD_MANIFEST_FILE}`)); } catch (err) { notes.push(`${tierId}: Manifest nicht lesbar (${err instanceof Error ? err.message : String(err)})`); continue; }
    if (!man) { notes.push(`${tierId}: Manifest ungültig`); continue; }
    const leads = man.leads.filter((l) => l.precipcum).map((l) => ({ leadH: l.leadH, validAtMs: l.validAtMs, file: l.precipcum as string }));
    if (!leads.length) { notes.push(`${tierId} ${man.run}: Feld ohne kumulierte Erwartung (vor Phase NS gebaut)`); continue; }
    const fusionName = typeof man.chain?.options?.fusionName === 'string' ? man.chain.options.fusionName as string : null;
    out.push({ tier: tierId, run: man.run, runAtMs: man.runAtMs, builtAtMs: man.builtAtMs, stepH: TIER_BY_ID[tierId].stepH, grid: man.grid, leads, images: new Map(), fusionName });
  }
  return { tiers: out, notes };
}

/** Lädt die Bilder, die C an den gegebenen Zeitpunkten braucht. Fehlt ein Bild, bleibt es weg (C dort `null`). */
export async function ensureCumImages(t: CumTier, timesMs: number[], getBytes: BytesFetcher, decode: RgbaDecoder): Promise<void> {
  const want = new Set<number>();
  for (const tm of timesMs) for (const L of leadsFor(t, tm) ?? []) if (!t.images.has(L)) want.add(L);
  await Promise.all([...want].map(async (L) => {
    const lead = t.leads.find((l) => l.leadH === L);
    if (!lead) return;
    try {
      const png = await decode(await getBytes(`${fieldRunDir(t.run, t.tier)}/${lead.file}`));
      if (png.width !== t.grid.width || png.height !== t.grid.height) return;
      t.images.set(L, png.data);
    } catch { /* fehlt ⇒ C an diesem Vorlauf null — die Summe dort ist eine Lücke */ }
  }));
}
