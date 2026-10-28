/**
 * SW-5 — Verlauf of a spot: two `@nivo/line` charts on ONE time axis (prompt: nivo for charts). Top: wind (buscosun
 * Fusion) with the gust band, in knots, the profile's wind/gust limit as a dashed line. Bottom: sea state Hs total, wind
 * sea and swell as three lines in metres — never stacked areas (Hs² = Hs_ws² + Hs_sw², the components do not add up).
 * Night shading and the selected hour as custom layers; lines and axes are nivo's own.
 */
import { useId, type ReactElement } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { MS_TO_KN, fmtWind } from './seaProfiles';
import { dayShort, hh } from './seaView';

export interface SeaChartHour { t: number; windMs: number | null; gustMs: number | null; hs: number | null; ws: number | null; sw: number | null; daylight: boolean; dry?: boolean }
/** V-SW-20: hours without sea state at the model cell — a sand strip on the time axis, the lines pause there. */
export const DRY_COLOUR = '#C9A871';
type Pos = { x: number; y: number };
interface Ctx {
  xScale: (v: Date) => number; yScale: (v: number) => number; innerWidth: number; innerHeight: number;
  series: ReadonlyArray<{ id: string | number; color: string; data: ReadonlyArray<{ data: { x: Date | null; y: number | null }; position: Pos }> }>;
  lineGenerator: (p: Pos[]) => string | null; areaGenerator: (p: Pos[]) => string | null;
}
/** Smooth, but never overshooting the hourly values (monotone in x). */
const CURVE = 'monotoneX' as const;

/** One series filled from the axis with a fading gradient — a single series only, never stacked (the components of Hs do not add). */
const areaLayer = (id: string, gid: string, colour: string, top = 0.24) => ({ series, areaGenerator }: Ctx) => {
  const s = series.find((x) => x.id === id);
  const d = s ? areaGenerator(s.data.map((p) => p.position)) : null;
  if (!d) return null;
  return (
    <g>
      <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={colour} stopOpacity={top} /><stop offset="1" stopColor={colour} stopOpacity={0} /></linearGradient></defs>
      <path d={d} fill={`url(#${gid})`} />
    </g>
  );
};

/** Selected hour: a soft column, a hairline and a ringed dot on every drawn series; the value of the first one in a pill. */
const selLayer = (selMs: number, pill: (id: string | number, y: number) => string | null) => ({ xScale, innerWidth, innerHeight, series }: Ctx) => {
  const x = xScale(new Date(selMs));
  if (!Number.isFinite(x)) return null;
  const hits = series.map((s) => ({ s, p: s.data.find((d) => d.data.x != null && +d.data.x === selMs) })).filter((h) => h.p && h.p.data.y != null);
  const lead = hits[hits.length - 1];
  const txt = lead ? pill(lead.s.id, lead.p!.data.y!) : null;
  const w = txt ? txt.length * 7 + 14 : 0;
  return (
    <g pointerEvents="none">
      <rect x={x - 9} y={0} width={18} height={innerHeight} fill="#0F6E7A" fillOpacity={0.07} rx={4} />
      <line x1={x} x2={x} y1={0} y2={innerHeight} stroke="#0F6E7A" strokeWidth={1.25} strokeDasharray="3 3" />
      {hits.map(({ s, p }) => <circle key={s.id} cx={x} cy={p!.position.y} r={4.5} fill="#fff" stroke={s.color} strokeWidth={2.25} />)}
      {txt && lead && (
        <g transform={`translate(${x + 10 + w <= innerWidth ? x + 10 : Math.max(0, x - 10 - w)},${Math.max(2, lead.p!.position.y - 26)})`}>
          <rect width={w} height={20} rx={10} fill="#2C2A26" />
          <text x={w / 2} y={14} textAnchor="middle" fontSize={12} fontWeight={700} fill="#FAF6EA" fontFamily="'League Spartan', system-ui, sans-serif">{txt}</text>
        </g>
      )}
    </g>
  );
};

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

function common(hours: readonly SeaChartHour[], sel: (c: Ctx) => ReactElement | null, extra: Array<(c: Ctx) => ReactElement | null> = []) {
  const nights = night(hours);
  const Night = ({ xScale, innerHeight }: Ctx) => (
    <g>{nights.map(([a, b]) => <rect key={a} x={xScale(new Date(a))} y={0} width={Math.max(0, xScale(new Date(b)) - xScale(new Date(a)))} height={innerHeight} fill="#EFE9DA" fillOpacity={0.75} rx={3} />)}</g>
  );
  return { layers: [Night, 'grid', ...extra, 'lines', 'axes', sel] as never, min: hours[0]?.t ?? 0, max: hours[hours.length - 1]?.t ?? 1 };
}

