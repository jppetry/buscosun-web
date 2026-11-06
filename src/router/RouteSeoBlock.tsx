/**
 * „Über diese Ansicht" (SEO/GEO 2026, E2).
 *
 * Nach dem App-Mount ersetzt React den vorgerenderten `#root`-Inhalt der
 * Route-Shell — gemessen blieben auf `/wetterkarte/temperatur` 0 H1, ~35 Wörter
 * UI-Text und 0 `<a href>` übrig (SEO-AUDIT.md §4). Google indexiert den
 * gerenderten DOM; die 190 statischen Seiten hingen damit nur an der Sitemap.
 *
 * Dieser Block bringt denselben Text wie die Shell (routes.ts + src/seo/*) in
 * den gerenderten DOM zurück — als natives `<details>`: sichtbar ist nur ein
 * kompakter Chip, der Inhalt ist zugeklappt, aber im DOM (kein `display:none`,
 * kein versteckter Text, also kein Cloaking-Risiko). Der Kartenbereich bleibt
 * pixelgleich (VERIFY V-7). Die Sub-Routen-Texte laden lazy (Budget-Ratsche).
 *
 * Eine H1 rendert der Block nur, wenn die Seite selbst keine hat (Feedback,
 * Idle-Screens mit eigener H1 behalten ihre).
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { canonicalPath, indexableSubRoutes, routeForPath, ROUTE_TEXT_IDS } from './routes';
import type { SeoText } from '../seo/layerSeoTexts';
import type { RouteText } from '../seo/routeTexts';
import { staticPageFor } from '../seo/staticPage';
import './routeSeoBlock.css';

export default function RouteSeoBlock() {
  const { pathname } = useLocation();
  const match = routeForPath(pathname);
  const path = canonicalPath(pathname);
  // Phase GLS: eine vorgerenderte Seite (Gletscher-Steckbrief) bringt ihren eigenen Text mit — kein Nachladen des Routen-Texts.
  const staticPage = staticPageFor(pathname);
  const wantsText = !staticPage && !!match && !match.def.meta.noindex && (match.sub ? !match.sub.noindex : ROUTE_TEXT_IDS.has(match.def.id));
  const [text, setText] = useState<{ path: string; text: (Partial<SeoText> & RouteText) | null } | null>(null);
  const [ownH1, setOwnH1] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!wantsText) { setText(null); return; }
    // A top route's text is not urgent: it waits until the app has settled, so it does not add to the load of a map page.
    // Phase SS: the 56 Seewetter spots load their texts from their own chunk (spot facts), not with the layer texts.
    const seaSpot = match?.def.id === 'seewetter' && match.sub ? match.sub.slug : null;
    const load = () => (seaSpot ? import('../sea/seaSeoText').then((mod) => mod.seaSpotSeoText(seaSpot))
      : match?.sub ? import('../seo/subRouteTexts').then((mod) => mod.subRouteText(path))
        : import('../seo/routeTexts').then((mod) => mod.routeText(path))).then((value) => { if (alive) setText({ path, text: value }); }).catch(() => { if (alive) setText({ path, text: null }); });
    if (match?.sub) { void load(); return () => { alive = false; }; }
    const idle = window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 2000));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => { void load(); }, { timeout: 5000 });
    return () => { alive = false; cancel(id); };
  }, [path, wantsText]);

  // Genau eine H1 je Seite: nur setzen, wenn außerhalb dieses Blocks keine steht.
  useEffect(() => {
    const others = [...document.querySelectorAll('h1')].filter((h) => !h.closest('.rsb'));
    setOwnH1(others.length === 0);
  }, [path]);

  if (!match || match.def.id === 'home' || match.def.meta.noindex || match.sub?.noindex) return null;
  // Jan: no „Über diese Ansicht" chip on Autobahnwetter (the page text stays in the static route shell).
  if (match.def.id === 'autobahnwetter') return null;
  if (staticPage) {
    // Derselbe Faktenblock wie im Roh-HTML, zugeklappt im gerenderten DOM. Die H1 trägt die Seite selbst (Name im Steckbrief),
    // deshalb steht die H1 des Blocks hier als Absatz (`rsb-h1`) — genau eine H1 je Seite.
    const html = staticPage.html.replace(/<h1(\s[^>]*)?>/, '<p class="rsb-h1">').replace('</h1>', '</p>');
    return (
      <details className="rsb rsb-static" data-route={match.def.id}>
        <summary className="rsb-summary" aria-label="Über diesen Gletscher: Fakten, Messreihen, Quellen und Gletscher in der Nähe">
          <span className="rsb-i" aria-hidden="true">i</span> Über diese Ansicht
        </summary>
        <div className="rsb-body" dangerouslySetInnerHTML={{ __html: html }} />
      </details>
    );
  }
  const { def, sub } = match;
  const t = text && text.path === path ? text.text : null;
  const h1 = sub ? (t?.h1 ?? sub.title) : def.meta.h1;
  const lead = sub ? (t?.lead ?? sub.description) : def.meta.lead;
  const subs = indexableSubRoutes(def);
  const siblings = sub ? subs.filter((x) => x.sub.slug !== sub.slug) : subs;
  const Heading = ownH1 ? 'h1' : 'p';

  return (
    <details className="rsb" data-route={def.id}>
      <summary className="rsb-summary" aria-label="Über diese Ansicht: Beschreibung, Quellen und weitere Ansichten">
        <span className="rsb-i" aria-hidden="true">i</span> Über diese Ansicht
      </summary>
      <div className="rsb-body">
        <nav className="rsb-bc" aria-label="Brotkrumen">
          <Link to="/">Start</Link> › {sub ? <><Link to={def.path}>{def.meta.title}</Link> › <span>{sub.title}</span></> : <span>{def.meta.title}</span>}
        </nav>
        <Heading className="rsb-h1">{h1}</Heading>
        <p className="rsb-lead">{lead}</p>
        {t?.body.map((p, i) => <p key={i}>{p}</p>)}
        {t?.official && <p>{t.official.text} <a href={t.official.href} rel="noopener">{t.official.label}</a>.</p>}
        {t?.links && t.links.length > 0 && <p>Passend dazu: {t.links.map((l, i) => <span key={l.href}>{i > 0 && ' · '}<a href={l.href}>{l.label}</a></span>)}</p>}
        {t?.facts && t.facts.length > 0 && (
          <>
            <h2 className="rsb-h2">Daten und Grenzen</h2>
            <dl className="rsb-facts">
              {t.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.text}</dd></div>)}
            </dl>
          </>
        )}
        {t?.faq && t.faq.length > 0 && (
          <>
            <h2 className="rsb-h2">Häufige Fragen</h2>
            <dl className="rsb-faq">
              {t.faq.map((x) => <div key={x.q}><dt>{x.q}</dt><dd>{x.a}</dd></div>)}
            </dl>
          </>
        )}
        {/* Phase SS: a page with its own list (the neighbour spots) shows it instead of all siblings. */}
        {t?.related && t.related.items.length > 0 ? (
          <>
            <h2 className="rsb-h2">{t.related.heading}</h2>
            <ul className="rsb-list">
              {t.related.items.map((x) => <li key={x.href}><Link to={x.href}>{x.label}</Link></li>)}
            </ul>
          </>
        ) : siblings.length > 0 && (
          <>
            <h2 className="rsb-h2">{def.id === 'autobahnwetter' ? (sub ? 'Autobahnwetter für weitere Autobahnen' : 'Autobahnwetter je Autobahn') : def.id === 'seewetter' ? 'Spots' : sub ? 'Weitere Ansichten' : 'Ansichten'}</h2>
            <ul className="rsb-list">
              {siblings.map((x) => <li key={x.path}><Link to={x.path}>{x.sub.label ?? x.sub.title}</Link></li>)}
            </ul>
          </>
        )}
        <h2 className="rsb-h2">Mehr auf buscosun</h2>
        <p className="rsb-links">
          {sub && <><Link to={def.path}>{def.meta.title}</Link> · </>}
          <a href="/wetter/">Wetter nach Ort</a> · <a href="/wissen/">Wetterwissen</a> · <a href="/funktionen/">Alle Funktionen</a> · <a href="/wetterlage/">Wetterlagen</a> · <a href="/methodik/">Methodik</a> · <a href="/glossar/">Glossar</a> · <a href="/fuer/">Für wen</a> · <a href="/lizenzen/">Quellen &amp; Lizenzen</a> · <a href="/ueber/">Über buscosun</a>
        </p>
        <p className="rsb-foot">Amtliche Quellen (DWD · GeoSphere Austria · MeteoSchweiz), höhenkorrigiert, ohne Konto, ohne Tracker. buscosun gibt keine amtlichen Warnungen heraus.</p>
      </div>
    </details>
  );
}
