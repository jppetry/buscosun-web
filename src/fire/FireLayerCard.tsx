/**
 * Steckbrief-Karte der Waldbrand-Layer (Phase WBU1) — KOPIE des Musters
 * `components/LayerInfoPanel.tsx` + `mdk-ro-lcard` (Readout-Karte der
 * Wetterkarte), mit `.fire-`-Klassen statt `.layer-info`/`.mdk-*`.
 *
 * Warum Kopie statt Wiederverwendung (Entscheidungsregel des Kickoffs,
 * begründet in `audit/waldbrand-ui.md` §4): die `.layer-info`-Stile leben in
 * `MapView.css`, das der Waldbrand-Chunk nicht lädt; dieselben Klassennamen
 * aus `fireDeck.css` heraus zu stylen würde global in die Wetterkarte
 * zurückleaken. Die Wetterkarte bleibt so byte-identisch unberührt.
 *
 * Die Texte sind die WORTGLEICHEN Layer-Texte aus dem bisherigen
 * `LAYER_INFO` in `FirePage.tsx` (WB1/WB2) — der Satz „kein amtliches
 * Warnprodukt" ist Pflicht in jedem Profil (`plan.md` §WB2) und bleibt
 * unverändert erhalten.
 */

import type { ReactNode } from 'react';
import { FIRE_LAYER_ACCENT, type FireLayerId } from './fireModel';
import { FRP_STOPS } from './sources/firmsHotspots';
import { DANGER_VIEWS, companionView, type DangerView } from './dangerViews';
import { LANDCOVER_KEYS, LANDCOVER_LABEL, LANDCOVER_COLOR } from './fireCorroboration';
import {
  SOIL_DRYNESS_CLASSES, SOIL_MODE_FULL_LABEL, type SoilDrynessMode,
} from '../sources/iconD2Smi';
import { STATUS_COLOR, STATUS_LABEL } from './footprint/fireRegistry';

export interface FireLayerInfo {
  eyebrow: string;
  /** Anzeigename — auch das Label der Dock-Zeile. */
  label: string;
  /** Kurzquelle — Sub-Zeile im Dock und Quellenzeile der Karte. */
  short: string;
  /** Der Ehrlichkeits-/Erklärtext, wortgleich aus WB1/WB2. */
  note: string;
  legend?: ReactNode;
}

function Bar({ css }: { css: string }) {
  return <div className="fire-li-bar" style={{ background: css }} />;
}
function Scale({ from, to }: { from: string; to: string }) {
  return <div className="fire-li-scale"><span>{from}</span><span>{to}</span></div>;
}
function Row({ swatch, label }: { swatch: ReactNode; label: string }) {
  return <div className="fire-li-row">{swatch}<span>{label}</span></div>;
}

/* Repräsentative Skalen — gespiegelt aus den Stufenfarben in `fireModel.ts`
 * (EU/DE/CH teilen die abgeleitete Farbreihe) bzw. der Layer-Einfärbung. */
const NATIONAL = 'linear-gradient(90deg,#8FBF6B,#D6D24E,#E9A33C,#D4632E,#A32B1E)';
const DRYAIR = 'linear-gradient(90deg,#F2EAD8,#D9B87A,#A9743C,#6B4A1E)';
/** WW1: die Windskala — Werte-Kopie aus `components/LayerInfoPanel.tsx:39`,
 *  damit derselbe Layer in beiden Ansichten dieselbe Legende trägt. */
const WIND = 'linear-gradient(90deg,#e8f0fa,#9ec5e5,#7A9466,#e0c85c,#d77a3b,#b5483d)';

/**
 * Die FRP-Skala des Hotspot-Layers — **aus derselben Konstante wie die Karte**
 * (`FRP_STOPS`), nicht als zweite handgeschriebene Farbreihe.
 *
 * Die Stützstellen sind über die **Wurzel** positioniert, genau wie der Radius
 * in `frpRadius()`. Eine lineare Verteilung wäre hier eine Lüge in Bildform:
 * die gemessene Verteilung ist stark rechtsschief (Median 3,1 MW, p99 68 MW),
 * die untere Hälfte der Skala trüge sonst fast alle Detektionen.
 */
