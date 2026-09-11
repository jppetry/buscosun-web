/**
 * ensembleStats.mjs — die Streuung über Member, EINMAL für alle Ensembles
 * (PD-B10, `audit/punktdaten-versorgung.md` §45).
 *
 * Bis PD-B8 rechnete jedes Ensemble-Modul seine Streuung selbst. Das hat einen
 * Fehler versteckt, den erst die zweite Quelle sichtbar gemacht hat.
 *
 * ── ⚠ Die Streuung einer SUMME ist nicht die Streuung einer RATE ─────────────
 * Niederschlag liegt bei DWD und ECMWF als Summe SEIT LAUFBEGINN vor. PD-B8 hat
 * die Member-Streuung direkt über diese Summe gebildet und in `precip_sd_ens`
 * geschrieben — in eine Ebene mit der Einheit mm/h, die dieselbe Größe verspricht
 * wie `precip`, also die Rate über den Stufenschritt. Gemessen am 2026-09-11:
 *
 *   ICON-D2-EPS, nasse Zellen   +6 h: 1,04 statt 0,42    +48 h: 1,82 statt 0,49
 *   ICON-D2-EPS, alle Zellen   +48 h: 1,23 statt 0,04    (Faktor 29)
 *   IFS-ENS, DACH-Ausschnitt  +240 h: 9,57 statt 0,18    (Faktor 53)
 *
 * Zellen, in denen es JETZT trocken ist, trugen die Streuung des Regens der
 * letzten Tage. Und alles lag im erlaubten Wertebereich — keine Prüfung hätte
 * angeschlagen.
 *
 * Deshalb hier, für alle Quellen gleich: je Member die Rate
 * `max(0, Summe[t] − Summe[t−Δ]) / Δ`, Member über ihre NUMMER gepaart, dann die
 * Streuung. Die Klammer auf 0 ist gemessen nötig: 312 von 100 450 entakkumulierten
 * IFS-Werten waren negativ (Packungsrauschen in trockenen Zellen).
 *
 * ── Warum über die Nummer und nicht über die Reihenfolge ────────────────────
 * Die Rate braucht DENSELBEN Member in zwei Dateien. Die Reihenfolge der
 * Nachrichten ist dafür kein Beleg — dieselbe Lehre wie V-PD-25, wo der
 * deterministische Niederschlag durch die Dateireihenfolge richtig war und nicht
 * durch eine Auswahl. `gribDecode` liefert dafür seit PD-B10 die Member-Nummer
 * (Oktett 36 der Templates 4.1 und 4.11).
 */

import { parseMultipartByteranges, sliceRange } from './shared.mjs';

/**
 * Streuung über Member je Zelle.
 *
 * @param cur   Map Member-Nummer → Werte je Stufenzelle (Rohwerte der Quelle)
 * @param prev  dasselbe beim Vorschritt — oder `null` für Momentangrößen
 * @param opts  `cells`; `dt` in Stunden (Pflicht, sobald `prev` gesetzt ist);
 *              `factor` — NUR der Faktor der Einheit, nie der Versatz: auf eine
 *              Streuung angewandt machte `KELVIN_TO_C` aus 1,2 K ein −271,95.
 * @returns `{ sd, members, maxN, clamped }`. `sd` ist NaN, wo weniger als zwei
 *          Member einen Wert hatten — Bessel braucht zwei, und 0 hieße „gemessen
 *          und einig".
 */
export function memberSpread(cur, prev, { cells, dt = null, factor = 1 } = {}) {
  if (prev && !(dt > 0)) throw new Error('memberSpread: eine Rate braucht dt > 0');
  const keys = [...cur.keys()].filter((k) => !prev || prev.has(k));
  const n = new Int32Array(cells);
  const s1 = new Float64Array(cells);
  const s2 = new Float64Array(cells);
  let clamped = 0;
  for (const key of keys) {
    const a = cur.get(key);
    const b = prev ? prev.get(key) : null;
    for (let k = 0; k < cells; k++) {
      let v = a[k];
      if (!Number.isFinite(v)) continue;
      if (b) {
        const w = b[k];
        if (!Number.isFinite(w)) continue;
        let d = v - w;
        if (d < 0) { d = 0; clamped++; }
        v = d / dt;
      }
      v *= factor;
      n[k]++; s1[k] += v; s2[k] += v * v;
    }
  }
  const sd = new Float32Array(cells).fill(NaN);
  let maxN = 0;
  for (let k = 0; k < cells; k++) {
    const c = n[k];
    if (c > maxN) maxN = c;
    if (c < 2) continue;
    // Rundungsrauschen kann die Varianz knapp unter null drücken, wenn alle Member
    // gleich sind — das ist eine 0, und `Math.sqrt` einer negativen Zahl wäre NaN.
    sd[k] = Math.sqrt(Math.max(0, (s2[k] - (s1[k] * s1[k]) / c) / (c - 1)));
  }
  return { sd, members: keys.length, maxN, clamped };
}

// ---------------------------------------------------------------------------
// Selbsttest (netzfrei)
// ---------------------------------------------------------------------------

