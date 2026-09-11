/**
 * profile.mjs — der Rechenweg vom Vertikalprofil zu den vier Profilfeldern
 * (`audit/punktdaten-versorgung.md` §40, Etappe PD-B5).
 *
 * Aus `t` auf Modellleveln und den Halbflächenhöhen `hhl` entstehen die vier Felder,
 * die PAP 4 für seine Fallunterscheidung braucht und die bis heute in KEINER Zelle
 * belegt waren (§33.3):
 *
 *   gammaEff  K/km   Γ = −∂T/∂z über der bodennahen Schicht
 *   zBase     m NN   Untergrenze der untersten Inversion
 *   zInv      m NN   Obergrenze derselben Inversion
 *   dTInv     K      Temperaturzunahme von zBase bis zInv (positiv)
 *
 * ── Vorzeichen ────────────────────────────────────────────────────────────────
 * `ABLAUFPLAENE.md` legt am Ende von PAP 4 verbindlich fest: **Γ = −∂T/∂z**.
 * Normale Schichtung ⇒ Γ > 0, Inversion ⇒ Γ < 0. Diese Datei rechnet in genau
 * dieser Konvention, und der Selbsttest prüft beide Vorzeichen einzeln — ein
 * gedrehtes Vorzeichen wäre der Fehler, den niemand am Wertebereich sieht.
 *
 * ── „keine Inversion" hat einen Ausdruck, kein Loch ───────────────────────────
 * `cubeFormat.ts` sagt es beim Feld `zInv` ausdrücklich: **`zInv == zBase` heißt
 * KEINE Inversion**. Das ist eine Aussage und deshalb ein Wert. Fehlt dagegen das
 * Profil selbst (Quelle liefert nicht, Zelle außerhalb der Domäne), bleibt alles
 * `NaN` ⇒ `MISSING`. Die beiden Fälle werden nie vermischt — sonst läse PAP 4
 * „durchmischt", wo in Wahrheit „unbekannt" steht.
 *
 * ── Zwei Schwellen, und beide sind Kalibrierparameter, keine Konstanten ───────
 * `dzMin` (Feld 37 der Bedarfsliste) ist die Inversions-Mindestmächtigkeit,
 * `gammaDepthM` die Tiefe, über die Γ bestimmt wird. Beide stehen bis heute als
 * `null` in `calib.json` (§33.3, Zeile 30–39). Sie werden hier als **benannte
 * Startwerte** geführt und ins Manifest geschrieben — nicht im Code versteckt,
 * damit ein späteres gemessenes Σ sie ersetzen kann, ohne dass jemand sucht.
 */

/**
 * Startwerte der beiden Schwellen. Ausdrücklich `startwert`, nicht `wert`:
 * gemessen werden sie erst aus `buscosun-archiv` (PD6 / E-14).
 */
export const PROFILE_PARAMS = Object.freeze({
  /** Tiefe über Grund, über die `gammaEff` per Ausgleichsgerade bestimmt wird. */
  gammaDepthM: 500,
  /**
   * Mindestmächtigkeit einer Inversion. Dünner als das ist eine numerische
   * Kräuselung des Profils, keine Schicht, in der PAP 4 Fall B rechnen sollte.
   */
  dzMinM: 50,
  /**
   * Mindesthub. Eine Inversion von 0,05 K über 60 m ist messbar, aber für die
   * Höhenkorrektur bedeutungslos — und sie verdrängte die Fallunterscheidung
   * aus Fall A heraus, ohne etwas zu verbessern.
   */
  dTMinK: 0.2,
});

/**
 * Ein Profil auswerten.
 *
 * @param {Float64Array|number[]} t  Temperatur je Vollfläche, **von unten nach oben**
 * @param {Float64Array|number[]} z  Höhe derselben Vollflächen über NN, aufsteigend
 * @param {object} [p]               Schwellen, s. PROFILE_PARAMS
 * @returns {{gammaEff:number,zBase:number,zInv:number,dTInv:number}} in K/km, m, m, K
 *          — alle vier `NaN`, wenn das Profil zu kurz ist, um etwas auszusagen.
 */
