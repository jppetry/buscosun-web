/**
 * resolve.ts — welche Quelle ist für DIESEN Punkt zu DIESER Zeit die beste? (PD-D3)
 *
 * Die Vorstufe der buscosun Fusion rechnet nichts. Sie wählt — und sie sagt, warum.
 * Jede Entscheidung trägt ihren Grund als Text, damit ein Leser nicht raten muss, ob
 * ein fehlender Wert eine Lücke, ein Raster oder eine fehlende Abdeckung war.
 *
 * ── Warum die Auswahl auf PRODUKT-Ebene läuft und nicht auf Modell-Ebene ───
 * Der Cube trägt keine Werte einzelner Quellen: `build-point-cube.mjs` reduziert die
 * Bitmaske `srcMask` vor dem Kodieren auf ihre Quersumme, und was im Container landet,
 * ist `srcCount` — WIE VIELE Quellen getragen haben, nicht WELCHE. „Beste Quelle" hat
 * im Repo deshalb heute genau eine beantwortbare Bedeutung: Nowcast, Stationsprodukt
 * oder eine der drei Cube-Stufen. Werte je Modell bräuchten ein neues Producer-Produkt
 * (`extract.bin`, E-D-1) — s. `audit/fusion-vorstufe.md` §1.
 *
 * ── Warum es je Zeitpunkt DREI Sieger geben kann ───────────────────────────
 * Weil die Produkte Verschiedenes können, nicht Verschiedenes gut:
 *   * der Nowcast trägt **nur Niederschlag**, dafür als 1–6 min alte Beobachtung;
 *   * das Stationsprodukt trägt 12 Größen **am Ort** und stündlich bis 247 h, aber
 *     **keine einzige Unsicherheitsangabe** (`srcCount` = 1);
 *   * der Cube trägt σ, Quantile und Profil — und sonst niemand.
 * Einen davon zum Alleinsieger zu erklären hieße, dem Leser etwas wegzunehmen, das da
 * ist. Deshalb: `primary` (die meisten Größen), `precip` (die beste Niederschlagsquelle)
 * und `uncertainty` (die einzige mit σ) — jede benannt, keine stillschweigend gemischt.
 */

import { TIERS, TIER_BY_ID, type TierId, cellOf } from '../cubeFormat';
import type { NowcastSourceId } from '../nowcastFormat';
import type { PointStore } from './store';
import { type PointIndex, loadPointIndex } from './cubePoint';
import {
  loadStationCatalog, nearestStations, type StationCandidate, type StationRunManifest,
} from './stationPoint';
import { findLatestSlot, nowcastSourcesFor, type NowcastSlot } from './nowcastPoint';
import { SOURCE_BY_ID } from '../sourceMatrix';

const H = 3_600_000;

/**
 * Die Schwellen der Auswahl. **Gesetzt, nicht gemessen** — wie die Profil-Schwellen aus
 * PD-B5, und aus demselben Grund so beschriftet: ein Wert, der wie ein Messergebnis
 * aussieht, es aber nicht ist, ist der teuerste Fehler dieses Produkts.
 *
 * Begründung der Größenordnung, damit die Zahlen nicht aus der Luft kommen:
 *   * `stationMaxKm = 15` — bei 15 km hat über die Cube-Box gemessen etwa jeder dritte
 *     Rasterpunkt KEINE Station mehr (Median 9,2 km, p75 18,3 km). Weiter zu greifen
 *     hieße, eine punktgenaue Vorhersage über eine Strecke zu tragen, für die sie nicht
 *     gemacht ist.
 *   * `stationMaxDElevM = 100` — MOSMIX ist AN DER STATION bias-korrigiert. Bei 100 m
 *     Höhendifferenz liegen allein aus dem Standardgradienten 0,65 K dazwischen; mehr
 *     wäre eine Korrektur, die für den falschen Ort gilt.
 * Beide sind Kandidaten für E-D-2 und gehören in `calib.json`, sobald `buscosun-archiv`
 * sie messen kann.
 */
export const SELECTION = Object.freeze({
  stationMaxKm: 15,
  stationMaxDElevM: 100,
  calibrated: false,
  why: 'PD-D3, audit/fusion-vorstufe.md §9. Gesetzte Startwerte, keine Messung.',
});

export type ProductId = 'nowcast' | 'stations' | 'cube-t1' | 'cube-t2' | 'cube-t3';

