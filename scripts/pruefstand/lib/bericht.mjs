/**
 * bericht.mjs — the report of a Prüfstand run as ONE self-contained HTML file (plan PS-3-4, Konzept §13). Pure: scores
 * object in, string out; no clock, no random — the same scores give the same bytes. All numbers come from `scores`.
 */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (x, d = 1) => (x == null ? '–' : `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d).replace('.', ',')} %`);
const num = (x, d = 2) => (x == null ? '–' : x.toFixed(d).replace('.', ','));
const VAR_NAME = { t: 'Temperatur', td: 'Taupunkt', ws: 'Wind', gust: 'Böe', precip: 'Niederschlag (Menge)', wet: 'Niederschlag (nass)', clct: 'Bewölkung', dd: 'Windrichtung' };
const UNIT = { t: 'K', td: 'K', ws: 'm/s', gust: 'm/s', precip: 'mm/h', wet: 'Brier', clct: '%', dd: '°' };
const light = (s) => `<span class="lt ${s === 'grün' ? 'g' : s === 'rot' ? 'r' : 'n'}">${esc(s)}</span>`;
const skillClass = (c) => { if (!c || c.skill == null) return ''; const sig = c.test && (c.test.pBetterBH ?? c.test.pBetter) < 0.05 ? 'sb' : c.test && (c.test.pWorseBH ?? c.test.pWorse) < 0.05 ? 'sw' : ''; return `${c.skill > 0 ? 'pos' : c.skill < 0 ? 'neg' : ''} ${sig}`; };

function scorecard(card, windows, lands, title) {
  if (!card?.length) return '';
  const vars = [...new Set(card.map((c) => c.var))];
  let h = `<h3>${esc(title)}</h3>`;
  for (const land of lands) {
    const rows = vars.map((v) => {
      const cells = windows.map((w) => {
        const c = card.find((x) => x.var === v && x.window === w && x.land === land);
        if (!c) return '<td class="e">–</td>';
        const mark = c.test ? ((c.test.pBetterBH ?? 1) < 0.05 || (c.test.pWorseBH ?? 1) < 0.05 ? '**' : c.test.pTwoSided < 0.05 ? '*' : '') : '';
        return `<td class="${skillClass(c)}" title="n ${c.n}, ${c.days} Tage${c.test ? `, k ${c.test.k}, p ${c.test.pTwoSided}` : ''}${c.ci95 ? `, 95 %: ${pct(c.ci95[0])} … ${pct(c.ci95[1])}` : ''}">${pct(c.skill)}${mark}<small>${c.mdeRel != null ? `±${(c.mdeRel * 100).toFixed(0)}` : ''}</small></td>`;
      }).join('');
      const k = card.find((x) => x.var === v)?.kern;
      return `<tr><th>${esc(VAR_NAME[v])}${k ? '' : ' <small>(neben)</small>'}</th>${cells}</tr>`;
    }).join('');
    h += `<table><caption>${esc(land)}</caption><tr><th></th>${windows.map((w) => `<th>${esc(w)} h</th>`).join('')}</tr>${rows}</table>`;
  }
  return `${h}<p class="k">Relative Änderung des Scores (CRPS_Q, bei „nass“ Brier): positiv = besser. * roh signifikant (5 %), ** nach Benjamini-Hochberg über die Kernzellen. Klein dahinter: Nachweisgrenze in % (80 % Power). „–“: keine Fälle.</p>`;
}

