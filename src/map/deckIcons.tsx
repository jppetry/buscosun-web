/**
 * Command-Deck-Icons der Kartenseite — handgezeichnete Vektor-Icons nach den
 * Referenzen (references/*-karte.png, regenradar.dc.html). 24er-viewBox,
 * currentColor, runde Caps — keine Emoji, keine Platzhalter.
 */

interface IcoProps { size?: number }

/* ---- Rail / Bottom-Bar ---------------------------------------------------- */

/** Layer-Stapel — Wetterkarte (Rail aktiv, Bottom-Bar „Karte"). */
export function IcoLayers({ size = 21 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 L21 8 L12 13 L3 8 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3 12 L12 17 L21 12 M3 16 L12 21 L21 16" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** Globus mit Meridianen — Modellseite (Rail, Bottom-Bar „Modelle"). */
export function IcoGlobe({ size = 21 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3 12 H21 M4.6 7 H19.4 M4.6 17 H19.4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** Trendlinie mit Pfeil — Vorhersage (Rail, Bottom-Bar „Forecast"). */
export function IcoTrend({ size = 21 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 17 L9 11 L13 14.5 L20 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 7 H20 V11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Puls-/Radar-Linie — Nowcast (Rail). */
export function IcoPulse({ size = 21 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.5 12 H7 L9.5 5.5 L14.5 18.5 L17 12 H21.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Stern — Event-Planung (Rail: „Welcher Tag passt am besten?"). */
export function IcoStar({ size = 21 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.2 L14.6 8.9 L20.8 9.6 L16.2 13.8 L17.5 19.9 L12 16.8 L6.5 19.9 L7.8 13.8 L3.2 9.6 L9.4 8.9 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Sonne — Zur Startseite (Rail unten). */
export function IcoSun({ size = 20 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.2 5.2 L7 7 M17 17 L18.8 18.8 M18.8 5.2 L17 7 M7 17 L5.2 18.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Radar-Gauge — Bottom-Bar „Nowcast" (Kreis mit Zeiger, references/mobile-karte.png). */
export function IcoGauge({ size = 22 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 12 L17 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

/** Gestapelte Reihen — Bottom-Bar „Layer" (references/mobile-karte.png). */
export function IcoRows({ size = 22 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="5.4" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="13.6" width="17" height="5.4" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="7" cy="7.7" r="0.9" fill="currentColor" />
      <circle cx="7" cy="16.3" r="0.9" fill="currentColor" />
    </svg>
  );
}

/* ---- Chrome --------------------------------------------------------------- */

export function IcoSearch({ size = 17 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.7" />
      <line x1="12.6" y1="12.6" x2="16.4" y2="16.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function IcoClose({ size = 18 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function IcoArrowRight({ size = 16 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12 H20 M14 6 L20 12 L14 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcoCheck({ size = 14 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 12.5 L9.5 17.5 L19.5 6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcoPlay({ size = 16 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 5.5 L18.5 12 L8 18.5 Z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function IcoPause({ size = 16 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8.5 5.5 V18.5 M15.5 5.5 V18.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function IcoPlus({ size = 18 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5 V19 M5 12 H19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function IcoMinus({ size = 18 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12 H19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

/** Orts-Pin (terracotta akzentuierbar via currentColor). */
export function IcoPin({ size = 15 }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 16" fill="none" aria-hidden="true">
      <path d="M 7 1.5 C 4 1.5, 2 3.5, 2 6 C 2 9.5, 7 14.5, 7 14.5 C 7 14.5, 12 9.5, 12 6 C 12 3.5, 10 1.5, 7 1.5 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="7" cy="6" r="1.7" fill="currentColor" />
    </svg>
  );
}
