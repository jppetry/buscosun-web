/**
 * Reiter-Inhalt „Brände" im Historie-Modus (BH3) — die Ereignisse eines Monats oder einer Saison
 * aus den statischen Artefakten (`public/fire/bh/`, Batch BH1/BH2), kein FIRMS-Call.
 *
 * Dieselben Klassen wie `FireFootprintPanel`/`FireAnomalyPanel` (`.br-firelist`, `.br-fire`,
 * `.br-chip`, `.br-more`) — keine Änderung dort. Deckel wie V-246 (`CLUSTER_PAGE`), ausgesprochen.
 * Jede Liste trägt ihren **Stand** (Auswertezeitpunkt des Batch) und die Grenzen der Datei —
 * ein leerer Monat heißt „keine Ereignisse im Stand vom …", nie „keine Brände".
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CLUSTER_PAGE, clusterColor, STATIC_GREY } from './fireClusters';
import { groupPasses, sortPasses } from './activity/overpasses';
import type { FirmsRow } from './sources/firmsHotspots';
import { FirePassChart } from './FirePassChart';
import { SatImageryBlock } from './FireSatImagery';
import { satEnabled } from './detail/fireSatImagery';
import type { HistoryIndexEntry, HistoryIndexFile, HistoryWindowKind } from './history/historyArtifacts';
import { historyStandLabel, loadSeasonSeries, type HistoryLoad, type SeriesLoad } from './history/historyLoad';
import { FireHistoryChart } from './FireHistoryChart';
import { loadHistoryShard, eventFromShard, fireDayWeather, rainLabel, type ShardLoad, type FireDayWeather } from './history/historyDetail';
import type { HistoryEvent } from './history/historyEvents';
import { featuresSummary, featuresJson } from './activity/features';
import { LANDCOVER_LABEL, LANDCOVER_KEYS } from './fireCorroboration';

export type HistorySort = 'strength' | 'recency' | 'area';
export type HistoryClass = 'fires' | 'sites' | 'all';

export interface HistoryPanelProps {
  inSheet: boolean;
  compact?: boolean;
  kind: HistoryWindowKind;
  load: HistoryLoad;
  selectedId: string | null;
  onSelect: (entry: HistoryIndexEntry) => void;
  onClearSelect: () => void;
  onClose?: () => void;
  /** Zurück zum Live-Fenster (24 h / 7 d). */
  onLeave: () => void;
}

const COUNTRY_LABEL: Record<string, string> = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz' };
const de = (n: number, frac = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: frac });
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

function spanLabel(e: HistoryIndexEntry): string {
  const a = fmtDay(e.firstMs); const b = fmtDay(e.lastMs);
  return a === b ? a : `${a} – ${b}`;
}

/** Flächenzeile — Kartierung geht vor, Schätzung nie ohne Intervall, Standort ohne Fläche. */
function areaLabel(e: HistoryIndexEntry): string {
  if (e.areaHa != null && e.areaKind === 'mapped') return `${de(e.areaHa, 1)} ha kartiert (EFFIS)`;
  if (e.anomalyKind === 'site') return 'Anlagen-Signatur, keine Brandfläche';
  if (e.estHa != null && e.estLowHa != null && e.estHighHa != null) return `≈ ${de(e.estHa, 1)} ha geschätzt (${de(e.estLowHa, 1)}–${de(e.estHighHa, 1)})`;
  if (e.areaHa != null) return `≤ ${de(e.areaHa, 1)} ha Detektionsraster`;
  return 'keine Flächenangabe';
}

export function historyEntryName(e: HistoryIndexEntry): string {
  if (e.placeName) return e.placeDistrict && e.placeDistrict !== e.placeName ? `${e.placeName} (${e.placeDistrict})` : e.placeName;
  return `${e.lat.toFixed(2)}° N, ${e.lon.toFixed(2)}° O`;
}

