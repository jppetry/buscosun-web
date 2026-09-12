/**
 * keepSpec.mjs — deklaratives `keep`-Prädikat für den Decoder (PD-F2e).
 *
 * Eine Funktion lässt sich nicht an einen Worker senden; der Adapter beschreibt, was er behalten
 * will, und Worker wie Inline-Pfad bauen daraus dasselbe Prädikat:
 *   intervalEndMinute      Nachrichten, deren statistisches Intervall auf dieser Minute endet
 *   intervalEndMinuteIfAny wie oben — aber NUR, wenn die Datei überhaupt Intervall-Enden trägt
 *                          (dwdEps: t_2m hat keine, tot_prec hat vier Viertelstunden je Member);
 *                          braucht den Sektionslauf über alle Köpfe (`scanGrib2Headers`, ohne Entpacken)
 *   paramIds               [[discipline, category, number], …] — nur diese Größen
 *   perturbationNumbers    nur diese Member
 * Importiert nur den Decoder — kein shared.mjs (der Worker darf es nicht laden).
 */
import { scanGrib2Headers } from '../../../src/sources/gribDecode.ts';

export function keepFn(spec) {
  if (!spec) return null;
  return (h) => {
    if (spec.intervalEndMinute != null && h.intervalEndMinute !== spec.intervalEndMinute) return false;
    if (spec.paramIds && !spec.paramIds.some(([d, c, n]) => h.discipline === d && h.parameterCategory === c && h.parameterNumber === n)) return false;
    if (spec.perturbationNumbers && !spec.perturbationNumbers.includes(h.perturbationNumber)) return false;
    return true;
  };
}

/**
 * Spezifikation am Dateiinhalt auflösen. Liefert `{ keep, total }` — `total` ist die Zahl ALLER
 * Nachrichten, wenn dafür ohnehin die Köpfe gelesen wurden, sonst `null`.
 */
export function resolveKeep(raw, spec) {
  if (!spec) return { keep: null, total: null };
  let s = spec, total = null;
  if (spec.intervalEndMinuteIfAny != null) {
    const heads = scanGrib2Headers(raw);
    total = heads.length;
    const { intervalEndMinuteIfAny, ...rest } = spec;
    s = heads.some((h) => h.intervalEndMinute != null) ? { ...rest, intervalEndMinute: intervalEndMinuteIfAny } : rest;
  }
  return { keep: keepFn(s), total };
}