export interface Candidate {
  product: ProductId;
  /** Nowcast: die Radarquelle. Cube: die Stufe. Stationen: die Stations-ID. */
  detail: string;
  /** Trägt dieses Produkt die angefragte Gültigzeit? */
  available: boolean;
  /** Warum es gewählt wurde — oder warum nicht. Immer gefüllt. */
  reason: string;
  /** Abstand zum nächsten eigenen Rasterschritt in Minuten; `null` wenn nicht tragend. */
  offsetMin: number | null;
  /** Alter des tragenden Laufs/Slots in Stunden zur ANGEFRAGTEN Zeit. */
  ageH: number | null;
  /** Räumlicher Abstand: Zellmittelpunkt bzw. Station. */
  distanceKm: number | null;
  /** Zahl der Größen, die dieses Produkt überhaupt führen kann. */
  quantities: number;
  /** Führt es Unsicherheit (σ, Quantile)? */
  hasUncertainty: boolean;
}

export interface Decision {
  atMs: number;
  /** Die gewählte Quelle. `null` = keine trägt diese Gültigzeit. */
  primary: Candidate | null;
  /** Das jeweils andere tragende Produkt — zum Vergleichen, nicht zum Mischen. */
  alternative: Candidate | null;
  /** Beste Niederschlagsquelle. Weicht von `primary` ab, wenn der Nowcast greift. */
  precip: Candidate | null;
  /** Einzige Quelle für σ/Quantile — immer eine Cube-Stufe oder `null`. */
  uncertainty: Candidate | null;
  /** Alle geprüften Kandidaten, auch die abgelehnten, mit Grund. */
  candidates: Candidate[];
}

/** Ein Abschnitt der Zeitachse, über den dieselbe Wahl gilt. */
export interface PlanSegment {
  fromMs: number;
  toMs: number;
  primary: ProductId | null;
  alternative: ProductId | null;
  precip: ProductId | null;
  uncertainty: ProductId | null;
  detail: string;
  reason: string;
  steps: number;
}

export interface PointPlan {
  lat: number;
  lon: number;
  elevationM: number | null;
  nowMs: number;
  index: PointIndex;
  station: {
    candidate: StationCandidate | null;
    accepted: boolean;
    reason: string;
    manifest: StationRunManifest | null;
    /** Die nächsten Stationen zum Nachschauen, auch wenn keine angenommen wurde. */
    nearby: StationCandidate[];
  };
  nowcast: {
    covering: NowcastSourceId[];
    slots: NowcastSlot[];
  };
  decisions: Decision[];
  segments: PlanSegment[];
  /** Was im angefragten Zeitraum von KEINEM Produkt getragen wird. */
  gaps: Array<{ fromMs: number; toMs: number; why: string }>;
  selection: typeof SELECTION;
}

export interface PlanInput {
  lat: number;
  lon: number;
  /** Echte Geländehöhe in m. Ohne sie bleibt das Höhenkriterium ungeprüft — und gesagt. */
  elevationM?: number | null;
  /** Einzelner Zeitpunkt. */
  atMs?: number;
  /** Oder ein Zeitraum. */
  fromMs?: number;
  toMs?: number;
  /** Schrittweite der Auswertung im Zeitraum, in Stunden. Voreinstellung 1. */
  stepH?: number;
  nowMs?: number;
  /** Höchstzahl ausgewerteter Zeitpunkte (Schutz gegen eine 10-Jahres-Anfrage). */
  maxSteps?: number;
}

/** Wie viele Größen ein Produkt überhaupt führen kann — gezählt, nicht gesetzt. */
const CUBE_QUANTITIES = 51;
const STATION_QUANTITIES = 12;
const NOWCAST_QUANTITIES = 1;

function tierOf(p: ProductId): TierId | null {
  return p.startsWith('cube-') ? (p.slice(5) as TierId) : null;
}

/**
 * Vertritt die nächste Station den Punkt? Die Regel EINMAL — `planPointSources` und der
 * parallele Bündel-Leser (`readPoint.ts`) fragen beide hier, damit die Schwellen aus
 * `SELECTION` nicht an zwei Stellen stehen.
 */
