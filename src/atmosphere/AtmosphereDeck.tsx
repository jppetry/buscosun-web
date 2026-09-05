/**
 * Vertikalschnitt / 3D-Wetter — „Command-Deck" (hell).
 *
 * Ersetzt das alte Schnitt-Layout (SectionLens/td-*) durch das Command-Deck aus
 * references/vertikalschnitt.dc.html. Drei Linsen — Höhenwind-Geländeschnitt,
 * Inversion/Kaltluftsee, Go/No-Go (B2B) — plus die erhaltenen Linsen Föhn & Thermik.
 * Alle drei Schnitt-Linsen speisen sich aus EINEM vorbereiteten Vertikalschnitt
 * (prepareCrossSection → sectionAtTime → CrossSection) und der bestehenden
 * Go/No-Go-Logik (goNoGo.ts). Keine erfundenen Daten: ohne Schnittlinie ehrlicher
 * Hinweis statt Fake-Werte. Funktionserhalt: SectionChart, evaluateGoNoGo,
 * estimateInversion, FoehnPanel, ThermalMap, Profil & Nerd bleiben verdrahtet.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Location } from '../types';
import { geocodeDACH, flagForCountry } from '../geocode';
import { tourFileToCutLine } from '../threed/tourImport';
import { pickCountry } from '../pointForecast/clustering';
import { useAtmosphere } from './atmosphereStore';
import { HOUR_MIN, HOUR_MAX } from './atmosphereState';
import ThreeDMap from '../threed/ThreeDMap';
import SectionChart, { BAND_COLORS, BAND_LABELS, type PickedPoint } from '../threed/SectionChart';
import {
  prepareCrossSection, sectionAtTime, type PreparedSection, type PrepareProgress,
} from '../threed/buildCrossSection';
import type { CrossSection } from '../threed/crossSection';
import { evaluateGoNoGo, loadGoNoGo, saveGoNoGo, type GoNoGoConfig } from '../threed/goNoGo';
import AtmosphereVerdict from './AtmosphereVerdict';
import AtmosphereProfile from './AtmosphereProfile';
import ThermalMap from './ThermalMap';
import FoehnPanel from './FoehnPanel';
import { useIsMobile } from '../mobile/useIsMobile';
import '../threed/threed.css';
import './atmosphere.css';
import './atmosphereDeck.css';
import { FeatureRail, type RailFeature } from '../nav/featureRail';

const NerdPanel = lazy(() => import('./NerdPanel'));

/** Deck-Linse: die drei Schnitt-Seiten + die erhaltenen Föhn/Thermik-Linsen. */
type DeckLens = 'hoehenwind' | 'inversion' | 'gonogo' | 'foehn' | 'thermik';

/** Unteransichten der Querschnitt-Linse (Router RT1: `?ansicht=`; `hoehenwind` = Default, wird nicht geschrieben). */
export type DeckSub = 'hoehenwind' | 'inversion' | 'gonogo';

interface Props {
  onBack: () => void;
  onOpenFeature?: (id: RailFeature) => void;
  initialSub?: DeckSub | null;
  /** Unterlinse von aussen (nur Zurueck/Vorwaerts) — E7: /atmosphaere/arbeitsfenster. */
  routeSub?: DeckSub | null;
  onSubChange?: (sub: DeckSub) => void;
}

// ----------------------------------------------------------------------------
// Vertikalschnitt-Daten (aus der gezeichneten Schnittlinie) — geteilt von allen
// drei Schnitt-Linsen. Spiegelt die bewährte SectionLens-Vorbereitung.
// ----------------------------------------------------------------------------
type DataState =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: PrepareProgress | null }
  | { kind: 'ready'; prepared: PreparedSection }
  | { kind: 'error'; message: string };

function useSectionData() {
  const { cutPoints } = useAtmosphere();
  const [data, setData] = useState<DataState>({ kind: 'idle' });
  const [timeMs, setTimeMs] = useState<number | null>(null);
  const acRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (cutPoints.length < 2) { setData({ kind: 'idle' }); return; }
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setData({ kind: 'loading', progress: null });
    (async () => {
      try {
        const prepared = await prepareCrossSection(cutPoints, ac.signal, (p) => {
          if (!ac.signal.aborted) setData({ kind: 'loading', progress: p });
        });
        if (ac.signal.aborted) return;
        setData({ kind: 'ready', prepared });
        setTimeMs((prev) => {
          const nowClamped = Math.min(Math.max(Date.now(), prepared.startMs), prepared.endMs);
          return prev != null && prev >= prepared.startMs && prev <= prepared.endMs ? prev : nowClamped;
        });
      } catch (err) {
        if (ac.signal.aborted) return;
        setData({ kind: 'error', message: err instanceof Error ? err.message : 'Schnitt-Daten nicht erreichbar' });
      }
    })();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutPoints]);
  useEffect(() => () => acRef.current?.abort(), []);

  const section = useMemo(
    () => (data.kind === 'ready' && timeMs != null ? sectionAtTime(data.prepared, timeMs) : null),
    [data, timeMs],
  );
  return { data, section, timeMs, setTimeMs };
}

