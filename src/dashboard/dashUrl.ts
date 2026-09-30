/**
 * URL-Zustand des Dashboards (Phase DB, audit/dashboard.md §5.1) — rein, headless prüfbar (`verify:dashboard`).
 *
 * Zwei lesbare Schlüssel mit implizitem Standard (SH-Zielbild, architecture.md §15.2):
 *   `ansicht=dashboard`                      Standard `karte` ⇒ nie geschrieben
 *   `zeitraum=heute|7-tage|14-tage`          Standard `3-tage` (Vorlage) ⇒ nie geschrieben
 *   `teil=details`                           Standard `ueberblick` ⇒ nie geschrieben (E-DB-24, Reiter)
 * Sie reisen als durchgereichte Schlüssel in `parseMapSearch(...).extra` (E-DB-3): `urlState.ts` bleibt unberührt,
 * das Bündel der Edge Function auch. Reihenfolge fest: `ansicht`, `zeitraum`, `teil`, hinter allen übrigen Extras.
 */
import type { DashboardView } from './ViewToggle';
import { DASH_VIEW_KEY, DASH_VIEW_DASHBOARD, isDashboardSearch } from './viewKey';

export type DashRange = 'heute' | '3-tage' | '7-tage' | '14-tage';
// The view key lives in the tiny `viewKey.ts` (start chunk: router + prefetch read it, E-DB-20).
export { DASH_VIEW_KEY };
export const DASH_RANGE_KEY = 'zeitraum';
export const DASH_RANGES: readonly DashRange[] = Object.freeze(['heute', '3-tage', '7-tage', '14-tage']);
export const DASH_RANGE_DEFAULT: DashRange = '3-tage';
/** Stunden des Stundenverlaufs je Zeitraum (ab der laufenden Stunde; 14 Tage = der ganze Fusionshorizont 336 h). */
export const DASH_RANGE_HOURS: Readonly<Record<DashRange, number>> = Object.freeze({ heute: 24, '3-tage': 72, '7-tage': 168, '14-tage': 336 });
/** Tageskarten je Zeitraum (Kalendertage ab heute). */
export const DASH_RANGE_DAYS: Readonly<Record<DashRange, number>> = Object.freeze({ heute: 1, '3-tage': 3, '7-tage': 7, '14-tage': 14 });
export const DASH_RANGE_LABEL: Readonly<Record<DashRange, string>> = Object.freeze({ heute: 'Heute', '3-tage': '3 Tage', '7-tage': '7 Tage', '14-tage': '14 Tage' });

/** E-DB-24: die zwei Reiter des Dashboards — Überblick (Reihe 1 + Prognose) und Details (alles weitere). */
export type DashPart = 'ueberblick' | 'details';
export const DASH_PART_KEY = 'teil';
export const DASH_PARTS: readonly DashPart[] = Object.freeze(['ueberblick', 'details']);
export const DASH_PART_DEFAULT: DashPart = 'ueberblick';
export const DASH_PART_LABEL: Readonly<Record<DashPart, string>> = Object.freeze({ ueberblick: 'Überblick', details: 'Details' });

type Extra = ReadonlyArray<readonly [string, string]>;

function get(extra: Extra, key: string): string | null {
  for (const [k, v] of extra) if (k === key) return v;
  return null;
}

export function dashViewOf(extra: Extra): DashboardView {
  return get(extra, DASH_VIEW_KEY) === DASH_VIEW_DASHBOARD ? 'dashboard' : 'karte';
}

export function dashPartOf(extra: Extra): DashPart {
  const v = get(extra, DASH_PART_KEY);
  return v && (DASH_PARTS as readonly string[]).includes(v) ? v as DashPart : DASH_PART_DEFAULT;
}

export function dashRangeOf(extra: Extra): DashRange {
  const v = get(extra, DASH_RANGE_KEY);
  return v && (DASH_RANGES as readonly string[]).includes(v) ? v as DashRange : DASH_RANGE_DEFAULT;
}

/** `false`, wenn ein Schlüssel einen ungültigen oder den Standardwert trägt — die Route zieht die URL dann kanonisch nach. */
export function dashStateValid(extra: Extra): boolean {
  const v = get(extra, DASH_VIEW_KEY);
  if (v != null && v !== DASH_VIEW_DASHBOARD) return false;
  const r = get(extra, DASH_RANGE_KEY);
  if (r != null && (r === DASH_RANGE_DEFAULT || !(DASH_RANGES as readonly string[]).includes(r))) return false;
  const t = get(extra, DASH_PART_KEY);
  if (t != null && (t === DASH_PART_DEFAULT || !(DASH_PARTS as readonly string[]).includes(t))) return false;
  return true;
}

