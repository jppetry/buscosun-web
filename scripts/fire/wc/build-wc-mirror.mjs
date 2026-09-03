/**
 * V-SAT-15 — Producer des WorldCover-Spiegels (`audit/brandradar-satellitenbilder.md` §12.7).
 *
 * Baut je DACH-3°-Kachel EINE abgeleitete Ein-Ebenen-TIFF (9000 px ≈ 37 m/px) aus dem
 * ESA-WorldCover-2021-v200-COG — Kachel-Nutzlasten VERBATIM remuxt (`wcRemux.mjs`), kein
 * Re-Encode. Quelle ist der CORS-lose AWS-Bucket (Node hat kein CORS-Problem); gelesen werden
 * NUR der Header (Range, iterativ per `needMoreBytes`) und die Kachel-Ranges der 9000er-Ebene,
 * nie die 94-MB-Datei.
 *
 * Ablage: ein lokaler Klon des statischen Spiegel-Repos `jppetry/buscosun-worldcover`
 * (EIN unveränderlicher Commit; der Client pinnt den Commit-SHA — BW-2-Muster). Keine Actions.
 *
 * Aufrufe:
 *   npm run wc:mirror -- --probe        nur Header: Größentabelle + Budget-Beleg (Diagnose-First)
 *   npm run wc:mirror -- --out <dir>    Vollbau nach <dir> (Default .cache/wc-mirror/repo)
 *   npm run wc:mirror -- --check <base> Stichprobe: eine Kachel vom gepushten Spiegel gegen die
 *                                       AWS-Quelle dekodieren und byte-vergleichen
 *
 * Budgets (jsDelivr, gemessen §12.1 (3)): ≤ 20 MB je Datei, ≤ 150 MB je Paket — beide werden
 * hier HART geprüft; Überschreitung = Abbruch mit Zahlen, nie ein stilles Zuviel.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseCogIfds, decodeTile, COG_HEADER_RETRY_BYTES } from '../../../src/fire/detail/cogTiff.ts';
import { WC_ATTRIBUTION } from '../../../src/fire/detail/worldCover.ts';
import { remuxWcLevel, assertWcLevelContract } from './wcRemux.mjs';

const AWS_BASE = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/';
const srcUrl = (name) => `${AWS_BASE}ESA_WorldCover_10m_2021_v200_${name}_Map.tif`;

/** Ziel-Ebene des Spiegels: 9000 px ≈ 37 m/px (18000 px wäre 22,9 MB > 20-MB-Dateigrenze). */
export const WC_MIRROR_LEVEL_PX = 9000;

export const FILE_LIMIT = 20 * 1024 * 1024;
export const PACKAGE_LIMIT = 150 * 1024 * 1024;
const PACKAGE_WARN = 145 * 1024 * 1024;

/**
 * Die 17 DACH-Kacheln (SW-Ecken-Namen, §12.7): Randfälle N45E003 (CH-Westzipfel Genf,
 * lon 5,96), N51E003 (DE-Westzipfel Selfkant, lon 5,87), N51E015 (DE-Ostzipfel Neißeaue,
 * lon 15,04); ausgeschlossen N48E003 (nur F/B/L), N54E003 (offene Nordsee, 404 gemessen),
 * N54E015 (kein DACH-Land östlich 15° über 54° N). Druckventil bei Budget-Not (in dieser
 * Reihenfolge streichen): N51E003 → N45E003 → N51E015.
 */
export const DACH_TILES = [
  'N45E003', 'N45E006', 'N45E009', 'N45E012', 'N45E015',
  'N48E006', 'N48E009', 'N48E012', 'N48E015',
  'N51E003', 'N51E006', 'N51E009', 'N51E012', 'N51E015',
  'N54E006', 'N54E009', 'N54E012',
];

const CACHE_DIR = path.join(process.cwd(), '.cache', 'wc-mirror');
const UA = 'buscosun-wc-mirror/1 (+https://buscosun.com)';

const mb = (n) => (n / 1024 / 1024).toFixed(2);

