/**
 * Phase FX-UI — section 01: schematic cross-section of an Alpine valley. The real terrain against the model surface with ONE
 * height per grid cell; cold air lies below the model height in the valley. SCHEMA, no measured data (`charts.ts`, generated).
 */
import { TERRAIN as T } from './charts';
import { SECTIONS } from './copy';

const INK = '#2C2A26';
const STEEL = '#3A6FA8';
const TERRA = '#A85E2E';
const k = { vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round', fill: 'none' } as const;

export default function TerrainFigure() {
  const [px, py] = T.place;
  const bx = px + 14; // the height bracket sits beside the place so it does not cover the dot
  const cells = Array.from({ length: Math.floor(640 / T.cellWidth) - 1 }, (_, i) => (i + 1) * T.cellWidth);
  return (
    <figure className="fx-fig fx-terrain">
      <svg className="fx-tsvg" viewBox={T.viewBox} role="img" aria-label={SECTIONS.s1.terrainAria} focusable="false">
        <path d={T.area} fill="#EDE6D3" />
        <path d={T.pool} fill="#D5E3F3" />
        <path d={T.line} stroke={INK} strokeWidth={1.8} {...k} />
        {cells.map((x) => <line key={x} x1={x} x2={x} y1={36} y2={270} stroke={STEEL} strokeOpacity={0.18} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        <path d={T.stair} stroke={STEEL} strokeWidth={2} strokeDasharray="6 4" {...k} />
        <path d="M322 30 V24 H398 V30" stroke={STEEL} strokeWidth={1.4} {...k} />
        <text x={360} y={17} textAnchor="middle" fill={STEEL}>Gitterzelle</text>

        <path d={`M${bx - 6} ${T.modelYAtPlace} H${bx + 6} M${bx} ${T.modelYAtPlace} V${py} M${bx - 6} ${py} H${bx + 6}`} stroke={TERRA} strokeWidth={1.6} {...k} />
        <path d={`M${bx} ${T.modelYAtPlace} V68`} stroke={TERRA} strokeWidth={1} strokeDasharray="2 3" {...k} />
        <text x={bx} y={62} textAnchor="middle" fill={TERRA} className="fx-t-long">Höhenfehler am Ort</text>
        <text x={bx} y={62} textAnchor="middle" fill={TERRA} className="fx-t-short">Δh</text>

        <circle cx={px} cy={py} r={5} fill={TERRA} stroke="#fff" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        <text x={px + 6} y={262} textAnchor="end" fill={INK}>dein Ort</text>
        <text x={90} y={T.ridgeLabelY} textAnchor="middle" fill={INK} className="fx-t-long">echte Landschaft</text>
      </svg>
      <ul className="fx-legend" aria-label="Legende">
        <li><i className="fx-sw" style={{ borderTop: `2px solid ${INK}` }} />{SECTIONS.s1.legend[0]}</li>
        <li><i className="fx-sw" style={{ borderTop: `2px dashed ${STEEL}` }} />{SECTIONS.s1.legend[1]}</li>
        <li><i className="fx-sw fx-sw-box" style={{ background: '#D5E3F3' }} />{SECTIONS.s1.legend[2]}</li>
        <li className="fx-legend-schema">{SECTIONS.s1.legend[3]}</li>
      </ul>
    </figure>
  );
}
