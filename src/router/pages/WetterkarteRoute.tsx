/**
 * `/wetterkarte/:layer?` und `/warnungen` (`fixedPrimary='warnings'`).
 *
 * Übersetzt Pfad + Query in MapView-Props und schreibt den Kartenzustand zurück:
 *  - Layerwechsel ⇒ `navigate` (pushState: Zurück führt zum vorherigen Layer);
 *  - Stunde / Modell / Kamera ⇒ `history.replaceState`, debounced ≥ 300 ms, am
 *    Router vorbei (kein Re-Render je Pan; `history.state` wird durchgereicht,
 *    weil der Router dort seinen Index hält);
 *  - Zurück/Vorwärts (POP) ⇒ Layer/Stunde/Modell aus der URL in die Karte
 *    spiegeln (`routeLayers`/`routeHour`/`routeModelSource`); die Kamera wird
 *    bewusst NICHT zurückgesetzt.
 *
 * EINE Route mit optionalem Param — bei einem Layerwechsel bleibt dieselbe
 * Route-Instanz stehen, MapView wird nicht remountet (kein `key`!).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router';
import MapView, { type LayerKey } from '../../MapView';
import { DACH_OVERVIEW_LOCATION } from '../../App';
import type { Country, Location } from '../../types';
import type { ModelSourceState } from '../../fusion/modelSource';
import { isWhitelisted } from '../../fusion/modelCatalog';
import { useAppNav } from '../useAppNav';
import {
  buildMapUrl, layersFromRoute, parseMapSearch, routeForLayers, DEFAULT_MAP_LAYER, LAYER_SLUGS,
  type MapCamera,
} from '../urlState';
import NotFoundRoute from './NotFoundRoute';

const CAM_DEBOUNCE_MS = 300;

interface UrlRefs {
  layers: LayerKey[];
  primary: LayerKey | null;
  hour: number;
  model: string | null;
  point: 'fusion' | 'native';
  radar: boolean;
  cam: MapCamera | null;
  place: Location | null;
  country: Country | null;
  extra: Array<[string, string]>;
}

export default function WetterkarteRoute({ fixedPrimary }: { fixedPrimary?: LayerKey }) {
  const params = useParams<{ layer?: string }>();
  const loc = useLocation();
  const navType = useNavigationType();
  const navigate = useNavigate();
  const nav = useAppNav();
  const base: '/wetterkarte' | '/warnungen' = fixedPrimary ? '/warnungen' : '/wetterkarte';

  const parsed = useMemo(() => parseMapSearch(loc.search, Date.now(), isWhitelisted), [loc.search]);
  const slug = fixedPrimary ? LAYER_SLUGS[fixedPrimary] : params.layer;
  const route = useMemo(() => layersFromRoute(slug, parsed.l), [slug, parsed.l]);
  const unknownPrimary = !!slug && !route.primary;
  const urlLayers = useMemo<LayerKey[]>(
    () => (route.noLayers || route.all.length > 0 || !!slug) ? route.all : [DEFAULT_MAP_LAYER],
    [route, slug],
  );

  // Laufender Zustand (Quelle für jede geschriebene URL). Initial aus der URL.
  const st = useRef<UrlRefs | null>(null);
  if (!st.current) {
    st.current = {
      layers: urlLayers,
      primary: fixedPrimary ?? route.primary ?? (slug || route.noLayers ? null : DEFAULT_MAP_LAYER),
      hour: parsed.hour ?? 0,
      model: parsed.model,
      point: parsed.point ?? 'fusion',
      radar: parsed.radar ?? true,
      cam: parsed.cam,
      place: parsed.place,
      country: parsed.country ?? parsed.place?.country ?? null,
      extra: parsed.extra,
    };
  }
  // Jede Navigation, die NICHT diese Komponente geschrieben hat (Zurück/Vorwärts,
  // die Normalisierung in App.tsx, ein Alias, ein Link von außen), macht die URL
  // zur Wahrheit: Refs synchron im Render nachziehen, damit auch die
  // Initial-Props der Karte (bei spätem Mount) aus der aktuellen URL kommen.
  const lastWrittenRef = useRef<string | null>(null);
  const syncedKeyRef = useRef<string | null>(null);
  if (syncedKeyRef.current !== loc.key) {
    const ownWrite = syncedKeyRef.current !== null && lastWrittenRef.current === loc.pathname + loc.search;
    syncedKeyRef.current = loc.key;
    if (!ownWrite) {
      const s = st.current;
      s.layers = urlLayers;
      s.primary = fixedPrimary ?? route.primary ?? (slug || route.noLayers ? null : DEFAULT_MAP_LAYER);
      s.hour = parsed.hour ?? 0;
      s.model = parsed.model; s.point = parsed.point ?? 'fusion'; s.radar = parsed.radar ?? true;
      s.place = parsed.place; s.country = parsed.country ?? parsed.place?.country ?? s.country;
      if (parsed.cam) s.cam = parsed.cam;
      s.extra = parsed.extra;
    }
  }
  const init = st.current;

  const urlOf = useCallback(() => {
    const s = st.current!;
    return buildMapUrl({
      primary: fixedPrimary ?? s.primary, layers: s.layers, cam: s.cam, hour: s.hour,
      model: s.model, point: s.point, radar: s.radar, place: s.place, country: s.place ? null : s.country,
    }, Date.now(), base, s.extra);
  }, [fixedPrimary, base]);

  const push = useCallback(() => { const url = urlOf(); lastWrittenRef.current = url; void navigate(url); }, [navigate, urlOf]);
  const unmountedRef = useRef(false);
  const replaceNow = useCallback(() => {
    // Nie auf eine fremde Route schreiben: nach dem Verlassen (oder wenn ein
    // später Callback der Karte noch eintrudelt) gehört die URL dem nächsten Feature.
    if (unmountedRef.current || !window.location.pathname.startsWith(base)) return;
    const url = urlOf();
    if (url === window.location.pathname + window.location.search) return;
    window.history.replaceState(window.history.state, '', url + window.location.hash);
  }, [urlOf, base]);
  const timer = useRef<number | null>(null);
  const replaceDebounced = useCallback(() => {
    if (unmountedRef.current) return;
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; replaceNow(); }, CAM_DEBOUNCE_MS);
  }, [replaceNow]);
  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; if (timer.current != null) window.clearTimeout(timer.current); };
  }, []);

  // Kanonische URL nachziehen: `/wetterkarte` ⇒ `/wetterkarte/wind`; ungültige
  // Parameter fallen still auf Defaults zurück und verschwinden aus der URL.
  useEffect(() => {
    if (unknownPrimary) return;
    if (!slug || parsed.invalid.length || route.invalid.length) {
      const url = urlOf();
      lastWrittenRef.current = url;
      void navigate(url, { replace: true });
    }
    // Bei jedem Routen-/Slug-Wechsel, den nicht diese Komponente geschrieben hat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.key]);

  const isPop = navType === 'POP';

  const place = parsed.place;
  const country: Country = parsed.country ?? place?.country ?? 'DE';
  const mapLocation = useMemo<Location>(
    () => place ?? { ...DACH_OVERVIEW_LOCATION, country },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [place?.name, place?.lat, place?.lon, place?.country, country],
  );

  const onLayersChange = useCallback((layers: LayerKey[], added: LayerKey | null) => {
    const s = st.current!;
    s.layers = layers;
    s.primary = fixedPrimary ?? (added ?? routeForLayers(layers, s.primary).primary);
    push();
  }, [push, fixedPrimary]);
  const onHourChange = useCallback((h: number) => { st.current!.hour = h; replaceDebounced(); }, [replaceDebounced]);
  const onViewChange = useCallback((cam: MapCamera) => { st.current!.cam = cam; replaceDebounced(); }, [replaceDebounced]);
  const onModelSourceChange = useCallback((m: ModelSourceState) => {
    const s = st.current!;
    s.country = m.country; s.model = m.perCountry[m.country] ?? null; s.point = m.point; s.radar = m.radar;
    replaceDebounced();
  }, [replaceDebounced]);
  const onSelectLocation = useCallback((l: Location) => {
    const s = st.current!;
    s.place = l; s.country = l.country;
    push();
  }, [push]);

  if (unknownPrimary) return <NotFoundRoute />;

  const popModel = isPop ? { country: parsed.country ?? place?.country ?? null, model: parsed.model, point: parsed.point ?? 'fusion', radar: parsed.radar ?? true } : undefined;

  return (
    <MapView
      location={mapLocation}
      overview={!place}
      initialActive={init.layers}
      initialHour={init.hour}
      initialView={init.cam}
      initialModelSource={{ country: init.country, model: init.model, point: init.point, radar: init.radar }}
      routeLayers={urlLayers}
      routeHour={isPop ? (parsed.hour ?? 0) : undefined}
      routeModelSource={popModel}
      onLayersChange={onLayersChange}
      onHourChange={onHourChange}
      onViewChange={onViewChange}
      onModelSourceChange={onModelSourceChange}
      onSelectLocation={onSelectLocation}
      onBack={nav.goHome}
      onOpenFeature={nav.openFeature}
    />
  );
}
