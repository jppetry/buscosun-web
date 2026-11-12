/**
 * Pieces of the route result that the old result (`TourView.tsx` `resultBody`) and the new one (`TourResultV2.tsx`,
 * phase TE) share. Moved out of `TourView.tsx` unchanged (markup and classes identical — E-TE-1).
 */
import type { EnrichmentMeta } from '../pointForecast/weatherEnrichment';
import { formatHM } from './speedModel';
import { formatStart } from './startTime';
import type { computeTimingIterated, Milestone, SampleETA, TourTiming } from './tourTiming';
import type { WindSampler } from './windSampling';
import { clock } from './tourUi';
import { IconCheck } from './routeIcons';

export type WindState = { kind: 'pending' } | { kind: 'ready'; sampler: WindSampler } | { kind: 'unavailable' };
/**
 * Weather of the result. `fp` = sample fingerprint the values were fetched for (phase TE): when the plan changed since,
 * the new view shows them as outdated (rule of V-R3D-3), never as valid for the new start time.
 */
export type WeatherState =
  | { kind: 'idle' } | { kind: 'loading' }
  | { kind: 'ready'; samples: SampleETA[]; meta: EnrichmentMeta; fp: string }
  | { kind: 'error'; message: string };

/* ===== Quellen-Overlay auf der Karte ===== */
export function QuellenOverlay({ meta }: { meta: EnrichmentMeta }) {
  return (
    <div className="rt-quellen">
      <span className="rt-eyebrow">Quellen</span>
      <div>{meta.countries.join(' · ')} — live, höhenkorrigiert</div>
      {meta.radarOverrides > 0 && <div>{meta.radarOverrides} Punkte Radar-Nowcast</div>}
      <div>{meta.elevationCorrected} Punkte höhenkorrigiert{meta.uvEstimated > 0 ? ` · ${meta.uvEstimated} UV geschätzt` : ''}</div>
    </div>
  );
}

/* ===== Bearing-Wind-Legende auf der Karte (Mockup route-03) ===== */
export function WindLegend() {
  return (
    <div className="rt-windlegend">
      <span className="rt-eyebrow">Wind zur Route</span>
      <div className="rt-windlegend-keys">
        <span><i style={{ background: '#5e8048' }} /> Rücken</span>
        <span><i style={{ background: '#C97B47' }} /> Seite</span>
        <span><i style={{ background: '#A8431F' }} /> Gegen</span>
      </div>
    </div>
  );
}

/* ===== Zeit-Übersicht ===== */
export function TimeOverview({ timing, startMs, category }: { timing: TourTiming; startMs: number; category: 'foot' | 'bike' }) {
  return (
    <div className="rt-card rt-timeover">
      <span className="rt-eyebrow">Zeit-Übersicht</span>
      <dl style={{ margin: '0.6rem 0 0' }}>
        <div className="rt-timeover-row"><dt>Start</dt><dd>{formatStart(startMs)}</dd></div>
        <div className="rt-timeover-row"><dt>{category === 'bike' ? 'Fahrzeit' : 'Gehzeit'}</dt><dd>{formatHM(timing.movingSec)}</dd></div>
        {timing.breakCount > 0 && <div className="rt-timeover-row"><dt>Pausen</dt><dd>{timing.breakCount} · {formatHM(timing.breakSec)}</dd></div>}
        <div className="rt-timeover-row is-total"><dt>Gesamtdauer</dt><dd>{formatHM(timing.totalSec)}</dd></div>
        <div className="rt-timeover-row"><dt>Ankunft</dt><dd>{formatStart(timing.arrivalMs)}</dd></div>
      </dl>
    </div>
  );
}

/* ===== Zeitplan-Timeline ===== */
export function Timeline({ milestones }: { milestones: Milestone[] }) {
  return (
    <div className="rt-tl">
      {milestones.map((m, i) => (
        <div key={i} className="rt-tl-leg">
          <span className={`rt-tl-dot rt-tl-dot-${m.kind}`} aria-hidden="true" />
          <div className="rt-tl-kind">{kindLabel(m.kind)}</div>
          <div className="rt-tl-main">
            {clock(m.arrivalMs)}{m.departureMs != null ? ` → ${clock(m.departureMs)}` : ''} · {m.label}
          </div>
          <div className="rt-tl-meta">
            {(m.dist / 1000).toFixed(1).replace('.', ',')} km{m.durationSec != null ? ` · +${Math.round(m.durationSec / 60)} min` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
export function kindLabel(k: Milestone['kind']): string {
  return k === 'start' ? 'Start' : k === 'end' ? 'Ziel' : k === 'meal' ? 'Mahlzeit' : k === 'custom' ? 'Pause' : 'Pause';
}

/* ===== Daten-Herkunft & Qualität ===== */
export function QualityRow({ meta, result, windState }: { meta: EnrichmentMeta; result: ReturnType<typeof computeTimingIterated>; windState: WindState }) {
  const okClusters = meta.clusterCount - meta.pointForecastFailed;
  const drift = result.driftLog.length ? result.driftLog[result.driftLog.length - 1].maxDriftSec : 0;
  return (
    <div className="rt-card rt-quality">
      <div className="rt-quality-grid">
        <div>
          <h4>Wind-Iteration</h4>
          {result.windApplied ? (
            <>
              <span className="rt-quality-conv"><span className="live-dot" style={{ width: 9, height: 9 }} /> {result.converged ? 'konvergiert' : 'nicht konvergiert'}</span>
              <div className="rt-quality-line" style={{ marginTop: '0.35rem' }}>nach {result.iterations} Iterationen · letzte Drift {Math.round(drift)} s</div>
              {windState.kind === 'ready' && <div className="rt-quality-line">Quelle {windState.sampler.country}: {windState.sampler.clusterCount} Cluster, {windState.sampler.hourCount} h Tiefe</div>}
            </>
          ) : <div className="rt-quality-line">Timing ohne Wind berechnet (nicht verfügbar).</div>}
        </div>
        <div>
          <h4>Wetter-Abruf</h4>
          <div className="rt-quality-line"><strong>{okClusters}/{meta.clusterCount} Cluster</strong> · {meta.pointForecastCalls} Calls</div>
          {meta.radarOverrides > 0 && <div className="rt-quality-line">{meta.radarOverrides} Punkte mit Radar-Nowcast</div>}
          <div className="rt-quality-line">{meta.elevationCorrected} höhenkorrigiert{meta.uvEstimated > 0 ? ` · ${meta.uvEstimated} UV geschätzt` : ''}</div>
          <div className="rt-quality-line" style={{ color: 'var(--stone-500)' }}>{meta.elapsedMs} ms</div>
        </div>
        <div>
          <h4>Abdeckung</h4>
          <div className="rt-cov-row"><span>Temperatur, Wind</span><span className="ok"><IconCheck size={14} /></span></div>
          <div className="rt-cov-row"><span>Niederschlag (Radar + NWP)</span><span className="ok"><IconCheck size={14} /></span></div>
          <div className="rt-cov-row"><span>Schneefallgrenze</span><span className="muted">{meta.coverage.snowLine ? <IconCheck size={14} /> : 'nur AT/CH'}</span></div>
          <div className="rt-cov-row"><span>UV-Index</span><span className="muted">{meta.coverage.uvIndex ? 'DE gemessen' : 'AT/CH geschätzt'}</span></div>
        </div>
      </div>
      <div className="rt-quality-note">Quellen: DWD (Deutschland) · GeoSphere (Österreich) · MeteoSwiss (Schweiz) · live, höhenkorrigiert, ohne Tracker.</div>
    </div>
  );
}
