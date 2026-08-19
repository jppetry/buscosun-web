/**
 * Headless-Verifikation „Aktiv-Feuer: Überflüge + Intensität + Dynamik + Beobachtung"
 * (Phasen AF1 + AF2, Gates **GAF1** und **GAF2**).
 *
 *   npm run verify:fire-activity
 *
 * Prüft die ECHTEN Module `src/fire/activity/*` über ihre eingebetteten
 * Selbstverifikationen und ergänzt die Anker aus `audit/aktivfeuer.md` §5:
 *
 *   (a) EINE Überflug-Regel (10 min je Satellit): `fireEvents.ts` und
 *       `fireClusters.ts` importieren `groupPasses`, keiner rechnet Minuten-Slots,
 *   (b) Namenskollision vermieden: `frpSumMw` bleibt die Fenstersumme,
 *       `frpLastPassMw`/`frpMaxPassMw` sind die Überfluggrößen,
 *   (c) `activity` ist additiv am `FireRecord` und `null` ohne Detektionen,
 *   (d) Sprachregeln: kein „Brandfläche", kein „bestätigt", keine Biomasse,
 *       kein `Date.now()` in `src/fire/activity/*`; FRE `null` ≠ 0,
 *   (e) die BC1-/BP1-Bestände bleiben grün,
 *   (f) AF2: Beobachtung nur bei „kein Signal", Wind nur mit Frame ±3 h, Tendenz
 *       heißt anders als `FireEvent.trend`, kein „erloschen" aus fehlender Detektion,
 *   (g) AF3: Merkmalsatz vollständig (kein `undefined`), deterministisch (byte-gleich),
 *       versioniert; Abdeckung ≠ EFFIS-Referenz; reine EFFIS-Einträge ohne Detektion;
 *       Paarregel; das Panel zeigt den Satz und beschriftet die Abdeckung als Raster,
 *   (h) AF4: Kalibrierskript und Archiv-Paarskript laufen (Dry-Run/Fixture), Modelldatei hat
 *       Version und Bereich, das Panel zeigt die Schätzung nie ohne Intervall, Kill-Switch
 *       existiert, kein `Date.now()` in calibration.ts/estimate.ts.
 *
 * Netzfrei, dependency-frei.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { verifyFireActivity, activityOf } from '../src/fire/activity/fireActivity.ts';
import { groupPasses, PASS_GAP_MS } from '../src/fire/activity/overpasses.ts';
import { intensityOf, freLabel } from '../src/fire/activity/intensity.ts';
import { buildFireClusters, fixtureRow, verifyFireClusters } from '../src/fire/fireClusters.ts';
import { buildFireEvents, verifyFireEvents } from '../src/fire/fireEvents.ts';
import { buildFireRegistry, verifyFireRegistry } from '../src/fire/footprint/fireRegistry.ts';
import { buildFireZones } from '../src/fire/fireZones.ts';
import { reconcileZones, fixturePoly } from '../src/fire/footprint/reconcile.ts';
import { featuresOf, featuresJson, FEATURE_KEYS, FEATURE_VERSION, isEligiblePair } from '../src/fire/activity/features.ts';
import { predictInterval } from '../src/fire/activity/calibration.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

for (const c of verifyFireActivity().checks) add(`[activity] ${c.name}`, c.ok, c.detail);
const cl = verifyFireClusters(); add('[clusters] BC1/BP1-Selbstverifikation bleibt grün', cl.passed === cl.total, `${cl.passed}/${cl.total}`);
const ev = verifyFireEvents(); add('[events] F2-Selbstverifikation bleibt grün', ev.passed === ev.total, `${ev.passed}/${ev.total}`);
const rg = verifyFireRegistry(); add('[registry] BP1-Selbstverifikation bleibt grün', rg.passed === rg.total, `${rg.passed}/${rg.total}`);

// --- Quelltexte (Kommentare raus, Selbstverifikation ab) ---------------------
const strip = (s) => {
  const t = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const i = t.search(/export function verify\w*\s*\(/);
  return i < 0 ? t : t.slice(0, i);
};
const read = (rel) => strip(readFileSync(join(ROOT, 'src', 'fire', rel), 'utf8'));
const actDir = join(ROOT, 'src', 'fire', 'activity');
const actFiles = readdirSync(actDir).filter((f) => f.endsWith('.ts'));
const act = Object.fromEntries(actFiles.map((f) => [f, read(join('activity', f))]));
const allAct = Object.values(act).join('\n');
const events = read('fireEvents.ts');
const clusters = read('fireClusters.ts');
const registry = read('footprint/fireRegistry.ts');
const panel = read('FireFootprintPanel.tsx');
const page = read('FirePage.tsx');

// (a) eine Überflug-Regel
add('(a) fireEvents.ts importiert groupPasses und zählt keine Minuten-Slots mehr',
  /from '\.\/activity\/overpasses'/.test(events) && /groupPasses\(/.test(events) && !/60_000\)\)\)/.test(events));
add('(a) fireClusters.ts importiert groupPasses, kein eigenes byMinute',
  /from '\.\/activity\/overpasses'/.test(clusters) && /groupPasses\(/.test(clusters) && !/byMinute/.test(clusters));
add('(a) die Registry verschmilzt Überflüge über mergePasses (keine zweite Regel)',
  /mergePasses\(/.test(registry) && !/60_000\)/.test(registry.split('mergeClusters')[1] ?? ''));
add('(a) die Regel ist 10 min', PASS_GAP_MS === 600_000);
add('(a) overpasses.ts hat kein eigenes Gitter/Union-Find/Abstandsmaß (kein zweites Clustering)',
  !/union|find\(|metersBetween|cellLat/.test(act['overpasses.ts']));
const now = Date.UTC(2026, 7, 15, 12, 0);
const rowsBoundary = [fixtureRow(48, 11, now), fixtureRow(48.002, 11, now + 120_000)];
add('(a) Ereignis und Cluster zählen denselben Überflug (Minutengrenze ⇒ 1)',
  buildFireEvents(rowsBoundary, now)[0].overpasses === 1 && buildFireClusters(rowsBoundary)[0].overpasses === 1
  && groupPasses(rowsBoundary).length === 1);

// (b) Namen
const rows = [fixtureRow(48, 11, now - 3 * 3_600_000), fixtureRow(48.003, 11.002, now - 3 * 3_600_000), fixtureRow(48.006, 11.004, now)];
const zones = buildFireZones(rows);
const rec = buildFireRegistry({
  clusters: buildFireClusters(rows), zones, reconciled: reconcileZones(zones, []), polys: [], effisWindow: null, emsActs: [], nowMs: now,
})[0];
add('(b) frpSumMw bleibt die Fenstersumme (15), frpLastPassMw der jüngste Überflug (5), frpMaxPassMw der stärkste (10)',
  rec.frpSumMw === 15 && rec.activity?.frpLastPassMw === 5 && rec.activity?.frpMaxPassMw === 10,
  JSON.stringify({ sum: rec.frpSumMw, last: rec.activity?.frpLastPassMw, max: rec.activity?.frpMaxPassMw }));
add('(b) FRE aus 3 Detektionen über 2 Überflüge (3 h): (10+5)/2 MW · 10800 s = 81 000 MJ',
  rec.activity?.freMj === 81_000, String(rec.activity?.freMj));
add('(b) das Panel beschriftet die Überfluggröße ausdrücklich als „nicht die Fenstersumme"',
  /nicht die Fenstersumme/.test(panel));

// (c) additiv, null ohne Detektionen
add('(c) FireRecord.activity existiert und ist typisiert `FireActivity | null`', /activity: FireActivity \| null;/.test(registry));
add('(c) reine EFFIS-Einträge tragen activity null', /activity: null,/.test(registry));
add('(c) activity.passCount stimmt mit overpasses überein', rec.activity?.passCount === rec.overpasses);

// (d) Sprache und Reinheit
add('(d) kein Date.now() in src/fire/activity/*', !/Date\.now\(/.test(allAct));
add('(d) das Wort „Brandfläche" fällt in src/fire/activity/* nur verneint',
  !/(?<!keine |keine\s)Brandfläche/.test(allAct.replace(/keine Brandfläche/g, '')));
add('(d) das Wort „bestätigt" fällt in src/fire/activity/* nicht', !/(?<!un)bestätigt/.test(allAct));
add('(d) keine Biomasse-Umrechnung im Code (Jans Entscheidung 2026-08-18)', !/biomass|Biomasse\s*=/.test(allAct.replace(/Keine Biomasse|keine Biomasse/g, '')));
add('(d) FRE-Zelle bei Einzelüberflug: „nicht bestimmbar", nie „0 MJ"',
  (() => { const l = freLabel(intensityOf(groupPasses([fixtureRow(48, 11, now)]))); return /nicht bestimmbar/.test(l) && !/\b0 MJ/.test(l); })());
add('(d) activity ohne Überflüge behauptet nichts', activityOf([]).frpLastPassMw === null && activityOf([]).state === null);
add('(d) AF2/AF4-Felder sind im Typ angelegt und heute null (kein Vorgriff)',
  /state: ActivityState \| null/.test(act['fireActivity.ts']) && /areaEst:/.test(act['fireActivity.ts']) && activityOf(groupPasses(rows)).areaEst === null);

// (f) AF2
const D = 86_400_000;
const quiet = [fixtureRow(48, 11, now - 30 * 3_600_000), fixtureRow(48.003, 11, now - 30 * 3_600_000 + 60_000), fixtureRow(48.5, 11.5, now - 2 * 3_600_000)];
const qz = buildFireZones(quiet);
const { buildObservationIndex, observationFor } = await import('../src/fire/activity/observation.ts');
const obsIdx = buildObservationIndex(quiet);
const quietRecs = buildFireRegistry({
  clusters: buildFireClusters(quiet), zones: qz, reconciled: reconcileZones(qz, []), polys: [], effisWindow: null, emsActs: [], nowMs: now,
  observationAt: (lat, lon, lastMs) => observationFor(obsIdx, lat, lon, lastMs),
});
const quietRec = quietRecs.find((r) => r.status.kind === 'no-signal');
add('(f) „kein Signal"-Eintrag: state no-signal, Beobachtung confirmed (späterer Überflug 60 km entfernt)',
  quietRec?.activity?.state === 'no-signal' && quietRec?.activity?.observation === 'confirmed', JSON.stringify(quietRec?.activity?.observation));
add('(f) aktiver Eintrag trägt KEINE Beobachtungsqualität (nichts wird behauptet)',
  quietRecs.find((r) => r.status.kind === 'active')?.activity?.observation === null);
add('(f) ohne observationAt bleibt die Beobachtung null (kein „unobserved" aus Unwissen)',
  buildFireRegistry({ clusters: buildFireClusters(quiet), zones: qz, reconciled: reconcileZones(qz, []), polys: [], effisWindow: null, emsActs: [], nowMs: now })
    .find((r) => r.status.kind === 'no-signal')?.activity?.observation === null);
add('(f) FirePage: Windabgleich nur mit Frame ±3 h um den Überflug, Sampler aus src/wind (nicht qa/)',
  page.includes('validAtMs - atMs) > 3 * 3_600_000') && page.includes("from '../wind/windPointSample'") && !page.includes('qa/layerSampler'));
add('(f) FirePage: Beobachtungsindex aus den angezeigten Zeilen (hotspotRows), memoisiert',
  page.includes('useMemo(() => (hotspotRows.length > 0 ? buildObservationIndex(hotspotRows)'));
add('(f) das Panel unterscheidet Tendenz (Record) von der Ereignis-Einordnung und sagt es',
  /nicht die Tendenz der Ereignis-Einordnung/.test(panel));
add('(f) das Windflag ist ein Flag, keine Korrektur (Text: dafür/dagegen, „zwei Feuer?")', panel.includes('zwei Feuer?') && panel.includes('dafür noch dagegen'));
add('(f) src/fire/activity/* setzt nirgends „erloschen"', !/erloschen/.test(allAct.replace(/nie „erloschen"|„erloschen" in keinem|kein „erloschen"/g, '')));
add('(f) src/qa/layerSampler.ts re-exportiert sampleWindAt statt einer zweiten Kopie (V-AF-4)',
  (() => { const qa = readFileSync(join(ROOT, 'src', 'qa', 'layerSampler.ts'), 'utf8'); return qa.includes('export { sampleWindAt, type WindSample };') && !/function sampleWindAt/.test(qa); })());

// (g) AF3 Merkmalsatz
const f1 = featuresOf(rec, now); const f2 = featuresOf(rec, now);
add('(g) Merkmalsatz: jeder Schlüssel gesetzt, kein undefined, Version 1',
  FEATURE_KEYS.every((k) => k in f1 && f1[k] !== undefined) && Object.keys(f1).length === FEATURE_KEYS.length && f1.featureVersion === FEATURE_VERSION,
  Object.keys(f1).filter((k) => f1[k] === undefined).join(','));
add('(g) deterministisch: zweimal rechnen ⇒ byte-gleiches JSON', featuresJson(f1) === featuresJson(f2));
add('(g) Werte aus dem Record: 3 Detektionen, 2 Überflüge, max ΣFRP/Überflug 10 (nicht Fenstersumme 15), FRE 81 000, Dauer 3 h, Monat 8, VIIRS',
  f1.nDetections === 3 && f1.nOverpasses === 2 && f1.frpMaxPassMw === 10 && f1.frpSumWindowMw === 15 && f1.freMj === 81_000 && f1.durationH === 3 && f1.month === 8 && f1.sensorFamily === 'VIIRS',
  featuresJson(f1));
add('(g) Abdeckung kommt aus dem Detektionsraster (> 0 ha), EFFIS-Referenz null ohne Kartierung, Landbedeckung null ohne EFFIS',
  f1.coverageHa != null && f1.coverageHa > 0 && f1.effisMappedHa === null && f1.landcoverDominant === null);
// Eintrag MIT EFFIS-Kartierung: Abdeckung bleibt das Raster, EFFIS-Fläche geht als Referenz mit, Landbedeckung dominant CONIFER
const poly = fixturePoly('E1', 11.002, 48.003, 0.02, now - 3 * 3_600_000, 40);
const withEffis = buildFireRegistry({
  clusters: buildFireClusters(rows), zones, reconciled: reconcileZones(zones, [poly]), polys: [poly], effisWindow: { fromMs: now - 7 * 86_400_000, toMs: now + 86_400_000 }, emsActs: [], nowMs: now,
});
const fe = withEffis.map((r) => featuresOf(r, now));
const feMapped = fe.find((f) => f.effisMappedHa != null);
add('(g) mit EFFIS-Kartierung: effisMappedHa = 40 (Referenz), coverageHa bleibt das Raster (≠ 40), landcoverDominant CONIFER',
  !!feMapped && feMapped.effisMappedHa === 40 && feMapped.coverageHa !== 40 && feMapped.landcoverDominant === 'CONIFER', JSON.stringify(feMapped));
// reiner EFFIS-Eintrag ohne Detektion im Fenster
const farPoly = fixturePoly('E2', 13.5, 50.5, 0.02, now - 3 * 3_600_000, 12);
const onlyEffis = buildFireRegistry({
  clusters: buildFireClusters(rows), zones, reconciled: reconcileZones(zones, [farPoly]), polys: [farPoly], effisWindow: { fromMs: now - 7 * 86_400_000, toMs: now + 86_400_000 }, emsActs: [], nowMs: now,
}).find((r) => r.id === 'effis:E2');
const feOnly = onlyEffis ? featuresOf(onlyEffis, now) : null;
add('(g) reiner EFFIS-Eintrag: nDetections/nOverpasses/FRE/Abdeckung null, sensorFamily null, effisMappedHa 12 — nichts wird erfunden',
  !!feOnly && feOnly.nDetections === null && feOnly.nOverpasses === null && feOnly.freMj === null && feOnly.coverageHa === null && feOnly.sensorFamily === null && feOnly.effisMappedHa === 12, JSON.stringify(feOnly));
add('(g) Paarregel: nur mapped/final mit Trennbarkeit ≥ 1,5, ortsfest nie',
  isEligiblePair({ features: f1, target: { source: 'ba-dnbr', areaNetHa: 3, areaMinHa: 2, areaMaxHa: 4, baStatus: 'mapped', separability: 1.6, mappedAtMs: now } })
  && !isEligiblePair({ features: f1, target: { source: 'ba-dnbr', areaNetHa: 3, areaMinHa: 2, areaMaxHa: 4, baStatus: 'provisional', separability: 1.6, mappedAtMs: now } })
  && !isEligiblePair({ features: { ...f1, suspectedStatic: true }, target: { source: 'ba-dnbr', areaNetHa: 3, areaMinHa: 2, areaMaxHa: 4, baStatus: 'final', separability: 3, mappedAtMs: now } }));
add('(g) features.ts: kein Date.now(), Wortwahl „keine Brandfläche" für die Abdeckung, EFFIS als „Referenz, kein Ziel"',
  !act['features.ts'].includes('Date.now(') && act['features.ts'].includes('keine Brandfläche') && act['features.ts'].includes('Referenz, kein Ziel'));
add('(g) das Panel zeigt den Merkmalsatz (FeaturesRow, „JSON kopieren") und nennt die Version',
  panel.includes('featuresOf(r, nowMs)') && panel.includes('JSON kopieren') && panel.includes('Merkmalsatz v{FEATURE_VERSION}'));
add('(g) Schema-Dokument existiert und nennt Version 1 und den Persistenz-Haken',
  (() => { try { const d = readFileSync(join(ROOT, 'docs', 'aktivfeuer-merkmale.md'), 'utf8'); return d.includes('featureVersion') && d.includes('t_end + 7 d') && d.includes('isEligiblePair'); } catch { return false; } })());

// (h) AF4
const NODE = process.execPath;
const nodeArgs = ['--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs'];
const dry = spawnSync(NODE, [...nodeArgs, 'scripts/fire/pairs-from-archive.mjs', '--dry-run'], { cwd: ROOT, encoding: 'utf8' });
let dryJson = null; try { dryJson = JSON.parse(dry.stdout.slice(dry.stdout.indexOf('{'))); } catch { /* unten gemeldet */ }
add('(h) pairs-from-archive --dry-run: 1 Kartierung + 6 Detektionen ⇒ 1 zulässiges Paar mit target.source effis-rda, ohne Netz',
  dry.status === 0 && dryJson?.report?.years?.['2025']?.eligible === 1 && dryJson?.sample?.target?.source === 'effis-rda' && dryJson?.report?.requests === 0,
  dry.status === 0 ? JSON.stringify(dryJson?.report?.years) : (dry.stderr || dry.stdout).slice(0, 300));