export function profileFromColumn(t, z, p = PROFILE_PARAMS) {
  const n = Math.min(t.length, z.length);
  if (n < 3) return { gammaEff: NaN, zBase: NaN, zInv: NaN, dTInv: NaN };
  for (let k = 0; k < n; k++) if (!Number.isFinite(t[k]) || !Number.isFinite(z[k])) {
    return { gammaEff: NaN, zBase: NaN, zInv: NaN, dTInv: NaN };
  }

  // --- gammaEff: Ausgleichsgerade über der bodennahen Schicht -----------------
  // Nicht die Differenz der beiden äußersten Level: ein einzelner Ausreißer im
  // untersten Level (Bodeninversion von wenigen Metern) kippte damit die
  // Steigung über die ganze Schicht.
  const zTop = z[0] + p.gammaDepthM;
  let sz = 0, st = 0, szz = 0, szt = 0, m = 0;
  for (let k = 0; k < n && (z[k] <= zTop || m < 2); k++) {
    sz += z[k]; st += t[k]; szz += z[k] * z[k]; szt += z[k] * t[k]; m++;
  }
  const den = m * szz - sz * sz;
  // `−` weil Γ = −∂T/∂z; `· 1000` weil z in Metern und Γ in K/km geführt wird.
  const gammaEff = den === 0 ? NaN : -((m * szt - sz * st) / den) * 1000;

  // --- Die unterste Inversion suchen -----------------------------------------
  // Von unten nach oben, weil PAP 4 nach der Schicht fragt, in der der PUNKT
  // liegen könnte — eine Absinkinversion in 3 km Höhe beantwortet die Frage
  // „liegt Zermatt im Inversionskörper?" nicht.
  let zBase = z[0], zInv = z[0], dTInv = 0;
  for (let k = 0; k < n - 1; k++) {
    if (t[k + 1] <= t[k]) continue;               // keine Zunahme mit der Höhe
    let e = k + 1;
    while (e < n - 1 && t[e + 1] > t[e]) e++;     // solange sie anhält
    const dz = z[e] - z[k];
    const dT = t[e] - t[k];
    if (dz >= p.dzMinM && dT >= p.dTMinK) { zBase = z[k]; zInv = z[e]; dTInv = dT; break; }
    k = e - 1;                                    // zu dünn ⇒ über sie hinweg weitersuchen
  }

  return { gammaEff, zBase, zInv, dTInv };
}

/**
 * Dieselbe Rechnung für ein ganzes Stufengitter.
 *
 * @param {Float32Array[]} levels  je Vollfläche ein Gitter, **von unten nach oben**
 * @param {Float32Array[]} heights je Vollfläche die Höhe über NN, gleiche Reihenfolge
 * @param {number} cells
 * @returns {{gammaEff:Float32Array,zBase:Float32Array,zInv:Float32Array,dTInv:Float32Array}}
 */
export function profileGrid(levels, heights, cells, p = PROFILE_PARAMS) {
  const out = {
    gammaEff: new Float32Array(cells).fill(NaN),
    zBase: new Float32Array(cells).fill(NaN),
    zInv: new Float32Array(cells).fill(NaN),
    dTInv: new Float32Array(cells).fill(NaN),
  };
  const nl = Math.min(levels.length, heights.length);
  if (nl < 3) return out;
  const t = new Float64Array(nl);
  const z = new Float64Array(nl);
  for (let i = 0; i < cells; i++) {
    for (let k = 0; k < nl; k++) { t[k] = levels[k][i]; z[k] = heights[k][i]; }
    const r = profileFromColumn(t, z, p);
    out.gammaEff[i] = r.gammaEff;
    out.zBase[i] = r.zBase;
    out.zInv[i] = r.zInv;
    out.dTInv[i] = r.dTInv;
  }
  return out;
}

/**
 * Vollflächenhöhen aus den Halbflächen: die Mitte zweier benachbarter `hhl`.
 * `hhl` kommt von oben nach unten (Level 1 = Modelloberkante); erwartet wird hier
 * die Liste **so, wie sie geholt wurde**, also absteigende Levelnummer = aufsteigende
 * Höhe. Die Umkehrung passiert beim Holen, nicht hier.
 */
export function fullLevelHeights(halfLevels, cells) {
  const out = [];
  for (let k = 0; k + 1 < halfLevels.length; k++) {
    const a = halfLevels[k], b = halfLevels[k + 1], mid = new Float32Array(cells);
    for (let i = 0; i < cells; i++) mid[i] = (a[i] + b[i]) / 2;
    out.push(mid);
  }
  return out;
}

