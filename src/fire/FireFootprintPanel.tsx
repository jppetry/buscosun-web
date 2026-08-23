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

import { useState, type ReactNode } from 'react';
import {
  type FireRecord, type RecordSort, type RecordFilter, type FireStatusKind,
  STATUS_LABEL, STATUS_COLOR, METHOD_LABEL, statusLabel, areaLabel, confidenceLabel,
  missingReason, registryNote, provisionalArea,
} from './footprint/fireRegistry';
import {
  CLUSTER_PAGE, STATIC_GREY, countryLabel,
  strengthLabel, extentLabel, clusterColorOf, CLUSTER_FRP_STOPS, CLUSTER_NOTE,
} from './fireClusters';
import { freLabel, DAYNIGHT_LABEL } from './activity/intensity';
import { activitySummary } from './activity/fireActivity';
import { STATE_LABEL, compassLabel } from './activity/dynamics';
import type { SpreadRun } from './spread/spreadRun';
import type { FireSpread } from './spread/spreadForecast';
import { SPREAD_CAVEAT, gapText, observedCompareText, spreadHint } from './spread/spreadText';
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
  detail: FireRecord | null;
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
  /** SF1: der Ausbreitungslauf — dieselbe Quelle wie die Pfeile auf der Karte. */
  spread?: SpreadRun | null;
  /** GWBA1 A3: GeoSphere-Warnkontext je AT-Brand — Zitat, nie Bestätigung. */
  atContextFor?: (r: FireRecord) => AtWarnContext | null;
}

/** 6 h ohne neuen Überflug bzw. 4 d ohne EFFIS-Bearbeitung ⇒ „veraltet" (gemessene Takte). */
const DETECTION_STALE_MS = 6 * 3_600_000;
const EFFIS_STALE_MS = 4 * 86_400_000;

const fmtStamp = (ms: number | null): string =>
  ms == null ? '—' : new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtDate = (ms: number | null): string =>
  ms == null ? '—' : new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const de = (n: number, frac = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: frac });

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
function recordName(r: FireRecord): string {
  const name = r.place.name && r.place.source === 'gazetteer' && r.place.distanceKm != null
    ? `bei ${r.place.name}`
    : r.place.name;
  return name ?? r.place.district ?? `${r.lat.toFixed(2)}° N · ${r.lon.toFixed(2)}° E`;
}

/** „DE · Brandenburg" — Land und Kreis/Region; ohne Kreis nur das Land, nie geraten. */
function regionLabel(r: FireRecord): string {
  const c = r.country == null ? '—' : r.country === 'outside' ? 'außerhalb' : r.country;
  return r.place.district ? `${c} · ${r.place.district}` : c;
}

/** Der Ausbreitungsvektor der Vorlage: „NO · 1,4 km/h" aus dem FBP-Lauf (m/min → km/h). */
function spreadVectorLabel(sp: FireSpread | null): { dir: string; kmh: string } | null {
  const v = sp?.shown?.vector;
  if (!v) return null;
  return { dir: compassLabel(v.razDeg), kmh: de(v.rosMmin * 0.06, 1) };
}

/** Herkunft der Flächenangabe — Vorlage: „EFFIS kartiert" (Sage) vs. „geschätzt". */
function areaOrigin(r: FireRecord): { text: string; tone: 'mapped' | 'est' | 'none' } {
  if (r.areaHa.kind === 'mapped') return { text: 'EFFIS kartiert', tone: 'mapped' };
  if (provisionalArea(r)) return { text: 'geschätzt', tone: 'est' };
  if (r.areaHa.kind === 'upper-bound') return { text: 'Obergrenze (Raster)', tone: 'est' };
  return { text: 'keine Fläche', tone: 'none' };
}

/** Die Flächenzahl ohne Wortzusatz („128 ha"); vorläufig = Schätzwert mit Intervall im title. */
function areaValue(r: FireRecord): string {
  const prov = provisionalArea(r);
  if (prov) return prov.value.split(' (')[0];
  if (r.areaHa.value == null) return 'keine Fläche';
  return `${r.areaHa.value.toLocaleString('de-DE', { maximumFractionDigits: 0 })} ha`;
}

