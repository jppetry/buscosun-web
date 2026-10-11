/**
 * `/gletscher/:glacier?` — Phase GL (`audit/gletscher.md`). Path segment = glacier (`ch-grosser-aletschgletscher`), the rest of
 * the state in the query (`src/glacier/glacierState.ts`). This wrapper is the only writer of path and query (pattern SeaRoute):
 * the page reports its state via `onUrlState` (debounced `replaceState`, no history entry per click) and a glacier change via
 * `onGlacier` (a real navigation, back button returns).
 *
 * Until Jan switches `GLACIER_LIVE` on (after Gate D) the page exists only with `?gl=1` / `localStorage.gl = '1'`
 * (`src/glacier/glacierFlag.ts`); without the flag the route answers like an unknown path. The page itself is a lazy chunk.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router';
import NotFoundRoute from './NotFoundRoute';
import AppLoader from '../AppLoader';
import { glacierFlagFrom, rememberGlacierFlag } from '../../glacier/glacierFlag';
import { buildGlacierUrl, parseGlacierUrl, type GlacierUrlState } from '../../glacier/glacierState';

const GlacierPage = lazy(() => import('../../glacier/GlacierPage'));
const STATE_DEBOUNCE_MS = 300;

export default function GlacierRoute() {
  const { glacier } = useParams<{ glacier?: string }>();
  const loc = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const enabled = useMemo(() => glacierFlagFrom(loc.search), [loc.search]);
  useEffect(() => { rememberGlacierFlag(loc.search); }, [loc.search]);

  const parsed = useMemo(() => parseGlacierUrl(glacier ?? null, loc.search), [glacier, loc.search]);
  const stateRef = useRef<GlacierUrlState>(parsed.state);
  const timer = useRef<number | null>(null);
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => { unmounted.current = true; if (timer.current != null) window.clearTimeout(timer.current); };
  }, []);

  const flagQuery = useMemo((): Array<[string, string]> => {
    // the explicit flag stays in the shared URL only while it is what makes the page visible (a link must open for the recipient too)
    try { const v = new URLSearchParams(loc.search).get('gl'); return v === '1' || v === '0' ? [['gl', v]] : []; } catch { return []; }
  }, [loc.search]);

  const onUrlState = useCallback((st: GlacierUrlState) => {
    stateRef.current = st;
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (unmounted.current || !window.location.pathname.startsWith('/gletscher')) return;
      const url = buildGlacierUrl(stateRef.current, flagQuery);
      if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url);
    }, STATE_DEBOUNCE_MS);
  }, [flagQuery]);

  const onGlacier = useCallback((st: GlacierUrlState, initial: boolean) => {
    stateRef.current = st;
    const url = buildGlacierUrl(st, flagQuery);
    if (url === window.location.pathname + window.location.search) return;
    void navigate(url, { replace: initial });
  }, [navigate, flagQuery]);

  // Invalid values are dropped once, canonically.
  useEffect(() => {
    if (enabled && parsed.invalid.length) void navigate(buildGlacierUrl(parsed.state, flagQuery), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!enabled) return <NotFoundRoute />;
  return (
    <Suspense fallback={<AppLoader />}>
      <GlacierPage initial={parsed.state} invalid={parsed.invalid} onUrlState={onUrlState} onGlacier={onGlacier}
        popState={navType === 'POP' ? { ...parsed.state, key: loc.key } : null} />
    </Suspense>
  );
}
