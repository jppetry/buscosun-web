/**
 * NC-US4/US-E5/US-B1/US-B5 — Intensität-&-Confidence-Timeline 0–6 h.
 *
 * `variant="standard"` zeigt den Intensitätsverlauf, das Konfidenzband, die
 * Quellen-Zonen (Radar→Blend→ICON-D2), das Trockenfenster, den „JETZT"-Marker
 * und den Skill-Horizont (+2 h).
 *
 * `variant="detail"` ergänzt (Mockup 02) je einen Streifen für **Phase**
 * (Regen/Schnee/Schneeregen/gefrierender Regen, US-B1) und **Charakter**
 * (Schauer vs. Dauerregen, US-B5), Phasenübergangs-Marker (US-B1 AK2) sowie
 * Starkregen- (US-B4) und Gewitter/Hagel-Marker (US-B3).
 *
 * Bewusst ehrlich (NFR): jenseits des Skill-Horizonts wird gedämpft dargestellt
 * und beschriftet.
 */

import {
  NOWCAST_HORIZON_MIN, NOWCAST_STEP_MIN, SKILL_HORIZON_MIN, STARKREGEN_MMH,
  phaseColor, phaseLabelStep,
  type Nowcast, type NowcastStep, type StepPhase,
} from './nowcastModel';
import { fmtClock, fmtDuration } from './nowcastView';

const W = 720;
const PAD_L = 46, PAD_R = 16, PAD_B = 32;
const PLOT_W = W - PAD_L - PAD_R;
const MMH_CAP = 12;

type Variant = 'standard' | 'detail';

// Layout je Variante: im Detail-Modus rücken Phase-/Charakter-Streifen ein.
function layout(variant: Variant) {
  const stripTop = 28;          // unter dem Quellen-Kopfband
  const stripH = 14, stripGap = 6;
  const detail = variant === 'detail';
  const padT = detail ? stripTop + 2 * (stripH + stripGap) + 8 : 36;
  const H = padT + 168 + PAD_B;
  return { detail, padT, H, plotH: 168, stripTop, stripH, stripGap };
}

const GRID_MMH = [1, 2.5, 5, 10];

