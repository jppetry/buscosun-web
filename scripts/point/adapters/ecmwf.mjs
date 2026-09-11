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

import { fetchBytes, fetchRanges, headOk, probeHorizon, pad2, runIdBack, sampleRegularToTier, convert,
  KELVIN_TO_C, PA_TO_HPA, FRACTION_TO_PCT, M_TO_MM } from './shared.mjs';
import { decodeGrib2 } from '../../../src/sources/gribDecode.ts';

const ECMWF = process.env.ECMWF_BASE || 'https://data.ecmwf.int/forecasts';

// ── Schrittraster je Modell (PD-C5, V-PD-37) ──────────────────────────────────
//
// ECMWF veröffentlicht nicht jede Stunde: IFS rechnet 3-stündlich bis 144 h, danach
// 6-stündlich; AIFS (Single und ENS) durchgehend 6-stündlich. Bis PD-C5 kannte dieser
// Adapter das nicht — `leadsFor` probte die ERSTE Stufenstunde und schloss aus einem 404,
// die Quelle habe nichts. Gemessen am Gesamtlauf (§45.12): AIFS Single fiel in Stufe 2
// komplett aus (51 h ist kein Vielfaches von 6), und in Stufe 1 meldete die Halbierung
// „49 Stunden", von denen der Producer dann 80 vergeblich abrief (404). Das Raster gilt
// im LAUFRAUM der Quelle — `leadsFor` bekommt die um `offsetH` verschobenen Stunden.
export const ECMWF_STEPS = Object.freeze({
  ifs:  (h) => (h <= 144 ? h % 3 === 0 : h % 6 === 0),
  aifs: (h) => h % 6 === 0,
});

const MODELS = {
  ifs_hres:    { path: 'ifs/0p25/oper',        suffix: 'oper-fc',  runSlotH: 6, steps: ECMWF_STEPS.ifs },
  // ifs_ens: seit PD-B10 in ecmwfEns.mjs — die Member statt eines Kontrolllaufs, den
  // `enfo-ef` gar nicht führt (§34.5). Hier stand er als Kontrolllauf-Quelle, die nie
  // ein Feld geliefert hat.
  aifs_single: { path: 'aifs-single/0p25/oper', suffix: 'oper-fc', runSlotH: 6, steps: ECMWF_STEPS.aifs },
  // AIFS-ENS legt KEINE gebuendelte `enfo-ef` ab, sondern `enfo-cf` (Kontrolllauf)
  // und `enfo-pf` (gestoerte Member) getrennt. Am Verzeichnis abgelesen (2026-09-08);
  // mit `enfo-ef` fand die Lauf-Suche gar nichts und meldete „Quelle nicht verfuegbar".
  aifs_ens:    { path: 'aifs-ens/0p25/enfo',    suffix: 'enfo-cf', runSlotH: 6, ensemble: true, steps: ECMWF_STEPS.aifs },
};

/** Die Stufenstunden, die dieses Modell überhaupt rechnet — VOR jeder Netzsonde. */
export function ecmwfOwnLeads(id, leadHours) {
  const m = MODELS[id];
  if (!m) return [];
  return leadHours.filter((h) => h >= 0 && m.steps(h));
}

/** Die größte Rasterstunde ≤ h — damit die Laufsuche nicht auf eine Stunde probt, die es nie gibt. */
export function ecmwfSnapDown(id, h) {
  const m = MODELS[id];
  if (!m) return h;
  let x = Math.floor(h);
  while (x > 0 && !m.steps(x)) x--;
  return x;
}

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

