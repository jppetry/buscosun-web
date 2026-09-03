/**
 * R3D · Szenen-Geometrie (pur, DOM-frei, headless prüfbar).
 *
 * Die 3D-Ansicht ist eine **axonometrische** Darstellung des Streckenschnitts:
 * eine Parallelprojektion, also eine affine Abbildung (Diagnose
 * `audit/route-3d.md` §2.1). Deshalb braucht sie keine Perspektivdivision,
 * keinen Tiefenpuffer und keinen Shader — drei Zahlen genügen:
 *
 *   x = padL + distM · scaleX + depth · depthX
 *   y = (h − padB) − (altM − floorM) · scaleY − depth · depthY
 *
 * `depth` ∈ [0,1] ist die Tiefe im Bild (0 = vorne, an der Strecke; 1 = hinten,
 * an der Rückwand). Weil die Abbildung affin ist, bleiben Parallelen parallel —
 * genau das zeigen die Vorlagen (`reference/1a-…`): die Wolkenbasis-Ebene ist
 * ein Parallelogramm, kein Trapez.
 *
 * **Überhöhung** ist hier keine Behauptung, sondern eine Rechnung: `scaleY` wird
 * als Vielfaches von `scaleX` gesetzt (Wunsch 1,8×) und auf die verfügbare Höhe
 * gedeckelt. Was tatsächlich wirksam ist, steht in `exaggeration` — die UI zeigt
 * diese Zahl, nicht die gewünschte.
 */

export interface Viewport {
  w: number;
  h: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  /** Bildversatz der Rückwand (depth = 1) in px. */
  depthX: number;
  depthY: number;
}

export interface Point2 { x: number; y: number }

export interface Projection {
  readonly vp: Viewport;
  /** Streckenlänge (m), auf die die Breite abgebildet wird. */
  readonly totalM: number;
  /** Untere und obere Kante der Höhenachse (m ü. NN). */
  readonly floorM: number;
  readonly topM: number;
  /** px je Meter. */
  readonly scaleX: number;
  readonly scaleY: number;
  /** Tatsächlich wirksame Überhöhung (`scaleY / scaleX`) — nie die gewünschte. */
  readonly exaggeration: number;
  /** Wurde die Wunsch-Überhöhung von der Zeichenfläche gedeckelt? */
  readonly clamped: boolean;
  project(distM: number, altM: number, depth?: number): Point2;
}

/** Vorgabe des Auftrags — Standard des Reglers. */
export const DEFAULT_EXAGGERATION = 1.8;
export const MIN_EXAGGERATION = 1;
export const MAX_EXAGGERATION = 6;

export function makeProjection(
  vp: Viewport,
  totalM: number,
  floorM: number,
  topM: number,
  wantExaggeration = DEFAULT_EXAGGERATION,
): Projection {
  const innerW = Math.max(1, vp.w - vp.padL - vp.padR - vp.depthX);
  const innerH = Math.max(1, vp.h - vp.padT - vp.padB - vp.depthY);
  const spanM = Math.max(1, topM - floorM);
  const scaleX = innerW / Math.max(1, totalM);
  const wanted = scaleX * clamp(wantExaggeration, MIN_EXAGGERATION, MAX_EXAGGERATION);
  const maxScaleY = innerH / spanM;
  const scaleY = Math.min(wanted, maxScaleY);
  const baseY = vp.h - vp.padB;
  return {
    vp,
    totalM,
    floorM,
    topM,
    scaleX,
    scaleY,
    exaggeration: scaleY / scaleX,
    clamped: wanted > maxScaleY,
    project(distM: number, altM: number, depth = 0): Point2 {
      return {
        x: vp.padL + distM * scaleX + depth * vp.depthX,
        y: baseY - (altM - floorM) * scaleY - depth * vp.depthY,
      };
    },
  };
}

/**
 * Höhenbereich der Szene: unten der tiefste Punkt (auf 100 m abgerundet, nie
 * unter 0), oben die höchste Aussage plus Luft (auf 250 m aufgerundet).
 * `extraM` nimmt Wolkenbasis, Schneefallgrenze und Warnzonen mit — sonst
 * lägen sie außerhalb des Bildes.
 */
export function heightRange(terrainM: number[], extraM: number[] = []): { floorM: number; topM: number } {
  const terr = terrainM.filter(Number.isFinite);
  const lo = terr.length ? Math.min(...terr) : 0;
  const hiTerr = terr.length ? Math.max(...terr) : 1000;
  const hiExtra = extraM.filter(Number.isFinite);
  const hi = Math.max(hiTerr, ...(hiExtra.length ? hiExtra : [hiTerr]));
  const floorM = Math.max(0, Math.floor((lo - 150) / 100) * 100);
  const topM = Math.max(floorM + 500, Math.ceil((hi + 250) / 250) * 250);
  return { floorM, topM };
}

/**
 * Beschriftete Höhenlinien in runden Schritten (500/1000 m je nach Spanne),
 * immer innerhalb des Bereichs. Die Vorlage zeigt 1000 und 2000.
 */
