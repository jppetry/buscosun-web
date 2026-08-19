/**
 * **Merkmalsschema** — der versionierte Merkmalsatz eines Brands für die spätere
 * Kalibrierung „FRP/Detektionen → Fläche" (Phase AF3, Gate GAF3,
 * `audit/aktivfeuer.md` §3 F / §13; Konzept §6 und §12).
 *
 * ── Warum es diese Datei JETZT gibt ─────────────────────────────────────────
 * Die FIRMS-Detektionen eines Ereignisses sind für den Client nach ≤ 7 Tagen
 * weg; eine Brandflächen-Kartierung (BA-Linie, Sentinel-2) kommt Tage bis
 * Wochen später. Wer die Merkmale nicht VOR Ablauf des Fensters festhält, hat
 * zum Labelzeitpunkt nichts mehr — und die erste Kalibrierung verschiebt sich
 * um eine Saison. Deshalb wird das Schema hier fixiert und die reine Funktion
 * dafür gebaut, obwohl die Zielgröße (BA-Nettofläche) noch nirgends entsteht.
 *
 * ── Referenz für Client UND Batch ───────────────────────────────────────────
 * `featuresOf(record, asOfMs)` ist die EINE Implementierung. Der Client zeigt
 * den Satz in der Detailkarte (prüfbar ab Tag 1); der spätere BA-Batch (GitHub
 * Actions, Node `--experimental-strip-types`) importiert DIESE Datei — Parität
 * per Konstruktion, kein zweiter Rechenweg. Persistenz ist hier nur BENANNT
 * (`FireLabelPair`, Watchlist-Feld `features`, eingefroren bei t_end + 7 d):
 * kein Cron, kein Speicher, keine Datei — Jans Entscheidung 2026-08-18 (§10).
 *
 * ── Regeln ──────────────────────────────────────────────────────────────────
 *   • `featureVersion` steht in jedem Satz; wer ein Merkmal ändert, zählt hoch.
 *   • Kein `undefined` — jede Lücke ist `null`, der Grund steht in
 *     `docs/aktivfeuer-merkmale.md`.
 *   • Keine Fläche ohne ihre Art: `coverageHa` ist das Detektionsraster (vom
 *     Satelliten abgedeckt, keine Brandfläche); `effisMappedHa` ist Referenz,
 *     nicht Ziel; das Ziel (`FireLabelTarget`) kommt ausschließlich vom BA-Batch.
 *   • Deterministisch: dasselbe Record ⇒ byte-gleiches JSON. Kein `Date.now()`;
 *     `asOfMs` wird hereingereicht (D-12).
 *   • Kennung = `FireRecord.id` (`fire:<anchorKey>`, sitzungsstabil, NICHT
 *     sitzungsübergreifend — der Batch vergibt seine eigene, BP0 §7 b).
 *
 * Pur, DOM-frei — `npm run verify:fire-activity`.
 */

import type { FireRecord } from '../footprint/fireRegistry';
import { LANDCOVER_LABEL, type LandcoverKey } from '../fireCorroboration';
import type { AssessmentLevel } from '../fireAssessment';
import type { Country } from '../../types';
import type { ActivityState } from './fireActivity';
import type { DaynightMix } from './intensity';

/** Schema-Version — bei jeder Änderung an `FireFeatures` hochzählen und in `docs/aktivfeuer-merkmale.md` eintragen. */
export const FEATURE_VERSION = 1 as const;

/** Konzept §6 / Audit §5: Mindestzahl Paare für einen Fit und Niveau des Prädiktionsintervalls (AF4). */
export const MIN_PAIRS_FOR_FIT = 25;
export const INTERVAL_LEVEL = 0.8;
/** Konzept §6: nur Paare mit Trennbarkeit ≥ 1,5 (dNBR-Klassifikation belastbar). */
export const MIN_SEPARABILITY = 1.5;

