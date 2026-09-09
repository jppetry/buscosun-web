/**
 * dwdRegular.mjs — Zugriffsfamilie 1: DWD-Modelle im **regulären lat-lon-GRIB**
 * (`audit/punktdaten-versorgung.md` §14.2).
 *
 * ICON-D2 und ICON-EU. Beide liegen auf opendata.dwd.de als reguläres Gitter vor
 * (GDT 0), beide werden vom bestehenden `decodeGrib2` direkt gelesen — es braucht
 * **keine CDO-Gewichte**, anders als PAP 2 O1 vermutet. Gemessen am Verzeichnis
 * `icon-d2/grib/09/t/` (2026-09-09): 6 500 von 7 532 Dateien sind
 * `regular-lat-lon_model-level`, also selbst die Modelllevel.
 *
 * Der einzige Unterschied zwischen den beiden Modellen ist der Dateiname und die
 * Schreibweise der Parameter (D2 klein, EU groß). Deshalb EIN Adapter mit zwei
 * Konfigurationen statt zwei Skripten.
 */

import {
  fetchGribField, headOk, probeHorizon, pad3, runIdBack, sampleRegularToTier, convert,
  KELVIN_TO_C, PA_TO_HPA,
} from './shared.mjs';

const DWD = process.env.DWD_OPENDATA || 'https://opendata.dwd.de/weather/nwp';

/**
 * Modellkonfiguration. `params` bildet Cube-Größe → nativer Feldname ab; was hier
 * fehlt, führt die Quelle nicht und bleibt `MISSING` — nie 0.
 */
const MODELS = {
  icon_d2: {
    base: `${DWD}/icon-d2/grib`,
    file: (run, step, p) =>
      `icon-d2_germany_regular-lat-lon_single-level_${run}_${pad3(step)}_2d_${p}.grib2.bz2`,
    invariant: (run, p) => `icon-d2_germany_regular-lat-lon_time-invariant_${run}_000_0_${p}.grib2.bz2`,
    dir: (p) => p.toLowerCase(),
    runSlotH: 3,
    // ICON-D2 gibt die Feldnamen klein aus.
    params: {
      t2m: 't_2m', td2m: 'td_2m', u10: 'u_10m', v10: 'v_10m', gust: 'vmax_10m',
      precip: 'tot_prec', clct: 'clct', clcl: 'clcl', clcm: 'clcm', clch: 'clch',
      ps: 'ps', snowlmt: 'snowlmt',
    },
    orographyParam: 'hsurf',
  },
  icon_eu: {
    base: `${DWD}/icon-eu/grib`,
    file: (run, step, p) =>
      `icon-eu_europe_regular-lat-lon_single-level_${run}_${pad3(step)}_${p}.grib2.bz2`,
    invariant: (run, p) => `icon-eu_europe_regular-lat-lon_time-invariant_${run}_${p}.grib2.bz2`,
    dir: (p) => p.toLowerCase(),
    runSlotH: 3,
    // ICON-EU gibt sie GROSS aus — derselbe Parameter, anderer Dateiname.
    params: {
      t2m: 'T_2M', td2m: 'TD_2M', u10: 'U_10M', v10: 'V_10M', gust: 'VMAX_10M',
      precip: 'TOT_PREC', clct: 'CLCT', clcl: 'CLCL', clcm: 'CLCM', clch: 'CLCH',
      ps: 'PS', snowlmt: 'SNOWLMT',
    },
    orographyParam: 'HSURF',
  },
};

/** Einheiten je Cube-Größe. Deklariert, nicht am Wertebereich erraten. */
const UNITS = {
  t2m: KELVIN_TO_C, td2m: KELVIN_TO_C, ps: PA_TO_HPA,
};

/** Größen, die als SUMME seit Laufbeginn kommen — der Orchestrator deakkumuliert. */
export const DWD_ACCUMULATED = new Set(['precip']);

export function makeDwdRegularAdapter(id) {
  const m = MODELS[id];
  if (!m) throw new Error(`dwdRegular: unbekanntes Modell ${id}`);

  const url = (run, step, p) => `${m.base}/${run.slice(8, 10)}/${m.dir(p)}/${m.file(run, step, p)}`;
  const invUrl = (run, p) => `${m.base}/${run.slice(8, 10)}/${m.dir(p)}/${m.invariant(run, p)}`;

  return {
    id,
    family: 'dwd-regular',
    accumulated: DWD_ACCUMULATED,
    vars: Object.keys(m.params),

    /** Jüngster Lauf, der `leadMax` schon trägt — geprüft am echten Objekt, nicht am Kalender. */
    async discoverRun(leadMax, nowMs = Date.now()) {
      for (let back = 0; back < 16; back++) {
        const run = runIdBack(nowMs, m.runSlotH, back);
        if (await headOk(url(run, leadMax, m.params.t2m))) return run;
      }
      return null;
    },

    /**
     * Welche Vorhersagestunden der Stufe diese Quelle liefern kann. Statt aus einer
     * Tabelle geraten (die Quellenmatrix nennt Vorhersage*längen*, keine Schrittfolgen,
     * §21 (7)) wird am Objekt geprüft — einmal je Stufe, nicht je Feld.
     */
    async leadsFor(run, tier) {
      return probeHorizon(tier.leadHours, (h) => headOk(url(run, h, m.params.t2m)));
    },

    async field(run, leadH, varId, tier) {
      const p = m.params[varId];
      if (!p) return null;
      const f = await fetchGribField(url(run, leadH, p));
      if (!f) return null;
      return convert(sampleRegularToTier(f, tier), UNITS[varId]);
    },

    async orography(run, tier) {
      const f = await fetchGribField(invUrl(run, m.orographyParam));
      return f ? sampleRegularToTier(f, tier) : null;
    },
  };
}
