/**
 * compareTrees.mjs — der Byte-Beweis für Block F (PD-F2a ff.).
 *
 * Jede Optimierung des Producers muss den Cube UNVERÄNDERT lassen: gleicher Cache, gleicher
 * `--run`, alter Pfad gegen neuen ⇒ 0 von 276 Chunks verschieden. Das ist die
 * Vollständigkeitsgarantie (Plan Block F, F-0) — nicht „sieht gleich aus", sondern `cmp`.
 * Muster: §38 (Nachbarindex: 12 von 12 Chunks byte-gleich, mit Negativ-Kontrolle).
 *
 * Dazu der Manifest-Vergleich auf einer WHITELIST deterministischer Felder. Zeiten
 * (`msWall`, `timing`, `net.ms`) und Publisher-Zeitstempel dürfen abweichen; Zählwerte,
 * Abdeckung, Versatz, Ebenenbelegung und Fehlerzahl (= 0) nicht.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
 *        scripts/point/compareTrees.mjs <refDir> <newDir>
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Alle `.bin` unter `<dir>/<run>/<tier>/`, relativ zu `dir`, sortiert. */
export function listChunks(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.bin')) out.push(relative(dir, p).replace(/\\/g, '/'));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}

/**
 * Chunk-Bäume vergleichen. Gibt Zählwerte und die Liste der Abweichungen zurück.
 * `differing` = gleicher Pfad, andere Bytes; `missing` = nur in ref; `extra` = nur in new.
 */
export function compareChunkTrees(refDir, newDir) {
  const ref = listChunks(refDir), neu = listChunks(newDir);
  const refSet = new Set(ref), newSet = new Set(neu);
  const differing = [], same = [];
  let bytes = 0;
  for (const rel of ref) {
    if (!newSet.has(rel)) continue;
    const a = readFileSync(join(refDir, rel)), b = readFileSync(join(newDir, rel));
    bytes += a.length;
    if (a.length === b.length && Buffer.compare(a, b) === 0) same.push(rel); else differing.push(rel);
  }
  return {
    compared: same.length + differing.length,
    same: same.length,
    differing,
    missing: ref.filter((r) => !newSet.has(r)),
    extra: neu.filter((r) => !refSet.has(r)),
    bytes,
    ok: differing.length === 0 && ref.length === neu.length && ref.length > 0 && ref.every((r) => newSet.has(r)),
  };
}

/** Felder, die zwischen zwei Bauten am selben Cache GLEICH sein müssen. */
export function manifestWhitelist(man) {
  const tiers = Object.fromEntries((man.tiers ?? []).map((t) => [t.id, {
    run: t.run, leadHours: t.leadHours, files: (t.files ?? []).map((f) => [f.file, f.bytes]),
    quantiles: t.quantiles ? { source: t.quantiles.source, steps: t.quantiles.steps, missing: t.quantiles.missing, cellsWritten: t.quantiles.cellsWritten } : null,
    ensemble: t.ensemble ? { byHour: t.ensemble.byHour, steps: t.ensemble.steps, missing: t.ensemble.missing,
      sources: (t.ensemble.sources ?? []).map((s) => ({ id: s.id, hours: s.hours, membersMin: s.membersMin, membersMax: s.membersMax, clamped: s.clamped, noRate: s.noRate, errors: s.errors })) } : null,
    profile: t.profile ? { source: t.profile.source, steps: t.profile.steps, missing: t.profile.missing, inversionShare: t.profile.inversionShare } : null,
    dropped: t.dropped ?? [],
    // `net` steht bewusst NICHT hier: die Zahl der Anfragen ist keine Dateneigenschaft. Gemessen
    // am ersten Einsatz (pc-c5 gegen pc-c5b): 56/56 Chunks gleich, aber 233 ≠ 208 Anfragen bei
    // IFS — der PD-C5-Vorschrittwächter hatte 404-Abrufe gespart. Genau das sollen F2a–F2e tun.
  }]));
  const sources = (man.sources ?? []).map((s) => ({
    id: s.id, tier: s.tier, runAt: s.runAt, steps: s.steps, coverage: s.coverage, offsetH: s.offsetH,
    members: s.members, role: s.role, errors: s.errors, dropped: s.dropped ? true : false,
  }));
  return { schema: man.schema, run: man.run, tiers, sources, sdEnsEmpty: man.fusion?.spread?.sdEnsEmpty ?? null, skipped: man.skipped ?? null };
}

/** Whitelist-Vergleich zweier Manifeste; leere Liste = gleich. */
export function compareManifests(refMan, newMan) {
  const a = manifestWhitelist(refMan), b = manifestWhitelist(newMan);
  const diffs = [];
  const walk = (x, y, path) => {
    if (x === y) return;
    if (x == null || y == null || typeof x !== 'object' || typeof y !== 'object') { diffs.push(`${path}: ${JSON.stringify(x)} ≠ ${JSON.stringify(y)}`); return; }
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) walk(x[k], y[k], path ? `${path}.${k}` : k);
  };
  walk(a, b, '');
  return diffs;
}