export default function NowcastTimeline({ nowcast, variant = 'standard' }: { nowcast: Nowcast; variant?: Variant }) {
  const steps = nowcast.steps;
  const L = layout(variant);
  const yMax = Math.sqrt(MMH_CAP);
  const yFor = (mmH: number) => L.padT + L.plotH * (1 - Math.sqrt(Math.min(Math.max(0, mmH), MMH_CAP)) / yMax);
  const xFor = (min: number) => PAD_L + (PLOT_W * min) / NOWCAST_HORIZON_MIN;
  const stepW = (PLOT_W / NOWCAST_HORIZON_MIN) * NOWCAST_STEP_MIN;
  const baseY = yFor(0);

  // Quellen-Zonen
  const firstBlend = steps.find((s) => s.source === 'blend')?.minutes ?? null;
  const firstNwp = steps.find((s) => s.source === 'nwp')?.minutes ?? null;
  const radarEnd = firstBlend ?? firstNwp ?? NOWCAST_HORIZON_MIN;
  const blendEnd = firstNwp ?? NOWCAST_HORIZON_MIN;

  // Pfade
  const probArea = areaPath(steps, xFor, yFor, baseY);
  const probLine = linePath(steps, xFor, yFor);
  const bandArea = bandPath(steps, xFor, yFor);

  const skillX = xFor(SKILL_HORIZON_MIN);
  const dry = nowcast.dryWindow && nowcast.dryWindow.durationMin >= 15 ? nowcast.dryWindow : null;

  // Spitzen-/Gewitter-Marker (Detail)
  const peak = steps.reduce((a, b) => (b.mmH > a.mmH ? b : a), steps[0]);
  const showThunder = variant === 'detail' && nowcast.summary.thunderRiskPct >= 12;
  const showHail = variant === 'detail' && nowcast.summary.hailRiskPct >= 10;

  const ticks: number[] = [];
  for (let m = 0; m <= NOWCAST_HORIZON_MIN; m += 60) ticks.push(m);

  return (
    <div className="nc-tl-wrap">
      <svg className="nc-tl" viewBox={`0 0 ${W} ${L.H}`} role="img"
        aria-label="Regenintensität und Konfidenz über die nächsten 6 Stunden; Radar bis 2 Stunden, danach Modell.">
        {/* Quellen-Kopfband */}
        <g>
          <rect x={xFor(0)} y={6} width={xFor(radarEnd) - xFor(0)} height={18} rx="4" fill="#3A6FA8" />
          <text x={(xFor(0) + xFor(radarEnd)) / 2} y={19} className="nc-tl-zone-label">RADAR</text>
          {firstBlend != null && (
            <>
              <rect x={xFor(radarEnd)} y={6} width={xFor(blendEnd) - xFor(radarEnd)} height={18} rx="4" fill="#C97B47" />
              {xFor(blendEnd) - xFor(radarEnd) > 36 && <text x={(xFor(radarEnd) + xFor(blendEnd)) / 2} y={19} className="nc-tl-zone-label">BLEND</text>}
            </>
          )}
          <rect x={xFor(blendEnd)} y={6} width={xFor(NOWCAST_HORIZON_MIN) - xFor(blendEnd)} height={18} rx="4" fill="#A89A82" />
          <text x={(xFor(blendEnd) + xFor(NOWCAST_HORIZON_MIN)) / 2} y={19} className="nc-tl-zone-label">ICON-D2</text>
        </g>

        {/* Detail: Phase- + Charakter-Streifen */}
        {L.detail && (
          <>
            <PhaseStrip steps={steps} y={L.stripTop} h={L.stripH} stepW={stepW} xFor={xFor} />
            <text x={PAD_L - 6} y={L.stripTop + 10} className="nc-tl-strip-axis" textAnchor="end">Phase</text>
            <CharacterStrip steps={steps} y={L.stripTop + L.stripH + L.stripGap} h={L.stripH} stepW={stepW} xFor={xFor} />
            <text x={PAD_L - 6} y={L.stripTop + L.stripH + L.stripGap + 10} className="nc-tl-strip-axis" textAnchor="end">Charakter</text>
          </>
        )}

        {/* Intensitäts-Gridlines + Y-Labels */}
        <line x1={PAD_L} y1={baseY} x2={W - PAD_R} y2={baseY} className="nc-tl-axis" />
        {GRID_MMH.map((v) => (
          <g key={v}>
            <line x1={PAD_L} y1={yFor(v)} x2={W - PAD_R} y2={yFor(v)} className="nc-tl-grid" />
            <text x={PAD_L - 6} y={yFor(v) + 3} className="nc-tl-ylabel" textAnchor="end">{v.toString().replace('.', ',')}</text>
          </g>
        ))}
        <text x={PAD_L - 6} y={baseY + 3} className="nc-tl-ylabel" textAnchor="end">0</text>
        <text x={PAD_L - 6} y={L.padT + 8} className="nc-tl-yunit" textAnchor="end">mm/h</text>

        {/* Trockenfenster */}
        {dry && (
          <g>
            <rect x={xFor(dry.fromMin)} y={L.padT} width={xFor(dry.toMin) - xFor(dry.fromMin)} height={L.plotH} className="nc-tl-dry" />
            <text x={(xFor(dry.fromMin) + xFor(dry.toMin)) / 2} y={L.padT + 13} className="nc-tl-dry-label" textAnchor="middle">TROCKEN {fmtDuration(dry.durationMin)}</text>
          </g>
        )}

        {/* Konfidenzband + wahrscheinliche Intensität */}
        <path d={bandArea} className="nc-tl-band" />
        <path d={probArea} className="nc-tl-area" />
        <path d={probLine} className="nc-tl-line" />

        {/* Detail: Starkregen-Schwellenlinie + Marker */}
        {L.detail && (
          <>
            <line x1={PAD_L} y1={yFor(STARKREGEN_MMH)} x2={W - PAD_R} y2={yFor(STARKREGEN_MMH)} className="nc-tl-heavy-line" />
            <text x={W - PAD_R} y={yFor(STARKREGEN_MMH) - 3} className="nc-tl-heavy-label" textAnchor="end">Starkregen ≥ 5</text>
            {steps.filter((s) => s.heavy).map((s) => (
              <circle key={s.index} cx={xFor(s.minutes)} cy={yFor(s.mmH)} r={3} className="nc-tl-heavy-dot" />
            ))}
            {(showThunder || showHail) && peak.mmH > 0 && (
              <Bolt x={xFor(peak.minutes)} y={yFor(peak.mmH) - 14} hail={showHail} />
            )}
            {/* Phasenübergangs-Marker (US-B1 AK2) */}
            {nowcast.summary.phaseTransitions.map((t) => (
              <g key={t.atMinutes}>
                <line x1={xFor(t.atMinutes)} y1={L.padT} x2={xFor(t.atMinutes)} y2={baseY} className="nc-tl-phase-trans" />
                <text x={xFor(t.atMinutes)} y={L.padT - 2} className="nc-tl-phase-trans-label" textAnchor="middle">
                  {phaseShort(t.from)}→{phaseShort(t.to)}
                </text>
              </g>
            ))}
          </>
        )}

        {/* Skill-Horizont */}
        <line x1={skillX} y1={L.padT} x2={skillX} y2={baseY} className="nc-tl-skill" />
        <text x={skillX + 4} y={L.padT + 20} className="nc-tl-skill-label">Skill-Horizont +{Math.round(SKILL_HORIZON_MIN / 60)} h</text>

        {/* JETZT-Marker */}
        <line x1={xFor(0)} y1={L.padT} x2={xFor(0)} y2={baseY} className="nc-tl-now" />
        <text x={xFor(0)} y={baseY + 22} className="nc-tl-now-label" textAnchor="middle">JETZT</text>

        {/* X-Ticks */}
        {ticks.slice(1).map((m) => (
          <text key={m} x={xFor(m)} y={baseY + 22} className="nc-tl-xlabel" textAnchor="middle">
            {fmtClock(nowcast.nowMs + m * 60_000)}
          </text>
        ))}
      </svg>

      <div className="nc-tl-legend">
        <span><i className="nc-lg-line" /> wahrscheinliche Intensität</span>
        <span><i className="nc-lg-band" /> Konfidenzband (min/max)</span>
        <span><i className="nc-lg-dry" /> Trockenfenster</span>
        {variant === 'detail' && <span><i className="nc-lg-heavy" /> Starkregen</span>}
        {variant === 'detail' && <span><i className="nc-lg-bolt" /> Gewitter/Hagel</span>}
        <span><i className="nc-lg-skill" /> Skill-Horizont +2 h</span>
      </div>

      {variant === 'detail' && <PhaseLegend steps={steps} />}
    </div>
  );
}

