/**
 * Brandradar-Icon-Set — die SVG-Pfade der Vorlage `references/brandradar.dc.html`
 * (24×24 viewBox, currentColor). Eine EIGENE Datei statt einer Erweiterung des
 * LayerIcon-Switch der Wetterkarte: die Waldbrand-Layer sind keine `LayerKey`s,
 * und die Wetterkarte bleibt unangetastet.
 *
 * Die Layer-Glyphen tragen die Farbe ihres Layers über `currentColor` — die
 * Zeile setzt sie (`--br-acc`), nicht das Icon.
 */

import type { FireLayerId } from './fireModel';

interface Props {
  layer: FireLayerId;
  size?: number;
}

export function FireIcon({ layer, size = 15 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': true,
    style: { flex: '0 0 auto' } as const,
  };
  const s = { stroke: 'currentColor' } as const;
  switch (layer) {
    case 'fireDanger':
      return (
        <svg {...common}>
          <path d="M12 3 L21.5 20 H2.5 Z" {...s} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12 9.5 V14" {...s} strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="12" cy="17" r="1" fill="currentColor" />
        </svg>
      );
    case 'fireHotspots':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.4" fill="currentColor" />
          <circle cx="12" cy="12" r="7.6" {...s} strokeWidth="1.4" strokeOpacity=".55" />
          <circle cx="12" cy="12" r="11" {...s} strokeWidth="1.2" strokeOpacity=".28" />
        </svg>
      );
    case 'fireFootprints':
      return (
        <svg {...common}>
          <path d="M4 15 L8 7 L13 12 L17 6 L20 15 Z" {...s} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case 'fireWeather':
      return (
        <svg {...common}>
          <path d="M7 14 A4.4 4.4 0 0 1 8 6 A5.6 5.6 0 0 1 18.4 8.6 A3.6 3.6 0 0 1 17.6 15 H8 Z" {...s} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M9.5 18.5 H16.5" {...s} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'fireWind':
      return (
        <svg {...common}>
          <path d="M3 9 H14 A2.5 2.5 0 1 0 11.5 6.5 M3 14 H18 A2.5 2.5 0 1 1 15.5 16.5" {...s} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'fireSoilDryness':
      return (
        <svg {...common}>
          <path d="M4 17 H20 M4 20.5 H20" {...s} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M12 3 C12 3 7.5 8.5 7.5 12 A4.5 4.5 0 0 0 16.5 12 C16.5 8.5 12 3 12 3 Z" {...s} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case 'fireSpread':
      return (
        <svg {...common}>
          <path d="M4 18 L17 7" {...s} strokeWidth="1.7" strokeLinecap="round" />
          <path d="M11 6 H18 V13" {...s} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 18 L9 20 M4 18 L2.5 13" {...s} strokeWidth="1.3" strokeLinecap="round" strokeOpacity=".6" />
        </svg>
      );
    case 'fireFuel':
      return (
        <svg {...common}>
          <path d="M12 21 V13 M12 13 C12 9 9 7 6 6 C6 10 8.6 12.4 12 13 Z M12 13 C12 9 15 7 18 6 C18 10 15.4 12.4 12 13 Z" {...s} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case 'fireBurnt':
      return (
        <svg {...common}>
          <path d="M4 16 Q8 11 12 14 Q16 17 20 9" {...s} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M4 20 H20" {...s} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case 'fireContext':
      return (
        <svg {...common}>
          <path d="M12 3 L20 7 V13 C20 17.5 16.4 20.4 12 21.5 C7.6 20.4 4 17.5 4 13 V7 Z" {...s} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case 'fireDrought':
    case 'fireVegetation':
      // Blockierte EDO-Quellen — das Schloss der Vorlage.
      return (
        <svg {...common}>
          <rect x="5" y="10" width="14" height="10" rx="2" {...s} strokeWidth="1.4" />
          <path d="M8.5 10 V7.5 A3.5 3.5 0 0 1 15.5 7.5 V10" {...s} strokeWidth="1.4" />
        </svg>
      );
    default:
      return null;
  }
}

interface IcoProps { size?: number }

/** Play-Glyphe des Zeit-Decks (Vorlage). */
export function IcoFirePlay({ size = 15 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 5 L19 12 L7 19 Z" />
    </svg>
  );
}

/** Pause-Glyphe des Zeit-Decks. */
export function IcoFirePause({ size = 15 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8.5 5.5 V18.5 M15.5 5.5 V18.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/** Mobile Bottom-Bar: Karte (Ebenen). */
export function IcoBarMap({ size = 20 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 L21 8 L12 13 L3 8 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3 13 L12 18 L21 13" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** Mobile Bottom-Bar: Layer (zwei Zeilen mit Schaltpunkt). */
export function IcoBarLayers({ size = 20 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="11" width="18" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="6.5" r="1.3" fill="currentColor" />
      <circle cx="16" cy="13.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

/** Mobile Bottom-Bar / Rail: Brände (Flamme). */
export function IcoBarFire({ size = 20 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21 C8 21 5.5 18.2 5.5 15 C5.5 11.4 8.6 9.6 9.2 6 C11.4 8.4 11 10.4 11.4 11.6 C12 8.8 13.6 7.2 13 3 C16.6 5.6 18.5 10 18.5 15 C18.5 18.2 16 21 12 21 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Mobile Bottom-Bar: Zeit (Uhr). */
export function IcoBarTime({ size = 20 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8 V12 L15 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
