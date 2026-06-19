/**
 * NC-US-B6 / Ereignisse — Detail-Panels (Mockup 02, untere Hälfte).
 *
 * `AccumulationCard` zeigt die kumulierte Niederschlagssumme über 0–6 h als
 * wachsende Kurve mit min/wahrscheinlich/max-Band (US-B6). `EventsCard` listet
 * die Ereignisse (Regenbeginn, Schauerende/Trockenfenster, Starkregen/Gewitter,
 * Skill-Horizont) aus der Engine.
 */

import { NOWCAST_HORIZON_MIN, NOWCAST_STEP_MIN, type Nowcast, type NowcastEvent, type EventTone } from './nowcastModel';
import { fmtClock, fmtRelMin } from './nowcastView';
import { alpineProfile, type AlpineLevel } from './alpineSplit';

const comma = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');

// --- Akkumulationskurve (US-B6) ---------------------------------------------

const A_W = 560, A_H = 150, A_PADL = 30, A_PADR = 12, A_PADT = 12, A_PADB = 22;

export function AccumulationCard({ nowcast }: { nowcast: Nowcast }) {
  const h = NOWCAST_STEP_MIN / 60;
  // Kumulierte Summen je Schritt.
  let cp = 0, cmin = 0, cmax = 0;
  const pts = nowcast.steps.map((s) => {
    cp += s.mmH * h; cmin += s.mmHMin * h; cmax += s.mmHMax * h;
    return { min: s.minutes, p: cp, lo: cmin, hi: cmax };
  });
  const sum = nowcast.summary;
  const top = Math.max(1, sum.sumMaxMm, ...pts.map((p) => p.hi));
  const plotW = A_W - A_PADL - A_PADR, plotH = A_H - A_PADT - A_PADB;
  const x = (min: number) => A_PADL + (plotW * min) / NOWCAST_HORIZON_MIN;
  const y = (mm: number) => A_PADT + plotH * (1 - mm / top);

  const areaTo = (pick: (p: typeof pts[number]) => number) =>
    `M ${x(0)} ${y(0)} ${pts.map((p) => `L ${x(p.min).toFixed(1)} ${y(pick(p)).toFixed(1)}`).join(' ')} L ${x(NOWCAST_HORIZON_MIN)} ${y(0)} Z`;
  const lineTo = (pick: (p: typeof pts[number]) => number) =>
    `M ${x(0)} ${y(0)} ${pts.map((p) => `L ${x(p.min).toFixed(1)} ${y(pick(p)).toFixed(1)}`).join(' ')}`;

  const yTicks = [0, top / 2, top];

  return (
    <div>
      <div className="nc-block-head">
        <span className="rt-eyebrow nc-eyebrow">Summe · kumuliert über 6 h</span>
        <span className="nc-block-sub">mm gesamt</span>
      </div>
      <div className="rt-card nc-acc-card">
        <div className="nc-acc-head">
          <div>
            <span className="nc-acc-big">{comma(sum.sumMm)} mm</span>
            <span className="nc-acc-sub">wahrscheinlich · Band {comma(sum.sumMinMm)} – {comma(sum.sumMaxMm)}</span>
          </div>
          <div className="nc-acc-scenarios">
            <span className="nc-acc-scn"><i className="nc-acc-min" /> min<b>{comma(sum.sumMinMm)} mm</b></span>
            <span className="nc-acc-scn"><i className="nc-acc-mid" /> wahrsch.<b>{comma(sum.sumMm)} mm</b></span>
            <span className="nc-acc-scn"><i className="nc-acc-max" /> max<b>{comma(sum.sumMaxMm)} mm</b></span>
          </div>
        </div>
        <svg className="nc-acc-svg" viewBox={`0 0 ${A_W} ${A_H}`} role="img" aria-label={`Kumulierte Niederschlagssumme über 6 Stunden, wahrscheinlich ${comma(sum.sumMm)} mm`}>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={A_PADL} y1={y(v)} x2={A_W - A_PADR} y2={y(v)} className="nc-tl-grid" />
              <text x={A_PADL - 5} y={y(v) + 3} className="nc-tl-ylabel" textAnchor="end">{comma(v)}</text>
            </g>
          ))}
          <path d={areaTo((p) => p.hi)} className="nc-acc-band-max" />
          <path d={areaTo((p) => p.p)} className="nc-acc-band-mid" />
          <path d={lineTo((p) => p.hi)} className="nc-acc-line-max" />
          <path d={lineTo((p) => p.p)} className="nc-acc-line-mid" />
          <path d={lineTo((p) => p.lo)} className="nc-acc-line-min" />
          <text x={A_PADL} y={A_H - 6} className="nc-tl-xlabel">{fmtClock(nowcast.nowMs)}</text>
          <text x={A_W - A_PADR} y={A_H - 6} className="nc-tl-xlabel" textAnchor="end">{fmtClock(nowcast.nowMs + NOWCAST_HORIZON_MIN * 60_000)}</text>
        </svg>
      </div>
    </div>
  );
}

