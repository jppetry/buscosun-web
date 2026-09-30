/**
 * Wettersymbole des Dashboards — Pfade und Farben 1:1 aus reference/dashboard.dc.html (Phase DB). Keine neuen Formen:
 * Sonne, Sonne mit Wolke, Wolke, Regenwolke mit 1–3 Tropfen, Mond, Mond mit Wolke (Regel: model/rules.ts symbolFor).
 */
import type { IconVM } from './model/types';

const SUN = '#D4A373';
const CLOUD_LIGHT = '#C9CFD6';
const CLOUD = '#9AB8CF';
const CLOUD_DARK = '#8FA8C4';
const DROP = '#3A6FA8';
const MOON = '#B5A6E0';

type Ray = 'n' | 's' | 'w' | 'e' | 'nw' | 'se';
const RAY: Record<Ray, [number, number, number, number]> = {
  n: [20, 4, 20, 9], s: [20, 31, 20, 36], w: [4, 20, 9, 20], e: [31, 20, 36, 20], nw: [9, 9, 12, 12], se: [28, 28, 31, 31],
};

/** Sonnenstrahlen je Einsatzort, wie gezeichnet: Jetzt 6, Tageskopf 4, Mittag/Abend 2. */
export type SunVariant = 'now' | 'day' | 'mittag' | 'abend';
const RAYS: Record<SunVariant, Ray[]> = { now: ['n', 's', 'w', 'e', 'nw', 'se'], day: ['n', 'w', 'e', 'nw'], mittag: ['n', 'w'], abend: ['n', 'e'] };

export function WeatherIcon({ icon, size, variant = 'day', stroke = 2.4 }: { icon: IconVM | null; size: number; variant?: SunVariant; stroke?: number }) {
  if (!icon) return <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" />;
  const common = { width: size, height: size, viewBox: '0 0 40 40', fill: 'none' as const, 'aria-hidden': true as const, style: { flex: '0 0 auto' } };
  switch (icon.kind) {
    case 'sun':
      return (
        <svg {...common}>
          <circle cx="20" cy="20" r="9" fill={SUN} />
          <g stroke={SUN} strokeWidth={stroke} strokeLinecap="round">
            {RAYS[variant].map((r) => { const [x1, y1, x2, y2] = RAY[r]; return <line key={r} x1={x1} y1={y1} x2={x2} y2={y2} />; })}
          </g>
        </svg>
      );
    case 'sunCloud':
      return (
        <svg {...common}>
          <circle cx="15" cy="16" r="8" fill={SUN} />
          <path d="M 8 28 Q 8 19 17 19 Q 22 12 29 19 Q 37 19 37 26 Q 37 30 31 30 L 12 30 Q 8 30 8 28 Z" fill={CLOUD_LIGHT} />
        </svg>
      );
    case 'cloud':
      return (
        <svg {...common}>
          <path d="M 6 24 Q 6 14 16 14 Q 22 7 30 14 Q 38 14 38 22 Q 38 26 32 26 L 10 26 Q 6 26 6 24 Z" fill={icon.dark ? CLOUD_DARK : CLOUD} />
        </svg>
      );
    case 'rain': {
      const n = icon.drops ?? 1;
      const xs = n === 1 ? [16] : n === 2 ? [16, 24] : [14, 20, 26];
      const len = n === 3 ? 6 : 5;
      return (
        <svg {...common}>
          <path d="M 6 22 Q 6 12 16 12 Q 22 5 30 12 Q 38 12 38 20 Q 38 24 32 24 L 10 24 Q 6 24 6 22 Z" fill={icon.dark ? CLOUD_DARK : CLOUD} />
          <g stroke={DROP} strokeWidth={stroke === 2.4 ? 2.4 : 2.2} strokeLinecap="round">
            {xs.map((x) => <line key={x} x1={x} y1={28} x2={x - 2} y2={28 + len} />)}
          </g>
        </svg>
      );
    }
    case 'moon':
      return (
        <svg {...common}>
          <path d="M24 8 A12 12 0 1 0 32 26 A9 9 0 0 1 24 8 Z" fill={MOON} />
        </svg>
      );
    case 'moonCloud':
      return (
        <svg {...common}>
          <path d="M24 8 A12 12 0 1 0 32 26 A9 9 0 0 1 24 8 Z" fill={MOON} />
          <path d="M 6 30 Q 6 24 12 24 Q 16 20 21 24 Q 27 24 27 29 Q 27 32 23 32 L 9 32 Q 6 32 6 30 Z" fill={CLOUD_LIGHT} />
        </svg>
      );
  }
}
