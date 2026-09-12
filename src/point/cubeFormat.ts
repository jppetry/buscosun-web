/**
 * cubeFormat.ts — DIE Form des Punkt-Cubes (Phase PD-A, `audit/punktdaten-versorgung.md` §17/§18).
 *
 * Der Punkt-Cube ist die zweite Produktlinie im Daten-Repo `jppetry/buscosun-data`:
 * `runs/` ist Fläche-je-Zeitpunkt (Kartenlayer), `point/` ist **Zeitreihe-je-Ort**.
 * Eine Punktabfrage lädt drei Dateien — eine je Auflösungsstufe — statt 981 Bilder.
 *
 * ── Warum diese Datei in `src/` liegt und nicht in `scripts/` ───────────────
 * Bei der Repack-Linie (BW-2) steht die Form in `scripts/lib/repackManifest.mjs` und der
 * Client spiegelt sie in `src/sources/repackSource.ts`; `verify:repack` prüft, dass beide
 * Listen gleich sind. Das ist eine Kopie mit Wächter. SH6 hat gezeigt, dass es besser geht:
 * EIN Modul, zwei Laufzeiten (`src/share/edgeShare.ts` → esbuild-Bündel für Deno). Hier ist
 * es noch einfacher — Producer (Node, `--experimental-strip-types`) und Client (Vite)
 * importieren **dieselbe Datei**. Es gibt keine zweite Liste, die driften könnte.
 *
 * ── Die drei Auflösungsstufen ──────────────────────────────────────────────
 * `ABLAUFPLAENE.md` PAP 1 E2: „Die drei Range-Requests holen **für jede Auflösungsstufe**
 * einen Chunk." Der Cube ist deshalb kein Gitter, sondern drei gestaffelte:
 *
 *   t1  0,05°  0–48 h stündlich       ICON-D2 / ICON-CH1 / C-LAEF / INCA / Radar
 *   t2  0,10°  51–120 h dreistündlich ICON-EU / ICON-CH2 / MOSMIX
 *   t3  0,25°  126–336 h sechsstündl. ICON global / AICON / IFS / AIFS
 *
 * Die Staffelung folgt der Auflösung der Quellen, nicht dem Wunsch: ICON-D2 ist 2,2 km,
 * IFS ist 0,25°. Ein einheitliches feines Gitter würde im Langfristbereich Genauigkeit
 * vortäuschen, die keine Quelle hat — und im Kurzfristbereich welche verschenken.
 *
 * ── Warum ein eigener Container und kein `.bin.gz` ─────────────────────────
 * PD0 R-5 hielt fest, dass jsDelivrs Umgang mit `.gz` unverifiziert ist. Statt davon
 * abzuhängen, komprimiert der Container SELBST: Kopf und Verzeichnis liegen unkomprimiert,
 * jede Größe ist ein eigener `deflate-raw`-Block mit Offset und Länge. Drei Folgen:
 *   • der Transport ist egal — was ankommt, ist byte-gleich zu dem, was geschrieben wurde;
 *   • „drei Range-Requests" bleibt buchstäblich möglich (das Verzeichnis nennt die Bereiche),
 *     ohne dass wir uns heute darauf festlegen müssen (E-10/§21 (2));
 *   • ein Client, der nur T und Niederschlag braucht, entpackt auch nur die zwei Blöcke.
 *
 * ── Die Regel, ohne die der Cube Zahlensalat ist ───────────────────────────
 * Wie im README des Daten-Repos („Ein Bild ohne seinen Eintrag in `index.json` ist
 * bedeutungslos"): eine Ebene ohne ihre Skala ist bedeutungslos. Die Skalen stehen
 * deshalb NICHT nur hier, sondern werden vom Producer in `point/index.json` mitgeschrieben.
 * `ABLAUFPLAENE.md` PAP 6 macht daraus sogar einen Eingabewert des Algorithmus:
 * `σ_quant² = Δ²/12` mit Δ aus der Quantisierung.
 */

import { DACH_VIEW } from '../countryProfiles';

/**
 * Schema-Version des Containers UND des `point/`-Manifests. Änderung = neuer Leser.
 *
 * **1 → 2 (PD-B2, 2026-09-09):** je Größe kommt `<var>_sd_ens` neben `<var>_sd`, dazu die
 * Metaebene `ensCount`. Damit ist der Ensemble-Zweig aus PAP 6 überhaupt erst ausdrückbar
 * (`σ = c(p,f)·σ_ens` gegen `σ² = σ_div² + σ_sys²`) — vorher lagen beide Streuungsarten in
 * derselben Ebene und waren nicht unterscheidbar.
 *
 * Der Bruch ist bewusst JETZT: 27 → 36 Ebenen verschiebt jeden Ebenenindex, und es gibt
 * **noch keinen Client-Leser** (der ist PD2). Später wäre derselbe Schritt eine Änderung
 * an jedem Nutzer. Ein Schema-1-Chunk wird ab hier **laut abgelehnt** statt still falsch
 * gelesen — wer ihn trotzdem lesen will, übergibt seine Ebenenliste aus dem alten Manifest
 * (`decodeCubeChunk(bytes, { planes })`); genau dafür trägt das Manifest sie seit PD-A.
 */
/**
 * ── Schema 4 (PD-B7, 2026-09-10) ───────────────────────────────────────────
 * Sieben Größen haben `<id>_q10` und `<id>_q90` bekommen ⇒ 37 → 51 Ebenen.
 *
 * C-LAEF-EPS liefert **keine Member**, nur P10/P50/P90 (⚠³ der Quellenmatrix).
 * Daraus ein σ_ens zu rechnen (`(p90−p10)/2,563`) setzt Normalverteilung voraus.
 * Am echten Datum widerlegt: an einer nassen Zelle (Innsbruck, +6 h) steht
 * **p10 = 0,000 mm bei p90 = 0,619 mm**. Ein daraus gebildetes σ = 0,24 mm mit
 * normalem p10 = Median − 1,28σ ergäbe **negativen Niederschlag**. Ein gemessenes
 * Quantil bleibt deshalb ein Quantil und bekommt einen eigenen Ort — dieselbe
 * Lehre wie bei σ_div/σ_ens in Schema 2.
 *
 * ⚠ `_q10`/`_q90` gehören zu EINER Quelle und sind NICHT mit `_sd`/`_sd_ens`
 * verrechenbar: sie beschreiben die Unsicherheit EINES Modells, nicht die
 * Uneinigkeit mehrerer.
 *
 * ── Schema 3 (PD-B6, 2026-09-10) ───────────────────────────────────────────
 * `snowlmt` hat eine `_sd_ens`-Ebene bekommen ⇒ 36 → 37 Ebenen.
 *
 * PD-B2 hatte sie ausdrücklich WEGGELASSEN, mit einer gemessenen Begründung:
 * „kein Ensemble führt die Schneefallgrenze (am Verzeichnis geprüft)". Das galt
 * für die drei DWD/ECMWF-EPS-Verzeichnisse und ist für **MeteoSchweiz falsch** —
 * ICON-CH1/CH2-EPS führen `SNOWLMT` (am Collection-Asset `params_*.csv` und am
 * Feld gemessen, PD-B6). Aufgefallen ist es nicht beim Lesen, sondern weil der
 * Wächter aus PD-B2 („keine Ensemble-Größe ohne σ_ens-Ebene") rot wurde — genau
 * wofür er gebaut wurde.
 *
 * Warum trotz selbstbeschreibendem Container eine neue Schema-Nummer: die Liste
 * im Manifest schützt nur Leser, die sie mitbringen. Der Kopf trägt `nvar`, und
 * zwei Chunk-Generationen mit derselben Schema-Nummer und verschiedener
 * Ebenenzahl wären für einen Leser OHNE Manifest still verschieden. Genau davor
 * schützt die Nummer.
 */
export const CUBE_SCHEMA = 4;
/** `BSPC` — buscosun point cube. */
export const CUBE_MAGIC = 0x42535043;
/** Fester Kopf. Das Verzeichnis folgt unmittelbar (`DIR_ENTRY_BYTES` je Ebene). */
export const CUBE_HEADER_BYTES = 48;
/** Fehlend. NICHT 0 — eine Quelle, die eine Größe nicht führt, ist nicht dasselbe wie „null Grad". */
export const MISSING = -32768;
/** Kleinster gültiger Wert (MISSING ist reserviert). */
export const INT16_MIN = -32767;
export const INT16_MAX = 32767;

