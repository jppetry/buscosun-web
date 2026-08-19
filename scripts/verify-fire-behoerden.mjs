/**
 * Verifier — Behördendaten DACH (Phase A0–A4, Gate GWBA1, tests.md §V-WALDBRAND-BEHOERDEN).
 *
 *   npm run verify:fire-behoerden
 *
 * Netzfrei. Prüft die reinen Module dieser Phase über ihre Selbstverifikation
 * (Fixtures = echte Antwortformen aus der A0-Sonde) plus die Regeln, an denen
 * die Phase hängt:
 *   (a) Achsen-Anker: gespiegelte WFS-Antworten machen den Lauf rot; jede Abruf-
 *       URL trägt eine lat,lon-BBox (A0-1)
 *   (b) `maxfeatures`: kein Produktivpfad setzt einen Kleindeckel gegen den
 *       EFFIS/GWIS-MapServer (V-224 / A0-2)
 *   (c) EMS: erzwungener Parse-Fehler ⇒ kein Abzeichen, kein Wurf (A2)
 *   (d) GeoSphere: nie „bestätigt", eigene Skala 1–3, Deckel je Sitzung (A3)
 *   (e) Rangfolge: Bestätigung schlägt die Statik-Graustufe (A4, Varallo)
 *   (f) MoWaS bleibt bis zur Freigabe aus (Flag), AT/CH-Lücke festgeschrieben
 *   (g) BAFU-Lizenz zitiert geocat, nicht das STAC-Feld
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { verifyWfsAxis, bboxIsLatLon } from '../src/fire/sources/wfsAxis.ts';
import { verifyEmsActivations, parseEmsResponse } from '../src/fire/sources/emsActivations.ts';
import { verifyGeosphereWarnContext } from '../src/fire/sources/geosphereWarnContext.ts';
import { verifyFireAssessment } from '../src/fire/fireAssessment.ts';
import { verifyClcMask, CLC_W, CLC_H, CLC_STEP } from '../src/fire/clcMask.ts';
import { hotspotUrl, GWIS_CLIENT_CAP } from '../src/fire/sources/gwisHotspots.ts';
import { burntUrl, BURNT_MAX_FEATURES } from '../src/fire/sources/euContext.ts';
import { BAFU_LICENSE, BAFU_LICENSE_URL } from '../src/fire/sources/bafuFire.ts';
import { hasOfficialFireConfirmation, MOWAS_ENABLED, fireIncidentSourcesFor } from '../src/officialSources.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

for (const c of verifyWfsAxis().checks) add(`[wfsAxis] ${c.name}`, c.ok, c.detail);
for (const c of verifyEmsActivations().checks) add(`[ems] ${c.name}`, c.ok, c.detail);
for (const c of verifyGeosphereWarnContext().checks) add(`[geosphere] ${c.name}`, c.ok, c.detail);
for (const c of verifyFireAssessment().checks) add(`[assessment] ${c.name}`, c.ok, c.detail);
for (const c of verifyClcMask().checks) add(`[clcMask] ${c.name}`, c.ok, c.detail);
// (h) Maske: statisch ausgeliefert, klein, Sidecar passt zum Client
{
  const png = join(ROOT, 'public/fire/clc-industry-mask.png');
  const metaP = join(ROOT, 'public/fire/clc-industry-mask.json');
  add('CORINE-Maske liegt als statische Datei vor (public/fire/clc-industry-mask.png)', existsSync(png) && existsSync(metaP));
  if (existsSync(png) && existsSync(metaP)) {
    const meta = JSON.parse(readFileSync(metaP, 'utf8'));
    const kb = readFileSync(png).length / 1024;
    add('Maske ≤ 100 KB (Jan)', kb <= 100, `${kb.toFixed(1)} KB`);
    add('Sidecar-Raster passt zum Client (1200×1000, 0,01°)', meta.width === CLC_W && meta.height === CLC_H && meta.step === CLC_STEP);
    add('Maske ist CORINE-only (121/131/132), kein OSM', /CLC2018/.test(meta.source) && !/osm|geofabrik/i.test(JSON.stringify(meta)));
  }
  add('kein Modul lädt OSM/Geofabrik/Overpass (V-231 erledigt, ODbL-Frage entfällt)',
    !/(fetch|import)\([^)]*(geofabrik|overpass|openstreetmap)/i.test(src('src/fire/clcMask.ts') + src('src/fire/fireAssessment.ts') + src('src/fire/FirePage.tsx')));
}

// (a) Achsen-Anker auf allen Abruf-URLs
for (const [name, url] of [['hotspots 24 h', hotspotUrl(24)], ['hotspots 7 d', hotspotUrl(168)],
  ['burnt week', burntUrl('week')], ['burnt season', burntUrl('season')], ['burnt archive', burntUrl('archive')]]) {
  add(`URL ${name}: BBox beginnt im Breitengradband (lat,lon — WFS 1.1.0)`, bboxIsLatLon(url), url.slice(-60));
}
add('gwisHotspots.ts + euContext.ts rufen assertDachAxis nach jedem Abruf',
  (src('src/fire/sources/gwisHotspots.ts').match(/assertDachAxis\(/g) ?? []).length >= 1
  && (src('src/fire/sources/euContext.ts').match(/assertDachAxis\(/g) ?? []).length >= 2);

// (b) maxfeatures
add('GWIS-Fallback: KEIN serverseitiger Deckel in der URL; Client-Deckel nach BBox, jüngste zuerst', !/maxfeatures/i.test(hotspotUrl(168)) && GWIS_CLIENT_CAP >= 10_000, String(GWIS_CLIENT_CAP));
add('Brandflächen: Notbremse ≥ 5 000 (V-224)', BURNT_MAX_FEATURES >= 5000);
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const smallCap = [...stripComments(src('src/fire/sources/gwisHotspots.ts')).matchAll(/maxfeatures=\$\{[^}]+\}|maxfeatures=(\d+)/g)]
  .filter((m) => m[1] && Number(m[1]) < 5000);
add('kein wörtliches maxfeatures= in gwisHotspots.ts', smallCap.length === 0 && !/maxfeatures=/.test(src('src/fire/sources/gwisHotspots.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
add('Sonde probe-behoerden setzt in keiner URL maxfeatures=', !/maxfeatures=/i.test(src('scripts/l0/probe-behoerden.mjs')));

// (c) EMS: Fehler ⇒ nichts
add('EMS: kaputte Antwort ⇒ leere Liste', parseEmsResponse('<html>502</html>').length === 0);

// (f) MoWaS-Flag + Lücken
add('MoWaS ist bis zur Freigabe AUS (Rule 2 / STOPP & FRAGEN)', MOWAS_ENABLED === false);
add('DE ohne MoWaS: keine amtliche Bestätigung', hasOfficialFireConfirmation('DE') === false);
add('AT/CH: nie amtliche Bestätigung', !hasOfficialFireConfirmation('AT') && !hasOfficialFireConfirmation('CH'));
add('AT: Deep-Links auf Landesübersichten (OÖ, Burgenland) mit Einschränkung',
  fireIncidentSourcesFor('AT').length === 2 && fireIncidentSourcesFor('AT').every((s) => s.caveat && /ooelfv|lsz-b/.test(s.url)));
add('kein Modul lädt Einsatzdaten von Landes-Feuerwehrseiten (kein Scraping/Proxy)',
  !/fetch\([^)]*(ooelfv|lsz-b|feuerwehr|orf\.at)/i.test(src('src/officialSources.ts') + src('src/fire/fireAssessment.ts')));

// (f2) Jans Entscheidung 2026-08-15: MoWaS wird NICHT ausgewertet — keine Route, kein Fetch, nur Deep-Link.
add('keine Edge Function /_nina/* im Repo', !existsSync(join(ROOT, 'netlify/edge-functions/nina.ts')) && !/_nina/.test(src('netlify.toml')));
add('kein Modul lädt warnung.bund.de (nur Deep-Link in officialSources)',
  !/fetch\([^)]*warnung\.bund\.de/i.test(src('src/officialSources.ts') + src('src/fire/FirePage.tsx') + src('src/fire/FireMap.tsx') + src('src/fire/fireAssessment.ts'))
  && /warnung\.bund\.de\/meldungen/.test(src('src/officialSources.ts')));

// (i) V-222 (Jan, 2026-08-15): erst rendern (neutral), dann 7 Tage im Leerlauf, Klassifikation im Worker.
{
  const page = src('src/fire/FirePage.tsx');
  add('V-222: erster Abruf OHNE Klassifikations-Rückruf (neutraler erster Eindruck)',
    /fetchFirmsHotspots\(time\.windowH, ac\.signal, at\);/.test(page) && !/fetchFirmsHotspots\(time\.windowH, ac\.signal, at, async/.test(page));
  add('V-222: 7-Tage-Nachladung nur zur Einordnung, im Leerlauf', /fetchFirmsHotspots\(168, ac\.signal, at\)/.test(page) && /requestIdleCallback/.test(page));
  add('V-222: Klassifikation über den Worker-Client', /classifyHotspots\(/.test(page) && existsSync(join(ROOT, 'src/fire/fireEventsWorker.ts')) && existsSync(join(ROOT, 'src/fire/fireEventsClient.ts')));
  add('V-222: bis zur Einordnung „Einordnung läuft …" statt einer Behauptung', /Einordnung läuft/.test(page));
  add('V-222: Kartierung hebt Grau weiterhin auf (Varallo) — Anker bleibt', /keys\.has\(k\) && mappedAreaFor\(r, polys\)\) keys\.delete\(k\)/.test(page));
  add('Worker importiert nur DOM-freie Module', !/document|window\./.test(src('src/fire/fireEventsWorker.ts')));
}

// (g) BAFU-Lizenz
add('BAFU-Lizenz zitiert geocat „Opendata OPEN: Freie Nutzung." mit opendata.swiss-Anker',
  BAFU_LICENSE === 'Opendata OPEN: Freie Nutzung.' && /opendata\.swiss\/en\/terms-of-use\/#terms_open/.test(BAFU_LICENSE_URL));
add('licenses.mjs führt BAFU nicht mehr mit dem STAC-Platzhalter als Lizenz',
  /Opendata OPEN/.test(src('scripts/seo/licenses.mjs')) && !/license: 'FSDI-Terms/.test(src('scripts/seo/licenses.mjs')));

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