// Kalibrierskript auf synthetischen Paaren (bekannte Steigung 0,8)
const tmp = join(tmpdir(), 'buscosun-af4'); mkdirSync(tmp, { recursive: true });
const synth = []; let seed = 7; const rnd = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
for (let i = 0; i < 60; i++) {
  const nDet = Math.round(Math.exp(Math.log(2) + rnd() * (Math.log(400) - Math.log(2))));
  const fre = nDet * 5000 * (0.5 + rnd());
  const g = ((rnd() + rnd() + rnd() + rnd()) - 2) * 0.5;
  const area = 0.5 * Math.pow(nDet, 0.8) * Math.exp(g);
  synth.push(JSON.stringify({
    features: { ...activityFeaturesFixture(i), nDetections: nDet, freMj: i % 3 === 0 ? null : fre },
    target: { source: 'effis-rda', areaNetHa: area, areaMinHa: area, areaMaxHa: area, baStatus: 'mapped', separability: null, mappedAtMs: Date.UTC(2020 + (i % 6), 6, 1), effisId: `S${i}` },
  }));
}
function activityFeaturesFixture(i) {
  return { featureVersion: 1, id: `fire:s${i}`, asOfMs: 0, country: 'DE', lat: 48, lon: 11, nDetections: 1, nOverpasses: 1, frpMaxPassMw: 5, frpSumWindowMw: 5, freMj: null, freSpanH: null, freMaxGapH: null, durationH: 1, coverageHa: 20, coverageCapped: false, hullKm2: 0, sensorFamily: 'VIIRS', daynightMix: 'D', meanScanKm: 0.4, landcoverDominant: null, month: 7, confidenceFirms: { high: 0, nominal: 1, low: 0 }, assessment: 'plausibel', suspectedStatic: false, activityState: null, effisMappedHa: null, effisId: null };
}
const synthIn = join(tmp, 'pairs.jsonl'); const synthOut = join(tmp, 'model.json');
writeFileSync(synthIn, synth.join('\n') + '\n');
const cal = spawnSync(NODE, [...nodeArgs, 'scripts/fire/calibrate.mjs', '--in', synthIn, '--out', synthOut, '--now', '2026-08-18T00:00:00Z'], { cwd: ROOT, encoding: 'utf8' });
let modelJson = null; try { modelJson = JSON.parse(readFileSync(synthOut, 'utf8')); } catch { /* unten gemeldet */ }
add('(h) calibrate.mjs: schreibt Modell v1 (featureVersion 1, effis-rda) mit beiden Fits, Bereich und LOO-Kennzahlen; Steigung ≈ 0,8',
  cal.status === 0 && modelJson?.modelVersion === 1 && modelJson?.featureVersion === 1 && modelJson?.labelSource === 'effis-rda'
  && modelJson?.models?.det && Math.abs(modelJson.models.det.coeffs[1] - 0.8) < 0.2 && modelJson.models.det.xMin >= 1 && modelJson.models.det.looCoverage > 0.6
  && modelJson?.models?.fre && modelJson.models.fre.n >= 25 && Array.isArray(modelJson.caveats) && modelJson.caveats.some((c) => /detektierte/.test(c)),
  cal.status === 0 ? `det Grad ${modelJson?.models?.det?.degree} β=[${modelJson?.models?.det?.coeffs?.map((c) => c.toFixed(3)).join(', ')}] n=${modelJson?.models?.det?.n}; fre n=${modelJson?.models?.fre?.n}` : (cal.stderr || cal.stdout).slice(0, 300));
