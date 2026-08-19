/**
 * Layer-Typen der 2D-Wetterkarte — herausgelöst aus `MapView.tsx` (Phase WB1).
 *
 * WARUM DIESE DATEI EXISTIERT: `MapView.tsx` ist auf 5.724 Zeilen gewachsen und
 * gilt als Sperrzone (`CLAUDE.md`). Der Typ `LayerKey` wurde trotzdem von fünf
 * Stellen aus ihr importiert — `App.tsx`, `mapState.ts`, `event/EventResult.tsx`,
 * `components/LayerInfoPanel.tsx`, `components/LayerIcon.tsx`. Wer eine dieser
 * Komponenten wiederverwenden will, musste damit konzeptionell an der größten
 * Datei des Repos hängen.
 *
 * WAS DIESE DATEI NICHT IST: eine Bundle-Optimierung. Alle fünf Importe waren
 * `import type` und wurden bei `isolatedModules: true` ohnehin restlos gelöscht,
 * bevor der Bundler sie sah — `eagerJs` lag vor und nach der Verschiebung bei
 * 123,1 KB gzip (`audit/waldbrand-geruest.md` §2, gemessen). Die frühere
 * Begründung in V-190 („zieht die 316-KB-Datei in den Chunk") war falsch; die
 * Verschiebung bleibt richtig, aber aus Gründen der Entkopplung, nicht der Größe.
 *
 * `MapView.tsx` re-exportiert `LayerKey` unverändert weiter, damit kein
 * bestehender Importpfad bricht.
 */

/**
 * Die 19 umschaltbaren Layer der 2D-Wetterkarte.
 *
 * ⚠️ Reihenfolge und Schreibweise sind **Bestand**: `mapState.ts` leitet daraus
 * die Permalink-Bitmaske ab und `LayerInfoPanel.tsx` eine `Record`-Tabelle, die
 * ohne Vollständigkeit nicht kompiliert. Werte werden angehängt, nie umsortiert.
 *
 * ⚠️ Dies ist **nicht** der Typ der Waldbrand-Ansicht. Die führt ihre eigene
 * Union `FireLayerId` in `src/fire/fireModel.ts` — bewusst getrennt, damit die
 * beiden Kartenansichten nicht aneinander koppeln (`architecture.md` §14.5).
 */
export type LayerKey =
  | 'wind' | 'gust' | 'nowcast' | 'temp' | 'clouds' | 'sat' | 'lightning' | 'lightningfc'
  | 'stations' | 'confidence' | 'snowline' | 'flownowcast' | 'poprob' | 'thunder' | 'snow'
  | 'rotation' | 'cells' | 'hail' | 'warnings';

/**
 * Alle `LayerKey`s als Laufzeit-Liste.
 *
 * Es gibt sie, weil `mapState.ts:24` (`LAYER_ORDER`) heute nur **12 von 19**
 * Keys führt und die übrigen sieben — `lightningfc`, `thunder`, `snow`,
 * `rotation`, `cells`, `hail`, `warnings` — dadurch **nicht permalink-fähig**
 * sind: `layersToBits` verwirft unbekannte Keys stillschweigend (V-191). Diese
 * Liste macht die Lücke messbar, statt sie im Typsystem unsichtbar zu lassen.
 *
 * Sie ändert **nichts** am Verhalten von `mapState.ts` — die Bitmaske bleibt
 * bit-stabil, sonst würden bestehende Links ungültig. Die Behebung ist eine
 * eigene Phase; hier wird sie nur belegbar gemacht.
 */
export const ALL_LAYER_KEYS: readonly LayerKey[] = [
  'wind', 'gust', 'nowcast', 'temp', 'clouds', 'sat', 'lightning', 'lightningfc',
  'stations', 'confidence', 'snowline', 'flownowcast', 'poprob', 'thunder', 'snow',
  'rotation', 'cells', 'hail', 'warnings',
] as const;
