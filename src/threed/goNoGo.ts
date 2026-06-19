/**
 * 3D-Wetter · Go/No-Go-Schwellenwert-Auswertung (Epic E, US-E1/E2/E3/E4, pur).
 *
 * Für B2B (Drohne/Kran/Event): aus dem vorbereiteten Schnitt + einer Arbeits-/
 * Flughöhe (m AGL) + einem Böen-Grenzwert wird über die Zeit geprüft, ob die
 * prognostizierte Böe auf dieser Höhe den Grenzwert überschreitet → eindeutiger
 * Go/No-Go-Status mit Zeitfenster. Plus Höhenfaktor (Boden → Arbeitshöhe).
 *
 * Reine Logik, headless testbar; nutzt `windAtAGL` (Grenzschicht-Profil).
 */

import { windAtAGL, DEFAULT_ALPHA } from './crossSection';
import type { PreparedSection, TimeSample } from './buildCrossSection';
import { sampleAnchorAt } from './buildCrossSection';

export interface GoNoGoConfig {
  /** Arbeits-/Flughöhe über Grund (m AGL). */
  heightAglM: number;
  /** Böen-Grenzwert (km/h). */
  gustLimitKmh: number;
}

export interface GoNoGoWindow { startMs: number; endMs: number; maxGustKmh: number }

export interface GoNoGoResult {
  status: 'go' | 'no-go';
  /** Böe auf Arbeitshöhe JETZT (erstes Zeitsample). */
  gustNowKmh: number;
  /** Höchste Böe auf Arbeitshöhe im Zeitfenster. */
  peakGustKmh: number;
  /** No-Go-Fenster (Grenzwert überschritten). */
  noGoWindows: GoNoGoWindow[];
  /** Höhenfaktor: Böe(Arbeitshöhe) / Böe(Boden ~10 m). */
  heightFactor: number;
  groundGustKmh: number;
  heightGustKmh: number;
}

/** Repräsentativen Anker wählen (höchstes Gelände = exponierteste Lage). */
function referenceAnchor(prepared: PreparedSection) {
  return prepared.anchors.reduce((a, b) => (b.elevM > a.elevM ? b : a), prepared.anchors[0]);
}

/** Böe auf Arbeitshöhe zu einem Zeitpunkt am Referenz-Anker. */
export function gustAtHeight(prepared: PreparedSection, tMs: number, heightAglM: number, alpha = DEFAULT_ALPHA): number {
  const a = sampleAnchorAt(referenceAnchor(prepared), tMs);
  return windAtAGL(a.gustKmh, heightAglM, alpha);
}

/** Wertet Go/No-Go über das vorbereitete Zeitfenster aus (15-Min-Raster). */
export function evaluateGoNoGo(prepared: PreparedSection, cfg: GoNoGoConfig): GoNoGoResult {
  const STEP = 15 * 60_000;
  const alpha = DEFAULT_ALPHA;
  const ref = referenceAnchor(prepared);

  let peakGust = 0;
  const windows: GoNoGoWindow[] = [];
  let cur: GoNoGoWindow | null = null;
  let gustNow = 0;
  let first = true;

  for (let t = prepared.startMs; t <= prepared.endMs; t += STEP) {
    const a = sampleAnchorAt(ref, t);
    const g = windAtAGL(a.gustKmh, cfg.heightAglM, alpha);
    if (first) { gustNow = g; first = false; }
    if (g > peakGust) peakGust = g;
    if (g > cfg.gustLimitKmh) {
      if (!cur) cur = { startMs: t, endMs: t, maxGustKmh: g };
      else { cur.endMs = t; cur.maxGustKmh = Math.max(cur.maxGustKmh, g); }
    } else if (cur) { windows.push(cur); cur = null; }
  }
  if (cur) windows.push(cur);

  // Höhenfaktor (US-E4): Boden (~10 m) vs Arbeitshöhe, „jetzt".
  const aNow = sampleAnchorAt(ref, prepared.startMs);
  const groundGust = windAtAGL(aNow.gustKmh, 10, alpha);
  const heightGust = windAtAGL(aNow.gustKmh, cfg.heightAglM, alpha);

  return {
    status: gustNow > cfg.gustLimitKmh ? 'no-go' : 'go',
    gustNowKmh: gustNow,
    peakGustKmh: peakGust,
    noGoWindows: windows,
    heightFactor: groundGust > 0 ? heightGust / groundGust : 1,
    groundGustKmh: groundGust,
    heightGustKmh: heightGust,
  };
}