export function heightTicks(floorM: number, topM: number): number[] {
  const span = topM - floorM;
  const step = span > 3500 ? 1000 : span > 1600 ? 500 : span > 700 ? 250 : 100;
  const out: number[] = [];
  for (let m = Math.ceil((floorM + 1) / step) * step; m < topM; m += step) out.push(m);
  return out;
}

/**
 * Geländepolygon (vorne, depth = 0): Profil-Oberkante entlang der Strecke,
 * unten am Boden geschlossen. Das ist zugleich die Maske für die Verdeckung —
 * alles, was dahinter liegt (Wind, Regen, Wolken), wird am **Himmelspolygon**
 * beschnitten, statt über den Berg gemalt zu werden (`audit/route-3d.md` B5).
 */
export function terrainPath(p: Projection, cols: Array<{ distM: number; terrainM: number }>): string {
  if (cols.length < 2) return '';
  const baseY = p.vp.h - p.vp.padB;
  const parts: string[] = [];
  cols.forEach((c, i) => {
    const q = p.project(c.distM, c.terrainM);
    parts.push(`${i === 0 ? 'M' : 'L'}${r(q.x)},${r(q.y)}`);
  });
  const last = p.project(cols[cols.length - 1].distM, cols[cols.length - 1].terrainM);
  const first = p.project(cols[0].distM, cols[0].terrainM);
  parts.push(`L${r(last.x)},${r(baseY)}`, `L${r(first.x)},${r(baseY)}`, 'Z');
  return parts.join(' ');
}

/**
 * Himmelspolygon: alles ÜBER dem Gelände, bis zur Decke. Als `clipPath` sorgt es
 * dafür, dass Wandsegmente hinter einem Berg verschwinden — dieselbe Aussage,
 * die im 3D-Karten-Weg der Tiefentest liefern würde, hier exakt, weil Wand und
 * Profil in derselben Schnittebene liegen.
 */
export function skyPath(p: Projection, cols: Array<{ distM: number; terrainM: number }>): string {
  if (cols.length < 2) return '';
  const topY = p.project(0, p.topM).y;
  const parts: string[] = [];
  cols.forEach((c, i) => {
    const q = p.project(c.distM, c.terrainM);
    parts.push(`${i === 0 ? 'M' : 'L'}${r(q.x)},${r(q.y)}`);
  });
  const last = p.project(cols[cols.length - 1].distM, 0);
  const first = p.project(cols[0].distM, 0);
  parts.push(`L${r(last.x)},${r(topY)}`, `L${r(first.x)},${r(topY)}`, 'Z');
  return parts.join(' ');
}

/**
 * Die nach hinten versetzte Kappe des Geländestreifens — sie macht die
 * Axonometrie sichtbar, ohne Gelände zu behaupten, das wir nicht kennen: es ist
 * die **Extrusion desselben Profils**, nicht ein zweiter, erfundener Kamm.
 */
export function terrainCapPath(p: Projection, cols: Array<{ distM: number; terrainM: number }>): string {
  if (cols.length < 2) return '';
  const front = cols.map((c) => p.project(c.distM, c.terrainM, 0));
  const back = cols.map((c) => p.project(c.distM, c.terrainM, 1));
  const parts: string[] = [];
  front.forEach((q, i) => parts.push(`${i === 0 ? 'M' : 'L'}${r(q.x)},${r(q.y)}`));
  for (let i = back.length - 1; i >= 0; i--) parts.push(`L${r(back[i].x)},${r(back[i].y)}`);
  parts.push('Z');
  return parts.join(' ');
}

/** Parallelogramm einer waagerechten Höhenebene (Wolkenbasis, Schneefallgrenze). */
export function planePath(p: Projection, altM: number, fromM = 0, toM = p.totalM): string {
  const a = p.project(fromM, altM, 0);
  const b = p.project(toM, altM, 0);
  const c = p.project(toM, altM, 1);
  const d = p.project(fromM, altM, 1);
  return `M${r(a.x)},${r(a.y)} L${r(b.x)},${r(b.y)} L${r(c.x)},${r(c.y)} L${r(d.x)},${r(d.y)} Z`;
}

/**
 * Längste Spanne, in der eine waagerechte Ebene FREI über dem Gelände liegt.
 * Beschriftungen gehören dorthin — steht das Label über einem Berg, schneidet
 * die Verdeckungsmaske es weg (im Browser gemessen: „Wolkenbasis 1544 m" lag
 * hinter dem 2 234-m-Gipfel und war unsichtbar).
 * `null`, wenn die Ebene nirgends frei liegt.
 */
