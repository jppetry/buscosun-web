/**
 * verify-point-client.mjs — Gate GPD-D (`audit/fusion-vorstufe.md` §10).
 *
 * Netzfrei. Prüft die Vorstufe der buscosun Fusion: den Leseweg (`src/point/client/*`)
 * und die Auswahlregel — gegen einen Baum, den der PRODUCER-Code in diesem Prozess
 * schreibt, nicht gegen eine Attrappe. Der Rundweg ist damit echt: was
 * `encodeCubeChunk` erzeugt, muss `readCubePoint` an derselben Zelle wiederfinden.
 *
 * Die Prüfungen sind an den Fehlern gebaut, die diese Phase WIRKLICH gemacht hat:
 *
 *   • Eine Zeit, die auf keinem Raster liegt, sah aus wie eine fehlende Quelle
 *     (Diagnose §5) ⇒ `stepNearest` liefert den Abstand, und er wird geprüft.
 *   • Der Nowcast lieferte nichts, weil jeder RV-Frame dieselbe `validAtMs` trägt
 *     (V-PD-56) ⇒ eigene Prüfung mit Negativ-Kontrolle.
 *   • Eine Station 16,5 km entfernt darf NICHT gewinnen ⇒ Negativ-Kontrolle.
 *   • `dequantize` wurde für die Manifest-Ebenen verbreitert ⇒ Prüfung, dass beide
 *     Formen denselben Wert geben (sonst gäbe es wieder zwei Umrechnungen).
 *
 *   npm run verify:point-client
 */

import { readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CUBE_PLANES, CUBE_SCHEMA, TIER_BY_ID, MISSING,
  encodeCubeChunk, decodeCubeChunk, chunkPath, chunkExtent, cellOf, chunkOf, quantize, dequantize, quantStep,
} from '../src/point/cubeFormat.ts';
import {
  NOWCAST_STAMP_FORM, nowcastStampOf, nowcastSlotStamps, NOWCAST_VMAX,
} from '../src/point/nowcastFormat.ts';
import { sampleNowcastFrame, stampMs } from '../src/point/nowcastSample.ts';
import { memoryStore, httpStore, POINT_CDN_BASE } from '../src/point/client/store.ts';
import { readCubePoint, stepNearest, distanceKm, manifestStore, loadRunManifestFrom } from '../src/point/client/cubePoint.ts';
import { nearestStations, readStationPoint } from '../src/point/client/stationPoint.ts';
import { planPointSources, SELECTION } from '../src/point/client/resolve.ts';
import { readHmodelPoint, loadHmodelManifest } from '../src/point/client/staticPoint.ts';
import { writeStaticHmodel, HMODEL_PLANE_META, staticHmodelSelfTest } from './point/staticHmodel.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const enc = (o) => new TextEncoder().encode(JSON.stringify(o));

// ---------------------------------------------------------------------------
// (1) Transport
// ---------------------------------------------------------------------------
{
  const files = new Map([['a/b.json', enc({ x: 1 })]]);
  const st = memoryStore(files);
  const hit = await st.json('a/b.json');
  const miss = await st.bytes('a/nope.json');
  add('(1) memoryStore liefert vorhandene Dateien und `null` bei fehlenden',
    hit?.x === 1 && miss === null, `stats files=${st.stats.files} misses=${st.stats.misses}`);
  add('(1) ein 404 ist ein Befund, kein Fehler: er zaehlt als miss, nicht als Datei',
    st.stats.files === 1 && st.stats.misses === 1);
  add('(1) fuehrende Schraegstriche im Pfad aendern nichts',
    (await memoryStore(files).json('/a/b.json'))?.x === 1);
  add('(1) httpStore normalisiert die Basis und pinnt NICHT automatisch (§29: gepinnter SHA kann 404)',
    httpStore({ base: `${POINT_CDN_BASE}/` }).base === POINT_CDN_BASE);
}

// ---------------------------------------------------------------------------
// (2) `dequantize` nimmt jetzt auch die Manifest-Ebene (PD-D2)
// ---------------------------------------------------------------------------
{
  const p = CUBE_PLANES.find((x) => x.id === 't2m');
  const bare = { scale: p.scale, offset: p.offset };
  const q = quantize(17.37, p);
  add('(2) `dequantize` gibt fuer CubePlane und fuer die nackte Manifest-Ebene denselben Wert',
    dequantize(q, p) === dequantize(q, bare) && Math.abs(dequantize(q, bare) - 17.37) <= p.scale,
    `${dequantize(q, bare)}`);
  add('(2) `quantStep` ebenso — sonst gaebe es zwei Umrechnungen fuer sigma_quant',
    quantStep(p) === quantStep(bare));
}

