/**
 * GL-4 — charts of the sheet: snow line per scene against the 2000–2025 band, cumulative length change, projection ranges per scenario, freezing level against the
 * glacier's height, and the melt-index bars. `@nivo/line` with its own layers for bands; the bars are plain SVG (plan A11: no `@nivo/bar`).
 * Every chart carries `data-origin` and a text alternative.
 */
import { useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { fmt0, fmt1 } from './glacierView';
import { dateDe, type Scene, type CumPoint, type ProjectionView } from './glacierSheetModel';
import type { Triple } from './glacierMeltContract';

const THEME = {
  text: { fontFamily: "'League Spartan', system-ui, sans-serif", fontSize: 12, fill: '#5C5447' },
  grid: { line: { stroke: '#E8DFC9', strokeWidth: 1 } },
  axis: { ticks: { line: { stroke: 'transparent' } }, domain: { line: { stroke: '#9D8F6E', strokeWidth: 1 } } },
};
const MONTHS = [['Mai', 121], ['Jun', 152], ['Jul', 182], ['Aug', 213], ['Sep', 244], ['Okt', 274]] as const;
type ScaleFn = (v: number) => number;
interface LayerArgs { xScale: ScaleFn; yScale: ScaleFn; innerWidth: number; innerHeight: number }

// --- snow line per scene -------------------------------------------------------------------------------------------------------------------
export interface BandPoint { doy: number; p10: number; p50: number; p90: number }
export function SeasonChart({ scenes, band, zRange }: { scenes: readonly Scene[]; band: readonly BandPoint[]; zRange: [number, number] }) {
  const pts = useMemo(() => scenes.filter((s) => s.state === 1 && s.sla != null).map((s) => ({ x: s.doy, y: s.sla as number, date: s.date, aar: s.aar, clear: s.clear, fresh: s.flags.includes('neuschnee') })), [scenes]);
  const edges = scenes.filter((s) => s.state !== 1);
  const ys = [...pts.map((p) => p.y), ...band.flatMap((b) => [b.p10, b.p90]), zRange[0], zRange[1]];
  const yMin = Math.floor((Math.min(...ys) - 100) / 100) * 100, yMax = Math.ceil((Math.max(...ys) + 100) / 100) * 100;
  const layer = ({ xScale, yScale }: LayerArgs) => {
    if (band.length < 2) return null;
    const up = band.map((b) => `${xScale(b.doy)},${yScale(b.p90)}`), dn = [...band].reverse().map((b) => `${xScale(b.doy)},${yScale(b.p10)}`);
    return (
      <g aria-hidden="true">
        <polygon points={[...up, ...dn].join(' ')} fill="#CFC6EE" fillOpacity={0.45} />
        <polyline points={band.map((b) => `${xScale(b.doy)},${yScale(b.p50)}`).join(' ')} fill="none" stroke="#6B5BB8" strokeWidth={1.4} strokeDasharray="5 3" />
        {pts.filter((p) => p.fresh).map((p) => <circle key={`f${p.date}`} cx={xScale(p.x)} cy={yScale(p.y)} r={8} fill="none" stroke="#4B3D96" strokeWidth={1.2} strokeDasharray="2 2" />)}
        {edges.map((s) => <g key={s.date}><circle cx={xScale(s.doy)} cy={yScale(s.state === 0 ? yMin + (yMax - yMin) * 0.04 : yMax - (yMax - yMin) * 0.04)} r={4} fill="#fff" stroke="#4B3D96" strokeWidth={1.6} /></g>)}
      </g>
    );
  };
  const empty = pts.length === 0 && edges.length === 0;
  return (
    <div className="gl-chart gl-chart-s" role="img" data-origin="satellite" data-scenes={scenes.length}
      aria-label={`Schneegrenze je klarer Szene in m ü. M.: ${pts.map((p) => `${dateDe(p.date)} ${fmt0(p.y)} m`).join(', ') || 'keine Szene mit Schneegrenze'}. ${band.length ? 'Dahinter das Band 2000 bis 2025 (p10 bis p90) und der Median.' : 'Ein Band 2000 bis 2025 liegt für diesen Gletscher nicht vor.'}`}>
      {empty ? <div className="gl-empty">Keine klare Szene in dieser Saison.</div> : (
        <ResponsiveLine
          data={[{ id: 'Szenen', data: pts }]} colors={['#4B3D96']} lineWidth={2} margin={{ top: 10, right: 12, bottom: 26, left: 48 }}
          xScale={{ type: 'linear', min: 121, max: 290 }} yScale={{ type: 'linear', min: yMin, max: yMax }} theme={THEME} animate={false}
          enableGridX={false} gridYValues={5} useMesh pointSize={7} pointColor="#fff" pointBorderWidth={2} pointBorderColor="#4B3D96"
          axisBottom={{ tickSize: 0, tickPadding: 6, tickValues: MONTHS.map((m) => m[1]), format: (v: number) => MONTHS.find((m) => m[1] === v)?.[0] ?? '' }}
          axisLeft={{ tickSize: 0, tickPadding: 6, tickValues: 5, format: (v: number) => fmt0(v) }}
          layers={['grid', 'axes', layer, 'lines', 'points', 'mesh']}
          tooltip={({ point }) => { const d = point.data as unknown as { date: string; y: number; aar: number | null; clear: number; fresh: boolean }; return <div className="gl-tip"><b>{dateDe(d.date)}</b>: Schneegrenze {fmt0(d.y)} m<small>klar {Math.round(d.clear * 100)} % der Fläche{d.aar != null ? ` · AAR ${fmt1(d.aar * 100)} %` : ''}{d.fresh ? ' · Neuschnee: Grenze der frischen Decke' : ''}</small></div>; }}
        />
      )}
    </div>
  );
}

// --- cumulative length ---------------------------------------------------------------------------------------------------------------------
const FONT = "'League Spartan', system-ui, sans-serif";
/** A "nice" tick step (1, 2, 2.5, 5 × 10ⁿ) that gives about `target` ticks over `span`. */
function niceStep(span: number, target = 5): number {
  const raw = Math.max(1e-9, span) / target, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}
/** Light halo behind chart text, so it stays readable on top of lines and areas. */
const HALO = { paintOrder: 'stroke', stroke: '#FAF6EA', strokeWidth: 4, strokeLinejoin: 'round' } as const;

export function LengthChart({ points }: { points: readonly CumPoint[] }) {
  const first = points[0], last = points[points.length - 1];
  const minCum = Math.min(...points.map((p) => p.cum), 0);
  const step = niceStep(-minCum || 100, 4);
  const lo = -Math.ceil((-minCum || 100) / step) * step;
  const yTicks: number[] = [];
  for (let v = 0; v >= lo - 1e-9; v -= step) yTicks.push(Math.round(v * 100) / 100);
  const span = last.year - first.year, xStep = span > 100 ? 20 : span > 50 ? 10 : 5;
  const xTicks: number[] = [];
  for (let y = Math.ceil(first.year / xStep) * xStep; y <= last.year; y += xStep) xTicks.push(y);
  const layer = ({ xScale, yScale, innerWidth }: LayerArgs) => {
    const ex = xScale(last.year), ey = yScale(last.cum);
    return (
      <g aria-hidden="true" fontFamily={FONT}>
        <line x1={0} x2={innerWidth} y1={yScale(0)} y2={yScale(0)} stroke="#9D8F6E" strokeWidth={1.4} />
        <text x={4} y={yScale(0) + 15} fontSize={12} fill="#5C5447" {...HALO}>Stand {first.year}: 0 m</text>
        <text x={4} y={yScale(0) + 15} fontSize={12} fill="#5C5447">Stand {first.year}: 0 m</text>
        <circle cx={ex} cy={ey} r={5} fill="#fff" stroke="#B5602C" strokeWidth={2.4} />
        <text x={ex - 9} y={ey - 10} fontSize={14} fontWeight={700} textAnchor="end" fill="#8A4519" {...HALO}>{fmt0(last.cum)} m</text>
        <text x={ex - 9} y={ey - 10} fontSize={14} fontWeight={700} textAnchor="end" fill="#8A4519">{fmt0(last.cum)} m</text>
        <text x={ex - 9} y={ey + 6} fontSize={11.5} textAnchor="end" fill="#5C5447" {...HALO}>bis {last.year}</text>
        <text x={ex - 9} y={ey + 6} fontSize={11.5} textAnchor="end" fill="#5C5447">bis {last.year}</text>
      </g>
    );
  };
  return (
    <div className="gl-chart gl-chart-s" style={{ height: 244 }} role="img" data-origin="measured"
      aria-label={`Längenänderung der Zunge, kumuliert in m, ${first.year} bis ${last.year}: ${fmt0(last.cum)} m`}>
      <ResponsiveLine
        data={[{ id: 'Länge', data: points.map((p) => ({ x: p.year, y: p.cum })) }]} colors={['#B5602C']} lineWidth={2.8} margin={{ top: 14, right: 16, bottom: 30, left: 64 }}
        xScale={{ type: 'linear', min: first.year, max: last.year }} yScale={{ type: 'linear', min: lo, max: 0 }} theme={THEME} animate={false}
        enablePoints={false} enableGridX={false} gridYValues={yTicks} useMesh enableArea areaOpacity={0.16} areaBaselineValue={0} enableCrosshair crosshairType="x"
        axisBottom={{ tickSize: 0, tickPadding: 8, tickValues: xTicks, format: (v: number) => String(v) }}
        axisLeft={{ tickSize: 0, tickPadding: 8, tickValues: yTicks, format: (v: number) => `${fmt0(v)} m` }}
        layers={['grid', 'axes', 'areas', 'lines', layer, 'crosshair', 'mesh']}
        tooltip={({ point }) => <div className="gl-tip"><b>{(point.data as { x: number }).x}</b>: {fmt0((point.data as { y: number }).y)} m<small>Zunge kürzer als {first.year}</small></div>}
      />
    </div>
  );
}

// --- projection ----------------------------------------------------------------------------------------------------------------------------
const SSP_COLOUR: Record<string, string> = { ssp126: '#1E87A8', ssp245: '#B8862F', ssp370: '#B5602C', ssp585: '#7E3C17' };
export function ProjectionChart({ view }: { view: ProjectionView }) {
  const lastYear = view.years[view.years.length - 1];
  const layer = ({ xScale, yScale }: LayerArgs) => (
    <g aria-hidden="true">
      {view.scenarios.map((s) => (
        <polygon key={s.key} fill={SSP_COLOUR[s.key] ?? '#999'} fillOpacity={0.12}
          points={[...view.years.map((y, i) => `${xScale(y)},${yScale(s.p90[i])}`), ...[...view.years].reverse().map((y, i) => `${xScale(y)},${yScale(s.p10[view.years.length - 1 - i])}`)].join(' ')} />
      ))}
    </g>
  );
  // Band under 10 % ("practically gone") and the end values (median 2100) at the line ends, pushed apart where they would touch.
  const guides = ({ xScale, yScale, innerWidth }: LayerArgs) => {
    const ends = view.scenarios.map((s) => ({ key: s.key, v: s.p50[s.p50.length - 1], y: yScale(s.p50[s.p50.length - 1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
    return (
      <g aria-hidden="true" fontFamily={FONT}>
        <rect x={0} width={innerWidth} y={yScale(10)} height={Math.max(0, yScale(0) - yScale(10))} fill="#9D8F6E" fillOpacity={0.14} />
        <line x1={0} x2={innerWidth} y1={yScale(10)} y2={yScale(10)} stroke="#7A6B57" strokeWidth={1.2} strokeDasharray="5 3" />
        <text x={4} y={yScale(10) - 6} fontSize={12} fill="#5C5447" {...HALO}>unter 10 % ≈ so gut wie weg</text>
        <text x={4} y={yScale(10) - 6} fontSize={12} fill="#5C5447">unter 10 % ≈ so gut wie weg</text>
        {ends.map((e) => (
          <g key={e.key}>
            <circle cx={xScale(lastYear)} cy={yScale(e.v)} r={3.5} fill={SSP_COLOUR[e.key] ?? '#999'} />
            <text x={xScale(lastYear) + 8} y={e.y + 4} fontSize={12.5} fontWeight={700} fill={SSP_COLOUR[e.key] ?? '#999'}>{Math.round(e.v)} %</text>
          </g>
        ))}
      </g>
    );
  };
  return (
    <div className="gl-chart gl-chart-s" style={{ height: 262 }} role="img" data-origin="model" aria-label={`Volumen in Prozent von 2020 bis 2100 je Szenario (Median und Spanne p10 bis p90 über 12 Klimamodelle): ${view.scenarios.map((s) => `${s.label} 2100 ${Math.round(s.p50[s.p50.length - 1])} % (${Math.round(s.p10[s.p10.length - 1])} bis ${Math.round(s.p90[s.p90.length - 1])} %)`).join('; ')}`}>
      <ResponsiveLine
        data={view.scenarios.map((s) => ({ id: s.label, data: view.years.map((y, i) => ({ x: y, y: s.p50[i] })) }))} colors={view.scenarios.map((s) => SSP_COLOUR[s.key] ?? '#999')}
        lineWidth={2.6} margin={{ top: 14, right: 48, bottom: 30, left: 52 }} xScale={{ type: 'linear', min: view.years[0], max: lastYear }}
        yScale={{ type: 'linear', min: 0, max: 100 }} theme={THEME} animate={false} enablePoints={false} enableGridX={false} gridYValues={[0, 20, 40, 60, 80, 100]} useMesh enableCrosshair crosshairType="x"
        axisBottom={{ tickSize: 0, tickPadding: 8, tickValues: [2020, 2040, 2060, 2080, 2100], format: (v: number) => String(v) }} axisLeft={{ tickSize: 0, tickPadding: 8, tickValues: [0, 20, 40, 60, 80, 100], format: (v: number) => `${v} %` }}
        layers={['grid', 'axes', layer, guides, 'lines', 'crosshair', 'mesh']}
        tooltip={({ point }) => <div className="gl-tip"><b>{point.seriesId} · {(point.data as { x: number }).x}</b>: {fmt0((point.data as { y: number }).y)} % des Volumens von 2020<small>Median über 12 Klimamodelle</small></div>}
      />
    </div>
  );
}

// --- freezing level against the glacier height ----------------------------------------------------------------------------------------------
export function FreezeChart({ zf, zRange, labels }: { zf: ReadonlyArray<number | null>; zRange: [number, number, number]; labels: readonly string[] }) {
  const data = zf.map((v, i) => ({ x: i, y: v })).filter((d): d is { x: number; y: number } => d.y != null);
  const ys = [...data.map((d) => d.y), zRange[0], zRange[2]];
  const yMin = Math.floor((Math.min(...ys) - 200) / 500) * 500, yMax = Math.ceil((Math.max(...ys) + 200) / 500) * 500;
  const layer = ({ yScale, innerWidth }: LayerArgs) => (
    <g aria-hidden="true">
      <rect x={0} width={innerWidth} y={yScale(zRange[2])} height={Math.max(0, yScale(zRange[0]) - yScale(zRange[2]))} fill="#A9D4E2" fillOpacity={0.35} />
      <line x1={0} x2={innerWidth} y1={yScale(zRange[1])} y2={yScale(zRange[1])} stroke="#145A70" strokeWidth={1} strokeDasharray="4 3" />
      <text x={4} y={yScale(zRange[2]) + 12} fontSize={10} fill="#145A70">Gletscher {fmt0(zRange[0])}–{fmt0(zRange[2])} m</text>
    </g>
  );
  return (
    <div className="gl-chart gl-chart-s" role="img" data-origin="model"
      aria-label={`Nullgradgrenze, Tagesmaximum der nächsten ${zf.length} Tage in m ü. M.: ${data.map((d) => `${labels[d.x] ?? d.x} ${fmt0(d.y)} m`).join(', ')}. Der Gletscher liegt zwischen ${fmt0(zRange[0])} und ${fmt0(zRange[2])} m.`}>
      <ResponsiveLine
        data={[{ id: 'Nullgradgrenze', data }]} colors={['#B8862F']} lineWidth={2.4} margin={{ top: 10, right: 12, bottom: 26, left: 52 }} xScale={{ type: 'linear', min: 0, max: Math.max(1, zf.length - 1) }}
        yScale={{ type: 'linear', min: yMin, max: yMax }} theme={THEME} animate={false} enableGridX={false} gridYValues={5} useMesh pointSize={5} pointColor="#fff" pointBorderWidth={2} pointBorderColor="#B8862F"
        axisBottom={{ tickSize: 0, tickPadding: 6, tickValues: [0, 3, 6, 9, 12], format: (v: number) => labels[v] ?? '' }} axisLeft={{ tickSize: 0, tickPadding: 6, tickValues: 5, format: (v: number) => fmt0(v) }}
        layers={['grid', 'axes', layer, 'lines', 'points', 'mesh']}
        tooltip={({ point }) => <div className="gl-tip"><b>{labels[(point.data as { x: number }).x]}</b>: Nullgradgrenze bis {fmt0((point.data as { y: number }).y)} m<small>Modell · Tagesmaximum</small></div>}
      />
    </div>
  );
}

// --- melt index bars (plain SVG) --------------------------------------------------------------------------------------------------------------
export function MeltBars({ idx, labels, today }: { idx: readonly Triple[]; labels: readonly string[]; today: number | null }) {
  const W = 360, H = 130, L = 28, B = 22, T = 8, R = 6;
  const bw = (W - L - R) / idx.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / 100);
  return (
    <svg className="gl-bars" viewBox={`0 0 ${W} ${H}`} role="img" data-origin="model" preserveAspectRatio="xMidYMid meet"
      aria-label={`Schmelzindex je Tag von 0 bis 100 (ohne Einheit), Median und Spanne p10 bis p90: ${idx.map((t, i) => `${labels[i]} ${t[1]} (${t[0]} bis ${t[2]})`).join(', ')}`}>
      {[0, 50, 100].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#E0D6BE" /><text x={L - 4} y={y(v) + 3} fontSize="9" textAnchor="end" fill="#5C5447" fontFamily="'League Spartan', system-ui, sans-serif">{v}</text></g>)}
      {idx.map((t, i) => {
        const x = L + i * bw + bw * 0.18, w = bw * 0.64;
        return (
          <g key={i}>
            <rect x={x} y={y(t[1])} width={w} height={Math.max(0.5, y(0) - y(t[1]))} rx={2} fill={i === today ? '#145A70' : '#7FC1D6'} />
            <line x1={x + w / 2} x2={x + w / 2} y1={y(t[2])} y2={y(t[0])} stroke="#2C2A26" strokeWidth={1} />
            <text x={x + w / 2} y={H - 8} fontSize="9" textAnchor="middle" fill="#5C5447" fontFamily="'League Spartan', system-ui, sans-serif">{labels[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}
