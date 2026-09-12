/**
 * prune.mjs — eine Stufe aus einem Laufverzeichnis nehmen (PD-F3a).
 *
 * Mit einem Job je Stufe (F3b) altern die Stufen verschieden: t1 fällt nach 9 h, t2/t3 nach 24 h.
 * `pruneTier` löscht `point/<run>/<tier>/`, nimmt den Stufeneintrag und dessen Quellen aus `run.json`
 * und entfernt das Verzeichnis ganz, wenn keine Stufe mehr bleibt — der Publisher-Wächter „kein Chunk
 * ohne Manifesteintrag, kein Eintrag ohne Datei" bleibt danach grün. Reine Funktion über dem
 * Datenträger, netzfrei testbar.
 */
import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Die Stufen, die ein Laufverzeichnis laut Manifest trägt (mit Quell-Lauf je Stufe). */
export function tiersOf(runDir) {
  const mp = join(runDir, 'run.json');
  if (!existsSync(mp)) return [];
  try {
    const man = JSON.parse(readFileSync(mp, 'utf8'));
    return (man.tiers ?? []).map((t) => ({
      id: t.id, run: t.run ?? null, runAt: t.runAt ?? null, ageH: t.ageH ?? null,
      files: (t.files ?? []).length, bytes: (t.files ?? []).reduce((n, f) => n + (f.bytes ?? 0), 0),
    }));
  } catch { return []; }
}

/**
 * @returns {{ removedTier: boolean, removedRun: boolean, remaining: string[] }}
 */
export function pruneTier(runDir, tierId) {
  const mp = join(runDir, 'run.json');
  const tierDir = join(runDir, tierId);
  const hadDir = existsSync(tierDir);
  if (hadDir) rmSync(tierDir, { recursive: true, force: true });
  let remaining = [];
  if (existsSync(mp)) {
    const man = JSON.parse(readFileSync(mp, 'utf8'));
    man.tiers = (man.tiers ?? []).filter((t) => t.id !== tierId);
    man.sources = (man.sources ?? []).filter((s) => s.tier !== tierId);
    remaining = man.tiers.map((t) => t.id);
    if (remaining.length) writeFileSync(mp, JSON.stringify(man, null, 2));
  }
  let removedRun = false;
  if (remaining.length === 0) {
    rmSync(runDir, { recursive: true, force: true });
    removedRun = true;
  } else {
    // Ein Stufenverzeichnis ohne Manifesteintrag darf nicht stehen bleiben (Orphan-Wächter).
    for (const e of readdirSync(runDir, { withFileTypes: true })) {
      if (e.isDirectory() && /^t\d$/.test(e.name) && !remaining.includes(e.name)) rmSync(join(runDir, e.name), { recursive: true, force: true });
    }
  }
  return { removedTier: hadDir, removedRun, remaining };
}
