/**
 * build-stations.mjs — das Stationsprodukt `point/stations/` (PD-B9,
 * `audit/punktdaten-versorgung.md` §44).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
 *        scripts/point/build-stations.mjs [--out=data/point]
 *
 * ── Warum ein EIGENES Produkt und kein Beitrag zum Cube ─────────────────────
 * Die Entscheidung steht seit PD-A in `cubeFormat.ts` und gilt unverändert: MOSMIX
 * ist auf DWD-Stationen bias-korrigiert, sein ganzer Wert hängt daran, dass die Zahl
 * **an dieser Station** gilt. Eine Interpolation auf das 0,05°-Gitter würde die
 * Korrektur über die Fläche verschmieren und genau den einen Vorteil wegwerfen, den
 * die Quelle hat.
 *
 * ⚠ **Die Registry widerspricht dem noch an einer Stelle:** `TIER_BANDS` führt
 * `mosmix_l` unter den Quellen der Stufe 2. Das ist ein Rest aus PD-A; ein Adapter
 * für die Fusionsschleife existiert nicht und soll nicht existieren. Der Eintrag
 * bleibt stehen, weil `sources` je Stufe die AUSKUNFT ist, welche Quellen diese
 * Stunden überhaupt versorgen — und das tut MOSMIX, nur eben über dieses Produkt.
 * `run.json` nennt die Quelle deshalb mit `product: 'stations'`.
 *
 * ── Was hier NICHT steht ────────────────────────────────────────────────────
 * `ps`, `snowlmt` und die vier Profilfelder bleiben MISSING — mit Grund, s.
 * `MOSMIX_NOT_MAPPED` in `mosmix.mjs`. σ_div, σ_ens und die Quantile bleiben
 * ebenfalls leer: EINE Quelle hat keine Streuung zwischen Quellen, keine Member und
 * keine gemessenen Quantile. `srcCount` steht auf 1, `ensCount` bleibt MISSING —
 * nicht 0, denn 0 Member hieße „gemessen und null", und gemessen wurde nichts.
 *
 * Die leeren Ebenen kosten **gemessen 4 Byte je Ebene und Bündel** (rund 28 KiB
 * über alle 179 Bündel). Dafür ist es derselbe Container, dieselbe Ebenenordnung
 * und derselbe Leser wie beim Cube — das ist den Preis wert.
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import {
  CUBE_DOMAIN, CUBE_PLANES, CUBE_SCHEMA, CHUNK_CELLS, MISSING, TIER_BY_ID,
  cellOf, chunkOf, planeIndex, quantize, encodeCubeChunk,
  stationBundlePath, stationManifestPath, STATION_CATALOG_PATH,
} from '../../src/point/cubeFormat.ts';
import { readMosmixKmz, mosmixToCube, MOSMIX_NOT_MAPPED, MOSMIX_PARAMS } from './mosmix.mjs';

const args = {};
for (const s of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(s);
  if (m) args[m[1]] = m[2] ?? '1';
}
const OUT = args.out || process.env.POINT_OUT || 'data/point';
const deflate9 = async (b) => new Uint8Array(deflateRawSync(b, { level: 9 }));

/**
 * Kill-Switch wie bei Profil, Quantilen und Ensemble (Regel 2 der Verfassung):
 * ein neuer Rechenweg ersetzt keinen alten und muss abschaltbar sein.
 */
export const STATIONS_ENABLED = process.env.POINT_STATIONS !== '0';

const MOSMIX_URL = process.env.MOSMIX_URL
  || 'https://opendata.dwd.de/weather/local_forecasts/mos/MOSMIX_L/all_stations/kml/MOSMIX_L_LATEST.kmz';

