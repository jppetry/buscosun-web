/**
 * Regenradar — „Command-Deck" (hell). Vollflächige App-Shell im Stil der
 * Wetterkarte, die den REALEN Nowcast in das Referenz-Layout einordnet
 * (references/{desktop,tablet,mobile}.png). Keine Funktion neu erfunden — alle
 * Bausteine (Radar, Timeline, Bar-Chart, Detail-Karten, Hero/Kennzahlen aus
 * heroState/summary) werden nur neu angeordnet und gestylt.
 *
 * Regionen (Desktop): Top-Statusleiste · Ink-Icon-Rail · linkes Dock
 * (Layer/Ansicht/Modus/Datenlage) · dunkles Radarfeld (Center) · rechter Readout.
 * Mobile: Radar oben + ziehbares Bottom-Sheet.
 */
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Location } from '../types';
import { flagForCountry } from '../geocode';
import { phaseLabelStep, intensityBand, intensityColor, NOWCAST_STEP_MIN, NOWCAST_HORIZON_MIN, type EventTone } from './nowcastModel';
import type { RadarLayerId } from '../radar/radarModel';
import { loadLastView } from '../radar/radarState';
import { heroState, leadLabel, fmtDuration, fmtClock, fmtMmH, sourceLabel, freshness, type Nowcast } from './nowcastView';
import NowcastLocationField from './NowcastLocationField';
import NowcastRadarMap from './NowcastRadarMap';
import NowcastBarChart from './NowcastBarChart';
import NowcastRainSlider from './NowcastRainSlider';
import { AlpineCard } from './NowcastDetail';
import { useIsMobile } from '../mobile/useIsMobile';
import './nowcastDeck.css';
import './nowcastMobile.css';

type DeckState =
  | { kind: 'loading' }
  | { kind: 'ready'; nowcast: Nowcast }
  | { kind: 'error'; message: string };

interface Props {
  location: Location;
  state: DeckState;
  onChangeLocation: (l: Location | null) => void;
  reloadNonce: number;
  onReload: () => void;
  onBack: () => void;
}

/** Dock-Layer, die das ECHTE Radar steuern (Teilmenge der Radar-Layer). */
const DECK_LAYERS: Array<{ id: RadarLayerId; label: string; sub: string; color: string; icon: ReactNode }> = [
  { id: 'precip', label: 'Niederschlag', sub: 'Radar-Nowcast + Modell', color: '#3A6FA8', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M7 13 A3.6 3.6 0 0 1 8 5.6 A5.4 5.4 0 0 1 18.2 8 A3.4 3.4 0 0 1 17.6 14 H8 A3.6 3.6 0 0 1 7 13 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M9 17 L8 20 M13 17 L12 20 M16.5 17 L15.5 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
  ) },
  { id: 'cells', label: 'Zellen-Zugbahn', sub: 'Woher & wohin ziehen die Zellen', color: '#C97B47', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 12 A3 3 0 0 1 7 6 A4.4 4.4 0 0 1 15 8 A2.8 2.8 0 0 1 14.4 13 H8 A3 3 0 0 1 6 12 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M10.5 17 H19 M16 14 L20 17 L16 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ) },
  { id: 'lightning', label: 'Blitze', sub: 'Live-Blitzortung', color: '#C79A3A', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M13 2.5 L5.5 13 H11 L10 21.5 L18.5 10.5 H12 Z" fill="currentColor" fillOpacity=".14" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
  ) },
  { id: 'snowline', label: 'Schneegrenze', sub: 'Schneefallgrenze', color: '#6B7A8F', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 18.5 L9 8 L12 12.5 L15 7.5 L21 18.5 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M8.4 9 L15.2 9" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 2"/></svg>
  ) },
];

function shortPlace(name: string): string { return name.split(',')[0]; }
const comma = (n: number) => n.toString().replace('.', ',');

/** Mobile-Bereiche der Bottom-Tab-Bar — jeder als Sheet-Panel im Schnellblick-Stil. */
type MobileTab = 'glance' | 'timeline' | 'chart' | 'layer' | 'detail';

