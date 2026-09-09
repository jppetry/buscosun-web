/**
 * `/vorhersage[/<ort-slug>]` — die Seite hatte bis SH5 **gar keinen**
 * URL-Zustand (`audit/teilen-share.md` §1.1): Ort, gewählter Tag, Diagrammgröße
 * und die abgewählten Modelle lebten in React-State und `localStorage`. Ein Link
 * führte immer auf das leere Suchfeld, ein Reload verlor die Auswahl.
 *
 * Jetzt steht alles in Pfad + Query (`src/confidence/forecastUrl.ts`), und
 * dieser Wrapper ist der **einzige Schreiber**. `localStorage` bleibt der
 * Standard, die URL gewinnt (V-SH-10).
 *
 * Der Tag steht als **Datum**, nicht als Index — ein Index zeigte morgen einen
 * anderen Tag (Jans Vorgabe: absolute Zeitangaben).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import ForecastPage from '../../confidence/ForecastPage';
import { buildForecastSearch, parseForecastQuery, type ForecastUrlState } from '../../confidence/forecastUrl';
import { resolveRoutePlace, slugForPlace } from '../../share/placeTable';
import { useAppNav } from '../useAppNav';

const STATE_DEBOUNCE_MS = 300;

export default function ForecastRoute() {
  const { ort } = useParams<{ ort?: string }>();
  const loc = useLocation();
  const navigate = useNavigate();
  const nav = useAppNav();

  const parsed = useMemo(() => parseForecastQuery(loc.search), [loc.search]);
  const routePlace = useMemo(() => resolveRoutePlace(ort, parsed.place), [ort, parsed.place]);

  const stateRef = useRef<ForecastUrlState>({
    place: routePlace.place,
    day: parsed.day,
    metric: parsed.metric ?? 'temp',
    disabled: parsed.disabled ?? [],
    consensus: parsed.consensus ?? true,
  });
  const extraRef = useRef<Array<[string, string]>>(parsed.extra);

  const urlOf = useCallback(() => {
    const st = stateRef.current;
    const sl = st.place ? slugForPlace(st.place) : null;
    const path = st.place && sl ? `/vorhersage/${sl.slug}` : '/vorhersage';
    return path + buildForecastSearch(st, sl, extraRef.current);
  }, []);

  const timer = useRef<number | null>(null);
  const unmountedRef = useRef(false);
  const lastPlaceRef = useRef(routePlace.place?.name ?? null);
  const onUrlState = useCallback((st: ForecastUrlState) => {
    stateRef.current = st;
    if (unmountedRef.current) return;
    // Ein Ortswechsel ist ein neuer Einstieg (push), alles andere nur ein
    // Zustandswechsel (replace, gebündelt).
    const placeChanged = (st.place?.name ?? null) !== lastPlaceRef.current;
    lastPlaceRef.current = st.place?.name ?? null;
    if (placeChanged) {
      if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null; }
      void navigate(urlOf());
      return;
    }
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (unmountedRef.current || !window.location.pathname.startsWith('/vorhersage')) return;
      const url = urlOf();
      if (url !== window.location.pathname + window.location.search) {
        window.history.replaceState(window.history.state, '', url);
      }
    }, STATE_DEBOUNCE_MS);
  }, [navigate, urlOf]);
  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; if (timer.current != null) window.clearTimeout(timer.current); };
  }, []);

  // Unbrauchbare Werte und die reine Query-Form einmal kanonisch nachziehen.
  useEffect(() => {
    if (parsed.invalid.length || routePlace.unresolved || (parsed.place && !ort)) {
      void navigate(urlOf(), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ForecastPage
      onBack={nav.goHome}
      onOpenFeature={nav.openFeature}
      initialPlace={routePlace.place}
      initialUrl={parsed}
      onUrlState={onUrlState}
    />
  );
}