const FRP = `linear-gradient(90deg,${
  FRP_STOPS.map(([mw, col]) => `${col} ${(Math.sqrt(mw / 100) * 100).toFixed(1)}%`).join(',')
})`;

/**
 * Die sechs EFFIS-Klassenfarben — in der Reihenfolge der Legende. Dieselbe
 * Farbfolge gilt für ALLE Sub-Ansichten des Index; was sich ändert, sind die
 * Grenzen. Deshalb steht neben jeder Farbe die Grenze DIESER Ansicht.
 */
const DANGER_STEPS = ['#8FBF6B', '#D6D24E', '#E9A33C', '#D4632E', '#A32B1E', '#6B1410'];

/**
 * Legende einer Sub-Ansicht: sechs Klassen mit den **eigenen** Grenzen und die
 * Einheit dazu. Keine geteilte Legende — „rot" heißt in der Trockenheits-
 * Ansicht DC > 749, in der Ausbreitungs-Ansicht ISI > 26,8 (E0 §4.3).
 */
function DangerClasses({ view, compact }: { view: DangerView; compact?: boolean }) {
  const m = DANGER_VIEWS[view];
  return (
    <div className={`fire-li-classes${compact ? ' is-compact' : ''}`}>
      <span className="fire-li-unit">{m.unit}</span>
      <ol>
        {m.classes.map((c, i) => (
          <li key={c.name}>
            <span className="fire-swatch" style={{ background: DANGER_STEPS[i] }} aria-hidden="true" />
            <span className="fire-li-cls-name">{c.name}</span>
            <span className="fire-li-cls-range">{c.range}</span>
          </li>
        ))}
      </ol>
      <span className="fire-li-ref">{m.reference}</span>
    </div>
  );
}

/**
 * Der Steckbrief des EU-Index je Sub-Ansicht (Phase E3).
 *
 * Index und Einordnung tragen **beide** Legenden: Der Index steht nie allein —
 * für DACH ist die absolute Klasse ein Modellwert, das Perzentil sagt, was der
 * Tag hier bedeutet. Die drei Codes tragen nur die eigene.
 */
export function dangerInfoFor(view: DangerView): FireLayerInfo {
  const m = DANGER_VIEWS[view];
  const partner = companionView(view);
  return {
    eyebrow: 'Gefahrenlage · Modell',
    label: `Gefahrenindex (EU) — ${m.label}`,
    short: 'Copernicus GWIS · ECMWF-Familie, ~8 km, Tageswerte bis +9 Tage',
    note: `${m.title}: ${m.answers} ${m.limitation} Durchgehend über DE, AT und CH — dadurch vergleichbar, aber gröber als die nationalen Stufen.`,
    legend: (
      <>
        <DangerClasses view={view} />
        {partner && (
          <>
            <span className="fire-li-partner">
              {view === 'fwi' ? 'Dazu gehört die Einordnung:' : 'Dazu gehört der Index:'}
            </span>
            <DangerClasses view={partner} compact />
          </>
        )}
      </>
    ),
  };
}

/**
 * Der Steckbrief der Bodentrockenheit je Tiefe (Phase WT1).
 *
 * Zwei Modi, ein Layer — Muster wie `dangerInfoFor` für die Sub-Ansichten des
 * EU-Index: Der Text nennt die Tiefe, die Legende die Klassen. Die Klassen sind
 * für beide Modi dieselben, weil `smi` normiert ist; was sich ändert, ist die
 * Bedeutung („oben trocken" heißt Zündrisiko, „unten trocken" heißt Dürre).
 */
