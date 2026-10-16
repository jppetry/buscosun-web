/**
 * Phase SK: the place card as its own lazy piece (the deck loads it only while Phase SK is on (`?sk=0` off) and the layer on) — it pulls the HZS
 * model and buscosun Fusion modules, which must not enter the deck or map chunk.
 *
 * Command-Deck tile (like the Minutenverlauf): eyebrow, the sentence as hero, the 48-h bar (a tap sets the map time,
 * E-SK-2), legend — and an "enlarge" icon that opens an overlay with KPIs and the height chart (`SnowLineChart`).
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Country } from '../types';
import { useSnowArrival, type SnowArrivalState } from './useSnowArrival';
import { groupCells3h, type SnowArrival, type SnowCell } from './snowArrival';
import { fmtM } from '../nowcast/heightTime/heightTimeModel';
import SnowLineChart from './SnowLineChart';
import '../nowcast/minuteSeries.css';
import './snowCap.css';

const FMT_T = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtT = (ms: number) => FMT_T.format(ms).replace('.', '');

const CELL_WORD: Record<SnowCell['kind'], string> = {
  snow: 'Schneefallgrenze bei dir oder tiefer', band: 'Grenze knapp über dir (in der Spanne)', rain: 'Grenze über dir', gap: 'keine Daten',
};
const RANGES = [{ h: 24, label: '24 h' }, { h: 48, label: '48 h' }];

function IconExpand() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function Eyebrow({ text }: { text: string }) {
  return <span className="mv-eyebrow"><span className="mv-live sk-live" aria-hidden="true"><span /><span /></span>{text}</span>;
}

/** The 48-h bar: a tap on an hour sets the map time (E-SK-2), a second tap or "Karte folgt wieder dem Slider" releases it. */
function SnowBar({ a, mapMs, pickMs, onPick, variant }: { a: SnowArrival; mapMs: number | null; pickMs: number | null; onPick: (ms: number | null) => void; variant: 'desktop' | 'mobile' }) {
  const marker = pickMs ?? mapMs;
  const cells = variant === 'mobile' ? groupCells3h(a.cells) : a.cells;
  return (
    <>
      <div className="sk-bar" role="group" aria-label="Kartenzeit wählen (48 h)">
        {cells.map((c) => {
          const on = marker != null && marker >= c.fromMs && marker < c.toMs;
          const mid = c.fromMs + Math.floor((c.toMs - c.fromMs) / 2 / 3_600_000) * 3_600_000 + 30 * 60_000;
          return (
            <button key={c.fromMs} type="button" aria-pressed={on}
              className={`sk-cell sk-cell--${c.kind}${on ? ' is-on' : ''}`}
              title={`${fmtT(c.fromMs)} · ${CELL_WORD[c.kind]}`} aria-label={`${fmtT(c.fromMs)}: ${CELL_WORD[c.kind]}`}
              onClick={() => onPick(on && pickMs != null ? null : mid)} />
          );
        })}
      </div>
      <div className="sk-bar-axis"><span>jetzt</span><span>+24 h</span><span>+48 h</span></div>
      <div className="sk-legend-key">
        <span><i className="sk-sw" style={{ background: '#4F5FB8' }} /> Grenze bei dir</span>
        <span><i className="sk-sw sk-sw-band" /> knapp darüber</span>
        <span><i className="sk-sw" style={{ background: '#D7CFBD' }} /> darüber</span>
      </div>
      {pickMs != null && <button type="button" className="sk-follow" onClick={() => onPick(null)}>Karte folgt wieder dem Slider</button>}
    </>
  );
}

