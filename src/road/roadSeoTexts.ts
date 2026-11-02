/**
 * Autobahnwetter-SEO (Phase SA, audit/seo-autobahnwetter.md): die Texte der 20 Autobahn-Seiten `/autobahnwetter/<slug>`.
 *
 * Jede Seite unterscheidet sich in der Sache, nicht nur im Namen: Teilstrecken, Zahl der Anlagen je Bundesland, die
 * höchstgelegenen Messstellen, Brücken, Wald, Niederungen und freie Lagen kommen aus `roadSeoFacts.ts` (ERZEUGT aus dem
 * Daten-Repo, `scripts/seo/build-road-seo-facts.mjs`), der Satz zu Verlauf und Gelände ist von Hand geschrieben und gegen
 * die Wikipedia-Artikel der Autobahnen geprüft (Beleg im Audit, §3). Was die Daten nicht hergeben (Baden-Württemberg ohne
 * Reihen), sagt der Text.
 *
 * Verbraucher: `src/seo/subRouteTexts.ts` (lazy Text-Chunk, `RouteSeoBlock`), `scripts/generate-seo.mjs` (Shells, JSON-LD).
 * NIE aus `routes.ts` oder anderem Start-Code importieren — die Zahlen gehören nicht ins Start-Bundle.
 */
import type { SeoText } from '../seo/layerSeoTexts';
import { ROAD_SEO_MOTORWAYS, roadSeoQuery } from './roadSeo';
import { ROAD_SEO_FACTS, ROAD_SEO_FACTS_STAND, ROAD_SEO_STATE_NAME, type RoadSeoFacts } from './roadSeoFacts';

/**
 * Verlauf und Gelände, ein bis zwei Sätze je Autobahn — geprüft gegen die deutschen Wikipedia-Artikel (audit §3). Keine
 * Unfall- oder Gefahrenaussagen, keine Steigungsprozente (das Höhenmodell taugt dafür nicht: Brücken und Tunnel).
 */
export const ROAD_SEO_TERRAIN: Readonly<Record<string, string>> = {
  a1: 'Zwischen Köln und Trier quert die A 1 die Eifel; zwischen Blankenheim und Kelberg fehlt ein rund 25 Kilometer langes Teilstück. Im Süden führt sie über den Hunsrück ins Saarland.',
  a7: 'Die A 7 ist die längste Autobahn Deutschlands. Zwischen Göttingen und Kassel führt sie über die Kasseler Berge, zwischen Fulda und Würzburg durch die Rhön, und bei Nesselwang im Allgäu liegt mit 914 Metern der höchste Punkt aller deutschen Autobahnen.',
  a8: 'Zwischen Stuttgart und Ulm überwindet die A 8 am Albaufstieg zwischen Aichelberg und Hohenstadt die Schwäbische Alb, zwischen München und Rosenheim führt sie über den Irschenberg.',
  a2: 'Die A 2 führt vom Ruhrgebiet nach Osten über den Teutoburger Wald bei Bielefeld, quert bei Bad Oeynhausen die Weser und danach das Wesergebirge; östlich von Hannover verläuft sie unter anderem durch die Magdeburger Börde.',
  a9: 'Die A 9 verbindet Berlin und München. Zwischen Hof und Bayreuth führt sie über die Münchberger Hochfläche, zwischen Bayreuth und Nürnberg quert sie die Fränkische Alb.',
  a3: 'Die A 3 führt vom Niederrhein am Siebengebirge vorbei über den Westerwald, durch den Spessart zwischen Aschaffenburg und Würzburg und über die Fränkische Alb bei Parsberg an Passau vorbei bis zur österreichischen Grenze.',
  a4: 'Die A 4 ist zwischen Olpe und dem Kirchheimer Dreieck in Hessen unterbrochen: Im Westen führt sie von Aachen über Köln und durch das Bergische Land bis ins Sauerland bei Olpe, im Osten vom Kirchheimer Dreieck über Erfurt, Chemnitz und Dresden bis Görlitz.',
  a44: 'Die A 44 besteht aus mehreren Teilstücken zwischen Aachen und Kassel; eines führt vom Kreuz Dortmund/Unna am Haarstrang entlang an Soest vorbei über die Paderborner Hochfläche nach Kassel. Östlich von Kassel ist sie Richtung Eisenach abschnittsweise in Betrieb.',
  a6: 'Die A 6 verbindet das Saarland über Kaiserslautern, Mannheim, Heilbronn und Nürnberg mit der Oberpfalz; zwischen Nürnberg und Amberg steigt sie auf die Fränkische Alb.',
  a45: 'Die A 45, die Sauerlandlinie, führt von Dortmund durch Sauerland und Siegerland nach Hessen bis zum Seligenstädter Dreieck an der A 3 und hat viele große Talbrücken.',
  a96: 'Die A 96 führt von Lindau durch das Westallgäu, bei Wangen und Leutkirch durch Baden-Württemberg, und über Memmingen nach München.',
  a93: 'Die A 93 führt von Hof durch das Fichtelgebirge und die Oberpfalz nach Regensburg und weiter in die Hallertau; ein getrenntes Stück läuft im Inntal vom Inntaldreieck bei Rosenheim bis Kiefersfelden an die österreichische Grenze.',
  a99: 'Die A 99 ist der Autobahnring um München; im Süden ist der Ring nicht geschlossen.',
  a71: 'Die A 71 quert den Thüringer Wald im Rennsteigtunnel, mit knapp 8 Kilometern dem längsten Straßentunnel Deutschlands.',
  a5: 'Die A 5 führt vom Hattenbacher Dreieck an Gießen vorbei über Frankfurt in die Oberrheinebene und weiter über Karlsruhe und Freiburg bis zur Schweizer Grenze bei Basel.',
  a61: 'Die A 61 führt von der niederländischen Grenze bei Venlo über die Eifel und den Hunsrück nach Süden bis Hockenheim und quert bei Winningen die Mosel auf der Moseltalbrücke.',
  a20: 'Die A 20, die Ostseeautobahn, führt von Bad Segeberg über Lübeck, Wismar, Rostock und an Neubrandenburg vorbei bis zum Kreuz Uckermark.',
  a46: 'Die A 46 besteht aus drei getrennten Teilstücken: von Heinsberg über Düsseldorf nach Wuppertal, von Hagen bis Hemer und im Sauerland von Arnsberg über Meschede und Bestwig bis Olsberg.',
  a73: 'Die A 73 beginnt bei Suhl im Thüringer Wald und führt über Coburg und Lichtenfels durch das Maintal nach Bamberg, Erlangen und Nürnberg.',
  a31: 'Die A 31, die Emslandautobahn, führt von Emden durch das Emsland und das westliche Münsterland bis Bottrop.',
};

