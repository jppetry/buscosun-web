/**
 * AW-8.2 — The nivo charts of the detail view, loaded lazily when a detail opens (gefahren §nivo): temperatures
 * (`@nivo/line`, measured and forecast as separate series, forecast dashed through an own layer, markers 0 °C and now,
 * Reif area), measured values against thresholds (`@nivo/bullet`, ranges = level cuts, measure = now, marker =
 * forecast extreme; temperature and visibility with the unfavourable side right), wind to the road axis
 * (`@nivo/polar-bar`, 8 sectors, colour = level of the cross component; axis and wind now as an own layer).
 * Every chart has `role="img"`, a summary and a visually hidden table. Animations off under `prefers-reduced-motion`.
 */
import { useMemo } from 'react';
import { ResponsiveLine, type LineCustomSvgLayerProps, type LineSeries } from '@nivo/line';
import { ResponsiveBullet, type BulletMarkersItemProps, type BulletRectsItemProps } from '@nivo/bullet';
import { ResponsivePolarBar, type PolarBarCustomLayerProps } from '@nivo/polar-bar';
import { AW_SEV, AW_FONT, AW_MONO, roadNivoTheme, useReducedMotion } from './roadNivoTheme';
import type { BulletRow, TempSeries, WindSector } from './roadHzView';
import { hm, dec } from './roadView';

// --- Temperatures −12 h … +6 h --------------------------------------------------------------------------

const toSerie = (id: string, pts: Array<[number, number]>): LineSeries => ({ id, data: pts.map(([x, y]) => ({ x, y })) });

