/**
 * Waldbrand DACH — Layer-Modell (pur, DOM-frei, headless verifizierbar nach D-12).
 *
 * Enthält, was die Ansicht über ihre Layer WEISS, nicht wie sie sie zeichnet:
 * Layer-Union, Presets, Z-Band-Reihenfolge, die Auswahl-Kaskade je Land und die
 * quellenreinen Stufentabellen.
 *
 * ── Zwei Regeln, die dieses Modul durchsetzt ─────────────────────────────────
 *
 * 1. **Nationale Skalen werden nie ineinander umgerechnet.** „Geringe Gefahr"
 *    ist in Deutschland Stufe 2 und in der Schweiz Stufe 1; die zugrunde
 *    liegenden Modelle sind verschieden (DWD-Bestandsmodell vs. Canadian FWI)
 *    und beide behördlich überformt. Deshalb gibt es `FIRE_SOURCE_DE`,
 *    `FIRE_SOURCE_CH` und `FIRE_SOURCE_EU` als **getrennte** Tabellen und
 *    bewusst KEINE Übersetzungsfunktion. Muster: `warnings/warnField.ts:65-109`,
 *    wo dasselbe Problem für die Warnstufen schon einmal gelöst wurde.
 *
 * 2. **Farben, die nicht amtlich sind, sagen das.** In WB0 gemessen: das
 *    BAFU-GeoJSON führt `region_id, canton, level, name_*, title_*, valid_from`
 *    — und **kein** Farbfeld. Jede Schweizer Farbe ist damit unsere Zutat und
 *    trägt `colorOrigin: 'derived'`. Beleg: `audit/waldbrand-transport.md` §5.
 *
 * Kein Fetch, kein Modulzustand, kein React — `npm run verify:fire-model`
 * importiert dieses Modul direkt.
 */

import type { Country } from '../types';

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

/**
 * Die Layer der Waldbrand-Ansicht.
 *
 * Bewusst **eigene** Union statt `LayerKey` aus der Wetterkarte: die beiden
 * Kartenansichten haben verschiedene Quellen, Zeitmodelle und Z-Ordnungen, und
 * eine geteilte Union würde sie aneinander koppeln (`architecture.md` §14.5).
 *
 * MVP (WB2) sind die ersten fünf. Die drei Ausbau-Layer stehen schon hier, weil
 * die Bit-Reihenfolge des Permalinks daraus abgeleitet wird und ein späterer
 * Einschub die Reihenfolge verschieben würde — siehe `FIRE_LAYER_ORDER`.
 */
export type FireLayerId =
  | 'fireDanger'          // EU-Gefahrenindex (GWIS ecmwf.fwi) — die durchgehende Fläche
  | 'fireHotspots'        // Satelliten-Thermalanomalien (GWIS viirs.hs.today/.week)
  | 'fireWeather'         // ICON-D2-Treiber (relhum_2m, t_2m, vmax_10m, tot_prec)
  | 'fireDrought'         // WB4: EDO smian/smand
  | 'fireVegetation'      // WB4: EDO fpanv
  | 'fireFuel'            // WB4: EFFIS fuel_map (Brennmaterial)
  | 'fireBurnt'           // WB4: EFFIS modis.ba.poly (fruehere Brandflaechen)
  | 'fireContext'         // WB4: EEA Natura 2000 (Schutzgebiete, CH fehlt)
  | 'fireWind'            // WW1: ICON-D2 u/v 10 m — der Windlayer der Wetterkarte, 1:1
  | 'fireSoilDryness'     // WT1: ICON-D2 smi — Bodentrockenheit, zwei Tiefen
  | 'fireFootprints'      // BP2: Brandflächen je Brand (Registry) — Polygone + Panel links
  | 'fireSpread';         // SF1: Ausbreitungsrichtung aktiver Brände — Pfeil + Fächer (FBP)

/**
 * Die im MVP (WB2) tatsächlich gebauten Layer.
 *
 * 2026-08-19: `fireIndexNational` („Amtliche Stufe", DWD-Stationen + BAFU-
 * Warnregionen) ist auf Jans Auftrag ZURÜCKGEZOGEN — die Funktion wird nicht
 * mehr gebraucht. Sein Bit-Platz bleibt in `FIRE_BIT_ORDER` reserviert, damit
 * geteilte `#wb=`-Links nicht auf andere Layer zeigen. Ebenso zurückgezogen
 * (Jans Auftrag, gleicher Tag): `fireBans` („Feuerverbote (CH)", BAFU-
 * Präventionsmassnahmen) — Bit 4 bleibt reserviert.
 */
export const FIRE_MVP_LAYERS: readonly FireLayerId[] = [
  'fireDanger', 'fireHotspots', 'fireWeather',
] as const;

/** Erst nach Jans Freigabe (WB4). Sichtbar, aber nicht schaltbar. */
export const FIRE_EXTENDED_LAYERS: readonly FireLayerId[] = [
  'fireDrought', 'fireVegetation', 'fireFuel', 'fireBurnt', 'fireContext',
] as const;

