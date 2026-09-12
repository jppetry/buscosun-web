/**
 * gribWorker.mjs — Dekodieren und Abtasten in einem `worker_threads`-Worker (PD-F2d).
 *
 * Importiert BEWUSST nur reine Module: den GRIB-Decoder (`gribDecode.ts`, importfrei) und die
 * Abtastung (`sample.mjs`). Kein `shared.mjs` — dort liegen Netz, Plattencache, Zähler und der
 * AsyncLocalStorage-Kontext, und die gehören in den Hauptthread. Der Worker bekommt Bytes und
 * gibt ein Stufengitter (Float32Array, 194 KB bei Stufe 1) zurück statt des vollen Feldes
 * (bis 11,8 MB bei ICON global) — der Transfer ist der billigere Weg.
 *
 * Nachrichten (alle mit `id` für die Zuordnung der Antwort):
 *   setIndex        { key, idx: Int32Array }                       — Nachbarindex je (Quelle, Stufe)
 *   decodeSample    { raw, tier, grid, idxKey, fillGaps, unit }    → { header, grid }
 *   decodeSampleMany{ raw, tier, grid, idxKey, fillGaps, unit, keep } → { items: [{ header, grid }] }
 *   decodeRaw       { raw }                                         → { header, values }
 *   sampleValues    { field, tier, fillGaps }                       → { grid }   (nur Selbsttest)
 * Antwort bei Fehler: { id, ok: false, error }.
 */
import { parentPort } from 'node:worker_threads';
import { decodeGrib2, decodeGrib2All } from '../../../src/sources/gribDecode.ts';
import { sampleRegularToTier, sampleUnstructuredToTier, convert } from './sample.mjs';
import { resolveKeep } from './keepSpec.mjs';

const indices = new Map();

function headerOf(f) {
  const h = { ...f };
  delete h.values;
  return h;
}

function sampleField(f, msg) {
  const { tier, grid, idxKey, fillGaps = true, unit = null } = msg;
  let g;
  if (grid === 'unstructured') {
    const idx = indices.get(idxKey);
    if (!idx) throw new Error(`gribWorker: Nachbarindex ${idxKey} nicht gesetzt`);
    g = sampleUnstructuredToTier(f.values, idx, tier);
  } else {
    g = sampleRegularToTier(f, tier, { fillGaps });
  }
  if (unit) g = convert(g, unit);
  return g;
}

function handle(msg) {
  switch (msg.op) {
    case 'setIndex': {
      indices.set(msg.key, msg.idx);
      return { ok: true, transfer: [] };
    }
    case 'decodeSample': {
      const f = decodeGrib2(new Uint8Array(msg.raw));
      const grid = sampleField(f, msg);
      return { ok: true, header: headerOf(f), grid, transfer: [grid.buffer] };
    }
    case 'decodeSampleMany': {
      const raw = new Uint8Array(msg.raw);
      // PD-F2e: das Prädikat läuft IM Decoder vor der Entpackstufe — abgelehnte Nachrichten werden
      // nicht entpackt und nicht abgetastet.
      const { keep, total } = resolveKeep(raw, msg.keep);
      const all = decodeGrib2All(raw, keep ? { keep } : undefined);
      const items = [];
      const transfer = [];
      for (const f of all) {
        const grid = sampleField(f, msg);
        items.push({ header: headerOf(f), grid });
        transfer.push(grid.buffer);
      }
      return { ok: true, items, total: total ?? all.length, transfer };
    }
    case 'decodeRaw': {
      const f = decodeGrib2(new Uint8Array(msg.raw));
      return { ok: true, header: headerOf(f), values: f.values, transfer: [f.values.buffer] };
    }
    case 'sampleValues': {
      const grid = sampleRegularToTier(msg.field, msg.tier, { fillGaps: msg.fillGaps ?? true });
      return { ok: true, grid, transfer: [grid.buffer] };
    }
    default:
      throw new Error(`gribWorker: unbekannte Operation ${msg.op}`);
  }
}

parentPort.on('message', (msg) => {
  try {
    const { transfer, ...rest } = handle(msg);
    parentPort.postMessage({ id: msg.id, ...rest }, transfer);
  } catch (e) {
    parentPort.postMessage({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
