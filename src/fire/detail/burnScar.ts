/**
 * SAT3d — die zusammenhängende Narbe an den Detektionen (`audit/brandradar-satellitenbilder.md`
 * §13.2 (5)). Pur und DOM-frei.
 *
 * Eingabe ist das **Klassenraster** einer dNBR-Sicht (0 = kein Signal/maskiert, 1–4 = Klasse aus
 * `DNBR_CLASSES`, Bit 7 = halbdeckend, wie `dnbrTileRgba` es nebenher füllt) und eine Saat aus
 * Pixeln unter den Detektions-Rechtecken. Der Flood-Fill (4er-Nachbarschaft) nimmt alles mit,
 * was ab `minClass` zusammenhängt — aber NUR volldeckende Pixel: Wolke/Schatten (SCL) und
 * gedämpfte Landbedeckung (Acker/Siedlung) bleiben in der Anzeige blasser stehen, verbinden aber
 * keine Narbe. Am Neutrebbin-Fall (02.09., ~99 % Wolken) hätte ein Fill durch die Wolkenpixel
 * 14 563 ha „Narbe" gemeldet. Das Ergebnis ist eine Pixelzahl und der Umriss als Kantensegmente;
 * Hektar rechnet der Aufrufer mit der Schrittweite seiner Ebene, weil die Zahl ohne ihre
 * Auflösung nicht ehrlich ist.
 *
 * Jans Entscheidung 2026-09-05: NUR die Fläche, die die Detektionen berührt — Ernte-Sprenkel
 * anderswo bleiben bloße dNBR-Farbe ohne Umriss.
 */

import { CLS_UNSURE_FLAG } from './burnIndex';

/** Klasse ab der die Narbe zusammenhängt: 2 = dNBR ≥ 0,27 (USGS „moderate-low" und darüber). */
export const SCAR_MIN_CLASS = 2;

/** Volldeckend UND ab der Schwelle — ein Pixel mit Halbdeckungs-Flag ist nie Narbe. */
function isScar(v: number, minClass: number): boolean {
  return v < CLS_UNSURE_FLAG && v >= minClass;
}

export interface ScarResult {
  /** Pixel der Narbe. */
  count: number;
  /** Umriss: x0,y0,x1,y1,… in Rasterkoordinaten (Pixelkanten, nicht -mitten). */
  edges: number[];
  /** Die Narbe berührt den Rasterrand — sie reicht wahrscheinlich über den Ausschnitt hinaus. */
  touchesEdge: boolean;
  /** Wie viele Saatpixel tatsächlich Narbenklasse hatten (0 ⇒ keine Narbe an den Detektionen). */
  seeded: number;
}

/**
 * Saat aus achsparallelen Rechtecken (Rasterkoordinaten, Kanten einschließlich) — geklemmt an
 * das Raster, Duplikate sind unschädlich (der Fill besucht jedes Pixel einmal).
 */
export function seedsFromRects(
  rects: readonly { x0: number; y0: number; x1: number; y1: number }[], w: number, h: number,
): number[] {
  const out: number[] = [];
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(Math.min(r.x0, r.x1)));
    const x1 = Math.min(w - 1, Math.floor(Math.max(r.x0, r.x1)));
    const y0 = Math.max(0, Math.floor(Math.min(r.y0, r.y1)));
    const y1 = Math.min(h - 1, Math.floor(Math.max(r.y0, r.y1)));
    if (x1 < x0 || y1 < y0) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(y * w + x);
  }
  return out;
}

