/**
 * Phase BS — official DWD lake warnings at a lake spot (`audit/seewetter-binnenseen.md` §1.7). Pure.
 *
 * The source is the CAP file the warn layer already reads (`fetchDwdWarnings`, district set): it carries the lake
 * warnings next to the districts. An alert belongs to a lake by its warning CELL (ids 2…, `isLakeWarncell`), not by its
 * event code — the feed names lake cells in the documented lake events (57 STARKWIND, 58 STURM) and inside ordinary
 * wind alerts (51 WINDBÖEN). The text is QUOTED: headline, description and instruction as issued, never summarised,
 * never ranked by us. A lake without a cell has no official warning status in the data — said in those words.
 */
import type { CapAlert } from '../warnings/capAlerts';

export interface LakeAlert {
  id: string;
  /** Official wording, verbatim. */
  headline: string; description: string; instruction: string; event: string;
  /** The area name of the lake cell as the DWD writes it (e.g. "Bodensee - West"). */
  area: string;
  sender: string;
  onsetMs: number | null; expiresMs: number | null; sentMs: number | null;
  /** Official colour of the area (`#rrggbb`), from the message itself. */
  color: string | null;
  /** Has it begun (`false` = announced for later)? */
  active: boolean;
}

/**
 * The alerts of `alerts` that name the cell `cellId` and have not ended at `nowMs`, begun ones first, then by start.
 * A withdrawn, test or exercise message is not an alert (`status` Actual, `msgType` not Cancel).
 */
export function lakeAlertsOf(alerts: readonly CapAlert[] | null | undefined, cellId: string | null | undefined, nowMs: number): LakeAlert[] {
  if (!cellId || !alerts) return [];
  const out: LakeAlert[] = [];
  for (const a of alerts) {
    if (a.status !== 'Actual' || a.msgType === 'Cancel') continue;
    const area = a.areas.find((ar) => ar.warnCellIds.includes(cellId));
    if (!area) continue;
    if (a.expiresMs != null && nowMs >= a.expiresMs) continue;
    const start = a.onsetMs ?? a.effectiveMs ?? a.sentMs;
    out.push({
      id: a.id, headline: a.headline, description: a.description, instruction: a.instruction, event: a.event, area: area.desc, sender: a.senderName,
      onsetMs: start, expiresMs: a.expiresMs, sentMs: a.sentMs, color: a.areaColor, active: start == null || nowMs >= start,
    });
  }
  return out.sort((x, y) => (x.active === y.active ? (x.onsetMs ?? 0) - (y.onsetMs ?? 0) : x.active ? -1 : 1));
}

/** What the warning card of a lake spot shows. `none` = the lake has no DWD cell; `clear` = it has one and no alert names it. */
export type LakeWarnState =
  | { kind: 'none' }
  | { kind: 'loading'; cell: string }
  | { kind: 'error'; cell: string; why: string }
  | { kind: 'clear'; cell: string; publishedMs: number | null }
  | { kind: 'alerts'; cell: string; alerts: LakeAlert[]; publishedMs: number | null };
