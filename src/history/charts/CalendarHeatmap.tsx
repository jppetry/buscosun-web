/**
 * Kalender-Heatmap (E6.4): ein Jahr als Tagesraster (Monate × Tage), farbcodiert.
 * Klick auf eine Zelle öffnet das Tagesdetail (E7.1).
 */

import type { CalCell, VariableMeta } from '../historyModel';
import { divergingColor, sequentialColor, anomalySpan } from '../historyColors';
import { fmtNum } from './common';

const MONTH_LABELS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

interface Props { cells: CalCell[]; meta: VariableMeta; year: number; onPick?: (dateISO: string) => void }

export default function CalendarHeatmap({ cells, meta, year, onPick }: Props) {
  if (cells.length < 30) return <div className="hi-chart-empty">Für {year} liegen zu wenige Tage vor.</div>;
  const vals = cells.map((c) => c.value).filter((v): v is number => v != null);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const span = meta.diverging ? anomalySpan(vals.map((v) => v - mean)) : 1;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const color = (v: number | null) => v == null ? '#EFE7D6' : meta.diverging ? divergingColor(v - mean, span) : sequentialColor((v - lo) / Math.max(0.01, hi - lo), meta.key);

  const W = 920, top = 18, left = 26, cell = (W - left - 8) / 12, rowH = 8.2;
  const H = top + 31 * rowH + 6;
  const byMD = new Map<string, CalCell>();
  for (const c of cells) byMD.set(`${c.month}-${c.day}`, c);

  return (
    <div className="hi-chart-wrap">
      <svg className="hi-cal" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Kalender-Heatmap ${year}, ${meta.label}.`}>
        {MONTH_LABELS.map((m, i) => <text key={m} x={left + i * cell + cell / 2} y={12} className="hi-axislabel" textAnchor="middle">{m}</text>)}
        {[1, 6, 11, 16, 21, 26, 31].map((d) => <text key={d} x={left - 6} y={top + (d - 1) * rowH + rowH} className="hi-axislabel" textAnchor="end">{d}</text>)}
        {Array.from({ length: 12 }, (_, mi) => Array.from({ length: 31 }, (_, di) => {
          const c = byMD.get(`${mi + 1}-${di + 1}`);
          if (!c) return null;
          return <rect key={`${mi}-${di}`} x={left + mi * cell + 0.5} y={top + di * rowH} width={cell - 1.4} height={rowH - 1}
            rx={1.5} fill={color(c.value)} onClick={onPick ? () => onPick(c.dateISO) : undefined} style={onPick ? { cursor: 'pointer' } : undefined}>
            <title>{c.dateISO}: {c.value == null ? 'keine Daten' : `${fmtNum(c.value)} ${meta.unit}`}</title>
          </rect>;
        }))}
      </svg>
      <div className="hi-chart-foot"><span className="hi-ref-tag">Klick auf eine Zelle → Tagesdetail · {meta.diverging ? 'Abweichung vom Jahresmittel' : `${meta.label} (${meta.unit})`}</span></div>
    </div>
  );
}
