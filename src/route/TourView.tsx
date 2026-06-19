/**
 * Tour-Ansicht („Wetter entlang deiner Route") gemäß Mockups 02–04.
 *
 * Ablauf: Karte + Kennzahlen → Schritt 1 Bewegungsart → Schritt 2 Konfiguration
 * → CTA „Wetter berechnen" → Ergebnis (Wetter-Strip, Karte + Profil, Stat-Grid,
 * Warn-/Föhn-Banner, Zeit-Scrubber, Zeitplan + Zeit-Übersicht, Daten-Herkunft).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import RouteMap, { type MapBreak, type WeatherMarker } from './RouteMap';
import MovementPicker from './MovementPicker';
import SpeedProfileConfig from './SpeedProfileConfig';
import StartTimeConfig from './StartTimeConfig';
import BreaksConfig from './BreaksConfig';
import { getMovementType, type MovementId } from './movementTypes';
import { MODELS } from './movementModels';
import { formatHM, type SpeedProfile } from './speedModel';
import { BREAK_DEFAULTS, defaultBreakConfig, type BreakConfig } from './breaks';
import { computeTimingIterated, type Milestone, type SampleETA, type TourTiming } from './tourTiming';
import { isLoop, reverseTourTrack, type TourTrack } from './tourTrack';
import { formatStart, horizonState } from './startTime';
import { createWindSampler, type WindSampler } from './windSampling';
import { bearingDeg, headwindComponentMps } from './windEffect';
import EbikeBatteryPanel from './EbikeBatteryPanel';
import { batterySocAtDist, computeEbikeBattery, DEFAULT_EBIKE_CONFIG, type EbikeConfig } from './ebikeBattery';
import { enrichSampleWeather, type EnrichmentMeta } from '../pointForecast/weatherEnrichment';
import { computeWeatherAggregate } from './weatherAggregate';
import { WeatherStatGrid, WarningBanner, FoehnBanner } from './WeatherSummary';
import WeatherProfile from './WeatherProfile';
import TourWeatherStrip from './TourWeatherStrip';
import RouteScrubber from './RouteScrubber';
import { clock } from './tourUi';
import {
  IconLoop, IconWarning, IconCheck, IconArrowLeft, IconArrowRight,
  IconCalendar, IconRoute, IconBookmark,
} from './routeIcons';
import './verifySamples'; // Dev-only
import './tourTheme.css';
import './movement.css';

type Direction = 'forward' | 'reverse';
type WindState = { kind: 'pending' } | { kind: 'ready'; sampler: WindSampler } | { kind: 'unavailable' };
type WeatherState =
  | { kind: 'idle' } | { kind: 'loading' }
  | { kind: 'ready'; samples: SampleETA[]; meta: EnrichmentMeta }
  | { kind: 'error'; message: string };

export default function TourView({ track, fileLabel, onBack }: { track: TourTrack; fileLabel?: string; onBack?: () => void }) {
  const loop = useMemo(() => isLoop(track), [track]);
  const [direction, setDirection] = useState<Direction>('forward');
  const [typeId, setTypeId] = useState<MovementId | null>(null);
  const [profile, setProfile] = useState<SpeedProfile | null>(null);
  const [breakCfg, setBreakCfg] = useState<BreakConfig | null>(null);
  const [startMs, setStartMs] = useState<number>(() => Date.now());
  const [ebikeCfg, setEbikeCfg] = useState<EbikeConfig>(() => ({ ...DEFAULT_EBIKE_CONFIG }));
  const [weatherRequested, setWeatherRequested] = useState(false);
  const [scrubPos, setScrubPos] = useState<{ lat: number; lon: number } | null>(null);
  // Gekoppelte Scrub-Distanz: Wetter-Strip-Klick ↔ Scrubber-Marker (Mockup 03).
  const [scrubDistM, setScrubDistM] = useState<number | null>(null);
  const handlePickDist = useCallback((distM: number) => setScrubDistM(distM), []);
  // Stabiler Callback + Wert-Guard: verhindert die Render-Schleife (RouteScrubber
  // ruft onPos in einem Effect, der von onPos abhängt — inline-Funktion loopte).
  const handleScrubPos = useCallback((lat: number, lon: number) => {
    setScrubPos((prev) => (prev && prev.lat === lat && prev.lon === lon ? prev : { lat, lon }));
  }, []);

  const eff = useMemo(() => (direction === 'reverse' ? reverseTourTrack(track) : track), [track, direction]);
  const type = typeId ? getMovementType(typeId) : null;

  // Wind-Sampler je effektiver Strecke.
  const [windState, setWindState] = useState<WindState>({ kind: 'pending' });
  useEffect(() => {
    setWindState({ kind: 'pending' });
    const ctrl = new AbortController();
    let cancelled = false;
    createWindSampler(eff, { terrain: eff.meta.terrain, signal: ctrl.signal })
      .then((s) => { if (!cancelled) setWindState(s ? { kind: 'ready', sampler: s } : { kind: 'unavailable' }); })
      .catch(() => { if (!cancelled) setWindState({ kind: 'unavailable' }); });
    return () => { cancelled = true; ctrl.abort(); };
  }, [eff]);

  function selectType(id: MovementId) {
    setTypeId(id);
    setProfile({ ...getMovementType(id).defaults });
    setBreakCfg(defaultBreakConfig(BREAK_DEFAULTS[id]));
  }
  function resetType() { setTypeId(null); setProfile(null); setBreakCfg(null); setWeatherRequested(false); }
  function flipDirection(dir: Direction) {
    if (dir === direction) return;
    const total = track.meta.totalDistanceM;
    setBreakCfg((c) => c ? { ...c, custom: c.custom.map((b) => ({ ...b, dist: total - b.dist })) } : c);
    setDirection(dir);
  }
  const timingResult = useMemo(() => {
    if (!profile || !type || !breakCfg) return null;
    const sampler = windState.kind === 'ready' ? windState.sampler : null;
    return computeTimingIterated(eff, profile, MODELS[type.id], breakCfg, startMs, type.category, sampler);
  }, [eff, profile, type, breakCfg, startMs, windState]);
  const timing = timingResult?.timing ?? null;

  const ebikeResult = useMemo(() => {
    if (!profile || type?.id !== 'ebike') return null;
    return computeEbikeBattery(eff, profile, ebikeCfg);
  }, [eff, profile, type, ebikeCfg]);

  const enrichedSamples: SampleETA[] = useMemo(() => {
    if (!timing) return [];
    if (!ebikeResult) return timing.sampleEtas;
    return timing.sampleEtas.map((s) => ({ ...s, batteryPctRemaining: Math.round(batterySocAtDist(ebikeResult, s.dist) * 1000) / 10 }));
  }, [timing, ebikeResult]);

  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    (window as unknown as { __samples?: SampleETA[] }).__samples = enrichedSamples;
  }

  // Wetter-Anreicherung — erst nach explizitem „Wetter berechnen". Stabiler
  // Fingerprint, damit Slider-Tweaks ohne Positions-/ETA-Wirkung nicht re-fetchen.
  const sampleFingerprint = useMemo(() => enrichedSamples
    .map((s) => `${s.lat.toFixed(3)},${s.lon.toFixed(3)},${Math.round(s.etaMs / 300_000)}`)
    .join('|'), [enrichedSamples]);

  const [weatherState, setWeatherState] = useState<WeatherState>({ kind: 'idle' });
  useEffect(() => {
    if (!weatherRequested || enrichedSamples.length === 0) { setWeatherState({ kind: 'idle' }); return; }
    let cancelled = false;
    const ctrl = new AbortController();
    setWeatherState({ kind: 'loading' });
    enrichSampleWeather(enrichedSamples, { signal: ctrl.signal, terrain: eff.meta.terrain })
      .then(({ samples, meta }) => { if (!cancelled) setWeatherState({ kind: 'ready', samples, meta }); })
      .catch((err) => { if (!cancelled) setWeatherState({ kind: 'error', message: err instanceof Error ? err.message : String(err) }); });
    return () => { cancelled = true; ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleFingerprint, weatherRequested]);

  const displaySamples: SampleETA[] = weatherState.kind === 'ready' ? weatherState.samples : enrichedSamples;
  const agg = useMemo(() => computeWeatherAggregate(displaySamples), [displaySamples]);

  const mapBreaks: MapBreak[] = useMemo(
    () => (timing?.milestones ?? [])
      .filter((m): m is Milestone & { kind: 'rest' | 'meal' | 'custom' } => m.kind === 'rest' || m.kind === 'meal' || m.kind === 'custom')
      .map((m) => ({ lat: m.lat, lon: m.lon, kind: m.kind })),
    [timing],
  );
  const mapWaypoints = useMemo(() => eff.waypoints.map((w) => ({ lat: w.lat, lon: w.lon })), [eff]);
  const weatherMarkers: WeatherMarker[] = useMemo(() => {
    if (weatherState.kind !== 'ready') return [];
    // Karten-Marker gleichmäßig auf ~MAX ausdünnen (Start/Ende dabei) — sonst
    // überlappen Zustands-Icons + Warn-/Föhn-Halos zu einer dichten Masse.
    const withW = displaySamples.filter((s) => s.weather != null);
    const MAX = 10;
    const idxs = withW.length <= MAX
      ? withW.map((_, i) => i)
      : [...new Set(Array.from({ length: MAX }, (_, k) => Math.round((k * (withW.length - 1)) / (MAX - 1))))];
    return idxs.map((i) => {
      const s = withW[i];
      const w = s.weather!;
      // Wind relativ zur Reiserichtung (Mockup: grün Rücken / terracotta Seite / rot Gegen).
      let windRel: 'tail' | 'cross' | 'head' | null = null;
      if (w.windSpeedMps != null && w.windSpeedMps >= 4 && w.windDirectionDeg != null) {
        const comp = headwindComponentMps(bearingAtDist(eff.points, s.dist), w.windDirectionDeg, w.windSpeedMps);
        windRel = comp > 0.7 ? 'tail' : comp < -0.7 ? 'head' : 'cross';
      }
      return {
        lat: s.lat, lon: s.lon, distM: s.dist, etaMs: s.etaMs,
        temperatureC: w.temperatureC, cloudCoverPct: w.cloudCoverPct, precipMmH: w.precipitationMmH, precipType: w.precipitationType,
        precipSource: w.precipitationSource, windSpeedMps: w.windSpeedMps, windDirectionDeg: w.windDirectionDeg, windRel,
        uvIndex: w.uvIndex, hasWarning: w.warnings.length > 0, warningEvent: w.warnings[0]?.event, foehn: w.foehn?.isFoehn ?? false,
      };
    });
  }, [weatherState.kind, displaySamples, eff.points]);

  const showResult = weatherRequested;

  return (
    <>
      {/* ===== Breadcrumb / Schritt-Navigation ===== */}
      <div className="rt-crumb">
        {onBack && (
          <button type="button" className="rt-crumb-back" onClick={onBack}>
            <IconArrowLeft size={15} /> {fileLabel ? 'Andere Strecke' : 'Zurück'}
          </button>
        )}
        <span className="rt-crumb-sep">·</span>
        <span className="rt-crumb-here">{eff.meta.name || 'Deine Tour'}</span>
        {showResult && (
          <button type="button" className="rt-crumb-edit" onClick={() => setWeatherRequested(false)}>
            Planung anpassen
          </button>
        )}
      </div>

      {/* ===== Tour-Kopf ===== */}
      <header className="rt-tourhead">
        <span className="rt-eyebrow">{showResult ? `Ergebnis${type ? ` · ${type.label}` : ''}` : `Tourenplanung${type ? ` · ${type.label}` : ''}`}</span>
        <h1>{eff.meta.name || 'Deine Tour'}</h1>
        {showResult && timing ? (
          <p className="rt-tourhead-sub">
            {formatStart(startMs)} → <strong>{clock(timing.arrivalMs)}</strong> · Gesamt <strong>{formatHM(timing.totalSec)}</strong> · <strong>{(eff.meta.totalDistanceM / 1000).toFixed(1).replace('.', ',')} km</strong>
          </p>
        ) : (
          <p className="rt-tourhead-sub">
            <strong>{(eff.meta.totalDistanceM / 1000).toFixed(1).replace('.', ',')} km</strong>
            {eff.meta.elevationAvailable ? <> · <strong>{eff.meta.ascentM} hm</strong> Aufstieg</> : null}
            {' '}· Gelände {eff.meta.terrain}
          </p>
        )}
      </header>

      {showResult ? (
        /* ============ ERGEBNIS (Mockup 03 + 04) ============ */
        <>
          {weatherState.kind === 'loading' && <p className="rt-note">Wetter pro Punkt wird geladen …</p>}
          {weatherState.kind === 'error' && <p className="rt-note rt-note-warn"><IconWarning size={14} /> Wetter-Anreicherung fehlgeschlagen: {weatherState.message}</p>}

          {/* Wetter-Strip über voller Breite (mehr Platz als im Panel) */}
          {weatherState.kind === 'ready' && (
            <section className="rt-section">
              <span className="rt-eyebrow">Wetter entlang · Verlässlichkeit</span>
              <TourWeatherStrip samples={displaySamples} onPick={handlePickDist} selectedDistM={scrubDistM} />
            </section>
          )}

          {/* Zwei-Spalten: Karte links, Vorhersage-Panel rechts */}
          <div className="rt-result-grid rt-section">
            <div className="rt-card rt-mapwrap rt-mapwrap-tall">
              <RouteMap
                points={eff.points}
                samples={eff.samples}
                breaks={mapBreaks}
                waypoints={mapWaypoints}
                weatherSamples={weatherMarkers}
                scrubMarker={scrubPos}
              />
              {weatherState.kind === 'ready' && <QuellenOverlay meta={weatherState.meta} />}
              {weatherState.kind === 'ready' && weatherMarkers.some((m) => m.windRel) && <WindLegend />}
            </div>

            <aside className="rt-card rt-fcpanel">
              {agg.hasData && (
                <div className="rt-fc-sec">
                  <span className="rt-eyebrow">Wetter · gesamte Tour</span>
                  <WeatherStatGrid agg={agg} />
                </div>
              )}
              {(agg.warnings.count > 0 || agg.foehn) && (
                <div className="rt-fc-banners">
                  {agg.warnings.count > 0 && <WarningBanner warnings={agg.warnings.distinct} />}
                  {agg.foehn && <FoehnBanner agg={agg} />}
                </div>
              )}
              <div className="rt-fc-actions">
                <button type="button" className="rt-act rt-act-primary"><IconCalendar size={16} /> Als Event</button>
                <button type="button" className="rt-act"><IconRoute size={16} /> Tagesablauf</button>
                <button type="button" className="rt-act"><IconBookmark size={16} /> Speichern</button>
              </div>
            </aside>
          </div>

          {/* Analyse: Scrubber, Sparklines + Zeit-Übersicht, Zeitplan + Qualität */}
          {timing && weatherState.kind === 'ready' && (
            <RouteScrubber points={eff.points} samples={displaySamples} milestones={timing.milestones} startMs={startMs} onPos={handleScrubPos} dist={scrubDistM ?? undefined} onDist={setScrubDistM} />
          )}

          {timing && (
            <div className="rt-section rt-cols rt-cols-wide-l">
              <div className="rt-card rt-profile">
                <WeatherProfile samples={displaySamples} />
              </div>
              <TimeOverview timing={timing} startMs={startMs} category={type?.category ?? 'foot'} />
            </div>
          )}

          {timing && weatherState.kind === 'ready' && timingResult && (
            <div className="rt-section rt-cols rt-cols-wide-r">
              <div className="rt-card rt-timeline">
                <span className="rt-eyebrow">Zeitplan</span>
                <Timeline milestones={timing.milestones} />
              </div>
              <div className="rt-quality-sec">
                <span className="rt-eyebrow" style={{ display: 'block', marginBottom: '0.6rem' }}>Daten-Herkunft & Qualität</span>
                <QualityRow meta={weatherState.meta} result={timingResult} windState={windState} />
              </div>
            </div>
          )}

          {horizonState(timing?.arrivalMs ?? startMs) === 'far_future' && (
            <p className="rt-note rt-note-warn"><IconWarning size={14} /> Die Ankunft liegt über 10 Tage in der Zukunft — reduzierte Vorhersage-Konfidenz.</p>
          )}

          <div className="rt-footer"><span className="dot">●</span> Wetter, das seine Arbeit zeigt.</div>
        </>
      ) : !type ? (
        /* ============ SCHRITT 1 · BEWEGUNGSART (Mockup 02) ============ */
        <section className="rt-step">
          <span className="rt-eyebrow">Schritt 1 von 2 · Bewegungsart</span>
          <h2>Wie bist du unterwegs?</h2>
          <p>Wähle deine Bewegungsart — danach planen wir Zeiten und holen das Wetter entlang der Tour.</p>
          <MovementPicker selected={typeId} onSelect={selectType} />
        </section>
      ) : (
        /* ============ SCHRITT 2 · KONFIGURATION (Mockup 02) ============ */
        <section className="rt-step">
          <span className="rt-eyebrow">Schritt 2 von 2 · Konfiguration</span>
          <div className="rt-card rt-config">
            <div className="rt-config-head">
              <span className="rt-config-dot" />
              <span className="rt-config-name">{type.label}</span>
              <span className="rt-config-blurb">{type.blurb}</span>
              <button type="button" className="rt-config-change" onClick={resetType}>andere Art wählen</button>
            </div>

            {profile && breakCfg && (
              <div className="rt-config-cols">
                <div className="rt-config-col tp">
                  <SpeedProfileConfig type={type} profile={profile} track={eff} onChange={setProfile} onChangeType={resetType} showHead={false} />
                  {loop ? (
                    <div className="tp-block"><span className="tp-loop-badge"><IconLoop size={14} /> Rundtour erkannt — Richtung egal</span></div>
                  ) : (
                    <div className="tp-block">
                      <div className="tp-block-head"><span className="tp-block-title">Richtung</span></div>
                      <div className="tp-seg" role="group">
                        <button type="button" className={`tp-seg-btn${direction === 'forward' ? ' is-active' : ''}`} onClick={() => flipDirection('forward')}>Hinweg</button>
                        <button type="button" className={`tp-seg-btn${direction === 'reverse' ? ' is-active' : ''}`} onClick={() => flipDirection('reverse')}>Rückwärts</button>
                      </div>
                    </div>
                  )}
                  <StartTimeConfig value={startMs} onChange={setStartMs} />
                </div>
                <div className="rt-config-col rt-config-col-r tp">
                  <BreaksConfig track={eff} cfg={breakCfg} onChange={setBreakCfg} />
                </div>
              </div>
            )}
          </div>

          {type.id === 'ebike' && ebikeResult && (
            <div className="rt-card rt-config rt-ebike-card">
              <EbikeBatteryPanel cfg={ebikeCfg} onChange={setEbikeCfg} result={ebikeResult} />
            </div>
          )}

          <button type="button" className="rt-cta" disabled={!timing} onClick={() => setWeatherRequested(true)}>Wetter berechnen <IconArrowRight size={17} /></button>
        </section>
      )}
    </>
  );
}

/* ===== Quellen-Overlay auf der Karte ===== */
function QuellenOverlay({ meta }: { meta: EnrichmentMeta }) {
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
function WindLegend() {
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

/** Kompass-Peilung des Segments, das die Distanz `dist` enthält. */
function bearingAtDist(points: Array<{ lat: number; lon: number; dist: number }>, dist: number): number {
  if (points.length < 2) return 0;
  let i = 1;
  while (i < points.length - 1 && points[i].dist < dist) i++;
  return bearingDeg(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
}

/* ===== Zeit-Übersicht ===== */
function TimeOverview({ timing, startMs, category }: { timing: TourTiming; startMs: number; category: 'foot' | 'bike' }) {
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
function Timeline({ milestones }: { milestones: Milestone[] }) {
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
function kindLabel(k: Milestone['kind']): string {
  return k === 'start' ? 'Start' : k === 'end' ? 'Ziel' : k === 'meal' ? 'Mahlzeit' : k === 'custom' ? 'Pause' : 'Pause';
}

/* ===== Daten-Herkunft & Qualität ===== */
function QualityRow({ meta, result, windState }: { meta: EnrichmentMeta; result: ReturnType<typeof computeTimingIterated>; windState: WindState }) {
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
