import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Dev-only Performance-HUD (FPS / Long Tasks / Repaints). Dynamischer Import →
// aus dem Prod-Bundle getreeshaked. Standardmäßig unsichtbar (Shift+P oder #perf).
if (import.meta.env.DEV) {
  import('./dev/perfHud').then((m) => m.initPerfHud()).catch(() => { /* HUD optional */ });
}

// PWA: Service Worker nur in Produktion registrieren (im Dev stört er das
// Vite-HMR). Offline-Shell + Runtime-Cache siehe public/sw.js.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* SW optional — App läuft auch ohne */ });
  });
}
