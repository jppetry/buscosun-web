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

export interface SeaChartHour { t: number; windMs: number | null; gustMs: number | null; hs: number | null; ws: number | null; sw: number | null; daylight: boolean; dry?: boolean }
/** V-SW-20: hours without sea state at the model cell — a sand strip on the time axis, the lines pause there. */
export const DRY_COLOUR = '#C9A871';
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

/** `big`: the dossier draws the charts across its full width — taller, with larger axis text. */
const theme = (big?: boolean) => ({ text: { fontFamily: 'IBM Plex Mono, monospace', fontSize: big ? 12 : 9, fill: big ? '#5C5447' : '#8B7355' }, grid: { line: { stroke: '#E0D6BE', strokeWidth: 1 } }, axis: { ticks: { line: { stroke: 'transparent' } } } });
/** A series without one value is not drawn: d3 returns `null` for its path and React writes `d="null"` (a console error
 *  per render) — the case of a run without wind at the spot (V-SW-18). Colours by id, so a dropped series shifts none. */
const drawn = <T extends { data: { y: number | null }[] }>(series: T[]): T[] => series.filter((s) => s.data.some((p) => p.y != null));
const SERIES_COLOUR: Record<string, string> = { 'Böen': '#8B7355', Wind: '#2C2A26', 'Dünung': '#7A9466', Windsee: '#3E9284', 'Seegang gesamt': '#0F6E7A' };
const colourOf = (s: { id: string | number }) => SERIES_COLOUR[String(s.id)] ?? '#2C2A26';
const axisX = (show: boolean, big?: boolean) => (show ? { tickSize: 0, tickPadding: big ? 8 : 4, tickValues: 'every 12 hours', format: (d: Date) => `${dayShort(+d)} ${hh(+d)}` } : null);

export function WindChart({ hours, selMs, limitKn, limitLabel, big }: { hours: readonly SeaChartHour[]; selMs: number; limitKn: number | null; limitLabel: string; big?: boolean }) {
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
    <g><line x1={0} x2={innerWidth} y1={yScale(limitKn)} y2={yScale(limitKn)} stroke="#B5482E" strokeDasharray="3 3" /><text x={innerWidth} y={yScale(limitKn) - 3} textAnchor="end" fontSize={big ? 11.5 : 8.5} fill="#9A5A2A" fontFamily="IBM Plex Mono, monospace">{limitLabel}</text></g>
  ));
  const c = common(hours, selMs, [Band, Limit]);
  return (
    <div className="sw-chart" style={{ height: big ? 220 : 92 }} role="img" aria-label="Verlauf Wind und Böen in Knoten (buscosun Fusion)">
      <ResponsiveLine
        data={drawn([{ id: 'Böen', data: pts((h) => kn(h.gustMs)) }, { id: 'Wind', data: pts((h) => kn(h.windMs)) }])}
        colors={colourOf} lineWidth={big ? 2.5 : 2} margin={big ? { top: 12, right: 8, bottom: 4, left: 40 } : { top: 6, right: 6, bottom: 2, left: 28 }}
        xScale={{ type: 'time', min: new Date(c.min), max: new Date(c.max), useUTC: false, precision: 'hour' }}
        yScale={{ type: 'linear', min: 0, max: Math.ceil(maxY) }} theme={theme(big)} animate={false} enablePoints={false} isInteractive={false}
        enableGridX={false} gridYValues={4} axisBottom={null} axisLeft={{ tickSize: 0, tickPadding: big ? 8 : 4, tickValues: 4, legend: '', format: (v: number) => String(v) }}
        layers={c.layers}
      />
    </div>
  );
}

/**
 * WL-4 — Water level of one BSH gauge (`audit/wasserstand-bsh.md`): the measured series, the automatic model
 * curve and — where the service carries it — the tidal prediction, in cm above gauge zero, on the gauge's own
 * fine axis (10 min North Sea, 15 min Baltic). Mean high and low water of the SAME gauge are the dashed
 * reference lines; nothing is converted to NHN here (E-WL-9). The exact peak heights are not read off this
 * curve — they stand as numbers next to it, from the service's own high/low water events.
 */
export interface WlChartPoint { t: number; forecast: number | null; measured: number | null; tide: number | null }
const WL_COLOUR: Record<string, string> = { Vorhersage: '#0F6E7A', Gemessen: '#2C2A26', Gezeit: '#7A9466' };

