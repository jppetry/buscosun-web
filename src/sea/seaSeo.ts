/**
 * Phase SS (audit/seewetter-seo.md) — the spot pages `/seewetter/<spot>` as indexable sub-routes of `/seewetter`.
 *
 * This module sits in the EAGER route table (`routes.ts`), so it carries only what the router, `RouteMeta` and the
 * sitemap need: slug, short label, title and description, built from the generated name table (`seaSpotNames.ts`).
 * H1, lead, paragraphs, facts and neighbour links come from `seaSeoText.ts` (lazy text chunk + build), the spot facts
 * behind them from `seaSpotFacts.ts` (generated from the published catalogue).
 *
 * Before SS the spot paths shared shell and canonical of `/seewetter`; each spot is now its own page with its own
 * canonical, because searches name the place ("seewetter sylt", "wellen kiel") and the page per spot already exists.
 */
import { SEA_SPOT_NAMES } from './seaSpotNames';

/** Last change of the spot texts (sitemap `lastmod` falls back to Git; this is the editorial date of the rows). */
export const SEA_SEO_UPDATED = '2026-11-02';
/** Number of spots in the name table — the route texts say this number instead of a rounded one. */
export const SEA_SPOT_COUNT = Object.keys(SEA_SPOT_NAMES).length;
const REGION = { nordsee: 'Nordsee', ostsee: 'Ostsee' } as const;

/** Sub-route rows (same shape as `SubRoute` in `routes.ts`). */
export function seaSeoSubs() {
  return Object.entries(SEA_SPOT_NAMES).map(([slug, [name, region]]) => ({
    slug,
    label: name,
    title: `Seewetter ${name} — Wind, Wellen, Böen`,
    description: `Seewetter ${name} (${REGION[region]}): Wind und Böen, Wellenhöhe mit Windsee und Dünung, Wasserstand und DWD-Seewetterbericht, stündlich bis 78 h.`,
    updated: SEA_SEO_UPDATED,
  }));
}
