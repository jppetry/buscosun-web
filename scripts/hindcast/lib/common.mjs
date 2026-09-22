/**
 * common.mjs — shared constants of the AP10a hindcast: where the archive lives, which cube sources the hindcast
 * can carry per tier (in the PRODUCER's contributor order — the order fixes the float sums), which external
 * store serves them, and the PAP-3 plane list of the 2×2 block (E-F-19 (a)).
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { CUBE_PLANES } from '../../../src/point/cubeFormat.ts';

export const HINDCAST_ROOT = process.env.HINDCAST_ROOT || 'C:/dev/buscosun-hindcast';
export const H = 3_600_000;

/**
 * Cube sources the hindcast can carry, per tier, in the order the producer lists its contributors
 * (tier.sources, then tier.diversity — build-point-cube.mjs `ids`). `grid` names the geometry in grids.mjs.
 * Sources the external archives do not carry (claef, claef_eps, *_eps of DWD/MeteoSwiss, aicon, inca, radar,
 * mosmix) are absent by design (kickoff fact C) and listed in every slot as `assignedAbsent`.
 */
export const TIER_SOURCES = Object.freeze({
  t1: [
    { id: 'icon_d2', grid: 'icon_d2', rule: 'block' },
    { id: 'icon_ch1_eps', grid: 'icon_ch1_om', rule: 'nearest' },
    { id: 'icon_eu', grid: 'icon_eu', rule: 'block' },
    { id: 'ifs_hres', grid: 'ecmwf025', rule: 'block' },
    { id: 'aifs_single', grid: 'ecmwf025', rule: 'block' },
  ],
  t2: [
    { id: 'icon_eu', grid: 'icon_eu', rule: 'block' },
    { id: 'icon_ch2_eps', grid: 'icon_ch2_om', rule: 'nearest' },
    { id: 'icon_global', grid: 'icon_global_om', rule: 'nearest' },
    { id: 'ifs_hres', grid: 'ecmwf025', rule: 'block' },
    { id: 'aifs_single', grid: 'ecmwf025', rule: 'block' },
  ],
  t3: [
    { id: 'icon_global', grid: 'icon_global_om', rule: 'nearest' },
    { id: 'ifs_hres', grid: 'ecmwf025', rule: 'block' },
    { id: 'ifs_ens', grid: 'ecmwf025', rule: 'block', ensembleOnly: true },
    { id: 'aifs_single', grid: 'ecmwf025', rule: 'block' },
  ],
});

/** Assigned by the source matrix / tier table but not in any free archive (kickoff fact C). */
export const ABSENT_BY_TIER = Object.freeze({
  t1: { icon_d2_eps: 'Member nirgends frei archiviert', claef: 'kein freies Archiv (GeoSphere hält 18 h)', claef_eps: 'kein freies Archiv', inca: 'Nowcast, nicht im Hindcast', radvor_rv: 'Radar-Nowcast, nicht im Hindcast', combiprecip: 'Radar-Nowcast, nicht im Hindcast' },
  t2: { icon_eu_eps: 'Member nirgends frei archiviert', aicon: 'kein freies Archiv', mosmix_l: 'kein öffentliches MOSMIX-Archiv (Stationsprodukt, nicht im Cube)' },
  t3: { icon_eps_global: 'Member nirgends frei archiviert', aicon: 'kein freies Archiv', aifs_ens: 'bei dynamical.org ab 2025-07-02 vorhanden, der Producer liest AIFS-ENS nicht (kein Adapter im Cube-Bau)' },
});

/** The 31 planes PAP 3 averages over the block (prompt.md 1b, E-F-19 (a)): mean/_sd/_sd_ens of 9 vars, clcl/clcm/clch, hModEff. */
export const PAP3_PLANES = Object.freeze(CUBE_PLANES.filter((p) =>
  (['t2m', 'td2m', 'u10', 'v10', 'gust', 'precip', 'clct', 'ps', 'snowlmt'].includes(p.varId) && ['mean', 'sd', 'sd_ens'].includes(p.kind))
  || ['clcl', 'clcm', 'clch', 'hModEff'].includes(p.id)).map((p) => p.id));

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

let CODE_HASH;
export function codeHash() {
  if (CODE_HASH !== undefined) return CODE_HASH;
  CODE_HASH = computeCodeHash();
  return CODE_HASH;
}
function computeCodeHash() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain -- scripts/hindcast', { encoding: 'utf8' }).trim().length > 0;
    return dirty ? `${sha}-hindcast-dirty` : sha;
  } catch { return null; }
}

export function parseArgs(argv) {
  const flags = {};
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const [k, ...v] = a.slice(2).split('=');
    flags[k] = v.length ? v.join('=') : true;
  }
  return flags;
}

export const pad2 = (n) => String(n).padStart(2, '0');
export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
