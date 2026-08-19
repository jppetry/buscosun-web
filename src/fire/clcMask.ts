/**
 * Statische Landbedeckungsmaske — CORINE 2018, Klassen 121/131/132 (GWBA1 A4).
 *
 * Jans Entscheidung 2026-08-15: **CORINE-only, ≤ 100 KB, null Requests im
 * Renderpfad**, keine OSM/Geofabrik-Anreicherung (damit keine ODbL-Frage). Die
 * Maske wird offline von `scripts/build-clc-mask.mjs` gebaut (14 562 Polygone,
 * 0,01°-Raster 1200×1000, 8-bit-PNG ~25 KB) und als statische Datei
 * `public/fire/clc-industry-mask.png` ausgeliefert. Der Client lädt sie EINMAL
 * lazy (nach dem ersten Hotspot-Lauf) und schlägt danach rein lokal nach.
 *
 * Bedeutung: 255 = Industrie-/Gewerbe-, Abbau- oder Deponiefläche laut CLC
 * 2018 → Plausibilität für eine **Dauerquelle** (Stahlwerk, Kraftwerk, Tagebau).
 * 0 = sonstige Fläche → **keine** Aussage (kein „natürlich": 111/112 wären
 * ebenfalls 0). Grenzen: Stand 2018, 100 m, MMU 25 ha; ein 375-m-Pixel deckt
 * mehrere Zellen, ein Brand am Rand eines Industriegebiets fällt falsch —
 * deshalb **Plausibilität, nie harter Ausschluss**, nichts wird ausgeblendet.
 *
 * Pur (bis auf den Loader), DOM-frei — `npm run verify:fire-behoerden`.
 */

export const CLC_MASK_URL = '/fire/clc-industry-mask.png';
export const CLC_ATTRIBUTION =
  "Generated using European Union's Copernicus Land Monitoring Service information (CLC 2018)";

/** Muss zum Build-Skript passen (Sidecar `clc-industry-mask.json` trägt dieselben Werte). */
export const CLC_BBOX = { west: 5.5, south: 45.5, east: 17.5, north: 55.5 } as const;
export const CLC_STEP = 0.01;
export const CLC_W = 1200;
export const CLC_H = 1000;

export interface ClcMask {
  width: number;
  height: number;
  /** Ein Byte je Zelle, zeilenweise von Nord nach Süd. */
  data: Uint8Array;
}

export type ClcVerdict = 'industrial' | 'other' | null;

/** Zellenindex für lat/lon; -1 außerhalb der Hülle. */
export function cellIndex(lat: number, lon: number, w = CLC_W, h = CLC_H): number {
  if (lon < CLC_BBOX.west || lon >= CLC_BBOX.east || lat <= CLC_BBOX.south || lat > CLC_BBOX.north) return -1;
  const c = Math.floor((lon - CLC_BBOX.west) / CLC_STEP);
  const r = Math.floor((CLC_BBOX.north - lat) / CLC_STEP);
  if (c < 0 || c >= w || r < 0 || r >= h) return -1;
  return r * w + c;
}

/**
 * Nachschlagen mit Pixeltoleranz: die 3×3 Zellen um den Punkt (~±1 km) —
 * ein VIIRS-Pixel ist 375–800 m, die Pixelmitte liegt selten exakt in der
 * Zelle des Werksgeländes. `industrial`, wenn eine der neun Zellen gesetzt ist.
 */
export function landcoverAt(mask: ClcMask | null, lat: number, lon: number): ClcVerdict {
  if (!mask) return null;
  const idx = cellIndex(lat, lon, mask.width, mask.height);
  if (idx < 0) return null;
  const r0 = Math.floor(idx / mask.width), c0 = idx % mask.width;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = r0 + dr, c = c0 + dc;
      if (r < 0 || r >= mask.height || c < 0 || c >= mask.width) continue;
      if (mask.data[r * mask.width + c] > 127) return 'industrial';
    }
  }
  return 'other';
}

/** Kartierbare Antwort für `assess()`: nur „artificial" ist eine Aussage. */
export function toAssessmentLandcover(v: ClcVerdict): 'artificial' | null {
  return v === 'industrial' ? 'artificial' : null;
}

// ---------------------------------------------------------------------------
// Loader — Browser, einmal, still
// ---------------------------------------------------------------------------

let _mask: ClcMask | null = null;
let _inflight: Promise<ClcMask | null> | null = null;

/** Lädt die Maske genau einmal; bei jedem Fehler `null` (kein Banner, kein Wurf). */
export function loadClcMask(): Promise<ClcMask | null> {
  if (_mask) return Promise.resolve(_mask);
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      if (typeof createImageBitmap !== 'function') return null;
      const res = await fetch(CLC_MASK_URL);
      if (!res.ok) return null;
      const bmp = await createImageBitmap(await res.blob());
      const w = bmp.width, h = bmp.height;
      const canvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });
      const ctx = (canvas as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D | null;
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0);
      const img = ctx.getImageData(0, 0, w, h).data;
      const data = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) data[i] = img[i * 4]; // Graustufe: R-Kanal
      _mask = { width: w, height: h, data };
      return _mask;
    } catch {
      return null;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}
export function resetClcMask(): void { _mask = null; _inflight = null; }

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei) — synthetische Maske
// ---------------------------------------------------------------------------

export interface ClcCheck { name: string; ok: boolean; detail?: string }

export function verifyClcMask(): { checks: ClcCheck[]; passed: number; total: number } {
  const checks: ClcCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const data = new Uint8Array(CLC_W * CLC_H);
  // Eine Industriezelle bei Duisburg-Nord (51.48 N, 6.72 E).
  const idx = cellIndex(51.48, 6.72);
  data[idx] = 255;
  const mask: ClcMask = { width: CLC_W, height: CLC_H, data };
  add('Zellenindex liegt im Raster', idx >= 0 && idx < CLC_W * CLC_H, String(idx));
  add('Zellenindex: Nord-West-Ecke ist 0, Süd-Ost-Ecke die letzte Zelle',
    cellIndex(55.499, 5.5) === 0 && cellIndex(45.501, 17.499) === CLC_W * CLC_H - 1);
  add('Punkt in der Industriezelle ⇒ industrial', landcoverAt(mask, 51.48, 6.72) === 'industrial');
  add('Nachbarzelle (~700 m) ⇒ industrial (Pixeltoleranz 3×3)', landcoverAt(mask, 51.487, 6.727) === 'industrial');
  add('3 km entfernt ⇒ other', landcoverAt(mask, 51.51, 6.76) === 'other');
  add('außerhalb DACH ⇒ null (keine Aussage)', landcoverAt(mask, 40, 0) === null && landcoverAt(null, 51.48, 6.72) === null);
  add('nur „industrial" wird zur Bewertungs-Aussage', toAssessmentLandcover('industrial') === 'artificial' && toAssessmentLandcover('other') === null && toAssessmentLandcover(null) === null);
  add('Attribution nennt den Copernicus Land Monitoring Service', /Copernicus Land Monitoring/.test(CLC_ATTRIBUTION));
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
