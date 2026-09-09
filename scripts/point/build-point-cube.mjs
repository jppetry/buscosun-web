/**
 * build-point-cube.mjs — Producer des Punkt-Cubes (Phasen PD-A/PD3–PD5,
 * `audit/punktdaten-versorgung.md` §17/§18.1).
 *
 * Schreibt die drei Auflösungsstufen aus allen Quellen, für die es einen Adapter
 * gibt (`scripts/point/adapters/`). Die Adapter kennen ihre Quelle, dieser
 * Orchestrator kennt das Format — dazwischen liegt genau eine Schnittstelle.
 *
 * ── Was hier zusammengeführt wird, und wie ehrlich ─────────────────────────
 * `ABLAUFPLAENE.md` PAP 2 fusioniert mit `w = Σ⁻¹1 / (1ᵀΣ⁻¹1)`. Diese Fehler-
 * kovarianz **gibt es nicht**, solange `buscosun-archiv` (PA) sie nicht misst
 * (§21 (4)). Der Producer nimmt deshalb **gleiche Gewichte** — und schreibt das ins
 * Manifest (`fusion.weights: "equal"`, `provenance: "fallback"`), damit niemand eine
 * gemessene Gewichtung vermutet, wo eine gesetzte steht.
 *
 * Was dabei ECHT entsteht, ist `σ_div`: die Streuung zwischen den Quellen an
 * derselben Zelle und Stunde. PAP 6 nennt sie als den einen von zwei Beiträgen; der
 * andere (`σ_sys`) bleibt `null`, bis die Verifikation ihn liefert. `sigmaKind` sagt
 * je Zelle, welcher Fall galt:
 *
 *   `divergence` (2)  mehrere Quellen ⇒ σ = σ_div (Sockel σ_sys fehlt noch)
 *   `systematic` (3)  genau eine Quelle ⇒ der Nenner von σ_div ist exakt null,
 *                     es bliebe σ_sys — also σ = MISSING, nicht 0
 *   `unknown` (0)     keine Quelle
 *
 * ── Was weiterhin fehlt ────────────────────────────────────────────────────
 *   • Die fünf Profilfelder (PD1) — sie brauchen die Modelllevel-Temperatur.
 *   • Ensemble-Member (σ_ens) — bei IFS/AIFS wird nur der Kontrolllauf gelesen.
 *   • MOSMIX, C-LAEF, ICON-CH, die Radar-Quellen — s. `adapters/index.mjs` PENDING.
 *
 * Aufruf:
 *   npm run point:cube -- --tiers=t1
 *   npm run point:cube -- --tiers=all --steps=0-6
 *   npm run point:cube -- --only=icon_d2,icon_eu
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import {
  TIERS, TIER_BY_ID, CUBE_PLANES, CHUNK_CELLS, MISSING,
  chunkExtent, chunkPath, runManifestPath, planeIndex, quantize, encodeCubeChunk,
} from '../../src/point/cubeFormat.ts';
import { SOURCE_BY_ID } from '../../src/point/sourceMatrix.ts';
import { adapterFor, ingestableFor, PENDING } from './adapters/index.mjs';
import { netStats, resetNetStats, runIso } from './adapters/shared.mjs';

const OUT = process.env.POINT_OUT || 'data/point';
const deflate9 = async (bytes) => new Uint8Array(deflateRawSync(bytes, { level: 9 }));

/** Zielgrößen aus den Quellen; Profil und Meta füllt der Producer selbst. */
const TARGET_VARS = CUBE_PLANES.filter((p) => p.kind === 'mean' && p.group === 'target').map((p) => p.id);

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };

// ---------------------------------------------------------------------------
// Eine Stufe bauen
// ---------------------------------------------------------------------------

