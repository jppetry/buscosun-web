/**
 * **7-Tage-Historie der kartierten Brandflächen** (Phase BF4, Gate GBF1).
 *
 * ── Warum ein Filter und kein zweiter Abruf ─────────────────────────────────
 * BF0 hat es am Bestand gemessen (`audit/brandflaechen-echtzeit.md` §6): von den
 * 23 Flächen in `ms:modis.ba.poly.week` fehlt **keine einzige** im Saison-Korb.
 * `week ⊂ season` gilt vollständig. Ein eigener Abruf für die Historie wäre also
 * ein zweites Mal dieselben Bytes — der Saison-Korb liegt ohnehin schon da,
 * sobald der Brandflächen-Layer an ist.
 *
 * (Der kleine `fetchBurntWeek()`-Abruf in `euContext.ts` bleibt davon unberührt:
 * er trägt die **Bestätigung** der Detektionen und läuft auch, wenn der
 * Brandflächen-Layer aus ist — V-225. Das hier ist die **Anzeige**.)
 *
 * ── `FIREDATE`, nicht `LASTUPDATE` ──────────────────────────────────────────
 * Der Nutzer fragt, **wann es gebrannt hat** — nicht, wann Copernicus die
 * Fläche verarbeitet hat. Die Zeitachse läuft deshalb über `FIREDATE`.
 * `LASTUPDATE` ist etwas anderes und wird auch als etwas anderes gezeigt: als
 * **Frischestempel** („Stand"), damit sichtbar bleibt, wie alt die Kartierung
 * selbst ist. Gemessene Latenz zwischen beiden im Wochenkorb: min 0,3 d,
 * **Median 1,8 d**, max 4,3 d.
 *
 * Genau darin liegt auch der Grund, warum der Server-Korb `week` und ein
 * `FIREDATE`-Filter nicht deckungsgleich sind: zwei der 23 Wochen-Flächen haben
 * ein `FIREDATE`, das älter als sieben Tage ist. Der Server bildet den Korb
 * offenbar über `LASTUPDATE` oder `CLASS`. Für die Anzeige gilt `FIREDATE`.
 *
 * ── Die Körbe überlappen sich nie ───────────────────────────────────────────
 * `archive` ist schon heute das zeitliche Komplement von `season` (Vorjahre).
 * `week` ist es genauso: ist er eingeblendet, zeigt `season` nur noch die
 * **älteren** Flächen der laufenden Saison. Sonst läge jede frische Fläche
 * doppelt übereinander — derselbe Fehler, den BF3 bei Raster und Kartierung
 * beseitigt, nur eine Ebene tiefer.
 *
 * Pur, DOM-frei, ohne Modulzustand — `npm run verify:fire-footprint`.
 */

import type { BurntPolygon } from '../fireCorroboration';

/** Fenster der Historie in Tagen. Entspricht dem Server-Korb `week`. */
export const HISTORY_DAYS = 7;

const DAY_MS = 86_400_000;

/** Beginn des UTC-Tages, in dem `ms` liegt. */
export function utcDayStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Der Zeitraum der Historie: von 00:00 UTC vor `days − 1` Tagen bis jetzt.
 * Tagesgenau statt auf die Minute — sonst fiele ein Brand von gestern 08:00 aus
 * dem Fenster, sobald man nachmittags nachsieht.
 */
export function historyWindow(nowMs: number, days = HISTORY_DAYS): { fromMs: number; toMs: number } {
  const today = utcDayStart(nowMs);
  return { fromMs: today - (days - 1) * DAY_MS, toMs: today + DAY_MS };
}

/**
 * Liegt das **Branddatum** im Fenster? Flächen ohne `FIREDATE` fallen heraus —
 * eine Fläche ohne Datum in eine Zeitachse zu hängen, wäre eine Behauptung.
 */
export function inHistory(p: BurntPolygon, nowMs: number, days = HISTORY_DAYS): boolean {
  if (p.firedateMs == null) return false;
  const { fromMs, toMs } = historyWindow(nowMs, days);
  return p.firedateMs >= fromMs && p.firedateMs < toMs;
}

/**
 * Auf einen einzelnen Tag der Historie eingeschränkt.
 * `dayOffset` 0 = heute, −1 = gestern, … −6 = vor sechs Tagen.
 * `null` = alle Tage des Fensters.
 */
export function onHistoryDay(p: BurntPolygon, nowMs: number, dayOffset: number | null): boolean {
  if (!inHistory(p, nowMs)) return false;
  if (dayOffset == null) return true;
  if (p.firedateMs == null) return false;
  const start = utcDayStart(nowMs) + dayOffset * DAY_MS;
  return p.firedateMs >= start && p.firedateMs < start + DAY_MS;
}