// ---------------------------------------------------------------------------
// (3) Rundweg Producer -> Leser an einer echten Zelle
// ---------------------------------------------------------------------------
const LAT = 48.137;
const LON = 11.575;
const RUN = '2026091303';
const RUN_AT = '2026-09-13T03:00:00Z';
let cubeFiles;
let cubeIndex;
{
  const tier = TIER_BY_ID.t1;
  const cell = cellOf(tier, LAT, LON);
  const ch = chunkOf(cell.iy, cell.ix);
  const ext = chunkExtent(tier, ch.cy, ch.cx);
  const nt = tier.leadHours.length;
  const cells = nt * ext.ny * ext.nx;
  const ry = cell.iy - ext.y0;
  const rx = cell.ix - ext.x0;

  // Ein Feld mit bekannter, ORTS- UND ZEITABHAENGIGER Signatur: eine Verschiebung um
  // eine Zelle oder eine Stunde bricht den Vergleich, ein konstantes Feld nicht.
  const truth = (it) => 5 + it * 0.25 + ry * 0.01 + rx * 0.002;
  const planes = CUBE_PLANES.map((pl) => {
    const a = new Int16Array(cells).fill(MISSING);
    if (pl.id === 't2m') {
      for (let it = 0; it < nt; it++) {
        for (let y = 0; y < ext.ny; y++) {
          for (let x = 0; x < ext.nx; x++) {
            a[(it * ext.ny + y) * ext.nx + x] = quantize(5 + it * 0.25 + y * 0.01 + x * 0.002, pl);
          }
        }
      }
    } else if (pl.id === 'hModEff') {
      a.fill(quantize(531, pl));
    } else if (pl.id === 'srcCount') {
      a.fill(quantize(5, pl));
    }
    return a;
  });

  const bytes = await encodeCubeChunk({
    runHours: Math.floor(Date.parse(RUN_AT) / 3_600_000),
    tierIndex: tier.index, nt, y0: ext.y0, x0: ext.x0, ny: ext.ny, nx: ext.nx, planes,
  });

  const manifest = {
    schema: CUBE_SCHEMA, run: RUN, runAt: RUN_AT,
    planes: CUBE_PLANES.map((pl) => ({ id: pl.id, unit: pl.unit, scale: pl.scale, offset: pl.offset, group: pl.group })),
    sources: [{ id: 'icon_d2', name: 'ICON-D2', tier: 't1', runAt: RUN_AT, steps: nt, role: 'assigned', coverage: 'full', offsetH: 0 }],
    tiers: [{
      id: 't1', deg: tier.deg, lat0: tier.lat0, lon0: tier.lon0, ny: tier.ny, nx: tier.nx,
      chunk: tier.chunk, run: RUN, runAt: RUN_AT, ageH: 0, leadHours: [...tier.leadHours],
      files: [{ file: chunkPath(RUN, tier, ch.cy, ch.cx), bytes: bytes.length, cy: ch.cy, cx: ch.cx }],
      quantiles: null, ensemble: null, profile: null, net: null, dropped: [],
    }],
    fusion: {}, skipped: {}, pending: {},
  };

  cubeIndex = {
    schema: CUBE_SCHEMA, commit: 'deadbeef', publishedAt: RUN_AT,
    latestByTier: {
      t1: { run: RUN, runAt: RUN_AT, path: `point/${RUN}`, manifest: `point/${RUN}/run.json`, sourceRun: RUN, sourceRunAt: RUN_AT, ageH: 0, files: 1, bytes: bytes.length },
      t2: null, t3: null,
    },
    stations: { dir: 'point/stations', catalog: 'point/stations/catalog.json', runs: [] },
  };

  cubeFiles = new Map([
    ['point/index.json', enc(cubeIndex)],
    [`point/${RUN}/run.json`, enc(manifest)],
    [chunkPath(RUN, tier, ch.cy, ch.cx), bytes],
  ]);

  const store = memoryStore(cubeFiles);
  const ser = await readCubePoint(store, cubeIndex, 't1', LAT, LON);
  let worst = 0;
  for (let it = 0; it < nt; it++) worst = Math.max(worst, Math.abs(ser.steps[it].values.t2m - truth(it)));
  const step = quantStep(CUBE_PLANES.find((x) => x.id === 't2m'));

  add('(3) Rundweg: jeder der 49 Schritte kommt am Punkt wieder heraus, Abweichung <= Delta/2',
    ser.steps.length === nt && worst <= step / 2 + 1e-12, `groesste Abweichung ${worst.toExponential(2)} K, Delta ${step}`);
  add('(3) Zellzuordnung: `hModEff` und `srcCount` stimmen, Gueltigzeiten folgen dem Lauf',
    ser.hModEffM === 531 && ser.steps[0].values.srcCount === 5
    && ser.steps[0].validAtMs === Date.parse(RUN_AT)
    && ser.steps[48].validAtMs === Date.parse(RUN_AT) + 48 * 3_600_000);
  add('(3) leere Ebenen werden BENANNT, nicht verschwiegen',
    ser.filledPlanes.length === 3 && ser.emptyPlanes.length === CUBE_PLANES.length - 3,
    `${ser.filledPlanes.join(',')} belegt`);
  add('(3) Negativ-Kontrolle: eine um EINE Zelle verschobene Abfrage liefert andere Werte',
    (await readCubePoint(memoryStore(cubeFiles), cubeIndex, 't1', LAT + tier.deg, LON))
      ?.steps[0].values.t2m !== ser.steps[0].values.t2m);
  add('(3) fehlt der Chunk, gibt der Leser `null` statt zu werfen',
    (await readCubePoint(memoryStore(new Map([['point/index.json', enc(cubeIndex)], [`point/${RUN}/run.json`, enc(manifest)]])), cubeIndex, 't1', LAT, LON)) === null);
  add('(3) `wanted` entpackt nur die verlangten Ebenen',
    Object.keys((await readCubePoint(memoryStore(cubeFiles), cubeIndex, 't1', LAT, LON, { wanted: ['t2m'] })).steps[0].values).join() === 't2m');

  // ── V-FI-1: Manifeste gepinnt an den Index-Commit ──────────────────────────
  // Nachgebaut, was am 16.09. am CDN stand: `@main` traegt ein Manifest OHNE die Stufe,
  // `@<commit>` das richtige. Ein Store ueber einen eigenen `fetch`, der beide Fassungen
  // ausliefert und mitzaehlt, welche Basis gefragt wurde.
  {
    const stale = { ...manifest, tiers: [] };            // wie am CDN: die Stufe fehlt
    const hits = { main: 0, pinned: 0, firstPinned403: 0 };
    const mkFetch = (opts = {}) => async (url) => {
      const u = String(url);
      const path = u.replace(/^https:\/\/cdn\.jsdelivr\.net\/gh\/jppetry\/buscosun-data@[^/]+\//, '');
      const isPinned = u.includes(`@${cubeIndex.commit}/`);
      if (path.endsWith('run.json')) {
        if (isPinned) {
          hits.pinned += 1;
          if (opts.first403 && hits.pinned === 1) { hits.firstPinned403 += 1; return new Response('', { status: 403 }); }
          return new Response(enc(manifest), { status: 200 });
        }
        hits.main += 1;
        return new Response(enc(stale), { status: 200 });
      }
      const b = cubeFiles.get(path);
      return b ? new Response(b, { status: 200 }) : new Response('', { status: 404 });
    };
    const store = httpStore({ base: POINT_CDN_BASE, fetchImpl: mkFetch() });
    const pinned = manifestStore(store, cubeIndex);
    add('(3) V-FI-1: `manifestStore` pinnt eine jsDelivr-`@main`-Basis an den Index-Commit und zaehlt in DENSELBEN stats',
      pinned.base === `https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@${cubeIndex.commit}` && pinned.stats === store.stats);
    add('(3) V-FI-1: ohne Commit im Index oder ohne jsDelivr-Basis bleibt der Store, wie er ist',
      manifestStore(store, { commit: null }) === store && manifestStore(httpStore({ base: 'https://example.org/x', fetchImpl: mkFetch() }), cubeIndex).base === 'https://example.org/x'
      && manifestStore(memoryStore(cubeFiles), cubeIndex).base === 'memory://');
    const viaPinned = await readCubePoint(store, cubeIndex, 't1', LAT, LON);
    add('(3) V-FI-1: der Leser liest das Manifest GEPINNT und findet die Stufe, obwohl `@main` sie nicht kennt',
      viaPinned?.manifestFrom === 'pinned' && viaPinned.steps.length === tier.leadHours.length && hits.pinned === 1 && hits.main === 0,
      JSON.stringify(hits));
    const reasons = [];
    const noCommit = await readCubePoint(store, { ...cubeIndex, commit: null }, 't1', LAT, LON, { onSkip: (r) => reasons.push(r) });
    add('(3) Negativ-Kontrolle V-FI-3: ohne Commit kommt `@main`, die Stufe fehlt, und der Leser SAGT es (kein stilles `null`)',
      noCommit === null && reasons.length === 1 && /veraltet|V-FI-1/.test(reasons[0]) && /kennt die Stufe nicht/.test(reasons[0]), reasons[0]);
    const s403 = httpStore({ base: POINT_CDN_BASE, fetchImpl: mkFetch({ first403: true }) });
    const hits0 = { ...hits }; hits.pinned = 0; hits.main = 0; hits.firstPinned403 = 0;
    const retried = await readCubePoint(s403, cubeIndex, 't1', LAT, LON);
    add('(3) V-PD-46: ein 403 auf die ERSTE gepinnte Anfrage wird EINMAL wiederholt, dann traegt der Commit',
      retried?.manifestFrom === 'pinned' && hits.firstPinned403 === 1 && hits.pinned === 2 && hits.main === 0, JSON.stringify({ before: hits0, after: hits }));
    const fromMain = await loadRunManifestFrom(httpStore({ base: POINT_CDN_BASE, fetchImpl: async () => new Response(enc(manifest), { status: 200 }) }), `point/${RUN}/run.json`, { commit: null });
    add('(3) V-FI-1: `loadRunManifestFrom` nennt die Herkunft — `main`, wenn nichts gepinnt werden konnte',
      fromMain.from === 'main' && fromMain.manifest?.run === RUN);
    add('(3) V-FI-1: ein vom Aufrufer uebergebenes Manifest wird als `caller` ausgewiesen',
      (await readCubePoint(memoryStore(cubeFiles), cubeIndex, 't1', LAT, LON, { manifest }))?.manifestFrom === 'caller');
  }
}

// ---------------------------------------------------------------------------
// (4) `stepNearest` — der Abstand IST die Aussage
// ---------------------------------------------------------------------------
{
  const steps = [0, 3, 6].map((h) => ({ leadH: h, validAtMs: h * 3_600_000, values: {} }));
  const a = stepNearest(steps, 4 * 3_600_000);
  const b = stepNearest(steps, 2 * 3_600_000);
  add('(4) der naechste Schritt kommt MIT Vorzeichen und Abstand zurueck',
    a.step.leadH === 3 && a.offsetMin === -60 && b.step.leadH === 3 && b.offsetMin === 60,
    `+4 h -> ${a.step.leadH} (${a.offsetMin} min), +2 h -> ${b.step.leadH} (${b.offsetMin} min)`);
  add('(4) leere Reihe gibt `null`, nicht den ersten Schritt', stepNearest([], 0) === null);
  add('(4) Haversine: Muenchen–Wien sind rund 355 km',
    Math.abs(distanceKm(48.137, 11.575, 48.208, 16.373) - 355) < 6,
    `${distanceKm(48.137, 11.575, 48.208, 16.373).toFixed(1)} km`);
}

// ---------------------------------------------------------------------------
// (5) Stationsprodukt
// ---------------------------------------------------------------------------
const STATION_CATALOG = {
  schema: 1, updatedAt: RUN_AT, source: 'mosmix_l', domain: {}, count: 3,
  stations: [
    { id: '10865', name: 'MUENCHEN STADT', lat: 48.1667, lon: 11.5333, elev: 515 },
    { id: 'P659', name: 'OBERSCHLEISSHEIM', lat: 48.2333, lon: 11.55, elev: 484 },
    { id: 'HOCH', name: 'HOCHSOELDEN', lat: 46.98, lon: 10.98, elev: 1800 },
  ],
};
let stationFiles;
let stationManifest;
{
  const nt = 60;
  const planes = CUBE_PLANES.map((pl) => {
    const a = new Int16Array(nt * 1 * 2).fill(MISSING);
    if (pl.id === 't2m') for (let it = 0; it < nt; it++) { a[it * 2 + 0] = quantize(10 + it, pl); a[it * 2 + 1] = quantize(-99, pl); }
    if (pl.id === 'hModEff') { for (let it = 0; it < nt; it++) { a[it * 2 + 0] = quantize(515, pl); a[it * 2 + 1] = quantize(484, pl); } }
    return a;
  });
  const bytes = await encodeCubeChunk({
    runHours: Math.floor(Date.parse(RUN_AT) / 3_600_000),
    tierIndex: 0, nt, y0: 0, x0: 0, ny: 1, nx: 2, planes,
  });
  stationManifest = {
    schema: CUBE_SCHEMA, product: 'stations', source: 'mosmix_l', run: RUN, runAt: RUN_AT, ageH: 1.4,
    tier: 't1', stationCount: 2, axis: { leadHours: Array.from({ length: 60 }, (_, i) => i + 1) },
    chunks: [{ cy: 3, cx: 7, file: `point/stations/${RUN}/03_07.bin`, bytes: bytes.length, stations: ['10865', 'P659'] }],
    planes: CUBE_PLANES.map((pl) => ({ id: pl.id, unit: pl.unit, scale: pl.scale, offset: pl.offset, group: pl.group })),
    notMapped: { ps: 'PPPP ist auf Meeresniveau reduziert.' }, parameters: ['TTT'], caveats: ['ny = 1'],
  };
  stationFiles = new Map([
    ['point/stations/catalog.json', enc(STATION_CATALOG)],
    [`point/stations/${RUN}/stations.json`, enc(stationManifest)],
    [`point/stations/${RUN}/03_07.bin`, bytes],
  ]);

  const cand = nearestStations(STATION_CATALOG, LAT, LON, { elevationM: 519 })[0];
  add('(5) die naechste Station wird gefunden, mit Abstand UND Hoehendifferenz',
    cand.id === '10865' && Math.abs(cand.distanceKm - 5.0) < 1.0 && cand.dElevM === -4,
    `${cand.distanceKm.toFixed(1)} km, ${cand.dElevM} m`);
  add('(5) ohne uebergebene Punkthoehe bleibt `dElevM` `null` — nicht 0, nicht geraten',
    nearestStations(STATION_CATALOG, LAT, LON)[0].dElevM === null);

  const ser = await readStationPoint(memoryStore(stationFiles), stationManifest, cand);
  add('(5) Rundweg Stationsbuendel: richtige SPALTE, ny = 1, stuendliche Achse',
    ser.bundle.column === 0 && ser.steps.length === 60
    && Math.abs(ser.steps[0].values.t2m - 10) < 0.02 && ser.steps[0].values.hModEff === 515,
    `Spalte ${ser.bundle.column}, t2m[0] ${ser.steps[0].values.t2m}`);
  add('(5) Negativ-Kontrolle: die NACHBARSPALTE traegt einen anderen Wert (keine Spaltenverschiebung)',
    Math.abs((await readStationPoint(memoryStore(stationFiles), stationManifest,
      nearestStations(STATION_CATALOG, 48.2333, 11.55, { elevationM: 484 })[0])).steps[0].values.t2m + 99) < 0.02);
  add('(5) was MOSMIX NICHT fuehrt, kommt mit Grund mit — benannt abwesend',
    Object.keys(ser.notMapped).includes('ps') && ser.notMapped.ps.includes('Meeresniveau'));
}

// ---------------------------------------------------------------------------
// (6) Nowcast: Stempel, Kern, und V-PD-56
// ---------------------------------------------------------------------------
{
  const d = new Date(Date.UTC(2026, 8, 12, 20, 40));
  add('(6) Stempelformen wie am Spiegel GEMESSEN: rv `YYMMDDHHMM`, inca/rzc `YYYYMMDDTHHMM`',
    nowcastStampOf('radvor_rv', d) === '2609122040'
    && nowcastStampOf('inca', new Date(Date.UTC(2026, 8, 12, 20, 15))) === '20260912T2015'
    && NOWCAST_STAMP_FORM.combiprecip === 'iso');
  const stamps = nowcastSlotStamps('radvor_rv', Date.UTC(2026, 8, 12, 20, 42), 15);
  add('(6) die Slot-Suche laeuft rueckwaerts im eigenen Raster, juengster zuerst',
    stamps[0] === '2609122040' && stamps[1] === '2609122035' && stamps.length === 4, stamps.join(' '));
  add('(6) beide Stempelformen sind eindeutig zurueckrechenbar',
    stampMs('2609122040') === Date.UTC(2026, 8, 12, 20, 40)
    && stampMs('20260912T2015') === Date.UTC(2026, 8, 12, 20, 15) && stampMs('quatsch') === null);

  // Ein 3x3-„Bild" reicht: geprüft wird die Regel, nicht die Projektion.
  const png = { data: new Uint8Array(9).fill(128), width: 3, height: 3, channels: 1 };
  const meta = {
    stamp: '2609122040', vMax: NOWCAST_VMAX, width: 3, height: 3,
    runAtMs: Date.UTC(2026, 8, 12, 20, 40),
    frames: [{ file: 'f120.png', lead: 120, validAtMs: Date.UTC(2026, 8, 12, 20, 40) }],
  };
  const s = sampleNowcastFrame('radvor_rv', meta, png, 48.137, 11.575, meta.frames[0]);
  add('(6) V-PD-56: die Gueltigzeit kommt aus Slot + `lead`, NICHT aus `frame.validAtMs`',
    s && s.validAtMs === meta.runAtMs + 120 * 60_000,
    s ? new Date(s.validAtMs).toISOString() : 'null');
  add('(6) der Widerspruch wird BERICHTET (`validAtSuspect`), nicht weggerechnet',
    s?.validAtSuspect === true);
  add('(6) Negativ-Kontrolle: stimmen beide ueberein, ist nichts verdaechtig',
    sampleNowcastFrame('radvor_rv', meta, png, 48.137, 11.575,
      { file: 'f000.png', lead: 0, validAtMs: meta.runAtMs })?.validAtSuspect === false);

  add('(6) ausserhalb der Domaene gibt es `null`, keine erfundene Null (PD-B3, Wien)',
    sampleNowcastFrame('radvor_rv', meta, png, 48.208, 16.373, meta.frames[0]) === null);
  add('(6) Byte 255 heisst gesaettigt und liefert KEINEN Wert',
    (() => {
      const r = sampleNowcastFrame('radvor_rv', meta, { ...png, data: new Uint8Array(9).fill(255) }, 48.137, 11.575, meta.frames[0]);
      return r?.saturated === true && r.mmh === null;
    })());
  add('(6) Byte 0 heisst 0 mm/h — die Zweideutigkeit faengt die Domaenenpruefung davor ab',
    sampleNowcastFrame('radvor_rv', meta, { ...png, data: new Uint8Array(9) }, 48.137, 11.575, meta.frames[0])?.mmh === 0);
  add('(6) ein abweichendes `vMax` bricht LAUT ab (Drift-Waechter)',
    (() => {
      try { sampleNowcastFrame('radvor_rv', { ...meta, vMax: 100 }, png, 48.137, 11.575, meta.frames[0]); return false; }
      catch (e) { return /vMax/.test(String(e.message)); }
    })());
}

// ---------------------------------------------------------------------------
// (7) Die Auswahlregel
// ---------------------------------------------------------------------------
{
  const all = new Map([...cubeFiles, ...stationFiles]);
  const idx = {
    ...cubeIndex,
    stations: {
      dir: 'point/stations', catalog: 'point/stations/catalog.json', source: 'mosmix_l',
      runs: [{ run: RUN, runAt: RUN_AT, ageH: 1.4, path: `point/stations/${RUN}`, manifest: `point/stations/${RUN}/stations.json`, stationCount: 2, leadHours: 60, bytes: 1 }],
    },
  };
  all.set('point/index.json', enc(idx));
  const at = (h) => Date.parse(RUN_AT) + h * 3_600_000;
  const plan = async (lat, lon, atMs, elevationM) =>
    planPointSources(memoryStore(all), { lat, lon, atMs, elevationM, nowMs: Date.parse(RUN_AT) });

  const p1 = await (plan(LAT, LON, at(4), 519));
  add('(7) Cube trifft die Stunde auf seinem Raster ⇒ er gewinnt, die Station steht als Alternative daneben',
    p1.decisions[0].primary.product === 'cube-t1' && p1.decisions[0].alternative.product === 'stations',
    p1.decisions[0].primary.reason);
  add('(7) der Grund nennt die 39 Ebenen, die der Cube mehr traegt',
    /39 Ebenen mehr/.test(p1.decisions[0].alternative.reason));

  // Der Fehler, den erst das lebende Datum gezeigt hat: verfehlen BEIDE das Raster
  // gleich weit, darf die Station nicht gewinnen — sie kann dann nichts besser.
  const p1b = await (plan(LAT, LON, at(4) + 25 * 60_000, 519));
  add('(7) Negativ-Kontrolle Raster: bei 07:25 verfehlen Cube und Station gleich weit ⇒ der Cube bleibt primaer',
    p1b.decisions[0].primary.product === 'cube-t1'
    && Math.abs(Math.abs(p1b.decisions[0].primary.offsetMin) - 25) < 1e-6
    && Math.abs(Math.abs(p1b.decisions[0].alternative.offsetMin) - 25) < 1e-6,
    `cube ${p1b.decisions[0].primary.offsetMin} min · station ${p1b.decisions[0].alternative.offsetMin} min`);

  const p2 = await (plan(46.98, 10.98 + 0.2, at(4), 1200));
  add('(7) Negativ-Kontrolle Abstand: eine Station 15+ km entfernt vertritt den Punkt NICHT',
    p2.station.accepted === false && /Schwelle 15 km/.test(p2.station.reason), p2.station.reason);

  // 0,5 km neben Hochsoelden (E-F-12 greift erst bei ≤ 250 m), 900 m tiefer als die Station.
  const p3 = await (plan(46.98 + 0.0045, 10.98, at(4), 900));
  add('(7) Negativ-Kontrolle Hoehe: 0,5 km entfernt, aber 900 m hoeher ⇒ abgelehnt, mit Grund',
    p3.station.accepted === false && /Bias-Korrektur/.test(p3.station.reason), p3.station.reason);
  // E-F-12 (Jan, 17.09.): AN der Station (≤ 250 m) gilt ihre Hoehe als Punkthoehe — auch wenn der
  // Aufrufer (DEM) 900 m weniger uebergibt; die Station vertritt den Punkt, mit Grund.
  const p3b = await (plan(46.98 + 0.002, 10.98, at(4), 900));
  add('(7) E-F-12: 0,2 km von der Station, DEM 900 m tiefer ⇒ die Station steht am Punkt und vertritt ihn, ihre Hoehe gilt',
    p3b.station.accepted === true && /steht an der Station/.test(p3b.station.reason) && /1800 m/.test(p3b.station.reason) && SELECTION.stationAtPointKm === 0.25, p3b.station.reason);
  const p3c = await (plan(46.98 + 0.0025, 10.98, at(4), 900));
  add('(7) E-F-12 Negativ-Kontrolle: 0,28 km ⇒ die Regel greift nicht mehr, das Hoehenkriterium lehnt ab',
    p3c.station.accepted === false && /Bias-Korrektur/.test(p3c.station.reason), p3c.station.reason);

  const p4 = await (plan(LAT, LON, at(400), 519));
  add('(7) jenseits jeder Achse gibt es KEINE Wahl — und jeder Kandidat sagt, warum',
    p4.decisions[0].primary === null && p4.decisions[0].candidates.every((c) => !c.available && c.reason.length > 10),
    p4.decisions[0].candidates.map((c) => c.product).join(','));
  add('(7) die Luecke wird als Luecke gefuehrt, nicht als leeres Ergebnis',
    p4.gaps.length === 1 && /trägt 0…48 h/.test(p4.gaps[0].why));
  // PA3 (§9.12): Abschnitte sind halboffen und lueckenlos — toMs = letzte Entscheidungszeit +
  // Schritt − 1 ms, bei einem wie bei vielen Schritten. Vorher endete ein mehrstufiger Abschnitt
  // auf der letzten Entscheidungszeit selbst (im Archiv sah das wie 6-h-Loecher aus).
  {
    const H6 = 6 * 3_600_000;
    const pr = await planPointSources(memoryStore(all), { lat: LAT, lon: LON, elevationM: 519, fromMs: at(0), toMs: at(400), stepH: 6, nowMs: Date.parse(RUN_AT) });
    const segs = pr.segments;
    const contiguous = segs.every((s, i) => (i === 0 || s.fromMs === segs[i - 1].toMs + 1) && (s.toMs - s.fromMs + 1) === s.steps * H6);
    const lastGap = pr.gaps[pr.gaps.length - 1];
    add('(7) PA3: Abschnitte lueckenlos aneinander, Laenge = Schritte × 6 h, auch der einstufige; Luecken enden auf Schrittende',
      segs.length >= 3 && contiguous && segs.some((s) => s.steps === 1) && lastGap && (lastGap.toMs - lastGap.fromMs + 1) % H6 === 0,
      segs.map((s) => `${s.primary ?? '-'}×${s.steps}`).join(' '));
  }

  const p5 = await (plan(41.9, 12.5, at(4), 20));
  add('(7) ausserhalb des Cube-Ausschnitts faellt die Stufe mit dem Ausschnitt als Grund durch',
    p5.decisions[0].primary === null
    && /außerhalb des Cube-Ausschnitts/.test(p5.decisions[0].candidates.find((c) => c.product === 'cube-t1').reason),
    p5.decisions[0].candidates.find((c) => c.product === 'cube-t1').reason);

  add('(7) ohne Punkthoehe wird das Hoehenkriterium NICHT stillschweigend uebersprungen',
    /Höhenkriterium NICHT geprüft/.test((await plan(LAT, LON, at(4))).station.reason));

  // Der Rasterfall: eine Stufe mit 3-h-Raster, angefragt auf eine ungerade Stunde.
  const t2Idx = JSON.parse(JSON.stringify(idx));
  t2Idx.latestByTier.t1 = null;
  t2Idx.latestByTier.t2 = { run: RUN, runAt: RUN_AT, path: `point/${RUN}`, manifest: `point/${RUN}/run.json`, sourceRun: RUN, sourceRunAt: RUN_AT, ageH: 0, files: 1, bytes: 1 };
  const all2 = new Map(all);
  all2.set('point/index.json', enc(t2Idx));
  // +52 h liegt IM t2-Band (51…120 h), aber NICHT auf dessen 3-h-Raster (51, 54, …).
  const p6 = await planPointSources(memoryStore(all2), { lat: LAT, lon: LON, atMs: at(52), elevationM: 519, nowMs: Date.parse(RUN_AT) });
  add('(7) trifft der Cube die Stunde NICHT (t2, 3-h-Raster), gewinnt die stuendliche Station — mit dem Abstand als Grund',
    p6.decisions[0].primary.product === 'stations' && /min Abstand/.test(p6.decisions[0].primary.reason)
    && p6.decisions[0].alternative.product === 'cube-t2',
    p6.decisions[0].primary.reason.slice(-95));
  add('(7) Gegenprobe: EINE Stunde weiter liegt t2 auf seinem Raster und gewinnt wieder',
    (await planPointSources(memoryStore(all2), { lat: LAT, lon: LON, atMs: at(54), elevationM: 519, nowMs: Date.parse(RUN_AT) }))
      .decisions[0].primary.product === 'cube-t2');

  add('(7) die Schwellen sind als UNGEMESSEN gekennzeichnet (wie die Profil-Schwellen aus PD-B5)',
    SELECTION.calibrated === false && SELECTION.stationMaxKm === 15 && SELECTION.stationMaxDElevM === 100);
}

// ---------------------------------------------------------------------------
// (8) Keine zweite Fassung, kein Bundle-Zuwachs
// ---------------------------------------------------------------------------
{
  const reader = readFileSync(join(ROOT, 'scripts/point/nowcastReader.mjs'), 'utf8');
  add('(8) der Datei-Leser benutzt denselben Kern wie der Netz-Leser (keine zweite Abtastung)',
    /import \{ sampleNowcastFrame \} from '\.\.\/\.\.\/src\/point\/nowcastSample\.ts'/.test(reader)
    && /return sampleNowcastFrame\(/.test(reader)
    && !/function cornersOf/.test(reader));

  const dist = join(ROOT, 'dist/assets');
  if (!existsSync(dist)) {
    add('(8) Textsonde am Bundle — uebersprungen, kein `dist/assets` (erst nach `npm run build`)', true, 'uebersprungen');
  } else {
    const js = readdirSync(dist).filter((f) => f.endsWith('.js'));
    // AP11 (Phase FI): seit das Punkt-Panel den Cube-Pfad hinter `?pf=cube` lädt, GIBT es einen Verbraucher — die Regel
    // heißt deshalb nicht mehr „in keinem Chunk", sondern „nur in den Lazy-Chunks, die das Panel per dynamischem Import
    // holt" (cubeSource, PointForecastBands, der Dekodier-Worker). Nie im Start-Chunk (alles, was index.html lädt) und
    // nie im MapView-Chunk, den jeder Kartenbesuch lädt. Gegenprobe: im Cube-Chunk MÜSSEN die Marken stehen.
    const html = readFileSync(join(ROOT, 'dist/index.html'), 'utf8');
    const eager = new Set([...html.matchAll(/(?:src|href)="\/?assets\/([^"]+\.js)"/g)].map((m) => m[1]));
    const lazyOk = (f) => /^(cubeSource|PointForecastBands|decodeWorker)-/.test(f);
    const needles = ['planPointSources', 'readCubePoint', 'nowcastSlotStamps', 'stationMaxDElevM',
      'readHmodelPoint', 'belowGroundHPa', 'derived-gh-sp',
      // AP1: der parallele Leser, der Cache und der Dekodier-Pool
      'readPointBundle', 'cachedStore', 'decodeChunkPooled', 'loadTerrainAtPoint'];
    const hits = [];
    for (const f of js) {
      if (lazyOk(f)) continue;
      const t = readFileSync(join(dist, f), 'utf8');
      for (const needle of needles) if (t.includes(needle)) hits.push(`${f}:${needle}`);
    }
    const cubeChunk = js.find((f) => /^cubeSource-/.test(f));
    const cubeText = cubeChunk ? readFileSync(join(dist, cubeChunk), 'utf8') : '';
    add('(8) Punkt-Module stehen nur im Lazy-Chunk des Cube-Pfads (AP11: Verbraucher hinter ?pf=cube) — nicht im Start-Chunk, nicht im MapView-Chunk; Gegenprobe: im Cube-Chunk stehen sie',
      hits.length === 0 && eager.size > 0 && !!cubeChunk && !eager.has(cubeChunk) && ['stationMaxDElevM', 'belowGroundHPa'].every((n) => cubeText.includes(n)),
      hits.join(' ') || `${js.length} Chunks geprueft, Start-Chunks ${[...eager].join(',')}, Cube-Chunk ${cubeChunk ?? 'fehlt'}`);
    // AP12: die neuen Wege (Ebenen-Bereiche, progressive Ausgabe, Index-SWR) — Textmarken, die eine Minifizierung überleben.
    const marks12 = ['chunkRanges:', 'Ebenen-Bereiche gescheitert', 'SWR-Kopie', 'erste Darstellung aus', 'Messung folgt (progressiv'];
    const hits12 = [];
    for (const f of js) {
      if (lazyOk(f)) continue;
      const t = readFileSync(join(dist, f), 'utf8');
      for (const needle of marks12) if (t.includes(needle)) hits12.push(`${f}:${needle}`);
    }
    // Gegenprobe auf das eigene Muster: jede Marke steht wirklich im Quelltext — sonst wäre ihre Abwesenheit im Bundle keine Aussage.
    const srcText = ['src/point/client/chunkRanges.ts', 'src/point/client/readPoint.ts', 'src/pointForecast/cubeSource.ts'].map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
    const missingInSrc = marks12.filter((n) => !srcText.includes(n));
    add('(8) AP12: Ebenen-Bereiche, progressive Ausgabe und Index-SWR stehen nur im Lazy-Chunk des Cube-Pfads (nicht im Start-Chunk, nicht im MapView-Chunk); jede Marke steht im Quelltext und im Cube-Chunk',
      hits12.length === 0 && missingInSrc.length === 0 && marks12.every((n) => cubeText.includes(n)),
      (hits12.join(' ') || `${js.length} Chunks geprueft`) + (missingInSrc.length ? ` · fehlt im Quelltext: ${missingInSrc.join(', ')}` : ''));
  }
}

// ---------------------------------------------------------------------------
// (9) PD-E: Druckflaechen am Punkt und die Modellhoehe je Quelle
// ---------------------------------------------------------------------------
{
  const {
    PRESSURE_LEVELS_HPA, pressurePlaneId, pressureLevelsForTier,
    staticChunkPath, staticManifestPath, HMODEL_PRODUCT, HMODEL_VERSION,
  } = await import('../src/point/cubeFormat.ts');

  // ── Rundweg mit echten Zahlen: Zermatt-Fall (925 und 850 unter Grund) ──────
  //
  // Am echten Bau gemessen (2026-09-13, t1): Zermatt hat ps 752 hPa und meldet auf
  // 925 hPa 19,5 Grad C, waehrend am Boden 4,2 stehen. Genau dieser Fall wird hier
  // nachgebaut — er ist der Grund, warum `belowGroundHPa` existiert.
  const tier = TIER_BY_ID.t1;
  const cell = cellOf(tier, LAT, LON);
  const ch = chunkOf(cell.iy, cell.ix);
  const ext = chunkExtent(tier, ch.cy, ch.cx);
  const nt = tier.leadHours.length;
  const nCells = nt * ext.ny * ext.nx;
  const SET = { ps: 752.3, t925: 19.5, t850: 14.7, t700: 6.2, rh925: 40, rh850: 39, rh700: 17, t2m: 4.2 };
  const planesPE = CUBE_PLANES.map((pl) => {
    const arr = new Int16Array(nCells).fill(MISSING);
    if (SET[pl.id] != null) arr.fill(quantize(SET[pl.id], pl));
    return arr;
  });
  const bytesPE = await encodeCubeChunk({
    runHours: Math.floor(Date.parse(RUN_AT) / 3_600_000),
    tierIndex: tier.index, nt, y0: ext.y0, x0: ext.x0, ny: ext.ny, nx: ext.nx, planes: planesPE,
  });
  const manPE = {
    schema: CUBE_SCHEMA, run: RUN, runAt: RUN_AT,
    planes: CUBE_PLANES.map((pl) => ({ id: pl.id, unit: pl.unit, scale: pl.scale, offset: pl.offset, group: pl.group })),
    sources: [{ id: 'icon_d2', name: 'ICON-D2', tier: 't1', runAt: RUN_AT, steps: nt, role: 'assigned', coverage: 'full', offsetH: 0 }],
    tiers: [{
      id: 't1', deg: tier.deg, lat0: tier.lat0, lon0: tier.lon0, ny: tier.ny, nx: tier.nx,
      chunk: tier.chunk, run: RUN, runAt: RUN_AT, ageH: 0, leadHours: [...tier.leadHours],
      files: [{ file: chunkPath(RUN, tier, ch.cy, ch.cx), bytes: bytesPE.length, cy: ch.cy, cx: ch.cx }],
      quantiles: null, ensemble: null, profile: null, net: null, dropped: [],
    }],
    fusion: {}, skipped: {}, pending: {},
  };
  const filesPE = new Map([
    ['point/index.json', enc(cubeIndex)],
    [`point/${RUN}/run.json`, enc(manPE)],
    [chunkPath(RUN, tier, ch.cy, ch.cx), bytesPE],
  ]);
  const serPE = await readCubePoint(memoryStore(filesPE), cubeIndex, 't1', LAT, LON);
  const s0 = serPE.steps[0];

  add('(9) die sechs Druckflaechen-Ebenen kommen am Punkt zurueck',
    Math.abs(s0.values.t850 - 14.7) < 0.01 && Math.abs(s0.values.rh700 - 17) < 0.05,
    `t850 ${s0.values.t850}, rh700 ${s0.values.rh700}`);
  add('(9) T faellt mit der Hoehe (t925 > t850 > t700)',
    s0.values.t925 > s0.values.t850 && s0.values.t850 > s0.values.t700);
  add('(9) unter Grund wird BENANNT: bei ps 752 hPa liegen 925 und 850 darunter',
    JSON.stringify(s0.belowGroundHPa) === '[925,850]', JSON.stringify(s0.belowGroundHPa));
  add('(9) und 700 hPa nicht — die Fläche liegt ueber Grund',
    !s0.belowGroundHPa.includes(700));

  // Gegenkontrolle: im Flachland ist keine Flaeche unter Grund.
  {
    const flat = CUBE_PLANES.map((pl) => {
      const arr = new Int16Array(nCells).fill(MISSING);
      const v = pl.id === 'ps' ? 1015.2 : SET[pl.id];
      if (v != null) arr.fill(quantize(v, pl));
      return arr;
    });
    const b = await encodeCubeChunk({
      runHours: Math.floor(Date.parse(RUN_AT) / 3_600_000),
      tierIndex: tier.index, nt, y0: ext.y0, x0: ext.x0, ny: ext.ny, nx: ext.nx, planes: flat,
    });
    const f = new Map(filesPE);
    f.set(chunkPath(RUN, tier, ch.cy, ch.cx), b);
    const ser = await readCubePoint(memoryStore(f), cubeIndex, 't1', LAT, LON);
    add('(9) Gegenkontrolle Flachland (ps 1015 hPa): keine Flaeche unter Grund',
      Array.isArray(ser.steps[0].belowGroundHPa) && ser.steps[0].belowGroundHPa.length === 0);
  }
  // Gegenkontrolle: ohne `ps` wird NICHT geraten.
  {
    const ser = await readCubePoint(memoryStore(filesPE), cubeIndex, 't1', LAT, LON, { wanted: ['t925', 't850'] });
    add('(9) Gegenkontrolle: ohne ps ist es nicht entscheidbar — `null`, nicht `[]`',
      ser.steps[0].belowGroundHPa === null);
  }
  // Gegenkontrolle: ein Lauf OHNE Druckflaechen (Schema 4) sagt ebenfalls `null` —
  // `[]` hiesse „geprueft, alle ueber Grund" und waere dort eine unbelegte Aussage.
  {
    const ser = await readCubePoint(memoryStore(filesPE), cubeIndex, 't1', LAT, LON, { wanted: ['ps', 't2m'] });
    add('(9) Gegenkontrolle: ohne jede Druckflaeche ebenfalls `null`, nicht `[]`',
      ser.steps[0].belowGroundHPa === null && ser.steps[0].values.ps != null);
  }
  // E-E-4 (Jan, 2026-09-15): seither traegt auch t3 alle drei Flaechen.
  add('(9) die Flaechen sind dieselben wie im Format, und seit E-E-4 traegt auch t3 alle drei',
    PRESSURE_LEVELS_HPA.join() === '925,850,700' && pressureLevelsForTier('t3').join() === '925,850,700');
  add('(9) die Ebenen-IDs kommen aus EINER Regel',
    pressurePlaneId('t', 850) === 't850' && pressurePlaneId('rh', 925) === 'rh925');

  // ── Modellhoehe je Quelle: Producer schreibt, Client liest ────────────────
  //
  // Ein echter Rundweg ueber `writeStaticHmodel` — nicht ueber eine nachgebaute Datei.
  // Die Zahlen sind die am 2026-09-13 in t3 gemessenen (Innsbruck).
  {
    const st = await staticHmodelSelfTest();
    add('(9) staticHmodel-Selbsttest', st.pass === st.total, `${st.pass}/${st.total}`);

    const t3 = TIER_BY_ID.t3;
    const n3 = t3.ny * t3.nx;
    const IBK = { lat: 47.27, lon: 11.39 };
    const c3 = cellOf(t3, IBK.lat, IBK.lon);
    const at = c3.iy * t3.nx + c3.ix;
    const mk = (v) => { const g = new Float32Array(n3).fill(NaN); g[at] = v; return g; };
    const cols = [
      { id: 'icon_global', provenance: 'native', grid: mk(1332) },
      { id: 'ifs_hres', provenance: 'derived-gh-sp', grid: mk(1402), note: 'aus gh + sp' },
      { id: 'aifs_single', provenance: 'derived-gh-sp', grid: mk(1672) },
    ];
    const tmp = join(ROOT, 'data', `.verify-client-static-${process.pid}`);
    rmSync(tmp, { recursive: true, force: true });
    try {
    const res = await writeStaticHmodel(tmp, 't3', cols,
      { run: RUN, absent: { claef: 'GeoSphere veroeffentlicht keine Modellorographie' } });
    add('(9) das Produkt wird geschrieben', res.changed && res.planes.length === 3);

    // Store aus den geschriebenen Dateien — POINT_OUT ist das point/-Verzeichnis.
    const files = new Map();
    const rel = (p) => p.replace(/^point\//, '');
    files.set(staticManifestPath(HMODEL_PRODUCT, HMODEL_VERSION),
      new Uint8Array(readFileSync(join(tmp, rel(staticManifestPath(HMODEL_PRODUCT, HMODEL_VERSION))))));
    for (let cy = 0; cy < t3.chunk.cy; cy++) {
      for (let cx = 0; cx < t3.chunk.cx; cx++) {
        const pth = staticChunkPath(HMODEL_PRODUCT, HMODEL_VERSION, 't3', cy, cx);
        files.set(pth, new Uint8Array(readFileSync(join(tmp, rel(pth)))));
      }
    }
    const store = memoryStore(files);
    const hm = await loadHmodelManifest(store);
    const pt = await readHmodelPoint(store, hm, 't3', IBK.lat, IBK.lon);
    add('(9) der Client liest jede Spalte einzeln zurueck',
      pt.bySource.icon_global === 1332 && pt.bySource.ifs_hres === 1402 && pt.bySource.aifs_single === 1672,
      JSON.stringify(pt.bySource));
    add('(9) die Herkunft kommt mit — abgeleitet ist als abgeleitet erkennbar',
      pt.provenance.icon_global === 'native' && pt.provenance.ifs_hres === 'derived-gh-sp');
    add('(9) die Spanne beziffert, was hModEff verschweigt', pt.spreadM === 340, `${pt.spreadM} m`);
    add('(9) wer keine Hoehe hat, steht mit GRUND da', !!pt.absent.claef);
    add('(9) eine Zelle ohne Wert ist `null`, nicht 0',
      (await readHmodelPoint(store, hm, 't3', 53.55, 9.99)).bySource.icon_global === null);
    add('(9) der Client liest EINEN kleinen Chunk, nicht das Gitter',
      pt.chunk.bytes < 4096, `${pt.chunk.bytes} B`);
    // Gegenkontrolle: mit der Cube-Ebenenliste gelesen muss es laut krachen.
    let threw = false;
    try {
      await decodeCubeChunk(files.get(staticChunkPath(HMODEL_PRODUCT, HMODEL_VERSION, 't3', pt.chunk.cy, pt.chunk.cx)), {});
    } catch { threw = true; }
    add('(9) Gegenkontrolle: mit CUBE_PLANES gelesen bricht es ab, statt Spalten zu verschieben', threw);
    add('(9) fehlt das Produkt, gibt der Leser `null` statt zu werfen',
      (await loadHmodelManifest(memoryStore(new Map()))) === null);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
}

// ---------------------------------------------------------------------------
// (10) Phase FI, AP1: der parallele Leseweg, Cache, Dekodier-Pool, Nowcast auf
//      Ausgabezeiten, Zwei-Skalen-Gelaende — netzfrei, gegen dieselben Fixtures
// ---------------------------------------------------------------------------
{
  const { readPointBundle, tiersForWindow, nowcastTimes } = await import('../src/point/client/readPoint.ts');
  const { memoStore } = await import('../src/point/client/store.ts');
  const { cachedStore, memoryBackend, defaultCachePolicy, newCacheStats } = await import('../src/point/client/cache.ts');
  const { decodeChunkPooled, decodeChunkMain, decodePoolInfo } = await import('../src/point/client/decodePool.ts');
  const { loadTerrainAtPoint, tilesForRadius, TERRAIN_SCALES } = await import('../src/point/client/terrain.ts');
  const { findLatestSlot, readNowcastPoint } = await import('../src/point/client/nowcastPoint.ts');
  const { judgeStation } = await import('../src/point/client/resolve.ts');
  const { loadPointIndex } = await import('../src/point/client/cubePoint.ts');
  const { stationBundlePath } = await import('../src/point/cubeFormat.ts');
  const H = 3_600_000;
  const t1 = TIER_BY_ID.t1;
  const at = (h) => Date.parse(RUN_AT) + h * H;
  const manifest = JSON.parse(new TextDecoder().decode(cubeFiles.get(`point/${RUN}/run.json`)));
  const chunkP = [...cubeFiles.keys()].find((k) => k.endsWith('.bin'));
  const idx = { ...cubeIndex, stations: { dir: 'point/stations', catalog: 'point/stations/catalog.json', source: 'mosmix_l',
    runs: [{ run: RUN, runAt: RUN_AT, ageH: 1.4, path: `point/stations/${RUN}`, manifest: `point/stations/${RUN}/stations.json`, stationCount: 2, leadHours: 60, bytes: 1 }] } };
  const all = new Map([...cubeFiles, ...stationFiles]);
  all.set('point/index.json', enc(idx));
  const NOW = Date.parse(RUN_AT);

  // ── (10a) Buendel == serielle Leser ───────────────────────────────────────
  const b = await readPointBundle({ lat: LAT, lon: LON, atMs: at(4), elevationM: 519, nowMs: NOW }, { store: memoryStore(all), terrain: false, nowcast: false, decodeChunk: decodeChunkMain });
  const serial = await readCubePoint(memoryStore(all), idx, 't1', LAT, LON);
  const serialSt = await readStationPoint(memoryStore(all), stationManifest, nearestStations(STATION_CATALOG, LAT, LON, { elevationM: 519 })[0]);
  add('(10) AP1: das Buendel liefert die Stufe t1 wertgleich zum seriellen Leser',
    !!b.cube.t1 && JSON.stringify(b.cube.t1.steps) === JSON.stringify(serial.steps) && b.tiers.join() === 't1', `tiers ${b.tiers.join()}, errors ${b.errors.join('; ')}`);
  add('(10) AP1: … und die Station wertgleich, in derselben Spalte',
    !!b.station && JSON.stringify(b.station.steps) === JSON.stringify(serialSt.steps) && b.station.bundle.column === serialSt.bundle.column, b.skips.join('; '));
  add('(10) AP1: die Auswahlregel laeuft am Ende mit und sieht dasselbe (cube-t1 primaer, Station daneben)',
    b.plan?.decisions[0].primary?.product === 'cube-t1' && b.plan?.decisions[0].alternative?.product === 'stations');
  add('(10) AP1: Stationsurteil aus EINER Regel — Buendel und Plan nennen denselben Grund',
    !!b.stationChoice && b.stationChoice.reason === b.plan?.station.reason && judgeStation(true, b.stationChoice.candidate, 519).reason === b.stationChoice.reason);
  add('(10) AP1: Negativkontrolle — eine um eine Zelle verschobene Anfrage liefert andere Werte',
    (await readPointBundle({ lat: LAT + t1.deg, lon: LON, atMs: at(4), nowMs: NOW }, { store: memoryStore(all), terrain: false, nowcast: false })).cube.t1?.steps[0].values.t2m !== b.cube.t1.steps[0].values.t2m);
  add('(10) AP1: Zeiten je Produkt (doneAt/phases), erste Darstellung und Lesephase stehen im Ergebnis',
    typeof b.timing.readMs === 'number' && b.timing.doneAt['cube.t1'] != null && b.timing.phases['decode.t1'] != null && b.timing.firstMs != null && b.timing.indexMs != null);

  // ── (10b) Veraltetes / fehlendes Manifest: Werte bleiben, Provenienz wird benannt ─
  {
    // Wie am CDN (V-FI-1): das veraltete Manifest kennt weder die Stufe noch ihre Quellen.
    const stale = new Map(all); stale.set(`point/${RUN}/run.json`, enc({ ...manifest, tiers: [], sources: [] }));
    const bs = await readPointBundle({ lat: LAT, lon: LON, atMs: at(4), nowMs: NOW }, { store: memoryStore(stale), terrain: false, nowcast: false });
    add('(10) V-FI-1/V-FI-3: kennt das Manifest die Stufe nicht, kommen die Werte trotzdem aus dem Chunk — mit benannter Provenienzluecke',
      !!bs.cube.t1 && JSON.stringify(bs.cube.t1.steps) === JSON.stringify(serial.steps) && /kennt die Stufe nicht/.test(bs.cube.t1.provenanceNote ?? '')
      && bs.notes.some((n) => /kennt die Stufe nicht/.test(n)) && bs.cube.t1.sources.length === 0, bs.cube.t1?.provenanceNote);
    add('(10) Gegenprobe: der SERIELLE Leser gibt dort weiter `null` (Sammler-Vertrag unveraendert)',
      (await readCubePoint(memoryStore(stale), idx, 't1', LAT, LON)) === null);
    const none = new Map(all); none.delete(`point/${RUN}/run.json`);
    const bn = await readPointBundle({ lat: LAT, lon: LON, atMs: at(4), nowMs: NOW }, { store: memoryStore(none), terrain: false, nowcast: false });
    add('(10) ohne jedes Manifest: Werte da, `manifestFrom: none`, Hinweis „nicht lesbar"',
      bn.cube.t1?.manifestFrom === 'none' && /nicht lesbar/.test(bn.cube.t1?.provenanceNote ?? '') && bn.cube.t1?.steps.length === t1.leadHours.length);
  }

  // ── (10c) Stufenwahl aus dem Fenster, Nowcast-Zeiten ──────────────────────
  {
    const idx3 = JSON.parse(JSON.stringify(idx));
    const mk = (run) => ({ run, runAt: RUN_AT, path: `point/${run}`, manifest: `point/${run}/run.json`, sourceRun: run, sourceRunAt: RUN_AT, ageH: 0, files: 1, bytes: 1 });
    idx3.latestByTier.t2 = mk(RUN); idx3.latestByTier.t3 = mk(RUN);
    add('(10) tiersForWindow: +4 h ⇒ t1 · +60 h ⇒ t2 · +200 h ⇒ t3 · 0…336 h ⇒ alle · +400 h ⇒ keine · Naht +49 h ⇒ t1 UND t2 (Rand 3 h)',
      tiersForWindow(idx3, at(4), at(4)).join() === 't1' && tiersForWindow(idx3, at(60), at(60)).join() === 't2' && tiersForWindow(idx3, at(200), at(200)).join() === 't3'
      && tiersForWindow(idx3, at(0), at(336)).join() === 't1,t2,t3' && tiersForWindow(idx3, at(400), at(400)).length === 0 && tiersForWindow(idx3, at(49), at(49)).join() === 't1,t2');
    add('(10) nowcastTimes: stuendliches Raster ab jetzt ⇒ 0/1/2/3 h im Radar-Horizont, +5 h nicht, ein Zeitpunkt ⇒ genau er',
      nowcastTimes(at(0), at(336), 1, at(0)).length === 4 && nowcastTimes(at(5), at(5), 1, at(0)).length === 0 && nowcastTimes(at(1), at(1), 1, at(0)).length === 1);
  }

  // ── (10d) Nowcast nur auf den Ausgabezeiten, parallel; Sonden im Buendel (V-FI-2, V-FI-5) ─
  {
    const slotMs = Date.UTC(2026, 8, 12, 20, 40); const stamp = '2609122040';
    const frames = []; for (let l = 0; l <= 120; l += 5) frames.push({ file: `f${String(l).padStart(3, '0')}.png`, lead: l, validAtMs: slotMs });
    const meta = { stamp, vMax: NOWCAST_VMAX, width: 3, height: 3, runAtMs: slotMs, frames };
    const files = new Map([[`radar/img/v1/rv/${stamp}/meta.json`, enc(meta)]]);
    for (const f of frames) files.set(`radar/img/v1/rv/${stamp}/${f.file}`, new Uint8Array([f.lead]));   // „PNG" = ein Byte = lead
    const fakePng = (bytes) => ({ data: new Uint8Array(9).fill(bytes[0] + 1), width: 3, height: 3, channels: 1 });
    const nowMs = slotMs + 3 * 60_000;
    const st = memoryStore(files);
    const r = await readNowcastPoint(st, 'radvor_rv', LAT, LON, { nowMs, decodePng: fakePng, atMs: [slotMs, slotMs + H, slotMs + 2 * H], probeBatch: 4 });
    add('(10) V-FI-2: drei Ausgabezeiten ⇒ drei Frames (0/60/120) von 25 im Slot, Bytes nur fuer drei',
      !!r && r.frames.map((f) => f.lead).join() === '0,60,120' && r.framesInSlot === 25 && r.framesFetched === 3 && st.stats.files === 4, r ? `leads ${r.frames.map((f) => f.lead).join()} files ${st.stats.files}` : 'null');
    const full = await readNowcastPoint(memoryStore(files), 'radvor_rv', LAT, LON, { nowMs, decodePng: fakePng, fromMs: slotMs, untilMs: slotMs + 2 * H });
    add('(10) V-FI-2: dieselben Werte wie im Fensterweg (25 Frames), nur weniger davon',
      full.frames.length === 25 && [0, 60, 120].every((l) => full.frames.find((f) => f.lead === l).mmh === r.frames.find((f) => f.lead === l).mmh));
    add('(10) V-FI-2: 7 min neben einem Frame ⇒ der naechste (lead 5); 45 min daneben ⇒ keiner',
      (await readNowcastPoint(memoryStore(files), 'radvor_rv', LAT, LON, { nowMs, decodePng: fakePng, atMs: [slotMs + 7 * 60_000] })).frames[0].lead === 5
      && (await readNowcastPoint(memoryStore(files), 'radvor_rv', LAT, LON, { nowMs, decodePng: fakePng, atMs: [slotMs + 165 * 60_000] })) === null);
    // Sonden: nur der DRITTE Stempel existiert, die juengste Sonde endet mit 403.
    const later = nowMs + 10 * 60_000;
    const stamps = nowcastSlotStamps('radvor_rv', later, 60);
    const third = stamps[2];
    const inner = memoryStore(new Map([[`radar/img/v1/rv/${third}/meta.json`, enc({ ...meta, stamp: third })]]));
    let calls = 0;
    const flaky = { ...inner, bytes: async (p) => { calls++; if (p.includes(stamps[0])) throw new Error(`${p}: HTTP 403`); return inner.bytes(p); } };
    flaky.json = async (p) => { const bb = await flaky.bytes(p); return bb ? JSON.parse(new TextDecoder().decode(bb)) : null; };
    const slot = await findLatestSlot(flaky, 'radvor_rv', later, 60, { probeBatch: 4 });
    add('(10) V-FI-5: ein 403 auf die juengste Sonde reisst die Slot-Suche nicht — der dritte Stempel wird gefunden, vier Sonden auf einmal',
      slot?.stamp === third && slot?.probes === 3 && calls === 4, `stamp ${slot?.stamp} probes ${slot?.probes} calls ${calls}`);
    const dead = { ...inner, bytes: async (p) => { throw new Error(`${p}: HTTP 403`); } };
    dead.json = async (p) => { const bb = await dead.bytes(p); return bb ? JSON.parse(new TextDecoder().decode(bb)) : null; };
    let threw = false; try { await findLatestSlot(dead, 'radvor_rv', later, 10, { probeBatch: 4 }); } catch { threw = true; }
    add('(10) V-FI-5: bleibt am Ende KEIN Slot und es gab einen Transportfehler, wird er geworfen (nicht als „nicht da" getarnt)', threw);
  }

  // ── (10e) Station im NACHBAR-Chunk: optimistisches Buendel + zweiter Abruf ──
  {
    const cellA = cellOf(t1, LAT, LON); const chA = chunkOf(cellA.iy, cellA.ix);
    const ixB = (chA.cx + 1) * 16; const lonB = t1.lon0 + ixB * t1.deg;
    const lonP = lonB - 0.03, lonS = lonB + 0.02;
    const cellS = cellOf(t1, LAT, lonS); const chB = chunkOf(cellS.iy, cellS.ix);
    const cat = { ...STATION_CATALOG, stations: [{ id: 'NB', name: 'NACHBAR', lat: LAT, lon: lonS, elev: 500 }, ...STATION_CATALOG.stations] };
    const man2 = { ...stationManifest, chunks: [
      { cy: chA.cy, cx: chA.cx, file: stationBundlePath(RUN, chA.cy, chA.cx), bytes: 1, stations: ['10865', 'P659'] },
      { cy: chB.cy, cx: chB.cx, file: stationBundlePath(RUN, chB.cy, chB.cx), bytes: 1, stations: ['NB', 'X'] },
    ] };
    const bundleBytes = stationFiles.get(`point/stations/${RUN}/03_07.bin`);
    const f = new Map(all);
    f.set('point/stations/catalog.json', enc(cat)); f.set(`point/stations/${RUN}/stations.json`, enc(man2));
    f.set(man2.chunks[0].file, bundleBytes); f.set(man2.chunks[1].file, bundleBytes);
    const st = memoryStore(f);
    const bb = await readPointBundle({ lat: LAT, lon: lonP, atMs: at(4), elevationM: 500, nowMs: NOW }, { store: st, terrain: false, nowcast: false });
    add('(10) AP1: liegt die naechste Station im Nachbarchunk, wird ihr Buendel nachgeholt — Spalte 0 des Nachbarn, zwei Buendel geholt',
      bb.station?.station.id === 'NB' && bb.station?.bundle.path === man2.chunks[1].file && bb.station?.bundle.column === 0 && chA.cx !== chB.cx
      && [...f.keys()].filter((k) => k.startsWith(`point/stations/${RUN}/`) && k.endsWith('.bin')).length === 2 && st.stats.files >= 5,
      `station ${bb.station?.station.id} path ${bb.station?.bundle.path} files ${st.stats.files}`);
  }

  // ── (10e2) E-F-12: an der Station (≤ 250 m) ist ihre Hoehe die Punkthoehe des Buendels ──
  {
    const st = STATION_CATALOG.stations[0];   // 10865 MUENCHEN STADT, 515 m
    const bAt = await readPointBundle({ lat: st.lat + 0.001, lon: st.lon, atMs: at(4), nowMs: NOW }, { store: memoryStore(all), terrain: false, nowcast: false });
    add('(10) E-F-12: 0,1 km von der Station ohne uebergebene Hoehe ⇒ elevationFrom station, Hoehe 515 m, Station angenommen',
      bAt.stationChoice?.elevationFrom === 'station' && bAt.stationChoice.elevationM === st.elev && bAt.stationChoice.accepted === true && /steht an der Station/.test(bAt.stationChoice.reason),
      `${bAt.stationChoice?.elevationFrom} ${bAt.stationChoice?.elevationM} — ${bAt.stationChoice?.reason}`);
    const bIn = await readPointBundle({ lat: st.lat + 0.001, lon: st.lon, atMs: at(4), elevationM: 700, nowMs: NOW }, { store: memoryStore(all), terrain: false, nowcast: false });
    add('(10) E-F-12: eine uebergebene Hoehe hat Vorrang (input, 700 m) — die Station steht trotzdem am Punkt und traegt',
      bIn.stationChoice?.elevationFrom === 'input' && bIn.stationChoice.elevationM === 700 && bIn.stationChoice.accepted === true);
    const bFar = await readPointBundle({ lat: LAT, lon: LON, atMs: at(4), nowMs: NOW }, { store: memoryStore(all), terrain: false, nowcast: false });
    add('(10) E-F-12 Negativ-Kontrolle: 4,5 km von der Station, kein Gelaende ⇒ keine Hoehe (null), Hoehenkriterium ungeprueft und gesagt',
      bFar.stationChoice?.elevationFrom === null && bFar.stationChoice.elevationM === null && /NICHT geprüft/.test(bFar.stationChoice.reason), bFar.stationChoice?.reason);
  }

  // ── (10f) Cache-Regel und cachedStore ─────────────────────────────────────
  {
    const sha = `${POINT_CDN_BASE.replace('@main', '')}@${'a'.repeat(40)}`;
    add('(10) Cache-Regel: Chunks, Stationsbuendel, Radar-Slots und ALLES unter @<sha> unveraenderlich; index.json nie; run.json@main nie; static 12 h; Katalog 24 h',
      defaultCachePolicy('point/2026091609/t1/03_07.bin', POINT_CDN_BASE) === Infinity && defaultCachePolicy('point/stations/2026091609/03_07.bin', POINT_CDN_BASE) === Infinity
      && defaultCachePolicy('radar/img/v1/rv/2609161405/f065.png', POINT_CDN_BASE) === Infinity && defaultCachePolicy('point/2026091609/run.json', sha) === Infinity
      && defaultCachePolicy('point/index.json', POINT_CDN_BASE) === null && defaultCachePolicy('point/2026091609/run.json', POINT_CDN_BASE) === null
      && defaultCachePolicy('point/static/hmodel/v1/t1/03_07.bin', POINT_CDN_BASE) === 12 * H && defaultCachePolicy('point/stations/catalog.json', POINT_CDN_BASE) === 24 * H);
    let clock = 0; const backend = memoryBackend(); const cstats = newCacheStats();
    const inner = memoryStore(all);
    const cs = cachedStore(inner, backend, { stats: cstats, nowMs: () => clock });
    await cs.bytes(chunkP); await cs.bytes(chunkP);
    await cs.bytes('point/index.json'); await cs.bytes('point/index.json');
    add('(10) cachedStore: ein Chunk wird einmal geholt und dann aus dem Cache bedient; der Index geht immer am Cache vorbei',
      inner.stats.files === 3 && cstats.hits === 1 && cstats.bypass === 2 && cstats.stored === 1, JSON.stringify(cstats));
    await cs.bytes('point/stations/catalog.json'); clock = 25 * H; await cs.bytes('point/stations/catalog.json');
    add('(10) cachedStore: befristete Eintraege laufen ab (Katalog nach 25 h erneut geholt)', inner.stats.files === 5 && cstats.misses === 3);
    add('(10) cachedStore: `withBase` behaelt den Cache, und ein 404 wird NICHT gemerkt',
      (await cs.withBase('x').bytes('point/2026091609/t1/00_00.bin')) === null && (await cs.bytes('point/2026091609/t1/00_00.bin')) === null && backend.size() === 2);
    add('(10) cachedStore: der Sweep raeumt, was aelter als die Frist ist', (await backend.sweep(clock + 1)) === 2 && backend.size() === 0);
  }

  // ── (10g) memoStore ───────────────────────────────────────────────────────
  {
    const inner = memoryStore(all); const ms = memoStore(inner);
    await Promise.all([ms.bytes(chunkP), ms.bytes(chunkP), ms.bytes('point/nope.bin'), ms.bytes('point/nope.bin')]);
    add('(10) memoStore: derselbe Pfad wird je Instanz EINMAL geholt — auch ein 404', inner.stats.files === 1 && inner.stats.misses === 1);
    let n = 0; const failing = { ...inner, bytes: async () => { n++; throw new Error('HTTP 403'); } };
    const mf = memoStore(failing); await mf.bytes('a').catch(() => {}); await mf.bytes('a').catch(() => {});
    add('(10) memoStore: eine Absage wird NICHT gemerkt (der zweite Versuch geht wieder hinaus)', n === 2);
  }

  // ── (10h) Dekodier-Pool in Node = Hauptthread, wertgleich ─────────────────
  {
    const bytes = cubeFiles.get(chunkP);
    const a = await decodeChunkPooled(bytes, { planes: manifest.planes });
    const b2 = await decodeCubeChunk(bytes, { planes: manifest.planes });
    add('(10) Dekodier-Pool: ohne `Worker` (Node) rechnet der Hauptthread — Ebene fuer Ebene gleich',
      decodePoolInfo().mode === 'main' && a.planes.length === b2.planes.length
      && a.planes.every((p, i) => p.length === b2.planes[i].length && p.every((v, k) => v === b2.planes[i][k])));
    const w = await decodeChunkPooled(bytes, { planes: manifest.planes, wanted: ['t2m'] });
    add('(10) Dekodier-Pool: `wanted` kommt an (nur t2m entpackt)', w.planes.filter((p) => p.length > 0).length === 1);
  }

  // ── (10i) Store: Index mit no-cache; Dauer, weiche Frist, Wiederholung (V-FI-5) ─
  {
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push({ url: String(url), cache: init?.cache ?? null });
      const p = String(url).replace(/^.*@main\//, '');
      const bb = all.get(p);
      return bb ? new Response(bb, { status: 200 }) : new Response('', { status: 404 });
    };
    const hs = httpStore({ base: POINT_CDN_BASE, fetchImpl, slowMs: 0 });
    await loadPointIndex(hs); await hs.bytes(chunkP);
    add('(10) R9: der Index wird mit `cache: no-cache` geholt, ein Chunk ohne Cache-Vorgabe', seen[0].cache === 'no-cache' && seen[1].cache === null);
    add('(10) Store zaehlt Dauer und langsame Abrufe (weiche Frist 0 ⇒ jeder Abruf gilt als langsam)', hs.stats.ms > 0 && hs.stats.slow === 2 && hs.stats.retries === 0);
    let k = 0;
    const flaky = httpStore({ base: POINT_CDN_BASE, retryDelayMs: 1, fetchImpl: async () => { k++; return k === 1 ? new Response('', { status: 502 }) : new Response(all.get('point/index.json'), { status: 200 }); } });
    const idx2 = await flaky.json('point/index.json');
    add('(10) V-FI-5: ein 5xx wird EINMAL wiederholt und zaehlt als retry', idx2?.schema === CUBE_SCHEMA && flaky.stats.retries === 1 && k === 2);
    let k2 = 0;
    const dead = httpStore({ base: POINT_CDN_BASE, retryDelayMs: 1, fetchImpl: async () => { k2++; return new Response('', { status: 500 }); } });
    let threw = false; try { await dead.bytes('x'); } catch { threw = true; }
    add('(10) V-FI-5: nach der Wiederholung wird der Fehler geworfen (nicht als 404 getarnt); ein 404 wird nie wiederholt',
      threw && k2 === 2 && dead.stats.misses === 0
      && (await httpStore({ base: POINT_CDN_BASE, fetchImpl: async () => new Response('', { status: 404 }) }).bytes('y')) === null);
    let k3 = 0;
    const forbidden = httpStore({ base: POINT_CDN_BASE, retryDelayMs: 1, fetchImpl: async () => { k3++; return new Response('', { status: 403 }); } });
    let threw403 = false; try { await forbidden.bytes('z'); } catch (e) { threw403 = /HTTP 403/.test(String(e.message)); }
    add('(10) V-FI-5: ein 403 wird NICHT wiederholt (er kommt nach Sekunden und bleibt) — sofort geworfen, kein retry',
      threw403 && k3 === 1 && forbidden.stats.retries === 0);
    // Ausweichweg: das CDN sagt 403 fuer den Chunk, der Ausweichweg hat ihn — byte-gleich, gezaehlt.
    const { fallbackStore, withRawFallback, rawBaseOf, POINT_RAW_BASE: RAW } = await import('../src/point/client/store.ts');
    const prim = httpStore({ base: POINT_CDN_BASE, retryDelayMs: 1, fetchImpl: async (url) => {
      const p = String(url).replace(/^.*@main\//, '');
      if (p === chunkP) return new Response('', { status: 403 });
      const bb = all.get(p);
      return bb ? new Response(bb, { status: 200 }) : new Response('', { status: 404 });
    } });
    const fbNotes = [];
    const fb = fallbackStore(prim, memoryStore(all), { onFallback: (p) => fbNotes.push(p) });
    const got = await fb.bytes(chunkP);
    add('(10) V-FI-5: ein 403 am CDN wird ueber den Ausweichweg nachgeholt (byte-gleich, gezaehlt, benannt); ein 404 bleibt 404 ohne Ausweichweg',
      !!got && got.length === cubeFiles.get(chunkP).length && got.every((v, i) => v === cubeFiles.get(chunkP)[i]) && prim.stats.fallbacks === 1 && fbNotes[0] === chunkP
      && (await fb.bytes('point/2026091609/t1/00_00.bin')) === null && prim.stats.fallbacks === 1);
    add('(10) V-FI-5: `withRawFallback` gilt nur fuer eine jsDelivr-@main-Basis (raw.githubusercontent), jede andere bleibt, wie sie ist',
      rawBaseOf(POINT_CDN_BASE) === RAW && rawBaseOf('https://example.org/x') === null && rawBaseOf(`${POINT_CDN_BASE.replace('@main', '')}@${'b'.repeat(40)}`) === null
      && withRawFallback(memoryStore(all)) !== null && withRawFallback(prim).base === POINT_CDN_BASE);
    // Hedge: das CDN antwortet erst nach 300 ms — nach 50 ms startet der Ausweichweg und gewinnt; der Verlierer wird abgebrochen.
    const mkSlow = (delayMs) => {
      let aborted = 0;
      const st = httpStore({ base: POINT_CDN_BASE, retryDelayMs: 1, fetchImpl: (url, init) => new Promise((res, rej) => {
        const t = setTimeout(() => res(new Response(all.get(String(url).replace(/^.*@main\//, '')) ?? '', { status: all.has(String(url).replace(/^.*@main\//, '')) ? 200 : 404 })), delayMs);
        init?.signal?.addEventListener('abort', () => { clearTimeout(t); aborted++; rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
      }) });
      return { st, aborted: () => aborted };
    };
    const slow = mkSlow(300);
    const hedged = fallbackStore(slow.st, memoryStore(all), { hedgeMs: 50 });
    const t0 = Date.now();
    const hb = await hedged.bytes(chunkP);
    const dt = Date.now() - t0;
    add('(10) V-FI-5 Hedge: antwortet das CDN nicht binnen der Frist, gewinnt der Ausweichweg (byte-gleich, < 300 ms), der CDN-Abruf wird abgebrochen',
      !!hb && hb.length === cubeFiles.get(chunkP).length && dt < 250 && slow.st.stats.fallbacks === 1 && slow.aborted() === 1, `${dt} ms, aborted ${slow.aborted()}`);
    const fast = mkSlow(5);
    const hedged2 = fallbackStore(fast.st, memoryStore(all), { hedgeMs: 200 });
    const hb2 = await hedged2.bytes(chunkP);
    add('(10) V-FI-5 Hedge: antwortet das CDN vor der Frist, startet kein Ausweichweg; ein 404 gewinnt sofort',
      !!hb2 && fast.st.stats.fallbacks === 0 && (await hedged2.bytes('point/2026091609/t1/00_00.bin')) === null && fast.st.stats.fallbacks === 0);
    // Prioritaet und Abbruch von aussen werden durchgereicht.
    const seenInit = [];
    const pr = httpStore({ base: POINT_CDN_BASE, fetchImpl: async (url, init) => {
      seenInit.push({ priority: init?.priority ?? null, aborted: !!init?.signal?.aborted });
      if (init?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });   // wie echtes fetch
      return new Response(all.get(String(url).replace(/^.*@main\//, '')) ?? '', { status: 200 });
    } });
    await pr.bytes(chunkP, { priority: 'low' });
    const ac = new AbortController(); ac.abort(new Error('abgebrochen: test'));
    let abortThrew = false; try { await pr.bytes(chunkP, { signal: ac.signal }); } catch { abortThrew = true; }
    add('(10) Store: `priority` geht an fetch, ein schon abgebrochenes `signal` bricht ab und wird nie wiederholt',
      seenInit[0]?.priority === 'low' && abortThrew && pr.stats.retries === 0);
  }

  // ── (10j) Gelaende aus zwei Skalen — synthetische Terrarium-Kacheln ───────
  {
    const PEAK = { lat: 47.27, lon: 11.40 };
    const hAt = (lat, lon, peak) => 700 + (peak ? 800 * Math.exp(-((distanceKm(lat, lon, PEAK.lat, PEAK.lon) / 3) ** 2)) : 0);
    const mkOpts = (peak, cache) => {
      let fetches = 0;
      const fetchImpl = async (url) => { fetches++; const m = String(url).match(/\/(\d+)\/(\d+)\/(\d+)\.png$/); return new Response(new TextEncoder().encode(JSON.stringify({ z: +m[1], x: +m[2], y: +m[3] })), { status: 200 }); };
      const decodeRgba = (bytes) => {
        const { z, x, y } = JSON.parse(new TextDecoder().decode(bytes));
        const n = 2 ** z; const data = new Uint8ClampedArray(256 * 256 * 4);
        for (let j = 0; j < 256; j++) {
          const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + j / 256) / n))) * 180 / Math.PI;
          for (let i = 0; i < 256; i++) {
            const lon = (x + i / 256) / n * 360 - 180;
            const v = hAt(lat, lon, peak) + 32768;
            const k = (j * 256 + i) * 4;
            data[k] = Math.floor(v / 256); data[k + 1] = Math.floor(v) % 256; data[k + 2] = Math.min(255, Math.round((v - Math.floor(v)) * 256)); data[k + 3] = 255;
          }
        }
        return { data, width: 256, height: 256 };
      };
      return { opts: { fetchImpl, decodeRgba, cache }, count: () => fetches };
    };
    const flat = mkOpts(false, null);
    const rf = await loadTerrainAtPoint(PEAK.lat, PEAK.lon, flat.opts);
    const nNear = tilesForRadius(PEAK.lat, PEAK.lon, TERRAIN_SCALES.near.z, TERRAIN_SCALES.near.radiusM).length;
    const nFar = tilesForRadius(PEAK.lat, PEAK.lon, TERRAIN_SCALES.far.z, TERRAIN_SCALES.far.radiusM).length;
    add('(10) Gelaende: flache Ebene ⇒ Hoehe 700 m, TPI 0, Neigung 0, Horizont 0 in allen acht Oktanten, SVF 1',
      Math.abs(rf.elevationM - 700) < 0.2 && rf.tpi500M === 0 && rf.tpi2000M === 0 && rf.slopeDeg === 0 && rf.horizonDeg.every((h) => h === 0) && rf.svf === 1,
      `h ${rf.elevationM} tpi ${rf.tpi500M}/${rf.tpi2000M} svf ${rf.svf}`);
    add('(10) Gelaende: geholt werden genau die Kacheln, die die Radien schneiden (z11 Nahfeld + z8 Fernfeld, je 1–4)',
      rf.tiles.near === nNear && rf.tiles.far === nFar && flat.count() === nNear + nFar && nNear >= 1 && nNear <= 4 && nFar >= 1 && nFar <= 4, `near ${nNear} far ${nFar}`);
    const peak = mkOpts(true, memoryBackend());
    const rp = await loadTerrainAtPoint(PEAK.lat, PEAK.lon, peak.opts);
    // Analytisch: TPI = Gipfelhoehe − Ringmittel; Ringe 167/333/500 m ⇒ 800·(1−e^{−(d/3 km)²}) gemittelt = 11,4 m,
    // Ringe 667/1333/2000 m ⇒ 156 m. Ein Wert daneben hiesse: falscher Radius oder falsche Skala.
    add('(10) Gelaende: auf dem Gipfel ⇒ ~1500 m, TPI wie analytisch (500 m: 11,4 m · 2 km: 156 m), Horizont frei, SVF 1',
      Math.abs(rp.elevationM - 1500) < 15 && Math.abs(rp.tpi500M - 11.4) < 3 && Math.abs(rp.tpi2000M - 156) < 8
      && rp.horizonDeg.every((h) => h < 0.5) && rp.svf > 0.999 && rp.slopeDeg < 1.5,
      `h ${rp.elevationM} tpi ${rp.tpi500M}/${rp.tpi2000M} slope ${rp.slopeDeg}`);
    const lonE = PEAK.lon + 2 / (111.32 * Math.cos(PEAK.lat * Math.PI / 180));
    const flank = mkOpts(true, null);
    const re = await loadTerrainAtPoint(PEAK.lat, lonE, flank.opts);
    add('(10) Gelaende: 2 km oestlich des Gipfels ⇒ Horizont nach WESTEN 8–14°, nach Osten 0°, SVF < 1, Hoehe ~1213 m',
      re.horizonDeg[6] > 8 && re.horizonDeg[6] < 14 && re.horizonDeg[2] === 0 && re.svf < 0.995 && Math.abs(re.elevationM - 1213) < 15,
      `W ${re.horizonDeg?.[6]} E ${re.horizonDeg?.[2]} svf ${re.svf} h ${re.elevationM}`);
    const before = peak.count();
    const rp2 = await loadTerrainAtPoint(PEAK.lat, PEAK.lon, peak.opts);
    add('(10) Gelaende: derselbe Ort ein zweites Mal ⇒ fertig aus dem Cache, keine Kachel geholt',
      rp2.fromCache === true && peak.count() === before && rp2.elevationM === rp.elevationM);
    const rp3 = await loadTerrainAtPoint(PEAK.lat, PEAK.lon, { ...peak.opts, noResultCache: true });
    add('(10) Gelaende: ohne Ergebnis-Cache kommen die KACHELN aus dem Cache (0 Abrufe), das Ergebnis ist dasselbe',
      rp3.fromCache === false && peak.count() === before && rp3.tiles.fromCache === nNear + nFar && rp3.elevationM === rp.elevationM);
  }

  // ── (10k) AP12, V-FI-40: Frist bis zur Antwort, Stillstand im Körper, Hedge nur bei langsamer Antwort ─
  // Fast 3G am 18.09.: der t1-Chunk kam in 10 von 10 Läufen nie an — die harte Frist galt für den ganzen
  // Abruf und der Hedge startete für jeden Körper, der länger als 2,5 s lief. Die Attrappe liefert den
  // Körper als Strom in Paketen, gebunden an das Abbruch-Signal wie ein echtes fetch.
  {
    const { fallbackStore } = await import('../src/point/client/store.ts');
    const full = cubeFiles.get(chunkP);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    /** headersMs: bis zur Antwort; parts: Pakete; gapMs: Abstand; stallAfter: nach so vielen Paketen kommt nichts mehr. */
    const mkStream = ({ headersMs = 0, parts = 6, gapMs = 40, stallAfter = null } = {}) => {
      let calls = 0;
      const fetchImpl = (url, init) => new Promise((res, rej) => {
        calls++;
        const sig = init?.signal;
        const onAbort = () => rej(Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' }));
        if (sig?.aborted) return onAbort();
        sig?.addEventListener('abort', onAbort, { once: true });
        setTimeout(() => {
          const size = Math.ceil(full.length / parts);
          const body = new ReadableStream({
            async start(c) {
              sig?.addEventListener('abort', () => { try { c.error(Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' })); } catch { /* schon zu */ } }, { once: true });
              for (let i = 0; i < parts; i++) {
                if (sig?.aborted) return;
                if (stallAfter != null && i >= stallAfter) return;   // Stillstand: der Strom bleibt offen, nichts kommt mehr
                c.enqueue(full.subarray(i * size, Math.min(full.length, (i + 1) * size)));
                await sleep(gapMs);
              }
              c.close();
            },
          });
          res(new Response(body, { status: 200 }));
        }, headersMs);
      });
      return { fetchImpl, calls: () => calls };
    };
    const same = (b) => !!b && b.length === full.length && b.every((v, i) => v === full[i]);
    // (1) Langsamer, aber laufender Körper: 6 × 40 ms = 240 ms > Frist 100 ms — kommt an (bis 18.09.: abgebrochen).
    const s1 = mkStream();
    let heads = 0;
    const t1a = Date.now();
    const b1 = await httpStore({ base: POINT_CDN_BASE, fetchImpl: s1.fetchImpl, timeoutMs: 100 }).bytes(chunkP, { onHeaders: () => { heads++; } });
    add('(10) V-FI-40: ein Körper, der 240 ms läuft, übersteht die Frist von 100 ms (sie gilt bis zur Antwort), byte-gleich, `onHeaders` genau einmal',
      same(b1) && heads === 1 && Date.now() - t1a >= 200, `${Date.now() - t1a} ms`);
    // (2) Negativkontrolle: nach zwei Paketen Stillstand ⇒ Abbruch mit benannter Frist, nicht mit dem Browser-Text.
    const s2 = mkStream({ stallAfter: 2 });
    let e2 = null; try { await httpStore({ base: POINT_CDN_BASE, fetchImpl: s2.fetchImpl, timeoutMs: 100, retries: 0 }).bytes(chunkP); } catch (e) { e2 = String(e.message); }
    add('(10) V-FI-40 Negativkontrolle: Stillstand im Körper (100 ms ohne Byte) bricht ab — mit „Frist 100 ms ohne Daten", nicht mit „The user aborted"',
      e2 != null && /Frist 100 ms ohne Daten/.test(e2), e2 ?? 'kein Fehler');
    // (3) Keine Antwort binnen der Frist ⇒ wie bisher Abbruch mit „Frist … ms:".
    const s3 = mkStream({ headersMs: 300 });
    let e3 = null; try { await httpStore({ base: POINT_CDN_BASE, fetchImpl: s3.fetchImpl, timeoutMs: 100, retries: 0 }).bytes(chunkP); } catch (e) { e3 = String(e.message); }
    add('(10) V-FI-40: ohne Antwort binnen der Frist bricht der Abruf wie bisher ab („Frist 100 ms:")', e3 != null && /Frist 100 ms: /.test(e3), e3 ?? 'kein Fehler');
    // (4) Hedge 50 ms, Antwort nach 5 ms, Körper 240 ms ⇒ KEIN Ausweichweg (bis 18.09.: nach 50 ms doppelt geladen).
    const s4 = mkStream({ headersMs: 5 });
    const p4 = httpStore({ base: POINT_CDN_BASE, fetchImpl: s4.fetchImpl, timeoutMs: 1000 });
    const fb4 = fallbackStore(p4, memoryStore(all), { hedgeMs: 50 });
    const b4 = await fb4.bytes(chunkP);
    add('(10) V-FI-40: der Hedge startet NICHT, wenn das CDN geantwortet hat und die Bytes laufen (langsame Leitung ≠ toter Origin)',
      same(b4) && p4.stats.fallbacks === 0 && s4.calls() === 1);
    // (5) Hedge 50 ms, Antwort erst nach 300 ms ⇒ Ausweichweg wie bisher (V-FI-5).
    const s5 = mkStream({ headersMs: 300 });
    const p5 = httpStore({ base: POINT_CDN_BASE, fetchImpl: s5.fetchImpl, timeoutMs: 1000 });
    const t5 = Date.now();
    const b5 = await fallbackStore(p5, memoryStore(all), { hedgeMs: 50 }).bytes(chunkP);
    add('(10) V-FI-40: antwortet das CDN nicht binnen des Hedge, gewinnt der Ausweichweg wie bisher (V-FI-5)', same(b5) && p5.stats.fallbacks === 1 && Date.now() - t5 < 250, `${Date.now() - t5} ms`);
    // (6) Antwort da, dann Stillstand ⇒ die Stillstandsfrist wirft, `when` nimmt den Ausweichweg.
    const s6 = mkStream({ headersMs: 5, stallAfter: 1 });
    const p6 = httpStore({ base: POINT_CDN_BASE, fetchImpl: s6.fetchImpl, timeoutMs: 80, retries: 0 });
    const b6 = await fallbackStore(p6, memoryStore(all), { hedgeMs: 50 }).bytes(chunkP);
    add('(10) V-FI-40: bleibt der Körper nach der Antwort stehen, holt der Ausweichweg die Datei (Stillstand zählt wie ein 403)', same(b6) && p6.stats.fallbacks === 1);
  }

  // ── (10l) AP12 (e): stale-while-revalidate-Kopie des Index — nur der Index, nur mit Frist, nie als Lieferung ─
  {
    let clock = 1_000_000;
    const backend = memoryBackend();
    const cs = cachedStore(memoryStore(all), backend, { nowMs: () => clock, swrIndex: true });
    add('(10) SWR: ohne vorherigen Abruf keine Kopie (`peek` ⇒ null)', (await cs.peek('point/index.json', 60_000)) === null);
    const off = cachedStore(memoryStore(all), memoryBackend(), { nowMs: () => clock });
    await off.bytes('point/index.json');
    add('(10) SWR Negativkontrolle: ohne `swrIndex` legt der Cache keine Kopie ab (Verhalten wie bisher)', (await off.peek('point/index.json', 1e9)) === null);
    const idxBytes = await cs.bytes('point/index.json');
    const p1 = await cs.peek('point/index.json', 60_000);
    clock += 30_000;
    const p2 = await cs.peek('point/index.json', 60_000);
    clock += 60_000;
    const p3 = await cs.peek('point/index.json', 60_000);
    add('(10) SWR: nach dem Abruf liegt eine Kopie (byte-gleich, Alter gemessen), jenseits der Frist nicht mehr',
      !!p1 && p1.bytes.length === idxBytes.length && p1.bytes.every((v, i) => v === idxBytes[i]) && p2?.ageMs === 30_000 && p3 === null);
    const filesBefore = cs.stats.files;
    const again = await cs.bytes('point/index.json');
    add('(10) SWR: der Index wird trotzdem NIE aus dem Cache geliefert (`bytes` fragt den Store darunter), andere Pfade haben keine Kopie',
      again !== null && cs.stats.files === filesBefore + 1 && (await cs.peek(chunkP, 1e9)) === null && (await cs.peek('point/stations/catalog.json', 1e9)) === null);
  }
}

// ── (10m) AP11: URL-Schalter des Punkt-Panels (`?pf=cube`, `?pflog=1`) — rein, netzfrei ──
{
  const { pfSourceFrom, pfLogFrom } = await import('../src/pointForecast/pfFlags.ts');
  const cubeCases = ['?pf=cube', '?startnow=0&pf=cube&pflog=1', 'pf=cube', '?lat=50.2&lon=10.5&pf=cube'];
  const liveCases = ['', '?', '?pf=', '?pf=Cube', '?pf=CUBE', '?pf=cube2', '?pf=live', '?pfx=cube', '?startnow=0', '?pf=%20cube'];
  const badCube = cubeCases.filter((s) => pfSourceFrom(s) !== 'cube');
  const badLive = liveCases.filter((s) => pfSourceFrom(s) !== 'live');
  add('(10m) AP11: `?pf=cube` schaltet auf den Cube-Pfad — nur genau dieser Wert; fehlt er oder steht etwas anderes da, bleibt das Panel live',
    badCube.length === 0 && badLive.length === 0, [...badCube.map((s) => `nicht cube: ${s}`), ...badLive.map((s) => `nicht live: ${s}`)].join(' · ') || `${cubeCases.length} cube, ${liveCases.length} live`);
  const logOn = ['?pflog=1', '?pf=cube&pflog=1'], logOff = ['', '?pflog=0', '?pflog=true', '?pflog=', '?pf=cube'];
  add('(10m) AP11: `?pflog=1` schaltet den Zeit-/Herkunftsblock — nur mit dem Wert 1',
    logOn.every((s) => pfLogFrom(s)) && logOff.every((s) => !pfLogFrom(s)));
  // Der Live-Zweig des Panels ruft wie vor AP11 — dieselbe Zeile, dieselben Felder (die Pixelgleichheit belegt das Bildschirmfoto,
  // diese Prüfung hält die Zeile gegen stilles Umschreiben fest); der Cube-Zweig lädt `cubeSource` nur per dynamischem Import.
  const panel = readFileSync(join(ROOT, 'src/pointForecast/PointForecastPanel.tsx'), 'utf8');
  const liveCall = 'getPointForecast({ lat, lng, country, hours, signal: abort.signal, includeRadarNowcast: true, sourceMode })';
  const staticCube = /^import[^;]*['"]\.\/cubeSource['"]/m.test(panel);
  add('(10m) AP11: Live-Zweig ruft unverändert, Cube-Zweig nur per `import(\'./cubeSource\')` (kein statischer Import im Panel)',
    panel.includes(liveCall) && panel.includes("import('./cubeSource')") && !staticCube && panel.includes('pfSourceFrom(window.location.search)'));
}

// ── (10n) V-FI-17: z0 aus WorldCover — reiner Rechenteil an synthetischen Klassenfeldern, Lader-Regeln ohne Netz ──
{
  const { z0FromClassField, loadZ0AtPoint, z0CacheKey, Z0_POINT_RADIUS_M } = await import('../src/point/client/z0Point.ts');
  const { memoryBackend: mb } = await import('../src/point/client/cache.ts');
  const { M_PER_DEG_LAT: MLAT } = await import('../src/point/terrainPoint.ts');
  const LAT0 = 48.14, LON0 = 11.58;
  const distM = (la, lo) => Math.hypot((la - LAT0) * MLAT, (lo - LON0) * 111_320 * Math.cos((LAT0 * Math.PI) / 180));
  const grass = () => 30;
  const lakeInGrass = (la, lo) => (distM(la, lo) <= 700 ? 80 : 30);
  const forestInGrass = (la, lo) => (distM(la, lo) <= 700 ? 10 : 30);
  const holes = (la, lo) => (distM(la, lo) <= 400 ? null : 30);
  const g = z0FromClassField(grass, LAT0, LON0);
  add('(10n) V-FI-17: gleichförmiges Grasland ⇒ z0 am Punkt = z0 jeder Zelle = 0,03 m (log-Mittel einer Konstanten), volle Abdeckung',
    g.z0True === 0.03 && g.z0Mod.t1 === 0.03 && g.z0Mod.t2 === 0.03 && g.z0Mod.t3 === 0.03 && g.coverage.point === 1 && g.shares[0][0] === 30,
    JSON.stringify({ z0True: g.z0True, z0Mod: g.z0Mod, coverage: g.coverage }));
  const w = z0FromClassField(lakeInGrass, LAT0, LON0), f = z0FromClassField(forestInGrass, LAT0, LON0);
  add(`(10n) See (700 m) in Grasland: am Punkt (Kreis ${Z0_POINT_RADIUS_M} m) Wasser-z0 0,0002 m, die t1-Zelle bleibt nahe Grasland; Wald ebenso mit 0,75 m`,
    w.z0True === 0.0002 && w.z0Mod.t1 > 0.02 && w.z0Mod.t1 < 0.03 && f.z0True === 0.75 && f.z0Mod.t1 > 0.03 && f.z0Mod.t1 < 0.05 && w.shares[0][0] === 80,
    `See ${w.z0True}/${w.z0Mod.t1} · Wald ${f.z0True}/${f.z0Mod.t1}`);
  const h = z0FromClassField(holes, LAT0, LON0);
  add('(10n) Negativkontrolle: unter 50 % bekannter Pixel im Punktkreis ⇒ z0 am Punkt null (kein Ersatzwert), die Zellen tragen weiter',
    h.z0True === null && h.coverage.point < 0.5 && h.z0Mod.t1 === 0.03, JSON.stringify(h.coverage));
  // Lader ohne Netz: 404 ⇒ null; 200 (ganze Datei statt Bereich) ⇒ nie angenommen; nur Cache ⇒ kein Abruf; Treffer ⇒ kein Abruf
  let calls = 0;
  const f404 = async () => { calls++; return new Response('nope', { status: 404 }); };
  const f200 = async () => { calls++; return new Response(new Uint8Array(64), { status: 200 }); };
  const r404 = await loadZ0AtPoint(LAT0, LON0, { fetchImpl: f404 });
  const c404 = calls; calls = 0;
  const r200 = await loadZ0AtPoint(LAT0, LON0, { fetchImpl: f200 });
  const c200 = calls; calls = 0;
  const rOnly = await loadZ0AtPoint(LAT0, LON0, { fetchImpl: f404, cacheOnly: true });
  const cOnly = calls;
  const be = mb();
  await be.put(z0CacheKey(LAT0, LON0), { bytes: new TextEncoder().encode(JSON.stringify({ ...g, source: 'test' })), storedAt: Date.now() });
  calls = 0;
  const rHit = await loadZ0AtPoint(LAT0, LON0, { fetchImpl: f404, cache: be, cacheOnly: true });
  add('(10n) Lader: 404 ⇒ null; 200 statt 206 (ganze 8-MB-Datei) wird nie angenommen ⇒ null; nur Cache ohne Eintrag ⇒ null ohne Abruf; Cache-Treffer ⇒ Ergebnis ohne Abruf (`fromCache`)',
    r404 === null && c404 > 0 && r200 === null && c200 > 0 && rOnly === null && cOnly === 0 && rHit?.z0True === 0.03 && rHit.fetched.fromCache === true && calls === 0,
    `Abrufe ${c404}/${c200}/${cOnly}/${calls}`);
}

// --- Ausgabe ----------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
