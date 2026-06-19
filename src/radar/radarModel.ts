/**
 * High-End-Regenradar — reines Datenmodell.
 *
 * Hier liegt alles Darstellungs-Wissen ohne DOM/WebGL: Intensitätsbänder
 * (mm/h, an DWD-Definitionen angelehnt), die Farbpaletten (glatt interpoliert,
 * deckungsgleich mit der 2D-Karte + farbenfehlsicht-sichere Alternative),
 * dBZ-Umrechnung, die Klartext-
 * Nowcast-Texterzeugung („Regen beginnt in 12 min") und die Layer-Presets.
 *
 * Quelle der Werte ist ausschließlich unsere bestehende Pipeline (RADOLAN-RV /
 * INCA / rzc → ICON-D2). Die Raster-Textur ist gegen {@link RADAR_VMAX} = 20 mm/h
 * normiert (siehe scalar/RainLayer precipToU8), deshalb sättigt das *gerenderte*
 * Raster oberhalb ~20 mm/h — die Legende sagt das ehrlich.
 *
 * Alle Funktionen sind pur und über {@link verifyRadarModel} headless prüfbar.
 */

import { PRECIP_VMAX, precipRainRamp } from '../scalar/RainLayer';

/** Obergrenze der Raster-Normierung (mm/h). Gleich der RainLayer-Konvention. */
export const RADAR_VMAX = PRECIP_VMAX; // 20

// ---------------------------------------------------------------------------
// Intensitätsbänder (mm/h) — benannte Stufen, an DWD-Schwellen angelehnt
// ---------------------------------------------------------------------------

export type RadarBand = 'dry' | 'light' | 'moderate' | 'strong' | 'heavy' | 'extreme';

export interface RadarBandDef {
  band: RadarBand;
  /** Anzeigename. */
  label: string;
  /** mm/h-Spanne als Klartext (deutsches Komma). */
  range: string;
  /** Untere Schwelle (mm/h, inklusiv). */
  min: number;
}

/**
 * Bänder nach Lastenheft §5: leicht <0,5 · mäßig 0,5–2 · stark 2–10 ·
 * Starkregen 10–50 · extrem >50. „trocken" als eigenes Band für die Legende.
 */
export const RADAR_BANDS: RadarBandDef[] = [
  { band: 'dry',      label: 'trocken',    range: '< 0,1',   min: 0 },
  { band: 'light',    label: 'leicht',     range: '0,1–0,5', min: 0.1 },
  { band: 'moderate', label: 'mäßig',      range: '0,5–2',   min: 0.5 },
  { band: 'strong',   label: 'stark',      range: '2–10',    min: 2 },
  { band: 'heavy',    label: 'Starkregen', range: '10–50',   min: 10 },
  { band: 'extreme',  label: 'extrem',     range: '> 50',    min: 50 },
];

/** Klassifiziert eine Rate (mm/h) in ihr Band. */
export function radarBand(mmH: number): RadarBand {
  if (!(mmH >= 0.1)) return 'dry';
  if (mmH < 0.5) return 'light';
  if (mmH < 2) return 'moderate';
  if (mmH < 10) return 'strong';
  if (mmH < 50) return 'heavy';
  return 'extreme';
}

export function radarBandLabel(b: RadarBand): string {
  return RADAR_BANDS.find((d) => d.band === b)?.label ?? '—';
}

// ---------------------------------------------------------------------------
// Paletten — glatt interpoliert (wie 2D-Karte) + farbenfehlsicht-sicher + dBZ-Graustufen
// ---------------------------------------------------------------------------

export type PaletteId = 'classic' | 'viridis' | 'mono';

export interface Palette {
  id: PaletteId;
  label: string;
  /** Für Barrierearmut: ist die Palette rot-grün-blind-tauglich? */
  cvdSafe: boolean;
  /** Verlauf für RainLayer (Schlüssel = t = mm/h ÷ RADAR_VMAX, 0..1). */
  ramp: Record<number, string>;
  /** Repräsentativfarbe je Band — Legenden-Swatch & Zell-Umrisse. */
  bandColors: Record<RadarBand, string>;
}

