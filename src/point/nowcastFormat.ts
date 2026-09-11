/**
 * nowcastFormat.ts — die Form der Nowcast-Zeile (0–3 h) der Punktlinie.
 *
 * `QUELLENMATRIX.md` §1 führt für 0–3 h drei Beobachtungsquellen: **RADVOR RV** (DE),
 * **INCA** (AT) und **CombiPrecip/RZC** (CH). Alle drei liegen längst im Daten-Repo —
 * der Radar-Spiegel schreibt sie seit RD3 nach `radar/`. Was fehlte, war **kein Ingest,
 * sondern ein Leser**: es stand nirgends geschrieben, wie man aus diesen Dateien einen
 * Punktwert gewinnt.
 *
 * ── Warum der Nowcast NICHT in den Cube gebacken wird ──────────────────────
 * Die Cube-Achse hängt am **Modelllauf**: `leadH = 0` ist die Laufzeit, nicht „jetzt".
 * Der Punkt-Job läuft um `:50`, und der jüngste vollständige ICON-D2-Lauf ist dann
 * gemessen 3,4–3,8 h alt. Ein RV-Frame mit +120 min deckt damit die Cube-Stunden **≈ 4
 * bis 6**, nicht 0–3. Ein Produkt, das viermal täglich erscheint, kann ein Produkt, das
 * sich alle fünf Minuten erneuert, nicht tragen — es lieferte eine Beobachtung aus, die
 * beim Lesen schon Stunden alt wäre.
 *
 * Die Nowcast-Zeile bleibt deshalb **eine eigene Linie neben dem Cube**, die zur
 * ABFRAGEZEIT gelesen wird. Dieses Modul sagt, wo sie liegt und wie sie zu lesen ist;
 * `point/index.json` verweist darauf, damit ein Client es nicht erraten muss.
 *
 * ── Die Kodierung: verlustfrei umkehrbar, aber oben abgeschnitten ──────────
 * Der Spiegel legt Werte-PNGs ab, **keine Farbbilder**: jedes Byte ist der Wert, den
 * `precipToU8` (`src/scalar/RainLayer.ts`) aus mm/h gerechnet hat. Die Umkehrung ist
 * exakt — mit drei Eigenheiten, die man kennen muss:
 *
 *   1. **Totzone:** alles unter 0,06 mm/h wird 0. Ein 0-Byte heißt „kein messbarer
 *      Niederschlag", nicht „kein Wert" — das unterscheidet es von `MISSING`.
 *   2. **Sättigung:** 255 heißt **„≥ 19,96 mm/h"**, ein offener Randbin. Es ist KEINE
 *      Messung von 20 mm/h. Wer ihn als 20 ausliefert, macht aus einem Starkregen von
 *      60 mm/h eine plausible, falsche Zahl — genau der Fehler, den die Quantisierung
 *      des Cubes ausdrücklich vermeidet („ein Wert außerhalb des Bereichs wird MISSING,
 *      sichtbar statt getarnt").
 *   3. ⚠ **Byte 0 ist zweideutig — und das ist die gefährlichste Eigenschaft dieser
 *      Kodierung.** `decodeRadolanRaw` setzt außerhalb der Radarabdeckung `NaN`, und
 *      `precipToU8` bildet `NaN` auf **0** ab (`!(NaN >= 0.06)`). Im PNG sind „kein
 *      Niederschlag" und „keine Abdeckung" damit **dasselbe Byte**.
 *
 *      Am echten Slot gemessen (2026-09-09, RV `2609091740`): Linz und Wien liefern aus
 *      dem rohen `tar.bz2` `NaN`, aus dem PNG aber **0,0000 mm/h**. Das DE1200-Gitter ist
 *      weit größer als das, was die Radare sehen — für Ostösterreich entstünde so eine
 *      **erfundene Trockenheit**, mitten in ⚠¹ („Nicht abgedeckt: Linz, Graz, Klagenfurt,
 *      Villach, Wien").
 *
 *      Kur: der Leser wendet die Domäne aus `sourceMatrix.ts` an (`domain ∩ clip`), bevor
 *      er ein Byte anfasst. Innerhalb des `clip` bleibt eine Restunschärfe — auch dort
 *      kann eine einzelne Zelle in einer Radarlücke liegen und als 0 erscheinen. Wer
 *      diese Unterscheidung braucht, muss für DE den verlustfreien Weg nehmen; für AT
 *      und CH gibt es sie heute nicht.
 *
 * ⚠ **`vMax` darf NICHT erhöht werden.** `src/sources/radarImg.ts` führt es als
 * Drift-Wächter: weicht das `vMax` eines Slots von `PRECIP_VMAX` ab, lehnt der Client
 * den Slot ab. Eine Erhöhung von 20 auf 100 würde also **jeden veröffentlichten Slot für
 * jeden Client ungültig machen** und das Regenradar dunkel schalten. Das ist keine
 * Formatfrage, sondern ein Produktausfall.
 *
 * Für Deutschland gibt es den Ausweg ohne Sättigung: `radar/rv/*.tar.bz2` liegt
 * **unverändert** im Spiegel, `decodeRadolanRaw` liest daraus `rainRate` als `Float32`.
 * Für AT und CH gibt es ihn heute nicht — dort gilt die Sättigungsregel unten.
 */

