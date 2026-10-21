/**
 * Tages-Detailansicht — Fenster über dem Dashboard (heller Rahmen wie Windrose und Nowcast). Ein Tag, wählbare Größen als
 * gestapelte Felder mit gemeinsamer Zeitachse und gemeinsamem Fadenkreuz; die Zahlen kommen aus `DayDetailVM`
 * (buscosun Fusion), die Felder formatieren sie nur. Pfeiltasten wechseln den Tag, Esc schließt.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Val } from './tiles';
import { useWidth } from './fusionTiles';
import { WeatherIcon } from './icons';
import { localParts, num } from './format';
import { HEAVY_MMH } from './model/rules';
import type { DayHour, DayVM } from './model/types';

const H = 3_600_000;
const NB = ' ';

type Key = 't' | 'precip' | 'wind' | 'cloud' | 'humidity' | 'pressure' | 'snow';
const PARAMS: Array<{ k: Key; label: string; color: string }> = [
  { k: 't', label: 'Temperatur', color: '#D2662D' },
  { k: 'precip', label: 'Niederschlag', color: '#3A6FA8' },
  { k: 'wind', label: 'Wind & Böen', color: '#2F7F78' },
  { k: 'cloud', label: 'Bewölkung', color: '#6F7B89' },
  { k: 'humidity', label: 'Feuchte', color: '#3A8FB7' },
  { k: 'pressure', label: 'Luftdruck', color: '#6B5BA6' },
  { k: 'snow', label: 'Schneegrenze', color: '#5E7FCB' },
];
const SNOW = '#9B8CE0';
const PAD_T = 8;

// ---------------------------------------------------------------------------
// Kurven (monotone kubische Glättung, damit Zwischenwerte nie über die Stützwerte schwingen)
// ---------------------------------------------------------------------------

type P = [number, number];
const f = (n: number) => n.toFixed(1);

function curveParts(pts: P[]): { m: string; c: string } {
  const n = pts.length;
  if (!n) return { m: '', c: '' };
  const m = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  if (n === 1) return { m, c: '' };
  const dx: number[] = [], sl: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); sl.push((pts[i + 1][1] - pts[i][1]) / dx[i]); }
  const t: number[] = [sl[0]];
  for (let i = 1; i < n - 1; i++) t.push(sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2);
  t.push(sl[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (sl[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / sl[i], b = t[i + 1] / sl[i], s = a * a + b * b;
    if (s > 9) { const tau = 3 / Math.sqrt(s); t[i] = tau * a * sl[i]; t[i + 1] = tau * b * sl[i]; }
  }
  let c = '';
  for (let i = 0; i < n - 1; i++) {
    const k = dx[i] / 3;
    c += `C${f(pts[i][0] + k)} ${f(pts[i][1] + t[i] * k)} ${f(pts[i + 1][0] - k)} ${f(pts[i + 1][1] - t[i + 1] * k)} ${f(pts[i + 1][0])} ${f(pts[i + 1][1])}`;
  }
  return { m, c };
}
const linePath = (pts: P[]) => { const p = curveParts(pts); return p.m + p.c; };
function areaPath(top: P[], bottom: P[]): string {
  if (top.length < 2 || bottom.length < 2) return '';
  const a = curveParts(top), b = curveParts([...bottom].reverse());
  return `${a.m}${a.c}L${b.m.slice(1)}${b.c}Z`;
}
/** Läufe ohne Lücke: ein `null` unterbricht die Kurve, statt sie zu überbrücken. */
function runs(hs: DayHour[], val: (h: DayHour) => number | null, X: (t: number) => number, Y: (v: number) => number): P[][] {
  const out: P[][] = [];
  let cur: P[] = [];
  for (const h of hs) {
    const x = val(h);
    if (x == null) { if (cur.length) out.push(cur); cur = []; } else cur.push([X(h.t), Y(x)]);
  }
  if (cur.length) out.push(cur);
  return out;
}
/** Fläche unter einer Kurve bis zur Grundlinie. */
const fillPath = (r: P[], yBase: number) => `${linePath(r)}L${f(r[r.length - 1][0])} ${f(yBase)}L${f(r[0][0])} ${f(yBase)}Z`;

