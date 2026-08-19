/**
 * **Brand-Cluster** — die Detektionen des angezeigten Fensters als Liste
 * (Phase BC1, Gate GBC1, `audit/waldbrand-cluster.md`).
 *
 * ── Was dieses Modul löst ───────────────────────────────────────────────────
 * Die Karte zeigt Einzelpunkte: 2 987 im 24-h-Fenster, ~6 700 in sieben Tagen.
 * Die Frage, die davor steht — *wo brennt es am stärksten?* — beantwortet sie
 * nicht. Dieses Modul fasst die Punkte räumlich zusammen und liefert je Gruppe
 * genau die sechs Größen, die die Liste zeigt: Detektionszahl, ΣFRP und maxFRP,
 * Ausdehnung als konvexe Hülle, Schwerpunkt, letzte Detektion. **Kein
 * zusätzlicher Abruf** — es rechnet auf den Zeilen, die die Karte ohnehin hat.
 *
 * ── Es gibt genau EIN Clustering im Projekt ─────────────────────────────────
 * Die Verkettung kommt aus `fireEvents.ts` (`spatialClusters`, Union-Find über
 * ein Gitter). Hier steht **kein** zweites Gitter, **kein** zweites Union-Find
 * und **kein** eigenes Abstandsmaß; ein Verifier hält das fest. Unterschied zu
 * den Ereignissen: dort 1 500 m plus Zerlegung an 48-h-Zeitlücken (die Frage
 * „ist das noch dasselbe Feuer?"), hier 2 000 m rein räumlich über das ganze
 * gezeigte Fenster (die Frage „wo hat es im Fenster wie stark gebrannt?").
 *
 * ── Die konvexe Hülle, und was sie NICHT ist ───────────────────────────────
 * `fireZones.ts` verwirft die **konkave** Hülle: zwei freie Parameter, Flächen
 * um Faktor 1,5–2 auseinander. Die **konvexe** hat keinen freien Parameter und
 * ist bei gleicher Eingabe reproduzierbar — sie ist deshalb zulässig. Sie misst
 * aber die **Streuung der Pixelmitten**, nicht die verbrannte Fläche und auch
 * nicht die vom Satelliten abgedeckte:
 *
 *   EFFIS-Kartierung  → verbrannte Fläche (ha, amtlich kartiert)
 *   Detektionsraster  → abgedeckte Fläche (ha, Obergrenze, `fireZones.ts`)
 *   Cluster-Hülle     → Ausdehnung der Detektionsorte (km², dieses Modul)
 *
 * Ein oder zwei Detektionen spannen keine Fläche auf: dann ist die Hülle
 * flächenlos und wird als solche ausgewiesen, nie durch die Pixelfläche ersetzt.
 * Das Wort „Brandfläche" kommt hier nicht vor.
 *
 * ── Sprachregel ────────────────────────────────────────────────────────────
 * Wie in `fireEvents.ts`: das Wort **„bestätigt" fällt nicht**. Ein Cluster ist
 * eine Zusammenfassung von Satellitendetektionen, mehr nicht.
 *
 * Pur, DOM-frei, ohne Modulzustand; „jetzt" wird hereingereicht (D-12).
 * `npm run verify:fire-clusters`
 */

import { spatialClusters } from './fireEvents';
import { detectionKey, type FirmsRow, type FirmsConfidence } from './sources/firmsHotspots';
// AF1: die EINE Überflug-Regel (10 min je Satellit) — geteilt mit `fireEvents.ts` (V-AF-2).
import { groupPasses, type FirePass } from './activity/overpasses';
import { ageText, clockLabel } from '../dataAge';
import type { Country } from '../types';

/**
 * Verknüpfungsradius der Liste. 2 000 m — die Vorgabe aus Jans Auftrag, und am
 * Bestand gemessen praktisch folgenlos: über 2 696 Detektionen eines 24-h-Laufs
 * ergeben 1 500 m **272** und 2 000 m **269** Cluster (1 %,
 * `audit/brandflaechen-echtzeit.md` §3). Die Struktur kommt aus den Daten, nicht
 * aus dem Parameter — deshalb ist er ein Argument und kein Bedienelement.
 */
export const CLUSTER_RADIUS_M = 2000;

/**
 * Wie viele Zeilen die Liste auf einmal in den DOM legt.
 *
 * Kein Geschmackswert: Am Prod-Build gemessen kosten 1 111 Zeilen (das
 * 7-Tage-Fenster) vom Klick bis zur Zeile im DOM **253 ms** — über der
 * 200-ms-Grenze des Projekts, auf dem Desktop. Der Deckel ist deshalb eine
 * Leistungsgrenze und wird als solche **ausgesprochen**: die Kopfzeile nennt
 * immer die volle Clusterzahl, die Liste sagt, wie viele davon sie zeigt, und
 * ein Knopf holt die nächsten. Still gekürzt wird nichts.
 */
