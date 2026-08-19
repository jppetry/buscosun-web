/**
 * **Detektionsraster** — die zusammenhängende Fläche der VIIRS-Pixel eines
 * Brandes (Phase BA3, Gate GWBBZ1).
 *
 * ── Was das ist, und was es ausdrücklich NICHT ist ───────────────────────────
 * FIRMS liefert kein Flächenfeld. `frp` ist eine **Leistung** (MW), `bright_ti4`
 * eine Temperatur (K, sättigt bei ~367 K) — kein Feld beschreibt Ausdehnung.
 * Was es gibt, sind `scan` und `track`: die **Kantenlängen des Pixels** in km.
 * Aus ihnen baut `footprintRing()` das Rechteck, in dem das Feuer *irgendwo*
 * liegt. Dieses Modul verschmilzt die Rechtecke eines Brandes zu einer Fläche
 * und rechnet ihren Inhalt aus.
 *
 * Das Ergebnis ist die **vom Satelliten abgedeckte Fläche**, nicht die
 * Brandfläche. Die Zahl, die das erklärt:
 *
 * > Ein VIIRS-Pixel bedeckt in DACH ~14–20 ha. Der reale Brand EMSR920/AOI02
 * > (Langenfeld) hatte laut Copernicus-EMS-Delineation **24,1 ha** — das sind
 * > **1,7 Pixel**. Ein typischer mitteleuropäischer Waldbrand ist kleiner als
 * > eine Handvoll Satellitenpixel.
 *
 * Das Detektionsraster ist deshalb systematisch **größer** als der Brand, bei
 * Kleinbränden um ein Vielfaches. Es ist eine **Obergrenze der Abdeckung**, und
 * jede Beschriftung sagt das. Die einzige Fläche, die eine Brandfläche heißen
 * darf, kommt aus der EFFIS-Kartierung (`fireCorroboration.ts`).
 *
 * ── Warum Rechteck-Vereinigung und keine Hülle ──────────────────────────────
 * Eine konkave Hülle (DBSCAN + concaveman) sähe „wie ein Brand" aus, hätte aber
 * zwei freie Parameter ohne physikalische Begründung — zwei plausible
 * Parametersätze liefern Flächen, die sich um Faktor 1,5–2 unterscheiden. Eine
 * Hektarzahl daraus wäre keine Messgröße. Die Vereinigung der Pixelrechtecke
 * hat **keinen freien Parameter**: sie ist exakt die Fläche, die die Karte auch
 * zeichnet, und bei gleicher Eingabe reproduzierbar. Sie füllt außerdem keine
 * unverbrannten Inseln zu, die nie detektiert wurden.
 *
 * ── Zwei unabhängige Rechenwege, absichtlich ────────────────────────────────
 * Der Flächeninhalt kommt aus der **Zellsumme** des komprimierten Gitters, der
 * Umriss aus der **Kantenverfolgung**. Beide beschreiben dieselbe Menge; die
 * Selbstverifikation vergleicht sie (Shoelace gegen Zellsumme). Ein Fehler in
 * einem der beiden Wege fällt damit auf, statt eine hübsche falsche Zahl zu
 * erzeugen.
 *
 * Pur, DOM-frei, ohne Modulzustand — `npm run verify:fire-zones`.
 */

import { footprintRing, type FirmsRow } from './sources/firmsHotspots';

// ---------------------------------------------------------------------------
// Maßstab — dieselben Konstanten wie `footprintRing`, damit die gerechnete
// Fläche exakt zu den gezeichneten Rechtecken passt.
// ---------------------------------------------------------------------------

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON = 111_320;

/**
 * Gleitkomma-Hygiene, **kein Modellparameter**: Kanten werden auf 1e-9 Grad
 * (~0,1 mm) gerastet, bevor irgendetwas verglichen wird.
 *
 * Der Grund ist gemessen, nicht theoretisch: VIIRS-Pixel eines Überflugs liegen
 * per Konstruktion **exakt** aneinander. Ob `mitte + kante` und
 * `nachbarmitte − kante` bitgleich herauskommen, entscheidet die letzte
 * Rundungsstelle — sie unterschieden sich um ~7e-15 Grad. Ohne Rasterung
 * zerfiel ein zusammenhängender Brand deshalb in mehrere Zonen mit
 * haarfeinen Lücken dazwischen; die Fläche stimmte, die Zonenzahl nicht.
 * 0,1 mm ist neun Größenordnungen unter der Ortsunschärfe der Quelle (±375 m)
 * und ändert an keiner Fläche etwas Messbares.
 */
const SNAP = 1e9;
const snap = (v: number): number => Math.round(v * SNAP) / SNAP;

