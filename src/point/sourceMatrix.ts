/**
 * sourceMatrix.ts — `QUELLENMATRIX.md` maschinenlesbar (Phase PD-A,
 * `audit/punktdaten-versorgung.md` §14).
 *
 * ── Warum das eine Datei ist und keine Prosa ────────────────────────────────
 * Die Quellenmatrix beantwortet für JEDEN Punkt und JEDE Vorhersagestunde die Frage,
 * welche Quelle trägt. Sie sagt selbst, warum das nicht am Land hängen darf:
 *
 *   „Zwei Punkte in Österreich brauchen unterschiedliche Quellen. Bregenz bekommt RV,
 *    CombiPrecip und ICON-CH1; Wien bekommt keines davon […]. Die Quellenauswahl muss
 *    also **geometrisch** über die Domain entschieden werden, nicht über das Land."
 *
 * Eine Prosa-Tabelle kann das nicht leisten — der Ingest muss es rechnen, und das
 * Produkt muss es ausweisen (Ehrlichkeit ist Produktprinzip). Deshalb steht die Matrix
 * hier als Daten, und `buildSourcesJson()` schreibt sie unverändert nach
 * `point/sources.json` ins Daten-Repo, wo Client und Edge sie lesen können.
 *
 * ── Was hier NICHT steht ────────────────────────────────────────────────────
 * Die nativen Schrittlisten. `QUELLENMATRIX.md` nennt Vorhersage*längen*, nicht
 * Schritt*folgen* (§21 (7)). Ob ICON-EU zwischen 78 und 120 h stündlich oder
 * dreistündlich liefert, steht dort nicht — und eine geratene Liste wäre genau der
 * Fehler aus SH3/V-BW-51: ein Verifier gegen selbst erfundene Werte ist grün und
 * trotzdem falsch. `steps` ist deshalb `null`, bis der Ingest es am Verzeichnis
 * gemessen hat; `stepsMeasured` sagt, ob das schon geschehen ist.
 */

/** Rechteckige Domäne in Grad. `null` = global. */
export interface SourceDomain {
  readonly latMin: number;
  readonly latMax: number;
  readonly lonMin: number;
  readonly lonMax: number;
}

export type SourceKind =
  /** Reguläres oder ikosaedrisches Modellgitter. */
  | 'grid'
  /** Ensemble mit Einzelmembern. */
  | 'ensemble'
  /** Ensemble, das NUR Perzentile veröffentlicht (C-LAEF ⚠³). */
  | 'percentiles'
  /** Punktquelle an festen Stationen (MOSMIX, E4). */
  | 'points'
  /** Radar-/Nowcast-Komposit. */
  | 'nowcast'
  /**
   * ANALYSE, keine Vorhersage — Datenassimilation für die Stunde 0 (KENDA-CH1,
   * INCA-Analyse). Gehört in dieselbe Klasse wie das Radar: Anker für den Anfang,
   * nicht Träger eines Vorhersagebands. Der Selbsttest prüft, dass eine Quelle mit
   * Horizont 0 auch so deklariert ist — sonst sähe sie aus wie ein Modell, das nichts
   * liefert, statt wie eine Analyse, die etwas anderes liefert.
   */
  | 'analysis';

export interface Source {
  readonly id: string;
  readonly name: string;
  readonly provider: 'DWD' | 'GeoSphere' | 'MeteoSchweiz' | 'ECMWF' | 'NOAA';
  readonly kind: SourceKind;
  /** `null` = global (deckt DACH ohne Einschränkung). */
  readonly domain: SourceDomain | null;
  /**
   * Sicherheitsabstand zum Domänenrand in km. ICON-CH ⚠²: „Empfehlung: Domain um
   * mindestens 20 km einschneiden, wie Open-Meteo es tut." Ein Wert am Rand des
   * lateralen Relaxationsbereichs ist laut MeteoSchweiz zufällig — er darf nicht
   * aussehen wie eine Vorhersage.
   */
  readonly edgeMarginKm: number;
  /** Zusätzliche geometrische Einschränkung aus einer Fußnote (⚠¹, ⚠⁴). */
  readonly clip: SourceDomain | null;
  /** Vorhersagelänge in Stunden je Laufstunde UTC. `default` gilt für alle übrigen. */
  readonly horizonH: { readonly default: number; readonly byRunHour?: Readonly<Partial<Record<number, number>>> };
  /** Laufstunden UTC, zu denen die Quelle überhaupt läuft. */
  readonly runHours: readonly number[];
  /** Ensemble-Member; 0 = deterministisch. */
  readonly members: number;
  /** Cube-Größen, die die Quelle nachweislich führt (`CUBE_VARS`-IDs). Leer = noch nicht ermittelt. */
  readonly vars: readonly string[];
  /** Native Schrittfolge in Stunden — `null`, solange ungemessen. */
  readonly steps: readonly number[] | null;
  readonly stepsMeasured: boolean;
  /** Vorhalt beim Anbieter in Stunden; `null` = anbieterabhängig/unbekannt. */
  readonly retentionH: number | null;
  /** Freies Archiv vorhanden? Wenn nicht, ist jeder Tag ohne eigenen Sammler verloren (§4). */
  readonly freeArchive: string | null;
  readonly licence: string;
  readonly attribution: string;
  /** Zugriffsweg — der Ingest liest ihn, das Audit auch. */
  readonly access: string;
  /** Adaptermodul im Repo, das die Quelle bereits liest. `null` = fehlt noch. */
  readonly adapter: string | null;
  readonly note?: string;
}

const G = (latMin: number, latMax: number, lonMin: number, lonMax: number): SourceDomain =>
  Object.freeze({ latMin, latMax, lonMin, lonMax });

const CC_BY_4 = 'CC BY 4.0';

/**
 * DIE Quellenliste. Reihenfolge: Kurzfrist → Langfrist, wie in `QUELLENMATRIX.md` §1.
 * Domänen aus §2, Vorhaltezeiten aus §4, Lizenzen aus §5 — jeweils wörtlich übernommen.
 */
