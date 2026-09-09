/**
 * `/wetterarchiv[/<ort-slug>]` — Zustand seit SH4 in Pfad + Query
 * (`src/history/historyUrl.ts`), nicht mehr im Fragment `#h=`.
 *
 * Der alte Codec war schon ein Query-String — nur im Fragment, das den Server
 * nie erreicht (`audit/teilen-share.md` §1.2), und mit Kürzeln, die niemand
 * raten kann (`v=tmax&r=yearly&p=all&c=kenntage&k=hot`). Jetzt steht dasselbe
 * im Klartext, und der Ort als lesbares Pfadsegment.
 *
 * Dieser Wrapper ist der **einzige Schreiber**; `HistoryPage` meldet Ort und
 * Einstellungen per `onUrlState`. Ein Alt-Link wird beim Ankommen einmal
 * gelesen, übersetzt und per `replace` ersetzt (`historyState.ts` bleibt Leser).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import HistoryPage from '../../history/HistoryPage';
import { decodeState as decodeHistoryHash, type HistoryLocation, type HistorySettings } from '../../history/historyState';
import { buildHistorySearch, parseHistoryQuery } from '../../history/historyUrl';
import { placeBySlug, slugForPlace } from '../../share/placeTable';
import { isSlugShape } from '../../share/placeSlug';
import { useAppNav } from '../useAppNav';

const STATE_DEBOUNCE_MS = 300;

/** Das Archiv führt `admin` statt `country`; für den Slug reicht der Name + Punkt. */
const slugFor = (p: HistoryLocation | null) =>
  (p ? slugForPlace({ name: p.name, lat: p.lat, lon: p.lon, country: 'DE' }) : null);

export default function HistoryRoute() {
  const loc = useLocation();
  const navigate = useNavigate();
  const nav = useAppNav();

  const legacy = useMemo(() => {
    if (typeof window === 'undefined' || !loc.hash) return null;
    const dec = decodeHistoryHash(loc.hash);
    return dec?.loc ? dec : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsed = useMemo(() => parseHistoryQuery(loc.search), [loc.search]);
  const ortSlug = useMemo(() => {
    const seg = loc.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    return isSlugShape(seg[1]) ? seg[1] : null;
  }, [loc.pathname]);

  /** Ort: Query gewinnt (echter Punkt), sonst der Tabellenort aus dem Pfad. */
  const place: HistoryLocation | null = useMemo(() => {
    if (legacy?.loc) return legacy.loc;
    if (parsed.place) return { name: parsed.place.name || (placeBySlug(ortSlug)?.name ?? ''), lat: parsed.place.lat, lon: parsed.place.lon };
    const t = placeBySlug(ortSlug);
    return t ? { name: t.name, lat: t.lat, lon: t.lon } : null;
  }, [legacy, parsed.place, ortSlug]);

  const initialUrl = useMemo(
    () => ({ place, settings: legacy?.settings ?? parsed.settings }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const stateRef = useRef<{ place: HistoryLocation | null; settings: HistorySettings }>(initialUrl);
  const extraRef = useRef<Array<[string, string]>>(parsed.extra);

  const urlOf = useCallback(() => {
    const { place: pl, settings } = stateRef.current;
    const sl = slugFor(pl);
    const path = pl && sl ? `/wetterarchiv/${sl.slug}` : '/wetterarchiv';
    return path + buildHistorySearch(pl, settings, sl, extraRef.current);
  }, []);

  const timer = useRef<number | null>(null);
  const unmountedRef = useRef(false);
  const onUrlState = useCallback((pl: HistoryLocation, settings: HistorySettings) => {
    stateRef.current = { place: pl, settings };
    if (unmountedRef.current) return;
    if (timer.current != null) window.clearTimeout(timer.current);
    // Gebündelt: Regler und Auswahlfelder feuern sonst je Schritt.
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (unmountedRef.current || !window.location.pathname.startsWith('/wetterarchiv')) return;
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

  /** „Ort wechseln" / „Zurück": die URL wieder auf den blanken Pfad. */
  const onClearPlace = useCallback(() => {
    stateRef.current = { place: null, settings: stateRef.current.settings };
    if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null; }
    if (window.location.pathname.startsWith('/wetterarchiv')) {
      window.history.replaceState(window.history.state, '', '/wetterarchiv');
    }
  }, []);

  // Alt-Link oder unbrauchbare Werte einmal kanonisch nachziehen.
  useEffect(() => {
    if (legacy || parsed.invalid.length || loc.hash || (parsed.place && !ortSlug)) {
      void navigate(urlOf(), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <HistoryPage
      onBack={nav.goHome}
      onOpenFeature={nav.openFeature}
      initialUrl={initialUrl}
      onUrlState={onUrlState}
      onClearPlace={onClearPlace}
    />
  );
}
