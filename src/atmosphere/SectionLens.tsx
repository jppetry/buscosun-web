/**
 * Atmosphäre · Schnitt-Linse (Konsolidierung von threed).
 *
 * Re-hostet die bewährte threed-Schnitt-Erfahrung in der Atmosphäre: Schnittlinie
 * auf der Karte zeichnen (ThreeDMap) → Vertikalschnitt (SectionView, 2D) bzw.
 * 3D-Gelände-Vorhang (TerrainView). Zustand (Schnittlinie, Layer, Modus) kommt aus
 * dem Atmosphäre-Store; die Zeit steuert der eigene Slider der Schnitt-Ansicht
 * (der globale Scrubber ist auf dieser Linse ausgeblendet).
 *
 * Nur gemountet, wenn die Schnitt-Linse aktiv ist → MapLibre sauber auf-/abgebaut.
 * Komposition bestehender, prop-getriebener Komponenten — kein neuer Renderer.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtmosphere } from './atmosphereStore';
import ThreeDMap from '../threed/ThreeDMap';
import SectionView from '../threed/SectionView';
import TerrainView from '../threed/TerrainView';
import { prepareCrossSection, sectionAtTime, type PreparedSection, type PrepareProgress } from '../threed/buildCrossSection';

type DataState =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: PrepareProgress | null }
  | { kind: 'ready'; prepared: PreparedSection }
  | { kind: 'error'; message: string };

export default function SectionLens() {
  const { location, cutPoints, setCutPoints, sectionLayers, setSectionLayers, sectionMode, setSectionMode } = useAtmosphere();
  const [data, setData] = useState<DataState>({ kind: 'idle' });
  const [timeMs, setTimeMs] = useState<number | null>(null);
  const acRef = useRef<AbortController | null>(null);

  // Schnittlinie ≥ 2 Punkte → Daten (neu) vorbereiten (abbrechbar, Fortschritt).
  useEffect(() => {
    if (cutPoints.length < 2) { setData({ kind: 'idle' }); return; }
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setData({ kind: 'loading', progress: null });
    setSectionMode('3d'); // direkt in den Schnitt, damit der Lade-Fortschritt sichtbar ist
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

  if (!location) {
    return <div className="rt-card td-state"><p>Such oben einen Ort, dann zeichne eine Schnittlinie auf der Karte.</p></div>;
  }
  const center = { lat: location.lat, lon: location.lon };

  return (
    <div className="atm-section">
      <div className="td-modebar">
        <div className="td-toggle" role="tablist" aria-label="2D / 3D">
          <button type="button" role="tab" aria-selected={sectionMode === '2d'} className={`td-toggle-btn${sectionMode === '2d' ? ' is-active' : ''}`} onClick={() => setSectionMode('2d')}>2D Karte</button>
          <button type="button" role="tab" aria-selected={sectionMode === '3d'} className={`td-toggle-btn${sectionMode === '3d' ? ' is-active' : ''}`} disabled={data.kind !== 'ready'} onClick={() => setSectionMode('3d')}>3D Schnitt</button>
          <button type="button" role="tab" aria-selected={sectionMode === 'terrain'} className={`td-toggle-btn${sectionMode === 'terrain' ? ' is-active' : ''}`} disabled={data.kind !== 'ready'} onClick={() => setSectionMode('terrain')}>3D-Gelände</button>
        </div>
        <span className="td-modebar-hint">Karte antippen, um Schnittpunkte zu setzen</span>
      </div>

      {sectionMode === 'terrain' && data.kind === 'ready' && section && timeMs != null ? (
        <TerrainView
          center={center} points={cutPoints} onPoints={setCutPoints}
          prepared={data.prepared} section={section} timeMs={timeMs} onTime={setTimeMs}
          layers={sectionLayers} onLayers={setSectionLayers}
        />
      ) : (
        <div className={`td-layout${sectionMode === '3d' ? ' is-3d' : ''}`}>
          <div className="td-map-card rt-card">
            <ThreeDMap center={center} points={cutPoints} onChange={setCutPoints} />
            <div className="td-map-foot">
              <span>{cutPoints.length === 0 ? 'Karte antippen, um Schnittpunkte zu setzen' : `${cutPoints.length} Punkt${cutPoints.length === 1 ? '' : 'e'} · Marker ziehen oder antippen zum Löschen`}</span>
              {cutPoints.length > 0 && <button type="button" className="td-clear" onClick={() => setCutPoints([])}>Zurücksetzen</button>}
            </div>
          </div>
          {sectionMode === '3d' && (
            <div className="td-section-col">
              {data.kind === 'loading' && <LoadingCard progress={data.progress} />}
              {data.kind === 'error' && <div className="rt-card td-state"><p>⚠ {data.message}</p></div>}
              {data.kind === 'ready' && section && timeMs != null && (
                <SectionView
                  prepared={data.prepared} section={section} timeMs={timeMs} onTime={setTimeMs}
                  layers={sectionLayers} onLayers={setSectionLayers} locationName={location.name}
                />
              )}
              {data.kind === 'idle' && <div className="rt-card td-state"><p>Setze mindestens zwei Punkte auf der Karte, um den Vertikalschnitt zu berechnen.</p></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
