/**
 * Phase FX-UI — section 04: schematic 48-h output of one place: most likely value (p50), the p10–p90 span, numbered markers.
 * SCHEMA, no measured data (`charts.ts`, generated). The markers are HTML badges over the svg so they stay round at any width.
 */
import { OUTPUT as O } from './charts';
import { SECTIONS } from './copy';

const TERRA = '#A85E2E';

export default function OutputFigure() {
  const T = SECTIONS.s4;
  return (
    <figure className="fx-fig fx-output">
      <div className="fx-out-wrap">
        <svg viewBox={O.viewBox} role="img" aria-label={T.outputAria} focusable="false">
          {O.night.map(([x0, x1], i) => <rect key={i} x={x0} y={10} width={x1 - x0} height={200} fill="#EDE6D3" opacity={0.75} />)}
          {O.grid.map((y, i) => <line key={i} x1={O.x0} x2={O.x1} y1={y} y2={y} stroke="#E3DAC5" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          <line x1={O.x0} x2={O.x0} y1={10} y2={210} stroke="#A89A7A" strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          <path d={O.band} fill="#F3D9BD" opacity={0.95} />
          <path d={O.p50} fill="none" stroke={TERRA} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {O.markers.map((m) => (
          <span key={m.n} className="fx-badge" style={{ left: `${m.leftPct}%`, top: `${m.topPct}%` }} aria-hidden="true">{m.n}</span>
        ))}
      </div>
      <div className="fx-out-axis" aria-hidden="true">{T.axis.map((a) => <span key={a}>{a}</span>)}</div>
      <figcaption className="fx-fig-caption">{T.caption}</figcaption>
    </figure>
  );
}
