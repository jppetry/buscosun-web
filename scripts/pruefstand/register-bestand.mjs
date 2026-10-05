#!/usr/bin/env node
/**
 * register-bestand.mjs — writes the register entries of the EXISTING versions 5e, 6, 7, 8, 9 once (plan PS-2-1/PS-2-8).
 * Commits, tables, fit windows and "the last archive day the decision saw" are the findings of D-PS-7
 * (`audit/pruefstand-plan.md` §14.7); options are those of the stage at each stand (CLAUDE.md „Bezeichnung buscosun
 * Fusion <n>“). New versions are registered with `run.mjs --registriere=<id>`.
 */
import { DATA_REPO, HINDCAST_ROOT, p } from './lib/common.mjs';
import { loadProtocol } from './lib/protokoll.mjs';
import { writeRegister } from './lib/register.mjs';

const proto = loadProtocol();
const AX12 = p(HINDCAST_ROOT, 'publish/2026-09-30-ax12');
const T6 = { learned: p(AX12, 'fusion.client.json'), stack: p(AX12, 'stack.client.json'), clima: p(DATA_REPO, 'point/static/clima/v1/stations.json'), loso: p(HINDCAST_ROOT, 'fit/2026-09-27-fx5e/fusion.hindcast.json') };
const FIT_LEARNED = { source: 'hindcast', from: '2025-09-01', to: '2026-09-21', what: 'Lernstufe Fit 5e (40,8 Mio. Zeilen, 389 Punkte)' };
const FIT_STACK = { source: 'archive', from: '2026-09-14', to: '2026-09-28', what: 'Stationswert mit Landesparametern (14 Ausgabetage)' };
const BASE6 = { learned: true, learnedSpeed: true, learnedPrecip: true, learnedAtPoint: true, learnedClouds: true, priorShrink: false, stationValue: true, anomalyInterp: true };
const SEEN = 'Alle 389 Archivstationen waren im Fit (D-PS-9); Rolle B ist im Replay maskiert, nicht „nie gesehen“.';

const out = [];
out.push(writeRegister(proto, {
  id: 'fusion-5e', name: 'buscosun Fusion 5e', order: 5, status: 'historisch', commit: '56066ae',
  options: { learned: true, learnedSpeed: true, learnedPrecip: true }, clima: 'loso',
  tables: { learned: p(HINDCAST_ROOT, 'fit/2026-09-27-fx5e/fusion.hindcast.json') },
  freeze: '2026-09-26', freezeNote: 'Kette der Validierung FV; die Entscheidung sah das Archiv bis 26.09. (D-PS-7)', fit: { learned: FIT_LEARNED },
  notes: [SEEN, 'Klimatologie am Punkt: Leave-Station-out-Schätzung aus der Fit-Tabelle (wie die Messläufe der Phase FV)', 'Tabelle nur lokal (kein Git): buscosun-hindcast/fit/2026-09-27-fx5e'],
}));
const stage = [
  ['fusion-6', 'buscosun Fusion 6', 6, 'a02f2b5', {}, '2026-09-28', 'Daten-Repo 1aaec969; die Entscheidung sah das Archiv bis 28.09.'],
  ['fusion-7', 'buscosun Fusion 7', 7, '751bee2', { anchorWindKm: 10 }, '2026-09-30', 'Wind-Anker 10 km (E-AX-14); die Entscheidung sah das Archiv bis 30.09.'],
  ['fusion-8', 'buscosun Fusion 8', 8, '07cc7cf', { anchorWindKm: 10, nowcastHourMean: true }, '2026-10-01', 'Radar-Stundenmittel (E-AX-17); die Entscheidung sah das Archiv bis 01.10.'],
  ['fusion-9', 'buscosun Fusion 9', 9, '0ad0615', { anchorWindKm: 10, nowcastHourMean: true, anchorAtObsTime: true }, '2026-10-04', 'Anker am Messzeitpunkt (V-AW-33), Festlegung 04.10.; nicht am Archiv gemessen — Freeze = Tag der Festlegung (Setzung)'],
];
for (const [id, name, order, commit, add, freeze, freezeNote] of stage) {
  out.push(writeRegister(proto, {
    id, name, order, status: id === 'fusion-9' ? 'champion' : 'historisch', commit,
    options: { ...BASE6, ...add }, clima: 'product', climaHeldOut: 'loso', tables: T6, freeze, freezeNote, fit: { learned: FIT_LEARNED, stack: FIT_STACK },
    notes: [SEEN, 'Tabellen des Daten-Repo-Commits 1aaec969 (fusion.client.json, stack.client.json, static/clima/v1)', 'Klimatologie an Rolle B: Leave-Station-out-Schätzung aus der Fit-Tabelle 5e (das veröffentlichte Produkt enthält die Station selbst)', ...(id === 'fusion-9' ? ['Champion laut E-PS-14 (Jan 05.10.2026)'] : [])],
  }));
}
for (const r of out) console.log(r.id, r.commit.slice(0, 7), r.modelHash.slice(0, 12), 'Tresor kontaminiert:', r.tresor.contaminated, Object.values(r.tables).filter(Boolean).map((t) => t.file).join(' '));
