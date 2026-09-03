/**
 * BD1 — Verlauf eines Brands: ΣFRP je Überflug als Balken (log-Achse), Beobachtungslücken
 * > 6 h schraffiert, ☀/☾ je Überflug. Reines SVG (D-06). Rechnung in `detail/passTimeline.ts`.
 *
 * BD2: `wide` = das Maß des Dossiers (600 × 190 wie die Vorlage 1a, Achsen 10,5 px); alle
 * SVG-Texte tragen `font-family` ausdrücklich — ohne sie erbt ein `<text>` die Standardschrift
 * des Browsers für SVG, nicht die des Decks (Befund B1, `audit/brandradar-detail-mitte.md`).
 */
import { useId, useMemo } from 'react';
import type { FirePass } from './activity/overpasses';
import { passTimeline, GAP_HOURS } from './detail/passTimeline';

export interface FirePassChartProps {
  passes: readonly FirePass[];
  nowMs: number;
  compact?: boolean;
  /** Dossier-Maß (volle Panelbreite). Schlägt `compact`. */
  wide?: boolean;
  /** Breite des Dossier-Maßes in SVG-Einheiten (380 = Desktop-Spalte, 560 = Tablet-Spalte) — 12-px-Schrift rendert dann als ≈ 12 px. */
  wideWidth?: number;
}

const de = (n: number, frac = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: frac });
const FONT = "'League Spartan', system-ui, sans-serif";

