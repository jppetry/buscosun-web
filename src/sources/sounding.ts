/**
 * Vertikal-Sounding am Punkt — EIN Einstieg mit Rückfall (Phase SG,
 * `audit/atmo-sounding-guard.md`).
 *
 * Der DWD beendet am 30.11.2026 das alte URL-Schema `/weather/nwp/icon-eu/grib/`
 * (`SCHEDULED_CHANGES` in `src/point/sourceMatrix.ts`, V-EX-4). `iconEuSounding`
 * liest genau dort; ohne Absicherung zeigten Emagramm, Föhn, Thermik und das
 * 3D-Sounding-Panel ab dem Stichtag nur noch einen Fehler.
 *
 * Regeln (alle im Verifier `scripts/verify-sounding-guard.mjs` belegt):
 *   1. Vor dem Stichtag zuerst ICON-EU; ist es „nicht da" (kein Lauf, zu wenige
 *      Niveaus, 404/410), kommt das Profil aus GFS — mit sichtbarer Notiz.
 *   2. Ab dem Stichtag direkt GFS: null Anfragen an den alten Baum.
 *   3. Ein Abbruch (AbortError) ist kein Ausfall: er wird weitergeworfen, nie
 *      als „ICON-EU fehlt" gewertet (CLAUDE.md: `AbortError` ≠ absent).
 *   4. Nach einem „kein Lauf gefunden" wird ICON-EU 30 min übersprungen
 *      (Modul-Memo) — keine 8 HEAD-Proben je Markerbewegung.
 *   5. Beide Quellen weg ⇒ EIN Fehler, der beide nennt.
 *   6. Die Scrubber-Stunde meint „jetzt + h"; beide Quellen rechnen ihren
 *      eigenen Schritt aus dieser Zielzeit (nicht aus dem Laufbeginn).
 *   7. `?snd=gfs` erzwingt den GFS-Pfad (so sieht Jan den Zustand nach dem
 *      30.11. heute); `?snd=icon-eu` erzwingt ICON-EU ohne Rückfall.
 *
 * Keine Meteorologie hier — die liegt unverändert in den beiden Quellen und in
 * `threed/soundingMath.ts`.
 */

import {
  fetchSoundingAtPoint as fetchIconEuSounding,
  SoundingUnavailableError,
  ICON_EU_SOUNDING_ATTRIBUTION,
  type SoundingProfile,
} from './iconEuSounding';
import { fetchSoundingAtPoint as fetchGfsSounding, GFS_SOUNDING_ATTRIBUTION } from './gfsSounding';

export type SoundingSource = 'icon-eu' | 'gfs';

export interface SoundingResult {
  profile: SoundingProfile;
  source: SoundingSource;
  /** Sichtbarer Hinweis, wenn das Profil nicht aus der ersten Wahl kommt. */
  note?: string;
}

/** Stichtag des DWD (00:00 UTC): altes URL-Schema endet — `SCHEDULED_CHANGES` 2026-11-30 (V-EX-4). */
export const ICON_EU_OLD_TREE_END_MS = Date.UTC(2026, 10, 30, 0, 0, 0);
/** Nach „kein Lauf gefunden" wird ICON-EU so lange übersprungen. */
export const ICON_EU_ABSENT_MEMO_MS = 30 * 60_000;

export const SOUNDING_FALLBACK_NOTE = 'ICON-EU nicht verfügbar — Rückfall auf GFS';
export const SOUNDING_RETIRED_NOTE = 'ICON-EU-Druckflächen (altes DWD-Schema) seit 30.11.2026 abgeschaltet — Profil aus GFS';
export const SOUNDING_FORCED_GFS_NOTE = 'Testschalter ?snd=gfs — Profil aus GFS';

/** Beschriftung je Quelle — die EINE Stelle, aus der die UI den Modellnamen nimmt. */
export const SOUNDING_SOURCE_LABEL: Record<SoundingSource, {
  /** Kurzname („ICON-EU"). */
  name: string;
  /** Gitterweite in Worten („~7 km"). */
  grid: string;
  /** Quellenzeile unter dem Profil („ICON-EU (~7 km, Druckflächen)"). */
  short: string;
  /** Richtwert-Klammer im 3D-Panel. */
  caveat: string;
  /** Attribution mit Link (HTML). */
  attribution: string;
}> = {
  'icon-eu': {
    name: 'ICON-EU', grid: '~7 km',
    short: 'ICON-EU (~7 km, Druckflächen)',
    caveat: 'ICON-EU ~7 km, Standard-Druckflächen',
    attribution: ICON_EU_SOUNDING_ATTRIBUTION,
  },
  gfs: {
    name: 'GFS', grid: '~25 km',
    short: 'GFS (~25 km, Druckflächen)',
    caveat: 'GFS ~25 km, Standard-Druckflächen',
    attribution: GFS_SOUNDING_ATTRIBUTION,
  },
};

