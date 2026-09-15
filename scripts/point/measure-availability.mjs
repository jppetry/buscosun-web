#!/usr/bin/env node
/**
 * measure-availability.mjs — Bereitstellungszeiten der Punkt-Quellen als APPENDBARE Messreihe.
 *
 * Warum: die drei Punkt-Crons (`scripts/repack-repo/workflow-point.yml`) stehen auf Slots, die
 * aus einer Handvoll Messungen vom 2026-09-09/12 abgeleitet sind (Tabelle im Kopf der Vorlage,
 * `READY_H` in `verify-point-data.mjs`: icon_d2 1,36 h · icon_eu 3,64 h · ifs_oper 7,57 h).
 * Ein Slot, der VOR der Bereitstellung liegt, bekommt still den vorigen Lauf. Vier Läufe sind
 * keine Verteilung — hier entsteht eine Reihe über ≥ 7 Tage, je Quelle und Lauf EIN Wert:
 * „wann stand die LETZTE gebrauchte Datei des Laufs auf dem Server" (Lauf + x h).
 *
 * ── Woher die Zeitstempel kommen (alles anonyme GETs, keine Nutzdaten) ─────────────
 *   DWD        Verzeichnislisting (nginx „Index of"): Name im `href` (der Linktext ist
 *              abgeschnitten), `DD-Mon-YYYY HH:MM:SS` in UTC, Größe. Nur die Verzeichnisse des
 *              aktuellen Tages existieren (`grib/<HH>/`), aber sie tragen bis zur Ablösung noch
 *              den Lauf von GESTERN — der Lauf steht im Dateinamen, nicht im Pfad.
 *   ECMWF      HTML-Tabelle des Open-Data-Portals: `DD-MM-YYYY HH:MM` (Minutenauflösung).
 *              ⚠ Gemessen 2026-09-14: ALLE Dateien des 12z-`oper`-Laufs tragen dieselbe Minute
 *              (19:34 = Lauf + 7,57 h) — das Portal gibt den Lauf als Ganzes frei. Die
 *              Verzeichnisse bleiben ~4 Tage online ⇒ rückwirkend lesbar (Lookback 3 Tage).
 *              ⚠ Ein `scda/`-Verzeichnis gibt es NICHT — auch der 06/18z-Lauf liegt unter `oper/`
 *              (dort bis 144 h); s. `SOURCES.ifs_hres`.
 *   MeteoSchweiz  STAC-Items: `properties.created` der Items am LETZTEN Horizont. ⚠ Unbekannte
 *              Query-Parameter (`forecast:horizon`, `forecast:reference_datetime`) werden STILL
 *              ignoriert (HTTP 200, erste Seite) — §41. Der Standard-Parameter `datetime` wird
 *              dagegen beachtet (am 2026-09-14 belegt: 100 Items, alle mit derselben Gültigzeit).
 *              Also: `datetime = Lauf + letzter Horizont`, dann über `rel=next` blättern. Die
 *              Items sind nach ID (`MMDDYYYY-HHMM-…`) sortiert ⇒ der ÄLTESTE Lauf, der die
 *              Gültigzeit erreicht, steht vorn — und das ist genau der gesuchte. Abbruch, sobald
 *              sein Block zu Ende ist; Deckel 60 Seiten je Sammlung und Aufruf. `created` streut
 *              innerhalb einer (Lauf, Horizont)-Gruppe nur um Sekunden (gemessen 22:45:31…35).
 *   GeoSphere  `available_forecast_reftimes` der Metadaten: nennt nur, WELCHE Läufe da sind,
 *              nicht seit wann ⇒ „Abrufzeit − Lauf" ist eine OBERGRENZE (`bound: "upper"`), keine
 *              Messung. Die erste Beobachtung eines Laufs ist die engste; spätere sind weiter —
 *              deshalb passt Append-only hier exakt.
 *   Daten-Repo `point/index.json` → `latestByTier[t].manifest` → `run.json`: die „wie gebaut"-
 *              Seite (Bauzeit, discover-Phase, je Quelle Lauf/Versatz/Schritte/Abdeckung).
 *              ⚠ `run.json` trägt weder `commit` noch `publishedAt` — beides steht im Index.
 *
 * ── Ablage ─────────────────────────────────────────────────────────────────────────
 *   audit/punktdaten-umsetzungsplan/availability.json   append-only, idempotent: ein Schlüssel
 *                                                        wird NIE überschrieben; zweimal laufen
 *                                                        ändert nur `updatedAt`.
 *   audit/punktdaten-umsetzungsplan/availability.md     daraus gerendert (deutsch).
 *
 * Aufruf:  node scripts/point/measure-availability.mjs [--dry] [--only=icon_d2,ifs_hres,builds]
 *          node scripts/point/measure-availability.mjs --self-test
 * Netz:    global fetch, 30 s je Anfrage, Takt je Host (GeoSphere ≤ 5 req/s ⇒ 250 ms; ECMWF
 *          600 ms wie der Producer; DWD 60 ms), EIN GET je DWD-Verzeichnis, keine Abhängigkeiten.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT_DIR = path.join(ROOT, 'audit', 'punktdaten-umsetzungsplan');
export const STORE_PATH = path.join(OUT_DIR, 'availability.json');
export const TABLE_PATH = path.join(OUT_DIR, 'availability.md');

const DWD = process.env.DWD_OPENDATA_ROOT || 'https://opendata.dwd.de/weather';
const ECMWF = process.env.ECMWF_BASE || 'https://data.ecmwf.int/forecasts';
const STAC = process.env.MCH_STAC || 'https://data.geo.admin.ch/api/stac/v1';
const GEOSPHERE_META = process.env.GEOSPHERE_CLAEF_META
  || 'https://dataset.api.hub.geosphere.at/v1/grid/forecast/nwp-v2-1h-1km/metadata';
const DATA_RAW = process.env.POINT_DATA_RAW || 'https://raw.githubusercontent.com/jppetry/buscosun-data/main';

const REQUEST_TIMEOUT_MS = 30_000;
const STAC_MAX_PAGES = 60;          // je Sammlung und Aufruf — Kostendeckel, wird protokolliert
const ECMWF_LOOKBACK_DAYS = 3;      // heute + 3 Tage zurück: das Portal hält ~4 Tage
const H = 3_600_000;

// Referenz aus dem Verifier (READY_H in verify-point-data.mjs) — nur zum Vergleich in der Tabelle.
const VERIFIER_READY_H = { 'icon_d2|48': 1.36, 'icon_eu|120': 3.64, 'ifs_hres|360': 7.57 };

// ── Quellen ────────────────────────────────────────────────────────────────────────
const H3 = [0, 3, 6, 9, 12, 15, 18, 21];
const H6 = [0, 6, 12, 18];
const p2 = (n) => String(n).padStart(2, '0');
const p3 = (n) => String(n).padStart(3, '0');

export const SOURCES = {
  icon_d2: {
    name: 'ICON-D2', family: 'dwd', runHours: H3, lastStep: () => 48,
    dir: (hh) => `${DWD}/nwp/icon-d2/grib/${p2(hh)}/t_2m/`,
    file: (run, step) => `icon-d2_germany_regular-lat-lon_single-level_${run}_${p3(step)}_2d_t_2m.grib2.bz2`,
  },
  icon_d2_eps: {
    name: 'ICON-D2-EPS', family: 'dwd', runHours: H3, lastStep: () => 48,
    dir: (hh) => `${DWD}/nwp/icon-d2-eps/grib/${p2(hh)}/t_2m/`,
    file: (run, step) => `icon-d2-eps_germany_icosahedral_single-level_${run}_${p3(step)}_2d_t_2m.grib2.bz2`,
  },
  icon_eu: {
    name: 'ICON-EU', family: 'dwd', runHours: H3, lastStep: (hh) => (hh % 6 === 0 ? 120 : 48),
    dir: (hh) => `${DWD}/nwp/icon-eu/grib/${p2(hh)}/t_2m/`,
    file: (run, step) => `icon-eu_europe_regular-lat-lon_single-level_${run}_${p3(step)}_T_2M.grib2.bz2`,
  },
  icon_global: {
    name: 'ICON global', family: 'dwd', runHours: H6, lastStep: (hh) => (hh % 12 === 0 ? 180 : 120),
    dir: (hh) => `${DWD}/nwp/icon/grib/${p2(hh)}/t_2m/`,
    file: (run, step) => `icon_global_icosahedral_single-level_${run}_${p3(step)}_T_2M.grib2.bz2`,
  },
  mosmix_l: {
    name: 'MOSMIX-L', family: 'dwd-mos', runHours: [3, 9, 15, 21], lastStep: () => 247,
    dir: () => `${DWD}/local_forecasts/mos/MOSMIX_L/all_stations/kml/`,
    file: (run) => `MOSMIX_L_${run}.kmz`,
  },
  ifs_hres: {
    // ⚠ Am Portal gibt es KEIN `scda`-Verzeichnis (2026-09-14 unter `…/06z/ifs/0p25/` liegen nur
    // enfo, oper, waef, wave): der 06/18z-Lauf liegt ebenfalls unter `oper` mit Suffix `oper-fc`
    // und endet dort bei 144 h (06z: Schritt 144 um 12:27 UTC = Lauf + 6,45 h, wie §31). So liest
    // ihn auch der Producer (`ecmwf.mjs`, Pfad `ifs/0p25/oper`). „scda" ist der ECMWF-Stromname
    // des Kurz-Cutoff-Laufs, kein Pfad.
    name: 'IFS HRES', family: 'ecmwf', runHours: H6,
    stream: () => 'oper',
    lastStep: (hh) => (hh % 12 === 0 ? 360 : 144),
    dir: (ymd, hh) => `${ECMWF}/${ymd}/${p2(hh)}z/ifs/0p25/oper/`,
    file: (run, step, stream) => `${run}0000-${step}h-${stream}-fc.grib2`,
  },
  aifs_single: {
    name: 'AIFS Single', family: 'ecmwf', runHours: H6,
    stream: () => 'oper', lastStep: () => 360,
    dir: (ymd, hh) => `${ECMWF}/${ymd}/${p2(hh)}z/aifs-single/0p25/oper/`,
    file: (run, step, stream) => `${run}0000-${step}h-${stream}-fc.grib2`,
  },
  icon_ch1_eps: {
    name: 'ICON-CH1-EPS', family: 'stac', runHours: H3, lookbackRuns: 8,
    collection: 'ch.meteoschweiz.ogd-forecasting-icon-ch1',
    lastStep: (hh) => (hh === 3 ? 45 : 33),           // §41: nur 03z trägt 45 h
  },
  icon_ch2_eps: {
    name: 'ICON-CH2-EPS', family: 'stac', runHours: H6, lookbackRuns: 4,
    collection: 'ch.meteoschweiz.ogd-forecasting-icon-ch2',
    lastStep: () => 120,
  },
  claef: {
    name: 'C-LAEF (GeoSphere)', family: 'geosphere', runHours: H3, lastStep: () => 60,
    url: GEOSPHERE_META,
  },
};
export const BUILDS_ID = 'builds';

// ── Reine Funktionen (vom Selbsttest abgedeckt) ────────────────────────────────────
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/** DWD-Listing (nginx): `<a href="NAME">…</a>  DD-Mon-YYYY HH:MM:SS  SIZE`. Verzeichnisse (SIZE `-`) fallen raus. */
export function parseApacheListing(html) {
  const out = [];
  const re = /<a href="([^"]+)">[^<]*<\/a>\s+(\d{2})-([A-Z][a-z]{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})\s+(\d+)\b/g;
  let m;
  while ((m = re.exec(html))) {
    const mon = MONTHS[m[3]];
    if (mon == null) continue;
    out.push({
      name: m[1],
      mtimeMs: Date.UTC(+m[4], mon, +m[2], +m[5], +m[6], +m[7]),
      bytes: +m[8],
    });
  }
  return out;
}

