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
import type { HourlyVM, NowcastVM } from './model/types';

interface LayerCtx { xScale: (v: Date) => number; innerWidth: number; innerHeight: number }
const H = 3_600_000;

function Frame({ fromMs, toMs, layers }: { fromMs: number; toMs: number; layers: Array<(ctx: LayerCtx) => ReactElement | null> }) {
  return (
    <ResponsiveLine
      data={[{ id: 'span', data: [{ x: new Date(fromMs), y: 0 }, { x: new Date(toMs), y: 1 }] }]}
      margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
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

export function HourlyChart({ vm, patternId }: { vm: HourlyVM; patternId: string }) {
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
        <g stroke="#EDE6D3" strokeWidth="1">
          {[34, 68, 102].map((u) => <line key={u} x1="0" y1={fy(u)} x2={w} y2={fy(u)} />)}
        </g>
        <g stroke="#E0D6BE" strokeWidth="1.2" data-origin="P51">
          {vm.dayLines.map((d) => <line key={d.t} x1={x(d.t)} y1="0" x2={x(d.t)} y2={h} />)}
        </g>
        {bandD && <path d={bandD} fill="rgba(201,123,71,.1)" data-origin="P48" />}
        <path d={path((p) => p.t50)} fill="none" stroke="#C97B47" strokeWidth="2.2" data-origin="P47" />
        <path d={path((p) => p.td)} fill="none" stroke="#3A6FA8" strokeWidth="1.5" strokeDasharray="4 3" data-origin="P49" />
        <g fill="#3A6FA8" opacity=".55" data-origin="P50">
          {pts.filter((p) => (p.pr ?? 0) >= DRY_MMH).map((p) => {
            const bh = Math.max(1, (p.pr! / prMax) * fy(50));
            return <rect key={p.t} x={x(p.t) - bw / 2} y={base - bh} width={bw} height={bh} rx="2" fill={p.pr! >= HEAVY_MMH ? '#9B8CE0' : undefined} />;
          })}
        </g>
        <line x1="0" y1={base} x2={w} y2={base} stroke="#C4B896" strokeWidth="1" />
        <g fontFamily="League Spartan" fontSize="10.5" fill="#8B7355">
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
  const mx = Math.max(2, ...vm.frames.map((f) => f.mmh));
  const Layer = ({ xScale, innerWidth: w, innerHeight: h }: LayerCtx) => {
    const fy = (u: number) => (u / 84) * h;
    const x = (t: number) => xScale(new Date(t));
    const slot = vm.frames.length > 1 ? (w / (vm.frames.length)) : w / 12;
    const bw = Math.min((11 / 300) * w, slot * 0.7);
    const base = fy(78);
    const nx = x(vm.nowMs);
    return (
      <g>
        <g stroke="#2F3B4A" strokeWidth="1"><line x1="0" y1={fy(26)} x2={w} y2={fy(26)} /><line x1="0" y1={fy(52)} x2={w} y2={fy(52)} /></g>
        <g fill="#5B9BD5">
          {vm.frames.filter((f) => f.mmh >= DRY_MMH).map((f) => {
            const bh = Math.max(1, (f.mmh / mx) * fy(40));
            return (
              <rect key={f.t} x={x(f.t) - bw / 2} y={base - bh} width={bw} height={bh} rx="2"
                fill={f.mmh >= HEAVY_MMH ? '#9B8CE0' : undefined} opacity={f.mmh < 0.5 ? .55 : undefined} />
            );
          })}
        </g>
        {nx >= 0 && nx <= w && <line x1={nx} y1={fy(4)} x2={nx} y2={base} stroke="#E0A567" strokeWidth="1.3" strokeDasharray="3 3" />}
        <line x1="0" y1={base} x2={w} y2={base} stroke="#3E4B5C" strokeWidth="1" />
      </g>
    );
  };
  return <Frame fromMs={from} toMs={to} layers={[Layer]} />;
}