export function WaterLevelChart({ points, selMs, nowMs, mhwCm, mlwCm, highLabel = 'MThw', lowLabel = 'MTnw', big }: {
  points: readonly WlChartPoint[]; selMs: number; nowMs: number; mhwCm: number | null; mlwCm: number | null;
  /** V-WL-14: the reference words of the region — MThw/MTnw in the North Sea, MHW/MNW in the tideless Baltic. */
  highLabel?: string; lowLabel?: string; big?: boolean;
}) {
  if (points.length < 2) return null;
  const pts = (f: (p: WlChartPoint) => number | null) => points.map((p) => ({ x: new Date(p.t), y: f(p) }));
  const vals = points.flatMap((p) => [p.forecast, p.measured, p.tide]).filter((v): v is number => v != null);
  const lo = Math.min(...vals, mlwCm ?? Infinity), hi = Math.max(...vals, mhwCm ?? -Infinity);
  const pad = Math.max(20, (hi - lo) * 0.12);
  const min = points[0].t, max = points[points.length - 1].t;
  const Ref = ({ yScale, innerWidth }: Ctx) => (
    <g>{([[mhwCm, highLabel], [mlwCm, lowLabel]] as Array<[number | null, string]>).filter(([v]) => v != null).map(([v, label]) => (
      <g key={label}>
        <line x1={0} x2={innerWidth} y1={yScale(v!)} y2={yScale(v!)} stroke="#B9AC90" strokeDasharray="3 3" />
        <text x={innerWidth} y={yScale(v!) - 3} textAnchor="end" fontSize={big ? 11.5 : 8.5} fill="#8B7355" fontFamily="IBM Plex Mono, monospace">{label}</text>
      </g>
    ))}</g>
  );
  /** Where the measured series ends and the forecast carries on — the honest seam of this card. */
  const Now = ({ xScale, innerHeight }: Ctx) => (nowMs < min || nowMs > max ? null : (
    <line x1={xScale(new Date(nowMs))} x2={xScale(new Date(nowMs))} y1={0} y2={innerHeight} stroke="#8B7355" strokeDasharray="2 3" />
  ));
  const Sel = ({ xScale, innerHeight }: Ctx) => (selMs < min || selMs > max ? null : (
    <line x1={xScale(new Date(selMs))} x2={xScale(new Date(selMs))} y1={0} y2={innerHeight} stroke="#0F6E7A" strokeWidth={1.5} />
  ));
  return (
    <div className="sw-chart" style={{ height: big ? 260 : 104 }} role="img" aria-label="Verlauf des Wasserstands in Zentimetern über Pegelnull: gemessen, Vorhersage des BSH-Modells und Gezeitenvorausberechnung">
      <ResponsiveLine
        data={drawn([
          { id: 'Gezeit', data: pts((p) => p.tide) },
          { id: 'Gemessen', data: pts((p) => p.measured) },
          { id: 'Vorhersage', data: pts((p) => p.forecast) },
        ])}
        colors={(s) => WL_COLOUR[String(s.id)] ?? '#2C2A26'} lineWidth={big ? 2.5 : 2} margin={big ? { top: 12, right: 8, bottom: 28, left: 46 } : { top: 6, right: 6, bottom: 18, left: 34 }}
        xScale={{ type: 'time', min: new Date(min), max: new Date(max), useUTC: false }}
        yScale={{ type: 'linear', min: Math.floor((lo - pad) / 10) * 10, max: Math.ceil((hi + pad) / 10) * 10 }}
        theme={theme(big)} animate={false} enablePoints={false} isInteractive={false}
        enableGridX={false} gridYValues={4} axisBottom={axisX(true, big)} axisLeft={{ tickSize: 0, tickPadding: big ? 8 : 4, tickValues: 4, format: (v: number) => String(v) }}
        layers={[Ref, 'grid', 'lines', 'axes', Now, Sel] as never}
      />
    </div>
  );
}

export function SeaStateChart({ hours, selMs, big }: { hours: readonly SeaChartHour[]; selMs: number; big?: boolean }) {
  // An hour without sea state is a gap in all three lines (the model's height there is not a wave of 0 m).
  const pts = (f: (h: SeaChartHour) => number | null) => hours.map((h) => ({ x: new Date(h.t), y: h.dry ? null : f(h) }));
  const maxY = Math.max(1, ...hours.map((h) => h.hs ?? 0)) * 1.15;
  const Dry = ({ xScale, innerHeight }: Ctx) => (
    <g>{hours.filter((h) => h.dry).map((h) => {
      const x0 = Math.max(0, xScale(new Date(h.t - 1_800_000))), x1 = xScale(new Date(h.t + 1_800_000));
      return <rect key={h.t} x={x0} y={innerHeight - 5} width={Math.max(0, x1 - x0)} height={5} fill={DRY_COLOUR} />;
    })}</g>
  );
  const c = common(hours, selMs, [Dry]);
  return (
    <div className="sw-chart" style={{ height: big ? 200 : 96 }} role="img" aria-label="Verlauf Seegang gesamt, Windsee und Dünung in Metern (Modell CWAM)">
      <ResponsiveLine
        data={drawn([{ id: 'Dünung', data: pts((h) => h.sw) }, { id: 'Windsee', data: pts((h) => h.ws) }, { id: 'Seegang gesamt', data: pts((h) => h.hs) }])}
        colors={colourOf} lineWidth={big ? 2.5 : 2} margin={big ? { top: 10, right: 8, bottom: 28, left: 40 } : { top: 6, right: 6, bottom: 18, left: 28 }}
        xScale={{ type: 'time', min: new Date(c.min), max: new Date(c.max), useUTC: false, precision: 'hour' }}
        yScale={{ type: 'linear', min: 0, max: Math.ceil(maxY * 2) / 2 }} theme={theme(big)} animate={false} enablePoints={false} isInteractive={false}
        enableGridX={false} gridYValues={3} axisBottom={axisX(true, big)} axisLeft={{ tickSize: 0, tickPadding: big ? 8 : 4, tickValues: 3, format: (v: number) => String(v) }}
        layers={c.layers}
      />
    </div>
  );
}
