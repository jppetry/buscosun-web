/**
 * ecmwfEns.mjs — IFS-ENS-Member als σ_ens-Quelle der Fernstufe
 * (PD-B10, `audit/punktdaten-versorgung.md` §45; schließt V-PD-27).
 *
 * Zugriffsfamilie 3 (ECMWF `.index` + Byte-Bereiche), aber mit einer Mechanik,
 * die es vorher nicht gab: **mehrere Bereiche in EINER Anfrage**.
 *
 * ── Warum überhaupt ─────────────────────────────────────────────────────────
 * PD-B8 hat σ_ens in die Fernstufe gebracht — aber ICON-EPS global endet bei
 * 180 h, das Band bei 336. Gemessen deckte σ_ens dort **2 von 9 Rasterstunden**,
 * beide im Bereich, der ohnehin σ_div aus vier Quellen hat. Jenseits 180 h gab
 * es keine Unsicherheitsinformation, und ein p10/p90 dort wäre erfunden gewesen.
 * Die einzigen Ensembles bis 336 h sind IFS-ENS und AIFS-ENS. Jans Entscheidung
 * vom 2026-09-11: ECMWF-Member für t2m + Niederschlag im 48-Stunden-Raster.
 *
 * ── Am echten Katalog gemessen (Lauf 2026091100, +240 h) ───────────────────
 *   • 50 gestörte Member (`type: pf`, `number` 1…50), KEIN Kontrolllauf in
 *     `enfo-ef` — einzeln adressierbar, aber nicht zusammenhängend abgelegt.
 *   • je Member: `2t` 0,63 MiB, `tp` 1,05 MiB (nicht 1,12 für beide, wie in
 *     PD-B8 aus einem anderen Parameter hochgerechnet).
 *   • nur **00z und 12z** reichen bis 336 h; 06z/18z enden bei 144 h.
 *   • ⚠ `tp` ist seit Laufbeginn akkumuliert (Template 4.11, Prozess 1, Spanne
 *     = Vorhersagestunde × 60). Die Streuung dieser Summe ist die Streuung von
 *     zehn Tagen Regen — gemessen 53-mal größer als die der 6-h-Rate. Deshalb
 *     wird je Member entakkumuliert (`ensembleStats.mjs`), und der Vorschritt
 *     t−6 existiert im IFS-Schrittraster immer (3-stündlich bis 144, danach
 *     6-stündlich).
 *
 * ── Mehrere Bereiche in einer Anfrage ───────────────────────────────────────
 * Einzeln wären es 50 Anfragen je (Größe, Schritt) — 600 für die Fernstufe, bei
 * 300 ms Mindestabstand und gemessenen 3 Drosselungen je 165 Anfragen rund
 * sieben Minuten. `data.ecmwf.int` beantwortet einen Range-Kopf mit 50 Bereichen
 * mit **HTTP 206 multipart/byteranges**: gemessen 31,55 MiB in 3,6 s, alle 50
 * Längen stimmen. Aus 600 Anfragen werden 12.
 *
 * ── Warum 50 Member und nicht 20 ────────────────────────────────────────────
 * Die Member liegen als getrennte Bereiche, eine Teilmenge wäre also abrufbar.
 * Gemessen an allen 2 009 Zellen des Ausschnitts, σ aus 20 gegen σ aus 50:
 *   `2t`  Median-Abweichung  4,9 %, Mittel 0,999 — 20 würden reichen
 *   `tp`  Median-Abweichung 39,9 %                — 20 reichen NICHT
 * Niederschlag ist intermittierend; ob eine Teilmenge die nassen Member
 * erwischt, ist Zufall. Und beide Größen brauchen DIESELBE Memberzahl, sonst
 * sagte `ensCount` (eine Ebene für alle Größen, V-PD-26) für eine von beiden
 * das Falsche. `POINT_ECMWF_MEMBERS` verkleinert — nur auf gerade Zahlen, also
 * vollständige Paare (am Start ist eine schwache ±-Symmetrie messbar).
 *
 * ── Was diese Quelle NICHT tut ──────────────────────────────────────────────
 * Sie trägt **nichts zum Mittel bei** (`vars: []`). Ihr Mittel ist derselbe
 * Modellzyklus wie IFS HRES, das der Cube schon ingestiert; als zweiter
 * „unabhängiger" Wert ließe es σ_div schrumpfen (V-PD-9).
 */

import { fetchBytes, fetchRanges, headOk, runIdBack, sampleBytes, M_TO_MM } from './shared.mjs';
import { memberSpread } from './ensembleStats.mjs';
// PD-C5: dasselbe Schrittraster wie der deterministische IFS-Adapter — EINE Regel.
import { ECMWF_STEPS } from './ecmwf.mjs';
import { decodeGrib2 } from '../../../src/sources/gribDecode.ts';

