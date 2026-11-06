/**
 * Vertikalschnitt / 3D-Wetter — „Command-Deck" (hell).
 *
 * Aufbau wie Wetterkarte und Brandradar: Topbar · Rail · linke Funktionsleiste
 * (Ansichten, Ebenen, Schnittlinie — Zeilen mit Icon und Schalter)
 * · Bühne. Ablauf für den Anwender: Ort (Intro) → Karte mit Schnitt-Anleitung →
 * nach dem zweiten Punkt öffnet sich der Schnitt von selbst.
 *
 * Die Schnitt-Ansicht Höhenwind speist sich aus
 * EINEM vorbereiteten Vertikalschnitt (prepareCrossSection → sectionAtTime →
 * CrossSection). Keine erfundenen
 * Daten: ohne Schnittlinie die Karte mit Anleitung statt Fake-Werte.
 * Funktionserhalt: SectionChart bleibt verdrahtet.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Location } from '../types';
import { geocodeDACH, flagForCountry } from '../geocode';
import { tourFileToCutLine } from '../threed/tourImport';
import { pickCountry } from '../pointForecast/clustering';
import { useAtmosphere } from './atmosphereStore';
import ThreeDMap from '../threed/ThreeDMap';
import SectionChart, { BAND_COLORS, BAND_LABELS, type PickedPoint } from '../threed/SectionChart';
import {
  prepareCrossSection, sectionAtTime, sectionOrigin, SECTION_ANCHORS, sectionMethod, type PreparedSection, type PrepareProgress,
} from '../threed/buildCrossSection';
import { SECTION_LEVEL_STEP_M } from '../threed/crossSection';
import type { CrossSection } from '../threed/crossSection';
import type { ThreeDLayers } from '../threed/threedState';
import { useIsMobile } from '../mobile/useIsMobile';
import '../threed/threed.css';
import './atmosphere.css';
import './atmosphereDeck.css';
import { FeatureRail, type RailFeature } from '../nav/featureRail';
// SH3: der Teilen-Knopf ersetzt die drei Attrappen, die hier bisher ohne onClick standen (V-SH-1).
import ShareButton from '../share/ShareButton';

/** Deck-Linse: nur noch der Höhenwind-Schnitt. */
type DeckLens = 'hoehenwind';

/** Unteransichten der Querschnitt-Linse (Router RT1: `?ansicht=`; `hoehenwind` = Default, wird nicht geschrieben). */
export type DeckSub = 'hoehenwind';

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
  const { lens, setLens, location, cutPoints } = useAtmosphere();
  // Das Deck zeigt nur noch den Schnitt: alte Linsen (Föhn, Thermik) aus Link oder Speicher auf den Schnitt setzen.
  useEffect(() => { if (lens !== 'section') setLens('section'); }, [lens, setLens]);
  void initialSub; // alte Unteransichten (Inversion, Go/No-Go) gibt es nicht mehr — alte Links landen im Höhenwind
  const [sub, setSub] = useState<DeckSub>('hoehenwind');
  // Router (RT1): Unterlinse ⇒ `?ansicht=` (replace, kein History-Eintrag).
  const onSubChangeRef = useRef(onSubChange);
  onSubChangeRef.current = onSubChange;
  useEffect(() => { onSubChangeRef.current?.(sub); }, [sub]);
  // Zurueck/Vorwaerts: Unterlinse aus der URL uebernehmen (E7; setLens macht der Store).
  void routeSub;
  const deckLens: DeckLens = sub;
  const setDeckLens = (l: DeckLens) => { setLens('section'); setSub(l); };

  const sectionData = useSectionData();
  // Ablauf: ohne Linie die Karte mit Anleitung; sobald die Linie steht (zweiter
  // Punkt, Tour-Import oder Permalink), öffnet sich der Schnitt von selbst.
  // „Karte" in der Bühne holt die Linie zum Bearbeiten zurück.
  const [editing, setEditing] = useState(false);
  const prevCutRef = useRef(cutPoints.length);
  useEffect(() => {
    const prev = prevCutRef.current;
    prevCutRef.current = cutPoints.length;
    if (cutPoints.length >= 2 && prev < 2) setEditing(false);
  }, [cutPoints]);
  const isSection = deckLens === 'hoehenwind';
  const hasCut = cutPoints.length >= 2;
  const mapOpen = isSection && (!hasCut || editing);

  const [picked, setPicked] = useState<PickedPoint | null>(null);

  const ctx: DeckCtx = {
    deckLens, setDeckLens, ...sectionData, picked, setPicked, onBack, onOpenFeature, location,
    isSection, hasCut, mapOpen, openMap: () => setEditing(true), openSection: () => setEditing(false),
  };

  if (isMobile) return <MobileDeck {...ctx} />;
  return <DesktopDeck {...ctx} />;
}

