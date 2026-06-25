/**
 * Grounding-Datenvertrag für den Meteorologen-Assistenten.
 *
 * KERN-PRINZIP: Das LLM darf ausschließlich verifizierte Werte aus den
 * bestehenden buscosun-Pipelines UMFORMULIEREN — niemals Zahlen/Orte/Zeiten/
 * Trends erfinden. Dieser Modul liefert pro Phänomen einen `GroundingBlock` mit
 * fertig formatierten Fakten (inkl. Einheit). Fehlende Werte werden schlicht
 * WEGGELASSEN (null → kein Fakt), sodass das Modell nichts auffüllen muss.
 *
 * Die Builder konsumieren die TYPEN der vorhandenen Pipelines (keine neuen
 * Datenquellen): Föhn aus `pointForecast/foehnDetector`, Inversion/Wolkenbasis/
 * Höhenwind aus `threed/crossSection`, Modell-Spread aus `confidence`.
 */

import type { FoehnAssessment } from '../pointForecast/types';
import type { InversionInfo, SectionCell, ColumnProfile } from '../threed/crossSection';
import { SHEAR_THRESHOLD_KMH_PER_300M } from '../threed/crossSection';
import type { AgreementInfo } from '../confidence/agreementModel';

export type Phenomenon = 'foehn' | 'inversion' | 'cloudbase' | 'windprofile' | 'modelspread' | 'leewaves' | 'atmosphere';

export interface GroundedFact {
  /** Stabiler Schlüssel (für Debug/Tests). */
  key: string;
  /** Deutsches Label, z. B. „Windrichtung". */
  label: string;
  /** Bereits formatierter Wert inkl. Einheit, z. B. „185° (Süd)". */
  value: string;
}

export interface GroundingBlock {
  phenomenon: Phenomenon;
  /** Anzeigename, z. B. „Föhn". */
  title: string;
  locationLabel: string;
  /** Optionaler Zeitbezug, z. B. „heute 14 Uhr". */
  timeLabel?: string;
  /** Nur verifizierte, mit Einheit formatierte Werte. */
  facts: GroundedFact[];
  /** Ehrlichkeits-Hinweise (Heuristik, Näherung, fehlende Messung …). */
  caveats: string[];
}

// --- Formatierungs-Helfer (deutsche Schreibweise) ---------------------------

const de1 = (n: number) => n.toFixed(1).replace('.', ',');
const de0 = (n: number) => Math.round(n).toString();
const fact = (key: string, label: string, value: string): GroundedFact => ({ key, label, value });