function calibration(model, windows) {
  if (!model) return '';
  const rows = model.cells.filter((c) => c.land === 'alle' && c.role === 'B' && c.cover != null);
  if (!rows.length) return '';
  const tr = rows.map((c) => `<tr><th>${esc(VAR_NAME[c.var])}</th><td>${esc(c.window)}</td><td>${num(c.cover * 100, 1)} %</td><td>${num(c.below * 100, 1)} %</td><td>${num(c.above * 100, 1)} %</td><td>${num(c.width)}</td><td>${num(c.spreadSkill)}</td><td>${num(c.bias)}</td><td>${num(c.mae)}</td><td>${num(c.twCrps, 3)}</td><td>${num(c.sedi)}</td><td class="pit">${(c.pit ?? []).map((p) => `<i style="height:${Math.min(30, Math.round(p * 300))}px"></i>`).join('')}</td></tr>`).join('');
  const wet = model.wet.filter((w) => w.role === 'B').map((w) => `<tr><td>${esc(w.window)}</td><td>${w.n}</td><td>${num(w.baseRate * 100, 1)} %</td><td>${num(w.brierBinned, 4)}</td><td>${num(w.reliability, 4)}</td><td>${num(w.resolution, 4)}</td><td>${num(w.uncertainty, 4)}</td><td>${num(w.mcb, 4)}</td><td>${num(w.dsc, 4)}</td></tr>`).join('');
  return `<table><tr><th>Größe</th><th>Fenster</th><th>Abdeckung q10–q90 (Soll 80)</th><th>unter q10</th><th>über q90</th><th>Breite</th><th>Spread/Skill</th><th>Bias</th><th>MAE Median</th><th>twCRPS</th><th>SEDI</th><th>Rang im Quantilsatz</th></tr>${tr}</table>
<h4>Niederschlag „nass“: Brier-Zerlegung und CORP (Rolle B, alle Länder)</h4><table><tr><th>Fenster</th><th>n</th><th>Basisrate</th><th>Brier</th><th>Zuverlässigkeit</th><th>Auflösung</th><th>Unsicherheit</th><th>MCB</th><th>DSC</th></tr>${wet}</table>`;
}

