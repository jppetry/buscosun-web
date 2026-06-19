/**
 * Weather condition icons — handgezeichnete SVGs gemäß v1.8 Mockup-Spec.
 * Ersetzt Unicode-Emojis durch konsistente labware-aesthetic Glyphs.
 *
 * Style:
 *   - Stroke 1.4 px, rounded caps/joins
 *   - Primary stroke: terracotta-500 für Sonne, slate-500 für Wolken,
 *     steel-600 für Niederschlag, ink-800 für Nacht
 *   - Subtile Fill: sand-50 / cream-50 für Sonnen-/Mond-Disc
 *
 * Auswahl-Logik (parametrized: cloud cover %, precip mm/h, hour):
 *   precip > 2     → 'heavy-rain'
 *   precip > 0.1   → 'rain' / 'rain-night'
 *   cloud > 80     → 'cloudy'
 *   cloud > 40     → 'partly-cloudy' / 'partly-cloudy-night'
 *   cloud > 15     → 'sun-with-cloud' / 'moon-with-cloud'
 *   else           → 'sun' / 'moon'
 */

export type WeatherCondition =
  | 'sun'
  | 'sun-with-cloud'
  | 'partly-cloudy'
  | 'cloudy'
  | 'rain'
  | 'heavy-rain'
  | 'moon'
  | 'moon-with-cloud'
  | 'partly-cloudy-night'
  | 'rain-night';

interface Props {
  condition: WeatherCondition;
  size?: number;
}