/** Alle `run.json` unter `<dir>/<run>/run.json`. */
export function manifestsIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => /^\d{10}$/.test(d) && existsSync(join(dir, d, 'run.json')))
    .map((d) => ({ run: d, manifest: JSON.parse(readFileSync(join(dir, d, 'run.json'), 'utf8')) }));
}

/** Vollständiger Vergleich zweier Ausgabebäume (Chunks + Manifest-Whitelist). */
export function compareTrees(refDir, newDir) {
  const chunks = compareChunkTrees(refDir, newDir);
  const refM = manifestsIn(refDir), newM = manifestsIn(newDir);
  const manifest = [];
  for (const r of refM) {
    const n = newM.find((x) => x.run === r.run);
    if (!n) { manifest.push(`run ${r.run}: Manifest fehlt im neuen Baum`); continue; }
    manifest.push(...compareManifests(r.manifest, n.manifest).map((d) => `run ${r.run}: ${d}`));
    const errs = (n.manifest.sources ?? []).filter((s) => (s.errors ?? 0) > 0).map((s) => `${s.tier}:${s.id}=${s.errors}`);
    if (errs.length) manifest.push(`run ${r.run}: Quellfehler im neuen Bau — Vergleich ungültig (${errs.join(' ')})`);
    const thr = Object.values(n.manifest.tiers ?? []).flatMap((t) => Object.values(t.net ?? {})).reduce((a, x) => a + (x.throttled ?? 0), 0);
    if (thr) manifest.push(`run ${r.run}: ${thr} × 429 im neuen Bau`);
  }
  return { chunks, manifest, ok: chunks.ok && manifest.length === 0 };
}

if (process.argv[1]?.endsWith('compareTrees.mjs')) {
  const [ref, neu] = process.argv.slice(2);
  if (!ref || !neu) { console.error('Aufruf: compareTrees.mjs <refDir> <newDir>'); process.exit(2); }
  const r = compareTrees(ref, neu);
  console.log(`Chunks: ${r.chunks.compared} verglichen · ${r.chunks.same} gleich · ${r.chunks.differing.length} verschieden · `
    + `${r.chunks.missing.length} fehlen · ${r.chunks.extra.length} zusätzlich · ${(r.chunks.bytes / 1048576).toFixed(2)} MiB`);
  for (const d of r.chunks.differing.slice(0, 10)) console.log(`  ≠ ${d}`);
  for (const d of r.chunks.missing.slice(0, 5)) console.log(`  fehlt ${d}`);
  for (const d of r.chunks.extra.slice(0, 5)) console.log(`  extra ${d}`);
  console.log(`Manifest-Whitelist: ${r.manifest.length === 0 ? 'gleich' : r.manifest.length + ' Abweichungen'}`);
  for (const d of r.manifest.slice(0, 20)) console.log(`  ${d}`);
  console.log(r.ok ? 'BYTE-GLEICH' : 'VERSCHIEDEN');
  process.exit(r.ok ? 0 : 1);
}