/** ECMWF-Portal: `<td><a href="/…/NAME">…</a></td><td>DD-MM-YYYY HH:MM</td><td data-order="BYTES">`. */
export function parseEcmwfListing(html) {
  const out = [];
  const re = /<a href="[^"]*\/([^"/]+)"[\s\S]*?<\/a><\/td><td>(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})<\/td><td data-order="(\d+)"/g;
  let m;
  while ((m = re.exec(html))) {
    out.push({
      name: m[1],
      mtimeMs: Date.UTC(+m[4], +m[3] - 1, +m[2], +m[5], +m[6], 0),
      bytes: +m[7],
    });
  }
  return out;
}

/** ISO-8601-Dauer (`P1DT9H0M0S` → 33). Nur D/H/M/S — mehr führt der STAC nicht. */
export function isoDurationHours(s) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(String(s ?? ''));
  if (!m) return null;
  return (+(m[1] ?? 0)) * 24 + (+(m[2] ?? 0)) + (+(m[3] ?? 0)) / 60 + (+(m[4] ?? 0)) / 3600;
}

/** Lauf (`YYYYMMDDHH`) und Schritt aus einem Dateinamen, je Familie. */
export function parseName(family, name) {
  let m;
  if (family === 'dwd' && (m = /_(\d{10})_(\d{3})_/.exec(name))) return { run: m[1], step: +m[2] };
  if (family === 'dwd-mos' && (m = /^MOSMIX_L_(\d{10})\.kmz$/.exec(name))) return { run: m[1], step: null };
  if (family === 'ecmwf' && (m = /^(\d{10})0000-(\d+)h-(oper|scda)-fc\.grib2$/.exec(name))) return { run: m[1], step: +m[2], stream: m[3] };
  return null;
}