/**
 * Notbremse je Zone. Die Zellmarkierung ist im schlechtesten Fall quadratisch
 * in der Pixelzahl; ein Industrienest mit tausenden Detektionen soll den
 * Hauptthread nicht blockieren. Greift der Deckel, meldet die Zone `capped` und
 * der Steckbrief sagt es — die Fläche ist dann die der ersten `MAX_RECTS`
 * Pixel, nicht die aller.
 */
export const MAX_RECTS_PER_ZONE = 3000;

export interface FireZone {
  /** Stabil aus Lage und Beginn — für React-Keys und Kartenfilter. */
  id: string;
  /** MultiPolygon-Koordinaten: [Polygon][Ring][Punkt] = [lon, lat]. Ring 0 außen. */
  polys: number[][][][];
  /** Vereinigungsfläche in Hektar — aus der Zellsumme, nicht aus dem Umriss. */
  areaHa: number;
  /** Zahl der Pixel (Detektionen) in dieser Zone. */
  pixels: number;
  /** Mittlere Einzelpixelfläche in ha — die Größenordnung, gegen die man liest. */
  meanPixelHa: number;
  firstMs: number;
  lastMs: number;
  /** Schwerpunkt der Pixelmitten. */
  lat: number;
  lon: number;
  /** [west, south, east, north]. */
  bbox: [number, number, number, number];
  /** Wurde `MAX_RECTS_PER_ZONE` erreicht? Dann ist die Fläche unvollständig. */
  capped: boolean;
}

interface Rect { w: number; s: number; e: number; n: number; row: FirmsRow }

/**
 * Das Rechteck einer Detektion — **aus `footprintRing()`**, nicht neu gerechnet.
 * Damit ist die Zone per Konstruktion die Vereinigung genau der Rechtecke, die
 * der Footprint-Layer zeichnet; eine zweite Formel könnte auseinanderlaufen.
 */
function rectOf(row: FirmsRow): Rect | null {
  const ring = footprintRing(row);
  if (!ring) return null;
  let w = Infinity; let s = Infinity; let e = -Infinity; let n = -Infinity;
  for (const [x, y] of ring) {
    if (x < w) w = x; if (x > e) e = x;
    if (y < s) s = y; if (y > n) n = y;
  }
  return { w: snap(w), s: snap(s), e: snap(e), n: snap(n), row };
}

// ---------------------------------------------------------------------------
// Zusammenhangskomponenten — welche Pixel bilden eine Zone?
// ---------------------------------------------------------------------------

/**
 * Zwei Rechtecke gehören zusammen, wenn sie sich überlappen **oder berühren**.
 * Berührung wird mitgenommen, weil zwei exakt aneinander grenzende Pixel sonst
 * als zwei Zonen mit sichtbarer Naht gezeichnet würden. Ein Berührpunkt an der
 * Ecke kann dabei einen eingeschnürten Umriss erzeugen — deshalb ist die
 * Ausgabe ein **MultiPolygon**, nicht ein einzelner Ring.
 */
function touches(a: Rect, b: Rect): boolean {
  return a.w <= b.e && b.w <= a.e && a.s <= b.n && b.s <= a.n;
}

/**
 * Gruppiert über ein Gitter: Jedes Rechteck wird in alle Zellen eingetragen,
 * die es berührt. Überlappen sich zwei Rechtecke, liegt der Überlapp in einer
 * Zelle, die **beide** berühren — sie treffen sich also garantiert in mindestens
 * einer Zelle. Ohne das Gitter wären es bei 6.700 Detektionen 22 Mio. Paare.
 */
function components(rects: readonly Rect[]): Rect[][] {
  // Zellweite deutlich über der größten Pixelkante (gemessen 0,32–0,80 km).
  const CELL_LAT = 0.02;
  const CELL_LON = 0.04;
  const parent = rects.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) { const nx = parent[i]; parent[i] = r; i = nx; }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a); const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const grid = new Map<string, number[]>();
  rects.forEach((r, i) => {
    const i0 = Math.floor(r.w / CELL_LON); const i1 = Math.floor(r.e / CELL_LON);
    const j0 = Math.floor(r.s / CELL_LAT); const j1 = Math.floor(r.n / CELL_LAT);
    for (let gi = i0; gi <= i1; gi++) {
      for (let gj = j0; gj <= j1; gj++) {
        const k = `${gi}|${gj}`;
        const list = grid.get(k);
        if (list) list.push(i); else grid.set(k, [i]);
      }
    }
  });

  for (const list of grid.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        if (touches(rects[list[a]], rects[list[b]])) union(list[a], list[b]);
      }
    }
  }

  const byRoot = new Map<number, Rect[]>();
  rects.forEach((r, i) => {
    const root = find(i);
    const g = byRoot.get(root);
    if (g) g.push(r); else byRoot.set(root, [r]);
  });
  return [...byRoot.values()];
}

