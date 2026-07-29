/**
 * precipSource.ts — die EINE, reine Entscheidungsstelle für die Niederschlags-
 * Ansicht „Niederschlag · jetzt–2 h" (Konsolidierungs-Phase N1).
 *
 * ENTSCHEIDUNG Jan (2026-07-24, Revision): Die Ansicht zeigt NUR die gemessene
 * Radar-/Nowcast-Hälfte, per Land bis zum jeweiligen Nowcast-Horizont
 * (DE ≤2 h RADOLAN-RV · AT ≤3 h GeoSphere INCA · CH ≤0,5 h MeteoSchweiz rzc).
 * Die Modell-/Fusionshälfte (2–12 h, ICON-D2/Fusion) ist bewusst **draußen** —
 * kürzer und ehrlicher (gemessenes Radar statt Modell-Extrapolation).
 *
 * Dieses Modul kapselt die zuvor über `precipFrameReady` + Sichtbarkeits-Booleans
 * in `MapView.tsx` VERSTREUTE Quellenwahl an einer testbaren, reinen Stelle:
 *   1. `resolvePrecipSource` — führt Land+Stunde auf die Radar-Quelle zurück und
 *      sagt, ob ein Frame verfügbar ist (`ready`). Jenseits des Land-Horizonts
 *      `ready:false` → der Layer blendet aus (kein Modell mehr).
 *   2. `precipCompositeReady` — DACH-Sicht: sichtbar, sobald IRGENDEIN Landesradar
 *      die Stunde in seinem Horizont führt (das OR über DE/AT/CH). Ersetzt das alte
 *      `precipFrameReady` (dessen ICON-D2-Zweig entfällt).
 *   3. `precipRadarHorizonHours` — der maximale Radar-Horizont der geladenen
 *      Quellen (für die Slider-Obergrenze, wenn Niederschlag der Treiber ist).
 *
 * Reine Logik: KEINE Imports von maplibre/WebGL/Loadern → headless importierbar
 * (`scripts/verify-precip-source.mjs`, Node --experimental-strip-types).
 */

import type { Country } from '../types';

/** Nur noch gemessenes Radar/Nowcast — die Modellhälfte ist entfallen (Jan 2026-07-24). */
export type PrecipSourceKind = 'radar';

/** Welche Landesradar-Frames sind gerade geladen? (Aus den MapView-Refs abgeleitet.) */
export interface PrecipAvailability {
  radarDE: boolean; // RADOLAN-RV
  radarAT: boolean; // GeoSphere INCA
  radarCH: boolean; // MeteoSchweiz rzc
}

export interface PrecipResolution {
  /** Immer 'radar' — die Ansicht ist rein gemessenes Radar/Nowcast. */
  kind: PrecipSourceKind;
  /** Ist für diese Stunde im Land ein Radar-Frame verfügbar? Jenseits des
   *  Land-Horizonts `false` (Layer blendet aus, keine Modell-Verlängerung). */
  ready: boolean;
}

/** Radar-/Nowcast-Horizont je Land (Stunden). Deckungsgleich mit
 *  `precipComposite.ts` (RV_MAX_H/INCA_MAX_H/RZC_MAX_H). Jenseits davon: nichts. */
export const RADAR_HORIZON_H: Record<Country, number> = {
  DE: 2,   // RADOLAN-RV (0–120 min)
  AT: 3,   // GeoSphere INCA (0.25 … 3.0 h)
  CH: 0.5, // MeteoSchweiz rzc (nur „jetzt")
};

/** Numerische Toleranz an der Horizont-Grenze (spiegelt das `+1e-6`/`h < RZC_MAX_H`
 *  in `precipComposite`: DE/AT inklusive, CH strikt). */
const EPS = 1e-6;

function radarLoaded(country: Country, avail: PrecipAvailability): boolean {
  return country === 'AT' ? avail.radarAT : country === 'CH' ? avail.radarCH : avail.radarDE;
}

/** Liegt die Stunde im Radar-Fenster des Landes? Grenz-Inklusivität exakt wie im
 *  Kompositor: DE/AT `hour ≤ horizon (+ε)`, CH strikt `hour < 0.5`. */
function inRadarWindow(hour: number, country: Country): boolean {
  const horizon = RADAR_HORIZON_H[country];
  return country === 'CH' ? hour < horizon : hour <= horizon + EPS;
}

/**
 * EINZIGE Stelle, die entscheidet, ob die gegebene Slider-Stunde in `country` von
 * dessen Radar/Nowcast gespeist wird. Im Land-Horizont → verfügbar; jenseits →
 * `ready:false` (keine Modellverlängerung mehr).
 */
export function resolvePrecipSource(
  hour: number,
  country: Country,
  avail: PrecipAvailability,
): PrecipResolution {
  return { kind: 'radar', ready: inRadarWindow(hour, country) && radarLoaded(country, avail) };
}

/**
 * DACH-Komposit-Verfügbarkeit für die Sichtbarkeit: sichtbar, sobald IRGENDEIN
 * Landesradar die Stunde in seinem Horizont führt. Ersetzt das alte
 * `precipFrameReady` (ohne dessen ICON-D2-Modellzweig).
 */
