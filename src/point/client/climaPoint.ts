/**
 * climaPoint.ts — liest das Klimatologieprodukt von buscosun Fusion (Phase FX-5, E-FX-8; `audit/fusion-forschung.md` §6.5)
 * für den Cube-Pfad: `point/static/clima/v1/stations.json` (`src/point/fusionFit/climaProduct.ts`, Provenienz `hindcast`).
 * Dasselbe Muster wie `learnedPoint.ts`: über den Store (zeitlos im Cache — `point/static/` liegt in `TIMELESS_PATHS`),
 * Priorität `low`, geprüft (`validateClimaProduct`), nie blockierend und nie still — fehlt die Datei oder ist sie ungültig,
 * rechnet die station-Tabelle ohne μ_c (die gelisteten Größen bleiben `absent`) und sagt es in einer Notiz. Eingeschaltet
 * nur über `CubeIo.climaSource: 'json'`; wirkt nur mit `FuseCubeOptions.learned` und einer Tabelle mit μ_c-Spalte.
 */
import { POINT_CLIMA_PATH } from '../cubeFormat';
import { validateClimaProduct, type ClimaProduct } from '../fusionFit/climaProduct';
import { sha256Hex } from './learnedPoint';
import type { PointStore } from './store';

export interface LoadedClimaProduct {
  path: string;
  /** sha256 der Bytes (hex); `null` ohne Datei oder ohne WebCrypto. */
  hash: string | null;
  /** Das geprüfte Produkt; `null` = nichts gilt ⇒ station-Tabellen rechnen ohne μ_c. */
  product: ClimaProduct | null;
  notes: string[];
}

export async function loadClimaProduct(store: PointStore, opts: { signal?: AbortSignal } = {}): Promise<LoadedClimaProduct> {
  const path = POINT_CLIMA_PATH;
  let bytes: Uint8Array | null = null;
  try { bytes = await store.bytes(path, { priority: 'low', ...(opts.signal ? { signal: opts.signal } : {}) }); } catch { bytes = null; }
  if (!bytes) return { path, hash: null, product: null, notes: [`learnedClima: ${path} nicht lesbar — station-Tabelle ohne μ_c`] };
  const b = bytes;
  // Hash, Parsen und Prüfung hängen nur an den Bytes — über den Merker des Stores, wenn er einen hat (V-AW-23).
  const core = async (): Promise<LoadedClimaProduct> => {
    const hash = await sha256Hex(b);
    let doc: unknown;
    try { doc = JSON.parse(new TextDecoder().decode(b)); } catch { return { path, hash, product: null, notes: [`learnedClima: ${path} ist kein JSON — station-Tabelle ohne μ_c`] }; }
    const errs = validateClimaProduct(doc);
    if (errs.length) return { path, hash, product: null, notes: [`learnedClima: ${path} ungültig (${errs.slice(0, 3).join('; ')}) — station-Tabelle ohne μ_c`] };
    return { path, hash, product: doc as ClimaProduct, notes: [] };
  };
  const c = await (store.derived ? store.derived(b, 'clima', core) : core());
  return { ...c, notes: [...c.notes] };
}
