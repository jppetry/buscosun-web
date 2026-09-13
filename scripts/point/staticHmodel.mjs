/**
 * staticHmodel.mjs — das statische Produkt `point/static/hmodel/` (PD-E, Posten 2).
 *
 * ── Warum es das gibt ───────────────────────────────────────────────────────
 * Der Producer holt und tastet die Modellorographie **je Quelle** ab und mittelt sie
 * dann in die eine Ebene `hModEff` (`runOrography` in `build-point-cube.mjs`). Das ist
 * dieselbe Klasse wie `srcMask → srcCount` (PD-D §1): die Information je Quelle liegt
 * im Speicher und wird vor dem Schreiben weggeworfen.
 *
 * PAP 4 korrigiert `h_true − h_mod_eff`. Welcher Wert dort steht, entscheidet die
 * Höhenkorrektur — und in Stufe 3 ist `hModEff` heute ICON globals HSURF, obwohl ICON
 * global bei 180 h endet und die 156 Stunden danach ausschließlich IFS und AIFS tragen
 * (**V-PD-57**). Sichtbar wird das erst, wenn die Höhen je Quelle nebeneinanderliegen.
 *
 * ── Warum es KEIN Byte Netz kostet ──────────────────────────────────────────
 * Geschrieben wird nur, was `runOrography` ohnehin geholt hat. Einzige Ausnahme ist die
 * abgeleitete ECMWF-Höhe (`orographyDerived`, ~2,6 MiB je Lauf und Stufe), ohne die das
 * Produkt in t3 genau eine Spalte hätte.
 *
 * ── „nicht pro Lauf neu schreiben" (Jans Vorgabe) ──────────────────────────
 * HSURF ändert sich mit einem Modell-Upgrade, also selten und ohne Ankündigung im
 * Dateinamen. Ein Produkt, das nie wieder hinsieht, wäre nach dem nächsten Upgrade stumm
 * falsch. Deshalb: hashen, vergleichen, nur bei Unterschied schreiben — und die Änderung
 * BENENNEN. Der Vergleich kostet Millisekunden.
 *
 * ── Form ────────────────────────────────────────────────────────────────────
 *   point/static/hmodel/v1/static.json      Ebenenliste je Stufe = Bedeutung der Spalten
 *   point/static/hmodel/v1/<tier>/<cy>_<cx>.bin
 *
 * Derselbe BSPC-Container mit eigener Ebenenliste (eine Ebene je Quelle, `nt = 1`) und
 * **demselben Chunk-Raster wie der Cube**: ein Client, der für seinen Punkt ohnehin
 * `(cy, cx)` liest, holt die Modellhöhen aus derselben Kachel.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  CHUNK_CELLS, MISSING, TIER_BY_ID, chunkExtent, encodeCubeChunk, quantize,
  staticChunkPath, staticManifestPath, HMODEL_PRODUCT, HMODEL_VERSION,
} from '../../src/point/cubeFormat.ts';

/**
 * Ebenenmeta einer Höhenspalte. Dieselbe Skala wie `hModEff` (1 m) — wer beide
 * vergleicht, vergleicht dann auch dieselbe Quantisierung und nicht zwei Raster.
 */
export const HMODEL_PLANE_META = Object.freeze({ unit: 'm', scale: 1, offset: 0, range: [-500, 9000] });

/**
 * ── Die Pfadregel, die der Producer schon hat ──────────────────────────────
 *
 * `POINT_OUT` IST das `point/`-Verzeichnis (lokal `data/point`, im Cron das ausgecheckte
 * `point/` des Daten-Repos). Alle Pfadbauer in `cubeFormat.ts` liefern dagegen Pfade
 * RELATIV ZUR REPO-WURZEL, also mit `point/` davor. `build-point-cube.mjs` streift es
 * mit `inOut()`; dieses Modul muss dieselbe Regel anwenden, sonst schreibt es nach
 * `point/point/static/`.
 *
 * ⚠ Genau das ist beim ersten echten Bau passiert. Aufgefallen ist es nicht am Fehler
 * (es gab keinen — die Datei wurde ja geschrieben), sondern daran, dass die Gegenprobe
 * die Cube-Chunks an einer anderen Stelle suchte als das statische Produkt lag.
 */
