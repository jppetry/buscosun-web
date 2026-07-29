/**
 * Rotationspotenzial (Feature F5) — reine, headless-testbare Fusion + Glättung
 * für den Experten-Kartenlayer „Rotation" (Superzellen-/rotierende-Aufwind-
 * Verdachtsflächen). Fusioniert je Gitterzelle ICON-D2-Konvektionsdiagnostik:
 *
 *   uh_max     (Updraft-Helicity 2–5 km, m²/s²)  → Kern-Rotation klassischer Superzellen
 *   uh_max_low (Updraft-Helicity 0–3 km, m²/s²)  → boden-/tornadonahe Rotation
 *   sdi_2      (Supercell Detection Index, DWD)    → Superzellen-Signatur (Korroboration)
 *
 * ⚠️ EHRLICHKEIT (audit/rotationspotenzial.md §0): Dies ist **Modell-VERDACHT**,
 * keine Warnung und kein Ereignis. UH-Felder sind extrem lokal/rauschig → das
 * Score-Grid wird über die Nachbarschaft **geglättet** (§0.3), damit ein einzelner
 * Pixel nie falsche Präzision suggeriert. Niemals „Tornado" — nur „Rotationspotenzial".
 *
 * ⚠️ KALIBRIERUNG (audit §8.2/§8.4): Der Live-Decode am 24.07.2026 zeigte, dass
 * ICON-D2-`uh_max` **einstellig** (m²/s²) liegt — ~100× KLEINER als in US-CP-Modellen
 * (HRRR/WRF) und als der ursprüngliche Spec-Vorschlag (25…250) annahm; `sdi_2` liegt
 * bei |·|<5e-4 an einem rotationsschwachen Tag. Die Rampen unten sind an der
 * **gemessenen ICON-D2-Skala** verankert, mit **großzügiger** (hoher) Aktivierungs-
 * schwelle (lieber Under- als Over-Paint, §0.4). Der obere Anker ist provisorisch
 * (kein echter Superzellen-Lauf zur Kalibrierung verfügbar) und gegen einen künftigen
 * Schwergewitter-Lauf nachziehbar — bewusst konservativ (Jans Freigabe 24.07.).
 *
 * Reine Funktionen (keine Fetches/kein GPU) → verify-rotation.mjs prüft sie headless.
 * `ramp` wird aus `convectiveIndex.ts` wiederverwendet (nur lesen).
 */

import { ramp } from './convectiveIndex';

export type RotationLevel = 'none' | 'low' | 'elevated' | 'marked' | 'high';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * |UH| (m²/s²) → 0..100. An der gemessenen ICON-D2-Skala (audit §8.4): unter
 * ~3 m²/s² gar nichts (Hintergrund/Orografie-Rauschen), ab ~5 zaghaft, ~20
 * „deutlich", ~40+ „hoch". Startwerte — gegen einen echten Superzellen-Lauf
 * nachziehbar.
 */
export function uhScore(uhAbs: number): number {
  return ramp(uhAbs, [[0, 0], [3, 0], [5, 15], [10, 45], [20, 75], [40, 95], [60, 100]]);
}

/**
 * |SDI2| → 0..100 (Superzellen-Signatur). ICON-D2-`sdi_2` ist betragsmäßig winzig
 * (audit §8.2: |max|<5e-4 am ruhigen Tag) → Rampe entsprechend fein. **Nur
 * Korroboration** (via `max()` in `rotationScore`) — hebt an, senkt nie; kann
 * mangels Magnitude realistisch nie allein die Aktivierungsschwelle reißen.
 */
export function sdiScore(sdiAbs: number): number {
  return ramp(sdiAbs, [[0, 0], [1e-4, 10], [5e-4, 35], [2e-3, 70], [1e-2, 100]]);
}

/** Score → Stufe (§3: gering/erhöht/deutlich/hoch). Schwellen = Rampen-Stützpunkte. */
export function levelOf(score: number): { level: RotationLevel; label: string } {
  if (score < 20) return { level: 'none', label: 'keine' };
  if (score < 40) return { level: 'low', label: 'gering' };
  if (score < 60) return { level: 'elevated', label: 'erhöht' };
  if (score < 80) return { level: 'marked', label: 'deutlich' };
  return { level: 'high', label: 'hoch' };
}

