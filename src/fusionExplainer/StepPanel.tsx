/**
 * One step panel of the buscosun Fusion explainer (phase FX-UI): the SAME schematic temperature curve at a valley site, shown
 * after each of the five steps. SCHEMA, no measured data — the numbers come from `charts.ts` (generated).
 * Shared by the start-page preview (panels 1 and 5) and the detail page (all five). Decorative: `aria-hidden` unless `label`.
 */
import { STEP_PANELS as P } from './charts';
import './panel.css';

const INK = '#2C2A26';
const GREY = '#A89A7A';
const STEEL = '#3A6FA8';
const TERRA = '#A85E2E';
const common = { vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round', fill: 'none' } as const;

export type StepNo = 1 | 2 | 3 | 4 | 5;

export default function StepPanel({ step, label, times = true }: { step: StepNo; label?: string; times?: boolean }) {
  const [ax, ay] = P.terrainArrow.from;
  const [bx, by] = P.terrainArrow.to;
  return (
    <div className="fx-panel">
      <svg viewBox={P.viewBox} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
        {P.night.map(([x0, x1], i) => <rect key={`n${i}`} x={x0} y={8} width={x1 - x0} height={104} fill="#EDE6D3" opacity={0.75} />)}
        {P.grid.map((y, i) => <line key={`g${i}`} x1={14} x2={232} y1={y} y2={y} stroke="#E3DAC5" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        <line x1={14} x2={14} y1={8} y2={112} stroke={GREY} strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />

        {step === 1 && P.raw.map((m, i) => <path key={i} d={m.d} stroke={m.color} strokeWidth={1.5} opacity={0.9} {...common} />)}
        {step === 2 && <>
          {P.corrected.map((m, i) => <path key={i} d={m.d} stroke={m.color} strokeWidth={1.1} opacity={0.5} {...common} />)}
          <path d={P.bundle} stroke={INK} strokeWidth={2.2} {...common} />
        </>}
        {step === 3 && <>
          <path d={P.bundle} stroke={GREY} strokeWidth={1.5} strokeDasharray="3 3" {...common} />
          <path d={P.terrain} stroke={INK} strokeWidth={2.2} {...common} />
          <path d={`M${ax} ${ay + 2} L${bx} ${by - 4}`} stroke={STEEL} strokeWidth={1.4} {...common} />
          <path d={`M${bx - 3.2} ${by - 6.2} L${bx} ${by - 1} L${bx + 3.2} ${by - 6.2}`} stroke={STEEL} strokeWidth={1.4} {...common} />
        </>}
        {step === 4 && <>
          <path d={P.terrain} stroke={GREY} strokeWidth={1.5} strokeDasharray="3 3" {...common} />
          <path d={P.anchored} stroke={INK} strokeWidth={2.2} {...common} />
          <circle cx={P.obsNow[0]} cy={P.obsNow[1]} r={7.5} stroke={INK} strokeWidth={1} opacity={0.28} fill="none" vectorEffect="non-scaling-stroke" />
          <circle cx={P.obsNow[0]} cy={P.obsNow[1]} r={3.8} fill={INK} />
        </>}
        {step === 5 && <>
          <path d={P.band} fill="#F3D9BD" opacity={0.95} />
          <path d={P.anchored} stroke={TERRA} strokeWidth={2.2} {...common} />
          {P.later.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.7} fill="#fff" stroke={INK} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />)}
        </>}
      </svg>
      {times && <div className="fx-panel-times" aria-hidden="true"><span>JETZT</span><span>+36 H</span></div>}
    </div>
  );
}
