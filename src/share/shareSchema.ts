/**
 * Teilen · Query-Schema v1 (Phase SH1, pur, **importfrei**).
 *
 * Jans Vorgabe B: „Die URL bleibt lesbar." Der Bestand scheitert nicht an der
 * Länge, sondern an der Kodierung — `URLSearchParams.toString()` schreibt
 * `t=2026-09-12T15%3A00Z` und `ort=Feldberg+%28Schwarzwald%29`, obwohl
 * RFC 3986 `:`, `(` und `)` im Query-Teil ausdrücklich erlaubt (§3.4: query =
 * *( pchar / "/" / "?" ), pchar enthält sub-delims und ":" / "@").
 *
 * Deshalb schreibt diese Datei die Query selbst und liest sie weiter mit
 * `URLSearchParams` — das dekodiert beide Formen, also bleiben ALLE bestehenden
 * Links gültig. Escaped wird nur, was escaped werden MUSS:
 *
 *   `%`  sonst wäre die Kodierung mehrdeutig
 *   `&`  `=`   sonst zerfiele die Query an falscher Stelle
 *   `+`  weil `URLSearchParams` ein rohes `+` als Leerzeichen liest
 *   `#`  sonst begänne das Fragment
 *   ` `  als `%20` (nie als `+`, s. o.)
 *   alles Nicht-ASCII (UTF-8, prozentweise)
 *
 * Literal bleiben: `- . _ ~ ! $ ' ( ) * , ; : @ /`. Das sind die Zeichen, die
 * aus einem Zeichensalat wieder einen lesbaren Link machen.
 *
 * **Version.** `v` wird nur geschrieben, wenn sie von 1 abweicht; ein fehlendes
 * `v` IST v1 (Jans Entscheidung E-2). Damit ist das Schema versioniert, ohne
 * dass 99 % der Links Ballast tragen. Ein unbekanntes `v` ist kein Fehler: der
 * Leser nimmt, was er versteht, und lässt den Rest auf Standard.
 *
 * Importfrei, damit die Netlify Edge Function der OG-Meta (SH6) dieselbe Datei
 * benutzen kann — ein Parser, nicht zwei.
 */

// --- Version -----------------------------------------------------------------

export const SHARE_VERSION = 1;

/** `v` aus der Query; fehlend/ungültig ⇒ 1. Nie ein Fehler (Vorgabe: robust). */
export function shareVersionOf(search: URLSearchParams): number {
  const raw = search.get('v');
  if (raw == null) return SHARE_VERSION;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : SHARE_VERSION;
}

// --- Längen ------------------------------------------------------------------

/** Jans Zielgröße (weich) und harte Obergrenze — inkl. Origin. */
export const SHARE_URL_SOFT_MAX = 500;
export const SHARE_URL_HARD_MAX = 1500;

export type ShareLengthVerdict = 'ok' | 'long' | 'too-long';

export function shareLengthVerdict(url: string): ShareLengthVerdict {
  if (url.length > SHARE_URL_HARD_MAX) return 'too-long';
  if (url.length > SHARE_URL_SOFT_MAX) return 'long';
  return 'ok';
}

// --- Diagnose-Schalter, die NIE mitgeteilt werden ------------------------------

/**
 * Kill-Switches und Messhilfen. `parseMapSearch` reicht unbekannte Schlüssel
 * unverändert durch (`extra`) — beim Teilen wäre das ein Eigentor: der
 * Empfänger bekäme still eine gedrosselte App (`?lz=0` schaltet die
 * Ladezeit-Optimierung aus, `?radarcdn=0` schickt das Radar wieder über
 * Netlify). Ein geteilter Link trägt den Zustand, nicht die Werkstatt.
 */
export const SHARE_BLOCKED_KEYS: ReadonlySet<string> = new Set([
  'lz', 'radarcdn', 'radarimg', 'repackrun', 'bh', 'ta', 'afEst', 'tour', 'anchor',
  'startnow', 'fast', 'embed', 'debug', 'qa',
]);

