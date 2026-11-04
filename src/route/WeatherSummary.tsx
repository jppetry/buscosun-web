/**
 * Wetter-Zusammenfassung der gesamten Tour gemäß Mockup 03: 5×2-Stat-Grid plus
 * separate Warn- und Föhn-Banner. Verbraucht {@link computeWeatherAggregate};
 * TourView legt Grid und Banner im Layout an.
 */

import type { ReactNode } from 'react';
import type { WeatherAggregate, AggregatedWarning } from './weatherAggregate';
import { uvCategory } from '../sources/dwdUvForecast';
import type { SampleETA } from './tourTiming';
import { clock, fmt1, SeverityBadge } from './tourUi';
import { IconWarning, IconWind } from './routeIcons';

/* ===== Die Antwort als Satz (Kopf des Ergebnisses) ===== */
const WET_MM_H = 0.1;

/** Sagt in Worten, wo und wann es nass wird, dazu Temperatur und Böen. Vorhersage, aus denselben Punkten wie die Karten. */
export function tourVerdict(samples: SampleETA[], agg: WeatherAggregate): { lead: string; rest: string } | null {
  const withW = samples.filter((s) => s.weather != null);
  if (!agg.hasData || withW.length < 2) return null;

  const stretches: SampleETA[][] = [];
  let cur: SampleETA[] = [];
  for (const s of withW) {
    if ((s.weather!.precipitationMmH ?? 0) > WET_MM_H) cur.push(s);
    else if (cur.length) { stretches.push(cur); cur = []; }
  }
  if (cur.length) stretches.push(cur);

  const km = (s: SampleETA) => Math.round(s.dist / 1000);
  const word = agg.precip.dominantType === 'snow' ? 'Schnee' : agg.precip.dominantType === 'sleet' ? 'Schneeregen' : 'Regen';
  let lead: string;
  if (stretches.length === 0) lead = 'Trocken auf der ganzen Strecke.';
  else if (stretches.length === 1) {
    const a = stretches[0][0], b = stretches[0][stretches[0].length - 1];
    lead = km(a) === km(b)
      ? `${word} bei km ${km(a)} gegen ${clock(a.etaMs)} Uhr.`
      : `${word} zwischen km ${km(a)} und ${km(b)}, etwa ${clock(a.etaMs)} bis ${clock(b.etaMs)} Uhr.`;
  } else {
    const a = stretches[0][0];
    lead = `${word} in ${stretches.length} Abschnitten, zuerst ab km ${km(a)} gegen ${clock(a.etaMs)} Uhr.`;
  }

  const parts: string[] = [];
  if (agg.temp) parts.push(`${Math.round(agg.temp.min)} bis ${Math.round(agg.temp.max)} °C`);
  if (agg.gust) parts.push(`Böen bis ${Math.round(agg.gust.max * 3.6)} km/h`);
  let rest = parts.length ? `${parts.join(', ')}.` : '';
  if (agg.warnings.count > 0) rest += `${rest ? ' ' : ''}Für die Strecke liegt eine amtliche Warnung vor.`;
  return { lead, rest };
}

