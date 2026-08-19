/**
 * Transport für die amtlichen **Schweizer Wetterwarnungen** von MeteoSchweiz,
 * bezogen über den MeteoAlarm-Feed (EUMETNET) — Datenbasis der CH-Hälfte des
 * 2D-Layers „Warnungen" (Phase W2, `audit/warnungen-at-ch.md` §8).
 *
 * **Warum zwei Abrufe statt einem** (an echten Payloads gemessen, 2026-08-08):
 * MeteoAlarm bietet drei Endpunkte, und sie liefern NICHT dasselbe.
 *  - Der **Atom-Feed** (268 kB) ist der offiziell zugesagte Vertrag, aber ein
 *    reines Verzeichnis: er trägt weder `headline` noch `description` oder
 *    `instruction`, kein `ceiling` und keine Sprachblöcke; sein `event` ist
 *    englisch. Er kann die Warn-Sonderregel („Zitat statt Zusammenfassung")
 *    also nicht allein erfüllen.
 *  - Die **JSON-Liste** ist vollständig, aber ein ~12-Tage-**Archiv**:
 *    12,9 MB unkomprimiert (der Server ignoriert `Accept-Encoding`), 6,6 s,
 *    306 Meldungen, davon 282 bereits abgelaufen — und ohne jeden
 *    Frischestempel. Das ist das 115-Fache des DWD-Vollstands für ein Zehntel
 *    der Fläche und deshalb bewusst NICHT der Weg.
 *  - Das **CAP-Dokument je Meldung** (38–48 kB), auf das jeder Atom-Eintrag
 *    selbst verlinkt, ist echtes CAP 1.2 mit allen fünf Sprachblöcken.
 *
 * Daraus folgt der hier gebaute Weg: **Atom als Index, CAP je Meldung für den
 * Inhalt.** Er hat zwei Nebenvorteile, die nicht bezahlt werden müssen:
 *  1. Es gibt genau EINEN Geometriepfad (`parseCapAlert`) — also keine zweite
 *     Stelle, an der die `lat,lon`-Drehung doppelt oder gar nicht passieren
 *     könnte (`audit/warnungen-at-ch.md` §4.3).
 *  2. CAP-Kennungen sind unveränderlich ⇒ ein Cache je Kennung ist trivial
 *     korrekt. Im Dauerbetrieb kostet ein Poll nur noch den Index.
 *
 * **Frische.** MeteoAlarm sendet auf keinem der Endpunkte `Last-Modified` oder
 * `ETag` (`cache-control: max-age=0, private, must-revalidate`). Die einzige
 * Frischebelegung ist `<updated>` im Atom-Kopf. Ohne sie wäre „keine Warnungen
 * in der Schweiz" eine Aussage ohne jeden Beleg — nach V-19 nicht anzeigbar.
 *
 * **Kein Durable-Cache** (`docs/API.md` §7): Abruf über den einfachen Rewrite
 * `/_meteoalarm/*` (`netlify.toml`, `vite.config.ts`), NICHT über die
 * gehärteten Cache-Proxys `/_dwd_grib`/`/_dwd_wind`.
 *
 * Aufrufregel wie bei DE/Z1/HA1: **nur** bei aktivem Layer und sichtbarem Tab.
 */

import {
  parseCapAlert, parseCapAtomIndex, isRenderableAlert,
  type CapAlert, type CapAtomEntry,
} from '../warnings/capAlerts';
import type { WarnRun } from './dwdCapAlerts';

/** Offizieller Vertrag: die Länder-URL IST der Latest-Alias, kein Scrape. */
const ATOM_URL = '/_meteoalarm/feeds/meteoalarm-legacy-atom-switzerland';

/**
 * Attribution in der **unveränderten** Wiedergabe-Form (`docs/API.md` §7) —
 * wie bei DE die `Quelle:`-Form, weil dieser Layer die Warnung zitiert statt
 * sie abzuleiten. MeteoAlarm verlangt zusätzlich den EUMETNET-Hinweis.
 *
 * ⚠️ Die Lizenz ist **nicht** schlicht CC BY 4.0: der Feed-Kopf sagt wörtlich
 * „terms equivalent to CC BY 4.0, with additional requirements for
 * redistributing outlined in our Terms and Conditions".
 */
export const CH_WARNINGS_ATTRIBUTION =
  'Warnungen CH: Quelle <a href="https://www.meteoswiss.admin.ch/" '
  + 'target="_blank" rel="noopener">MeteoSchweiz</a> · Data provided by EUMETNET members';

/**
 * Sprache des Steckbriefs. Die Schweizer Meldungen führen `en`/`de`/`fr`/`it`/
 * `rm` — `en` steht vorn, wäre also der stille Fehlgriff.
 */
const CH_LANGUAGE = 'de';

/**
 * Wie viele CAP-Dokumente gleichzeitig geholt werden. Klein gehalten, damit
 * die erste Aktivierung den Proxy nicht mit 33 parallelen Anfragen trifft.
 */
const FETCH_CONCURRENCY = 6;

