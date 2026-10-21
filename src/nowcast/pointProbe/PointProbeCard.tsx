/**
 * Regenradar — Punktansicht am Zeiger (Phase P3D): the dock card — three values of the point under the pointer (hover)
 * or pinned by a click: precipitation, terrain height, snowline. A missing value says „unbekannt" (never 0).
 * Reduced to these three on Jan's request (21.10.); wind, dew point, cell and sources left the card.
 */
import type { ReactNode } from 'react';
import type { ProbeState } from './usePointProbe';
import { fmt0, fmtClock, rateClass, PROBE_DRY_MMH } from './probeModel';
import './pointProbe.css';

const fmt2 = (n: number): string => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ICON = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const IconDrop = () => <svg {...ICON}><path d="M12 3.2c3.4 4.1 5.8 7 5.8 10.2a5.8 5.8 0 0 1-11.6 0c0-3.2 2.4-6.1 5.8-10.2z" /></svg>;
const IconPeak = () => <svg {...ICON}><path d="M3 19.5 9.4 8l3.4 6 2.3-3.6L21 19.5z" /><path d="m7.9 10.8 1.5 1.6 1.4-1.2" /></svg>;
const IconFlake = () => <svg {...ICON}><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" /><path d="m9.5 4.6 2.5 2 2.5-2M9.5 19.4l2.5-2 2.5 2" /></svg>;

export default function PointProbeCard({ state, variant = 'desktop', onUnpin }: { state: ProbeState; variant?: 'desktop' | 'mobile'; onUnpin?: () => void }) {
  const v = state.point.values;
  const idle = state.mode === 'idle';
  const rate = state.rateMmH;
  const wet = rate != null && rate >= PROBE_DRY_MMH;
  const elev = v?.elevM ?? null;
  const snow = v?.snowLineM ?? null;

  const rain = idle || rate == null ? { v: '–' } : wet ? { v: fmt2(rate), unit: 'mm/h', sub: `${rateClass(rate)}${state.zone === 'model' ? ' · Modell' : ''}` } : { v: 'trocken', sub: `unter ${String(PROBE_DRY_MMH).replace('.', ',')} mm/h` };
  const snowSub = idle || snow == null || elev == null ? undefined : elev >= snow ? 'Ort liegt darüber' : 'Ort liegt darunter';

  return (
    <section className={`pp-card pp-card--${variant}${idle ? ' is-idle' : ''}`} aria-label="Werte am Zeiger">
      <div className="pp-tiles">
        <Tile icon={<IconDrop />} k="Niederschlag" tone="rain" v={rain.v} unit={rain.unit} sub={rain.sub} wet={wet && !idle} />
        <Tile icon={<IconPeak />} k="Höhe" tone="ground" v={idle || elev == null ? '–' : fmt0(elev)} unit={idle || elev == null ? undefined : 'm'} />
        <Tile icon={<IconFlake />} k="Schneefallgrenze" tone="snow" v={idle || snow == null ? '–' : fmt0(snow)} unit={idle || snow == null ? undefined : 'm'} sub={snowSub} />
      </div>
      {state.mode === 'pinned' && (
        <div className="pp-pin">
          <span>Fixiert{state.timeMs != null ? ` · ${fmtClock(state.timeMs)}` : ''}</span>
          {onUnpin && <button type="button" className="pp-unpin" onClick={onUnpin} title="Fixierung lösen (Esc)">lösen</button>}
        </div>
      )}
    </section>
  );
}

function Tile({ icon, k, v, unit, sub, tone, wet }: { icon: ReactNode; k: string; v: string; unit?: string; sub?: string; tone: 'rain' | 'ground' | 'snow'; wet?: boolean }) {
  return (
    <div className={`pp-tile pp-tile--${tone}${wet ? ' is-wet' : ''}`}>
      <span className="pp-ico">{icon}</span>
      <span className="pp-tile-k">{k}</span>
      <span className="pp-tile-v">{v}{unit && <small> {unit}</small>}</span>
      {sub && <span className="pp-tile-s">{sub}</span>}
    </div>
  );
}
