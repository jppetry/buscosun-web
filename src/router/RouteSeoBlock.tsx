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
import { canonicalPath, indexableSubRoutes, routeForPath } from './routes';
import type { SeoText } from '../seo/layerSeoTexts';
import './routeSeoBlock.css';

export default function RouteSeoBlock() {
  const { pathname } = useLocation();
  const match = routeForPath(pathname);
  const path = canonicalPath(pathname);
  const wantsText = !!match?.sub && !match.sub.noindex;
  const [text, setText] = useState<{ path: string; text: SeoText | null } | null>(null);
  const [ownH1, setOwnH1] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!wantsText) { setText(null); return; }
    import('../seo/subRouteTexts').then((mod) => { if (alive) setText({ path, text: mod.subRouteText(path) }); }).catch(() => { if (alive) setText({ path, text: null }); });
    return () => { alive = false; };
  }, [path, wantsText]);

  // Genau eine H1 je Seite: nur setzen, wenn außerhalb dieses Blocks keine steht.
  useEffect(() => {
    const others = [...document.querySelectorAll('h1')].filter((h) => !h.closest('.rsb'));
    setOwnH1(others.length === 0);
  }, [path]);

  if (!match || match.def.id === 'home' || match.def.meta.noindex || match.sub?.noindex) return null;
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
        {t?.facts && t.facts.length > 0 && (
          <>
            <h2 className="rsb-h2">Daten und Grenzen</h2>
            <dl className="rsb-facts">
              {t.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.text}</dd></div>)}
            </dl>
          </>
        )}
        {siblings.length > 0 && (
          <>
            <h2 className="rsb-h2">{sub ? 'Weitere Ansichten' : 'Ansichten'}</h2>
            <ul className="rsb-list">
              {siblings.map((x) => <li key={x.path}><Link to={x.path}>{x.sub.title}</Link></li>)}
            </ul>
          </>
        )}
        <h2 className="rsb-h2">Mehr auf buscosun</h2>
        <p className="rsb-links">
          {sub && <><Link to={def.path}>{def.meta.title}</Link> · </>}
          <a href="/wetter/">Wetter nach Ort</a> · <a href="/wissen/">Wetterwissen</a> · <a href="/funktionen/">Alle Funktionen</a> · <a href="/wetterlage/">Wetterlagen</a> · <a href="/methodik/">Methodik</a> · <a href="/lizenzen/">Quellen &amp; Lizenzen</a> · <a href="/ueber/">Über buscosun</a>
        </p>
        <p className="rsb-foot">Amtliche Quellen (DWD · GeoSphere Austria · MeteoSchweiz), höhenkorrigiert, ohne Konto, ohne Tracker. buscosun gibt keine amtlichen Warnungen heraus.</p>
      </div>
    </details>
  );
}
