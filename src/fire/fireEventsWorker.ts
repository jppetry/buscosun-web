/**
 * Web-Worker: Ereignisbildung + Ortsfest-Zuordnung für die Waldbrand-Hotspots
 * (V-222, Jans Freigabe 2026-08-15, Muster `sources/gribGridWorker.ts`).
 *
 * Läuft off-main: die gemessenen ~170 ms Clustering + ~31 ms Zuordnung am
 * 7-Tage-Fenster (6 700 Detektionen) blockieren den Hauptthread nicht mehr.
 * Nur DOM-freie Importe (`fireEvents.ts` → `firmsHotspots.ts` reine Helfer).
 */
/// <reference lib="webworker" />

import { buildFireEvents, staticDetectionKeys } from './fireEvents';
import { buildFireZones } from './fireZones';
import { buildFireClusters } from './fireClusters';
import type { FirmsRow } from './sources/firmsHotspots';

interface Req {
  id: number; rows: FirmsRow[]; nowMs: number; kind?: 'classify' | 'zones' | 'clusters';
  /** BC1: Verknüpfungsradius der Cluster-Liste. */
  radiusM?: number;
  /** BC1: die ortsfest eingestuften Detektionen (`kind: 'clusters'`). */
  staticKeys?: string[];
}

const post = (m: unknown) => (self as unknown as { postMessage: (x: unknown) => void }).postMessage(m);

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, rows, nowMs, kind, radiusM, staticKeys } = e.data;
  try {
    // BC1: die Liste NACH der Einordnung — erst jetzt ist bekannt, welche
    // Detektionen als ortsfest gelten (V-222: bis dahin behauptet nichts etwas).
    // Ein zweiter Lauf statt eines Nachtrags am Ergebnis: die Zuordnung
    // Detektion → Cluster liegt nur hier vor, und sie zweimal zu führen wäre
    // ein zweiter Zustand, der stimmen müsste.
    if (kind === 'clusters') {
      post({ id, ok: true, clusters: buildFireClusters(rows, radiusM, new Set(staticKeys ?? [])) });
      return;
    }
    // BA3: das Detektionsraster kostet am 24-h-Lauf gemessen 167 ms im
    // Hauptthread (2 987 Detektionen, davon 73 ms in einer einzigen Zone).
    // Auf einem Mobilgerät wäre das ein Long Task jenseits der 200-ms-Grenze,
    // deshalb dieselbe Auslagerung wie bei der Klassifikation (V-222).
    //
    // BC1: die Brand-Cluster fahren in DERSELBEN Nachricht. Sie haben dieselbe
    // Eingabe (die angezeigten Zeilen) und denselben Lebenszyklus wie das
    // Raster; ein eigener Aufruf wäre eine zweite Strukturkopie der ~1 MB
    // Zeilen über die Worker-Grenze, ohne einen einzigen Vorteil.
    if (kind === 'zones') {
      post({
        id, ok: true,
        zones: buildFireZones(rows),
        clusters: buildFireClusters(rows, radiusM),
      });
      return;
    }
    const events = buildFireEvents(rows, nowMs);
    post({ id, ok: true, events, staticKeys: [...staticDetectionKeys(events, rows)] });
  } catch (err) {
    post({ id, ok: false, error: String(err) });
  }
};