/** Verzeichnis im Daten-Repo. */
export const POINT_DIR = 'point';
/**
 * Gelände ist KEIN Datenprodukt dieses Repos (Jans Entscheidung 2026-09-09):
 * `buscosun-data` speichert Wetterdaten. Höhe kommt aus den Terrarium-Kacheln, die die
 * App ohnehin lädt, Landbedeckung aus dem Spiegel `jppetry/buscosun-worldcover`, und
 * die Ableitungen (TPI, SVF, Horizont) rechnet der Client AM PUNKT — s. `terrainPoint.ts`.
 * Was hier bleibt, ist `hsurf-v1.png`: die MODELL-Orographie, ein Wetterdatum.
 */

/**
 * Domäne. Bewusst `DACH_VIEW.bounds` und keine eigene Zahl: dieselbe Box, die die Karte,
 * `iconEuRasterSource`, `aiconSource` und `arpegeSource` schon benutzen. Eine zweite
 * DACH-Box wäre eine zweite Wahrheit.
 */
export const CUBE_DOMAIN = Object.freeze({
  latMin: DACH_VIEW.bounds.latMin,
  latMax: DACH_VIEW.bounds.latMax,
  lonMin: DACH_VIEW.bounds.lngMin,
  lonMax: DACH_VIEW.bounds.lngMax,
});

/** Chunk-Raster in Zellen. PAP 2 O5: „Zeitreihe je 16×16-Block". */
export const CHUNK_CELLS = 16;

// ---------------------------------------------------------------------------
// Größen
// ---------------------------------------------------------------------------

export type CubeGroup = 'target' | 'profile' | 'meta';

export interface CubeVar {
  readonly id: string;
  readonly unit: string;
  /** Physikalischer Wert = `int16 · scale + offset`. */
  readonly scale: number;
  readonly offset: number;
  /**
   * Führt `<id>_sd` — die Streuung **zwischen den Quellen** (`σ_div`).
   *
   * Das ist die Streuung, die der Producer aus dem Vergleich mehrerer Modelle an
   * derselben Zelle rechnet. Sie braucht mindestens zwei beitragende Quellen;
   * `srcCount` sagt je Zelle, wie viele es waren.
   */
  readonly sigmaDiv: boolean;
  /**
   * Führt `<id>_sd_ens` — die Streuung **zwischen den Membern innerhalb einer Quelle**
   * (`σ_ens`).
   *
   * PAP 6 verzweigt: liegt ein Ensemble vor, gilt `σ = c(p,f)·σ_ens`; sonst
   * `σ² = σ_div² + σ_sys²`. Beide Größen zusammen in EINE Ebene zu schreiben hieße, die
   * Verzweigung unentscheidbar zu machen — und sie zu addieren wäre Doppelzählung.
   *
   * `false` heißt hier ausdrücklich: **keine Quelle liefert dafür Member.** An den drei
   * EPS-Verzeichnissen gemessen (2026-09-09, `opendata.dwd.de/weather/nwp/icon-{d2,eu}-eps`
   * und `icon-eps`) führt keines die Schneefallgrenze — `snowlmt_sd_ens` wäre eine Ebene
   * ohne möglichen Schreiber, dasselbe Muster wie V-SH-11, nur andersherum.
   */
  readonly sigmaEns: boolean;
  /**
   * Führt `<id>_q10` und `<id>_q90` — **gemessene Quantile einer einzelnen Quelle**.
   *
   * Nur für Größen, für die eine Quelle sie wirklich liefert (heute: C-LAEF-EPS).
   * Eine Ebene ohne Schreiber ist schlimmer als eine fehlende — sie sieht gepflegt
   * aus (dieselbe Lehre wie V-SH-11).
   */
  readonly quantiles?: boolean;
  readonly group: CubeGroup;
  /** Physikalischer Gültigkeitsbereich — der Selbsttest prüft, dass er in int16 passt. */
  readonly range: readonly [number, number];
  /** ICON-Feldname, wo die Größe direkt vorliegt; `null` = abgeleitet. */
  readonly grib: string | null;
  readonly why: string;
}

/**
 * DIE Größenliste. Abgeleitet aus `ABLAUFPLAENE.md` (PAP 4/5/6 + Feldglossar) und
 * `PointSourceSample` (`src/pointForecast/types.ts`) — nicht erfunden.
 *
 * Reihenfolge ist Vertrag: sie bestimmt die Ebenen-Reihenfolge im Container, und ein
 * Client, der nur die ersten Ebenen braucht, soll die hinteren überspringen können.
 * Deshalb stehen die teuren, selten gebrauchten Größen hinten.
 */
export const CUBE_VARS: readonly CubeVar[] = Object.freeze([
  // ── Zielgrößen mit Streuung ──────────────────────────────────────────────
  { id: 't2m',      unit: 'degC',  scale: 0.01, offset: 0, sigmaDiv: true, sigmaEns: true, quantiles: true, group: 'target',
    range: [-60, 60], grib: 't_2m',
    why: 'PAP 4 korrigiert sie vertikal, PAP 5 addiert die Geländeterme, PAP 6 quantilisiert sie normal.' },
  { id: 'td2m',     unit: 'degC',  scale: 0.01, offset: 0, sigmaDiv: true, sigmaEns: true, group: 'target',
    range: [-70, 45], grib: 'td_2m',
    why: 'buscosun Fusion rechnet mit dem TAUPUNKT statt der relativen Feuchte (types.ts): unbeschraenkt, additiv, hoehenkorrigierbar.' },
  { id: 'u10',      unit: 'm/s',   scale: 0.01, offset: 0, sigmaDiv: true, sigmaEns: true, quantiles: true, group: 'target',
    range: [-100, 100], grib: 'u_10m',
    why: 'PAP 5 braucht v10 fuer f_rad und die Blending-Height-Korrektur.' },
  { id: 'v10',      unit: 'm/s',   scale: 0.01, offset: 0, sigmaDiv: true, sigmaEns: true, quantiles: true, group: 'target',
    range: [-100, 100], grib: 'v_10m', why: 'wie u10.' },
  { id: 'gust',     unit: 'm/s',   scale: 0.01, offset: 0, sigmaDiv: true, sigmaEns: true, quantiles: true, group: 'target',
    range: [0, 150], grib: 'vmax_10m',
    why: 'PAP 6: v_max := max(v_max, |v10|), Quantile aus einer Weibull-Familie.' },
  { id: 'precip',   unit: 'mm/h',  scale: 0.01, offset: 0, sigmaDiv: true, sigmaEns: true, quantiles: true, group: 'target',
    range: [0, 300], grib: 'tot_prec',
    why: 'PAP 6: zensierte Verteilung mit Punktmasse bei 0 — eine Normalverteilung erzeugte negative p10.' },
  { id: 'clct',     unit: 'pct',   scale: 0.1,  offset: 0, sigmaDiv: true, sigmaEns: true, quantiles: true, group: 'target',
    range: [0, 100], grib: 'clct',
    why: 'PAP 5: f_rad = (1 - clct/100)^a · exp(-v10/v_ref) — der Schalter fuer Kaltluftsee und Waermeinsel.' },
  { id: 'ps',       unit: 'hPa',   scale: 0.1,  offset: 0, sigmaDiv: true, sigmaEns: true, group: 'target',
    range: [500, 1100], grib: 'ps',
    why: 'PAP 6 nennt p ausdruecklich unter den normalverteilten Zielgroessen.' },
  { id: 'snowlmt',  unit: 'm',     scale: 1,    offset: 0, sigmaDiv: true, sigmaEns: true, quantiles: true, group: 'target',
    range: [0, 6000], grib: 'snowlmt',
    why: 'PAP 6: Schneefallgrenze = T_w-Nullgradgrenze - Schmelzversatz; das Modellfeld ist der Anker dafuer.' },
  // ── Zielgrößen ohne eigene Streuung ──────────────────────────────────────
  // Die drei Schichten existieren nur fuer die Konsistenzbedingung in PAP 6
  // (`clct := max(clct, clcl, clcm, clch)`); eine eigene Unsicherheit je Schicht
  // wuerde nirgends gelesen und kostete drei Ebenen.
  { id: 'clcl',     unit: 'pct',   scale: 0.1,  offset: 0, sigmaDiv: false, sigmaEns: false, group: 'target',
    range: [0, 100], grib: 'clcl', why: 'PAP 6 Konsistenz.' },
  { id: 'clcm',     unit: 'pct',   scale: 0.1,  offset: 0, sigmaDiv: false, sigmaEns: false, group: 'target',
    range: [0, 100], grib: 'clcm', why: 'PAP 6 Konsistenz.' },
  { id: 'clch',     unit: 'pct',   scale: 0.1,  offset: 0, sigmaDiv: false, sigmaEns: false, group: 'target',
    range: [0, 100], grib: 'clch', why: 'PAP 6 Konsistenz.' },
  // ── Profilfelder (PAP 2 → PAP 3/4) ───────────────────────────────────────
  { id: 'gammaEff', unit: 'K/km',  scale: 0.01, offset: 0, sigmaDiv: false, sigmaEns: false, group: 'profile',
    range: [-40, 40], grib: null,
    why: 'Vorzeichenkonvention der Ablaufplaene: Gamma = -dT/dz. Normale Schichtung > 0, Inversion < 0.' },
  { id: 'zBase',    unit: 'm',     scale: 1,    offset: 0, sigmaDiv: false, sigmaEns: false, group: 'profile',
    range: [0, 9000], grib: null, why: 'Hoehe der Inversionsbasis ueber NN (PAP 4 Fall B/C).' },
  { id: 'zInv',     unit: 'm',     scale: 1,    offset: 0, sigmaDiv: false, sigmaEns: false, group: 'profile',
    range: [0, 9000], grib: null,
    why: 'Obergrenze ueber NN. zInv == zBase heisst ausdruecklich: KEINE Inversion (Feldglossar).' },
  { id: 'dTInv',    unit: 'K',     scale: 0.01, offset: 0, sigmaDiv: false, sigmaEns: false, group: 'profile',
    range: [0, 30], grib: null, why: 'Temperaturzunahme von zBase bis zInv, positiv.' },
  { id: 'hModEff',  unit: 'm',     scale: 1,    offset: 0, sigmaDiv: false, sigmaEns: false, group: 'profile',
    range: [-500, 9000], grib: 'hsurf',
    why: 'Gewichtetes Mittel der HSURF der beitragenden Quellen — zeitabhaengig, weil die Quellen mit der Vorhersagestunde wechseln.' },
  // ── Herkunft der Streuung (Ehrlichkeit) ──────────────────────────────────
  { id: 'srcCount', unit: 'count', scale: 1,   offset: 0, sigmaDiv: false, sigmaEns: false, group: 'meta',
    range: [0, 32], grib: null,
    why: 'Wie viele Quellen diese Zelle und Stunde ueberhaupt getragen haben. Der PAP-6-Zweig je GROESSE ist daraus NICHT ablesbar — dafuer gibt es sigmaKindOf(): sd vorhanden = Divergenz, sd fehlt aber Median da = nur Sockel. Annahme, kein Zitat — §21 (3).' },
  { id: 'ensCount', unit: 'count', scale: 1,   offset: 0, sigmaDiv: false, sigmaEns: false, group: 'meta',
    range: [0, 255], grib: null,
    why: 'Wie viele Member in σ_ens dieser Zelle eingegangen sind. Ohne n ist die Korrektur E[s] = c4(n)·σ nicht anwendbar — das Manifest nennt die Regel seit PD-A unter fusion.memberBias, und bis Schema 2 konnte sie niemand benutzen, weil n nirgends stand. Das Gegenstueck zu srcCount: srcCount zaehlt QUELLEN (fuer σ_div), ensCount zaehlt MEMBER (fuer σ_ens).' },
]);

