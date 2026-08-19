/**
 * L0-C — die vier Schnell-Abfragen, die zusammen sechs offene Fragen aus
 * `docs/DATA_SOURCES.md` §13 schließen.
 *
 *   node scripts/l0/probe-contracts.mjs            # alles
 *   node scripts/l0/probe-contracts.mjs warn hdf5  # nur einzelne Blöcke
 *   node scripts/l0/probe-contracts.mjs --json audit/l0/contracts.json
 *
 * Blöcke:
 *   warn    F-4  echte Property-Liste von dwd:Warnungen_Gemeinden
 *                (heute steht in der Doku eine aus Fremd-Clients zusammengetragene)
 *   time    F-5  hat dwd:Accumulated_Flash_Area eine TIME-Dimension?
 *                (+ Gegenprobe dwd:Blitzdichte, deren Extent belegt ist)
 *   hdf5    F-2  kann `jsfive` die MeteoSchweiz-ODIM-Dateien LESEN?
 *                Das ist der funktionale Test: gelingt `.value`, ist der
 *                Kompressionsfilter unterstützt — egal wie er heißt.
 *   re      F-10 RADVOR-RE: Gitter wirklich 900x900? Header PR/INT/VV?
 *                Kommt Bit 13 („Hagelflag") in echten Bytes vor?
 *   konrad  F-3  KONRAD3D-XML: welche Elemente und Attribute gibt es?
 *
 * Netzabhängig ⇒ KEIN Gate-Verifier. `jsfive` ist bereits Runtime-Dependency
 * (D-06 unberührt); ein Import in einem Node-Skript fügt nichts hinzu.
 *
 * Der hdf5-Block braucht den Resolve-Hook nicht — jsfive wird als Paket geladen:
 *   node scripts/l0/probe-contracts.mjs
 */

import { gunzipSync } from 'node:zlib';

const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const jsonIdx = process.argv.indexOf('--json');
const JSON_OUT = jsonIdx >= 0 ? process.argv[jsonIdx + 1] : null;
const want = (name) => ARGS.length === 0 || ARGS.includes(name);

