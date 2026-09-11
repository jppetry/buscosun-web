/**
 * dwdIcosahedral.mjs — Zugriffsfamilie 2: DWD-Modelle auf dem **ikosaedrischen**
 * ICON-Gitter (`audit/punktdaten-versorgung.md` §14.2).
 *
 * ICON global und AICON. Beide liegen NUR unstrukturiert vor (GDT 101, 2 949 120
 * Zellen, `nj = 1`); die Zellkoordinaten kommen aus den zeitinvarianten Feldern
 * `CLAT`/`CLON`. Der erweiterte `decodeGrib2` liest das seit Phase 4.9, und der
 * Nachbarindex wird hier einmal je Stufe gebaut und dann für alle Felder und
 * Schritte wiederverwendet — ein Scan über 2,9 Millionen Zellen je Feld wäre
 * genau die Sorte Aufwand, die eine Pipeline unbrauchbar macht.
 *
 * ── AICON teilt sich das Gitter mit ICON global ────────────────────────────
 * AICON veröffentlicht **keine eigenen** `clat`/`clon`. Der Bestandsadapter
 * (`src/sources/aiconSource.ts`) leiht sich den Index von ICON global und hat das
 * als gitter-identisch verifiziert; dasselbe geschieht hier. Das ist eine
 * ANNAHME aus dem Bestand, keine eigene Messung — sie steht deshalb im Manifest.
 *
 * ── Was AICON NICHT hat ────────────────────────────────────────────────────
 * Am Verzeichnis gemessen (2026-09-09): `P PMSL PS QV RELHUM_2M T TOT_PREC T_2M
 * U U_10M V V_10M`. Also **keine** Bewölkung, **kein** Taupunkt, **keine** Böe,
 * **keine** Schneefallgrenze. Diese Größen bleiben aus dieser Quelle `MISSING`.
 */

import {
  fetchGribField, headOk, probeHorizon, pad3, runIdBack, buildUnstructuredIndex,
  sampleUnstructuredToTier, convert, KELVIN_TO_C, PA_TO_HPA,
} from './shared.mjs';

const DWD = process.env.DWD_OPENDATA || 'https://opendata.dwd.de/weather/nwp';

const MODELS = {
  icon_global: {
    base: `${DWD}/icon/grib`,
    file: (run, step, p) => `icon_global_icosahedral_single-level_${run}_${pad3(step)}_${p}.grib2.bz2`,
    invariant: (run, p) => `icon_global_icosahedral_time-invariant_${run}_${p}.grib2.bz2`,
    runSlotH: 6,
    params: {
      t2m: 'T_2M', td2m: 'TD_2M', u10: 'U_10M', v10: 'V_10M', gust: 'VMAX_10M',
      precip: 'TOT_PREC', clct: 'CLCT', clcl: 'CLCL', clcm: 'CLCM', clch: 'CLCH', ps: 'PS',
      // snowlmt fuehrt ICON global nicht — am Verzeichnis geprueft.
    },
    orographyParam: 'HSURF',
    ownGrid: true,
  },
  aicon: {
    // AICON hat ein voellig anderes Pfadschema: /p/<PARAM>/r/<ISO-Lauf>/s/<Schritt>
    base: `${DWD}/v1/m/aicon/p`,
    runSlotH: 6,
    params: {
      t2m: 'T_2M', u10: 'U_10M', v10: 'V_10M', precip: 'TOT_PREC', ps: 'PS',
    },
    orographyParam: null,
    ownGrid: false,           // leiht sich clat/clon von ICON global
    isoRun: true,
    raw: true,                // rohes GRIB2, KEIN bz2
  },
};

const UNITS = { t2m: KELVIN_TO_C, td2m: KELVIN_TO_C, ps: PA_TO_HPA };
export const ICO_ACCUMULATED = new Set(['precip']);