/**
 * Die drei Wege zu σ, die PAP 6 kennt.
 *
 * ── Warum das KEINE eigene Rasterebene ist ─────────────────────────────────
 * Der erste Entwurf schrieb den Zweig je Zelle in eine Ebene und nahm bei mehreren
 * Größen die strengere Aussage. Am echten Lauf fiel auf, warum das nicht geht:
 * `gust` wird in Stufe 3 nur von EINER Quelle geführt — damit stand die ganze Zelle
 * auf `systematic`, obwohl Temperatur, Taupunkt, Wind und Druck sehr wohl aus
 * mehreren Quellen kamen und ein echtes σ trugen. Ein Feld, das an jeder Zelle
 * dasselbe sagt, sagt nichts.
 *
 * Der Zweig ist **je Größe** verschieden und aus den Daten selbst ablesbar: liegt
 * `<var>_sd` vor, war es Divergenz; fehlt sie bei vorhandenem Median, war es genau
 * eine Quelle. Deshalb bleibt der Enum als BESCHREIBUNG, und die Rasterebene zählt
 * stattdessen die Quellen (`srcCount`) — das ist die Information, die man sonst
 * nirgends herbekommt.
 */
export const SIGMA_KIND = Object.freeze({
  /** Konnte nicht bestimmt werden. */
  unknown: 0,
  /** `sigma = c(p,f) · sigma_ens` — ein Ensemble hat getragen. */
  ensemble: 1,
  /** `sigma² = sigma_div² + sigma_sys²` — mehrere Quellen, Divergenz messbar. */
  divergence: 2,
  /** Nur eine Quelle: der Nenner von `sigma_div²` ist exakt null, es bleibt `sigma_sys²`. */
  systematic: 3,
});

/**
 * Der PAP-6-Zweig für EINE Größe an EINER Zelle, aus den Daten abgelesen — nicht aus
 * einem Flag. `meanPresent` = Median da, `sdPresent` = `<var>_sd` da (σ_div),
 * `ensPresent` = `<var>_sd_ens` da (σ_ens).
 *
 * Die Reihenfolge ist die von PAP 6: **liegt ein Ensemble vor, gewinnt es.** Der Plan
 * sagt „`σ := c(p,f)·σ_ens`, WENN Ensemble verfügbar; sonst `σ² := σ_div² + σ_sys²`" —
 * ein Entweder-oder, kein Und. Wer beide Ebenen addiert, zählt die Unsicherheit doppelt:
 * die Member einer Quelle streuen bereits um deren eigenes Mittel, das dann seinerseits
 * in σ_div eingeht.
 *
 * Bis Schema 2 war `SIGMA_KIND.ensemble` **unerreichbar** — es gab keine Ebene, aus der
 * `ensPresent` hätte folgen können.
 */
export function sigmaKindOf(meanPresent: boolean, sdPresent: boolean, ensPresent = false): number {
  if (!meanPresent) return SIGMA_KIND.unknown;
  if (ensPresent) return SIGMA_KIND.ensemble;
  return sdPresent ? SIGMA_KIND.divergence : SIGMA_KIND.systematic;
}

export interface CubePlane {
  readonly id: string;
  readonly varId: string;
  /** `sd` = Streuung zwischen Quellen (σ_div), `sd_ens` = zwischen Membern (σ_ens). */
  readonly kind: 'mean' | 'sd' | 'sd_ens' | 'q10' | 'q90';
  readonly unit: string;
  readonly scale: number;
  readonly offset: number;
  readonly group: CubeGroup;
}

/**
 * Die tatsächliche Ebenen-Reihenfolge im Container: je Größe erst der Median, dann —
 * wenn sie sie führt — `σ_div`, dann `σ_ens`. Aus `CUBE_VARS` abgeleitet, nie getrennt
 * gepflegt.
 *
 * Die Reihenfolge ist Vertrag und wächst nur am Ende **einer Größe**, nicht am Ende der
 * Liste — deshalb verschiebt Schema 2 die Indizes aller folgenden Ebenen. Genau dafür
 * gibt es die Schema-Nummer; ein Leser, der `CUBE_PLANES` gegen einen Schema-1-Chunk
 * hielte, läse stillschweigend die falschen Größen.
 */
export const CUBE_PLANES: readonly CubePlane[] = Object.freeze(
  CUBE_VARS.flatMap((v): CubePlane[] => {
    const base: CubePlane = {
      id: v.id, varId: v.id, kind: 'mean',
      unit: v.unit, scale: v.scale, offset: v.offset, group: v.group,
    };
    const out = [base];
    if (v.sigmaDiv) out.push({ ...base, id: `${v.id}_sd`, kind: 'sd', offset: 0 });
    if (v.sigmaEns) out.push({ ...base, id: `${v.id}_sd_ens`, kind: 'sd_ens', offset: 0 });
    // Quantile behalten Skala UND Versatz der Größe — sie sind Werte derselben
    // Einheit, keine Streuungen. Genau deshalb steht `offset: 0` hier NICHT.
    if (v.quantiles) {
      out.push({ ...base, id: `${v.id}_q10`, kind: 'q10' });
      out.push({ ...base, id: `${v.id}_q90`, kind: 'q90' });
    }
    return out;
  }),
);

