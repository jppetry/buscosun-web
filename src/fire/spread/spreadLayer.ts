/**
 * The map side of the spread forecast: two sprites and one GeoJSON source.
 *
 * The sprite technique is copied — deliberately, not imported — from
 * `src/MapView.tsx:253` (`makeCellArrowImage`, storm-cell tracks): a chevron
 * drawn on a canvas, pointing north, registered with `map.addImage` and rotated
 * per feature via `icon-rotate`. `src/fire/*` must not import from `../MapView`
 * (the verifier enforces it), so the 20 lines live here.
 *
 * Two design rules the verifier holds in place:
 *
 *  • **The arrow has no size channel.** `icon-size` interpolates on zoom only.
 *    Scaling an arrow by the possible distance would put a claim into a length
 *    that the model cannot support; the distance is a span and belongs in text.
 *  • **The fan is drawn as an open sector with a dashed edge**, and its own
 *    sentence travels with it (`FAN_CAVEAT`), because a filled sector on a map
 *    reads as „this area will burn" unless it is told not to.
 */

import type { FireSpread } from './spreadForecast';
import type { SpreadRun } from './spreadRun';

export const FIRE_SPREAD_ATTRIBUTION =
  'Ausbreitungsrichtung: Rechnung buscosun nach dem kanadischen FBP-System '
  + '(Forestry Canada 1992 / Wotton u. a. 2009) aus '
  + '<a href="https://www.dwd.de/DE/leistungen/opendata/opendata.html" target="_blank" '
  + 'rel="noopener">DWD</a> ICON-D2 (u_10m · v_10m · relhum_2m · t_2m) · CC BY 4.0 · '
  + 'Höhenmodell <a href="https://github.com/tilezen/joerd" target="_blank" rel="noopener">Mapzen '
  + 'Terrarium</a> (AWS Open Data) · Modellwert, kein amtliches Produkt';

export const SPREAD_SOURCE_ID = 'fire-spread';
export const SPREAD_ARROW_LAYER_ID = 'fire-spread-arrows';
export const SPREAD_FAN_LAYER_ID = 'fire-spread-fan';
export const SPREAD_FAN_LINE_LAYER_ID = 'fire-spread-fan-line';
export const SPREAD_ARROW_IMAGE_ID = 'fire-spread-arrow';
/** Suffix appended by the data-driven `icon-image` expression. */
export const SPREAD_ARROW_UNSURE_SUFFIX = '-unsure';
/** Above this fan width the arrow switches to its hollow variant. */
export const UNSURE_FAN_DEG = 60;
/** Segments of the sector polygon — enough to look round at city zoom. */
const FAN_SEGMENTS = 24;
/** Metres per degree of latitude (as in `terrainPhysics.ts`). */
const M_PER_DEG_LAT = 110_540;

const INK = '#2A2622';
const FIRE = '#C2542B';
const CREAM = '#F4EFE6';

/**
 * Chevron pointing north on a 44×44 canvas: dark casing, then the coloured
 * core. The solid variant is filled, the „unsure" variant is hollow — same
 * shape, visibly less certainty. `null` without a DOM (headless/SSR).
 */
export function makeSpreadArrowImage(unsure = false): ImageData | null {
  if (typeof document === 'undefined') return null;
  const S = 44;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.translate(S / 2, S / 2);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Shaft + head, drawn once as a path and stroked twice (casing, then core).
  // The shaft reaches the bottom edge because the layer anchors the icon there:
  // the arrow grows OUT of the fire instead of sitting on top of it.
  const path = new Path2D();
  path.moveTo(0, S / 2 - 1);
  path.lineTo(0, -8);
  path.moveTo(-9, 0);
  path.lineTo(0, -13);
  path.lineTo(9, 0);

  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 7;
  ctx.stroke(path);

  ctx.globalAlpha = 1;
  ctx.strokeStyle = unsure ? CREAM : FIRE;
  ctx.lineWidth = unsure ? 2.5 : 4;
  if (unsure) ctx.setLineDash([5, 3]);
  ctx.stroke(path);

  return ctx.getImageData(0, 0, S, S);
}

