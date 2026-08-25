/**
 * BD1 — Geometrie des Überflug-Verlaufs (`audit/brand-detail.md` §2 D4; Konzept §5 C4).
 *
 * Pure Rechnung für den SVG-Chart `FirePassChart.tsx`: je Überflug ein Balken ΣFRP auf
 * log-Achse (FRP p50 ≈ 3 MW, max ≈ 370 MW — linear wäre alles unter 10 MW unsichtbar),
 * Lücken > 6 h zwischen Überflügen als Streifen, dazu die Lücke vom letzten Überflug bis
 * jetzt. **Kein** interpolierender Linienzug: zwischen zwei Überflügen weiß niemand, was
 * das Feuer tat. Alle Koordinaten sind Anteile 0…1; Pixel macht die Komponente.
 */

import type { FirePass } from '../activity/overpasses';

export const GAP_HOURS = 6;
export const MIN_SPAN_H = 24;
const H_MS = 3_600_000;

export interface TimelineBar {
  key: string;
  /** Mitte des Balkens, 0…1. */
  x: number;
  /** Höhe 0…1 (log-Skala); 0 ohne FRP. */
  h: number;
  frpMw: number;
  hasFrp: boolean;
  pixels: number;
  day: boolean | null;
  atMs: number;
  satellite: string;
}
export interface TimelineGap { x0: number; x1: number; hours: number; trailing: boolean }
export interface TimelineTick { x: number; label: string }
export interface YTick { h: number; label: string }

export interface PassTimeline {
  bars: TimelineBar[];
  gaps: TimelineGap[];
  fromMs: number;
  toMs: number;
  yMaxMw: number;
  ticks: TimelineTick[];
  yTicks: YTick[];
  /** Längste Lücke in Stunden (inkl. bis jetzt) — für die Bildunterschrift. */
  maxGapH: number;
}

const logH = (frp: number, yMax: number) => (frp <= 0 ? 0 : Math.log10(1 + frp) / Math.log10(1 + yMax));

/** Lokale Mitternachten innerhalb [from, to] — Ticks der Zeitachse. */
export function midnightsBetween(fromMs: number, toMs: number): number[] {
  const out: number[] = [];
  const d = new Date(fromMs);
  d.setHours(0, 0, 0, 0);
  for (let t = d.getTime(); t <= toMs; t = new Date(t + 26 * H_MS).setHours(0, 0, 0, 0)) if (t >= fromMs) out.push(t);
  return out;
}

