import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DACH_VIEW } from './countryProfiles';

// ============================================================================
// BACKGROUND MAP — echte 2D-DACH-Karte als Hero-Hintergrund (Experiment).
// Nicht-interaktiv, in die Sand-Palette getönt und mit Sand-Scrim überblendet,
// damit Headline/Suche/Feature-Kacheln lesbar bleiben. Liegt über dem SVG-
// Fallback (HeroBackground), das bei Offline/Tile-Fehler sichtbar bleibt.
//
// In eine eigene, LAZY geladene Datei ausgelagert: maplibre-gl (~500 KB) gehört
// damit nicht mehr in den Initial-Bundle der Startseite. Auf Touch-Geräten wird
// diese reine Deko-Karte gar nicht erst geladen (nur der SVG-Fallback) — spart
// dort Download + GPU. Siehe Lazy-Mount in SearchPage.
// ============================================================================
export default function HeroMapBackground() {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: DACH_VIEW.defaultCenter,
      zoom: 4.7,
      minZoom: 3,
      maxZoom: 7,
      interactive: false,
      // Auch die dekorative Hero-Karte zeigt echte OpenFreeMap/OSM-Kacheln —
      // die Attributionspflicht (ODbL) hängt an der Anzeige, nicht an der
      // Bedienbarkeit (V-105).
      attributionControl: { compact: true },
    });
    map.on('load', () => setReady(true));
    return () => {
      // Phase PF (M5, audit/performance-2026-10-10.md): tear the decorative map down AFTER the next paint. `Map.remove()` ran
      // synchronously inside the commit of the route change — measured 10.10.2026: 605 ms self time on the main thread
      // between the tile click and the first picture of the new view (software WebGL; with a GPU smaller, still blocking).
      const tearDown = () => { try { map.remove(); } catch { /* already gone */ } };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(tearDown, 0));
      else setTimeout(tearDown, 0);
    };
  }, []);

  return (
    <div className={`hero-map${ready ? ' is-ready' : ''}`} aria-hidden="true">
      <div ref={ref} className="hero-map-canvas" />
      <div className="hero-map-scrim" />
    </div>
  );
}