export const runAtMs = (run) => Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10));
export const runId = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}`; };
const isoZ = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const roundH = (ms) => Math.round(ms / 3600) / 1000;

export function emptyStore() {
  return { schema: 1, updatedAt: null, samples: {}, builds: {} };
}

/**
 * Append-only: bestehende Schlüssel werden NIE überschrieben. Idempotent — dieselben Eingaben
 * zweimal ändern nur `updatedAt`. Gibt den neuen Store und die Zahl der Neuzugänge zurück.
 */
export function mergeStore(existing, incoming, nowIso) {
  const store = existing && existing.schema === 1 ? existing : emptyStore();
  const added = { samples: 0, builds: 0 };
  for (const kind of ['samples', 'builds']) {
    store[kind] ??= {};
    for (const [k, v] of Object.entries(incoming?.[kind] ?? {})) {
      if (Object.prototype.hasOwnProperty.call(store[kind], k)) continue;
      store[kind][k] = v;
      added[kind]++;
    }
  }
  store.updatedAt = nowIso;
  return { store, added };
}

/** Schlüssel sortiert schreiben, damit zwei Läufe byte-vergleichbar bleiben. */
export function serializeStore(store) {
  const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  return `${JSON.stringify({ schema: store.schema, updatedAt: store.updatedAt, samples: sortObj(store.samples), builds: sortObj(store.builds) }, null, 2)}\n`;
}

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Statistik je (Quelle, letzter Schritt). Obergrenzen (GeoSphere) werden getrennt gezählt. */
export function summarize(store, minN = 7) {
  const groups = new Map();
  for (const s of Object.values(store.samples ?? {})) {
    const key = `${s.source}|${s.lastStep}`;
    if (!groups.has(key)) groups.set(key, { source: s.source, lastStep: s.lastStep, bound: s.bound ?? 'exact', values: [] });
    groups.get(key).values.push(s.readyPlusH);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    n: g.values.length,
    min: Math.min(...g.values),
    median: median(g.values),
    max: Math.max(...g.values),
    reliable: g.values.length >= minN,
  })).sort((a, b) => a.source.localeCompare(b.source) || b.lastStep - a.lastStep);
}

const de = (x, d = 2) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d).replace('.', ','));
const utc = (ms) => (ms == null || !Number.isFinite(ms) ? '–' : new Date(ms).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC'));

export function renderTable(store) {
  const L = [];
  const sum = summarize(store);
  const samples = Object.values(store.samples ?? {});
  L.push('# Bereitstellungszeiten der Punkt-Quellen — gemessene Reihe');
  L.push('');
  L.push(`> GENERIERT von \`scripts/point/measure-availability.mjs\` aus \`availability.json\` — nicht von Hand ändern.`);
  L.push(`> Stand ${store.updatedAt ?? '–'} · ${samples.length} Proben · ${Object.keys(store.builds ?? {}).length} Bau-Einträge.`);
  L.push('>');
  L.push('> Ein Wert je (Quelle, Lauf): Zeitstempel der LETZTEN gebrauchten Datei des Laufs auf dem');
  L.push('> Server (DWD/ECMWF: Listing-`Last-Modified`; MeteoSchweiz: `created` der STAC-Items am letzten');
  L.push('> Horizont; GeoSphere: nur eine OBERGRENZE „Abrufzeit − Lauf", weil die Metadaten keine');
  L.push('> Veröffentlichungszeit führen). Quellen mit weniger als 7 Proben gelten als **noch nicht belastbar**.');
  L.push('');
  L.push('## Zusammenfassung je Quelle und letztem Schritt');
  L.push('');
  L.push('| Quelle | letzter Schritt | n | min | Median | max | Verifier `READY_H` | Bewertung |');
  L.push('|---|---:|---:|---:|---:|---:|---:|---|');
  for (const g of sum) {
    const name = SOURCES[g.source]?.name ?? g.source;
    const ref = VERIFIER_READY_H[`${g.source}|${g.lastStep}`];
    const kind = g.bound === 'upper' ? ' (Obergrenze)' : '';
    const verdict = g.bound === 'upper'
      ? `nur Obergrenze — engste ≤ ${de(g.min)} h`
      : (g.reliable ? `belastbar (n = ${g.n})` : `**noch nicht belastbar** (n = ${g.n} < 7)`);
    L.push(`| ${name} (\`${g.source}\`) | ${g.lastStep} h${kind} | ${g.n} | ${de(g.min)} h | ${de(g.median)} h | ${de(g.max)} h | ${ref != null ? `${de(ref)} h` : '–'} | ${verdict} |`);
  }
  L.push('');
  L.push('## Einzelproben (jüngste zuerst)');
  L.push('');
  L.push('| Lauf | Quelle | letzter Schritt | fertig (UTC) | Lauf + h | Art | gemessen am |');
  L.push('|---|---|---:|---|---:|---|---|');
  const rows = [...samples].sort((a, b) => (b.run.localeCompare(a.run)) || a.source.localeCompare(b.source));
  for (const s of rows) {
    const art = s.bound === 'upper' ? 'Obergrenze' : 'gemessen';
    L.push(`| ${s.run} | \`${s.source}\` | ${s.lastStep} | ${utc(s.readyAtMs)} | ${s.bound === 'upper' ? '≤ ' : ''}${de(s.readyPlusH)} | ${art} | ${utc(Date.parse(s.measuredAt))} |`);
  }
  L.push('');
  L.push('## Wie gebaut (Cron-Manifeste aus `point/index.json`)');
  L.push('');
  L.push('| veröffentlicht | Stufe | Lauf | Bau | discover | Quellen (Lauf · Versatz · Schritte · Abdeckung) | Stationen |');
  L.push('|---|---|---|---:|---:|---|---|');
  const builds = Object.entries(store.builds ?? {}).sort((a, b) => String(b[1].publishedAt).localeCompare(String(a[1].publishedAt)) || a[1].tier.localeCompare(b[1].tier));
  for (const [, b] of builds) {
    const src = (b.sources ?? []).map((s) => `${s.id} ${s.runAt?.slice(5, 13) ?? '–'} +${s.offsetH}h ${s.steps}${s.coverage === 'full' ? '' : '·partial'}`).join('<br>');
    const st = b.stations ? `${b.stations.run} (${de(b.stations.ageH, 1)} h)` : '–';
    L.push(`| ${utc(Date.parse(b.publishedAt))} | ${b.tier} | ${b.run} | ${b.totalMs != null ? `${de(b.totalMs / 60000, 1)} min` : '–'} | ${b.discoverMs != null ? `${de(b.discoverMs / 1000, 0)} s` : '–'} | ${src} | ${st} |`);
  }
  L.push('');
  return `${L.join('\n')}\n`;
}

