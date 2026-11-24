#!/usr/bin/env node
/**
 * GM-5 B — the parts of the rule (§B.2, §B.6, §B.7, sizes) that need no new computation of the snow core: read only from the documents the frozen copy
 * dc982141 wrote in the run of gm5-scenarios.mjs (out-sp, run 2026112117; the scenario phase of that process was stopped by the system for low memory and
 * is NOT measured) and from the GM-3 reports. Writes gm5-light.json. Usage: node audit/gletscher-schneemodell/gm5-light.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const C = 'C:/dev/buscosun-glacier-cache';
const rd = (p) => JSON.parse(readFileSync(p, 'utf8'));
const methodSha = createHash('sha256').update(readFileSync(join(HERE, 'gm5-method-frozen.md'))).digest('hex');
if (methodSha !== readFileSync(join(HERE, 'gm5-method-frozen.sha256'), 'utf8').split(/\s+/)[0]) throw new Error('eingefrorene Methode verändert');
const fin = Number.isFinite;
const qt = (a, q) => { const s = a.filter(fin).sort((x, y) => x - y); if (!s.length) return null; const p = q * (s.length - 1), i = Math.floor(p); return s[i] + (s[Math.min(s.length - 1, i + 1)] - s[i]) * (p - i); };
const med = (a) => qt(a, 0.5);

// sigmas (§B.2)
const A = rd(`${C}/gm3/report-A-explore.json`), B = rd(`${C}/gm3/report-B.json`);
const ratios = A.perGlacier.factors.map((f) => f.F / f.countryF);
const sigmaF = (Math.log(qt(ratios, 0.9)) - Math.log(qt(ratios, 0.1))) / (2 * 1.2816);
const sites = B.data.perSite.filter((s) => s.events >= 20).map((s) => s.rho50);
const sigmaRho = (Math.log(qt(sites, 0.9)) - Math.log(qt(sites, 0.1))) / (2 * 1.2816);
const sigmaRhoEvent = (Math.log(B.measured.all.p90) - Math.log(B.measured.all.p10)) / (2 * 1.2816);

// the run's documents
const status = rd(`${C}/gm5/patch-sp/status-patch.json`).lines;
const sp = rd(`${C}/gm5/out-sp/snowpack/2026112117.json`);
const wx = rd(`${C}/gm5/out-sp/melt/wx/2026112117.json`);
const own = wx.glaciers.filter((g) => g.f === 'own' && g.snq);

// V-GM-41 (§B.6), expected values of the snowpack document, median elevation, days 8–14
let n = 0, e05 = 0, e01 = 0; const sum814 = [];
for (const g of sp.glaciers) { let s = 0; for (let d = 7; d < 14; d++) { n++; const v = g.hnd[1][d]; if (v >= 0.5) e05++; if (v >= 0.1) e01++; s += v; } sum814.push(s); }
// the same days in the weather part, which already has K = 100 scenarios for the new snow (mm water, own answers): expected vs p10 / p90 of the day
let m = 0, we = 0, w10 = 0, w90 = 0;
for (const g of own) for (let d = 7; d < 14; d++) { m++; if (g.sn[1][d] >= 0.5) we++; if (g.snq[1][d][0] >= 0.5) w10++; if (g.snq[1][d][1] >= 0.5) w90++; }
const snqWidth = (d) => med(own.map((g) => g.snq[1][d][1] - g.snq[1][d][0]));
const snExp = (d) => med(own.map((g) => g.sn[1][d]));
const pqWidth = (d) => med(own.map((g) => g.pq[d][1] - g.pq[d][0]));

// "now" (§B.7) — an ESTIMATE
const zq = 1.2816, mul = (s) => Math.exp(zq * s) - Math.exp(-zq * s);
const now = {
  hsMedian: med(sp.glaciers.map((g) => g.hs[1])), hsWidth: med(sp.glaciers.map((g) => g.hs[1] * mul(sigmaF))),
  sweMedian: med(sp.glaciers.map((g) => g.swe[1])), sweWidth: med(sp.glaciers.map((g) => g.swe[1] * mul(sigmaF))),
  hn72Median: med(sp.glaciers.map((g) => g.hn[1][2])), hn72Width: med(sp.glaciers.map((g) => g.hn[1][2] * mul(Math.hypot(sigmaF, sigmaRho)))),
  p10p90Factor: [Math.exp(-zq * sigmaF), Math.exp(zq * sigmaF)],
};

// size: the run's document and the same with p10/p90 per elevation for hsd and hnd — SIZE ONLY, the expected values stand in for the quantiles
const docS = JSON.stringify(sp);
const ext = { ...sp, glaciers: sp.glaciers.map((g) => ({ ...g, hsq: g.hsd.map((lv) => [lv, lv]), hnq: g.hnd.map((lv) => [lv, lv]) })) };
const extS = JSON.stringify(ext);

const out = {
  kind: 'gm5/light', generated: new Date().toISOString(), codeCommit: 'dc982141', run: sp.run, method: { sha256: methodSha },
  runStatus: { meltSeconds: status.melt.seconds, levelsSeconds: status.weather.levels.seconds, snowpackSeconds: status.snowpack.seconds, snowpackGlaciers: status.snowpack.glaciers, coverage: status.snowpack.coverage, note: 'one run, machine under memory pressure; the scenario phase of the same process was stopped by the system and is not measured' },
  sigma: { F: sigmaF, factorRatios: { n: ratios.length, p10: qt(ratios, 0.1), median: med(ratios), p90: qt(ratios, 0.9) }, rhoSystematic: sigmaRho, rhoSites: { n: sites.length, p10: qt(sites, 0.1), median: med(sites), p90: qt(sites, 0.9) }, rhoEvent: sigmaRhoEvent },
  weatherPart: { glaciers: wx.glaciers.length, ownWithScenarios: own.length, withoutSpread: wx.glaciers.length - own.length, k: wx.rules?.spread?.k ?? null, rule: wx.rules?.spread ?? null,
    snqWidthMm: { day1: snqWidth(0), day7: snqWidth(6), day14: snqWidth(13) }, snExpectedMm: { day1: snExp(0), day7: snExp(6), day14: snExp(13) }, pqWidthMm: { day1: pqWidth(0), day7: pqWidth(6), day14: pqWidth(13) } },
  vgm41: { snowpackExpected: { glacierDays: n, atLeast05cm: e05 / n, atLeast01cm: e01 / n, sumDays8to14Cm: { p10: qt(sum814, 0.1), median: med(sum814), p90: qt(sum814, 0.9) } },
    weatherScenariosMm: { glacierDays: m, expectedAtLeast05mm: we / m, p10AtLeast05mm: w10 / m, p90AtLeast05mm: w90 / m } },
  nowEstimate: now,
  size: { docRaw: Buffer.byteLength(docS), docGzip: gzipSync(docS).length, extRaw: Buffer.byteLength(extS), extGzip: gzipSync(extS).length, stateRaw: status.snowpack.stateBytes, note: 'ext = document + hsq/hnq [p10[], p90[]] per elevation; expected values stand in for the quantiles (size only)' },
};
writeFileSync(join(HERE, 'gm5-light.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
