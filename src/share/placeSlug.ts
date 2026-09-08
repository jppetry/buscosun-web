/**
 * Teilen · Ort-Slug (Phase SH1, pur, **importfrei**).
 *
 * Der Ortsname als lesbares Pfadsegment: `/wetterkarte/wind/muenchen`. Diese
 * Datei enthält NUR Zeichenketten-Regeln und Geometrie — keine Ortstabelle, kein
 * DOM, kein Import. Zwei Gründe:
 *
 *  1. `src/router/urlState.ts` liegt im **eager** Start-Chunk. Die Ortstabelle
 *     (`placeSlugs.json`, 3,5 KB gzip) darf dort nicht hinein — die Ratsche
 *     `eagerJs` hat 1,6 KB Luft. Die Tabelle steht deshalb in `placeTable.ts`
 *     und wird von den (lazy) Seiten-Wrappern injiziert, genau wie `isModel`
 *     in `parseMapSearch`.
 *  2. Die Netlify Edge Function der OG-Meta (Stufe SH6) importiert dieselbe
 *     Regel. Deno löst `.ts` direkt auf — solange die Datei nichts nachzieht.
 *
 * ⚠ **Die Regel steht zweimal im Repo**: hier und als `toSlug()` in
 * `scripts/seo/places.mjs`. Das ist keine Nachlässigkeit, sondern erzwungen:
 * `npm run verify:seo` startet `content.mjs` OHNE `--experimental-strip-types`,
 * kann also kein TS importieren. `verify:share` beweist die Gleichheit über
 * **alle** Orte der echten Liste plus die Sonderfälle unten — eine geprüfte
 * Dublette statt einer stillen.
 */

/** Regel: Kleinbuchstaben, ae/oe/ue/ss, alles Übrige zu Bindestrichen. */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Sieht die Zeichenkette wie ein Slug aus? (Pfadsegment-Prüfung vor jedem Lookup.) */
export function isSlugShape(s: string | null | undefined): s is string {
  return !!s && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 80;
}

/**
 * Notname aus einem Slug, wenn weder Tabelle noch `ort=` etwas hergeben —
 * „feldberg-schwarzwald" ⇒ „Feldberg Schwarzwald". Bewusst **verlustbehaftet**
 * (Umlaute und Satzzeichen sind weg); deshalb schreibt der Erzeuger `ort=`,
 * sobald `toSlug(name)` den Namen nicht verlustfrei trägt.
 */
export function deSlugName(slug: string): string {
  return slug.split('-').filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Trägt der Slug den Anzeigenamen verlustfrei? Nur dann darf `ort=` entfallen.
 * „Muenchen" ⇒ ja, „München" ⇒ nein (der Slug wäre gleich, der Name nicht).
 */
export function slugCarriesName(slug: string, name: string): boolean {
  return toSlug(name) === slug && deSlugName(slug) === name;
}

/**
 * Wie weit darf die echte Koordinate vom Tabelleneintrag abweichen, damit der
 * Slug allein genügt (und `olat`/`olon` entfallen)?
 *
 * 500 m ist die Antwort auf eine Messung, nicht auf ein Gefühl: die Ortsliste
 * (`scripts/seo/places.mjs`) trägt Ortszentren auf drei Nachkommastellen, der
 * Geocoder (Nominatim) liefert für dieselben Orte praktisch dieselbe Stelle —
 * München 48,1371/11,5754 gegen Tabelle 48,137/11,575 sind **40 m**. Alles
 * darüber ist ein anderer Punkt (ein Ortsteil, ein Gipfel, ein Startplatz) und
 * bekommt seine Koordinate mit in die URL. `placePageFor()` darf großzügiger
 * sein (3 km) — die verlinkt nur eine Seite, hier verschiebt sich ein Marker.
 */
export const PLACE_SNAP_KM = 0.5;

/** Abstand in km (äquidistante Näherung — bei < 5 km unter 1 ‰ Fehler). */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const kx = Math.cos(((aLat + bLat) / 2) * (Math.PI / 180)) * 111.32;
  const dx = (bLon - aLon) * kx;
  const dy = (bLat - aLat) * 110.57;
  return Math.hypot(dx, dy);
}