export function floodScar(
  cls: Uint8Array, w: number, h: number, seeds: Iterable<number>, minClass: number = SCAR_MIN_CLASS,
): ScarResult {
  const n = w * h;
  const inScar = new Uint8Array(n);
  const stack: number[] = [];
  let seeded = 0;
  for (const s of seeds) {
    if (s < 0 || s >= n || inScar[s]) continue;
    if (isScar(cls[s], minClass)) { inScar[s] = 1; stack.push(s); seeded++; }
  }
  let count = 0;
  let touchesEdge = false;
  while (stack.length) {
    const i = stack.pop() as number;
    count++;
    const x = i % w;
    const y = (i - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true;
    if (x > 0) { const j = i - 1; if (!inScar[j] && isScar(cls[j], minClass)) { inScar[j] = 1; stack.push(j); } }
    if (x < w - 1) { const j = i + 1; if (!inScar[j] && isScar(cls[j], minClass)) { inScar[j] = 1; stack.push(j); } }
    if (y > 0) { const j = i - w; if (!inScar[j] && isScar(cls[j], minClass)) { inScar[j] = 1; stack.push(j); } }
    if (y < h - 1) { const j = i + w; if (!inScar[j] && isScar(cls[j], minClass)) { inScar[j] = 1; stack.push(j); } }
  }
  // Umriss: jede Pixelkante, hinter der kein Narbenpixel liegt. Waagerechte Kanten werden je
  // Zeile zu Läufen zusammengefasst, senkrechte je Spalte — sonst zeichnet eine 1 000-ha-Narbe
  // zehntausende Einzelsegmente.
  const edges: number[] = [];
  if (count > 0) {
    for (let y = 0; y < h; y++) {
      let runTop = -1, runBot = -1;
      for (let x = 0; x <= w; x++) {
        const here = x < w && inScar[y * w + x] === 1;
        const top = here && (y === 0 || inScar[(y - 1) * w + x] === 0);
        const bot = here && (y === h - 1 || inScar[(y + 1) * w + x] === 0);
        if (top && runTop < 0) runTop = x;
        if (!top && runTop >= 0) { edges.push(runTop, y, x, y); runTop = -1; }
        if (bot && runBot < 0) runBot = x;
        if (!bot && runBot >= 0) { edges.push(runBot, y + 1, x, y + 1); runBot = -1; }
      }
    }
    for (let x = 0; x < w; x++) {
      let runL = -1, runR = -1;
      for (let y = 0; y <= h; y++) {
        const here = y < h && inScar[y * w + x] === 1;
        const left = here && (x === 0 || inScar[y * w + x - 1] === 0);
        const right = here && (x === w - 1 || inScar[y * w + x + 1] === 0);
        if (left && runL < 0) runL = y;
        if (!left && runL >= 0) { edges.push(x, runL, x, y); runL = -1; }
        if (right && runR < 0) runR = y;
        if (!right && runR >= 0) { edges.push(x + 1, runR, x + 1, y); runR = -1; }
      }
    }
  }
  return { count, edges, touchesEdge, seeded };
}

/** Pixelzahl × Schrittweite² in Hektar. */
export function scarHa(count: number, stepM: number): number {
  return (count * stepM * stepM) / 10_000;
}

// --- Selbstverifikation --------------------------------------------------------------------------

export interface ScarCheck { name: string; ok: boolean; detail?: string }

export function verifyBurnScar(): { checks: ScarCheck[]; passed: number; total: number } {
  const checks: ScarCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // 6×5-Raster: ein 2×2-Block Klasse 3 an (1,1)-(2,2), diagonal dazu ein Klasse-2-Pixel an (3,3),
  // ein Klasse-1-Pixel an (0,0) (unter der Kante), rechts ein getrennter Block an (4,1)-(5,2) am Rand.
  const w = 6, h = 5;
  const g = new Uint8Array(w * h);
  const set = (x: number, y: number, v: number) => { g[y * w + x] = v; };
  set(0, 0, 1);
  set(1, 1, 3); set(2, 1, 3); set(1, 2, 3); set(2, 2, 3);
  set(3, 3, 2);
  set(4, 1, 4); set(5, 1, 4); set(4, 2, 4); set(5, 2, 4);

  const a = floodScar(g, w, h, [1 * w + 1]);
  add('Saat im Block ⇒ genau der 2×2-Block (4 Pixel), Diagonale zählt NICHT (4er-Nachbarschaft)', a.count === 4 && a.seeded === 1);
  add('Umriss des 2×2-Blocks: 4 Läufe (oben/unten/links/rechts), je 2 Pixel lang',
    a.edges.length === 16 && a.edges.join(',') === '1,1,3,1,1,3,3,3,1,1,1,3,3,1,3,3');
  add('Block liegt nicht am Rand ⇒ touchesEdge false', a.touchesEdge === false);
  add('Saat auf Klasse 1 (unter 0,27) ⇒ keine Narbe, seeded 0', (() => {
    const b = floodScar(g, w, h, [0]);
    return b.count === 0 && b.seeded === 0 && b.edges.length === 0 && !b.touchesEdge;
  })());
  add('Saat am rechten Block ⇒ 4 Pixel, berührt den Rand (x = w−1)', (() => {
    const b = floodScar(g, w, h, [2 * w + 5]);
    return b.count === 4 && b.touchesEdge === true;
  })());
  add('Zwei Saaten in getrennten Blöcken ⇒ beide Flächen, keine Doppelzählung', (() => {
    const b = floodScar(g, w, h, [1 * w + 1, 2 * w + 2, 2 * w + 5]);
    return b.count === 8 && b.seeded === 3;
  })());
  add('minClass 1 nimmt auch das Klasse-1-Pixel', floodScar(g, w, h, [0], 1).count === 1);
  add('halbdeckende Pixel (Flag) sind weder Saat noch Durchgang — Wolken verbinden keine Narbe', (() => {
    const c = new Uint8Array([3 | CLS_UNSURE_FLAG, 3 | CLS_UNSURE_FLAG, 3, 0, 0, 0]);
    return floodScar(c, 3, 2, [0]).seeded === 0 && floodScar(c, 3, 2, [2]).count === 1;
  })());
  add('Saat außerhalb des Rasters wird ignoriert, kein Absturz', floodScar(g, w, h, [-1, 999]).count === 0);
  add('seedsFromRects: Rechteck (0,5..2,4 × 0,5..1,2) ⇒ Pixel (0..2)×(0..1), an das Raster geklemmt',
    seedsFromRects([{ x0: 0.5, y0: 0.5, x1: 2.4, y1: 1.2 }], w, h).join(',') === '0,1,2,6,7,8'
    && seedsFromRects([{ x0: -3, y0: -3, x1: -1, y1: -1 }], w, h).length === 0
    && seedsFromRects([{ x0: 5.2, y0: 4.9, x1: 9, y1: 9 }], w, h).join(',') === '29');
  add('seedsFromRects: verdrehte Ecken (x1 < x0) werden normalisiert',
    seedsFromRects([{ x0: 2.4, y0: 1.2, x1: 0.5, y1: 0.5 }], w, h).join(',') === '0,1,2,6,7,8');
  add('scarHa: 25 Pixel bei 20 m = 1 ha', scarHa(25, 20) === 1);
  // Größenordnung: ein 900²-Raster (18-km-Ausschnitt auf 20 m) ganz gefüllt — 810 000 Pixel.
  //
  // Hier steht BEWUSST keine Millisekunden-Schranke: ein Leistungsanker misst immer auch die
  // Maschine mit (Lehre der Satelliten-Linie), und eine 200-ms-Grenze fiel unter Parallellast
  // durch, ohne dass sich am Code etwas geändert hatte. Geprüft wird, was der Verifier belegen
  // KANN: der Fill terminiert auf voller Größe, zählt jedes Pixel genau einmal, und der Stack
  // läuft nicht über (die rekursive Fassung täte das bei 810 000 Pixeln). Die Laufzeit selbst
  // steht als Messung im Audit (§13.4 (3): 24–59 ms, voll gefüllt 78 ms).
  add('900² voll gefüllt: terminiert, zählt jedes Pixel genau einmal, kein Stack-Überlauf', (() => {
    const W = 900, big = new Uint8Array(W * W).fill(3);
    const r = floodScar(big, W, W, [0]);
    return r.count === W * W && r.seeded === 1 && r.touchesEdge;
  })());

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
