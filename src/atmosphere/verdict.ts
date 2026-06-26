/**
 * Atmosphäre · Verdict (Tiefe 1) — deterministische, getestete Einschätzung.
 *
 * Pro Linse (Fliegen / Berg & Weg / Himmel) wird aus dem abgeleiteten
 * Vertikalprofil (profile-derivations) ein Status (gut / Vorsicht / schlecht)
 * plus eine kurze deutsche Schlagzeile erzeugt. REINE Logik, keine Meteorologie
 * in der UI, kein LLM — das LLM erklärt später nur das hier Berechnete.
 *
 * Schwellen bewusst konservativ und als Konstanten dokumentiert. Himmel ist bis
 * P5 (Sonnenuntergang/Nebelmeer/Optik-Daten) bewusst vorläufig gegated.
 */

import type { DerivedProfile } from './profile-derivations';
import { LENS_LABEL, type Lens } from './atmosphereState';
import type { GroundingBlock } from '../assistant/grounding';

export type VerdictTone = 'good' | 'watch' | 'bad';
export interface Verdict {
  tone: VerdictTone;
  headline: string;
  detail: string;
  /** Stabile Schlüssel der ausschlaggebenden Faktoren (für Tests/Debug). */
  drivers: string[];
}

// Schwellen (dokumentiert, konservativ).
const FLY_WIND_HARD_KMH = 40;   // darüber: nicht fliegbar
const FLY_WIND_GOOD_KMH = 25;   // darunter (+ Thermik): gut
const FLY_THERMAL_NONE = 0.5;   // darunter: keine nutzbare Thermik
const FLY_THERMAL_GOOD = 2;     // darüber: gute Thermik
const LOW_LEVEL_M = 2000;       // „unten" für die Wind-Bewertung (AGL)
const NEAR_SURFACE_M = 300;     // Inversion/Wolke „bodennah" (AGL)

const de0 = (n: number) => Math.round(n).toString();

/** Maximaler Wind (km/h) in den untersten ~2000 m über Grund. */
function maxLowWindKmh(p: DerivedProfile): number {
  const lim = p.surfaceM + LOW_LEVEL_M;
  const lows = p.levels.filter((l) => l.heightM <= lim);
  const pool = lows.length ? lows : p.levels.slice(0, 1);
  return pool.reduce((m, l) => Math.max(m, l.windKmh), 0);
}
const cloudBaseAgl = (p: DerivedProfile): number | null =>
  p.cloudBaseM == null ? null : Math.max(0, p.cloudBaseM - p.surfaceM);
/** Bodennahe Inversion (Kaltluftsee/Nebelmeer-Indikator). */
const lowInversion = (p: DerivedProfile) =>
  p.inversions.find((iv) => iv.baseM <= p.surfaceM + NEAR_SURFACE_M) ?? null;
/** Bodennahe Wolkenschicht (Hochnebel / Gipfel in Wolken). */
const lowCloud = (p: DerivedProfile) =>
  p.cloudLayers.find((c) => c.baseM <= p.surfaceM + 400) ?? null;

function flyVerdict(p: DerivedProfile): Verdict {
  const wind = maxLowWindKmh(p);
  const thermalTopAgl = p.boundaryLayerTopM - p.surfaceM;
  const base = cloudBaseAgl(p);
  const baseTxt = base == null ? 'keine tiefe Wolke' : `Wolkenbasis ${de0(base)} m über Grund`;
  const detail = `Thermik ~${p.thermalStrengthMs.toString().replace('.', ',')} m/s bis ${de0(p.boundaryLayerTopM)} m · ${baseTxt} · Wind unten ${de0(wind)} km/h`;

  if (wind >= FLY_WIND_HARD_KMH)
    return { tone: 'bad', headline: `Zu windig — ${de0(wind)} km/h unten`, detail, drivers: ['wind'] };
  if (p.thermalStrengthMs < FLY_THERMAL_NONE || thermalTopAgl < 300)
    return { tone: 'bad', headline: 'Kaum Thermik — flach geschichtet', detail, drivers: ['thermal'] };
  if (p.thermalStrengthMs >= FLY_THERMAL_GOOD && wind < FLY_WIND_GOOD_KMH && (base == null || base >= 800))
    return { tone: 'good', headline: `Gute Thermik bis ${de0(p.boundaryLayerTopM)} m`, detail, drivers: ['thermal', 'wind'] };
  return { tone: 'watch', headline: 'Mäßige Bedingungen', detail, drivers: ['thermal', 'wind'] };
}