function stationMap(net, rows) {
  if (!rows?.length) return '';
  const by = new Map();
  for (const [id, v, a, b] of rows) { if (!['t', 'td', 'ws', 'gust', 'precip'].includes(v) || !(b > 0)) continue; const e = by.get(id) ?? [0, 0]; e[0] += 1 - a / b; e[1] += 1; by.set(id, e); }
  const st = net.stations.filter((s) => by.has(s.id));
  if (!st.length) return '';
  const lo = [Math.min(...st.map((s) => s.lon)), Math.min(...st.map((s) => s.lat))], hi = [Math.max(...st.map((s) => s.lon)), Math.max(...st.map((s) => s.lat))];
  const W = 760, Hh = 520, x = (lon) => 10 + ((lon - lo[0]) / (hi[0] - lo[0])) * (W - 20), y = (lat) => Hh - 10 - ((lat - lo[1]) / (hi[1] - lo[1])) * (Hh - 20);
  const col = (s) => { const t = Math.max(-1, Math.min(1, s / 0.5)); return t >= 0 ? `rgb(${Math.round(230 - 190 * t)},${Math.round(230 - 90 * t)},${Math.round(230 - 170 * t)})` : `rgb(${Math.round(230 - 20 * -t)},${Math.round(230 - 170 * -t)},${Math.round(230 - 170 * -t)})`; };
  const dots = st.map((s) => { const e = by.get(s.id), sk = e[0] / e[1]; return `<circle cx="${x(s.lon).toFixed(1)}" cy="${y(s.lat).toFixed(1)}" r="${s.role === 'B' ? 5 : 3}" fill="${col(sk)}" stroke="${s.role === 'B' ? '#222' : '#999'}" stroke-width="0.6"><title>${esc(s.name)} (${s.id}, ${s.land}, Rolle ${s.role}, ${s.elevM} m): ${pct(sk)}</title></circle>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" role="img" aria-label="Skill je Station">${dots}</svg><p class="k">Mittlerer Skill gegen die Klimatologie über die Kerngrößen je Station (grün = besser als die Klimatologie, rot = schlechter; Sättigung bei ±50 %). Große Punkte mit dunklem Rand: Rolle B.</p>`;
}

function losses(net, rows) {
  if (!rows?.length) return '';
  const byId = new Map(net.stations.map((s) => [s.id, s]));
  const list = rows.filter(([, , a, b, n]) => b > 0 && n >= 20).map(([id, v, a, b, n]) => ({ id, v, d: a - b, rel: a / b - 1, n })).sort((p, q) => q.rel - p.rel).slice(0, 20);
  if (!list.length || list[0].rel <= 0) return '<p>Keine Station × Größe, an der der Kandidat schlechter ist als der Champion.</p>';
  return `<table><tr><th>Station</th><th>Land</th><th>Rolle</th><th>Höhe</th><th>Gelände</th><th>nächster Anker</th><th>Größe</th><th>Score-Änderung</th><th>absolut</th><th>Fälle</th></tr>${list.filter((l) => l.rel > 0).map((l) => { const s = byId.get(l.id); return `<tr><td>${esc(s.name)} (${l.id})</td><td>${s.land}</td><td>${s.role}</td><td>${s.elevM} m</td><td>${esc(s.cls)}</td><td>${s.anchor ? `${s.anchor.id}, ${num(s.anchor.km, 1)} km` : '–'}</td><td>${esc(VAR_NAME[l.v])}</td><td class="neg">${pct(l.rel)}</td><td>${num(l.d, 3)} ${UNIT[l.v]}</td><td>${l.n}</td></tr>`; }).join('')}</table>`;
}

function product(set, cand, windows) {
  const refs = ['ref-roh', 'ref-roh-lapse', 'ref-mosmix'].filter((r) => set.pairs[`${cand}|${r}`]?.cardB);
  if (!refs.length) return { html: '', better: 0, total: 0 };
  const cells = new Map();
  for (const r of refs) for (const c of set.pairs[`${cand}|${r}`].cardB) { if (!c.kern || c.land === 'alle') continue; const k = `${c.var}|${c.window}|${c.land}`; if (!cells.has(k)) cells.set(k, { var: c.var, window: c.window, land: c.land, vs: {} }); cells.get(k).vs[r] = c.skill; }
  let better = 0;
  const rows = [...cells.values()].map((c) => { const all = Object.values(c.vs).filter((x) => x != null); const ok = all.length > 0 && all.every((x) => x > 0); if (ok) better += 1; return { ...c, ok }; });
  const vars = [...new Set(rows.map((x) => x.var))];
  const tbl = ['DE', 'AT', 'CH'].map((land) => `<table><caption>${land}</caption><tr><th></th>${windows.map((w) => `<th>${esc(w)} h</th>`).join('')}</tr>${vars.map((v) => `<tr><th>${esc(VAR_NAME[v])}</th>${windows.map((w) => { const c = rows.find((x) => x.var === v && x.window === w && x.land === land); if (!c) return '<td class="e">–</td>'; const worst = Math.min(...Object.values(c.vs).filter((x) => x != null)); return `<td class="${c.ok ? 'pos' : 'neg'}" title="${Object.entries(c.vs).map(([k, s]) => `${k}: ${pct(s)}`).join(', ')}">${pct(worst)}</td>`; }).join('')}</tr>`).join('')}</table>`).join('');
  return { html: `${tbl}<p class="k">Je Kernzelle der Skill gegen die BESTE Einzelquelle der Zelle (Cube roh, Cube roh + 0,65 K/100 m, MOSMIX-L); grün = besser als jede. MOSMIX ist auf die Messungen der Station trainiert.</p>`, better, total: rows.length };
}

export function productCount(set, cand, windows) { const p = product(set, cand, windows); return { better: p.better, total: p.total }; }

export function renderReport(scores, net) {
  const windows = scores.windows, cand = scores.candidate?.id ?? null, champ = scores.champion?.id ?? null;
  const css = `body{font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif;color:#1c1a17;background:#f6f3ee;margin:0;padding:24px;max-width:1180px}h1{font-size:22px}h2{font-size:18px;border-top:2px solid #1c1a17;padding-top:14px;margin-top:34px}h3{font-size:15px;margin:18px 0 6px}table{border-collapse:collapse;margin:6px 16px 12px 0;display:inline-table;vertical-align:top;background:#fff}caption{font-weight:600;text-align:left;padding:2px 0}th,td{border:1px solid #d9d2c5;padding:3px 7px;text-align:right;white-space:nowrap}th{background:#efe9df;text-align:left;font-weight:600}td.pos{background:#e3f1e3}td.neg{background:#f6e1de}td.sb{box-shadow:inset 0 0 0 2px #2e7d32}td.sw{box-shadow:inset 0 0 0 2px #c62828}td.e{color:#aaa}td.l{text-align:left;white-space:normal;max-width:820px}small{color:#666;margin-left:4px;font-size:11px}.k{color:#555;font-size:12.5px;max-width:980px}.lt{display:inline-block;padding:1px 9px;border-radius:10px;color:#fff;font-weight:600}.lt.g{background:#2e7d32}.lt.r{background:#c62828}.lt.n{background:#8a8172}.verdict{font-size:17px;background:#fff;border:2px solid #1c1a17;padding:12px 16px}.mono{font-family:ui-monospace,Consolas,monospace;font-size:12px}td.pit{padding:2px 6px;height:32px;vertical-align:bottom}td.pit i{display:inline-block;width:5px;background:#5d6f8a;margin-right:1px;vertical-align:bottom}ul{margin:4px 0}`;
  const g = scores.gates;
  let h = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Prüfstand — ${esc(scores.title)}</title><style>${css}</style></head><body>`;
  h += `<p class="verdict">${esc(scores.verdict.sentence)}</p><h1>Prüfstand — ${esc(scores.title)}</h1>`;
  h += `<table><tr><th>Protokoll</th><td class="mono">${esc(scores.protocol.id)} · ${esc(scores.protocol.hash.slice(0, 16))}</td></tr><tr><th>Wahrheit</th><td class="mono">${esc(scores.truth.stand)} · ${esc(String(scores.truth.hash).slice(0, 16))}</td></tr>${cand ? `<tr><th>Kandidat</th><td class="mono">${esc(scores.candidate.name)} · Commit ${esc(scores.candidate.commit.slice(0, 7))} · Modell ${esc(scores.candidate.modelHash.slice(0, 16))} · Freeze ${esc(scores.candidate.freeze)}</td></tr>` : ''}${champ ? `<tr><th>Champion</th><td class="mono">${esc(scores.champion.name)} · Commit ${esc(scores.champion.commit.slice(0, 7))} · Modell ${esc(scores.champion.modelHash.slice(0, 16))}</td></tr>` : ''}<tr><th>Modus</th><td>${esc(scores.mode)}</td></tr>${Object.entries(scores.sets).map(([k, s]) => `<tr><th>${esc(s.label)}</th><td>${s.issues} Ausgabetage${s.days.length ? ` (${esc(s.days[0])} … ${esc(s.days[s.days.length - 1])})` : ''}${s.ripeOnly ? ', nur reife Wahrheit' : s.unripeCounted ? `, darin ${s.unripeCounted} Werte mit unreifer Wahrheit` : ''}</td></tr>`).join('')}</table>`;
  if (g) {
    h += `<h2>1 Gates</h2><table><tr><th>G1 Fortschritt</th><td>${light(g.G1.status)}</td><td class="l">${esc(g.G1.why)}${g.G1.spurP?.value != null ? ` · Index ${esc(g.G1.setName ?? 'Spur P')} ${pct(g.G1.spurP.value)}${g.G1.spurP.ci95 ? ` (95 %: ${pct(g.G1.spurP.ci95[0])} … ${pct(g.G1.spurP.ci95[1])})` : ''}` : ''}${g.G1.spurR?.value != null ? ` · Index Spur R ${pct(g.G1.spurR.value)}${g.G1.spurR.ci95 ? ` (95 %: ${pct(g.G1.spurR.ci95[0])} … ${pct(g.G1.spurR.ci95[1])})` : ''}` : ''}</td></tr><tr><th>G2 Kein Rückschritt</th><td>${light(g.G2.status)}</td><td class="l">${esc(g.G2.detail)}</td></tr><tr><th>G3 Kalibrierung</th><td>${light(g.G3.status)}</td><td class="l">${esc(g.G3.detail)}</td></tr><tr><th>G4 Technik</th><td>${light(g.G4.status)}</td><td class="l">${g.G4.checks.map((c) => `${c.ok ? '✓' : '✗'} ${esc(c.name)}: ${esc(c.detail)}`).join('<br>')}</td></tr></table>`;
    if (g.indicative) h += `<p class="k">${esc(g.indicative)}</p>`;
    if (scores.warnings?.length) h += `<p><b>Warnungen:</b></p><ul>${scores.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`;
  }
  let sec = 2;
  for (const [key, set] of Object.entries(scores.sets)) {
    if (!set.issues) { h += `<h2>${sec++} ${esc(set.label)}</h2><p>Keine Ausgabetage in dieser Menge${set.why ? ` — ${esc(set.why)}` : ''}.</p>`; continue; }
    h += `<h2>${sec++} ${esc(set.label)}</h2>`;
    if (set.note) h += `<p class="k">${esc(set.note)}</p>`;
    const pc = cand && champ ? set.pairs[`${cand}|${champ}`] : null;
    if (pc) {
      h += `<p>Fortschrittsindex gegen ${esc(scores.champion.name)} an Rolle B: <b>${pct(pc.indexB.value, 2)}</b>${pc.indexB.ci95 ? ` (95 %: ${pct(pc.indexB.ci95[0], 2)} … ${pct(pc.indexB.ci95[1], 2)})` : ''}${pc.indexB.mde != null ? `, Nachweisgrenze ${num(pc.indexB.mde * 100, 1)} %` : ''}, ${pc.indexB.cells} Kernzellen, ${pc.indexB.days} Tage · an Rolle A: ${pct(pc.indexA.value, 2)}</p>`;
      h += scorecard(pc.cardB, windows, ['DE', 'AT', 'CH', 'alle'], `Scorecard gegen ${scores.champion.name}, Rolle B (maskiert)`);
      h += scorecard(pc.cardA, windows, ['alle'], `Scorecard gegen ${scores.champion.name}, Rolle A (mit eigener Station und Messung) — Diagnose`);
    }
    if (scores.ranking?.[key]?.length) {
      h += `<h3>Rangliste: Güteindex gegen die lokale Klimatologie (Rolle B)</h3><table><tr><th>#</th><th>Version</th><th>Güteindex</th><th>95 %</th><th>Kernzellen</th><th>Tage</th><th>an Rolle A</th></tr>${scores.ranking[key].map((x, i) => `<tr><td>${i + 1}</td><th>${esc(x.name)}</th><td>${pct(x.value, 1)}</td><td>${x.ci95 ? `${pct(x.ci95[0], 1)} … ${pct(x.ci95[1], 1)}` : '–'}</td><td>${x.cells}</td><td>${x.days}</td><td>${pct(x.valueA, 1)}</td></tr>`).join('')}</table>`;
    }
    if (cand) {
      for (const other of scores.versions.filter((v) => v !== cand && v !== champ)) { const p = set.pairs[`${cand}|${other}`]; if (p?.cardB) h += scorecard(p.cardB.filter((c) => c.land === 'alle'), windows, ['alle'], `Gegen ${other}, Rolle B`); }
      const pr = product(set, cand, windows);
      if (pr.total) h += `<h3>Produktaussage: in ${pr.better} von ${pr.total} Kernzellen besser als jede Einzelquelle</h3>${pr.html}`;
      h += `<h3>Kalibrierung ${esc(scores.candidate.name)} (Rolle B, alle Länder)</h3>${calibration(set.models[cand], windows)}`;
      if (set.G3?.rows?.length) h += `<h4>G3 je Zelle</h4><table><tr><th>Größe</th><th>Fenster</th><th>Abdeckung</th><th>Band um 80 %</th><th>Champion</th><th>weiter weg als der Champion (95 %)</th><th></th></tr>${set.G3.rows.map((x) => `<tr><th>${esc(VAR_NAME[x.var])}</th><td>${esc(x.window)}</td><td>${num(x.cover * 100, 1)} %</td><td>${x.band ? `${num(x.band[0] * 100, 1)} … ${num(x.band[1] * 100, 1)} %` : '–'}</td><td>${x.champion != null ? `${num(x.champion * 100, 1)} %` : '–'}</td><td>${x.fartherThanChampion ? `${num(x.fartherThanChampion[0] * 100, 1)} … ${num(x.fartherThanChampion[1] * 100, 1)}` : '–'}</td><td>${x.red == null ? 'zu wenige Tage' : x.red ? light('rot') : x.inBand ? light('grün') : 'außerhalb, nicht schlechter als der Champion'}</td></tr>`).join('')}</table>`;
      const sp = set.special[cand];
      if (sp) {
        h += `<h3>Sonderprüfungen</h3>`;
        const cmp = ['ref-roh', 'ref-roh-lapse'].filter((r) => set.special[r]?.heightPairs);
        if (sp.heightPairs?.length) h += `<table><caption>Höhenpaare Tal/Berg: mittlerer Fehler der vorhergesagten Differenz</caption><tr><th>Größe</th><th>Lage zur Ausgabezeit</th><th>Vorlauf</th><th>${esc(scores.candidate.name)}</th>${cmp.map((r) => `<th>${esc(r)}</th>`).join('')}<th>Fälle</th></tr>${sp.heightPairs.map((x) => `<tr><th>${esc(VAR_NAME[x.var])}</th><td>${x.inversion ? 'Inversion' : 'keine Inversion'}</td><td>${esc(x.leads)}</td><td>${num(x.maeDelta)} K</td>${cmp.map((r) => { const y = set.special[r].heightPairs.find((z) => z.var === x.var && z.inversion === x.inversion && z.leads === x.leads); return `<td>${y ? `${num(y.maeDelta)} K` : '–'}</td>`; }).join('')}<td>${x.n}</td></tr>`).join('')}</table>`;
        if (sp.seams?.some((x) => x.n)) h += `<table><caption>Nähte: Fehler der vorhergesagten Temperaturänderung über die Naht (Median). Die drei Schritte liegen zu verschiedenen Tageszeiten — vergleichbar ist eine Zeile nur zwischen Versionen, nicht zwischen den Spalten.</caption><tr><th>Naht</th><th>Schritt davor</th><th>über die Naht</th><th>Schritt danach</th><th>Fälle</th></tr>${sp.seams.filter((x) => x.n).map((x) => `<tr><th>${x.seamH} h</th><td>${num(x.before)} K</td><td>${num(x.across)} K</td><td>${num(x.after)} K</td><td>${x.n}</td></tr>`).join('')}</table>`;
        if (sp.interpolation?.length) h += `<table><caption>Stundeninterpolation Stufe 2 (49–72 h): Score auf Rasterstunden und Zwischenstunden</caption><tr><th>Größe</th><th>Rasterstunden</th><th>Zwischenstunden</th><th>Fälle</th></tr>${sp.interpolation.map((x) => `<tr><th>${esc(VAR_NAME[x.var])}</th><td>${num(x.raster, 3)}</td><td>${num(x.between, 3)}</td><td>${x.nRaster} / ${x.nBetween}</td></tr>`).join('')}</table>`;
      }
      h += `<h3>Skill je Station gegen die Klimatologie</h3>${stationMap(net, set.pairs[`${cand}|ref-klima`]?.stations)}`;
      if (pc) h += `<h3>Die größten Verluste gegen den Champion (Station × Größe)</h3>${losses(net, pc.stations)}`;
    } else if (scores.matrix?.[key]) {
      const ids = scores.versions;
      h += `<h3>Paarweise: Index der Zeile gegen die Spalte (Rolle B; positiv = Zeile besser)</h3><table><tr><th></th>${ids.map((i) => `<th>${esc(i)}</th>`).join('')}</tr>${ids.map((a) => `<tr><th>${esc(a)}</th>${ids.map((b) => { const m = scores.matrix[key][`${a}|${b}`]; return a === b ? '<td class="e">·</td>' : m?.value == null ? '<td class="e">–</td>' : `<td class="${m.value > 0 ? 'pos' : m.value < 0 ? 'neg' : ''} ${m.test && m.test.pBetter < 0.05 ? 'sb' : m.test && m.test.pWorse < 0.05 ? 'sw' : ''}" title="${m.days} Tage">${pct(m.value, 2)}${m.ci95 ? `<small>${pct(m.ci95[0], 1)} … ${pct(m.ci95[1], 1)}</small>` : ''}</td>`; }).join('')}</tr>`).join('')}</table><p class="k">Rahmen: einseitig signifikant (5 %) auf den Tagesdifferenzen mit AR(2)-Inflation. Der Vergleich entscheidet nichts.</p>`;
    }
  }
  if (scores.selfcheck) {
    const s = scores.selfcheck;
    h += `<h2>${sec++} Selbstprüfung des Prüfstands</h2><p>A/A-Test (${s.aa.repetitions} Wiederholungen, Partner ${esc(s.aa.partner)}, ${s.aa.cells} Kernzellen, bis ${s.aa.days} Tage): gemessene Irrtumsrate <b>${num(s.aa.rate * 100, 1)} %</b> bei nominal ${num(s.aa.nominal * 100, 0)} % (je Zelle ${num(s.aa.perCellMin * 100, 1)} … ${num(s.aa.perCellMax * 100, 1)} %; je Wiederholung 5–95 %: ${num(s.aa.perRepP05 * 100, 1)} … ${num(s.aa.perRepP95 * 100, 1)} %; Grenze ${num(s.aa.maxRate * 100, 0)} %) ${light(s.aa.ok ? 'grün' : 'rot')}</p><table><tr><th>Negativkontrolle</th><th></th><th>Befund</th></tr>${s.controls.map((c) => `<tr><th>${esc(c.name)}</th><td>${light(c.ok ? 'grün' : 'rot')}</td><td class="l">${esc(c.detail)}</td></tr>`).join('')}</table>`;
  }
  h += `<h2>${sec++} Hinweise und Quellen</h2><ul>${scores.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul><p class="k">Messwerte: Deutscher Wetterdienst (CDC, 10-min-Werte und stündliche Bewölkung) · GeoSphere Austria (klima-v2-10min, CC BY 4.0) · Source: MeteoSwiss (SwissMetNet). Alle Zahlen dieses Berichts stehen in scores.json im selben Ordner.</p></body></html>\n`;
  return h;
}