// ── Netz ───────────────────────────────────────────────────────────────────────────
const HOST_GAP_MS = { 'opendata.dwd.de': 60, 'data.ecmwf.int': 600, 'data.geo.admin.ch': 100, 'dataset.api.hub.geosphere.at': 250 };
const lastAt = new Map();
export const net = { requests: 0, bytes: 0, ms: 0 };

async function paced(url) {
  const host = new URL(url).host;
  const gap = HOST_GAP_MS[host] ?? 0;
  const wait = (lastAt.get(host) ?? 0) + gap - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAt.set(host, Date.now());
}

/** GET als Text; `{ status: 404, text: null }` bei „noch nicht da", wirft nach 2 Versuchen. */
async function getText(url) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    await paced(url);
    const t0 = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { 'user-agent': 'buscosun measure-availability (github.com/jppetry/buscosun-web)' } });
      net.requests++;
      if (res.status === 404) { net.ms += Date.now() - t0; return { status: 404, text: null, bytes: 0, ms: Date.now() - t0 }; }
      if (res.status === 429 || res.status === 503) {
        const ra = Number(res.headers.get('retry-after'));
        await new Promise((r) => setTimeout(r, Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000));
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const ms = Date.now() - t0;
      net.bytes += text.length; net.ms += ms;
      return { status: res.status, text, bytes: text.length, ms };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`${url}: ${lastErr?.message ?? 'unbekannt'}`);
}

// ── Messungen je Familie ───────────────────────────────────────────────────────────
const sampleKey = (source, run) => `${source}|${run}`;

function mkSample({ source, run, lastStep, readyAtMs, measuredAtMs, from, extra }) {
  const runMs = runAtMs(run);
  return {
    source, run, runAtMs: runMs, lastStep, readyAtMs,
    readyPlusH: roundH(readyAtMs - runMs),
    measuredAt: isoZ(measuredAtMs), from, ...extra,
  };
}

/** DWD-NWP: je Laufstunde EIN Verzeichnis-GET; der Lauf steht im Dateinamen. */
async function measureDwd(id, cfg, store, nowMs, log) {
  const out = {};
  const today = new Date(nowMs);
  const dayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (const hh of cfg.runHours) {
    const todayRun = dayMs + hh * H;
    const expectRun = runId(todayRun <= nowMs ? todayRun : todayRun - 24 * H);
    if (store.samples[sampleKey(id, expectRun)]) { log(`  ${id.padEnd(12)} ${expectRun}  schon in der Reihe — Verzeichnis nicht geholt`); continue; }
    const url = cfg.dir(hh);
    let res;
    try { res = await getText(url); } catch (e) { log(`  ${id.padEnd(12)} ${p2(hh)}z  FEHLER ${e.message}`); continue; }
    if (res.status === 404) { log(`  ${id.padEnd(12)} ${p2(hh)}z  Verzeichnis fehlt (404) — noch nicht da`); continue; }
    const rows = parseApacheListing(res.text).map((r) => ({ ...r, ...(parseName('dwd', r.name) ?? {}) })).filter((r) => r.run);
    // Welcher Lauf liegt im Verzeichnis? (heute oder noch gestern)
    const runs = [...new Set(rows.map((r) => r.run))].sort();
    if (!runs.length) { log(`  ${id.padEnd(12)} ${p2(hh)}z  Listing ohne erkennbare Dateien`); continue; }
    for (const run of runs) {
      const step = cfg.lastStep(hh);
      const want = cfg.file(run, step);
      // Nur Dateien DESSELBEN Produkts zählen (das icon-d2-Verzeichnis führt regular-lat-lon UND
      // icosahedral nebeneinander): Präfix bis zum Lauf, z. B. „…_single-level_".
      const prefix = want.slice(0, want.indexOf(run));
      const mine = rows.filter((r) => r.run === run && r.name.startsWith(prefix));
      const maxStep = mine.length ? Math.max(...mine.map((r) => r.step)) : -1;
      const hit = mine.find((r) => r.name === want);
      if (!hit) { log(`  ${id.padEnd(12)} ${run}  noch nicht da (höchster Schritt ${maxStep >= 0 ? p3(maxStep) : '–'} von ${p3(step)})`); continue; }
      if (store.samples[sampleKey(id, run)]) { log(`  ${id.padEnd(12)} ${run}  schon in der Reihe`); continue; }
      // Ein Verzeichnis, das ÜBER den erwarteten Endschritt hinausgeht, hieße: der Endschritt hier
      // ist falsch und die Probe zu früh — laut sagen, trotzdem festhalten (maxStepSeen steht dabei).
      if (maxStep > step) log(`  ${id.padEnd(12)} ${run}  ⚠ Verzeichnis führt Schritt ${p3(maxStep)} > erwarteter Endschritt ${p3(step)} — Endschritt prüfen`);
      const s = mkSample({ source: id, run, lastStep: step, readyAtMs: hit.mtimeMs, measuredAtMs: nowMs, from: url, extra: { file: want, bytes: hit.bytes, maxStepSeen: maxStep } });
      out[sampleKey(id, run)] = s;
      log(`  ${id.padEnd(12)} ${run}  Schritt ${p3(step)} um ${utc(hit.mtimeMs)} = Lauf + ${de(s.readyPlusH)} h`);
    }
  }
  return out;
}

