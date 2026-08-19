/**
 * WB0 — Nutzlast-Prüfung der Waldbrand-Endpunkte (Gate GWB0, tests.md §WB-T0).
 *
 *   node scripts/l0/probe-waldbrand-payloads.mjs
 *   node scripts/l0/probe-waldbrand-payloads.mjs --json audit/l0/waldbrand-payloads.json
 *
 * WARUM ZUSÄTZLICH ZU probe-cors.mjs: Jenes Skript beantwortet „darf der Browser
 * die Antwort lesen?". Dieses beantwortet „steht das drin, was der Plan
 * voraussetzt?" — Spaltennamen, Feldnamen, Klassenzahl, Achsenreihenfolge,
 * Feature-Anzahl. Ein Gate, das nur Statuscodes zählt, hakt Annahmen ab statt
 * Tatsachen (CLAUDE.md: Gates nur mit Beleg).
 *
 * Netzabhängig ⇒ KEIN Gate-Verifier im Sinne von D-12. Exit-Code immer 0; das
 * Urteil steht in der Ausgabe und im JSON.
 *
 * Fair Use: genau ein Abruf je Endpunkt, keine Schleifen, kein Polling —
 * `data.geo.admin.ch` verlangt das ausdrücklich (docs/DATA_SOURCES.md §W.6).
 */

import { gunzipSync } from 'node:zlib';

const ORIGIN = process.env.BUSCOSUN_ORIGIN ?? 'https://buscosun.com';
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 120_000);
const jsonIdx = process.argv.indexOf('--json');
const JSON_OUT = jsonIdx >= 0 ? process.argv[jsonIdx + 1] : null;

const EFFIS = 'https://maps.effis.emergency.copernicus.eu';
const DWD_DIRECT = 'https://opendata.dwd.de';
// Der produktive Weg: derselbe Rewrite, den radolan.ts benutzt (netlify.toml:27-31).
const DWD_PROXY = `${ORIGIN}/_dwd_opendata`;
const WBI_DIR = '/climate_environment/CDC/derived_germany/fire_danger_index/woodland/forecast/recent/';
const GLFI_DIR = '/climate_environment/CDC/derived_germany/fire_danger_index/grassland/forecast/recent/';

const out = { origin: ORIGIN, at: new Date().toISOString(), steps: {} };
const lines = [];
const say = (s = '') => { lines.push(s); console.log(s); };
const head = (t) => { say(''); say(t); say('-'.repeat(t.length)); };

