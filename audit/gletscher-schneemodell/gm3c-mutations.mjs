#!/usr/bin/env node
/**
 * GM-3c — counter-check of the verifiers that carry the snowpack line: every mutation below breaks one rule of the new code; at least one of
 * `verify:glacier-snowpack`, `verify:glacier-snowcal`, `verify:glacier-weather`, `verify:glacier-publish` must turn red for each. The file is changed, the
 * verifiers are run (the first red one ends the round), the file is restored (also on failure). Result: gm3c-mutations.json.
 *
 *   node audit/gletscher-schneemodell/gm3c-mutations.mjs
 *
 * Do not run it next to a producer run: the run would load the mutated code. After an aborted round: run the verifiers first, restore the mutated file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const G = 'scripts/glacier';
const CORE = `${G}/lib/snowpackcore.mjs`, MELT = `${G}/melt.mjs`, WX = `${G}/lib/weathercore.mjs`, CAL = `${G}/lib/snowcal.mjs`, PUB = `${G}/glacier-publish.mjs`, SEED = `${G}/snowpack-seed.mjs`, CON = 'src/glacier/glacierSnowpackContract.ts';
const VERIFIERS = ['verify-glacier-snowpack.mjs', 'verify-glacier-snowcal.mjs', 'verify-glacier-publish.mjs', 'verify-glacier-weather.mjs'];
const MUT = [
  ['Voreinstellung des Schalters „shadow“', CORE, "export const SNOWPACK_DEFAULT = 'off';", "export const SNOWPACK_DEFAULT = 'shadow';"],
  ['unbekanntes Wort fällt auf die Voreinstellung zurück', CORE, 'if (!allowed.includes(value)) throw new Error(', 'if (!allowed.includes(value)) return fallback; if (false) throw new Error('],
  ['Start ab Werk „cold“', CORE, "export const SNOWPACK_START_DEFAULT = 'state';", "export const SNOWPACK_START_DEFAULT = 'cold';"],
  ['Schneefall frischt die Albedo nicht auf', CORE, 'lv.aS = S > 0 ? lv.aS +', 'lv.aS = S > 1e9 ? lv.aS +'],
  ['Schmelze ohne Dämpfung der positiven Temperatur', CORE, 'const Ti = T <= 0 ? T : MELT.bIce * T;', 'const Ti = T;'],
  ['Albedo vor dem Neuschnee der Stunde entschieden', CORE, 'packSwe(lv.pack) + S > MELT.sweMin', 'packSwe(lv.pack) > MELT.sweMin'],
  ['Antrieb ohne den Niederschlagsfaktor', CORE, 'Math.round(100 * factor[l] * ph *', 'Math.round(100 * ph *'],
  ['Antrieb nicht auf die Auflösung des Zustands gerundet', CORE, 't[l][h] = Math.round(tz[l][h] * 10) + 0;', 't[l][h] = tz[l][h] * 10;'],
  ['Temperaturlücke wird durchgelassen', CORE, "if (!Number.isFinite(tz[l][h]) || !Number.isFinite(share[l][h])) throw new Error('Temperaturlücke');", ''],
  ['Zustand hält Schichten ohne Masse', CORE, 'if (swe > 0) out.push(swe, h, raw[i + 2]);', 'out.push(swe, h, raw[i + 2]);'],
  ['Fortschreiben rechnet immer den ganzen gespeicherten Antrieb', CORE, 'const n = pend ? Math.min(gap, pend[2].length) : 0;', 'const n = pend ? pend[2].length : 0;'],
  ['Stunden ohne Antrieb werden nicht gezählt', CORE, 'return { levels, replayed: n, holes: gap - n };', 'return { levels, replayed: n, holes: 0 };'],
  ['Fortschreiben nimmt einen Zustand aus der Zukunft', CORE, "if (gap < 0) throw new Error('Zustand liegt in der Zukunft');", ''],
  ['gespeicherter Antrieb eine Stunde zu kurz', CORE, 'drive.g.slice(0, pendH)]', 'drive.g.slice(0, pendH - 1)]'],
  ['alle Neuschnee-Fenster sind das 72-h-Fenster', CORE, 'r1(newSnow(lv.pack, t0Ms, w, c).cm)', 'r1(newSnow(lv.pack, t0Ms, 72, c).cm)'],
  ['Nachbar-Antworten ohne „unten nie mehr als oben“', CORE, 'share[1][h] = Math.min(share[1][h], share[2][h]); share[0][h] = Math.min(share[0][h], share[1][h]);\n  }\n  return { tz, share };', '}\n  return { tz, share };'],
  ['Zustand aus anderer Rechnung wird fortgesetzt', CORE, 'if (state.rules?.precip !== rules.precip || state.rules?.density !== rules.density) return', 'if (false) return'],
  ['Vorhersage beginnt nicht am gespeicherten Zustand', CORE, 'const rows = levels.map((lv) => normalizeLevel(lv, c));', 'const rows = levels.map((lv) => normalizeLevel({ pack: lv.pack, aS: lv.aS }, c));'],
  ['mit „off“ wird der Dichteschalter gelesen', MELT, 'const spDensity = spOn ? snowSwitchesOf(', 'const spDensity = true ? snowSwitchesOf('],
  ['mit „off“ wird der Zustand gelesen', MELT, '  if (spOn) {\n    sp = {', '  if (true) {\n    sp = {'],
  ['„cold“ verwirft einen vorhandenen Zustand', MELT, "if (!st && spStart === 'cold')", "if (spStart === 'cold')"],
  ['Umgebungsvariable des Schalters wird nicht gelesen', MELT, 'snowpackModeOf(opts.snowpack ?? process.env.GLACIER_SNOWPACK)', 'snowpackModeOf(opts.snowpack)'],
  ['„country“ rechnet die Schneedecke ohne den Faktor', MELT, 'const factor = precip ? z.map(() => precip.factorOf(g.region))', 'const factor = precip ? z.map(() => 1)'],
  ['„gate-c“ rechnet die Schneedecke ohne die 4 % je 100 m', MELT, 'z.map((zz) => params.pf * (1 + (MELT.pGrad * (zz - f.zRef)) / 100));\n          const drive', 'z.map(() => params.pf);\n          const drive'],
  ['Nachbar-Antrieb fällt auf die Hochrechnung zurück', MELT, '} else if (f.sp) {', '} else if (false) {'],
  ['später begonnener Gletscher nennt seinen Beginn nicht', MELT, 'if (begin > Math.floor(Date.parse(sp.since) / H)) o.row.from =', 'if (false) o.row.from ='],
  ['übersprungener Gletscher verliert seinen Eintrag', MELT, 'try { if (wOut) spCarry(g, wOut.z); } catch {', 'try { } catch {'],
  ['Gletscher ohne Zeile wird nicht fortgetragen', MELT, 'ok = !!zb?.length && spCarry(', 'ok = false && spCarry('],
  ['Fehler des Schritts hält das Schreiben nicht auf', MELT, '      if (sp.error) throw new Error(sp.error);\n', ''],
  ['Statuszeile verschweigt den Grund', MELT, "snowpack.error ? { at: doc.runAt, mode: 'shadow', error: snowpack.error }", 'snowpack.error ? null'],
  ['Herkunft „model“ statt „computed“', MELT, "origin: 'computed', engine, cube, verified:", "origin: 'model', engine, cube, verified:"],
  ['Zustand steht 6 h hinter der Laufstunde', MELT, "atMs: t0Ms, source: 'run'", "atMs: t0Ms + 6 * H, source: 'run'"],
  ['Zeiger nennt die Schneedecke nicht', MELT, '    ...(snowpack && !snowpack.error ? { snowpack: snowpack.pointer } : {}),\n', ''],
  ['Schmelzparameter der Schneedecke sind nicht die des Laufs', MELT, 'const pars = z.map((zz) => ({ TF: params.TF, SRF: params.SRF, aBare: bareAlbedo(zz, g.z[1]) }));\n          const e =', 'const pars = z.map((zz) => ({ TF: 0, SRF: 0, aBare: bareAlbedo(zz, g.z[1]) }));\n          const e ='],
  ['Wetterzeile gibt die Schneeanteile nicht heraus', WX, ', shares: act.share, ctx: lineCtx } : { row, hourly, cmp, shares: act.share };', ' } : { row, hourly, cmp };'],
  ['Temperatur auf fremder Höhe ist die der Zunge', WX, 'export const tempAtElevation = (zq, h, ctx) => atElevation(zq, h, ctx).T;', 'export const tempAtElevation = (zq, h, ctx) => ctx.tz[0][h];'],
  ['Schneeanteil auf fremder Höhe ohne den Versatz der Antworten', WX, 'solidFraction(T)) + off);\n}\n/** Phase GM (GM-3c)', 'solidFraction(T)));\n}\n/** Phase GM (GM-3c)'],
  ['ungenannte Dichte folgt dem Faktor nicht', CAL, "density == null || density === '' ? SNOW_DENSITY_FOLLOWS[p] : snowDensitySourceOf(density)", 'snowDensitySourceOf(density)'],
  ['„gate-c“ zieht „board“ nach', CAL, "'gate-c': 'helfricht', country: 'board'", "'gate-c': 'board', country: 'board'"],
  ['Publisher kennt `snowpack/` nicht', PUB, "melt: ['melt', 'snowpack'],", "melt: ['melt'],"],
  ['Aufbewahrung greift unter `melt/`', PUB, "melt: [{ prefix: 'snowpack', olderThanMs", "melt: [{ prefix: 'melt', olderThanMs"],
  ['Aufbewahrung 30 Tage statt 72 h', PUB, "melt: [{ prefix: 'snowpack', olderThanMs: 72 * 3_600_000", "melt: [{ prefix: 'snowpack', olderThanMs: 720 * 3_600_000"],
  ['Einschwingen ohne die Verschiebung der Temperatur', SEED, 'const T = Math.round((t + gl.dT + MELT.gamma', 'const T = Math.round((t + MELT.gamma'],
  ['Einschwingen zählt Stunden ohne Antrieb nicht', SEED, 'if (!fx) { holes++; continue; }', 'if (!fx) { continue; }'],
  ['Einschwingen übergeht den Antrieb der Wetterläufe', SEED, 'const fx = gl.fill?.[h];', 'const fx = null;'],
  ['übernommene Stunden werden nicht genannt', SEED, "...(filledGlaciers ? { filled: { rule: 'fusion-weather-runs', glaciers: filledGlaciers, maxH: filledMax } } : {})", ''],
  ['Startzustand gibt sich als Lauf aus', SEED, "source: 'seed', run: null", "source: 'run', run: null"],
  ['Verschiebung aus zu wenigen Stunden', SEED, 'return d.length < min ? null : quant(d, 0.5);', 'return quant(d, 0.5);'],
  ['Tagessumme auf jede Stunde statt verteilt', SEED, 'P[h] = Math.max(0, p[d]) / 24;', 'P[h] = Math.max(0, p[d]);'],
  ['fehlender Tag wird mit Nullen gefüllt', SEED, 'if (d < 0 || d >= p.length || p[d] == null || t[d] == null) continue;', 'if (d < 0 || d >= p.length) continue;'],
  ['Tagesgang ohne Amplitude', SEED, 'T[h] = t[d] + amp * Math.cos(', 'T[h] = t[d] + 0 * Math.cos('],
  ['Vertrag nimmt jede Herkunft', CON, "if (doc.origin !== 'computed') p.push(", 'if (false) p.push('],
  ['Vertrag verlangt den Vermerk „nicht nachgemessen“ nicht', CON, 'if (doc.verified?.measured !== false || !doc.verified.note) p.push(', 'if (false) p.push('],
  ['Vertrag lässt „board“ ohne „country“ zu', CON, "else if (d.source === 'board' && r.precip?.rule !== 'country') p.push(", 'else if (false) p.push('],
  ['Vertrag prüft die Dichte der Zeile nicht', CON, 'if (rho < GLACIER_SNOWPACK_DENSITY_BOUNDS[0] || rho > GLACIER_SNOWPACK_DENSITY_BOUNDS[1]) bad(', 'if (false) bad('],
];
const runOne = (v) => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', `scripts/${v}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { verifier: v.replace(/^verify-|\.mjs$/g, ''), status: r.status, failed: (r.stdout.match(/^(FAIL|\s*✗) .*$/gm) ?? []).map((l) => l.replace(/^(FAIL|\s*✗) /, '').slice(0, 3).trim()) };
};
/** The verifiers in order; the first red one ends the round (it is enough to notice a mutation). */
const firstRed = () => { for (const v of VERIFIERS) { const r = runOne(v); if (r.status !== 0) return r; } return null; };
const base = VERIFIERS.map(runOne);
if (base.some((r) => r.status !== 0)) { console.error('the verifiers are not green before the mutations', JSON.stringify(base)); process.exit(2); }
const out = [];
for (const [name, file, from, to] of MUT) {
  const p = join(ROOT, file), orig = readFileSync(p, 'utf8');
  let res = { name, file };
  try {
    if (!orig.includes(from)) throw new Error('pattern not found');
    writeFileSync(p, orig.replace(from, to));
    const red = firstRed();
    res = { ...res, noticed: !!red, by: red ? `${red.verifier}: ${red.failed.join(', ') || 'Abbruch'}` : null, crashedOnly: !!red && red.failed.length === 0 };
  } catch (e) { res = { ...res, error: String(e.message) }; }
  finally { writeFileSync(p, orig); }
  out.push(res);
  console.log(`${res.noticed ? 'bemerkt   ' : 'ÜBERSEHEN '} ${name}${res.by ? ` (${res.by})` : ''}${res.error ? ` — ${res.error}` : ''}`);
}
const after = VERIFIERS.map(runOne);
writeFileSync(join(import.meta.dirname, 'gm3c-mutations.json'), JSON.stringify({ generated: new Date().toISOString(), verifiers: VERIFIERS.map((v) => v.replace(/^verify-|\.mjs$/g, '').replace('glacier-', 'verify:glacier-')), greenBefore: true, greenAfter: after.every((r) => r.status === 0), noticed: out.filter((o) => o.noticed).length, of: out.length, crashedOnly: out.filter((o) => o.crashedOnly).length, mutations: out }, null, 1));
console.log(`${out.filter((o) => o.noticed).length} von ${out.length} bemerkt (${out.filter((o) => o.crashedOnly).length} nur als Abbruch); Prüfer danach ${after.every((r) => r.status === 0) ? 'grün' : 'ROT'}`);