/** t-Position eines mm/h-Werts auf der gegen RADAR_VMAX normierten Skala. */
const T = (mmH: number) => Math.min(1, mmH / RADAR_VMAX);

/**
 * Baut einen GLATTEN Verlauf: zwischen den benannten mm/h-Stufen wird linear
 * interpoliert (kein harter Bandsprung). Deckungsgleich mit der 2D-Karte
 * (scalar/RainLayer `precipRainRamp`), damit das Regenradar genauso fein
 * aufgelöst wirkt statt in groben Blöcken. Die Stufen/Schwellen bleiben für
 * Legende (RADAR_BANDS) und Zell-Umrisse (bandColors) erhalten.
 */
function smoothRamp(stops: Array<{ mmH: number; color: string }>): Record<number, string> {
  const ramp: Record<number, string> = { 0: 'rgba(0,0,0,0)' };
  for (const s of stops) ramp[T(s.mmH)] = s.color;
  ramp[1] = stops[stops.length - 1].color; // Sättigung am oberen Skalenende
  return ramp;
}

const CLASSIC_STOPS = [
  { mmH: 0.1, color: 'rgba(150,200,245,0.62)' }, // leicht — hellblau
  { mmH: 0.5, color: 'rgba(70,150,230,0.78)' },  // mäßig — blau
  { mmH: 2,   color: 'rgba(60,200,120,0.88)' },  // stark — grün
  { mmH: 5,   color: 'rgba(225,190,55,0.90)' },  // — gelb
  { mmH: 10,  color: 'rgba(238,120,40,0.92)' },  // Starkregen — orange
  { mmH: 20,  color: 'rgba(210,45,55,0.94)' },   // — rot
  { mmH: 50,  color: 'rgba(150,40,140,0.95)' },  // extrem — magenta
];

// Viridis-artig: monoton in der Helligkeit, dadurch deuteranopie-/protanopie-
// tauglich. Dunkelviolett → blau → teal → grün → gelb.
const VIRIDIS_STOPS = [
  { mmH: 0.1, color: 'rgba(68,1,84,0.58)' },
  { mmH: 0.5, color: 'rgba(59,82,139,0.78)' },
  { mmH: 2,   color: 'rgba(33,144,141,0.88)' },
  { mmH: 5,   color: 'rgba(53,183,121,0.90)' },
  { mmH: 10,  color: 'rgba(143,215,68,0.92)' },
  { mmH: 20,  color: 'rgba(220,227,40,0.94)' },
  { mmH: 50,  color: 'rgba(253,231,37,0.96)' },
];

// Monochrom-Blau (für Sat-/Terrain-Basemaps, hoher Kontrast, CVD-neutral).
const MONO_STOPS = [
  { mmH: 0.1, color: 'rgba(200,224,245,0.55)' },
  { mmH: 0.5, color: 'rgba(140,186,230,0.74)' },
  { mmH: 2,   color: 'rgba(80,140,205,0.86)' },
  { mmH: 5,   color: 'rgba(40,98,170,0.90)' },
  { mmH: 10,  color: 'rgba(22,64,130,0.93)' },
  { mmH: 20,  color: 'rgba(12,38,92,0.95)' },
  { mmH: 50,  color: 'rgba(8,22,60,0.96)' },
];

function bandColorsFrom(stops: Array<{ mmH: number; color: string }>): Record<RadarBand, string> {
  return {
    dry: 'rgba(140,140,140,0.35)',
    light: stops[0].color,
    moderate: stops[1].color,
    strong: stops[2].color,
    heavy: stops[4].color,
    extreme: stops[6].color,
  };
}