/** Modellname für Fließtext; ohne geladenes Profil neutral „Modell". */
export function soundingSourceName(source: SoundingSource | null | undefined): string {
  return source ? SOUNDING_SOURCE_LABEL[source].name : 'Modell';
}

/** Signatur beider Quellen (`fetchSoundingAtPoint`). */
export type SoundingFetcher = typeof fetchIconEuSounding;

export interface SoundingGuardOptions {
  /** Uhr (ms) — Verifier; Standard `Date.now()`. */
  nowMs?: number;
  /** Query-String (`?snd=…`) — Verifier; Standard `window.location.search`. */
  search?: string;
  /** Quellen austauschen (Verifier: Fixtures in `SoundingProfile`-Form); Standard die echten Module. */
  sources?: { iconEu?: SoundingFetcher; gfs?: SoundingFetcher };
}

/** `?snd=gfs` | `?snd=icon-eu` — sonst `null` (Regelpfad). */
export function soundingSourceOverride(search: string): SoundingSource | null {
  try {
    const v = new URLSearchParams(search).get('snd');
    return v === 'gfs' || v === 'icon-eu' ? v : null;
  } catch { return null; }
}

function currentSearch(): string {
  try { return typeof window === 'undefined' ? '' : window.location.search; } catch { return ''; }
}

const HOUR_MS = 3_600_000;

/** Zielzeit der Scrubber-Stunde: volle Stunde nächst „jetzt" + h. */
export function soundingTargetMs(nowMs: number, hour: number): number {
  const h = Number.isFinite(hour) ? Math.max(0, Math.round(hour)) : 0;
  return Math.round(nowMs / HOUR_MS) * HOUR_MS + h * HOUR_MS;
}

export function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return err instanceof Error && err.name === 'AbortError';
}

/** „Nicht da": typisierter Fehler der Quelle oder ein HTTP 404/410 im Fehlertext. */
function isAbsent(err: unknown): boolean {
  if (err instanceof SoundingUnavailableError) return true;
  return err instanceof Error && /\b(404|410)\b/.test(err.message);
}

const msg = (err: unknown) => (err instanceof Error ? err.message : String(err));

let iconEuAbsentUntil = 0;

/** Memo zurücksetzen (Verifier, Tests). */
export function resetSoundingGuard(): void { iconEuAbsentUntil = 0; }

/**
 * Profil für Marker und Scrubber-Stunde — ICON-EU zuerst, GFS als Rückfall.
 * Signatur der Quellen (+ Optionen): `hour` ist „jetzt + h" wie im Store.
 */
export async function fetchSoundingWithFallback(
  lat: number, lon: number, surfaceM = 0, hour = 0, signal?: AbortSignal,
  opts: SoundingGuardOptions = {},
): Promise<SoundingResult> {
  const nowMs = opts.nowMs ?? Date.now();
  const fetchIconEu = opts.sources?.iconEu ?? fetchIconEuSounding;
  const fetchGfs = opts.sources?.gfs ?? fetchGfsSounding;
  const override = soundingSourceOverride(opts.search ?? currentSearch());
  const targetMs = soundingTargetMs(nowMs, hour);
  const retired = nowMs >= ICON_EU_OLD_TREE_END_MS;
  const memoActive = nowMs < iconEuAbsentUntil;

  let iconEuWhy: string | null = null;
  if (override === 'gfs') iconEuWhy = 'übersprungen (?snd=gfs)';
  else if (retired) iconEuWhy = 'altes DWD-Schema seit 30.11.2026 abgeschaltet';
  else if (memoActive) iconEuWhy = 'zuletzt kein Lauf gefunden (30 min übersprungen)';

  if (iconEuWhy === null) {
    try {
      const profile = await fetchIconEu(lat, lon, surfaceM, hour, signal, targetMs);
      return { profile, source: 'icon-eu' };
    } catch (err) {
      if (isAbortError(err, signal)) throw err;
      if (override === 'icon-eu') throw err;
      if (!isAbsent(err)) throw err;
      if (err instanceof SoundingUnavailableError && err.reason === 'no-run') {
        iconEuAbsentUntil = nowMs + ICON_EU_ABSENT_MEMO_MS;
      }
      iconEuWhy = msg(err);
    }
  }

  try {
    const profile = await fetchGfs(lat, lon, surfaceM, hour, signal, targetMs);
    const note = override === 'gfs' ? SOUNDING_FORCED_GFS_NOTE
      : retired ? SOUNDING_RETIRED_NOTE
      : SOUNDING_FALLBACK_NOTE;
    return { profile, source: 'gfs', note };
  } catch (err) {
    if (isAbortError(err, signal)) throw err;
    throw new Error(`Sounding nicht verfügbar — ICON-EU: ${iconEuWhy}; GFS: ${msg(err)}`);
  }
}