// ---------------------------------------------------------------------------
// Vereinigung eines Clusters — komprimiertes Gitter
// ---------------------------------------------------------------------------

const uniqSorted = (vals: number[]): number[] => {
  const s = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of s) if (out.length === 0 || v > out[out.length - 1]) out.push(v);
  return out;
};

/** Erste Position in `arr` mit `arr[i] >= v` (arr streng aufsteigend). */
function lowerBound(arr: readonly number[], v: number): number {
  let lo = 0; let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/**
 * Die belegte Menge, **zeilenweise als Läufe** statt als Zellgitter.
 *
 * ── Warum nicht das volle Gitter ─────────────────────────────────────────────
 * Die naheliegende Fassung markiert ein `Uint8Array` über alle komprimierten
 * Zellen. An echten Daten gemessen (24-h-Lauf, 2 987 Detektionen) kostete das
 * **669 ms**, davon **477 ms in einer einzigen Zone** — dem Brandkomplex im
 * Hohen Venn mit 1 524 Pixeln. Der Grund: 1 524 Rechtecke ergeben ~3 000 x- und
 * ~3 000 y-Kanten, also **9,3 Mio. Zellen**, von denen fast alle leer sind und
 * trotzdem dreimal angefasst werden (markieren, Fläche, Rand).
 *
 * Die Läufe rechnen dieselbe Menge, berühren aber nur, was wirklich belegt ist:
 * je Zeile die x-Intervalle der Rechtecke, sortiert und verschmolzen. Fläche ist
 * die Summe der Laufbreiten; Randkanten entstehen an den Lauf-Enden (senkrecht)
 * und aus der Differenz zur Nachbarzeile (waagerecht). Gleiches Ergebnis, ohne
 * die leeren Zellen — die Selbstverifikation vergleicht weiterhin Zellsumme
 * gegen Umriss-Shoelace.
 */
interface Cover {
  xs: number[];
  ys: number[];
  areaM2: number;
  edges: Edge[];
}

/** `a \ b` für sortierte, disjunkte Läufe. */
function subtractRuns(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = [];
  let k = 0;
  for (let i = 0; i < a.length; i += 2) {
    let start = a[i];
    const end = a[i + 1];
    while (k < b.length && b[k + 1] <= start) k += 2;
    let j = k;
    while (j < b.length && b[j] < end) {
      if (b[j] > start) out.push(start, Math.min(b[j], end));
      start = Math.max(start, b[j + 1]);
      if (start >= end) break;
      j += 2;
    }
    if (start < end) out.push(start, end);
  }
  return out;
}

/**
 * Vereinigung, Fläche und Randkanten in **einem** Zeilendurchlauf.
 *
 * Der Durchlauf wandert von Süd nach Nord über die komprimierten Zeilen und
 * hält dabei die dort aktiven Rechtecke **dauerhaft nach `i0` sortiert**. Damit
 * entstehen die Läufe einer Zeile in einem linearen Durchgang — ohne Sortierung
 * und ohne Zwischenlisten. Die naive Fassung schrieb an derselben Zone 474 000
 * Zeileneinträge und sortierte 3 171-mal; sie kostete 300 ms, dieser Durchlauf
 * bleibt im einstelligen Bereich. Das Ergebnis ist identisch — die
 * Selbstverifikation prüft Fläche und Ringe unverändert.
 */
function coverOf(rects: readonly Rect[]): Cover {
  const xs = uniqSorted(rects.flatMap((r) => [r.w, r.e]));
  const ys = uniqSorted(rects.flatMap((r) => [r.s, r.n]));
  const ny = ys.length - 1;
  const n = rects.length;
  const edges: Edge[] = [];
  let areaM2 = 0;
  if (ny <= 0 || n === 0) return { xs, ys, areaM2, edges };

  const I0 = new Int32Array(n); const I1 = new Int32Array(n);
  const startsAt: number[][] = Array.from({ length: ny }, () => []);
  const endsAt: number[][] = Array.from({ length: ny + 1 }, () => []);
  for (let k = 0; k < n; k++) {
    I0[k] = lowerBound(xs, rects[k].w);
    I1[k] = lowerBound(xs, rects[k].e);
    const j0 = lowerBound(ys, rects[k].s);
    const j1 = lowerBound(ys, rects[k].n);
    if (j0 < ny && j1 > j0) { startsAt[j0].push(k); endsAt[Math.min(j1, ny)].push(k); }
  }

  /** Waagerechte Kanten für `a \ b` — zellweise, damit der Ringlauf anschließt. */
  const horizontal = (a: readonly number[], b: readonly number[], j: number, up: boolean) => {
    const diff = subtractRuns(a, b);
    for (let k = 0; k < diff.length; k += 2) {
      for (let i = diff[k]; i < diff[k + 1]; i++) {
        if (up) edges.push({ ax: i + 1, ay: j + 1, bx: i, by: j + 1, dir: 2, used: false });
        else edges.push({ ax: i, ay: j, bx: i + 1, by: j, dir: 0, used: false });
      }
    }
  };

  const active: number[] = [];
  let prev: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (const k of endsAt[j]) { const p = active.indexOf(k); if (p >= 0) active.splice(p, 1); }
    for (const k of startsAt[j]) {
      let lo = 0; let hi = active.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (I0[active[m]] < I0[k]) lo = m + 1; else hi = m; }
      active.splice(lo, 0, k);
    }

    const runs: number[] = [];
    for (const k of active) {
      const a = I0[k]; const b = I1[k];
      if (runs.length > 0 && a <= runs[runs.length - 1]) {
        if (b > runs[runs.length - 1]) runs[runs.length - 1] = b;
      } else { runs.push(a, b); }
    }

    if (runs.length > 0) {
      const dLat = (ys[j + 1] - ys[j]) * M_PER_DEG_LAT;
      const kLon = M_PER_DEG_LON * Math.cos((((ys[j] + ys[j + 1]) / 2) * Math.PI) / 180);
      let dLon = 0;
      for (let k = 0; k < runs.length; k += 2) dLon += xs[runs[k + 1]] - xs[runs[k]];
      areaM2 += dLat * dLon * kLon;
      // Senkrechte Kanten: genau an den Enden jedes Laufs, je Zeile eine.
      for (let k = 0; k < runs.length; k += 2) {
        edges.push({ ax: runs[k + 1], ay: j, bx: runs[k + 1], by: j + 1, dir: 1, used: false });
        edges.push({ ax: runs[k], ay: j + 1, bx: runs[k], by: j, dir: 3, used: false });
      }
    }
    horizontal(runs, prev, j, false);      // Unterkanten dieser Zeile
    if (j > 0) horizontal(prev, runs, j - 1, true); // Oberkanten der vorigen
    prev = runs;
  }
  horizontal(prev, [], ny - 1, true);      // Oberkanten der letzten Zeile
  return { xs, ys, areaM2, edges };
}