/** Both sprite ids in one place, so registration and the verifier agree. */
export const SPREAD_ARROW_IMAGE_IDS: readonly string[] = [
  SPREAD_ARROW_IMAGE_ID,
  SPREAD_ARROW_IMAGE_ID + SPREAD_ARROW_UNSURE_SUFFIX,
] as const;

export interface SpreadArrowProps {
  id: string;
  kind: 'arrow' | 'fan';
  /** Degrees, "where to" — feeds `icon-rotate`. */
  bearing: number;
  /** '' or '-unsure', selected by `['concat', …]`. */
  variant: string;
  /** Draw order: stronger fires on top. */
  rank: number;
}

/** Sector polygon around a point: `bearing ± width/2`, radius in metres. */
export function sectorRing(lat: number, lon: number, bearingDeg: number, widthDeg: number, radiusM: number): number[][] {
  const halfRad = (Math.min(180, Math.max(0, widthDeg)) / 2) * Math.PI / 180;
  const cRad = bearingDeg * Math.PI / 180;
  const cosLat = Math.max(0.2, Math.cos(lat * Math.PI / 180));
  const ring: number[][] = [[lon, lat]];
  for (let i = 0; i <= FAN_SEGMENTS; i++) {
    const a = cRad - halfRad + (2 * halfRad * i) / FAN_SEGMENTS;
    const dLat = (radiusM * Math.cos(a)) / M_PER_DEG_LAT;
    const dLon = (radiusM * Math.sin(a)) / (M_PER_DEG_LAT * cosLat);
    ring.push([lon + dLon, lat + dLat]);
  }
  ring.push([lon, lat]);
  return ring;
}

/**
 * The whole run as one GeoJSON source. A fire without a vector contributes
 * NOTHING — the reason for its silence lives in the panel, not as a placeholder
 * on the map.
 */
export function spreadToGeoJSON(run: SpreadRun | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (!run) return { type: 'FeatureCollection', features };

  run.list.forEach((s: FireSpread, idx) => {
    const v = s.shown?.vector;
    if (!v) return;
    const rank = run.list.length - idx;
    const unsure = (s.fanDeg ?? 0) > UNSURE_FAN_DEG;

    // Fan first, so it lies under its own arrow within the same source.
    const reach = s.shown?.reach;
    if (reach && s.fanDeg != null && s.fanDeg > 0 && reach.maxM > 0) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [sectorRing(s.lat, s.lon, v.razDeg, s.fanDeg, reach.maxM)] },
        properties: { id: s.fireId, kind: 'fan', bearing: v.razDeg, variant: '', rank } satisfies SpreadArrowProps,
      });
    }

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: {
        id: s.fireId, kind: 'arrow', bearing: v.razDeg,
        variant: unsure ? SPREAD_ARROW_UNSURE_SUFFIX : '', rank,
      } satisfies SpreadArrowProps,
    });
  });

  return { type: 'FeatureCollection', features };
}

// ---------------------------------------------------------------------------
// Self-verification (Muster D-12; headless über verify:fire-spread).
// DOM-free: the sprite path is covered by the source probes and the browser run.
// ---------------------------------------------------------------------------

export interface LayerCheck { name: string; ok: boolean; detail?: string }

