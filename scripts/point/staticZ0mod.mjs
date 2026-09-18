/**
 * staticZ0mod.mjs — das statische Produkt `point/static/z0mod/` (AP17, E-F-15, V-FI-58).
 *
 * ── Warum es das gibt ───────────────────────────────────────────────────────
 * Die zweistufige Windkorrektur von PAP 5 (`windBlendingFactor`) bringt den 10-m-Wind vom
 * Modellboden (z0 des MODELLS) über die Blending-Höhe auf den echten Boden (z0 am Punkt, WorldCover).
 * Bis AP17 stand für z0 des Modells eine WorldCover-Näherung (Box um den Punkt bzw. um die Zelle,
 * V-FI-65) — ICON-D2, ICON-EU, ICON global und ICON-CH1/-CH2 veröffentlichen z0 aber selbst.
 *
 * ── Was am 2026-09-18 gemessen wurde (audit/fusion-vollform.md §9.5.1) ──────
 *   - Kein Orographie-Anteil (RV12): z0 fällt über 2 500 m Modellhöhe auf p50 0,06 m (Fels, Eis,
 *     alpine Wiese); bei ICON-CH1 hängt es über 1 500 m nicht von SSO_STDH ab (Spearman 0,08).
 *   - Über Land ist z0 INNERHALB eines Laufs konstant (ICON-D2 +12/+24 h: ≤ 0,44 % der Punkte > 1 %),
 *     zwischen zwei Läufen aber an 16 % der reinen Landpunkte um > 10 % verschieden, auch bei gleicher
 *     Gültigzeit — eine Größe JE LAUF. Über Wasser ändert es sich mit jedem Schritt (Charnock, V-FI-73).
 *   - Für den Windfaktor sind 10 % z0 ≈ 1 %. Ein Schnappschuss je Stufe genügt — solange der Neubau
 *     nicht auf dieses Rauschen anspringt (s. `Z0MOD_REWRITE`).
 *
 * ── Form ────────────────────────────────────────────────────────────────────
 *   point/static/z0mod/v1/static.json      Spalten je Stufe (eine je Quelle mit z0), `absent` = die
 *                                          Windquellen der Stufe OHNE z0, mit Grund
 *   point/static/z0mod/v1/<tier>/<cy>_<cx>.bin
 * Derselbe BSPC-Container wie `hmodel` (eigene Ebenenliste, `nt = 1`, `runHours = 0`, gleiches
 * Chunk-Raster wie der Cube). Wert = ln(z0 / 1 m) mit Skala 0,001 (0,1 %); z0 = exp(Wert).
 *
 * ── Aggregation ─────────────────────────────────────────────────────────────
 * ln-Blockmittel der Quellpunkte je Cube-Zelle (= geometrisches Mittel von z0): regulär über dieselbe
 * Zuordnung wie die Felder (`sampleRegularToTier`), ikosaedrisch über die gerundete Zellkoordinate —
 * NICHT der nächste Nachbar (ICON-CH1 legt ~25 Punkte in eine t1-Zelle). Lücken ≤ 3 Zellen aus dem
 * nächsten Nachbarn (`fillNearest`), danach die Domänenmaske der Quelle (`applyMask` im Producer).
 *
 * ── Eingeschaltet nur mit `POINT_Z0MOD=1` (Jans Gate) ────────────────────────
 * Ohne die Variable ruft der Producer hier nichts auf: kein Abruf, kein Schlüssel `z0mod` in run.json,
 * die Chunks des Cubes byte-gleich. `POINT_STATIC=0` schaltet es mit `hmodel` zusammen ab.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  CHUNK_CELLS, MISSING, TIER_BY_ID, chunkExtent, encodeCubeChunk, decodeCubeChunk, planeOffset, quantize,
  staticChunkPath, staticManifestPath, Z0MOD_PRODUCT, Z0MOD_VERSION,
} from '../../src/point/cubeFormat.ts';
import { sampleRegularToTier, fillNearest } from './adapters/sample.mjs';

/** Ebenenmeta einer z0-Spalte: ln(z0 / 1 m), 0,001 je Stufe ⇒ 0,1 % Auflösung; −14 … 3 deckt 1e-6 … 20 m. */
export const Z0MOD_PLANE_META = Object.freeze({ unit: 'ln(m)', scale: 0.001, offset: 0, range: [-14, 3] });

