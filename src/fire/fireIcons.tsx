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
    case 'fireSoilDryness':
      return (
        <svg {...common}>
          <path d="M4 17 H20 M4 20.5 H20" {...s} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M12 3 C12 3 7.5 8.5 7.5 12 A4.5 4.5 0 0 0 16.5 12 C16.5 8.5 12 3 12 3 Z" {...s} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case 'fireAnomalies':
      // TA5: Raute (Standort) mit Kamin — keine Flamme, keine Welle.
      return (
        <svg {...common}>
          <path d="M12 4 L20 12 L12 20 L4 12 Z" {...s} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M10.5 14.5 V9.5 H13.5 V14.5" {...s} strokeWidth="1.4" strokeLinejoin="round" />
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

/** Mobile Bottom-Bar: Einstellungen (drei Regler). */
export function IcoBarSettings({ size = 20 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="6" r="2.4" fill="var(--cream-50, #FAF6EA)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15.5" cy="12" r="2.4" fill="var(--cream-50, #FAF6EA)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="18" r="2.4" fill="var(--cream-50, #FAF6EA)" stroke="currentColor" strokeWidth="1.5" />
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

/**
 * Flamme für die Brand-Kacheln im Readout (Jans Auftrag 2026-10-14): Kontur mit leiser
 * Füllung und einem vollen Kern — `currentColor`, die Kachel setzt die Statusfarbe.
 */
export function FlameIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: '0 0 auto' }}>
      <path
        d="M12 2.6c.5 3 2.3 4.7 3.9 6.5 1.6 1.8 2.6 3.5 2.6 5.7a6.5 6.5 0 0 1-13 0c0-2.1.9-3.8 2.2-5.1.3 1.2 1 2 2 2.4C9.1 8.8 10.5 5.5 12 2.6Z"
        fill="currentColor" fillOpacity=".14" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
      <path
        d="M12 21a3 3 0 0 0 3-3c0-1.6-1.2-2.5-2.1-3.7-.5 1-1 1.4-1.7 1.8-.9.5-2.2 1-2.2 2.4A3 3 0 0 0 12 21Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Industrieanlage (Sheddach + Schornstein) für Thermalanomalien — Standorte, keine Brände. */
export function IndustryIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: '0 0 auto' }}>
      <path
        d="M3 20.5V11.8l5.5 3.2v-3.2l5.5 3.2V4.5h4.5v16H3Z"
        fill="currentColor" fillOpacity=".14" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
      <path d="M7 18h.01M11 18h.01M15.2 18h.01M16.2 8h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