export function WeatherIcon({ condition, size = 28 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 28 28',
    fill: 'none',
    'aria-hidden': true,
  };

  switch (condition) {
    case 'sun':
      return (
        <svg {...common}>
          <circle cx="14" cy="14" r="5.5" fill="var(--terracotta-50)" stroke="var(--terracotta-500)" strokeWidth="1.4" />
          {sunRays('var(--terracotta-500)')}
        </svg>
      );
    case 'sun-with-cloud':
      return (
        <svg {...common}>
          {/* Sun behind */}
          <circle cx="10" cy="10" r="4.5" fill="var(--terracotta-50)" stroke="var(--terracotta-500)" strokeWidth="1.3" />
          {/* Shorter rays */}
          <g stroke="var(--terracotta-500)" strokeWidth="1.3" strokeLinecap="round">
            <line x1="10" y1="2.5" x2="10" y2="4" />
            <line x1="2.5" y1="10" x2="4" y2="10" />
            <line x1="4.5" y1="4.5" x2="5.5" y2="5.5" />
            <line x1="15.5" y1="4.5" x2="14.5" y2="5.5" />
          </g>
          {/* Cloud on top */}
          <CloudPath fill="var(--cream-50)" stroke="var(--slate-500)" />
        </svg>
      );
    case 'partly-cloudy':
      return (
        <svg {...common}>
          <circle cx="9" cy="10" r="4" fill="var(--terracotta-50)" stroke="var(--terracotta-500)" strokeWidth="1.3" />
          <CloudPath fill="#fff" stroke="var(--slate-500)" />
        </svg>
      );
    case 'cloudy':
      return (
        <svg {...common}>
          {/* Back cloud */}
          <CloudPath
            fill="#fff" stroke="var(--slate-500)" strokeWidth={1.3}
            transform="translate(2 -2)" opacity={0.65}
          />
          {/* Front cloud */}
          <CloudPath fill="#fff" stroke="var(--slate-500)" />
        </svg>
      );
    case 'rain':
      return (
        <svg {...common}>
          <CloudPath fill="#fff" stroke="var(--slate-500)" />
          <g stroke="var(--steel-600)" strokeWidth="1.4" strokeLinecap="round">
            <line x1="10" y1="20" x2="9" y2="24" />
            <line x1="14" y1="20" x2="13" y2="24" />
            <line x1="18" y1="20" x2="17" y2="24" />
          </g>
        </svg>
      );
    case 'heavy-rain':
      return (
        <svg {...common}>
          <CloudPath fill="#fff" stroke="var(--slate-500)" />
          <g stroke="var(--steel-600)" strokeWidth="1.6" strokeLinecap="round">
            <line x1="8.5" y1="19" x2="7" y2="25" />
            <line x1="12" y1="19" x2="10.5" y2="25" />
            <line x1="15.5" y1="19" x2="14" y2="25" />
            <line x1="19" y1="19" x2="17.5" y2="25" />
          </g>
        </svg>
      );
    case 'moon':
      return (
        <svg {...common}>
          <path
            d="M 19 6 A 9 9 0 1 0 22 18 A 7 7 0 0 1 19 6 Z"
            fill="var(--sand-100)"
            stroke="var(--ink-800)"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'moon-with-cloud':
    case 'partly-cloudy-night':
      return (
        <svg {...common}>
          <path
            d="M 17 5 A 7 7 0 1 0 20 15 A 5 5 0 0 1 17 5 Z"
            fill="var(--sand-100)"
            stroke="var(--ink-800)"
            strokeWidth="1.3"
          />
          <CloudPath fill="#fff" stroke="var(--slate-500)" />
        </svg>
      );
    case 'rain-night':
      return (
        <svg {...common}>
          <path
            d="M 16 4 A 5 5 0 1 0 19 11 A 4 4 0 0 1 16 4 Z"
            fill="var(--sand-100)"
            stroke="var(--ink-800)"
            strokeWidth="1.2"
          />
          <CloudPath fill="#fff" stroke="var(--slate-500)" transform="translate(0 1)" />
          <g stroke="var(--steel-600)" strokeWidth="1.4" strokeLinecap="round">
            <line x1="10" y1="21" x2="9" y2="25" />
            <line x1="14" y1="21" x2="13" y2="25" />
            <line x1="18" y1="21" x2="17" y2="25" />
          </g>
        </svg>
      );
  }
}

function sunRays(color: string) {
  return (
    <g stroke={color} strokeWidth="1.4" strokeLinecap="round">
      <line x1="14" y1="1.5" x2="14" y2="4" />
      <line x1="14" y1="24" x2="14" y2="26.5" />
      <line x1="1.5" y1="14" x2="4" y2="14" />
      <line x1="24" y1="14" x2="26.5" y2="14" />
      <line x1="4.6" y1="4.6" x2="6.4" y2="6.4" />
      <line x1="21.6" y1="21.6" x2="23.4" y2="23.4" />
      <line x1="4.6" y1="23.4" x2="6.4" y2="21.6" />
      <line x1="21.6" y1="6.4" x2="23.4" y2="4.6" />
    </g>
  );
}

interface CloudPathProps {
  fill: string;
  stroke: string;
  strokeWidth?: number;
  opacity?: number;
  transform?: string;
}
function CloudPath({ fill, stroke, strokeWidth = 1.4, opacity = 1, transform }: CloudPathProps) {
  return (
    <path
      transform={transform}
      d="M 7 19 C 4 19, 3 17, 3.6 15 C 2.2 14, 2.5 11.5, 5 11 C 5.5 8, 8 7.5, 10 9 C 12 7.5, 15 8, 16 11 C 18.5 11, 20 13, 19.5 15 C 21 16, 20 19, 17 19 Z"
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      opacity={opacity}
    />
  );
}

/** Map raw weather params → condition key. */
export function pickWeatherCondition(
  cloudCover: number,
  precip: number,
  ts: Date,
): WeatherCondition {
  const h = ts.getHours();
  const night = h < 6 || h >= 21;
  if (precip > 2) return night ? 'rain-night' : 'heavy-rain';
  if (precip > 0.1) return night ? 'rain-night' : 'rain';
  if (cloudCover > 80) return 'cloudy';
  if (cloudCover > 40) return night ? 'partly-cloudy-night' : 'partly-cloudy';
  if (cloudCover > 15) return night ? 'moon-with-cloud' : 'sun-with-cloud';
  return night ? 'moon' : 'sun';
}

export function describeCondition(cloud: number, precip: number): string {
  if (precip > 2) return 'Starker Regen';
  if (precip > 0.5) return 'Regen';
  if (precip > 0.05) return 'Leichter Regen';
  if (cloud > 80) return 'Bedeckt';
  if (cloud > 40) return 'Bewölkt';
  if (cloud > 15) return 'Heiter';
  return 'Klar';
}
