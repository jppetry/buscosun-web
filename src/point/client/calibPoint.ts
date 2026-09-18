/**
 * calibPoint.ts — liest `point/calib.json` für buscosun Fusion (Phase FI, AP13; V-FI-66).
 *
 * Bis AP13 las kein Client die Datei: der Cube-Pfad rechnete mit Code-Konstanten, und ein gemessener Wert aus AP10
 * wäre wirkungslos geblieben. Dieser Leser holt die Datei über den Store (dort 24 h zwischengespeichert,
 * `cache.ts`), prüft sie (`calibDoc.ts`: nur `measured` mit Beleg gilt) und liefert die Überschreibungen für die
 * Rechnung — plus einen Hash der Bytes, damit Ausgabe und Archiv sagen können, mit welcher Datei gerechnet wurde.
 *
 * Nie blockierend und nie still: fehlt die Datei, ist sie unlesbar oder gilt nichts, rechnet der Cube-Pfad mit den
 * Setzungen und sagt es in einer Notiz. Eingeschaltet nur über `CubeIo.calibSource: 'json'` (Voreinstellung aus).
 */
import { POINT_CALIB_PATH } from '../cubeFormat';
import { validateCalibDocument, calibOverridesFrom, type CalibOverrides } from '../calibDoc';
import type { PointStore } from './store';

export interface LoadedCalib {
  path: string;
  /** Schema der gelesenen Datei; `null` = nicht lesbar oder nicht da. */
  schema: number | null;
  /** sha256 der Bytes (hex, 64 Zeichen); `null` ohne Datei. */
  hash: string | null;
  /** Was die Rechnung übernimmt; `null` = nichts gilt ⇒ Setzungen. */
  overrides: CalibOverrides | null;
  notes: string[];
}

async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) return null;
  const buf = await subtle.digest('SHA-256', bytes.slice().buffer);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function loadCalib(store: PointStore, opts: { signal?: AbortSignal } = {}): Promise<LoadedCalib> {
  const path = POINT_CALIB_PATH;
  let bytes: Uint8Array | null = null;
  // `low`: die Datei darf den Chunks keine Leitung nehmen (sie ist 6 KB und meist im Cache).
  try { bytes = await store.bytes(path, { priority: 'low', ...(opts.signal ? { signal: opts.signal } : {}) }); } catch { bytes = null; }
  if (!bytes) return { path, schema: null, hash: null, overrides: null, notes: [`calib: ${path} nicht lesbar — Setzungen`] };
  const hash = await sha256Hex(bytes);
  let doc: unknown;
  try { doc = JSON.parse(new TextDecoder().decode(bytes)); } catch { return { path, schema: null, hash, overrides: null, notes: [`calib: ${path} ist kein JSON — Setzungen`] }; }
  const v = validateCalibDocument(doc);
  if (!v.readable) return { path, schema: v.schema, hash, overrides: null, notes: [`calib: Schema ${String(v.schema)} nicht lesbar — Setzungen`] };
  const overrides = calibOverridesFrom(v);
  const notes: string[] = [];
  for (const r of v.rejected) notes.push(`calib: ${r.path} als measured verworfen (${r.why}) — Setzung gilt`);
  if (overrides?.unwired.length) notes.push(`calib: gemessen, aber noch ohne Einspeisestelle: ${overrides.unwired.join(', ')} — Setzung gilt`);
  if (!overrides) notes.push(`calib: Schema ${v.schema}, keine geltende Messung — Setzungen`);
  return { path, schema: v.schema, hash, overrides, notes };
}
