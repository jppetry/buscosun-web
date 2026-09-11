/**
 * dwdEps.mjs — Zugriffsfamilie 7: DWD-**Ensembles**, gebündelt auf dem
 * ikosaedrischen Gitter (`audit/punktdaten-versorgung.md` §43, Etappe PD-B8).
 *
 * ICON-D2-EPS (Stufe 1), ICON-EU-EPS (Stufe 2), ICON-EPS global (Stufe 3). Sie
 * füllen die Ebenen `<var>_sd_ens` und `ensCount`, die seit Schema 2 (PD-B2) einen
 * Ort haben und bis heute **durchgehend MISSING** waren.
 *
 * ── Alles am Objekt gemessen (2026-09-10/11) ───────────────────────────────────
 *
 * **Eine Datei = alle Member.** Je (Größe, Schritt) liegt EINE `.grib2.bz2`, die
 * die Member als aufeinanderfolgende GRIB-Nachrichten enthält — bei ICON-D2-EPS
 * nachgezählt **20 Nachrichten à 542 040 Zellen**. Gelesen wird deshalb mit
 * `decodeGrib2All`, nicht mit `decodeGrib2`.
 *
 * ⚠ **Das ist zugleich die Kostenfalle:** weil die Datei gebündelt UND bz2-gepackt
 * ist, lässt sich **keine Teilmenge der Member** holen. Ein Byte-Bereich hilft
 * nicht; entweder alle 20 (bzw. 40) oder keiner. Gemessen je (Größe, Schritt):
 *
 *     ICON-D2-EPS     13,4 MiB   20 Member
 *     ICON-EU-EPS      9,1 MiB   40 Member
 *     ICON-EPS global 34,8 MiB   40 Member
 *
 * Daraus folgt das **grobe Zeitraster** (Jans Vorgabe für PD-B, mit Zahlen
 * dahinter): stündlich wäre Stufe 1 allein über 5 GiB je Lauf. Die Raster stehen
 * unten je Modell und sind über Umgebungsvariablen verstellbar.
 *
 * **Parameter je Modell, am Verzeichnis ausgezählt** — die drei Ensembles führen
 * NICHT dasselbe:
 *   ICON-D2-EPS      t_2m td_2m u_10m v_10m vmax_10m tot_prec clct clcl clcm clch ps
 *   ICON-EU-EPS      t_2m u_10m v_10m vmax_10m tot_prec clct ps      (KEIN td_2m)
 *   ICON-EPS global  t_2m td_2m u_10m v_10m vmax_10m tot_prec clct ps
 * **Keines führt `snowlmt`** — die σ_ens-Ebene dafür kommt allein von ICON-CH
 * (PD-B6), und genau deshalb gibt es sie seit Schema 3.
 *
 * ── ⚠ Die Einheit einer Streuung ist NICHT die Einheit eines Werts ────────────
 * `convert()` rechnet `wert · factor + offset`. Auf eine **Standardabweichung**
 * angewandt wäre das ein stiller Totalschaden: `KELVIN_TO_C` hat
 * `offset: −273,15`, und eine Streuung von 1,2 K stünde damit als **−271,95**
 * im Cube — im erlaubten Wertebereich, also ohne jede Fehlermeldung. Eine
 * Streuung wird deshalb **nur mit dem Faktor** skaliert, nie mit dem Versatz.
 *
 * ── Was diese Quellen NICHT tun ───────────────────────────────────────────────
 * Sie tragen **nichts zum Mittel bei** (`vars: []`). Das Ensemble-Mittel von
 * ICON-D2-EPS ist derselbe Modelllauf wie ICON-D2, den der Cube schon ingestiert;
 * als zweiter „unabhängiger" Wert ließe es `σ_div` schrumpfen — dieselbe
 * Begründung wie bei den ECMWF-Kontrollläufen (V-PD-9) und bei C-LAEF-EPS
 * (PD-B7). Jans Entscheidung vom 2026-09-11 ausdrücklich: nur `σ_ens` + `ensCount`.
 */

