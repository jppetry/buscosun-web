/**
 * NP-0b — Ablage der Kartenfelder `point/field/v1/` (audit/np0-datenprodukte.md §3.3, §8; E-NP0-5): EINE Stelle für den
 * Producer (`build-point-fields.mjs`) und den Publisher (`publish-point.mjs`).
 *
 *   · `latestTierRun(pointDir, tier)` — der jüngste Lauf unter `point/<lauf>/`, dessen `run.json` die Stufe mit Chunks trägt
 *   · `pruneFieldStore(pointDir)` — ein Feld lebt, solange seine Cube-Stufe lebt: `field/v1/<lauf>/<stufe>` bleibt genau
 *     dann, wenn `point/<lauf>/run.json` die Stufe noch nennt; Verzeichnisse ohne `field.json` (abgebrochener Bau) und
 *     Bau-Reste fallen. Läuft im Publisher NACH der Cube-Aufbewahrung — auch mit `POINT_FIELDS=0`, damit der Altbestand
 *     abgebaut wird.
 *   · `writeFieldIndex(pointDir)` — `field/v1/index.json` aus den vorhandenen Manifesten (nie fortgeschrieben, immer gezählt).
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FIELD_VERSION, FIELD_MANIFEST_FILE, makeFieldIndex, parseFieldManifest } from '../../src/point/fieldFormat.ts';
import { TIERS } from '../../src/point/cubeFormat.ts';

const RUN_RE = /^\d{10}$/;

/** `<point>/field/v1` */
export function fieldRoot(pointDir) { return join(pointDir, 'field', FIELD_VERSION); }

function readJson(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }

/** Läufe unter `point/` mit ihren Stufen (aus `run.json`, nur Stufen mit Chunks). */
export function cubeTiersByRun(pointDir) {
  const out = new Map();
  if (!existsSync(pointDir)) return out;
  for (const run of readdirSync(pointDir).filter((d) => RUN_RE.test(d)).sort()) {
    const man = readJson(join(pointDir, run, 'run.json'));
    out.set(run, new Set((man?.tiers ?? []).filter((t) => (t.files ?? []).length > 0).map((t) => t.id)));
  }
  return out;
}

/** Der jüngste Lauf, der die Stufe trägt — dieselbe Wahl wie `latestByTier` im Index (größter Lauf-Name). */
export function latestTierRun(pointDir, tierId) {
  let best = null;
  for (const [run, tiers] of cubeTiersByRun(pointDir)) if (tiers.has(tierId) && (!best || run > best)) best = run;
  return best;
}

/** Aufbewahrung der Felder. Liefert die Ereignisse für das Log. */
export function pruneFieldStore(pointDir) {
  const root = fieldRoot(pointDir);
  const events = [];
  if (!existsSync(root)) return events;
  const living = cubeTiersByRun(pointDir);
  for (const run of readdirSync(root)) {
    const runDir = join(root, run);
    if (!statSync(runDir).isDirectory()) continue;
    if (!RUN_RE.test(run)) { rmSync(runDir, { recursive: true, force: true }); events.push({ kind: 'junk', path: run }); continue; }
    for (const tier of readdirSync(runDir)) {
      const dir = join(runDir, tier);
      const tiers = living.get(run);
      if (!tiers || !tiers.has(tier)) { rmSync(dir, { recursive: true, force: true }); events.push({ kind: 'drop', run, tier }); continue; }
      if (!existsSync(join(dir, FIELD_MANIFEST_FILE))) { rmSync(dir, { recursive: true, force: true }); events.push({ kind: 'incomplete', run, tier }); }
    }
    if (!readdirSync(runDir).length) rmSync(runDir, { recursive: true, force: true });
  }
  return events;
}

/** Index aus den vorhandenen Manifesten. Liefert das Objekt (geschrieben nach `field/v1/index.json`) oder null ohne Felder. */
export function writeFieldIndex(pointDir, nowMs = Date.now()) {
  const root = fieldRoot(pointDir);
  if (!existsSync(root)) return null;
  const latest = {}, runs = {};
  for (const run of readdirSync(root).filter((d) => RUN_RE.test(d)).sort().reverse()) {
    for (const tier of TIERS.map((t) => t.id)) {
      const m = parseFieldManifest(readJson(join(root, run, tier, FIELD_MANIFEST_FILE)));
      if (!m) continue;
      (runs[tier] ??= []).push(run);
      if (!latest[tier]) latest[tier] = { run, runAtMs: m.runAtMs, builtAtMs: m.builtAtMs, durationMs: m.timing.ms, leads: m.leads.length };
    }
  }
  if (!Object.keys(runs).length) {
    const p = join(root, 'index.json');
    if (existsSync(p)) rmSync(p);
    return null;
  }
  const idx = makeFieldIndex(latest, runs, nowMs);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'index.json'), `${JSON.stringify(idx, null, 2)}\n`);
  return idx;
}
