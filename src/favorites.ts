/**
 * Gespeicherte Orte (Favoriten / Heimatort) — backend-frei via localStorage.
 *
 * Schneller Wiedereinstieg: einmal gesuchte Orte als Chips auf der Startseite,
 * Ein-Klick zur Karte. Kein Konto, kein Server. Dedupe nach gerundeter
 * Koordinate, jüngster zuerst, gedeckelt.
 */

import type { Location } from './types';

const KEY = 'buscosun.favorites.v1';
const MAX = 8;

const keyOf = (l: Location) => `${l.lat.toFixed(3)},${l.lon.toFixed(3)}`;

export function getFavorites(): Location[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((l): l is Location =>
      l && typeof l.lat === 'number' && typeof l.lon === 'number' && typeof l.name === 'string');
  } catch { return []; }
}

function save(list: Location[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export function isFavorite(l: Location): boolean {
  const k = keyOf(l);
  return getFavorites().some((f) => keyOf(f) === k);
}

export function addFavorite(l: Location): Location[] {
  const clean: Location = { name: l.name, lat: l.lat, lon: l.lon, country: l.country };
  const list = [clean, ...getFavorites().filter((f) => keyOf(f) !== keyOf(l))].slice(0, MAX);
  save(list);
  return list;
}

export function removeFavorite(l: Location): Location[] {
  const list = getFavorites().filter((f) => keyOf(f) !== keyOf(l));
  save(list);
  return list;
}

/** Umschalten; liefert die neue Liste + ob der Ort jetzt Favorit ist. */
export function toggleFavorite(l: Location): { favorites: Location[]; isFav: boolean } {
  if (isFavorite(l)) return { favorites: removeFavorite(l), isFav: false };
  return { favorites: addFavorite(l), isFav: true };
}