function inPointDir(outRoot, rel) {
  return join(outRoot, rel.replace(/^point\//, ''));
}

/** Der Fingerabdruck einer Spalte — über die QUANTISIERTEN Werte, also über das, was im Chunk landet. */
function columnHash(q) {
  return createHash('sha256').update(Buffer.from(q.buffer, q.byteOffset, q.byteLength)).digest('hex').slice(0, 16);
}

/**
 * Eine Höhenspalte auf das Stufengitter quantisieren. `NaN` (Quelle deckt die Zelle
 * nicht) wird MISSING — nicht 0: „keine Modellhöhe" ist nicht „Meeresspiegel".
 */
function quantizeColumn(grid, cells) {
  const out = new Int16Array(cells).fill(MISSING);
  for (let k = 0; k < cells; k++) {
    const v = grid[k];
    if (Number.isFinite(v)) out[k] = quantize(v, HMODEL_PLANE_META);
  }
  return out;
}

/** `static.json` lesen — fehlt es, ist das kein Fehler, sondern der erste Lauf. */
export function readStaticManifest(outRoot) {
  const p = inPointDir(outRoot, staticManifestPath(HMODEL_PRODUCT, HMODEL_VERSION));
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * Das Produkt für EINE Stufe schreiben — oder feststellen, dass es unverändert ist.
 *
 * @param {string} outRoot   Ausgabewurzel (der ausgecheckte Datenbaum).
 * @param {string} tierId
 * @param {Array<{ id: string, provenance: string, note?: string, grid: Float32Array }>} columns
 *   Eine Spalte je Quelle, in stabiler Reihenfolge (Beiträger-Ordnung der Stufe).
 * @param {object} ctx  `{ run, absent }` — `absent` ist Quelle → Grund für die, die keine hat.
 * @returns {Promise<{ changed: boolean, planes: string[], chunks: number, bytes: number, reason: string }>}
 */
export async function writeStaticHmodel(outRoot, tierId, columns, ctx = {}) {
  const tier = TIER_BY_ID[tierId];
  if (!tier) throw new Error(`staticHmodel: unbekannte Stufe ${tierId}`);
  const cells = tier.ny * tier.nx;

  if (columns.length === 0) {
    return { changed: false, planes: [], chunks: 0, bytes: 0, reason: 'keine Quelle mit Modellorographie' };
  }

  const quant = columns.map((c) => quantizeColumn(c.grid, cells));
  const planes = columns.map((c, i) => ({
    id: c.id,
    provenance: c.provenance,
    note: c.note ?? null,
    unit: HMODEL_PLANE_META.unit,
    scale: HMODEL_PLANE_META.scale,
    offset: HMODEL_PLANE_META.offset,
    hash: columnHash(quant[i]),
    // Die zwei Zahlen, die einen Rechenfehler sofort zeigen: eine Modellhöhe über DACH
    // liegt zwischen dem Meeresspiegel und ~3 000 m, und sie deckt nicht jede Zelle.
    covered: quant[i].reduce((n, v) => n + (v === MISSING ? 0 : 1), 0),
    minM: quant[i].reduce((m, v) => (v === MISSING ? m : Math.min(m, v)), Infinity),
    maxM: quant[i].reduce((m, v) => (v === MISSING ? m : Math.max(m, v)), -Infinity),
  }));
  for (const p of planes) {
    if (!Number.isFinite(p.minM)) { p.minM = null; p.maxM = null; }
  }

  // ── Unverändert? Dann wird NICHTS geschrieben (Jans Vorgabe) ───────────────
  const prev = readStaticManifest(outRoot);
  const prevTier = prev?.tiers?.[tierId] ?? null;
  const same = prevTier
    && prevTier.planes?.length === planes.length
    && prevTier.planes.every((q, i) => q.id === planes[i].id && q.hash === planes[i].hash);
  if (same) {
    return { changed: false, planes: planes.map((p) => p.id), chunks: prevTier.chunks ?? 0,
      bytes: prevTier.bytes ?? 0, reason: 'unverändert (Hash je Spalte gleich)' };
  }

  // ── Chunks schreiben, gleiches Raster wie der Cube ────────────────────────
  let bytes = 0, chunks = 0;
  for (let cy = 0; cy < tier.chunk.cy; cy++) {
    for (let cx = 0; cx < tier.chunk.cx; cx++) {
      const ext = chunkExtent(tier, cy, cx);
      const cut = quant.map((src) => {
        const out = new Int16Array(ext.ny * ext.nx);
        let w = 0;
        for (let ry = 0; ry < ext.ny; ry++) {
          const row = (ext.y0 + ry) * tier.nx + ext.x0;
          for (let rx = 0; rx < ext.nx; rx++) out[w++] = src[row + rx];
        }
        return out;
      });
      const buf = await encodeCubeChunk(
        // `runHours` = 0: das Produkt gehört zu KEINEM Lauf. Eine Laufzeit hier wäre die
        // Einladung, es wie einen Lauf zu behandeln und nach 24 h zu löschen.
        { runHours: 0, tierIndex: tier.index, nt: 1, y0: ext.y0, x0: ext.x0, ny: ext.ny, nx: ext.nx, planes: cut },
        undefined,
        planes,
      );
      const rel = staticChunkPath(HMODEL_PRODUCT, HMODEL_VERSION, tierId, cy, cx);
      const abs = inPointDir(outRoot, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, buf);
      bytes += buf.length;
      chunks++;
    }
  }

  // ── `static.json` MERGEN, nicht ersetzen ──────────────────────────────────
  // Seit PD-F3b baut je Job nur EINE Stufe. Ein Ersetzen löschte die Spalten der beiden
  // anderen Stufen aus dem Manifest, während ihre Chunks liegen blieben — genau die
  // Sorte Waise, gegen die der Publisher seinen Wächter hat.
  const man = prev && prev.product === HMODEL_PRODUCT ? prev : {
    product: HMODEL_PRODUCT,
    version: HMODEL_VERSION,
    kind: 'static',
    what: 'Modellorographie (h_model) je Quelle und Stufe, auf dem Cube-Gitter abgetastet.',
    why: 'PAP 4 korrigiert h_true − h_mod_eff. Der Cube trägt nur das MITTEL (hModEff); '
      + 'welche Quelle welche Höhe annimmt, war bis PD-E nicht lesbar.',
    container: 'BSPC wie der Cube, eigene Ebenenliste (eine Ebene je Quelle), nt = 1, gleiches Chunk-Raster.',
    chunkCells: CHUNK_CELLS,
    provenanceKinds: {
      native: 'Vom Modellbetreiber als HSURF veröffentlicht.',
      'derived-gh-sp': 'Abgeleitet: gh (geopotentielle Höhe der Druckflächen) interpoliert in ln p '
        + 'an der Stelle p = sp (Bodendruck). ECMWF veröffentlicht keine Orographie. '
        + 'Geht NICHT in hModEff ein (E-E-5) — sie steht hier, damit die Differenz sichtbar ist.',
    },
    timeless: 'point/static/ ist von der Aufbewahrung ausgenommen (TIMELESS_PATHS).',
    tiers: {},
  };
  man.tiers[tierId] = {
    planes, chunks, bytes,
    cy: tier.chunk.cy, cx: tier.chunk.cx, ny: tier.ny, nx: tier.nx, deg: tier.deg,
    builtFrom: ctx.run ?? null,
    builtAt: new Date().toISOString(),
    absent: ctx.absent ?? {},
  };
  man.updatedAt = new Date().toISOString();
  const mp = inPointDir(outRoot, staticManifestPath(HMODEL_PRODUCT, HMODEL_VERSION));
  mkdirSync(dirname(mp), { recursive: true });
  writeFileSync(mp, `${JSON.stringify(man, null, 2)}\n`);

  return {
    changed: true, planes: planes.map((p) => p.id), chunks, bytes,
    reason: prevTier ? 'Spalten haben sich geändert (Modell-Upgrade?)' : 'erstmals gebaut',
  };
}

/** Netzfreier Selbsttest — Rundweg über den echten Container. */
export async function staticHmodelSelfTest() {
  const { decodeCubeChunk, dequantize } = await import('../../src/point/cubeFormat.ts');
  const out = [];
  const add = (name, ok) => out.push({ name, ok });

  const tier = TIER_BY_ID.t3;
  const cells = tier.ny * tier.nx;
  const a = new Float32Array(cells);
  const b = new Float32Array(cells);
  for (let k = 0; k < cells; k++) { a[k] = 100 + (k % 900); b[k] = k % 7 === 0 ? NaN : 120 + (k % 900); }

  const qa = quantizeColumn(a, cells);
  const qb = quantizeColumn(b, cells);
  add('NaN wird MISSING, nicht 0', qb[0] === MISSING && qa[0] !== MISSING);
  add('Hash ist stabil', columnHash(qa) === columnHash(quantizeColumn(a, cells)));
  add('Hash unterscheidet Spalten', columnHash(qa) !== columnHash(qb));

  const ext = chunkExtent(tier, 1, 1);
  const cut = [qa, qb].map((src) => {
    const o = new Int16Array(ext.ny * ext.nx);
    let w = 0;
    for (let ry = 0; ry < ext.ny; ry++) {
      const row = (ext.y0 + ry) * tier.nx + ext.x0;
      for (let rx = 0; rx < ext.nx; rx++) o[w++] = src[row + rx];
    }
    return o;
  });
  const planes = [{ id: 'icon_global' }, { id: 'ifs_hres' }];
  const buf = await encodeCubeChunk(
    { runHours: 0, tierIndex: tier.index, nt: 1, y0: ext.y0, x0: ext.x0, ny: ext.ny, nx: ext.nx, planes: cut },
    undefined, planes,
  );
  const back = await decodeCubeChunk(buf, { planes });
  add('Rundweg: zwei Spalten zurück', back.planes.length === 2 && back.nvar === 2);
  add('Rundweg: nt = 1', back.nt === 1);
  let worst = 0;
  for (let i = 0; i < cut[0].length; i++) {
    if (cut[0][i] === MISSING) continue;
    worst = Math.max(worst, Math.abs(dequantize(back.planes[0][i], HMODEL_PLANE_META)
      - dequantize(cut[0][i], HMODEL_PLANE_META)));
  }
  add('Rundweg: Werte unverändert', worst === 0);

  // Gegenprobe: mit der FALSCHEN Ebenenzahl gelesen muss es laut krachen, nicht still
  // verschobene Spalten liefern.
  let threw = false;
  try { await decodeCubeChunk(buf, { planes: [{ id: 'nur_eine' }] }); } catch { threw = true; }
  add('Gegenprobe: falsche Ebenenliste bricht ab', threw);

  return { pass: out.filter((o) => o.ok).length, total: out.length, fails: out.filter((o) => !o.ok).map((o) => o.name) };
}