/** MOSMIX-L: EIN Listing trägt mehrere Tage — alles ernten, was noch nicht in der Reihe ist. */
async function measureMosmix(id, cfg, store, nowMs, log) {
  const out = {};
  const url = cfg.dir();
  let res;
  try { res = await getText(url); } catch (e) { log(`  ${id.padEnd(12)} FEHLER ${e.message}`); return out; }
  if (res.status === 404) { log(`  ${id.padEnd(12)} Listing fehlt (404)`); return out; }
  const rows = parseApacheListing(res.text).map((r) => ({ ...r, ...(parseName('dwd-mos', r.name) ?? {}) })).filter((r) => r.run);
  let known = 0;
  for (const r of rows.sort((a, b) => a.run.localeCompare(b.run))) {
    if (store.samples[sampleKey(id, r.run)]) { known++; continue; }
    const s = mkSample({ source: id, run: r.run, lastStep: cfg.lastStep(), readyAtMs: r.mtimeMs, measuredAtMs: nowMs, from: url, extra: { file: r.name, bytes: r.bytes } });
    out[sampleKey(id, r.run)] = s;
    log(`  ${id.padEnd(12)} ${r.run}  Datei um ${utc(r.mtimeMs)} = Lauf + ${de(s.readyPlusH)} h`);
  }
  if (known) log(`  ${id.padEnd(12)} ${known} Lauf/Läufe schon in der Reihe`);
  if (!rows.length) log(`  ${id.padEnd(12)} Listing ohne MOSMIX_L_<Lauf>.kmz-Zeilen`);
  return out;
}

/** ECMWF: je (Tag, Lauf) EIN Verzeichnis-GET, rückwirkend über ECMWF_LOOKBACK_DAYS. */
async function measureEcmwf(id, cfg, store, nowMs, log) {
  const out = {};
  const today = new Date(nowMs);
  const dayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (let back = ECMWF_LOOKBACK_DAYS; back >= 0; back--) {
    for (const hh of cfg.runHours) {
      const runMs = dayMs - back * 24 * H + hh * H;
      if (runMs > nowMs) continue;
      const run = runId(runMs);
      if (store.samples[sampleKey(id, run)]) continue;
      const ymd = run.slice(0, 8);
      const url = cfg.dir(ymd, hh);
      let res;
      try { res = await getText(url); } catch (e) { log(`  ${id.padEnd(12)} ${run}  FEHLER ${e.message}`); continue; }
      if (res.status === 404) { log(`  ${id.padEnd(12)} ${run}  Verzeichnis fehlt (404) — noch nicht da`); continue; }
      const stream = cfg.stream(hh);
      const step = cfg.lastStep(hh);
      const want = cfg.file(run, step, stream);
      const rows = parseEcmwfListing(res.text);
      const hit = rows.find((r) => r.name === want);
      if (!hit) {
        const steps = rows.map((r) => parseName('ecmwf', r.name)).filter(Boolean).map((r) => r.step);
        log(`  ${id.padEnd(12)} ${run}  noch nicht da (${rows.length} Zeilen, höchster Schritt ${steps.length ? Math.max(...steps) : '–'} von ${step})`);
        continue;
      }
      const s = mkSample({ source: id, run, lastStep: step, readyAtMs: hit.mtimeMs, measuredAtMs: nowMs, from: url, extra: { file: want, bytes: hit.bytes, stream, resolution: 'minute' } });
      out[sampleKey(id, run)] = s;
      log(`  ${id.padEnd(12)} ${run}  ${stream} ${step} h um ${utc(hit.mtimeMs)} = Lauf + ${de(s.readyPlusH)} h`);
    }
  }
  return out;
}

/**
 * MeteoSchweiz STAC: `datetime = Lauf + letzter Horizont`, blättern über `rel=next`. Der gesuchte
 * Lauf ist der ÄLTESTE, der diese Gültigzeit erreicht, und steht damit vorn (ID-Sortierung);
 * Abbruch, sobald sein Block endet. Kosten werden je Probe festgehalten (Seiten, Items, Bytes, ms).
 */
