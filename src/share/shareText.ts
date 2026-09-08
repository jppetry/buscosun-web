/**
 * Teilen · Titel, Beschreibung und Nachrichtentext (Phase SH1, pur).
 *
 * EINE Quelle für drei Verbraucher:
 *  1. das Share-Sheet (Vorschau + `navigator.share`),
 *  2. der Nachrichtentext für WhatsApp/Gmail/Mail,
 *  3. ab SH6 die Netlify Edge Function, die daraus `og:title`/`og:description`
 *     in den `<head>` der Shell schreibt — deshalb DOM-frei und ohne React.
 *
 * Der **Link** ist eine Maschinenangabe und bleibt UTC; der **Text** ist für
 * Menschen und wird lokal formatiert (`Intl`, Zeitzone des Lesers). Das ist
 * kein Widerspruch, sondern die Arbeitsteilung: der Empfänger sieht denselben
 * Zeitpunkt, aber in seiner Uhrzeit.
 */

import type { Location } from '../types';

export type ShareLocale = 'de';

export interface ShareSubject {
  /** Kurzname der Ansicht: „Wetterkarte", „Regenradar", „Amtliche Warnungen". */
  feature: string;
  /** Was gezeigt wird: „Wind", „Böen" … — leer, wenn die Seite selbst das Thema ist. */
  topic?: string | null;
  /** Ergänzung in Klammern („10 m", „48 h"). */
  detail?: string | null;
  place?: Location | null;
  /** Gültigkeitszeit in ms; `null` = jetzt. */
  validAtMs?: number | null;
  /** Ein Satz für `og:description` / die Mail — sonst wird einer gebaut. */
  description?: string | null;
}

export interface ShareCopy {
  /** Zeile 1 der Vorschau, `og:title`, Betreff der Mail. */
  title: string;
  /** `og:description`, Fließtext der Mail. */
  description: string;
  /** Was in WhatsApp landet: Titel + Leerzeile + Link (der Link kommt vom Aufrufer). */
  message: string;
}

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** „Fr 12.09. 15:00" in der Zeitzone des Lesers; ohne Zeit: `null`. */
export function formatWhen(ms: number | null | undefined, locale: ShareLocale = 'de'): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  try {
    const p = new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : locale, {
      weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(d);
    const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
    return `${get('weekday')} ${get('day')}.${get('month')}. ${get('hour')}:${get('minute')}`;
  } catch {
    // Intl kann in exotischen Laufzeiten fehlen — dann lieber grob als gar nicht.
    return `${WD[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/**
 * Betreff einer Ansicht → Titel, Beschreibung, Nachricht.
 *
 * Beispiel: `Wetterkarte Feldberg — Wind (10 m), Fr 12.09. 15:00`
 * Ohne Ort und ohne Zeit bleibt schlicht `Wetterkarte — Wind`.
 */
export function shareCopy(s: ShareSubject, locale: ShareLocale = 'de'): ShareCopy {
  const head = s.place?.name ? `${s.feature} ${s.place.name}` : s.feature;
  const topic = s.topic ? (s.detail ? `${s.topic} (${s.detail})` : s.topic) : null;
  const when = formatWhen(s.validAtMs, locale);
  const tail = [topic, when].filter(Boolean).join(', ');
  const title = tail ? `${head} — ${tail}` : head;

  const description = s.description?.trim() || [
    topic ? `${topic} für ${s.place?.name ?? 'Deutschland, Österreich und die Schweiz'}` : `${s.feature} für ${s.place?.name ?? 'DE, AT und CH'}`,
    when ? `Stand ${when}` : 'live',
    'aus amtlichen Quellen, ohne Konto und ohne Tracker.',
  ].join(' · ');

  return { title, description, message: title };
}

/** Titel + Link als eine Nachricht (WhatsApp, Mail-Text). */
export function shareMessage(copy: ShareCopy, url: string): string {
  return `${copy.message}\n${url}`;
}

// --- Selbstverifikation (Muster D-12) ---------------------------------------

export interface ShareTextCheck { name: string; ok: boolean; detail?: string }

export function verifyShareText(): { checks: ShareTextCheck[]; passed: number; failed: number } {
  const checks: ShareTextCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const feldberg: Location = { name: 'Feldberg (Schwarzwald)', lat: 47.874, lon: 8.004, country: 'DE' };
  const t = Date.UTC(2026, 8, 12, 13, 0);

  const full = shareCopy({ feature: 'Wetterkarte', topic: 'Wind', detail: '10 m', place: feldberg, validAtMs: t });
  add('Titel nennt Ansicht, Ort, Thema und Zeit',
    full.title.startsWith('Wetterkarte Feldberg (Schwarzwald) — Wind (10 m), ') && /\d{2}:\d{2}$/.test(full.title), full.title);
  add('Nachricht = Titel + Link in zwei Zeilen',
    shareMessage(full, 'https://buscosun.com/x') === `${full.title}\nhttps://buscosun.com/x`);

  const bare = shareCopy({ feature: 'Regenradar', place: null, validAtMs: null });
  add('ohne Ort und Zeit bleibt der Titel schlicht', bare.title === 'Regenradar', bare.title);
  add('Beschreibung ist immer gefüllt und nennt die Quellenlage', bare.description.includes('ohne Tracker'), bare.description);

  const own = shareCopy({ feature: 'Amtliche Warnungen', place: feldberg, description: 'Eigener Satz.' });
  add('eigene Beschreibung gewinnt', own.description === 'Eigener Satz.');

  add('Zeit wird lokal formatiert (Wochentag, Tag.Monat, Uhrzeit)',
    /^[A-Za-zÄÖÜäöü]{2,3} \d{2}\.\d{2}\. \d{2}:\d{2}$/.test(formatWhen(t) ?? ''), formatWhen(t) ?? '—');
  add('keine Zeit ⇒ null', formatWhen(null) === null && formatWhen(undefined) === null && formatWhen(NaN) === null);

  add('kein Zeilenumbruch im Titel (WhatsApp-Vorschau bricht sonst)', !full.title.includes('\n') && !full.description.includes('\n'));

  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