export function judgeStation(
  catalogPresent: boolean, best: StationCandidate | null, elevationM: number | null,
): { accepted: boolean; reason: string } {
  if (!catalogPresent) return { accepted: false, reason: 'Stationskatalog nicht im Repo erreichbar.' };
  if (!best) return { accepted: false, reason: 'Keine Station im Katalog.' };
  if (best.distanceKm > SELECTION.stationMaxKm) {
    return { accepted: false, reason: `Nächste Station ${best.name} liegt ${best.distanceKm.toFixed(1)} km entfernt `
      + `(Schwelle ${SELECTION.stationMaxKm} km) — sie vertritt diesen Punkt nicht.` };
  }
  if (elevationM == null) {
    return { accepted: true, reason: `${best.name}, ${best.distanceKm.toFixed(1)} km. ⚠ Höhenkriterium NICHT geprüft: `
      + 'die Geländehöhe des Punktes wurde nicht übergeben. Station steht auf '
      + `${best.elev} m.` };
  }
  if (Math.abs(best.dElevM ?? 0) > SELECTION.stationMaxDElevM) {
    return { accepted: false, reason: `${best.name} liegt ${best.distanceKm.toFixed(1)} km entfernt, aber `
      + `${(best.dElevM ?? 0) > 0 ? '+' : ''}${Math.round(best.dElevM ?? 0)} m höher `
      + `(Schwelle ±${SELECTION.stationMaxDElevM} m) — die Bias-Korrektur gälte für den falschen Ort.` };
  }
  return { accepted: true, reason: `${best.name}, ${best.distanceKm.toFixed(1)} km, `
    + `${(best.dElevM ?? 0) >= 0 ? '+' : ''}${Math.round(best.dElevM ?? 0)} m — vertritt den Punkt.` };
}

/**
 * Der Plan: welche Quelle wann. Kostet **keinen einzigen Chunk** — nur Index,
 * Stationskatalog und -manifest sowie eine Slot-Sonde je Radarquelle. Das ist der
 * billige Teil, und er beantwortet die Frage „welche Quelle" schon vollständig.
 */
export async function planPointSources(store: PointStore, input: PlanInput): Promise<PointPlan | null> {
  const nowMs = input.nowMs ?? Date.now();
  const index = await loadPointIndex(store);
  if (!index) return null;

  const { lat, lon } = input;
  const elevationM = input.elevationM ?? null;

  // ── Zeitpunkte, über die entschieden wird ────────────────────────────────
  const stepH = input.stepH ?? 1;
  const maxSteps = input.maxSteps ?? 400;
  const times: number[] = [];
  if (input.atMs != null) {
    times.push(input.atMs);
  } else {
    const from = input.fromMs ?? nowMs;
    const to = input.toMs ?? from + 336 * H;
    for (let t = from; t <= to && times.length < maxSteps; t += stepH * H) times.push(t);
  }

  // ── Stationsprodukt: nächste Station und ob sie den Punkt vertritt ───────
  const catalog = await loadStationCatalog(store);
  const nearby = catalog ? nearestStations(catalog, lat, lon, { elevationM, limit: 5 }) : [];
  const best = nearby[0] ?? null;
  const judged = judgeStation(!!catalog, best, elevationM);
  const stationAccepted = judged.accepted;
  const stationReason = judged.reason;

  const stationRun = index.stations?.runs?.[0] ?? null;
  const stationManifest = stationAccepted && stationRun
    ? await store.json<StationRunManifest>(stationRun.manifest)
    : null;

  // ── Nowcast: welche Quellen tragen, und welcher Slot ist der jüngste ─────
  const covering = nowcastSourcesFor(lat, lon);
  const slots: NowcastSlot[] = [];
  for (const id of covering) {
    // Ein Transportfehler bei EINER Radarquelle darf den Plan nicht reißen — die Quelle
    // fehlt dann im Plan, und der Cube-Rückfall für 0–3 h greift (AP1, V-FI-5).
    let s: NowcastSlot | null = null;
    try { s = await findLatestSlot(store, id, nowMs); } catch { s = null; }
    if (s) slots.push(s);
  }

  // ── Entscheidung je Zeitpunkt ────────────────────────────────────────────
  const decisions = times.map((atMs) => decideAt({
    atMs, nowMs, lat, lon, index, stationAccepted, station: best, stationReason,
    stationManifest, stationRun, slots,
  }));

  return {
    lat, lon, elevationM, nowMs, index,
    station: { candidate: best, accepted: stationAccepted, reason: stationReason, manifest: stationManifest, nearby },
    nowcast: { covering, slots },
    decisions,
    segments: toSegments(decisions, stepH),
    gaps: gapsOf(decisions, stepH),
    selection: SELECTION,
  };
}