export function TempChart({ s, slotMs }: { s: TempSeries; slotMs: number }) {
  const reduce = useReducedMotion();
  const data = useMemo(() => [toSerie('Fahrbahn', s.road), toSerie('Luft', s.air), toSerie('Taupunkt', s.dew), toSerie('Luft Prognose', s.airFc), toSerie('Taupunkt Prognose', s.dewFc)].filter((d) => d.data.length), [s]);
  const all = data.flatMap((d) => d.data.map((p) => p.y as number));
  const lo = Math.min(-4, Math.floor(Math.min(...all, 0) - 1)), hi = Math.max(8, Math.ceil(Math.max(...all, 4) + 1));
  const colorOf: Record<string, string> = { Fahrbahn: '#2C2A26', Luft: '#3A6FA8', Taupunkt: '#A89A7A', 'Luft Prognose': '#3A6FA8', 'Taupunkt Prognose': '#A89A7A' };
  // Own layers: forecast shading, Reif area (road ≤ 0 and under the dew point, measured), dashed forecast lines, now line.
  type L = LineCustomSvgLayerProps<LineSeries>;
  const Shade = ({ xScale, innerHeight }: L) => {
    const x0 = (xScale as (v: number) => number)(0), x6 = (xScale as (v: number) => number)(6);
    return <g><rect x={x0} y={0} width={Math.max(0, x6 - x0)} height={innerHeight} fill="#EEF1F4" /><text x={(x0 + x6) / 2} y={11} fontSize={8.5} fontFamily={AW_FONT} fill="#6B7A8F" textAnchor="middle">Prognose</text></g>;
  };
  const Reif = ({ xScale, yScale }: L) => {
    const X = xScale as (v: number) => number, Y = yScale as (v: number) => number;
    const dew = new Map(s.dew.map(([x, y]) => [x, y]));
    let d = '';
    for (let i = 1; i < s.road.length; i++) {
      const [x0, r0] = s.road[i - 1], [x1, r1] = s.road[i];
      const d0 = dew.get(x0), d1 = dew.get(x1);
      if (d0 == null || d1 == null || r0 > 0 || r1 > 0 || r0 >= d0 || r1 >= d1) continue;
      d += `M${X(x0)},${Y(d0)}L${X(x1)},${Y(d1)}L${X(x1)},${Y(r1)}L${X(x0)},${Y(r0)}Z`;
    }
    return d ? <path d={d} fill="#B5321F" opacity={0.18} /> : null;
  };
  const Lines = ({ xScale, yScale, series }: L) => {
    const X = xScale as (v: number) => number, Y = yScale as (v: number) => number;
    return (
      <g fill="none" strokeLinejoin="round" strokeLinecap="round">
        {series.map((se) => {
          const id = String(se.id);
          const pts = se.data.map((p) => `${X(p.data.x as number)},${Y(p.data.y as number)}`).join(' ');
          const fc = id.endsWith('Prognose');
          return <polyline key={id} points={pts} stroke={colorOf[id]} strokeWidth={id === 'Fahrbahn' ? 2.6 : id.startsWith('Taupunkt') ? 1.5 : 1.8} strokeDasharray={fc ? (id.startsWith('Taupunkt') ? '2 2' : '4 3') : id.startsWith('Taupunkt') ? '2 2' : undefined} opacity={fc ? 0.8 : 1} />;
        })}
      </g>
    );
  };
  const Now = ({ xScale, innerHeight }: L) => { const x = (xScale as (v: number) => number)(0); return <line x1={x} x2={x} y1={0} y2={innerHeight} stroke="#1F5FAE" strokeWidth={1.2} />; };
  const summary = `Fahrbahn, Luft und Taupunkt ${s.stationName ? `an ${s.stationName}` : ''} von −12 bis +6 Stunden${s.road.length ? '' : ', ohne Fahrbahnmessung'}`;
  return (
    <div className="aw-hz-chart" role="img" aria-label={summary}>
      <div className="aw-hz-chart-box">
        <ResponsiveLine data={data} margin={{ top: 14, right: 10, bottom: 22, left: 30 }} animate={!reduce} theme={roadNivoTheme}
          xScale={{ type: 'linear', min: -12, max: 6 }} yScale={{ type: 'linear', min: lo, max: hi }}
          axisBottom={{ tickValues: [-12, -6, 0, 6], format: (v) => (v === 0 ? hm(slotMs) : v > 0 ? `+${v} h` : `${String(v).replace('-', '−')} h`) }}
          axisLeft={{ tickValues: [lo, 0, 4, hi], format: (v) => `${v > 0 ? '+' : ''}${v}°` }} enableGridX={false} gridYValues={[0, 4, -4]}
          markers={[{ axis: 'y', value: 0, lineStyle: { stroke: '#B5321F', strokeDasharray: '3 3', strokeOpacity: 0.6 } }]}
          colors={(d) => colorOf[String(d.id)]} enablePoints={false} enableSlices="x" lineWidth={0}
          layers={['grid', Shade, Reif, 'markers', 'axes', Lines, Now, 'slices', 'mesh']}
          sliceTooltip={({ slice }) => (
            <div className="aw-hz-tip">{slice.points.map((p) => <div key={p.id}>{String(p.seriesId)}: {dec(Number(p.data.y))} °C</div>)}</div>
          )} />
      </div>
      <div className="aw-hz-legend">
        <span className={s.road.length ? '' : 'is-off'}><i style={{ background: '#2C2A26', height: 2.6 }} />Fahrbahn</span>
        <span><i style={{ background: '#3A6FA8', height: 2 }} />Luft (Anlage)</span>
        <span><i style={{ borderTop: '1.5px dashed #A89A7A', height: 0 }} />Taupunkt</span>
        <span><i style={{ background: '#B5321F', opacity: 0.25, height: 9, width: 12 }} />Fahrbahn ≤ 0 °C unter Taupunkt (Reif)</span>
      </div>
      <table className="aw-visually-hidden">
        <caption>{summary}</caption>
        <thead><tr><th>Stunde</th><th>Fahrbahn °C</th><th>Luft °C</th><th>Taupunkt °C</th></tr></thead>
        <tbody>{[...s.road, ...s.airFc].map(([x]) => x).filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b).map((x) => {
          const f = (arr: Array<[number, number]>) => { const p = arr.find((q) => q[0] === x); return p ? dec(p[1]) : '—'; };
          return <tr key={x}><td>{x > 0 ? `+${x}` : x}</td><td>{f(s.road)}</td><td>{x >= 0 ? f(s.airFc) : f(s.air)}</td><td>{x >= 0 ? f(s.dewFc) : f(s.dew)}</td></tr>;
        })}</tbody>
      </table>
    </div>
  );
}

// --- Thresholds (bullet) -----------------------------------------------------------------------------------

const Range = ({ x, y, width, height, data }: BulletRectsItemProps) => <rect x={x} y={y} width={Math.max(0, width)} height={height} fill={data.index === 0 ? '#F5F1E8' : AW_SEV[Math.min(3, data.index) as 1 | 2 | 3].bg} opacity={data.index === 0 ? 1 : 0.55} rx={2} />;
const Measure = ({ x, y, width, height }: BulletRectsItemProps) => <rect x={x} y={y + height * 0.28} width={Math.max(0, width)} height={height * 0.44} fill="#2C2A26" rx={2} />;
const Marker = ({ x, y, size }: BulletMarkersItemProps) => <rect x={x - 1} y={y - size / 2} width={2} height={size} fill="#1F5FAE" />;

