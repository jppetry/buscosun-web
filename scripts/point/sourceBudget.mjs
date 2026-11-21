/**
 * sourceBudget.mjs — das Zeitbudget einer Quelle je Stufe (Phase PT1,
 * `audit/punkt-cron-t1-stillstand.md`).
 *
 * ── Warum es das gibt ───────────────────────────────────────────────────────
 * Bis PT1 fiel eine Quelle nur nach ZAHL heraus (`POINT_SRC_MAX_ERRORS`, mehr als fünf Fehler).
 * Das begrenzt nichts, wenn schon der einzelne Fehler lange dauert: vom 17. bis 19.11.2026 lief
 * jeder t1-Job in die Frist von 45 Minuten, weil GeoSphere `nwp-v2-1h-1km` (`claef`) hing oder mit
 * 502/503 antwortete — im Nachbau vier Fehler in 46 Minuten, die Quelle war noch „gesund genug“.
 *
 * ── Die Regel ───────────────────────────────────────────────────────────────
 * Verlorene Zeit einer Quelle =
 *   1. die Dauer jedes FEHLGESCHLAGENEN Aufrufs, und
 *   2. die Dauer jedes Aufrufs ab `SRC_SLOW_CALL_MS`, sobald die Quelle in dieser Stufe schon
 *      einen Fehler hatte — eine flatternde Quelle antwortet zwischen den Fehlern oft, aber
 *      langsam (gemessen 45–52 s für 40 KB), und käme sonst nie an eine Grenze.
 * Über `SRC_MAX_LOST_MS` fällt sie für die Stufe heraus (`dropped` im Manifest).
 *
 * Eine Quelle OHNE Fehler wird nie für Langsamkeit bestraft: die tragende Quelle einer Stufe darf
 * an einem zähen Tag lange brauchen, solange sie liefert.
 *
 * Beide Zahlen sind GESETZT, nicht gemessen. Anhalt: im letzten guten t1-Lauf (2026111715)
 * dauerte ein Aufruf je Quelle im Mittel 0,7–1,8 s, die ganze `claef`-Bahn 159 s.
 */

const envSeconds = (name, dflt) => {
  const v = Number(process.env[name]);
  return Math.round((Number.isFinite(v) && v > 0 ? v : dflt) * 1000);
};

/** Verlorene Zeit, ab der eine Quelle für die Stufe herausfällt (`POINT_SRC_MAX_LOST_S`, Standard 300 s). */
export const SRC_MAX_LOST_MS = envSeconds('POINT_SRC_MAX_LOST_S', 300);
/** Ab dieser Dauer zählt ein gelungener Aufruf einer schon gestörten Quelle als verloren (`POINT_SRC_SLOW_CALL_S`, Standard 30 s). */
export const SRC_SLOW_CALL_MS = envSeconds('POINT_SRC_SLOW_CALL_S', 30);

/**
 * Engeres Budget für Quellen mit bekanntem, kurzem Normalverlauf. Lauf #1949 im Daten-Repo (19.11.2026):
 * mit 300 s stand der Bau 10 Minuten an GeoSphere, bevor `claef` herausfiel — in dieser Zeit ruhen alle
 * Feldbahnen, und der Job riss die 45 Minuten trotzdem. Die ganze `claef`-Bahn dauert gesund 159 s bei
 * 4,2 s je Fenster; mit der GeoSphere-Frist von 30 s (shared.mjs) sind 45 s EINE hängende Adresse
 * (zwei Fristen). GESETZT. Preis: an einem zähen GeoSphere-Tag fehlt C-LAEF in t1 früher als nötig.
 */
export const SRC_MAX_LOST_MS_BY_SOURCE = { claef: 45_000, claef_eps: 45_000 };

/**
 * Einen Aufruf der Quelle `c` buchen. `c.errors` muss den Fehler dieses Aufrufs schon tragen.
 *
 * @param c  Beiträger der Stufe; `c.msLost` wird fortgeschrieben
 * @param ok ob der Aufruf gelang
 * @param ms seine Wandzeit
 * @returns `null`, solange das Budget hält — sonst der Grund für `dropped.reason`
 */
export function noteLostTime(c, ok, ms) {
  const disturbed = (c.errors ?? 0) > 0;
  if (!ok || (disturbed && ms >= SRC_SLOW_CALL_MS)) c.msLost = (c.msLost ?? 0) + ms;
  const max = SRC_MAX_LOST_MS_BY_SOURCE[c.id] ?? SRC_MAX_LOST_MS;
  if ((c.msLost ?? 0) <= max) return null;
  return `${Math.round(c.msLost / 1000)} s in fehlgeschlagenen oder langsamen Abrufen dieser Stufe (Budget ${Math.round(max / 1000)} s)`;
}
