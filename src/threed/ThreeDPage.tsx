/**
 * 3D-Wetter · Seite (US-F1/F2/F3).
 *
 * 2D bleibt Default: man definiert auf der Karte eine Schnittlinie (US-A1) und
 * ruft den 3D-Vertikalschnitt separat auf. Ort, Zeit, Parameter und Linie
 * bleiben beim Wechsel 2D ↔ 3D erhalten (US-F2). Wetterdaten kommen aus der
 * bestehenden App-Pipeline (DEM + getPointForecast).
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Location } from '../types';
import { geocodeDACH, flagForCountry } from '../geocode';
import ThreeDMap from './ThreeDMap';
import SectionView from './SectionView';
import TerrainView from './TerrainView';
import SoundingPanel from './SoundingPanel';
import { prepareCrossSection, sectionAtTime, type PreparedSection, type PrepareProgress } from './buildCrossSection';
import { decodeState, encodeState, type ThreeDLayers } from './threedState';
import { tourFileToCutLine } from './tourImport';
import { pickCountry } from '../pointForecast/clustering';
import type { GeoPoint } from './sectionGeometry';
import '../route/tourTheme.css';
import './threed.css';

export type LayerState = ThreeDLayers;
const DEFAULT_LAYERS: LayerState = { mean: true, gust: false, shear: false, inversion: false, cloudBase: false, cloudLayers: false, streamlines: false, foehn: false, temp: false };

interface Props { onBack: () => void }

type DataState =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: PrepareProgress | null }
  | { kind: 'ready'; prepared: PreparedSection }
  | { kind: 'error'; message: string };

export default function ThreeDPage({ onBack }: Props) {
  const [location, setLocation] = useState<Location | null>(null);
  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [mode, setMode] = useState<'2d' | '3d' | 'terrain'>('2d'); // US-F1: 2D ist Default
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [timeMs, setTimeMs] = useState<number | null>(null);
  const [data, setData] = useState<DataState>({ kind: 'idle' });
  const [showSounding, setShowSounding] = useState(false);
  const acRef = useRef<AbortController | null>(null);
  const restoredRef = useRef(false);

  // US-F5 — Zustand aus dem URL-Hash wiederherstellen (einmalig).
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const st = decodeState(window.location.hash);
    if (!st) return;
    if (st.loc) setLocation({ name: st.loc.name, lat: st.loc.lat, lon: st.loc.lon, country: st.loc.country });
    if (st.points.length) setPoints(st.points);
    if (st.timeMs != null) setTimeMs(st.timeMs);
    setLayers(st.layers);
  }, []);

  // US-F5 — Zustand bei Änderung in den Hash schreiben (teilbarer Permalink).
  useEffect(() => {
    if (!restoredRef.current) return;
    const hash = encodeState({
      loc: location ? { lat: location.lat, lon: location.lon, name: location.name, country: location.country } : null,
      points, timeMs, layers,
    });
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }, [location, points, timeMs, layers]);

  // Schnittlinie ändern → Daten (neu) vorbereiten.
  useEffect(() => {
    if (points.length < 2) { setData({ kind: 'idle' }); return; }
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setData({ kind: 'loading', progress: null });
    setMode('3d'); // sofort in den 3D-Schnitt, damit der Lade-Fortschritt sichtbar ist
    (async () => {
      try {
        const prepared = await prepareCrossSection(points, ac.signal, (p) => {
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
        setData({ kind: 'error', message: err instanceof Error ? err.message : '3D-Daten nicht erreichbar' });
      }
    })();
    return () => ac.abort();
  }, [points]);

  const section = useMemo(
    () => (data.kind === 'ready' && timeMs != null ? sectionAtTime(data.prepared, timeMs) : null),
    [data, timeMs],
  );

  // US-A7 — Tour-Datei als Schnittlinie übernehmen.
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  async function onTourFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // erlaubt erneuten Upload derselben Datei
    if (!file) return;
    setImportError(null);
    try {
      const tour = await tourFileToCutLine(file);
      const start = tour.points[0];
      setLocation({ name: tour.name, lat: start.lat, lon: start.lon, country: pickCountry(start.lat, start.lon) });
      setPoints(tour.points);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Tour konnte nicht gelesen werden.');
    }
  }

  const [copied, setCopied] = useState(false);
  async function copyPermalink() {
    const hash = encodeState({
      loc: location ? { lat: location.lat, lon: location.lon, name: location.name, country: location.country } : null,
      points, timeMs, layers,
    });
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rt-page td-page">
      <div className="rt-grain" />
      <nav className="rt-nav">
        <a className="rt-nav-logo" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>
          <span className="rt-nav-logo-mark" /><span className="rt-nav-logo-name">buscosun</span>
        </a>
        <div className="rt-nav-items">
          <button type="button" className="rt-nav-item" onClick={onBack}>Start</button>
          <button type="button" className="rt-nav-item" onClick={onBack}>Nowcast</button>
          <span className="rt-nav-item is-active">3D-Wetter</span>
          <button type="button" className="rt-nav-item" onClick={onBack}>Event-Planung</button>
        </div>
        <div className="rt-nav-right">
          <span className="rt-nav-live td-live">{data.kind === 'ready' ? 'ICON-D2 + DEM' : 'Multi-Quelle'}</span>
          <span className="rt-nav-avatar">JK</span>
        </div>
      </nav>

      <main className="rt-container">
        <header className="rt-intro td-intro">
          <span className="rt-eyebrow td-eyebrow">Höhenwind-Geländeschnitt · Inversion</span>
          <h1>Wetter im 3D-Raum</h1>
          <p>Setze eine Schnittlinie auf der Karte und sieh den vertikalen Wetterschnitt über echtem Gelände — Höhenwind (AGL), Böen und Inversion. Aus ICON-D2 + DEM abgeleitet.</p>
        </header>

        {/* 2D/3D-Umschalter (US-F1/F2) */}
        <div className="td-modebar">
          <div className="td-toggle" role="tablist" aria-label="2D / 3D">
            <button type="button" role="tab" aria-selected={mode === '2d'} className={`td-toggle-btn${mode === '2d' ? ' is-active' : ''}`} onClick={() => setMode('2d')}>2D Karte</button>
            <button type="button" role="tab" aria-selected={mode === '3d'} className={`td-toggle-btn${mode === '3d' ? ' is-active' : ''}`} disabled={data.kind !== 'ready'} onClick={() => setMode('3d')}>3D Schnitt</button>
            <button type="button" role="tab" aria-selected={mode === 'terrain'} className={`td-toggle-btn${mode === 'terrain' ? ' is-active' : ''}`} disabled={data.kind !== 'ready'} onClick={() => setMode('terrain')}>3D-Gelände</button>
          </div>
          <span className="td-modebar-hint">Ort · Zeit · Parameter bleiben beim Wechsel erhalten</span>
          {location && (
            <button type="button" className="td-permalink" onClick={copyPermalink}>
              {copied ? '✓ Link kopiert' : '🔗 Link teilen'}
            </button>
          )}
        </div>

        <section className="rt-section">
          <span className="rt-eyebrow td-eyebrow">Standort</span>
          <ThreeDLocationField value={location} onChange={(l) => { setLocation(l); setPoints([]); }} />
          <div className="td-import">
            <input ref={fileRef} type="file" accept=".gpx,.tcx,.fit,.kml,.kmz" style={{ display: 'none' }} onChange={onTourFile} />
            <button type="button" className="td-import-btn" onClick={() => fileRef.current?.click()}>
              ⤓ Gespeicherte Tour als Schnittlinie übernehmen (GPX/TCX/FIT)
            </button>
            {importError && <span className="td-import-err">⚠ {importError}</span>}
          </div>
          {location && (
            <button type="button" className="td-sounding-btn" onClick={() => setShowSounding(true)}>
              ◢ Vertikal-Sounding (Skew-T + 3D-Säule) am Ort
            </button>
          )}
        </section>

        {location && mode === 'terrain' && data.kind === 'ready' && section && timeMs != null ? (
          /* 3D-Gelände: eigene Vollflächen-Karte mit Atmosphären-Vorhang */
          <TerrainView
            center={{ lat: location.lat, lon: location.lon }}
            points={points}
            onPoints={setPoints}
            prepared={data.prepared}
            section={section}
            timeMs={timeMs}
            onTime={setTimeMs}
            layers={layers}
            onLayers={setLayers}
          />
        ) : location && (
          <div className={`td-layout${mode === '3d' ? ' is-3d' : ''}`}>
            {/* Karte: 2D groß / 3D klein */}
            <div className="td-map-card rt-card">
              <ThreeDMap center={{ lat: location.lat, lon: location.lon }} points={points} onChange={setPoints} />
              <div className="td-map-foot">
                <span>{points.length === 0 ? 'Karte antippen, um Schnittpunkte zu setzen' : `${points.length} Punkt${points.length === 1 ? '' : 'e'} · Marker ziehen oder antippen zum Löschen`}</span>
                {points.length > 0 && <button type="button" className="td-clear" onClick={() => setPoints([])}>Zurücksetzen</button>}
              </div>
            </div>

            {/* Schnitt / Status */}
            {mode === '3d' && (
              <div className="td-section-col">
                {data.kind === 'loading' && <LoadingCard progress={data.progress} />}
                {data.kind === 'error' && <div className="rt-card td-state"><p>⚠ {data.message}</p></div>}
                {data.kind === 'ready' && section && timeMs != null && (
                  <SectionView
                    prepared={data.prepared}
                    section={section}
                    timeMs={timeMs}
                    onTime={setTimeMs}
                    layers={layers}
                    onLayers={setLayers}
                    locationName={location.name}
                  />
                )}
                {data.kind === 'idle' && <div className="rt-card td-state"><p>Setze mindestens zwei Punkte auf der Karte, um den Vertikalschnitt zu berechnen.</p></div>}
              </div>
            )}
          </div>
        )}

        <div className="rt-trust" style={{ marginTop: '1.6rem' }}>
          <span className="dot td-dot">●</span> Höhenwind aus ICON-D2-10-m + DEM auf AGL abgeleitet · Auflösung ≈ 2 km · werbefrei
        </div>
      </main>

      {showSounding && location && (
        <SoundingPanel lat={location.lat} lon={location.lon} name={location.name} onClose={() => setShowSounding(false)} />
      )}
    </div>
  );
}