export const SOURCES: readonly Source[] = Object.freeze([
  // ── 0–3 h: Nowcast ───────────────────────────────────────────────────────
  {
    id: 'radvor_rv', name: 'RADVOR RV (+ RADOLAN RY/HG)', provider: 'DWD', kind: 'nowcast',
    domain: G(46.5, 55.9, 3.5, 15.7), edgeMarginKm: 0,
    // ⚠¹: Das DWD-Komposit reicht 150 km um die Radarstandorte — praktisch nur
    // westlich ca. 14,0–14,3 °E. Wien, Graz, Linz, Klagenfurt, Villach fallen heraus.
    clip: G(46.5, 55.9, 3.5, 14.1),
    horizonH: { default: 2 }, runHours: [], members: 0,
    vars: ['precip'], steps: null, stepsMeasured: false,
    retentionH: 48, freeArchive: null,
    licence: CC_BY_4, attribution: 'Datenbasis: Deutscher Wetterdienst',
    access: 'opendata.dwd.de → Spiegel radar/rv/ im Daten-Repo', adapter: 'src/sources/dwdRadar.ts',
    note: '⚠¹ In Österreich nur im Westen (Bregenz, Kufstein, Salzburg, Innsbruck, Zell am See); für Ostösterreich trägt allein INCA. Vorhersagelänge vermutlich +120 min in 5-min-Schritten — Quellenmatrix §7 nennt sie ausdrücklich als ungeklärt.',
  },
  {
    id: 'inca', name: 'INCA Analyse / Nowcast', provider: 'GeoSphere', kind: 'nowcast',
    domain: G(45.5, 49.5, 8.10, 17.74), edgeMarginKm: 0, clip: null,
    horizonH: { default: 3 }, runHours: [], members: 0,
    vars: ['precip', 't2m'], steps: null, stepsMeasured: false,
    retentionH: null, freeArchive: 'INCA-Analyse ab 2011',
    licence: CC_BY_4, attribution: 'Quelle: GeoSphere Austria',
    access: 'dataset.api.hub.geosphere.at (Rate-Limit 240/h, 5/s)', adapter: 'src/sources/geosphereInca.ts',
  },
  {
    id: 'combiprecip', name: 'CombiPrecip (+ PRECIP RZC)', provider: 'MeteoSchweiz', kind: 'nowcast',
    domain: G(43.6, 49.5, 2.7, 12.5), edgeMarginKm: 0, clip: null,
    horizonH: { default: 0 }, runHours: [], members: 0,
    vars: ['precip'], steps: null, stepsMeasured: false,
    retentionH: 14 * 24, freeArchive: null,
    licence: CC_BY_4, attribution: 'Quelle: MeteoSchweiz',
    access: 'data.geo.admin.ch / STAC', adapter: 'src/sources/meteoSwissRadar.ts',
  },

  // ── 0–48 h: Konvektionsauflösend ─────────────────────────────────────────
  {
    id: 'icon_d2', name: 'ICON-D2', provider: 'DWD', kind: 'grid',
    domain: G(43.2, 58.1, -3.9, 20.3), edgeMarginKm: 0, clip: null,
    horizonH: { default: 48 }, runHours: [0, 3, 6, 9, 12, 15, 18, 21], members: 0,
    vars: ['t2m', 'td2m', 'u10', 'v10', 'gust', 'precip', 'clct', 'clcl', 'clcm', 'clch', 'ps', 'snowlmt'],
    steps: null, stepsMeasured: false,
    retentionH: 24, freeArchive: null,
    licence: `${CC_BY_4} / GeoNutzV`, attribution: 'Datenbasis: Deutscher Wetterdienst',
    access: 'opendata.dwd.de/weather/nwp/icon-d2/grib — regular-lat-lon UND icosahedral, single- und model-level',
    adapter: 'src/sources/iconD2TempSource.ts u. a.',
    note: 'Trägt als einzige Quelle die Modelllevel-Temperatur regulär interpoliert (65 Level × 49 Schritte) — die Grundlage der Profilfelder (PAP 2).',
  },
  {
    id: 'icon_d2_eps', name: 'ICON-D2-EPS', provider: 'DWD', kind: 'ensemble',
    domain: G(43.2, 58.1, -3.9, 20.3), edgeMarginKm: 0, clip: null,
    horizonH: { default: 48 }, runHours: [0, 3, 6, 9, 12, 15, 18, 21], members: 20,
    vars: ['t2m', 'u10', 'v10', 'precip'], steps: null, stepsMeasured: false,
    retentionH: 24, freeArchive: null,
    licence: `${CC_BY_4} / GeoNutzV`, attribution: 'Datenbasis: Deutscher Wetterdienst',
    access: 'opendata.dwd.de — nur icosahedral', adapter: 'src/sources/iconD2EpsSource.ts',
    note: 'Liefert σ_ens für PAP 6 im Kurzfristbereich.',
  },
  {
    id: 'icon_ch1_eps', name: 'ICON-CH1-EPS', provider: 'MeteoSchweiz', kind: 'ensemble',
    domain: G(42.0, 50.5, -0.8, 17.7), edgeMarginKm: 20, clip: null,
    horizonH: { default: 33 }, runHours: [0, 3, 6, 9, 12, 15, 18, 21], members: 11,
    vars: ['t2m', 'u10', 'v10', 'precip', 'clct'], steps: null, stepsMeasured: false,
    retentionH: 24, freeArchive: null,
    licence: CC_BY_4, attribution: 'Quelle: MeteoSchweiz',
    access: 'STAC data.geo.admin.ch → pre-signed S3 auf rgw.cscs.ch (CORS-blockiert → /_cscs)',
    adapter: 'src/sources/iconChEpsSource.ts',
    note: '⚠² Laut Quellenmatrix in Ostösterreich nicht nutzbar. Die Begründung lässt sich aus der Bounding-Box NICHT nachrechnen — s. CH_EDGE_DISCREPANCY. In §1 ist ICON-CH ohnehin nur der Schweiz zugeordnet; die Zuordnung entscheidet, nicht die Hülle.',
  },
  {
    id: 'claef', name: 'C-LAEF AlpeAdria (1 km)', provider: 'GeoSphere', kind: 'percentiles',
    domain: G(43.00, 51.50, 5.03, 22.57), edgeMarginKm: 0, clip: null,
    horizonH: { default: 60 }, runHours: [0, 6, 12, 18], members: 0,
    vars: ['t2m', 'u10', 'v10', 'precip', 'clct'], steps: null, stepsMeasured: false,
    retentionH: null, freeArchive: null,
    licence: CC_BY_4, attribution: 'Quelle: GeoSphere Austria',
    access: 'dataset.api.hub.geosphere.at → /grid/forecast/nwp-v2-1h-1km (am Katalog geprüft 2026-09-09). Nachfolger von nwp-v1-1h-2500m, ab Nov. 2026 Pflicht',
    adapter: null,
    note: 'Deterministischer Lauf. Die Perzentil-Variante ist ein EIGENER Datensatz (claef_eps) — das war in der ersten Fassung dieser Datei fälschlich zusammengefasst.',
  },
  {
    id: 'claef_eps', name: 'C-LAEF-EPS', provider: 'GeoSphere', kind: 'percentiles',
    domain: G(43.00, 51.50, 5.03, 22.57), edgeMarginKm: 0, clip: null,
    horizonH: { default: 60 }, runHours: [0, 6, 12, 18], members: 0,
    vars: ['t2m', 'u10', 'v10', 'precip'], steps: null, stepsMeasured: false,
    retentionH: null, freeArchive: null,
    licence: CC_BY_4, attribution: 'Quelle: GeoSphere Austria',
    access: 'dataset.api.hub.geosphere.at → /grid/forecast/ensemble-v2-1h-1km (am Katalog geprüft 2026-09-09)',
    adapter: null,
    note: '⚠³ Liefert KEINE Einzelmember, nur P10/P50/P90 je Parameter. Für kalibrierte Bänder reicht das, für member-basiertes Post-Processing (EMOS/BMA) nicht — und für σ_ens auch nicht, weil eine Spannweite kein Spread ist.',
  },

  // ── 48–120 h: Mittelfrist ────────────────────────────────────────────────
  {
    id: 'icon_eu', name: 'ICON-EU', provider: 'DWD', kind: 'grid',
    domain: G(29.5, 70.5, -23.5, 62.5), edgeMarginKm: 0, clip: null,
    // ⚠⁵: 00/06/12/18 UTC → 120 h; 03/09/15/21 UTC → nur 48 h.
    horizonH: { default: 120, byRunHour: { 3: 48, 9: 48, 15: 48, 21: 48 } },
    runHours: [0, 3, 6, 9, 12, 15, 18, 21], members: 0,
    vars: ['t2m', 'td2m', 'u10', 'v10', 'gust', 'precip', 'clct', 'clcl', 'clcm', 'clch', 'ps', 'snowlmt'],
    steps: null, stepsMeasured: false,
    retentionH: 24, freeArchive: 'nur ab 2026-02 (~7 Monate)',
    licence: `${CC_BY_4} / GeoNutzV`, attribution: 'Datenbasis: Deutscher Wetterdienst',
    access: 'opendata.dwd.de/weather/nwp/icon-eu/grib — reguläres lat-lon (GDT 0, 1377×657 @ 0,0625°)',
    adapter: 'src/sources/iconEuRasterSource.ts',
    note: '⚠⁵ Für die Hälfte aller Läufe klafft zwischen 48 h und 120 h eine Lücke, die aus ICON global oder IFS gefüllt werden muss.',
  },
  {
    id: 'icon_eu_eps', name: 'ICON-EU-EPS', provider: 'DWD', kind: 'ensemble',
    domain: G(29.5, 70.5, -23.5, 62.5), edgeMarginKm: 0, clip: null,
    horizonH: { default: 120, byRunHour: { 3: 48, 9: 48, 15: 48, 21: 48 } },
    runHours: [0, 6, 12, 18], members: 40,
    vars: ['t2m', 'u10', 'v10', 'precip'], steps: null, stepsMeasured: false,
    retentionH: 24, freeArchive: null,
    licence: `${CC_BY_4} / GeoNutzV`, attribution: 'Datenbasis: Deutscher Wetterdienst',
    access: 'opendata.dwd.de', adapter: null,
  },
  {
    id: 'icon_ch2_eps', name: 'ICON-CH2-EPS', provider: 'MeteoSchweiz', kind: 'ensemble',
    domain: G(42.0, 50.5, -0.8, 17.7), edgeMarginKm: 20, clip: null,
    horizonH: { default: 120 }, runHours: [0, 6, 12, 18], members: 21,
    vars: ['t2m', 'u10', 'v10', 'precip', 'clct'], steps: null, stepsMeasured: false,
    retentionH: 24, freeArchive: null,
    licence: CC_BY_4, attribution: 'Quelle: MeteoSchweiz',
    access: 'STAC data.geo.admin.ch → rgw.cscs.ch', adapter: 'src/sources/iconChEpsSource.ts',
  },
  {
    id: 'mosmix_s', name: 'MOSMIX-S', provider: 'DWD', kind: 'points',
    domain: null, edgeMarginKm: 0, clip: null,
    horizonH: { default: 240 }, runHours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    members: 0,
    vars: ['t2m', 'td2m', 'u10', 'v10', 'gust', 'precip', 'clct', 'ps'],
    steps: null, stepsMeasured: false,
    retentionH: 48, freeArchive: null,
    licence: `${CC_BY_4} / GeoNutzV`, attribution: 'Datenbasis: Deutscher Wetterdienst',
    access: 'opendata.dwd.de/weather/local_forecasts/mos/MOSMIX_S/all_stations/kml/MOSMIX_S_LATEST_240.kmz — ALLE Stationen in EINER Datei, stündlich (am Verzeichnis geprüft 2026-09-09)',
    adapter: null,
    note: 'Stündlich statt viermal täglich, dafür weniger Parameter als MOSMIX-L. Eine Datei für alle Stationen: gut für einen Sammler, schlecht für eine Einzelabfrage.',
  },
  {
    id: 'mosmix_l', name: 'MOSMIX-L', provider: 'DWD', kind: 'points',
    domain: null, edgeMarginKm: 0, clip: null,
    horizonH: { default: 240 }, runHours: [0, 3, 6, 9, 12, 15, 18, 21], members: 0,
    vars: ['t2m', 'td2m', 'u10', 'v10', 'gust', 'precip', 'clct', 'ps'],
    steps: null, stepsMeasured: false,
    retentionH: 48, freeArchive: null,
    licence: `${CC_BY_4} / GeoNutzV`, attribution: 'Datenbasis: Deutscher Wetterdienst',
    access: 'opendata.dwd.de/weather/local_forecasts/mos/MOSMIX_L — KMZ je Station',
    adapter: 'src/sources/brightSkyForecast.ts (indirekt)',
    note: 'Stationsnetz weltweit; für CH 104 Stationen verifiziert. Die Zahlen für DE und AT sind laut Quellenmatrix §7 NICHT ermittelt — sie kommen aus dem echten mosmix_stationskatalog.cfg, nicht aus einer Annahme. PAMORE schließt MOSMIX aus, es gibt also KEIN freies Archiv.',
  },

  // ── 120–336 h: Langfrist ─────────────────────────────────────────────────
  {
    id: 'icon_global', name: 'ICON global', provider: 'DWD', kind: 'grid',
    domain: null, edgeMarginKm: 0, clip: null,
    // ⚠⁶: 00/12 UTC → 180 h; 06/18 UTC → 120 h.
    horizonH: { default: 180, byRunHour: { 6: 120, 18: 120 } },
    runHours: [0, 6, 12, 18], members: 0,
    vars: ['t2m', 'td2m', 'u10', 'v10', 'precip', 'clct', 'ps'], steps: null, stepsMeasured: false,
    retentionH: 24, freeArchive: null,
    licence: `${CC_BY_4} / GeoNutzV`, attribution: 'Datenbasis: Deutscher Wetterdienst',
    access: 'opendata.dwd.de/weather/nwp/icon/grib — NUR icosahedral (GDT 101, ~2,95 M Zellen)',
    adapter: 'src/sources/iconGlobalSource.ts',
  },
  {
    id: 'icon_eps_global', name: 'ICON-EPS global', provider: 'DWD', kind: 'ensemble',
    domain: null, edgeMarginKm: 0, clip: null,
    horizonH: { default: 180, byRunHour: { 6: 120, 18: 120 } },
    runHours: [0, 6, 12, 18], members: 40,
    vars: ['t2m', 'u10', 'v10', 'precip'], steps: null, stepsMeasured: false,
    retentionH: 24, freeArchive: null,
    licence: `${CC_BY_4} / GeoNutzV`, attribution: 'Datenbasis: Deutscher Wetterdienst',
    access: 'opendata.dwd.de', adapter: null,
  },
  {
    id: 'aicon', name: 'AICON (KI, 13 km)', provider: 'DWD', kind: 'grid',
    domain: null, edgeMarginKm: 0, clip: null,
    horizonH: { default: 180 }, runHours: [0, 6, 12, 18], members: 0,
    vars: ['t2m', 'u10', 'v10', 'precip'], steps: null, stepsMeasured: false,
    retentionH: 24, freeArchive: null,
    licence: `${CC_BY_4} / GeoNutzV`, attribution: 'Datenbasis: Deutscher Wetterdienst',
    access: 'opendata.dwd.de/weather/nwp/v1/m/aicon/p/<PARAM>/r/<RUN>/s/… — rohes GRIB2, icosahedral wie ICON global',
    adapter: 'src/sources/aiconSource.ts',
    note: 'Vorhalt nur der laufende Tag, kein freies Archiv — für die Verifikation ab Tag 1 selbst zu sammeln (§4). Kein CLCT.',
  },
  {
    id: 'ifs_hres', name: 'IFS HRES', provider: 'ECMWF', kind: 'grid',
    domain: null, edgeMarginKm: 0, clip: null,
    // ⚠⁷: 00/12 UTC (`oper`) → 360 h; 06/18 UTC (`scda`) → 144 h.
    horizonH: { default: 360, byRunHour: { 6: 144, 18: 144 } },
    runHours: [0, 6, 12, 18], members: 0,
    vars: ['t2m', 'td2m', 'u10', 'v10', 'precip', 'clct', 'ps'], steps: null, stepsMeasured: false,
    retentionH: 3 * 24, freeArchive: 's3://ecmwf-forecasts ab 2023-01-18',
    licence: CC_BY_4, attribution: 'ECMWF Open Data (ECMWF Terms of Use)',
    access: 'data.ecmwf.int/forecasts — GRIB2 + .index-Sidecar (JSON-Lines mit _offset/_length) ⇒ HTTP-Range je Parameter',
    adapter: 'src/sources/ecmwfIfsSource.ts',
    note: '⚠⁷ Für 240–336 h stehen nur die beiden Hauptläufe zur Verfügung.',
  },
  {
    id: 'ifs_ens', name: 'IFS ENS', provider: 'ECMWF', kind: 'ensemble',
    domain: null, edgeMarginKm: 0, clip: null,
    horizonH: { default: 360 }, runHours: [0, 6, 12, 18], members: 51,
    vars: ['t2m', 'u10', 'v10', 'precip'], steps: null, stepsMeasured: false,
    retentionH: 3 * 24, freeArchive: 's3://ecmwf-forecasts ab 2023-01-18',
    licence: CC_BY_4, attribution: 'ECMWF Open Data (ECMWF Terms of Use)',
    access: 'data.ecmwf.int/forecasts', adapter: 'src/sources/ecmwfIfsSource.ts',
    note: 'Die tragende Quelle für 240–336 h und die einzige mit 51 Membern ⇒ σ_ens im Langfristbereich.',
  },
  {
    id: 'aifs_single', name: 'AIFS Single', provider: 'ECMWF', kind: 'grid',
    domain: null, edgeMarginKm: 0, clip: null,
    horizonH: { default: 360 }, runHours: [0, 6, 12, 18], members: 0,
    vars: ['t2m', 'u10', 'v10', 'precip'], steps: null, stepsMeasured: false,
    retentionH: 3 * 24, freeArchive: 's3://ecmwf-forecasts ab 2023-01-18',
    licence: CC_BY_4, attribution: 'ECMWF Open Data (ECMWF Terms of Use)',
    access: 'data.ecmwf.int/forecasts (Modellpfad aifs-single)', adapter: 'src/sources/ecmwfIfsSource.ts',
  },
  {
    id: 'aifs_ens', name: 'AIFS ENS', provider: 'ECMWF', kind: 'ensemble',
    domain: null, edgeMarginKm: 0, clip: null,
    horizonH: { default: 360 }, runHours: [0, 6, 12, 18], members: 51,
    vars: ['t2m', 'u10', 'v10', 'precip'], steps: null, stepsMeasured: false,
    retentionH: 3 * 24, freeArchive: 's3://ecmwf-forecasts ab 2023-01-18',
    licence: CC_BY_4, attribution: 'ECMWF Open Data (ECMWF Terms of Use)',
    access: 'data.ecmwf.int/forecasts (Modellpfad aifs-ens)', adapter: 'src/sources/ecmwfIfsSource.ts',
  },
  {
    id: 'kenda_ch1', name: 'KENDA-CH1', provider: 'MeteoSchweiz', kind: 'analysis',
    domain: G(42.0, 50.5, -0.8, 17.7), edgeMarginKm: 20, clip: null,
    horizonH: { default: 0 }, runHours: [], members: 0,
    vars: ['t2m', 'u10', 'v10', 'precip'], steps: null, stepsMeasured: false,
    retentionH: null, freeArchive: null,
    licence: CC_BY_4, attribution: 'Quelle: MeteoSchweiz',
    access: 'STAC ch.meteoschweiz.ogd-analysis-kenda-ch1 (am Katalog geprüft 2026-09-09)',
    adapter: null,
    note: 'Eine ANALYSE, keine Vorhersage — die Collection heißt selbst `ogd-analysis`. Sie gehört damit in dieselbe Klasse wie INCA-Analyse und Radar: Anker für die Stunde 0, nicht Träger eines Vorhersagebands. Horizont deshalb 0.',
  },
  {
    id: 'gfs', name: 'NOAA GFS / GEFS', provider: 'NOAA', kind: 'grid',
    domain: null, edgeMarginKm: 0, clip: null,
    horizonH: { default: 384 }, runHours: [0, 6, 12, 18], members: 0,
    vars: ['t2m', 'u10', 'v10', 'precip', 'clct'], steps: null, stepsMeasured: false,
    retentionH: null, freeArchive: 'ab 2021 (GFS) bzw. 2017 (GEFS)',
    licence: 'Public Domain', attribution: 'NOAA (Attribution erbeten)',
    access: 'NOAA-S3 mit .idx-Byte-Bereichen', adapter: 'src/sources/gfs2dSource.ts',
    note: 'In der Quellenmatrix §1 nicht als tragende Quelle geführt — hier als benannter Rückfall, weil das Repo den Adapter bereits hat und GFS als einzige Langfristquelle ein tiefes freies Archiv besitzt.',
  },
]);