/** Die Kennungen der Flächen im Fenster — zum Filtern der GeoJSON-Features. */
export function historyIds(
  polys: readonly BurntPolygon[], nowMs: number, dayOffset: number | null = null,
): Set<string> {
  const out = new Set<string>();
  for (const p of polys) if (onHistoryDay(p, nowMs, dayOffset)) out.add(p.id);
  return out;
}

/** Features einer Sammlung auf eine Kennungsmenge einschränken (`keep`) oder sie herausnehmen. */
export function filterFeaturesById(
  fc: GeoJSON.FeatureCollection | null, ids: ReadonlySet<string>, keep: boolean,
): GeoJSON.FeatureCollection | null {
  if (!fc) return null;
  const features = fc.features.filter((f) => ids.has(String(f.properties?.id)) === keep);
  return { type: 'FeatureCollection', features };
}

/** Jüngste Bearbeitung durch EFFIS in einer Auswahl — der Frischestempel. */
export function latestUpdateMs(polys: readonly BurntPolygon[], ids?: ReadonlySet<string>): number | null {
  let out: number | null = null;
  for (const p of polys) {
    if (ids && !ids.has(p.id)) continue;
    if (p.lastUpdateMs != null && (out == null || p.lastUpdateMs > out)) out = p.lastUpdateMs;
  }
  return out;
}

const fmtDay = (ms: number): string =>
  new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

/** Beschriftung eines Tagesschritts — „heute", „gestern", sonst das Datum. */
export function historyDayLabel(nowMs: number, dayOffset: number | null): string {
  if (dayOffset == null) return `${HISTORY_DAYS} Tage`;
  if (dayOffset === 0) return 'heute';
  if (dayOffset === -1) return 'gestern';
  return fmtDay(utcDayStart(nowMs) + dayOffset * DAY_MS);
}

/**
 * Die Zeile im Readout. Nennt **beide** Zeiten getrennt und benannt: den
 * Brandzeitraum (`FIREDATE`) und den Stand der Kartierung (`LASTUPDATE`).
 * Ohne diese Trennung liest man den Stand als Brandzeitpunkt.
 */
export function historyNote(
  count: number, nowMs: number, dayOffset: number | null, lastUpdate: number | null,
): string {
  const { fromMs } = historyWindow(nowMs);
  const span = dayOffset == null
    ? `Branddatum ${fmtDay(fromMs)}–${fmtDay(nowMs)}`
    : `Branddatum ${historyDayLabel(nowMs, dayOffset)}`;
  const flaechen = count === 1 ? '1 Fläche' : `${count} Flächen`;
  const stand = lastUpdate == null
    ? 'Stand der Kartierung unbekannt'
    : `Kartierung zuletzt bearbeitet ${fmtDay(lastUpdate)}`;
  return `${flaechen} · ${span} · ${stand}`;
}

/** Der Hinweis, der IMMER dazugehört: die Kartierung hinkt dem Brand nach. */
export const HISTORY_LATENCY_NOTE =
  'EFFIS kartiert nach Satellitenbild und mit Verzug — gemessen 0,3 bis 4,3 Tage zwischen Brand '
  + 'und Kartierung (Median 1,8). Ein Brand von heute fehlt hier fast immer; er steht als '
  + 'Satellitendetektion in der Ebene „Aktive Brände".';

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface HistoryCheck { name: string; ok: boolean; detail?: string }