const out = { at: new Date().toISOString() };
const hr = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`);

// ---------------------------------------------------------------------------
// Erreichbarkeits-Vorprüfung — gleiche Sorge wie in probe-cors.mjs: hinter einem
// Firmen-Proxy oder in einer Sandbox scheitern alle Blöcke identisch, und das
// Protokoll läse sich wie „die Quellen sind kaputt". Lieber früh und deutlich
// abbrechen als fünf Falschbefunde produzieren.
// ---------------------------------------------------------------------------
try {
  const r = await fetch('https://opendata.dwd.de/weather/radar/', { method: 'HEAD' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log('\n' + '!'.repeat(78));
  console.log('AUSGANG BLOCKIERT — Vorprüfung auf opendata.dwd.de fehlgeschlagen:');
  console.log(`  ${String(e.message ?? e)}`);
  console.log('!'.repeat(78));
  console.log('\nVon einem Rechner mit direktem Internetzugang erneut laufen lassen.');
  console.log('Ein Lauf hinter Proxy/VPN/Sandbox liefert nur Scheinbefunde.\n');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// F-4 — dwd:Warnungen_Gemeinden: echte Attribute
// ---------------------------------------------------------------------------
if (want('warn')) {
  hr('F-4 · dwd:Warnungen_Gemeinden — echte Property-Liste');
  const base = 'https://maps.dwd.de/geoserver/dwd';
  const res = {};

  // (a) DescribeFeatureType — das SCHEMA, unabhängig davon, ob gerade gewarnt wird.
  try {
    const url = `${base}/wfs?service=WFS&version=2.0.0&request=DescribeFeatureType`
      + `&typeName=${encodeURIComponent('dwd:Warnungen_Gemeinden')}`;
    const xml = await (await fetch(url)).text();
    const els = [...xml.matchAll(/<xsd:element[^>]*name="([^"]+)"[^>]*type="([^"]+)"/g)]
      .map((m) => ({ name: m[1], type: m[2] }));
    res.schema = els;
    console.log(`  DescribeFeatureType: ${els.length} Elemente`);
    for (const e of els) console.log(`    ${e.name.padEnd(24)} ${e.type}`);
    if (!els.length) console.log('  ⚠ kein xsd:element gefunden — Antwort manuell ansehen:\n  ' + url);
  } catch (e) {
    res.schemaError = String(e.message ?? e);
    console.log(`  ✗ DescribeFeatureType: ${res.schemaError}`);
  }

  // (b) Ein echtes Feature — zeigt die tatsächlich befüllten Felder und Wertebereiche.
  try {
    const url = `${base}/ows?version=2.0.0&SERVICE=WFS&outputFormat=application/json`
      + `&REQUEST=GetFeature&typeName=${encodeURIComponent('dwd:Warnungen_Gemeinden')}&CRS=CRS:84&count=1`;
    const gj = await (await fetch(url)).json();
    const f = gj?.features?.[0];
    res.featureCount = gj?.numberMatched ?? gj?.totalFeatures ?? null;
    console.log(`\n  Aktive Warnungen gerade: ${res.featureCount ?? '?'}`);
    if (f) {
      res.sampleProps = f.properties;
      res.geometryType = f.geometry?.type;
      console.log(`  Geometrie: ${f.geometry?.type}`);
      console.log('  Beispiel-Feature:');
      for (const [k, v] of Object.entries(f.properties ?? {})) {
        const s = typeof v === 'string' && v.length > 90 ? v.slice(0, 90) + '…' : v;
        console.log(`    ${k.padEnd(24)} ${JSON.stringify(s)}`);
      }
    } else {
      console.log('  (keine aktive Warnung — bei ruhiger Lage normal. Schema oben zählt.)');
    }
  } catch (e) {
    res.featureError = String(e.message ?? e);
    console.log(`  ✗ GetFeature: ${res.featureError}`);
  }

  console.log('\n  → Abgleich mit docs/API.md §3.3. Abweichungen dort korrigieren, BEVOR L3 startet.');
  out.warnungenGemeinden = res;
}

// ---------------------------------------------------------------------------
// F-5 — TIME-Dimension der Blitz-Layer
// ---------------------------------------------------------------------------
if (want('time')) {
  hr('F-5 · TIME-Dimension der Blitz-Layer (Per-Layer-Virtual-Service)');
  const layers = ['Accumulated_Flash_Area', 'Blitzdichte', 'Accumulated_Flash_Geometry', 'NCEW_EU'];
  const res = {};
  for (const l of layers) {
    try {
      const url = `https://maps.dwd.de/geoserver/dwd/${l}/wms?service=WMS&version=1.3.0&request=GetCapabilities`;
      const xml = await (await fetch(url)).text();
      // WMS 1.3.0: <Dimension name="time" …>extent</Dimension>; 1.1.1: <Extent name="time">
      const m = xml.match(/<(?:Dimension|Extent)[^>]*name="time"[^>]*>([\s\S]*?)<\//i);
      const extent = m ? m[1].trim() : null;
      const abstract = (xml.match(/<Abstract>([\s\S]*?)<\/Abstract>/) ?? [])[1]?.trim() ?? null;
      res[l] = { hasTime: !!extent, extent, abstract };
      console.log(`\n  ${l}`);
      console.log(`    TIME: ${extent ? 'JA' : 'NEIN'}`);
      if (extent) console.log(`    Extent: ${extent.length > 160 ? extent.slice(0, 160) + '…' : extent}`);
      if (abstract) console.log(`    Abstract: ${abstract.slice(0, 220)}`);
    } catch (e) {
      res[l] = { error: String(e.message ?? e) };
      console.log(`\n  ${l}\n    ✗ ${res[l].error}`);
    }
  }
  console.log('\n  → Hat Accumulated_Flash_Area KEINE TIME-Dimension, ist Blitzdichte (DE) +');
  console.log('    mtg_fd:li_afa (DACH) der richtige Weg — genau so steht es in docs/WEATHER.md §21.');
  out.lightningTime = res;
}