export const CLUSTER_PAGE = 50;

/**
 * Farbstufen der Cluster-Fläche nach **ΣFRP** in MW.
 *
 * Bewusst **eigene** Stützstellen und nicht `FRP_STOPS`: dort steht dieselbe
 * Farbe für die Leistung EINER Detektion (Median 3,1 MW), hier für die Summe
 * über Pixel und Überflüge. Dieselbe Farbe für zwei Größen wäre die verbotene
 * stille Umrechnung — die Grenzen stehen deshalb in der Legende der Liste.
 * Die Farbreihe selbst ist die des Layers, damit die Ansicht eine Bildsprache
 * behält.
 */
export const CLUSTER_FRP_STOPS: readonly (readonly [number, string])[] = [
  [0, '#F2CE6B'],
  [10, '#EFA13F'],
  [50, '#DD6A2B'],
  [200, '#B93C1E'],
  [600, '#7E1F12'],
];

/** Die Farbe zu einer Clusterstärke — dieselbe Tabelle wie die Karte. */
export function clusterColor(sumFrp: number): string {
  let col = CLUSTER_FRP_STOPS[0][1];
  for (const [mw, c] of CLUSTER_FRP_STOPS) if (sumFrp >= mw) col = c;
  return col;
}

/**
 * Das Grau der ortsfest eingestuften Detektionen — wertgleich zum
 * Punkt-Ausdruck in `FireMap.tsx` und zur Legende in `fireDeck.css`. Wo die
 * Karte grau zeichnet, ist auch die Zeile grau; alles andere wäre eine zweite
 * Aussage über dieselbe Einordnung.
 */
export const STATIC_GREY = '#9A9186';

/** Die Farbe eines Clusters, wie Karte und Liste sie zeigen. */
export function clusterColorOf(c: FireCluster): string {
  return c.mostlyStatic ? STATIC_GREY : clusterColor(c.sumFrp);
}

export interface FireCluster {
  /** Stabil aus Schwerpunkt und erster Detektion — für React-Keys und Kartenfilter. */
  id: string;
  /** Schwerpunkt der Detektionen (ungewichtet). */
  lat: number;
  lon: number;
  /** Zahl der Detektionen (Pixel) im angezeigten Fenster. */
  count: number;
  /** Summe der Feuerstrahlungsleistung in MW. Leistung, NIE Fläche. */
  sumFrp: number;
  /** Stärkste Einzeldetektion in MW. */
  maxFrp: number;
  /** Konvexe Hülle als geschlossener Ring [lon, lat] — leer bei < 3 Punkten. */
  hull: number[][];
  /** Fläche der konvexen Hülle in km². 0 = flächenlos (1–2 Punkte oder kollinear). */
  hullKm2: number;
  firstMs: number;
  lastMs: number;
  /** [west, süd, ost, nord] — das Ziel des „auf die Karte zoomen"-Klicks. */
  bbox: [number, number, number, number];
  /**
   * Land des Schwerpunkts, per Punkt-in-Polygon gegen die Landesumrisse.
   * `'outside'` = außerhalb DE/AT/CH (das FIRMS-Fenster reicht darüber hinaus,
   * V-221), `null` = Umrisse noch nicht geladen ⇒ es wird nichts behauptet.
   */
  country: Country | 'outside' | null;
  /**
   * Wie viele Detektionen des Clusters sind als **ortsfest** eingestuft (F2)?
   * `0`, solange die Einordnung nicht vorliegt — dann behauptet die Zeile nichts.
   */
  staticCount: number;
  /**
   * Ist die MEHRHEIT der Detektionen ortsfest? Dann trägt die Zeile denselben
   * Vorbehalt, den die Karte als Grau zeigt.
   *
   * Ohne das widerspräche die Liste der Karte: 39,3 % aller DACH-Detektionen
   * entfallen auf Zellen, die an ≥ 4 von 5 Tagen getroffen werden
   * (`fireEvents.ts`), und ohne Vorbehalt stünde ein Stahlwerk als
   * „siebtstärkster Brand" in einer Liste, die „Brände" heißt. Ausgegraut,
   * **nie ausgeblendet** — die Rangfolge bleibt die der Stärke.
   */
  mostlyStatic: boolean;
  /**
   * BP1 — der **Anker** der Brand-ID: `detectionKey` der ältesten Detektion des
   * Clusters (bei gleicher Zeit die lexikografisch kleinste). Anders als `id`
   * (Schwerpunkt@Beginn) ändert er sich NICHT, wenn ein weiterer Überflug
   * hinzukommt — nur, wenn die älteste Detektion aus dem Fenster fällt.
   * `footprint/fireRegistry.ts` baut daraus `fire:<anchorKey>`.
   */
  anchorKey: string;
  /** BP1: Zahl der Überflüge — AF1: 10 min je Satellit (`activity/overpasses.ts`), wie `fireEvents.ts`. */
  overpasses: number;
  /** BP1: beteiligte Satelliten, alphabetisch. */
  satellites: string[];
  /** BP1: Verteilung der FIRMS-Konfidenzstufen — wird aggregiert gezeigt, nie erfunden. */
  confidence: Record<FirmsConfidence | 'unknown', number>;
  /**
   * BP1/AF1: der Verlauf je Überflug (Satellit, Zeit, Tag/Nacht, Pixel, ΣFRP,
   * Schwerpunkt, Pixelbreite), aufsteigend — `groupPasses()`. Nur innerhalb des
   * angezeigten Fensters rekonstruierbar (kein Speicher).
   */
  passes: FirePass[];
}