interface DecideCtx {
  atMs: number;
  nowMs: number;
  lat: number;
  lon: number;
  index: PointIndex;
  stationAccepted: boolean;
  station: StationCandidate | null;
  stationReason: string;
  stationManifest: StationRunManifest | null;
  stationRun: { run: string; runAt: string | null; manifest: string; leadHours: number | null } | null;
  slots: NowcastSlot[];
}

function decideAt(c: DecideCtx): Decision {
  const candidates: Candidate[] = [];

  // ── Cube-Stufen ─────────────────────────────────────────────────────────
  for (const tier of TIERS) {
    const p: ProductId = `cube-${tier.id}` as ProductId;
    const pointer = c.index.latestByTier[tier.id];
    const cell = cellOf(TIER_BY_ID[tier.id], c.lat, c.lon);
    if (!pointer || !pointer.runAt) {
      candidates.push(mk(p, tier.id, false, 'Kein Lauf dieser Stufe im Repo (Aufbewahrung je Stufe).', null, null, null, CUBE_QUANTITIES, true));
      continue;
    }
    if (!cell) {
      candidates.push(mk(p, tier.id, false, 'Punkt liegt außerhalb des Cube-Ausschnitts (45,5–55,5 °N / 5,5–17,5 °E).', null, null, null, CUBE_QUANTITIES, true));
      continue;
    }
    const runAtMs = Date.parse(pointer.runAt);
    const leadH = (c.atMs - runAtMs) / H;
    const ageH = (c.atMs - runAtMs) / H;
    if (leadH < tier.fromH || leadH > tier.toH) {
      candidates.push(mk(p, tier.id, false,
        `Gültigzeit liegt bei +${leadH.toFixed(1)} h dieses Laufs, die Stufe trägt ${tier.fromH}…${tier.toH} h.`,
        null, ageH, null, CUBE_QUANTITIES, true));
      continue;
    }
    // Abstand zum nächsten Rasterschritt — der Unterschied zwischen „kein Wert"
    // und „der Wert gilt drei Stunden daneben" (Diagnose §5).
    let bestLead = tier.leadHours[0];
    for (const lh of tier.leadHours) if (Math.abs(lh - leadH) < Math.abs(bestLead - leadH)) bestLead = lh;
    const offsetMin = (bestLead - leadH) * 60;
    candidates.push(mk(p, tier.id, true,
      `Stufe ${tier.id} (${tier.deg}°, ${tier.stepH}-h-Raster) trägt +${leadH.toFixed(1)} h des Laufs ${pointer.run}.`,
      offsetMin, ageH, null, CUBE_QUANTITIES, true));
  }

  // ── Stationsprodukt ─────────────────────────────────────────────────────
  if (!c.stationAccepted || !c.station || !c.stationRun?.runAt) {
    candidates.push(mk('stations', c.station?.id ?? '—', false, c.stationReason, null, null,
      c.station?.distanceKm ?? null, STATION_QUANTITIES, false));
  } else {
    const runAtMs = Date.parse(c.stationRun.runAt);
    const leads = c.stationManifest?.axis.leadHours ?? null;
    const maxLead = leads ? leads[leads.length - 1] : (c.stationRun.leadHours ?? 247);
    const minLead = leads ? leads[0] : 1;
    const leadH = (c.atMs - runAtMs) / H;
    if (leadH < minLead || leadH > maxLead) {
      candidates.push(mk('stations', c.station.id, false,
        `Gültigzeit liegt bei +${leadH.toFixed(1)} h des MOSMIX-Laufs, die Achse trägt ${minLead}…${maxLead} h.`,
        null, leadH, c.station.distanceKm, STATION_QUANTITIES, false));
    } else {
      const nearestLead = Math.round(leadH);
      candidates.push(mk('stations', `${c.station.id} ${c.station.name}`, true,
        `${c.stationReason} Stündliche Achse, ${STATION_QUANTITIES} Größen, KEINE Unsicherheit.`,
        (nearestLead - leadH) * 60, leadH, c.station.distanceKm, STATION_QUANTITIES, false));
    }
  }

  // ── Nowcast ─────────────────────────────────────────────────────────────
  for (const slot of c.slots) {
    const src = SOURCE_BY_ID[slot.sourceId];
    const reach = src?.horizonH.default ?? 0;
    const frames = slot.meta.frames ?? [];
    const base = slot.meta.runAtMs ?? slot.meta.validAtMs ?? slot.meta.fetchedAtMs ?? null;
    if (base == null) {
      candidates.push(mk('nowcast', slot.sourceId, false, 'Slot ohne verwertbare Zeitangabe.', null, null, null, NOWCAST_QUANTITIES, false));
      continue;
    }
    let bestOff: number | null = null;
    for (const f of frames) {
      const v = base + (f.lead ?? 0) * 60_000;
      const d = (v - c.atMs) / 60_000;
      if (bestOff == null || Math.abs(d) < Math.abs(bestOff)) bestOff = d;
    }
    // Ein Frame gilt nur, wenn die angefragte Zeit wirklich in seinem Raster liegt —
    // ein 5-Minuten-Produkt auf eine drei Stunden entfernte Zeit anzuwenden wäre
    // Extrapolation, die diese Quelle nicht anbietet.
    const inReach = c.atMs >= base - 60_000 && c.atMs <= base + reach * H + 60_000;
    const near = bestOff != null && Math.abs(bestOff) <= (slot.meta.frames?.length ? 30 : 0);
    if (inReach && near) {
      candidates.push(mk('nowcast', slot.sourceId, true,
        `Beobachtungsnah: Slot ${slot.stamp} ist ${slot.ageMin.toFixed(0)} min alt, Reichweite ${reach} h. `
        + 'Trägt NUR Niederschlag; ≥ 19,96 mm/h gesättigt, Null zweideutig ohne Domänenprüfung.',
        bestOff, slot.ageMin / 60, null, NOWCAST_QUANTITIES, false));
    } else {
      candidates.push(mk('nowcast', slot.sourceId, false,
        reach === 0
          ? `${slot.sourceId} hat keine Extrapolation (Analyse ${slot.stamp}); gilt nur für die Slot-Zeit.`
          : `Außerhalb der Reichweite: Slot ${slot.stamp} + ${reach} h endet vor der angefragten Zeit.`,
        bestOff, slot.ageMin / 60, null, NOWCAST_QUANTITIES, false));
    }
  }

  // ── Auswahl ─────────────────────────────────────────────────────────────
  const usable = candidates.filter((x) => x.available);
  const fineness = (x: Candidate): number =>
    (x.product === 'cube-t1' ? 3 : x.product === 'cube-t2' ? 2 : x.product === 'cube-t3' ? 1 : 0);
  const cubes = usable.filter((x) => x.product.startsWith('cube-')).sort((a, b) => fineness(b) - fineness(a));
  const cube = cubes[0] ?? null;
  const stationC = usable.find((x) => x.product === 'stations') ?? null;

  // Die Regel, und warum sie so und nicht anders lautet:
  //
  // Der Cube trägt an DERSELBEN Gültigzeit alles, was das Stationsprodukt trägt, und
  // 39 Ebenen mehr (σ, Quantile, Profil, `srcCount`). Trifft er die angefragte Stunde
  // auf seinem eigenen Raster, kostet seine Wahl also **nichts** — die Station steht
  // weiter als `alternative` daneben und kann verglichen werden.
  //
  // Sein Raster ist aber nur in Stufe 1 stündlich; in Stufe 2 sind es 3 h, in Stufe 3
  // 6 h. Liegt die angefragte Zeit dort zwischen zwei Schritten, hat die Station etwas,
  // das er nicht hat: einen Wert für näher an dieser Zeit. Dann gewinnt sie — nicht,
  // weil sie „besser" ist, sondern weil der Vergleich sonst zwischen einem Wert und
  // einem drei Stunden entfernten Wert liefe.
  //
  // ⚠ Verglichen werden die ABSTÄNDE, nicht der Cube gegen eine feste Schwelle. Der
  // erste Entwurf prüfte „|offset_cube| ≤ 15 min", und das war falsch: eine Anfrage auf
  // 07:25 verfehlt das stündliche Raster des Cubes um 25 min — die Station aber um
  // genau dieselben 25 min. Sie hätte gewonnen, ohne irgendetwas besser zu können, und
  // dabei 39 Ebenen mitgenommen. Am lebenden Datum aufgefallen, nicht am Entwurf.
  //
  // `RASTER_MARGIN_MIN = 30` ist die halbe feinste Rasterweite: erst wenn die Station
  // mehr als eine halbe Stunde näher an der gefragten Zeit liegt, ist der Cube-Wert
  // erkennbar für eine andere Stunde gemeint.
  //
  // ⚠ Was diese Regel NICHT abwägt: MOSMIX ist an der Station bias-korrigiert und gilt
  // AM Ort, der Cube in einer Modellzelle mit eigener Modellhöhe. Ob das die 39 Ebenen
  // aufwiegt, ist eine Produktfrage und keine, die aus den Daten folgt — sie steht als
  // E-D-2 offen. Bis dahin verliert niemand etwas: beide werden berichtet.
  const RASTER_MARGIN_MIN = 30;
  const off = (x: Candidate | null) => Math.abs(x?.offsetMin ?? 0);
  let primary: Candidate | null = null;
  let alternative: Candidate | null = null;
  if (cube && stationC) {
    if (off(cube) - off(stationC) > RASTER_MARGIN_MIN) {
      primary = stationC;
      alternative = cube;
      stationC.reason += ` Primär, weil ${cube.product} diese Zeit nur mit ${Math.round(off(cube))} min `
        + `Abstand trägt, die Station mit ${Math.round(off(stationC))} min.`;
    } else {
      primary = cube;
      alternative = stationC;
      stationC.reason += ` Nicht primär: ${cube.product} liegt mit ${Math.round(off(cube))} min gegen `
        + `${Math.round(off(stationC))} min nicht erkennbar weiter von der gefragten Zeit weg und führt `
        + '39 Ebenen mehr (σ, Quantile, Profil).';
    }
  } else if (stationC) {
    primary = stationC;
    alternative = null;
    stationC.reason += ' Primär: keine Cube-Stufe trägt diese Gültigzeit.';
  } else if (cube) {
    primary = cube;
    alternative = null;
    if (off(cube) > RASTER_MARGIN_MIN) {
      cube.reason += ` ⚠ Nächster Rasterschritt liegt ${Math.round(off(cube))} min daneben, und es gibt `
        + 'keine stündliche Alternative am Punkt.';
    }
  }

  const nowcastWin = usable.find((x) => x.product === 'nowcast') ?? null;
  const uncertainty = cube;

  return { atMs: c.atMs, primary, alternative, precip: nowcastWin ?? primary, uncertainty, candidates };
}

