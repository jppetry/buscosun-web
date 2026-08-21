/**
 * Datenalter — Referenzzeit statt Abrufzeit (Verbesserung V-19).
 *
 * Die Karte zeigte bisher an 19 von 21 Statusstellen den Moment des Abrufs
 * (`Date.now()`) als „Datenstand". Ein neun Stunden alter ICON-D2-Lauf sah
 * dadurch taufrisch aus. Dieses Modul hält die REGELN, mit denen stattdessen
 * die tatsächliche Referenzzeit der Daten beschriftet wird:
 *
 *  • `kind: 'run'`      → Modelllauf (ICON-D2/ICON-EU): „Lauf 12z · vor 3 h"
 *  • `kind: 'measured'` → Messzeit (Radar, Satellit, Blitze): „Stand 14:35 · vor 10 min"
 *  • keine Referenz     → „abgerufen 14:41" — es wird KEIN Alter behauptet.
 *
 * Der dritte Fall ist der Kern der Ehrlichkeits-Regel (D-04): Quellen, die
 * keine Referenzzeit ausweisen (AT-INCA-Grid, die statische Stationsklimatologie),
 * bekommen KEINE erfundene, sondern eine als solche beschriftete Abrufzeit.
 *
 * Pur im Sinne von D-12: kein DOM, kein React, kein Fetch, kein Modulzustand →
 * headless importierbar (`npm run verify:datenalter`).
 */

/** Woher die Referenzzeit stammt — bestimmt die Beschriftung. */
export type DataRefKind = 'run' | 'measured';

/** Referenzzeit der angezeigten Daten (NICHT der Abrufzeitpunkt). */
export interface DataRef {
  /** Modelllauf-Referenzzeit bzw. Messzeitpunkt, ms seit Epoch. */
  atMs: number;
  kind: DataRefKind;
}

/**
 * Ab diesem Alter bekommt ein Datensatz einen ruhigen Hinweis.
 * Begründung: ICON-D2 rotiert alle 3 h, der Publikationslag liegt bei ~3,5–6,5 h
 * (s. `sources/gribManifest.ts`) — ein gesunder Lauf ist damit nie älter als ~9 h.
 * Alles darüber ist ein Betriebszustand, den der Nutzer sehen darf.
 */
export const STALE_RUN_H = 9;

/**
 * Ab diesem Alter des Warm-Manifests (`updatedAt`) gilt der Schnellzugriff als
 * nicht mehr aktuell (Verbesserung V-20). Kürzer als STALE_RUN_H, weil der
 * Warm-Cron im 15-min-Takt läuft: 6 h ohne Auffrischung heißt, dass etwas hakt.
 */
export const MANIFEST_STALE_H = 6;

const H_MS = 3_600_000;

/** UTC-Stunde eines Modelllaufs in der meteorologischen Kurzform: 12:00 UTC → `12z`. */
export function runLabel(atMs: number): string {
  const h = new Date(atMs).getUTCHours();
  return `${String(h).padStart(2, '0')}z`;
}

