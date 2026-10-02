/**
 * precipCalPoint.ts — liest die Tabelle der Regenwahrscheinlichkeits-Nachkalibrierung von buscosun Fusion 8 (Phase AX §6l,
 * `audit/fusion-ausbau.md`) für den Cube-Pfad: `point/precip-cal.client.json` (`precipCal.ts`, Provenienz `archive`). Dasselbe
 * Muster wie `stackPoint.ts`: über den Store, geprüft (`validatePrecipCalTable`), nie blockierend und nie still — fehlt die
 * Datei oder ist sie ungültig, bleibt die Hürde unverändert und der Pfad sagt es in einer Notiz.
 */
import { POINT_PRECIP_CAL_PATH } from '../cubeFormat';
import { validatePrecipCalTable, type PrecipCalTable } from '../../pointForecast/fusion/precipCal';
import { sha256Hex } from './learnedPoint';
import type { PointStore } from './store';

export interface LoadedPrecipCal {
  path: string;
  /** sha256 der Bytes (hex); `null` ohne Datei oder ohne WebCrypto. */
  hash: string | null;
  /** Die geprüfte Tabelle; `null` = nichts gilt ⇒ Hürde unverändert. */
  table: PrecipCalTable | null;
  notes: string[];
}

export async function loadPrecipCal(store: PointStore, opts: { signal?: AbortSignal } = {}): Promise<LoadedPrecipCal> {
  const path = POINT_PRECIP_CAL_PATH;
  let bytes: Uint8Array | null = null;
  try { bytes = await store.bytes(path, { priority: 'low', ...(opts.signal ? { signal: opts.signal } : {}) }); } catch { bytes = null; }
  if (!bytes) return { path, hash: null, table: null, notes: [`precipCal: ${path} nicht lesbar — Hürde unverändert`] };
  const hash = await sha256Hex(bytes);
  let doc: unknown;
  try { doc = JSON.parse(new TextDecoder().decode(bytes)); } catch { return { path, hash, table: null, notes: [`precipCal: ${path} ist kein JSON — Hürde unverändert`] }; }
  const errs = validatePrecipCalTable(doc);
  if (errs.length) return { path, hash, table: null, notes: [`precipCal: ${path} ungültig (${errs.slice(0, 3).join('; ')}) — Hürde unverändert`] };
  const table = doc as PrecipCalTable;
  const written = Object.values(table.entries).filter((e) => e.written).length;
  return { path, hash, table, notes: [`precipCal: Tabelle ${table.fitVersion} (${table.period.from}…${table.period.to}, ${table.period.issueDays} Ausgabetage, ${table.rows} Zeilen; ${written} von ${Object.keys(table.entries).length} Einträgen geschrieben, Rest Identität; Provenienz archive)`] };
}
