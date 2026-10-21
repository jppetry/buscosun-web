/**
 * Jan 16.10.: drei Fusion-Kacheln im Reiter Details — Niederschlag 48 h (P94), Wind und Böen 48 h (P95), Luftdruck
 * 48 h (P96). Zeichnen nur das View-Model (`model/build.ts`); SVG ohne Bibliothek mit gemessener Breite, Crosshair
 * und Tooltip. Farben: Ink/Sand des Command-Deck, Stahl für Wasser, Violett für Schnee.
 */
import { useLayoutEffect, useMemo, useState, type PointerEvent, type ReactNode } from 'react';
import { Val } from './tiles';
import { originTitle } from './origin';
import { dayLabel, hhmm, num } from './format';
import type { PrecipVM, WindBandVM, PressureVM } from './model/types';

const H = 3_600_000;
const NB = ' ';

/** Measured width of the chart box — a callback ref, because the box appears only once the tile has data. */
export function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

/** Midnight lines with the day label plus a 12:00 tick (48 h in a narrow tile: anything denser collides). */
function axis(fromMs: number, toMs: number): { ticks: Array<{ t: number; label: string; day: boolean }> } {
  const ticks: Array<{ t: number; label: string; day: boolean }> = [];
  for (let t = Math.ceil(fromMs / H) * H; t <= toMs; t += H) {
    const d = new Date(t);
    if (d.getMinutes() !== 0) continue;
    if (d.getHours() === 0) ticks.push({ t, label: dayLabel(t + 12 * H), day: true });
    else if (d.getHours() === 12) ticks.push({ t, label: hhmm(t), day: false });
  }
  return { ticks };
}

function Axis({ ticks, X, yBase, right }: { ticks: ReturnType<typeof axis>['ticks']; X: (t: number) => number; yBase: number; right: number }) {
  return (
    <g>
      {ticks.map((tk) => {
        const x = X(tk.t);
        const label = tk.day ? (right - x >= 52 ? tk.label : null) : (right - x >= 18 ? tk.label : null);
        return (
          <g key={tk.t}>
            <line x1={x} x2={x} y1={tk.day ? 4 : yBase} y2={yBase + 4} className={tk.day ? 'dbf-tick dbf-tick--day' : 'dbf-tick'} />
            {label && <text x={x + (tk.day ? 4 : 0)} y={yBase + 14} className={tk.day ? 'dbf-xlabel dbf-xlabel--day' : 'dbf-xlabel'} textAnchor={tk.day ? 'start' : 'middle'}>{label}</text>}
          </g>
        );
      })}
    </g>
  );
}

export function Tip({ left, top, children }: { left: number; top: number; children: ReactNode }) {
  return <div className="dbf-tip" style={{ left, top }} role="status">{children}</div>;
}