/** Neue Extras: übrige Schlüssel in ihrer Reihenfolge, dahinter `ansicht`, `zeitraum`, `teil` — Standardwerte entfallen. */
export function withDashState(extra: Extra, next: { view?: DashboardView; range?: DashRange; part?: DashPart }): Array<[string, string]> {
  const view = next.view ?? dashViewOf(extra);
  const range = next.range ?? dashRangeOf(extra);
  const part = next.part ?? dashPartOf(extra);
  const out: Array<[string, string]> = extra.filter(([k]) => k !== DASH_VIEW_KEY && k !== DASH_RANGE_KEY && k !== DASH_PART_KEY).map(([k, v]) => [k, v]);
  if (view === 'dashboard') out.push([DASH_VIEW_KEY, DASH_VIEW_DASHBOARD]);
  if (range !== DASH_RANGE_DEFAULT) out.push([DASH_RANGE_KEY, range]);
  if (part !== DASH_PART_DEFAULT) out.push([DASH_PART_KEY, part]);
  return out;
}

/** Selbstprüfung (von `verify:dashboard` aufgerufen): leere Liste = grün. */
export function verifyDashUrl(): string[] {
  const fails: string[] = [];
  const ok = (c: boolean, what: string) => { if (!c) fails.push(what); };
  ok(dashViewOf([]) === 'karte', 'ohne Schlüssel ⇒ Karte');
  ok(dashViewOf([['ansicht', 'dashboard']]) === 'dashboard', 'ansicht=dashboard ⇒ Dashboard');
  ok(dashViewOf([['ansicht', 'Dashboard']]) === 'karte', 'Großschreibung ist ungültig ⇒ Karte');
  ok(dashRangeOf([]) === '3-tage', 'Standardzeitraum 3 Tage');
  ok(dashRangeOf([['zeitraum', '7-tage']]) === '7-tage', 'zeitraum=7-tage');
  ok(dashRangeOf([['zeitraum', '5-tage']]) === '3-tage', 'ungültiger Zeitraum ⇒ Standard');
  ok(dashStateValid([['ansicht', 'dashboard'], ['zeitraum', '14-tage']]), 'gültige Kombination');
  ok(!dashStateValid([['zeitraum', '3-tage']]), 'Standardwert in der URL ⇒ nachziehen');
  ok(!dashStateValid([['ansicht', 'karte']]), 'ansicht=karte ⇒ nachziehen');
  const w = withDashState([['startnow', '0'], ['zeitraum', 'heute']], { view: 'dashboard' });
  ok(JSON.stringify(w) === JSON.stringify([['startnow', '0'], ['ansicht', 'dashboard'], ['zeitraum', 'heute']]), `Reihenfolge ${JSON.stringify(w)}`);
  const back = withDashState(w, { view: 'karte' });
  ok(JSON.stringify(back) === JSON.stringify([['startnow', '0'], ['zeitraum', 'heute']]), 'Zurück zur Karte behält den Zeitraum');
  ok(withDashState([['ansicht', 'dashboard']], { range: '3-tage' }).length === 1, 'Standardzeitraum wird nicht geschrieben');
  // E-DB-24: Reiter.
  ok(dashPartOf([]) === 'ueberblick' && dashPartOf([['teil', 'details']]) === 'details' && dashPartOf([['teil', 'Details']]) === 'ueberblick', 'teil: Standard Überblick, nur „details" wechselt');
  ok(!dashStateValid([['teil', 'ueberblick']]) && !dashStateValid([['teil', 'karte']]) && dashStateValid([['ansicht', 'dashboard'], ['teil', 'details']]), 'teil: Standardwert/ungültig ⇒ nachziehen');
  const wt = withDashState([['radar', '0'], ['teil', 'details']], { view: 'dashboard', range: '7-tage' });
  ok(JSON.stringify(wt) === JSON.stringify([['radar', '0'], ['ansicht', 'dashboard'], ['zeitraum', '7-tage'], ['teil', 'details']]), `Reihenfolge ansicht, zeitraum, teil: ${JSON.stringify(wt)}`);
  ok(withDashState(wt, { part: 'ueberblick' }).every(([k]) => k !== 'teil'), 'Überblick wird nicht geschrieben');
  ok(JSON.stringify(withDashState(wt, { view: 'karte' })) === JSON.stringify([['radar', '0'], ['zeitraum', '7-tage'], ['teil', 'details']]), 'Zur Karte: Zeitraum und Reiter bleiben für die Rückkehr');
  // E-DB-20: the start-chunk check (`viewKey.ts`, router + prefetch) reads a query exactly like `dashViewOf`.
  for (const q of ['', '?ansicht=dashboard', '?ansicht=Dashboard', '?ansicht=karte', '?radar=0&ansicht=dashboard&zeitraum=7-tage', '?ansicht=karte&ansicht=dashboard', '?ansicht=dashboard&ansicht=karte']) {
    ok(isDashboardSearch(q) === (dashViewOf([...new URLSearchParams(q)]) === 'dashboard'), `viewKey und dashViewOf gleich für „${q}"`);
  }
  return fails;
}