/**
 * WW1 — Layer, die **wertgleich aus der Wetterkarte** kommen: dieselben Module,
 * dieselben Optionen, dieselben Bytes (`audit/waldbrand-wind.md` §1). Sie sind
 * weder MVP noch Ausbaustufe 2, sondern eine eigene Herkunft — deshalb eine
 * eigene Liste statt eines Einschubs in eine der beiden bestehenden.
 *
 * Wird um `fireTemp`/`firePrecip` wachsen (Jans Auftrag vom 2026-08-15 nennt
 * drei Layer); jeder kommt in seiner eigenen Phase und wird hier ANGEHÄNGT.
 */
export const FIRE_WEATHER_MAP_LAYERS: readonly FireLayerId[] = [
  'fireWind', 'fireSoilDryness',
] as const;

/**
 * BP2 — die Brand-Registry als Layer: ein Polygon je Brand (EFFIS-Fläche,
 * sonst Detektionsraster, sonst Hülle) in Statusfarbe, gesteuert über das
 * Panel links. Eigene Herkunft (Komposition aus Hotspots + Kartierung), deshalb
 * eigene Liste — und wie WW1 HINTEN angehängt: Bit 12.
 */
export const FIRE_FOOTPRINT_LAYERS: readonly FireLayerId[] = ['fireFootprints'] as const;

/**
 * SF1 — die Ausbreitungsrichtung aktiver Brände: ein Pfeil je Brand (FBP-Vektor
 * aus ICON-D2-Wind, stündlichem ISI und Hangneigung) plus Unsicherheitsfächer.
 * Eigene Herkunft: keine Fremdfläche, kein Wetterkarten-Layer, sondern eine
 * Aussage JE BRAND — deshalb eigene Liste, HINTEN angehängt: Bit 14.
 *
 * Bit 13 (`fireForecast`, WF4-Rasterfläche „Feuerwetter stündlich") wurde am
 * 2026-08-19 auf Jans Entscheidung zurückgezogen: die Fläche beantwortete nicht
 * die Frage „wohin läuft dieser Brand". Die DATENQUELLE bleibt in Betrieb —
 * `iconD2FireWeather.ts` liefert den ISI, aus dem die Pfeile rechnen.
 */
export const FIRE_SPREAD_LAYERS: readonly FireLayerId[] = ['fireSpread'] as const;

/**
 * **Die** Reihenfolge — Quelle der Permalink-Bitmaske und der Legendensortierung.
 *
 * ⚠️ Anhängen erlaubt, umsortieren nie: Bit *n* gehört dauerhaft zu Eintrag *n*,
 * sonst öffnen bestehende `#wb=`-Links andere Layer als beim Teilen.
 * `verify:fire-model` prüft, dass hier **jede** `FireLayerId` genau einmal steht
 * — das ist die Lehre aus `mapState.ts:24`, wo 7 von 19 Layern fehlen und
 * deshalb stillschweigend nicht permalink-fähig sind (V-191).
 *
 * `FIRE_WEATHER_MAP_LAYERS` steht deshalb HINTEN: `fireWind` bekommt Bit 10,
 * die Bits 0…9 aller bestehenden Links bleiben unangetastet.
 */
export const FIRE_BIT_ORDER: readonly (FireLayerId | null)[] = [
  'fireDanger',
  // Bit 1 — „Amtliche Stufe" (`fireIndexNational`), 2026-08-19 zurückgezogen.
  // Der Platz bleibt LEER statt zu verschwinden: sonst rutschte jedes folgende
  // Bit um eins, und ein geteilter Link würde andere Layer öffnen als beim
  // Teilen. `null` heißt „dieses Bit gehörte einmal einem Layer" — beim
  // Dekodieren fällt es einfach weg.
  null,
  'fireHotspots', 'fireWeather',
  // Bit 4 — „Feuerverbote (CH)" (`fireBans`), 2026-08-19 zurückgezogen. Wie
  // Bit 1 bleibt der Platz LEER, damit geteilte Links keine anderen Layer
  // öffnen.
  null,
  ...FIRE_EXTENDED_LAYERS, ...FIRE_WEATHER_MAP_LAYERS, ...FIRE_FOOTPRINT_LAYERS,
  // Bit 13 — „Feuerwetter stündlich" (`fireForecast`), 2026-08-19 zurückgezogen
  // (Jans Entscheidung, s. audit/waldbrand-ausbreitung.md §5). Wie bei Bit 1
  // bleibt der Platz LEER, damit geteilte Links keine anderen Layer öffnen.
  null,
  ...FIRE_SPREAD_LAYERS,
] as const;

/** Die lebenden Layer in Bit-Reihenfolge — ohne die zurückgezogenen Plätze. */
export const FIRE_LAYER_ORDER: readonly FireLayerId[] =
  FIRE_BIT_ORDER.filter((l): l is FireLayerId => l !== null);

/**
 * Z-Bänder: kleinere Zahl liegt weiter unten. Absichtlich grob gestuft, damit
 * ein neuer Layer sich einordnen kann, ohne dass alle anderen neue Werte
 * brauchen.
 *
 * Die Logik dahinter: Flächen unten, Geometrien darüber, Punkte ganz oben —
 * sonst verdeckt eine Rasterfläche die Stationspunkte, die sie erklären soll.
 */