async function get(url, { raw = false } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { Origin: ORIGIN }, signal: ac.signal, redirect: 'follow' });
    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      ok: res.ok, status: res.status, ms: Date.now() - t0, bytes: buf.byteLength,
      acao: res.headers.get('access-control-allow-origin'),
      cacheControl: res.headers.get('cache-control'),
      contentType: res.headers.get('content-type'),
      body: raw ? buf : new TextDecoder().decode(buf),
      raw: buf,
    };
  } catch (err) {
    return { ok: false, status: null, ms: Date.now() - t0, error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

const stamp = (r) => `HTTP ${r.status ?? 'ERR'} · ${r.ms} ms · ${r.bytes ?? 0} B · ACAO ${r.acao ?? '(keins)'}`;

// ===========================================================================
// T0-2  GWIS GetCapabilities + GetMap — der Layer `fireDanger`
// ===========================================================================
head('T0-2  GWIS WMS — Capabilities und GetMap (Layer fireDanger)');
{
  const caps = await get(`${EFFIS}/gwis?service=WMS&request=GetCapabilities&version=1.3.0`);
  say(`GetCapabilities: ${stamp(caps)}`);
  const step = { request: 'GetCapabilities 1.3.0', ...meta(caps) };
  if (caps.ok) {
    const names = [...caps.body.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]);
    const ecmwf = names.filter((n) => n.startsWith('ecmwf.'));
    step.layerCount = names.length;
    step.ecmwfLayers = ecmwf;
    step.hasFwi = ecmwf.includes('ecmwf.fwi');
    // Die TIME-Dimension entscheidet, ob der Zeitregler überhaupt greifen kann.
    const dim = caps.body.match(/<Dimension name="time"[^>]*>([^<]*)</i);
    step.timeDimension = dim ? dim[1].trim() : null;
    const crs = [...new Set([...caps.body.matchAll(/<CRS>([^<]+)<\/CRS>/g)].map((m) => m[1]))];
    step.crs = crs.slice(0, 12);
    step.supports3857 = crs.includes('EPSG:3857');
    say(`  Layer gesamt: ${names.length} · davon ecmwf.*: ${ecmwf.length}`);
    say(`  ecmwf.fwi vorhanden: ${step.hasFwi ? 'JA' : 'NEIN'} — ${ecmwf.slice(0, 12).join(', ')}`);
    say(`  TIME-Dimension: ${step.timeDimension ?? '(nicht gefunden)'}`);
    say(`  EPSG:3857 (MapLibre-Weg) angeboten: ${step.supports3857 ? 'JA' : 'NEIN'}`);
  }
  out.steps.gwisCapabilities = step;
}
{
  // Drei Achsenvarianten desselben DACH-Ausschnitts. Der Vergleich der Bytes
  // beweist, dass der Server 1.3.0/lat,lon und 1.1.1/lon,lat gleich auflöst —
  // sonst rendert WB2 stumm den falschen Erdteil.
  const D = { minLon: 5.5, minLat: 45.5, maxLon: 17.5, maxLat: 55.5 };
  const m = (lon, lat) => [
    Math.round((6378137 * lon * Math.PI) / 180),
    Math.round(6378137 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))),
  ];
  const today = new Date().toISOString().slice(0, 10);
  const base = `${EFFIS}/gwis?SERVICE=WMS&REQUEST=GetMap&LAYERS=ecmwf.fwi&STYLES=`
    + `&WIDTH=512&HEIGHT=512&FORMAT=image/png&TRANSPARENT=TRUE&TIME=${today}`;
  const variants = {
    'EPSG:3857 (1.3.0)': `${base}&VERSION=1.3.0&CRS=EPSG:3857&BBOX=${[...m(D.minLon, D.minLat), ...m(D.maxLon, D.maxLat)].join(',')}`,
    'EPSG:4326 (1.3.0, lat/lon)': `${base}&VERSION=1.3.0&CRS=EPSG:4326&BBOX=${D.minLat},${D.minLon},${D.maxLat},${D.maxLon}`,
    'EPSG:4326 (1.1.1, lon/lat)': `${base}&VERSION=1.1.1&SRS=EPSG:4326&BBOX=${D.minLon},${D.minLat},${D.maxLon},${D.maxLat}`,
  };
  const maps = {};
  for (const [label, url] of Object.entries(variants)) {
    const r = await get(url, { raw: true });
    const png = r.raw && r.raw.length > 24 && r.raw[1] === 0x50 && r.raw[2] === 0x4e && r.raw[3] === 0x47;
    const w = png ? readU32(r.raw, 16) : null;
    const h = png ? readU32(r.raw, 20) : null;
    maps[label] = { ...meta(r), isPng: png, width: w, height: h };
    say(`GetMap ${label.padEnd(28)} ${stamp(r)} · PNG ${png ? `${w}×${h}` : 'NEIN'}`);
    if (!png && r.body) say(`   ⚠ Körper: ${String(r.body).slice(0, 200)}`);
  }
  out.steps.gwisGetMap = maps;
}

