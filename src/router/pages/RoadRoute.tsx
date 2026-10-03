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
import { useLocation, useNavigate, useParams } from 'react-router';
import NotFoundRoute from './NotFoundRoute';
import AppLoader from '../AppLoader';
import { roadFlagFrom, rememberRoadFlag } from '../../road/roadFlag';
import { buildRoadUrl, parseRoadUrl, type RoadUrlState } from '../../road/roadState';

const RoadPage = lazy(() => import('../../road/RoadPage'));
const STATE_DEBOUNCE_MS = 300;

export default function RoadRoute() {
  const { road } = useParams<{ road?: string }>();
  const loc = useLocation();
  const navigate = useNavigate();
  const enabled = useMemo(() => roadFlagFrom(loc.search), [loc.search]);
  useEffect(() => { rememberRoadFlag(loc.search); }, [loc.search]);

  const parsed = useMemo(() => parseRoadUrl(road ?? null, loc.search), [road, loc.search]);
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
      const url = buildRoadUrl(stateRef.current);
      if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url);
    }, STATE_DEBOUNCE_MS);
  }, []);

  const onCorridor = useCallback((st: RoadUrlState, initial: boolean) => {
    stateRef.current = st;
    const url = buildRoadUrl(st);
    if (url === window.location.pathname + window.location.search) return;
    void navigate(url, { replace: initial });
  }, [navigate]);

  // Invalid values (e.g. a forecast hour before Gate D) are dropped once, canonically.
  useEffect(() => {
    if (enabled && parsed.invalid.length) void navigate(buildRoadUrl(parsed.state), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!enabled) return <NotFoundRoute />;
  return (
    <Suspense fallback={<AppLoader />}>
      <RoadPage initial={parsed.state} invalid={parsed.invalid} onUrlState={onUrlState} onCorridor={onCorridor} />
    </Suspense>
  );
}
