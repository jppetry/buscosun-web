/**
 * Layer-Icon-Set — handgezeichnete SVGs für die Layer-Switch im MapView.
 * Stil: 14×14 viewBox, strokeWidth 1.4, rounded caps, currentColor — passt
 * sich an die Button-Farbe an (stone-600 inaktiv → #fff aktiv).
 */

import type { LayerKey } from '../MapView';

interface Props {
  layer: LayerKey;
  size?: number;
}

export function LayerIcon({ layer, size = 14 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 14 14',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (layer) {
    case 'wind':
      // Drei wind-streamlines, von links nach rechts ausschwingend
      return (
        <svg {...common}>
          <path d="M 1 4 Q 4 3, 7 4 T 12.5 4" />
          <path d="M 1 7 Q 4 6, 7 7 T 13 7" />
          <path d="M 1 10 Q 3.5 9, 6 10 T 10.5 10" />
        </svg>
      );
    case 'nowcast':
      // Tropfen mit kleinen Uhrzeigern — Niederschlag über die nächste Zeit (0–2 h)
      return (
        <svg {...common}>
          <path d="M 7 1.6 C 5 5, 3.6 6.6, 3.6 8.6 A 3.4 3.4 0 0 0 10.4 8.6 C 10.4 6.6, 9 5, 7 1.6 Z" />
          <line x1="7" y1="8.6" x2="7" y2="6.9" strokeWidth="1.2" />
          <line x1="7" y1="8.6" x2="8.3" y2="9.1" strokeWidth="1.2" />
        </svg>
      );
    case 'temp':
      // Thermometer (Bulb unten, Säule oben, Skalen-Striche)
      return (
        <svg {...common}>
          <path d="M 7 1.5 V 8.2" />
          <circle cx="7" cy="10.2" r="1.6" />
          <line x1="7" y1="8.5" x2="7" y2="10.2" strokeWidth="2" />
          <line x1="8.4" y1="3.5" x2="9.2" y2="3.5" opacity="0.6" />
          <line x1="8.4" y1="5"   x2="9.2" y2="5"   opacity="0.6" />
          <line x1="8.4" y1="6.5" x2="9.2" y2="6.5" opacity="0.6" />
        </svg>
      );
    case 'clouds':
      // Geschichtete Wolken (low+mid)
      return (
        <svg {...common}>
          <path d="M 3 5.5 Q 2 3, 4 2.5 Q 5 1, 7 2 Q 9 1, 10 3 Q 12.5 3.5, 11.5 5.5 Z" />
          <path d="M 2 9 Q 1.5 7.5, 3 7.5 Q 4 6.5, 5.5 7.2 Q 7 6.5, 8.5 7.5 Q 10 6.5, 11.5 7.5 Q 13 7.8, 12 9.2 Z" opacity="0.7" />
        </svg>
      );
    case 'sat':
      // Satelliten-Schüssel auf Orbit-Bogen
      return (
        <svg {...common}>
          <path d="M 1 10.5 Q 7 6, 13 10.5" />
          <circle cx="7" cy="6.8" r="1.6" fill="currentColor" stroke="none" />
          <path d="M 5 4.8 L 9 4.8" strokeWidth="1.2" />
          <line x1="7" y1="4.8" x2="7" y2="5.4" strokeWidth="1.2" />
          <line x1="7" y1="8" x2="7" y2="9.6" opacity="0.5" />
        </svg>
      );
    case 'lightning':
      // Zickzack-Blitz
      return (
        <svg {...common}>
          <path d="M 7.5 1 L 4 7 L 6.5 7 L 5 13 L 9.5 6 L 7 6 L 8.5 1 Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'lightningfc':
      // Blitz-Vorhersage — Blitz-Kontur (nicht gefüllt) mit vorwärtsweisenden
      // Prognose-Punkten: klar anders als der massive gefüllte Zickzack von
      // „lightning" (Messung). Kontur = Modell/Prognose, Punkte = Zukunft.
      return (
        <svg {...common}>
          <path d="M 8 1 L 4.5 7 L 7 7 L 5.5 13 L 10 6 L 7.5 6 L 9 1 Z" />
          <circle cx="11.4" cy="9.6" r="0.5" fill="currentColor" stroke="none" opacity="0.75" />
          <circle cx="12.4" cy="7.9" r="0.5" fill="currentColor" stroke="none" opacity="0.5" />
        </svg>
      );
    case 'snow':
      // Schnee (Menge) — Schneeflocke über einer Boden-/Decken-Linie: MENGE als
      // Fläche, klar anders als die reine Grenzlinie von „snowline".
      return (
        <svg {...common}>
          <g strokeWidth="1.2">
            <line x1="7" y1="1.4" x2="7" y2="8" />
            <line x1="3.9" y1="2.9" x2="10.1" y2="6.5" />
            <line x1="10.1" y1="2.9" x2="3.9" y2="6.5" />
            <line x1="5.2" y1="1.9" x2="7" y2="3" />
            <line x1="8.8" y1="1.9" x2="7" y2="3" />
          </g>
          <line x1="1.8" y1="11.6" x2="12.2" y2="11.6" strokeWidth="1.6" />
          <line x1="3" y1="9.6" x2="3" y2="11.6" opacity="0.55" />
          <line x1="11" y1="9.6" x2="11" y2="11.6" opacity="0.55" />
        </svg>
      );
    case 'stations':
      // Pin-Marker auf Karte
      return (
        <svg {...common}>
          <path d="M 7 1.6 C 4.5 1.6, 3 3.5, 3 5.6 C 3 8, 7 12, 7 12 C 7 12, 11 8, 11 5.6 C 11 3.5, 9.5 1.6, 7 1.6 Z" />
          <circle cx="7" cy="5.6" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'gust':
      // Windböen — Streamlines mit Gust-Wirbel am Ende (stärker als „Wind")
      return (
        <svg {...common}>
          <path d="M 1.5 4.6 Q 5 3.4 8.4 4.6" />
          <path d="M 1.5 9.2 Q 4.5 8.2 7.6 9.2" />
          <path d="M 8.2 4.6 C 11 4 11.6 6.7 9.4 7 C 8.2 7.15 8 5.8 8.9 5.6" />
        </svg>
      );
    case 'thunder':
      // Gewitterpotenzial — Wolke mit Blitz (Konvektions-Vorwarnung)
      return (
        <svg {...common}>
          <path d="M 3 7.6 Q 1.7 5.2 3.7 4.7 Q 4.7 3.1 6.7 3.8 Q 8.7 2.9 9.9 4.9 Q 12 5.3 11 7.4 Z" />
          <path d="M 7.1 7.3 L 5.4 10 L 6.9 10 L 5.9 12.6 L 8.7 9.2 L 7.1 9.2 L 8 7.3 Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'rotation':
      // Rotationspotenzial — rotierender Aufwind: eingerollte Spirale mit
      // Pfeilspitze (Rotation/Wirbel), klar anders als Wolke+Blitz von „thunder".
      return (
        <svg {...common}>
          <path d="M 9.8 4 A 3.4 3.4 0 1 0 10.9 7.2" />
          <polyline points="7.6,3.3 9.9,3.9 9.5,6.3" />
          <circle cx="7" cy="7" r="0.7" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'confidence':
      // Vertrauens-Schleier — schraffiertes Feld (je dichter, desto unsicherer)
      return (
        <svg {...common}>
          <rect x="2.2" y="2.2" width="9.6" height="9.6" rx="1.8" />
          <g strokeWidth="1">
            <line x1="4.6" y1="2.4" x2="2.4" y2="4.6" />
            <line x1="7.6" y1="2.4" x2="2.4" y2="7.6" />
            <line x1="10.6" y1="2.4" x2="2.4" y2="10.6" />
            <line x1="11.6" y1="4.6" x2="4.6" y2="11.6" />
            <line x1="11.6" y1="7.6" x2="7.6" y2="11.6" />
          </g>
        </svg>
      );
    case 'snowline':
      // Schneefallgrenze — Schneeflocke über einer Linie
      return (
        <svg {...common}>
          <g strokeWidth="1.2">
            <line x1="7" y1="1.6" x2="7" y2="7" />
            <line x1="4.4" y1="2.9" x2="9.6" y2="5.7" />
            <line x1="9.6" y1="2.9" x2="4.4" y2="5.7" />
          </g>
          <line x1="1.6" y1="11.2" x2="12.4" y2="11.2" />
        </svg>
      );
    case 'flownowcast':
      // Flow-Nowcast — Advektions-/Flusspfeile (Bewegung des Regens nach vorn)
      return (
        <svg {...common}>
          <path d="M 1.5 5 Q 6 3.4 10 5" />
          <polyline points="8.4,3.9 10.6,5 8.4,6.1" />
          <path d="M 1.5 9.3 Q 5 8.3 8.5 9.3" />
          <polyline points="7,8.3 9,9.3 7,10.3" />
        </svg>
      );
    case 'poprob':
      // Regenwahrscheinlichkeit — Tropfen mit Prozent-Zeichen
      return (
        <svg {...common}>
          <path d="M 7 1.6 C 5 5, 3.6 6.6, 3.6 8.6 A 3.4 3.4 0 0 0 10.4 8.6 C 10.4 6.6, 9 5, 7 1.6 Z" />
          <line x1="5.7" y1="9.4" x2="8.3" y2="6.6" strokeWidth="1.1" />
          <circle cx="5.85" cy="7" r="0.6" fill="currentColor" stroke="none" />
          <circle cx="8.15" cy="9" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}
