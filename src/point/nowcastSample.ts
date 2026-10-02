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
import { sampleRadarIndex, sampleRadarPoint } from '../pointForecast/radarSample';
import { SOURCE_BY_ID, coversPoint } from './sourceMatrix';
import {
  NOWCAST_BY_ID, NOWCAST_VMAX, type NowcastSourceId, type NowcastSourceSpec, nowcastFromU8, nowcastHourMeanFromSum,
} from './nowcastFormat';

/** Ein dekodiertes Graustufen-PNG, wie `scripts/lib/png.mjs` es liefert. */
export interface DecodedGrayPng {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
}

/**
 * E-AX-16: ein dekodiertes RGB-/RGBA-PNG (das Summenbild des Stundenmittels). Node liefert 3 Kanäle (`png.mjs`),
 * der Browser über den Canvas immer 4 (`decodeRgbaPngBrowser`, dort ohne `channels`-Feld ⇒ 4).
 */
export interface DecodedRgbPng {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels?: number;
}

/** E-AX-16: ein Stundenmittel-Eintrag der `meta.json` (`RvImgHourMean` in `sources/radarImg.ts`). */
export interface NowcastSlotHourMean {
  lead: number;
  file: string;
  frames: number;
  bytes?: number;
  leadFrom?: number;
  leadTo?: number;
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
  /** E-AX-16: nur RV-Slots seit 02.10.2026 — fehlt sonst. */
  hourMeans?: NowcastSlotHourMean[];
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
  /**
   * E-AX-16: dieses Sample ist das vorgemittelte Stundenmittel des Spiegels (`m<lead>.png`), kein Einzelframe —
   * `mmh` ist das Mittel der `frames` Frames in (validAtMs − 60 min, validAtMs], `saturated` heißt „mindestens
   * ein Frame gesättigt". Der Motor nimmt es mit `nowcastHourMean` direkt; ohne die Option ignoriert er es.
   */
  hourMean?: { frames: number };
}

/**
 * E-AX-16: das Stundenmittel eines Slots an einem Punkt lesen — aus dem RGB-Summenbild statt aus zwölf Frames.
 *
 * Dieselbe Zelle wie `sampleNowcastFrame` (Nächster-Nachbar, `sampleRadarIndex`), dieselben Wächter (Domäne, `vMax`),
 * dieselbe Arithmetik wie der Motor über die Einzelframes (`nowcastHourMeanFromSum`). `null` = außerhalb der Abdeckung
 * oder des Gitters. `mmh` ist hier nie `null`: ein gesättigter Frame zählt mit NOWCAST_SATURATION und setzt `saturated`.
 */
export function sampleNowcastHourMean(
  sourceId: NowcastSourceId,
  meta: NowcastSlotMeta,
  png: DecodedRgbPng,
  lat: number,
  lon: number,
  hm: NowcastSlotHourMean,
): NowcastSample | null {
  const spec = NOWCAST_BY_ID[sourceId];
  if (!spec) throw new Error(`nowcast: unbekannte Quelle ${sourceId}`);
  if (meta.vMax !== NOWCAST_VMAX) {
    throw new Error(`nowcast: ${sourceId}/${meta.stamp} hat vMax ${meta.vMax}, erwartet ${NOWCAST_VMAX}`);
  }
  const src = SOURCE_BY_ID[sourceId];
  if (src && !coversPoint(src, lat, lon)) return null;
  const ch = png.channels ?? 4;
  if (ch !== 3 && ch !== 4) throw new Error(`nowcast: ${hm.file} hat ${ch} Kanäle, erwartet 3 oder 4`);
  if (png.width !== meta.width || png.height !== meta.height) {
    throw new Error(`nowcast: ${hm.file} misst ${png.width}×${png.height}, der Slot ${meta.width}×${meta.height}`);
  }
  if (!Number.isInteger(hm.frames) || hm.frames < 1) throw new Error(`nowcast: ${hm.file} nennt ${hm.frames} Frames`);
  const idx = sampleRadarIndex(spec.grid, png.width, png.height, nowcastCorners(spec, meta) as never, lat, lon);
  if (idx == null) return null;
  const o = idx * ch;
  const { mmh, saturated } = nowcastHourMeanFromSum(png.data[o] * 256 + png.data[o + 1], png.data[o + 2], hm.frames);
  const slotMs = meta.runAtMs ?? stampMs(meta.stamp);
  if (slotMs == null) throw new Error(`nowcast: ${sourceId}/${meta.stamp} ohne Slotzeit`);
  return { mmh, saturated, validAtMs: slotMs + hm.lead * 60_000, validAtSuspect: false, lead: hm.lead, stamp: meta.stamp, sourceId, hourMean: { frames: hm.frames } };
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
