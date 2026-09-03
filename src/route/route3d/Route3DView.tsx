/**
 * R3D · die 3D-Ansicht der Tourenplanung mit drei Modi:
 *   – **Wetter entlang der Route** (1a, `reference/1a-wetter-vorhang-*`)
 *   – **Zeitkorridor** (1b, `reference/1b-zeitkorridor-*`) — „wo bin ich um
 *     welche Uhrzeit, und was zieht dann über mich hinweg?"
 *   – **Grenzwerte** (1c, `reference/1c-gonogo-relief-*`) — „wo wird es
 *     kritisch, und warum genau dort?"
 *
 * Beide teilen Geometrie, Regler und Kopfzeile; der Zeitkorridor legt
 * Wetterperlen, den getroffenen Regenabschnitt und Windpfeile darüber und
 * tauscht die rechte Spalte gegen Zeitfenster, Startempfehlung und die
 * Regenverteilung über die Startzeit. Was er bewusst NICHT zeigt (Zellellipse
 * mit Zuggeschwindigkeit, Treffer-Wahrscheinlichkeit), steht in `corridor.ts`
 * und `audit/route-3d.md` §13.3.
 *
 * Eigener Modus der Tourenplanung, 2D bleibt Default. Die Ansicht rendert
 * INNERHALB von `TourView` — dadurch überlebt die hochgeladene Strecke den
 * Wechsel, obwohl sie in keiner URL stehen kann (`audit/route-3d.md` §5 B3).
 *
 * Was hier bewusst anders ist als in der Vorlage, steht in §5 des Audits:
 * die Auflösung nennt den echten Cluster-Radius statt „≈ 2 km", die Kopfzeile
 * nennt den Quellen-Stack je Land statt eines Modells, fehlende Layer sagen
 * warum sie fehlen, und die Wolkenbasis trägt das Wort „abgeleitet".
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BAND_COLORS } from '../../threed/SectionChart';
import { DEFAULT_ALPHA, windAtAGL } from '../../threed/crossSection';
import type { EnrichmentMeta } from '../../pointForecast/weatherEnrichment';
import type { SampleETA } from '../tourTiming';
import type { Terrain, TourPoint } from '../tourTrack';
import { sampleReliefProfiles } from '../enrichElevation';
import { clock } from '../tourUi';
import { IconPause, IconPlay, IconStepBack, IconStepForward, IconWarning } from '../routeIcons';
import Scene3D, { REL_COLORS, type LayerFlags, type SceneMode } from './Scene3D';
import {
  buildPearls, buildTimeline, hhmm, nextWindow, radarHorizonChip, radarHorizonNote,
  rainWindows, startAdvice, startAdviceNote, windowAtDist,
  type Pearl, type RainWindow, type TimelineRow,
} from './corridor';
import {
  buildScene, columnAtDist, confidenceWord, distAtEta, etaAtDist, HAIL_NOTE, meanConfidence,
  RELIEF_OFFSETS_M, terrainNote, type ReliefProfile,
  RAIN_MIN_MMH, resolutionChip, resolutionNote, snapToStep, sourceNote, TIME_STEP_MS, UNCLEAR_BELOW,
  type SceneColumn, type SceneModel, type WarnZone,
} from './model';
import {
  buildGoNoGoReport, goSections, goStartNote, goStartSearch, kmLabel, leadSection, limitDef,
  LIMITS, loadLimits, overallStatus, reasonSentence, saveLimits, sectionAtDist, STATUS_WORD,
  summarizeLimits, unclearShort, type GoSection, type GoStatus, type GoStartHit, type LimitHit, type LimitId,
  type LimitSet, type LimitSummary,
} from './gonogo';
import { STATUS_COLORS } from './Scene3D';
import { DEFAULT_EXAGGERATION, MAX_EXAGGERATION, MIN_EXAGGERATION } from './scene';
import {
  buildGroundLayers, buildRouteSection, curtainNote, loadTLayers, saveTLayers, terrainChips,
  NO_INVERSION_NOTE, type TerrainChip, type TerrainLayerFlags,
} from './routeSection';
import { buildSchedule, buildScheduleText, SCHEDULE_NOTE, type Schedule, type ScheduleEvent } from './schedule';
/**
 * Die Geländekarte kommt erst, wenn sie gebraucht wird: sie zieht MapLibre, den
 * Vorhang-Layer und den Textur-Bauer nach. Wer nur den Schnitt öffnet, lädt
 * nichts davon (§21.4, T3).
 */
const RouteTerrainMap = lazy(() => import('./RouteTerrainMap'));
import './route3d.css';

/**
 * Ein Chip der Gelände-Ansicht. Beide Ansichten (3D-Bühne und Ergebnis) nehmen
 * denselben Knopf — die Liste kommt aus `terrainChips` (R3D-8).
 */
export function TerrainChipButton({
  chip, on, onToggle,
}: {
  chip: TerrainChip;
  on: boolean;
  onToggle: (k: TerrainChip['key']) => void;
}) {
  return (
    <button
      type="button"
      className={`r3-chip${on ? ' is-on' : ''}${chip.ok ? '' : ' is-empty'}`}
      aria-pressed={on}
      title={chip.ok ? undefined : chip.note}
      disabled={chip.disabled === true}
      onClick={() => onToggle(chip.key)}
    >
      <span className="r3-chip-dot" style={{ background: chip.dot }} />
      {chip.label}
      {!chip.ok && <span className="r3-chip-empty">{chip.empty ?? 'ohne Daten'}</span>}
    </button>
  );
}

/**
 * Der Zeitplan in Schriftform: eine Zeile je **Änderung**, nach Uhrzeit
 * geordnet. Der Ton ist Beiwerk — jeder Satz trägt seine Aussage allein, auch
 * schwarz auf weiß im Druck.
 */
function SchedulePanel({
  schedule, gaps, activeM, onPick, onCopy,
}: {
  schedule: Schedule;
  gaps: string[];
  activeM: number;
  onPick: (m: number) => void;
  onCopy: () => void;
}) {
  return (
    <section className="r3-plan">
      <div className="r3-plan-head">
        <h3 className="r3-plan-title">Zeitplan · was wann passiert</h3>
        <span className="r3-plan-sub">Nur Änderungen — der Bewegungsplan mit Pausen steht im 2D-Ergebnis.</span>
        <button type="button" className="r3-plan-copy" onClick={onCopy}>Als Text kopieren</button>
      </div>

      {schedule.events.length === 0 ? (
        <p className="r3-plan-empty">
          Auf dieser Strecke ändert sich nichts, was der Plan benennen könnte — kein Niederschlag,
          kein Bandwechsel beim Wind, keine 5-°C-Marke.
        </p>
      ) : (
        <ol className="r3-plan-list">
          {schedule.events.map((e, i) => (
            <ScheduleRow key={`${e.atMs}-${e.kind}-${i}`} ev={e} active={isHere(e, activeM)} onPick={onPick} />
          ))}
        </ol>
      )}

      {schedule.omitted > 0 && (
        <p className="r3-plan-more">… {schedule.omitted} weitere Änderungen sind hier nicht aufgeführt.</p>
      )}
      <p className="r3-plan-note">{SCHEDULE_NOTE}</p>
      {gaps.map((g) => (
        <p key={g} className="r3-plan-gap"><IconWarning size={12} /> {g}</p>
      ))}
    </section>
  );
}

function ScheduleRow({ ev, active, onPick }: { ev: ScheduleEvent; active: boolean; onPick: (m: number) => void }) {
  return (
    <li className={`r3-plan-row r3-plan-row--${ev.tone}${active ? ' is-here' : ''}`}>
      <button type="button" onClick={() => onPick(ev.distM)} title="Position auf diese Zeile setzen">
        <span className="r3-plan-time">{clock(ev.atMs)}</span>
        <span className="r3-plan-km">km {kmLabel(ev.distM)}</span>
        <span className="r3-plan-text">{ev.text}</span>
      </button>
    </li>
  );
}

/** „Hier stehe ich gerade" — 250 m Toleranz, damit die Marke eine Zeile trifft. */
function isHere(ev: ScheduleEvent, activeM: number): boolean {
  return Math.abs(ev.distM - activeM) <= 250;
}

/** Die Konfidenzschwelle als Text — sie steht in der Fußzeile von 1c. */
const UNCLEAR_TEXT = UNCLEAR_BELOW.toLocaleString('de-DE');

const LAYER_STORE_KEY = 'bsc.route3d.layers';
const MODE_STORE_KEY = 'bsc.route3d.mode';
/** Darstellung (Schnitt/Gelände) — sie ist eine andere Frage als der Modus. */
const STAGE_STORE_KEY = 'bsc.route3d.stage';
const DEFAULT_LAYERS: LayerFlags = {
  temp: true, wind: true, rain: true, cloud: true, snow: false, warn: true,
  pearls: true, wetseg: true, arrows: true,
};

interface Props {
  samples: SampleETA[];
  points: TourPoint[];
  terrain: Terrain;
  /** Woher die Höhen stammen — die Ansicht sagt es, statt sie zu behaupten. */
  elevation: { source: 'file' | 'dem-filled' | 'dem-replaced'; deltaM: number | null };
  meta: EnrichmentMeta;
  tourName: string;
  movementLabel: string | null;
  startMs: number;
  arrivalMs: number | null;
  isMobile: boolean;
  /** Gekoppelte Scrub-Distanz — geteilt mit der 2D-Ansicht (Position überlebt den Wechsel). */
  distM: number | null;
  onDist: (m: number) => void;
  onPos?: (lat: number, lon: number) => void;
  /** Startzeit übernehmen (entkoppelte Zeitbahn) — rechnet die Tour neu. */
  onStart?: (ms: number) => void;
  /** 2D/3D-Umschalter der Shell. */
  toggle: ReactNode;
}

