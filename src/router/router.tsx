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
import { CROSS_ALIASES, ROUTES, ROUTE_BY_ID, routeForPath, type RouteId } from './routes';
import { warmRouteData } from './prefetch';

/**
 * `warm`: LE1/H2 — sobald React Router die Route auflöst (beim Erstaufruf: direkt
 * nach `index.js`, VOR dem Download des Seiten-Chunks), startet der Frühstart
 * der Datenabrufe dieser Seite (`prefetch.ts`). Fehler dort bleiben ohne Folge
 * — die Seite lädt dann wie bisher selbst.
 */
const page = (load: () => Promise<{ default: ComponentType }>, warm?: RouteId) => ({
  lazy: {
    Component: async () => {
      if (warm && typeof window !== 'undefined') {
        try { warmRouteData(warm, window.location.pathname, window.location.search); } catch { /* Frühstart ist Bonus */ }
      }
      return (await load()).default;
    },
  },
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
  // Cross-Aliase, die auf einen ANDEREN Pfad zeigen (`/route/3d` → `/tourenplanung/3d`).
  // In Prod erledigt das die 301 in `netlify.toml`; clientseitig nur für die, die
  // keine echte Route treffen — `/wetterkarte/warnungen` ist eine echte Sub-Route
  // und bleibt bewusst stehen (sonst remountet der Layerwechsel die Karte, RT1).
  const crossAliasRoutes: RouteObject[] = CROSS_ALIASES
    .filter(([from]) => !routeForPath(from, false))
    .map(([from, to]) => ({ path: from.slice(1), element: <AliasRedirect to={to} /> }));
  const routes: RouteObject[] = [
    {
      path: '/',
      Component: App,
      HydrateFallback: AppLoader,
      ErrorBoundary: RouteError,
      children: [
        { index: true, ...page(() => import('./pages/HomeRoute')) },
        { path: sub('wetterkarte'), ...page(() => import('./pages/WetterkarteRoute'), 'wetterkarte') },
        { path: sub('warnungen'), ...page(() => import('./pages/WarnungenRoute'), 'warnungen') },
        { path: sub('regenradar'), ...page(() => import('./pages/NowcastRoute'), 'regenradar') },
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
        ...crossAliasRoutes,
        { path: '*', ...page(() => import('./pages/NotFoundRoute')) },
      ],
    },
  ];
  return createBrowserRouter(routes);
}
