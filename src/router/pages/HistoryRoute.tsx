import HistoryPage from '../../history/HistoryPage';
import { useAppNav } from '../useAppNav';

export default function HistoryRoute() {
  const nav = useAppNav();
  return <HistoryPage onBack={nav.goHome} onOpenFeature={nav.openFeature} />;
}
