/**
 * Phase WT — the two charts of the water temperature (`audit/seewetter-wassertemperatur.md`), a lazy chunk of their own
 * (`@nivo/line`, like the other charts of the page).
 *
 * `WtChart`: ONE time axis with a seam at "jetzt". Left of it the measurement of the past days (ink — measured values are
 * ink everywhere on this page), right of it the model of the next days (petrol, like every forecast curve). Between the
 * start of the model run and now both are drawn, so the gap between station and model is seen, not hidden. The two lines
 * are never joined, and neither is carried across a gap. The user's threshold is a dashed ink line — their own number,
 * not a warning colour.
 *
 * `WtRecordChart`: our own daily record of the station — daily mean as a line, the span between the day's lowest and
 * highest hourly value as a band. Not a climatology: it shows the days that were stored, nothing else.
 */
import type { ReactElement } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { dayShort, hh } from './seaView';
import type { WtDayPoint, WtPoint } from './seaWaterTemp';
import { wtNum, wtThresholdText, type WtThreshold } from './waterTemp';

const INK = '#2C2A26', PETROL = '#0F6E7A', STONE = '#8B7355';
const FONT = "'League Spartan', system-ui, sans-serif";
const H = 3_600_000;
type Pos = { x: number; y: number };
interface Ctx {
  xScale: (v: Date) => number; yScale: (v: number) => number; innerWidth: number; innerHeight: number;
  series: ReadonlyArray<{ id: string | number; color: string; data: ReadonlyArray<{ data: { x: Date | null; y: number | null }; position: Pos }> }>;
}
const theme = (big?: boolean) => ({
  text: { fontFamily: FONT, fontSize: big ? 13 : 11, fontWeight: 500, fill: big ? '#7A6F5C' : STONE },
  grid: { line: { stroke: '#D9D0B8', strokeWidth: 1, strokeDasharray: '2 5' } },
  axis: { ticks: { line: { stroke: 'transparent' } }, domain: { line: { stroke: 'transparent' } } },
});
/** A series without one value is not drawn (d3 returns `null` for its path — a console error per render). */
const drawn = <T extends { data: { y: number | null }[] }>(series: T[]): T[] => series.filter((s) => s.data.some((p) => p.y != null));

/** The measurement on the chart: a hole longer than this ends the line (`set`: hourly points, one may be missing). */
export const WT_CHART_GAP_MS = 2.5 * H;
/** The measured points with a break wherever the station was silent — the line never bridges a hole. Pure. */
export function wtObsLine(points: readonly WtPoint[]): Array<{ t: number; c: number | null }> {
  const out: Array<{ t: number; c: number | null }> = [];
  points.forEach((p, i) => {
    if (i > 0 && p.t - points[i - 1].t > WT_CHART_GAP_MS) out.push({ t: points[i - 1].t + 1, c: null });
    out.push({ t: p.t, c: p.c });
  });
  return out;
}
/** The threshold is drawn when it lies within this many kelvin of the plotted values; beyond, an edge note names it (`set`). */
export const WT_CHART_TH_REACH_K = 3;

export interface WtChartProps {
  /** Measured, whole hours, ascending. */
  obs: readonly WtPoint[];
  /** Model, every hour of the run; `null` = the cell carries no water then. */
  model: ReadonlyArray<{ t: number; c: number | null }>;
  nowMs: number; selMs: number;
  threshold: WtThreshold | null;
  big?: boolean;
}

