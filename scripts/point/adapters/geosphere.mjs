/**
 * geosphere.mjs — C-LAEF AlpeAdria über die GeoSphere-Datenhub-API (PD-B4).
 *
 * Die **fünfte Zugriffsfamilie**: eine Fremd-REST-API statt eines GRIB-Verzeichnisses.
 * `QUELLENMATRIX.md` §1 führt C-LAEF als zugeordnete Quelle Österreichs in den Bändern
 * 3–33, 33–48 und 48–60 h — bis heute war die ganze AT-Spalte leer, und jeder Punkt in
 * Österreich wurde aus der deutschen versorgt (Audit §33.5).
 *
 * ── Alles hier ist am Objekt gemessen, nichts abgeschrieben ────────────────
 * Am 2026-09-09 gegen `/metadata` und gegen die `geojson`-Ausgabe derselben Zelle:
 *
 *   • Gitter: **regulär in lat/lon**, 656 × 889 Zellen im DACH-Schnitt,
 *     Δlat 0,009° / Δlon 0,0135° (≈ 1 km). `sampleRegularToTier` passt damit direkt —
 *     keine neue Abtastmathematik.
 *   • Container: **HDF5** (Magic `89 48 44 46`), gelesen mit `jsfive` — schon Abhängigkeit.
 *   • Horizont: `forecast_length: 61` ⇒ Stunden 0…60.
 *   • Läufe: **3-stündlich** (00/03/06/…/21), sechs vorgehalten (≈ 18 h). Die Registry
 *     nannte `[0, 6, 12, 18]` — das war falsch.
 *   • Latenz gemessen: um 19:55 UTC war der neueste Lauf **15:00**, also **≈ 4,9 h**.
 *   • Fenstergrenze: **10 Mio Datenpunkte je Anfrage** (HTTP 400 darüber) ⇒ bei 583 184
 *     Zellen höchstens **17** (Parameter × Schritt)-Kombinationen.
 *
 * ── ⚠ DREI verschiedene Skalen in DERSELBEN Datei ─────────────────────────
 * Die Felder sind `int16`, und **`jsfive` liest die Attribute nicht** (dieselbe Lage wie
 * bei INCA, s. `incaParse.ts`). Die Skala musste also gemessen werden — gegen die
 * `geojson`-Ausgabe, die echte Einheiten liefert, an derselben Zelle:
 *
 *   `2t`  roh 195   → 19,5 °C     ⇒ 0,1     `2r`  roh 7531 → 75,31 %  ⇒ 0,01
 *   `10u` roh 51    → 5,1 m/s     ⇒ 0,1     `tcc` roh 10000 → 100 %  ⇒ 0,01
 *   `tp`  roh 584   → 0,584 mm    ⇒ 0,001   `msl` roh 10158433 → 101584,33 Pa ⇒ 0,01
 *
 * Eine Skala für die ganze Datei zu setzen wäre der Fehler gewesen, der schon einmal
 * „3 597 % Bewölkung" erzeugt hat: mit 0,01 statt 0,1 stünde die Temperatur bei **1,95 °C
 * statt 19,5** — plausibel und falsch.
 *
 * ── ⚠ `tp` ist NICHT laufakkumuliert ───────────────────────────────────────
 * `/metadata` sagt „total precipitation amount **in the last forecast interval**", und das
 * Intervall ist eine Stunde. Anders als ICON und ECMWF liefert C-LAEF also bereits eine
 * Stundensumme. `accumulated` bleibt deshalb **leer** — würde der Producer hier
 * entakkumulieren, käme die Differenz zweier Stundensummen heraus, also Unsinn mit
 * Vorzeichenwechsel.
 *
 * ── ⚠ C-LAEF hat `msl`, NICHT `ps` ─────────────────────────────────────────
 * Der Parametersatz führt Bodendruck **nicht**. `msl` ist auf Meeresniveau reduziert;
 * in die `ps`-Ebene geschrieben stünden auf der Zugspitze 1013 statt 700 hPa — plausibel,
 * falsch, und in σ_div als 300-hPa-Quellenstreuung sichtbar. `ps` bleibt hier `MISSING`.
 *
 * Ebenso fehlen `clcl`/`clcm`/`clch` (nur `tcc`) und der **Taupunkt**: `td2m` wird aus
 * `2t` und `2r` gerechnet (Magnus) und im Manifest als abgeleitet ausgewiesen.
 */

