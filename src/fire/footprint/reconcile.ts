/**
 * **Abgleich** von Detektionsraster und kartierter Brandfläche (Phase BF3,
 * Gate GBF1) — die Regel „nie zwei Formen für dasselbe Feuer".
 *
 * ── Das Problem ─────────────────────────────────────────────────────────────
 * Seit BA3 zeichnet die Ansicht zwei Geometrien: das gestrichelte
 * Detektionsraster aus den VIIRS-Pixeln (`fireZones.ts`) und die scharf
 * umrandete EFFIS-Kartierung (`fireBurnt`). Für **denselben** Brand liegen dann
 * zwei Umrisse übereinander — und zwei Formen liest man als zwei Feuer. Genau
 * das ist die Verwechslung, die diese Phase beseitigt: **Ersetzung, nicht
 * Addition.**
 *
 * ── Wer wen ersetzt, und warum in dieser Richtung ───────────────────────────
 * Die Kartierung gewinnt immer. Sie ist eine unabhängige, bildbasierte
 * Beobachtung mit Fläche, Branddatum und Landbedeckung; das Raster ist die
 * Auflösungsgrenze der Messung. An den 9 Paaren des 24-h-Laufs vom 2026-08-16
 * gemessen (`audit/brandflaechen-echtzeit.md` §2) liegt das Raster im Median
 * beim **10,3-fachen** der kartierten Fläche — und in zwei Fällen darunter,
 * weil VIIRS die Feuerfront sieht und nicht die abgebrannte Fläche dahinter.
 * Beide Abweichungsrichtungen sprechen dagegen, das Raster neben der Kartierung
 * stehen zu lassen.
 *
 * ── Was hier ausdrücklich NICHT passiert ────────────────────────────────────
 *  • **Kein Punkt verschwindet.** Ersetzt wird nur die Fläche. Die Detektionen
 *    bleiben sichtbar, anklickbar und in voller Größe — sie sind die Messung.
 *  • **Nichts verschwindet ohne Ersatz.** Ist der Brandflächen-Layer aus, wird
 *    keine EFFIS-Fläche gezeichnet; dann bleibt das Raster stehen, denn es ist
 *    die einzige Form. Der Aufrufer übergibt deshalb genau die Flächen, die
 *    **wirklich auf der Karte liegen** — nicht alle geladenen.
 *  • **Keine Zusammenfassung.** Fläche, Datum und Stand kommen unverändert aus
 *    dem EFFIS-Feature.
 *
 * Pur, DOM-frei, ohne Modulzustand — `npm run verify:fire-footprint`.
 */

import type { FireZone } from '../fireZones';
import { zoneAt } from '../fireZones';
import type { BurntPolygon } from '../fireCorroboration';
import { nearPolygon, timeMatches } from '../fireCorroboration';

/** Eine Zone, die von einer kartierten Fläche vertreten wird. */
export interface ConfirmedFootprint {
  zone: FireZone;
  poly: BurntPolygon;
}

export interface Reconciled {
  /**
   * Zonen **ohne** kartierte Entsprechung — nur diese werden als Raster
   * gezeichnet. Das ist der Normalfall: am 2026-08-16 hatten 263 von 272
   * Clustern keine Kartierung (97 %).
   */
  estimated: FireZone[];
  /** Zonen **mit** kartierter Entsprechung — die EFFIS-Fläche zeichnet für sie. */
  confirmed: ConfirmedFootprint[];
}

/**
 * Überlappen sich Zone und Fläche räumlich? Geprüft wird in **beide**
 * Richtungen, weil die Größenverhältnisse in beide Richtungen gehen: eine
 * 2-ha-Kartierung liegt vollständig in einem 130-ha-Raster (dann trifft kein
 * Zonenschwerpunkt die Fläche, wohl aber ein Flächenpunkt die Zone), und ein
 * 1 196-ha-Brand ist größer als sein Raster (dann liegt der Zonenschwerpunkt in
 * der Fläche).
 */
