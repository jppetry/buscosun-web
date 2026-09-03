/**
 * `/tourenplanung/:view?` — der Wrapper liest die Sicht aus dem Pfad und
 * schreibt sie zurück. `src/route/` bleibt router-frei (Muster der übrigen
 * Seiten): die Tourenplanung kennt nur `view` und `onView`.
 *
 * Der Sichtwechsel ist ein **pushState** (wie der Layerwechsel der Wetterkarte,
 * RT1) — „Zurück" führt von 3D nach 2D. Die Route hat einen optionalen
 * Parameter, deshalb bleibt es dieselbe Route: React Router remountet nicht,
 * und die hochgeladene Strecke überlebt den Wechsel (audit/route-3d.md §5 B3).
 */
import { useNavigate, useParams } from 'react-router';
import RoutePage, { type TourViewMode } from '../../route/RoutePage';
import { useAppNav } from '../useAppNav';

export default function TourRoute() {
  const nav = useAppNav();
  const navigate = useNavigate();
  const { view } = useParams();
  const mode: TourViewMode = view === '3d' ? '3d' : '2d';
  return (
    <RoutePage
      onBack={nav.goHome}
      onOpenFeature={nav.openFeature}
      view={mode}
      onView={(next) => { void navigate(next === '3d' ? '/tourenplanung/3d' : '/tourenplanung'); }}
    />
  );
}
