/**
 * Waldbrand DACH — Abspiel-Modell (pur, DOM-frei, headless verifizierbar nach D-12).
 *
 * ── Warum das nicht das Regenradar-Modell ist ────────────────────────────────
 * `nowcast/NowcastRadarMap.tsx:269-279` ist das vorgeschriebene rAF-Muster, und
 * die **Schleife** wird auch genauso gebaut. Die **Schrittlogik** ist aber eine
 * andere: Das Regenradar bewegt eine Float-Position über Frames, die als
 * Werte-Arrays im Speicher liegen — ein Framewechsel kostet nichts. Waldbrand
 * bewegt sich über **ganze Tage**, und jeder Tageswechsel zieht ~20 Kacheln
 * von einem **fremden** Server (`audit/waldbrand-zeit.md` §1).
 *
 * Daraus folgen drei Festlegungen, die hier — nicht in der Komponente — stehen:
 *
 * 1. **Ganzzahlige Tage.** Zwischenwerte gäbe es beim EU-Index gar nicht; eine
 *    Float-Position würde Zwischenzustände suggerieren, die keine Entsprechung
 *    haben. Die Schleife führt intern eine Float-Uhr und gibt nur ganze Tage aus.
 * 2. **Kein Endlos-Loop als Vorgabe.** Ein Dauerlauf gegen ein Fremdsystem ist
 *    unhöflich und bringt niemandem etwas — das Playback hält am Horizont an.
 * 3. **Geschwindigkeit aus dem Geräte-Tier.** Ein schwaches Gerät blättert
 *    langsamer, statt dass die Darstellung leidet (D-09: kein zweiter Regelkreis,
 *    dieselbe Klassifikation an einem anderen Stellrad).
 */

import type { PerfTier } from '../wind/perfGovernor';

export interface FirePlaybackState {
  playing: boolean;
  /** Tage je Sekunde — aus dem Geräte-Tier abgeleitet, nicht frei gewählt. */
  daysPerSecond: number;
}

/**
 * Abspielgeschwindigkeit je Geräteklasse.
 *
 * Bewusst langsam: Ein Tag ist eine ganze Kachelrunde beim Fremdserver, und der
 * Nutzer soll die Fläche auch *lesen* können. 1,1 Tage/s heißt ~0,9 s Standzeit
 * je Tag — genug, um eine Veränderung zu bemerken, ohne zu langweilen.
 */
export function daysPerSecondForTier(tier: PerfTier): number {
  return tier === 'low' ? 0.7 : tier === 'mid' ? 0.9 : 1.1;
}

export function defaultPlayback(tier: PerfTier = 'high'): FirePlaybackState {
  return { playing: false, daysPerSecond: daysPerSecondForTier(tier) };
}

export interface StepResult {
  /** Neue Float-Position der internen Uhr. */
  pos: number;
  /** Der anzuzeigende Tag — immer ganzzahlig. */
  day: number;
  /** Hat das Playback den Horizont erreicht und sich beendet? */
  ended: boolean;
}

/**
 * Ein Schritt der Abspiel-Uhr.
 *
 * `dtSeconds` kommt aus der rAF-Schleife. Die Uhr läuft float, die Ausgabe ist
 * ganzzahlig — so bleibt die Geschwindigkeit unabhängig von der Bildrate, ohne
 * dass Zwischentage entstehen.
 *
 * ⚠️ `dtSeconds` wird gedeckelt: Ein Tab-Wechsel oder ein langer Task liefert
 * sonst ein `dt` von mehreren Sekunden, und das Playback springt über Tage
 * hinweg — der Nutzer sähe eine Lücke statt einer Bewegung.
 */
export function stepPlayback(
  pos: number, dtSeconds: number, daysPerSecond: number, maxDay: number,
): StepResult {
  const dt = Math.max(0, Math.min(0.25, dtSeconds));
  let next = pos + dt * daysPerSecond;
  if (next >= maxDay) {
    return { pos: maxDay, day: maxDay, ended: true };
  }
  if (!Number.isFinite(next)) next = 0;
  return { pos: next, day: Math.floor(next), ended: false };
}

/**
 * Der Tag, der als Nächstes gebraucht wird — Ziel des Prefetch.
 *
 * Beim Abspielen ist das der Folgetag. Steht das Playback, ist es ebenfalls der
 * Folgetag: Wer den Regler bewegt, bewegt ihn fast immer vorwärts. `null`, wenn
 * es keinen gibt (Horizont erreicht) — dann wird nichts vorgeladen.
 */