export const SOURCE_BY_ID: Readonly<Record<string, Source>> = Object.freeze(
  Object.fromEntries(SOURCES.map((s) => [s.id, s])),
);

/**
 * Ein gemessener Widerspruch in `QUELLENMATRIX.md` ⚠², festgehalten statt geglättet.
 *
 * Die Fußnote begründet die Unbrauchbarkeit von ICON-CH1 in Ostösterreich damit, dass
 * „die Ostspitze Österreichs […] nur ~15–20 km vom Rand entfernt" liege. Nachgerechnet
 * an der in §2 angegebenen Domäne (Ostrand 17,7 °E) und der Ostspitze Österreichs
 * (Deutsch Jahrndorf, 17,16 °E / 48,0 °N, 1° Länge = 74,49 km): **40,2 km**, nicht 15–20.
 *
 * Die wahrscheinliche Ursache: ICON-CH läuft auf einem **rotierten Pol**; „42,0–50,5 °N /
 * 0,8 °W–17,7 °E" ist die HÜLLE dieses Gitters, nicht sein Rand bei 48 °N. Der echte Rand
 * verläuft dort weiter westlich. Damit ist die Fußnote plausibel und die Bounding-Box
 * trotzdem das falsche Werkzeug: eine Hülle überschätzt die Abdeckung in den Ecken.
 *
 * Konsequenz für den Code: die Abdeckung von ICON-CH wird **nicht** aus der Hülle
 * entschieden, sondern aus der Länderzuordnung in §1 — dort steht ICON-CH nur in der
 * CH-Spalte. `MATRIX_BANDS` ist deshalb kein Zierrat, sondern der Ersatz für eine
 * Geometrie, die die Quellenmatrix nicht hergibt. Quellenmatrix §7 nennt genau das als
 * offenen Punkt: „Praktisch nutzbarer Rand der ICON-CH-Domain in Ostösterreich: 20 km
 * Einschnitt ist eine Annahme nach Open-Meteo-Vorbild, keine Messung." → V-PD-5
 */
