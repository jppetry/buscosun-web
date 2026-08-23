/**
 * Legacy-Permalinks (Phase RT1, pur, eager — muss klein bleiben).
 *
 * Bis 2026-08-22 lebte jedes Feature unter `/` hinter einem Hash-Präfix. Diese
 * Links stehen in Lesezeichen, Chats und auf den 138 statischen Geo-Seiten
 * (`scripts/seo/content.mjs` `mapPermalink`). Sie müssen weiter funktionieren:
 *
 *  - `#m=` (Wetterkarte) wird vollständig in Pfad + Query übersetzt
 *    (`decodeMapState` → `buildMapUrl`), der Hash fällt weg;
 *  - alle anderen Präfixe behalten ihre Payload im Fragment und bekommen nur
 *    den neuen Pfad davor (`/waldbrand#wb=…`) — die Feature-Codecs bleiben
 *    unangetastet (Jans Entscheidung: Umfang dieser Phase).
 *
 * Reihenfolge der Präfixe ist Vorrang: `#mobiletest` steht VOR `#m=`
 * (`audit/strategie-2026-07-31/ux-designsystem.md` §4.3).
 */

import { decodeMapState } from '../mapState';
import { ALL_LAYER_KEYS, type LayerKey } from '../map/layerTypes';
import { buildMapUrl } from './urlState';

/** [Präfix, Zielpfad, Hash behalten?] — Reihenfolge = Vorrang. */
export const LEGACY_PREFIXES: ReadonlyArray<readonly [prefix: string, path: string, keepHash: boolean]> = [
  ['#3d=', '/atmosphaere', true],
  ['#atm=', '/atmosphaere', true],
  ['#mobiletest', '/mobiletest', false],
  ['#m=', '/wetterkarte', false],
  ['#wb=', '/waldbrand', true],
  ['#ev=', '/eventplanung', true],
  ['#h=', '/wetterarchiv', true],
  ['#g=', '/globus', true],
  ['#val', '/validierung', false],
];

/** Name der DACH-Übersichts-„Location" (App.tsx) — kein echter Ort, kein Marker. */
const OVERVIEW_NAME = 'Deutschland · Österreich · Schweiz';

/** Hash → neue URL (Pfad + Query [+ Hash]); null = kein Legacy-Link. */
export function resolveLegacyHash(hash: string, nowMs: number = Date.now()): string | null {
  if (!hash || hash.length < 2) return null;
  for (const [prefix, path, keepHash] of LEGACY_PREFIXES) {
    if (!hash.startsWith(prefix)) continue;
    if (prefix === '#m=') {
      const m = decodeMapState(hash);
      if (!m) return path; // unlesbare Payload → wenigstens die richtige Seite
      const layers = ALL_LAYER_KEYS.filter((k) => m.layers.includes(k));
      const primary: LayerKey | null = layers[0] ?? null;
      const isPlace = !!m.location.name && m.location.name !== OVERVIEW_NAME && Number.isFinite(m.location.lat);
      return buildMapUrl({
        primary, layers, hour: m.hour > 0 ? m.hour : undefined,
        place: isPlace ? m.location : null,
      }, nowMs);
    }
    return keepHash ? path + hash : path;
  }
  return null;
}

/**
 * Läuft EINMAL beim Start, bevor der Router die URL liest: nur auf `/` (auf
 * einem Pfad ist ein Hash bereits neu-stilig und gehört dem Feature dort).
 */
export function runLegacyHashMigration(loc: { pathname: string; hash: string; search: string }, nowMs: number = Date.now()): string | null {
  if (loc.pathname !== '/' || !loc.hash) return null;
  const url = resolveLegacyHash(loc.hash, nowMs);
  if (!url) return null;
  // Bestehende Query-Flags (?ta=0, ?afEst=0, ?startnow=0) überleben die Migration.
  if (loc.search && loc.search.length > 1) {
    const extra = new URLSearchParams(loc.search);
    const [pathAndQuery, frag] = url.split('#');
    const [path, q] = pathAndQuery.split('?');
    const merged = new URLSearchParams(q ?? '');
    for (const [k, v] of extra.entries()) if (!merged.has(k)) merged.append(k, v);
    const qs = merged.toString();
    return path + (qs ? `?${qs}` : '') + (frag ? `#${frag}` : '');
  }
  return url;
}

export function verifyLegacyHash(): { checks: Array<{ name: string; ok: boolean; detail?: string }>; passed: number; failed: number } {
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const now = Date.UTC(2026, 7, 22, 12, 0);
  // Der Link, den scripts/seo/content.mjs (mapPermalink) für München baut: Bit 4 = temp.
  const muc = '#m=' + encodeURIComponent(JSON.stringify({ l: [48.13743, 11.57549, 'München', 'DE'], b: 4, h: 0 }));
  add('#m= (Geo-Seite München) → /wetterkarte/temperatur mit Ort', resolveLegacyHash(muc, now) === '/wetterkarte/temperatur?ort=M%C3%BCnchen&olat=48.1374&olon=11.5755&land=de', resolveLegacyHash(muc, now) ?? 'null');
  const multi = '#m=' + encodeURIComponent(JSON.stringify({ l: [50.2, 10.5, OVERVIEW_NAME, 'DE'], b: 5, h: 3 }));
  add('#m= Übersicht mit wind+temp, h=3 → kein Ort, l=temperatur, t', resolveLegacyHash(multi, now) === '/wetterkarte/wind?t=2026-08-22T15%3A00Z&l=temperatur', resolveLegacyHash(multi, now) ?? 'null');
  add('#m= unlesbar → /wetterkarte', resolveLegacyHash('#m=%7Bkaputt', now) === '/wetterkarte');
  add('#wb= behält Payload', resolveLegacyHash('#wb=%7B%22b%22%3A1%2C%22d%22%3A0%2C%22w%22%3A24%7D', now) === '/waldbrand#wb=%7B%22b%22%3A1%2C%22d%22%3A0%2C%22w%22%3A24%7D');
  add('#ev= / #h= / #atm= / #3d= / #g= behalten Payload', resolveLegacyHash('#ev=x', now) === '/eventplanung#ev=x' && resolveLegacyHash('#h=v=tmean', now) === '/wetterarchiv#h=v=tmean' && resolveLegacyHash('#atm=x', now) === '/atmosphaere#atm=x' && resolveLegacyHash('#3d=x', now) === '/atmosphaere#3d=x' && resolveLegacyHash('#g=x', now) === '/globus#g=x');
  add('#val / #mobiletest ohne Payload', resolveLegacyHash('#val', now) === '/validierung' && resolveLegacyHash('#mobiletest', now) === '/mobiletest');
  add('Vorrang: #mobiletest vor #m=', resolveLegacyHash('#mobiletest', now) !== '/wetterkarte');
  add('Fremder Hash ⇒ null', resolveLegacyHash('#foo', now) === null && resolveLegacyHash('', now) === null && resolveLegacyHash('#', now) === null);
  add('Migration nur auf /', runLegacyHashMigration({ pathname: '/waldbrand', hash: '#wb=x', search: '' }, now) === null);
  add('Migration reicht Query-Flags durch', runLegacyHashMigration({ pathname: '/', hash: '#wb=x', search: '?ta=0' }, now) === '/waldbrand?ta=0#wb=x');
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
