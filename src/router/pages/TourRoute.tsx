import RoutePage from '../../route/RoutePage';
import { useAppNav } from '../useAppNav';

export default function TourRoute() {
  const nav = useAppNav();
  return <RoutePage onBack={nav.goHome} onOpenFeature={nav.openFeature} />;
}
