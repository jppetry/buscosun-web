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
import { CLUSTER_PAGE, clusterColor, STATIC_GREY, mwText } from './fireClusters';
import { groupPasses, sortPasses } from './activity/overpasses';
import { footprintRing, VIIRS_NOMINAL_KM, type FirmsRow } from './sources/firmsHotspots';
import { FirePassChart } from './FirePassChart';
import { outerOutline, type LonLatRect } from './pixelOutline';
import { SatImageryBlock } from './FireSatImagery';
import { bboxPolygon, historyAreaBbox } from './FireMiniMap';
import { satEnabled } from './detail/fireSatImagery';
import type { HistoryIndexEntry, HistoryIndexFile, HistoryWindowKind } from './history/historyArtifacts';
import { historyStandLabel, type HistoryLoad } from './history/historyLoad';
import { loadHistoryShard, eventFromShard, fireDayWeather, rainLabel, type ShardLoad, type FireDayWeather } from './history/historyDetail';
import type { HistoryEvent } from './history/historyEvents';
import { featuresSummary, featuresJson } from './activity/features';
import { dynamicsOf } from './activity/dynamics';
import { DriversView } from './FireFootprintPanel';
import { DossierChapterTabs, NoteFold, type DossierChapter } from './dossier/DossierPrimitives';
import { Stat } from './FireFootprintPanel';
import { FlameIcon, IndustryIcon } from './fireIcons';
import { FireProfileBlock } from './dossier/FireProfileBlock';
import { fetchFireWeatherArchive, type FireWeatherAtPoint } from './detail/fireWeatherAtPoint';
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
  /** Europa-Ansicht: die Historie gibt es nur für DE/AT/CH — der Satz steht über der Liste. */
  regionNote?: string;
}

const COUNTRY_LABEL: Record<string, string> = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', XK: 'Kosovo' };
let _regionNames: Intl.DisplayNames | null | undefined;
/** Landesname zum ISO-Code (Europa-Box); `null` = kein Land bestimmt — das wird gesagt, nicht geraten. */
export function historyCountryLabel(code: string | null): string {
  if (code == null) return 'ohne Landangabe';
  const fixed = COUNTRY_LABEL[code];
  if (fixed) return fixed;
  if (_regionNames === undefined) { try { _regionNames = new Intl.DisplayNames(['de'], { type: 'region' }); } catch { _regionNames = null; } }
  try { return _regionNames?.of(code) ?? code; } catch { return code; }
}
const de = (n: number, frac = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: frac });
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

