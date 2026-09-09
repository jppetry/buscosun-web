/**
 * Teilen · Öffnen (Phase SH2).
 *
 * Das Bindeglied zwischen dem Knopf und dem Sheet — und bewusst der EINZIGE
 * Ort, an dem beim Klick etwas passiert:
 *
 *  1. **Die URL ist die Wahrheit.** Der Zustand wird nicht aus Props
 *     zusammengesammelt, sondern aus `window.location` gelesen und mit
 *     `parseShareUrl` ausgelegt. Damit teilt der Nutzer garantiert genau das,
 *     was in seiner Adresszeile steht — und die Share-Logik hängt an keinem
 *     Renderpfad (LZ1-Auflage: nichts kosten, solange niemand klickt).
 *     Randfall: Kamera-Änderungen schreibt die Route mit 300 ms Verzögerung;
 *     ein Klick unmittelbar nach dem Schwenken kann den Ausschnitt um diese
 *     Spanne älter zeigen. Ein Klick dauert länger als 300 ms — in der Praxis
 *     unauffällig, hier trotzdem genannt.
 *  2. **Native zuerst, eigenes Menü nur als Rückfall** (Jans Vorgabe für Mobil).
 *
 * Diese Datei wird erst beim ersten Klick geladen (dynamischer Import in
 * `ShareButton.tsx`) und zieht die Adapter, die Ortstabelle und die Kanäle
 * mit — der Erstbild-Pfad der Karte bleibt unberührt.
 */

import { buildShareUrl, parseShareUrl, type ShareState } from './shareAdapters';
import type { ShareCopy } from './shareText';
import type { ShareLengthVerdict } from './shareSchema';

export interface ShareSnapshot {
  state: ShareState;
  /** Vollständige URL mit Origin — das, was kopiert und verschickt wird. */
  url: string;
  copy: ShareCopy;
  /** Titel + Link, fertig für einen Chat. */
  message: string;
  verdict: ShareLengthVerdict;
  /** Der geteilte Zeitpunkt lag beim Öffnen in der Vergangenheit (V-SH-2). */
  timePast: boolean;
  /** Der Ort-Slug im Pfad ließ sich nicht auflösen. */
  placeUnresolved: boolean;
}

/**
 * Aktuelle Adresszeile → teilbarer Link. `null`, wenn die Seite (noch) keinen
 * teilbaren Zustand hat — dann zeigt der Knopf gar nicht erst etwas an.
 */
export function shareSnapshot(loc: { pathname: string; search: string; origin: string } = window.location, nowMs: number = Date.now()): ShareSnapshot | null {
  const state = parseShareUrl(loc.pathname, loc.search, nowMs);
  if (!state) return null;
  const built = buildShareUrl(state, loc.origin, nowMs);
  return {
    state,
    url: built.url,
    copy: built.copy,
    message: built.message,
    verdict: built.verdict,
    timePast: !!state.timePast,
    placeUnresolved: !!state.placeUnresolved,
  };
}

/** Steht das native Teilen-Blatt des Geräts bereit? */
export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export type NativeShareResult = 'shared' | 'cancelled' | 'unavailable';

/**
 * Natives Teilen-Blatt. Drei Ausgänge, die der Aufrufer unterscheiden MUSS:
 *
 *  - `shared`     — erledigt, kein eigenes Menü zeigen;
 *  - `cancelled`  — der Nutzer hat abgebrochen (`AbortError`); **auch dann kein
 *                   eigenes Menü** — sonst bekommt er ausgerechnet nach dem
 *                   Abbrechen ein zweites Fenster vor die Nase;
 *  - `unavailable` — die Schnittstelle fehlt oder ist gescheitert ⇒ Rückfall
 *                   auf das eigene Menü.
 */
export async function tryNativeShare(snap: ShareSnapshot): Promise<NativeShareResult> {
  if (!canNativeShare()) return 'unavailable';
  try {
    await navigator.share({ title: snap.copy.title, text: snap.copy.title, url: snap.url });
    return 'shared';
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    return name === 'AbortError' ? 'cancelled' : 'unavailable';
  }
}

