/**
 * meteoswiss.mjs — Zugriffsfamilie 6: **STAC-Katalog + vorsignierte S3-Objekte**
 * (`audit/punktdaten-versorgung.md` §41, Etappe PD-B6).
 *
 * ICON-CH1-EPS und ICON-CH2-EPS. Damit bekommt die **Schweiz** zum ersten Mal eine
 * eigene Quelle im Punkt-Cube; bis PD-B5 wurde jeder Schweizer Punkt aus der
 * deutschen Spalte der Quellenmatrix versorgt (§33.5).
 *
 * ── Alles hier ist am Objekt gemessen (2026-09-10), nicht abgeschrieben ────────
 *
 * **Gitter:** icosahedral (GDT 101), CH1 **1 147 980** Zellen (−0,817…17,711 °E /
 * 42,028…50,501 °N), CH2 **283 876** (−0,769…17,678 / 42,079…50,479). Die
 * Registry-Hülle stimmt hier — anders als bei C-LAEF. Abgetastet wird über den
 * Eimergitter-Nachbarindex aus PD-B4b; ohne ihn kostete allein CH1 fünf Minuten
 * je Stufe.
 *
 * **Zellkoordinaten und Orographie** kommen aus dem Collection-Asset
 * `horizontal_constants_*.grib2` (CH1 32,9 MiB, CH2 8,1 MiB, zeitinvariant, 17
 * Nachrichten). Identifiziert wird über die **Parameter-Identität**, nicht über
 * Wertebereiche: `clat` = 0/191/1, `clon` = 0/191/2, `HSURF` = 0/3/6. Eine
 * Bereichs-Heuristik (so macht es der Kartenclient) findet `HSURF` gar nicht und
 * verwechselt bei einer künftigen Nachricht leicht zwei Felder.
 *
 * **Einheiten — gemessen, weil die Doku an einer Stelle falsch ist.** `params_*.csv`
 * führt `TOT_PREC` als `kg m-2 s-1` bei „Accumulation since Reference Time". Am Feld
 * nachgemessen: **0…155 mm, laufakkumuliert** (Parameter 0/1/52, dieselbe Identität
 * wie bei AIFS). Wäre die CSV-Einheit übernommen worden, stünde derselbe Unsinn im
 * Cube wie bei den 21 976 mm für Wien (§23.3). Weiter gemessen: T/Td in Kelvin,
 * Druck in Pa, alle vier Bewölkungen in **Prozent** (0…100), `VMAX_10M` als Maximum
 * der Vorstunde.
 *
 * ⚠ **`SNOWLMT` ist teilweise maskiert** — 270 559 von 283 876 Zellen tragen einen
 * Wert; wo kein Niederschlag fällt, gibt es keine Schneefallgrenze. Diese Zellen
 * bleiben MISSING. Eine 0 dort hieße „Schneefallgrenze auf Meeresniveau".
 *
 * ── Der teure Teil ist der KATALOG, nicht die Daten ────────────────────────────
 * Der STAC-Katalog kennt **keine** Filter-, Sort- oder Query-Konformanzklasse (am
 * `/conformance` geprüft: nur core, collections, ogcapi-features, item-search).
 * ⚠ Und das ist die Falle: ein unbekannter Query-Parameter wird **still ignoriert
 * und mit HTTP 200 unverändert beantwortet** — `?forecast:variable=T_2M` liefert
 * ALB_DIF. Wer das nicht gegenprüft, baut auf einem Filter, den es nicht gibt.
 * Dieselbe Klasse wie `git add` im sparse-Checkout (§30): Erfolg gemeldet, nichts
 * getan.
 *
 * `limit` ist bei **100** gedeckelt (500 und 1000 liefern 100). An EINER Gültigzeit
 * stehen bei CH1 **1 600 Items** (50 Variablen × 8 vorgehaltene Läufe × ctrl/pert)
 * ⇒ **16 Seiten, 3,9 s, ~3 MB JSON**. Deshalb wird je Gültigzeit **genau einmal**
 * enumeriert und daraus der Href JEDER gebrauchten Größe gemerkt — nicht je Feld.
 *
 * ⚠ **Der `next`-Cursor ist NICHT konstruierbar.** Er ist base64 von
 * `p=<letzte Item-ID>`, sieht also nach einem Keyset-Cursor aus; eine selbst
 * gebaute, nicht existierende ID liefert aber **0 Items** statt eines Sprungs
 * (am Objekt geprüft, samt Roundtrip-Gegenprobe, die zeigt, dass die Kodierung
 * stimmt). Der naheliegende Trick „direkt zum neuesten Lauf springen" funktioniert
 * nicht.
 *
 * ⚠ **Vorsignierte URLs sind methodengebunden:** `HEAD` antwortet **403**, `GET`
 * und Range-`GET` antworten 200/206. `headOk()` ist hier also unbrauchbar — die
 * Existenz einer Datei folgt aus dem Katalog, nicht aus einer Sonde. Und weil
 * `Signature`/`Expires` bei jeder Enumeration wechseln, cacht der Abruf unter dem
 * **Objektnamen** (`cacheKey`), nicht unter der URL.
 *
 * ── Warum der Kontrolllauf hier ins Mittel darf (und bei IFS nicht) ────────────
 * V-PD-9 hält Ensemble-Kontrollläufe aus dem Mittel, weil der IFS-ENS-Kontrolllauf
 * **IFS HRES IST** — eine bereits ingestierte Quelle ein zweites Mal zu zählen ließe
 * σ_div schrumpfen. Für ICON-CH gilt das NICHT: MeteoSchweiz veröffentlicht keinen
 * separaten deterministischen Lauf, der `ctrl`-Member ist die einzige Fassung, und
 * er dupliziert **keine** andere ingestierte Quelle. Deshalb `ensembleControlOnly:
 * false`, mit genau dieser Begründung im Manifest.
 *
 * Die vollen Member bleiben draußen: das gebündelte `perturbed`-File ist ~23 MB je
 * (Variable, Schritt). Das ist PD-B8, nicht diese Etappe.
 */

