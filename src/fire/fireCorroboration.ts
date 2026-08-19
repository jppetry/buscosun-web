/**
 * Bestätigung durch die EFFIS-Brandflächenkartierung (Phase E1/E2, Gate GWBE1).
 *
 * ── Was hier bestätigt wird — und was ausdrücklich NICHT ─────────────────────
 * Der Kickoff sah ein Abzeichen „von EFFIS als Vegetationsbrand eingestuft" vor,
 * abgeleitet daraus, ob eine FIRMS-Detektion auch im GWIS-Hotspot-Layer steht.
 * Phase E0 hat das gemessen und verworfen: `ms:viirs.hs.*` auf GWIS ist NASA
 * FIRMS **unverändert** weitergereicht — 99,4 % aller Detektionen stehen
 * koordinaten- und minutengleich darin, **einschließlich aller geprüften
 * Stahlwerke** (Duisburg 125/129, Linz 73/74, …). Ein solches Abzeichen wäre
 * auf ThyssenKrupp Duisburg genauso „bestätigt" wie auf einem Waldbrand — also
 * eine falsche Tatsachenbehauptung (`audit/waldbrand-effis.md` §3).
 *
 * Was EFFIS **tatsächlich** prüft, ist die **Brandflächenkartierung** (Rapid
 * Damage Assessment): satellitenbild-basiert, visuell kontrolliert, mit Fläche,
 * Branddatum und Landbedeckung. Liegt eine Detektion räumlich *und* zeitlich in
 * einer solchen Fläche, ist das eine unabhängige Beobachtung — nicht dieselbe
 * Thermalanomalie noch einmal. **Nur hier fällt in der Waldbrand-Ansicht das Wort
 * „bestätigt"** — und immer mit Quelle, Fläche und Datum.
 *
 * ── Drei Regeln ─────────────────────────────────────────────────────────────
 *  1. **Fehlende Kartierung ist nie Evidenz gegen ein Feuer.** Kleine, kurze
 *     oder frische Feuer werden nicht oder erst Tage später kartiert. Es gibt
 *     deshalb genau zwei Ausgaben: „kartiert (…)" oder nichts — kein „nicht
 *     kartiert"-Etikett, keine Abwertung.
 *  2. **Räumlich mit Pixeltoleranz, zeitlich begrenzt.** Der Punkt ist die
 *     Pixelmitte; er darf bis `TOLERANCE_M` außerhalb des Polygons liegen. Und
 *     eine Fläche vom Februar bestätigt keine Detektion vom August: `FIREDATE`
 *     muss innerhalb `MATCH_DAYS` um die Detektion liegen.
 *  3. **Alles aus den Daten.** Fläche, Datum, Stand und Landbedeckungsanteile
 *     kommen aus dem Feature; nichts wird geschätzt oder aus FRP abgeleitet.
 *
 * Pur, DOM-frei, ohne Modulzustand — `npm run verify:fire-corroboration`.
 */

/** Pixeltoleranz um das Polygon: rund eine halbe VIIRS-Pixeldiagonale. */
export const TOLERANCE_M = 400;
/** Zeitfenster um `FIREDATE`, in dem eine Detektion zur Fläche passen kann. */
export const MATCH_DAYS = 14;
const MATCH_MS = MATCH_DAYS * 86_400_000;

// ---------------------------------------------------------------------------
// Landbedeckung — die neun Anteile, die EFFIS je Fläche liefert (Summe 100 %)
// ---------------------------------------------------------------------------

export type LandcoverKey =
  | 'CONIFER' | 'BROADLEA' | 'MIXED' | 'SCLEROPH' | 'TRANSIT'
  | 'OTHERNATLC' | 'AGRIAREAS' | 'ARTIFSURF' | 'OTHERLC';

export const LANDCOVER_KEYS: readonly LandcoverKey[] = [
  'CONIFER', 'BROADLEA', 'MIXED', 'SCLEROPH', 'TRANSIT', 'OTHERNATLC', 'AGRIAREAS', 'ARTIFSURF', 'OTHERLC',
] as const;

