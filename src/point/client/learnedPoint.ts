/**
 * learnedPoint.ts — liest die gelernten Tabellen von buscosun Fusion (Phase FL, FL-AP5; `audit/fusion-lernphase.md` §3.7)
 * für den Cube-Pfad: `point/fusion.client.json` (Form K, Provenienz `hindcast`, `tables.ts`). Dasselbe Muster wie
 * `calibPoint.ts`: über den Store (24 h im Cache), geprüft (`validateTables`), nie blockierend und nie still — fehlt die
 * Datei oder ist sie ungültig, rechnet der Cube-Pfad wie ohne Option und sagt es in einer Notiz. Eingeschaltet nur über
 * `CubeIo.learnedSource: 'json'` zusammen mit `FuseCubeOptions.learned` (beides voreingestellt aus).
 */
import { POINT_LEARNED_PATH } from '../cubeFormat';
import { validateTables, type FusionTables } from '../fusionFit/tables';
import type { PointStore } from './store';

export interface LoadedLearned {
  path: string;
  /** sha256 der Bytes (hex); `null` ohne Datei oder ohne WebCrypto. */
  hash: string | null;
  /** Die geprüften Tabellen; `null` = nichts gilt ⇒ Rechnung wie ohne Option. */
  tables: FusionTables | null;
  notes: string[];
}

async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) return null;
  const buf = await subtle.digest('SHA-256', bytes.slice().buffer);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function loadLearned(store: PointStore, opts: { signal?: AbortSignal } = {}): Promise<LoadedLearned> {
  const path = POINT_LEARNED_PATH;
  let bytes: Uint8Array | null = null;
  try { bytes = await store.bytes(path, { priority: 'low', ...(opts.signal ? { signal: opts.signal } : {}) }); } catch { bytes = null; }
  if (!bytes) return { path, hash: null, tables: null, notes: [`learned: ${path} nicht lesbar — Rechnung ohne Lernstufe`] };
  const hash = await sha256Hex(bytes);
  let doc: unknown;
  try { doc = JSON.parse(new TextDecoder().decode(bytes)); } catch { return { path, hash, tables: null, notes: [`learned: ${path} ist kein JSON — Rechnung ohne Lernstufe`] }; }
  const errs = validateTables(doc);
  if (errs.length) return { path, hash, tables: null, notes: [`learned: ${path} ungültig (${errs.slice(0, 3).join('; ')}) — Rechnung ohne Lernstufe`] };
  const t = doc as FusionTables;
  const written = Object.values(t.mean).filter((e) => e.status === 'written').length;
  return { path, hash, tables: t, notes: written ? [] : ['learned: Tabellen ohne geschriebenes Stratum — Rechnung ohne Lernstufe'] };
}
