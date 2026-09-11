/**
 * build-point-cube.mjs — Producer des Punkt-Cubes (Phasen PD-A/PD3–PD5,
 * `audit/punktdaten-versorgung.md` §17/§18.1).
 *
 * Schreibt die drei Auflösungsstufen aus allen Quellen, für die es einen Adapter
 * gibt (`scripts/point/adapters/`). Die Adapter kennen ihre Quelle, dieser
 * Orchestrator kennt das Format — dazwischen liegt genau eine Schnittstelle.
 *
 * ── Was hier zusammengeführt wird, und wie ehrlich ─────────────────────────
 * `ABLAUFPLAENE.md` PAP 2 fusioniert mit `w = Σ⁻¹1 / (1ᵀΣ⁻¹1)`. Diese Fehler-
 * kovarianz **gibt es nicht**, solange `buscosun-archiv` (PA) sie nicht misst
 * (§21 (4)). Der Producer nimmt deshalb **gleiche Gewichte** — und schreibt das ins
 * Manifest (`fusion.weights: "equal"`, `provenance: "fallback"`), damit niemand eine
 * gemessene Gewichtung vermutet, wo eine gesetzte steht.
 *
 * Was dabei ECHT entsteht, ist `σ_div`: die Streuung zwischen den Quellen an
 * derselben Zelle und Stunde. PAP 6 nennt sie als den einen von zwei Beiträgen; der
 * andere (`σ_sys`) bleibt `null`, bis die Verifikation ihn liefert. `sigmaKind` sagt
 * je Zelle, welcher Fall galt:
 *
 *   `divergence` (2)  mehrere Quellen ⇒ σ = σ_div (Sockel σ_sys fehlt noch)
 *   `systematic` (3)  genau eine Quelle ⇒ der Nenner von σ_div ist exakt null,
 *                     es bliebe σ_sys — also σ = MISSING, nicht 0
 *   `unknown` (0)     keine Quelle
 *
 * ── Was weiterhin fehlt ────────────────────────────────────────────────────
 *   • Ensemble-Member (σ_ens) — bei IFS/AIFS wird nur der Kontrolllauf gelesen (PD-B8).
 *   • MOSMIX, C-LAEF, ICON-CH, die Radar-Quellen — s. `adapters/index.mjs` PENDING.
 *
 * ── Ein Quellfehler kostet eine Stimme, nicht den Lauf (PD-C2, V-PD-40) ─────
 * Lauf 7 des Crons (2026-09-11) starb an EINEM ECMWF-429 bei AIFS Single, mitten in
 * Stufe 3, ohne einen Chunk — weil `await c.adapter.field(...)` in der
 * deterministischen Schleife nicht gefangen war (die Ensemble-Schleife fing seit
 * PD-B10). Jetzt läuft jeder Adapteraufruf durch `safeCall()`: Fehler werden je Quelle
 * gezählt und laut geloggt, die Zelle bleibt MISSING; ab `POINT_SRC_MAX_ERRORS`
 * (Standard 5) fällt die Quelle für die Stufe heraus und steht als `dropped` im
 * Manifest. Abgebrochen wird nur, wenn KEINE Quelle der Stufe mehr trägt.
 *
 * Aufruf:
 *   npm run point:cube -- --tiers=t1
 *   npm run point:cube -- --tiers=all --steps=0-6
 *   npm run point:cube -- --only=icon_d2,icon_eu
 *   npm run point:cube -- --run=2026091100      # Obergrenze: kein Lauf jünger als dieser
 *
 * Umgebung (nur Prüfläufe): POINT_FAULT_INJECT=<quelle>[:<n>] lässt die Quelle ab dem
 * n-ten Abruf werfen — der Verifier beweist damit zur Laufzeit, dass der Bau weiterläuft.
 * POINT_CACHE_CLEAR=tier leert den Plattencache nach jeder Stufe (setzt der Cron).
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import v8 from 'node:v8';
import {
  TIERS, TIER_BY_ID, CUBE_PLANES, CHUNK_CELLS, MISSING,
  chunkExtent, chunkPath, runManifestPath, planeIndex, quantize, encodeCubeChunk, cellCenter,
  CUBE_SCHEMA,
} from '../../src/point/cubeFormat.ts';
import { SOURCE_BY_ID, coversPoint } from '../../src/point/sourceMatrix.ts';
import { adapterFor, ingestableFor, PENDING } from './adapters/index.mjs';
import { netStats, resetNetStats, netDiff, clearCache, runIso } from './adapters/shared.mjs';
import { PROFILE_PARAMS } from './profile.mjs';

const OUT = process.env.POINT_OUT || 'data/point';
/** Ab so vielen Fehlern je (Stufe, Quelle) fällt die Quelle für die Stufe heraus (PD-C2). */
const SRC_MAX_ERRORS = Math.max(0, Number(process.env.POINT_SRC_MAX_ERRORS ?? 5));
const deflate9 = async (bytes) => new Uint8Array(deflateRawSync(bytes, { level: 9 }));

/** Zielgrößen aus den Quellen; Profil und Meta füllt der Producer selbst. */
const TARGET_VARS = CUBE_PLANES.filter((p) => p.kind === 'mean' && p.group === 'target').map((p) => p.id);

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };

// ---------------------------------------------------------------------------
// Auswahl: WELCHER Lauf, und WO darf die Quelle schreiben
// ---------------------------------------------------------------------------

/**
 * Wie weit reicht diese Quelle im GÜNSTIGSTEN Fall? Aus der Registry, nur als
 * **Vorfilter** — die Aussage wird danach am Objekt geprüft (§21 (7): die Matrix nennt
 * Vorhersagelängen, keine Schrittfolgen, und Tabellen veralten).
 */
const maxHorizonOf = (src) => {
  if (!src) return Infinity;
  const byRun = Object.values(src.horizonH?.byRunHour ?? {});
  return Math.max(src.horizonH?.default ?? 0, ...byRun);
};

/** Wie viele Slots zurück die Suche nach einem Lauf gehen darf, der das GANZE Band trägt. */
const FULL_COVER_MAX_BACK = 4;

/**
 * Welchen Lauf nimmt diese Quelle? — **den weitesten, nicht den jüngsten.**
 *
 * Bis 2026-09-09 fragte der Producer `discoverRun(leadHours[0])`, also nach der ERSTEN
 * Stunde der Stufe. Für Stufe 3 (126–336 h) besteht damit der ECMWF-Lauf 06z die Probe —
 * er ist ein `scda`-Lauf und endet bei 144 h (⚠⁷). Er verdrängte den 00z-`oper`-Lauf mit
 * 360 h, und ab 186 h blieb AIFS Single als einzige Quelle übrig: **150 der 336 Stunden
 * ohne jede Streuung** (Audit §33.4). Dieselbe Klasse: ICON-EU trägt bei 03/09/15/21 UTC
 * nur 48 h statt 120 (⚠⁵), ICON global bei 06/18 UTC nur 120 statt 180 (⚠⁶).
 *
 * Jetzt: erst nach einem Lauf suchen, der bis zur LETZTEN Stunde der Stufe reicht; erst
 * wenn es den nicht gibt, den jüngsten nehmen, der wenigstens die erste trägt — und die
 * Teilabdeckung im Manifest BENENNEN statt sie zu verschweigen.
 *
 * Der Registry-Horizont spart dabei die aussichtslosen Proben: reicht eine Quelle
 * NIRGENDS bis zur letzten Stunde (ICON global in Stufe 3), wird gar nicht erst gefragt.
 *
 * ⚠ Was hier NICHT entschieden wird: wie viel der Lauf am Ende wirklich trägt. `probe`
 * sagt nur, welche Sonde ihn gefunden hat. Die Abdeckung kommt aus `leadsFor()`, also
 * aus der Messung — der erste Entwurf leitete sie aus der Sonde ab und meldete für
 * AIFS Single in Stufe 2 `full` bei **null gelieferten Stunden**: die Quelle hat 120 h,
 * aber keine 51 h (sie rechnet 6-stündlich, 51 ist kein Vielfaches von 6).
 */
