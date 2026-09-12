/**
 * decodePool.mjs — Pool von `worker_threads` für Dekodieren + Abtasten (PD-F2d).
 *
 * ── Warum ───────────────────────────────────────────────────────────────────
 * Gemessen (§50.0): Stufe 1 braucht WARM — also ohne ein Byte aus dem Netz — 393 s, davon
 * ≈ 320 s Dekodieren und Abtasten im Hauptthread. Bahnen (F2b) überlappen Netz und Rechnen,
 * aber das Rechnen selbst bleibt EIN Thread. Der Runner hat vier Kerne. Der Pool verteilt
 * `decodeGrib2 + sampleRegularToTier` auf `POINT_WORKERS` Worker (Standard: Kerne − 1, Deckel 6).
 *
 * ── Regeln ──────────────────────────────────────────────────────────────────
 * • Dieselben reinen Funktionen wie im Hauptthread ⇒ dasselbe Ergebnis; der Byte-Beweis läuft
 *   wie bei jeder Etappe über `compareTrees`.
 * • `POINT_WORKERS=0` oder ein Spawn-Fehler ⇒ **hörbarer Inline-Rückfall** (dieselben Funktionen
 *   im Hauptthread), `mode: 'inline'` in den Statistiken und im Manifest.
 * • In-flight-Deckel = 2 × Poolgröße: je Auftrag lebt ein Rohpuffer (ICON-CH1 bis 26 MiB).
 * • Transfer statt Kopie (ArrayBuffer wird an den Worker abgegeben) — der Aufrufer darf die
 *   Bytes danach nicht mehr anfassen. `fetchBytes` liefert frische Puffer, also gefahrlos.
 * • Der Worker braucht `--experimental-strip-types` für den `.ts`-Import des Decoders; den
 *   Hook `register-ts.mjs` nicht (alle Importe im Worker tragen ihre Endung).
 */
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { decodeGrib2, decodeGrib2All } from '../../../src/sources/gribDecode.ts';
import { sampleRegularToTier, sampleUnstructuredToTier, convert } from './sample.mjs';
import { resolveKeep } from './keepSpec.mjs';

const WANTED = (() => {
  const v = process.env.POINT_WORKERS;
  if (v === undefined || v === '') return Math.min(6, Math.max(1, availableParallelism() - 1));
  return Math.max(0, Number(v) || 0);
})();

/** Ein Stufenobjekt auf das reduzieren, was der Worker braucht — `TIERS` trägt mehr (leadHours, sources). */
export const tierGeometry = (tier) => ({ id: tier.id, ny: tier.ny, nx: tier.nx, lat0: tier.lat0, lon0: tier.lon0, deg: tier.deg });

/** Inline-Fassung derselben Operationen — Rückfall UND Referenz. */
const inlineOps = {
  setIndex(indices, msg) { indices.set(msg.key, msg.idx); return { ok: true }; },
  decodeSample(indices, msg) {
    const f = decodeGrib2(new Uint8Array(msg.raw));
    return { ok: true, header: strip(f), grid: sampleField(indices, f, msg) };
  },
  decodeSampleMany(indices, msg) {
    const raw = new Uint8Array(msg.raw);
    const { keep, total } = resolveKeep(raw, msg.keep);
    const all = decodeGrib2All(raw, keep ? { keep } : undefined);
    const items = all.map((f) => ({ header: strip(f), grid: sampleField(indices, f, msg) }));
    return { ok: true, items, total: total ?? all.length };
  },
  decodeRaw(indices, msg) { const f = decodeGrib2(new Uint8Array(msg.raw)); return { ok: true, header: strip(f), values: f.values }; },
  sampleValues(indices, msg) { return { ok: true, grid: sampleRegularToTier(msg.field, msg.tier, { fillGaps: msg.fillGaps ?? true }) }; },
};
function strip(f) { const h = { ...f }; delete h.values; return h; }
function sampleField(indices, f, msg) {
  const { tier, grid, idxKey, fillGaps = true, unit = null } = msg;
  let g;
  if (grid === 'unstructured') {
    const idx = indices.get(idxKey);
    if (!idx) throw new Error(`decodePool: Nachbarindex ${idxKey} nicht gesetzt`);
    g = sampleUnstructuredToTier(f.values, idx, tier);
  } else {
    g = sampleRegularToTier(f, tier, { fillGaps });
  }
  return unit ? convert(g, unit) : g;
}

