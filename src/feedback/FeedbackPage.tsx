/**
 * Feedback · „Ideen & Vorschläge" — Seite.
 *
 * Kleine, kontolose Feedback-Seite im bestehenden v1.8-Design (rt-page-Shell wie
 * die übrigen Feature-Seiten). Versand per mailto: an contact@buscosun.com mit
 * vorausgefülltem Betreff/Body — kein Backend, keine Tracker, keine Speicherung.
 *
 * Die Zieladresse wird zur Laufzeit zusammengesetzt (statt als Literal im Markup),
 * um simples Bot-Grabbing etwas zu erschweren — bewusst nur eine kleine Hürde.
 */

import { useState, type FormEvent } from 'react';
import '../route/tourTheme.css';
import './feedback.css';

interface Props { onBack: () => void }

type Category = 'idea' | 'bug' | 'other';
const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: 'idea', label: 'Idee / Vorschlag' },
  { id: 'bug', label: 'Fehler / Bug' },
  { id: 'other', label: 'Sonstiges' },
];
const MAX_LEN = 4000;

/** Zur Laufzeit zusammengesetzt (leichte Anti-Grabbing-Hürde). */
function contactAddress(): string {
  return ['contact', 'buscosun.com'].join('@');
}

function buildMailto(category: Category, message: string, email: string): string {
  const catLabel = CATEGORIES.find((c) => c.id === category)?.label ?? 'Feedback';
  const subject = `buscosun — ${catLabel}`;
  const body = email.trim()
    ? `${message}\n\n— Antwort bitte an: ${email.trim()}`
    : message;
  return `mailto:${contactAddress()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export default function FeedbackPage({ onBack }: Props) {
  const [category, setCategory] = useState<Category>('idea');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sentHref, setSentHref] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const msg = message.trim();
    if (!msg) { setError('Bitte schreib uns kurz deine Nachricht.'); return; }
    if (msg.length > MAX_LEN) { setError(`Bitte kürze die Nachricht auf maximal ${MAX_LEN} Zeichen.`); return; }
    if (email.trim() && !isValidEmail(email.trim())) { setError('Die E-Mail-Adresse sieht nicht gültig aus.'); return; }
    setError(null);
    const href = buildMailto(category, msg, email);
    setSentHref(href);
    window.location.href = href; // öffnet das Mailprogramm des Besuchers
  }

  async function copyAddress() {
    try { await navigator.clipboard.writeText(contactAddress()); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  }

  return (
    <div className="rt-page fb-page">
      <div className="rt-grain" />
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
        <header className="rt-intro">
          <span className="rt-eyebrow">Feedback</span>
          <h1>Ideen &amp; Vorschläge</h1>
          <p>Was sollen wir verbessern, was fehlt dir? Schick uns deine Anregung — direkt per E-Mail, ohne Konto. Wir speichern nichts und nutzen keine Tracker.</p>
        </header>

        <section className="rt-section">
          {!sentHref ? (
            <form className="rt-card fb-form" onSubmit={onSubmit} noValidate>
              <label className="fb-field">
                <span className="fb-label">Kategorie</span>
                <select className="fb-input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>

              <label className="fb-field">
                <span className="fb-label">Deine Nachricht <em className="fb-req">*</em></span>
                <textarea
                  className="fb-input fb-textarea" value={message} onChange={(e) => setMessage(e.target.value)}
                  rows={6} maxLength={MAX_LEN} required aria-required="true"
                  placeholder="Deine Idee, dein Vorschlag oder was nicht funktioniert …"
                />
                <span className="fb-count">{message.length}/{MAX_LEN}</span>
              </label>

              <label className="fb-field">
                <span className="fb-label">E-Mail <span className="fb-opt">(optional, für Rückfragen)</span></span>
                <input
                  className="fb-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  inputMode="email" autoComplete="email" placeholder="du@example.com"
                />
              </label>

              {error && <p className="fb-error" role="alert">⚠ {error}</p>}

              <button type="submit" className="fb-send">Per E-Mail senden</button>
              <p className="fb-note">Öffnet dein Mailprogramm mit vorausgefülltem Text. Nichts wird auf einem Server gespeichert.</p>
            </form>
          ) : (
            <div className="rt-card fb-sent" role="status">
              <p className="fb-sent-head">✓ Dein Mailprogramm sollte sich geöffnet haben.</p>
              <p>Falls nicht, öffne die E-Mail manuell oder kopiere unsere Adresse:</p>
              <div className="fb-sent-actions">
                <a className="fb-send" href={sentHref}>E-Mail jetzt öffnen</a>
                <button type="button" className="fb-copy" onClick={copyAddress}>{copied ? '✓ Adresse kopiert' : contactAddress()}</button>
              </div>
              <button type="button" className="fb-again" onClick={() => { setSentHref(null); setMessage(''); setEmail(''); }}>Neue Nachricht schreiben</button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
