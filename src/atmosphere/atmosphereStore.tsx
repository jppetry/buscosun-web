/**
 * Atmosphäre · shared state store (the single source of truth).
 *
 * The Time-Scrubber drives `activeHour`; every child subscribes to it via
 * useAtmosphere(). Lens + depth (Nerd) + location + marker live here too; the
 * last lens is remembered in localStorage. The app has no global store, so this
 * provider is scoped to the Atmosphäre feature only.
 *
 * ── SH3: der Store schreibt die URL NICHT mehr selbst ────────────────────────
 * Bis 2026-09-08 spiegelte er seinen Zustand in das Fragment `#atm=`. Das ist
 * entfallen: ein Fragment erreicht den Server nie, also kann daraus kein
 * Vorschaubild und kein `og:title` entstehen (`audit/teilen-share.md` §1.2).
 * Der Zustand geht jetzt per `onUrlState` an den Router-Wrapper, und der ist
 * der EINZIGE Schreiber von Pfad und Query — dasselbe Muster wie
 * `WetterkarteRoute` (RT1). Der Codec `atmosphereState.ts` bleibt als LESER
 * für Alt-Links erhalten; den Umzug erledigt der Wrapper beim Ankommen.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Location } from '../types';
import {
  clampHour, LENSES, type Lens, type AtmosphereMarker,
} from './atmosphereState';
import { hourFromValidAt, validAtFromHour, type AtmosphereUrlState } from './atmosphereUrl';
import type { DerivedProfile } from './profile-derivations';
import type { SoundingProfile } from '../sources/iconEuSounding';
import type { SoundingDerived } from '../threed/soundingMath';
import type { GeoPoint } from '../threed/sectionGeometry';
import type { ThreeDLayers } from '../threed/threedState';

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
  /** Router (RT1): Linse aus dem Pfad — vor localStorage. */
  initialLens?: Lens | null;
  /** Linse von außen (nur Zurück/Vorwärts). */
  routeLens?: Lens | null;
  /** Linse ⇒ Pfad (erster Lauf = replace, danach push). */
  onLensChange?: (lens: Lens, initial: boolean) => void;
  /**
   * SH3: Anfangszustand aus Pfad + Query (der Wrapper hat ihn schon geparst und
   * einen Alt-Link `#atm=`/`#3d=` bereits umgeschrieben). `null` ⇒ Standard.
   */
  initialUrl?: AtmosphereUrlState | null;
  /** SH3: Zustandsänderung ⇒ der Wrapper schreibt die URL. */
  onUrlState?: (s: AtmosphereUrlState) => void;
  /** Bezugszeit für die Umrechnung absolute Zeit ⇄ Scrubber-Stunde. */
  nowMs?: number;
}

export function AtmosphereProvider({ children, initialLens, routeLens, onLensChange, initialUrl, onUrlState, nowMs }: ProviderProps) {
  // SH3: Anfangszustand kommt aus Pfad + Query (der Wrapper hat ihn geparst und
  // einen Alt-Link bereits umgeschrieben). Ohne Ort in der URL entscheidet die
  // Linse: Pfad, sonst localStorage, sonst „Föhn" (mountain) als breiteste Sicht.
  const nowRef = useRef(nowMs ?? Date.now());
  const initial = useMemo(() => {
    const u = initialUrl ?? null;
    const loc = u?.place ?? null;
    return {
      lens: initialLens ?? readLensFromStorage() ?? 'mountain',
      hour: hourFromValidAt(u?.validAtMs ?? null, nowRef.current),
      nerd: !!u?.nerd,
      loc,
      marker: u?.marker ?? (loc ? { lat: loc.lat, lon: loc.lon } : null),
      cut: (u?.cut ?? []) as GeoPoint[],
    };
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

  // SH3: Zustand ⇒ Wrapper (der schreibt Pfad UND Query). Kein zweiter Schreiber.
  const onUrlStateRef = useRef(onUrlState);
  onUrlStateRef.current = onUrlState;
  useEffect(() => {
    onUrlStateRef.current?.({
      place: location,
      validAtMs: validAtFromHour(hour, nowRef.current),
      nerd: nerdOpen,
      marker,
      cut: cutPoints,
    });
  }, [location, hour, nerdOpen, marker, cutPoints]);

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