function Badge({ r }: { r: FireRecord }) {
  const b = badgeOf(r.status.kind, r.suspectedStatic, r.anomaly?.kind ?? null);
  return <span className={`br-badge is-${b}`}>{BR_BADGE_LABEL[b]}</span>;
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
            const sp = p.spread?.byId.get(r.id) ?? null;
            const vec = spreadVectorLabel(sp);
            const origin = areaOrigin(r);
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
                    {sel ? (
                      <span className="br-fire-stats">
                        <span className="br-stat">
                          <span className="br-stat-lbl">Fläche</span>
                          <span className="br-stat-val" title={provisionalArea(r)?.value ?? areaLabel(r)}>{areaValue(r)}</span>
                          <span className={`br-stat-sub is-${origin.tone}`}>{origin.text}</span>
                        </span>
                        <span className="br-stat">
                          <span className="br-stat-lbl">Detektionen</span>
                          <span className="br-stat-val">{r.hotspots ?? '—'}</span>
                          <span className="br-stat-sub">{r.lastMs != null ? `letzte ${ageText(Math.max(0, nowMs - r.lastMs))}` : 'keine im Fenster'}</span>
                        </span>
                        <span className="br-stat">
                          <span className="br-stat-lbl">Ausbreitung</span>
                          <span className={`br-stat-val${vec ? ' is-spread' : ''}`}>{vec ? `${vec.dir} · ${vec.kmh} km/h` : '—'}</span>
                          <span className="br-stat-sub">{vec ? 'FBP-Modell' : sp?.reason ? 'kein Pfeil' : 'nicht gerechnet'}</span>
                        </span>
                      </span>
                    ) : (
                      <span className="br-fire-line">
                        {origin.tone === 'none'
                          ? <span className="br-muted">keine Fläche</span>
                          : <><strong>{areaValue(r)}</strong> <em className={`is-${origin.tone}`}>{origin.tone === 'mapped' ? 'EFFIS' : 'geschätzt'}</em></>}
                        {' · '}
                        {r.hotspots != null
                          ? <><strong>{r.hotspots}</strong> Detektionen</>
                          : <span className="br-muted" title={missingReason(r, 'hotspots') ?? ''}>— Detektionen</span>}
                        {r.lastMs != null && <> · <span className="br-muted">{ageText(Math.max(0, nowMs - r.lastMs))}</span></>}
                        {vec && <> · <span className="br-fire-vec">→ {vec.dir} · {vec.kmh} km/h</span></>}
                      </span>
                    )}
                    {/* BP5 — Stärke (ΣFRP) und Ausdehnung der Hülle; ohne Detektion „—" mit Grund, nie 0. */}
                    <span className="br-fire-meta">
                      {r.sources.cluster ? (
                        <>
                          <span className="fire-crow-dot" style={{ background: r.suspectedStatic ? STATIC_GREY : clusterColorOf(r.sources.cluster) }} aria-hidden="true" />
                          <span title="Summe der Feuerstrahlungsleistung über Pixel UND Überflüge — eine Leistung, keine Fläche und keine Energie.">ΣFRP {strengthLabel(r.sources.cluster)}</span>
                          {' · '}
                          <span title="Ausdehnung der konvexen Hülle über die Detektionsorte — nicht die verbrannte Fläche.">{extentLabel(r.sources.cluster)} Ausdehnung</span>
                        </>
                      ) : (
                        <span title={missingReason(r, 'hotspots') ?? ''}>— keine Leistung (keine Detektion im Fenster)</span>
                      )}
                      {' · '}{statusLabel(r, nowMs)}
                      {r.activity?.state && r.activity.state !== 'no-signal' && (
                        <> · <span className={`fire-fp-trend is-${r.activity.state}`} title={r.activity.stateNote ?? ''}>{STATE_LABEL[r.activity.state]}</span></>
                      )}
                      {r.activity?.state === 'no-signal' && r.activity.observation && (
                        <> · <span className={`fire-fp-obs is-${r.activity.observation}`} title={r.activity.observationNote ?? ''}>{r.activity.observation === 'confirmed' ? 'Sicht gegeben' : 'nicht beobachtbar'}</span></>
                      )}
                    </span>
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
                  {sel && p.detail && p.detail.id === r.id && (
                    <FootprintDetail r={p.detail} nowMs={nowMs} onClose={p.onClearSelect} spreadRun={p.spread ?? null} atContext={at} />
                  )}
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
function FeaturesRow({ r, nowMs }: { r: FireRecord; nowMs: number }) {
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
      <dt>Merkmale</dt>
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

/** Die Detailkarte eines Eintrags — in der Brandkarte, kein Popup. Jede Zahl mit Art und Quelle. */
export function FootprintDetail(
  { r, nowMs, onClose, spreadRun = null, atContext = null }:
  { r: FireRecord; nowMs: number; onClose: () => void; spreadRun?: SpreadRun | null; atContext?: AtWarnContext | null },
) {
  // Der GANZE Lauf, nicht nur der Eintrag: nur so lässt sich „der Lauf kennt
  // diesen Brand nicht" von „der Lauf hat für ihn keine Aussage" unterscheiden.
  const spread = spreadRun?.byId.get(r.id) ?? null;
  const eff = r.sources.effis;
  const conf = r.confidence;
  // VB3: die vorläufige Brandfläche — `null`, sobald eine Kartierung vorliegt.
  const prov = provisionalArea(r);
  return (
    <section className="br-detail" aria-label={`Details ${recordTitle(r)}`}>
      <div className="br-detail-head">
        <span className="br-eyebrow">Details</span>
        <button type="button" className="br-close" aria-label="Details schließen" onClick={onClose}>×</button>
      </div>
      <dl className="fire-fp-dl">
        <dt>Kennung</dt><dd><code>{r.id}</code>{r.previousIds.length > 0 && <span className="br-muted"> · zuvor {r.previousIds.length}×</span>}</dd>
        {r.mergedFrom.length > 0 && <><dt>Merge</dt><dd>zusammengewachsen aus {r.mergedFrom.length + 1} Detektionsgruppen dieser Sitzung</dd></>}
        {r.splitFrom && <><dt>Split</dt><dd>aus <code>{r.splitFrom}</code> hervorgegangen (Verbindung aus dem Fenster gefallen)</dd></>}
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
        {!prov && r.activity && (r.activity.areaEst || r.activity.areaEstReason) && (
          <>
            <dt>Schätzung</dt>
            <dd>
              {r.activity.areaEst
                ? <>Fläche <b>{estimateLabel(r.activity.areaEst).split(' — ')[0]}</b>{' — '}{estimateLabel(r.activity.areaEst).split(' — ').slice(1).join(' — ')}</>
                : <span className="br-muted">— {r.activity.areaEstReason}</span>}
              {r.activity.areaEst && r.areaHa.kind === 'mapped' && r.areaHa.value != null && (
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
        {r.frpSumMw != null && <><dt>ΣFRP</dt><dd>{r.frpSumMw.toLocaleString('de-DE', { maximumFractionDigits: 1 })} MW — Leistung, summiert über Pixel und Überflüge, keine Fläche</dd></>}
        {r.activity && r.activity.frpLastPassMw != null && (
          <><dt>FRP je Überflug</dt><dd>{activitySummary(r.activity)} — ΣFRP des jüngsten bzw. stärksten Überflugs (nicht die Fenstersumme oben)</dd></>
        )}
        {r.activity && r.activity.passCount > 0 && (
          <>
            <dt>Tendenz</dt>
            <dd>
              {r.activity.state && r.activity.state !== 'no-signal'
                ? <><b>{STATE_LABEL[r.activity.state]}</b>{r.activity.stateNote ? ` — ${r.activity.stateNote}` : ''}</>
                : r.activity.state === 'no-signal'
                  ? <>kein Signal{r.activity.stateNote ? ` — ${r.activity.stateNote}` : ''}</>
                  : <span className="br-muted">— {r.activity.stateNote ?? 'nicht bestimmbar'}</span>}
              <span className="br-muted"> · FRP-Verlauf der letzten Überflüge derselben Tageshälfte; nicht die Tendenz der Ereignis-Einordnung</span>
            </dd>
            {r.activity.state === 'no-signal' && (
              <>
                <dt>Beobachtung</dt>
                <dd>
                  {r.activity.observation
                    ? <><b>{OBSERVATION_LABEL[r.activity.observation]}</b>{r.activity.observationNote ? ` — ${r.activity.observationNote}` : ''}</>
                    : <span className="br-muted">— nicht bestimmt (keine Zeilen für den Umkreis)</span>}
                </dd>
              </>
            )}
            {r.activity.spreadBearingDeg != null && (
              <>
                <dt>Ausbreitung bisher (beobachtet)</dt>
                <dd>
                  Schwerpunkt wandert nach <b>{compassLabel(r.activity.spreadBearingDeg)}</b> ({r.activity.spreadBearingDeg}°, {r.activity.spreadDistanceM} m zwischen den Überflügen)
                  {r.activity.windAgreement === 'agree' && <> · <span className="fire-fp-wind is-agree">mit dem ICON-D2-Wind ({r.activity.windFromDeg}° aus)</span></>}
                  {r.activity.windAgreement === 'disagree' && <> · <span className="fire-fp-wind is-disagree">gegen den ICON-D2-Wind ({r.activity.windFromDeg}° aus) — Schwerpunkt verzerrt oder zwei Feuer?</span></>}
                  {r.activity.windAgreement === null && r.activity.windFromDeg != null && <> · <span className="br-muted">Wind ({r.activity.windFromDeg}° aus) weder klar dafür noch dagegen</span></>}
                  {r.activity.windFromDeg == null && <> · <span className="br-muted">kein Windabgleich (Windlayer aus oder kein Frame nahe genug)</span></>}
                  <span className="br-muted"> · Verschiebung des FRP-Schwerpunkts, kein Frontverlauf</span>
                </dd>
              </>
            )}
            <dt>FRE</dt><dd>{freLabel(r.activity)}</dd>
            <dt>Überflüge</dt>
            <dd>
              {r.activity.daynightMix ? DAYNIGHT_LABEL[r.activity.daynightMix] : '—'}
              {r.activity.meanScanKm != null && <> · mittlere Pixelbreite {r.activity.meanScanKm.toLocaleString('de-DE')} km{r.activity.meanScanKm > 0.6 ? ' (Schwadrand — größere Pixel, andere Detektionswahrscheinlichkeit)' : ''}</>}
            </dd>
          </>
        )}
        {/* SF1 — die GERECHNETE Richtung: nie leer — entweder ein Satz oder ein benannter Grund. */}
        {spreadRun && (
          <>
            <dt>Ausbreitungsrichtung (gerechnet, nächste Stunden)</dt>
            <dd className="fire-fp-pred">
              {spread
                ? (
                  <>
                    {spreadHint(spread) ?? (
                      <span className="br-muted">— {spread.reason ? gapText(spread.reason) : 'nicht bestimmbar'}</span>
                    )}
                    {observedCompareText(spread) && (
                      <span className="br-muted"> · {observedCompareText(spread)}</span>
                    )}
                  </>
                )
                : (
                  <span className="br-muted">
                    — dieser Brand war beim letzten Lauf nicht dabei: gerechnet wird nur für Brände
                    mit aktuellem Satellitensignal, und der Bestand kann sich seither geändert haben.
                  </span>
                )}
              <span className="br-muted"> · {SPREAD_CAVEAT}</span>
            </dd>
          </>
        )}
        <FeaturesRow r={r} nowMs={nowMs} />
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
        {r.passes.length > 0 && (
          <>
            <dt>Verlauf</dt>
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
              <span className="br-muted">je Überflug ({clockLabel(r.passes[0].atMs)} … {clockLabel(r.passes[r.passes.length - 1].atMs)}) — je Satellit, 10-min-Regel; ☀ Tag, ☾ Nacht; nur innerhalb des Fensters, kein Speicher über Sitzungen</span>
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}
