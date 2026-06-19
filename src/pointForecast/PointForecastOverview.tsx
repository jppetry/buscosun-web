/**
 * Glanceable "right now + trend" summary for the selected location.
 *
 * Strictly aligned with mockup 03-pfc-tabs.svg:
 *   - Sections separated by hairline dividers
 *   - SVG-Weather-Icon (no emoji) for the condition
 *   - Vitals trio with subtitle line (e.g. "SW · Bft 1")
 *   - 7-point smooth sparkline (jetzt + 6 future hours)
 *   - Pollen as 14×14 colored squares + severity label
 *   - Quellen section with RUN-timestamp footer
 */

import type { PointForecast, PointForecastHour } from './types';
import { WeatherIcon, pickWeatherCondition, describeCondition } from '../components/WeatherIcon';

interface Props {
  data: PointForecast;
}

export function PointForecastOverview({ data }: Props) {
  const now = data.hours[0];
  if (!now) return null;

  const tempsToday = data.hours.slice(0, 24)
    .map((h) => h.temperature)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const tMin = tempsToday.length ? Math.min(...tempsToday) : null;
  const tMax = tempsToday.length ? Math.max(...tempsToday) : null;
  const precipTotal = data.hours.slice(0, 24)
    .map((h) => h.precipitation ?? 0)
    .reduce((a, b) => a + b, 0);

  const conf = now.confidence.temperature ?? 0;
  const confPct = Math.round(conf * 100);

  const condition = pickWeatherCondition(now.cloudCoverTotal ?? 0, now.precipitation ?? 0, now.timestamp);
  const condText = describeCondition(now.cloudCoverTotal ?? 0, now.precipitation ?? 0);

  return (
    <div className="pfc-ov">

      {/* === Now block === */}
      <div className="pfc-ov-section">
        <div className="pfc-ov-temp-row">
          <div className="pfc-ov-temp">
            {now.temperature != null ? Math.round(now.temperature) : '—'}°
          </div>
          <div className="pfc-ov-temp-side">
            <WeatherIcon condition={condition} size={28} />
            <div className="pfc-ov-cond-meta">
              <span className="pfc-ov-cond">{condText}</span>
              {tMin != null && tMax != null && (
                <span className="pfc-ov-minmax">
                  {Math.round(tMin)}° / {Math.round(tMax)}° heute
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* === Vitals — Wind · Wolken · Niederschlag with vertical hairlines === */}
      <div className="pfc-ov-section">
        <span className="eyebrow">Aktuell</span>
        <dl className="pfc-ov-vitals">
          <div className="pfc-ov-vital">
            <dt>Wind</dt>
            <dd>{now.windSpeed != null ? `${now.windSpeed.toFixed(1)} m/s` : '—'}</dd>
            <span className="pfc-ov-vital-sub">{windDescription(now.windSpeed, now.windDirection)}</span>
          </div>
          <div className="pfc-ov-vital">
            <dt>Wolken</dt>
            <dd>{now.cloudCoverTotal != null ? `${Math.round(now.cloudCoverTotal)} %` : '—'}</dd>
            <span className="pfc-ov-vital-sub">{cloudDescription(now.cloudCoverTotal)}</span>
          </div>
          <div className="pfc-ov-vital">
            <dt>Niederschlag</dt>
            <dd>{precipTotal > 0.05 ? `${precipTotal.toFixed(1)} mm` : '0.0 mm'}</dd>
            <span className="pfc-ov-vital-sub">{precipDescription(now.precipitation, precipTotal)}</span>
          </div>
        </dl>
      </div>

      {/* === Confidence === */}
      <div className="pfc-ov-section">
        <div className="pfc-ov-conf-head">
          <span className="eyebrow">Konfidenz · Temperatur</span>
          <span className="pfc-ov-conf-pct">{confidenceLabel(conf)}&nbsp;·&nbsp;{confPct}&nbsp;%</span>
        </div>
        <div className="pfc-ov-conf-rule">
          <div
            className="pfc-ov-conf-rule-fill"
            style={{ width: `${confPct}%`, background: confColor(conf) }}
          />
        </div>
        <div className="pfc-ov-conf-meta">
          <span>{data.sourcesAvailable.length}&nbsp;Quellen</span>
          <span className="pfc-ov-dot-sep" />
          <span>{data.nearestStations.length}&nbsp;Stationen im Mix</span>
          {data.lapseRatePerM != null && (
            <>
              <span className="pfc-ov-dot-sep" />
              <span>Lapse&nbsp;{(data.lapseRatePerM * 1000).toFixed(1)}&nbsp;K/km</span>
            </>
          )}
        </div>
      </div>

      <TrendSpark hours={data.hours} />

      <div className="pfc-ov-foot">
        <span className="eyebrow">Quellen</span>
        <span className="pfc-ov-foot-line">{formatSourceList(data.sourcesAvailable)}</span>
        <span className="pfc-ov-foot-run">{formatRunStamp(data.fetchedAt)}</span>
      </div>
    </div>
  );
}

// ============================================================================
// 6-hour smooth sparkline — 7 markers (jetzt + 6 future hours)
// ============================================================================
function TrendSpark({ hours }: { hours: PointForecastHour[] }) {
  const cells = hours.slice(0, 7);
  const temps = cells.map((h) => h.temperature ?? NaN);
  const finite = temps.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return null;

  const W = 320;
  const H = 98;
  const PAD_L = 6;
  const PAD_R = 6;
  const PAD_T = 20;
  const PAD_B = 28;

  let lo = Math.min(...finite);
  let hi = Math.max(...finite);
  if (hi - lo < 3) {
    const c = (lo + hi) / 2;
    lo = c - 1.5; hi = c + 1.5;
  }
  const range = hi - lo;
  const n = cells.length;
  const x = (i: number) => PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
  const y = (t: number) => PAD_T + (1 - (t - lo) / range) * (H - PAD_T - PAD_B);

  const pts = temps.map((t, i) => ({ x: x(i), y: Number.isFinite(t) ? y(t) : NaN, t }));

  // Smooth path
  let d = '';
  let area = '';
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!Number.isFinite(p.y)) continue;
    if (d === '') {
      d = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      area = `M ${p.x.toFixed(1)} ${(H - PAD_B).toFixed(1)} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    } else {
      const prev = pts[i - 1];
      const cx = (prev.x + p.x) / 2;
      d += ` Q ${cx.toFixed(1)} ${prev.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      area += ` Q ${cx.toFixed(1)} ${prev.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }
  }
  area += ` L ${pts[pts.length - 1].x.toFixed(1)} ${(H - PAD_B).toFixed(1)} Z`;

  return (
    <div className="pfc-ov-section pfc-ov-trend">
      <div className="pfc-ov-trend-head">
        <span className="eyebrow">Nächste 6 h · Temperatur</span>
        <span className="pfc-ov-trend-now">
          {hours[6]?.temperature != null ? `${Math.round(hours[6].temperature as number)}°` : ''}
        </span>
      </div>
      <svg className="pfc-ov-trend-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={area} fill="rgba(201, 123, 71, 0.18)" />
        <path d={d} fill="none" stroke="var(--terracotta-500)" strokeWidth={1.4} strokeLinecap="round" />
        {pts.map((p, i) => {
          if (!Number.isFinite(p.y)) return null;
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={3} fill="#fff" stroke="var(--terracotta-500)" strokeWidth={1.4} />
              <text
                x={p.x} y={H - 8}
                textAnchor="middle" fontSize={9}
                fill="var(--stone-400)"
                letterSpacing="0.04em"
              >
                {i === 0 ? 'jetzt' : `+${i}h`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================
function confidenceLabel(c: number): string {
  if (c >= 0.85) return 'Hoch';
  if (c >= 0.6) return 'Solide';
  if (c >= 0.35) return 'Moderat';
  return 'Niedrig';
}

function confColor(c: number): string {
  if (c >= 0.85) return 'var(--sage-600)';
  if (c >= 0.6) return '#9DAE7E';
  if (c >= 0.35) return 'var(--amber-500)';
  return 'var(--terracotta-500)';
}

function windDescription(speed: number | null | undefined, dirDeg: number | null | undefined): string {
  if (speed == null || !Number.isFinite(speed)) return '—';
  const bft = beaufortFromMs(speed);
  const dir = compassFromDeg(dirDeg);
  return dir ? `${dir} · Bft ${bft}` : `Bft ${bft}`;
}
function beaufortFromMs(ms: number): number {
  if (ms < 0.5) return 0;
  if (ms < 1.6) return 1;
  if (ms < 3.4) return 2;
  if (ms < 5.5) return 3;
  if (ms < 8.0) return 4;
  if (ms < 10.8) return 5;
  if (ms < 13.9) return 6;
  if (ms < 17.2) return 7;
  if (ms < 20.8) return 8;
  if (ms < 24.5) return 9;
  if (ms < 28.5) return 10;
  return 11;
}
function compassFromDeg(d: number | null | undefined): string | null {
  if (d == null || !Number.isFinite(d)) return null;
  const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(((d % 360) / 45)) % 8];
}
function cloudDescription(pct: number | null | undefined): string {
  if (pct == null) return '—';
  if (pct < 15) return 'klar';
  if (pct < 40) return 'heiter';
  if (pct < 70) return 'bewölkt';
  return 'bedeckt';
}
function precipDescription(now: number | null | undefined, total24: number): string {
  if ((now ?? 0) > 0.5) return 'Niederschlag aktiv';
  if (total24 < 0.05) return 'trocken';
  if (total24 < 2) return 'leichter Schauer möglich';
  return 'Regen im Tagesverlauf';
}
function formatSourceList(sources: string[]): string {
  if (sources.length === 0) return '—';
  const labels = sources.map((s) => {
    switch (s.toLowerCase()) {
      case 'dwd_obs': return 'DWD Stations-Obs';
      case 'mosmix':  return 'DWD MOSMIX';
      case 'arome_at':
      case 'arome':   return 'GeoSphere AROME';
      case 'inca':    return 'GeoSphere INCA';
      case 'tawes':   return 'TAWES alpin';
      case 'smn':     return 'MeteoSwiss SMN';
      default:        return s;
    }
  });
  return labels.join(' · ');
}
function formatRunStamp(fetchedAt: number): string {
  // We don't know the exact model-run UTC; show fetchedAt + next refresh hint.
  const fetched = new Date(fetchedAt);
  const next = new Date(fetched.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
  return `Geladen ${fmt(fetched)} · Nächste Aktualisierung gegen ${fmt(next)}`;
}
