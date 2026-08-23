/**
 * `/atmosphaere/:lens?` — Linse im Pfad (`fliegen` · `berg-und-weg` · `querschnitt`),
 * Unteransicht des Querschnitts in `?ansicht=` (hoehenwind | inversion | gonogo),
 * Detailzustand weiterhin im Fragment `#atm=` (Codec unangetastet).
 */
import { useCallback } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router';
import AtmospherePage, { type DeckSub } from '../../atmosphere/AtmospherePage';
import type { Lens } from '../../atmosphere/atmosphereState';
import { ATMOSPHERE_LENS_SLUGS } from '../routes';
import { useAppNav } from '../useAppNav';
import NotFoundRoute from './NotFoundRoute';

const SLUG_TO_LENS: Record<string, Lens> = {
  [ATMOSPHERE_LENS_SLUGS.fly]: 'fly',
  [ATMOSPHERE_LENS_SLUGS.mountain]: 'mountain',
  [ATMOSPHERE_LENS_SLUGS.section]: 'section',
};
const SUBS: readonly DeckSub[] = ['hoehenwind', 'inversion', 'gonogo'];

export default function AtmosphereRoute() {
  const { lens: slug } = useParams<{ lens?: string }>();
  const loc = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const nav = useAppNav();

  const lens = slug ? SLUG_TO_LENS[slug] ?? null : null;
  const ansichtRaw = new URLSearchParams(loc.search).get('ansicht');
  const initialSub = (SUBS as readonly string[]).includes(ansichtRaw ?? '') ? (ansichtRaw as DeckSub) : null;

  const onLensChange = useCallback((l: Lens, initial: boolean) => {
    const target = `/atmosphaere/${ATMOSPHERE_LENS_SLUGS[l]}`;
    if (window.location.pathname === target) return;
    void navigate({ pathname: target, search: window.location.search, hash: window.location.hash }, { replace: initial });
  }, [navigate]);

  const onSubChange = useCallback((sub: DeckSub) => {
    const p = new URLSearchParams(window.location.search);
    if (sub === 'hoehenwind') p.delete('ansicht'); else p.set('ansicht', sub);
    const q = p.toString();
    const url = window.location.pathname + (q ? `?${q}` : '') + window.location.hash;
    if (url !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, []);

  if (slug && !lens) return <NotFoundRoute />;

  return (
    <AtmospherePage
      onBack={nav.goHome}
      onOpenFeature={nav.openFeature}
      initialLens={lens}
      routeLens={navType === 'POP' ? lens : undefined}
      initialSub={initialSub}
      onLensChange={onLensChange}
      onSubChange={onSubChange}
    />
  );
}
