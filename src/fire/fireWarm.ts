/**
 * Early start of the Brandradar's first data requests (pattern LE1/H2, `src/router/prefetch.ts`).
 *
 * The router calls `warmFireStart` as soon as the route is known — in parallel with the download of the page chunk
 * (FireRoute + maplibre, ≈ 2.4 MB raw), not after it. The readers (`firmsHotspots.ts`, `effisSeasonEurope.ts`) take the
 * running answer by its exact URL (`takeWarmFire`); without one (other window, TTL over, no early start) they fetch as
 * before — lossless. A URL here that no reader asks for only costs that one request.
 *
 * Deliberately light (lands in the index chunk): no parser, no page code. The two URL rules below repeat the readers'
 * for the DEFAULT start only (Europe, 24-h window): `firmsUrl(source, windowPlan(24)[0], 'europe')` and
 * `EFFIS_SEASON_EUROPE_URL`.
 */
/** `boxWsen(EUROPE_BOX)` of `fireRegion.ts`, written out — an import would pull that module into the index chunk (eagerJs). */
const EUROPE_WSEN = '-25,34,32,72';

/** A warm answer older than this is not handed out (the reader then fetches itself). */
const WARM_TTL_MS = 60_000;
const warm = new Map<string, { res: Promise<Response>; at: number }>();

/** The start requests of the default view. `null` for FIRMS when the link asks for another window (own window, one fire, old hash state). */
export function fireWarmUrls(pathname: string, search: string, hash = ''): string[] {
  const urls = ['/fire/effis-season-europe-v1.json'];
  let ownWindow = pathname.includes('/brand/') || hash.length > 1;
  try { ownWindow = ownWindow || new URLSearchParams(search).has('fenster'); } catch { /* no query */ }
  if (!ownWindow) {
    // 24-h window ⇒ `days=2` without a date (the API counts UTC calendar days, `windowPlan`).
    for (const source of ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT']) urls.push(`/_firms/${source}/${EUROPE_WSEN}/2`);
  }
  return urls;
}

/** Starts the requests; returns what was started (debug). Never throws. */
export function warmFireStart(pathname: string, search: string, hash = '', nowMs: number = Date.now()): string[] {
  const started: string[] = [];
  for (const url of fireWarmUrls(pathname, search, hash)) {
    const have = warm.get(url);
    if (have && nowMs - have.at < WARM_TTL_MS) continue;
    const res = fetch(url);
    res.catch(() => { /* the reader sees the failure when it takes the answer */ });
    warm.set(url, { res, at: nowMs });
    started.push(url);
  }
  return started;
}

/** The running (or finished) early answer for `url`, once — or `null`. */
export function takeWarmFire(url: string, nowMs: number = Date.now()): Promise<Response> | null {
  const hit = warm.get(url);
  if (!hit) return null;
  warm.delete(url);
  return nowMs - hit.at < WARM_TTL_MS ? hit.res : null;
}
