/**
 * SH6 — was die Netlify Edge Function vom Share-Fundament braucht (Einstieg
 * für das Bündel, sonst nichts).
 *
 * ── Warum es diese Datei gibt ───────────────────────────────────────────────
 * Jans Vorgabe zu Teil 4 ist eindeutig: „**eine gemeinsame Parser-
 * Implementierung für App und Edge Function, kein zweiter Parser**". Direkt
 * importieren kann die Edge Function `shareAdapters.ts` aber nicht — sie läuft
 * unter **Deno**, und Deno verlangt Datei-Endungen an jedem Import
 * (`'./routes'` ist dort ein Fehler, kein Modul). Der Baum darunter hat
 * Dutzende solcher Importe, dazu ein JSON-Modul mit Import-Attribut.
 *
 * Der Ausweg ist NICHT ein zweiter Parser, sondern **derselbe Parser als
 * Bündel**: `npm run edge:share` lässt esbuild diese Datei zu einer einzigen
 * `netlify/edge-shared/shareParser.js` zusammenziehen. Damit gibt es weiterhin
 * genau eine Implementierung — die hier — und ein daraus erzeugtes Artefakt.
 *
 * Damit das Artefakt nie unbemerkt veraltet, baut `verify:share` das Bündel bei
 * jedem Lauf neu und vergleicht es Byte für Byte mit der eingecheckten Datei.
 * Wer `shareAdapters.ts` ändert und das Bündel vergisst, bekommt einen roten
 * Verifier — nicht eine Vorschau, die den Zustand von vorgestern beschreibt.
 *
 * Bewusst klein gehalten: nur Lesen und Beschreiben. `buildShareUrl` und alles
 * UI-Nahe bleibt draußen, damit das Bündel klein und der Kaltstart kurz ist.
 */

export { parseShareUrl, describeShareState, describeShareUrl, canonicalShareKey, ogCardForShare, SHARE_ROUTES } from './shareAdapters';
export type { ShareState, ShareRouteId } from './shareAdapters';
export type { ShareCopy } from './shareText';
export { ogCardPath, OG_WIDTH, OG_HEIGHT } from './ogCard';
export { SHARE_URL_HARD_MAX } from './shareSchema';
export { SITE_URL, SITE_NAME } from '../router/routes';
