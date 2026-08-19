/**
 * **Intensität** — was sich aus FRP belastbar sagen lässt, und was nicht
 * (Phase AF1, Gate GAF1, `audit/aktivfeuer.md` §3 C / §4).
 *
 * ── Drei Größen, drei Bedeutungen ────────────────────────────────────────────
 *   frpLastPassMw  ΣFRP des JÜNGSTEN Überflugs — „wie stark brennt es zuletzt"
 *   frpMaxPassMw   die höchste Überflugsumme des Fensters — „wie stark brannte es höchstens"
 *   freMj          Fire Radiative Energy: Zeitintegral der ΣFRP über die Überflüge
 *
 * Bewusst **neue Namen**: `FireRecord.frpSumMw` ist die Summe über ALLE Pixel und
 * Überflüge des Fensters (der Sortierschlüssel der Cluster-Liste, BC1) und
 * `FireCluster.maxFrp` das stärkste EINZELPIXEL. Dieselben Namen für andere
 * Größen wären die verbotene stille Umdeutung (Konzept-Kollision, Audit §4).
 *
 * ── FRE: Gültigkeitsregel statt erfundener Zahl ──────────────────────────────
 * Ein Integral braucht eine Reihe. FRE wird nur gebildet bei mindestens
 * `FRE_MIN_DETECTIONS` Detektionen über mindestens `FRE_MIN_PASSES` Überflüge;
 * sonst `null` — und die Anzeige sagt „nicht bestimmbar", nie 0 (fehlende
 * Abtastung ≠ keine Energie). Für DACH heißt das: bei der Mehrzahl der Brände
 * bleibt FRE leer, und das ist korrekt.
 *
 * Trapezregel über die Überflugzeitpunkte; MW × s = MJ. Polarumläufer tasten
 * den Tagesgang unregelmäßig ab (Überflüge ≈ 10:30/13:30/22:30/01:30 lokal,
 * Lücken 6–12 h) — die Unsicherheit ist entsprechend groß und steht neben der
 * Zahl. Keine Tagesgang-Korrektur (nicht für Mitteleuropa validiert). Keine
 * Biomasse (Faktor brennstoffabhängig, am Paper unverifiziert — Jans
 * Entscheidung 2026-08-18).
 *
 * Pur, DOM-frei — `npm run verify:fire-activity`.
 */

import type { FirePass } from './overpasses';

export const FRE_MIN_DETECTIONS = 3;
export const FRE_MIN_PASSES = 2;

export type DaynightMix = 'D' | 'N' | 'DN';

