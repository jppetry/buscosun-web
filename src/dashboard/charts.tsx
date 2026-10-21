/**
 * Diagramme des Dashboards auf `@nivo/line` (Phase DB, E-DB-14: kein `@nivo/bar` — eine Band-Achse verteilte die
 * Stunden gleichmäßig). nivo stellt Zeichenfläche und Zeitachse (`xScale`) mit gemessener Breite; alles Sichtbare
 * sind eigene Ebenen mit den Maßen der Vorlage (reference/dashboard.dc.html: Stundenverlauf 1330×178, Nowcast 300×84).
 * Die Serie in `data` wird nie gezeichnet (`'lines'` fehlt in `layers`), sie spannt nur die Skalen auf — dasselbe
 * Muster wie `src/fire/FirePassChart.tsx`. Keine Tooltips: die Vorlage zeichnet keinen Hover-Zustand.
 */
import type { ReactElement } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { HEAVY_MMH, DRY_MMH } from './model/rules';
import { hhmm } from './format';
import type { HourlyVM, NowcastVM } from './model/types';

interface LayerCtx { xScale: (v: Date) => number; innerWidth: number; innerHeight: number }
const H = 3_600_000;

const NO_MARGIN = { top: 0, right: 0, bottom: 0, left: 0 };

function Frame({ fromMs, toMs, layers, margin = NO_MARGIN }: { fromMs: number; toMs: number; layers: Array<(ctx: LayerCtx) => ReactElement | null>; margin?: typeof NO_MARGIN }) {
  return (
    <ResponsiveLine
      data={[{ id: 'span', data: [{ x: new Date(fromMs), y: 0 }, { x: new Date(toMs), y: 1 }] }]}
      margin={margin}
      xScale={{ type: 'time', min: new Date(fromMs), max: new Date(toMs), useUTC: false, precision: 'minute' }}
      yScale={{ type: 'linear', min: 0, max: 1 }}
      animate={false}
      enablePoints={false}
      enableArea={false}
      enableGridX={false}
      enableGridY={false}
      isInteractive={false}
      enableSlices={false}
      axisTop={null}
      axisRight={null}
      axisBottom={null}
      axisLeft={null}
      layers={layers as never}
    />
  );
}

// ---------------------------------------------------------------------------
// Stundenverlauf (P47–P51)
// ---------------------------------------------------------------------------

