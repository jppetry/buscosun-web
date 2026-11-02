/**
 * Phase GLS (audit/gletscher-seo.md): Seiten, deren Shell schon beim Build einen EIGENEN Head und Faktenblock trägt
 * (die Gletscher-Steckbriefe `/gletscher/<land>-<name>`, `scripts/seo/glacierPages.mjs`).
 *
 * Zwei Dinge gingen sonst nach dem App-Mount verloren:
 *  · Head — `RouteMeta` schrieb Title, Description und Canonical der Route (`/gletscher`) über die der Seite. Google wertet den
 *    gerenderten Head; ein Canonical, das per JavaScript auf eine andere URL springt, kostet die Seite den Index.
 *  · Faktenblock — React ersetzt den `#root`-Inhalt; `RouteSeoBlock` zeigt ihn wieder im zugeklappten „Über diese Ansicht".
 *
 * Erkennung: `#seo-fallback[data-static-page="<pfad>"]`, nur wenn der Pfad zur aufgerufenen Adresse passt (die Offline-Shell des
 * Service Workers kann eine fremde Seite tragen). Gilt nur für den Aufruf selbst: Wer in der App weiternavigiert, bekommt ab dann
 * überall den Head der Route (auch bei der Rückkehr) — Suchmaschinen navigieren nicht. Abhängigkeitsfrei und klein, weil es im
 * Start-Chunk liegt (Ratsche eagerJs).
 */
const norm = (p: string): string => (p.length > 1 ? p.replace(/\/+$/, '') : p).toLowerCase();

let page: { path: string; html: string } | null = null;

/** Einmal VOR dem ersten Render (main.tsx): merkt sich den Faktenblock, wenn er zu dieser Adresse gehört. */
export function captureStaticPage(): void {
  const el = document.getElementById('seo-fallback');
  const path = el?.getAttribute('data-static-page');
  if (el && path && norm(path) === norm(window.location.pathname)) page = { path: norm(path), html: el.innerHTML };
}

/** Die vorgerenderte Seite zu diesem Pfad (Head bleibt, Faktenblock für `RouteSeoBlock`), sonst `null`. */
export function staticPageFor(pathname: string): { path: string; html: string } | null {
  return page && page.path === norm(pathname) ? page : null;
}

/** Beim Verlassen in der App: ab jetzt gilt der Head der Route; die strukturierten Daten der Seite (`data-static`) gehen mit. */
export function leaveStaticPage(): void {
  if (!page) return;
  page = null;
  document.querySelectorAll('script[data-static]').forEach((s) => s.remove());
}
