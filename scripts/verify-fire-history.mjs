/**
 * Verifier — Brand-Historie (BH1, `audit/brand-historie.md`).
 *
 *   npm run verify:fire-history
 *
 * Netzfrei. Prüft (a) das pure Modul `history/historyEvents.ts` über seine Selbstverifikation
 * (Ereignisbildung = Cluster × Zeitlücke, Determinismus, Kennungen über Läufe) und (b) optional
 * die erzeugte Ereignisdatei `data/fire/bh/events.jsonl` (nur wenn vorhanden — in CI übersprungen):
 * Version, keine doppelte Kennung, keine doppelte Detektion, Saison-Zuordnung, Klassen mit Gründen,
 * Provenienz, Report-Zählstände = Datei; (c) Gate GBH1 — Parität mit dem Live-Client: die letzten 7 Tage aus dem
 * NRT-Cache durch `buildFireClusters` (genau der Weg der Brände-Liste) ⇒ jeder Cluster, dessen Anker im Fenster
 * liegt, ist ein Ereignis `bh:<anchorKey>` mit derselben Überflugzahl.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { verifyHistoryEvents, eventsFromRows, HISTORY_EVENT_VERSION, inSeason } from '../src/fire/history/historyEvents.ts';
import { verifyHistoryArtifacts, entryOf, detectionsOf, shardPath, INDEX_FIELDS, HISTORY_ARTIFACT_VERSION } from '../src/fire/history/historyArtifacts.ts';
import { fixtureRow } from '../src/fire/fireClusters.ts';
import { verifyHistoryLoad } from '../src/fire/history/historyLoad.ts';
import { verifyHistoryDetail } from '../src/fire/history/historyDetail.ts';
import { parseDailyCsv } from '../src/history/meteostatSource.ts';
import { parseFirmsCsv, dedupe } from '../src/fire/sources/firmsHotspots.ts';
import { buildFireClusters } from '../src/fire/fireClusters.ts';
import { readdirSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

const self = verifyHistoryEvents();
for (const c of self.checks) add(`[modul] ${c.name}`, c.ok, c.detail);

const file = join(ROOT, 'data', 'fire', 'bh', 'events.jsonl');
if (!existsSync(file)) {
  console.log('Hinweis: data/fire/bh/events.jsonl fehlt — Dateiprüfungen übersprungen (lokaler Batch).');
} else {
  const events = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const report = JSON.parse(readFileSync(file.replace(/\.jsonl$/, '.report.json'), 'utf8'));
  add('[datei] alle Ereignisse tragen die Schemaversion', events.every((e) => e.version === HISTORY_EVENT_VERSION));
  const ids = new Set(events.map((e) => e.id));
  add('[datei] keine doppelte Kennung', ids.size === events.length, `${ids.size}/${events.length}`);
  const keys = new Set(); let dup = 0;
  for (const e of events) for (const d of e.detections) { if (keys.has(d.key)) dup++; keys.add(d.key); }
  add('[datei] keine Detektion in zwei Ereignissen', dup === 0, String(dup));
  add('[datei] Saison-Flag = Beginn im Fenster 1.3.–31.10.', events.every((e) => e.firstMs == null ? e.inSeason === false : e.inSeason === inSeason(e.firstMs)));
  add('[datei] Jahr = Kalenderjahr des Beginns', events.every((e) => e.firstMs == null || new Date(e.firstMs).getUTCFullYear() === e.year));
  add('[datei] jede Standort-Einordnung hat Gründe und Prüfungen', events.every((e) => !e.anomaly || (e.anomaly.reasons.length > 0 && typeof e.anomaly.checks.footprint === 'boolean')));
  add('[datei] Detektionszahl = gespeicherte Detektionen', events.every((e) => e.hotspots === e.detections.length));
  add('[datei] Provenienz summiert auf', events.every((e) => e.provenance.sp + e.provenance.nrt === e.detections.length));
  add('[datei] Ereignisse mit Detektionen tragen Merkmalsatz v1', events.every((e) => e.detections.length === 0 || e.features?.featureVersion === 1));
  add('[datei] EFFIS-only-Ereignisse heißen bh:effis:', events.every((e) => (e.detections.length === 0) === e.id.startsWith('bh:effis:')));
  add('[datei] sortiert nach Beginn', events.every((e, i) => i === 0 || (events[i - 1].firstMs ?? 0) <= (e.firstMs ?? 0)));
  const total = Object.values(report.years).reduce((s, y) => s + y.events, 0);
  add('[report] Summe der Jahreszählstände = Dateizeilen', total === events.length, `${total}/${events.length}`);
  add('[report] Auswertezeitpunkt steht in Datei und Report', events.every((e) => e.evaluatedAt === report.evaluatedAt));

  // (c) Parität mit dem Live-Client über die letzten 7 Tage vor dem Auswertetag.
  const cache = join(ROOT, '.cache', 'firms-archive');
  const nrtFiles = existsSync(cache) ? readdirSync(cache).filter((f) => /^VIIRS_(SNPP|NOAA20)_NRT-\d{4}-\d{2}-\d{2}-\d(@\d{4}-\d{2}-\d{2})?\.csv$/.test(f)) : [];
  if (!nrtFiles.length) {
    console.log('Hinweis: kein NRT-Cache — Paritätsprüfung übersprungen.');
  } else {
    const D = 86_400_000;
    const toMs = report.evaluatedAt; const fromMs = toMs - 7 * D;
    const rows = dedupe(nrtFiles.flatMap((f) => parseFirmsCsv(readFileSync(join(cache, f), 'utf8'), f.replace(/-\d{4}.*$/, '')).rows))
      .filter((r) => r.acqMs >= fromMs && r.acqMs < toMs);
    const live = buildFireClusters(rows);
    const byId = new Map(events.map((e) => [e.id, e]));
    // Nur Cluster, deren Anker im Fenster liegt UND deren Ereignis nicht vor dem Fenster begann (sonst ist der Anker ein anderer).
    const byKey = new Map();
    for (const e of events) for (const d of e.detections) byKey.set(d.key, e);
    let same = 0, cut = 0, diff = 0, missing = 0; const samples = []; const diffs = [];
    for (const c of live) {
      const e = byId.get(`bh:${c.anchorKey}`);
      if (!e) {
        // Der Anker liegt in einem Ereignis, das VOR dem Fenster begann (oder über die Fenstergrenze
        // verkettet ist) — dann heißt es anders und ist länger; das ist kein Widerspruch, sondern das Fenster.
        const host = byKey.get(c.anchorKey);
        if (host && host.firstMs < c.firstMs) cut++; else { missing++; if (samples.length < 3) samples.push(c.anchorKey); }
        continue;
      }
      if (e.overpasses === c.overpasses && e.hotspots === c.count) same++;
      else { diff++; if (diffs.length < 3) diffs.push(`${c.anchorKey}: live ${c.count}px/${c.overpasses}üf vs ${e.hotspots}/${e.overpasses}`); }
    }
    add('[parität] 7-Tage-Fenster: Live-Cluster vorhanden', live.length > 0, `${rows.length} Zeilen, ${live.length} Cluster`);
    add('[parität] jeder Live-Cluster ist ein Ereignis derselben Kennung oder Teil eines früher begonnenen', missing === 0, `gleiche Kennung ${same + diff}, früher begonnen ${cut}, fehlend ${missing} ${samples.join(' | ')}`);
    add('[parität] Überflüge und Detektionen stimmen überein, wo die Kennung gleich ist (Rest = über das Fenster hinaus)', diff === 0 || same >= 0.9 * (same + diff), `${same}/${same + diff} gleich; ${diffs.join(' · ')}`);
  }
}

// (d) BH2 — Artefakte: Modul-Selbstverifikation (Fixture aus dem Ereignis-Modul) + ausgelieferte Dateien.
{
  const fx = eventsFromRows([fixtureRow(48.0, 11.0, Date.UTC(2026, 7, 10, 12), 5), fixtureRow(48.003, 11.0, Date.UTC(2026, 7, 10, 12), 7)], { nowMs: Date.UTC(2026, 7, 23), polys: [], rings: null });
  const art = verifyHistoryArtifacts(fx.events[0]);
  for (const c of art.checks) add(`[artefakt] ${c.name}`, c.ok, c.detail);
  const pub = join(ROOT, 'public', 'fire', 'bh');
  for (const kind of ['month', 'season']) {
    const f = join(pub, `index-${kind}-v1.json`);
    if (!existsSync(f)) { add(`[artefakt] index-${kind}-v1.json vorhanden`, false); continue; }
    const raw = readFileSync(f, 'utf8');
    const idx = JSON.parse(raw);
    const entries = idx.events.map((r) => entryOf(r, idx.fields));
    add(`[artefakt ${kind}] Version, Fenster, Stand, Grenzen, Lizenzen`, idx.version === HISTORY_ARTIFACT_VERSION && idx.window?.kind === kind && typeof idx.evaluatedAt === 'number' && idx.limits.length >= 3 && idx.attributions.length >= 3);
    add(`[artefakt ${kind}] Feldliste = INDEX_FIELDS`, JSON.stringify(idx.fields) === JSON.stringify(INDEX_FIELDS));
    add(`[artefakt ${kind}] Zählstände = Zeilen (gesamt, je Land)`, idx.counts.total === entries.length && entries.filter((e) => e.country === 'DE').length === idx.counts.byCountry.DE);
    add(`[artefakt ${kind}] nur DE/AT/CH, Weggelassene gezählt`, entries.every((e) => ['DE', 'AT', 'CH'].includes(e.country)) && typeof idx.counts.outsideDropped === 'number');
    add(`[artefakt ${kind}] Beginn im Fenster`, entries.every((e) => e.firstMs >= idx.window.fromMs && e.firstMs < idx.window.toMs));
    add(`[artefakt ${kind}] Ereignisse auf Anlagenstandorten (site + site-deviating) ohne Flächenschätzung`, entries.every((e) => e.anomalyKind === null || e.estHa === null));
    add(`[artefakt ${kind}] Schätzung nie ohne Intervall`, entries.every((e) => e.estHa === null || (e.estLowHa != null && e.estHighHa != null && e.estLowHa <= e.estHa && e.estHa <= e.estHighHa)));
    add(`[artefakt ${kind}] Rang = Stärke (Summe FRP absteigend)`, entries.every((e, i) => i === 0 || (entries[i - 1].frpSumMw ?? 0) >= (e.frpSumMw ?? 0)));
    const missingShard = entries.filter((e) => !existsSync(join(pub, 'ev', shardPath(e)))).length;
    add(`[artefakt ${kind}] jedes Ereignis hat seinen Shard`, missingShard === 0, String(missingShard));
    const gz = gzipSync(raw).length;
    add(`[artefakt ${kind}] Größe gemessen (Ziel ≤ 100 KB gz für den Monat, Saison dokumentiert)`, kind === 'month' ? gz <= 100 * 1024 : gz > 0, `${(raw.length / 1024).toFixed(0)} KB roh / ${(gz / 1024).toFixed(0)} KB gz, ${entries.length} Zeilen`);
    // Stichprobe: der stärkste Eintrag steht im Shard mit denselben Kennzahlen.
    const top = entries[0];
    if (top) {
      const sh = JSON.parse(readFileSync(join(pub, 'ev', shardPath(top)), 'utf8'));
      const ev = sh.events.find((e) => e.id === top.id);
      add(`[artefakt ${kind}] Shard-Eintrag = Index-Zeile (Stichprobe stärkster)`, !!ev && ev.hotspots === top.hotspots && detectionsOf(ev, sh.detectionFields).length === top.hotspots && ev.features?.featureVersion === 1, top.id);
    }
  }
  if (existsSync(join(pub, 'ev'))) {
    const shards = readdirSync(join(pub, 'ev'), { recursive: true }).filter((f) => String(f).endsWith('.json'));
    const stray = shards.filter((f) => !/^\d{4}[\\/]\d{2}[\\/]-?\d+_-?\d+\.json$/.test(String(f))).length;
    add('[artefakt] Shard-Pfade folgen dem Schema <jahr>/<monat>/<lat>_<lon>.json', stray === 0, `${shards.length} Shards, ${stray} fremd`);
  }
}

// (e) BH3 — Client: Lader/GeoJSON-Selbstverifikation + Verdrahtung (Textsonden auf den Werten, nicht auf Zeilenumbrüchen).
{
  for (const c of verifyHistoryLoad().checks) add(`[client] ${c.name}`, c.ok, c.detail);
  const page = readFileSync(join(ROOT, 'src', 'fire', 'FirePage.tsx'), 'utf8');
  const fmap = readFileSync(join(ROOT, 'src', 'fire', 'FireMap.tsx'), 'utf8');
  add('[client] Historie lädt über loadHistoryIndex, nie über fetchFirmsHotspots', /loadHistoryIndex\(history\)/.test(page) && !/fetchFirmsHotspots\([^)]*history/.test(page));
  add('[client] Historie-Modus leert die Live-Daten der Karte (Hotspots, Raster, Hüllen, Flächen, Pfeile)',
    /hotspots=\{history \? null : hotspots\}/.test(page) && /fireZones=\{history \? EMPTY_ZONES/.test(page) && /clusters=\{history \? EMPTY_CLUSTER_LIST/.test(page) && /footprintFc=\{history \? null/.test(page) && /spreadFc=\{history \? null : spreadFc\}/.test(page));
  add('[client] Standort-Rauten bleiben im Historie-Modus (zeitlos)', /anomalyFc=\{anomalyFc\}/.test(page));
  add('[client] Kill-Switch: Fenster Monat/Saison nur mit historyEnabled()', /historyEnabled\(\) && \(\[\['month', 'Monat'\], \['season', 'Saison'\]\]/.test(page) && /historyEnabled\(\) && initial\?\.historyWindow/.test(page));
  add('[client] Live-Fenster-Klick verlässt die Historie', /setHistory\(null\); setTime\(\(t\) => \(\{ \.\.\.t, windowH: h \}\)\)/.test(page));
  add('[client] Permalink führt historyWindow mit (nur im Modus)', /historyWindow: history,/.test(page));
  add('[client] Brände-Reiter zeigt im Modus das Historie-Panel (Desktop + mobil)', (page.match(/history \? historyPanel\((false|true)\)/g) ?? []).length === 2);
  add('[client] FireMap: Historie-Quelle, Layer unsichtbar bis Daten, Auswahlring, Klick vor der Popup-Kette',
    /addSource\(HISTORY_SOURCE_ID/.test(fmap) && /\[HISTORY_SOURCE_ID, s\.historyFc\]/.test(fmap) && /s\.historyFc \? 'visible' : 'none'/.test(fmap) && /setFilter\(HISTORY_SEL_LAYER_ID/.test(fmap) && /layers: \[HISTORY_LAYER_ID\]/.test(fmap));
  add('[client] historyFc steht in stateRef (beide Literale)', (fmap.match(/anomalyFc, selectedSiteId, historyFc, selectedHistoryId,/g) ?? []).length === 2);
  add('[client] Panel: Stand, Ausfall ≠ leer, Deckel ausgesprochen, Detektionsgrenze', (() => {
    const pnl = readFileSync(join(ROOT, 'src', 'fire', 'FireHistoryPanel.tsx'), 'utf8');
    return /Stand \$\{historyStandLabel/.test(pnl) && /Das ist ein Ausfall, kein leerer Monat/.test(pnl) && /gezeigt \{Math\.min\(shown, rows\.length\)\} von/.test(pnl) && /kleine Brände fehlen dem Satelliten systematisch/.test(pnl);
  })());
}

// (f) BH4 — Detail: reine Ableitungen (Regenphase, Stundenwahl) + Verdrahtung der Detailkarte.
{
  for (const c of verifyHistoryDetail().checks) add(`[detail] ${c.name}`, c.ok, c.detail);
  const det = readFileSync(join(ROOT, 'src', 'fire', 'history', 'historyDetail.ts'), 'utf8');
  const pnl = readFileSync(join(ROOT, 'src', 'fire', 'FireHistoryPanel.tsx'), 'utf8');
  add('[detail] Wetterhistorie-Module nur per dynamischem Import (eigener Chunk, kein Brandradar-Wachstum)',
    /await import\('\.\.\/\.\.\/history\/historySource'\)/.test(det) && !/^import \{[^}]*\} from '\.\.\/\.\.\/history\/(historySource|meteostatSource)'/m.test(det));
  add('[detail] Shard-Lader: no-store, Fehler als Ergebnis, Fehler nicht gemerkt', /cache: 'no-store'/.test(det) && /kind: 'error', message: `HTTP/.test(det) && /_shards\.delete\(path\)/.test(det));
  add('[detail] Karte: jede Wetterzahl trägt Wertart und Quelle (gemessen / Reanalyse)', /w\.day\.kind === 'measured' \? 'gemessen' : 'Reanalyse'/.test(pnl) && /Reanalyse, \{w\.hour\.source\}/.test(pnl));
  add('[detail] Karte sagt, dass ICON/Fusion kein Archiv haben (W4)', /Kein ICON-\/Fusionswert: die Vorhersagemodelle haben kein Archiv/.test(pnl));
  add('[detail] Ausfall ≠ Wert: Wetter null ⇒ „kein Wert erfunden", Shard-Fehler benannt', /kein Wert erfunden/.test(pnl) && /Detail nicht erreichbar \(\{shard\.message\}\)/.test(pnl));
  add('[detail] Evidenz: Gründe der Standort-Einordnung, frühere Kennung, Merkmalsatz + JSON kopieren', /ev\.anomaly\.reasons\.map/.test(pnl) && /previousIds\.join/.test(pnl) && /featuresJson\(ev\.features!\)/.test(pnl));
  add('[detail] Landbedeckung nur mit EFFIS-Kartierung, Natura 2000 nur mit Wert', /ev\?\.effis && \(/.test(pnl) && /ev\.effis\.percNa2k != null &&/.test(pnl));
  const exp = readFileSync(join(ROOT, 'src', 'history', 'historyExport.ts'), 'utf8');
  const pro = readFileSync(join(ROOT, 'src', 'history', 'HistoryPro.tsx'), 'utf8');
  add('[nebenbefund] CSV-Export nennt die aktive Quelle, nicht fest ERA5', /Quelle: \$\{source\}/.test(exp) && /bucketsToCSV\(buckets, meta, loc\.name, defaultHistorySource\.label\)/.test(pro));
  // Meteostat-Parser: Spalten aus dem Header (Nideggen-Schmidt D3591 ohne wpgt/tsun — echte Zeile vom 2026-08-14).
  const csvNideggen = 'year,month,day,temp,temp_source,tmin,tmin_source,tmax,tmax_source,rhum,rhum_source,prcp,prcp_source,snwd,snwd_source,wspd,wspd_source,pres,pres_source,cldc,cldc_source\n2026,8,14,28.6,dwd_daily,20.7,dwd_daily,35.1,dwd_daily,26,dwd_daily,0.0,dwd_daily,,,12.1,metno_forecast,1017.5,metno_forecast,0,metno_forecast\n';
  const csvFull = 'year,month,day,temp,temp_source,tmin,tmin_source,tmax,tmax_source,rhum,rhum_source,prcp,prcp_source,snwd,snwd_source,wspd,wspd_source,wpgt,wpgt_source,pres,pres_source,tsun,tsun_source,cldc,cldc_source\n2026,8,14,27.7,dwd_daily,18.8,dwd_daily,37.6,dwd_daily,31,dwd_daily,0.0,dwd_daily,0,dwd_daily,10.8,dwd_daily,29.5,dwd_daily,1015.7,dwd_daily,783,dwd_daily,1,dwd_daily\n';
  const n = parseDailyCsv(csvNideggen)[0]; const f = parseDailyCsv(csvFull)[0];
  add('[nebenbefund] Meteostat-Parser: ohne wpgt/tsun-Spalten ist der Wind die Windgeschwindigkeit, nicht der Luftdruck', n?.windMaxKmh === 12.1 && n.sunshineH === null && n.tMaxC === 35.1 && n.humidityPct === 26, JSON.stringify(n));
  add('[nebenbefund] Meteostat-Parser: voller Spaltensatz unverändert (Böe, Sonnenstunden)', f?.windMaxKmh === 29.5 && f.sunshineH != null && Math.abs(f.sunshineH - 13.05) < 0.01 && f.tMaxC === 37.6);
  add('[nebenbefund] Meteostat-Parser: modellgefüllte Werte sind markiert (metno_forecast ⇒ windMaxKmh), Messwerte nicht', JSON.stringify(n?.modelFilled) === '["windMaxKmh"]' && f?.modelFilled === undefined);
}

const passed = checks.filter((c) => c.ok).length;
for (const c of checks) console.log(`${c.ok ? 'OK ' : 'FAIL'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
console.log(`\n${passed}/${checks.length} Prüfungen bestanden`);
process.exit(passed === checks.length ? 0 : 1);
