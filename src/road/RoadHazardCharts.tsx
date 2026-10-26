/**
 * AW-8.2 — The charts of the detail view, loaded lazily when a detail opens (gefahren §nivo): temperatures
 * (`@nivo/line`, measured and forecast as separate series, forecast dashed through an own layer, markers 0 °C and now,
 * Reif area, the current values written at the line ends, a reading aid above), measured values against thresholds
 * (plain HTML tracks: the level zones in their colours, the cuts labelled in the unit of the quantity, now = dot,
 * forecast = tick; „ungünstig = rechts“), wind to the road axis (`@nivo/polar-bar`, 8 sectors, colour = level of the
 * cross component; axis and wind now as an own layer). Every chart has `role="img"`, a summary and a visually hidden
 * table. Animations off under `prefers-reduced-motion`.
 */
import { useMemo } from 'react';
import { ResponsiveLine, type LineCustomSvgLayerProps, type LineSeries } from '@nivo/line';
import { ResponsivePolarBar, type PolarBarCustomLayerProps } from '@nivo/polar-bar';
import { AW_SEV, AW_FONT, AW_MONO, roadNivoTheme, useReducedMotion } from './roadNivoTheme';
import type { BulletRow, TempSeries, WindSector } from './roadHzView';
import { hm, dec } from './roadView';

// --- Temperatures −12 h … +6 h --------------------------------------------------------------------------