export interface FireFeatures {
  featureVersion: typeof FEATURE_VERSION;
  /** `fire:<anchorKey>` bzw. `effis:<id>` — sitzungsstabil, nicht sitzungsübergreifend. */
  id: string;
  /** Zeitpunkt der Berechnung (hereingereicht) — Provenienz, kein Merkmal. */
  asOfMs: number;
  country: Country | 'outside' | null;
  lat: number;
  lon: number;

  // ── Prädiktoren (Konzept §6) ──────────────────────────────────────────────
  /** Zahl der Detektionen (Pixel) im Fenster. */
  nDetections: number | null;
  /** Überflüge (10 min je Satellit, `activity/overpasses.ts`). */
  nOverpasses: number | null;
  /** Höchste ΣFRP eines einzelnen Überflugs (MW) — Konzept `frp_sum_max_mw`. */
  frpMaxPassMw: number | null;
  /** ΣFRP über ALLE Pixel und Überflüge des Fensters (MW) — BP1-Größe, zusätzlich. */
  frpSumWindowMw: number | null;
  /** Fire Radiative Energy (MJ), `null` = nicht bestimmbar (< 3 Detektionen über < 2 Überflüge). */
  freMj: number | null;
  freSpanH: number | null;
  freMaxGapH: number | null;
  /** Erste bis letzte Detektion im Fenster (h). */
  durationH: number | null;
  /** Vom Satelliten abgedecktes Detektionsraster (ha) — Konzept `envelope_area_ha`; KEINE Brandfläche. */
  coverageHa: number | null;
  coverageCapped: boolean;
  /** Fläche der konvexen Hülle der Detektionen (km²), 0 = flächenlos. */
  hullKm2: number | null;
  sensorFamily: 'VIIRS' | null;
  daynightMix: DaynightMix | null;
  meanScanKm: number | null;
  /** Dominante Landbedeckungsklasse — nur mit EFFIS-Kartierung (CORINE-Anteile), sonst `null`. */
  landcoverDominant: LandcoverKey | null;
  /** UTC-Monat der ersten Detektion (1–12). */
  month: number | null;

  // ── Kovariaten / Ausschlusskriterien (BP1, AF2) ───────────────────────────
  /** Anteil der FIRMS-Konfidenzklassen an den Detektionen (0–1), `null` ohne Detektionen. */
  confidenceFirms: { high: number; nominal: number; low: number } | null;
  assessment: AssessmentLevel | null;
  /** Mehrheit der Detektionen ortsfest (F2) — solche Einträge werden KEIN Paar. */
  suspectedStatic: boolean;
  activityState: ActivityState | null;

  // ── Referenz (nicht Ziel) ─────────────────────────────────────────────────
  /** Von EFFIS kartierte Fläche (ha), wenn der Eintrag eine Kartierung trägt — Referenz, kein Ziel. */
  effisMappedHa: number | null;
  effisId: string | null;
}

/** Woher das Label stammt: eigene dNBR-Kartierung (BA-Linie) oder EFFIS Rapid Damage Assessment (Archiv, seit 2020/21 Sentinel-2-gestützt bis 0–2 ha). */
export type LabelSource = 'ba-dnbr' | 'effis-rda';

/**
 * Zielgröße eines Labelpaars — nie aus dem Client, immer aus einer Kartierung:
 * `ba-dnbr` vom späteren BA-Batch (mit Trennbarkeit), `effis-rda` aus dem
 * EFFIS-Archiv (JRC-Kartierung, kein Trennbarkeitsmaß, kein Intervall — dann
 * `areaMinHa = areaMaxHa = areaNetHa`).
 */
export interface FireLabelTarget {
  source: LabelSource;
  areaNetHa: number;
  areaMinHa: number;
  areaMaxHa: number;
  baStatus: 'provisional' | 'mapped' | 'final';
  /** Trennbarkeit der dNBR-Klassifikation (Konzept BA §5); `null` bei EFFIS-Labels. */
  separability: number | null;
  mappedAtMs: number;
  /** EFFIS-Kennung der Kartierung (nur `effis-rda`). */
  effisId?: string;
}

