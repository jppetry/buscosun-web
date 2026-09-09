/**
 * ecmwf.mjs — Zugriffsfamilie 3: **ECMWF Open Data** über `.index` + Byte-Bereiche
 * (`audit/punktdaten-versorgung.md` §14.1).
 *
 * IFS HRES, IFS ENS, AIFS Single, AIFS ENS — vier Modelle, EINE Mechanik. ECMWF legt
 * je Schritt eine GRIB2-Datei **plus** ein `.index`-Sidecar (JSON-Zeilen mit
 * `_offset`/`_length` je Feld). Damit wird aus einem 300-MB-Download ein
 * HTTP-Range über ~650 KB je Parameter.
 *
 * Das ist nicht Optimierung, sondern Voraussetzung: `QUELLENMATRIX.md` R-7 hält fest,
 * dass volle Dateien 60 GB/Tag wären — „eine Messsonde, die ihre eigene Quelle
 * drosselt, misst nichts" (BW-13).
 *
 * ── Die Feldnamen sind GEMESSEN, nicht geraten ─────────────────────────────
 * Am echten `.index` des 00z-Laufs vom 2026-09-08 ausgelesen (Oberflächenfelder):
 *   100u 100v 10fg 10u 10v 2d 2t asn ewss lsm mn2t3 msl mucape mx2t3 nsss ptype
 *   ro rsn sd sf sithick skt sp ssr ssrd str strd sve svn tcc tcw tcwv tp tprate ttr zos
 * Daraus folgt unmittelbar, was ECMWF für den Cube NICHT hat: **keine** Schichtwolken
 * (`lcc`/`mcc`/`hcc` fehlen) und **keine** Schneefallgrenze. Beides bleibt `MISSING`.
 * Die Lehre aus SH3/V-BW-51 gilt: das Vokabular kommt aus der Quelle, nicht aus der Skizze.
 */

import { fetchBytes, headOk, probeHorizon, pad2, runIdBack, sampleRegularToTier, convert,
  KELVIN_TO_C, PA_TO_HPA, FRACTION_TO_PCT, M_TO_MM } from './shared.mjs';
import { decodeGrib2 } from '../../../src/sources/gribDecode.ts';

const ECMWF = process.env.ECMWF_BASE || 'https://data.ecmwf.int/forecasts';

const MODELS = {
  ifs_hres:    { path: 'ifs/0p25/oper',        suffix: 'oper-fc',  runSlotH: 6 },
  ifs_ens:     { path: 'ifs/0p25/enfo',        suffix: 'enfo-ef',  runSlotH: 6, ensemble: true },
  aifs_single: { path: 'aifs-single/0p25/oper', suffix: 'oper-fc', runSlotH: 6 },
  // AIFS-ENS legt KEINE gebuendelte `enfo-ef` ab, sondern `enfo-cf` (Kontrolllauf)
  // und `enfo-pf` (gestoerte Member) getrennt. Am Verzeichnis abgelesen (2026-09-08);
  // mit `enfo-ef` fand die Lauf-Suche gar nichts und meldete „Quelle nicht verfuegbar".
  aifs_ens:    { path: 'aifs-ens/0p25/enfo',    suffix: 'enfo-cf', runSlotH: 6, ensemble: true },
};

/** Cube-Größe → ECMWF-Kürzel. Was fehlt, führt ECMWF nicht (s. Kopf). */
const PARAMS = {
  t2m: '2t', td2m: '2d', u10: '10u', v10: '10v', gust: '10fg',
  precip: 'tp', clct: 'tcc', ps: 'sp',
};
/**
 * Einheiten, die für ALLE ECMWF-Produkte gleich sind (am Objekt geprüft: `2t` und `sp`
 * tragen bei IFS und AIFS dieselbe Parameter-Identität, disc 0/cat 0/num 0 bzw. 0/3/0).
 */
const UNITS = { t2m: KELVIN_TO_C, td2m: KELVIN_TO_C, ps: PA_TO_HPA };