import { CUBE_DOMAIN } from './cubeFormat';
// PD-C4: Reichweite und Domäne je Quelle kommen aus der Registry — EINE Wahrheit.
// `sourceMatrix.ts` importiert nichts, also kein Zyklus.
import { SOURCE_BY_ID } from './sourceMatrix';

/** Obergrenze der Werteskala im Spiegel. Spiegelt `PRECIP_VMAX` — NICHT ändern (s. Kopf). */
export const NOWCAST_VMAX = 20;
/** Unter diesem Wert schreibt der Kodierer 0. */
export const NOWCAST_DEAD_ZONE = 0.06;
/** Abstand zweier benachbarter Bytes in mm/h. */
export const NOWCAST_STEP = NOWCAST_VMAX / 255;
/** Ab diesem Wert liefert der Kodierer 255 — alles darüber ist nicht mehr unterscheidbar. */
export const NOWCAST_SATURATION = NOWCAST_VMAX - NOWCAST_STEP / 2;

/** Wurzel der gespiegelten Bilder im Daten-Repo. */
export const NOWCAST_IMG_DIR = 'radar/img/v1';
/** Wurzel der unveränderten RV-Archive (verlustfrei, nur DE). */
export const NOWCAST_RV_RAW_DIR = 'radar/rv';

export type NowcastSourceId = 'radvor_rv' | 'inca' | 'combiprecip';

export interface NowcastSourceSpec {
  readonly id: NowcastSourceId;
  /** Verzeichnisname im Spiegel (`radar/img/v1/<dir>/<stamp>/`). */
  readonly dir: string;
  /** Gitter-Kennung für `sampleRadarPoint` — die Projektion hängt daran. */
  readonly grid: 'radolan_rv' | 'inca_grid' | 'meteoswiss_rzc';
  /** Woher die Eckpunkte kommen: aus der `meta.json` oder aus dem festen Gitter. */
  readonly cornersFrom: 'meta' | 'de1200';
  /** Nennweite des Takts in Minuten — gemessen, nicht aus der Matrix abgeschrieben. */
  readonly slotMinutes: number;
  /** Vorhalt im Spiegel: `KEEP = 12` Slots, s. `workflow-radar.yml`. */
  readonly keptSlots: number;
  /** Gibt es denselben Inhalt auch unquantisiert? */
  readonly lossless: string | null;
  readonly why: string;
}

/**
 * Die drei Quellen. **`domain` steht bewusst NICHT hier** — sie steht in
 * `sourceMatrix.ts` (mit `clip` und `edgeMarginKm`), und eine zweite Fassung wäre eine
 * zweite Wahrheit. Wer wissen will, ob eine Quelle einen Punkt trägt, fragt
 * `coversPoint()`; das gilt für den Cube und für den Nowcast gleichermaßen.
 */
export const NOWCAST_SOURCES: readonly NowcastSourceSpec[] = Object.freeze([
  Object.freeze({
    id: 'radvor_rv' as const, dir: 'rv', grid: 'radolan_rv' as const,
    cornersFrom: 'de1200' as const, slotMinutes: 5, keptSlots: 12,
    lossless: NOWCAST_RV_RAW_DIR,
    why: 'DE1200-Komposit, 25 Frames 0–120 min. Der Spiegel legt zusätzlich das UNVERÄNDERTE tar.bz2 ab — dort gibt es keine Sättigung.',
  }),
  Object.freeze({
    id: 'inca' as const, dir: 'inca', grid: 'inca_grid' as const,
    cornersFrom: 'meta' as const, slotMinutes: 15, keptSlots: 12,
    lossless: null,
    why: 'Trägt Ostösterreich ALLEIN — RADVOR RV endet dort östlich 14,1 °E (⚠¹). Nur als PNG gespiegelt, also mit Sättigung.',
  }),
  Object.freeze({
    id: 'combiprecip' as const, dir: 'rzc', grid: 'meteoswiss_rzc' as const,
    cornersFrom: 'meta' as const, slotMinutes: 5, keptSlots: 12,
    lossless: null,
    why: 'CombiPrecip (RZC), ein Frame je Slot (Analyse, keine Extrapolation). Nur als PNG gespiegelt.',
  }),
]);