export async function buildTier(tierId, opts = {}) {
  const tier = TIER_BY_ID[tierId];
  const leadHours = opts.steps ?? tier.leadHours;
  const nt = leadHours.length;
  const cells = tier.ny * tier.nx;
  const t0 = Date.now();

  const { usable, diversity, skipped } = ingestableFor(tier);
  const only = opts.only ? new Set(opts.only) : null;
  // `diversity` kommt hinter die zugeordneten Quellen — die Reihenfolge entscheidet
  // nichts (gleiche Gewichte), aber das Manifest soll sie in dieser Ordnung nennen.
  const ids = [...usable, ...(opts.noDiversity ? [] : diversity)].filter((id) => !only || only.has(id));
  const isDiversity = new Set(diversity);

  // Je Quelle: Lauf und lieferbare Stunden — beides am ECHTEN Objekt geprüft,
  // nicht aus einer Tabelle geraten (§21 (7)).
  const contributors = [];
  for (const id of ids) {
    const a = adapterFor(id);
    // ── Warum die Ensemble-KONTROLLLÄUFE nicht in den Mittelwert gehen ────────
    // IFS-ENS-Kontrolle ist dasselbe Modell wie IFS HRES, nur gröber gerechnet;
    // AIFS-ENS-Kontrolle dasselbe wie AIFS Single. Nimmt man sie als eigene
    // „Meinungen" mit, zieht ECMWF den Mittelwert doppelt UND `σ_div` schrumpft,
    // weil zwei der vier Werte fast identisch sind. Das Ergebnis sähe SICHERER aus,
    // als es ist — der teuerste Fehler, den dieses Produkt machen kann.
    //
    // PAP 2 löst das über eine Kovarianz MIT Fehlerkorrelation; die gibt es noch
    // nicht (§21 (4)). Bis dahin trägt je Modellfamilie genau ein deterministischer
    // Lauf. Die Adapter bleiben — sobald echte Member gelesen werden, liefern sie
    // `σ_ens` und werden wieder aufgenommen. → V-PD-9
    if (a?.ensembleControlOnly && !opts.withEnsembleControl) {
      skipped.push([id, 'nur Kontrolllauf lesbar; als vierter „unabhängiger" Wert würde er σ_div schrumpfen (V-PD-9)']);
      continue;
    }
    const run = await a.discoverRun(leadHours[0], opts.nowMs);
    if (!run) { skipped.push([id, `kein Lauf gefunden, der ${leadHours[0]} h trägt`]); continue; }
    const leads = new Set(await a.leadsFor(run, { ...tier, leadHours }));
    if (leads.size === 0) { skipped.push([id, `Lauf ${run} liefert keine Stunde dieser Stufe`]); continue; }
    contributors.push({ id, adapter: a, run, leads, role: isDiversity.has(id) ? 'diversity' : 'assigned' });
  }
  if (contributors.length === 0) {
    return { tier: tierId, leadHours, contributors: [], skipped, files: [], bytesTotal: 0, empty: true };
  }

  // Volle Stufenebenen als int16 — das ist zugleich die Ausgabegröße.
  const planes = CUBE_PLANES.map(() => new Int16Array(nt * cells).fill(MISSING));
  const planeAt = (id) => planes[planeIndex(id)];
  const meta = (id) => CUBE_PLANES[planeIndex(id)];
  const countPlane = planeAt('srcCount');
  // Je Zelle und Schritt: welche Quellen ueberhaupt etwas geliefert haben (Bitmaske,
  // damit dieselbe Quelle ueber mehrere Groessen nicht doppelt zaehlt).
  const srcMask = new Int32Array(nt * cells);

  const accPrev = new Map();   // Quelle+Größe → Summe des zuletzt geholten Schritts

  for (let it = 0; it < nt; it++) {
    const leadH = leadHours[it];
    const prevLead = it === 0 ? leadH - tier.stepH : leadHours[it - 1];
    const dt = leadH - prevLead;

    for (const varId of TARGET_VARS) {
      const grids = [];
      const gridSrc = [];
      for (let ci = 0; ci < contributors.length; ci++) {
        const c = contributors[ci];
        if (!c.adapter.vars.includes(varId)) continue;
        if (!c.leads.has(leadH)) continue;
        let g = await c.adapter.field(c.run, leadH, varId, tier);
        if (!g) continue;
        if (c.adapter.accumulated.has(varId)) {
          // Rate = (Summe[t] − Summe[t−Δ]) / Δ. Ohne Referenz ist 0 mm/h KEINE
          // Aussage über den Niederschlag, sondern über den Lauf ⇒ MISSING.
          const key = `${c.id}:${varId}`;
          let prev = accPrev.get(key);
          if (!prev || prev.lead !== prevLead) {
            const p = prevLead >= 0 ? await c.adapter.field(c.run, prevLead, varId, tier) : null;
            prev = p ? { lead: prevLead, grid: p } : null;
          }
          accPrev.set(key, { lead: leadH, grid: g });
          if (!prev || dt <= 0) continue;
          const rate = new Float32Array(cells).fill(NaN);
          for (let k = 0; k < cells; k++) {
            if (Number.isFinite(g[k]) && Number.isFinite(prev.grid[k])) {
              rate[k] = Math.max(0, (g[k] - prev.grid[k]) / dt);
            }
          }
          g = rate;
        }
        grids.push(g);
        gridSrc.push(ci);
      }
      if (grids.length === 0) continue;

      // Welche Quellen an welcher Zelle etwas beigetragen haben — als Bitmaske.
      const maskHere = new Int32Array(cells);
      for (let gi = 0; gi < grids.length; gi++) {
        const bit = 1 << gridSrc[gi];
        const g = grids[gi];
        for (let k = 0; k < cells; k++) if (Number.isFinite(g[k])) maskHere[k] |= bit;
      }

      const mp = meta(varId);
      const sdIdx = planeIndex(`${varId}_sd`);
      const target = planeAt(varId);
      const base = it * cells;
      for (let k = 0; k < cells; k++) {
        let n = 0, sum = 0, sumsq = 0;
        for (const g of grids) {
          const v = g[k];
          if (!Number.isFinite(v)) continue;
          n++; sum += v; sumsq += v * v;
        }
        if (n === 0) continue;
        target[base + k] = quantize(sum / n, mp);
        if (sdIdx >= 0 && n >= 2) {
          const varr = Math.max(0, (sumsq - (sum * sum) / n) / (n - 1));
          planes[sdIdx][base + k] = quantize(Math.sqrt(varr), CUBE_PLANES[sdIdx]);
        }
        srcMask[base + k] |= maskHere[k];
      }
    }
  }
  // srcCount aus der Bitmaske — dieselbe Quelle ueber mehrere Groessen zaehlt einmal.
  {
    const mp = meta('srcCount');
    for (let i = 0; i < srcMask.length; i++) {
      const m = srcMask[i];
      if (m === 0) continue;
      let n = 0;
      for (let b = m; b; b >>= 1) n += b & 1;
      countPlane[i] = quantize(n, mp);
    }
  }
  const tFields = Date.now();

  // hModEff: Mittel der Modellorographien der beitragenden Quellen. Bei gleichen
  // Gewichten ist das ihr arithmetisches Mittel; bei genau einer Quelle deren HSURF.
  const oros = [];
  for (const c of contributors) {
    const o = await c.adapter.orography(c.run, tier);
    if (o) oros.push(o);
  }
  if (oros.length) {
    const mp = meta('hModEff');
    const plane = planeAt('hModEff');
    for (let k = 0; k < cells; k++) {
      let n = 0, sum = 0;
      for (const o of oros) if (Number.isFinite(o[k])) { n++; sum += o[k]; }
      if (n === 0) continue;
      const q = quantize(sum / n, mp);
      for (let it = 0; it < nt; it++) plane[it * cells + k] = q;
    }
  }

  // --- Chunks schneiden ------------------------------------------------------
  const files = [];
  let bytesTotal = 0;
  const perPlane = new Array(CUBE_PLANES.length).fill(0);
  const hasData = new Array(CUBE_PLANES.length).fill(false);
  const runId = contributors.map((c) => c.run).sort().at(-1);

  for (let cy = 0; cy < tier.chunk.cy; cy++) {
    for (let cx = 0; cx < tier.chunk.cx; cx++) {
      const ext = chunkExtent(tier, cy, cx);
      const n = nt * ext.ny * ext.nx;
      const cut = CUBE_PLANES.map((_, pi) => {
        const out = new Int16Array(n);
        const src = planes[pi];
        let w = 0;
        for (let it = 0; it < nt; it++) {
          const b = it * cells;
          for (let ry = 0; ry < ext.ny; ry++) {
            const row = b + (ext.y0 + ry) * tier.nx + ext.x0;
            for (let rx = 0; rx < ext.nx; rx++) out[w++] = src[row + rx];
          }
        }
        return out;
      });
      const bytes = await encodeCubeChunk({
        runHours: Math.floor(Date.parse(runIso(runId)) / 3_600_000),
        tierIndex: tier.index, nt, y0: ext.y0, x0: ext.x0, ny: ext.ny, nx: ext.nx, planes: cut,
      }, deflate9);
      const rel = chunkPath(runId, tier, cy, cx);
      const p = join(opts.out ?? OUT, rel.replace(/^point\//, ''));
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, bytes);
      files.push({ file: rel, bytes: bytes.length, cy, cx });
      bytesTotal += bytes.length;
      for (let pi = 0; pi < CUBE_PLANES.length; pi++) {
        perPlane[pi] += (await deflate9(new Uint8Array(cut[pi].buffer))).length;
        if (!hasData[pi]) for (const v of cut[pi]) if (v !== MISSING) { hasData[pi] = true; break; }
      }
    }
  }

  return {
    tier: tierId, run: runId, leadHours, files, bytesTotal, skipped,
    contributors: contributors.map((c) => ({ id: c.id, run: c.run, leads: c.leads.size, role: c.role })),
    perPlane: Object.fromEntries(CUBE_PLANES.map((p, i) => [p.id, perPlane[i]])),
    hasData: Object.fromEntries(CUBE_PLANES.map((p, i) => [p.id, hasData[i]])),
    ms: { fields: tFields - t0, total: Date.now() - t0 },
  };
}

/** Lauf-Manifest über alle gebauten Stufen. */
export function runManifest(results) {
  const built = results.filter((r) => !r.empty);
  const runId = built.map((r) => r.run).sort().at(-1);
  const sources = [];
  for (const r of built) {
    for (const c of r.contributors) {
      const s = SOURCE_BY_ID[c.id];
      sources.push({
        id: c.id, name: s?.name ?? c.id, tier: r.tier, runAt: runIso(c.run),
        fromH: r.leadHours[0], toH: r.leadHours[r.leadHours.length - 1], steps: c.leads,
        // Wie viele Member tatsächlich gelesen wurden. Steht hier, weil die
        // Standardabweichung aus n Membern die wahre systematisch UNTERSCHÄTZT:
        // E[s] = c4(n)·σ, also 0,973·σ bei n = 10 und 0,995·σ bei n = 51. Das ist eine
        // Ein-Zeilen-Korrektur — aber nur, wenn der Leser n kennt. `0` heißt
        // deterministisch (kein Ensemble), `1` heißt: nur der Kontrolllauf.
        members: c.adapter?.ensembleControlOnly ? 1 : 0,
        // `assigned` = von QUELLENMATRIX §1 diesem Band zugeordnet. `diversity` = zusaetzlich
        // gelesen, damit es ueberhaupt eine zweite Meinung fuer σ_div gibt.
        // ⚠ Beide gehen mit GLEICHEM Gewicht in den Mittelwert (`fusion.weights: 'equal'`) —
        // eine Trennung waere nur mit gemessenem Σ moeglich, und Σ gibt es erst mit
        // buscosun-archiv. Praktisch heisst das: wo die zugeordnete Quelle ein Band nur
        // teilweise deckt (t2: ICON-EU traegt oft nur die ersten Stunden), tragen den Rest
        // die groeberen Globalmodelle. Wer `role` ignoriert, haelt eine Aufloesungsdifferenz
        // fuer Unsicherheit — deshalb steht sie hier je Quelle.
        role: c.role ?? 'assigned',
        attribution: s?.attribution ?? null, licence: s?.licence ?? null,
      });
    }
  }
  return {
    schema: 1,
    run: runId,
    runAt: runIso(runId),
    tiers: built.map((r) => {
      const t = TIER_BY_ID[r.tier];
      return {
        id: t.id, deg: t.deg, lat0: t.lat0, lon0: t.lon0, ny: t.ny, nx: t.nx,
        chunk: { cells: CHUNK_CELLS, cy: t.chunk.cy, cx: t.chunk.cx },
        // Verzeichnis = PUBLIKATIONSLAUF (der neueste über alle Stufen), `run` hier
        // = QUELL-Lauf DIESER Stufe. Die zwei fallen regelmäßig auseinander: t1 kommt
        // aus ICON-D2 12z, t3 aus ICON global 06z. Wer nur das Verzeichnis liest,
        // hielte die Fernstufe für sechs Stunden jünger, als sie ist — genau die
        // Sorte stiller Fehler, gegen die der Header sein eigenes `runHours` trägt.
        run: r.sourceRun ?? r.run, runAt: runIso(r.sourceRun ?? r.run),
        ageH: Math.round((Date.parse(runIso(runId)) - Date.parse(runIso(r.sourceRun ?? r.run))) / 3_600_000),
        leadHours: r.leadHours, files: r.files,
      };
    }),
    planes: CUBE_PLANES.map((p) => ({ id: p.id, unit: p.unit, scale: p.scale, offset: p.offset, group: p.group })),
    sources,
    // Ohne diese Zeilen sähe eine gesetzte Gewichtung aus wie eine gemessene.
    fusion: {
      weights: 'equal',
      provenance: 'fallback',
      note: 'PAP 2 verlangt w = Σ⁻¹1/(1ᵀΣ⁻¹1). Σ ist ungemessen, solange buscosun-archiv nicht läuft (§21 (4)); bis dahin gleiche Gewichte.',
      sigma: 'σ_div aus der Quellenstreuung über ALLE gelesenen Quellen (assigned und diversity, gleiche Gewichte). Der Sockel σ_sys aus PAP 6 fehlt noch; srcCount sagt je Zelle, wie viele Quellen getragen haben, und sd-vorhanden je Größe, welcher PAP-6-Zweig galt.',
      resolutionCaveat: 'Wo Quellen verschiedener Maschenweite in dieselbe Zelle fallen, enthält σ_div auch die Auflösungsdifferenz, nicht nur Vorhersageunsicherheit. `sources[].role` und `fromH/toH` sagen, wo das der Fall ist: `assigned` deckt das Band laut Quellenmatrix, `diversity` ist zusätzlich gelesen. Deckt die zugeordnete Quelle nur einen Teil des Bandes (Beispiel t2: ICON-EU trägt kurz nach dem Lauf nur die ersten Stunden), tragen den Rest die gröberen Globalmodelle — das ist im Manifest an `steps` je Quelle ablesbar.',
      memberBias: 'Wo σ aus Ensemble-Membern käme, gilt E[s] = c4(n)·σ (0,973 bei n=10, 0,995 bei n=51). `sources[].members` nennt n, damit der Leser korrigieren kann. Heute überall 0 oder 1 — es wird kein Ensemble gelesen.',
    },
    skipped: Object.fromEntries(built.flatMap((r) => r.skipped)),
    pending: PENDING,
  };
}

/**
 * Alle Stufen unter EINEN Publikationslauf legen.
 *
 * Jede Stufe schneidet ihre Chunks unter dem Lauf ihrer eigenen Quellen — t1 aus
 * ICON-D2 12z, t2/t3 aus ICON global 06z. Das Manifest lag aber immer unter dem
 * NEUESTEN Lauf. Ergebnis am 2026-09-09: `point/2026090906/` trug 68 Chunks, sein
 * `run.json` nannte nur t2, und die zwölf t3-Chunks waren unauffindbar.
 *
 * Die Verschiebung ist reine Umbenennung — kein Byte im Chunk ändert sich, und der
 * Header behält sein `runHours` aus dem Quell-Lauf. Damit gilt wieder: ein
 * Verzeichnis = eine Veröffentlichung = ein Manifest, und die Aufbewahrung nach
 * Alter löscht ganze, in sich geschlossene Läufe statt halber.
 */
export function placeUnderPublishRun(results, out) {
  const built = results.filter((r) => !r.empty);
  if (built.length === 0) return null;
  const publishRun = built.map((r) => r.run).sort().at(-1);
  for (const r of built) {
    r.sourceRun = r.run;
    if (r.run === publishRun) continue;
    const from = join(out, r.run, r.tier);
    const to = join(out, publishRun, r.tier);
    mkdirSync(dirname(to), { recursive: true });
    if (existsSync(to)) rmSync(to, { recursive: true, force: true });
    renameSync(from, to);
    r.files = r.files.map((f) => ({ ...f, file: f.file.replace(`/${r.run}/`, `/${publishRun}/`) }));
    r.run = publishRun;
    // Das leere Quell-Verzeichnis mitnehmen; ein `point/<lauf>/` ohne Chunks sähe
    // aus wie ein Lauf, der nichts geliefert hat.
    const old = join(out, r.sourceRun);
    if (existsSync(old) && readdirSync(old).length === 0) rmSync(old, { recursive: true, force: true });
    console.log(`  ${r.tier}: Quellen aus ${r.sourceRun}, abgelegt unter ${publishRun}`);
  }
  return publishRun;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseSteps(spec, tier) {
  if (!spec) return tier.leadHours;
  const m = /^(\d+)-(\d+)$/.exec(spec);
  if (m) return tier.leadHours.filter((h) => h >= +m[1] && h <= +m[2]);
  return spec.split(',').map(Number).filter((h) => tier.leadHours.includes(h));
}

async function main() {
  const args = {};
  for (const s of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(s);
    if (m) args[m[1]] = m[2] ?? '1';
  }
  const wanted = (args.tiers && args.tiers !== 'all') ? args.tiers.split(',') : TIERS.map((t) => t.id);
  const only = args.only ? args.only.split(',') : null;
  const out = args.out || OUT;
  resetNetStats();

  const results = [];
  for (const id of wanted) {
    const tier = TIER_BY_ID[id];
    if (!tier) { console.error(`unbekannte Stufe ${id}`); process.exit(1); }
    const steps = parseSteps(args.steps, tier);
    if (steps.length === 0) { console.log(`\n── Stufe ${id}: keine Schritte im gewählten Bereich`); continue; }
    console.log(`\n── Stufe ${tier.id} · ${tier.deg}° · ${tier.ny}×${tier.nx} · ${steps.length} Schritte ${steps[0]}–${steps.at(-1)} h`);
    const r = await buildTier(id, { steps, only, out });
    results.push(r);
    if (r.empty) {
      console.log('  KEINE Quelle lieferbar:');
      for (const [sid, why] of r.skipped) console.log(`    ${sid}: ${why}`);
      continue;
    }
    const byRole = (role) => r.contributors.filter((c) => c.role === role);
  console.log(`  zugeordnet: ${byRole('assigned').map((c) => `${c.id}@${c.run} (${c.leads} Std.)`).join(' · ') || '—'}`);
  // NICHT „nur σ": diese Quellen gehen mit gleichem Gewicht in den Mittelwert (§28).
  if (byRole('diversity').length) console.log(`  zusätzlich gelesen (Mittel + σ): ${byRole('diversity').map((c) => `${c.id}@${c.run} (${c.leads} Std.)`).join(' · ')}`);
    for (const [sid, why] of r.skipped) console.log(`  übersprungen ${sid}: ${why}`);
    console.log(`  ${r.files.length} Chunks · ${(r.bytesTotal / 1048576).toFixed(2)} MiB · Median ${(median(r.files.map((f) => f.bytes)) / 1024).toFixed(1)} KiB`);
    const filled = Object.entries(r.perPlane).filter(([k]) => r.hasData[k]).sort((a, b) => b[1] - a[1]);
    console.log(`  mit Werten (${filled.length}/${CUBE_PLANES.length}): ${filled.map(([k, v]) => `${k} ${(v / 1024).toFixed(0)}`).join(' · ')}`);
    const empty = Object.keys(r.perPlane).filter((k) => !r.hasData[k]);
    if (empty.length) console.log(`  durchgehend MISSING: ${empty.join(', ')}`);
    console.log(`  ms: Felder ${r.ms.fields} · gesamt ${r.ms.total}`);
  }

  const built = results.filter((r) => !r.empty);
  if (built.length) {
    placeUnderPublishRun(results, out);
    const man = runManifest(results);
    const mp = join(out, runManifestPath(man.run).replace(/^point\//, ''));
    mkdirSync(dirname(mp), { recursive: true });
    // ── Nie eine fremde Stufe aus dem Manifest werfen ────────────────────────
    // Am 2026-09-09 in drei getrennten Prozessen gebaut: jeder schrieb sein eigenes
    // `run.json`, der letzte gewann — und die zwölf t3-Chunks lagen im Verzeichnis,
    // ohne im Manifest zu stehen. Ein Chunk ohne Manifest ist Zahlensalat, und ein
    // Manifest, das vorhandene Dateien verschweigt, ist die stille Variante davon.
    if (existsSync(mp)) {
      try {
        const prev = JSON.parse(readFileSync(mp, 'utf8'));
        const mine = new Set(man.tiers.map((t) => t.id));
        const kept = (prev.tiers ?? []).filter((t) => !mine.has(t.id));
        if (kept.length) {
          man.tiers = [...man.tiers, ...kept].sort((a, b) => a.id.localeCompare(b.id));
          const mineSrc = new Set(man.sources.map((x) => `${x.tier}:${x.id}`));
          man.sources = [...man.sources, ...(prev.sources ?? []).filter((x) => !mineSrc.has(`${x.tier}:${x.id}`))];
          console.log(`  Manifest: ${kept.map((t) => t.id).join('+')} aus dem vorigen Lauf übernommen`);
        }
      } catch { /* unlesbares Manifest wird ersetzt, nicht gerettet */ }
    }
    writeFileSync(mp, JSON.stringify(man, null, 2));
    const n = netStats();
    console.log(`\n${built.length} Stufe(n) · ${built.reduce((a, r) => a + r.files.length, 0)} Chunks · ` +
      `${(built.reduce((a, r) => a + r.bytesTotal, 0) / 1048576).toFixed(2)} MiB`);
    console.log(`Netz: ${n.files} Dateien (${(n.bytes / 1048576).toFixed(1)} MiB), ${n.cached} aus dem Cache, ${n.absent} nicht vorhanden`);
    console.log(`Manifest: ${mp}`);
  }
}

if (process.argv[1]?.endsWith('build-point-cube.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
