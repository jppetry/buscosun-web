import GlobePage from '../../globe/GlobePage';
import { useAppNav } from '../useAppNav';

export default function GlobeRoute() {
  const nav = useAppNav();
  return <GlobePage onBack={nav.goHome} />;
}