function mountainVerdict(p: DerivedProfile): Verdict {
  const inv = lowInversion(p);
  const lc = lowCloud(p);
  const fz = p.freezingLevelM;
  const fzTxt = fz == null ? 'Nullgradgrenze außerhalb des Profils' : `Nullgradgrenze ${de0(fz)} m`;
  const detailParts: string[] = [];
  if (inv) detailParts.push(`Inversion/Kaltluftsee bis ${de0(inv.topM)} m (+${inv.deltaC.toString().replace('.', ',')} °C)`);
  detailParts.push(fzTxt);
  if (lc) detailParts.push(`tiefe Wolke ab ${de0(lc.baseM)} m`);
  const detail = detailParts.join(' · ');

  if (lc) return { tone: 'bad', headline: 'Gipfel wohl in Wolken', detail, drivers: ['cloud'] };
  if (inv) return { tone: 'watch', headline: `Nebelmeer möglich — Inversion bei ${de0(inv.topM)} m`, detail, drivers: ['inversion'] };
  return { tone: 'good', headline: 'Klare Bergsicht erwartbar', detail, drivers: ['clear'] };
}

export function computeVerdict(lens: Lens, p: DerivedProfile): Verdict {
  switch (lens) {
    case 'fly': return flyVerdict(p);
    case 'mountain': return mountainVerdict(p);
    // Die Schnitt-Linse zeigt kein Verdict (eigene Ansicht) — neutraler Fallback.
    case 'section': return { tone: 'good', headline: 'Schnittansicht', detail: '', drivers: [] };
  }
}

const TONE_WORD: Record<VerdictTone, string> = { good: 'gut', watch: 'Vorsicht', bad: 'ungünstig' };

/**
 * Baut den Grounding-Block für die LLM-„Warum?"-Erklärung des Verdicts.
 * Nutzt den bestehenden Assistant-Pfad (phenomenon 'atmosphere'); alle Zahlen
 * stammen aus den getesteten Ableitungen, das Modell formuliert nur.
 */
export function buildVerdictFacts(
  lens: Lens, locationLabel: string, p: DerivedProfile, v: Verdict, timeLabel?: string,
): GroundingBlock {
  const wind = maxLowWindKmh(p);
  const base = cloudBaseAgl(p);
  const facts = [
    { key: 'verdict', label: 'Einschätzung', value: `${TONE_WORD[v.tone]} — ${v.headline}` },
    { key: 'lens', label: 'Linse', value: LENS_LABEL[lens] },
    { key: 'thermalTop', label: 'Thermik-/Grenzschicht-Obergrenze', value: `${de0(p.boundaryLayerTopM)} m ü. NN` },
    { key: 'thermalStrength', label: 'Thermik-Stärke (Schätzung)', value: `${p.thermalStrengthMs.toString().replace('.', ',')} m/s` },
    { key: 'wind', label: 'Wind unten (bis 2000 m AGL)', value: `${de0(wind)} km/h` },
  ];
  if (base != null) facts.push({ key: 'cloudbase', label: 'Wolkenbasis über Grund', value: `${de0(base)} m` });
  if (p.freezingLevelM != null) facts.push({ key: 'freezing', label: 'Nullgradgrenze', value: `${de0(p.freezingLevelM)} m ü. NN` });
  const inv = lowInversion(p);
  if (inv) facts.push({ key: 'inversion', label: 'Inversion (Obergrenze)', value: `${de0(inv.topM)} m, +${inv.deltaC.toString().replace('.', ',')} °C` });

  return {
    phenomenon: 'atmosphere',
    title: `Einschätzung ${LENS_LABEL[lens]}`,
    locationLabel,
    timeLabel,
    facts,
    caveats: [
      'Höhen in Metern, Wind in km/h. Thermik-Stärke und Grenzschicht sind aus ICON-EU (~7 km) geschätzt.',
      'Übernimm die gelieferte Einschätzung genau — nicht abschwächen oder verstärken.',
    ],
  };
}

