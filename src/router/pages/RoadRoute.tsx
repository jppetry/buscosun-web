/**
 * `/autobahnwetter/:road?` — Phase AW (`audit/autobahnwetter.md`). Path segment = corridor (`a8`), the rest of the
 * state in the query (`src/road/roadState.ts`). This wrapper is the only writer of path and query (pattern FireRoute):
 * the page reports its state via `onUrlState` (debounced `replaceState`, no history entry per click) and a corridor
 * change via `onCorridor` (a real navigation, back button returns).
 *
 * Until Gate C the page exists only with `?road=1` / `localStorage.road = '1'` (`src/road/roadFlag.ts`); without the
 * flag the route answers like an unknown path. The page itself is a lazy chunk of its own (`src/road/RoadPage.tsx`).
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router';
import NotFoundRoute from './NotFoundRoute';
import AppLoader from '../AppLoader';
import { roadFlagFrom, rememberRoadFlag, roadHzFlagFrom, rememberRoadHzFlag, roadSurfaceFlagFrom, rememberRoadSurfaceFlag, roadVsFlagFrom, rememberRoadVsFlag } from '../../road/roadFlag';
import { buildRoadUrl, parseRoadUrl, type RoadUrlState } from '../../road/roadState';
import { roadLinkUrl, roadNormalizeSearch, roadSegIdFromLink } from '../../road/roadLink';
import StaleLinkNotice from '../../share/StaleLinkNotice';
import RoadLinkNotice from '../../road/RoadLinkNotice';

const RoadPage = lazy(() => import('../../road/RoadPage'));
const STATE_DEBOUNCE_MS = 300;

export default function RoadRoute() {
  const { road, seg: segSlug } = useParams<{ road?: string; seg?: string }>();
  const loc = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const enabled = useMemo(() => roadFlagFrom(loc.search), [loc.search]);
  // AW-8: the hazard rail behind its own switch (`ROAD_HZ_LIVE`, `?roadhz=1`); off ⇒ the page of AW-5/AW-6.1b, unchanged.
  const hz = useMemo(() => roadHzFlagFrom(loc.search), [loc.search]);
  // Phase FB: the road surface forecast behind its own switch (`ROAD_SURFACE_LIVE`, `?rsfc=1`).
  const surface = useMemo(() => roadSurfaceFlagFrom(loc.search), [loc.search]);
  // AW-6.2.9: the virtual road sensor behind its own switch (`ROAD_VS_LIVE = false`, `?roadvs=1`, E-VS-2) — off, the page fetches nothing of it.
  const vs = useMemo(() => roadVsFlagFrom(loc.search), [loc.search]);
  useEffect(() => { rememberRoadFlag(loc.search); rememberRoadHzFlag(loc.search); rememberRoadSurfaceFlag(loc.search); rememberRoadVsFlag(loc.search); }, [loc.search]);

  // Link on ONE segment (`/autobahnwetter/a8/km-034`, src/road/roadLink.ts): the path names the segment, the detail view opens on arrival.
  const nowRef = useRef(Date.now());
  const norm = useMemo(() => roadNormalizeSearch(loc.search, nowRef.current), [loc.search]);
  const linkSegId = useMemo(() => (segSlug ? roadSegIdFromLink(road, segSlug) : null), [road, segSlug]);
  const parsed = useMemo(() => {
    const p = parseRoadUrl(road ?? null, norm.search, hz);
    if (segSlug && !linkSegId) p.invalid.push('segment');
    // without the hazard switch there is no segment view: the link degrades to the corridor page
    if (hz && linkSegId) { p.state.seg = linkSegId; p.state.ds = true; }
    return p;
  }, [road, norm.search, hz, segSlug, linkSegId]);
  /** The first parse decides what the arriving visitor is told (the tidy-up navigation clears `invalid` right after). */
  const linkInvalid = useRef(!!segSlug && !linkSegId).current;
  const urlOf = useCallback((st: RoadUrlState) => roadLinkUrl(st, buildRoadUrl as never, st, nowRef.current), []);
  const stateRef = useRef<RoadUrlState>(parsed.state);
  const timer = useRef<number | null>(null);
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => { unmounted.current = true; if (timer.current != null) window.clearTimeout(timer.current); };
  }, []);

  const onUrlState = useCallback((st: RoadUrlState) => {
    stateRef.current = st;
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (unmounted.current || !window.location.pathname.startsWith('/autobahnwetter')) return;
      const url = urlOf(stateRef.current);
      if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url);
    }, STATE_DEBOUNCE_MS);
  }, [urlOf]);

  const onCorridor = useCallback((st: RoadUrlState, initial: boolean) => {
    stateRef.current = st;
    const url = urlOf(st);
    if (url === window.location.pathname + window.location.search) return;
    void navigate(url, { replace: initial });
  }, [navigate, urlOf]);

  // Invalid values (e.g. a forecast hour before Gate D) are dropped once, canonically.
  useEffect(() => {
    if (enabled && parsed.invalid.length) void navigate(urlOf(parsed.state), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!enabled) return <NotFoundRoute />;
  return (
    <Suspense fallback={<AppLoader />}>
      {/* A shared time that is past / beyond the +6 h window: the page clamps and says so (the same notice as the other pages). */}
      <StaleLinkNotice at={norm.past} kind="time" shows="die aktuelle Lage" />
      <StaleLinkNotice reason="horizon" at={norm.beyond} />
      <RoadLinkNotice invalid={linkInvalid} />
      {/* Back/forward (POP) hands the URL's state to the mounted page — `initial` is read only once (review #6,
          pattern FireRoute `routeView`). */}
      <RoadPage initial={parsed.state} invalid={parsed.invalid} onUrlState={onUrlState} onCorridor={onCorridor} hz={hz} surface={surface} vs={vs}
        popState={navType === 'POP' ? { ...parsed.state, key: loc.key } : null} />
    </Suspense>
  );
}
