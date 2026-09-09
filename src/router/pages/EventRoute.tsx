/**
 * `/eventplanung/:view?[/:ort?]` — Anlass im Pfad (`grillen`, `hochzeit`, …),
 * Ort als lesbares letztes Segment, der übrige Zustand seit SH4 in der QUERY
 * (`src/event/eventUrl.ts`).
 *
 * Der alte Permalink `#ev=` war mit **340 Zeichen** der längste Link im Repo
 * (`audit/teilen-share.md` §1.3) — und im Fragment, das den Server nie erreicht
 * (§1.2). Jetzt steht dasselbe lesbar in Pfad und Query:
 * `/eventplanung/hochzeit/konstanz?von=2026-09-18&bis=2026-09-25`.
 *
 * Dieser Wrapper ist der **einzige Schreiber**; `EventPage` meldet die
 * abgeschickte Anfrage per `onUrlState` (und `null`, sobald jemand wieder
 * bearbeitet). Ein Alt-Link wird beim Ankommen einmal übersetzt
 * (`eventState.ts` bleibt Leser).
 *
 * Unverändert bleibt, was `eventState.ts` schon festgelegt hat: **Tuning und
 * Plan-B werden nicht geteilt** — sie entstehen aus dem Anlass-Preset.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import EventPage from '../../event/EventPage';
import { decodeEventState } from '../../event/eventState';
import { buildEventSearch, parseEventQuery } from '../../event/eventUrl';
import {
  EVENT_ACTIVITIES, customActivity, defaultPhasesFor, defaultPlanB,
  horizonEndISO, todayISO, type EventQuery,
} from '../../event/eventModel';
import { defaultTuningFor } from '../../event/eventScoring';
import { slugForPlace, resolveRoutePlace } from '../../share/placeTable';
import { EVENT_ACTIVITY_SLUGS } from '../routes';
import { useAppNav } from '../useAppNav';
import NotFoundRoute from './NotFoundRoute';

const SLUG_FOR_ACTIVITY: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(EVENT_ACTIVITY_SLUGS).map(([slug, id]) => [id, slug]),
);

export default function EventRoute() {
  const { view, ort } = useParams<{ view?: string; ort?: string }>();
  const loc = useLocation();
  const navigate = useNavigate();
  const nav = useAppNav();

  const pathActivityId = view ? EVENT_ACTIVITY_SLUGS[view] ?? null : null;

  const legacy = useMemo(() => (typeof window === 'undefined' || !loc.hash ? null : decodeEventState(loc.hash)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  const parsed = useMemo(() => parseEventQuery(loc.search), [loc.search]);
  const routePlace = useMemo(() => resolveRoutePlace(ort, parsed.place), [ort, parsed.place]);

  /**
   * Eine vollständige Anfrage braucht Anlass, Ort und ein Zeitfenster. Fehlt
   * eines davon, öffnet der Wizard wie bisher — ein halb geratenes Resultat
   * wäre schlechter als die Frage danach.
   */
  const initialQuery = useMemo<EventQuery | null>(() => {
    if (legacy) return legacy;
    const place = routePlace.place;
    if (!place || !parsed.window) return null;
    const known = pathActivityId ? EVENT_ACTIVITIES.find((a) => a.id === pathActivityId) ?? null : null;
    const activity = known ?? (parsed.activityLabel ? customActivity(parsed.activityLabel) : null);
    if (!activity) return null;
    const phases = parsed.phases.length ? parsed.phases : defaultPhasesFor(activity.id);
    if (!phases.length) return null;
    return {
      activity, location: place, zone: parsed.zone,
      window: parsed.window, phases,
      tuning: defaultTuningFor(activity.id), planB: defaultPlanB(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queryRef = useRef<EventQuery | null>(initialQuery);
  const activityRef = useRef<string | null>(initialQuery?.activity.id ?? pathActivityId);
  const extraRef = useRef<Array<[string, string]>>(parsed.extra);

  const urlOf = useCallback(() => {
    const q = queryRef.current;
    const id = q?.activity.id ?? activityRef.current;
    const slugPath = id ? SLUG_FOR_ACTIVITY[id] ?? null : null;
    const base = slugPath ? `/eventplanung/${slugPath}` : '/eventplanung';
    if (!q) return base;
    const sl = slugForPlace(q.location);
    const path = sl ? `${base}/${sl.slug}` : base;
    return path + buildEventSearch(
      {
        activityId: q.activity.id, activityLabel: q.activity.id === 'custom' ? q.activity.label : '',
        place: q.location, window: q.window, phases: q.phases, zone: q.zone ?? null,
      },
      sl, defaultPhasesFor(q.activity.id), !!slugPath, extraRef.current,
    );
  }, []);

  const writeNow = useCallback((replace: boolean) => {
    const url = urlOf();
    if (url === window.location.pathname + window.location.search) return;
    void navigate(url, { replace });
  }, [navigate, urlOf]);

  /** Resultat abgeschickt ⇒ teilbare URL; wieder im Wizard ⇒ blanker Pfad. */
  const onUrlState = useCallback((q: EventQuery | null) => {
    queryRef.current = q;
    if (q) activityRef.current = q.activity.id;
    if (!window.location.pathname.startsWith('/eventplanung')) return;
    const url = urlOf();
    if (url !== window.location.pathname + window.location.search) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [urlOf]);

  const onActivityChange = useCallback((activityId: string | null) => {
    activityRef.current = activityId;
    writeNow(true);
  }, [writeNow]);

  // Alt-Link oder unbrauchbare Werte einmal kanonisch nachziehen.
  useEffect(() => {
    if (view && !pathActivityId) return;
    if (legacy || parsed.invalid.length || loc.hash || routePlace.unresolved || (parsed.place && !ort)) {
      void navigate(urlOf(), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (view && !pathActivityId) return <NotFoundRoute />;

  return (
    <EventPage
      onBack={nav.goHome}
      onOpenFeature={nav.openFeature}
      initialActivityId={initialQuery?.activity.id ?? pathActivityId}
      onActivityChange={onActivityChange}
      initialQuery={initialQuery}
      onUrlState={onUrlState}
    />
  );
}

// `todayISO`/`horizonEndISO` bleiben importiert: sie sind der Standard-Zeitraum,
// falls eine spätere Etappe hier eine Anfrage ohne `von`/`bis` erlauben will.
void todayISO; void horizonEndISO;
