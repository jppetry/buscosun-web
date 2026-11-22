/**
 * Phase BS-P — wind particles on the Seewetter map (`audit/seewetter-binnenseen.md` §9, E-BS-11; Jan's go for the
 * WebGL hook-in, 22.11.2026). Pure and import-free: which hour of the map's wind field is shown, when a longer window is
 * fetched, and what the legend says. The layer itself is `SeaParticleLayer.ts` (its own lazy chunk) — it hosts the
 * Wetterkarte's `WindLayer` class unchanged.
 *
 * The particles show the 10-m wind FIELD of ICON-D2 (DWD) from the data repo, the same pictures the Wetterkarte draws
 * (measured 22.11.: 13 steps of 0–12 h per run, every second model cell ≈ 4,4 km, ≈ 236 KB per step). That is NOT
 * buscosun Fusion: the arrows and values at the spots stay buscosun Fusion, and the two may disagree — the legend names
 * the field's source. A lake a few kilometres wide is one or two cells of this field: it shows the wind of the region,
 * not a lake's own wind system.
 */

const H = 3_600_000;

export const SEA_PARTICLES_LAYER_ID = 'sw-particles';
/** The particles lie above the sea field, the lake areas and the basemap labels, below every arrow and marker. */
export const SEA_PARTICLES_BEFORE = 'sw-arrows';
export const SEA_PARTICLES_LABEL = 'Windpartikel';
export const SEA_PARTICLES_HINT = 'DWD ICON-D2 · Windfeld des Modells, nicht buscosun Fusion';
/** The map's wind pictures reach 12 h of a run (`MAX_STEP` of the wind source) — the longest window worth asking for. */
export const SEA_PARTICLES_AHEAD_H = 12;
/** A new ICON-D2 run comes every 3 h: a field fetched longer ago is asked for again at the next change of the hour (`set`). */
export const SEA_PARTICLES_REFRESH_MS = 3 * H;

/** The hours the loaded field carries. */
export interface ParticleWindow { runMs: number; fromMs: number; toMs: number }

export function particleWindowOf(runMs: number, validTimes: readonly number[]): ParticleWindow | null {
  const t = validTimes.filter((x) => Number.isFinite(x));
  if (!Number.isFinite(runMs) || !t.length) return null;
  return { runMs, fromMs: Math.min(...t), toMs: Math.max(...t) };
}

/** Where the chosen hour lies against the loaded field. Never clamped: an hour outside gets no particles. */
export function particleHourOf(w: ParticleWindow, tMs: number): 'in' | 'before' | 'after' {
  return tMs < w.fromMs ? 'before' : tMs > w.toMs ? 'after' : 'in';
}

/**
 * Which window to fetch next, in hours ahead of "now" — or null (nothing to fetch). The page starts with the two
 * pictures around "now" (0); the long window is fetched only when the chosen hour lies behind the loaded field, and a
 * field older than `SEA_PARTICLES_REFRESH_MS` is fetched again with the window it had.
 */
export function particlesFetchWant(w: ParticleWindow | null, tMs: number, loadedAheadH: number, fetchedAgeMs: number): number | null {
  if (!w) return null;
  if (tMs > w.toMs && loadedAheadH < SEA_PARTICLES_AHEAD_H) return SEA_PARTICLES_AHEAD_H;
  if (fetchedAgeMs > SEA_PARTICLES_REFRESH_MS) return Math.max(0, loadedAheadH);
  return null;
}

/** What the layer tells the page. `rest` = the main layer „Strömung“ is chosen (the ripples move there, E-BS-16). */
export type SeaParticleState =
  | { kind: 'loading' }
  | { kind: 'ok'; w: ParticleWindow }
  | { kind: 'outside'; side: 'before' | 'after'; w: ParticleWindow }
  | { kind: 'na' }
  | { kind: 'rest' };

/** The legend line. `when` formats a time for the reader (the page's `dateTime`). */
export function particleLegend(s: SeaParticleState, when: (ms: number) => string): string {
  switch (s.kind) {
    case 'loading': return 'Windpartikel laden.';
    case 'ok': return `Windpartikel: Windfeld des DWD-Modells ICON-D2 (Lauf ${String(new Date(s.w.runMs).getUTCHours()).padStart(2, '0')} UTC), nicht buscosun Fusion. Die Werte an den Spots können davon abweichen.`;
    case 'outside': return s.side === 'after'
      ? `Windpartikel: keine für diese Stunde. Das Windfeld der Karte reicht bis ${when(s.w.toMs)} Uhr.`
      : `Windpartikel: keine für diese Stunde. Das Windfeld der Karte beginnt ${when(s.w.fromMs)} Uhr.`;
    case 'na': return 'Windpartikel: keine Daten.';
    case 'rest': return 'Windpartikel ruhen in der Ebene Strömung.';
  }
}

/** Are the particles drawn at all? Off with the switch, without sea data, and while the ripples of „Strömung“ move. */
export function particlesWanted(x: { flag: boolean; toggle: boolean; noData: boolean; isCur: boolean }): 'on' | 'rest' | 'off' {
  if (!x.flag || !x.toggle || x.noData) return 'off';
  return x.isCur ? 'rest' : 'on';
}