class DecodePool {
  constructor(n) {
    this.requested = n;
    this.workers = [];
    this.pending = new Map();      // id → { resolve, reject, worker }
    this.queue = [];               // wartende Aufträge, wenn alle Worker voll sind
    this.busy = [];                // offene Aufträge je Worker
    this.nextId = 1;
    this.inlineIndices = new Map();
    this.indices = new Map();      // key → Int32Array, für spät gestartete Worker
    this.stats = { jobs: 0, inlineJobs: 0, errors: 0, msWait: 0 };
    this.mode = 'inline';
    if (n > 0) this.spawn(n);
    this.maxInflight = Math.max(2, 2 * Math.max(1, this.workers.length));
    this.inflight = 0;
  }

  spawn(n) {
    for (let i = 0; i < n; i++) {
      try {
        const w = new Worker(new URL('./gribWorker.mjs', import.meta.url), {
          execArgv: ['--experimental-strip-types', '--no-warnings'],
        });
        w.on('message', (m) => this.onMessage(w, m));
        w.on('error', (e) => this.onWorkerError(w, e));
        w.on('exit', (code) => { if (code !== 0 && !this.closing) this.onWorkerError(w, new Error(`Worker beendet mit Code ${code}`)); });
        w.unref();
        this.workers.push(w);
        this.busy.push(0);
      } catch (e) {
        console.log(`  ⚠ decodePool: Worker ${i + 1} nicht startbar (${e.message}) — rechne inline`);
        break;
      }
    }
    this.mode = this.workers.length > 0 ? 'workers' : 'inline';
  }

  onMessage(w, m) {
    const p = this.pending.get(m.id);
    if (!p) return;
    this.pending.delete(m.id);
    const wi = this.workers.indexOf(w);
    if (wi >= 0 && --this.busy[wi] === 0) w.unref();   // idle: den Prozess nicht am Leben halten
    if (m.ok) p.resolve(m); else { this.stats.errors++; p.reject(new Error(m.error)); }
    this.drain();
  }

  /** Ein Worker ist gestorben: seine offenen Aufträge laufen inline weiter, der Pool schrumpft. */
  onWorkerError(w, e) {
    const i = this.workers.indexOf(w);
    if (i < 0) return;
    console.log(`  ⚠ decodePool: Worker ausgefallen (${e.message}) — ${this.workers.length - 1} verbleiben`);
    this.workers.splice(i, 1); this.busy.splice(i, 1);
    for (const [id, p] of [...this.pending]) {
      if (p.worker !== w) continue;
      this.pending.delete(id);
      try { p.resolve(this.runInline(p.msg)); } catch (err) { p.reject(err); }
    }
    if (this.workers.length === 0) this.mode = 'inline';
    this.drain();
  }

  runInline(msg) {
    this.stats.inlineJobs++;
    const fn = inlineOps[msg.op];
    if (!fn) throw new Error(`decodePool: unbekannte Operation ${msg.op}`);
    return fn(this.inlineIndices, msg);
  }

  drain() {
    while (this.queue.length && this.workers.length) {
      let best = 0;
      for (let i = 1; i < this.busy.length; i++) if (this.busy[i] < this.busy[best]) best = i;
      if (this.busy[best] >= 2) break;          // je Worker höchstens zwei offene Aufträge
      const job = this.queue.shift();
      const w = this.workers[best];
      this.busy[best]++;
      job.worker = w;
      this.pending.set(job.msg.id, job);
      w.ref();                                  // beschäftigt: der Prozess wartet auf die Antwort
      w.postMessage(job.msg, job.transfer);
    }
  }

  /** Auftrag ausführen — im Worker, oder inline, wenn keiner läuft. */
  run(msg, transfer = []) {
    this.stats.jobs++;
    if (this.workers.length === 0) return Promise.resolve(this.runInline(msg));
    msg.id = this.nextId++;
    const t0 = Date.now();
    return new Promise((resolve, reject) => {
      this.queue.push({ msg, transfer, resolve: (m) => { this.stats.msWait += Date.now() - t0; resolve(m); }, reject, worker: null });
      this.drain();
    });
  }