// ---------------------------------------------------------------------------
// F-2 — kann jsfive die MeteoSchweiz-ODIM-Dateien lesen?
// ---------------------------------------------------------------------------
if (want('hdf5')) {
  hr('F-2 · jsfive gegen MeteoSchweiz ODIM-HDF5 (Radar + Hagel)');
  console.log('  Funktionaler Test: gelingt das Lesen von .value, ist der Filter unterstützt.');
  console.log('  (Für den Filternamen selbst: h5dump -pH auf die heruntergeladene Datei.)\n');

  let H5;
  try {
    ({ File: H5 } = await import('jsfive'));
  } catch (e) {
    console.log(`  ✗ jsfive nicht importierbar: ${e.message}`);
    console.log('    → aus dem Repo-Root laufen lassen (node_modules muss auflösbar sein).');
  }

  const res = {};
  if (H5) {
    const pad2 = (n) => String(n).padStart(2, '0');
    const day = (d) => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
    const now = new Date();

    for (const [coll, prefixes] of [
      ['ch.meteoschweiz.ogd-radar-precip', ['rzc', 'cpc']],
      ['ch.meteoschweiz.ogd-radar-hail', ['bzc', 'mzc']],
    ]) {
      for (const prefix of prefixes) {
        const key = `${coll}:${prefix}`;
        try {
          // jüngstes Asset über das STAC-Tagesitem (heute, sonst gestern)
          let href = null;
          for (const d of [day(now), day(new Date(now.getTime() - 864e5))]) {
            const url = `https://data.geo.admin.ch/api/stac/v1/collections/${coll}/items/${d}-ch`;
            const r = await fetch(url);
            if (!r.ok) continue;
            const item = await r.json();
            const keys = Object.keys(item.assets ?? {}).filter((k) => k.toLowerCase().startsWith(prefix)).sort();
            if (keys.length) { href = item.assets[keys[keys.length - 1]].href; break; }
          }
          if (!href) { res[key] = { note: 'kein Asset gefunden (Hagel: nur 01.04.–30.09.!)' }; console.log(`  ${key.padEnd(46)} — ${res[key].note}`); continue; }

          const buf = await (await fetch(href)).arrayBuffer();
          const f = new H5(buf, 'probe.h5');
          const where = f.get('where')?.attrs ?? {};
          const ds = f.get('dataset1/data1/data');
          const v = ds?.value;                       // ← hier scheitert es, wenn der Filter fehlt
          const what = f.get('what')?.attrs ?? {};
          const dwhat = f.get('dataset1/data1/what')?.attrs ?? {};
          res[key] = {
            ok: true, href, bytes: buf.byteLength,
            xsize: where.xsize, ysize: where.ysize,
            shape: ds?.shape, dtype: ds?.dtype,
            gain: dwhat.gain, offset: dwhat.offset, nodata: dwhat.nodata, undetect: dwhat.undetect,
            quantity: dwhat.quantity,
            date: what.date, time: what.time,
            samples: v ? Array.from({ length: 5 }, (_, i) => v[Math.floor(v.length / 6) * (i + 1)]) : null,
          };
          console.log(`  ${key.padEnd(46)} ✓ gelesen`);
          console.log(`     ${res[key].xsize}×${res[key].ysize}  dtype=${res[key].dtype}  quantity=${res[key].quantity ?? '?'}`
            + `  gain=${res[key].gain ?? '?'} offset=${res[key].offset ?? '?'}`);
          console.log(`     ${(buf.byteLength / 1024).toFixed(0)} KB komprimiert · Stichproben: ${JSON.stringify(res[key].samples)}`);
          console.log(`     ${href}`);
        } catch (e) {
          res[key] = { ok: false, error: String(e.message ?? e) };
          console.log(`  ${key.padEnd(46)} ✗ ${res[key].error}`);
          console.log('     → wenn hier „filter"/„szip"/„unsupported" steht: jsfive reicht NICHT.');
          console.log('       Dann h5dump -pH auf die Datei und den Filter in docs/DATA_SOURCES.md §12 RK-5 nachtragen.');
        }
      }
    }
  }
  console.log('\n  → Erfolg heißt: Hagel CH (L8) ist Muster P3 und kostet ~S. Misserfolg heißt:');
  console.log('    eigener Filter-Decoder, +3–5 Tage, und die L8-Schätzung in §13 ist zu korrigieren.');
  out.jsfiveOdim = res;
}

