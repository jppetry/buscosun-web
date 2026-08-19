/**
 * Deep-Links zu amtlichen Fremdquellen (ehrlich statt Lücke).
 *
 * Muster übernommen von `src/avalanche.ts`: reines Mapping Land × Thema →
 * Ziel-URL, KEIN Fetch, KEINE eigene Gefahreneinschätzung. Wo buscosun keine
 * Daten hat, sagen wir, wo es sie gibt — statt den Nutzer allein zu lassen
 * (D-04 Ehrlichkeits-Prinzip).
 *
 * Aktuell abgedeckt: `warnings`. Amtliche Unwetterwarnungen liegen buscosun
 * nur für Deutschland vor (`src/sources/dwdAlerts.ts` via BrightSky/DWD); in
 * AT und CH ist die Warnliste strukturell leer — was ohne Hinweis wie
 * "keine Gefahr" aussieht. Genau das schließt dieses Modul.
 *
 * Alle URLs am 2026-08-01 live verifiziert (siehe
 * `audit/rechts-und-ehrlichkeits-paket.md` §1). Bei Link-Rot: jährliche
 * Sichtprüfung, Verweis im Betriebs-Runbook.
 */

import type { Country } from './types';

export type { Country };

export interface OfficialSource {
  /** Anzeigename des Dienstes (so, wie er sich selbst nennt). */
  name: string;
  /** Betreiber — für die Attribution im Hinweistext. */
  operator: string;
  url: string;
  /**
   * Ehrliche Einschränkung der Quelle, falls es eine gibt (D-04).
   * Wird im UI mitgezeigt, nie weggelassen.
   */
  caveat?: string;
}

/**
 * Deckt buscosun amtliche Warnungen für dieses Land in der **Punkt-Vorhersage**
 * selbst ab? Single Source of Truth für die Länder-Asymmetrie DORT —
 * Datenbasis ist `src/sources/dwdAlerts.ts` (BrightSky/DWD) und die ist
 * **DE-only**.
 *
 * ⚠️ Diese Funktion NICHT für die Karte benutzen und für CH NICHT umdrehen:
 * Phase W2 hat den Karten-Layer um die Schweiz erweitert, an der
 * Punkt-Vorhersage aber nichts geändert. Würde man sie kippen, verschwände der
 * ehrliche Hinweis in `PointForecastPanel.tsx` — und eine Datenlücke sähe dort
 * wieder aus wie eine Entwarnung. Für die Karte gilt `hasOwnMapWarnings()`.
 */
export function hasOwnWarnings(country: Country): boolean {
  return country === 'DE';
}

/**
 * Deckt der **2D-Karten-Layer** `warnings` dieses Land mit eigenen amtlichen
 * Daten ab? Bewusst getrennt von `hasOwnWarnings()`: die beiden Flächen haben
 * verschiedene Datenquellen und deshalb verschiedene Länder-Abdeckung.
 *
 *  - DE ✅ DWD CAP `DISTRICT_DWD_STAT` (Phase W1)
 *  - CH ✅ MeteoSchweiz über MeteoAlarm (Phase W2)
 *  - AT ❌ noch nicht — geplant als Phase W3 (GeoSphere `getWarnstatus`)
 */
export function hasOwnMapWarnings(country: Country): boolean {
  return country === 'DE' || country === 'CH';
}

/** Amtliche Unwetterwarnungen je Land. */
export function warningsSourceFor(country: Country): OfficialSource {
  switch (country) {
    case 'AT':
      return {
        name: 'Warnungen GeoSphere Austria',
        operator: 'GeoSphere Austria',
        url: 'https://portale.geosphere.at/portallib/html/warninfo/warninfo_alle.php',
        // Von GeoSphere selbst ausgewiesen — gehört in den Hinweis, nicht in eine Fußnote.
        caveat: 'gilt für den Dauersiedlungsraum, hochalpine Lagen ausgenommen',
      };
    case 'CH':
      return {
        name: 'Naturgefahrenportal des Bundes',
        operator: 'MeteoSchweiz',
        url: 'https://www.naturgefahren.ch/',
      };
    case 'DE':
    default:
      return {
        name: 'DWD-Warnungen',
        operator: 'Deutscher Wetterdienst',
        url: 'https://www.dwd.de/DE/wetter/warnungen/warnWetter_node.html',
      };
  }
}

