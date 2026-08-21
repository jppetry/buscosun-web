/**
 * **Brandflächen-Panel** (Phase BP2, Gate GBP1) — die Liste der Brand-Registry.
 *
 * Rein präsentational: Props hinein, Rückrufe hinaus. Zustand (Auswahl, Filter,
 * Sortierung) lebt in `FirePage.tsx`, weil dort der Permalink-Effekt und das
 * Geschwister `FireMap` sitzen.
 *
 * **BP5:** Diese Liste ist die EINZIGE Brandliste. Sie steht auf beiden Größen
 * im Readout unter dem Reiter „Brände" (Desktop rechts, mobil im Bottom-Sheet)
 * und hat die frühere Cluster-Seite aufgenommen: Stärke (ΣFRP) mit Skala,
 * Ausdehnung der Hülle, Rangfolge nach Stärke und deren Pflichthinweis. Das
 * Overlay am linken Kartenrand ist damit entfallen (audit/… §11).
 *
 * Regeln, die hier gelten (audit/brandflaechen-panel.md §3, BF5):
 *  • Jeder Leerzustand nennt seinen GRUND — „keine Liste" darf nie wie
 *    „keine Brände" aussehen (D-04).
 *  • Deckel 50 Zeilen, ausgesprochen (V-246); die Kopfzeile nennt die volle Zahl.
 *  • Fehlende Werte sind „—" mit Grund im `title`, nie 0.
 *  • Beschriftungen kommen aus `fireRegistry.ts` — EINE Quelle für Liste,
 *    Karte und Verifier.
 */

import { useState, type ReactNode } from 'react';
import {
  type FireRecord, type RecordSort, type RecordFilter, type FireStatusKind,
  STATUS_LABEL, STATUS_COLOR, METHOD_LABEL, statusLabel, areaLabel, confidenceLabel,
  missingReason, registryNote, provisionalArea,
} from './footprint/fireRegistry';
import {
  CLUSTER_PAGE, STATIC_GREY, countryLabel,
  // BP5: die Leistungsangaben der früheren Cluster-Liste — dieselben Funktionen,
  // nur an einer anderen Zeile. Nichts davon wird hier neu gerechnet.
  strengthLabel, extentLabel, clusterColorOf, CLUSTER_FRP_STOPS, CLUSTER_NOTE,
} from './fireClusters';
// AF1: Intensität je Überflug — Labels aus den reinen Modulen, nichts wird hier gerechnet.
import { freLabel, DAYNIGHT_LABEL } from './activity/intensity';
import { activitySummary } from './activity/fireActivity';
import { STATE_LABEL, compassLabel } from './activity/dynamics';
import type { SpreadRun } from './spread/spreadRun';
import { SPREAD_CAVEAT, gapText, observedCompareText, spreadChip, spreadHint } from './spread/spreadText';
import { OBSERVATION_LABEL } from './activity/observation';
import { featuresOf, featuresJson, featuresSummary, FEATURE_VERSION } from './activity/features';
import { estimateLabel } from './activity/estimate';
import { LANDCOVER_LABEL, LANDCOVER_COLOR } from './fireCorroboration';
import { HISTORY_DAYS } from './footprint/history';
import { LEVEL_LABEL } from './fireAssessment';
import { ageText, clockLabel } from '../dataAge';
import { windowLabel } from './fireTime';
import type { Country } from '../types';

export type EffisScope = 'week' | 'season';

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
  records: readonly FireRecord[];
  /** Vor dem Filter — für „n von m". */
  total: number;
  detail: FireRecord | null;
  nowMs: number;
  windowH: number;
  sort: RecordSort;
  onSort: (s: RecordSort) => void;
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
  /** Der Fensterschalter (24 h / 7 d) — dieselbe Instanz wie im Dock. */
  windowSeg?: ReactNode;
  /** BP3: Ortsverzeichnis geladen? Dann trägt das Panel die GeoNames-Zeile (CC BY). */
  placesLoaded?: boolean;
  /** SF1: der Ausbreitungslauf — dieselbe Quelle wie die Pfeile auf der Karte. */
  spread?: SpreadRun | null;
}