/**
 * Labelpaar (Konzept §6). Persistenz-Haken (benannt, nicht betrieben): der
 * BA-Watchlist-Eintrag trägt `features` ab dem Trigger (`fire_out`), eingefroren
 * bei `t_end + 7 d`; `target` wird beim Übergang nach `mapped`/`final` ergänzt.
 */
export interface FireLabelPair {
  features: FireFeatures;
  target: FireLabelTarget | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** Der eine Rechenweg — pur, deterministisch. */
export function featuresOf(r: FireRecord, asOfMs: number): FireFeatures {
  const a = r.activity;
  const cluster = r.sources.cluster;
  let coverageHa = 0; let coverageCapped = false; let anyZone = false;
  for (const z of r.sources.zones) { anyZone = true; coverageHa += z.areaHa; if (z.capped) coverageCapped = true; }
  const conf = r.confidence.firms;
  let confidenceFirms: FireFeatures['confidenceFirms'] = null;
  if (conf) {
    const total = (conf.high ?? 0) + (conf.nominal ?? 0) + (conf.low ?? 0) + (conf.unknown ?? 0);
    if (total > 0) {
      confidenceFirms = { high: round2((conf.high ?? 0) / total), nominal: round2((conf.nominal ?? 0) / total), low: round2((conf.low ?? 0) / total) };
    }
  }
  const dominant = r.landcover && r.landcover.length > 0
    ? [...r.landcover].sort((x, y) => y.pct - x.pct)[0].key
    : null;
  return {
    featureVersion: FEATURE_VERSION,
    id: r.id,
    asOfMs,
    country: r.country,
    lat: round5(r.lat),
    lon: round5(r.lon),
    nDetections: r.hotspots,
    nOverpasses: r.overpasses,
    frpMaxPassMw: a?.frpMaxPassMw ?? null,
    frpSumWindowMw: r.frpSumMw,
    freMj: a?.freMj ?? null,
    freSpanH: a?.freSpanH ?? null,
    freMaxGapH: a?.freMaxGapH ?? null,
    durationH: r.firstMs != null && r.lastMs != null ? round1((r.lastMs - r.firstMs) / 3_600_000) : null,
    coverageHa: anyZone ? round1(coverageHa) : null,
    coverageCapped,
    hullKm2: cluster ? round2(cluster.hullKm2) : null,
    sensorFamily: r.hotspots != null && r.hotspots > 0 ? 'VIIRS' : null,
    daynightMix: a?.daynightMix ?? null,
    meanScanKm: a?.meanScanKm ?? null,
    landcoverDominant: dominant,
    month: r.firstMs != null ? new Date(r.firstMs).getUTCMonth() + 1 : null,
    confidenceFirms,
    assessment: r.confidence.assessment,
    suspectedStatic: r.suspectedStatic,
    activityState: a?.state ?? null,
    effisMappedHa: r.areaHa.kind === 'mapped' ? r.areaHa.value : null,
    effisId: r.sources.effis ? r.sources.effis.id : null,
  };
}

/**
 * Aufnahmeregel (Konzept §6): nur `mapped`/`final`, nie ortsfest, nie `provisional`
 * (teilkartiert verzerrt nach unten). `ba-dnbr` zusätzlich Trennbarkeit ≥ 1,5;
 * `effis-rda` zusätzlich Fläche > 0, mindestens eine Detektion und keine
 * überwiegend künstliche Fläche (Industrie liefert keine Brandfläche).
 */
export function isEligiblePair(p: FireLabelPair): boolean {
  const t = p.target;
  if (!t) return false;
  if (p.features.suspectedStatic) return false;
  if (t.baStatus === 'provisional') return false;
  if (t.source === 'ba-dnbr') return t.separability != null && t.separability >= MIN_SEPARABILITY;
  // effis-rda
  if (!(t.areaNetHa > 0)) return false;
  if (p.features.nDetections == null || p.features.nDetections < 1) return false;
  if (p.features.landcoverDominant === 'ARTIFSURF') return false;
  return true;
}

/** Stabile Schlüsselreihenfolge für Vergleich, Anzeige und Persistenz — die Reihenfolge von `FireFeatures`. */
export const FEATURE_KEYS: readonly (keyof FireFeatures)[] = [
  'featureVersion', 'id', 'asOfMs', 'country', 'lat', 'lon',
  'nDetections', 'nOverpasses', 'frpMaxPassMw', 'frpSumWindowMw', 'freMj', 'freSpanH', 'freMaxGapH', 'durationH',
  'coverageHa', 'coverageCapped', 'hullKm2', 'sensorFamily', 'daynightMix', 'meanScanKm', 'landcoverDominant', 'month',
  'confidenceFirms', 'assessment', 'suspectedStatic', 'activityState',
  'effisMappedHa', 'effisId',
];

/** JSON in Schlüsselreihenfolge — byte-gleich für gleiche Eingabe. */
export function featuresJson(f: FireFeatures): string {
  const o: Record<string, unknown> = {};
  for (const k of FEATURE_KEYS) o[k] = f[k];
  return JSON.stringify(o);
}

/** Kurzform für die Detailkarte: die Prädiktoren, nichts erfunden. */
export function featuresSummary(f: FireFeatures): { key: string; value: string }[] {
  const num = (n: number | null, unit = '', digits = 1) => n == null ? '—' : `${n.toLocaleString('de-DE', { maximumFractionDigits: digits })}${unit}`;
  return [
    { key: 'Detektionen', value: num(f.nDetections, '', 0) },
    { key: 'Überflüge', value: num(f.nOverpasses, '', 0) },
    { key: 'max ΣFRP/Überflug', value: num(f.frpMaxPassMw, ' MW') },
    { key: 'FRE', value: f.freMj == null ? '— (nicht bestimmbar)' : f.freMj >= 1000 ? num(f.freMj / 1000, ' GJ') : num(f.freMj, ' MJ', 0) },
    { key: 'Dauer', value: num(f.durationH, ' h') },
    { key: 'Abdeckung', value: f.coverageHa == null ? '—' : `${num(f.coverageHa, ' ha', 0)} (Raster, keine Brandfläche${f.coverageCapped ? ', unvollständig' : ''})` },
    { key: 'Hülle', value: num(f.hullKm2, ' km²', 2) },
    { key: 'Tag/Nacht', value: f.daynightMix ?? '—' },
    { key: 'Landbedeckung', value: f.landcoverDominant ? LANDCOVER_LABEL[f.landcoverDominant] : '— (nur mit EFFIS)' },
    { key: 'Monat', value: num(f.month, '', 0) },
    { key: 'EFFIS-Referenz', value: f.effisMappedHa == null ? '—' : `${num(f.effisMappedHa, ' ha', 0)} kartiert (Referenz, kein Ziel)` },
  ];
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei) — Regeln; Records-Anker im Verifier-Skript
// ---------------------------------------------------------------------------

export interface FeaturesCheck { name: string; ok: boolean; detail?: string }

export function verifyFeatures(): { checks: FeaturesCheck[]; passed: number; total: number } {
  const checks: FeaturesCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const base: FireFeatures = {
    featureVersion: 1, id: 'fire:x', asOfMs: 0, country: 'DE', lat: 48, lon: 11,
    nDetections: 3, nOverpasses: 2, frpMaxPassMw: 21.7, frpSumWindowMw: 30, freMj: 412, freSpanH: 12.5, freMaxGapH: 12.5,
    durationH: 12.5, coverageHa: 47.3, coverageCapped: false, hullKm2: 0.1, sensorFamily: 'VIIRS', daynightMix: 'DN',
    meanScanKm: 0.4, landcoverDominant: null, month: 8, confidenceFirms: { high: 0, nominal: 1, low: 0 }, assessment: 'plausibel',
    suspectedStatic: false, activityState: null, effisMappedHa: null, effisId: null,
  };
  const target = (baStatus: FireLabelTarget['baStatus'], separability: number): FireLabelTarget =>
    ({ source: 'ba-dnbr', areaNetHa: 3.8, areaMinHa: 2.9, areaMaxHa: 4.9, baStatus, separability, mappedAtMs: 1 });
  const effis = (areaNetHa: number, baStatus: FireLabelTarget['baStatus'] = 'mapped'): FireLabelTarget =>
    ({ source: 'effis-rda', areaNetHa, areaMinHa: areaNetHa, areaMaxHa: areaNetHa, baStatus, separability: null, mappedAtMs: 1, effisId: 'E1' });

  add('Version 1, Konstanten wie im Konzept (25 Paare, 80 %, Trennbarkeit 1,5)',
    FEATURE_VERSION === 1 && MIN_PAIRS_FOR_FIT === 25 && INTERVAL_LEVEL === 0.8 && MIN_SEPARABILITY === 1.5);
  add('Paar ohne Ziel ist kein Paar', !isEligiblePair({ features: base, target: null }));
  add('mapped + Trennbarkeit 1,9 ⇒ Paar', isEligiblePair({ features: base, target: target('mapped', 1.9) }));
  add('final + Trennbarkeit 1,5 ⇒ Paar (Grenze inklusiv)', isEligiblePair({ features: base, target: target('final', 1.5) }));
  add('provisional ⇒ kein Paar (teilkartiert verzerrt nach unten)', !isEligiblePair({ features: base, target: target('provisional', 2) }));
  add('Trennbarkeit 1,4 ⇒ kein Paar', !isEligiblePair({ features: base, target: target('mapped', 1.4) }));
  add('ortsfest ⇒ kein Paar', !isEligiblePair({ features: { ...base, suspectedStatic: true }, target: target('mapped', 2) }));
  add('ba-dnbr ohne Trennbarkeit (null) ⇒ kein Paar', !isEligiblePair({ features: base, target: { ...target('mapped', 2), separability: null } }));
  add('effis-rda: mapped, Fläche > 0, ≥ 1 Detektion ⇒ Paar (ohne Trennbarkeitsmaß)', isEligiblePair({ features: base, target: effis(12) }));
  add('effis-rda: final ⇒ Paar; provisional ⇒ kein Paar', isEligiblePair({ features: base, target: effis(12, 'final') }) && !isEligiblePair({ features: base, target: effis(12, 'provisional') }));
  add('effis-rda: Fläche 0 ⇒ kein Paar', !isEligiblePair({ features: base, target: effis(0) }));
  add('effis-rda: ohne Detektion ⇒ kein Paar', !isEligiblePair({ features: { ...base, nDetections: null }, target: effis(12) }) && !isEligiblePair({ features: { ...base, nDetections: 0 }, target: effis(12) }));
  add('effis-rda: überwiegend künstliche Fläche ⇒ kein Paar', !isEligiblePair({ features: { ...base, landcoverDominant: 'ARTIFSURF' }, target: effis(12) }));
  add('FEATURE_KEYS deckt jeden Schlüssel des Typs, keiner doppelt',
    FEATURE_KEYS.length === Object.keys(base).length && new Set(FEATURE_KEYS).size === FEATURE_KEYS.length
    && Object.keys(base).every((k) => (FEATURE_KEYS as readonly string[]).includes(k)));
  add('featuresJson: Reihenfolge stabil, byte-gleich bei gleicher Eingabe, Version zuerst',
    featuresJson(base) === featuresJson({ ...base }) && featuresJson(base).startsWith('{"featureVersion":1,"id":"fire:x"'));
  add('featuresJson enthält kein undefined', !/undefined/.test(featuresJson(base)) && FEATURE_KEYS.every((k) => base[k] !== undefined));
  const sum = featuresSummary(base);
  add('Kurzform nennt Abdeckung als Raster „keine Brandfläche" und EFFIS nur als Referenz',
    /keine Brandfläche/.test(sum.find((s) => s.key === 'Abdeckung')?.value ?? '') && /—/.test(sum.find((s) => s.key === 'EFFIS-Referenz')?.value ?? ''));
  add('Kurzform: FRE null ⇒ „nicht bestimmbar", nie 0',
    /nicht bestimmbar/.test(featuresSummary({ ...base, freMj: null }).find((s) => s.key === 'FRE')?.value ?? ''));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
