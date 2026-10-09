/**
 * Phase RB (`audit/regenbeginn-spanne.md`, `?rb=1`): „Regenbeginn als Spanne" am gewählten Ort — großer Satz, Chip mit
 * Sicherheit + Quelle, schmale Zeitleiste mit weich auslaufendem Band und „jetzt"-Marke. Reine Darstellung von
 * `computeRainWindow`; alle Zahlen kommen aus dem Fenster.
 */
import type { CSSProperties } from 'react';
import { bandGeometry, clock, probWord, type RainWindow } from './rainWindow';
import './rainWindow.css';

const H = 3_600_000;

function axisTicks(w: RainWindow): Array<{ x: number; label: string }> {
  const span = w.axisToMs - w.axisFromMs;
  const n = 4;
  const out: Array<{ x: number; label: string }> = [];
  for (let i = 1; i <= n; i++) {
    const t = w.axisFromMs + (span * i) / n;
    const rounded = span <= 3 * H ? Math.round(t / (15 * 60_000)) * 15 * 60_000 : Math.round(t / H) * H;
    out.push({ x: Math.max(0, Math.min(1, (rounded - w.axisFromMs) / span)), label: clock(rounded) });
  }
  return out;
}

export default function RainWindowCard({ w, place, variant }: { w: RainWindow; place?: string | null; variant: 'desktop' | 'mobile' }) {
  const g = bandGeometry(w);
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
  const word = probWord(w.prob, w.kind);
  const chip = w.prob == null
    ? (w.kind === 'none' ? null : word)
    : w.kind === 'dry' ? `trocken · ${Math.round(w.prob * 100)} %` : `${word} · ${Math.round(w.prob * 100)} %`;
  const span = Math.max(1, w.axisToMs - w.axisFromMs);
  const dryTo = w.kind === 'dry' || w.kind === 'wet' ? Math.max(0, Math.min(1, (w.toMs - w.axisFromMs) / span)) : null;
  const bandStyle: CSSProperties | undefined = g ? {
    left: pct(g.x0), width: pct(Math.max(0.01, g.x1 - g.x0)),
    ['--rb-peak' as string]: pct(g.x1 > g.x0 ? (g.peak - g.x0) / (g.x1 - g.x0) : 0.5),
    ['--rb-c0' as string]: pct(g.x1 > g.x0 ? (g.core0 - g.x0) / (g.x1 - g.x0) : 0.25),
    ['--rb-c1' as string]: pct(g.x1 > g.x0 ? (g.core1 - g.x0) / (g.x1 - g.x0) : 0.75),
  } : undefined;
  const aria = `${w.sentence}${chip ? ` · ${chip}` : ''} · Quelle ${w.sourceLabel}`;
  return (
    <section className={`rb-card rb-card--${variant}${w.uncertain ? ' is-uncertain' : ''} rb-kind-${w.kind}`} aria-label="Regenbeginn als Spanne" data-origin={w.source}>
      <div className="rb-head">
        <span className="rb-eyebrow">{w.kind === 'end' || w.kind === 'wet' ? 'Regenende' : 'Regenbeginn'}{place ? ` · ${place}` : ''}</span>
        <span className="rb-chips">
          {chip && <span className="rb-chip rb-chip--prob" title={w.probNote}>{chip}</span>}
          <span className="rb-chip rb-chip--src" title={w.notes.join('\n')}>{w.sourceLabel}</span>
        </span>
      </div>
      <p className="rb-sentence">{w.sentence}</p>
      {w.kind !== 'none' && (
        <div className="rb-strip" role="img" aria-label={aria}>
          <div className="rb-track">
            {g && <span className="rb-band" style={bandStyle} />}
            {dryTo != null && <span className={`rb-fill rb-fill--${w.kind}`} style={{ width: pct(dryTo) }} />}
            <span className="rb-now" aria-hidden="true" />
          </div>
          <div className="rb-axis" aria-hidden="true">
            <span className="rb-tick rb-tick--now" style={{ left: 0 }}>jetzt</span>
            {axisTicks(w).map((t) => <span key={t.label + t.x} className="rb-tick" style={{ left: pct(t.x) }}>{t.label}</span>)}
          </div>
        </div>
      )}
      {w.uncertain && w.kind !== 'none' && (
        <p className="rb-note">
          {w.prob != null && w.prob < 0.5
            ? `Regenwahrscheinlichkeit unter 50 % — ob und wann es ${w.kind === 'end' ? 'aufhört' : 'regnet'}, ist offen.`
            : 'Zeitfenster breit — genauer lässt sich der Zeitpunkt hier nicht bestimmen.'}
        </p>
      )}
    </section>
  );
}