async function measureStac(id, cfg, store, nowMs, log) {
  const out = {};
  const stepMs = (cfg.runHours[1] - cfg.runHours[0]) * H;
  const latest = Math.floor(nowMs / stepMs) * stepMs;
  let pagesTotal = 0;
  const cost = { pages: 0, items: 0, bytes: 0, ms: 0 };
  for (let i = 0; i < cfg.lookbackRuns; i++) {
    const runMs = latest - i * stepMs;
    const run = runId(runMs);
    if (store.samples[sampleKey(id, run)]) continue;
    const hh = new Date(runMs).getUTCHours();
    const step = cfg.lastStep(hh);
    const validIso = isoZ(runMs + step * H);
    const refIso = isoZ(runMs);
    let url = `${STAC}/collections/${cfg.collection}/items?limit=100&datetime=${encodeURIComponent(validIso)}`;
    const from = url;
    let maxCreated = -Infinity, seen = 0, pages = 0, failed = false, horizonSeen = null;
    while (url && pages < STAC_MAX_PAGES && pagesTotal < STAC_MAX_PAGES) {
      let res;
      try { res = await getText(url); } catch (e) { log(`  ${id.padEnd(12)} ${run}  FEHLER ${e.message}`); failed = true; break; }
      pages++; pagesTotal++; cost.pages++; cost.bytes += res.bytes; cost.ms += res.ms;
      if (res.status === 404) break;
      let j;
      try { j = JSON.parse(res.text); } catch { failed = true; break; }
      const feats = j.features ?? [];
      cost.items += feats.length;
      let mine = 0;
      for (const f of feats) {
        const p = f.properties ?? {};
        if (String(p['forecast:reference_datetime']) !== refIso) continue;
        mine++; seen++;
        const c = Date.parse(String(p.created));
        if (Number.isFinite(c) && c > maxCreated) maxCreated = c;
        horizonSeen ??= isoDurationHours(p['forecast:horizon']);
      }
      if (seen > 0 && mine === 0) break;                // Block des gesuchten Laufs ist zu Ende
      if (!feats.length) break;
      url = (j.links ?? []).find((l) => l.rel === 'next')?.href ?? null;
    }
    if (failed) continue;
    if (seen === 0) { log(`  ${id.padEnd(12)} ${run}  noch nicht da (0 Items bei ${validIso}, ${pages} Seite/n)`); continue; }
    const s = mkSample({ source: id, run, lastStep: step, readyAtMs: maxCreated, measuredAtMs: nowMs, from, extra: { items: seen, horizonSeenH: horizonSeen, pages } });
    out[sampleKey(id, run)] = s;
    log(`  ${id.padEnd(12)} ${run}  +${step} h: ${seen} Items, jüngstes created ${utc(maxCreated)} = Lauf + ${de(s.readyPlusH)} h (${pages} Seite/n)`);
  }
  if (pagesTotal >= STAC_MAX_PAGES) log(`  ${id.padEnd(12)} ⚠ Seitendeckel ${STAC_MAX_PAGES} erreicht — Rest beim nächsten Aufruf`);
  log(`  ${id.padEnd(12)} Katalogkosten: ${cost.pages} Seiten · ${cost.items} Items · ${(cost.bytes / 1024).toFixed(0)} KiB · ${(cost.ms / 1000).toFixed(1)} s`);
  return out;
}

/** GeoSphere: nur „welche Läufe sind da" ⇒ Obergrenze je Lauf, Erstbeobachtung ist die engste. */
async function measureGeosphere(id, cfg, store, nowMs, log) {
  const out = {};
  let res;
  try { res = await getText(cfg.url); } catch (e) { log(`  ${id.padEnd(12)} FEHLER ${e.message}`); return out; }
  if (res.status === 404) { log(`  ${id.padEnd(12)} Metadaten fehlen (404)`); return out; }
  let j;
  try { j = JSON.parse(res.text); } catch { log(`  ${id.padEnd(12)} Metadaten kein JSON`); return out; }
  const refs = (j.available_forecast_reftimes ?? []).map((t) => Date.parse(String(t))).filter(Number.isFinite).sort((a, b) => b - a);
  if (!refs.length) { log(`  ${id.padEnd(12)} keine available_forecast_reftimes`); return out; }
  for (const [i, refMs] of refs.entries()) {
    const run = runId(refMs);
    if (store.samples[sampleKey(id, run)]) continue;
    const s = mkSample({ source: id, run, lastStep: cfg.lastStep(), readyAtMs: nowMs, measuredAtMs: nowMs, from: cfg.url, extra: { bound: 'upper', newestAtMeasurement: i === 0 } });
    out[sampleKey(id, run)] = s;
    log(`  ${id.padEnd(12)} ${run}  gelistet (Abrufzeit − Lauf ≤ ${de(s.readyPlusH)} h)${i === 0 ? ' ← jüngster' : ''}`);
  }
  return out;
}

/** Daten-Repo: Index → Manifest je Stufe. Schlüssel `<commit>|<tier>`, inhaltlich dedupliziert. */
async function measureBuilds(store, nowMs, log) {
  const out = {};
  let res;
  try { res = await getText(`${DATA_RAW}/point/index.json`); } catch (e) { log(`  builds       FEHLER ${e.message}`); return out; }
  if (res.status === 404) { log('  builds       point/index.json fehlt (404)'); return out; }
  const idx = JSON.parse(res.text);
  const commit = String(idx.commit ?? '').slice(0, 7) || 'unknown';
  const st = idx.stations?.runs?.[0] ? { run: idx.stations.runs[0].run, ageH: idx.stations.runs[0].ageH } : null;
  const have = new Set(Object.values(store.builds ?? {}).map((b) => `${b.tier}|${b.run}|${b.totalMs}`));
  for (const tier of ['t1', 't2', 't3']) {
    const lt = idx.latestByTier?.[tier];
    if (!lt?.manifest) { log(`  builds       ${tier}: kein latestByTier-Eintrag`); continue; }
    const key = `${commit}|${tier}`;
    if (store.builds?.[key]) { log(`  builds       ${key} schon in der Reihe`); continue; }
    let mres;
    try { mres = await getText(`${DATA_RAW}/${lt.manifest}`); } catch (e) { log(`  builds       ${tier}: FEHLER ${e.message}`); continue; }
    if (mres.status === 404) { log(`  builds       ${tier}: ${lt.manifest} fehlt (404)`); continue; }
    const m = JSON.parse(mres.text);
    const t = (m.tiers ?? []).find((x) => x.id === tier);
    if (!t) { log(`  builds       ${tier}: Manifest ${lt.manifest} führt die Stufe nicht`); continue; }
    const entry = {
      commit, tier, run: t.run ?? m.run, runAt: t.runAt ?? m.runAt, ageH: t.ageH ?? null,
      publishedAt: idx.publishedAt ?? null, manifest: lt.manifest,
      totalMs: t.timing?.totalMs ?? null, discoverMs: t.timing?.phases?.discover ?? null, phases: t.timing?.phases ?? null,
      sources: (m.sources ?? []).filter((s) => s.tier === tier).map((s) => ({ id: s.id, runAt: s.runAt, offsetH: s.offsetH, steps: s.steps, coverage: s.coverage })),
      stations: st, measuredAt: isoZ(nowMs),
    };
    const ck = `${entry.tier}|${entry.run}|${entry.totalMs}`;
    if (have.has(ck)) { log(`  builds       ${tier} ${entry.run} inhaltsgleich schon da (anderer Index-Commit) — nicht doppelt`); continue; }
    have.add(ck);
    out[key] = entry;
    log(`  builds       ${tier} ${entry.run}  Bau ${entry.totalMs != null ? de(entry.totalMs / 60000, 1) : '–'} min · discover ${entry.discoverMs != null ? de(entry.discoverMs / 1000, 0) : '–'} s · ${entry.sources.length} Quellen · veröffentlicht ${entry.publishedAt}`);
  }
  return out;
}

