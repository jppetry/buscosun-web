/**
 * Phase AW (E-AW-4) — the 20 motorways with the most road-weather stations (AW-0, 03.10.2026,
 * `audit/autobahnwetter.md` §2.6), in descending order, for their own SEO sub-pages `/autobahnwetter/<slug>`.
 *
 * Wired behind `ROAD_INDEXABLE` in `src/router/routes.ts` (audit/seo-nischen.md §6, released in Phase SA,
 * audit/seo-autobahnwetter.md). This module is EAGER (routes.ts imports it): only slug, name, span and the short
 * title/description live here. The page texts (`roadSeoText`) and their numbers (`roadSeoFacts.ts`, generated) sit in
 * `roadSeoTexts.ts`, which only the text chunk and the build read.
 */
export const ROAD_SEO_MOTORWAYS: ReadonlyArray<readonly [slug: string, name: string, span: string]> = [
  ['a1', 'A 1', 'Heiligenhafen bis Saarbrücken'], ['a7', 'A 7', 'Flensburg bis Füssen'], ['a8', 'A 8', 'Karlsruhe, Stuttgart bis Salzburg'],
  ['a2', 'A 2', 'Oberhausen bis Berlin'], ['a9', 'A 9', 'Berlin bis München'], ['a3', 'A 3', 'Emmerich bis Passau'],
  ['a4', 'A 4', 'Aachen bis Görlitz'], ['a44', 'A 44', 'Aachen bis Kassel'], ['a6', 'A 6', 'Saarbrücken bis Waidhaus'],
  ['a45', 'A 45', 'Dortmund bis Seligenstädter Dreieck'], ['a96', 'A 96', 'Lindau bis München'], ['a93', 'A 93', 'Hof bis Kufstein'],
  ['a99', 'A 99', 'Autobahnring München'], ['a71', 'A 71', 'Sangerhausen bis Schweinfurt'], ['a5', 'A 5', 'Hattenbach bis Basel'],
  ['a61', 'A 61', 'Venlo bis Hockenheim'], ['a20', 'A 20', 'Bad Segeberg bis Uckermark'], ['a46', 'A 46', 'Düsseldorf bis Sauerland'],
  ['a73', 'A 73', 'Suhl bis Nürnberg'], ['a31', 'A 31', 'Emden bis Bottrop'],
];

/**
 * How people type the motorway in a search box: „A8", not the typographic „A 8" (Phase SA, E-SA-2). Titles and H1 use this
 * form, the running text keeps „A 8".
 */
export function roadSeoQuery(slug: string): string {
  return slug.toUpperCase();
}

/** Sub-route definitions behind `ROAD_INDEXABLE` (same shape as `SubRoute` in `routes.ts`). */
export function roadSeoSubs() {
  return ROAD_SEO_MOTORWAYS.map(([slug, , span]) => {
    const q = roadSeoQuery(slug);
    return {
      slug,
      title: `Autobahnwetter ${q} — Glätte, Wetter und Fahrbahntemperatur`,
      description: `Wetter und Glätte auf der ${q} (${span}): Fahrbahntemperatur und -zustand der Glättemeldeanlagen alle 15 Minuten, Prognose bis 48 h.`,
    };
  });
}
