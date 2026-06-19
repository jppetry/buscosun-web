/**
 * Geteilte UI-Bausteine für das Route-Feature gemäß Mockups: Badges (UV, Radar,
 * Föhn, Warnung/Severity) + deutsche Formatter. Verbraucht von Strip, Stat-Grid,
 * Scrubber und Bannern.
 */

import { uvCategory } from '../sources/dwdUvForecast';
import { IconWind, IconWarning } from './routeIcons';

/* ---- Formatter (deutsche Lokalisierung) ---- */
export const fmt1 = (n: number): string => (Math.round(n * 10) / 10).toString().replace('.', ',');
export const fmt0 = (n: number): string => Math.round(n).toString();
export const km = (m: number): string => `${(m / 1000).toFixed(m >= 10_000 ? 1 : 1).replace('.', ',')} km`;
export const clock = (ms: number): string => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/** DWD-Severity-Level → Farbklasse + Label. */
export function severityClass(level: number): string {
  return `rt-sev-${Math.max(1, Math.min(5, level))}`;
}

/* ---- Badges ---- */
export function UvBadge({ uv }: { uv: number }) {
  const cat = uvCategory(uv);
  return <span className="rt-badge rt-badge-uv" style={{ background: cat.color }} title={`UV ${fmt1(uv)} · ${cat.label}`}>UV{Math.round(uv)}</span>;
}

export function RadarBadge() {
  return <span className="rt-badge rt-badge-radar" title="Radar-Nowcast">R</span>;
}

export function FoehnBadge({ score }: { score?: number }) {
  return <span className="rt-badge rt-badge-foehn rt-badge-ico" title={`Föhn-Lage${score != null ? ` · Score ${fmt1(score)}` : ''} (heuristisch)`}><IconWind size={12} /></span>;
}

export function WarnBadge({ event }: { event?: string }) {
  return <span className="rt-badge rt-badge-warn rt-badge-ico" title={event || 'Amtliche Warnung'}><IconWarning size={12} /></span>;
}

/** Severity-Pille „SEVERE 4" o. ä. */
export function SeverityBadge({ severity, level }: { severity: string; level: number }) {
  const label = severity === 'Extreme' ? 'EXTREM' : severity === 'Severe' ? 'SEVERE' : severity === 'Moderate' ? 'MODERAT' : 'MINOR';
  return <span className={`rt-badge rt-badge-sev ${severityClass(level)}`}>{label} {level}</span>;
}