/** `big`: the dossier draws the charts across its full width — taller, with larger axis text. Dotted grid, no axis lines. */
const theme = (big?: boolean) => ({
  text: { fontFamily: "'League Spartan', system-ui, sans-serif", fontSize: big ? 13 : 11, fontWeight: 500, fill: big ? '#7A6F5C' : '#8B7355' },
  grid: { line: { stroke: '#D9D0B8', strokeWidth: 1, strokeDasharray: '2 5' } },
  axis: { ticks: { line: { stroke: 'transparent' } }, domain: { line: { stroke: 'transparent' } } },
});
/** A series without one value is not drawn: d3 returns `null` for its path and React writes `d="null"` (a console error
 *  per render) — the case of a run without wind at the spot (V-SW-18). Colours by id, so a dropped series shifts none. */
const drawn = <T extends { data: { y: number | null }[] }>(series: T[]): T[] => series.filter((s) => s.data.some((p) => p.y != null));
const SERIES_COLOUR: Record<string, string> = { 'Böen': '#8B7355', Wind: '#2C2A26', 'Dünung': '#7A9466', Windsee: '#3E9284', 'Seegang gesamt': '#0F6E7A' };
const colourOf = (s: { id: string | number }) => SERIES_COLOUR[String(s.id)] ?? '#2C2A26';
const axisX = (show: boolean, big?: boolean) => (show ? { tickSize: 0, tickPadding: big ? 8 : 4, tickValues: 'every 12 hours', format: (d: Date) => `${dayShort(+d)} ${hh(+d)}` } : null);

