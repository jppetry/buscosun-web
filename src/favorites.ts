/**
 * Gespeicherte Orte (Favoriten / Heimatort) — backend-frei via localStorage.
 *
 * Schneller Wiedereinstieg: einmal gesuchte Orte als Chips auf der Startseite,
 * Ein-Klick zur Karte. Kein Konto, kein Server. Dedupe nach gerundeter
 * Koordinate, jüngster zuerst, gedeckelt.
 */

import type { Country, Location } from './types';

const KEY = 'buscosun.favorites.v1';
/** Der Schreib-Speicher der Historie (V-04). Wird einmalig hierher übernommen. */
const LEGACY_HISTORY_KEY = 'buscosun.history.favorites.v1';
const MIGRATED_KEY = 'buscosun.favorites.migrated.v1';
const MAX = 8;

const keyOf = (l: { lat: number; lon: number }) => `${l.lat.toFixed(3)},${l.lon.toFixed(3)}`;

const isCountry = (c: unknown): c is Country => c === 'DE' || c === 'AT' || c === 'CH';

/** Ein beliebiger gespeicherter Eintrag → `Location`, oder null wenn unbrauchbar. */
function coerce(raw: unknown): Location | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.lat !== 'number' || typeof l.lon !== 'number' || typeof l.name !== 'string') return null;
  if (!Number.isFinite(l.lat) || !Number.isFinite(l.lon)) return null;
  // Die Historie führt `country` als optionalen Freitext; ohne gültiges Land
  // fällt der Eintrag auf DE zurück, statt verworfen zu werden — ein
  // gespeicherter Ort ist wertvoller als ein exaktes Flaggen-Emoji.
  const country = isCountry(l.country) ? l.country : isCountry(String(l.country ?? '').toUpperCase()) ? String(l.country).toUpperCase() as Country : 'DE';
  return { name: l.name, lat: l.lat, lon: l.lon, country };
}

/**
 * Einmalige Übernahme der Historie-Favoriten (V-04).
 *
 * Vorbefund: `history/historyState.ts` schrieb Favoriten in einen EIGENEN Key,
 * und `getFavorites`/`getRecents` von dort hatten **keinen einzigen Konsumenten**
 * — dort angelegte Orte waren unsichtbar und praktisch verloren. Umgekehrt
 * konnte die Startseite Favoriten nur anzeigen und löschen, aber nicht anlegen.
 * Beide Hälften ergeben erst zusammen ein Feature; deshalb wandern die
 * Alt-Einträge additiv hierher. Der Alt-Key wird NICHT gelöscht (verlustfrei,
 * jederzeit nachvollziehbar), die Übernahme aber nur einmal ausgeführt, damit
 * ein hier bewusst entfernter Ort nicht wieder auftaucht.
 */
function migrateLegacyOnce(): void {
  try {
    if (localStorage.getItem(MIGRATED_KEY) === '1') return;
    localStorage.setItem(MIGRATED_KEY, '1');
    const raw = JSON.parse(localStorage.getItem(LEGACY_HISTORY_KEY) || '[]');
    if (!Array.isArray(raw) || !raw.length) return;
    const legacy = raw.map(coerce).filter((l): l is Location => l != null);
    if (!legacy.length) return;
    const have = readRaw();
    const merged = [...have];
    for (const l of legacy) if (!merged.some((f) => keyOf(f) === keyOf(l))) merged.push(l);
    save(merged.slice(0, MAX));
  } catch { /* ignore */ }
}

function readRaw(): Location[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map(coerce).filter((l): l is Location => l != null);
  } catch { return []; }
}

export function getFavorites(): Location[] {
  migrateLegacyOnce();
  return readRaw();
}

// ── Abo, damit jede Fläche dieselbe Liste sieht ─────────────────────────────
// Ohne das zeigt die Startseite noch die alte Liste, während der Punktforecast
// schon den neuen Stern hat. Reines Modul-lokales Pub/Sub, keine Bibliothek.
const listeners = new Set<() => void>();

export function subscribeFavorites(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function save(list: Location[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  for (const fn of listeners) fn();
}

export function isFavorite(l: { lat: number; lon: number }): boolean {
  const k = keyOf(l);
  return getFavorites().some((f) => keyOf(f) === k);
}

export function addFavorite(l: Location): Location[] {
  const clean: Location = { name: l.name, lat: l.lat, lon: l.lon, country: l.country };
  const list = [clean, ...getFavorites().filter((f) => keyOf(f) !== keyOf(l))].slice(0, MAX);
  save(list);
  return list;
}

/** Ältester Eintrag, der bei vollem Speicher (MAX) verdrängt würde — für ehrliche UI. */
export function favoritesFull(): boolean {
  return getFavorites().length >= MAX;
}

export const FAVORITES_MAX = MAX;

export function removeFavorite(l: { lat: number; lon: number }): Location[] {
  const list = getFavorites().filter((f) => keyOf(f) !== keyOf(l));
  save(list);
  return list;
}

/** Umschalten; liefert die neue Liste + ob der Ort jetzt Favorit ist. */
export function toggleFavorite(l: Location): { favorites: Location[]; isFav: boolean } {
  if (isFavorite(l)) return { favorites: removeFavorite(l), isFav: false };
  return { favorites: addFavorite(l), isFav: true };
}

/**
 * Headless-Selbsttest (D-12) — von `scripts/verify-favorites.mjs` aufgerufen.
 * Arbeitet gegen einen übergebenen Storage-Stub, damit er ohne Browser läuft.
 */
export function verify(): { name: string; ok: boolean; detail?: string }[] {
  const out: { name: string; ok: boolean; detail?: string }[] = [];
  const add = (name: string, ok: boolean, detail?: string) => out.push({ name, ok, detail });
  const M = (name: string, lat: number, lon: number, country: Country = 'DE'): Location => ({ name, lat, lon, country });

  add('coerce nimmt gültigen Eintrag', coerce({ name: 'A', lat: 1, lon: 2, country: 'AT' })?.country === 'AT');
  add('coerce normalisiert Kleinschreibung', coerce({ name: 'A', lat: 1, lon: 2, country: 'ch' })?.country === 'CH');
  add('coerce fällt auf DE zurück statt zu verwerfen', coerce({ name: 'A', lat: 1, lon: 2 })?.country === 'DE');
  add('coerce verwirft ohne Koordinate', coerce({ name: 'A' }) === null);
  add('coerce verwirft NaN-Koordinate', coerce({ name: 'A', lat: NaN, lon: 2 }) === null);
  add('coerce verwirft Nicht-Objekt', coerce('x') === null && coerce(null) === null);

  const a = M('A', 48.1, 11.6), aNear = M('A2', 48.1004, 11.6004), b = M('B', 47.3, 11.4, 'AT');
  add('keyOf rundet auf 3 Nachkommastellen (Dedupe naher Punkte)', keyOf(a) === keyOf(aNear));
  add('keyOf trennt echte Orte', keyOf(a) !== keyOf(b));
  add('MAX ist gedeckelt', MAX === 8);
  return out;
}