/**
 * Wann neu geschrieben wird (alles `set`, AP17):
 *   - erster Bau, eine neue Spalte, oder ein neuer Kalendermonat (UTC) seit dem letzten Bau (Schnee,
 *     Blattfläche — V-FI-73, RV9);
 *   - sonst nur bei STOFFLICHER Änderung: in einer Spalte haben mehr als `share` der Landzellen (beide
 *     Fassungen z0 > `landMinM`) |Δ ln z0| > `lnAbs` (Faktor 1,65 ≈ 5 % Windfaktor). Wasserzellen zählen
 *     nicht (Charnock ändert sich mit jedem Schritt), das Lauf-Rauschen über Land (16 % > 10 %) auch nicht.
 * Nie geschrieben wird, wenn eine vorhandene Spalte in diesem Lauf fehlt oder Zellen verliert — eine
 * Spalte fällt nie still weg (die alte Fassung bleibt stehen, der Grund steht in run.json).
 */
export const Z0MOD_REWRITE = Object.freeze({ lnAbs: 0.5, share: 0.01, landMinM: 0.01 });

/** Schalter: nur `POINT_Z0MOD=1` baut das Produkt; `POINT_STATIC=0` schaltet es mit `hmodel` ab. */
export function z0modEnabled(env = process.env) {
  return env.POINT_Z0MOD === '1' && env.POINT_STATIC !== '0';
}

/** Warum eine Windquelle kein z0 hat — gemessen, nicht angenommen (§9.5.1). */
export const Z0_ABSENT_REASON = Object.freeze({
  ifs_hres: 'ECMWF Open Data führt kein Rauhigkeitsfeld (Parameterliste 0/24/144 h, bei 0 h nur lsm/sdor/slor; V-FI-72) — der Client nimmt die WorldCover-Näherung',
  aifs_single: 'ECMWF Open Data führt kein Rauhigkeitsfeld (V-FI-72) — der Client nimmt die WorldCover-Näherung',
  aicon: 'AICON (KI-Emulator) veröffentlicht kein z0; ICON globals z0 zu unterstellen wäre eine Annahme (wie bei HSURF) — der Client nimmt die WorldCover-Näherung',
  claef: 'GeoSphere nwp-v2-1h-1km führt kein z0 (16 Parameter, /metadata am 2026-09-18 gelesen) — der Client nimmt die WorldCover-Näherung',
});
export function z0AbsentReason(id) {
  return Z0_ABSENT_REASON[id] ?? 'keine Rauhigkeitslänge über den Adapter erreichbar — der Client nimmt die WorldCover-Näherung';
}

/** Trägt die Quelle den Mittelwert des Winds? (Reine σ_ens- und Quantil-Quellen haben `vars: []`.) */
export function carriesWindMean(adapter) {
  return Array.isArray(adapter?.vars) && adapter.vars.includes('u10');
}

const lnOf = (v) => (Number.isFinite(v) && v > 0 ? Math.log(v) : NaN);

/**
 * Die Spalten einer Stufe einsammeln — die EINE Fassung für den Producer (`runRoughness`) und den lokalen Probebau.
 * `contributors` = die Beiträger der Stufe (`{ id, run, adapter, mask?, dropped? }`). Nur Quellen, die den Mittelwert
 * des Winds tragen; ein Fehler zählt NICHT gegen `SRC_MAX_ERRORS` (kein `safeCall`): eine fehlende Rauhigkeit darf
 * keine Quelle aus dem Mittel werfen.
 * @returns {Promise<{ columns: Array<{ id: string, run: string, grid: Float32Array, note: string }>, absent: Record<string,string>, missing: Record<string,string> }>}
 */
export async function collectZ0mod(contributors, tier) {
  const columns = [];
  const absent = {};
  const missing = {};
  for (const c of contributors) {
    if (c.dropped || !carriesWindMean(c.adapter)) continue;
    if (typeof c.adapter.roughness !== 'function') { absent[c.id] = z0AbsentReason(c.id); continue; }
    let g = null;
    try { g = await c.adapter.roughness(c.run, tier); } catch (e) { missing[c.id] = `Abruf gescheitert: ${e.message}`; continue; }
    // `null`: bei einer Quelle ohne z0 (AICON) benannt abwesend; bei einer mit z0-Weg ein Ausfall dieses Laufs.
    if (!g) { if (Z0_ABSENT_REASON[c.id]) absent[c.id] = Z0_ABSENT_REASON[c.id]; else missing[c.id] = 'kein z0 geliefert (Datei fehlt oder leer)'; continue; }
    // Domäne der Quelle wie bei den Feldern (`applyMask` im Producer): außerhalb NaN ⇒ MISSING.
    if (c.mask) { const m = c.mask; g = Float32Array.from(g, (v, k) => (m[k] ? v : NaN)); }
    columns.push({ id: c.id, run: c.run, grid: g, note: `Schritt 000 des Laufs ${c.run}` });
  }
  return { columns, absent, missing };
}

