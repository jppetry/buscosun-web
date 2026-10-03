/**
 * Phase AW (E-AW-4) — the 20 motorways with the most road-weather stations (AW-0, 03.10.2026,
 * `audit/autobahnwetter.md` §2.6), in descending order, for their own SEO sub-pages `/autobahnwetter/<slug>`.
 *
 * Prepared, not wired: the route table `src/router/routes.ts` is part of the eager bundle and the route is `noindex`
 * until Gate C. At Gate C (`ROAD_LIVE`) these become `subs` of the route, get texts in `src/seo/subRouteTexts.ts`,
 * shells and Netlify rewrites (V-AW-8).
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

/** Sub-route definitions for Gate C (same shape as `SubRoute` in `routes.ts`). */
export function roadSeoSubs() {
  return ROAD_SEO_MOTORWAYS.map(([slug, name, span]) => ({
    slug,
    title: `${name} — Glätte und Fahrbahnzustand`,
    description: `Fahrbahntemperatur und -zustand an den Glättemeldeanlagen der ${name} (${span}), alle 15 Minuten gemessen — als Streckenband.`,
  }));
}
