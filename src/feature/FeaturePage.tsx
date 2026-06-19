/**
 * Generische Feature-Seite (Platzhalter).
 *
 * Für Features, die noch keine eigene Seite haben: gemeinsamer Header
 * (Logo + „Zurück zur Startseite") plus der Feature-Titel als Platzhalter.
 */

import { FeatureTopbar } from './featureHeader';
import './FeaturePage.css';

interface Props {
  eyebrow: string;
  title: string;
  onBack: () => void;
}

export default function FeaturePage({ eyebrow, title, onBack }: Props) {
  return (
    <div className="feature-page">
      <FeatureTopbar onBack={onBack} />
      <main className="feature-page-body">
        <span className="feature-page-eyebrow">{eyebrow}</span>
        <h1 className="feature-page-title">{title}</h1>
        <p className="feature-page-note">Diese Funktion wird vorbereitet.</p>
      </main>
    </div>
  );
}
