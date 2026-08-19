/**
 * EPSG:2056 (Schweizer Landeskoordinaten LV95) → WGS84.
 *
 * ── Warum dieses Modul überhaupt existiert ───────────────────────────────────
 * Die BAFU-Waldbranddaten liegen **ausschließlich** in LV95 vor: Das STAC-Item
 * führt genau ein Asset (`…_2056.geojson`), eine 4326-Fassung antwortet mit 403.
 * MapLibre erwartet GeoJSON aber in WGS84 — ungewandelt landen die Polygone bei
 * Koordinaten wie `[2607356, 1185118]`, also weit außerhalb jeder Karte. Genau
 * das war beim ersten Verdrahten zu sehen: Daten geladen, nichts gezeichnet.
 *
 * ── Warum keine Bibliothek ───────────────────────────────────────────────────
 * `proj4` wäre die naheliegende Antwort und ist nach **D-06** ausgeschlossen
 * (keine neue Runtime-Abhängigkeit). Stattdessen die **amtliche Näherungsformel
 * von swisstopo** („Näherungslösungen für die Transformation zwischen den
 * Schweizer Projektionskoordinaten und WGS84"). Sie ist nicht selbst
 * ausgedacht, sondern die von der Landesvermessung publizierte Reihenentwicklung
 * mit einer Genauigkeit im **Meterbereich** über die ganze Schweiz.
 *
 * ── Warum das hier genau genug ist ───────────────────────────────────────────
 * Dargestellt werden **Warnregionen** — Flächen von zehn bis hunderten
 * Quadratkilometern, deren Grenzen ohnehin verwaltungsgezogen sind. Ein
 * Fehler von einem Meter ist bei dieser Aussage nicht messbar. Für Aufgaben,
 * die metergenau sein müssen (Vermessung, Katastergrenzen), wäre die Formel
 * **nicht** geeignet — das steht hier, damit es niemand versehentlich dafür
 * benutzt.
 *
 * Pur: kein DOM, kein Fetch, kein Modulzustand.
 */

/**
 * Ein Punkt LV95 → `[lon, lat]` in WGS84.
 *
 * Die Formel arbeitet mit auf Bern bezogenen, auf 10^6 normierten Hilfsgrößen;
 * das Ergebnis fällt in Altgrad-Sexagesimalsekunden an und wird mit `100/36` in
 * Dezimalgrad umgerechnet.
 */
export function lv95ToWgs84(e: number, n: number): [number, number] {
  // Auf den Nullpunkt Bern beziehen und normieren.
  const y = (e - 2_600_000) / 1_000_000;
  const x = (n - 1_200_000) / 1_000_000;

  const lonSec =
    2.677_909_4
    + 4.728_982 * y
    + 0.791_484 * y * x
    + 0.130_6 * y * x * x
    - 0.043_6 * y * y * y;

  const latSec =
    16.902_389_2
    + 3.238_272 * x
    - 0.270_978 * y * y
    - 0.002_528 * x * x
    - 0.044_7 * y * y * x
    - 0.014_0 * x * x * x;

  return [(lonSec * 100) / 36, (latSec * 100) / 36];
}

/** Erkennt an der Größenordnung, ob eine Koordinate in LV95 vorliegt.
 *  LV95-Ostwerte liegen bei ~2,5–2,9 Mio, WGS84-Längen bei −180…180. */
export function looksLikeLv95(coord: number[]): boolean {
  return Math.abs(coord[0]) > 1000;
}

/**
 * Wandelt eine GeoJSON-Sammlung von LV95 nach WGS84 — **nur**, wenn sie
 * tatsächlich in LV95 vorliegt. Liegt sie schon in WGS84 vor (etwa weil das
 * Portal doch einmal eine 4326-Fassung ausliefert), bleibt sie unverändert.
 * Eigenschaften werden durchgereicht, Geometrietypen erhalten.
 */
export function reprojectFeatureCollection(
  fc: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  let needs = false;
  outer: for (const f of fc.features ?? []) {
    const g = f.geometry as { coordinates?: unknown } | null;
    if (!g?.coordinates) continue;
    let c: unknown = g.coordinates;
    while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
    if (Array.isArray(c) && typeof c[0] === 'number') { needs = looksLikeLv95(c as number[]); break outer; }
  }
  if (!needs) return fc;

  const walk = (c: unknown): unknown => {
    if (!Array.isArray(c)) return c;
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      return lv95ToWgs84(c[0], c[1]);
    }
    return c.map(walk);
  };

  return {
    type: 'FeatureCollection',
    features: (fc.features ?? []).map((f) => ({
      ...f,
      geometry: f.geometry
        ? ({ ...f.geometry, coordinates: walk((f.geometry as { coordinates: unknown }).coordinates) } as GeoJSON.Geometry)
        : f.geometry,
    })),
  };
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12) — gegen amtliche Referenzpunkte
// ---------------------------------------------------------------------------

