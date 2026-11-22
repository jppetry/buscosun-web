/**
 * Phase BS-P — wind particles on the Seewetter map (`audit/seewetter-binnenseen.md` §9, E-BS-11; Jan's go for the
 * WebGL hook-in, 22.11.2026). Pure and import-free: which hour of the map's wind field is shown, when a longer window is
 * fetched, and what the legend says. The layer itself is `SeaParticleLayer.ts` (its own lazy chunk) — it hosts the
 * Wetterkarte's `WindLayer` class unchanged.
 *
 * The particles show the 10-m wind FIELD of ICON-D2 (DWD) from the data repo, the same pictures the Wetterkarte draws
 * (measured 22.11.: 13 steps of 0–12 h per run; since phase WH every model cell ≈ 2,2 km on desktop, every second one on
 * touch devices — `audit/wind-2km.md`). That is NOT
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

/**
 * The look of the particles on the Seewetter map. Jan, 22.11.2026: at higher wind the particles were much faster and the
 * scene too hectic — „die Windpartikel bleiben länger, aber die Geschwindigkeit nicht mehr so viel schneller“. Only options
 * the Wetterkarte's class already has (no shader, no new option); the Wetterkarte itself keeps its look. All values `set`
 * and not seen by the author.
 *  - tempo: the class's own curve  shown = ref · (v / ref)^gamma. With gamma 0,5 and ref 6 m/s a wind of 6 m/s runs as
 *    before, 12 m/s 1,41 times as fast (not twice), 24 m/s twice (not four times), 3 m/s 0,71 times (not half). The tempo
 *    is no longer proportional to the wind — the legend says so.
 *  - life: a particle is replaced less often (base 0,002 instead of 0,003 per frame, the part that grows with the speed
 *    0,004 instead of 0,01) and its trail fades more slowly (0,978 instead of 0,972 per frame).
 * `?swplook=wk` = the Wetterkarte's look (linear tempo, its lifetimes) — the named fallback.
 */
export const SEA_PARTICLE_LOOK = Object.freeze({ speedGamma: 0.5, speedRef: 6, dropRate: 0.002, dropRateBump: 0.004, fadeOpacity: 0.978 });
export type SeaParticleLook = Partial<typeof SEA_PARTICLE_LOOK>;
export function seaParticleLookFrom(search: string): SeaParticleLook {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('swplook'); } catch { /* broken query = no vote */ }
  return q === 'wk' ? {} : SEA_PARTICLE_LOOK;
}
/** The wind speed the particles are moved with for a model wind `vMs` — the formula of the particle class (`speedGamma`, `speedRef`). */
export function seaParticleTempo(vMs: number, look: SeaParticleLook = SEA_PARTICLE_LOOK): number {
  if (!(vMs > 0)) return 0;
  const g = look.speedGamma ?? 1, ref = look.speedRef ?? 5;
  return g === 1 ? vMs : ref * Math.pow(vMs / ref, g);
}
/** The sentence of the legend about the tempo; empty with the linear look. */
export function seaParticleTempoNote(look: SeaParticleLook = SEA_PARTICLE_LOOK): string {
  const g = look.speedGamma ?? 1;
  return g === 1 ? '' : `Das Tempo ist gestaucht: doppelter Wind läuft rund ${(2 ** g).toLocaleString('de-DE', { maximumFractionDigits: 1 })}-mal so schnell.`;
}

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

/** What the layer tells the page. */
export type SeaParticleState =
  | { kind: 'loading' }
  | { kind: 'ok'; w: ParticleWindow; /** Phase WH: the field carries every model cell (2,2 km) instead of every second one. */ hd?: boolean }
  | { kind: 'outside'; side: 'before' | 'after'; w: ParticleWindow }
  | { kind: 'na' };

/** The legend line. `when` formats a time for the reader (the page's `dateTime`); `tempoNote` = `seaParticleTempoNote()`. */
export function particleLegend(s: SeaParticleState, when: (ms: number) => string, tempoNote = ''): string {
  switch (s.kind) {
    case 'loading': return 'Windpartikel laden.';
    case 'ok': return `Windpartikel: Windfeld des DWD-Modells ICON-D2 (Lauf ${String(new Date(s.w.runMs).getUTCHours()).padStart(2, '0')} UTC, ${s.hd ? '2,2 km' : 'jede zweite Zelle, 4,4 km'}), nicht buscosun Fusion. Die Werte an den Spots können davon abweichen.${tempoNote ? ` ${tempoNote}` : ''}`;
    case 'outside': return s.side === 'after'
      ? `Windpartikel: keine für diese Stunde. Das Windfeld der Karte reicht bis ${when(s.w.toMs)} Uhr.`
      : `Windpartikel: keine für diese Stunde. Das Windfeld der Karte beginnt ${when(s.w.fromMs)} Uhr.`;
    case 'na': return 'Windpartikel: keine Daten.';
  }
}

/**
 * Are the particles drawn at all? Off with the switch and without sea data. They are NOT tied to the main layer: with
 * „Strömung“ chosen the particles run below the ripples (Jan 22.11.2026: both at the same time — until then they rested
 * there, E-BS-16). Who wants the ripples alone turns the dock switch „Windpartikel“ off.
 */
export function particlesWanted(x: { flag: boolean; toggle: boolean; noData: boolean }): 'on' | 'off' {
  return !x.flag || !x.toggle || x.noData ? 'off' : 'on';
}
