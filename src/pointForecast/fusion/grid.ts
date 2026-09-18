/**
 * grid.ts — PAP 3, Gitter → Punkt (Phase FI, AP3).
 *
 * „Bilineare Interpolation würde im Gebirge einen Gipfelwert ins Tal ziehen, weil sie nur
 * die Entfernung kennt." (`ABLAUFPLAENE.md`) Das Gewicht eines Nachbarpunkts fällt hier mit
 * der horizontalen Distanz UND mit der Höhendifferenz zwischen seiner Modellhöhe und der
 * echten Höhe des Punkts:
 *
 *     w_g = exp(−(d_g/L_d)²) · exp(−(Δh_g/L_h)²) · κ_g,   Δh_g = |h_mod(g) − h_true|
 *
 * ── Entscheidungen, alle benannt ────────────────────────────────────────────
 *   N ≤ 4      die Zellen des 2×2-Blocks, der den Punkt umschließt (v1, im eigenen Chunk;
 *              Halo ist E-F-2 „nein"); fehlt eine Zelle am Chunk-Rand, ist N < 4 und das
 *              Ergebnis trägt `truncated` (Plan §3.3: ≈ 12–13 % der Punkte).
 *   κ = 1      Voreinstellung: keine Landnutzungs-Ähnlichkeit je Zelle — markiert. AP16 (E-F-16): trägt eine
 *              Zelle `kappa` (aus der Landbedeckung, `point/client/landCover.ts`), gilt ihr Wert; ohne Feld
 *              derselbe Ausdruck wie vorher (byte-gleich).
 *   L_d        Zellweite der Stufe in Metern (N–S), Setzung; AP10 kalibriert.
 *   L_h        200 m, Setzung — Präzedenz `spatialWeight` (H_REF) des Live-Pfads; AP10 kalibriert.
 *   Gemittelt  Mittel, σ_div, σ_ens, Quantile, hModEff (PAP 3 O5). NICHT gemittelt: die
 *              Profilfelder (PD-B5: das Mittel zweier Inversionsobergrenzen ist keine —
 *              sie kommen aus der NÄCHSTEN Zelle) und die Zählwerte srcCount/ensCount.
 *   Fehlende   ein Nachbar ohne Wert in einer Ebene fällt für DIESE Ebene heraus, die
 *              Gewichte werden über die belegten neu normiert; hat keiner einen Wert, `null`.
 *
 * Rein. Headless-prüfbar ({@link verifyGrid}).
 */

import { blockOffsets } from '../../point/cubeFormat';

/** Gesetzt, nicht gemessen: die Längenskalen (Plan §4, AP3). */
export const GRID_SET = Object.freeze({
  /** L_h in Metern. */
  lhM: 200,
  /** κ — Landnutzungs-Ähnlichkeit; 1 = keine Information je Zelle. */
  kappa: 1,
  /** Zellweite N–S je Grad Breite (m). L_d = deg · M_PER_DEG. */
  mPerDeg: 110_574,
});

/** Ebenen, die NICHT gemittelt werden (aus der nächsten Zelle). */
export const GRID_NEAREST_ONLY: ReadonlySet<string> = new Set(['gammaEff', 'zBase', 'zInv', 'dTInv', 'srcCount', 'ensCount']);

export interface GridCell {
  /** Versatz zur nächsten Zelle in Zellen (0/0 = die nächste Zelle selbst). */
  dy: number;
  dx: number;
  /** Abstand des Zellmittelpunkts zum Punkt (m). */
  distM: number;
  /** Modellhöhe der Zelle (m ü. NN); `null` ⇒ die Zelle fällt aus der Höhengewichtung heraus (nur Distanz). */
  hModEffM: number | null;
  values: Record<string, number | null>;
  /** AP16: Landnutzungs-Ähnlichkeit dieser Zelle zum Punkt (0…1); fehlt ⇒ `GridInput.kappa`. */
  kappa?: number;
}

export interface GridWeight { dy: number; dx: number; w: number; distM: number; dhM: number | null; kappa?: number }

export interface GridResult {
  /** Die gewichteten Werte je Ebene (Profil/Zählwerte: nächste Zelle). */
  values: Record<string, number | null>;
  /** Effektive Modellhöhe des gemittelten Werts — das gewichtete Mittel der Zellhöhen (PAP 3 O5). */
  hModEffM: number | null;
  weights: GridWeight[];
  /** Zahl der beteiligten Zellen (1…4). */
  n: number;
  /** Weniger als vier Zellen, weil der 2×2-Block über den Chunk-Rand ragt. */
  truncated: boolean;
}

