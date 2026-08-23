import SearchPage from '../../SearchPage';
import { useAppNav } from '../useAppNav';

/** `/` — Startseite (seit RT1 lazy: das Initial-Bundle trägt nur noch Shell + Router). */
export default function HomeRoute() {
  const nav = useAppNav();
  return <SearchPage onSelect={nav.selectLocation} onOpenFeature={nav.openFeature} />;
}