export function ThresholdBullets({ rows }: { rows: BulletRow[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="aw-hz-bullets">
      {rows.map((r) => {
        // The axis runs lo → hi; "ungünstig = rechts": temperature and visibility have lo > hi and are mapped onto 0 … 1.
        const span = r.hi - r.lo;
        const P = (v: number) => Math.max(0, Math.min(1, (v - r.lo) / span));
        const ranges = [0, ...r.cuts.map(P), 1];
        const data = [{ id: r.id, ranges, measures: r.value == null ? [] : [P(r.value)], markers: r.fc == null ? [] : [P(r.fc)] }];
        const summary = `${r.label}: jetzt ${r.valueText}, ${r.fcText}`;
        return (
          <div key={r.id} className="aw-hz-bullet" role="img" aria-label={summary}>
            <div className="aw-hz-bullet-head"><span>{r.label}</span><span><strong>{r.valueText}</strong> · {r.fcText}</span></div>
            <div className="aw-hz-bullet-box">
              <ResponsiveBullet data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} animate={!reduce} minValue={0} maxValue={1} spacing={0} theme={roadNivoTheme}
                titlePosition="before" titleAlign="start" titleOffsetX={0} measureSize={0.5} markerSize={0.9} rangeComponent={Range} measureComponent={Measure} markerComponent={Marker}
                rangeColors="seq:greys" measureColors="#2C2A26" markerColors="#1F5FAE" isInteractive={false} />
            </div>
          </div>
        );
      })}
      <table className="aw-visually-hidden">
        <caption>Messgrößen gegen Schwellen</caption>
        <thead><tr><th>Größe</th><th>jetzt</th><th>Prognose</th><th>Stufenschwellen</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td>{r.label}</td><td>{r.valueText}</td><td>{r.fcText}</td><td>{r.cuts.join(' / ')}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// --- Wind to the road axis (polar bar) --------------------------------------------------------------------

export function WindPolar({ w }: { w: { sectors: WindSector[]; axisDeg: number; nowDeg: number | null; nowGust: number | null; fcMax: number | null } }) {
  const reduce = useReducedMotion();
  const data = w.sectors.map((s) => ({ sector: s.sector, gust: s.gust, lv: s.lv }));
  const maxV = Math.max(40, ...w.sectors.map((s) => s.gust));
  const Axis = ({ center, outerRadius }: PolarBarCustomLayerProps) => {
    const a = ((w.axisDeg - 90) * Math.PI) / 180;
    const [cx, cy] = center;
    const r = outerRadius + 4;
    const now = w.nowDeg == null ? null : (((w.nowDeg - 90) * Math.PI) / 180);
    const rr = outerRadius * 0.92;
    return (
      <g>
        <line x1={cx - r * Math.cos(a)} y1={cy - r * Math.sin(a)} x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)} stroke="#2C2A26" strokeWidth={5} strokeLinecap="round" opacity={0.85} />
        <line x1={cx - r * Math.cos(a)} y1={cy - r * Math.sin(a)} x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)} stroke="#FAF6EA" strokeWidth={1} strokeDasharray="3 3" />
        {now != null && <circle cx={cx + rr * Math.cos(now)} cy={cy + rr * Math.sin(now)} r={4.5} fill="#1F5FAE" stroke="#FFFFFF" strokeWidth={1.5} />}
        {(['N', 'O', 'S', 'W'] as const).map((n, i) => { const t = ((i * 90 - 90) * Math.PI) / 180; return <text key={n} x={cx + (outerRadius + 11) * Math.cos(t)} y={cy + (outerRadius + 11) * Math.sin(t) + 3} fontSize={9} fontFamily={AW_FONT} fill="#8B7355" textAnchor="middle">{n}</text>; })}
      </g>
    );
  };
  const summary = `Böen nach Richtung: jetzt ${w.nowGust != null ? `${w.nowGust} km/h aus ${w.nowDeg}°` : 'keine Messung'}, Prognose bis ${w.fcMax ?? '—'} km/h; Fahrbahnachse ${w.axisDeg}°`;
  return (
    <div className="aw-hz-wind" role="img" aria-label={summary}>
      <div className="aw-hz-wind-box">
        <ResponsivePolarBar data={data} keys={['gust']} indexBy="sector" valueSteps={[0, maxV]} margin={{ top: 16, right: 16, bottom: 16, left: 16 }} animate={!reduce} theme={roadNivoTheme}
          innerRadius={0.18} startAngle={-22.5} endAngle={337.5} colors={(d) => AW_SEV[w.sectors.find((s) => s.sector === d.index)?.lv ?? 0].bg} borderWidth={1} borderColor="#FAF6EA"
          enableRadialGrid enableCircularGrid={false} radialAxis={null} circularAxisInner={null} circularAxisOuter={null}
          layers={['grid', 'arcs', Axis]} isInteractive={false} enableArcLabels={false} />
      </div>
      <table className="aw-visually-hidden">
        <caption>{summary}</caption>
        <thead><tr><th>Sektor</th><th>Böe km/h</th><th>Stufe quer</th></tr></thead>
        <tbody>{w.sectors.map((s) => <tr key={s.sector}><td>{s.sector}</td><td>{s.gust}</td><td>{s.lv}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export { AW_MONO };