import {
  fetchBytes, headOk, pad3, runIdBack, buildUnstructuredIndex,
  sampleUnstructuredToTier, KELVIN_TO_C, PA_TO_HPA, fetchGribField,
} from './shared.mjs';
import { decodeGrib2All } from '../../../src/sources/gribDecode.ts';
import { memberSpread } from './ensembleStats.mjs';

const DWD = process.env.DWD_OPENDATA || 'https://opendata.dwd.de/weather/nwp';

/**
 * Nur der FAKTOR, nie der Versatz — s. Kopf. Eine Größe ohne Eintrag bleibt
 * unskaliert (Wind, Bewölkung, Niederschlag stehen schon in der Zieleinheit).
 */
const SD_FACTOR = {
  t2m: KELVIN_TO_C.factor, td2m: KELVIN_TO_C.factor, ps: PA_TO_HPA.factor,
};

const MODELS = {
  icon_d2_eps: {
    base: `${DWD}/icon-d2-eps/grib`,
    // ⚠ Nur ICON-D2-EPS trägt das `_2d_`-Infix — am Verzeichnis für sieben
    // Parameter einzeln geprüft, nicht von ICON-D2 übernommen.
    file: (run, step, p) =>
      `icon-d2-eps_germany_icosahedral_single-level_${run}_${pad3(step)}_2d_${p}.grib2.bz2`,
    // ⚠ Die Koordinatendatei folgt NICHT dem Muster der Feld-Dateien und ist bei
    // allen drei Modellen verschieden — am Verzeichnis geholt, nicht abgeleitet.
    coordFile: (run, p) =>
      `icon-d2-eps_germany_icosahedral_time-invariant_${run}_000_0_${p}.grib2.bz2`,
    runSlotH: 3,
    members: 20,
    /** Gemessen 13,4 MiB je (Größe, Schritt) ⇒ sechsstündlich. */
    stepH: Number(process.env.POINT_ENS_STEP_T1 || 6),
    params: {
      t2m: 't_2m', u10: 'u_10m', v10: 'v_10m', gust: 'vmax_10m', precip: 'tot_prec',
    },
  },
  icon_eu_eps: {
    base: `${DWD}/icon-eu-eps/grib`,
    file: (run, step, p) =>
      `icon-eu-eps_europe_icosahedral_single-level_${run}_${pad3(step)}_${p}.grib2.bz2`,
    coordFile: (run, p) =>
      `icon-eu-eps_europe_icosahedral_time-invariant_${run}_${p}.grib2.bz2`,
    runSlotH: 6,
    members: 40,
    /** 9,1 MiB je (Größe, Schritt) ⇒ zwölfstündlich. */
    stepH: Number(process.env.POINT_ENS_STEP_T2 || 12),
    params: {
      t2m: 't_2m', u10: 'u_10m', v10: 'v_10m', gust: 'vmax_10m', precip: 'tot_prec',
    },
  },
  icon_eps_global: {
    base: `${DWD}/icon-eps/grib`,
    file: (run, step, p) =>
      `icon-eps_global_icosahedral_single-level_${run}_${pad3(step)}_${p}.grib2.bz2`,
    coordFile: (run, p) =>
      `icon-eps_global_icosahedral_time-invariant_${run}_${p}.grib2.bz2`,
    runSlotH: 6,
    members: 40,
    /** 34,8 MiB je (Größe, Schritt) — die teuerste der drei ⇒ 24-stündlich und
     *  nur die zwei Größen, für die PAP 6 in der Fernstufe überhaupt etwas tun
     *  kann. Genau hier fehlt heute JEDE Unsicherheitsinformation (§33.4). */
    stepH: Number(process.env.POINT_ENS_STEP_T3 || 24),
    params: { t2m: 't_2m', precip: 'tot_prec' },
  },
};

/** Wie bei den anderen DWD-Quellen: Niederschlag kommt als Summe seit Laufbeginn. */
const EPS_ACCUMULATED = new Set(['precip']);

/** Nachbarindex je (Modell, Stufe) — jedes EPS hat sein EIGENES Gitter. */
const indexCache = new Map();