export function overlaps(zone: FireZone, poly: BurntPolygon): boolean {
  const [zw, zs, ze, zn] = zone.bbox;
  const [pw, ps, pe, pn] = poly.bbox;
  // Grobfilter: berühren sich die Hüllen überhaupt? Ohne ihn wäre der Abgleich
  // 272 Zonen × 293 Flächen mit Polygonarithmetik in jeder Zelle.
  if (ze < pw || pe < zw || zn < ps || pn < zs) return false;
  // Richtung 1: der Schwerpunkt der Zone in (oder dicht an) der Fläche.
  if (nearPolygon(zone.lon, zone.lat, poly)) return true;
  // Richtung 2: irgendein Stützpunkt der Fläche in der Zone.
  for (const p of poly.polys) {
    for (const ring of p) {
      for (const [lon, lat] of ring) if (zoneAt(lon, lat, [zone])) return true;
    }
  }
  return false;
}

/**
 * Passt die Fläche zeitlich zur Zone? Es genügt, wenn **ein** Ende des
 * Zonenfensters in den Brandzeitraum fällt — die Zone deckt bei 7-Tage-Ansicht
 * eine Woche ab, `timeMatches` erlaubt ±14 Tage um `FIREDATE`.
 */
export function timeOverlaps(zone: FireZone, poly: BurntPolygon): boolean {
  return timeMatches(poly, zone.firstMs) || timeMatches(poly, zone.lastMs);
}

/**
 * Der Abgleich. Bei mehreren passenden Flächen gewinnt die mit dem **nächsten
 * Branddatum** — dieselbe Regel wie in `mappedAreaFor`, damit Steckbrief und
 * Karte nie verschiedene Flächen meinen.
 *
 * `polys` sind die **gezeichneten** Flächen. Eine leere Liste bedeutet: der
 * Brandflächen-Layer ist aus, es wird nichts ersetzt.
 */
export function reconcileZones(
  zones: readonly FireZone[], polys: readonly BurntPolygon[],
): Reconciled {
  const estimated: FireZone[] = [];
  const confirmed: ConfirmedFootprint[] = [];
  if (polys.length === 0) return { estimated: [...zones], confirmed };

  for (const zone of zones) {
    let best: BurntPolygon | null = null;
    let bestDt = Infinity;
    for (const poly of polys) {
      if (!timeOverlaps(zone, poly)) continue;
      if (!overlaps(zone, poly)) continue;
      const dt = Math.abs((poly.firedateMs ?? 0) - zone.lastMs);
      if (dt < bestDt) { best = poly; bestDt = dt; }
    }
    if (best) confirmed.push({ zone, poly: best });
    else estimated.push(zone);
  }
  return { estimated, confirmed };
}

/**
 * Die Zusicherung, die die Regel dieser Phase trägt — **eine Prüfung, keine
 * Review-Disziplin** (Kickoff §BF3). Sie läuft im Verifier gegen echte und
 * gegen konstruierte Eingaben.
 *
 * Prüft drei Eigenschaften:
 *  1. **Disjunkt** — keine Zone steht in beiden Töpfen.
 *  2. **Vollständig** — jede Eingabezone steht in genau einem Topf.
 *  3. **Verlustfrei** — es entsteht keine Zone, die nicht eingegeben wurde.
 */
export function assertNeverBoth(
  zones: readonly FireZone[], r: Reconciled,
): { ok: boolean; problem: string | null } {
  const est = new Set(r.estimated.map((z) => z.id));
  const con = new Set(r.confirmed.map((c) => c.zone.id));
  for (const id of est) {
    // Wortwahl mit Absicht neutral: „bestätigt" fällt in dieser Ansicht nur mit
    // der Quelle im selben Satz (CLAUDE.md) — auch in einer Diagnosemeldung, die
    // nie ein Nutzer sieht, wäre das Wort hier ohne Quelle falsch verankert.
    if (con.has(id)) return { ok: false, problem: `Zone ${id} steht in beiden Töpfen` };
  }
  if (est.size + con.size !== zones.length) {
    return { ok: false, problem: `${zones.length} Zonen hinein, ${est.size + con.size} heraus` };
  }
  const input = new Set(zones.map((z) => z.id));
  for (const id of [...est, ...con]) {
    if (!input.has(id)) return { ok: false, problem: `Zone ${id} war nicht in der Eingabe` };
  }
  return { ok: true, problem: null };
}