export const PALETTES: Record<PaletteId, Palette> = {
  // „Klassisch" nutzt EXAKT die Rampe der 2D-Karte (scalar/RainLayer
  // `precipRainRamp`) — gemeinsame Quelle, damit Niederschlag auf Karte und
  // Regenradar pixelgleich (gleich feine Abstufung im leichten/mittleren
  // Bereich) ist. bandColors (Legende/Zell-Umrisse) bleiben die CLASSIC-Stufen.
  classic: { id: 'classic', label: 'Klassisch', cvdSafe: false, ramp: precipRainRamp, bandColors: bandColorsFrom(CLASSIC_STOPS) },
  viridis: { id: 'viridis', label: 'Farbsicher', cvdSafe: true, ramp: smoothRamp(VIRIDIS_STOPS), bandColors: bandColorsFrom(VIRIDIS_STOPS) },
  mono:    { id: 'mono',    label: 'Monochrom',  cvdSafe: true, ramp: smoothRamp(MONO_STOPS),    bandColors: bandColorsFrom(MONO_STOPS) },
};

export const PALETTE_ORDER: PaletteId[] = ['classic', 'viridis', 'mono'];

// ---------------------------------------------------------------------------
// dBZ (Expert-Toggle) — Marshall-Palmer Z = 200·R^1.6
// ---------------------------------------------------------------------------

/** mm/h → dBZ (Reflektivität) nach Marshall-Palmer. 0 bei trocken. */
export function mmhToDbz(mmH: number): number {
  if (!(mmH > 0)) return 0;
  const z = 200 * Math.pow(mmH, 1.6);
  return 10 * Math.log10(z);
}

export function fmtDbz(mmH: number): string {
  const d = mmhToDbz(mmH);
  return d <= 0 ? '— dBZ' : `${Math.round(d)} dBZ`;
}

// ---------------------------------------------------------------------------
// Klartext-Nowcast für den Punkt-Streifen (§4) — die Jogging-Entscheidung
// ---------------------------------------------------------------------------

export interface PlainSample {
  /** Versatz von jetzt in Minuten. */
  min: number;
  /** mm/h am Punkt. */
  mmH: number;
}

export type PlainVerdict = 'go' | 'caution' | 'wait';

export interface PlainNowcast {
  /** Kurze Schlagzeile, z. B. „Regen beginnt in 12 min". */
  headline: string;
  /** Ein Satz Kontext. */
  detail: string;
  /** Ampel für die Schnellblick-Karte (§9). */
  verdict: PlainVerdict;
}

const WET = 0.1; // mm/h Schwelle „nass"

