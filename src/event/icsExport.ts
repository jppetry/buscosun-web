/**
 * P0 — .ics-Kalenderexport fürs Event-Feature.
 *
 * Backend-freier Ersatz fürs (noch) fehlende Push: der Nutzer lädt den besten Tag
 * (bzw. alle Phasen) als Standard-iCalendar herunter und bekommt die Erinnerung
 * übers eigene Kalender-/Handy-System. Reines Client-seitiges Erzeugen — keine
 * neue Quelle, kein Server. Zeiten als „floating local time" (ohne TZID/Z): in
 * DACH gilt durchgängig CET/CEST, daher interpretiert jede App die Ortszeit korrekt.
 */

import type { EventQuery } from './eventModel';
import type { DayResult, PhaseResult } from './eventScoring';

/** RFC-5545-Escaping für TEXT-Werte (Reihenfolge: Backslash zuerst). */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Zeilenfaltung: iCalendar-Zeilen ≤ 75 Oktette; Fortsetzung mit CRLF + Leerzeichen.
 *  Wir falten konservativ nach 72 Zeichen (Umlaute = 2 Byte ⇒ Sicherheitsmarge). */
function foldLine(line: string): string {
  if (line.length <= 72) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 72));
  rest = rest.slice(72);
  while (rest.length > 71) {
    parts.push(' ' + rest.slice(0, 71));
    rest = rest.slice(71);
  }
  if (rest.length) parts.push(' ' + rest);
  return parts.join('\r\n');
}

/** Lokale Zeit als YYYYMMDDTHHMMSS (floating, ohne Zeitzonen-Suffix). */
function fmtLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

/** UTC-Zeitstempel als YYYYMMDDTHHMMSSZ (für DTSTAMP). */
function fmtUtc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/** Start-/Endzeitpunkt einer Phase auf einem ISO-Tag (end ≤ start ⇒ über Mitternacht). */
function phaseTimes(dateISO: string, hours: [number, number]): { start: Date; end: Date } {
  const [y, mo, d] = dateISO.split('-').map(Number);
  const [sh, eh] = hours;
  const start = new Date(y, mo - 1, d, sh, 0, 0);
  // end ≤ start ⇒ nächster Tag (z. B. Nacht 22→6). end = 24 ⇒ Tagesende = Folgetag 0 Uhr.
  const dayOffset = eh <= sh ? 1 : 0;
  const end = new Date(y, mo - 1, d + dayOffset, eh, 0, 0);
  return { start, end };
}

/** Kompakter Slug für die UID. */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'phase';
}

/** Wetter-Beschreibung einer Phase fürs DESCRIPTION-Feld. */
function phaseDescription(phase: PhaseResult, best: DayResult, query: EventQuery): string {
  const lines: string[] = [];
  const scored = !!phase.summary;
  lines.push(`Wetter-Score ${scored ? `${phase.score}/100` : '—'} · ${phase.rationale || phase.reason || best.rationale}`);
  if (phase.confidenceNote) lines.push(`Verlässlichkeit: ${phase.confidenceNote}${phase.isTendency ? ' (Tendenz)' : ''}`);
  const factors = (phase.factors.length ? phase.factors : best.factors)
    .map((f) => `${f.label} ${f.valueText}`).join(' · ');
  if (factors) lines.push(`Faktoren: ${factors}`);
  if (phase.risks.length) lines.push(`Achtung: ${phase.risks.map((r) => `${r.label} (${r.detail})`).join('; ')}`);
  lines.push('');
  lines.push(`Anlass: ${query.activity.label} · Ort: ${query.location.name}`);
  lines.push('Geplant mit buscosun · Quellen: DWD · GeoSphere · MeteoSwiss (höhenkorrigiert)');
  return lines.join('\n');
}

/** Ein VEVENT-Block (Array von ungefalteten Zeilen). */
function vevent(opts: {
  uid: string; dtstamp: string; start: Date; end: Date;
  summary: string; location: string; geo: string; description: string;
}): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${opts.dtstamp}`,
    `DTSTART:${fmtLocal(opts.start)}`,
    `DTEND:${fmtLocal(opts.end)}`,
    `SUMMARY:${escapeText(opts.summary)}`,
    `LOCATION:${escapeText(opts.location)}`,
    `GEO:${opts.geo}`,
    `DESCRIPTION:${escapeText(opts.description)}`,
    // Erinnerung am Vortag (Display-Alarm).
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(opts.summary)} — morgen`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
  ];
}

/**
 * Baut den vollständigen iCalendar-Text für den besten Tag.
 * Mehrere Phasen ⇒ je Phase ein VEVENT (z. B. Hochzeit: Trauung/Empfang/Abendfeier).
 */
export function buildEventICS(query: EventQuery, best: DayResult): string {
  const dtstamp = fmtUtc(new Date());
  const geo = `${query.location.lat.toFixed(5)};${query.location.lon.toFixed(5)}`;
  const latKey = Math.round(query.location.lat * 1000);
  const lonKey = Math.round(query.location.lon * 1000);
  const multi = best.phases.length > 1;

  // Fallback, falls (theoretisch) keine Phasen vorliegen: ganzer Tag 8–20 Uhr.
  const phases: PhaseResult[] = best.phases.length
    ? best.phases
    : [{ label: query.activity.label, hours: [8, 20], summary: null, score: best.score, reason: best.reason, factors: best.factors, downside: best.downside, rationale: best.rationale, confidence: best.confidence, confidenceNote: best.confidenceNote, forecastConf: best.forecastConf, isTendency: best.isTendency, risks: best.risks }];

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//buscosun//Event-Planung//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const phase of phases) {
    const { start, end } = phaseTimes(best.date, phase.hours);
    const summary = multi
      ? `${query.activity.label}: ${phase.label}`
      : `${query.activity.label} — bester Tag (Score ${best.score})`;
    const uid = `buscosun-${best.date}-${slug(phase.label)}-${latKey}-${lonKey}@buscosun.com`;
    lines.push(...vevent({
      uid, dtstamp, start, end, summary,
      location: query.location.name, geo,
      description: phaseDescription(phase, best, query),
    }));
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Löst den Datei-Download des iCalendars im Browser aus. */
export function downloadEventICS(query: EventQuery, best: DayResult): void {
  const ics = buildEventICS(query, best);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `buscosun-${slug(query.activity.label)}-${best.date}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Object-URL nach kurzem Tick freigeben (Safari braucht den Tick).
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