export async function ensembleStatsSelfTest() {
  const res = [];
  const ok = (name, cond, info = '') => res.push({ name, ok: !!cond, info });
  const m = (obj) => new Map(Object.entries(obj).map(([k, v]) => [Number(k), Float32Array.from(v)]));
  const close = (a, b, e = 1e-5) => Math.abs(a - b) < e;

  let r = memberSpread(m({ 1: [1], 2: [2], 3: [3], 4: [4] }), null, { cells: 1 });
  ok('Momentangroesse: Bessel-Korrektur (n-1)', close(r.sd[0], Math.sqrt(5 / 3)) && r.members === 4,
    `sd=${r.sd[0].toFixed(4)}`);

  r = memberSpread(m({ 1: [0.001], 2: [0.003] }), null, { cells: 1, factor: 1000 });
  ok('nur der Faktor skaliert (Meter -> mm), kein Versatz', close(r.sd[0], Math.SQRT2, 1e-4),
    `sd=${r.sd[0].toFixed(4)}`);

  r = memberSpread(m({ 1: [5], 2: [7], 3: [9] }), m({ 1: [4], 2: [4], 3: [4] }), { cells: 1, dt: 2 });
  ok('Rate = (Summe[t] - Summe[t-dt]) / dt je Member', close(r.sd[0], 1), `sd=${r.sd[0].toFixed(4)}`);

  // ⚠ Der PD-B8-Fall: beide Member regnen in dieser Stunde gleich viel, hatten
  // aber vorher verschieden viel. Die Unsicherheit DIESER Stunde ist null.
  const cur = m({ 1: [10], 2: [12] }), prev = m({ 1: [9], 2: [11] });
  const acc = memberSpread(cur, null, { cells: 1 });
  const rate = memberSpread(cur, prev, { cells: 1, dt: 1 });
  ok('⚠ der Regen von gestern ist keine Unsicherheit von heute (PD-B8)',
    close(rate.sd[0], 0) && acc.sd[0] > 1.4,
    `Streuung der Summe ${acc.sd[0].toFixed(2)} gegen die der Rate ${rate.sd[0].toFixed(2)}`);

  r = memberSpread(m({ 1: [3.9], 2: [5] }), m({ 1: [4], 2: [4] }), { cells: 1, dt: 2 });
  ok('negative Differenz (Packungsrauschen) wird 0, nicht negativ',
    r.clamped === 1 && close(r.sd[0], Math.sqrt(0.125)), `sd=${r.sd[0].toFixed(4)} geklemmt=${r.clamped}`);

  r = memberSpread(m({ 1: [5], 2: [7], 3: [9] }), m({ 1: [4], 3: [4], 4: [100] }), { cells: 1, dt: 1 });
  ok('Member werden ueber die NUMMER gepaart, nicht ueber die Reihenfolge',
    r.members === 2 && close(r.sd[0], Math.sqrt(8)), `gepaart ${r.members}, sd=${r.sd[0].toFixed(4)}`);

  r = memberSpread(m({ 1: [5], 2: [NaN] }), null, { cells: 1 });
  ok('weniger als zwei Werte => MISSING, nicht 0', Number.isNaN(r.sd[0]));

  let loud = false;
  try { memberSpread(cur, prev, { cells: 1 }); } catch { loud = true; }
  ok('eine Rate ohne dt scheitert laut', loud);

  // ── Mehrfach-Bereiche (RFC 7233): Teile ueber Content-Range zuordnen ──────
  const enc = new TextEncoder();
  const payload = Uint8Array.from({ length: 100 }, (_, i) => i);
  const B = 'XyZ';
  const part = (s, e) => [
    enc.encode(`\r\n--${B}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes ${s}-${e}/100\r\n\r\n`),
    payload.subarray(s, e + 1),
  ];
  // Umgekehrte Reihenfolge UND zwei angefragte Bereiche (10-14, 20-29) in einem
  // zusammengelegten Teil 10-29 — beides darf ein Server.
  const chunks = [...part(60, 69), ...part(10, 29), enc.encode(`\r\n--${B}--\r\n`)];
  const body = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  { let o = 0; for (const c of chunks) { body.set(c, o); o += c.length; } }
  const parts = parseMultipartByteranges(body, `multipart/byteranges; boundary=${B}`);
  const eq = (a, s) => a != null && a.every((v, i) => v === s + i);
  ok('Mehrfach-Bereiche: Teile werden ueber Content-Range zugeordnet, nicht ueber die Reihenfolge',
    eq(sliceRange(parts, 60, 10), 60) && eq(sliceRange(parts, 10, 5), 10) && eq(sliceRange(parts, 20, 10), 20),
    `${parts.length} Teile, einer davon zusammengelegt`);
  ok('ein Bereich, den die Antwort nicht enthaelt, ist null', sliceRange(parts, 40, 5) == null);
  let cut = false;
  try { parseMultipartByteranges(body.subarray(0, body.length - 30), `multipart/byteranges; boundary=${B}`); }
  catch { cut = true; }
  ok('abgeschnittene Antwort scheitert laut', cut);
  ok('Boundary in Anfuehrungszeichen wird gelesen',
    parseMultipartByteranges(body, `multipart/byteranges; boundary="${B}"`).length === 2);
  return res;
}
