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
// BW-11 (2026-08-26): Registrieren allein reicht nicht. Ein neuer Worker bleibt
// in `waiting`, solange ein Tab der Herkunft offen ist — gemessen stand v4 als
// `installed`, während der ALTE Worker weiter bediente und `/latest-wind.json`
// aus seinem nie ablaufenden Asset-Cache lieferte (der Lauf der VORIGEN Sitzung,
// `audit/bandbreite.md` §30). Deshalb: den wartenden Worker ausdrücklich
// übernehmen lassen und die Seite danach GENAU EINMAL neu laden.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // Ob die Seite beim Laden schon bedient wurde, entscheidet über das Neuladen:
    // bei der ERSTregistrierung feuert `controllerchange` durch `clients.claim()`
    // — dort wäre ein Reload eine sinnlose zweite Ladung.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const takeOver = (sw: ServiceWorker | null) => sw?.postMessage({ type: 'SKIP_WAITING' });
      takeOver(reg.waiting);                       // steht schon einer bereit?
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) takeOver(sw);
        });
      });
      void reg.update().catch(() => { /* Netzfehler — beim nächsten Laden erneut */ });
    }).catch(() => { /* SW optional — App läuft auch ohne */ });
  });
}