const de = (n: number) => n.toLocaleString('de-DE');
/** „a, b und c" */
function joinDe(xs: readonly string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}`;
}
const stateName = (s: string) => ROAD_SEO_STATE_NAME[s] ?? s;
/** Bundesländer ohne ausgelieferte Reihen (V-AW-20) — dieselbe Menge wie im Generator. */
const NO_SERIES_STATE = 'BW';
const isoDe = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : 'unbekannt');

function rowOf(slug: string) {
  const row = ROAD_SEO_MOTORWAYS.find(([s]) => s === slug);
  const f = ROAD_SEO_FACTS[slug];
  return row && f ? { name: row[1], span: row[2], f } : null;
}

function stateList(f: RoadSeoFacts): string {
  return joinDe(f.byState.map(([s, n]) => `${stateName(s)} ${de(n)}`));
}

function noSeriesSentence(f: RoadSeoFacts): string {
  if (!f.noSeries) return '';
  return f.noSeries === f.stations
    ? ' Alle liegen in Baden-Württemberg, von wo der DWD derzeit keine Messreihen ausliefert; die Seite zeigt dort die Prognose aus buscosun Fusion und sagt das dazu.'
    : ` Aus Baden-Württemberg liefert der DWD derzeit keine Messreihen; an den ${de(f.noSeries)} Anlagen dort zeigt die Seite die Prognose aus buscosun Fusion und sagt das dazu.`;
}

function highestSentence(name: string, f: RoadSeoFacts): string {
  const hs = f.highest;
  if (!hs.length) return '';
  const list = joinDe(hs.map((h) => `${h.name} (${de(h.h)} m)`));
  const noSeries = hs.filter((h) => h.state === NO_SERIES_STATE).length;
  if (hs[0].h < 150) return ` Die ${name} liegt flach: Am höchsten stehen ${list}.`;
  const note = noSeries === hs.length ? ', alle in Baden-Württemberg und damit derzeit ohne Messreihe' : noSeries ? `, davon ${noSeries === 1 ? 'eine' : de(noSeries)} in Baden-Württemberg und damit derzeit ohne Messreihe` : '';
  const withSeries = f.highestWithSeries.length
    ? ` Mit Messreihe am höchsten: ${joinDe(f.highestWithSeries.map((h) => `${h.name} (${de(h.h)} m, ${stateName(h.state)})`))}.`
    : '';
  return ` Am höchsten liegen laut Stationsliste ${list}${note}.${withSeries}`;
}

function partsSentence(slug: string, name: string, f: RoadSeoFacts): string {
  const long = f.parts.filter((p) => p.km >= 20);
  const short = f.parts.length - long.length;
  const opens = f.parts.find((p) => p.id === slug);
  const list = joinDe(long.map((p) => `${p.from} – ${p.to} (${de(p.km)} km)`));
  const head = f.parts.length > 1
    ? `Auf buscosun ist die ${name} in ${de(f.parts.length)} Teilstrecken mit zusammen rund ${de(f.km)} Kilometern in Deutschland geteilt, jede mit eigenem Band: ${list}${short ? `, dazu ${short === 1 ? 'ein kurzes Stück' : `${de(short)} kurze Stücke`}` : ''}.`
    : `Auf buscosun läuft die ${name} als eine Strecke von ${f.parts[0].from} bis ${f.parts[0].to} mit rund ${de(f.km)} Kilometern in Deutschland. Das Band ordnet ihre Messstellen nach Kilometer und Fahrtrichtung, sodass sich Unterschiede entlang der Strecke auf einen Blick ablesen lassen.`;
  const open = opens && f.parts.length > 1 ? ` Diese Seite öffnet die Teilstrecke ${opens.from} – ${opens.to}; die anderen wählst du auf der Seite oder über die Links unten.` : '';
  return `${head}${open}`;
}

function terrainParagraph(slug: string, name: string, f: RoadSeoFacts): string {
  const t = ROAD_SEO_TERRAIN[slug];
  return `${t ? `${t} ` : ''}${partsSentence(slug, name, f)}`;
}

function stationsParagraph(name: string, f: RoadSeoFacts): string {
  return `Die Stationsliste des Deutschen Wetterdienstes führt an der ${name} insgesamt ${de(f.stations)} Glättemeldeanlagen: ${stateList(f)}.${noSeriesSentence(f)}${highestSentence(name, f)}`
    + ' Eine Anlage misst an einem Punkt: Zwischen zwei Anlagen, auf Brücken und in Senken kann die Fahrbahn anders sein, als die nächste Anlage meldet, und ein Wert, der eine Prüfregel nicht besteht, erscheint als Lücke mit Grund statt als Zahl.';
}

function siteParagraph(name: string, f: RoadSeoFacts): string {
  const low = f.lowland.length ? ` In einer Niederung, wo sich Kaltluft und Nebel länger halten, liegen laut Geländemodell unter anderem ${joinDe(f.lowland)}.` : '';
  const exp = f.exposed.length ? ` Frei und dem Wind ausgesetzt liegen unter anderem ${joinDe(f.exposed)}.` : '';
  return `Die Gefahren-Leiste teilt die ${name} in ${de(f.segments)} Abschnitte von Anschlussstelle zu Anschlussstelle und bewertet sie für jetzt bis +6 Stunden. Entlang der Achse liegen rund ${de(f.bridgeKm)} Kilometer Brücken, neben der Fahrbahn ist zu ${de(f.forestPct)} % Wald.${low}${exp}`
    + ' Ortsmerkmale lösen allein keine Stufe aus: Auf Brücken und im Schatten von Wald oder Einschnitt beginnt Stufe 1 für Reif und überfrierende Nässe schon 1 Kelvin früher, auf Brücken, Dämmen und in Waldschneisen liegen die Schwellen für Seitenwind 10 km/h niedriger.';
}

/** Wikipedia-Eintrag der Autobahn (deutsch), für `WebPage.about.sameAs`. */
export function roadSeoWikipedia(slug: string): string {
  return `https://de.wikipedia.org/wiki/Bundesautobahn_${slug.replace(/^a/, '')}`;
}

