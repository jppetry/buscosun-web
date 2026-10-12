/**
 * GL-1 — Chart under the situation map: the yearly MEAN of what the measuring networks measured, per country — glacier-wide
 * mass balance (m w. e.) or length change (m) — as `@nivo/line` (plan A11; bars would be plain SVG). Only measured values; the
 * seasonal curve of the reference stays locked until the melt calculation passes its calibration (plan §8). The number of
 * glaciers behind each mean is part of the tooltip text and the note.
 */
import { useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import type { GlacierCountryYearly, GlacierSummary } from './glacierClient';
import { fmt1, fmt2 } from './glacierView';

export type ChartKind = 'ba' | 'len';
const COLOUR: Record<'CH' | 'AT' | 'DE', string> = { CH: '#1E87A8', AT: '#B5602C', DE: '#6B5BB8' };
const THEME = {
  text: { fontFamily: 'IBM Plex Mono, monospace', fontSize: 10.5, fill: '#5C5447' },
  grid: { line: { stroke: '#E0D6BE', strokeWidth: 1 } },
  axis: { ticks: { line: { stroke: 'transparent' } }, domain: { line: { stroke: '#9D8F6E', strokeWidth: 1 } } },
};

export function chartSeries(summary: GlacierSummary, kind: ChartKind, fromYear = 1990) {
  const out: Array<{ id: 'CH' | 'AT' | 'DE'; data: Array<{ x: number; y: number; n: number }>; last: [number, number, number] | null }> = [];
  for (const c of ['CH', 'AT', 'DE'] as const) {
    const rows: GlacierCountryYearly = summary.countries[c][kind].filter((r) => r[0] >= fromYear);
    // DE has no recent measurement in the networks used here (BAdW publishes areas only) — an empty line is not drawn
    if (rows.length < 2) continue;
    out.push({ id: c, data: rows.map(([x, y, n]) => ({ x, y: kind === 'ba' ? y / 1000 : y, n })), last: rows[rows.length - 1] });
  }
  return out;
}

export default function GlacierLageChart({ summary, kind, fromYear = 1990 }: { summary: GlacierSummary; kind: ChartKind; fromYear?: number }) {
  const series = useMemo(() => chartSeries(summary, kind, fromYear), [summary, kind, fromYear]);
  const all = series.flatMap((s) => s.data.map((d) => d.y));
  const lo = all.length ? Math.floor(Math.min(...all, 0) * (kind === 'ba' ? 2 : 0.02)) / (kind === 'ba' ? 2 : 0.02) : -1;
  const hi = all.length ? Math.ceil(Math.max(...all, 0) * (kind === 'ba' ? 2 : 0.02)) / (kind === 'ba' ? 2 : 0.02) : 1;
  const x0 = Math.min(...series.flatMap((s) => s.data.map((d) => d.x)), 2025), x1 = Math.max(...series.flatMap((s) => s.data.map((d) => d.x)), 2025);
  const lastLabels = series.map((s) => `${s.id} ${s.last ? (kind === 'ba' ? fmt2(s.last[1] / 1000) : fmt1(s.last[1])) : '–'} (${s.last?.[0] ?? '–'}, n = ${s.last?.[2] ?? 0})`).join(' · ');
  return (
    <div className="gl-chart" role="img"
      aria-label={`${kind === 'ba' ? 'Jahresbilanz in m Wasseräquivalent' : 'Längenänderung in m'}, Mittel der Messgletscher je Land ab ${fromYear}. Letzte Werte: ${lastLabels}`}
      data-origin="measured" data-series={series.map((s) => s.id).join(',')}>
      <ResponsiveLine
        data={series.map((s) => ({ id: s.id, data: s.data }))}
        colors={(s) => COLOUR[s.id as 'CH' | 'AT' | 'DE']} lineWidth={2.4} margin={{ top: 10, right: 12, bottom: 24, left: 44 }}
        xScale={{ type: 'linear', min: x0, max: x1 }} yScale={{ type: 'linear', min: lo, max: hi }}
        theme={THEME} animate={false} enablePoints={false} enableGridX={false} gridYValues={5} useMesh
        axisBottom={{ tickSize: 0, tickPadding: 6, tickValues: Math.min(8, x1 - x0), format: (v: number) => String(v) }}
        axisLeft={{ tickSize: 0, tickPadding: 6, tickValues: 5, format: (v: number) => (kind === 'ba' ? fmt1(v) : String(Math.round(v))) }}
        tooltip={({ point }) => {
          const d = point.data as unknown as { x: number; y: number; n: number };
          return <div className="gl-tip"><b>{point.seriesId} · {d.x}</b>: {kind === 'ba' ? `${fmt2(d.y)} m w. e.` : `${fmt1(d.y)} m`}<small> Mittel von {d.n} Gletschern</small></div>;
        }}
        markers={[{ axis: 'y', value: 0, lineStyle: { stroke: '#9D8F6E', strokeWidth: 1 } }]}
      />
    </div>
  );
}