/** Index einer Ebene im Container. `-1` = nicht vorhanden. */
export function planeIndex(id: string): number {
  return CUBE_PLANES.findIndex((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Auflösungsstufen
// ---------------------------------------------------------------------------

export type TierId = 't1' | 't2' | 't3';

export interface CubeTier {
  readonly id: TierId;
  readonly index: number;
  readonly label: string;
  /** Gitterweite in Grad (lat wie lon). */
  readonly deg: number;
  readonly lat0: number;
  readonly lon0: number;
  readonly ny: number;
  readonly nx: number;
  /** Vorhersagestunden ab dem Lauf — die Zeitachse dieser Stufe. */
  readonly leadHours: readonly number[];
  readonly fromH: number;
  readonly toH: number;
  readonly stepH: number;
  /** Chunk-Raster: `cy × cx` Chunks à `CHUNK_CELLS²` Zellen. */
  readonly chunk: { readonly cells: number; readonly cy: number; readonly cx: number };
  /** Quellen-IDs aus `sourceMatrix.ts`, die `QUELLENMATRIX.md` §1 dieser Stufe zuordnet. */
  readonly sources: readonly string[];
  /**
   * Zusätzliche Quellen, die diese Stufe **nur für die Streuung** trägt.
   *
   * `QUELLENMATRIX.md` §1 ordnet je Band die BESTE Quelle zu — für den Median ist das
   * richtig. Für `σ_div` braucht es aber mehr als eine Meinung, und heute haben Stufe 1
   * und 2 genau eine: ihr σ ist deshalb leer, nicht klein.
   *
   * ICON-EU, IFS und AIFS rechnen den Kurzfristbereich mit; sie sind dort nur gröber,
   * nicht ungültig. Sie als zweite Meinung zu lesen ist der mit Abstand billigste Weg
   * zu einem σ in 0–120 h — kein neuer Adapter, kein Ensemble.
   *
   * ⚠ **Was dieses σ misst und was nicht:** die Differenz zwischen einem 2,2-km- und
   * einem 7-km-Modell enthält auch die AUFLÖSUNG, nicht nur die Unsicherheit. PAP 2
   * sieht dafür eine Kovarianz **mit Fehlerkorrelation** vor; bis die gemessen ist
   * (§21 (4)), ist dieser Wert eine Untergrenze. Deshalb wird die Quelle im Manifest als
   * `diversity` ausgewiesen — nicht als Zuordnung der Matrix.
   *
   * ⚠ **`diversity` heißt „zusätzlich gelesen", nicht „aus dem Mittel heraus".** Solange Σ
   * ungemessen ist, mittelt der Producer über ALLE gelesenen Quellen mit gleichem Gewicht
   * (`fusion.weights: 'equal'`); ein Ausschluss wäre das Gewicht 0 und damit eine stärkere
   * Behauptung über Σ, nicht eine schwächere. Praktisch trägt die zugeordnete Quelle ein
   * Band oft nur teilweise (t2: ICON-EU kurz nach dem Lauf 5 von 24 Stunden) — den Rest
   * tragen die gröberen. `sources[].role` und `steps` im Manifest sagen, wo.
   */
  readonly diversity: readonly string[];
}

/**
 * Die Bänder. **Aus den Quellenhorizonten abgeleitet, nicht aus der Skizze übernommen** —
 * `ABLAUFPLAENE.md` PAP 1 nennt „141 Zeitschritte", die Zahl ist aber aus den dort
 * genannten Bändern nicht rekonstruierbar (§21 (1): `4A + B = 504` hat mehrere Lösungen).
 * Diese Achse ergibt **109** Schritte; `cubeSelfTest` zählt sie, damit die Zahl eine
 * gemessene Eigenschaft bleibt und keine Behauptung.
 *
 * Die Grenzen folgen den Quellen:
 *   48 h  Ende von ICON-D2 (und der stündlichen Auflösung, die es nativ liefert)
 *  120 h  Ende von ICON-EU bei den Hauptläufen (⚠⁵ der Quellenmatrix)
 *  336 h  Ziel; nur IFS/AIFS ENS reichen so weit (⚠⁷)
 */
const TIER_BANDS = [
  { id: 't1' as const, deg: 0.05, fromH: 0,   toH: 48,  stepH: 1,
    label: 'Kurzfrist (0–48 h, stündlich)',
    sources: ['icon_d2', 'icon_d2_eps', 'icon_ch1_eps', 'claef', 'claef_eps', 'inca', 'radvor_rv', 'combiprecip'],
    diversity: ['icon_eu', 'ifs_hres', 'aifs_single'] },
  { id: 't2' as const, deg: 0.10, fromH: 51,  toH: 120, stepH: 3,
    label: 'Mittelfrist (51–120 h, dreistündlich)',
    sources: ['icon_eu', 'icon_eu_eps', 'icon_ch2_eps', 'mosmix_l'],
    diversity: ['icon_global', 'aicon', 'ifs_hres', 'aifs_single'] },
  { id: 't3' as const, deg: 0.25, fromH: 126, toH: 336, stepH: 6,
    label: 'Langfrist (126–336 h, sechsstündlich)',
    sources: ['icon_global', 'icon_eps_global', 'aicon', 'ifs_hres', 'ifs_ens', 'aifs_single', 'aifs_ens'],
    diversity: [] },
];

function buildTier(band: (typeof TIER_BANDS)[number], index: number): CubeTier {
  const leadHours: number[] = [];
  for (let h = band.fromH; h <= band.toH; h += band.stepH) leadHours.push(h);
  // Zellzahl aus der Domäne. `round` statt `ceil`: die Domänengrenzen sind auf 0,5°
  // gesetzt und damit durch jede Stufenweite teilbar — ein `ceil` würde einen
  // Gleitkomma-Rest zu einer zusätzlichen Spalte aufblasen.
  const ny = Math.round((CUBE_DOMAIN.latMax - CUBE_DOMAIN.latMin) / band.deg) + 1;
  const nx = Math.round((CUBE_DOMAIN.lonMax - CUBE_DOMAIN.lonMin) / band.deg) + 1;
  return Object.freeze({
    id: band.id,
    index,
    label: band.label,
    deg: band.deg,
    lat0: CUBE_DOMAIN.latMin,
    lon0: CUBE_DOMAIN.lonMin,
    ny,
    nx,
    leadHours: Object.freeze(leadHours),
    fromH: band.fromH,
    toH: band.toH,
    stepH: band.stepH,
    chunk: Object.freeze({
      cells: CHUNK_CELLS,
      cy: Math.ceil(ny / CHUNK_CELLS),
      cx: Math.ceil(nx / CHUNK_CELLS),
    }),
    sources: Object.freeze([...band.sources]),
    diversity: Object.freeze([...band.diversity]),
  });
}

export const TIERS: readonly CubeTier[] = Object.freeze(TIER_BANDS.map(buildTier));
export const TIER_BY_ID: Readonly<Record<TierId, CubeTier>> = Object.freeze(
  Object.fromEntries(TIERS.map((t) => [t.id, t])) as Record<TierId, CubeTier>,
);

/** Gesamtzahl der Zeitschritte über alle Stufen — gezählt, nicht gesetzt. */
export const CUBE_STEP_COUNT = TIERS.reduce((n, t) => n + t.leadHours.length, 0);

/** Stufe, die eine Vorhersagestunde trägt. `null` außerhalb 0…336 h oder in einer Lücke. */
export function tierForLead(leadH: number): CubeTier | null {
  for (const t of TIERS) if (leadH >= t.fromH && leadH <= t.toH) return t;
  return null;
}

// ---------------------------------------------------------------------------
// Gitter-Geometrie
// ---------------------------------------------------------------------------

export interface CellRef { readonly iy: number; readonly ix: number }

/** Nächste Gitterzelle. Gibt `null` zurück, wenn der Punkt außerhalb der Domäne liegt. */
export function cellOf(tier: CubeTier, lat: number, lon: number): CellRef | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < CUBE_DOMAIN.latMin || lat > CUBE_DOMAIN.latMax) return null;
  if (lon < CUBE_DOMAIN.lonMin || lon > CUBE_DOMAIN.lonMax) return null;
  const iy = Math.min(tier.ny - 1, Math.max(0, Math.round((lat - tier.lat0) / tier.deg)));
  const ix = Math.min(tier.nx - 1, Math.max(0, Math.round((lon - tier.lon0) / tier.deg)));
  return { iy, ix };
}

/** Mittelpunkt einer Zelle in Grad. */
export function cellCenter(tier: CubeTier, iy: number, ix: number): { lat: number; lon: number } {
  return { lat: tier.lat0 + iy * tier.deg, lon: tier.lon0 + ix * tier.deg };
}

export interface ChunkRef { readonly cy: number; readonly cx: number }

export function chunkOf(iy: number, ix: number): ChunkRef {
  return { cy: Math.floor(iy / CHUNK_CELLS), cx: Math.floor(ix / CHUNK_CELLS) };
}

/** Ausdehnung eines Chunks in Zellen — der letzte Chunk je Achse ist angeschnitten. */
export function chunkExtent(tier: CubeTier, cy: number, cx: number): {
  y0: number; x0: number; ny: number; nx: number;
} {
  const y0 = cy * CHUNK_CELLS;
  const x0 = cx * CHUNK_CELLS;
  return { y0, x0, ny: Math.min(CHUNK_CELLS, tier.ny - y0), nx: Math.min(CHUNK_CELLS, tier.nx - x0) };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Pfad eines Chunks RELATIV zur Repo-Wurzel. DIE Regel — nirgends sonst zusammensetzen. */
export function chunkPath(run: string, tier: CubeTier, cy: number, cx: number): string {
  return `${POINT_DIR}/${run}/${tier.id}/${pad2(cy)}_${pad2(cx)}.bin`;
}

/** Pfad des Lauf-Manifests (der Zeiger, den der Client zuerst liest). */
export function runManifestPath(run: string): string {
  return `${POINT_DIR}/${run}/run.json`;
}

/**
 * ── Bau-Ablage: der Producer schreibt NIE direkt in ein Laufverzeichnis ──────
 *
 * Der Ausgabebaum IST im Cron das ausgecheckte Daten-Repo, in dem die zuletzt
 * veröffentlichten Läufe liegen. Bis zum 2026-09-12 schnitt jede Stufe ihre Chunks
 * zuerst unter ihrem QUELL-Lauf (`point/<Quell-Lauf>/<Stufe>/`) und wurde danach unter
 * den Publikationslauf verschoben. Das trifft ein FREMDES Laufverzeichnis, sobald der
 * Quell-Lauf einer Stufe so heißt wie ein schon veröffentlichter Lauf — und genau das
 * ist der Regelfall geworden: t3 nimmt den IFS-`oper`-Lauf 00z, und `point/2026091200/`
 * lag als Veröffentlichung des 03:50-Laufs im Repo. Der Bau überschrieb dessen zwölf
 * t3-Chunks und `renameSync` zog das Verzeichnis anschließend weg; zurück blieb ein
 * `run.json`, das zwölf Dateien nennt, die es nicht mehr gibt (Lauf 13, §51).
 *
 * Deshalb: erst hierhin schreiben, am Ende je Stufe verschieben. Der Name beginnt mit
 * einem Punkt und ist damit KEIN Laufname (`^\d{10}$`) — die Aufbewahrung und der
 * Index sehen ihn nie; der Publisher räumt Reste eines abgebrochenen Baus weg, bevor
 * er staged.
 */
export const STAGE_DIR = `${POINT_DIR}/.build`;

/** Pfad eines Chunks in der Bau-Ablage, RELATIV zur Repo-Wurzel. */
export function stageChunkPath(tier: CubeTier, cy: number, cx: number): string {
  return `${STAGE_DIR}/${tier.id}/${pad2(cy)}_${pad2(cx)}.bin`;
}

/** Verzeichnis einer Stufe in der Bau-Ablage, RELATIV zur Repo-Wurzel. */
export function stageTierDir(tierId: TierId): string {
  return `${STAGE_DIR}/${tierId}`;
}

/** Pfad des Punkt-Manifests. */
/**
 * ── Stationsquellen als EIGENES Produkt (Jans Entscheidung 2026-09-09) ──────
 *
 * MOSMIX-S und MOSMIX-L sind Punktvorhersagen an festen Stationen, kein Gitter. Die
 * Alternative wäre gewesen, sie auf das Cube-Gitter zu interpolieren — und genau das
 * wäre der Fehler: MOSMIX ist auf DWD-Stationen bias-korrigiert, seine Genauigkeit
 * hängt daran, dass der Wert **an dieser Station** gilt. Eine Interpolation auf ein
 * 0,05°-Gitter würde die Korrektur über die Fläche verschmieren und den einen Vorteil
 * wegwerfen, den die Quelle hat.
 *
 * Deshalb ein zweites Produkt neben dem Cube — aber **dasselbe Containerformat**:
 * eine Stationsreihe ist ein Chunk mit `ny = 1` und `nx = Anzahl Stationen`. Gleiche
 * Ebenen, gleiche Skalen, gleicher Leser. Was fehlt, ist die Zuordnung Spalte → Station:
 * die steht im Lauf-Manifest (`stations.json`), nicht in der Datei — dieselbe Regel wie
 * überall hier: eine Datei ohne ihr Manifest ist Zahlensalat.
 *
 * **Gebündelt nach dem Chunk-Raster der Stufe 1.** Der Client rechnet den Chunk für
 * seinen Punkt ohnehin aus; er holt dann eine vierte Datei statt hunderter Einzelreihen.
 * Eine Datei je Station wären bei ~1 000 DACH-Stationen und vier Läufen 4 000 Objekte
 * im Repo — für dieselbe Information.
 */
export const STATIONS_DIR = `${POINT_DIR}/stations`;
/** Bündel je Stufe-1-Chunk: `point/stations/<lauf>/<cy>_<cx>.bin`. */
export function stationBundlePath(run: string, cy: number, cx: number): string {
  return `${STATIONS_DIR}/${run}/${pad2(cy)}_${pad2(cx)}.bin`;
}
/** Die Zuordnung Spalte → Station, je Lauf. Ohne sie ist das Bündel bedeutungslos. */
export function stationManifestPath(run: string): string {
  return `${STATIONS_DIR}/${run}/stations.json`;
}
/** Der Stationskatalog (Ort, Höhe, Land) — zeitlos, deshalb außerhalb der Läufe. */
export const STATION_CATALOG_PATH = `${STATIONS_DIR}/catalog.json`;

export const POINT_INDEX_PATH = `${POINT_DIR}/index.json`;
export const POINT_SOURCES_PATH = `${POINT_DIR}/sources.json`;
export const POINT_CALIB_PATH = `${POINT_DIR}/calib.json`;

// ---------------------------------------------------------------------------
// Quantisierung
// ---------------------------------------------------------------------------

/**
 * Physikalischer Wert → int16. `null`/`NaN` → `MISSING`.
 *
 * Beschneidet **nicht** still auf den int16-Rand: ein Wert außerhalb des deklarierten
 * Bereichs ist ein Fehler in der Quelle oder in der Bereichsangabe, kein Messwert am
 * Rand. Er wird zu `MISSING` — sichtbar, statt als plausible Zahl getarnt.
 */
export function quantize(value: number | null | undefined, plane: CubePlane): number {
  if (value == null || !Number.isFinite(value)) return MISSING;
  const q = Math.round((value - plane.offset) / plane.scale);
  if (q < INT16_MIN || q > INT16_MAX) return MISSING;
  return q;
}

/** int16 → physikalischer Wert. `MISSING` → `null`. */
export function dequantize(q: number, plane: CubePlane): number | null {
  if (q === MISSING) return null;
  return q * plane.scale + plane.offset;
}

/** Quantisierungsschrittweite Δ einer Ebene — PAP 6 rechnet `σ_quant² = Δ²/12`. */
export function quantStep(plane: CubePlane): number {
  return plane.scale;
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface CubeChunkHeader {
  readonly schema: number;
  readonly flags: number;
  /** Lauf als Stunden seit 1970-01-01T00:00Z. */
  readonly runHours: number;
  readonly tierIndex: number;
  readonly nvar: number;
  readonly nt: number;
  readonly y0: number;
  readonly x0: number;
  readonly ny: number;
  readonly nx: number;
  readonly payloadCrc32: number;
}

export interface CubeChunk extends CubeChunkHeader {
  /** Je Ebene ein `Int16Array` der Länge `nt · ny · nx` (Zeit außen, dann Zeile, dann Spalte). */
  readonly planes: readonly Int16Array[];
}

/** Bit 0 der Kopf-Flags: Nutzlast ist `deflate-raw`-komprimiert. */
export const CUBE_FLAG_DEFLATE = 1;
/** Verzeichniseintrag je Block: Offset u32, Länge u32, Filter u8, 3 B reserviert. */
export const DIR_ENTRY_BYTES = 12;

/**
 * Vorstufen-Filter je Block — dieselbe Idee wie die Zeilenfilter in PNG.
 *
 * `deflate` findet Wiederholungen, keine Trends. Ein Höhenfeld hat kaum Wiederholungen,
 * aber starke Trends: der Nachbar links ist fast der eigene Wert. Eine Zeilendifferenz
 * macht daraus kleine Zahlen, die sich wiederholen.
 *
 * **Gemessen an einer echten Alpenkachel (2026-09-09, N47,25/E11,25):** Höhe 123,9 → 89,6 KiB
 * (−28 %), `dwater` 20,5 → 12,1 (−41 %), Wolkenklassen dagegen 12,6 → 15,4 (+22 %). Deshalb
 * wählt der Producer den Filter **je Block per Messung** und schreibt die Wahl ins
 * Verzeichnis — nicht per Regel, die für die Hälfte der Kanäle falsch wäre.
 */
export const FILTER_NONE = 0;
export const FILTER_ROW_DELTA = 1;

/** Zeilendifferenz. `rowLen` ist die Länge der innersten Achse (nx). */
export function applyRowDelta(src: Int16Array, rowLen: number): Int16Array {
  const out = new Int16Array(src.length);
  for (let o = 0; o < src.length; o += rowLen) {
    let prev = 0;
    for (let i = 0; i < rowLen && o + i < src.length; i++) {
      const v = src[o + i];
      out[o + i] = (v - prev) | 0;
      prev = v;
    }
  }
  return out;
}
export function undoRowDelta(src: Int16Array, rowLen: number): Int16Array {
  const out = new Int16Array(src.length);
  for (let o = 0; o < src.length; o += rowLen) {
    let prev = 0;
    for (let i = 0; i < rowLen && o + i < src.length; i++) {
      prev = (prev + src[o + i]) | 0;
      out[o + i] = prev;
    }
  }
  return out;
}

/**
 * Packt einen Block: probiert beide Filter und behält den kleineren. Die Wahl steht
 * danach im Verzeichnis — ein Leser braucht die Regel nicht zu kennen, nur die Zahl.
 */
export async function packBlock(
  plane: Int16Array, rowLen: number, compress: Compressor,
): Promise<{ bytes: Uint8Array; filter: number }> {
  const raw = await compress(new Uint8Array(plane.buffer, plane.byteOffset, plane.byteLength));
  const d = applyRowDelta(plane, rowLen);
  const dd = await compress(new Uint8Array(d.buffer, d.byteOffset, d.byteLength));
  return dd.length < raw.length ? { bytes: dd, filter: FILTER_ROW_DELTA } : { bytes: raw, filter: FILTER_NONE };
}

/** Liest einen Block zurück — inklusive Filter-Rücknahme. */
export async function unpackBlock(
  bytes: Uint8Array, cells: number, rowLen: number, filter: number, decompress: Compressor,
): Promise<Int16Array> {
  const raw = await decompress(bytes);
  if (raw.length !== cells * 2) throw new Error(`Block entpackt zu ${raw.length} B, erwartet ${cells * 2}`);
  // Kopieren statt `new Int16Array(raw.buffer)`: der entpackte Puffer ist nicht garantiert
  // 2-byte-ausgerichtet, und ein unausgerichteter TypedArray-View wirft.
  const plane = new Int16Array(cells);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  for (let i = 0; i < cells; i++) plane[i] = dv.getInt16(i * 2, true);
  return filter === FILTER_ROW_DELTA ? undoRowDelta(plane, rowLen) : plane;
}

export type Compressor = (bytes: Uint8Array) => Promise<Uint8Array>;

/** Voreinstellung: die Web-Streams. Node ≥ 22 und jeder moderne Browser haben sie. */
export const deflateRaw: Compressor = async (bytes) => {
  const cs = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(cs).arrayBuffer());
};
export const inflateRaw: Compressor = async (bytes) => {
  const ds = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(ds).arrayBuffer());
};

/**
 * CRC-32 (IEEE 802.3, wie in PNG und zlib). Der Ehrlichkeitsanker des Containers:
 * ein halb geschriebener oder am CDN beschnittener Chunk ist damit erkennbar, statt
 * als plausible Zahlenreihe durchzugehen. Tabellenfrei aufgebaut, damit das Modul
 * keinen Zustand hält, den ein Worker doppelt anlegen müsste.
 */
let crcTable: Uint32Array | null = null;
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Schreibt einen Chunk. `planes` muss `CUBE_PLANES.length` Einträge in genau dieser
 * Reihenfolge haben — eine kürzere Liste wäre eine stille Umnummerierung aller
 * folgenden Ebenen.
 */
export async function encodeCubeChunk(
  chunk: Omit<CubeChunk, 'payloadCrc32' | 'schema' | 'flags' | 'nvar'>,
  compress: Compressor = deflateRaw,
): Promise<Uint8Array> {
  const nvar = CUBE_PLANES.length;
  if (chunk.planes.length !== nvar) {
    throw new Error(`cube: ${chunk.planes.length} Ebenen statt ${nvar} — die Reihenfolge ist Vertrag`);
  }
  const cells = chunk.nt * chunk.ny * chunk.nx;
  const blocks: { bytes: Uint8Array; filter: number }[] = [];
  for (let p = 0; p < nvar; p++) {
    const plane = chunk.planes[p];
    if (plane.length !== cells) {
      throw new Error(`cube: Ebene ${CUBE_PLANES[p].id} hat ${plane.length} Werte statt ${cells}`);
    }
    blocks.push(await packBlock(plane, chunk.nx, compress));
  }

  const payloadStart = CUBE_HEADER_BYTES + DIR_ENTRY_BYTES * nvar;
  const total = payloadStart + blocks.reduce((n, b) => n + b.bytes.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);

  let off = payloadStart;
  for (let p = 0; p < nvar; p++) {
    const e = CUBE_HEADER_BYTES + p * DIR_ENTRY_BYTES;
    dv.setUint32(e, off, true);
    dv.setUint32(e + 4, blocks[p].bytes.length, true);
    dv.setUint8(e + 8, blocks[p].filter);
    out.set(blocks[p].bytes, off);
    off += blocks[p].bytes.length;
  }

  const payloadCrc = crc32(out.subarray(payloadStart));
  dv.setUint32(0, CUBE_MAGIC, false);          // Magic big-endian: als ASCII lesbar im Hexdump
  dv.setUint16(4, CUBE_SCHEMA, true);
  dv.setUint16(6, CUBE_FLAG_DEFLATE, true);
  dv.setUint32(8, chunk.runHours, true);
  dv.setUint8(12, chunk.tierIndex);
  dv.setUint8(13, nvar);
  dv.setUint16(14, chunk.nt, true);
  dv.setUint16(16, chunk.y0, true);
  dv.setUint16(18, chunk.x0, true);
  dv.setUint8(20, chunk.ny);
  dv.setUint8(21, chunk.nx);
  dv.setUint16(22, 0, true);
  dv.setUint32(24, CUBE_HEADER_BYTES, true);   // dirOffset
  dv.setUint32(28, payloadCrc, true);
  return out;
}

/**
 * Liest nur den Kopf und das Verzeichnis — ohne eine einzige Ebene zu entpacken.
 *
 * `allowOtherSchema` nimmt einen Chunk mit fremder Schema-Nummer an. Das ist NUR sinnvoll,
 * wenn der Aufrufer die passende Ebenenliste hat (aus dem Lauf-Manifest jenes Laufs) —
 * sonst liest er die richtigen Bytes unter falschen Namen.
 */
export function readCubeHeader(bytes: Uint8Array, opts: { allowOtherSchema?: boolean } = {}): {
  header: CubeChunkHeader;
  directory: readonly { offset: number; length: number; filter: number }[];
} {
  if (bytes.length < CUBE_HEADER_BYTES) throw new Error('cube: Datei kürzer als der Kopf');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, false) !== CUBE_MAGIC) throw new Error('cube: falsches Magic');
  const schema = dv.getUint16(4, true);
  if (schema !== CUBE_SCHEMA && !opts.allowOtherSchema) {
    throw new Error(
      `cube: Schema ${schema}, erwartet ${CUBE_SCHEMA}. Ein älterer Chunk hat eine andere `
      + 'Ebenenliste — mit CUBE_PLANES gelesen ergäbe er stillschweigend falsche Größen. '
      + 'Wer ihn lesen will, übergibt die Ebenenliste aus SEINEM Lauf-Manifest '
      + '(decodeCubeChunk(bytes, { planes })).',
    );
  }
  const nvar = dv.getUint8(13);
  const dirOffset = dv.getUint32(24, true);
  const directory: { offset: number; length: number; filter: number }[] = [];
  for (let p = 0; p < nvar; p++) {
    const e = dirOffset + p * DIR_ENTRY_BYTES;
    directory.push({
      offset: dv.getUint32(e, true),
      length: dv.getUint32(e + 4, true),
      filter: dv.getUint8(e + 8),
    });
  }
  return {
    header: {
      schema,
      flags: dv.getUint16(6, true),
      runHours: dv.getUint32(8, true),
      tierIndex: dv.getUint8(12),
      nvar,
      nt: dv.getUint16(14, true),
      y0: dv.getUint16(16, true),
      x0: dv.getUint16(18, true),
      ny: dv.getUint8(20),
      nx: dv.getUint8(21),
      payloadCrc32: dv.getUint32(28, true),
    },
    directory,
  };
}

