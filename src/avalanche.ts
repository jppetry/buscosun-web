/**
 * Deep-Links zu den amtlichen Lawinenlageberichten (P1, ehrlich statt Lücke).
 *
 * buscosun modelliert KEINE Lawinengefahr. Für alpine Orte verlinken wir die
 * zuständige amtliche Quelle (SLF / lawinen.report / LWD Bayern) plus den
 * europäischen EAWS-Aggregator. Reines Mapping, kein Fetch — die Bulletins
 * sind saisonal (Winter); im Sommer zeigen sie „kein aktuelles Bulletin".
 */

export interface AvalancheService { name: string; url: string; }
export interface AvalancheInfo { region: string; primary: AvalancheService; eaws: AvalancheService; }

/** Europaweiter EAWS-Aggregator (kartenbasiert, löst auf jede Region auf). */
const EAWS: AvalancheService = { name: 'EAWS · avalanches.org', url: 'https://www.avalanches.org/' };

/** Ab dieser DEM-Höhe (m) zeigen wir den Lawinen-Hinweis (alpin). */
export const AVALANCHE_MIN_ELEVATION_M = 1000;

/** Amtliche Lawinen-Quelle je Land (Primärdienst + EAWS-Aggregator). */
export function avalancheFor(country: 'DE' | 'AT' | 'CH'): AvalancheInfo | null {
  switch (country) {
    case 'CH':
      return { region: 'Schweiz', primary: { name: 'SLF Lawinenbulletin', url: 'https://www.slf.ch/de/lawinenbulletin-und-schneesituation.html' }, eaws: EAWS };
    case 'AT':
      return { region: 'Österreich', primary: { name: 'lawinen.report', url: 'https://www.lawinen.report/' }, eaws: EAWS };
    case 'DE':
      return { region: 'Bayerische Alpen', primary: { name: 'Lawinenwarndienst Bayern', url: 'https://www.lawinenwarndienst-bayern.de/' }, eaws: EAWS };
    default:
      return null;
  }
}