export const FIRE_Z_BAND: Record<FireLayerId, number> = {
  fireDanger: 10,          // EU-Rasterfläche — die Grundfläche
  fireDrought: 20,
  fireVegetation: 30,
  fireContext: 5,          // Schutzgebiete als unterste Kontextflaeche
  fireFuel: 40,
  fireBurnt: 45,           // fruehere Brandflaechen ueber dem Brennmaterial
  fireWeather: 50,         // ICON-D2-ScalarLayer über den Fremdrastern
  // Bodentrockenheit ist eine FLÄCHE und gehört zu den Rastern, nicht nach oben
  // zu den Partikeln: sie liegt direkt über dem Luft-Treiber, damit beide
  // Treiber zusammen und unter den Gefahrenangaben stehen. Im Dock steht sie
  // trotzdem UNTER dem Wind (Jans Auftrag) — Dock-Reihenfolge und Z-Ordnung
  // sind zwei verschiedene Dinge, s. FIRE_DECK_GROUPS.
  fireSoilDryness: 55,
  // Windpartikel als Bewegungsschicht ÜBER den Flächen, aber UNTER den
  // Detektionspunkten: die Hotspots müssen anklickbar und auffindbar bleiben.
  fireWind: 75,
  // BP2: die Brandflächen der Registry liegen ÜBER den Partikeln (Statuskontur
  // muss lesbar bleiben) und UNTER den Detektionspunkten — Punkte bleiben
  // anklickbar, und die Fläche erklärt sie, statt sie zu verdecken.
  fireFootprints: 78,
  fireHotspots: 80,        // Punkte ganz oben, sonst unauffindbar
  // SF1: der Ausbreitungspfeil ist die AUSSAGE der Ansicht und liegt über allem
  // — ein Pfeil hinter einem Detektionspunkt wäre unlesbar.
  fireSpread: 82,
};

export interface FirePreset {
  id: string;
  label: string;
  layers: readonly FireLayerId[];
}

/**
 * Presets — nie mehr als drei Layer gleichzeitig (Muster `RADAR_PRESETS`,
 * `radar/radarModel.ts:320-324`).
 *
 * 2026-08-19: Mit dem Rückzug der amtlichen Stufe zeigt „Überblick" die
 * EU-Fläche und die Detektionen — Modellwert und Beobachtung nebeneinander,
 * das bleibt der Sinn des Presets. „Amtliche Stufe" ist ersatzlos entfallen,
 * und mit dem Rückzug der Feuerverbote (gleicher Tag) auch deren
 * Schnellzugriff „Feuerverbote".
 */
export const FIRE_PRESETS: readonly FirePreset[] = [
  { id: 'standard', label: 'Überblick', layers: ['fireDanger', 'fireHotspots'] },
  { id: 'lage', label: 'Aktuelle Lage', layers: ['fireDanger', 'fireHotspots', 'fireWeather'] },
] as const;

/** Findet das Preset, dessen Layer-Set exakt aktiv ist (für die Hervorhebung). */
export function activeFirePresetId(active: readonly FireLayerId[]): string | null {
  const key = (a: readonly FireLayerId[]) => [...a].sort().join(',');
  const k = key(active);
  return FIRE_PRESETS.find((p) => key(p.layers) === k)?.id ?? null;
}

/** Sortiert aktive Layer nach Z-Band — die Reihenfolge, in der gezeichnet wird. */
export function sortByZBand(layers: readonly FireLayerId[]): FireLayerId[] {
  return [...layers].sort((a, b) => FIRE_Z_BAND[a] - FIRE_Z_BAND[b]);
}

// ---------------------------------------------------------------------------
// Präsentations-Metadaten (Phase WBU1) — reine Daten, verhaltensneutral.
//
// Gruppen/Akzente/Icon-Zuordnung des Layer-Docks in Wetterkarten-Optik
// (Muster: DECK_GROUPS in MapView.tsx). Die Akzente sind die vorhandenen
// Design-Token-Familien (D-27) — keine neuen Farben. Ändert NICHTS am
// Verhalten: MVP-/Ausbau-Listen, Presets und Z-Bänder bleiben die Quelle
// der Wahrheit; dieses Feld ordnet sie nur fürs Auge.
// ---------------------------------------------------------------------------

export type FireAccent = 'steel' | 'sage' | 'terracotta' | 'violet' | 'amber' | 'slate';

export interface FireDeckGroup {
  title: string;
  accent: FireAccent;
  layers: { id: FireLayerId; accent?: FireAccent }[];
}

