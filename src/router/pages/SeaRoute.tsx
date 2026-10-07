/**
 * `/seewetter/:spot?` — Phase SW (`audit/seewetter.md`). Path segment = spot (`st-peter-ording`), the rest of the
 * state in the query (`src/sea/seaState.ts`). This wrapper is the only writer of path and query (pattern RoadRoute):
 * the page reports its state via `onUrlState` (debounced `replaceState`, no history entry per click) and a spot
 * change via `onSpot` (a real navigation, back button returns).
 *
 * Until Gate C the page exists only with `?sea=1` / `localStorage.sea = '1'` (`src/sea/seaFlag.ts`); without the flag
 * the route answers like an unknown path. The page itself is a lazy chunk of its own (`src/sea/SeaPage.tsx`).
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router';
import NotFoundRoute from './NotFoundRoute';
import AppLoader from '../AppLoader';
import { seaFlagFrom, rememberSeaFlag } from '../../sea/seaFlag';
import { buildSeaUrl, parseSeaUrl, type SeaUrlState } from '../../sea/seaState';

const SeaPage = lazy(() => import('../../sea/SeaPage'));
const STATE_DEBOUNCE_MS = 300;

export default function SeaRoute() {
  const { spot } = useParams<{ spot?: string }>();
  const loc = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const enabled = useMemo(() => seaFlagFrom(loc.search), [loc.search]);
  useEffect(() => { rememberSeaFlag(loc.search); }, [loc.search]);

  const parsed = useMemo(() => parseSeaUrl(spot ?? null, loc.search), [spot, loc.search]);
  const stateRef = useRef<SeaUrlState>(parsed.state);
  const timer = useRef<number | null>(null);
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => { unmounted.current = true; if (timer.current != null) window.clearTimeout(timer.current); };
  }, []);

  const onUrlState = useCallback((st: SeaUrlState) => {
    stateRef.current = st;
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (unmounted.current || !window.location.pathname.startsWith('/seewetter')) return;
      const url = buildSeaUrl(stateRef.current);
      if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url);
    }, STATE_DEBOUNCE_MS);
  }, []);

  const onSpot = useCallback((st: SeaUrlState, initial: boolean) => {
    stateRef.current = st;
    const url = buildSeaUrl(st);
    if (url === window.location.pathname + window.location.search) return;
    void navigate(url, { replace: initial });
  }, [navigate]);

  // Invalid values are dropped once, canonically.
  useEffect(() => {
    if (enabled && parsed.invalid.length) void navigate(buildSeaUrl(parsed.state), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!enabled) return <NotFoundRoute />;
  return (
    <Suspense fallback={<AppLoader />}>
      <SeaPage initial={parsed.state} invalid={parsed.invalid} onUrlState={onUrlState} onSpot={onSpot}
        popState={navType === 'POP' ? { ...parsed.state, key: loc.key } : null} />
    </Suspense>
  );
}