export const CH_EDGE_DISCREPANCY = Object.freeze({
  claimedKm: [15, 20] as const,
  measuredKm: 40.2,
  atLat: 48.0,
  atLon: 17.16,
  domainEastLon: 17.7,
  reason: 'rotierter Pol: 17,7 °E ist die Hülle des Gitters, nicht der Rand bei 48 °N',
  improvement: 'V-PD-5',
});

/**
 * Namen, die `QUELLENMATRIX.md` §1 eigenständig nennt, die hier aber bewusst zu einer
 * Quelle zusammengefasst sind — mit dem Grund, nicht nur der Zuordnung.
 *
 * Ohne diese Tabelle wäre die Zusammenfassung unsichtbar: `RADOLAN RY, HG` stünde in
 * der Matrix und in keiner Registry, und niemand könnte sagen, ob das Absicht ist oder
 * ein Loch. `verify:point-data` liest die Matrix und löst JEDEN dort genannten Namen
 * über diese Tabelle auf — ein neuer Name im Dokument macht den Verifier rot.
 */
export const MATRIX_ALIASES: Readonly<Record<string, { id: string; why: string }>> = Object.freeze({
  'RADOLAN RY': { id: 'radvor_rv', why: 'Dieselbe DE1200-Kachelung und derselbe Spiegel wie RV; RY ist die Analyse, RV die Extrapolation.' },
  'RADOLAN HG': { id: 'radvor_rv', why: 'wie RY — Niederschlagsart statt Rate, gleicher Transportweg.' },
  RADOLAN: { id: 'radvor_rv', why: 'Sammelname für RY/HG, s. o.' },
  HG: { id: 'radvor_rv', why: 'In der Matrix als „RADOLAN RY, HG" geschrieben — nach dem Komma bleibt der nackte Produktname stehen.' },
  'INCA Nowcast': { id: 'inca', why: 'Die Registry führt Analyse und Nowcast als eine Quelle („INCA Analyse / Nowcast"), weil beide über denselben GeoSphere-Endpunkt und denselben Spiegel kommen.' },
  RV: { id: 'radvor_rv', why: 'Kurzform von RADVOR RV in der AT-Spalte (⚠¹).' },
  'PRECIP RZC': { id: 'combiprecip', why: 'RZC ist das Radar-Produkt, CombiPrecip die eichkorrigierte Kombination; im Repo liegen beide unter radar/img/v1/rzc.' },
  IFS: { id: 'ifs_hres', why: 'In der 120–180-h-Zeile ohne Zusatz genannt; gemeint ist der deterministische Lauf.' },
});