export function freeSpan(
  cols: Array<{ distM: number; terrainM: number }>,
  altM: number,
): { fromM: number; toM: number; midM: number } | null {
  let best: { fromM: number; toM: number } | null = null;
  let cur: { fromM: number; toM: number } | null = null;
  for (const c of cols) {
    if (c.terrainM < altM) {
      if (!cur) cur = { fromM: c.distM, toM: c.distM };
      else cur.toM = c.distM;
    } else if (cur) {
      if (!best || cur.toM - cur.fromM > best.toM - best.fromM) best = cur;
      cur = null;
    }
  }
  if (cur && (!best || cur.toM - cur.fromM > best.toM - best.fromM)) best = cur;
  return best ? { ...best, midM: (best.fromM + best.toM) / 2 } : null;
}

/** Rechteck in der vorderen Schnittebene (Windzelle, Warnzone, Regenfeld). */
export function cellPath(p: Projection, fromM: number, toM: number, loM: number, hiM: number): string {
  const a = p.project(fromM, loM);
  const b = p.project(toM, loM);
  const c = p.project(toM, hiM);
  const d = p.project(fromM, hiM);
  return `M${r(a.x)},${r(a.y)} L${r(b.x)},${r(b.y)} L${r(c.x)},${r(c.y)} L${r(d.x)},${r(d.y)} Z`;
}

/**
 * Ein gemessenes Geländeprofil NEBEN der Strecke, als Silhouette in der Tiefe.
 *
 * Das ist der Unterschied zu `terrainCapPath`: dort wird dasselbe Profil nach
 * hinten extrudiert (eine Zeichnung), hier steht abgetastetes Gelände (eine
 * Messung, `audit/route-3d.md` §19.3).
 */
export function reliefPath(
  p: Projection,
  nodes: Array<{ distM: number; terrainM: number }>,
  depth: number,
): string {
  if (nodes.length < 2) return '';
  const parts: string[] = [];
  nodes.forEach((n, i) => {
    const q = p.project(n.distM, n.terrainM, depth);
    parts.push(`${i === 0 ? 'M' : 'L'}${r(q.x)},${r(q.y)}`);
  });
  const last = p.project(nodes[nodes.length - 1].distM, p.floorM, depth);
  const first = p.project(nodes[0].distM, p.floorM, depth);
  parts.push(`L${r(last.x)},${r(last.y)}`, `L${r(first.x)},${r(first.y)}`, 'Z');
  return parts.join(' ');
}

/** Polyline entlang der Strecke auf Geländehöhe (das Routenband). */
export function ribbonPoints(p: Projection, cols: Array<{ distM: number; terrainM: number }>): Point2[] {
  return cols.map((c) => p.project(c.distM, c.terrainM));
}

/* ---------------------------------------------------------------------- */

export interface CardBox { x: number; y: number; w: number; h: number }

/**
 * Beschriftungskarten überlappungsfrei stapeln.
 *
 * Der Abstand zweier Punkte auf der Strecke sagt **nichts** darüber, ob ihre
 * Karten sich decken — das entscheidet die Kartenbreite in Pixeln (im Browser
 * gesehen: „02:15 · km 6,8" und „02:54 · km 8,1" lagen übereinander, obwohl sie
 * 1,3 km auseinander liegen). Deshalb wird hier in Bildkoordinaten geprüft und
 * die spätere Karte nach oben geschoben, bis sie frei steht.
 *
 * `x` ist die Mitte, `y` die Mitte. Die Reihenfolge bleibt erhalten — es wird
 * nichts vertauscht, nur gehoben; nach `maxSteps` bleibt die Karte stehen,
 * damit sie nicht aus dem Bild wandert.
 */
export function layoutCards(
  anchors: Array<{ x: number; y: number }>,
  opts: {
    w: number; h: number; lift: number; minY: number; stepY: number; maxSteps?: number;
    /**
     * Kaesten, die schon da sind und nicht verschoben werden koennen (etwa die
     * Beschriftung einer Hoehenebene). Sie werden gemieden, aber nicht
     * zurueckgegeben.
     */
    reserved?: CardBox[];
  },
): CardBox[] {
  const { w, h, lift, minY, stepY, maxSteps = 4, reserved = [] } = opts;
  const placed: CardBox[] = [...reserved];
  const out: CardBox[] = [];
  for (const a of anchors) {
    // Die Decke gilt VOR dem Vergleich: wer erst hinterher geklemmt wird, kann
    // genau auf der Karte landen, der er gerade ausgewichen ist.
    let y = Math.max(minY, a.y - lift);
    for (let step = 0; step < maxSteps; step++) {
      // Mittenabstand gegen die halbe Summe der Breiten — fuer gleich grosse
      // Kaesten ist das genau die alte Regel (w + 6).
      const hit = placed.some((b) => Math.abs(b.x - a.x) < (w + b.w) / 2 + 6 && Math.abs(b.y - y) < (h + b.h) / 2 + 4);
      if (!hit) break;
      const next = Math.max(minY, y - stepY);
      if (next === y) break; // an der Decke — höher geht es nicht
      y = next;
    }
    const box = { x: a.x, y, w, h };
    placed.push(box);
    out.push(box);
  }
  return out;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Auf 0,1 px runden — kürzere `d`-Attribute, kein sichtbarer Unterschied. */
function r(v: number): number {
  return Math.round(v * 10) / 10;
}
