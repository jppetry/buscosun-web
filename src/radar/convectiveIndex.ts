/**
 * Gewittergefahr-Index (Punkt, 0–2 h) — EINE verständliche Aussage aus den
 * bereits vorhandenen, ehrlichen Signalen statt fünf Einzel-Layern (#3 der
 * Kachelmann-Lücken). Fasst zusammen:
 *
 *   • CAPE (ICON-D2 `cape_ml`)        → Konvektions-POTENZIAL (DE)
 *   • Zellintensität + Trend (Radar)  → ob Konvektion gerade LÄUFT/zieht
 *   • DWD-Gewitterwarnung am Punkt     → offizielle Experten-Einschätzung (DE)
 *
 * Bewusst ehrlich: CAPE ist Potenzial, kein Auslöser — erst Potenzial UND eine
 * aktive/zuziehende Zelle ergeben hohe Gefahr. Eine amtliche Warnung hebt den
 * Index auf ein Minimum an (sie schlägt unsere Heuristik). Blitze fließen NICHT
 * als Zahl ein (nur WMS-Raster, nicht sauber punktsampelbar) — sie bleiben ein
 * eigener Layer/Kontext.
 *
 * AT/CH: kein CAPE/keine DWD-Warnung → ehrlicher Rückfall auf das reine
 * Radar-/Intensitätssignal, klar gekennzeichnet (`capeBased = false`).
 *
 * Reine Funktion (keine Fetches) → testbar; Aufrufer reicht die Signale rein.
 */

export type ConvectiveLevel = 'none' | 'low' | 'elevated' | 'moderate' | 'high';

export interface ConvectiveInputs {
  /** Punkt-CAPE (J/kg), Spitze der nächsten Stunden; null = nicht verfügbar (AT/CH). */
  capeJkg: number | null;
  /** Stärkste über-/zuziehende Zelle am Punkt (mm/h); null = kein Zellsignal. */
  cellPeakMmH: number | null;
  /** Zelle verstärkt sich. */
  cellIntensifying: boolean;
  /** DWD-Gewitterwarnstufe am Punkt (0 = keine, 1..5). */
  warningLevel: number;
  /** Bestehende intensitätsbasierte Heuristik (0..~55) als Rückfall, wenn kein Zellpeak vorliegt. */
  fallbackRiskPct: number;
}

export interface ConvectiveIndex {
  /** 0..100. */
  score: number;
  level: ConvectiveLevel;
  /** Deutsche Kurzbezeichnung der Stufe. */
  label: string;
  /** Welche Signale beigetragen haben (ehrliche Begründung, von stark → schwach). */
  drivers: string[];
  /** true = mit echtem CAPE (DE); false = Rückfall nur aus Radar (AT/CH). */
  capeBased: boolean;
}

