/**
 * Isotone Regression (Pool-Adjacent-Violators, PAV) — der Kalibrier-Arbeiter.
 *
 * Lernt eine MONOTON nicht-fallende Abbildung roh→kalibriert aus (x, y)-Paaren
 * (x = Roh-Score/Wahrscheinlichkeit, y = beobachtetes 0/1-Ergebnis bzw. Rate).
 * Genau das braucht eine ehrliche Wahrscheinlichkeit: „wenn das Modell 0,7
 * sagt, soll es zu 70 % eintreten". Anders als logistische Kalibrierung nimmt
 * PAV keine Funktionsform an — es folgt den Daten, bleibt aber monoton.
 *
 * Rein & headless prüfbar ({@link verifyIsotonic}).
 */

export interface IsotonicModel {
  /** Stützstellen (x aufsteigend). */
  xs: number[];
  /** Kalibrierte Werte je Stützstelle (monoton nicht-fallend). */
  ys: number[];
}

export interface IsoPoint { x: number; y: number; w?: number }

/**
 * Fittet die isotone Regression per PAV. Gibt eine kompakte, stückweise lineare
 * Kalibrierkurve zurück (aufeinanderfolgende gleiche Blöcke zusammengefasst).
 */
export function fitIsotonic(points: IsoPoint[]): IsotonicModel {
  const pts = points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .slice()
    .sort((a, b) => a.x - b.x);
  if (pts.length === 0) return { xs: [0, 1], ys: [0, 1] };

  // Blöcke: gewichteter Mittelwert + Spanne; benachbarte Verletzer poolen.
  interface Block { x: number; sumWY: number; sumW: number; val: number }
  const blocks: Block[] = [];
  for (const p of pts) {
    const w = p.w != null && p.w > 0 ? p.w : 1;
    let b: Block = { x: p.x, sumWY: w * p.y, sumW: w, val: p.y };
    // poolen, solange der vorige Block einen größeren Wert hat (Monotonie verletzt)
    while (blocks.length > 0 && blocks[blocks.length - 1].val > b.val) {
      const prev = blocks.pop()!;
      b = {
        x: prev.x, // linker Rand des gepoolten Blocks
        sumWY: prev.sumWY + b.sumWY,
        sumW: prev.sumW + b.sumW,
        val: (prev.sumWY + b.sumWY) / (prev.sumW + b.sumW),
      };
    }
    blocks.push(b);
  }

  // Stützstellen: linker Rand jedes Blocks → Blockwert. Für saubere Interpolation
  // zusätzlich den rechten Rand (letztes x) anhängen.
  const xs: number[] = [];
  const ys: number[] = [];
  for (const b of blocks) {
    xs.push(b.x);
    ys.push(clamp01OrPass(b.val));
  }
  const lastX = pts[pts.length - 1].x;
  if (xs[xs.length - 1] !== lastX) { xs.push(lastX); ys.push(ys[ys.length - 1]); }
  return { xs, ys };
}

function clamp01OrPass(v: number): number {
  // Wahrscheinlichkeiten in [0,1] halten; PAV wird i. d. R. mit 0/1-y genutzt.
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Wendet die Kalibrierkurve an (stückweise linear, an den Rändern geklemmt). */
export function applyIsotonic(model: IsotonicModel, x: number): number {
  const { xs, ys } = model;
  if (xs.length === 0) return x;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  // binäre Suche nach dem Intervall
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
  const x0 = xs[lo], x1 = xs[hi];
  if (x1 === x0) return ys[lo];
  const t = (x - x0) / (x1 - x0);
  return ys[lo] + (ys[hi] - ys[lo]) * t;
}

// ---------------------------------------------------------------------------
// Verify (headless)
// ---------------------------------------------------------------------------

export interface IsoCheck { name: string; ok: boolean; detail?: string }
export interface IsoVerifyResult { checks: IsoCheck[]; passed: number; failed: number }

export function verifyIsotonic(): IsoVerifyResult {
  const checks: IsoCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // 1) Output ist monoton nicht-fallend.
  {
    const m = fitIsotonic([
      { x: 0.1, y: 0 }, { x: 0.2, y: 1 }, { x: 0.3, y: 0 }, { x: 0.4, y: 1 }, { x: 0.5, y: 1 },
    ]);
    let mono = true;
    for (let i = 1; i < m.ys.length; i++) if (m.ys[i] < m.ys[i - 1] - 1e-9) mono = false;
    add('Ausgabe monoton nicht-fallend', mono, m.ys.map((y) => y.toFixed(2)).join(','));
  }

  // 2) Bereits monotone, lineare Daten ≈ Identität.
  {
    const pts: IsoPoint[] = [];
    for (let i = 0; i <= 10; i++) pts.push({ x: i / 10, y: i / 10 });
    const m = fitIsotonic(pts);
    const err = Math.max(
      Math.abs(applyIsotonic(m, 0.25) - 0.25),
      Math.abs(applyIsotonic(m, 0.75) - 0.75),
    );
    add('lineare Daten ≈ Identität', err < 0.06, `maxErr ${err.toFixed(3)}`);
  }

  // 3) Fallende Eingabe → konstanter (gepoolter) Mittelwert.
  {
    const m = fitIsotonic([{ x: 0, y: 1 }, { x: 1, y: 0 }]);
    add('fallend → konstanter Mittelwert 0,5', Math.abs(applyIsotonic(m, 0.5) - 0.5) < 1e-6, `${applyIsotonic(m, 0.5)}`);
  }

  // 4) Echte Kalibrierung: überzuversichtliche Prognosen werden zurückgezogen.
  //    Roh-Prognose p, aber wahre Trefferrate ~ p/2. Nach Iso soll predict(0,8)≈0,4.
  {
    const pts: IsoPoint[] = [];
    // generiere deterministisch: für jede Roh-Stufe p treffen ~p/2 der Fälle ein
    for (let s = 1; s <= 9; s++) {
      const p = s / 10;
      const hits = Math.round(p / 2 * 10);
      for (let k = 0; k < 10; k++) pts.push({ x: p, y: k < hits ? 1 : 0 });
    }
    const m = fitIsotonic(pts);
    const cal = applyIsotonic(m, 0.8);
    add('überzuversichtlich 0,8 → ~0,4', Math.abs(cal - 0.4) < 0.12, `${cal.toFixed(2)}`);
  }

  // 5) Klemmen an den Rändern.
  {
    const m = fitIsotonic([{ x: 0.2, y: 0 }, { x: 0.8, y: 1 }]);
    add('Klemmen außerhalb', applyIsotonic(m, -1) === m.ys[0] && applyIsotonic(m, 2) === m.ys[m.ys.length - 1]);
  }

  // 6) leere Eingabe → Identitäts-Fallback.
  {
    const m = fitIsotonic([]);
    add('leer → Identität', Math.abs(applyIsotonic(m, 0.3) - 0.3) < 1e-9);
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyIsotonic: typeof verifyIsotonic }).__verifyIsotonic = verifyIsotonic;
}
