/**
 * Ein Eingriff in den OpenFreeMap-Stil „liberty" — geteilt, nicht kopiert.
 *
 * Herausgelöst aus `src/radar/RadarMap.tsx` (V-RL-3, 2026-08-25), als die
 * Gelände-Ansicht der Tourenplanung (R3D-5) denselben Stil lud und dieselbe
 * Warnung warf. Die Regel des Projekts ist „1:1 heißt importieren, nicht
 * kopieren"; deshalb steht die Funktion jetzt an einer Stelle und beide Karten
 * rufen sie auf.
 */

import type { FilterSpecification, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';

/**
 * V-RL-3: der Stil filtert seine US-Shield-Layer mit
 * `["<=", ["get", "ref_length"], 6]` — für Straßen ohne `ref` ist das `null`,
 * und der MapLibre-Worker warnt je Kachel „Expected value to be of type number,
 * but found null" (per Bisect auf `highway-shield-us-interstate` /
 * `road_shield_us` eingegrenzt). Die Layer haben in DACH keine Treffer; ihr
 * Filter bekommt ein `coalesce`, damit echte Warnungen nicht darin untergehen.
 * **Kein anderer Stil-Eingriff.**
 */
export function patchLibertyRefLength(map: MapLibreMap): void {
  const style = map.getStyle();
  if (!style?.layers) return;
  const patch = (e: unknown): unknown => {
    if (!Array.isArray(e)) return e;
    if (e.length === 2 && e[0] === 'get' && e[1] === 'ref_length') return ['coalesce', e, 99];
    return e.map(patch);
  };
  for (const l of style.layers) {
    const f = (l as { filter?: unknown }).filter;
    if (!f || !JSON.stringify(f).includes('"ref_length"')) continue;
    map.setFilter(l.id, patch(f) as FilterSpecification);
  }
}

/**
 * BD2: dieselbe Korrektur als reine Stil-Transformation — für `setStyle(url, { transformStyle })`,
 * damit der Filter schon steht, BEVOR der Worker die ersten Kacheln parst (mit `setFilter` nach
 * `style.load` warnten die ersten zwei Kacheln der Minikarte trotzdem, gemessen 2026-08-29).
 * Kein anderer Stil-Eingriff.
 */
export function patchRefLengthStyle(style: StyleSpecification): StyleSpecification {
  if (!style?.layers) return style;
  const patch = (e: unknown): unknown => {
    if (!Array.isArray(e)) return e;
    if (e.length === 2 && e[0] === 'get' && e[1] === 'ref_length') return ['coalesce', e, 99];
    return e.map(patch);
  };
  return {
    ...style,
    layers: style.layers.map((l) => {
      const f = (l as { filter?: unknown }).filter;
      return f && JSON.stringify(f).includes('"ref_length"') ? { ...l, filter: patch(f) as FilterSpecification } as typeof l : l;
    }),
  };
}