import {
  fetchBytes, fetchGribField, runIdBack, buildUnstructuredIndex, sampleUnstructuredToTier,
  convert, KELVIN_TO_C, PA_TO_HPA,
} from './shared.mjs';
import { decodeGrib2All } from '../../../src/sources/gribDecode.ts';

const STAC = process.env.MCH_STAC || 'https://data.geo.admin.ch/api/stac/v1';

const MODELS = {
  icon_ch1_eps: {
    collection: 'ch.meteoschweiz.ogd-forecasting-icon-ch1',
    constants: 'horizontal_constants_icon-ch1-eps.grib2',
    prefix: 'icon-ch1-eps',
    runSlotH: 3,          // gemessen: 8 vorgehaltene Läufe, 3-stündlich
    // ⚠ Bewusste Vergröberung. Gemessen kostet CH1 **26,4 MiB je Schritt**
    // (12 Größen à 2,24 MiB); stündlich über 0–48 h wären das 1,21 GiB je Lauf und
    // damit mehr als ein Fünftel des gesamten Laufbudgets für EINE Quelle.
    // Jans Vorgabe für PD-B lautet „Ensembles nur als Mittel + σ_ens in grobem
    // Zeitraster" — das ist dieses Raster.
    stepH: Number(process.env.MCH_CH1_STEP_H || 3),
  },
  icon_ch2_eps: {
    collection: 'ch.meteoschweiz.ogd-forecasting-icon-ch2',
    constants: 'horizontal_constants_icon-ch2-eps.grib2',
    prefix: 'icon-ch2-eps',
    runSlotH: 6,          // gemessen: 4 vorgehaltene Läufe, 6-stündlich
    // CH2 kostet nur 6,5 MiB je Schritt — Stufe 2 ist ohnehin dreistündlich,
    // hier wird also nichts vergröbert.
    stepH: 3,
  },
};

/** Cube-Größe → STAC-`forecast:variable`. Am Collection-Asset `params_*.csv`
 *  geprüft: ICON-CH führt **alle zwölf**, nicht die fünf, die die Registry nannte
 *  (die stammten aus dem Kartenclient, also aus einem Verbraucher). */
const PARAMS = {
  t2m: 'T_2M', td2m: 'TD_2M', u10: 'U_10M', v10: 'V_10M', gust: 'VMAX_10M',
  precip: 'TOT_PREC', clct: 'CLCT', clcl: 'CLCL', clcm: 'CLCM', clch: 'CLCH',
  ps: 'PS', snowlmt: 'SNOWLMT',
};

