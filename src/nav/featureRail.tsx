/**
 * Gemeinsame Werkzeug-Rail aller Command-Decks.
 *
 * Eine einzige Quelle für Reihenfolge, Beschriftung und Icons der buscosun-
 * Werkzeuge — die Decks (Route, Event, Regenradar, Konfidenz) bringen nur ihre
 * eigenen CSS-Klassen mit, damit ihr jeweiliges Design unangetastet bleibt.
 */

import type { ReactNode } from 'react';

export type RailFeature =
  | 'map2d' | 'nowcast' | 'route' | 'event' | 'forecast' | 'history' | 'atmosphere' | 'globe'
  | 'fire' | 'feedback';

export function IconRailMap({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 L21 8 L12 13 L3 8 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3 13 L12 18 L21 13" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
export function IconRailRadar({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 3 A9 9 0 0 1 21 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}
export function IconRailTour({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 20 C6 20 5 13.5 9 11.5 C13 9.5 12 6.5 16 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="6" cy="20" r="1.8" fill="currentColor" />
      <path d="M16 2.5 C14 2.5 12.4 4.1 12.4 6.1 C12.4 8.8 16 11.5 16 11.5 C16 11.5 19.6 8.8 19.6 6.1 C19.6 4.1 18 2.5 16 2.5 Z" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="16" cy="6.1" r="1.3" fill="currentColor" />
    </svg>
  );
}
export function IconRailEvent({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 9.5 H20.5 M8 3.5 V6 M16 3.5 V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="14.5" r="1.6" fill="currentColor" />
    </svg>
  );
}
export function IconRailForecast({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 12 L12 6.5 M12 12 L16 14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
export function IconRailHistory({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19 V9 M9 19 V5 M14 19 V12 M19 19 V7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
export function IconRailSection({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 18 L9 11 L13 14.5 L21 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 21 H21" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
export function IconRailGlobe({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="12" cy="12" rx="3.6" ry="8.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 12 H20.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
export function IconRailFeedback({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5.5 H20 A1.5 1.5 0 0 1 21.5 7 V16 A1.5 1.5 0 0 1 20 17.5 H13 L8.5 21 V17.5 H4 A1.5 1.5 0 0 1 2.5 16 V7 A1.5 1.5 0 0 1 4 5.5 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
/** Waldbrand: Flamme über Nadelbaum — im Strichduktus der übrigen neun Icons. */
export function IconRailFire({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.5 C12 5.6 9.2 6.3 9.2 9.1 C9.2 10.7 10.5 12 12 12 C13.5 12 14.8 10.7 14.8 9.1 C14.8 7.9 14.1 7.2 13.6 6.4"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M12 14.2 L8.4 19 H15.6 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 19 V21.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
export function IconRailHome({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10.5 L12 4 L20 10.5 V19 A1 1 0 0 1 19 20 H5 A1 1 0 0 1 4 19 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.5 20 V14 H14.5 V20" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export const FEATURE_RAIL_ITEMS: Array<{ id: RailFeature; label: string; icon: ReactNode }> = [
  { id: 'map2d', label: 'Wetterkarte', icon: <IconRailMap /> },
  { id: 'nowcast', label: 'Regenradar', icon: <IconRailRadar /> },
  { id: 'route', label: 'Tourenplanung', icon: <IconRailTour /> },
  { id: 'event', label: 'Event-Planung', icon: <IconRailEvent /> },
  { id: 'forecast', label: 'Konfidenz & Modelle', icon: <IconRailForecast /> },
  { id: 'history', label: 'Historie · Klima seit 1940', icon: <IconRailHistory /> },
  { id: 'atmosphere', label: 'Vertikalschnitt · 3D-Wetter', icon: <IconRailSection /> },
  { id: 'globe', label: '3D-Globus', icon: <IconRailGlobe /> },
  { id: 'fire', label: 'Waldbrand DACH', icon: <IconRailFire /> },
  { id: 'feedback', label: 'Ideen & Vorschläge', icon: <IconRailFeedback /> },
];

interface FeatureRailProps {
  /** Werkzeug, auf dem man gerade steht — wird als aktiv markiert, kein Klick. */
  active: RailFeature;
  /** Direkt in ein anderes Werkzeug springen. Fehlt der Handler, greift onHome. */
  onOpenFeature?: (id: RailFeature) => void;
  /** Zurück zur Startseite (auch Fallback für die Werkzeug-Knöpfe). */
  onHome: () => void;
  /** Deck-eigene Klassen, damit jedes Deck sein Design behält. */
  navClass: string;
  btnClass: string;
  activeClass: string;
  spacerClass?: string;
  /** Manche Decks hängen die Klasse für den Fuß-Knopf an den Button statt an ein <span>. */
  homeBtnClass?: string;
  ariaLabel?: string;
  /** Deck-eigene Zusatzknöpfe (z. B. „Modellseite" der Wetterkarte), die nach
   *  den Werkzeugen und vor dem Fuß-Knopf in derselben Rail stehen. */
  extra?: ReactNode;
}

export function FeatureRail({
  active, onOpenFeature, onHome, navClass, btnClass, activeClass, spacerClass, homeBtnClass, ariaLabel = 'Werkzeuge', extra,
}: FeatureRailProps) {
  return (
    <nav className={navClass} aria-label={ariaLabel}>
      {FEATURE_RAIL_ITEMS.map((it) => {
        const isActive = it.id === active;
        return (
          <button
            key={it.id}
            type="button"
            className={`${btnClass}${isActive ? ` ${activeClass}` : ''}`}
            title={it.label}
            aria-label={it.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={isActive ? undefined : () => (onOpenFeature ? onOpenFeature(it.id) : onHome())}
          >
            {it.icon}
          </button>
        );
      })}
      {extra}
      {spacerClass && <span className={spacerClass} />}
      <button
        type="button"
        className={homeBtnClass ?? btnClass}
        title="Startseite"
        aria-label="Startseite"
        onClick={onHome}
      >
        <IconRailHome />
      </button>
    </nav>
  );
}
