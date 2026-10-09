/** Phase RC: Zustand der Chance-Karte — nur Typen und der Leerlauf-Zustand (kein Rechencode, s. `chanceMapEngine.ts`). */
import type { ChanceThreshold } from './chanceModel';

export interface ChanceMapInfo {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  threshold: ChanceThreshold;
  /** Gezeigte Stunde [fromMs, toMs) und das Intervall des Schritts, für das die Wahrscheinlichkeit gilt. */
  hourFromMs: number;
  hourToMs: number;
  stepFromMs: number | null;
  stepToMs: number | null;
  /** Slider im Rückblick ⇒ die laufende Stunde (E-RC-4). */
  past: boolean;
  /** Feld: Stufe, Lauf, Stand von buscosun Fusion, mit dem es gebaut wurde. */
  field: { tier: string; run: string; runAtMs: number; fusionName: string | null } | null;
  /** Warum (ein Teil) fehlt. */
  notes: string[];
  stats: { cells: number; missing: number; maxP: number | null } | null;
  /** Güte und Einschränkung der Feld-Chance aus `CHANCE_DEFINITION` (Text hängt an der Konstante, nicht an der Oberfläche). */
  definition?: { measured: string; caveat: string };
}

export const CHANCE_MAP_IDLE: ChanceMapInfo = {
  status: 'idle', threshold: 'any', hourFromMs: 0, hourToMs: 0, stepFromMs: null, stepToMs: null, past: false, field: null, notes: [], stats: null,
};
