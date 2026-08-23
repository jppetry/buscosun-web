import ForecastPage from '../../confidence/ForecastPage';
import { useAppNav } from '../useAppNav';

export default function ForecastRoute() {
  const nav = useAppNav();
  return <ForecastPage onBack={nav.goHome} onOpenFeature={nav.openFeature} />;
}