/**
 * Fusioniert eine Zelle zu 0..100. `uh_max`/`uh_max_low` sind vorzeichenbehaftet
 * (zyklonal +/antizyklonal −) → **|·|** (rotationsrichtungs-invariant). Genommen
 * wird die **stärkere** der beiden Schichten. SDI korroboriert/hebt an
 * (`max(uhS, 0.6·uhS + 0.4·sdiS)`, §3): der SDI-Term kann den Score nur erhöhen.
 *
 * `uh_max` ist der **Domänenanker**: ist es NaN (Bitmap-Maske außerhalb der
 * ICON-D2-Domäne), liefert die Funktion NaN → Aufrufer rendert transparent (nie 0).
 * Fehlt `uh_max_low`/`sdi_2` (Grid-Mismatch/Nichtverfügbarkeit), wird 0 übergeben.
 */
export function rotationScore(uhMax: number, uhLow: number, sdi2: number): number {
  if (!Number.isFinite(uhMax)) return NaN; // außerhalb Domäne → transparent
  const uh = Math.max(Math.abs(uhMax), Number.isFinite(uhLow) ? Math.abs(uhLow) : 0);
  const uhS = uhScore(uh);
  const sdiS = sdiScore(Number.isFinite(sdi2) ? Math.abs(sdi2) : 0);
  return clamp(Math.round(Math.max(uhS, 0.6 * uhS + 0.4 * sdiS)), 0, 100);
}

// ---------------------------------------------------------------------------
// Nachbarschafts-Glättung (§0.3) — NaN-erhaltend (Maske bleibt transparent).
// Zweistufig „Maximum → Mittel" (audit §8.4): ein 3×3-Maximum konsolidiert den
// Kern eines Rotations-Couplets, das nachgelagerte 5×5-Mittel DÄMPFT Einzelpixel
// (ein isolierter Hot-Pixel sinkt an seinem Ort deutlich unter den Rohwert →
// keine falsche Präzision). Beides überspringt NaN-Nachbarn; NaN-Zentrum → NaN.
// ---------------------------------------------------------------------------

function neighborhood(
  grid: Float32Array, w: number, h: number, r: number,
  reduce: (acc: number, v: number, n: number) => number, init: number, finalize: (acc: number, n: number) => number,
): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = grid[y * w + x];
      if (!Number.isFinite(c)) { out[y * w + x] = NaN; continue; } // Maske bleibt Maske
      let acc = init, n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const v = grid[yy * w + xx];
          if (Number.isFinite(v)) { acc = reduce(acc, v, n); n++; }
        }
      }
      out[y * w + x] = n > 0 ? finalize(acc, n) : c;
    }
  }
  return out;
}

/** NaN-erhaltendes gleitendes Maximum über (2r+1)². */
export function neighborhoodMax(grid: Float32Array, w: number, h: number, r: number): Float32Array {
  return neighborhood(grid, w, h, r, (acc, v) => (v > acc ? v : acc), -Infinity, (acc) => acc);
}

/** NaN-erhaltendes gleitendes Mittel über (2r+1)² (nur finite Nachbarn zählen). */
export function neighborhoodMean(grid: Float32Array, w: number, h: number, r: number): Float32Array {
  return neighborhood(grid, w, h, r, (acc, v) => acc + v, 0, (acc, n) => acc / n);
}

/**
 * Ehrliche Score-Glättung: 3×3-Maximum → 5×5-Mittel. Dämpft Einzelpixel-Rauschen
 * (§0.3), erhält breite/organisierte Rotationsflächen. NaN-erhaltend.
 */
export function smoothScores(scores: Float32Array, w: number, h: number): Float32Array {
  return neighborhoodMean(neighborhoodMax(scores, w, h, 1), w, h, 2);
}

// ---------------------------------------------------------------------------
// Verify (headless) — pure Fusions-/Glättungslogik
// ---------------------------------------------------------------------------

