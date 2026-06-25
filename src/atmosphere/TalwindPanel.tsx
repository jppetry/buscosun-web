/**
 * Atmosphäre · Talwind-Tagesgang (C, Berg-&-Weg-Linse).
 *
 * Leitet die Talwind-Umkehrzeiten (anabatisch ↔ katabatisch) aus dem stündlichen
 * Oberflächenwind (`getPointForecast`, bestehende Pipeline) + einer aus dem DEM
 * geschätzten „bergauf"-Richtung ab. Reine Umkehr-Logik aus `threed/dynamics`
 * (talwindReversals) wiederverwendet.
 *
 * Ehrlich: „bergauf"-Richtung ist der lokale DEM-Gradient (Hangrichtung), kein
 * echter Talachsen-Verlauf; Richtwert.
 */

import { useEffect, useRef, useState } from 'react';
import { useAtmosphere } from './atmosphereStore';
import { getPointForecast } from '../pointForecast/pointForecast';
import { loadElevationLookup } from '../fusion/elevation';
import { pickCountry } from '../pointForecast/clustering';
import { talwindReversals, type TalwindReversal } from '../threed/dynamics';
import type { TimeSample } from '../threed/buildCrossSection';

const DEBOUNCE_MS = 600;
const pad2 = (n: number) => String(n).padStart(2, '0');
const fmt = (ms: number) => { const d = new Date(ms); return `${d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

interface Result { reversals: TalwindReversal[]; upBearing: number | null; flat: boolean }

export default function TalwindPanel() {
  const { marker } = useAtmosphere();
  const [res, setRes] = useState<Result | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const acRef = useRef<AbortController | null>(null);
  const lat = marker?.lat ?? null;
  const lon = marker?.lon ?? null;
  const key = `${lat?.toFixed(4)},${lon?.toFixed(4)}`;

  useEffect(() => {
    if (lat == null || lon == null) { setState('idle'); setRes(null); return; }
    setState('loading');
    const timer = window.setTimeout(() => {
      acRef.current?.abort();
      const ac = new AbortController();
      acRef.current = ac;
      (async () => {
        try {
          // „Bergauf"-Richtung aus dem DEM-Gradienten (Hangrichtung) schätzen.
          let upBearing: number | null = null, flat = false;
          try {
            const grid = await loadElevationLookup({ lngMin: lon - 0.06, lngMax: lon + 0.06, latMin: lat - 0.06, latMax: lat + 0.06 }, 11, ac.signal);
            const dd = 0.03;
            const dN = grid.sample(lon, lat + dd) - grid.sample(lon, lat - dd);
            const dE = grid.sample(lon + dd, lat) - grid.sample(lon - dd, lat);
            if (Number.isFinite(dN) && Number.isFinite(dE)) {
              if (Math.hypot(dN, dE) < 40) flat = true; // <40 m Reliefunterschied → flach
              upBearing = (Math.atan2(dE, dN) * 180 / Math.PI + 360) % 360;
            }
          } catch { /* DEM optional */ }
          if (ac.signal.aborted) return;

          const fc = await getPointForecast({ lat, lng: lon, country: pickCountry(lat, lon), hours: 48, signal: ac.signal });
          if (ac.signal.aborted) return;
          const series: TimeSample[] = fc.hours.map((h) => ({
            tMs: h.timestamp.getTime(),
            windKmh: (h.windSpeed ?? 0) * 3.6,
            windDirDeg: h.windDirection ?? 0,
            gustKmh: (h.gustSpeed ?? 0) * 3.6,
            tempC: h.temperature ?? 0,
            cloudPct: h.cloudCoverTotal ?? 0,
            humidityPct: h.relativeHumidity ?? 0,
            cloudLowPct: h.cloudCoverLow ?? 0, cloudMidPct: h.cloudCoverMid ?? 0, cloudHighPct: h.cloudCoverHigh ?? 0,
          }));
          const reversals = upBearing == null ? [] : talwindReversals(series, upBearing);
          setRes({ reversals, upBearing, flat });
          setState('ready');
        } catch (err) {
          if (!ac.signal.aborted && (err as Error)?.name !== 'AbortError') setState('error');
        }
      })();
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => () => acRef.current?.abort(), []);

  if (state === 'idle') return null;
  if (state === 'loading' && !res) return <div className="rt-card atm-xsec atm-xsec-state"><span className="ev-spinner" /> Talwind wird gerechnet …</div>;
  if (state === 'error') return null; // optional — kein Block bei Fehler

  const now = Date.now();
  const next = res?.reversals.filter((r) => r.tMs >= now).slice(0, 2) ?? [];

  return (
    <div className="rt-card atm-talwind">
      <span className="rt-eyebrow">Talwind-Tagesgang</span>
      {res?.flat ? (
        <p className="atm-talwind-text">Flaches Gelände — kein ausgeprägter Talwind-Tagesgang zu erwarten.</p>
      ) : next.length === 0 ? (
        <p className="atm-talwind-text">Keine klare Talwind-Umkehr in den nächsten 48 Stunden erkennbar.</p>
      ) : (
        <ul className="atm-talwind-list">
          {next.map((r, i) => (
            <li key={i}>{fmt(r.tMs)} — dreht auf <strong>{r.toUpValley ? 'bergauf (anabatisch)' : 'bergab (katabatisch)'}</strong></li>
          ))}
        </ul>
      )}
      <p className="atm-talwind-note">Aus stündlichem Oberflächenwind + DEM-Hangrichtung · Richtwert.</p>
    </div>
  );
}
