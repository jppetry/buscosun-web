/**
 * SW-5/SW-6 — Stundenband: table AND time control (plan SW-5 `SeaBand.tsx`, design `reference/seewetter-desktop.dc.html`).
 * Rows: hour, wind arrow, wind, gusts, sea state Hs, period, wave arrow, profile class. One column per hour; the label
 * column is sticky, the hours scroll horizontally, a click or Enter/Space on an hour sets the time of map and readout,
 * ←/→ move the selection. Day separators at local midnight, night columns shaded.
 *
 * Deliberately a plain `<table>`, not `@nivo/heatmap` (prompt: nivo where it keeps the band's properties): nivo's grid
 * draws cells into one SVG/canvas — no table semantics for screen readers, no sticky label column inside the scroll
 * container and no focusable cell per hour. Recorded in audit/seewetter.md §10 (E-SW-17).
 */
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { fmtWind, unitLabel, type SeaClass, type SeaUnit } from './seaProfiles';
import { CLASS_COLOR, CLASS_SHORT, berlinHour, dayShort, f1, hh, tzLabel } from './seaView';

export interface SeaBandHour {
  t: number; windMs: number | null; gustMs: number | null; windDir: number | null;
  hs: number | null; dir: number | null; tm: number | null; cls: SeaClass; reason: string; daylight: boolean;
}

interface Props {
  hours: readonly SeaBandHour[];
  unit: SeaUnit;
  selected: number;
  onPick: (i: number) => void;
  title: string;
  sub: string;
  footnote: string;
  compact?: boolean;
}

const Arrow = ({ to, color }: { to: number | null; color: string }) => (to == null ? <span className="sw-band-none">–</span> : (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <g transform={`rotate(${to} 7 7)`}><path d="M7 12V2M3.6 5.4L7 2l3.4 3.4" /></g>
  </svg>
));

export default function SeaBand({ hours, unit, selected, onPick, title, sub, footnote, compact = false }: Props) {
  const scroller = useRef<HTMLDivElement | null>(null);
  // Keep the selected hour in view.
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-h="${selected}"]`);
    if (el && scroller.current) {
      const sc = scroller.current, l = el.offsetLeft - 72, r = el.offsetLeft + el.offsetWidth;
      if (l < sc.scrollLeft || r > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = Math.max(0, l - 40);
    }
  }, [selected]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === 'ArrowRight' && i + 1 < hours.length) { e.preventDefault(); onPick(i + 1); scroller.current?.querySelector<HTMLElement>(`[data-h="${i + 1}"] button`)?.focus(); }
    if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); onPick(i - 1); scroller.current?.querySelector<HTMLElement>(`[data-h="${i - 1}"] button`)?.focus(); }
  };
  const cls = (h: SeaBandHour, i: number) => `${h.daylight ? '' : 'is-night'}${i === selected ? ' is-sel' : ''}${i > 0 && berlinHour(h.t) === 0 ? ' is-day' : ''}`;
  const tz = hours.length ? tzLabel(hours[0].t) : 'MESZ';
  return (
    <section className={`sw-band${compact ? ' is-compact' : ''}`} aria-label="Stundenband">
      <div className="sw-band-head">
        <span className="sw-eyebrow is-accent">Stundenband</span>
        <span className="sw-band-title">{title}</span>
        <span className="sw-band-sub">{sub}</span>
      </div>
      <div className="sw-band-scroll" ref={scroller}>
        <table className="sw-band-table">
          <caption className="sw-sr">Stundenwerte am Spot: Uhrzeit, Wind, Böen, Seegang, Periode, Wellenrichtung und Einordnung nach deinem Profil. Eine Stunde wählen setzt Karte und Details auf diese Zeit.</caption>
          <thead>
            <tr className="sw-band-days" aria-hidden="true">
              <th className="sw-band-lab" />
              {hours.map((h, i) => <td key={h.t} className={cls(h, i)}>{i === 0 || berlinHour(h.t) === 0 ? dayShort(h.t) : ''}</td>)}
            </tr>
            <tr>
              <th scope="row" className="sw-band-lab">{tz}</th>
              {hours.map((h, i) => (
                <th key={h.t} scope="col" data-h={i} className={cls(h, i)}>
                  <button type="button" aria-pressed={i === selected} onClick={() => onPick(i)} onKeyDown={(e) => onKey(e, i)}
                    aria-label={`${dayShort(h.t)} ${hh(h.t)} Uhr: ${CLASS_SHORT[h.cls]}`}>{hh(h.t)}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="sw-band-lab">Wind</th>
              {hours.map((h, i) => <td key={h.t} className={cls(h, i)}><Arrow to={h.windDir == null ? null : (h.windDir + 180) % 360} color="#2C2A26" /></td>)}
            </tr>
            <tr className="is-strong">
              <th scope="row" className="sw-band-lab">{unitLabel(unit)}</th>
              {hours.map((h, i) => <td key={h.t} className={cls(h, i)}>{fmtWind(h.windMs, unit)}</td>)}
            </tr>
            <tr className="is-soft">
              <th scope="row" className="sw-band-lab">Böen</th>
              {hours.map((h, i) => <td key={h.t} className={cls(h, i)}>{fmtWind(h.gustMs, unit)}</td>)}
            </tr>
            <tr className="is-mid">
              <th scope="row" className="sw-band-lab">Welle m</th>
              {hours.map((h, i) => <td key={h.t} className={cls(h, i)}>{h.hs == null ? '–' : f1(h.hs)}</td>)}
            </tr>
            <tr className="is-soft">
              <th scope="row" className="sw-band-lab">Periode s</th>
              {hours.map((h, i) => <td key={h.t} className={cls(h, i)}>{h.tm == null ? '–' : f1(h.tm)}</td>)}
            </tr>
            <tr>
              <th scope="row" className="sw-band-lab">Wellen</th>
              {hours.map((h, i) => <td key={h.t} className={cls(h, i)}><Arrow to={h.dir == null || h.hs == null || h.hs < 0.05 ? null : (h.dir + 180) % 360} color="#0F6E7A" /></td>)}
            </tr>
            <tr className="sw-band-prof">
              <th scope="row" className="sw-band-lab">Profil</th>
              {hours.map((h, i) => (
                <td key={h.t} className={cls(h, i)} title={`${CLASS_SHORT[h.cls]}: ${h.reason}`}>
                  <span className={`sw-band-bar${h.cls === 'keine' ? ' is-hatched' : ''}`} style={h.cls !== 'keine' ? { background: CLASS_COLOR[h.cls] } : undefined}>
                    <span className="sw-sr">{CLASS_SHORT[h.cls]}</span>
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="sw-band-foot">
        <span>Pfeile zeigen, wohin Wind und Wellen laufen</span>
        <span>dunkler Grund = Nacht</span>
        <span className="sw-band-foot-note">{footnote}</span>
      </div>
    </section>
  );
}
