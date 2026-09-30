/**
 * Which view a map URL asks for — the ONE place that reads `ansicht=dashboard` outside the dashboard chunk
 * (E-DB-20, audit/dashboard.md §11). Imported by the router, the route prefetch and the dashboard's URL module, so it
 * sits in the start chunk: keep it tiny and free of imports.
 *
 * Same rule as `dashViewOf` (first occurrence wins, only the exact value `dashboard` counts); the generated route shells
 * carry the same check inline (`scripts/generate-seo.mjs`, tied to these constants by `verify-routing`).
 */
export const DASH_VIEW_KEY = 'ansicht';
export const DASH_VIEW_DASHBOARD = 'dashboard';

export function isDashboardSearch(search: string): boolean {
  try { return new URLSearchParams(search).get(DASH_VIEW_KEY) === DASH_VIEW_DASHBOARD; } catch { return false; }
}
