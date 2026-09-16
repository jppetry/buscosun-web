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

  const p3 = await (plan(46.98, 10.98, at(4), 900));
  add('(7) Negativ-Kontrolle Hoehe: 0,3 km entfernt, aber 900 m hoeher ⇒ abgelehnt, mit Grund',
    p3.station.accepted === false && /Bias-Korrektur/.test(p3.station.reason), p3.station.reason);

  const p4 = await (plan(LAT, LON, at(400), 519));
  add('(7) jenseits jeder Achse gibt es KEINE Wahl — und jeder Kandidat sagt, warum',
    p4.decisions[0].primary === null && p4.decisions[0].candidates.every((c) => !c.available && c.reason.length > 10),
    p4.decisions[0].candidates.map((c) => c.product).join(','));
  add('(7) die Luecke wird als Luecke gefuehrt, nicht als leeres Ergebnis',
    p4.gaps.length === 1 && /trägt 0…48 h/.test(p4.gaps[0].why));

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
    const hits = [];
    for (const f of js) {
      const t = readFileSync(join(dist, f), 'utf8');
      // PD-E hat zwei Signaturen dazugelegt: den Hoehen-Leser und die Druckflaechen.
      for (const needle of ['planPointSources', 'readCubePoint', 'nowcastSlotStamps', 'stationMaxDElevM',
        'readHmodelPoint', 'belowGroundHPa', 'derived-gh-sp']) {
        if (t.includes(needle)) hits.push(`${f}:${needle}`);
      }
    }
    add('(8) kein Vorstufen-Modul steht im Bundle (kein Verbraucher ist verdrahtet)',
      hits.length === 0, hits.join(' ') || `${js.length} Chunks geprueft`);
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

// --- Ausgabe ----------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
