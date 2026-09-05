/**
 * `/eventplanung/:view?` — Sub-Route = Anlass-Preset (`grillen`, `hochzeit`, …).
 *
 * SEO/GEO 2026 (E7): die elf Anlaesse waren nur Schritt 3 des Wizards und hatten keine URL —
 * „Hochzeit Wetter Plan B" und „bester Tag zum Grillen" sind eigene Suchintentionen. Der Pfad
 * waehlt den Anlass vor; der uebrige Zustand bleibt im Fragment `#ev=` (Codec unangetastet).
 */
import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import EventPage from '../../event/EventPage';
import { EVENT_ACTIVITY_SLUGS } from '../routes';
import { useAppNav } from '../useAppNav';
import NotFoundRoute from './NotFoundRoute';

const SLUG_FOR_ACTIVITY: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(EVENT_ACTIVITY_SLUGS).map(([slug, id]) => [id, slug]),
);

export default function EventRoute() {
  const { view } = useParams<{ view?: string }>();
  const navigate = useNavigate();
  const nav = useAppNav();

  const onActivityChange = useCallback((activityId: string | null) => {
    const slug = activityId ? SLUG_FOR_ACTIVITY[activityId] : null;
    const target = slug ? `/eventplanung/${slug}` : '/eventplanung';
    if (window.location.pathname === target) return;
    void navigate({ pathname: target, search: window.location.search, hash: window.location.hash }, { replace: true });
  }, [navigate]);

  if (view && !EVENT_ACTIVITY_SLUGS[view]) return <NotFoundRoute />;

  return (
    <EventPage
      onBack={nav.goHome}
      onOpenFeature={nav.openFeature}
      initialActivityId={view ? EVENT_ACTIVITY_SLUGS[view] : null}
      onActivityChange={onActivityChange}
    />
  );
}