const ECMWF = process.env.ECMWF_BASE || 'https://data.ecmwf.int/forecasts';

const MODELS = {
  ifs_ens: { path: 'ifs/0p25/enfo', suffix: 'enfo-ef', runSlotH: 6, params: { t2m: '2t', precip: 'tp' } },
};

/** Gerade Zahl 2…50: vollständige Paare. Standard 50 — s. Kopf. */
export const ECMWF_ENS_MEMBERS = (() => {
  const n = Number(process.env.POINT_ECMWF_MEMBERS || 50);
  if (!Number.isInteger(n) || n < 2 || n > 50 || n % 2 !== 0) {
    throw new Error(`POINT_ECMWF_MEMBERS=${process.env.POINT_ECMWF_MEMBERS}: erlaubt sind gerade Zahlen 2…50 (vollständige Paare)`);
  }
  return n;
})();

/** Jans Vorgabe: 48-Stunden-Raster. */
export const ECMWF_ENS_STEP_H = Number(process.env.POINT_ENS_STEP_ECMWF || 48);

const ACCUMULATED = new Set(['precip']);

/**
 * Faktor der Einheit — aus der Parameter-Identität im GRIB, nicht aus dem
 * Modellnamen (dieselbe Regel wie `scaleFromGrib` in ecmwf.mjs, gemessen: IFS
 * führt `tp` als ECMWF-lokal 1/193 in METERN).
 */
function unitFactor(varId, f) {
  const cat = f.parameterCategory, num = f.parameterNumber;
  if (varId === 't2m') {
    if (cat === 0 && num === 0) return 1;                   // K — eine Streuung in K IST eine in °C
    throw new Error(`ecmwfEns: unbekannte Temperatur-Identität cat=${cat} num=${num}`);
  }
  if (varId === 'precip') {
    if (cat === 1 && num === 193) return M_TO_MM.factor;    // ECMWF-lokal: Meter
    if (cat === 1 && (num === 52 || num === 8)) return 1;   // WMO: bereits mm
    throw new Error(`ecmwfEns: unbekannte Niederschlags-Identität cat=${cat} num=${num}`);
  }
  throw new Error(`ecmwfEns: keine Einheit für ${varId}`);
}