// --- Persistenz (US-E2) ------------------------------------------------------

const LS = 'buscosun.threed.gonogo.v1';
export const DEFAULT_GONOGO: GoNoGoConfig = { heightAglM: 120, gustLimitKmh: 40 };

export function loadGoNoGo(): GoNoGoConfig {
  try { const raw = localStorage.getItem(LS); if (raw) return { ...DEFAULT_GONOGO, ...JSON.parse(raw) }; } catch { /* ignore */ }
  return DEFAULT_GONOGO;
}
export function saveGoNoGo(c: GoNoGoConfig): void { try { localStorage.setItem(LS, JSON.stringify(c)); } catch { /* ignore */ } }

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface GngCheck { case: string; ok: boolean; detail: string }

function mkPrepared(gustSeriesKmh: number[]): PreparedSection {
  const now = 1_700_000_000_000, STEP = 15 * 60_000;
  const hours: TimeSample[] = gustSeriesKmh.map((g, i) => ({ tMs: now + i * STEP, windKmh: g * 0.7, windDirDeg: 270, gustKmh: g, tempC: 5, cloudPct: 20, humidityPct: 60, cloudLowPct: 0, cloudMidPct: 0, cloudHighPct: 0 }));
  return {
    columns: [], points: [],
    anchors: [{ distanceM: 0, lat: 47, lon: 11, elevM: 1500, hours }],
    startMs: now, endMs: now + (gustSeriesKmh.length - 1) * STEP, runAtMs: now,
  };
}

export function verifyGoNoGo(): { checks: GngCheck[]; passed: number; failed: number } {
  const checks: GngCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });

  // Surface gust 10 km/h → an 120 m AGL via Profil deutlich höher.
  const g120 = gustAtHeight(mkPrepared([10, 10]), 1_700_000_000_000, 120);
  add('Böe nimmt mit Höhe zu', g120 > 10, g120.toFixed(0));

  // Grenzwert 40, Bodenböe niedrig → an Höhe evtl. > 40. Wir steuern via hoher Bodenböe.
  const calm = evaluateGoNoGo(mkPrepared([8, 8, 8, 8]), { heightAglM: 120, gustLimitKmh: 40 });
  add('Go bei schwachem Wind', calm.status === 'go', `${calm.gustNowKmh.toFixed(0)} km/h`);
  add('keine No-Go-Fenster (calm)', calm.noGoWindows.length === 0);

  const stormy = evaluateGoNoGo(mkPrepared([40, 40, 40]), { heightAglM: 120, gustLimitKmh: 40 });
  add('No-Go bei starkem Wind', stormy.status === 'no-go', `${stormy.gustNowKmh.toFixed(0)} km/h`);
  add('No-Go-Fenster erkannt', stormy.noGoWindows.length >= 1);

  // Fenster nur in der windigen Phase.
  const mixed = evaluateGoNoGo(mkPrepared([10, 10, 45, 45, 10, 10]), { heightAglM: 10, gustLimitKmh: 40 });
  add('No-Go-Fenster begrenzt', mixed.noGoWindows.length === 1 && mixed.status === 'go', `${mixed.noGoWindows.length} Fenster`);

  // Höhenfaktor > 1.
  add('Höhenfaktor > 1', calm.heightFactor > 1, calm.heightFactor.toFixed(2));

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyGoNoGo: typeof verifyGoNoGo }).__verifyGoNoGo = verifyGoNoGo;
}
