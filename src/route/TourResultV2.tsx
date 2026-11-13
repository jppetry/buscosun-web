/**
 * Phase TE — the new route result (`audit/tour-ergebnis.md`), behind `TOUR_RESULT_V2` / `?tourv=2`.
 *
 * One idea: a slider along the route, and next to the stage ALL values that belong to exactly that place and that arrival
 * time. Plan pills edit the plan in place (same state, same components as the planning screen); the timing recomputes at
 * once, the weather after the plan settled (TourView, E-TE-6). Until the values belong to the plan on screen, every weather
 * part shows its waiting state — never the old values as if they were valid for the new start (V-R3D-3).
 *
 * The slider position lives HERE (E-TE-2): a pull renders this view, not TourView. TourView only hears it debounced
 * (3D view starts at the same place).
 */
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import RouteMap, { type MapBreak, type WeatherMarker } from './RouteMap';
import RouteSlider from './RouteSlider';
import SpeedProfileConfig from './SpeedProfileConfig';
import StartTimeConfig from './StartTimeConfig';
import BreaksConfig from './BreaksConfig';
import EbikeBatteryPanel from './EbikeBatteryPanel';
import TourWeatherStrip from './TourWeatherStrip';
import { MOVEMENT_TYPES, type MovementId, type MovementType } from './movementTypes';
import type { SpeedProfile } from './speedModel';
import { formatHM } from './speedModel';
import type { BreakConfig } from './breaks';
import type { EbikeConfig, EbikeResult } from './ebikeBattery';
import type { computeTimingIterated, SampleETA, TourTiming } from './tourTiming';
import type { TourTrack } from './tourTrack';
import { computeWeatherAggregate } from './weatherAggregate';
import { FoehnBanner, tourVerdict, WarningBanner, WeatherStatGrid } from './WeatherSummary';
import { formatStart, horizonState } from './startTime';
import { clock, fmt1 } from './tourUi';
import { IconBookmark, IconCalendar, IconLoop, IconRoute, IconWarning } from './routeIcons';
import { QualityRow, QuellenOverlay, TimeOverview, Timeline, WindLegend, type WeatherState, type WindState } from './tourResultParts';
import type { ResultTab } from './tourResultTabs';
import {
  confidenceWord, flagNotes, nearestSampleIndex, sampleStand, startFinishDelta, summarizeStartWindow, tourStand,
  weatherChanges, windRelationAt, windShares, TOUR_WET_MMH, WIND_REL_COLOR, WIND_REL_WORD,
  type StartWindowSummary, type WeatherChange, type WindRelation,
} from './tourResultModel';
import { START_OFFSETS_MIN, type EnrichmentMeta } from '../pointForecast/weatherEnrichment';
import { describeCondition, pickWeatherCondition, WeatherIcon } from '../components/WeatherIcon';
import './tourResult.css';

const RouteTerrainPanel = lazy(() => import('./route3d/RouteTerrainPanel'));
const WeatherProfile = lazy(() => import('./WeatherProfile'));

type Direction = 'forward' | 'reverse';
type PlanSection = 'start' | 'type' | 'tempo' | 'more';

export interface TourResultV2Props {
  isMobile: boolean;
  tourName: string;
  type: MovementType;
  profile: SpeedProfile;
  breakCfg: BreakConfig;
  ebikeCfg: EbikeConfig;
  ebikeResult: EbikeResult | null;
  track: TourTrack;
  loop: boolean;
  direction: Direction;
  startMs: number;
  timing: TourTiming;
  timingResult: ReturnType<typeof computeTimingIterated>;
  windState: WindState;
  weatherState: WeatherState;
  /** The weather in `weatherState` was fetched for exactly `planSamples`. */
  wxFresh: boolean;
  /** Samples of the current plan (ETA, elevation, E-bike battery) — valid even while the weather reloads. */
  planSamples: SampleETA[];
  mapBreaks: MapBreak[];
  mapWaypoints: Array<{ lat: number; lon: number }>;
  weatherMarkers: WeatherMarker[];
  resultMap: 'terrain' | 'flat';
  onResultMap: (m: 'terrain' | 'flat') => void;
  viewToggle: ReactNode;
  initialDistM: number | null;
  onDist: (m: number) => void;
  onPos: (lat: number, lon: number) => void;
  onStart: (ms: number) => void;
  onType: (id: MovementId) => void;
  onProfile: (p: SpeedProfile) => void;
  onBreaks: (c: BreakConfig) => void;
  onEbike: (c: EbikeConfig) => void;
  onDirection: (d: Direction) => void;
  onReplan: () => void;
  tab: ResultTab;
  onTab: (t: ResultTab) => void;
  planOpen: boolean;
  onPlanOpen: (open: boolean) => void;
  /** Mobile: the dock above the bottom bar (outside the scroll area) the slider is portalled into. */
  dockEl: HTMLElement | null;
}

/** Position changes reach TourView this much later (3D starts at the same place; no TourView render per pull). */
const POS_SYNC_MS = 250;