const toSerie = (id: string, pts: Array<[number, number]>): LineSeries => ({ id, data: pts.map(([x, y]) => ({ x, y })) });
const sgn = (v: number) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : '±'}${dec(Math.abs(v))}`;
const last = (a: Array<[number, number]>) => (a.length ? a[a.length - 1][1] : null);

/** A larger type for the dossier charts (the theme of the rail stays small). */
const bigTheme = {
  ...roadNivoTheme,
  text: { ...roadNivoTheme.text, fontSize: 12 },
  axis: { ...roadNivoTheme.axis, ticks: { ...roadNivoTheme.axis.ticks, text: { ...roadNivoTheme.axis.ticks.text, fontSize: 11.5, fill: '#8B7355' } } },
};

/** Reading aid: road against the dew point — the one comparison that says whether moisture settles (and freezes). */
function dewReading(road: number | null, dew: number | null): { tone: 'ok' | 'near' | 'warn'; text: string } {
  if (road == null || dew == null) return { tone: 'near', text: 'Ohne Fahrbahn- und Taupunktmessung ist keine Aussage zur Feuchte auf der Fahrbahn möglich.' };
  const d = road - dew;
  if (d > 3) return { tone: 'ok', text: `Die Fahrbahn ist ${dec(d)} K wärmer als der Taupunkt — es schlägt sich keine Feuchte nieder.` };
  if (d > 0) return { tone: 'near', text: `Die Fahrbahn liegt nur ${dec(d)} K über dem Taupunkt — kühlt sie weiter ab, kann sich Feuchte niederschlagen.` };
  return road <= 0
    ? { tone: 'warn', text: 'Die Fahrbahn ist kälter als der Taupunkt und höchstens 0 °C — Reif kann sich bilden.' }
    : { tone: 'near', text: 'Die Fahrbahn ist kälter als der Taupunkt — Tau schlägt sich nieder; über 0 °C wird sie nass, nicht glatt.' };
}

export function TempChart({ s, slotMs }: { s: TempSeries; slotMs: number }) {
  const reduce = useReducedMotion();
  const data = useMemo(() => [toSerie('Fahrbahn', s.road), toSerie('Luft', s.air), toSerie('Taupunkt', s.dew), toSerie('Luft Prognose', s.airFc), toSerie('Taupunkt Prognose', s.dewFc), toSerie('Fahrbahn Prognose', s.rsFc)].filter((d) => d.data.length), [s]);
  const all = data.flatMap((d) => d.data.map((p) => p.y as number));
  const lo = Math.min(-2, Math.floor(Math.min(...all, 0) - 1)), hi = Math.max(6, Math.ceil(Math.max(...all, 4) + 1));
  const step = hi - lo > 24 ? 5 : hi - lo > 10 ? 2 : 1;
  const yTicks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(v);
  const colorOf: Record<string, string> = { Fahrbahn: '#2C2A26', Luft: '#3A6FA8', Taupunkt: '#A0884F', 'Luft Prognose': '#3A6FA8', 'Taupunkt Prognose': '#A0884F', 'Fahrbahn Prognose': '#2C2A26' };
  const nowRoad = last(s.road), nowAir = last(s.air), nowDew = last(s.dew);
  const reading = dewReading(nowRoad, nowDew);
  // Own layers: forecast shading, Reif area (road ≤ 0 and under the dew point, measured), dashed forecast lines, now line, end labels.
  type L = LineCustomSvgLayerProps<LineSeries>;
  const Shade = ({ xScale, innerHeight }: L) => {
    const x0 = (xScale as (v: number) => number)(0), x6 = (xScale as (v: number) => number)(6);
    return <g><rect x={x0} y={0} width={Math.max(0, x6 - x0)} height={innerHeight} fill="#EEF1F4" /><text x={(x0 + x6) / 2} y={-8} fontSize={11.5} fontWeight={600} fontFamily={AW_FONT} fill="#6B7A8F" textAnchor="middle">Prognose</text></g>;
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
          return <polyline key={id} points={pts} stroke={colorOf[id]} strokeWidth={id === 'Fahrbahn' ? 3.2 : id.startsWith('Taupunkt') ? 2 : 2.4} strokeDasharray={fc ? (id.startsWith('Taupunkt') ? '2 3' : '5 4') : id.startsWith('Taupunkt') ? '3 3' : undefined} opacity={fc ? 0.8 : 1} />;
        })}
      </g>
    );
  };
  const Now = ({ xScale, innerHeight }: L) => {
    const x = (xScale as (v: number) => number)(0);
    return <g><line x1={x} x2={x} y1={0} y2={innerHeight} stroke="#1F5FAE" strokeWidth={1.5} /><text x={x} y={-8} fontSize={11.5} fontWeight={700} fontFamily={AW_FONT} fill="#1F5FAE" textAnchor="middle">jetzt</text></g>;
  };
  // The current value of each measured line, written next to its last point (pushed apart so they never overlap).
  const Ends = ({ xScale, yScale }: L) => {
    const X = xScale as (v: number) => number, Y = yScale as (v: number) => number;
    const items = ([['Fahrbahn', s.road], ['Luft', s.air], ['Taupunkt', s.dew]] as const)
      .filter(([, a]) => a.length).map(([id, a]) => { const [x, y] = a[a.length - 1]; return { id, x: X(x), y: Y(y), v: y }; })
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 15) items[i].y = items[i - 1].y + 15;
    return (
      <g fontFamily={AW_FONT} fontSize={12} fontWeight={700}>
        {items.map((it) => (
          <g key={it.id}>
            <circle cx={it.x} cy={Y(it.v)} r={3.5} fill={colorOf[it.id]} stroke="#FFFFFF" strokeWidth={1.5} />
            <text x={it.x + 8} y={it.y + 4} fill={colorOf[it.id]} stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke">{it.id} {sgn(it.v)}°</text>
          </g>
        ))}
      </g>
    );
  };
  const summary = `Fahrbahn, Luft und Taupunkt ${s.stationName ? `an ${s.stationName}` : ''} von −12 bis +6 Stunden${s.road.length ? '' : ', ohne Fahrbahnmessung'}`;
  return (
    <div className="aw-hz-chart" role="img" aria-label={summary}>
      <div className="aw-hz-tstats">
        <span><em>Fahrbahn</em><b>{nowRoad != null ? `${sgn(nowRoad)} °C` : '—'}</b></span>
        <span><em>Luft</em><b style={{ color: '#3A6FA8' }}>{nowAir != null ? `${sgn(nowAir)} °C` : '—'}</b></span>
        <span><em>Taupunkt</em><b style={{ color: '#A0884F' }}>{nowDew != null ? `${sgn(nowDew)} °C` : '—'}</b></span>
        <span><em>Fahrbahn – Taupunkt</em><b>{nowRoad != null && nowDew != null ? `${sgn(nowRoad - nowDew)} K` : '—'}</b></span>
      </div>
      <p className={`aw-hz-reading is-${reading.tone}`}>{reading.text}{s.stationName ? ` (Messstelle ${s.stationName})` : ''}</p>
      <div className="aw-hz-chart-box">
        <ResponsiveLine data={data} margin={{ top: 24, right: 96, bottom: 30, left: 40 }} animate={!reduce} theme={bigTheme}
          xScale={{ type: 'linear', min: -12, max: 6 }} yScale={{ type: 'linear', min: lo, max: hi }}
          axisBottom={{ tickValues: [-12, -9, -6, -3, 0, 3, 6], tickSize: 0, tickPadding: 10, format: (v) => (v === 0 ? hm(slotMs) : v > 0 ? `+${v} h` : `${String(v).replace('-', '−')} h`) }}
          axisLeft={{ tickValues: yTicks, tickSize: 0, tickPadding: 8, format: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v as number)}°` }} enableGridX={false} gridYValues={yTicks}
          markers={[{ axis: 'y', value: 0, lineStyle: { stroke: '#B5321F', strokeDasharray: '4 3', strokeOpacity: 0.7, strokeWidth: 1.4 }, legend: '0 °C', legendPosition: 'top-left', textStyle: { fill: '#B5321F', fontSize: 11, fontFamily: AW_FONT } }]}
          colors={(d) => colorOf[String(d.id)]} enablePoints={false} enableSlices="x" lineWidth={0}
          layers={['grid', Shade, Reif, 'markers', 'axes', Lines, Now, Ends, 'slices', 'mesh']}
          sliceTooltip={({ slice }) => (
            <div className="aw-hz-tip">{slice.points.map((p) => <div key={p.id}>{String(p.seriesId)}: {dec(Number(p.data.y))} °C</div>)}</div>
          )} />
      </div>
      <div className="aw-hz-legend">
        <span className={s.road.length ? '' : 'is-off'}><i style={{ background: '#2C2A26', height: 3 }} />Fahrbahn (gemessen)</span>
        <span><i style={{ background: '#3A6FA8', height: 2.4 }} />Luft · gestrichelt = Prognose</span>
        <span><i style={{ borderTop: '2px dashed #A0884F', height: 0 }} />Taupunkt</span>
        {s.rsFc.length > 0 && <span><i style={{ borderTop: '2px dashed #2C2A26', height: 0 }} />Fahrbahn · buscosun Fusion, berechnet</span>}
        <span><i style={{ background: '#B5321F', opacity: 0.25, height: 10, width: 14 }} />Reif möglich: Fahrbahn ≤ 0 °C und unter dem Taupunkt</span>
      </div>
      <table className="aw-visually-hidden">
        <caption>{summary}</caption>
        <thead><tr><th>Stunde</th><th>Fahrbahn °C</th>{s.rsFc.length > 0 && <th>Fahrbahn Fusion °C</th>}<th>Luft °C</th><th>Taupunkt °C</th></tr></thead>
        <tbody>{[...s.road, ...s.airFc].map(([x]) => x).filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b).map((x) => {
          const f = (arr: Array<[number, number]>) => { const p = arr.find((q) => q[0] === x); return p ? dec(p[1]) : '—'; };
          return <tr key={x}><td>{x > 0 ? `+${x}` : x}</td><td>{f(s.road)}</td>{s.rsFc.length > 0 && <td>{x >= 0 ? f(s.rsFc) : '—'}</td>}<td>{x >= 0 ? f(s.airFc) : f(s.air)}</td><td>{x >= 0 ? f(s.dewFc) : f(s.dew)}</td></tr>;
        })}</tbody>
      </table>
    </div>
  );
}

