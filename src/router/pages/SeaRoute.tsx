/**
 * `/seewetter/:spot?` — Phase SW (`audit/seewetter.md`). Path segment = spot (`st-peter-ording`), the rest of the
 * state in the query (`src/sea/seaState.ts`). This wrapper is the only writer of path and query (pattern RoadRoute):
 * the page reports its state via `onUrlState` (debounced `replaceState`, no history entry per click) and a spot
 * change via `onSpot` (a real navigation, back button returns).
 *
 * Until Gate C the page exists only with `?sea=1` / `localStorage.sea = '1'` (`src/sea/seaFlag.ts`); without the flag
 * the route answers like an unknown path. The page itself is a lazy chunk of its own (`src/sea/SeaPage.tsx`).
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router';
import NotFoundRoute from './NotFoundRoute';
import AppLoader from '../AppLoader';
import { seaFlagFrom, rememberSeaFlag } from '../../sea/seaFlag';
import { buildSeaUrl, parseSeaUrl, SEA_MAX_T, type SeaUrlState } from '../../sea/seaState';
import { absolutizeHourParam, normalizeHourSearch } from '../../share/hourOffset';
import StaleLinkNotice from '../../share/StaleLinkNotice';
import SeaLinkNotice from '../../sea/SeaLinkNotice';
import { warmSeaStart } from '../../sea/seaClient';

const SeaPage = lazy(() => import('../../sea/SeaPage'));
const STATE_DEBOUNCE_MS = 300;

export default function SeaRoute() {
  const { spot } = useParams<{ spot?: string }>();
  const loc = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const enabled = useMemo(() => seaFlagFrom(loc.search), [loc.search]);
  useEffect(() => { rememberSeaFlag(loc.search); }, [loc.search]);
  // Early start (load time 10.11.): catalogue, areas, kill switch, run and texts load while the page chunk and MapLibre still
  // download (pattern GlacierRoute/RoadRoute); the page takes them once (`takeSeaStatic`/`takeSeaChain`).
  useState(() => { if (enabled) { try { warmSeaStart(); } catch { /* the page then reads them itself */ } } return null; });

  // The time in a shared link is absolute (src/share/hourOffset.ts): turned into hours here, written back absolute below.
  const nowRef = useRef(Date.now());
  const norm = useMemo(() => normalizeHourSearch(loc.search, nowRef.current, SEA_MAX_T), [loc.search]);
  const parsed = useMemo(() => parseSeaUrl(spot ?? null, norm.search), [spot, norm.search]);
  const urlOf = useCallback((st: SeaUrlState) => absolutizeHourParam(buildSeaUrl(st), st.t, nowRef.current), []);
  const [badLink, setBadLink] = useState(() => parsed.invalid.includes('spot'));
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
      const url = urlOf(stateRef.current);
      if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url);
    }, STATE_DEBOUNCE_MS);
  }, [urlOf]);

  const onSpot = useCallback((st: SeaUrlState, initial: boolean) => {
    stateRef.current = st;
    const url = urlOf(st);
    if (url === window.location.pathname + window.location.search) return;
    void navigate(url, { replace: initial });
  }, [navigate, urlOf]);

  // Invalid values are dropped once, canonically.
  useEffect(() => {
    if (enabled && parsed.invalid.length) void navigate(urlOf(parsed.state), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!enabled) return <NotFoundRoute />;
  return (
    <Suspense fallback={<AppLoader />}>
      {/* A shared time that is past / beyond +78 h: the page clamps and says so (the same notice as the other pages). */}
      <StaleLinkNotice at={norm.past} kind="time" shows="die aktuelle Lage" />
      <StaleLinkNotice reason="horizon" at={norm.beyond} />
      {badLink && <SeaLinkNotice kind="invalid" onClose={() => setBadLink(false)} />}
      <SeaPage initial={parsed.state} invalid={parsed.invalid} onUrlState={onUrlState} onSpot={onSpot} openDossier={!!parsed.state.spot}
        popState={navType === 'POP' ? { ...parsed.state, key: loc.key } : null} />
    </Suspense>
  );
}
