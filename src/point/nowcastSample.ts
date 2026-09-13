/**
 * nowcastSample.ts — der Kern der Nowcast-Punktabfrage, EINMAL für beide Umgebungen.
 *
 * Es gibt zwei Leser: `scripts/point/nowcastReader.mjs` liest aus einem lokalen Klon
 * (`readdirSync`, `readFileSync`), `src/point/client/nowcastPoint.ts` über das Netz.
 * Der TEURE Teil ist bei beiden derselbe — Domänenprüfung, `vMax`-Wächter, Abtastung,
 * Byte → mm/h. Wäre er zweimal geschrieben, hätte diese Linie denselben Fehler wie
 * `repackManifest.mjs` gegen `repackSource.ts`: zwei Fassungen, die auseinanderlaufen,
 * ohne dass es jemandem auffällt.
 *
 * Was hier NICHT steht: woher die Bytes kommen. Das ist der einzige echte Unterschied
 * zwischen den beiden Umgebungen, und er bleibt beim Aufrufer.
 */

import { DE1200_CORNERS } from '../sources/radolanGeo';
import { sampleRadarPoint } from '../pointForecast/radarSample';
import { SOURCE_BY_ID, coversPoint } from './sourceMatrix';
import {
  NOWCAST_BY_ID, NOWCAST_VMAX, type NowcastSourceId, type NowcastSourceSpec, nowcastFromU8,
} from './nowcastFormat';

/** Ein dekodiertes Graustufen-PNG, wie `scripts/lib/png.mjs` es liefert. */
export interface DecodedGrayPng {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
}

/** Was in der `meta.json` eines Slots steht (vom Spiegel geschrieben). */
export interface NowcastSlotMeta {
  stamp: string;
  vMax: number;
  width: number;
  height: number;
  corners?: unknown;
  runAtMs?: number;
  validAtMs?: number | null;
  fetchedAtMs?: number;
  frames?: Array<{ file: string; lead?: number; validAtMs?: number }>;
}

export interface NowcastSample {
  /** mm/h; `null` bei Sättigung (s. `saturated`). */
  mmh: number | null;
  saturated: boolean;
  /** Gültigzeit, aus Slot-Zeit + `lead` gerechnet (s. V-PD-56 weiter unten). */
  validAtMs: number | null;
  /**
   * Die `meta.json` nennt für diesen Frame eine ANDERE Gültigzeit als Slot + `lead`.
   * Kein Fehler dieses Lesers — der Spiegel schreibt für RV in jedem Frame die
   * Laufzeit. Wird berichtet, nicht stillschweigend geheilt.
   */
  validAtSuspect: boolean;
  lead: number;
  stamp: string;
  sourceId: NowcastSourceId;
}

/**
 * Die vier Eckpunkte des Gitters als `[lon, lat]`.
 *
 * Für INCA und RZC stehen sie in der `meta.json` — sie ändern sich nicht, aber sie AUS
 * DEN DATEN zu nehmen ist der Unterschied zwischen einer geprüften und einer geglaubten
 * Geometrie. DE1200 hat ein festes Gitter; dort ist die Konstante die Quelle.
 */
export function nowcastCorners(spec: NowcastSourceSpec, meta: NowcastSlotMeta): unknown {
  if (spec.cornersFrom === 'de1200') return DE1200_CORNERS;
  if (!Array.isArray(meta?.corners) || meta.corners.length !== 4) {
    throw new Error(`nowcast: ${spec.id} — meta.json ohne brauchbare corners`);
  }
  return meta.corners;
}

/**
 * Einen bereits geholten Frame an einem Punkt abtasten.
 *
 * `null` heißt: der Punkt liegt außerhalb der Abdeckung dieser Quelle oder außerhalb
 * ihres Gitters. Das ist ausdrücklich NICHT dasselbe wie `mmh === 0`.
 */
