#!/usr/bin/env node
/**
 * AW-6.1 — live check of the route forecast from OUTSIDE (CDN, like a browser): pointer, every file of the run through
 * the client's reader and checks, and the forecast at the station points against the measured air temperature and dew
 * point of the newest road-weather slot (`road/v1/obs`). Read-only.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/road-fc-check.mjs [--files=all|N] [--now=<iso>]
 *
 * Exit 0 = pointer readable, run live, sampled files valid · 1 otherwise. The comparison with the measurement is a
 * report, not a gate (no anchor in the producer: the first hours carry the model's bias).
 */
import { pathToFileURL } from 'node:url';
import { ROAD_FC_RAW_BASE, ROAD_FC_POINTS_PATH, roadFcDecode, roadFcFreshness, roadFcPickRun, parseRoadFcPoints } from '../../src/road/roadFc.ts';
import { loadRoadFcIndex, loadRoadFc, loadRoadSlot } from '../../src/road/roadClient.ts';

const H = 3_600_000;

export async function checkRoadFc({ nowMs = Date.now(), files = 12, log = console.log } = {}) {
  const out = { ok: false, problems: [] };
  const index = await loadRoadFcIndex();
  if (!index) { out.problems.push('Zeiger nicht lesbar (raw.githubusercontent)'); return out; }
  const run = roadFcPickRun(index, nowMs);
  if (!run) { out.problems.push(index.killed ? 'Schalter aus' : 'kein Lauf im Zeiger'); return out; }
  const issued = Date.parse(run.issuedAt);
  out.run = run.run; out.runs = index.runs.map((r) => r.run); out.ageMin = Math.round((nowMs - issued) / 60_000);
  out.freshness = roadFcFreshness(issued, nowMs, index.killed);
  log(`Zeiger: ${index.runs.length} Läufe (${out.runs.join(', ')}) · gewählt ${run.run}, ${out.ageMin} min alt, ${out.freshness} · ${run.points} Punkte, ${run.failed} ohne Ergebnis · Cube ${JSON.stringify(run.engine?.runs ?? {})}`);
  if (out.freshness !== 'live') out.problems.push(`jüngster Lauf ${out.ageMin} min alt (${out.freshness})`);

  const res = await fetch(`${ROAD_FC_RAW_BASE}/${ROAD_FC_POINTS_PATH}`);
  const points = res.ok ? parseRoadFcPoints(await res.json()) : null;
  if (!points) { out.problems.push('Punktdatei nicht lesbar'); return out; }
  const corridors = [...new Set(points.points.filter((p) => p.corridor).map((p) => p.corridor))];
  const states = [...new Set(points.points.filter((p) => !p.corridor).map((p) => p.state))];
  let list = [...corridors.map((id) => ['corridor', id]), ...states.map((id) => ['state', id])];
  if (files !== 'all') { const step = list.length / Number(files); list = Array.from({ length: Number(files) }, (_, i) => list[Math.floor(i * step)]); }

  const byId = new Map();
  let read = 0, dropped = 0, bytesPts = 0;
  for (const [kind, id] of list) {
    const r = await loadRoadFc(kind, id, nowMs, undefined, index);
    if (r.reason !== 'ok') { out.problems.push(`${kind} ${id}: ${r.reason}`); continue; }
    read++; dropped += r.file.dropped; bytesPts += r.file.points.length;
    for (const p of r.file.points) byId.set(p.id, { p, t0Ms: r.file.t0Ms });
  }
  out.files = { asked: list.length, read, points: bytesPts, dropped };
  log(`Dateien über den Leser des Clients: ${read}/${list.length} gelesen, ${bytesPts} Punkte, ${dropped} von der Client-Prüfung verworfen`);
  if (files === 'all') {
    const missing = points.points.filter((p) => !byId.has(p.id)).length;
    out.files.missing = missing;
    log(`Punkte der Punktdatei ohne Prognose im Lauf: ${missing} von ${points.points.length}`);
    if (missing > 0.1 * points.points.length) out.problems.push(`${missing} Punkte ohne Prognose`);
  }

  // Forecast against the newest measured slot at the station points (air temperature, dew point).
  const slot = await loadRoadSlot(nowMs);
  if (slot.obs) {
    const dT = [], dTd = [];
    const leads = new Map();
    for (const o of slot.obs.points) {
      const f = byId.get(o.id);
      if (!f) continue;
      const i = Math.round((slot.obs.slotMs - f.t0Ms) / H);
      if (Math.abs(slot.obs.slotMs - (f.t0Ms + i * H)) > 15 * 60_000 || i < 0 || i >= f.p.v.t.length) continue;
      leads.set(i, (leads.get(i) ?? 0) + 1);
      const t = roadFcDecode('t', f.p.v.t[i]), td = roadFcDecode('td', f.p.v.td[i]);
      if (t != null && typeof o.ta === 'number') dT.push(t - o.ta);
      if (td != null && typeof o.td === 'number') dTd.push(td - o.td);
    }
    const stat = (a) => (a.length ? { n: a.length, bias: +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(2), mae: +(a.reduce((s, x) => s + Math.abs(x), 0) / a.length).toFixed(2), p90: +[...a].map(Math.abs).sort((x, y) => x - y)[Math.floor(0.9 * a.length)].toFixed(2) } : null);
    out.vsObs = { slot: slot.obs.slot, leadH: [...leads.keys()].sort((a, b) => a - b), air: stat(dT), dew: stat(dTd) };
    log(`gegen die Messung ${slot.obs.slot} (Vorlauf ${out.vsObs.leadH.join('/')} h): Luft ${JSON.stringify(out.vsObs.air)} · Taupunkt ${JSON.stringify(out.vsObs.dew)}`);
  } else log(`kein Mess-Slot lesbar (${slot.reason}) — ohne Vergleich`);
  out.ok = out.problems.length === 0 && read === list.length;
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const r = await checkRoadFc({ nowMs: arg('now') ? Date.parse(arg('now')) : Date.now(), files: arg('files') ?? 12 });
  for (const p of r.problems) console.log(`✗ ${p}`);
  console.log(r.ok ? 'road-fc: in Ordnung' : 'road-fc: NICHT in Ordnung');
  process.exit(r.ok ? 0 : 1);
}