/** Am Feld gemessen, nicht aus der CSV übernommen — s. Kopf. */
const UNITS = { t2m: KELVIN_TO_C, td2m: KELVIN_TO_C, ps: PA_TO_HPA };

/** Parameter-Identität der Konstanten (discipline/category/number). */
const CONST_ID = { clat: [0, 191, 1], clon: [0, 191, 2], hsurf: [0, 3, 6] };

const MCH_ACCUMULATED = new Set(['precip']);

const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
/** Ein Ein-Minuten-Fenster: ein exakter Zeitpunkt liefert 0 Items. */
const instant = (t) => `${iso(t)}/${iso(t + 60_000)}`;
/** `runIdBack` liefert `YYYYMMDDHH`; der Katalog schreibt `YYYYMMDDHHMM`. */
const runMs = (run) => Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10));
const runStamp = (run) => `${run}00`;

/** Enumerationen je (Modell, Gültigzeit) — der teuerste Posten, also genau einmal. */
const itemCache = new Map();
/** Zellkoordinaten + Orographie je Modell; zeitinvariant. */
const constCache = new Map();
/** Nachbarindex je (Modell, Stufe). */
const indexCache = new Map();

/**
 * Alle Items einer Gültigzeit. Gedeckelt: der Katalog paginiert id-aufsteigend, der
 * neueste Lauf steht also am ENDE — abbrechen darf man erst, wenn keine Seite mehr
 * kommt. Ein zu früher Abbruch verlöre genau den Lauf, den man sucht.
 */
async function itemsAt(cfg, validMs, maxPages = 25) {
  const key = `${cfg.collection}|${validMs}`;
  if (itemCache.has(key)) return itemCache.get(key);
  const out = [];
  let url = `${STAC}/collections/${cfg.collection}/items`
    + `?limit=100&datetime=${encodeURIComponent(instant(validMs))}`;
  for (let p = 0; p < maxPages && url; p++) {
    const res = await fetch(url);
    if (!res.ok) break;
    const j = await res.json();
    const feats = j.features ?? [];
    if (feats.length === 0) break;
    for (const f of feats) {
      out.push({
        ref: Date.parse(String(f.properties['forecast:reference_datetime'])),
        variable: String(f.properties['forecast:variable']),
        perturbed: f.properties['forecast:perturbed'] === true,
        href: Object.values(f.assets)[0]?.href ?? null,
        object: Object.keys(f.assets)[0] ?? null,
      });
    }
    url = (j.links ?? []).find((l) => l.rel === 'next')?.href;
  }
  itemCache.set(key, out);
  return out;
}

/** Zellkoordinaten und Modellorographie aus dem Konstanten-Asset. */
async function constants(cfg) {
  if (constCache.has(cfg.collection)) return constCache.get(cfg.collection);
  const p = (async () => {
    const res = await fetch(`${STAC}/collections/${cfg.collection}`);
    if (!res.ok) return null;
    const coll = await res.json();
    const href = coll.assets?.[cfg.constants]?.href;
    if (!href) return null;
    const raw = await fetchBytes(href, { cacheKey: `mch:${cfg.constants}` });
    if (!raw) return null;
    const fields = decodeGrib2All(raw);
    const pick = ([d, c, n]) => fields.find((f) =>
      f.discipline === d && f.parameterCategory === c && f.parameterNumber === n);
    const clat = pick(CONST_ID.clat), clon = pick(CONST_ID.clon), hsurf = pick(CONST_ID.hsurf);
    // Ohne Koordinaten ist jedes Feld dieser Quelle wertlos — dann lieber laut
    // nichts liefern als Zellen an falscher Stelle.
    if (!clat || !clon) return null;
    return { lat: clat.values, lon: clon.values, hsurf: hsurf?.values ?? null, n: clat.values.length };
  })();
  constCache.set(cfg.collection, p);
  return p;
}

async function cellIndex(cfg, tier) {
  const key = `${cfg.collection}|${tier.id}`;
  if (indexCache.has(key)) return indexCache.get(key);
  const p = (async () => {
    const c = await constants(cfg);
    if (!c) return null;
    return buildUnstructuredIndex(c.lat, c.lon, tier);
  })();
  indexCache.set(key, p);
  return p;
}