export function soilDrynessInfoFor(mode: SoilDrynessMode): FireLayerInfo {
  const oben = mode === 'topsoil';
  return {
    eyebrow: 'Aus der Wetterkarte · Treiber',
    label: `Bodentrockenheit — ${oben ? 'Oberboden' : 'Wurzelzone'}`,
    short: `DWD ICON-D2 · smi, ${oben ? 'bis 9 cm' : 'bis 81 cm'}, 2,2 km · bis +24 h`,
    note: `${SOIL_MODE_FULL_LABEL[mode]}. Gezeigt wird der Bodenfeuchte-Index (SMI): 1 heißt Feldkapazität — der Boden hält so viel Wasser, wie er halten kann; 0 heißt Welkepunkt — die Pflanze bekommt nichts mehr. Weil der Index normiert ist, sind Sand und Lehm damit vergleichbar; der rohe Wassergehalt wäre es nicht. Werte UNTER dem Welkepunkt kommen im Modell vor und sind kein Fehler — die Skala endet dort, der Wert läuft weiter. ${oben ? 'Der Oberboden trocknet in Tagen ab und ist der Teil, den ein Funke zuerst findet — er sagt etwas über die Entzündbarkeit, nicht über den Zustand des Waldes.' : 'Die Wurzelzone reagiert in Wochen bis Monaten und zeigt Dürre, nicht akutes Zündrisiko — ein nasser Unterboden schließt einen brennenden Oberboden nicht aus.'} Ein Treiber, kein Index und kein amtliches Warnprodukt: er sagt, wie es im Boden steht, nicht ob es brennt. Modellwert, keine Messung — es gibt kein flächendeckendes Bodenfeuchte-Messnetz. Flächen ohne wasserführenden Boden (Wasser, Fels, Eis) bleiben leer, statt eine Trockenheit zu zeigen, die es dort nicht gibt. Das Modellgebiet reicht über DACH hinaus; außerhalb von DE, AT und CH ist die Fläche abgedunkelt.`,
    legend: (
      <>
        <div className="fire-li-classes">
          <span className="fire-li-unit">Bodenfeuchte-Index (SMI)</span>
          <ol>
            {SOIL_DRYNESS_CLASSES.map((c, i) => (
              <li key={c.label}>
                <span className="fire-swatch" style={{ background: c.color }} aria-hidden="true" />
                <span className="fire-li-cls-name">{c.label}</span>
                <span className="fire-li-cls-range">
                  {i === 0 ? '≥ 1,0'
                    : `${c.smiFrom.toFixed(1).replace('.', ',')}–${SOIL_DRYNESS_CLASSES[i - 1].smiFrom.toFixed(1).replace('.', ',')}`}
                </span>
              </li>
            ))}
          </ol>
          <span className="fire-li-ref">
            0 = Welkepunkt · 1 = Feldkapazität · DWD ICON-D2, Bodenschema TERRA
          </span>
        </div>
      </>
    ),
  };
}

