/**
 * Source files per sitemap page group. The sitemap `lastmod` of a group is the date of the last
 * commit that touched one of these files (`gitDate.mjs`). One list, two readers: the generator
 * (`generate-seo.mjs`) writes the dates, the verifier (`verify-seo.mjs`) recomputes them from Git
 * and compares — so a build date or placeholder is caught by value, not by a guess about spread.
 * Paths are relative to the repo root.
 */
export const SITEMAP_SOURCES = {
  routes: ['src/router/routes.ts', 'src/seo/subRouteTexts.ts'],
  // Phase SA: the Autobahnwetter pages have their own sources (texts, generated numbers); a commit to routes.ts affects them too.
  road: ['src/router/routes.ts', 'src/seo/routeTexts.ts', 'src/road/roadSeo.ts', 'src/road/roadSeoTexts.ts', 'src/road/roadSeoFacts.ts'],
  places: ['scripts/seo/places.mjs', 'scripts/seo/placeContent.mjs', 'scripts/seo/data/place-climate.json', 'scripts/seo/data/place-terrain.json', 'scripts/seo/data/place-modules.json'],
  explainers: ['scripts/seo/explainers.mjs', 'scripts/seo/explainers-extra.mjs'],
  tools: ['scripts/seo/tools.mjs'],
  events: ['scripts/seo/events.mjs'],
  legal: ['scripts/seo/legal.mjs', 'scripts/seo/licenses.mjs'],
  methodik: ['scripts/seo/methodik.mjs'],
  glossary: ['scripts/seo/glossary.mjs'],
  audiences: ['scripts/seo/audiences.mjs'],
  // Phase SS: Seewetter hub and spot pages — table, fact sheets, texts (not the forecast, which only the app shows).
  sea: ['src/router/routes.ts', 'src/sea/seaSeo.ts', 'src/sea/seaSeoText.ts', 'src/sea/seaSpotFacts.ts', 'src/seo/routeTexts.ts'],
};

/** Groups whose date appears in the four core lists in every build (start page, place pages). */
export const SITEMAP_ALWAYS_USED = ['routes', 'places'];