/** Reguläres GRIB-Feld (z0 in m) → ln-Blockmittel je Zelle der Stufe. Nicht-positive Werte zählen nicht. */
export function lnBlockMeanRegular(field, tier) {
  const values = new Float32Array(field.values.length);
  for (let k = 0; k < values.length; k++) values[k] = lnOf(field.values[k]);
  return sampleRegularToTier({ ...field, values }, tier);
}

/** Unstrukturiertes Feld (z0 in m, Zellkoordinaten in Grad) → ln-Blockmittel je Zelle der Stufe. */
export function lnBlockMeanUnstructured(values, lat, lon, tier, { fillGaps = true } = {}) {
  const n = tier.ny * tier.nx;
  const sum = new Float64Array(n);
  const cnt = new Int32Array(n);
  for (let c = 0; c < values.length; c++) {
    const v = lnOf(values[c]);
    if (!Number.isFinite(v)) continue;
    let lo = lon[c];
    if (lo > 180) lo -= 360;
    const iy = Math.round((lat[c] - tier.lat0) / tier.deg);
    const ix = Math.round((lo - tier.lon0) / tier.deg);
    if (iy < 0 || iy >= tier.ny || ix < 0 || ix >= tier.nx) continue;
    sum[iy * tier.nx + ix] += v;
    cnt[iy * tier.nx + ix]++;
  }
  const out = new Float32Array(n).fill(NaN);
  for (let k = 0; k < n; k++) if (cnt[k] > 0) out[k] = sum[k] / cnt[k];
  return fillGaps ? fillNearest(out, tier) : out;
}