// ── Store-I/O ──────────────────────────────────────────────────────────────────────
export function readStore(file = STORE_PATH) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return emptyStore(); }
}
export function writeStore(store, file = STORE_PATH, table = TABLE_PATH) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serializeStore(store));
  if (table) fs.writeFileSync(table, renderTable(store));
}

// ── Selbsttest (netzfrei) ─────────────────────────────────────────────────────────
export function selfTest() {
  let pass = 0, fail = 0;
  const t = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

  // 1. DWD-Zeile (Linktext abgeschnitten, Name nur im href)
  const dwdRow = '<a href="icon-d2_germany_regular-lat-lon_single-level_2026091418_048_2d_t_2m.grib2.bz2">icon-d2_germany_regular-lat-lon_single-level_20..&gt;</a> 14-Sep-2026 19:20:59             1046584\n'
    + '<a href="../">../</a>\n<a href="MOSMIX_L_2026091221.kmz">MOSMIX_L_2026091221.kmz</a>                            12-Sep-2026 22:12:16            80826921\n'
    + '<a href="sub/">sub/</a>                                              12-Sep-2026 22:12:16                   -\n';
  const rows = parseApacheListing(dwdRow);
  t('DWD-Listing: zwei Dateizeilen, Verzeichnisse übergangen', rows.length === 2, `${rows.length}`);
  t('DWD-Listing: Name aus dem href, nicht aus dem abgeschnittenen Linktext', rows[0]?.name === 'icon-d2_germany_regular-lat-lon_single-level_2026091418_048_2d_t_2m.grib2.bz2');
  t('DWD-Listing: Last-Modified als UTC', rows[0]?.mtimeMs === Date.UTC(2026, 8, 14, 19, 20, 59), new Date(rows[0]?.mtimeMs ?? 0).toISOString());
  t('DWD-Listing: Größe', rows[0]?.bytes === 1046584 && rows[1]?.bytes === 80826921);
  t('DWD-Name → Lauf + Schritt', JSON.stringify(parseName('dwd', rows[0].name)) === '{"run":"2026091418","step":48}');
  t('MOSMIX-Name → Lauf', parseName('dwd-mos', rows[1].name)?.run === '2026091221' && parseName('dwd-mos', 'MOSMIX_L_LATEST.kmz') === null);
  t('Negativ-Kontrolle: anderes Datumsformat parst NICHT', parseApacheListing('<a href="x.bz2">x.bz2</a> 2026-09-14 19:20:59 12').length === 0);

  // 2. ECMWF-Zeile
  const ecRow = '<tr><td><a href="/forecasts/20260914/12z/ifs/0p25/oper/20260914120000-360h-oper-fc.grib2"><i class="bi bi-file-earmark text-secondary me-1" style="font-size:0.85rem;"></i>20260914120000-360h-oper-fc.grib2</a></td><td>14-09-2026 19:34</td><td data-order="137765902">131.38 Mbytes</td><td>240236907</td></tr>';
  const ec = parseEcmwfListing(ecRow);
  t('ECMWF-Listing: eine Zeile', ec.length === 1);
  t('ECMWF-Listing: Name', ec[0]?.name === '20260914120000-360h-oper-fc.grib2');
  t('ECMWF-Listing: Datum DD-MM-YYYY HH:MM als UTC', ec[0]?.mtimeMs === Date.UTC(2026, 8, 14, 19, 34), new Date(ec[0]?.mtimeMs ?? 0).toISOString());
  t('ECMWF-Listing: Bytes aus data-order', ec[0]?.bytes === 137765902);
  t('ECMWF-Name → Lauf, Schritt, Strom', JSON.stringify(parseName('ecmwf', ec[0].name)) === '{"run":"2026091412","step":360,"stream":"oper"}');
  t('ECMWF-Name: .index-Sidecar ist KEIN Feld', parseName('ecmwf', '20260914120000-360h-oper-fc.index') === null);

  // 3. ISO-Dauer
  t('ISO-Dauer P1DT9H0M0S → 33', isoDurationHours('P1DT9H0M0S') === 33);
  t('ISO-Dauer P0DT00H00M00S → 0', isoDurationHours('P0DT00H00M00S') === 0);
  t('ISO-Dauer P5DT0H0M0S → 120', isoDurationHours('P5DT0H0M0S') === 120);
  t('ISO-Dauer PT30M → 0,5', isoDurationHours('PT30M') === 0.5);
  t('ISO-Dauer Unsinn → null', isoDurationHours('33h') === null);

  // 4. Laufzeit-Helfer
  t('runAtMs/runId Rundweg', runId(runAtMs('2026091418')) === '2026091418' && runAtMs('2026091418') === Date.UTC(2026, 8, 14, 18));
  t('median gerade/ungerade', median([3, 1, 2]) === 2 && median([4, 1, 3, 2]) === 2.5 && median([]) === null);

  // 5. Merge-Idempotenz auf einer temporären Datei
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'availability-'));
  const file = path.join(dir, 'availability.json');
  try {
    const sA = mkSample({ source: 'icon_d2', run: '2026091418', lastStep: 48, readyAtMs: Date.UTC(2026, 8, 14, 19, 20, 59), measuredAtMs: Date.UTC(2026, 8, 14, 20), from: 'u' });
    const first = mergeStore(readStore(file), { samples: { 'icon_d2|2026091418': sA }, builds: { 'abc1234|t1': { tier: 't1', run: '2026091418', totalMs: 1 } } }, '2026-09-14T20:00:00Z');
    writeStore(first.store, file, null);
    const bytes1 = fs.readFileSync(file, 'utf8');
    t('Merge: erster Lauf fügt 1 Probe + 1 Bau hinzu', first.added.samples === 1 && first.added.builds === 1);
    t('Probe: readyPlusH = 1,35 h', sA.readyPlusH === 1.35, String(sA.readyPlusH));
    // zweiter Lauf, dieselben Eingaben, aber ein ABWEICHENDER Wert unter demselben Schlüssel
    const sB = { ...sA, readyPlusH: 9.99, readyAtMs: 0 };
    const second = mergeStore(readStore(file), { samples: { 'icon_d2|2026091418': sB }, builds: { 'abc1234|t1': { tier: 't1', run: 'X', totalMs: 2 } } }, '2026-09-14T21:00:00Z');
    writeStore(second.store, file, null);
    const bytes2 = fs.readFileSync(file, 'utf8');
    t('Merge: zweiter Lauf fügt nichts hinzu', second.added.samples === 0 && second.added.builds === 0);
    t('Merge: bestehender Schlüssel NICHT überschrieben', second.store.samples['icon_d2|2026091418'].readyPlusH === 1.35 && second.store.builds['abc1234|t1'].run === '2026091418');
    t('Merge: nur updatedAt unterscheidet die Dateien', bytes1.replace('2026-09-14T20:00:00Z', 'X') === bytes2.replace('2026-09-14T21:00:00Z', 'X') && bytes1 !== bytes2);
    const third = mergeStore(readStore(file), { samples: { 'icon_eu|2026091412': { ...sA, source: 'icon_eu', run: '2026091412', lastStep: 120, readyPlusH: 3.6 } } }, '2026-09-14T22:00:00Z');
    t('Merge: neuer Schlüssel wird angehängt', third.added.samples === 1 && Object.keys(third.store.samples).length === 2);
    t('Merge: fremdes/kaputtes Schema wird zum leeren Store', mergeStore({ schema: 0, foo: 1 }, {}, 'x').store.samples && !('foo' in mergeStore({ schema: 0, foo: 1 }, {}, 'x').store));
    // 6. Statistik + Tabelle
    const sum = summarize(third.store);
    t('summarize: n < 7 ⇒ noch nicht belastbar', sum.every((g) => g.reliable === false) && sum.length === 2);
    const many = emptyStore();
    for (let i = 0; i < 7; i++) many.samples[`icon_d2|20260910${p2(i * 3)}`] = { ...sA, run: `20260910${p2(i * 3)}`, readyPlusH: 1.3 + i * 0.01 };
    const g = summarize(many)[0];
    t('summarize: n = 7 ⇒ belastbar, min/median/max', g.reliable && g.n === 7 && g.min === 1.3 && Math.abs(g.median - 1.33) < 1e-9 && Math.abs(g.max - 1.36) < 1e-9, `${g.min}/${g.median}/${g.max}`);
    const md = renderTable(third.store);
    t('renderTable: deutsche Tabelle mit Bewertung', md.includes('noch nicht belastbar') && md.includes('| ICON-D2 (`icon_d2`) | 48 h |') && md.includes('1,35'));
    t('renderTable: Verifier-Referenz erscheint (icon_d2 48 h → 1,36 h)', /\| ICON-D2 \(`icon_d2`\) \| 48 h \|[^\n]*\| 1,36 h \|/.test(md));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\nSelbsttest: ${pass}/${pass + fail} bestanden`);
  return fail === 0;
}

// ── main ───────────────────────────────────────────────────────────────────────────
export async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--self-test')) { process.exitCode = selfTest() ? 0 : 1; return; }
  const dry = argv.includes('--dry');
  const onlyArg = argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? new Set(onlyArg.slice(7).split(',').map((s) => s.trim()).filter(Boolean)) : null;
  const unknown = only ? [...only].filter((k) => !(k in SOURCES) && k !== BUILDS_ID) : [];
  if (unknown.length) { console.error(`Unbekannte Quelle(n): ${unknown.join(', ')} — bekannt: ${[...Object.keys(SOURCES), BUILDS_ID].join(', ')}`); process.exitCode = 2; return; }

  const nowMs = Date.now();
  const store = readStore();
  const log = (s) => console.log(s);
  console.log(`measure-availability — ${isoZ(nowMs)}${dry ? ' (DRY: es wird nichts geschrieben)' : ''}`);
  console.log(`Store: ${STORE_PATH} (${Object.keys(store.samples ?? {}).length} Proben, ${Object.keys(store.builds ?? {}).length} Bau-Einträge)`);

  const incoming = { samples: {}, builds: {} };
  const t0 = Date.now();
  for (const [id, cfg] of Object.entries(SOURCES)) {
    if (only && !only.has(id)) continue;
    console.log(`\n${cfg.name} (${id})`);
    const fn = { dwd: measureDwd, 'dwd-mos': measureMosmix, ecmwf: measureEcmwf, stac: measureStac, geosphere: measureGeosphere }[cfg.family];
    try {
      Object.assign(incoming.samples, await fn(id, cfg, store, nowMs, log));
    } catch (e) {
      console.log(`  ${id.padEnd(12)} FEHLER (Quelle übersprungen): ${e.message}`);
    }
  }
  if (!only || only.has(BUILDS_ID)) {
    console.log('\nWie gebaut (buscosun-data)');
    try { Object.assign(incoming.builds, await measureBuilds(store, nowMs, log)); } catch (e) { console.log(`  builds       FEHLER: ${e.message}`); }
  }

  const { store: merged, added } = mergeStore(store, incoming, isoZ(nowMs));
  console.log(`\nNetz: ${net.requests} Anfragen · ${(net.bytes / 1024).toFixed(0)} KiB · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`Neu: ${added.samples} Probe/n, ${added.builds} Bau-Eintrag/-Einträge · Reihe jetzt ${Object.keys(merged.samples).length} Proben`);
  if (dry) { console.log('DRY — nichts geschrieben.'); return; }
  writeStore(merged);
  console.log(`Geschrieben: ${STORE_PATH}\n             ${TABLE_PATH}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