// ---------------------------------------------------------------------------
// §1 der Quellenmatrix, wörtlich transkribiert
// ---------------------------------------------------------------------------

export type Country = 'DE' | 'AT' | 'CH';

export interface MatrixBand {
  readonly fromH: number;
  readonly toH: number;
  readonly byCountry: Readonly<Record<Country, {
    readonly primary: readonly string[];
    readonly secondary: readonly string[];
  }>>;
}

/**
 * Die Tabelle aus `QUELLENMATRIX.md` §1 — Zeile für Zeile, **fett** = `primary`.
 *
 * Warum sie neben `SOURCES` steht: die Matrix trifft zwei verschiedene Aussagen.
 * `SOURCES.domain` sagt, wo eine Quelle physisch Werte hat; diese Tabelle sagt, wo sie
 * **eingesetzt werden soll**. Die beiden fallen auseinander, wo eine Domänenhülle mehr
 * verspricht als das Gitter hält (s. `CH_EDGE_DISCREPANCY`). Der Ingest schneidet beides:
 * zugeordnet UND geometrisch gedeckt UND innerhalb des Horizonts.
 */
export const MATRIX_BANDS: readonly MatrixBand[] = Object.freeze([
  { fromH: 0, toH: 3, byCountry: {
    DE: { primary: ['radvor_rv', 'icon_d2'], secondary: [] },
    AT: { primary: ['inca', 'icon_d2'], secondary: ['radvor_rv'] },
    CH: { primary: ['combiprecip', 'icon_ch1_eps'], secondary: [] },
  } },
  { fromH: 3, toH: 33, byCountry: {
    DE: { primary: ['icon_d2'], secondary: ['icon_d2_eps', 'mosmix_l'] },
    AT: { primary: ['claef'], secondary: ['icon_d2', 'mosmix_l'] },
    CH: { primary: ['icon_ch1_eps'], secondary: ['icon_d2'] },
  } },
  { fromH: 33, toH: 48, byCountry: {
    DE: { primary: ['icon_d2'], secondary: ['icon_d2_eps', 'mosmix_l'] },
    AT: { primary: ['claef'], secondary: ['icon_d2', 'mosmix_l'] },
    CH: { primary: ['icon_ch2_eps'], secondary: ['icon_d2'] },
  } },
  { fromH: 48, toH: 60, byCountry: {
    DE: { primary: ['icon_eu'], secondary: ['icon_eu_eps', 'mosmix_l'] },
    AT: { primary: ['claef'], secondary: ['icon_eu', 'mosmix_l'] },
    CH: { primary: ['icon_ch2_eps'], secondary: ['icon_eu'] },
  } },
  { fromH: 60, toH: 120, byCountry: {
    DE: { primary: ['icon_eu'], secondary: ['icon_eu_eps', 'mosmix_l'] },
    AT: { primary: ['icon_eu'], secondary: ['icon_eu_eps', 'mosmix_l'] },
    CH: { primary: ['icon_ch2_eps'], secondary: ['icon_eu'] },
  } },
  { fromH: 120, toH: 180, byCountry: {
    DE: { primary: ['icon_global', 'aicon'], secondary: ['icon_eps_global', 'mosmix_l', 'ifs_hres'] },
    AT: { primary: ['icon_global', 'aicon'], secondary: ['icon_eps_global', 'mosmix_l', 'ifs_hres'] },
    CH: { primary: ['icon_global', 'aicon'], secondary: ['icon_eps_global', 'ifs_hres'] },
  } },
  { fromH: 180, toH: 240, byCountry: {
    DE: { primary: ['ifs_hres', 'ifs_ens', 'aifs_single', 'aifs_ens'], secondary: ['mosmix_l'] },
    AT: { primary: ['ifs_hres', 'ifs_ens', 'aifs_single', 'aifs_ens'], secondary: ['mosmix_l'] },
    CH: { primary: ['ifs_hres', 'ifs_ens', 'aifs_single', 'aifs_ens'], secondary: ['mosmix_l'] },
  } },
  { fromH: 240, toH: 336, byCountry: {
    DE: { primary: ['ifs_ens', 'aifs_ens'], secondary: ['ifs_hres'] },
    AT: { primary: ['ifs_ens', 'aifs_ens'], secondary: ['ifs_hres'] },
    CH: { primary: ['ifs_ens', 'aifs_ens'], secondary: ['ifs_hres'] },
  } },
]);