export function verifyHistory(): { checks: HistoryCheck[]; passed: number; total: number } {
  const checks: HistoryCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  // „Jetzt" bewusst mitten am Tag, damit die Tagesgrenzen wirklich geprüft werden.
  const NOW = Date.UTC(2026, 7, 16, 14, 37);
  const day = (o: number, h = 10) => Date.UTC(2026, 7, 16 + o, h);

  const mk = (id: string, firedateMs: number | null, lastUpdateMs: number | null = null): BurntPolygon => ({
    id, firedateMs, finaldateMs: null, lastUpdateMs, areaHa: 3, country: 'DE', province: null,
    commune: null, percNa2k: 0, polys: [], bbox: [10, 50, 10.1, 50.1],
    landcover: { CONIFER: 100, BROADLEA: 0, MIXED: 0, SCLEROPH: 0, TRANSIT: 0, OTHERNATLC: 0, AGRIAREAS: 0, ARTIFSURF: 0, OTHERLC: 0 },
  });

  add('Fenster umfasst 7 Kalendertage einschließlich heute', (() => {
    const w = historyWindow(NOW);
    return w.toMs - w.fromMs === 7 * DAY_MS && w.fromMs === utcDayStart(day(-6));
  })());
  add('Brand von heute früh liegt im Fenster (Tagesgrenze, nicht Uhrzeit)',
    inHistory(mk('a', day(0, 2)), NOW));
  add('Brand von heute Abend (nach „jetzt") liegt im Fenster',
    inHistory(mk('b', day(0, 23)), NOW));
  add('Brand vor 6 Tagen liegt im Fenster', inHistory(mk('c', day(-6, 1)), NOW));
  add('Brand vor 7 Tagen liegt NICHT mehr im Fenster', !inHistory(mk('d', day(-7, 23)), NOW));
  add('Fläche ohne Branddatum fällt heraus (keine Behauptung)', !inHistory(mk('e', null), NOW));

  // --- Tagesschritt -----------------------------------------------------------
  const gestern = mk('g', day(-1, 8));
  add('Tagesfilter: gestern trifft gestern', onHistoryDay(gestern, NOW, -1));
  add('Tagesfilter: gestern trifft NICHT heute', !onHistoryDay(gestern, NOW, 0));
  add('Tagesfilter null ⇒ alle Tage des Fensters', onHistoryDay(gestern, NOW, null));
  add('Tagesfilter greift nie über das Fenster hinaus', !onHistoryDay(mk('h', day(-9)), NOW, -9));

  // --- Kennungen und Feature-Filter -------------------------------------------
  const polys = [mk('1', day(0)), mk('2', day(-1)), mk('3', day(-10)), mk('4', null)];
  const ids = historyIds(polys, NOW);
  add('historyIds nimmt nur die Flächen im Fenster', ids.size === 2 && ids.has('1') && ids.has('2'),
    [...ids].join(','));
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: ['1', '2', '3', '4'].map((id) => ({
      type: 'Feature', properties: { id }, geometry: { type: 'Point', coordinates: [10, 50] },
    })),
  };
  const fresh = filterFeaturesById(fc, ids, true);
  const older = filterFeaturesById(fc, ids, false);
  add('Filter „behalten" liefert genau die frischen Flächen', fresh?.features.length === 2);
  add('Filter „herausnehmen" liefert genau die übrigen', older?.features.length === 2);
  add('die beiden Filter überlappen sich NICHT und verlieren nichts', (() => {
    const a = new Set(fresh?.features.map((f) => String(f.properties?.id)));
    const b = new Set(older?.features.map((f) => String(f.properties?.id)));
    for (const x of a) if (b.has(x)) return false;
    return a.size + b.size === fc.features.length;
  })());
  add('null-Sammlung bleibt null', filterFeaturesById(null, ids, true) === null);

  // --- Frischestempel ----------------------------------------------------------
  const withUpd = [mk('1', day(0), day(0, 12)), mk('2', day(-1), day(-3, 12)), mk('3', day(-10), day(0, 23))];
  add('Frischestempel ist die jüngste Bearbeitung der AUSWAHL, nicht aller',
    latestUpdateMs(withUpd, new Set(['1', '2'])) === day(0, 12));
  add('ohne Auswahl: die jüngste überhaupt', latestUpdateMs(withUpd) === day(0, 23));
  add('ohne LASTUPDATE ⇒ null', latestUpdateMs([mk('x', day(0))]) === null);

  // --- Sprache ------------------------------------------------------------------
  const note = historyNote(2, NOW, null, day(0, 12));
  add('Readout nennt Branddatum UND Stand getrennt',
    /Branddatum/.test(note) && /zuletzt bearbeitet/.test(note) && /2 Flächen/.test(note), note);
  add('Readout verwechselt Stand nicht mit Brandzeitpunkt',
    !/gebrannt am .*bearbeitet/.test(note) && note.indexOf('Branddatum') < note.indexOf('bearbeitet'));
  add('Tagesbeschriftung: heute, gestern, sonst Datum',
    historyDayLabel(NOW, 0) === 'heute' && historyDayLabel(NOW, -1) === 'gestern'
    && /^\d{2}\.\d{2}\.$/.test(historyDayLabel(NOW, -3)), historyDayLabel(NOW, -3));
  add('Latenz-Hinweis nennt die gemessene Spanne und verweist auf die Detektionen',
    /0,3 bis 4,3 Tage/.test(HISTORY_LATENCY_NOTE) && /Aktive Brände/.test(HISTORY_LATENCY_NOTE));
  add('kein „bestätigt"-Vokabular in der Historie',
    !/bestätigt|verifiziert/i.test(HISTORY_LATENCY_NOTE + note));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