export const FIRE_DECK_GROUPS: readonly FireDeckGroup[] = [
  {
    // Die Gefahrenfläche steht oben. Bis 2026-08-19 stand die amtliche
    // Landesstufe daneben; sie ist zurückgezogen (Jans Auftrag), die EU-Fläche
    // bleibt als einzige durchgehende Gefahrenangabe.
    title: 'Gefahrenlage', accent: 'terracotta',
    layers: [
      { id: 'fireDanger', accent: 'amber' },
    ],
  },
  {
    title: 'Aktuelle Lage', accent: 'steel',
    layers: [
      { id: 'fireHotspots', accent: 'terracotta' },
      // BP2: direkt unter den Detektionen — es ist ihre Zusammenfassung je Brand,
      // plus die kartierten Flächen. Eigener Schalter, eigenes Panel.
      { id: 'fireFootprints', accent: 'terracotta' },
      { id: 'fireWeather', accent: 'steel' },
    ],
  },
  {
    // WW1: die Layer, die wertgleich aus der Wetterkarte kommen. Eigene Gruppe,
    // damit im Dock sichtbar bleibt, dass hier dieselbe Quelle und dieselbe
    // Darstellung laufen wie dort — und nicht eine Waldbrand-Eigenbaute.
    title: 'Aus der Wetterkarte', accent: 'steel',
    layers: [
      { id: 'fireWind', accent: 'steel' },
      // Direkt unter dem Wind (Jans Auftrag 2026-08-15). Sage statt Steel:
      // der Boden ist kein Windprodukt, und zwei Layer derselben Akzentfarbe
      // direkt untereinander lesen sich wie einer mit zwei Zeilen.
      { id: 'fireSoilDryness', accent: 'sage' },
    ],
  },
  {
    // SF1: eigene Gruppe — weder Fremdraster noch Wetterkarten-Layer, sondern
    // eine Aussage je Brand. Sichtbar getrennt, damit niemand sie für eine
    // amtliche Warnung hält.
    title: 'Ausbreitung (Modell)', accent: 'terracotta',
    layers: [
      { id: 'fireSpread', accent: 'terracotta' },
    ],
  },
  {
    // Ausbaustufe 2 (WB4): drei gebaut, zwei blockiert — die blockierten
    // bleiben SICHTBAR in der Gruppe (Ehrlichkeit, s. audit/waldbrand-ausbau.md).
    title: 'Ausbaustufe 2', accent: 'slate',
    layers: [
      { id: 'fireFuel', accent: 'sage' },
      { id: 'fireBurnt', accent: 'terracotta' },
      { id: 'fireContext', accent: 'sage' },
      { id: 'fireDrought', accent: 'slate' },
      { id: 'fireVegetation', accent: 'sage' },
    ],
  },
] as const;

/** Akzent je Layer, wie im Dock — die Steckbrief-Karte erbt ihn (Muster LAYER_ACCENT). */
export const FIRE_LAYER_ACCENT: ReadonlyMap<FireLayerId, FireAccent> = new Map(
  FIRE_DECK_GROUPS.flatMap((g) => g.layers.map((l) => [l.id, l.accent ?? g.accent] as [FireLayerId, FireAccent])),
);

// ---------------------------------------------------------------------------
// Quellen und Skalen — quellenrein getrennt
// ---------------------------------------------------------------------------

export type FireSourceKey = 'DE' | 'CH' | 'EU';

export interface FireScaleStep {
  /** Stufennummer, **wie die Quelle sie zählt** — nicht normalisiert. */
  level: number;
  /** Amtliche Beschriftung, wortwörtlich. */
  label: string;
  /** Unsere Farbe (s. `colorOrigin`). */
  color: string;
}

export interface FireSourceMeta {
  key: FireSourceKey;
  /** Wer den Index herausgibt — steht im Steckbrief. */
  issuer: string;
  /** Abdeckung im Klartext, für Legende und Statuszeile. */
  coverage: string;
  /**
   * Stammt der Farbwert aus der Quelle (`official`) oder haben wir ihn aus der
   * Stufe abgeleitet (`derived`)? Der Unterschied MUSS in der Legende stehen —
   * sonst behauptet die Karte eine Amtlichkeit, die die Farbe nicht hat (D-04).
   *
   * Für **alle drei** Quellen `derived`: in WB0 gemessen führt weder das
   * BAFU-GeoJSON ein Farbfeld noch liefert der DWD Hexwerte; die EU-Klassen
   * kommen als WMS-Bild, dessen Legende wir nicht als Datenwert bekommen.
   */
  colorOrigin: 'official' | 'derived';
  scale: readonly FireScaleStep[];
}

/**
 * Deutschland — DWD-Waldbrandgefahrenindex (WBI), 5 Stufen.
 * ⚠️ Stufe 2 heißt hier „geringe Gefahr" — in der Schweiz heißt so die Stufe 1.
 */
export const FIRE_SOURCE_DE: FireSourceMeta = {
  key: 'DE',
  issuer: 'Deutscher Wetterdienst',
  coverage: 'Deutschland · 484 Stationen',
  colorOrigin: 'derived',
  scale: [
    { level: 1, label: 'sehr geringe Gefahr', color: '#8FBF6B' },
    { level: 2, label: 'geringe Gefahr', color: '#D6D24E' },
    { level: 3, label: 'mittlere Gefahr', color: '#E9A33C' },
    { level: 4, label: 'hohe Gefahr', color: '#D4632E' },
    { level: 5, label: 'sehr hohe Gefahr', color: '#A32B1E' },
  ],
};

