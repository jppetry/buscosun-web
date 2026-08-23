/**
 * Route-Meta im Client: `<title>`, description, canonical (NUR Pfad, nie Query
 * — sonst indexiert Google jede Kartenposition), og:*, robots und ein
 * `WebPage`-JSON-LD. Auf `/` wird das JSON-LD entfernt, damit die vom
 * Build-Generator injizierte `WebApplication` das einzige bleibt.
 *
 * Quelle ist EINE Tabelle (`routes.ts`), die auch die statischen Route-Shells
 * speist — Roh-HTML und Client sagen dasselbe.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { canonicalPath, metaForPath, SITE_NAME, SITE_URL } from './routes';

function setMeta(selector: string, create: () => HTMLElement, value: string | null): void {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (value == null) { el?.remove(); return; }
  if (!el) { el = create(); document.head.appendChild(el); }
  if (el.tagName === 'LINK') el.setAttribute('href', value); else el.setAttribute('content', value);
}
const meta = (attr: 'name' | 'property', key: string, value: string | null) =>
  setMeta(`meta[${attr}="${key}"]`, () => { const m = document.createElement('meta'); m.setAttribute(attr, key); return m; }, value);

const HOME_TITLE = 'buscosun — Wetter DE · AT · CH';

export function titleFor(pathname: string): string {
  const m = metaForPath(pathname);
  return m.routeId === 'home' ? HOME_TITLE : `${m.title} | ${SITE_NAME}`;
}

export default function RouteMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const m = metaForPath(pathname);
    const canon = SITE_URL + canonicalPath(pathname);
    const title = titleFor(pathname);
    document.title = title;
    meta('name', 'description', m.description);
    setMeta('link[rel="canonical"]', () => { const l = document.createElement('link'); l.setAttribute('rel', 'canonical'); return l; }, canon);
    meta('property', 'og:title', title);
    meta('property', 'og:description', m.description);
    meta('property', 'og:url', canon);
    if (m.ogImage) meta('property', 'og:image', SITE_URL + m.ogImage);
    meta('name', 'robots', m.noindex ? 'noindex, follow' : null);

    const id = 'route-jsonld';
    let script = document.getElementById(id);
    if (m.routeId === 'home' || m.routeId === null) {
      script?.remove();
    } else {
      if (!script) { script = document.createElement('script'); script.id = id; script.setAttribute('type', 'application/ld+json'); document.head.appendChild(script); }
      script.textContent = JSON.stringify({
        '@context': 'https://schema.org', '@type': 'WebPage',
        name: m.title, description: m.description, url: canon, inLanguage: 'de',
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL + '/' },
      });
    }
  }, [pathname]);
  return null;
}