/**
 * Die Zeile für den Steckbrief einer ersetzten Zone. Sie erklärt, **warum** das
 * Raster verschwunden ist — sonst wirkte das Verschwinden wie ein Datenverlust.
 */
export function replacedNote(c: ConfirmedFootprint): string {
  const ha = c.poly.areaHa == null ? 'Fläche nicht angegeben' : `${c.poly.areaHa.toLocaleString('de-DE')} ha`;
  return `Für diesen Brand liegt eine kartierte Fläche vor (EFFIS, ${ha}) — sie ersetzt das `
    + `Detektionsraster, statt daneben zu stehen. Das Raster hätte hier `
    + `${c.zone.areaHa.toLocaleString('de-DE')} ha abgedeckt.`;
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface ReconcileCheck { name: string; ok: boolean; detail?: string }

/** Eine Zone als Rechteck um (lon, lat) mit halber Kantenlänge `d` Grad. */
export function fixtureZone(id: string, lon: number, lat: number, d: number, firstMs: number, lastMs = firstMs): FireZone {
  const ring = [[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]];
  return {
    id, polys: [[ring]], areaHa: 100, pixels: 6, meanPixelHa: 18,
    firstMs, lastMs, lat, lon, bbox: [lon - d, lat - d, lon + d, lat + d], capped: false,
  };
}

/** Eine kartierte Fläche als Rechteck. */
export function fixturePoly(id: string, lon: number, lat: number, d: number, firedateMs: number, areaHa = 5): BurntPolygon {
  const ring = [[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]];
  return {
    id, firedateMs, finaldateMs: null, lastUpdateMs: firedateMs + 86_400_000, areaHa,
    country: 'DE', province: 'Test', commune: null, percNa2k: 0, polys: [[ring]],
    bbox: [lon - d, lat - d, lon + d, lat + d],
    landcover: { CONIFER: 100, BROADLEA: 0, MIXED: 0, SCLEROPH: 0, TRANSIT: 0, OTHERNATLC: 0, AGRIAREAS: 0, ARTIFSURF: 0, OTHERLC: 0 },
  };
}

export function verifyReconcile(): { checks: ReconcileCheck[]; passed: number; total: number } {
  const checks: ReconcileCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const T = Date.UTC(2026, 7, 14, 12, 0);

  // --- Der Grundfall: ein Feuer, zwei Formen ⇒ eine bleibt --------------------
  const zone = fixtureZone('z1', 10, 50, 0.02, T);
  const poly = fixturePoly('p1', 10, 50, 0.005, T);   // klein, mitten in der Zone
  const r1 = reconcileZones([zone], [poly]);
  add('kartierte Fläche IN der Zone ⇒ Zone wird ersetzt',
    r1.estimated.length === 0 && r1.confirmed.length === 1 && r1.confirmed[0].poly.id === 'p1');
  add('die Zusicherung hält (disjunkt, vollständig, verlustfrei)', assertNeverBoth([zone], r1).ok);

  // Umgekehrtes Größenverhältnis: die Fläche ist größer als die Zone.
  const bigPoly = fixturePoly('p2', 10, 50, 0.05, T, 1196);
  const r2 = reconcileZones([zone], [bigPoly]);
  add('Zone IN der kartierten Fläche ⇒ ebenfalls ersetzt (beide Richtungen geprüft)',
    r2.confirmed.length === 1 && r2.estimated.length === 0);

  // --- Kein Treffer ⇒ die Schätzung bleibt -----------------------------------
  const far = fixturePoly('p3', 12, 50, 0.005, T);
  const r3 = reconcileZones([zone], [far]);
  add('Fläche 140 km entfernt ⇒ Zone bleibt Schätzung',
    r3.estimated.length === 1 && r3.confirmed.length === 0);
  const oldPoly = fixturePoly('p4', 10, 50, 0.005, T - 60 * 86_400_000);
  const r4 = reconcileZones([zone], [oldPoly]);
  add('Fläche vom Vormonat ⇒ Zone bleibt Schätzung (zeitliche Bindung)',
    r4.estimated.length === 1 && r4.confirmed.length === 0);

  // --- Die Funktionserhalt-Regel: ohne gezeichnete Flächen wird nichts ersetzt
  const r5 = reconcileZones([zone], []);
  add('kein Brandflächen-Layer ⇒ NICHTS wird ersetzt (nichts verschwindet ohne Ersatz)',
    r5.estimated.length === 1 && r5.confirmed.length === 0);

  // --- Mehrere Kandidaten: das nächste Branddatum gewinnt --------------------
  const near1 = fixturePoly('nah', 10, 50, 0.005, T - 2 * 86_400_000);
  const near2 = fixturePoly('näher', 10, 50, 0.005, T);
  const r6 = reconcileZones([zone], [near1, near2]);
  add('bei zwei passenden Flächen gewinnt das nähere Branddatum',
    r6.confirmed[0]?.poly.id === 'näher');

  // --- Gemischter Satz --------------------------------------------------------
  const zones = [
    fixtureZone('a', 10, 50, 0.02, T),
    fixtureZone('b', 11, 51, 0.02, T),
    fixtureZone('c', 12, 52, 0.02, T),
  ];
  const polys = [fixturePoly('pa', 10, 50, 0.005, T), fixturePoly('pc', 12, 52, 0.005, T)];
  const r7 = reconcileZones(zones, polys);
  add('gemischter Satz: 2 ersetzt, 1 bleibt',
    r7.confirmed.length === 2 && r7.estimated.length === 1 && r7.estimated[0].id === 'b');
  add('Zusicherung hält auch im gemischten Satz', assertNeverBoth(zones, r7).ok);
  add('Reihenfolge der Eingabe ändert das Ergebnis nicht', (() => {
    const rev = reconcileZones([...zones].reverse(), [...polys].reverse());
    return rev.confirmed.length === 2 && rev.estimated.length === 1 && rev.estimated[0].id === 'b';
  })());

  // --- Die Zusicherung muss auch ANSCHLAGEN können ---------------------------
  const broken: Reconciled = { estimated: [zones[0]], confirmed: [{ zone: zones[0], poly: polys[0] }] };
  add('die Zusicherung erkennt eine Zone in BEIDEN Töpfen', !assertNeverBoth([zones[0]], broken).ok,
    assertNeverBoth([zones[0]], broken).problem ?? '');
  const lossy: Reconciled = { estimated: [], confirmed: [] };
  add('die Zusicherung erkennt eine verlorene Zone', !assertNeverBoth([zones[0]], lossy).ok);
  const invented: Reconciled = { estimated: [fixtureZone('x', 0, 0, 0.01, T)], confirmed: [] };
  add('die Zusicherung erkennt eine erfundene Zone', !assertNeverBoth([zones[0]], invented).ok);

  // --- Sprache ----------------------------------------------------------------
  const note = replacedNote({ zone, poly });
  add('der Ersetzungs-Hinweis nennt EFFIS, die kartierte Fläche und die Rasterfläche',
    /EFFIS/.test(note) && /5 ha/.test(note) && /100 ha/.test(note) && /ersetzt/.test(note), note);
  add('der Hinweis sagt NICHT „Brandfläche" über das Raster', !/Raster[^.]*Brandfläche/.test(note));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