function nice(lo: number, hi: number, minSpan: number): { min: number; max: number; ticks: number[] } {
  if (hi - lo < minSpan) { const m = (hi + lo) / 2; lo = m - minSpan / 2; hi = m + minSpan / 2; }
  const raw = (hi - lo) / 3;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((q) => q * p).find((s) => s >= raw) ?? raw;
  const min = Math.floor(lo / step) * step, max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step * 1e-6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min, max, ticks };
}
const ext = (xs: Array<number | null>): [number, number] | null => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? [Math.min(...v), Math.max(...v)] : null;
};
const hh = (t: number) => `${String(localParts(t).h).padStart(2, '0')}:00`;

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function DayDetail({ days, index, onIndex, onClose }: { days: DayVM[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const d = days[index];
  const det = d.detail ?? null;
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [sel, setSel] = useState<Key[]>(['t', 'precip', 'wind']);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const nav = useRef({ index, days, onIndex, onClose });
  nav.current = { index, days, onIndex, onClose };
  useEffect(() => {
    closeBtn.current?.focus();
    const key = (e: KeyboardEvent) => {
      const n = nav.current;
      if (e.key === 'Escape') { e.stopPropagation(); n.onClose(); return; }
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      let j = n.index + dir;
      while (j >= 0 && j < n.days.length && !n.days[j].detail) j += dir;
      if (j >= 0 && j < n.days.length) { e.preventDefault(); n.onIndex(j); }
    };
    document.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, []);
  useEffect(() => { setHoverT(null); }, [index]);

  const prevIdx = (() => { for (let j = index - 1; j >= 0; j--) if (days[j].detail) return j; return -1; })();
  const nextIdx = (() => { for (let j = index + 1; j < days.length; j++) if (days[j].detail) return j; return -1; })();
  const avail = (k: Key) => !!det && det.summary[k].t != null;
  const shown = PARAMS.filter((p) => sel.includes(p.k) && avail(p.k));
  const toggle = (k: Key) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const hrs = useMemo(() => det?.hours ?? [], [det]);
  const from = hrs.length ? hrs[0].t - H / 2 : 0, to = hrs.length ? hrs[hrs.length - 1].t + H / 2 : 1;
  const padL = 48, padR = 14;
  const plotW = Math.max(10, width - padL - padR);
  const X = (t: number) => padL + ((t - from) / (to - from)) * plotW;
  const tickTs = useMemo(() => hrs.filter((h) => localParts(h.t).h % 3 === 0).map((h) => h.t), [hrs]);
  const hov = hoverT == null ? null : hrs.reduce<DayHour | null>((b, x) => (!b || Math.abs(x.t - hoverT) < Math.abs(b.t - hoverT) ? x : b), null);
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHoverT(from + ((e.clientX - r.left) / r.width) * (to - from));
  };
  const lastKey = shown.length ? shown[shown.length - 1].k : null;

  /**
   * Rahmen eines Feldes: Nachtschatten, Gitter, y-Beschriftung, Stundenlinien, „jetzt", Fadenkreuz, Zeigerfläche.
   * `plotH` = Höhe der Zeichenfläche, `extra` = Platz darunter für Streifen; die x-Beschriftung trägt nur das letzte Feld.
   */
  const frame = (k: Key, plotH: number, extra: number, yTicks: number[], yFmt: (v: number) => string, Y: (v: number) => number, children: ReactNode) => {
    const yBase = PAD_T + plotH;
    const h = yBase + extra + (k === lastKey ? 22 : 4);
    return (
      <svg width={width} height={h} className="dbd-dd-svg" role="img" aria-label={PARAMS.find((p) => p.k === k)?.label}>
        {det!.nights.map((n, i) => <rect key={i} x={X(n.from)} y={PAD_T} width={Math.max(0, X(n.to) - X(n.from))} height={plotH} className="dbd-dd-night" />)}
        {yTicks.map((v) => <g key={v}><line x1={padL} x2={padL + plotW} y1={Y(v)} y2={Y(v)} className="dbd-dd-grid" /><text x={padL - 7} y={Y(v) + 3.5} textAnchor="end" className="dbd-dd-t">{yFmt(v)}</text></g>)}
        {tickTs.map((t) => <line key={t} x1={X(t)} x2={X(t)} y1={PAD_T} y2={yBase} className="dbd-dd-vgrid" />)}
        {k === lastKey && tickTs.map((t) => <text key={t} x={X(t)} y={h - 5} textAnchor="middle" className="dbd-dd-t">{hh(t)}</text>)}
        {det!.nowMs >= from && det!.nowMs <= to && <line x1={X(det!.nowMs)} x2={X(det!.nowMs)} y1={PAD_T} y2={yBase} className="dbd-dd-now" />}
        {children}
        {hov && <line x1={X(hov.t)} x2={X(hov.t)} y1={PAD_T} y2={yBase + extra} className="dbd-dd-cross" />}
        <rect x={padL} y={PAD_T} width={plotW} height={plotH + extra} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} style={{ cursor: 'crosshair', touchAction: 'pan-y' }} />
      </svg>
    );
  };

  const readout = (k: Key, h: DayHour): string => {
    const n1 = (x: number | null, dg = 1) => (x == null ? '—' : num(x, dg));
    switch (k) {
      case 't': return `${n1(h.t50)}${NB}°C${h.t10 != null && h.t90 != null ? ` (${n1(h.t10, 0)} … ${n1(h.t90, 0)})` : ''} · Taupunkt ${n1(h.td)}${NB}°C`;
      case 'precip': return `${n1(h.pr)}${NB}mm/h${h.prP90 != null && h.prP90 > (h.pr ?? 0) + 0.02 ? ` (bis ${n1(h.prP90)})` : ''} · Chance ${h.pWet == null ? '—' : Math.round(h.pWet * 100)}${NB}%${(h.pSnow ?? 0) >= 0.5 ? ' · Schnee' : ''}`;
      case 'wind': return `${n1(h.w50)}${NB}m/s · Böen ${n1(h.gust)}${NB}m/s${h.dir != null ? ` · ${Math.round(h.dir)}°` : ''}`;
      case 'cloud': return `${n1(h.clct, 0)}${NB}% · hoch ${n1(h.clch, 0)} · mittel ${n1(h.clcm, 0)} · tief ${n1(h.clcl, 0)}`;
      case 'humidity': return `${n1(h.rh, 0)}${NB}%`;
      case 'pressure': return `${n1(h.ps, 1)}${NB}hPa`;
      default: return `${n1(h.snowline, 0)}${NB}m`;
    }
  };

  const panel = (k: Key) => {
    const p = PARAMS.find((x) => x.k === k)!;
    const col = p.color;
    const gid = `dbd-dd-${k}`;
    const grad = (
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".34" /><stop offset="1" stopColor={col} stopOpacity=".02" /></linearGradient>
      </defs>
    );
    const stroke = { fill: 'none', stroke: col, strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
    let body: ReactNode = null;
    if (k === 't') {
      const e = ext([...hrs.map((x) => x.t10), ...hrs.map((x) => x.t90), ...hrs.map((x) => x.t50), ...hrs.map((x) => x.td)]) ?? [0, 1];
      const sc = nice(e[0], e[1], 4), plotH = 130, yBase = PAD_T + plotH;
      const Y = (v: number) => PAD_T + (1 - (v - sc.min) / (sc.max - sc.min)) * plotH;
      const band = hrs.filter((x) => x.t90 != null && x.t10 != null);
      const upper = runs(band, (x) => x.t90, X, Y), lower = runs(band, (x) => x.t10, X, Y);
      const tMax = hrs.reduce<DayHour | null>((b, x) => (x.t50 != null && (!b || x.t50 > (b.t50 as number)) ? x : b), null);
      const tMin = hrs.reduce<DayHour | null>((b, x) => (x.t50 != null && (!b || x.t50 < (b.t50 as number)) ? x : b), null);
      body = frame(k, plotH, 0, sc.ticks, (v) => `${num(v, 0)}°`, Y, (
        <>
          {grad}
          {upper.map((u, i) => <path key={i} d={areaPath(u, lower[i] ?? [])} fill={`url(#${gid})`} />)}
          {runs(hrs, (x) => x.td, X, Y).map((r, i) => <path key={`d${i}`} d={linePath(r)} className="dbd-dd-td" />)}
          {runs(hrs, (x) => x.t50, X, Y).map((r, i) => <path key={i} d={linePath(r)} {...stroke} />)}
          {tMax && tMax.t50 != null && <g><circle cx={X(tMax.t)} cy={Y(tMax.t50)} r="4" fill={col} stroke="#fff" strokeWidth="1.8" /><text x={X(tMax.t)} y={Y(tMax.t50) - 9} textAnchor="middle" className="dbd-dd-t dbd-dd-t--b">{num(tMax.t50, 0)}°</text></g>}
          {tMin && tMin !== tMax && tMin.t50 != null && <g><circle cx={X(tMin.t)} cy={Y(tMin.t50)} r="4" fill={col} stroke="#fff" strokeWidth="1.8" /><text x={X(tMin.t)} y={Y(tMin.t50) + 17} textAnchor="middle" className="dbd-dd-t dbd-dd-t--b">{num(tMin.t50, 0)}°</text></g>}
          {hov && hov.t50 != null && <circle cx={X(hov.t)} cy={Y(hov.t50)} r="4.5" fill="#fff" stroke={col} strokeWidth="2.4" />}
          <line x1={padL} x2={padL + plotW} y1={yBase} y2={yBase} className="dbd-dd-base" />
        </>
      ));
    } else if (k === 'precip') {
      const m = Math.max(0.4, ...hrs.map((x) => Math.max(x.pr ?? 0, x.prP90 ?? 0)));
      const top = [0.5, 1, 2, 3, 5, 8, 12, 20, 30, 50].find((s) => m * 1.05 <= s) ?? Math.ceil(m * 1.1);
      const plotH = 100, yBase = PAD_T + plotH;
      const Y = (v: number) => PAD_T + (1 - Math.min(v, top) / top) * plotH;
      const bw = Math.max(3, plotW / Math.max(1, hrs.length) - 3);
      body = frame(k, plotH, 28, [0, top / 2, top], (v) => num(v, v < 1 && v > 0 ? 1 : 0) ?? '', Y, (
        <>
          {hrs.map((x) => {
            const cx = X(x.t), mean = x.pr ?? 0, snow = (x.pSnow ?? 0) >= 0.5;
            const fill = snow ? SNOW : mean >= HEAVY_MMH ? '#2C4F7C' : col;
            return (
              <g key={x.t}>
                {mean >= 0.02 && <rect x={cx - bw / 2} y={Y(mean)} width={bw} height={Math.max(1.5, yBase - Y(mean))} rx={Math.min(3, bw / 2)} fill={fill} fillOpacity=".9" />}
                {x.prP90 != null && x.prP90 > mean + 0.02 && <g className="dbd-dd-whisk"><line x1={cx} x2={cx} y1={Y(x.prP90)} y2={Y(mean)} /><line x1={cx - bw / 3} x2={cx + bw / 3} y1={Y(x.prP90)} y2={Y(x.prP90)} /></g>}
                {x.pWet != null && <rect x={cx - bw / 2} y={yBase + 6} width={bw} height={6} rx="2" fill={col} fillOpacity={0.08 + 0.9 * x.pWet} />}
              </g>
            );
          })}
          <text x={padL} y={yBase + 24} className="dbd-dd-strip">Regenchance je Stunde</text>
          <line x1={padL} x2={padL + plotW} y1={yBase} y2={yBase} className="dbd-dd-base" />
        </>
      ));
    } else if (k === 'wind') {
      const e = ext([...hrs.map((x) => x.w10), ...hrs.map((x) => x.w90), ...hrs.map((x) => x.gust), ...hrs.map((x) => x.w50)]) ?? [0, 1];
      const sc = nice(Math.min(0, e[0]), e[1], 4), plotH = 120, yBase = PAD_T + plotH;
      const Y = (v: number) => PAD_T + (1 - (v - sc.min) / (sc.max - sc.min)) * plotH;
      const band = hrs.filter((x) => x.w10 != null && x.w90 != null);
      const upper = runs(band, (x) => x.w90, X, Y), lower = runs(band, (x) => x.w10, X, Y);
      body = frame(k, plotH, 36, sc.ticks, (v) => num(v, 0) ?? '', Y, (
        <>
          {grad}
          {upper.map((u, i) => <path key={i} d={areaPath(u, lower[i] ?? [])} fill={`url(#${gid})`} />)}
          {runs(hrs, (x) => x.gust, X, Y).map((r, i) => <path key={`g${i}`} d={linePath(r)} className="dbd-dd-gust" />)}
          {runs(hrs, (x) => x.w50, X, Y).map((r, i) => <path key={i} d={linePath(r)} {...stroke} />)}
          {hov && hov.w50 != null && <circle cx={X(hov.t)} cy={Y(hov.w50)} r="4.5" fill="#fff" stroke={col} strokeWidth="2.4" />}
          <line x1={padL} x2={padL + plotW} y1={yBase} y2={yBase} className="dbd-dd-base" />
          {hrs.filter((x) => x.dir != null && localParts(x.t).h % 3 === 0).map((x) => (
            // Pfeil zeigt, wohin der Wind weht (Herkunftsrichtung + 180°)
            <g key={x.t} transform={`translate(${f(X(x.t))} ${f(yBase + 15)}) rotate(${f((x.dir as number) + 180)})`} className="dbd-dd-arrow"><path d="M0 -7 L4 5 L0 2.5 L-4 5 Z" /></g>
          ))}
          <text x={padL} y={yBase + 34} className="dbd-dd-strip">Windrichtung (Pfeil = Wehrichtung)</text>
        </>
      ));
    } else if (k === 'cloud') {
      const plotH = 100, yBase = PAD_T + plotH;
      const Y = (v: number) => PAD_T + (1 - v / 100) * plotH;
      const layers: Array<[string, (x: DayHour) => number | null]> = [['hoch', (x) => x.clch], ['mittel', (x) => x.clcm], ['tief', (x) => x.clcl]];
      const bw = plotW / Math.max(1, hrs.length);
      body = frame(k, plotH, 38, [0, 50, 100], (v) => `${v}`, Y, (
        <>
          {grad}
          {runs(hrs, (x) => x.clct, X, Y).map((r, i) => <g key={i}><path d={fillPath(r, yBase)} fill={`url(#${gid})`} /><path d={linePath(r)} {...stroke} strokeWidth={2.4} /></g>)}
          <line x1={padL} x2={padL + plotW} y1={yBase} y2={yBase} className="dbd-dd-base" />
          {layers.map(([name, val], li) => (
            <g key={name}>
              <text x={padL - 7} y={yBase + 14 + li * 10} textAnchor="end" className="dbd-dd-strip">{name}</text>
              {hrs.map((x) => { const q = val(x); return q == null ? null : <rect key={x.t} x={X(x.t) - bw / 2} y={yBase + 8 + li * 10} width={bw + 0.5} height={8} fill={col} fillOpacity={0.06 + 0.9 * (q / 100)} />; })}
            </g>
          ))}
        </>
      ));
    } else {
      const val = k === 'humidity' ? (x: DayHour) => x.rh : k === 'pressure' ? (x: DayHour) => x.ps : (x: DayHour) => x.snowline;
      const e = ext(hrs.map(val)) ?? [0, 1];
      const sc = k === 'humidity' ? { min: 0, max: 100, ticks: [0, 50, 100] } : nice(e[0], e[1], k === 'pressure' ? 4 : 400);
      const plotH = 84, yBase = PAD_T + plotH;
      const Y = (v: number) => PAD_T + (1 - (v - sc.min) / (sc.max - sc.min)) * plotH;
      body = frame(k, plotH, 0, sc.ticks, (v) => num(v, 0) ?? '', Y, (
        <>
          {grad}
          {runs(hrs, val, X, Y).map((r, i) => <g key={i}><path d={fillPath(r, yBase)} fill={`url(#${gid})`} /><path d={linePath(r)} {...stroke} strokeWidth={2.4} /></g>)}
          {hov && val(hov) != null && <circle cx={X(hov.t)} cy={Y(val(hov) as number)} r="4.5" fill="#fff" stroke={col} strokeWidth="2.4" />}
          <line x1={padL} x2={padL + plotW} y1={yBase} y2={yBase} className="dbd-dd-base" />
        </>
      ));
    }
    return (
      <section key={k} className="dbd-dd-panel" aria-label={p.label}>
        <div className="dbd-dd-ph">
          <i style={{ background: col }} /><b>{p.label}</b>
          <span className="dbd-dd-pv">{hov ? <>{hh(hov.t)} · {readout(k, hov)}</> : <Val v={det!.summary[k]} />}</span>
        </div>
        {width > 0 && body}
      </section>
    );
  };

  return (
    <div className="dbd-rose-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dbd-rose-dialog dbd-dd-dialog" role="dialog" aria-modal="true" aria-labelledby="dbd-dd-title">
        <div className="dbd-rose-dlg-head">
          <div className="dbd-dd-nav">
            <button type="button" className="dbd-rose-open" onClick={() => prevIdx >= 0 && onIndex(prevIdx)} disabled={prevIdx < 0} aria-label="Vorheriger Tag" title="Vorheriger Tag (←)"><Icon d="M15 5l-7 7 7 7" /></button>
            <span className="dbd-eyebrow" id="dbd-dd-title">TAGESVERLAUF</span>
            <button type="button" className="dbd-rose-open" onClick={() => nextIdx >= 0 && onIndex(nextIdx)} disabled={nextIdx < 0} aria-label="Nächster Tag" title="Nächster Tag (→)"><Icon d="M9 5l7 7-7 7" /></button>
          </div>
          <button ref={closeBtn} type="button" className="dbd-rose-open" onClick={onClose} aria-label="Schließen" title="Schließen (Esc)"><Icon d="M5 5l14 14M19 5L5 19" /></button>
        </div>

        <div className="dbd-dd-hero">
          <div>
            <div className="dbd-dd-title">{d.title}</div>
            <Val v={d.text} className="dbd-dd-sub" long />
          </div>
          <div className="dbd-dd-temps">
            <WeatherIcon icon={d.icon} size={44} variant="day" />
            <span><Val v={d.tmax} className="dbd-day-max" /><Val v={d.tmin} className="dbd-day-min" /></span>
          </div>
        </div>
        <div className="dbd-dd-kpis">
          <div><span className="dbf-k">Regen</span><b className={d.rainWet ? 'is-wet' : undefined}><Val v={d.rain} /></b><small><Val v={d.rainSub} /></small></div>
          <div><span className="dbf-k">{d.mid.label}</span><b><Val v={d.mid.value} /></b><small className={d.mid.subWarn ? 'is-warn' : undefined}><Val v={d.mid.sub} /></small></div>
          <div><span className="dbf-k">Konfidenz</span><b><Val v={d.conf.text} /></b></div>
        </div>

        {!det ? <div className="dbd-empty">nicht verfügbar — für diesen Tag liefert buscosun Fusion keine Stundenwerte</div> : (
          <>
            <div className="dbd-dd-chips" role="group" aria-label="Größen im Diagramm">
              {PARAMS.map((p) => {
                const on = sel.includes(p.k) && avail(p.k);
                return (
                  <button key={p.k} type="button" className={on ? 'is-on' : undefined} aria-pressed={on} disabled={!avail(p.k)} onClick={() => toggle(p.k)}
                    title={avail(p.k) ? undefined : 'für diesen Tag nicht verfügbar'} style={on ? { ['--c' as string]: p.color } : undefined}>
                    <i style={{ background: p.color }} />{p.label}
                  </button>
                );
              })}
            </div>
            <div ref={ref} className="dbd-dd-charts" onPointerLeave={() => setHoverT(null)}>
              {shown.length === 0 ? <div className="dbd-empty">Wähle oben mindestens eine Größe.</div> : shown.map((p) => panel(p.k))}
            </div>
            <p className="dbd-dd-foot">Stundenwerte von buscosun Fusion, Zeit in Ortszeit. Bänder zeigen die Spanne p10–p90, graue Flächen die Nacht{det.nowMs >= det.fromMs && det.nowMs <= det.toMs ? ', die gestrichelte Linie „jetzt"' : ''}. Mit der Maus oder dem Finger über ein Feld fahren, um alle gewählten Größen derselben Stunde zu lesen.</p>
          </>
        )}
      </div>
    </div>
  );
}
