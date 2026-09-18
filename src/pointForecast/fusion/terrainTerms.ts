/**
 * terrainTerms.ts — PAP 5, die Terrain-Terme (Phase FI, AP5).
 *
 *   f_rad  := (1 − clct/100)^a · exp(−v10/v_ref)        der Wetterfaktor — vorne, er entscheidet
 *   f_rad < ε ⇒ ΔT_cap := 0, ΔT_uhi := 0                 (durchmischt)
 *   Muldenlage UND stabil ⇒ ΔT_cap := −A · g(TPI, SVF, Tiefe) · f_rad · f_saison · (1 − foehn_prob)
 *   ΔT_uhi := A_uhi(imperv, SVF) · f_rad · f_saison
 *   Wind: zweistufige Blending-Height-Korrektur über z0 und Verdrängungshöhe d
 *
 * ── Was hier heute wirkt, und was nicht ─────────────────────────────────────
 * Die Amplituden A und A_uhi werden laut `ABLAUFPLAENE.md` an Stationen GELERNT, nicht gesetzt;
 * `calib.json` führt beide als `null`. Also: **die Terme sind inaktiv** (ΔT = 0), die Geometrie
 * (f_rad, f_saison, g, die Wärmeinsel-Geometrie, der Föhn-Faktor) wird gerechnet und im
 * Ergebnis benannt — damit AP10 sie gegen das Archiv fitten kann und ein Verbraucher sieht, was
 * gefehlt hat. Ein Term mit einer erfundenen Amplitude wäre der teuerste Fehler dieses Produkts.
 *
 * Der Wind braucht z0 am Punkt (WorldCover) und z0 des Modells (ein GRIB-Feld, das der Cube
 * nicht trägt). Beides liegt heute NICHT im Bündel (V-FI-17) — die zweistufige Korrektur ist
 * als reine Funktion gebaut und geprüft (Wasser: kein +135 %), zur Laufzeit inaktiv, benannt.
 *
 * ── Setzungen, alle benannt ─────────────────────────────────────────────────
 *   a = 1, v_ref = 2,5 m/s, ε = 0,35·e⁻¹ ≈ 0,129 — aus den bestehenden Gates des Produkts
 *   (`terrainPhysics.ts`/`meteo.ts`: kein Kaltluftsee ab 65 % Bedeckung oder 2,5 m/s Wind):
 *   f_rad an genau diesen beiden Schwellen IST ε. `f_saison` = Jahresgang der Nachtlänge am
 *   Ort, 0 (kürzeste Nacht) … 1 (längste), E-F-4. z_b = 60 m Blending-Höhe. `g` und die
 *   UHI-Geometrie folgen den Gates des Motors (Tiefe/250 m, 0,7 + 0,3·SVF). AP10 kalibriert.
 *
 * Rein. Headless-prüfbar ({@link verifyTerrainTerms}).
 */

export const TERRAIN_SET = Object.freeze({
  /** Exponent von (1 − clct/100). */
  a: 1,
  /** Bezugswind in exp(−v10/v_ref), m/s — das bestehende Wind-Gate. */
  vRefMs: 2.5,
  /** Schwelle „durchmischt": f_rad an den beiden Gates (clct 65 %, v 2,5 m/s) = 0,35·e⁻¹. */
  epsilon: 0.35 * Math.exp(-1),
  /** Bezugstiefe der Mulde (m) — wie `coldPoolStrength` (250 m). */
  basinDepthRefM: 250,
  /** Blending-Höhe (m) für die zweistufige Windkorrektur. */
  zBlendM: 60,
  /** Referenzhöhe des Windes (m). */
  zRefM: 10,
});

export interface TerrainTermsInput {
  /** Gesamtbedeckung (%) und Wind (m/s) des Schritts — die Gates. */
  clct: number | null;
  windMs: number | null;
  /** Gelände am Punkt. */
  tpi500M: number | null;
  tpi2000M: number | null;
  svf: number | null;
  /** Senkentiefe (m, ≥ 0). */
  sinkDepthM: number | null;
  /** Versiegelung (%) aus `urban`. */
  impervPct: number | null;
  /** Föhn-Score 0…1 (`foehnDetector`), `null` = nicht bewertet. */
  foehnScore: number | null;
  /** Jahresgang: Breite und Zeitpunkt für f_saison. */
  lat: number;
  atMs: number;
  /** Amplituden aus `calib.json` — heute `null` ⇒ Terme inaktiv. */
  A: number | null;
  Auhi: number | null;
  /** Regionale TPI-Streuung für das Gate „TPI < −1σ" — heute `null` ⇒ Gate nicht entscheidbar. */
  tpiSigmaM: number | null;
  /** AP13: gemessene f_rad-Parameter (calib.json `fRad.*`, `measured`); fehlende behalten `TERRAIN_SET`. */
  fRadParams?: { a?: number; vRefMs?: number; epsilon?: number };
}