/** Wie in `staticHmodel.mjs`: POINT_OUT IST das point/-Verzeichnis, die Pfadbauer liefern `point/…`. */
function inPointDir(outRoot, rel) {
  return join(outRoot, rel.replace(/^point\//, ''));
}

/** Fingerabdruck über die QUANTISIERTEN Werte — dieselbe Regel wie `hmodel`. */
function columnHash(q) {
  return createHash('sha256').update(Buffer.from(q.buffer, q.byteOffset, q.byteLength)).digest('hex').slice(0, 16);
}

/** ln-Spalte → int16 auf dem Stufengitter; `NaN` (Quelle deckt die Zelle nicht) wird MISSING, nie 0 (= 1 m). */
function quantizeColumn(grid, cells) {
  const out = new Int16Array(cells).fill(MISSING);
  for (let k = 0; k < cells; k++) {
    const v = grid[k];
    if (Number.isFinite(v)) out[k] = quantize(v, Z0MOD_PLANE_META);
  }
  return out;
}

/** `static.json` lesen — fehlt es, ist das der erste Lauf. */
export function readZ0modManifest(outRoot) {
  const p = inPointDir(outRoot, staticManifestPath(Z0MOD_PRODUCT, Z0MOD_VERSION));
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/** Die vorige Fassung einer Stufe als volle Spalten (id → Int16Array) — `null`, wenn ein Chunk fehlt oder nicht lesbar ist. */
async function readTierColumns(outRoot, tierId, prevTier) {
  const tier = TIER_BY_ID[tierId];
  const planes = prevTier?.planes ?? [];
  if (!planes.length) return null;
  const cols = planes.map(() => new Int16Array(tier.ny * tier.nx).fill(MISSING));
  for (let cy = 0; cy < tier.chunk.cy; cy++) {
    for (let cx = 0; cx < tier.chunk.cx; cx++) {
      const abs = inPointDir(outRoot, staticChunkPath(Z0MOD_PRODUCT, Z0MOD_VERSION, tierId, cy, cx));
      if (!existsSync(abs)) return null;
      let ch;
      try { ch = await decodeCubeChunk(new Uint8Array(readFileSync(abs)), { planes }); } catch { return null; }
      for (let pi = 0; pi < planes.length; pi++) {
        for (let ry = 0; ry < ch.ny; ry++) {
          for (let rx = 0; rx < ch.nx; rx++) cols[pi][(ch.y0 + ry) * tier.nx + ch.x0 + rx] = ch.planes[pi][planeOffset(ch, 0, ry, rx)];
        }
      }
    }
  }
  return new Map(planes.map((p, i) => [p.id, cols[i]]));
}

const monthOf = (ms) => { const d = new Date(ms); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };

/**
 * Die Neubau-Entscheidung — rein (Verifier). `ids`/`quant` = die Spalten dieses Laufs, `prevQuant` = die vorige
 * Fassung (id → Int16Array) oder `null`, `prevTier` = ihr Eintrag in `static.json`.
 * @returns {{ write: boolean, reason: string, stats: Array<{ id: string, land: number, big: number, share: number, gained: number, lost: number }> }}
 */
export function decideZ0modRewrite({ prevTier, prevQuant, ids, quant, nowMs, rule = Z0MOD_REWRITE }) {
  if (!prevTier) {
    return ids.length ? { write: true, reason: 'erstmals gebaut', stats: [] } : { write: false, reason: 'keine Quelle mit z0 in dieser Stufe', stats: [] };
  }
  const prevIds = (prevTier.planes ?? []).map((p) => p.id);
  const lostCols = prevIds.filter((id) => !ids.includes(id));
  if (lostCols.length) {
    return { write: false, reason: `unverändert gelassen: ${lostCols.join(', ')} lieferte in diesem Lauf kein z0 (eine Spalte fällt nie still weg)`, stats: [] };
  }
  const added = ids.filter((id) => !prevIds.includes(id));
  if (added.length) return { write: true, reason: `Spalte(n) hinzugekommen: ${added.join(', ')}`, stats: [] };
  const builtMs = Date.parse(prevTier.builtAt ?? '');
  if (!Number.isFinite(builtMs) || monthOf(nowMs) > monthOf(builtMs)) {
    return { write: true, reason: `Monatsauffrischung (letzter Bau ${prevTier.builtAt ?? 'unbekannt'}) — Schnee und Blattfläche ändern z0 über Land (V-FI-73, RV9)`, stats: [] };
  }
  if (!prevQuant) return { write: true, reason: 'vorige Fassung nicht lesbar (Chunk fehlt oder kaputt) — neu geschrieben', stats: [] };
  const landMinQ = Math.log(rule.landMinM) / Z0MOD_PLANE_META.scale;
  const thrQ = rule.lnAbs / Z0MOD_PLANE_META.scale;
  const stats = [];
  for (let i = 0; i < ids.length; i++) {
    const a = prevQuant.get(ids[i]);
    const b = quant[i];
    if (!a) return { write: true, reason: `Spalte ${ids[i]}: vorige Fassung nicht lesbar — neu geschrieben`, stats };
    let land = 0, big = 0, gained = 0, lost = 0;
    for (let k = 0; k < b.length; k++) {
      const qa = a[k], qb = b[k];
      if (qa === MISSING) { if (qb !== MISSING) gained++; continue; }
      if (qb === MISSING) { lost++; continue; }
      if (qa <= landMinQ || qb <= landMinQ) continue;
      land++;
      if (Math.abs(qa - qb) > thrQ) big++;
    }
    stats.push({ id: ids[i], land, big, share: land ? big / land : 0, gained, lost });
  }
  const shrunk = stats.find((s) => s.lost > 0);
  if (shrunk) return { write: false, reason: `unverändert gelassen: ${shrunk.id} deckt in diesem Lauf ${shrunk.lost} Zelle(n) weniger (Teilausfall?)`, stats };
  const grew = stats.find((s) => s.gained > 0);
  if (grew) return { write: true, reason: `Spalte ${grew.id}: Deckung um ${grew.gained} Zelle(n) gewachsen`, stats };
  const worst = stats.reduce((m, s) => (s.share > m.share ? s : m), { id: '—', share: 0 });
  const f = Math.exp(rule.lnAbs).toFixed(2).replace('.', ',');
  if (worst.share > rule.share) {
    return { write: true, reason: `Spalte ${worst.id}: ${(100 * worst.share).toFixed(1).replace('.', ',')} % der Landzellen um mehr als Faktor ${f} geändert — Modell-Upgrade, externe Parameter oder Schnee`, stats };
  }
  return { write: false, reason: `unverändert innerhalb der Toleranz (höchstens ${(100 * worst.share).toFixed(2).replace('.', ',')} % der Landzellen über Faktor ${f}; Neubau ab ${(100 * rule.share).toFixed(0)} % oder monatlich)`, stats };
}

/**
 * Das Produkt für EINE Stufe schreiben — oder begründet stehen lassen.
 *
 * @param {string} outRoot   der ausgecheckte `point/`-Baum (POINT_OUT)
 * @param {string} tierId
 * @param {Array<{ id: string, grid: Float32Array, run?: string, note?: string }>} columns  ln(z0) je Zelle, eine Spalte je Quelle
 * @param {{ absent?: Record<string,string>, missing?: Record<string,string>, nowMs?: number }} ctx
 *   `absent` = Windquellen der Stufe ohne z0 (Grund), `missing` = Quellen mit z0-Weg, die in diesem Lauf nichts lieferten.
 */
export async function writeStaticZ0mod(outRoot, tierId, columns, ctx = {}) {
  const tier = TIER_BY_ID[tierId];
  if (!tier) throw new Error(`staticZ0mod: unbekannte Stufe ${tierId}`);
  const cells = tier.ny * tier.nx;
  const nowMs = ctx.nowMs ?? Date.now();
  const absent = ctx.absent ?? {};
  const missing = ctx.missing ?? {};
  const prev = readZ0modManifest(outRoot);
  const prevTier = prev?.product === Z0MOD_PRODUCT ? prev.tiers?.[tierId] ?? null : null;
  const quant = columns.map((c) => quantizeColumn(c.grid, cells));
  const ids = columns.map((c) => c.id);
  const prevQuant = prevTier ? await readTierColumns(outRoot, tierId, prevTier) : null;
  const decision = decideZ0modRewrite({ prevTier, prevQuant, ids, quant, nowMs });
  const check = decision.stats.map((s) => ({ id: s.id, landCells: s.land, changedCells: s.big, share: Math.round(s.share * 1e4) / 1e4, gained: s.gained, lost: s.lost }));
  if (!decision.write) {
    return { changed: false, planes: ids, chunks: prevTier?.chunks ?? 0, bytes: prevTier?.bytes ?? 0, reason: decision.reason, check, absent, missing };
  }

  const expSig = (q) => Number(Math.exp(q * Z0MOD_PLANE_META.scale).toPrecision(4));
  const planes = columns.map((c, i) => {
    let lo = Infinity, hi = -Infinity, covered = 0;
    for (const v of quant[i]) { if (v === MISSING) continue; covered++; if (v < lo) lo = v; if (v > hi) hi = v; }
    return {
      id: c.id, provenance: 'native', note: c.note ?? null,
      unit: Z0MOD_PLANE_META.unit, scale: Z0MOD_PLANE_META.scale, offset: Z0MOD_PLANE_META.offset,
      hash: columnHash(quant[i]), covered,
      // In Metern (z0 = exp(Wert)) — die Zahlen, die einen Rechenfehler sofort zeigen: z0 über DACH liegt zwischen
      // ~1e-5 (Meer, Charnock) und ~1,5 m (Wald, Stadt).
      minM: covered ? expSig(lo) : null, maxM: covered ? expSig(hi) : null,
      run: c.run ?? null,
    };
  });

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
      // `runHours` = 0 wie bei `hmodel`: das Produkt gehört zu keinem Lauf (die Aufbewahrung darf es nie anfassen).
      const buf = await encodeCubeChunk({ runHours: 0, tierIndex: tier.index, nt: 1, y0: ext.y0, x0: ext.x0, ny: ext.ny, nx: ext.nx, planes: cut }, undefined, planes);
      const abs = inPointDir(outRoot, staticChunkPath(Z0MOD_PRODUCT, Z0MOD_VERSION, tierId, cy, cx));
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, buf);
      bytes += buf.length;
      chunks++;
    }
  }

  // `static.json` MERGEN (je Job baut nur EINE Stufe — wie `hmodel`). Geschrieben nur zusammen mit den Chunks:
  // ein Prüfstempel je Lauf hier ließe die Datei achtmal am Tag neu entstehen (und gepurgt werden); das
  // Prüfergebnis jedes Laufs steht in run.json (`tiers[].z0mod`).
  const man = prev && prev.product === Z0MOD_PRODUCT ? prev : {
    product: Z0MOD_PRODUCT,
    version: Z0MOD_VERSION,
    kind: 'static',
    what: 'Rauhigkeitslänge z0 der Modelle je Quelle und Stufe (GRIB, Schritt 000), als ln(z0) auf dem Cube-Gitter.',
    why: 'PAP 5 (zweistufige Windkorrektur) braucht z0 des MODELLS; bis AP17 stand dort eine WorldCover-Näherung (V-FI-58).',
    container: 'BSPC wie der Cube, eigene Ebenenliste (eine Ebene je Quelle), nt = 1, gleiches Chunk-Raster.',
    value: 'ln(z0 / 1 m), Skala 0,001 — z0 = exp(Wert).',
    aggregation: 'ln-Blockmittel (geometrisches Mittel) der Quellpunkte je Cube-Zelle: regulär über die Zuordnung der Felder, '
      + 'ikosaedrisch über die gerundete Zellkoordinate; Lücken ≤ 3 Zellen aus dem nächsten Nachbarn; Domänenmaske der Quelle.',
    snapshot: 'Schritt 000 des Laufs der Quelle. Über Land innerhalb eines Laufs konstant, zwischen zwei Läufen an 16 % der '
      + 'Landpunkte um > 10 % verschieden (≈ 1 % im Windfaktor); über Wasser je Schritt (Charnock) — der Schnappschuss ist benannt.',
    orography: 'Kein Orographie-Anteil (AP17 gemessen: z0 fällt über 2 500 m auf p50 0,06 m; ICON-CH1 über 1 500 m unabhängig von SSO_STDH).',
    rewrite: { ...Z0MOD_REWRITE, rule: 'erster Bau, neue Spalte, neuer Monat (UTC) oder > share der Landzellen (z0 > landMinM) mit |Δ ln z0| > lnAbs; nie bei fehlender Spalte oder schrumpfender Deckung' },
    provenanceKinds: { native: 'Vom Modellbetreiber als z0 (ICON-D2) bzw. Z0 (ICON-EU, ICON global, ICON-CH1/-CH2) veröffentlicht.' },
    windSources: 'Spalten ∪ `absent` je Stufe = die Quellen, die den Mittelwert des Winds tragen; `absent` nennt, warum eine davon kein z0 hat.',
    chunkCells: CHUNK_CELLS,
    timeless: 'point/static/ ist von der Aufbewahrung ausgenommen (TIMELESS_PATHS).',
    tiers: {},
  };
  const prevById = new Map((prevTier?.planes ?? []).map((q) => [q.id, q]));
  man.tiers[tierId] = {
    planes, chunks, bytes,
    cy: tier.chunk.cy, cx: tier.chunk.cx, ny: tier.ny, nx: tier.nx, deg: tier.deg,
    builtAt: new Date(nowMs).toISOString(),
    reason: decision.reason,
    absent,
    diffFromPrev: prevTier ? {
      builtAtPrev: prevTier.builtAt ?? null,
      columns: planes.map((p) => { const q = prevById.get(p.id); return { id: p.id, kind: !q ? 'added' : q.hash === p.hash ? 'same' : 'changed', ...(q ? { prevHash: q.hash } : {}), hash: p.hash }; }),
    } : null,
  };
  man.updatedAt = new Date(nowMs).toISOString();
  const mp = inPointDir(outRoot, staticManifestPath(Z0MOD_PRODUCT, Z0MOD_VERSION));
  mkdirSync(dirname(mp), { recursive: true });
  writeFileSync(mp, `${JSON.stringify(man, null, 2)}\n`);
  return { changed: true, planes: ids, chunks, bytes, reason: decision.reason, check, absent, missing };
}