// --- Ereignisliste -----------------------------------------------------------

function toneColor(t: EventTone): string {
  switch (t) {
    case 'good': return '#7A9466';
    case 'alert': return '#C0392B';
    case 'warn': return '#C97B47';
    case 'muted': return '#A89A82';
    default: return '#3A6FA8';
  }
}

function toneGlyph(e: NowcastEvent): string {
  if (e.tone === 'good') return '✓';
  if (e.tone === 'alert') return '!';
  if (e.kind === 'beyond-skill') return '?';
  return '•';
}

// --- Alpine Tal/Grat-Trennung (US-F1) ---------------------------------------

const phaseDot: Record<string, string> = { rain: '#3A6FA8', snow: '#6B7A8F', sleet: '#7C8BA0', freezing: '#C0392B', dry: '#C4B896' };

function AlpineLevelBox({ title, lvl }: { title: string; lvl: AlpineLevel }) {
  const snow = lvl.phase === 'snow' || lvl.phase === 'sleet';
  return (
    <div className="nc-alp-level">
      <span className="nc-alp-level-label">{title} · {lvl.elevM} m</span>
      <div className="nc-alp-level-row" style={{ borderColor: phaseDot[lvl.phase] }}>
        <div>
          <span className="nc-alp-rate">{comma(lvl.peakMmH)} mm/h</span>
          <span className="nc-alp-phase" style={{ color: phaseDot[lvl.phase] }}>{lvl.phaseLabel}</span>
          <span className="nc-alp-sub">
            6 h-Summe {comma(lvl.sumMm)} mm{snow && lvl.freshSnowCm != null ? ` · ~${comma(lvl.freshSnowCm)} cm Neuschnee` : ''}
          </span>
        </div>
        <span className="nc-alp-glyph" aria-hidden="true">{snow ? '❄' : '💧'}</span>
      </div>
    </div>
  );
}

export function AlpineCard({ nowcast }: { nowcast: Nowcast }) {
  const p = alpineProfile(nowcast);
  if (!p.isAlpine) return null;
  return (
    <div className="nc-alp-full">
      <div className="nc-block-head">
        <span className="rt-eyebrow nc-eyebrow">Alpine Trennung · Tal vs. Grat</span>
        <span className="nc-block-sub">Phase höhenkorrigiert (Heuristik)</span>
      </div>
      <div className="rt-card nc-alp-card">
        <div className="nc-alp-levels">
          <AlpineLevelBox title="Tal" lvl={p.valley} />
          <AlpineLevelBox title="Grat / Gipfel" lvl={p.ridge} />
        </div>
        <p className="nc-alp-relation">{p.relation}</p>
      </div>
    </div>
  );
}

export function EventsCard({ nowcast }: { nowcast: Nowcast }) {
  const events = nowcast.events;
  return (
    <div>
      <div className="nc-block-head">
        <span className="rt-eyebrow nc-eyebrow">Ereignisse in den nächsten 6 h</span>
      </div>
      <div className="rt-card nc-events-card">
        <ul className="nc-events">
          {events.map((e, i) => (
            <li key={`${e.kind}-${e.atMinutes}-${i}`} className="nc-event">
              <span className="nc-event-dot" style={{ background: toneColor(e.tone) }}>{toneGlyph(e)}</span>
              <span className="nc-event-body">
                <span className="nc-event-title">{e.title}</span>
                <span className="nc-event-detail" style={e.tone === 'alert' ? { color: '#C0392B', fontWeight: 600 } : undefined}>{e.detail}</span>
              </span>
              <span className="nc-event-time">
                {e.timestamp && e.kind !== 'beyond-skill' && <strong style={{ color: toneColor(e.tone) }}>{fmtClock(e.timestamp.getTime())}</strong>}
                {e.kind !== 'beyond-skill' && <em>{e.atMinutes <= 0 ? 'jetzt' : fmtRelMin(e.atMinutes)}</em>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
