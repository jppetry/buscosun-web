/**
 * AW-8 — ONE nivo theme for the hazard charts (gefahren §nivo): the `--aw-*` tokens and the self-hosted fonts of
 * `src/fonts.css` (League Spartan, IBM Plex Mono) — no Google Fonts request. Animations are off under
 * `prefers-reduced-motion` (`useReducedMotion`).
 */
import { useEffect, useState } from 'react';
import type { RoadLevel } from './roadHazards';

export const AW_FONT = "'League Spartan', system-ui, sans-serif";
export const AW_MONO = "'IBM Plex Mono', ui-monospace, monospace";

/** Level colours (gefahren §Neue Tokens): fill and the ink that reads on it. */
export const AW_SEV: Readonly<Record<RoadLevel, { bg: string; ink: string }>> = Object.freeze({
  0: { bg: '#EFE9DA', ink: '#A89A7A' },
  1: { bg: '#E6C46F', ink: '#4A3A12' },
  2: { bg: '#E0822F', ink: '#2C1A0A' },
  3: { bg: '#B5321F', ink: '#FFFFFF' },
});
/** Chip tints per level (bg / border / ink) and the hatched unknown. */
export const AW_SEV_TINT: Readonly<Record<RoadLevel, { bg: string; border: string; ink: string }>> = Object.freeze({
  0: { bg: '#F5F1E8', border: '#E0D6BE', ink: '#8B7355' },
  1: { bg: '#FBF5E2', border: '#E9D9A8', ink: '#6B5212' },
  2: { bg: '#FBEFE3', border: '#EBC39C', ink: '#7A4520' },
  3: { bg: '#FBE9E4', border: '#E8C9BD', ink: '#8A1C1C' },
});
export const AW_HATCH = 'repeating-linear-gradient(135deg,#8B8474 0 2px,#EDE6D3 2px 4px)';
export const AW_UNKNOWN_TINT = Object.freeze({ bg: 'repeating-linear-gradient(135deg,#EDE6D3 0 3px,#F5F1E8 3px 6px)', border: '#D9D0B8', ink: '#5C5447' });

export const roadNivoTheme = {
  background: 'transparent',
  text: { fontFamily: AW_FONT, fontSize: 10, fill: '#5C5447' },
  axis: {
    domain: { line: { stroke: '#EDE6D3', strokeWidth: 1 } },
    ticks: { line: { stroke: '#EDE6D3', strokeWidth: 1 }, text: { fontFamily: AW_MONO, fontSize: 9, fill: '#A89A7A' } },
    legend: { text: { fontFamily: AW_FONT, fontSize: 9, fill: '#A89A7A' } },
  },
  grid: { line: { stroke: '#EDE6D3', strokeWidth: 1 } },
  labels: { text: { fontFamily: AW_FONT, fontSize: 11, fontWeight: 700 } },
  tooltip: { container: { background: 'rgba(250,246,234,0.97)', color: '#2C2A26', fontSize: 11, fontFamily: AW_FONT, borderRadius: 8, border: '1px solid #E0D6BE', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '6px 9px' } },
  crosshair: { line: { stroke: '#1F5FAE', strokeWidth: 1, strokeOpacity: 0.6 } },
  annotations: { text: { fontFamily: AW_FONT, fontSize: 9 } },
};

/** `prefers-reduced-motion: reduce` ⇒ nivo `animate={false}` (and no map easing). */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduce;
}
