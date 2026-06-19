/**
 * Feature „Wetterhistorie" — automatische Klartext-Zusammenfassungen (E6.8).
 * „Zahlen vor Diagramm-Zwang": jede Visualisierung bekommt 1–2 Sätze.
 */

import { fmtNum } from './charts/common';
import type { Bucket, TrendResult, VariableMeta } from './historyModel';

/** Zusammenfassung für Anomalie/Trend (E6.8). */
export function summarizeTrend(buckets: Bucket[], normal: number | null, trend: TrendResult | null, meta: VariableMeta, normalLabel: string): string {
  const data = buckets.filter((b) => b.value != null);
  if (data.length < 2) return 'Zu wenige Daten für eine Aussage.';
  const last = data[data.length - 1];
  const parts: string[] = [];
  if (normal != null) {
    const dev = (last.value as number) - normal;
    const dir = dev >= 0 ? 'wärmer' : 'kälter';
    const word = meta.key === 'precip' ? (dev >= 0 ? 'nasser' : 'trockener') : meta.diverging ? dir : (dev >= 0 ? 'höher' : 'niedriger');
    parts.push(`${last.label}: ${fmtNum(Math.abs(dev))} ${meta.unit} ${word} als das Mittel ${normalLabel}.`);
  }
  if (trend) {
    const dir = trend.slopePerDecade >= 0 ? 'Zunahme' : 'Abnahme';
    parts.push(`Langfristiger Trend: ${dir} um ${fmtNum(Math.abs(trend.slopePerDecade), 2)} ${meta.unit} pro Jahrzehnt.`);
  }
  return parts.join(' ');
}

/** Zusammenfassung für Kenntage (E6.8). */
export function summarizeKenntage(data: { year: number; count: number; n: number }[], label: string): string {
  const valid = data.filter((d) => d.n > 0);
  if (valid.length < 2) return 'Zu wenige Jahre für eine Aussage.';
  const recent = valid.slice(-10), early = valid.slice(0, 10);
  const avgRecent = recent.reduce((s, d) => s + d.count, 0) / recent.length;
  const avgEarly = early.reduce((s, d) => s + d.count, 0) / early.length;
  const rec = valid.reduce((a, b) => (b.count > a.count ? b : a), valid[0]);
  const trend = avgRecent > avgEarly + 1 ? `zuletzt deutlich mehr (Ø ${fmtNum(avgRecent, 0)} vs. ${fmtNum(avgEarly, 0)} früher)` :
    avgRecent < avgEarly - 1 ? `zuletzt seltener (Ø ${fmtNum(avgRecent, 0)} vs. ${fmtNum(avgEarly, 0)} früher)` : 'über die Jahre relativ stabil';
  return `${label}: ${trend}. Rekordjahr ${rec.year} mit ${rec.count}.`;
}

/** Zusammenfassung für Streifen/Verlauf (E6.8). */
export function summarizeSeries(buckets: Bucket[], meta: VariableMeta): string {
  const data = buckets.filter((b) => b.value != null);
  if (data.length < 2) return '';
  const first = data[0], last = data[data.length - 1];
  const diff = (last.value as number) - (first.value as number);
  const span = `${first.year}–${last.year}`;
  const verb = meta.key === 'precip' ? (diff >= 0 ? 'mehr Niederschlag' : 'weniger Niederschlag') : (diff >= 0 ? 'höher' : 'niedriger');
  return `${meta.label} ${span}: zuletzt ${fmtNum(Math.abs(diff))} ${meta.unit} ${verb} als am Anfang des Zeitraums.`;
}