import { File as H5File } from 'jsfive';
import { fetchBytes, sampleRegularToTier, runIdBack, pad2 } from './shared.mjs';

const HUB = process.env.GEOSPHERE_BASE || 'https://dataset.api.hub.geosphere.at/v1';

const MODELS = {
  claef: {
    dataset: 'grid/forecast/nwp-v2-1h-1km',
    runSlotH: 3,
    horizonH: 60,
    // Cube-Größe → API-Parameter UND die GEMESSENE Skala. Die Skala steht hier und
    // nirgends sonst; `verify:claef` prüft sie gegen die `geojson`-Ausgabe nach.
    params: {
      t2m:     { api: '2t',      scale: 0.1,   unit: 'degC' },
      u10:     { api: '10u',     scale: 0.1,   unit: 'm/s' },
      v10:     { api: '10v',     scale: 0.1,   unit: 'm/s' },
      gust:    { api: '10fg',    scale: 0.1,   unit: 'm/s' },
      precip:  { api: 'tp',      scale: 0.001, unit: 'mm/h' },
      clct:    { api: 'tcc',     scale: 0.01,  unit: 'pct' },
      snowlmt: { api: 'snowlmt', scale: 0.1,   unit: 'm' },
    },
    // Abgeleitet: braucht zwei API-Parameter und eine Formel.
    derived: {
      td2m: { from: ['2t', '2r'], scales: [0.1, 0.01], unit: 'degC' },
    },
    // Der Ausschnitt, den die API überhaupt hergibt (gemessen an `/metadata`); alles
    // darüber quittiert sie mit „Requested bounding box is outside of dataset bounds".
    domain: { latMin: 43.002, latMax: 51.498, lonMin: 5.0317, lonMax: 22.568 },
  },

  // ── C-LAEF-EPS: eine QUANTIL-Quelle, keine Mittelwert-Quelle (PD-B7) ──────
  //
  // Am Katalog gemessen (2026-09-10): 42 Felder = 14 Parameter x p10/p50/p90,
  // gleiches Gitter, gleicher Horizont (61 Schritte = 0…60 h) wie der
  // deterministische Lauf, Laeufe **3-stuendlich** (die Registry sagte
  // [0,6,12,18] — dieselbe Korrektur wie bei C-LAEF in §37), Vorhalt 4 Reftimes
  // ≈ 12 h. Einzelmember gibt es NICHT (⚠³).
  //
  // ⚠ Diese Quelle traegt NICHTS zum Mittel bei, und das ist Absicht: ihr p50
  // ist derselbe Modelllauf wie `claef`, den der Cube schon ingestiert. Als
  // zweiter „unabhaengiger" Wert wuerde sie σ_div schrumpfen lassen — exakt der
  // Grund von V-PD-9 bei den ECMWF-Kontrolllaeufen. `vars: []` sorgt dafuer,
  // dass die Mittelungsschleife sie gar nicht erst anfasst.
  claef_eps: {
    dataset: 'grid/forecast/ensemble-v2-1h-1km',
    runSlotH: 3,
    horizonH: 60,
    params: {},
    derived: {},
    // Skalen EINZELN am Objekt gemessen (netcdf-int16 gegen die geojson-Ausgabe
    // DERSELBEN Zelle) — jsfive liest die Attribute nicht, und §37 hat gezeigt,
    // dass in derselben Datei mehrere Skalen stehen koennen.
    //   2t/10u/10v/10fg/snowlmt 0,1 · tcc 0,01 · tp 0,001
    // `tp` war an einer trockenen Zelle nicht bestimmbar (beide Quantile 0) und
    // wurde deshalb an einer NASSEN gemessen: Innsbruck +6 h, 0,619 mm ← 619.
    quantileParams: {
      t2m:     { api: '2t',      scale: 0.1,   unit: 'degC' },
      u10:     { api: '10u',     scale: 0.1,   unit: 'm/s' },
      v10:     { api: '10v',     scale: 0.1,   unit: 'm/s' },
      gust:    { api: '10fg',    scale: 0.1,   unit: 'm/s' },
      precip:  { api: 'tp',      scale: 0.001, unit: 'mm/h' },
      clct:    { api: 'tcc',     scale: 0.01,  unit: 'pct' },
      snowlmt: { api: 'snowlmt', scale: 0.1,   unit: 'm' },
    },
    // ⚠ Bewusst NICHT dabei, mit Grund:
    //   td2m — waere aus 2t und 2r abzuleiten. Fuer den Median geht das (so macht
    //          es `claef`), fuer ein QUANTIL nicht: das q10 des Taupunkts ist
    //          nicht Magnus(q10 der Temperatur, q10 der Feuchte). Ein abgeleitetes
    //          Quantil ist keins.
    //   ps    — der Datensatz fuehrt nur `msl` (auf Meeresniveau reduziert), wie
    //          der deterministische Lauf. Auf der Zugspitze stuenden 1013 statt
    //          700 hPa.
    //   clcl/clcm/clch — fuehrt der Datensatz gar nicht.
    domain: { latMin: 43.002, latMax: 51.498, lonMin: 5.0317, lonMax: 22.568 },
  },
};

