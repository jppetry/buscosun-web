/**
 * Windrose · Verteilung (P63) — zeichnet nur `WindRoseVM`: 16 Sektoren um die Herkunftsrichtung, je Sektor nach Windklasse
 * gestapelt; der Radius folgt der Wurzel des Zeitanteils, damit auch seltene Richtungen sichtbar bleiben.
 */
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

/** `compact` = schmale Spalte (erste Reihe): Rose über der Legende, Legende ohne Balken, ohne Fußzeile. */
export function WindRoseTile({ vm, compact }: { vm: WindRoseVM; compact?: boolean }) {
  const maxShare = Math.max(0.0001, ...vm.sectors.map((s) => s.share));
  // Ringabstand: kleinster runder Wert, bei dem höchstens vier Ringe nötig sind
  const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1].find((st) => Math.ceil(maxShare / st) <= 4) ?? 1;
  const rings = Math.max(1, Math.ceil(maxShare / step - 1e-9));
  const scaleMax = rings * step;
  const rOf = (share: number) => R0 + (R - R0) * Math.sqrt(Math.min(1, share / scaleMax));
  const classMax = Math.max(0.0001, ...vm.classShare);
  const now = vm.nowDeg;
  const nowTxt = now == null ? null : `${compass16(now)} · ${Math.round(now)}°${vm.nowWind == null ? '' : ` · ${num(vm.nowWind, 1)}${NB}m/s`}`;
  const label = vm.headline.t ? `Windrose: ${vm.headline.t}, ${vm.detail.t ?? ''}` : 'Windrose: keine Richtungsverteilung verfügbar';
  return (
    <section className={`dbd-tile dbd-rose${compact ? ' is-compact' : ''}`} aria-label="Windrose Verteilung" data-origin="P63" title={originTitle('P63')}>
      <div className="dbd-rose-head">
        <span className="dbd-eyebrow">WINDROSE · VERTEILUNG</span>
        <span className="dbd-rose-range">nächste {vm.hours}{NB}h</span>
      </div>
      <div className="dbd-rose-main">
        <svg viewBox="0 0 300 300" role="img" aria-label={label} className="dbd-rose-svg">
          <defs>
            <radialGradient id="dbd-rose-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F5F1E8" stopOpacity="0" />
              <stop offset="100%" stopColor="#E8DFC8" stopOpacity=".55" />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r={R + 6} fill="url(#dbd-rose-glow)" />
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
        <div className="dbd-rose-body">
          <div className="dbd-rose-headline"><Val v={vm.headline} long /></div>
          <div className="dbd-rose-detail"><Val v={vm.detail} long /></div>
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
              <div className="dbd-rose-row" role="listitem" title="Stunden, in denen buscosun Fusion keine Richtung freigibt (schwacher, drehender Wind) — sie stehen in keinem Sektor">
                <i className="is-hatched" />
                <span className="dbd-rose-cls">ohne Richtung</span>
                <span className="dbd-rose-bar" />
                <span className="dbd-rose-pct">{pct(vm.unresolvedShare)}</span>
              </div>
            )}
          </div>
          {nowTxt && <div className="dbd-rose-now" data-origin="P64"><i />jetzt {nowTxt}</div>}
        </div>
      </div>
      <div className="dbd-caption">Herkunftsrichtung (woher der Wind weht) je Stunde aus buscosun Fusion, nach Dauer gewichtet · Ring = Anteil der Zeit · Farbe = Windstärke 10 m über Grund</div>
    </section>
  );
}
