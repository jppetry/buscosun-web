/**
 * diag-fv0.mjs — stage 0 of phase FV (`audit/fusion-validierung.md` §1): re-measure the facts about the archive
 * (`C:\dev\buscosun-archiv`, read only) before any evaluation is built on them.
 *
 * Per slot: schema, slotAt, codeHash, points, cube runs and their age at the slot, lead axes, the MOSMIX-L station
 * product (run, age, mapped planes, units, station-to-point distance, plan decision), the live path (fetch time
 * relative to the slot, hours, fusion block), the nowcast sources, the truth window and networks. Across slots: the
 * truth join (dedupe by point and stamp, the 23-UTC hour twice), the lead coverage matrix issue day × lead bin ×
 * country on the product's native axis (t1 over t2 over t3, lead from the slot's hour floor), and the overlap of the
 * issue days with the fit months of the hindcast (ends 2026-09-21) and their half-month fold keys.
 *
 * Truth network per point = the hindcast's (measured on `truth\2026-09-20.json.gz`: DE cdc 203, AT tawes 84,
 * CH+LI smn 102): DE → `poi` (stands for CDC, V5), AT → `tawes`, CH/LI → `smn`; POI records of AT/CH points are NOT
 * used (the hindcast never scored them). Gust = `fxh` (hour maximum, schema ≥ 2; schema 1 carries only the 10-min
 * peak `fx` for TAWES/SMN ⇒ counted, not used), precipitation = POI `rr1` / TAWES+SMN `rr1h`.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-validierung/diag-fv0.mjs
 *       [--archive=C:/dev/buscosun-archiv] [--features=C:/dev/buscosun-hindcast/features/points.v1.json]
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { parseArgs } from 'file:///C:/dev/buscosun-web/scripts/hindcast/lib/common.mjs';
import { binIndex, halfMonthOf } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/strata.ts';

const flags = parseArgs(process.argv.slice(2));
const ARCH = typeof flags.archive === 'string' ? flags.archive : 'C:/dev/buscosun-archiv';
const FEAT = typeof flags.features === 'string' ? flags.features : 'C:/dev/buscosun-hindcast/features/points.v1.json';
const OUT = 'C:/dev/buscosun-web/audit/fusion-validierung/diag-fv0';
const H = 3_600_000, SENT = -32768;
const HINDCAST_END_MS = Date.UTC(2026, 8, 21, 23, 0);   // last truth hour of the hindcast (truth\2026-09-21)
const say = (s) => console.log(`[fv0] ${s}`);

const feat = JSON.parse(readFileSync(FEAT, 'utf8'));
const DACH = new Set(['DE', 'AT', 'CH', 'LI']);
const countryOf = (id) => feat.byPoint[id]?.country ?? null;
const netOf = (country) => (country === 'DE' ? 'poi' : country === 'AT' ? 'tawes' : country === 'CH' || country === 'LI' ? 'smn' : null);

const slots = [];
for (const d of readdirSync(ARCH).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) {
  for (const f of readdirSync(join(ARCH, d)).filter((x) => /^\d{4}\.json\.gz$/.test(x)).sort()) slots.push(join(ARCH, d, f));
}
say(`${slots.length} Slots unter ${ARCH}`);

const pct = (arr, q) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]; };
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const dec = (q, sc) => (q == null || q === SENT ? null : q * sc.scale + sc.offset);

// ── pass 1: per slot ─────────────────────────────────────────────────────────
const perSlot = [];
const truth = new Map();        // `${id}|${ms}` → { v: {t,td,ff,dd,fxh,rr,n}, slot, net }
const dup = { pairs: 0, mismatch: 0, examples: [] };
const axes = [];                // per slot: { slotAtMs, floorMs, steps: [{ validAtMs, tier }], pointsByTier: {t1:Set,...} }
for (const path of slots) {
  const s = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8'));
  const slotAtMs = s.slotAtMs, floorMs = Math.floor(slotAtMs / H) * H;
  const rec = { file: path.slice(ARCH.length + 1).replace(/\\/g, '/'), schema: s.schema, slotAt: s.slotAt, codeHash: s.codeHash, createdAt: s.createdAt, finishedAt: s.finishedAt ?? null, points: s.points.length };
  // country as the slot names it vs the feature table (schema-1 slots carried a wrong country for some neighbours)
  rec.countryMismatch = s.points.filter((p) => countryOf(p.id) != null && p.country !== countryOf(p.id)).map((p) => `${p.id} ${p.country}≠${countryOf(p.id)}`).slice(0, 8);
  rec.countryMismatchN = s.points.filter((p) => countryOf(p.id) != null && p.country !== countryOf(p.id)).length;
  rec.dach = s.points.filter((p) => DACH.has(countryOf(p.id))).length;
  // cube tiers
  rec.cube = {};
  const ax = { slotAtMs, floorMs, steps: [], pointsByTier: {} };
  for (const t of ['t1', 't2', 't3']) {
    const c = s.cube?.[t];
    if (!c) { rec.cube[t] = null; continue; }
    const runAtMs = Date.parse(c.runAt);
    const leads = c.leadHours ?? [];
    const bp = c.byPoint ?? {};
    const withPt = Object.entries(bp).filter(([, v]) => v).map(([k]) => k);
    ax.pointsByTier[t] = new Set(withPt);
    rec.cube[t] = { run: c.run, sourceRun: c.sourceRun, ageAtSlotH: c.ageAtSlotH ?? round((slotAtMs - Date.parse(c.sourceRunAt ?? c.runAt)) / H), ageFieldSchema1: c.ageH ?? null, leads: leads.length ? `${leads[0]}…${leads[leads.length - 1]} (${leads.length})` : null, sources: (c.sources ?? []).map((x) => x.id), points: withPt.length, block: withPt.some((id) => bp[id].block) };
    for (const L of leads) ax.steps.push({ validAtMs: runAtMs + L * H, tier: t });
  }
  // native axis: finer tier wins at the same valid time (±30 min), window floor … floor + 336 h
  const taken = [];
  for (const t of ['t1', 't2', 't3']) for (const st of ax.steps.filter((x) => x.tier === t)) {
    if (st.validAtMs <= floorMs || st.validAtMs > floorMs + 336 * H) continue;
    if (taken.some((x) => Math.abs(x.validAtMs - st.validAtMs) <= 30 * 60_000)) continue;
    taken.push(st);
  }
  ax.steps = taken.sort((a, b) => a.validAtMs - b.validAtMs);
  axes.push(ax);
  rec.axis = { steps: ax.steps.length, perTier: Object.fromEntries(['t1', 't2', 't3'].map((t) => [t, ax.steps.filter((x) => x.tier === t).length])), firstLeadH: ax.steps.length ? (ax.steps[0].validAtMs - floorMs) / H : null, lastLeadH: ax.steps.length ? (ax.steps[ax.steps.length - 1].validAtMs - floorMs) / H : null, perTierLeadRange: Object.fromEntries(['t1', 't2', 't3'].map((t) => { const x = ax.steps.filter((y) => y.tier === t); return [t, x.length ? `${(x[0].validAtMs - floorMs) / H}…${(x[x.length - 1].validAtMs - floorMs) / H}` : null]; })) };
  // station product (MOSMIX-L)
  const st = s.stations;
  if (st) {
    const byP = st.byPoint ?? {};
    const ids = Object.keys(byP).filter((k) => byP[k]);
    const dist = [], dEl = [], planesAll = new Map();
    let accepted = 0, rejected = 0, candDiff = 0, withNearest = 0, noStation = 0;
    for (const id of ids) {
      const b = byP[id];
      if (!b.station) { noStation += 1; continue; }
      if (DACH.has(countryOf(id))) { dist.push(b.station.distanceKm); if (b.station.dElevM != null) dEl.push(Math.abs(b.station.dElevM)); }
      for (const p of Object.keys(b.planes ?? {})) planesAll.set(p, (planesAll.get(p) ?? 0) + 1);
      if (b.nearest) withNearest += 1;
      const pl = s.plan?.byPoint?.[id]?.station;
      if (pl) { if (pl.accepted) accepted += 1; else rejected += 1; if (pl.candidate && pl.candidate.id !== b.station.id) candDiff += 1; }
    }
    rec.stations = {
      run: st.run, runAt: st.runAt, ageAtSlotH: st.ageAtSlotH ?? st.ageH ?? null, leads: st.leadHours ? `${st.leadHours[0]}…${st.leadHours[st.leadHours.length - 1]} (${st.leadHours.length})` : null,
      points: ids.length, noStation, planes: Object.fromEntries([...planesAll.entries()].sort()), mapped: st.mapped ?? null,
      units: Object.fromEntries(['t2m', 'td2m', 'u10', 'v10', 'gust', 'precip', 'clct'].map((k) => [k, st.scales?.[k] ? `${st.scales[k].unit} ×${st.scales[k].scale}` : null])),
      distKmDach: { p50: round(pct(dist, 0.5)), p90: round(pct(dist, 0.9)), max: round(Math.max(...dist)), gt5: dist.filter((d) => d > 5).length, n: dist.length },
      dElevAbsDach: { p50: pct(dEl, 0.5), p90: pct(dEl, 0.9), max: Math.max(...dEl), gt100: dEl.filter((d) => d > 100).length },
      plan: { accepted, rejected, candidateNotCatalog: candDiff, withNearest },
    };
  } else rec.stations = null;
  // live path
  const lb = s.live?.byPoint ?? {};
  const fetched = Object.values(lb).map((v) => v?.fetchedAtMs).filter(Number.isFinite);
  const ns = Object.values(lb).map((v) => v?.n).filter(Number.isFinite);
  const withFusion = Object.values(lb).filter((v) => v?.fusion).length;
  const t0 = Object.values(lb).map((v) => v?.t0Ms).filter(Number.isFinite);
  rec.live = { points: Object.keys(lb).length, errors: Object.values(lb).filter((v) => v?.error).length, fetchedMinAfterSlotMin: fetched.length ? round((Math.min(...fetched) - slotAtMs) / 60000, 1) : null, fetchedMaxAfterSlotMin: fetched.length ? round((Math.max(...fetched) - slotAtMs) / 60000, 1) : null, hours: ns.length ? `${Math.min(...ns)}…${Math.max(...ns)}` : null, withFusion, fusionForm: Object.values(lb).find((v) => v?.fusion) ? (Array.isArray(Object.values(lb).find((v) => v?.fusion).fusion) ? 'rows (schema ≤ 2)' : 'columns (schema 3)') : null, t0MinusSlotFloorH: t0.length ? [...new Set(t0.map((x) => (x - floorMs) / H))].sort((a, b) => a - b) : null, fields: Object.keys(Object.values(lb).find((v) => v?.fields)?.fields ?? {}), asOf: s.live?.asOf ? 'present' : 'absent' };
  // nowcast
  rec.nowcast = s.nowcast?.slots ? Object.fromEntries(Object.entries(s.nowcast.slots).map(([k, v]) => [k, v ? `${v.stamp} (${v.ageMin} min)` : null])) : Object.keys(s.nowcast ?? {});
  // truth
  const tw = s.truth?.window ?? null;
  rec.truth = { windowH: s.truth?.windowH ?? null, from: tw ? new Date(tw.fromMs).toISOString() : null, to: tw ? new Date(tw.toMs).toISOString() : null, networks: {}, columns: {} };
  const sc = s.scales?.truth ?? {};
  for (const [id, byNet] of Object.entries(s.truth?.byPoint ?? {})) {
    const c = countryOf(id);
    if (!DACH.has(c)) continue;
    for (const net of ['poi', 'tawes', 'smn']) {
      const r = byNet?.[net];
      if (!r?.obsAtMs?.length) continue;
      const key = `${c}:${net}`;
      rec.truth.networks[key] = (rec.truth.networks[key] ?? 0) + 1;
      for (const col of ['t', 'td', 'ff', 'dd', 'fx', 'fxh', 'rr1', 'rr1h', 'n']) {
        const arr = r[col]; const ok = arr ? arr.filter((q) => q != null && q !== SENT).length : 0;
        const ck = `${net}.${col}`; const o = rec.truth.columns[ck] ?? (rec.truth.columns[ck] = { present: 0, values: 0, hours: 0 });
        o.present += arr ? 1 : 0; o.values += ok; o.hours += r.obsAtMs.length;
      }
    }
    // the network the evaluation uses (the hindcast's)
    const net = netOf(c), r = byNet?.[net];
    if (!r?.obsAtMs?.length) continue;
    const g = (col, i) => (r[col] ? dec(r[col][i], sc[col] ?? { scale: 1, offset: 0 }) : null);
    for (let i = 0; i < r.obsAtMs.length; i++) {
      const ms = r.obsAtMs[i];
      const v = { t: g('t', i), td: g('td', i), ff: g('ff', i), dd: g('dd', i), fxh: s.schema >= 2 || net === 'poi' ? (g('fxh', i) ?? (net === 'poi' ? g('fx', i) : null)) : null, rr: net === 'poi' ? g('rr1', i) : g('rr1h', i), n: net === 'poi' ? g('n', i) : null };
      const k = `${id}|${ms}`;
      const prev = truth.get(k);
      if (prev) {
        dup.pairs += 1;
        const diff = Object.keys(v).filter((x) => prev.v[x] != null && v[x] != null && Math.abs(prev.v[x] - v[x]) > 1e-9);
        if (diff.length) { dup.mismatch += 1; if (dup.examples.length < 10) dup.examples.push(`${id} ${new Date(ms).toISOString()} ${diff.map((x) => `${x} ${prev.v[x]}→${v[x]}`).join(' ')} (${prev.slot} / ${rec.file})`); }
        // fill gaps of the first record from the second (never overwrite)
        for (const x of Object.keys(v)) if (prev.v[x] == null && v[x] != null) prev.v[x] = v[x];
        continue;
      }
      truth.set(k, { v, slot: rec.file, net });
    }
  }
  rec.issueDay = new Date(slotAtMs).toISOString().slice(0, 10);
  rec.halfKey = halfMonthOf(slotAtMs);
  rec.insideHindcast = slotAtMs <= HINDCAST_END_MS;
  perSlot.push(rec);
  say(`${rec.file} schema ${rec.schema} · ${rec.points} Punkte · t1 ${rec.cube.t1?.run} (${rec.cube.t1?.ageAtSlotH} h) t2 ${rec.cube.t2?.run} (${rec.cube.t2?.ageAtSlotH} h) t3 ${rec.cube.t3?.run} (${rec.cube.t3?.ageAtSlotH} h) · Stationen ${rec.stations?.run} (${rec.stations?.ageAtSlotH} h) · live +${rec.live.fetchedMinAfterSlotMin}…+${rec.live.fetchedMaxAfterSlotMin} min`);
}

// ── pass 2: coverage matrix issue day × lead bin × country (native axis, truth per variable) ──
const BIN_LABEL = ['0–6', '7–24', '25–48', '51–120', '126–240', '246–336'];
const VARS = ['t', 'td', 'ff', 'fxh', 'rr', 'n'];
const cov = {};    // `${day}|${bin}|${country}` → { rows (native steps with a cube point), truth: {var: n} }
const leadHist = {};
for (let si = 0; si < axes.length; si++) {
  const ax = axes[si], day = perSlot[si].issueDay;
  for (const id of Object.keys(feat.byPoint)) {
    const c = countryOf(id);
    if (!DACH.has(c)) continue;
    const cc = c === 'LI' ? 'CH' : c;
    for (const st of ax.steps) {
      if (!ax.pointsByTier[st.tier]?.has(id)) continue;
      const lead = (st.validAtMs - ax.floorMs) / H;
      if (lead < 1) continue;
      const bin = binIndex(lead);
      const k = `${day}|${bin}|${cc}`;
      const o = cov[k] ?? (cov[k] = { rows: 0, truth: Object.fromEntries(VARS.map((v) => [v, 0])) });
      o.rows += 1;
      const tr = truth.get(`${id}|${st.validAtMs}`);
      if (tr) for (const v of VARS) if (tr.v[v] != null) o.truth[v] += 1;
      if (tr?.v.t != null) leadHist[bin] = (leadHist[bin] ?? 0) + 1;
    }
  }
}
const days = [...new Set(perSlot.map((r) => r.issueDay))];
const truthEnd = Math.max(...[...truth.keys()].map((k) => Number(k.split('|')[1])));
const out = { builtAt: new Date().toISOString(), archive: ARCH, slots: perSlot, truth: { pairs: truth.size, lastHour: new Date(truthEnd).toISOString(), dedupe: dup, networkRule: 'DE poi · AT tawes · CH/LI smn (= hindcast cdc/tawes/smn)' }, coverage: cov, leadHistT: leadHist };
writeFileSync(`${OUT}.json`, JSON.stringify(out, null, 1));

// ── markdown ─────────────────────────────────────────────────────────────────
const md = [`# Diagnose FV-0 — Archiv ${ARCH} (${perSlot.length} Slots), ${out.builtAt.slice(0, 16)} UTC`, ''];
md.push('## Slots', '', '| Slot | Schema | Punkte (DACH) | codeHash | t1 Lauf (Alter h) | t2 | t3 | Achse t1/t2/t3 · Vorlauf ab Stundenboden | MOSMIX-L Lauf (Alter h) | live +min | live Stunden | Fusion | Wahrheit | Hindcast | Halbmonat |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of perSlot) {
  const cu = (t) => (r.cube[t] ? `${r.cube[t].run} (${r.cube[t].ageAtSlotH})` : '—');
  md.push(`| ${r.file} | ${r.schema} | ${r.points} (${r.dach}) | ${r.codeHash} | ${cu('t1')} | ${cu('t2')} | ${cu('t3')} | ${r.axis.perTier.t1}/${r.axis.perTier.t2}/${r.axis.perTier.t3} · ${Object.entries(r.axis.perTierLeadRange).map(([t, x]) => `${t} ${x ?? '—'}`).join(', ')} | ${r.stations ? `${r.stations.run} (${r.stations.ageAtSlotH})` : '—'} | ${r.live.fetchedMinAfterSlotMin}…${r.live.fetchedMaxAfterSlotMin} | ${r.live.hours} | ${r.live.withFusion} ${r.live.fusionForm ?? ''} | ${r.truth.from?.slice(5, 16)}…${r.truth.to?.slice(5, 16)} (${r.truth.windowH ?? '—'} h) | ${r.insideHindcast ? 'ja' : 'nein'} | ${r.halfKey} |`);
}
md.push('', '## MOSMIX-L (Stationsprodukt) je Slot', '', '| Slot | Punkte | Ebenen belegt (Punkte) | Einheiten | Abstand DACH p50/p90/max km (> 5 km) | \\|Δh\\| p50/p90/max m (> 100) | Plan: angenommen/abgelehnt, Kandidat ≠ Katalog |', '|---|---|---|---|---|---|---|');
for (const r of perSlot) {
  const s = r.stations; if (!s) { md.push(`| ${r.file} | — | | | | | |`); continue; }
  md.push(`| ${r.file} | ${s.points} | ${Object.entries(s.planes).map(([k, n]) => `${k} ${n}`).join(', ')} | ${Object.entries(s.units).map(([k, u]) => `${k} ${u}`).join(', ')} | ${s.distKmDach.p50}/${s.distKmDach.p90}/${s.distKmDach.max} (${s.distKmDach.gt5}) | ${s.dElevAbsDach.p50}/${s.dElevAbsDach.p90}/${s.dElevAbsDach.max} (${s.dElevAbsDach.gt100}) | ${s.plan.accepted}/${s.plan.rejected}, ${s.plan.candidateNotCatalog} |`);
}
md.push('', '## Wahrheit je Slot (DACH, Netze und Spalten)', '', '| Slot | Netze (Punkte) | fxh-Werte / fx-Werte TAWES | rr1h-Werte TAWES/SMN | Länderabweichung Slot ↔ Merkmalstabelle |', '|---|---|---|---|---|');
for (const r of perSlot) {
  const c = r.truth.columns;
  md.push(`| ${r.file} | ${Object.entries(r.truth.networks).map(([k, n]) => `${k} ${n}`).join(', ')} | ${c['tawes.fxh']?.values ?? 0} / ${c['tawes.fx']?.values ?? 0} | ${c['tawes.rr1h']?.values ?? 0} / ${c['smn.rr1h']?.values ?? 0} | ${r.countryMismatchN}${r.countryMismatchN ? ` (${r.countryMismatch.join(', ')})` : ''} |`);
}
md.push('', `Wahrheit nach Deduplikation: ${truth.size} (Punkt, Stunde)-Paare, letzte Stunde ${out.truth.lastHour}; doppelte Stunden ${dup.pairs}, davon mit abweichendem Wert ${dup.mismatch}${dup.examples.length ? ` — ${dup.examples.join('; ')}` : ''}. Regel: ${out.truth.networkRule}.`, '');
md.push('## Abdeckung Ausgabetag × Vorlauf-Bin × Land (native Schritte mit Cube-Punkt / davon mit Wahrheit T)', '', `| Ausgabetag | ${BIN_LABEL.map((b) => `${b} h DE · AT · CH`).join(' | ')} |`, `|---|${BIN_LABEL.map(() => '---').join('|')}|`);
for (const d of days) {
  const cells = BIN_LABEL.map((_, b) => ['DE', 'AT', 'CH'].map((c) => { const o = cov[`${d}|${b}|${c}`]; return o ? `${o.truth.t}/${o.rows}` : '—'; }).join(' · '));
  md.push(`| ${d} | ${cells.join(' | ')} |`);
}
md.push('', `Zeilen mit Wahrheit T je Bin (alle Tage): ${BIN_LABEL.map((b, i) => `${b} h ${leadHist[i] ?? 0}`).join(' · ')}; Ausgabetage je Bin mit ≥ 1 Wahrheitszeile: ${BIN_LABEL.map((b, i) => `${b} h ${days.filter((d) => ['DE', 'AT', 'CH'].some((c) => (cov[`${d}|${i}|${c}`]?.truth.t ?? 0) > 0)).length}`).join(' · ')}.`, '');
md.push('Je Größe (alle Tage, alle Bins, DACH): ' + VARS.map((v) => `${v} ${Object.values(cov).reduce((a, o) => a + o.truth[v], 0)}`).join(' · ') + ` von ${Object.values(cov).reduce((a, o) => a + o.rows, 0)} nativen Schritten.`, '');
writeFileSync(`${OUT}.md`, md.join('\n'));
say(`geschrieben ${OUT}.{json,md}: Wahrheit ${truth.size} Paare (Dubletten ${dup.pairs}, abweichend ${dup.mismatch}), letzte Stunde ${out.truth.lastHour}`);
