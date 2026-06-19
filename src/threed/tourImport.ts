/**
 * 3D-Wetter · Tour-Import als Schnittlinie (US-A7).
 *
 * Lädt eine gespeicherte/aufgezeichnete Tour (GPX/TCX/FIT/KML) über den
 * bestehenden Routen-Parser und vereinfacht den Track per Douglas-Peucker (RDP)
 * zu einer handhabbaren Schnittlinie — kein manuelles Nachzeichnen nötig.
 */

import { parseRouteFile } from '../route/parseRoute';
import { detectFormat } from '../route/routeFormats';
import { projectMeters, rdpIndices } from '../route/rdp';
import type { GeoPoint } from './sectionGeometry';

export interface ImportedTour {
  points: GeoPoint[];
  name: string;
  pointCountRaw: number;
}

/** Vereinfacht eine Punktfolge auf ≤ maxPoints Stützpunkte (RDP, Endpunkte erhalten). */
export function simplifyToCutLine(points: Array<{ lat: number; lon: number }>, maxPoints = 24): GeoPoint[] {
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (pts.length <= maxPoints) return pts.map((p) => ({ lat: p.lat, lon: p.lon }));
  const xy = projectMeters(pts);
  for (const eps of [50, 100, 200, 400, 800, 1600, 3200, 6400]) {
    const idx = rdpIndices(xy, eps);
    if (idx.length <= maxPoints) return idx.map((i) => ({ lat: pts[i].lat, lon: pts[i].lon }));
  }
  // Fallback: gleichmäßiges Subsampling inkl. Endpunkt.
  const step = Math.ceil(pts.length / (maxPoints - 1));
  const out: GeoPoint[] = [];
  for (let i = 0; i < pts.length; i += step) out.push({ lat: pts[i].lat, lon: pts[i].lon });
  const last = pts[pts.length - 1];
  if (out[out.length - 1]?.lat !== last.lat || out[out.length - 1]?.lon !== last.lon) out.push({ lat: last.lat, lon: last.lon });
  return out;
}

/** Liest eine Tour-Datei und liefert die vereinfachte Schnittlinie. */
export async function tourFileToCutLine(file: File): Promise<ImportedTour> {
  const fmt = detectFormat(file.name);
  if (!fmt) throw new Error('Format nicht erkannt (GPX, TCX, FIT, KML/KMZ).');
  const parsed = await parseRouteFile(file, fmt.id);
  // Längsten Track wählen.
  const track = parsed.tracks.reduce((a, b) => (b.points.length > a.points.length ? b : a), parsed.tracks[0]);
  const points = simplifyToCutLine(track.points);
  if (points.length < 2) throw new Error('Die Tour enthält zu wenige Punkte für einen Schnitt.');
  return { points, name: track.name || parsed.name || file.name.replace(/\.[^.]+$/, ''), pointCountRaw: track.points.length };
}

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface TourCheck { case: string; ok: boolean; detail: string }

export function verifyTourImport(): { checks: TourCheck[]; passed: number; failed: number } {
  const checks: TourCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });

  // Wenige Punkte → unverändert.
  const few = simplifyToCutLine([{ lat: 47, lon: 11 }, { lat: 47.1, lon: 11.1 }]);
  add('wenige Punkte unverändert', few.length === 2 && few[0].lat === 47);

  // Dichter Track entlang eines Bogens → auf ≤ maxPoints reduziert, Endpunkte erhalten.
  const dense = Array.from({ length: 500 }, (_, i) => ({ lat: 47 + Math.sin(i / 50) * 0.2, lon: 11 + i * 0.001 }));
  const simp = simplifyToCutLine(dense, 24);
  add('dichter Track reduziert', simp.length <= 24 && simp.length >= 2, `${simp.length}`);
  add('Startpunkt erhalten', Math.abs(simp[0].lat - dense[0].lat) < 1e-9 && Math.abs(simp[0].lon - dense[0].lon) < 1e-9);
  add('Endpunkt erhalten', Math.abs(simp[simp.length - 1].lon - dense[dense.length - 1].lon) < 1e-6, `${simp[simp.length - 1].lon.toFixed(3)} vs ${dense[dense.length - 1].lon.toFixed(3)}`);

  // Gerade Linie mit vielen Zwischenpunkten → RDP kollabiert auf wenige.
  const straight = Array.from({ length: 200 }, (_, i) => ({ lat: 47, lon: 11 + i * 0.005 }));
  const s2 = simplifyToCutLine(straight, 24);
  add('gerade Linie stark vereinfacht', s2.length <= 6, `${s2.length}`);

  // Ungültige Koordinaten herausgefiltert.
  const dirty = simplifyToCutLine([{ lat: 47, lon: 11 }, { lat: NaN, lon: 11 }, { lat: 47.5, lon: 11.5 }]);
  add('NaN gefiltert', dirty.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)));

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyTourImport: typeof verifyTourImport }).__verifyTourImport = verifyTourImport;
}