/** Offline-Fallback: getemplatete deutsche Erklärung ohne LLM. */
export function templateExplanation(lens: Lens, v: Verdict): string {
  return `${LENS_LABEL[lens]}: ${v.headline}. ${v.detail}.`;
}

// --- Verification (pure, DEV) ------------------------------------------------

export interface VerdictCheck { case: string; ok: boolean; detail?: string }

function mkDerived(over: Partial<DerivedProfile>): DerivedProfile {
  return {
    surfaceM: 600, topM: 12000, levels: [], parcel: [],
    boundaryLayerTopM: 600, thermalStrengthMs: 0, cloudBaseM: null,
    cloudLayers: [], inversions: [], shearZones: [], freezingLevelM: 3500, lclM: 2000, capeJkg: 0, cinJkg: 0,
    ...over,
  };
}
/** Level-Helfer mit gegebenem Wind (km/h) auf einer Höhe. */
const lv = (heightM: number, windKmh: number) => ({ heightM, tempC: 10, dewC: 0, windKmh, windDirDeg: 270 });

export function verifyVerdict(): { checks: VerdictCheck[]; passed: number; failed: number } {
  const checks: VerdictCheck[] = [];
  const add = (c: string, ok: boolean, detail?: string) => checks.push({ case: c, ok, detail });

  // Fliegen: gute Thermik, leichter Wind → gut.
  const flyGood = computeVerdict('fly', mkDerived({
    boundaryLayerTopM: 3000, thermalStrengthMs: 3.2, cloudBaseM: 2200, levels: [lv(600, 10), lv(1500, 18), lv(2500, 20)],
  }));
  add('Fliegen gut → good', flyGood.tone === 'good', `${flyGood.tone}/${flyGood.headline}`);

  // Fliegen: starker Wind → bad.
  const flyWind = computeVerdict('fly', mkDerived({
    boundaryLayerTopM: 3000, thermalStrengthMs: 3, levels: [lv(600, 50), lv(1500, 55)],
  }));
  add('Fliegen windig → bad', flyWind.tone === 'bad' && flyWind.drivers.includes('wind'), `${flyWind.tone}`);

  // Fliegen: keine Thermik → bad.
  const flyFlat = computeVerdict('fly', mkDerived({ boundaryLayerTopM: 700, thermalStrengthMs: 0.2, levels: [lv(600, 10)] }));
  add('Fliegen flach → bad', flyFlat.tone === 'bad' && flyFlat.drivers.includes('thermal'), `${flyFlat.tone}`);

  // Berg: bodennahe Inversion → Vorsicht (Nebelmeer).
  const mtInv = computeVerdict('mountain', mkDerived({ inversions: [{ baseM: 650, topM: 1100, deltaC: 4 }], levels: [lv(600, 8)] }));
  add('Berg Inversion → watch + Nebelmeer', mtInv.tone === 'watch' && /Nebelmeer/.test(mtInv.headline), mtInv.headline);

  // Berg: klar → gut.
  const mtClear = computeVerdict('mountain', mkDerived({ levels: [lv(600, 8)] }));
  add('Berg klar → good', mtClear.tone === 'good', mtClear.headline);

  // Berg: tiefe Wolke → schlecht (Gipfel in Wolken).
  const mtCloud = computeVerdict('mountain', mkDerived({ cloudLayers: [{ baseM: 800, topM: 2000 }], levels: [lv(600, 8)] }));
  add('Berg tiefe Wolke → bad', mtCloud.tone === 'bad', mtCloud.headline);

  // Grounding-Block korrekt aufgebaut.
  const block = buildVerdictFacts('fly', 'Innsbruck', mkDerived({ boundaryLayerTopM: 3000, thermalStrengthMs: 3.2, cloudBaseM: 2200, levels: [lv(600, 12)] }), flyGood);
  add('Grounding phenomenon=atmosphere', block.phenomenon === 'atmosphere');
  add('Grounding hat Einschätzung-Fakt', block.facts[0].key === 'verdict' && /gut/.test(block.facts[0].value));

  // Offline-Fallback nennt die Schlagzeile.
  add('Template-Fallback nennt Schlagzeile', /Gute Thermik/.test(templateExplanation('fly', flyGood)));

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyVerdict: typeof verifyVerdict }).__verifyVerdict = verifyVerdict;
}