// ---------------------------------------------------------------------------
// F-10 — RADVOR RE: Gitter, Header, Hagelflag
// ---------------------------------------------------------------------------
if (want('re')) {
  hr('F-10 · RADVOR RE — Gitter 900×900? Header? Bit 13 „Hagelflag" in echten Bytes?');
  const DIR = 'https://opendata.dwd.de/weather/radar/radvor/re/';
  const res = {};
  try {
    const html = await (await fetch(DIR)).text();
    const names = [...new Set([...html.matchAll(/RE(\d{10})_(\d{3})\.gz/g)].map((m) => m[0]))].sort();
    res.available = names.length;
    const latest000 = names.filter((n) => n.endsWith('_000.gz')).pop();
    console.log(`  Dateien im Verzeichnis: ${names.length}, jüngste Analyse: ${latest000}`);
    if (!latest000) throw new Error('keine _000-Datei gefunden');

    const raw = new Uint8Array(await (await fetch(DIR + latest000)).arrayBuffer());
    const bin = new Uint8Array(gunzipSync(raw));
    res.gzBytes = raw.length;
    res.rawBytes = bin.length;

    // ASCII-Header bis ETX (0x03)
    const etx = bin.indexOf(0x03);
    const header = new TextDecoder('latin1').decode(bin.subarray(0, etx < 0 ? 200 : etx));
    res.header = header;
    console.log(`\n  ${raw.length} B gzip → ${bin.length} B roh`);
    console.log(`  Header: ${header}`);

    const gp = header.match(/GP\s*(\d+)x\s*(\d+)/);
    const pr = header.match(/PR\s+(E[-+]\d+)/);
    const int = header.match(/INT\s*(\d+)/);
    const vv = header.match(/VV\s*(\d+)/);
    res.grid = gp ? { cols: +gp[2], rows: +gp[1] } : null;
    res.pr = pr?.[1] ?? null; res.int = int?.[1] ?? null; res.vv = vv?.[1] ?? null;

    const payload = bin.length - (etx + 1);
    const cells = res.grid ? res.grid.cols * res.grid.rows : null;
    console.log(`  GP=${gp ? `${gp[1]}x${gp[2]}` : '?'}  PR=${res.pr}  INT=${res.int}  VV=${res.vv}`);
    console.log(`  Payload ${payload} B  ·  ${cells ?? '?'} Zellen  ·  ${cells ? (payload / cells).toFixed(2) : '?'} Byte/Zelle`);
    if (cells && Math.abs(payload / cells - 2) < 0.01) console.log('    → 2 Byte/Zelle bestätigt (RE steht nicht in der 1-Byte-Ausnahmeliste)');
    if (cells === 900 * 900) console.log('    → 900×900 BESTÄTIGT (nicht DE1200 — docs/API.md §2.3 stimmt)');
    else if (cells === 1100 * 1200) console.log('    ⚠ DE1200! docs/API.md §2.3 und docs/DATA_SOURCES.md §5 korrigieren');

    // Bit-13-Statistik über echte Bytes
    let flagged = 0, err = 0, nonzero = 0, maxVal = 0;
    const start = etx + 1;
    for (let i = start; i + 1 < bin.length; i += 2) {
      const w = bin[i] | (bin[i + 1] << 8);
      if (w & 0x2000) flagged++;          // Bit 13 (0-basiert 13 → 0x2000) = Hagelflag
      if (w & 0x4000) err++;              // Bit 14 = Fehlkennung
      const val = w & 0x0fff;
      if (val > 0) nonzero++;
      if (val > maxVal) maxVal = val;
    }
    res.bit13 = flagged; res.bit14 = err; res.nonzero = nonzero; res.maxValue = maxVal;
    console.log(`\n  Bit 13 (Hagelflag) gesetzt: ${flagged} Zellen`);
    console.log(`  Bit 14 (Fehlkennung):       ${err} Zellen`);
    console.log(`  Wert > 0:                   ${nonzero} Zellen · Maximum ${maxVal}`);
    if (maxVal > 1000) console.log('    ⚠ Maximum > 1000 — die Spec nennt 0–1000. Annahme in docs/API.md §2.3 prüfen.');
    if (flagged === 0) console.log('    (0 ist bei ruhiger Lage normal — im Sommer bei Gewitter erneut messen.)');
  } catch (e) {
    res.error = String(e.message ?? e);
    console.log(`  ✗ ${res.error}`);
    console.log('    Hinweis: opendata.dwd.de sendet kein CORS — aus Node geht es trotzdem.');
  }
  out.radvorRe = res;
}

