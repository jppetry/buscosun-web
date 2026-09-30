/**
 * tableAge.ts — how old a learned table is, said out loud (phase AX, AX-2; V-EX-6, report #12).
 *
 * The tables of buscosun Fusion are static: `fusion.client.json` (Fit 5e, hindcast to 2026-09), `stack.client.json` (13
 * issue days of September). The models behind them change (IFS 50r1 on 12.05.2026 inside the fit period, the ICON-EPS grid on
 * 06.10.2026), and nothing in the reader looked at `period`/`builtAt`. This module computes the age and a note — the table
 * KEEPS working (a stale table is still the best the client has); the note names the age, and past `staleAfterDays` it says
 * so in words. Pure; the verifier checks it with an injected clock.
 */

export interface TableAgeInput {
  builtAt?: string | null;
  period?: { from?: string | null; to?: string | null } | null;
}

export interface TableAge {
  /** Days since the end of the fit period (or, without one, since `builtAt`); `null` when neither parses. */
  ageDays: number | null;
  /** Which date the age counts from. */
  basis: 'period.to' | 'builtAt' | null;
  stale: boolean;
  note: string;
}

const DAY = 86_400_000;
const parseDay = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const ms = Date.parse(s.length === 10 ? `${s}T23:59:59Z` : s);
  return Number.isFinite(ms) ? ms : null;
};
const fmt = (ms: number): string => { const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`; };

/**
 * `label` is the note prefix of the reader (`learned`, `stationValue`); `staleAfterDays` the age past which the note says
 * „veraltet" (learned 120 d — the winter refit is planned from December; stack 45 d — a refit every ≥ 30 issue days).
 */
export function tableAgeOf(label: string, t: TableAgeInput, nowMs: number, staleAfterDays: number): TableAge {
  const to = parseDay(t.period?.to), built = parseDay(t.builtAt);
  const basisMs = to ?? built;
  if (basisMs == null) return { ageDays: null, basis: null, stale: false, note: `${label}: Alter der Tabelle unbekannt (weder period.to noch builtAt lesbar) — sie wirkt trotzdem (V-EX-6)` };
  const basis: TableAge['basis'] = to != null ? 'period.to' : 'builtAt';
  const ageDays = Math.max(0, Math.floor((nowMs - basisMs) / DAY));
  const stale = ageDays > staleAfterDays;
  const when = `${basis === 'period.to' ? 'Fit-Zeitraum bis' : 'gebaut am'} ${fmt(basisMs)}${built != null && basis === 'period.to' ? `, gebaut ${fmt(built)}` : ''}`;
  const note = stale
    ? `${label}: Tabelle VERALTET — ${when}, ${ageDays} Tage alt (> ${staleAfterDays}): Nachfit fällig, die Tabelle wirkt weiter (V-EX-6)`
    : `${label}: Tabelle ${when}, ${ageDays} Tage alt (Grenze ${staleAfterDays})`;
  return { ageDays, basis, stale, note };
}

/** Learned tables: the winter refit is due from December (E-FL-3); after 120 days the note says so. */
export const LEARNED_STALE_DAYS = 120;
/** Station-value table: fitted on issue days, refit every ≥ 30 issue days (E-FS-3); after 45 days the note says so. */
export const STACK_STALE_DAYS = 45;