/** Netzfreier Selbsttest (verify:point-data (3az)). */
export async function staticZ0modSelfTest() {
  const { mkdtempSync, rmSync, statSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const out = [];
  const add = (name, ok, detail) => out.push({ name, ok: !!ok, detail });
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  // 1) ln-Blockmittel regulär: zwei Quellpunkte 0,01 m und 1 m in einer Zelle ⇒ 0,1 m (geometrisch), nicht 0,505 m.
  const t3 = TIER_BY_ID.t3;
  {
    // Zwei Quellpunkte ¼ Zellweite links und rechts der Zellmitte (lon0) fallen in DIESELBE Zelle (Rundung).
    const f2 = { ni: 2, nj: 1, lat1: t3.lat0, lon1: t3.lon0 - t3.deg / 4, di: t3.deg / 2, dj: t3.deg, scanMode: 0x40, values: Float32Array.from([0.01, 1]) };
    const g = lnBlockMeanRegular(f2, t3);
    add('ln-Blockmittel regulär: 0,01 m und 1 m in einer Zelle ⇒ 0,1 m (geometrisch, nicht 0,505)', near(Math.exp(g[0]), 0.1, 1e-6), Math.exp(g[0]).toPrecision(6));
    const f3 = { ni: 4, nj: 1, lat1: t3.lat0, lon1: t3.lon0 - t3.deg / 4, di: t3.deg / 2, dj: t3.deg, scanMode: 0x40, values: Float32Array.from([0, -1, NaN, 0.2]) };
    const gz = lnBlockMeanRegular(f3, t3);
    add('ln-Blockmittel regulär: z0 ≤ 0 und NaN zählen nicht (keine ±∞; die leere Zelle füllt der Nachbar)',
      gz.every((v) => v !== -Infinity && v !== Infinity) && near(Math.exp(gz[0]), 0.2, 1e-6), Math.exp(gz[0]).toPrecision(6));
  }
  // 2) ln-Blockmittel unstrukturiert: dieselbe Regel, Lücken ≤ 3 Zellen gefüllt, weiter weg MISSING.
  {
    const lat = Float64Array.from([t3.lat0 + 0.01, t3.lat0 - 0.01, t3.lat0 + 10 * t3.deg]);
    const lon = Float64Array.from([t3.lon0 + 0.01, t3.lon0 - 0.02, t3.lon0 + 10 * t3.deg]);
    const g = lnBlockMeanUnstructured(Float32Array.from([0.01, 1, 0.5]), lat, lon, t3);
    add('ln-Blockmittel unstrukturiert: 0,01 m und 1 m ⇒ 0,1 m', near(Math.exp(g[0]), 0.1, 1e-6), Math.exp(g[0]).toPrecision(6));
    add('ln-Blockmittel unstrukturiert: Nachbarzelle aus dem nächsten Wert gefüllt (≤ 3 Zellen)', near(Math.exp(g[1]), 0.1, 1e-6));
    add('ln-Blockmittel unstrukturiert: 5 Zellen von jedem Wert entfernt bleibt MISSING (NaN)', Number.isNaN(g[5 * t3.nx + 5]));
  }
  // 3) Quantisierung: 1e-4 … 1,5 m mit ≤ 0,05 % Fehler.
  {
    const worst = Math.max(...[1e-4, 2e-4, 0.03, 0.1, 0.5, 1, 1.5].map((z) => Math.abs(Math.exp(quantize(Math.log(z), Z0MOD_PLANE_META) * Z0MOD_PLANE_META.scale) / z - 1)));
    add('Quantisierung ln(z0)·1000: Rundweg 1e-4 … 1,5 m ≤ 0,05 %', worst <= 5e-4, `${(worst * 100).toFixed(3)} %`);
  }
  // 4) Neubau-Regel (rein).
  {
    const n = 1000;
    const base = new Int16Array(n);
    for (let k = 0; k < n; k++) base[k] = k < 100 ? Math.round(Math.log(3e-4) * 1000) : Math.round(Math.log(0.05 + (k % 50) / 50) * 1000);
    const nowMs = Date.UTC(2026, 8, 20, 12);
    const prevTier = { builtAt: '2026-09-18T12:00:00.000Z', planes: [{ id: 'a' }] };
    const prevQuant = new Map([['a', base]]);
    const d = (q, extra = {}) => decideZ0modRewrite({ prevTier, prevQuant, ids: ['a'], quant: [q], nowMs, ...extra });
    add('Regel: gleiche Fassung ⇒ nicht geschrieben', !d(Int16Array.from(base)).write);
    const noise = Int16Array.from(base); for (let k = 100; k < n; k += 3) noise[k] += 300;                 // |Δln| 0,3 an 30 % der Landzellen
    add('Regel: Lauf-Rauschen |Δln| 0,3 an 30 % der Landzellen ⇒ nicht geschrieben', !d(noise).write, d(noise).reason);
    const big = Int16Array.from(base); for (let k = 100; k < 100 + 20; k++) big[k] += 700;                  // 20/900 = 2,2 % > 1 %
    add('Regel: |Δln| 0,7 an 2,2 % der Landzellen ⇒ geschrieben', d(big).write, d(big).reason);
    const water = Int16Array.from(base); for (let k = 0; k < 100; k++) water[k] += 2000;                    // Charnock, alle Wasserzellen
    add('Regel: Wasserzellen (z0 < 1 cm) ändern sich um Faktor 7 ⇒ nicht geschrieben', !d(water).write, d(water).reason);
    add('Regel: fehlende Spalte ⇒ nicht geschrieben, benannt', (() => { const r = decideZ0modRewrite({ prevTier, prevQuant, ids: [], quant: [], nowMs }); return !r.write && /lieferte in diesem Lauf kein z0/.test(r.reason); })());
    add('Regel: neue Spalte ⇒ geschrieben', decideZ0modRewrite({ prevTier, prevQuant, ids: ['a', 'b'], quant: [base, base], nowMs }).write);
    add('Regel: neuer Kalendermonat ⇒ geschrieben (Monatsauffrischung)', d(Int16Array.from(base), { nowMs: Date.UTC(2026, 9, 1, 0, 30) }).write);
    const shrink = Int16Array.from(base); shrink[500] = MISSING;
    add('Regel: schrumpfende Deckung ⇒ nicht geschrieben (Teilausfall)', !d(shrink).write, d(shrink).reason);
    add('Regel: erster Bau ⇒ geschrieben', decideZ0modRewrite({ prevTier: null, prevQuant: null, ids: ['a'], quant: [base], nowMs }).write);
  }
  // 5) Schreiben und Lesen im Container (t3, zwei Spalten), zweiter Lauf unverändert, dritter mit Stoffänderung.
  {
    const dir = mkdtempSync(join(tmpdir(), 'z0mod-'));
    try {
      const cells = t3.ny * t3.nx;
      const a = new Float32Array(cells), b = new Float32Array(cells);
      for (let k = 0; k < cells; k++) { a[k] = Math.log(0.05 + (k % 40) / 40); b[k] = k % 11 === 0 ? NaN : Math.log(0.2 + (k % 13) / 13); }
      const nowMs = Date.UTC(2026, 8, 20, 12);
      const cols = [{ id: 'icon_global', grid: a, run: '2026092000' }, { id: 'icon_ch2_eps', grid: b, run: '2026092000' }];
      const r1 = await writeStaticZ0mod(dir, 't3', cols, { absent: { ifs_hres: z0AbsentReason('ifs_hres') }, nowMs });
      const man = readZ0modManifest(dir);
      const t = man?.tiers?.t3;
      add('Schreiben: erster Bau, alle Chunks, Spalten und `absent` im Manifest', r1.changed && r1.chunks === t3.chunk.cy * t3.chunk.cx
        && t?.planes.map((p) => p.id).join() === 'icon_global,icon_ch2_eps' && /V-FI-72/.test(t?.absent?.ifs_hres ?? '') && t?.planes[0].unit === 'ln(m)', r1.reason);
      const back = await readTierColumns(dir, 't3', t);
      let worst = 0, miss = true;
      for (let k = 0; k < cells; k++) {
        const qa = back.get('icon_global')[k];
        worst = Math.max(worst, Math.abs(qa * Z0MOD_PLANE_META.scale - a[k]));
        if (Number.isNaN(b[k]) && back.get('icon_ch2_eps')[k] !== MISSING) miss = false;
      }
      add('Rundweg über den Container: ln-Werte ≤ ½ Schritt, NaN bleibt MISSING', worst <= 0.0005 + 1e-9 && miss, `max |Δ| ${worst.toFixed(5)}`);
      const f0 = join(dir, 'static', Z0MOD_PRODUCT, Z0MOD_VERSION, 't3', '00_00.bin');
      const m0 = statSync(f0).mtimeMs, j0 = readFileSync(join(dir, 'static', Z0MOD_PRODUCT, Z0MOD_VERSION, 'static.json'), 'utf8');
      const r2 = await writeStaticZ0mod(dir, 't3', cols, { nowMs: nowMs + 3 * 3_600_000 });
      add('zweiter Lauf gleich ⇒ nichts geschrieben (Chunk und static.json unberührt)', !r2.changed && statSync(f0).mtimeMs === m0
        && readFileSync(join(dir, 'static', Z0MOD_PRODUCT, Z0MOD_VERSION, 'static.json'), 'utf8') === j0, r2.reason);
      const a3 = Float32Array.from(a); for (let k = 0; k < 40; k++) a3[k] += 1;                            // 40/2009 ≈ 2 % Landzellen, Faktor e
      const r3 = await writeStaticZ0mod(dir, 't3', [{ ...cols[0], grid: a3 }, cols[1]], { nowMs: nowMs + 6 * 3_600_000 });
      add('dritter Lauf mit Stoffänderung (2 % der Landzellen Faktor e) ⇒ geschrieben, Diff benannt', r3.changed
        && readZ0modManifest(dir).tiers.t3.diffFromPrev.columns.map((c) => c.kind).join() === 'changed,same', r3.reason);
      let threw = false;
      try { await decodeCubeChunk(new Uint8Array(readFileSync(f0)), { planes: [{ id: 'nur_eine' }] }); } catch { threw = true; }
      add('Gegenprobe: falsche Ebenenliste bricht ab', threw);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  // 6) Schalter und Quellen-Einteilung.
  add('Schalter: nur POINT_Z0MOD=1 baut, POINT_STATIC=0 schaltet ab', z0modEnabled({ POINT_Z0MOD: '1' }) && !z0modEnabled({}) && !z0modEnabled({ POINT_Z0MOD: '1', POINT_STATIC: '0' }));
  add('Windquelle = Adapter mit u10 im Mittel; reine σ_ens-/Quantil-Quellen (vars []) nicht', carriesWindMean({ vars: ['t2m', 'u10'] }) && !carriesWindMean({ vars: [] }) && !carriesWindMean(null));
  return { pass: out.filter((o) => o.ok).length, total: out.length, fails: out.filter((o) => !o.ok).map((o) => `${o.name}${o.detail ? ` (${o.detail})` : ''}`) };
}