/** Grobe Himmelsrichtung aus meteorologischen Grad (woher der Wind weht). */
export function compass(deg: number): string {
  const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

// ---------------------------------------------------------------------------
// 1. Föhn — aus foehnDetector (FoehnAssessment) + den genutzten Surface-Werten
// ---------------------------------------------------------------------------

export interface FoehnSurface {
  windDirectionDeg: number | null;
  windSpeedMps: number | null;
  gustMps: number | null;
  relativeHumidityPct: number | null;
  temperatureC: number | null;
}

export function buildFoehnFacts(
  locationLabel: string,
  assessment: FoehnAssessment | null,
  surface: FoehnSurface,
  timeLabel?: string,
): GroundingBlock | null {
  if (!assessment) return null; // Detektor liefert null bei fehlenden Kerngrößen
  const facts: GroundedFact[] = [];
  facts.push(fact('isFoehn', 'Föhn-Lage', assessment.isFoehn ? 'ja (markiert)' : 'nein'));
  facts.push(fact('score', 'Föhn-Score', `${de1(assessment.score)} von 1,0`));
  if (surface.windDirectionDeg != null)
    facts.push(fact('windDir', 'Windrichtung', `${de0(surface.windDirectionDeg)}° (${compass(surface.windDirectionDeg)})`));
  if (surface.windSpeedMps != null)
    facts.push(fact('wind', 'Windgeschwindigkeit', `${de1(surface.windSpeedMps)} m/s`));
  if (surface.gustMps != null)
    facts.push(fact('gust', 'Böen', `${de1(surface.gustMps)} m/s`));
  if (surface.relativeHumidityPct != null)
    facts.push(fact('rh', 'relative Luftfeuchte', `${de0(surface.relativeHumidityPct)} %`));
  if (surface.temperatureC != null)
    facts.push(fact('temp', 'Temperatur', `${de1(surface.temperatureC)} °C`));
  if (assessment.reasons.length)
    facts.push(fact('reasons', 'erfüllte Indikatoren', assessment.reasons.join('; ')));

  return {
    phenomenon: 'foehn',
    title: 'Föhn',
    locationLabel,
    timeLabel,
    facts,
    caveats: ['Heuristische Einschätzung (Tier-C), nur im Alpenraum aussagekräftig.'],
  };
}

// ---------------------------------------------------------------------------
// 2. Temperaturinversion — aus threed/crossSection (InversionInfo)
// ---------------------------------------------------------------------------

export function buildInversionFacts(
  locationLabel: string,
  inv: InversionInfo,
  timeLabel?: string,
): GroundingBlock | null {
  if (!inv.present) return null;
  const facts: GroundedFact[] = [];
  if (inv.heightM != null) facts.push(fact('height', 'Obergrenze Kaltluftsee', `${de0(inv.heightM)} m ü. NN`));
  if (inv.valleyTempC != null) facts.push(fact('valleyT', 'Temperatur im Tal', `${de1(inv.valleyTempC)} °C`));
  if (inv.aboveTempC != null) facts.push(fact('aboveT', 'Temperatur oberhalb', `${de1(inv.aboveTempC)} °C`));
  if (inv.diffK != null) facts.push(fact('diff', 'Temperaturdifferenz', `${de1(inv.diffK)} K (oberhalb wärmer)`));
  facts.push(fact('stable', 'Schichtung', inv.stable ? 'stabil (windschwach, klar)' : 'wenig stabil'));

  const caveats: string[] = [];
  if (inv.basis === 'heuristic')
    caveats.push('Modelliert aus klarer, windschwacher Lage + Talkessel — keine direkte Messung.');
  else if (inv.basis === 'observed')
    caveats.push('Aus Stationswerten abgeleitet (höhere Lage wärmer als das Tal).');

  return { phenomenon: 'inversion', title: 'Temperaturinversion', locationLabel, timeLabel, facts, caveats };
}

// ---------------------------------------------------------------------------
// 3. Wolkenuntergrenze — aus threed/crossSection (ColumnProfile.cloudBaseM)
// ---------------------------------------------------------------------------

export function buildCloudBaseFacts(
  locationLabel: string,
  col: ColumnProfile,
  timeLabel?: string,
): GroundingBlock | null {
  if (col.cloudBaseM == null) return null; // nur bei relevanter Bewölkung (≥35 %)
  const facts: GroundedFact[] = [];
  const baseAgl = Math.max(0, col.cloudBaseM - col.terrainM);
  facts.push(fact('baseMsl', 'Wolkenuntergrenze', `${de0(col.cloudBaseM)} m ü. NN`));
  facts.push(fact('baseAgl', 'über Grund', `${de0(baseAgl)} m`));
  facts.push(fact('terrain', 'Geländehöhe', `${de0(col.terrainM)} m ü. NN`));
  const s = col.surface;
  if (s.cloudLowPct != null) facts.push(fact('low', 'tiefe Bewölkung', `${de0(s.cloudLowPct)} %`));
  if (s.cloudMidPct != null) facts.push(fact('mid', 'mittelhohe Bewölkung', `${de0(s.cloudMidPct)} %`));
  if (s.cloudHighPct != null) facts.push(fact('high', 'hohe Bewölkung', `${de0(s.cloudHighPct)} %`));

  return {
    phenomenon: 'cloudbase',
    title: 'Wolkenuntergrenze',
    locationLabel,
    timeLabel,
    facts,
    caveats: ['LCL-Näherung aus Temperatur und Luftfeuchte (Hebungskondensationsniveau).'],
  };
}

// ---------------------------------------------------------------------------
// 4. Höhenwindprofil — aus threed/crossSection (SectionCell je AGL-Stufe)
// ---------------------------------------------------------------------------

/** Wählt repräsentative AGL-Stufen (~Boden, ~500, ~1000, ~1500 m) aus den Zellen. */
export function buildWindProfileFacts(
  locationLabel: string,
  cells: SectionCell[],
  timeLabel?: string,
): GroundingBlock | null {
  if (!cells.length) return null;
  const sorted = [...cells].sort((a, b) => a.agl - b.agl);
  const targets = [0, 500, 1000, 1500];
  const picked: SectionCell[] = [];
  for (const t of targets) {
    let best = sorted[0], bd = Infinity;
    for (const c of sorted) { const d = Math.abs(c.agl - t); if (d < bd) { bd = d; best = c; } }
    if (!picked.includes(best)) picked.push(best);
  }
  const facts: GroundedFact[] = picked.map((c) =>
    fact(`agl${de0(c.agl)}`, `${de0(c.agl)} m über Grund`,
      `${de0(c.windKmh)} km/h aus ${de0(c.windDirDeg)}° (${compass(c.windDirDeg)}), Böen ${de0(c.gustKmh)} km/h`),
  );
  return {
    phenomenon: 'windprofile',
    title: 'Höhenwindprofil',
    locationLabel,
    timeLabel,
    facts,
    caveats: ['Aus 10-m-Wind mit Standard-Höhenprofil hochgerechnet (grenzschicht-gesättigt), nicht aus echten Druckflächen.'],
  };
}

// ---------------------------------------------------------------------------
// 5. Modell-Unsicherheit / Spread — aus confidence/agreementModel
// ---------------------------------------------------------------------------

export function buildModelSpreadFacts(
  locationLabel: string,
  ag: AgreementInfo,
  modelLabels: string[],
  tMaxByModel: number[],
  dayLabel?: string,
): GroundingBlock | null {
  const usable = tMaxByModel.filter(Number.isFinite);
  if (usable.length < 2) return null;
  const facts: GroundedFact[] = [];
  facts.push(fact('count', 'verglichene Modelle', `${usable.length} (${modelLabels.join(', ')})`));
  facts.push(fact('spread', 'Temperatur-Streuung', `±${de1(ag.tempSpreadC)} °C`));
  facts.push(fact('range', 'Spanne Tageshöchstwert', `${de1(Math.min(...usable))}–${de1(Math.max(...usable))} °C`));
  const lvl = ag.level === 'high' ? 'hohe Übereinstimmung' : ag.level === 'mixed' ? 'überwiegende Einigkeit' : 'deutliche Unterschiede';
  facts.push(fact('level', 'Einigkeit', lvl));
  facts.push(fact('precip', 'Regen-Konsens', ag.precip.text));
  if (ag.outlierIdx.length) {
    const names = ag.outlierIdx.map((i) => modelLabels[i]).filter(Boolean).join(', ');
    if (names) facts.push(fact('outlier', 'Ausreißer-Modell', names));
  }
  return { phenomenon: 'modelspread', title: 'Modell-Unsicherheit', locationLabel, timeLabel: dayLabel, facts, caveats: [] };
}

// ---------------------------------------------------------------------------
// 6. Lee-Wellen — QUALITATIVE Favorability (kein quantitatives Wellenmaß!)
// ---------------------------------------------------------------------------

export interface LeeWaveInput {
  /** Wind am Kamm/Gipfel (km/h) + Richtung. */
  crestWindKmh: number;
  crestWindDirDeg: number;
  /** Windkomponente senkrecht zum Kamm (km/h), falls Schnitt-Orientierung bekannt. */
  crossRidgeKmh?: number | null;
  /** Reliefenergie (Gipfel − Tal, m). */
  reliefM: number;
  /** Maximale Windscherung im Schnitt (km/h je 300 m). */
  maxShearKmhPer300m: number;
  /** Stabile Schichtung vorhanden (Inversion / stable-Flag)? */
  stableLayer: boolean;
}

export type LeeFavorability = 'günstig' | 'grenzwertig' | 'ungünstig';

export function leeWaveFavorability(i: LeeWaveInput): LeeFavorability {
  const cross = i.crossRidgeKmh ?? i.crestWindKmh;
  let score = 0;
  if (cross >= 35) score += 2; else if (cross >= 20) score += 1;
  if (i.reliefM >= 500) score += 2; else if (i.reliefM >= 300) score += 1;
  if (i.stableLayer) score += 1;
  if (i.maxShearKmhPer300m >= SHEAR_THRESHOLD_KMH_PER_300M) score += 1;
  return score >= 4 ? 'günstig' : score >= 2 ? 'grenzwertig' : 'ungünstig';
}

export function buildLeeWaveFacts(
  locationLabel: string,
  input: LeeWaveInput,
  timeLabel?: string,
): GroundingBlock | null {
  if (!Number.isFinite(input.crestWindKmh) || !Number.isFinite(input.reliefM)) return null;
  const fav = leeWaveFavorability(input);
  const facts: GroundedFact[] = [];
  facts.push(fact('fav', 'Bedingungen für Lee-Wellen', fav));
  facts.push(fact('crest', 'Wind am Kamm', `${de0(input.crestWindKmh)} km/h aus ${de0(input.crestWindDirDeg)}° (${compass(input.crestWindDirDeg)})`));
  if (input.crossRidgeKmh != null)
    facts.push(fact('cross', 'Querkomponente zum Kamm', `${de0(input.crossRidgeKmh)} km/h`));
  facts.push(fact('relief', 'Reliefenergie', `${de0(input.reliefM)} m`));
  facts.push(fact('shear', 'max. Windscherung', `${de0(input.maxShearKmhPer300m)} km/h je 300 m`));
  facts.push(fact('stable', 'stabile Schicht', input.stableLayer ? 'ja' : 'nein'));

  const caveats = [
    'Qualitative Favorability aus Kammwind, Relief, Scherung und Schichtung — KEIN quantitatives Wellenmaß (keine Wellenlänge/Amplitude, kein Froude).',
  ];
  if (input.crossRidgeKmh == null)
    caveats.push('Kamm-Orientierung nicht aufgelöst — Kammwind als Obergrenze der Querkomponente verwendet.');

  return { phenomenon: 'leewaves', title: 'Lee-Wellen', locationLabel, timeLabel, facts, caveats };
}
