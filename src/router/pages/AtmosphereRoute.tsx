/**
 * `/atmosphaere/:lens?` — Linse im Pfad (`fliegen` · `berg-und-weg` · `querschnitt` ·
 * `arbeitsfenster`), übrige Unteransichten des Querschnitts weiter in `?ansicht=`
 * (inversion), Detailzustand im Fragment `#atm=` (Codec unangetastet).
 *
 * SEO/GEO 2026 (E7): Go/No-Go hatte nur die Query-Form `?ansicht=gonogo` und damit keinen
 * kanonischen Pfad — llms.txt und die Tool-Seite verlinkten eine URL, die Google auf die
 * Elternseite faltet. Jetzt ist `/atmosphaere/arbeitsfenster` der Pfad derselben Ansicht;
 * die alte Query-Form bleibt gültig und wird beim Öffnen per `replace` darauf umgeschrieben.
 * Pfad und Query werden an EINER Stelle gerechnet (`urlFor`) und pro Tick einmal geschrieben,
 * damit Linsen- und Unterlinsen-Wechsel im selben Commit nicht zwei Einträge erzeugen.
 */
import { useCallback, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router';
import AtmospherePage, { type DeckSub } from '../../atmosphere/AtmospherePage';
import type { Lens } from '../../atmosphere/atmosphereState';
import { ATMOSPHERE_LENS_SLUGS, ATMOSPHERE_WORK_WINDOW_SLUG } from '../routes';
import { useAppNav } from '../useAppNav';
import NotFoundRoute from './NotFoundRoute';

const SLUG_TO_LENS: Record<string, Lens> = {
  [ATMOSPHERE_LENS_SLUGS.fly]: 'fly',
  [ATMOSPHERE_LENS_SLUGS.mountain]: 'mountain',
  [ATMOSPHERE_LENS_SLUGS.section]: 'section',
  [ATMOSPHERE_WORK_WINDOW_SLUG]: 'section',
};
/** Sub-Route mit eigener Unterlinse (der Rest kommt aus `?ansicht=`). */
const SLUG_TO_SUB: Record<string, DeckSub> = { [ATMOSPHERE_WORK_WINDOW_SLUG]: 'gonogo' };
const SUBS: readonly DeckSub[] = ['hoehenwind', 'inversion', 'gonogo'];

/** Kanonische URL zu Linse + Unterlinse: Go/No-Go hat einen eigenen Pfad, `inversion` bleibt Query. */
function urlFor(lens: Lens, sub: DeckSub, search: string, hash: string): string {
  const path = lens === 'section' && sub === 'gonogo'
    ? `/atmosphaere/${ATMOSPHERE_WORK_WINDOW_SLUG}`
    : `/atmosphaere/${ATMOSPHERE_LENS_SLUGS[lens]}`;
  const p = new URLSearchParams(search);
  if (lens === 'section' && sub === 'inversion') p.set('ansicht', sub); else p.delete('ansicht');
  const q = p.toString();
  return path + (q ? `?${q}` : '') + hash;
}

export default function AtmosphereRoute() {
  const { lens: slug } = useParams<{ lens?: string }>();
  const loc = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const nav = useAppNav();

  const lens = slug ? SLUG_TO_LENS[slug] ?? null : null;
  const ansichtRaw = new URLSearchParams(loc.search).get('ansicht');
  const subFromQuery = (SUBS as readonly string[]).includes(ansichtRaw ?? '') ? (ansichtRaw as DeckSub) : null;
  // Der Pfad schlägt die Query: `/atmosphaere/arbeitsfenster?ansicht=inversion` bleibt Go/No-Go.
  const initialSub = (slug ? SLUG_TO_SUB[slug] : null) ?? subFromQuery;

  const lensRef = useRef<Lens | null>(lens);
  const subRef = useRef<DeckSub>(initialSub ?? 'hoehenwind');
  const pendingRef = useRef(false);
  const replaceRef = useRef(false);

  /** Ein Schreibvorgang je Tick — Linse und Unterlinse melden im selben Commit. */
  const syncUrl = useCallback((replace: boolean) => {
    if (replace) replaceRef.current = true;
    if (pendingRef.current) return;
    pendingRef.current = true;
    queueMicrotask(() => {
      pendingRef.current = false;
      const asReplace = replaceRef.current;
      replaceRef.current = false;
      const l = lensRef.current;
      if (!l) return;
      const here = window.location.pathname + window.location.search + window.location.hash;
      const target = urlFor(l, subRef.current, window.location.search, window.location.hash);
      if (target === here) return;
      void navigate(target, { replace: asReplace });
    });
  }, [navigate]);

  const onLensChange = useCallback((l: Lens, initial: boolean) => {
    lensRef.current = l;
    syncUrl(initial);
  }, [syncUrl]);

  // Unterlinsen-Wechsel ist kein Seitenwechsel: immer `replace` (wie bisher `replaceState`).
  const onSubChange = useCallback((sub: DeckSub) => {
    subRef.current = sub;
    syncUrl(true);
  }, [syncUrl]);

  if (slug && !lens) return <NotFoundRoute />;

  return (
    <AtmospherePage
      onBack={nav.goHome}
      onOpenFeature={nav.openFeature}
      initialLens={lens}
      routeLens={navType === 'POP' ? lens : undefined}
      initialSub={initialSub}
      routeSub={navType === 'POP' ? initialSub : undefined}
      onLensChange={onLensChange}
      onSubChange={onSubChange}
    />
  );
}
