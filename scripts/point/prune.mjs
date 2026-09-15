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
import { TIERS } from '../../src/point/cubeFormat.ts';
import { runsToKeep, runsToKeepFor, RETENTION_HOURS, RETENTION_HOURS_BY_TIER, MIN_RUNS } from '../../src/point/manifest.ts';

/** Laufverzeichnisse (`YYYYMMDDHH`) unter `dir`, jüngstes zuerst. Stationsläufe heißen genauso, liegen aber unter `stations/`. */
export function runsIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{10}$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
}

export const runIdToIso = (r) => `${r.slice(0, 4)}-${r.slice(4, 6)}-${r.slice(6, 8)}T${r.slice(8, 10)}:00:00Z`;

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

/**
 * Die Aufbewahrung des Cubes als EINE reine Funktion über dem Datenträger — beide Durchgänge
 * (je Stufe, dann Gesamtsicht) in der Reihenfolge, in der der Publisher sie fährt.
 *
 * ⚠ Warum die Gesamtsicht die Stufen-Entscheidung RESPEKTIEREN muss (2026-09-14): der Publisher
 * räumte erst je Stufe (`runsToKeepFor`, `MIN_RUNS` je Stufe) und danach global über alle
 * Laufverzeichnisse mit `runsToKeep` — Alter am VERZEICHNISNAMEN, Liste voller frischer t1-Läufe.
 * `MIN_RUNS` greift dort nie (es sind immer ≥ 2 frische Verzeichnisse da), also fiel jedes
 * Verzeichnis > 24 h, samt der t3-Stufe, die der erste Durchgang wegen des Bodens gerade
 * behalten hatte. Am veröffentlichten Index vom 2026-09-14 (16:56 und 19:53 UTC) hielt t3 genau
 * EINEN Lauf, obwohl `minRuns: 2` daneben stand — `2026091312` war 28,9 h alt und weg. Der
 * Verifier prüfte nur die REIHENFOLGE der Durchgänge, nie ihre Verkettung.
 *
 * Kur: die Gesamtsicht entfernt nur Verzeichnisse, die KEIN Stufen-Durchgang behalten hat —
 * also Waisen ohne Manifest oder ohne Stufe. Die 24-h-Regel (Jan 2026-09-09) bleibt; `MIN_RUNS`
 * gilt jetzt wirklich je Stufe. `legacyGlobalPass: true` gibt es nur für die Negativkontrolle
 * im Verifier: sie beweist, dass der alte Weg den t3-Rückfall-Lauf löscht.
 *
 * @param {string} pointDir   das `point/`-Verzeichnis des Repos
 * @param {{ nowMs?: number, legacyGlobalPass?: boolean }} [opts]
 * @returns {{ events: Array<object>, kept: string[], keptByTier: Record<string, string[]> }}
 */
export function retainRuns(pointDir, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const legacy = opts.legacyGlobalPass === true;
  const ageOf = (runAt) => (nowMs - Date.parse(runAt)) / 3_600_000;
  const events = [];
  const keptByTier = {};
  const keptAny = new Set();

  // 1. je Stufe — Alter des QUELL-Laufs der Stufe (run.json), Boden MIN_RUNS je Stufe.
  for (const tier of TIERS) {
    const withTier = runsIn(pointDir).map((run) => {
      const t = tiersOf(join(pointDir, run)).find((x) => x.id === tier.id);
      return t ? { run, runAt: t.runAt ?? runIdToIso(run) } : null;
    }).filter(Boolean);
    const d = runsToKeepFor(withTier, { hours: RETENTION_HOURS_BY_TIER[tier.id], minRuns: MIN_RUNS }, nowMs);
    keptByTier[tier.id] = d.keep.map((r) => r.run);
    for (const r of d.keep) keptAny.add(r.run);
    for (const r of d.drop) {
      const res = pruneTier(join(pointDir, r.run), tier.id);
      events.push({ kind: 'tier-drop', tier: tier.id, run: r.run, ageH: ageOf(r.runAt), limitH: RETENTION_HOURS_BY_TIER[tier.id], removedRun: res.removedRun, remaining: res.remaining });
    }
    for (const r of d.stale) events.push({ kind: 'tier-stale', tier: tier.id, run: r.run, ageH: ageOf(r.runAt), minRuns: MIN_RUNS });
  }

  // 2. Gesamtsicht — nur noch für Verzeichnisse, die keine Stufe hält (Waisen).
  const present = runsIn(pointDir).map((r) => ({ run: r, runAt: runIdToIso(r) }));
  const decision = runsToKeep(present, nowMs);
  for (const r of decision.drop) {
    if (!legacy && keptAny.has(r.run)) {
      events.push({ kind: 'run-kept-by-tier', run: r.run, ageH: ageOf(r.runAt), tiers: Object.keys(keptByTier).filter((t) => keptByTier[t].includes(r.run)) });
      continue;
    }
    rmSync(join(pointDir, r.run), { recursive: true, force: true });
    events.push({ kind: 'run-drop', run: r.run, ageH: ageOf(r.runAt), limitH: RETENTION_HOURS, legacy });
  }
  for (const r of decision.stale) events.push({ kind: 'run-stale', run: r.run, ageH: ageOf(r.runAt), minRuns: MIN_RUNS });

  return { events, kept: runsIn(pointDir), keptByTier };
}