/** Quellen, die §1 diesem Land und dieser Vorhersagestunde zuordnet. */
export function assignedSources(country: Country, leadH: number): {
  primary: readonly string[]; secondary: readonly string[];
} {
  // `>` an der Untergrenze, `<=` an der Obergrenze: die Bänder der Matrix stoßen
  // aneinander (…–33 h / 33–48 h), 33 h gehört zum ersten. Bei 0 h greift das erste Band.
  const band = MATRIX_BANDS.find((b) => (leadH > b.fromH || b.fromH === 0) && leadH <= b.toH);
  return band ? band.byCountry[country] : { primary: [], secondary: [] };
}

/**
 * Reine Punktquelle in der Schweiz — in der Matrix als **Benchmark** benannt, nicht als
 * Fusionsquelle: „gleichzeitig der Benchmark, den der Algorithmus in der Schweiz schlagen
 * muss" (⚠⁴). Deshalb steht E4 nicht in `SOURCES`: es würde sonst in die Fusion geraten
 * und den Maßstab mitverschieben, an dem gemessen wird. §21 (8) hält offen, ob es
 * abgerufen werden muss.
 */
export const BENCHMARKS = Object.freeze([
  Object.freeze({
    id: 'e4_local', name: 'E4 Local Forecast', provider: 'MeteoSchweiz' as const,
    domain: G(45.82, 47.81, 5.96, 10.49),
    horizonH: 216, points: 6000,
    note: '~6 000 feste Punkte (PLZ, SwissMetNet-Stationen, Berg-POIs), ausschließlich in der Schweiz, keine grenzüberschreitenden Punkte. Kandidat im STAC: `ch.meteoschweiz.ogd-local-forecasting` — am Katalog GESEHEN, aber NICHT geprüft, ob es dasselbe Produkt ist.',
  }),
]);

/**
 * Ausdrücklich blockiert (`QUELLENMATRIX.md` §5). Steht hier, damit niemand sie
 * versehentlich einbaut — und damit ein Verifier es prüfen kann.
 */
export const BLOCKED = Object.freeze([
  Object.freeze({ id: 'ch_nowcast_e1', reason: 'nur auf Anfrage' }),
  Object.freeze({ id: 'dwd_pamore', reason: 'Forschung/Lehre, entgeltpflichtig' }),
  Object.freeze({ id: 'open_meteo_free', reason: 'nicht-kommerziell (D-18)' }),
  Object.freeze({ id: 'corine_direct', reason: 'Registrierung nötig' }),
  Object.freeze({ id: 'netatmo', reason: 'OAuth-Key, Lizenz ungeklärt' }),
  Object.freeze({ id: 'lightning_commercial', reason: 'kostenpflichtig oder nicht-kommerziell' }),
]);

/**
 * Terminierte Änderungen (`QUELLENMATRIX.md` §6). Ein Datum in einer Prosa-Tabelle
 * wird übersehen; hier kann der Verifier davor warnen (V-PD-2 ist genau dieser Fall:
 * `nwp-v1-1h-2500m` fiele sonst still aus, wie der RADOLAN-Frühstart bei V-LE-12).
 */
export const SCHEDULED_CHANGES = Object.freeze([
  Object.freeze({
    on: '2026-11-01', what: 'GeoSphere nwp-v1-1h-2500m (AROME 2,5 km) wird abgeschaltet',
    action: 'auf nwp-v2-1h-1km (C-LAEF AlpeAdria) migrieren; nicht neu darauf bauen',
    affects: ['claef'], improvement: 'V-PD-2',
  }),
  Object.freeze({
    on: '2026-09-30', what: 'data.dynamical.org ändert den Zugriffsweg',
    action: 'nur relevant, falls das ICON-EU-Teilarchiv genutzt wird', affects: ['icon_eu'], improvement: null,
  }),
  Object.freeze({
    on: '2026-12-31', what: 'MeteoSchweiz kündigt eine Einzelabfrage-API an',
    action: 'Chance: der CH-Nowcast könnte damit öffnen', affects: ['combiprecip'], improvement: null,
  }),
  Object.freeze({
    on: null, what: 'Copernicus DEM: CDSE hat den View-Service eingeschränkt (25.08.2026)',
    action: 'AWS-Bucket nutzen, Derivate selbst spiegeln', affects: [], improvement: null,
  }),
]);

// ---------------------------------------------------------------------------
// Geometrische Auswahl
// ---------------------------------------------------------------------------

const KM_PER_DEG_LAT = 111.32;