/**
 * Größen, die physikalisch nicht negativ werden können. Deklariert, nicht am
 * Wertebereich erraten: `t2m`, `u10` und `v10` dürfen es sehr wohl.
 */
const NON_NEGATIVE = new Set(['precip', 'clct', 'gust', 'snowlmt']);

/** Höchstens so viele (Parameter × Schritt) je Anfrage — s. die 10-Mio-Grenze im Kopf. */
const MAX_COMBOS = 16;
/** Punkte je Anfrage, ab denen die API mit HTTP 400 abbricht. */
export const GEOSPHERE_POINT_LIMIT = 10_000_000;

/**
 * Magnus-Formel: Taupunkt aus Temperatur und relativer Feuchte.
 * Koeffizienten nach WMO (über Wasser). Steht hier, weil C-LAEF keinen Taupunkt führt.
 */
export function dewPointFromRh(tC, rhPct) {
  if (!Number.isFinite(tC) || !Number.isFinite(rhPct)) return NaN;
  const rh = Math.min(100, Math.max(0.1, rhPct));
  const a = 17.62, b = 243.12;
  const g = Math.log(rh / 100) + (a * tC) / (b + tC);
  return (b * g) / (a - g);
}

/**
 * jsfive-Daten → Typed Array der passenden Breite.
 *
 * ⚠ Gemessen in PD-B10 (§45.12): jsfive legt gechunkte Datensätze als GEWÖHNLICHES
 * JavaScript-Array an (`new Array(data_size)`). Ein C-LAEF-Fenster (16 Stunden × ~593 000
 * Zellen) kostete damit **~72 MiB lebendigen V8-Heap** — nicht die ~19 MiB (so angenommen; gemessen waren es 72 MiB im Heap — s. toTyped, PD-B10), mit denen
 * die Obergrenze aus §43.11 gerechnet war. Bei 26 Fenstern waren bis zu ~1,9 GB Heap
 * zugelassen, und in Stufe 1 stand der Heap bei 3 486 von 4 144 MiB. Als `Int16Array`
 * sind es 2 Byte je Wert, und der Speicher liegt außerhalb des Heaps.
 *
 * Unbekannter Typ ⇒ ganzzahlig im int16-Bereich prüfen, sonst `Float64Array` — die
 * ist für jede JavaScript-Zahl verlustfrei. Geschätzt wird hier nichts.
 */
