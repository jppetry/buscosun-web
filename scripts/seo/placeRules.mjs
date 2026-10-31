/**
 * Schwellen der Ortsseiten — eine Quelle für Erzeuger (`placeContent.mjs`, `fetch-place-modules.mjs`) und
 * die Erklärung auf /methodik/ortsseiten/, damit Text und Regel nicht auseinanderlaufen.
 */
/** Vergleiche mit Nachbarorten (nur wenn die Höhe den Unterschied erklärt). */
export const COMPARE = { maxKm: 25, minHeightDiffM: 150, minTempDiffK: 1.0, minPrecipRel: 0.10, minFrostDays: 15 };
/** Modul-Bezüge. */
export const MODULES = { seaKm: 20, gaugeKm: 20, roadKm: 10, stationKm: 15, glacierKm: 30, glacierMinKm2: 0.5, glacierMax: 5 };
/** Geländeprofil. */
export const TERRAIN = { radiusKm: 10, lakeMaxKm: 8, flatReliefM: 100, valleyRank: 0.2, crestRank: 0.8 };
