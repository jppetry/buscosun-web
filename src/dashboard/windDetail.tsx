/**
 * Windrichtung in der Jetzt-Kachel (Jan 31.10.): Kompass mit Pfeil und Himmelsrichtung oben rechts; ein Klick öffnet die
 * Wind-Detailansicht — je Tag die Fusion-Schritte mit Richtung (Pfeil), Mittelwind und Böen (p50). Zeichnet nur `WindVM`.
 * Pfeile zeigen, wohin der Wind weht (wie die Tages-Detailansicht); die Angabe „aus SW" nennt, woher er kommt.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { originTitle } from './origin';
import { compass16, dayLabel, hhmm, localParts, num } from './format';
import { Val } from './tiles';
import { CLASS_FILLS, CloseIcon, ExpandIcon } from './windRose';
import type { WindVM } from './model/types';

const NB = ' ';
/** Windklassen wie in der Windrose (`ROSE_BOUNDS` im Modell: 3 / 6 / 10 m/s). */
const BOUNDS = [3, 6, 10];
const CLASS_LABELS = ['< 3', '3–6', '6–10', '≥ 10'];
const classOf = (w: number | null) => (w == null ? 0 : BOUNDS.filter((b) => w >= b).length);
/** `windDir` null = die Konzentrationsschranke der Fusion (fuse.ts) gibt die Richtung nicht frei — kein Urteil „Wind dreht". */
const NO_DIR_TITLE = 'buscosun Fusion gibt für diese Stunde keine Richtung frei — die Quellen sind sich über die Richtung nicht einig genug, oft bei schwachem, drehendem Wind';