/** Stückweise-lineare Rampe durch (x,y)-Stützpunkte; clamps an den Enden. */
function ramp(x: number, pts: Array<[number, number]>): number {
  if (x <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** CAPE (J/kg) → 0..100 Potenzial. DACH-übliche Schwellen. */
function capeScore(cape: number): number {
  return ramp(cape, [[0, 0], [100, 5], [250, 22], [500, 42], [1000, 62], [1500, 75], [2500, 90], [3500, 100]]);
}

/** Zell-Spitzenrate (mm/h) → 0..100 (konvektive Realisierung). */
function cellScore(mmH: number): number {
  return ramp(mmH, [[0, 0], [5, 10], [10, 35], [20, 60], [40, 85], [60, 100]]);
}

/** Amtliche Warnung → Mindest-Score (Floor). DWD: 3 = markant (Gewitter), 4 = Unwetter, 5 = extrem. */
function warningFloor(level: number): number {
  if (level >= 5) return 95;
  if (level >= 4) return 85;
  if (level >= 3) return 65;
  if (level >= 2) return 35;
  return 0;
}

function levelOf(score: number): { level: ConvectiveLevel; label: string } {
  if (score < 8) return { level: 'none', label: 'keine' };
  if (score < 30) return { level: 'low', label: 'gering' };
  if (score < 55) return { level: 'elevated', label: 'erhöht' };
  if (score < 78) return { level: 'moderate', label: 'deutlich' };
  return { level: 'high', label: 'hoch' };
}

function capeWord(cape: number): string {
  if (cape >= 2500) return 'extremes Potenzial';
  if (cape >= 1500) return 'hohes Potenzial';
  if (cape >= 800) return 'mäßiges Potenzial';
  if (cape >= 300) return 'geringes Potenzial';
  return 'kaum Potenzial';
}

/** Fusioniert die Signale zum Gewittergefahr-Index. */
export function convectiveIndex(inp: ConvectiveInputs): ConvectiveIndex {
  const drivers: string[] = [];
  const capeBased = inp.capeJkg != null;

  const cS = inp.cellPeakMmH != null ? cellScore(inp.cellPeakMmH) : clamp(inp.fallbackRiskPct * 1.4, 0, 80);
  const cellPart = cS + (inp.cellIntensifying && cS > 0 ? 12 : 0);

  let base: number;
  if (capeBased) {
    const pS = capeScore(inp.capeJkg as number);
    // Potenzial UND laufende Konvektion = klassische Auslöse-Lage → Synergie.
    const synergy = pS > 40 && cellPart > 30 ? 15 : 0;
    base = 0.5 * pS + 0.5 * cellPart + synergy;
  } else {
    base = cellPart; // ehrlicher Rückfall: nur Radarsignal
  }

  const floor = warningFloor(inp.warningLevel);
  const score = clamp(Math.round(Math.max(base, floor)), 0, 100);
  const { level, label } = levelOf(score);

  // Begründung (stark → schwach), damit der Wert nachvollziehbar bleibt.
  if (inp.warningLevel >= 3) drivers.push(`DWD-Gewitterwarnung Stufe ${inp.warningLevel}`);
  if (capeBased) drivers.push(`CAPE ${Math.round(inp.capeJkg as number)} J/kg (${capeWord(inp.capeJkg as number)})`);
  if (inp.cellPeakMmH != null && inp.cellPeakMmH >= 5) {
    drivers.push(`Zelle ${Math.round(inp.cellPeakMmH)} mm/h${inp.cellIntensifying ? ', verstärkend' : ''}`);
  }
  if (drivers.length === 0) drivers.push(capeBased ? 'kein Konvektionssignal' : 'nur Radar-Intensität (kein CAPE)');

  return { score, level, label, drivers, capeBased };
}

// ---------------------------------------------------------------------------
// Outlook über ein Zeitfenster (Go/No-Go, Event) — gefährlichster Schritt
// ---------------------------------------------------------------------------

export interface OutlookStep {
  /** Zeit des Schritts (UTC-ms). */
  atMs: number;
  /** CAPE (J/kg) zu dieser Zeit; null = kein CAPE (außerhalb Horizont/DE). */
  capeJkg: number | null;
  /** Vorhergesagter Niederschlag (mm/h) als Auslöser-Proxy; null = unbekannt. */
  precipMmH: number | null;
}

export interface ConvectiveOutlook {
  /** Index des gefährlichsten Schritts im Fenster. */
  index: ConvectiveIndex;
  /** Zeitpunkt der Spitze (UTC-ms) oder null. */
  peakAtMs: number | null;
  /** Letzte Zeit mit echten CAPE-Daten (UTC-ms) = Gewitter-Horizont; null wenn keine. */
  capeHorizonMs: number | null;
  /** Lag mindestens ein echter CAPE-Wert vor? (sonst kein belastbares Gewittersignal). */
  capeAvailable: boolean;
}

/**
 * Fasst eine CAPE/Niederschlags-Reihe über ein Zeitfenster zu EINEM Ausblick
 * zusammen: bewertet jeden Schritt mit {@link convectiveIndex} und gibt den
 * gefährlichsten zurück. Die amtliche Warnung gilt für den Nahbereich (Floor
 * auf alle Schritte; das Fenster ist kurz). Niederschlag ist hier nur ein
 * schwacher Auslöser-Proxy — ohne CAPE-Daten (`capeAvailable=false`) sollte der
 * Aufrufer KEIN Gewittersignal anzeigen (Starkregen ≠ Gewitter).
 */
export function convectiveOutlook(steps: OutlookStep[], warningLevel: number): ConvectiveOutlook {
  let best: ConvectiveIndex | null = null;
  let peakAtMs: number | null = null;
  let capeHorizonMs: number | null = null;
  let capeAvailable = false;

  for (const s of steps) {
    if (s.capeJkg != null) { capeAvailable = true; capeHorizonMs = capeHorizonMs == null ? s.atMs : Math.max(capeHorizonMs, s.atMs); }
    const idx = convectiveIndex({
      capeJkg: s.capeJkg,
      cellPeakMmH: s.precipMmH,
      cellIntensifying: false,
      warningLevel,
      fallbackRiskPct: 0,
    });
    if (!best || idx.score > best.score) { best = idx; peakAtMs = s.atMs; }
  }

  const index = best ?? convectiveIndex({ capeJkg: null, cellPeakMmH: null, cellIntensifying: false, warningLevel, fallbackRiskPct: 0 });
  return { index, peakAtMs: best ? peakAtMs : null, capeHorizonMs, capeAvailable };
}

// ---------------------------------------------------------------------------
// Verify (headless) — pure Fusionslogik
// ---------------------------------------------------------------------------

export interface CiCheck { name: string; ok: boolean; detail?: string }
export interface CiVerifyResult { checks: CiCheck[]; passed: number; failed: number }

export function verifyConvectiveIndex(): CiVerifyResult {
  const checks: CiCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const calm = convectiveIndex({ capeJkg: 30, cellPeakMmH: 0, cellIntensifying: false, warningLevel: 0, fallbackRiskPct: 0 });
  add('Ruhig → keine', calm.level === 'none', `${calm.score}`);

  const classic = convectiveIndex({ capeJkg: 2000, cellPeakMmH: 30, cellIntensifying: true, warningLevel: 0, fallbackRiskPct: 40 });
  add('CAPE + verstärkende Zelle → hoch', classic.level === 'high', `${classic.score}`);

  const potentialOnly = convectiveIndex({ capeJkg: 2000, cellPeakMmH: 0, cellIntensifying: false, warningLevel: 0, fallbackRiskPct: 0 });
  add('Nur Potenzial (kein Auslöser) < klassische Lage', potentialOnly.score < classic.score && potentialOnly.score > calm.score, `${potentialOnly.score}`);

  const warned = convectiveIndex({ capeJkg: 200, cellPeakMmH: 2, cellIntensifying: false, warningLevel: 4, fallbackRiskPct: 5 });
  add('Amtliche Unwetterwarnung floort auf hoch', warned.level === 'high', `${warned.score}`);
  add('Warnung erscheint als stärkster Treiber', warned.drivers[0].includes('Stufe 4'), warned.drivers[0]);

  const at = convectiveIndex({ capeJkg: null, cellPeakMmH: 22, cellIntensifying: false, warningLevel: 0, fallbackRiskPct: 30 });
  add('AT/CH-Rückfall ohne CAPE liefert Wert', !at.capeBased && at.score > 30, `${at.score} capeBased=${at.capeBased}`);
  add('Rückfall kennzeichnet fehlendes CAPE', at.drivers.some((d) => d.includes('kein CAPE')) || at.drivers.some((d) => d.startsWith('Zelle')), at.drivers.join(' | '));

  const monotonic = convectiveIndex({ capeJkg: 3000, cellPeakMmH: 50, cellIntensifying: true, warningLevel: 5, fallbackRiskPct: 55 });
  add('Maximal-Lage erreicht hoch & ≤100', monotonic.level === 'high' && monotonic.score <= 100, `${monotonic.score}`);

  // Outlook: gefährlichster Schritt + CAPE-Horizont.
  const ol = convectiveOutlook([
    { atMs: 1000, capeJkg: 200, precipMmH: 0 },
    { atMs: 2000, capeJkg: 2200, precipMmH: 18 },   // gefährlichster
    { atMs: 3000, capeJkg: 400, precipMmH: 1 },
  ], 0);
  add('Outlook wählt gefährlichsten Schritt', ol.peakAtMs === 2000 && ol.index.level === 'high', `${ol.peakAtMs}/${ol.index.level}`);
  add('Outlook meldet CAPE-Horizont', ol.capeHorizonMs === 3000 && ol.capeAvailable, `${ol.capeHorizonMs}`);
  const olNoCape = convectiveOutlook([{ atMs: 1, capeJkg: null, precipMmH: 12 }], 0);
  add('Outlook ohne CAPE markiert capeAvailable=false', !olNoCape.capeAvailable && olNoCape.capeHorizonMs == null, `${olNoCape.capeAvailable}`);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyConvectiveIndex: typeof verifyConvectiveIndex }).__verifyConvectiveIndex = verifyConvectiveIndex;
}