// --- Lade-Fortschritt --------------------------------------------------------
function LoadingCard({ progress }: { progress: PrepareProgress | null }) {
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 8;
  return (
    <div className="rt-card td-loading">
      <div className="td-loading-head">
        <span className="ev-spinner" />
        <span>{progress?.phase ?? 'Wird vorbereitet …'}</span>
        {progress && <span className="td-loading-count">{progress.done}/{progress.total}</span>}
      </div>
      <div className="td-loading-bar"><span className="td-loading-fill" style={{ width: `${Math.max(8, pct)}%` }} /></div>
    </div>
  );
}

// --- Ort-Suche (kompakt, DACH) ----------------------------------------------
function ThreeDLocationField({ value, onChange }: { value: Location | null; onChange: (l: Location | null) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function search() {
    const q = query.trim();
    if (!q) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError(null); setResults([]);
    try {
      const found = await geocodeDACH(q, ac.signal);
      if (ac.signal.aborted) return;
      if (found.length === 0) setError('Keine Ergebnisse in DE / AT / CH.');
      else if (found.length === 1) onChange(found[0]);
      else setResults(found);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally { setLoading(false); }
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); void search(); }
    if (e.key === 'Escape') { setResults([]); setError(null); }
  }

  if (value) {
    return (
      <div className="ev-loc-chip rt-card">
        <span className="ev-loc-flag" aria-hidden="true">{flagForCountry(value.country)}</span>
        <span className="ev-loc-name">{value.name}</span>
        <button type="button" className="ev-loc-change" onClick={() => { onChange(null); setResults([]); setQuery(''); }}>Ändern</button>
      </div>
    );
  }
  return (
    <div className="ev-search-wrap">
      <div className="ev-search">
        <svg className="ev-search-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="8" cy="8" r="6" /><line x1="13" y1="13" x2="17" y2="17" strokeLinecap="round" />
        </svg>
        <input type="text" className="ev-search-input" placeholder="Bergregion, Tal oder Ort …" value={query}
          onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} disabled={loading} aria-label="Ort suchen" />
        <button type="button" className="ev-search-go td-search-go" onClick={() => void search()} disabled={loading || !query.trim()}>
          {loading ? 'Suche …' : 'Suchen'}
        </button>
      </div>
      {(results.length > 0 || error) && (
        <div className="ev-search-dropdown" role="listbox">
          {error && <div className="ev-search-error">⚠ {error}</div>}
          {results.map((r, i) => (
            <button key={`${r.lat},${r.lon}-${i}`} type="button" className="ev-search-result" onClick={() => onChange(r)}>
              <span className="ev-loc-flag" aria-hidden="true">{flagForCountry(r.country)}</span>
              <span className="ev-search-result-name">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
