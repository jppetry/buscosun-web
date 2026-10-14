/**
 * **Brandflächen-Panel** (Phase BP2, Gate GBP1) — die Liste der Brand-Registry,
 * seit dem Brandradar-Command-Deck in der Optik der Vorlage B2/B6
 * (`references/brandradar.dc.html`): Kopf „REGISTRY · FENSTER", Sortieren /
 * Umfang als Chips, eine Karte je Brand mit Status-Abzeichen, Fläche MIT
 * Herkunft, Detektionen, Ausbreitungsvektor, Landbedeckung, EMS-Aktivierung
 * und GeoSphere-Kontext; der markierte Brand trägt die Kennzahl-Kacheln und die
 * Detailkarte; darunter der ausgesprochene Deckel („Weitere N Brände laden")
 * und der Vorbehalt.
 *
 * Rein präsentational: Props hinein, Rückrufe hinaus. Zustand (Auswahl, Filter,
 * Sortierung) lebt in `FirePage.tsx`, weil dort der Permalink-Effekt und das
 * Geschwister `FireMap` sitzen.
 *
 * Regeln, die hier gelten (audit/brandflaechen-panel.md §3, BF5):
 *  • Jeder Leerzustand nennt seinen GRUND — „keine Liste" darf nie wie
 *    „keine Brände" aussehen (D-04).
 *  • Deckel 50 Zeilen, ausgesprochen (V-246); die Kopfzeile nennt die volle Zahl.
 *  • Fehlende Werte sind „—" mit Grund im `title`, nie 0.
 *  • Beschriftungen kommen aus `fireRegistry.ts` — EINE Quelle für Liste,
 *    Karte und Verifier. „Bestätigt" fällt nur mit Quelle (EFFIS, EMS).
 */