export function WtChart({ obs, model, nowMs, selMs, threshold, big }: WtChartProps): ReactElement | null {
  const obsLine = wtObsLine(obs);
  const vals = [...obs.map((p) => p.c), ...model.flatMap((p) => (p.c == null ? [] : [p.c]))];
  const times = [...obs.map((p) => p.t), ...model.map((p) => p.t)];
  if (vals.length < 2 || times.length < 2) return null;
  const min = Math.min(...times), max = Math.max(...times);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const thIn = threshold != null && threshold.c >= lo - WT_CHART_TH_REACH_K && threshold.c <= hi + WT_CHART_TH_REACH_K;
  if (thIn) { lo = Math.min(lo, threshold.c); hi = Math.max(hi, threshold.c); }
  const pad = Math.max(0.6, (hi - lo) * 0.18);
  const yMin = Math.floor(lo - pad), yMax = Math.ceil(hi + pad);
  const fs = big ? 12.5 : 10.5;

  /** The seam: where the measurement ends and only the model speaks. */
  const Seam = ({ xScale, innerHeight }: Ctx) => (nowMs < min || nowMs > max ? null : (
    <g pointerEvents="none">
      <rect x={xScale(new Date(nowMs))} y={0} width={Math.max(0, xScale(new Date(max)) - xScale(new Date(nowMs)))} height={innerHeight} fill={PETROL} fillOpacity={0.045} />
      <line x1={xScale(new Date(nowMs))} x2={xScale(new Date(nowMs))} y1={0} y2={innerHeight} stroke={STONE} strokeWidth={1.25} strokeDasharray="2 3" />
      <text x={xScale(new Date(nowMs)) + 5} y={fs} fontSize={fs} fontWeight={700} fill={STONE} fontFamily={FONT}>jetzt</text>
    </g>
  ));
  const Threshold = ({ yScale, innerWidth, innerHeight }: Ctx) => {
    if (!threshold) return null;
    const label = `deine Schwelle ${wtThresholdText(threshold)}`;
    if (!thIn) {
      const above = threshold.c > hi;
      return <text x={innerWidth - 4} y={above ? fs : innerHeight - 5} textAnchor="end" fontSize={fs} fontWeight={600} fill={INK} fontFamily={FONT} paintOrder="stroke" stroke="#FAF6EA" strokeWidth={3}>{label} — {above ? 'oberhalb' : 'unterhalb'} des Ausschnitts</text>;
    }
    const y = yScale(threshold.c);
    return (
      <g pointerEvents="none">
        <line x1={0} x2={innerWidth} y1={y} y2={y} stroke={INK} strokeWidth={1.5} strokeDasharray="7 4" />
        <text x={innerWidth - 4} y={y - 5} textAnchor="end" fontSize={fs} fontWeight={700} fill={INK} fontFamily={FONT} paintOrder="stroke" stroke="#FAF6EA" strokeWidth={3}>{label}</text>
      </g>
    );
  };
  /** The chosen hour of the page: a soft column, a hairline and a ringed dot on the model line with its value. */
  const Sel = ({ xScale, innerWidth, innerHeight, series }: Ctx) => {
    if (selMs < min || selMs > max) return null;
    const x = xScale(new Date(selMs));
    const hit = series.find((s) => s.id === 'Modell')?.data.find((d) => d.data.x != null && +d.data.x === Math.floor(selMs / H) * H && d.data.y != null);
    const txt = hit ? `${wtNum(hit.data.y as number)} °C` : null;
    const w = txt ? txt.length * 7 + 14 : 0;
    return (
      <g pointerEvents="none">
        <rect x={x - 9} y={0} width={18} height={innerHeight} fill={PETROL} fillOpacity={0.07} rx={4} />
        <line x1={x} x2={x} y1={0} y2={innerHeight} stroke={PETROL} strokeWidth={1.25} strokeDasharray="3 3" />
        {hit && <circle cx={x} cy={hit.position.y} r={4.5} fill="#fff" stroke={PETROL} strokeWidth={2.25} />}
        {txt && hit && (
          <g transform={`translate(${x + 10 + w <= innerWidth ? x + 10 : Math.max(0, x - 10 - w)},${Math.max(2, hit.position.y - 26)})`}>
            <rect width={w} height={20} rx={10} fill={INK} />
            <text x={w / 2} y={14} textAnchor="middle" fontSize={12} fontWeight={700} fill="#FAF6EA" fontFamily={FONT}>{txt}</text>
          </g>
        )}
      </g>
    );
  };
  const label = `Wassertemperatur in Grad Celsius: ${obs.length ? 'gemessen an der Station in den vergangenen Tagen' : 'keine Messung'}${model.length ? `${obs.length ? ' und ' : ', '}Modell des DMI bis ${dayShort(max)} ${hh(max)} Uhr` : ''}`;
  return (
    <div className="sw-chart sw-wt-chart" style={{ height: big ? 250 : 150 }} role="img" aria-label={label}>
      <ResponsiveLine
        data={drawn([
          { id: 'Gemessen', data: obsLine.map((p) => ({ x: new Date(p.t), y: p.c })) },
          { id: 'Modell', data: model.map((p) => ({ x: new Date(p.t), y: p.c })) },
        ])}
        colors={(s) => (s.id === 'Gemessen' ? INK : PETROL)} lineWidth={big ? 2.5 : 2} curve="monotoneX"
        margin={big ? { top: 14, right: 10, bottom: 28, left: 40 } : { top: 8, right: 6, bottom: 20, left: 30 }}
        xScale={{ type: 'time', min: new Date(min), max: new Date(max), useUTC: false }}
        yScale={{ type: 'linear', min: yMin, max: yMax }}
        theme={theme(big)} animate={false} enablePoints={false} isInteractive={false}
        enableGridX={false} gridYValues={4}
        axisBottom={{ tickSize: 0, tickPadding: big ? 8 : 4, tickValues: big ? 'every 1 day' : 'every 2 days', format: (d: Date) => dayShort(+d) }}
        axisLeft={{ tickSize: 0, tickPadding: big ? 8 : 4, tickValues: 4, format: (v: number) => `${v}°` }}
        layers={[Seam, 'grid', 'lines', Threshold, 'axes', Sel] as never}
      />
    </div>
  );
}