/* ===== Stat-Grid ===== */
export function WeatherStatGrid({ agg }: { agg: WeatherAggregate }) {
  if (!agg.hasData) return null;
  const items: Array<{ label: string; value: string; sub?: ReactNode; accent?: boolean }> = [];

  if (agg.temp) items.push({ label: 'Temperatur', value: `${fmt1(agg.temp.min)} – ${fmt1(agg.temp.max)} °C`, sub: `Ø ${fmt1(agg.temp.avg)} °C · höhenkorrigiert` });
  if (agg.apparent) items.push({ label: 'Gefühlt', value: `${fmt1(agg.apparent.min)} – ${fmt1(agg.apparent.max)} °C`, sub: 'Wind-Chill / Hitze-Index' });
  if (agg.wind) items.push({ label: 'Wind', value: `Ø ${fmt1(agg.wind.avg)} m/s`, sub: `max ${fmt1(agg.wind.max)} m/s` });
  if (agg.gust) items.push({ label: 'Max Böen', value: `${fmt1(agg.gust.max)} m/s`, sub: `${fmt1(agg.gust.max * 3.6)} km/h` });

  items.push({
    label: 'Niederschlag',
    value: `${fmt1(agg.precip.totalMm)} mm`,
    sub: agg.precip.hoursWithRain > 0 ? `${formatDurationHours(agg.precip.hoursWithRain)} ${precipDominantLabel(agg.precip.dominantType)}` : 'trocken',
  });
  if (agg.precip.maxRateMmH > 0) items.push({
    label: 'Max Regenrate', value: `${fmt1(agg.precip.maxRateMmH)} mm/h`,
    sub: agg.precip.fromRadarCount > 0 ? `${agg.precip.fromRadarCount} Punkte Radar-Nowcast` : 'NWP-Modell',
    accent: agg.precip.fromRadarCount > 0,
  });
  if (agg.cloud) items.push({ label: 'Bewölkung', value: `${Math.round(agg.cloud.avg)} %`, sub: cloudWord(agg.cloud.avg) });
  if (agg.humidity) items.push({ label: 'Luftfeuchte', value: `${Math.round(agg.humidity.avg)} %`, sub: 'Ø über Tour' });
  if (agg.uv && agg.uv.max > 0) items.push({
    label: 'UV-Index (max)', value: `${fmt1(agg.uv.max)}`,
    sub: <span className="rt-badge rt-badge-uv" style={{ background: uvCategory(agg.uv.max).color }}>{uvCategory(agg.uv.max).label}</span>,
  });
  if (agg.snowLine) items.push({
    label: 'Schneefallgrenze', value: `${Math.round(agg.snowLine.avg)} m`,
    sub: Math.abs(agg.snowLine.max - agg.snowLine.min) > 50 ? `${Math.round(agg.snowLine.min)} – ${Math.round(agg.snowLine.max)} m` : undefined,
  });

  return (
    <div className="rt-statgrid">
      {items.map((it) => (
        <div key={it.label} className="rt-card rt-stat">
          <div className="rt-stat-label">{it.label}</div>
          <div className="rt-stat-value">{it.value}</div>
          {it.sub != null && <div className={`rt-stat-sub${it.accent ? ' is-accent' : ''}`}>{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/* ===== Warn-Banner (höchste Warnung) ===== */
export function WarningBanner({ warnings }: { warnings: AggregatedWarning[] }) {
  if (warnings.length === 0) return null;
  const w = warnings[0];   // höchstes Level zuerst (sortiert in computeWeatherAggregate)
  return (
    <div className="rt-banner rt-banner-warn">
      <SeverityBadge severity={w.severity} level={w.level} />
      <div className="rt-banner-title">{w.event || w.headline}</div>
      <div className="rt-banner-line">Amtliche Warnung des DWD · {fmtKmRange(w.firstDistM, w.lastDistM)} · {fmtTimeRange(w.onsetMs, w.expiresMs)}</div>
      {warnings.length > 1 && <div className="rt-banner-rec">+ {warnings.length - 1} weitere Warnung{warnings.length - 1 === 1 ? '' : 'en'} entlang der Tour</div>}
      <span className="rt-banner-ico"><IconWarning size={20} /></span>
    </div>
  );
}

/* ===== Föhn-Banner ===== */
export function FoehnBanner({ agg }: { agg: WeatherAggregate }) {
  if (!agg.foehn) return null;
  const f = agg.foehn;
  return (
    <div className="rt-banner rt-banner-foehn">
      <span className="rt-badge rt-badge-foehn rt-badge-sev">FÖHN · {fmt1(f.maxScore)}</span>
      <div className="rt-banner-title">Föhn-Lage wahrscheinlich</div>
      <div className="rt-banner-line">{fmtKmRange(f.firstDistM, f.lastDistM)} · {f.count} Punkt{f.count === 1 ? '' : 'e'}{f.reasons.length > 0 ? ` · ${f.reasons.join(', ')}` : ''}</div>
      <div className="rt-banner-rec">Wärmer und trockener als das Modell zeigt. <em>(heuristisch)</em></div>
      <span className="rt-banner-ico"><IconWind size={20} /></span>
    </div>
  );
}

/* ===== Helpers ===== */
function formatDurationHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  const hh = Math.floor(h); const mm = Math.round((h - hh) * 60);
  return mm === 0 ? `${hh} h` : `${hh} h ${mm.toString().padStart(2, '0')}`;
}
function precipDominantLabel(t: 'rain' | 'sleet' | 'snow' | 'none'): string {
  return t === 'snow' ? 'mit Schnee' : t === 'sleet' ? 'mit Schneeregen' : t === 'rain' ? 'mit Regen' : '';
}
function cloudWord(pct: number): string {
  if (pct < 13) return 'wolkenlos';
  if (pct < 38) return 'leicht bewölkt';
  if (pct < 63) return 'wechselnd bewölkt';
  if (pct < 88) return 'überwiegend bewölkt';
  return 'bedeckt';
}
function fmtKmRange(aM: number, bM: number): string {
  const a = (aM / 1000).toFixed(1).replace('.', ','); const b = (bM / 1000).toFixed(1).replace('.', ',');
  return a === b ? `km ${a}` : `km ${a} – ${b}`;
}
function fmtTimeRange(onsetMs: number, expiresMs: number): string {
  const f = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return `${f(onsetMs)} – ${f(expiresMs)}`;
}