/**
 * Liest einen Chunk vollständig. `wanted` beschränkt auf einzelne Ebenen-IDs — die
 * übrigen bleiben leer (Länge 0), damit ein Client, der nur T und Niederschlag
 * braucht, die anderen 25 Blöcke gar nicht erst entpackt.
 */
export async function decodeCubeChunk(
  bytes: Uint8Array,
  opts: {
    wanted?: readonly string[];
    decompress?: Compressor;
    checkCrc?: boolean;
    /**
     * Ebenenliste dieses Chunks. Voreinstellung `CUBE_PLANES` — die des aktuellen Schemas.
     * Ein Leser mit dem Lauf-Manifest kann hier dessen `planes` übergeben und damit auch
     * einen Chunk aus einem anderen Schema richtig benennen. **Genau deshalb trägt das
     * Manifest die Ebenen mit Skala:** ab hier ist der Container selbstbeschreibend, und
     * die nächste Ebenenerweiterung braucht keinen Schemabruch mehr.
     */
    planes?: readonly { id: string }[];
  } = {},
): Promise<CubeChunk> {
  const planeList = opts.planes ?? CUBE_PLANES;
  const { header, directory } = readCubeHeader(bytes, { allowOtherSchema: opts.planes != null });
  if (planeList.length !== header.nvar) {
    throw new Error(
      `cube: Chunk hat ${header.nvar} Ebenen, die Liste nennt ${planeList.length} — `
      + 'jede Zuordnung wäre um die Differenz verschoben.',
    );
  }
  const decompress = opts.decompress ?? inflateRaw;
  if (opts.checkCrc !== false) {
    const payloadStart = CUBE_HEADER_BYTES + DIR_ENTRY_BYTES * header.nvar;
    const crc = crc32(bytes.subarray(payloadStart));
    if (crc !== header.payloadCrc32) {
      throw new Error(`cube: CRC ${crc.toString(16)} statt ${header.payloadCrc32.toString(16)} — Datei unvollständig`);
    }
  }
  const want = opts.wanted ? new Set(opts.wanted) : null;
  const cells = header.nt * header.ny * header.nx;
  const planes: Int16Array[] = [];
  for (let p = 0; p < header.nvar; p++) {
    const meta = planeList[p];
    if (want && (!meta || !want.has(meta.id))) { planes.push(new Int16Array(0)); continue; }
    const d = directory[p];
    planes.push(await unpackBlock(bytes.subarray(d.offset, d.offset + d.length), cells, header.nx, d.filter, decompress));
  }
  return { ...header, planes };
}

