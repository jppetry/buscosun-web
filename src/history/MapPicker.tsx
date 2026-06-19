/**
 * Karten-Ortspicker (US-1.2): Klick/Tipp auf die Karte setzt einen Marker,
 * übernimmt die Koordinaten und beschriftet sie per Reverse-Geocoding mit dem
 * nächstgelegenen Ortsnamen. DACH-zentriert.
 */

import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { reverseGeocode, shortLocationName } from '../geocode';
import type { HistoryLocation } from './historyState';

export default function MapPicker({ onClose, onPick }: { onClose: () => void; onPick: (l: HistoryLocation) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [10.4, 50.9], // DACH-Mitte
      zoom: 4.6,
    });
    map.addControl(new maplibregl.NavigationControl({}), 'top-right');
    mapRef.current = map;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const { lat, lng } = e.lngLat;
      setPicked({ lat, lon: lng });
      if (!markerRef.current) markerRef.current = new maplibregl.Marker({ color: '#7A9466' }).setLngLat([lng, lat]).addTo(map);
      else markerRef.current.setLngLat([lng, lat]);
      setResolving(true); setName(null);
      reverseGeocode(lat, lng).then((loc) => setName(loc ? shortLocationName(loc.name) : null)).catch(() => setName(null)).finally(() => setResolving(false));
    };
    map.on('click', onClick);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []);

  async function confirm() {
    if (!picked) return;
    let loc = null;
    try { loc = await reverseGeocode(picked.lat, picked.lon); } catch { /* ignore */ }
    onPick(loc
      ? { name: shortLocationName(loc.name), lat: loc.lat, lon: loc.lon, country: loc.country }
      : { name: `Position ${picked.lat.toFixed(2)}, ${picked.lon.toFixed(2)}`, lat: Number(picked.lat.toFixed(4)), lon: Number(picked.lon.toFixed(4)) });
  }

  return (
    <div className="hi-mapmodal" role="dialog" aria-modal="true" aria-label="Ort auf Karte wählen">
      <div className="hi-mapmodal-box">
        <div className="hi-mapmodal-head">
          <strong>Ort auf der Karte wählen</strong>
          <button type="button" className="hi-btn-sm" onClick={onClose} aria-label="Schließen">✕</button>
        </div>
        <div ref={containerRef} className="hi-mapmodal-map" />
        <div className="hi-mapmodal-foot">
          <span className="hi-mapmodal-info">
            {picked ? (resolving ? 'Ort wird bestimmt …' : (name ?? `Position ${picked.lat.toFixed(2)}, ${picked.lon.toFixed(2)}`)) : 'Tippe auf die Karte, um eine Position zu wählen.'}
          </span>
          <button type="button" className="hi-btn hi-btn-primary" disabled={!picked} onClick={confirm}>Übernehmen</button>
        </div>
      </div>
    </div>
  );
}
