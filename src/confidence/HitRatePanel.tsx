/**
 * Treffsicherheit / Rückblick (EPIC 7, UI). Reiht die Quellen nach mittlerer
 * Abweichung gegen das tatsächlich eingetretene Wetter (US-7.1/7.3), umschaltbar
 * nach Zeitraum (7/14/30 T) und Variable (Temp/Niederschlag/Wind). Darunter der
 * Rückblick „Vorhersage vs. tatsächlich" für einen vergangenen Tag mit Lead-
 * Filter (US-7.4). Abgrenzung zur Stabilität wird im Text betont.
 */

import { useMemo, useState } from 'react';
import type { HitRateData, Lead, VarKey } from './hitRate';
import { HIT_VARS, HIT_LEADS } from './hitRate';
import { sourceRanking, HIT_MIN_DAYS } from './hitRateModel';

const WINDOWS = [7, 14, 30] as const;

export default function HitRatePanel({ data }: { data: HitRateData }) {
  const [windowDays, setWindowDays] = useState<number>(14);
  const [variable, setVariable] = useState<VarKey>('temp');
  const [lead, setLead] = useState<Lead>(3);
  const [dayISO, setDayISO] = useState<string>(() => data.pastDayISOs[data.pastDayISOs.length - 1] ?? '');

  const ranking = useMemo(() => sourceRanking(data, variable, 1, windowDays), [data, variable, windowDays]);
  const vMeta = HIT_VARS.find((v) => v.key === variable)!;

  // Balkenlänge: bei Abweichung relativ zum schlechtesten, bei Trefferquote = raw.
  const maxRaw = Math.max(...ranking.scores.filter((s) => Number.isFinite(s.raw)).map((s) => s.raw), 0.0001);
  const barPct = (raw: number) => {
    if (!Number.isFinite(raw)) return 0;
    return ranking.higherIsBetter ? raw * 100 : (1 - raw / maxRaw) * 90 + 10; // kleiner Fehler → längerer Balken
  };

  return (
    <section className="fc-hit">
      <div className="fc-block-head fc-hit-head">
        <span className="rt-eyebrow fc-eyebrow">Treffsicherheit · Rückblick · wie nah lagen die Vorhersagen am echten Wetter?</span>
        <div className="fc-seg" role="tablist" aria-label="Zeitraum">
          {WINDOWS.map((w) => (
            <button key={w} type="button" role="tab" aria-selected={windowDays === w}
              className={`fc-seg-btn${windowDays === w ? ' is-on' : ''}`} onClick={() => setWindowDays(w)}>{w} Tage</button>
          ))}
        </div>
      </div>

      <p className="fc-hit-lead">Abgleich gegen das tatsächlich eingetretene Wetter — eine Prognose kann <em>stabil und trotzdem falsch</em> sein.</p>

      <div className="fc-hit-grid">
        {/* Ranking */}
        <div className="rt-card fc-hit-rank">
          <div className="fc-hit-rank-top">
            <span className="rt-eyebrow fc-eyebrow">Quellen nach Treffsicherheit · {vMeta.label} · {windowDays} Tage</span>
            <div className="fc-seg fc-seg-sm" role="tablist" aria-label="Variable">
              {HIT_VARS.map((v) => (
                <button key={v.key} type="button" role="tab" aria-selected={variable === v.key}
                  className={`fc-seg-btn${variable === v.key ? ' is-on' : ''}`} onClick={() => setVariable(v.key)}>{v.label}</button>
              ))}
            </div>
          </div>

          {!ranking.reliable && (
            <p className="fc-hit-warn">⚠ Datenbasis noch klein ({ranking.dayBasis}/{HIT_MIN_DAYS} Tage) — Reihung noch unsicher.</p>
          )}

          <ol className="fc-hit-list">
            {ranking.scores.map((s, i) => (
              <li key={s.id} className={`fc-hit-row${s.isConsensus ? ' is-consensus' : ''}${i === 0 ? ' is-best' : ''}`}>
                <span className="fc-hit-rank-no">{i + 1}</span>
                <span className="fc-hit-name" style={{ color: s.isConsensus ? '#2C2A26' : s.color }}>
                  <i className="fc-hit-sw" style={{ background: s.color }} />{s.label}
                  {i === 0 && Number.isFinite(s.raw) && <em className="fc-hit-best-tag">zuletzt am besten</em>}
                </span>
                <span className="fc-hit-bar"><i style={{ width: `${barPct(s.raw)}%`, background: s.isConsensus ? '#2C2A26' : s.color }} /></span>
                <span className="fc-hit-val">{s.valueText}</span>
              </li>
            ))}
          </ol>
          {variable === 'precip' && <p className="fc-hit-note">Niederschlag wird als Ja/Nein-Treffer bewertet (nicht als ±-Differenz wie Temperatur).</p>}
        </div>

        {/* Rückblick: Vorhersage vs. tatsächlich */}
        <div className="rt-card fc-hit-back">
          <div className="fc-hit-back-top">
            <span className="rt-eyebrow fc-eyebrow">Vorhersage vs. tatsächlich</span>
            <div className="fc-hit-back-ctrl">
              <select className="fc-hit-select" value={dayISO} onChange={(e) => setDayISO(e.target.value)} aria-label="Vergangener Tag">
                {[...data.pastDayISOs].reverse().map((iso) => (
                  <option key={iso} value={iso}>{new Date(`${iso}T12:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}</option>
                ))}
              </select>
              <div className="fc-seg fc-seg-sm" role="tablist" aria-label="Vorlaufzeit">
                {HIT_LEADS.map((l) => (
                  <button key={l} type="button" role="tab" aria-selected={lead === l}
                    className={`fc-seg-btn${lead === l ? ' is-on' : ''}`} onClick={() => setLead(l)}>{l} T vorher</button>
                ))}
              </div>
            </div>
          </div>
          <BacktestChart data={data} variable={variable} lead={lead} dayISO={dayISO} unit={vMeta.unit} />
        </div>
      </div>
    </section>
  );
}

// --- Rückblick-Chart: Ist (Konsens) vs. Konsens-Vorhersage bei Lead N ---------
const W = 880, H = 260, PADL = 42, PADR = 14, PADT = 14, PADB = 28;
const PLOTW = W - PADL - PADR, PLOTH = H - PADT - PADB;

function BacktestChart({ data, variable, lead, dayISO, unit }: { data: HitRateData; variable: VarKey; lead: Lead; dayISO: string; unit: string }) {
  const idx = data.hours.map((h, i) => ({ h, i })).filter(({ h }) => new Date(h.tMs).toISOString().slice(0, 10) === dayISO).map(({ i }) => i);
  const actual = idx.map((i) => data.consensusActual[variable][i]);
  const forecast = idx.map((i) => {
    const vals = data.models.map((m) => data.series[variable][m.id].byLead[lead][i]).filter(Number.isFinite);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
  });
  const tms = idx.map((i) => data.hours[i].tMs);

  const pairs = actual.map((a, k) => ({ a, f: forecast[k], t: tms[k] })).filter((p) => Number.isFinite(p.a) && Number.isFinite(p.t));
  if (pairs.length < 2) return <div className="fc-chart-empty">Für diesen Tag liegen keine Rückblick-Daten vor.</div>;

  let vMin = Infinity, vMax = -Infinity;
  for (const p of pairs) { for (const val of [p.a, p.f]) if (Number.isFinite(val)) { vMin = Math.min(vMin, val); vMax = Math.max(vMax, val); } }
  const pad = Math.max(1, (vMax - vMin) * 0.12); vMin -= pad; vMax += pad;

  const t0 = pairs[0].t, t1 = pairs[pairs.length - 1].t;
  const x = (ms: number) => PADL + (PLOTW * (ms - t0)) / Math.max(1, t1 - t0);
  const y = (v: number) => PADT + PLOTH * (1 - (v - vMin) / Math.max(1, vMax - vMin));
  const path = (sel: (p: typeof pairs[0]) => number) => {
    const pts = pairs.filter((p) => Number.isFinite(sel(p)));
    return pts.length >= 2 ? `M ${pts.map((p) => `${x(p.t).toFixed(1)} ${y(sel(p)).toFixed(1)}`).join(' L ')}` : '';
  };

  // Größte Abweichung markieren.
  let worst = pairs[0], worstD = -1;
  for (const p of pairs) { if (Number.isFinite(p.f)) { const d = Math.abs(p.f - p.a); if (d > worstD) { worstD = d; worst = p; } } }

  const vTicks: number[] = [];
  const step = variable === 'temp' ? 5 : variable === 'wind' ? 10 : 1;
  for (let v = Math.ceil(vMin / step) * step; v <= vMax; v += step) vTicks.push(v);
  const hourTicks = pairs.filter((p) => new Date(p.t).getHours() % 6 === 0);

  return (
    <div className="fc-chart-wrap">
      <svg className="fc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Vorhersage ${lead} Tage vorher gegen tatsächlich, größte Abweichung ${worstD.toFixed(1)} ${unit}.`}>
        {vTicks.map((v) => (
          <g key={v}><line x1={PADL} y1={y(v)} x2={W - PADR} y2={y(v)} stroke="#E0D6BE" strokeDasharray="2 4" />
            <text x={PADL - 6} y={y(v) + 3} className="fc-axislabel" textAnchor="end">{v}{variable === 'temp' ? '°' : ''}</text></g>
        ))}
        {Number.isFinite(worst.f) && (
          <line x1={x(worst.t)} y1={y(worst.a)} x2={x(worst.t)} y2={y(worst.f)} stroke="#B5532A" strokeWidth={2} strokeDasharray="3 3" />
        )}
        <path d={path((p) => p.f)} fill="none" stroke="#6B7A8F" strokeWidth={2} strokeDasharray="6 4" strokeLinejoin="round" />
        <path d={path((p) => p.a)} fill="none" stroke="#2C2A26" strokeWidth={2.6} strokeLinejoin="round" />
        {Number.isFinite(worst.f) && (
          <text x={x(worst.t)} y={y(Math.max(worst.a, worst.f)) - 6} className="fc-axislabel" textAnchor="middle" fill="#B5532A">
            {(worst.f - worst.a >= 0 ? '+' : '−')}{Math.abs(worstD).toFixed(variable === 'precip' ? 1 : 0)}{variable === 'temp' ? '°' : ` ${unit}`} daneben
          </text>
        )}
        {hourTicks.map((p) => (
          <text key={p.t} x={x(p.t)} y={H - 9} className="fc-axislabel" textAnchor="middle">
            {new Date(p.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </text>
        ))}
      </svg>
      <div className="fc-chart-legend">
        <span><i className="fc-lg-consensus" /> tatsächlich (Analyse-Konsens)</span>
        <span><i className="fc-lg-fc" /> Vorhersage {lead} T vorher</span>
      </div>
    </div>
  );
}