/** 6 h ohne neuen Überflug bzw. 4 d ohne EFFIS-Bearbeitung ⇒ „veraltet" (gemessene Takte). */
const DETECTION_STALE_MS = 6 * 3_600_000;
const EFFIS_STALE_MS = 4 * 86_400_000;

const fmtStamp = (ms: number | null): string =>
  ms == null ? '—' : new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtDate = (ms: number | null): string =>
  ms == null ? '—' : new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Bezeichnung einer Zeile: Ort › Kreis, sonst Koordinate — nie ein geratener Name. */
export function recordTitle(r: FireRecord): string {
  // Verzeichnis-Ort: „bei X (3,2 km)" — der Ort ist der nächste, nicht der Brandort.
  const name = r.place.name && r.place.source === 'gazetteer' && r.place.distanceKm != null
    ? `bei ${r.place.name} (${r.place.distanceKm.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km)`
    : r.place.name;
  if (name && r.place.district) return `${name} · ${r.place.district}`;
  if (name) return name;
  if (r.place.district) return r.place.district;
  return `${r.lat.toFixed(2)}° N · ${r.lon.toFixed(2)}° E`;
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
      <p className="fire-clist-empty">
        Weder <strong>Brandflächen (Übersicht)</strong> noch <strong>Aktive Brände</strong> ist
        eingeschaltet — ohne einen der beiden gibt es keine Detektionen, aus denen Einträge entstehen.
        {' '}
        <button type="button" className="fire-fp-inline-btn" onClick={p.onEnableLayer}>Brandflächen einschalten</button>
      </p>
    );
  } else if (state.load === 'error') {
    stateBox = (
      <p className="fire-clist-empty">
        Die Satellitendetektion ist gerade nicht abrufbar{state.loadMessage ? ` (${state.loadMessage})` : ''}.
        Ausfall, nicht Leerstand: <strong>keine Daten</strong> heißt nicht „keine Brände".
        {records.length > 0 && ' Die Einträge unten stammen allein aus der EFFIS-Kartierung.'}
      </p>
    );
  } else if (state.load === 'loading' && state.detections === 0) {
    stateBox = <p className="fire-clist-empty">Detektionen werden geladen …</p>;
  } else if (state.provider === 'gwis') {
    stateBox = (
      <p className="fire-clist-empty">
        <strong>Notbetrieb:</strong> NASA FIRMS ist nicht erreichbar; die Rückfallquelle (Copernicus GWIS)
        liefert weder Pixelgeometrie noch Konfidenz noch Leistung — daraus lassen sich keine Flächen und
        keine Einträge bilden. Eine Rangfolge „nach Stärke" wäre in diesem Zustand erfunden; deshalb
        gibt es sie nicht. Kartierte Flächen (EFFIS) werden weiter gezeigt.
      </p>
    );
  } else if (state.detections > 0 && !state.clustersReady) {
    stateBox = <p className="fire-clist-empty">Detektionen da — Einträge werden gebildet …</p>;
  } else if (p.total === 0) {
    stateBox = (
      <p className="fire-clist-empty">
        Keine Detektion in den letzten {windowLabel(p.windowH)} und keine von EFFIS kartierte Fläche
        {p.effisScope === 'week' ? ` der letzten ${HISTORY_DAYS} Tage` : ' dieser Saison'}.
        {state.effisFailed && ' Die EFFIS-Abfrage ist dabei fehlgeschlagen — kartierte Flächen könnten fehlen.'}
      </p>
    );
  }

  // Ohne aktive Quelle KEINE Liste — die Zeilen wären der Stand von eben, und
  // neben dem Kasten „kein Layer an" läsen sie sich wie eine Behauptung.
  const list = anySource ? records.slice(0, p.shown) : [];

  return (
    <div className={`fire-fp${p.inSheet ? ' is-sheet' : ''}`}>
      <div className="fire-ro-section-head">
        <span className="fire-eyebrow">Brände · je Brand</span>
        <span className="fire-dock-count">
          {!anySource ? '—' : p.total === records.length ? `${p.total}` : `${records.length} von ${p.total}`}
        </span>
        {p.onClose && !p.inSheet && (
          <button type="button" className="fire-fp-close" aria-label="Panel schließen" onClick={p.onClose}>×</button>
        )}
      </div>

      {/* Zeitfenster: Detektionen folgen dem Hotspot-Fenster, EFFIS der Historie —
          zwei Fenster, ehrlich benannt, kein gemeinsamer Regler. */}
      <div className="fire-fp-scope">
        <div className="fire-fp-scope-row">
          <span className="fire-fp-lbl">Detektionen</span>
          {p.windowSeg ?? <span className="fire-fp-val">{windowLabel(p.windowH)}</span>}
        </div>
        <div className="fire-fp-scope-row">
          <span className="fire-fp-lbl">Kartierungen</span>
          <div className="fire-subseg" data-accent="terracotta" role="group" aria-label="Umfang der EFFIS-Kartierungen">
            <button type="button" className={p.effisScope === 'week' ? 'is-active' : ''} onClick={() => p.onEffisScope('week')}>
              {HISTORY_DAYS} Tage
            </button>
            <button
              type="button" className={p.effisScope === 'season' ? 'is-active' : ''}
              disabled={!state.seasonLoaded}
              title={state.seasonLoaded ? 'Alle kartierten Flächen der laufenden Saison' : 'Saison-Korb ist nicht geladen (Layer „Kartierte Brandflächen" einschalten)'}
              onClick={() => state.seasonLoaded && p.onEffisScope('season')}
            >
              Saison
            </button>
          </div>
        </div>
      </div>

      {(staleDetection || staleEffis) && (
        <p className="fire-fp-stale" role="status">
          {staleDetection && `Jüngste Detektion ${ageText(state.detectionAgeMs ?? 0)} — seither kein Überflug ausgewertet. `}
          {staleEffis && `EFFIS-Stand ${fmtDate(state.effisUpdateMs)} — die Kartierung hinkt 1–4 Tage nach.`}
        </p>
      )}

      {stateBox}

      {/* Sortierung + Filter */}
      <div className="fire-fp-controls">
        <div className="fire-fp-ctl">
          <span className="fire-fp-lbl">Sortieren</span>
          <div className="fire-subseg" data-accent="terracotta" role="group" aria-label="Sortierung">
            {(['area', 'strength', 'recency', 'status'] as RecordSort[]).map((s) => (
              <button
                key={s} type="button" className={p.sort === s ? 'is-active' : ''}
                title={s === 'strength' ? 'Summe der Feuerstrahlungsleistung — die Rangfolge der früheren Cluster-Liste. Einträge ohne Detektion stehen hinten.' : undefined}
                onClick={() => p.onSort(s)}
              >
                {s === 'area' ? 'Fläche' : s === 'strength' ? 'Stärke' : s === 'recency' ? 'Aktualität' : 'Status'}
              </button>
            ))}
          </div>
        </div>
        <div className="fire-fp-ctl">
          <span className="fire-fp-lbl">Mindestfläche</span>
          <div className="fire-subseg" data-accent="terracotta" role="group" aria-label="Mindestfläche">
            {[0, 1, 5, 20].map((ha) => (
              <button
                key={ha} type="button" className={filter.minAreaHa === ha ? 'is-active' : ''}
                title={ha === 0 ? 'alle, auch ohne Flächenangabe' : `ab ${ha} ha — gilt für kartierte Flächen und Obergrenzen gleichermaßen`}
                onClick={() => p.onFilter({ ...filter, minAreaHa: ha })}
              >
                {ha === 0 ? 'alle' : `≥ ${ha} ha`}
              </button>
            ))}
          </div>
        </div>
        <div className="fire-fp-ctl">
          <span className="fire-fp-lbl">Status</span>
          <div className="fire-fp-chips" role="group" aria-label="Status">
            {(['active', 'no-signal', 'out'] as FireStatusKind[]).map((k) => (
              <button
                key={k} type="button"
                className={`fire-fp-chip${!filter.status || filter.status.has(k) ? ' is-on' : ''}`}
                aria-pressed={!filter.status || filter.status.has(k)}
                onClick={() => setStatus(k)}
              >
                <StatusDot status={k} isStatic={false} />{STATUS_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="fire-fp-ctl">
          <span className="fire-fp-lbl">Land</span>
          <div className="fire-fp-chips" role="group" aria-label="Land">
            {(['DE', 'AT', 'CH'] as Country[]).map((c) => (
              <button
                key={c} type="button"
                className={`fire-fp-chip${!filter.countries || filter.countries.has(c) ? ' is-on' : ''}`}
                aria-pressed={!filter.countries || filter.countries.has(c)}
                onClick={() => setCountry(c)}
              >
                {c}
              </button>
            ))}
            <span className="fire-fp-chip-note" title="Einträge ohne Landeszuordnung (Umrisse noch nicht geladen) bleiben bei jedem Filter sichtbar — nichts wird behauptet.">unbekannt bleibt</span>
          </div>
        </div>
      </div>

      {/* BP5 — Ersatz für „N Cluster aus M Detektionen": dieselbe Aussage über
          dieselbe Datenmenge, aber in der Bezugsgröße dieser Liste. Die
          Verschmelzung wird benannt, damit die Zahl nicht als Widerspruch zur
          Detektionszahl gelesen wird. */}
      {anySource && list.length > 0 && state.detections > 0 && (
        <p className="fire-clist-window">
          {p.total === 1 ? 'Ein Brand' : `${p.total.toLocaleString('de-DE')} Brände`} aus{' '}
          {state.detections.toLocaleString('de-DE')} Detektionen der letzten {windowLabel(p.windowH)} —
          dem Fenster, das auch die Karte zeigt. Detektionsgruppen, die dieselbe kartierte Fläche
          treffen, zählen als EIN Brand; kartierte Flächen ohne Überflug zählen mit.
        </p>
      )}

      {/* BP5 — aus der Cluster-Ansicht mitgenommen: der Pflichthinweis steht ÜBER
          der Liste, nicht unter ihr. Bei mehreren hundert Zeilen läge er sonst
          hinter dem gesamten Scrollweg, die Zahlen stünden faktisch ohne ihn. */}
      <p className="fire-clist-note">{CLUSTER_NOTE}</p>
      {/* Die Stärke-Skala: dieselben Stopps, die den Punkt in der Zeile färben. */}
      <div className="fire-clist-legend">
        <span className="fire-li-unit">Stärke: Summe der Feuerstrahlungsleistung</span>
        <ol>
          {CLUSTER_FRP_STOPS.map(([mw, col], i) => (
            <li key={mw}>
              <span className="fire-swatch" style={{ background: col }} aria-hidden="true" />
              <span className="fire-li-cls-range">
                {i === CLUSTER_FRP_STOPS.length - 1 ? `ab ${mw} MW` : `${mw}–${CLUSTER_FRP_STOPS[i + 1][0]} MW`}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* Legende */}
      <div className="fire-fp-legend" aria-label="Legende">
        {(['active', 'no-signal', 'out'] as FireStatusKind[]).map((k) => (
          <span key={k} className="fire-fp-lg"><StatusDot status={k} isStatic={false} />{STATUS_LABEL[k]}</span>
        ))}
        <span className="fire-fp-lg"><i className="fire-li-fp is-static" />ortsfest (Vorbehalt)</span>
        <span className="fire-fp-lg"><i className="fire-li-fp is-mapped" />kartiert (EFFIS)</span>
        <span className="fire-fp-lg"><i className="fire-li-fp is-raster" />Obergrenze (Raster)</span>
      </div>

      {list.length > 0 && (
        <ol className="fire-fplist" onMouseLeave={() => p.onHover(null)}>
          {list.map((r, i) => {
            const sel = p.selectedId === r.id;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  data-fire={r.id}
                  className={`fire-fprow${sel ? ' is-sel' : ''}${r.suspectedStatic ? ' is-static' : ''}`}
                  aria-pressed={sel}
                  onMouseEnter={() => p.onHover(r.id)}
                  onFocus={() => p.onHover(r.id)}
                  onBlur={() => p.onHover(null)}
                  onClick={() => (sel ? p.onClearSelect() : p.onSelect(r.id))}
                >
                  <span className="fire-crow-rank">{i + 1}</span>
                  <span className="fire-fprow-main">
                    <span className="fire-fprow-top">
                      <StatusDot status={r.status.kind} isStatic={r.suspectedStatic} />
                      <b className="fire-fprow-title">{recordTitle(r)}</b>
                      <span
                        className={`fire-fp-area${r.areaHa.kind === 'upper-bound' ? ' is-upper' : ''}`}
                        title={missingReason(r, 'area') ?? (r.areaHa.kind === 'mapped'
                          ? 'von EFFIS kartierte Fläche'
                          : `vom Satelliten abgedeckte Fläche — Obergrenze, keine Brandfläche${
                            provisionalArea(r) ? `. Vorläufige Brandfläche (geschätzt): ${provisionalArea(r)?.value}` : ''}`)}
                      >
                        {areaLabel(r)}
                      </span>
                    </span>
                    {/* BP5 — die Leistungszeile: Stärke (ΣFRP) mit ihrem
                        Skalenpunkt und die Ausdehnung der Hülle. Ohne Detektion
                        gibt es beides nicht; dann steht „—" MIT Grund, nie 0. */}
                    <span className="fire-fprow-power">
                      {r.sources.cluster ? (
                        <>
                          <span
                            className="fire-crow-dot"
                            style={{ background: r.suspectedStatic ? STATIC_GREY : clusterColorOf(r.sources.cluster) }}
                            aria-hidden="true"
                          />
                          <b title="Summe der Feuerstrahlungsleistung über Pixel UND Überflüge — eine Leistung, keine Fläche und keine Energie.">
                            {strengthLabel(r.sources.cluster)}
                          </b>
                          <span
                            className="fire-crow-count"
                            title="Ausdehnung der konvexen Hülle über die Detektionsorte — nicht die verbrannte Fläche."
                          >
                            {extentLabel(r.sources.cluster)} Ausdehnung
                          </span>
                        </>
                      ) : (
                        <span className="fire-crow-count" title={missingReason(r, 'hotspots') ?? ''}>
                          — keine Leistung (keine Detektion im Fenster)
                        </span>
                      )}
                    </span>
                    <span className="fire-fprow-meta">
                      {statusLabel(r, nowMs)}
                      {r.activity?.state && r.activity.state !== 'no-signal' && (
                        <> · <span className={`fire-fp-trend is-${r.activity.state}`} title={r.activity.stateNote ?? ''}>{STATE_LABEL[r.activity.state]}</span></>
                      )}
                      {r.activity?.state === 'no-signal' && r.activity.observation && (
                        <> · <span className={`fire-fp-obs is-${r.activity.observation}`} title={r.activity.observationNote ?? ''}>{r.activity.observation === 'confirmed' ? 'Sicht gegeben' : 'nicht beobachtbar'}</span></>
                      )}
                      {' · '}
                      {r.hotspots != null
                        ? `${r.hotspots} Hotspot${r.hotspots === 1 ? '' : 's'}`
                        : <span title={missingReason(r, 'hotspots') ?? ''}>— Hotspots</span>}
                      {' · '}
                      <span title={missingReason(r, 'country') ?? ''}>{countryLabel(r.country)}</span>
                      {/* SF1: nur die Richtung, und nur wenn es eine gibt — eine
                          Platzhalterrichtung wäre schlimmer als keine Angabe. */}
                      {(() => {
                        const sp = p.spread?.byId.get(r.id) ?? null;
                        const chip = sp ? spreadChip(sp) : null;
                        return chip ? <> · <span className="fire-fp-spread-chip">{chip}</span></> : null;
                      })()}
                    </span>
                    <span className="fire-fprow-chips">
                      {r.method.map((m) => (
                        <span key={m} className={`fire-fp-src is-${m}`}>{METHOD_LABEL[m]}</span>
                      ))}
                      {r.confidence.assessment && (
                        <span className={`fire-fp-assess is-${r.confidence.assessment}`} title={r.confidence.reasons.join(' · ')}>
                          {LEVEL_LABEL[r.confidence.assessment]}
                        </span>
                      )}
                      {r.suspectedStatic && (
                        <span className="fire-crow-chip" title="Seit mindestens fünf Tagen ortsfest und ohne Ausdehnung — häufig eine dauerhafte Wärmequelle. Eigene Einordnung aus dem Detektionsmuster, kein Nachweis.">ortsfest</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {anySource && records.length > p.shown && (
        <div className="fire-clist-more">
          <span>gezeigt: {p.shown} von {records.length} Einträgen</span>
          <button type="button" onClick={p.onShowMore}>
            {Math.min(CLUSTER_PAGE, records.length - p.shown)} weitere anzeigen
          </button>
        </div>
      )}

      {anySource && p.detail && (
        <FootprintDetail
          r={p.detail} nowMs={nowMs} onClose={p.onClearSelect}
          spreadRun={p.spread ?? null}
        />
      )}

      <p className="fire-clist-note">{registryNote(p.windowH, HISTORY_DAYS)}</p>
      {p.placesLoaded && (
        <p className="fire-clist-note">
          Ortsnamen und Kreise: nächster Ort aus einem statischen Verzeichnis (bewohnte Orte ab 1 500 Einwohnern) —{' '}
          <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> (CC BY 4.0). Der Kreis ist der
          des Ortes, nicht der Brandstelle; deshalb steht die Entfernung dabei. Bei kartierten Flächen kommt der Ort von EFFIS.
        </p>
      )}
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
          <button type="button" className="fire-fp-inline-btn" onClick={copy} aria-live="polite">{copied ? 'kopiert ✓' : 'JSON kopieren'}</button>
          <span className="fire-fp-muted">Merkmalsatz v{FEATURE_VERSION} für die spätere Kalibrierung: Prädiktoren aus Detektionen und Strahlungsleistung — die Zielgröße kommt erst mit der Kartierung (BA-Linie); heute ohne Speicher, gilt nur innerhalb des Fensters</span>
        </div>
      </dd>
    </>
  );
}

/** Die Detailkarte eines Eintrags — im Panel, kein Popup. Jede Zahl mit Art und Quelle. */
export function FootprintDetail(
  { r, nowMs, onClose, spreadRun = null }:
  { r: FireRecord; nowMs: number; onClose: () => void; spreadRun?: SpreadRun | null },
) {
  // Der GANZE Lauf, nicht nur der Eintrag: nur so lässt sich „der Lauf kennt
  // diesen Brand nicht" von „der Lauf hat für ihn keine Aussage" unterscheiden.
  // Beides muss dastehen — ein stilles Fehlen der Zeile wäre die eine Variante,
  // die der Nutzer nicht deuten kann (gemessen am 2026-08-19).
  const spread = spreadRun?.byId.get(r.id) ?? null;
  const eff = r.sources.effis;
  const conf = r.confidence;
  // VB3: die vorläufige Brandfläche — `null`, sobald eine Kartierung vorliegt.
  const prov = provisionalArea(r);
  return (
    <section className="fire-fp-detail" aria-label={`Details ${recordTitle(r)}`}>
      <div className="fire-fp-detail-head">
        <StatusDot status={r.status.kind} isStatic={r.suspectedStatic} />
        <b>{recordTitle(r)}</b>
        <button type="button" className="fire-fp-close" aria-label="Details schließen" onClick={onClose}>×</button>
      </div>
      <dl className="fire-fp-dl">
        <dt>Kennung</dt><dd><code>{r.id}</code>{r.previousIds.length > 0 && <span className="fire-fp-muted"> · zuvor {r.previousIds.length}×</span>}</dd>
        {r.mergedFrom.length > 0 && <><dt>Merge</dt><dd>zusammengewachsen aus {r.mergedFrom.length + 1} Detektionsgruppen dieser Sitzung</dd></>}
        {r.splitFrom && <><dt>Split</dt><dd>aus <code>{r.splitFrom}</code> hervorgegangen (Verbindung aus dem Fenster gefallen)</dd></>}
        <dt>Status</dt><dd>{statusLabel(r, nowMs)}</dd>
        <dt>Fläche</dt>
        <dd>
          {/* VB3: Ohne Kartierung steht hier die vorläufige Brandfläche — EINE
              Aussage statt zweier Zeilen („bis 59 ha" oben, „≈ 8,9 ha" unten),
              und exakt derselbe Text wie im Karten-Steckbrief. Mit Kartierung
              bleibt alles wie bisher: dann misst EFFIS. */}
          {prov ? (
            <>
              {prov.head}: <b>{prov.value}</b>
              <span className="fire-fp-muted"> — {prov.note} {prov.source}</span>
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
                : <span className="fire-fp-muted">— {r.activity.areaEstReason}</span>}
              {r.activity.areaEst && r.areaHa.kind === 'mapped' && r.areaHa.value != null && (
                <span className="fire-fp-muted"> · zum Vergleich kartiert: {r.areaHa.value.toLocaleString('de-DE')} ha (die Kartierung gilt)</span>
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
                  : <span className="fire-fp-muted">— {r.activity.stateNote ?? 'nicht bestimmbar'}</span>}
              <span className="fire-fp-muted"> · FRP-Verlauf der letzten Überflüge derselben Tageshälfte; nicht die Tendenz der Ereignis-Einordnung</span>
            </dd>
            {r.activity.state === 'no-signal' && (
              <>
                <dt>Beobachtung</dt>
                <dd>
                  {r.activity.observation
                    ? <><b>{OBSERVATION_LABEL[r.activity.observation]}</b>{r.activity.observationNote ? ` — ${r.activity.observationNote}` : ''}</>
                    : <span className="fire-fp-muted">— nicht bestimmt (keine Zeilen für den Umkreis)</span>}
                </dd>
              </>
            )}
            {r.activity.spreadBearingDeg != null && (
              <>
                {/* SF1: umbenannt, damit BEOBACHTUNG und RECHNUNG nicht
                    verwechselt werden — die gerechnete Richtung steht direkt
                    darunter in einer eigenen Zeile. */}
                <dt>Ausbreitung bisher (beobachtet)</dt>
                <dd>
                  Schwerpunkt wandert nach <b>{compassLabel(r.activity.spreadBearingDeg)}</b> ({r.activity.spreadBearingDeg}°, {r.activity.spreadDistanceM} m zwischen den Überflügen)
                  {r.activity.windAgreement === 'agree' && <> · <span className="fire-fp-wind is-agree">mit dem ICON-D2-Wind ({r.activity.windFromDeg}° aus)</span></>}
                  {r.activity.windAgreement === 'disagree' && <> · <span className="fire-fp-wind is-disagree">gegen den ICON-D2-Wind ({r.activity.windFromDeg}° aus) — Schwerpunkt verzerrt oder zwei Feuer?</span></>}
                  {r.activity.windAgreement === null && r.activity.windFromDeg != null && <> · <span className="fire-fp-muted">Wind ({r.activity.windFromDeg}° aus) weder klar dafür noch dagegen</span></>}
                  {r.activity.windFromDeg == null && <> · <span className="fire-fp-muted">kein Windabgleich (Windlayer aus oder kein Frame nahe genug)</span></>}
                  <span className="fire-fp-muted"> · Verschiebung des FRP-Schwerpunkts, kein Frontverlauf</span>
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
        {/* SF1 — die GERECHNETE Richtung. Steht bewusst außerhalb des
            Aktivitätsblocks: sie braucht keine drei Überflüge, sondern Wind,
            Feuerwetter und Gelände. Sie ist nie leer — entweder ein Satz oder
            ein benannter Grund. */}
        {spreadRun && (
          <>
            <dt>Ausbreitungsrichtung (gerechnet, nächste Stunden)</dt>
            <dd className="fire-fp-pred">
              {spread
                ? (
                  <>
                    {spreadHint(spread) ?? (
                      <span className="fire-fp-muted">— {spread.reason ? gapText(spread.reason) : 'nicht bestimmbar'}</span>
                    )}
                    {observedCompareText(spread) && (
                      <span className="fire-fp-muted"> · {observedCompareText(spread)}</span>
                    )}
                  </>
                )
                : (
                  <span className="fire-fp-muted">
                    — dieser Brand war beim letzten Lauf nicht dabei: gerechnet wird nur für Brände
                    mit aktuellem Satellitensignal, und der Bestand kann sich seither geändert haben.
                  </span>
                )}
              <span className="fire-fp-muted"> · {SPREAD_CAVEAT}</span>
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
                <span className="fire-fp-muted"> (EFFIS/CORINE)</span>
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
              <span className="fire-fp-muted">je Überflug ({clockLabel(r.passes[0].atMs)} … {clockLabel(r.passes[r.passes.length - 1].atMs)}) — je Satellit, 10-min-Regel; ☀ Tag, ☾ Nacht; nur innerhalb des Fensters, kein Speicher über Sitzungen</span>
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}
