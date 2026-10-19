/**
 * Regenradar — Punktansicht am Zeiger (Phase P3D): the dock card. The same values as the readout at the pointer
 * (`ProbeTooltip`), in the long form with sources; every value carries its source and time, a missing value says
 * „unbekannt" (never 0). The 3D column was dropped on Jan's request (19.10.).
 */
import type { ProbeState } from './usePointProbe';
import {
  compass16, dewPointC, fmt0, fmt1, fmtClock, msToKmh, rateClass,
  PHASE_BASIS_LABEL, PHASE_LABEL, PROBE_DRY_MMH, ZONE_LABEL,
} from './probeModel';
import './pointProbe.css';

const UNKNOWN = 'unbekannt';
const fmt2 = (n: number): string => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PointProbeCard({ state, variant = 'desktop', onUnpin }: { state: ProbeState; variant?: 'desktop' | 'mobile'; onUnpin?: () => void }) {
  const v = state.point.values;
  const cell = state.cell;

  const idle = state.mode === 'idle';
  const wet = state.rateMmH != null && state.rateMmH >= PROBE_DRY_MMH;
  const td = v?.dewPointC ?? (v?.tempC != null && v?.rhPct != null ? dewPointC(v.tempC, v.rhPct) : null);
  const tdDerived = v?.dewPointC == null && td != null;

  return (
    <section className={`pp-card pp-card--${variant}${idle ? ' is-idle' : ''}`} aria-label="Punktansicht am Zeiger">
      <div className="pp-head">
        <span className="pp-eyebrow">{state.mode === 'pinned' ? 'Fixiert' : 'Am Zeiger'}</span>
        {state.timeMs != null && !idle && (
          <span className={`pp-zone pp-zone--${state.zone ?? 'none'}`}>{fmtClock(state.timeMs)}{state.zone ? ` · ${ZONE_LABEL[state.zone]}` : ''}</span>
        )}
        {state.mode === 'pinned' && onUnpin && <button type="button" className="pp-unpin" onClick={onUnpin} title="Fixierung lösen (Esc)">lösen</button>}
      </div>
      {state.at && !idle && <div className="pp-pos">{state.at.lat.toFixed(3)}, {state.at.lon.toFixed(3)}{state.country ? ` · ${state.country}` : ''}</div>}
      {idle ? (
        <div className="pp-idle">{variant === 'mobile' ? 'Tippe auf die Karte: Niederschlag und Wetter an dieser Stelle.' : 'Zeiger über die Karte bewegen: Niederschlag und Wetter an dieser Stelle. Klick fixiert.'}</div>
      ) : (
        <>
          <div className="pp-hero">
            {state.rateMmH == null ? (
              <><span className="pp-rate">{UNKNOWN}</span><span className="pp-rate-sub">kein Radar an dieser Stelle und Zeit</span></>
            ) : wet ? (
              <><span className="pp-rate">{fmt2(state.rateMmH)} <small>mm/h</small></span><span className="pp-rate-sub">{rateClass(state.rateMmH)}{state.zone === 'model' ? ' · Modell' : ''}</span></>
            ) : (
              <><span className="pp-rate pp-rate--dry">Hier fällt nichts</span><span className="pp-rate-sub">{state.zone === 'model' ? 'Modell' : 'Radar'} · unter {String(PROBE_DRY_MMH).replace('.', ',')} mm/h</span></>
            )}
          </div>
          <dl className="pp-rows">
            {wet && (
              <Row k="Art" v={state.phase.phase ? PHASE_LABEL[state.phase.phase] : UNKNOWN} sub={state.phase.phase ? PHASE_BASIS_LABEL[state.phase.basis] : 'ohne Temperatur am Punkt'}
                tone={state.phase.phase === 'hail' ? 'hail' : undefined} />
            )}
            <Row k="Temperatur" v={v?.tempC != null ? `${fmt1(v.tempC)} °C` : UNKNOWN} />
            <Row k="Taupunkt" v={td != null ? `${fmt1(td)} °C` : UNKNOWN} sub={v?.rhPct != null ? `${fmt0(v.rhPct)} % rF${tdDerived ? ' · Taupunkt gerechnet' : ''}` : undefined} />
            <Row k="Wind" v={v?.windMs != null ? `${v.windDirDeg != null ? `aus ${compass16(v.windDirDeg)} ` : ''}${fmt0(msToKmh(v.windMs))} km/h` : UNKNOWN}
              sub={v?.gustMs != null ? `Böe ${fmt0(msToKmh(v.gustMs))} km/h` : undefined}
              icon={v?.windDirDeg != null ? <WindArrow deg={v.windDirDeg} /> : undefined} />
            <Row k="Schneegrenze" v={v?.snowLineM != null ? `${fmt0(v.snowLineM)} m` : UNKNOWN} sub={`Ort ${v?.elevM != null ? `${fmt0(v.elevM)} m` : UNKNOWN}`} />
            <Row k="Zelle" v={cell ? `Zug nach ${cell.cell.compass ?? (cell.cell.bearing != null ? compass16(cell.cell.bearing) : '?')}${cell.cell.speedKmh != null ? ` · ${fmt0(cell.cell.speedKmh)} km/h` : ''}` : state.country === 'DE' ? 'keine Zelle' : 'keine Zelldaten'}
              sub={cell ? `${cell.inside ? 'im Umriss' : `${fmt0(cell.distKm)} km entfernt`}${cell.hail ? ' · Hagel-Kennung' : ''}${cell.cell.echoTopM != null ? ` · Echo-Top ${fmt1(cell.cell.echoTopM / 1000)} km` : ''}` : state.country === 'DE' ? 'DWD KONRAD3D' : 'KONRAD3D nur im DE-Verbund'}
              tone={cell?.hail ? 'hail' : undefined} />
          </dl>
          <div className="pp-foot">
            {state.radar ? <span>{state.radar.sourceLabel} {fmtClock(state.radar.frameMs)}</span> : <span>kein Radarbild</span>}
            <span>
              {state.point.status === 'ready' && v ? `${state.point.fusionName} ${fmtClock(v.atMs)}${v.interpolated ? ' · interpoliert' : ''}`
                : state.point.status === 'loading' ? `${state.point.fusionName} lädt …`
                : state.point.status === 'gap' ? (state.point.reason ?? 'keine Punktwerte') : ''}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function Row({ k, v, sub, icon, tone }: { k: string; v: string; sub?: string; icon?: React.ReactNode; tone?: 'hail' }) {
  return (
    <div className={`pp-row${tone ? ` is-${tone}` : ''}`}>
      <dt>{k}</dt>
      <dd><span className="pp-v">{icon}{v}</span>{sub && <span className="pp-sub">{sub}</span>}</dd>
    </div>
  );
}

/** Arrow pointing where the wind goes (meteorological „woher" + 180°). */
function WindArrow({ deg }: { deg: number }) {
  return (
    <svg className="pp-windarrow" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ transform: `rotate(${deg + 180}deg)` }}>
      <path d="M6 1.5 V10.5 M2.8 7.3 L6 10.5 L9.2 7.3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
