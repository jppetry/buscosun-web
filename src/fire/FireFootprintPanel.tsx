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
import { FirePassChart } from './FirePassChart';
import {
  fetchFireWeatherAtPoint, hourLine, rainLabelLive, weatherSummary,
  FIRE_WEATHER_SOURCE_LABEL, FIRE_WEATHER_ATTRIBUTION, type FireWeatherAtPoint,
} from './detail/fireWeatherAtPoint';
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

/**
 * BD1 — die vier Kennzahlen eines Brands: Fläche · Detektionen · Stärke · Tendenz, jede mit
 * Untertitel (Herkunft / letzte vor X / Ausdehnung / Beobachtung); ohne Detektion „—" mit Grund
 * im title, nie 0. BD2: dieselbe Komponente in der Listenkarte UND im Dossier-Kopf.
 */
export function RecordStats({ r, nowMs, wide = false }: { r: FireRecord; nowMs: number; wide?: boolean }) {
  const origin = areaOrigin(r);
  const prov = provisionalArea(r);
  const act = r.activity;
  return (
    <span className={`br-fire-stats${wide ? ' is-wide' : ''}`}>
      <Stat
        lbl="Fläche" val={origin.tone === 'none' ? '—' : areaValue(r)}
        sub={wide && prov ? `${origin.text} · ${prov.value.replace(/^[^(]*\(/, '').replace(/\)$/, '')}` : origin.text}
        tone={origin.tone}
        title={prov?.value ?? areaLabel(r)}
      />
      <Stat
        lbl="Detektionen" val={r.hotspots ?? '—'}
        sub={r.lastMs != null
          ? `letzte ${ageText(Math.max(0, nowMs - r.lastMs))}${wide && r.overpasses != null ? ` · ${r.overpasses} ${r.overpasses === 1 ? 'Überflug' : 'Überflüge'}` : ''}`
          : 'keine im Fenster'}
        title={r.hotspots == null ? (missingReason(r, 'hotspots') ?? '') : `${r.overpasses ?? 0} Überflüge · Satelliten ${r.satellites?.join(', ') || '—'}`}
      />
      <Stat
        lbl="Stärke" val={r.sources.cluster ? strengthLabel(r.sources.cluster) : '—'}
        sub={r.sources.cluster ? `${wide ? 'ΣFRP · ' : ''}${extentLabel(r.sources.cluster)} Ausdehnung` : 'keine Leistung (keine Detektion)'}
        title={r.sources.cluster
          ? 'Summe der Feuerstrahlungsleistung über Pixel UND Überflüge — eine Leistung, keine Fläche und keine Energie. Ausdehnung = konvexe Hülle der Detektionsorte, nicht die verbrannte Fläche.'
          : (missingReason(r, 'hotspots') ?? '')}
        dot={r.sources.cluster ? (r.suspectedStatic ? STATIC_GREY : clusterColorOf(r.sources.cluster)) : undefined}
      />
      <Stat
        lbl="Tendenz"
        val={act?.state && act.state !== 'no-signal' ? STATE_LABEL[act.state] : act?.state === 'no-signal' ? 'kein Signal' : '—'}
        valClass={act?.state ? `is-${act.state}` : undefined}
        sub={act?.state === 'no-signal'
          ? (act.observation ? (act.observation === 'confirmed' ? 'Sicht gegeben' : 'nicht beobachtbar') : 'Beobachtung unbestimmt')
          : act?.state ? `${act.passCount} Überflüge` : (act?.stateNote ?? 'nicht bestimmbar')}
        title={act?.state === 'no-signal' ? (act.observationNote ?? '') : (act?.stateNote ?? '')}
      />
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
  const [copied, setCopied] = useState(false);
  if (r.hotspots == null && !r.sources.effis) return null;
  const f = featuresOf(r, nowMs);
  const rows = featuresSummary(f);
  const copy = () => {
    const json = featuresJson(f);
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(json).then(done, () => { /* still: nichts behaupten */ });
  };
  return (
    <>
      <dt>Merkmalsatz</dt>
      <dd className="fire-fp-dd-wide">
        <ul className="fire-fp-features" aria-label={`Merkmalsatz Version ${FEATURE_VERSION}`}>
          {rows.map((x) => <li key={x.key}><span>{x.key}</span><span>{x.value}</span></li>)}
        </ul>
        <div className="fire-fp-features-foot">
          <button type="button" className="br-inline-btn" onClick={copy} aria-live="polite">{copied ? 'kopiert ✓' : 'JSON kopieren'}</button>
          <span className="br-muted">Merkmalsatz v{FEATURE_VERSION} für die spätere Kalibrierung: Prädiktoren aus Detektionen und Strahlungsleistung — die Zielgröße kommt erst mit der Kartierung (BA-Linie); heute ohne Speicher, gilt nur innerhalb des Fensters</span>
        </div>
      </dd>
    </>
  );
}

/**
 * BD1 — Wetterlage am Brandort: lädt erst, wenn die Detailkarte offen ist (ein Abruf je Brand
 * und Sitzung, `detail/fireWeatherAtPoint.ts`). Modellwerte, keine Messung — steht in jeder
 * Zeile; was fehlt, steht als Satz darunter, nie als Lücke.
 */
export function WeatherBlock({ r, nowMs }: { r: FireRecord; nowMs: number }) {
  const [wx, setWx] = useState<{ kind: 'loading' } | { kind: 'ok'; data: FireWeatherAtPoint }>({ kind: 'loading' });
  useEffect(() => {
    let alive = true;
    setWx({ kind: 'loading' });
    void fetchFireWeatherAtPoint(r.lat, r.lon, r.firstMs, r.lastMs, nowMs).then((data) => { if (alive) setWx({ kind: 'ok', data }); });
    return () => { alive = false; };
    // nowMs ändert sich je Minute — der Abruf hängt am Brand, nicht an der Uhr.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id, r.lat, r.lon, r.firstMs, r.lastMs]);
  if (wx.kind === 'loading') return <p className="br-muted br-wx-loading">Modellwerte für den Brandort werden geladen …</p>;
  const w = wx.data;
  const summary = weatherSummary(w);
  const stampH = (ms: number) => new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const de = (n: number, frac = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: frac });
  return (
    <div className="br-wx">
      {summary && <p className="br-wx-summary">{summary}</p>}
      {w.atFirst && (
        <div className="br-wx-tile">
          <span className="br-wx-lbl">Bei Erstdetektion · {stampH(w.atFirst.atMs)}</span>
          {hourLine(w.atFirst)}
        </div>
      )}
      {w.atLast && (
        <div className="br-wx-tile">
          <span className="br-wx-lbl">Bei letzter Detektion · {stampH(w.atLast.atMs)}</span>
          {hourLine(w.atLast)}
        </div>
      )}
      {w.fireDay && (
        <div className="br-wx-tile">
          <span className="br-wx-lbl">Brandtag {new Date(`${w.fireDay.dateISO}T12:00:00Z`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}{w.fireDay.partial ? ' · bis jetzt' : ''}</span>
          {w.fireDay.tMaxC != null ? `Tmax ${de(w.fireDay.tMaxC, 1)} °C` : 'Tmax —'}
          {' · '}{w.fireDay.rhMinPct != null ? `RHmin ${de(w.fireDay.rhMinPct)} %` : 'RHmin —'}
          {' · '}{w.fireDay.gustMaxKmh != null ? `Böen max ${de(w.fireDay.gustMaxKmh)} km/h` : 'Böen —'}
          {' · '}{w.fireDay.precipMm != null ? `${de(w.fireDay.precipMm, 1)} mm` : '— mm'}
        </div>
      )}
      <div className="br-wx-tile">
        <span className="br-wx-lbl">Vortage</span>
        {w.precip24hBeforeMm != null ? `${de(w.precip24hBeforeMm, 1)} mm in den 24 h vor der Erstdetektion` : 'Niederschlag der 24 h davor nicht bestimmbar'}
        {' · '}{rainLabelLive(w)}
      </div>
      {w.now && (
        <div className="br-wx-tile">
          <span className="br-wx-lbl">Jetzt · {stampH(w.now.atMs)}</span>
          {hourLine(w.now)}
        </div>
      )}
      {w.notes.length > 0 && (
        <ul className="fire-fp-reasons br-muted">
          {w.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
      <p className="br-note">
        {FIRE_WEATHER_SOURCE_LABEL} · Werte für den Brandort ({r.lat.toFixed(2)}° N, {r.lon.toFixed(2)}° E) aus dem Modellgitter — das Modell
        kennt den Brand nicht; sie beschreiben die Umgebung, nicht die Flamme. {FIRE_WEATHER_ATTRIBUTION}.
      </p>
    </div>
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
      <>
        <dt>Kartierung</dt>
        <dd>
          {e.areaHa != null ? <b>{e.areaHa.toLocaleString('de-DE', { maximumFractionDigits: 0 })} ha</b> : <span className="br-muted">Fläche ohne Wert in der Kartierung</span>}
          {e.firedateMs != null && <> · Branddatum {fmtDate(e.firedateMs)}</>}
          {e.finaldateMs != null && <> · Ende {fmtDate(e.finaldateMs)}</>}
          {e.lastUpdateMs != null && <> · Stand {fmtDate(e.lastUpdateMs)}</>}
          {' · '}<a href="https://effis.jrc.ec.europa.eu/" target="_blank" rel="noopener">EFFIS</a> (Copernicus EMS, CC BY 4.0)
          {r.sources.effisExtra > 0 && <span className="br-muted"> · {r.sources.effisExtra} weitere Kartierung{r.sources.effisExtra === 1 ? '' : 'en'} im selben Cluster</span>}
        </dd>
      </>
    );
  }
  if (!gap) return null;
  return (
    <>
      <dt>Kartierung</dt>
      <dd className="br-muted">{gap}</dd>
    </>
  );
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
    void fetchFireWeatherAtPoint(r.lat, r.lon, r.firstMs, r.lastMs, nowMs).then((data) => { if (alive) setWx({ kind: 'ok', data }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id, r.lat, r.lon, r.firstMs, r.lastMs]);
  if (wx.kind === 'loading') return <p className="br-muted br-wx-loading">Modellwerte für den Brandort werden geladen …</p>;
  const w = wx.data;
  if (w.windowHours.length === 0) {
    return (
      <p className="br-muted">
        Keine Stundenreihe für das Brandzeitfenster — ohne sie gibt es weder Windrose noch Einstufung.
        {w.notes.length > 0 && ` ${w.notes[0]}`}
      </p>
    );
  }
  const det = w.detectionRange;
  const inDet = det ? w.windowHours.filter((h) => h.atMs >= det[0] && h.atMs <= det[1]) : [];
  // Die Einstufung gilt für die Stunden der Detektionen; liegt alles in einer Stunde, nimmt sie diese eine.
  const ratingHours = inDet.length > 0 ? inDet : w.atFirst ? [w.atFirst] : [];
  const rating = driverRating({ hours: ratingHours, precip24hBeforeMm: w.precip24hBeforeMm, daysSinceRain: w.daysSinceRain });
  const rose = windRose(ratingHours.length >= 3 ? ratingHours : w.windowHours);
  const dom = dominantWind(ratingHours.length >= 3 ? ratingHours : w.windowHours);
  const vs = spreadVsWind(r.activity?.spreadBearingDeg ?? null, dom.fromDeg);
  const series = fireIndexSeries(w.windowHours);
  const atFirst = w.atFirst ? indexAt(series, w.atFirst.atMs) : null;
  return (
    <div className="br-drv">
      {rating ? (
        <p className={`br-drv-verdict is-${rating.level}`}>
          <span className="br-drv-lbl">{DRIVER_LABEL[rating.level]}</span>
          <span className="br-muted">
            {' '}— abgeleitete Einstufung aus {rating.hours} Modellstunde{rating.hours === 1 ? '' : 'n'}
            {inDet.length === 0 && ' (nur die Stunde der Erstdetektion — die Detektionen liegen innerhalb einer Stunde)'}
            {', Punktsumme '}{rating.score > 0 ? `+${rating.score}` : rating.score}
          </span>
        </p>
      ) : (
        <p className="br-muted">Keine Einstufung — für den Zeitraum der Detektionen liegt keine Modellstunde vor.</p>
      )}
      {rating && (
        <ul className="br-drv-reasons">
          {rating.reasons.map((x) => (
            <li key={x.text} data-sign={x.points > 0 ? 'up' : x.points < 0 ? 'down' : 'zero'}>
              <span className="br-drv-pt">{x.points > 0 ? `+${x.points}` : x.points === 0 ? '±0' : x.points}</span>
              <span>{x.text}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="br-note">{DRIVER_RULE_TEXT}</p>

      <div className="br-drv-wind">
        <WindRoseChart rose={rose} spreadBearingDeg={r.activity?.spreadBearingDeg ?? null} dominantFromDeg={dom.fromDeg} />
        <dl className="fire-fp-dl br-drv-dl">
          <dt>Vorherrschender Wind</dt>
          <dd>
            {dom.fromDeg != null
              ? <>aus <b>{compassLabel(dom.fromDeg)}</b> ({dom.fromDeg}°) · im Mittel {dom.meanKmh} km/h{dom.maxGustKmh != null && <> · Böen bis {Math.round(dom.maxGustKmh)} km/h</>}</>
              : <>keine vorherrschende Richtung — der Wind drehte zu stark (Beständigkeit {dom.steadiness ?? '—'} unter {STEADY_MIN}){dom.meanKmh != null && <>, im Mittel {dom.meanKmh} km/h</>}</>}
            <span className="br-muted"> · geschwindigkeitsgewichtetes Vektormittel über {dom.hours} Stunden; „Beständigkeit" 1 = konstant, 0 = dreht ständig</span>
          </dd>
          <dt>Ausbreitung gegen Wind</dt>
          <dd>
            {vs
              ? <><b>{vs.diffDeg}°</b> — {spreadVsWindLabel(vs)} <span className="br-muted">(Wind weht nach {compassLabel(vs.downwindDeg)}, Schwerpunkt wandert nach {compassLabel(vs.spreadDeg)})</span></>
              : <span className="br-muted">
                  nicht bestimmbar — {r.activity?.spreadBearingDeg == null ? 'es gibt keine belastbare Ausbreitungsrichtung' : 'es gibt keine vorherrschende Windrichtung'}. Nichts wird interpoliert.
                </span>}
          </dd>
          {series && (
            <>
              <dt>FFMC / ISI</dt>
              <dd>
                {atFirst
                  ? <>bei Erstdetektion FFMC <b>{atFirst.ffmc.toFixed(1)}</b> · ISI <b>{atFirst.isi.toFixed(1)}</b>{atFirst.spinup && <span className="br-muted"> (noch im Vorlauf der Kette — nur als Größenordnung)</span>}</>
                  : <span className="br-muted">keine Stunde der Erstdetektion in der gerechneten Kette</span>}
                {series.skipped > 0 && <span className="br-muted"> · {series.skipped} Stunde{series.skipped === 1 ? '' : 'n'} ohne Werte übersprungen</span>}
              </dd>
            </>
          )}
        </dl>
      </div>

      <DriverSeriesChart hours={w.windowHours} detectionRange={w.detectionRange} index={series} width={width} />

      {series && <p className="br-note">{FIRE_INDEX_NOTE}</p>}
      <p className="br-note">
        Der Gesamt-FWI steht bewusst nicht hier. Wer ihn braucht:{' '}
        <a href="https://gwis.jrc.ec.europa.eu/apps/gwis_current_situation/" target="_blank" rel="noopener">GWIS · Current Situation</a>{' '}
        (Copernicus, CC BY 4.0) — der Dienst gibt seine Werte nur als Bild aus, nicht als Zahl, deshalb ist er hier verlinkt statt eingerechnet.
      </p>
      <p className="br-note">{FIRE_WEATHER_SOURCE_LABEL} · {FIRE_WEATHER_ATTRIBUTION}.</p>
    </div>
  );
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
      <dt>Status</dt><dd>{statusLabel(r, nowMs)}</dd>
      <dt>Fläche</dt>
      <dd>
        {prov ? (
          <>
            {prov.head}: <b>{prov.value}</b>
            <span className="br-muted"> — {prov.note} {prov.source}</span>
          </>
        ) : (
          <>
            {areaLabel(r)}
            {r.areaHa.kind === 'upper-bound' && ' — vom Satelliten abgedeckt (ein Pixel deckt 14–60 ha), Obergrenze, keine Brandfläche'}
            {r.areaHa.kind === 'mapped' && ' — von EFFIS gemessen'}
            {r.areaHa.value == null && ` (${missingReason(r, 'area')})`}
            {r.sources.effisExtra > 0 && ` · ${r.sources.effisExtra} weitere Kartierung${r.sources.effisExtra === 1 ? '' : 'en'} im selben Cluster`}
          </>
        )}
      </dd>
      <MappingRow r={r} nowMs={nowMs} />
      {!prov && act && (act.areaEst || act.areaEstReason) && (
        <>
          <dt>Schätzung</dt>
          <dd>
            {act.areaEst
              ? <>Fläche <b>{estimateLabel(act.areaEst).split(' — ')[0]}</b>{' — '}{estimateLabel(act.areaEst).split(' — ').slice(1).join(' — ')}</>
              : <span className="br-muted">— {act.areaEstReason}</span>}
            {act.areaEst && r.areaHa.kind === 'mapped' && r.areaHa.value != null && (
              <span className="br-muted"> · zum Vergleich kartiert: {r.areaHa.value.toLocaleString('de-DE')} ha (die Kartierung gilt)</span>
            )}
          </dd>
        </>
      )}
      <dt>Erstdetektion</dt><dd>{r.firstMs != null ? fmtStamp(r.firstMs) : <span title={missingReason(r, 'hotspots') ?? ''}>—</span>}</dd>
      <dt>Letzte Detektion</dt><dd>{r.lastMs != null ? `${fmtStamp(r.lastMs)} (${ageText(Math.max(0, nowMs - r.lastMs))})` : '—'}</dd>
      <dt>Hotspots</dt>
      <dd>
        {r.hotspots != null
          ? `${r.hotspots} · ${r.overpasses ?? 0} Überflüge · Satelliten ${r.satellites?.join(', ') || '—'}`
          : <span title={missingReason(r, 'hotspots') ?? ''}>— (kein Satellitensignal im Fenster)</span>}
      </dd>
    </>
  );
}

/** Konfidenz + Methode — BD1 unter „Kennzahlen", im Dossier (Vorlage) unter „Einordnung". */
export function DetailConfidenceRows({ r }: { r: FireRecord }) {
  const conf = r.confidence;
  return (
    <>
      <dt>Konfidenz</dt>
      <dd>
        {conf.firms ? `FIRMS ${confidenceLabel(r)}` : <span title={missingReason(r, 'confidence') ?? ''}>—</span>}
        {conf.assessment && <> · Bewertung <b>{LEVEL_LABEL[conf.assessment]}</b></>}
        {conf.reasons.length > 0 && (
          <ul className="fire-fp-reasons">
            {conf.reasons.map((s) => <li key={s}>{s}</li>)}
          </ul>
        )}
      </dd>
      <dt>Methode</dt><dd>{r.method.map((m) => METHOD_LABEL[m]).join(' · ')}</dd>
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
      {r.frpSumMw != null && <><dt>ΣFRP</dt><dd>{r.frpSumMw.toLocaleString('de-DE', { maximumFractionDigits: 1 })} MW — Leistung, summiert über Pixel und Überflüge, keine Fläche</dd></>}
      {act && act.frpLastPassMw != null && (
        <><dt>FRP je Überflug</dt><dd>{activitySummary(act)} — ΣFRP des jüngsten bzw. stärksten Überflugs (nicht die Fenstersumme oben)</dd></>
      )}
    </>
  );
}

/** Verlauf: Chart + Tendenz · Beobachtung · Ausbreitung · FRE · Überflüge · Je Überflug. */
export function DetailVerlauf({ r, nowMs, compact = false, wide = false, wideWidth }: { r: FireRecord; nowMs: number; compact?: boolean; wide?: boolean; wideWidth?: number }) {
  const act = r.activity;
  return (
    <>
      {r.passes.length > 0
        ? <FirePassChart passes={r.passes} nowMs={nowMs} compact={compact} wide={wide} wideWidth={wideWidth} />
        : <p className="br-muted br-detail-empty">Kein Überflug im Fenster — es gibt keinen zeitlichen Verlauf, nur die Kartierung.</p>}
      {act && act.passCount > 0 && (
        <dl className="fire-fp-dl">
          <dt>Tendenz</dt>
          <dd>
            {act.state && act.state !== 'no-signal'
              ? <><b className={`fire-fp-trend is-${act.state}`}>{STATE_LABEL[act.state]}</b>{act.stateNote ? ` — ${act.stateNote}` : ''}</>
              : act.state === 'no-signal'
                ? <>kein Signal{act.stateNote ? ` — ${act.stateNote}` : ''}</>
                : <span className="br-muted">— {act.stateNote ?? 'nicht bestimmbar'}</span>}
            <span className="br-muted"> · FRP-Verlauf der letzten Überflüge derselben Tageshälfte; nicht die Tendenz der Ereignis-Einordnung</span>
          </dd>
          {act.state === 'no-signal' && (
            <>
              <dt>Beobachtung</dt>
              <dd>
                {act.observation
                  ? <><b>{OBSERVATION_LABEL[act.observation]}</b>{act.observationNote ? ` — ${act.observationNote}` : ''}</>
                  : <span className="br-muted">— nicht bestimmt (keine Zeilen für den Umkreis)</span>}
              </dd>
            </>
          )}
          <dt>Ausbreitung</dt>
          <dd>
            {act.spreadBearingDeg != null ? (
              <>
                Schwerpunkt wandert nach <b>{compassLabel(act.spreadBearingDeg)}</b> ({act.spreadBearingDeg}°, {act.spreadDistanceM} m zwischen den Überflügen)
                {act.windAgreement === 'agree' && <> · <span className="fire-fp-wind is-agree">mit dem ICON-D2-Wind ({act.windFromDeg}° aus)</span></>}
                {act.windAgreement === 'disagree' && <> · <span className="fire-fp-wind is-disagree">gegen den ICON-D2-Wind ({act.windFromDeg}° aus) — Schwerpunkt verzerrt oder zwei Feuer?</span></>}
                {act.windAgreement === null && act.windFromDeg != null && <> · <span className="br-muted">Wind ({act.windFromDeg}° aus) weder klar dafür noch dagegen</span></>}
                {act.windFromDeg == null && <> · <span className="br-muted">kein Windabgleich hier (Windlayer aus); der Abgleich gegen die Modell-Stundenreihe steht unter „Wetterführung"</span></>}
                {act.spreadSpeedMh != null && act.spreadSpanMs != null && (
                  <> · <b>{act.spreadSpeedMh.toLocaleString('de-DE')} m/h</b> über {Math.round(act.spreadSpanMs / 3_600_000)} h</>
                )}
                <span className="br-muted"> · Verschiebung des FRP-Schwerpunkts, kein Frontverlauf — die Zahl ist eine <b>Verlagerung</b> zwischen Momentaufnahmen, nicht die Geschwindigkeit der Feuerfront</span>
              </>
            ) : (
              <span className="br-muted">— keine Richtung bestimmbar (unter 3 Überflügen mit FRP oder Verschiebung unter einer halben Pixelbreite); die Ausdehnung der Hülle steht in der Kachel</span>
            )}
          </dd>
          {act.spreadConfidence && (
            <>
              <dt>Konfidenz der Richtung</dt>
              <dd>
                {act.spreadConfidence.passes === 1 ? '1 Überflug' : `${act.spreadConfidence.passes} Überflüge`} mit FRP · {act.spreadConfidence.detections} Detektionen
                {act.spreadConfidence.passes > 1 && <> · {Math.round(act.spreadConfidence.spanMs / 3_600_000)} h Zeitspanne</>}
                {act.spreadConfidence.meanStepM != null && <> · mittlerer Schritt {act.spreadConfidence.meanStepM.toLocaleString('de-DE')} m</>}
                <span className="br-muted">{' '}— {spreadConfidenceNote(act)}</span>
              </dd>
            </>
          )}
          <dt>FRE</dt><dd>{freLabel(act)}</dd>
          <dt>Überflüge</dt>
          <dd>
            {act.daynightMix ? DAYNIGHT_LABEL[act.daynightMix] : '—'}
            {act.meanScanKm != null && <> · mittlere Pixelbreite {act.meanScanKm.toLocaleString('de-DE')} km{act.meanScanKm > 0.6 ? ' (Schwadrand — größere Pixel, andere Detektionswahrscheinlichkeit)' : ''}</>}
          </dd>
          {r.passes.length > 0 && (
            <>
              <dt>Je Überflug</dt>
              <dd className="fire-fp-dd-wide">
                <ul className="fire-fp-passes fire-fp-passes--af">
                  {r.passes.slice(-8).map((ps) => (
                    <li key={ps.key}>
                      <span>{fmtStamp(ps.atMs)}</span>
                      <span title={ps.satellite}>{ps.satellite || '—'} {ps.day === true ? '☀' : ps.day === false ? '☾' : ''}</span>
                      <span>{ps.pixels} Px</span>
                      <span>{ps.frpPixels > 0 ? `${ps.sumFrp.toLocaleString('de-DE', { maximumFractionDigits: 1 })} MW` : '—'}</span>
                    </li>
                  ))}
                </ul>
                <span className="br-muted">{r.passes.length > 8 ? `die letzten 8 von ${r.passes.length} Überflügen` : 'je Überflug'} ({clockLabel(r.passes[0].atMs)} … {clockLabel(r.passes[r.passes.length - 1].atMs)}) — je Satellit, 10-min-Regel; ☀ Tag, ☾ Nacht; nur innerhalb des Fensters, kein Speicher über Sitzungen</span>
              </dd>
            </>
          )}
        </dl>
      )}
    </>
  );
}

/** Einordnung & Bestätigung: Ort · Landbedeckung · Anlage? · Kartierung · EMS · GeoSphere (ohne Ursache). */
export function DetailEinordnungRows({ r, atContext = null }: { r: FireRecord; atContext?: AtWarnContext | null }) {
  const eff = r.sources.effis;
  return (
    <>
      <dt>Ort</dt>
      <dd>
        {r.place.name || r.place.district
          ? `${r.place.name ?? '—'} · ${r.place.district ?? '—'} (${r.place.source === 'effis' ? 'EFFIS' : `nächster Ort aus dem Verzeichnis, ${r.place.distanceKm?.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km — GeoNames CC BY 4.0`})`
          : <span title={missingReason(r, 'place') ?? ''}>— (nicht bestimmt)</span>}
        {' · '}{countryLabel(r.country)}
      </dd>
      <dt>Landbedeckung</dt>
      <dd>
        {r.landcover && r.landcover.length > 0
          ? (
            <span className="fire-fp-lc">
              {r.landcover.slice(0, 4).map((l) => (
                <span key={l.key} className="fire-li-lc-item">
                  <span className="fire-swatch" style={{ background: LANDCOVER_COLOR[l.key] }} aria-hidden="true" />
                  {Math.round(l.pct)} % {LANDCOVER_LABEL[l.key]}
                </span>
              ))}
              <span className="br-muted"> (EFFIS/CORINE)</span>
            </span>
          )
          : <span title="Landbedeckungsanteile liefert nur die EFFIS-Kartierung">—</span>}
      </dd>
      {(r.anomaly || r.suspectedStatic) && (
        <>
          <dt>Anlage?</dt>
          <dd>
            {r.anomaly
              ? (r.anomaly.kind === 'site'
                ? <>Bekannter Standort: {siteLabel(r.anomaly.site)} — eigene Ableitung aus dem FIRMS-Archiv und Anlagenverzeichnissen, kein Nachweis.</>
                : <>Nahe bekanntem Standort ({siteLabel(r.anomaly.site)}), das Signal weicht vom Anlagenmuster ab — als Brand behandelt.</>)
              : 'Vermutlich Industrieanlage — an ≥ 5 Tagen am selben Ort (eigene Einordnung, kein Nachweis).'}
          </dd>
        </>
      )}
      {eff && (
        <>
          <dt>Kartierung</dt>
          <dd>EFFIS-Kennung {eff.id} · Branddatum {fmtDate(eff.firedateMs)} · Stand {fmtDate(eff.lastUpdateMs)}{eff.percNa2k != null && eff.percNa2k > 0 ? ` · ${Math.round(eff.percNa2k)} % Natura 2000` : ''}</dd>
        </>
      )}
      {r.sources.ems && (
        <>
          <dt>Copernicus EMS</dt>
          <dd>
            {r.sources.ems.code}{r.sources.ems.name ? ` — ${r.sources.ems.name}` : ''} · {r.sources.ems.closed === false ? 'offen' : r.sources.ems.closed === true ? 'geschlossen' : 'Status unbekannt'}
            {' · '}<a href={`https://rapidmapping.emergency.copernicus.eu/${r.sources.ems.code}`} target="_blank" rel="noopener">Aktivierung öffnen</a>
          </dd>
        </>
      )}
      {/* GWBA1 A3: GeoSphere-Warntexte WÖRTLICH (Zitatregel) — Kontext, nie Bestätigung. */}
      {atContext && atContext.warnings.length > 0 && (
        <>
          <dt>GeoSphere-Kontext</dt>
          <dd>
            {atContext.gemeinde && <span className="br-muted">{atContext.gemeinde} · </span>}
            {atContext.warnings.map((w, i) => (
              <span key={`${w.type}-${i}`}>
                {i > 0 && ' · '}
                <b>{w.typeLabel}</b> ({w.levelLabel}){w.text ? <>: <q>{w.text}</q></> : null}
              </span>
            ))}
            <span className="br-muted"> — amtlicher Warntext (Zitat), keine Brandbestätigung</span>
          </dd>
        </>
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