/** Liegt der Punkt in der Domäne — mit dem geforderten Sicherheitsabstand zum Rand? */
export function coversPoint(src: Source, lat: number, lon: number): boolean {
  for (const box of [src.domain, src.clip]) {
    if (!box) continue;
    const margin = box === src.domain ? src.edgeMarginKm : 0;
    const dLat = margin / KM_PER_DEG_LAT;
    // Der Längengrad schrumpft mit dem Kosinus der Breite — bei 47 °N ist ein Grad
    // 76 km statt 111. Ein fester Grad-Abstand wäre am Alpenrand zu knapp.
    const dLon = margin / (KM_PER_DEG_LAT * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
    if (lat < box.latMin + dLat || lat > box.latMax - dLat) return false;
    if (lon < box.lonMin + dLon || lon > box.lonMax - dLon) return false;
  }
  return true;
}

/** Vorhersagelänge dieses Laufs (⚠⁵/⚠⁶/⚠⁷ sind hier eingebaut). */
export function horizonFor(src: Source, runHourUtc: number): number {
  return src.horizonH.byRunHour?.[runHourUtc] ?? src.horizonH.default;
}

/**
 * Welche Quellen tragen diesen Punkt zu dieser Vorhersagestunde? Geometrisch entschieden,
 * nicht über das Land — das ist die zentrale Forderung der Quellenmatrix §2.
 */
export function sourcesForPoint(
  lat: number, lon: number, leadH: number, runHourUtc: number,
): readonly Source[] {
  return SOURCES.filter((s) => coversPoint(s, lat, lon) && leadH <= horizonFor(s, runHourUtc));
}

/** Wie viele Tage bis zu einer terminierten Änderung? `null`, wenn kein Datum feststeht. */
export function daysUntil(change: { on: string | null }, nowMs = Date.now()): number | null {
  if (!change.on) return null;
  return Math.round((Date.parse(`${change.on}T00:00:00Z`) - nowMs) / 86_400_000);
}

/**
 * Quellen ohne freies Archiv — „Alles außer den ECMWF- und NOAA-Quellen muss ab Tag 1
 * selbst archiviert werden […]. Jeder Tag ohne diesen Job ist für die Verifikation
 * dauerhaft verloren." (§4). Diese Liste ist die Schnittstelle zu `buscosun-archiv` (PA).
 */
export function mustSelfArchive(): readonly Source[] {
  return SOURCES.filter((s) => s.freeArchive == null);
}

/** Attributionszeilen aller Quellen, die tatsächlich in einen Lauf eingegangen sind. */
export function attributionFor(sourceIds: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  for (const id of sourceIds) {
    const s = SOURCE_BY_ID[id];
    if (s) seen.add(s.attribution);
  }
  return [...seen].sort();
}

/** Der Inhalt von `point/sources.json` — genau diese Datei, kein zweites Format. */
export function buildSourcesJson(): unknown {
  return {
    schema: 1,
    from: 'QUELLENMATRIX.md (Stand 2026-09-09)',
    note: 'Maschinenlesbare Fassung. Schrittlisten sind null, solange sie nicht am Verzeichnis gemessen wurden (stepsMeasured).',
    sources: SOURCES,
    benchmarks: BENCHMARKS,
    blocked: BLOCKED,
    scheduledChanges: SCHEDULED_CHANGES,
  };
}

// ---------------------------------------------------------------------------
// Selbsttest
// ---------------------------------------------------------------------------

export interface MatrixCheck { name: string; ok: boolean; detail?: string }

export function sourceMatrixSelfTest(nowMs = Date.now()): {
  checks: MatrixCheck[]; passed: number; total: number;
} {
  const checks: MatrixCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  add('Quellen-IDs eindeutig', new Set(SOURCES.map((s) => s.id)).size === SOURCES.length);
  add('jede Quelle nennt Lizenz und Attribution',
    SOURCES.every((s) => s.licence.length > 0 && s.attribution.length > 0));
  add('jede Quelle nennt einen Zugriffsweg', SOURCES.every((s) => s.access.length > 0));
  add('Domänen sind wohlgeformt',
    SOURCES.every((s) => !s.domain || (s.domain.latMin < s.domain.latMax && s.domain.lonMin < s.domain.lonMax)));
  add('keine blockierte Quelle steht in SOURCES',
    !SOURCES.some((s) => BLOCKED.some((b) => b.id === s.id)));

  // Die Fußnoten — jede einzeln geprüft, weil jede eine eigene stille Falle ist.
  const wien = { lat: 48.21, lon: 16.37 };
  const bregenz = { lat: 47.50, lon: 9.75 };
  add('⚠¹ RV deckt Bregenz, nicht Wien',
    coversPoint(SOURCE_BY_ID.radvor_rv, bregenz.lat, bregenz.lon)
    && !coversPoint(SOURCE_BY_ID.radvor_rv, wien.lat, wien.lon));
  add('⚠¹ INCA deckt Wien',
    coversPoint(SOURCE_BY_ID.inca, wien.lat, wien.lon));
  add('⚠² ICON-CH1 deckt Bern', coversPoint(SOURCE_BY_ID.icon_ch1_eps, 46.95, 7.45));
  add('⚠² ICON-CH1 endet vor 18 °E', !coversPoint(SOURCE_BY_ID.icon_ch1_eps, 48.0, 18.0));
  // Der gemessene Widerspruch, festgehalten als Prüfung: die Hülle würde Ostösterreich
  // decken, die Zuordnung in §1 tut es nicht. Wer eines Tages `clip` setzt, muss hier vorbei.
  {
    const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((CH_EDGE_DISCREPANCY.atLat * Math.PI) / 180);
    const measured = (CH_EDGE_DISCREPANCY.domainEastLon - CH_EDGE_DISCREPANCY.atLon) * kmPerDegLon;
    add('⚠² gemessener Randabstand der AT-Ostspitze',
      Math.abs(measured - CH_EDGE_DISCREPANCY.measuredKm) < 0.5,
      `${measured.toFixed(1)} km — die Fußnote nennt ${CH_EDGE_DISCREPANCY.claimedKm.join('–')} km`);
    add('⚠² Hülle deckt Ostösterreich, die Länderzuordnung nicht',
      coversPoint(SOURCE_BY_ID.icon_ch1_eps, wien.lat, wien.lon)
      && !assignedSources('AT', 12).primary.includes('icon_ch1_eps')
      && !assignedSources('AT', 12).secondary.includes('icon_ch1_eps'),
      'deshalb entscheidet MATRIX_BANDS, nicht die Bounding-Box');
  }
  add('⚠³ C-LAEF ist als percentiles geführt, nicht als ensemble',
    SOURCE_BY_ID.claef.kind === 'percentiles' && SOURCE_BY_ID.claef.members === 0);
  add('⚠⁴ E4 steht NICHT in SOURCES', !SOURCES.some((s) => s.id === 'e4_local'));
  add('⚠⁵ ICON-EU 03/09/15/21 UTC nur 48 h',
    [3, 9, 15, 21].every((h) => horizonFor(SOURCE_BY_ID.icon_eu, h) === 48)
    && [0, 6, 12, 18].every((h) => horizonFor(SOURCE_BY_ID.icon_eu, h) === 120));
  add('⚠⁶ ICON global 06/18 UTC nur 120 h',
    horizonFor(SOURCE_BY_ID.icon_global, 6) === 120 && horizonFor(SOURCE_BY_ID.icon_global, 0) === 180);
  add('⚠⁷ IFS HRES 06/18 UTC nur 144 h',
    horizonFor(SOURCE_BY_ID.ifs_hres, 6) === 144 && horizonFor(SOURCE_BY_ID.ifs_hres, 0) === 360);

  // Die Lücke, die die Matrix selbst benennt: bei 03/09/15/21 UTC endet ICON-EU bei
  // 48 h, ICON global läuft dann gar nicht — nur IFS reicht über die Lücke.
  {
    const at90 = sourcesForPoint(50.1, 8.7, 90, 9).map((s) => s.id);
    add('⚠⁵ Lücke 48–120 h bei 09 UTC wird von IFS gefüllt',
      !at90.includes('icon_eu') && at90.includes('ifs_hres'), at90.join(','));
  }

  // 336 h ist nur mit den beiden Hauptläufen erreichbar.
  {
    const at336run0 = sourcesForPoint(48.2, 16.4, 336, 0).map((s) => s.id);
    const at336run6 = sourcesForPoint(48.2, 16.4, 336, 6).map((s) => s.id);
    add('336 h: 00 UTC trägt, 06 UTC trägt nur die ENS',
      at336run0.includes('ifs_hres') && !at336run6.includes('ifs_hres') && at336run6.includes('ifs_ens'),
      `00z ${at336run0.length} Quellen, 06z ${at336run6.length}`);
  }

  // Jede Cube-Stufe muss von mindestens einer Quelle getragen werden, die es gibt.
  add('alle in Stufen genannten Quellen existieren',
    ['icon_d2', 'icon_eu', 'ifs_ens'].every((id) => SOURCE_BY_ID[id] != null));

  // Selbstarchivierung: der Satz aus §4 als Prüfung.
  {
    const self = mustSelfArchive().map((s) => s.id);
    add('Selbstarchivierung: alles außer ECMWF/NOAA',
      self.includes('icon_d2') && self.includes('aicon') && self.includes('mosmix_l')
      && !self.includes('ifs_ens') && !self.includes('gfs'),
      `${self.length} Quellen ohne freies Archiv`);
  }

  // Terminierte Änderungen: eine überfällige Migration muss auffallen.
  for (const c of SCHEDULED_CHANGES) {
    const d = daysUntil(c, nowMs);
    if (d == null) continue;
    add(`Termin nicht überfällig: ${c.what.slice(0, 42)}…`, d > 0, `${d} Tage`);
  }

  // §1 als Tabelle: jede genannte Quelle muss existieren, und jedes Band muss
  // für jedes Land eine Primärquelle haben — eine leere Zelle wäre eine Lücke im Produkt.
  {
    const ids = new Set<string>();
    for (const b of MATRIX_BANDS) for (const c of ['DE', 'AT', 'CH'] as const) {
      for (const id of [...b.byCountry[c].primary, ...b.byCountry[c].secondary]) ids.add(id);
    }
    add('§1: jede genannte Quelle existiert',
      [...ids].every((id) => SOURCE_BY_ID[id] != null),
      [...ids].filter((id) => !SOURCE_BY_ID[id]).join(',') || `${ids.size} Quellen`);
    add('§1: jedes Band hat je Land eine Primärquelle',
      MATRIX_BANDS.every((b) => (['DE', 'AT', 'CH'] as const).every((c) => b.byCountry[c].primary.length > 0)));
    add('§1: Bänder decken 0…336 h lückenlos',
      MATRIX_BANDS[0].fromH === 0 && MATRIX_BANDS[MATRIX_BANDS.length - 1].toH === 336
      && MATRIX_BANDS.every((b, i) => i === 0 || b.fromH === MATRIX_BANDS[i - 1].toH));
    // Nicht JEDE Primärquelle muss das ganze Band tragen — MINDESTENS EINE muss es.
    // Das ist keine Weichspülung, sondern die Aussage der Matrix: im 0–3-h-Band reicht
    // RADVOR RV nur „≈ +2 h" und CombiPrecip ist eine Analyse ohne Vorhersagelänge;
    // die Stunde 3 trägt dort ICON-D2 bzw. ICON-CH1. Eine Prüfung „jede Quelle bis toH"
    // wäre gegen die Wirklichkeit rot und würde zum Abschalten verleiten.
    const bandReach = (b: MatrixBand, c: Country) => Math.max(0, ...b.byCountry[c].primary.map((id) => {
      const s = SOURCE_BY_ID[id];
      // Der günstigste Lauf zählt — ⚠⁵/⚠⁶/⚠⁷ nehmen manchen Läufen die Reichweite.
      return s == null ? 0 : Math.max(...s.runHours.map((h) => horizonFor(s, h)), s.horizonH.default);
    }));
    add('§1: jedes Band wird von mindestens einer Primärquelle voll getragen',
      MATRIX_BANDS.every((b) => (['DE', 'AT', 'CH'] as const).every((c) => bandReach(b, c) >= b.toH)),
      MATRIX_BANDS.flatMap((b) => (['DE', 'AT', 'CH'] as const)
        .filter((c) => bandReach(b, c) < b.toH).map((c) => `${b.fromH}–${b.toH} ${c}`)).join(' ') || 'alle');
    add('§1: Quellen ohne Vorhersagelänge sind als Nowcast oder Analyse deklariert',
      SOURCES.filter((s) => s.horizonH.default <= 3).every((s) => s.kind === 'nowcast' || s.kind === 'analysis'),
      SOURCES.filter((s) => s.horizonH.default <= 3).map((s) => `${s.id}:${s.kind}`).join(' '));
    add('AT bekommt ICON-CH in keinem Band',
      MATRIX_BANDS.every((b) => ![...b.byCountry.AT.primary, ...b.byCountry.AT.secondary]
        .some((id) => id.startsWith('icon_ch'))));
    add('CH bekommt in 0–48 h eine CH-Quelle',
      MATRIX_BANDS.filter((b) => b.toH <= 48)
        .every((b) => b.byCountry.CH.primary.some((id) => id.startsWith('icon_ch') || id === 'combiprecip')));
  }

  add('Attribution wird ohne Dubletten gebaut',
    attributionFor(['icon_d2', 'icon_eu', 'mosmix_l']).length === 1,
    attributionFor(['icon_d2', 'icon_eu', 'mosmix_l']).join(' | '));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