export function toTyped(arr, dtype) {
  const dt = String(dtype ?? '');
  if (/i2$/.test(dt)) return Int16Array.from(arr);
  if (/u2$/.test(dt)) return Uint16Array.from(arr);
  if (/i4$/.test(dt)) return Int32Array.from(arr);
  if (/f4$/.test(dt)) return Float32Array.from(arr);
  if (/f8$/.test(dt)) return Float64Array.from(arr);
  for (let k = 0; k < arr.length; k++) {
    const v = arr[k];
    if (!Number.isInteger(v) || v < -32768 || v > 32767) return Float64Array.from(arr);
  }
  return Int16Array.from(arr);
}

export function makeGeosphereAdapter(id) {
  const m = MODELS[id];
  if (!m) throw new Error(`geosphere: kein Modell ${id}`);

  const metaCache = { at: 0, reftimes: null };
  // ⚠ **Gedeckelt, und das ist kein Feinschliff, sondern ein Blocker-Fix (PD-B8).**
  //
  // Ein Fenster haelt 16 Stunden x ~593 000 Zellen als typisiertes Array — gemessen
  // rund **19 MiB (so angenommen; gemessen waren es 72 MiB im Heap — s. toTyped, PD-B10) je (Parameter, Fenster)**. Der Producer laeuft Schritt fuer Schritt
  // und fragt in JEDEM Schritt alle Groessen, also sind waehrend eines
  // 16-Stunden-Blocks alle Parameter gleichzeitig lebendig: mit `claef` (8) und
  // `claef_eps` (14 Quantil-Parameter) sind das 22 Fenster ≈ 420 MiB — und ohne
  // Deckel blieben sie fuer JEDEN weiteren Block liegen.
  //
  // Am vollen Dreistufenlauf gemessen: der Producer starb bei **4 GB** mit
  // „allocation failure" (V8 Mark-Compact), mitten in Stufe 1 — und die Shell
  // meldete Exit 0, weil `grep` am Ende der Pipeline den Status setzt. Auf einem
  // GitHub-Runner gilt dieselbe Heap-Grenze.
  //
  // Der Deckel liegt bewusst ueber der Zahl gleichzeitig gebrauchter Fenster (22),
  // damit der haeufigste Zugriff ein Treffer bleibt; aelteste zuerst raus.
  const WIN_CACHE_MAX = Number(process.env.GEOSPHERE_WIN_CACHE || 26);
  const winCache = new Map();   // `${run}#${apiParam}#${winStart}` → Fensterobjekt
  const winPut = (key, val) => {
    winCache.set(key, val);
    while (winCache.size > WIN_CACHE_MAX) {
      const oldest = winCache.keys().next().value;
      winCache.delete(oldest);
    }
  };

  /** Die verfügbaren Läufe — aus der API, nicht aus dem Kalender geraten. */
  async function reftimes() {
    if (metaCache.reftimes && Date.now() - metaCache.at < 300_000) return metaCache.reftimes;
    const raw = await fetchBytes(`${HUB}/${m.dataset}/metadata`);
    if (!raw) return metaCache.reftimes ?? [];
    const md = JSON.parse(new TextDecoder().decode(raw));
    // ISO → Laufkennung `YYYYMMDDHH`, absteigend (jüngster zuerst).
    metaCache.reftimes = (md.available_forecast_reftimes ?? [])
      .map((t) => t.replace(/[-:]/g, '').slice(0, 11).replace('T', ''))
      .sort().reverse();
    metaCache.at = Date.now();
    return metaCache.reftimes;
  }

  /** Der Ausschnitt, den wir anfragen: Stufengitter ∩ API-Domäne, mit etwas Rand. */
  function bboxFor(tier) {
    const latMin = Math.max(tier.lat0, m.domain.latMin + 0.01);
    const latMax = Math.min(tier.lat0 + (tier.ny - 1) * tier.deg, m.domain.latMax - 0.01);
    const lonMin = Math.max(tier.lon0, m.domain.lonMin + 0.01);
    const lonMax = Math.min(tier.lon0 + (tier.nx - 1) * tier.deg, m.domain.lonMax - 0.01);
    if (latMin >= latMax || lonMin >= lonMax) return null;
    return `${latMin.toFixed(3)},${lonMin.toFixed(3)},${latMax.toFixed(3)},${lonMax.toFixed(3)}`;
  }

  const runMs = (run) => Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10));
  const isoOf = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:00`;
  };

  /**
   * Ein Fenster laden: EIN Parameter, bis zu `MAX_COMBOS` aufeinanderfolgende Stunden.
   *
   * Die API nimmt **absolute Zeiten**, keine Vorhersagestunden — was hier ein Vorteil
   * ist: die Gültigzeit steht damit direkt in der Anfrage und kann nicht verrutschen.
   */
  // PD-F2a: der LRU haelt PROMISES, nicht Werte. Unter Nebenlaeufigkeit (Bahnen je Quelle,
  // F2b) fragten sonst `claef` und `claef_eps` dasselbe Fenster gleichzeitig an, bevor der
  // erste `winPut` kam — zweimal 19 MiB netCDF laden und zweimal jsfive entpacken, und der
  // Deckel `WIN_CACHE_MAX` (§43.11) zaehlte nur eines davon. Ein abgelehnter Promise faellt
  // aus dem Cache, damit ein Netzfehler nicht klebt.
  function window_(run, apiParam, winStart, tier) {
    const key = `${run}#${apiParam}#${winStart}`;
    if (winCache.has(key)) { const v = winCache.get(key); winCache.delete(key); winCache.set(key, v); return v; }
    const p = loadWindow(run, apiParam, winStart, tier, key);
    winPut(key, p);
    p.catch(() => { if (winCache.get(key) === p) winCache.delete(key); });
    return p;
  }
  async function loadWindow(run, apiParam, winStart, tier, key) {
    void key;
    const bbox = bboxFor(tier);
    if (!bbox) return null;
    const last = Math.min(winStart + MAX_COMBOS - 1, m.horizonH);
    const base = runMs(run);
    const url = `${HUB}/${m.dataset}?parameters=${apiParam}`
      + `&start=${isoOf(base + winStart * 3_600_000)}`
      + `&end=${isoOf(base + last * 3_600_000)}`
      + `&bbox=${bbox}&output_format=netcdf`;
    const raw = await fetchBytes(url);
    if (!raw) return null;

    let win = null;
    try {
      const f = new H5File(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), 'claef.nc');
      const d = f.get(apiParam);
      const [nt, nj, ni] = d.shape;
      // `d.value` ist in jsfive ein GETTER, der bei jedem Zugriff neu entpackt — bis
      // PD-B10 wurde jedes Fenster deshalb zweimal dekomprimiert. Einmal lesen.
      const data = d.value;
      if (!nt || !data?.length) throw new Error('leere Zeitachse');
      const lat = f.get('lat').value, lon = f.get('lon').value;
      const lead = Array.from(f.get('leadtime').value).map((x) => Math.round(x));
      win = {
        nt, nj, ni, values: toTyped(data, d.dtype), lead,
        lat1: lat[0], lon1: lon[0],
        dj: nj > 1 ? lat[1] - lat[0] : 0.009,
        di: ni > 1 ? lon[1] - lon[0] : 0.0135,
      };
    } catch (e) {
      // Ein Fenster, das sich nicht lesen laesst, ist ein benannter Ausfall — nicht ein
      // stiller Nullwert. Der Producer traegt die Stunde dann einfach nicht bei.
      console.warn(`  ${id}: Fenster ${apiParam}@${run}+${winStart} unlesbar (${e.message})`);
      win = null;
    }
    return win;
  }

  /** Ein Feld aus dem Fenster holen, entskalieren und auf das Stufengitter legen. */
  async function rawField(run, leadH, apiParam, scale, tier, nonNegative = false) {
    if (leadH < 0 || leadH > m.horizonH) return null;
    const winStart = Math.floor(leadH / MAX_COMBOS) * MAX_COMBOS;
    const win = await window_(run, apiParam, winStart, tier);
    if (!win) return null;
    const t = win.lead.indexOf(leadH);
    if (t < 0) return null;
    const n = win.nj * win.ni;
    const vals = new Float32Array(n);
    const src = win.values;
    const off = t * n;
    for (let k = 0; k < n; k++) {
      const raw = src[off + k];
      // int16-Fuellwerte der API.
      //
      // ⚠ **-1000 ist am Objekt DAZUGEKOMMEN (PD-B7).** Die erste Liste war geraten;
      // gemessen liefert die API fuer `tp` bei Lead 0 den Rohwert **-1000**, und ihre
      // eigene geojson-Ausgabe sagt an derselben Zelle **`null`** (bei Lead 1 dagegen
      // `0`). Der Grund ist die Semantik: `tp` ist die Menge „in the last forecast
      // interval“, und vor Stunde 0 gibt es kein Intervall — genau wie bei ICON, wo
      // die Stunde 0 gar keinen Niederschlag fuehrt (§33.3).
      //
      // Ungefiltert stand dadurch **-1,000 mm** im Cube: 28 920 Zellen im
      // DETERMINISTISCHEN C-LAEF (Altfehler seit PD-B4) und 29 161 je Quantil-Ebene,
      // ausnahmslos bei Stunde 0. Ein negativer Niederschlag ist keine Vorhersage.
      const isFill = raw === -32768 || raw === -32767 || raw === -9999 || raw === -1000;
      const v = isFill ? NaN : raw * scale;
      // Zweiter Wall, unabhaengig von der Fuellwert-Liste: Groessen, die physikalisch
      // nicht negativ werden koennen, sind es auch nicht in den Daten. Faengt jeden
      // WEITEREN undokumentierten Fuellwert, ohne dass ihn erst jemand messen muss.
      vals[k] = (nonNegative && v < 0) ? NaN : v;
    }
    // `scanMode 0x40` = lat waechst mit dem Index; bei C-LAEF gemessen (45,504 → 51,399).
    return sampleRegularToTier(
      { ni: win.ni, nj: win.nj, lat1: win.lat1, lon1: win.lon1, di: win.di, dj: win.dj, scanMode: 0x40, values: vals },
      tier,
    );
  }

  return {
    id,
    family: 'geosphere-grid',
    // ⚠ LEER, mit Absicht: `tp` ist bei C-LAEF bereits die Stundensumme (s. Kopf).
    accumulated: new Set(),
    vars: [...Object.keys(m.params), ...Object.keys(m.derived)],
    /** Groessen, fuer die diese Quelle gemessene Quantile liefert (PD-B7). */
    quantileVars: Object.keys(m.quantileParams ?? {}),

    /**
     * ⚠ V-PD-47: Diese API kennt KEINE Referenzzeit. Die Anfrage nennt nur `start`/`end`,
     * also die Gueltigzeit — der Server antwortet stets aus seinem neuesten Lauf.
     * Am 2026-09-12 gemessen (Wien, 2t, gleiche Gueltigzeit): `forecast_reference_time`,
     * `reftime` und `forecast_reftime` werden alle mit HTTP 200 angenommen und STILL
     * ignoriert (identischer Wert 17,8 °C), und die Antwort nennt selbst
     * `reference_time: 2026-09-12T09:00` — den neuesten Lauf, nicht den gefragten.
     * Dieselbe Falle wie beim STAC-Katalog (§41.3).
     *
     * Folge fuer das Produkt: die Werte liegen ZEITLICH richtig (die Achse kommt aus der
     * Gueltigzeit), aber `runAt` ist die Wahl des Producers und nicht die Herkunft der
     * Bytes. Im Normalbetrieb faellt das kaum ins Gewicht (gebaut wird 1–4 h nach dem
     * Lauf); bei einem NACHGEHOLTEN Lauf sind es die frischeren Daten unter dem aelteren
     * Etikett. Der Producer schreibt das je Quelle als `runCaveat` ins Manifest, statt es
     * zu verschweigen.
     */
    noReferenceTime: true,

    async discoverRun(leadMax, nowMs = Date.now(), maxBack = 8) {
      if (leadMax > m.horizonH) return null;          // reicht nie so weit
      const rts = await reftimes();
      if (!rts.length) return null;
      // Der jüngste verfügbare Lauf, der die Stunde noch trägt — die Liste kommt von der
      // API, es wird also nichts geraten. `maxBack` begrenzt, wie weit zurück gesucht wird.
      const newest = runIdBack(nowMs, m.runSlotH, 0);
      return rts.find((r, i) => i < maxBack && r <= newest) ?? rts[0] ?? null;
    },

    async leadsFor(run, tier) {
      // Kein Netz nötig: der Horizont ist eine Eigenschaft des Datensatzes (`/metadata`),
      // und die Stundenachse ist lückenlos stündlich — beides gemessen.
      return tier.leadHours.filter((h) => h >= 0 && h <= m.horizonH);
    },

    async field(run, leadH, varId, tier) {
      const p = m.params[varId];
      if (p) return rawField(run, leadH, p.api, p.scale, tier, NON_NEGATIVE.has(varId));

      const d = m.derived[varId];
      if (!d) return null;
      // Taupunkt aus 2t und 2r — beide Felder auf DEMSELBEN Gitter, also Zelle für Zelle.
      const [aName, bName] = d.from;
      const [aScale, bScale] = d.scales;
      const A = await rawField(run, leadH, aName, aScale, tier);
      const B = await rawField(run, leadH, bName, bScale, tier);
      if (!A || !B) return null;
      const out = new Float32Array(A.length);
      for (let k = 0; k < A.length; k++) out[k] = dewPointFromRh(A[k], B[k]);
      return out;
    },

    // Die API liefert **keine** Modellorographie. `null` heisst hier „gibt es nicht" —
    // `hModEff` mittelt dann über die Quellen, die eine haben. Eine erfundene Höhe waere
    // schlimmer, weil PAP 4 genau mit `h_true − h_mod_eff` rechnet.
    async orography() { return null; },

    /**
     * Die gemessenen Quantile einer Groesse (PD-B7). `null`, wenn diese Quelle
     * fuer die Groesse keine fuehrt — nie ein gerechnetes Ersatzquantil.
     */
    async quantiles(run, leadH, varId, tier) {
      const q = m.quantileParams?.[varId];
      if (!q) return null;
      const nn = NON_NEGATIVE.has(varId);
      const lo = await rawField(run, leadH, `${q.api}_p10`, q.scale, tier, nn);
      const hi = await rawField(run, leadH, `${q.api}_p90`, q.scale, tier, nn);
      if (!lo || !hi) return null;
      return { q10: lo, q90: hi };
    },

    /**
     * ⚠ Eine Quelle mit `vars: []` traegt zum Mittel nichts bei. Das Feld sagt es
     * ausdruecklich, damit im Manifest steht, dass es Absicht ist und nicht ein
     * vergessener Parametersatz.
     */
    quantilesOnly: Object.keys(m.params).length === 0,
    quantileNote: m.quantileParams
      ? 'Liefert nur P10/P50/P90, keine Member (⚠³). Der p50 ist derselbe Modelllauf wie '
        + 'claef, deshalb geht diese Quelle NICHT ins Mittel — sonst schrumpfte σ_div, '
        + 'genau wie bei den ECMWF-Kontrolllaeufen (V-PD-9). Die Quantile stehen als '
        + 'eigene Ebenen, weil (p90-p10)/2,563 Normalverteilung voraussetzt: an einer '
        + 'nassen Zelle gemessen p10 = 0,000 mm bei p90 = 0,619 mm — ein daraus '
        + 'gebildetes σ ergaebe negativen Niederschlag.'
      : null,
  };
}
