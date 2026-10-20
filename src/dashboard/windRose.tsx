/**
 * Windrose · Verteilung (P63) — zeichnet nur `WindRoseVM`: 16 Sektoren um die Herkunftsrichtung, je Sektor nach Windklasse
 * gestapelt; der Radius folgt der Wurzel des Zeitanteils, damit auch seltene Richtungen sichtbar bleiben.
 * Die Kachel zeigt nur die Rose; Zahlen und Erklärung stehen in der Detailansicht (Fenster über dem Dashboard).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { originTitle } from './origin';
import { compass16, num } from './format';
import { Val } from './tiles';
import type { WindRoseVM } from './model/types';

const C = 150, R = 104, R0 = 20, HALF = 9.6;
/** leicht → stark (Windklassen aus `ROSE_LABELS` im Modell) */
const CLASS_FILLS = ['#CFE0EA', '#8FB6CC', '#4F86A8', '#25506E'];
const NB = ' ';

const pt = (deg: number, r: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const f1 = (n: number) => n.toFixed(1);
const xy = (p: [number, number]) => `${f1(p[0])} ${f1(p[1])}`;

/** Ringsegment zwischen Radius `ri` und `ro` im Winkel deg ± HALF. */
function segment(deg: number, ri: number, ro: number): string {
  return `M${xy(pt(deg - HALF, ro))} A${f1(ro)} ${f1(ro)} 0 0 1 ${xy(pt(deg + HALF, ro))} L${xy(pt(deg + HALF, ri))} A${f1(ri)} ${f1(ri)} 0 0 0 ${xy(pt(deg - HALF, ri))} Z`;
}

const pct = (x: number) => `${Math.round(x * 100)}${NB}%`;
const CARDINAL: Array<[number, string, boolean]> = [[0, 'N', true], [45, 'NO', false], [90, 'O', true], [135, 'SO', false], [180, 'S', true], [225, 'SW', false], [270, 'W', true], [315, 'NW', false]];

function roseLabel(vm: WindRoseVM): string {
  return vm.headline.t ? `Windrose: ${vm.headline.t}, ${vm.detail.t ?? ''}` : 'Windrose: keine Richtungsverteilung verfügbar';
}

function RoseSvg({ vm }: { vm: WindRoseVM }) {
  const glow = `dbd-rose-glow-${useId().replace(/:/g, '')}`;
  const maxShare = Math.max(0.0001, ...vm.sectors.map((s) => s.share));
  // Ringabstand: kleinster runder Wert, bei dem höchstens vier Ringe nötig sind
  const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1].find((st) => Math.ceil(maxShare / st) <= 4) ?? 1;
  const rings = Math.max(1, Math.ceil(maxShare / step - 1e-9));
  const scaleMax = rings * step;
  const rOf = (share: number) => R0 + (R - R0) * Math.sqrt(Math.min(1, share / scaleMax));
  const now = vm.nowDeg;
  return (
    <svg viewBox="0 0 300 300" role="img" aria-label={roseLabel(vm)} className="dbd-rose-svg">
      <defs>
        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F5F1E8" stopOpacity="0" />
          <stop offset="100%" stopColor="#E8DFC8" stopOpacity=".55" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={R + 6} fill={`url(#${glow})`} />
      {Array.from({ length: rings }, (_, k) => {
        const r = rOf((k + 1) * step);
        const last = k === rings - 1;
        return <circle key={k} cx={C} cy={C} r={f1(r)} fill="none" stroke={last ? '#CFC4A6' : '#E0D6BE'} strokeWidth=".9" strokeDasharray={last ? undefined : '2 3'} />;
      })}
      <g stroke="#E6DDC6" strokeWidth=".8">
        {CARDINAL.map(([d]) => { const a = pt(d, R0), b = pt(d, R + 4); return <line key={d} x1={f1(a[0])} y1={f1(a[1])} x2={f1(b[0])} y2={f1(b[1])} />; })}
      </g>
      <g>
        {vm.sectors.map((s, i) => {
          if (s.share <= 0) return null;
          let cum = 0;
          const tip = `${compass16(s.deg)} (${Math.round(s.deg)}°) · ${pct(s.share)} der Zeit${s.classes.map((x, k) => (x > 0 ? ` · ${vm.classLabels[k]} m/s ${pct(x)}` : '')).join('')}`;
          return (
            <g key={s.deg} className="dbd-rose-petal" style={{ ['--i' as string]: i }}>
              <title>{tip}</title>
              {s.classes.map((x, k) => {
                if (x <= 0) return null;
                const ri = k === 0 ? R0 : rOf(cum);
                cum += x;
                return <path key={k} d={segment(s.deg, ri, rOf(cum))} fill={CLASS_FILLS[k]} stroke="#FAF6EA" strokeWidth=".7" strokeLinejoin="round" />;
              })}
            </g>
          );
        })}
      </g>
      {Array.from({ length: rings }, (_, k) => {
        const p = pt(11.25, rOf((k + 1) * step));
        return <text key={k} x={f1(p[0] + 3)} y={f1(p[1] - 2)} className="dbd-rose-ring">{pct((k + 1) * step)}</text>;
      })}
      {now != null && (() => {
        const a = pt(now, R0), b = pt(now, R + 3);
        return (
          <g data-origin="P64">
            <line x1={f1(a[0])} y1={f1(a[1])} x2={f1(b[0])} y2={f1(b[1])} stroke="#2C2A26" strokeWidth="1.4" strokeDasharray="3 2.5" />
            <circle cx={f1(b[0])} cy={f1(b[1])} r="4" fill="#2C2A26" stroke="#FAF6EA" strokeWidth="1.6" />
          </g>
        );
      })()}
      <circle cx={C} cy={C} r={R0 - 4} fill="#FAF6EA" stroke="#E0D6BE" strokeWidth=".9" />
      <g fontFamily="League Spartan" textAnchor="middle" fill="#8B7355">
        {CARDINAL.map(([d, t, major]) => { const p = pt(d, R + (major ? 17 : 15)); return <text key={d} x={f1(p[0])} y={f1(p[1] + (major ? 4.5 : 3.2))} fontSize={major ? 13 : 9} fontWeight={major ? 700 : 500} fill={major ? '#2C2A26' : '#8B7355'}>{t}</text>; })}
      </g>
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

export function WindRoseTile({ vm }: { vm: WindRoseVM }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <section className="dbd-tile dbd-rose" aria-label="Windrose Verteilung" data-origin="P63" title={originTitle('P63')}>
        <div className="dbd-rose-head">
          <span className="dbd-eyebrow">WINDROSE · VERTEILUNG</span>
          <button ref={opener} type="button" className="dbd-rose-open" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Windrose groß anzeigen" title="Groß anzeigen mit allen Angaben">
            <ExpandIcon />
          </button>
        </div>
        <RoseSvg vm={vm} />
        {vm.headline.t == null && <div className="dbd-rose-detail"><Val v={vm.headline} long /></div>}
      </section>
      {open && <WindRoseDetail vm={vm} onClose={() => { setOpen(false); opener.current?.focus(); }} />}
    </>
  );
}

/** Detailansicht: Fenster über dem Dashboard mit großer Rose, Windklassen, Richtungen und Lesehilfe. */
function WindRoseDetail({ vm, onClose }: { vm: WindRoseVM; onClose: () => void }) {
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
  const classMax = Math.max(0.0001, ...vm.classShare);
  const ranked = vm.sectors.filter((s) => s.share > 0).sort((a, b) => b.share - a.share);
  const maxShare = Math.max(0.0001, ...ranked.map((s) => s.share));
  const now = vm.nowDeg;
  const nowTxt = now == null ? null : `${compass16(now)} · ${Math.round(now)}°${vm.nowWind == null ? '' : ` · ${num(vm.nowWind, 1)}${NB}m/s`}`;
  return (
    <div className="dbd-rose-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dbd-rose-dialog" role="dialog" aria-modal="true" aria-labelledby="dbd-rose-dlg-title">
        <div className="dbd-rose-dlg-head">
          <div>
            <span className="dbd-eyebrow" id="dbd-rose-dlg-title">WINDROSE · VERTEILUNG</span>
            <span className="dbd-rose-range">nächste {vm.hours}{NB}h</span>
          </div>
          <button ref={closeBtn} type="button" className="dbd-rose-open" onClick={onClose} aria-label="Schließen" title="Schließen (Esc)"><CloseIcon /></button>
        </div>
        <div className="dbd-rose-dlg-main">
          <RoseSvg vm={vm} />
          <div className="dbd-rose-body">
            <div className="dbd-rose-headline"><Val v={vm.headline} long /></div>
            <div className="dbd-rose-detail"><Val v={vm.detail} long /></div>
            <h3 className="dbd-rose-h">Windstärke (m/s)</h3>
            <div className="dbd-rose-legend" role="list" aria-label="Windklassen in Meter pro Sekunde">
              {vm.classLabels.map((l, k) => (
                <div key={l} className="dbd-rose-row" role="listitem">
                  <i style={{ background: CLASS_FILLS[k] }} />
                  <span className="dbd-rose-cls">{l}{NB}m/s</span>
                  <span className="dbd-rose-bar"><b style={{ width: `${(vm.classShare[k] / classMax) * 100}%`, background: CLASS_FILLS[k] }} /></span>
                  <span className="dbd-rose-pct">{pct(vm.classShare[k])}</span>
                </div>
              ))}
              {vm.unresolvedShare > 0 && (
                <div className="dbd-rose-row" role="listitem">
                  <i className="is-hatched" />
                  <span className="dbd-rose-cls">ohne Richtung</span>
                  <span className="dbd-rose-bar" />
                  <span className="dbd-rose-pct">{pct(vm.unresolvedShare)}</span>
                </div>
              )}
            </div>
            {nowTxt && <div className="dbd-rose-now" data-origin="P64"><i />jetzt {nowTxt} <span className="dbd-rose-nowmark">(Marke in der Rose)</span></div>}
          </div>
        </div>
        {ranked.length > 0 && (
          <>
            <h3 className="dbd-rose-h">Richtungen im Zeitraum</h3>
            <div className="dbd-rose-dirs">
              {ranked.map((s) => (
                <div key={s.deg} className="dbd-rose-dir">
                  <span className="dbd-rose-dirname">{compass16(s.deg)}<small>{Math.round(s.deg)}°</small></span>
                  <span className="dbd-rose-sbar">
                    <span style={{ width: `${(s.share / maxShare) * 100}%` }}>
                      {s.classes.map((x, k) => (x > 0 ? <b key={k} style={{ flexGrow: x, background: CLASS_FILLS[k] }} title={`${vm.classLabels[k]} m/s · ${pct(x)}`} /> : null))}
                    </span>
                  </span>
                  <span className="dbd-rose-pct">{pct(s.share)}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <h3 className="dbd-rose-h">So ist die Rose gelesen</h3>
        <ul className="dbd-rose-notes">
          <li>Die Rose zeigt, <strong>woher</strong> der Wind weht (0° = Nord, oben). Ein Fächer nach Südwest heißt: Wind aus Südwest.</li>
          <li>Grundlage ist je Stunde die Richtung und der Mittelwind (p50, 10 m über Grund) aus buscosun Fusion, gewichtet mit der Dauer des Zeitschritts.</li>
          <li>Der Radius wächst mit der Wurzel des Zeitanteils, damit seltene Richtungen sichtbar bleiben; die Ringe nennen den Anteil der Zeit.</li>
          <li>Stunden ohne freigegebene Richtung (schwacher, drehender Wind) stehen in keinem Fächer, sondern als „ohne Richtung".</li>
        </ul>
      </div>
    </div>
  );
}