// ---------------------------------------------------------------------------
// Konvexe Hülle
// ---------------------------------------------------------------------------

/**
 * Monotone Kette (Andrew). Ergebnis ist ein **geschlossener** Ring gegen den
 * Uhrzeigersinn in [lon, lat]; bei weniger als drei nicht-kollinearen Punkten
 * ein leerer Ring — eine Strecke ist keine Fläche, und ein künstlich
 * aufgeblasenes Polygon wäre eine erfundene Ausdehnung.
 */
export function convexHull(points: readonly (readonly [number, number])[]): number[][] {
  if (points.length < 3) return [];
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // Kreuzprodukt: > 0 = Linkskurve. Kollineare Punkte fallen heraus (<= 0).
  const cross = (o: readonly number[], a: readonly number[], b: readonly number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (src: readonly (readonly [number, number])[]): number[][] => {
    const out: number[][] = [];
    for (const p of src) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push([p[0], p[1]]);
    }
    out.pop();
    return out;
  };
  const lower = build(pts);
  const upper = build([...pts].reverse());
  const ring = [...lower, ...upper];
  if (ring.length < 3) return [];
  return [...ring, [ring[0][0], ring[0][1]]];
}

/**
 * Fläche eines geschlossenen Rings in km².
 *
 * Äquirektangulär auf den Breitengrad des Rings bezogen (Gauß'sche Trapezformel
 * auf metrisierten Koordinaten) — dieselbe Näherung, mit der auch
 * `metersBetween` in DACH rechnet. Über die Ausdehnung eines Brandclusters
 * (Kilometer, nicht Hundert Kilometer) ist der Fehler weit unter der
 * Ortsunschärfe der Quelle (±375 m).
 */
export function ringAreaKm2(ring: readonly number[][]): number {
  if (ring.length < 4) return 0;
  // Der letzte Punkt wiederholt den ersten (geschlossener Ring) — er darf den
  // Bezugsbreitengrad nicht doppelt gewichten.
  let latSum = 0;
  for (let i = 0; i < ring.length - 1; i++) latSum += ring[i][1];
  const cosLat = Math.cos(((latSum / (ring.length - 1)) * Math.PI) / 180);
  const kmPerDegLat = 110.574;
  const kmPerDegLon = 111.320 * cosLat;
  let twice = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0] * kmPerDegLon; const yi = ring[i][1] * kmPerDegLat;
    const xj = ring[j][0] * kmPerDegLon; const yj = ring[j][1] * kmPerDegLat;
    twice += xj * yi - xi * yj;
  }
  return Math.abs(twice) / 2;
}

// ---------------------------------------------------------------------------
// Aufbau
// ---------------------------------------------------------------------------

/**
 * Detektionen → Cluster, absteigend nach Stärke.
 *
 * Sortiert wird nach **ΣFRP**, bei Gleichstand nach Detektionszahl — dieselbe
 * Reihenfolge, in der `buildFireEvents` seine Ereignisse ausgibt. Keine zweite
 * Rangordnung im Produkt.
 *
 * Die Funktion ist rein: gleiche Eingabe ⇒ gleiche Ausgabe, unabhängig von der
 * Reihenfolge der Zeilen und ohne `Date.now()` (D-12).
 */