/** Tracking-Parameter, die nie in einen buscosun-Link gehören. */
const TRACKING_RE = /^(utm_|fbclid$|gclid$|msclkid$|mc_eid$|igshid$|ref$|referrer$)/i;

export function isShareableKey(key: string): boolean {
  return !SHARE_BLOCKED_KEYS.has(key) && !TRACKING_RE.test(key);
}

/** Filtert Durchreiche-Schlüssel für einen Teilen-Link. */
export function shareableExtras(extra: ReadonlyArray<[string, string]>): Array<[string, string]> {
  return extra.filter(([k]) => isShareableKey(k));
}

// --- Kodierung ---------------------------------------------------------------

/**
 * Wert → Query-Text. `encodeURIComponent` ist die sichere Grundlage (es lässt
 * `A-Za-z0-9-_.!~*'()` stehen und macht aus einem Leerzeichen `%20`, nicht `+`);
 * danach werden die Zeichen zurückgeholt, die im Query-Teil erlaubt sind.
 */
export function encodeShareValue(v: string): string {
  return encodeURIComponent(v)
    .replace(/%2C/g, ',')
    .replace(/%3A/g, ':')
    .replace(/%3B/g, ';')
    .replace(/%40/g, '@')
    .replace(/%2F/g, '/')
    .replace(/%24/g, '$');
}

/** Schlüssel sind repo-eigen und bewusst eng: `[a-z][a-z0-9_]*`. */
export function isShareKeyShape(k: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(k);
}

/**
 * Paare → `''` oder `?a=b&c=d`. Reihenfolge = Aufrufreihenfolge (die Aufrufer
 * halten eine feste Ordnung, damit Links byte-stabil und als Cache-Schlüssel
 * brauchbar sind). Leere Werte werden weggelassen — ein `&x=` sagt nichts.
 */
export function encodeShareQuery(pairs: ReadonlyArray<[string, string]>): string {
  const out: string[] = [];
  for (const [k, v] of pairs) {
    if (v === '' || v == null) continue;
    out.push(`${encodeShareValue(k)}=${encodeShareValue(v)}`);
  }
  return out.length ? `?${out.join('&')}` : '';
}

// --- Zahlen ------------------------------------------------------------------

export const roundTo = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** Ohne Exponent, ohne Nachlauf-Nullen: 9,1830 ⇒ „9.183", 8,0 ⇒ „8". */
export function fmtNum(n: number, digits: number): string {
  const s = roundTo(n, digits).toFixed(digits);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** Koordinaten: 4 Nachkommastellen ≈ 11 m. */
export const COORD_DIGITS = 4;
/** Zoom: 1 Nachkommastelle. 0,1 Zoomstufe ≈ 7 % Maßstab — für einen Link genug. */
export const ZOOM_DIGITS = 1;

export const fmtCoord = (n: number) => fmtNum(n, COORD_DIGITS);
export const fmtZoom = (n: number) => fmtNum(n, ZOOM_DIGITS);

// --- Zeit --------------------------------------------------------------------

/**
 * Gültigkeitszeit, **absolut**: `2026-09-12T15:00Z`. Jans Vorgabe — eine
 * relative Angabe („+3 h") zeigt dem Empfänger garantiert etwas anderes als
 * dem Absender. Auf 10 Minuten gerastert: feiner kann kein Modellschritt, und
 * gröber verlöre der Zeit-Schieber seine Zwischenstellungen.
 */
export const TIME_GRID_MS = 600_000;

export function formatValidTime(ms: number): string {
  return new Date(Math.round(ms / TIME_GRID_MS) * TIME_GRID_MS).toISOString().slice(0, 16) + 'Z';
}

/**
 * Liest `2026-09-12T15:00Z`, `2026-09-12T15Z` und `2026-09-12` (⇒ 00:00 UTC).
 * Alles andere ⇒ `null` (der Aufrufer nimmt dann den Standard und meldet den
 * Schlüssel als ungültig). Ohne Zonenangabe gilt UTC — der Link ist eine
 * Maschinenangabe, die Anzeige rechnet lokal.
 */
export function parseValidTime(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2})(?::(\d{2}))?)?Z?$/.exec(s.trim());
  if (!m) return null;
  const h = m[4] ? +m[4] : 0, min = m[5] ? +m[5] : 0;
  if (h > 23 || min > 59) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], h, min);
  if (!Number.isFinite(ms)) return null;
  // Streng: `2026-13-45` darf nicht still in den Februar 2027 rollen.
  return new Date(ms).toISOString().slice(0, 10) === `${m[1]}-${m[2]}-${m[3]}` ? ms : null;
}