export function WindChart({ hours, selMs, limitKn, limitLabel, big }: { hours: readonly SeaChartHour[]; selMs: number; limitKn: number | null; limitLabel: string; big?: boolean }) {
  const gid = useId();
  const pts = (f: (h: SeaChartHour) => number | null) => hours.map((h) => ({ x: new Date(h.t), y: f(h) }));
  const maxY = Math.max(10, ...hours.map((h) => kn(h.gustMs) ?? kn(h.windMs) ?? 0), limitKn ?? 0) * 1.1;
  // Gust band between the two curves (the same monotone curve as the lines, so the band meets them exactly).
  const Band = ({ series, lineGenerator }: Ctx) => {
    const g = series.find((s) => s.id === 'Böen'), w = series.find((s) => s.id === 'Wind');
    if (!g || !w) return null;
    const ok = g.data.map((d, i) => [d, w.data[i]] as const).filter(([a, b]) => a?.data.y != null && b?.data.y != null);
    if (ok.length < 2) return null;
    const top = lineGenerator(ok.map(([a]) => a.position));
    const bot = lineGenerator(ok.map(([, b]) => b.position).reverse());
    return top && bot ? <path d={`${top}${bot.replace(/^M/, 'L')}Z`} fill="rgba(139,115,85,0.2)" /> : null;
  };
  const Limit = ({ yScale, innerWidth }: Ctx) => (limitKn == null ? null : (
    <g>
      <line x1={0} x2={innerWidth} y1={yScale(limitKn)} y2={yScale(limitKn)} stroke="#B5482E" strokeWidth={1.25} strokeDasharray="5 4" />
      {limitLabel && <text x={innerWidth - 4} y={yScale(limitKn) - 5} textAnchor="end" fontSize={big ? 12.5 : 10.5} fontWeight={600} fill="#9A5A2A" fontFamily="'League Spartan', system-ui, sans-serif">{limitLabel}</text>}
    </g>
  ));
  const c = common(hours, selLayer(selMs, (id) => {
    // The pill rounds the unrounded hour value, like the tiles (the line itself carries 0.1 kn).
    const ms = hours.find((h) => h.t === selMs)?.windMs;
    return big && id === 'Wind' && ms != null ? `${fmtWind(ms, 'kn')} kn` : null;
  }), [areaLayer('Wind', `${gid}w`, '#2C2A26', 0.14), Band, Limit]);
  return (
    <div className="sw-chart" style={{ height: big ? 236 : 92 }} role="img" aria-label="Verlauf Wind und Böen in Knoten (buscosun Fusion)">
      <ResponsiveLine
        data={drawn([{ id: 'Böen', data: pts((h) => kn(h.gustMs)) }, { id: 'Wind', data: pts((h) => kn(h.windMs)) }])}
        colors={colourOf} lineWidth={big ? 2.5 : 2} curve={CURVE} margin={big ? { top: 26, right: 8, bottom: 4, left: 36 } : { top: 6, right: 6, bottom: 2, left: 28 }}
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
  const gid = useId();
  if (points.length < 2) return null;
  const pts = (f: (p: WlChartPoint) => number | null) => points.map((p) => ({ x: new Date(p.t), y: f(p) }));
  const vals = points.flatMap((p) => [p.forecast, p.measured, p.tide]).filter((v): v is number => v != null);
  const lo = Math.min(...vals, mlwCm ?? Infinity), hi = Math.max(...vals, mhwCm ?? -Infinity);
  const pad = Math.max(20, (hi - lo) * 0.12);
  const min = points[0].t, max = points[points.length - 1].t;
  const Ref = ({ yScale, innerWidth }: Ctx) => (
    <g>{([[mhwCm, highLabel], [mlwCm, lowLabel]] as Array<[number | null, string]>).filter(([v]) => v != null).map(([v, label]) => (
      <g key={label}>
        <line x1={0} x2={innerWidth} y1={yScale(v!)} y2={yScale(v!)} stroke="#B9AC90" strokeWidth={1.25} strokeDasharray="5 4" />
        <text x={innerWidth - 4} y={yScale(v!) - 5} textAnchor="end" fontSize={big ? 12.5 : 10.5} fontWeight={600} fill="#8B7355" fontFamily="'League Spartan', system-ui, sans-serif">{label}</text>
      </g>
    ))}</g>
  );
  /** Where the measured series ends and the forecast carries on — the honest seam of this card. */
  const Now = ({ xScale, innerHeight }: Ctx) => (nowMs < min || nowMs > max ? null : (
    <line x1={xScale(new Date(nowMs))} x2={xScale(new Date(nowMs))} y1={0} y2={innerHeight} stroke="#8B7355" strokeDasharray="2 3" />
  ));
  const Sel = ({ xScale, innerHeight }: Ctx) => (selMs < min || selMs > max ? null : (
    <g pointerEvents="none">
      <rect x={xScale(new Date(selMs)) - 9} y={0} width={18} height={innerHeight} fill="#0F6E7A" fillOpacity={0.07} rx={4} />
      <line x1={xScale(new Date(selMs))} x2={xScale(new Date(selMs))} y1={0} y2={innerHeight} stroke="#0F6E7A" strokeWidth={1.25} strokeDasharray="3 3" />
    </g>
  ));
  const Area = areaLayer('Vorhersage', `${gid}wl`, '#0F6E7A', 0.2);
  return (
    <div className="sw-chart" style={{ height: big ? 260 : 104 }} role="img" aria-label="Verlauf des Wasserstands in Zentimetern über Pegelnull: gemessen, Vorhersage des BSH-Modells und Gezeitenvorausberechnung">
      <ResponsiveLine
        data={drawn([
          { id: 'Gezeit', data: pts((p) => p.tide) },
          { id: 'Gemessen', data: pts((p) => p.measured) },
          { id: 'Vorhersage', data: pts((p) => p.forecast) },
        ])}
        colors={(s) => WL_COLOUR[String(s.id)] ?? '#2C2A26'} lineWidth={big ? 2.5 : 2} curve={CURVE} margin={big ? { top: 14, right: 8, bottom: 28, left: 42 } : { top: 6, right: 6, bottom: 18, left: 34 }}
        xScale={{ type: 'time', min: new Date(min), max: new Date(max), useUTC: false }}
        yScale={{ type: 'linear', min: Math.floor((lo - pad) / 10) * 10, max: Math.ceil((hi + pad) / 10) * 10 }}
        theme={theme(big)} animate={false} enablePoints={false} isInteractive={false}
        enableGridX={false} gridYValues={4} axisBottom={axisX(true, big)} axisLeft={{ tickSize: 0, tickPadding: big ? 8 : 4, tickValues: 4, format: (v: number) => String(v) }}
        layers={[Ref, 'grid', Area, 'lines', 'axes', Now, Sel] as never}
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
  const gid = useId();
  const c = common(hours, selLayer(selMs, (id, y) => (big && id === 'Seegang gesamt' ? `${y.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m` : null)), [areaLayer('Seegang gesamt', `${gid}hs`, '#0F6E7A', 0.26), Dry]);
  return (
    <div className="sw-chart" style={{ height: big ? 216 : 96 }} role="img" aria-label="Verlauf Seegang gesamt, Windsee und Dünung in Metern (Modell CWAM)">
      <ResponsiveLine
        data={drawn([{ id: 'Dünung', data: pts((h) => h.sw) }, { id: 'Windsee', data: pts((h) => h.ws) }, { id: 'Seegang gesamt', data: pts((h) => h.hs) }])}
        colors={colourOf} lineWidth={big ? 2.5 : 2} curve={CURVE} margin={big ? { top: 26, right: 8, bottom: 28, left: 36 } : { top: 6, right: 6, bottom: 18, left: 28 }}
        xScale={{ type: 'time', min: new Date(c.min), max: new Date(c.max), useUTC: false, precision: 'hour' }}
        yScale={{ type: 'linear', min: 0, max: Math.ceil(maxY * 2) / 2 }} theme={theme(big)} animate={false} enablePoints={false} isInteractive={false}
        enableGridX={false} gridYValues={3} axisBottom={axisX(true, big)} axisLeft={{ tickSize: 0, tickPadding: big ? 8 : 4, tickValues: 3, format: (v: number) => String(v) }}
        layers={c.layers}
      />
    </div>
  );
}
