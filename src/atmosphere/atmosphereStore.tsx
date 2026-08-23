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
import type { DerivedProfile } from './profile-derivations';
import type { SoundingProfile } from '../sources/iconEuSounding';
import type { SoundingDerived } from '../threed/soundingMath';
import type { GeoPoint } from '../threed/sectionGeometry';
import type { ThreeDLayers } from '../threed/threedState';
import { decodeState as decodeThreeD, hasThreeDHash } from '../threed/threedState';

export type SectionMode = '2d' | '3d' | 'terrain';
const DEFAULT_SECTION_LAYERS: ThreeDLayers = { mean: true, gust: false, shear: false, inversion: false, cloudBase: false, cloudLayers: false, streamlines: false, foehn: false, temp: false };

/** Rohes Sounding + Thermodynamik für den Nerd-Mode (Tiefe 3). */
export interface SoundingBundle { profile: SoundingProfile; derived: SoundingDerived }

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
  /** Reference run of the loaded model data — anchors the scrubber's valid time. */
  modelRunAt: Date | null;
  setModelRunAt: (d: Date | null) => void;
  /** Derived vertical profile for the active marker/hour — shared by profile + verdict. */
  profile: DerivedProfile | null;
  setProfile: (p: DerivedProfile | null) => void;
  /** Raw sounding + thermodynamics for the lazy Nerd-Mode (depth 3). */
  sounding: SoundingBundle | null;
  setSounding: (s: SoundingBundle | null) => void;
  /** Section lens: user-drawn cut line, layers and sub-mode (reused threed view). */
  cutPoints: GeoPoint[];
  setCutPoints: (p: GeoPoint[]) => void;
  sectionLayers: ThreeDLayers;
  setSectionLayers: (l: ThreeDLayers) => void;
  sectionMode: SectionMode;
  setSectionMode: (m: SectionMode) => void;
}

const AtmosphereContext = createContext<AtmosphereContextValue | null>(null);

function readLensFromStorage(): Lens | null {
  try {
    const v = localStorage.getItem(LENS_KEY);
    return v && (LENSES as string[]).includes(v) ? (v as Lens) : null;
  } catch { return null; }
}

interface ProviderProps {
  children: ReactNode;
  /** Router (RT1): Linse aus dem Pfad — nach dem Hash, vor localStorage. */
  initialLens?: Lens | null;
  /** Linse von außen (nur Zurück/Vorwärts). */
  routeLens?: Lens | null;
  /** Linse ⇒ Pfad (erster Lauf = replace, danach push). */
  onLensChange?: (lens: Lens, initial: boolean) => void;
}

export function AtmosphereProvider({ children, initialLens, routeLens, onLensChange }: ProviderProps) {
  // Initial state: hash wins; else the route's lens; else last lens from
  // localStorage; else first-time default lens = "Föhn" (mountain) — the
  // broadest everyday lens.
  const initial = useMemo(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const st = decodeState(hash);
    if (st) {
      const loc = st.loc ? { name: st.loc.name, lat: st.loc.lat, lon: st.loc.lon, country: st.loc.country } : null;
      return { lens: st.lens, hour: st.hour, nerd: st.nerd, loc,
        marker: st.marker ?? (loc ? { lat: loc.lat, lon: loc.lon } : null), cut: st.cut };
    }
    // Migration: alter threed-Permalink (#3d=) → Schnitt-Linse mit Ort + Schnittlinie.
    const td = hasThreeDHash(hash) ? decodeThreeD(hash) : null;
    if (td) {
      const loc = td.loc ? { name: td.loc.name, lat: td.loc.lat, lon: td.loc.lon, country: td.loc.country } : null;
      return { lens: 'section' as Lens, hour: 0, nerd: false, loc,
        marker: loc ? { lat: loc.lat, lon: loc.lon } : null, cut: td.points };
    }
    return { lens: initialLens ?? readLensFromStorage() ?? 'mountain', hour: 0, nerd: false, loc: null, marker: null, cut: [] as GeoPoint[] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [lens, setLensState] = useState<Lens>(initial.lens);
  const [hour, setHourState] = useState<number>(initial.hour);
  const [nerdOpen, setNerdOpen] = useState<boolean>(initial.nerd);
  const [location, setLocation] = useState<Location | null>(initial.loc);
  const [marker, setMarker] = useState<AtmosphereMarker | null>(initial.marker);
  const [modelRunAt, setModelRunAt] = useState<Date | null>(null);
  const [profile, setProfile] = useState<DerivedProfile | null>(null);
  const [sounding, setSounding] = useState<SoundingBundle | null>(null);
  const [cutPoints, setCutPoints] = useState<GeoPoint[]>(initial.cut);
  const [sectionLayers, setSectionLayers] = useState<ThreeDLayers>(DEFAULT_SECTION_LAYERS);
  const [sectionMode, setSectionMode] = useState<SectionMode>('2d');

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
      hour, lens, nerd: nerdOpen, marker, cut: cutPoints,
    });
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }, [location, hour, lens, nerdOpen, marker, cutPoints]);

  // Router (RT1): Linse ⇒ Pfad `/atmosphaere/<lens>` (nach dem Hash-Schreiber,
  // damit der Wrapper den frischen Hash mitnimmt); Zurück/Vorwärts ⇒ Linse aus dem Pfad.
  const lensReportedRef = useRef(false);
  const onLensChangeRef = useRef(onLensChange);
  onLensChangeRef.current = onLensChange;
  useEffect(() => {
    onLensChangeRef.current?.(lens, !lensReportedRef.current);
    lensReportedRef.current = true;
  }, [lens]);
  useEffect(() => {
    if (routeLens && routeLens !== lens) setLensState(routeLens);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeLens]);

  // When the location changes, reset the marker to the new location.
  const locKey = location ? `${location.lat},${location.lon}` : null;
  const prevLocKeyRef = useRef(locKey);
  useEffect(() => {
    if (prevLocKeyRef.current === locKey) return;
    prevLocKeyRef.current = locKey;
    setMarker(location ? { lat: location.lat, lon: location.lon } : null);
    setCutPoints([]); // neue Lage → Schnittlinie verwerfen
  }, [locKey, location]);

  const value: AtmosphereContextValue = {
    lens, setLens, hour, setHour, nerdOpen, setNerdOpen, location, setLocation, marker, setMarker,
    modelRunAt, setModelRunAt, profile, setProfile, sounding, setSounding,
    cutPoints, setCutPoints, sectionLayers, setSectionLayers, sectionMode, setSectionMode,
  };
  return <AtmosphereContext.Provider value={value}>{children}</AtmosphereContext.Provider>;
}

export function useAtmosphere(): AtmosphereContextValue {
  const ctx = useContext(AtmosphereContext);
  if (!ctx) throw new Error('useAtmosphere must be used within AtmosphereProvider');
  return ctx;
}
