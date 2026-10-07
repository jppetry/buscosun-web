/**
 * SW-5 — Verlauf of a spot: two `@nivo/line` charts on ONE time axis (prompt: nivo for charts). Top: wind (buscosun
 * Fusion) with the gust band, in knots, the profile's wind/gust limit as a dashed line. Bottom: sea state Hs total, wind
 * sea and swell as three lines in metres — never stacked areas (Hs² = Hs_ws² + Hs_sw², the components do not add up).
 * Night shading and the selected hour as custom layers; lines and axes are nivo's own.
 */
import type { ReactElement } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { MS_TO_KN } from './seaProfiles';
import { dayShort, hh } from './seaView';

export interface SeaChartHour { t: number; windMs: number | null; gustMs: number | null; hs: number | null; ws: number | null; sw: number | null; daylight: boolean }
interface Ctx { xScale: (v: Date) => number; yScale: (v: number) => number; innerWidth: number; innerHeight: number }

const kn = (ms: number | null) => (ms == null ? null : Math.round(ms * MS_TO_KN * 10) / 10);
const night = (hours: readonly SeaChartHour[]) => {
  const out: Array<[number, number]> = [];
  let start: number | null = null;
  hours.forEach((h, i) => {
    if (!h.daylight && start == null) start = h.t;
    if ((h.daylight || i === hours.length - 1) && start != null) { out.push([start, h.daylight ? h.t : h.t + 3_600_000]); start = null; }
  });
  return out;
};

function common(hours: readonly SeaChartHour[], selMs: number, extra: Array<(c: Ctx) => ReactElement | null> = []) {
  const nights = night(hours);
  const Night = ({ xScale, innerHeight }: Ctx) => (
    <g>{nights.map(([a, b]) => <rect key={a} x={xScale(new Date(a))} y={0} width={Math.max(0, xScale(new Date(b)) - xScale(new Date(a)))} height={innerHeight} fill="#EDE6D3" />)}</g>
  );
  const Sel = ({ xScale, innerHeight }: Ctx) => <line x1={xScale(new Date(selMs))} x2={xScale(new Date(selMs))} y1={0} y2={innerHeight} stroke="#0F6E7A" strokeWidth={1.5} />;
  return { layers: [Night, 'grid', ...extra, 'lines', 'axes', Sel] as never, min: hours[0]?.t ?? 0, max: hours[hours.length - 1]?.t ?? 1 };
}

const THEME = { text: { fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, fill: '#8B7355' }, grid: { line: { stroke: '#E0D6BE', strokeWidth: 1 } }, axis: { ticks: { line: { stroke: 'transparent' } } } };
const axisX = (show: boolean) => (show ? { tickSize: 0, tickPadding: 4, tickValues: 'every 12 hours', format: (d: Date) => `${dayShort(+d)} ${hh(+d)}` } : null);

export function WindChart({ hours, selMs, limitKn, limitLabel }: { hours: readonly SeaChartHour[]; selMs: number; limitKn: number | null; limitLabel: string }) {
  const pts = (f: (h: SeaChartHour) => number | null) => hours.map((h) => ({ x: new Date(h.t), y: f(h) }));
  const maxY = Math.max(10, ...hours.map((h) => kn(h.gustMs) ?? kn(h.windMs) ?? 0), limitKn ?? 0) * 1.1;
  const Band = ({ xScale, yScale }: Ctx) => {
    const ok = hours.filter((h) => h.windMs != null && h.gustMs != null);
    if (ok.length < 2) return null;
    const top = ok.map((h, i) => `${i ? 'L' : 'M'}${xScale(new Date(h.t)).toFixed(1)} ${yScale(kn(h.gustMs)!).toFixed(1)}`).join(' ');
    const bot = [...ok].reverse().map((h) => `L${xScale(new Date(h.t)).toFixed(1)} ${yScale(kn(h.windMs)!).toFixed(1)}`).join(' ');
    return <path d={`${top} ${bot} Z`} fill="rgba(139,115,85,0.18)" />;
  };
  const Limit = ({ yScale, innerWidth }: Ctx) => (limitKn == null ? null : (
    <g><line x1={0} x2={innerWidth} y1={yScale(limitKn)} y2={yScale(limitKn)} stroke="#B5482E" strokeDasharray="3 3" /><text x={innerWidth} y={yScale(limitKn) - 3} textAnchor="end" fontSize={8.5} fill="#9A5A2A" fontFamily="IBM Plex Mono, monospace">{limitLabel}</text></g>
  ));
  const c = common(hours, selMs, [Band, Limit]);
  return (
    <div className="sw-chart" style={{ height: 92 }} role="img" aria-label="Verlauf Wind und Böen in Knoten (buscosun Fusion)">
      <ResponsiveLine
        data={[{ id: 'Böen', data: pts((h) => kn(h.gustMs)) }, { id: 'Wind', data: pts((h) => kn(h.windMs)) }]}
        colors={['#8B7355', '#2C2A26']} lineWidth={2} margin={{ top: 6, right: 6, bottom: 2, left: 28 }}
        xScale={{ type: 'time', min: new Date(c.min), max: new Date(c.max), useUTC: false, precision: 'hour' }}
        yScale={{ type: 'linear', min: 0, max: Math.ceil(maxY) }} theme={THEME} animate={false} enablePoints={false} isInteractive={false}
        enableGridX={false} gridYValues={4} axisBottom={null} axisLeft={{ tickSize: 0, tickPadding: 4, tickValues: 4, legend: '', format: (v: number) => String(v) }}
        layers={c.layers}
      />
    </div>
  );
}

export function SeaStateChart({ hours, selMs }: { hours: readonly SeaChartHour[]; selMs: number }) {
  const pts = (f: (h: SeaChartHour) => number | null) => hours.map((h) => ({ x: new Date(h.t), y: f(h) }));
  const maxY = Math.max(1, ...hours.map((h) => h.hs ?? 0)) * 1.15;
  const c = common(hours, selMs);
  return (
    <div className="sw-chart" style={{ height: 96 }} role="img" aria-label="Verlauf Seegang gesamt, Windsee und Dünung in Metern (Modell CWAM)">
      <ResponsiveLine
        data={[{ id: 'Dünung', data: pts((h) => h.sw) }, { id: 'Windsee', data: pts((h) => h.ws) }, { id: 'Seegang gesamt', data: pts((h) => h.hs) }]}
        colors={['#7A9466', '#3E9284', '#0F6E7A']} lineWidth={2} margin={{ top: 6, right: 6, bottom: 18, left: 28 }}
        xScale={{ type: 'time', min: new Date(c.min), max: new Date(c.max), useUTC: false, precision: 'hour' }}
        yScale={{ type: 'linear', min: 0, max: Math.ceil(maxY * 2) / 2 }} theme={THEME} animate={false} enablePoints={false} isInteractive={false}
        enableGridX={false} gridYValues={3} axisBottom={axisX(true)} axisLeft={{ tickSize: 0, tickPadding: 4, tickValues: 3, format: (v: number) => String(v) }}
        layers={c.layers}
      />
    </div>
  );
}