export const NOWCAST_BY_ID: Readonly<Record<string, NowcastSourceSpec>> = Object.freeze(
  Object.fromEntries(NOWCAST_SOURCES.map((s) => [s.id, s])),
);

/** Ergebnis einer Punktabfrage — Wert UND die Auskunft, ob er am oberen Rand klebt. */
export interface NowcastPoint {
  /** mm/h. `null` = außerhalb des Gitters oder gesättigt (s. `saturated`). */
  readonly mmh: number | null;
  /**
   * Das Byte war 255, der wahre Wert liegt also **irgendwo über 19,96 mm/h**. Der
   * Aufrufer entscheidet: der Cube schreibt `MISSING` (eine erfundene 20 wäre schlimmer
   * als eine Lücke), eine Anzeige darf „> 20 mm/h" schreiben.
   */
  readonly saturated: boolean;
  /** Gültigzeit dieses Frames in ms seit Epoche. */
  readonly validAtMs: number;
}

/**
 * Byte → mm/h. Die Umkehrung von `precipToU8`, und die EINZIGE Stelle, die sie kennt.
 *
 * Das ist eine Kopie mit Wächter (wie `repackManifest.mjs` ↔ `repackSource.ts` bei BW-2):
 * `verify:point-data` vergleicht sie über alle 256 Bytes gegen das Original, damit ein
 * Auseinanderdriften auffällt und nicht still falsche Niederschläge erzeugt.
 */
export function nowcastFromU8(raw: number): { mmh: number | null; saturated: boolean } {
  if (raw === 0) return { mmh: 0, saturated: false };
  if (raw >= 255) return { mmh: null, saturated: true };
  return { mmh: (raw / 255) * NOWCAST_VMAX, saturated: false };
}

/** Pfad eines Frames im Spiegel, relativ zur Repo-Wurzel. DIE Regel — nirgends sonst bauen. */
export function nowcastFramePath(spec: NowcastSourceSpec, stamp: string, file: string): string {
  return `${NOWCAST_IMG_DIR}/${spec.dir}/${stamp}/${file}`;
}

/** Pfad der Slot-Beschreibung (Maße, Ecken, `vMax`, Frameliste). */
export function nowcastMetaPath(spec: NowcastSourceSpec, stamp: string): string {
  return `${NOWCAST_IMG_DIR}/${spec.dir}/${stamp}/meta.json`;
}

