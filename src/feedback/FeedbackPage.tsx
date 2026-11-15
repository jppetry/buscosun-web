/**
 * Feedback · „Ideen & Vorschläge" — Seite.
 *
 * Nur die Kontaktadresse und ein paar freundliche Worte (Jan 15.11.2026): kein Formular, kein Backend,
 * keine Tracker, keine Speicherung. Hintergrund wie die Startseite (DACH-Karte auf Sand).
 *
 * Die Zieladresse wird zur Laufzeit zusammengesetzt (statt als Literal im Markup),
 * um simples Bot-Grabbing etwas zu erschweren — bewusst nur eine kleine Hürde.
 */

import { lazy, Suspense, useState } from 'react';
import '../route/tourTheme.css';
// Look of the share button of the other pages (`.sh-btn`); the button itself is local, see `FeedbackShare`.
import '../share/share.css';
import './feedback.css';

// The same DACH map background as the start page (decorative, loads after the page).
const DachMapBackground = lazy(() => import('../DachMapBackground'));

interface Props { onBack: () => void }

/** Zur Laufzeit zusammengesetzt (leichte Anti-Grabbing-Hürde). */
function contactAddress(): string {
  return ['contact', 'buscosun.com'].join('@');
}

/**
 * Share button of the mobile head. `/feedback` is not a route of the share system (`SHARE_ROUTES`), where the shared
 * `ShareButton` would stay silent; this page has no state to share, so the plain page link is enough: the native share
 * sheet where the device has one, otherwise the link goes to the clipboard.
 */
function FeedbackShare() {
  const [copied, setCopied] = useState(false);
  const onShare = async () => {
    const url = `${window.location.origin}/feedback`;
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title: 'buscosun · Ideen & Vorschläge', url }); return; }
      catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return; /* otherwise: copy below */ }
    }
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* no clipboard */ }
  };
  const label = copied ? 'Link kopiert' : 'Diese Seite teilen';
  return (
    <button type="button" className="sh-btn sh-btn--compact fb-m-share" aria-label={label} title={label} onClick={() => { void onShare(); }}>
      <svg width={15} height={15} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {copied ? <path d="M4 10.5 L8.2 14.5 L16 6" /> : (
          <>
            <circle cx="15" cy="4.5" r="2.2" /><circle cx="5" cy="10" r="2.2" /><circle cx="15" cy="15.5" r="2.2" />
            <line x1="6.95" y1="8.95" x2="13.05" y2="5.55" /><line x1="6.95" y1="11.05" x2="13.05" y2="14.45" />
          </>
        )}
      </svg>
      <span className="fb-sr" role="status">{copied ? 'Link kopiert' : ''}</span>
    </button>
  );
}

export default function FeedbackPage({ onBack }: Props) {
  const address = contactAddress();
  return (
    <div className="rt-page fb-page">
      <Suspense fallback={null}><DachMapBackground /></Suspense>
      {/* Mobile head as on the other pages: buscosun mark left (to the start page), share right. Desktop keeps the nav below. */}
      <header className="fb-m-head">
        <button type="button" className="fb-m-brandbtn" aria-label="Zur Startseite" onClick={onBack}>
          <img src="/buscosun-mark.svg" width={22} height={22} alt="" />
        </button>
        <FeedbackShare />
      </header>
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