function SnowArrivalCard({ st, mapMs, pickMs, onPick, variant }: { st: SnowArrivalState; mapMs: number | null; pickMs: number | null; onPick: (ms: number | null) => void; variant: 'desktop' | 'mobile' }) {
  const [open, setOpen] = useState(false);
  const [rangeH, setRangeH] = useState(48);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  if (st.status === 'loading') {
    return (
      <section className={`mv-card sk-tile sk-tile--${variant}`} aria-label="Schneefallgrenze am Ort">
        <div className="mv-head"><Eyebrow text="Schneefallgrenze" /></div>
        <div className="sk-state"><span className="ev-spinner" /> buscosun Fusion rechnet die Schneefallgrenze am Ort …</div>
      </section>
    );
  }
  if (st.status === 'gap' || !st.arrival) {
    return (
      <section className={`mv-card sk-tile sk-tile--${variant}`} aria-label="Schneefallgrenze am Ort">
        <div className="mv-head"><Eyebrow text="Schneefallgrenze" /></div>
        <div className="sk-state sk-warn">{st.reason ?? 'keine Daten'}</div>
      </section>
    );
  }
  const a = st.arrival;
  const valid = a.points.filter((p) => p.p50 != null) as Array<typeof a.points[number] & { p50: number }>;
  const lowest = valid.length ? valid.reduce((m, p) => (p.p50 < m.p50 ? p : m)) : null;
  const snowHours = a.cells.filter((c) => c.kind === 'snow').length;
  const bandHours = a.cells.filter((c) => c.kind === 'band').length;
  const kpis = [
    { k: 'Tiefster Wert · 48 h', v: lowest ? `≈ ${fmtM(lowest.p50)} m` : '—', s: lowest ? `${fmtT(lowest.tMs)}${lowest.p10 != null && lowest.p90 != null ? ` · Spanne ${fmtM(lowest.p10)}–${fmtM(lowest.p90)} m` : ''}` : 'keine Daten' },
    { k: 'Ortshöhe', v: a.hTrue != null ? `${fmtM(a.hTrue)} m` : '—', s: 'Höhe des Orts, auf die sich die Grenze bezieht' },
    { k: 'Schnee bei dir', v: snowHours ? `${snowHours} h` : 'keine', s: bandHours ? `dazu ${bandHours} h knapp darüber (in der Spanne)` : 'keine Stunde knapp darüber' },
  ];

  return (
    <>
      <section className={`mv-card sk-tile sk-tile--${variant}`} aria-label="Schneefallgrenze am Ort" data-origin="fusion">
        <div className="mv-head">
          <Eyebrow text="Schneefallgrenze" />
          <button type="button" className="mv-expand" onClick={() => setOpen(true)} aria-label="Schneefallgrenze über 48 Stunden groß öffnen" title="Groß öffnen · 48 h"><IconExpand /></button>
        </div>
        <SnowBar a={a} mapMs={mapMs} pickMs={pickMs} onPick={onPick} variant={variant} />
      </section>

      {open && createPortal(
        <div className="mv-modal" role="dialog" aria-modal="true" aria-label="Schneefallgrenze am Ort" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="mv-modal-panel">
            <div className="mv-modal-head">
              <div>
                <Eyebrow text={`Regenradar · ${st.fusionName}`} />
                <h2 className="mv-modal-title">Schneefallgrenze am Ort · 48 h</h2>
              </div>
              <div className="mv-modal-tools">
                <div className="mv-seg" role="tablist" aria-label="Zeitraum">
                  {RANGES.map((r) => (
                    <button key={r.h} type="button" role="tab" aria-selected={rangeH === r.h} className={rangeH === r.h ? 'is-active' : ''} onClick={() => setRangeH(r.h)}>{r.label}</button>
                  ))}
                </div>
                <button type="button" className="mv-close" onClick={() => setOpen(false)} aria-label="Schließen"><IconClose /></button>
              </div>
            </div>
            <p className="mv-modal-summary">{a.display}</p>
            <div className="mv-kpis">
              {kpis.map((x) => (
                <div key={x.k} className="mv-kpi">
                  <span className="mv-kpi-k">{x.k}</span>
                  <span className="mv-kpi-v">{x.v}</span>
                  <span className="mv-kpi-s">{x.s}</span>
                </div>
              ))}
            </div>
            <div className="mv-modal-chart">
              <SnowLineChart arrival={a} fromMs={st.fromMs} rangeH={rangeH} />
            </div>
            <div className="mv-modal-foot">
              <span>● {st.fusionName} · Linie = wahrscheinlichste Schneefallgrenze (p50), Band = Spanne p10–p90, blau getönt = Grenze bei dir oder tiefer.</span>
              <span>Nur die nativen Schritte von buscosun Fusion (1 h, später 3 h); Lücken bleiben Lücken.</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default function SnowArrivalPanel({ place, mapMs, pickMs, onPick, variant }: { place: { lat: number; lon: number; country: Country }; mapMs: number | null; pickMs: number | null; onPick: (ms: number | null) => void; variant: 'desktop' | 'mobile' }) {
  const st = useSnowArrival(place, true);
  return <SnowArrivalCard st={st} mapMs={mapMs} pickMs={pickMs} onPick={onPick} variant={variant} />;
}
