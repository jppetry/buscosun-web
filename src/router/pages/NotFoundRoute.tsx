/**
 * 404 im Command-Deck (hell, Sand/Ink). Client-seitig für Navigationen innerhalb
 * der App und unbekannte Sub-Routen bekannter Pfade (`/wetterkarte/xyz`); echte
 * Server-404 liefert weiterhin `dist/404.html` (netlify.toml, V-101).
 */
import { Link } from 'react-router';
import { ROUTES } from '../routes';
import './notFound.css';

export default function NotFoundRoute() {
  const tools = ROUTES.filter((r) => r.id !== 'home' && !r.meta.noindex);
  return (
    <main className="nf-root">
      <div className="nf-card">
        <p className="nf-eyebrow">404 · Seite nicht gefunden</p>
        <h1 className="nf-title">Diese Seite gibt es nicht.</h1>
        <p className="nf-lead">
          Vielleicht ist der Link alt oder vertippt. Die Werkzeuge von buscosun findest du hier — oder du suchst direkt das Wetter für einen Ort.
        </p>
        <div className="nf-ctas">
          <Link className="nf-cta nf-cta-primary" to="/">Zur Startseite</Link>
          <a className="nf-cta" href="/wetter/">Wetter nach Ort</a>
        </div>
        <ul className="nf-tools" aria-label="Werkzeuge">
          {tools.map((r) => (
            <li key={r.id}><Link to={r.path}>{r.meta.title}</Link></li>
          ))}
        </ul>
      </div>
    </main>
  );
}
