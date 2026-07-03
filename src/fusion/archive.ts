/**
 * Verification archive: combine a directory of session fixtures into the
 * per-model error samples the Phase 3 fit consumes (constraint C3 — fit on a
 * growing archive, not a single file). Pure (browser-safe); the Node driver
 * reads the directory and passes the parsed fixtures in.
 *
 * Constraint C1 (licence split) is enforced here: `stripNonCommercial` removes
 * Open-Meteo-tagged samples before any training, and `assertNoOpenMeteo` is the
 * hard guard the artifact writer calls so a non-commercial sample can never
 * reach a shipped parameter file — independent of operator memory.
 */

import { idwAtPoint } from './predictors.ts';
import { classifyTerrain, type TerrainClass } from './loso.ts';
import type { Fixture, FixtureSample, OiVariable } from './fixture.ts';

/** Remove Open-Meteo (non-commercial) samples from the training inputs. Stations
 *  are national-network obs (CC-BY) and are always kept. Returns the cleaned
 *  fixture plus how many samples were stripped. */
export function stripNonCommercial(fx: Fixture): { fixture: Fixture; stripped: number } {
  const keep = (s: FixtureSample) => (s.provenance ?? 'ccby') !== 'open-meteo';
  const background = fx.background.filter(keep);
  const icond2 = fx.icond2.filter(keep);
  const stripped = (fx.background.length - background.length) + (fx.icond2.length - icond2.length);
  return { fixture: { ...fx, background, icond2 }, stripped };
}

/** Hard guard: throw if any training sample is Open-Meteo-provenanced (C1). */
export function assertNoOpenMeteo(fixtures: Fixture[]): void {
  for (const fx of fixtures) {
    for (const s of [...fx.background, ...fx.icond2]) {
      if ((s.provenance ?? 'ccby') === 'open-meteo') {
        throw new Error(
          `[fusionV2 C1] refusing to train on Open-Meteo sample (source=${s.source}) from session ` +
          `${fx.meta.validTime}. Open-Meteo is non-commercial and must not enter a shipped artifact. ` +
          `Capture training fixtures with useOpenMeteo:false, or strip via stripNonCommercial().`,
        );
      }
    }
  }
}

/** One (session × station) row: per-model forecast-minus-obs error e_m = model − obs. */
export interface ErrorSample {
  session: string;
  stationId: string;
  network: string;
  terrain: TerrainClass;
  lead: number;
  obs: number;
  /** e_m per model source; missing model ⇒ absent key (NaN-free map). */
  perModel: Record<string, number>;
}

/** Distinct CC-BY model sources present across the archive background. */
export function archiveModels(fixtures: Fixture[]): string[] {
  const set = new Set<string>();
  for (const fx of fixtures) for (const s of fx.background) set.add(s.source);
  return [...set].sort();
}

/**
 * Build per-model error samples for one variable across the archive. For each
 * station in each session, e_m = H(model_m) − y (elevation-aware H for t2m).
 */
export function buildErrorArchive(fixtures: Fixture[], variable: OiVariable): ErrorSample[] {
  const out: ErrorSample[] = [];
  for (const fx of fixtures) {
    const models = [...new Set(fx.background.map((s) => s.source))];
    const bySource = new Map<string, FixtureSample[]>();
    for (const m of models) bySource.set(m, fx.background.filter((s) => s.source === m));
    const terrain = classifyTerrain(fx.stations);
    const lead = fx.meta.leadHours ?? 0;
    for (const st of fx.stations) {
      const y = st.truth[variable];
      if (y == null || y !== y) continue;
      const perModel: Record<string, number> = {};
      for (const m of models) {
        const est = idwAtPoint(bySource.get(m)!, st.x, st.y, st.elev, variable);
        if (est === est) perModel[m] = est - y;   // forecast − obs
      }
      if (!Object.keys(perModel).length) continue;
      out.push({
        session: fx.meta.validTime, stationId: st.id, network: st.network,
        terrain: terrain.get(st.id)!, lead, obs: y, perModel,
      });
    }
  }
  return out;
}