// ===========================================================================
// T0-3  EFFIS WFS GetFeature — der Layer `fireHotspots`
// ===========================================================================
head('T0-3  WFS GetFeature Hotspots (Layer fireHotspots)');
{
  // ACHTUNG, WB0-Korrektur: `plan.md` §WB2 und `docs/DATA_SOURCES.md` §W.2 nennen
  // den EFFIS-Dienst mit blankem `ms:viirs.hs`. Gemessen liefert der einen bei
  // Oktober 2021 eingefrorenen Archivstand — als „NRT" beschriftet, aber fünf
  // Jahre alt. Live sind die GWIS-Fensterlayer `.today` / `.week`. Beides wird
  // hier gemessen, damit der Befund im Beleg steht statt in einer Fußnote.
  const url = `${EFFIS}/gwis?service=WFS&request=GetFeature&typename=ms:viirs.hs.today`
    + '&version=1.1.0&outputformat=geojson&maxfeatures=25';
  const r = await get(url);
  say(`GetFeature GWIS ms:viirs.hs.today: ${stamp(r)}`);
  const step = { request: 'GWIS GetFeature ms:viirs.hs.today maxfeatures=25', ...meta(r) };
  if (r.ok) {
    try {
      const fc = JSON.parse(r.body);
      step.featureCount = fc.features?.length ?? 0;
      step.properties = Object.keys(fc.features?.[0]?.properties ?? {});
      step.firstFeature = fc.features?.[0] ?? null;
      const lons = (fc.features ?? []).map((f) => f.geometry?.coordinates?.[0]).filter(Number.isFinite);
      const lats = (fc.features ?? []).map((f) => f.geometry?.coordinates?.[1]).filter(Number.isFinite);
      step.lonRange = lons.length ? [Math.min(...lons), Math.max(...lons)] : null;
      step.latRange = lats.length ? [Math.min(...lats), Math.max(...lats)] : null;
      // Die Attribute, an denen WB2 hängt: Erfassungszeit und Feuerstrahlungsleistung.
      step.hasFrp = step.properties.includes('frp');
      step.hasAcqAt = step.properties.some((p) => /acq/i.test(p));
      say(`  Features: ${step.featureCount} · frp vorhanden: ${step.hasFrp ? 'JA' : 'NEIN'}`
        + ` · Erfassungszeit: ${step.hasAcqAt ? 'JA' : 'NEIN'}`);
      say(`  Eigenschaften: ${step.properties.join(', ')}`);
      say(`  Koordinatenbereich lon ${fmtRange(step.lonRange)} · lat ${fmtRange(step.latRange)}`);
    } catch (e) { step.parseError = String(e?.message ?? e); say(`  ⚠ kein gültiges GeoJSON: ${step.parseError}`); }
  }
  out.steps.effisHotspots = step;
}
{
  // Derselbe Layer auf den DACH-Ausschnitt eingegrenzt — beantwortet zugleich,
  // ob im August überhaupt Detektionen in DACH liegen (Erwartung: wenige).
  const url = `${EFFIS}/gwis?service=WFS&request=GetFeature&typename=ms:viirs.hs.week`
    + '&version=1.1.0&outputformat=geojson&maxfeatures=200&bbox=45.5,5.5,55.5,17.5,EPSG:4326';
  const r = await get(url);
  const step = { request: 'GWIS GetFeature ms:viirs.hs.week BBOX DACH', ...meta(r) };
  if (r.ok) {
    try {
      const fc = JSON.parse(r.body);
      step.featureCount = fc.features?.length ?? 0;
      const inDach = (fc.features ?? []).filter((f) => {
        const [lon, lat] = f.geometry?.coordinates ?? [];
        return lon >= 5.5 && lon <= 17.5 && lat >= 45.5 && lat <= 55.5;
      }).length;
      step.insideDach = inDach;
      // Wenn die Filterung stimmt, MUSS inDach == featureCount sein. Weicht es ab,
      // hat der Server die Achsen anders gelesen als wir — genau das prüfen wir hier.
      step.bboxAxisOrderOk = step.featureCount === 0 || inDach === step.featureCount;
      const t = (fc.features ?? []).map((f) => f.properties?.acq_at).filter(Boolean).sort();
      step.acqAtRange = t.length ? [t[0], t[t.length - 1]] : null;
      say(`GetFeature DACH-BBOX: ${stamp(r)} · ${step.featureCount} Features,`
        + ` davon geometrisch in DACH: ${inDach} ⇒ Achsenreihenfolge`
        + ` ${step.bboxAxisOrderOk ? 'plausibel (lat,lon)' : 'WIDERSPRÜCHLICH'}`);
      say(`  Erfassungszeiten: ${step.acqAtRange ? step.acqAtRange.join('  …  ') : '(keine Features)'}`);
    } catch (e) { step.parseError = String(e?.message ?? e); }
  } else say(`GetFeature DACH-BBOX: ${stamp(r)}`);
  out.steps.effisHotspotsDach = step;
}
{
  // Der Gegenbeleg: derselbe Layername auf dem EFFIS-Dienst — genau die URL aus
  // plan.md §WB2. Wenn hier ein Datum von 2021 steht, ist die Quellenangabe im
  // Plan falsch, nicht die Messung.
  const r = await get(`${EFFIS}/effis?service=WFS&request=GetFeature&typename=ms:viirs.hs`
    + '&version=1.1.0&outputformat=geojson&maxfeatures=5');
  const step = { request: 'EFFIS GetFeature ms:viirs.hs (Plan-URL)', ...meta(r) };
  if (r.ok) {
    try {
      const fc = JSON.parse(r.body);
      const t = (fc.features ?? []).map((f) => f.properties?.acq_at).filter(Boolean).sort();
      step.acqAtRange = t.length ? [t[0], t[t.length - 1]] : null;
      step.staleYears = t.length
        ? +((Date.now() - Date.parse(`${t[t.length - 1].replace(' ', 'T')}Z`)) / 3.15576e10).toFixed(1)
        : null;
      say(`Gegenprobe EFFIS ms:viirs.hs (Plan-URL): ${stamp(r)}`);
      say(`  Erfassungszeiten: ${step.acqAtRange ? step.acqAtRange.join('  …  ') : '—'}`
        + ` ⇒ ${step.staleYears != null && step.staleYears > 1 ? `ARCHIVSTAND, ~${step.staleYears} Jahre alt` : 'aktuell'}`);
    } catch (e) { step.parseError = String(e?.message ?? e); }
  } else say(`Gegenprobe EFFIS ms:viirs.hs: ${stamp(r)}`);
  out.steps.effisHotspotsPlanUrl = step;
}