/**
 * Schweiz — BAFU-Waldbrandgefahr, 5 Stufen, kantonal nachbearbeitet.
 * ⚠️ Stufe 1 heißt hier „geringe Gefahr" — in Deutschland heißt so die Stufe 2.
 */
export const FIRE_SOURCE_CH: FireSourceMeta = {
  key: 'CH',
  issuer: 'BAFU und Kantone',
  coverage: 'Schweiz · Warnregionen',
  colorOrigin: 'derived',
  scale: [
    { level: 1, label: 'geringe Gefahr', color: '#8FBF6B' },
    { level: 2, label: 'mässige Gefahr', color: '#D6D24E' },
    { level: 3, label: 'erhebliche Gefahr', color: '#E9A33C' },
    { level: 4, label: 'grosse Gefahr', color: '#D4632E' },
    { level: 5, label: 'sehr grosse Gefahr', color: '#A32B1E' },
  ],
};

/** EU — GWIS/EFFIS Canadian FWI, 6 Klassen. Keine nationale Entsprechung. */
export const FIRE_SOURCE_EU: FireSourceMeta = {
  key: 'EU',
  issuer: 'Copernicus EMS · GWIS (ECMWF)',
  coverage: 'Europa · ~8 km, DACH durchgehend',
  colorOrigin: 'derived',
  scale: [
    { level: 1, label: 'Low (< 11,2)', color: '#8FBF6B' },
    { level: 2, label: 'Moderate (11,2–21,3)', color: '#D6D24E' },
    { level: 3, label: 'High (21,3–38,0)', color: '#E9A33C' },
    { level: 4, label: 'Very High (38,0–50,0)', color: '#D4632E' },
    { level: 5, label: 'Extreme (50,0–70,0)', color: '#A32B1E' },
    { level: 6, label: 'Very Extreme (> 70)', color: '#6B1410' },
  ],
};

const SOURCES: Record<FireSourceKey, FireSourceMeta> = {
  DE: FIRE_SOURCE_DE, CH: FIRE_SOURCE_CH, EU: FIRE_SOURCE_EU,
};

export function fireSource(key: FireSourceKey): FireSourceMeta {
  return SOURCES[key];
}

/**
 * Gibt es für dieses Land eine **offene amtliche** Waldbrand-Stufe?
 *
 * Österreich: nein. GeoSphere führt keinen Waldbrand-Datensatz und keinen
 * Waldbrand-Warntyp; BOKU-Datenbank und BMLUK-Risikokarte haben keine Lizenz
 * und keinen Download (`docs/DATA_SOURCES.md` §W.1). Diese Lücke wird
 * ausgewiesen und verlinkt — nicht mit dem EU-Modellwert kaschiert und nicht
 * aus einem Nachbarland herübergezogen.
 *
 * Getrennt von `hasOwnMapWarnings()` in `officialSources.ts` zu halten ist
 * Absicht: das sind verschiedene Produkte mit verschiedener Länderabdeckung.
 */
export function hasOfficialFireIndex(country: Country): boolean {
  return country === 'DE' || country === 'CH';
}

/** Die Quelle der amtlichen Stufe je Land — `null`, wo es keine gibt. */
export function nationalSourceFor(country: Country): FireSourceMeta | null {
  if (country === 'DE') return FIRE_SOURCE_DE;
  if (country === 'CH') return FIRE_SOURCE_CH;
  return null;
}

// ---------------------------------------------------------------------------
// Auswahl-Kaskade (Muster fusion/modelSource.ts:123-155)
// ---------------------------------------------------------------------------

/** Welche Quelle soll die Gefahrenstufe liefern? */
export type FireIndexChoice = 'national' | 'eu';

export interface FireSourceState {
  country: Country;
  /** Globale Vorgabe, wenn nichts Spezifischeres gesetzt ist. */
  global: FireIndexChoice;
  /** Wahl je Land. */
  perCountry: Partial<Record<Country, FireIndexChoice>>;
  /** Ausdrückliche Wahl je Layer — schlägt alles andere. */
  overrides: Partial<Record<FireLayerId, FireIndexChoice>>;
}

export function defaultFireSourceState(country: Country = 'DE'): FireSourceState {
  return { country, global: 'national', perCountry: {}, overrides: {} };
}

/**
 * Die Kaskade `overrides ?? perCountry ?? global` — wörtlich das Muster aus
 * `fusion/modelSource.ts:123-126`, hier als **Kopie**, nicht als Import: die
 * Fusions-Engine ist eine STOPP-&-FRAGEN-Zone, und eine gemeinsame Abstraktion
 * würde die Waldbrand-Ansicht an sie koppeln.
 */
export function resolveFireIndexChoice(
  layer: FireLayerId,
  state: FireSourceState,
): FireIndexChoice {
  return state.overrides[layer] ?? state.perCountry[state.country] ?? state.global;
}

/**
 * Wie `resolveFireIndexChoice`, aber mit **Abdeckungs-Rückfall**: wer in
 * Österreich „amtliche Stufe" wählt, bekommt `eu` — und die Meldung, dass ein
 * Rückfall griff. Ohne dieses Signal sähe die leere Fläche wie „keine Gefahr"
 * aus, statt wie „keine Daten" (D-04).
 */
