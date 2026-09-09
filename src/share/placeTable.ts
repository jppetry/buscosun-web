/**
 * Teilen · Ortstabelle (Phase SH1).
 *
 * Der Slug im Pfad ist nur dann kurz, wenn er Name, Koordinate und Land selbst
 * trägt: `/wetterkarte/wind/muenchen` statt
 * `…/wind?ort=München&olat=48.1374&olon=11.5755&land=de` — 46 Zeichen weniger.
 * Die Auflösung leistet `src/router/placeSlugs.json` (198 Orte, aus
 * `scripts/seo/places.mjs`, `npm run seo:places`).
 *
 * ⚠ **Diese Datei gehört NICHT in den Start-Chunk.** Die Tabelle wiegt 3,5 KB
 * gzip, die Ratsche `eagerJs` (107,9) hat über dem IST (106,3) rund 1,6 KB Luft.
 * Importiert wird sie deshalb nur aus den **lazy** Seiten-Wrappern
 * (`src/router/pages/*`) und aus `useAppNav`; `urlState.ts` bekommt das Ergebnis
 * injiziert — dasselbe Muster wie `isModel` in `parseMapSearch`.
 */

// Import-Attribut: Node (Verifier) verlangt es seit v22 ausdrücklich; Vite/esbuild
// und Deno (Edge Function, SH6) verstehen dieselbe Schreibweise.
import ROWS from '../router/placeSlugs.json' with { type: 'json' };
import type { Country, Location } from '../types';
import { PLACE_SNAP_KM, deSlugName, distanceKm, isSlugShape, toSlug } from './placeSlug';

type Row = [slug: string, name: string, lat: number, lon: number, country: string];

const BY_SLUG = new Map<string, Row>((ROWS as Row[]).map((r) => [r[0], r]));

const asCountry = (c: string): Country => (c === 'AT' || c === 'CH' ? c : 'DE');

/** Slug → Ort der Tabelle; `null`, wenn unbekannt. */
export function placeBySlug(slug: string | null | undefined): Location | null {
  if (!isSlugShape(slug)) return null;
  const r = BY_SLUG.get(slug);
  return r ? { name: r[1], lat: r[2], lon: r[3], country: asCountry(r[4]) } : null;
}

export interface SlugForPlace {
  /** Immer gesetzt (auch für freie Orte) — er macht den Pfad lesbar. */
  slug: string;
  /**
   * `true` ⇒ der Slug löst Name, Koordinate und Land selbst auf; `ort`, `olat`
   * und `olon` entfallen. `false` ⇒ der Slug ist nur Schmuck, die Werte müssen
   * mit in die Query.
   */
  inTable: boolean;
}

/**
 * Ort → Pfadsegment. Der Tabellenweg gilt nur, wenn der Slug getroffen wird,
 * das Land stimmt UND die Koordinate innerhalb von `PLACE_SNAP_KM` liegt —
 * sonst würde ein geteilter Link den Marker stillschweigend versetzen.
 */
export function slugForPlace(loc: Location): SlugForPlace | null {
  const slug = toSlug(loc.name);
  if (!isSlugShape(slug)) return null;
  const r = BY_SLUG.get(slug);
  const inTable = !!r
    && asCountry(r[4]) === loc.country
    && distanceKm(loc.lat, loc.lon, r[2], r[3]) <= PLACE_SNAP_KM;
  return { slug, inTable };
}

/** Anzahl der Einträge — nur für Verifier/Diagnose. */
export const PLACE_TABLE_SIZE = BY_SLUG.size;

/** Alle Zeilen (Verifier: Gleichheitsbeweis gegen `scripts/seo/places.mjs`). */
export function placeTableRows(): ReadonlyArray<Location & { slug: string }> {
  return (ROWS as Row[]).map((r) => ({ slug: r[0], name: r[1], lat: r[2], lon: r[3], country: asCountry(r[4]) }));
}

// --- Pfad + Query → EIN Ort ----------------------------------------------------

export interface RoutePlace {
  place: Location | null;
  /** Slug des Pfadsegments (auch wenn unauflösbar) — für die kanonische Rückschreibung. */
  slug: string | null;
  /** Der Ort kommt vollständig aus der Tabelle (⇒ `ort`/`olat`/`olon` dürfen fehlen). */
  inTable: boolean;
  /** Ein Slug stand im Pfad, ließ sich aber weder auflösen noch mit `olat`/`olon` retten. */
  unresolved: boolean;
}

/**
 * Ort-Slug (Pfad) + `ort`/`olat`/`olon` (Query) → EIN Ort.
 *
 * Steht bewusst HIER und nicht in `urlState.ts`: dort wäre es eager, hier hängt
 * es ohnehin an der Ortstabelle und damit am lazy Chunk.
 *
 * Vorrang: **die Koordinate aus der Query gewinnt** — sie ist der Punkt, den der
 * Absender wirklich gewählt hat; der Tabelleneintrag ist nur das Ortszentrum.
 * Der Name kommt aus `ort=`, sonst aus der Tabelle, sonst notdürftig aus dem
 * Slug. Ein Slug ohne jede Auflösung ist **kein Fehler**: die Seite öffnet im
 * DACH-Überblick und sagt es (Vorgabe „robust gegen kaputte Links").
 */
export function resolveRoutePlace(slug: string | null | undefined, queryPlace: Location | null): RoutePlace {
  const s = isSlugShape(slug) ? slug : null;
  const table = s ? placeBySlug(s) : null;
  if (queryPlace) {
    const name = queryPlace.name || table?.name || (s ? deSlugName(s) : '');
    // Ohne jeden Namen bleibt es wie bisher: kein Ort (ein namenloser Marker
    // wäre in Suchfeld und Punktpanel eine leere Behauptung).
    if (!name) return { place: null, slug: s, inTable: false, unresolved: !!s };
    return { place: { ...queryPlace, name }, slug: s, inTable: false, unresolved: false };
  }
  if (table) return { place: table, slug: s, inTable: true, unresolved: false };
  return { place: null, slug: s, inTable: false, unresolved: !!s };
}
