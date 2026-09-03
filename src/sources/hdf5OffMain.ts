/**
 * LE2/H3 — HDF5/NetCDF-Parsen off-main: EINE Brücke für INCA (AT) und rzc (CH).
 *
 * Der Worker (`hdf5Worker.ts`) läuft lazy, einmal je Sitzung; `warmHdf5Worker()`
 * startet ihn schon beim Absetzen des Abrufs, damit Isolate + jsfive-Eval
 * (≈ 0,3 s) im Download-Schatten liegen. Die Eingabe geht per Structured Clone
 * (1,3 MB ≈ 1 ms), NICHT transferiert — so bleibt der Puffer für den benannten
 * Rückfall auf den identischen Hauptthread-Code erhalten (Muster `decompress.ts`).
 *
 * Kill-Switch (Rule 2): `?h5worker=0` für diesen Aufruf, `localStorage.h5worker = '0'`
 * dauerhaft — dann parst der Hauptthread wie bis LE1. Die Query schlägt den
 * Speicher in beide Richtungen (`?h5worker=1`).
 */

import { parseIncaNetcdf, type IncaParsed } from './incaParse';
import { parseRzcHdf5, type RzcParsed } from './rzcParse';
import type { QuadCorners } from '../scalar/RainLayer';

interface IncaMsg { id: number; ok: true; kind: 'inca'; corners: QuadCorners; frames: { leadHours: number; width: number; height: number; valuesBuf: ArrayBuffer }[] }
interface RzcMsg { id: number; ok: true; kind: 'rzc'; width: number; height: number; corners: QuadCorners; validAtMs: number | null; valuesBuf: ArrayBuffer }
interface ErrMsg { id: number; ok: false; error?: string }
type Msg = IncaMsg | RzcMsg | ErrMsg;

interface Pending { resolve: (m: IncaMsg | RzcMsg) => void; reject: (e: Error) => void }

let worker: Worker | null = null;
let usable = true, inited = false, nextId = 1;
const pending = new Map<number, Pending>();

/** `?h5worker=0` / `localStorage.h5worker='0'` ⇒ false. Query schlägt Speicher. */
export function hdf5WorkerEnabled(search?: string, stored?: string | null): boolean {
  let q: string | null = null;
  try {
    const s = search ?? (typeof window !== 'undefined' ? window.location.search : '');
    q = new URLSearchParams(s).get('h5worker');
  } catch { /* kein window */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let st: string | null | undefined = stored;
  if (st === undefined) {
    try { st = typeof window !== 'undefined' ? window.localStorage?.getItem('h5worker') ?? null : null; } catch { st = null; }
  }
  return st !== '0';
}

function init(): void {
  if (inited) return;
  inited = true;
  if (typeof Worker === 'undefined' || !hdf5WorkerEnabled()) { usable = false; return; }
  try {
    const w = new Worker(new URL('./hdf5Worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<Msg>) => {
      const d = e.data;
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      if (d.ok) p.resolve(d);
      else p.reject(new Error(d.error || 'hdf5 worker error'));
    };
    w.onerror = () => {
      usable = false;
      for (const [id, p] of pending) { pending.delete(id); p.reject(new Error('hdf5 worker crashed')); }
    };
    worker = w;
  } catch {
    usable = false;
  }
}

/** Worker vorab starten (beim Absetzen des Abrufs) — Bonus, nie Pflicht. */
export function warmHdf5Worker(): void {
  try { init(); } catch { /* Rückfall greift beim Parsen */ }
}

/** Ist der Worker-Pfad in dieser Sitzung aktiv? (nach `init`) */
export function _hdf5WorkerActive(): boolean { return inited && usable && worker !== null; }

function send(kind: 'inca' | 'rzc', buf: ArrayBuffer): Promise<IncaMsg | RzcMsg> | null {
  init();
  if (!usable || !worker) return null;
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try { w.postMessage({ id, kind, buf }); } catch (err) { pending.delete(id); reject(err instanceof Error ? err : new Error(String(err))); }
  });
}

/** INCA-NetCDF off-main; Rückfall = `parseIncaNetcdf` auf dem Hauptthread. */
export async function parseIncaOffMain(buf: ArrayBuffer): Promise<IncaParsed> {
  const p = send('inca', buf);
  if (p) {
    try {
      const m = await p as IncaMsg;
      return {
        corners: m.corners,
        frames: m.frames.map((f) => ({ leadHours: f.leadHours, width: f.width, height: f.height, values: new Uint8Array(f.valuesBuf) })),
      };
    } catch (err) {
      console.warn('[buscosun] INCA-Parse im Worker fehlgeschlagen — Hauptthread übernimmt:', err instanceof Error ? err.message : err);
    }
  }
  return parseIncaNetcdf(buf);
}

/** rzc-HDF5 off-main; Rückfall = `parseRzcHdf5` auf dem Hauptthread. */
export async function parseRzcOffMain(buf: ArrayBuffer): Promise<RzcParsed> {
  const p = send('rzc', buf);
  if (p) {
    try {
      const m = await p as RzcMsg;
      return { values: new Uint8Array(m.valuesBuf), width: m.width, height: m.height, corners: m.corners, validAtMs: m.validAtMs };
    } catch (err) {
      console.warn('[buscosun] rzc-Parse im Worker fehlgeschlagen — Hauptthread übernimmt:', err instanceof Error ? err.message : err);
    }
  }
  return parseRzcHdf5(buf);
}
