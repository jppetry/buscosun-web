/**
 * `/buscosun-fusion` — Phase FX-UI (`audit/fusion-erklaerung.md`). The explainer page of buscosun Fusion (lazy chunk).
 * Until Jan flips `FUSION_EXPLAINER_LIVE` the page exists only with `?fx=1` / `localStorage.fx = '1'` (`fxFlag.ts`);
 * without the flag the route answers like an unknown path.
 */
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router';
import NotFoundRoute from './NotFoundRoute';
import AppLoader from '../AppLoader';
import { fxFlagFrom, rememberFxFlag } from '../../fusionExplainer/fxFlag';
import { useAppNav } from '../useAppNav';

const FusionExplainerPage = lazy(() => import('../../fusionExplainer/FusionExplainerPage'));

export default function FusionExplainerRoute() {
  const nav = useAppNav();
  const loc = useLocation();
  const enabled = useMemo(() => fxFlagFrom(loc.search), [loc.search]);
  useEffect(() => { rememberFxFlag(loc.search); }, [loc.search]);
  if (!enabled) return <NotFoundRoute />;
  return (
    <Suspense fallback={<AppLoader />}>
      <FusionExplainerPage onBack={nav.goHome} onOpenFeature={nav.openFeature} />
    </Suspense>
  );
}
