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
  fetchSampledField, headOk, probeHorizon, pad3, runIdBack,
  KELVIN_TO_C, PA_TO_HPA,
} from './shared.mjs';
import { profileGrid, fullLevelHeights, PROFILE_PARAMS } from '../profile.mjs';

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
    // ── Modelllevel (PD-B5) ───────────────────────────────────────────────
    // Am Verzeichnis gemessen (2026-09-10, Lauf 2026091009): `t` liegt auf
    // **65 Vollflächen** als `regular-lat-lon_model-level`, `hhl` auf **66
    // Halbflächen** — und zwar in BEIDEN Gitterformen, also auch regulär.
    // Level 65 = unterste Schicht, Level 1 = Modelloberkante.
    profile: {
      levelVar: 't',
      halfVar: 'hhl',
      bottomLevel: 65,
      // 20 statt der in E-11 vorgeschlagenen 15 — die Zahl ist gemessen, nicht
      // gesetzt. Die Level folgen dem Gelände (Abstand 20 m am Boden, ~150 m in
      // 2,5 km); 15 Level enden bei 1 030–1 135 m über Grund und schneiden damit
      // Absinkinversionen ab, 20 reichen bis 1 630–1 790 m und decken beide
      // Inversionstypen. Gemessen an hhl in Hamburg, München, Innsbruck, Zermatt.
      levelCount: Number(process.env.POINT_PROFILE_LEVELS || 20),
      file: (run, step, lev) =>
        `icon-d2_germany_regular-lat-lon_model-level_${run}_${pad3(step)}_${lev}_t.grib2.bz2`,
      halfFile: (run, lev) =>
        `icon-d2_germany_regular-lat-lon_time-invariant_${run}_000_${lev}_hhl.grib2.bz2`,
    },
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
    // ICON-EU bekommt in PD-B5 KEINE Profilfelder, und das ist eine Entscheidung,
    // keine Lücke: es führt 74 statt 65 Level, also eine andere Levelzahl für
    // dieselbe Schichttiefe und ein eigenes Volumen. Ob Stufe 2 Profilfelder
    // trägt, wird gemessen, nicht angenommen (§40.6).
    profile: null,
  },
};

/** Einheiten je Cube-Größe. Deklariert, nicht am Wertebereich erraten. */
const UNITS = {
  t2m: KELVIN_TO_C, td2m: KELVIN_TO_C, ps: PA_TO_HPA,
};

/** Größen, die als SUMME seit Laufbeginn kommen — der Orchestrator deakkumuliert. */
export const DWD_ACCUMULATED = new Set(['precip']);

/** Halbflächenhöhen je (Lauf, Stufe, Levelzahl) — zeitinvariant, also einmal geholt. */
const halfCache = new Map();

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
    async discoverRun(leadMax, nowMs = Date.now(), maxBack = 16) {
      for (let back = 0; back < maxBack; back++) {
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
      // PD-F2d: Dekodieren + Abtasten im Worker-Pool; zurück kommt das Stufengitter (194 KB),
      // nicht das volle Feld (bis 3,6 MB). Einheit wandert mit — `convert` läuft im Worker.
      const r = await fetchSampledField(url(run, leadH, p), tier, { unit: UNITS[varId] ?? null });
      return r ? r.grid : null;
    },

    async orography(run, tier) {
      const r = await fetchSampledField(invUrl(run, m.orographyParam), tier);
      return r ? r.grid : null;
    },

    /** Trägt diese Quelle überhaupt Profilfelder? Der Orchestrator fragt das, bevor
     *  er eine Stunde lang Level zieht. */
    hasProfile: !!m.profile,

    /** Wie viele Vollflächen das Profil benutzt — fürs Manifest, nicht für die Rechnung. */
    profileLevels: m.profile ? Math.max(3, m.profile.levelCount) : null,

    /**
     * Die vier Profilfelder für eine Vorhersagestunde (PD-B5).
     *
     * Die Halbflächenhöhen sind **zeitinvariant** — sie werden einmal je (Lauf, Stufe)
     * geholt und gehalten. Der teure Teil ist die Temperatur: `levelCount` Dateien à
     * ~0,95 MiB je Stunde.
     *
     * Fehlt auch nur EIN Level, gibt es kein Profil — `null` statt eines Profils aus
     * Löchern. Ein aus 12 statt 20 Leveln bestimmtes Γ sähe an keiner Stelle falsch
     * aus und wäre es doch.
     */
    async profile(run, leadH, tier) {
      const cfg = m.profile;
      if (!cfg) return null;
      const cells = tier.ny * tier.nx;
      const nl = Math.max(3, cfg.levelCount);
      const top = cfg.bottomLevel - nl + 1;               // z. B. 65 − 20 + 1 = 46

      // Halbflächen: von unten (bottom+1) nach oben (top) ⇒ Höhe aufsteigend.
      const hKey = `${run}|${tier.id}|${nl}`;
      // PD-F2a: das PROMISE cachen — unter Nebenläufigkeit holten sonst zwei Aufrufer die
      // 21 HHL-Felder doppelt (je 906 k Punkte), bevor der erste `set` kam.
      if (!halfCache.has(hKey)) {
        const p = (async () => {
          // PD-F2e: alle Halbflächen gleichzeitig holen, Ergebnisse PER INDEX in Levelordnung
          // (unten → oben) — jedes Level ist unabhängig, die Reihenfolge trägt die Rechnung.
          const levs = [];
          for (let lev = cfg.bottomLevel + 1; lev >= top; lev--) levs.push(lev);
          const rs = await Promise.all(levs.map((lev) => fetchSampledField(
            `${m.base}/${run.slice(8, 10)}/${cfg.halfVar}/${cfg.halfFile(run, lev)}`, tier)));
          return rs.length === nl + 1 && rs.every(Boolean) ? fullLevelHeights(rs.map((r) => r.grid), cells) : null;
        })();
        halfCache.set(hKey, p);
        p.catch(() => halfCache.delete(hKey));
      }
      const heights = await halfCache.get(hKey);
      if (!heights) return null;

      // Temperatur auf denselben Vollflächen, gleiche Reihenfolge (unten → oben) — PD-F2e: die
      // 20 Level gleichzeitig, per Index eingesammelt. Fehlt EIN Level, gibt es kein Profil.
      // Kelvin → °C an derselben Stelle wie bei t2m: die Ableitung ist gegen einen Versatz
      // unempfindlich, dTInv auch — aber ein Cube in gemischten Einheiten wäre eine Falle für
      // jeden späteren Leser.
      const levs = [];
      for (let lev = cfg.bottomLevel; lev >= top; lev--) levs.push(lev);
      const rs = await Promise.all(levs.map((lev) => fetchSampledField(
        `${m.base}/${run.slice(8, 10)}/${cfg.levelVar}/${cfg.file(run, leadH, lev)}`, tier, { unit: KELVIN_TO_C })));
      if (rs.some((r) => !r)) return null;
      return profileGrid(rs.map((r) => r.grid), heights, cells, PROFILE_PARAMS);
    },
  };
}