export function HourlyChart({ vm, patternId, hoverT }: { vm: HourlyVM; patternId: string; hoverT?: number | null }) {
  const pts = vm.points;
  const vals: number[] = [];
  for (const p of pts) for (const x of [p.t10, p.t50, p.t90, p.td]) if (x != null) vals.push(x);
  const vmin = vals.length ? Math.min(...vals) : 0;
  const vmax = vals.length ? Math.max(...vals) : 1;
  const prMax = Math.max(2, ...pts.map((p) => p.pr ?? 0));

  const Layer = ({ xScale, innerWidth: w, innerHeight: h }: LayerCtx) => {
    const fy = (u: number) => (u / 178) * h; // Vorlagen-Einheiten (Höhe 178) → px
    // Temperatur und Taupunkt: der Wertebereich füllt y 40 … 130 (Vorlage: Linien zwischen 46 und 126).
    const yv = (v: number) => fy(130 - ((v - vmin) / Math.max(0.5, vmax - vmin)) * 90);
    const x = (t: number) => xScale(new Date(t));
    const path = (sel: (p: HourlyVM['points'][number]) => number | null) => {
      let d = '';
      let pen = false;
      for (const p of pts) {
        const v = sel(p);
        if (v == null) { pen = false; continue; }
        d += `${pen ? 'L' : 'M'}${x(p.t).toFixed(1)} ${yv(v).toFixed(1)} `;
        pen = true;
      }
      return d.trim();
    };
    const band = pts.filter((p) => p.t10 != null && p.t90 != null);
    const bandD = band.length > 1
      ? `${band.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${yv(p.t90!).toFixed(1)}`).join(' ')} ${[...band].reverse().map((p) => `L${x(p.t).toFixed(1)} ${yv(p.t10!).toFixed(1)}`).join(' ')} Z`
      : '';
    const hourPx = w / Math.max(1, vm.hours);
    const bw = Math.min((11 / 1330) * w, hourPx * 0.6);
    const base = fy(170);
    return (
      <g>
        <defs>
          <pattern id={patternId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="#C4D3E0" strokeWidth="1.1" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={w} height={h} fill={`url(#${patternId})`} opacity=".4" />
        {/* E-DB-23: Nächte (P92) dezent unter allem, was Wert trägt */}
        <g fill="#E0D6BE" opacity=".5" data-origin="P92">
          {vm.nights.map((n) => <rect key={n.from} x={x(n.from)} y="0" width={Math.max(0, x(n.to) - x(n.from))} height={base} />)}
        </g>
        <g stroke="#EDE6D3" strokeWidth="1">
          {[34, 68, 102].map((u) => <line key={u} x1="0" y1={fy(u)} x2={w} y2={fy(u)} />)}
        </g>
        <g stroke="#E0D6BE" strokeWidth="1.2" data-origin="P51">
          {vm.dayLines.map((d) => <line key={d.t} x1={x(d.t)} y1="0" x2={x(d.t)} y2={h} />)}
        </g>
        {bandD && <path d={bandD} fill="rgba(44,42,38,.08)" data-origin="P48" />}
        <path d={path((p) => p.t50)} fill="none" stroke="#2C2A26" strokeWidth="2.2" data-origin="P47" />
        <path d={path((p) => p.td)} fill="none" stroke="#3A6FA8" strokeWidth="1.5" strokeDasharray="4 3" data-origin="P49" />
        <g fill="#3A6FA8" opacity=".55" data-origin="P50">
          {pts.filter((p) => (p.pr ?? 0) >= DRY_MMH).map((p) => {
            const bh = Math.max(1, (p.pr! / prMax) * fy(50));
            return <rect key={p.t} x={x(p.t) - bw / 2} y={base - bh} width={bw} height={bh} rx="2" fill={p.pr! >= HEAVY_MMH ? '#9B8CE0' : undefined} />;
          })}
        </g>
        <line x1="0" y1={base} x2={w} y2={base} stroke="#C4B896" strokeWidth="1" />
        {/* E-DB-23: wo die halbe Bandbreite zuerst ±2/3/4 °C erreicht (P93) — zweite Beschriftungszeile unter den Tagen */}
        <g data-origin="P93">
          {vm.marks.map((m) => {
            const mx = x(m.t);
            const right = mx > w - 112;
            return (
              <g key={m.k}>
                <line x1={mx} x2={mx} y1={fy(22)} y2={base} stroke="#A89A7A" strokeWidth="1" strokeDasharray="2 3" />
                <text x={right ? mx - 5 : mx + 5} y={fy(30)} textAnchor={right ? 'end' : 'start'} fontFamily="League Spartan" fontSize="12" fill="#8B7355">{m.label}</text>
              </g>
            );
          })}
        </g>
        {/* Fadenkreuz beim Nachfahren mit der Maus: Linie und Punkte auf Temperatur und Taupunkt der nächsten Stunde */}
        {hoverT != null && (() => {
          const hp = pts.reduce<HourlyVM['points'][number] | null>((b, p) => (!b || Math.abs(p.t - hoverT) < Math.abs(b.t - hoverT) ? p : b), null);
          if (!hp) return null;
          return (
            <g pointerEvents="none">
              <line x1={x(hp.t)} x2={x(hp.t)} y1="0" y2={base} stroke="#2C2A26" strokeOpacity=".45" strokeDasharray="3 3" />
              {hp.td != null && <circle cx={x(hp.t)} cy={yv(hp.td)} r="4" fill="#fff" stroke="#3A6FA8" strokeWidth="2" />}
              {hp.t50 != null && <circle cx={x(hp.t)} cy={yv(hp.t50)} r="4.5" fill="#fff" stroke="#2C2A26" strokeWidth="2.2" />}
            </g>
          );
        })()}
        <g fontFamily="League Spartan" fontSize="12" fill="#8B7355">
          <text x="6" y="14">°C</text>
          {vm.dayLines.map((d) => <text key={d.t} x={x(d.t) + 7} y="14">{d.label}</text>)}
        </g>
      </g>
    );
  };
  return <Frame fromMs={vm.startMs} toMs={vm.endMs} layers={[Layer]} />;
}