export function makeEcmwfEnsembleAdapter(id) {
  const m = MODELS[id];
  if (!m) throw new Error(`ecmwfEns: unbekanntes Modell ${id}`);
  const wanted = new Set(Object.values(m.params));

  const stem = (run, step) => {
    const date = run.slice(0, 8), hh = run.slice(8, 10);
    return `${ECMWF}/${date}/${hh}z/${m.path}/${date}${hh}0000-${step}h-${m.suffix}`;
  };

  /** `.index` je (Lauf, Schritt): Parameter#Member → Eintrag. ~2 MB, gecacht. */
  const idxCache = new Map();
  async function index(run, step) {
    const key = `${run}#${step}`;
    if (idxCache.has(key)) return idxCache.get(key);
    const p = (async () => {
      const raw = await fetchBytes(`${stem(run, step)}.index`);
      if (!raw) return null;
      const out = new Map();
      for (const line of new TextDecoder().decode(raw).split('\n')) {
        const s = line.trim();
        if (!s) continue;
        let e;
        try { e = JSON.parse(s); } catch { continue; }
        if (e.levtype !== 'sfc' || String(e.type) !== 'pf' || !wanted.has(e.param)) continue;
        out.set(`${e.param}#${Number(e.number)}`, e);
      }
      return out;
    })();
    idxCache.set(key, p);
    return p;
  }

  /** Alle gewählten Member eines Parameters an einem Schritt, auf die Stufe abgetastet. */
  async function membersAt(run, step, param, varId, tier) {
    const idx = await index(run, step);
    if (!idx) return null;
    const entries = [];
    for (let n = 1; n <= ECMWF_ENS_MEMBERS; n++) {
      const e = idx.get(`${param}#${n}`);
      if (e) entries.push(e);
    }
    if (entries.length < 2) return null;
    const bufs = await fetchRanges(`${stem(run, step)}.grib2`,
      entries.map((e) => ({ offset: e._offset, length: e._length })));
    if (!bufs) return null;
    const members = new Map();
    let factor = null, mismatch = 0;
    // PD-F2d: alle Member gleichzeitig in den Pool, Ergebnisse PER INDEX in Index-Ordnung.
    const sampled = await Promise.all(bufs.map((b) => sampleBytes(b, tier)));
    for (let i = 0; i < entries.length; i++) {
      const f = sampled[i].header;
      // Gegenprobe am Byte: die Member-Nummer IM GRIB muss die aus dem `.index`
      // sein. Weicht sie ab, sind die Bereiche verschoben — dann ist jede Zahl
      // danach falsch, und zwar ohne dass sie falsch aussähe.
      if (f.perturbationNumber != null && f.perturbationNumber !== Number(entries[i].number)) mismatch++;
      const fac = unitFactor(varId, f);
      if (factor == null) factor = fac;
      else if (fac !== factor) throw new Error(`ecmwfEns: ${param}@${step} h mit gemischten Einheiten`);
      members.set(Number(entries[i].number), sampled[i].grid);
    }
    if (mismatch) {
      throw new Error(`ecmwfEns: ${mismatch} von ${entries.length} Membern tragen im GRIB eine andere Nummer als im .index — Byte-Bereiche verschoben`);
    }
    return { members, factor };
  }

  return {
    id,
    family: 'ecmwf-index',
    accumulated: ACCUMULATED,
    /** ⚠ LEER mit Absicht — diese Quelle geht nicht ins Mittel (V-PD-9). */
    vars: [],
    ensembleVars: Object.keys(m.params),
    members: ECMWF_ENS_MEMBERS,
    stepH: ECMWF_ENS_STEP_H,
    ensembleOnly: true,
    ensembleControlOnly: false,

    async discoverRun(leadMax, nowMs = Date.now(), maxBack = 8) {
      // PD-C5: auf eine Stunde proben, die IFS rechnet (3 h bis 144, dann 6 h).
      let probeH = Math.floor(leadMax);
      while (probeH > 0 && !ECMWF_STEPS.ifs(probeH)) probeH--;
      for (let back = 0; back < maxBack; back++) {
        const run = runIdBack(nowMs, m.runSlotH, back);
        if (await headOk(`${stem(run, probeH)}.index`)) return run;
      }
      return null;
    },

    /**
     * Nur die Stunden des 48-h-Rasters werden geprüft — eine HEAD-Anfrage je Rasterstunde.
     * PD-C5: und nur solche, die IFS überhaupt rechnet (`ECMWF_STEPS.ifs`) — heute
     * deckungsgleich mit dem 48-h-Raster, aber ein feineres Raster in Stufe 2 (Plan PD-C8b)
     * darf keine Stunde zwischen den Modellschritten fordern.
     */
    async leadsFor(run, tier) {
      const got = [];
      for (const h of tier.leadHours) {
        if (h % ECMWF_ENS_STEP_H !== 0 || !ECMWF_STEPS.ifs(h)) continue;
        if (await headOk(`${stem(run, h)}.index`)) got.push(h);
      }
      return got;
    },

    /** Kein Beitrag zum Mittel (s. `vars`). */
    async field() { return null; },

    /**
     * Die Member-Streuung einer Größe an einer Stunde.
     *
     * @param opts.dt  Stufenschritt in Stunden — Pflicht für Niederschlag: die Ebene
     *                 verspricht die Rate über genau diesen Schritt.
     */
    async ensemble(run, leadH, varId, tier, { dt } = {}) {
      const param = m.params[varId];
      if (!param) return null;
      const cells = tier.ny * tier.nx;
      if (!ACCUMULATED.has(varId)) {
        const cur = await membersAt(run, leadH, param, varId, tier);
        if (!cur) return null;
        const r = memberSpread(cur.members, null, { cells, factor: cur.factor });
        return { sd: r.sd, n: r.maxN, members: r.members, clamped: 0 };
      }
      if (!(dt > 0) || leadH - dt <= 0) return null;
      // Vorschritt ZUERST: fehlt er, gibt es keine Rate, und der Hauptschritt
      // (51,5 MiB) muss gar nicht erst geholt werden.
      const prev = await membersAt(run, leadH - dt, param, varId, tier);
      if (!prev) return null;
      const cur = await membersAt(run, leadH, param, varId, tier);
      if (!cur) return null;
      const r = memberSpread(cur.members, prev.members, { cells, dt, factor: cur.factor });
      return { sd: r.sd, n: r.maxN, members: r.members, clamped: r.clamped };
    },

    async orography() { return null; },
    hasProfile: false,
    profileLevels: null,

    ensembleNote: `${ECMWF_ENS_MEMBERS} von 50 Membern, je (Größe, Schritt) EINE Anfrage mit `
      + 'mehreren Byte-Bereichen (HTTP 206 multipart/byteranges). Raster '
      + `${ECMWF_ENS_STEP_H} h, nur 00z/12z reichen bis 336 h. Traegt NICHTS zum Mittel bei: `
      + 'das Ensemble-Mittel ist derselbe Modellzyklus wie IFS HRES (V-PD-9). Niederschlag je '
      + 'Member entakkumuliert ueber den Stufenschritt; die Member-Nummer im GRIB wird gegen '
      + 'das .index geprueft.',
  };
}
