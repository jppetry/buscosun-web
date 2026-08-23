import EventPage from '../../event/EventPage';
import { useAppNav } from '../useAppNav';

export default function EventRoute() {
  const nav = useAppNav();
  return <EventPage onBack={nav.goHome} onOpenFeature={nav.openFeature} />;
}
