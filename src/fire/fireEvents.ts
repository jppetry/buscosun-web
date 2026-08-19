/**
 * Brandereignisse aus einzelnen Satellitendetektionen (Phase F2).
 *
 * ── Was dieses Modul löst ───────────────────────────────────────────────────
 * Ein Feuer erzeugt nicht eine Detektion, sondern viele: mehrere Pixel je
 * Überflug, mehrere Überflüge je Tag (drei Satelliten × Tag/Nacht), über Tage
 * hinweg. Die Karte zeigt bisher jede einzeln — 6.068 Punkte im 7-Tage-Fenster,
 * ohne Antwort auf die Frage, die zählt: *Sind das viele Feuer oder wenige?*
 *
 * Dieses Modul fasst Detektionen zu **Ereignissen** zusammen und leitet daraus
 * ab, was sich messen lässt: Zeitraum, Überflugzahl, Pixelzahl, Ausdehnung,
 * Summe der Feuerstrahlungsleistung, Tendenz. **Kein zusätzlicher Abruf** — es
 * rechnet auf den Zeilen, die für die Karte ohnehin geladen sind.
 *
 * ── Warum eine Heuristik statt eines Feldes ─────────────────────────────────
 * Die FIRMS-NRT-Antwort führt **keine Spalte `type`** (0 Vegetation, 1 Vulkan,
 * 2 statische Landquelle, 3 offshore) — in F0 am eigenen Schlüssel geprüft
 * (`audit/waldbrand-firms.md` §4.1). Damit fehlt der direkte Filter gegen
 * Industrie-Fehlalarme, und der ist nicht optional: **39,3 %** aller Detektionen
 * in DACH entfallen auf Zellen, die an ≥4 von 5 Tagen getroffen werden — die
 * hartnäckigsten sind namentlich identifizierbar (ThyssenKrupp Duisburg,
 * voestalpine Linz). Ungefiltert wäre „Aktive Brände" zu zwei Fünfteln eine
 * Karte der Schwerindustrie.
 *
 * ── Die Regel, und warum sie zwei Bedingungen hat (Jans Entscheidung) ───────
 * Persistenz **allein** genügt nicht. Ein großer, mehrtägiger Waldbrand wird
 * ebenfalls tagelang an derselben Stelle detektiert — ihn auszugrauen wäre der
 * schlimmste denkbare Fehler dieses Layers, und zwar genau in der Lage, in der
 * er zählt. Als „ortsfest" gilt deshalb nur, was **beides** erfüllt:
 *
 *   (1) an ≥5 verschiedenen Tagen detektiert **und**
 *   (2) räumlich nicht gewachsen — die Detektionswolke dehnt sich nicht aus
 *       und wandert nicht (beides unter einer Pixelbreite).
 *
 * Und selbst dann wird **ausgegraut, nie ausgeblendet**: Ein falsch
 * eingeordnetes Feuer bleibt sichtbar und anklickbar. Die Einordnung ist
 * ausdrücklich **unsere Ableitung**, nicht eine Eigenschaft der Daten — deshalb
 * `origin: 'derived'` (Muster `warnings/warnField.ts`, `colorOrigin`).
 *
 * ── Sprachregel ────────────────────────────────────────────────────────────
 * Das Wort **„bestätigt" kommt hier nicht vor**. Mehrere Überflüge machen eine
 * Detektion wahrscheinlicher, aber nicht bestätigt — bestätigen kann nur ein
 * Mensch vor Ort. Ein Ereignis aus einer einzigen Detektion heißt
 * „unbestätigt (1 Überflug)".
 *
 * Pur, DOM-frei, ohne Modulzustand; „jetzt" wird hereingereicht (D-12).
 */

import type { FirmsRow, FirmsConfidence } from './sources/firmsHotspots';
import { metersBetween, detectionKey } from './sources/firmsHotspots';
// AF1: die EINE Überflug-Regel (10 min je Satellit) — geteilt mit `fireClusters.ts` (V-AF-2).
import { groupPasses } from './activity/overpasses';

export { detectionKey };