import { useEffect, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { FirePassChart } from './FirePassChart';
import {
  ChartSkeleton, CopyButton, FactList, FactRow, KeyStats, Missing, MissingBlock, StatTile,
  useDossierBreakpoint,
} from './dossier/DossierPrimitives';
import {
  fetchFireWeatherAtPoint, fetchFireWeatherArchive, rainLabelLive, weatherSummary,
  FIRE_WEATHER_SOURCE_LABEL, FIRE_WEATHER_ATTRIBUTION,
  FIRE_WEATHER_ARCHIVE_LABEL, FIRE_WEATHER_ARCHIVE_ATTRIBUTION, type FireWeatherAtPoint,
} from './detail/fireWeatherAtPoint';
import { FlameIcon, IndustryIcon } from './fireIcons';
import { InfoTileGrid, InfoTileIcon, iconForReason, type InfoIcon } from './dossier/InfoTiles';
import {
  type FireRecord, type RecordSort, type RecordFilter, type FireStatusKind,
  STATUS_LABEL, STATUS_COLOR, METHOD_LABEL, statusLabel, areaLabel, confidenceLabel,
  missingReason, registryNote, provisionalArea, mappingGapText,
} from './footprint/fireRegistry';
import {
  CLUSTER_PAGE, STATIC_GREY, countryLabel,
  strengthLabel, extentLabel, clusterColorOf, CLUSTER_FRP_STOPS, CLUSTER_NOTE,
} from './fireClusters';
import { freLabel, DAYNIGHT_LABEL } from './activity/intensity';
import { activitySummary } from './activity/fireActivity';
import { STATE_LABEL, compassLabel, SPREAD_MIN_M } from './activity/dynamics';
import {
  driverRating, dominantWind, windRose, spreadVsWind, spreadVsWindLabel, fireIndexSeries, indexAt,
  DRIVER_LABEL, DRIVER_RULE_TEXT, FIRE_INDEX_NOTE, STEADY_MIN,
} from './detail/fireDrivers';
import { WindRoseChart, DriverSeriesChart } from './FireDriverCharts';
import { OBSERVATION_LABEL } from './activity/observation';
import { featuresOf, featuresJson, featuresSummary, FEATURE_VERSION } from './activity/features';
import { estimateLabel } from './activity/estimate';
import { LANDCOVER_LABEL, LANDCOVER_COLOR } from './fireCorroboration';
import { HISTORY_DAYS } from './footprint/history';
import { LEVEL_LABEL } from './fireAssessment';
import { ageText, clockLabel } from '../dataAge';
import { windowLabel } from './fireTime';
import type { Country } from '../types';
import type { AtWarnContext } from './sources/geosphereWarnContext';
import { BR_BADGE_LABEL, badgeOf } from './brandradarMeta';
import { siteLabel } from './anomaly/classify';

export type EffisScope = 'week' | 'season';
/** Sortierung der Liste — die Registry-Sorten plus „Detektionen" (Vorlage), lokal sortiert. */
export type PanelSort = RecordSort | 'hotspots';

export interface FootprintPanelState {
  footprintsOn: boolean;
  hotspotsOn: boolean;
  /** Ladezustand der Detektionen (geteilt mit dem Hotspot-Layer). */
  load: 'idle' | 'loading' | 'ok' | 'error';
  loadMessage?: string;
  provider: 'firms' | 'gwis';
  detections: number;
  /** Cluster liegen vor (oder es gab keine Detektionen)? Sonst „werden gebildet". */
  clustersReady: boolean;
  /** Alter der jüngsten Detektion — für „veraltet". */
  detectionAgeMs: number | null;
  /** Stand der EFFIS-Kartierung (LASTUPDATE) — für „veraltet". */
  effisUpdateMs: number | null;
  /** Saison-Korb geladen? (nur dann ist der Umfang „Saison" wählbar) */
  seasonLoaded: boolean;
  effisFailed: boolean;
}

export interface FootprintPanelProps {
  inSheet: boolean;
  /** Tablet/Mobile: kürzere Kopfzeile, Kacheln zweispaltig. */
  compact?: boolean;
  records: readonly FireRecord[];
  /** Vor dem Filter — für „n von m". */
  total: number;
  nowMs: number;
  windowH: number;
  sort: PanelSort;
  onSort: (s: PanelSort) => void;
  filter: RecordFilter;
  onFilter: (f: RecordFilter) => void;
  effisScope: EffisScope;
  onEffisScope: (s: EffisScope) => void;
  shown: number;
  onShowMore: () => void;
  hoverId: string | null;
  onHover: (id: string | null) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClearSelect: () => void;
  onEnableLayer: () => void;
  onClose?: () => void;
  state: FootprintPanelState;
  /** BP3: Ortsverzeichnis geladen? Dann trägt das Panel die GeoNames-Zeile (CC BY). */
  placesLoaded?: boolean;
  /** GWBA1 A3: GeoSphere-Warnkontext je AT-Brand — Zitat, nie Bestätigung. */
  atContextFor?: (r: FireRecord) => AtWarnContext | null;
}

/** 6 h ohne neuen Überflug bzw. 4 d ohne EFFIS-Bearbeitung ⇒ „veraltet" (gemessene Takte). */
const DETECTION_STALE_MS = 6 * 3_600_000;
const EFFIS_STALE_MS = 4 * 86_400_000;

export const fmtStamp = (ms: number | null): string =>
  ms == null ? '—' : new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const fmtDate = (ms: number | null): string =>
  ms == null ? '—' : new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Bezeichnung einer Zeile: Ort › Kreis, sonst Koordinate — nie ein geratener Name. */
export function recordTitle(r: FireRecord): string {
  const name = r.place.name && r.place.source === 'gazetteer' && r.place.distanceKm != null
    ? `bei ${r.place.name} (${r.place.distanceKm.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km)`
    : r.place.name;
  if (name && r.place.district) return `${name} · ${r.place.district}`;
  if (name) return name;
  if (r.place.district) return r.place.district;
  return `${r.lat.toFixed(2)}° N · ${r.lon.toFixed(2)}° E`;
}

/** Nur der Ortsname (die Karte der Vorlage trägt den Kreis rechts, getrennt vom Namen). */
export function recordName(r: FireRecord): string {
  const name = r.place.name && r.place.source === 'gazetteer' && r.place.distanceKm != null
    ? `bei ${r.place.name}`
    : r.place.name;
  return name ?? r.place.district ?? `${r.lat.toFixed(2)}° N · ${r.lon.toFixed(2)}° E`;
}

/** „DE · Brandenburg" — Land und Kreis/Region; ohne Kreis nur das Land, nie geraten. */
export function regionLabel(r: FireRecord): string {
  const c = r.country == null ? '—' : r.country === 'outside' ? 'außerhalb' : r.country;
  return r.place.district ? `${c} · ${r.place.district}` : c;
}

/** Herkunft der Flächenangabe — Vorlage: „EFFIS kartiert" (Sage) vs. „geschätzt". */
export function areaOrigin(r: FireRecord): { text: string; tone: 'mapped' | 'est' | 'none' } {
  if (r.areaHa.kind === 'mapped') return { text: 'EFFIS kartiert', tone: 'mapped' };
  if (provisionalArea(r)) return { text: 'geschätzt', tone: 'est' };
  if (r.areaHa.kind === 'upper-bound') return { text: 'Obergrenze (Raster)', tone: 'est' };
  return { text: 'keine Fläche', tone: 'none' };
}

/** Die Flächenzahl ohne Wortzusatz („128 ha"); vorläufig = Schätzwert mit Intervall im title. */
export function areaValue(r: FireRecord): string {
  const prov = provisionalArea(r);
  if (prov) return prov.value.split(' (')[0];
  if (r.areaHa.value == null) return 'keine Fläche';
  return `${r.areaHa.value.toLocaleString('de-DE', { maximumFractionDigits: 0 })} ha`;
}

export function Badge({ r }: { r: FireRecord }) {
  const b = badgeOf(r.status.kind, r.suspectedStatic, r.anomaly?.kind ?? null);
  return <span className={`br-badge is-${b}`}>{BR_BADGE_LABEL[b]}</span>;
}

/** Eine Kennzahl der Kachel: Wert, Untertitel, optional Farbpunkt — Herkunft/Grund im `title`. */
export function Stat({ lbl, val, sub, tone, valClass, title, dot }: {
  lbl: string; val: ReactNode; sub?: ReactNode; tone?: string; valClass?: string; title?: string; dot?: string;
}) {
  return (
    <span className="br-stat" title={title || undefined}>
      <span className="br-stat-lbl">{lbl}</span>
      <span className={`br-stat-val${valClass ? ` ${valClass}` : ''}`}>
        {dot && <span className="fire-crow-dot" style={{ background: dot }} aria-hidden="true" />}
        {val}
      </span>
      {sub != null && <span className={`br-stat-sub${tone ? ` is-${tone}` : ''}`}>{sub}</span>}
    </span>
  );
}

/** Eine Kennzahl als DATEN — Wert, Untertitel, Grund, Farbpunkt, Ton. */
export interface RecordStatTile {
  lbl: string;
  val: ReactNode;
  sub: ReactNode;
  /** Der Grund bzw. die Erklärung — Desktop `Tooltip`, mobil sichtbar. NIE leer bei „—". */
  title: string;
  tone?: 'mapped' | 'est' | 'none';
  /** Zustandsklasse der Tendenz (`is-growing` …) für die Listenkarte. */
  valClass?: string;
  dot?: string;
}

/**
 * **Die vier Kennzahlen als eine Quelle** (BD1): Fläche · Detektionen · Stärke · Tendenz.
 *
 * Diese Funktion ist der einzige Ort, an dem steht, WAS die vier Kacheln sagen. Die
 * Listenkarte im Readout rendert sie im Deck-CSS, der Dossier-Kopf als MUI-`StatTile` —
 * dieselben Werte, dieselben Untertitel, dieselben Gründe. Keine der beiden Ansichten
 * kann eine Angabe verlieren, die die andere hat; eine neue Kachel erscheint automatisch
 * in beiden.
 *
 * Die Regel, die hier hängt (Prüfliste §6 Punkt 1): fehlt ein Wert, ist er „—" **mit
 * Grund** — nie 0. `missingReason()` liefert den Grund, er wird nie weggelassen.
 */
export function recordStatTiles(r: FireRecord, nowMs: number, wide = false): RecordStatTile[] {
  const origin = areaOrigin(r);
  const prov = provisionalArea(r);
  const act = r.activity;
  return [
    {
      lbl: 'Fläche',
      val: origin.tone === 'none' ? '—' : areaValue(r),
      // Herkunft IMMER dabei: kartiert / geschätzt / Obergrenze / keine (Prüfliste Punkt 2).
      sub: wide && prov ? `${origin.text} · ${prov.value.replace(/^[^(]*\(/, '').replace(/\)$/, '')}` : origin.text,
      tone: origin.tone,
      title: prov?.value ?? areaLabel(r),
    },
    {
      lbl: 'Detektionen',
      val: r.hotspots ?? '—',
      sub: r.lastMs != null
        ? `letzte ${ageText(Math.max(0, nowMs - r.lastMs))}${wide && r.overpasses != null ? ` · ${r.overpasses} ${r.overpasses === 1 ? 'Überflug' : 'Überflüge'}` : ''}`
        : 'keine im Fenster',
      title: r.hotspots == null ? (missingReason(r, 'hotspots') ?? '') : `${r.overpasses ?? 0} Überflüge · Satelliten ${r.satellites?.join(', ') || '—'}`,
    },
    {
      lbl: 'Stärke',
      val: r.sources.cluster ? strengthLabel(r.sources.cluster) : '—',
      sub: r.sources.cluster ? `${wide ? 'ΣFRP · ' : ''}${extentLabel(r.sources.cluster)} Ausdehnung` : 'keine Leistung (keine Detektion)',
      title: r.sources.cluster
        ? 'Summe der Feuerstrahlungsleistung über Pixel UND Überflüge — eine Leistung, keine Fläche und keine Energie. Ausdehnung = konvexe Hülle der Detektionsorte, nicht die verbrannte Fläche.'
        : (missingReason(r, 'hotspots') ?? ''),
      dot: r.sources.cluster ? (r.suspectedStatic ? STATIC_GREY : clusterColorOf(r.sources.cluster)) : undefined,
    },
    {
      lbl: 'Tendenz',
      val: act?.state && act.state !== 'no-signal' ? STATE_LABEL[act.state] : act?.state === 'no-signal' ? 'kein Signal' : '—',
      valClass: act?.state ? `is-${act.state}` : undefined,
      sub: act?.state === 'no-signal'
        ? (act.observation ? (act.observation === 'confirmed' ? 'Sicht gegeben' : 'nicht beobachtbar') : 'Beobachtung unbestimmt')
        : act?.state ? `${act.passCount} Überflüge` : (act?.stateNote ?? 'nicht bestimmbar'),
      title: act?.state === 'no-signal' ? (act.observationNote ?? '') : (act?.stateNote ?? ''),
    },
  ];
}

/** Der Ton des Untertitels der Kachel — `RecordStatTile.tone` in die MUI-Sprache übersetzt. */
const TILE_TONE: Record<string, 'mapped' | 'estimate' | 'none'> = { mapped: 'mapped', est: 'estimate', none: 'none' };

/**
 * BD1 — die vier Kennzahlen eines Brands. `wide` (Dossier-Kopf) rendert sie als
 * MUI-`StatTile`-Raster, ohne `wide` (Listenkarte im Readout) im Deck-CSS. Beide Formen
 * lesen aus `recordStatTiles()` — es gibt keine zweite Fassung der Werte.
 */
export function RecordStats({ r, nowMs, wide = false }: { r: FireRecord; nowMs: number; wide?: boolean }) {
  const tiles = recordStatTiles(r, nowMs, wide);
  if (wide) {
    return (
      <KeyStats>
        {tiles.map((s) => (
          <StatTile
            key={s.lbl} label={s.lbl} value={s.val} caption={s.sub} reason={s.title || undefined}
            dotColor={s.dot}
            tone={s.valClass ? (s.valClass.replace('is-', '') as 'growing') : (s.tone ? TILE_TONE[s.tone] : undefined)}
          />
        ))}
      </KeyStats>
    );
  }
  return (
    <span className="br-fire-stats">
      {tiles.map((s) => (
        <Stat key={s.lbl} lbl={s.lbl} val={s.val} sub={s.sub} tone={s.tone} valClass={s.valClass} title={s.title} dot={s.dot} />
      ))}
    </span>
  );
}

function StatusDot({ status, isStatic }: { status: FireStatusKind; isStatic: boolean }) {
  return (
    <span
      className="fire-fp-dot"
      style={{ background: isStatic ? STATIC_GREY : STATUS_COLOR[status] }}
      aria-hidden="true"
    />
  );
}

export function FireFootprintPanel(p: FootprintPanelProps) {
  const { state, records, filter, nowMs } = p;
  const staleDetection = state.detectionAgeMs != null && state.detectionAgeMs > DETECTION_STALE_MS;
  const staleEffis = state.effisUpdateMs != null && nowMs - state.effisUpdateMs > EFFIS_STALE_MS;
  const anySource = state.footprintsOn || state.hotspotsOn;
  const [filtersOpen, setFiltersOpen] = useState(false);

  const setStatus = (k: FireStatusKind) => {
    const next = new Set(filter.status ?? []);
    if (next.has(k)) next.delete(k); else next.add(k);
    p.onFilter({ ...filter, status: next.size ? next : null });
  };
  const setCountry = (c: Country) => {
    const next = new Set(filter.countries ?? []);
    if (next.has(c)) next.delete(c); else next.add(c);
    p.onFilter({ ...filter, countries: next.size ? next : null });
  };

  // --- Leer-/Lade-/Fehlerzustände: jeder mit Grund -----------------------------
  let stateBox: ReactNode = null;
  if (!anySource) {
    stateBox = (
      <p className="br-empty">
        Weder <strong>Brandflächen je Brand</strong> noch <strong>Detektionen</strong> ist
        eingeschaltet — ohne einen der beiden gibt es keine Detektionen, aus denen Einträge entstehen.
        {' '}
        <button type="button" className="br-inline-btn" onClick={p.onEnableLayer}>Brandflächen einschalten</button>
      </p>
    );
  } else if (state.load === 'error') {
    stateBox = (
      <p className="br-empty">
        Die Satellitendetektion ist gerade nicht abrufbar{state.loadMessage ? ` (${state.loadMessage})` : ''}.
        Ausfall, nicht Leerstand: <strong>keine Daten</strong> heißt nicht „keine Brände".
        {records.length > 0 && ' Die Einträge unten stammen allein aus der EFFIS-Kartierung.'}
      </p>
    );
  } else if (state.load === 'loading' && state.detections === 0) {
    stateBox = <p className="br-empty">Detektionen werden geladen …</p>;
  } else if (state.provider === 'gwis') {
    stateBox = (
      <p className="br-empty">
        <strong>Notbetrieb:</strong> NASA FIRMS ist nicht erreichbar; die Rückfallquelle (Copernicus GWIS)
        liefert weder Pixelgeometrie noch Konfidenz noch Leistung — daraus lassen sich keine Flächen und
        keine Einträge bilden. Eine Rangfolge „nach Stärke" wäre in diesem Zustand erfunden; deshalb
        gibt es sie nicht. Kartierte Flächen (EFFIS) werden weiter gezeigt.
      </p>
    );
  } else if (state.detections > 0 && !state.clustersReady) {
    stateBox = <p className="br-empty">Detektionen da — Einträge werden gebildet …</p>;
  } else if (p.total === 0) {
    stateBox = (
      <p className="br-empty">
        Keine Detektion in den letzten {windowLabel(p.windowH)} und keine von EFFIS kartierte Fläche
        {p.effisScope === 'week' ? ` der letzten ${HISTORY_DAYS} Tage` : ' dieser Saison'}.
        {state.effisFailed && ' Die EFFIS-Abfrage ist dabei fehlgeschlagen — kartierte Flächen könnten fehlen.'}
      </p>
    );
  }

  // Ohne aktive Quelle KEINE Liste — die Zeilen wären der Stand von eben, und
  // neben dem Kasten „kein Layer an" läsen sie sich wie eine Behauptung.
  const list = anySource ? records.slice(0, p.shown) : [];
  const remaining = Math.max(0, records.length - p.shown);
  const filtered = filter.minAreaHa > 0 || filter.status || filter.countries;

  const SORTS: readonly { id: PanelSort; label: string; title?: string }[] = [
    { id: 'area', label: 'Fläche' },
    { id: 'recency', label: 'Aktualität' },
    { id: 'hotspots', label: 'Detektionen', title: 'Zahl der Detektionen im Fenster — Einträge ohne Detektion stehen hinten.' },
    { id: 'strength', label: 'Stärke', title: 'Summe der Feuerstrahlungsleistung — die Rangfolge der früheren Cluster-Liste. Einträge ohne Detektion stehen hinten.' },
    { id: 'status', label: 'Status' },
  ];

  return (
    <div className={`br-fires${p.inSheet ? ' is-sheet' : ''}`}>
      {!p.inSheet && (
        <div className="br-fires-head">
          <span className="br-eyebrow">Registry · {p.windowH >= 168 ? '7-Tage' : '24-h'}-Fenster</span>
          <span className="br-fires-count">
            {!anySource ? '—' : p.total === records.length
              ? `${Math.min(p.shown, records.length)} von ${p.total} gezeigt`
              : `${records.length} von ${p.total} gefiltert · ${Math.min(p.shown, records.length)} gezeigt`}
          </span>
        </div>
      )}

      <div className="br-chiprow" role="group" aria-label="Sortierung">
        {!p.inSheet && <span className="br-chiprow-lbl">Sortieren:</span>}
        {SORTS.map((s) => (
          <button
            key={s.id} type="button" className={`br-chip is-red${p.sort === s.id ? ' is-active' : ''}`}
            aria-pressed={p.sort === s.id} title={s.title} onClick={() => p.onSort(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="br-chiprow" role="group" aria-label="Umfang der EFFIS-Kartierungen">
        {!p.inSheet && <span className="br-chiprow-lbl">Umfang:</span>}
        <button type="button" className={`br-chip is-ink${p.effisScope === 'week' ? ' is-active' : ''}`} aria-pressed={p.effisScope === 'week'} onClick={() => p.onEffisScope('week')}>
          {HISTORY_DAYS} Tage
        </button>
        <button
          type="button" className={`br-chip is-ink${p.effisScope === 'season' ? ' is-active' : ''}`}
          aria-pressed={p.effisScope === 'season'}
          disabled={!state.seasonLoaded}
          title={state.seasonLoaded ? 'Alle kartierten Flächen der laufenden Saison' : 'Saison-Korb ist nicht geladen (Layer „Frühere Brandflächen" einschalten)'}
          onClick={() => state.seasonLoaded && p.onEffisScope('season')}
        >
          ganze Saison
        </button>
        <button
          type="button" className={`br-chip is-ghost${filtersOpen || filtered ? ' is-active' : ''}`}
          aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}
        >
          Filter{filtered ? ' ·' : ''}
        </button>
      </div>

      {filtersOpen && (
        <div className="br-filters">
          <div className="br-chiprow" role="group" aria-label="Mindestfläche">
            <span className="br-chiprow-lbl">Mindestfläche:</span>
            {[0, 1, 5, 20].map((ha) => (
              <button
                key={ha} type="button" className={`br-chip is-ink${filter.minAreaHa === ha ? ' is-active' : ''}`}
                title={ha === 0 ? 'alle, auch ohne Flächenangabe' : `ab ${ha} ha — gilt für kartierte Flächen und Obergrenzen gleichermaßen`}
                onClick={() => p.onFilter({ ...filter, minAreaHa: ha })}
              >
                {ha === 0 ? 'alle' : `≥ ${ha} ha`}
              </button>
            ))}
          </div>
          <div className="br-chiprow" role="group" aria-label="Status">
            <span className="br-chiprow-lbl">Status:</span>
            {(['active', 'no-signal', 'out'] as FireStatusKind[]).map((k) => (
              <button
                key={k} type="button"
                className={`br-chip is-ink${!filter.status || filter.status.has(k) ? ' is-active' : ''}`}
                aria-pressed={!filter.status || filter.status.has(k)}
                onClick={() => setStatus(k)}
              >
                <StatusDot status={k} isStatic={false} />{STATUS_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="br-chiprow" role="group" aria-label="Land">
            <span className="br-chiprow-lbl">Land:</span>
            {(['DE', 'AT', 'CH'] as Country[]).map((c) => (
              <button
                key={c} type="button"
                className={`br-chip is-ink${!filter.countries || filter.countries.has(c) ? ' is-active' : ''}`}
                aria-pressed={!filter.countries || filter.countries.has(c)}
                onClick={() => setCountry(c)}
              >
                {c}
              </button>
            ))}
            <span className="br-muted" title="Einträge ohne Landeszuordnung (Umrisse noch nicht geladen) bleiben bei jedem Filter sichtbar — nichts wird behauptet.">unbekannt bleibt</span>
          </div>
        </div>
      )}

      {(staleDetection || staleEffis) && (
        <p className="br-box is-stale" role="status">
          {staleDetection && `Jüngste Detektion ${ageText(state.detectionAgeMs ?? 0)} — seither kein Überflug ausgewertet. `}
          {staleEffis && `EFFIS-Stand ${fmtDate(state.effisUpdateMs)} — die Kartierung hinkt 1–4 Tage nach.`}
        </p>
      )}

      {stateBox}

      {list.length > 0 && (
        <ol className="br-firelist" onMouseLeave={() => p.onHover(null)}>
          {list.map((r) => {
            const sel = p.selectedId === r.id;
            const at = p.atContextFor?.(r) ?? null;
            const atFire = at?.warnings.filter((w) => w.fireContext) ?? [];
            const lc = r.landcover?.[0];
            const ctx: string[] = [];
            if (lc) ctx.push(`Landbedeckung: ${LANDCOVER_LABEL[lc.key]} (CORINE, Plausibilität)`);
            if (r.sources.ems) ctx.push(`Copernicus-EMS-Aktivierung ${r.sources.ems.closed === false ? 'offen' : r.sources.ems.closed === true ? 'geschlossen' : 'vorhanden'} (${r.sources.ems.code})`);
            if (r.suspectedStatic) ctx.push('Vermutlich Industrieanlage — an ≥ 5 Tagen am selben Ort (eigene Einordnung, kein Nachweis).');
            // TA3: Standort-Einordnung — mit Quelle und Abstand im selben Satz; Abweichung bleibt Brand.
            if (r.anomaly) ctx.push(r.anomaly.kind === 'site'
              ? `Bekannter Standort: ${siteLabel(r.anomaly.site)} — eigene Ableitung, kein Nachweis.`
              : `Nahe bekanntem Standort (${siteLabel(r.anomaly.site)}), Signal weicht vom Anlagenmuster ab — als Brand behandelt.`);
            return (
              <li key={r.id}>
                <div
                  data-fire={r.id}
                  className={`br-fire fire-fprow${sel ? ' is-sel' : ''}${r.suspectedStatic ? ' is-static' : ''}`}
                  onMouseEnter={() => p.onHover(r.id)}
                >
                  <button
                    type="button" className="br-fire-btn"
                    aria-pressed={sel}
                    aria-label={`${recordName(r)} ${sel ? 'abwählen' : 'markieren'}`}
                    onFocus={() => p.onHover(r.id)}
                    onBlur={() => p.onHover(null)}
                    onClick={() => (sel ? p.onClearSelect() : p.onSelect(r.id))}
                  >
                    <span className="br-fire-top">
                      <span className="br-fire-ic" style={{ color: r.suspectedStatic ? STATIC_GREY : STATUS_COLOR[r.status.kind] }}>
                        {r.anomaly?.kind === 'site' ? <IndustryIcon size={20} /> : <FlameIcon size={20} />}
                      </span>
                      <span className="br-fire-name">{recordName(r)}</span>
                      <Badge r={r} />
                      <span className="br-fire-region" title={missingReason(r, 'country') ?? undefined}>{regionLabel(r)}</span>
                    </span>
                    {/* BD1 — vier Kennzahlen IMMER (nicht erst markiert): Fläche · Detektionen · Stärke · Tendenz.
                        Jeder Wert mit Untertitel (Herkunft / letzte vor X / Ausdehnung / Beobachtung); ohne
                        Detektion „—" mit Grund im title, nie 0. */}
                    <RecordStats r={r} nowMs={nowMs} />
                    <span className="br-fire-meta">{statusLabel(r, nowMs)}</span>
                    {ctx.length > 0 && <span className="br-fire-ctx">{ctx.join(' · ')}</span>}
                    {atFire.length > 0 && (
                      <span className="br-fire-ctx">
                        GeoSphere-Warnkontext{at?.gemeinde ? ` (${at.gemeinde})` : ''}: {atFire.map((w) => `${w.typeLabel} — ${w.levelLabel}`).join(' · ')} — Kontext, keine Brandbestätigung
                      </span>
                    )}
                    <span className="br-fire-chips">
                      {r.method.map((m) => (
                        <span key={m} className={`fire-fp-src is-${m}`}>{METHOD_LABEL[m]}</span>
                      ))}
                      {r.confidence.assessment && (
                        <span className={`fire-fp-assess is-${r.confidence.assessment}`} title={r.confidence.reasons.join(' · ')}>
                          {LEVEL_LABEL[r.confidence.assessment]}
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {anySource && remaining > 0 && (
        <button type="button" className="br-more" onClick={p.onShowMore}>
          Weitere {Math.min(CLUSTER_PAGE, remaining)} Brände laden
          <span className="br-more-sub"> · gezeigt {p.shown} von {records.length}</span>
        </button>
      )}

      {anySource && list.length > 0 && state.detections > 0 && (
        <p className="br-note">
          {p.total === 1 ? 'Ein Brand' : `${p.total.toLocaleString('de-DE')} Brände`} aus{' '}
          {state.detections.toLocaleString('de-DE')} Detektionen der letzten {windowLabel(p.windowH)} —
          dem Fenster, das auch die Karte zeigt. Detektionsgruppen, die dieselbe kartierte Fläche
          treffen, zählen als EIN Brand; kartierte Flächen ohne Überflug zählen mit.
        </p>
      )}

      <p className="br-box">
        <strong>Vorbehalt:</strong> Ein Brand hier ist eine <em>Detektionsgruppe</em>, keine amtliche
        Meldung. Flächen ohne EFFIS-Kartierung sind Schätzungen aus dem Detektionsraster; die
        Kartierung läuft der Beobachtung um 1–3 Tage nach.
      </p>

      {/* Die Stärke-Skala: dieselben Stopps, die den Punkt in der Zeile färben. */}
      <div className="br-strength">
        <span className="br-strength-head">Stärke · Summe der Feuerstrahlungsleistung</span>
        <ol>
          {CLUSTER_FRP_STOPS.map(([mw, col], i) => (
            <li key={mw}>
              <span className="fire-swatch" style={{ background: col }} aria-hidden="true" />
              <span>{i === CLUSTER_FRP_STOPS.length - 1 ? `ab ${mw} MW` : `${mw}–${CLUSTER_FRP_STOPS[i + 1][0]} MW`}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="br-note">{CLUSTER_NOTE}</p>
      <p className="br-note">{registryNote(p.windowH, HISTORY_DAYS)}</p>
      {p.placesLoaded && (
        <p className="br-note">
          Ortsnamen und Kreise: nächster Ort aus einem statischen Verzeichnis (bewohnte Orte ab 1 500 Einwohnern) —{' '}
          <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> (CC BY 4.0). Der Kreis ist der
          des Ortes, nicht der Brandstelle; deshalb steht die Entfernung dabei. Bei kartierten Flächen kommt der Ort von EFFIS.
        </p>
      )}
      <p className="br-sources">● NASA FIRMS · EFFIS-Kartierung · Copernicus EMS · CORINE · GeoSphere-Kontext</p>
    </div>
  );
}

/**
 * AF3: der versionierte Merkmalsatz (`activity/features.ts`) — sichtbar, damit er ab Tag 1
 * prüfbar ist; „JSON kopieren" gibt genau das weiter, was ein späterer BA-Batch aus
 * derselben Datei rechnen würde. Persistenz gibt es hier nicht (kein Speicher, kein Cron).
 */
export function FeaturesRow({ r, nowMs }: { r: FireRecord; nowMs: number }) {
  // Ohne Detektion UND ohne EFFIS gibt es keinen Merkmalsatz — dann bleibt die Karte weg
  // (Stufe 3 aus §2.3: nicht anwendbar ⇒ kein leerer Rahmen).
  if (r.hotspots == null && !r.sources.effis) return null;
  const f = featuresOf(r, nowMs);
  const rows = featuresSummary(f);
  return (
    <Box>
      <TableContainer sx={{ maxHeight: 420 }}>
        <Table size="small" stickyHeader aria-label={`Merkmalsatz Version ${FEATURE_VERSION}`}>
          <TableBody>
            {rows.map((x) => (
              <TableRow key={x.key} hover>
                <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{x.key}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary' }}>{x.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, alignItems: 'flex-start', mt: 1.25 }}>
        <CopyButton
          text={() => featuresJson(f)}
          label="JSON kopieren"
          ariaLabel={`Merkmalsatz v${FEATURE_VERSION} als JSON kopieren`}
        />
        <Typography variant="caption" component="span" sx={{ pt: 1.25 }}>
          Merkmalsatz v{FEATURE_VERSION} für die spätere Kalibrierung: Prädiktoren aus Detektionen und
          Strahlungsleistung — die Zielgröße kommt erst mit der Kartierung (BA-Linie); heute ohne Speicher,
          gilt nur innerhalb des Fensters
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * BD1 — Wetterlage am Brandort: lädt erst, wenn die Detailkarte offen ist (ein Abruf je Brand
 * und Sitzung, `detail/fireWeatherAtPoint.ts`). Modellwerte, keine Messung — steht in jeder
 * Zeile; was fehlt, steht als Satz darunter, nie als Lücke.
 */
/**
 * BDE-D — der **Zeitanker** des Brandzeitfensters. Regelfall: die Detektionen. Ein Eintrag
 * ohne Detektion im Fenster (reine EFFIS-Kartierung, z. B. im Saison-Umfang) hat trotzdem
 * eine Zeit — das Branddatum der Kartierung. Die ist gröber (EFFIS setzt sie auf den
 * geschätzten Beginn, oft nur tagesgenau), aber sie ist da, und ohne sie stünde bei jedem
 * kartierten Brand „keine Wetterlage", obwohl es die Werte gibt. Woher der Anker stammt,
 * MUSS die Karte sagen — `kind` trägt es bis in die Anzeige.
 */
export function fireWindowAnchor(r: FireRecord): { firstMs: number; lastMs: number | null; kind: 'detection' | 'effis' } | null {
  if (r.firstMs != null) return { firstMs: r.firstMs, lastMs: r.lastMs, kind: 'detection' };
  const e = r.sources.effis;
  if (e?.firedateMs != null) return { firstMs: e.firedateMs, lastMs: e.finaldateMs, kind: 'effis' };
  return null;
}

/** Der Satz zum Anker — eine Stelle, damit Wetterlage und Wetterführung dasselbe sagen. */
export const EFFIS_ANCHOR_NOTE =
  'Zeitanker ist das Branddatum der EFFIS-Kartierung, nicht eine Satellitendetektion: für diesen '
  + 'Eintrag liegt keine Detektion im Fenster. EFFIS setzt das Datum auf den geschätzten Beginn — '
  + 'oft tagesgenau, nicht stundengenau. Das Fenster kann daher neben dem tatsächlichen Brandverlauf liegen.';

export function WeatherBlock({ r, nowMs }: { r: FireRecord; nowMs: number }) {
  const [wx, setWx] = useState<{ kind: 'loading' } | { kind: 'ok'; data: FireWeatherAtPoint }>({ kind: 'loading' });
  useEffect(() => {
    let alive = true;
    setWx({ kind: 'loading' });
    const a = fireWindowAnchor(r);
    void fetchFireWeatherAtPoint(r.lat, r.lon, a?.firstMs ?? null, a?.lastMs ?? null, nowMs)
      // BDE-D: derselbe Rückfall wie in `DriversBlock` — reicht die ICON-Reihe nicht bis zum
      // Brand zurück, kommen die Werte aus dem ERA5-Archiv. Sonst stünde bei jedem Eintrag
      // aus dem Saison-Umfang „nicht verfügbar", obwohl es die Werte gibt.
      .then(async (data) => {
        if (data.atFirst == null && a) {
          const old = await fetchFireWeatherArchive(r.lat, r.lon, a.firstMs, a.lastMs);
          if (old.atFirst != null) return old;
        }
        return data;
      })
      .then((data) => { if (alive) setWx({ kind: 'ok', data }); });
    return () => { alive = false; };
    // nowMs ändert sich je Minute — der Abruf hängt am Brand, nicht an der Uhr.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id, r.lat, r.lon, r.firstMs, r.lastMs]);
  // Kein Spinner: ein `Skeleton` im Maß der Kachelzeile — die Karte behält ihre Höhe,
  // es gibt keinen Layout-Sprung, wenn die Werte eintreffen (§2.2).
  if (wx.kind === 'loading') return <ChartSkeleton height={140} note="Modellwerte für den Brandort werden geladen …" />;
  const w = wx.data;
  const summary = weatherSummary(w);
  const stampH = (ms: number) => new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const de = (n: number, frac = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: frac });
  const dir = (h: { windFromDeg: number | null }) => (h.windFromDeg != null ? ` aus ${compassLabel(h.windFromDeg)}` : '');
  const hourChips = (h: NonNullable<FireWeatherAtPoint['atFirst']>): WxChip[] => [
    { icon: 'thermo', value: h.tempC != null ? `${de(h.tempC, 1)} °C` : '—', label: 'Temperatur' },
    { icon: 'drop', value: h.rhPct != null ? `${de(h.rhPct)} %` : '—', label: 'rel. Feuchte' },
    { icon: 'wind', value: h.windKmh != null ? `${de(h.windKmh)} km/h` : '—', label: `Wind${dir(h)}` },
    { icon: 'bolt', value: h.gustKmh != null ? `${de(h.gustKmh)} km/h` : '—', label: 'Böen' },
    { icon: 'rain', value: h.precipMm != null ? `${de(h.precipMm, 1)} mm` : '—', label: 'Niederschlag' },
  ];
  const dayLabel = w.fireDay
    ? `Brandtag ${new Date(`${w.fireDay.dateISO}T12:00:00Z`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}${w.fireDay.partial ? ' · bis jetzt' : ''}`
    : '';
  return (
    <Stack spacing={1.5}>
      {summary && (
        <Typography variant="body1" sx={{ fontSize: 17, fontWeight: 500, lineHeight: 1.4, color: 'text.primary' }}>
          {summary}
        </Typography>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px' }}>
        {w.atFirst && <WxMoment title="Bei Erstdetektion" when={stampH(w.atFirst.atMs)} chips={hourChips(w.atFirst)} accent />}
        {w.atLast && <WxMoment title="Bei letzter Detektion" when={stampH(w.atLast.atMs)} chips={hourChips(w.atLast)} />}
        {w.fireDay && (
          <WxMoment
            title={dayLabel}
            chips={[
              { icon: 'thermo', value: w.fireDay.tMaxC != null ? `${de(w.fireDay.tMaxC, 1)} °C` : '—', label: 'Tmax' },
              { icon: 'drop', value: w.fireDay.rhMinPct != null ? `${de(w.fireDay.rhMinPct)} %` : '—', label: 'RHmin' },
              { icon: 'bolt', value: w.fireDay.gustMaxKmh != null ? `${de(w.fireDay.gustMaxKmh)} km/h` : '—', label: 'Böen max' },
              { icon: 'rain', value: w.fireDay.precipMm != null ? `${de(w.fireDay.precipMm, 1)} mm` : '—', label: 'Niederschlag' },
            ]}
          />
        )}
        <WxMoment
          title="Vortage"
          chips={[
            { icon: 'rain', value: w.precip24hBeforeMm != null ? `${de(w.precip24hBeforeMm, 1)} mm` : '—', label: '24 h vor Erstdetektion' },
          ]}
          note={rainLabelLive(w)}
        />
        {w.now && <WxMoment title="Jetzt" when={stampH(w.now.atMs)} chips={hourChips(w.now)} />}
      </Box>
      {w.notes.length > 0 && (
        <Box component="ul" className="fire-fp-reasons" sx={{ m: 0, pl: 2.5, color: 'text.disabled', fontSize: 12.5, lineHeight: 1.5 }}>
          {w.notes.map((n) => <li key={n}>{n}</li>)}
        </Box>
      )}
      <Typography variant="caption" component="p" className="br-note" sx={{ m: 0 }}>
        {w.source === 'era5' ? FIRE_WEATHER_ARCHIVE_LABEL : FIRE_WEATHER_SOURCE_LABEL} · Werte für den Brandort ({r.lat.toFixed(2)}° N, {r.lon.toFixed(2)}° E) aus dem
        {w.source === 'era5' ? ' Reanalysegitter' : ' Modellgitter'} — es kennt den Brand nicht; die Werte beschreiben die Umgebung, nicht die Flamme.
        {w.source === 'era5' && ' Der Brand liegt zu weit zurück für die ICON-Reihe (7 Tage) — die Vorhersagemodelle haben kein Archiv.'}
        {' '}{w.source === 'era5' ? FIRE_WEATHER_ARCHIVE_ATTRIBUTION : FIRE_WEATHER_ATTRIBUTION}.
      </Typography>
    </Stack>
  );
}

interface WxChip { icon: InfoIcon; value: string; label: string }

/** Ein Zeitpunkt (oder Zeitraum) als Karte: Kopf + Wertechips mit Icon — alles auf einen Blick. */
function WxMoment({ title, when, chips, note, accent = false }: { title: string; when?: string; chips: WxChip[]; note?: string; accent?: boolean }) {
  return (
    <Box sx={{
      p: 1.25, borderRadius: '12px', minWidth: 0, bgcolor: '#FDFBF4',
      border: '1px solid', borderColor: accent ? 'fire.steelBorder' : 'divider',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <Typography component="div" sx={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, color: accent ? 'fire.steel' : 'text.secondary' }}>{title}</Typography>
        {when && <Typography component="div" sx={{ fontSize: 12, color: 'text.disabled', fontVariantNumeric: 'tabular-nums' }}>{when}</Typography>}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: '8px' }}>
        {chips.map((c) => (
          <Box key={c.label} sx={{ display: 'flex', gap: 0.75, alignItems: 'center', minWidth: 0 }}>
            <Box sx={{ flex: '0 0 auto', width: 26, height: 26, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', bgcolor: 'rgba(139, 115, 85, 0.1)' }}>
              <InfoTileIcon k={c.icon} size={16} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography component="div" sx={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.2, color: 'text.primary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{c.value}</Typography>
              <Typography component="div" sx={{ fontSize: 11, lineHeight: 1.25, color: 'text.disabled', overflowWrap: 'anywhere' }}>{c.label}</Typography>
            </Box>
          </Box>
        ))}
      </Box>
      {note && <Typography component="div" sx={{ mt: 0.75, fontSize: 12, color: 'text.secondary' }}>{note}</Typography>}
    </Box>
  );
}

/**
 * BDE-A — die Zeile „Kartierung": mit EFFIS-Fläche deren Zahlen (Fläche, Branddatum, Stand,
 * Quelle), ohne sie der GRUND. Der Grund kommt aus `mappingGapText` — EINE Stelle, damit die
 * widerlegte Regel „EFFIS kartiert erst ab ~30 ha" nicht über eine zweite Formulierung
 * zurückkehrt (`audit/waldbrand-effis.md` B3).
 */
export function MappingRow({ r, nowMs }: { r: FireRecord; nowMs: number }) {
  const e = r.sources.effis;
  const gap = mappingGapText(r, nowMs);
  if (e) {
    return (
      <FactRow term="Kartierung">
        {e.areaHa != null ? <b>{e.areaHa.toLocaleString('de-DE', { maximumFractionDigits: 0 })} ha</b> : <Muted>Fläche ohne Wert in der Kartierung</Muted>}
        {e.firedateMs != null && <> · Branddatum {fmtDate(e.firedateMs)}</>}
        {e.finaldateMs != null && <> · Ende {fmtDate(e.finaldateMs)}</>}
        {e.lastUpdateMs != null && <> · Stand {fmtDate(e.lastUpdateMs)}</>}
        {' · '}<a href="https://effis.jrc.ec.europa.eu/" target="_blank" rel="noopener">EFFIS</a> (Copernicus EMS, CC BY 4.0)
        {r.sources.effisExtra > 0 && <Muted> · {r.sources.effisExtra} weitere Kartierung{r.sources.effisExtra === 1 ? '' : 'en'} im selben Cluster</Muted>}
      </FactRow>
    );
  }
  if (!gap) return null;
  // Ohne Kartierung steht hier der GRUND — eine Stelle, damit die widerlegte Regel
  // „EFFIS kartiert erst ab ~30 ha" nicht über eine zweite Formulierung zurückkehrt.
  return <FactRow term="Kartierung"><Muted>{gap}</Muted></FactRow>;
}

/**
 * BDE-C — **Wetterführung im Brandzeitfenster**: Einstufung, Winkeldifferenz zur beobachteten
 * Ausbreitung, Windrose und Zeitreihe, dazu FFMC/ISI als eigene Rechnung.
 *
 * Der Abruf ist DERSELBE wie in `WeatherBlock` (`fetchFireWeatherAtPoint` hat einen
 * Sitzungs-Cache je Brand) — zwei Bausteine, EIN Netzaufruf. Deshalb steht hier auch kein
 * zweiter Ladehinweis-Text, sondern derselbe.
 */
export function DriversBlock({ r, nowMs, width }: { r: FireRecord; nowMs: number; width?: number }) {
  const [wx, setWx] = useState<{ kind: 'loading' } | { kind: 'ok'; data: FireWeatherAtPoint }>({ kind: 'loading' });
  useEffect(() => {
    let alive = true;
    setWx({ kind: 'loading' });
    const a = fireWindowAnchor(r);
    void fetchFireWeatherAtPoint(r.lat, r.lon, a?.firstMs ?? null, a?.lastMs ?? null, nowMs)
      .then(async (data) => {
        // BDE-D: die ICON-Reihe reicht nur `HOURLY_PAST_DAYS` zurück. Ein Eintrag aus dem
        // Saison-Umfang (EFFIS kartiert Wochen später) fiel deshalb bisher auf „keine
        // Stundenreihe" — für den Nutzer nicht von „gibt es nichts" zu unterscheiden.
        // Reicht sie nicht, tritt das ERA5-Archiv an ihre Stelle; die Karte sagt, welche
        // Quelle sie zeigt. Geraten wird nichts: fehlt auch die Reanalyse, bleibt der Satz.
        if (data.windowHours.length === 0 && a) {
          const old = await fetchFireWeatherArchive(r.lat, r.lon, a.firstMs, a.lastMs);
          if (old.windowHours.length > 0) return old;
        }
        return data;
      })
      .then((data) => { if (alive) setWx({ kind: 'ok', data }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id, r.lat, r.lon, r.firstMs, r.lastMs]);
  if (wx.kind === 'loading') return <ChartSkeleton height={200} note="Modellwerte für den Brandort werden geladen …" />;
  return (
    <DriversView
      w={wx.data} spreadBearingDeg={r.activity?.spreadBearingDeg ?? null} width={width}
      anchorNote={fireWindowAnchor(r)?.kind === 'effis' ? EFFIS_ANCHOR_NOTE : undefined}
    />
  );
}

/**
 * BDE-D — die Darstellung allein, ohne Abruf. Die Historie schickt hier ihre ERA5-Reihe
 * hinein (`fetchFireWeatherArchive`), die Live-Ansicht ihre ICON-Reihe. EIN Rechenweg,
 * eine Einstufung, eine Windrose — der Unterschied steht in `w.source` und wird gesagt.
 */
export function DriversView({ w, spreadBearingDeg, width, anchorNote }: { w: FireWeatherAtPoint; spreadBearingDeg: number | null; width?: number; anchorNote?: string }) {
  const era5 = w.source === 'era5';
  if (w.windowHours.length === 0) {
    // Stufe 2 (§2.3): der ganze Block fehlt, der Grund ist bekannt — ein Kasten mit dem
    // bestehenden Satz. KEIN leeres Chart, kein „0"-Achsenkreuz.
    return (
      <>
        <MissingBlock>
          Keine Stundenreihe für das Brandzeitfenster — ohne sie gibt es weder Windrose noch Einstufung.
          {w.notes.length > 0 && ` ${w.notes[0]}`}
        </MissingBlock>
        {anchorNote && <p className="br-note">{anchorNote}</p>}
      </>
    );
  }
  const det = w.detectionRange;
  const inDet = det ? w.windowHours.filter((h) => h.atMs >= det[0] && h.atMs <= det[1]) : [];
  // Die Einstufung gilt für die Stunden der Detektionen; liegt alles in einer Stunde, nimmt sie diese eine.
  const ratingHours = inDet.length > 0 ? inDet : w.atFirst ? [w.atFirst] : [];
  const rating = driverRating({ hours: ratingHours, precip24hBeforeMm: w.precip24hBeforeMm, daysSinceRain: w.daysSinceRain });
  const rose = windRose(ratingHours.length >= 3 ? ratingHours : w.windowHours);
  const dom = dominantWind(ratingHours.length >= 3 ? ratingHours : w.windowHours);
  const vs = spreadVsWind(spreadBearingDeg, dom.fromDeg);
  const series = fireIndexSeries(w.windowHours);
  const atFirst = w.atFirst ? indexAt(series, w.atFirst.atMs) : null;
  return (
    <Stack className="br-drv" spacing={1.25}>
      {rating ? (
        <Box className={`br-drv-verdict is-${rating.level}`} sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            size="small" variant="outlined" className="br-drv-lbl" label={DRIVER_LABEL[rating.level]}
            sx={{
              fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', borderRadius: '999px',
              bgcolor: 'transparent',
              color: rating.level === 'driving' ? 'fire.extreme' : rating.level === 'damping' ? 'fire.steel' : 'text.disabled',
              borderColor: 'currentColor',
            }}
          />
          <Typography variant="caption" component="span">
            — abgeleitete Einstufung aus {rating.hours} Modellstunde{rating.hours === 1 ? '' : 'n'}
            {inDet.length === 0 && (anchorNote
              ? ' (nur die Stunde des Branddatums — die Kartierung nennt keinen Zeitraum, nur einen Beginn)'
              : ' (nur die Stunde der Erstdetektion — die Detektionen liegen innerhalb einer Stunde)')}
            {', Punktsumme '}{rating.score > 0 ? `+${rating.score}` : rating.score}
          </Typography>
        </Box>
      ) : (
        <MissingBlock>Keine Einstufung — für den Zeitraum der Detektionen liegt keine Modellstunde vor.</MissingBlock>
      )}
      {rating && (
        <InfoTileGrid
          className="br-drv-reasons"
          minWidth={210}
          tiles={rating.reasons.map((x) => ({
            key: x.text,
            icon: iconForReason(x.text),
            valueClass: 'br-drv-pt',
            value: x.points > 0 ? `+${x.points}` : x.points === 0 ? '±0' : `${x.points}`,
            caption: x.text,
            title: x.text,
            tone: x.points > 0 ? 'up' as const : x.points < 0 ? 'down' as const : undefined,
          }))}
        />
      )}
      {anchorNote && <p className="br-note">{anchorNote}</p>}
      <Typography variant="caption" component="p" className="br-note" sx={{ m: 0 }}>{DRIVER_RULE_TEXT}</Typography>

      <Box className="br-drv-wind" sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <WindRoseChart rose={rose} spreadBearingDeg={spreadBearingDeg} dominantFromDeg={dom.fromDeg} />
        <Box className="br-drv-dl" sx={{ flex: '1 1 260px', minWidth: 0 }}>
          <InfoTileGrid
            minWidth={190}
            tiles={[
              {
                key: 'dom', icon: 'compass', label: 'Vorherrschender Wind',
                value: dom.fromDeg != null ? `aus ${compassLabel(dom.fromDeg)} (${dom.fromDeg}°)` : 'keine Richtung',
                caption: dom.fromDeg != null
                  ? `Ø ${dom.meanKmh} km/h${dom.maxGustKmh != null ? ` · Böen bis ${Math.round(dom.maxGustKmh)}` : ''}`
                  : `Beständigkeit ${dom.steadiness ?? '—'} unter ${STEADY_MIN}${dom.meanKmh != null ? ` · Ø ${dom.meanKmh} km/h` : ''}`,
                title: `geschwindigkeitsgewichtetes Vektormittel über ${dom.hours} Stunden; „Beständigkeit" 1 = konstant, 0 = dreht ständig`,
              },
              {
                key: 'vs', icon: 'spread', label: 'Ausbreitung gegen Wind',
                value: vs ? `${vs.diffDeg}°` : '—',
                caption: vs ? spreadVsWindLabel(vs) : 'nicht bestimmbar',
                title: vs
                  ? `Wind weht nach ${compassLabel(vs.downwindDeg)}, Schwerpunkt wandert nach ${compassLabel(vs.spreadDeg)}`
                  : `nicht bestimmbar — ${spreadBearingDeg == null ? 'es gibt keine belastbare Ausbreitungsrichtung' : 'es gibt keine vorherrschende Windrichtung'}. Nichts wird interpoliert.`,
              },
              ...(series ? [{
                key: 'idx', icon: 'index' as const, label: 'FFMC / ISI',
                value: atFirst ? `${atFirst.ffmc.toFixed(1)} / ${atFirst.isi.toFixed(1)}` : '—',
                caption: atFirst
                  ? `bei Erstdetektion${atFirst.spinup ? ' · noch im Vorlauf der Kette — nur als Größenordnung' : ''}`
                  : 'keine Stunde der Erstdetektion in der Kette',
                title: series.skipped > 0 ? `${series.skipped} Stunde${series.skipped === 1 ? '' : 'n'} ohne Werte übersprungen` : undefined,
              }] : []),
            ]}
          />
        </Box>
      </Box>

      <DriverSeriesChart hours={w.windowHours} detectionRange={w.detectionRange} index={series} width={width} />

      {series && <Typography variant="caption" component="p" className="br-note" sx={{ m: 0 }}>{FIRE_INDEX_NOTE}</Typography>}
      <Typography variant="caption" component="p" className="br-note" sx={{ m: 0 }}>
        Der Gesamt-FWI steht bewusst nicht hier. Wer ihn braucht:{' '}
        <a href="https://gwis.jrc.ec.europa.eu/apps/gwis_current_situation/" target="_blank" rel="noopener">GWIS · Current Situation</a>{' '}
        (Copernicus, CC BY 4.0) — der Dienst gibt seine Werte nur als Bild aus, nicht als Zahl, deshalb ist er hier verlinkt statt eingerechnet.
      </Typography>
      <Typography variant="caption" component="p" className="br-note" sx={{ m: 0 }}>
        {era5 ? FIRE_WEATHER_ARCHIVE_LABEL : FIRE_WEATHER_SOURCE_LABEL} · {era5 ? FIRE_WEATHER_ARCHIVE_ATTRIBUTION : FIRE_WEATHER_ATTRIBUTION}.
        {era5 && ' Für zurückliegende Brände gibt es kein ICON-Archiv — die Reanalyse ist gröber, ein einzelner Hang oder Talwind steckt in ihr nicht drin.'}
      </Typography>
    </Stack>
  );
}

/** Nebentext innerhalb einer Faktenzeile — der Ton, den vorher `.br-muted` trug. */
function Muted({ children }: { children: ReactNode }) {
  return <Box component="span" sx={{ color: 'text.disabled' }}>{children}</Box>;
}

// ---------------------------------------------------------------------------
// BD2: die Bausteine der Detailkarte — EINE Quelle für die Detailkarte im
// Readout (oben) und das Dossier in der Mitte (`FireDossier.tsx`). Wer eine
// Zeile ändert, ändert sie an beiden Orten; keine der beiden Ansichten kann
// eine Zeile verlieren, die die andere hat.
// ---------------------------------------------------------------------------

/** Unterzeile des Kopfs: Region · Koordinate · Kennung · Herkunft der Kennung. */
export function DetailSubline({ r }: { r: FireRecord }) {
  return (
    <>
      {regionLabel(r)} · {r.lat.toFixed(3)}° N, {r.lon.toFixed(3)}° E · <code>{r.id}</code>
      {r.previousIds.length > 0 && <span className="br-muted"> · zuvor {r.previousIds.length}×</span>}
      {r.mergedFrom.length > 0 && <span className="br-muted"> · zusammengewachsen aus {r.mergedFrom.length + 1} Detektionsgruppen dieser Sitzung</span>}
      {r.splitFrom && <span className="br-muted"> · aus <code>{r.splitFrom}</code> hervorgegangen (Verbindung aus dem Fenster gefallen)</span>}
    </>
  );
}

/** Kennzahlen-Zeilen: Status · Fläche · Schätzung · Erst-/Letztdetektion · Hotspots. */
export function DetailKennzahlenRows({ r, nowMs }: { r: FireRecord; nowMs: number }) {
  // VB3: die vorläufige Brandfläche — `null`, sobald eine Kartierung vorliegt.
  const prov = provisionalArea(r);
  const act = r.activity;
  return (
    <>
      <FactRow term="Status">{statusLabel(r, nowMs)}</FactRow>
      <FactRow term="Fläche">
        {prov ? (
          <>
            {prov.head}: <b>{prov.value}</b>
            <Muted> — {prov.note} {prov.source}</Muted>
          </>
        ) : (
          <>
            {areaLabel(r)}
            {/* Obergrenze heißt Obergrenze: die Pixelgröße gehört in denselben Satz. */}
            {r.areaHa.kind === 'upper-bound' && ' — vom Satelliten abgedeckt (ein Pixel deckt 14–60 ha), Obergrenze, keine Brandfläche'}
            {r.areaHa.kind === 'mapped' && ' — von EFFIS gemessen'}
            {r.areaHa.value == null && ` (${missingReason(r, 'area')})`}
            {r.sources.effisExtra > 0 && ` · ${r.sources.effisExtra} weitere Kartierung${r.sources.effisExtra === 1 ? '' : 'en'} im selben Cluster`}
          </>
        )}
      </FactRow>
      <MappingRow r={r} nowMs={nowMs} />
      {!prov && act && (act.areaEst || act.areaEstReason) && (
        <FactRow term="Schätzung">
          {act.areaEst
            ? <>Fläche <b>{estimateLabel(act.areaEst).split(' — ')[0]}</b>{' — '}{estimateLabel(act.areaEst).split(' — ').slice(1).join(' — ')}</>
            : <Muted>— {act.areaEstReason}</Muted>}
          {act.areaEst && r.areaHa.kind === 'mapped' && r.areaHa.value != null && (
            <Muted> · zum Vergleich kartiert: {r.areaHa.value.toLocaleString('de-DE')} ha (die Kartierung gilt)</Muted>
          )}
        </FactRow>
      )}
      <FactRow term="Erstdetektion">{r.firstMs != null ? fmtStamp(r.firstMs) : <Missing reason={missingReason(r, 'hotspots')} />}</FactRow>
      <FactRow term="Letzte Detektion">{r.lastMs != null ? `${fmtStamp(r.lastMs)} (${ageText(Math.max(0, nowMs - r.lastMs))})` : <Missing reason={missingReason(r, 'hotspots')} />}</FactRow>
      <FactRow term="Hotspots">
        {r.hotspots != null
          ? `${r.hotspots} · ${r.overpasses ?? 0} Überflüge · Satelliten ${r.satellites?.join(', ') || '—'}`
          : <><Missing reason={missingReason(r, 'hotspots')} /> (kein Satellitensignal im Fenster)</>}
      </FactRow>
    </>
  );
}

/** Konfidenz + Methode — BD1 unter „Kennzahlen", im Dossier (Vorlage) unter „Einordnung". */
export function DetailConfidenceRows({ r }: { r: FireRecord }) {
  const conf = r.confidence;
  return (
    <>
      <FactRow term="Konfidenz">
        {conf.firms ? `FIRMS ${confidenceLabel(r)}` : <Missing reason={missingReason(r, 'confidence')} />}
        {conf.assessment && <> · Bewertung <b>{LEVEL_LABEL[conf.assessment]}</b></>}
        {conf.reasons.length > 0 && (
          <Box component="ul" className="fire-fp-reasons" sx={{ m: '4px 0 0', pl: 2.5, fontSize: 12.5, lineHeight: 1.5 }}>
            {conf.reasons.map((s) => <li key={s}>{s}</li>)}
          </Box>
        )}
      </FactRow>
      <FactRow term="Methode">{r.method.map((m) => METHOD_LABEL[m]).join(' · ')}</FactRow>
    </>
  );
}

/**
 * BDE-B: Was die drei Zahlen der Konfidenz bedeuten — und zwar AUFGELÖST. Die Zeile
 * „Ausbreitung" nennt zwei mögliche Gründe für eine fehlende Richtung („unter 3 Überflügen
 * ODER Verschiebung unter einer halben Pixelbreite"); welcher zutrifft, ist hier bekannt.
 * Ein „entweder/oder" stehen zu lassen, wo die Antwort vorliegt, wäre eine vermeidbare Lücke.
 */
export function spreadConfidenceNote(act: NonNullable<FireRecord['activity']>): string {
  const c = act.spreadConfidence;
  if (!c) return 'keine Überflüge mit FRP';
  if (act.spreadBearingDeg == null) {
    if (c.passes < 3) return `unter 3 Überflügen mit FRP gibt es keine Richtung — hier ${c.passes}`;
    return c.meanStepM != null && c.meanStepM > SPREAD_MIN_M
      ? `der Schwerpunkt pendelt (mittlerer Schritt ${c.meanStepM.toLocaleString('de-DE')} m), verlagert sich aber insgesamt um weniger als ${SPREAD_MIN_M} m — eine halbe Pixelbreite, also Gitterrauschen`
      : `die Gesamtverschiebung bleibt unter ${SPREAD_MIN_M} m (eine halbe Pixelbreite) — das ist Gitterrauschen, keine Bewegung`;
  }
  if (c.meanStepM != null && act.spreadDistanceM != null && c.meanStepM > 2 * act.spreadDistanceM) {
    return 'der Schwerpunkt springt weiter hin und her, als er sich insgesamt verlagert hat — die Richtung ist grob';
  }
  return 'je mehr Überflüge und je länger die Spanne, desto belastbarer die Richtung';
}

/** ΣFRP (Fenstersumme) und FRP je Überflug. */
export function DetailFrpRows({ r }: { r: FireRecord }) {
  const act = r.activity;
  return (
    <>
      {r.frpSumMw != null && (
        <FactRow term="ΣFRP">
          {r.frpSumMw.toLocaleString('de-DE', { maximumFractionDigits: 1 })} MW — Leistung, summiert über Pixel und Überflüge, keine Fläche
        </FactRow>
      )}
      {act && act.frpLastPassMw != null && (
        <FactRow term="FRP je Überflug">
          {activitySummary(act)} — ΣFRP des jüngsten bzw. stärksten Überflugs (nicht die Fenstersumme oben)
        </FactRow>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Kennzahl-Kacheln (Jans Auftrag 2026-10-14): die langen Faktenzeilen des Dossiers als Kacheln mit
 * Icon, kurzem Wert und einer Zeile Zusatz. Der volle Wortlaut steht im Tooltip der Kachel UND
 * unverändert in den Faktenzeilen darunter („Alle Angaben im Wortlaut") — nichts geht verloren.
 * ------------------------------------------------------------------------------------------- */
type FactIcon = 'status' | 'map' | 'est' | 'first' | 'pass';

function FactTileIcon({ k }: { k: FactIcon }) {
  const p = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
  switch (k) {
    case 'status': return <svg {...p}><circle cx="12" cy="12" r="3" fill="currentColor" /><path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" /></svg>;
    case 'map': return <svg {...p}><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20Z" /><path d="M9 4v13.5M15 6.5V20" /></svg>;
    case 'est': return <svg {...p}><path d="M4 18 9 11l4 4 7-9" /><path d="M16 6h4v4" /></svg>;
    case 'first': return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></svg>;
    case 'pass': return <svg {...p}><path d="M3 15c4-9 14-9 18 0" /><circle cx="12" cy="9" r="1.6" fill="currentColor" /></svg>;
  }
}

interface FactTile { key: string; icon: FactIcon; label: string; value: ReactNode; caption?: ReactNode; title?: string; tone?: 'ok' }

/** Kurzfassung der Kennzahlen als Kacheln — dieselben Quellen wie `DetailKennzahlenRows`/`DetailFrpRows`. */
export function DetailFactTiles({ r, nowMs }: { r: FireRecord; nowMs: number }) {
  const prov = provisionalArea(r);
  const act = r.activity;
  const e = r.sources.effis;
  const gap = mappingGapText(r, nowMs);
  const mw = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} MW`;
  const tiles: FactTile[] = [];

  // Doppelungen vermeiden: Fläche, Detektionen, Stärke und Tendenz stehen schon in den vier Kennzahlen
  // darüber (`RecordStats`); „letzte Detektion · vor x h" steht dort in der Kachel „Detektionen".
  const st = statusLabel(r, nowMs).split(' · ');
  const stExtra = st.slice(1).filter((x) => !/^letzte Detektion|^vor \d/.test(x)).join(' · ');
  tiles.push({ key: 'status', icon: 'status', label: 'Status', value: st[0], caption: stExtra || undefined, title: statusLabel(r, nowMs) });

  if (e) {
    tiles.push({
      key: 'map', icon: 'map', label: 'Kartierung', tone: 'ok',
      value: e.areaHa != null ? `${e.areaHa.toLocaleString('de-DE', { maximumFractionDigits: 0 })} ha` : '—',
      caption: `EFFIS${e.lastUpdateMs != null ? ` · Stand ${fmtDate(e.lastUpdateMs)}` : ''}`,
    });
  } else if (gap) {
    tiles.push({ key: 'map', icon: 'map', label: 'Kartierung', value: 'noch keine', caption: 'läuft der Beobachtung 1–3 Tage nach', title: gap });
  }

  if (!prov && act && act.areaEst) {
    const est = estimateLabel(act.areaEst).split(' — ');
    tiles.push({ key: 'est', icon: 'est', label: 'Schätzung', value: est[0], caption: 'Modellschätzung', title: est.join(' — ') });
  }

  if (r.firstMs != null || r.lastMs != null) {
    tiles.push({
      key: 'period', icon: 'first', label: 'Zeitraum',
      value: `${r.firstMs != null ? fmtStamp(r.firstMs) : '—'} → ${r.lastMs != null ? fmtStamp(r.lastMs) : '—'}`,
      caption: r.satellites?.length ? `Satelliten ${r.satellites.join(', ')}` : undefined,
      title: 'Erstdetektion bis letzte Detektion im Fenster',
    });
  }
  if (act && act.frpLastPassMw != null) {
    tiles.push({
      key: 'pass', icon: 'pass', label: 'FRP je Überflug', value: mw(act.frpLastPassMw),
      caption: act.frpMaxPassMw != null && act.frpMaxPassMw > act.frpLastPassMw ? `zuletzt · max ${mw(act.frpMaxPassMw)}` : 'zuletzt',
      title: 'ΣFRP des jüngsten bzw. stärksten Überflugs (nicht die Fenstersumme)',
    });
  }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', mt: 1.5 }}>
      {tiles.map((t) => (
        <Tooltip key={t.key} title={t.title ?? ''} disableHoverListener={!t.title}>
          <Box sx={{
            display: 'flex', gap: 1, alignItems: 'center', p: 1, borderRadius: '10px', minWidth: 0,
            border: '1px solid', borderColor: 'divider', bgcolor: '#FDFBF4',
          }}>
            <Box sx={{
              flex: '0 0 auto', width: 28, height: 28, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: t.tone === 'ok' ? 'success.main' : 'text.secondary', bgcolor: 'rgba(139, 115, 85, 0.1)',
            }}>
              <FactTileIcon k={t.icon} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography component="div" sx={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, color: 'text.disabled' }}>{t.label}</Typography>
              <Typography component="div" sx={{ fontSize: 15, lineHeight: 1.25, fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{t.value}</Typography>
              {t.caption && <Typography component="div" sx={{ fontSize: 11.5, lineHeight: 1.35, color: 'text.secondary' }}>{t.caption}</Typography>}
            </Box>
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}

/** Verlauf: Chart + Tendenz · Beobachtung · Ausbreitung · FRE · Überflüge · Je Überflug. */
export function DetailVerlauf({ r, nowMs, compact = false, wide = false, wideWidth }: { r: FireRecord; nowMs: number; compact?: boolean; wide?: boolean; wideWidth?: number }) {
  const act = r.activity;
  return (
    <>
      {r.passes.length > 0
        ? <FirePassChart passes={r.passes} nowMs={nowMs} compact={compact} wide={wide} wideWidth={wideWidth} />
        : <MissingBlock>Kein Überflug im Fenster — es gibt keinen zeitlichen Verlauf, nur die Kartierung.</MissingBlock>}
      {act && act.passCount > 0 && (
        <FactList>
          <FactRow term="Tendenz" reason="FRP-Verlauf der letzten Überflüge derselben Tageshälfte; nicht die Tendenz der Ereignis-Einordnung">
            {act.state && act.state !== 'no-signal'
              ? <><b className={`fire-fp-trend is-${act.state}`}>{STATE_LABEL[act.state]}</b>{act.stateNote ? ` — ${act.stateNote}` : ''}</>
              : act.state === 'no-signal'
                ? <>kein Signal{act.stateNote ? ` — ${act.stateNote}` : ''}</>
                : <Muted>— {act.stateNote ?? 'nicht bestimmbar'}</Muted>}
          </FactRow>
          {act.state === 'no-signal' && (
            <FactRow term="Beobachtung">
              {act.observation
                ? <><b>{OBSERVATION_LABEL[act.observation]}</b>{act.observationNote ? ` — ${act.observationNote}` : ''}</>
                : <Muted>— nicht bestimmt (keine Zeilen für den Umkreis)</Muted>}
            </FactRow>
          )}
          <FactRow
            term="Ausbreitung"
            reason="Verschiebung des FRP-Schwerpunkts, kein Frontverlauf — die Zahl ist eine Verlagerung zwischen Momentaufnahmen, nicht die Geschwindigkeit der Feuerfront"
          >
            {act.spreadBearingDeg != null ? (
              <>
                Schwerpunkt wandert nach <b>{compassLabel(act.spreadBearingDeg)}</b> ({act.spreadBearingDeg}°, {act.spreadDistanceM} m zwischen den Überflügen)
                {act.windAgreement === 'agree' && <> · <span className="fire-fp-wind is-agree">mit dem ICON-D2-Wind ({act.windFromDeg}° aus)</span></>}
                {act.windAgreement === 'disagree' && <> · <span className="fire-fp-wind is-disagree">gegen den ICON-D2-Wind ({act.windFromDeg}° aus) — Schwerpunkt verzerrt oder zwei Feuer?</span></>}
                {act.windAgreement === null && act.windFromDeg != null && <> · <Muted>Wind ({act.windFromDeg}° aus) weder klar dafür noch dagegen</Muted></>}
                {act.windFromDeg == null && <> · <Muted>kein Windabgleich hier (Windlayer aus); der Abgleich gegen die Modell-Stundenreihe steht unter „Wetterführung"</Muted></>}
                {act.spreadSpeedMh != null && act.spreadSpanMs != null && (
                  <> · <b>{act.spreadSpeedMh.toLocaleString('de-DE')} m/h</b> über {Math.round(act.spreadSpanMs / 3_600_000)} h</>
                )}
                <Muted> · Verschiebung des FRP-Schwerpunkts, kein Frontverlauf — die Zahl ist eine <b>Verlagerung</b> zwischen Momentaufnahmen, nicht die Geschwindigkeit der Feuerfront</Muted>
              </>
            ) : (
              <Muted>— keine Richtung bestimmbar (unter 3 Überflügen mit FRP oder Verschiebung unter einer halben Pixelbreite); die Ausdehnung der Hülle steht in der Kachel</Muted>
            )}
          </FactRow>
          {act.spreadConfidence && (
            <FactRow term="Konfidenz der Richtung">
              {act.spreadConfidence.passes === 1 ? '1 Überflug' : `${act.spreadConfidence.passes} Überflüge`} mit FRP · {act.spreadConfidence.detections} Detektionen
              {act.spreadConfidence.passes > 1 && <> · {Math.round(act.spreadConfidence.spanMs / 3_600_000)} h Zeitspanne</>}
              {act.spreadConfidence.meanStepM != null && <> · mittlerer Schritt {act.spreadConfidence.meanStepM.toLocaleString('de-DE')} m</>}
              {/* AUFGELÖST, nie „entweder/oder": welcher Grund zutrifft, ist bekannt. */}
              <Muted>{' '}— {spreadConfidenceNote(act)}</Muted>
            </FactRow>
          )}
          <FactRow term="FRE">{freLabel(act)}</FactRow>
          <FactRow term="Überflüge">
            {act.daynightMix ? DAYNIGHT_LABEL[act.daynightMix] : '—'}
            {act.meanScanKm != null && <> · mittlere Pixelbreite {act.meanScanKm.toLocaleString('de-DE')} km{act.meanScanKm > 0.6 ? ' (Schwadrand — größere Pixel, andere Detektionswahrscheinlichkeit)' : ''}</>}
          </FactRow>
          {r.passes.length > 0 && (
            <FactRow term="Je Überflug" wide>
              <PassTable passes={r.passes} />
              <Typography variant="caption" component="span" sx={{ display: 'block', mt: 0.75 }}>
                {/* Der Deckel wird AUSGESPROCHEN — „8 von N", nie stillschweigend gekürzt. */}
                {r.passes.length > 8 ? `die letzten 8 von ${r.passes.length} Überflügen` : 'je Überflug'} ({clockLabel(r.passes[0].atMs)} … {clockLabel(r.passes[r.passes.length - 1].atMs)}) — je Satellit, 10-min-Regel; ☀ Tag, ☾ Nacht; nur innerhalb des Fensters, kein Speicher über Sitzungen
              </Typography>
            </FactRow>
          )}
        </FactList>
      )}
    </>
  );
}

/**
 * „Je Überflug" — die letzten 8. Auf Desktop/Tablet eine `Table size="small"` mit fixem
 * Kopf; auf Mobil eine Liste, weil fünf Spalten auf 412 px unlesbar umbrechen (§4).
 * Beide Formen zeigen DIESELBEN fünf Angaben: Zeit · Satellit · ☀/☾ · Px · MW.
 */
function PassTable({ passes }: { passes: FireRecord['passes'] }) {
  const bp = useDossierBreakpoint();
  const rows = passes.slice(-8);
  const mw = (ps: (typeof rows)[number]) => (ps.frpPixels > 0 ? `${ps.sumFrp.toLocaleString('de-DE', { maximumFractionDigits: 1 })} MW` : '—');
  const glyph = (ps: (typeof rows)[number]) => (ps.day === true ? '☀' : ps.day === false ? '☾' : '');
  if (bp === 'mobile') {
    return (
      <List dense disablePadding className="fire-fp-passes" aria-label="Je Überflug">
        {rows.map((ps) => (
          <ListItem key={ps.key} disableGutters divider sx={{ display: 'block', py: 0.5 }}>
            <Typography variant="body2" component="span" sx={{ display: 'block', fontWeight: 600, color: 'text.primary' }}>
              {fmtStamp(ps.atMs)} {glyph(ps)}
            </Typography>
            <Typography variant="caption" component="span" sx={{ display: 'block' }}>
              {ps.satellite || '—'} · {ps.pixels} Px · {mw(ps)}
            </Typography>
          </ListItem>
        ))}
      </List>
    );
  }
  return (
    <TableContainer sx={{ maxHeight: 260 }}>
      <Table size="small" stickyHeader className="fire-fp-passes" aria-label="Je Überflug">
        <TableHead>
          <TableRow>
            <TableCell>Zeit</TableCell>
            <TableCell>Satellit</TableCell>
            <TableCell align="center">☀/☾</TableCell>
            <TableCell align="right">Px</TableCell>
            <TableCell align="right">MW</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((ps) => (
            <TableRow key={ps.key} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtStamp(ps.atMs)}</TableCell>
              <TableCell><Tooltip title={ps.satellite || 'Satellit nicht angegeben'}><span>{ps.satellite || '—'}</span></Tooltip></TableCell>
              <TableCell align="center">{glyph(ps)}</TableCell>
              <TableCell align="right">{ps.pixels}</TableCell>
              <TableCell align="right">{mw(ps)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** Einordnung & Bestätigung: Ort · Landbedeckung · Anlage? · Kartierung · EMS · GeoSphere (ohne Ursache). */
export function DetailEinordnungRows({ r, atContext = null }: { r: FireRecord; atContext?: AtWarnContext | null }) {
  const eff = r.sources.effis;
  return (
    <>
      <FactRow term="Ort">
        {r.place.name || r.place.district
          ? `${r.place.name ?? '—'} · ${r.place.district ?? '—'} (${r.place.source === 'effis' ? 'EFFIS' : `nächster Ort aus dem Verzeichnis, ${r.place.distanceKm?.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km — GeoNames CC BY 4.0`})`
          : <><Missing reason={missingReason(r, 'place')} /> (nicht bestimmt)</>}
        {' · '}{countryLabel(r.country)}
      </FactRow>
      <FactRow term="Landbedeckung">
        {r.landcover && r.landcover.length > 0
          ? (
            <Box component="span" className="fire-fp-lc" sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center' }}>
              {r.landcover.slice(0, 4).map((l) => (
                <Box component="span" key={l.key} className="fire-li-lc-item" sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <Box component="span" aria-hidden="true" sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: LANDCOVER_COLOR[l.key] }} />
                  {Math.round(l.pct)} % {LANDCOVER_LABEL[l.key]}
                </Box>
              ))}
              <Muted> (EFFIS/CORINE)</Muted>
            </Box>
          )
          : <Missing reason="Landbedeckungsanteile liefert nur die EFFIS-Kartierung" />}
      </FactRow>
      {(r.anomaly || r.suspectedStatic) && (
        <FactRow term="Anlage?">
          {/* „eigene Ableitung, kein Nachweis" steht im SELBEN Satz — nie als Fußnote. */}
          {r.anomaly
            ? (r.anomaly.kind === 'site'
              ? <>Bekannter Standort: {siteLabel(r.anomaly.site)} — eigene Ableitung aus dem FIRMS-Archiv und Anlagenverzeichnissen, kein Nachweis.</>
              : <>Nahe bekanntem Standort ({siteLabel(r.anomaly.site)}), das Signal weicht vom Anlagenmuster ab — als Brand behandelt.</>)
            : 'Vermutlich Industrieanlage — an ≥ 5 Tagen am selben Ort (eigene Einordnung, kein Nachweis).'}
        </FactRow>
      )}
      {eff && (
        <FactRow term="Kartierung">
          EFFIS-Kennung {eff.id} · Branddatum {fmtDate(eff.firedateMs)} · Stand {fmtDate(eff.lastUpdateMs)}{eff.percNa2k != null && eff.percNa2k > 0 ? ` · ${Math.round(eff.percNa2k)} % Natura 2000` : ''}
        </FactRow>
      )}
      {r.sources.ems && (
        <FactRow term="Copernicus EMS">
          {r.sources.ems.code}{r.sources.ems.name ? ` — ${r.sources.ems.name}` : ''} · {r.sources.ems.closed === false ? 'offen' : r.sources.ems.closed === true ? 'geschlossen' : 'Status unbekannt'}
          {' · '}<a href={`https://rapidmapping.emergency.copernicus.eu/${r.sources.ems.code}`} target="_blank" rel="noopener">Aktivierung öffnen</a>
        </FactRow>
      )}
      {/* GWBA1 A3: GeoSphere-Warntexte WÖRTLICH (Zitatregel) — Kontext, nie Bestätigung. */}
      {atContext && atContext.warnings.length > 0 && (
        <FactRow term="GeoSphere-Kontext">
          {atContext.gemeinde && <Muted>{atContext.gemeinde} · </Muted>}
          {atContext.warnings.map((w, i) => (
            <span key={`${w.type}-${i}`}>
              {i > 0 && ' · '}
              <b>{w.typeLabel}</b> ({w.levelLabel}){w.text ? <>: <q>{w.text}</q></> : null}
            </span>
          ))}
          <Muted> — amtlicher Warntext (Zitat), keine Brandbestätigung</Muted>
        </FactRow>
      )}
    </>
  );
}

/** Ursache: es gibt keine Quelle — aber Einordnungshilfen, jede mit Herkunft. */
export function causeHintsOf(r: FireRecord): string[] {
  const eff = r.sources.effis;
  const causeHints: string[] = [];
  if (r.anomaly) causeHints.push(r.anomaly.kind === 'site'
    ? `bekannter Standort einer Dauerquelle (${siteLabel(r.anomaly.site)}, eigene Ableitung)`
    : `nahe bekanntem Standort (${siteLabel(r.anomaly.site)}), Signal weicht vom Anlagenmuster ab`);
  else if (r.suspectedStatic) causeHints.push('an ≥ 5 Tagen am selben Ort — vermutlich Anlage (eigene Einordnung, kein Nachweis)');
  if (r.landcover?.[0]) causeHints.push(`Landbedeckung ${LANDCOVER_LABEL[r.landcover[0].key]} (CORINE)`);
  if (r.sources.ems?.name) causeHints.push(`Copernicus-EMS-Aktivierung „${r.sources.ems.name}"`);
  if (eff?.firedateMs != null) causeHints.push(`Brandbeginn laut EFFIS ${fmtDate(eff.firedateMs)}`);
  return causeHints;
}

export function CauseText({ r }: { r: FireRecord }) {
  const causeHints = causeHintsOf(r);
  return (
    <>
      <b>keine Quelle</b> — Brandursachen ermitteln Polizei und Forstbehörden; kein Anbieter dieser Karte (NASA FIRMS, EFFIS, GWIS, Copernicus EMS) liefert sie je Brand.
      {causeHints.length > 0
        ? <> Was eine Einordnung erlaubt, ohne eine Ursache zu sein: {causeHints.join(' · ')}.</>
        : ' Für diesen Eintrag gibt es auch keine Einordnungshilfe.'}
    </>
  );
}