  /** Nachbarindex an ALLE Worker und den Inline-Pfad geben (einmal je (Quelle, Stufe)). */
  async setIndex(key, idx) {
    this.indices.set(key, idx);
    this.inlineIndices.set(key, idx);
    await Promise.all(this.workers.map((w) => {
      const id = this.nextId++;
      return new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject, worker: w, msg: { op: 'setIndex', key, idx, id } });
        this.busy[this.workers.indexOf(w)]++;
        w.ref();
        w.postMessage({ op: 'setIndex', key, idx: Int32Array.from(idx), id });   // Kopie: der Index bleibt im Hauptthread
      });
    }));
  }

  info() {
    return { requested: this.requested, running: this.workers.length, mode: this.mode, ...this.stats, pending: this.pending.size, queued: this.queue.length };
  }

  async close() {
    this.closing = true;
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = []; this.busy = [];
  }
}

let pool = null;
/** Der Prozess-Pool (lazy). */
export function getPool() {
  if (!pool) pool = new DecodePool(WANTED);
  return pool;
}
export function poolInfo() { return pool ? pool.info() : { requested: WANTED, running: 0, mode: WANTED > 0 ? 'not-started' : 'inline' }; }
export async function closePool() { if (pool) { await pool.close(); pool = null; } }

/** Netzfreier Selbsttest: Rundreise Worker ⇔ inline byte-gleich, Fehlerweg, Rückfall. */
export async function decodePoolSelfTest() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  const tier = { id: 't1', ny: 201, nx: 241, lat0: 45.5, lon0: 5.5, deg: 0.05 };
  let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const mkField = () => {
    const ni = 600, nj = 500, values = new Float32Array(ni * nj);
    for (let k = 0; k < values.length; k++) values[k] = rnd() < 0.1 ? NaN : Math.fround(rnd() * 40 - 10);
    return { ni, nj, lat1: 44.99, lon1: 4.99, di: 0.02, dj: 0.02, scanMode: 0x40, values };
  };
  const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;

  const p = new DecodePool(2);
  add('Pool startet 2 Worker (oder faellt hoerbar inline)', p.mode === 'workers' ? p.workers.length === 2 : p.mode === 'inline', p.mode);
  const f = mkField();
  const inline = sampleRegularToTier(f, tier);
  const viaPool = await p.run({ op: 'sampleValues', field: f, tier, fillGaps: true });
  add('Rundreise Worker ⇔ inline: Stufengitter byte-gleich', same(inline, viaPool.grid), `${inline.length} Zellen`);
  // Mehrere Auftraege gleichzeitig, Ergebnisse den Auftraegen richtig zugeordnet.
  const fields = Array.from({ length: 6 }, mkField);
  const results = await Promise.all(fields.map((ff) => p.run({ op: 'sampleValues', field: ff, tier })));
  add('6 gleichzeitige Auftraege: jedes Ergebnis gehoert zu seinem Feld', results.every((r, i) => same(r.grid, sampleRegularToTier(fields[i], tier))));
  // Fehlerweg: unbekannte Operation kommt als Ablehnung, nicht als Absturz.
  let rejected = false;
  await p.run({ op: 'nope' }).catch(() => { rejected = true; });
  add('Fehler im Worker ⇒ abgelehnter Promise, Pool lebt weiter', rejected && (p.mode === 'inline' || p.workers.length === 2));
  // Ungueltiges GRIB ⇒ Fehler, kein Absturz.
  let badGrib = false;
  await p.run({ op: 'decodeSample', raw: new Uint8Array([1, 2, 3, 4]).buffer, tier, grid: 'regular' }, []).catch(() => { badGrib = true; });
  add('kaputte GRIB-Bytes ⇒ Fehler beim Aufrufer', badGrib);
  const info = p.info();
  add('Statistik zaehlt Auftraege und Fehler', info.jobs === 9 && info.errors >= (p.mode === 'workers' ? 2 : 0), JSON.stringify({ jobs: info.jobs, errors: info.errors, mode: info.mode }));
  add('nach Fehlern laufen die Worker weiter (kein Worker verloren)', p.mode !== 'workers' || info.running === 2, `running ${info.running}`);
  await p.close();
  // Rueckfall: 0 Worker ⇒ inline, gleiche Ergebnisse.
  const q = new DecodePool(0);
  const r0 = await q.run({ op: 'sampleValues', field: f, tier });
  add('POINT_WORKERS=0 ⇒ inline, byte-gleich', q.mode === 'inline' && same(inline, r0.grid) && q.info().inlineJobs === 1);
  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}