/**
 * Verknüpfungsradius. Ein VIIRS-Pixel misst 375–800 m (gemessen 0,32–0,80 km);
 * benachbarte Pixel desselben Feuers liegen entsprechend dicht. 1,5 km fasst
 * Nachbarpixel und den Versatz zwischen zwei Überflügen zusammen, ohne zwei
 * Kilometer entfernte Feuer zu verschmelzen.
 */
export const LINK_RADIUS_M = 1500;

/**
 * Zeitlücke, ab der ein Ereignis endet. Bei drei Satelliten mit Tag- und
 * Nachtüberflug liegen rund sechs Beobachtungen pro Tag an; 48 h ohne jede
 * Detektion sind rund ein Dutzend verpasste Gelegenheiten — dann brennt es
 * dort nicht mehr, und eine spätere Detektion ist ein neues Ereignis.
 */
export const GAP_MS = 48 * 3_600_000;

/** Tage, ab denen Ortsfestigkeit überhaupt in Betracht kommt (Bedingung 1). */
export const STATIC_MIN_DAYS = 5;

/**
 * Schwelle für „nicht gewachsen" und „nicht gewandert" (Bedingung 2).
 * Eine Pixelbreite: Bewegung unterhalb der Auflösung ist keine Bewegung.
 */
export const STATIC_MOVE_M = 1000;

/** Eine Detektion gilt als „frisch", wenn sie in diesem Fenster liegt. */
const RECENT_MS = 24 * 3_600_000;

export type FireTrend = 'growing' | 'steady' | 'quiet';

export interface FireEvent {
  /** Stabil aus Ort und Beginn — für React-Keys und Kartenfilter. */
  id: string;
  /** Schwerpunkt der Detektionen (ungewichtet). */
  lat: number;
  lon: number;
  firstMs: number;
  lastMs: number;
  /** Zahl der Überflüge — AF1: 10 min je Satellit (`activity/overpasses.ts`), vorher 1-Minuten-Slots. */
  overpasses: number;
  /** Zahl der Detektionen (Pixel) insgesamt. */
  pixels: number;
  /** Zahl der verschiedenen UTC-Kalendertage mit Detektion. */
  distinctDays: number;
  /** Größter Abstand zweier Detektionen in km — die Ausdehnung. */
  extentKm: number;
  /** Summe der Feuerstrahlungsleistung in MW. Leistung, NIE Fläche. */
  sumFrp: number;
  maxFrp: number;
  /** Verteilung der Konfidenzstufen. */
  confidence: Record<FirmsConfidence | 'unknown', number>;
  /** Beteiligte Satelliten, alphabetisch. */
  satellites: string[];
  trend: FireTrend;
  /**
   * Verdacht auf eine dauerhafte Wärmequelle (Industrie o. ä.).
   * **Unsere Ableitung, kein Datenfeld** — s. `origin`.
   */
  suspectedStatic: boolean;
  /** Woher die Einordnung stammt. Immer `'derived'`, solange `type` fehlt. */
  origin: 'derived';
}

/** Ein Cluster im Aufbau — die rohe Gruppe, bevor irgendetwas gedeutet wird. */
export interface SpatialBucket { rows: FirmsRow[] }

/**
 * Räumliche Einfachverkettung: Jede Detektion landet im ersten Cluster, dem sie
 * näher als `radiusM` kommt; passt sie zu mehreren, werden diese verschmolzen.
 *
 * Bewusst quadratisch im Cluster-Vergleich, aber mit einem Gitter vorgefiltert
 * — bei ~6.000 Detektionen wäre ein naives O(n²) über alle Paare 18 Millionen
 * Abstandsrechnungen im Hauptthread, und der Layer hat dort schon ohne das die
 * teuerste Aufgabe der Seite.
 *
 * **Exportiert seit BC1**, damit die Cluster-Liste (`fireClusters.ts`) dieselbe
 * Verkettung benutzt statt einer zweiten. Der Radius ist ein Parameter, seine
 * **Vorgabe bleibt `LINK_RADIUS_M`** — `buildFireEvents` ruft ohne Argument auf
 * und ist damit unverändert; an ihm hängt die Ortsfest-Einstufung (F2).
 */
