/**
 * Waldbrand-Icon-Set (Phase WBU1) — handgezeichnete SVGs im Zeichenstil von
 * `components/LayerIcon.tsx`: 14×14 viewBox, strokeWidth 1.4, rounded caps,
 * currentColor. Bewusst eine EIGENE Datei statt einer Erweiterung des
 * LayerIcon-Switch: die Waldbrand-Layer sind keine `LayerKey`s, und die
 * Wetterkarte bleibt unangetastet (Kickoff-Auflage).
 *
 * Zusätzlich die Play-/Pause-Glyphen des Zeit-Decks — Werte-Kopien aus
 * `map/deckIcons.tsx` (IcoPlay/IcoPause), damit das Feuer-Deck keinen
 * Import aus dem Karten-Deck braucht.
 */

import type { FireLayerId } from './fireModel';

interface Props {
  layer: FireLayerId;
  size?: number;
}

export function FireIcon({ layer, size = 14 }: Props) {
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
    case 'fireDanger':
      // EU-Gefahrenindex — Flammen-Kontur über einer Skalenlinie (Modellwert).
      return (
        <svg {...common}>
          <path d="M 7 1.6 C 8.4 3.4, 10.2 4.8, 10.2 7.6 A 3.2 3.2 0 0 1 3.8 7.6 C 3.8 5.9, 4.8 4.9, 5.3 3.8 C 5.9 4.6, 6.4 5, 6.5 5.9 C 7.3 4.9, 7.3 3.2, 7 1.6 Z" />
          <line x1="2" y1="12.4" x2="12" y2="12.4" />
          <line x1="5.3" y1="12.4" x2="5.3" y2="11.4" opacity="0.55" />
          <line x1="8.7" y1="12.4" x2="8.7" y2="11.4" opacity="0.55" />
        </svg>
      );
    case 'fireHotspots':
      // Aktive Brände — Thermalpunkt mit Detektions-Ringen (Satellit).
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none" />
          <path d="M 3.9 4.2 A 4.2 4.2 0 0 0 3.9 9.8" opacity="0.75" />
          <path d="M 10.1 4.2 A 4.2 4.2 0 0 1 10.1 9.8" opacity="0.75" />
          <path d="M 2 2.4 A 6.4 6.4 0 0 0 2 11.6" opacity="0.4" />
          <path d="M 12 2.4 A 6.4 6.4 0 0 1 12 11.6" opacity="0.4" />
        </svg>
      );
    case 'fireWeather':
      // Feuerwetter-Treiber — durchgestrichener Tropfen: die TROCKENHEIT der Luft.
      return (
        <svg {...common}>
          <path d="M 7 1.8 C 5.2 4.9, 3.9 6.4, 3.9 8.3 A 3.1 3.1 0 0 0 10.1 8.3 C 10.1 6.4, 8.8 4.9, 7 1.8 Z" />
          <line x1="2.4" y1="11.9" x2="11.6" y2="2.7" />
        </svg>
      );
    case 'fireDrought':
      // Trockenheit — Boden mit Trockenrissen.
      return (
        <svg {...common}>
          <path d="M 1.8 9.4 Q 4 8.4 7 9 T 12.2 9.2" />
          <path d="M 5 9 L 4.2 11.6" opacity="0.8" />
          <path d="M 7.4 9.1 L 7.9 12" opacity="0.8" />
          <path d="M 9.8 9.2 L 9.1 11.3" opacity="0.8" />
        </svg>
      );
    case 'fireVegetation':
      // Vegetationsstress — Blatt mit Mittelrippe.
      return (
        <svg {...common}>
          <path d="M 3 11 C 3 5.5, 6.5 2.6, 11.2 2.4 C 11.4 7.2, 8.6 11, 3 11 Z" />
          <path d="M 3.6 10.4 C 5.6 8.2, 7.6 6.4, 10 4.4" opacity="0.7" />
        </svg>
      );
    case 'fireFuel':
      // Brennmaterial — Nadelbaum über dem Boden (Vegetationskomplexe).
      return (
        <svg {...common}>
          <path d="M 7 1.8 L 9.6 5.4 L 8.2 5.4 L 10.4 8.6 L 3.6 8.6 L 5.8 5.4 L 4.4 5.4 Z" />
          <line x1="7" y1="8.6" x2="7" y2="11" />
          <line x1="2.2" y1="12.2" x2="11.8" y2="12.2" opacity="0.6" />
        </svg>
      );
    case 'fireBurnt':
      // Frühere Brandflächen — gestrichelter Flächenumriss mit Restglut-Punkt.
      return (
        <svg {...common}>
          <path d="M 2.6 5.2 Q 2.2 2.8 4.6 2.8 Q 6.6 1.8 8.4 3 Q 11.4 2.8 11.4 5.4 Q 12.2 8 9.8 8.8 Q 8 10.2 5.8 9.4 Q 2.8 9.6 2.6 7.2 Z" strokeDasharray="2.2 1.6" />
          <circle cx="7" cy="6" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'fireContext':
      // Schutzgebiete & Landbedeckung — Gebietsgrenze mit Blatt-Marke.
      return (
        <svg {...common}>
          <path d="M 2.4 3.6 L 6 2.2 L 9.4 3.4 L 11.6 2.6 V 10.4 L 8 11.8 L 4.6 10.6 L 2.4 11.4 Z" />
          <path d="M 5.6 8.6 C 5.6 6.4, 7 5.2, 8.9 5.1 C 9 7.1, 7.9 8.6, 5.6 8.6 Z" strokeWidth="1.1" />
        </svg>
      );
    case 'fireWind':
      // Wind — drei ausschwingende Strömungslinien. WERTE-KOPIE der `wind`-
      // Glyphe aus `components/LayerIcon.tsx:31-33`: derselbe Layer, dieselbe
      // Zeichnung. Kopie statt Import, weil das Feuer-Deck kein Icon-Set der
      // Wetterkarte lädt (Muster dieser Datei, s. Kopfkommentar).
      return (
        <svg {...common}>
          <path d="M 1 4 Q 4 3, 7 4 T 12.5 4" />
          <path d="M 1 7 Q 4 6, 7 7 T 13 7" />
          <path d="M 1 10 Q 3.5 9, 6 10 T 10.5 10" />
        </svg>
      );
    case 'fireSoilDryness':
      // Bodentrockenheit — Bodenschichten im Profil mit einem versickernden
      // Tropfen: es geht um Wasser IM Boden, nicht um Regen darauf. Bewusst
      // anders als `fireDrought` (Trockenrisse an der Oberfläche) und als
      // `fireWeather` (durchgestrichener Tropfen = Luft).
      return (
        <svg {...common}>
          <path d="M 1.8 5.2 H 12.2" />
          <path d="M 1.8 8.4 H 12.2" opacity="0.7" />
          <path d="M 1.8 11.4 H 12.2" opacity="0.45" />
          <path d="M 7 1.4 C 6.1 2.7, 5.4 3.4, 5.4 4.3 A 1.6 1.6 0 0 0 8.6 4.3 C 8.6 3.4, 7.9 2.7, 7 1.4 Z" />
        </svg>
      );
    case 'fireFootprints':
      // Brandflächen der Registry — ein Umriss je Brand mit Listenlinien
      // daneben: die Fläche UND ihr Eintrag im Panel. Bewusst nicht die
      // Glut des Kartierungs-Layers und nicht der Punkt der Hotspots.
      return (
        <svg {...common}>
          <path d="M 1.8 5 Q 1.6 2.6 4 2.8 Q 5.8 1.9 7 3.2 Q 8.6 2.4 8.6 4.6 Q 9.2 7.2 7.2 8 Q 5.6 9.4 3.8 8.4 Q 1.8 8.6 1.8 6.6 Z" />
          <path d="M 10.4 4 H 12.6 M 10.4 6.6 H 12.6 M 10.4 9.2 H 12.6" strokeWidth="1.2" />
        </svg>
      );
    case 'fireSpread':
      // SF1: Ausbreitungsrichtung — eine Flamme mit einem Pfeil, der aus ihr
      // herausläuft, und einem angedeuteten Fächer: eine Richtung je Brand,
      // keine Fläche und keine Stufe.
      return (
        <svg {...common}>
          <path d="M 3.6 10.4 C 2.7 9.2, 2.3 8.1, 2.3 7.1 A 1.9 1.9 0 0 1 5.9 7.1 C 5.9 8.1, 5.5 9.2, 4.6 10.4 Z" strokeWidth="1.2" />
          <path d="M 6.6 7.4 H 12.2" />
          <path d="M 10.2 5.2 L 12.6 7.4 L 10.2 9.6" />
          <path d="M 7 4.4 L 12.2 2.8 M 7 10.4 L 12.2 12" opacity="0.4" strokeWidth="1.1" />
        </svg>
      );
    default:
      return null;
  }
}

interface IcoProps { size?: number }

/** Play-Glyphe des Zeit-Decks — Werte-Kopie aus `map/deckIcons.tsx:128`. */
export function IcoFirePlay({ size = 16 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 5.5 L18.5 12 L8 18.5 Z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/** Pause-Glyphe des Zeit-Decks — Werte-Kopie aus `map/deckIcons.tsx:136`. */
export function IcoFirePause({ size = 16 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8.5 5.5 V18.5 M15.5 5.5 V18.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