export interface ProjCheck { name: string; ok: boolean; detail?: string }

export function verifySwissProjection(): { checks: ProjCheck[]; passed: number; total: number } {
  const checks: ProjCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

  // Referenzpunkte aus der swisstopo-Dokumentation bzw. amtlichen Angaben.
  // Toleranz 0,001° ≈ 100 m — großzügig, prüft die Formel, nicht die Stelle.
  const bern = lv95ToWgs84(2_600_000, 1_200_000);
  add('Nullpunkt Bern → 7,4386° / 46,9511°',
    near(bern[0], 7.43863, 1e-3) && near(bern[1], 46.95108, 1e-3),
    `${bern[0].toFixed(5)} / ${bern[1].toFixed(5)}`);

  // Zürich HB, Genf, Chur — über die Breite und Länge der Schweiz verteilt.
  const zh = lv95ToWgs84(2_683_130, 1_247_720);
  add('Zürich HB liegt bei ~8,54° / ~47,38°',
    near(zh[0], 8.540, 5e-3) && near(zh[1], 47.378, 5e-3), `${zh[0].toFixed(3)} / ${zh[1].toFixed(3)}`);
  const ge = lv95ToWgs84(2_500_100, 1_117_400);
  add('Genf liegt bei ~6,15° / ~46,21°',
    near(ge[0], 6.146, 8e-3) && near(ge[1], 46.207, 8e-3), `${ge[0].toFixed(3)} / ${ge[1].toFixed(3)}`);

  // Hier stand zunächst ein vierter Punkt („Chur"), der um ~1 km danebenlag.
  // Nachgerechnet war nicht die Formel falsch, sondern MEIN LV95-Eingabewert:
  // er war aus dem Gedächtnis gegriffen und nie belegt. Ein Prüfwert, den man
  // nicht belegen kann, prüft nichts — er prüft die eigene Erinnerung. Deshalb
  // entfernt statt die Toleranz aufzuweiten, bis er passt.

  // Statt eines weiteren Stadtpunktes die Ecken der LV95-Ausdehnung: sie müssen
  // im Schweizer Rahmen landen. Das fängt Vorzeichen- und Skalierungsfehler ab,
  // ohne sich auf auswendig gewusste Ortskoordinaten zu stützen.
  const corners = [
    lv95ToWgs84(2_485_000, 1_075_000), // SW
    lv95ToWgs84(2_834_000, 1_075_000), // SE
    lv95ToWgs84(2_485_000, 1_296_000), // NW
    lv95ToWgs84(2_834_000, 1_296_000), // NE
  ];
  const inCh = [bern, zh, ge, ...corners]
    .every(([lo, la]) => lo > 5.8 && lo < 10.6 && la > 45.7 && la < 47.9);
  add('alle Referenzpunkte und die LV95-Eckpunkte fallen in den Schweizer Rahmen', inCh,
    corners.map(([lo, la]) => `${lo.toFixed(2)}/${la.toFixed(2)}`).join(' · '));
  add('Ostwerte wachsen nach Osten, Nordwerte nach Norden (keine Achsenvertauschung)',
    corners[1][0] > corners[0][0] && corners[2][1] > corners[0][1]);

  add('LV95 wird an der Größenordnung erkannt',
    looksLikeLv95([2_607_356, 1_185_118]) === true && looksLikeLv95([7.44, 46.95]) === false);

  // Eine FeatureCollection in LV95 wird gewandelt …
  const lv: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature', properties: { level: 4 },
      geometry: { type: 'Polygon', coordinates: [[[2_600_000, 1_200_000], [2_601_000, 1_200_000], [2_600_000, 1_201_000], [2_600_000, 1_200_000]]] },
    }],
  };
  const out = reprojectFeatureCollection(lv);
  const first = (out.features[0].geometry as GeoJSON.Polygon).coordinates[0][0];
  add('FeatureCollection wird gewandelt', near(first[0], 7.43863, 1e-3) && near(first[1], 46.95108, 1e-3),
    `${first[0].toFixed(4)} / ${first[1].toFixed(4)}`);
  add('Eigenschaften bleiben erhalten',
    (out.features[0].properties as { level?: number })?.level === 4);
  add('Ringstruktur bleibt erhalten',
    (out.features[0].geometry as GeoJSON.Polygon).coordinates[0].length === 4);

  // … eine in WGS84 aber NICHT ein zweites Mal.
  const wgs: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature', properties: {},
      geometry: { type: 'Point', coordinates: [7.4386, 46.9511] },
    }],
  };
  add('bereits gewandelte Daten werden NICHT erneut projiziert',
    reprojectFeatureCollection(wgs) === wgs);
  add('leere Sammlung kippt nicht',
    reprojectFeatureCollection({ type: 'FeatureCollection', features: [] }).features.length === 0);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