/**
 * Deckt buscosun eine **amtliche Waldbrand-Gefahrenstufe** für dieses Land ab?
 *
 * DE ✅ DWD-Waldbrandgefahrenindex (Stationen) · CH ✅ BAFU/Kantone ·
 * **AT ❌** — und das ist keine Lücke in unserer Umsetzung, sondern in der
 * Datenlage: GeoSphere führt weder einen Waldbrand-Datensatz noch einen
 * Waldbrand-Warntyp, BOKU-Datenbank und BMLUK-Risikokarte haben weder Lizenz
 * noch Download (`docs/DATA_SOURCES.md` §W.1, in WB0 nachgeprüft).
 *
 * ⚠️ Bewusst **getrennt** von `hasOwnWarnings()`/`hasOwnMapWarnings()`: Das sind
 * drei verschiedene Produkte mit drei verschiedenen Länderabdeckungen. Wer sie
 * zusammenlegt, nimmt einer der Flächen ihren ehrlichen Hinweis.
 */
export function hasOfficialFireDanger(country: Country): boolean {
  return country === 'DE' || country === 'CH';
}

/**
 * Amtliche Waldbrand-Auskunft je Land.
 *
 * Für AT ist das der **einzige** Weg zu einer verbindlichen Aussage — die Karte
 * zeigt dort nur den EU-Modellwert, und der ist keine amtliche Stufe.
 */
export function fireSourceFor(country: Country): OfficialSource {
  switch (country) {
    case 'AT':
      return {
        name: 'Waldbrandgefahr Österreich',
        operator: 'Bundesministerium (BMLUK) und Länder',
        url: 'https://www.bmluk.gv.at/themen/wald/wald-und-naturgefahren/waldbrand.html',
        // Der Kern der Länder-Asymmetrie — gehört in den Hinweis, nicht in eine Fußnote.
        caveat: 'kein offener amtlicher Index; verbindlich sind die Verordnungen der '
          + 'Bezirkshauptmannschaften',
      };
    case 'CH':
      return {
        name: 'Waldbrandgefahr Schweiz',
        operator: 'BAFU und Kantone',
        url: 'https://www.naturgefahren.ch/home/aktuelle-naturgefahren/waldbrand.html',
        caveat: 'Aktualisierung Mo–Fr nach Mittag; die Kantone können abweichen',
      };
    case 'DE':
    default:
      return {
        name: 'Waldbrandgefahrenindex',
        operator: 'Deutscher Wetterdienst',
        url: 'https://www.dwd.de/DE/leistungen/waldbrandgef/waldbrandgef.html',
        caveat: 'Stationswerte; die amtliche Waldbrandstufe geben die Landesforstbehörden heraus',
      };
  }
}


