/**
 * Phase BS-P — the wind particles of the Wetterkarte on the Seewetter map (`audit/seewetter-binnenseen.md` §9). Its own
 * lazy chunk: loaded when the switch is first turned on, nobody else pays for it.
 *
 * Hosts the `WindLayer` class UNCHANGED, with the Wetterkarte's settings (`weatherWindPreset.ts`) and its area clamps, plus
 * this map's calmer look through options the class already has (`SEA_PARTICLE_LOOK`) —
 * no shader, no option and no line of the class is touched; the performance stays with its `FrameGovernor`. The field is
 * the ICON-D2 10-m wind of the data repo through the Wetterkarte's own reader (`fetchIconD2Wind`), without the wind
 * colouring (the sea field is the map's colour area). Which hour is drawn is decided in `seaParticles.ts`.
 */
import type maplibregl from 'maplibre-gl';
import { WindLayer } from '../wind/WindLayer';
import { weatherWindOptions, WEATHER_WIND_DENSITY } from '../wind/weatherWindPreset';
import { fetchIconD2Wind, windFrameAtValidTime, windUpsampleOf, type IconD2Wind } from '../wind/iconD2WindSource';
import {
  SEA_PARTICLES_BEFORE, SEA_PARTICLES_LAYER_ID, particleHourOf, particleWindowOf, particlesFetchWant, seaParticleLookFrom, type SeaParticleState,
} from './seaParticles';

/** A failed first fetch is tried again after a minute, at most three times (the pattern of the Wetterkarte, RN-3). */
const RETRY_MS = 60_000, RETRY_MAX = 3;

export class SeaParticleLayer {
  private readonly wind: WindLayer;
  private readonly ac = new AbortController();
  private data: IconD2Wind | null = null;
  private fetchedAt = 0;
  private aheadH = 0;
  private loading = false;
  private tries = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private shown = '';
  private dead = false;
  private readonly map: maplibregl.Map;
  private tMs: number;
  private readonly onState: (s: SeaParticleState) => void;

  constructor(map: maplibregl.Map, tMs: number, onState: (s: SeaParticleState) => void) {
    this.map = map; this.tMs = tMs; this.onState = onState;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    // The Wetterkarte's layer with its shared preset and the area clamps of the full-size map; on top of it the calmer
    // look of this map (`SEA_PARTICLE_LOOK`: compressed tempo, longer life — Jan 22.11.; `?swplook=wk` = the preset alone).
    const look = seaParticleLookFrom(typeof window.location?.search === 'string' ? window.location.search : '');
    this.wind = new WindLayer({ ...weatherWindOptions(coarse), ...look, id: SEA_PARTICLES_LAYER_ID, minParticles: 2500, maxParticles: 48000, reduceMotionOnMove: coarse });
    this.wind.setDensityMultiplier(WEATHER_WIND_DENSITY);
    this.wind.setShowHeatmap(false);
    this.wind.setShowParticles(false);   // nothing moves before a field of the chosen hour is in
    map.addLayer(this.wind, map.getLayer(SEA_PARTICLES_BEFORE) ? SEA_PARTICLES_BEFORE : undefined);
    void this.load(0);
  }

  /** The hour the map shows. */
  setTime(tMs: number): void {
    if (tMs === this.tMs) return;
    this.tMs = tMs;
    this.apply();
  }

  /** The map is on stage; off stage the layer's own repaint loop rests. */
  setActive(on: boolean): void { this.wind.setSuspended(!on); }

  destroy(): void {
    this.dead = true;
    this.ac.abort();
    if (this.retry != null) clearTimeout(this.retry);
    try { if (this.map.getLayer(SEA_PARTICLES_LAYER_ID)) this.map.removeLayer(SEA_PARTICLES_LAYER_ID); } catch { /* the map is already gone */ }
  }

  private async load(aheadH: number): Promise<void> {
    if (this.loading || this.dead) return;
    this.loading = true;
    if (!this.data) this.onState({ kind: 'loading' });
    try {
      const wd = await fetchIconD2Wind(this.ac.signal, undefined, undefined, { nowOnly: true, aheadHours: aheadH });
      if (this.dead) return;
      this.data = wd; this.aheadH = aheadH; this.fetchedAt = Date.now(); this.tries = 0;
    } catch {
      if (this.dead) return;
      // The field that is there stays; without one the layer says "keine Daten" and asks again later.
      if (!this.data && this.tries < RETRY_MAX) { this.tries++; this.retry = setTimeout(() => { this.retry = null; void this.load(aheadH); }, RETRY_MS); }
      // A longer window or a refresh that failed is not asked for again at every change of the hour.
      else if (this.data) { this.aheadH = Math.max(this.aheadH, aheadH); this.fetchedAt = Date.now(); }
    } finally { this.loading = false; }
    if (!this.dead) this.apply();
  }

  private apply(): void {
    if (this.dead) return;
    const wd = this.data;
    const w = wd ? particleWindowOf(wd.runAt.getTime(), wd.frames.map((f) => f.validAt.getTime())) : null;
    if (!wd || !w) {
      this.wind.setShowParticles(false);
      this.onState(this.loading || this.retry != null ? { kind: 'loading' } : { kind: 'na' });
      return;
    }
    const want = particlesFetchWant(w, this.tMs, this.aheadH, Date.now() - this.fetchedAt);
    if (want != null && !this.loading) void this.load(want);
    const where = particleHourOf(w, this.tMs);
    if (where !== 'in') {
      this.wind.setShowParticles(false);
      this.onState(this.loading && where === 'after' ? { kind: 'loading' } : { kind: 'outside', side: where, w });
      return;
    }
    const f = windFrameAtValidTime(wd, this.tMs);
    // The same hour of the same run is not uploaded again (a longer window or a refresh brings the same picture).
    const key = `${w.runMs}|${f.stepHours}`;
    if (key !== this.shown) {
      this.wind.setWindData(f.image, { width: f.width, height: f.height, uMin: f.uMin, uMax: f.uMax, vMin: f.vMin, vMax: f.vMax, uvBounds: wd.uvBounds, upsample: windUpsampleOf(wd) });
      this.shown = key;
    }
    this.wind.setShowParticles(true);
    this.onState({ kind: 'ok', w, hd: wd.hd === true });
  }
}
