/**
 * Der Data-Router (React Router 7, `createBrowserRouter`).
 *
 * Jede Seite ist eine `lazy`-Route (eigener Chunk, geladen beim ersten Aufruf);
 * `HydrateFallback` überbrückt den ersten Chunk-Download. Alias-Pfade gibt es
 * auch clientseitig (`<Navigate replace>`), damit `vite dev`/`vite preview` sich
 * wie die Netlify-301 verhalten. `createAppRouter()` ist eine Funktion, weil
 * `main.tsx` VORHER die Legacy-Hash-Migration laufen lässt — der Router liest
 * `window.location` beim Erzeugen.
 */
import type { ComponentType } from 'react';
import { createBrowserRouter, isRouteErrorResponse, Navigate, useLocation, useRouteError, type RouteObject } from 'react-router';
import App from '../App';
import AppLoader from './AppLoader';
import { ROUTES, ROUTE_BY_ID } from './routes';

const page = (load: () => Promise<{ default: ComponentType }>) => ({
  lazy: { Component: async () => (await load()).default },
});

function AliasRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}

function RouteError() {
  const err = useRouteError();
  const msg = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : 'Unbekannter Fehler';
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--cream-50, #FAF6EA)', color: 'var(--ink-900, #2C2A26)', fontFamily: 'var(--font-base, system-ui, sans-serif)', padding: '1.5rem' }}>
      <div style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: '1.6rem', margin: '0 0 .5rem' }}>Diese Ansicht konnte nicht geladen werden.</h1>
        <p style={{ color: 'var(--stone-600, #5C5447)' }}>{msg}</p>
        <p><a href="/" style={{ color: 'var(--terracotta-700, #A85E2E)' }}>Zur Startseite</a> · <a href={window.location.pathname} style={{ color: 'var(--terracotta-700, #A85E2E)' }}>Neu laden</a></p>
      </div>
    </main>
  );
}

const sub = (id: keyof typeof ROUTE_BY_ID) => {
  const r = ROUTE_BY_ID[id];
  return r.subParam ? `${r.path.slice(1)}/:${r.subParam}?` : r.path.slice(1);
};

export function createAppRouter() {
  const aliasRoutes: RouteObject[] = ROUTES.flatMap((r) =>
    r.aliases.map((a) => ({ path: decodeURIComponent(a).slice(1), element: <AliasRedirect to={r.path} /> })),
  );
  const routes: RouteObject[] = [
    {
      path: '/',
      Component: App,
      HydrateFallback: AppLoader,
      ErrorBoundary: RouteError,
      children: [
        { index: true, ...page(() => import('./pages/HomeRoute')) },
        { path: sub('wetterkarte'), ...page(() => import('./pages/WetterkarteRoute')) },
        { path: sub('warnungen'), ...page(() => import('./pages/WarnungenRoute')) },
        { path: sub('regenradar'), ...page(() => import('./pages/NowcastRoute')) },
        { path: sub('vorhersage'), ...page(() => import('./pages/ForecastRoute')) },
        { path: sub('tourenplanung'), ...page(() => import('./pages/TourRoute')) },
        { path: sub('eventplanung'), ...page(() => import('./pages/EventRoute')) },
        { path: sub('wetterarchiv'), ...page(() => import('./pages/HistoryRoute')) },
        { path: sub('atmosphaere'), ...page(() => import('./pages/AtmosphereRoute')) },
        { path: sub('globus'), ...page(() => import('./pages/GlobeRoute')) },
        { path: sub('waldbrand'), ...page(() => import('./pages/FireRoute')) },
        { path: sub('feedback'), ...page(() => import('./pages/FeedbackRoute')) },
        { path: sub('validierung'), ...page(() => import('./pages/ValidationRoute')) },
        { path: sub('mobiletest'), ...page(() => import('./pages/MobileTestRoute')) },
        ...aliasRoutes,
        { path: '*', ...page(() => import('./pages/NotFoundRoute')) },
      ],
    },
  ];
  return createBrowserRouter(routes);
}