/** Was `point/index.json` über die Nowcast-Zeile sagt. */
export function nowcastManifest() {
  return {
    dir: NOWCAST_IMG_DIR,
    note: 'Beobachtungsnahe Quellen für 0–3 h. Liegt NEBEN dem Cube, nicht darin: die Cube-Achse hängt am Modelllauf, und der ist beim Bau 3,4–3,8 h alt — ein 5-Minuten-Produkt passt nicht in ein 6-Stunden-Raster. Zur Abfragezeit lesen.',
    encoding: {
      kind: 'u8-grayscale-png',
      vMax: NOWCAST_VMAX,
      step: NOWCAST_STEP,
      deadZone: NOWCAST_DEAD_ZONE,
      inverse: 'raw === 0 ? 0 : (raw / 255) * vMax',
      zeroMeans: 'ZWEIDEUTIG: „kein messbarer Niederschlag (< 0,06 mm/h)" ODER „keine Radarabdeckung". decodeRadolanRaw setzt ausserhalb der Abdeckung NaN, und precipToU8 bildet NaN auf 0 ab — beides wird dasselbe Byte. Am echten Slot belegt: Linz und Wien liefern roh NaN, im PNG 0,0000. Deshalb IMMER erst die Domaene pruefen (domain ∩ clip aus point/sources.json), sonst entsteht eine erfundene Trockenheit.',
      saturatedAt: NOWCAST_SATURATION,
      saturatedMeans: `raw === 255 heißt „≥ ${NOWCAST_SATURATION.toFixed(2)} mm/h", ein offener Randbin. NICHT als ${NOWCAST_VMAX} ausliefern — das machte aus 60 mm/h eine plausible falsche Zahl.`,
      vMaxWarning: 'vMax ist zugleich der Drift-Wächter des Clients (src/sources/radarImg.ts): ein abweichender Wert macht den Slot für jeden Leser ungültig. Nicht erhöhen.',
    },
    sources: NOWCAST_SOURCES.map((s) => ({
      id: s.id, dir: `${NOWCAST_IMG_DIR}/${s.dir}`, grid: s.grid,
      cornersFrom: s.cornersFrom, slotMinutes: s.slotMinutes, keptSlots: s.keptSlots,
      lossless: s.lossless, note: s.why,
      // PD-C4: wie weit die Quelle EXTRAPOLIERT — aus der Registry, nicht hier abgeschrieben.
      // RV 2 h (+120 min gemessen, §36), INCA 3 h, CombiPrecip 0 h: eine Analyse, kein Nowcast.
      // Jenseits davon gibt es für diesen Punkt aus dieser Quelle keinen Wert — der Client
      // fällt auf das Modell (Cube-Stunden 0–3) und SAGT es (`fallback` unten).
      extrapolationH: SOURCE_BY_ID[s.id]?.horizonH.default ?? 0,
      extrapolation: (SOURCE_BY_ID[s.id]?.horizonH.default ?? 0) > 0,
      // Alle drei liegen als u8-PNG im Spiegel: Byte 0 ist überall zweideutig, 255 gesättigt.
      ambiguousZero: true,
      saturatedAt: NOWCAST_SATURATION,
      coverageFrom: `point/sources.json#${s.id} (domain ∩ clip, edgeMarginKm) — hier steht keine zweite Fassung`,
    })),
    geometry: 'Welche Quelle einen Punkt trägt, entscheidet die Domäne aus point/sources.json (domain ∩ clip, edgeMarginKm) — geometrisch, nicht über das Land (QUELLENMATRIX §2). Für Ostösterreich trägt allein INCA.',
    // PD-C4: die Schweiz hat KEINE Extrapolation (E1 nur auf Anfrage, QUELLENMATRIX §5;
    // Ende 2026 kündigt MeteoSchweiz eine Einzelabfrage-API an — SCHEDULED_CHANGES).
    fallback: 'Jenseits `sources[].extrapolationH` trägt für 0–3 h das Modell: die Cube-Stunden 0–3 (ICON-D2 stündlich, ICON-CH1-EPS dreistündlich, C-LAEF). Ein Client, der dort einen Wert zeigt, nennt die Quelle — „Nowcast" wäre für die Schweiz jenseits der Analyse unwahr. Kein CH-Nowcast im Repo, weil E1 blockiert ist.',
    horizonH: Math.max(...NOWCAST_SOURCES.map((s) => SOURCE_BY_ID[s.id]?.horizonH.default ?? 0)),
    retention: `Der Spiegel hält ${NOWCAST_SOURCES[0].keptSlots} Slots je Quelle (RV/RZC ≈ 1 h, INCA ≈ 3 h) — er ist ein LIVE-Spiegel, kein Archiv. Die 24-Stunden-Regel des Cubes gilt hier nicht.`,
  };
}

// ---------------------------------------------------------------------------
// Selbsttest
// ---------------------------------------------------------------------------

export interface NowcastCheck { name: string; ok: boolean; detail?: string }

