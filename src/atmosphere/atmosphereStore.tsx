/**
 * Atmosphäre · shared state store (the single source of truth).
 *
 * The Time-Scrubber drives `activeHour`; every child subscribes to it via
 * useAtmosphere(). Lens + depth (Nerd) + location + marker live here too. State
 * is mirrored to the URL hash (#atm=) for shareable permalinks and the last lens
 * is remembered in localStorage. The app has no global store, so this provider is
 * scoped to the Atmosphäre feature only — same per-feature pattern as the rest.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Location } from '../types';
import {
  decodeState, encodeState, clampHour, LENSES, type Lens, type AtmosphereMarker,
} from './atmosphereState';

const LENS_KEY = 'buscosun.atm.lens.v1';

interface AtmosphereContextValue {
  lens: Lens;
  setLens: (l: Lens) => void;
  /** Active forecast hour offset (+0..+48h) — the single source of truth. */
  hour: number;
  setHour: (h: number) => void;
  nerdOpen: boolean;
  setNerdOpen: (v: boolean) => void;
  location: Location | null;
  setLocation: (l: Location | null) => void;
  /** Profile marker (defaults to the location until the user picks on the map). */
  marker: AtmosphereMarker | null;
  setMarker: (m: AtmosphereMarker | null) => void;
}

const AtmosphereContext = createContext<AtmosphereContextValue | null>(null);

function readLensFromStorage(): Lens | null {
  try {
    const v = localStorage.getItem(LENS_KEY);
    return v && (LENSES as string[]).includes(v) ? (v as Lens) : null;
  } catch { return null; }
}

export function AtmosphereProvider({ children }: { children: ReactNode }) {
  // Initial state: hash wins; else last lens from localStorage; else first-time
  // default lens = "Himmel" (sky), per spec.
  const initial = useMemo(() => {
    const st = typeof window !== 'undefined' ? decodeState(window.location.hash) : null;
    const lens: Lens = st?.lens ?? readLensFromStorage() ?? 'sky';
    return {
      lens,
      hour: st?.hour ?? 0,
      nerd: st?.nerd ?? false,
      loc: st?.loc ? { name: st.loc.name, lat: st.loc.lat, lon: st.loc.lon, country: st.loc.country } : null,
      marker: st?.marker ?? null,
    };
  }, []);

  const [lens, setLensState] = useState<Lens>(initial.lens);
  const [hour, setHourState] = useState<number>(initial.hour);
  const [nerdOpen, setNerdOpen] = useState<boolean>(initial.nerd);
  const [location, setLocation] = useState<Location | null>(initial.loc);
  const [marker, setMarker] = useState<AtmosphereMarker | null>(initial.marker);

  const setLens = (l: Lens) => {
    setLensState(l);
    try { localStorage.setItem(LENS_KEY, l); } catch { /* ignore */ }
  };
  const setHour = (h: number) => setHourState(clampHour(h));

  // Mirror state into the URL hash (shareable permalink). Sole writer.
  const restoredRef = useRef(false);
  useEffect(() => {
    // Skip the very first run so an unrelated hash isn't clobbered before mount
    // settles; from then on the atmosphere state owns the hash while mounted.
    if (!restoredRef.current) { restoredRef.current = true; }
    const hash = encodeState({
      loc: location ? { lat: location.lat, lon: location.lon, name: location.name, country: location.country } : null,
      hour, lens, nerd: nerdOpen, marker,
    });
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }, [location, hour, lens, nerdOpen, marker]);

  // When the location changes, reset the marker to the new location.
  const locKey = location ? `${location.lat},${location.lon}` : null;
  const prevLocKeyRef = useRef(locKey);
  useEffect(() => {
    if (prevLocKeyRef.current === locKey) return;
    prevLocKeyRef.current = locKey;
    setMarker(location ? { lat: location.lat, lon: location.lon } : null);
  }, [locKey, location]);

  const value: AtmosphereContextValue = {
    lens, setLens, hour, setHour, nerdOpen, setNerdOpen, location, setLocation, marker, setMarker,
  };
  return <AtmosphereContext.Provider value={value}>{children}</AtmosphereContext.Provider>;
}

export function useAtmosphere(): AtmosphereContextValue {
  const ctx = useContext(AtmosphereContext);
  if (!ctx) throw new Error('useAtmosphere must be used within AtmosphereProvider');
  return ctx;
}