function clock(nowMs: number, min: number): string {
  return new Date(nowMs + min * 60_000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function intensityWord(mmH: number): string {
  return radarBandLabel(radarBand(mmH));
}

/** Erste nasse Stufe ab (inkl.) `fromMin`. */
function nextWet(s: PlainSample[], fromMin: number): PlainSample | null {
  return s.find((p) => p.min >= fromMin && p.mmH >= WET) ?? null;
}
/** Erste trockene Stufe ab (inkl.) `fromMin`. */
function nextDry(s: PlainSample[], fromMin: number): PlainSample | null {
  return s.find((p) => p.min >= fromMin && p.mmH < WET) ?? null;
}

/**
 * Erzeugt aus dem Punkt-Streifen (0–~120 min) den Klartext. Rein und testbar.
 * Texte ehrlich: jenseits `skillMin` keine minutengenaue Aussage.
 */
export function generatePlainNowcast(
  samples: PlainSample[],
  nowMs: number,
  skillMin = 120,
): PlainNowcast {
  const s = [...samples].sort((a, b) => a.min - b.min);
  if (s.length === 0) return { headline: 'Keine Radardaten', detail: 'Für diesen Punkt liegt kein Nowcast vor.', verdict: 'caution' };

  const horizonMin = s[s.length - 1].min;
  const rainingNow = s[0].mmH >= WET;
  const peak = Math.max(...s.map((p) => p.mmH));

  if (rainingNow) {
    const dry = nextDry(s, s[0].min + 1);
    if (!dry) {
      return {
        headline: `Es regnet${peak >= 10 ? ' kräftig' : ''} — durchgehend nass`,
        detail: `Kein Trockenfenster in den nächsten ${Math.round(horizonMin / 60 * 10) / 10} h in Sicht (${intensityWord(s[0].mmH)}).`,
        verdict: peak >= 2 ? 'wait' : 'caution',
      };
    }
    const back = nextWet(s, dry.min + 1);
    const stopTxt = dry.min <= skillMin ? `endet ~${clock(nowMs, dry.min)}` : 'lässt später nach';
    if (back && back.min <= skillMin) {
      return {
        headline: `Schauer ${stopTxt}, dann wieder Regen ab ~${clock(nowMs, back.min)}`,
        detail: `Trockenfenster ${clock(nowMs, dry.min)}–${clock(nowMs, back.min)} (${dry.min < back.min ? back.min - dry.min : 0} min).`,
        verdict: back.min - dry.min >= 45 ? 'caution' : 'wait',
      };
    }
    return {
      headline: `Es regnet, ${stopTxt}`,
      detail: `Danach bleibt es im Vorhersagefenster trocken (${intensityWord(s[0].mmH)} aktuell).`,
      verdict: 'caution',
    };
  }

  // Aktuell trocken.
  const onset = nextWet(s, 1);
  if (!onset) {
    return {
      headline: `Trocken für die nächsten ${Math.round(horizonMin / 60 * 10) / 10} h`,
      detail: 'Kein Regen im Nowcast-Fenster an diesem Punkt.',
      verdict: 'go',
    };
  }
  const beyond = onset.min > skillMin;
  if (beyond) {
    return {
      headline: 'Vorerst trocken',
      detail: `Erst später evtl. Regen (jenseits des ~${Math.round(skillMin / 60)}-h-Skill-Horizonts, keine minutengenaue Aussage).`,
      verdict: 'go',
    };
  }
  return {
    headline: `Regen beginnt in ${onset.min} min`,
    detail: `Gegen ~${clock(nowMs, onset.min)}, ${intensityWord(onset.mmH)}.`,
    verdict: onset.min >= 30 ? 'go' : onset.mmH >= 2 ? 'wait' : 'caution',
  };
}

// ---------------------------------------------------------------------------
// Layer-Presets (§3) — nie mehr als ~3 Layer per Default
// ---------------------------------------------------------------------------

export type RadarLayerId =
  | 'precip'     // Intensitätsraster (Basis, alle Phasen)
  | 'rain'       // Phase: Regen (unterhalb Schneefallgrenze)
  | 'snow'       // Phase: Schnee (oberhalb Schneefallgrenze)
  | 'graupel'    // Phase: Graupel/Schneeregen (Mix-Zone) — Heuristik
  | 'hail'       // Phase: Hagel (extreme konvektive Intensität, Warmluft) — Heuristik
  | 'snowline'   // Schneefallgrenze / 0 °C
  | 'lightning'  // Blitze (WMS-Tile)
  | 'cells'      // Sturmzellen + ETA-Trichter
  | 'accum'      // Akkumulation (Summe)
  | 'wind'       // Wind-Partikel
  | 'warnings'   // amtliche Warnungen
  | 'coverage';  // Radarsicht/Qualität

/** Phasen-Layer (abgeleitete Niederschlagsart). */
export const PHASE_LAYERS: RadarLayerId[] = ['rain', 'snow', 'graupel', 'hail'];

export interface RadarPreset {
  id: string;
  label: string;
  icon: string;
  layers: RadarLayerId[];
}

export const RADAR_PRESETS: RadarPreset[] = [
  { id: 'standard', label: 'Standard',      icon: '🌧', layers: ['precip'] },
  { id: 'storm',    label: 'Gewitter-Jagd', icon: '⛈', layers: ['precip', 'lightning', 'cells', 'warnings'] },
  { id: 'winter',   label: 'Winter',        icon: '❄', layers: ['rain', 'snow', 'graupel', 'snowline'] },
];

/** Findet das Preset, dessen Layer-Set exakt aktiv ist (für Panel-Highlight). */
export function activePresetId(active: RadarLayerId[]): string | null {
  const key = (a: RadarLayerId[]) => [...a].sort().join(',');
  const k = key(active);
  return RADAR_PRESETS.find((p) => key(p.layers) === k)?.id ?? null;
}

// ---------------------------------------------------------------------------
// Verify (headless) — window.__verifyRadarModel im DEV-Build
// ---------------------------------------------------------------------------

export interface RmCheck { name: string; ok: boolean; detail?: string }
export interface RmVerifyResult { checks: RmCheck[]; passed: number; failed: number }

export function verifyRadarModel(): RmVerifyResult {
  const checks: RmCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // Bänder
  add('band: 0 → dry', radarBand(0) === 'dry');
  add('band: 0,3 → light', radarBand(0.3) === 'light');
  add('band: 1 → moderate', radarBand(1) === 'moderate');
  add('band: 5 → strong', radarBand(5) === 'strong');
  add('band: 20 → heavy', radarBand(20) === 'heavy');
  add('band: 60 → extreme', radarBand(60) === 'extreme');

  // Paletten: jeder Verlauf hat den 0-Stop transparent + monotone Keys
  for (const id of PALETTE_ORDER) {
    const p = PALETTES[id];
    const keys = Object.keys(p.ramp).map(Number).sort((a, b) => a - b);
    add(`palette ${id}: 0-stop transparent`, /,(0|0\.0+)\)$/.test(p.ramp[0] ?? '') || p.ramp[0] === 'rgba(0,0,0,0)');
    add(`palette ${id}: key range 0..1`, keys[0] === 0 && keys[keys.length - 1] === 1);
    add(`palette ${id}: hat 6 Bandfarben`, Object.keys(p.bandColors).length === 6);
  }
  add('viridis ist CVD-sicher', PALETTES.viridis.cvdSafe && PALETTES.mono.cvdSafe && !PALETTES.classic.cvdSafe);

  // dBZ
  add('dBZ: trocken → 0', mmhToDbz(0) === 0);
  add('dBZ: 1 mm/h ≈ 23 dBZ', Math.abs(mmhToDbz(1) - 23.0) < 0.5, `${mmhToDbz(1).toFixed(1)}`);
  add('dBZ: steigt monoton', mmhToDbz(10) > mmhToDbz(1) && mmhToDbz(50) > mmhToDbz(10));

  // Klartext
  const now = 1_700_000_000_000;
  const strip = (vals: number[]) => vals.map((mmH, i) => ({ min: i * 10, mmH }));
  {
    const r = generatePlainNowcast(strip([0, 0, 0, 0, 0, 0, 0]), now);
    add('plain: dauernd trocken → go', r.verdict === 'go' && /Trocken/.test(r.headline), r.headline);
  }
  {
    const r = generatePlainNowcast(strip([0, 0, 1.5, 2, 2, 0, 0]), now); // Regen ab 20 min
    add('plain: Regen beginnt in 20 min', /beginnt in 20 min/.test(r.headline), r.headline);
  }
  {
    const r = generatePlainNowcast(strip([2, 2, 0, 0, 0, 1.5, 2]), now); // regnet, Pause, dann wieder
    add('plain: Schauer endet … dann wieder Regen', /dann wieder Regen/.test(r.headline), r.headline);
  }
  {
    const r = generatePlainNowcast(strip([3, 3, 3, 3, 3, 3, 3]), now); // durchgehend nass
    add('plain: durchgehend nass → wait', r.verdict === 'wait' && /durchgehend nass/.test(r.headline), r.headline);
  }
  {
    const r = generatePlainNowcast([{ min: 0, mmH: 0 }, { min: 150, mmH: 2 }], now); // erst jenseits Skill
    add('plain: jenseits Skill keine Minutenangabe', /jenseits/.test(r.detail), r.detail);
  }

  // Presets
  add('preset: Standard nur precip', RADAR_PRESETS[0].layers.length === 1 && RADAR_PRESETS[0].layers[0] === 'precip');
  add('preset: höchstens ein Basis-Raster (precip/accum)', RADAR_PRESETS.every((p) => p.layers.filter((l) => l === 'precip' || l === 'accum').length <= 1));
  add('activePresetId erkennt storm', activePresetId(['warnings', 'cells', 'lightning', 'precip']) === 'storm');
  add('activePresetId null bei Custom', activePresetId(['precip', 'wind']) === null);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyRadarModel: typeof verifyRadarModel }).__verifyRadarModel = verifyRadarModel;
}
