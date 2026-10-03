/**
 * AW-5 — Autobahnwetter page, Command-Deck (D-27), design `reference/autobahnwetter-desktop.dc.html` (+ mobile).
 * Rail 62 · topbar 60 · dock 250 · map · readout 400, band as glass panel over the map foot; mobile: full-screen map,
 * corridor pill + share (44 px), time chips (36 px), bottom sheet in two stages.
 *
 * Data: `road/v1/` of buscosun-data via `roadClient.ts` (time gate, step back, CDN + raw hedge, client checks of the
 * contract). Freshness rules of the contract: > 45 min grey "veraltet", > 3 h or kill switch "derzeit keine Messdaten".
 * Measurements only — the time chips +1/+3/+6 h stay disabled until AW-6 passes Gate D.
 * `roadDeck.css` is imported only here (lazy chunk), tokens `--aw-*` live in `designTokens.css`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import { FeatureRail, type RailFeature } from '../nav/featureRail';
import ShareButton from '../share/ShareButton';
import { useAppNav } from '../router/useAppNav';
import { useMediaQuery } from '../mobile/useIsMobile';
import type { CapAlert } from '../warnings/capAlerts';
import { ROAD_DEAD_MS, roadFreshness, type RoadH24File, type RoadPoint } from './roadContract';
import { ROAD_CLASS_LABEL } from './roadClasses';
import { loadRoadCorridors, loadRoadH24, loadRoadSlot, type RoadCorridor, type RoadSlotLoad } from './roadClient';
import RoadMap, { type RoadMapLayers } from './RoadMap';
import RoadDock, { type RoadCountry } from './RoadDock';
import RoadBand from './RoadBand';
import RoadReadout from './RoadReadout';
import { ROAD_FORECAST_ENABLED, ROAD_TIMES, type RoadTab, type RoadUrlState } from './roadState';
import {
  ROAD_CLASS_COLOR, bandSegments, corridorEnds, f1, hm, isCritical, isHatched, isRoadWarning, kmIn, roadNumber,
  searchCorridors, slotSummary,
} from './roadView';
import './roadDeck.css';

export interface RoadPageProps {
  initial: RoadUrlState;
  invalid: string[];
  onUrlState: (s: RoadUrlState) => void;
  onCorridor: (s: RoadUrlState, initial: boolean) => void;
}

const DEFAULT_CORRIDOR = 'a8';
const REFRESH_MS = 60_000;
const DEFAULT_LAYERS: RoadMapLayers = { zust: true, temp: true, fog: true, warn: true, bl: false };

export default function RoadPage({ initial, onUrlState, onCorridor }: RoadPageProps) {
  const nav = useAppNav();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [corridors, setCorridors] = useState<RoadCorridor[] | null>(null);
  const [corrState, setCorrState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [load, setLoad] = useState<RoadSlotLoad | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [corridorId, setCorridorId] = useState<string>(initial.corridor ?? DEFAULT_CORRIDOR);
  const [stId, setStId] = useState<string | null>(initial.st);
  const [dir, setDir] = useState<0 | 1>(initial.dir);
  const [tab, setTab] = useState<RoadTab>(initial.tab);
  const [country, setCountry] = useState<RoadCountry>('alle');
  const [query, setQuery] = useState('');
  const [layers, setLayers] = useState<RoadMapLayers>(DEFAULT_LAYERS);
  const [departMin, setDepartMin] = useState(0);
  const [ring, setRing] = useState<RoadH24File | null>(null);
  const [warn, setWarn] = useState<{ state: 'off' | 'loading' | 'ok' | 'error'; alerts: CapAlert[] }>({ state: 'off', alerts: [] });
  const [pointWarnings, setPointWarnings] = useState<CapAlert[]>([]);
  const [sheet, setSheet] = useState<'peek' | 'open'>('peek');
  const [picker, setPicker] = useState(false);
  const firstCorridor = useRef(true);

  // --- data ------------------------------------------------------------------------------------
  useEffect(() => {
    const ac = new AbortController();
    loadRoadCorridors(ac.signal).then((f) => {
      if (!f) { setCorrState('error'); return; }
      setCorridors(f.corridors.slice().sort((a, b) => roadNumber(a.road) - roadNumber(b.road) || b.stations.length - a.stations.length));
      setCorrState('ok');
    }, () => setCorrState('error'));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    let ac = new AbortController();
    let alive = true;
    const run = () => {
      const t = Date.now();
      setNowMs(t);
      loadRoadSlot(t, ac.signal).then((l) => {
        if (!alive) return;
        // A refresh never replaces a good slot by "nothing" — the shown slot stays and ages by the freshness rules.
        setLoad((prev) => (l.obs || !prev?.obs ? l : prev));
      }, () => {});
    };
    run();
    const id = window.setInterval(() => { ac.abort(); ac = new AbortController(); run(); }, REFRESH_MS);
    return () => { alive = false; ac.abort(); window.clearInterval(id); };
  }, []);

  const obs = load?.obs ?? null;
  const byId = useMemo(() => new Map((obs?.points ?? []).map((p) => [p.id, p] as const)), [obs]);
  const freshness = obs ? roadFreshness(obs.slotMs, nowMs, obs.killed) : 'dead';
  const summary = useMemo(() => slotSummary(obs, nowMs), [obs, nowMs]);
  const noData: string | null = !load ? null
    : obs?.killed ? 'Die Veröffentlichung ist angehalten (Kill-Switch des Datenspeichers).'
      : !obs && load.reason === 'error' ? `Der Datenspeicher ist gerade nicht erreichbar (${load.error ?? 'Netz'}).`
        : !obs ? 'In der letzten Stunde wurde kein geprüfter Slot veröffentlicht.'
          : nowMs - obs.slotMs > ROAD_DEAD_MS ? `Der letzte geprüfte Slot (${hm(obs.slotMs)}) ist älter als 3 Stunden.` : null;
  const shownPoints = useMemo(() => (noData ? [] : (obs?.points ?? [])), [noData, obs]);
  const shownById = noData ? EMPTY_BY_ID : byId;

  const corridor = useMemo(() => corridors?.find((c) => c.id === corridorId) ?? corridors?.find((c) => c.id === DEFAULT_CORRIDOR) ?? corridors?.[0] ?? null, [corridors, corridorId]);
  const inCorridor = useMemo(() => new Set(corridor?.stations.map((s) => s.id) ?? []), [corridor]);
  const mapPoints = useMemo(() => shownPoints.filter((p) => p.kind === 'A' || layers.bl || inCorridor.has(p.id)), [shownPoints, layers.bl, inCorridor]);

  // Default station: the coldest valid measurement of the corridor, else its first station.
  const point: RoadPoint | null = useMemo(() => {
    if (stId && shownById.get(stId)) return shownById.get(stId)!;
    if (!corridor) return null;
    const ps = corridor.stations.map((s) => shownById.get(s.id)).filter((x): x is RoadPoint => !!x);
    const measured = ps.filter((x) => x.rs != null).sort((a, b) => (a.rs as number) - (b.rs as number));
    return measured[0] ?? ps[0] ?? null;
  }, [stId, shownById, corridor]);

  // 24-h ring of the selected station's series.
  const pointGroup = point?.g ?? null;
  const obsSlot = obs?.slot ?? null;
  useEffect(() => {
    if (!pointGroup || !obsSlot) { setRing(null); return; }
    const ac = new AbortController();
    loadRoadH24(pointGroup, obsSlot, ac.signal).then(setRing, () => setRing(null));
    return () => ac.abort();
  }, [pointGroup, obsSlot]);

  // DWD warnings (lazy modules, only with the layer on); quoted verbatim in the readout.
  useEffect(() => {
    if (!layers.warn) { setWarn({ state: 'off', alerts: [] }); return; }
    const ac = new AbortController();
    setWarn((w) => ({ ...w, state: 'loading' }));
    (async () => {
      try {
        const [{ fetchDwdWarnings }, { isActiveAt }] = await Promise.all([import('../sources/dwdCapAlerts'), import('../warnings/warnField')]);
        const run = await fetchDwdWarnings(ac.signal);
        const t = Date.now();
        setWarn({ state: 'ok', alerts: run.alerts.filter((a) => isRoadWarning(a.group, a.event) && isActiveAt(a, t)) });
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') setWarn({ state: 'error', alerts: [] });
      }
    })();
    return () => ac.abort();
  }, [layers.warn]);
  const warnAreas = useMemo<GeoJSON.FeatureCollection | null>(() => (warn.state !== 'ok' ? null : {
    type: 'FeatureCollection',
    features: warn.alerts.flatMap((a) => a.areas.map((ar) => ({ type: 'Feature' as const, properties: { id: a.id }, geometry: { type: 'Polygon' as const, coordinates: ar.rings } }))),
  }), [warn]);
  useEffect(() => {
    if (warn.state !== 'ok' || !point) { setPointWarnings([]); return; }
    let alive = true;
    import('../countryMask').then(({ pointInRings }) => {
      if (alive) setPointWarnings(warn.alerts.filter((a) => a.areas.some((ar) => pointInRings(ar.rings as unknown as number[][][], point.lon, point.lat))));
    });
    return () => { alive = false; };
  }, [warn, point]);

  // --- URL ------------------------------------------------------------------------------------------
  const urlState: RoadUrlState = { corridor: corridor?.id ?? corridorId, st: stId, t: 0, dir, tab };
  const urlKey = JSON.stringify(urlState);
  useEffect(() => { if (!firstCorridor.current) onUrlState(urlState); }, [urlKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!corridor) return;
    onCorridor({ ...urlState, corridor: corridor.id }, firstCorridor.current);
    firstCorridor.current = false;
  }, [corridor?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickCorridor = useCallback((id: string) => { setCorridorId(id); setStId(null); setSheet('peek'); setPicker(false); }, []);
  const pickStation = useCallback((id: string) => {
    setStId(id);
    setTab((t) => (t === 'quellen' ? 'station' : t));
    const owner = corridors?.find((c) => c.id === corridorId && c.stations.some((s) => s.id === id))
      ?? corridors?.find((c) => c.stations.some((s) => s.id === id));
    if (owner && owner.id !== corridorId) setCorridorId(owner.id);
  }, [corridors, corridorId]);

  const filtered = useMemo(() => searchCorridors(corridors ?? [], shownById, query), [corridors, shownById, query]);
  const standLabel = obs && !noData ? `Messung ${hm(obs.slotMs)}${freshness === 'stale' ? ' · veraltet' : ''}` : 'keine Messdaten';
  const liveTone = noData || !obs ? 'none' : freshness === 'live' ? 'live' : 'stale';
  // Overlays cover the map: mobile pill + chips on top, the sheet (design 414 px) at the bottom; desktop band 165 px.
  const padding = isMobile ? { top: 130, bottom: 430, left: 24, right: 24 } : { top: 110, bottom: 200, left: 40, right: 60 };
  const ends = corridor ? corridorEnds(corridor, dir) : null;

  // --- pieces -----------------------------------------------------------------------------------------
  const pill = corridor && ends && (
    <div className="aw-pill">
      <span className="aw-pill-shields">{corridor.shields.map((s) => <span key={s} className="aw-shield">{s}</span>)}</span>
      <span className="aw-pill-body">
        <span className="aw-pill-title">{ends.from} → {ends.to}</span>
        <span className="aw-pill-sub">Richtung {ends.to} · {corridor.countries.join(' · ')}{isMobile ? ` · ${corridor.stations.length} Messpunkte` : ''}</span>
      </span>
      <button type="button" className="aw-icon-btn" aria-label="Fahrtrichtung wechseln" onClick={() => setDir((d) => (d ? 0 : 1))}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h14l-4-4M20 16H6l4 4" /></svg>
      </button>
    </div>
  );
  const times = (
    <div role="group" aria-label="Zeitpunkt" className="aw-seg aw-times">
      {ROAD_TIMES.map((h) => {
        const enabled = h === 0 || ROAD_FORECAST_ENABLED;
        return (
          <button key={h} type="button" aria-pressed={h === 0} className={h === 0 ? 'is-active' : ''} disabled={!enabled}
            title={enabled ? undefined : 'Die Ableitung +1/+3/+6 h kommt erst nach bestandenem Backtest (Gate D).'}>
            {h === 0 ? `Jetzt${obs && !noData ? ` · ${hm(obs.slotMs)}` : ''}` : `+${h} h`}
          </button>
        );
      })}
    </div>
  );
  const legend = (
    <div className="aw-legend" aria-label="Legende">
      <span className="aw-eyebrow">Fahrbahn</span>
      {(['ice', 'frost', 'wet', 'dry'] as const).map((c) => <span key={c}><i style={{ background: ROAD_CLASS_COLOR[c] }} />{ROAD_CLASS_LABEL[c].label}</span>)}
      {/* Hatched = `unknown` (temperature, no condition) AND `nodata` — never "dry" (D-04). */}
      <span><i className="is-hatched" />Zustand unbekannt / keine Messung</span>
    </div>
  );
  const emptyMap = noData && <div className="aw-map-note" role="status"><strong>Derzeit keine Messdaten.</strong> {noData}</div>;
  const corrFail = corrState === 'error' && <div className="aw-map-note" role="status"><strong>Korridore nicht ladbar.</strong> Die Messpunkte erscheinen trotzdem auf der Karte.</div>;
  const zoom = (d: number) => { const m = mapRef.current; if (m) { if (d > 0) m.zoomIn(); else m.zoomOut(); } };

  const callout = point ? {
    lon: point.lon, lat: point.lat, name: point.n,
    line: point.rs != null ? `Fahrbahn ${f1(point.rs)} °C · ${ROAD_CLASS_LABEL[point.cls].label}` : ROAD_CLASS_LABEL[point.cls].label,
    color: isHatched(point.cls) ? null : ROAD_CLASS_COLOR[point.cls],
  } : null;
  const map = (
    <RoadMap corridors={corridors ?? []} corridor={corridor} points={mapPoints} inCorridor={inCorridor}
      selectedId={point?.id ?? null} stale={freshness === 'stale'} layers={layers} warnAreas={warnAreas} padding={padding}
      onSelect={pickStation} onMap={(m) => { mapRef.current = m; }} callout={callout} />
  );
  const readout = (
    <RoadReadout tab={tab} onTab={setTab} point={point} corridor={corridor} byId={shownById} dir={dir} slotMs={obs?.slotMs ?? null} nowMs={nowMs}
      stale={freshness === 'stale'} ring={ring} warnings={pointWarnings} warnState={warn.state} departOffsetMin={departMin}
      onDepart={(d) => setDepartMin((m) => Math.max(0, Math.min(345, m + d)))} onPick={pickStation} noData={noData} />
  );

  // --- mobile ---------------------------------------------------------------------------------------------
  if (isMobile) {
    const rows = corridor ? corridor.stations.map((s) => ({ s, p: shownById.get(s.id) })).filter((r): r is { s: RoadCorridor['stations'][number]; p: RoadPoint } => !!r.p) : [];
    const critical = rows.filter((r) => isCritical(r.p.cls)).sort((a, b) => (a.p.rs ?? 99) - (b.p.rs ?? 99)).slice(0, 3);
    const coldest = rows.filter((r) => r.p.rs != null).sort((a, b) => (a.p.rs as number) - (b.p.rs as number))[0];
    const nCrit = rows.filter((r) => isCritical(r.p.cls)).length;
    const slot15 = Math.ceil(nowMs / 900_000) * 900_000;
    const list = (critical.length ? critical : rows.slice(0, 3));
    const mPill = corridor && ends && (
      <button type="button" className="aw-pill is-button" aria-haspopup="dialog" aria-expanded={picker} onClick={() => setPicker(true)}>
        <span className="aw-pill-shields">{corridor.shields.map((s) => <span key={s} className="aw-shield">{s}</span>)}</span>
        <span className="aw-pill-body">
          <span className="aw-pill-title">{ends.from} → {ends.to}</span>
          <span className="aw-pill-sub">Richtung {ends.to} · {corridor.stations.length} Messpunkte</span>
        </span>
        <svg className="aw-pill-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
    );
    return (
      <div className="aw-root is-mobile">
        <main className="aw-map is-mobile" aria-label="Karte">
          {map}
          <div className="aw-m-top">{mPill}<ShareButton className="aw-m-share" compact /></div>
          <div className="aw-m-times">{times}</div>
          {emptyMap}
        </main>
        <section className={`aw-sheet is-${sheet}`} aria-label="Strecken-Briefing">
          <button type="button" className="aw-sheet-grip" aria-label={sheet === 'open' ? 'Briefing verkleinern' : 'Briefing aufklappen'} aria-expanded={sheet === 'open'}
            onClick={() => setSheet((s) => (s === 'open' ? 'peek' : 'open'))}><span /></button>
          <div className="aw-sheet-head">
            <span className="aw-eyebrow is-accent">Strecken-Briefing</span>
            <span className={`aw-eyebrow is-${liveTone}`}>{liveTone === 'live' ? `Live · ${hm(obs!.slotMs)}` : liveTone === 'stale' ? `veraltet · ${hm(obs!.slotMs)}` : 'keine Messdaten'}</span>
          </div>
          <h2 className="aw-sheet-title">{noData ? 'Derzeit keine Messdaten' : coldest ? `Kälteste Stelle: ${coldest.p.n} ${f1(coldest.p.rs as number)} °C` : 'Keine gültige Fahrbahnmessung'}</h2>
          <p className="aw-sheet-lead">{noData ?? `${nCrit} von ${rows.length} DWD-Anlagen mit Glätte oder Frostgefahr gemessen${corridor?.borders.length ? '; ab der Grenze keine offene Fahrbahnmessung' : ''}.`}</p>
          {corridor && <MiniBand corridor={corridor} byId={shownById} dir={dir} />}
          {corridor && !noData && (
            <>
              <div className="aw-sheet-list">
                {list.map(({ s, p }) => (
                  <button key={s.id} type="button" className="aw-sheet-row" onClick={() => { pickStation(s.id); setTab('station'); }}>
                    <i className={isHatched(p.cls) ? 'is-hatched' : ''} style={!isHatched(p.cls) ? { background: ROAD_CLASS_COLOR[p.cls] } : undefined} />
                    <span><strong>{p.n} · km {Math.round(kmIn(corridor, s.km, dir))}</strong><em>{p.rs != null ? `jetzt ${f1(p.rs)} °C, ${ROAD_CLASS_LABEL[p.cls].label}` : ROAD_CLASS_LABEL[p.cls].label} · gemessen {hm(p.t)}</em></span>
                    <span className="aw-sheet-eta"><em>an</em><strong>{hm(slot15 + (kmIn(corridor, s.km, dir) / 100) * 3_600_000)}</strong></span>
                  </button>
                ))}
              </div>
              <div className="aw-sheet-actions">
                <button type="button" className="aw-btn is-primary" onClick={() => { setTab('strecke'); setSheet('open'); }}>Alle {rows.length} Messpunkte</button>
                <button type="button" className="aw-btn is-auto" onClick={() => { setTab('strecke'); setSheet('open'); }}>Abfahrt {hm(slot15 + departMin * 60_000)}</button>
              </div>
              {sheet === 'open' && <div className="aw-sheet-readout">{readout}</div>}
            </>
          )}
        </section>
        {picker && (
          <div className="aw-m-dock" role="dialog" aria-label="Autobahn wählen">
            <div className="aw-m-dock-head">
              <strong>Autobahn wählen</strong>
              <button type="button" onClick={() => setDir((d) => (d ? 0 : 1))} aria-label="Fahrtrichtung wechseln">⇄ Richtung</button>
              <button type="button" onClick={() => setPicker(false)} aria-label="Schließen">✕</button>
            </div>
            <RoadDock corridors={filtered} byId={shownById} selectedId={corridor?.id ?? null} onPick={pickCorridor} query={query} onQuery={setQuery}
              country={country} onCountry={setCountry} layers={layers} onToggle={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))} summary={summary} hasData={!noData && !!obs} />
          </div>
        )}
      </div>
    );
  }

  // --- desktop / tablet ------------------------------------------------------------------------------------
  return (
    <div className="aw-root">
      <FeatureRail active={'road' as RailFeature} onOpenFeature={(id) => nav.openFeature(id)} onHome={nav.goHome}
        navClass="aw-rail" btnClass="aw-rail-btn" activeClass="is-active" spacerClass="aw-rail-spacer" />
      <div className="aw-deck">
        <header className="aw-topbar">
          <a className="aw-brand" href="/" onClick={(e) => { e.preventDefault(); nav.goHome(); }} aria-label="Zur Startseite">
            <img src="/buscosun-mark.svg" width={22} height={22} alt="" />
            <span>buscosun</span>
          </a>
          <span className="aw-topdiv" aria-hidden="true" />
          <span className="aw-topbar-sub">Autobahnwetter DACH</span>
          <div className="aw-topbar-right">
            <span className={`aw-live is-${liveTone}`} role="status"><span className="aw-live-dot" aria-hidden="true"><span /><span /></span>{liveTone === 'live' ? 'Live' : liveTone === 'stale' ? 'Veraltet' : 'Keine Daten'}</span>
            <span className="aw-topbar-stand">
              {obs && !noData ? <>Messung <strong>{hm(obs.slotMs)}</strong> · {summary.activeGroups} von {summary.totalGroups} DWD-Reihen</> : 'derzeit keine Messdaten'}
            </span>
            <ShareButton className="aw-share" text="Teilen" />
          </div>
        </header>
        <div className="aw-body">
          <RoadDock corridors={filtered} byId={shownById} selectedId={corridor?.id ?? null} onPick={pickCorridor} query={query} onQuery={setQuery}
            country={country} onCountry={setCountry} layers={layers} onToggle={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))} summary={summary} hasData={!noData && !!obs} />
          <main className="aw-map" aria-label="Karte">
            {map}
            <div className="aw-ov-left">{pill}{times}</div>
            <div className="aw-ov-right">
              {legend}
              <div className="aw-zoom">
                <button type="button" aria-label="Hineinzoomen" onClick={() => zoom(1)}>+</button>
                <button type="button" aria-label="Herauszoomen" onClick={() => zoom(-1)}>−</button>
              </div>
            </div>
            {emptyMap}{corrFail}
            {corridor && <RoadBand corridor={corridor} byId={shownById} dir={dir} selectedId={point?.id ?? null} standLabel={standLabel} zust={layers.zust} onPick={pickStation} />}
          </main>
          {readout}
        </div>
      </div>
    </div>
  );
}