/**
 * Gibt es für dieses Land eine **amtliche Ereignisbestätigung** aktiver Brände,
 * die buscosun selbst auswerten darf (Phase A1/A3, Gate GWBA1)?
 *
 * DE ❌ BBK/MoWaS über NINA — **Jans Entscheidung 2026-08-15: NICHT bauen.**
 *      Nicht weil § 5 UrhG nicht trüge, sondern weil der Grenznutzen gefallen
 *      ist (die EFFIS-Kartierung bestätigt bereits genau die großen Brände, die
 *      MoWaS meldet) und die Regel „keine unklare Lizenz" gilt: eine nicht
 *      zugesagte, community-dokumentierte API darf kein Label „amtlich
 *      bestätigt" speisen. Flag + Vertrag bleiben stehen (kein Löschen); erklärt
 *      das BBK je eine Lizenz, ist es ein Flag-Umlegen. Stattdessen: Deep-Link.
 * AT ❌ Es existiert **keine lizenzierbare Live-Einsatzquelle**: Die Landes-
 *      Einsatzübersichten (OÖ, Burgenland, Tirol, Steiermark) haben keine Lizenz
 *      bzw. erkennbaren Anti-Automatisierungs-Willen (base64-Verschleierung,
 *      robots.txt); ORF-RSS ist nicht-kommerziell. Serverseitiges Abrufen und
 *      Weiterverbreiten wäre Datenbankherstellerrecht (§ 76c UrhG). Für AT gibt
 *      es deshalb nur Kontext (GeoSphere-Warnungen) und **Deep-Links**, und das
 *      wird gesagt, wo es gilt.
 * CH ❌ Alertswiss ist CC BY-NC-SA, Swissfire passwortgeschützt; die beiden
 *      BAFU-Layer sind Gefahrenstufe/Massnahmen, keine Ereignisbestätigung.
 *
 * ⚠️ Getrennt von `hasOfficialFireDanger()` — Gefahrenstufe und Ereignis-
 * bestätigung sind zwei Produkte mit zwei Länderabdeckungen.
 */
export function hasOfficialFireConfirmation(country: Country): boolean {
  return country === 'DE' && MOWAS_ENABLED;
}

/**
 * Rule 2: MoWaS-Auswertung ist AUS (Jans Entscheidung 2026-08-15, s. o.). DE
 * bleibt bei „unbestätigt (nur Satellit)" statt still eine ungeklärte Quelle
 * zu ziehen. Der Verifier friert `false` für AT und CH unabhängig davon ein.
 */
export const MOWAS_ENABLED = false;

/**
 * Wo der Nutzer eine **Einsatz-/Ereignisbestätigung** selbst nachsehen kann.
 * Für AT ist das der einzige Weg — Verifikation beim Nutzer lassen, nicht
 * scrapen, nicht proxyen (`docs/DATA_SOURCES.md` §W, Kickoff GWBA1 A3).
 */
export function fireIncidentSourcesFor(country: Country): OfficialSource[] {
  switch (country) {
    case 'AT':
      return [
        {
          name: 'Einsatzübersicht Oberösterreich',
          operator: 'Landes-Feuerwehrverband Oberösterreich',
          url: 'https://einsaetze.ooelfv.at/einsatz/6stunden',
          caveat: 'nur Oberösterreich; Einsatzlisten anderer Länder sind nicht offen lizenziert',
        },
        {
          name: 'Einsatzübersicht Burgenland',
          operator: 'Landessicherheitszentrale Burgenland',
          url: 'https://einsatz.lsz-b.at/',
          caveat: 'nur Burgenland; keine landesweite offene Einsatzquelle für Österreich',
        },
      ];
    case 'CH':
      return [{
        name: 'Alertswiss',
        operator: 'Bundesamt für Bevölkerungsschutz BABS',
        url: 'https://www.alertswiss.ch/',
        caveat: 'Inhalte CC BY-NC-SA — buscosun übernimmt sie nicht, nur der Link',
      }];
    case 'DE':
    default:
      return [{
        name: 'Warnmeldungen NINA / MoWaS',
        operator: 'Bundesamt für Bevölkerungsschutz und Katastrophenhilfe (BBK)',
        // Verlinken ist kein Vervielfältigen: die Meldungsliste des BBK, dort
        // nach Ort suchen. buscosun wertet MoWaS nicht aus (s. MOWAS_ENABLED).
        url: 'https://warnung.bund.de/meldungen',
        caveat: 'Warnungen entstehen bei Gefahr für die Bevölkerung — kleine Feld- oder Waldbrände erzeugen keine; buscosun wertet sie nicht aus, nur der Link',
      }];
  }
}

