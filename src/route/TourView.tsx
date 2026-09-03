/**
 * Tour-Ansicht („Wetter entlang deiner Route") gemäß Mockups 02–04.
 *
 * Ablauf: Karte + Kennzahlen → Schritt 1 Bewegungsart → Schritt 2 Konfiguration
 * → CTA „Wetter berechnen" → Ergebnis (Wetter-Strip, Karte + Profil, Stat-Grid,
 * Warn-/Föhn-Banner, Zeit-Scrubber, Zeitplan + Zeit-Übersicht, Daten-Herkunft).
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import RouteMap, { type MapBreak, type WeatherMarker } from './RouteMap';
import MovementPicker from './MovementPicker';
import SpeedProfileConfig from './SpeedProfileConfig';
import StartTimeConfig from './StartTimeConfig';
import BreaksConfig from './BreaksConfig';
import { getMovementType, MOVEMENT_TYPES, type MovementId } from './movementTypes';
import RouteDeckShell, { DeckLive, IconChevLeft, type RailFeature } from './RouteDeck';
import { MODELS } from './movementModels';
import { formatHM, type SpeedProfile } from './speedModel';
import { BREAK_DEFAULTS, defaultBreakConfig, type BreakConfig } from './breaks';
import { computeTimingIterated, type Milestone, type SampleETA, type TourTiming } from './tourTiming';
import { isLoop, reverseTourTrack, type TourTrack } from './tourTrack';
import { formatStart, horizonState } from './startTime';
import { createWindSampler, type WindSampler } from './windSampling';
import { bearingAtDist, headwindComponentMps } from './windEffect';
import EbikeBatteryPanel from './EbikeBatteryPanel';
import { batterySocAtDist, computeEbikeBattery, DEFAULT_EBIKE_CONFIG, type EbikeConfig } from './ebikeBattery';
import { enrichSampleWeather, START_OFFSETS_MIN, type EnrichmentMeta } from '../pointForecast/weatherEnrichment';
import { packTour, saveTour, tourStoreEnabled, TOUR_SAVE_DEBOUNCE_MS, type StoredPlan } from './tourStore';
import { computeWeatherAggregate } from './weatherAggregate';
import { WeatherStatGrid, WarningBanner, FoehnBanner } from './WeatherSummary';
import WeatherProfile from './WeatherProfile';
import TourWeatherStrip from './TourWeatherStrip';
import RouteScrubber from './RouteScrubber';
// Die 3D-Ansicht lädt erst beim Umschalten (eigener Chunk) — das 2D-Ergebnis
// zahlt nichts dafür. Muster wie `EventZoneMap` (EZ, Entscheidung E7).
const Route3DView = lazy(() => import('./route3d/Route3DView'));
/**
 * Das Ergebnis öffnet mit dem Relief (Jans Entscheidung, R3D-8). Die Karte kommt
 * lazy — wer auf die flache Karte umschaltet, lädt Vorhang und Textur nie.
 */
const RouteTerrainPanel = lazy(() => import('./route3d/RouteTerrainPanel'));

/** Welche Karte das Ergebnis zeigt. Standard: das Gelände. */
type ResultMap = 'terrain' | 'flat';
const RESULT_MAP_KEY = 'bsc.route.resultmap';

function loadResultMap(): ResultMap {
  try {
    return localStorage.getItem(RESULT_MAP_KEY) === 'flat' ? 'flat' : 'terrain';
  } catch {
    return 'terrain';
  }
}
import type { TourViewMode } from './RoutePage';
import { clock } from './tourUi';
import {
  IconLoop, IconWarning, IconCheck, IconArrowRight,
  IconCalendar, IconRoute, IconBookmark,
} from './routeIcons';
import { useIsMobile } from '../mobile/useIsMobile';
import './verifySamples'; // Dev-only
import './tourTheme.css';
import './movement.css';
import './routeDeck.css';
import '../mobile/safeArea.css';

type Direction = 'forward' | 'reverse';

/**
 * Tour aus dem Gerätespeicher (V-R3D-1, `audit/route-3d.md` §15.4). Trägt den
 * gespeicherten Plan, den Zeitpunkt der Ablage und die Frage, ob die Startzeit
 * dabei auf „jetzt" rücken musste — die Ansicht sagt beides.
 */
