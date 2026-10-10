import { Suspense, useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation, useNavigate, useNavigation } from 'react-router';
import type { Location } from './types';
import AppLoader from './router/AppLoader';
import RouteMeta from './router/RouteMeta';
import RouteAnnouncer from './router/RouteAnnouncer';
import { normalizePath } from './router/routes';
import './fonts.css';
import './designTokens.css';

// Seit Phase RT1 (2026-08-22) ist App das ROOT-LAYOUT des Routers: die Seiten
// sind Routen (`src/router/router.tsx`, je Seite ein Lazy-Chunk — auch die
// Startseite), der Zustand lebt in Pfad + Query (`src/router/urlState.ts`) bzw.
// weiterhin im Fragment der Feature-Codecs. Die frühere View-Maschine
// (`useState<View>`, Hash-Lesen beim Mount) ist ersetzt; Alt-Links migriert
// `src/router/legacyHash.ts` in `main.tsx`, bevor der Router die URL liest.

export type FeatureId = 'route' | 'event' | 'dayflow' | 'forecast' | 'nowcast' | 'atmosphere' | 'history' | 'globe' | 'map2d' | 'fire' | 'road' | 'sea' | 'feedback' | 'validation' | 'mobiletest';

/** Standort-Default für die 2D-Karten-Kachel (ohne Ortssuche): DACH-Überblick,
 *  zentriert auf Mitteleuropa. Marker/Punktpanel sind im overview-Modus aus. */
export const DACH_OVERVIEW_LOCATION: Location = { name: 'Deutschland · Österreich · Schweiz', lat: 50.2, lon: 10.5, country: 'DE' };

export interface FeatureInfo {
  id: FeatureId;
  eyebrow: string;
  title: string;
}

/**
 * Phase PF (M5, audit/performance-2026-10-10.md): immediate feedback for a click that changes the route. React Router commits a
 * navigation only when the lazy route chunk (and `MapView` for the map routes) is loaded and evaluated — measured 10.10.2026:
 * 0,6–2,0 s on the desktop between the tile click and the new view, nothing visible in between. The bar appears with the
 * first render after the click (`navigation.state === 'loading'`) and leaves with the commit. Tokens only, no layout shift.
 */
function NavProgress() {
  // `useNavigation` lives HERE, not in `App`: a navigation-state change then re-renders only this bar, not the whole route tree
  // (measured 10.10.2026, desktop: the bar in `App` cost the home page a re-render in the click window, +150–250 ms to the commit).
  const navigation = useNavigation();
  if (navigation.state !== 'loading') return null;
  return (
    <div aria-hidden="true" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 2147483000, pointerEvents: 'none', background: 'color-mix(in srgb, var(--sand-200, #E0D6BE) 60%, transparent)' }}>
      <style>{'@keyframes app-nav-bar{0%{transform:translateX(-100%)}60%{transform:translateX(30%)}100%{transform:translateX(100%)}}'}</style>
      <div style={{ width: '45%', height: '100%', background: 'var(--terracotta-500, #C97B47)', animation: 'app-nav-bar 1.1s ease-in-out infinite' }} />
    </div>
  );
}

export default function App() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();

  // Kanonischer Pfad: End-Slash, Großschreibung und Aliase werden per `replace`
  // bereinigt. Netlify kann den Slash-Fall nicht (Regel `/x/ → /x` ist dort eine
  // Endlosschleife), darum hier — der Canonical-Link zeigt ohnehin auf den Pfad ohne Slash.
  useEffect(() => {
    const n = normalizePath(pathname);
    if (n) void navigate(n + search + hash, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      <RouteMeta />
      <RouteAnnouncer />
      <ScrollRestoration />
      <NavProgress />
      <Suspense fallback={<AppLoader />}>
        <Outlet />
      </Suspense>
    </>
  );
}