/**
 * Welche Zellen den 2×2-Block bilden — AP14: die Regel steht in `cubeFormat.ts` (Geometrie des Cube-Gitters), damit
 * der Leser, der Nachbar-Chunks holt, und PAP 3 dieselbe Funktion fragen. Hier weiter exportiert (Bestand).
 */
export { blockOffsets };

export interface GridInput {
  /** Die nächste Zelle (dy = dx = 0) und ihre verfügbaren Nachbarn. */
  cells: GridCell[];
  /** Die Zellen des 2×2-Blocks, die es geben SOLLTE (`blockOffsets`). */
  block: Array<{ dy: number; dx: number }>;
  hTrue: number;
  /** L_d in Metern. */
  ldM: number;
  lhM?: number;
  kappa?: number;
}

export function gridToPoint(inp: GridInput): GridResult {
  const lh = inp.lhM ?? GRID_SET.lhM;
  const kappa = inp.kappa ?? GRID_SET.kappa;
  const nearest = inp.cells.find((c) => c.dy === 0 && c.dx === 0);
  if (!nearest) throw new Error('grid: die nächste Zelle (dy = dx = 0) fehlt');
  const chosen: GridCell[] = [];
  for (const b of inp.block) {
    const c = inp.cells.find((x) => x.dy === b.dy && x.dx === b.dx);
    if (c) chosen.push(c);
  }
  const truncated = chosen.length < inp.block.length;

  const weights: GridWeight[] = chosen.map((c) => {
    const dh = c.hModEffM == null ? null : Math.abs(c.hModEffM - inp.hTrue);
    const wd = Math.exp(-((c.distM / inp.ldM) ** 2));
    const wh = dh == null ? 1 : Math.exp(-((dh / lh) ** 2));
    return c.kappa === undefined
      ? { dy: c.dy, dx: c.dx, w: wd * wh * kappa, distM: c.distM, dhM: dh }
      : { dy: c.dy, dx: c.dx, w: wd * wh * c.kappa, distM: c.distM, dhM: dh, kappa: c.kappa };
  });
  // Normieren — und gegen den Unterlauf: liegen ALLE Zellen viele L_h über oder unter dem Punkt
  // (Zermatt: 900 m), sind alle Gewichte ~e^(−20); relativ bleiben sie sinnvoll, absolut nicht.
  let sum = weights.reduce((a, x) => a + x.w, 0);
  if (!(sum > 0) || !Number.isFinite(sum)) {
    for (const x of weights) x.w = x.dy === 0 && x.dx === 0 ? 1 : 0;
    sum = 1;
  }
  for (const x of weights) x.w /= sum;

  const ids = new Set<string>();
  for (const c of chosen) for (const k of Object.keys(c.values)) ids.add(k);
  const values: Record<string, number | null> = {};
  for (const id of ids) {
    if (GRID_NEAREST_ONLY.has(id)) { values[id] = nearest.values[id] ?? null; continue; }
    let acc = 0, wsum = 0;
    for (let i = 0; i < chosen.length; i++) {
      const v = chosen[i].values[id];
      if (v == null || !Number.isFinite(v)) continue;
      acc += weights[i].w * v; wsum += weights[i].w;
    }
    values[id] = wsum > 0 ? acc / wsum : null;
  }
  let hAcc = 0, hW = 0;
  for (let i = 0; i < chosen.length; i++) {
    const h = chosen[i].hModEffM;
    if (h == null) continue;
    hAcc += weights[i].w * h; hW += weights[i].w;
  }
  return { values, hModEffM: hW > 0 ? hAcc / hW : nearest.hModEffM, weights, n: chosen.length, truncated };
}

// ---------------------------------------------------------------------------
// Verifikation
// ---------------------------------------------------------------------------

export interface GridCheck { name: string; ok: boolean; detail?: string }