export default function Route3DView({
  samples, points, terrain, elevation, meta, tourName, movementLabel, startMs, arrivalMs,
  isMobile, distM, onDist, onPos, onStart, toggle,
}: Props) {
  // Gemessenes Gelände neben der Strecke. Es wird erst hier geholt — die
  // seitlichen Kacheln braucht nur die 3D-Ansicht (die der Strecke hat die
  // Höhen-Gegenprobe schon in den Browser-Cache gelegt). Kommt nichts, bleibt
  // es bei der Extrusion, und die Fußzeile sagt es.
  const [relief, setRelief] = useState<ReliefProfile[]>([]);
  useEffect(() => {
    if (points.length < 2) return;
    const ac = new AbortController();
    sampleReliefProfiles(
      points.map((p) => ({ lat: p.lat, lon: p.lon, dist: p.dist })),
      RELIEF_OFFSETS_M,
      ac.signal,
    )
      .then((r) => { if (!ac.signal.aborted && r) setRelief(r); })
      .catch(() => { /* offline: Extrusion bleibt */ });
    return () => ac.abort();
  }, [points]);

  const scene: SceneModel = useMemo(
    () => buildScene({ samples, points, countries: meta.countries, coverage: meta.coverage, relief }),
    [samples, points, meta.countries, meta.coverage, relief],
  );

  const [layers, setLayers] = useState<LayerFlags>(() => loadLayers());
  const [mode, setMode] = useState<SceneMode>(() => loadMode());
  const [exaggeration, setExaggeration] = useState(DEFAULT_EXAGGERATION);
  // Grenzwerte (1c) leben in `localStorage`, NICHT im Tour-Speicher: sie
  // ueberleben die Tour und gelten fuer die naechste (§17.3 C5).
  const [stored, setStored] = useState(() => loadLimits());
  const [editorOpen, setEditorOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [coupled, setCoupled] = useState(true);
  /** Verschiebung der Startzeit beim Durchspielen (ms) — nur entkoppelt. */
  const [shiftMs, setShiftMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reduced = usePrefersReducedMotion();

  const total = scene.totalM;
  const pos = distM ?? 0;
  const setPos = useCallback((m: number) => onDist(Math.max(0, Math.min(total, m))), [onDist, total]);

  const col = useMemo(() => columnAtDist(scene.columns, pos), [scene.columns, pos]);
  const etaMs = useMemo(() => etaAtDist(scene.columns, pos), [scene.columns, pos]);

  // Position melden (Karten-Marker der 2D-Ansicht bleibt synchron).
  useEffect(() => { if (col && onPos) onPos(col.lat, col.lon); }, [col, onPos]);

  // Abspielen: 15-Minuten-Schritte auf der Zeitachse, in Positionsschritte
  // übersetzt. Unter `prefers-reduced-motion` gibt es keinen Lauf — nur Schritte.
  useEffect(() => {
    if (!playing || reduced || !scene.columns.length) return;
    const id = window.setInterval(() => {
      const cur = etaAtDist(scene.columns, pos) ?? scene.startMs;
      const next = cur + TIME_STEP_MS;
      if (next >= scene.endMs) { setPlaying(false); setPos(total); return; }
      const d = distAtEta(scene.columns, next);
      if (d != null) setPos(d);
    }, 700);
    return () => window.clearInterval(id);
  }, [playing, reduced, scene, pos, total, setPos]);

  useEffect(() => { saveLayers(layers); }, [layers]);
  useEffect(() => { try { localStorage.setItem(MODE_STORE_KEY, mode); } catch { /* privat */ } }, [mode]);

  const toggleLayer = (k: keyof LayerFlags) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  // --- Zeitkorridor (1b) --------------------------------------------------
  const windows: RainWindow[] = useMemo(() => rainWindows(scene.columns), [scene.columns]);
  const pearls: Pearl[] = useMemo(
    () => buildPearls(scene.columns, isMobile ? 2 : 6),
    [scene.columns, isMobile],
  );
  const timeline: TimelineRow[] = useMemo(
    () => buildTimeline(buildPearls(scene.columns, 9, 0), windows, scene.warnZones),
    [scene.columns, windows, scene.warnZones],
  );
  const advice = useMemo(() => startAdvice(meta.startWindow, startMs), [meta.startWindow, startMs]);
  const adviceNote = useMemo(() => startAdviceNote(meta.startWindow), [meta.startWindow]);
  const radarChip = useMemo(() => radarHorizonChip(meta.radar, scene.endMs), [meta.radar, scene.endMs]);
  // Was den Marker gerade trifft — oder als Nächstes kommt. Das ist die
  // ehrliche Fassung der „Zelle" aus der Vorlage: ein km-Bereich mit Zeitfenster,
  // keine Ellipse mit Zuggeschwindigkeit (audit B10).
  const hitWindow = windowAtDist(windows, pos);
  const comingWindow = hitWindow ? null : nextWindow(windows, pos);

  /**
   * Die gespeicherten Schalter gelten pro Modus: im Zeitkorridor bietet das
   * Deck Windwand und Warnzone gar nicht an — sie wären dann ein eingeschalteter
   * Zustand ohne Schalter (und die Wand übermalt die Windpfeile). Der Speicher
   * bleibt unangetastet; nur die Szene sieht die gefilterte Fassung.
   */
  /**
   * Die Bühne: **Schnitt** (axonometrisches SVG) oder **Gelände** (Karte mit
   * echtem Relief). Das ist die Darstellung — der Modus darüber ist die Frage.
   * Beides in eine Zeile zu werfen wäre eine Kategorieverwechslung (§21.4, T4).
   */
  const [stage, setStage] = useState<'section' | 'terrain'>(() => loadStage());
  const [tLayers, setTLayers] = useState<TerrainLayerFlags>(() => loadTLayers());
  useEffect(() => { try { localStorage.setItem(STAGE_STORE_KEY, stage); } catch { /* privat */ } }, [stage]);
  useEffect(() => { saveTLayers(tLayers); }, [tLayers]);
  const toggleTLayer = useCallback((k: keyof TerrainLayerFlags) => {
    setTLayers((prev) => ({ ...prev, [k]: !prev[k] }));
  }, []);

  /**
   * Die Gelände-Bühne beantwortet immer „Wetter entlang der Route": Zeitkorridor
   * und Grenzwerte brauchen die Höhenachse und die Zonen, die eine Karte nicht
   * trägt. Der gewählte Modus bleibt gespeichert — der Rückweg zum Schnitt
   * findet die Frage wieder.
   */
  const dmode: SceneMode = stage === 'terrain' ? 'wetter' : mode;

  /** Die Tour als Vertikalschnitt — nur, wenn die Karte ihn auch zeigt. */
  const routeSection = useMemo(
    () => (stage === 'terrain' ? buildRouteSection(scene.columns, points) : null),
    [stage, scene.columns, points],
  );

  /* --- Was AN der Strecke liegt: die Wetterlage am Boden (§23) ------------ */
  // Dieselbe Stelle wie im Ergebnis (R3D-8) — die Ansichten teilen die Logik
  // und behalten ihr Layout.
  const ground = useMemo(
    () => (stage === 'terrain'
      ? buildGroundLayers(scene, points, isMobile ? 5 : 11)
      : { tempSegments: [], warnSegments: [], arrows: [] }),
    [stage, scene, points, isMobile],
  );
  const groundArrowCount = ground.arrows.length;
  const tChips = useMemo(
    () => terrainChips(scene, {
      cloudsUsable: routeSection?.cloudsUsable !== false,
      arrowCount: ground.arrows.length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, routeSection, groundArrowCount],
  );


  const sceneLayers: LayerFlags = dmode === 'zeit'
    ? { ...layers, wind: false, warn: false, rain: layers.wetseg }
    : dmode === 'gonogo'
      // Im Grenzwert-Modus faerbt der Status das Band. Jede weitere Ebene legte
      // eine zweite Aussage auf dieselbe Flaeche — und haette in diesem Modus
      // keinen Schalter (die Chip-Zeile gehoert hier den Grenzwerten). Wolken-
      // basis und Schneefallgrenze stehen dafuer in der „Warum"-Karte, dort,
      // wo sie die Entscheidung erklaeren.
      ? {
          temp: false, wind: false, rain: false, cloud: false, snow: false,
          warn: false, pearls: false, wetseg: false, arrows: false,
        }
      : layers;

  /* ---------------------- Grenzwerte (1c) ---------------------- */

  // Die amtliche Warnung ist DE-only. In AT/CH ist „keine Warnung" keine
  // Aussage, sondern eine Luecke — der Grenzwert wird dort zu „unklar".
  const warnKnown = meta.countries.length > 0 && meta.countries.every((c) => c === 'DE');
  const limits = stored.limits;
  const evalCtx = useMemo(() => ({ warnKnown }), [warnKnown]);
  const sections = useMemo(
    () => goSections(scene.columns, limits, evalCtx),
    [scene.columns, limits, evalCtx],
  );
  const overall = useMemo(() => overallStatus(sections), [sections]);
  const lead = useMemo(() => leadSection(sections), [sections]);

  /**
   * Der Zeitplan: **Änderungen**, nicht Zustände (§24, F1). Er hängt an keinem
   * Modus — er fasst zusammen, was alle drei zeigen, und steht deshalb unter
   * der Bühne, auf beiden Bühnen.
   */
  const schedule: Schedule = useMemo(
    () => buildSchedule({
      columns: scene.columns,
      windows,
      warnZones: scene.warnZones,
      // K2: Grenzwert-Zeilen nur, wenn die Abschnitte überhaupt etwas hergeben.
      sections,
    }),
    [scene.columns, scene.warnZones, windows, sections],
  );
  /** Was strukturell fehlt — der Plan darf keine Vollständigkeit behaupten (F3). */
  const scheduleGaps = useMemo(() => {
    const g: string[] = [];
    if (!scene.availability.warnings.any) g.push(scene.availability.warnings.note);
    if (!scene.availability.snowLine.any) g.push(scene.availability.snowLine.note);
    g.push(HAIL_NOTE);
    return g;
  }, [scene.availability]);

  const copySchedule = useCallback(async () => {
    const text = buildScheduleText({ tourName, schedule, clock, gaps: scheduleGaps });
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
    } catch { /* abgebrochen oder verboten — kein Ersatzweg, kein Link (B3) */ }
  }, [tourName, schedule, scheduleGaps]);
  const summaries = useMemo(
    () => summarizeLimits(scene.columns, limits, evalCtx),
    [scene.columns, limits, evalCtx],
  );
  const goHit = useMemo(() => goStartSearch(meta.startWindow, limits, startMs), [meta.startWindow, limits, startMs]);
  const goNote = useMemo(() => goStartNote(meta.startWindow, goHit), [meta.startWindow, goHit]);
  const hereSection = dmode === 'gonogo' ? sectionAtDist(sections, pos) : null;
  // Die „Warum"-Karte zeigt die Spalte, an der die Entscheidung fiel — die des
  // Abschnitts unter dem Marker, sonst die des schwersten Abschnitts.
  const whySection = hereSection && hereSection.status !== 'go' ? hereSection : lead;
  const whyCol = whySection ? scene.columns[whySection.leadIdx] ?? null : null;

  const patchLimit = (id: LimitId, v: number | null) => {
    setStored((prev) => {
      const next: LimitSet = { ...prev.limits };
      if (v == null) delete next[id]; else next[id] = v;
      saveLimits(next, true);
      return { limits: next, touched: true };
    });
  };

  const av = scene.availability;
  const chips: Array<{ key: keyof LayerFlags; label: string; dot: string; ok: boolean; note: string; empty?: string | undefined }> = [
    { key: 'temp', label: 'Temperatur am Band', dot: '#C97B47', ok: av.temperature.any, note: av.temperature.note },
    { key: 'wind', label: 'Windwand', dot: BAND_COLORS[1], ok: av.wind.any, note: av.wind.note },
    { key: 'rain', label: 'Regen', dot: '#3A6FA8', ok: av.rain.any, note: av.rain.note, empty: av.rain.emptyLabel },
    { key: 'cloud', label: 'Wolkenbasis', dot: '#B6C8D6', ok: av.cloudBase.any, note: av.cloudBase.note },
    { key: 'snow', label: 'Schneefallgrenze', dot: '#E8F0FA', ok: av.snowLine.any, note: av.snowLine.note },
    { key: 'warn', label: 'Warnzone', dot: '#D7263D', ok: av.warnings.any, note: av.warnings.note, empty: av.warnings.emptyLabel },
  ];
  const timeChips: Array<{ key: keyof LayerFlags; label: string; dot: string; ok: boolean; note: string; empty?: string }> = [
    { key: 'pearls', label: 'Wetterperlen zur ETA', dot: '#C97B47', ok: pearls.length > 1, note: 'Zu wenige Streckenpunkte für Perlen.' },
    {
      // „ohne Daten" wäre hier falsch: die Werte sind da, sie sagen nur nichts
      // Nasses. Ein leerer Layer und eine fehlende Quelle sind zweierlei.
      key: 'wetseg', label: 'Regen auf der Strecke', dot: '#3A6FA8', ok: windows.length > 0, empty: 'trocken',
      note: 'Auf keinem Abschnitt wird zu deiner Ankunftszeit Niederschlag erwartet.',
    },
    { key: 'arrows', label: 'Wind zur Fahrtrichtung', dot: REL_COLORS.tail, ok: av.wind.any, note: av.wind.note },
    { key: 'cloud', label: 'Wolkenbasis', dot: '#B6C8D6', ok: av.cloudBase.any, note: av.cloudBase.note },
    { key: 'snow', label: 'Schneefallgrenze', dot: '#E8F0FA', ok: av.snowLine.any, note: av.snowLine.note },
  ];
  const shown = dmode === 'zeit' ? timeChips : dmode === 'gonogo' ? [] : chips;
  const missing = shown.filter((c) => !c.ok && layers[c.key]);

  const shiftedStart = startMs + shiftMs;

  // Die Zeitbahn ist in beiden Modi dieselbe — nur ihre Stellung wechselt:
  // im Zeitkorridor führt sie (steht oben), sonst folgt sie der Position.
  const statusBands = dmode === 'gonogo'
    ? sections.map((x) => ({
        from: x.fromM / Math.max(1, total),
        to: x.toM / Math.max(1, total),
        color: STATUS_COLORS[x.status],
        label: `km ${kmLabel(x.fromM)}–${kmLabel(x.toM)} · ${STATUS_WORD[x.status]}`,
      }))
    : [];
  const timeBands = dmode === 'gonogo'
    ? sections.map((x) => ({
        from: frac(x.fromMs, scene.startMs, scene.endMs),
        to: frac(x.toMs, scene.startMs, scene.endMs),
        color: STATUS_COLORS[x.status],
        label: `${clock(x.fromMs)}–${clock(x.toMs)} · ${STATUS_WORD[x.status]}`,
      }))
    : [];

  const timeTrack = (
    <Track
      label="Uhrzeit"
      kind="time"
      bands={timeBands}
      value={etaMs ?? scene.startMs}
      min={scene.startMs}
      max={Math.max(scene.endMs, scene.startMs + 1)}
      step={TIME_STEP_MS}
      onChange={(ms) => { const d = distAtEta(scene.columns, snapToStep(ms, scene.startMs)); if (d != null) setPos(d); }}
      leftLabel={`${clock(scene.startMs)} Start`}
      rightLabel={`${clock(scene.endMs)} Ankunft`}
      zones={scene.warnZones.map((z) => ({
        from: frac(z.fromMs, scene.startMs, scene.endMs),
        to: frac(z.toMs, scene.startMs, scene.endMs),
        label: `${z.event} · ${clock(z.fromMs)}–${clock(z.toMs)}`,
        kind: 'warn' as const,
      }))}
      marks={windows.map((w) => ({
        from: frac(w.fromMs, scene.startMs, scene.endMs),
        to: frac(w.toMs, scene.startMs, scene.endMs),
        label: `Regenfenster ${hhmm(w.fromMs)}–${hhmm(w.toMs)}`,
        kind: 'rain' as const,
      }))}
    />
  );

  return (
    <div className={`r3-root${isMobile ? ' r3-root--m' : ''}`}>
      <header className="r3-head">
        <div className="r3-head-main">
          <span className="r3-eyebrow">
            3D-Ansicht · {stage === 'terrain'
              ? 'Gelände'
              : dmode === 'zeit' ? 'Zeitkorridor' : dmode === 'gonogo' ? 'Go / No-Go' : 'Wetter entlang der Route'}
          </span>
          <h2 className="r3-title">{tourName}</h2>
          {dmode === 'zeit' && (
            <p className="r3-question">Wo bin ich um welche Uhrzeit — und was zieht dann über mich hinweg?</p>
          )}
          {dmode === 'gonogo' && (
            <p className="r3-question">Wo wird es kritisch — und warum genau dort?</p>
          )}
          <p className="r3-sub">
            {formatDay(startMs)} · Start {clock(startMs)} · {(total / 1000).toFixed(1).replace('.', ',')} km
            {arrivalMs ? <> · Ankunft <b>{clock(arrivalMs)}</b></> : null}
            {movementLabel ? ` · ${movementLabel}` : ''}
          </p>
        </div>
        {/* Auf dem Handy trägt die Shell-Kopfzeile den Umschalter bereits —
            ein zweiter daneben wäre dasselbe Bedienelement zweimal. */}
        {!isMobile && (
          <div className="r3-head-side">
            {toggle}
            <span className="r3-head-hint">Strecke, Zeit und Parameter bleiben beim Wechsel erhalten</span>
          </div>
        )}
      </header>

      <div className="r3-moderow">
        {stage === 'section' ? (
          <span className="r3-modes" role="group" aria-label="Frage der Ansicht">
            <button
              type="button"
              className={mode === 'wetter' ? 'is-on' : undefined}
              aria-pressed={mode === 'wetter'}
              onClick={() => setMode('wetter')}
            >
              Wetter entlang der Route
            </button>
            <button
              type="button"
              className={mode === 'zeit' ? 'is-on' : undefined}
              aria-pressed={mode === 'zeit'}
              onClick={() => setMode('zeit')}
            >
              Zeitkorridor
            </button>
            <button
              type="button"
              className={mode === 'gonogo' ? 'is-on' : undefined}
              aria-pressed={mode === 'gonogo'}
              onClick={() => setMode('gonogo')}
            >
              Grenzwerte
            </button>
          </span>
        ) : (
          <span className="r3-modehint">
            Zeitkorridor und Grenzwerte beantwortet der <b>Schnitt</b> — sie brauchen die Höhenachse.
          </span>
        )}
        {dmode === 'zeit' && <span className="r3-radarchip" title={radarHorizonNote(meta.radar, scene.endMs)}>{radarChip}</span>}
        <span className="r3-stagesw" role="group" aria-label="Darstellung">
          <button
            type="button"
            className={stage === 'section' ? 'is-on' : undefined}
            aria-pressed={stage === 'section'}
            onClick={() => setStage('section')}
            title="Axonometrischer Schnitt — Höhenachse, Windbänder, Grenzwertzonen"
          >
            Schnitt
          </button>
          <button
            type="button"
            className={stage === 'terrain' ? 'is-on' : undefined}
            aria-pressed={stage === 'terrain'}
            onClick={() => setStage('terrain')}
            title="Karte mit echtem 3D-Relief und der Wetterwand entlang der Strecke"
          >
            Gelände
          </button>
        </span>
      </div>

      {stage === 'terrain' ? (
        <div className="r3-chiprow">
          {/* Zwei Gruppen, und die erste ist der Boden: eine Tour fragt, wie das
              Wetter DORT ist, wo man geht — nicht, was 3 km darüber liegt.
              Die Liste kommt aus `terrainChips` — dieselben Schalter wie im
              Ergebnis, nur ein anderes Layout (R3D-8). */}
          <div className="r3-chips" role="group" aria-label="Ebenen der Gelände-Ansicht">
            <span className="r3-chipgrp">Am Boden</span>
            {tChips.filter((c) => c.group === 'ground').map((c) => (
              <TerrainChipButton key={c.key} chip={c} on={tLayers[c.key]} onToggle={toggleTLayer} />
            ))}
            <span className="r3-chipgrp">In der Luft</span>
            {tChips.filter((c) => c.group === 'air').map((c) => (
              <TerrainChipButton key={c.key} chip={c} on={tLayers[c.key]} onToggle={toggleTLayer} />
            ))}
          </div>
          <span className="r3-res" title={resolutionNote(terrain)}>
            <IconInfo /> Auflösung {resolutionChip(terrain)}
          </span>
        </div>
      ) : dmode === 'gonogo' ? (
        <LimitRow
          limits={limits}
          summaries={summaries}
          touched={stored.touched}
          warnKnown={warnKnown}
          open={editorOpen}
          onOpen={() => setEditorOpen((v) => !v)}
          onPatch={patchLimit}
        />
      ) : (
      <div className="r3-chiprow">
        <div className="r3-chips" role="group" aria-label="Wetter-Ebenen">
          {shown.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`r3-chip${layers[c.key] ? ' is-on' : ''}${c.ok ? '' : ' is-empty'}`}
              aria-pressed={layers[c.key]}
              title={c.ok ? undefined : c.note}
              onClick={() => toggleLayer(c.key)}
            >
              <span className="r3-chip-dot" style={{ background: c.dot }} />
              {c.label}
              {!c.ok && <span className="r3-chip-empty">{c.empty ?? 'ohne Daten'}</span>}
            </button>
          ))}
        </div>
        <span className="r3-res" title={resolutionNote(terrain)}>
          <IconInfo /> Auflösung {resolutionChip(terrain)}
        </span>
      </div>
      )}

      <div className="r3-main">
        <div className={`r3-stage${dmode === 'zeit' ? ' r3-stage--time' : ''}${dmode === 'gonogo' ? ' r3-stage--go' : ''}${stage === 'terrain' ? ' r3-stage--terrain' : ''}`}>
          {stage === 'terrain' ? (
            routeSection ? (
              <Suspense fallback={<div className="r3-tmap-wait">Gelände wird geladen …</div>}>
                <RouteTerrainMap
                  points={points}
                  section={routeSection.section}
                  layers={tLayers}
                  wet={windows}
                  tempSegments={ground.tempSegments}
                  warnSegments={ground.warnSegments}
                  arrows={ground.arrows}
                  markerM={pos}
                  onPickDist={setPos}
                  isMobile={isMobile}
                />
              </Suspense>
            ) : (
              <div className="r3-tmap-fallback">
                <p><b>Für diese Tour lässt sich keine Wetterwand bauen.</b></p>
                <p>Kein Punkt der Strecke trägt Temperatur und Wind — ohne beides gibt es keine Vertikale.</p>
              </div>
            )
          ) : (
          <>
          <Scene3D
            scene={scene}
            layers={sceneLayers}
            exaggeration={exaggeration}
            markerM={pos}
            isMobile={isMobile}
            onPickDist={setPos}
            mode={mode}
            pearls={pearls}
            windows={windows}
            sections={dmode === 'gonogo' ? sections : []}
          />
          {dmode === 'gonogo' && !isMobile && whySection && whyCol && (
            <WhyCard sec={whySection} col={whyCol} onClose={undefined} />
          )}

          {dmode === 'zeit' && layers.wetseg && (hitWindow || comingWindow) && (
            <div className={`r3-hit${hitWindow ? ' is-now' : ''}`}>
              <span className="r3-hit-lab">{hitWindow ? 'Du bist drin' : 'Trifft dich'}</span>
              <span className="r3-hit-val">
                {(() => {
                  const w = hitWindow ?? comingWindow!;
                  return `${hhmm(w.fromMs)}–${hhmm(w.toMs)} · km ${(w.fromM / 1000).toFixed(1).replace('.', ',')}–${(w.toM / 1000).toFixed(1).replace('.', ',')}`;
                })()}
              </span>
              <span className="r3-hit-src">
                {(() => {
                  const w = hitWindow ?? comingWindow!;
                  const src = w.source === 'radar' ? 'Radar-Nowcast' : w.source === 'nwp' ? 'Modellwert' : 'Radar + Modell';
                  return `bis ${w.peakMmH.toFixed(1).replace('.', ',')} mm/h · ${src}`;
                })()}
              </span>
            </div>
          )}
          {dmode === 'zeit' && !isMobile && (
            <div className="r3-axisnote">
              <span className="r3-axisnote-lab">Die Route ist die Zeitachse</span>
              <span className="r3-axisnote-val">Jede Perle = deine Ankunft dort</span>
              <span className="r3-axisnote-sub">Süd → Nord · Überhöhung {exaggeration.toFixed(1).replace('.', ',')}×</span>
            </div>
          )}
          {/* EINE Karte je Modus an dieser Stelle — zwei lagen aufeinander. */}
          {dmode === 'gonogo' && (
            <div className="r3-viewcard r3-viewcard--go">
              <span className="r3-viewcard-lab">Farbe = Entscheidung</span>
              <span className="r3-viewcard-val">Das Gelände bleibt stumm, bis du fragst</span>
              <span className="r3-viewcard-sub">Süd → Nord · Überhöhung {exaggeration.toFixed(1).replace('.', ',')}×</span>
            </div>
          )}
          {dmode === 'wetter' && <div className="r3-viewcard">
            <span className="r3-viewcard-lab">Blick</span>
            <span className="r3-viewcard-val">Süd → Nord · Überhöhung {exaggeration.toFixed(1).replace('.', ',')}×</span>
          </div>}
          <div className="r3-zoom">
            <button type="button" onClick={() => setExaggeration(DEFAULT_EXAGGERATION)} aria-label="Überhöhung zurücksetzen">⟲</button>
            <button type="button" onClick={() => setExaggeration((v) => Math.min(MAX_EXAGGERATION, v + 0.4))} aria-label="Überhöhung erhöhen">+</button>
            <button type="button" onClick={() => setExaggeration((v) => Math.max(MIN_EXAGGERATION, v - 0.4))} aria-label="Überhöhung verringern">−</button>
          </div>
          </>
          )}
          {stage === 'terrain' && (
            <div className="r3-viewcard">
              <span className="r3-viewcard-lab">Am Boden</span>
              <span className="r3-viewcard-val">Farbe = Temperatur · Pfeile = Wind zur Fahrtrichtung</span>
              <span className="r3-viewcard-sub">Relief aus dem Höhenmodell · Klick auf die Strecke setzt die Position</span>
            </div>
          )}
        </div>

        <aside className={`r3-side${dmode === 'zeit' ? ' r3-side--time' : ''}`}>
          {dmode === 'zeit' ? (
            <>
              <TimelinePanel rows={timeline} activeMs={etaMs} />
              <AdviceCard
                advice={advice}
                note={adviceNote}
                onApply={onStart ? (ms) => onStart(ms) : undefined}
              />
              <StartWindowChart entries={meta.startWindow} startMs={startMs} />
            </>
          ) : dmode === 'gonogo' ? (
            <>
              <StatusCard status={overall} sec={lead} warnZones={scene.warnZones} />
              <SectionList
                sections={sections}
                activeM={pos}
                onPick={(m) => setPos(m)}
                why={isMobile && whySection && whyCol
                  ? { open: whyOpen, onToggle: () => setWhyOpen((v) => !v), sec: whySection, col: whyCol }
                  : null}
              />
              <GoWindowCard
                hit={goHit}
                note={goNote}
                onApply={onStart && goHit ? () => onStart(goHit.startMs) : undefined}
              />
              <ReportRow
                onCopy={() => void shareReport()}
                onPrint={() => window.print()}
              />
            </>
          ) : (
            <PointReadout col={col} etaMs={etaMs} scene={scene} layers={layers} />
          )}
        </aside>
      </div>

      {missing.length > 0 && (
        <ul className="r3-gaps">
          {missing.map((m) => (
            <li key={m.key}><IconWarning size={13} /> <b>{m.label}:</b> {m.note}</li>
          ))}
        </ul>
      )}

      <section className="r3-sliders">
        <div className="r3-sliders-head">
          <span className="r3-sliders-title">
            {dmode === 'zeit'
              ? (coupled ? 'Uhrzeit führt — Position folgt' : 'Uhrzeit entkoppelt')
              : `Position & Zeit — ${coupled ? 'gekoppelt' : 'entkoppelt'}`}
            {dmode === 'gonogo' && <span className="r3-sliders-badge">Status wandert mit</span>}
          </span>
          <button
            type="button"
            className={`r3-couple${coupled ? ' is-on' : ''}`}
            aria-pressed={coupled}
            onClick={() => { setCoupled((v) => !v); setShiftMs(0); }}
          >
            {coupled ? '🔒 gekoppelt' : '🔓 entkoppelt'}
          </button>
          <span className="r3-sliders-note">
            {coupled
              ? 'Ein Regler bewegt beide — deine Ankunftszeit bestimmt das Wetter.'
              : 'Andere Startzeit durchspielen. Die Werte gehören weiter zur berechneten Ankunft, bis du neu rechnest.'}
          </span>
          <span className="r3-sliders-live">
            {dmode === 'zeit' ? liveLine(col, etaMs) : dmode === 'gonogo' ? (
              <span className={`r3-live r3-live--${hereSection?.status ?? 'go'}`}>
                km {kmLabel(pos)} · {etaMs ? clock(etaMs) : '—'} ·{' '}
                {hereSection ? STATUS_WORD[hereSection.status] : '—'}
                {hereSection?.lead
                  ? ` · ${limitDef(hereSection.lead.id).label} ${limitDef(hereSection.lead.id).fmt(hereSection.lead.value)}`
                    + ` gegen ${limitDef(hereSection.lead.id).fmt(hereSection.lead.limit)}`
                  : ''}
              </span>
            ) : (
              <>
                km {(pos / 1000).toFixed(1).replace('.', ',')} · {etaMs ? clock(etaMs) : '—'}
                {col?.tempC != null ? ` · ${Math.round(col.tempC)}°` : ''}
                {col?.batteryPct != null ? ` · Akku ${Math.round(col.batteryPct)} %` : ''}
              </>
            )}
          </span>
        </div>

        {dmode === 'zeit' && coupled && timeTrack}

        <Track
          label="Position"
          kind="pos"
          bands={statusBands}
          value={pos}
          min={0}
          max={total}
          step={Math.max(10, total / 400)}
          onChange={setPos}
          leftLabel="0 km"
          rightLabel={`${(total / 1000).toFixed(1).replace('.', ',')} km`}
          zones={scene.warnZones.map((z) => ({ from: z.fromM / total, to: z.toM / total, label: `${z.event} · km ${(z.fromM / 1000).toFixed(1)}–${(z.toM / 1000).toFixed(1)}`, kind: 'warn' as const }))}
          marks={scene.rain.map((r) => ({ from: r.fromM / total, to: r.toM / total, kind: 'rain' as const }))}
        />

        {coupled ? (dmode === 'zeit' ? null : timeTrack) : (
          <div className="r3-shift">
            <label className="r3-shift-lab" htmlFor="r3-shift">Startzeit verschieben</label>
            <input
              id="r3-shift"
              type="range"
              min={-3 * 60 * 60 * 1000}
              max={3 * 60 * 60 * 1000}
              step={TIME_STEP_MS}
              value={shiftMs}
              onChange={(e) => setShiftMs(Number(e.target.value))}
            />
            <span className="r3-shift-val">
              {shiftMs === 0 ? 'unverändert' : `${shiftMs > 0 ? '+' : '−'}${Math.abs(shiftMs / 60000)} min`} → Start {clock(shiftedStart)}
            </span>
            <button
              type="button"
              className="r3-shift-apply"
              disabled={shiftMs === 0 || !onStart}
              onClick={() => { onStart?.(shiftedStart); setShiftMs(0); setCoupled(true); }}
            >
              Mit {clock(shiftedStart)} neu rechnen
            </button>
          </div>
        )}

        <div className="r3-playrow">
          {reduced ? (
            <span className="r3-play-off">Abspielen ist aus — dein System bevorzugt reduzierte Bewegung. Nutze die Schritte.</span>
          ) : (
            <button type="button" className="r3-play" onClick={() => setPlaying((v) => !v)} aria-label={playing ? 'Pause' : 'Tour abspielen'}>
              {playing ? <IconPause /> : <IconPlay />}
              <span>{playing ? 'Pause' : dmode === 'zeit' ? 'Zeit abspielen' : 'Tour abspielen'} · 15-Min-Raster</span>
            </button>
          )}
          <span className="r3-steps">
            <button type="button" onClick={() => stepBy(-1)} aria-label="Ein Zeitschritt zurück"><IconStepBack /></button>
            <button type="button" onClick={() => stepBy(1)} aria-label="Ein Zeitschritt vor"><IconStepForward /></button>
          </span>
        </div>
      </section>

      <SchedulePanel
        schedule={schedule}
        gaps={scheduleGaps}
        activeM={pos}
        onPick={(m) => setPos(m)}
        onCopy={() => void copySchedule()}
      />

      <p className="r3-foot">
        <span className="dot">●</span>{' '}
        {stage === 'terrain' ? (
          <>
            {curtainNote({ useGust: tLayers.gust, temp: tLayers.wallTemp, clouds: tLayers.clouds })}{' '}
            {NO_INVERSION_NOTE}{' '}
            Quellen: {sourceNote(meta.countries)} · {resolutionNote(terrain)} ·{' '}
            {terrainNote(elevation.source, elevation.deltaM, relief.map((r) => r.offsetM))} · {HAIL_NOTE}
          </>
        ) : dmode === 'zeit' ? (
          <>
            {radarHorizonNote(meta.radar, scene.endMs)} · Perlen zeigen die höhenkorrigierte Temperatur zur
            Ankunftszeit · Quellen: {sourceNote(meta.countries)} · {resolutionNote(terrain)} ·{' '}
            {terrainNote(elevation.source, elevation.deltaM, relief.map((r) => r.offsetM))}
          </>
        ) : dmode === 'gonogo' ? (
          <>
            Der Status wird gegen <b>deine eigenen Grenzwerte</b> gerechnet — sie sind deine Vorgabe, keine amtliche
            Empfehlung. Werte gelten auf der Höhe, auf der du stehst (Cluster-Forecast auf die Sample-Höhe korrigiert).
            Bei einer Konfidenz unter {UNCLEAR_TEXT} steht „unklar" statt einer Entscheidung — nie „Go".
            Eine Sichtweite führt keine der drei Quellen; einen Grenzwert dafür gibt es deshalb nicht.
            Quellen: {sourceNote(meta.countries)} · {resolutionNote(terrain)} ·{' '}
            {terrainNote(elevation.source, elevation.deltaM, relief.map((r) => r.offsetM))}
          </>
        ) : (
          <>
            Höhen in m ü. NN · Wind über Grund aus dem Bodenwert hochgerechnet (Potenzprofil α&nbsp;{DEFAULT_ALPHA}) ·
            Quellen: {sourceNote(meta.countries)} · {resolutionNote(terrain)} ·{' '}
            {terrainNote(elevation.source, elevation.deltaM, relief.map((r) => r.offsetM))} · {HAIL_NOTE}
          </>
        )}
      </p>
    </div>
  );

  /**
   * Die Auswertung als Text. **Kein Link** — der Tour-Zustand steht in keiner
   * URL (B3/C7); ein geteilter Link führte auf eine leere Tourenplanung.
   */
  async function shareReport() {
    const text = buildGoNoGoReport({
      title: tourName,
      movementLabel: movementLabel ?? 'ohne Angabe',
      startMs: scene.startMs,
      endMs: scene.endMs,
      totalM: total,
      stackLabel: sourceNote(meta.countries),
      sections,
      limits,
      unavailable: summaries.filter((x) => x.kind === 'missing').map((x) => x.id),
    });
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
    } catch { /* abgebrochen oder verweigert — dann bleibt es beim Versuch */ }
  }

  function stepBy(dir: 1 | -1) {
    const cur = etaAtDist(scene.columns, pos) ?? scene.startMs;
    const d = distAtEta(scene.columns, cur + dir * TIME_STEP_MS);
    if (d != null) setPos(d);
  }
}