export function makeDwdEpsAdapter(id) {
  const m = MODELS[id];
  if (!m) throw new Error(`dwdEps: unbekanntes Modell ${id}`);

  const url = (run, step, p) => `${m.base}/${run.slice(8, 10)}/${p}/${m.file(run, step, p)}`;
  const coordUrl = (run, p) => `${m.base}/${run.slice(8, 10)}/${p}/${m.coordFile(run, p)}`;

  /** clat/clon dieses Ensembles. Jedes Modell hat ein eigenes Gitter — den Index
   *  von ICON global zu leihen (wie AICON es darf) wäre hier falsch. */
  async function indexFor(run, tier) {
    const key = `${id}|${tier.id}`;
    if (indexCache.has(key)) return indexCache.get(key);
    const p = (async () => {
      const [la, lo] = await Promise.all([
        fetchGribField(coordUrl(run, 'clat')), fetchGribField(coordUrl(run, 'clon')),
      ]);
      if (!la || !lo) return null;
      return buildUnstructuredIndex(la.values, lo.values, tier);
    })();
    indexCache.set(key, p);
    return p;
  }

  /** Die Vorhersagestunden, die dieses Ensemble in dieser Stufe anbietet. */
  const ownSteps = (tier) => {
    const step = Math.max(tier.stepH, m.stepH);
    return tier.leadHours.filter((h) => h % step === 0);
  };

  /**
   * Alle Member einer Datei, auf die Stufe abgetastet und nach ihrer NUMMER
   * geordnet (Oktett 36, seit PD-B10 im Decoder).
   *
   * ⚠ Nicht jede Nachricht ist ein Member: ICON-D2-EPS veröffentlicht `tot_prec`
   * in VIERTELSTUNDEN — die Datei zum Schritt 006 enthält 80 Nachrichten =
   * 20 Member × vier Akkumulationen, die um +6:00, +6:15, +6:30 und +6:45 enden
   * (§43). Behalten wird die Fassung, die auf der vollen Stunde ENDET.
   * Nicht ueber die LAENGE filtern: `tot_prec` ist seit Laufbeginn akkumuliert (Spanne =
   * leadH × 60), `vmax_10m` das Maximum der Vorstunde (Spanne immer 60) — beide
   * enden auf der vollen Stunde. Ein Längenfilter hat in PD-B8 `gust_sd_ens` von
   * 119 auf 5 KiB schrumpfen lassen.
   */
  async function membersAt(run, step, p, idx, tier) {
    const raw = await fetchBytes(url(run, step, p), { decompress: true });
    if (!raw) return null;
    const all = decodeGrib2All(raw);
    const msgs = all.some((f) => f.intervalEndMinute != null)
      ? all.filter((f) => f.intervalEndMinute === 0)
      : all;
    if (msgs.length < 2) return null;            // eine Streuung aus einem Member gibt es nicht
    const members = new Map();
    let byOrder = 0;
    msgs.forEach((f, i) => {
      let key = f.perturbationNumber;
      if (key == null) { key = i + 1; byOrder++; }
      if (members.has(key)) throw new Error(`${id}: Member ${key} doppelt in ${p} @ ${step} h`);
      members.set(key, sampleUnstructuredToTier(f.values, idx, tier));
    });
    return { members, total: all.length, byOrder };
  }

  return {
    id,
    family: 'dwd-eps',
    accumulated: EPS_ACCUMULATED,
    /** ⚠ LEER mit Absicht — diese Quelle geht nicht ins Mittel (s. Kopf). */
    vars: [],
    /** Größen, für die sie eine gemessene Member-Streuung liefert. */
    ensembleVars: Object.keys(m.params),
    members: m.members,
    stepH: m.stepH,

    async discoverRun(leadMax, nowMs = Date.now(), maxBack = 12) {
      for (let back = 0; back < maxBack; back++) {
        const run = runIdBack(nowMs, m.runSlotH, back);
        if (await headOk(url(run, leadMax, m.params.t2m))) return run;
      }
      return null;
    },

    /**
     * Nur die Stunden des GROBEN Rasters werden überhaupt geprüft — eine Sonde je
     * Stufenstunde kostete hier mehr als die Daten, die sie freigibt.
     */
    async leadsFor(run, tier) {
      const got = [];
      for (const h of ownSteps(tier)) if (await headOk(url(run, h, m.params.t2m))) got.push(h);
      return got;
    },

    /**
     * Die Member-Streuung einer Größe.
     *
     * ⚠ Seit PD-B10 (§45.2) wird Niederschlag je Member ENTAKKUMULIERT. Bis dahin
     * stand hier die Streuung von `tot_prec` direkt — also der Summe seit
     * Laufbeginn — in einer Ebene, die die Rate über den Stufenschritt verspricht.
     * Gemessen an ICON-D2-EPS: in nassen Zellen das 2,5-fache (+6 h) bis
     * 3,7-fache (+48 h) des Richtigen, über alle Zellen bei +48 h 1,23 statt 0,04.
     *
     * Wo das Modell den Vorschritt nicht führt, gibt es KEINE Rate — und dann auch
     * keine Zahl. Am Verzeichnis gemessen: ICON-EU-EPS rechnet jenseits 72 h
     * 6-stündlich (Stufenschritt 3 h), ICON-EPS global ab 132 h 12-stündlich
     * (Stufenschritt 6 h). Eine Rate über einen längeren Zeitraum wäre glatter und
     * damit sicherer, als die Ebene es sagen darf.
     *
     * @param opts.dt  Stufenschritt in Stunden — Pflicht für Niederschlag.
     * @returns `{ sd, n, members, clamped }` oder `null`.
     */
    async ensemble(run, leadH, varId, tier, { dt } = {}) {
      const p = m.params[varId];
      if (!p) return null;
      const idx = await indexFor(run, tier);
      if (!idx) return null;
      const cells = tier.ny * tier.nx;
      const factor = SD_FACTOR[varId] ?? 1;
      if (!EPS_ACCUMULATED.has(varId)) {
        const cur = await membersAt(run, leadH, p, idx, tier);
        if (!cur) return null;
        const r = memberSpread(cur.members, null, { cells, factor });
        return { sd: r.sd, n: r.maxN, members: r.members, messagesTotal: cur.total, clamped: 0 };
      }
      // Stunde 0 hat keine Vorstunde — eine Rate „bis zum Laufbeginn" gibt es nicht.
      if (!(dt > 0) || leadH - dt < 0) return null;
      // Vorschritt ZUERST: fehlt er (ICON-EU-EPS jenseits 72 h, ICON-EPS global ab
      // 132 h), ist der Hauptschritt umsonst — 9 bzw. 35 MiB je Datei.
      const prev = await membersAt(run, leadH - dt, p, idx, tier);
      if (!prev) return null;
      const cur = await membersAt(run, leadH, p, idx, tier);
      if (!cur) return null;
      if (cur.byOrder || prev.byOrder) {
        throw new Error(`${id}: ${p} ohne Member-Nummer im GRIB — eine Paarung über die Reihenfolge `
          + 'wäre geraten (V-PD-25), deshalb keine Rate');
      }
      const r = memberSpread(cur.members, prev.members, { cells, dt, factor });
      return { sd: r.sd, n: r.maxN, members: r.members, messagesTotal: cur.total, clamped: r.clamped };
    },

    /** EPS-Quellen liefern keine eigene Orographie in den Cube. */
    async orography() { return null; },

    ensembleOnly: true,
    ensembleNote: `${m.members} Member, gebündelt in EINER Datei je (Größe, Schritt) — eine `
      + 'Teilmenge ist nicht abrufbar (bz2). Traegt NICHTS zum Mittel bei: das Ensemble-Mittel '
      + 'ist derselbe Modelllauf wie der schon ingestierte deterministische, und als zweiter '
      + '„unabhaengiger" Wert liesse es sigma_div schrumpfen (V-PD-9, wie bei den '
      + 'ECMWF-Kontrolllaeufen und C-LAEF-EPS). Streuungen werden NUR mit dem Faktor skaliert, '
      + 'nie mit dem Versatz — eine 1,2-K-Streuung mit KELVIN_TO_C stuende sonst als -271,95 '
      + 'im Cube, im erlaubten Wertebereich und ohne Fehlermeldung.',
    hasProfile: false,
    profileLevels: null,
  };
}