/** Netzfreier Selbsttest — synthetische Profile mit bekanntem Ergebnis. */
export function profileSelfTest() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  const near = (a, b, eps) => Number.isFinite(a) && Math.abs(a - b) <= eps;

  const z = [100, 150, 220, 310, 420, 550, 700, 880, 1090, 1330];

  // (1) Trockenadiabatisch: 9,8 K/km, keine Inversion.
  {
    const t = z.map((h) => 15 - 0.0098 * (h - 100));
    const r = profileFromColumn(t, z);
    add('adiabatisch: gammaEff ≈ +9,8 K/km', near(r.gammaEff, 9.8, 0.05), `${r.gammaEff.toFixed(3)}`);
    add('adiabatisch: keine Inversion (zInv == zBase)', r.zInv === r.zBase, `${r.zBase} / ${r.zInv}`);
    add('adiabatisch: dTInv = 0', r.dTInv === 0);
  }

  // (2) Bodeninversion 100→420 m, +4 K, darüber normal.
  {
    const t = z.map((h) => (h <= 420 ? 0 + 4 * (h - 100) / 320 : 4 - 0.0065 * (h - 420)));
    const r = profileFromColumn(t, z);
    add('Inversion: zBase = 100 m', r.zBase === 100, `${r.zBase}`);
    add('Inversion: zInv = 420 m', r.zInv === 420, `${r.zInv}`);
    add('Inversion: dTInv ≈ +4 K', near(r.dTInv, 4, 1e-6), `${r.dTInv}`);
    add('Inversion: gammaEff NEGATIV (Γ = −∂T/∂z)', r.gammaEff < 0, `${r.gammaEff.toFixed(2)} K/km`);
  }

  // (3) Gehobene Inversion 550→880 m: die untere Schicht ist normal, die Suche
  //     muss trotzdem die Schicht finden — und zwar die UNTERSTE, nicht irgendeine.
  {
    const t = z.map((h) => (h < 550 ? 15 - 0.0098 * (h - 100)
      : h <= 880 ? 15 - 0.0098 * 450 + 3 * (h - 550) / 330
        : 15 - 0.0098 * 450 + 3 - 0.0065 * (h - 880)));
    const r = profileFromColumn(t, z);
    add('gehobene Inversion: zBase = 550 m', r.zBase === 550, `${r.zBase}`);
    add('gehobene Inversion: zInv = 880 m', r.zInv === 880, `${r.zInv}`);
    add('gehobene Inversion: gammaEff POSITIV (untere Schicht normal)', r.gammaEff > 0,
      `${r.gammaEff.toFixed(2)} K/km`);
  }

  // (4) Zu dünne Kräuselung darf KEINE Inversion auslösen — sonst verlöre PAP 4
  //     Fall A an ein numerisches Artefakt.
  {
    const zz = [100, 120, 145, 175, 210, 250, 300, 360, 430, 510];
    const t = zz.map((h, k) => 10 - 0.0065 * (h - 100) + (k === 3 ? 0.03 : 0));
    const r = profileFromColumn(t, zz);
    add('Kräuselung unter dzMin/dTMin ⇒ keine Inversion', r.zInv === r.zBase,
      `${r.zBase} / ${r.zInv}, dT ${r.dTInv}`);
  }

  // (5) Zwei Inversionen übereinander: gemeldet wird die UNTERE.
  {
    const zz = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900];
    const t = [0, 3, 3, 2, 1, 0, 4, 4, 3, 2];
    const r = profileFromColumn(t, zz);
    add('zwei Inversionen: die untere gewinnt', r.zBase === 0 && r.zInv === 100,
      `${r.zBase} → ${r.zInv}`);
  }

  // (6) Lücke im Profil ⇒ alles NaN, nie 0.
  {
    const t = z.map(() => 5); t[4] = NaN;
    const r = profileFromColumn(t, z);
    add('Loch im Profil ⇒ NaN, nicht 0',
      Number.isNaN(r.gammaEff) && Number.isNaN(r.zBase) && Number.isNaN(r.dTInv));
  }

  // (7) Isotherm: Γ = 0, und das ist KEINE Inversion.
  {
    const t = z.map(() => 5);
    const r = profileFromColumn(t, z);
    add('isotherm: gammaEff = 0', near(r.gammaEff, 0, 1e-9), `${r.gammaEff}`);
    add('isotherm: keine Inversion', r.zInv === r.zBase);
  }

  // (8) Gitterweg = Spaltenweg, an denselben Zahlen.
  {
    const cells = 3;
    const t = z.map((h) => (h <= 420 ? 0 + 4 * (h - 100) / 320 : 4 - 0.0065 * (h - 420)));
    const levels = t.map((v) => Float32Array.from({ length: cells }, () => v));
    const heights = z.map((v) => Float32Array.from({ length: cells }, () => v));
    const g = profileGrid(levels, heights, cells);
    const s = profileFromColumn(t, z);
    add('Gitter reproduziert die Spalte',
      near(g.gammaEff[1], s.gammaEff, 1e-3) && g.zBase[1] === s.zBase && g.zInv[1] === s.zInv,
      `${g.gammaEff[1].toFixed(3)} / ${s.gammaEff.toFixed(3)}`);
  }

  // (9) Halbflächen → Vollflächen: n Halbflächen geben n−1 Mitten.
  {
    const cells = 2;
    const half = [0, 20, 55, 100].map((v) => Float32Array.from({ length: cells }, () => v));
    const full = fullLevelHeights(half, cells);
    add('Vollflächen: n−1 Mitten', full.length === 3, `${full.length}`);
    add('Vollflächen: Mitte zweier Halbflächen', full[0][0] === 10 && full[1][0] === 37.5,
      `${full[0][0]} / ${full[1][0]}`);
  }

  // (10) Die Schwellen sind benannt und als Startwerte kenntlich.
  add('Schwellen deklariert', PROFILE_PARAMS.dzMinM > 0 && PROFILE_PARAMS.gammaDepthM > 0
    && Object.isFrozen(PROFILE_PARAMS));

  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}
