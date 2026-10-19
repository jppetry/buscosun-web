/**
 * Regenradar — 3D-Punktansicht (Phase P3D): the readout AT the pointer. A glass pill that follows the mouse over the
 * map with the exact numbers of the probe (the dock card keeps the column and the long form). Pointer-events none —
 * the map keeps receiving the mouse. Desktop only (mobile taps pin into the sheet).
 */
import type { ProbeState } from './usePointProbe';
import { compass16, dewPointC, fmt0, fmt1, fmtClock, msToKmh, PHASE_LABEL, PROBE_DRY_MMH, ZONE_LABEL } from './probeModel';

const fmt2 = (n: number): string => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProbeTooltip({ state, x, y, w, h }: { state: ProbeState; x: number; y: number; w: number; h: number }) {
  if (state.mode !== 'hover' || !state.at) return null;
  const v = state.point.values;
  const wet = state.rateMmH != null && state.rateMmH >= PROBE_DRY_MMH;
  const td = v?.dewPointC ?? (v?.tempC != null && v?.rhPct != null ? dewPointC(v.tempC, v.rhPct) : null);
  // Flip to the left / above near the edges (pill ≈ 230 × 120 px).
  const left = x + 16 + 236 > w ? x - 16 - 230 : x + 16;
  const top = y + 16 + 124 > h ? y - 16 - 120 : y + 16;
  return (
    <div className="pp-tip" style={{ left, top }} aria-hidden="true">
      <div className="pp-tip-head">
        {state.timeMs != null && <span className={`pp-zone pp-zone--${state.zone ?? 'none'}`}>{fmtClock(state.timeMs)}{state.zone ? ` · ${ZONE_LABEL[state.zone]}` : ''}</span>}
        <span className="pp-tip-pos">{state.at.lat.toFixed(3)}, {state.at.lon.toFixed(3)}</span>
      </div>
      <div className="pp-tip-rate">
        {state.rateMmH == null ? 'kein Radar hier' : wet ? <>{fmt2(state.rateMmH)} <small>mm/h</small>{state.phase.phase && <em> · {PHASE_LABEL[state.phase.phase]}</em>}</> : 'Hier fällt nichts'}
      </div>
      {v ? (
        <div className="pp-tip-rows">
          <span>{v.tempC != null ? `${fmt1(v.tempC)} °C` : 'T unbekannt'}{td != null ? ` · Td ${fmt1(td)} °C` : ''}{v.rhPct != null ? ` · ${fmt0(v.rhPct)} %` : ''}</span>
          <span>{v.windMs != null ? `Wind${v.windDirDeg != null ? ` aus ${compass16(v.windDirDeg)}` : ''} ${fmt0(msToKmh(v.windMs))} km/h` : 'Wind unbekannt'}{v.gustMs != null ? ` · Böe ${fmt0(msToKmh(v.gustMs))}` : ''}</span>
          <span>{v.snowLineM != null ? `Schneegrenze ${fmt0(v.snowLineM)} m` : 'Schneegrenze unbekannt'}{v.elevM != null ? ` · Ort ${fmt0(v.elevM)} m` : ''}</span>
          {state.cell && <span className={state.cell.hail ? 'is-hail' : ''}>Zelle: Zug nach {state.cell.cell.compass ?? '?'}{state.cell.cell.speedKmh != null ? ` ${fmt0(state.cell.cell.speedKmh)} km/h` : ''}{state.cell.hail ? ' · Hagel-Kennung' : ''}</span>}
        </div>
      ) : (
        <div className="pp-tip-rows"><span className="pp-tip-dim">{state.point.status === 'gap' ? (state.point.reason ?? 'keine Punktwerte') : `${state.point.fusionName} lädt …`}</span></div>
      )}
      <div className="pp-tip-foot">{state.radar ? `${state.radar.sourceLabel} ${fmtClock(state.radar.frameMs)}` : 'kein Radarbild'}{v ? ` · ${state.point.fusionName} ${fmtClock(v.atMs)}` : ''} · Klick fixiert</div>
    </div>
  );
}