/** Netzfrei. Prüft die Form — die Deckung mit `precipToU8` prüft `verify:point-data`. */
export function nowcastFormatSelfTest(): { checks: NowcastCheck[]; passed: number; total: number } {
  const checks: NowcastCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  add('drei Quellen wie in der Matrix §1', NOWCAST_SOURCES.length === 3);
  add('IDs eindeutig', new Set(NOWCAST_SOURCES.map((s) => s.id)).size === 3);
  add('jede Quelle nennt ihr Gitter',
    NOWCAST_SOURCES.every((s) => ['radolan_rv', 'inca_grid', 'meteoswiss_rzc'].includes(s.grid)));

  // Die Umkehrung an ihren drei kritischen Stellen.
  add('Byte 0 ist NULL Niederschlag, nicht „kein Wert"',
    nowcastFromU8(0).mmh === 0 && !nowcastFromU8(0).saturated);
  add('Byte 255 ist gesättigt und liefert KEINE Zahl',
    nowcastFromU8(255).mmh === null && nowcastFromU8(255).saturated);
  add('Byte 128 liegt in der Mitte der Skala',
    Math.abs((nowcastFromU8(128).mmh ?? 0) - (128 / 255) * 20) < 1e-9,
    `${nowcastFromU8(128).mmh?.toFixed(3)} mm/h`);
  add('der Schritt ist 20/255',
    Math.abs(NOWCAST_STEP - 0.0784313725) < 1e-9, `${NOWCAST_STEP.toFixed(6)} mm/h`);
  // Monotonie über die ganze Skala — ein Vorzeichenfehler in der Umkehrung fiele sonst
  // erst an echten Daten auf, und dort sähe er aus wie Wetter.
  {
    let mono = true;
    for (let r = 1; r < 254; r++) {
      const a = nowcastFromU8(r).mmh ?? -1, b = nowcastFromU8(r + 1).mmh ?? -1;
      if (!(b > a)) mono = false;
    }
    add('die Umkehrung steigt streng monoton (1…254)', mono);
  }

  // Pfadregeln: eine falsch zusammengesetzte URL fällt sonst erst am 404 auf.
  const rv = NOWCAST_BY_ID.radvor_rv;
  add('Framepfad folgt der Spiegelstruktur',
    nowcastFramePath(rv, '2609091740', 'f000.png') === 'radar/img/v1/rv/2609091740/f000.png',
    nowcastFramePath(rv, '2609091740', 'f000.png'));
  add('Metapfad folgt der Spiegelstruktur',
    nowcastMetaPath(NOWCAST_BY_ID.inca, '20260909T1715') === 'radar/img/v1/inca/20260909T1715/meta.json');

  // Das Manifest muss die zwei Fallen NENNEN, sonst tappt ein Leser hinein.
  const m = nowcastManifest();
  add('das Manifest nennt die Sättigungsregel', m.encoding.saturatedMeans.includes('offener Randbin'));
  add('das Manifest warnt vor dem Erhöhen von vMax', m.encoding.vMaxWarning.includes('Drift-Wächter'));
  add('das Manifest nennt die Zweideutigkeit von Byte 0', m.encoding.zeroMeans.includes('ZWEIDEUTIG'));
  add('das Manifest verlangt die Domaenenpruefung vor dem Lesen',
    m.encoding.zeroMeans.includes('Domaene') || m.encoding.zeroMeans.includes('Domäne'));
  add('das Manifest nennt den verlustfreien Weg für DE',
    m.sources.find((s) => s.id === 'radvor_rv')?.lossless === NOWCAST_RV_RAW_DIR);
  add('das Manifest sagt, dass die Auswahl geometrisch ist', m.geometry.includes('geometrisch'));
  // PD-C4: Reichweite je Quelle aus der Registry — CombiPrecip ist eine ANALYSE (0 h).
  const ext = Object.fromEntries(m.sources.map((s) => [s.id, s.extrapolationH]));
  add('Reichweite je Quelle: RV 2 h, INCA 3 h, CombiPrecip 0 h (aus der Registry)',
    ext.radvor_rv === 2 && ext.inca === 3 && ext.combiprecip === 0, JSON.stringify(ext));
  add('CombiPrecip ist als Analyse ohne Extrapolation ausgewiesen',
    m.sources.find((s) => s.id === 'combiprecip')?.extrapolation === false);
  add('der Nowcast-Horizont ist das Maximum der Quellen (3 h)', m.horizonH === 3, `${m.horizonH} h`);
  add('das Manifest nennt den Rückfall auf das Modell und die fehlende CH-Extrapolation',
    m.fallback.includes('Cube-Stunden 0–3') && m.fallback.includes('Schweiz'));
  add('jede PNG-Quelle trägt die Zweideutigkeit von Byte 0 als Flag', m.sources.every((s) => s.ambiguousZero === true));

  // Die Domäne wird NICHT hier geführt — sonst gäbe es zwei Wahrheiten.
  add('keine zweite Domänen-Fassung in diesem Modul',
    !NOWCAST_SOURCES.some((s) => 'domain' in s || 'clip' in s));
  // Aber der Cube-Ausschnitt muss überhaupt Berührung haben, sonst wäre die Zeile leer.
  add('der Cube-Ausschnitt ist bekannt', Number.isFinite(CUBE_DOMAIN.latMin));

  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}