export function FireHistoryPanel(p: HistoryPanelProps) {
  const [sort, setSort] = useState<HistorySort>('strength');
  const [cls, setCls] = useState<HistoryClass>('fires');
  const [shown, setShown] = useState(CLUSTER_PAGE);

  const file: HistoryIndexFile | null = p.load.kind === 'ok' ? p.load.file : null;
  const rows = useMemo(() => {
    if (p.load.kind !== 'ok') return [];
    let list = p.load.entries;
    if (cls === 'fires') list = list.filter((e) => e.anomalyKind !== 'site');
    else if (cls === 'sites') list = list.filter((e) => e.anomalyKind === 'site');
    const sorted = [...list];
    if (sort === 'recency') sorted.sort((a, b) => b.lastMs - a.lastMs);
    else if (sort === 'area') sorted.sort((a, b) => (b.areaHa ?? b.estHa ?? 0) - (a.areaHa ?? a.estHa ?? 0));
    // 'strength' = Reihenfolge der Datei (Summe FRP absteigend)
    return sorted;
  }, [p.load, cls, sort]);

  const label = file?.window.label ?? (p.kind === 'month' ? 'Monat' : 'Saison');
  const selected = p.selectedId && p.load.kind === 'ok' ? p.load.entries.find((e) => e.id === p.selectedId) ?? null : null;

  return (
    <div className={`br-fires br-history${p.inSheet ? ' in-sheet' : ''}${p.compact ? ' is-compact' : ''}`}>
      {!p.inSheet && (
        <div className="br-fires-head">
          <span className="br-eyebrow">Historie · {label}{file ? ` · Stand ${historyStandLabel(file.evaluatedAt)}` : ''}</span>
          <span className="br-fires-count">{file ? `${de(file.counts.total)} Ereignisse` : ''}</span>
          {p.onClose && <button type="button" className="br-close" aria-label="Zu den Layern" onClick={p.onClose}>×</button>}
        </div>
      )}
      {p.load.kind === 'loading' && <p className="br-empty">Historie wird geladen … (statische Datei, einmal je Sitzung)</p>}
      {p.load.kind === 'error' && (
        <p className="br-empty">Kein Stand verfügbar — die Historie-Datei ist nicht erreichbar ({p.load.message}). Das ist ein Ausfall, kein leerer Monat.
          {' '}<button type="button" className="br-link" onClick={p.onLeave}>Zurück zu 24 h / 7 Tagen</button>
        </p>
      )}
      {file && (
        <>
          <p className="br-note">
            {COUNTRY_LABEL.DE} {de(file.counts.byCountry.DE)} · {COUNTRY_LABEL.AT} {de(file.counts.byCountry.AT)} · {COUNTRY_LABEL.CH} {de(file.counts.byCountry.CH)}
            {' '}— davon {de(file.counts.sites)} auf bekannten Anlagenstandorten, {de(file.counts.effisOnly)} nur von EFFIS kartiert
            {file.counts.withNrt > 0 && <>, {de(file.counts.withNrt)} mit vorläufigen (NRT-)Detektionen</>}.
            {file.counts.outsideDropped > 0 && <> {de(file.counts.outsideDropped)} Ereignisse jenseits der Grenzen sind gezählt, nicht gezeigt.</>}
          </p>
          {p.kind === 'season' && <SeasonChartBlock compact={p.compact} />}
          <div className="br-chiprow" role="group" aria-label="Sortierung">
            {!p.inSheet && <span className="br-chiprow-lbl">Sortieren:</span>}
            {([['strength', 'Stärke'], ['recency', 'Zuletzt'], ['area', 'Fläche']] as const).map(([id, l]) => (
              <button key={id} type="button" className={`br-chip is-ink${sort === id ? ' is-active' : ''}`} aria-pressed={sort === id} onClick={() => { setSort(id); setShown(CLUSTER_PAGE); }}>{l}</button>
            ))}
          </div>
          <div className="br-chiprow" role="group" aria-label="Art">
            {!p.inSheet && <span className="br-chiprow-lbl">Zeigen:</span>}
            {([['fires', 'Brände'], ['sites', 'Anlagen'], ['all', 'Alle']] as const).map(([id, l]) => (
              <button key={id} type="button" className={`br-chip is-red${cls === id ? ' is-active' : ''}`} aria-pressed={cls === id} onClick={() => { setCls(id); setShown(CLUSTER_PAGE); }}>{l}</button>
            ))}
          </div>
          {selected && (
            <section className="br-detail" aria-label={`Ereignis ${historyEntryName(selected)}`}>
              <div className="br-detail-head">
                <span className="br-eyebrow">Ereignis</span>
                <button type="button" className="br-close" aria-label="Details schließen" onClick={p.onClearSelect}>×</button>
              </div>
              <h3 className="br-detail-title">{historyEntryName(selected)}</h3>
              <HistoryDetailBody entry={selected} />
            </section>
          )}
          {rows.length === 0 && <p className="br-empty">Keine Ereignisse dieser Art im Stand vom {historyStandLabel(file.evaluatedAt)} — kleine Brände fehlen dem Satelliten systematisch.</p>}
          <ol className="br-firelist">
            {rows.slice(0, shown).map((e) => {
              const color = e.anomalyKind === 'site' ? STATIC_GREY : clusterColor(e.frpSumMw ?? 0);
              return (
                <li key={e.id} className={`br-fire${p.selectedId === e.id ? ' is-selected' : ''}${e.anomalyKind === 'site' ? ' is-static' : ''}`}>
                  <button type="button" className="br-fire-btn" onClick={() => p.onSelect(e)} aria-pressed={p.selectedId === e.id}>
                    <span className="br-fire-top">
                      <span className="fire-fp-dot" style={{ background: color }} aria-hidden="true" />
                      <span className="br-fire-name">{historyEntryName(e)}</span>
                      <span className="br-fire-region">{COUNTRY_LABEL[e.country] ?? e.country}</span>
                    </span>
                    <span className="br-fire-line">{spanLabel(e)} · {de(e.hotspots)} Det. · {de(e.overpasses)} Überfl. · {e.frpSumMw != null ? `${de(e.frpSumMw)} MW` : '—'}</span>
                    <span className="br-fire-meta">
                      {areaLabel(e)}
                      {e.effisId && <span className="br-chip is-ghost is-active">EFFIS</span>}
                      {e.anomalyKind === 'site-deviating' && <span className="br-chip is-ghost is-active">ABWEICHUNG</span>}
                      {e.anomalyKind === 'site' && <span className="br-chip is-ghost">ANLAGE</span>}
                      {e.nrt > 0 && <span className="br-chip is-ghost">vorläufig</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {rows.length > shown && (
            <button type="button" className="br-more" onClick={() => setShown((n) => n + CLUSTER_PAGE)}>
              Weitere {Math.min(CLUSTER_PAGE, rows.length - shown)} zeigen
              <span className="br-more-sub"> · gezeigt {Math.min(shown, rows.length)} von {de(rows.length)}</span>
            </button>
          )}
          <p className="br-note br-history-foot">
            {file.limits.map((l, i) => <span key={i}>{l} </span>)}
            <button type="button" className="br-link" onClick={p.onLeave}>Zurück zu 24 h / 7 Tagen</button>
            {p.onClose && <> · <button type="button" className="br-link" onClick={p.onClose}>Zu den Layern</button></>}
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BH4 — Detail aus dem Shard: Wetterlage am Brandtag, Landbedeckung, Evidenz
// ---------------------------------------------------------------------------

const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const num = (n: number | null | undefined, unit = '', frac = 0) => (n == null ? '—' : `${n.toLocaleString('de-DE', { maximumFractionDigits: frac })}${unit}`);

/**
 * BD2f — der Detailkörper eines Historie-Ereignisses: Index-Zeilen + Shard-Detail (BH4).
 * EINE Quelle für die Inline-Detailkarte im Readout UND das Dossier in der Mitte —
 * dasselbe Muster wie die BD2-Bausteine der Live-Detailkarte.
 */
export function HistoryDetailBody({ entry }: { entry: HistoryIndexEntry }) {
  return (
    <>
      <dl className="br-detail-dl">
        <dt>Zeitraum</dt><dd>{spanLabel(entry)} · {entry.distinctDays} {entry.distinctDays === 1 ? 'Tag' : 'Tage'}</dd>
        <dt>Detektionen</dt><dd>{de(entry.hotspots)} in {de(entry.overpasses)} {entry.overpasses === 1 ? 'Überflug' : 'Überflügen'}{entry.hotspots === 1 && <> — Einzeldetektion, keine Bestätigung durch einen weiteren Überflug</>}</dd>
        <dt>Stärke</dt><dd>{entry.frpSumMw != null ? `${de(entry.frpSumMw)} MW Summe · max ${de(entry.frpMaxMw ?? 0)} MW` : '—'}</dd>
        <dt>Fläche</dt><dd>{areaLabel(entry)}</dd>
        <dt>Herkunft</dt><dd>{entry.nrt > 0 ? `${de(entry.nrt)} von ${de(entry.hotspots)} Detektionen vorläufig (NRT) — kann durch die Standard-Verarbeitung noch wandern` : 'Standard-Verarbeitung (SP), abgeschlossen'}</dd>
        {entry.anomalyKind && <><dt>Einordnung</dt><dd>{entry.anomalyKind === 'site' ? 'Passt zum Muster eines bekannten Anlagenstandorts (Thermalanomalie)' : 'Bekannter Anlagenstandort, aber das Signal weicht ab — als Brand geführt'}</dd></>}
      </dl>
      <HistoryEventDetail entry={entry} />
    </>
  );
}

function HistoryEventDetail({ entry }: { entry: HistoryIndexEntry }) {
  // BD2g: Shard + Wetterlage kommen aus dem geteilten Hook (auch das Dossier nutzt ihn).
  const { shard, weather, ev } = useHistoryEventData(entry);
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [entry]);
  const lc = ev?.effis?.landcover ?? null;
  const lcRows = lc ? LANDCOVER_KEYS.map((k) => [LANDCOVER_LABEL[k], lc[k] ?? 0] as const).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]) : [];
  const w = weather !== 'loading' ? weather : null;
  return (
    <div className="br-history-detail">
      <h4 className="br-eyebrow">Wetterlage am Brandtag</h4>
      {weather === 'loading' && <p className="br-note">Tages- und Stundenwerte werden geholt …</p>}
      {w && (
        <dl className="br-detail-dl">
          {w.day && (
            <>
              <dt>Tag ({w.dateISO.split('-').reverse().join('.')})</dt>
              <dd>max {num(w.day.tMaxC, ' °C', 1)}{w.day.modelFilled.includes('tMaxC') && '*'} · Feuchte {num(w.day.humidityPct, ' %')}{w.day.modelFilled.includes('humidityPct') && '*'} · Wind max {num(w.day.windMaxKmh, ' km/h')}{w.day.modelFilled.includes('windMaxKmh') && '*'} · Regen {num(w.day.precipMm, ' mm', 1)}{w.day.modelFilled.includes('precipMm') && '*'}
                <span className="br-muted"> — {w.day.kind === 'measured' ? 'gemessen' : 'Reanalyse'}{w.day.station ? `, Station ${w.day.station.name} (${w.day.station.distanceKm.toFixed(0)} km)` : ''} · {w.day.source}{w.day.modelFilled.length > 0 && ' · * vom Anbieter mit Modellwert gefüllt, nicht gemessen'}</span></dd>
            </>
          )}
          {w.hour && (
            <>
              <dt>Stunde {fmtClock(w.hour.atMs)}</dt>
              <dd>{num(w.hour.tempC, ' °C', 1)} · Wind {num(w.hour.windKmh, ' km/h')} · Regen {num(w.hour.precipMm, ' mm', 1)}
                <span className="br-muted"> — Reanalyse, {w.hour.source}</span></dd>
            </>
          )}
          <dt>Trockenphase</dt><dd>{rainLabel(w)}{w.day ? '' : ' (Tagesreihe fehlt)'}</dd>
          {w.notes.map((n, i) => <dd key={i} className="br-muted" style={{ gridColumn: '1 / -1' }}>{n}</dd>)}
        </dl>
      )}
      {weather === null && <p className="br-note">Wetterlage nicht verfügbar — Ausfall der Historie-Quellen, kein Wert erfunden.</p>}
      <p className="br-note">Kein ICON-/Fusionswert: die Vorhersagemodelle haben kein Archiv. Tag = nächste Station (Meteostat/DWD), Stunde = ERA5-Reanalyse ~25 km — beide nicht der Brandort selbst.</p>

      {ev?.effis && (
        <>
          <h4 className="br-eyebrow">Landbedeckung (EFFIS-Kartierung {num(ev.effis.areaHa, ' ha')})</h4>
          <dl className="br-detail-dl">
            {lcRows.map(([label, pct]) => <span key={label} style={{ display: 'contents' }}><dt>{label}</dt><dd>{num(pct, ' %')}</dd></span>)}
            {ev.effis.percNa2k != null && <><dt>Natura 2000</dt><dd>{num(ev.effis.percNa2k, ' %')} der Fläche</dd></>}
            {(ev.effis.province || ev.effis.commune) && <><dt>EFFIS-Ort</dt><dd>{[ev.effis.commune, ev.effis.province].filter(Boolean).join(', ')}</dd></>}
          </dl>
        </>
      )}

      <h4 className="br-eyebrow">Datengrundlage und Evidenz</h4>
      {shard.kind === 'loading' && <p className="br-note">Detail wird geladen … (eine Zelle, eine Datei)</p>}
      {shard.kind === 'error' && <p className="br-note">Detail nicht erreichbar ({shard.message}) — die Zeile oben stammt aus dem Index, mehr ist gerade nicht abrufbar.</p>}
      {shard.kind === 'ok' && !ev && <p className="br-note">Ereignis nicht im Shard — Index und Detail stammen aus verschiedenen Ständen.</p>}
      {ev && (
        <>
          <dl className="br-detail-dl">
            <dt>Sensoren</dt><dd>{ev.satellites.length ? ev.satellites.join(', ') : '—'} · {ev.provenance.sp} SP / {ev.provenance.nrt} NRT{ev.nasaType2Share != null && ev.nasaType2Share > 0 ? ` · NASA type 2 bei ${num(ev.nasaType2Share * 100, ' %')} der SP-Zeilen` : ''}</dd>
            <dt>Konfidenz</dt><dd>{ev.confidence ? `hoch ${ev.confidence.high} · nominal ${ev.confidence.nominal} · gering ${ev.confidence.low}` : '—'}</dd>
            <dt>Status</dt><dd>{ev.status.kind === 'out' ? 'beendet' : ev.status.kind === 'active' ? 'aktiv zum Stand' : `kein Signal seit ${ev.status.sinceMs != null ? fmtDay(ev.status.sinceMs) : '—'}`}{ev.status.source ? ` (${ev.status.source})` : ''}{ev.status.kind === 'no-signal' && ' — ein Ende bestätigt nur eine EFFIS-Kartierung mit Enddatum'}</dd>
            {ev.previousIds.length > 0 && <><dt>Frühere Kennung</dt><dd>{ev.previousIds.join(', ')} — nach SP-Nachlieferung neu verknüpft</dd></>}
            <dt>Ausgewertet</dt><dd>{new Date(ev.evaluatedAt - 1).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })} · Merkmalsatz v{ev.features?.featureVersion ?? '—'}</dd>
          </dl>
          {ev.anomaly && (
            <ul className="br-reasons">
              {ev.anomaly.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
          {ev.features && (
            <details className="br-history-features">
              <summary>Merkmale (AF3, {featuresSummary(ev.features).length} Werte)</summary>
              <dl className="br-detail-dl">
                {featuresSummary(ev.features).map((row) => <span key={row.key} style={{ display: 'contents' }}><dt>{row.key}</dt><dd>{row.value}</dd></span>)}
              </dl>
              <button
                type="button" className="br-link"
                onClick={() => { void navigator.clipboard?.writeText(featuresJson(ev.features!)).then(() => setCopied(true)).catch(() => setCopied(false)); }}
              >
                {copied ? 'JSON kopiert' : 'JSON kopieren'}
              </button>
            </details>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BH5 — Saisonverlauf im Saison-Readout (Datei einmal je Sitzung; Ausfall wird gesagt)
// ---------------------------------------------------------------------------

function SeasonChartBlock({ compact }: { compact?: boolean }) {
  const [series, setSeries] = useState<SeriesLoad>({ kind: 'loading' });
  useEffect(() => { let alive = true; void loadSeasonSeries().then((r) => { if (alive) setSeries(r); }); return () => { alive = false; }; }, []);
  if (series.kind === 'loading') return <p className="br-note">Saisonverlauf wird geladen …</p>;
  if (series.kind === 'error') return <p className="br-note">Saisonverlauf nicht verfügbar ({series.message}) — Ausfall der Datei, kein leerer Verlauf.</p>;
  return <FireHistoryChart file={series.file} compact={compact} />;
}

// ---------------------------------------------------------------------------
// BD2g — das Ereignis-Dossier der Mitte (Historie-Modus), in der BD2-Kartenform.
// Dieselben Daten wie die Inline-Detailkarte (ein Hook), aber voll ausgespielt:
// Kennzahl-Kacheln, ECHTER FRP-Verlauf je Überflug aus den Shard-Detektionen
// (dieselbe groupPasses-Regel wie live), Wetterlage als Steel-Karte, Einordnung
// & Evidenz, Merkmale als Tabelle. Kein neuer Abruf, keine erfundene Zahl.
// ---------------------------------------------------------------------------

/** Shard + Wetterlage eines Ereignisses — EIN Ladeweg für Inline-Karte und Dossier. */
function useHistoryEventData(entry: HistoryIndexEntry): { shard: ShardLoad; weather: FireDayWeather | 'loading' | null; ev: HistoryEvent | null } {
  const [shard, setShard] = useState<ShardLoad>({ kind: 'loading' });
  const [weather, setWeather] = useState<FireDayWeather | 'loading' | null>('loading');
  useEffect(() => {
    let alive = true;
    setShard({ kind: 'loading' }); setWeather('loading');
    void loadHistoryShard(entry).then((r) => { if (alive) setShard(r); });
    const ac = new AbortController();
    void fireDayWeather(entry.lat, entry.lon, entry.firstMs, ac.signal).then((w) => { if (alive) setWeather(w); }).catch(() => { if (alive) setWeather(null); });
    return () => { alive = false; ac.abort(); };
  }, [entry]);
  const ev: HistoryEvent | null = shard.kind === 'ok' ? eventFromShard(shard.file, entry.id) : null;
  return { shard, weather, ev };
}

/**
 * Shard-Detektionen → FirmsRow-Form für `groupPasses` (die EINE Überflug-Regel des
 * Projekts, 10 min je Satellit). `source` ist nur die Typform — `groupPasses` liest
 * sie nicht, die echte Herkunft (SP/NRT) steht in `provenance` und wird gesagt.
 */
function shardRows(ev: HistoryEvent): FirmsRow[] {
  return ev.detections.map((d) => ({
    lat: d.lat, lon: d.lon, acqMs: d.acqMs, frp: d.frp, confidence: d.confidence,
    brightTi4: null, brightTi5: null, scanKm: d.scanKm, trackKm: d.trackKm,
    satellite: d.satellite, day: d.day, source: 'VIIRS_SNPP_NRT',
  }));
}

/** Die vier Kennzahl-Kacheln des Ereignis-Dossiers — nur Index-Felder, nichts erfunden. */
export function historyStatTiles(e: HistoryIndexEntry): { lbl: string; val: string; sub: string }[] {
  const area = e.areaHa != null && e.areaKind === 'mapped'
    ? { val: `${de(e.areaHa, 1)} ha`, sub: 'EFFIS kartiert' }
    : e.anomalyKind === 'site'
      ? { val: '—', sub: 'Anlagen-Signatur, keine Brandfläche' }
      : e.estHa != null && e.estLowHa != null && e.estHighHa != null
        ? { val: `≈ ${de(e.estHa, 1)} ha`, sub: `geschätzt · ${de(e.estLowHa, 1)}–${de(e.estHighHa, 1)} ha (Modell v1)` }
        : e.areaHa != null
          ? { val: `≤ ${de(e.areaHa, 1)} ha`, sub: 'Obergrenze (Raster), keine Brandfläche' }
          : { val: '—', sub: 'keine Flächenangabe' };
  return [
    { lbl: 'Fläche', ...area },
    { lbl: 'Detektionen', val: de(e.hotspots), sub: `${de(e.overpasses)} ${e.overpasses === 1 ? 'Überflug' : 'Überflüge'} · ${e.distinctDays} ${e.distinctDays === 1 ? 'Tag' : 'Tage'}` },
    { lbl: 'Stärke', val: e.frpSumMw != null ? `${de(e.frpSumMw)} MW` : '—', sub: e.frpSumMw != null ? `ΣFRP · max ${de(e.frpMaxMw ?? 0)} MW` : 'keine FRP-Angabe' },
    { lbl: 'Zeitraum', val: spanLabel(e), sub: e.statusKind === 'out' ? 'beendet' : e.statusKind === 'active' ? 'aktiv zum Stand' : 'kein Signal zum Stand' },
  ];
}

/** Ein Ereignis-Dossier-Raster: Verlauf · Wetterlage · (aside) · Einordnung & Evidenz · Merkmale. */
export function HistoryDossierBody({ entry, chartWidth = 360, aside }: { entry: HistoryIndexEntry; chartWidth?: number; aside?: ReactNode }) {
  const { shard, weather, ev } = useHistoryEventData(entry);
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [entry]);
  const passes = useMemo(() => (ev ? sortPasses(groupPasses(shardRows(ev))) : []), [ev]);
  const w = weather !== 'loading' ? weather : null;
  const lc = ev?.effis?.landcover ?? null;
  const lcRows = lc ? LANDCOVER_KEYS.map((k) => [LANDCOVER_LABEL[k], lc[k] ?? 0] as const).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]) : [];
  const dayN = passes.filter((p) => p.day === true).length;
  const nightN = passes.filter((p) => p.day === false).length;
  return (
    <div className="br-ds-grid">
      <section className="br-ds-card br-ds-verlauf" aria-label="Verlauf">
        <div className="br-ds-cardhead">
          <span className="br-ds-eyebrow is-red">Verlauf</span>
          <span className="br-ds-cardsub">ΣFRP je Überflug · log-Achse — endet mit der letzten Detektion</span>
        </div>
        {shard.kind === 'loading' && <p className="br-note">Detail wird geladen … (eine Zelle, eine Datei)</p>}
        {shard.kind === 'error' && <p className="br-note">Detail nicht erreichbar ({shard.message}) — die Kennzahlen oben stammen aus dem Index.</p>}
        {passes.length > 0 && <FirePassChart passes={passes} nowMs={entry.lastMs} wide wideWidth={chartWidth} />}
        {passes.length === 1 && <p className="br-note">Ein einziger Überflug — es gibt keinen zeitlichen Verlauf, nur diesen Messpunkt.</p>}
        {shard.kind === 'ok' && ev && passes.length === 0 && <p className="br-note">Keine Detektionen im Shard — dieses Ereignis besteht nur aus der EFFIS-Kartierung.</p>}
        {ev && passes.length > 0 && (
          <dl className="fire-fp-dl br-ds-dl">
            <dt>Überflüge</dt>
            <dd>{passes.length} · {dayN} ☀ Tag / {nightN} ☾ Nacht · Satelliten {ev.satellites.length ? ev.satellites.join(', ') : '—'}</dd>
          </dl>
        )}
      </section>

      <section className="br-ds-card is-steel br-ds-wetter" aria-label="Wetterlage am Brandtag">
        <div className="br-ds-cardhead">
          <span className="br-ds-eyebrow is-steel">Wetterlage am Brandtag</span>
        </div>
        <div className="br-wx">
          {weather === 'loading' && <p className="br-wx-loading br-muted">Tages- und Stundenwerte werden geholt …</p>}
          {w?.day && (
            <div className="br-wx-tile">
              <span className="br-wx-lbl">Tag · {w.dateISO.split('-').reverse().join('.')}</span>
              max {num(w.day.tMaxC, ' °C', 1)}{w.day.modelFilled.includes('tMaxC') && '*'} · Feuchte {num(w.day.humidityPct, ' %')}{w.day.modelFilled.includes('humidityPct') && '*'} · Wind max {num(w.day.windMaxKmh, ' km/h')}{w.day.modelFilled.includes('windMaxKmh') && '*'} · Regen {num(w.day.precipMm, ' mm', 1)}{w.day.modelFilled.includes('precipMm') && '*'}
            </div>
          )}
          {w?.hour && (
            <div className="br-wx-tile">
              <span className="br-wx-lbl">Stunde {fmtClock(w.hour.atMs)}</span>
              {num(w.hour.tempC, ' °C', 1)} · Wind {num(w.hour.windKmh, ' km/h')} · Regen {num(w.hour.precipMm, ' mm', 1)}
            </div>
          )}
          {w && (
            <div className="br-wx-tile">
              <span className="br-wx-lbl">Trockenphase</span>
              {rainLabel(w)}{w.day ? '' : ' (Tagesreihe fehlt)'}
            </div>
          )}
          {weather === null && <p className="br-note">Wetterlage nicht verfügbar — Ausfall der Historie-Quellen, kein Wert erfunden.</p>}
          {w?.notes.map((n, i) => <p key={i} className="br-note">{n}</p>)}
          <p className="br-note">
            {w?.day ? <>Tag: {w.day.kind === 'measured' ? 'gemessen' : 'Reanalyse'}{w.day.station ? `, Station ${w.day.station.name} (${w.day.station.distanceKm.toFixed(0)} km)` : ''} · {w.day.source}{w.day.modelFilled.length > 0 ? ' · * vom Anbieter mit Modellwert gefüllt, nicht gemessen' : ''}. </> : null}
            {w?.hour ? <>Stunde: Reanalyse, {w.hour.source}. </> : null}
            Kein ICON-/Fusionswert: die Vorhersagemodelle haben kein Archiv — beide Quellen beschreiben die Umgebung, nicht den Brandort selbst.
          </p>
        </div>
      </section>

      {/* SAT1: dieselbe Satellitenbild-Karte wie im Live-Dossier — EINE Komponente, zwei Aufrufer. */}
      {satEnabled() && (
        <section className="br-ds-card br-ds-satbild" aria-label="Satellitenbild vorher, während und nachher">
          <div className="br-ds-cardhead">
            <span className="br-ds-eyebrow">Satellitenbild</span>
            <span className="br-ds-cardsub">Vorher · während · nachher — wenn die Wolken es zulassen</span>
          </div>
          <SatImageryBlock t={{ lat: entry.lat, lon: entry.lon, bbox: null, firstMs: entry.firstMs, lastMs: entry.lastMs }} nowMs={Date.now()} />
        </section>
      )}

      {aside}

      <section className="br-ds-card br-ds-einordnung" aria-label="Einordnung und Evidenz">
        <div className="br-ds-cardhead">
          <span className="br-ds-eyebrow">Einordnung &amp; Evidenz</span>
        </div>
        <dl className="fire-fp-dl br-ds-dl">
          <dt>Ort</dt>
          <dd>
            {entry.placeName
              ? `${entry.placeName}${entry.placeDistrict && entry.placeDistrict !== entry.placeName ? ` · ${entry.placeDistrict}` : ''}${entry.placeKm != null ? ` (nächster Ort, ${de(entry.placeKm, 1)} km — GeoNames CC BY 4.0)` : ''}`
              : 'nicht bestimmt'}
            {' '}· {COUNTRY_LABEL[entry.country] ?? entry.country}
          </dd>
          <dt>Herkunft</dt>
          <dd>{entry.nrt > 0 ? `${de(entry.nrt)} von ${de(entry.hotspots)} Detektionen vorläufig (NRT) — kann durch die Standard-Verarbeitung noch wandern` : 'Standard-Verarbeitung (SP), abgeschlossen'}</dd>
          {ev && (
            <>
              <dt>Sensoren</dt>
              <dd>{ev.satellites.length ? ev.satellites.join(', ') : '—'} · {ev.provenance.sp} SP / {ev.provenance.nrt} NRT{ev.nasaType2Share != null && ev.nasaType2Share > 0 ? ` · NASA type 2 bei ${num(ev.nasaType2Share * 100, ' %')} der SP-Zeilen` : ''}</dd>
              <dt>Konfidenz</dt>
              <dd>{ev.confidence ? `hoch ${ev.confidence.high} · nominal ${ev.confidence.nominal} · gering ${ev.confidence.low}` : '—'}</dd>
              <dt>Status</dt>
              <dd>{ev.status.kind === 'out' ? 'beendet' : ev.status.kind === 'active' ? 'aktiv zum Stand' : `kein Signal seit ${ev.status.sinceMs != null ? fmtDay(ev.status.sinceMs) : '—'}`}{ev.status.source ? ` (${ev.status.source})` : ''}{ev.status.kind === 'no-signal' && ' — ein Ende bestätigt nur eine EFFIS-Kartierung mit Enddatum'}</dd>
              {ev.previousIds.length > 0 && <><dt>Frühere Kennung</dt><dd>{ev.previousIds.join(', ')} — nach SP-Nachlieferung neu verknüpft</dd></>}
              <dt>Ausgewertet</dt>
              <dd>{new Date(ev.evaluatedAt - 1).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })} · Merkmalsatz v{ev.features?.featureVersion ?? '—'}</dd>
            </>
          )}
          {entry.anomalyKind && (
            <>
              <dt>Einordnung</dt>
              <dd>{entry.anomalyKind === 'site' ? 'Passt zum Muster eines bekannten Anlagenstandorts (Thermalanomalie)' : 'Bekannter Anlagenstandort, aber das Signal weicht ab — als Brand geführt'}</dd>
            </>
          )}
          {ev?.effis && (
            <>
              <dt>Kartierung</dt>
              <dd>EFFIS {num(ev.effis.areaHa, ' ha')}{ev.effis.percNa2k != null ? ` · Natura 2000 ${num(ev.effis.percNa2k, ' %')}` : ''}{(ev.effis.province || ev.effis.commune) ? ` · ${[ev.effis.commune, ev.effis.province].filter(Boolean).join(', ')}` : ''}</dd>
              {lcRows.length > 0 && (
                <>
                  <dt>Landbedeckung</dt>
                  <dd>{lcRows.map(([label, pct]) => `${num(pct, ' %')} ${label}`).join(' · ')} (EFFIS/CORINE)</dd>
                </>
              )}
            </>
          )}
        </dl>
        {ev?.anomaly && (
          <ul className="fire-fp-reasons">
            {ev.anomaly.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
        {shard.kind === 'ok' && !ev && <p className="br-note">Ereignis nicht im Shard — Index und Detail stammen aus verschiedenen Ständen.</p>}
      </section>

      <section className="br-ds-card br-ds-merkmale" aria-label="Merkmale">
        <div className="br-ds-cardhead">
          <span className="br-ds-eyebrow">Merkmale</span>
        </div>
        {ev?.features ? (
          <dl className="fire-fp-dl br-ds-dl is-features">
            <dd className="fire-fp-dd-wide">
              <ul className="fire-fp-features" aria-label={`Merkmalsatz v${ev.features.featureVersion}`}>
                {featuresSummary(ev.features).map((row) => <li key={row.key}><span>{row.key}</span><span>{row.value}</span></li>)}
              </ul>
              <div className="fire-fp-features-foot">
                <button
                  type="button" className="br-inline-btn" aria-live="polite"
                  onClick={() => { void navigator.clipboard?.writeText(featuresJson(ev.features!)).then(() => setCopied(true)).catch(() => setCopied(false)); }}
                >
                  {copied ? 'kopiert ✓' : 'JSON kopieren'}
                </button>
                <span className="br-muted">Merkmalsatz v{ev.features.featureVersion} (AF3) aus der Batch-Auswertung — dieselben Prädiktoren wie im Live-Fenster, hier zum Stand der Datei</span>
              </div>
            </dd>
          </dl>
        ) : (
          <p className="br-note">{shard.kind === 'loading' ? 'Detail wird geladen …' : 'Kein Merkmalsatz im Shard-Detail für dieses Ereignis.'}</p>
        )}
      </section>
    </div>
  );
}