export interface TerrainTermsResult {
  fRad: number | null;
  /** f_rad < ε: durchmischt, Terme wären null. */
  mixed: boolean | null;
  fSaison: number;
  /** Geometrie des Kaltluftsees g(TPI, SVF, Tiefe) in 0…1 — ohne Amplitude. */
  gCap: number | null;
  /** Muldenlage laut Gate (TPI < −1σ); `null` = σ unbekannt (tpiSigma null). */
  basin: boolean | null;
  /** Geometrie der Wärmeinsel (imperv/100 · (0,7 + 0,3·SVF)) in 0…1 — ohne Amplitude. */
  gUhi: number | null;
  foehnFactor: number;
  /** Die Terme in K — `null`, solange die Amplitude fehlt (NICHT 0: 0 hieße „gerechnet, null"). */
  dTcapK: number | null;
  dTuhiK: number | null;
  flags: Array<'terrainTermsInactive' | 'tpiSigmaUnknown' | 'windBlendingInactive'>;
}

/** Tageslänge (h) nach Sonnendeklination — der Jahresgang, aus dem f_saison kommt. */
export function dayLengthH(latDeg: number, doy: number): number {
  const decl = 23.44 * Math.sin((2 * Math.PI * (284 + doy)) / 365) * (Math.PI / 180);
  const phi = (latDeg * Math.PI) / 180;
  const x = -Math.tan(phi) * Math.tan(decl);
  if (x <= -1) return 24;
  if (x >= 1) return 0;
  return (24 / Math.PI) * Math.acos(x);
}