function mk(
  product: ProductId, detail: string, available: boolean, reason: string,
  offsetMin: number | null, ageH: number | null, distanceKm: number | null,
  quantities: number, hasUncertainty: boolean,
): Candidate {
  return { product, detail, available, reason, offsetMin, ageH, distanceKm, quantities, hasUncertainty };
}

/** Aufeinanderfolgende gleiche Entscheidungen zu Abschnitten zusammenfassen. */
function toSegments(decisions: readonly Decision[], stepH: number): PlanSegment[] {
  const out: PlanSegment[] = [];
  for (const d of decisions) {
    const key = `${d.primary?.product ?? '-'}|${d.alternative?.product ?? '-'}|${d.precip?.product ?? '-'}`;
    const last = out[out.length - 1];
    const lastKey = last ? `${last.primary ?? '-'}|${last.alternative ?? '-'}|${last.precip ?? '-'}` : null;
    if (last && lastKey === key) {
      last.toMs = d.atMs;
      last.steps += 1;
      continue;
    }
    out.push({
      fromMs: d.atMs,
      toMs: d.atMs + stepH * H - 1,
      primary: d.primary?.product ?? null,
      alternative: d.alternative?.product ?? null,
      precip: d.precip?.product ?? null,
      uncertainty: d.uncertainty?.product ?? null,
      detail: d.primary?.detail ?? (d.precip?.detail ?? '—'),
      reason: d.primary?.reason ?? 'Kein Produkt trägt diese Gültigzeit.',
      steps: 1,
    });
  }
  return out;
}

function gapsOf(decisions: readonly Decision[], stepH: number): Array<{ fromMs: number; toMs: number; why: string }> {
  const out: Array<{ fromMs: number; toMs: number; why: string }> = [];
  for (const d of decisions) {
    if (d.primary || d.precip) continue;
    const last = out[out.length - 1];
    if (last && d.atMs - last.toMs <= stepH * H) { last.toMs = d.atMs; continue; }
    out.push({
      fromMs: d.atMs,
      toMs: d.atMs,
      why: d.candidates.filter((x) => !x.available).map((x) => `${x.product}: ${x.reason}`).join(' · '),
    });
  }
  return out;
}

export { tierOf };
