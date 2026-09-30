/**
 * stackPoint.ts — liest die Tabelle des Stationswerts von buscosun Fusion (Phase FS, `audit/fusion-stationswert.md`) für den
 * Cube-Pfad: `point/stack.client.json` (`stationValue.ts`, Provenienz `archive`). Dasselbe Muster wie `learnedPoint.ts`: über
 * den Store, geprüft (`validateStackTable`), nie blockierend und nie still — fehlt die Datei oder ist sie ungültig, rechnet der
 * Cube-Pfad ohne Stationswert und sagt es in einer Notiz.
 */
import { POINT_STACK_PATH } from '../cubeFormat';
import { validateStackTable, type StackTable } from '../../pointForecast/fusion/stationValue';
import { sha256Hex } from './learnedPoint';
import { tableAgeOf, STACK_STALE_DAYS, type TableAge } from './tableAge';
import type { PointStore } from './store';

export interface LoadedStack {
  path: string;
  /** sha256 der Bytes (hex); `null` ohne Datei oder ohne WebCrypto. */
  hash: string | null;
  /** Die geprüfte Tabelle; `null` = nichts gilt ⇒ Rechnung ohne Stationswert. */
  table: StackTable | null;
  notes: string[];
  /** AX-2 (V-EX-6): das Alter der Tabelle, benannt — nie stumm, nie blockierend. */
  age?: TableAge;
}

export async function loadStack(store: PointStore, opts: { signal?: AbortSignal; nowMs?: number } = {}): Promise<LoadedStack> {
  const path = POINT_STACK_PATH;
  let bytes: Uint8Array | null = null;
  try { bytes = await store.bytes(path, { priority: 'low', ...(opts.signal ? { signal: opts.signal } : {}) }); } catch { bytes = null; }
  if (!bytes) return { path, hash: null, table: null, notes: [`stationValue: ${path} nicht lesbar — Rechnung ohne Stationswert`] };
  const hash = await sha256Hex(bytes);
  let doc: unknown;
  try { doc = JSON.parse(new TextDecoder().decode(bytes)); } catch { return { path, hash, table: null, notes: [`stationValue: ${path} ist kein JSON — Rechnung ohne Stationswert`] }; }
  const errs = validateStackTable(doc);
  if (errs.length) return { path, hash, table: null, notes: [`stationValue: ${path} ungültig (${errs.slice(0, 3).join('; ')}) — Rechnung ohne Stationswert`] };
  const table = doc as StackTable;
  // AX-2 (V-EX-6): die Tabelle des Stationswerts ist auf Ausgabetagen gefittet — ihr Alter wird genannt, sie wirkt weiter.
  const age = tableAgeOf('stationValue', table, opts.nowMs ?? Date.now(), STACK_STALE_DAYS);
  return { path, hash, table, notes: [age.note], age };
}
