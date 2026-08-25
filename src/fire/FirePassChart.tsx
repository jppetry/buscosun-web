/**
 * BD1 — Verlauf eines Brands: ΣFRP je Überflug als Balken (log-Achse), Beobachtungslücken
 * > 6 h schraffiert, ☀/☾ je Überflug. Reines SVG (D-06). Rechnung in `detail/passTimeline.ts`.
 */
import { useId, useMemo } from 'react';
import type { FirePass } from './activity/overpasses';
import { passTimeline, GAP_HOURS } from './detail/passTimeline';

export interface FirePassChartProps {
  passes: readonly FirePass[];
  nowMs: number;
  compact?: boolean;
}

const de = (n: number, frac = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: frac });

export function FirePassChart({ passes, nowMs, compact = false }: FirePassChartProps) {
  const tl = useMemo(() => passTimeline(passes, nowMs), [passes, nowMs]);
  const pid = useId().replace(/:/g, '');
  if (!tl) return null;
  const W = compact ? 300 : 380, H = 118, L = 40, R = 8, T = 10, B = 22;
  const iw = W - L - R, ih = H - T - B;
  const px = (x: number) => L + x * iw;
  const py = (h: number) => T + (1 - h) * ih;
  const bw = Math.max(3, Math.min(9, iw / Math.max(12, tl.bars.length * 2.5)));
  const y0 = py(0);
  const stamp = (ms: number) => new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <figure className="br-pass-chart" aria-label="Feuerstrahlungsleistung je Überflug">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
        <defs>
          <pattern id={`hatch-${pid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#C9B98F" strokeWidth="1.4" />
          </pattern>
        </defs>
        {tl.gaps.map((g, i) => (
          <rect key={i} x={px(g.x0)} y={T} width={Math.max(1, px(g.x1) - px(g.x0))} height={ih} fill={`url(#hatch-${pid})`} opacity="0.7">
            <title>{g.trailing ? `${de(g.hours, 0)} h seit dem letzten Überflug — keine Beobachtung` : `${de(g.hours, 0)} h ohne Überflug`}</title>
          </rect>
        ))}
        {tl.yTicks.map((y) => (
          <g key={y.label}>
            <line x1={L} x2={W - R} y1={py(y.h)} y2={py(y.h)} stroke="#E0D6BE" strokeWidth="0.6" />
            <text x={L - 4} y={py(y.h) + 3} textAnchor="end" fontSize="8" fill="#8B7355">{y.label}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y0} y2={y0} stroke="#A89A7A" strokeWidth="0.8" />
        {tl.ticks.map((t) => (
          <g key={t.label + t.x}>
            <line x1={px(t.x)} x2={px(t.x)} y1={y0} y2={y0 + 3} stroke="#A89A7A" strokeWidth="0.8" />
            <text x={px(t.x) + 2} y={H - 8} fontSize="8" fill="#8B7355">{t.label}</text>
          </g>
        ))}
        {tl.bars.map((b) => (
          <g key={b.key}>
            {b.hasFrp ? (
              <rect x={px(b.x) - bw / 2} y={py(b.h)} width={bw} height={Math.max(1, y0 - py(b.h))} fill={b.day === false ? '#5C5447' : '#D4632E'} rx="1">
                <title>{`${stamp(b.atMs)} · ${b.satellite} ${b.day === false ? '☾ Nacht' : '☀ Tag'} · ${de(b.frpMw)} MW · ${b.pixels} Px`}</title>
              </rect>
            ) : (
              <circle cx={px(b.x)} cy={y0 - 3} r="2.4" fill="#fff" stroke="#8B7355" strokeWidth="1">
                <title>{`${stamp(b.atMs)} · ${b.satellite} · ${b.pixels} Px ohne FRP-Angabe`}</title>
              </circle>
            )}
            <text x={px(b.x)} y={T - 1} textAnchor="middle" fontSize="7.5" fill="#8B7355">{b.day === false ? '☾' : b.day === true ? '☀' : ''}</text>
          </g>
        ))}
        {nowMs >= tl.fromMs && nowMs <= tl.toMs && (
          <line x1={px((nowMs - tl.fromMs) / (tl.toMs - tl.fromMs))} x2={px((nowMs - tl.fromMs) / (tl.toMs - tl.fromMs))} y1={T} y2={y0} stroke="#A32B1E" strokeWidth="0.8" strokeDasharray="2 2" />
        )}
      </svg>
      <figcaption className="br-note">
        ΣFRP je Überflug (log-Achse, MW) · <span style={{ color: '#D4632E' }}>■</span> Tag · <span style={{ color: '#5C5447' }}>■</span> Nacht · ○ Überflug ohne FRP-Angabe ·
        schraffiert: mehr als {GAP_HOURS} h ohne Überflug (längste Lücke {de(tl.maxGapH, 0)} h) · gestrichelt: jetzt.
        Zwischen zwei Überflügen ist nichts beobachtet — die Balken sind Messpunkte, keine Kurve.
      </figcaption>
    </figure>
  );
}