async function fetchRange(url, offset, length) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 500 * 3 ** (attempt - 1)));
    try {
      const r = await fetch(url, { headers: { range: `bytes=${offset}-${offset + length - 1}`, 'user-agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      let bytes = new Uint8Array(await r.arrayBuffer());
      // 200 statt 206 (ganze Datei) ⇒ Ausschnitt selbst schneiden statt still falsch weiterzurechnen.
      if (r.status === 200 && bytes.length > length) bytes = bytes.slice(offset, offset + length);
      if (bytes.length !== length) throw new Error(`Range unvollständig (${bytes.length}/${length} B)`);
      return bytes;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`${url} [${offset}..${offset + length}): ${lastErr}`);
}

/** Header iterativ holen (IFDs brauchen 18 828 B — der 64-KB-Retry-Puffer deckt das in Runde 1). */
async function fetchIfds(url) {
  let upTo = COG_HEADER_RETRY_BYTES;
  for (let round = 0; round < 5; round++) {
    const buf = (await fetchRange(url, 0, upTo)).buffer;
    const parsed = parseCogIfds(/** @type {ArrayBuffer} */(buf));
    if (parsed.kind === 'ok') return parsed.ifds;
    if (parsed.kind === 'needMoreBytes') { upTo = parsed.upTo; continue; }
    throw new Error(`${url}: ${parsed.kind} (${parsed.reason ?? ''})`);
  }
  throw new Error(`${url}: Header konvergiert nicht`);
}

function levelOf(ifds, name) {
  const ifd = ifds.find((i) => i.width === WC_MIRROR_LEVEL_PX && i.height === WC_MIRROR_LEVEL_PX);
  if (!ifd) throw new Error(`${name}: keine ${WC_MIRROR_LEVEL_PX}-px-Ebene (Ebenen: ${ifds.map((i) => i.width).join('/')})`);
  assertWcLevelContract(ifd, name);
  return ifd;
}

/** Zusammenhängende Kachel-Läufe zu wenigen Range-Abrufen koaleszieren (Lücken ≤ 4 KB inklusive). */
export function coalesceRuns(ifd, maxGap = 4096) {
  const refs = ifd.tileOffsets
    .map((offset, i) => ({ offset, byteCount: ifd.tileByteCounts[i] }))
    .filter((t) => t.byteCount > 0)
    .sort((a, b) => a.offset - b.offset);
  const runs = [];
  for (const t of refs) {
    const last = runs[runs.length - 1];
    if (last && t.offset - last.end <= maxGap) last.end = Math.max(last.end, t.offset + t.byteCount);
    else runs.push({ start: t.offset, end: t.offset + t.byteCount });
  }
  return runs;
}

async function buildTile(name) {
  const derivedPath = path.join(CACHE_DIR, `${name}.tif`);
  if (fs.existsSync(derivedPath) && !process.argv.includes('--force')) {
    return new Uint8Array(fs.readFileSync(derivedPath));
  }
  const url = srcUrl(name);
  const ifd = levelOf(await fetchIfds(url), name);
  const runs = coalesceRuns(ifd);
  const chunks = [];
  let fetched = 0;
  for (const run of runs) {
    chunks.push({ start: run.start, bytes: await fetchRange(url, run.start, run.end - run.start) });
    fetched += run.end - run.start;
  }
  const readRange = async (offset, length) => {
    const c = chunks.find((x) => offset >= x.start && offset + length <= x.start + x.bytes.length);
    if (!c) throw new Error(`${name}: Range [${offset}..${offset + length}) außerhalb der geholten Läufe`);
    return c.bytes.slice(offset - c.start, offset - c.start + length);
  };
  const buf = await remuxWcLevel(ifd, readRange);
  const out = new Uint8Array(buf);
  // Beweis am Objekt: das Derivat durch DENSELBEN Leser, jede Kachel byte-gleich zur Quelle.
  const parsed = parseCogIfds(buf);
  if (parsed.kind !== 'ok' || parsed.ifds.length !== 1) throw new Error(`${name}: Derivat nicht lesbar (${parsed.kind})`);
  const d = parsed.ifds[0];
  for (const i of [0, Math.floor(d.tileOffsets.length / 2), d.tileOffsets.length - 1]) {
    if (!(d.tileByteCounts[i] > 0)) continue;
    const src = await decodeTile(await readRange(ifd.tileOffsets[i], ifd.tileByteCounts[i]), ifd);
    const der = await decodeTile(out.slice(d.tileOffsets[i], d.tileOffsets[i] + d.tileByteCounts[i]), d);
    if (src.length !== der.length || !src.every((v, k) => v === der[k])) throw new Error(`${name}: Kachel ${i} nicht byte-gleich`);
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(derivedPath, out);
  console.log(`  ${name}: ${runs.length} Ranges · ${mb(fetched)} MB geholt → ${mb(out.length)} MB Derivat`);
  return out;
}

async function probe() {
  console.log(`[wc:mirror --probe] ${DACH_TILES.length} Kacheln, Ebene ${WC_MIRROR_LEVEL_PX} px — nur Header (Diagnose-First)`);
  let total = 0;
  const rows = [];
  for (const name of DACH_TILES) {
    const ifd = levelOf(await fetchIfds(srcUrl(name)), name);
    const payload = ifd.tileByteCounts.reduce((a, b) => a + b, 0);
    total += payload;
    rows.push({ name, payload });
    console.log(`  ${name}: ${mb(payload)} MB Nutzlast (${ifd.tilesAcross}×${ifd.tilesDown} Kacheln)`);
    if (payload > FILE_LIMIT) throw new Error(`${name}: ${mb(payload)} MB > 20-MB-Dateigrenze`);
  }
  console.log(`  Summe Nutzlast: ${mb(total)} MB (Paketgrenze 150 MB${total > PACKAGE_WARN ? ' — KNAPP, Druckventil prüfen' : ''})`);
  if (total > PACKAGE_LIMIT) throw new Error(`Paket ${mb(total)} MB > 150 MB — Druckventil N51E003 → N45E003 → N51E015`);
  return rows;
}

async function build(outDir) {
  const mapDir = path.join(outDir, 'map');
  fs.mkdirSync(mapDir, { recursive: true });
  const tiles = [];
  let total = 0;
  for (const name of DACH_TILES) {
    const bytes = await buildTile(name);
    if (bytes.length > FILE_LIMIT) throw new Error(`${name}: ${mb(bytes.length)} MB > 20-MB-Dateigrenze`);
    fs.writeFileSync(path.join(mapDir, `${name}.tif`), bytes);
    tiles.push({ name, file: `map/${name}.tif`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    total += bytes.length;
  }
  if (total > PACKAGE_LIMIT) throw new Error(`Paket ${mb(total)} MB > 150 MB`);
  const manifest = {
    schema: 1,
    source: AWS_BASE,
    level: WC_MIRROR_LEVEL_PX,
    mPerPx: 37,
    license: 'CC BY 4.0',
    attribution: WC_ATTRIBUTION,
    builtAt: new Date().toISOString(),
    totalBytes: total,
    tiles,
  };
  fs.writeFileSync(path.join(outDir, 'wc-mirror.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'README.md'), [
    '# buscosun-worldcover',
    '',
    'Statischer DACH-Spiegel der **ESA WorldCover 2021 v200**-Landbedeckung für buscosun.com',
    `(V-SAT-15): je 3°-Kachel die ${WC_MIRROR_LEVEL_PX}-px-Pyramidenebene (≈ 37 m/px) des Original-COGs,`,
    'Kachel-Nutzlasten byte-identisch übernommen (remuxt, kein Re-Encode). Benannter Ersatzweg,',
    'falls der Microsoft-Planetary-Computer-Transport entfällt; Auslieferung über jsDelivr am',
    'Commit-SHA. Dieses Repo ist EIN unveränderlicher Commit — Änderungen nur als neuer Commit',
    'mit neuem SHA-Pin im Client.',
    '',
    `Lizenz der Daten: **CC BY 4.0** — ${WC_ATTRIBUTION}`,
    '',
    'Quelle: https://esa-worldcover.org/ · https://registry.opendata.aws/esa-worldcover-vito/',
  ].join('\n') + '\n');
  console.log(`[wc:mirror] ${tiles.length} Kacheln, ${mb(total)} MB → ${outDir}`);
  console.log('[wc:mirror] Nächste Schritte: Repo jppetry/buscosun-worldcover anlegen, EIN Commit pushen, SHA in WC_MIRROR_SHA (worldCover.ts) pinnen.');
}

/** Stichprobe gegen den GEPUSHTEN Spiegel: eine 1024²-Kachel je Quelle dekodieren, byte-gleich? */
async function check(base) {
  const name = 'N48E006';
  const src = levelOf(await fetchIfds(srcUrl(name)), name);
  const mirIfds = await fetchIfds(`${base.replace(/\/$/, '')}/map/${name}.tif`);
  if (mirIfds.length !== 1) throw new Error(`Spiegel ${name}: ${mirIfds.length} IFDs statt 1`);
  const mir = mirIfds[0];
  const idx = Math.floor(mir.tileOffsets.length / 2);
  const a = await decodeTile(await fetchRange(srcUrl(name), src.tileOffsets[idx], src.tileByteCounts[idx]), src);
  const b = await decodeTile(await fetchRange(`${base.replace(/\/$/, '')}/map/${name}.tif`, mir.tileOffsets[idx], mir.tileByteCounts[idx]), mir);
  const ok = a.length === b.length && a.every((v, i) => v === b[i]);
  console.log(`[wc:mirror --check] ${name} Kachel ${idx}: ${ok ? 'byte-gleich' : 'ABWEICHUNG'}`);
  if (!ok) process.exit(1);
}

const argv = process.argv.slice(2);
if (argv.includes('--probe')) {
  await probe();
} else if (argv.includes('--check')) {
  await check(argv[argv.indexOf('--check') + 1] ?? '');
} else {
  const outIdx = argv.indexOf('--out');
  await build(outIdx >= 0 ? argv[outIdx + 1] : path.join(CACHE_DIR, 'repo'));
}