/** Reines Datum `YYYY-MM-DD` (Event-Zeitraum, Vorhersage-Tag). */
export function parseIsoDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const ms = Date.parse(t + 'T00:00:00Z');
  return Number.isFinite(ms) ? t : null;
}

// --- Selbstverifikation (Muster D-12) ---------------------------------------

export interface ShareSchemaCheck { name: string; ok: boolean; detail?: string }

export function verifyShareSchema(): { checks: ShareSchemaCheck[]; passed: number; failed: number } {
  const checks: ShareSchemaCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // --- Das Kernversprechen: lesbar bleiben, wo RFC 3986 es erlaubt.
  add('Doppelpunkt bleibt roh (t=2026-09-12T15:00Z)', encodeShareValue('2026-09-12T15:00Z') === '2026-09-12T15:00Z', encodeShareValue('2026-09-12T15:00Z'));
  add('Komma und Semikolon bleiben roh (Layer-Liste, Schnittlinie)', encodeShareValue('47.2,11.3;47.4,11.5') === '47.2,11.3;47.4,11.5');
  add('Klammern bleiben roh (Feldberg (Schwarzwald))', encodeShareValue('Feldberg (Schwarzwald)') === 'Feldberg%20(Schwarzwald)', encodeShareValue('Feldberg (Schwarzwald)'));
  add('Leerzeichen wird %20, NIE +', !encodeShareValue('a b').includes('+') && encodeShareValue('a b') === 'a%20b');
  add('Umlaut wird UTF-8-prozentkodiert', encodeShareValue('München') === 'M%C3%BCnchen');

  // --- Und die Gegenprobe: was zerbrechen würde, wird escaped.
  add('&, = , +, # und % werden escaped',
    encodeShareValue('a&b') === 'a%26b' && encodeShareValue('a=b') === 'a%3Db'
    && encodeShareValue('a+b') === 'a%2Bb' && encodeShareValue('a#b') === 'a%23b'
    && encodeShareValue('100%') === '100%25');

  // --- Rundlauf gegen den STANDARD-Leser: URLSearchParams muss alles zurückgeben.
  const tricky: Array<[string, string]> = [
    ['ort', 'Feldberg (Schwarzwald)'], ['t', '2026-09-12T15:00Z'],
    ['schnitt', '47.2,11.3;47.4,11.5'], ['x', 'a&b=c+d#e%f'], ['n', 'München'],
  ];
  const q = encodeShareQuery(tricky);
  const back = new URLSearchParams(q.slice(1));
  add('URLSearchParams liest jeden Wert unverändert zurück',
    tricky.every(([k, v]) => back.get(k) === v), tricky.map(([k, v]) => `${k}:${back.get(k) === v}`).join(','));
  add('Query beginnt mit ? und trennt mit &', q.startsWith('?') && q.split('&').length === tricky.length);
  add('leere Paare fallen weg', encodeShareQuery([['a', ''], ['b', 'x']]) === '?b=x');
  add('keine Paare ⇒ leere Zeichenkette', encodeShareQuery([]) === '');

  // --- Der Lesbarkeitsmaßstab selbst: Prozentanteil.
  const pct = (s: string) => (s.match(/%/g) ?? []).length / s.length;
  add('typische Query hat < 5 % Prozentzeichen',
    pct(encodeShareQuery([['l', 'boeen'], ['t', '2026-09-12T15:00Z'], ['z', '9.5']])) < 0.05);

  // --- Zahlen
  add('Nachlauf-Nullen fallen (9.1830 ⇒ 9.183, 8.00 ⇒ 8)', fmtNum(9.18300, 4) === '9.183' && fmtNum(8, 2) === '8');
  add('Koordinate auf 4 Stellen', fmtCoord(48.77512345) === '48.7751');
  add('Zoom auf 1 Stelle', fmtZoom(8.004) === '8' && fmtZoom(9.47) === '9.5');
  add('keine Exponentialschreibweise', fmtNum(0.00001234, 4) === '0' && !fmtNum(1234567.891, 4).includes('e'));
  add('negative Koordinaten überleben', fmtCoord(-8.0043) === '-8.0043');

  // --- Zeit
  const t = Date.UTC(2026, 8, 12, 15, 0);
  add('formatValidTime ⇒ 2026-09-12T15:00Z', formatValidTime(t) === '2026-09-12T15:00Z', formatValidTime(t));
  add('Rundlauf Zeit', parseValidTime(formatValidTime(t)) === t);
  add('10-Minuten-Raster', formatValidTime(t + 4 * 60_000) === '2026-09-12T15:00Z' && formatValidTime(t + 7 * 60_000) === '2026-09-12T15:10Z');
  add('Stundenform und reines Datum werden gelesen',
    parseValidTime('2026-09-12T15Z') === t && parseValidTime('2026-09-12') === Date.UTC(2026, 8, 12));
  add('Unsinn ⇒ null, nie ein Wurf', parseValidTime('gestern') === null && parseValidTime('') === null && parseValidTime(null) === null);
  add('unmögliche Datums-/Zeitwerte rollen nicht still weiter',
    parseValidTime('2026-13-45') === null && parseValidTime('2026-02-30') === null && parseValidTime('2026-09-12T25:00Z') === null);
  add('parseIsoDate nimmt nur YYYY-MM-DD', parseIsoDate('2026-09-18') === '2026-09-18' && parseIsoDate('18.09.2026') === null && parseIsoDate('2026-09-18T12:00Z') === null);

  // --- Version
  add('fehlendes v ⇒ 1', shareVersionOf(new URLSearchParams('')) === 1);
  add('v=2 wird gelesen', shareVersionOf(new URLSearchParams('v=2')) === 2);
  add('unbrauchbares v ⇒ 1 statt Fehler', shareVersionOf(new URLSearchParams('v=abc')) === 1 && shareVersionOf(new URLSearchParams('v=0')) === 1);

  // --- Diagnose-Schalter
  add('Kill-Switches sind nicht teilbar', !isShareableKey('lz') && !isShareableKey('radarcdn') && !isShareableKey('afEst') && !isShareableKey('tour'));
  add('Tracking-Parameter sind nicht teilbar', !isShareableKey('utm_source') && !isShareableKey('fbclid') && !isShareableKey('gclid'));
  add('fachliche Schlüssel bleiben', isShareableKey('l') && isShareableKey('modell') && isShareableKey('ort') && isShareableKey('t'));
  add('shareableExtras filtert und behält die Reihenfolge',
    JSON.stringify(shareableExtras([['lz', '0'], ['foo', '1'], ['utm_source', 'x'], ['bar', '2']])) === JSON.stringify([['foo', '1'], ['bar', '2']]));
  add('Schlüsselform ist eng', isShareKeyShape('olat') && isShareKeyShape('t') && !isShareKeyShape('Ort') && !isShareKeyShape('1a') && !isShareKeyShape('a-b'));

  // --- Längenurteil
  add('Längenurteil: ok / long / too-long',
    shareLengthVerdict('x'.repeat(200)) === 'ok'
    && shareLengthVerdict('x'.repeat(700)) === 'long'
    && shareLengthVerdict('x'.repeat(1600)) === 'too-long');

  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
