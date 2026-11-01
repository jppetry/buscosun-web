/**
 * Phase AW (E-AW-4) — the 20 motorways with the most road-weather stations (AW-0, 03.10.2026,
 * `audit/autobahnwetter.md` §2.6), in descending order, for their own SEO sub-pages `/autobahnwetter/<slug>`.
 *
 * Wired behind `ROAD_INDEXABLE` in `src/router/routes.ts` (audit/seo-nischen.md §6): while it is off, the route is `noindex` and these
 * rows are not in the eager bundle. On release they become `subs`, their texts come from `roadSeoText`, and the Netlify rewrites from
 * `audit/seo-nischen/road-release.toml` go in (V-AW-8).
 */
export const ROAD_SEO_MOTORWAYS: ReadonlyArray<readonly [slug: string, name: string, span: string]> = [
  ['a1', 'A 1', 'Heiligenhafen bis Saarbrücken'], ['a7', 'A 7', 'Flensburg bis Füssen'], ['a8', 'A 8', 'Karlsruhe, Stuttgart, München bis Salzburg'],
  ['a2', 'A 2', 'Oberhausen bis Berlin'], ['a9', 'A 9', 'Berlin bis München'], ['a3', 'A 3', 'Emmerich bis Passau'],
  ['a4', 'A 4', 'Aachen bis Görlitz'], ['a44', 'A 44', 'Ruhrgebiet bis Kassel'], ['a6', 'A 6', 'Saarbrücken bis Waidhaus'],
  ['a45', 'A 45', 'Dortmund bis Aschaffenburg'], ['a96', 'A 96', 'Lindau bis München'], ['a93', 'A 93', 'Hof bis Kufstein'],
  ['a99', 'A 99', 'Autobahnring München'], ['a71', 'A 71', 'Sangerhausen bis Schweinfurt'], ['a5', 'A 5', 'Hattenbach bis Basel'],
  ['a61', 'A 61', 'Venlo bis Hockenheim'], ['a20', 'A 20', 'Bad Segeberg bis Uckermark'], ['a46', 'A 46', 'Düsseldorf bis Sauerland'],
  ['a73', 'A 73', 'Suhl bis Nürnberg'], ['a31', 'A 31', 'Emden bis Bottrop'],
];

/** The text of one motorway page (same shape as `SeoText` in `src/seo/layerSeoTexts.ts`); only read once the route is released. */
export function roadSeoText(slug: string) {
  const row = ROAD_SEO_MOTORWAYS.find(([s]) => s === slug);
  if (!row) return null;
  const [, name, span] = row;
  return {
    h1: `${name}: Was messen die Glättemeldeanlagen?`,
    lead: `Diese Seite zeigt, was die Glättemeldeanlagen an der ${name} (${span}) melden: Fahrbahntemperatur, Fahrbahnzustand, Wasserfilm, Luft und Taupunkt, alle 15 Minuten aus dem Straßenwetter-System des Deutschen Wetterdienstes, geprüft und entlang der Strecke als Band. Dazu kommt das Wetter entlang der ${name} aus buscosun Fusion. Sie ist kein amtliches Warnprodukt und keine Verkehrsmeldung.`,
    body: [
      `Das Band ordnet die Messstellen der ${name} nach Kilometer und Fahrtrichtung. Ein Wert, der eine Prüfregel nicht besteht, erscheint als Lücke mit Grund und nicht als Zahl. Zwischen zwei Anlagen, auf Brücken und in Senken kann die Fahrbahn anders sein, als die nächste Anlage meldet.`,
      `Die Stunden voraus sind Wetter an der Strecke und keine Fahrbahnmessung. Amtliche Warnungen stehen im Wortlaut beim Deutschen Wetterdienst, Baustellen und Sperrungen bei der Autobahn GmbH des Bundes.`,
    ],
    facts: [
      { label: 'Quelle', text: 'Glättemeldeanlagen über das Straßenwetter-System des DWD · buscosun Fusion für die Stunden voraus' },
      { label: 'Takt', text: 'Messung alle 15 Minuten, Vorhersage stündlich bis 48 Stunden' },
      { label: 'Grenze', text: 'Messung an einzelnen Punkten; kein amtliches Warnprodukt, keine Verkehrsmeldung' },
    ],
    official: { text: 'Baustellen und Sperrungen meldet die', label: 'Autobahn GmbH', href: 'https://www.autobahn.de/' },
    links: [
      { label: 'So liest du das Autobahnwetter', href: '/funktionen/autobahnwetter/' },
      { label: 'Prüfregeln der Messwerte', href: '/methodik/autobahnwetter-pruefregeln/' },
    ],
    explainer: null,
  };
}

/** Sub-route definitions behind `ROAD_INDEXABLE` (same shape as `SubRoute` in `routes.ts`). */
export function roadSeoSubs() {
  return ROAD_SEO_MOTORWAYS.map(([slug, name, span]) => ({
    slug,
    title: `${name} — Glätte und Fahrbahnzustand`,
    description: `Fahrbahntemperatur und -zustand an den Glättemeldeanlagen der ${name} (${span}), alle 15 Minuten gemessen — als Streckenband.`,
  }));
}
