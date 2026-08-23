/**
 * Verifier — Thermalanomalien (TA1–TA5, `audit/thermalanomalien.md`).
 *
 *   npm run verify:fire-anomalies
 *
 * Netzfrei. Prüft
 *   (a) die reinen Module über ihre Selbstverifikation (`thermalSites.ts`, `classify.ts`),
 *   (b) die ausgelieferte Standortliste `public/fire/ta/thermal-sites-v1.json` (Version, Zellkonvention
 *       Batch = Client, Klassenregeln: A nur mit Quelle, C ohne Anlage, Wortwahl),
 *   (c) bekannte Werke ⇒ Standort getroffen; bekannte Brandflächen ⇒ KEIN Standort,
 *   (d) den False-Negative-Schutz an den AF4-Labelpaaren (Brände mit EFFIS-Kartierung): jeder Treffer
 *       muss `site-deviating` bleiben, nie `site`,
 *   (e) optional (nur mit lokalem Archiv-Cache, in CI übersprungen): die Leuna-Gegenprobe — der
 *       kartierte 7-ha-Brand 2023-09-24 neben der TOTAL-Raffinerie, klassifiziert OHNE EFFIS-Wissen,
 *       allein über Hülle/Wachstum/Intensität.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { verifyThermalSites, fixtureSite, indexSites, siteAt, cellKey, cellCenter, THERMAL_SITES_VERSION, SITE_CLASS_LABEL } from '../src/fire/anomaly/thermalSites.ts';
import { verifyClassify, anomalyOf, fixturePass, siteLabel } from '../src/fire/anomaly/classify.ts';
import { verifyFireAssessment } from '../src/fire/fireAssessment.ts';
import { parseFirmsCsv, dedupe, metersBetween } from '../src/fire/sources/firmsHotspots.ts';
import { buildFireClusters } from '../src/fire/fireClusters.ts';
import { DEFAULT_FILTER, filterRecords, hiddenSiteCount } from '../src/fire/footprint/fireRegistry.ts';
import { badgeOf, BR_BADGE_LABEL } from '../src/fire/brandradarMeta.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// (a) Selbstverifikation
for (const c of verifyThermalSites().checks) add(`[sites] ${c.name}`, c.ok, c.detail);
for (const c of verifyClassify(fixtureSite()).checks) add(`[classify] ${c.name}`, c.ok, c.detail);
for (const c of verifyFireAssessment().checks.filter((c) => /Standort/.test(c.name))) add(`[assess] ${c.name}`, c.ok, c.detail);

// (b) Die ausgelieferte Liste
const listPath = join(ROOT, 'public/fire/ta/thermal-sites-v1.json');
add('[file] Standortliste liegt unter public/fire/ta/', existsSync(listPath));
const file = existsSync(listPath) ? JSON.parse(readFileSync(listPath, 'utf8')) : null;
const idx = file ? indexSites(file) : null;
if (file) {
  add('[file] Version = THERMAL_SITES_VERSION', file.version === THERMAL_SITES_VERSION);
  add('[file] ≥ 100 Standorte, Regel 2 Jahre / 5 Tage / 1 500 m', file.sites.length >= 100 && file.rule.yearsMin === 2 && file.rule.daysPerYearMin === 5 && file.rule.joinRadiusM === 1500, `${file.sites.length}`);
  add('[file] Attribution nennt NASA FIRMS, EEA (CC-BY), MaStR (DL-DE/BY-2.0), BFE, Copernicus CLC, GeoNames', ['NASA FIRMS', 'European Environment Agency', 'CC-BY 4.0', 'DL-DE/BY-2.0', 'Bundesamt für Energie', 'Copernicus', 'GeoNames'].every((s) => file.attributions.some((a) => a.includes(s))));
  add('[file] Größe ≤ 250 KB roh', readFileSync(listPath).length <= 250 * 1024, `${(readFileSync(listPath).length / 1024).toFixed(1)} KB`);
  const badCells = file.sites.flatMap((s) => s.cells.filter((k) => cellKey(cellCenter(k).lat, cellCenter(k).lon) !== k));
  add('[file] Zellkonvention Batch = Client (Zellmitte ⇒ derselbe Schlüssel) für alle Zellen', badCells.length === 0, badCells.slice(0, 3).join(' '));
  add('[file] jeder Standort: Schwerpunkt liegt in seinen Zellen ± 1', file.sites.every((s) => siteAt(idx, s.lat, s.lon)?.id === s.id));
  add('[file] Klasse A nur mit benannter Anlage samt Quelle und Abstand', file.sites.filter((s) => s.cls === 'A').every((s) => s.facility && s.facility.name && ['eprtr', 'mastr', 'bfe'].includes(s.facility.source) && s.facility.distanceM <= file.rule.joinRadiusM));
  add('[file] Klasse B/C ohne Anlage — sie behaupten keine', file.sites.filter((s) => s.cls !== 'A').every((s) => s.facility === null && s.note));
  add('[file] Klasse C = Tagessignal (Nachtanteil < 5 %)', file.sites.filter((s) => s.cls === 'C').every((s) => s.stats.nightShare < 0.05));
  add('[file] kein Standort trägt das Wort „Fehlalarm" oder „bestätigt"', !file.sites.some((s) => /Fehlalarm|(?<!un)bestätigt/.test(`${s.note ?? ''} ${s.facility?.detail ?? ''}`)));
  add('[file] Statistik: Jahre ≥ 2 mit ≥ 5 Tagen je Standort', file.sites.every((s) => Object.values(s.stats.years).filter((n) => n >= 5).length >= 2));
  add('[file] Klassenlabels: B/C behaupten keine Anlage', !/Anlage|Industrie/.test(SITE_CLASS_LABEL.B) && !/Anlage|Industrie/.test(SITE_CLASS_LABEL.C));

  // (c) Bekannte Werke und bekannte Brandflächen
  const KNOWN = {
    'thyssenkrupp Duisburg': [51.48, 6.72], 'HKM Duisburg': [51.37, 6.71], 'voestalpine Linz': [48.28, 14.34], 'Salzgitter': [52.15, 10.40],
    'Dillingen': [49.36, 6.75], 'ArcelorMittal Bremen': [53.13, 8.68], 'Eisenhüttenstadt (Werk, E-PRTR: VEO Oderbrücke)': [52.172, 14.621], 'Saarstahl Völklingen': [49.245, 6.850],
    'PCK Schwedt': [53.098, 14.230], 'TOTAL Leuna': [51.30, 12.02], 'MiRO Karlsruhe': [49.059, 8.329], 'OMV Burghausen': [48.195, 12.836], 'OMV Schwechat': [48.144, 16.498],
    'ArcelorMittal Hamburg': [53.522, 9.903], 'Stahl Gerlafingen': [47.174, 7.563], 'voestalpine Donawitz': [47.380, 15.069],
    // Bewusst NICHT in der Liste: Braunkohle-/Gaskraftwerke (Jänschwalde, Weisweiler, Neurath) und die KVA Hagenholz —
    // sie sind im VIIRS-Archiv NICHT persistent (Kühlturm und Kamin strahlen nicht wie Hochofen oder Fackel).
  };
  const hits = Object.entries(KNOWN).map(([n, [la, lo]]) => [n, !!siteAt(idx, la, lo) || !!siteAt(idx, la + 0.01, lo) || !!siteAt(idx, la - 0.01, lo) || !!siteAt(idx, la, lo + 0.015) || !!siteAt(idx, la, lo - 0.015)]);
  const missing = hits.filter(([, h]) => !h).map(([n]) => n);
  add('[known] ≥ 90 % der bekannten Stahl-/Raffineriestandorte sind Standorte der Liste', missing.length <= Math.floor(hits.length * 0.1), missing.length ? `fehlt: ${missing.join(', ')}` : `${hits.length}/${hits.length}`);
  const FIRES = { 'Jüterbog 2022/2023': [52.0, 52.08, 13.0, 13.08], 'Gohrischheide 2025': [51.35, 51.45, 13.35, 13.5], 'Sächsische Schweiz 2022': [50.85, 50.95, 14.15, 14.35], 'Harz/Brocken 2022/2024': [51.75, 51.82, 10.55, 10.65], 'Treuenbrietzen/Beelitz 2022': [52.05, 52.25, 12.8, 13.0], 'Hohes Venn/Baelen 2025': [50.55, 50.65, 5.95, 6.1] };
  for (const [name, [s, n, w, e]] of Object.entries(FIRES)) {
    let found = 0;
    for (let la = s; la <= n; la += 0.01) for (let lo = w; lo <= e; lo += 0.01) if (siteAt(idx, la, lo)) found++;
    add(`[fires] bekannte Brandfläche ist KEIN Standort — ${name}`, found === 0, `${found} Treffer`);
  }

  // (d) AF4-Paare: Brände mit EFFIS-Kartierung dürfen nie `site` werden
  const pairs = ['data/fire/af/pairs-effis-2020-2025.jsonl', 'data/fire/af/pairs-effis-2026.jsonl']
    .flatMap((p) => existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const near = pairs.map((p) => ({ p, site: siteAt(idx, p.features.lat, p.features.lon) })).filter((x) => x.site);
  add('[pairs] AF4-Paare vorhanden (≥ 500)', pairs.length >= 500, `${pairs.length}`);
  add('[pairs] höchstens 1 % der kartierten Brände liegt auf einem Standort', near.length <= Math.ceil(pairs.length * 0.01), `${near.length} von ${pairs.length}: ${near.map((x) => `${x.p.features.id} → ${siteLabel(x.site)}`).join('; ')}`);
  const allDeviating = near.every((x) => anomalyOf({ passes: [fixturePass(x.p.features.lat, x.p.features.lon, x.p.features.asOfMs)], bbox: [x.p.features.lon - 0.003, x.p.features.lat - 0.003, x.p.features.lon + 0.003, x.p.features.lat + 0.003], maxPixelFrp: x.p.features.frpMaxPassMw }, x.site, { mapped: true, ems: false }).kind === 'site-deviating');
  add('[pairs] jeder Treffer bleibt mit Kartierung `site-deviating` (Varallo-Regel)', allDeviating);

  // (e) Leuna-Gegenprobe aus dem Archiv — ohne EFFIS-Wissen (nur lokal, wenn der Cache da ist)
  const cache = join(ROOT, '.cache/firms-archive');
  const leuna = near.find((x) => /Leuna|TOTAL/i.test(siteLabel(x.site)));
  if (existsSync(cache) && leuna) {
    const { lat, lon, asOfMs } = leuna.p.features;
    const days = readdirSync(cache).filter((f) => /^VIIRS_(SNPP|NOAA20)_SP-2023-09-(1[6-9]|2\d|30)\.csv$/.test(f) || /^VIIRS_(SNPP|NOAA20)_SP-2023-10-0[1-5]\.csv$/.test(f));
    let rows = [];
    for (const f of days) {
      const src = f.startsWith('VIIRS_SNPP') ? 'VIIRS_SNPP_SP' : 'VIIRS_NOAA20_SP';
      rows.push(...parseFirmsCsv(readFileSync(join(cache, f), 'utf8'), src).rows.filter((r) => metersBetween(r, { lat, lon }) <= 4000));
    }
    rows = dedupe(rows);
    const clusters = buildFireClusters(rows);
    const fireCluster = clusters.map((c) => ({ c, d: metersBetween(c, { lat, lon }) })).sort((a, b) => a.d - b.d)[0];
    if (fireCluster) {
      const site = siteAt(idx, fireCluster.c.lat, fireCluster.c.lon);
      const a = site ? anomalyOf({ passes: fireCluster.c.passes, bbox: fireCluster.c.bbox, maxPixelFrp: fireCluster.c.maxFrp }, site, { mapped: false, ems: false }) : null;
      add('[leuna] Archivdetektionen um den Brand 2023-09-24 vorhanden', rows.length > 0, `${rows.length} Zeilen, ${clusters.length} Cluster, nächster ${Math.round(fireCluster.d)} m`);
      add('[leuna] der Brand neben der Raffinerie wird OHNE EFFIS-Wissen nicht als Anlage einsortiert', !a || a.kind === 'site-deviating', a ? `${a.kind} · Prüfungen ${JSON.stringify(a.checks)} · Cluster ${fireCluster.c.count} Pixel, ${fireCluster.c.passes.length} Überflüge` : 'kein Standort getroffen (Cluster liegt außerhalb des Standortrasters)');
      void asOfMs;
    }
  } else {
    add('[leuna] Archiv-Gegenprobe übersprungen (kein lokaler Cache oder kein Leuna-Paar) — kein Fehler', true);
  }
}

// Filter/Badge-Vertrag (TA4)
const mk = (anomaly) => ({ anomaly, areaHa: { value: null }, status: { kind: 'active' }, country: 'DE' });
const recs = [mk(null), mk({ kind: 'site' }), mk({ kind: 'site-deviating' })];
add('[filter] Default nimmt `site` aus der Brandliste, `site-deviating` bleibt', filterRecords(recs, DEFAULT_FILTER).length === 2 && hiddenSiteCount(recs, DEFAULT_FILTER) === 1);
add('[filter] `sites: show` zeigt alle', filterRecords(recs, { ...DEFAULT_FILTER, sites: 'show' }).length === 3 && hiddenSiteCount(recs, { ...DEFAULT_FILTER, sites: 'show' }) === 0);
add('[badge] Abzeichen ANLAGE / ABWEICHUNG, Abweichung schlägt Ortsfest', badgeOf('active', true, 'site-deviating') === 'site-deviating' && BR_BADGE_LABEL.site === 'ANLAGE' && BR_BADGE_LABEL['site-deviating'] === 'ABWEICHUNG' && badgeOf('active', true, null) === 'static');

const passed = checks.filter((c) => c.ok).length;
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
console.log(`\nverify:fire-anomalies ${passed}/${checks.length}`);
process.exit(passed === checks.length ? 0 : 1);