const kmStr = (m: number) => (m / 1000).toFixed(1).replace('.', ',');
const shortStart = (ms: number) => new Date(ms).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' ·');
const compass = (deg: number) => ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const signed = (v: number, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${(Math.round(Math.abs(v) * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',')}`;

export default function TourResultV2(p: TourResultV2Props) {
  const { isMobile, planSamples, weatherState, wxFresh, track, timing, startMs, tab } = p;
  const ready = weatherState.kind === 'ready' && wxFresh;
  const wx = ready ? weatherState.samples : null;
  const meta: EnrichmentMeta | null = ready ? weatherState.meta : null;
  const busy = weatherState.kind === 'loading' || (weatherState.kind === 'ready' && !wxFresh);
  const errorMsg = weatherState.kind === 'error' ? weatherState.message : null;
  const points = track.points;

  // ----- slider position (snapped sample index) -----
  const n = planSamples.length;
  const [idx, setIdxRaw] = useState(() => (p.initialDistM != null ? Math.max(0, nearestSampleIndex(planSamples, p.initialDistM)) : 0));
  const i = Math.min(Math.max(0, idx), Math.max(0, n - 1));
  const setIdx = useCallback((k: number) => setIdxRaw(k), []);
  const pickDist = useCallback((d: number) => setIdxRaw(Math.max(0, nearestSampleIndex(planSamples, d))), [planSamples]);
  const cur = planSamples[i];
  const wcur = wx?.[i] ?? null;
  const { onDist, onPos } = p;
  useEffect(() => {
    if (!cur) return;
    const id = setTimeout(() => { onDist(cur.dist); onPos(cur.lat, cur.lon); }, POS_SYNC_MS);
    return () => clearTimeout(id);
  }, [cur, onDist, onPos]);

  // ----- derivations from FRESH values only -----
  const agg = useMemo(() => computeWeatherAggregate(wx ?? []), [wx]);
  const verdict = useMemo(() => (wx ? tourVerdict(wx, agg) : null), [wx, agg]);
  const shares = useMemo(() => (wx ? windShares(wx, points) : null), [wx, points]);
  const events = useMemo(() => (wx ? weatherChanges(wx, points) : []), [wx, points]);
  const delta = useMemo(() => (wx ? startFinishDelta(wx, events.length) : null), [wx, events.length]);
  const startSum = useMemo(() => (meta ? summarizeStartWindow(meta.startWindow, START_OFFSETS_MIN, startMs, Date.now()) : null), [meta, startMs]);
  const stand = useMemo(() => tourStand(meta), [meta]);
  const rel = useMemo(() => (wcur ? windRelationAt(wcur, points) : null), [wcur, points]);
  const nextEvent = useMemo(() => events.find((e) => e.index > i) ?? null, [events, i]);

  const ascent = track.meta.elevationAvailable ? track.meta.ascentM : null;
  const far = horizonState(timing.arrivalMs) === 'far_future';

  /* ===== pieces ===== */
  const statusLine = errorMsg
    ? <p className="rd-note rd-note--warn te-status"><IconWarning size={14} /> Wetter-Anreicherung fehlgeschlagen: {errorMsg}</p>
    : busy ? <p className="te-busy" role="status">Wetter wird für diesen Plan gerechnet …</p> : null;

  const verdictPill = (
    <div className={`te-verdict${ready ? '' : ' is-wait'}`}>
      <i style={{ background: !verdict ? 'var(--stone-300)' : verdict.lead.startsWith('Trocken') ? 'var(--rd-sage-strong)' : 'var(--steel-600)' }} aria-hidden="true" />
      {verdict ? <><b>{verdict.lead}</b>{verdict.rest ? <span className="te-mute"> {verdict.rest}</span> : null}</> : <span className="te-mute">{busy ? 'Urteil folgt, sobald das Wetter für diesen Plan da ist.' : 'Kein Urteil ohne Wetterwerte.'}</span>}
    </div>
  );

  const horizonNote = far ? <p className="rd-note rd-note--warn te-horizon"><IconWarning size={14} /> Die Ankunft liegt über 14 Tage in der Zukunft — so weit reicht die Vorhersage nicht.</p> : null;

  const sliderReadout = (
    <SliderReadout s={cur} w={wcur} rel={rel} compact={isMobile} />
  );
  const slider = (
    <RouteSlider
      samples={planSamples}
      wx={wx}
      points={points}
      milestones={timing.milestones}
      events={events}
      idx={i}
      onIdx={setIdx}
      compact={isMobile}
      readout={sliderReadout}
    />
  );

  const scrubMarker = useMemo(() => (cur ? { lat: cur.lat, lon: cur.lon } : null), [cur]);
  const showTerrain = ready && p.resultMap === 'terrain';
  const stage = (
    <div className={`te-stage${isMobile ? ' is-mobile' : ''}`}>
      {showTerrain ? (
        <Suspense fallback={<div className="rd-mapwait te-mapbox">Gelände wird geladen …</div>}>
          <RouteTerrainPanel
            samples={wx!}
            points={points}
            countries={meta!.countries}
            coverage={meta!.coverage}
            terrain={track.meta.terrain}
            markerM={cur?.dist ?? 0}
            onPickDist={pickDist}
            isMobile={isMobile}
          />
        </Suspense>
      ) : (
        <div className="rd-mapwrap te-mapbox">
          <RouteMap
            points={points}
            samples={track.samples}
            breaks={p.mapBreaks}
            waypoints={p.mapWaypoints}
            weatherSamples={ready ? p.weatherMarkers : []}
            scrubMarker={scrubMarker}
            onPickPoint={pickDist}
          />
          {meta && <QuellenOverlay meta={meta} />}
          {ready && p.weatherMarkers.some((m) => m.windRel) && <WindLegend />}
        </div>
      )}
      <div className="te-ov te-ov--tl">
        {ready && (
          <span className="te-seg te-glass" role="group" aria-label="Kartenansicht">
            <button type="button" className={p.resultMap === 'terrain' ? 'is-on' : undefined} aria-pressed={p.resultMap === 'terrain'} onClick={() => p.onResultMap('terrain')} title="3D-Relief mit der Wetterlage auf der Strecke">Gelände</button>
            <button type="button" className={p.resultMap === 'flat' ? 'is-on' : undefined} aria-pressed={p.resultMap === 'flat'} onClick={() => p.onResultMap('flat')} title="Flache Karte mit Pausen, Wegpunkten und Wetter-Markern">Karte</button>
          </span>
        )}
      </div>
      {p.viewToggle && <div className="te-ov te-ov--tr te-glass-wrap" title="3D zeigt Wind, Regen und Wolkenbasis über dem Höhenprofil — Strecke und Zeit bleiben erhalten.">{p.viewToggle}</div>}
      {!ready && <div className="te-stage-wait" role="status">{errorMsg ? 'Ohne Wetterwerte — nur die Strecke.' : 'Wetter wird für diesen Plan gerechnet …'}</div>}
      {!isMobile && <div className="te-slider-wrap">{slider}</div>}
    </div>
  );

  const panel = (
    <PositionPanel
      s={cur}
      w={wcur}
      rel={rel}
      meta={meta}
      startMs={startMs}
      nextEvent={nextEvent}
      onJump={setIdx}
      busy={busy}
      error={errorMsg}
    />
  );

  const windCard = <WindCard wx={wx} points={points} shares={shares} curDist={cur?.dist ?? 0} onPick={pickDist} busy={busy} />;
  const changeCard = <ChangeCard events={events} delta={delta} ready={ready} busy={busy} onJump={setIdx} />;
  const startCard = <StartCard sum={startSum} startMs={startMs} ready={ready} busy={busy} onStart={p.onStart} />;

  const sources = (
    <p className="te-sources">
      Quellen: DWD · GeoSphere · MeteoSwiss — {ready ? stand.text : '…'}, höhenkorrigiert, ohne Tracker.
      {ready && stand.fallback && <b className="te-fallback"> {stand.fallback}.</b>}
    </p>
  );

  const actions = (
    <div className="rt-fc-actions">
      <button type="button" className="rt-act rt-act-primary"><IconCalendar size={16} /> Als Event</button>
      <button type="button" className="rt-act"><IconRoute size={16} /> Tagesablauf</button>
      <button type="button" className="rt-act"><IconBookmark size={16} /> Speichern</button>
    </div>
  );
  const tourWeather = ready ? (
    <>
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
    </>
  ) : <WaitBlock busy={busy} label="Wetter · gesamte Tour" />;
  const strip = ready ? (
    <section className="rd-panel rd-wx">
      <span className="rd-label">Wetter entlang · Verlässlichkeit</span>
      <TourWeatherStrip samples={wx!} onPick={pickDist} selectedDistM={cur?.dist ?? null} />
    </section>
  ) : <WaitBlock busy={busy} label="Wetter entlang · Verlässlichkeit" />;
  const profileChart = ready ? (
    <div className="rd-panel">
      <Suspense fallback={<div className="wp-wait" role="status">Kurven werden geladen …</div>}>
        <WeatherProfile samples={wx!} markerM={cur?.dist ?? null} onPickDist={pickDist} />
      </Suspense>
    </div>
  ) : <WaitBlock busy={busy} label="Kurven entlang der Strecke" />;
  const timeOverview = <TimeOverview timing={timing} startMs={startMs} category={p.type.category} />;
  const timeline = (
    <div className="rt-card rt-timeline">
      <span className="rd-label">Zeitplan</span>
      <Timeline milestones={timing.milestones} />
    </div>
  );
  const quality = meta ? (
    <div className="rt-quality-sec">
      <span className="rd-label" style={{ display: 'block', marginBottom: '0.6rem' }}>Daten-Herkunft &amp; Qualität</span>
      <QualityRow meta={meta} result={p.timingResult} windState={p.windState} />
    </div>
  ) : null;

  const planControls = (section: PlanSection | 'all') => (
    <PlanControls
      section={section}
      type={p.type}
      profile={p.profile}
      breakCfg={p.breakCfg}
      ebikeCfg={p.ebikeCfg}
      ebikeResult={p.ebikeResult}
      track={track}
      loop={p.loop}
      direction={p.direction}
      startMs={startMs}
      onStart={p.onStart}
      onType={p.onType}
      onProfile={p.onProfile}
      onBreaks={p.onBreaks}
      onEbike={p.onEbike}
      onDirection={p.onDirection}
    />
  );

  /* ===== mobile: one view per tab, slider docked above the bottom bar ===== */
  if (isMobile) {
    return (
      <div className={`te-root te-m te-m--${tab}`}>
        <div className="te-m-top">
          {verdictPill}
          {horizonNote}
          {statusLine}
        </div>
        {tab === 'map' && <div className="te-m-view te-m-view--map">{stage}</div>}
        {tab === 'pos' && <div className="te-m-view">{panel}{tourWeather}{sources}</div>}
        {tab === 'wind' && <div className="te-m-view">{windCard}</div>}
        {tab === 'chg' && <div className="te-m-view">{changeCard}{strip}{profileChart}</div>}
        {tab === 'start' && <div className="te-m-view">{startCard}{timeOverview}{timeline}{quality}{actions}{sources}</div>}
        {p.dockEl && createPortal(<div className="te-m-slider">{slider}</div>, p.dockEl)}
        {p.planOpen && (
          <PlanSheet onClose={() => p.onPlanOpen(false)}>
            {planControls('all')}
            <button type="button" className="te-link" onClick={() => { p.onPlanOpen(false); p.onReplan(); }}>Zur ausführlichen Planung</button>
          </PlanSheet>
        )}
      </div>
    );
  }

  /* ===== desktop ===== */
  return (
    <div className="te-root">
      <header className="te-head">
        <div className="te-head-l">
          <span className="rd-eyebrow">Ergebnis · {p.type.label}</span>
          <h1 className="te-title">{p.tourName}</h1>
          <p className="te-sum">
            <span>Ankunft <b>{clock(timing.arrivalMs)}</b></span>
            <span><b>{formatHM(timing.totalSec)}</b></span>
            <span><b>{kmStr(track.meta.totalDistanceM)} km</b></span>
            {ascent != null && <span><b>{ascent} hm</b> ↑</span>}
          </p>
          {verdictPill}
          {horizonNote}
        </div>
        <div className="te-head-r">
          <PlanPills
            type={p.type}
            profile={p.profile}
            startMs={startMs}
            loop={p.loop}
            direction={p.direction}
            onDirection={p.onDirection}
            render={planControls}
          />
          <div className="te-busy-row">{busy && <span className="te-busy" role="status">wird neu berechnet …</span>}</div>
        </div>
      </header>
      {errorMsg && statusLine}

      <div className="te-main">
        {stage}
        <aside className="te-panel-col">{panel}</aside>
      </div>

      <div className="te-ana">
        {windCard}
        {changeCard}
        {startCard}
      </div>

      <section className="te-details" aria-label="Details">
        <h2 className="te-details-h">Details</h2>
        <div className="te-details-grid">
          <div className="te-details-col">{tourWeather}{actions}</div>
          <div className="te-details-col te-details-col--wide">{strip}</div>
        </div>
        <div className="rd-analysis-grid rd-analysis-grid--lr">
          {profileChart}
          {timeOverview}
        </div>
        <div className="rd-analysis-grid rd-analysis-grid--rl">
          {timeline}
          {quality}
        </div>
      </section>
      {sources}
      <div className="rd-footer"><span className="dot">●</span> Wetter, das seine Arbeit zeigt.</div>
    </div>
  );
}

/* ============================ slider readout ============================ */

const SliderReadout = memo(function SliderReadout({ s, w, rel, compact }: { s: SampleETA | undefined; w: SampleETA | null; rel: WindRelation | null; compact: boolean }) {
  if (!s) return null;
  const ww = w?.weather;
  if (compact) {
    return (
      <span className="te-s-mini">
        <b>{ww?.temperatureC != null ? `${fmt1(ww.temperatureC)}°` : '—'}</b>
        <span>
          <span>km {kmStr(s.dist)} · {clock(s.etaMs)}</span>
          <br />
          {rel ? <b style={{ color: WIND_REL_COLOR[rel.rel] }}>{WIND_REL_WORD[rel.rel]}</b> : <span className="te-mute">{ww ? 'Wind ohne Richtung' : '…'}</span>}
          {ww?.precipitationMmH != null ? (ww.precipitationMmH >= TOUR_WET_MMH ? <span className="te-rain"> · {fmt1(ww.precipitationMmH)} mm/h</span> : ' · trocken') : ''}
        </span>
      </span>
    );
  }
  return (
    <span className="te-s-where"><b>km {kmStr(s.dist)}</b> {clock(s.etaMs)} Uhr{Number.isFinite(s.ele) ? ` · ${Math.round(s.ele)} m` : ''}</span>
  );
});

/* ============================ position panel ============================ */

function ConfDot({ v }: { v: number | null | undefined }) {
  const w = confidenceWord(v);
  if (!w) return null;
  return <span className={`te-cdot te-cdot--${w}`} title={`Verlässlichkeit ${w}`} aria-label={`Verlässlichkeit ${w}`} />;
}

function WindDial({ travel, from, rel }: { travel: number; from: number | null; rel: WindRelation | null }) {
  return (
    <svg width="58" height="58" viewBox="-29 -29 58 58" aria-hidden="true" className="te-dial">
      <circle r="27" fill="#fff" />
      {['N', 'O', 'S', 'W'].map((t, k) => (
        <text key={t} x={Math.sin((k * Math.PI) / 2) * 20} y={-Math.cos((k * Math.PI) / 2) * 20 + 3} fontSize="7.5" textAnchor="middle" fill="var(--stone-400, #A89A7A)">{t}</text>
      ))}
      <g transform={`rotate(${travel})`}><path d="M0 -14 L4 -5 L1.4 -5 L1.4 10 L-1.4 10 L-1.4 -5 L-4 -5Z" fill="var(--ink-900, #2C2A26)" opacity=".35" /></g>
      {from != null && <g transform={`rotate(${(from + 180) % 360})`}><path d="M0 -22 L6 -11 L2 -11 L2 4 L-2 4 L-2 -11 L-6 -11Z" fill={rel ? WIND_REL_COLOR[rel.rel] : 'var(--stone-500)'} /></g>}
    </svg>
  );
}

const PositionPanel = memo(function PositionPanel({ s, w, rel, meta, startMs, nextEvent, onJump, busy, error }: {
  s: SampleETA | undefined; w: SampleETA | null; rel: WindRelation | null; meta: EnrichmentMeta | null; startMs: number;
  nextEvent: WeatherChange | null; onJump: (i: number) => void; busy: boolean; error: string | null;
}) {
  if (!s) return null;
  const ww = w?.weather ?? null;
  const head = (
    <div className="te-p-head">
      <div>
        <div className="te-lbl">An deiner Position</div>
        <div className="te-p-t">km {kmStr(s.dist)} · {clock(s.etaMs)} Uhr</div>
      </div>
      <div className="te-p-meta">{Number.isFinite(s.ele) ? `${Math.round(s.ele)} m ü. M.` : 'Höhe unbekannt'}<br />+{formatHM(Math.max(0, s.arrivalOffsetMin) * 60)} ab Start</div>
    </div>
  );
  if (!ww) {
    return (
      <div className="te-panel">
        {head}
        <div className="te-skel" aria-hidden="true"><i /><i /><i /></div>
        <p className="te-mute">{error ? 'Ohne Wetterwerte — die Anreicherung ist fehlgeschlagen.' : busy ? 'Die Werte für diesen Plan werden gerechnet. Bis dahin zeigt die Ansicht keine alten Werte.' : 'An diesem Punkt liegt kein Wetterwert vor.'}</p>
        {s.batteryPctRemaining != null && <div className="te-list"><div><span>E-Bike-Akku hier</span><b>{fmt1(s.batteryPctRemaining)} %</b></div></div>}
      </div>
    );
  }
  const cond = pickWeatherCondition(ww.cloudCoverPct ?? 0, ww.precipitationMmH ?? 0, new Date(s.etaMs));
  const condWord = ww.cloudCoverPct != null || ww.precipitationMmH != null ? describeCondition(ww.cloudCoverPct ?? 0, ww.precipitationMmH ?? 0) : '—';
  const st = sampleStand(w!, meta);
  const flags = flagNotes(ww.validityFlags);
  const leadH = (s.etaMs - Date.now()) / 3_600_000;
  const snowRel = ww.snowLineM != null && Number.isFinite(s.ele)
    ? (ww.snowLineM >= s.ele ? `${Math.round(ww.snowLineM - s.ele)} m über dir` : `${Math.round(s.ele - ww.snowLineM)} m unter dir`) : null;
  const precipWord = ww.precipitationType === 'snow' ? 'Schnee' : ww.precipitationType === 'sleet' ? 'Schneeregen' : ww.precipitationType === 'rain' ? 'Regen' : 'trocken';
  const uvEst = ww.validityFlags.includes('uv_estimated');
  return (
    <div className="te-panel">
      {head}
      <div className="te-hero">
        <WeatherIcon condition={cond} size={44} />
        <div className="te-hero-t">{ww.temperatureC != null ? `${fmt1(ww.temperatureC)}°` : '—'}</div>
        <div>
          <div className="te-hero-c">{condWord} <ConfDot v={ww.confidence.temperature} /></div>
          {ww.apparentTempC != null && <div className="te-mute">gefühlt {fmt1(ww.apparentTempC)}°</div>}
        </div>
      </div>
      <div className={`te-wind te-wind--${rel?.rel ?? 'none'}`}>
        <WindDial travel={rel?.travelBearingDeg ?? 0} from={ww.windDirectionDeg} rel={rel} />
        <div>
          <div className="te-wind-rel" style={rel ? { color: WIND_REL_COLOR[rel.rel] } : undefined}>
            {rel ? WIND_REL_WORD[rel.rel] : 'Wind ohne Richtung'}
            {rel && rel.rel !== 'calm' && <span> {fmt1(Math.abs(rel.componentMps))} m/s</span>}
            {' '}<ConfDot v={ww.confidence.wind} />
          </div>
          <div className="te-wind-sub">
            {ww.windSpeedMps != null ? `${fmt1(ww.windSpeedMps)} m/s` : '—'}{ww.windDirectionDeg != null ? ` aus ${compass(ww.windDirectionDeg)}` : ''}
            {ww.gustMps != null ? ` · Böen ${Math.round(ww.gustMps * 3.6)} km/h` : ''}
          </div>
          {rel && <div className="te-wind-sub">du bist Richtung {compass(rel.travelBearingDeg)} unterwegs</div>}
        </div>
      </div>
      <div className="te-tiles">
        <Tile k="Niederschlag" c={ww.confidence.precipitation}
          v={ww.precipitationMmH != null ? `${fmt1(ww.precipitationMmH)} mm/h` : '—'}
          sub={<>{precipWord}{ww.precipitationSource && <span className={`te-badge${ww.precipitationSource === 'radar' ? ' is-radar' : ''}`}>{ww.precipitationSource === 'radar' ? 'RADAR' : 'MODELL'}</span>}</>} />
        <Tile k="Böen" c={ww.confidence.gust} v={ww.gustMps != null ? `${Math.round(ww.gustMps * 3.6)} km/h` : '—'} sub={ww.gustMps != null ? `${fmt1(ww.gustMps)} m/s` : ''} />
        <Tile k="Bewölkung" c={ww.confidence.clouds} v={ww.cloudCoverPct != null ? `${Math.round(ww.cloudCoverPct)} %` : '—'} sub="" />
        <Tile k="Luftfeuchte" c={ww.confidence.humidity} v={ww.relativeHumidityPct != null ? `${Math.round(ww.relativeHumidityPct)} %` : '—'} sub="" />
      </div>
      <div className="te-list">
        <div><span>Schneefallgrenze</span><b>{ww.snowLineM != null ? `${Math.round(ww.snowLineM)} m${snowRel ? ` · ${snowRel}` : ''}` : (meta?.coverage.snowLine ? '—' : 'nur AT/CH')}</b></div>
        <div><span>UV-Index</span><b>{ww.uvIndex != null ? `${fmt1(ww.uvIndex)}${uvEst ? ' (geschätzt)' : ''}` : '—'}</b></div>
        {ww.warnings.length > 0 ? ww.warnings.map((wn) => (
          <div key={wn.alertId} className="te-warn"><span>Amtliche Warnung</span><b>„{wn.event || wn.headline}" · DWD · Stufe {wn.level} · bis {clock(wn.expiresMs)}</b></div>
        )) : <div><span>Warnungen</span><b>keine für diesen Ort und diese Zeit</b></div>}
        {ww.foehn?.isFoehn && <div><span>Föhn (Einschätzung)</span><b>Hinweise auf Föhn: {ww.foehn.reasons.join(', ')} — heuristisch, keine Messung</b></div>}
        <div><span>Tempo hier</span><b>{fmt1(s.segmentSpeedKmh)} km/h</b></div>
        {s.batteryPctRemaining != null && <div><span>E-Bike-Akku hier</span><b>{fmt1(s.batteryPctRemaining)} %</b></div>}
      </div>
      {st.fallback && <p className="te-fallback-note"><IconWarning size={13} /> {st.fallback}</p>}
      {nextEvent && (
        <button type="button" className="te-next" onClick={() => onJump(nextEvent.index)}>
          <span className="te-lbl">Als Nächstes</span>
          <span><b>{nextEvent.text}</b> · km {kmStr(nextEvent.dist)}, {clock(nextEvent.etaMs)} Uhr</span>
        </button>
      )}
      <details className="te-ref">
        <summary>Gilt für diesen Ort zu dieser Uhrzeit</summary>
        <dl>
          <div><dt>Ort</dt><dd>{s.lat.toFixed(4).replace('.', ',')}° N, {s.lon.toFixed(4).replace('.', ',')}° O</dd></div>
          <div><dt>Höhe</dt><dd>{Number.isFinite(s.ele) ? `${Math.round(s.ele)} m — Temperatur und Wind sind auf diese Höhe umgerechnet` : 'unbekannt'}</dd></div>
          <div><dt>Ankunft</dt><dd>{formatStart(s.etaMs)} = Start {clock(startMs)} + Bewegungszeit mit Wind + Pausen</dd></div>
          <div><dt>Zeitpunkt</dt><dd>{ww.isInterpolated ? 'zwischen zwei Stundenwerten interpoliert' : 'auf einem Stundenwert'} · Vorlauf {leadH >= 0 ? `${Math.round(leadH)} h` : 'bereits vorbei'}</dd></div>
          <div><dt>Rechenpunkt</dt><dd>nächster Punkt der Strecke (km {kmStr(s.dist)}), zwischen den Punkten wird nicht interpoliert</dd></div>
          <div><dt>Stand</dt><dd>{st.text}</dd></div>
          <div><dt>Quellen</dt><dd>{ww.sourcesUsed.length ? ww.sourcesUsed.join(', ') : '—'}</dd></div>
          <div><dt>Abschnitt</dt><dd>Cluster {ww.cellId + 1} (≈ 10 km, Höhenband 300 m)</dd></div>
        </dl>
        {flags.length > 0 && <ul className="te-flags">{flags.map((f) => <li key={f}>{f}</li>)}</ul>}
      </details>
    </div>
  );
});

function Tile({ k, v, sub, c }: { k: string; v: string; sub: ReactNode; c: number | null | undefined }) {
  return (
    <div className="te-tile">
      <div className="te-tile-k">{k}<ConfDot v={c} /></div>
      <div className="te-tile-v">{v}</div>
      {sub !== '' && <div className="te-tile-s">{sub}</div>}
    </div>
  );
}

function WaitBlock({ busy, label }: { busy: boolean; label: string }) {
  return (
    <div className="te-wait rd-panel">
      <span className="rd-label">{label}</span>
      <div className="te-skel" aria-hidden="true"><i /><i /></div>
      <p className="te-mute">{busy ? 'Wird für diesen Plan gerechnet …' : 'Keine Wetterwerte.'}</p>
    </div>
  );
}

/* ============================ analysis cards ============================ */

const CH_W = 320, CH_H = 96;

const WindCard = memo(function WindCard({ wx, points, shares, curDist, onPick, busy }: {
  wx: SampleETA[] | null; points: TourWeatherPoints; shares: ReturnType<typeof windShares> | null; curDist: number; onPick: (d: number) => void; busy: boolean;
}) {
  const chart = useMemo(() => {
    if (!wx || wx.length < 2) return null;
    const d0 = wx[0].dist, d1 = wx[wx.length - 1].dist, span = Math.max(1, d1 - d0);
    const comps = wx.map((s) => windRelationAt(s, points)?.componentMps ?? null);
    const maxAbs = Math.max(1, ...comps.map((c) => (c == null ? 0 : Math.abs(c))));
    const x = (d: number) => ((d - d0) / span) * CH_W;
    const y = (c: number) => CH_H / 2 - (c / maxAbs) * (CH_H / 2 - 6);
    // a sample without a relation (no wind / no direction) lifts the pen — never drawn as 0
    let line = '';
    let down = false;
    wx.forEach((s, k) => {
      const c = comps[k];
      if (c == null) { down = false; return; }
      line += `${down ? 'L' : 'M'}${x(s.dist).toFixed(1)} ${y(c).toFixed(1)} `;
      down = true;
    });
    return { line, x, d0, span, maxAbs };
  }, [wx, points]);
  const head = shares ? Math.round(shares.share.head * 100) : null;
  return (
    <section className="te-card">
      <span className="te-lbl">Wind zur Fahrtrichtung</span>
      {!shares ? (
        <><h2 className="te-card-h">—</h2><div className="te-skel" aria-hidden="true"><i /><i /></div><p className="te-mute">{busy ? 'Wird für diesen Plan gerechnet …' : 'Keine Wetterwerte.'}</p></>
      ) : (
        <>
          <h2 className="te-card-h">{head} % Gegenwind</h2>
          <p className="te-lead">
            {shares.strongestHead
              ? <>Am stärksten bei km {kmStr(shares.strongestHead.dist)} ({clock(shares.strongestHead.etaMs)} Uhr): {fmt1(-shares.strongestHead.componentMps)} m/s gegen dich.</>
              : 'Auf keinem Abschnitt Gegenwind über der Schwelle.'}
            {' '}Anteile nach Strecke, nicht nach Punkten.
          </p>
          <div className="te-share" aria-hidden="true">
            {(['head', 'cross', 'tail', 'calm'] as const).map((k) => shares.share[k] > 0 && <div key={k} style={{ flex: shares.share[k], background: WIND_REL_COLOR[k] }} />)}
            {shares.share.unknown > 0 && <div style={{ flex: shares.share.unknown, background: 'var(--sand-200)' }} />}
          </div>
          <div className="te-keys">
            {(['head', 'cross', 'tail', 'calm'] as const).map((k) => (
              <span key={k}><i style={{ background: WIND_REL_COLOR[k] }} />{WIND_REL_WORD[k]} {Math.round(shares.share[k] * 100)} %</span>
            ))}
            {shares.share.unknown > 0 && <span><i style={{ background: 'var(--sand-200)' }} />ohne Richtung {Math.round(shares.share.unknown * 100)} %</span>}
          </div>
          {chart && (
            <svg
              className="te-chart"
              viewBox={`0 0 ${CH_W} ${CH_H}`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Windkomponente entlang der Strecke: oben Rückenwind, unten Gegenwind"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onPick(chart.d0 + ((e.clientX - r.left) / r.width) * chart.span); }}
            >
              <rect x="0" y="0" width={CH_W} height={CH_H / 2} fill="var(--sage-50, #F0F4EA)" />
              <rect x="0" y={CH_H / 2} width={CH_W} height={CH_H / 2} fill="var(--rd-warn-tint, #FBF3E7)" />
              <line x1="0" x2={CH_W} y1={CH_H / 2} y2={CH_H / 2} stroke="var(--stone-300)" vectorEffect="non-scaling-stroke" />
              <path d={chart.line} fill="none" stroke="var(--ink-900)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
              <line x1={chart.x(curDist)} x2={chart.x(curDist)} y1="0" y2={CH_H} stroke="var(--terracotta-500)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <text x="4" y="11" fontSize="9" fill="var(--rd-sage-strong)">Rücken</text>
              <text x="4" y={CH_H - 4} fontSize="9" fill="var(--rd-red)">Gegen</text>
            </svg>
          )}
        </>
      )}
    </section>
  );
});
type TourWeatherPoints = TourTrack['points'];

const KIND_ICON: Record<WeatherChange['kind'], string> = {
  'rain-start': '☂', 'rain-stop': '☀', cooling: '↓', warming: '↑', gust: '≋', headwind: '⟵',
};

const ChangeCard = memo(function ChangeCard({ events, delta, ready, busy, onJump }: {
  events: WeatherChange[]; delta: ReturnType<typeof startFinishDelta> | null; ready: boolean; busy: boolean; onJump: (i: number) => void;
}) {
  return (
    <section className="te-card">
      <span className="te-lbl">Veränderung unterwegs</span>
      {!ready || !delta ? (
        <><h2 className="te-card-h">—</h2><div className="te-skel" aria-hidden="true"><i /><i /></div><p className="te-mute">{busy ? 'Wird für diesen Plan gerechnet …' : 'Keine Wetterwerte.'}</p></>
      ) : (
        <>
          <h2 className="te-card-h">Wetter ändert sich {delta.level === 'kaum' ? 'kaum' : delta.level}</h2>
          <p className="te-lead">{events.length ? `${events.length} Wechsel entlang der Strecke.` : 'Kein Wechsel über den Schwellen.'} Start → Ziel:</p>
          <div className="te-deltas">
            <div className="te-delta"><span>Temperatur</span><b>{delta.tempK != null ? `${signed(delta.tempK)} K` : '—'}</b></div>
            <div className="te-delta"><span>Wind</span><b>{delta.windMps != null ? `${signed(delta.windMps)} m/s` : '—'}</b></div>
            <div className="te-delta"><span>Nass-Anteil</span><b>{delta.wetShare != null ? `${signed(delta.wetShare * 100, 0)} %-Pkt.` : '—'}</b></div>
            <div className="te-delta"><span>Bewölkung</span><b>{delta.cloudPct != null ? `${signed(delta.cloudPct, 0)} %` : '—'}</b></div>
          </div>
          {events.length > 0 && (
            <div className="te-tl">
              {events.map((e, k) => (
                <button key={k} type="button" onClick={() => onJump(e.index)}>
                  <span className="te-tl-t">{clock(e.etaMs)}</span>
                  <span className="te-tl-ic" aria-hidden="true">{KIND_ICON[e.kind]}</span>
                  <span>{e.text} · km {kmStr(e.dist)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
});

const offLabel = (o: number) => (o === 0 ? 'jetzt' : `${o > 0 ? '+' : '−'}${Math.abs(o) >= 60 && Math.abs(o) % 60 === 0 ? `${Math.abs(o) / 60} h` : `${Math.abs(o)}′`}`);

const StartCard = memo(function StartCard({ sum, startMs, ready, busy, onStart }: {
  sum: StartWindowSummary | null; startMs: number; ready: boolean; busy: boolean; onStart: (ms: number) => void;
}) {
  if (!ready || !sum) {
    return (
      <section className="te-card">
        <span className="te-lbl">Startzeit</span>
        <h2 className="te-card-h">—</h2>
        <div className="te-skel" aria-hidden="true"><i /><i /></div>
        <p className="te-mute">{busy ? 'Wird für diesen Plan gerechnet …' : 'Keine Wetterwerte.'}</p>
      </section>
    );
  }
  const maxWet = Math.max(1, ...sum.rows.map((r) => r.entry?.wetMin ?? 0));
  const { current, best } = sum;
  return (
    <section className="te-card">
      <span className="te-lbl">Startzeit</span>
      <h2 className="te-card-h">
        {!sum.rows.some((r) => r.entry) ? 'Kein Startfenster' : sum.betterExists && best ? `Besser ${offLabel(best.offsetMin)} starten` : 'Die gewählte Zeit passt'}
      </h2>
      <p className="te-lead">
        {current ? `Jetzt geplant: ${current.wetMin} min nass${current.complete ? '' : ' (nicht ganz abgedeckt)'}.` : 'Für die gewählte Zeit liegt kein vergleichbarer Wert vor.'}
      </p>
      {sum.betterExists && best && (
        <div className="te-best">
          <div>
            <div className="te-best-v">{clock(startMs + best.offsetMin * 60_000)} Uhr</div>
            <div className="te-mute">{best.wetMin} min nass statt {current?.wetMin ?? '—'}</div>
          </div>
          <button type="button" className="te-btn" onClick={() => onStart(startMs + best.offsetMin * 60_000)}>Übernehmen</button>
        </div>
      )}
      <div className="te-bars" role="img" aria-label="Nasse Minuten je Startzeit, ±2 h im 15-Minuten-Raster">
        {sum.rows.map((r) => {
          const h = r.entry ? Math.max(2, (r.entry.wetMin / maxWet) * 100) : 0;
          const cls = `te-bar${r.past ? ' is-past' : ''}${r.entry && !r.entry.complete ? ' is-partial' : ''}${r.offsetMin === 0 ? ' is-now' : ''}${best && r.offsetMin === best.offsetMin ? ' is-best' : ''}`;
          return (
            <span key={r.offsetMin} className={cls} title={r.past ? `${offLabel(r.offsetMin)}: liegt in der Vergangenheit` : r.entry ? `${offLabel(r.offsetMin)}: ${r.entry.wetMin} min nass${r.entry.complete ? '' : ' (Abdeckung zu gering, nicht empfohlen)'}` : `${offLabel(r.offsetMin)}: kein Wert`}>
              <i style={{ height: `${h}%` }} />
            </span>
          );
        })}
      </div>
      <div className="te-bars-axis"><span>−2 h</span><span>jetzt</span><span>+2 h</span></div>
      <p className="te-mute te-small">Näherung: alle Ankunftszeiten wandern um denselben Betrag, die Fahrzeiten bleiben fest. „Übernehmen" rechnet danach echt neu.</p>
    </section>
  );
});

/* ============================ plan pills, popovers, sheet ============================ */

function PlanPills({ type, profile, startMs, loop, direction, onDirection, render }: {
  type: MovementType; profile: SpeedProfile; startMs: number; loop: boolean; direction: Direction;
  onDirection: (d: Direction) => void; render: (s: PlanSection) => ReactNode;
}) {
  const [open, setOpen] = useState<PlanSection | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const pill = (k: PlanSection, label: ReactNode, aria: string) => (
    <button type="button" className={`te-pill${open === k ? ' is-on' : ''}`} aria-expanded={open === k} aria-haspopup="dialog" aria-label={aria} onClick={() => setOpen(open === k ? null : k)}>
      {label}<span className="te-chev" aria-hidden="true">▾</span>
    </button>
  );
  return (
    <div className="te-pills" ref={wrap}>
      {pill('start', <><small>Start</small>{shortStart(startMs)}</>, 'Startzeit ändern')}
      {pill('type', <><span className="te-pill-ic">{type.icon}</span>{type.label}</>, 'Bewegungsart ändern')}
      {pill('tempo', <>{fmt1(profile.flatSpeedKmh)} km/h</>, 'Tempo ändern')}
      {loop
        ? <span className="te-pill is-static" title="Rundtour — die Richtung ändert nichts"><IconLoop size={14} /> Rundtour</span>
        : <button type="button" className="te-pill" onClick={() => onDirection(direction === 'forward' ? 'reverse' : 'forward')} title="Richtung umkehren">⇄ {direction === 'forward' ? 'Hinweg' : 'Rückwärts'}</button>}
      {pill('more', <span aria-hidden="true">⚙</span>, 'Pausen und weitere Einstellungen')}
      {open && <div className="te-pop" role="dialog" aria-label="Plan ändern">{render(open)}</div>}
    </div>
  );
}

function PlanControls(p: {
  section: PlanSection | 'all'; type: MovementType; profile: SpeedProfile; breakCfg: BreakConfig; ebikeCfg: EbikeConfig;
  ebikeResult: EbikeResult | null; track: TourTrack; loop: boolean; direction: Direction; startMs: number;
  onStart: (ms: number) => void; onType: (id: MovementId) => void; onProfile: (pr: SpeedProfile) => void;
  onBreaks: (c: BreakConfig) => void; onEbike: (c: EbikeConfig) => void; onDirection: (d: Direction) => void;
}) {
  const [typeOpen, setTypeOpen] = useState(p.section === 'type');
  const all = p.section === 'all';
  const show = (s: PlanSection) => all || p.section === s;
  const types = (
    <div className="te-types" role="radiogroup" aria-label="Bewegungsart">
      {MOVEMENT_TYPES.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={p.type.id === m.id} className={`te-chip${p.type.id === m.id ? ' is-on' : ''}`} onClick={() => { p.onType(m.id); setTypeOpen(false); }}>
          <span className="te-pill-ic">{m.icon}</span>{m.label}
        </button>
      ))}
    </div>
  );
  return (
    <div className="te-plan">
      {show('start') && <div className="te-plan-sec tp"><StartTimeConfig value={p.startMs} onChange={p.onStart} /></div>}
      {show('type') && <div className="te-plan-sec"><span className="te-lbl">Bewegungsart</span>{types}<p className="te-mute te-small">Eine andere Art setzt Tempo und Pausen auf ihre Vorgaben.</p></div>}
      {show('tempo') && (
        <div className="te-plan-sec tp">
          {typeOpen && !all ? types : (
            <SpeedProfileConfig type={p.type} profile={p.profile} track={p.track} onChange={p.onProfile} onChangeType={() => setTypeOpen(true)} showHead={false} />
          )}
        </div>
      )}
      {all && (
        <div className="te-plan-sec tp">
          <span className="te-lbl">Richtung</span>
          {p.loop ? <p className="te-mute"><IconLoop size={14} /> Rundtour erkannt — Richtung egal</p> : (
            <div className="tp-seg" role="group">
              <button type="button" className={`tp-seg-btn${p.direction === 'forward' ? ' is-active' : ''}`} onClick={() => p.onDirection('forward')}>Hinweg</button>
              <button type="button" className={`tp-seg-btn${p.direction === 'reverse' ? ' is-active' : ''}`} onClick={() => p.onDirection('reverse')}>Rückwärts</button>
            </div>
          )}
        </div>
      )}
      {show('more') && (
        <div className="te-plan-sec tp">
          <BreaksConfig track={p.track} cfg={p.breakCfg} onChange={p.onBreaks} />
          {p.type.id === 'ebike' && p.ebikeResult && <div className="rd-ebike-panel"><EbikeBatteryPanel cfg={p.ebikeCfg} onChange={p.onEbike} result={p.ebikeResult} /></div>}
        </div>
      )}
    </div>
  );
}

function PlanSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  // Rendered inside the route shell (not portalled): the deck styles of the planning components are scoped to it.
  return (
    <div className="te-sheet">
      <div className="te-scrim" onClick={onClose} />
      <div className="te-sheet-p" role="dialog" aria-modal="true" aria-label="Plan ändern" tabIndex={-1} ref={ref}>
        <div className="te-grab" aria-hidden="true" />
        {children}
        <button type="button" className="te-btn te-btn--full" onClick={onClose}>Fertig</button>
      </div>
    </div>
  );
}