// ---------------------------------------------------------------------------
// F-3 — KONRAD3D-Schema
// ---------------------------------------------------------------------------
if (want('konrad')) {
  hr('F-3 · KONRAD3D — welche Elemente und Attribute liefert das XML?');
  const DIR = 'https://opendata.dwd.de/weather/radar/konrad3d/';
  const res = {};
  try {
    const html = await (await fetch(DIR)).text();
    const files = [...new Set([...html.matchAll(/KONRAD3D_\d{8}T\d{6}\.xml/g)].map((m) => m[0]))].sort();
    // Größte statt jüngste: bei ruhiger Lage sind die jüngsten leer und zeigen kein Schema.
    const sizes = [...html.matchAll(/(KONRAD3D_\d{8}T\d{6}\.xml)<\/a>\s*\S+\s+\S+\s+(\d+)/g)]
      .map((m) => ({ name: m[1], size: +m[2] })).sort((a, b) => b.size - a.size);
    const pick = sizes[0]?.name ?? files[files.length - 1];
    res.available = files.length;
    res.picked = pick;
    console.log(`  Dateien: ${files.length} · gewählt (größte = aussagekräftigste): ${pick}`
      + (sizes[0] ? ` (${(sizes[0].size / 1024).toFixed(0)} KB)` : ''));

    const xml = await (await fetch(DIR + pick)).text();
    res.bytes = xml.length;
    const tags = {};
    for (const m of xml.matchAll(/<([A-Za-z_][\w:.-]*)/g)) tags[m[1]] = (tags[m[1]] ?? 0) + 1;
    const attrs = new Set();
    for (const m of xml.matchAll(/\s([A-Za-z_][\w:.-]*)=["']/g)) attrs.add(m[1]);
    res.tags = tags;
    res.attributes = [...attrs].sort();

    console.log(`\n  Elemente (Häufigkeit):`);
    for (const [t, n] of Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 30)) {
      console.log(`    ${String(n).padStart(6)}  ${t}`);
    }
    console.log(`\n  Attributnamen (${res.attributes.length}):\n    ${res.attributes.join(', ')}`);
    console.log(`\n  Erste 1200 Zeichen:\n${xml.slice(0, 1200).split('\n').map((l) => '    ' + l).join('\n')}`);
    console.log('\n  → Gesucht: Zell-ID, Schwerpunkt (lat/lon), Zuggeschwindigkeit/-richtung, Attribute');
    console.log('    (Hagel, Böen, Intensität). Sind sie da, ist L11 amtlich statt selbst gerechnet.');
    console.log('    Sind sie NICHT eindeutig benannt: Formatbeschreibung beim DWD anfordern — nicht raten (D-04).');
  } catch (e) {
    res.error = String(e.message ?? e);
    console.log(`  ✗ ${res.error}`);
  }
  out.konrad3d = res;
}

// ---------------------------------------------------------------------------
if (JSON_OUT) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify(out, null, 2));
  console.log(`\n\nJSON geschrieben: ${JSON_OUT}`);
}
console.log('\nFertig. Befunde in docs/DATA_SOURCES.md §13 abhaken und dort korrigieren, wo die Messung');
console.log('der Recherche widerspricht — die Recherche ist als ⚠️/❌ markiert, genau dafür.\n');
