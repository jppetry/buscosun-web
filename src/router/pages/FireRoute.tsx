/**
 * `/waldbrand/:view?` — Sub-Route = Preset (`gefahrenindex` · `aktive-braende` ·
 * `trockenheit`); der vollständige Zustand bleibt im Fragment `#wb=` (Codec
 * unangetastet, Alt-Links laufen). Reiter-/Layerwechsel schreiben den Pfad (push),
 * der erste Abgleich nach dem Mount nur per replace.
 */
import { useCallback } from 'react';
import { useNavigate, useNavigationType, useParams } from 'react-router';
import FirePage from '../../fire/FirePage';
import { isFireRouteView, type FireRouteView } from '../../fire/fireRouteView';
import { useAppNav } from '../useAppNav';
import NotFoundRoute from './NotFoundRoute';

export default function FireRoute() {
  const { view } = useParams<{ view?: string }>();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const nav = useAppNav();

  const onViewChange = useCallback((v: FireRouteView, initial: boolean) => {
    const target = `/waldbrand/${v}`;
    if (window.location.pathname === target) return;
    void navigate({ pathname: target, search: window.location.search, hash: window.location.hash }, { replace: initial });
  }, [navigate]);

  if (view && !isFireRouteView(view)) return <NotFoundRoute />;
  const v: FireRouteView | null = isFireRouteView(view) ? view : null;

  return (
    <FirePage
      onBack={nav.goHome}
      onOpenFeature={nav.openFeature}
      initialView={v}
      routeView={navType === 'POP' ? v : undefined}
      onViewChange={onViewChange}
    />
  );
}