/** Lokale Uhrzeit `HH:MM` (de-DE) — für Messzeiten und Abrufzeiten. */
export function clockLabel(atMs: number): string {
  return new Date(atMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Zeitpunkt in Alltagsform: heute nur die Uhrzeit, sonst mit Datum davor.
 *
 * Warum nicht immer nur die Uhrzeit: „03:43" liest sich wie heute Nacht. Bei
 * einem fünf Tage alten Bezug wäre das eine Falschaussage über die Aktualität.
 * Umgekehrt ist das Datum bei einem Bezug von heute nur Rauschen — deshalb die
 * Fallunterscheidung an der KALENDERGRENZE, nicht an einer Stundenschwelle.
 */
export function stampLabel(atMs: number, nowMs: number): string {
  const d = new Date(atMs);
  const n = new Date(nowMs);
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return sameDay
    ? clockLabel(atMs)
    : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Alter in Alltagssprache. Negative Werte (Referenz in der Zukunft — ein Lauf
 * kann durch Uhr-Drift minimal voraus liegen) werden als „gerade eben" geführt,
 * statt „vor -1 min" zu behaupten.
 */
export function ageText(ageMs: number): string {
  const min = Math.floor(ageMs / 60_000);
  if (min < 2) return 'gerade eben';
  if (min < 60) return `vor ${min} min`;
  const h = Math.floor(ageMs / H_MS);
  if (h < 24) return `vor ${h} h`;
  const d = Math.floor(h / 24);
  const restH = h - d * 24;
  return restH === 0 ? `vor ${d} T` : `vor ${d} T ${restH} h`;
}

/**
 * Die eine Zeile, die alle drei Renderstellen der Karte benutzen.
 * `ref == null` ⇒ es wird ausdrücklich die ABRUFZEIT beschriftet.
 */
export function dataAgeText(ref: DataRef | null | undefined, fetchedAtMs: number, nowMs: number): string {
  if (!ref || !Number.isFinite(ref.atMs)) return `abgerufen ${clockLabel(fetchedAtMs)}`;
  const age = ageText(Math.max(0, nowMs - ref.atMs));
  return ref.kind === 'run'
    ? `Lauf ${runLabel(ref.atMs)} · ${age}`
    : `Stand ${clockLabel(ref.atMs)} · ${age}`;
}

/**
 * Ist der Datensatz ungewöhnlich alt? Ohne Referenzzeit: `false` — über etwas,
 * das die Quelle nicht ausweist, wird nichts behauptet (weder gut noch schlecht).
 */
export function isStale(ref: DataRef | null | undefined, nowMs: number): boolean {
  if (!ref || !Number.isFinite(ref.atMs)) return false;
  return nowMs - ref.atMs > STALE_RUN_H * H_MS;
}

/** Älteste (= konservativste) Referenzzeit eines zusammengesetzten Produkts,
 *  z. B. des DACH-Niederschlags-Komposits aus DE/AT/CH. `null`, wenn keine der
 *  Teilquellen eine Referenzzeit ausweist. */
export function oldestRef(refs: (DataRef | null | undefined)[]): DataRef | null {
  let out: DataRef | null = null;
  for (const r of refs) {
    if (!r || !Number.isFinite(r.atMs)) continue;
    if (!out || r.atMs < out.atMs) out = r;
  }
  return out;
}

// --- Selbst-Verifikation (Muster D-12; headless über verify:datenalter) -------

export interface DataAgeCheck { name: string; ok: boolean; detail?: string }

export function verifyDataAge(): { checks: DataAgeCheck[]; passed: number; total: number } {
  const checks: DataAgeCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const now = Date.UTC(2026, 7, 1, 15, 30); // 2026-08-01 15:30 UTC

  add('runLabel: 12 UTC → 12z', runLabel(Date.UTC(2026, 7, 1, 12)) === '12z');
  add('runLabel: 3 UTC → 03z', runLabel(Date.UTC(2026, 7, 1, 3)) === '03z');

  add('ageText: 0 min → gerade eben', ageText(0) === 'gerade eben');
  add('ageText: 25 min', ageText(25 * 60_000) === 'vor 25 min');
  add('ageText: 59 min bleibt Minuten', ageText(59 * 60_000) === 'vor 59 min');
  add('ageText: 60 min → vor 1 h', ageText(60 * 60_000) === 'vor 1 h');
  add('ageText: 26 h → vor 1 T 2 h', ageText(26 * H_MS) === 'vor 1 T 2 h');
  add('ageText: 48 h → vor 2 T', ageText(48 * H_MS) === 'vor 2 T');

  const run: DataRef = { atMs: now - 3 * H_MS, kind: 'run' };
  add('dataAgeText Lauf', dataAgeText(run, now, now) === 'Lauf 12z · vor 3 h', dataAgeText(run, now, now));

  const meas: DataRef = { atMs: now - 10 * 60_000, kind: 'measured' };
  add('dataAgeText Messung nennt Uhrzeit + Alter',
    dataAgeText(meas, now, now).startsWith('Stand ') && dataAgeText(meas, now, now).endsWith('vor 10 min'),
    dataAgeText(meas, now, now));

  // Die Kernregel: ohne Referenzzeit wird KEIN Datenalter behauptet.
  const noRef = dataAgeText(null, now, now);
  add('ohne Referenz: „abgerufen HH:MM", kein „Lauf"/„Stand"',
    noRef.startsWith('abgerufen ') && !noRef.includes('vor '), noRef);
  add('ohne Referenz: nie stale', isStale(null, now) === false);
  add('ohne Referenz: NaN wird wie fehlend behandelt',
    dataAgeText({ atMs: NaN, kind: 'run' }, now, now).startsWith('abgerufen '));

  // Schwelle exakt an der Kante (Red-Test-Anker: verstellt jemand STALE_RUN_H,
  // fällt genau dieses Paar um).
  add('stale-Schwelle: 8,9 h frisch', isStale({ atMs: now - 8.9 * H_MS, kind: 'run' }, now) === false);
  add('stale-Schwelle: 9,1 h stale', isStale({ atMs: now - 9.1 * H_MS, kind: 'run' }, now) === true);
  add('STALE_RUN_H = 9', STALE_RUN_H === 9, String(STALE_RUN_H));
  add('MANIFEST_STALE_H = 6', MANIFEST_STALE_H === 6, String(MANIFEST_STALE_H));

  // Zukunfts-Referenz (Uhr-Drift) darf kein negatives Alter erzeugen.
  add('Referenz in der Zukunft → „gerade eben"',
    dataAgeText({ atMs: now + 5 * 60_000, kind: 'measured' }, now, now).endsWith('gerade eben'));

  // Komposit: das Ganze ist so alt wie sein ältester Teil.
  add('oldestRef wählt die älteste Quelle',
    oldestRef([{ atMs: now - 5 * 60_000, kind: 'measured' }, { atMs: now - 40 * 60_000, kind: 'measured' }])?.atMs
      === now - 40 * 60_000);
  add('oldestRef ignoriert fehlende Quellen',
    oldestRef([null, undefined, { atMs: now, kind: 'measured' }])?.atMs === now);
  add('oldestRef ohne jede Quelle → null', oldestRef([null, undefined]) === null);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