export function resolveFireIndexWithFallback(
  layer: FireLayerId,
  state: FireSourceState,
): { choice: FireIndexChoice; requested: FireIndexChoice; fellBack: boolean } {
  const requested = resolveFireIndexChoice(layer, state);
  const choice: FireIndexChoice =
    requested === 'national' && !hasOfficialFireIndex(state.country) ? 'eu' : requested;
  return { choice, requested, fellBack: choice !== requested };
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (Muster D-12; headless über verify:fire-model)
// ---------------------------------------------------------------------------

export interface FireModelCheck { name: string; ok: boolean; detail?: string }

export function verifyFireModel(): { checks: FireModelCheck[]; passed: number; total: number } {
  const checks: FireModelCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const all: FireLayerId[] = [
    'fireDanger', 'fireHotspots', 'fireWeather',
    'fireDrought', 'fireVegetation', 'fireFuel', 'fireBurnt', 'fireContext',
    'fireWind', 'fireSoilDryness', 'fireFootprints', 'fireSpread',
  ];

  // --- Vollständigkeit: der Fehler von LAYER_ORDER darf sich nicht wiederholen.
  add('FIRE_LAYER_ORDER enthält JEDE FireLayerId',
    all.every((l) => FIRE_LAYER_ORDER.includes(l)),
    `${FIRE_LAYER_ORDER.length}/${all.length}`);
  add('FIRE_LAYER_ORDER enthält keine Dubletten',
    new Set(FIRE_LAYER_ORDER).size === FIRE_LAYER_ORDER.length);
  add('FIRE_LAYER_ORDER ist genau MVP + Ausbau + Wetterkarte + Registry + Ausbreitung, nichts Sechstes',
    FIRE_LAYER_ORDER.length
      === FIRE_MVP_LAYERS.length + FIRE_EXTENDED_LAYERS.length + FIRE_WEATHER_MAP_LAYERS.length
        + FIRE_FOOTPRINT_LAYERS.length + FIRE_SPREAD_LAYERS.length);
  // 2026-08-19: drei Layer sind zurückgezogen (Bit 1 amtliche Stufe, Bit 4
  // Feuerverbote, Bit 13 Feuerwetter stündlich); alle Plätze bleiben reserviert.
  add('FIRE_BIT_ORDER hält die Plätze der zurückgezogenen Layer frei',
    FIRE_BIT_ORDER.length === FIRE_LAYER_ORDER.length + 3
      && FIRE_BIT_ORDER[1] === null && FIRE_BIT_ORDER[4] === null && FIRE_BIT_ORDER[13] === null,
    `${FIRE_BIT_ORDER.length} Plätze, ${FIRE_LAYER_ORDER.length} Layer`);
  add('die fünf Herkunftslisten überschneiden sich nicht',
    !FIRE_MVP_LAYERS.some((l) => FIRE_EXTENDED_LAYERS.includes(l))
      && !FIRE_WEATHER_MAP_LAYERS.some((l) => FIRE_MVP_LAYERS.includes(l) || FIRE_EXTENDED_LAYERS.includes(l))
      && !FIRE_FOOTPRINT_LAYERS.some((l) => FIRE_MVP_LAYERS.includes(l) || FIRE_EXTENDED_LAYERS.includes(l) || FIRE_WEATHER_MAP_LAYERS.includes(l))
      && !FIRE_SPREAD_LAYERS.some((l) => FIRE_MVP_LAYERS.includes(l) || FIRE_EXTENDED_LAYERS.includes(l)
        || FIRE_WEATHER_MAP_LAYERS.includes(l) || FIRE_FOOTPRINT_LAYERS.includes(l)));

  // Bit-Stabilität: gemessen wird jetzt an FIRE_BIT_ORDER — dort steht auch der
  // reservierte Platz der zurückgezogenen amtlichen Stufe (Bit 1).
  add('Bit 0..4 sind unverändert die MVP-Plätze (Bit 1 und Bit 4 zurückgezogen)',
    FIRE_BIT_ORDER.slice(0, 5).join(',') === 'fireDanger,,fireHotspots,fireWeather,',
    FIRE_BIT_ORDER.slice(0, 5).join(','));
  // WW1: der neue Layer wurde ANGEHÄNGT, nicht eingeschoben — sonst öffnete ein
  // geteilter `#wb=`-Link plötzlich andere Layer (V-191).
  add('Bit 5..9 sind unverändert die Ausbau-Layer (bestehende Links bleiben gültig)',
    FIRE_BIT_ORDER.slice(5, 10).join(',') === FIRE_EXTENDED_LAYERS.join(','),
    FIRE_BIT_ORDER.slice(5, 10).join(','));
  add('fireWind steht an Bit 10 — hinter allem Bestehenden',
    FIRE_BIT_ORDER.indexOf('fireWind') === 10,
    String(FIRE_BIT_ORDER.indexOf('fireWind')));
  add('fireSoilDryness steht an Bit 11 — angehängt, nicht eingeschoben',
    FIRE_BIT_ORDER.indexOf('fireSoilDryness') === 11,
    String(FIRE_BIT_ORDER.indexOf('fireSoilDryness')));
  // BP2: die Registry ist Bit 12 — hinter allem Bestehenden, bestehende Links bleiben gültig.
  add('fireFootprints steht an Bit 12 — angehängt, nicht eingeschoben',
    FIRE_BIT_ORDER.indexOf('fireFootprints') === 12,
    String(FIRE_BIT_ORDER.indexOf('fireFootprints')));
  // SF1: die Ausbreitung ist Bit 14 — hinter allem Bestehenden; Bit 13 ist der
  // reservierte Platz der zurückgezogenen Rasterfläche.
  add('fireSpread steht an Bit 14 — angehängt, nicht eingeschoben',
    FIRE_BIT_ORDER.indexOf('fireSpread') === 14,
    String(FIRE_BIT_ORDER.indexOf('fireSpread')));
  add('Bit 13 ist frei — der zurückgezogene Forecast rutscht niemandem in den Platz',
    FIRE_BIT_ORDER[13] === null);
  add('Bit 0..12 tragen unverändert dieselben Layer wie vor dem Rückzug',
    FIRE_BIT_ORDER.slice(0, 13).map((l) => l ?? '').join(',')
      === 'fireDanger,,fireHotspots,fireWeather,,fireDrought,fireVegetation,'
        + 'fireFuel,fireBurnt,fireContext,fireWind,fireSoilDryness,fireFootprints');

  // --- Z-Bänder
  add('jeder Layer hat ein Z-Band', all.every((l) => Number.isFinite(FIRE_Z_BAND[l])));
  add('Z-Bänder sind paarweise verschieden',
    new Set(all.map((l) => FIRE_Z_BAND[l])).size === all.length);
  add('Hotspots liegen über der EU-Fläche',
    FIRE_Z_BAND.fireHotspots > FIRE_Z_BAND.fireDanger);
  // WW1: Partikel über den Flächen, aber UNTER den Detektionspunkten — sonst
  // liegt eine Bewegungsschicht auf den Hotspots, die anklickbar bleiben müssen.
  add('Windpartikel liegen über den Flächen, aber unter den Hotspots',
    FIRE_Z_BAND.fireWind > FIRE_Z_BAND.fireSoilDryness
      && FIRE_Z_BAND.fireWind < FIRE_Z_BAND.fireHotspots);
  // WT1: Dock-Reihenfolge und Z-Ordnung sind getrennt — im Dock steht der Boden
  // unter dem Wind, auf der Karte liegt er als Fläche viel tiefer.
  // BP2: die Brandflächen der Registry — über den Partikeln (Statuskontur
  // lesbar), unter den Punkten (Detektionen bleiben klickbar).
  add('Brandflächen (Registry) liegen über dem Wind und unter den Hotspots',
    FIRE_Z_BAND.fireFootprints > FIRE_Z_BAND.fireWind && FIRE_Z_BAND.fireFootprints < FIRE_Z_BAND.fireHotspots);
  add('im Dock stehen die Brandflächen direkt unter den Detektionen',
    (() => {
      const g = FIRE_DECK_GROUPS.find((x) => x.layers.some((l) => l.id === 'fireHotspots'));
      const ids = g?.layers.map((l) => l.id) ?? [];
      return ids.indexOf('fireFootprints') === ids.indexOf('fireHotspots') + 1;
    })());
  // SF1: der Ausbreitungspfeil ist die Aussage der Ansicht und liegt über allem.
  add('Ausbreitungspfeile liegen über den Detektionspunkten',
    FIRE_Z_BAND.fireSpread > FIRE_Z_BAND.fireHotspots);
  add('Ausbreitung hat eine eigene Dock-Gruppe (keine Fläche, keine amtliche Stufe)',
    (() => {
      const g = FIRE_DECK_GROUPS.find((x) => x.layers.some((l) => l.id === 'fireSpread'));
      return !!g && g.layers.length === 1 && g.title === 'Ausbreitung (Modell)';
    })());
  add('Bodentrockenheit liegt als Fläche UNTER den Windpartikeln',
    FIRE_Z_BAND.fireSoilDryness < FIRE_Z_BAND.fireWind);
  add('Bodentrockenheit liegt direkt über dem Luft-Treiber (beide sind Treiber)',
    FIRE_Z_BAND.fireSoilDryness > FIRE_Z_BAND.fireWeather
      && FIRE_Z_BAND.fireSoilDryness < FIRE_Z_BAND.fireWind);
  add('im Dock steht der Boden UNTER dem Wind',
    (() => {
      const g = FIRE_DECK_GROUPS.find((x) => x.layers.some((l) => l.id === 'fireWind'));
      const ids = g?.layers.map((l) => l.id) ?? [];
      return ids.indexOf('fireSoilDryness') === ids.indexOf('fireWind') + 1;
    })());
  add('sortByZBand sortiert aufsteigend',
    sortByZBand(['fireHotspots', 'fireDanger', 'fireWeather']).join(',')
      === 'fireDanger,fireWeather,fireHotspots');

  // --- Presets
  add('jedes Preset nennt nur bekannte Layer',
    FIRE_PRESETS.every((p) => p.layers.every((l) => all.includes(l))));
  add('kein Preset schaltet mehr als 3 Layer',
    FIRE_PRESETS.every((p) => p.layers.length <= 3));
  add('kein Preset enthält Ausbau-Layer (die gibt es erst nach WB4)',
    FIRE_PRESETS.every((p) => p.layers.every((l) => FIRE_MVP_LAYERS.includes(l))));
  add('activeFirePresetId erkennt das Standard-Set',
    activeFirePresetId(['fireHotspots', 'fireDanger']) === 'standard');
  add('activeFirePresetId meldet null bei fremder Kombination',
    activeFirePresetId(['fireDanger', 'fireWeather']) === null);
  // 2026-08-19: die zurückgezogenen Layer tauchen in keinem Preset mehr auf.
  add('kein Preset nennt einen zurückgezogenen Layer',
    !FIRE_PRESETS.some((p) => (p.layers as readonly string[])
      .some((l) => l === 'fireIndexNational' || l === 'fireBans')));

  // --- DIE Kernregel: keine Umrechnung zwischen den Skalen.
  add('DE-Stufe 2 und CH-Stufe 1 heißen beide „geringe Gefahr"',
    FIRE_SOURCE_DE.scale[1].label === 'geringe Gefahr'
      && FIRE_SOURCE_CH.scale[0].label === 'geringe Gefahr');
  add('… und werden trotzdem NICHT gleich eingefärbt behandelt: gleiche Stufennummer, andere Bedeutung',
    FIRE_SOURCE_DE.scale[0].label !== FIRE_SOURCE_CH.scale[0].label,
    `DE1="${FIRE_SOURCE_DE.scale[0].label}" · CH1="${FIRE_SOURCE_CH.scale[0].label}"`);
  add('DE hat 5 Stufen, CH 5, EU 6 — keine gemeinsame Skala',
    FIRE_SOURCE_DE.scale.length === 5 && FIRE_SOURCE_CH.scale.length === 5
      && FIRE_SOURCE_EU.scale.length === 6);
  add('jede Quelle trägt ihren eigenen Herausgeber',
    new Set([FIRE_SOURCE_DE.issuer, FIRE_SOURCE_CH.issuer, FIRE_SOURCE_EU.issuer]).size === 3);
  add('Stufennummern sind je Quelle lückenlos ab 1',
    [FIRE_SOURCE_DE, FIRE_SOURCE_CH, FIRE_SOURCE_EU].every(
      (s) => s.scale.every((st, i) => st.level === i + 1)));

  // --- Ehrlichkeit der Farbe (WB0-Befund: BAFU liefert kein Farbfeld).
  add('CH-Farbe ist als abgeleitet gekennzeichnet, nicht als amtlich',
    FIRE_SOURCE_CH.colorOrigin === 'derived');
  add('keine Quelle behauptet amtliche Farbwerte',
    [FIRE_SOURCE_DE, FIRE_SOURCE_CH, FIRE_SOURCE_EU].every((s) => s.colorOrigin === 'derived'));

  // --- Länder-Asymmetrie: AT hat keine amtliche Stufe und bekommt keine erfunden.
  add('DE und CH haben eine amtliche Stufe',
    hasOfficialFireIndex('DE') && hasOfficialFireIndex('CH'));
  add('AT hat KEINE amtliche Stufe', hasOfficialFireIndex('AT') === false);
  add('nationalSourceFor(AT) ist null — kein Ersatz aus dem Nachbarland',
    nationalSourceFor('AT') === null);
  add('nationalSourceFor liefert je Land die eigene Quelle',
    nationalSourceFor('DE') === FIRE_SOURCE_DE && nationalSourceFor('CH') === FIRE_SOURCE_CH);

  // --- Kaskade
  // 2026-08-19: die Kaskade wird am EU-Layer geprüft — sie ist layerunabhängig,
  // und der frühere Prüfling `fireIndexNational` ist zurückgezogen.
  const st = defaultFireSourceState('DE');
  add('Kaskade: ohne alles greift global', resolveFireIndexChoice('fireDanger', st) === 'national');
  const st2: FireSourceState = { ...st, perCountry: { DE: 'eu' } };
  add('Kaskade: perCountry schlägt global', resolveFireIndexChoice('fireDanger', st2) === 'eu');
  const st3: FireSourceState = { ...st2, overrides: { fireDanger: 'national' } };
  add('Kaskade: override schlägt perCountry', resolveFireIndexChoice('fireDanger', st3) === 'national');
  const stAt: FireSourceState = { ...defaultFireSourceState('AT') };
  const fb = resolveFireIndexWithFallback('fireDanger', stAt);
  add('AT: „amtlich" fällt auf EU zurück UND meldet das',
    fb.choice === 'eu' && fb.requested === 'national' && fb.fellBack === true);
  const fbDe = resolveFireIndexWithFallback('fireDanger', st);
  add('DE: kein Rückfall, kein falsches Signal',
    fbDe.choice === 'national' && fbDe.fellBack === false);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