const pad2 = (n) => String(n).padStart(2, '0');
const runIdOf = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}`;
};

/**
 * Die Zeitachse ist die von MOSMIX, **nicht** die des Cubes.
 *
 * Gemessen kostet das 6,79 statt 2,89 MiB je Lauf (247 statt 109 Schritte). Die
 * 3,9 MiB sind gegen die 77,84 MiB des Cubes nichts — und dafür bleibt das, was
 * MOSMIX als einzige Quelle kann: **stündlich bis 246 h**. Der Cube ist ab 51 h
 * dreistündlich und ab 126 h sechsstündlich, weil FLÄCHEN teuer sind; eine
 * Stationsreihe ist es nicht. Die Achse steht in `stations.json`, damit kein Leser
 * sie raten muss.
 */
export function leadsOf(header) {
  return header.steps.map((t) => Math.round((t - header.issueMs) / 3_600_000));
}

async function main() {
  if (!STATIONS_ENABLED) { console.log('[stations] POINT_STATIONS=0 — uebersprungen'); return; }
  const t0 = Date.now();
  const tier = TIER_BY_ID.t1;

  console.log(`[stations] ${MOSMIX_URL}`);
  const res = await fetch(MOSMIX_URL);
  if (!res.ok) throw new Error(`MOSMIX HTTP ${res.status}`);
  const kmz = Buffer.from(await res.arrayBuffer());
  const tDl = Date.now();
  console.log(`  Abruf ${(kmz.length / 1048576).toFixed(1)} MiB in ${((tDl - t0) / 1000).toFixed(1)} s`);

  const keep = (lat, lon) =>
    lat >= CUBE_DOMAIN.latMin && lat <= CUBE_DOMAIN.latMax
    && lon >= CUBE_DOMAIN.lonMin && lon <= CUBE_DOMAIN.lonMax;

  const stations = [];
  const header = await readMosmixKmz(kmz, { keep, onStation: (s) => stations.push(s) });
  const leads = leadsOf(header);
  const run = runIdOf(header.issueMs);
  const ageH = (Date.now() - header.issueMs) / 3_600_000;
  console.log(`  Parsen ${((Date.now() - tDl) / 1000).toFixed(1)} s · Rest-Puffer max ${(header.maxCarry / 1048576).toFixed(2)} MiB`);
  console.log(`  Lauf ${run} (Alter ${ageH.toFixed(1)} h) · ${leads.length} Schritte ${leads[0]}…${leads.at(-1)} h`);
  console.log(`  Stationen: ${header.kept} von ${header.seen} im Ausschnitt`);

  // --- nach dem Chunk-Raster der Stufe 1 buendeln ----------------------------
  const byChunk = new Map();
  let outside = 0;
  for (const s of stations) {
    const cell = cellOf(tier, s.lat, s.lon);
    if (!cell) { outside++; continue; }          // kann nach `keep` nicht mehr vorkommen
    const ch = chunkOf(cell.iy, cell.ix);
    const key = `${ch.cy}_${ch.cx}`;
    if (!byChunk.has(key)) byChunk.set(key, { ...ch, st: [] });
    byChunk.get(key).st.push(s);
  }
  // Die Spaltenordnung MUSS stabil sein — sie ist der Vertrag zwischen Bündel und
  // Manifest. Nach Stations-ID sortiert, nicht nach Lesereihenfolge der Datei.
  for (const c of byChunk.values()) c.st.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const outRoot = join(OUT, 'stations', run);
  if (existsSync(outRoot)) rmSync(outRoot, { recursive: true, force: true });

  const files = [];
  const manifestChunks = [];
  const perPlane = new Array(CUBE_PLANES.length).fill(0);
  const filled = new Set();
  let bytesTotal = 0, valueCount = 0, gustClamped = 0;

  const nt = leads.length;
  for (const [key, c] of [...byChunk.entries()].sort()) {
    const nx = c.st.length;
    const planes = CUBE_PLANES.map(() => new Int16Array(nt * nx).fill(MISSING));
    const put = (id, it, k, v) => {
      if (!Number.isFinite(v)) return;
      const pi = planeIndex(id);
      planes[pi][it * nx + k] = quantize(v, CUBE_PLANES[pi]);
      filled.add(id); valueCount++;
    };
    for (let k = 0; k < nx; k++) {
      const s = c.st[k];
      for (let it = 0; it < nt; it++) {
        const v = mosmixToCube(s.values, it);
        const rawFx = s.values.FX1?.[it];
        if (Number.isFinite(rawFx) && Number.isFinite(v.gust) && v.gust > rawFx) gustClamped++;
        for (const [id, val] of Object.entries(v)) put(id, it, k, val);
        // Die Stationshöhe IST die Modellhöhe dieser Quelle: MOSMIX gilt am Ort,
        // also ist h_true − h_mod_eff hier null und PAP 4 hat nichts zu korrigieren.
        if (s.elev != null) put('hModEff', it, k, s.elev);
        put('srcCount', it, k, 1);
      }
    }
    const bytes = await encodeCubeChunk({
      runHours: Math.floor(header.issueMs / 3_600_000),
      tierIndex: tier.index, nt, y0: 0, x0: 0, ny: 1, nx, planes,
    }, deflate9);
    const rel = stationBundlePath(run, c.cy, c.cx);
    const p = join(OUT, rel.replace(/^point\//, ''));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, bytes);
    files.push(rel); bytesTotal += bytes.length;
    manifestChunks.push({
      cy: c.cy, cx: c.cx, file: rel, bytes: bytes.length,
      // DIE Zuordnung Spalte → Station. Ohne sie ist das Bündel Zahlensalat.
      stations: c.st.map((s) => s.id),
    });
    for (let pi = 0; pi < CUBE_PLANES.length; pi++) {
      perPlane[pi] += (await deflate9(new Uint8Array(planes[pi].buffer))).length;
    }
  }

  // --- Manifest je Lauf ------------------------------------------------------
  const manifest = {
    schema: CUBE_SCHEMA,
    product: 'stations',
    source: 'mosmix_l',
    run, runAt: new Date(header.issueMs).toISOString(), ageH: Number(ageH.toFixed(2)),
    tier: tier.id, chunkCells: CHUNK_CELLS,
    axis: {
      leadHours: leads, stepH: 1,
      note: 'Eigene Achse, NICHT die des Cubes: MOSMIX liefert stuendlich bis 246 h. Der Cube ist ab 51 h dreistuendlich, weil Flaechen teuer sind — eine Stationsreihe ist es nicht.',
    },
    stationCount: header.kept,
    chunks: manifestChunks,
    planes: CUBE_PLANES.map((p) => ({ id: p.id, unit: p.unit, scale: p.scale, offset: p.offset, group: p.group })),
    notMapped: MOSMIX_NOT_MAPPED,
    parameters: MOSMIX_PARAMS,
    caveats: [
      'Die Zeilenzahl ist immer 1 (ny=1); die Spalte k gehoert zur Station chunks[].stations[k].',
      'srcCount ist 1 — eine Quelle. Alle _sd-, _sd_ens- und Quantil-Ebenen sind leer, weil eine Quelle keine Streuung zwischen Quellen hat.',
      'ensCount bleibt MISSING statt 0: 0 hiesse "gemessen und null", gemessen wurde nichts.',
      'hModEff ist die Stationshoehe — MOSMIX gilt AM Ort, PAP 4 hat hier nichts zu korrigieren.',
      'gust ist auf max(FX1, |v10|) geklammert (PAP 6); am echten Lauf war FX1 in 97 Fallen kleiner als FF.',
      'MOSMIX-L laeuft 03/09/15/21 UTC und erscheint bei Lauf + 72…77 min. Der Punkt-Cron laeuft bei Lauf + 50 min, erreicht den gleichzeitigen Lauf also NIE — ageH sagt, wie alt der genommene ist.',
    ],
    producer: 'buscosun-web/scripts/point/build-stations.mjs',
  };
  const mp = join(OUT, stationManifestPath(run).replace(/^point\//, ''));
  mkdirSync(dirname(mp), { recursive: true });
  writeFileSync(mp, JSON.stringify(manifest, null, 2));

  // --- Katalog (zeitlos) -----------------------------------------------------
  // Ort, Name, Höhe — aus der KML, NICHT aus `mosmix_stationskatalog.cfg`: der
  // führt Grad + Dezimalminuten und verschiebt jede Station um bis zu ~20 km.
  const catalog = {
    schema: CUBE_SCHEMA,
    updatedAt: new Date().toISOString(),
    source: 'MOSMIX-L <kml:coordinates> (echte Dezimalgrad)',
    note: 'NICHT aus mosmix_stationskatalog.cfg abgeleitet: der fuehrt Lat/Lon als Grad + Dezimalminuten (Wien/Hohe Warte steht dort als 48.15/16.22 statt 48.2489/16.3564).',
    domain: CUBE_DOMAIN,
    count: stations.length,
    stations: [...stations]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, elev: s.elev })),
  };
  const cp = join(OUT, STATION_CATALOG_PATH.replace(/^point\//, ''));
  mkdirSync(dirname(cp), { recursive: true });
  writeFileSync(cp, JSON.stringify(catalog, null, 2));

  // --- Bericht ---------------------------------------------------------------
  const fill = perPlane.map((v, i) => [CUBE_PLANES[i].id, v]).filter(([id]) => filled.has(id))
    .sort((a, b) => b[1] - a[1]);
  console.log(`  ${files.length} Buendel · ${(bytesTotal / 1048576).toFixed(2)} MiB · ${valueCount.toLocaleString('de-DE')} Werte`);
  console.log(`  belegte Ebenen (${filled.size}/${CUBE_PLANES.length}): ${fill.map(([k, v]) => `${k} ${(v / 1024).toFixed(0)}`).join(' · ')}`);
  console.log(`  ⚠ Boee auf den Wind gehoben: ${gustClamped}`);
  console.log(`  Katalog ${catalog.count} Stationen · ausserhalb ${outside}`);
  console.log(`WALL_STATIONS=${Math.round((Date.now() - t0) / 1000)}s`);
}

// PD-C4: dasselbe Idiom wie im Producer (`build-point-cube.mjs`). Der Windows-geformte
// Vergleich davor (`file:///C:/…` gegen argv[1]) haette auf einem Linux-Runner mit
// absolutem Pfad `file:////home/…` verglichen und `main()` still nie gestartet.
if (process.argv[1]?.endsWith('build-stations.mjs')) {
  main().catch((e) => { console.error('[stations]', e); process.exit(1); });
}