function TileShell({ title, o, state, children, foot }: { title: string; o: 'P94' | 'P95' | 'P96'; state: string; children: ReactNode; foot: ReactNode }) {
  return (
    <section className="dbd-tile dbf-tile" aria-label={title} data-origin={o} title={originTitle(o)}>
      <span className="dbd-eyebrow">{title}</span>
      {state === 'loading' ? <div className="dbd-empty dbd-loading" aria-busy="true">lädt …</div>
        : state === 'error' ? <div className="dbd-empty">nicht verfügbar — buscosun Fusion nicht erreichbar</div>
          : children}
      {foot}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Niederschlag 48 h (P94)
// ---------------------------------------------------------------------------

export function PrecipTile({ vm }: { vm: PrecipVM }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hoverT, setHoverT] = useState<number | null>(null);
  const h = 150, padL = 30, padR = 8, padT = 10, padB = 36;
  const plotW = Math.max(10, width - padL - padR), plotH = h - padT - padB, yBase = padT + plotH;
  const X = (t: number) => padL + ((t - vm.fromMs) / (vm.toMs - vm.fromMs)) * plotW;
  const yMax = useMemo(() => {
    const m = Math.max(0.2, ...vm.hours.map((x) => Math.max(x.mean ?? 0, x.p90 ?? 0)));
    const steps = [0.5, 1, 2, 3, 5, 8, 12, 20, 30, 50];
    return steps.find((s) => m * 1.05 <= s) ?? Math.ceil(m * 1.1);
  }, [vm.hours]);
  const Y = (v: number) => padT + plotH - (Math.min(v, yMax) / yMax) * plotH;
  const { ticks } = axis(vm.fromMs, vm.toMs);
  const n = Math.max(1, vm.hours.length);
  const bw = Math.max(2, plotW / n - 1.5);
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = vm.fromMs + ((e.clientX - r.left) / r.width) * (vm.toMs - vm.fromMs);
    setHoverT(t);
  };
  const hov = hoverT == null ? null : vm.hours.reduce<PrecipVM['hours'][number] | null>((b, x) => (!b || Math.abs(x.t - hoverT) < Math.abs(b.t - hoverT) ? x : b), null);
  const yTicks = [yMax / 2, yMax];
  return (
    <TileShell title="NIEDERSCHLAG · MM/H · 48 H · BUSCOSUN FUSION" o="P94" state={vm.state}
      foot={<div className="dbd-caption"><Val v={vm.caption} long /></div>}>
      <div className="dbf-kpis">
        <div><span className="dbf-k">Summe 48 h</span><b><Val v={vm.sum} /></b></div>
        <div><span className="dbf-k">Spitze</span><b><Val v={vm.peak} /></b></div>
        <div><span className="dbf-k">Nasse Stunden</span><b><Val v={vm.wetHours} long /></b></div>
      </div>
      <div ref={ref} className="dbf-chart" onPointerLeave={() => setHoverT(null)}>
        {width > 0 && (
          <svg width={width} height={h} role="img" aria-label="Niederschlag je Stunde über 48 Stunden mit Spanne und Regenchance">
            {yTicks.map((v) => (
              <g key={v}><line x1={padL} x2={padL + plotW} y1={Y(v)} y2={Y(v)} className="dbf-grid" /><text x={padL - 5} y={Y(v) + 3.5} className="dbf-ylabel" textAnchor="end">{num(v, v < 1 ? 1 : 0)}</text></g>
            ))}
            {vm.hours.map((x) => {
              const cx = X(x.t), mean = x.mean ?? 0;
              const snow = (x.pSnow ?? 0) >= 0.5;
              return (
                <g key={x.t}>
                  {mean > 0.02 && <rect x={cx - bw / 2} y={Y(mean)} width={bw} height={Math.max(1, yBase - Y(mean))} rx={1.5} className={snow ? 'dbf-bar dbf-bar--snow' : 'dbf-bar'} />}
                  {x.p90 != null && x.p90 > mean + 0.02 && <line x1={cx} x2={cx} y1={Y(x.p90)} y2={Y(mean)} className="dbf-whisker" />}
                  {x.p90 != null && x.p90 > mean + 0.02 && <line x1={cx - bw / 3} x2={cx + bw / 3} y1={Y(x.p90)} y2={Y(x.p90)} className="dbf-whisker" />}
                  {x.pWet != null && <rect x={cx - bw / 2} y={yBase + 20} width={bw} height={5} rx={1} className="dbf-pwet" style={{ fillOpacity: 0.1 + 0.85 * x.pWet }} />}
                </g>
              );
            })}
            <line x1={padL} x2={padL + plotW} y1={yBase} y2={yBase} className="dbf-base" />
            <Axis ticks={ticks} X={X} yBase={yBase} right={padL + plotW} />
            <text x={padL} y={yBase + 34} className="dbf-striplabel">Regenchance je Stunde</text>
            {hov && <line x1={X(hov.t)} x2={X(hov.t)} y1={padT} y2={yBase} className="dbf-cross" />}
            <rect x={padL} y={padT} width={plotW} height={plotH + 26} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} style={{ cursor: 'crosshair', touchAction: 'pan-y' }} />
          </svg>
        )}
        {hov && (
          <Tip left={Math.max(0, Math.min(width - 210, X(hov.t) - 105))} top={padT + 2}>
            <div className="dbf-tip-t">{dayLabel(hov.t)} {hhmm(hov.t)}</div>
            <div className="dbf-tip-v">{hov.mean != null ? `${num(hov.mean, 1)}${NB}mm/h` : 'n. v.'}{hov.p90 != null ? <span> · bis {num(hov.p90, 1)}{NB}mm/h (p90)</span> : null}</div>
            <div className="dbf-tip-s">{hov.pWet != null ? `Regenchance ${Math.round(hov.pWet * 100)}${NB}%` : 'Regenchance n. v.'}{hov.pSnow != null ? ` · Schnee ${Math.round(hov.pSnow * 100)}${NB}%` : ''}</div>
          </Tip>
        )}
      </div>
    </TileShell>
  );
}

// ---------------------------------------------------------------------------
// Wind und Böen 48 h (P95)
// ---------------------------------------------------------------------------