export function FirePassChart({ passes, nowMs, compact = false, wide = false, wideWidth = 380 }: FirePassChartProps) {
  const tl = useMemo(() => passTimeline(passes, nowMs), [passes, nowMs]);
  const pid = useId().replace(/:/g, '');
  if (!tl) return null;
  // wide: 380 × 160 Einheiten — in der ~380-px-Spalte des Dossiers rendert 12 px Schrift als 12 px (die Vorlage skaliert 600 Einheiten auf dieselbe Spalte und käme auf 6,5 px).
  const W = wide ? wideWidth : compact ? 300 : 380, H = wide ? 160 : 118, L = wide ? 40 : 40, R = wide ? 12 : 8, T = wide ? 18 : 10, B = wide ? 36 : 22;
  const fs = wide ? 12 : 8;
  const iw = W - L - R, ih = H - T - B;
  const px = (x: number) => L + x * iw;
  const py = (h: number) => T + (1 - h) * ih;
  const bw = Math.max(3, Math.min(wide ? 22 : 9, iw / Math.max(12, tl.bars.length * 2.5)));
  const y0 = py(0);
  const stamp = (ms: number) => new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  // Dossier: Beschriftungen entzerren — bei dicht liegenden Überflügen (drei Satelliten in 20 min) trägt nur
  // der erste einer Gruppe Zeitstempel und Tag/Nacht-Zeichen, die MW-Zahl nur, wenn Platz ist und sie
  // nicht in die Y-Achsen-Beschriftung läuft (x ≥ L+30); der Titel bleibt je Balken.
  const stampAt = new Set<string>(); const mwAt = new Set<string>(); const glyphAt = new Set<string>();
  if (wide) { let ls = -1e9, lm = -1e9, lg = -1e9; for (const b of tl.bars) { const x = px(b.x); if (x - ls >= 76) { stampAt.add(b.key); ls = x; } if (b.hasFrp && x - lm >= 34 && x >= L + 30) { mwAt.add(b.key); lm = x; } if (x - lg >= 14) { glyphAt.add(b.key); lg = x; } } }
  const nowX = nowMs >= tl.fromMs && nowMs <= tl.toMs ? px((nowMs - tl.fromMs) / (tl.toMs - tl.fromMs)) : null;
  return (
    <figure className={`br-pass-chart${wide ? ' is-wide' : ''}`} aria-label="Feuerstrahlungsleistung je Überflug">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" fontFamily={FONT}>
        <defs>
          <pattern id={`hatch-${pid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#C9B98F" strokeWidth="1.4" />
          </pattern>
        </defs>
        {tl.gaps.map((g, i) => {
          const x0 = px(g.x0), x1 = px(g.x1);
          const label = g.trailing ? `keine Beobachtung · ${de(g.hours, 0)} h (Nachlauf)` : `keine Beobachtung · ${de(g.hours, 0)} h`;
          return (
            <g key={i}>
              <rect x={x0} y={T} width={Math.max(1, x1 - x0)} height={ih} fill={`url(#hatch-${pid})`} opacity="0.7">
                <title>{g.trailing ? `${de(g.hours, 0)} h seit dem letzten Überflug — keine Beobachtung` : `${de(g.hours, 0)} h ohne Überflug`}</title>
              </rect>
              {wide && x1 - x0 > 110 && (
                <text x={(x0 + x1) / 2} y={T + ih / 2} textAnchor="middle" fontSize={fs} fontFamily={FONT} fill="#8B7355">{label}</text>
              )}
            </g>
          );
        })}
        {tl.yTicks.map((y) => (
          <g key={y.label}>
            <line x1={L} x2={W - R} y1={py(y.h)} y2={py(y.h)} stroke="#E0D6BE" strokeWidth="0.6" />
            <text x={L - 5} y={py(y.h) + 3} textAnchor="end" fontSize={fs} fontFamily={FONT} fill="#A89A7A">{y.label}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y0} y2={y0} stroke="#A89A7A" strokeWidth="0.8" />
        {tl.ticks.map((t) => (
          <g key={t.label + t.x}>
            <line x1={px(t.x)} x2={px(t.x)} y1={y0} y2={y0 + 3} stroke="#A89A7A" strokeWidth="0.8" />
            {/* wide: die Tageslinie schweigt, wenn ein Überflug-Zeichen dicht daneben steht (der Stempel unter dem Balken nennt den Tag). */}
            {(!wide || !tl.bars.some((b) => glyphAt.has(b.key) && Math.abs(px(b.x) - px(t.x)) < 40)) && <text x={px(t.x) + 2} y={H - (wide ? 24 : 8)} fontSize={fs} fontFamily={FONT} fill="#8B7355">{t.label}</text>}
          </g>
        ))}
        {tl.bars.map((b) => (
          <g key={b.key}>
            {b.hasFrp ? (
              <rect x={px(b.x) - bw / 2} y={py(b.h)} width={bw} height={Math.max(1, y0 - py(b.h))} fill={b.day === false ? '#5C5447' : '#D4632E'} rx={wide ? 2 : 1}>
                <title>{`${stamp(b.atMs)} · ${b.satellite} ${b.day === false ? '☾ Nacht' : '☀ Tag'} · ${de(b.frpMw)} MW · ${b.pixels} Px`}</title>
              </rect>
            ) : (
              <circle cx={px(b.x)} cy={y0 - 3} r={wide ? 3.2 : 2.4} fill="#fff" stroke="#8B7355" strokeWidth="1">
                <title>{`${stamp(b.atMs)} · ${b.satellite} · ${b.pixels} Px ohne FRP-Angabe`}</title>
              </circle>
            )}
            {wide && mwAt.has(b.key) && (
              <text x={px(b.x)} y={py(b.h) - 5} textAnchor="middle" fontSize={fs} fontFamily={FONT} fill="#5C5447">{de(b.frpMw)} MW</text>
            )}
            {(!wide || glyphAt.has(b.key)) && <text x={px(b.x)} y={wide ? y0 + 14 : T - 1} textAnchor="middle" fontSize={wide ? 12 : 7.5} fontFamily={FONT} fill={wide ? '#5C5447' : '#8B7355'}>{b.day === false ? '☾' : b.day === true ? '☀' : ''}</text>}
            {wide && stampAt.has(b.key) && (
              <text x={px(b.x)} y={H - 6} textAnchor="middle" fontSize={fs} fontFamily={FONT} fill="#A89A7A">{stamp(b.atMs)}</text>
            )}
          </g>
        ))}
        {nowX != null && (
          <>
            <line x1={nowX} x2={nowX} y1={T - (wide ? 6 : 0)} y2={y0 + (wide ? 6 : 0)} stroke="#A32B1E" strokeWidth={wide ? 1.5 : 0.8} strokeDasharray={wide ? '4 4' : '2 2'} />
            {wide && <text x={Math.min(nowX + 4, W - 30)} y={T} fontSize={fs} fontFamily={FONT} fill="#A32B1E">jetzt</text>}
          </>
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