export function passTimeline(passes: readonly FirePass[], nowMs: number, opts: { gapHours?: number; minSpanH?: number } = {}): PassTimeline | null {
  const gapH = opts.gapHours ?? GAP_HOURS;
  const minSpan = opts.minSpanH ?? MIN_SPAN_H;
  const sorted = [...passes].sort((a, b) => a.atMs - b.atMs);
  if (sorted.length === 0) return null;
  const first = sorted[0].atMs;
  const last = sorted[sorted.length - 1].atMs;
  let toMs = Math.max(last, nowMs);
  let fromMs = first - H_MS;
  if (toMs - fromMs < minSpan * H_MS) {
    // Kurze Fenster auf 24 h aufziehen — nach hinten, damit „jetzt" rechts bleibt.
    fromMs = toMs - minSpan * H_MS;
  }
  toMs += H_MS; // etwas Luft rechts, damit der letzte Balken nicht am Rand klebt
  const span = toMs - fromMs;
  const x = (t: number) => (t - fromMs) / span;
  const yMaxMw = Math.max(1, ...sorted.map((p) => p.sumFrp));
  const bars: TimelineBar[] = sorted.map((p) => ({
    key: p.key, x: x(p.atMs), h: p.frpPixels > 0 ? logH(p.sumFrp, yMaxMw) : 0,
    frpMw: p.sumFrp, hasFrp: p.frpPixels > 0, pixels: p.pixels, day: p.day, atMs: p.atMs, satellite: p.satellite,
  }));
  const gaps: TimelineGap[] = [];
  let maxGapH = 0;
  for (let i = 1; i < sorted.length; i++) {
    const hours = (sorted[i].atMs - sorted[i - 1].atMs) / H_MS;
    if (hours > maxGapH) maxGapH = hours;
    if (hours > gapH) gaps.push({ x0: x(sorted[i - 1].atMs), x1: x(sorted[i].atMs), hours: Math.round(hours * 10) / 10, trailing: false });
  }
  const trailingH = (nowMs - last) / H_MS;
  if (trailingH > gapH) gaps.push({ x0: x(last), x1: x(Math.min(nowMs, toMs)), hours: Math.round(trailingH * 10) / 10, trailing: true });
  if (trailingH > maxGapH) maxGapH = trailingH;
  const ticks: TimelineTick[] = midnightsBetween(fromMs, toMs).map((t) => ({
    x: x(t), label: new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
  }));
  const yTicks: YTick[] = [1, 10, 100, 1000].filter((v) => v <= yMaxMw * 1.5).map((v) => ({ h: logH(v, yMaxMw), label: `${v} MW` }));
  return { bars, gaps, fromMs, toMs, yMaxMw, ticks, yTicks, maxGapH: Math.round(maxGapH * 10) / 10 };
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface TimelineCheck { name: string; ok: boolean; detail?: string }

function pass(atMs: number, sumFrp: number, day: boolean, sat = 'N'): FirePass {
  return {
    key: `${sat}@${atMs}`, satellite: sat, fromMs: atMs, toMs: atMs, atMs, day,
    pixels: 3, frpPixels: sumFrp > 0 ? 3 : 0, sumFrp, maxFrp: sumFrp, lat: 48, lon: 11,
    meanScanKm: 0.4, pixelAreaHa: 48, bbox: [11, 48, 11, 48],
  } as FirePass;
}

export function verifyPassTimeline(): { checks: TimelineCheck[]; passed: number; total: number } {
  const checks: TimelineCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const t0 = Date.UTC(2026, 7, 20, 12, 0);

  add('ohne Überflüge: null, kein leerer Chart', passTimeline([], t0) === null);

  const ps = [pass(t0, 20, true), pass(t0 + 12 * H_MS, 5, false), pass(t0 + 26 * H_MS, 0, true, 'S'), pass(t0 + 28 * H_MS, 80, true)];
  const tl = passTimeline(ps, t0 + 30 * H_MS)!;
  add('vier Balken in Zeitreihenfolge, x steigend', tl.bars.length === 4 && tl.bars.every((b, i) => i === 0 || b.x > tl.bars[i - 1].x));
  add('log-Skala: der stärkste Balken hat Höhe 1, 5 MW liegt über 0,3', tl.bars[3].h === 1 && tl.bars[1].h > 0.3 && tl.bars[1].h < tl.bars[0].h, tl.bars.map((b) => b.h.toFixed(2)).join(','));
  add('Überflug ohne FRP: Höhe 0, Marke bleibt (hasFrp false)', tl.bars[2].h === 0 && tl.bars[2].hasFrp === false);
  add('Lücken > 6 h: 12 h und 14 h erkannt, 2 h nicht', tl.gaps.filter((g) => !g.trailing).map((g) => g.hours).join(',') === '12,14', tl.gaps.map((g) => g.hours).join(','));
  add('keine Nachlauf-Lücke, wenn der letzte Überflug 2 h alt ist', !tl.gaps.some((g) => g.trailing));
  add('längste Lücke 14 h', tl.maxGapH === 14, String(tl.maxGapH));
  add('Achse: 1/10/100 MW als Ticks (yMax 80 ⇒ 1000 fehlt)', tl.yTicks.map((y) => y.label).join(',') === '1 MW,10 MW,100 MW');
  add('alle Balken liegen im Bild (0 < x < 1)', tl.bars.every((b) => b.x > 0 && b.x < 1));

  const stale = passTimeline(ps, t0 + 50 * H_MS)!;
  add('22 h seit dem letzten Überflug ⇒ Nachlauf-Lücke bis jetzt', stale.gaps.some((g) => g.trailing && g.hours === 22), stale.gaps.map((g) => `${g.hours}${g.trailing ? 't' : ''}`).join(','));

  const one = passTimeline([pass(t0, 3, true)], t0 + H_MS)!;
  add('ein Überflug: Fenster auf 24 h aufgezogen, Balken rechts', one.toMs - one.fromMs >= 24 * H_MS && one.bars[0].x > 0.9, `${(one.toMs - one.fromMs) / H_MS} h, x=${one.bars[0].x.toFixed(2)}`);
  add('Ticks tragen dd.MM. und liegen im Bild', tl.ticks.every((t) => /^\d\d\.\d\d\.$/.test(t.label) && t.x >= 0 && t.x <= 1));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