/** Pfeil nach oben = Wind weht nach Norden; gedreht um Herkunft + 180°. */
function Arrow({ dir, size, fill }: { dir: number; size: number; fill: string }) {
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true" className="dbd-wd-arrow">
      <g transform={`rotate(${(dir + 180).toFixed(1)})`}>
        <path d="M0 -10 L6 6 L0 2.6 L-6 6 Z" fill={fill} stroke="#25506E" strokeOpacity=".35" strokeWidth="1" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** Kleiner Kompass: Ring, Nordmarke, Pfeil in Windrichtung. */
function Compass({ dir, size }: { dir: number | null; size: number }) {
  return (
    <svg width={size} height={size} viewBox="-20 -20 40 40" aria-hidden="true" className="dbd-wd-compass">
      <circle r="18.5" fill="#FFFFFF" stroke="rgba(44, 42, 38, .14)" />
      {[0, 90, 180, 270].map((a) => <line key={a} x1="0" y1="-18.5" x2="0" y2={a ? -15.5 : -14} stroke={a ? '#C4B896' : '#2C2A26'} strokeWidth={a ? 1 : 1.6} transform={`rotate(${a})`} />)}
      {dir == null
        ? <circle r="4" fill="none" stroke="#A89A7A" strokeWidth="1.4" strokeDasharray="2 2" />
        : <g transform={`rotate(${(dir + 180).toFixed(1)})`}><path d="M0 -12 L6.5 8 L0 4 L-6.5 8 Z" fill="#2C2A26" /></g>}
    </svg>
  );
}

/** Oben rechts in der Jetzt-Kachel: Kompass, Himmelsrichtung, Grad — die ganze Fläche öffnet die Detailansicht. */
export function WindBadge({ vm }: { vm: WindVM }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const dir = vm.nowDeg;
  const ready = vm.state === 'ok' && (vm.steps?.length ?? 0) > 0;
  return (
    <>
      <button
        ref={opener} type="button" className="dbd-wd-badge" onClick={() => setOpen(true)} disabled={!ready}
        aria-haspopup="dialog" aria-label={`Wind ${dir == null ? 'mit unklarer Richtung' : `aus ${compass16(dir)}`}: Richtung und Stärke der nächsten Tage anzeigen`}
        title="Windrichtung und -stärke der nächsten Tage, stündlich" data-origin="P64"
      >
        <Compass dir={dir} size={38} />
        <span className="dbd-wd-badge-txt">
          <span className="dbd-wd-badge-l">WIND AUS</span>
          <span className="dbd-wd-badge-v">{dir == null ? (vm.state === 'ok' ? <span title={NO_DIR_TITLE}>unklar</span> : <Val v={vm.title} />) : compass16(dir)}</span>
          {dir != null && <span className="dbd-wd-badge-s">{Math.round(dir)}°</span>}
        </span>
        <span className="dbd-wd-badge-open"><ExpandIcon /></span>
      </button>
      {open && <WindDetail vm={vm} onClose={() => { setOpen(false); opener.current?.focus(); }} />}
    </>
  );
}

function WindDetail({ vm, onClose }: { vm: WindVM; onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Schritte nach Ortskalendertag gruppiert (Europe/Berlin wie die Tageskarten)
  const days = useMemo(() => {
    const out: Array<{ key: string; t: number; steps: NonNullable<WindVM['steps']> }> = [];
    for (const s of vm.steps ?? []) {
      const key = localParts(s.t).dayKey;
      const last = out[out.length - 1];
      if (last && last.key === key) last.steps.push(s);
      else out.push({ key, t: s.t, steps: [s] });
    }
    return out;
  }, [vm.steps]);
  const [di, setDi] = useState(0);
  const day = days[Math.min(di, days.length - 1)];
  const dir = vm.nowDeg;
  const stepH = day && day.steps.length > 1 ? Math.round((day.steps[1].t - day.steps[0].t) / 3_600_000) : 1;
  const dayName = (i: number, t: number) => (i === 0 ? 'Heute' : i === 1 ? 'Morgen' : dayLabel(t));
  return (
    <div className="dbd-rose-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dbd-rose-dialog dbd-wd-dialog" role="dialog" aria-modal="true" aria-labelledby="dbd-wd-title">
        <div className="dbd-rose-dlg-head">
          <div>
            <span className="dbd-eyebrow" id="dbd-wd-title">WIND · NÄCHSTE TAGE</span>
            <span className="dbd-rose-range">Richtung, Mittelwind und Böen aus buscosun Fusion</span>
          </div>
          <button ref={closeBtn} type="button" className="dbd-rose-open" onClick={onClose} aria-label="Schließen" title="Schließen (Esc)"><CloseIcon /></button>
        </div>

        <div className="dbd-wd-hero" data-origin="P64" title={originTitle('P64')}>
          <Compass dir={dir} size={72} />
          <div>
            <div className="dbd-rose-headline">{dir == null ? 'Richtung jetzt unklar' : `Jetzt aus ${compass16(dir)} · ${Math.round(dir)}°`}</div>
            <div className="dbd-rose-detail" data-origin="P10" title={originTitle('P10')}>
              {vm.nowWind != null ? `${num(vm.nowWind, 1)}${NB}m/s` : 'Wind n. v.'}{vm.nowGust != null ? ` · Böen ${num(vm.nowGust, 1)}${NB}m/s` : ''}
            </div>
          </div>
        </div>

        <div className="dbd-nc-seg dbd-wd-days" role="group" aria-label="Tag">
          {days.map((d, i) => (
            <button key={d.key} type="button" className={i === di ? 'is-active' : undefined} aria-pressed={i === di} onClick={() => setDi(i)}>{dayName(i, d.t)}</button>
          ))}
        </div>

        {day && (
          <>
            <h3 className="dbd-rose-h">{Math.min(di, days.length - 1) < 2 ? `${dayName(Math.min(di, days.length - 1), day.t)} · ` : ''}{dayLabel(day.t)}{stepH > 1 ? ` · im ${stepH}-h-Takt` : ' · stündlich'}</h3>
            <ol className="dbd-wd-hours" data-origin="P95" title={originTitle('P95')}>
              {day.steps.map((s) => {
                const k = classOf(s.w);
                return (
                  <li key={s.t} className={s.dir == null ? 'is-calm' : undefined}>
                    <span className="dbd-wd-h">{hhmm(s.t)}</span>
                    <span className="dbd-wd-a" data-origin="P63" title={s.dir == null ? NO_DIR_TITLE : `aus ${compass16(s.dir)} · ${Math.round(s.dir)}°`}>
                      {s.dir == null ? <span className="dbd-wd-calm" /> : <Arrow dir={s.dir} size={30} fill={CLASS_FILLS[k]} />}
                    </span>
                    <span className="dbd-wd-d">{s.dir == null ? 'unklar' : compass16(s.dir)}</span>
                    <span className="dbd-wd-w">{s.w == null ? 'n. v.' : num(s.w, 1)}<small>{NB}m/s</small></span>
                    <span className="dbd-wd-g">{s.gust == null ? '' : `Böen ${num(s.gust, 0)}`}</span>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        <div className="dbd-wd-legend" aria-label="Windklassen in Meter pro Sekunde">
          {CLASS_LABELS.map((l, k) => <span key={l}><i style={{ background: CLASS_FILLS[k] }} />{l}{NB}m/s</span>)}
          <span><span className="dbd-wd-calm is-small" />Richtung unklar</span>
        </div>
        <ul className="dbd-rose-notes dbd-wd-notes">
          <li>Der Pfeil zeigt, <strong>wohin</strong> der Wind weht; die Angabe darunter, <strong>woher</strong> er kommt (0° = Nord).</li>
          <li>Mittelwind und Böen in 10 m über Grund (p50). Die Farbe des Pfeils folgt dem Mittelwind, wie in der Windrose.</li>
          <li>„unklar": {NO_DIR_TITLE}.</li>
        </ul>
      </div>
    </div>
  );
}