export const FIRE_LAYER_INFO: Record<FireLayerId, FireLayerInfo> = {
  fireDanger: dangerInfoFor('fwi'),
  fireIndexNational: {
    eyebrow: 'Gefahrenlage · Amtlich',
    label: 'Amtliche Stufe',
    short: 'DWD (DE, 484 Stationen) · BAFU (CH, Warnregionen) · AT: keine offene Quelle',
    note: 'Wiedergabe amtlicher Stufen, selbst kein amtliches Warnprodukt. Die deutsche und die Schweizer Skala werden NICHT ineinander umgerechnet — „geringe Gefahr" ist in DE Stufe 2 und in CH Stufe 1.',
    legend: <><Bar css={NATIONAL} /><Scale from="Stufe 1" to="Stufe 5" /></>,
  },
  fireHotspots: {
    eyebrow: 'Aktuelle Lage · Satellit',
    label: 'Aktive Brände',
    short: 'NASA FIRMS / LANCE · VIIRS 375 m (NRT), 24 h / 7 Tage · Rückfall: Copernicus GWIS',
    note: 'Satellitendetektion, keine Einsatzmeldung und kein amtliches Warnprodukt. Der Klick-Steckbrief trägt eine von drei Beschriftungen: „bestätigt" (von EFFIS kartierte Brandfläche oder Copernicus-EMS-Aktivierung — immer mit Quelle), „plausibel" (mehrere Überflüge oder Kontext) oder „unbestätigt" (nur Satellit). „Unbestätigt" ist der Normalfall, kein Versagen: Warnungen entstehen nur bei Gefahr für die Bevölkerung, Kartierungen kommen mit Verzug, und bei durchschnittlich 2,2 ha je deutschem Waldbrand sieht der Satellit viele gar nicht — „keine Hotspots" heißt nicht „keine Brände". Für Österreich gibt es keine amtliche Ereignisbestätigung; dort steht als Kontext eine GeoSphere-Warnung (Hitze/Gewitter/Sturm — nie eine Brandbestätigung) und ein Link zu den Landes-Einsatzübersichten. Deutsche Warnmeldungen (BBK/MoWaS) werden bewusst nicht ausgewertet, sondern verlinkt. Der Punkt ist die Pixelmitte, nicht der Brandort — das Feuer liegt irgendwo im gezeichneten Rechteck. Kleine Bodenfeuer unter der Pixelgröße bleiben unsichtbar, Überflüge sind lückenhaft, und ganz frische Detektionen können bei der Nachverarbeitung wieder verschwinden. Die Feuerstrahlungsleistung ist eine Leistung in Megawatt und sagt nichts über die Brandfläche. Grau gezeichnete Punkte werden seit mindestens fünf Tagen ortsfest und ohne Ausdehnung detektiert — häufig dauerhafte Wärmequellen wie Industrieanlagen. Das ist unsere Einordnung aus dem Muster, kein Nachweis und kein Feld der Quelle; sie braucht sieben Tage Vorgeschichte, die im 24-Stunden-Fenster nach dem ersten Bild im Hintergrund nachgeladen und im Worker ausgewertet werden — bis dahin ist kein Punkt grau, keiner behauptet etwas. Liegt eine Detektion in einer von EFFIS kartierten Brandfläche der letzten sieben Tage, wird sie nicht ausgegraut — die Kartierung ist die stärkere Beobachtung; der Klick-Steckbrief nennt sie mit Fläche und Datum. Fehlende Kartierung ist kein Beleg gegen ein Feuer. Zusammenhängende Pixel werden als gestricheltes Detektionsraster verschmolzen; der Steckbrief nennt dessen Fläche in Hektar. Das ist die vom Satelliten abgedeckte Fläche und ausdrücklich KEINE Brandfläche: ein VIIRS-Pixel bedeckt 14–20 ha, und an den kartierten Bränden dieser Woche gemessen war das Raster im Median 12-mal so groß wie die tatsächlich verbrannte Fläche. Die scharf umrandete EFFIS-Fläche ist die kartierte Brandfläche, das gestrichelte Raster nur die Auflösung der Messung.',
    legend: <>
      <Bar css={FRP} />
      <Scale from="0 MW" to="100+ MW" />
      <Row swatch={<i className="fire-li-hotspot fire-li-conf-h" />} label="Konfidenz hoch — kräftiger Ring" />
      <Row swatch={<i className="fire-li-hotspot fire-li-conf-l" />} label="Konfidenz gering — blass, ggf. Sonnenreflexion" />
      <Row swatch={<i className="fire-li-foot" />} label="Pixelfläche (ab Zoom 7); gestrichelt = Nachtüberflug" />
      <Row swatch={<i className="fire-li-zone" />} label="Detektionsraster: verschmolzene Pixel mit Flächenangabe — Obergrenze, keine Brandfläche" />
      <Row swatch={<i className="fire-li-hotspot fire-li-static" />} label="grau: seit ≥5 Tagen ortsfest — Einordnung aus 7 Tagen Vorgeschichte, kommt nach dem ersten Bild" />
    </>,
  },
  fireWeather: {
    eyebrow: 'Aktuelle Lage · Treiber',
    label: 'Feuerwetter-Treiber',
    short: 'ICON-D2 · relative Feuchte 2 m, 2,2 km, bis +24 h',
    note: 'Eingefärbt ist die Trockenheit der Luft: je dunkler, desto trockener — denn trockene Luft lässt Streu schneller abtrocknen. Ein Treiber, kein Index und kein amtliches Warnprodukt. Die kumulativen FWI-Codes (FFMC, DMC, DC) sind NICHT enthalten; sie brauchen einen Tagesübertrag über Wochen, den eine reine Browser-App nicht leisten kann. Das Modellgebiet von ICON-D2 reicht über DACH hinaus — außerhalb von DE, AT und CH ist die Fläche abgedunkelt, weil diese Ansicht dort nichts aussagt.',
    legend: <><Bar css={DRYAIR} /><Scale from="feucht" to="trocken" /></>,
  },
  fireBans: {
    eyebrow: 'Aktuelle Lage · Prävention',
    label: 'Feuerverbote (CH)',
    short: 'BAFU · kantonale Präventionsmassnahmen',
    note: 'Wiedergabe kantonaler Massnahmen, kein amtliches Warnprodukt. Für DE und AT gibt es keine maschinenlesbare Quelle — dort wird verlinkt, nicht geraten.',
    legend: <Row swatch={<i className="fire-li-ban" />} label="kantonales Verbot / Massnahme" />,
  },
  fireDrought: {
    eyebrow: 'Ausbaustufe 2',
    // E3: heißt jetzt beim Namen — sonst stünde „Trockenheit" zweimal im Dock,
    // einmal als blockierte EDO-Bodenfeuchte, einmal als DC-Sub-Ansicht des
    // Index. Genau diese Verwechslung („DC an Stelle der Bodenfeuchte") soll
    // nicht passieren. Blockiert bleibt blockiert.
    label: 'Bodenfeuchte-Anomalie',
    short: 'Copernicus EDO · derzeit nicht abrufbar',
    note: 'Bodenfeuchte-Anomalie (SMA) des Europäischen Dürre-Observatoriums — nicht gebaut, und zwar aus einem benennbaren Grund: Der EDO-Dienst sendet einen fehlerhaften CORS-Header (doppeltes Access-Control-Allow-Origin). Der Server läuft, aber der Browser darf die Kacheln nicht lesen. Die Lösung wäre ein Server-seitiger Umweg — das ist eine Infrastruktur-Entscheidung und keine, die diese Ansicht allein treffen kann. Die Sub-Ansicht „Trockenheit" des EU-Index (Drought Code) ist KEIN Ersatz dafür: ein Feuerwetter-Code, keine Bodenfeuchte.',
  },
  fireVegetation: {
    eyebrow: 'Ausbaustufe 2',
    label: 'Vegetationsstress',
    short: 'Copernicus EDO · derzeit nicht abrufbar',
    note: 'Wie Trockenheit: derselbe Dienst, derselbe fehlerhafte CORS-Header. Wäre er erreichbar, zeigte der Layer die fAPAR-Anomalie — Vegetationsstress ist dabei allerdings NICHT gleich Trockenheit: auch Schädlinge, Hitze oder Sturmschäden schlagen darauf durch.',
  },
  fireFuel: {
    eyebrow: 'Ausbaustufe 2',
    label: 'Brennmaterial',
    short: 'Copernicus EFFIS · European Fuel Map, Stand 2017',
    note: 'Welches Material überhaupt brennen kann: 42 Vegetationskomplexe, zusammengefasst auf 13 Klassen. Eine Bestandsaufnahme von 2017, keine Beobachtung — Kalamitäten, Aufforstungen und Waldumbau der letzten Jahre sind nicht enthalten. Kein amtliches Warnprodukt.',
    legend: <Row swatch={<i className="fire-li-fuel" />} label="13 Brennmaterial-Klassen (EFFIS)" />,
  },
  fireBurnt: {
    eyebrow: 'Ausbaustufe 2 · Kartierung',
    label: 'Kartierte Brandflächen',
    short: 'Copernicus EFFIS · Rapid Damage Assessment, Saison live + Archiv',
    note: 'Von EFFIS kartierte Brandflächen: satellitenbildbasiert, visuell geprüft, mit Fläche, Branddatum und Landbedeckungsanteilen. Zwei getrennte Zeitkörbe, nie vermischt: die laufende Saison (live, Stand in der Statuszeile) und das Archiv früherer Saisons — nur auf Wunsch geladen (rund 5 MB). Zeitspanne, Stand und die kleinste kartierte Fläche werden aus den Daten gelesen, nicht fest eingetragen. Fehlende Kartierung ist kein Beleg gegen ein Feuer: kleine, kurze und frische Brände fehlen. Eingefärbt nach der vorherrschenden Landbedeckung der Fläche — das sagt, WAS gebrannt hat, nichts über Gefahr. Für die aktuelle Lage: Layer „Aktive Brände". Kein amtliches Warnprodukt.',
    legend: (
      <>
        <div className="fire-li-lc">
          {LANDCOVER_KEYS.map((k) => (
            <span key={k} className="fire-li-lc-item">
              <span className="fire-swatch" style={{ background: LANDCOVER_COLOR[k] }} aria-hidden="true" />
              {LANDCOVER_LABEL[k]}
            </span>
          ))}
        </div>
        <Row swatch={<i className="fire-li-burnt fire-li-burnt-season" />} label="Saison: kräftige Kontur" />
        <Row swatch={<i className="fire-li-burnt fire-li-burnt-archive" />} label="Archiv: gestrichelt, blasser" />
      </>
    ),
  },
  fireWind: {
    eyebrow: 'Aus der Wetterkarte · Treiber',
    label: 'Wind',
    short: 'DWD ICON-D2 · u/v 10 m, 2,2 km · gilt für jetzt',
    // Der erste Satz ist die wortgleiche Beschreibung aus der Wetterkarte
    // (`components/LayerInfoPanel.tsx:60`) — derselbe Layer, dieselbe Aussage.
    // Danach das, was NUR hier gilt: Zeitbezug und Waldbrand-Einordnung.
    note: 'Windrichtung und -geschwindigkeit in 10 m Höhe als animierte Partikel über einer Geschwindigkeits-Heatmap. Es ist derselbe Layer wie auf der Wetterkarte — dieselbe Quelle, dieselbe Geschwindigkeit, dieselben Farben. Er gilt für JETZT und folgt dem Tagesregler nicht: das Modellfeld reicht rund 12 Stunden voraus, der Regler hier zählt in Tagen. Für die Brandlage ist Wind ein Treiber, kein Index und kein amtliches Warnprodukt — er sagt, wohin ein Feuer laufen würde und wie schnell, nicht ob eines brennt. 10 m über Grund ist die Messhöhe der Meteorologie, nicht die Windgeschwindigkeit in einem Bestand; im Wald und in Bodennähe ist es deutlich schwächer, in Tälern und über Kämmen kann es örtlich stark davon abweichen. Böenspitzen sind NICHT enthalten — die zeigt die Wetterkarte als eigenen Layer. Das Modellgebiet reicht über DACH hinaus; außerhalb von DE, AT und CH ist die Fläche abgedunkelt, weil diese Ansicht dort nichts aussagt.',
    legend: <><Bar css={WIND} /><Scale from="schwach" to="Sturm" /></>,
  },
  fireSoilDryness: soilDrynessInfoFor('topsoil'),
  fireFootprints: {
    eyebrow: 'Aktuelle Lage · je Brand',
    label: 'Brandflächen (Übersicht)',
    short: 'NASA FIRMS (Detektionen, zusammengefasst) + Copernicus EFFIS (Kartierung) + EMS · Fenster wie „Aktive Brände"',
    note: 'Ein Eintrag je Brand, links als Liste, auf der Karte als EINE Fläche in Statusfarbe: die von EFFIS kartierte Brandfläche, wo es sie gibt — sonst das vom Satelliten abgedeckte Detektionsraster, eine Obergrenze und keine Brandfläche (ein VIIRS-Pixel deckt 14–60 ha). Es liegt nie zweierlei übereinander; ist der Kartierungs- oder der Hotspot-Layer zusätzlich an, zeichnet diese Ebene dort nur die Statuskontur. „Aktiv" heißt Detektion in den letzten 24 h oder offene Copernicus-EMS-Aktivierung; „kein Signal" ist keine Entwarnung — Wolken und Überflugslücken verbergen Feuer; „erloschen" steht nur mit Quelle (EFFIS-Enddatum, geschlossene EMS-Aktivierung). „Bestätigt" fällt nur mit EFFIS oder EMS im Satz; die Mehrheit bleibt unbestätigt, und das ist der Normalfall. Grau: überwiegend ortsfeste Detektionen (häufig Industrie) — eigene Einordnung, kein Nachweis. Kennungen sind innerhalb der Sitzung stabil (Anker: älteste Detektion); über Sitzungen hinweg gibt es keinen Speicher. Kein amtliches Warnprodukt.',
    legend: (
      <>
        {(['active', 'no-signal', 'out'] as const).map((k) => (
          <Row
            key={k}
            swatch={<i className="fire-li-fp" style={{ borderColor: STATUS_COLOR[k], background: `${STATUS_COLOR[k]}55` }} />}
            label={k === 'active' ? `${STATUS_LABEL[k]} — Detektion < 24 h oder EMS offen`
              : k === 'no-signal' ? `${STATUS_LABEL[k]} — keine Entwarnung`
              : `${STATUS_LABEL[k]} — nur mit Quelle`}
          />
        ))}
        <Row swatch={<i className="fire-li-fp is-mapped" />} label="harte Kontur: von EFFIS kartiert (ha gemessen)" />
        <Row swatch={<i className="fire-li-fp is-raster" />} label="gestrichelt: Detektionsraster — „bis … ha“, eine Obergrenze" />
        <Row swatch={<i className="fire-li-fp is-static" />} label="grau: überwiegend ortsfest — Vorbehalt, kein Ausschluss" />
      </>
    ),
  },
  fireContext: {
    eyebrow: 'Ausbaustufe 2',
    label: 'Schutzgebiete & Landbedeckung',
    short: 'EEA · Natura 2000 und CORINE Land Cover 2018',
    note: 'Was im Brandfall besonders zu schützen wäre, und wie die Fläche bedeckt ist. ⚠️ Natura 2000 deckt die SCHWEIZ NICHT ab — sie ist kein EU-Mitglied. Eine leere Schweiz bedeutet hier also „nicht erfasst", nicht „keine Schutzgebiete". Kein amtliches Warnprodukt.',
    legend: <Row swatch={<i className="fire-li-context" />} label="Natura 2000 · CORINE-Landbedeckung" />,
  },
};