export function sampleNowcastFrame(
  sourceId: NowcastSourceId,
  meta: NowcastSlotMeta,
  png: DecodedGrayPng,
  lat: number,
  lon: number,
  frame: { file: string; lead?: number; validAtMs?: number },
): NowcastSample | null {
  const spec = NOWCAST_BY_ID[sourceId];
  if (!spec) throw new Error(`nowcast: unbekannte Quelle ${sourceId}`);

  // ⚠ Der Drift-Wächter, den auch der Client fährt (`src/sources/radarImg.ts`): weicht das
  // `vMax` des Slots von der erwarteten Skala ab, sind ALLE Werte darin anders gemeint.
  // Lieber laut abbrechen als eine ganze Kachel um den Faktor 5 danebenliegen.
  if (meta.vMax !== NOWCAST_VMAX) {
    throw new Error(`nowcast: ${sourceId}/${meta.stamp} hat vMax ${meta.vMax}, erwartet ${NOWCAST_VMAX}`);
  }

  // ⚠ Die Domäne wird HIER angewandt, nicht beim Aufrufer — Kur für einen gemessenen
  // Fehler (PD-B3): `decodeRadolanRaw` setzt außerhalb der Radarabdeckung NaN, und
  // `precipToU8` bildet NaN auf 0 ab. „keine Abdeckung" und „kein Regen" werden dasselbe
  // Byte. Am echten Slot belegt: Linz und Wien lieferten 0,0000 mm/h, wo die rohe Datei
  // NaN sagt — eine erfundene Trockenheit.
  const src = SOURCE_BY_ID[sourceId];
  if (src && !coversPoint(src, lat, lon)) return null;

  if (png.channels !== 1) {
    throw new Error(`nowcast: ${frame.file} hat ${png.channels} Kanäle, erwartet 1`);
  }

  // `sampleRadarPoint` mit vMax = 255 liefert das ROHE Byte zurück. Die Umkehrung in
  // mm/h macht `nowcastFromU8` — an EINER Stelle, mit der Sättigungsregel. Sonst käme
  // aus 255 eine 20, und die wäre eine Erfindung.
  const raw = sampleRadarPoint(
    spec.grid,
    png.data as Uint8Array,
    png.width,
    png.height,
    nowcastCorners(spec, meta) as never,
    lat,
    lon,
    255,
  );
  if (raw == null) return null;

  const { mmh, saturated } = nowcastFromU8(Math.round(raw));
  const lead = frame.lead ?? 0;

  // ⚠ **V-PD-56, am veröffentlichten Slot gemessen (2026-09-13):** im RV-Slot tragen
  // ALLE 25 Frames dieselbe `validAtMs` — auch `f120.png`. Die Zahl ist der
  // Kopfzeitstempel der RADOLAN-Datei, also die LAUFZEIT; die Vorhersagestunde steht
  // daneben in `leadMinutes` (`decodeRadolanRaw` → `decodeRvTar`, `validAt` aus dem
  // Datumsfeld). Der Name verspricht die Gültigzeit, der Wert liefert die Laufzeit.
  //
  // Ein Leser, der `frame.validAtMs` glaubt, legt den Frame für „in zwei Stunden" auf
  // JETZT — und findet dann für „in zwei Stunden" keinen Wert, ohne dass irgendwo ein
  // Fehler auftaucht. Genau das ist beim ersten Lauf dieser CLI passiert.
  //
  // Deshalb: `runAtMs + lead` hat Vorrang, wo es beides gibt. `validAtSuspect` macht den
  // Widerspruch sichtbar, statt ihn wegzurechnen — den Spiegel zu ändern ist eine
  // Entscheidung der Radar-Linie, nicht dieses Lesers.
  const slotMs = meta.runAtMs ?? stampMs(meta.stamp);
  const fromLead = slotMs != null ? slotMs + lead * 60_000 : null;
  const validAtMs = fromLead ?? frame.validAtMs ?? meta.validAtMs ?? null;
  const validAtSuspect = fromLead != null && frame.validAtMs != null && frame.validAtMs !== fromLead;
  return { mmh, saturated, validAtMs, validAtSuspect, lead, stamp: meta.stamp, sourceId };
}

/** Slot-Zeit aus dem Verzeichnisnamen — beide Stempelformen sind eindeutig parsbar. */
export function stampMs(stamp: string): number | null {
  const iso = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})$/.exec(stamp);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5]);
  const dwd = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(stamp);
  if (dwd) return Date.UTC(2000 + +dwd[1], +dwd[2] - 1, +dwd[3], +dwd[4], +dwd[5]);
  return null;
}