export async function chooseRun(adapter, source, leadHours, nowMs) {
  const first = leadHours[0];
  const last = leadHours[leadHours.length - 1];
  // ⚠ Nicht auf das Bandende proben, sondern auf **so weit, wie diese Quelle
  // überhaupt reicht** (PD-B6, gemessen). Die vorige Fassung verlangte
  // `maxHorizon >= last` und übersprang die Suche sonst ganz — der Rückfall nimmt
  // dann den neuesten Lauf, der Stunde `first` trägt, also den FRISCHESTEN und
  // damit am wenigsten veröffentlichten.
  //
  // Am echten Datum: ICON-CH1 reicht 45 h, das t1-Band endet bei 48 ⇒ die Suche
  // entfiel, und der gewählte 15z-Lauf war eine Stunde alt und hatte **3 von 45
  // Stunden** publiziert. Dieselbe Klasse wie §34.1, nur andersherum: dort gewann
  // der kürzere Lauf über den weiteren, hier gewinnt der jüngere über den
  // brauchbaren.
  // Zwei Stufen, nicht eine — weil `maxHorizonOf` das BESTE, nicht das typische
  // Verhalten nennt. Am echten Datum (2026-09-10): ICON-CH1 trägt bei sieben von
  // acht Läufen 33 h und nur bei 03z ganze 45. Wer auf 45 probt, findet nur den
  // 03z-Lauf — und der war 14 h alt, also jenseits von `FULL_COVER_MAX_BACK`.
  // Ergebnis wäre der Rückfall auf „neuester Lauf mit Stunde 0", also 3 von 49
  // Stunden. Mit dem Regelhorizont als zweiter Sprosse gewinnt der 5 h alte
  // 12z-Lauf mit 33 Stunden.
  for (const h of [maxHorizonOf(source), source?.horizonH?.default ?? 0]) {
    const target = Math.min(last, h);
    if (!(target > first)) continue;
    const run = await adapter.discoverRun(target, nowMs, FULL_COVER_MAX_BACK);
    if (run) return { run, probe: target === last ? 'band' : 'horizon' };
  }
  const any = await adapter.discoverRun(first, nowMs);
  if (!any) return null;
  return { run: any, probe: 'first' };
}

/**
 * Zellmaske einer Quelle: wo darf sie überhaupt einen Wert schreiben?
 *
 * `QUELLENMATRIX.md` §2 sagt es wörtlich — „Die Quellenauswahl muss geometrisch über die
 * Domain entschieden werden, nicht über das Land." `sourceMatrix.ts` führt `domain`,
 * `clip` und `edgeMarginKm` seit PD-A, und **kein Aufrufer außerhalb des Selbsttests hat
 * sie je benutzt**: die Fusionsschleife lief über jede Zelle und mittelte, was endlich war.
 *
 * Solange nur ICON-D2/EU/global/AICON/IFS/AIFS verdrahtet waren, fiel das nicht auf — sie
 * decken den ganzen Ausschnitt. Ab C-LAEF (bis 51,5 °N), ICON-CH (`edgeMarginKm: 20`) und
 * RADVOR RV (`clip` schneidet östlich 14,1 °E) wäre es ein stiller Fehler: `fillNearest`
 * verschmiert bis zu drei Ringe, also bei Stufe 1 rund 15 km ÜBER den Domänenrand hinaus.
 *
 * Gibt `null` zurück, wenn die Quelle den ganzen Stufenausschnitt trägt — dann kostet die
 * Maske nichts, und der bestehende Weg bleibt Byte für Byte derselbe.
 */
export function domainMask(source, tier) {
  if (!source || (!source.domain && !source.clip)) return null;
  const cells = tier.ny * tier.nx;
  const mask = new Uint8Array(cells);
  let inside = 0;
  for (let iy = 0; iy < tier.ny; iy++) {
    for (let ix = 0; ix < tier.nx; ix++) {
      const { lat, lon } = cellCenter(tier, iy, ix);
      if (coversPoint(source, lat, lon)) { mask[iy * tier.nx + ix] = 1; inside++; }
    }
  }
  return inside === cells ? null : { mask, inside, cells };
}

/** Die Maske auf ein Feld anwenden — als KOPIE, das Feld kann aus einem Adapter-Cache stammen. */
function applyMask(grid, mask) {
  const out = new Float32Array(grid.length);
  for (let k = 0; k < grid.length; k++) out[k] = mask[k] ? grid[k] : NaN;
  return out;
}

// ---------------------------------------------------------------------------
// Eine Stufe bauen
// ---------------------------------------------------------------------------

