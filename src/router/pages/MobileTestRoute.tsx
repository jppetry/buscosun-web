import MobilePrimitivesTestPage from '../../mobile/MobilePrimitivesTestPage';
import { useAppNav } from '../useAppNav';

export default function MobileTestRoute() {
  const nav = useAppNav();
  return <MobilePrimitivesTestPage onBack={nav.goHome} />;
}
