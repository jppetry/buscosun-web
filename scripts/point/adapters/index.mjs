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
 *   3 ECMWF `.index`         IFS HRES, AIFS Single (Mittel);     **umgesetzt**
 *                            IFS-ENS-Member (σ_ens, PD-B10)       **umgesetzt**
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
import { makeEcmwfEnsembleAdapter } from './ecmwfEns.mjs';
import { makeGeosphereAdapter } from './geosphere.mjs';
import { makeMeteoSwissAdapter } from './meteoswiss.mjs';
import { makeDwdEpsAdapter } from './dwdEps.mjs';
import { SOURCE_BY_ID } from '../../../src/point/sourceMatrix.ts';
import { withSource } from './shared.mjs';

/** Quell-ID → Fabrik. Genau die IDs aus `sourceMatrix.ts`, nichts Erfundenes. */
const FACTORIES = {
  icon_d2: () => makeDwdRegularAdapter('icon_d2'),
  icon_eu: () => makeDwdRegularAdapter('icon_eu'),
  icon_global: () => makeDwdIcosahedralAdapter('icon_global'),
  aicon: () => makeDwdIcosahedralAdapter('aicon'),
  ifs_hres: () => makeEcmwfAdapter('ifs_hres'),
  // PD-B10: IFS-ENS liefert Member (σ_ens), nicht den Kontrolllauf — den gibt es in
  // `enfo-ef` gar nicht (§34.5). Eigener Adapter, weil die Mechanik eine andere ist:
  // mehrere Byte-Bereiche in EINER Anfrage (multipart/byteranges).
  ifs_ens: () => makeEcmwfEnsembleAdapter('ifs_ens'),
  aifs_single: () => makeEcmwfAdapter('aifs_single'),
  aifs_ens: () => makeEcmwfAdapter('aifs_ens'),
  claef: () => makeGeosphereAdapter('claef'),
  claef_eps: () => makeGeosphereAdapter('claef_eps'),
  icon_d2_eps: () => makeDwdEpsAdapter('icon_d2_eps'),
  icon_eu_eps: () => makeDwdEpsAdapter('icon_eu_eps'),
  icon_eps_global: () => makeDwdEpsAdapter('icon_eps_global'),
  icon_ch1_eps: () => makeMeteoSwissAdapter('icon_ch1_eps'),
  icon_ch2_eps: () => makeMeteoSwissAdapter('icon_ch2_eps'),
};

/** Quellen, für die es noch keinen Ingest gibt — mit dem GRUND, nicht nur der Lücke. */
export const PENDING = Object.freeze({
  // PD-B9: nicht mehr offen, sondern bewusst KEIN Gitter-Adapter. MOSMIX ist auf
  // Stationen bias-korrigiert; eine Interpolation auf 0,05° wirft genau das weg.
  // Ausgeliefert als eigenes Produkt: scripts/point/build-stations.mjs → point/stations/.
  mosmix_l: 'Stationsquelle — ausgeliefert als eigenes Produkt point/stations/ (PD-B9, §44), NICHT als Gitterquelle.',
  mosmix_s: 'Stationsquelle wie MOSMIX-L, aber stündlich und alle Stationen in EINER KMZ — passt aus demselben Grund nicht ohne Entscheidung in ein Gitter (§21 (9)).',
  kenda_ch1: 'ANALYSE, keine Vorhersage (STAC ch.meteoschweiz.ogd-analysis-kenda-ch1). Gehört zu Stunde 0 wie das Radar, nicht in ein Vorhersageband.',
  radvor_rv: 'liegt als UNVERAENDERTES tar.bz2 unter radar/rv und als Werte-PNG unter radar/img/v1/rv. Seit PD-B3 gibt es den Leser (scripts/point/nowcastReader.mjs); er gehoert NICHT in den Cube, weil dessen Achse am Modelllauf haengt (§36.4).',
  inca: 'liegt unter radar/img/v1/inca, Leser seit PD-B3. Traegt Ostoesterreich allein (⚠¹). Nicht im Cube — s. radvor_rv.',
  combiprecip: 'liegt unter radar/img/v1/rzc, Leser seit PD-B3. Nicht im Cube — s. radvor_rv.',
  gfs: 'Rückfall, nicht in §1 als tragende Quelle geführt.',
});

const cache = new Map();

/**
 * Jede Methode des Adapters läuft im Quellkontext (`withSource`), damit `shared.mjs`
 * Netzvolumen, Drosselungen und Fehlerinjektion JE QUELLE zuordnen kann — ohne dass
 * eine der Aufrufstellen im Producer ihre Signatur ändert (PD-C2). Datenfelder
 * (`vars`, `members`, `accumulated`, …) gehen unverändert durch.
 */
function withSourceContext(id, adapter) {
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== 'function') return v;
      return (...args) => withSource(id, () => v.apply(target, args));
    },
  });
}

/** Adapter zu einer Quell-ID. `null`, wenn die Quelle noch keinen Ingest hat. */
export function adapterFor(id) {
  if (!FACTORIES[id]) return null;
  if (!cache.has(id)) cache.set(id, withSourceContext(id, FACTORIES[id]()));
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
