/**
 * Desroziers consistency diagnostics (paper eq. 9) — estimate observation- and
 * background-error variances from innovation statistics instead of asserting
 * them. This is what replaces the heuristic "station weight 5, model weight 1.4"
 * with the estimable r = σ_o²/σ_b² that the OI (oi.ts) consumes.
 *
 *   σ_o²        ≈ E[(y − H x_a)(y − H x_b)]            per network
 *   σ_b² (=HBHᵀ diag) ≈ E[(H x_a − H x_b)(y − H x_b)]  (background property)
 *
 * x_a is the analysis that USED the obs (not leave-one-out) — the standard
 * (self-consistent) Desroziers construction. Accumulated over a session (or an
 * archive) and written to JSON; Phase 3 promotes it to `public/params/oi-v1.json`.
 */

import { buildOiKernel, applyOiKernel, DEFAULT_OI_PARAMS } from './oi.ts';
import { idwAtPoint } from './predictors.ts';
import type { Fixture, OiVariable } from './fixture.ts';

export interface DesrozNetworkStat { sigmaO2: number; sigmaO: number; r: number; n: number }
export interface DesrozVariableStat {
  sigmaB2: number; sigmaB: number;
  perNetwork: Record<string, DesrozNetworkStat>;
}
export interface DesrozArtifact {
  version: string;
  note: string;
  source: string;
  perVariable: Record<string, DesrozVariableStat>;
}

const VARIABLES: OiVariable[] = ['t2m', 'windSpeed', 'precip', 'cloud'];

/**
 * Accumulate eq. (9) over a fixture. `priorRatios` seed the OI used to build x_a
 * (the diagnostic is iterated toward consistency across sessions; a single pass
 * with the prior r is the first iterate).
 */
export function accumulateDesroziers(
  fixture: Fixture,
  priorRatios: Record<string, number> = { dwd: 0.1, tawes: 0.12, smn: 0.12 },
  variables: OiVariable[] = VARIABLES,
): DesrozArtifact {
  const perVariable: Record<string, DesrozVariableStat> = {};

  for (const v of variables) {
    // Analysis x_a at each obs, using ALL obs (with the prior r).
    const obs = fixture.stations
      .map((s) => ({ s, y: s.truth[v] }))
      .filter((o) => o.y != null && o.y === o.y) as Array<{ s: typeof fixture.stations[number]; y: number }>;

    const oiObs = obs.map(({ s }) => ({
      x: s.x, y: s.y, elev: s.elev, obsVarRatio: priorRatios[s.network] ?? 0.1,
    }));
    const innov = new Float32Array(obs.length);
    const hxbArr = new Float64Array(obs.length);
    for (let i = 0; i < obs.length; i++) {
      const hxb = idwAtPoint(fixture.background, obs[i].s.x, obs[i].s.y, obs[i].s.elev, v);
      hxbArr[i] = hxb;
      innov[i] = obs[i].y - hxb;
    }

    let sbSum = 0, sbN = 0;
    const net: Record<string, { so: number; n: number }> = {};
    for (let i = 0; i < obs.length; i++) {
      const hxb = hxbArr[i];
      if (hxb !== hxb) continue;
      // x_a at this obs = x_b + OI increment from ALL obs (1-cell grid at obs).
      const grid = {
        cols: 1, rows: 1,
        uvBounds: [obs[i].s.x, obs[i].s.y, obs[i].s.x, obs[i].s.y] as [number, number, number, number],
        cellElev: Float32Array.from([obs[i].s.elev]),
      };
      const k = buildOiKernel(oiObs, grid, DEFAULT_OI_PARAMS);
      const inc = applyOiKernel(k, innov)[0];
      const hxa = hxb + (inc === inc ? inc : 0);
      const db = obs[i].y - hxb;      // y − H x_b
      const da = obs[i].y - hxa;      // y − H x_a
      const dab = hxa - hxb;          // H x_a − H x_b
      sbSum += dab * db; sbN++;       // σ_b² accumulator (background property)
      const nname = obs[i].s.network;
      const acc = net[nname] ?? { so: 0, n: 0 };
      acc.so += da * db; acc.n++;     // σ_o² accumulator (per network)
      net[nname] = acc;
    }

    const sigmaB2 = sbN ? Math.max(1e-6, sbSum / sbN) : 1;
    const perNetwork: Record<string, DesrozNetworkStat> = {};
    for (const [nname, acc] of Object.entries(net)) {
      const sigmaO2 = Math.max(0, acc.n ? acc.so / acc.n : 0);
      perNetwork[nname] = {
        sigmaO2, sigmaO: Math.sqrt(sigmaO2), r: sigmaO2 / sigmaB2, n: acc.n,
      };
    }
    perVariable[v] = { sigmaB2, sigmaB: Math.sqrt(sigmaB2), perNetwork };
  }

  return {
    version: 'desroziers-1',
    note: 'Desroziers (eq. 9) innovation statistics. r = σ_o²/σ_b² per network ' +
      'feeds oi.ts; single-session = first iterate, archive accumulates toward consistency.',
    source: fixture.meta.synthetic ? 'synthetic' : `session ${fixture.meta.validTime}`,
    perVariable,
  };
}