// ---------------------------------------------------------------------------
// Umriss — Kantenverfolgung mit dem Inneren links
// ---------------------------------------------------------------------------

// Richtungen: 0 = +x, 1 = +y, 2 = −x, 3 = −y.
interface Edge { ax: number; ay: number; bx: number; by: number; dir: number; used: boolean }

/**
 * Randkanten der belegten Menge, orientiert mit dem **Inneren links**. Äußere
 * Ringe laufen damit gegen den Uhrzeigersinn, Löcher im Uhrzeigersinn — genau
 * die Konvention, die GeoJSON erwartet.
 *
 * Die Koordinaten sind **Gitterindizes**, nicht Grad; erst der Ringbau setzt
 * `xs`/`ys` ein. Das hält den Vergleich zweier Ecken exakt (ganze Zahlen statt
 * Gleitkomma) — der Ringbau steht und fällt damit, dass zwei Kanten dieselbe
 * Ecke als identisch erkennen.
 */

/**
 * Kanten → geschlossene Ringe.
 *
 * An einer Einschnürung (vier Kanten treffen sich in einer Ecke) ist die
 * Fortsetzung nicht eindeutig. Gewählt wird in der Reihenfolge **rechts,
 * geradeaus, links** — die Standardregel, die das Innere links hält und damit
 * überschneidungsfreie Ringe liefert. Ohne sie kann der Lauf die Zone an der
 * Einschnürung kreuzen und einen Ring erzeugen, der sich selbst schneidet.
 */
