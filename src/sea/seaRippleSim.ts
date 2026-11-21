/**
 * Phase SR — particle state of the ripple layer (`audit/seewetter-riffel.md`): threads (B) and ripple packets (C) that
 * move with the flow. Pure — no DOM, no canvas; `SeaRippleLayer.ts` draws what this holds, `verify:sea-ripples` steps it
 * against synthetic fields.
 *
 * Positions are web-mercator coordinates (Float64 — a step of 0.04 px at zoom 12 is below Float32 resolution) and are
 * re-projected by the caller every frame; every length here is in screen px of the view handed to `step`.
 */
import { RIPPLE, RIPPLE_MAX, lifeFade, rippleRandom, rippleStepPx, spawnProbability, type PxFlow, type PxSampler, type RippleView } from './seaRipples';

const TL = RIPPLE.threadLen, PT = RIPPLE.trailPoints;

export class RippleSim {
  readonly maxThreads = RIPPLE_MAX.tracers;
  readonly maxPackets = RIPPLE_MAX.packets;
  /** Active counts (`setCounts`); slots above them are empty. */
  threads = 0;
  packets = 0;

  // B. Threads: position, age, life, visibility (eases to 0 below the speed limit), speed, and the last positions as a ring.
  readonly tAlive = new Uint8Array(this.maxThreads);
  readonly tX = new Float64Array(this.maxThreads);
  readonly tY = new Float64Array(this.maxThreads);
  readonly tAge = new Float32Array(this.maxThreads);
  readonly tLife = new Float32Array(this.maxThreads);
  readonly tVis = new Float32Array(this.maxThreads);
  readonly tV = new Float32Array(this.maxThreads);
  readonly tTrail = new Float64Array(this.maxThreads * TL * 2);
  readonly tHead = new Uint16Array(this.maxThreads);
  readonly tLen = new Uint16Array(this.maxThreads);

  // C. Packets: the same, plus the way behind them as points `trailStepPx` apart (the fronts ride on it).
  readonly pAlive = new Uint8Array(this.maxPackets);
  readonly pX = new Float64Array(this.maxPackets);
  readonly pY = new Float64Array(this.maxPackets);
  readonly pAge = new Float32Array(this.maxPackets);
  readonly pLife = new Float32Array(this.maxPackets);
  readonly pVis = new Float32Array(this.maxPackets);
  readonly pV = new Float32Array(this.maxPackets);
  readonly pTrail = new Float64Array(this.maxPackets * PT * 2);
  readonly pHead = new Uint16Array(this.maxPackets);
  readonly pLen = new Uint16Array(this.maxPackets);
  private readonly pAcc = new Float32Array(this.maxPackets);

  private rand: () => number;
  private readonly f: PxFlow = { dx: 0, dy: 0, v: 0 };

  /** `linear` = the tempo before phase SR-B (`?srtempo=lin`); the default is the wind particles' curve (`rippleStepPx`). */
  private readonly linear: boolean;
  constructor(seed = 1, linear = false) { this.rand = rippleRandom(seed); this.linear = linear; }

  /** Empties every slot and restarts the random numbers — the still frame is the same picture every time. */
  reset(seed = 1): void {
    this.rand = rippleRandom(seed);
    this.tAlive.fill(0); this.pAlive.fill(0);
  }
  setCounts(threads: number, packets: number): void {
    this.threads = Math.max(0, Math.min(this.maxThreads, Math.round(threads)));
    this.packets = Math.max(0, Math.min(this.maxPackets, Math.round(packets)));
    this.tAlive.fill(0, this.threads); this.pAlive.fill(0, this.packets);
  }

  /**
   * D. A new position: anywhere on the map, never on land, accepted with `min(1, 0.12 + 1.3 · v)` — so particles gather
   * where the water moves. A few tries per frame; a slot that finds none stays empty until the next frame.
   */
  private place(view: RippleView, sample: PxSampler): boolean {
    for (let n = 0; n < RIPPLE.spawnTries; n++) {
      const px = this.rand() * view.w, py = this.rand() * view.h;
      if (!sample(px, py, this.f)) continue;
      if (this.rand() >= spawnProbability(this.f.v)) continue;
      this.f.dx = px; this.f.dy = py;     // handed back in the scratch object: the accepted position
      return true;
    }
    return false;
  }