// ===========================================================================
// T0-4  BAFU — amtliche Schweizer Gefahrenstufe und Feuerverbote
// ===========================================================================
head('T0-4  BAFU CH — Gefahrenstufe und Feuerverbote (data.geo.admin.ch)');
{
  const r = await get('https://data.geo.admin.ch/ch.bafu.gefahren-waldbrand_warnung/'
    + 'gefahren-waldbrand_warnung/gefahren-waldbrand_warnung_2056.geojson');
  say(`Gefahrenstufe GeoJSON: ${stamp(r)} · Cache-Control: ${r.cacheControl ?? '(keins)'}`);
  const step = { request: 'BAFU Gefahrenstufe 2056', ...meta(r) };
  if (r.ok) {
    try {
      const fc = JSON.parse(r.body);
      step.featureCount = fc.features?.length ?? 0;
      step.crs = fc.crs ?? null;
      step.properties = Object.keys(fc.features?.[0]?.properties ?? {});
      step.firstProperties = fc.features?.[0]?.properties ?? null;
      // Welche Stufen kommen heute tatsächlich vor? Das entscheidet, ob die
      // Skala 1..5 im Feature steht oder aus einer Farbe abgeleitet werden müsste.
      const levelKey = step.properties.find((p) => /warn|danger|gefahr|level|stufe/i.test(p));
      step.levelKey = levelKey ?? null;
      if (levelKey) {
        step.levelValues = [...new Set((fc.features ?? []).map((f) => f.properties?.[levelKey]))].sort();
      }
      say(`  Features: ${step.featureCount} · CRS: ${JSON.stringify(step.crs)}`);
      say(`  Eigenschaften: ${step.properties.join(', ')}`);
      say(`  Stufenfeld: ${step.levelKey ?? '(nicht erkannt)'} · vorkommende Werte:`
        + ` ${JSON.stringify(step.levelValues ?? null)}`);
    } catch (e) { step.parseError = String(e?.message ?? e); say(`  ⚠ Parsefehler: ${step.parseError}`); }
  }
  out.steps.bafuDanger = step;
}
{
  const r = await get('https://data.geo.admin.ch/api/stac/v1/collections/'
    + 'ch.bafu.gefahren-waldbrand_praeventionsmassnahmen_kantone');
  const step = { request: 'STAC Feuerverbote', ...meta(r) };
  if (r.ok) {
    try {
      const c = JSON.parse(r.body);
      step.title = c.title ?? null;
      step.license = c.license ?? null;
      step.updated = c.extent?.temporal?.interval ?? null;
      say(`Feuerverbote STAC: ${stamp(r)}`);
      say(`  Titel: ${step.title} · STAC-license-Feld: ${step.license}`);
    } catch (e) { step.parseError = String(e?.message ?? e); }
  } else say(`Feuerverbote STAC: ${stamp(r)}`);
  out.steps.bafuBansStac = step;
}