/**
 * Cache je CAP-Kennung. Kennungen sind unveränderlich — eine einmal geholte
 * Meldung ändert sich nie, sie verschwindet nur aus dem Index. Deshalb ist
 * dieser Cache anders als ein Durable-Cache **nicht** frischerelevant: er hält
 * unveränderliche Dokumente, nicht den Warnstand.
 */
const _alertCache = new Map<string, CapAlert>();

/** Cache des zusammengesetzten Standes — Muster und TTL wie bei DE. */
let _cache: { run: ChWarnRun; at: number } | null = null;
const CACHE_TTL = 60_000;

export interface ChWarnRun extends WarnRun {
  /**
   * Meldungen, deren amtlicher Wortlaut nicht geladen werden konnte. Sie
   * werden NICHT gezeichnet — eine Warnfläche ohne ihren Text wäre nach der
   * Sonderregel wertlos. Die Zahl wird mitgeführt, damit der Aufrufer sie
   * ausweisen kann, statt sie als „gibt es nicht" auszugeben (D-04).
   */
  textUnavailable: number;
  /**
   * Meldungen, die zum Abrufzeitpunkt bereits abgelaufen waren. Sie werden
   * bewusst gar nicht erst geholt: der Zeitregler läuft ausschließlich
   * vorwärts, sie könnten also nie sichtbar werden. Kein stiller Deckel —
   * die Zahl steht hier und geht in `dropped` NICHT ein.
   */
  skippedExpired: number;
  /** Meldungen, bei denen die deutsche Fassung fehlte (Rückfall auf `en`). */
  languageFallbacks: number;
}

/** Ein CAP-Dokument holen und mit den CH-Konventionen parsen. */
async function fetchAlert(entry: CapAtomEntry, signal?: AbortSignal): Promise<CapAlert | null> {
  const cached = _alertCache.get(entry.id);
  if (cached) return cached;

  // Der Feed nennt absolute Fremd-URLs; sie müssen über denselben Rewrite
  // laufen wie der Index, sonst greift wieder die CORS-Sperre.
  const url = entry.capUrl.replace(/^https:\/\/feeds\.meteoalarm\.org/, '/_meteoalarm');
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`MeteoAlarm CH: HTTP ${res.status}`);
  const alert = parseCapAlert(await res.text(), {
    // ⚠️ Die beiden Schweizer Konventionen — beide bewusst gesetzt, keine
    // greift durch Zufall (`audit/warnungen-at-ch.md` §4.1, §4.2).
    altitudeUnit: 'metres',
    language: CH_LANGUAGE,
  });
  if (alert) _alertCache.set(entry.id, alert);
  return alert;
}

/** `items` in Gruppen abarbeiten, ohne eine Fremdbibliothek (D-06). */
async function mapLimited<T, R>(
  items: T[], limit: number, fn: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const out: Array<PromiseSettledResult<R>> = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await Promise.allSettled([fn(items[i])]).then((r) => r[0]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Aktuellen Schweizer Warnstand holen.
 *
 * **Null Warnungen ist kein Fehler**, sondern die häufigste richtige Antwort.
 * Der Aufrufer muss den Leerfall als Aussage darstellen — und darf das hier
 * nur, weil `publishedMs` aus dem Atom-`<updated>` belegt, wie frisch die
 * Aussage ist.
 */
export async function fetchChWarnings(signal?: AbortSignal): Promise<ChWarnRun> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL) return _cache.run;

  const res = await fetch(ATOM_URL, { signal });
  if (!res.ok) throw new Error(`MeteoAlarm CH: HTTP ${res.status}`);
  const index = parseCapAtomIndex(await res.text());

  // Abgelaufenes gar nicht erst holen — der Regler läuft nur vorwärts.
  const now = Date.now();
  const live = index.entries.filter((e) => e.expiresMs == null || e.expiresMs > now);
  const skippedExpired = index.entries.length - live.length;

  const settled = await mapLimited(live, FETCH_CONCURRENCY, (e) => fetchAlert(e, signal));

  const alerts: CapAlert[] = [];
  let textUnavailable = 0;
  let unparsable = 0;
  for (const r of settled) {
    if (r.status === 'rejected') { textUnavailable++; continue; }
    if (!r.value) { unparsable++; continue; }
    alerts.push(r.value);
  }

  const renderable = alerts.filter(isRenderableAlert);
  const latestSentMs = renderable.reduce<number | null>(
    (acc, a) => (a.sentMs != null && (acc == null || a.sentMs > acc) ? a.sentMs : acc), null);

  const run: ChWarnRun = {
    alerts: renderable,
    entries: index.entries.length,
    // Wie bei DE: „0 Warnungen" darf nie „30 nicht gelesen" heißen.
    dropped: index.skipped + unparsable + (alerts.length - renderable.length),
    // Der Atom-Stempel ist die EINZIGE Frischebelegung dieser Quelle.
    publishedMs: index.updatedMs,
    latestSentMs,
    textUnavailable,
    skippedExpired,
    languageFallbacks: renderable.filter((a) => a.languageFallback).length,
  };
  _cache = { run, at: Date.now() };
  return run;
}