/** Achsenbeschriftung unter dem Diagramm — an der echten Zeitposition (Vorlage: Uhrzeiten im 6-h-Raster). */
export function HourlyTicks({ vm, mobile }: { vm: HourlyVM; mobile?: boolean }) {
  const ticks = mobile ? vm.ticksMobile : vm.ticks;
  const span = vm.endMs - vm.startMs;
  return (
    <div className={`dbd-ticks ${mobile ? 'dbd-ticks-m' : 'dbd-ticks-d'}`} aria-hidden="true">
      {ticks.map((t, i) => {
        const f = (t.t - vm.startMs) / span;
        const cls = f < 0.03 ? 'is-first' : f > 0.97 ? 'is-last' : undefined;
        return <span key={t.t} className={cls} style={{ left: `${(f * 100).toFixed(3)}%` }} data-i={i}>{t.label}</span>;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nowcast (P55)
// ---------------------------------------------------------------------------

export function NowcastChart({ vm }: { vm: NowcastVM }) {
  const from = vm.fromMs, to = Math.max(vm.toMs, vm.fromMs + H);
  // Obergrenze der y-Achse: kleinste runde Stufe ≥ größtem Wert (mindestens 2 mm/h wie bisher)
  const dataMax = Math.max(2, ...vm.frames.map((f) => f.mmh));
  const yMax = [2, 5, 10, 20, 50, 100].find((s) => s >= dataMax) ?? Math.ceil(dataMax);
  const yTxt = (v: number) => String(v).replace('.', ',');
  const Layer = ({ xScale, innerWidth: w, innerHeight: h }: LayerCtx) => {
    const x = (t: number) => xScale(new Date(t));
    const slot = vm.frames.length > 1 ? (w / (vm.frames.length)) : w / 12;
    const bw = Math.min((11 / 300) * w, slot * 0.7);
    const base = h;
    const yAt = (v: number) => base - (v / yMax) * h;
    const nx = x(vm.nowMs);
    // x-Achse: kleinster Takt (15/30/60/120 min), bei dem die Beschriftungen ≥ 44 px Abstand haben
    const pxPerMin = w / Math.max(1, (to - from) / 60_000);
    const stepMin = [15, 30, 60, 120].find((m) => m * pxPerMin >= 44) ?? 120;
    const stepMs = stepMin * 60_000;
    const ticks: number[] = [];
    for (let t = Math.ceil(from / stepMs) * stepMs; t <= to; t += stepMs) ticks.push(t);
    const nowShown = nx >= 0 && nx <= w;
    const txt = { fontFamily: 'League Spartan', fontSize: 10.5, fill: '#B4BFCB' } as const;
    return (
      <g>
        {[0, yMax / 2, yMax].map((v) => (
          <g key={v}>
            {v > 0 && <line x1="0" y1={yAt(v)} x2={w} y2={yAt(v)} stroke="#2F3B4A" strokeWidth="1" />}
            <text x={-6} y={yAt(v) + 3.5} textAnchor="end" {...txt}>{yTxt(v)}</text>
          </g>
        ))}
        <text transform={`translate(-34 ${h / 2}) rotate(-90)`} textAnchor="middle" {...txt} fontWeight={700}>Regen in mm/h</text>
        <g fill="#5B9BD5">
          {vm.frames.filter((f) => f.mmh >= DRY_MMH).map((f) => {
            const bh = Math.max(1, (Math.min(f.mmh, yMax) / yMax) * h);
            return (
              <rect key={f.t} x={x(f.t) - bw / 2} y={base - bh} width={bw} height={bh} rx="2"
                fill={f.mmh >= HEAVY_MMH ? '#9B8CE0' : undefined} opacity={f.mmh < 0.5 ? .55 : undefined} />
            );
          })}
        </g>
        {nowShown && <line x1={nx} y1={0} x2={nx} y2={base} stroke="#FAF6EA" strokeWidth="1.3" strokeDasharray="3 3" />}
        <line x1="0" y1={base} x2={w} y2={base} stroke="#3E4B5C" strokeWidth="1" />
        {ticks.map((t) => {
          const tx = x(t);
          const nearNow = nowShown && Math.abs(tx - nx) < 24;
          return (
            <g key={t}>
              <line x1={tx} y1={base} x2={tx} y2={base + 4} stroke="#3E4B5C" strokeWidth="1" />
              {!nearNow && <text x={tx} y={base + 16} textAnchor="middle" {...txt}>{hhmm(t)}</text>}
            </g>
          );
        })}
        {nowShown && <text x={nx} y={base + 16} textAnchor="middle" {...txt} fill="#FAF6EA" fontWeight={700}>jetzt</text>}
        <text x={w / 2} y={base + 31} textAnchor="middle" {...txt} fontWeight={700}>Uhrzeit</text>
      </g>
    );
  };
  return <Frame fromMs={from} toMs={to} layers={[Layer]} margin={{ top: 6, right: 6, bottom: 34, left: 42 }} />;
}