// --- Thresholds ---------------------------------------------------------------------------------------------

const UNIT: Record<string, string> = { rs: '°C', wf: 'mm', vis: 'm', quer: 'km/h' };
const cutText = (id: string, v: number) => (id === 'rs' ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}°` : id === 'wf' ? dec(v, v < 1 ? 1 : 0) : String(v));

/**
 * One track per quantity: the zones „unter Stufe 1“ and Stufe 1 / 2 / 3 in their colours, the cuts written in the unit
 * of the quantity, now = dot, forecast extreme = blue tick; right is always the unfavourable side.
 */
export function ThresholdBullets({ rows }: { rows: BulletRow[] }) {
  return (
    <div className="aw-hz-thrs">
      {rows.map((r) => {
        const span = r.hi - r.lo;
        const P = (v: number) => Math.max(0, Math.min(1, (v - r.lo) / span));
        const cutsP = r.cuts.map(P);
        const zones = [0, ...cutsP, 1];
        const lvNow = r.value == null ? null : cutsP.filter((c) => P(r.value as number) >= c).length;
        const status = lvNow == null ? 'keine Messung' : lvNow === 0 ? 'unter der ersten Schwelle' : `Stufe ${lvNow} erreicht`;
        const summary = `${r.label}: jetzt ${r.valueText}, ${status}, ${r.fcText}`;
        return (
          <div key={r.id} className="aw-hz-thr" role="img" aria-label={summary}>
            <div className="aw-hz-thr-head">
              <span className="aw-hz-thr-l">{r.label} <small>{UNIT[r.id]}</small></span>
              <span className="aw-hz-thr-v">{r.valueText}</span>
              <span className={`aw-hz-thr-st is-${lvNow == null ? 'na' : lvNow}`}>{status}</span>
            </div>
            <div className="aw-hz-thr-track">
              {zones.slice(0, -1).map((z, i) => (
                <span key={i} className="aw-hz-thr-zone" style={{ left: `${z * 100}%`, width: `${(zones[i + 1] - z) * 100}%`, background: i === 0 ? '#EDE6D3' : AW_SEV[Math.min(3, i) as 1 | 2 | 3].bg, opacity: i === 0 ? 1 : 0.7 }} />
              ))}
              {r.fc != null && <span className="aw-hz-thr-fc" style={{ left: `${P(r.fc) * 100}%` }} title={r.fcText} />}
              {r.value != null && <span className="aw-hz-thr-now" style={{ left: `${P(r.value) * 100}%` }} />}
            </div>
            <div className="aw-hz-thr-ticks" aria-hidden="true">
              {cutsP.map((c, i) => <span key={i} style={{ left: `${c * 100}%` }}>{cutText(r.id, r.cuts[i])}</span>)}
            </div>
            <div className="aw-hz-thr-fctext">{r.fcText}</div>
          </div>
        );
      })}
      <div className="aw-hz-thr-legend">
        <span><i className="is-now" />jetzt</span>
        <span><i className="is-fc" />Prognose</span>
        <span><i style={{ background: '#EDE6D3' }} />unter Stufe 1</span>
        {([1, 2, 3] as const).map((l) => <span key={l}><i style={{ background: AW_SEV[l].bg, opacity: 0.7 }} />Stufe {l}</span>)}
        <span>· rechts = ungünstiger</span>
      </div>
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
