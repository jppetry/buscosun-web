/**
 * Teilen · Zeitpunkt als „Stunden ab jetzt" (Autobahnwetter `t=0…6`, Seewetter `t=0…78`).
 *
 * Diese Seiten führen die Zeit relativ. Ein geteilter Link mit `t=3` zeigt dem Empfänger, der später öffnet, einen anderen
 * Zeitpunkt, ohne es zu sagen. Im Link steht deshalb der ABSOLUTE Zeitpunkt (volle Stunde, UTC: `t=2026-11-02T17:00Z`, wie
 * auf den anderen Seiten); beim Öffnen wird er zurück in Stunden gerechnet. Vorbei ⇒ „jetzt" + `past`, jenseits des Horizonts
 * ⇒ Ende des Fensters + `beyond` — die Seite sagt es (`StaleLinkNotice`). Die alte Stundenform (`t=3`) bleibt lesbar.
 * Rein, nur das Zeitschema der Teilen-Links als Import.
 */
import { formatValidTime, parseValidTime } from './shareSchema';

const HOUR = 3_600_000;
/** Die volle Stunde, ab der „+t h" zählt. */
export const baseHour = (nowMs: number): number => Math.floor(nowMs / HOUR) * HOUR;

/** `t` Stunden voraus → absoluter Zeitpunkt für den Link (`2026-11-02T17:00Z`). */
export const hoursToParam = (t: number, nowMs: number): string => formatValidTime(baseHour(nowMs) + t * HOUR);

/** Ein `t` aus dem Link in Stunden — nur die absolute Form; sonst `null` (die Seite liest `t=3` selbst). */
export function hoursFromParam(raw: string | null, nowMs: number, maxH: number): { t: number; past: number | null; beyond: number | null } | null {
  if (!raw || !raw.includes('T')) return null;
  const ms = parseValidTime(raw);
  if (ms == null) return null;
  const h = Math.round((ms - baseHour(nowMs)) / HOUR);
  if (h < 0) return { t: 0, past: ms, beyond: null };
  if (h > maxH) return { t: maxH, past: null, beyond: ms };
  return { t: h, past: null, beyond: null };
}

/** Query mit absolutem `t` → Query mit Stunden-`t` (was der Seitenparser versteht) + was geklemmt wurde. */
export function normalizeHourSearch(search: string, nowMs: number, maxH: number): { search: string; past: number | null; beyond: number | null } {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const conv = hoursFromParam(q.get('t'), nowMs, maxH);
  if (!conv) return { search, past: null, beyond: null };
  q.set('t', String(conv.t));
  return { search: `?${q.toString()}`, past: conv.past, beyond: conv.beyond };
}

/** In einer gebauten URL das Stunden-`t` durch das absolute ersetzen (`t=0` fehlt ohnehin). */
export const absolutizeHourParam = (url: string, t: number, nowMs: number): string =>
  t > 0 ? url.replace(/([?&])t=\d+/, `$1t=${encodeURIComponent(hoursToParam(t, nowMs))}`) : url;