export function precipCompositeReady(hour: number, avail: PrecipAvailability): boolean {
  return (['DE', 'AT', 'CH'] as const).some((c) => resolvePrecipSource(hour, c, avail).ready);
}

/**
 * Maximaler Radar-Horizont der geladenen Quellen (h) — die Niederschlags-
 * Slider-Obergrenze, wenn Niederschlag der Treiber ist. RADOLAN 2 / INCA 3 /
 * rzc 0,5. 0, wenn kein Landesradar geladen ist.
 */
export function precipRadarHorizonHours(avail: PrecipAvailability): number {
  let h = 0;
  if (avail.radarDE) h = Math.max(h, RADAR_HORIZON_H.DE);
  if (avail.radarAT) h = Math.max(h, RADAR_HORIZON_H.AT);
  if (avail.radarCH) h = Math.max(h, RADAR_HORIZON_H.CH);
  return h;
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (Harness-Hook). Deckt: Radar-Fenster + Grenzen (DE 2 / AT 3
// inkl., CH 0,5 strikt), KEINE Modellverlängerung jenseits des Horizonts,
// DACH-OR-Sichtbarkeit, Slider-Horizont. Aufgerufen aus verify-precip-source.mjs.
// ---------------------------------------------------------------------------
export interface PrecipCheck { name: string; ok: boolean; detail?: string }
export interface PrecipVerifyResult { checks: PrecipCheck[]; passed: number; failed: number }

export function verifyPrecipSource(): PrecipVerifyResult {
  const checks: PrecipCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const full: PrecipAvailability = { radarDE: true, radarAT: true, radarCH: true };
  const deOnly: PrecipAvailability = { radarDE: true, radarAT: false, radarCH: false };
  const atOnly: PrecipAvailability = { radarDE: false, radarAT: true, radarCH: false };
  const chOnly: PrecipAvailability = { radarDE: false, radarAT: false, radarCH: false };
  const empty: PrecipAvailability = { radarDE: false, radarAT: false, radarCH: false };

  // (1) Immer 'radar' — keine Modellhälfte mehr.
  add('kind ist immer radar (0 h)', resolvePrecipSource(0, 'DE', full).kind === 'radar');
  add('kind ist immer radar (6 h)', resolvePrecipSource(6, 'DE', full).kind === 'radar');

  // (2) DE-Fenster: ≤2 h verfügbar, >2 h NICHT (keine Modellverlängerung).
  add('DE 0 h ready', resolvePrecipSource(0, 'DE', full).ready === true);
  add('DE 2 h ready (Grenze inkl.)', resolvePrecipSource(2, 'DE', full).ready === true);
  add('DE 2.5 h NICHT ready (Modell raus)', resolvePrecipSource(2.5, 'DE', full).ready === false);
  add('DE 6 h NICHT ready', resolvePrecipSource(6, 'DE', full).ready === false);
  add('DE 12 h NICHT ready', resolvePrecipSource(12, 'DE', full).ready === false);

  // (3) Per-Land-Horizonte: AT bis 3 h, CH nur < 0,5 h (strikt).
  add('AT 3 h ready', resolvePrecipSource(3, 'AT', full).ready === true);
  add('AT 3.5 h NICHT ready', resolvePrecipSource(3.5, 'AT', full).ready === false);
  add('CH 0.4 h ready', resolvePrecipSource(0.4, 'CH', full).ready === true);
  add('CH 0.5 h NICHT ready (strikt)', resolvePrecipSource(0.5, 'CH', full).ready === false);
  add('CH 1 h NICHT ready', resolvePrecipSource(1, 'CH', full).ready === false);

  // (4) Ohne Landesradar → nichts verfügbar (nie leerer Crash).
  add('DE ohne Radar 0 h NICHT ready', resolvePrecipSource(0, 'DE', chOnly).ready === false);
  add('leer: 1 h nichts geladen → NICHT ready', resolvePrecipSource(1, 'DE', empty).ready === false);

  // (5) DACH-OR-Sichtbarkeit: bei 2.5 h nur AT (INCA) → Komposit sichtbar; 3.5 h keiner.
  add('Komposit 0 h sichtbar (full)', precipCompositeReady(0, full) === true);
  add('Komposit 2.5 h sichtbar (AT INCA führt)', precipCompositeReady(2.5, full) === true);
  add('Komposit 3.5 h NICHT sichtbar (alle jenseits Horizont)', precipCompositeReady(3.5, full) === false);
  add('Komposit 2.5 h NUR DE geladen → NICHT sichtbar', precipCompositeReady(2.5, deOnly) === false);

  // (6) Slider-Horizont = max geladener Radar-Horizont.
  add('Slider-Horizont full = 3 (INCA)', precipRadarHorizonHours(full) === 3);
  add('Slider-Horizont DE-only = 2', precipRadarHorizonHours(deOnly) === 2);
  add('Slider-Horizont AT-only = 3', precipRadarHorizonHours(atOnly) === 3);
  add('Slider-Horizont leer = 0', precipRadarHorizonHours(empty) === 0);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}