export function spatialClusters(
  rows: readonly FirmsRow[], radiusM: number = LINK_RADIUS_M,
): SpatialBucket[] {
  // Gitterweite = Verknüpfungsradius; Nachbarn liegen damit in den 9 Zellen
  // um die eigene. Grad pro Meter grob, in DACH ausreichend genau.
  const cellLat = radiusM / 111_320;
  const grid = new Map<string, number[]>();
  const key = (lat: number, lon: number) => {
    const cosLat = Math.cos((lat * Math.PI) / 180) || 1;
    return `${Math.floor(lat / cellLat)}|${Math.floor(lon / (cellLat / cosLat))}`;
  };

  // Union-Find über die Detektionen.
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) { const n = parent[i]; parent[i] = r; i = n; }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a); const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  rows.forEach((r, i) => {
    const k = key(r.lat, r.lon);
    const list = grid.get(k);
    if (list) list.push(i); else grid.set(k, [i]);
  });

  rows.forEach((r, i) => {
    const cosLat = Math.cos((r.lat * Math.PI) / 180) || 1;
    const gi = Math.floor(r.lat / cellLat);
    const gj = Math.floor(r.lon / (cellLat / cosLat));
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const list = grid.get(`${gi + di}|${gj + dj}`);
        if (!list) continue;
        for (const j of list) {
          if (j <= i) continue;
          if (metersBetween(r, rows[j]) <= radiusM) union(i, j);
        }
      }
    }
  });

  const byRoot = new Map<number, SpatialBucket>();
  rows.forEach((r, i) => {
    const root = find(i);
    let b = byRoot.get(root);
    if (!b) byRoot.set(root, (b = { rows: [] }));
    b.rows.push(r);
  });
  return [...byRoot.values()];
}