export function makeMeteoSwissAdapter(id) {
  const cfg = MODELS[id];
  if (!cfg) throw new Error(`meteoswiss: unbekanntes Modell ${id}`);

  /** Die Vorhersagestunden, die diese Quelle in dieser Stufe überhaupt anbietet. */
  const ownSteps = (tier) => {
    const step = Math.max(tier.stepH, cfg.stepH);
    return tier.leadHours.filter((h) => h % step === 0);
  };

  const findItem = (items, runAtMs, variable) => items.find(
    (it) => it.ref === runAtMs && !it.perturbed && it.variable === variable);

  return {
    id,
    family: 'meteoswiss-stac',
    accumulated: MCH_ACCUMULATED,
    vars: Object.keys(PARAMS),

    /**
     * Anders als bei DWD/ECMWF gibt es hier **keine Sonde**: eine vorsignierte URL
     * antwortet auf HEAD mit 403, und raten kann man den Href nicht. Die Existenz
     * eines Laufs folgt aus dem Katalog — eine Enumeration an der Gültigzeit von
     * `leadMax` nennt jeden Lauf, der so weit reicht.
     */
    async discoverRun(leadMax, nowMs = Date.now(), maxBack = 16) {
      for (let back = 0; back < maxBack; back++) {
        const run = runIdBack(nowMs, cfg.runSlotH, back);
        const items = await itemsAt(cfg, runMs(run) + leadMax * 3_600_000);
        if (findItem(items, runMs(run), PARAMS.t2m)) return run;
      }
      return null;
    },

    /**
     * Die Abdeckung kommt aus der Enumeration, nicht aus einer Annahme über den
     * Horizont — §34 hat gezeigt, was passiert, wenn sie aus der Sonde abgeleitet
     * wird (`coverage: full` bei null gelieferten Stunden).
     */
    async leadsFor(run, tier) {
      const at = runMs(run);
      const got = [];
      for (const h of ownSteps(tier)) {
        const items = await itemsAt(cfg, at + h * 3_600_000);
        if (findItem(items, at, PARAMS.t2m)) got.push(h);
      }
      return got;
    },

    async field(run, leadH, varId, tier) {
      const variable = PARAMS[varId];
      if (!variable) return null;
      const idx = await cellIndex(cfg, tier);
      if (!idx) return null;
      const items = await itemsAt(cfg, runMs(run) + leadH * 3_600_000);
      const it = findItem(items, runMs(run), variable);
      if (!it) return null;
      // Cache unter dem OBJEKTNAMEN: die Signatur in der URL wechselt bei jeder
      // Enumeration, ein URL-Schlüssel träfe nie.
      const f = await fetchGribField(it.href, { bz2: false, cacheKey: `mch:${it.object}` });
      if (!f) return null;
      return convert(sampleUnstructuredToTier(f.values, idx, tier), UNITS[varId]);
    },

    async orography(run, tier) {
      const c = await constants(cfg);
      const idx = await cellIndex(cfg, tier);
      if (!c?.hsurf || !idx) return null;
      return sampleUnstructuredToTier(c.hsurf, idx, tier);
    },

    /**
     * ⚠ Bewusst `false`, und das ist KEIN Verstoß gegen V-PD-9 — s. Kopf: der
     * ICON-CH-Kontrolllauf dupliziert keine andere ingestierte Quelle, weil
     * MeteoSchweiz gar keinen separaten deterministischen Lauf veröffentlicht.
     */
    ensembleControlOnly: false,
    /** Fürs Manifest: WARUM diese Quelle mitmittelt, obwohl sie `kind: ensemble` ist. */
    controlNote: 'ctrl-Member von ICON-CH-EPS. Geht ins Mittel, weil MeteoSchweiz keinen '
      + 'separaten deterministischen Lauf veröffentlicht — anders als IFS-ENS-ctrl, der '
      + 'IFS HRES IST und deshalb nach V-PD-9 draußen bleibt. Die perturbed-Member sind PD-B8.',
    hasProfile: false,
    profileLevels: null,
    /** Der gewählte Zeitraster, fürs Manifest (bei CH1 gröber als die Stufe). */
    stepH: cfg.stepH,
  };
}