export function verifyGrid(): { checks: GridCheck[]; passed: number; failed: number } {
  const checks: GridCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const near = (a: number | null, b: number, tol: number) => a != null && Math.abs(a - b) <= tol;
  const ld = 0.05 * GRID_SET.mPerDeg;   // t1
  const cell = (dy: number, dx: number, distM: number, h: number | null, t: number, extra: Record<string, number | null> = {}): GridCell =>
    ({ dy, dx, distM, hModEffM: h, values: { t2m: t, t2m_sd: 1, gammaEff: 6.5 + dy, srcCount: 5 + dx, ...extra } });

  // N = 1: exakt die Zelle.
  const one = gridToPoint({ cells: [cell(0, 0, 1000, 500, 10)], block: [{ dy: 0, dx: 0 }], hTrue: 500, ldM: ld });
  add('N = 1 ⇒ exakt die Zellwerte, Gewicht 1, nicht beschnitten', one.values.t2m === 10 && one.weights[0].w === 1 && one.n === 1 && !one.truncated && one.hModEffM === 500);

  // Vier gleich weit entfernte Zellen gleicher Höhe ⇒ gleiche Gewichte, Mittel.
  const four = [cell(0, 0, 2000, 500, 10), cell(1, 0, 2000, 500, 12), cell(0, 1, 2000, 500, 14), cell(1, 1, 2000, 500, 16)];
  const block4 = blockOffsets(0.01, 0.01);
  const r4 = gridToPoint({ cells: four, block: block4, hTrue: 500, ldM: ld });
  add('vier gleiche Zellen ⇒ Gewichte ¼, Mittel 13, hModEff 500', r4.n === 4 && r4.weights.every((w) => near(w.w, 0.25, 1e-12)) && near(r4.values.t2m, 13, 1e-12) && r4.hModEffM === 500);
  add('Gewichte summieren zu 1', near(r4.weights.reduce((a, w) => a + w.w, 0), 1, 1e-12));

  // Höhe zählt: eine Zelle 600 m über dem Punkt (3 L_h) fällt praktisch heraus — der Gipfel zieht nicht ins Tal.
  const alps = [cell(0, 0, 2000, 500, 10), cell(1, 0, 2000, 1100, 25), cell(0, 1, 2000, 520, 11), cell(1, 1, 2000, 480, 9)];
  const rA = gridToPoint({ cells: alps, block: block4, hTrue: 500, ldM: ld });
  const wPeak = rA.weights.find((w) => w.dy === 1 && w.dx === 0)!.w;
  add('Höhendifferenz gewichtet ab: die 600 m höhere Zelle trägt < 0,1 %, das Mittel bleibt nahe 10 (nicht 13,75)', wPeak < 1e-3 && near(rA.values.t2m, 10, 0.6), `w_peak ${wPeak.toExponential(2)}, T ${rA.values.t2m?.toFixed(3)}`);
  // Negativkontrolle: mit L_h → ∞ (nur Distanz) wäre der Gipfel voll dabei — das ist die bilineare Falle.
  const rBil = gridToPoint({ cells: alps, block: block4, hTrue: 500, ldM: ld, lhM: 1e9 });
  add('Negativkontrolle: ohne Höhenterm (L_h → ∞) zieht der Gipfelwert das Mittel um > 3 K nach oben', (rBil.values.t2m as number) - (rA.values.t2m as number) > 3, `${rBil.values.t2m?.toFixed(2)} gegen ${rA.values.t2m?.toFixed(2)}`);

  // Distanz zählt: die nähere Zelle wiegt mehr.
  const dist = [cell(0, 0, 1000, 500, 10), cell(1, 0, 5000, 500, 20)];
  const rD = gridToPoint({ cells: dist, block: [{ dy: 0, dx: 0 }, { dy: 1, dx: 0 }], hTrue: 500, ldM: ld });
  add('die nähere Zelle wiegt mehr (1 km gegen 5 km bei L_d 5,5 km)', rD.weights[0].w > rD.weights[1].w && (rD.values.t2m as number) < 15);

  // Chunk-Rand: der Block verlangt vier, es gibt zwei ⇒ N = 2, truncated.
  const rT = gridToPoint({ cells: [cell(0, 0, 2000, 500, 10), cell(0, 1, 2000, 500, 12)], block: block4, hTrue: 500, ldM: ld });
  add('Chunk-Rand: zwei von vier Zellen ⇒ N = 2 und `truncated`', rT.n === 2 && rT.truncated && near(rT.values.t2m, 11, 1e-12));

  // Profil und Zählwerte kommen aus der NÄCHSTEN Zelle, nie gemittelt.
  add('Profilfelder und Zählwerte: nächste Zelle, nie gemittelt (gammaEff 6,5, srcCount 5 — nicht 7/6)', rA.values.gammaEff === 6.5 && rA.values.srcCount === 5 && near(rA.values.t2m_sd, 1, 1e-12));

  // Fehlende Werte: ein Nachbar ohne t2m fällt für t2m heraus, die anderen normieren neu; hModEff mittelt weiter.
  const miss = [cell(0, 0, 2000, 500, 10), cell(1, 0, 2000, 500, null as unknown as number), cell(0, 1, 2000, 500, 14), cell(1, 1, 2000, 500, 16)];
  miss[1].values.t2m = null;
  const rM = gridToPoint({ cells: miss, block: block4, hTrue: 500, ldM: ld });
  add('fehlender Wert einer Zelle: die drei übrigen tragen (Mittel 40/3), keine Null-Verfälschung', near(rM.values.t2m, 40 / 3, 1e-9), `${rM.values.t2m}`);
  add('alle Zellen ohne Wert ⇒ null', gridToPoint({ cells: [{ dy: 0, dx: 0, distM: 100, hModEffM: 500, values: { x: null } }], block: [{ dy: 0, dx: 0 }], hTrue: 500, ldM: ld }).values.x === null);

  // Unterlauf: alle Zellen 900 m über dem Punkt (Zermatt) — Gewichte relativ sinnvoll, Summe 1.
  const deep = [cell(0, 0, 2000, 1400, 5), cell(1, 0, 2000, 1450, 4), cell(0, 1, 2000, 1380, 6), cell(1, 1, 2000, 1500, 3)];
  const rZ = gridToPoint({ cells: deep, block: block4, hTrue: 500, ldM: ld });
  add('alle Zellen 900 m höher: Gewichte bleiben endlich und summieren zu 1, die niedrigste Zelle wiegt am meisten',
    rZ.weights.every((w) => Number.isFinite(w.w)) && near(rZ.weights.reduce((a, w) => a + w.w, 0), 1, 1e-9) && rZ.weights.find((w) => w.dx === 1 && w.dy === 0)!.w > rZ.weights[0].w);

  // AP16: κ je Zelle — halbiert eine Zelle ihr κ, halbiert sich ihr relatives Gewicht; gleiches κ überall kürzt sich.
  const fourK = four.map((c, i) => ({ ...c, kappa: i === 1 ? 0.5 : 1 }));
  const rK = gridToPoint({ cells: fourK, block: block4, hTrue: 500, ldM: ld });
  const wOf = (r: GridResult, dy: number, dx: number) => r.weights.find((w) => w.dy === dy && w.dx === dx)!.w;
  add('AP16: κ je Zelle — Zelle (1,0) mit κ ½ trägt halb so viel wie jede andere (1/7 statt 2/7), κ steht am Gewicht',
    near(wOf(rK, 1, 0), 1 / 7, 1e-12) && near(wOf(rK, 0, 0), 2 / 7, 1e-12) && rK.weights.find((w) => w.dy === 1)!.kappa === 0.5 && r4.weights.every((w) => w.kappa === undefined));
  const rK2 = gridToPoint({ cells: four.map((c) => ({ ...c, kappa: 0.3 })), block: block4, hTrue: 500, ldM: ld });
  add('AP16: gleiches κ in allen Zellen kürzt sich in der Normierung (Werte wie ohne κ, ≤ 1e-12)',
    near(rK2.values.t2m, r4.values.t2m as number, 1e-12) && rK2.weights.every((w, i) => near(w.w, r4.weights[i].w, 1e-12)));

  // blockOffsets: Vorzeichen und Achsen.
  add('blockOffsets: Punkt nordöstlich der Mitte ⇒ (0,0),(1,0),(0,1),(1,1); südwestlich ⇒ −1; exakt auf der Mitte ⇒ nur (0,0)',
    JSON.stringify(blockOffsets(0.01, 0.01)) === JSON.stringify([{ dy: 0, dx: 0 }, { dy: 1, dx: 0 }, { dy: 0, dx: 1 }, { dy: 1, dx: 1 }])
    && JSON.stringify(blockOffsets(-0.01, -0.02)) === JSON.stringify([{ dy: 0, dx: 0 }, { dy: -1, dx: 0 }, { dy: 0, dx: -1 }, { dy: -1, dx: -1 }])
    && blockOffsets(0, 0).length === 1 && blockOffsets(0, 0.01).length === 2);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}