add('(h) calibrate.mjs verweigert unter 25 zulässigen Paaren (Exit ≠ 0, keine Modelle)',
  (() => { const few = join(tmp, 'few.jsonl'); writeFileSync(few, synth.slice(0, 10).join('\n') + '\n'); const r = spawnSync(NODE, [...nodeArgs, 'scripts/fire/calibrate.mjs', '--in', few, '--out', join(tmp, 'few.json')], { cwd: ROOT, encoding: 'utf8' }); return r.status !== 0; })());
add('(h) calibration.ts/estimate.ts: kein Date.now(), Schätzung „kein Ersatz für eine Kartierung", Kill-Switch afEst',
  !act['calibration.ts'].includes('Date.now(') && !act['estimate.ts'].replace(/\/\*[\s\S]*?\*\//g, '').includes('Date.now(') && act['estimate.ts'].includes('kein Ersatz für eine Kartierung') && act['estimate.ts'].includes("'afEst'"));
add('(h) FirePage lädt das Modell nur mit Kill-Switch-Prüfung und reicht estimateFor in die Registry',
  page.includes('areaEstEnabled()') && page.includes('estimateFor: areaModel ? (rec) => estimateArea(featuresOf(rec, now), areaModel) : undefined'));
add('(h) Panel: Zeile „Schätzung" nutzt estimateLabel (Punktwert nie ohne Intervall) und nennt bei Kartierung „die Kartierung gilt"',
  panel.includes('<dt>Schätzung</dt>') && panel.includes('estimateLabel(r.activity.areaEst)') && panel.includes('die Kartierung gilt'));
add('(h) Modelldatei im Repo (falls vorhanden): v1/featureVersion 1, ≥ 25 Paare je Fit, Koeffizienten + Leverage-Matrix passend zum Grad, Bereich gesetzt',
  (() => { const f = join(ROOT, 'public', 'fire', 'af', 'area-estimate-v1.json'); if (!existsSync(f)) return true; try {
    const m = JSON.parse(readFileSync(f, 'utf8'));
    const fitOk = (x) => x == null || (x.n >= 25 && [1, 2].includes(x.degree) && x.coeffs.length === x.degree + 1 && x.xtxInv.length === x.degree + 1
      && x.xtxInv.every((row) => row.length === x.degree + 1) && x.xMin > 0 && x.xMax >= x.xMin && x.sigma > 0 && x.tCrit > 0);
    return m.modelVersion === 1 && m.featureVersion === 1 && fitOk(m.models.fre) && fitOk(m.models.det) && (m.models.fre || m.models.det);
  } catch { return false; } })());
add('(h) Modelldatei: Vorhersage an drei Stützstellen monoton steigend und im Kalibrierbereich definiert, außerhalb null',
  (() => { const f = join(ROOT, 'public', 'fire', 'af', 'area-estimate-v1.json'); if (!existsSync(f)) return true; try {
    const m = JSON.parse(readFileSync(f, 'utf8')); const fit = m.models.det ?? m.models.fre; if (!fit) return false;
    const xs = [fit.xMin, Math.sqrt(fit.xMin * fit.xMax), fit.xMax];
    const ps = xs.map((x) => predictInterval(fit, x));
    return ps.every((p) => p && p.lowHa < p.ha && p.ha < p.highHa) && ps[0].ha < ps[1].ha && ps[1].ha < ps[2].ha
      && predictInterval(fit, fit.xMax * 1.5) === null;
  } catch { return false; } })());

// Mengengerüst
const many = [];
for (let i = 0; i < 6000; i++) many.push(fixtureRow(47 + (i % 300) * 0.02, 8 + Math.floor(i / 300) * 0.02, now - (i % 8) * 3_600_000));
const t0 = performance.now(); const passes = groupPasses(many); const dt = performance.now() - t0;
add('(perf) 6 000 Detektionen gruppieren < 400 ms', dt < 400 && passes.length > 0, `${dt.toFixed(0)} ms, ${passes.length} Überflüge`);
const bigIdx = buildObservationIndex(many);
const t1 = performance.now(); let seen = 0; for (let i = 0; i < 1000; i++) seen += observationFor(bigIdx, 47 + (i % 300) * 0.02, 8 + (i % 20) * 0.02, now - 5 * 3_600_000).laterPassesSeen; const dt2 = performance.now() - t1;
add('(perf) 1 000 Beobachtungsabfragen gegen 6 000 Zeilen < 150 ms (Index je Überflug, V-AF-7)', dt2 < 150, `${dt2.toFixed(0)} ms, ${seen} Überflüge gesehen`);

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