// ===========================================================================
// T0-5  DWD WBI/GLFI über /_dwd_opendata — die Spalten wbi_0…wbi_6
// ===========================================================================
head('T0-5  DWD WBI/GLFI über /_dwd_opendata (Spaltennachweis)');
for (const [name, dir] of [['WBI (Wald)', WBI_DIR], ['GLFI (Grasland)', GLFI_DIR]]) {
  const listing = await get(DWD_PROXY + dir);
  say(`${name} Listing über /_dwd_opendata: ${stamp(listing)}`);
  const step = { request: `${name} Listing`, url: DWD_PROXY + dir, ...meta(listing) };
  if (listing.ok) {
    const files = [...listing.body.matchAll(/href="([^"]+\.(?:csv|txt)\.gz)"/gi)].map((m) => m[1]);
    step.fileCount = files.length;
    step.sampleFiles = files.slice(0, 3);
    say(`  Dateien (.gz): ${files.length}${files.length ? ` · z. B. ${files.slice(0, 2).join(', ')}` : ''}`);
    if (files.length) {
      const file = files[files.length - 1];
      const csvUrl = DWD_PROXY + dir + file.replace(/^.*\//, '');
      const csv = await get(csvUrl, { raw: true });
      step.file = file;
      step.fileFetch = meta(csv);
      say(`  Datei ${file}: ${stamp(csv)}`);
      if (csv.ok) {
        try {
          const text = new TextDecoder('latin1').decode(gunzipSync(Buffer.from(csv.raw)));
          const rows = text.split(/\r?\n/).filter((l) => l.trim().length);
          const header = rows[0];
          const cols = header.split(';').map((c) => c.trim());
          step.header = header;
          step.columns = cols;
          step.rowCount = rows.length - 1;
          step.stationCount = new Set(rows.slice(1).map((l) => l.split(';')[0]?.trim())).size;
          step.firstDataRow = rows[1] ?? null;
          const prefix = name.startsWith('WBI') ? 'wbi' : 'glfi';
          step.expectedDayColumns = Array.from({ length: 7 }, (_, i) => `${prefix}_${i}`);
          step.hasAllDayColumns = step.expectedDayColumns.every(
            (c) => cols.some((x) => x.toLowerCase() === c));
          step.hasStationId = cols.some((c) => /^stations?id$/i.test(c));
          step.hasTermin = cols.some((c) => /^termin$/i.test(c));
          say(`  Kopfzeile: ${header}`);
          say(`  Zeilen: ${step.rowCount} · eindeutige Stationen: ${step.stationCount}`);
          say(`  Erste Datenzeile: ${step.firstDataRow}`);
          say(`  Stationsid: ${step.hasStationId ? 'JA' : 'NEIN'} · Termin: ${step.hasTermin ? 'JA' : 'NEIN'}`
            + ` · ${prefix}_0…${prefix}_6: ${step.hasAllDayColumns ? 'VOLLSTÄNDIG' : 'UNVOLLSTÄNDIG'}`);
        } catch (e) {
          step.gunzipError = String(e?.message ?? e);
          say(`  ⚠ Entpacken fehlgeschlagen: ${step.gunzipError}`);
        }
      }
    }
  }
  out.steps[name.startsWith('WBI') ? 'dwdWbi' : 'dwdGlfi'] = step;
}
{
  // Die Stationsdatei enthält KEINE Koordinaten — ohne diese Liste lässt sich
  // kein einziger WBI-Punkt auf der Karte platzieren. Sie liegt im selben
  // Verzeichnis und ist in plan.md/§W.1 nicht erwähnt.
  const url = `${DWD_PROXY}${WBI_DIR}`
    + 'derived_germany_fire_danger_index_woodland_forecast_recent_v2-3--0_stations_list.txt';
  const r = await get(url, { raw: true });
  const step = { request: 'WBI stations_list.txt', url, ...meta(r) };
  say('');
  say(`Stationsliste (Koordinaten): ${stamp(r)}`);
  if (r.ok) {
    const rows = new TextDecoder('latin1').decode(r.raw).split(/\r?\n/).filter((l) => l.trim());
    step.header = rows[0];
    step.stationCount = rows.length - 1;
    step.sample = rows[1] ?? null;
    const cols = rows[0].split(';').map((c) => c.trim());
    step.columns = cols;
    step.hasLatLon = cols.some((c) => /breite/i.test(c)) && cols.some((c) => /länge|laenge/i.test(c));
    say(`  Kopfzeile: ${rows[0].replace(/\s+/g, ' ')}`);
    say(`  Stationen: ${step.stationCount} · Breite/Länge enthalten: ${step.hasLatLon ? 'JA' : 'NEIN'}`);
    say(`  Beispiel: ${step.sample?.replace(/\s+/g, ' ')}`);
  }
  out.steps.dwdWbiStations = step;
}

// ===========================================================================
// T0-6  Das 1-km-Raster — Erwartung 404
// ===========================================================================
head('T0-6  DWD 1-km-Raster fire_danger_index (Erwartung: 404)');
{
  const r = await get(`${DWD_DIRECT}/climate_environment/CDC/grids_germany/daily/fire_danger_index/`);
  const listing = await get(`${DWD_DIRECT}/climate_environment/CDC/grids_germany/daily/`);
  const entries = listing.ok
    ? [...listing.body.matchAll(/href="([^"?/]+)\//g)].map((m) => m[1]).filter((e) => e !== '..')
    : [];
  const step = {
    request: 'grids_germany/daily/fire_danger_index/',
    ...meta(r),
    stillMissing: r.status === 404,
    parentEntries: entries,
    parentHasFireDanger: entries.some((e) => /fire_danger/i.test(e)),
  };
  say(`fire_danger_index/: ${stamp(r)} ⇒ ${step.stillMissing ? 'weiterhin NICHT vorhanden (Plan bleibt)' : '⚠ ÄNDERUNG — Jan informieren'}`);
  say(`Verzeichnis grids_germany/daily/: ${entries.length} Einträge`);
  say(`  ${entries.join(', ')}`);
  say(`  Eintrag fire_danger_index: ${step.parentHasFireDanger ? '⚠ VORHANDEN — Plan ändert sich' : 'fehlt (wie 2026-08-14 dokumentiert)'}`);
  out.steps.dwdFireGrid = step;
}

// ===========================================================================
// ICON-D2 relhum_2m — der Treiber-Layer aus WB2
// ===========================================================================
head('Zusatz: ICON-D2 relhum_2m (Layer fireWeather, WB2)');
{
  const r = await get(`${DWD_DIRECT}/weather/nwp/icon-d2/grib/00/relhum_2m/`);
  const files = r.ok ? [...r.body.matchAll(/href="([^"]+\.grib2\.bz2)"/gi)].map((m) => m[1]) : [];
  const step = { request: 'icon-d2/grib/00/relhum_2m/', ...meta(r), fileCount: files.length, sample: files[0] ?? null };
  say(`Verzeichnis: ${stamp(r)} · Dateien: ${files.length}${files[0] ? ` · z. B. ${files[0]}` : ''}`);
  say('  Transport: bestehende Edge Function /_dwd_grib (ALLOWED_PREFIXES deckt weather/nwp/icon-d2/grib/ ab).');
  say('  Warm-Cron-Aufnahme wäre STOPP & FRAGEN (Jan) — hier NICHT entschieden.');
  out.steps.iconRelhum = step;
}

// ===========================================================================
function meta(r) {
  return {
    status: r.status ?? null, ms: r.ms, bytes: r.bytes ?? null,
    acao: r.acao ?? null, contentType: r.contentType ?? null,
    cacheControl: r.cacheControl ?? null, error: r.error ?? null,
  };
}
function readU32(b, o) { return (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]; }
function fmtRange(r) { return r ? `${r[0].toFixed(2)}…${r[1].toFixed(2)}` : '—'; }

if (JSON_OUT) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify(out, null, 2));
  say(`\nJSON geschrieben: ${JSON_OUT}`);
}
process.exit(0);
