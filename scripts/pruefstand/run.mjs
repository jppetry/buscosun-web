#!/usr/bin/env node
/**
 * run.mjs — the entry of the Prüfstand (plan PS-4-1): scores a version of buscosun Fusion by the frozen protocol P1.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/pruefstand/run.mjs
 *     --modus=status
 *     --registriere=fusion-<n> --freeze=YYYY-MM-DD [--tabellen=<dir>] [--fit-learned=von..bis] [--fit-stack=von..bis]
 *     --registriere=test-<name> --basis=fusion-<n> --breiter=<f>            (a deliberately worsened candidate, gate G-PS4)
 *     --kandidat=fusion-<n> --modus=schnell|voll|abnahme [--offline]
 *     --modus=vergleich --versionen=fusion-5e,fusion-6,… [--tresor] [--offline]
 *
 * Modes (Konzept §12): `schnell` and `voll` read the DEVELOPMENT set only (archive days up to the freeze) and decide
 * nothing; `abnahme` runs the self-check, opens track P (archive days after the freeze, mature truth only) and track R
 * (the hindcast vault), judges the gates, writes report, ranking and the access log. `vergleich` ranks several versions
 * on their common development set — or, with `--tresor`, on the clean sets, which is logged like an acceptance.
 *
 * Exit codes: 0 done · 2 a register question for Jan (freeze, fit window) · 3 self-check failed · 4 adapter contract or
 * replay failed · 5 gate G4 red · 1 anything else. The routine computes; it never changes protocol, tables or engine.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { H, PS_DIR, PS_ROOT, REPO, atomicWrite, ensureDir, isoDay, p, parseArgs, readJson, sha256, writeJson } from './lib/common.mjs';
import { loadProtocol } from './lib/protokoll.mjs';
import { archiveIssues, hindcastIssues } from './lib/konserven.mjs';
import { REF_IDS, determinismCheck, fillConserves, issueSets, scoreSet, selfCheck, standardPairs, summarizeSet } from './lib/lauf.mjs';
import { REGISTER_DIR, champion, engineRoot, listRegister, loadRegister, modelHash, normalizeId, registerPath, writeRegister } from './lib/register.mjs';
import { gateG1, gateG4, indexOfPair, verdictOf } from './lib/urteil.mjs';
import { openW1 } from './lib/wahrheit.mjs';
import { productCount, renderReport } from './lib/bericht.mjs';

const args = parseArgs();
const say = (...a) => console.log(...a);
const AUDIT = p(REPO, 'audit/pruefstand');
const today = isoDay(Date.now());
const fail = (code, msg) => { console.error(msg); process.exit(code); };
const pct = (x, d = 1) => (x == null ? '–' : `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d).replace('.', ',')} %`);
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8' }).trim();

let proto;
try { proto = loadProtocol(); } catch (e) { fail(1, `STOPP: ${e.message}`); }

// ── status ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function status() {
  const regs = listRegister();
  say(`Protokoll ${proto.id} ${proto.hash.slice(0, 12)} · Prüfnetz ${proto.scored.length} Stationen mit Wahrheit (Rolle B ${proto.scored.filter((s) => s.role === 'B').length})`);
  const mp = p(PS_ROOT, 'wahrheit', proto.truth.stand, 'manifest.json');
  if (existsSync(mp)) { const m = readJson(mp); const days = Object.keys(m.days); say(`Wahrheit ${m.stand} ${String(m.hash).slice(0, 12)}: ${days.length} Tage (${days[0]} … ${days[days.length - 1]}), reif ${days.filter((d) => m.days[d].reif).length}, letzter Lauf ${m.runs.at(-1)?.at}`); } else say('Wahrheit: noch nicht gebaut');
  const arch = archiveIssues();
  say(`Archiv: ${arch.length} Ausgabetage (${arch[0]?.day} … ${arch.at(-1)?.day}) · Tresor: ${hindcastIssues(proto).length} Ausgaben (${proto.tresor.from} … ${proto.tresor.to})`);
  for (const r of regs) say(`${r.id.padEnd(11)} ${r.status.padEnd(11)} Commit ${r.commit.slice(0, 7)} · Freeze ${r.freeze} · Modell ${r.modelHash.slice(0, 12)}${r.tresor.contaminated ? ' · Spur R kontaminiert' : ''}`);
  const rl = p(AUDIT, 'rangliste.json');
  if (existsSync(rl)) { const j = readJson(rl); say(`Rangliste (${j.updated}): ${j.entries.slice(0, 6).map((e) => `${e.id} ${pct(e.guete)}`).join(' · ')}`); }
}

// ── register ───────────────────────────────────────────────────────────────────────────────────────────────────────
async function registerNew(idRaw) {
  const id = normalizeId(idRaw);
  if (existsSync(registerPath(id)) && !args.neu) fail(1, `Register: ${id} ist schon eingetragen (${registerPath(id)}). Ein Eintrag wird nicht überschrieben; --neu erzwingt es.`);
  if (id.startsWith('test-')) {
    const base = loadRegister(normalizeId(args.basis ?? ''));
    const widen = Number(args.breiter);
    if (!(widen > 0)) fail(1, 'Test-Kandidat: --basis=fusion-<n> und --breiter=<Faktor> angeben');
    writeJson(registerPath(id), { schema: 1, kind: 'abgeleitet', id, name: `${base.name} mit ${widen}-fach breiten Bändern (Test)`, order: base.order + 0.5, status: 'test', base: base.id, transform: { widen }, freeze: base.freeze, notes: ['Bewusst verschlechterter Kandidat für Gate G-PS4; nie ein Produktstand.'] });
    say(`eingetragen: ${id} (abgeleitet aus ${base.id})`);
    return;
  }
  const n = Number(id.replace('fusion-', ''));
  const champ = champion();
  if (!champ) fail(1, 'Register: kein Champion eingetragen');
  if (git('status', '--porcelain', '--', 'src').split('\n').filter((l) => l && !/src\/pruefstand\//.test(l)).length) fail(1, 'Register: unter src/ liegen nicht committete Änderungen — eine Version wird an einem Commit registriert (erst committen).');
  const rel = await import('../../src/pointForecast/fusion/fusionRelease.ts');
  if (Number.isFinite(n) && rel.FUSION_CURRENT !== n) fail(1, `Register: der Stand im Code ist ${rel.FUSION_NAME}, nicht buscosun Fusion ${n}.`);
  const stage = rel.fusionStage().options;
  const options = { ...Object.fromEntries(Object.entries(champ.options).filter(([k]) => !(k in stage) && !rel.FUSION_RELEASES.some((x) => x.option === k))), ...stage };
  if (!args.freeze || !/^\d{4}-\d{2}-\d{2}$/.test(String(args.freeze))) fail(2, `FRAGE AN JAN: Welcher ist der letzte Archivtag, den Entwicklung, Fit oder Tabellen von ${id} gesehen haben (Freeze)? Dann: --registriere=${id} --freeze=YYYY-MM-DD. Nichts raten.`);
  const win = (s, d) => { if (!s) return d; const m = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(String(s)); if (!m) fail(1, `Fit-Fenster ${s}: Form von..bis`); return { ...d, from: m[1], to: m[2] }; };
  const dir = args.tabellen ? String(args.tabellen).replace(/\\/g, '/') : null;
  const tables = dir ? { learned: p(dir, 'fusion.client.json'), stack: p(dir, 'stack.client.json'), clima: existsSync(p(dir, 'stations.json')) ? p(dir, 'stations.json') : p(PS_ROOT, 'tabellen', champ.tables.clima.file), ...(champ.tables.loso ? { loso: p(PS_ROOT, 'tabellen', champ.tables.loso.file) } : {}) } : Object.fromEntries(Object.entries(champ.tables).map(([k, t]) => [k, t ? p(PS_ROOT, 'tabellen', t.file) : null]));
  if (dir && !args['fit-learned']) fail(2, `FRAGE AN JAN: Neue Tabellen aus ${dir} — welches Fit-Fenster haben Lernstufe und Stationswert gesehen? Dann: --fit-learned=von..bis --fit-stack=von..bis.`);
  const reg = writeRegister(proto, { id, name: rel.fusionName(n), order: n, status: 'kandidat', commit: git('rev-parse', 'HEAD'), options, clima: champ.clima, climaHeldOut: champ.climaHeldOut ?? null, tables, freeze: String(args.freeze), freezeNote: 'von Jan bei der Registrierung genannt', fit: { learned: win(args['fit-learned'], champ.fit.learned), ...(champ.fit.stack ? { stack: win(args['fit-stack'], champ.fit.stack) } : {}) }, notes: [`registriert am ${today} aus HEAD; Optionen = Stufe des Registers der Stände (fusionRelease.ts) plus die festen Optionen des Champions`] });
  say(`eingetragen: ${reg.id} · Commit ${reg.commit.slice(0, 7)} · Modell ${reg.modelHash.slice(0, 12)} · Optionen ${JSON.stringify(reg.options)} · Spur R ${reg.tresor.contaminated ? 'KONTAMINIERT' : 'sauber'}`);
}

// ── shared ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function refreshTruth() {
  const mp = p(PS_ROOT, 'wahrheit', proto.truth.stand, 'manifest.json');
  const last = existsSync(mp) ? Date.parse(readJson(mp).runs.at(-1)?.at ?? 0) : 0;
  if (args.offline || Date.now() - last < 20 * H) return;
  say('Wahrheit W1 wird fortgeschrieben (Abruf bei DWD, GeoSphere, MeteoSwiss) …');
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', '--max-old-space-size=6000', '--import', `file:///${p(PS_DIR, '../lib/register-ts.mjs')}`, p(PS_DIR, 'wahrheit/build-w1.mjs'), '--quiet'], { stdio: 'inherit', cwd: REPO });
  if (r.status !== 0) fail(1, 'STOPP: Die Wahrheit ließ sich nicht fortschreiben (Netz?). Mit --offline läuft der Prüfstand auf dem vorhandenen Stand.');
}
function recompute(reg, issue) {
  return new Promise((resolve, reject) => {
    const w = new Worker(p(PS_DIR, 'replay-worker.mjs'), { execArgv: ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', '--import', `file:///${p(PS_DIR, '../lib/register-ts.mjs')}`], resourceLimits: { maxOldGenerationSizeMb: 5000 } });
    w.on('message', (m) => { w.terminate(); if (m.ok) resolve(m.dataSha256); else reject(new Error(m.error)); });
    w.on('error', reject);
    w.postMessage({ reg, issue: { source: issue.source, day: issue.day, issueMs: issue.issueMs, slotAtMs: issue.slotAtMs, path: issue.path }, slotSha: issue.sha256, root: engineRoot(reg).root, dryRun: true });
  });
}
const describe = (reg) => (reg.kind === 'abgeleitet' ? { id: reg.id, name: reg.name, commit: loadRegister(reg.base).commit, modelHash: sha256(JSON.stringify([loadRegister(reg.base).modelHash, reg.transform])), freeze: reg.freeze, status: reg.status, derivedFrom: reg.base } : { id: reg.id, name: reg.name, commit: reg.commit, modelHash: modelHash(reg), freeze: reg.freeze, status: reg.status });
const NOTES = [
  'Rolle B heißt: im Replay ohne eigene Station und ohne eigene Messung (Stationsprodukt und Messung des nächsten Ankers). Alle Stationen von heute waren im Fit jeder Bestandsversion (D-PS-9) — echte, nie gesehene Prüfstationen entstehen erst mit den neuen Archivpunkten (Archiv-Schema 5).',
  'Der Replay rechnet am Archiv mit EINER Cube-Zelle je Stufe und dem Gelände aus der Merkmalstabelle; der Browser nimmt den 2×2-Block und das Gelände am Punkt (D-PS-5). Die Abweichung zum ausgelieferten Produkt ist nicht gemessen, solange das Archiv die Ausgabe des Cube-Pfads nicht schreibt.',
  'Spur R (Hindcast-Tresor): nachgebaute Eingaben, ohne Stationsprodukt, Nowcast und Messungen; Stufe 1 nur als „Tag 0“ (Vorlauf 1–2 h), die Fenster 6–24 h und 24–48 h sind dort leer. Versionen, die sich nur in Anker oder Radar unterscheiden, rechnen dort gleich.',
  'MOSMIX-L ist auf die Messungen der Station trainiert; als Referenz fair, an Rolle B ein Heimvorteil für MOSMIX.',
  'Wahrheit W1: Werte am Stempel H (E-PS-15). 24 DE-Punkte (Flugplätze) haben keine 10-min-Daten in CDC und werden nicht bewertet. Wind AT ist das vektorielle 10-min-Mittel; die Windmesshöhe ist in AT/CH nicht in den offenen Metadaten und in P1 kein Filter.',
  'Böe nach 48 h: Nebenzelle gegen das Schrittmaximum; der Cube mischt dort Stundenmaximum (ICON) und Schrittmaximum (ECMWF).',
  'Nicht bewertet: Globalstrahlung, Luftdruck, Sichtweite, Niederschlagsart, Schneefallgrenze, Tagessumme Niederschlag, Sprunghaftigkeit (Gründe in protokoll.json → notScored).',
];
function writeRun(dir, scores) {
  ensureDir(dir);
  atomicWrite(p(dir, 'scores.json'), `${JSON.stringify(scores)}\n`);   // compact: several MB per run
  atomicWrite(p(dir, 'bericht.html'), renderReport(scores, proto.net));
  return p(dir, 'bericht.html');
}
function logAccess(what) {
  appendFileSync(p(REGISTER_DIR, 'zugriffe.log'), `${new Date().toISOString()}\t${what}\tProtokoll ${proto.hash.slice(0, 12)}\n`);
}
const rankingOf = (set, ids) => ids.map((id) => { const x = set.pairs[`${id}|ref-klima`]; return x?.indexB?.value == null ? null : { id, name: id.startsWith('ref-') ? (proto.references[id.slice(4)]?.name ?? id) : loadRegister(id).name, value: x.indexB.value, ci95: x.indexB.ci95 ?? null, cells: x.indexB.cells, days: x.indexB.days, valueA: x.indexA.value }; }).filter(Boolean).sort((a, b) => b.value - a.value);

// ── candidate run ──────────────────────────────────────────────────────────────────────────────────────────────────
async function runCandidate(idRaw, mode) {
  const cand = loadRegister(normalizeId(idRaw)), champ = champion();
  if (!champ) fail(1, 'Register: kein Champion eingetragen');
  const base = cand.kind === 'abgeleitet' ? loadRegister(cand.base) : cand;
  if (!cand.freeze) fail(2, `FRAGE AN JAN: Im Register von ${cand.id} fehlt das Freeze-Datum.`);
  const freeze = cand.freeze > champ.freeze ? cand.freeze : champ.freeze;
  const versions = [...new Set([...listRegister().filter((x) => x.status !== 'nicht rekonstruierbar' && x.order <= Math.max(base.order, champ.order)).map((x) => x.id), cand.id])];
  const stored = [...new Set([...versions.filter((v) => v !== cand.id || cand.kind !== 'abgeleitet'), base.id])];
  refreshTruth();
  const w1 = openW1(proto);
  const all = issueSets(proto, freeze);
  const rUsable = !base.tresor.contaminated && !champ.tresor.contaminated;
  const plan = mode === 'schnell' ? [['schnell', 'Schnelltest (jeder dritte Tag der Entwicklungsmenge)', all.schnell, false]]
    : mode === 'voll' ? [['entwicklung', 'Entwicklungsmenge (Archiv bis zum Freeze)', all.entwicklung, false]]
    : [['spurP', 'Spur P (Archiv nach dem Freeze)', all.spurP, true], ...(rUsable ? [['spurR', 'Spur R (Hindcast-Tresor)', all.spurR, true]] : []), ['entwicklung', 'Entwicklungsmenge (Diagnose, entscheidet nichts)', all.entwicklung, false]];
  const refs = mode === 'schnell' ? ['ref-klima'] : REF_IDS;
  const ids = mode === 'schnell' ? [...new Set([cand.id, champ.id, 'ref-klima'])] : [...new Set([...versions, ...refs])];
  if (mode === 'abnahme') logAccess(`abnahme\t${cand.id} gegen ${champ.id}\tSpur P ${all.spurP.length} Tage, Spur R ${rUsable ? all.spurR.length : 0} Ausgaben`);

  say(`${cand.name} — Modus ${mode}; Champion ${champ.name}; Freeze ${freeze}`);
  for (const [key, , issues] of plan) { if (!issues.length) continue; say(`Konserven ${key}: ${issues.length} Ausgaben × ${ids.length} Modelle`); try { await fillConserves(proto, [...new Set([...ids, ...stored])], issues, say); } catch (e) { fail(4, `STOPP: ${e.message}`); } }

  let self = null;
  if (mode === 'abnahme') {
    const judged = plan.filter(([k, , issues]) => k !== 'entwicklung' && issues.length >= proto.statistics.minDays).sort((a, b) => b[2].length - a[2].length)[0] ?? plan.find(([k]) => k === 'entwicklung');
    say(`Selbstprüfung auf ${judged[1]} …`);
    await fillConserves(proto, [proto.selfcheck.aa.partner, proto.selfcheck.aa.partnerFallback].filter((x) => x.startsWith('ref-') || existsSync(registerPath(x))), judged[2], say);
    self = await selfCheck(proto, w1, judged[2], champ.id, { ripeOnly: judged[3] });
    self.set = judged[0];
    for (const c of self.controls) say(`  ${c.ok ? '✓' : '✗'} ${c.name} — ${c.detail}`);
    say(`  ${self.aa.ok ? '✓' : '✗'} A/A-Test: Irrtumsrate ${(self.aa.rate * 100).toFixed(1).replace('.', ',')} % bei nominal ${(self.aa.nominal * 100).toFixed(0)} % (Grenze ${(self.aa.maxRate * 100).toFixed(0)} %)`);
    if (!self.ok) fail(3, 'STOPP: Die Selbstprüfung des Prüfstands ist fehlgeschlagen — kein Urteil. Die Routine prüfen, nicht den Kandidaten.');
  }

  const pairs = standardPairs(cand.id, champ.id, mode === 'schnell' ? [cand.id, champ.id] : versions, refs);
  const sets = {}, raw = {};
  const physics = { tdN: 0, tdAboveT: 0, gustN: 0, gustBelowWind: 0, precipN: 0, precipNegative: 0, clctN: 0, clctOutside: 0 };
  const physicsH = { ...physics };
  for (const [key, label, issues, ripeOnly] of plan) {
    if (!issues.length) { sets[key] = { label, issues: 0, days: [], ripeOnly, models: {}, pairs: {}, special: {}, why: key === 'spurP' ? `noch kein Archivtag nach dem Freeze ${freeze}` : null }; continue; }
    const res = scoreSet(proto, w1, issues, ids, pairs, { ripeOnly, special: mode === 'schnell' ? [] : [cand.id, 'ref-roh', 'ref-roh-lapse'], physicsOf: cand.id, physicsOfChampion: champ.id });
    raw[key] = res;
    for (const k of Object.keys(physics)) { physics[k] += res.physics[k]; physicsH[k] += res.physicsChampion[k]; }
    sets[key] = { label, ripeOnly, ...summarizeSet(proto, res, { cand: cand.id, champ: champ.id }) };
    if (key === 'spurR') sets[key].note = 'Kette ohne Stationsprodukt, Nowcast und Messungen; Vorläufe 1–2 h und ab 51 h.';
    if (key === 'entwicklung' && mode === 'abnahme') sets[key].note = 'Diese Tage haben Entwicklung oder Fit gesehen; die Zahlen sind Diagnose.';
  }
  const pc = (key) => sets[key]?.pairs?.[`${cand.id}|${champ.id}`] ?? null;
  if (mode === 'schnell') {
    const x = pc('schnell');
    say(`\nSchnelltest ${cand.name} gegen ${champ.name}: ${sets.schnell.issues} Tage, Fortschrittsindex Rolle B ${pct(x?.indexB.value, 2)}${x?.indexB.ci95 ? ` (95 %: ${pct(x.indexB.ci95[0], 2)} … ${pct(x.indexB.ci95[1], 2)})` : ''}, Rolle A ${pct(x?.indexA.value, 2)}. Keine Gates, keine Entscheidung, kein Bericht.`);
    return;
  }
  // ── gates
  const judgedKeys = mode === 'abnahme' ? ['spurP', ...(rUsable ? ['spurR'] : [])] : ['entwicklung'];
  const combine = (name) => {
    const parts = judgedKeys.map((k) => [sets[k].label, sets[k][name]]).filter(([, g]) => g);
    const st = parts.some(([, g]) => g.status === 'rot') ? 'rot' : parts.some(([, g]) => g.status === 'grün') ? 'grün' : 'nicht bewertbar';
    const detail = judgedKeys.map((k) => { const g = sets[k][name]; if (!g) return `${sets[k].label}: keine Fälle`; return name === 'G2' ? `${sets[k].label}: ${g.status} — ${g.worse.length} von ${g.tested} Kernzellen signifikant schlechter${g.worse.length ? ` (${g.worse.slice(0, 4).map((w) => `${w.var} ${w.window} ${w.land} ${pct(w.skill)}`).join(', ')})` : ''}` : `${sets[k].label}: ${g.status} — ${g.rows.filter((x) => x.red).length} von ${g.rows.filter((x) => x.red != null).length} Zellen rot, ${g.rows.filter((x) => x.inBand === false).length} außerhalb des Bands um ${g.nominal * 100} %`; }).join(' · ');
    return { status: st, detail, bySet: Object.fromEntries(judgedKeys.map((k) => [k, sets[k][name] ?? null])) };
  };
  let det = { ok: true, detail: `abgeleitet aus ${cand.base ?? ''}: deterministische Umformung` };
  if (cand.kind !== 'abgeleitet') {
    const probe = judgedKeys.map((k) => (k === 'spurP' ? all.spurP : k === 'spurR' ? all.spurR : all.entwicklung)).find((l) => l.length)?.[0] ?? all.entwicklung[0];
    say(`G4 Determinismus: zweiter Lauf ${probe.source} ${probe.day} …`);
    try { det = await determinismCheck(proto, cand, probe, recompute); } catch (e) { det = { ok: false, detail: String(e.message).slice(0, 300) }; }
  }
  const sum = (id, f) => judgedKeys.reduce((a, k) => a + (sets[k].models?.[id]?.[f] ?? 0), 0);
  const ms = Object.values(sets).map((s) => s.models?.[cand.id]?.pointMsMedian).filter((x) => x != null);
  const firstP = all.spurP[0]?.day ?? null;
  const leak = { ok: (!firstP || firstP > cand.freeze) && (!judgedKeys.includes('spurR') || !base.tresor.contaminated), detail: `Freeze ${cand.freeze}${firstP ? `, erster Tag der Spur P ${firstP}` : ''}; Tresor ${proto.tresor.from} … ${proto.tresor.to}: ${base.tresor.note}` };
  const G1 = mode === 'abnahme' ? gateG1(proto, pc('spurP')?.indexB ?? { value: null, days: 0 }, pc('spurR')?.indexB ?? null, rUsable) : gateG1(proto, pc('entwicklung')?.indexB ?? { value: null, days: 0 }, null, false);
  const gates = { G1, G2: combine('G2'), G3: combine('G3'), G4: gateG4(proto, { determinism: det, physics, physicsChampion: physicsH, filledC: sum(cand.id, 'kernFilled'), filledH: cand.id === champ.id ? null : sum(champ.id, 'kernFilled'), pointMs: ms.length ? Math.max(...ms) : null, leak }) };
  if (mode === 'voll') { gates.G1.setName = 'Entwicklungsmenge'; gates.indicative = 'Volltest auf der Entwicklungsmenge: Die Gates sind Hinweise. Diese Tage hat die Entwicklung gesehen; ein Urteil gibt nur die Abnahme.'; gates.G1.why = `Entwicklungsmenge statt Spur P: ${gates.G1.why.replace('Spur P', 'die Entwicklungsmenge')}`; }
  const warnings = [];
  for (const k of judgedKeys) if (sets[k].overfit?.warning) warnings.push(`Verdacht Überanpassung (${sets[k].label}): Gewinn gegen den Champion an Rolle A ${pct(sets[k].overfit.gainA)} gegen ${pct(sets[k].overfit.gainB)} an Rolle B.`);
  for (const [k, s] of Object.entries(sets)) if (s.unripeCounted) warnings.push(`${s.label}: ${s.unripeCounted} Werte mit unreifer Wahrheit (jünger als ${proto.truth.maturityDays} Tage) sind mitgezählt.`);
  if (mode === 'abnahme' && !rUsable) warnings.push('Spur R kontaminiert: ein Fit-Fenster reicht in den Tresor — Spur R zählt nicht.');
  const same = cand.id === champ.id;
  const label = mode === 'voll' ? 'Volltest' : verdictOf(gates, same);
  const main = pc(mode === 'voll' ? 'entwicklung' : rUsable ? 'spurR' : 'spurP')?.indexB ?? null;
  const mainName = mode === 'voll' ? 'Entwicklungsmenge' : rUsable ? 'Spur R' : 'Spur P';
  const idxTxt = main?.value != null ? `Fortschrittsindex ${mainName} ${pct(main.value, 2)}${main.ci95 ? ` (95 %: ${pct(main.ci95[0], 2)} … ${pct(main.ci95[1], 2)})` : ''}` : `kein Fortschrittsindex (${mainName} ohne Fälle)`;
  const sentence = mode === 'voll'
    ? `${cand.name} — Volltest auf der Entwicklungsmenge gegen ${champ.name}: ${idxTxt}; Hinweise G2 ${gates.G2.status}, G3 ${gates.G3.status}, G4 ${gates.G4.status}. Keine Entscheidung.`
    : `${cand.name} — ${label}: ${label === 'abgelehnt' ? `Gate ${['G1', 'G2', 'G3', 'G4'].filter((g) => gates[g].status === 'rot').join(', ')} rot` : label === 'Champion' ? 'Fortschritt gegen den Champion nachgewiesen' : same ? 'der Kandidat ist der Champion selbst — kein Fortschritt' : 'ein Fortschritt gegen den Champion ist nicht nachweisbar'}; ${idxTxt}; G1 ${gates.G1.status}, G2 ${gates.G2.status}, G3 ${gates.G3.status}, G4 ${gates.G4.status}.`;
  const ranking = Object.fromEntries(Object.entries(sets).filter(([, s]) => s.issues).map(([k, s]) => [k, rankingOf(s, [...versions, ...refs.filter((x) => x !== 'ref-klima')])]));
  const scores = { schema: 1, kind: 'pruefstand/scores', title: `${cand.name}, ${mode === 'voll' ? 'Volltest' : 'Abnahme'}`, mode, protocol: { id: proto.id, hash: proto.hash }, truth: { stand: proto.truth.stand, hash: w1.hash }, windows: proto.windows.map((w) => w.id), candidate: describe(cand), champion: describe(champ), versions, references: refs, verdict: { label, sentence }, gates, warnings, selfcheck: self, sets, ranking, notes: NOTES };
  const out = writeRun(p(AUDIT, 'berichte', cand.id, `${today}-${mode}`), scores);
  if (mode === 'abnahme') {
    const key = rUsable && sets.spurR?.issues ? 'spurR' : 'spurP';
    const rl = p(AUDIT, 'rangliste.json'), old = existsSync(rl) ? readJson(rl) : { schema: 1, kind: 'pruefstand/rangliste', entries: [] };
    const entries = old.entries.filter((e) => e.protocol !== proto.hash || !ranking[key]?.some((x) => x.id === e.id));
    for (const x of (ranking[key] ?? []).filter((y) => !y.id.startsWith('test-'))) entries.push({ id: x.id, name: x.name, guete: x.value, ci95: x.ci95, days: x.days, cells: x.cells, set: key, protocol: proto.hash, truth: w1.hash, abnahme: today, by: cand.id });
    entries.sort((a, b) => b.guete - a.guete);
    writeJson(rl, { schema: 1, kind: 'pruefstand/rangliste', note: 'Güteindex gegen die lokale Klimatologie an Rolle B; nur der Modus abnahme schreibt.', updated: today, entries });
  }
  // ── the fixed console summary the skill reads
  const card = (pc(mode === 'voll' ? 'entwicklung' : rUsable ? 'spurR' : 'spurP')?.cardB ?? []).filter((c) => c.kern && c.land !== 'alle' && c.skill != null).sort((a, b) => b.skill - a.skill);
  const cellTxt = (c) => `${c.var} ${c.window} h ${c.land} ${pct(c.skill)}${c.test ? ((c.test.pBetterBH ?? 1) < 0.05 || (c.test.pWorseBH ?? 1) < 0.05 ? ' **' : c.test.pTwoSided < 0.05 ? ' *' : ' (n. s.)') : ' (zu wenige Tage)'}`;
  const prod = productCount(sets[mode === 'voll' ? 'entwicklung' : rUsable ? 'spurR' : 'spurP'] ?? { pairs: {} }, cand.id, proto.windows.map((w) => w.id));
  say(`\n${sentence}`);
  say(`Mengen: ${Object.values(sets).map((s) => `${s.label} ${s.issues} Tage`).join(' · ')}`);
  say(`Fortschrittsindex gegen ${champ.name}: ${main?.value != null ? `${pct(main.value, 2)}${main.ci95 ? ` (95 %: ${pct(main.ci95[0], 2)} … ${pct(main.ci95[1], 2)})` : ''}, Nachweisgrenze ${main.mde != null ? `${(main.mde * 100).toFixed(1).replace('.', ',')} %` : '–'}` : '–'}`);
  say(`Gates: G1 ${gates.G1.status} · G2 ${gates.G2.status} · G3 ${gates.G3.status} · G4 ${gates.G4.status}`);
  if (card.length) { say(`Beste Kernzellen: ${card.slice(0, 3).map(cellTxt).join(' · ')}`); say(`Schlechteste Kernzellen: ${card.slice(-3).reverse().map(cellTxt).join(' · ')}`); }
  say(`Produktaussage: in ${prod.better} von ${prod.total} Kernzellen besser als jede Einzelquelle`);
  say(`Warnungen: ${warnings.length ? warnings.join(' | ') : 'keine'}`);
  say(`Bericht: ${out}`);
  if (gates.G4.status === 'rot') process.exitCode = 5;
}

// ── comparison ─────────────────────────────────────────────────────────────────────────────────────────────────────
async function runCompare() {
  const ids = String(args.versionen ?? '').split(',').filter(Boolean).map(normalizeId);
  if (ids.length < 2) fail(1, 'Vergleich: --versionen=fusion-a,fusion-b[,…] angeben');
  const regs = ids.map(loadRegister);
  const freeze = regs.map((x) => x.freeze).sort().at(-1);
  refreshTruth();
  const w1 = openW1(proto), all = issueSets(proto, freeze);
  const clean = !!args.tresor, rUsable = regs.every((x) => !x.tresor.contaminated);
  const plan = clean ? [['spurP', 'Spur P (Archiv nach dem jüngsten Freeze)', all.spurP, true], ...(rUsable ? [['spurR', 'Spur R (Hindcast-Tresor)', all.spurR, true]] : [])] : [['entwicklung', `Gemeinsame Entwicklungsmenge (Archiv bis ${freeze})`, all.entwicklung, false]];
  if (clean) logAccess(`vergleich --tresor\t${ids.join(',')}\tSpur P ${all.spurP.length} Tage, Spur R ${rUsable ? all.spurR.length : 0} Ausgaben`);
  const modelIds = [...new Set([...ids, ...REF_IDS])];
  const pairs = [];
  for (const a of ids) for (const b of ids) if (a !== b) pairs.push([a, b]);
  for (const v of modelIds) pairs.push([v, 'ref-klima']);
  const sets = {}, matrix = {}, ranking = {};
  for (const [key, label, issues, ripeOnly] of plan) {
    if (!issues.length) { sets[key] = { label, issues: 0, days: [], ripeOnly, models: {}, pairs: {}, special: {}, why: 'keine Ausgabetage' }; continue; }
    say(`Konserven ${key}: ${issues.length} Ausgaben × ${modelIds.length} Modelle`);
    try { await fillConserves(proto, modelIds, issues, say); } catch (e) { fail(4, `STOPP: ${e.message}`); }
    const res = scoreSet(proto, w1, issues, modelIds, pairs, { ripeOnly });
    sets[key] = { label, ripeOnly, ...summarizeSet(proto, res, {}) };
    if (!clean) sets[key].note = 'Keine saubere Prüfmenge: Die neueren Versionen haben diese Tage in Entwicklung oder Fit gesehen, die älteren nur zum Teil. Sauber ist der Vergleich nur mit --tresor (Spur P und Spur R, wird protokolliert).';
    matrix[key] = Object.fromEntries(ids.flatMap((a) => ids.filter((b) => b !== a).map((b) => [`${a}|${b}`, indexOfPair(proto, res.pairs.get(`${a}|${b}`), 1)])));
    ranking[key] = rankingOf(sets[key], modelIds.filter((x) => x !== 'ref-klima'));
    for (const k of Object.keys(sets[key].pairs)) if (!k.endsWith('|ref-klima')) delete sets[key].pairs[k];
  }
  const firstKey = Object.keys(ranking)[0];
  const sentence = `Vergleich ${ids.join(', ')} auf ${plan.map(([k, l]) => `${l}: ${sets[k].issues} Tage`).join(' · ')}${firstKey ? ` — Güteindex: ${ranking[firstKey].filter((x) => ids.includes(x.id)).map((x) => `${x.id} ${pct(x.value)}`).join(', ')}` : ''}. Der Vergleich entscheidet nichts.`;
  const scores = { schema: 1, kind: 'pruefstand/scores', title: `Vergleich ${ids.join(', ')}`, mode: clean ? 'vergleich (saubere Mengen)' : 'vergleich (Entwicklungsmenge)', protocol: { id: proto.id, hash: proto.hash }, truth: { stand: proto.truth.stand, hash: w1.hash }, windows: proto.windows.map((w) => w.id), candidate: null, champion: null, versions: ids, references: REF_IDS, verdict: { label: 'Vergleich', sentence }, gates: null, warnings: [], selfcheck: null, sets, ranking, matrix, notes: NOTES };
  const out = writeRun(p(AUDIT, 'vergleiche', `${today}${clean ? '-sauber' : ''}`), scores);
  say(`\n${sentence}`);
  for (const [k, list] of Object.entries(ranking)) say(`${sets[k].label}: ${list.map((x) => `${x.id} ${pct(x.value)}${x.ci95 ? ` (${pct(x.ci95[0])} … ${pct(x.ci95[1])})` : ''}`).join(' · ')}`);
  for (const [k, m] of Object.entries(matrix)) for (let i = 1; i < ids.length; i++) { const x = m[`${ids[i]}|${ids[i - 1]}`]; say(`${sets[k].label}: ${ids[i]} gegen ${ids[i - 1]} ${pct(x?.value, 2)}${x?.ci95 ? ` (95 %: ${pct(x.ci95[0], 2)} … ${pct(x.ci95[1], 2)})` : ''}${x?.test ? (x.test.pBetter < 0.05 ? ' — signifikant besser' : x.test.pWorse < 0.05 ? ' — signifikant schlechter' : ' — nicht nachweisbar') : ''}`); }
  say(`Bericht: ${out}`);
}

try {
  if (args.registriere) await registerNew(String(args.registriere));
  else if (args.modus === 'status') status();
  else if (args.modus === 'vergleich') await runCompare();
  else if (args.kandidat && ['schnell', 'voll', 'abnahme'].includes(String(args.modus))) await runCandidate(String(args.kandidat), String(args.modus));
  else fail(1, readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
} catch (e) {
  fail(/Adapter-Vertrag|Replay/.test(String(e?.message)) ? 4 : 1, `STOPP: ${e?.stack ?? e}`);
}
