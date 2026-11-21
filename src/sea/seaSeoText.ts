/**
 * Phase SS (audit/seewetter-seo.md) — texts of the spot pages `/seewetter/<spot>`: H1, lead, paragraphs, facts, the
 * official source, neighbour spots and the place pages that name this spot. One source for the static shells
 * (`scripts/generate-seo.mjs`) and the rendered block after mount (`RouteSeoBlock`, lazy).
 *
 * Everything here is a property of the PLACE, computed from the published catalogue (`seaSpotFacts.ts`): DWD sea area
 * and coast section, the shore normal, the distance of the model cell, the measuring station, the BSH gauge. No
 * forecast value ever stands in this text — those come from the app and carry their own time stamp. Rules: no
 * official-warning language of our own, no safety verdict, every number names its origin (CLAUDE.md, D-04).
 *
 * Pure: no React, no DOM; Node loads it with `--experimental-strip-types`. Only the lazy text chunk and the build
 * import it — never the start bundle.
 */
import type { SeoText } from '../seo/layerSeoTexts';
import { SEA_SPOT_FACTS, type SeaSpotFact } from './seaSpotFacts';
import { DK_FUSION_NOTE, DMI_CREDIT, DMI_WARN_URL } from './seaDmi';

const DIR16 = ['Nord', 'Nordnordost', 'Nordost', 'Ostnordost', 'Ost', 'Ostsüdost', 'Südost', 'Südsüdost',
  'Süd', 'Südsüdwest', 'Südwest', 'Westsüdwest', 'West', 'Westnordwest', 'Nordwest', 'Nordnordwest'] as const;
/** Direction word of a bearing (16 points, German). */
export const dirWord = (deg: number) => DIR16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

/** DWD writes area and coast names in ASCII (`Suedliche Ostsee`); the page text uses the real spelling. */
const DWD_SPELLING: ReadonlyArray<[RegExp, string]> = [
  [/Suedoestliche/g, 'Südöstliche'], [/Suedwestliche/g, 'Südwestliche'], [/Suedliche/g, 'Südliche'],
  [/Boddengewaesser/g, 'Boddengewässer'], [/Kueste/g, 'Küste'], [/muendung/g, 'mündung'], [/Oestlich/g, 'Östlich'],
  [/oestlich/g, 'östlich'], [/Ruegen/g, 'Rügen'],
];
export const dwdName = (s: string) => DWD_SPELLING.reduce((out, [re, to]) => out.replace(re, to), s);