/**
 * Der Steckbrief der aktiven Brände im **Notbetrieb** (Rückfall auf GWIS).
 *
 * Warum eine eigene Fassung nötig ist: Im Rückfall liefert GWIS nur `id`,
 * `acq_at` und `CLASS` (V-199). Die reguläre Karte zeigt dann weiterhin eine
 * FRP-Skala und zwei Konfidenzstufen — Größen, die in diesem Zustand **gar
 * nicht existieren**. Das ist genau der Fall, den D-04 verbietet: die ärmere
 * Anzeige darf nicht wie die vollwertige aussehen. Die Statuszeile allein
 * genügt nicht, solange die Legende das Gegenteil behauptet.
 */
export const HOTSPOTS_DEGRADED_INFO: FireLayerInfo = {
  eyebrow: 'Aktuelle Lage · Satellit · Notbetrieb',
  label: 'Aktive Brände',
  short: 'Copernicus GWIS · VIIRS-Thermalanomalien, 24 h / 7 Tage (Rückfallebene)',
  note: 'NASA FIRMS ist gerade nicht erreichbar. Angezeigt wird die keylose Rückfallquelle: dieselben Satellitendetektionen, aber OHNE Feuerstrahlungsleistung, ohne Konfidenz und ohne Pixelgeometrie — alle Punkte sind deshalb gleich groß. Satellitendetektion, keine Einsatzmeldung und kein amtliches Warnprodukt.',
  legend: <Row swatch={<i className="fire-li-hotspot" />} label="Thermalanomalie im Fenster — keine Intensitätsangabe verfügbar" />,
};

