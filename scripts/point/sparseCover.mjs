/**
 * sparseCover.mjs — EINE Form für die Frage „deckt der sparse Checkout des Daten-Repos
 * die Pfade, die der Publisher staged?" (PD-C1, `audit/punktdaten-versorgung.md` §46).
 *
 * Warum eine eigene Datei: der Publisher (`publish-point.mjs`) prüft die Frage zur
 * Laufzeit gegen `git sparse-checkout list`, der Verifier (`verify-point-data.mjs`)
 * prüft sie netzfrei gegen den `sparse-checkout: |`-Block der Cron-Vorlage. Bis PD-C1
 * kannte nur der Publisher das Prädikat, der Verifier grepte auf Schlüsselwörter —
 * und so blieb ein Muster, das `.gitattributes` nicht deckt, sieben Cron-Läufe lang
 * unbemerkt: der Publisher brach jedes Mal korrekt ab, nur eben erst im Job.
 *
 * Beides importiert ab jetzt dieselben zwei Dinge: die Liste der Pfade, die der
 * Publisher an `git add` gibt, und das Prädikat, das sagt, ob ein Muster sie deckt.
 */

import { POINT_DIR } from '../../src/point/cubeFormat.ts';

/**
 * Pfade, die `publish-point.mjs` staged. `.gitattributes` steht hier, weil der Publisher
 * sie anlegt (`*.bin -text`), bevor ein Chunk in den Index kommt — ein CRLF-verfälschter
 * Chunk fiele erst am CRC beim Nutzer auf (§29).
 */
export const PUBLISH_PATHS = Object.freeze([POINT_DIR, '.gitattributes']);

/**
 * Deckt eines der Muster (no-cone, wie `git sparse-checkout list` sie ausgibt) den Pfad?
 * Bewusst dieselbe Regel wie zuvor im Publisher: exakt, mit führendem `/`, als
 * Verzeichnispräfix — oder das Muster ist selbst ein Präfix des Pfads.
 */
export function sparseCovers(patterns, path) {
  const p = String(path).replace(/\\/g, '/').replace(/\/+$/, '');
  return patterns.some((raw) => {
    const pat = String(raw).trim();
    if (!pat || pat.startsWith('#') || pat.startsWith('!')) return false;
    const bare = pat.replace(/^\//, '').replace(/\/+$/, '');
    return bare === p || pat === `/${p}` || pat.startsWith(`${p}/`) || p.startsWith(`${bare}/`);
  });
}

/** Alle Pfade, die KEIN Muster deckt — leer heißt: `git add` verwirft nichts still. */
export function uncoveredPaths(patterns, paths = PUBLISH_PATHS) {
  return paths.filter((p) => !sparseCovers(patterns, p));
}

/**
 * Den `sparse-checkout: |`-Block eines Workflow-Textes lesen (der Block von
 * `actions/checkout@v4`). Mehrere Blöcke ⇒ mehrere Listen, in Dateireihenfolge.
 * Kein YAML-Parser: die Vorlage ist handgeschrieben, der Block ist ein eingerückter
 * Literal-Skalar, und eine Abhängigkeit nur für diese Zeilen wäre STOPP & FRAGEN.
 */
export function sparseBlocksOf(yamlText) {
  const lines = String(yamlText).split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)sparse-checkout:\s*\|\s*$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    const items = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim()) continue;
      const lead = l.length - l.trimStart().length;
      if (lead <= indent) break;
      items.push(l.trim());
    }
    blocks.push(items);
  }
  return blocks;
}

/**
 * PD-F3b: die Jobs der Vorlage — Name, der Cron aus dem `if:` (`github.event.schedule == '…'`),
 * `timeout-minutes`, `needs`, die gebaute Stufe (`--tiers=tX`) und der sparse-Block des Jobs.
 * Der Verifier rechnet damit die Slot-Regeln JE JOB gegen die Kartenlinie.
 */
export function jobsOf(yamlText) {
  const lines = String(yamlText).split(/\r?\n/);
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsAt < 0) return [];
  const heads = [];
  for (let i = jobsAt + 1; i < lines.length; i++) {
    const m = /^  ([A-Za-z0-9_-]+):\s*$/.exec(lines[i]);
    if (m) heads.push({ name: m[1], start: i });
  }
  return heads.map((h, k) => {
    const end = heads[k + 1]?.start ?? lines.length;
    const body = lines.slice(h.start, end).join('\n');
    const timeout = /^\s*timeout-minutes:\s*(\d+)/m.exec(body)?.[1];
    const needs = /^\s*needs:\s*\[([^\]]*)\]/m.exec(body)?.[1];
    return {
      name: h.name,
      cron: /github\.event\.schedule == '([^']+)'/.exec(body)?.[1] ?? null,
      timeout: timeout ? Number(timeout) : null,
      needs: needs ? needs.split(',').map((x) => x.trim()).filter(Boolean) : [],
      always: /^\s*if:[\s\S]*?always\(\)/m.test(body),
      tier: /--tiers=(t\d)/.exec(body)?.[1] ?? null,
      sparse: sparseBlocksOf(body)[0] ?? null,
      body,
    };
  });
}

/** `timeout-minutes:` je Job, in Dateireihenfolge. */
export function timeoutMinutesOf(yamlText) {
  return [...String(yamlText).matchAll(/^\s*timeout-minutes:\s*(\d+)\s*$/gm)].map((m) => Number(m[1]));
}

/** Namen der `workflow_dispatch.inputs` — jedes Eingabefeld braucht einen Leser im Producer. */
export function dispatchInputsOf(yamlText) {
  const lines = String(yamlText).split(/\r?\n/);
  const names = [];
  let inInputs = false, indent = -1;
  for (const l of lines) {
    const m = /^(\s*)inputs:\s*$/.exec(l);
    if (m) { inInputs = true; indent = m[1].length; continue; }
    if (!inInputs) continue;
    if (!l.trim()) continue;
    const lead = l.length - l.trimStart().length;
    if (lead <= indent) { inInputs = false; continue; }
    const k = /^(\s*)([A-Za-z_][\w-]*):\s*$/.exec(l);
    if (k && k[1].length === indent + 2) names.push(k[2]);
  }
  return names;
}