export default function NowcastDeck({ location, state, onChangeLocation, reloadNonce, onReload, onBack }: Props) {
  const isMobile = useIsMobile();
  const [layers, setLayers] = useState<RadarLayerId[]>(() => {
    const saved = loadLastView()?.layers as RadarLayerId[] | undefined;
    return saved && saved.length ? saved : ['precip', 'cells', 'lightning'];
  });
  const [view, setView] = useState<'map' | 'chart'>('map');
  const [mode, setMode] = useState<'standard' | 'detail'>('detail');
  const [mTab, setMTab] = useState<MobileTab>('glance');
  const [mSnap, setMSnap] = useState<'peek' | 'full'>('peek');
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Tabwechsel: Schnellblick als Peek, alle inhaltsreichen Bereiche als Voll.
  const selectMTab = (t: MobileTab) => { setMTab(t); setMSnap(t === 'glance' ? 'peek' : 'full'); };

  const nowcast = state.kind === 'ready' ? state.nowcast : null;
  const activeLayerCount = layers.length;

  const toggleLayer = (id: RadarLayerId) =>
    setLayers((ls) => (ls.includes(id) ? ls.filter((l) => l !== id) : [...ls, id]));

  // --- gemeinsame Bausteine (Readout / Sheet) --------------------------------
  const center = (
    <div className="rr-center">
      {view === 'map' ? (
        <div className="rr-stage">
          <NowcastRadarMap location={location} nowcast={nowcast} reloadKey={reloadNonce}
            layers={layers} onLayersChange={setLayers} hideLayerbar compact />
        </div>
      ) : (
        <div className="rr-chart">
          {nowcast
            ? <div className="rt-card nc-tl-card"><NowcastBarChart nowcast={nowcast} /></div>
            : <div className="rr-center-state">Diagramm folgt, sobald der Nowcast geladen ist …</div>}
        </div>
      )}

      <div className="rr-source-pill rr-glass">
        <span className="rr-src-dot" />
        <span className="rr-src-name">Niederschlagsraster · Radar</span>
        <span className="rr-src-meta">{nowcast ? sourceLabel(nowcast) : 'RADOLAN-RV · 1 km'}</span>
      </div>

      {!isMobile && (
        <div className="rr-topright-map">
          <div className="rr-viewtoggle rr-glass" role="tablist" aria-label="Karte oder Diagramm">
            <button type="button" role="tab" aria-selected={view === 'map'} className={view === 'map' ? 'is-active' : ''} onClick={() => setView('map')}>Karte</button>
            <button type="button" role="tab" aria-selected={view === 'chart'} className={view === 'chart' ? 'is-active' : ''} onClick={() => setView('chart')}>Diagramm</button>
          </div>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="rr-center-state">⚠ {state.message}</div>
      )}
    </div>
  );

  return (
    <div className={`rr-deck nc-page${isMobile ? ' is-mobile' : ''}`} data-mode={mode}
      style={{ ['--nc-blue']: '#3A6FA8' } as CSSProperties}>
      {/* ---------- Top-Statusleiste (Desktop/Tablet) ---------- */}
      {!isMobile && (
        <div className="rr-topbar">
          <button type="button" className="rr-brand" onClick={onBack} aria-label="Zur Startseite">
            <img className="rr-brand-mark" src="/buscosun-mark.svg" width={26} height={26} alt="" />
            <span className="rr-brand-name">buscosun</span>
          </button>
          <span className="rr-topdiv" />
          <div className="rr-topsearch">
            <NowcastLocationField value={location} onChange={onChangeLocation} />
          </div>
          <div className="rr-topright">
            <span className="rr-live">
              <span className="rr-live-dot"><span /><span /></span>
              <span className="rr-live-text">RADAR LIVE</span>
            </span>
            <span className="rr-avatar">JK</span>
          </div>
        </div>
      )}

      {/* ---------- Body ---------- */}
      {isMobile ? (
        /* Mobile: Karte + Bottom-Tab-Bar; jeder Bereich als Sheet-Panel. */
        <div className="rm-root">
          <div className="rm-map">
            <NowcastRadarMap location={location} nowcast={nowcast} reloadKey={reloadNonce}
              layers={layers} onLayersChange={setLayers} hideLayerbar compact
              onMapReady={(m) => { mapRef.current = m; }} />
          </div>
          <div className="rm-topfloat">
            <div className="rm-search"><NowcastLocationField value={location} onChange={onChangeLocation} showCountryCode /></div>
          </div>
          <div className="rm-zoom" role="group" aria-label="Zoom">
            <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="Hineinzoomen"><PlusIcon /></button>
            <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="Herauszoomen"><MinusIcon /></button>
          </div>
          {nowcast && (
            <div className="rm-sourcepill">
              <span className="rm-src-dot" />
              {nowcast.hasRadar ? 'RADOLAN-RV · 1 km' : 'ICON-D2 · 2,2 km'} · Lauf {fmtClock(nowcast.runAtMs || nowcast.fetchedAtMs)}
            </div>
          )}
          <MobileTabSheet tab={mTab} snap={mSnap} onSnapChange={setMSnap}
            nowcast={nowcast} state={state} mode={mode} setMode={setMode}
            layers={layers} toggleLayer={toggleLayer} location={location} />
          <MobileTabBar tab={mTab} onSelect={selectMTab} />
        </div>
      ) : (
        <div className="rr-body">
          <Rail onBack={onBack} />
          <Dock
            layers={layers} toggleLayer={toggleLayer} activeLayerCount={activeLayerCount}
            view={view} setView={setView} mode={mode} setMode={setMode}
            nowcast={nowcast} onReload={onReload}
          />
          {center}
          <div className="rr-readout">
            <div className="rr-readout-head">
              <span className="rr-readout-eyebrow">Regenradar · {flagForCountry(location.country)} {shortPlace(location.name)}</span>
              {nowcast && <FreshTag nowcast={nowcast} />}
            </div>
            <ReadoutBody nowcast={nowcast} state={state} mode={mode} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Rail
// ============================================================================
function Rail({ onBack }: { onBack: () => void }) {
  return (
    <div className="rr-rail">
      <button type="button" className="rr-rail-btn" title="Wetterkarte" onClick={onBack} aria-label="Zur Startseite">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M12 3 L21 8 L12 13 L3 8 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M3 13 L12 18 L21 13" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
      </button>
      <button type="button" className="rr-rail-btn is-active" title="Regenradar" aria-current="page">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/><path d="M12 3 A9 9 0 0 1 21 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M12 12 L19.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.2" strokeOpacity=".55"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>
      </button>
      <button type="button" className="rr-rail-btn rr-rail-spacer" title="Einstellungen" onClick={onBack} aria-label="Weitere Werkzeuge">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/><path d="M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.2 5.2 L7 7 M17 17 L18.8 18.8 M18.8 5.2 L17 7 M7 17 L5.2 18.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>
    </div>
  );
}

// ============================================================================
// Dock (Layer / Ansicht / Modus / Datenlage)
// ============================================================================
function Dock({ layers, toggleLayer, activeLayerCount, view, setView, mode, setMode, nowcast, onReload }: {
  layers: RadarLayerId[]; toggleLayer: (id: RadarLayerId) => void; activeLayerCount: number;
  view: 'map' | 'chart'; setView: (v: 'map' | 'chart') => void;
  mode: 'standard' | 'detail'; setMode: (m: 'standard' | 'detail') => void;
  nowcast: Nowcast | null; onReload: () => void;
}) {
  const fresh = nowcast ? freshness(nowcast) : null;
  return (
    <div className="rr-dock">
      <div className="rr-dock-head">
        <span className="rr-eyebrow">Radar-Layer</span>
        <span className="rr-dock-count">{activeLayerCount} aktiv</span>
      </div>
      <div className="rr-layers">
        {DECK_LAYERS.map((l) => {
          const on = layers.includes(l.id);
          return (
            <button key={l.id} type="button" className={`rr-layer${on ? ' is-on' : ' is-off'}`}
              style={{ ['--rr-layer-color']: l.color } as CSSProperties}
              onClick={() => toggleLayer(l.id)} aria-pressed={on}>
              <span className="rr-layer-ic">{l.icon}</span>
              <span className="rr-layer-label">{l.label}</span>
              <span className="rr-switch"><span className="rr-switch-knob" /></span>
            </button>
          );
        })}
      </div>

      <span className="rr-eyebrow">Ansicht</span>
      <div className="rr-seg">
        <button type="button" className={`rr-seg-btn${view === 'map' ? ' is-active' : ''}`} onClick={() => setView('map')}>Karte</button>
        <button type="button" className={`rr-seg-btn${view === 'chart' ? ' is-active' : ''}`} onClick={() => setView('chart')}>Diagramm</button>
      </div>

      <span className="rr-eyebrow">Modus</span>
      <div className="rr-seg rr-seg--modus">
        <button type="button" className={`rr-seg-btn${mode === 'standard' ? ' is-active' : ''}`} onClick={() => setMode('standard')}>Standard</button>
        <button type="button" className={`rr-seg-btn${mode === 'detail' ? ' is-active' : ''}`} onClick={() => setMode('detail')}>Detail</button>
      </div>

      <div className="rr-datalage">
        <div className="rr-datalage-eyebrow">Datenlage</div>
        <div className="rr-datalage-row">0–2 h · DWD RADOLAN-RV</div>
        <div className="rr-datalage-row">2–6 h · ICON-D2 (2,2 km)</div>
        <div className={`rr-datalage-fresh${fresh?.stale ? ' is-stale' : ''}`}>
          <span className="rr-fresh-dot" />
          {fresh ? fresh.label : 'wird geladen …'}
          <button type="button" className="rr-reload" onClick={onReload} aria-label="Daten neu laden">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M20 12 A8 8 0 1 1 17.5 6.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M17.5 3 V7 H13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            neu
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Readout-Inhalt (Hero · Kennzahlen · Timeline · Verlauf · Ereignisse · Alpin · Quellen)
// ============================================================================
function ReadoutBody({ nowcast, state, mode }: {
  nowcast: Nowcast | null; state: DeckState; mode: 'standard' | 'detail';
}) {
  if (state.kind === 'loading' || !nowcast) {
    return <div className="rr-center-state" style={{ position: 'static', color: 'var(--stone-500,#8B7355)', minHeight: 120 }}><span className="ev-spinner" /> Radar &amp; Modell werden ausgewertet …</div>;
  }
  if (state.kind === 'error') {
    return <div className="rr-center-state" style={{ position: 'static', color: '#B5341F', minHeight: 120 }}>⚠ {state.message}</div>;
  }
  return (
    <>
      <Hero nowcast={nowcast} />

      {/* Verlauf & Ereignisse (Referenz) — dort, wo vorher das Intensitäts-Diagramm war:
          Niederschlagssumme (Balken) + Ereignis-Liste aus der Engine. */}
      <div className="rr-section-label">Verlauf &amp; Ereignisse</div>
      <PrecipSumCard nowcast={nowcast} />
      <EventsTimeline nowcast={nowcast} />

      <div className="rr-section-label">Kennzahlen · 6 h</div>
      <Metrics nowcast={nowcast} mode={mode} />

      {mode === 'detail' && <div style={{ marginTop: 10 }}><AlpineCard nowcast={nowcast} /></div>}

      <Sources nowcast={nowcast} />
      <div className="rr-readout-foot">● DWD RADOLAN-RV (Radar-Nowcast) · ICON-D2 (2,2 km) · keine Tracker</div>
    </>
  );
}

function FreshTag({ nowcast }: { nowcast: Nowcast }) {
  const fresh = freshness(nowcast);
  return <span className={`rr-readout-fresh${fresh.stale ? ' is-stale' : ''}`}>● {fresh.stale ? `veraltet · ${fresh.label}` : fresh.label}</span>;
}

function Hero({ nowcast }: { nowcast: Nowcast }) {
  const h = heroState(nowcast);
  return (
    <div className="rr-hero">
      <span className="rr-hero-tag">Schnellblick</span>
      {h.kind === 'coming' && (
        <>
          <p className="rr-hero-line">
            {h.beyondSkill ? <>Später <span className="rr-accent">evtl. Regen</span>.</> : <>In <span className="rr-accent">{leadLabel(h.inMin)}</span> Regen.</>}
          </p>
          <p className="rr-hero-sub">
            {h.beyondSkill
              ? <>Erst in {leadLabel(h.inMin)} ({h.intensity}) — jenseits des Skill-Horizonts.</>
              : <>Beginnt ~{h.onsetClock}{h.endClock && <> · endet ~{h.endClock}</>} · {h.intensity} · {h.character}</>}
          </p>
        </>
      )}
      {h.kind === 'raining' && (
        <>
          <p className="rr-hero-line"><span className="rr-accent">Es regnet</span> gerade.</p>
          <p className="rr-hero-sub">
            {h.dry
              ? <>✓ Danach {fmtDuration(h.dry.durationMin)} trocken · {fmtClock(nowcast.nowMs + h.dry.fromMin * 60_000)}–{fmtClock(nowcast.nowMs + h.dry.toMin * 60_000)}{h.returnClock && <> · neuer Schauer ab ca. {h.returnClock}</>}</>
              : <>Der Regen hält über die nächste Zeit an — kein längeres Trockenfenster in Sicht.</>}
          </p>
        </>
      )}
      {h.kind === 'dry' && (
        <>
          <p className="rr-hero-line"><span className="rr-accent">Trocken.</span></p>
          <p className="rr-hero-sub">Kein Regen in den nächsten 6 Stunden erwartet.</p>
        </>
      )}
      <HeroBadges nowcast={nowcast} />
    </div>
  );
}

function HeroBadges({ nowcast }: { nowcast: Nowcast }) {
  const s = nowcast.summary;
  const badges: ReactNode[] = [];
  if (s.dominantPhase === 'freezing') badges.push(<span key="fz" className="rr-badge"><BoltIcon />Glättegefahr · gefrierender Regen</span>);
  if (s.thunderRiskPct >= 30) badges.push(<span key="th" className="rr-badge"><BoltIcon />Gewitterrisiko {s.thunderRiskPct} %{s.hailRiskPct >= 20 ? ' · Hagel' : ''}</span>);
  if (s.heavyRain) badges.push(<span key="hr" className="rr-badge"><DropIcon />Starkregen möglich · Spitze {comma(s.peakMmH)} mm/h</span>);
  if (!badges.length) return null;
  return <div className="rr-hero-badges">{badges}</div>;
}

function Metrics({ nowcast, mode }: { nowcast: Nowcast; mode: 'standard' | 'detail' }) {
  const s = nowcast.summary;
  const trans = s.phaseTransitions[0];
  const phaseSub = trans
    ? `ab ~${fmtClock(trans.timestamp?.getTime() ?? nowcast.nowMs)} ${phaseLabelStep(trans.from)} → ${phaseLabelStep(trans.to)}`
    : s.character;
  let sh = 0, st = 0;
  for (const step of nowcast.steps) { if (step.character === 'showery') sh++; else if (step.character === 'steady') st++; }
  const charHead = sh === 0 && st === 0 ? '—' : (sh >= st ? 'Schauer' : 'Dauerregen');
  return (
    <div className="rr-metrics">
      <Metric label="Phase" value={s.phase === 'dry' ? 'Trocken' : phaseLabelStep(s.dominantPhase)} sub={phaseSub} alert={s.dominantPhase === 'freezing'} />
      <Metric label="Summe 6 h" value={`${comma(s.sumMm)} mm`} sub={`Band ${comma(s.sumMinMm)} – ${comma(s.sumMaxMm)}`} />
      <Metric label="Gewitter" value={`${s.thunderRiskPct} %`} sub={s.thunderLabel} alert={s.thunderRiskPct >= 30} />
      <Metric label="Schneegrenze" value={s.snowLineM != null ? `${s.snowLineM} m` : '—'} sub={s.snowLineNote} />
      {mode === 'detail' && (
        <>
          <Metric label="Starkregen" value={s.heavyRain ? 'Ja' : 'Nein'} sub={`Spitze ${comma(s.peakMmH)} mm/h${s.heavyRain ? ' · DWD' : ''}`} alert={s.heavyRain} />
          <Metric label="Hagel" value={`${s.hailRiskPct} %`} sub={s.hailRiskPct >= 20 ? 'erhöhtes Risiko' : s.hailRiskPct > 0 ? 'geringes Risiko' : 'kein Signal'} alert={s.hailRiskPct >= 20} />
          <Metric label="Charakter" value={charHead} sub={s.character} wide />
        </>
      )}
    </div>
  );
}

function Metric({ label, value, sub, alert, wide }: { label: string; value: string; sub: string; alert?: boolean; wide?: boolean }) {
  return (
    <div className={`rr-metric${alert ? ' is-alert' : ''}${wide ? ' rr-metric--wide' : ''}`}>
      <div className="rr-metric-label">{label}</div>
      <div className="rr-metric-value">{value}</div>
      {sub && <div className="rr-metric-sub">{sub}</div>}
    </div>
  );
}

function Sources({ nowcast }: { nowcast: Nowcast }) {
  return (
    <div className="rr-sources">
      <details>
        <summary>Datenquellen &amp; Modelllauf</summary>
        <div>
          <strong>0–2 h:</strong> {nowcast.hasRadar ? `DWD RADOLAN-RV (Radar-Nowcast, 1 km)${nowcast.runAtMs ? ` · Lauf ${fmtClock(nowcast.runAtMs)}` : ''}` : 'kein Radar verfügbar — Modell ab jetzt'}<br />
          <strong>2–6 h:</strong> ICON-D2 (2,2 km, DWD) — punktgenau höhenkorrigiert<br />
          <strong>Blend:</strong> Radar wird zw. ~1,5–2,5 h gleitend aufs Modell übergeblendet.
        </div>
      </details>
      <details>
        <summary>Wann das Radar trügt</summary>
        <div>
          <strong>Aloft:</strong> Regen verdunstet vor dem Boden.<br />
          <strong>Bodenclutter:</strong> Berge/Gebäude erzeugen Fehlechos.<br />
          <strong>Niesel:</strong> feine Tropfen werden unterschätzt.<br />
          <strong>Schmelzschicht:</strong> heller Bereich überzeichnet Intensität.
        </div>
      </details>
      <div className="rr-honesty">
        <b><FlagIcon /> Ehrlichkeits-Grenze:</b> Jenseits des Skill-Horizonts (~{Math.round(nowcast.skillHorizonMin / 60)} h) keine minutengenauen Start-/Stoppzeiten. Eine kurze Regenphase markiert nicht den ganzen Zeitraum als „Regen".
      </div>
    </div>
  );
}


// ============================================================================
// Verlauf & Ereignisse (Referenz desktop.png) — „Niederschlagssumme" als
// Balken-Histogramm (Summe je 40-min-Fenster, Farbe = Intensitätsband, Spitze
// violett) + „Ereignisse"-Liste (Zeit links, Beschreibung rechts). Speist sich
// aus nowcast.steps bzw. nowcast.events — keine erfundenen Werte.
// ============================================================================
const d1 = (n: number): string => (Math.round(n * 10) / 10).toString().replace('.', ',');

function eventToneColor(t: EventTone): string {
  switch (t) {
    case 'good': return 'var(--sage-600, #7A9466)';
    case 'alert': return '#C0392B';
    case 'warn': return 'var(--terracotta-500, #C97B47)';
    case 'muted': return 'var(--stone-400, #A89A7A)';
    default: return 'var(--steel-600, #3A6FA8)';
  }
}

const VSUM_BUCKET_MIN = 40; // 9 Balken über 6 h

function PrecipSumCard({ nowcast, hideTitle = false }: { nowcast: Nowcast; hideTitle?: boolean }) {
  const stepH = NOWCAST_STEP_MIN / 60;
  const nb = Math.ceil(NOWCAST_HORIZON_MIN / VSUM_BUCKET_MIN);
  const buckets = Array.from({ length: nb }, () => ({ mm: 0, peak: 0 }));
  let peakStep = nowcast.steps[0];
  for (const s of nowcast.steps) {
    const bi = Math.min(nb - 1, Math.max(0, Math.floor(s.minutes / VSUM_BUCKET_MIN)));
    buckets[bi].mm += Math.max(0, s.mmH) * stepH;
    if (s.mmH > buckets[bi].peak) buckets[bi].peak = s.mmH;
    if (!peakStep || s.mmH > peakStep.mmH) peakStep = s;
  }
  const maxMm = Math.max(0.001, ...buckets.map((b) => b.mm));
  const sum = nowcast.summary.sumMm;
  const hasRain = sum >= 0.1 && peakStep != null && peakStep.mmH >= 0.1;
  return (
    <div className="rt-card rr-vsum-card">
      {!hideTitle && <div className="rr-vsum-title">Niederschlagssumme</div>}
      <div className="rr-vsum-bars" role="img"
        aria-label={`Niederschlagssumme je ${VSUM_BUCKET_MIN} Minuten, gesamt ${d1(sum)} mm über 6 Stunden`}>
        {buckets.map((b, i) => {
          const hpct = b.mm > 0 ? Math.max(8, Math.round((b.mm / maxMm) * 100)) : 4;
          return <span key={i} className="rr-vsum-bar" style={{ height: `${hpct}%`, background: intensityColor(intensityBand(b.peak)) }} />;
        })}
      </div>
      <div className="rr-vsum-cap">
        {hasRain
          ? <>kumuliert <b>{d1(sum)} mm</b> über 6 h · Spitze gegen {fmtClock(peakStep.timestamp.getTime())}</>
          : <>kein nennenswerter Niederschlag in den nächsten 6 h</>}
      </div>
    </div>
  );
}

function EventsTimeline({ nowcast, hideTitle = false }: { nowcast: Nowcast; hideTitle?: boolean }) {
  const events = nowcast.events;
  return (
    <div className="rt-card rr-ev-card">
      {!hideTitle && <div className="rr-vsum-title">Ereignisse</div>}
      {events.length ? (
        <ul className="rr-ev-list">
          {events.map((e, i) => (
            <li key={`${e.kind}-${e.atMinutes}-${i}`} className="rr-ev-row">
              <span className="rr-ev-time" style={{ color: eventToneColor(e.tone) }}>
                {e.timestamp && e.kind !== 'beyond-skill' ? fmtClock(e.timestamp.getTime()) : 'später'}
              </span>
              <span className="rr-ev-text">
                <b>{e.title}</b>{e.detail ? <span className="rr-ev-detail"> — {e.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rr-ev-empty">Keine markanten Ereignisse in den nächsten 6 h.</div>
      )}
    </div>
  );
}

// --- kleine Inline-Icons -----------------------------------------------------
function BoltIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M13 2.5 L5.5 13 H11 L10 21.5 L18.5 10.5 H12 Z" fill="#C97B47" fillOpacity=".18" stroke="#C97B47" strokeWidth="1.6" strokeLinejoin="round"/></svg>;
}
function DropIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 3 C12 3 5 11 5 15.5 A7 7 0 0 0 19 15.5 C19 11 12 3 12 3 Z" fill="#3A6FA8" fillOpacity=".16" stroke="#3A6FA8" strokeWidth="1.6" strokeLinejoin="round"/></svg>;
}
function FlagIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ verticalAlign: -2, marginRight: 4 }}><path d="M6 3 V21" stroke="#C97B47" strokeWidth="1.7" strokeLinecap="round"/><path d="M6 4 H17 L14.5 7.5 L17 11 H6 Z" fill="#C97B47" fillOpacity=".18" stroke="#C97B47" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
}

// ============================================================================
// MOBILE (RM1–RM6) — nur < 768 px. Alle Bausteine bleiben erhalten, nur mobile
// Anordnung/Interaktion. Vorlagen: references/mobile-RM{1..6}.png.
// ============================================================================

// --- Mobile-Icons (Inline-SVG, currentColor) --------------------------------
function PlusIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5 V19 M5 12 H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function MinusIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12 H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
// Bottom-Tab-Icons
function TabGlanceIcon() { return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/><path d="M12 3 A9 9 0 0 1 21 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>; }
function TabTimelineIcon() { return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12 H21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="9" cy="12" r="3.2" fill="var(--cream-50,#FAF6EA)" stroke="currentColor" strokeWidth="1.7"/><path d="M3 6 H21 M3 18 H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity=".45"/></svg>; }
function TabChartIcon() { return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 20 V11 M12 20 V5 M19 20 V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function TabLayerIcon() { return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 L21 8 L12 13 L3 8 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M3 12 L12 17 L21 12 M3 16 L12 21 L21 16" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>; }
function TabDetailIcon() { return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7"/></svg>; }

// --- Bottom-Tab-Bar (fix am unteren Rand, über dem Panel-Sheet) -------------
const MOBILE_TABS: Array<{ id: MobileTab; label: string; icon: ReactNode }> = [
  { id: 'glance', label: 'Schnellblick', icon: <TabGlanceIcon /> },
  { id: 'timeline', label: 'Zeitachse', icon: <TabTimelineIcon /> },
  { id: 'chart', label: 'Diagramm', icon: <TabChartIcon /> },
  { id: 'layer', label: 'Layer', icon: <TabLayerIcon /> },
  { id: 'detail', label: 'Detail', icon: <TabDetailIcon /> },
];

function MobileTabBar({ tab, onSelect }: { tab: MobileTab; onSelect: (t: MobileTab) => void }) {
  return (
    <nav className="rm-tabbar" aria-label="Regenradar-Bereiche">
      {MOBILE_TABS.map((t) => (
        <button key={t.id} type="button" className={`rm-tab${tab === t.id ? ' is-active' : ''}`}
          onClick={() => onSelect(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
          <span className="rm-tab-ic">{t.icon}</span>
          <span className="rm-tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

// --- Panel-Sheet (ziehbar peek ↔ full); Inhalt nach aktivem Tab -------------
function MobileTabSheet({ tab, snap, onSnapChange, nowcast, state, mode, setMode, layers, toggleLayer, location }: {
  tab: MobileTab; snap: 'peek' | 'full'; onSnapChange: (s: 'peek' | 'full') => void;
  nowcast: Nowcast | null; state: DeckState; mode: 'standard' | 'detail'; setMode: (m: 'standard' | 'detail') => void;
  layers: RadarLayerId[]; toggleLayer: (id: RadarLayerId) => void; location: Location;
}) {
  const PEEK = 34, FULL = 92; // vh
  const [dragVh, setDragVh] = useState(0);
  const target = snap === 'full' ? FULL : PEEK;
  const liveVh = Math.min(94, Math.max(PEEK - 4, target + dragVh));
  const place = shortPlace(location.name);

  const startDrag = (e: React.PointerEvent) => {
    const startY = e.clientY; const startVh = target;
    const onMove = (ev: PointerEvent) => setDragVh(((startY - ev.clientY) / window.innerHeight) * 100);
    const onUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp);
      const endVh = startVh + ((startY - ev.clientY) / window.innerHeight) * 100;
      setDragVh(0);
      onSnapChange(endVh > (PEEK + FULL) / 2 ? 'full' : 'peek');
    };
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp);
  };

  return (
    <div className={`rm-sheet rm-tabsheet${snap === 'full' ? ' is-full' : ''}`} style={{ height: `${liveVh}vh` }}
      role="region" aria-label={`Bereich ${tab}`}>
      <div className="rm-sheet-grab" onPointerDown={startDrag}><span className="rm-sheet-handle" /></div>
      <div className="rm-sheet-body rm-tabsheet-body">
        {tab === 'glance' && <GlancePanel nowcast={nowcast} state={state} place={place} />}
        {tab === 'timeline' && <TimelinePanel nowcast={nowcast} state={state} place={place} />}
        {tab === 'chart' && <ChartPanel nowcast={nowcast} state={state} place={place} />}
        {tab === 'layer' && <LayerPanel layers={layers} toggleLayer={toggleLayer} mode={mode} setMode={setMode} nowcast={nowcast} place={place} />}
        {tab === 'detail' && <DetailPanel nowcast={nowcast} state={state} mode={mode} place={place} />}
      </div>
    </div>
  );
}

function PanelHead({ place, title, right }: { place: string; title: string; right?: ReactNode }) {
  return (
    <div className="rm-panelhead">
      <span className="rm-panelhead-eyebrow">Regenradar · {place}</span>
      <div className="rm-panelhead-row">
        <span className="rm-panelhead-title">{title}</span>
        {right}
      </div>
    </div>
  );
}

function PanelState({ state }: { state: DeckState }) {
  if (state.kind === 'error') return <div className="rr-center-state" style={{ position: 'static', color: '#B5341F', minHeight: 120 }}>⚠ {state.message}</div>;
  return <div className="rr-center-state" style={{ position: 'static', color: 'var(--stone-500)', minHeight: 120 }}><span className="ev-spinner" /> Radar &amp; Modell werden ausgewertet …</div>;
}

// --- Panel: Schnellblick ----------------------------------------------------
function GlancePanel({ nowcast, state, place }: { nowcast: Nowcast | null; state: DeckState; place: string }) {
  if (!nowcast) return <><PanelHead place={place} title="Schnellblick" /><PanelState state={state} /></>;
  const h = heroState(nowcast);
  let line: ReactNode, sub: ReactNode;
  if (h.kind === 'coming') {
    line = h.beyondSkill ? <>Später <span className="rm-accent">evtl. Regen</span>.</> : <>In <span className="rm-accent">{leadLabel(h.inMin)}</span> Regen.</>;
    sub = h.beyondSkill
      ? <>Erst in {leadLabel(h.inMin)} · {h.intensity} — jenseits des Skill-Horizonts.</>
      : <>~{h.onsetClock}{h.endClock && <>–{h.endClock}</>} · {h.intensity} · {h.character}</>;
  } else if (h.kind === 'raining') {
    line = <><span className="rm-accent">Es regnet</span> gerade.</>;
    sub = h.dry
      ? <>Danach {fmtDuration(h.dry.durationMin)} trocken · {fmtClock(nowcast.nowMs + h.dry.fromMin * 60_000)}–{fmtClock(nowcast.nowMs + h.dry.toMin * 60_000)}</>
      : <>Regen hält an — kein längeres Trockenfenster in Sicht.</>;
  } else {
    line = <span className="rm-accent">Trocken.</span>;
    sub = <>Kein Regen in den nächsten 6 Stunden erwartet.</>;
  }
  return (
    <>
      <PanelHead place={place} title="Schnellblick" />
      <div className="rm-glance">
        <p className="rm-peek-line">{line}</p>
        <p className="rm-peek-sub">{sub}</p>
        <MobileAlertChips nowcast={nowcast} />
        <p className="rm-glance-hint">Unten wechseln: <b>Zeitachse</b>, <b>Diagramm</b>, <b>Layer</b> &amp; <b>Detail</b>.</p>
      </div>
    </>
  );
}

function MobileAlertChips({ nowcast }: { nowcast: Nowcast }) {
  const s = nowcast.summary;
  const chips: ReactNode[] = [];
  if (s.thunderRiskPct >= 12) chips.push(<span key="th" className="rm-chip"><BoltIcon />Gewitter {s.thunderRiskPct} %</span>);
  if (s.heavyRain || s.peakMmH >= 5) chips.push(<span key="hr" className="rm-chip"><DropIcon />Starkregen {fmtMmH(s.peakMmH)}</span>);
  if (!chips.length) return null;
  return <div className="rm-chips">{chips}</div>;
}

// --- Panel: Zeitachse (Regenslider) -----------------------------------------
function TimelinePanel({ nowcast, state, place }: { nowcast: Nowcast | null; state: DeckState; place: string }) {
  return (
    <>
      <PanelHead place={place} title="Regenverlauf" />
      {nowcast ? <NowcastRainSlider nowcast={nowcast} /> : <PanelState state={state} />}
    </>
  );
}

// --- Panel: Diagramm --------------------------------------------------------
function ChartPanel({ nowcast, state, place }: { nowcast: Nowcast | null; state: DeckState; place: string }) {
  return (
    <>
      <PanelHead place={place} title="Diagramm" />
      {nowcast ? (
        <>
          <div className="rm-seclabel rm-seclabel--wide">Niederschlagsrate · mm/h · 0–6 h</div>
          <div className="rm-card rm-chartcard"><NowcastBarChart nowcast={nowcast} /></div>
          <div className="rm-seclabel rm-seclabel--wide">Kumulierte Summe</div>
          <div className="rm-card rm-chartcard"><MobileCumChart nowcast={nowcast} /></div>
          <div className="rm-chartpage-foot">
            <span className="rm-src-dot" /> RADOLAN-RV (0–2 h) · ICON-D2 (2–6 h) · Lauf {fmtClock(nowcast.runAtMs || nowcast.fetchedAtMs)}
          </div>
        </>
      ) : <PanelState state={state} />}
    </>
  );
}

// --- Panel: Layer -----------------------------------------------------------
function LayerPanel({ layers, toggleLayer, mode, setMode, nowcast, place }: {
  layers: RadarLayerId[]; toggleLayer: (id: RadarLayerId) => void;
  mode: 'standard' | 'detail'; setMode: (m: 'standard' | 'detail') => void;
  nowcast: Nowcast | null; place: string;
}) {
  const activeCount = DECK_LAYERS.filter((l) => layers.includes(l.id)).length;
  const snowSub = nowcast?.summary?.snowLineM != null
    ? `${nowcast.summary.snowLineM} m · ${nowcast.summary.snowLineNote || 'Schneefallgrenze'}`
    : 'Schneefallgrenze';
  return (
    <>
      <PanelHead place={place} title="Radar-Layer" right={<span className="rm-modal-count">{activeCount} aktiv</span>} />
      <div className="rm-layerlist">
        {DECK_LAYERS.map((l) => {
          const on = layers.includes(l.id);
          const sub = l.id === 'snowline' ? snowSub : l.sub;
          return (
            <button key={l.id} type="button" className={`rm-layer${on ? ' is-on' : ''}`}
              style={{ ['--rm-lc']: l.color } as CSSProperties} onClick={() => toggleLayer(l.id)} aria-pressed={on}>
              <span className="rm-layer-ic">{l.icon}</span>
              <span className="rm-layer-text">
                <span className="rm-layer-label">{l.label}</span>
                <span className="rm-layer-sub">{sub}</span>
              </span>
              <span className="rm-switch" aria-hidden="true"><span className="rm-switch-knob" /></span>
            </button>
          );
        })}
      </div>
      <div className="rm-seclabel">Modus</div>
      <div className="rm-seg rm-seg--modus" role="tablist" aria-label="Modus">
        <button type="button" role="tab" aria-selected={mode === 'standard'} className={mode === 'standard' ? 'is-active' : ''} onClick={() => setMode('standard')}>Standard</button>
        <button type="button" role="tab" aria-selected={mode === 'detail'} className={mode === 'detail' ? 'is-active' : ''} onClick={() => setMode('detail')}>Detail</button>
      </div>
    </>
  );
}

// --- Panel: Detail ----------------------------------------------------------
function DetailPanel({ nowcast, state, mode, place }: {
  nowcast: Nowcast | null; state: DeckState; mode: 'standard' | 'detail'; place: string;
}) {
  return (
    <>
      <PanelHead place={place} title="6-h-Prognose" />
      {nowcast ? (
        <>
          <div className="rm-seclabel">Kennzahlen · 6 h</div>
          <MobileMetrics nowcast={nowcast} />
          <div className="rm-seclabel">Niederschlagssumme</div>
          <PrecipSumCard nowcast={nowcast} hideTitle />
          <div className="rm-seclabel">Ereignisse</div>
          <EventsTimeline nowcast={nowcast} hideTitle />
          {mode === 'detail' && <div style={{ marginTop: 12 }}><AlpineCard nowcast={nowcast} /></div>}
          <Sources nowcast={nowcast} />
        </>
      ) : <PanelState state={state} />}
    </>
  );
}

function characterSub(nowcast: Nowcast): string {
  let sh = 0, st = 0;
  for (const s of nowcast.steps) { if (s.character === 'showery') sh++; else if (s.character === 'steady') st++; }
  if (sh > 0 && st > 0) return 'Schauer → Dauerregen';
  if (sh > 0) return 'Schauer';
  if (st > 0) return 'Dauerregen';
  return nowcast.summary.character || '—';
}

function MobileMetrics({ nowcast }: { nowcast: Nowcast }) {
  const s = nowcast.summary;
  return (
    <div className="rm-metrics">
      <Metric label="Phase" value={s.phase === 'dry' ? 'Trocken' : phaseLabelStep(s.dominantPhase)} sub={characterSub(nowcast)} alert={s.dominantPhase === 'freezing'} />
      <Metric label="Summe 6 h" value={`${comma(s.sumMm)} mm`} sub={`Band ${comma(s.sumMinMm)} – ${comma(s.sumMaxMm)}`} />
      <Metric label="Gewitter" value={`${s.thunderRiskPct} %`} sub={s.thunderLabel} alert={s.thunderRiskPct >= 30} />
      <Metric label="Starkregen" value={s.heavyRain ? 'Ja' : 'Nein'} sub={`Spitze ${comma(s.peakMmH)} mm/h`} alert={s.heavyRain} />
      <Metric label="Schneegrenze" value={s.snowLineM != null ? `${s.snowLineM} m` : '—'} sub={s.snowLineNote} />
      <Metric label="Hagel" value={`${s.hailRiskPct} %`} sub={s.hailRiskPct >= 20 ? 'erhöhtes Risiko' : s.hailRiskPct > 0 ? 'geringes Risiko' : 'kein Signal'} alert={s.hailRiskPct >= 20} />
    </div>
  );
}

function MobileCumChart({ nowcast }: { nowcast: Nowcast }) {
  const stepH = NOWCAST_STEP_MIN / 60;
  let c = 0; let peakStep = nowcast.steps[0];
  const pts = nowcast.steps.map((s) => { c += Math.max(0, s.mmH) * stepH; if (!peakStep || s.mmH > peakStep.mmH) peakStep = s; return { min: s.minutes, mm: c }; });
  const total = c;
  const top = Math.max(0.5, total);
  const W = 320, H = 118, padL = 6, padR = 6, padT = 12, padB = 22;
  const x = (min: number) => padL + ((W - padL - padR) * min) / NOWCAST_HORIZON_MIN;
  const y = (mm: number) => padT + (H - padT - padB) * (1 - mm / top);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.min).toFixed(1)} ${y(p.mm).toFixed(1)}`).join(' ');
  const area = `M ${x(0)} ${y(0)} ${pts.map((p) => `L ${x(p.min).toFixed(1)} ${y(p.mm).toFixed(1)}`).join(' ')} L ${x(NOWCAST_HORIZON_MIN)} ${y(0)} Z`;
  const hasRain = total >= 0.1 && peakStep.mmH >= 0.1;
  return (
    <div className="rm-cum">
      <svg className="rm-cum-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Kumulierte Niederschlagssumme, gesamt ${d1(total)} mm über 6 Stunden`}>
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} rx="6" className="rm-cum-plot" />
        <path d={area} className="rm-cum-area" />
        <path d={line} className="rm-cum-line" />
        <text x={padL + 2} y={H - 6} className="rm-cum-xlabel">jetzt</text>
        <text x={W / 2} y={H - 6} className="rm-cum-xlabel" textAnchor="middle">+3h</text>
        <text x={W - padR - 2} y={H - 6} className="rm-cum-xlabel" textAnchor="end">+6h</text>
      </svg>
      <div className="rm-cum-cap">
        {hasRain ? <><b>{d1(total)} mm</b> über 6 h · Spitze gegen {fmtClock(peakStep.timestamp.getTime())}</> : <>kein nennenswerter Niederschlag in den nächsten 6 h</>}
      </div>
    </div>
  );
}