  /**
   * One frame. `dtN` = elapsed time in 60-fps frames (1 at 60 fps, 2 at 30 fps): speed, ages and fades are per
   * 60-fps frame, so a lower frame rate changes nothing but the smoothness.
   */
  step(view: RippleView, sample: PxSampler, dtN: number): void {
    const f = this.f, m = RIPPLE.marginPx, ease = dtN / RIPPLE.fadeFrames;
    for (let i = 0; i < this.threads; i++) {
      if (!this.tAlive[i]) {
        if (!this.place(view, sample)) continue;
        this.tX[i] = (f.dx - view.bx) / view.ax; this.tY[i] = (f.dy - view.by) / view.ay;
        this.tAlive[i] = 1; this.tAge[i] = 0; this.tV[i] = f.v;
        this.tLife[i] = RIPPLE.threadLifeMin + this.rand() * (RIPPLE.threadLifeMax - RIPPLE.threadLifeMin);
        this.tVis[i] = f.v >= RIPPLE.threadMinMs ? 1 : 0;
        this.tHead[i] = 0; this.tLen[i] = 1;
        this.tTrail[i * TL * 2] = this.tX[i]; this.tTrail[i * TL * 2 + 1] = this.tY[i];
        continue;
      }
      const px = view.ax * this.tX[i] + view.bx, py = view.ay * this.tY[i] + view.by;
      if (this.tAge[i] >= this.tLife[i] || px < -m || py < -m || px > view.w + m || py > view.h + m || !sample(px, py, f)) { this.tAlive[i] = 0; continue; }
      const d = rippleStepPx(f.v, this.linear) * dtN;
      this.tX[i] += (f.dx * d) / view.ax; this.tY[i] += (f.dy * d) / view.ay;
      this.tAge[i] += dtN; this.tV[i] = f.v;
      this.tVis[i] = f.v >= RIPPLE.threadMinMs ? Math.min(1, this.tVis[i] + ease) : Math.max(0, this.tVis[i] - ease);
      const h = (this.tHead[i] + 1) % TL, o = (i * TL + h) * 2;
      this.tHead[i] = h; this.tTrail[o] = this.tX[i]; this.tTrail[o + 1] = this.tY[i];
      if (this.tLen[i] < TL) this.tLen[i]++;
    }
    for (let i = 0; i < this.packets; i++) {
      if (!this.pAlive[i]) {
        if (!this.place(view, sample)) continue;
        this.pX[i] = (f.dx - view.bx) / view.ax; this.pY[i] = (f.dy - view.by) / view.ay;
        this.pAlive[i] = 1; this.pAge[i] = 0; this.pV[i] = f.v;
        this.pLife[i] = RIPPLE.packetLifeMin + this.rand() * (RIPPLE.packetLifeMax - RIPPLE.packetLifeMin);
        this.pVis[i] = f.v >= RIPPLE.packetMinMs ? 1 : 0;
        this.pHead[i] = 0; this.pLen[i] = 0; this.pAcc[i] = 0;
        continue;
      }
      const px = view.ax * this.pX[i] + view.bx, py = view.ay * this.pY[i] + view.by;
      if (this.pAge[i] >= this.pLife[i] || px < -m || py < -m || px > view.w + m || py > view.h + m || !sample(px, py, f)) { this.pAlive[i] = 0; continue; }
      // The way behind the packet: the position it leaves, every `trailStepPx`.
      const d = rippleStepPx(f.v, this.linear) * dtN;
      this.pAcc[i] += d;
      if (this.pLen[i] === 0 || this.pAcc[i] >= RIPPLE.trailStepPx) {
        const h = this.pLen[i] === 0 ? 0 : (this.pHead[i] + 1) % PT, o = (i * PT + h) * 2;
        this.pHead[i] = h; this.pTrail[o] = this.pX[i]; this.pTrail[o + 1] = this.pY[i];
        if (this.pLen[i] < PT) this.pLen[i]++;
        this.pAcc[i] = 0;
      }
      this.pX[i] += (f.dx * d) / view.ax; this.pY[i] += (f.dy * d) / view.ay;
      this.pAge[i] += dtN; this.pV[i] = f.v;
      this.pVis[i] = f.v >= RIPPLE.packetMinMs ? Math.min(1, this.pVis[i] + ease) : Math.max(0, this.pVis[i] - ease);
    }
  }

  /** Fade of a thread / packet: ends of its life × its visibility at the speed limit. */
  threadFade(i: number): number { return lifeFade(this.tAge[i], this.tLife[i]) * this.tVis[i]; }
  packetFade(i: number): number { return lifeFade(this.pAge[i], this.pLife[i]) * this.pVis[i]; }

  /**
   * The still frame (`?srstill=1`): every particle is put into the middle of its life (no fade at the
   * ends) and its visibility onto its speed — the picture shows the steady state, not a moment of fading in.
   */
  settle(): void {
    for (let i = 0; i < this.threads; i++) if (this.tAlive[i]) { this.tAge[i] = Math.max(this.tAge[i], RIPPLE.fadeFrames); this.tLife[i] = Math.max(this.tLife[i], this.tAge[i] + RIPPLE.fadeFrames); this.tVis[i] = this.tV[i] >= RIPPLE.threadMinMs ? 1 : 0; }
    for (let i = 0; i < this.packets; i++) if (this.pAlive[i]) { this.pAge[i] = Math.max(this.pAge[i], RIPPLE.fadeFrames); this.pLife[i] = Math.max(this.pLife[i], this.pAge[i] + RIPPLE.fadeFrames); this.pVis[i] = this.pV[i] >= RIPPLE.packetMinMs ? 1 : 0; }
  }

  /**
   * The way of packet `i` in screen px, head first (its position, then the remembered points, newest first).
   * Returns the number of points written.
   */
  packetWay(i: number, view: RippleView, xs: Float32Array, ys: Float32Array): number {
    xs[0] = view.ax * this.pX[i] + view.bx; ys[0] = view.ay * this.pY[i] + view.by;
    const len = this.pLen[i], head = this.pHead[i];
    for (let k = 0; k < len; k++) {
      const o = (i * PT + ((head - k + PT) % PT)) * 2;
      xs[k + 1] = view.ax * this.pTrail[o] + view.bx; ys[k + 1] = view.ay * this.pTrail[o + 1] + view.by;
    }
    return len + 1;
  }
  /** The last `count` positions of thread `i` in screen px, newest first. Returns the number written. */
  threadWay(i: number, view: RippleView, count: number, xs: Float32Array, ys: Float32Array): number {
    const len = Math.min(this.tLen[i], count), head = this.tHead[i];
    for (let k = 0; k < len; k++) {
      const o = (i * TL + ((head - k + TL) % TL)) * 2;
      xs[k] = view.ax * this.tTrail[o] + view.bx; ys[k] = view.ay * this.tTrail[o + 1] + view.by;
    }
    return len;
  }
}