const EMPTY_BY_ID: ReadonlyMap<string, RoadPoint> = new Map();

/** Mobile mini band (design: 10 px, towns underneath). */
function MiniBand({ corridor, byId, dir }: { corridor: RoadCorridor; byId: ReadonlyMap<string, RoadPoint>; dir: 0 | 1 }) {
  const segs = bandSegments(corridor, byId, dir);
  const len = corridor.lengthKm;
  const towns = corridor.towns.map(([km, n]) => [kmIn(corridor, km, dir), n] as const).sort((a, b) => a[0] - b[0]);
  const pick = [towns[0], towns[Math.floor(towns.length / 2)], towns[towns.length - 1]].filter((t, i, a) => !!t && a.indexOf(t) === i);
  return (
    <>
      <div className="aw-miniband" aria-hidden="true">
        {segs.map((g, i) => (
          <div key={i} className={`aw-band-seg${g.cls === 'gap' || isHatched(g.cls) ? ' is-gap' : ''}`}
            style={{ left: `${(g.fromKm / len) * 100}%`, width: `${((g.toKm - g.fromKm) / len) * 100}%`, ...(g.cls !== 'gap' && !isHatched(g.cls) ? { background: ROAD_CLASS_COLOR[g.cls] } : {}) }} />
        ))}
        {corridor.borders.map((b) => <div key={b.km} className="aw-miniband-border" style={{ left: `${(kmIn(corridor, b.km, dir) / len) * 100}%` }} />)}
      </div>
      <div className="aw-miniband-towns">{pick.map((t) => <span key={t[1]}>{t[1]}</span>)}</div>
    </>
  );
}
