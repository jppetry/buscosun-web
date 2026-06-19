/**
 * Gemeinsamer Kopfbereich für alle Feature-Seiten: buscosun-Logo oben links
 * und ein Pfeil-Button „Zurück zur Startseite". Wird sowohl von der
 * Platzhalter-Seite (FeaturePage) als auch von echten Feature-Seiten
 * (z. B. RoutePage) verwendet.
 */

import './featureHeader.css';

export function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="7" fill="#2C2A26" />
      <g stroke="#2C2A26" strokeWidth="1.5" strokeLinecap="round">
        <line x1="16" y1="0" x2="16" y2="4" />
        <line x1="16" y1="28" x2="16" y2="32" />
        <line x1="0" y1="16" x2="4" y2="16" />
        <line x1="28" y1="16" x2="32" y2="16" />
        <line x1="4" y1="4" x2="7" y2="7" />
        <line x1="25" y1="25" x2="28" y2="28" />
        <line x1="4" y1="28" x2="7" y2="25" />
        <line x1="25" y1="7" x2="28" y2="4" />
      </g>
    </svg>
  );
}

export function FeatureTopbar({ onBack }: { onBack: () => void }) {
  return (
    <header className="feature-page-topbar">
      <a className="feature-page-logo" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>
        <Logo />
        <span className="feature-page-logo-name">buscosun</span>
      </a>
      <button type="button" className="feature-page-home" onClick={onBack}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="13" y1="8" x2="3" y2="8" /><polyline points="7,4 3,8 7,12" />
        </svg>
        Zurück zur Startseite
      </button>
    </header>
  );
}