function spanLabel(e: HistoryIndexEntry): string {
  const a = fmtDay(e.firstMs); const b = fmtDay(e.lastMs);
  return a === b ? a : `${a} – ${b}`;
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

  return (
    <div className={`br-fires br-history${p.inSheet ? ' in-sheet' : ''}${p.compact ? ' is-compact' : ''}`}>
      {p.regionNote && <p className="br-note">{p.regionNote}</p>}
      {p.load.kind === 'loading' && <p className="br-empty">Historie wird geladen … (statische Datei, einmal je Sitzung)</p>}
      {p.load.kind === 'error' && (
        <p className="br-empty">Kein Stand verfügbar — die Historie-Datei ist nicht erreichbar ({p.load.message}). Das ist ein Ausfall, kein leerer Monat.
          {' '}<button type="button" className="br-link" onClick={p.onLeave}>Zurück zu 24 h / 7 Tagen</button>
        </p>
      )}
      {file && (
        <>
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
          {rows.length === 0 && <p className="br-empty">Keine Ereignisse dieser Art im Stand vom {historyStandLabel(file.evaluatedAt)} — kleine Brände fehlen dem Satelliten systematisch.</p>}
          <ol className="br-firelist">
            {rows.slice(0, shown).map((e) => {
              const color = e.anomalyKind === 'site' ? STATIC_GREY : clusterColor(e.frpSumMw ?? 0);
              return (
                <li key={e.id} className={`br-fire${p.selectedId === e.id ? ' is-selected' : ''}${e.anomalyKind === 'site' ? ' is-static' : ''} has-cta`} style={{ ['--br-row-acc' as string]: color }}>
                  <button type="button" className="br-fire-btn" onClick={() => p.onSelect(e)} aria-pressed={p.selectedId === e.id}>
                    <span className="br-fire-top">
                      <span className="br-fire-ic" style={{ color }}>
                        {e.anomalyKind === 'site' ? <IndustryIcon size={20} /> : <FlameIcon size={20} />}
                      </span>
                      <span className="br-fire-name">{historyEntryName(e)}</span>
                      <span className="br-fire-region">{historyCountryLabel(e.country)}</span>
                    </span>
                    <span className="br-fire-stats">
                      {historyStatTiles(e).map((t) => (
                        <Stat key={t.lbl} lbl={t.lbl} val={t.val} sub={t.sub} />
                      ))}
                    </span>
                    <span className="br-fire-meta">
                      {e.effisId && <span className="br-chip is-ghost is-active">EFFIS</span>}
                      {e.anomalyKind === 'site-deviating' && <span className="br-chip is-ghost is-active">ABWEICHUNG</span>}
                      {e.anomalyKind === 'site' && <span className="br-chip is-ghost">ANLAGE</span>}
                      {e.nrt > 0 && <span className="br-chip is-ghost">vorläufig</span>}
                    </span>
                  </button>
                  {/* Sichtbarer Weg ins Dossier, rechts neben den Chips (die Karte selbst öffnet es auch). */}
                  <button type="button" className="br-fire-cta" onClick={() => p.onSelect(e)}>
                    Zur Detailansicht
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
/** Ein Messwert als kleine Kachel: große Zahl, darunter die Größe. */
function WxStat({ lbl, val }: { lbl: string; val: string }) {
  return <span className="br-wx-stat"><b>{val}</b><em>{lbl}</em></span>;
}

/**
 * BD2f — der Detailkörper eines Historie-Ereignisses: Index-Zeilen + Shard-Detail (BH4).
 * EINE Quelle für die Inline-Detailkarte im Readout UND das Dossier in der Mitte —
 * dasselbe Muster wie die BD2-Bausteine der Live-Detailkarte.
 */
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

/**
 * Die mögliche Fläche laut FIRMS: je Detektion die Pixelgrundfläche (scan × track, ohne Angabe
 * das Nennmaß wie im Satellitenbild) — „Karte · markiert" und das Satellitenbild zeichnen sie.
 */
export interface HistoryPixelArea {
  features: GeoJSON.Feature[];
  bbox: [number, number, number, number];
  /** Mindestens ein Rechteck steht im Nennmaß (VIIRS 375 m) — muss gesagt werden. */
  nominal: boolean;
}

function pixelAreaOf(ev: HistoryEvent, id: string): HistoryPixelArea | null {
  const rects: LonLatRect[] = [];
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  let nominal = false;
  for (const r of shardRows(ev)) {
    const ring = footprintRing(r, VIIRS_NOMINAL_KM);
    if (!ring) continue;
    if (r.scanKm == null || r.trackKm == null) nominal = true;
    const rc = { w: Infinity, s: Infinity, e: -Infinity, n: -Infinity };
    for (const [x, y] of ring) {
      rc.w = Math.min(rc.w, x); rc.e = Math.max(rc.e, x); rc.s = Math.min(rc.s, y); rc.n = Math.max(rc.n, y);
    }
    rects.push(rc);
    w = Math.min(w, rc.w); e = Math.max(e, rc.e); s = Math.min(s, rc.s); n = Math.max(n, rc.n);
  }
  // Only the outer edge of the burnt area: the pixel rectangles overlap and sit next to each
  // other with hairline gaps, so they are merged into one outline without inner lines or holes.
  const features: GeoJSON.Feature[] = outerOutline(rects).map((poly) => (
    { type: 'Feature', properties: { id }, geometry: { type: 'Polygon', coordinates: poly } }
  ));
  return features.length > 0 ? { features, bbox: [w, s, e, n], nominal } : null;
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
    { lbl: 'Stärke', val: e.frpSumMw != null ? `${mwText(e.frpSumMw, 0)} MW` : '—', sub: e.frpSumMw != null ? `ΣFRP · max ${mwText(e.frpMaxMw ?? 0, 0)} MW` : 'keine FRP-Angabe' },
    { lbl: 'Zeitraum', val: spanLabel(e), sub: e.statusKind === 'out' ? 'beendet' : e.statusKind === 'active' ? 'aktiv zum Stand' : 'kein Signal zum Stand' },
  ];
}

/**
 * BDE-D — die **Wetterführung** eines zurückliegenden Brands. Dieselbe Karte wie im
 * Live-Dossier (`DriversView`), nur mit ERA5 statt ICON als Stundenquelle: die
 * Vorhersagemodelle haben kein Archiv. Eigener Abruf, weil die Karte oben Tageswerte
 * einer Station braucht und diese hier eine lückenlose Stundenreihe — zwei Fragen,
 * zwei Reihen; zusammengeführt wird trotzdem in DERSELBEN `parseFireWeather`.
 */
function HistoryDriversCard({ entry, spreadBearingDeg, width }: { entry: HistoryIndexEntry; spreadBearingDeg: number | null; width?: number }) {
  const [wx, setWx] = useState<FireWeatherAtPoint | 'loading' | null>('loading');
  useEffect(() => {
    let alive = true;
    setWx('loading');
    // Kein AbortController: der Abruf liegt im Sitzungs-Cache und wird geteilt (s. dort).
    void fetchFireWeatherArchive(entry.lat, entry.lon, entry.firstMs, entry.lastMs)
      .then((w) => { if (alive) setWx(w); })
      .catch(() => { if (alive) setWx(null); });
    return () => { alive = false; };
  }, [entry]);
  return (
    <section className="br-ds-card br-ds-drv" aria-label="Wetterführung im Brandzeitfenster">
      <div className="br-ds-cardhead">
        <span className="br-ds-eyebrow is-terra">Wetterführung</span>
        <span className="br-ds-cardsub">Im Brandzeitfenster · abgeleitet, keine Messung</span>
      </div>
      {wx === 'loading' && <p className="br-muted br-wx-loading">Stundenreihe des Brandzeitfensters wird aus dem Archiv geholt …</p>}
      {wx === null && <p className="br-note">Archivreihe nicht erreichbar — ohne sie gibt es weder Windrose noch Einstufung. Es wird nichts geschätzt.</p>}
      {wx && wx !== 'loading' && <DriversView w={wx} spreadBearingDeg={spreadBearingDeg} width={width} />}
    </section>
  );
}

/** Ein Ereignis-Dossier-Raster: Verlauf · Wetterlage · Wetterführung · (aside) · Einordnung & Evidenz · Merkmale. */
export function HistoryDossierBody({ entry, aside, head }: {
  entry: HistoryIndexEntry; /** Kopfkarte des Ereignisses (Teil von „Brand“). */ head?: ReactNode; /** Ohne Wirkung seit 2026-10-14: die Diagramme füllen die Karte, die Breite misst nivo. */ chartWidth?: number;
  /** Minikarte — bekommt die FIRMS-Pixelfläche (`null`, solange der Shard lädt oder ohne Detektionen). */
  aside?: ReactNode | ((area: HistoryPixelArea | null) => ReactNode);
}) {
  const { shard, weather, ev } = useHistoryEventData(entry);
  const pixelArea = useMemo(() => (ev ? pixelAreaOf(ev, entry.id) : null), [ev, entry.id]);
  // Rahmen im Satellitenbild = dieselbe Fläche wie „Karte · markiert"; ohne Detektionen der Umgebungskasten wie dort.
  const frameShape = useMemo(
    () => pixelArea?.features ?? [bboxPolygon(historyAreaBbox(entry.lat, entry.lon))],
    [pixelArea, entry.lat, entry.lon],
  );
  const asideNode = typeof aside === 'function' ? aside(pixelArea) : aside;
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [entry]);
  const [chapter, setChapter] = useState<DossierChapter>(1);
  useEffect(() => setChapter(1), [entry.id]);
  const passes = useMemo(() => (ev ? sortPasses(groupPasses(shardRows(ev))) : []), [ev]);
  const w = weather !== 'loading' ? weather : null;
  const lc = ev?.effis?.landcover ?? null;
  const lcRows = lc ? LANDCOVER_KEYS.map((k) => [LANDCOVER_LABEL[k], lc[k] ?? 0] as const).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]) : [];
  // BDE-D: die Ausbreitungsrichtung kommt aus DERSELBEN `dynamicsOf` wie live — der
  // Index trägt sie nicht, die Überflüge des Shards schon. Ohne Shard bleibt sie `null`,
  // und die Karte sagt „nicht bestimmbar" statt zu raten.
  const spreadBearingDeg = useMemo(() => (passes.length > 0 ? dynamicsOf(passes).spreadBearingDeg : null), [passes]);
  const dayN = passes.filter((p) => p.day === true).length;
  const nightN = passes.filter((p) => p.day === false).length;
  return (
    <>
      <DossierChapterTabs value={chapter} onChange={setChapter} />
      {chapter === 1 && (
        <>
          {head}
          <div className="br-ds-grid">
      {asideNode}


      <section className="br-ds-card br-ds-verlauf" aria-label="Verlauf">
        <div className="br-ds-cardhead">
          <span className="br-ds-eyebrow is-red">Verlauf</span>
          <span className="br-ds-cardsub">ΣFRP je Überflug · log-Achse — endet mit der letzten Detektion</span>
        </div>
        {shard.kind === 'loading' && <p className="br-note">Detail wird geladen … (eine Zelle, eine Datei)</p>}
        {shard.kind === 'error' && <p className="br-note">Detail nicht erreichbar ({shard.message}) — die Kennzahlen oben stammen aus dem Index.</p>}
        {passes.length > 0 && <FirePassChart passes={passes} nowMs={entry.lastMs} wide wideWidth={4000} />}
        {passes.length === 1 && <p className="br-note">Ein einziger Überflug — es gibt keinen zeitlichen Verlauf, nur diesen Messpunkt.</p>}
        {/* BD3: übernommen aus der gestrichenen Inline-Karte — die Einzeldetektion ist die schwächste
            Aussage der Historie und muss auch im Dossier stehen. */}
        {entry.hotspots === 1 && <p className="br-note">Einzeldetektion — keine Bestätigung durch einen weiteren Überflug.</p>}
        {shard.kind === 'ok' && ev && passes.length === 0 && <p className="br-note">Keine Detektionen im Shard — dieses Ereignis besteht nur aus der EFFIS-Kartierung.</p>}
        {ev && passes.length > 0 && (
          <dl className="fire-fp-dl br-ds-dl">
            <dt>Überflüge</dt>
            <dd>{passes.length} · {dayN} ☀ Tag / {nightN} ☾ Nacht · Satelliten {ev.satellites.length ? ev.satellites.join(', ') : '—'}</dd>
          </dl>
        )}
      </section>


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
            {' '}· {historyCountryLabel(entry.country)}
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
        </>
      )}
      {chapter === 2 && (
        <div className="br-ds-grid">
      {/* SAT1: dieselbe Satellitenbild-Karte wie im Live-Dossier — EINE Komponente, zwei Aufrufer. */}
      {satEnabled() && (
        <section className="br-ds-card br-ds-satbild" aria-label="Satellitenbild vorher, während und nachher">
          <div className="br-ds-cardhead">
            <span className="br-ds-eyebrow">Satellitenbild</span>
            <span className="br-ds-cardsub">Vorher · während · nachher — wenn die Wolken es zulassen</span>
          </div>
          {/* Rahmen = die Fläche von „Karte · markiert" (FIRMS-Pixel); die Ereignis-BBox bestimmt weiter nur den Bildausschnitt. */}
          <SatImageryBlock t={{ lat: entry.lat, lon: entry.lon, bbox: ev?.bbox ?? null, firstMs: entry.firstMs, lastMs: entry.lastMs, shape: frameShape }} nowMs={Date.now()} />
        </section>
      )}
        </div>
      )}
      {chapter === 3 && (
        <div className="br-ds-grid">
      <section className="br-ds-card is-steel br-ds-wetter" aria-label="Wetterlage am Brandtag">
        <div className="br-ds-cardhead">
          <span className="br-ds-eyebrow is-steel">Wetterlage am Brandtag</span>
        </div>
        <div className="br-wx">
          {weather === 'loading' && <p className="br-wx-loading br-muted">Tages- und Stundenwerte werden geholt …</p>}
          {w?.day && (
            <div className="br-wx-tile">
              <span className="br-wx-lbl">Tag · {w.dateISO.split('-').reverse().join('.')}</span>
              <span className="br-wx-stats">
                <WxStat lbl="Höchsttemp." val={`${num(w.day.tMaxC, ' °C', 1)}${w.day.modelFilled.includes('tMaxC') ? '*' : ''}`} />
                <WxStat lbl="Feuchte" val={`${num(w.day.humidityPct, ' %')}${w.day.modelFilled.includes('humidityPct') ? '*' : ''}`} />
                <WxStat lbl="Wind max." val={`${num(w.day.windMaxKmh, ' km/h')}${w.day.modelFilled.includes('windMaxKmh') ? '*' : ''}`} />
                <WxStat lbl="Regen" val={`${num(w.day.precipMm, ' mm', 1)}${w.day.modelFilled.includes('precipMm') ? '*' : ''}`} />
              </span>
            </div>
          )}
          {w?.hour && (
            <div className="br-wx-tile">
              <span className="br-wx-lbl">Stunde {fmtClock(w.hour.atMs)}</span>
              <span className="br-wx-stats">
                <WxStat lbl="Temperatur" val={num(w.hour.tempC, ' °C', 1)} />
                <WxStat lbl="Wind" val={num(w.hour.windKmh, ' km/h')} />
                <WxStat lbl="Regen" val={num(w.hour.precipMm, ' mm', 1)} />
              </span>
            </div>
          )}
          {w && (
            <div className="br-wx-tile">
              <span className="br-wx-lbl">Trockenphase</span>
              <span className="br-wx-big">{rainLabel(w)}</span>
              {!w.day && <span className="br-wx-sub">Tagesreihe fehlt</span>}
            </div>
          )}
          {weather === null && <p className="br-note">Wetterlage nicht verfügbar — Ausfall der Historie-Quellen, kein Wert erfunden.</p>}
          {w?.notes.map((n, i) => <p key={i} className="br-note">{n}</p>)}
          <NoteFold>
          <p className="br-note">
            {w?.day ? <>Tag: {w.day.kind === 'measured' ? 'gemessen' : 'Reanalyse'}{w.day.station ? `, Station ${w.day.station.name} (${w.day.station.distanceKm.toFixed(0)} km)` : ''} · {w.day.source}{w.day.modelFilled.length > 0 ? ' · * vom Anbieter mit Modellwert gefüllt, nicht gemessen' : ''}. </> : null}
            {w?.hour ? <>Stunde: Reanalyse, {w.hour.source}. </> : null}
            Kein ICON-/Fusionswert: die Vorhersagemodelle haben kein Archiv — beide Quellen beschreiben die Umgebung, nicht den Brandort selbst.
          </p>
          </NoteFold>
        </div>
      </section>

      {/* BDE-D: dieselbe Wetterführung wie im Live-Dossier — EINE Darstellung, zwei Quellen. */}
      <HistoryDriversCard entry={entry} spreadBearingDeg={spreadBearingDeg} />

      {/* BDE-E: dasselbe Brandprofil wie im Live-Dossier. Der Anker ist hier immer eine
          Detektion — Historie-Ereignisse ohne Detektion tragen den Beginn der Kartierung
          in `firstMs`, also gilt derselbe Zeitpunkt wie in der Liste. */}
      <section className="br-ds-card br-ds-profile" aria-label="Brandprofil im Ortsvergleich">
        <div className="br-ds-cardhead">
          <span className="br-ds-eyebrow is-warn">Brandprofil</span>
          <span className="br-ds-cardsub">Rang gegen die letzten 30 Tage am selben Punkt · abgeleitet</span>
        </div>
        <FireProfileBlock lat={entry.lat} lon={entry.lon} anchorMs={entry.firstMs} />
      </section>
        </div>
      )}
    </>
  );
}
