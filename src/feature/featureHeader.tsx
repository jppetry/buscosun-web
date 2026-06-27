/**
 * Gemeinsamer Kopfbereich für alle Feature-Seiten: buscosun-Logo oben links
 * und ein Pfeil-Button „Zurück zur Startseite". Wird sowohl von der
 * Platzhalter-Seite (FeaturePage) als auch von echten Feature-Seiten
 * (z. B. RoutePage) verwendet.
 */

import './featureHeader.css';

export function Logo() {
  return <img src="/buscosun-mark.svg" width="28" height="28" alt="" aria-hidden="true" />;
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