export interface Intensity {
  frpLastPassMw: number | null;
  frpMaxPassMw: number | null;
  /** MJ; `null` = nicht bestimmbar (Gültigkeitsregel) — nie 0 als Ersatz. */
  freMj: number | null;
  /** Warum FRE fehlt — für die Zelle, nie geraten. */
  freReason: string | null;
  /** Zeitspanne, über die integriert wurde (Stunden), zur Einordnung der Lücken. */
  freSpanH: number | null;
  /** Größte Lücke zwischen zwei FRP-Überflügen (Stunden) — das Trapez überbrückt sie blind; > 24 h heißt „Tage ohne Beobachtung". */
  freMaxGapH: number | null;
  daynightMix: DaynightMix | null;
  /** Mittlere Pixelbreite quer zur Bahn über alle Überflüge (pixelgewichtet), km. */
  meanScanKm: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Aus den (aufsteigend sortierten) Überflügen eines Brands. */
export function intensityOf(passes: readonly FirePass[]): Intensity {
  if (passes.length === 0) {
    return { frpLastPassMw: null, frpMaxPassMw: null, freMj: null, freReason: 'keine Detektion im Fenster', freSpanH: null, freMaxGapH: null, daynightMix: null, meanScanKm: null };
  }
  const withFrp = passes.filter((p) => p.frpPixels > 0);
  const last = passes[passes.length - 1];
  const frpLastPassMw = last.frpPixels > 0 ? last.sumFrp : null;
  const frpMaxPassMw = withFrp.length > 0 ? Math.max(...withFrp.map((p) => p.sumFrp)) : null;

  const detections = passes.reduce((s, p) => s + p.pixels, 0);
  let freMj: number | null = null; let freReason: string | null = null; let freSpanH: number | null = null; let freMaxGapH: number | null = null;
  if (withFrp.length < FRE_MIN_PASSES || detections < FRE_MIN_DETECTIONS) {
    freReason = `nicht bestimmbar — ${detections} Detektion${detections === 1 ? '' : 'en'} über ${withFrp.length} Überflug${withFrp.length === 1 ? '' : 'e'} mit FRP (nötig: mindestens ${FRE_MIN_DETECTIONS} über ${FRE_MIN_PASSES})`;
  } else {
    let mjSum = 0; let maxGapMs = 0;
    for (let i = 1; i < withFrp.length; i++) {
      const dtMs = withFrp[i].atMs - withFrp[i - 1].atMs;
      if (dtMs > maxGapMs) maxGapMs = dtMs;
      mjSum += ((withFrp[i - 1].sumFrp + withFrp[i].sumFrp) / 2) * (dtMs / 1000);   // MW · s = MJ
    }
    freMaxGapH = round1(maxGapMs / 3_600_000);
    freMj = Math.round(mjSum);
    freSpanH = round1((withFrp[withFrp.length - 1].atMs - withFrp[0].atMs) / 3_600_000);
  }

  let dayN = 0; let nightN = 0;
  for (const p of passes) { if (p.day === true) dayN++; else if (p.day === false) nightN++; else { dayN++; nightN++; } }
  const daynightMix: DaynightMix | null = dayN && nightN ? 'DN' : dayN ? 'D' : nightN ? 'N' : null;

  let scanSum = 0; let scanN = 0;
  for (const p of passes) if (p.meanScanKm != null) { scanSum += p.meanScanKm * p.pixels; scanN += p.pixels; }
  const meanScanKm = scanN > 0 ? Math.round((scanSum / scanN) * 100) / 100 : null;

  return { frpLastPassMw, frpMaxPassMw, freMj, freReason, freSpanH, freMaxGapH, daynightMix, meanScanKm };
}

/** Beschriftung der FRE-Zelle — Zahl mit Spanne oder Grund, nie 0. */
export function freLabel(i: Intensity): string {
  if (i.freMj == null) return i.freReason ?? 'nicht bestimmbar';
  const mj = i.freMj >= 1000
    ? `${(i.freMj / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} GJ`
    : `${i.freMj.toLocaleString('de-DE')} MJ`;
  const gap = i.freMaxGapH ?? 0;
  const gapNote = gap > 24
    ? `größte Lücke ${gap.toLocaleString('de-DE')} h — mehr als ein Tag ohne Beobachtung, das Trapez überbrückt ihn blind; sehr große Unsicherheit`
    : 'Lücken von Stunden, große Unsicherheit';
  return `${mj} über ${i.freSpanH?.toLocaleString('de-DE') ?? '?'} h (Trapez über die Überflüge — ${gapNote})`;
}

export const DAYNIGHT_LABEL: Record<DaynightMix, string> = {
  D: 'nur Tagüberflüge', N: 'nur Nachtüberflüge', DN: 'Tag und Nacht',
};

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface IntensityCheck { name: string; ok: boolean; detail?: string }

function pass(atMs: number, pixels: number, sumFrp: number, extra: Partial<FirePass> = {}): FirePass {
  return {
    key: `N@${atMs}`, satellite: 'N', fromMs: atMs, toMs: atMs, atMs, day: false,
    pixels, frpPixels: sumFrp > 0 ? pixels : 0, sumFrp, maxFrp: sumFrp, lat: 48, lon: 11,
    meanScanKm: 0.4, pixelAreaHa: pixels * 16, bbox: [11, 48, 11, 48], ...extra,
  };
}

export function verifyIntensity(): { checks: IntensityCheck[]; passed: number; total: number } {
  const checks: IntensityCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const H = 3_600_000;
  const t0 = Date.UTC(2026, 7, 15, 12, 0);

  const none = intensityOf([]);
  add('ohne Überflüge: alles null mit Grund', none.frpLastPassMw === null && none.freMj === null && none.freReason != null);

  const single = intensityOf([pass(t0, 4, 20)]);
  add('Einzelüberflug: FRP-Werte da, FRE null mit Grund (kein Fehler)',
    single.frpLastPassMw === 20 && single.frpMaxPassMw === 20 && single.freMj === null && /nicht bestimmbar/.test(single.freReason ?? ''),
    single.freReason ?? '');
  add('… und die FRE-Zelle sagt „nicht bestimmbar", nie 0', /nicht bestimmbar/.test(freLabel(single)) && !/^0/.test(freLabel(single)));

  // Zwei Überflüge, aber nur 2 Detektionen ⇒ FRE null (mindestens 3 Detektionen).
  add('2 Detektionen über 2 Überflüge ⇒ FRE null (Gültigkeitsregel)',
    intensityOf([pass(t0, 1, 10), pass(t0 + 6 * H, 1, 10)]).freMj === null);

  // Bekanntes Trapez: 10 MW → 30 MW über 2 h, 3 Detektionen ⇒ (10+30)/2 · 7200 s = 144 000 MJ.
  const trap = intensityOf([pass(t0, 2, 10), pass(t0 + 2 * H, 1, 30)]);
  add('FRE eines bekannten Trapezes: (10+30)/2 MW · 7200 s = 144 000 MJ, Spanne 2 h',
    trap.freMj === 144_000 && trap.freSpanH === 2, `${trap.freMj} / ${trap.freSpanH}`);
  add('frpLastPass = jüngster Überflug (30), frpMaxPass = höchste Überflugsumme (30)',
    trap.frpLastPassMw === 30 && trap.frpMaxPassMw === 30);
  const decl = intensityOf([pass(t0, 2, 40), pass(t0 + 2 * H, 1, 10)]);
  add('abklingend: frpLastPass (10) ≠ frpMaxPass (40) — zwei Größen, zwei Namen',
    decl.frpLastPassMw === 10 && decl.frpMaxPassMw === 40);
  add('Überflüge ohne FRP zählen für Detektionen, nicht fürs Integral',
    (() => { const i = intensityOf([pass(t0, 2, 10), pass(t0 + H, 3, 0), pass(t0 + 2 * H, 1, 30)]); return i.freMj === 144_000; })());
  add('jüngster Überflug ohne FRP ⇒ frpLastPass null (nicht 0)',
    intensityOf([pass(t0, 2, 10), pass(t0 + H, 3, 0)]).frpLastPassMw === null);
  add('Tag/Nacht-Mischung wird benannt',
    intensityOf([pass(t0, 1, 1, { day: true }), pass(t0 + H, 1, 1)]).daynightMix === 'DN'
    && intensityOf([pass(t0, 1, 1)]).daynightMix === 'N');
  add('mittlere Pixelbreite ist pixelgewichtet',
    intensityOf([pass(t0, 1, 1, { meanScanKm: 0.4 }), pass(t0 + H, 3, 1, { meanScanKm: 0.8 })]).meanScanKm === 0.7);
  add('FRE-Label nennt die Unsicherheit', /Unsicherheit/.test(freLabel(trap)) && /GJ|MJ/.test(freLabel(trap)));
  add('FRE über eine Lücke > 24 h nennt „mehr als ein Tag ohne Beobachtung" (nicht „Stunden")',
    (() => { const g = intensityOf([pass(t0, 2, 10), pass(t0 + 72 * H, 2, 30)]); return g.freMaxGapH === 72 && /mehr als ein Tag/.test(freLabel(g)) && !/Lücken von Stunden/.test(freLabel(g)); })());
  add('FRE-Lücke unter 24 h bleibt bei „Lücken von Stunden"', trap.freMaxGapH === 2 && /Lücken von Stunden/.test(freLabel(trap)));
  add('Konstanten wie im Konzept (3 Detektionen, 2 Überflüge)', FRE_MIN_DETECTIONS === 3 && FRE_MIN_PASSES === 2);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
