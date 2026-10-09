/**
 * Phase SK: the place card as its own lazy piece (the deck loads it only while Phase SK is on (`?sk=0` off) and the layer on) — it pulls the HZS
 * model and buscosun Fusion modules, which must not enter the deck or map chunk.
 */
import type { Country } from '../types';
import { useSnowArrival, type SnowArrivalState } from './useSnowArrival';
import { groupCells3h, type SnowCell } from './snowArrival';
import './snowCap.css';

const FMT_T = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtT = (ms: number) => FMT_T.format(ms).replace('.', '');

const CELL_WORD: Record<SnowCell['kind'], string> = {
  snow: 'Schneefallgrenze bei dir oder tiefer', band: 'Grenze knapp über dir (in der Spanne)', rain: 'Grenze über dir', gap: 'keine Daten',
};

/**
 * Place card (readout, mobile Schnellblick): the sentence of buscosun Fusion at the place + a 48-h bar; a tap on an hour
 * sets the map time (E-SK-2), a second tap or "Karte folgt wieder dem Slider" releases it.
 */
function SnowArrivalCard({ st, mapMs, pickMs, onPick, variant }: { st: SnowArrivalState; mapMs: number | null; pickMs: number | null; onPick: (ms: number | null) => void; variant: 'desktop' | 'mobile' }) {
  if (st.status === 'loading') return <div className={`sk-card sk-card--${variant}`}><span className="ev-spinner" /> buscosun Fusion rechnet die Schneefallgrenze am Ort …</div>;
  if (st.status === 'gap' || !st.arrival) return <div className={`sk-card sk-card--${variant} sk-warn`}>Schneefallgrenze am Ort: {st.reason ?? 'keine Daten'}</div>;
  const a = st.arrival;
  const marker = pickMs ?? mapMs;
  const cells = variant === 'mobile' ? groupCells3h(a.cells) : a.cells;
  return (
    <div className={`sk-card sk-card--${variant}`}>
      <div className="sk-sentence">{a.display}</div>
      <div className="sk-meta">{[...a.meta, st.fusionName].join(' · ')}</div>
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
    </div>
  );
}

export default function SnowArrivalPanel({ place, mapMs, pickMs, onPick, variant }: { place: { lat: number; lon: number; country: Country }; mapMs: number | null; pickMs: number | null; onPick: (ms: number | null) => void; variant: 'desktop' | 'mobile' }) {
  const st = useSnowArrival(place, true);
  return <SnowArrivalCard st={st} mapMs={mapMs} pickMs={pickMs} onPick={onPick} variant={variant} />;
}