export interface RestoredTour {
  plan: StoredPlan;
  savedMs: number;
  startMoved: boolean;
  /** Eintrag löschen und zurück zum Upload. */
  onDiscard: () => void;
}
type WindState = { kind: 'pending' } | { kind: 'ready'; sampler: WindSampler } | { kind: 'unavailable' };
type WeatherState =
  | { kind: 'idle' } | { kind: 'loading' }
  | { kind: 'ready'; samples: SampleETA[]; meta: EnrichmentMeta }
  | { kind: 'error'; message: string };

export default function TourView({ track, fileLabel, onBack, onHome, onOpenFeature, isMobile: isMobileProp, view = '2d', onView, restore }: { track: TourTrack; fileLabel?: string; onBack?: () => void; onHome?: () => void; onOpenFeature?: (id: RailFeature) => void; isMobile?: boolean; view?: TourViewMode; onView?: (v: TourViewMode) => void; restore?: RestoredTour }) {
  const isMobileHook = useIsMobile();
  const isMobile = isMobileProp ?? isMobileHook;
  const loop = useMemo(() => isLoop(track), [track]);
  // Vorbelegung: entweder frisch oder aus dem gespeicherten Plan (V-R3D-1).
  // Das Wetter ist NICHT dabei — es waere nach Minuten falsch und wird neu geholt.
  const [direction, setDirection] = useState<Direction>(restore?.plan.direction ?? 'forward');
  const [typeId, setTypeId] = useState<MovementId | null>(restore?.plan.typeId ?? null);
  const [profile, setProfile] = useState<SpeedProfile | null>(restore?.plan.profile ?? null);
  const [breakCfg, setBreakCfg] = useState<BreakConfig | null>(restore?.plan.breakCfg ?? null);
  const [startMs, setStartMs] = useState<number>(() => restore?.plan.startMs ?? Date.now());
  const [ebikeCfg, setEbikeCfg] = useState<EbikeConfig>(() => ({ ...(restore?.plan.ebikeCfg ?? DEFAULT_EBIKE_CONFIG) }));
  const [weatherRequested, setWeatherRequested] = useState(restore?.plan.weatherRequested ?? false);
  const [noteOpen, setNoteOpen] = useState(true);
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
    // `startOffsetsMin` kostet keinen Abruf (audit/route-3d.md B11) und ist die
    // einzige Stelle, an der alternative Startzeiten ueberhaupt bewertbar sind:
    // danach sind Cluster-Forecasts und Radar-Sampler weg.
    enrichSampleWeather(enrichedSamples, {
      signal: ctrl.signal,
      terrain: eff.meta.terrain,
      startOffsetsMin: START_OFFSETS_MIN,
    })
      .then(({ samples, meta }) => { if (!cancelled) setWeatherState({ kind: 'ready', samples, meta }); })
      .catch((err) => { if (!cancelled) setWeatherState({ kind: 'error', message: err instanceof Error ? err.message : String(err) }); });
    return () => { cancelled = true; ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleFingerprint, weatherRequested]);

  // Plan im Geraetespeicher halten (V-R3D-1). Entprellt, weil jeder Reglerzug
  // sonst eine eigene Transaktion auslöst; das Wetter bleibt außen vor.
  useEffect(() => {
    if (!tourStoreEnabled()) return;
    const plan: StoredPlan = { direction, typeId, profile, breakCfg, startMs, ebikeCfg, weatherRequested };
    const id = setTimeout(() => { void saveTour(packTour(track, plan, fileLabel ? { fileLabel } : {})); }, TOUR_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [track, fileLabel, direction, typeId, profile, breakCfg, startMs, ebikeCfg, weatherRequested]);

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

  // R3D: die 3D-Ansicht rendert INNERHALB dieser Komponente — kein Router-Wechsel,
  // deshalb überlebt die hochgeladene Strecke den Moduswechsel (audit/route-3d.md B3).
  // Ohne berechnetes Wetter zeigt sie nichts; der Pfad bleibt stehen und greift,
  // sobald das Ergebnis da ist.
  // V-R3D-3 (§15.3): `show3d` beantwortete ZWEI Fragen mit einem Wert — „ist 3D
  // die aktive Ansicht?" (Rahmen) und „gibt es Daten zum Zeichnen?" (Szene).
  // Nur die zweite hängt am Wetterzustand; sonst baut sich während jeder
  // Neuberechnung das komplette 2D-Ergebnis samt MapLibre-Karte auf und wieder ab.
  // Karte des Ergebnisses. Ohne berechnetes Wetter gibt es keine Szene — dann
  // bleibt es bei der flachen Karte, ohne dass der Umschalter etwas verspricht.
  const [resultMap, setResultMap] = useState<ResultMap>(() => loadResultMap());
  useEffect(() => { try { localStorage.setItem(RESULT_MAP_KEY, resultMap); } catch { /* privat */ } }, [resultMap]);
  const canTerrain = weatherState.kind === 'ready';
  const showTerrain = canTerrain && resultMap === 'terrain';

  const showResult = weatherRequested;
  const in3d = showResult && view === '3d';
  const show3d = in3d && weatherState.kind === 'ready';
  const viewToggle = onView ? (
    <span className="r3-toggle" role="group" aria-label="Ansicht">
      <button type="button" className={view === '2d' ? 'is-on' : undefined} aria-pressed={view === '2d'} onClick={() => onView('2d')}>2D</button>
      <button type="button" className={view === '3d' ? 'is-on' : undefined} aria-pressed={view === '3d'} onClick={() => onView('3d')}>3D</button>
    </span>
  ) : null;
  const restoreNote = restore && noteOpen ? (
    <div className="r3-restore" role="status">
      <span className="r3-restore-txt">
        <b>Zuletzt geplante Tour wiederhergestellt</b> — gespeichert auf diesem Gerät, {formatStart(restore.savedMs)}.
        {restore.startMoved ? ' Die gespeicherte Startzeit lag außerhalb der Vorhersage und steht jetzt auf „jetzt".' : ''}
        {' '}Das Wetter wird frisch geholt.
      </span>
      <button type="button" className="r3-restore-drop" onClick={restore.onDiscard}>verwerfen</button>
      <button type="button" className="r3-restore-x" aria-label="Hinweis ausblenden" onClick={() => setNoteOpen(false)}>&#10005;</button>
    </div>
  ) : null;
  const distKm = (eff.meta.totalDistanceM / 1000).toFixed(1).replace('.', ',');
  const homeFn = onHome ?? onBack ?? (() => {});
  const backToPrev = onBack ?? (() => {});
  const tourName = eff.meta.name || 'Deine Tour';

  /* ===== Richtungs-Umschalter / Startzeit (geteilt Desktop + Mobile) ===== */
  const directionBlock = loop ? (
    <div className="tp-block"><span className="tp-loop-badge"><IconLoop size={14} /> Rundtour erkannt — Richtung egal</span></div>
  ) : (
    <div className="tp-block">
      <div className="tp-block-head"><span className="tp-block-title">Richtung</span></div>
      <div className="tp-seg" role="group">
        <button type="button" className={`tp-seg-btn${direction === 'forward' ? ' is-active' : ''}`} onClick={() => flipDirection('forward')}>Hinweg</button>
        <button type="button" className={`tp-seg-btn${direction === 'reverse' ? ' is-active' : ''}`} onClick={() => flipDirection('reverse')}>Rückwärts</button>
      </div>
    </div>
  );

  /* ===== Konfigurations-Panels (Tempo/Richtung/Start · Pausen · E-Bike · CTA) ===== */
  const configBody = type && profile && breakCfg ? (
    <>
      <div className="rd-config-cols">
        <div className="rd-config-panel tp">
          <SpeedProfileConfig type={type} profile={profile} track={eff} onChange={setProfile} onChangeType={resetType} showHead={false} />
          {directionBlock}
          <StartTimeConfig value={startMs} onChange={setStartMs} />
        </div>
        <div className="rd-config-panel tp">
          <BreaksConfig track={eff} cfg={breakCfg} onChange={setBreakCfg} />
        </div>
      </div>
      {type.id === 'ebike' && ebikeResult && (
        <div className="rd-ebike-panel"><EbikeBatteryPanel cfg={ebikeCfg} onChange={setEbikeCfg} result={ebikeResult} /></div>
      )}
      <button type="button" className={`rd-cta${isMobile ? ' rd-cta--full' : ''}`} disabled={!timing} onClick={() => setWeatherRequested(true)}>
        Wetter berechnen <IconArrowRight size={17} />
      </button>
    </>
  ) : null;

  /* ===== Ergebnis-Body (T5/T7/T10) ===== */
  const resultBody = (
    <>
      <span className="rd-eyebrow">Ergebnis{type ? ` · ${type.label}` : ''}</span>
      <h1 className="rd-result-title">{tourName}</h1>
      {timing && (
        <div className="rd-result-sub">
          {formatStart(startMs)} → <strong>{clock(timing.arrivalMs)}</strong> · Gesamt <strong>{formatHM(timing.totalSec)}</strong> · <strong>{distKm} km</strong>
        </div>
      )}

      {weatherState.kind === 'loading' && <p className="rd-note">Wetter pro Punkt wird geladen …</p>}
      {weatherState.kind === 'error' && <p className="rd-note rd-note--warn"><IconWarning size={14} /> Wetter-Anreicherung fehlgeschlagen: {weatherState.message}</p>}

      {weatherState.kind === 'ready' && (
        <>
          <span className="rd-result-strip-label">Wetter entlang · Verlässlichkeit</span>
          <TourWeatherStrip samples={displaySamples} onPick={handlePickDist} selectedDistM={scrubDistM} />
        </>
      )}

      {viewToggle && weatherState.kind === 'ready' && (
        <div className="rd-viewbar">
          {viewToggle}
          <span className="rd-viewbar-note">3D zeigt Wind, Regen und Wolkenbasis über dem Höhenprofil — Strecke und Zeit bleiben erhalten.</span>
        </div>
      )}
      <div className="rd-result-grid">
        <div className="rd-mapcol">
          {canTerrain && (
            <div className="rd-mapsw" role="group" aria-label="Kartenansicht">
              <button
                type="button"
                className={resultMap === 'terrain' ? 'is-on' : undefined}
                aria-pressed={resultMap === 'terrain'}
                onClick={() => setResultMap('terrain')}
                title="3D-Relief mit der Wetterlage auf der Strecke"
              >
                Gelände
              </button>
              <button
                type="button"
                className={resultMap === 'flat' ? 'is-on' : undefined}
                aria-pressed={resultMap === 'flat'}
                onClick={() => setResultMap('flat')}
                title="Flache Karte mit Pausen, Wegpunkten und Wetter-Markern"
              >
                Karte
              </button>
              <span className="rd-mapsw-note">
                {showTerrain
                  ? 'Relief mit der Wetterlage auf der Strecke'
                  : 'Flache Karte mit Pausen, Wegpunkten und Wetter-Markern'}
              </span>
            </div>
          )}

          {showTerrain ? (
            <Suspense fallback={<div className="rd-mapwait">Gelände wird geladen …</div>}>
              <RouteTerrainPanel
                samples={displaySamples}
                points={eff.points}
                countries={weatherState.meta.countries}
                coverage={weatherState.meta.coverage}
                terrain={eff.meta.terrain}
                markerM={scrubDistM ?? 0}
                onPickDist={handlePickDist}
                isMobile={isMobile}
              />
            </Suspense>
          ) : (
            <div className="rd-mapwrap">
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
          )}
        </div>

        <aside className="rd-fcpanel">
          {agg.hasData && (
            <div className="rt-fc-sec">
              <span className="rd-label">Wetter · gesamte Tour</span>
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

      {timing && weatherState.kind === 'ready' && (
        <div className="rd-section">
          <RouteScrubber points={eff.points} samples={displaySamples} milestones={timing.milestones} startMs={startMs} onPos={handleScrubPos} dist={scrubDistM ?? undefined} onDist={setScrubDistM} />
        </div>
      )}

      {timing && (
        <div className="rd-analysis-grid rd-analysis-grid--lr">
          <div className="rd-panel"><WeatherProfile samples={displaySamples} /></div>
          <TimeOverview timing={timing} startMs={startMs} category={type?.category ?? 'foot'} />
        </div>
      )}

      {timing && weatherState.kind === 'ready' && timingResult && (
        <div className="rd-analysis-grid rd-analysis-grid--rl">
          <div className="rt-card rt-timeline">
            <span className="rd-label">Zeitplan</span>
            <Timeline milestones={timing.milestones} />
          </div>
          <div className="rt-quality-sec">
            <span className="rd-label" style={{ display: 'block', marginBottom: '0.6rem' }}>Daten-Herkunft &amp; Qualität</span>
            <QualityRow meta={weatherState.meta} result={timingResult} windState={windState} />
          </div>
        </div>
      )}

      {horizonState(timing?.arrivalMs ?? startMs) === 'far_future' && (
        <p className="rd-note rd-note--warn"><IconWarning size={14} /> Die Ankunft liegt über 10 Tage in der Zukunft — reduzierte Vorhersage-Konfidenz.</p>
      )}

      <div className="rd-footer"><span className="dot">●</span> Wetter, das seine Arbeit zeigt.</div>
    </>
  );

  /* ===== Body je Zustand (Mobile kombiniert Bewegungsart + Konfiguration) ===== */
  let body: ReactNode;
  if (show3d && weatherState.kind === 'ready' && timing) {
    body = (
      <Suspense fallback={<p className="rd-status">3D-Ansicht wird geladen …</p>}>
        <Route3DView
          samples={displaySamples}
          points={eff.points}
          terrain={eff.meta.terrain}
          elevation={{ source: eff.meta.elevationSource, deltaM: eff.meta.elevationDeltaM }}
          meta={weatherState.meta}
          tourName={tourName}
          movementLabel={type?.label ?? null}
          startMs={startMs}
          arrivalMs={timing.arrivalMs}
          isMobile={isMobile}
          distM={scrubDistM}
          onDist={setScrubDistM}
          onPos={handleScrubPos}
          onStart={setStartMs}
          toggle={viewToggle}
        />
      </Suspense>
    );
  } else if (in3d) {
    // Rahmen bleibt stehen, die Szene wartet — kein Rückfall auf 2D.
    body = <ThreeDStandby state={weatherState} onBack2d={() => onView?.('2d')} />;
  } else if (showResult) {
    body = resultBody;
  } else if (isMobile) {
    body = (
      <>
        <div className="rd-label">Bewegungsart</div>
        <div className="rd-mvchips" role="radiogroup" aria-label="Bewegungsart">
          {MOVEMENT_TYPES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={typeId === m.id}
              className={`rd-mvchip${typeId === m.id ? ' is-active' : ''}`}
              onClick={() => selectType(m.id)}
            >
              {m.icon}
              <span className="rd-mvchip-name">{m.label}</span>
            </button>
          ))}
        </div>
        {configBody ?? <p className="rd-status">Wähle oben deine Bewegungsart, um die Planung zu starten.</p>}
      </>
    );
  } else if (!type) {
    body = (
      <>
        <div className="rd-progress"><span className="rd-eyebrow">Schritt 1 von 2 · Bewegungsart</span><span className="rd-progress-bar"><span style={{ width: '50%' }} /></span></div>
        <h2 className="rd-h2">Wie bist du unterwegs?</h2>
        <p className="rd-p">Wähle deine Bewegungsart — danach planen wir Zeiten und holen das Wetter entlang der Tour.</p>
        <MovementPicker selected={typeId} onSelect={selectType} />
      </>
    );
  } else {
    body = (
      <>
        <div className="rd-progress"><span className="rd-eyebrow">Schritt 2 von 2 · Konfiguration</span><span className="rd-progress-bar"><span style={{ width: '100%' }} /></span></div>
        <div className="rd-config-head">
          <span className="rd-config-dot" />
          <span className="rd-config-name">{type.label}</span>
          <span className="rd-config-blurb">{type.blurb}</span>
          <button type="button" className="rd-config-change" onClick={resetType}>andere Art wählen</button>
        </div>
        {configBody}
      </>
    );
  }

  /* ===== Shell-Chrome (Topbar-Crumb / Mobile-Header / Back) je Zustand ===== */
  const crumb = in3d ? (
    <div className="rd-crumb">
      <button type="button" className="rd-back" onClick={() => onView?.('2d')}><IconChevLeft size={14} /> Ergebnis</button>
      <span className="rd-crumb-txt">· 3D-Ansicht{type ? ` · ${type.label}` : ''}</span>
    </div>
  ) : showResult ? (
    <div className="rd-crumb">
      <button type="button" className="rd-back" onClick={() => setWeatherRequested(false)}><IconChevLeft size={14} /> Planung anpassen</button>
      <span className="rd-crumb-txt">· Ergebnis{type ? ` · ${type.label}` : ''}</span>
    </div>
  ) : (
    <div className="rd-crumb">
      <button type="button" className="rd-back" onClick={type ? resetType : backToPrev}>
        <IconChevLeft size={14} /> {type ? 'Zurück' : (fileLabel ? 'Andere Strecke' : 'Zurück')}
      </button>
      <span className="rd-crumb-txt">· {tourName}</span>
    </div>
  );

  const mobileHeader = in3d ? (
    <>
      <button type="button" className="rd-m-back" onClick={() => onView?.('2d')} aria-label="Zurück zum Ergebnis"><IconChevLeft /></button>
      <div className="rd-m-htext">
        <div className="rd-m-eyebrow">3D-Ansicht{type ? ` · ${type.label}` : ''}</div>
        <div className="rd-m-title">{tourName}</div>
      </div>
      {viewToggle}
    </>
  ) : showResult ? (
    <>
      <button type="button" className="rd-m-back" onClick={() => setWeatherRequested(false)} aria-label="Planung anpassen"><IconChevLeft /></button>
      <div className="rd-m-htext">
        <div className="rd-m-eyebrow">Ergebnis{type ? ` · ${type.label}` : ''}</div>
        <div className="rd-m-title">{tourName}</div>
      </div>
      {viewToggle}
    </>
  ) : (
    <>
      <button type="button" className="rd-m-back" onClick={backToPrev} aria-label="Zurück"><IconChevLeft /></button>
      <div className="rd-m-htext">
        <div className="rd-m-eyebrow">Schritt 2 von 2</div>
        <div className="rd-m-title">Konfiguration</div>
      </div>
    </>
  );

  return (
    <RouteDeckShell
      isMobile={isMobile}
      onHome={homeFn}
      onOpenFeature={onOpenFeature}
      crumb={crumb}
      right={showResult ? <DeckLive /> : undefined}
      mobileHeader={mobileHeader}
      contentClass={showResult ? 'rd-content--result' : undefined}
    >
      {restoreNote}
      {body}
    </RouteDeckShell>
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

/**
 * Wartefeld INNERHALB der 3D-Ansicht (V-R3D-3). Es trägt bewusst keine
 * Wetterwerte: während der Neuberechnung gilt der alte Stand für die neue
 * Startzeit nicht mehr, und ein stehengelassenes Bild wäre eine Falschaussage.
 */
function ThreeDStandby({ state, onBack2d }: { state: WeatherState; onBack2d: () => void }) {
  const error = state.kind === 'error' ? state.message : null;
  return (
    <div className="r3-standby">
      <div className="r3-standby-card">
        <span className="r3-standby-eyebrow">3D-Ansicht</span>
        {error ? (
          <>
            <p className="r3-standby-title">Das Wetter konnte nicht geladen werden.</p>
            <p className="r3-standby-sub">{error}</p>
            <button type="button" className="r3-standby-btn" onClick={onBack2d}>Zum 2D-Ergebnis</button>
          </>
        ) : state.kind === 'loading' ? (
          <>
            <p className="r3-standby-title">Wetter entlang der Route wird gerechnet …</p>
            <p className="r3-standby-sub">Die Ansicht bleibt offen — sobald die Werte da sind, zeichnen wir sie an derselben Stelle.</p>
            <span className="r3-standby-bar" aria-hidden="true" />
          </>
        ) : (
          <>
            <p className="r3-standby-title">Die 3D-Ansicht braucht das berechnete Wetter.</p>
            <button type="button" className="r3-standby-btn" onClick={onBack2d}>Zum 2D-Ergebnis</button>
          </>
        )}
      </div>
    </div>
  );
}