const DAY_FMT = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

/** Daily mean with the day's span, over the days our own record holds. Fewer than two days are no curve. */
export function WtRecordChart({ points, big }: { points: readonly WtDayPoint[]; big?: boolean }): ReactElement | null {
  if (points.length < 2) return null;
  const lo = Math.min(...points.map((p) => p.min)), hi = Math.max(...points.map((p) => p.max));
  const pad = Math.max(0.6, (hi - lo) * 0.15);
  const min = points[0].t, max = points[points.length - 1].t;
  /** The span of each day, drawn day by day; two days that are not neighbours are not joined. */
  const Span = ({ xScale, yScale }: Ctx) => {
    const runs: WtDayPoint[][] = [];
    points.forEach((p, i) => { if (i > 0 && p.t - points[i - 1].t <= 36 * H) runs[runs.length - 1].push(p); else runs.push([p]); });
    return (
      <g>{runs.map((r) => (r.length < 2
        ? <line key={r[0].t} x1={xScale(new Date(r[0].t))} x2={xScale(new Date(r[0].t))} y1={yScale(r[0].min)} y2={yScale(r[0].max)} stroke={INK} strokeOpacity={0.25} strokeWidth={3} />
        : <path key={r[0].t} fill={INK} fillOpacity={0.1} d={`M${r.map((p) => `${xScale(new Date(p.t))},${yScale(p.max)}`).join('L')}L${[...r].reverse().map((p) => `${xScale(new Date(p.t))},${yScale(p.min)}`).join('L')}Z`} />))}
      </g>
    );
  };
  const line: Array<{ x: Date; y: number | null }> = [];
  points.forEach((p, i) => { if (i > 0 && p.t - points[i - 1].t > 36 * H) line.push({ x: new Date(points[i - 1].t + 1), y: null }); line.push({ x: new Date(p.t), y: p.mean }); });
  const span = (max - min) / (24 * H);
  return (
    <div className="sw-chart sw-wt-record-chart" style={{ height: big ? 170 : 110 }} role="img"
      aria-label={`Gemessene Wassertemperatur der Station vom ${DAY_FMT.format(new Date(min))} bis ${DAY_FMT.format(new Date(max))}: Tagesmittel und Spanne des Tages`}>
      <ResponsiveLine
        data={[{ id: 'Tagesmittel', data: line }]}
        colors={() => INK} lineWidth={big ? 2.25 : 1.75} curve="monotoneX"
        margin={big ? { top: 10, right: 10, bottom: 28, left: 40 } : { top: 6, right: 6, bottom: 20, left: 30 }}
        xScale={{ type: 'time', min: new Date(min), max: new Date(max), useUTC: true }}
        yScale={{ type: 'linear', min: Math.floor(lo - pad), max: Math.ceil(hi + pad) }}
        theme={theme(big)} animate={false} enablePoints={points.length < 8} pointSize={5} isInteractive={false}
        enableGridX={false} gridYValues={3}
        axisBottom={{ tickSize: 0, tickPadding: big ? 8 : 4, tickValues: span <= 10 ? 'every 2 days' : span <= 45 ? 'every 1 week' : span <= 200 ? 'every 1 month' : 'every 3 months', format: (d: Date) => DAY_FMT.format(d) }}
        axisLeft={{ tickSize: 0, tickPadding: big ? 8 : 4, tickValues: 3, format: (v: number) => `${v}°` }}
        layers={[Span, 'grid', 'lines', 'points', 'axes'] as never}
      />
    </div>
  );
}

const MONTH_FMT = new Intl.DateTimeFormat('de-DE', { month: 'short', timeZone: 'UTC' });

/**
 * The course of the year at a station whose own source delivers five full years: per calendar day the span between the
 * lowest and the highest daily mean of those years (stone band) and their mean (thin stone line), laid on the current
 * year's calendar; over it this year's daily means from our own record (ink). Nothing is smoothed; a day the years do
 * not carry is a hole.
 */