/** ICON-global-Zellkoordinaten, einmal je Prozess. */
let cellCoords = null;
async function iconGlobalCells(run) {
  if (cellCoords) return cellCoords;
  const base = MODELS.icon_global.base;
  const u = (p) => `${base}/${run.slice(8, 10)}/${p.toLowerCase()}/${MODELS.icon_global.invariant(run, p)}`;
  const lat = await fetchGribField(u('CLAT'));
  const lon = await fetchGribField(u('CLON'));
  if (!lat || !lon) return null;
  cellCoords = { lat: lat.values, lon: lon.values };
  return cellCoords;
}

/** AICON adressiert den Lauf als ISO-Zeit mit kodiertem Doppelpunkt. */
function aiconRunPath(run) {
  return `${run.slice(0, 4)}-${run.slice(4, 6)}-${run.slice(6, 8)}T${run.slice(8, 10)}%3A00`;
}

export function makeDwdIcosahedralAdapter(id) {
  const m = MODELS[id];
  if (!m) throw new Error(`dwdIcosahedral: unbekanntes Modell ${id}`);

  // AICON benennt den Schritt als ISO-8601-Dauer mit DREI Stellen und Minuten:
  // `PT003H00M.grib2`, nicht `PT3H.grib2`. Am Verzeichnis abgelesen (2026-09-09,
  // 62 Dateien = 3-stuendlich bis 183 h) — geraten haette es 404 gegeben, und der
  // Adapter haette die Quelle als „nicht vorhanden" gemeldet statt als falsch adressiert.
  const url = (run, step, p) => (m.isoRun
    ? `${m.base}/${p}/r/${aiconRunPath(run)}/s/PT${pad3(step)}H00M.grib2`
    : `${m.base}/${run.slice(8, 10)}/${p.toLowerCase()}/${m.file(run, step, p)}`);

  /** Nachbarindex je Stufe — einmal gebaut, dann wiederverwendet. */
  const idxCache = new Map();
  async function indexFor(run, tier) {
    if (idxCache.has(tier.id)) return idxCache.get(tier.id);
    const cells = await iconGlobalCells(m.ownGrid ? run : await siblingRun(run));
    const idx = cells ? buildUnstructuredIndex(cells.lat, cells.lon, tier) : null;
    idxCache.set(tier.id, idx);
    return idx;
  }
  /** Fuer AICON: ein ICON-global-Lauf, dessen clat/clon abrufbar ist. */
  async function siblingRun(run) {
    for (let back = 0; back < 8; back++) {
      const r = runIdBack(Date.parse(`${run.slice(0, 4)}-${run.slice(4, 6)}-${run.slice(6, 8)}T${run.slice(8, 10)}:00:00Z`), 6, back);
      const g = MODELS.icon_global;
      if (await headOk(`${g.base}/${r.slice(8, 10)}/clat/${g.invariant(r, 'CLAT')}`)) return r;
    }
    return run;
  }

  return {
    id,
    family: 'dwd-icosahedral',
    accumulated: ICO_ACCUMULATED,
    vars: Object.keys(m.params),

    async discoverRun(leadMax, nowMs = Date.now(), maxBack = 12) {
      for (let back = 0; back < maxBack; back++) {
        const run = runIdBack(nowMs, m.runSlotH, back);
        if (await headOk(url(run, leadMax, m.params.t2m))) return run;
      }
      return null;
    },

    async leadsFor(run, tier) {
      return probeHorizon(tier.leadHours, (h) => headOk(url(run, h, m.params.t2m)));
    },

    async field(run, leadH, varId, tier) {
      const p = m.params[varId];
      if (!p) return null;
      const idx = await indexFor(run, tier);
      if (!idx) return null;
      const f = await fetchGribField(url(run, leadH, p), { bz2: !m.raw });
      if (!f) return null;
      return convert(sampleUnstructuredToTier(f.values, idx, tier), UNITS[varId]);
    },

    async orography(run, tier) {
      if (!m.orographyParam) return null;
      const idx = await indexFor(run, tier);
      if (!idx) return null;
      const u = `${m.base}/${run.slice(8, 10)}/${m.orographyParam.toLowerCase()}/${m.invariant(run, m.orographyParam)}`;
      const f = await fetchGribField(u);
      return f ? sampleUnstructuredToTier(f.values, idx, tier) : null;
    },
  };
}