/**
 * Eine Steckbrief-Karte in Readout-Optik: Akzentbalken links, Eyebrow →
 * leichter Titel → Beschreibung → Legende → Quellenzeile; inaktive Layer
 * tragen bei Hover/Fokus den „Vorschau"-Chip (Muster `mdk-ro-lcard`).
 *
 * `info` überschreibt den statischen Steckbrief — gebraucht für den
 * Notbetrieb der Hotspots (s. `HOTSPOTS_DEGRADED_INFO`).
 */
export function FireLayerCard(
  { layer, preview, info: override }:
  { layer: FireLayerId; preview?: boolean; info?: FireLayerInfo },
) {
  const info = override ?? FIRE_LAYER_INFO[layer];
  if (!info) return null;
  return (
    <article
      className={`fire-ro-lcard${preview ? ' is-preview' : ''}`}
      data-accent={FIRE_LAYER_ACCENT.get(layer) ?? 'terracotta'}
    >
      {preview && <span className="fire-ro-lchip">Vorschau</span>}
      <div className="fire-info" role="note">
        <span className="fire-info-eyebrow">{info.eyebrow}</span>
        <h3 className="fire-info-title">{info.label}</h3>
        <p className="fire-info-desc">{info.note}</p>
        {info.legend && <div className="fire-info-legend">{info.legend}</div>}
        <span className="fire-info-src">{info.short}</span>
      </div>
    </article>
  );
}