// ----------------------------------------------------------------------------
// Deck
// ----------------------------------------------------------------------------
export default function AtmosphereDeck({ onBack, onOpenFeature, initialSub, routeSub, onSubChange }: Props) {
  const isMobile = useIsMobile();
  const { lens, setLens, location } = useAtmosphere();
  const [sub, setSub] = useState<DeckSub>(initialSub ?? 'hoehenwind');
  // Router (RT1): Unterlinse ⇒ `?ansicht=` (replace, kein History-Eintrag).
  const onSubChangeRef = useRef(onSubChange);
  onSubChangeRef.current = onSubChange;
  useEffect(() => { onSubChangeRef.current?.(sub); }, [sub]);
  // Zurueck/Vorwaerts: Unterlinse aus der URL uebernehmen (E7; setLens macht der Store).
  useEffect(() => { if (routeSub && routeSub !== sub) setSub(routeSub); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [routeSub]);
  const deckLens: DeckLens = lens === 'mountain' ? 'foehn' : lens === 'fly' ? 'thermik' : sub;
  const setDeckLens = (l: DeckLens) => {
    if (l === 'foehn') setLens('mountain');
    else if (l === 'thermik') setLens('fly');
    else { setLens('section'); setSub(l); }
  };

  const { cutPoints, sectionMode, setSectionMode } = useAtmosphere();
  const sectionData = useSectionData();
  // Beim Öffnen mit vorhandener Schnittlinie direkt in den 3D-Schnitt (Vorlage).
  const auto3dRef = useRef(false);
  useEffect(() => {
    if (!auto3dRef.current && cutPoints.length >= 2 && sectionMode === '2d') { auto3dRef.current = true; setSectionMode('3d'); }
  }, [cutPoints, sectionMode, setSectionMode]);
  const [picked, setPicked] = useState<PickedPoint | null>(null);
  const [cfg, setCfgState] = useState<GoNoGoConfig>(() => loadGoNoGo());
  const setCfg = (c: GoNoGoConfig) => { setCfgState(c); saveGoNoGo(c); };

  const ctx = { deckLens, setDeckLens, ...sectionData, picked, setPicked, cfg, setCfg, onBack, onOpenFeature, location };

  if (isMobile) return <MobileDeck {...ctx} />;
  return <DesktopDeck {...ctx} />;
}

type DeckCtx = {
  deckLens: DeckLens; setDeckLens: (l: DeckLens) => void;
  data: DataState; section: CrossSection | null; timeMs: number | null; setTimeMs: (v: number | ((p: number | null) => number | null)) => void;
  picked: PickedPoint | null; setPicked: (p: PickedPoint | null) => void;
  cfg: GoNoGoConfig; setCfg: (c: GoNoGoConfig) => void;
  onBack: () => void; onOpenFeature?: (id: RailFeature) => void; location: Location | null;
};

// ============================ Desktop / Tablet ============================
function DesktopDeck(ctx: DeckCtx) {
  const { deckLens, onBack, onOpenFeature, location } = ctx;
  const isGoNoGo = deckLens === 'gonogo';
  return (
    <div className="vsd-root">
      <div className="vsd-topbar">
        <div className="vsd-brandwrap">
          <img src="/buscosun-mark.svg" width={26} height={26} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <button className="vsd-brand" onClick={onBack}>buscosun</button>
        </div>
        <div className="vsd-topdivider" />
        <LocationChip />
        <div className="vsd-topright">
          {isGoNoGo ? (
            <>
              <button className="vsd-toppill"><IconDownload /> PDF</button>
              <button className="vsd-toppill vsd-toppill--primary"><IconShare /> Link teilen</button>
            </>
          ) : (
            <>
              <div className="vsd-live"><span className="vsd-live-dot" /><span className="vsd-live-txt">ICON-D2 · 08:00 UTC</span></div>
              <span className="vsd-avatar">JK</span>
            </>
          )}
        </div>
      </div>
      <div className="vsd-body">
        <Rail onBack={onBack} onOpenFeature={onOpenFeature} />
        {deckLens === 'hoehenwind' && <HoehenwindDesktop {...ctx} />}
        {deckLens === 'inversion' && <InversionDesktop {...ctx} />}
        {deckLens === 'gonogo' && <GoNoGoDesktop {...ctx} />}
        {(deckLens === 'foehn' || deckLens === 'thermik') && <PreservedHost {...ctx} location={location} />}
      </div>
    </div>
  );
}

function Rail({ onBack, onOpenFeature }: { onBack: () => void; onOpenFeature?: (id: RailFeature) => void }) {
  return (
    <FeatureRail
      active="atmosphere"
      onOpenFeature={onOpenFeature}
      onHome={onBack}
      navClass="vsd-rail"
      btnClass="vsd-rail-btn"
      activeClass="vsd-rail-btn--active"
      spacerClass="vsd-rail-spacer"
    />
  );
}

function LensPills({ deckLens, setDeckLens }: { deckLens: DeckLens; setDeckLens: (l: DeckLens) => void }) {
  const items: Array<{ id: DeckLens; label: string }> = [
    { id: 'hoehenwind', label: 'Höhenwind' },
    { id: 'inversion', label: 'Inversion' },
    { id: 'gonogo', label: 'Go/No-Go' },
    { id: 'foehn', label: 'Föhn' },
    { id: 'thermik', label: 'Thermik' },
  ];
  return (
    <div className="vsd-lenses" role="tablist" aria-label="Linse">
      {items.map((it) => (
        <button key={it.id} type="button" role="tab" aria-selected={deckLens === it.id}
          className={`vsd-lens${deckLens === it.id ? ' vsd-lens--active' : ''}`} onClick={() => setDeckLens(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------- Höhenwind (Desktop) ----------------------------
function HoehenwindDesktop(ctx: DeckCtx) {
  const { data, section, timeMs, setTimeMs, picked, setPicked, deckLens, setDeckLens, location } = ctx;
  const { cutPoints, setCutPoints, sectionLayers, setSectionLayers, sectionMode, setSectionMode } = useAtmosphere();
  const center = location ? { lat: location.lat, lon: location.lon } : { lat: 47.42, lon: 10.98 };

  return (
    <>
      <div className="vsd-dock vsd-scroll">
        <div className="vsd-eyebrow">Höhenwind-Geländeschnitt</div>
        <div className="vsd-dock-title">{location?.name ?? 'Schnittlinie zeichnen'}</div>
        <div className="vsd-toggle" role="tablist" aria-label="Ansicht">
          <button role="tab" aria-selected={sectionMode === '2d'} className={`vsd-toggle-btn${sectionMode === '2d' ? ' vsd-toggle-btn--active' : ''}`} onClick={() => setSectionMode('2d')}>2D</button>
          <button role="tab" aria-selected={sectionMode !== '2d'} className={`vsd-toggle-btn${sectionMode !== '2d' ? ' vsd-toggle-btn--active' : ''}`} onClick={() => setSectionMode('3d')}>3D</button>
        </div>
        <div className="vsd-note">Ort · Zeit · Parameter bleiben erhalten</div>

        <div className="vsd-mapcard">
          <DockMapSchematic points={cutPoints.length} />
          <div className="vsd-map-badge"><span className="vsd-map-badge-dot" /><span className="vsd-map-badge-txt">Schnitt-Modus aktiv</span></div>
          <TourPill />
        </div>
        <div className="vsd-note">{cutPoints.length === 0 ? 'Wechsle auf 2D, um die Schnittlinie zu zeichnen' : `${cutPoints.length} Punkt${cutPoints.length === 1 ? '' : 'e'} · Marker ziehen oder antippen zum Löschen`}</div>

        <div className="vsd-pquery">
          <div className="vsd-pquery-lab">{picked ? `Punkt-Abfrage · ${(picked.distanceM / 1000).toFixed(1).replace('.', ',')} km · ${Math.round(picked.levelM)} m` : 'Punkt-Abfrage'}</div>
          {picked ? (
            <div className="vsd-pquery-rows">
              <div className="vsd-pquery-row"><span>Höhe</span><b>{Math.round(picked.levelM)} m ü. NN</b></div>
              <div className="vsd-pquery-row"><span>über Grund</span><b>{Math.round(picked.agl)} m AGL</b></div>
              <div className="vsd-pquery-row"><span>Mittelwind</span><b className="wind">{Math.round(picked.windKmh)} km/h · {compass(picked.windDirDeg)}</b></div>
              <div className="vsd-pquery-row"><span>Böen</span><b className="gust">{Math.round(picked.gustKmh)} km/h</b></div>
              <div className="vsd-pquery-row"><span>Temperatur</span><b>{fmtTemp(picked.tempC)} °C</b></div>
            </div>
          ) : (
            <div className="vsd-pquery-empty">Tippe in den Schnitt, um Höhe, Wind, Böen und Temperatur an einem Punkt abzulesen.</div>
          )}
        </div>
      </div>

      <div className="vsd-center vsd-scroll">
        <div className="vsd-inv-head">
          <div />
          <LensPills deckLens={deckLens} setDeckLens={setDeckLens} />
        </div>

        {sectionMode === '2d' ? (
          <div className="vsd-plot vsd-plot--map" style={{ padding: 0, overflow: 'hidden', height: 560 }}>
            <ThreeDMap center={center} points={cutPoints} onChange={setCutPoints} />
            {cutPoints.length < 2 && (
              <div className="vsd-cuthint-pill" role="status">
                <CutHintMark />
                <span>
                  <b>Schnittlinie zeichnen:</b> tippe {cutPoints.length === 0 ? 'zwei Punkte' : 'noch einen Punkt'} auf die Karte,
                  am besten quer über ein Tal oder einen Grat.
                </span>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="vsd-chips">
              <LayerChip label="Mittelwind" on={sectionLayers.mean} onClick={() => setSectionLayers({ ...sectionLayers, mean: !sectionLayers.mean })} />
              <LayerChip label="Böen" on={sectionLayers.gust} onClick={() => setSectionLayers({ ...sectionLayers, gust: !sectionLayers.gust })} />
              <LayerChip label="Shear" on={sectionLayers.shear} onClick={() => setSectionLayers({ ...sectionLayers, shear: !sectionLayers.shear })} />
              <LayerChip label="Streamlines" on={sectionLayers.streamlines} onClick={() => setSectionLayers({ ...sectionLayers, streamlines: !sectionLayers.streamlines })} />
              <LayerChip label="Wolkenbasis" on={sectionLayers.cloudBase} onClick={() => setSectionLayers({ ...sectionLayers, cloudBase: !sectionLayers.cloudBase })} />
              <span className="vsd-chip-info"><span className="vsd-ibadge">i</span>Gitterzellen ≈ 2 km · 333 m · Auflösung begrenzt die Genauigkeit</span>
            </div>

            <div className="vsd-plot">
              {section ? (
                <>
                  <SectionChart section={section} layers={sectionLayers} picked={picked} onPick={setPicked} wide />
                  {picked && (
                    <div className="vsd-pickpill">
                      <div className="vsd-pickpill-lab">{Math.round(picked.levelM)} M · {Math.round(picked.agl)} M AGL</div>
                      <div className="vsd-pickpill-val">{Math.round(picked.windKmh)} km/h <small>Mittel</small></div>
                      <div className="vsd-pickpill-sub">Böe <b>{Math.round(picked.gustKmh)}</b> · {compass(picked.windDirDeg)} · {fmtTemp(picked.tempC)} °C</div>
                    </div>
                  )}
                </>
              ) : (
                <SectionPlaceholder data={data} onDraw={() => setSectionMode('2d')} />
              )}
            </div>

            <div className="vsd-legend">
              <span className="vsd-legend-lab">Windgeschwindigkeit km/h · Höhe = m ü. NN</span>
              {BAND_COLORS.map((c, i) => (
                <div key={c} className="vsd-legend-item"><span className="vsd-legend-sw" style={{ background: c }} /><span>{BAND_LABELS[i]}</span></div>
              ))}
              <span className="vsd-legend-div" />
              <div className="vsd-legend-item"><span className="vsd-legend-line" /><span>Mittelwind</span></div>
              <div className="vsd-legend-item"><span className="vsd-legend-line vsd-legend-line--dash" /><span>Böen</span></div>
            </div>

            <TimeDeck data={data} timeMs={timeMs} setTimeMs={setTimeMs} />
            <p className="vsd-caption">Wind auf realer Höhe über Grund (AGL) aus ICON-D2-Druckflächen + DEM interpoliert · ≥30 FPS · werbefrei</p>
          </>
        )}
      </div>
    </>
  );
}

function LayerChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`vsd-chip${on ? ' vsd-chip--active' : ''}`} aria-pressed={on} onClick={onClick}>
      <span className="vsd-chip-dot" />{label}
    </button>
  );
}

function SectionPlaceholder({ data, onDraw }: { data: DataState; onDraw: () => void }) {
  if (data.kind === 'loading') {
    const pct = data.progress && data.progress.total > 0 ? Math.round((data.progress.done / data.progress.total) * 100) : 8;
    return (
      <div className="vsd-loading">
        <span>{data.progress?.phase ?? 'Vertikalschnitt wird vorbereitet …'}</span>
        <div className="vsd-loading-bar"><span className="vsd-loading-fill" style={{ width: `${Math.max(8, pct)}%` }} /></div>
        {data.progress && <span className="vsd-note">{data.progress.done}/{data.progress.total}</span>}
      </div>
    );
  }
  if (data.kind === 'error') return <div className="vsd-plot-empty"><strong>Schnitt nicht verfügbar</strong><p>⚠ {data.message}</p></div>;
  return (
    <div className="vsd-plot-empty">
      <CutHintArt />
      <strong>Zeichne eine Schnittlinie durch die Landschaft</strong>
      <p>Wechsle auf <b>2D</b> und tippe mindestens zwei Punkte auf der Karte — z. B. quer über ein Tal oder einen Grat.
        Entlang dieser Linie schneiden wir die Atmosphäre auf und zeigen Höhenwind, Inversion und Wolkenschichten.</p>
      <button className="vsd-toppill vsd-toppill--primary" onClick={onDraw}>Zur Karte (2D)</button>
    </div>
  );
}

/** Kompakte Variante der Hinweis-Zeichnung für das Karten-Overlay. */
function CutHintMark() {
  return (
    <svg width="52" height="34" viewBox="0 0 52 34" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="50" height="32" rx="8" fill="var(--sand-100, #EDE6D3)" stroke="var(--border-default, #E0D6BE)" />
      <g stroke="var(--stone-400, #A89A7A)" strokeOpacity="0.6" strokeWidth="0.9" fill="none">
        <path d="M6 26 C16 22 20 14 30 11 C38 8.5 42 6 47 5" />
        <path d="M5 20 C15 16 21 9 32 6" />
      </g>
      <path className="vsd-cuthint-line" d="M11 26 L39 9" stroke="var(--terracotta-500, #C97B47)" strokeWidth="1.9" strokeLinecap="round" strokeDasharray="4 3.5" />
      <circle cx="11" cy="26" r="2.6" fill="var(--terracotta-500, #C97B47)" stroke="var(--cream-50, #FAF6EA)" strokeWidth="1.2" />
      <circle cx="39" cy="9" r="2.6" fill="var(--terracotta-500, #C97B47)" stroke="var(--cream-50, #FAF6EA)" strokeWidth="1.2" />
    </svg>
  );
}

/**
 * Hinweis-Zeichnung „So entsteht ein Schnitt": links die Karte von oben mit der
 * getippten Linie über dem Gelände, rechts das Ergebnis — der aufgeschnittene
 * Luftraum. Rein dekorativ (aria-hidden), keine Daten, keine Behauptungen.
 */
function CutHintArt() {
  return (
    <svg className="vsd-cuthint" viewBox="0 0 420 150" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="vsdHintSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--steel-600, #3A6FA8)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--steel-600, #3A6FA8)" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="vsdHintGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--sand-200, #E0D6BE)" />
          <stop offset="100%" stopColor="var(--sand-100, #EDE6D3)" />
        </linearGradient>
      </defs>

      {/* --- links: Karte von oben, Linie quer über Tal und Grat --- */}
      <rect x="4" y="14" width="176" height="122" rx="14" fill="url(#vsdHintGround)" stroke="var(--border-default, #E0D6BE)" />
      <g stroke="var(--stone-400, #A89A7A)" strokeOpacity="0.55" strokeWidth="1" fill="none">
        <path d="M26 108 C60 96 66 74 96 66 C124 58 138 40 166 34" />
        <path d="M20 86 C56 76 68 56 100 48 C126 42 140 28 168 24" />
        <path d="M32 126 C64 116 74 96 104 86 C130 78 146 60 172 52" />
      </g>
      <path className="vsd-cuthint-line" d="M40 118 L142 42" stroke="var(--terracotta-500, #C97B47)" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="7 6" />
      <circle cx="40" cy="118" r="5.5" fill="var(--terracotta-500, #C97B47)" stroke="var(--cream-50, #FAF6EA)" strokeWidth="2" />
      <circle cx="142" cy="42" r="5.5" fill="var(--terracotta-500, #C97B47)" stroke="var(--cream-50, #FAF6EA)" strokeWidth="2" />
      {/* Fingerzeig am zweiten Punkt */}
      <g stroke="var(--ink-900, #2C2A26)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" fill="var(--cream-50, #FAF6EA)">
        <path d="M150 52 L150 66 L146 62 L143 65 L138 56 L142 54 L138 48 Z" />
      </g>
      <text x="12" y="150" className="vsd-cuthint-cap">1 · Zwei Punkte auf der Karte</text>

      {/* --- Pfeil --- */}
      <path d="M192 76 H226" stroke="var(--stone-400, #A89A7A)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M220 70 L227 76 L220 82" stroke="var(--stone-400, #A89A7A)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* --- rechts: der aufgeschnittene Luftraum --- */}
      <rect x="240" y="14" width="176" height="122" rx="14" fill="var(--cream-50, #FAF6EA)" stroke="var(--border-default, #E0D6BE)" />
      <path d="M240 118 C268 110 280 74 306 66 C332 58 348 34 376 28 L416 22 V118 Z" fill="url(#vsdHintSky)" />
      <path d="M240 118 C268 110 280 74 306 66 C332 58 348 34 376 28 L416 22" stroke="var(--steel-600, #3A6FA8)" strokeWidth="1.6" fill="none" />
      <path d="M240 136 V118 C268 110 280 74 306 66 C332 58 348 34 376 28 L416 22 V136 Z" fill="var(--sand-200, #E0D6BE)" fillOpacity="0.85" />
      {/* Windpfeile im aufgeschnittenen Luftraum */}
      <g stroke="var(--steel-600, #3A6FA8)" strokeWidth="1.5" strokeLinecap="round" opacity="0.75">
        <path d="M258 44 H286" /><path d="M280 40 L287 44 L280 48" />
        <path d="M300 32 H332" /><path d="M326 28 L333 32 L326 36" />
        <path d="M262 66 H282" /><path d="M277 62.5 L283 66 L277 69.5" />
      </g>
      <text x="248" y="150" className="vsd-cuthint-cap">2 · Der Luftraum darüber</text>
    </svg>
  );
}

// ---------------------------- Inversion (Desktop) ----------------------------
function InversionDesktop(ctx: DeckCtx) {
  const { section, data, deckLens, setDeckLens, location } = ctx;
  const inv = section?.inversion;
  const present = !!(section && inv && inv.present && inv.heightM != null);
  const heightM = inv?.heightM ?? 0, aboveC = inv?.aboveTempC ?? 0, valleyC = inv?.valleyTempC ?? 0, diffK = inv?.diffK ?? 0;
  return (
    <div className="vsd-center vsd-scroll">
      <div className="vsd-inv-head">
        <div>
          <div className="vsd-eyebrow">Inversion · Kaltluftsee</div>
          <div className="vsd-inv-title">{location?.name ?? 'Inntal'}{present ? ` · Nebelobergrenze ${fmtM(heightM)} m` : ''}</div>
        </div>
        <LensPills deckLens={deckLens} setDeckLens={setDeckLens} />
      </div>

      {section && present ? (
        <>
          <div className="vsd-inv-row">
            <div className="vsd-scene">
              <InversionScene section={section} heightM={heightM} />
              <div className="vsd-scene-rotate"><span><IconRotate /></span><span>drehen</span></div>
            </div>
            <div className="vsd-inv-cards">
              <div className="vsd-card">
                <div className="vsd-card-lab">Temperatur-Differenz</div>
                <div className="vsd-tdiff-row"><span>oberhalb ({fmtM(section.summit.terrainM)} m)</span><span className="vsd-tdiff-hi">{fmtSigned(aboveC)} °C</span></div>
                <div className="vsd-tdiff-row"><span>im Tal ({fmtM(section.valley.terrainM)} m)</span><span className="vsd-tdiff-lo">{fmtSigned(valleyC)} °C</span></div>
                <div className="vsd-card-rule" />
                <div className="vsd-tdiff-sum"><b>{diffK > 0 ? 'Aufstieg lohnt sich' : 'Kaum Unterschied'}</b><span className="k">{fmtSigned(Math.round(diffK))} K</span></div>
                <div className="vsd-tdiff-note">{diffK > 0 ? `Sonne & Wärme oberhalb ${fmtM(heightM)} m` : 'Temperaturprofil weitgehend ausgeglichen'}</div>
              </div>
              <div className="vsd-hint vsd-hint--amber">
                <span className="vsd-hint-ico">!</span>
                <div>
                  <div className="vsd-hint-title">{inv!.stable ? 'Stabile Inversion · Luftqualität' : 'Schwache Inversion'}</div>
                  <div className="vsd-hint-text">{inv!.note || 'Feinstaub reichert sich im Tal an. Frostgefahr in den Morgenstunden.'}</div>
                  <div className="vsd-hint-fine">Hinweis nicht verbindlich · ICON-D2 + DWD-Beobachtung</div>
                </div>
              </div>
              <div className="vsd-hint">
                <span className="vsd-hint-ico vsd-hint-ico--sq"><IconTriangle /></span>
                <div>
                  <div className="vsd-hint-title">Oberflächenreif möglich</div>
                  <div className="vsd-hint-text">An der Nebelobergrenze (~{fmtM(heightM)} m) — als Schwachschicht für Touren einplanen.</div>
                  <div className="vsd-hint-fine">nicht-verbindlicher Lawinen-Kontext</div>
                </div>
              </div>
            </div>
          </div>
          <InversionOverDay ctx={ctx} />
        </>
      ) : section ? (
        <div className="vsd-plot"><div className="vsd-plot-empty"><strong>Keine Inversion erkannt</strong><p>Zur gewählten Zeit ist die Grenzschicht durchmischt — kein Kaltluftsee. Scrubbe im Höhenwind-Zeitverlauf zu einer Morgen-/Nachtstunde, um eine Inversion zu sehen.</p></div></div>
      ) : (
        <div className="vsd-plot"><SectionPlaceholder data={data} onDraw={() => ctx.setDeckLens('hoehenwind')} /></div>
      )}
    </div>
  );
}

function InversionOverDay({ ctx }: { ctx: DeckCtx }) {
  const series = useMemo(() => {
    if (ctx.data.kind !== 'ready') return null;
    const p = ctx.data.prepared;
    const N = 14; const out: { t: number; h: number }[] = [];
    for (let i = 0; i < N; i++) {
      const t = p.startMs + ((p.endMs - p.startMs) * i) / (N - 1);
      const s = sectionAtTime(p, t);
      out.push({ t, h: s.inversion.present ? (s.inversion.heightM ?? 0) : 0 });
    }
    return out;
  }, [ctx.data]);
  if (!series) return null;
  const W = 820, H = 70, hMax = Math.max(1, ...series.map((s) => s.h)) * 1.15;
  const x = (i: number) => (W * i) / (series.length - 1);
  const y = (h: number) => 56 - (h / hMax) * 50;
  const line = series.map((s, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(0)} ${y(s.h).toFixed(0)}`).join(' ');
  const nowT = Math.min(Math.max(ctx.timeMs ?? series[0].t, series[0].t), series[series.length - 1].t);
  const nowI = (nowT - series[0].t) / (series[series.length - 1].t - series[0].t) * (series.length - 1);
  return (
    <div className="vsd-invday">
      <div className="vsd-invday-head">
        <span className="vsd-timedeck-lab">Inversionshöhe über den Tag</span>
        <span className="vsd-timedeck-when">{fmtDayTime(nowT)}</span>
      </div>
      <div className="vsd-invday-body">
        <span className="vsd-play" aria-hidden="true"><IconPlay /></span>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ flex: 1, height: 'auto' }} fontFamily="League Spartan">
          <path d={`${line} L ${W} ${H} L 0 ${H} Z`} fill="var(--vs-inv-line)" opacity="0.4" />
          <path d={line} fill="none" stroke="var(--steel-600)" strokeWidth="2" />
          <g transform={`translate(${x(nowI).toFixed(0)},${y(series[Math.round(nowI)].h).toFixed(0)})`}><circle r="7" fill="var(--terracotta-500)" /><circle r="3" fill="var(--cream-50)" /></g>
        </svg>
      </div>
    </div>
  );
}

// ---------------------------- Go/No-Go (Desktop) ----------------------------
function GoNoGoDesktop(ctx: DeckCtx) {
  const { data, deckLens, setDeckLens, cfg, setCfg, location } = ctx;
  const res = useMemo(() => (data.kind === 'ready' ? evaluateGoNoGo(data.prepared, cfg) : null), [data, cfg]);
  const prepared = data.kind === 'ready' ? data.prepared : null;

  return (
    <>
      <div className="vsd-dock vsd-dock--wide vsd-scroll">
        <div className="vsd-eyebrow">Betriebs-Check · Drohne</div>
        <div className="vsd-dock-title">Vermessungsflug · {location?.name ?? 'Feldberg-Süd'}</div>

        {res ? <GoNoGoHero res={res} prepared={prepared!} cfg={cfg} /> : (
          <div className="vsd-hero" style={{ borderColor: 'var(--border-default)', background: 'var(--cream-50)' }}>
            <div className="vsd-hero-sub" style={{ marginTop: 0 }}>Noch keine Schnittlinie — wechsle auf <b>Höhenwind</b> und zeichne eine Linie, dann werten wir Go/No-Go über den Tag aus.</div>
          </div>
        )}

        <div className="vsd-fh">
          <div className="vsd-pquery-lab">Flughöhe (AGL)</div>
          <div className="vsd-fh-body">
            <div className="vsd-fh-box"><input type="number" min={5} max={1500} value={cfg.heightAglM} onChange={(e) => setCfg({ ...cfg, heightAglM: clampNum(e.target.value, 5, 1500, cfg.heightAglM) })} aria-label="Flughöhe in Meter über Grund" /><span>m über Grund</span></div>
            <div className="vsd-fh-quick">
              <div className="vsd-fh-quick-lab">Schnellwahl</div>
              <div className="vsd-fh-quick-row">
                {[50, 120, 300].map((h) => (
                  <button key={h} className={`vsd-qbtn${cfg.heightAglM === h ? ' vsd-qbtn--active' : ''}`} onClick={() => setCfg({ ...cfg, heightAglM: h })}>{h} m</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="vsd-limits">
          <div className="vsd-pquery-lab">Eigene Grenzwerte · gespeichert</div>
          <div className="vsd-limits-rows">
            <div className="vsd-limit"><span>Böen-Limit</span><div><input type="number" min={5} max={200} value={cfg.gustLimitKmh} onChange={(e) => setCfg({ ...cfg, gustLimitKmh: clampNum(e.target.value, 5, 200, cfg.gustLimitKmh) })} aria-label="Böen-Limit km/h" /> <b style={{ fontWeight: 400, color: 'var(--stone-500)', fontSize: 12 }}>km/h</b></div></div>
            <ExtraLimit label="Mittelwind-Limit" unit="km/h" storeKey="mean" fallback={28} />
            <ExtraLimit label="Niederschlag" unit="mm" storeKey="precip" fallback={0} />
          </div>
        </div>
      </div>

      <div className="vsd-center vsd-scroll">
        <div className="vsd-inv-head"><div /><LensPills deckLens={deckLens} setDeckLens={setDeckLens} /></div>
        {res && prepared ? (
          <>
            <div className="vsd-sec-lab">Höhenfaktor-Profil · Wind nimmt mit der Höhe zu</div>
            <div className="vsd-panel"><HeightFactorChart res={res} cfg={cfg} /></div>
            <div className="vsd-hf-foot">
              <span>Bodenwert <b>{Math.round(res.groundGustKmh)} km/h</b></span>
              <span>Arbeitshöhe ({cfg.heightAglM} m) <b className={res.heightGustKmh > cfg.gustLimitKmh ? 'over' : ''}>{Math.round(res.heightGustKmh)} km/h</b></span>
              <span>Faktor <b>×{res.heightFactor.toFixed(1).replace('.', ',')}</b></span>
            </div>
            <div className="vsd-sec-lab">Go / No-Go über den Tag · {cfg.heightAglM} m AGL</div>
            <div className="vsd-panel"><GoNoGoBand res={res} prepared={prepared} /></div>
            <div className="vsd-info"><span className="vsd-ibadge">i</span><span>Auswertung enthält Ort, Zeit, Höhe, Werte, Grenzwert &amp; Status — als PDF/Link exportierbar. Modell ICON-D2, Gitterzellen ≈ 2 km.</span></div>
          </>
        ) : (
          <div className="vsd-plot"><SectionPlaceholder data={data} onDraw={() => setDeckLens('hoehenwind')} /></div>
        )}
      </div>
    </>
  );
}

function ExtraLimit({ label, unit, storeKey, fallback }: { label: string; unit: string; storeKey: string; fallback: number }) {
  const LS = `buscosun.vsd.limit.${storeKey}`;
  const [val, setVal] = useState<number>(() => { try { const r = localStorage.getItem(LS); return r != null ? Number(r) : fallback; } catch { return fallback; } });
  return (
    <div className="vsd-limit"><span>{label}</span><div><input type="number" value={val} onChange={(e) => { const n = Number(e.target.value); setVal(n); try { localStorage.setItem(LS, String(n)); } catch { /* ignore */ } }} aria-label={label} /> <b style={{ fontWeight: 400, color: 'var(--stone-500)', fontSize: 12 }}>{unit}</b></div></div>
  );
}

function GoNoGoHero({ res, prepared, cfg }: { res: ReturnType<typeof evaluateGoNoGo>; prepared: PreparedSection; cfg: GoNoGoConfig }) {
  const noGo = res.status === 'no-go';
  const nextGo = useMemo(() => {
    if (!noGo || !res.noGoWindows.length) return null;
    const w = res.noGoWindows.find((x) => x.startMs <= prepared.startMs + 1) ?? res.noGoWindows[0];
    return w.endMs;
  }, [res, prepared, noGo]);
  return (
    <div className={`vsd-hero${noGo ? '' : ' vsd-hero--go'}`}>
      <div className="vsd-hero-top">
        <span className="vsd-hero-badge">{noGo ? <IconOctagonX /> : <IconOctagonCheck />}</span>
        <div>
          <div className="vsd-hero-status">{noGo ? 'NO-GO' : 'GO'}</div>
          <div className="vsd-hero-sub">jetzt {fmtClock(prepared.startMs)} · {noGo ? 'Böen über Limit' : 'innerhalb aller Grenzwerte'}</div>
        </div>
      </div>
      <div className="vsd-hero-rule" />
      <div className="vsd-hero-metric"><span>Böen auf {cfg.heightAglM} m AGL</span><b className={noGo ? 'over' : ''}>{Math.round(res.gustNowKmh)} km/h</b></div>
      <div className="vsd-hero-metric"><span>dein Limit</span><b>{cfg.gustLimitKmh} km/h</b></div>
      {nextGo != null && (
        <div className="vsd-hero-window"><span className="vsd-hero-window-ic"><IconCheck /></span><span><b>Nächstes GO-Fenster:</b> ab {fmtClock(nextGo)}</span></div>
      )}
    </div>
  );
}

function HeightFactorChart({ res, cfg }: { res: ReturnType<typeof evaluateGoNoGo>; cfg: GoNoGoConfig }) {
  const W = 820, H = 300;
  const maxGust = Math.max(res.heightGustKmh, res.groundGustKmh, cfg.gustLimitKmh) * 1.15;
  const px = (g: number) => 46 + (758 - 46) * (g / maxGust);
  const limitX = px(cfg.gustLimitKmh);
  // Höhenkurve: Boden (~10m) → Arbeitshöhe → 300m (Referenz oben).
  const groundY = 244, workY = 128, topY = 26;
  const groundX = px(res.groundGustKmh), workX = px(res.heightGustKmh);
  const topGust = res.groundGustKmh * Math.pow(300 / 10, 0.2);
  const topX = px(topGust);
  const overLimit = res.heightGustKmh > cfg.gustLimitKmh;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} fontFamily="League Spartan">
      <rect x="46" y="14" width="758" height="230" rx="10" fill="#fff" stroke="var(--border-default)" />
      <g stroke="var(--sand-100)"><line x1="46" y1="71" x2="804" y2="71" /><line x1="46" y1="128" x2="804" y2="128" /><line x1="46" y1="186" x2="804" y2="186" /></g>
      <g fill="var(--stone-400)" fontSize="10" textAnchor="end"><text x="40" y="18">300 m</text><text x="40" y="132">{cfg.heightAglM} m</text><text x="40" y="247">Boden</text></g>
      <line x1={limitX} y1="14" x2={limitX} y2="244" stroke="var(--vs-danger)" strokeWidth="1.5" strokeDasharray="5 4" />
      <text x={limitX + 6} y="26" fontSize="10" fontWeight="700" fill="var(--vs-danger)">Limit {cfg.gustLimitKmh} km/h</text>
      <path d={`M ${groundX} ${groundY} Q ${(groundX + workX) / 2} ${(groundY + workY) / 2} ${workX} ${workY} Q ${(workX + topX) / 2} ${(workY + topY) / 2} ${topX} ${topY}`} fill="none" stroke="var(--steel-600)" strokeWidth="2.6" strokeLinecap="round" />
      <g fill="var(--steel-600)"><circle cx={groundX} cy={groundY} r="4" /><circle cx={workX} cy={workY} r="6" stroke="var(--cream-50)" strokeWidth="2" /><circle cx={topX} cy={topY} r="4" /></g>
      <g transform={`translate(${Math.min(workX + 10, 600)},110)`}><rect x="0" y="-16" width="168" height="20" rx="10" fill={overLimit ? 'var(--terracotta-500)' : 'var(--sage-600)'} /><text x="84" y="-2" fontSize="10" fontWeight="700" fill="var(--cream-50)" textAnchor="middle">{cfg.heightAglM} m · {Math.round(res.heightGustKmh)} km/h · {overLimit ? 'über Limit' : 'ok'}</text></g>
      <g fontSize="10" fill="var(--stone-600)"><text x={groundX} y="264" textAnchor="middle">Boden {Math.round(res.groundGustKmh)}</text><text x={topX} y="264" textAnchor="middle">300 m · {Math.round(topGust)} km/h</text></g>
    </svg>
  );
}

function GoNoGoBand({ res, prepared }: { res: ReturnType<typeof evaluateGoNoGo>; prepared: PreparedSection }) {
  const total = prepared.endMs - prepared.startMs || 1;
  // Segmente aus No-Go-Fenstern über die volle Zeitachse.
  const segs: Array<{ w: number; nogo: boolean; label: string }> = [];
  let cursor = prepared.startMs;
  const wins = [...res.noGoWindows].sort((a, b) => a.startMs - b.startMs);
  for (const w of wins) {
    if (w.startMs > cursor) segs.push({ w: (w.startMs - cursor) / total, nogo: false, label: 'GO' });
    segs.push({ w: (Math.min(w.endMs, prepared.endMs) - w.startMs) / total, nogo: true, label: 'NO-GO' });
    cursor = Math.min(w.endMs, prepared.endMs);
  }
  if (cursor < prepared.endMs) segs.push({ w: (prepared.endMs - cursor) / total, nogo: false, label: `GO ab ${fmtClock(cursor)}` });
  if (!segs.length) segs.push({ w: 1, nogo: false, label: 'GO · ganzer Tag' });
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => fmtClock(prepared.startMs + f * total));
  return (
    <>
      <div className="vsd-band">
        {segs.map((s, i) => (
          <div key={i} className={`vsd-band-seg vsd-band-seg--${s.nogo ? 'nogo' : 'go'}`} style={{ width: `${Math.max(2, s.w * 100)}%` }}><span>{s.w > 0.08 ? s.label : ''}</span></div>
        ))}
      </div>
      <div className="vsd-band-ticks">{ticks.map((t, i) => <span key={i} className={i === 0 ? '' : ''}>{t}</span>)}</div>
      <div className="vsd-band-legend">
        <div className="vsd-band-legend-item"><span className="vsd-band-legend-sw" style={{ background: 'var(--sage-600)' }} /><span>GO · innerhalb aller Grenzwerte</span></div>
        <div className="vsd-band-legend-item"><span className="vsd-band-legend-sw" style={{ background: 'var(--vs-nogo-band)' }} /><span>NO-GO · mind. ein Grenzwert überschritten</span></div>
      </div>
    </>
  );
}

// ---------------------------- Erhaltene Linsen (Föhn/Thermik) ----------------
function PreservedHost({ deckLens, setDeckLens }: DeckCtx) {
  const { lens } = useAtmosphere();
  return (
    <div className="vsd-center vsd-scroll vsd-host">
      <div className="vsd-inv-head"><div><div className="vsd-eyebrow">{lens === 'fly' ? 'Thermik' : 'Föhn'}</div></div><LensPills deckLens={deckLens} setDeckLens={setDeckLens} /></div>
      <div className="atm-grid" style={{ maxWidth: 1100 }}>
        <AtmosphereVerdict />
        {lens === 'fly' ? <ThermalMap /> : <FoehnPanel />}
        <AtmosphereProfile />
        <DeckNerd />
      </div>
      <DeckScrubber />
    </div>
  );
}

function DeckNerd() {
  const { nerdOpen, setNerdOpen } = useAtmosphere();
  return (
    <section className="rt-card atm-nerd" aria-label="Detailansicht">
      <button type="button" className="atm-nerd-toggle" aria-expanded={nerdOpen} onClick={() => setNerdOpen(!nerdOpen)}>
        {nerdOpen ? '▾' : '▸'} Werte anzeigen (Detailansicht)
      </button>
      {nerdOpen && <Suspense fallback={<div className="atm-nerd-body">Detailansicht wird geladen …</div>}><NerdPanel /></Suspense>}
    </section>
  );
}

function DeckScrubber() {
  const { hour, setHour } = useAtmosphere();
  return (
    <div className="atm-scrub" style={{ maxWidth: 1100 }}>
      <div className="atm-scrub-track">
        <input type="range" className="atm-scrub-range" min={HOUR_MIN} max={HOUR_MAX} step={1} value={hour} onChange={(e) => setHour(Number(e.target.value))} aria-label="Vorhersage-Vorlaufstunde" />
      </div>
      <span className="atm-scrub-label"><span className="atm-scrub-time">+{hour} h</span></span>
      <span className="atm-scrub-end">+48h</span>
    </div>
  );
}

// ============================ Mobile ============================
function MobileDeck(ctx: DeckCtx) {
  const { deckLens, setDeckLens, onBack, location } = ctx;
  const titles: Record<DeckLens, { eyebrow: string; title: string }> = {
    hoehenwind: { eyebrow: '3D-Wetter · Schnitt', title: location?.name ?? 'Schnittlinie' },
    inversion: { eyebrow: 'Inversion · Kaltluftsee', title: location?.name ?? 'Inntal' },
    gonogo: { eyebrow: 'Betriebs-Check · Drohne', title: location?.name ?? 'Feldberg-Süd' },
    foehn: { eyebrow: 'Föhn', title: location?.name ?? 'Atmosphäre' },
    thermik: { eyebrow: 'Thermik', title: location?.name ?? 'Atmosphäre' },
  };
  const t = titles[deckLens];
  return (
    <div className="vsd-m-root">
      <div className="vsd-m-header">
        <div className="vsd-m-brandrow">
          <img src="/buscosun-mark.svg" width={22} height={22} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} onClick={onBack} />
          <div className="vsd-m-htext"><div className="vsd-m-eyebrow">{t.eyebrow}</div><div className="vsd-m-title">{t.title}</div></div>
        </div>
        {deckLens === 'gonogo' ? <button className="vsd-m-share">Teilen</button> : <button className="vsd-m-back" onClick={onBack} aria-label="Zurück"><IconRailMap /></button>}
      </div>
      <div className="vsd-m-tabs" role="tablist" aria-label="Linse">
        {(['hoehenwind', 'inversion', 'gonogo', 'foehn', 'thermik'] as DeckLens[]).map((l) => (
          <button key={l} role="tab" aria-selected={deckLens === l} className={`vsd-m-tab${deckLens === l ? ' vsd-m-tab--active' : ''}`} onClick={() => setDeckLens(l)}>{mLensLabel(l)}</button>
        ))}
      </div>
      <div className="vsd-m-scroll vsd-scroll">
        {deckLens === 'hoehenwind' && <HoehenwindMobile {...ctx} />}
        {deckLens === 'inversion' && <InversionMobile {...ctx} />}
        {deckLens === 'gonogo' && <GoNoGoMobile {...ctx} />}
        {(deckLens === 'foehn' || deckLens === 'thermik') && <MobilePreserved />}
      </div>
    </div>
  );
}

function mLensLabel(l: DeckLens): string {
  return l === 'hoehenwind' ? 'Höhenwind' : l === 'inversion' ? 'Inversion' : l === 'gonogo' ? 'Go/No-Go' : l === 'foehn' ? 'Föhn' : 'Thermik';
}

function HoehenwindMobile(ctx: DeckCtx) {
  const { data, section, timeMs, setTimeMs, picked, setPicked } = ctx;
  const { cutPoints, setCutPoints, sectionLayers, location } = useAtmosphere();
  const center = location ? { lat: location.lat, lon: location.lon } : { lat: 47.42, lon: 10.98 };
  return (
    <>
      {section ? (
        <div className="vsd-plot" style={{ padding: 12 }}>
          <SectionChart section={section} layers={sectionLayers} picked={picked} onPick={setPicked} portrait />
        </div>
      ) : (
        <div className="vsd-plot" style={{ padding: 0, overflow: 'hidden', height: 300 }}>
          <ThreeDMap center={center} points={cutPoints} onChange={setCutPoints} />
        </div>
      )}
      {!section && <p className="vsd-m-caption">Tippe zwei Punkte auf der Karte, um den Höhenwind-Geländeschnitt zu berechnen.</p>}
      <div className="vsd-legend" style={{ gap: 8 }}>
        {BAND_COLORS.slice(1).map((c, i) => (<div key={c} className="vsd-legend-item"><span className="vsd-legend-sw" style={{ width: 16, height: 8, background: c }} /><span>{BAND_LABELS[i + 1]}</span></div>))}
      </div>
      <div className="vsd-card">
        <div className="vsd-card-lab">{picked ? `Punkt · ${Math.round(picked.levelM)} m · ${Math.round(picked.agl)} m AGL` : 'Punkt-Abfrage'}</div>
        {picked ? (
          <div className="vsd-m-pgrid">
            <div><div className="vsd-m-pgrid-lab">Mittelwind</div><div className="vsd-m-pgrid-val" style={{ color: 'var(--terracotta-500)' }}>{Math.round(picked.windKmh)} km/h</div></div>
            <div><div className="vsd-m-pgrid-lab">Böen</div><div className="vsd-m-pgrid-val" style={{ color: 'var(--vs-danger)' }}>{Math.round(picked.gustKmh)} km/h</div></div>
            <div><div className="vsd-m-pgrid-lab">Richtung</div><div className="vsd-m-pgrid-val">{compass(picked.windDirDeg)}</div></div>
            <div><div className="vsd-m-pgrid-lab">Temperatur</div><div className="vsd-m-pgrid-val">{fmtTemp(picked.tempC)} °C</div></div>
          </div>
        ) : <div className="vsd-pquery-empty">Tippe in den Schnitt für Werte an einem Punkt.</div>}
      </div>
      {section && <TimeDeck data={data} timeMs={timeMs} setTimeMs={setTimeMs} />}
      <p className="vsd-m-caption">Wind auf AGL aus ICON-D2-Druckflächen + DEM · Gitterzellen ≈ 2 km · werbefrei.</p>
    </>
  );
}

function InversionMobile(ctx: DeckCtx) {
  const { section, data } = ctx;
  const inv = section?.inversion;
  const present = !!(section && inv && inv.present && inv.heightM != null);
  if (section && !present) return <div className="vsd-plot"><div className="vsd-plot-empty"><strong>Keine Inversion erkannt</strong><p>Zur gewählten Zeit ist die Grenzschicht durchmischt — kein Kaltluftsee.</p></div></div>;
  if (!section || !present) return <div className="vsd-plot"><SectionPlaceholder data={data} onDraw={() => ctx.setDeckLens('hoehenwind')} /></div>;
  const heightM = inv!.heightM ?? 0, aboveC = inv!.aboveTempC ?? 0, valleyC = inv!.valleyTempC ?? 0, diffK = inv!.diffK ?? 0;
  return (
    <>
      <div className="vsd-scene" style={{ height: 220 }}><InversionScene section={section} heightM={heightM} /></div>
      <div className="vsd-card">
        <div className="vsd-card-lab">Temperatur-Differenz</div>
        <div className="vsd-tdiff-row"><span>oberhalb {fmtM(section.summit.terrainM)} m</span><b style={{ color: 'var(--amber-500)' }}>{fmtSigned(aboveC)} °C</b></div>
        <div className="vsd-tdiff-row"><span>im Tal {fmtM(section.valley.terrainM)} m</span><b style={{ color: 'var(--vs-valley)' }}>{fmtSigned(valleyC)} °C</b></div>
        <div className="vsd-card-rule" />
        <div className="vsd-tdiff-sum"><b>{diffK > 0 ? 'Aufstieg lohnt sich' : 'Kaum Unterschied'}</b><span className="k" style={{ fontSize: 24 }}>{fmtSigned(Math.round(diffK))} K</span></div>
      </div>
      <div className="vsd-hint vsd-hint--amber">
        <span className="vsd-hint-ico">!</span>
        <div><div className="vsd-hint-title">{inv!.stable ? 'Stabile Inversion · Luftqualität' : 'Schwache Inversion'}</div><div className="vsd-hint-text">{inv!.note || 'Feinstaub im Tal · Frost bis ~09:00. Oberflächenreif an der Nebelobergrenze (Lawinen-Kontext, nicht verbindlich).'}</div></div>
      </div>
      <InversionOverDay ctx={ctx} />
    </>
  );
}

function GoNoGoMobile(ctx: DeckCtx) {
  const { data, cfg, setCfg } = ctx;
  const res = useMemo(() => (data.kind === 'ready' ? evaluateGoNoGo(data.prepared, cfg) : null), [data, cfg]);
  const prepared = data.kind === 'ready' ? data.prepared : null;
  if (!res || !prepared) return <div className="vsd-plot"><SectionPlaceholder data={data} onDraw={() => ctx.setDeckLens('hoehenwind')} /></div>;
  return (
    <>
      <GoNoGoHero res={res} prepared={prepared} cfg={cfg} />
      <div className="vsd-fh">
        <div className="vsd-pquery-lab">Flughöhe (AGL)</div>
        <div className="vsd-fh-body">
          <div className="vsd-fh-box"><input type="number" value={cfg.heightAglM} onChange={(e) => setCfg({ ...cfg, heightAglM: clampNum(e.target.value, 5, 1500, cfg.heightAglM) })} aria-label="Flughöhe" style={{ width: 46, fontSize: 22 }} /><span>m</span></div>
          {[50, 120, 300].map((h) => <button key={h} className={`vsd-qbtn${cfg.heightAglM === h ? ' vsd-qbtn--active' : ''}`} onClick={() => setCfg({ ...cfg, heightAglM: h })}>{h}</button>)}
        </div>
      </div>
      <div className="vsd-sec-lab" style={{ marginTop: 4 }}>Go / No-Go über den Tag · {cfg.heightAglM} m</div>
      <GoNoGoBand res={res} prepared={prepared} />
      <div className="vsd-sec-lab">Höhenfaktor · Wind ↑ mit Höhe</div>
      <div className="vsd-panel"><HeightFactorChart res={res} cfg={cfg} /></div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="vsd-toppill" style={{ flex: 1, justifyContent: 'center' }}><IconDownload /> PDF</button>
        <button className="vsd-toppill vsd-toppill--primary" style={{ flex: 1, justifyContent: 'center' }}><IconShare /> Link teilen</button>
      </div>
      <p className="vsd-m-caption">Export enthält Ort, Zeit, Höhe, Werte, Grenzwert &amp; Status. Modell ICON-D2 · Gitterzellen ≈ 2 km.</p>
    </>
  );
}

function MobilePreserved() {
  const { lens } = useAtmosphere();
  return (
    <div className="vsd-host">
      <AtmosphereVerdict />
      <div style={{ height: 12 }} />
      {lens === 'fly' ? <ThermalMap /> : <FoehnPanel />}
      <div style={{ height: 12 }} />
      <AtmosphereProfile />
      <DeckNerd />
      <DeckScrubber />
    </div>
  );
}

// ---------------------------- Shared bits ----------------------------
function TimeDeck({ data, timeMs, setTimeMs }: { data: DataState; timeMs: number | null; setTimeMs: DeckCtx['setTimeMs'] }) {
  const playRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const range = data.kind === 'ready' ? { s: data.prepared.startMs, e: data.prepared.endMs } : null;
  useEffect(() => () => { if (playRef.current) window.clearInterval(playRef.current); }, []);
  const toggle = () => {
    if (!range) return;
    if (playing) { if (playRef.current) window.clearInterval(playRef.current); setPlaying(false); return; }
    setPlaying(true);
    playRef.current = window.setInterval(() => {
      setTimeMs((prev) => { const cur = prev ?? range.s; const next = cur + 15 * 60_000; return next > range.e ? range.s : next; });
    }, 700);
  };
  const now = timeMs ?? range?.s ?? 0;
  const pct = range ? ((now - range.s) / (range.e - range.s || 1)) * 100 : 32;
  const ticks = range ? [0, 0.25, 0.5, 0.75, 1].map((f) => fmtClock(range.s + f * (range.e - range.s))) : ['06:00', '09:00', '12:00', '16:00', '20:00'];
  return (
    <div className="vsd-timedeck">
      <div className="vsd-timedeck-head"><span className="vsd-timedeck-lab">Zeitverlauf · 15-Min-Raster</span><span className="vsd-timedeck-when">{range ? fmtDayTime(now) : '—'}</span></div>
      <div className="vsd-timedeck-row">
        <button className="vsd-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Abspielen'}>{playing ? <IconPause /> : <IconPlay />}</button>
        <div className="vsd-track">
          <input type="range" min={range ? range.s : 0} max={range ? range.e : 100} step={15 * 60_000} value={now} disabled={!range}
            onChange={(e) => setTimeMs(Number(e.target.value))} aria-label="Zeitpunkt" style={{ ['--pct' as string]: `${pct}%` } as CSSProperties} />
        </div>
        <span className="vsd-timedeck-end">+48 h</span>
      </div>
      <div className="vsd-timedeck-ticks">{ticks.map((t, i) => <span key={i}>{t}</span>)}</div>
    </div>
  );
}

/** Kartenschematik im Dock (nicht-interaktiv) — reproduziert die Vorlage. */
function DockMapSchematic({ points }: { points: number }) {
  return (
    <svg viewBox="0 0 300 220" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <g opacity=".4" fill="none" stroke="var(--stone-500)" strokeWidth="0.8">
        <path d="M20 150 Q90 135 150 140 Q220 145 280 135" /><path d="M25 120 Q95 100 160 108 Q225 116 280 104" /><path d="M40 90 Q110 70 165 78 Q220 86 270 76" />
      </g>
      <ellipse cx="230" cy="160" rx="34" ry="18" fill="var(--steel-600)" fillOpacity=".3" />
      {points >= 1 && <>
        <line x1="55" y1="170" x2="140" y2="90" stroke="var(--terracotta-500)" strokeWidth="3" /><line x1="140" y1="90" x2="240" y2="155" stroke="var(--terracotta-500)" strokeWidth="3" />
        <circle cx="55" cy="170" r="7" fill="var(--cream-50)" stroke="var(--terracotta-500)" strokeWidth="3" /><circle cx="140" cy="90" r="6" fill="var(--terracotta-500)" /><circle cx="240" cy="155" r="7" fill="var(--cream-50)" stroke="var(--terracotta-500)" strokeWidth="3" />
      </>}
    </svg>
  );
}

/** Inversions-Szene (3D-Kaltluftsee) — reproduziert die Vorlage mit echten Werten. */
function InversionScene({ section, heightM }: { section: CrossSection; heightM: number }) {
  return (
    <svg viewBox="0 0 900 480" preserveAspectRatio="xMidYMid slice">
      <circle cx="740" cy="110" r="70" fill="var(--vs-sun-halo)" opacity=".35" /><circle cx="740" cy="110" r="24" fill="var(--vs-sun)" />
      <path d="M120 480 L120 200 Q200 120 300 200 Q360 260 420 220 L420 480 Z" fill="var(--vs-ridge-2)" opacity=".96" />
      <path d="M300 480 L300 150 Q400 80 500 150 Q560 210 620 175 L620 480 Z" fill="var(--vs-ridge-2)" opacity=".96" />
      <path d="M520 480 L520 175 Q640 95 760 175 Q820 230 880 200 L880 480 Z" fill="var(--vs-ridge-3)" opacity=".96" />
      <path d="M250 300 L640 300 L560 210 L330 210 Z" fill="var(--vs-coldpool)" opacity=".6" />
      <path d="M250 300 L640 300" stroke="var(--cream-50)" strokeWidth="2" opacity=".8" />
      <g transform="translate(445,300)"><rect x="-90" y="0" width="180" height="20" rx="10" fill="var(--steel-600)" /><text y="14" fontSize="11" fontWeight="700" fill="var(--cream-50)" textAnchor="middle">Inversion {fmtM(heightM)} m ü. NN</text></g>
      <g transform="translate(300,150)"><circle r="12" fill="var(--amber-500)" /><circle r="5" fill="var(--cream-50)" /></g>
      <g transform="translate(300,118)"><rect x="-66" y="-14" width="132" height="18" rx="9" fill="var(--amber-500)" /><text y="-1" fontSize="9.5" fontWeight="700" fill="var(--cream-50)" textAnchor="middle">über Inversion · sonnig</text></g>
      <text x="300" y="182" fontSize="10" fontWeight="600" fill="var(--ink-900)" textAnchor="middle">{section.summit.label} {fmtM(section.summit.terrainM)} m</text>
      <g transform="translate(440,360)"><circle r="10" fill="var(--vs-valley)" /></g>
      <g transform="translate(440,330)"><rect x="-64" y="-14" width="128" height="18" rx="9" fill="var(--vs-valley)" /><text y="-1" fontSize="9.5" fontWeight="700" fill="var(--cream-50)" textAnchor="middle">im Kaltluftsee · Nebel</text></g>
      <text x="440" y="384" fontSize="10" fontWeight="600" fill="var(--cream-50)" textAnchor="middle">{section.valley.label} {fmtM(section.valley.terrainM)} m</text>
    </svg>
  );
}

function LocationChip() {
  const { location, setLocation } = useAtmosphere();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const acRef = useRef<AbortController | null>(null);
  async function search() {
    const q = query.trim(); if (!q) return;
    acRef.current?.abort(); const ac = new AbortController(); acRef.current = ac;
    try { const f = await geocodeDACH(q, ac.signal); if (ac.signal.aborted) return; if (f.length === 1) setLocation(f[0]); else setResults(f); } catch { /* ignore */ }
  }
  if (location) {
    return (
      <div className="vsd-loc">
        <span className="vsd-loc-flag" aria-hidden="true">{flagForCountry(location.country)}</span>
        <span className="vsd-loc-name">{location.name}</span>
        <button className="vsd-loc-change" onClick={() => { setLocation(null); setResults([]); setQuery(''); }}>Ändern</button>
      </div>
    );
  }
  return (
    <div className="vsd-topsearch" style={{ position: 'relative' }}>
      <input placeholder="Ort suchen …" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void search(); }} aria-label="Ort suchen" />
      <button className="vsd-topsearch-go" onClick={() => void search()}>Suchen</button>
      {results.length > 0 && (
        <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border-default)', borderRadius: 10, zIndex: 20, overflow: 'hidden' }}>
          {results.slice(0, 6).map((r, i) => (
            <button key={i} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', borderTop: i ? '1px solid var(--sand-100)' : 'none', cursor: 'pointer', font: 'inherit', fontSize: 13 }} onClick={() => { setLocation(r); setResults([]); }}>
              {flagForCountry(r.country)} {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TourPill() {
  const { setLocation, setCutPoints } = useAtmosphere();
  const fileRef = useRef<HTMLInputElement | null>(null);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    try {
      const tour = await tourFileToCutLine(f);
      const s = tour.points[0];
      setLocation({ name: tour.name, lat: s.lat, lon: s.lon, country: pickCountry(s.lat, s.lon) });
      setCutPoints(tour.points);
    } catch { /* ignore */ }
  }
  return (
    <button className="vsd-map-tour" onClick={() => fileRef.current?.click()}>
      <input ref={fileRef} type="file" accept=".gpx,.tcx,.fit,.kml,.kmz" style={{ display: 'none' }} onChange={onFile} />
      <IconRoute /><span>Gespeicherte Tour als Schnittlinie übernehmen</span>
    </button>
  );
}

// ---------------------------- Helpers ----------------------------
const compass = (deg: number) => ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(((deg % 360) / 22.5)) % 16];
const fmtTemp = (c: number) => (Math.round(c * 10) / 10).toFixed(1).replace('.', ',');
const fmtSigned = (c: number) => (c > 0 ? '+' : c < 0 ? '−' : '') + Math.abs(Math.round(c * 10) / 10).toFixed(c % 1 === 0 ? 0 : 1).replace('.', ',');
const fmtM = (m: number) => Math.round(m).toLocaleString('de-DE');
const clampNum = (v: string, lo: number, hi: number, fb: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb; };
const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtClock = (ms: number) => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const fmtDayTime = (ms: number) => { const d = new Date(ms); const wd = d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', ''); return `${wd} ${d.getDate()}. ${d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')} · ${pad2(d.getHours())}:${pad2(d.getMinutes())} Uhr`; };

// ---------------------------- Icons (aus der Vorlage) ----------------------------
function IconRailMap() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M12 3 L21 8 L12 13 L3 8 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M3 13 L12 18 L21 13" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>; }
function IconPlay() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5 L19 12 L7 19 Z" /></svg>; }
function IconPause() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>; }
function IconOctagonX() { return <svg width="48" height="48" viewBox="0 0 48 48"><path d="M12 0 L36 0 L48 12 L48 36 L36 48 L12 48 L0 36 L0 12 Z" fill="var(--vs-danger)" /><line x1="16" y1="16" x2="32" y2="32" stroke="var(--cream-50)" strokeWidth="4" strokeLinecap="round" /><line x1="32" y1="16" x2="16" y2="32" stroke="var(--cream-50)" strokeWidth="4" strokeLinecap="round" /></svg>; }
function IconOctagonCheck() { return <svg width="48" height="48" viewBox="0 0 48 48"><path d="M12 0 L36 0 L48 12 L48 36 L36 48 L12 48 L0 36 L0 12 Z" fill="var(--sage-600)" /><path d="M14 24 L21 31 L34 17" stroke="var(--cream-50)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>; }
function IconCheck() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 13 L10 18 L19 6" stroke="var(--cream-50)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconDownload() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 4 V15 M8 12 L12 16 L16 12 M6 20 H18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IconShare() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.6" /><circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" /><circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.6" /><line x1="8.6" y1="10.5" x2="15.4" y2="6.5" stroke="currentColor" strokeWidth="1.6" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" stroke="currentColor" strokeWidth="1.6" /></svg>; }
function IconRotate() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M8 12 A8 8 0 1 1 10 17" stroke="var(--stone-600)" strokeWidth="1.6" fill="none" /><path d="M10 13 L10 18 L5 17 Z" fill="var(--stone-600)" /></svg>; }
function IconTriangle() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 20 L12 6 L18 20 Z" stroke="var(--vs-valley)" strokeWidth="1.6" strokeLinejoin="round" /></svg>; }
function IconRoute() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 4 H14 L18 8 V20 H6 Z" stroke="var(--steel-600)" strokeWidth="1.5" strokeLinejoin="round" /></svg>; }