// --- Detail-Streifen ---------------------------------------------------------

function PhaseStrip({ steps, y, h, stepW, xFor }: { steps: NowcastStep[]; y: number; h: number; stepW: number; xFor: (m: number) => number }) {
  return (
    <g>
      <rect x={xFor(0)} y={y} width={xFor(NOWCAST_HORIZON_MIN) - xFor(0)} height={h} rx="3" className="nc-tl-strip-bg" />
      {steps.map((s) => (
        <rect key={s.index} x={xFor(s.minutes)} y={y} width={stepW + 0.5} height={h}
          fill={phaseColor(s.phase)} opacity={s.phase === 'dry' ? 0 : s.phase === 'freezing' ? 0.95 : 0.62}>
          <title>{fmtClock(s.timestamp.getTime())} · {phaseLabelStep(s.phase)}</title>
        </rect>
      ))}
    </g>
  );
}

function CharacterStrip({ steps, y, h, stepW, xFor }: { steps: NowcastStep[]; y: number; h: number; stepW: number; xFor: (m: number) => number }) {
  const color = (c: NowcastStep['character']) => (c === 'showery' ? '#D4A373' : c === 'steady' ? '#7A9466' : 'transparent');
  return (
    <g>
      <rect x={xFor(0)} y={y} width={xFor(NOWCAST_HORIZON_MIN) - xFor(0)} height={h} rx="3" className="nc-tl-strip-bg" />
      {steps.map((s) => (
        <rect key={s.index} x={xFor(s.minutes)} y={y} width={stepW + 0.5} height={h}
          fill={color(s.character)} opacity={s.character ? 0.7 : 0}>
          <title>{fmtClock(s.timestamp.getTime())} · {s.character === 'showery' ? 'Schauer (konvektiv)' : s.character === 'steady' ? 'Dauerregen (stratiform)' : 'trocken'}</title>
        </rect>
      ))}
    </g>
  );
}

