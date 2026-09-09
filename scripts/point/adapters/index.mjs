/**
 * index.mjs — die Adapter-Registry des Punkt-Cubes
 * (`audit/punktdaten-versorgung.md` §14, Etappen PD3–PD5).
 *
 * Eine Quelle aus `QUELLENMATRIX.md` §1 ist hier **ein Tabelleneintrag**. Was sie
 * kann, steht in ihrem Adapter; wo sie gilt, steht in `src/point/sourceMatrix.ts`;
 * welche Stufe sie trägt, in `src/point/cubeFormat.ts`. Drei Orte, drei Fragen —
 * und keine vierte Liste, die driften könnte.
 *
 * ── Stand der sechs Zugriffsfamilien ───────────────────────────────────────
 *
 *   1 DWD reguläres GRIB     ICON-D2, ICON-EU                    **umgesetzt**
 *   2 DWD ikosaedrisch       ICON global, AICON                  **umgesetzt**
 *   3 ECMWF `.index`         IFS HRES/ENS, AIFS Single/ENS       **umgesetzt** (Kontrolllauf)
 *   4 Stationsquelle         MOSMIX-L                            offen — anderes Datenmodell
 *   5 Fremd-API              C-LAEF (GeoSphere), ICON-CH (STAC)  offen
 *   6 bereits gespiegelt     RADVOR RV, INCA, CombiPrecip        offen — aus `radar/` statt neu
 *
 * Die vier offenen sind KEINE Lücke im Bauplan, sondern eigene Etappen mit eigenen
 * Fragen: MOSMIX ist eine Punktquelle an Stationen und passt nicht ohne Weiteres in
 * ein Gitter; C-LAEF liefert nur Perzentile (⚠³); ICON-CH kostet 23 MB je Variable
 * und Schritt für das gebündelte Ensemble; und die Radar-Quellen liegen bereits im
 * Daten-Repo — sie brauchen einen Leser, keinen Ingest.
 */

import { makeDwdRegularAdapter } from './dwdRegular.mjs';
import { makeDwdIcosahedralAdapter } from './dwdIcosahedral.mjs';
import { makeEcmwfAdapter } from './ecmwf.mjs';
import { SOURCE_BY_ID } from '../../../src/point/sourceMatrix.ts';

/** Quell-ID → Fabrik. Genau die IDs aus `sourceMatrix.ts`, nichts Erfundenes. */
const FACTORIES = {
  icon_d2: () => makeDwdRegularAdapter('icon_d2'),
  icon_eu: () => makeDwdRegularAdapter('icon_eu'),
  icon_global: () => makeDwdIcosahedralAdapter('icon_global'),
  aicon: () => makeDwdIcosahedralAdapter('aicon'),
  ifs_hres: () => makeEcmwfAdapter('ifs_hres'),
  ifs_ens: () => makeEcmwfAdapter('ifs_ens'),
  aifs_single: () => makeEcmwfAdapter('aifs_single'),
  aifs_ens: () => makeEcmwfAdapter('aifs_ens'),
};

/** Quellen, für die es noch keinen Ingest gibt — mit dem GRUND, nicht nur der Lücke. */
export const PENDING = Object.freeze({
  mosmix_l: 'Stationsquelle (KMZ je Station). Passt nicht ohne Entscheidung in ein Gitter — s. §21 (9).',
  claef: 'GeoSphere /grid/forecast/nwp-v2-1h-1km — deterministischer Lauf, am Katalog geprüft. Fremd-API statt GRIB, eigener Baustein.',
  claef_eps: 'GeoSphere /grid/forecast/ensemble-v2-1h-1km — liefert nur P10/P50/P90 (⚠³). Eine Spannweite ist kein Spread: sie taugt für Bänder, nicht für σ_ens.',
  mosmix_s: 'Stationsquelle wie MOSMIX-L, aber stündlich und alle Stationen in EINER KMZ — passt aus demselben Grund nicht ohne Entscheidung in ein Gitter (§21 (9)).',
  kenda_ch1: 'ANALYSE, keine Vorhersage (STAC ch.meteoschweiz.ogd-analysis-kenda-ch1). Gehört zu Stunde 0 wie das Radar, nicht in ein Vorhersageband.',
  icon_ch1_eps: 'STAC → CSCS. Gebündeltes perturbed-File ~23 MB je (Variable, Schritt).',
  icon_ch2_eps: 'STAC → CSCS wie ICON-CH1, 21 Member statt 11 — dieselbe Mechanik, dieselbe Datenmenge.',
  icon_d2_eps: 'ikosaedrisch, 20 Member — die Mechanik steht, die Datenmenge ist eine eigene Entscheidung.',
  icon_eu_eps: 'wie ICON-D2-EPS, 40 Member.',
  icon_eps_global: 'wie ICON-D2-EPS, 40 Member.',
  radvor_rv: 'liegt bereits als Spiegel unter radar/rv — braucht einen Leser, keinen Ingest.',
  inca: 'liegt bereits unter radar/img/v1/inca.',
  combiprecip: 'liegt bereits unter radar/img/v1/rzc.',
  gfs: 'Rückfall, nicht in §1 als tragende Quelle geführt.',
});

const cache = new Map();

/** Adapter zu einer Quell-ID. `null`, wenn die Quelle noch keinen Ingest hat. */
export function adapterFor(id) {
  if (!FACTORIES[id]) return null;
  if (!cache.has(id)) cache.set(id, FACTORIES[id]());
  return cache.get(id);
}

export const INGESTABLE = Object.freeze(Object.keys(FACTORIES));

/**
 * Die Quellen, die eine Stufe tatsächlich füllen können: in der Stufe genannt,
 * mit Adapter, und in `sourceMatrix` vorhanden. Alles andere wird BENANNT
 * übersprungen — eine still übergangene Quelle ist ein Loch, das niemand sieht.
 */
export function ingestableFor(tier) {
  const usable = [];
  const diversity = [];
  const skipped = [];
  const take = (id, into) => {
    if (!SOURCE_BY_ID[id]) { skipped.push([id, 'nicht in sourceMatrix']); return; }
    if (!FACTORIES[id]) { skipped.push([id, PENDING[id] ?? 'kein Adapter']); return; }
    into.push(id);
  };
  for (const id of tier.sources) take(id, usable);
  // Zweite Meinung nur fuer die Streuung — eine Quelle, die schon zugeordnet ist,
  // wird nicht doppelt gezaehlt (sonst schrumpfte σ_div genau wie bei den
  // Ensemble-Kontrolllaeufen, V-PD-9).
  for (const id of tier.diversity ?? []) if (!usable.includes(id)) take(id, diversity);
  return { usable, diversity, skipped };
}