type DeckCtx = {
  deckLens: DeckLens; setDeckLens: (l: DeckLens) => void;
  data: DataState; section: CrossSection | null; timeMs: number | null; setTimeMs: (v: number | ((p: number | null) => number | null)) => void;
  picked: PickedPoint | null; setPicked: (p: PickedPoint | null) => void;
  onBack: () => void; onOpenFeature?: (id: RailFeature) => void; location: Location | null;
  /** Höhenwind (braucht die Schnittlinie). */
  isSection: boolean;
  /** Schnittlinie mit mindestens zwei Punkten. */
  hasCut: boolean;
  /** Bühne zeigt die Karte zum Zeichnen/Bearbeiten der Linie. */
  mapOpen: boolean;
  openMap: () => void; openSection: () => void;
};

// ============================ Desktop / Tablet ============================
/** Herkunft des Schnitts für Texte (V-FR-10): erst mit Daten der Stand, der gerechnet hat; vorher nur die Marke. */
const dataOrigin = (d: DataState): string => sectionOrigin(d.kind === 'ready' ? d.prepared : null);
const hhmm = (ms: number): string => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

function DesktopDeck(ctx: DeckCtx) {
  const { deckLens, onBack, onOpenFeature, data, mapOpen } = ctx;
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
          <div className="vsd-live"><span className="vsd-live-dot" /><span className="vsd-live-txt">{data.kind === 'ready' ? `${dataOrigin(data)} · ${hhmm(data.prepared.runAtMs)} Uhr` : dataOrigin(data)}</span></div>
          {/* SH3: Teilen steht in JEDER Linse — vorher gab es den Knopf (als
              Attrappe ohne onClick) nur im Arbeitsfenster, und auf allen anderen
              Ansichten war die Seite gar nicht teilbar. */}
          <ShareButton className="vsd-share" text="Link teilen" />
        </div>
      </div>
      <div className="vsd-body">
        <Rail onBack={onBack} onOpenFeature={onOpenFeature} />
        <aside className="vsd-side vsd-scroll" aria-label="Atmosphäre-Funktionen">
          <SidePanel ctx={ctx} />
        </aside>
        <main className="vsd-center vsd-scroll">
          {mapOpen ? <CutStage {...ctx} /> : (
            <>
              {deckLens === 'hoehenwind' && <HoehenwindDesktop {...ctx} />}
            </>
          )}
        </main>
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

// ============================ Funktionsleiste (links) ============================
const VIEW_META: Record<DeckLens, { label: string; sub: string; icon: () => ReactNode }> = {
  hoehenwind: { label: 'Höhenwind', sub: 'Wind & Böen im Querschnitt', icon: IconViewWind },
};

const SECTION_VIEWS: DeckLens[] = ['hoehenwind'];

const LAYER_ROWS: Array<{ key: keyof ThreeDLayers; label: string; sub: string; icon: () => ReactNode }> = [
  { key: 'mean', label: 'Mittelwind', sub: 'Farbflächen · Pfeile', icon: IconLayerMean },
  { key: 'gust', label: 'Böen', sub: 'Pfeile gestrichelt', icon: IconLayerGust },
  { key: 'shear', label: 'Shear', sub: 'Windscherung', icon: IconLayerShear },
  { key: 'streamlines', label: 'Streamlines', sub: 'Strömungslinien', icon: IconLayerStream },
  { key: 'cloudBase', label: 'Wolkenbasis', sub: 'Untergrenze der Wolken', icon: IconLayerCloud },
];

function SidePanel({ ctx, mobile = false, onPicked }: { ctx: DeckCtx; mobile?: boolean; onPicked?: () => void }) {
  const { deckLens, setDeckLens, isSection, mapOpen, hasCut, openMap, openSection, picked } = ctx;
  const { cutPoints, setCutPoints, sectionLayers, setSectionLayers } = useAtmosphere();
  const pick = (l: DeckLens) => { setDeckLens(l); onPicked?.(); };
  return (
    <div className="vsd-side-panel">
      {!mobile && (
        <div className="vsd-side-head">
          <span className="vsd-side-eyebrow">Atmosphäre</span>
          <span className="vsd-side-count">{VIEW_META[deckLens].label}</span>
        </div>
      )}

      {isSection && <FlowSteps ctx={ctx} onPicked={onPicked} />}

      {/* Die Ansichten stehen am Desktop als Knöpfe im Bühnenkopf (ViewBar); mobil hier im Sheet. */}
      {mobile && (
        <>
          <SideGroup title="Am Schnitt" accent="steel" role="radiogroup">
            {SECTION_VIEWS.map((l) => (
              <ViewRow key={l} lens={l} on={deckLens === l} accent="steel" onClick={() => pick(l)} />
            ))}
          </SideGroup>
        </>
      )}

      {deckLens === 'hoehenwind' && (
        <SideGroup title="Ebenen im Schnitt" accent="terracotta">
          {LAYER_ROWS.map((r) => (
            <SwitchRow key={r.key} label={r.label} sub={r.sub} icon={r.icon} accent="terracotta" on={sectionLayers[r.key]}
              onClick={() => setSectionLayers({ ...sectionLayers, [r.key]: !sectionLayers[r.key] })} />
          ))}
          <p className="vsd-side-note">{SECTION_ANCHORS} Wetterpunkte entlang der Linie · Höhenstufen {SECTION_LEVEL_STEP_M} m · Auflösung begrenzt die Genauigkeit</p>
        </SideGroup>
      )}

      {deckLens === 'hoehenwind' && !mobile && !mapOpen && <PointQuery picked={picked} />}

      {isSection && (
        <SideGroup title="Schnittlinie" accent="slate">
          {mapOpen && hasCut ? (
            <ActionRow icon={IconViewWind} label="Schnitt anzeigen" sub={`${cutPoints.length} Punkte gesetzt`} onClick={() => { openSection(); onPicked?.(); }} />
          ) : (
            <ActionRow icon={IconPencil} label={hasCut ? 'Linie bearbeiten' : 'Linie zeichnen'} sub={hasCut ? 'Punkte verschieben, ergänzen, löschen' : 'Zwei Punkte auf der Karte setzen'}
              onClick={() => { openMap(); onPicked?.(); }} disabled={mapOpen} />
          )}
          <TourRow onDone={onPicked} />
          {cutPoints.length > 0 && (
            <ActionRow icon={IconTrash} label="Linie löschen" sub="Neu beginnen" onClick={() => { setCutPoints([]); onPicked?.(); }} />
          )}
        </SideGroup>
      )}
    </div>
  );
}

/** Ablauf in drei Schritten — zeigt, wo der Anwender steht, und springt dorthin. */
function FlowSteps({ ctx, onPicked }: { ctx: DeckCtx; onPicked?: () => void }) {
  const { hasCut, mapOpen, openMap, openSection, location } = ctx;
  const { setLocation } = useAtmosphere();
  const steps: Array<{ label: string; sub: string; state: 'done' | 'active' | 'todo'; onClick?: () => void }> = [
    { label: 'Ort', sub: location?.name ?? 'gewählt', state: 'done', onClick: () => setLocation(null) },
    { label: 'Schnitt ziehen', sub: hasCut ? 'Linie steht' : 'zwei Punkte auf der Karte', state: hasCut && !mapOpen ? 'done' : 'active', onClick: () => { openMap(); onPicked?.(); } },
    { label: 'Atmosphäre ansehen', sub: hasCut ? 'entlang der Linie' : 'nach dem Schnitt', state: hasCut && !mapOpen ? 'active' : 'todo', onClick: hasCut ? () => { openSection(); onPicked?.(); } : undefined },
  ];
  return (
    <ol className="vsd-flow" aria-label="Ablauf">
      {steps.map((s, i) => (
        <li key={s.label} className={`vsd-flow-step is-${s.state}`}>
          <button type="button" className="vsd-flow-btn" onClick={s.onClick} disabled={!s.onClick} aria-current={s.state === 'active' ? 'step' : undefined}
            title={i === 0 ? 'Ort ändern' : undefined}>
            <span className="vsd-flow-num" aria-hidden="true">{s.state === 'done' ? <IconTick /> : i + 1}</span>
            <span className="vsd-flow-tx"><span className="vsd-flow-label">{s.label}</span><span className="vsd-flow-sub">{s.sub}</span></span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function SideGroup({ title, accent, role, children }: { title: string; accent: string; role?: string; children: ReactNode }) {
  return (
    <section className="vsd-sgroup" data-accent={accent}>
      <div className="vsd-sgroup-head">{title}</div>
      <div className="vsd-srows" role={role} aria-label={role ? title : undefined}>{children}</div>
    </section>
  );
}

function ViewRow({ lens, on, accent, onClick }: { lens: DeckLens; on: boolean; accent: string; onClick: () => void }) {
  const m = VIEW_META[lens];
  return (
    <button type="button" role="radio" aria-checked={on} className={`vsd-srow${on ? ' is-on' : ' is-off'}`} data-accent={accent} onClick={onClick}>
      <span className="vsd-srow-ic">{m.icon()}</span>
      <span className="vsd-srow-tx"><span className="vsd-srow-label">{m.label}</span><span className="vsd-srow-sub">{m.sub}</span></span>
      <span className="vsd-radio" aria-hidden="true" />
    </button>
  );
}

function SwitchRow({ label, sub, icon, accent, on, onClick }: { label: string; sub: string; icon: () => ReactNode; accent: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`vsd-srow${on ? ' is-on' : ' is-off'}`} data-accent={accent} onClick={onClick}>
      <span className="vsd-srow-ic">{icon()}</span>
      <span className="vsd-srow-tx"><span className="vsd-srow-label">{label}</span><span className="vsd-srow-sub">{sub}</span></span>
      <span className="vsd-switch" aria-hidden="true"><span className="vsd-switch-knob" /></span>
    </button>
  );
}

function ActionRow({ icon, label, sub, onClick, disabled }: { icon: () => ReactNode; label: string; sub: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="vsd-srow vsd-srow--action" onClick={onClick} disabled={disabled}>
      <span className="vsd-srow-ic">{icon()}</span>
      <span className="vsd-srow-tx"><span className="vsd-srow-label">{label}</span><span className="vsd-srow-sub">{sub}</span></span>
      <span className="vsd-srow-chev" aria-hidden="true"><IconChevron /></span>
    </button>
  );
}

/** Tour/GPX als Schnittlinie übernehmen (vorher die Pille in der Dock-Karte). */
function TourRow({ onDone }: { onDone?: () => void }) {
  const { setLocation, setCutPoints } = useAtmosphere();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setErr(null);
    try {
      const tour = await tourFileToCutLine(f);
      const s = tour.points[0];
      setLocation({ name: tour.name, lat: s.lat, lon: s.lon, country: pickCountry(s.lat, s.lon) });
      setCutPoints(tour.points);
      onDone?.();
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Tour konnte nicht gelesen werden.');
    }
  }
  return (
    <>
      <input ref={fileRef} type="file" accept=".gpx,.tcx,.fit,.kml,.kmz" style={{ display: 'none' }} onChange={onFile} />
      <ActionRow icon={IconRoute} label="Tour als Linie laden" sub="GPX · TCX · FIT · KML" onClick={() => fileRef.current?.click()} />
      {err && <p className="vsd-side-err">⚠ {err}</p>}
    </>
  );
}

function PointQuery({ picked }: { picked: PickedPoint | null }) {
  return (
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
  );
}

// ============================ Bühne ============================
/** Kopf der Bühne: Titel + Umschalter Karte | Schnitt (nur Schnitt-Ansichten). */
function StageHead({ ctx, eyebrow, title }: { ctx: DeckCtx; eyebrow: string; title: ReactNode }) {
  const { isSection, mapOpen, hasCut, openMap, openSection } = ctx;
  return (
    <div className="vsd-stagehead">
      <div className="vsd-stagehead-tx">
        <div className="vsd-eyebrow">{eyebrow}</div>
        <h1 className="vsd-stage-title">{title}</h1>
      </div>
      <div className="vsd-stagehead-tools">
        <ViewBar ctx={ctx} />
        {isSection && (
          <div className="vsd-seg" role="tablist" aria-label="Bühne">
            <button type="button" role="tab" aria-selected={mapOpen} className={`vsd-seg-btn${mapOpen ? ' is-active' : ''}`} onClick={openMap}><IconMapSmall />Karte</button>
            <button type="button" role="tab" aria-selected={!mapOpen} className={`vsd-seg-btn${!mapOpen ? ' is-active' : ''}`} onClick={openSection} disabled={!hasCut}
              title={hasCut ? undefined : 'Erst eine Schnittlinie zeichnen'}><IconViewWind />Schnitt</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Ansichten als Knöpfe im Bühnenkopf: „Am Schnitt". */
function ViewBar({ ctx }: { ctx: DeckCtx }) {
  const { deckLens, setDeckLens } = ctx;
  const group = (label: string, accent: string, views: DeckLens[]) => (
    <div className="vsd-views" data-accent={accent} role="radiogroup" aria-label={label}>
      <span className="vsd-views-lab" aria-hidden="true">{label}</span>
      {views.map((l) => {
        const m = VIEW_META[l];
        const on = deckLens === l;
        return (
          <button key={l} type="button" role="radio" aria-checked={on} className={`vsd-view-btn${on ? ' is-active' : ''}`}
            onClick={() => setDeckLens(l)} title={`${m.label} — ${m.sub}`}>
            {m.icon()}<span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="vsd-viewbar">
      {group('Am Schnitt', 'steel', SECTION_VIEWS)}
    </div>
  );
}

/**
 * Karte mit Schnitt-Anleitung. Die Anleitung folgt live dem Stand der Linie
 * (Start → Ende → Schnitt öffnet sich) und liegt neben, nicht auf der
 * Zeichenfläche — die Karte bleibt vollständig bedienbar.
 */
function CutStage(ctx: DeckCtx) {
  const { location, hasCut } = ctx;
  const { cutPoints, setCutPoints } = useAtmosphere();
  const center = location ? { lat: location.lat, lon: location.lon } : { lat: 47.42, lon: 10.98 };
  return (
    <>
      <StageHead ctx={ctx} eyebrow={hasCut ? 'Schnittlinie bearbeiten' : 'Schritt 2 von 3 · Schnitt ziehen'}
        title={hasCut ? 'Linie anpassen, dann Schnitt anzeigen' : 'Zieh eine Linie durch die Landschaft'} />
      <div className="vsd-plot vsd-plot--map">
        <ThreeDMap center={center} points={cutPoints} onChange={setCutPoints} />
        <CutGuide ctx={ctx} />
      </div>
    </>
  );
}

function CutGuide({ ctx, inline = false }: { ctx: DeckCtx; inline?: boolean }) {
  const { hasCut, openSection } = ctx;
  const { cutPoints } = useAtmosphere();
  const n = cutPoints.length;
  const steps = [
    { label: 'Startpunkt antippen', sub: 'auf einer Seite von Tal oder Grat' },
    { label: 'Endpunkt antippen', sub: 'auf der anderen Seite — die Linie quert das Gelände' },
    { label: 'Atmosphäre ansehen', sub: hasCut ? 'mit „Schnitt anzeigen" weiter' : 'der Schnitt öffnet sich von selbst' },
  ];
  const state = (i: number) => (i < Math.min(n, 2) ? 'done' : i === Math.min(n, 2) ? 'active' : 'todo');
  return (
    <div className={`vsd-guide${inline ? ' vsd-guide--inline' : ''}`} role="status" aria-live="polite">
      {!inline && <div className="vsd-guide-art" aria-hidden="true"><CutHintMark /></div>}
      <ol className="vsd-guide-steps">
        {steps.map((s, i) => (
          <li key={s.label} className={`vsd-guide-step is-${hasCut && i === 2 ? 'active' : state(i)}`}>
            <span className="vsd-guide-num" aria-hidden="true">{state(i) === 'done' ? <IconTick /> : i + 1}</span>
            <span className="vsd-guide-tx"><b>{s.label}</b><span>{s.sub}</span></span>
          </li>
        ))}
      </ol>
      {hasCut ? (
        <div className="vsd-guide-foot">
          <span>{n} Punkte · Marker ziehen zum Verschieben, antippen zum Löschen. Weitere Punkte knicken die Linie.</span>
          <button type="button" className="vsd-toppill vsd-toppill--primary" onClick={openSection}>Schnitt anzeigen</button>
        </div>
      ) : (
        <div className="vsd-guide-foot"><span>Tipp: Eine Linie quer über ein Tal oder einen Grat zeigt, wie der Wind mit dem Gelände spielt.</span></div>
      )}
    </div>
  );
}

// ---------------------------- Höhenwind (Desktop) ----------------------------
function HoehenwindDesktop(ctx: DeckCtx) {
  const { data, section, timeMs, setTimeMs, picked, setPicked, location } = ctx;
  const { sectionLayers } = useAtmosphere();

  return (
    <>
      <StageHead ctx={ctx} eyebrow="Höhenwind am Schnitt" title={location?.name ?? 'Schnittlinie'} />

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
          <SectionPlaceholder data={data} onDraw={ctx.openMap} />
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
        {/* E-FR-5: buscosun Fusion withholds the direction of weak/unsteady wind — no arrow instead of a north arrow. */}
        <div className="vsd-legend-item"><span>ohne Pfeil = keine eindeutige Richtung</span></div>
      </div>

      <TimeDeck data={data} timeMs={timeMs} setTimeMs={setTimeMs} />
      <p className="vsd-caption">{dataOrigin(data)} · {sectionMethod(section)} · ≥30 FPS · werbefrei · Keine amtliche Warnung, keine Freigabe für Flug oder Bergtour</p>
    </>
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
  if (data.kind === 'error') return <div className="vsd-plot-empty"><strong>Schnitt nicht verfügbar</strong><p>⚠ {data.message}</p><button className="vsd-toppill" onClick={onDraw}>Linie bearbeiten</button></div>;
  return (
    <div className="vsd-plot-empty">
      <CutHintArt />
      <strong>Zeichne eine Schnittlinie durch die Landschaft</strong>
      <p>Tippe auf der Karte mindestens zwei Punkte — z. B. quer über ein Tal oder einen Grat.
        Entlang dieser Linie schneiden wir die Atmosphäre auf und zeigen Höhenwind, Böen und Wolkenbasis.</p>
      <button className="vsd-toppill vsd-toppill--primary" onClick={onDraw}>Zur Karte</button>
    </div>
  );
}

/** Kompakte Variante der Hinweis-Zeichnung für die Anleitung auf der Karte. */
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
export function CutHintArt() {
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

// ============================ Mobile ============================
function MobileDeck(ctx: DeckCtx) {
  const { deckLens, onBack, location, mapOpen, hasCut, openMap, openSection } = ctx;
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);
  const titles: Record<DeckLens, { eyebrow: string; title: string }> = {
    hoehenwind: { eyebrow: '3D-Wetter · Schnitt', title: location?.name ?? 'Schnittlinie' },
  };
  const t = titles[deckLens];
  return (
    <div className="vsd-m-root">
      {/* Mobile head like the other features (Jan 06.11.): buscosun tile left (home), title, share tile right. */}
      <div className="vsd-m-header">
        <a className="vsd-m-logo" href="/" onClick={(e) => { e.preventDefault(); onBack(); }} aria-label="Zur Startseite">
          <img src="/buscosun-mark.svg" width={22} height={22} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        </a>
        <div className="vsd-m-htext"><div className="vsd-m-eyebrow">{t.eyebrow}</div><div className="vsd-m-title">{t.title}</div></div>
        <ShareButton className="vsd-m-share" compact />
      </div>
      {/* No function bar above the content (Jan 06.11.): the sheet opens from "Ebenen" in the bottom bar. */}
      <div className="vsd-m-scroll vsd-scroll">
        {mapOpen ? <CutStageMobile {...ctx} /> : (
          <>
            {deckLens === 'hoehenwind' && <HoehenwindMobile {...ctx} />}
          </>
        )}
      </div>
      {/* Time slider of the section docked just above the bottom bar (Jan 06.11.): it stays in reach while the content scrolls. */}
      {!mapOpen && ctx.section && <div className="vsd-m-timedock"><TimeDeck data={ctx.data} timeMs={ctx.timeMs} setTimeMs={ctx.setTimeMs} /></div>}
      {sheetOpen && (
        <div className="vsd-m-sheetwrap">
          <button type="button" className="vsd-m-backdrop" aria-label="Funktionen schließen" onClick={() => setSheetOpen(false)} />
          <div className="vsd-m-sheet vsd-scroll" role="dialog" aria-modal="true" aria-label="Funktionen">
            <div className="vsd-m-sheet-head">
              <span className="vsd-m-sheet-title">Funktionen</span>
              <button type="button" className="vsd-m-sheet-close" onClick={() => setSheetOpen(false)} aria-label="Schließen"><IconClose /></button>
            </div>
            <SidePanel ctx={ctx} mobile onPicked={() => setSheetOpen(false)} />
          </div>
        </div>
      )}
      {/* Mobile bottom bar (Jan 06.11.): Karte | Schnitt | Ebenen — replaces the Karte/Schnitt switch above the content. */}
      <nav className="vsd-m-bar" aria-label="Vertikalschnitt-Bereiche">
        <button type="button" className={`vsd-m-bar-btn${mapOpen && !sheetOpen ? ' is-active' : ''}`} aria-current={mapOpen && !sheetOpen ? 'page' : undefined}
          onClick={() => { setSheetOpen(false); openMap(); }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 7 9 4zM9 4v13M15 7v12.5" /></svg>
          <span>Karte</span>
        </button>
        <button type="button" className={`vsd-m-bar-btn${!mapOpen && !sheetOpen ? ' is-active' : ''}`} aria-current={!mapOpen && !sheetOpen ? 'page' : undefined}
          onClick={() => { setSheetOpen(false); openSection(); }} disabled={!hasCut} title={hasCut ? undefined : 'Erst eine Schnittlinie zeichnen'}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 20l5-8 4 4 4-8 5 12zM4 5h9M4 8.5h5" /></svg>
          <span>Schnitt</span>
        </button>
        <button type="button" className={`vsd-m-bar-btn${sheetOpen ? ' is-active' : ''}`} aria-haspopup="dialog" aria-expanded={sheetOpen}
          onClick={() => setSheetOpen((o) => !o)}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 9 4.5-9 4.5-9-4.5L12 3zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5" /></svg>
          <span>Ebenen</span>
        </button>
      </nav>
    </div>
  );
}

function CutStageMobile(ctx: DeckCtx) {
  const { location } = ctx;
  const { cutPoints, setCutPoints } = useAtmosphere();
  const center = location ? { lat: location.lat, lon: location.lon } : { lat: 47.42, lon: 10.98 };
  return (
    <>
      <div className="vsd-plot vsd-plot--map vsd-m-map">
        <ThreeDMap center={center} points={cutPoints} onChange={setCutPoints} />
      </div>
      <CutGuide ctx={ctx} inline />
    </>
  );
}

function HoehenwindMobile(ctx: DeckCtx) {
  const { data, section, picked, setPicked } = ctx;
  const { sectionLayers } = useAtmosphere();
  return (
    <>
      <div className="vsd-plot" style={{ padding: 12 }}>
        {section
          ? <SectionChart section={section} layers={sectionLayers} picked={picked} onPick={setPicked} portrait />
          : <SectionPlaceholder data={data} onDraw={ctx.openMap} />}
      </div>
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
      <p className="vsd-m-caption">{dataOrigin(data)} · {sectionMethod(section)} · werbefrei. Keine amtliche Warnung, keine Freigabe für Flug oder Bergtour.</p>
    </>
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

// ---------------------------- Helpers ----------------------------
const compass = (deg: number | null) => (deg == null ? 'keine Richtung' : ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(((deg % 360) / 22.5)) % 16]);
const fmtTemp = (c: number) => (Math.round(c * 10) / 10).toFixed(1).replace('.', ',');
const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtClock = (ms: number) => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const fmtDayTime = (ms: number) => { const d = new Date(ms); const wd = d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', ''); return `${wd} ${d.getDate()}. ${d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')} · ${pad2(d.getHours())}:${pad2(d.getMinutes())} Uhr`; };

// ---------------------------- Icons (aus der Vorlage) ----------------------------
function IconPlay() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5 L19 12 L7 19 Z" /></svg>; }
function IconPause() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>; }
function IconRoute() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 4 H14 L18 8 V20 H6 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M9 16 C10 13 13 14 14 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>; }

// Funktionsleiste — gleiche Strichstärke wie die Layer-Icons der Wetterkarte.
const SI = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
function IconViewWind() { return <svg {...SI}><path d="M3 8 H14 A3 3 0 1 0 11 5" /><path d="M3 12 H18 A3 3 0 1 1 15 15" /><path d="M3 16 H10" /></svg>; }
function IconLayerMean() { return <svg {...SI}><path d="M4 12 H19" /><path d="M14 7 L19 12 L14 17" /></svg>; }
function IconLayerGust() { return <svg {...SI}><path d="M3 15 L7 9 L11 15 L15 9 L19 15" /><path d="M19 15 L21 13" /></svg>; }
function IconLayerShear() { return <svg {...SI}><path d="M4 8 H17 M13 5 L17 8 L13 11" /><path d="M20 16 H7 M11 13 L7 16 L11 19" /></svg>; }
function IconLayerStream() { return <svg {...SI}><path d="M3 8 C7 5 10 11 14 8 S20 6 21 7" /><path d="M3 14 C7 11 10 17 14 14 S20 12 21 13" /><path d="M3 20 C7 17 10 21 14 19" /></svg>; }
function IconLayerCloud() { return <svg {...SI}><path d="M7 15 A4 4 0 0 1 7.5 7 A5 5 0 0 1 17 8 A3.5 3.5 0 0 1 17 15 Z" /><path d="M4 19 H20" strokeDasharray="2.5 2.5" /></svg>; }
function IconPencil() { return <svg {...SI}><path d="M4 20 L5 15 L16 4 L20 8 L9 19 Z" /><path d="M14 6 L18 10" /></svg>; }
function IconTrash() { return <svg {...SI}><path d="M4 7 H20" /><path d="M9 7 V4 H15 V7" /><path d="M6 7 L7 20 H17 L18 7" /></svg>; }
function IconChevron() { return <svg {...SI} width={14} height={14}><path d="M9 6 L15 12 L9 18" /></svg>; }
function IconTick() { return <svg {...SI} width={12} height={12} strokeWidth={2.6}><path d="M5 13 L10 18 L19 6" /></svg>; }
function IconMapSmall() { return <svg {...SI} width={14} height={14}><path d="M3 6 L9 4 L15 6 L21 4 V18 L15 20 L9 18 L3 20 Z" /><path d="M9 4 V18 M15 6 V20" /></svg>; }
function IconClose() { return <svg {...SI} width={18} height={18}><path d="M6 6 L18 18 M18 6 L6 18" /></svg>; }