/**
 * Lange URL für die Vorschau mittig kürzen — **nur** wenn sie wirklich lang ist.
 * Die volle URL zu zeigen ist Teil des Vertrauens (Jans Vorgabe); gekürzt wird
 * erst ab `max`, und der volle Text bleibt über `title` und beim Kopieren erhalten.
 */
export const PREVIEW_FULL_MAX = 90;

export function previewUrl(url: string, max: number = PREVIEW_FULL_MAX): string {
  if (url.length <= max) return url;
  const head = Math.ceil((max - 1) / 2);
  const tail = max - 1 - head;
  return `${url.slice(0, head)}…${url.slice(url.length - tail)}`;
}

// --- Selbstverifikation (Muster D-12) ---------------------------------------

export interface ShareOpenCheck { name: string; ok: boolean; detail?: string }

export function verifyShareOpen(): { checks: ShareOpenCheck[]; passed: number; failed: number } {
  const checks: ShareOpenCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const now = Date.UTC(2026, 8, 12, 12, 0);
  const origin = 'https://buscosun.com';

  const snap = shareSnapshot({ origin, pathname: '/wetterkarte/wind/muenchen', search: '?l=boeen&t=2026-09-12T15:00Z' }, now);
  add('Schnappschuss aus der Adresszeile', !!snap && snap.url === 'https://buscosun.com/wetterkarte/wind/muenchen?t=2026-09-12T15:00Z&l=boeen', snap?.url);
  add('Titel nennt Ansicht, Ort und Zeit', !!snap && snap.copy.title.startsWith('Wetterkarte München — Wind, '), snap?.copy.title);
  add('Nachricht = Titel + Link', !!snap && snap.message === `${snap.copy.title}\n${snap.url}`);
  add('Längenurteil ok', snap?.verdict === 'ok');

  const alt = shareSnapshot({ origin, pathname: '/wetterkarte/wind', search: '?t=2026-09-12T09:00Z' }, now);
  add('alter Link wird als „Zeitpunkt vergangen" gemeldet (V-SH-2)', alt?.timePast === true);
  const bad = shareSnapshot({ origin, pathname: '/wetterkarte/wind/gibtsnicht', search: '' }, now);
  add('unauflösbarer Ort wird gemeldet, statt still zu verschwinden', bad?.placeUnresolved === true && bad.state.place === null);
  // Die Tourenplanung ist die eine Seite, die NICHT teilbar werden kann:
  // eine GPX passt in keine URL (audit/teilen-share.md §1.8).
  add('nicht teilbare Seite ⇒ kein Schnappschuss (der Knopf zeigt dort nichts)',
    shareSnapshot({ origin, pathname: '/tourenplanung', search: '' }, now) === null);
  const dirty = shareSnapshot({ origin, pathname: '/wetterkarte/wind', search: '?lz=0' }, now);
  add('Diagnose-Schalter überleben das Teilen nicht', !!dirty && !dirty.url.includes('lz='), dirty?.url);

  // Vorschau
  const short = 'https://buscosun.com/regenradar/muenchen';
  add('kurze URL wird VOLLSTÄNDIG gezeigt', previewUrl(short) === short);
  const long = 'https://buscosun.com/wetterkarte/wind/feldberg-schwarzwald?ort=Feldberg%20(Schwarzwald)&olat=47.8744&olon=8.0043&t=2026-09-12T15:00Z';
  add('lange URL wird MITTIG gekürzt, Anfang und Ende bleiben lesbar',
    previewUrl(long).length === PREVIEW_FULL_MAX && previewUrl(long).startsWith('https://buscosun.com/wetterkarte')
    && previewUrl(long).endsWith('T15:00Z') && previewUrl(long).includes('…'), previewUrl(long));
  add('gekürzt wird erst ab der Grenze', previewUrl('x'.repeat(PREVIEW_FULL_MAX)).length === PREVIEW_FULL_MAX
    && !previewUrl('x'.repeat(PREVIEW_FULL_MAX)).includes('…'));

  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
