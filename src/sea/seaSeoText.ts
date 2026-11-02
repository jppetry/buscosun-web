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
  const region = REGION[s.region];
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
    + `${coast ? `${s.name} gehört zum Küstenabschnitt „${coast}“` : `${s.name} liegt an der deutschen ${COAST[s.wodl]}`}${station ? `, die nächste Messstation des DWD ist ${station.name} (${station.km} km)` : ''}. `
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
    + `und die Starkwind-, Sturm- und Orkanwarnungen des Seewetterdienstes Hamburg für die deutsche ${COAST[s.wodl]}. `
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

/** All spot texts keyed by canonical path — merged into `SUB_ROUTE_TEXTS` (`src/seo/subRouteTexts.ts`). */
export function seaSpotSeoTexts(): Record<string, SeoText> {
  return Object.fromEntries(SEA_SPOT_FACTS.map((s) => [`/seewetter/${s.id}`, textOf(s)]));
}