export function verifySpreadLayer(): { checks: LayerCheck[]; passed: number; total: number } {
  const checks: LayerCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  add('ohne Lauf keine Features', spreadToGeoJSON(null).features.length === 0);

  const mk = (over: Partial<FireSpread>): FireSpread => ({
    fireId: 'f1', lat: 48, lon: 11, slope: null, slopeSource: null, fuel: 'C3',
    fuelSource: 'assumed', fuels: [], hours: [], shownHour: 1, shown: null, horizon: null,
    rateNow: null, fanDeg: null, veerDeg: null, observedBearingDeg: null, observedDeltaDeg: null,
    reason: null, ...over,
  } as FireSpread);
  const run = (list: FireSpread[]): SpreadRun => ({
    byId: new Map(), list, considered: list.length, computed: 0, capped: 0,
    demCells: 0, cap: 25, demCap: 12, hoursAvailable: 6, horizonHour: 5, maxHour: 6,
    windRunAtMs: null, fwRunAtMs: null, shownHour: 1,
  });

  const withVector = mk({
    shown: {
      atMs: 0, hour: 1, vector: { razDeg: 70, wsvKmh: 18, wseKmh: 0, terrainTurnDeg: 0, lb: 2, rosMmin: 3 },
      band: null, reach: { minM: 300, maxM: 1200, minFuel: 'D1', maxFuel: 'O1B', hours: 1 },
      iszValue: 3.5, wind: { speedKmh: 18, fromDeg: 250 }, gaps: [],
    },
    fanDeg: 30,
  });

  const fc = spreadToGeoJSON(run([withVector]));
  add('ein Brand mit Vektor liefert Pfeil und Fächer', fc.features.length === 2);
  const arrow = fc.features.find((f) => f.properties?.kind === 'arrow');
  add('der Pfeil trägt seine Richtung als Eigenschaft', arrow?.properties?.bearing === 70);
  add('sichere Richtung ⇒ massiver Pfeil', arrow?.properties?.variant === '');

  const unsure = spreadToGeoJSON(run([mk({ ...withVector, fanDeg: 120 } as Partial<FireSpread>)]));
  add('breiter Fächer ⇒ hohler Pfeil',
    unsure.features.find((f) => f.properties?.kind === 'arrow')?.properties?.variant === SPREAD_ARROW_UNSURE_SUFFIX);

  // --- The honesty rule on the map: a gap draws nothing at all.
  add('Brand ohne Vektor zeichnet nichts', spreadToGeoJSON(run([mk({ reason: 'no-terrain' })])).features.length === 0);
  add('Vektor ohne Reichweite zeichnet den Pfeil, aber keinen Fächer',
    spreadToGeoJSON(run([mk({ ...withVector, shown: { ...withVector.shown!, reach: null } } as Partial<FireSpread>)]))
      .features.filter((f) => f.properties?.kind === 'fan').length === 0);
  add('Fächerbreite 0 ⇒ kein Fächer',
    spreadToGeoJSON(run([mk({ ...withVector, fanDeg: 0 } as Partial<FireSpread>)]))
      .features.filter((f) => f.properties?.kind === 'fan').length === 0);

  // --- Sector geometry.
  const ring = sectorRing(48, 11, 90, 60, 1000);
  add('der Sektor ist geschlossen und beginnt am Brand',
    ring[0][0] === 11 && ring[0][1] === 48
    && ring[ring.length - 1][0] === 11 && ring[ring.length - 1][1] === 48);
  add('der Sektor öffnet sich in die Richtung des Pfeils',
    ring[Math.floor(ring.length / 2)][0] > 11 && Math.abs(ring[Math.floor(ring.length / 2)][1] - 48) < 0.002);
  const far = sectorRing(48, 11, 0, 30, 2000);
  add('größere Reichweite ⇒ größerer Sektor', far[5][1] - 48 > sectorRing(48, 11, 0, 30, 1000)[5][1] - 48);
  add('Fächerbreite wird auf 180° gedeckelt', sectorRing(48, 11, 0, 999, 1000).length === ring.length);

  // --- Sprites and attribution.
  add('zwei Sprite-Kennungen, beide mit demselben Stamm',
    SPREAD_ARROW_IMAGE_IDS.length === 2 && SPREAD_ARROW_IMAGE_IDS.every((i) => i.startsWith(SPREAD_ARROW_IMAGE_ID)));
  add('ohne DOM kein Sprite (kein Absturz)',
    typeof document === 'undefined' ? makeSpreadArrowImage() === null : true);
  add('die Lizenzzeile nennt DWD, Höhenmodell, Methode und den Modellvorbehalt',
    /DWD/.test(FIRE_SPREAD_ATTRIBUTION) && /Terrarium/.test(FIRE_SPREAD_ATTRIBUTION)
    && /FBP/.test(FIRE_SPREAD_ATTRIBUTION) && /kein amtliches Produkt/.test(FIRE_SPREAD_ATTRIBUTION));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