function traceRings(edges: Edge[]): number[][][] {
  const byStart = new Map<string, Edge[]>();
  for (const e of edges) {
    const k = `${e.ax}|${e.ay}`;
    const list = byStart.get(k);
    if (list) list.push(e); else byStart.set(k, [e]);
  }
  const rings: number[][][] = [];
  for (const seed of edges) {
    if (seed.used) continue;
    const ring: number[][] = [];
    let cur: Edge | undefined = seed;
    while (cur && !cur.used) {
      cur.used = true;
      ring.push([cur.ax, cur.ay]);
      const cands = byStart.get(`${cur.bx}|${cur.by}`) ?? [];
      let next: Edge | undefined;
      // rechts (dir+3), geradeaus (dir), links (dir+1) — die Kehrtwende (dir+2)
      // gibt es an einer Randkante nicht.
      for (const turn of [3, 0, 1]) {
        const want = (cur.dir + turn) % 4;
        next = cands.find((e) => !e.used && e.dir === want);
        if (next) break;
      }
      cur = next;
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

/** Aufeinanderfolgende kollineare Punkte zusammenfassen — reine Ersparnis. */
function simplifyRing(ring: number[][]): number[][] {
  const out: number[][] = [];
  for (const p of ring) {
    while (out.length >= 2) {
      const a = out[out.length - 2]; const b = out[out.length - 1];
      const collinear = (b[0] - a[0]) * (p[1] - a[1]) === (b[1] - a[1]) * (p[0] - a[0]);
      if (!collinear) break;
      out.pop();
    }
    out.push(p);
  }
  return out;
}

/** Signierte Fläche in Gitterindex-Einheiten — Vorzeichen = Umlaufsinn. */
function signedArea(ring: readonly number[][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return a / 2;
}

function pointInRing(x: number, y: number, ring: readonly number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Ringe (in Gitterindizes) → MultiPolygon in Grad. Löcher werden dem äußeren
 * Ring zugeordnet, der sie enthält; bei Verschachtelung dem **kleinsten**, sonst
 * fiele ein Loch in einer Insel dem falschen Polygon zu.
 */
function ringsToPolys(rings: number[][][], c: Cover): number[][][][] {
  const outers: { ring: number[][]; area: number; holes: number[][][] }[] = [];
  const holes: number[][][] = [];
  for (const r of rings) {
    const a = signedArea(r);
    if (a > 0) outers.push({ ring: r, area: a, holes: [] });
    else if (a < 0) holes.push(r);
  }
  for (const h of holes) {
    const [hx, hy] = h[0];
    // Ein Punkt AUF dem Rand des äußeren Rings ist mehrdeutig — deshalb der
    // Schwerpunkt der ersten Kante, der garantiert im Inneren des Lochs liegt.
    const mx = (h[0][0] + h[1][0]) / 2 + (h[1][1] - h[0][1]) * 0.25;
    const my = (h[0][1] + h[1][1]) / 2 + (h[0][0] - h[1][0]) * 0.25;
    let best: typeof outers[number] | null = null;
    for (const o of outers) {
      if (!pointInRing(mx, my, o.ring) && !pointInRing(hx, hy, o.ring)) continue;
      if (!best || o.area < best.area) best = o;
    }
    (best ?? outers[0])?.holes.push(h);
  }
  const toDeg = (ring: number[][]): number[][] => {
    const pts = ring.map(([i, j]) => [c.xs[i], c.ys[j]]);
    pts.push([...pts[0]]); // GeoJSON verlangt den geschlossenen Ring
    return pts;
  };
  return outers.map((o) => [toDeg(simplifyRing(o.ring)), ...o.holes.map((h) => toDeg(simplifyRing(h)))]);
}

// ---------------------------------------------------------------------------
// Die Zonen
// ---------------------------------------------------------------------------

const HA_PER_M2 = 1 / 10_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Detektionen → Zonen. Reine Funktion: gleiche Zeilen ⇒ gleiche Zonen, in
 * stabiler Reihenfolge (absteigend nach Fläche, dann nach Kennung).
 *
 * Zeilen ohne `scan`/`track` haben kein Rechteck und zählen nicht mit — ein
 * geratenes Rechteck wäre eine erfundene Fläche.
 */
export function buildFireZones(rows: readonly FirmsRow[]): FireZone[] {
  const rects: Rect[] = [];
  for (const r of rows) { const rc = rectOf(r); if (rc) rects.push(rc); }
  if (rects.length === 0) return [];

  const zones: FireZone[] = [];
  for (const group of components(rects)) {
    const capped = group.length > MAX_RECTS_PER_ZONE;
    // Deckel: die JÜNGSTEN behalten — sie tragen die aktuelle Lage.
    const used = capped
      ? [...group].sort((a, b) => b.row.acqMs - a.row.acqMs).slice(0, MAX_RECTS_PER_ZONE)
      : group;

    const cover = coverOf(used);
    const areaHa = cover.areaM2 * HA_PER_M2;
    const polys = ringsToPolys(traceRings(cover.edges), cover);
    if (polys.length === 0) continue;

    let w = Infinity; let s = Infinity; let e = -Infinity; let n = -Infinity;
    let first = Infinity; let last = -Infinity;
    let sLat = 0; let sLon = 0; let pxM2 = 0;
    for (const r of used) {
      if (r.w < w) w = r.w; if (r.e > e) e = r.e;
      if (r.s < s) s = r.s; if (r.n > n) n = r.n;
      if (r.row.acqMs < first) first = r.row.acqMs;
      if (r.row.acqMs > last) last = r.row.acqMs;
      sLat += r.row.lat; sLon += r.row.lon;
      pxM2 += (r.n - r.s) * M_PER_DEG_LAT * (r.e - r.w) * M_PER_DEG_LON
        * Math.cos((r.row.lat * Math.PI) / 180);
    }
    const lat = sLat / used.length; const lon = sLon / used.length;
    zones.push({
      id: `z${w.toFixed(4)},${s.toFixed(4)}@${first}`,
      polys,
      areaHa: round1(areaHa),
      pixels: used.length,
      meanPixelHa: round1((pxM2 / used.length) * HA_PER_M2),
      firstMs: first,
      lastMs: last,
      lat,
      lon,
      bbox: [w, s, e, n],
      capped,
    });
  }
  zones.sort((a, b) => (b.areaHa - a.areaHa) || (a.id < b.id ? -1 : 1));
  return zones;
}

/** Zonen → GeoJSON. Nur, was die Karte zum Zeichnen und Anklicken braucht. */
export function zonesToGeoJSON(zones: readonly FireZone[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.map((z) => ({
      type: 'Feature' as const,
      geometry: { type: 'MultiPolygon' as const, coordinates: z.polys },
      properties: { id: z.id, ha: z.areaHa, px: z.pixels },
    })),
  };
}

/** Die Zone an einem Punkt — für das Popup, wenn nicht auf einen Punkt geklickt wurde. */
export function zoneAt(lon: number, lat: number, zones: readonly FireZone[]): FireZone | null {
  for (const z of zones) {
    const [w, s, e, n] = z.bbox;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    for (const poly of z.polys) {
      if (!pointInRing(lon, lat, poly[0])) continue;
      let inHole = false;
      for (let r = 1; r < poly.length; r++) if (pointInRing(lon, lat, poly[r])) { inHole = true; break; }
      if (!inHole) return z;
    }
  }
  return null;
}

/** Die Zone zu einer Detektion — Pixelmitte in der Zone, Zeit im Zonenfenster. */
export function zoneForDetection(
  lon: number, lat: number, acqMs: number, zones: readonly FireZone[],
): FireZone | null {
  const z = zoneAt(lon, lat, zones);
  if (!z) return null;
  return acqMs >= z.firstMs && acqMs <= z.lastMs ? z : null;
}

const fmtHa = (ha: number): string =>
  (ha >= 100 ? Math.round(ha) : ha).toLocaleString('de-DE', { maximumFractionDigits: 1 });

/**
 * Die Größenangabe. **Nie** das Wort „Brandfläche", immer die Pixelzahl daneben
 * — sie ist der Maßstab, an dem der Leser die Zahl einordnet.
 */
export function zoneAreaLabel(z: FireZone): string {
  const px = z.pixels === 1 ? '1 Pixel' : `${z.pixels} Pixeln`;
  return `Detektionsraster: ${fmtHa(z.areaHa)} ha aus ${px} (VIIRS 375 m)`
    + (z.capped ? ` · nur die ${MAX_RECTS_PER_ZONE} jüngsten Pixel gerechnet` : '');
}

/** Der Hinweis, der IMMER dazugehört — die Zahl ist ohne ihn irreführend. */
export function zoneAreaNote(z: FireZone): string {
  return `Abgedeckte Satellitenfläche, keine Brandfläche: ein Pixel bedeckt hier `
    + `~${fmtHa(z.meanPixelHa)} ha, und der Punkt ist die Pixelmitte. Der Brand ist `
    + `in aller Regel deutlich kleiner — amtlich kartiert wird er von EFFIS.`;
}

/** Steckbrief-Fassung ohne Zonenbezug (Legende, Layer-Karte). */
export const ZONE_NOTE =
  'Das Detektionsraster ist die zusammengefasste Fläche der Satellitenpixel, in denen es heiß war '
  + '— eine Obergrenze der Abdeckung, keine Brandfläche. Ein VIIRS-Pixel bedeckt 14–20 ha; ein '
  + 'realer Waldbrand in DACH ist oft kleiner als zwei Pixel. Die kartierte Brandfläche kommt von '
  + 'EFFIS und braucht 1–2 Tage.';

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface ZoneCheck { name: string; ok: boolean; detail?: string }

/** Eine Detektion mit gewählter Pixelgröße an fester Stelle. */
export function fixtureRow(lat: number, lon: number, acqMs: number, scanKm = 0.4, trackKm = 0.4): FirmsRow {
  return {
    lat, lon, acqMs, frp: 5, confidence: 'nominal', brightTi4: 320, brightTi5: 290,
    scanKm, trackKm, satellite: 'N', day: false, source: 'VIIRS_SNPP_NRT',
  };
}

/** Fläche eines MultiPolygons in ha — der UNABHÄNGIGE Weg (Shoelace am Umriss). */
export function polysAreaHa(polys: readonly number[][][][], atLat: number): number {
  const kLon = M_PER_DEG_LON * Math.cos((atLat * Math.PI) / 180);
  let sum = 0;
  for (const poly of polys) {
    poly.forEach((ring, idx) => {
      let a = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        a += (ring[j][0] * kLon) * (ring[i][1] * M_PER_DEG_LAT)
          - (ring[i][0] * kLon) * (ring[j][1] * M_PER_DEG_LAT);
      }
      sum += (idx === 0 ? 1 : -1) * Math.abs(a / 2);
    });
  }
  return sum * HA_PER_M2;
}

export function verifyFireZones(): { checks: ZoneCheck[]; passed: number; total: number } {
  const checks: ZoneCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const T = Date.UTC(2026, 7, 14, 12, 0);

  // --- Ein Pixel ---------------------------------------------------------------
  const one = buildFireZones([fixtureRow(50, 10, T)]);
  add('eine Detektion ⇒ eine Zone', one.length === 1 && one[0].pixels === 1);
  // 0,4 km × 0,4 km = 0,16 km² = 16 ha.
  add('Einzelpixel: 0,4 × 0,4 km ⇒ 16 ha', one.length === 1 && Math.abs(one[0].areaHa - 16) < 0.2,
    one[0] ? `${one[0].areaHa} ha` : 'keine Zone');
  add('Umriss eines Einzelpixels ist ein Rechteck mit 5 Punkten',
    one[0]?.polys.length === 1 && one[0].polys[0].length === 1 && one[0].polys[0][0].length === 5);
  add('Ring ist geschlossen', (() => {
    const r = one[0]?.polys[0][0];
    return !!r && r[0][0] === r[4][0] && r[0][1] === r[4][1];
  })());
  add('äußerer Ring läuft gegen den Uhrzeigersinn (GeoJSON-Konvention)',
    signedArea(one[0]?.polys[0][0] ?? []) > 0);

  // --- Zwei getrennte Pixel ----------------------------------------------------
  const far = buildFireZones([fixtureRow(50, 10, T), fixtureRow(50.5, 10.5, T)]);
  add('zwei entfernte Detektionen ⇒ zwei Zonen', far.length === 2);
  add('getrennte Zonen addieren sich nicht', far.every((z) => Math.abs(z.areaHa - 16) < 0.2));

  // --- Überlappung: die Fläche wird NICHT doppelt gezählt ----------------------
  const dup = buildFireZones([fixtureRow(50, 10, T), fixtureRow(50, 10, T + 60_000)]);
  add('zwei Detektionen am selben Ort ⇒ EINE Zone', dup.length === 1 && dup[0].pixels === 2);
  add('deckungsgleiche Pixel zählen die Fläche NICHT doppelt',
    dup.length === 1 && Math.abs(dup[0].areaHa - 16) < 0.2, dup[0] ? `${dup[0].areaHa} ha` : '—');
  add('die mittlere Pixelfläche bleibt 16 ha, auch wenn die Zone 16 ha hat',
    dup.length === 1 && Math.abs(dup[0].meanPixelHa - 16) < 0.2);

  // Halb versetzt: 1,5 Pixelbreiten ⇒ 1,5 × 16 = 24 ha.
  const dLatHalf = (0.4 / 2) / 110.574;
  const half = buildFireZones([fixtureRow(50, 10, T), fixtureRow(50 + dLatHalf, 10, T)]);
  add('halb überlappende Pixel ⇒ 24 ha (1,5 Pixel), nicht 32',
    half.length === 1 && Math.abs(half[0].areaHa - 24) < 0.3, half[0] ? `${half[0].areaHa} ha` : '—');

  // --- Die zwei Rechenwege müssen übereinstimmen ------------------------------
  const cluster = buildFireZones([
    fixtureRow(50, 10, T), fixtureRow(50 + dLatHalf, 10, T), fixtureRow(50 + 2 * dLatHalf, 10, T),
    fixtureRow(50 + 2 * dLatHalf, 10.004, T), fixtureRow(50, 10.004, T),
  ]);
  add('Zellsumme und Umriss-Shoelace liefern dieselbe Fläche (±1 %)', (() => {
    if (cluster.length !== 1) return false;
    const viaRings = polysAreaHa(cluster[0].polys, cluster[0].lat);
    return Math.abs(viaRings - cluster[0].areaHa) / cluster[0].areaHa < 0.01;
  })(), cluster[0] ? `Zellen ${cluster[0].areaHa} ha · Umriss ${round1(polysAreaHa(cluster[0].polys, cluster[0].lat))} ha` : '—');

  // --- Loch: ein Ring aus acht Pixeln um eine freie Mitte ---------------------
  // ⚠️ Der Längenschritt gehört zur **Zeile**, nicht zum Raster: `footprintRing`
  // rechnet die Pixelbreite aus der Breite der jeweiligen Zeile. Wird für alle
  // Zeilen derselbe Schritt genommen, klaffen in der südlichen Zeile Lücken (die
  // Pixel sind dort schmaler als ihr Abstand) — die Fixture zerfällt dann in zwei
  // Zonen, ohne dass am Code etwas falsch wäre.
  const step = 0.4 / 110.574;          // volle Pixelhöhe in Grad
  const lonStepAt = (lat: number) => 0.4 / (111.320 * Math.cos((lat * Math.PI) / 180));
  const ring8: FirmsRow[] = [];
  for (let dj = -1; dj <= 1; dj++) {
    const latRow = 50 + dj * step;
    const sLon = lonStepAt(latRow);
    for (let di = -1; di <= 1; di++) {
      if (di === 0 && dj === 0) continue;
      ring8.push(fixtureRow(latRow, 10 + di * sLon, T));
    }
  }
  const holed = buildFireZones(ring8);
  add('acht Pixel um eine Lücke ⇒ eine Zone mit einem Loch',
    holed.length === 1 && holed[0].polys.length === 1 && holed[0].polys[0].length === 2,
    holed[0] ? `${holed[0].polys[0].length} Ringe` : '—');
  add('das Loch wird NICHT als verbrannt mitgezählt (8 × 16 = 128 ha, nicht 144)',
    holed.length === 1 && Math.abs(holed[0].areaHa - 128) < 2, holed[0] ? `${holed[0].areaHa} ha` : '—');
  add('das Loch läuft im Uhrzeigersinn', signedArea(holed[0]?.polys[0][1] ?? []) < 0);
  add('ein Punkt im Loch liegt NICHT in der Zone', zoneAt(10, 50, holed) === null);
  add('ein Punkt auf einem Pixel liegt in der Zone', zoneAt(10 + lonStepAt(50), 50, holed) !== null);

  // --- Ehrlichkeit --------------------------------------------------------------
  const z = one[0];
  add('Beschriftung nennt Pixelzahl und Sensor',
    /Detektionsraster/.test(zoneAreaLabel(z)) && /1 Pixel/.test(zoneAreaLabel(z)) && /VIIRS/.test(zoneAreaLabel(z)),
    zoneAreaLabel(z));
  add('Beschriftung sagt NIE „Brandfläche"', !/Brandfläche/.test(zoneAreaLabel(z)));
  add('der Hinweis nennt die Pixelgröße und verweist auf EFFIS',
    /keine Brandfläche/.test(zoneAreaNote(z)) && /EFFIS/.test(zoneAreaNote(z)) && /16 ha/.test(zoneAreaNote(z)),
    zoneAreaNote(z));
  add('der Layer-Hinweis nennt Obergrenze, Pixelgröße und den EFFIS-Verzug',
    /Obergrenze/.test(ZONE_NOTE) && /14–20 ha/.test(ZONE_NOTE) && /1–2 Tage/.test(ZONE_NOTE));
  add('kein „bestätigt"/„verifiziert"-Vokabular im Rastertext',
    ![ZONE_NOTE, zoneAreaLabel(z), zoneAreaNote(z)].some((s) => /bestätigt|verifiziert|amtlich kartiert:/i.test(s)));

  // --- Keine erfundene Geometrie ----------------------------------------------
  add('ohne scan/track entsteht KEINE Zone',
    buildFireZones([{ ...fixtureRow(50, 10, T), scanKm: null }]).length === 0
    && buildFireZones([{ ...fixtureRow(50, 10, T), trackKm: null }]).length === 0);
  add('leere Eingabe ⇒ keine Zonen', buildFireZones([]).length === 0);
  add('Randpixel (scan 0,8) ist viermal so groß wie ein Nadirpixel (0,4)', (() => {
    const edge = buildFireZones([fixtureRow(50, 10, T, 0.8, 0.8)]);
    return edge.length === 1 && Math.abs(edge[0].areaHa - 64) < 0.5;
  })());

  // --- Reproduzierbarkeit -------------------------------------------------------
  const shuffled = [...ring8].reverse();
  add('umgekehrte Eingabereihenfolge ⇒ identische Fläche und Kennung', (() => {
    const a = buildFireZones(ring8); const b = buildFireZones(shuffled);
    return a.length === b.length && a[0].areaHa === b[0].areaHa && a[0].id === b[0].id;
  })());
  add('GeoJSON trägt Kennung, Fläche und Pixelzahl', (() => {
    const fc = zonesToGeoJSON(one);
    const p = fc.features[0]?.properties as { id?: string; ha?: number; px?: number } | undefined;
    return fc.features.length === 1 && !!p?.id && p.ha === one[0].areaHa && p.px === 1;
  })());
  add('zoneForDetection prüft auch die Zeit',
    zoneForDetection(10, 50, T, one) === one[0]
    && zoneForDetection(10, 50, T + 30 * 86_400_000, one) === null);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