const KIND: Readonly<Record<string, string>> = { strand: 'Badestrand', kite: 'Kite-Spot', hafen: 'Hafen', revier: 'Revier' };
const listDe = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}`);
const n1 = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
const REGION = { nordsee: 'Nordsee', ostsee: 'Ostsee' } as const;
const COAST = { Nordseekueste: 'Nordseeküste', Ostseekueste: 'Ostseeküste' } as const;

const NAME_OF: ReadonlyMap<string, string> = new Map(SEA_SPOT_FACTS.map((s) => [s.id, s.name]));
/** The official page of the DWD marine weather service (bulletins and warnings for North Sea and Baltic). */
export const DWD_SEEWETTER_URL = 'https://www.dwd.de/DE/leistungen/seewetternordostsee/seewetternordostsee.html';

/** The SEO text of one spot (`null` for an id the catalogue does not know). */
export function seaSpotSeoText(id: string): SeoText | null {
  const s = SEA_SPOT_FACTS.find((x) => x.id === id);
  return s ? textOf(s) : null;
}

function textOf(s: SeaSpotFact): SeoText {
  if (s.country === 'DK') return textOfDk(s);
  if (s.lake) return textOfLake(s);
  const wodl = s.wodl ?? (s.region === 'nordsee' ? 'Nordseekueste' : 'Ostseekueste');
  const region = REGION[s.region as 'nordsee' | 'ostsee'];
  const area = s.seaArea ? dwdName(s.seaArea) : null;
  const coast = s.coast ? dwdName(s.coast) : null;
  const facing = dirWord(s.normal), opposite = dirWord(s.normal + 180);
  const sideA = dirWord(s.normal + 90), sideB = dirWord(s.normal - 90);
  const kinds = s.kinds.map((k) => KIND[k] ?? k);
  const station = s.station ? { name: s.station[0], km: n1(s.station[1]) } : null;
  const gauge = s.gauge ? { name: s.gauge[0], km: n1(s.gauge[1]) } : null;

  const lead = `Seewetter für ${s.name} an der ${region}: Diese Seite zeigt für den Spot die kommenden 78 Stunden Stunde für Stunde, `
    + `nämlich Wind und Böen aus buscosun Fusion, die signifikante Wellenhöhe getrennt nach Windsee und Dünung aus dem Küstenwellenmodell CWAM `
    + `des Deutschen Wetterdienstes${gauge ? `, den Wasserstand am BSH-Pegel ${gauge.name}` : ''} und ${area ? `den Seewetterbericht für das Seegebiet ${area}` : 'den Seewetterbericht für die deutsche Küste'} im Wortlaut. `
    + `${coast ? `${s.name} gehört zum Küstenabschnitt „${coast}“` : `${s.name} liegt an der deutschen ${COAST[wodl]}`}${station ? `, die nächste Messstation des DWD ist ${station.name} (${station.km} km)` : ''}. `
    + 'Die Seite ist kein amtliches Warnprodukt und ersetzt weder den amtlichen Bericht noch die eigene seemännische Einschätzung.';

  const orientation = `Das Ufer von ${s.name} zeigt nach ${facing} (${s.normal}°)${s.normalSet ? ', von Hand gesetzt, weil die Modellmaske hier der bekannten Strandlage widerspricht' : ', gerechnet aus der Land-See-Maske des Wellenmodells'}. `
    + `Wind aus ${facing} kommt damit auflandig vom Wasser, Wind aus ${sideA} oder ${sideB} läuft etwa parallel zum Ufer, und Wind aus ${opposite} weht ablandig aufs Wasser hinaus. `
    + 'Die Profile Kite, Wing/Surf und SUP/Kajak werten ablandigen und schräg ablandigen Wind deshalb als „außerhalb“; Jolle, Yacht, Motorboot und Angeln richten sich nach Wind, Böen und Seegang, und jede Grenze lässt sich in der Ansicht anpassen. '
    + `Im Katalog steht ${s.name} als ${listDe(kinds)}${s.tidal ? ' im Wattenmeer' : ''}.`;

  const provenance = `Der Seegang kommt aus der CWAM-Gitterzelle ${n1(s.cellKm)} km vor dem Spot; das Modell rechnet mit rund 900 Metern Maschenweite und kennt einzelne Buhnen, Molen oder Sandbänke nicht. `
    + (s.tidal ? 'Weil der Spot im Watt liegt, rechnet das Modell mit Gezeit und Wassertiefe: Bei Niedrigwasser kann die Zelle trockenfallen, und die Seite zeigt dann „kein Seegang“ statt 0 Meter. ' : '')
    + (station ? `Gemessener Wind und Böen kommen von der DWD-Station ${station.name}, ${station.km} km vom Spot entfernt, an Land und nicht auf dem Wasser, deshalb kann es draußen schwächer oder stärker wehen. ` : 'Eine DWD-Station mit Windmessung liegt nicht in der Nähe; die Ansicht sagt das, statt einen Wert zu übertragen. ')
    + (gauge ? `Den Wasserstand misst das Bundesamt für Seeschifffahrt und Hydrographie am Pegel ${gauge.name}, ${gauge.km} km entfernt, und sagt ihn dort auch vorher.` :'Ein BSH-Pegel liegt nicht im Umkreis von 20 Kilometern; die Ansicht nennt den nächsten Pegel mit seiner Entfernung.');

  const official = `Für ${s.name} gelten ${area ? `der Seewetterbericht für das Seegebiet ${area}` : 'der Seewetterbericht für Nord- und Ostsee'}${coast ? `, der Küstenbericht für den Abschnitt „${coast}“` : ''} `
    + `und die Starkwind-, Sturm- und Orkanwarnungen des Seewetterdienstes Hamburg für die deutsche ${COAST[wodl]}. `
    + `Im Reiter „Seegebiet“ stehen diese Texte unverändert im Wortlaut und mit Ausgabezeit; den Wind nennt der Bericht in Beaufort, den Seegang in Metern, und aus der amtlichen Mittelfrist kommt die Wassertemperatur der ${region} als Spanne. `
    + '„Keine Warnung“ zeigt die Seite nur, wenn der amtliche Text genau das sagt, sonst steht der Wortlaut obenan; ein veralteter Warnstatus gilt als unbekannt.';

  const near = s.near.map(([id, km]) => ({ label: `${NAME_OF.get(id) ?? id} (${n1(km)} km)`, href: `/seewetter/${id}` }));
  const sources = ['DWD CWAM (Seegang)', 'buscosun Fusion (Wind, Böen)'];
  if (station) sources.push(`DWD-Station ${station.name} (Messung)`);
  if (gauge) sources.push(`BSH-Pegel ${gauge.name} (Wasserstand, CC BY 4.0)`);
  sources.push('Seewetterdienst Hamburg (Berichte im Wortlaut)');

  return {
    h1: `Seewetter ${s.name}: Wind, Wellen und Wasserstand`,
    lead,
    body: [orientation, provenance, official],
    facts: [
      { label: 'Quellen', text: sources.join(' · ') },
      { label: 'Lage', text: `${n1(s.lat)}° N, ${n1(s.lon)}° O · ${region}${area ? ` · Seegebiet ${area}` : ''}${coast ? ` · Küstenabschnitt ${coast}` : ''}` },
      { label: 'Ufer', text: `zeigt nach ${facing} (${s.normal}°): auflandig bei Wind aus ${facing}, ablandig bei Wind aus ${opposite}` },
      { label: 'Spot', text: `${listDe(kinds)}${s.tidal ? ' · Watt (kann trockenfallen)' : ''}` },
      { label: 'Aktualisierung', text: 'Prüfung alle 15 Minuten; CWAM-Läufe um 00 und 12 UTC, rund 4 Stunden später vollständig; Horizont 78 Stunden' },
      { label: 'Grenze', text: 'kein amtliches Warnprodukt, keine Sicherheitsbewertung, keine Strömung; Hafenbecken und Sandbänke löst das Modell nicht auf' },
    ],
    official: { text: 'Den amtlichen Seewetterbericht und die Warnungen für Nord- und Ostsee gibt der Seewetterdienst Hamburg des DWD heraus:', label: 'Seewetter beim DWD', href: DWD_SEEWETTER_URL },
    links: [
      { label: 'Seewetter Nord- und Ostsee: alle Spots', href: '/seewetter' },
      { label: 'Seegang, Windsee und Dünung erklärt', href: '/wissen/seegang-wellenhoehe/' },
      { label: 'Den Seewetterbericht lesen', href: '/wissen/seewetterbericht/' },
      ...s.places.map(([slug, name]) => ({ label: `Wetter ${name}`, href: `/wetter/${slug}/` })),
    ],
    related: near.length ? { heading: 'Spots in der Nähe', items: near } : undefined,
    place: { name: s.name, lat: s.lat, lon: s.lon, containedIn: area ?? coast ?? region },
    explainer: null,
  };
}

// --- Phase DK (audit/seewetter-daenemark.md) -----------------------------------------------------------------------

/**
 * A Danish spot: the same waves (DWD CWAM) and the same DWD sea-area report, but its own sentences for everything that
 * differs — where wind, water level and measurement come from, and that there is no official warning status for the
 * Danish coast on this page (DMI is linked, never quoted).
 */
/**
 * Phase BS — the text of a lake spot. A lake has no wave model, no sea weather report and no tide; what the page shows
 * there is wind and gusts of buscosun Fusion at the level of the lake, an estimated wind wave of our own, the official
 * DWD lake warning where there is one, and water temperature and level where a source with a clear licence exists.
 * Everything below is a property of the place (lake, shore, fetch, stations) — no forecast value.
 */
function textOfLake(s: SeaSpotFact): SeoText {
  const l = s.lake!;
  const facing = dirWord(s.normal), opposite = dirWord(s.normal + 180);
  const sideA = dirWord(s.normal + 90), sideB = dirWord(s.normal - 90);
  const kinds = s.kinds.map((k) => KIND[k] ?? k);
  const station = s.station ? { name: s.station[0], km: n1(s.station[1]) } : null;
  const abroad = l.lands.filter((x) => x !== l.land);
  const where = `${l.name}${abroad.length ? `, einem Grenzsee zwischen ${listDe(l.lands)}` : ` in ${l.land === 'Schweiz' ? 'der Schweiz' : l.land}`}`;
  const deep = l.depthM > 90;
  const waterBits = [
    l.wt ? `die gemessene Wassertemperatur am WSV-Pegel ${l.wt}` : null,
    l.model ? 'die Wassertemperatur aus dem Seenmodell Alplakes der Eawag' : null,
    l.level ? `den Wasserstand ${l.level[0] === 'wsv' ? 'am WSV-Pegel' : 'an der BAFU-Station'} ${l.level[1]}` : null,
  ].filter((x): x is string => !!x);

  const lead = `Seewetter für ${s.name} am ${where}: Diese Seite zeigt für den Spot die kommenden 78 Stunden Stunde für Stunde, `
    + 'nämlich Wind und Böen aus buscosun Fusion mit der Spanne, in der sie meist liegen, einen Hinweis auf Sicht, Schauer und Gewitter '
    + `und eine geschätzte Windwelle aus eigener Rechnung${waterBits.length ? `, dazu ${listDe(waterBits)}` : ''}. `
    + (l.cell ? `Für das Gebiet „${l.cell}“ gibt der Deutsche Wetterdienst amtliche Warnungen für Binnenseen heraus, die Seite zeigt sie im Wortlaut. ` : `Einen amtlichen Warnstatus für den ${l.name} hat die Seite nicht im Datenbestand und sagt das auch. `)
    + 'Ein Wellenmodell, einen Seewetterbericht, Gezeiten und Strömung gibt es für den See nicht. '
    + 'Die Seite ist kein amtliches Warnprodukt und ersetzt weder die amtliche Meldung noch die eigene Beobachtung auf dem Wasser.';

  const orientation = `Das Ufer von ${s.name} zeigt nach ${facing} (${s.normal}°), gerechnet aus dem Umriss des Sees. `
    + `Wind aus ${facing} kommt damit auflandig vom Wasser, Wind aus ${sideA} oder ${sideB} läuft etwa parallel zum Ufer, und Wind aus ${opposite} weht ablandig auf den See hinaus. `
    + `Am weitesten ist das Wasser von hier aus nach ${dirWord(l.fetchFrom)} offen, ${n1(l.fetchKm)} km bis zum nächsten Ufer: Bei Wind aus dieser Richtung hat die Welle den längsten Anlauf. `
    + `Der ${l.name} liegt auf ${l.elevM} Metern über dem Meer, ist ${n1(l.areaKm2)} Quadratkilometer groß und im Mittel ${n1(l.depthM)} Meter tief. `
    + `Im Katalog steht ${s.name} als ${listDe(kinds)}.`;

  const provenance = 'Den Wind rechnet buscosun Fusion an einem Punkt auf dem Wasser kurz vor dem Ufer, auf der Höhe des Seespiegels und nicht auf der Höhe der umliegenden Berge oder Hänge. '
    + 'Die Windwelle ist eine Schätzung nach den Vorhersagegleichungen des Shore Protection Manual von 1984: aus dem Wind, der Strecke über den See in Windrichtung und der mittleren Tiefe des Sees, für anhaltenden Wind. '
    + (deep || l.depthM >= 20 ? 'Bei dieser Tiefe begrenzt praktisch nur der Anlauf über das Wasser die Welle, nicht der Seegrund. ' : 'Weil der See flach ist, begrenzt neben dem Anlauf auch die Wassertiefe die Welle. ')
    + 'An Stunden ohne bestimmte Windrichtung nennt die Seite nur eine Obergrenze über die längste Strecke. Die Schätzung ist nicht gemessen und nicht amtlich und geht in keine Bewertung ein; eine Einstufung nach Profil gibt es an Seen noch nicht. '
    + (station ? `Gemessener Wind und Böen kommen von der Station ${station.name}${l.stationNet ? ` (${l.stationNet})` : ''}, ${station.km} km vom Spot entfernt, an Land und nicht auf dem Wasser.` : 'Eine Station mit Windmessung auf Höhe des Sees liegt nicht im Umkreis von 25 Kilometern; die Ansicht sagt das, statt einen Wert zu übertragen.');

  const official = l.cell
    ? `Für den ${l.name} gibt der Deutsche Wetterdienst amtliche Warnungen für Binnenseen heraus, hier für das Gebiet „${l.cell}“. Die Seite liest die Warndatei des DWD und zeigt eine geltende Meldung unverändert im Wortlaut, mit Beginn, Ende und Ausgabezeit. `
      + 'Steht für das Gebiet keine Meldung in der Datei, sagt die Karte genau das. Ein Böenhinweis aus buscosun Fusion steht getrennt davon und ist als nicht amtlich gekennzeichnet.'
    : `Für den ${l.name} liegt der Seite kein amtlicher Warnstatus in maschinenlesbarer Form mit geklärter Lizenz vor. Die Karte dazu trägt deshalb die Überschrift „Kein amtlicher Warnstatus im Datenbestand“ und verlinkt den zuständigen Dienst${l.service ? ` (${l.service[0]})` : ''}; `
      + 'das heißt nicht, dass es dort keine amtliche Meldung gibt. Ein Böenhinweis aus buscosun Fusion steht getrennt davon und ist als nicht amtlich gekennzeichnet.';

  const near = s.near.map(([id, km]) => ({ label: `${NAME_OF.get(id) ?? id} (${n1(km)} km)`, href: `/seewetter/${id}` }));
  const sources = ['buscosun Fusion (Wind, Böen, Spanne, Hinweise)', 'eigene Schätzung der Windwelle (Shore Protection Manual 1984)'];
  if (l.cell) sources.push('Deutscher Wetterdienst (Warnungen für Binnenseen im Wortlaut)');
  if (station) sources.push(`Station ${station.name}${l.stationNet ? `, ${l.stationNet}` : ''} (Messung)`);
  if (l.wt) sources.push(`WSV-Pegel ${l.wt} (Wassertemperatur, PEGELONLINE)`);
  if (l.model) sources.push('Alplakes, Eawag (Wassertemperatur Modell, CC BY 4.0)');
  if (l.level) sources.push(l.level[0] === 'wsv' ? `WSV-Pegel ${l.level[1]} (Wasserstand)` : `BAFU-Station ${l.level[1]} (Wasserstand)`);
  sources.push(l.outline === 'dlm250' ? 'Umriss: © GeoBasis-DE / BKG (DLM250)' : l.outline === 'swisstopo' ? 'Umriss: © swisstopo' : 'Umriss: Copernicus EU-Hydro (EEA)');

  return {
    h1: `Seewetter ${s.name}: Wind, Böen und Windwelle am ${l.name}`,
    lead,
    body: [orientation, provenance, official],
    facts: [
      { label: 'Quellen', text: sources.join(' · ') },
      { label: 'Lage', text: `${n1(s.lat)}° N, ${n1(s.lon)}° O · ${l.name} · ${l.land}` },
      { label: 'Ufer', text: `zeigt nach ${facing} (${s.normal}°): auflandig bei Wind aus ${facing}, ablandig bei Wind aus ${opposite}; längste Strecke über das Wasser ${n1(l.fetchKm)} km nach ${dirWord(l.fetchFrom)}` },
      { label: 'Spot', text: listDe(kinds) },
      { label: 'Aktualisierung', text: `Prüfung alle 15 Minuten; Wind alle drei Stunden neu, Horizont 78 Stunden${l.model ? '; Seenmodell höchstens alle sechs Stunden abgefragt' : ''}` },
      { label: 'Grenze', text: 'kein amtliches Warnprodukt, keine Einstufung nach Profil, kein Wellenmodell, keine Strömung; die Windwelle ist geschätzt und gilt für das offene Wasser vor dem Spot, nicht für die Brandung am Ufer' },
    ],
    ...(l.service ? { official: { text: l.cell ? 'Warnungen für Binnenseen gibt der Deutsche Wetterdienst heraus:' : `Zuständig für Warnungen am ${l.name}:`, label: l.service[0], href: l.service[1] } } : {}),
    links: [
      { label: 'Seewetter: alle Spots an Küste und Seen', href: '/seewetter' },
      { label: 'Seegang, Windsee und Dünung erklärt', href: '/wissen/seegang-wellenhoehe/' },
      ...s.places.map(([slug, name]) => ({ label: `Wetter ${name}`, href: `/wetter/${slug}/` })),
    ],
    related: near.length ? { heading: 'Spots in der Nähe', items: near } : undefined,
    place: { name: s.name, lat: s.lat, lon: s.lon, containedIn: l.name },
    explainer: null,
  };
}

function textOfDk(s: SeaSpotFact): SeoText {
  const region = REGION[s.region as 'nordsee' | 'ostsee'];
  const area = s.seaArea ? dwdName(s.seaArea) : null;
  const facing = dirWord(s.normal), opposite = dirWord(s.normal + 180);
  const sideA = dirWord(s.normal + 90), sideB = dirWord(s.normal - 90);
  const kinds = s.kinds.map((k) => KIND[k] ?? k);
  const station = s.station ? { name: s.station[0], km: n1(s.station[1]) } : null;
  const wl = s.dk?.wl ?? null;
  const dmiWind = s.dk?.wind === 'dmi';
  const windLead = dmiWind
    ? 'Wind und Böen aus dem Wettermodell HARMONIE des dänischen Wetterdienstes DMI'
    : `Wind und Böen aus buscosun Fusion (${DK_FUSION_NOTE})`;
  const wlLead = !wl ? '' : wl[0] === 'bsh' ? `, den Wasserstand am BSH-Pegel ${wl[1]} (${n1(wl[2])} km)` : ', den Wasserstand aus dem Sturmflutmodell DKSS des DMI';

  const lead = `Seewetter für ${s.name} in Dänemark, an der ${region}: Diese Seite zeigt für den Spot die kommenden 78 Stunden Stunde für Stunde, `
    + `nämlich ${windLead}, die signifikante Wellenhöhe getrennt nach Windsee und Dünung aus dem Küstenwellenmodell CWAM des Deutschen Wetterdienstes${wlLead} `
    + `und ${area ? `den Seewetterbericht des DWD für das Seegebiet ${area}` : 'den Seewetterbericht des DWD für Nord- und Ostsee'} im Wortlaut. `
    + `${station ? `Die nächste Messstation mit Wind ist ${station.name} des DMI (${station.km} km). ` : ''}`
    + 'Einen amtlichen Warnstatus für die dänische Küste zeigt die Seite nicht; dort warnt das DMI. '
    + 'Die Seite ist kein amtliches Warnprodukt und ersetzt weder den amtlichen Bericht noch die eigene seemännische Einschätzung.';

  const orientation = `Das Ufer von ${s.name} zeigt nach ${facing} (${s.normal}°), gerechnet aus der Land-See-Maske des Wellenmodells. `
    + `Wind aus ${facing} kommt damit auflandig vom Wasser, Wind aus ${sideA} oder ${sideB} läuft etwa parallel zum Ufer, und Wind aus ${opposite} weht ablandig aufs Wasser hinaus. `
    + 'Die Profile Kite, Wing/Surf und SUP/Kajak werten ablandigen und schräg ablandigen Wind deshalb als „außerhalb“; Jolle, Yacht, Motorboot und Angeln richten sich nach Wind, Böen und Seegang, und jede Grenze lässt sich in der Ansicht anpassen. '
    + `Im Katalog steht ${s.name} als ${listDe(kinds)}.`;

  const provenance = `Der Seegang kommt aus der CWAM-Gitterzelle ${s.cellKm < 0.1 ? 'direkt am Spot' : `${n1(s.cellKm)} km vor dem Spot`}; das Wellenmodell des DWD reicht bis 56,4° Nord und deckt die dänische Küste hier mit ab, kennt aber einzelne Molen oder Sandbänke nicht. `
    + (dmiWind
      ? `${s.name} liegt nördlich des Gebiets, für das buscosun Fusion rechnet (bis 55,5° Nord). Wind und Böen kommen deshalb aus dem Modell HARMONIE des DMI, reichen 60 Stunden weit und tragen keine Spanne. `
      : 'Den Wind rechnet buscosun Fusion an der Wasserzelle des Spots. Die Kalibrierung stammt von deutschen Stationen und ist in Dänemark nicht geprüft; die Ansicht sagt das an jedem Wert. ')
    + (station ? `Gemessener Wind und Böen kommen von der DMI-Station ${station.name}, ${station.km} km vom Spot entfernt, an Land und als Rohwert ohne Qualitätskontrolle. ` : 'Eine DMI-Station mit Windmessung liegt nicht in der Nähe; die Ansicht sagt das, statt einen Wert zu übertragen. ')
    + (!wl ? 'Einen Wasserstand zeigt die Seite für diesen Spot nicht.'
      : wl[0] === 'bsh' ? `Den Wasserstand misst und sagt das Bundesamt für Seeschifffahrt und Hydrographie am Pegel ${wl[1]} vorher, ${n1(wl[2])} km vom Spot.`
        : `Der Wasserstand ist eine Modellrechnung des DMI (Sturmflutmodell DKSS, Teilmodell ${wl[1]}) an einem Gitterpunkt ${n1(wl[2])} km vom Spot: Zentimeter gegen das Mittelwasser des Modells, das nach eigener Messung praktisch auf dem dänischen Höhenbezug DVR90 liegt. Ein BSH-Pegel mit Verlauf liegt nicht im Umkreis von 20 Kilometern.`);

  const official = `Für ${s.name} gibt der Seewetterdienst Hamburg des DWD ${area ? `den Seewetterbericht für das Seegebiet ${area}` : 'den Seewetterbericht für Nord- und Ostsee'} heraus; `
    + 'der Text steht im Dossier unverändert im Wortlaut und mit Ausgabezeit. '
    + 'Die Starkwind- und Sturmwarnungen des Seewetterdienstes gelten für die deutsche Küste, nicht für die dänische. Die Seite zeigt für diesen Spot deshalb keinen Warnstatus und sagt das auch; '
    + 'Amtliche Warnungen für dänische Gewässer und den dänischen Seewetterbericht veröffentlicht das DMI, die Seite verlinkt beides und gibt die Texte nicht wieder.';

  const near = s.near.map(([id, km]) => ({ label: `${NAME_OF.get(id) ?? id} (${n1(km)} km)`, href: `/seewetter/${id}` }));
  const sources = ['DWD CWAM (Seegang)', dmiWind ? `DMI HARMONIE (Wind, Böen; ${DMI_CREDIT})` : 'buscosun Fusion (Wind, Böen)'];
  if (station) sources.push(`DMI-Station ${station.name} (Messung; ${DMI_CREDIT})`);
  if (wl) sources.push(wl[0] === 'bsh' ? `BSH-Pegel ${wl[1]} (Wasserstand, CC BY 4.0)` : `DMI-Sturmflutmodell DKSS (Wasserstand; ${DMI_CREDIT})`);
  sources.push('Seewetterdienst Hamburg (Seewetterbericht im Wortlaut)');

  return {
    h1: `Seewetter ${s.name}: Wind, Wellen und Wasserstand in Dänemark`,
    lead,
    body: [orientation, provenance, official],
    facts: [
      { label: 'Quellen', text: sources.join(' · ') },
      { label: 'Lage', text: `${n1(s.lat)}° N, ${n1(s.lon)}° O · Dänemark · ${region}${area ? ` · Seegebiet ${area} (DWD)` : ''}` },
      { label: 'Ufer', text: `zeigt nach ${facing} (${s.normal}°): auflandig bei Wind aus ${facing}, ablandig bei Wind aus ${opposite}` },
      { label: 'Spot', text: listDe(kinds) },
      { label: 'Aktualisierung', text: `Prüfung alle 15 Minuten; CWAM-Läufe um 00 und 12 UTC, rund 4 Stunden später vollständig; ${dmiWind ? 'Wind des DMI höchstens stündlich abgefragt, Horizont 60 Stunden' : 'Wind alle drei Stunden neu, Horizont 78 Stunden'}` },
      { label: 'Grenze', text: 'kein amtliches Warnprodukt, kein Warnstatus für die dänische Küste, keine Sicherheitsbewertung, keine Strömung; Hafenbecken und Sandbänke löst das Modell nicht auf' },
    ],
    official: { text: 'Warnungen für dänische Gewässer gibt das Dänische Meteorologische Institut (DMI) heraus:', label: 'Warnungen beim DMI', href: DMI_WARN_URL },
    links: [
      { label: 'Seewetter Nord- und Ostsee: alle Spots', href: '/seewetter' },
      { label: 'Seegang, Windsee und Dünung erklärt', href: '/wissen/seegang-wellenhoehe/' },
      { label: 'Den Seewetterbericht lesen', href: '/wissen/seewetterbericht/' },
      ...s.places.map(([slug, name]) => ({ label: `Wetter ${name}`, href: `/wetter/${slug}/` })),
    ],
    related: near.length ? { heading: 'Spots in der Nähe', items: near } : undefined,
    place: { name: s.name, lat: s.lat, lon: s.lon, containedIn: area ?? region },
    explainer: null,
  };
}

/** All spot texts keyed by canonical path — merged into `SUB_ROUTE_TEXTS` (`src/seo/subRouteTexts.ts`). */
export function seaSpotSeoTexts(): Record<string, SeoText> {
  return Object.fromEntries(SEA_SPOT_FACTS.map((s) => [`/seewetter/${s.id}`, textOf(s)]));
}