/**
 * ── Die Einheit kommt aus dem GRIB, nicht aus dem Modellnamen ──────────────
 *
 * Gemessen am 2026-09-09 (Lauf 06z, Schritt 132 h) an denselben Feldern beider Produkte:
 *
 *   Feld   IFS oper                        AIFS oper
 *   tcc    cat 6 / num 192, Werte 0…1      cat 6 / num **1**,  Werte 0…**100**
 *   tp     cat 1 / num 193, Werte 0…0,697  cat 1 / num **52**, Werte 0…**295**
 *   2t     cat 0 / num 0 — gleich          cat 0 / num 0 — gleich
 *   sp     cat 3 / num 0 — gleich          cat 3 / num 0 — gleich
 *
 * IFS benutzt die ECMWF-LOKALEN Nummern (192/193) mit Bruchteil und Metern, AIFS die
 * WMO-Nummern (1/52) mit Prozent und Millimetern. Eine Tabelle „Modell → Faktor" wäre
 * hier die falsche Antwort: sie ist raterei über ein Produkt, während die Antwort im
 * Datenstrom steht — und sie bricht still, sobald ECMWF ein Produkt umstellt.
 *
 * Wie still: ohne diese Unterscheidung stand für Wien eine Bewölkung von **3 597 %**
 * und ein Niederschlag von **21 976 mm** im Cube. Beides wäre nicht als Ausreißer
 * aufgefallen, sondern hätte `f_rad = (1 − clct/100)^a` in PAP 5 dauerhaft auf 0
 * gezogen — also sämtliche Geländeterme abgeschaltet, ohne eine einzige Fehlermeldung.
 */
function scaleFromGrib(varId, f) {
  const cat = f.parameterCategory, num = f.parameterNumber;
  if (varId === 'clct') {
    if (cat === 6 && num === 192) return FRACTION_TO_PCT;   // ECMWF-lokal: 0…1
    if (cat === 6 && num === 1) return null;                // WMO: bereits Prozent
    throw new Error(`ecmwf: unbekannte Wolken-Identität cat=${cat} num=${num}`);
  }
  if (varId === 'precip') {
    if (cat === 1 && num === 193) return M_TO_MM;           // ECMWF-lokal: Meter
    if (cat === 1 && (num === 52 || num === 8)) return null; // WMO: bereits mm (kg/m²)
    throw new Error(`ecmwf: unbekannte Niederschlags-Identität cat=${cat} num=${num}`);
  }
  return UNITS[varId] ?? null;
}

export const ECMWF_ACCUMULATED = new Set(['precip']);

export function makeEcmwfAdapter(id) {
  const m = MODELS[id];
  if (!m) throw new Error(`ecmwf: unbekanntes Modell ${id}`);

  const stem = (run, step) => {
    const date = run.slice(0, 8), hh = run.slice(8, 10);
    return `${ECMWF}/${date}/${hh}z/${m.path}/${date}${hh}0000-${step}h-${m.suffix}`;
  };

  /** `.index` je (Lauf, Schritt) — klein, und einmal geholt reicht für alle Größen. */
  const idxCache = new Map();
  async function index(run, step) {
    const key = `${run}#${step}`;
    if (idxCache.has(key)) return idxCache.get(key);
    const raw = await fetchBytes(`${stem(run, step)}.index`);
    if (!raw) { idxCache.set(key, null); return null; }
    const byParam = new Map();
    for (const line of new TextDecoder().decode(raw).split('\n')) {
      const s = line.trim();
      if (!s) continue;
      let e;
      try { e = JSON.parse(s); } catch { continue; }
      if (e.levtype !== 'sfc') continue;
      // Beim Ensemble tragen alle Member denselben Parameter; PD-A nimmt den
      // Kontrolllauf (`number` fehlt oder 0). Das Member-Mittel ist eine eigene
      // Etappe — es kostet 51 Bereiche je Feld und Schritt.
      if (e.number != null && Number(e.number) !== 0) continue;
      if (!byParam.has(e.param)) byParam.set(e.param, e);
    }
    idxCache.set(key, byParam);
    return byParam;
  }

  return {
    id,
    family: 'ecmwf-index',
    accumulated: ECMWF_ACCUMULATED,
    vars: Object.keys(PARAMS),
    ensembleControlOnly: !!m.ensemble,

    async discoverRun(leadMax, nowMs = Date.now()) {
      for (let back = 0; back < 8; back++) {
        const run = runIdBack(nowMs, m.runSlotH, back);
        if (await headOk(`${stem(run, leadMax)}.index`)) return run;
      }
      return null;
    },

    async leadsFor(run, tier) {
      return probeHorizon(tier.leadHours, (h) => headOk(`${stem(run, h)}.index`));
    },

    async field(run, leadH, varId, tier) {
      const p = PARAMS[varId];
      if (!p) return null;
      const idx = await index(run, leadH);
      const e = idx?.get(p);
      if (!e) return null;
      const raw = await fetchBytes(`${stem(run, leadH)}.grib2`, {
        range: `${e._offset}-${e._offset + e._length - 1}`,
      });
      if (!raw) return null;
      const f = decodeGrib2(raw);
      return convert(sampleRegularToTier(f, tier), scaleFromGrib(varId, f));
    },

    /** ECMWF Open Data liefert keine Modellorographie in den Oberflächenfeldern. */
    async orography() { return null; },
  };
}

export const ECMWF_MODEL_IDS = Object.keys(MODELS);
export const ECMWF_SURFACE_PARAMS = PARAMS;
export { pad2 };