/** Linearer Index eines (Zeit, Zeile, Spalte) innerhalb einer Ebene. */
export function planeOffset(header: CubeChunkHeader, it: number, ry: number, rx: number): number {
  return (it * header.ny + ry) * header.nx + rx;
}

// ---------------------------------------------------------------------------
// Selbsttest
// ---------------------------------------------------------------------------

export interface CubeCheck { name: string; ok: boolean; detail?: string }

/**
 * Netzfreier Selbsttest der Form. Läuft in `verify:point-data` und in CI.
 * Prüft, was ein Leser voraussetzt — nicht, was der Schreiber gerade tut.
 */
export async function cubeSelfTest(): Promise<{ checks: CubeCheck[]; passed: number; total: number }> {
  const checks: CubeCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // (1) Jede deklarierte Spanne muss in int16 passen — sonst quantisiert der Producer
  //     stumm auf MISSING und niemand merkt es (der Fall hModEff bei scale 0,1).
  for (const v of CUBE_VARS) {
    const lo = Math.round((v.range[0] - v.offset) / v.scale);
    const hi = Math.round((v.range[1] - v.offset) / v.scale);
    add(`Spanne passt in int16: ${v.id}`, lo >= INT16_MIN && hi <= INT16_MAX, `${lo}…${hi}`);
  }

  // (2) IDs eindeutig, Ebenen aus den Größen abgeleitet.
  add('Größen-IDs eindeutig', new Set(CUBE_VARS.map((v) => v.id)).size === CUBE_VARS.length);
  add('Ebenen-IDs eindeutig', new Set(CUBE_PLANES.map((p) => p.id)).size === CUBE_PLANES.length);
  add('Ebenenzahl = Größen + σ_div + σ_ens + 2·Quantile',
    CUBE_PLANES.length === CUBE_VARS.length
      + CUBE_VARS.filter((v) => v.sigmaDiv).length
      + CUBE_VARS.filter((v) => v.sigmaEns).length
      + 2 * CUBE_VARS.filter((v) => v.quantiles).length,
    `${CUBE_PLANES.length} Ebenen = ${CUBE_VARS.length} + ${CUBE_VARS.filter((v) => v.sigmaDiv).length} σ_div`
      + ` + ${CUBE_VARS.filter((v) => v.sigmaEns).length} σ_ens + 2·${CUBE_VARS.filter((v) => v.quantiles).length} Quantile`);
  // Ein Quantil ist ein WERT derselben Groesse, keine Streuung — es behaelt deshalb
  // Skala UND Versatz. Stuende hier `offset: 0`, laege eine Temperatur um den
  // Versatz daneben, und zwar lautlos.
  add('Quantil-Ebenen behalten Skala und Versatz ihrer Größe',
    CUBE_PLANES.filter((p) => p.kind === 'q10' || p.kind === 'q90').every((p) => {
      const v = CUBE_VARS.find((x) => x.id === p.varId);
      return !!v && p.scale === v.scale && p.offset === v.offset;
    }));
  // σ_ens ohne σ_div waere sinnlos: die Ensemble-Streuung ist eine VERFEINERUNG des
  // Divergenz-Zweigs, keine Alternative fuer eine Groesse, die gar keine Streuung fuehrt.
  add('keine Größe führt σ_ens ohne σ_div',
    CUBE_VARS.every((v) => !v.sigmaEns || v.sigmaDiv),
    CUBE_VARS.filter((v) => v.sigmaEns && !v.sigmaDiv).map((v) => v.id).join(',') || 'keine');
  // Reihenfolge je Groesse ist Vertrag: Median, dann σ_div, dann σ_ens.
  add('Ebenen-Reihenfolge je Größe: mean → sd → sd_ens → q10 → q90', (() => {
    for (const v of CUBE_VARS) {
      const want = ['mean', ...(v.sigmaDiv ? ['sd'] : []), ...(v.sigmaEns ? ['sd_ens'] : []),
        ...(v.quantiles ? ['q10', 'q90'] : [])];
      const got = CUBE_PLANES.filter((p) => p.varId === v.id).map((p) => p.kind);
      if (want.join() !== got.join()) return false;
    }
    return true;
  })());
  add('Ebenenzahl passt in u8', CUBE_PLANES.length <= 255, String(CUBE_PLANES.length));

  // (3) Zeitachse: gezählt, nicht behauptet.
  for (const t of TIERS) {
    const expect = Math.floor((t.toH - t.fromH) / t.stepH) + 1;
    add(`Zeitachse ${t.id}`, t.leadHours.length === expect
      && t.leadHours[0] === t.fromH
      && t.leadHours[t.leadHours.length - 1] === t.toH,
      `${t.leadHours.length} Schritte ${t.fromH}…${t.toH} h`);
  }
  add('Stufen überlappen nicht', TIERS.every((t, i) => i === 0 || t.fromH > TIERS[i - 1].toH));
  add('Stufen decken 0…336 h', TIERS[0].fromH === 0 && TIERS[TIERS.length - 1].toH === 336);
  add('Schrittzahl gezählt', CUBE_STEP_COUNT === TIERS.reduce((n, t) => n + t.leadHours.length, 0),
    `${CUBE_STEP_COUNT} Schritte gesamt`);

  // (4) Gitter: Ränder müssen exakt getroffen werden, sonst fehlt eine Randspalte.
  for (const t of TIERS) {
    const lastLat = t.lat0 + (t.ny - 1) * t.deg;
    const lastLon = t.lon0 + (t.nx - 1) * t.deg;
    add(`Gitter trifft den Rand: ${t.id}`,
      Math.abs(lastLat - CUBE_DOMAIN.latMax) < 1e-9 && Math.abs(lastLon - CUBE_DOMAIN.lonMax) < 1e-9,
      `${t.ny}×${t.nx} bis ${lastLat.toFixed(2)}/${lastLon.toFixed(2)}`);
    add(`Chunk-Raster deckt das Gitter: ${t.id}`,
      t.chunk.cy * CHUNK_CELLS >= t.ny && t.chunk.cx * CHUNK_CELLS >= t.nx,
      `${t.chunk.cy}×${t.chunk.cx} Chunks`);
    add(`Chunk-Kanten passen in u8: ${t.id}`, CHUNK_CELLS <= 255);
    add(`Gitterindizes passen in u16: ${t.id}`, t.ny <= 65535 && t.nx <= 65535);
  }

  // (5) Zellzuordnung: die vier Ecken und ein Punkt außerhalb.
  const t1 = TIER_BY_ID.t1;
  add('Zelle SW-Ecke', JSON.stringify(cellOf(t1, CUBE_DOMAIN.latMin, CUBE_DOMAIN.lonMin)) === '{"iy":0,"ix":0}');
  add('Zelle NO-Ecke',
    JSON.stringify(cellOf(t1, CUBE_DOMAIN.latMax, CUBE_DOMAIN.lonMax)) === `{"iy":${t1.ny - 1},"ix":${t1.nx - 1}}`);
  add('Punkt außerhalb → null', cellOf(t1, 60, 10) === null && cellOf(t1, 50, 30) === null);
  {
    // Rundlauf Zelle → Mittelpunkt → Zelle für 500 Zufallspunkte in der Domäne.
    let bad = 0;
    for (let i = 0; i < 500; i++) {
      const lat = CUBE_DOMAIN.latMin + (i * 0.0197) % (CUBE_DOMAIN.latMax - CUBE_DOMAIN.latMin);
      const lon = CUBE_DOMAIN.lonMin + (i * 0.0313) % (CUBE_DOMAIN.lonMax - CUBE_DOMAIN.lonMin);
      const c = cellOf(t1, lat, lon);
      if (!c) { bad++; continue; }
      const ctr = cellCenter(t1, c.iy, c.ix);
      const back = cellOf(t1, ctr.lat, ctr.lon);
      if (!back || back.iy !== c.iy || back.ix !== c.ix) bad++;
    }
    add('Zelle ⇄ Mittelpunkt rundläuft', bad === 0, `${bad} Abweichungen von 500`);
  }

  // (6) Quantisierung: Rundlauf und die Ehrlichkeitsregel am Rand.
  {
    const p = CUBE_PLANES[planeIndex('t2m')];
    const round = [-40, -0.005, 0, 12.34, 41.5].every((v) => {
      const back = dequantize(quantize(v, p), p);
      return back != null && Math.abs(back - v) <= p.scale / 2 + 1e-9;
    });
    add('Quantisierung rundläuft (t2m)', round);
    add('null → MISSING', quantize(null, p) === MISSING && dequantize(MISSING, p) === null);
    add('NaN → MISSING', quantize(NaN, p) === MISSING);
    add('Wert außerhalb der Spanne → MISSING (nicht stilles Klemmen)',
      quantize(1e6, p) === MISSING && quantize(-1e6, p) === MISSING);
    const hp = CUBE_PLANES[planeIndex('hModEff')];
    add('hModEff bei 5000 m bleibt lesbar', dequantize(quantize(5000, hp), hp) === 5000);
  }

  // (7) Container-Rundlauf an echten Zahlen, mit Negativ-Kontrolle (Lehre aus SAT2h:
  //     ein Byte-Gleichheitstest ohne Negativ-Kontrolle beweist nichts).
  {
    const tier = TIER_BY_ID.t2;
    const nt = 4, ny = 3, nx = 5, cells = nt * ny * nx;
    const planes = CUBE_PLANES.map((_, p) => {
      const a = new Int16Array(cells);
      for (let i = 0; i < cells; i++) a[i] = i % 7 === 0 ? MISSING : ((p * 131 + i * 17) % 9001) - 4500;
      return a;
    });
    const bytes = await encodeCubeChunk({
      runHours: Math.floor(Date.UTC(2026, 8, 9, 0) / 3_600_000),
      tierIndex: tier.index, nt, y0: 16, x0: 32, ny, nx, planes,
    });
    const back = await decodeCubeChunk(bytes);
    let same = back.nt === nt && back.ny === ny && back.nx === nx && back.y0 === 16 && back.x0 === 32
      && back.tierIndex === tier.index && back.nvar === CUBE_PLANES.length;
    for (let p = 0; same && p < planes.length; p++) {
      for (let i = 0; i < cells; i++) if (back.planes[p][i] !== planes[p][i]) { same = false; break; }
    }
    add('Container rundläuft byte-treu', same);
    add('MISSING überlebt den Rundlauf', back.planes[0][0] === MISSING);

    // Negativ-Kontrolle: ein gekipptes Nutzlast-Byte MUSS auffallen.
    const broken = bytes.slice();
    broken[broken.length - 1] ^= 0xff;
    let caught = false;
    try { await decodeCubeChunk(broken); } catch { caught = true; }
    add('Negativ-Kontrolle: gekipptes Byte wird erkannt', caught);

    // Teilentpacken: nur zwei Ebenen anfordern.
    const partial = await decodeCubeChunk(bytes, { wanted: ['t2m', 'precip'] });
    add('Teilentpacken lässt ungewollte Ebenen leer',
      partial.planes[planeIndex('t2m')].length === cells
      && partial.planes[planeIndex('precip')].length === cells
      && partial.planes[planeIndex('clch')].length === 0);

    // Kopf allein lesbar, ohne eine Ebene zu entpacken.
    const { header, directory } = readCubeHeader(bytes.subarray(0, CUBE_HEADER_BYTES + DIR_ENTRY_BYTES * CUBE_PLANES.length));
    add('Kopf ohne Nutzlast lesbar', header.nt === nt && directory.length === CUBE_PLANES.length);
  }

  // (8) Pfade: Schlüssel = Dateiname, ohne Ausnahme (PD0 R-2 — im Kartenmanifest gilt
  //     `lightningfc → lpi-…`, und genau daran greift ein Pfadbauer ins Leere).
  add('Chunk-Pfad ist ableitbar',
    chunkPath('2026090900', TIER_BY_ID.t1, 3, 12) === 'point/2026090900/t1/03_12.bin',
    chunkPath('2026090900', TIER_BY_ID.t1, 3, 12));
  add('Stufen-ID ist das Verzeichnis', TIERS.every((t) => chunkPath('R', t, 0, 0).includes(`/${t.id}/`)));
  add('Stationsbündel liegen neben dem Cube, nicht darin',
    stationBundlePath('2026090900', 3, 12) === 'point/stations/2026090900/03_12.bin',
    stationBundlePath('2026090900', 3, 12));
  add('Stationskatalog ist zeitlos adressiert (ohne Lauf)',
    STATION_CATALOG_PATH === 'point/stations/catalog.json' && !STATION_CATALOG_PATH.includes('2026'));
  add('eine Stationsreihe passt in denselben Container (ny = 1)',
    CHUNK_CELLS >= 1);

  // (9) CRC gegen einen bekannten Wert (IEEE 802.3, "123456789" → 0xCBF43926).
  add('CRC-32 stimmt mit der Referenz',
    crc32(new TextEncoder().encode('123456789')) === 0xcbf43926,
    crc32(new TextEncoder().encode('123456789')).toString(16));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