/** f_saison ∈ 0…1: 0 in der kürzesten, 1 in der längsten Nacht des Jahres am Ort (E-F-4, `set`). */
export function fSaisonOf(latDeg: number, atMs: number): number {
  const d = new Date(atMs);
  const doy = Math.floor((atMs - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
  const night = 24 - dayLengthH(latDeg, doy);
  const nightMin = 24 - dayLengthH(latDeg, 172);   // ~21. Juni
  const nightMax = 24 - dayLengthH(latDeg, 355);   // ~21. Dezember
  if (nightMax - nightMin < 1e-6) return 0.5;
  return Math.max(0, Math.min(1, (night - nightMin) / (nightMax - nightMin)));
}

export function fRadOf(clct: number | null, windMs: number | null, p: { a?: number; vRefMs?: number } = {}): number | null {
  if (clct == null || windMs == null || !Number.isFinite(clct) || !Number.isFinite(windMs)) return null;
  const clear = Math.max(0, Math.min(1, 1 - clct / 100));
  return Math.pow(clear, p.a ?? TERRAIN_SET.a) * Math.exp(-Math.max(0, windMs) / (p.vRefMs ?? TERRAIN_SET.vRefMs));
}

export function terrainTerms(inp: TerrainTermsInput): TerrainTermsResult {
  const flags: TerrainTermsResult['flags'] = [];
  const fRad = fRadOf(inp.clct, inp.windMs, inp.fRadParams);
  const mixed = fRad == null ? null : fRad < (inp.fRadParams?.epsilon ?? TERRAIN_SET.epsilon);
  const fSaison = fSaisonOf(inp.lat, inp.atMs);
  const svf = inp.svf ?? 1;
  const depth = Math.max(0, inp.sinkDepthM ?? 0);
  const tpi = inp.tpi2000M ?? inp.tpi500M ?? null;
  let basin: boolean | null = null;
  if (inp.tpiSigmaM != null && inp.tpiSigmaM > 0 && tpi != null) basin = tpi < -inp.tpiSigmaM;
  else flags.push('tpiSigmaUnknown');
  // g: Tiefe der Mulde (bis 250 m) mal Strahlungsfaktor (0,7 + 0,3·SVF) — die Gates des Motors.
  const gCap = tpi == null && inp.sinkDepthM == null ? null
    : Math.min(1, depth / TERRAIN_SET.basinDepthRefM) * (0.7 + 0.3 * Math.max(0, Math.min(1, svf)));
  const gUhi = inp.impervPct == null ? null : Math.max(0, Math.min(1, inp.impervPct / 100)) * (0.7 + 0.3 * Math.max(0, Math.min(1, svf)));
  const foehnFactor = 1 - Math.max(0, Math.min(1, inp.foehnScore ?? 0));
  let dTcapK: number | null = null;
  let dTuhiK: number | null = null;
  if (inp.A != null && fRad != null && gCap != null && basin != null) {
    dTcapK = mixed || !basin ? 0 : -inp.A * gCap * fRad * fSaison * foehnFactor;
  }
  if (inp.Auhi != null && fRad != null && gUhi != null) {
    dTuhiK = mixed ? 0 : inp.Auhi * gUhi * fRad * fSaison;
  }
  if (dTcapK == null || dTuhiK == null) flags.push('terrainTermsInactive');
  return { fRad, mixed, fSaison, gCap, basin, gUhi, foehnFactor, dTcapK, dTuhiK, flags };
}

/**
 * Zweistufige Blending-Height-Korrektur des 10-m-Winds (PAP 5 O7):
 *   Stufe 1  vom Modell-Boden (z0_mod, d_mod) hinauf zur Blending-Höhe z_b (Modellprofil),
 *   Stufe 2  von z_b hinunter auf 10 m über dem ECHTEN Boden (z0_true, d_true).
 * Rückgabe: der Faktor v_Punkt / v_Modell. `null`, wenn eine Rauhigkeit fehlt — nie 1 als Ersatz.
 */
export function windBlendingFactor(z0Mod: number | null, z0True: number | null, d0Mod = 0, d0True = 0, zBlendM: number = TERRAIN_SET.zBlendM): number | null {
  if (z0Mod == null || z0True == null || !(z0Mod > 0) || !(z0True > 0)) return null;
  // AP13: z_b gemessen (calib.json `zBlend`) oder die Setzung.
  const zb = zBlendM, zr = TERRAIN_SET.zRefM;
  const up = Math.log((zb - d0Mod) / z0Mod) / Math.log((zr - d0Mod) / z0Mod);
  const dTrue = Math.min(d0True, zr - 5 * z0True);     // die Verdrängung darf die Referenzhöhe nicht schlucken
  const down = Math.log((zr - dTrue) / z0True) / Math.log((zb - dTrue) / z0True);
  const f = up * down;
  return Number.isFinite(f) && f > 0 ? f : null;
}

// ---------------------------------------------------------------------------
// Verifikation
// ---------------------------------------------------------------------------

export interface TtCheck { name: string; ok: boolean; detail?: string }

export function verifyTerrainTerms(): { checks: TtCheck[]; passed: number; failed: number } {
  const checks: TtCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const near = (a: number | null, b: number, tol: number) => a != null && Math.abs(a - b) <= tol;
  const jan = Date.UTC(2026, 0, 15, 2), jul = Date.UTC(2026, 6, 15, 2);

  // f_rad: klar und windstill ⇒ 1; an den Gates ⇒ ε; bedeckt ⇒ 0.
  add('f_rad = 1 bei klar und windstill, ε an den Gates (65 %, 2,5 m/s), 0 bei bedeckt',
    near(fRadOf(0, 0), 1, 1e-12) && near(fRadOf(65, 2.5), TERRAIN_SET.epsilon, 1e-12) && fRadOf(100, 0) === 0);
  add('f_rad fällt monoton mit Bedeckung und Wind', (fRadOf(20, 1) as number) > (fRadOf(50, 1) as number) && (fRadOf(20, 1) as number) > (fRadOf(20, 4) as number));
  add('f_rad ohne Bedeckung oder Wind ⇒ null (nichts erfinden)', fRadOf(null, 1) === null && fRadOf(20, null) === null);

  // f_saison: 0 im Juni, 1 im Dezember, dazwischen monoton — Jahresgang der Nachtlänge.
  const fJun = fSaisonOf(48, Date.UTC(2026, 5, 21)), fDec = fSaisonOf(48, Date.UTC(2026, 11, 21)), fSep = fSaisonOf(48, Date.UTC(2026, 8, 16));
  add('f_saison: 0 zur kürzesten, 1 zur längsten Nacht, Mitte September ≈ 0,4…0,6', near(fJun, 0, 1e-6) && near(fDec, 1, 1e-6) && fSep > 0.4 && fSep < 0.6, `${fJun.toFixed(3)} / ${fSep.toFixed(3)} / ${fDec.toFixed(3)}`);
  add('Tageslänge: 48° N am 21.06. ≈ 15,9 h, am 21.12. ≈ 8,4 h', near(dayLengthH(48, 172), 15.9, 0.3) && near(dayLengthH(48, 355), 8.4, 0.3));

  // Inaktiv ohne Amplituden: die Terme sind null (nicht 0), die Geometrie steht da.
  const basinIn: TerrainTermsInput = { clct: 10, windMs: 0.5, tpi500M: -60, tpi2000M: -200, svf: 0.7, sinkDepthM: 200, impervPct: 5, foehnScore: 0, lat: 47, atMs: jan, A: null, Auhi: null, tpiSigmaM: null };
  const r0 = terrainTerms(basinIn);
  add('ohne A/A_uhi: ΔT_cap und ΔT_uhi sind null (inaktiv, benannt), f_rad und g stehen da',
    r0.dTcapK === null && r0.dTuhiK === null && r0.flags.includes('terrainTermsInactive') && r0.flags.includes('tpiSigmaUnknown') && r0.fRad != null && r0.fRad > 0.7 && near(r0.gCap, 0.8 * (0.7 + 0.3 * 0.7), 1e-12),
    `f_rad ${r0.fRad?.toFixed(3)} g ${r0.gCap?.toFixed(3)}`);
  // Mit Amplituden (nur im Test): Mulde/Kamm, Stadt/Land, Föhn, durchmischt.
  const withA = { ...basinIn, A: 3, Auhi: 2, tpiSigmaM: 100 };
  const hollow = terrainTerms(withA);
  const ridge = terrainTerms({ ...withA, tpi2000M: 300, sinkDepthM: 0 });
  add('Mulde (TPI −200 < −σ) ⇒ ΔT_cap < 0; Kamm ⇒ 0', (hollow.dTcapK as number) < -0.5 && hollow.basin === true && ridge.dTcapK === 0 && ridge.basin === false, `${hollow.dTcapK?.toFixed(3)} / ${ridge.dTcapK}`);
  const city = terrainTerms({ ...withA, impervPct: 80, svf: 0.6 });
  const country = terrainTerms({ ...withA, impervPct: 2 });
  add('Stadt (imperv 80 %) ⇒ ΔT_uhi deutlich > Land (2 %)', (city.dTuhiK as number) > 5 * (country.dTuhiK as number) && (city.dTuhiK as number) > 0);
  add('Föhn (Score 1) räumt den Kaltluftsee aus: ΔT_cap = 0', terrainTerms({ ...withA, foehnScore: 1 }).dTcapK === 0);
  const mixedR = terrainTerms({ ...withA, clct: 90, windMs: 6 });
  add('durchmischt (bedeckt, windig): f_rad < ε ⇒ beide Terme 0', mixedR.mixed === true && mixedR.dTcapK === 0 && mixedR.dTuhiK === 0);
  add('Sommer schwächer als Winter (f_saison)', Math.abs(terrainTerms({ ...withA, atMs: jul }).dTcapK as number) < Math.abs(hollow.dTcapK as number));
  // Negativkontrolle: dieselbe Mulde ohne A ⇒ null, nicht der Winterwert.
  add('Negativkontrolle: ohne A bleibt derselbe Fall null — keine stille Amplitude', terrainTerms({ ...withA, A: null }).dTcapK === null);

  // Wind: die einstufige Formel gäbe über Wasser +86 % — zweistufig sind es ≈ +12 %; Wald dämpft.
  const water = windBlendingFactor(0.03, 0.0002);
  const oneStage = Math.log(10 / 0.0002) / Math.log(10 / 0.03);
  add('Wasser: zweistufig ≈ +12 % statt einstufig +86 % — kein Wind aus dem Nichts', water != null && water > 1.05 && water < 1.2 && oneStage > 1.8, `${water?.toFixed(3)} gegen ${oneStage.toFixed(2)}`);
  const forest = windBlendingFactor(0.03, 0.75);
  add('Wald (z0 0,75 m) über Grasmodell (0,03): Faktor < 1', forest != null && forest < 0.8 && forest > 0.3, `${forest?.toFixed(3)}`);
  add('gleiche Rauhigkeit ⇒ Faktor 1', near(windBlendingFactor(0.03, 0.03), 1, 1e-12));
  add('Verdrängungshöhe (Stadt d0 9 m, z0 1 m) drückt den 10-m-Wind weiter', (windBlendingFactor(0.03, 1.0, 0, 9) as number) < (windBlendingFactor(0.03, 1.0) as number));
  add('fehlende Rauhigkeit ⇒ null, nie 1', windBlendingFactor(null, 0.03) === null && windBlendingFactor(0.03, null) === null && windBlendingFactor(0, 0.03) === null);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}
