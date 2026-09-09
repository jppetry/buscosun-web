/**
 * `/tourenplanung/:view?` — der Wrapper liest die Sicht aus dem Pfad und
 * schreibt sie zurück. `src/route/` bleibt router-frei (Muster der übrigen
 * Seiten): die Tourenplanung kennt nur `view`, `onView` und seit SH5 den
 * kleinen URL-Zustand.
 *
 * Der Sichtwechsel ist ein **pushState** (wie der Layerwechsel der Wetterkarte,
 * RT1) — „Zurück" führt von 3D nach 2D. Die Route hat einen optionalen
 * Parameter, deshalb bleibt es dieselbe Route: React Router remountet nicht,
 * und die hochgeladene Strecke überlebt den Wechsel (audit/route-3d.md §5 B3).
 *
 * ── Die eine Seite, die nicht vollständig teilbar ist ────────────────────────
 * Die **Strecke** passt in keine URL (`tourStore.ts`; `audit/teilen-share.md`
 * §1.8, Jans Entscheidung E-4). Der Link trägt Bewegungsart, Startzeit und
 * Fahrtrichtung; der Empfänger bringt seine eigene GPX mit. Deshalb gibt es
 * hier auch **keinen Teilen-Knopf** — ein Knopf, der einen Link erzeugt, aus
 * dem der Empfänger die Tour nicht sieht, verspricht mehr als er hält
 * (`parseShareUrl` liefert für diese Route bewusst `null`).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import RoutePage, { type TourViewMode } from '../../route/RoutePage';
import { buildTourSearch, parseTourQuery, type TourUrlState } from '../../route/tourUrl';
import { useAppNav } from '../useAppNav';

const STATE_DEBOUNCE_MS = 300;

export default function TourRoute() {
  const nav = useAppNav();
  const navigate = useNavigate();
  const loc = useLocation();
  const { view } = useParams();
  const mode: TourViewMode = view === '3d' ? '3d' : '2d';

  const parsed = useMemo(() => parseTourQuery(loc.search, Date.now()), [loc.search]);
  const stateRef = useRef<TourUrlState>({ typeId: parsed.typeId, startMs: parsed.startMs, direction: parsed.direction });
  const extraRef = useRef<Array<[string, string]>>(parsed.extra);
  const viewRef = useRef<TourViewMode>(mode);
  viewRef.current = mode;

  const urlOf = useCallback((v: TourViewMode = viewRef.current) =>
    (v === '3d' ? '/tourenplanung/3d' : '/tourenplanung') + buildTourSearch(stateRef.current, extraRef.current), []);

  const timer = useRef<number | null>(null);
  const unmountedRef = useRef(false);
  const onUrlState = useCallback((st: TourUrlState) => {
    stateRef.current = st;
    if (unmountedRef.current) return;
    if (timer.current != null) window.clearTimeout(timer.current);
    // Gebündelt: der Startzeit-Regler feuert sonst je Schritt.
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (unmountedRef.current || !window.location.pathname.startsWith('/tourenplanung')) return;
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

  // Unbrauchbare Werte einmal still aus der URL nehmen.
  useEffect(() => {
    if (parsed.invalid.length) void navigate(urlOf(), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RoutePage
      onBack={nav.goHome}
      onOpenFeature={nav.openFeature}
      view={mode}
      onView={(next) => { void navigate(urlOf(next)); }}
      initialUrl={{ typeId: parsed.typeId, startMs: parsed.startMs, direction: parsed.direction }}
      onUrlState={onUrlState}
    />
  );
}
