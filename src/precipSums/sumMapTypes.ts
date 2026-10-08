/** Phase NS: Zustand der Summen-Karte — nur Typen und der Leerlauf-Zustand (kein Rechencode, s. `sumMapEngine.ts`). */
import type { SumSelection } from './sumModel';

export interface SumGridStats { cells: number; valid: number; radar: number; field: number; saturated: number; gap: number }

export interface SumMapInfo {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  dir: SumSelection['dir'];
  windowH: number;
  nowMs: number;
  /**
   * Erwartet: Radar je Land (Quelle, Lauf, Ende des Nowcasts) und das Kartenfeld (Lauf, Stand von buscosun Fusion).
   * `runAtMs` null, wo der Stack keinen Lauf kennt (INCA: Zeitachse ab dem Abruf, `radarFrames.ts` loadAt).
   */
  radar: Array<{ label: string; runAtMs: number | null; toMs: number }>;
  field: { run: string; runAtMs: number; tier: string; fusionName: string | null }[];
  fieldNotes: string[];
  /** Zellen mit Wert, mit Radar, mit Feld, gesättigt, Lücken. */
  stats: SumGridStats | null;
  /** Gefallen: Stationen mit vollständiger Summe und der jüngste Stempel. */
  stations: number;
  stationsEndMs: number | null;
  stationNote: string | null;
  /**
   * Gefallen, Fläche (Stufe B2/B3): Ende E der amtlichen Summe, je Land Quelle und Zustand; `null` ohne Produkt (dann sagt
   * `measuredNote` warum). `stale`: E liegt mehr als `PAST_SUM_STALE_MS` zurück.
   */
  measured: {
    endMs: number;
    stale: boolean;
    /** DE im gewählten Fenster: RW-Kette bis E oder SF bis E − 10 min (24/48 h). */
    de: { product: 'RW' | 'SF'; endMs: number } | null;
    countries: Array<{ cc: 'DE' | 'AT' | 'CH'; label: string; provider: string; ok: boolean; note?: string }>;
  } | null;
  measuredNote: string | null;
}

export const SUM_MAP_IDLE: SumMapInfo = { status: 'idle', dir: 'past', windowH: 6, nowMs: 0, radar: [], field: [], fieldNotes: [], stats: null, stations: 0, stationsEndMs: null, stationNote: null, measured: null, measuredNote: null };
