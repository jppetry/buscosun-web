/**
 * Die EINE Navigations-API der App (ersetzt `setView` aus App.tsx).
 *
 * Feature-Wechsel = `pushState` (Zurück führt zum vorherigen Werkzeug). Die
 * Seiten behalten ihre Props `onBack`/`onOpenFeature`/`onSelect` — die
 * Route-Wrapper verdrahten sie hier, die Seiten wissen nichts vom Router.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { Location } from '../types';
import { pathForFeature } from './routes';
import { mapPathForPlace } from './urlState';
// SH1: Der Ort wird als lesbarer Slug in den Pfad geschrieben. Die Tabelle liegt
// hier richtig — `useAppNav` wird ausschließlich aus den LAZY Seiten-Wrappern
// importiert, der Start-Chunk bleibt unberührt (`src/share/placeTable.ts`).
import { slugForPlace } from '../share/placeTable';

export interface AppNav {
  goHome: () => void;
  /** FeatureId / RailFeature (String) oder ein FeatureInfo-Objekt der Startseite. */
  openFeature: (f: string | { id: string }) => void;
  /** Ortssuche: Wetterkarte am Ort (Marker + Punktpanel, Kamera = DACH-Fit). */
  selectLocation: (loc: Location) => void;
}

export function useAppNav(): AppNav {
  const navigate = useNavigate();
  return useMemo<AppNav>(() => ({
    goHome: () => { void navigate('/'); },
    openFeature: (f) => { void navigate(pathForFeature(typeof f === 'string' ? f : f.id)); },
    selectLocation: (loc) => { void navigate(mapPathForPlace(loc, undefined, slugForPlace(loc))); },
  }), [navigate]);
}