export function WindBandTile({ vm }: { vm: WindBandVM }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hoverT, setHoverT] = useState<number | null>(null);
  const h = 150, padL = 30, padR = 8, padT = 10, padB = 22;
  const plotW = Math.max(10, width - padL - padR), plotH = h - padT - padB, yBase = padT + plotH;
  const X = (t: number) => padL + ((t - vm.fromMs) / (vm.toMs - vm.fromMs)) * plotW;
  const yMax = useMemo(() => {
    const m = Math.max(2, ...vm.points.map((p) => Math.max(p.w90 ?? 0, p.g50 ?? 0)));
    const steps = [5, 10, 15, 20, 25, 30, 40, 50];
    return steps.find((s) => m * 1.05 <= s) ?? Math.ceil(m * 1.1);
  }, [vm.points]);
  const Y = (v: number) => padT + plotH - (Math.min(v, yMax) / yMax) * plotH;
  const { ticks } = axis(vm.fromMs, vm.toMs);
  const f = (x: number) => x.toFixed(1);
  const line = (sel: (p: WindBandVM['points'][number]) => number | null) => {
    let d = '', pen = false;
    for (const p of vm.points) { const v = sel(p); if (v == null) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${f(X(p.t))},${f(Y(v))}`; pen = true; }
    return d;
  };
  const band = vm.points.filter((p) => p.w10 != null && p.w90 != null);
  const bandD = band.length > 1 ? `${band.map((p, i) => `${i ? 'L' : 'M'}${f(X(p.t))},${f(Y(p.w90 as number))}`).join('')}${[...band].reverse().map((p) => `L${f(X(p.t))},${f(Y(p.w10 as number))}`).join('')}Z` : '';
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHoverT(vm.fromMs + ((e.clientX - r.left) / r.width) * (vm.toMs - vm.fromMs));
  };
  const hov = hoverT == null ? null : vm.points.reduce<WindBandVM['points'][number] | null>((b, x) => (!b || Math.abs(x.t - hoverT) < Math.abs(b.t - hoverT) ? x : b), null);
  const yTicks = [yMax / 2, yMax];
  return (
    <TileShell title="WIND & BÖEN · M/S · 48 H · BUSCOSUN FUSION" o="P95" state={vm.state}
      foot={<div className="dbd-caption"><Val v={vm.caption} long /></div>}>
      <div className="dbf-kpis">
        <div><span className="dbf-k">Böen max</span><b><Val v={vm.gustMax} /></b></div>
        <div><span className="dbf-k">Mittelwind max</span><b><Val v={vm.windMax} /></b></div>
      </div>
      <div ref={ref} className="dbf-chart" onPointerLeave={() => setHoverT(null)}>
        {width > 0 && (
          <svg width={width} height={h} role="img" aria-label="Mittelwind mit Band und Böen über 48 Stunden">
            {yTicks.map((v) => (
              <g key={v}><line x1={padL} x2={padL + plotW} y1={Y(v)} y2={Y(v)} className="dbf-grid" /><text x={padL - 5} y={Y(v) + 3.5} className="dbf-ylabel" textAnchor="end">{num(v, 0)}</text></g>
            ))}
            {bandD && <path d={bandD} className="dbf-band" />}
            <path d={line((p) => p.g50)} className="dbf-gust" />
            <path d={line((p) => p.w50)} className="dbf-wind" />
            <line x1={padL} x2={padL + plotW} y1={yBase} y2={yBase} className="dbf-base" />
            <Axis ticks={ticks} X={X} yBase={yBase} right={padL + plotW} />
            {hov && hov.w50 != null && <g><line x1={X(hov.t)} x2={X(hov.t)} y1={padT} y2={yBase} className="dbf-cross" /><circle cx={X(hov.t)} cy={Y(hov.w50)} r={4} className="dbf-dot" /></g>}
            <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} style={{ cursor: 'crosshair', touchAction: 'pan-y' }} />
          </svg>
        )}
        {hov && (
          <Tip left={Math.max(0, Math.min(width - 210, X(hov.t) - 105))} top={padT + 2}>
            <div className="dbf-tip-t">{dayLabel(hov.t)} {hhmm(hov.t)}</div>
            <div className="dbf-tip-v">{hov.w50 != null ? `${num(hov.w50, 1)}${NB}m/s` : 'n. v.'}{hov.w10 != null && hov.w90 != null ? <span> · {num(hov.w10, 1)}–{num(hov.w90, 1)}{NB}m/s</span> : null}</div>
            <div className="dbf-tip-s">{hov.g50 != null ? `Böen ${num(hov.g50, 1)}${NB}m/s` : 'Böen n. v.'}</div>
          </Tip>
        )}
      </div>
      <div className="dbf-legend"><span><i className="dbf-sw dbf-sw--wind" /> Mittelwind p50</span><span><i className="dbf-sw dbf-sw--band" /> 80 %-Band</span><span><i className="dbf-sw dbf-sw--gust" /> Böen p50</span></div>
    </TileShell>
  );
}

// ---------------------------------------------------------------------------
// Luftdruck 48 h (P96)
// ---------------------------------------------------------------------------

export function PressureTile({ vm }: { vm: PressureVM }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hoverT, setHoverT] = useState<number | null>(null);
  const h = 150, padL = 36, padR = 8, padT = 10, padB = 22;
  const plotW = Math.max(10, width - padL - padR), plotH = h - padT - padB, yBase = padT + plotH;
  const X = (t: number) => padL + ((t - vm.fromMs) / (vm.toMs - vm.fromMs)) * plotW;
  const dom = useMemo(() => {
    const vals = vm.points.map((p) => p.p).filter((x): x is number => x != null);
    if (!vals.length) return { lo: 990, hi: 1030, ticks: [1000, 1010, 1020] };
    let lo = Math.floor((Math.min(...vals) - 2) / 2) * 2, hi = Math.ceil((Math.max(...vals) + 2) / 2) * 2;
    if (hi - lo < 10) { const mid = (hi + lo) / 2; lo = Math.floor(mid - 5); hi = lo + 10; }
    const step = hi - lo <= 12 ? 2 : hi - lo <= 30 ? 5 : 10;
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    return { lo, hi, ticks };
  }, [vm.points]);
  const Y = (v: number) => padT + plotH - ((v - dom.lo) / (dom.hi - dom.lo)) * plotH;
  const { ticks } = axis(vm.fromMs, vm.toMs);
  const f = (x: number) => x.toFixed(1);
  let d = '', pen = false;
  for (const p of vm.points) { if (p.p == null) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${f(X(p.t))},${f(Y(p.p))}`; pen = true; }
  const valid = vm.points.filter((p) => p.p != null);
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHoverT(vm.fromMs + ((e.clientX - r.left) / r.width) * (vm.toMs - vm.fromMs));
  };
  const hov = hoverT == null ? null : valid.reduce<PressureVM['points'][number] | null>((b, x) => (!b || Math.abs(x.t - hoverT) < Math.abs(b.t - hoverT) ? x : b), null);
  const arrow = vm.tendencyDir === 'up' ? '↗' : vm.tendencyDir === 'down' ? '↘' : vm.tendencyDir === 'flat' ? '→' : '';
  return (
    <TileShell title="LUFTDRUCK · HPA · 48 H · BUSCOSUN FUSION" o="P96" state={vm.state}
      foot={<div className="dbd-caption"><Val v={vm.caption} long /></div>}>
      <div className="dbf-kpis">
        <div><span className="dbf-k">Jetzt</span><b><Val v={vm.now} /></b></div>
        <div><span className="dbf-k">Tendenz {arrow}</span><b className={vm.tendencyDir ? `dbf-tend--${vm.tendencyDir}` : undefined}><Val v={vm.tendency} /></b></div>
        <div><span className="dbf-k">Spanne</span><b><Val v={vm.range} /></b></div>
      </div>
      <div ref={ref} className="dbf-chart" onPointerLeave={() => setHoverT(null)}>
        {width > 0 && (
          <svg width={width} height={h} role="img" aria-label="Luftdruck am Ort über 48 Stunden">
            {dom.ticks.map((v) => (
              <g key={v}><line x1={padL} x2={padL + plotW} y1={Y(v)} y2={Y(v)} className="dbf-grid" /><text x={padL - 5} y={Y(v) + 3.5} className="dbf-ylabel" textAnchor="end">{v}</text></g>
            ))}
            {d && <path d={d} className="dbf-pline" />}
            <line x1={padL} x2={padL + plotW} y1={yBase} y2={yBase} className="dbf-base" />
            <Axis ticks={ticks} X={X} yBase={yBase} right={padL + plotW} />
            {hov && hov.p != null && <g><line x1={X(hov.t)} x2={X(hov.t)} y1={padT} y2={yBase} className="dbf-cross" /><circle cx={X(hov.t)} cy={Y(hov.p)} r={4} className="dbf-dot" /></g>}
            <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} style={{ cursor: 'crosshair', touchAction: 'pan-y' }} />
          </svg>
        )}
        {hov && hov.p != null && (
          <Tip left={Math.max(0, Math.min(width - 180, X(hov.t) - 90))} top={padT + 2}>
            <div className="dbf-tip-t">{dayLabel(hov.t)} {hhmm(hov.t)}</div>
            <div className="dbf-tip-v">{num(hov.p, 1)}{NB}hPa</div>
          </Tip>
        )}
      </div>
    </TileShell>
  );
}