/** Zerlegt einen räumlichen Cluster an Zeitlücken > `GAP_MS`. */
function splitByTimeGap(rows: readonly FirmsRow[]): FirmsRow[][] {
  const sorted = [...rows].sort((a, b) => a.acqMs - b.acqMs);
  const out: FirmsRow[][] = [];
  let cur: FirmsRow[] = [];
  for (const r of sorted) {
    if (cur.length > 0 && r.acqMs - cur[cur.length - 1].acqMs > GAP_MS) {
      out.push(cur); cur = [];
    }
    cur.push(r);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Schwerpunkt und größte Ausdehnung einer Detektionsmenge. */
function shape(rows: readonly FirmsRow[]): { lat: number; lon: number; extentKm: number } {
  let sLat = 0; let sLon = 0;
  for (const r of rows) { sLat += r.lat; sLon += r.lon; }
  const lat = sLat / rows.length; const lon = sLon / rows.length;
  // Ausdehnung als größter Abstand vom Schwerpunkt × 2 — O(n) statt O(n²).
  // Für die Frage „wächst das?" ist das genau genug und verhält sich stabil.
  let far = 0;
  for (const r of rows) far = Math.max(far, metersBetween(r, { lat, lon }));
  return { lat, lon, extentKm: Math.round((far * 2) / 10) / 100 };
}

/**
 * Wächst das Ereignis räumlich? Verglichen wird die erste mit der zweiten
 * Hälfte des Zeitraums — sowohl die Ausdehnung als auch die Lage des
 * Schwerpunkts. Beides unter einer Pixelbreite ⇒ ortsfest.
 */
function grew(rows: readonly FirmsRow[]): boolean {
  const sorted = [...rows].sort((a, b) => a.acqMs - b.acqMs);
  const mid = sorted[0].acqMs + (sorted[sorted.length - 1].acqMs - sorted[0].acqMs) / 2;
  const early = sorted.filter((r) => r.acqMs <= mid);
  const late = sorted.filter((r) => r.acqMs > mid);
  // Ohne zwei Hälften lässt sich nichts über Wachstum sagen — dann NICHT als
  // ortsfest einstufen. Im Zweifel gegen die Ausgrauung.
  if (early.length === 0 || late.length === 0) return true;
  const a = shape(early); const b = shape(late);
  const growthM = (b.extentKm - a.extentKm) * 1000;
  const driftM = metersBetween(a, b);
  return growthM > STATIC_MOVE_M || driftM > STATIC_MOVE_M;
}

function trendOf(rows: readonly FirmsRow[], nowMs: number): FireTrend {
  const last = Math.max(...rows.map((r) => r.acqMs));
  if (nowMs - last > RECENT_MS) return 'quiet';
  const sorted = [...rows].sort((a, b) => a.acqMs - b.acqMs);
  const mid = sorted[0].acqMs + (last - sorted[0].acqMs) / 2;
  const early = sorted.filter((r) => r.acqMs <= mid).length;
  const late = sorted.length - early;
  if (early === 0) return 'growing';
  return late > early * 1.3 ? 'growing' : 'steady';
}

/**
 * Detektionen → Ereignisse.
 *
 * `nowMs` steuert nur die Tendenz (frisch/ruhig), nicht die Gruppierung —
 * damit ist die Funktion bei gleichem Eingabesatz reproduzierbar.
 */
export function buildFireEvents(rows: readonly FirmsRow[], nowMs: number): FireEvent[] {
  if (rows.length === 0) return [];
  const events: FireEvent[] = [];

  for (const bucket of spatialClusters(rows)) {
    for (const part of splitByTimeGap(bucket.rows)) {
      const { lat, lon, extentKm } = shape(part);
      // AF1: Überflüge = 10 min je Satellit (vorher 1-Minuten-Slots ohne
      // Satelliten-Trennung — ein Überflug über eine Minutengrenze zählte doppelt).
      const passCount = groupPasses(part).length;
      const days = new Set(part.map((r) => Math.floor(r.acqMs / 86_400_000)));
      const conf: Record<FirmsConfidence | 'unknown', number> =
        { low: 0, nominal: 0, high: 0, unknown: 0 };
      let sumFrp = 0; let maxFrp = 0;
      const sats = new Set<string>();
      for (const r of part) {
        conf[r.confidence ?? 'unknown']++;
        if (r.frp != null) { sumFrp += r.frp; maxFrp = Math.max(maxFrp, r.frp); }
        if (r.satellite) sats.add(r.satellite);
      }
      const firstMs = Math.min(...part.map((r) => r.acqMs));
      const lastMs = Math.max(...part.map((r) => r.acqMs));

      events.push({
        id: `${lat.toFixed(3)},${lon.toFixed(3)}@${firstMs}`,
        lat, lon, firstMs, lastMs,
        overpasses: passCount,
        pixels: part.length,
        distinctDays: days.size,
        extentKm,
        sumFrp: Math.round(sumFrp * 100) / 100,
        maxFrp,
        confidence: conf,
        satellites: [...sats].sort(),
        trend: trendOf(part, nowMs),
        // BEIDE Bedingungen — s. Kopfkommentar.
        suspectedStatic: days.size >= STATIC_MIN_DAYS && !grew(part),
        origin: 'derived',
      });
    }
  }
  // Größte Ereignisse zuerst — das ist die Reihenfolge, in der man sie sucht.
  return events.sort((a, b) => b.sumFrp - a.sumFrp || b.pixels - a.pixels);
}

/**
 * Der Satz, mit dem ein Ereignis beschriftet wird.
 *
 * Enthält **nie** das Wort „bestätigt". Ein einzelner Überflug wird
 * ausdrücklich als unbestätigt ausgewiesen — er ist der Fall, bei dem eine
 * Fehldetektion am wahrscheinlichsten ist.
 */
export function eventLabel(e: FireEvent): string {
  if (e.overpasses <= 1) return 'unbestätigt (1 Überflug)';
  const days = e.distinctDays === 1 ? 'an einem Tag' : `an ${e.distinctDays} Tagen`;
  return `${e.overpasses} Überflüge ${days}`;
}

/** Der Hinweistext zur Ortsfestigkeit — bewusst ohne Deutung des Betriebs. */
export function staticNote(e: FireEvent): string | null {
  if (!e.suspectedStatic) return null;
  return `seit ${e.distinctDays} Tagen ortsfest und ohne räumliche Ausdehnung — `
    + 'häufig eine dauerhafte Wärmequelle (z. B. Industrieanlage). '
    + 'Eigene Einordnung aus dem Detektionsmuster, kein Nachweis und kein Datenfeld der Quelle.';
}

/** Kurzfassung der Tendenz. */
export function trendLabel(t: FireTrend): string {
  return t === 'growing' ? 'nimmt zu' : t === 'quiet' ? 'seit über 24 h keine Detektion' : 'unverändert';
}

/**
 * Ordnet jeder Detektion zu, ob ihr Ereignis als ortsfest gilt.
 * Schlüssel ist `lat,lon,acqMs` — dieselbe Detektion kommt kein zweites Mal vor
 * (die Dedup in `firmsHotspots.ts` sorgt dafür).
 */
export function staticDetectionKeys(events: readonly FireEvent[], rows: readonly FirmsRow[]): Set<string> {
  const staticEvents = events.filter((e) => e.suspectedStatic);
  if (staticEvents.length === 0) return new Set();
  const keys = new Set<string>();
  for (const r of rows) {
    for (const e of staticEvents) {
      if (r.acqMs < e.firstMs || r.acqMs > e.lastMs) continue;
      if (metersBetween(r, e) > e.extentKm * 500 + LINK_RADIUS_M) continue;
      keys.add(detectionKey(r));
      break;
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface EventCheck { name: string; ok: boolean; detail?: string }

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Baut eine Detektion mit den Feldern, die das Clustering liest. */
function det(lat: number, lon: number, acqMs: number, frp = 5, sat = 'N'): FirmsRow {
  return {
    lat, lon, acqMs, frp, confidence: 'nominal', brightTi4: 320, brightTi5: 290,
    scanKm: 0.4, trackKm: 0.4, satellite: sat, day: false, source: 'VIIRS_SNPP_NRT',
  };
}

export function verifyFireEvents(): { checks: EventCheck[]; passed: number; total: number } {
  const checks: EventCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const now = Date.UTC(2026, 7, 14, 12, 0);

  // --- Gruppierung -----------------------------------------------------------
  add('leere Eingabe ⇒ keine Ereignisse', buildFireEvents([], now).length === 0);

  const one = buildFireEvents([det(48, 11, now)], now);
  add('eine Detektion ⇒ ein Ereignis', one.length === 1 && one[0].pixels === 1);
  add('ein einzelner Überflug heißt „unbestätigt", nie „bestätigt"',
    eventLabel(one[0]) === 'unbestätigt (1 Überflug)' && !/bestätigt\b(?<!unbestätigt)/.test(eventLabel(one[0])),
    eventLabel(one[0]));

  // Zwei Nachbarpixel desselben Feuers (400 m) ⇒ EIN Ereignis.
  const near = buildFireEvents([det(48, 11, now), det(48.0036, 11, now)], now);
  add('zwei Nachbarpixel (400 m) ⇒ ein Ereignis', near.length === 1 && near[0].pixels === 2,
    `${near.length} Ereignisse`);

  // Zwei Feuer 5 km auseinander ⇒ ZWEI Ereignisse.
  const far = buildFireEvents([det(48, 11, now), det(48.045, 11, now)], now);
  add('zwei Feuer 5 km auseinander ⇒ zwei Ereignisse', far.length === 2, `${far.length}`);

  // Kette: A–B–C je 1 km ⇒ Einfachverkettung fasst alle drei zusammen, auch
  // wenn A und C 2 km auseinanderliegen. Das ist gewollt: eine Feuerfront ist
  // zusammenhängend, nicht kugelförmig.
  const chain = buildFireEvents(
    [det(48, 11, now), det(48.009, 11, now), det(48.018, 11, now)], now);
  add('Kette über 2 km wird zu EINEM Ereignis verkettet', chain.length === 1 && chain[0].pixels === 3,
    `${chain.length}/${chain[0]?.pixels}`);

  // --- Zeitliche Trennung -----------------------------------------------------
  const gap = buildFireEvents([det(48, 11, now - 5 * DAY), det(48, 11, now)], now);
  add('gleiche Stelle, 5 Tage Lücke ⇒ zwei Ereignisse', gap.length === 2, `${gap.length}`);
  const noGap = buildFireEvents([det(48, 11, now - 12 * HOUR), det(48, 11, now)], now);
  add('gleiche Stelle, 12 h Abstand ⇒ ein Ereignis', noGap.length === 1);

  // --- Kennzahlen -------------------------------------------------------------
  const rows = [
    det(48, 11, now - 3 * HOUR, 10, 'N'),
    det(48.002, 11, now - 3 * HOUR, 20, 'N'),   // gleicher Satellit, gleiche Minute ⇒ ein Überflug (AF1: 10 min je Satellit)
    det(48, 11, now - 1 * HOUR, 30, 'N20'),
  ];
  const ev = buildFireEvents(rows, now)[0];
  add('Pixelzahl zählt Detektionen', ev.pixels === 3);
  add('Überflüge zählen Überflüge (10 min je Satellit), nicht Pixel', ev.overpasses === 2, String(ev.overpasses));
  add('AF1: derselbe Satellit über eine Minutengrenze (2 min) ⇒ EIN Überflug',
    buildFireEvents([det(48, 11, now - 3 * HOUR), det(48, 11, now - 3 * HOUR + 120_000)], now)[0].overpasses === 1);
  add('ΣFRP wird summiert', ev.sumFrp === 60, String(ev.sumFrp));
  add('maxFRP wird gemerkt', ev.maxFrp === 30);
  add('Satelliten werden gesammelt', ev.satellites.join(',') === 'N,N20', ev.satellites.join(','));
  add('firstMs/lastMs spannen den Zeitraum',
    ev.firstMs === now - 3 * HOUR && ev.lastMs === now - 1 * HOUR);
  add('Ausdehnung ist positiv und im Kilometerbereich', ev.extentKm > 0 && ev.extentKm < 1,
    String(ev.extentKm));
  add('Beschriftung nennt Überflüge, nicht Pixel', eventLabel(ev).startsWith('2 Überflüge'),
    eventLabel(ev));

  // --- Tendenz -----------------------------------------------------------------
  add('lange nichts mehr ⇒ „quiet"',
    buildFireEvents([det(48, 11, now - 40 * HOUR)], now)[0].trend === 'quiet');
  add('frische Detektion ⇒ nicht „quiet"',
    buildFireEvents([det(48, 11, now - 1 * HOUR)], now)[0].trend !== 'quiet');
  const growing = buildFireEvents([
    det(48, 11, now - 10 * HOUR), det(48.001, 11, now - 2 * HOUR),
    det(48.002, 11, now - 1.5 * HOUR), det(48.003, 11, now - 1 * HOUR),
  ], now)[0];
  add('mehr Detektionen in der zweiten Hälfte ⇒ „nimmt zu"', growing.trend === 'growing',
    growing.trend);

  // --- Ortsfestigkeit: DIE Regel dieser Phase ---------------------------------
  // Ein Industriestandort: 6 Tage, immer dieselben zwei Pixel, kein Wachstum.
  const industry: FirmsRow[] = [];
  for (let d = 0; d < 6; d++) {
    industry.push(det(51.48, 6.72, now - d * DAY, 40));
    industry.push(det(51.481, 6.721, now - d * DAY - 2 * HOUR, 35));
  }
  const ind = buildFireEvents(industry, now)[0];
  add('6 Tage ortsfest ohne Ausdehnung ⇒ Verdacht auf dauerhafte Wärmequelle',
    ind.suspectedStatic === true, `${ind.distinctDays} Tage, ${ind.extentKm} km`);
  add('die Einordnung ist als EIGENE Ableitung gekennzeichnet', ind.origin === 'derived');
  add('der Hinweistext nennt weder „Industrie" als Tatsache noch „Fehlalarm"',
    !!staticNote(ind) && !/Fehlalarm/.test(staticNote(ind) ?? '')
    && /kein Nachweis/.test(staticNote(ind) ?? ''));

  // DER Gegentest, an dem die Phase hängt: ein mehrtägiger Waldbrand, der
  // WÄCHST, darf NICHT ausgegraut werden — auch nicht nach sechs Tagen.
  const wildfire: FirmsRow[] = [];
  for (let d = 0; d < 6; d++) {
    // Die Front wandert je Tag rund 400 m nach Norden und wird breiter.
    for (let k = 0; k <= d; k++) {
      wildfire.push(det(48 + d * 0.004 + k * 0.002, 11, now - (5 - d) * DAY - k * HOUR, 60));
    }
  }
  const wild = buildFireEvents(wildfire, now)[0];
  add('mehrtägiger WACHSENDER Brand wird NICHT als ortsfest eingestuft',
    wild.suspectedStatic === false,
    `${wild.distinctDays} Tage, ${wild.extentKm} km, static=${wild.suspectedStatic}`);
  add('der wachsende Brand ist trotzdem als ein Ereignis erkannt', wild.pixels === 21,
    String(wild.pixels));

  // Vier Tage reichen nicht — die Schwelle ist bewusst hoch.
  const fourDays: FirmsRow[] = [];
  for (let d = 0; d < 4; d++) fourDays.push(det(51.48, 6.72, now - d * DAY));
  add('4 Tage ortsfest reichen NICHT (Schwelle 5)',
    buildFireEvents(fourDays, now)[0].suspectedStatic === false);

  // Ein Ereignis ohne zwei Zeit-Hälften kann nicht auf Wachstum geprüft werden
  // ⇒ im Zweifel NICHT ausgrauen.
  const sameInstant: FirmsRow[] = [];
  for (let d = 0; d < 6; d++) sameInstant.push(det(51.48 + d * 0.0001, 6.72, now));
  add('ohne Zeitspanne wird im Zweifel NICHT ausgegraut',
    buildFireEvents(sameInstant, now)[0].suspectedStatic === false);

  // --- Zuordnung Detektion → ortsfest ------------------------------------------
  const evs = buildFireEvents([...industry, det(48, 11, now)], now);
  const keys = staticDetectionKeys(evs, [...industry, det(48, 11, now)]);
  add('alle Industrie-Detektionen sind als ortsfest markiert',
    industry.every((r) => keys.has(detectionKey(r))), `${keys.size} von ${industry.length + 1}`);
  add('das entfernte Einzelfeuer ist NICHT markiert',
    !keys.has(detectionKey(det(48, 11, now))));
  add('ohne ortsfeste Ereignisse ist die Menge leer',
    staticDetectionKeys(buildFireEvents([det(48, 11, now)], now), [det(48, 11, now)]).size === 0);

  // --- Reproduzierbarkeit und Robustheit ---------------------------------------
  const a = buildFireEvents(rows, now);
  const b = buildFireEvents([...rows].reverse(), now);
  add('Reihenfolge der Eingabe ändert das Ergebnis nicht',
    a.length === b.length && a[0].pixels === b[0].pixels && a[0].sumFrp === b[0].sumFrp);
  add('Detektionen ohne frp kippen die Summe nicht',
    Number.isFinite(buildFireEvents([{ ...det(48, 11, now), frp: null }], now)[0].sumFrp));
  add('Ereignisse sind nach Stärke sortiert',
    buildFireEvents([det(48, 11, now, 1), det(49, 12, now, 99)], now)[0].sumFrp === 99);

  // Mengengerüst: 6.068 Detektionen sind der gemessene 7-Tage-Fall. Die
  // Gruppierung darf dabei nicht in eine quadratische Falle laufen.
  const many: FirmsRow[] = [];
  for (let i = 0; i < 6000; i++) {
    many.push(det(46 + (i % 100) * 0.08, 6 + Math.floor(i / 100) * 0.15, now - (i % 50) * HOUR));
  }
  const t0 = Date.now();
  const built = buildFireEvents(many, now);
  const ms = Date.now() - t0;
  add('6.000 Detektionen werden in unter 400 ms gruppiert', ms < 400, `${ms} ms, ${built.length} Ereignisse`);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
