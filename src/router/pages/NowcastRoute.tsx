/**
 * `/regenradar` — Ort (`ort`/`olat`/`olon`/`land`) und Kamera (`lat`/`lon`/`z`) in
 * der Query; der Ort wechselt per push (neuer Einstieg), die Kamera per
 * replaceState debounced (kein History-Eintrag je Pan).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import NowcastPage from '../../nowcast/NowcastPage';
import type { Location } from '../../types';
import { useAppNav } from '../useAppNav';
import { buildRadarSearch, parseMapSearch, type MapCamera } from '../urlState';

const CAM_DEBOUNCE_MS = 300;

export default function NowcastRoute() {
  const loc = useLocation();
  const navigate = useNavigate();
  const nav = useAppNav();
  const parsed = useMemo(() => parseMapSearch(loc.search, 0), [loc.search]);
  const st = useRef({ place: parsed.place, cam: parsed.cam, extra: parsed.extra });
  const initial = useRef({ place: parsed.place, cam: parsed.cam });

  const urlOf = useCallback(() => '/regenradar' + buildRadarSearch(st.current.place, st.current.cam, st.current.extra), []);
  const timer = useRef<number | null>(null);
  const unmountedRef = useRef(false);
  const replaceDebounced = useCallback(() => {
    if (unmountedRef.current) return;
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      // Nie auf eine fremde Route schreiben (später Kamera-Callback nach dem Verlassen).
      if (unmountedRef.current || window.location.pathname !== '/regenradar') return;
      const url = urlOf();
      if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url + window.location.hash);
    }, CAM_DEBOUNCE_MS);
  }, [urlOf]);
  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; if (timer.current != null) window.clearTimeout(timer.current); };
  }, []);

  // Ungültige Parameter beim Mount still entfernen.
  useEffect(() => {
    if (parsed.invalid.length) void navigate(urlOf(), { replace: true });
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