export function buildFireClusters(
  rows: readonly FirmsRow[], radiusM: number = CLUSTER_RADIUS_M,
  /**
   * Die als ortsfest eingestuften Detektionen (F2, `staticDetectionKeys`) —
   * dieselbe Menge, die auf der Karte die Punkte grau macht. Fehlt sie, trägt
   * kein Cluster einen Vorbehalt: bis die Einordnung da ist, behauptet nichts
   * etwas (V-222).
   */
  staticKeys?: ReadonlySet<string>,
): FireCluster[] {
  if (rows.length === 0) return [];
  const out: FireCluster[] = [];

  for (const bucket of spatialClusters(rows, radiusM)) {
    const part = bucket.rows;
    let sLat = 0; let sLon = 0; let sumFrp = 0; let maxFrp = 0;
    let firstMs = Infinity; let lastMs = -Infinity;
    let west = Infinity; let south = Infinity; let east = -Infinity; let north = -Infinity;
    let staticCount = 0;
    const pts: [number, number][] = [];
    // BP1: Anker, Überflüge, Satelliten, Konfidenz, Verlauf — additiv, aus
    // derselben Schleife (kein zweiter Lauf über die Zeilen).
    let anchorKey = '';
    let anchorMs = Infinity;
    const sats = new Set<string>();
    const conf: Record<FirmsConfidence | 'unknown', number> = { low: 0, nominal: 0, high: 0, unknown: 0 };
    for (const r of part) {
      const key = detectionKey(r);
      if (staticKeys?.has(key)) staticCount++;
      if (r.acqMs < anchorMs || (r.acqMs === anchorMs && key < anchorKey)) { anchorMs = r.acqMs; anchorKey = key; }
      if (r.satellite) sats.add(r.satellite);
      conf[r.confidence ?? 'unknown']++;
      sLat += r.lat; sLon += r.lon;
      if (r.frp != null) { sumFrp += r.frp; if (r.frp > maxFrp) maxFrp = r.frp; }
      if (r.acqMs < firstMs) firstMs = r.acqMs;
      if (r.acqMs > lastMs) lastMs = r.acqMs;
      if (r.lon < west) west = r.lon;
      if (r.lon > east) east = r.lon;
      if (r.lat < south) south = r.lat;
      if (r.lat > north) north = r.lat;
      pts.push([r.lon, r.lat]);
    }
    const lat = sLat / part.length; const lon = sLon / part.length;
    const hull = convexHull(pts);
    // AF1: Überflüge aus der geteilten Regel — ein zweiter Durchlauf über die
    // Zeilen des Clusters (linear), keine zweite Definition.
    const passes = groupPasses(part);
    out.push({
      id: `${lat.toFixed(3)},${lon.toFixed(3)}@${firstMs}`,
      lat, lon,
      count: part.length,
      // Zwei Nachkommastellen: FRP kommt mit einer aus der Quelle, die Summe
      // soll nicht mehr Genauigkeit vortäuschen als sie hat.
      sumFrp: Math.round(sumFrp * 100) / 100,
      maxFrp,
      hull,
      hullKm2: Math.round(ringAreaKm2(hull) * 100) / 100,
      firstMs, lastMs,
      bbox: [west, south, east, north],
      country: null,
      staticCount,
      mostlyStatic: staticCount * 2 > part.length,
      anchorKey,
      overpasses: passes.length,
      satellites: [...sats].sort(),
      confidence: conf,
      passes,
    });
  }
  return out.sort((a, b) => b.sumFrp - a.sumFrp || b.count - a.count);
}

// ---------------------------------------------------------------------------
// Land — Punkt-in-Polygon gegen die mitgelieferten Landesumrisse
// ---------------------------------------------------------------------------

/** Die Ringe je Land, wie `countryMask.loadCountryRings()` sie liefert. */
export type CountryRings = ReadonlyMap<Country, number[][][]>;

/**
 * Even-odd-Test über eine Ringmenge. Wertgleich zu `countryMask.pointInRings`
 * — als eigene Kopie, damit dieses Modul DOM- und fetch-frei bleibt und
 * headless prüfbar ist (die Ringe werden hereingereicht, nie geladen).
 */