// --- Selbstverifikation (Muster D-12) ---------------------------------------

export interface PlaceSlugCheck { name: string; ok: boolean; detail?: string }

/** Namen, an denen sich Slug-Regeln erfahrungsgemäß unterscheiden. */
export const SLUG_EDGE_CASES: ReadonlyArray<readonly [name: string, slug: string]> = [
  ['München', 'muenchen'],
  ['Köln', 'koeln'],
  ['Düsseldorf', 'duesseldorf'],
  ['Frankfurt am Main', 'frankfurt-am-main'],
  ['Feldberg (Schwarzwald)', 'feldberg-schwarzwald'],
  ['Sankt Anton am Arlberg', 'sankt-anton-am-arlberg'],
  ['Weißenfels', 'weissenfels'],
  ['Zürich', 'zuerich'],
  ['Genève', 'gen-ve'],
  ['Halle (Saale)', 'halle-saale'],
  ['Bad Reichenhall', 'bad-reichenhall'],
  ['St. Moritz', 'st-moritz'],
  ['—', ''],
];

export function verifyPlaceSlug(): { checks: PlaceSlugCheck[]; passed: number; failed: number } {
  const checks: PlaceSlugCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  for (const [name, slug] of SLUG_EDGE_CASES) {
    add(`toSlug("${name}") ⇒ "${slug}"`, toSlug(name) === slug, toSlug(name));
  }
  add('Slug-Form: nur [a-z0-9-], kein führender/abschließender Bindestrich',
    SLUG_EDGE_CASES.every(([, s]) => s === '' || isSlugShape(s)));
  add('isSlugShape lehnt Großbuchstaben, Punkte, Doppel-Bindestriche und Leerzeichen ab',
    !isSlugShape('Muenchen') && !isSlugShape('st.moritz') && !isSlugShape('a--b') && !isSlugShape('a b') && !isSlugShape('') && !isSlugShape('-a'));
  add('toSlug ist idempotent', SLUG_EDGE_CASES.every(([name]) => toSlug(toSlug(name)) === toSlug(name)));

  add('deSlugName kehrt einfache Namen um', deSlugName('bad-reichenhall') === 'Bad Reichenhall' && deSlugName('stuttgart') === 'Stuttgart');
  add('slugCarriesName: verlustfrei ⇒ true', slugCarriesName('stuttgart', 'Stuttgart') && slugCarriesName('bad-reichenhall', 'Bad Reichenhall'));
  add('slugCarriesName: Umlaut/Klammer ⇒ false (ort= wird gebraucht)',
    !slugCarriesName('muenchen', 'München') && !slugCarriesName('feldberg-schwarzwald', 'Feldberg (Schwarzwald)'));

  // Geometrie: die 500-m-Schwelle muss den gemessenen München-Fall halten.
  const dMuc = distanceKm(48.1371, 11.5754, 48.137, 11.575);
  add('München Geocoder vs. Tabelle < 500 m (Slug allein genügt)', dMuc < PLACE_SNAP_KM, `${Math.round(dMuc * 1000)} m`);
  const dFar = distanceKm(48.1371, 11.5754, 48.20, 11.60);
  add('7 km entfernt ⇒ über der Schwelle (Koordinate muss mit)', dFar > PLACE_SNAP_KM, `${dFar.toFixed(1)} km`);
  add('Abstand ist symmetrisch und null bei Gleichheit',
    Math.abs(distanceKm(47, 11, 48, 12) - distanceKm(48, 12, 47, 11)) < 1e-9 && distanceKm(47, 11, 47, 11) === 0);

  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
