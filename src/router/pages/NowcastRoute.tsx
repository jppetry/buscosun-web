/**
 * `/regenradar[/<ort-slug>]` — der Ort steht seit SH1 als lesbares Pfadsegment
 * in der URL (`/regenradar/muenchen`); nur ein Ort außerhalb der Ortstabelle
 * trägt zusätzlich `ort`/`olat`/`olon`/`land`. Die Kamera (`lat`/`lon`/`z`)
 * bleibt in der Query. Der Ort wechselt per push (neuer Einstieg), die Kamera
 * per replaceState debounced (kein History-Eintrag je Pan).
 *
 * Der Ort-Slug ist NIE kanonisch: `canonicalPath()` schneidet ihn ab, die
 * Sitemap kennt ihn nicht. Ortswetter bleibt Sache von `/wetter/<slug>/`.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import NowcastPage from '../../nowcast/NowcastPage';
import type { Location } from '../../types';
import { useAppNav } from '../useAppNav';
import { buildRadarUrl, parseMapSearch, placeFromRoute, type MapCamera } from '../urlState';
// SH1: Ortstabelle nur im LAZY Chunk — `urlState.ts` (eager) bleibt tabellenfrei.
import { placeBySlug, slugForPlace } from '../../share/placeTable';

const CAM_DEBOUNCE_MS = 300;

export default function NowcastRoute() {
  const loc = useLocation();
  const params = useParams<{ ort?: string }>();
  const navigate = useNavigate();
  const nav = useAppNav();
  const parsed = useMemo(() => parseMapSearch(loc.search, 0), [loc.search]);
  const routePlace = useMemo(() => placeFromRoute(params.ort, parsed.place, placeBySlug), [params.ort, parsed.place]);
  const st = useRef({ place: routePlace.place, cam: parsed.cam, extra: parsed.extra });
  const initial = useRef({ place: routePlace.place, cam: parsed.cam });

  const urlOf = useCallback(() => {
    const s = st.current;
    return buildRadarUrl(s.place, s.place ? slugForPlace(s.place) : null, s.cam, s.extra);
  }, []);
  const timer = useRef<number | null>(null);
  const unmountedRef = useRef(false);
  const replaceDebounced = useCallback(() => {
    if (unmountedRef.current) return;
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      // Nie auf eine fremde Route schreiben (später Kamera-Callback nach dem Verlassen).
      if (unmountedRef.current || !window.location.pathname.startsWith('/regenradar')) return;
      const url = urlOf();
      if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url + window.location.hash);
    }, CAM_DEBOUNCE_MS);
  }, [urlOf]);
  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; if (timer.current != null) window.clearTimeout(timer.current); };
  }, []);

  // Ungültige Parameter und ein unauflösbarer Ort-Slug werden beim Mount still
  // entfernt — ein kaputter Link landet im DACH-Überblick, nicht in einer 404.
  useEffect(() => {
    if (parsed.invalid.length || routePlace.unresolved) void navigate(urlOf(), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLocationChange = useCallback((l: Location | null) => {
    st.current.place = l;
    if (!l) st.current.cam = null;
    void navigate(urlOf());
  }, [navigate, urlOf]);
  const onViewChange = useCallback((cam: MapCamera) => { st.current.cam = cam; replaceDebounced(); }, [replaceDebounced]);

  return (
    <NowcastPage
      onBack={nav.goHome}
      onOpenFeature={nav.openFeature}
      initialLocation={initial.current.place}
      onLocationChange={onLocationChange}
      initialView={initial.current.cam}
      onViewChange={onViewChange}
    />
  );
}
