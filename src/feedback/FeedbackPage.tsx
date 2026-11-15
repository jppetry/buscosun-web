/**
 * Feedback · „Ideen & Vorschläge" — Seite.
 *
 * Nur die Kontaktadresse und ein paar freundliche Worte (Jan 15.11.2026): kein Formular, kein Backend,
 * keine Tracker, keine Speicherung. Hintergrund wie die Startseite (DACH-Karte auf Sand).
 *
 * Die Zieladresse wird zur Laufzeit zusammengesetzt (statt als Literal im Markup),
 * um simples Bot-Grabbing etwas zu erschweren — bewusst nur eine kleine Hürde.
 */

import { lazy, Suspense } from 'react';
import '../route/tourTheme.css';
import './feedback.css';

// The same DACH map background as the start page (decorative, loads after the page).
const DachMapBackground = lazy(() => import('../DachMapBackground'));

interface Props { onBack: () => void }

/** Zur Laufzeit zusammengesetzt (leichte Anti-Grabbing-Hürde). */
function contactAddress(): string {
  return ['contact', 'buscosun.com'].join('@');
}

export default function FeedbackPage({ onBack }: Props) {
  const address = contactAddress();
  return (
    <div className="rt-page fb-page">
      <Suspense fallback={null}><DachMapBackground /></Suspense>
      <nav className="rt-nav">
        <a className="rt-nav-logo" href="#" onClick={(ev) => { ev.preventDefault(); onBack(); }}>
          <span className="rt-nav-logo-mark" /><span className="rt-nav-logo-name">buscosun</span>
        </a>
        <div className="rt-nav-right">
          <span className="rt-nav-live">Feedback</span>
          <button type="button" className="rt-nav-item" onClick={onBack}>Zurück</button>
        </div>
      </nav>

      <main className="rt-container">
        <section className="fb-card">
          <span className="rt-eyebrow">Feedback</span>
          <h1>Ideen &amp; Vorschläge</h1>
          <p>
            Schön, dass du hier bist. Über Ideen, Vorschläge und Hinweise, was wir an buscosun besser machen können,
            freuen wir uns sehr. Schreib uns einfach, jede Nachricht wird gelesen.
          </p>
          <a className="fb-mail" href={`mailto:${address}`}>{address}</a>
        </section>
      </main>
    </div>
  );
}
