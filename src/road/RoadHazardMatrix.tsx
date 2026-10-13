/**
 * AW-8.1 — Lage-Matrix „Abschnitte je Gefahr und Stunde“ (gefahren §nivo): `@nivo/heatmap` with an own
 * `cellComponent` — number = segments with a level, colour = highest level (never from the number), hatched = unknown
 * only, cell = filter on group and hour. Every cell is a focusable button (keyboard, screen reader); a visually hidden
 * table repeats the numbers (gefahren §Bedienung).
 */
import { useMemo } from 'react';
import { ResponsiveHeatMap, type CellComponentProps, type ComputedCell } from '@nivo/heatmap';
import { ROAD_HAZARD_GROUPS, type RoadHazardGroup, type RoadLevel } from './roadHazards';
import { AW_SEV, AW_FONT, AW_MONO, roadNivoTheme, useReducedMotion } from './roadNivoTheme';
import { HZ_GROUP_ICON, type HzMatrixCell } from './roadHzView';
import { hm } from './roadView';

interface Datum { x: string; y: number | null; hour: number; max: RoadLevel; unknown: number; group: RoadHazardGroup }
interface Props {
  matrix: HzMatrixCell[][];
  hours: readonly number[];
  /** Active filter (group, hour) — the cell gets a blue frame. */
  filter: RoadHazardGroup | null;
  hour: number | null;
  onCell: (group: RoadHazardGroup, hour: number) => void;
  onHour: (hour: number) => void;
}

const GROUP_LABEL = Object.fromEntries(ROAD_HAZARD_GROUPS.map((g) => [g.id, g.label])) as Record<RoadHazardGroup, string>;

export default function RoadHazardMatrix({ matrix, hours, filter, hour, onCell, onHour }: Props) {
  const reduce = useReducedMotion();
  const data = useMemo(() => matrix.map((row, gi) => ({
    id: ROAD_HAZARD_GROUPS[gi].id,
    data: row.map((c): Datum => ({ x: c.hour === 0 ? 'jetzt' : `+${c.hour}`, y: c.n, hour: c.hour, max: c.max, unknown: c.unknown, group: c.group })),
  })), [matrix]);
  const Cell = useMemo(() => function HzCell({ cell, onClick }: CellComponentProps<Datum>) {
    const d = cell.data;
    const active = filter === d.group && hour === d.hour;
    const bg = d.y ? AW_SEV[d.max].bg : d.unknown ? 'url(#awHzHatch)' : AW_SEV[0].bg;
    const ink = d.y ? AW_SEV[d.max].ink : '#A89A7A';
    const label = `${GROUP_LABEL[d.group]} ${d.hour === 0 ? 'jetzt' : `+${d.hour} h`}: ${d.y ? `${d.y} Abschnitte, höchste Stufe ${d.max}` : d.unknown ? `${d.unknown} unbekannt` : 'keine'}`;
    return (
      <g transform={`translate(${cell.x - cell.width / 2}, ${cell.y - cell.height / 2})`} role="button" tabIndex={0} aria-label={label} aria-pressed={active}
        style={{ cursor: 'pointer', outline: 'none' }} onClick={onClick?.(cell) as unknown as React.MouseEventHandler<SVGGElement>}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCell(d.group, d.hour); } }} className="aw-hz-cell">
        <rect width={cell.width - 3} height={cell.height - 3} x={1.5} y={1.5} rx={5} fill={bg} stroke={active ? '#1F5FAE' : 'none'} strokeWidth={2} />
        <text x={cell.width / 2} y={cell.height / 2 + 4} textAnchor="middle" fontFamily={AW_FONT} fontSize={11} fontWeight={700} fill={ink} style={{ fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
          {d.y ? d.y : d.unknown ? '?' : '·'}
        </text>
      </g>
    );
  }, [filter, hour, onCell]);
  const summary = `Abschnitte je Gefahrengruppe und Stunde, ${hours.length ? hm(hours[0]) : ''} bis +6 h`;
  return (
    <div className="aw-hz-matrix" role="img" aria-label={summary}>
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <defs><pattern id="awHzHatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#EDE6D3" /><rect width="2" height="4" fill="#8B8474" /></pattern></defs>
      </svg>
      <div className="aw-hz-matrix-head" aria-hidden="true">
        <span />
        {hours.map((_ms, i) => <button key={i} type="button" className={i === hour ? 'is-on' : ''} onClick={() => onHour(i)} style={{ fontFamily: AW_MONO }}>{i === 0 ? 'jetzt' : `+${i}`}</button>)}
      </div>
      <div className="aw-hz-matrix-body">
        <div className="aw-hz-matrix-rows" aria-hidden="true">
          {ROAD_HAZARD_GROUPS.map((g) => (
            <button key={g.id} type="button" className={filter === g.id ? 'is-on' : ''} onClick={() => onCell(g.id, hour ?? 0)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={HZ_GROUP_ICON[g.id]} /></svg>
              <span>{g.label}</span>
            </button>
          ))}
        </div>
        <div className="aw-hz-matrix-cells">
          <ResponsiveHeatMap<Datum, object>
            data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} forceSquare={false} animate={!reduce} isInteractive
            axisTop={null} axisLeft={null} axisRight={null} axisBottom={null} enableGridX={false} enableGridY={false} enableLabels={false}
            hoverTarget="rowColumn" inactiveOpacity={0.55} activeOpacity={1}
            colors={(c) => (c.data.y ? AW_SEV[c.data.max].bg : AW_SEV[0].bg)} theme={roadNivoTheme}
            cellComponent={Cell} onClick={(c: ComputedCell<Datum>) => onCell(c.data.group, c.data.hour)}
            tooltip={({ cell }) => <div className="aw-hz-tip">{GROUP_LABEL[cell.data.group]} · {cell.data.hour === 0 ? 'jetzt' : `+${cell.data.hour} h`}: {cell.data.y ? `${cell.data.y} Abschnitte, höchste Stufe ${cell.data.max}` : cell.data.unknown ? `${cell.data.unknown} unbekannt` : 'keine Abschnitte'}</div>}
          />
        </div>
      </div>
      <table className="aw-visually-hidden">
        <caption>{summary}</caption>
        <thead><tr><th>Gruppe</th>{hours.map((ms, i) => <th key={i}>{i === 0 ? `jetzt ${hm(ms)}` : `+${i} h`}</th>)}</tr></thead>
        <tbody>{matrix.map((row, gi) => <tr key={gi}><th>{ROAD_HAZARD_GROUPS[gi].label}</th>{row.map((c) => <td key={c.hour}>{c.n ? `${c.n} (Stufe ${c.max})` : c.unknown ? `${c.unknown} unbekannt` : '0'}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