/** Der Text einer Autobahn-Seite (Form `SeoText`); `null` für unbekannte Slugs. */
export function roadSeoText(slug: string): SeoText | null {
  const r = rowOf(slug);
  if (!r) return null;
  const { name, span, f } = r;
  const q = roadSeoQuery(slug);
  const num = slug.replace(/^a/, '');
  const others = f.parts.filter((p) => p.id !== slug && p.km >= 20);
  const neighbours = f.meets.flatMap((s) => { const n = rowOf(s); return n ? [{ slug: s, name: n.name }] : []; });
  return {
    h1: `Autobahnwetter ${q}: Was messen die Glättemeldeanlagen?`,
    lead: `Autobahnwetter für die ${name} (${span}): Was die Glättemeldeanlagen an der ${name} melden, also Fahrbahntemperatur, Fahrbahnzustand, Wasserfilm, Luft und Taupunkt, kommt alle 15 Minuten aus dem Straßenwetter-System des Deutschen Wetterdienstes, wird geprüft und entlang der Strecke als Band gezeigt. Die DWD-Stationsliste führt an der ${name} insgesamt ${de(f.stations)} Anlagen auf rund ${de(f.km)} Kilometern. Dazu kommen die Gefahren-Leiste für jetzt bis +6 Stunden und das Wetter an der Strecke aus buscosun Fusion bis 48 Stunden. Kein amtliches Warnprodukt und keine Verkehrsmeldung.`,
    body: [terrainParagraph(slug, name, f), stationsParagraph(name, f), siteParagraph(name, f)],
    facts: [
      { label: 'Quellen', text: 'Glättemeldeanlagen der Straßenbauverwaltungen über das Straßenwetter-System des DWD · buscosun Fusion für die Stunden voraus · Achsen BKG DLM250, Abschnitte und Brücken OpenStreetMap' },
      { label: 'Takt', text: 'Messung alle 15 Minuten, Gefahren-Leiste jetzt bis +6 Stunden, Vorhersage stündlich bis 48 Stunden' },
      { label: 'Abdeckung', text: `${de(f.stations)} Anlagen laut DWD-Stationsliste (${f.byState.map(([s, n]) => `${s} ${n}`).join(', ')}), rund ${de(f.km)} km in Deutschland, ${de(f.segments)} Abschnitte` },
      { label: 'Grenze', text: `Punktmessungen, vom DWD nicht qualitätsgeprüft${f.noSeries ? '; aus Baden-Württemberg derzeit keine Reihen' : ''}; kein amtliches Warnprodukt, keine Verkehrsmeldung` },
      { label: 'Stand', text: `Stationsliste abgerufen am ${isoDe(ROAD_SEO_FACTS_STAND.stationList)}, Abschnitte vom ${isoDe(ROAD_SEO_FACTS_STAND.segments)}` },
    ],
    official: { text: 'Baustellen, Sperrungen und Verkehrsmeldungen meldet die', label: 'Autobahn GmbH des Bundes', href: 'https://www.autobahn.de/' },
    links: [
      ...others.map((p) => ({ label: `${name}: ${p.from} – ${p.to}`, href: `/autobahnwetter/${p.id}` })),
      ...neighbours.map((n) => ({ label: `Autobahnwetter ${n.name}`, href: `/autobahnwetter/${n.slug}` })),
      { label: 'So liest du das Autobahnwetter', href: '/funktionen/autobahnwetter/' },
      { label: 'Prüfregeln der Messwerte', href: '/methodik/autobahnwetter-pruefregeln/' },
      { label: 'Amtliche Warnungen', href: '/warnungen' },
    ],
    explainer: null,
    faq: [
      {
        q: `Wie viele Glättemeldeanlagen gibt es an der ${q}?`,
        a: `Die Stationsliste des Deutschen Wetterdienstes führt an der ${name} insgesamt ${de(f.stations)} Anlagen: ${stateList(f)}.${noSeriesSentence(f)}`,
      },
      ...(f.highest.length ? [{
        q: `Wo stehen die höchstgelegenen Messstellen an der ${q}?`,
        a: `${highestSentence(name, f).trim()} Die Gefahren-Leiste wertet die gemessene Fahrbahntemperatur, den Taupunkt und den Fahrbahnzustand aus, nicht die Höhe allein; wo keine Messreihe kommt, rechnet sie mit der Prognose und sagt das.`,
      }] : []),
      {
        q: `Ist das Autobahnwetter für die ${q} eine Glättewarnung?`,
        a: `Nein. Die Seite zeigt Messwerte der Anlagen an der ${name} und eine regelbasierte Einschätzung mit benannten Schwellen, kein amtliches Warnprodukt. Amtliche Warnungen gibt der Deutsche Wetterdienst heraus, Sperrungen und Baustellen meldet die Autobahn GmbH des Bundes.`,
      },
    ],
    about: { type: 'Place', name: `Bundesautobahn ${num}`, sameAs: roadSeoWikipedia(slug) },
  };
}
