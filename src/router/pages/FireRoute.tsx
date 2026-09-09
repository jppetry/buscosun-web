/**
 * `/waldbrand/:view?` — Sub-Route = Sicht (`gefahrenindex` · `aktive-braende` ·
 * `trockenheit` · `historie` · `thermalanomalien`), der übrige Zustand seit SH3
 * in der QUERY (`src/fire/fireUrl.ts`).
 *
 * ── Warum der Umzug aus dem Fragment ─────────────────────────────────────────
 * Bis 2026-09-08 lag der Zustand als prozentkodiertes JSON in `#wb=`. Ein
 * Fragment erreicht den Server **nie** — damit war für das Brandradar kein
 * Vorschaubild und kein zustandsbezogener `og:title` möglich
 * (`audit/teilen-share.md` §1.2). Außerdem war die Zeit relativ (`d` = Tage ab
 * heute): ein geteilter Link zeigte dem Empfänger am nächsten Tag einen anderen
 * Tag. Beides ist behoben.
 *
 * **Dieser Wrapper ist der einzige Schreiber** von Pfad und Query (Muster
 * `WetterkarteRoute`, RT1); `FirePage` meldet seinen Zustand per `onUrlState`.
 * Alt-Links laufen weiter: `#wb=` wird beim Ankommen einmal gelesen, übersetzt
 * und per `replace` ersetzt — `fireState.ts` bleibt dafür als Leser erhalten.
 *
 * **Kein Ort im Pfad.** Das Brandradar hat keine Ortswahl (die alte Seite übergab
 * `location: null`); ein Ortssegment wäre eine Behauptung ohne Zustand dahinter.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router';
import FirePage from '../../fire/FirePage';
import { decodeFireState } from '../../fire/fireState';
import {
  buildFireSearch, parseFireQuery, validAtFromDay, validAtFromFireHour,
  type FireUrlState, type ParsedFireQuery,
} from '../../fire/fireUrl';
import { fireViewFromState, isFireRouteView, type FireRouteView } from '../../fire/fireRouteView';
import { useAppNav } from '../useAppNav';
import StaleLinkNotice from '../../share/StaleLinkNotice';
import NotFoundRoute from './NotFoundRoute';

const STATE_DEBOUNCE_MS = 300;
const DEFAULT_VIEW: FireRouteView = 'gefahrenindex';

export default function FireRoute() {
  const { view } = useParams<{ view?: string }>();
  const loc = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const nav = useAppNav();

  const v: FireRouteView | null = isFireRouteView(view) ? view : null;

  /**
   * Alt-Link (`#wb=`) → Zustand, EINMAL beim Ankommen. Vor dem ersten Render,
   * damit die Seite gar nicht erst mit dem alten Zustand mountet.
   */
  const legacy = useMemo(() => {
    if (typeof window === 'undefined' || !loc.hash) return null;
    const st = decodeFireState(loc.hash);
    if (!st) return null;
    const now = Date.now();
    const hourly = typeof st.hour === 'number';
    const parsed: ParsedFireQuery = {
      layers: st.layers,
      validAtMs: hourly ? validAtFromFireHour(st.hour ?? 0, now) : validAtFromDay(st.day, now),
      hourly,
      windowH: st.windowH,
      dangerView: st.dangerView ?? 'fwi',
      burntBuckets: st.burntBuckets ?? ['season'],
      burntDay: st.burntDay ?? null,
      soilMode: st.soilMode ?? 'topsoil',
      readoutTab: st.anomalyPanel ? 'anomalies' : 'fires',
      historyWindow: st.historyWindow ?? null,
      dossier: !!st.dossier,
      // Ein Alt-Hash trug den Tag RELATIV (`d` = Tage ab heute) — er kann gar
      // nicht veraltet sein, also gibt es hier auch nichts zu benennen (V-SH-2).
      timePast: false,
      wantedAtMs: null,
      // Der alte Hash trug `fp`/`ta` — er hat den Reiter also ausdrücklich benannt.
      readoutExplicit: !!st.footprintPanel || !!st.anomalyPanel,
      invalid: [], extra: [],
    };
    return parsed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsed = useMemo(
    () => parseFireQuery(v ?? DEFAULT_VIEW, loc.search, Date.now()),
    [v, loc.search],
  );
  const initialUrl = legacy ?? parsed;

  const viewRef = useRef<FireRouteView>(
    legacy
      ? fireViewFromState(new Set(legacy.layers), legacy.readoutTab, legacy.historyWindow)
      : v ?? DEFAULT_VIEW,
  );
  const stateRef = useRef<FireUrlState | null>(initialUrl);
  const extraRef = useRef<Array<[string, string]>>(parsed.extra);

  const urlOf = useCallback(() => {
    const st = stateRef.current;
    return `/waldbrand/${viewRef.current}` + (st ? buildFireSearch(st, viewRef.current, extraRef.current) : '');
  }, []);

  // Zustandsänderungen sind kein Seitenwechsel: replaceState am Router vorbei,
  // gebündelt (der Zeit-Schieber feuert sonst je Schritt einen Eintrag).
  const timer = useRef<number | null>(null);
  const unmountedRef = useRef(false);
  const onUrlState = useCallback((st: FireUrlState) => {
    stateRef.current = st;
    if (unmountedRef.current) return;
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (unmountedRef.current || !window.location.pathname.startsWith('/waldbrand')) return;
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

  /** Sichtwechsel ⇒ Pfad (erster Abgleich replace, danach push). */
  const onViewChange = useCallback((next: FireRouteView, initial: boolean) => {
    viewRef.current = next;
    const target = urlOf();
    if (target === window.location.pathname + window.location.search) return;
    void navigate(target, { replace: initial });
  }, [navigate, urlOf]);

  // Alt-Link oder unbrauchbare Werte einmal kanonisch nachziehen — und das
  // Fragment loswerden, denn genau darum geht es in dieser Etappe.
  useEffect(() => {
    if (view && !v) return;
    if (legacy || parsed.invalid.length || loc.hash) {
      void navigate(urlOf(), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (view && !v) return <NotFoundRoute />;

  return (
    <>
      {/* V-SH-2: Die Tagesachse klemmt einen vergangenen Tag auf „heute" — das
          gehört gesagt, sonst sieht der Empfänger etwas anderes als versprochen. */}
      <StaleLinkNotice
        at={initialUrl.timePast ? initialUrl.wantedAtMs : null}
        kind={initialUrl.hourly ? 'time' : 'day'}
        shows="heute"
      />
      <FirePage
        onBack={nav.goHome}
        onOpenFeature={nav.openFeature}
        initialView={legacy ? viewRef.current : v}
        routeView={navType === 'POP' ? v : undefined}
        onViewChange={onViewChange}
        initialUrl={initialUrl}
        onUrlState={onUrlState}
      />
    </>
  );
}