/**
 * Welche `.index`-Zeile ein Adapter behält.
 *
 * ⚠ Der Fehler, den diese Funktion behebt (in PD-B8 eingebaut, in PD-B10 gefunden):
 * PD-B8 stellte den Filter von `number` auf `type` um — richtig für die Ensembles,
 * aber als EINE Bedingung für ALLE Modelle geschrieben:
 * `if (e.type != null && String(e.type) !== 'cf') continue;`. Deterministische
 * Dateien tragen `type: "fc"`. Gemessen am Lauf 2026091100, +240 h: der Filter
 * behielt bei IFS HRES **0 von 36** und bei AIFS Single **0 von 21**
 * Oberflächeneinträgen. Beide Quellen haben seit PD-B8 in KEINER Stufe ein Feld
 * geliefert. Sichtbar wurde es erst, als ein Probebau der Fernstufe nur IFS HRES als
 * deterministische Quelle hatte und jede Ebene leer blieb; im Gesamtlauf füllten
 * ICON global und AICON die Stufe weiter, und der einzige Hinweis war die Größe
 * (Stufe 3: 1,29 → 0,38 MiB).
 *
 * Und der Verifier hat den Fehler BESTÄTIGT statt gefunden: er prüfte per Regex,
 * dass genau diese Zeile im Code steht. Geprüft wurde die Schreibweise, nicht das
 * Verhalten — deshalb ist das hier eine Funktion, die der Verifier mit Zeilen in
 * echter Form füttert.
 */