export async function buildTier(tierId, opts = {}) {
  const tier = TIER_BY_ID[tierId];
  const leadHours = opts.steps ?? tier.leadHours;
  const nt = leadHours.length;
  const cells = tier.ny * tier.nx;
  const t0 = Date.now();

  const { usable, diversity, skipped } = ingestableFor(tier);
  const only = opts.only ? new Set(opts.only) : null;
  // `diversity` kommt hinter die zugeordneten Quellen — die Reihenfolge entscheidet
  // nichts (gleiche Gewichte), aber das Manifest soll sie in dieser Ordnung nennen.
  const ids = [...usable, ...(opts.noDiversity ? [] : diversity)].filter((id) => !only || only.has(id));
  const isDiversity = new Set(diversity);

  // ── Ein Fehler kostet eine Stimme, nicht den Lauf (PD-C2, V-PD-40) ──────────
  // Jeder Adapteraufruf der deterministischen Seite läuft hier durch. Der Fehler wird
  // je Quelle gezählt und benannt (erster Fehlertext bleibt stehen), die Antwort ist
  // `null` — also MISSING an dieser Zelle, nicht Exit 1 für den ganzen Cube. Ab
  // `SRC_MAX_ERRORS` fällt die Quelle für die Stufe heraus (`dropped`), damit eine
  // Quelle, die dauerhaft drosselt, nicht 336 Stunden lang je Abruf zehn Minuten wartet.
  const dropped = [];
  const safeCall = async (c, what, fn) => {
    if (c.dropped) return null;
    try {
      return await fn();
    } catch (e) {
      c.errors = (c.errors ?? 0) + 1;
      c.firstError ??= `${what}: ${e.message}`;
      console.log(`  ⚠ ${tierId}: ${c.id} ${what}: ${e.message}`);
      if (c.errors > SRC_MAX_ERRORS) {
        c.dropped = { reason: `mehr als ${SRC_MAX_ERRORS} Fehler in dieser Stufe`, errors: c.errors, firstError: c.firstError };
        dropped.push([c.id, c.dropped.reason]);
        console.log(`  ⚠ ${tierId}: ${c.id} fällt für diese Stufe heraus — ${c.dropped.reason}`);
      }
      return null;
    }
  };

  // Je Quelle: Lauf und lieferbare Stunden — beides am ECHTEN Objekt geprüft,
  // nicht aus einer Tabelle geraten (§21 (7)).
  const candidates = [];
  const contributors = [];
  for (const id of ids) {
    const a = adapterFor(id);
    // ── Warum die Ensemble-KONTROLLLÄUFE nicht in den Mittelwert gehen ────────
    // IFS-ENS-Kontrolle ist dasselbe Modell wie IFS HRES, nur gröber gerechnet;
    // AIFS-ENS-Kontrolle dasselbe wie AIFS Single. Nimmt man sie als eigene
    // „Meinungen" mit, zieht ECMWF den Mittelwert doppelt UND `σ_div` schrumpft,
    // weil zwei der vier Werte fast identisch sind. Das Ergebnis sähe SICHERER aus,
    // als es ist — der teuerste Fehler, den dieses Produkt machen kann.
    //
    // PAP 2 löst das über eine Kovarianz MIT Fehlerkorrelation; die gibt es noch
    // nicht (§21 (4)). Bis dahin trägt je Modellfamilie genau ein deterministischer
    // Lauf. Die Adapter bleiben — sobald echte Member gelesen werden, liefern sie
    // `σ_ens` und werden wieder aufgenommen. → V-PD-9
    if (a?.ensembleControlOnly && !opts.withEnsembleControl) {
      skipped.push([id, 'nur Kontrolllauf lesbar; als vierter „unabhängiger" Wert würde er σ_div schrumpfen (V-PD-9)']);
      continue;
    }
    const src = SOURCE_BY_ID[id];
    let choice = null;
    try {
      choice = await chooseRun(a, src, leadHours, opts.nowMs);
    } catch (e) {
      // Eine Laufsuche, die wirft (Drosselung über zehn Minuten, Netz weg), ist ein
      // Befund über DIESE Quelle — sie wird benannt übersprungen, der Bau läuft weiter.
      skipped.push([id, `Laufsuche fehlgeschlagen: ${e.message}`]);
      continue;
    }
    if (!choice) { skipped.push([id, `kein Lauf gefunden, der ${leadHours[0]} h trägt`]); continue; }
    const { run, probe } = choice;
    const dom = domainMask(src, tier);
    // Eine Quelle, deren Domäne den Ausschnitt gar nicht schneidet, ist kein Beiträger —
    // sie stünde sonst im Manifest, zählte in `srcMask` ein Bit und lieferte nie etwas.
    // Benannt überspringen statt still mitschleppen.
    if (dom && dom.inside === 0) {
      skipped.push([id, `Domäne schneidet den Ausschnitt der Stufe nicht (0 von ${dom.cells} Zellen)`]);
      continue;
    }
    // `leads` kommt erst NACH der Versatzrechnung — s. unten.
    candidates.push({
      id, adapter: a, run, probe,
      mask: dom?.mask ?? null, maskInside: dom?.inside ?? (tier.ny * tier.nx),
      role: isDiversity.has(id) ? 'diversity' : 'assigned',
    });
  }
  // ── Zweiter Durchgang: Zeitversatz je Quelle ────────────────────────────────
  //
  // ⚠ Der Fehler, den das behebt (gemessen 2026-09-09, PD-B4): der Producer reichte
  // DIESELBE Vorhersagestunde an Quellen mit VERSCHIEDENEN Läufen. `field(c.run, leadH)`
  // heißt „Stunde leadH nach dem Lauf DIESER Quelle" — bei IFS aus 00z und ICON global
  // aus 12z sind das zwei Werte, die **12 Stunden auseinander gültig** sind, und sie
  // landeten im selben Mittel. Das verwischt den Tagesgang und bläht σ_div mit einem
  // Zeitversatz auf, der wie Modelluneinigkeit aussieht.
  //
  // Der Fehler ist älter als PD-B1, aber PD-B1 hat ihn VERGRÖSSERT: vorher nahm IFS den
  // 06z-Lauf (6 h Versatz), seither den weiteren 00z-Lauf (12 h). Ein Fix, der σ
  // zurückholt, darf σ nicht gleichzeitig verfälschen.
  //
  // Kur: alles rechnet in GÜLTIGZEIT. Der Publikationslauf ist der jüngste beitragende;
  // jede Quelle bekommt ihren eigenen Versatz und wird in IHREM Laufraum gefragt.
  const publishRun = candidates.map((c) => c.run).sort().at(-1);
  const runMs = (r) => Date.parse(runIso(r));
  for (const c of candidates) {
    c.offsetH = Math.round((runMs(publishRun) - runMs(c.run)) / 3_600_000);
    // Die Stunden im Laufraum der Quelle — sonst meldete `leadsFor` eine Abdeckung für
    // Stunden, die diese Quelle so gar nicht kennt.
    const own = leadHours.map((h) => h + c.offsetH);
    const leads = await safeCall(c, 'leadsFor', () => c.adapter.leadsFor(c.run, { ...tier, leadHours: own }));
    if (!leads) { skipped.push([c.id, `Abdeckung nicht bestimmbar: ${c.firstError ?? 'Fehler'}`]); continue; }
    const got = new Set(leads);
    if (got.size === 0) {
      skipped.push([c.id, `Lauf ${c.run} liefert keine Stunde dieser Stufe (Versatz ${c.offsetH} h)`]);
      continue;
    }
    c.leads = got;                                   // im Laufraum DER QUELLE
    c.coverage = got.size === leadHours.length ? 'full' : 'partial';
    contributors.push(c);
  }

  if (contributors.length === 0) {
    return { tier: tierId, leadHours, contributors: [], skipped, files: [], bytesTotal: 0, empty: true };
  }
  // `srcMask` ist ein Int32Array und setzt `1 << ci`. Ab 32 Quellen kippt das Vorzeichen
  // und `srcCount` zählt still falsch. Lieber laut abbrechen als leise danebenliegen —
  // die Matrix hat 22 Quellen, der Fall ist erreichbar.
  if (contributors.length > 31) {
    throw new Error(`${tierId}: ${contributors.length} Quellen — srcMask trägt höchstens 31 (1 << ci in Int32Array)`);
  }

  // Volle Stufenebenen als int16 — das ist zugleich die Ausgabegröße.
  const planes = CUBE_PLANES.map(() => new Int16Array(nt * cells).fill(MISSING));
  const planeAt = (id) => planes[planeIndex(id)];
  const meta = (id) => CUBE_PLANES[planeIndex(id)];
  const countPlane = planeAt('srcCount');
  // Je Zelle und Schritt: welche Quellen ueberhaupt etwas geliefert haben (Bitmaske,
  // damit dieselbe Quelle ueber mehrere Groessen nicht doppelt zaehlt).
  const srcMask = new Int32Array(nt * cells);

  const accPrev = new Map();   // Quelle+Größe → Summe des zuletzt geholten Schritts

  for (let it = 0; it < nt; it++) {
    const leadH = leadHours[it];
    const prevLead = it === 0 ? leadH - tier.stepH : leadHours[it - 1];
    const dt = leadH - prevLead;

    for (const varId of TARGET_VARS) {
      const grids = [];
      const gridSrc = [];
      for (let ci = 0; ci < contributors.length; ci++) {
        const c = contributors[ci];
        if (!c.adapter.vars.includes(varId)) continue;
        // In den Laufraum DIESER Quelle: dieselbe Gültigzeit, andere Vorhersagestunde.
        const own = leadH + c.offsetH;
        if (!c.leads.has(own)) continue;
        let g = await safeCall(c, `${varId} @ +${own} h`, () => c.adapter.field(c.run, own, varId, tier));
        if (!g) continue;
        // Geometrie VOR allem anderen: was außerhalb der Domäne liegt, ist kein Wert.
        // Steht hier und nicht in der Zellschleife, damit auch die Entakkumulation und
        // `maskHere` (und damit `srcCount`) es sehen — an EINER Stelle, nicht an dreien.
        if (c.mask) g = applyMask(g, c.mask);
        if (c.adapter.accumulated.has(varId)) {
          // Rate = (Summe[t] − Summe[t−Δ]) / Δ. Ohne Referenz ist 0 mm/h KEINE
          // Aussage über den Niederschlag, sondern über den Lauf ⇒ MISSING.
          const key = `${c.id}:${varId}`;
          const ownPrev = prevLead + c.offsetH;
          let prev = accPrev.get(key);
          if (!prev || prev.lead !== ownPrev) {
            // PD-C5: liegt der Vorschritt INNERHALB der Stufe und die Quelle traegt ihn laut
            // `leadsFor` nicht (AIFS rechnet 6-stuendlich, die Stufe 3-stuendlich), gibt es
            // nichts zu holen — vorher gingen dafuer je Lauf 12 Abrufe in t2 ins Leere (404).
            // Vor der ersten Stufenstunde (it = 0) wird weiter gefragt: dort sagt `leads` nichts.
            const insideTier = ownPrev >= leadHours[0] + c.offsetH;
            const fetchable = ownPrev >= 0 && (!insideTier || c.leads.has(ownPrev));
            const p = fetchable ? await safeCall(c, `${varId} @ +${ownPrev} h (Vorschritt)`, () => c.adapter.field(c.run, ownPrev, varId, tier)) : null;
            prev = p ? { lead: ownPrev, grid: p } : null;
          }
          accPrev.set(key, { lead: own, grid: g });
          if (!prev || dt <= 0) continue;
          const rate = new Float32Array(cells).fill(NaN);
          for (let k = 0; k < cells; k++) {
            if (Number.isFinite(g[k]) && Number.isFinite(prev.grid[k])) {
              rate[k] = Math.max(0, (g[k] - prev.grid[k]) / dt);
            }
          }
          g = rate;
        }
        grids.push(g);
        gridSrc.push(ci);
      }
      if (grids.length === 0) continue;

      // Welche Quellen an welcher Zelle etwas beigetragen haben — als Bitmaske.
      const maskHere = new Int32Array(cells);
      for (let gi = 0; gi < grids.length; gi++) {
        const bit = 1 << gridSrc[gi];
        const g = grids[gi];
        for (let k = 0; k < cells; k++) if (Number.isFinite(g[k])) maskHere[k] |= bit;
      }

      const mp = meta(varId);
      const sdIdx = planeIndex(`${varId}_sd`);
      const target = planeAt(varId);
      const base = it * cells;
      for (let k = 0; k < cells; k++) {
        let n = 0, sum = 0, sumsq = 0;
        for (const g of grids) {
          const v = g[k];
          if (!Number.isFinite(v)) continue;
          n++; sum += v; sumsq += v * v;
        }
        if (n === 0) continue;
        target[base + k] = quantize(sum / n, mp);
        if (sdIdx >= 0 && n >= 2) {
          const varr = Math.max(0, (sumsq - (sum * sum) / n) / (n - 1));
          planes[sdIdx][base + k] = quantize(Math.sqrt(varr), CUBE_PLANES[sdIdx]);
        }
        srcMask[base + k] |= maskHere[k];
      }
    }
  }
  // srcCount aus der Bitmaske — dieselbe Quelle ueber mehrere Groessen zaehlt einmal.
  {
    const mp = meta('srcCount');
    for (let i = 0; i < srcMask.length; i++) {
      const m = srcMask[i];
      if (m === 0) continue;
      let n = 0;
      for (let b = m; b; b >>= 1) n += b & 1;
      countPlane[i] = quantize(n, mp);
    }
  }
  // --- Ensemble-Streuung (PD-B8) ---------------------------------------------
  //
  // `<var>_sd_ens` und `ensCount` haben seit Schema 2 (PD-B2) einen Ort und waren
  // bis heute durchgehend MISSING: PD-B2 hat den PLATZ geschaffen, nicht die Daten.
  //
  // ⚠ Die Streuung wird NICHT mit anderen Quellen gemittelt und geht auch nicht in
  // `srcCount` ein. σ_ens ist die Streuung INNERHALB einer Quelle; sie neben σ_div
  // zu stellen ist der Sinn von PAP 6, sie damit zu verrechnen wäre Doppelzählung.
  // ── PD-B10: mehrere Ensembles je Stufe, aber je STUNDE genau eines ─────────
  //
  // Bis PD-B8 kannte eine Stufe genau ein Ensemble (`find`). Mit IFS-ENS hat die
  // Fernstufe zwei: ICON-EPS global bis 180 h, IFS-ENS bis 360 h. Regel: je Stunde
  // genau EINE Quelle, die erste in der Reihenfolge der Stufe, die mindestens eine
  // Größe liefert. Member zweier Ensembles werden NIE gemischt — die Streuung über
  // ICON- UND IFS-Member wäre eine Streuung zwischen Modellen, also σ_div, und
  // stünde in der Ebene für σ_ens.
  //
  // ⚠ Niederschlag wird je Member ENTAKKUMULIERT, über den Stufenschritt Δ —
  // dieselbe Größe wie die `precip`-Ebene. Bis PD-B10 stand hier die Streuung der
  // Summe seit Laufbeginn (§45.2). Wo eine Quelle den Vorschritt nicht führt,
  // bleibt die Ebene MISSING statt einer Rate über einen längeren Zeitraum: σ über
  // 6 h ist glatter als über 3 h, und in die 3-h-Ebene geschrieben wäre das eine
  // erfundene Sicherheit.
  //
  // Δ ist der Stufenschritt, nicht der Abstand zur vorigen GEWÄHLTEN Stunde: mit
  // `--steps` wäre der sonst 48 h, und die Rate über zwei Tage stünde in der
  // Stundenebene.
  const ensSources = process.env.POINT_ENSEMBLE === '0'
    ? [] : contributors.filter((c) => (c.adapter.ensembleVars ?? []).length > 0 && !c.dropped);
  let ensStat = null;
  if (ensSources.length) {
    const cp = meta('ensCount');
    const countPl = planeAt('ensCount');
    const per = new Map(ensSources.map((c) => [c.id, {
      id: c.id, run: c.run, hours: [], vars: new Set(),
      membersMin: Infinity, membersMax: 0, clamped: 0, noRate: 0, errors: 0,
    }]));
    const byHour = {};
    let done = 0, missed = 0;
    for (let it = 0; it < nt; it++) {
      const leadH = leadHours[it];
      let servedBy = null;
      for (const src of ensSources) {
        const own = leadH + src.offsetH;
        if (!src.leads.has(own)) continue;
        const st = per.get(src.id);
        const eVars = src.adapter.ensembleVars.filter((v) => planeIndex(`${v}_sd_ens`) >= 0);
        let any = false;
        for (const varId of eVars) {
          let r = null;
          try {
            r = await src.adapter.ensemble(src.run, own, varId, tier, { dt: tier.stepH });
          } catch (e) {
            // Laut, aber nicht tödlich: ein Ensemble-Fehler darf den Cube nicht
            // mitreißen (dieselbe Regel wie beim Stationsprodukt). Er steht im Manifest.
            st.errors++;
            console.log(`  ⚠ ${tierId}: ${src.id} ${varId} @ +${own} h: ${e.message}`);
            continue;
          }
          if (!r) {
            // Bei Niederschlag heißt `null`: keine Rate bildbar (Vor- oder Hauptschritt fehlt).
            if (src.adapter.accumulated?.has(varId)) st.noRate++;
            continue;
          }
          any = true;
          st.vars.add(varId);
          const mp = meta(`${varId}_sd_ens`), pl = planeAt(`${varId}_sd_ens`), b = it * cells;
          for (let i = 0; i < cells; i++) {
            const v = r.sd[i];
            if (!Number.isFinite(v)) continue;
            if (src.mask && !src.mask[i]) continue;
            pl[b + i] = quantize(v, mp);
            // ensCount ist die Zahl der MEMBER, nicht der Quellen — ohne sie ist die
            // Bias-Korrektur E[s] = c4(n)·σ nicht anwendbar (`fusion.memberBias`).
            if (countPl[b + i] === MISSING) countPl[b + i] = quantize(r.members, cp);
          }
          if (r.members < st.membersMin) st.membersMin = r.members;
          if (r.members > st.membersMax) st.membersMax = r.members;
          st.clamped += r.clamped ?? 0;
        }
        if (any) { servedBy = src.id; st.hours.push(leadH); break; }
      }
      if (servedBy) { done++; byHour[leadH] = servedBy; } else missed++;
    }
    const sources = [...per.values()].map((s) => {
      const c = ensSources.find((x) => x.id === s.id);
      return {
        id: s.id, run: s.run, hours: s.hours, vars: [...s.vars],
        stepH: c.adapter.stepH ?? null,
        membersDeclared: c.adapter.members ?? null,
        membersRead: s.membersMax || null,
        membersMin: Number.isFinite(s.membersMin) ? s.membersMin : null,
        clampedNegativeRates: s.clamped, noRate: s.noRate, errors: s.errors,
        note: c.adapter.ensembleNote ?? null,
      };
    });
    ensStat = {
      sources, byHour, steps: done, missing: missed,
      provenance: 'single-source-per-hour',
      rule: 'Je Stunde genau EINE Quelle: die erste in der Reihenfolge der Stufe, die mindestens eine '
        + 'Groesse liefert. Member zweier Ensembles werden nie gemischt — das waere eine Streuung '
        + 'ZWISCHEN Modellen (σ_div), nicht innerhalb eines (σ_ens).',
      precip: 'precip_sd_ens ist die Streuung der RATE ueber den Stufenschritt: je Member '
        + '(Summe[t] − Summe[t−Δ]) / Δ, Member ueber ihre Nummer gepaart, negative Differenzen auf 0 — '
        + 'dieselbe Groesse wie die precip-Ebene. Wo eine Quelle den Vorschritt nicht fuehrt, bleibt '
        + 'die Ebene MISSING (sources[].noRate). Bis PD-B10 stand hier die Streuung der Summe seit '
        + 'Laufbeginn.',
      caveat: 'σ_ens ist die Streuung INNERHALB einer Quelle, σ_div die zwischen Quellen. '
        + 'PAP 6 verzweigt zwischen beiden — sie werden NICHT addiert.',
    };
    for (const s of sources) {
      if (!s.hours.length && !s.errors && !s.noRate) continue;
      console.log(`  ${tierId}: σ_ens aus ${s.id} — ${s.hours.length} Stunden (Raster ${s.stepH} h)`
        + ` [${s.hours.join(' ')}], ${s.vars.join('+') || '—'}, ${s.membersRead ?? 0} Member`
        + (s.noRate ? `, Niederschlag ohne Rate ${s.noRate}×` : '')
        + (s.clampedNegativeRates ? `, ${s.clampedNegativeRates} negative Differenzen auf 0` : '')
        + (s.errors ? `, ⚠ ${s.errors} Fehler` : ''));
    }
  }

  // --- Quantil-Ebenen (PD-B7) ------------------------------------------------
  //
  // C-LAEF-EPS liefert KEINE Member, nur P10/P50/P90 (⚠³). Ein daraus gerechnetes
  // σ_ens setzte Normalverteilung voraus — für `precip` nachweislich falsch: an
  // einer nassen Zelle steht p10 = 0,000 mm bei p90 = 0,619 mm, und ein normales
  // p10 = Median − 1,28σ wäre NEGATIV. Ein gemessenes Quantil behält deshalb seinen
  // eigenen Ort (Jans Entscheidung 2026-09-10).
  //
  // Wie bei den Profilfeldern: aus GENAU EINER Quelle, nicht gemittelt. Das q10
  // zweier Modelle zu mitteln ergäbe ein Quantil, das kein Ensemble je gerechnet
  // hat — und über welche Verteilung es dann etwas sagt, könnte niemand angeben.
  // Die einzige Stelle, an der ein Quellfehler den Bau noch abbrechen darf: wenn in
  // dieser Stufe KEINE Quelle mehr trägt. Ein leerer Lauf wäre schlimmer als keiner —
  // er sähe im Manifest aus wie ein Lauf ohne Wetter.
  if (contributors.length && contributors.every((c) => c.dropped)) {
    throw new Error(`${tierId}: alle ${contributors.length} Quellen sind herausgefallen — `
      + contributors.map((c) => `${c.id}: ${c.firstError}`).join(' · '));
  }

  const quantSrc = process.env.POINT_QUANTILES === '0'
    ? null : contributors.find((c) => (c.adapter.quantileVars ?? []).length > 0 && !c.dropped);
  let quantStat = null;
  if (quantSrc) {
    const qVars = quantSrc.adapter.quantileVars.filter((v) => planeIndex(`${v}_q10`) >= 0);
    let done = 0, missed = 0, filled = 0;
    for (let it = 0; it < nt; it++) {
      const leadH = leadHours[it];
      const own = leadH + quantSrc.offsetH;
      if (!quantSrc.leads.has(own)) { missed++; continue; }
      let any = false;
      for (const varId of qVars) {
        const r = await safeCall(quantSrc, `Quantile ${varId} @ +${own} h`, () => quantSrc.adapter.quantiles(quantSrc.run, own, varId, tier));
        if (!r) continue;
        any = true;
        for (const [lvl, grid] of [['q10', r.q10], ['q90', r.q90]]) {
          const mp = meta(`${varId}_${lvl}`), pl = planeAt(`${varId}_${lvl}`), b = it * cells;
          for (let i = 0; i < cells; i++) {
            const v = grid[i];
            if (!Number.isFinite(v)) continue;
            if (quantSrc.mask && !quantSrc.mask[i]) continue;
            pl[b + i] = quantize(v, mp);
            filled++;
          }
        }
      }
      if (any) done++; else missed++;
    }
    quantStat = {
      source: quantSrc.id, run: quantSrc.run, vars: qVars, levels: ['q10', 'q90'],
      steps: done, missing: missed, cellsWritten: filled,
      provenance: 'single-source',
      note: quantSrc.adapter.quantileNote ?? null,
      // ⚠ Der Satz, der eine Doppelzählung verhindert — dasselbe Muster wie die
      // `_sd`/`_sd_ens`-Warnung aus Schema 2.
      caveat: 'Quantile beschreiben die Unsicherheit EINER Quelle, nicht die Uneinigkeit '
        + 'mehrerer. NICHT mit _sd oder _sd_ens verrechnen.',
    };
    console.log(`  ${tierId}: Quantile aus ${quantSrc.id} — ${done} Stunden, ${missed} ohne, `
      + `${qVars.length} Größen`);
  }

  // --- Profilfelder (PD-B5) --------------------------------------------------
  //
  // gammaEff/zBase/zInv/dTInv kommen aus GENAU EINER Quelle, nicht aus dem Mittel —
  // und das ist der Kern der Sache: der Mittelwert zweier Inversionsobergrenzen ist
  // keine Inversionsobergrenze. Liegt bei der einen Quelle die Inversion bei 400 m
  // und bei der anderen gar keine vor, wäre „200 m" eine Schicht, die kein Modell
  // kennt. Bei den Zielgrößen ist das Mittel die bessere Schätzung; bei einer
  // Schichtgrenze ist es eine Erfindung.
  //
  // Genommen wird die erste Quelle der Stufe, die Profile führt — die Reihenfolge in
  // `tier.sources` ist nach Auflösung sortiert, also die feinste zuerst.
  // Kill-Switch mit benanntem Rückfall (Regel 2): `POINT_PROFILE=0` baut denselben
  // Cube wie vor PD-B5 — die vier Ebenen bleiben dann MISSING, also genau der
  // Zustand, den §33.3 beschreibt. Das ist zugleich die Messvorrichtung: derselbe
  // Bereich einmal mit und einmal ohne, und die Differenz ist der Preis.
  const profileSrc = process.env.POINT_PROFILE === '0'
    ? null : contributors.find((c) => c.adapter.hasProfile);
  let profileStat = null;
  if (profileSrc) {
    const stepH = Math.max(tier.stepH, Number(process.env.POINT_PROFILE_STEP_H || tier.stepH));
    const ids = ['gammaEff', 'zBase', 'zInv', 'dTInv'];
    const mps = ids.map((id) => meta(id));
    const pls = ids.map((id) => planeAt(id));
    let done = 0, missed = 0, invCells = 0, valCells = 0;
    for (let it = 0; it < nt; it++) {
      const leadH = leadHours[it];
      if ((leadH - leadHours[0]) % stepH !== 0) continue;
      const own = leadH + profileSrc.offsetH;
      if (!profileSrc.leads.has(own)) { missed++; continue; }
      const r = await safeCall(profileSrc, `Profil @ +${own} h`, () => profileSrc.adapter.profile(profileSrc.run, own, tier));
      if (!r) { missed++; continue; }
      done++;
      for (let k = 0; k < ids.length; k++) {
        const g = r[ids[k]], pl = pls[k], mp = mps[k], b = it * cells;
        for (let i = 0; i < cells; i++) {
          const v = g[i];
          // Die Domäne auch hier: sonst trüge eine Zelle ein Profil einer Quelle,
          // die sie gar nicht abdeckt — derselbe Grund wie bei `hModEff`.
          if (!Number.isFinite(v)) continue;
          if (profileSrc.mask && !profileSrc.mask[i]) continue;
          pl[b + i] = quantize(v, mp);
        }
      }
      for (let i = 0; i < cells; i++) {
        if (!Number.isFinite(r.zBase[i])) continue;
        valCells++;
        if (r.zInv[i] > r.zBase[i]) invCells++;
      }
    }
    profileStat = {
      source: profileSrc.id, run: profileSrc.run, stepH, levels: profileSrc.adapter.profileLevels ?? null,
      steps: done, missing: missed,
      // Der Anteil ist die einzige Zahl, die sagt, ob die Fallunterscheidung von
      // PAP 4 überhaupt je greift. Steht er auf 0, ist das Feld zwar belegt und
      // trotzdem wertlos — deshalb wird er gemeldet, nicht nur geloggt.
      inversionShare: valCells ? invCells / valCells : 0,
    };
    console.log(`  ${tierId}: Profil aus ${profileSrc.id} — ${done} Stunden (Raster ${stepH} h), `
      + `${missed} ohne, Inversionsanteil ${(profileStat.inversionShare * 100).toFixed(1)} %`);
  }

  const tFields = Date.now();

  // hModEff: Mittel der Modellorographien der beitragenden Quellen. Bei gleichen
  // Gewichten ist das ihr arithmetisches Mittel; bei genau einer Quelle deren HSURF.
  const oros = [];
  for (const c of contributors) {
    let o = await safeCall(c, 'Orographie', () => c.adapter.orography(c.run, tier));
    if (!o) continue;
    // Auch hier die Domäne: sonst mittelt `hModEff` die Modellhöhe einer Quelle ein, die
    // die Zelle gar nicht trägt — und `h_true − h_mod_eff` ist genau der Term, den PAP 4
    // korrigiert. Ein falsches `hModEff` verschiebt die Höhenkorrektur, nicht die Optik.
    if (c.mask) o = applyMask(o, c.mask);
    oros.push(o);
  }
  if (oros.length) {
    const mp = meta('hModEff');
    const plane = planeAt('hModEff');
    for (let k = 0; k < cells; k++) {
      let n = 0, sum = 0;
      for (const o of oros) if (Number.isFinite(o[k])) { n++; sum += o[k]; }
      if (n === 0) continue;
      const q = quantize(sum / n, mp);
      for (let it = 0; it < nt; it++) plane[it * cells + k] = q;
    }
  }

  // --- Chunks schneiden ------------------------------------------------------
  const files = [];
  let bytesTotal = 0;
  const perPlane = new Array(CUBE_PLANES.length).fill(0);
  const hasData = new Array(CUBE_PLANES.length).fill(false);
  const runId = contributors.map((c) => c.run).sort().at(-1);

  for (let cy = 0; cy < tier.chunk.cy; cy++) {
    for (let cx = 0; cx < tier.chunk.cx; cx++) {
      const ext = chunkExtent(tier, cy, cx);
      const n = nt * ext.ny * ext.nx;
      const cut = CUBE_PLANES.map((_, pi) => {
        const out = new Int16Array(n);
        const src = planes[pi];
        let w = 0;
        for (let it = 0; it < nt; it++) {
          const b = it * cells;
          for (let ry = 0; ry < ext.ny; ry++) {
            const row = b + (ext.y0 + ry) * tier.nx + ext.x0;
            for (let rx = 0; rx < ext.nx; rx++) out[w++] = src[row + rx];
          }
        }
        return out;
      });
      const bytes = await encodeCubeChunk({
        runHours: Math.floor(Date.parse(runIso(runId)) / 3_600_000),
        tierIndex: tier.index, nt, y0: ext.y0, x0: ext.x0, ny: ext.ny, nx: ext.nx, planes: cut,
      }, deflate9);
      const rel = chunkPath(runId, tier, cy, cx);
      const p = join(opts.out ?? OUT, rel.replace(/^point\//, ''));
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, bytes);
      files.push({ file: rel, bytes: bytes.length, cy, cx });
      bytesTotal += bytes.length;
      for (let pi = 0; pi < CUBE_PLANES.length; pi++) {
        perPlane[pi] += (await deflate9(new Uint8Array(cut[pi].buffer))).length;
        if (!hasData[pi]) for (const v of cut[pi]) if (v !== MISSING) { hasData[pi] = true; break; }
      }
    }
  }

  return {
    tier: tierId, run: runId, leadHours, files, bytesTotal, skipped, dropped,
    contributors: contributors.map((c) => ({
      id: c.id, run: c.run, leads: c.leads.size, role: c.role,
      coverage: c.coverage, maskInside: c.maskInside, cells, offsetH: c.offsetH,
      ensembleControlOnly: !!c.adapter.ensembleControlOnly,
      ensembleOnly: !!c.adapter.ensembleOnly,
      members: c.adapter.members ?? null,
      // PD-C2: wie oft diese Quelle in dieser Stufe geworfen hat, und ob sie deshalb
      // herausfiel. `0`/`null` ist der Normalfall — eine Zahl hier ist ein Befund.
      errors: c.errors ?? 0, firstError: c.firstError ?? null, dropped: c.dropped ?? null,
    })),
    profile: profileStat,
    quantiles: quantStat,
    ensemble: ensStat,
    perPlane: Object.fromEntries(CUBE_PLANES.map((p, i) => [p.id, perPlane[i]])),
    hasData: Object.fromEntries(CUBE_PLANES.map((p, i) => [p.id, hasData[i]])),
    ms: { fields: tFields - t0, total: Date.now() - t0 },
  };
}

/** Lauf-Manifest über alle gebauten Stufen. */
export function runManifest(results) {
  const built = results.filter((r) => !r.empty);
  const runId = built.map((r) => r.run).sort().at(-1);
  const sources = [];
  for (const r of built) {
    for (const c of r.contributors) {
      const s = SOURCE_BY_ID[c.id];
      sources.push({
        id: c.id, name: s?.name ?? c.id, tier: r.tier, runAt: runIso(c.run),
        fromH: r.leadHours[0], toH: r.leadHours[r.leadHours.length - 1], steps: c.leads,
        // Wie viele Member tatsächlich gelesen wurden. Steht hier, weil die
        // Standardabweichung aus n Membern die wahre systematisch UNTERSCHÄTZT:
        // E[s] = c4(n)·σ, also 0,973·σ bei n = 10 und 0,995·σ bei n = 51. Das ist eine
        // Ein-Zeilen-Korrektur — aber nur, wenn der Leser n kennt. `0` heißt
        // deterministisch (kein Ensemble), `1` heißt: nur der Kontrolllauf.
        // ⚠ Stand bis 2026-09-09 auf `c.adapter?.…` — und `contributors` trug nie ein
        // `adapter`-Feld, die Zahl war also immer 0. Ein Feld, das immer dasselbe sagt,
        // sagt nichts (dieselbe Lehre wie bei `sigmaKind` → `srcCount`).
        // ⚠ Seit PD-B8 falsch, bis PD-B10 unbemerkt: die EPS-Quellen standen hier auf 0,
        // also nach der eigenen Definition oben auf „deterministisch“. Eine reine
        // σ_ens-Quelle nennt jetzt die Zahl ihrer Member.
        members: c.ensembleOnly ? (c.members ?? null) : (c.ensembleControlOnly ? 1 : 0),
        // `assigned` = von QUELLENMATRIX §1 diesem Band zugeordnet. `diversity` = zusaetzlich
        // gelesen, damit es ueberhaupt eine zweite Meinung fuer σ_div gibt.
        // ⚠ Beide gehen mit GLEICHEM Gewicht in den Mittelwert (`fusion.weights: 'equal'`) —
        // eine Trennung waere nur mit gemessenem Σ moeglich, und Σ gibt es erst mit
        // buscosun-archiv. Praktisch heisst das: wo die zugeordnete Quelle ein Band nur
        // teilweise deckt (t2: ICON-EU traegt oft nur die ersten Stunden), tragen den Rest
        // die groeberen Globalmodelle. Wer `role` ignoriert, haelt eine Aufloesungsdifferenz
        // fuer Unsicherheit — deshalb steht sie hier je Quelle.
        role: c.role ?? 'assigned',
        // Trägt der gewählte Lauf das ganze Band der Stufe (`full`) oder nur seinen Anfang
        // (`partial`)? Ohne diese Angabe sieht eine Quelle, die bei 144 h aufhört, im
        // Manifest genauso aus wie eine, die bis 336 h reicht.
        coverage: c.coverage ?? 'full',
        // Wie viele Stunden der Lauf dieser Quelle VOR dem Publikationslauf liegt. Der
        // Producer rechnet damit in Gültigzeit: Stunde `h` des Cubes ist bei dieser
        // Quelle die Stunde `h + offsetH`. Ohne diese Übersetzung mittelte er Werte
        // verschiedener Gültigzeiten in dieselbe Zelle (gemessen: 12 h bei IFS in t3).
        offsetH: c.offsetH ?? 0,
        // WO die Quelle überhaupt schreiben durfte. `cells` ist der Stufenausschnitt,
        // `covered` der Teil davon, den ihre Domäne (∩ clip, minus edgeMarginKm) trägt.
        // Damit kann ein Leser für einen Punkt ausrechnen, welche Quellen ihn stützen —
        // ohne eine weitere Rasterebene und ohne Bitmaske.
        geometry: s?.domain || s?.clip ? {
          cells: c.cells, covered: c.maskInside,
          domain: s.domain ?? null, clip: s.clip ?? null, edgeMarginKm: s.edgeMarginKm ?? 0,
          from: 'coversPoint(domain ∩ clip, edgeMarginKm) am Zellmittelpunkt',
        } : null,
        attribution: s?.attribution ?? null, licence: s?.licence ?? null,
        // PD-C2 (V-PD-40): Fehler dieser Quelle in dieser Stufe. Jeder Fehler ließ die
        // Zelle MISSING statt den Lauf sterben; `dropped` heißt: ab hier gar nicht mehr gefragt.
        errors: c.errors ?? 0, firstError: c.firstError ?? null, dropped: c.dropped ?? null,
      });
    }
  }
  return {
    // Aus der Konstante, nicht als Zahl abgeschrieben: es gab hier eine zweite Wahrheit,
    // und sie stand nach dem Sprung auf Schema 2 falsch da (Lehre BW-1: eine
    // fortgeschriebene Zahl ist irgendwann eine falsche Zahl).
    schema: CUBE_SCHEMA,
    run: runId,
    runAt: runIso(runId),
    tiers: built.map((r) => {
      const t = TIER_BY_ID[r.tier];
      return {
        id: t.id, deg: t.deg, lat0: t.lat0, lon0: t.lon0, ny: t.ny, nx: t.nx,
        chunk: { cells: CHUNK_CELLS, cy: t.chunk.cy, cx: t.chunk.cx },
        // Verzeichnis = PUBLIKATIONSLAUF (der neueste über alle Stufen), `run` hier
        // = QUELL-Lauf DIESER Stufe. Die zwei fallen regelmäßig auseinander: t1 kommt
        // aus ICON-D2 12z, t3 aus ICON global 06z. Wer nur das Verzeichnis liest,
        // hielte die Fernstufe für sechs Stunden jünger, als sie ist — genau die
        // Sorte stiller Fehler, gegen die der Header sein eigenes `runHours` trägt.
        run: r.sourceRun ?? r.run, runAt: runIso(r.sourceRun ?? r.run),
        ageH: Math.round((Date.parse(runIso(runId)) - Date.parse(runIso(r.sourceRun ?? r.run))) / 3_600_000),
        leadHours: r.leadHours, files: r.files,
        // ── Profil (PD-B5) ────────────────────────────────────────────────
        // Ohne diese Zeilen wäre `gammaEff` eine Zahl ohne Herkunft. Sie sagen:
        // aus WELCHER Quelle, in welchem Zeitraster, über wie viele Modelllevel,
        // mit welchen Schwellen — und wie oft überhaupt eine Inversion gefunden
        // wurde. Steht `inversionShare` auf 0, ist das Feld belegt und trotzdem
        // wirkungslos: PAP 4 bliebe bei Fall A. Das gehört gesagt, nicht geloggt.
        // ── Quantile (PD-B7) ──────────────────────────────────────────────
        // Ohne diese Zeilen wüsste kein Leser, aus WELCHEM Modell die Bänder
        // stammen — und `_q10` sähe aus wie eine Eigenschaft der Fusion statt
        // einer Eigenschaft von C-LAEF.
        quantiles: r.quantiles ?? null,
        ensemble: r.ensemble ?? null,
        // PD-C2: Netzvolumen dieser Stufe je Quelle (Bytes, Dateien, 404, 429) — die
        // Messgrundlage für jede Volumenentscheidung (PD-C6…C9). `null` bei einem
        // Manifest, das aus einem älteren Producer stammt.
        net: r.net ?? null,
        dropped: (r.dropped ?? []).map(([id, reason]) => ({ id, reason })),
        profile: r.profile ? {
          ...r.profile,
          params: PROFILE_PARAMS,
          provenance: 'single-source',
          why: 'Profilfelder werden NICHT gemittelt — der Mittelwert zweier '
            + 'Inversionsobergrenzen ist keine Inversionsobergrenze.',
          calibrated: false,
          calibNote: 'gammaDepthM/dzMinM/dTMinK sind Startwerte; gemessen werden sie '
            + 'erst aus buscosun-archiv (Felder 30–39, E-14).',
        } : null,
      };
    }),
    planes: CUBE_PLANES.map((p) => ({ id: p.id, unit: p.unit, scale: p.scale, offset: p.offset, group: p.group })),
    sources,
    // Ohne diese Zeilen sähe eine gesetzte Gewichtung aus wie eine gemessene.
    fusion: {
      weights: 'equal',
      provenance: 'fallback',
      note: 'PAP 2 verlangt w = Σ⁻¹1/(1ᵀΣ⁻¹1). Σ ist ungemessen, solange buscosun-archiv nicht läuft (§21 (4)); bis dahin gleiche Gewichte.',
      sigma: 'σ_div aus der Quellenstreuung über ALLE gelesenen Quellen (assigned und diversity, gleiche Gewichte). Der Sockel σ_sys aus PAP 6 fehlt noch; srcCount sagt je Zelle, wie viele Quellen getragen haben, und sd-vorhanden je Größe, welcher PAP-6-Zweig galt.',
      resolutionCaveat: 'Wo Quellen verschiedener Maschenweite in dieselbe Zelle fallen, enthält σ_div auch die Auflösungsdifferenz, nicht nur Vorhersageunsicherheit. `sources[].role` und `fromH/toH` sagen, wo das der Fall ist: `assigned` deckt das Band laut Quellenmatrix, `diversity` ist zusätzlich gelesen. Deckt die zugeordnete Quelle nur einen Teil des Bandes (Beispiel t2: ICON-EU trägt kurz nach dem Lauf nur die ersten Stunden), tragen den Rest die gröberen Globalmodelle — das ist im Manifest an `steps` je Quelle ablesbar.',
      memberBias: 'Wo σ aus Ensemble-Membern käme, gilt E[s] = c4(n)·σ (0,973 bei n=10, 0,995 bei n=51). `sources[].members` nennt n je Quelle, die Ebene `ensCount` nennt n je Zelle. Die Korrektur ist NICHT angewandt — sie steht hier, damit ein Leser sie anwenden kann.',
      spread: {
        div: '`<var>_sd` — Streuung ZWISCHEN den Quellen an derselben Zelle und Stunde, gleiche Gewichte, Bessel-korrigiert. Braucht mindestens zwei Quellen; `srcCount` sagt je Zelle, wie viele es waren.',
        ens: '`<var>_sd_ens` — Streuung ZWISCHEN den Membern INNERHALB einer Quelle. `ensCount` sagt je Zelle, wie viele Member getragen haben. Seit PD-B8 aus echten Membern, seit PD-B10 mit je Member entakkumuliertem Niederschlag (vorher stand dort die Streuung der Summe seit Laufbeginn). Je Stunde genau EINE Quelle — welche, steht in `tiers[].ensemble.byHour`.',
        rule: 'PAP 6 verzweigt ENTWEDER-ODER: liegt `<var>_sd_ens` vor, gilt σ = c(p,f)·σ_ens; sonst, wenn `<var>_sd` vorliegt, σ² = σ_div² + σ_sys²; sonst nur σ_sys. Der Zweig steht NICHT als Flag da — er ist an der Anwesenheit der Ebene ablesbar, je Größe und je Zelle (`sigmaKindOf`).',
        doNotAdd: '⚠ `_sd` und `_sd_ens` NICHT addieren. Die Member einer Quelle streuen bereits um deren eigenes Mittel, und dieses Mittel geht anschließend in σ_div ein — die Summe zählte dieselbe Unsicherheit zweimal.',
        noEns: 'Welche `_sd_ens`-Ebenen in DIESEM Lauf leer blieben, steht GEZÄHLT unter `sdEnsEmpty` — nicht als Liste im Text: die Liste von PD-B2 („nur snowlmt“) war mit Schema 3 falsch, und bis PD-B10 hat es niemand gemerkt (BW-1).',
        sdEnsEmpty: CUBE_PLANES.filter((p) => p.id.endsWith('_sd_ens'))
          .filter((p) => !built.some((r) => r.hasData?.[p.id])).map((p) => p.id),
      },
      geometry: 'Eine Quelle trägt eine Zelle nur, wenn `coversPoint(domain ∩ clip, edgeMarginKm)` für den Zellmittelpunkt gilt (QUELLENMATRIX §2: geometrisch, nicht über das Land). `sources[].geometry` nennt je Quelle den Kasten und wie viele Zellen der Stufe er trägt; `srcCount` zählt je Zelle und Schritt die Quellen, die tatsächlich geliefert haben. Ohne diese Maske verschmiert `fillNearest` bis zu drei Ringe über den Domänenrand — bei Stufe 1 rund 15 km.',
      validTime: 'Alle Quellen tragen zur selben GÜLTIGZEIT bei. Der Publikationslauf ist der jüngste beitragende Lauf; eine Quelle mit älterem Lauf wird bei `leadH + sources[].offsetH` gelesen, nicht bei `leadH`. Ohne diese Übersetzung lägen die Beiträge um die Laufdifferenz auseinander — bei IFS in Stufe 3 gemessen 12 h, was den Tagesgang verwischt und σ_div mit einem Zeitversatz aufbläht, der wie Modelluneinigkeit aussieht.',
      runChoice: 'Je Quelle wird der neueste Lauf gewählt, der das GANZE Band der Stufe trägt (`coverage: "full"`); gibt es den nicht, der neueste, der wenigstens die erste Stunde trägt (`coverage: "partial"`). Vorher entschied allein die erste Stunde — damit gewann bei ECMWF der jüngere `scda`-Lauf (144 h) über den `oper`-Lauf (360 h), und jenseits 180 h blieb eine einzige Quelle übrig. Die Registry-Horizonte dienen nur als Vorfilter; geprüft wird am Objekt.',
    },
    skipped: Object.fromEntries(built.flatMap((r) => r.skipped)),
    pending: PENDING,
  };
}

/**
 * Alle Stufen unter EINEN Publikationslauf legen.
 *
 * Jede Stufe schneidet ihre Chunks unter dem Lauf ihrer eigenen Quellen — t1 aus
 * ICON-D2 12z, t2/t3 aus ICON global 06z. Das Manifest lag aber immer unter dem
 * NEUESTEN Lauf. Ergebnis am 2026-09-09: `point/2026090906/` trug 68 Chunks, sein
 * `run.json` nannte nur t2, und die zwölf t3-Chunks waren unauffindbar.
 *
 * Die Verschiebung ist reine Umbenennung — kein Byte im Chunk ändert sich, und der
 * Header behält sein `runHours` aus dem Quell-Lauf. Damit gilt wieder: ein
 * Verzeichnis = eine Veröffentlichung = ein Manifest, und die Aufbewahrung nach
 * Alter löscht ganze, in sich geschlossene Läufe statt halber.
 */
export function placeUnderPublishRun(results, out) {
  const built = results.filter((r) => !r.empty);
  if (built.length === 0) return null;
  const publishRun = built.map((r) => r.run).sort().at(-1);
  for (const r of built) {
    r.sourceRun = r.run;
    if (r.run === publishRun) continue;
    const from = join(out, r.run, r.tier);
    const to = join(out, publishRun, r.tier);
    mkdirSync(dirname(to), { recursive: true });
    if (existsSync(to)) rmSync(to, { recursive: true, force: true });
    renameSync(from, to);
    r.files = r.files.map((f) => ({ ...f, file: f.file.replace(`/${r.run}/`, `/${publishRun}/`) }));
    r.run = publishRun;
    // Das leere Quell-Verzeichnis mitnehmen; ein `point/<lauf>/` ohne Chunks sähe
    // aus wie ein Lauf, der nichts geliefert hat.
    const old = join(out, r.sourceRun);
    if (existsSync(old) && readdirSync(old).length === 0) rmSync(old, { recursive: true, force: true });
    console.log(`  ${r.tier}: Quellen aus ${r.sourceRun}, abgelegt unter ${publishRun}`);
  }
  return publishRun;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseSteps(spec, tier) {
  if (!spec) return tier.leadHours;
  const m = /^(\d+)-(\d+)$/.exec(spec);
  if (m) return tier.leadHours.filter((h) => h >= +m[1] && h <= +m[2]);
  return spec.split(',').map(Number).filter((h) => tier.leadHours.includes(h));
}

async function main() {
  const args = {};
  for (const s of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(s);
    if (m) args[m[1]] = m[2] ?? '1';
  }
  const wanted = (args.tiers && args.tiers !== 'all') ? args.tiers.split(',') : TIERS.map((t) => t.id);
  const only = args.only ? args.only.split(',') : null;
  const out = args.out || OUT;
  // ── `--run` (PD-C2, V-PD-38) ─────────────────────────────────────────────
  // Die Cron-Vorlage reichte `--run=<Lauf>` seit PD-A durch, und niemand las es — ein
  // Eingabefeld, das nichts tat (dieselbe Klasse wie V-SH-11). Jetzt ist der Lauf eine
  // OBERGRENZE: die Laufsuche jeder Quelle beginnt eine Stunde nach diesem Lauf, also
  // gewinnt kein Lauf, der jünger ist. Für Quellen mit gröberem Takt (6 h) rundet
  // `runIdBack` auf ihren letzten Slot davor ab. So lässt sich ein Ausfall nachbauen.
  let nowMs;
  if (args.run) {
    if (!/^\d{10}$/.test(args.run)) { console.error(`--run erwartet YYYYMMDDHH, nicht „${args.run}"`); process.exit(1); }
    nowMs = Date.parse(runIso(args.run)) + 3_600_000;
    console.log(`Obergrenze --run=${args.run}: keine Quelle nimmt einen jüngeren Lauf`);
  }
  resetNetStats();

  // ── Speicher je Stufe (PD-B10, §45) ─────────────────────────────────────
  // Der Cron ist einmal an der V8-Heap-Grenze gestorben (§43.11), und die Prozessgröße
  // allein sagt nicht, wie nah: der Speicher hinter Typed Arrays und Buffers liegt
  // AUSSERHALB des Heaps und zählt nicht gegen dessen Grenze. Im ersten PD-B10-Gesamtlauf
  // stand die Prozessgröße bei 4,2 GB — ohne diese Zeile bliebe offen, ob das Gefahr
  // oder nur nicht zurückgegebener Speicher ist. Eine Zeile je Stufe im Cron-Protokoll.
  const mem = {
    limit: v8.getHeapStatistics().heap_size_limit,
    peak: { heap: 0, ext: 0, rss: 0 },
    mb: (b) => Math.round(b / 1048576),
    sample() {
      const m = process.memoryUsage();
      this.peak.heap = Math.max(this.peak.heap, m.heapUsed);
      this.peak.ext = Math.max(this.peak.ext, m.external);
      this.peak.rss = Math.max(this.peak.rss, m.rss);
    },
    reset() { this.peak = { heap: 0, ext: 0, rss: 0 }; this.sample(); },
  };
  setInterval(() => mem.sample(), 1000).unref();

  const results = [];
  for (const id of wanted) {
    const tier = TIER_BY_ID[id];
    if (!tier) { console.error(`unbekannte Stufe ${id}`); process.exit(1); }
    const steps = parseSteps(args.steps, tier);
    if (steps.length === 0) { console.log(`\n── Stufe ${id}: keine Schritte im gewählten Bereich`); continue; }
    console.log(`\n── Stufe ${tier.id} · ${tier.deg}° · ${tier.ny}×${tier.nx} · ${steps.length} Schritte ${steps[0]}–${steps.at(-1)} h`);
    mem.reset();
    const netBefore = netStats();
    const r = await buildTier(id, { steps, only, out, nowMs });
    mem.sample();
    console.log(`  Speicher: Heap max ${mem.mb(mem.peak.heap)} von ${mem.mb(mem.limit)} MiB · `
      + `extern max ${mem.mb(mem.peak.ext)} MiB · RSS max ${mem.mb(mem.peak.rss)} MiB`);
    // Netz JE QUELLE (PD-C2): die Zahl, an der jede Volumenentscheidung hängt — bis
    // hier gab es sie nur als Summe über den Lauf.
    r.net = netDiff(netBefore, netStats());
    const netLine = Object.entries(r.net).sort((a, b) => b[1].bytes - a[1].bytes)
      .map(([sid, n]) => `${sid} ${(n.bytes / 1048576).toFixed(1)} MiB/${n.files}${n.throttled ? ` ⚠${n.throttled}×429` : ''}${n.absent ? ` (${n.absent}×404)` : ''}`);
    if (netLine.length) console.log(`  Netz je Quelle: ${netLine.join(' · ')}`);
    const cc = clearCache();
    if (!cc.skipped) console.log(`  Plattencache geleert: ${cc.files} Dateien, ${(cc.bytes / 1048576).toFixed(0)} MiB (${cc.kept} Konstanten behalten)`);
    results.push(r);
    if (r.dropped?.length) for (const [sid, why] of r.dropped) console.log(`  ⚠ herausgefallen ${sid}: ${why}`);
    if (r.empty) {
      console.log('  KEINE Quelle lieferbar:');
      for (const [sid, why] of r.skipped) console.log(`    ${sid}: ${why}`);
      continue;
    }
    const byRole = (role) => r.contributors.filter((c) => c.role === role);
  console.log(`  zugeordnet: ${byRole('assigned').map((c) => `${c.id}@${c.run} (${c.leads} Std.)`).join(' · ') || '—'}`);
  // NICHT „nur σ": diese Quellen gehen mit gleichem Gewicht in den Mittelwert (§28).
  if (byRole('diversity').length) console.log(`  zusätzlich gelesen (Mittel + σ): ${byRole('diversity').map((c) => `${c.id}@${c.run} (${c.leads} Std.)`).join(' · ')}`);
    for (const [sid, why] of r.skipped) console.log(`  übersprungen ${sid}: ${why}`);
    console.log(`  ${r.files.length} Chunks · ${(r.bytesTotal / 1048576).toFixed(2)} MiB · Median ${(median(r.files.map((f) => f.bytes)) / 1024).toFixed(1)} KiB`);
    const filled = Object.entries(r.perPlane).filter(([k]) => r.hasData[k]).sort((a, b) => b[1] - a[1]);
    console.log(`  mit Werten (${filled.length}/${CUBE_PLANES.length}): ${filled.map(([k, v]) => `${k} ${(v / 1024).toFixed(0)}`).join(' · ')}`);
    const empty = Object.keys(r.perPlane).filter((k) => !r.hasData[k]);
    if (empty.length) console.log(`  durchgehend MISSING: ${empty.join(', ')}`);
    console.log(`  ms: Felder ${r.ms.fields} · gesamt ${r.ms.total}`);
  }

  const built = results.filter((r) => !r.empty);
  if (built.length) {
    placeUnderPublishRun(results, out);
    const man = runManifest(results);
    if (args.run) man.note = `--run=${args.run}: Obergrenze der Laufsuche; keine Quelle nimmt einen jüngeren Lauf (PD-C2, V-PD-38)`;
    const mp = join(out, runManifestPath(man.run).replace(/^point\//, ''));
    mkdirSync(dirname(mp), { recursive: true });
    // ── Nie eine fremde Stufe aus dem Manifest werfen ────────────────────────
    // Am 2026-09-09 in drei getrennten Prozessen gebaut: jeder schrieb sein eigenes
    // `run.json`, der letzte gewann — und die zwölf t3-Chunks lagen im Verzeichnis,
    // ohne im Manifest zu stehen. Ein Chunk ohne Manifest ist Zahlensalat, und ein
    // Manifest, das vorhandene Dateien verschweigt, ist die stille Variante davon.
    if (existsSync(mp)) {
      try {
        const prev = JSON.parse(readFileSync(mp, 'utf8'));
        const mine = new Set(man.tiers.map((t) => t.id));
        const kept = (prev.tiers ?? []).filter((t) => !mine.has(t.id));
        if (kept.length) {
          man.tiers = [...man.tiers, ...kept].sort((a, b) => a.id.localeCompare(b.id));
          const mineSrc = new Set(man.sources.map((x) => `${x.tier}:${x.id}`));
          man.sources = [...man.sources, ...(prev.sources ?? []).filter((x) => !mineSrc.has(`${x.tier}:${x.id}`))];
          console.log(`  Manifest: ${kept.map((t) => t.id).join('+')} aus dem vorigen Lauf übernommen`);
        }
      } catch { /* unlesbares Manifest wird ersetzt, nicht gerettet */ }
    }
    writeFileSync(mp, JSON.stringify(man, null, 2));
    const n = netStats();
    console.log(`\n${built.length} Stufe(n) · ${built.reduce((a, r) => a + r.files.length, 0)} Chunks · ` +
      `${(built.reduce((a, r) => a + r.bytesTotal, 0) / 1048576).toFixed(2)} MiB`);
    console.log(`Netz: ${n.files} Dateien (${(n.bytes / 1048576).toFixed(1)} MiB), ${n.cached} aus dem Cache, ${n.absent} nicht vorhanden`);
    console.log(`Manifest: ${mp}`);
  }
}

if (process.argv[1]?.endsWith('build-point-cube.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