export function prefetchTarget(day: number, maxDay: number): number | null {
  const next = day + 1;
  return next <= maxDay ? next : null;
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; läuft in verify:fire-time mit)
// ---------------------------------------------------------------------------

export interface PlaybackCheck { name: string; ok: boolean; detail?: string }

export function verifyFirePlayback(): { checks: PlaybackCheck[]; passed: number; total: number } {
  const checks: PlaybackCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  add('Tier bestimmt die Geschwindigkeit, absteigend nach unten',
    daysPerSecondForTier('high') > daysPerSecondForTier('mid')
      && daysPerSecondForTier('mid') > daysPerSecondForTier('low'));
  add('auch das schwächste Gerät spielt noch ab (nie 0)',
    daysPerSecondForTier('low') > 0);
  add('Vorgabe startet pausiert — kein ungefragter Netzverkehr',
    defaultPlayback().playing === false);

  // --- Die Schrittlogik
  // Achtung, hier ist die erste Fassung dieser Zusicherung gescheitert — und die
  // Zusicherung hatte unrecht, nicht der Code: `dt` ist auf 0,25 s gedeckelt, ein
  // „Sekundenschritt" bewegt die Uhr also nur um 0,275 Tage. Der Deckel ist
  // Absicht (Tab-Wechsel), also wird er hier geprüft statt umgangen.
  const a = stepPlayback(0, 1, 1.1, 6);
  add('ein 1-s-dt wird auf 0,25 s gedeckelt ⇒ 0,275 Tage, weiterhin Tag 0',
    a.day === 0 && Math.abs(a.pos - 0.275) < 1e-9 && !a.ended, String(a.pos));

  // Bei echter Bildrate (rAF ≈ 16 ms) greift der Deckel nie — dort läuft die Uhr
  // exakt mit der eingestellten Geschwindigkeit. Vier Sekunden bei 1,1 T/s
  // müssen also gut vier Tage weit kommen.
  let pos = 0, tage = 0;
  for (let i = 0; i < 240; i++) {   // 240 × 16,7 ms ≈ 4 s
    const r = stepPlayback(pos, 0.0167, 1.1, 9);
    pos = r.pos; tage = r.day;
  }
  add('vier Sekunden rAF bei 1,1 T/s ⇒ Tag 4', tage === 4, `Tag ${tage}, pos ${pos.toFixed(2)}`);
  const b = stepPlayback(0, 0.4, 1.1, 6);
  add('ein Teilschritt zeigt weiterhin Tag 0 (keine Zwischentage)',
    b.day === 0 && b.pos > 0, `${b.pos.toFixed(2)}`);
  add('die Ausgabe ist IMMER ganzzahlig',
    [0.1, 0.5, 1.3, 2.9, 4.4].every((p) => Number.isInteger(stepPlayback(p, 0.1, 1.1, 9).day)));

  // Der Anschlag: kein Loop, sondern Ende.
  const end = stepPlayback(5.9, 1, 1.1, 6);
  add('am Horizont endet das Playback, es springt NICHT auf 0',
    end.day === 6 && end.ended === true, `day=${end.day} ended=${end.ended}`);
  add('der Endzustand bleibt am Horizont stehen', stepPlayback(6, 1, 1.1, 6).day === 6);

  // Der Tab-Wechsel-Fall: ohne Deckel springt das Playback über Tage.
  const jump = stepPlayback(0, 12, 1.1, 9);
  add('ein 12-s-dt (Tab-Wechsel) springt NICHT über Tage — dt ist gedeckelt',
    jump.day === 0, `day=${jump.day}, pos=${jump.pos.toFixed(2)}`);
  add('negatives dt bewegt nichts rückwärts', stepPlayback(2, -5, 1.1, 9).pos >= 2);
  add('NaN im dt kippt die Uhr nicht',
    Number.isFinite(stepPlayback(2, Number.NaN, 1.1, 9).pos));

  // --- Prefetch-Ziel
  add('Prefetch zielt auf den Folgetag', prefetchTarget(2, 6) === 3);
  add('am Horizont wird nichts mehr vorgeladen', prefetchTarget(6, 6) === null);
  add('bei Horizont 0 gibt es kein Prefetch-Ziel', prefetchTarget(0, 0) === null);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