/** Deutsche Beschriftung je Anteil — Feldnamen wie in der Quelle, Sprache unsere. */
export const LANDCOVER_LABEL: Record<LandcoverKey, string> = {
  CONIFER: 'Nadelwald',
  BROADLEA: 'Laubwald',
  MIXED: 'Mischwald',
  SCLEROPH: 'Hartlaubvegetation',
  TRANSIT: 'Übergangs-Wald/Strauch',
  OTHERNATLC: 'andere natürliche Flächen',
  AGRIAREAS: 'Agrarflächen',
  ARTIFSURF: 'Kunstflächen',
  OTHERLC: 'sonstige Flächen',
};

/**
 * Füllfarbe je dominanter Landbedeckung — beschreibt, WAS gebrannt hat, keine
 * Gefahr. Bewusst gedeckt (Narben, keine Lage) und ohne Rot: Rot ist in dieser
 * Ansicht der Gefahrenstufe und der Detektion vorbehalten.
 */
export const LANDCOVER_COLOR: Record<LandcoverKey, string> = {
  CONIFER: '#2F5D3A',
  BROADLEA: '#5E8C4A',
  MIXED: '#487349',
  SCLEROPH: '#7A8B3A',
  TRANSIT: '#8B9B5A',
  OTHERNATLC: '#A38B5C',
  AGRIAREAS: '#C9A84A',
  ARTIFSURF: '#8C8C8C',
  OTHERLC: '#9C8C7C',
};

// ---------------------------------------------------------------------------
// Polygon-Modell
// ---------------------------------------------------------------------------

export interface BurntPolygon {
  id: string;
  /** Branddatum (Beginn) in ms UTC — `FIREDATE` trägt eine Uhrzeit. */
  firedateMs: number | null;
  /** Nur im Archiv-Layer vorhanden. */
  finaldateMs: number | null;
  /** Letzte Bearbeitung der Fläche durch EFFIS — der „Stand". */
  lastUpdateMs: number | null;
  areaHa: number | null;
  country: string | null;
  province: string | null;
  commune: string | null;
  /** Anteile in Prozent, Summe ≈ 100. */
  landcover: Record<LandcoverKey, number>;
  /** Anteil innerhalb Natura 2000, Prozent. */
  percNa2k: number | null;
  /** [Polygon][Ring][Punkt] = [lon, lat]. MultiPolygon → mehrere Einträge. */
  polys: number[][][][];
  /** [west, south, east, north] — Vorfilter für die Punktprüfung. */
  bbox: [number, number, number, number];
}

