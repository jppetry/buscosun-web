/**
 * `/globus` — Zustand seit SH4 in der QUERY (`src/globe/globeUrl.ts`), nicht
 * mehr im Fragment `#g=`.
 *
 * Dieser Wrapper ist der **einzige Schreiber** (Muster `WetterkarteRoute`):
 * `GlobePage` meldet seinen Zustand per `onUrlState`. Ein Alt-Link wird beim
 * Ankommen einmal gelesen, übersetzt und per `replace` ersetzt — dabei werden
 * auch die **Achsen gerade gezogen** (`#g=` speicherte `[lon, lat]`, überall
 * sonst im Repo gilt `lat, lon`; V-SH-3).
 *
 * Die Zeit des Alt-Links bleibt eine Vorhersagestunde: welcher GFS-Lauf gilt,
 * weiß die Seite erst mit dem ersten Frame. Sie reicht die Stunde durch und
 * schreibt die absolute Zeit, sobald der Lauf bekannt ist.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import GlobePage from '../../globe/GlobePage';
import { buildGlobeSearch, decodeGlobeHash, parseGlobeQuery, type GlobeUrlState } from '../../globe/globeUrl';
import StaleLinkNotice from '../../share/StaleLinkNotice';
import { useAppNav } from '../useAppNav';

const STATE_DEBOUNCE_MS = 300;

export default function GlobeRoute() {
  const loc = useLocation();
  const navigate = useNavigate();
  const nav = useAppNav();

  const legacy = useMemo(() => (typeof window === 'undefined' || !loc.hash ? null : decodeGlobeHash(loc.hash)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  const parsed = useMemo(() => parseGlobeQuery(loc.search, Date.now()), [loc.search]);
  const initialUrl = legacy?.state ?? parsed;

  const stateRef = useRef<GlobeUrlState>(initialUrl);
  const extraRef = useRef<Array<[string, string]>>(parsed.extra);

  const urlOf = useCallback(() => '/globus' + buildGlobeSearch(stateRef.current, extraRef.current), []);

  const timer = useRef<number | null>(null);
  const unmountedRef = useRef(false);
  const onUrlState = useCallback((st: GlobeUrlState) => {
    stateRef.current = st;
    if (unmountedRef.current) return;
    if (timer.current != null) window.clearTimeout(timer.current);
    // Gebündelt: Drehen, Zoomen und der Zeit-Regler feuern sonst je Bild.
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (unmountedRef.current || window.location.pathname !== '/globus') return;
      const url = urlOf();
      if (url !== window.location.pathname + window.location.search) {
        window.history.replaceState(window.history.state, '', url);
      }
    }, STATE_DEBOUNCE_MS);
  }, [urlOf]);
  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; if (timer.current != null) window.clearTimeout(timer.current); };
  }, []);

  // Alt-Link oder unbrauchbare Werte einmal kanonisch nachziehen — und das
  // Fragment loswerden.
  useEffect(() => {
    if (legacy || parsed.invalid.length || loc.hash) void navigate(urlOf(), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Der Globus rechnet Vorhersagestunden ab dem GFS-Lauf; ein alter Link
          landet beim aktuellen Lauf — Jans „nächstliegender verfügbarer Lauf
          plus dezenter Hinweis". */}
      <StaleLinkNotice at={parsed.timePast ? parsed.wantedAtMs : null} shows="der aktuelle Lauf" tone="dark" />
      <GlobePage
        onBack={nav.goHome}
        initialUrl={initialUrl}
        initialFhour={legacy?.fhour ?? 0}
        onUrlState={onUrlState}
      />
    </>
  );
}
