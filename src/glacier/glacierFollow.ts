/**
 * GL-5 — "Folgen": the glaciers a visitor follows (`gl.favs`, local, plan A8) and the time of the last visit (`gl.last`) for "Neu seit deinem letzten Besuch".
 * Storage is a per-viewer convenience only: every access is wrapped, a failing or blocked storage means "no follows", never an error; nothing leaves the device.
 * The pure parts (toggle, what is new) are tested without a browser.
 */
import { isGlacierId } from './glacierContract';
import type { GlacierFeedEvent } from './glacierFeedContract';

export const GLACIER_FAV_KEY = 'gl.favs';
export const GLACIER_LAST_KEY = 'gl.last';
export const GLACIER_FAV_MAX = 50;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const store = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/** Followed glaciers: valid ids only, no duplicates, at most 50 — a damaged value reads as empty. */
export function readFavs(s: Store | null = store()): string[] {
  try {
    const v = JSON.parse(s?.getItem(GLACIER_FAV_KEY) ?? '[]');
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => isGlacierId(x)))].slice(0, GLACIER_FAV_MAX) : [];
  } catch { return []; }
}
export function writeFavs(ids: readonly string[], s: Store | null = store()): boolean {
  try { s?.setItem(GLACIER_FAV_KEY, JSON.stringify([...new Set(ids)].slice(0, GLACIER_FAV_MAX))); return !!s; } catch { return false; }
}
/** Follow or unfollow; the newest follow comes first, the list never exceeds 50 (the oldest falls out). */
export const toggleFav = (ids: readonly string[], id: string): string[] => (ids.includes(id) ? ids.filter((x) => x !== id) : [id, ...ids].slice(0, GLACIER_FAV_MAX));

export function readLast(s: Store | null = store()): number | null {
  try { const n = Number(s?.getItem(GLACIER_LAST_KEY)); return Number.isFinite(n) && n > 0 ? n : null; } catch { return null; }
}
export function writeLast(ms: number, s: Store | null = store()): void { try { s?.setItem(GLACIER_LAST_KEY, String(Math.round(ms))); } catch { /* storage blocked: no memory of the visit */ } }

/**
 * New since the last visit: events dated AFTER the day of that visit that concern a followed glacier or are an official report (country-wide, no glacier).
 * Without a recorded visit there is no "new" — nothing is claimed.
 */
export function newSinceLastVisit(events: readonly GlacierFeedEvent[], favs: readonly string[], lastMs: number | null): GlacierFeedEvent[] {
  if (lastMs == null) return [];
  const day = new Date(lastMs).toISOString().slice(0, 10);
  return events.filter((e) => e.at > day && (e.glacier == null || favs.includes(e.glacier)));
}