export function WtSeasonChart({ season, record, nowMs, big }: { season: ReadonlyArray<{ md: string; min: number; mean: number; max: number }>; record: readonly WtDayPoint[]; nowMs: number; big?: boolean }): ReactElement | null {
  const year = new Date(nowMs).getUTCFullYear();
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const at = (md: string) => Date.UTC(year, +md.slice(0, 2) - 1, +md.slice(3, 5), 12);
  const days = season.filter((p) => leap || p.md !== '02-29').map((p) => ({ ...p, t: at(p.md) }));
  if (days.length < 2) return null;
  const own = record.filter((p) => +p.day.slice(0, 4) === year);
  const lo = Math.min(...days.map((p) => p.min), ...own.map((p) => p.mean)), hi = Math.max(...days.map((p) => p.max), ...own.map((p) => p.mean));
  const pad = Math.max(0.6, (hi - lo) * 0.08);
  const min = Date.UTC(year, 0, 1), max = Date.UTC(year, 11, 31, 23);
  const DAYMS = 24 * H;
  const broken = <T extends { t: number }>(pts: readonly T[], y: (p: T) => number) => {
    const out: Array<{ x: Date; y: number | null }> = [];
    pts.forEach((p, i) => { if (i > 0 && p.t - pts[i - 1].t > 1.5 * DAYMS) out.push({ x: new Date(pts[i - 1].t + 1), y: null }); out.push({ x: new Date(p.t), y: y(p) }); });
    return out;
  };
  const Span = ({ xScale, yScale }: Ctx) => {
    const runs: Array<typeof days> = [];
    days.forEach((p, i) => { if (i > 0 && p.t - days[i - 1].t <= 1.5 * DAYMS) runs[runs.length - 1].push(p); else runs.push([p]); });
    return <g>{runs.filter((r) => r.length > 1).map((r) => <path key={r[0].t} fill={STONE} fillOpacity={0.2} d={`M${r.map((p) => `${xScale(new Date(p.t))},${yScale(p.max)}`).join('L')}L${[...r].reverse().map((p) => `${xScale(new Date(p.t))},${yScale(p.min)}`).join('L')}Z`} />)}</g>;
  };
  const Today = ({ xScale, innerHeight }: Ctx) => (
    <g pointerEvents="none">
      <line x1={xScale(new Date(nowMs))} x2={xScale(new Date(nowMs))} y1={0} y2={innerHeight} stroke={STONE} strokeWidth={1.25} strokeDasharray="2 3" />
      <text x={xScale(new Date(nowMs)) - 5} y={big ? 12.5 : 10.5} textAnchor="end" fontSize={big ? 12.5 : 10.5} fontWeight={700} fill={STONE} fontFamily={FONT}>heute</text>
    </g>
  );
  return (
    <div className="sw-chart sw-wt-season-chart" style={{ height: big ? 220 : 140 }} role="img"
      aria-label={`Jahresgang der gemessenen Wassertemperatur an der Station: Spanne und Mittel der Tagesmittel aus den vollen Jahren${own.length ? ', dazu die Tagesmittel dieses Jahres aus der eigenen Ablage' : ''}`}>
      <ResponsiveLine
        data={drawn([
          { id: 'Mittel der Jahre', data: broken(days, (p) => p.mean) },
          { id: 'Dieses Jahr', data: broken(own, (p) => p.mean) },
        ])}
        colors={(s) => (s.id === 'Dieses Jahr' ? INK : STONE)} lineWidth={big ? 1.5 : 1.25} curve="linear"
        margin={big ? { top: 12, right: 10, bottom: 28, left: 40 } : { top: 8, right: 6, bottom: 20, left: 30 }}
        xScale={{ type: 'time', min: new Date(min), max: new Date(max), useUTC: true }}
        yScale={{ type: 'linear', min: Math.floor(lo - pad), max: Math.ceil(hi + pad) }}
        theme={theme(big)} animate={false} enablePoints={false} isInteractive={false}
        enableGridX={false} gridYValues={4}
        axisBottom={{ tickSize: 0, tickPadding: big ? 8 : 4, tickValues: big ? 'every 1 month' : 'every 2 months', format: (d: Date) => MONTH_FMT.format(d) }}
        axisLeft={{ tickSize: 0, tickPadding: big ? 8 : 4, tickValues: 4, format: (v: number) => `${v}°` }}
        layers={[Span, 'grid', 'lines', Today, 'axes'] as never}
      />
    </div>
  );
}

export default WtChart;