function PhaseLegend({ steps }: { steps: NowcastStep[] }) {
  const present = Array.from(new Set(steps.map((s) => s.phase).filter((p) => p !== 'dry'))) as StepPhase[];
  if (!present.length) return null;
  return (
    <div className="nc-tl-phase-legend">
      <span className="nc-tl-phase-legend-title">Phase</span>
      {present.map((p) => (
        <span key={p} className="nc-tl-phase-legend-item">
          <i style={{ background: phaseColor(p) }} /> {phaseLabelStep(p)}
        </span>
      ))}
      <span className="nc-tl-phase-legend-item"><i className="nc-char-sh" /> Schauer</span>
      <span className="nc-tl-phase-legend-item"><i className="nc-char-st" /> Dauerregen</span>
    </div>
  );
}

function Bolt({ x, y, hail }: { x: number; y: number; hail: boolean }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={8} fill="#D4A373" />
      <path d="M -2 -4 L 3 -4 L 0 1 L 4 1 L -3 8 L 0 2 L -4 2 Z" fill="#FAF6EA" />
      {hail && <circle cx={7} cy={-6} r={2.5} fill="#6B7A8F" stroke="#FAF6EA" strokeWidth={0.8} />}
    </g>
  );
}

function phaseShort(p: StepPhase): string {
  return p === 'rain' ? 'Regen' : p === 'snow' ? 'Schnee' : p === 'sleet' ? 'Schneeregen' : p === 'freezing' ? 'Glatteis' : 'trocken';
}

// --- Pfad-Helfer -------------------------------------------------------------

function linePath(steps: NowcastStep[], xFor: (m: number) => number, yFor: (v: number) => number): string {
  return steps.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xFor(s.minutes).toFixed(1)} ${yFor(s.mmH).toFixed(1)}`).join(' ');
}

function areaPath(steps: NowcastStep[], xFor: (m: number) => number, yFor: (v: number) => number, baseY: number): string {
  if (!steps.length) return '';
  const top = steps.map((s) => `L ${xFor(s.minutes).toFixed(1)} ${yFor(s.mmH).toFixed(1)}`).join(' ');
  return `M ${xFor(steps[0].minutes).toFixed(1)} ${baseY.toFixed(1)} ${top} L ${xFor(steps[steps.length - 1].minutes).toFixed(1)} ${baseY.toFixed(1)} Z`;
}

function bandPath(steps: NowcastStep[], xFor: (m: number) => number, yFor: (v: number) => number): string {
  if (!steps.length) return '';
  const up = steps.map((s) => `L ${xFor(s.minutes).toFixed(1)} ${yFor(s.mmHMax).toFixed(1)}`).join(' ');
  const down = [...steps].reverse().map((s) => `L ${xFor(s.minutes).toFixed(1)} ${yFor(s.mmHMin).toFixed(1)}`).join(' ');
  const first = steps[0], last = steps[steps.length - 1];
  return `M ${xFor(first.minutes).toFixed(1)} ${yFor(first.mmHMax).toFixed(1)} ${up} L ${xFor(last.minutes).toFixed(1)} ${yFor(last.mmHMin).toFixed(1)} ${down} Z`;
}