/** `"2026-08-13 10:41:00"` / `"2026-08-14 14:38:36.282953"` → ms UTC. */
export function parseEffisDate(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  const iso = m ? `${m[1]}T${m[2]}Z` : `${raw.trim().slice(0, 10)}T00:00:00Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Ein GeoJSON-Feature des EFFIS-WFS → `BurntPolygon`; `null`, wenn keine Fläche. */
export function parseBurntFeature(f: GeoJSON.Feature): BurntPolygon | null {
  const g = f.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null;
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][];
  if (!polys.length || !polys[0]?.[0]?.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) {
    if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
  }
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const landcover = {} as Record<LandcoverKey, number>;
  for (const k of LANDCOVER_KEYS) landcover[k] = num(p[k]) ?? 0;
  return {
    id: String(p.id ?? f.id ?? `${w.toFixed(4)},${s.toFixed(4)}`),
    firedateMs: parseEffisDate(p.FIREDATE),
    finaldateMs: parseEffisDate(p.FINALDATE),
    lastUpdateMs: parseEffisDate(p.LASTUPDATE),
    areaHa: num(p.AREA_HA),
    country: typeof p.COUNTRY === 'string' ? p.COUNTRY : null,
    province: typeof p.PROVINCE === 'string' ? p.PROVINCE : null,
    commune: typeof p.COMMUNE === 'string' ? p.COMMUNE : null,
    landcover,
    percNa2k: num(p.PERCNA2K),
    polys,
    bbox: [w, s, e, n],
  };
}

/** Anteile absteigend, ohne Nullen — die Reihenfolge, in der man sie liest. */
export function landcoverBreakdown(p: BurntPolygon): { key: LandcoverKey; label: string; pct: number }[] {
  return LANDCOVER_KEYS
    .map((key) => ({ key, label: LANDCOVER_LABEL[key], pct: p.landcover[key] }))
    .filter((x) => x.pct > 0.5)
    .sort((a, b) => b.pct - a.pct);
}

/** Dominante Klasse — `null`, wenn die Quelle keine Anteile führt (alle 0). */
export function dominantLandcover(p: BurntPolygon): LandcoverKey | null {
  const top = landcoverBreakdown(p)[0];
  return top ? top.key : null;
}

// ---------------------------------------------------------------------------
// Geometrie — klein, planar genug für DACH
// ---------------------------------------------------------------------------

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Punkt im Polygon (äußerer Ring ja, Löcher nein), über alle Teilpolygone. */
export function pointInPolygon(lon: number, lat: number, p: BurntPolygon): boolean {
  for (const poly of p.polys) {
    if (!pointInRing(lon, lat, poly[0])) continue;
    let inHole = false;
    for (let r = 1; r < poly.length; r++) if (pointInRing(lon, lat, poly[r])) { inHole = true; break; }
    if (!inHole) return true;
  }
  return false;
}

/** Abstand Punkt → Strecke in Metern (äquirektangular, für Kilometer genau genug). */
function segDistM(lon: number, lat: number, ax: number, ay: number, bx: number, by: number): number {
  const k = Math.cos((lat * Math.PI) / 180) * 111_320;
  const px = lon * k, py = lat * 111_320;
  const x1 = ax * k, y1 = ay * 111_320, x2 = bx * k, y2 = by * 111_320;
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Kürzester Abstand des Punkts zum Rand des Polygons in Metern. */
export function distanceToPolygonM(lon: number, lat: number, p: BurntPolygon): number {
  let best = Infinity;
  for (const poly of p.polys) for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const d = segDistM(lon, lat, ring[j][0], ring[j][1], ring[i][0], ring[i][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Liegt der Punkt in der Fläche oder näher als `TOLERANCE_M` an ihrem Rand? */
export function nearPolygon(lon: number, lat: number, p: BurntPolygon, toleranceM = TOLERANCE_M): boolean {
  const pad = toleranceM / 111_320 * 1.5; // grober Vorfilter in Grad (Länge etwas großzügiger)
  const [w, s, e, n] = p.bbox;
  if (lon < w - pad * 1.6 || lon > e + pad * 1.6 || lat < s - pad || lat > n + pad) return false;
  if (pointInPolygon(lon, lat, p)) return true;
  return distanceToPolygonM(lon, lat, p) <= toleranceM;
}

// ---------------------------------------------------------------------------
// Die Bestätigung
// ---------------------------------------------------------------------------

export interface Detection { lat: number; lon: number; acqMs: number }

/** Passt das Branddatum zeitlich zur Detektion? Ohne Datum: nein — keine Vermutung. */
export function timeMatches(p: BurntPolygon, acqMs: number): boolean {
  if (p.firedateMs == null) return false;
  const start = p.firedateMs;
  // Läuft die Fläche laut Archiv bis FINALDATE, zählt der ganze Zeitraum.
  const end = p.finaldateMs != null && p.finaldateMs > start ? p.finaldateMs : start;
  return acqMs >= start - MATCH_MS && acqMs <= end + MATCH_MS;
}

/**
 * Die kartierte Fläche zu einer Detektion — oder `null`.
 * Bei mehreren Treffern die mit dem **nächsten Branddatum**; das ist die
 * wahrscheinlichste Zuordnung und die einzige, die sich begründen lässt.
 */
export function mappedAreaFor(
  det: Detection, polys: readonly BurntPolygon[], toleranceM = TOLERANCE_M,
): BurntPolygon | null {
  let best: BurntPolygon | null = null;
  let bestDt = Infinity;
  for (const p of polys) {
    if (!timeMatches(p, det.acqMs)) continue;
    if (!nearPolygon(det.lon, det.lat, p, toleranceM)) continue;
    const dt = Math.abs((p.firedateMs ?? 0) - det.acqMs);
    if (dt < bestDt) { best = p; bestDt = dt; }
  }
  return best;
}

/**
 * Für ein Ereignis (mehrere Detektionen): die kartierte Fläche, sobald **eine**
 * Detektion des Ereignisses hineinfällt. Ein Ereignis ist ohnehin eine Wolke
 * von Pixelmitten; zu verlangen, dass alle drin liegen, wäre eine falsche
 * Strenge.
 */
export function mappedAreaForEvent(
  dets: readonly Detection[], polys: readonly BurntPolygon[], toleranceM = TOLERANCE_M,
): BurntPolygon | null {
  for (const d of dets) {
    const hit = mappedAreaFor(d, polys, toleranceM);
    if (hit) return hit;
  }
  return null;
}

/** Wie viele Detektionen liegen in kartierten Flächen? Für die Statuszeile. */
export function countMapped(dets: readonly Detection[], polys: readonly BurntPolygon[]): number {
  if (!polys.length) return 0;
  let n = 0;
  for (const d of dets) if (mappedAreaFor(d, polys)) n++;
  return n;
}

const fmtDate = (ms: number | null): string =>
  ms == null ? '—' : new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

/**
 * Der Satz zur Bestätigung. Das einzige „bestätigt" der Ansicht — mit Quelle,
 * Fläche und Datum, und mit dem Hinweis, dass die Fläche kartiert ist, nicht
 * das Feuer „gemeldet".
 */
export function corroborationLabel(p: BurntPolygon): string {
  const ha = p.areaHa == null ? 'Fläche nicht angegeben' : `${p.areaHa.toLocaleString('de-DE')} ha`;
  const top = landcoverBreakdown(p)[0];
  const lc = top ? `, ${Math.round(top.pct)} % ${top.label}` : '';
  return `Brandfläche von EFFIS kartiert (bestätigt): ${ha}${lc} · Branddatum ${fmtDate(p.firedateMs)}`
    + ` · Stand ${fmtDate(p.lastUpdateMs)}`;
}

/** Der Hinweis, der IMMER dazugehört — auch wenn kein Polygon gefunden wurde. */
export const NO_MAPPING_NOTE =
  'Keine kartierte Fläche ist kein Beleg gegen ein Feuer: EFFIS kartiert nach Satellitenbild und mit Verzug, kleine oder frische Brände fehlen.';

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface CorroborationCheck { name: string; ok: boolean; detail?: string }

/** Ein Quadrat um (lon0, lat0) mit Kantenlänge `sideM` Metern. */
export function squarePolygon(lon0: number, lat0: number, sideM: number, props: Record<string, unknown>): GeoJSON.Feature {
  const dLat = sideM / 2 / 111_320;
  const dLon = dLat / Math.cos((lat0 * Math.PI) / 180);
  return {
    type: 'Feature',
    properties: props,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [lon0 - dLon, lat0 - dLat], [lon0 + dLon, lat0 - dLat],
        [lon0 + dLon, lat0 + dLat], [lon0 - dLon, lat0 + dLat], [lon0 - dLon, lat0 - dLat],
      ]],
    },
  };
}

export function verifyFireCorroboration(): { checks: CorroborationCheck[]; passed: number; total: number } {
  const checks: CorroborationCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // Echte Feature-Eigenschaften aus der E0-Sonde (Neustadt a. d. Waldnaab, 2 ha Nadelwald).
  const props = {
    id: '616544', FIREDATE: '2026-08-09 11:55:00', LASTUPDATE: '2026-08-11 07:47:34.677441',
    COUNTRY: 'DE', PROVINCE: 'Neustadt a. d. Waldnaab', COMMUNE: 'Gdefr. Geb. (Lkr Neustadt a.d.Waldnaab)',
    AREA_HA: '2', BROADLEA: '0', CONIFER: '99.999999995', MIXED: '0', SCLEROPH: '0', TRANSIT: '0',
    OTHERNATLC: '0', AGRIAREAS: '0', ARTIFSURF: '0', OTHERLC: '0', PERCNA2K: '0', CLASS: '7DAYS',
  };
  const centre = { lon: 12.2, lat: 49.7 };
  const p = parseBurntFeature(squarePolygon(centre.lon, centre.lat, 1000, props));
  add('Feature wird geparst', p != null);
  if (!p) return { checks, passed: 0, total: checks.length };

  add('FIREDATE mit Uhrzeit wird als UTC gelesen',
    p.firedateMs === Date.UTC(2026, 7, 9, 11, 55), new Date(p.firedateMs ?? 0).toISOString());
  add('LASTUPDATE mit Mikrosekunden wird gelesen',
    p.lastUpdateMs === Date.UTC(2026, 7, 11, 7, 47, 34), new Date(p.lastUpdateMs ?? 0).toISOString());
  add('AREA_HA kommt als String und wird Zahl', p.areaHa === 2);
  add('Landbedeckung: Nadelwald dominiert', dominantLandcover(p) === 'CONIFER');
  add('Aufschlüsselung lässt Nullen weg und sortiert absteigend',
    landcoverBreakdown(p).length === 1 && landcoverBreakdown(p)[0].label === 'Nadelwald');
  add('alle neun Anteile haben eine deutsche Beschriftung und eine Farbe',
    LANDCOVER_KEYS.every((k) => LANDCOVER_LABEL[k].length > 3 && /^#[0-9A-F]{6}$/i.test(LANDCOVER_COLOR[k])));
  add('keine Landbedeckungsfarbe ist rot (Rot bleibt Gefahr und Detektion vorbehalten)',
    LANDCOVER_KEYS.every((k) => {
      const c = LANDCOVER_COLOR[k];
      const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
      return !(r > 160 && g < 110 && b < 110);
    }));

  // --- Räumlich: innen, Toleranz, außerhalb ------------------------------------
  const t = Date.UTC(2026, 7, 9, 12, 0);
  add('Detektion IN der Fläche wird zugeordnet',
    mappedAreaFor({ lon: centre.lon, lat: centre.lat, acqMs: t }, [p]) === p);
  // 500 m Kante ⇒ Rand bei 500 m; Punkt bei 800 m Nord ⇒ 300 m außerhalb ⇒ innerhalb 400 m Toleranz.
  const near = { lon: centre.lon, lat: centre.lat + 800 / 111_320, acqMs: t };
  add('Detektion 300 m außerhalb (Pixeltoleranz) wird zugeordnet', mappedAreaFor(near, [p]) === p,
    `${distanceToPolygonM(near.lon, near.lat, p).toFixed(0)} m`);
  const far = { lon: centre.lon, lat: centre.lat + 1500 / 111_320, acqMs: t };
  add('Detektion 1 km außerhalb wird NICHT zugeordnet', mappedAreaFor(far, [p]) === null,
    `${distanceToPolygonM(far.lon, far.lat, p).toFixed(0)} m`);
  add('Punkt-in-Polygon: außerhalb ist außerhalb', pointInPolygon(centre.lon + 1, centre.lat, p) === false);

  // Loch: ein Ring innen ⇒ Punkt im Loch zählt nicht als innen.
  const holed = parseBurntFeature({
    type: 'Feature', properties: props,
    geometry: { type: 'Polygon', coordinates: [
      [[12.0, 49.0], [12.2, 49.0], [12.2, 49.2], [12.0, 49.2], [12.0, 49.0]],
      [[12.08, 49.08], [12.12, 49.08], [12.12, 49.12], [12.08, 49.12], [12.08, 49.08]],
    ] },
  });
  add('Loch im Polygon zählt nicht als innen', !!holed && pointInPolygon(12.1, 49.1, holed) === false);
  add('MultiPolygon wird zusammengefasst', (() => {
    const mp = parseBurntFeature({
      type: 'Feature', properties: props,
      geometry: { type: 'MultiPolygon', coordinates: [
        [[[12.0, 49.0], [12.1, 49.0], [12.1, 49.1], [12.0, 49.1], [12.0, 49.0]]],
        [[[13.0, 50.0], [13.1, 50.0], [13.1, 50.1], [13.0, 50.1], [13.0, 50.0]]],
      ] },
    });
    return !!mp && pointInPolygon(13.05, 50.05, mp) && pointInPolygon(12.05, 49.05, mp) && !pointInPolygon(12.5, 49.5, mp)
      && mp.bbox[0] === 12 && mp.bbox[2] === 13.1;
  })());

  // --- Zeitlich: eine Februar-Fläche bestätigt keine August-Detektion ---------
  const feb = parseBurntFeature(squarePolygon(centre.lon, centre.lat, 1000, { ...props, FIREDATE: '2026-02-20 10:00:00' }));
  add('Fläche vom Februar bestätigt KEINE Detektion vom August',
    !!feb && mappedAreaFor({ lon: centre.lon, lat: centre.lat, acqMs: t }, [feb]) === null);
  add('Detektion 3 Tage VOR dem Branddatum passt noch (Kartierdatum ≠ erste Detektion)',
    mappedAreaFor({ lon: centre.lon, lat: centre.lat, acqMs: t - 3 * 86_400_000 }, [p]) === p);
  add('Detektion 20 Tage danach passt nicht mehr',
    mappedAreaFor({ lon: centre.lon, lat: centre.lat, acqMs: t + 20 * 86_400_000 }, [p]) === null);
  const noDate = parseBurntFeature(squarePolygon(centre.lon, centre.lat, 1000, { ...props, FIREDATE: undefined }));
  add('ohne Branddatum wird nichts vermutet', !!noDate && mappedAreaFor({ lon: centre.lon, lat: centre.lat, acqMs: t }, [noDate]) === null);
  const withFinal = parseBurntFeature(squarePolygon(centre.lon, centre.lat, 1000, { ...props, FINALDATE: '2026-09-15 00:00:00' }));
  add('Archiv-Fläche mit FINALDATE deckt den ganzen Brandzeitraum',
    !!withFinal && mappedAreaFor({ lon: centre.lon, lat: centre.lat, acqMs: Date.UTC(2026, 8, 10) }, [withFinal]) === withFinal);

  // --- Mehrere Kandidaten: das nächste Branddatum gewinnt ---------------------
  const older = parseBurntFeature(squarePolygon(centre.lon, centre.lat, 1000, { ...props, id: 'alt', FIREDATE: '2026-08-01 10:00:00' }));
  add('bei zwei Flächen gewinnt das nähere Branddatum',
    !!older && mappedAreaFor({ lon: centre.lon, lat: centre.lat, acqMs: t }, [older, p])?.id === '616544');

  // --- Ereignis: eine Detektion drin genügt -----------------------------------
  add('Ereignis: eine Detektion in der Fläche genügt',
    mappedAreaForEvent([far, { lon: centre.lon, lat: centre.lat, acqMs: t }], [p]) === p);
  add('Ereignis ohne Treffer ⇒ null', mappedAreaForEvent([far], [p]) === null);
  add('countMapped zählt richtig',
    countMapped([far, near, { lon: centre.lon, lat: centre.lat, acqMs: t }], [p]) === 2);
  add('leere Eingaben ⇒ null / 0',
    mappedAreaFor({ lon: 0, lat: 0, acqMs: t }, []) === null && countMapped([], [p]) === 0);

  // --- Sprache ------------------------------------------------------------------
  const label = corroborationLabel(p);
  add('Beschriftung nennt Quelle, Fläche, Landbedeckung, Branddatum und Stand',
    /EFFIS/.test(label) && /2 ha/.test(label) && /Nadelwald/.test(label) && /09\.08\.2026/.test(label) && /Stand 11\.08\.2026/.test(label), label);
  add('das Wort „bestätigt" fällt nur mit Quelle im selben Satz',
    /kartiert \(bestätigt\)/.test(label) && label.indexOf('EFFIS') < label.indexOf('bestätigt'));
  add('Hinweis „keine Kartierung ist kein Beleg gegen ein Feuer" existiert',
    /kein Beleg gegen ein Feuer/.test(NO_MAPPING_NOTE));
  add('kein „zwei Quellen"-Vokabular', ![label, NO_MAPPING_NOTE].some((s) => /zwei Quellen|doppelt verifiziert|unabhängig bestätigt/i.test(s)));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