export function keepIndexEntry(model, e) {
  if (e.levtype !== 'sfc') return false;
  // Nur ein Kontrolllauf-Adapter eines Ensembles filtert nach `type` und behält `cf`.
  // Deterministische Dateien (`fc`) enthalten nichts anderes als den einen Lauf.
  if (model.ensemble) return String(e.type) === 'cf';
  return true;
}

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
      // Beim Ensemble tragen alle Member denselben Parameter; diese Zeile behält den
      // Kontrolllauf (`number` fehlt oder 0). Das Member-Mittel ist eine eigene Etappe.
      //
      // ⚠ GEMESSEN am 2026-09-09 (`…/ifs/0p25/enfo/…-144h-enfo-ef.index`, 2 012 902 B):
      // die Datei enthält **1 800 sfc-Einträge, ALLE mit `type: "pf"` und `number` 1…50**
      // — keinen einzigen Kontrolllauf. Dieser Filter behält für `ifs_ens` also **null**
      // Einträge; die Quelle hat noch nie ein Feld geliefert. Aufgefallen ist es nicht,
      // weil `ensembleControlOnly` sie ohnehin aus dem Mittel hält (V-PD-9).
      // Für IFS liegt der Kontrolllauf woanders als bei AIFS (dort `enfo-cf`) — die
      // beiden Produkte sind unterschiedlich abgelegt.
      // ── Behoben in PD-B8 (§43.6) ───────────────────────────────────────
      // Gefiltert wird jetzt über `type`, nicht über `number`: `cf` = Kontrolllauf,
      // `pf` = gestörter Member. Die alte Bedingung „`number` fehlt oder 0" sagte
      // dasselbe nur für AIFS und war für IFS eine stille Null.
      //
      // ⚠ Der Befund bleibt: `…/ifs/0p25/enfo/…-enfo-ef.index` enthält **keinen
      // `cf`-Eintrag**. Diese Quelle liefert also weiterhin nichts — aber jetzt,
      // weil der Katalog nichts hat, und nicht, weil der Filter danebengreift.
      // `ensembleControlOnly` hält sie ohnehin aus dem Mittel (V-PD-9).
      //
      // ⚠ Und die Member werden hier NICHT gelesen, obwohl PD-B8 sie einführt:
      // gemessen kostet ein (Größe, Schritt) bei IFS-ENS **55,8 MiB** (50 Member
      // à 1,12 MiB als getrennte Byte-Bereiche) und bei AIFS-ENS **65,1 MiB** —
      // gegen 34,8 MiB bei ICON-EPS global für dieselbe Aussage. Die Fernstufe
      // bekommt σ_ens deshalb aus ICON-EPS global. Das ist eine Kostenentscheidung
      // mit Zahlen, keine Lücke.
      // ⚠ Nachgemessen in PD-B10 (§45): die 55,8 MiB galten einem anderen Parameter.
      // Je Member kosten `2t` 0,63 und `tp` 1,05 MiB, und mit mehreren Bereichen in EINER
      // Anfrage kommen 50 Member in 3,6 s. Die Entscheidung ist gekippt — ecmwfEns.mjs
      // liest sie; dieser Filter betrifft nur noch den AIFS-ENS-Kontrolllauf (`enfo-cf`).
      if (!keepIndexEntry(m, e)) continue;   // ⚠ die alte Zeile strich jedes `fc` — s. keepIndexEntry (PD-B10)
      if (!byParam.has(e.param)) byParam.set(e.param, e);
    }
    idxCache.set(key, byParam);
    return byParam;
  }

  // ── Ein Schritt, EINE Anfrage (PD-B10, §45) ───────────────────────────────────
  // `field()` wird je Größe gerufen — acht Größen je Schritt waren acht Anfragen,
  // bei 300 ms Mindestabstand. Seit der Filter-Reparatur aus PD-B10 holen IFS HRES
  // und AIFS Single wieder Felder, gerechnet rund 1 000 Abrufe über alle Stufen,
  // also ≥ 5 min nur Warten. Beim ersten Feld eines Schritts werden deshalb ALLE
  // Größen dieses Schritts in EINER Anfrage mit mehreren Bereichen geholt. Sie liegen
  // danach im Cache unter demselben Schlüssel, den `fetchBytes(url, { range })`
  // benutzt — die Einzelabrufe unten treffen ihn. Schlägt der Sammelabruf fehl,
  // bleibt der Einzelweg (benannter Rückfall); `POINT_ECMWF_MULTIRANGE=0` schaltet ab.
  //
  // Das Ergebnis wird NICHT gehalten, nur das Erledigt: die Bytes liegen auf der
  // Platte, und 72 Schritte à ~5 MiB im Speicher wären die Klasse aus §43.11.
  const prefetched = new Map();
  function prefetchStep(run, leadH, idx) {
    const key = `${run}#${leadH}`;
    if (!prefetched.has(key)) {
      const es = Object.values(PARAMS).map((p) => idx.get(p)).filter(Boolean);
      prefetched.set(key, es.length < 2 ? Promise.resolve(false)
        : fetchRanges(`${stem(run, leadH)}.grib2`, es.map((e) => ({ offset: e._offset, length: e._length })))
          .then(() => true, () => false));
    }
    return prefetched.get(key);
  }

  return {
    id,
    family: 'ecmwf-index',
    accumulated: ECMWF_ACCUMULATED,
    vars: Object.keys(PARAMS),
    ensembleControlOnly: !!m.ensemble,

    async discoverRun(leadMax, nowMs = Date.now(), maxBack = 8) {
      // Auf eine Stunde proben, die das Modell RECHNET (PD-C5): `chooseRun` fragt nach
      // dem Bandende bzw. der ersten Stufenstunde — 51 h gibt es bei AIFS nicht, 48 h schon.
      const probeH = ecmwfSnapDown(id, leadMax);
      for (let back = 0; back < maxBack; back++) {
        const run = runIdBack(nowMs, m.runSlotH, back);
        if (await headOk(`${stem(run, probeH)}.index`)) return run;
      }
      return null;
    },

    async leadsFor(run, tier) {
      // Erst das Raster, dann die Sonde: die Halbierung setzt Zusammenhang voraus, und
      // der gilt nur auf den Stunden, die das Modell ueberhaupt rechnet (PD-C5).
      return probeHorizon(ecmwfOwnLeads(id, tier.leadHours), (h) => headOk(`${stem(run, h)}.index`));
    },

    async field(run, leadH, varId, tier) {
      const p = PARAMS[varId];
      if (!p) return null;
      const idx = await index(run, leadH);
      const e = idx?.get(p);
      if (!e) return null;
      if (process.env.POINT_ECMWF_MULTIRANGE !== '0') await prefetchStep(run, leadH, idx);
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