/* ========================= Zeitkorridor (1b) ========================= */

/** „Dein Zeitfenster": jede Zeile trägt ihre Aussage in Worten. */
function TimelinePanel({ rows, activeMs }: { rows: TimelineRow[]; activeMs: number | null }) {
  if (rows.length === 0) return <div className="r3-side-empty">Für diese Tour lässt sich kein Zeitfenster bilden.</div>;
  let activeIdx = -1;
  if (activeMs != null) {
    let bd = Infinity;
    rows.forEach((r, i) => { const d = Math.abs(r.atMs - activeMs); if (d < bd) { bd = d; activeIdx = i; } });
  }
  return (
    <section className="r3-timeline">
      <h3 className="r3-side-h">Dein Zeitfenster</h3>
      <ul>
        {rows.map((r, i) => (
          <li key={r.atMs} className={`r3-tl-row r3-tl-row--${r.tone}${i === activeIdx ? ' is-now' : ''}`}>
            <span className="r3-tl-time">{hhmm(r.atMs)}</span>
            <span className="r3-tl-text">{r.text}</span>
            <span className="r3-tl-dot" aria-hidden="true" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * „Besserer Start". Die Empfehlung nennt beide Zahlen und sagt dazu, dass sie
 * mit unveränderten Fahrzeiten gerechnet ist (audit B12) — der Knopf rechnet
 * anschließend echt neu.
 */
function AdviceCard({
  advice, note, onApply,
}: { advice: ReturnType<typeof startAdvice>; note: string; onApply?: (ms: number) => void }) {
  if (!advice) {
    return (
      <section className="r3-advice r3-advice--none">
        <h3 className="r3-side-h">Bessere Startzeit</h3>
        <p>{note}</p>
      </section>
    );
  }
  return (
    <section className="r3-advice">
      <h3 className="r3-side-h">Besserer Start</h3>
      <p className="r3-advice-big">{hhmm(advice.newStartMs)}</p>
      <p className="r3-advice-txt">{advice.reason}</p>
      <button type="button" className="r3-advice-apply" disabled={!onApply} onClick={() => onApply?.(advice.newStartMs)}>
        Startzeit übernehmen
      </button>
    </section>
  );
}

/**
 * Regen je Startzeit. **Keine Wahrscheinlichkeit** — die gibt es in dieser
 * Kette nicht (audit B8). Die Balken zeigen gerechnete Regenminuten der Tour
 * für jede Startzeit im geprüften Fenster.
 */
function StartWindowChart({ entries, startMs }: { entries: import('../../pointForecast/weatherEnrichment').StartWindowEntry[]; startMs: number }) {
  const usable = entries.filter((e) => e.complete);
  if (usable.length < 3) return null;
  const peak = Math.max(...usable.map((e) => e.wetMin));
  if (peak === 0) {
    return (
      <section className="r3-swchart">
        <h3 className="r3-side-h">Regen je Startzeit</h3>
        <p className="r3-swnote">
          Im geprüften Fenster ({hhmm(startMs + usable[0].offsetMin * 60_000)}–
          {hhmm(startMs + usable[usable.length - 1].offsetMin * 60_000)}) bleibt <b>jede</b> Startzeit trocken.
        </p>
      </section>
    );
  }
  const max = Math.max(1, peak);
  const W = 300, H = 96, PAD_B = 18, PAD_T = 6;
  const bw = W / usable.length;
  const radarShare = usable.reduce((a, e) => a + e.radarShare, 0) / usable.length;
  return (
    <section className="r3-swchart">
      <h3 className="r3-side-h">Regen je Startzeit</h3>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Minuten im Regen je möglicher Startzeit">
        {usable.map((e, i) => {
          const h = (e.wetMin / max) * (H - PAD_B - PAD_T);
          const isNow = e.offsetMin === 0;
          return (
            <rect
              key={e.offsetMin}
              x={i * bw + 1.5}
              y={H - PAD_B - h}
              width={Math.max(2, bw - 3)}
              height={Math.max(e.wetMin > 0 ? 1.5 : 0, h)}
              className={`r3-swbar${isNow ? ' is-now' : ''}`}
            >
              <title>{`Start ${hhmm(startMs + e.offsetMin * 60_000)} · ${e.wetMin} min Regen`}</title>
            </rect>
          );
        })}
        <line x1={0} y1={H - PAD_B} x2={W} y2={H - PAD_B} className="r3-swaxis" />
        <text x={0} y={H - 5} className="r3-swtick">{hhmm(startMs + usable[0].offsetMin * 60_000)}</text>
        <text x={W} y={H - 5} className="r3-swtick" textAnchor="end">{hhmm(startMs + usable[usable.length - 1].offsetMin * 60_000)}</text>
      </svg>
      <p className="r3-swnote">
        Minuten der Tour im Regen, gerechnet für jede Startzeit — <b>keine Wahrscheinlichkeit</b>.
        {radarShare > 0.05
          ? ` ${Math.round(radarShare * 100)} % der Werte stammen aus dem Radar-Nowcast, der Rest aus dem Modell.`
          : ' Alle Werte stammen aus dem Modell.'}
      </p>
    </section>
  );
}

/* ============================ Punkt-Abfrage ============================ */

function PointReadout({ col, etaMs, scene, layers }: { col: SceneColumn | null; etaMs: number | null; scene: SceneModel; layers: LayerFlags }) {
  if (!col) return <div className="r3-side-empty">Keine Werte an dieser Position.</div>;
  const warn = scene.warnZones.find((z) => col.distM >= z.fromM && col.distM <= z.toM) ?? null;
  const confWind = confidenceWord(meanConfidence(scene.columns, 'wind'));
  const confRain = confidenceWord(meanConfidence(scene.columns, 'precipitation'));
  const relWord = col.windRel === 'head' ? 'Gegenwind' : col.windRel === 'tail' ? 'Rückenwind' : col.windRel === 'cross' ? 'Seitenwind' : null;

  return (
    <div className="r3-readout">
      <span className="r3-readout-eyebrow">Punkt-Abfrage · km {(col.distM / 1000).toFixed(1).replace('.', ',')}</span>
      <div className="r3-readout-temp">
        <span className="r3-temp-big">{col.tempC != null ? `${Math.round(col.tempC)}°` : '—'}</span>
        {col.apparentC != null && <span className="r3-temp-app">gefühlt {Math.round(col.apparentC)}°</span>}
      </div>
      <p className="r3-readout-meta">
        {etaMs ? clock(etaMs) : '—'} · {Math.round(col.terrainM)} m ü. NN · höhenkorrigiert
      </p>

      <div className="r3-cards">
        <Card label="Wind" value={col.windKmh != null ? `${Math.round(col.windKmh)} km/h` : '—'}
          sub={windSub(col, relWord)}
          tone={col.windRel === 'head' ? 'warn' : 'plain'} />
        <Card label="Böen" value={col.gustKmh != null ? `${Math.round(col.gustKmh)} km/h` : '—'}
          sub="am Boden gemessen, nach oben gerechnet" tone={(col.gustKmh ?? 0) >= 60 ? 'crit' : 'plain'} />
        <Card label="Regen" value={wet(col) ? `${(col.precipMmH ?? 0).toFixed(1).replace('.', ',')} mm/h` : col.precipMmH != null ? 'trocken' : '—'}
          sub={!wet(col)
            ? (col.precipSource === 'radar' ? 'Radar sieht nichts' : col.precipSource === 'nwp' ? 'Modell erwartet nichts' : 'kein Niederschlag gemeldet')
            : col.precipSource === 'radar' ? 'Radar-Nowcast' : col.precipSource === 'nwp' ? 'Modellwert' : 'Quelle unbenannt'}
          tone={wet(col) && col.precipSource === 'radar' ? 'steel' : 'plain'} />
        <Card label="Wolkenbasis" value={col.cloudBaseM != null ? `${Math.round(col.cloudBaseM)} m` : '—'}
          sub={col.cloudBaseM != null ? (col.terrainM >= col.cloudBaseM ? 'du bist darin' : 'Weg bleibt darunter') : 'nicht bestimmbar'} />
      </div>

      {layers.warn && warn && (
        <div className="r3-warnbox">
          <IconWarning size={14} />
          <span>
            <b>{warn.event} (Level {warn.level})</b> — km {(warn.fromM / 1000).toFixed(1).replace('.', ',')} bis {(warn.toM / 1000).toFixed(1).replace('.', ',')}, gültig {clock(warn.fromMs)}–{clock(warn.toMs)}.
            <span className="r3-warnbox-src"> Amtliche Warnung des DWD, wortwörtlich: „{warn.headline}"</span>
          </span>
        </div>
      )}

      <div className="r3-confbox">
        <IconInfo />
        <span>
          Konfidenz — Wind <b>{confWind ?? '—'}</b>, Regen <b>{confRain ?? '—'}</b>.
          {(confWind === 'unklar' || confRain === 'unklar') && ' Bei „unklar" nennt die Ansicht keine Entscheidung, nur die Werte.'}
          {' '}Die Wandfarben sind stufig — jede Stufe ist eine Spanne, keine Nachkommastelle.
        </span>
      </div>

      <MiniProfile col={col} />
    </div>
  );
}

/** Mini-Vertikalschnitt am Marker: Mittelwind gegen Böen über der Höhe. */
function MiniProfile({ col }: { col: SceneColumn }) {
  const W = 300, H = 132, PAD_L = 34, PAD_B = 24, PAD_T = 10, PAD_R = 8;
  if (col.windKmh == null) return null;
  const topAgl = 2000;
  const maxKmh = Math.max(40, Math.ceil((windAtAGL(col.gustKmh ?? col.windKmh, topAgl, DEFAULT_ALPHA)) / 10) * 10);
  const xOf = (kmh: number) => PAD_L + (kmh / maxKmh) * (W - PAD_L - PAD_R);
  const yOf = (agl: number) => H - PAD_B - (agl / topAgl) * (H - PAD_B - PAD_T);
  const line = (base: number) => {
    const pts: string[] = [];
    for (let agl = 0; agl <= topAgl; agl += 200) pts.push(`${xOf(windAtAGL(base, agl, DEFAULT_ALPHA)).toFixed(1)},${yOf(agl).toFixed(1)}`);
    return pts.join(' ');
  };
  return (
    <div className="r3-mini">
      <span className="r3-mini-lab">Schnitt am Marker</span>
      <svg viewBox={`0 0 ${W} ${H}`} className="r3-mini-svg" role="img" aria-label="Mittelwind und Böen über der Höhe">
        {[0, 1000, 2000].map((agl) => (
          <g key={agl}>
            <line x1={PAD_L} y1={yOf(agl)} x2={W - PAD_R} y2={yOf(agl)} className="r3-mini-grid" />
            <text x={PAD_L - 5} y={yOf(agl) + 4} className="r3-mini-tick" textAnchor="end">{Math.round(col.terrainM + agl)}</text>
          </g>
        ))}
        <polyline points={line(col.windKmh)} className="r3-mini-mean" />
        {col.gustKmh != null && <polyline points={line(col.gustKmh)} className="r3-mini-gust" />}
      </svg>
      <span className="r3-mini-legend">
        <i className="r3-mini-key r3-mini-key--mean" /> Mittelwind
        <i className="r3-mini-key r3-mini-key--gust" /> Böen · km/h über m ü. NN
      </span>
    </div>
  );
}

/* ========================= Grenzwerte (1c) ========================= */

/**
 * Die Chip-Zeile „Meine Grenzwerte" samt Editor.
 *
 * Jeder Chip trägt den eingestellten Grenzwert UND den schlechtesten Wert der
 * Strecke — ein Ton ohne Zahl wäre in einer Entscheidungsansicht wertlos
 * (§17.3 C8). Solange der Nutzer die Startwerte nicht angefasst hat, sagt die
 * Zeile ausdrücklich, dass es Startwerte sind und keine Empfehlung (§17.5 G1).
 */
function LimitRow({
  limits, summaries, touched, warnKnown, open, onOpen, onPatch,
}: {
  limits: LimitSet;
  summaries: LimitSummary[];
  touched: boolean;
  warnKnown: boolean;
  open: boolean;
  onOpen: () => void;
  onPatch: (id: LimitId, v: number | null) => void;
}) {
  const inactive = LIMITS.filter((d) => limits[d.id] == null);
  return (
    <div className="r3-limitrow">
      <div className="r3-limits" role="group" aria-label="Meine Grenzwerte">
        <span className="r3-limits-lab">Meine Grenzwerte</span>
        {summaries.map((sum) => {
          const d = limitDef(sum.id);
          const v = limits[sum.id]!;
          return (
            <button
              key={sum.id}
              type="button"
              className={`r3-limit r3-limit--${sum.kind}`}
              onClick={onOpen}
              aria-expanded={open}
            >
              {d.text(v)}
              <span className="r3-limit-now">
                {sum.kind === 'missing'
                  ? 'ohne Daten'
                  : sum.kind === 'over'
                    ? `überschritten · ${d.fmt(sum.value!)}`
                    : d.fmt(sum.value!)}
              </span>
            </button>
          );
        })}
        <button type="button" className="r3-limit r3-limit--add" onClick={onOpen} aria-expanded={open}>
          {inactive.length ? '+ Grenzwert' : 'bearbeiten'}
        </button>
      </div>
      <span className={`r3-limits-profile${touched ? '' : ' is-fresh'}`}>
        {touched
          ? 'Grenzwerte · auf diesem Gerät gespeichert'
          : 'Startwerte — keine Empfehlung. Setze deine eigenen.'}
      </span>

      {open && (
        <div className="r3-limited">
          <p className="r3-limited-note">
            Die Grenzwerte sind <b>deine Vorgabe</b>, keine amtliche Empfehlung. Der Status wird gegen sie gerechnet
            und gegen nichts sonst.
          </p>
          {LIMITS.map((d) => {
            const v = limits[d.id];
            const on = v != null;
            return (
              <div key={d.id} className={`r3-limited-row${on ? ' is-on' : ''}`}>
                <label className="r3-limited-name" htmlFor={`lim-${d.id}`}>
                  {d.label}
                  {d.deOnly && (
                    <span className="r3-limited-hint">
                      {warnKnown ? 'nur Deutschland' : 'für diese Strecke ohne Quelle'}
                    </span>
                  )}
                </label>
                {on ? (
                  <>
                    <input
                      id={`lim-${d.id}`}
                      type="range"
                      min={d.min}
                      max={d.max}
                      step={d.step}
                      value={v}
                      onChange={(e) => onPatch(d.id, Number(e.target.value))}
                    />
                    <span className="r3-limited-val">{d.text(v)}</span>
                    <button type="button" className="r3-limited-off" onClick={() => onPatch(d.id, null)}>
                      aus
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="r3-limited-on"
                    onClick={() => onPatch(d.id, d.dir === 'max' ? Math.round((d.min + d.max) / 2) : 0)}
                  >
                    einschalten
                  </button>
                )}
              </div>
            );
          })}
          <button type="button" className="r3-limited-done" onClick={onOpen}>Fertig</button>
        </div>
      )}
    </div>
  );
}

/** Der Gesamtstatus mit seinem Begründungssatz — Wort, Zeitfenster, Grund. */
function StatusCard({ status, sec, warnZones }: { status: GoStatus; sec: GoSection | null; warnZones: WarnZone[] }) {
  return (
    <div className={`r3-status r3-status--${status}`}>
      <div className="r3-status-head">
        <span className="r3-status-word">{STATUS_WORD[status].toUpperCase()}</span>
        {sec && <span className="r3-status-when">{clock(sec.fromMs)} – {clock(sec.toMs)}</span>}
      </div>
      <p className="r3-status-text">
        {sec
          ? reasonSentence(sec, warnZones)
          : 'Auf der ganzen Strecke hält jeder deiner Grenzwerte.'}
      </p>
    </div>
  );
}

/** Die Abschnitte — km, Wort, Zeit und der Wert, der den Status erklärt. */
function SectionList({
  sections, activeM, onPick, why,
}: {
  sections: GoSection[];
  activeM: number;
  onPick: (m: number) => void;
  why: { open: boolean; onToggle: () => void; sec: GoSection; col: SceneColumn } | null;
}) {
  if (!sections.length) return <div className="r3-side-empty">Für diese Tour lassen sich keine Abschnitte bilden.</div>;
  return (
    <div className="r3-secs">
      <span className="r3-secs-lab">Abschnitte</span>
      <ul>
        {sections.map((s, i) => {
          const active = activeM >= s.fromM && activeM <= s.toM;
          const d = s.lead ? limitDef(s.lead.id) : null;
          return (
            <li key={i} className={`r3-sec r3-sec--${s.status}${active ? ' is-active' : ''}`}>
              <button type="button" onClick={() => onPick((s.fromM + s.toM) / 2)}>
                <span className="r3-sec-km">km {kmLabel(s.fromM)}–{kmLabel(s.toM)} · {STATUS_WORD[s.status]}</span>
                <span className="r3-sec-val">
                  {s.status === 'unklar'
                    ? unclearShort(s.unclear)
                    : d && s.lead ? `${d.label} ${d.fmt(s.lead.value)}` : 'alles im Rahmen'}
                </span>
                <span className="r3-sec-time">{clock(s.fromMs)}–{clock(s.toMs)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {why && (
        <>
          <button type="button" className="r3-secs-why" onClick={why.onToggle} aria-expanded={why.open}>
            {why.open ? 'Schnitt schließen' : `Warum? Schnitt bei km ${kmLabel(why.col.distM)} öffnen`}
          </button>
          {why.open && <WhyCard sec={why.sec} col={why.col} onClose={why.onToggle} />}
        </>
      )}
    </div>
  );
}

/**
 * „Warum genau dort" — dieselbe Stelle, an der die Entscheidung fiel.
 *
 * Der Punkt im Diagramm sitzt auf `REF_AGL` (10 m über Grund) und trägt damit
 * **genau die Zahl**, die auch in der Abschnittsliste steht (§17.3 C9). Die
 * Kurve darüber ist das Potenzprofil — abgeleitet, nicht gemessen; sie erklärt
 * die Lage, sie entscheidet nicht.
 */
function WhyCard({ sec, col, onClose }: { sec: GoSection; col: SceneColumn; onClose?: (() => void) | undefined }) {
  const d = sec.lead ? limitDef(sec.lead.id) : null;
  const asProfile = !!sec.lead && (sec.lead.id === 'gust' || sec.lead.id === 'wind');
  return (
    <div className={`r3-why r3-why--${sec.status}`}>
      <div className="r3-why-head">
        <span className="r3-why-lab">Warum · km {kmLabel(col.distM)}</span>
        {onClose && <button type="button" className="r3-why-x" onClick={onClose} aria-label="Schnitt schließen">×</button>}
      </div>
      <span className="r3-why-when">{clock(col.etaMs)} · {Math.round(col.terrainM)} m ü. NN</span>
      {asProfile && sec.lead ? <WhyProfile col={col} hit={sec.lead} /> : null}
      {!asProfile && d && sec.lead && (
        <span className="r3-why-val">{d.label} {d.fmt(sec.lead.value)} gegen {d.fmt(sec.lead.limit)}</span>
      )}
      <p className="r3-why-text">{reasonSentence(sec)}</p>
    </div>
  );
}

function WhyProfile({ col, hit }: { col: SceneColumn; hit: LimitHit }) {
  const W = 300, H = 140, PAD_L = 40, PAD_B = 26, PAD_T = 12, PAD_R = 10;
  const base = hit.id === 'gust' ? col.gustKmh : col.windKmh;
  if (base == null) return null;
  const topAgl = 2000;
  const maxKmh = Math.max(
    Math.ceil((hit.limit * 1.25) / 10) * 10,
    Math.ceil(windAtAGL(base, topAgl, DEFAULT_ALPHA) / 10) * 10,
  );
  const xOf = (kmh: number) => PAD_L + (kmh / maxKmh) * (W - PAD_L - PAD_R);
  const yOf = (agl: number) => H - PAD_B - (agl / topAgl) * (H - PAD_B - PAD_T);
  const line = (v: number) => {
    const pts: string[] = [];
    for (let agl = 0; agl <= topAgl; agl += 200) pts.push(`${xOf(windAtAGL(v, agl, DEFAULT_ALPHA)).toFixed(1)},${yOf(agl).toFixed(1)}`);
    return pts.join(' ');
  };
  const cloudAgl = col.cloudBaseM != null ? col.cloudBaseM - col.terrainM : null;
  const snowAgl = col.snowLineM != null ? col.snowLineM - col.terrainM : null;
  const limX = xOf(hit.limit);

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="r3-why-svg" role="img"
        aria-label={`Wind über der Höhe mit deinem Grenzwert ${Math.round(hit.limit)} km/h`}>
        {/* Bereich jenseits des Grenzwerts */}
        <rect x={limX} y={PAD_T} width={Math.max(0, W - PAD_R - limX)} height={H - PAD_B - PAD_T} className="r3-why-over" />
        {[0, 1000, 2000].map((agl) => (
          <g key={agl}>
            <line x1={PAD_L} y1={yOf(agl)} x2={W - PAD_R} y2={yOf(agl)} className="r3-mini-grid" />
            <text x={PAD_L - 5} y={yOf(agl) + 4} className="r3-mini-tick" textAnchor="end">{Math.round(col.terrainM + agl)}</text>
          </g>
        ))}
        {cloudAgl != null && cloudAgl > 0 && cloudAgl < topAgl && (
          <g className="r3-why-plane r3-why-plane--cloud">
            <line x1={PAD_L} y1={yOf(cloudAgl)} x2={W - PAD_R} y2={yOf(cloudAgl)} />
            <text x={PAD_L + 4} y={yOf(cloudAgl) - 4}>Wolkenbasis {Math.round(col.cloudBaseM!)} · abgeleitet</text>
          </g>
        )}
        {snowAgl != null && snowAgl > 0 && snowAgl < topAgl && (
          <g className="r3-why-plane r3-why-plane--snow">
            <line x1={PAD_L} y1={yOf(snowAgl)} x2={W - PAD_R} y2={yOf(snowAgl)} />
            <text x={PAD_L + 4} y={yOf(snowAgl) - 4}>Schnee {Math.round(col.snowLineM!)}</text>
          </g>
        )}
        {col.windKmh != null && <polyline points={line(col.windKmh)} className="r3-mini-mean" />}
        {col.gustKmh != null && <polyline points={line(col.gustKmh)} className="r3-mini-gust" />}
        <line x1={limX} y1={PAD_T} x2={limX} y2={H - PAD_B} className="r3-why-limit" />
        <text x={limX - 4} y={PAD_T + 10} textAnchor="end" className="r3-why-limitlab">
          Grenze {Math.round(hit.limit)}
        </text>
        {/* Der Punkt, an dem entschieden wurde: 10 m über Grund (§17.3 C9). */}
        <circle cx={xOf(base)} cy={yOf(10)} r={4} className="r3-why-dot" />
        <text x={xOf(base) + 7} y={yOf(10) + 4} className="r3-why-dotlab">
          {limitDef(hit.id).label} {Math.round(base)}
        </text>
      </svg>
      <span className="r3-mini-legend">
        <i className="r3-mini-key r3-mini-key--mean" /> Mittelwind
        <i className="r3-mini-key r3-mini-key--gust" /> Böen · km/h über m ü. NN · Kurve abgeleitet
      </span>
      <span className="r3-why-hint">
        Entschieden wird am Punkt — auf der Höhe, auf der du stehst —, nicht auf der Kurve darüber.
      </span>
    </>
  );
}

/** Der früheste Start, der alle prüfbaren Grenzwerte hält. */
function GoWindowCard({
  hit, note, onApply,
}: {
  hit: GoStartHit | null;
  note: string;
  onApply?: (() => void) | undefined;
}) {
  return (
    <div className={`r3-gowin${hit ? ' is-ok' : ''}`}>
      <span className="r3-gowin-lab">Go-Fenster</span>
      {hit ? (
        <span className="r3-gowin-val">
          Start {clock(hit.startMs)} → alle Grenzwerte gehalten
        </span>
      ) : (
        <span className="r3-gowin-val r3-gowin-val--none">Kein Start im Fenster ±2 h hält alles</span>
      )}
      <p className="r3-gowin-note">{note}</p>
      {hit && onApply && hit.offsetMin !== 0 && (
        <button type="button" className="r3-gowin-apply" onClick={onApply}>
          Startzeit übernehmen
        </button>
      )}
    </div>
  );
}

/** Auswertung weitergeben — als Text, nicht als Link (§17.3 C7). */
function ReportRow({ onCopy, onPrint }: { onCopy: () => void; onPrint: () => void }) {
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;
  return (
    <div className="r3-report">
      <button type="button" className="r3-report-main" onClick={onCopy}>
        {canShare ? 'Auswertung teilen' : 'Auswertung kopieren'}
      </button>
      <button type="button" className="r3-report-print" onClick={onPrint}>Druck / PDF</button>
      <p className="r3-report-note">
        Enthält Strecke, Zeit, Höhe, Werte, Grenzwert und Status — als <b>Text</b>. Ein Link ginge nicht: die
        hochgeladene Strecke steht in keiner Adresse.
      </p>
    </div>
  );
}

/* ============================ Bausteine ============================ */

function Card({ label, value, sub, tone = 'plain' }: { label: string; value: string; sub: string; tone?: 'plain' | 'warn' | 'crit' | 'steel' }) {
  return (
    <div className={`r3-card r3-card--${tone}`}>
      <span className="r3-card-lab">{label}</span>
      <span className="r3-card-val">{value}</span>
      <span className="r3-card-sub">{sub}</span>
    </div>
  );
}

interface Zone { from: number; to: number; label?: string; kind: 'warn' | 'rain' }
/** Durchgehende Einfärbung der Bahn nach Abschnittsstatus (1c). */
interface Band { from: number; to: number; color: string; label: string }

function Track({
  label, kind, value, min, max, step, onChange, leftLabel, rightLabel, zones = [], marks = [], bands = [],
}: {
  label: string; kind: 'pos' | 'time'; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; leftLabel: string; rightLabel: string; zones?: Zone[]; marks?: Zone[];
  bands?: Band[];
}) {
  const pct = ((value - min) / Math.max(1e-6, max - min)) * 100;
  return (
    <div className={`r3-track r3-track--${kind}`}>
      <span className="r3-track-lab">{label}</span>
      <div className="r3-track-body">
        <div className={`r3-track-rail${bands.length ? ' has-bands' : ''}`}>
          {bands.map((b, i) => (
            <div
              key={`b${i}`}
              className="r3-track-band"
              style={{ left: `${b.from * 100}%`, width: `${Math.max(0.6, (b.to - b.from) * 100)}%`, background: b.color }}
              title={b.label}
            />
          ))}
          {!bands.length && <div className="r3-track-fill" style={{ width: `${pct}%` }} />}
          {marks.map((m, i) => (
            <div key={`m${i}`} className="r3-track-rain" style={{ left: `${m.from * 100}%`, width: `${Math.max(0.6, (m.to - m.from) * 100)}%` }} />
          ))}
          {zones.map((z, i) => (
            <div key={`z${i}`} className="r3-track-warn" style={{ left: `${z.from * 100}%`, width: `${Math.max(0.8, (z.to - z.from) * 100)}%` }} title={z.label} />
          ))}
        </div>
        <input
          type="range"
          className="r3-track-input"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <div className="r3-track-ends">
          <span>{leftLabel}</span>
          {zones[0]?.label && <span className="r3-track-zonelab">{zones[0].label}</span>}
          <span>{rightLabel}</span>
        </div>
      </div>
    </div>
  );
}

function IconInfo() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="6.6" /><path d="M8 7.2v4M8 4.9v.1" strokeLinecap="round" />
    </svg>
  );
}

/* ============================ Hilfen ============================ */

function frac(v: number, min: number, max: number): number {
  return Math.max(0, Math.min(1, (v - min) / Math.max(1, max - min)));
}

/** Regnet es an diesem Punkt überhaupt? Dieselbe Schwelle wie die Szene. */
function wet(col: SceneColumn): boolean {
  return (col.precipMmH ?? 0) >= RAIN_MIN_MMH;
}

/**
 * Die Himmelsrichtung steht immer (sie ist bekannt); das Wort Gegen-/Rücken-/
 * Seitenwind nur oberhalb der Schwelle, ab der der Wind spürbar schiebt oder
 * bremst — sonst behauptete es eine Wirkung, die es nicht gibt.
 */
function windSub(col: SceneColumn, relWord: string | null): string {
  const dir = col.windDirDeg != null ? `aus ${compass(col.windDirDeg)}` : null;
  if (relWord && dir) return `${relWord} · ${dir}`;
  if (relWord) return relWord;
  if (dir) return `${dir} · zu schwach, um zu schieben oder zu bremsen`;
  return 'Richtung unbekannt';
}

function compass(deg: number): string {
  const dirs = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
}

/** Die Ableseleiste des Zeitkorridors — Zeit führt, alles andere folgt. */
function liveLine(col: SceneColumn | null, etaMs: number | null): string {
  if (!col) return '—';
  const bits = [
    etaMs != null ? hhmm(etaMs) : '—',
    `km ${(col.distM / 1000).toFixed(1).replace('.', ',')}`,
  ];
  if (col.tempC != null) bits.push(`${Math.round(col.tempC)}°`);
  bits.push(
    (col.precipMmH ?? 0) >= RAIN_MIN_MMH
      ? `Regen ${(col.precipMmH ?? 0).toFixed(1).replace('.', ',')} mm/h`
      : 'trocken',
  );
  if (col.windKmh != null) {
    const rel = col.windRel === 'head' ? 'Gegenwind' : col.windRel === 'tail' ? 'Rückenwind' : col.windRel === 'cross' ? 'Seitenwind' : 'Wind';
    bits.push(`${rel} ${Math.round(col.windKmh)} km/h`);
  }
  return bits.join(' · ');
}

function loadStage(): 'section' | 'terrain' {
  try {
    return localStorage.getItem(STAGE_STORE_KEY) === 'terrain' ? 'terrain' : 'section';
  } catch {
    return 'section';
  }
}

function loadMode(): SceneMode {
  try {
    const raw = localStorage.getItem(MODE_STORE_KEY);
    return raw === 'zeit' || raw === 'gonogo' ? raw : 'wetter';
  } catch {
    return 'wetter';
  }
}

function loadLayers(): LayerFlags {
  try {
    const raw = localStorage.getItem(LAYER_STORE_KEY);
    if (!raw) return { ...DEFAULT_LAYERS };
    const parsed = JSON.parse(raw) as Partial<LayerFlags>;
    return { ...DEFAULT_LAYERS, ...parsed };
  } catch {
    return { ...DEFAULT_LAYERS };
  }
}

function saveLayers(l: LayerFlags) {
  try { localStorage.setItem(LAYER_STORE_KEY, JSON.stringify(l)); } catch { /* privater Modus — egal */ }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  const mqRef = useRef<MediaQueryList | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    mqRef.current = mq;
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
