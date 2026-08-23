import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { createAppRouter } from './router/router';
import { runLegacyHashMigration } from './router/legacyHash';
import './index.css';

// Alt-Permalinks (`/#m=…`, `/#wb=…`, …) VOR dem Router auf die neuen Pfade
// heben — `createBrowserRouter` liest `window.location` beim Erzeugen.
const migrated = runLegacyHashMigration(window.location);
if (migrated) window.history.replaceState(window.history.state, '', migrated);

const router = createAppRouter();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

// PWA: Service Worker nur in Produktion registrieren (im Dev stört er das
// Vite-HMR). Offline-Shell + Runtime-Cache siehe public/sw.js.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* SW optional — App läuft auch ohne */ });
  });
}
