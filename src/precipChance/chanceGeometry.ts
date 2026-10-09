/**
 * Phase RC: Geometrie der Chance-Karte aus einem Wahrscheinlichkeitsgitter des Kartenfelds — Bänder (≥ 10 / 30 / 50 / 70 / 90 %,
 * Punktdichte), Lücken (schraffiert) und Konturen 30 / 50 / 70 / 90 % (Linien mit Beschriftung) als GeoJSON.
 * Rein (kein DOM, kein Netz): Karte und `verify:regenchance` rechnen dasselbe.
 */
import type { FieldGrid } from '../point/fieldFormat';
import { CHANCE_BANDS, CHANCE_CONTOURS } from './chanceModel';
import { isoLines, isoMultiPolygon, type GridGeo, type Ring } from './contours';

export function multi(polys: Ring[][], props: GeoJSON.GeoJsonProperties): GeoJSON.Feature | null {
  if (!polys.length) return null;
  return { type: 'Feature', properties: props, geometry: { type: 'MultiPolygon', coordinates: polys } };
}

function geoOf(g: FieldGrid): GridGeo {
  return { width: g.width, height: g.height, lon0: g.lon0, lat0: g.lat0, deg: g.deg };
}

/** Rechteck des ganzen Feldgitters (für „Bild fehlt ganz"). */
export function gridRect(g: FieldGrid): Ring[][] {
  const [[w, n], [e], [, s]] = [g.corners[0], g.corners[1], g.corners[2]];
  return [[[[w, s], [e, s], [e, n], [w, n], [w, s]]]];
}

/** Bänder, Lücken und Konturen eines Wahrscheinlichkeitsgitters (rein — auch der Verifier ruft es). */
export interface ChanceGeometry {
  bands: GeoJSON.FeatureCollection;
  missing: GeoJSON.FeatureCollection;
  lines: GeoJSON.FeatureCollection;
  missingCells: number;
  maxP: number | null;
}

export function chanceGeometry(values: Float32Array, grid: FieldGrid): ChanceGeometry {
  const g = geoOf(grid);
  const bands: GeoJSON.Feature[] = [];
  CHANCE_BANDS.forEach((lvl, k) => { const f = multi(isoMultiPolygon(values, g, lvl), { k, lvl }); if (f) bands.push(f); });
  const mask = new Float32Array(values.length);
  let missingCells = 0, maxP: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (Number.isNaN(values[i])) { mask[i] = 1; missingCells++; } else if (maxP == null || values[i] > maxP) maxP = values[i];
  }
  const miss = missingCells ? multi(isoMultiPolygon(mask, g, 0.5), {}) : null;
  const lines: GeoJSON.Feature[] = [];
  for (const lvl of CHANCE_CONTOURS) {
    const rings = isoLines(values, g, lvl);
    if (rings.length) lines.push({ type: 'Feature', properties: { lvl, label: `${Math.round(lvl * 100)} %` }, geometry: { type: 'MultiLineString', coordinates: rings } });
  }
  return { bands: { type: 'FeatureCollection', features: bands }, missing: { type: 'FeatureCollection', features: miss ? [miss] : [] }, lines: { type: 'FeatureCollection', features: lines }, missingCells, maxP };
}