function inRings(rings: readonly number[][][], lon: number, lat: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      if (((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * Setzt `country` je Cluster. Ohne geladene Umrisse bleibt es `null` — die
 * Liste zeigt dann „—" statt einer geratenen Zuordnung.
 *
 * Bewusst **nicht** über `countryGuess()` (FireMap): das fällt außerhalb der
 * AT-/CH-Kästen auf `DE` zurück. Für einen Deep-Link ist das vertretbar, für
 * eine Spalte, die „Land" behauptet, nicht — das FIRMS-Fenster reicht über DACH
 * hinaus (V-221), und ein tschechischer Brand darf hier nicht „DE" heißen.
 */
export function withCountries(
  clusters: readonly FireCluster[], rings: CountryRings | null,
): FireCluster[] {
  if (!rings || rings.size === 0) return clusters as FireCluster[];
  return clusters.map((c) => {
    let hit: Country | 'outside' = 'outside';
    for (const [country, r] of rings) {
      if (inRings(r, c.lon, c.lat)) { hit = country; break; }
    }
    return c.country === hit ? c : { ...c, country: hit };
  });
}

// ---------------------------------------------------------------------------
// Beschriftungen — EINE Quelle für Liste und Verifier
// ---------------------------------------------------------------------------

/** `outside` heißt „außerhalb DE/AT/CH", `null` heißt „noch nichts bekannt". */
export function countryLabel(c: FireCluster['country']): string {
  if (c == null) return '—';
  return c === 'outside' ? 'außerhalb DE/AT/CH' : c;
}

/** Stärke als Text. Ohne FRP in den Daten gibt es keine Stärke, nur Detektionen. */
export function strengthLabel(c: FireCluster): string {
  if (!(c.sumFrp > 0)) return 'ohne FRP-Angabe';
  return `${c.sumFrp.toLocaleString('de-DE', { maximumFractionDigits: 1 })} MW`;
}

/**
 * Die Ausdehnung. **„—" statt „0,0 km²"** bei ein bis zwei Detektionen: eine
 * Strecke hat keinen Flächeninhalt, und eine 0 läse sich wie eine Messung.
 */
export function extentLabel(c: FireCluster): string {
  if (!(c.hullKm2 > 0)) return '—';
  if (c.hullKm2 < 0.1) return '< 0,1 km²';
  return `${c.hullKm2.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km²`;
}

/** Letzte Detektion: Uhrzeit + Alter — dieselbe Alterssprache wie überall (D-04). */
export function lastSeenLabel(c: FireCluster, nowMs: number): string {
  return `${clockLabel(c.lastMs)} · ${ageText(Math.max(0, nowMs - c.lastMs))}`;
}

/**
 * Der Pflichthinweis über der Liste. Er steht **immer** dort, wo die Zahlen
 * stehen — ΣFRP summiert über Pixel UND Überflüge, die Hülle ist keine
 * Brandfläche.
 */
export const CLUSTER_NOTE =
  'Zusammengefasst werden Detektionen, die weniger als 2 km auseinanderliegen — im gezeigten '
  + 'Fenster, rein räumlich. Die Stärke ist die Summe der Feuerstrahlungsleistung (MW): eine '
  + 'Leistung, keine Fläche und keine Energie, summiert über Pixel und Überflüge — ein oft '
  + 'überflogenes Feuer summiert deshalb höher als ein gleich starkes, das einmal gesehen wurde. '
  + 'Die Fläche ist die konvexe Hülle der Detektionsorte, also ihre Ausdehnung — nicht die '
  + 'verbrannte Fläche und nicht die vom Satelliten abgedeckte. Grau markierte Einträge werden '
  + 'überwiegend seit mindestens fünf Tagen ortsfest detektiert — häufig dauerhafte Wärmequellen '
  + 'wie Industrieanlagen. Sie bleiben in der Rangfolge stehen, weil die Einordnung unsere '
  + 'Ableitung aus dem Muster ist und kein Nachweis.';

/** Der Vorbehalt einer Zeile — `null`, wenn es keinen gibt. */
export function staticChipLabel(c: FireCluster): string | null {
  return c.mostlyStatic ? 'ortsfest' : null;
}

// ---------------------------------------------------------------------------
// GeoJSON für die Karte
// ---------------------------------------------------------------------------

/**
 * Die Hüllen als Polygone. Cluster ohne Fläche (1–2 Detektionen) liefern **kein**
 * Feature — auf der Karte liegt dort der Punkt selbst, und ein aufgeblasenes
 * Mini-Polygon würde eine Ausdehnung behaupten, die nicht gemessen ist.
 */
export function clustersToGeoJSON(clusters: readonly FireCluster[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const c of clusters) {
    if (c.hull.length < 4) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [c.hull] },
      properties: { id: c.id, sumFrp: c.sumFrp, count: c.count, color: clusterColorOf(c) },
    });
  }
  return { type: 'FeatureCollection', features };
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface ClusterCheck { name: string; ok: boolean; detail?: string }

const HOUR = 3_600_000;

/** Baut eine Detektion mit den Feldern, die das Clustering liest. */
export function fixtureRow(lat: number, lon: number, acqMs: number, frp: number | null = 5): FirmsRow {
  return {
    lat, lon, acqMs, frp, confidence: 'nominal', brightTi4: 320, brightTi5: 290,
    scanKm: 0.4, trackKm: 0.4, satellite: 'N', day: false, source: 'VIIRS_SNPP_NRT',
  };
}

export function verifyFireClusters(): { checks: ClusterCheck[]; passed: number; total: number } {
  const checks: ClusterCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const now = Date.UTC(2026, 7, 16, 12, 0);

  // --- Gruppierung ------------------------------------------------------------
  add('leere Eingabe ⇒ keine Cluster', buildFireClusters([]).length === 0);

  const one = buildFireClusters([fixtureRow(48, 11, now)]);
  add('eine Detektion ⇒ ein eigener Cluster (Auftrag: min. 1 Punkt)',
    one.length === 1 && one[0].count === 1);
  add('ein einzelner Punkt hat KEINE Fläche (Hülle leer, „—")',
    one[0].hullKm2 === 0 && one[0].hull.length === 0 && extentLabel(one[0]) === '—');

  // Der Radius wirkt, und zwar an der Kante: 2,5 km auseinander.
  const dLat = 2500 / 110_574;
  const apart = [fixtureRow(48, 11, now), fixtureRow(48 + dLat, 11, now)];
  add('2,5 km auseinander: bei 2 000 m zwei Cluster', buildFireClusters(apart, 2000).length === 2);
  add('2,5 km auseinander: bei 3 000 m ein Cluster', buildFireClusters(apart, 3000).length === 1);
  add('Vorgabe ist 2 000 m', CLUSTER_RADIUS_M === 2000, String(CLUSTER_RADIUS_M));

  // Rein räumlich: eine Zeitlücke zerlegt NICHT (anders als bei den Ereignissen).
  const gap = buildFireClusters([fixtureRow(48, 11, now - 5 * 24 * HOUR), fixtureRow(48, 11, now)]);
  add('gleiche Stelle, 5 Tage Lücke ⇒ EIN Cluster (das Fenster ist der Zeitfilter)',
    gap.length === 1 && gap[0].count === 2, `${gap.length}`);
  add('die letzte Detektion ist die jüngste', gap[0].lastMs === now && gap[0].firstMs < now);

  // --- Hülle ------------------------------------------------------------------
  // Ein Rechteck von 0,1° × 0,1° bei 48° N: 11,06 km hoch × 7,44 km breit
  // (cos 48,05° = 0,6686) ⇒ 82,3 km². Von Hand nachgerechnet, kein Selbstbezug.
  const box = buildFireClusters([
    fixtureRow(48, 11, now), fixtureRow(48.1, 11, now),
    fixtureRow(48.1, 11.1, now), fixtureRow(48, 11.1, now),
  ], 20_000)[0];
  add('Hüllenfläche eines 0,1°-Quadrats bei 48° N ≈ 82,3 km²',
    Math.abs(box.hullKm2 - 82.3) < 1, `${box.hullKm2} km²`);
  add('die Hülle ist ein geschlossener Ring', (() => {
    const h = box.hull;
    return h.length >= 4 && h[0][0] === h[h.length - 1][0] && h[0][1] === h[h.length - 1][1];
  })());
  add('die Hülle umschließt alle Detektionen',
    inRings([box.hull], 11.05, 48.05) && !inRings([box.hull], 11.2, 48.05));
  // Ein Punkt IN der Wolke darf die Hülle nicht verändern (Konvexität).
  const withInner = buildFireClusters([
    fixtureRow(48, 11, now), fixtureRow(48.1, 11, now),
    fixtureRow(48.1, 11.1, now), fixtureRow(48, 11.1, now), fixtureRow(48.05, 11.05, now),
  ], 20_000)[0];
  add('ein innen liegender Punkt ändert die Hülle nicht',
    Math.abs(withInner.hullKm2 - box.hullKm2) < 0.01, `${withInner.hullKm2} gegen ${box.hullKm2}`);
  add('kollineare Punkte spannen keine Fläche auf',
    buildFireClusters([fixtureRow(48, 11, now), fixtureRow(48.01, 11, now), fixtureRow(48.02, 11, now)])[0].hullKm2 === 0);
  add('Reihenfolge der Eingabe ändert die Hülle nicht', (() => {
    const rows = [fixtureRow(48, 11, now), fixtureRow(48.1, 11, now), fixtureRow(48.1, 11.1, now)];
    const a = buildFireClusters(rows, 20_000)[0];
    const b = buildFireClusters([...rows].reverse(), 20_000)[0];
    return a.hullKm2 === b.hullKm2 && a.id === b.id;
  })());
  add('leerer Ring ⇒ Fläche 0 (kein NaN)', ringAreaKm2([]) === 0 && convexHull([[1, 1], [2, 2]]).length === 0);

  // --- Kennzahlen und Sortierung ----------------------------------------------
  const many = buildFireClusters([
    fixtureRow(48, 11, now - 3 * HOUR, 10), fixtureRow(48.002, 11, now - 1 * HOUR, 30),
    fixtureRow(51, 8, now, 5),
  ]);
  add('ΣFRP wird summiert', many[0].sumFrp === 40, String(many[0].sumFrp));
  add('maxFRP wird gemerkt', many[0].maxFrp === 30);
  add('Cluster sind absteigend nach Stärke sortiert', many[0].sumFrp > many[1].sumFrp);
  add('bei gleicher Stärke entscheidet die Detektionszahl', (() => {
    const t = buildFireClusters([
      fixtureRow(48, 11, now, 10),
      fixtureRow(51, 8, now, 5), fixtureRow(51.002, 8, now, 5),
    ]);
    return t[0].count === 2 && t[0].sumFrp === t[1].sumFrp;
  })());
  add('Detektionen ohne frp kippen die Summe nicht',
    Number.isFinite(buildFireClusters([fixtureRow(48, 11, now, null)])[0].sumFrp));
  add('ohne FRP sagt die Beschriftung das, statt „0 MW" zu behaupten',
    strengthLabel(buildFireClusters([fixtureRow(48, 11, now, null)])[0]) === 'ohne FRP-Angabe');
  add('die Bbox umschließt den Cluster', (() => {
    const [w, s, e, n] = box.bbox;
    return w === 11 && s === 48 && Math.abs(e - 11.1) < 1e-9 && Math.abs(n - 48.1) < 1e-9;
  })());
  add('die Kennung ist stabil und reihenfolgeunabhängig',
    buildFireClusters([fixtureRow(48, 11, now)])[0].id === buildFireClusters([fixtureRow(48, 11, now)])[0].id);

  // --- BP1: Anker, Überflüge, Satelliten, Konfidenz, Verlauf --------------------
  const grow1 = [fixtureRow(48, 11, now - 3 * HOUR, 10), fixtureRow(48.003, 11.002, now - 3 * HOUR, 4)];
  const grow2 = [...grow1, fixtureRow(48.006, 11.004, now, 8), fixtureRow(48.009, 11.006, now, 8)];
  const c1 = buildFireClusters(grow1)[0]; const c2 = buildFireClusters(grow2)[0];
  add('BP1: ein weiterer Überflug ändert die Kennung (id) — aber NICHT den Anker',
    c1.id !== c2.id && c1.anchorKey === c2.anchorKey && c1.anchorKey === detectionKey(grow1[0]),
    `${c1.id} → ${c2.id}, Anker ${c2.anchorKey}`);
  add('BP1: der Anker ist reihenfolgeunabhängig',
    buildFireClusters([...grow2].reverse())[0].anchorKey === c2.anchorKey);
  add('BP1: bei gleicher Zeit gewinnt der lexikografisch kleinere Schlüssel (deterministisch)',
    buildFireClusters([fixtureRow(48.003, 11.002, now), fixtureRow(48, 11, now)])[0].anchorKey === detectionKey(fixtureRow(48, 11, now)));
  add('BP1/AF1: Überflüge zählen Überflüge (10 min je Satellit), nicht Pixel', c2.overpasses === 2 && c2.count === 4, `${c2.overpasses}`);
  add('AF1: derselbe Satellit über eine Minutengrenze (2 min) ⇒ EIN Überflug',
    buildFireClusters([fixtureRow(48, 11, now), fixtureRow(48.002, 11, now + 120_000)])[0].overpasses === 1);
  add('AF1: der Verlauf trägt Satellit, Tag/Nacht und Pixelbreite je Überflug',
    c2.passes[0].satellite === 'N' && c2.passes[0].day === false && c2.passes[0].meanScanKm === 0.4);
  add('BP1: der Verlauf hat einen Punkt je Überflug, aufsteigend, mit Pixeln und ΣFRP',
    c2.passes.length === 2 && c2.passes[0].atMs < c2.passes[1].atMs
    && c2.passes[0].pixels === 2 && c2.passes[0].sumFrp === 14 && c2.passes[1].sumFrp === 16,
    JSON.stringify(c2.passes));
  add('BP1: Satelliten und Konfidenz werden gezählt, nicht erfunden',
    c2.satellites.join(',') === 'N' && c2.confidence.nominal === 4 && c2.confidence.high === 0
    && buildFireClusters([{ ...fixtureRow(48, 11, now), confidence: null }])[0].confidence.unknown === 1);

  // --- Land --------------------------------------------------------------------
  const ring: number[][][] = [[[10, 47], [12, 47], [12, 49], [10, 49], [10, 47]]];
  const rings: CountryRings = new Map([['DE' as Country, ring]]);
  const tagged = withCountries(buildFireClusters([fixtureRow(48, 11, now), fixtureRow(52, 20, now)]), rings);
  add('Cluster im Landesumriss bekommt das Land',
    tagged.find((c) => c.lat === 48)?.country === 'DE');
  add('Cluster außerhalb heißt „außerhalb DE/AT/CH", nicht DE (V-221)',
    tagged.find((c) => c.lat === 52)?.country === 'outside',
    countryLabel(tagged.find((c) => c.lat === 52)?.country ?? null));
  add('ohne geladene Umrisse wird nichts behauptet („—")',
    withCountries(buildFireClusters([fixtureRow(48, 11, now)]), null)[0].country === null
    && countryLabel(null) === '—');

  // --- Ortsfest-Vorbehalt (die Regel, an der diese Liste hängt) -----------------
  // Ein Industriestandort: sechs Tage, dieselbe Stelle. Die Karte zeichnet ihn
  // grau; die Liste muss dasselbe sagen, sonst stünde ein Stahlwerk als „Brand".
  const industry: FirmsRow[] = [];
  for (let d = 0; d < 6; d++) industry.push(fixtureRow(51.48, 6.72 + d * 0.0001, now - d * 24 * HOUR, 40));
  const staticKeys = new Set(industry.map(detectionKey));
  const marked = buildFireClusters(industry, CLUSTER_RADIUS_M, staticKeys)[0];
  add('überwiegend ortsfeste Cluster tragen den Vorbehalt',
    marked.mostlyStatic === true && marked.staticCount === 6, `${marked.staticCount}/${marked.count}`);
  add('die Zeile wird grau — dieselbe Farbe wie der Punkt auf der Karte',
    clusterColorOf(marked) === STATIC_GREY && staticChipLabel(marked) === 'ortsfest');
  add('ohne Einordnung behauptet kein Cluster einen Vorbehalt (V-222)',
    buildFireClusters(industry)[0].mostlyStatic === false
    && buildFireClusters(industry)[0].staticCount === 0
    && staticChipLabel(buildFireClusters(industry)[0]) === null);
  add('eine MINDERHEIT ortsfester Detektionen kippt die Zeile nicht', (() => {
    const mixed = [...industry, fixtureRow(51.4805, 6.7205, now, 40), fixtureRow(51.481, 6.721, now, 40),
      fixtureRow(51.4815, 6.7215, now, 40), fixtureRow(51.482, 6.722, now, 40),
      fixtureRow(51.4825, 6.7225, now, 40), fixtureRow(51.483, 6.723, now, 40),
      fixtureRow(51.4835, 6.7235, now, 40)];
    const c = buildFireClusters(mixed, CLUSTER_RADIUS_M, staticKeys)[0];
    return c.count === 13 && c.staticCount === 6 && c.mostlyStatic === false;
  })());
  add('ortsfeste Cluster bleiben in der Liste und in der Rangfolge (nie ausgeblendet)', (() => {
    const both = [...industry, fixtureRow(48, 11, now, 1)];
    const l = buildFireClusters(both, CLUSTER_RADIUS_M, staticKeys);
    return l.length === 2 && l[0].mostlyStatic === true && l[0].sumFrp > l[1].sumFrp;
  })());
  add('der Pflichthinweis erklärt das Grau und nennt es als eigene Ableitung',
    /ortsfest/.test(CLUSTER_NOTE) && /Ableitung/.test(CLUSTER_NOTE) && /kein Nachweis/.test(CLUSTER_NOTE));

  // --- Beschriftungen und Ehrlichkeit -------------------------------------------
  add('der Hinweis nennt Leistung, Summierung über Überflüge und die Abgrenzung zur Brandfläche',
    /Leistung/.test(CLUSTER_NOTE) && /Überflüge/.test(CLUSTER_NOTE)
    && /nicht die verbrannte Fläche/.test(CLUSTER_NOTE));
  add('keine Cluster-Beschriftung behauptet „bestätigt"',
    ![strengthLabel(box), extentLabel(box), countryLabel('DE'), CLUSTER_NOTE]
      .some((s) => /bestätigt/i.test(s)));
  add('„letzte Detektion" nennt Uhrzeit UND Alter',
    /·/.test(lastSeenLabel(box, now + HOUR)) && /vor 1 h/.test(lastSeenLabel(box, now + HOUR)),
    lastSeenLabel(box, now + HOUR));

  // --- GeoJSON -------------------------------------------------------------------
  const fc = clustersToGeoJSON([box, one[0]]);
  add('nur Cluster MIT Fläche werden gezeichnet', fc.features.length === 1);
  add('das Polygon trägt Kennung, Stärke und Farbe',
    fc.features[0].properties?.id === box.id
    && fc.features[0].properties?.sumFrp === box.sumFrp
    && typeof fc.features[0].properties?.color === 'string');
  add('die Farbe folgt der Stärke-Tabelle',
    clusterColor(0) === CLUSTER_FRP_STOPS[0][1]
    && clusterColor(1000) === CLUSTER_FRP_STOPS[CLUSTER_FRP_STOPS.length - 1][1]
    && clusterColor(60) === '#DD6A2B');

  // --- Mengengerüst ---------------------------------------------------------------
  const bulk: FirmsRow[] = [];
  for (let i = 0; i < 6000; i++) {
    bulk.push(fixtureRow(46 + (i % 100) * 0.08, 6 + Math.floor(i / 100) * 0.15, now - (i % 50) * HOUR));
  }
  const t0 = Date.now();
  const built = buildFireClusters(bulk);
  const ms = Date.now() - t0;
  add('6.000 Detektionen werden in unter 400 ms geclustert', ms < 400,
    `${ms} ms, ${built.length} Cluster`);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