/** Landesname im Dativ für Fließtext („Für Österreich …"). */
export function countryLabel(country: Country): string {
  return country === 'AT' ? 'Österreich' : country === 'CH' ? 'die Schweiz' : 'Deutschland';
}

/** Headless-Selbsttest (D-12; ohne DOM/Netz in Node lauffähig). */
export function verifyOfficialSources(): { checks: number; passed: number; failed: string[] } {
  const failed: string[] = [];
  let checks = 0;
  const countries: Country[] = ['DE', 'AT', 'CH'];

  for (const c of countries) {
    const s = warningsSourceFor(c);
    checks++;
    if (!/^https:\/\//.test(s.url)) failed.push(`${c}: URL nicht https`);
    checks++;
    if (!s.name || !s.operator) failed.push(`${c}: Name/Betreiber fehlt`);
  }

  // Die Länder-Asymmetrie ist der Kern des Moduls — sie darf nicht still kippen.
  checks++;
  if (!hasOwnWarnings('DE')) failed.push('DE müsste eigene Warnungen haben');
  checks++;
  if (hasOwnWarnings('AT') || hasOwnWarnings('CH')) {
    failed.push('AT/CH dürfen in der PUNKT-Vorhersage keine eigenen Warnungen melden, solange dwdAlerts DE-only ist');
  }

  // Karten-Abdeckung (Phase W2). Dasselbe Schutznetz, eine Fläche weiter:
  // Es sichert weiterhin, dass ein NICHT abgedecktes Land nicht so aussieht,
  // als sei dort nichts los — nur ist CH seit W2 abgedeckt und AT nicht.
  checks++;
  if (!hasOwnMapWarnings('DE') || !hasOwnMapWarnings('CH')) {
    failed.push('Karte: DE und CH werden vom Warn-Layer abgedeckt (W1/W2)');
  }
  checks++;
  if (hasOwnMapWarnings('AT')) {
    failed.push('Karte: AT hat noch KEINE eigenen Warnungen (erst Phase W3) — der Deep-Link muss bleiben');
  }
  // Die beiden Prädikate dürfen nicht zu einem verschmelzen: die Karte deckt
  // CH ab, die Punkt-Vorhersage nicht. Wer sie gleichsetzt, nimmt einer der
  // beiden Flächen ihren ehrlichen Hinweis.
  checks++;
  if (hasOwnWarnings('CH') === hasOwnMapWarnings('CH')) {
    failed.push('CH: Karte und Punkt-Vorhersage haben unterschiedliche Abdeckung — die Prädikate dürfen nicht gleich sein');
  }

  // AT trägt eine ausgewiesene Einschränkung; sie darf nicht verschwinden (D-04).
  checks++;
  if (!warningsSourceFor('AT').caveat) failed.push('AT: Hochalpin-Einschränkung fehlt');

  // Drei verschiedene Ziele — kein versehentliches Copy-Paste.
  checks++;
  const urls = new Set(countries.map((c) => warningsSourceFor(c).url));
  if (urls.size !== 3) failed.push('URLs sind nicht paarweise verschieden');

  // --- Waldbrand (Phase WB2) -----------------------------------------------
  // Dasselbe Schutznetz eine Fläche weiter: DE und CH haben eine amtliche
  // Stufe, AT hat keine — und das darf nicht still kippen, weder in die eine
  // noch in die andere Richtung.
  for (const c of countries) {
    const s = fireSourceFor(c);
    checks++;
    if (!/^https:\/\//.test(s.url)) failed.push(`Waldbrand ${c}: URL nicht https`);
    checks++;
    if (!s.name || !s.operator) failed.push(`Waldbrand ${c}: Name/Betreiber fehlt`);
    checks++;
    // Jede der drei Quellen trägt eine Einschränkung — keine ist voraussetzungslos.
    if (!s.caveat) failed.push(`Waldbrand ${c}: Einschränkung fehlt (D-04)`);
  }

  checks++;
  if (!hasOfficialFireDanger('DE') || !hasOfficialFireDanger('CH')) {
    failed.push('Waldbrand: DE und CH haben eine amtliche Stufe');
  }
  checks++;
  if (hasOfficialFireDanger('AT')) {
    failed.push('Waldbrand: AT hat KEINE offene amtliche Stufe — der Deep-Link muss bleiben');
  }
  checks++;
  if (!/Bezirkshauptmannschaften/.test(fireSourceFor('AT').caveat ?? '')) {
    failed.push('Waldbrand AT: der Hinweis auf die zuständige Stelle fehlt');
  }
  // CH publiziert Mo–Fr nach Mittag; am Wochenende ist der Stand systematisch
  // alt (Risiko R4). Wer das aus dem Hinweis entfernt, verschweigt es.
  checks++;
  if (!/Mo–Fr/.test(fireSourceFor('CH').caveat ?? '')) {
    failed.push('Waldbrand CH: Hinweis auf den Mo–Fr-Takt fehlt');
  }
  checks++;
  const fireUrls = new Set(countries.map((c) => fireSourceFor(c).url));
  if (fireUrls.size !== 3) failed.push('Waldbrand: URLs sind nicht paarweise verschieden');

  // Die drei Prädikate beschreiben DREI Produkte und dürfen nicht verschmelzen:
  // Karte-Warnungen deckt CH ab, Punkt-Warnungen nicht, Waldbrand deckt CH ab,
  // aber AT bei keinem. Eine Gleichsetzung nähme einer Fläche ihren Hinweis.
  checks++;
  if (hasOfficialFireDanger('AT') !== hasOwnMapWarnings('AT')) {
    failed.push('AT ist bei Warnungen UND Waldbrand unabgedeckt — beide false erwartet');
  }
  checks++;
  if (hasOfficialFireDanger('CH') === hasOwnWarnings('CH')) {
    failed.push('CH: Waldbrand ist abgedeckt, die Punkt-Warnungen nicht — die Prädikate dürfen nicht gleich sein');
  }


  // --- Waldbrand-Ereignisbestätigung (Phase A1/A3, Gate GWBA1) ---------------
  // Die AT-Lücke ist festgeschrieben: keine lizenzierbare Live-Einsatzquelle
  // ⇒ nie „bestätigt" aus eigener Auswertung, nur Kontext + Deep-Link (V-195).
  checks++;
  if (hasOfficialFireConfirmation('AT')) failed.push('Waldbrand AT: es gibt KEINE amtliche Ereignisbestätigung — Deep-Link muss bleiben');
  checks++;
  if (hasOfficialFireConfirmation('CH')) failed.push('Waldbrand CH: keine auswertbare Ereignisbestätigung (Alertswiss CC BY-NC-SA)');
  checks++;
  if (hasOfficialFireConfirmation('DE') !== MOWAS_ENABLED) failed.push('Waldbrand DE: Bestätigung hängt am MoWaS-Flag (STOPP & FRAGEN)');
  for (const c of countries) {
    const list = fireIncidentSourcesFor(c);
    checks++;
    if (!list.length) failed.push(`Einsatzquellen ${c}: keine Deep-Links`);
    for (const src of list) {
      checks++;
      if (!/^https:\/\//.test(src.url) || !src.name || !src.operator) failed.push(`Einsatzquellen ${c}: URL/Name/Betreiber unvollständig`);
      checks++;
      if (!src.caveat) failed.push(`Einsatzquellen ${c}: Einschränkung fehlt (D-04)`);
    }
  }
  checks++;
  // Kein Scraping-Ziel darf als Datenquelle auftauchen: die AT-Einträge sind Links, keine Fetch-URLs.
  if (fireIncidentSourcesFor('AT').some((s) => /api|json|rss|xml/i.test(s.url))) failed.push('Einsatzquellen AT: sieht nach Datenabruf statt Deep-Link aus');
  return { checks, passed: checks - failed.length, failed };
}