export interface RotCheck { name: string; ok: boolean; detail?: string }
export interface RotVerifyResult { checks: RotCheck[]; passed: number; failed: number }

export function verifyRotationPotential(): RotVerifyResult {
  const checks: RotCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // Ruhig / Hintergrund → keine (unter Aktivierungsschwelle).
  const calm = rotationScore(0.05, 0.03, 0);
  add('Ruhig (|UH|~0,05) → keine', levelOf(calm).level === 'none' && calm === 0, `${calm}`);

  // Schwache UH (Alpen-Hotspot ~8 heute) → gering, aber nicht hoch.
  const weak = rotationScore(8, 4, 0);
  add('Schwache UH (8) → gering (nicht hoch)', levelOf(weak).level === 'low', `${weak}`);

  // Hohe UH + SDI-Signatur → hoch.
  const strong = rotationScore(45, 30, 5e-3);
  add('Hohe UH (45) + SDI → hoch', levelOf(strong).level === 'high', `${strong}`);

  // SDI korroboriert: hebt einen mittleren UH-Score an, senkt nie.
  const noSdi = rotationScore(15, 10, 0);
  const withSdi = rotationScore(15, 10, 8e-3);
  add('SDI hebt an (korroboriert)', withSdi >= noSdi && withSdi > 0, `${noSdi}→${withSdi}`);

  // SDI „boost-only": realistisches |sdi_2| (5e-4) ohne UH reißt die Schwelle NICHT.
  const sdiOnly = rotationScore(0, 0, 5e-4);
  add('SDI allein (realistisch) < Aktivierung', levelOf(sdiOnly).level === 'none', `${sdiOnly}`);

  // Monoton in |UH| & geklemmt 0..100.
  const mono = rotationScore(5, 0, 0) <= rotationScore(20, 0, 0) && rotationScore(20, 0, 0) <= rotationScore(80, 0, 0);
  add('Monoton steigend in |UH|', mono, `${rotationScore(5,0,0)}≤${rotationScore(20,0,0)}≤${rotationScore(80,0,0)}`);
  const clamped = rotationScore(1e6, 1e6, 1e6);
  add('Extrem-Lage geklemmt ≤100', clamped === 100, `${clamped}`);

  // Vorzeichen-Invarianz: antizyklonal (−) == zyklonal (+).
  add('Vorzeichen-invariant (−UH == +UH)', rotationScore(-30, 0, 0) === rotationScore(30, 0, 0), `${rotationScore(-30,0,0)}`);

  // Domänenmaske: NaN-Anker → NaN (transparent, nicht 0).
  add('NaN-Anker → NaN (transparent)', Number.isNaN(rotationScore(NaN, 5, 1e-3)), `${rotationScore(NaN,5,1e-3)}`);

  // Glättung DÄMPFT einen Einzelpixel (§0.3): Hot-Pixel < Rohwert nach Glättung.
  const W = 9, H = 9;
  const g = new Float32Array(W * H).fill(0);
  const cIdx = 4 * W + 4;
  g[cIdx] = 100; // isolierter Hot-Pixel
  const sm = smoothScores(g, W, H);
  add('Glättung dämpft Einzelpixel (< Rohwert)', sm[cIdx] < 100 && sm[cIdx] > 0, `${sm[cIdx].toFixed(1)}`);

  // Glättung erhält eine BREITE Fläche (organisierte Rotation überlebt).
  const g2 = new Float32Array(W * H).fill(70);
  const sm2 = smoothScores(g2, W, H);
  add('Glättung erhält breite Fläche', Math.abs(sm2[cIdx] - 70) < 1e-3, `${sm2[cIdx].toFixed(1)}`);

  // Glättung ist NaN-erhaltend (Maske bleibt Maske).
  const g3 = new Float32Array(W * H).fill(50);
  g3[cIdx] = NaN;
  const sm3 = smoothScores(g3, W, H);
  add('Glättung erhält NaN-Maske', Number.isNaN(sm3[cIdx]), `${sm3[cIdx]}`);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyRotationPotential: typeof verifyRotationPotential }).__verifyRotationPotential = verifyRotationPotential;
}
