/**
 * Zielgruppen-Landingpages /fuer/<slug>/ (SEO/GEO 2026, E6) — build-only.
 *
 * Eine Seite je Anwendergruppe: was buscosun für diese Gruppe konkret tut,
 * wie man es benutzt (Deep-Links in die App), was es ausdrücklich NICHT kann
 * (Grenzen aus docs/zielgruppen-dach.md Teil C, FEATURE-INVENTAR.md §0.5 und
 * dem Code) und welche DE/AT/CH-Asymmetrien die Gruppe betreffen.
 *
 * Regeln (bindend): keine Live-Werte, keine amtliche Warnsprache (Warnungen
 * nur als wörtliches Zitat), „bestätigt" nur mit Quelle im selben Satz,
 * keine Gesundheitsaussagen, jede Zahl aus einer Code-Konstante — Belegstelle
 * im Kommentar der jeweiligen Seite. Seitenform identisch zu METHODIK_PAGES,
 * damit renderArticlePage aus content.mjs unverändert wiederverwendet wird.
 */
import {
  SITE, headBlock, PAGE_CSS, escapeHtml, DEFAULT_OG_IMAGE, renderArticlePage, ogImageOr } from './content.mjs';

export const AUDIENCES_UPDATED = '2026-09-05';

const p = (s) => `<p>${s}</p>`;
const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const ol = (items) => `<ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
const a = (href, text) => `<a href="${href}">${text}</a>`;

/** Gemeinsamer Grenzen-Hinweis (identisch zur Methodik). */
const NO_WARNING = 'buscosun gibt keine amtlichen Warnungen heraus; amtliche Warntexte erscheinen nur als wörtliches Zitat. Maßgeblich bleiben DWD, GeoSphere Austria und MeteoSchweiz.';
/** Kein Backend — gilt für jede Gruppe, die „warne mich" erwartet. */
const NO_PUSH = 'Es gibt keine Push-Benachrichtigung: buscosun hat keinen Server, Hinweise erscheinen nur bei geöffneter App. Wer einen Alarm braucht, braucht eine andere Quelle.';

export const AUDIENCES = [
  // ---------------------------------------------------------------------------
  // Belege: src/atmosphere/AtmosphereDeck.tsx (LAYER_ROWS, PointQuery), src/threed/SectionChart.tsx (Wind-Heatmap,
  // Pfeile, MeasuredColumn), src/threed/buildCrossSection.ts (5 Anker, sectionMethod), src/threed/crossSection.ts
  // (Windbänder, Scherung 25 km/h je 300 m, 150-m-Stufen, topM, Wolkenbasis ab 35 % Bewölkung), radiosonde.ts (40 km,
  // 30 h), wind/iconEuPressureWind.ts (850/700/500 hPa). Föhn-, Thermik- und Go/No-Go-Ansicht: zurückgezogen 01.11.2026.
  // ---------------------------------------------------------------------------
  {
    slug: 'gleitschirmflieger',
    title: 'Für Gleitschirmflieger',
    updated: '2026-11-01',
    h1: 'buscosun für Gleitschirm- und Drachenflieger: Höhenwind, Böen und Wolkenbasis im Vertikalschnitt',
    description: 'Höhenwind und Böen im Vertikalschnitt, Wolkenbasis als Näherung, Windkarte in 850, 700 und 500 hPa — keine Thermik-Prognose, kein Flugwetter-Briefing.',
    answer: 'buscosun zeigt Gleitschirm- und Drachenfliegern den Wind über dem Gelände: Im Vertikalschnitt entlang einer frei gezogenen Linie stehen Höhenwind, Böen, Windscherung und auf Wunsch die Wolkenbasis, auf der Windkarte die Druckflächen 850, 700 und 500 hPa. Eine Karte der Thermik, einen Steigwert, ein Flugurteil oder einen Föhn-Index gibt es nicht, und ein amtliches Flugwetter-Briefing ersetzt buscosun nicht.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Im <strong>Vertikalschnitt</strong> ziehst du auf der Karte eine Linie, etwa vom Startplatz zum Landeplatz oder quer über ein Tal. Darüber zeichnet buscosun das Geländeprofil und den Wind je Höhe in fünf Bändern (unter 15, 15–30, 30–45, 45–60 und über 60 km/h) mit Pfeilen für die Richtung. Zuschaltbar sind Böen, Zonen starker Windscherung (ab 25 km/h je 300 m), Strömungslinien und die Wolkenbasis. Ein Klick in den Schnitt nennt für diesen Punkt die Höhe, den Abstand über Grund, Mittelwind, Böe, Richtung und Temperatur; der Zeit-Regler läuft über die nächsten Stunden.') +
        p('Die Werte je Höhe kommen aus dem Höhen-Cube mit den Modellflächen von ICON-D2 (DWD, rund 2,2 km), am Boden an fünf Punkten der Linie auf buscosun Fusion verankert. Fehlt der Cube, rechnet der Schnitt aus dem Bodenwind mit einem Potenzgesetz hoch und schreibt das dazu. Liegt ein Radiosondenaufstieg höchstens 40 km neben der Linie und ist er höchstens 30 Stunden alt, steht sein gemessener Wind als eigene, beschriftete Säule daneben.') +
        p('Auf der Wetterkarte schaltet der Windlayer vom 10-m-Wind (ICON-D2, 2,2 km) auf die Druckflächen 850, 700 und 500 hPa aus ICON-EU um; die Böenkarte reicht 24 Stunden voraus. Das Regenradar zeigt, ob Schauer am Standort ankommen, und die Wissensseiten erklären Thermik, Talwind und Inversion als Phänomene, ohne dass buscosun sie für deinen Startplatz vorhersagt.') },
      { h2: 'So nutzt du buscosun als Gleitschirmflieger', html: ol([
        `Öffne den ${a('/atmosphaere/querschnitt', 'Vertikalschnitt')}, wähle den Ort und ziehe eine Linie vom Startplatz zum Landeplatz; der Schnitt öffnet sich von selbst. Die Windbänder zeigen, wo es kräftig wird.`,
        `Schalte Böen und Wolkenbasis zu, bewege den Zeit-Regler und tippe in den Schnitt, um Wind und Temperatur an einem Punkt abzulesen.`,
        `Prüfe den Höhenwind auf der ${a('/wetterkarte/wind', 'Windkarte')}: im Wind-Panel von 10 m auf 850, 700 oder 500 hPa umschalten, um die großräumige Strömung zu sehen.`,
        `Prüfe die Spitzen auf der ${a('/wetterkarte/boeen', 'Böenkarte')} bis +24 h und vor dem Start das ${a('/regenradar', 'Regenradar')}.`,
        `Lies nach, was dahintersteckt: ${a('/wissen/thermik/', 'Thermik')}, ${a('/wissen/talwind/', 'Talwind')}, ${a('/wissen/temperaturinversion/', 'Inversion')} und ${a('/wissen/foehn/', 'Föhn')}.`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        `Kein Flugwetter-Briefing und kein Ersatz für DHV-Wetter, ${a('https://www.dwd.de/DE/fachnutzer/luftfahrt/luftfahrt_node.html', 'das Flugwetter des DWD')} oder METAR/TAF. buscosun ist nicht für sicherheitskritische Entscheidungen gebaut.`,
        'Keine Karte der Thermik, kein Steigwert, keine Grenzschichttiefe und kein Flugurteil: buscosun rechnet Thermik nicht aus.',
        'Kein Föhn-Index und kein Talwind-Tagesgang. Föhnverdacht kennzeichnet nur die Tourenplanung entlang einer Strecke, als Heuristik aus Wind und Feuchte.',
        'Keine Inversionsanzeige und kein Skew-T. Die Temperatur je Höhe erscheint nur per Klick auf einen Punkt.',
        'Der Schnitt reicht bis mindestens 3 000 m und bei hohem Gelände gut 1 500 m darüber, in Stufen von 150 m. Das Wetter kommt von fünf Punkten der Linie, nicht aus jeder Spalte; die Wolkenbasis ist eine Näherung aus Temperatur und Feuchte am Boden und erscheint nur bei nennenswerter Bewölkung.',
        'Keine Startplatz-Datenbank, keine Fluggebiets-Regeln, keine Luftraumdaten. ' + NO_WARNING,
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Der Höhenwind im Schnitt kommt für Deutschland, Österreich und die Schweiz gleichermaßen aus ICON-D2 (DWD, CC BY 4.0), die Druckflächen der Windkarte aus ICON-EU (rund 7 km). Damit gibt es hier keine Länderlücke im Profil selbst. Unterschiede entstehen erst bei den Zusatzinformationen: Amtliche Warnungen erscheinen als Flächen nur für Deutschland (DWD) und die Schweiz (MeteoSchweiz über MeteoAlarm); Österreich hat im Layer noch keine Flächen, das Panel nennt stattdessen GeoSphere Austria. Die Blitzkarte stammt vom DWD-Blitznetz und ist auf Deutschland fokussiert. Live-Stationen decken DE (DWD), AT (TAWES) und CH (SMN) ab.') },
    ],
    faqs: [
      { q: 'Zeigt buscosun die Thermik-Stärke in m/s?', a: 'Nein. Es gibt keine Thermik-Prognose und keinen Steigwert. Der Vertikalschnitt zeigt Höhenwind, Böen, Windscherung und die Wolkenbasis als Näherung; die Einschätzung der Thermik bleibt bei dir und bei Flugwetter-Diensten.' },
      { q: 'Woher kommt der Höhenwind?', a: 'Im Vertikalschnitt aus den Modellflächen von ICON-D2 (DWD, rund 2,2 km), am Boden auf buscosun Fusion verankert. Auf der Windkarte aus den ICON-EU-Druckflächen 850, 700 und 500 hPa (rund 7 km).' },
      { q: 'Gibt es einen Föhn-Index?', a: 'Nein. Den Wind über dem Kamm zeigt der Vertikalschnitt, wenn die Linie quer über den Kamm läuft. Föhnverdacht kennzeichnet nur die Tourenplanung, als Heuristik und ohne amtlichen Charakter.' },
      { q: 'Ersetzt buscosun das DHV-Wetter?', a: 'Nein. buscosun ist ein Modell-Kontext ohne Briefing-Charakter. Für die Flugentscheidung gelten amtliche Quellen, Fluggebietsregeln und die eigene Einschätzung am Startplatz.' },
    ],
    related: ['/atmosphaere/querschnitt', '/wetterkarte/wind', '/wissen/thermik/', '/wissen/foehn/', '/funktionen/atmosphaere/', '/fuer/drohnenpiloten/'],
  },
  // ---------------------------------------------------------------------------
  // Belege: scripts/seo/methodik.mjs (DIN 33466/SAC 350/500 Hm/h, T3 300/400,
  // Cluster 6/10/14 km + 300-m-Bänder, 240-h-Horizont, Grenzwerte Böen 10–120
  // Start 40, Wind 10–100, Regen 0,5–20, gefühlt −25…20, Warnstufe nur DE, keine
  // Sichtweite), src/route/route3d/gonogo.ts (vier Zustände, keine Sichtweite),
  // src/avalanche.ts (≥ 1 000 m, SLF / lawinen.report / LWD Bayern + EAWS),
  // src/scalar/snowLine.ts (T50 ≈ +1 °C), FEATURE-INVENTAR A8/A9/A15/A18/B5.
  // ---------------------------------------------------------------------------
  {
    slug: 'bergsport',
    title: 'Für Bergsport',
    h1: 'buscosun für Wanderer, Hochtourengeher und Klettersteig-Geher: Wetter zur Ankunftszeit am Grat',
    description: 'Wetter je Kilometer zur Ankunftszeit nach DIN 33466, Grat statt Tal dank Höhenkorrektur, Gewitterpotenzial und Zellbahnen — ohne eigenen Lawinenbericht.',
    answer: 'buscosun rechnet für Bergtouren aus einer GPX-Datei die Ankunftszeit je Trackpunkt nach DIN 33466/SAC und holt für jeden Abschnitt das Wetter zu genau dieser Zeit — höhenkorrigiert über ein 30-m-Geländemodell, mit Wind, Regen, gefühlter Temperatur und Schneefallgrenze. Gewitterpotenzial, Blitzprognose und amtliche Zellbahnen ergänzen das Bild. Für die Lawinenlage verlinkt buscosun den amtlichen Lagebericht, statt einen eigenen zu erfinden.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Die <strong>Tourenplanung</strong> liest GPX, TCX, FIT, KML oder KMZ (bis 25 MB, 100 000 Punkte), prüft mitgelieferte Höhen gegen das Terrarium-Geländemodell und rechnet mit der Bewegungsart Wandern (350 Hm/h auf, 500 ab; größere Teilzeit voll, kleinere halb) oder Bergwandern T3 (300/400 Hm/h, Steilstufen-Aufschlag über 25 %) die Ankunftszeit je Punkt. Die Trackpunkte werden räumlich (6, 10 oder 14 km je Gelände) und in Höhenbändern von 300 m gebündelt — ohne diese Bänderung lagen Talwerte im Test bis zu 4 °C zu kalt. Je Bündel läuft dieselbe Punktvorhersage wie auf der Karte; im Radarhorizont überschreibt das gemessene Radar den Modellregen.') +
        p('Die <strong>3D-Bühne</strong> zeigt die Wetterwand 300 m über Grund entlang der Strecke: Windbänder, Regen, Wolkenbasis als LCL-Näherung, Schneefallgrenze und Warnzone. Grenzwerte für Böen (10–120 km/h, Start 40), Wind (10–100), Regen (0,5–20 mm/h), gefühlte Temperatur (−25 bis 20 °C) und Warnstufe (nur DE) ergeben je Streckenpunkt einen von vier Zuständen — go, knapp, unklar, no-go —, und der Zeitkorridor rechnet eine Startempfehlung im 15-Minuten-Raster ±2 h. Eine Sichtweite gibt es bewusst nicht: Aus Bewölkung geschätzt wäre sie eine erfundene Zahl an der Stelle, an der du entscheidest.') +
        p('Auf der Wetterkarte ist die <strong>Temperatur je Bildpunkt höhenkorrigiert</strong> (Lapse-Rate 6,5 K/km gegen das Geländemodell), die <strong>Schneefallgrenze</strong> erscheint als Linie im Gelände (Null-Linie von T_korr − T50, T50 ≈ +1 °C plus gelernter Ortskorrektur), und für die Gewitterfrage am Klettersteig stehen Gewitterpotenzial (CAPE × CIN × LPI, 0–12 h), Blitzprognose und für Deutschland die amtlichen KONRAD3D-Zellbahnen mit Unsicherheitstrichter bereit. Ab 1 000 m Ortshöhe zeigt der Punktforecast den Link zum amtlichen Lawinenlagebericht (SLF, lawinen.report, Lawinenwarndienst Bayern, dazu EAWS).') },
      { h2: 'So nutzt du buscosun im Bergsport', html: ol([
        `Lade deine Tour in der ${a('/tourenplanung', 'Tourenplanung')} hoch, wähle Wandern oder Bergwandern (T3) und die Startzeit — das Wetter je Kilometer gilt zur Ankunftszeit.`,
        `Wechsle ins Gelände (3D-Ansicht) und setze deine Grenzwerte; der Zeitkorridor nennt die beste Startzeit ±2 h.`,
        `Prüfe die Lage am Grat auf der ${a('/wetterkarte/temperatur', 'Temperaturkarte')} und der ${a('/wetterkarte/schneegrenze', 'Schneefallgrenze')}, im Sommer das ${a('/wetterkarte/gewitter', 'Gewitterpotenzial')} und die ${a('/wetterkarte/zellbahnen', 'Zellbahnen')}.`,
        `Für den Wind am Grat: ${a('/atmosphaere/querschnitt', 'Vertikalschnitt')} mit einer Linie quer über den Kamm. Eine Nebelobergrenze nennt buscosun nicht; ${a('/wissen/nebel-hochnebel-nebelobergrenze/', 'was sie bedeutet')}.`,
        `Im Winter: Lawinen-Link im Punktforecast der Karte (ab 1 000 m) und die ${a('/wetterkarte/schnee', 'Schneekarte')}; Rechenweg in ${a('/methodik/tourenplanung-zeitmodell/', 'Tourenplanung: Zeitmodell')}.`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        'Kein Lawinenlagebericht: buscosun modelliert keine Lawinengefahr, sondern verlinkt ab 1 000 m die amtliche Quelle. Die Bulletins sind saisonal; im Sommer gibt es keines.',
        'Keine Sichtweite, keine Hütten-, Lift- oder Wegzustandsdaten, kein Wegtyp-Faktor (der OSM-Faktor ist vorbereitet, aber 1,0).',
        'Die Wetterpunkte liegen 6 bis 14 km auseinander, nicht 2 km; die App nennt den echten Radius. Zwischen den Punkten wird interpoliert.',
        'Blitzkarte und Zellbahnen sind Deutschland-fokussiert (DWD-Blitznetz, KONRAD3D); amtliche Warnungen erscheinen im Ergebnis nur für Deutschland, die Schneefallgrenze nur für AT und CH.',
        'Kein Bergführer-Briefing, keine Bergrettungs-Funktion. ' + NO_WARNING,
        NO_PUSH,
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Die Temperaturkarte und die Schneefallgrenze rechnen für DE, AT und CH auf ICON-D2 (DWD, 2,2 km) mit dem Terrarium-Geländemodell (rund 30 m). Der Punktforecast mischt je Land die nächsten Messstationen (DWD, TAWES, SMN), MOSMIX und für AT/CH das GeoSphere-Modell C-LAEF; das Radar überschreibt den Modellregen im Radarhorizont — DE bis 2 h (RADOLAN-RV), AT bis 3 h (INCA), CH nur die Analyse. Für Rasterkarten reicht der Horizont in AT und CH etwa 1–2 Tage, darüber hinaus nur der Punkt-Mix. Lawinen: SLF für die Schweiz, lawinen.report für Österreich, Lawinenwarndienst Bayern für die deutschen Alpen.') },
    ],
    faqs: [
      { q: 'Wie berechnet buscosun die Gehzeit?', a: 'Nach DIN 33466/SAC: horizontale und vertikale Teilzeit, die größere voll, die kleinere halb. Wandern rechnet 350 Hm/h auf und 500 ab, Bergwandern T3 300/400 mit Steilstufen-Aufschlag über 25 %.' },
      { q: 'Zeigt buscosun die Lawinengefahr?', a: 'Nein. Ab 1 000 m Ortshöhe verlinkt der Punktforecast den amtlichen Lagebericht (SLF, lawinen.report, Lawinenwarndienst Bayern, EAWS). Eine eigene Lawinenstufe gibt es bewusst nicht.' },
      { q: 'Warum gibt es keine Sichtweite in der 3D-Ansicht?', a: 'Weil keine Quelle der Punkt-Kette eine Sichtweite führt. Aus Bewölkung geschätzt wäre sie eine erfundene Zahl; die Ansicht sagt, warum der Grenzwert fehlt.' },
      { q: 'Gilt die Gewitterwarnung auch in Österreich und der Schweiz?', a: 'Das Gewitterpotenzial (ICON-D2) deckt DACH ab. Blitzkarte und KONRAD-Zellbahnen sind Deutschland-fokussiert; amtliche Warnflächen gibt es für DE und CH, für AT nennt das Panel GeoSphere Austria.' },
    ],
    related: ['/tourenplanung', '/methodik/tourenplanung-zeitmodell/', '/methodik/hoehenkorrektur/', '/wissen/schneefallgrenze/', '/wissen/gewitter-unwetter/', '/fuer/wintersport/'],
  },
  // ---------------------------------------------------------------------------
  // Belege: scripts/seo/methodik.mjs (Rennrad 26 km/h Regler 18–40, Gravel 20,
  // MTB 15, v = v_flach/(1+Steigung·k), Abfahrt 60/50/45, Windfaktor
  // 1+0,04·Komponente begrenzt 0,5–1,4, Pausen Rennrad 50 km/10 min, Horizont
  // 240 h, Cluster 6/10/14 km, Radtour-Profil 12–24 °C Wind 0,7),
  // src/route/weatherAggregate.ts (Föhn entlang der Tour), FEATURE-INVENTAR D1–D10.
  // ---------------------------------------------------------------------------
  {
    slug: 'radsport',
    title: 'Für Radsport',
    h1: 'buscosun für Rennrad, Gravel und Mountainbike: Gegenwind, Regen und Passwetter zur Ankunftszeit',
    description: 'GPX hochladen: Wind wird zum Tempo, Tempo zur Ankunftszeit, Ankunftszeit zum Wetter je Kilometer — für Rennrad, Gravel und MTB im DACH-Raum.',
    answer: 'buscosun übersetzt eine Rad-Route in Ankunftszeiten je Kilometer — mit Steigungsmodell für Rennrad, Gravel und MTB und einem Windeffekt, der Gegen- und Rückenwind aufs Tempo umrechnet — und holt für jeden Abschnitt das Wetter zu genau dieser Zeit, höhenkorrigiert über die Pässe. Dazu die Windkarte, die Böenkarte und das Regenradar mit Ankunftszeit des Regens am Standort.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Die <strong>Tourenplanung</strong> kennt drei Rad-Bewegungsarten mit eigenem Steigungsmodell <code>v = v_flach / (1 + Steigung · k)</code>: Rennrad mit 26 km/h in der Ebene (Regler 18–40, Abfahrt bis 60 km/h), Gravel mit 20 km/h (14–32, Abfahrt bis 50) und MTB mit 15 km/h (9–26, Abfahrt bis 45). Der <strong>Wind entlang der Fahrtrichtung</strong> verändert das Tempo mit dem Faktor 1 + 0,04 · Windkomponente, begrenzt auf 0,5 bis 1,4 — und weil der Wind zur Ankunftszeit gilt, die Ankunftszeit aber vom Wind abhängt, rechnet buscosun Zeitplan → Wind → Zeitplan iterativ. Pausen kommen aus Vorgaben je Art (Rennrad alle 50 km 10 Minuten) oder als eigene Pausen an Streckenpunkten; der Horizont beträgt 240 Stunden.') +
        p('Für jeden Streckenabschnitt läuft dieselbe Punktvorhersage wie auf der Karte — Temperatur, Wind, Böen, Regen, gefühlte Temperatur, UV —, an den Pässen über die Höhenkorrektur auf die echte Geländehöhe gerechnet. Im Radarhorizont überschreibt das gemessene Radar den Modellregen. Das Ergebnis zeigt einen Wetter-Strip mit Verlässlichkeits-Ring je Abschnitt, Scrubber, Sparklines und PNG-Export; ein Föhn-Banner erscheint, wenn Streckenabschnitte Föhn-Indikatoren zeigen (heuristisch, mit km-Spanne). Die 3D-Bühne rechnet den Zeitkorridor mit Regenfenstern und einer Startempfehlung im 15-Minuten-Raster ±2 h.') +
        p('Ohne Datei helfen die <strong>Windkarte</strong> (ICON-D2, 10 m, 0–12 h, Partikel exakt aus dem Modellfeld), die <strong>Böenkarte</strong> bis +24 h und das <strong>Regenradar</strong> mit Zellverfolgung und Ankunftszeit in Minuten. Für Motorrad- oder Cabrio-Ausfahrten über Alpenpässe gibt es keine eigene Bewegungsart — die höhenkorrigierte Temperaturkarte und der Punktforecast am Pass tragen aber genauso.') },
      { h2: 'So nutzt du buscosun im Radsport', html: ol([
        `Lade die Route in der ${a('/tourenplanung', 'Tourenplanung')} hoch (GPX, TCX, FIT, KML, KMZ), wähle Rennrad, Gravel oder MTB und stelle dein Flachtempo ein.`,
        `Setze Startzeit und Pausen; das Ergebnis zeigt Wind zur Fahrtrichtung, Regen und Temperatur je Kilometer zur Ankunftszeit — Details im ${a('/methodik/tourenplanung-zeitmodell/', 'Zeitmodell')}.`,
        `Für die Trainingsrunde ohne Datei: ${a('/wetterkarte/wind', 'Windkarte')} und ${a('/wetterkarte/boeen', 'Böenkarte')} — Richtung und Spitzen bis morgen.`,
        `Kurz vor dem Losfahren das ${a('/regenradar', 'Regenradar')}: Ankunftszeit des Regens am Standort in Minuten.`,
        `Mehrtagesfenster fürs Bikepacking: ${a('/vorhersage', 'Modellvergleich')} mit Konfidenz je Tag — und warum ${a('/wissen/modellvergleich-unsicherheit/', 'stabil nicht automatisch richtig heißt')}.`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        'Kein Routing: buscosun berechnet keine Strecke, sondern liest deine Datei. Kein Strava- oder Komoot-Import, kein Live-Tracking.',
        'Kein Belag- oder Wegtyp-Faktor — Schotter und Asphalt zählen gleich (der OSM-Faktor ist vorbereitet, aber 1,0). Keine Ampeln, kein Verkehr.',
        'Die Wetterpunkte liegen 6 bis 14 km auseinander; die App nennt den echten Radius. Wind unter 2 km Gitterweite (Düsen, Kuppen) bleibt geglättet.',
        'Amtliche Warnungen erscheinen im Tourenergebnis nur für Deutschland; die Schneefallgrenze nur für Österreich und die Schweiz.',
        'Die zuletzt geplante Tour bleibt sieben Tage im Gerät (IndexedDB), das Wetter wird nie gespeichert. Kein Konto, keine Synchronisation. ' + NO_PUSH,
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Wind und Böen auf der Karte kommen für DE, AT und CH aus ICON-D2 (DWD, 2,2 km). Der Punktforecast entlang der Route mischt je Land Stationen (DWD via BrightSky, TAWES, SMN), MOSMIX und für AT/CH C-LAEF (GeoSphere). Das Radar-Override nutzt RADOLAN-RV in Deutschland (bis 2 h), INCA in Österreich (bis 3 h) und das MeteoSchweiz-Radar als Analyse. UV ist in Deutschland ein amtlicher DWD-Tagespeak, in AT und CH eine Klarhimmel-Schätzung — das Ergebnis sagt das. Jenseits von 240 Stunden warnt die App vor reduzierter Konfidenz.') },
    ],
    faqs: [
      { q: 'Berücksichtigt buscosun den Gegenwind?', a: 'Ja. Die Windkomponente entlang der Fahrtrichtung skaliert das Tempo mit 1 + 0,04 · Komponente (begrenzt 0,5–1,4), iterativ mit dem Wetter zur Ankunftszeit.' },
      { q: 'Welche Dateiformate gehen?', a: 'GPX, TCX, FIT, KML und KMZ — erkannt an den Bytes, nicht an der Endung; bis 25 MB und 100 000 Trackpunkte, Gebiet DACH plus etwa 50 km.' },
      { q: 'Kann buscosun eine Route planen?', a: 'Nein. Es liest eine vorhandene Datei und rechnet Zeitplan und Wetter dazu. Routing, Import aus Strava oder Komoot und Live-Tracking gibt es nicht.' },
      { q: 'Gibt es eine Bewegungsart für Motorrad?', a: 'Nein, die acht Bewegungsarten reichen von Wandern bis E-Bike. Für Passfahrten helfen die höhenkorrigierte Temperaturkarte und der Punktforecast am Pass.' },
    ],
    related: ['/tourenplanung', '/methodik/tourenplanung-zeitmodell/', '/funktionen/tourenplanung/', '/wetterkarte/wind', '/wissen/windboeen-sturm/', '/fuer/e-bike/'],
  },
  // ---------------------------------------------------------------------------
  // Belege: scripts/seo/methodik.mjs (E-Bike-Reichweite: P_grav+P_roll+P_aero,
  // Eco 200 / Tour 350 / Sport 500 / Turbo 750 W, 25 km/h, η 0,85, 500 Wh,
  // 95 kg, 100 W, Crr 0,006, CdA 0,55; E-Bike Trekking 23 km/h Regler 15–25),
  // src/route/ebikeBattery.ts, EbikeBatteryPanel.tsx, FEATURE-INVENTAR D5.
  // ---------------------------------------------------------------------------
  {
    slug: 'e-bike',
    title: 'Für E-Bike',
    h1: 'buscosun für E-Bike-Touren: Reicht der Akku bei dieser Steigung und diesem Wind?',
    description: 'Akku-Reichweite aus Steigung, Roll- und Luftwiderstand und Unterstützungsstufe entlang der Route, mit dem Wind zur Ankunftszeit — samt Grenzen des Modells.',
    answer: 'buscosun schätzt für E-Bike-Touren den Akkuverbrauch je Kilometer aus einer Leistungsbilanz — Steigung, Rollwiderstand, Luftwiderstand mit dem Wind zur Ankunftszeit —, deckelt den Motor nach Unterstützungsstufe (Eco 200 W bis Turbo 750 W, nichts mehr über 25 km/h) und zeigt den Ladezustand über dem Höhenprofil. Reicht es nicht, nennt es die Stufe, ab der es reicht. Kein Wetterdienst und keine Rad-App verbindet Wetter und Akku so.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Wählst du in der Tourenplanung die Bewegungsart <strong>E-Bike Trekking</strong> (23 km/h in der Ebene, Regler 15–25, der Motor halbiert den Steigungsverlust), erscheint das Akku-Panel. Für jeden Streckenabschnitt rechnet buscosun stationär <code>P_grav = m · g · v · sin(Steigung)</code>, <code>P_roll = m · g · v · Crr</code> und <code>P_aero = ½ · ρ · CdA · v_rel³</code>, wobei die relative Anströmung aus Fahrt- und Windgeschwindigkeit entsteht. Der Fahrer liefert seinen Anteil (Standard 100 W), der Motor den Rest bis zum Deckel seiner Stufe: Eco 200 W, Tour 350 W, Sport 500 W, Turbo 750 W; über 25 km/h nichts mehr. Der Batteriestrom ist Motorleistung durch Wirkungsgrad 0,85. Bergab ist die Bilanz negativ, dann fließt kein Batteriestrom.') +
        p('Standardwerte, alle einstellbar: 500 Wh Akku bei 100 % Ladung, Stufe Tour, 95 kg Gesamtmasse (Rad, Fahrer, Gepäck), Rollwiderstand Crr 0,006, Luftwiderstandsfläche CdA 0,55 m². Das Panel zeigt, ob der Akku reicht, zeichnet den Ladezustand je Kilometer als Kurve über dem Höhenprofil und nennt, wenn es knapp wird, ab welcher Stufe es reicht. Weil der Wind aus derselben Vorhersage wie das Tourenwetter kommt, ist der Gegenwind auf dem Rückweg im Verbrauch drin — wer eine Rundtour plant, sieht, ob der Akku am steilsten Anstieg oder erst auf dem windigen Rückweg knapp wird.') +
        p('Alles andere aus der Tourenplanung gilt mit: Höhen gegen das Geländemodell geprüft, Wetter je Kilometer zur Ankunftszeit, Radar-Override im Nowcast-Horizont, Pausenplanung, 3D-Bühne mit Startempfehlung.') },
      { h2: 'So nutzt du buscosun mit dem E-Bike', html: ol([
        `Lade deine Route in der ${a('/tourenplanung', 'Tourenplanung')} hoch und wähle die Bewegungsart E-Bike Trekking.`,
        `Trage im Akku-Panel deine Werte ein: Kapazität in Wh, Ladestand, Stufe, Gesamtmasse, eigene Tretleistung.`,
        `Lies den Ladezustand über dem Höhenprofil — die Kurve zeigt, wo der Verbrauch springt, und die Empfehlung nennt notfalls die sparsamere Stufe.`,
        `Vergleiche Startzeiten: Der Wind zur Ankunftszeit ändert Tempo und Verbrauch; die 3D-Ansicht nennt Regenfenster und Startempfehlung.`,
        `Der komplette Rechenweg mit allen Konstanten steht in ${a('/methodik/e-bike-reichweite/', 'Methodik: E-Bike-Reichweite')}.`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        'Keine Herstellerangabe: Das Modell ist stationär, ohne Temperaturabhängigkeit des Akkus, ohne Alterung, ohne Rekuperation. Es zeigt Größenordnung und den Effekt von Steigung und Wind.',
        'Die Unterstützungsstufe begrenzt nur die Motorleistung; das Tempo bleibt das des Bewegungsmodells. Echte Räder fahren mit Turbo schneller — eine bewusste Vereinfachung.',
        'Crr und CdA sind Richtwerte für Trekking-Räder; MTB-Reifen, Aufrechtsitz oder Anhänger ändern sie deutlich und müssen von Hand gesetzt werden.',
        'Kein Belagfaktor (Schotter = Asphalt), kein Routing, keine Ladestationen-Suche, keine Verbindung zum Rad-Display.',
        'Es gibt nur eine E-Bike-Bewegungsart (Trekking); S-Pedelecs über 25 km/h und E-MTB-Trails sind nicht gesondert modelliert.',
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Wind und Wetter entlang der Route kommen aus demselben Punktforecast wie bei jeder Tour: für Deutschland Stationen (DWD) und MOSMIX, für Österreich und die Schweiz zusätzlich C-LAEF (GeoSphere), Radar-Override mit RADOLAN-RV (DE, bis 2 h), INCA (AT, bis 3 h) und dem MeteoSchweiz-Radar (Analyse). Die Höhen je Segment stammen aus dem Terrarium-Geländemodell (rund 30 m, DACH plus etwa 50 km Puffer). Die Abregelung bei 25 km/h ist die gesetzliche Grenze für Pedelecs in allen drei Ländern und im Modell fest.') },
    ],
    faqs: [
      { q: 'Wie viel Watt hat die Tour-Stufe im Modell?', a: '350 W Motor-Deckel; Eco 200, Sport 500, Turbo 750 W — an gängigen Mittelmotoren orientiert und einstellbar.' },
      { q: 'Rechnet buscosun mit Gegenwind?', a: 'Ja, der Luftwiderstand nutzt die relative Anströmung aus Fahrt- und Windgeschwindigkeit der Vorhersage zur Ankunftszeit — auch auf dem Rückweg.' },
      { q: 'Warum weicht die Reichweite von der Anzeige am Rad ab?', a: 'Das Modell ist stationär, ohne Temperatur, Alterung und Rekuperation, mit Richtwerten für Roll- und Luftwiderstand. Es ist eine Planungshilfe, keine Herstellerangabe.' },
      { q: 'Kann ich mehrere Akkus oder einen Range Extender eintragen?', a: 'Nur als Gesamtkapazität in Wh. Ein zweiter Akku wird einfach zur Kapazität addiert; Wechselzeitpunkte kennt das Modell nicht.' },
    ],
    related: ['/tourenplanung', '/methodik/e-bike-reichweite/', '/methodik/tourenplanung-zeitmodell/', '/funktionen/tourenplanung/', '/fuer/radsport/'],
  },
  // ---------------------------------------------------------------------------
  // Belege: FEATURE-INVENTAR A1 (Wind 10 m 0–12 h), src/sources/iconD2GustSource.ts
  // (MAX_STEP 24), src/sources/dwdLightning.ts (letzte Stunde, ~10 min, Linet/
  // Sferics), radar/konrad3d.ts + cellLayers (KONRAD3D DE, 5 min), foehn.ts,
  // capAlerts.ts (DE DWD, CH MeteoAlarm), grep „Seegang/Welle" in src: kein
  // Treffer — kein Wellenmodell, keine Sturmwarnleuchten.
  // ---------------------------------------------------------------------------
  {
    slug: 'segler',
    title: 'Für Segler',
    h1: 'buscosun für Segler, Surfer und Kiter auf Bodensee, Alpenseen und Küste: Wind, Böen, Zellen, Blitze',
    description: 'Windkarte aus ICON-D2, Böen bis +24 h, KONRAD-Zellbahnen mit Ankunftszeit und Blitzkarte für Bodensee, Alpenseen und Küste — ohne Sturmwarnleuchten.',
    answer: 'buscosun zeigt Seglern, Surfern und Kitern den Wind als Partikelfeld aus ICON-D2 mit Richtung und Stärke, die Böenspitzen bis 24 Stunden voraus, für Deutschland die amtlichen KONRAD3D-Gewitterzellen mit Zugbahn, Unsicherheitstrichter und Ankunftszeit sowie die Blitze der letzten Stunde. An der deutschen Nord- und Ostseeküste kommen Seegang und Wasserstand über das Seewetter dazu; für Binnenseen gibt es weder Wellenhöhe noch die Sturmwarnleuchten.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Die <strong>Windkarte</strong> zeichnet den 10-m-Wind aus ICON-D2 (DWD, 2,2 km Gitter) als Partikel und Heatmap — die Partikelgeschwindigkeit ist exakt aus dem Modellfeld gerechnet, nicht dekorativ —, 0 bis 12 Stunden voraus, mit Dichte-Regler. Die <strong>Böenkarte</strong> (Feld vmax_10m) reicht 24 Stunden und ist für die Ausfahrt oft die wichtigere Zahl. Der Zeit-Schieber läuft in Zehntelstunden; der Datenstand steht als „Stand · HH:MM" daneben, nicht als „jetzt".') +
        p('Für Gewitterlagen liefert Deutschland das amtliche Objektprodukt <strong>KONRAD3D</strong> des DWD: Zellen im 5-Minuten-Takt mit Zugbahn, Unsicherheitstrichter und einem Satz zur Ankunftszeit am gewählten Punkt. Die <strong>Blitzkarte</strong> zeigt die vom DWD-Blitznetz (Linet/Sferics) erfassten Entladungen der letzten Stunde, alle etwa zehn Minuten aktualisiert; das <strong>Gewitterpotenzial</strong> (CAPE × CIN × LPI aus ICON-D2) und die Blitzprognose reichen 12 Stunden voraus. Live-Stationen (DWD, TAWES, SMN) zeigen den gemessenen Wind am Ufer daneben.') +
        p('Für Bodensee, Walensee, Urnersee oder Attersee zählt der Föhn. Einen eigenen Föhn-Index hat buscosun nicht; wie stark der Wind über dem Kamm weht, zeigt der <strong>Vertikalschnitt</strong> der Atmosphäre-Ansicht, wenn die Linie quer über den Kamm läuft. Amtliche Warnungen erscheinen für Deutschland und die Schweiz als Flächen, der Text im Popup wörtlich zitiert.') },
      { h2: 'So nutzt du buscosun als Segler', html: ol([
        `Öffne die ${a('/wetterkarte/wind', 'Windkarte')} auf deinem Revier — etwa ${a('/wetter/konstanz/', 'Konstanz')}, ${a('/wetter/bregenz/', 'Bregenz')} oder ${a('/wetter/kiel/', 'Kiel')} — und fahre den Zeit-Schieber durch die nächsten 12 Stunden.`,
        `Wechsle auf die ${a('/wetterkarte/boeen', 'Böenkarte')} für die Spitzen bis morgen; die Stationen (${a('/wetterkarte/stationen', 'Wetterstationen')}) zeigen den gemessenen Wind am Ufer.`,
        `Bei Gewitterlage: ${a('/wetterkarte/zellbahnen', 'Zellbahnen')} (DE) mit Ankunftszeit, ${a('/wetterkarte/blitze', 'Blitzkarte')} und ${a('/wetterkarte/gewitter', 'Gewitterpotenzial')}.`,
        `Auf Alpenseen: ${a('/atmosphaere/querschnitt', 'Vertikalschnitt')} über den Kamm und der Explainer ${a('/wissen/foehn/', 'Föhn')}.`,
        `An Nord- und Ostsee: ${a('/seewetter', 'Seewetter')} mit Seegang, Wind am Spot, BSH-Wasserstand und Seewetterbericht im Wortlaut.`,
        `Amtliche Warnlage wörtlich: ${a('/warnungen', 'Warnungen')} — und ${a('/wissen/windboeen-sturm/', 'was Böen von Mittelwind unterscheidet')}.`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        'Keine Strömung und außerhalb der deutschen Küste kein Seegang; Binnenseen wie der Bodensee haben kein Wellenmodell.',
        'Keine Sturmwarnleuchten und keine seespezifische Starkwind- oder Sturmwarnung. Die Warnsysteme der Seen (Bodensee, Schweizer Seen) sind eigene amtliche Dienste; buscosun bildet sie nicht ab.',
        'Das 2,2-km-Gitter glättet Land-Wasser-Übergänge, Düsen zwischen Ufern und Thermikwinde am See; der Modellwind über dem Wasser ist eine Fläche, keine Messung.',
        'Blitzkarte und KONRAD-Zellbahnen sind Deutschland-fokussiert; für Österreich und die Schweiz bleibt das Gewitterpotenzial aus ICON-D2.',
        'Kein Tidenkalender und keine Hafeninformationen; Wasserstände nur an den BSH-Pegeln der Küste. ' + NO_WARNING,
        NO_PUSH,
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Wind und Böen kommen für DE, AT und CH aus ICON-D2 (DWD). KONRAD3D-Zellbahnen und die Blitzkarte sind DWD-Produkte mit Deutschland-Fokus; am Bodensee decken sie das deutsche Ufer und den Verbundbereich ab, am Attersee oder Zürichsee nicht. Amtliche Warnungen erscheinen als Flächen für Deutschland (DWD CAP) und die Schweiz (MeteoSchweiz über MeteoAlarm); für Österreich nennt das Panel GeoSphere Austria, ohne Fläche. Live-Stationen: DWD (via BrightSky), TAWES, SMN.') },
    ],
    faqs: [
      { q: 'Zeigt buscosun die Wellenhöhe auf dem Bodensee?', a: 'Nein. Das Seegangsmodell deckt nur die deutsche Nord- und Ostseeküste ab; auf dem Bodensee zeigt buscosun Wind, Böen, Gewitterzellen und Blitze.' },
      { q: 'Ersetzt buscosun die Sturmwarnleuchten?', a: 'Nein. Die Sturmwarnung der Seen ist ein eigener amtlicher Dienst. buscosun zitiert amtliche Wetterwarnungen für DE und CH wörtlich, gibt aber keine eigenen heraus.' },
      { q: 'Wie weit voraus reicht die Böenkarte?', a: '24 Stunden ab Modelllauf (ICON-D2 vmax_10m); die Windkarte reicht 12 Stunden.' },
      { q: 'Gibt es die Zellbahnen auch in Österreich und der Schweiz?', a: 'Nein. KONRAD3D ist ein DWD-Produkt für Deutschland. Für AT und CH bleiben Gewitterpotenzial und Blitzprognose aus ICON-D2.' },
    ],
    related: ['/wetterkarte/wind', '/wetterkarte/boeen', '/wetterkarte/zellbahnen', '/wissen/foehn/', '/wissen/gewitterzellen-konrad/', '/warnungen'],
  },
  // ---------------------------------------------------------------------------
  // Belege: iconD2GustSource.ts (24 h), eventModel.ts und methodik.mjs (Anlass Drohne: 2–30 °C, Wind 1,0, Regen 0,9,
  // Wolken 0,4), src/threed/crossSection.ts (150-m-Stufen, Böen je Höhe), AtmosphereDeck.tsx (Punkt-Abfrage).
  // Die Go/No-Go-Ansicht ist zurückgezogen (01.11.2026); die Zeitbahn der Tourenplanung kennt keine Flughöhe.
  // ---------------------------------------------------------------------------
  {
    slug: 'drohnenpiloten',
    title: 'Für Drohnenpiloten',
    updated: '2026-11-01',
    h1: 'buscosun für Drohnenpiloten: Böen bis morgen, Wind in der Höhe, bester Flugtag',
    description: 'Böenkarte bis +24 h, Wind und Böen je Höhe im Vertikalschnitt, Event-Anlass Drohne — keine Prüfung deines Grenzwerts; die Herstellerangabe bleibt maßgeblich.',
    answer: 'buscosun zeigt Drohnenpiloten die Böenspitzen in 10 m Höhe bis 24 Stunden voraus, den Wind über dem Gelände im Vertikalschnitt und den besten Flugtag der Woche in der Event-Planung. Eine Zeitleiste gegen deinen Grenzwert auf Flughöhe rechnet buscosun nicht: Ob der Wind für dein Gerät reicht, entscheidest du mit der Betriebsanleitung.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Auf der Wetterkarte liefert die <strong>Böenkarte</strong> (ICON-D2 vmax_10m, 2,2 km) die Spitzen in 10 m Höhe als Fläche bis 24 Stunden voraus, die Windkarte die Richtung; im Wind-Panel lässt sich auf die Druckflächen 850, 700 und 500 hPa umschalten. Das Regenradar sagt, ob und wann Regen am Standort ankommt.') +
        p('Für die Höhe gibt es den <strong>Vertikalschnitt</strong>: Du ziehst auf der Karte eine Linie über dein Einsatzgebiet und siehst darüber Mittelwind und auf Wunsch Böen und Windscherung über dem Geländeprofil. Ein Klick in den Schnitt nennt für diesen Punkt die Höhe, den Abstand über Grund, Mittelwind, Böe, Richtung und Temperatur. Die Stufen liegen 150 m auseinander, gezählt ab Meereshöhe. Für die untersten 120 m über Grund ist das grob: Du liest die nächste Stufe ab, keine Rechnung für deine eingestellte Flughöhe.') +
        p('In der <strong>Event-Planung</strong> hat der Anlass „Drohne" ein eigenes Profil: Idealtemperatur 2–30 °C, Wind mit vollem Gewicht 1,0, Regen 0,9, Wolken 0,4. So findet buscosun den besten Flugtag der nächsten sieben Tage, mit Konfidenz je Tag.') },
      { h2: 'So nutzt du buscosun als Drohnenpilot', html: ol([
        `Suche den besten Flugtag in der ${a('/eventplanung/drohne', 'Event-Planung')} mit dem Anlass Drohne; ${a('/methodik/event-bewertung/', 'so entsteht der Score')}.`,
        `Prüfe am Flugtag die ${a('/wetterkarte/boeen', 'Böenkarte')} für die Fläche um den Standort und die ${a('/wetterkarte/wind', 'Windkarte')} für die Richtung.`,
        `Ziehe im ${a('/atmosphaere/querschnitt', 'Vertikalschnitt')} eine Linie über das Einsatzgebiet, schalte Böen zu und tippe in den Schnitt, um Wind und Böe nahe deiner Flughöhe abzulesen.`,
        `Vergleiche den Wert selbst mit dem Grenzwert aus deiner Betriebsanleitung; ${a('/wissen/windgrenzwerte-arbeit-drohne/', 'Windgrenzwerte für Arbeit und Drohne')} erklärt den Hintergrund.`,
        `Vor dem Start das ${a('/regenradar', 'Regenradar')} und die ${a('/warnungen', 'amtlichen Warnungen')}.`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        'Keine Go/No-Go-Zeitleiste und keine Prüfung gegen einen Grenzwert auf Flughöhe. buscosun liefert Modellwerte; die Entscheidung bleibt beim Fernpiloten.',
        'Keine Rechtsauskunft: Welche Windgrenze, Flughöhe oder Sichtbedingung für dein Gerät und deine Kategorie gilt, sagen Herstellerangabe, Betriebsanleitung und die Luftfahrtregeln.',
        'Keine Luftraum- oder Geo-Zonen-Daten, keine Flugverbotszonen, kein Kontakt zu Flugsicherung oder Behörden.',
        'Keine Sichtweite: Keine Quelle der Punkt-Kette führt sie, und aus Bewölkung geschätzt wäre sie eine erfundene Zahl.',
        'Der Schnitt kennt keine Gebäude, Bäume oder Turbulenz im Lee; das 2,2-km-Gitter glättet lokale Düsen, und die Stufen von 150 m lösen die bodennahe Schicht nur grob auf.',
        'Kein Konto, kein Export als Flugbuch, keine API. ' + NO_WARNING,
        NO_PUSH,
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Böen und Wind kommen für Deutschland, Österreich und die Schweiz aus ICON-D2 (DWD, CC BY 4.0), die Werte je Höhe im Vertikalschnitt aus dem Höhen-Cube mit den ICON-D2-Modellflächen. Die Event-Planung nutzt den Punktforecast, der je Land Stationen (DWD, TAWES, SMN), MOSMIX und für AT/CH C-LAEF mischt. Der Höhenwind der Druckflächen auf der Windkarte stammt aus ICON-EU. Amtliche Warnungen erscheinen als Flächen nur für Deutschland und die Schweiz; für Österreich nennt das Panel GeoSphere Austria. Das Regenradar reicht in Deutschland 2 Stunden (RADOLAN-RV), in Österreich 3 Stunden (INCA), in der Schweiz nur bis jetzt.') },
    ],
    faqs: [
      { q: 'Welchen Windgrenzwert soll ich ansetzen?', a: 'Den aus der Betriebsanleitung deines Geräts. buscosun kennt dein Modell nicht und prüft keinen Grenzwert; du vergleichst den Modellwert selbst.' },
      { q: 'Wie finde ich den Wind auf Flughöhe?', a: 'Im Vertikalschnitt: Linie ziehen, Böen zuschalten, in den Schnitt tippen. Die Höhenstufen liegen 150 m auseinander, für eine bestimmte Flughöhe ist das also eine grobe Orientierung und keine Messung.' },
      { q: 'Zeigt buscosun Flugverbotszonen?', a: 'Nein. Luftraum- und Geo-Zonen-Daten gibt es nicht; dafür sind die Luftfahrtbehörden und deren Karten zuständig.' },
      { q: 'Kann buscosun mich warnen, wenn der Wind auffrischt?', a: 'Nein. Es prüft keinen Grenzwert, und ohne Server gibt es keine Push-Benachrichtigung.' },
    ],
    related: ['/atmosphaere/querschnitt', '/eventplanung/drohne', '/wetterkarte/boeen', '/wissen/windgrenzwerte-arbeit-drohne/', '/wetterkarte/wind', '/fuer/bau-und-kran/'],
  },
  // ---------------------------------------------------------------------------
  // Belege: wie Drohne (crossSection.ts, iconD2GustSource.ts), capAlerts.ts /
  // warnField.ts (Zitatregel), historyIndices.ts (frostfreie Periode, HDD-Basis
  // 15 °C), methodik.mjs (Radar-Horizonte, Lapse 6,5 K/km), docs/zielgruppen-
  // dach.md Teil C (kein B2B: Konto/Export/API/SLA).
  // ---------------------------------------------------------------------------
  {
    slug: 'bau-und-kran',
    title: 'Für Bau und Kran',
    updated: '2026-11-01',
    h1: 'buscosun für Kranführer, Gerüstbau, Dachdecker und Höhenarbeit: Böen, Regenfenster und Frost am Standort',
    description: 'Böenkarte bis +24 h, Wind je Höhe im Vertikalschnitt, Regen mit Ankunftszeit, Warnungen wörtlich — keine Prüfung deines Grenzwerts, kein Windmesssystem.',
    answer: 'buscosun zeigt für Baustellen die Böenspitzen in 10 m Höhe bis 24 Stunden voraus, den Wind je Höhe im Vertikalschnitt, das Regenradar mit Ankunftszeit, höhenkorrigierte Temperatur für Frostfragen und amtliche Warnungen als wörtliches Zitat. Eine Prüfung deines Grenzwerts auf Arbeitshöhe rechnet es nicht, und ein zertifiziertes Windmesssystem am Kran ersetzt es nicht.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Für den Wind in der Höhe gibt es den <strong>Vertikalschnitt</strong>: Du ziehst auf der Karte eine Linie über die Baustelle und siehst darüber Mittelwind und auf Wunsch Böen und Windscherung über dem Geländeprofil. Ein Klick in den Schnitt nennt für diesen Punkt die Höhe, den Abstand über Grund, Mittelwind, Böe, Richtung und Temperatur. Die Stufen liegen 150 m auseinander, gezählt ab Meereshöhe; für eine Kranspitze oder Gerüstlage ist das eine grobe Orientierung und keine Rechnung für deine Arbeitshöhe. Den Vergleich mit dem Grenzwert aus der Betriebsanleitung machst du selbst.') +
        p('Für die Tagesplanung zeigt die <strong>Böenkarte</strong> (ICON-D2 vmax_10m, 2,2 km) die Spitzen bis 24 Stunden voraus, der Zeit-Schieber läuft in Zehntelstunden und der Datenstand steht als Uhrzeit daneben. Das <strong>Regenradar</strong> nennt für Dachdecker und Maler die Ankunftszeit des Regens am Standort in Minuten und die Regenfenster der nächsten Stunden; die <strong>Temperaturkarte</strong> ist je Bildpunkt auf die Geländehöhe korrigiert (6,5 K/km), der Punktforecast zeigt Tmin für die Frostfrage beim Betonieren. Das Wetterarchiv liefert für Standorte die frostfreie Periode und Heizgradtage (Basis 15 °C) aus Stationsdaten.') +
        p('<strong>Amtliche Warnungen</strong> erscheinen als Flächen mit dem Warntext wörtlich im Popup — Überschrift, Beschreibung und Verhaltenshinweis unverändert, nie zusammengefasst. Das ist die Regel des Moduls: zitieren, nicht umformulieren.') },
      { h2: 'So nutzt du buscosun auf der Baustelle', html: ol([
        `Prüfe die ${a('/wetterkarte/boeen', 'Böenkarte')} für morgen und die ${a('/wetterkarte/temperatur', 'Temperaturkarte')} für Frost am Standort.`,
        `Ziehe im ${a('/atmosphaere/querschnitt', 'Vertikalschnitt')} eine Linie über die Baustelle, schalte Böen zu und tippe in den Schnitt, um den Wind in der Höhe abzulesen.`,
        `Vergleiche den Wert selbst mit dem Grenzwert aus der Betriebsanleitung des Krans oder der Gerüstfreigabe.`,
        `Vor Dach- und Fassadenarbeiten das ${a('/regenradar', 'Regenradar')} mit Ankunftszeit; die ${a('/warnungen', 'amtlichen Warnungen')} wörtlich.`,
        `Hintergrund: ${a('/wissen/windgrenzwerte-arbeit-drohne/', 'Windgrenzwerte bei der Arbeit')} und ${a('/wissen/windboeen-sturm/', 'Böen und Sturm')}.`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        'Keine Go/No-Go-Zeitleiste und keine Böe für eine gewählte Arbeitshöhe. Die Böenkarte gilt für 10 m über Grund, der Vertikalschnitt in Stufen von 150 m.',
        'Kein zertifiziertes Windmesssystem und keine Rechtsgrundlage: Der Grenzwert für Kran, Gerüst oder Hubarbeitsbühne kommt aus Herstellerangabe, Betriebsanleitung und Unfallverhütungsvorschrift. buscosun liefert nur eine Modellprognose.',
        'Kein B2B-Produkt: kein Konto, keine API, kein Dokumentations-Export, keine Verfügbarkeitszusage (SLA).',
        'Die Modellwerte kennen keine Gebäude, Baugruben oder Nachbargerüste; lokale Düsen und Turbulenz im Lee fehlen, das 2,2-km-Gitter glättet die Stadt.',
        'Kein Glätte- oder Streumodell, keine Betonier-Empfehlung — nur Temperatur, Tmin und Niederschlagsart.',
        'Amtliche Warnungen als Flächen nur für Deutschland und die Schweiz; Österreich nur als Verweis auf GeoSphere. ' + NO_WARNING,
        NO_PUSH,
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Böen und Temperatur kommen für DE, AT und CH aus ICON-D2 (DWD, CC BY 4.0), die Werte je Höhe im Vertikalschnitt aus dem Höhen-Cube mit den ICON-D2-Modellflächen; der Punktforecast aus Stationen (DWD, TAWES, SMN), MOSMIX und C-LAEF (AT/CH). Das Regenradar reicht in Deutschland 2 Stunden (RADOLAN-RV), in Österreich 3 Stunden (INCA), in der Schweiz nur bis jetzt. Amtliche Warnungen: DWD (CAP) für Deutschland, MeteoSchweiz über MeteoAlarm für die Schweiz, mit getrennten Stufenskalen; für Österreich keine Fläche. Das Wetterarchiv nutzt Meteostat-Stationsdaten (DWD-Tageswerte als Standard) und ERA5 für modellgefüllte Anteile, die ausgewiesen werden.') },
    ],
    faqs: [
      { q: 'Ab welcher Windstärke muss der Kran stoppen?', a: 'Das sagt die Betriebsanleitung des Krans und die zuständige Vorschrift, nicht buscosun. Einen Grenzwert prüft buscosun nicht; du vergleichst den Modellwert selbst.' },
      { q: 'Zeigt buscosun die Böe auf 50 m Höhe?', a: 'Nicht für eine eingestellte Höhe. Die Böenkarte gilt für 10 m über Grund; der Vertikalschnitt zeigt Böen in Stufen von 150 m. Als Faustformel für offenes Gelände dient ein Potenzprofil: Bei 20 km/h am Boden sind das auf 50 m rechnerisch etwa 28 km/h.' },
      { q: 'Kann ich die Prognose dokumentieren?', a: 'Nicht als Export. Du kannst den Link zur Ansicht teilen. Es gibt kein Konto und keine API.' },
      { q: 'Warnt buscosun vor Sturm?', a: 'Nein. Es zeigt die amtlichen Warnungen von DWD und MeteoSchweiz wörtlich und die eigenen Böenprognosen; eine eigene Warnung gibt es nicht.' },
    ],
    related: ['/atmosphaere/querschnitt', '/wetterkarte/boeen', '/wissen/windgrenzwerte-arbeit-drohne/', '/warnungen', '/regenradar', '/fuer/drohnenpiloten/'],
  },
  // ---------------------------------------------------------------------------
  // Belege: src/sources/meteoSwissHail.ts (POH 0…1, MESHS mm, 1. April – 30.
  // September, 5 min), radar/hailField.ts (Stufen 2/3/4/≥5 cm, DE KONRAD3D
  // hail_flag, AT-Lücke), fire/brandradarMeta.ts (SMI 0 = Welkepunkt, 1 =
  // Feldkapazität, 0–9 cm / 0–81 cm, +24 h; relhum), history/historyIndices.ts
  // (GDD-Basis 10 °C, HDD 15 °C, Hitzewelle Tmax ≥ 28 °C ≥ 3 Tage, Trockenperiode
  // < 1 mm ≥ 10 Tage, frostfreie Periode), dwdLightning.ts, capAlerts.ts.
  // ---------------------------------------------------------------------------
  {
    slug: 'landwirtschaft',
    title: 'Für Landwirtschaft',
    h1: 'buscosun für Landwirte, Winzer und Obstbau: Hagel, Bodentrockenheit, Wachstumsgradtage und Frost',
    description: 'Hagelradar für CH und DE, Bodenfeuchte aus ICON-D2 in zwei Tiefen, Wachstumsgradtage, Trockenperioden und letzter Frost aus dem Archiv — kein Agrar-Modul.',
    answer: 'buscosun zeigt Landwirten, Winzern und Obstbauern die Hagelprodukte von MeteoSchweiz (Korngröße MESHS, Wahrscheinlichkeit POH) und die Hagelzellen des DWD, die Bodentrockenheit aus ICON-D2 als Index in Oberboden und Wurzelzone, das Regenradar mit Ankunftszeit und aus dem Wetterarchiv Wachstumsgradtage, Hitzewellen, Trockenperioden und die frostfreie Periode je Jahr. Ein Agrar-Modul mit Spritzfenstern oder Ertragsmodellen gibt es nicht.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Der <strong>Hagel-Layer</strong> hält zwei Quellen bewusst getrennt: Für die Schweiz die Radarprodukte von MeteoSchweiz — MESHS als maximal erwartete Korngröße in Millimetern (Stufen ab 2 cm Blüten und Lack, 3 cm Karosserie, 4 cm Dach, ab 5 cm Großhagel) und POH als Hagelwahrscheinlichkeit von 0 bis 1 — im 5-Minuten-Takt, 1 km Gitter, in der Saison vom 1. April bis 30. September. Außerhalb sagt die Karte „außerhalb der Hagelsaison", nie „kein Hagel". Für Deutschland zeichnet der Layer die Zellen des DWD-Produkts KONRAD3D mit Hagelkennung, Hagelfläche, Großhagelfläche und Hagel-Echotop. Österreich hat kein offenes Hagelprodukt; die Lücke steht auf der Karte.') +
        p('Die <strong>Bodentrockenheit</strong> im Brandradar zeigt den Bodenfeuchte-Index SMI aus ICON-D2 (0 = Welkepunkt, 1 = Feldkapazität) für den Oberboden bis 9 cm und die Wurzelzone bis 81 cm, 2,2 km Gitter, stündlich bis 24 Stunden voraus, dazu den Anteil der Fläche am Welkepunkt. Daneben der Feuerwetter-Treiber „relative Feuchte in 2 m" — ein Treiber, kein Index. Beides sind Modellwerte: Es gibt kein flächendeckendes Bodenfeuchte-Messnetz.') +
        p('Das <strong>Wetterarchiv</strong> rechnet aus Stationstageswerten Wachstumsgradtage (Basis 10 °C, kumuliert je Jahr), Heizgradtage (Basis 15 °C), Hitzewellen (mindestens drei Tage mit Tmax ≥ 28 °C), Trockenperioden (mindestens zehn Tage unter 1 mm) und die frostfreie Periode vom letzten Frühjahrs- bis zum ersten Herbstfrost — mit mittlerem Datum und Schwankung des letzten Frosts über die Jahre. Presets für Gärtner, Landwirtschaft und Energie, CSV- und PNG-Export, Ortsvergleich. Regenradar, Blitzkarte, Böen und die wörtlich zitierten amtlichen Warnungen ergänzen den Alltag.') },
      { h2: 'So nutzt du buscosun in der Landwirtschaft', html: ol([
        `Bei Gewitterlage die ${a('/wetterkarte/hagel', 'Hagelkarte')} (CH: MESHS/POH, DE: KONRAD-Zellen) mit den ${a('/wetterkarte/zellbahnen', 'Zellbahnen')} und der ${a('/wetterkarte/blitze', 'Blitzkarte')}; Hintergrund ${a('/wissen/hagel-meshs-poh/', 'MESHS und POH')}.`,
        `Für Dürre und Beregnung die ${a('/waldbrand/trockenheit', 'Bodentrockenheit')} in Oberboden und Wurzelzone, dazu ${a('/wissen/trockenperioden/', 'Trockenperioden')} im Archiv.`,
        `Im ${a('/wetterarchiv', 'Wetterarchiv')} den Standort wählen: Wachstumsgradtage, frostfreie Periode und mittleres Datum des letzten Frosts — ${a('/wissen/wachstumsgradtage-heizgradtage/', 'so werden sie gerechnet')}.`,
        `Für Heu und Ernte das ${a('/regenradar', 'Regenradar')} (Ankunftszeit in Minuten) und die ${a('/vorhersage', 'Modellvergleich-Vorhersage')} mit Konfidenz je Tag.`,
        `Für Wind bei Ausbringung die ${a('/wetterkarte/wind', 'Windkarte')} und ${a('/wetterkarte/boeen', 'Böenkarte')}; amtliche Lage wörtlich unter ${a('/warnungen', 'Warnungen')}.`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        'Kein Agrar-Modul: keine Spritzfenster-Empfehlung, keine Abdrift-Berechnung, keine Ertrags-, Reife- oder Bewässerungsmodelle, keine Schaderreger-Prognose. Windkarte und Böen sind Wetter, keine Anwendungsfreigabe.',
        'Keine Hagel-Vorhersage: MESHS, POH und KONRAD sind Radar-Nowcasts der laufenden Lage, keine Tage voraus. Das Gewitterpotenzial (ICON-D2) reicht 12 Stunden, sagt aber nichts über Hagel.',
        'Keine Frostwarnung als Alarm: Der Punktforecast zeigt Tmin, das Archiv die Statistik — ' + NO_PUSH,
        'Bodenfeuchte ist ein Modellindex aus ICON-D2, keine Messung; Wasser, Fels und Eis bleiben leer. Ein Feld unter Folie oder mit Beregnung weicht ab.',
        'Für Österreich gibt es weder ein offenes Hagelprodukt noch amtliche Warnflächen im Layer. ' + NO_WARNING,
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Hagel: MeteoSchweiz (CC BY 4.0) für die Schweiz, DWD KONRAD3D für Deutschland, für Österreich keine Quelle. Bodentrockenheit und relative Feuchte: ICON-D2 des DWD für DE, AT und CH. Archiv-Indizes: Meteostat-Stationstageswerte (DWD-Tageswerte als Standardquelle) und ERA5 (Open-Meteo Archive, bis 1940) für Lücken, modellgefüllte Anteile ausgewiesen. Regenradar: RADOLAN-RV (DE, 2 h), INCA (AT, 3 h), MeteoSchweiz-Radar (CH, Analyse). Blitze: DWD-Blitznetz mit Deutschland-Fokus. Amtliche Warnungen als Flächen nur für DE und CH.') },
    ],
    faqs: [
      { q: 'Zeigt buscosun Hagel für Österreich?', a: 'Nein. Es gibt kein offenes Hagelprodukt von GeoSphere; die Karte weist die Lücke aus, statt Nachbarwerte zu übertragen.' },
      { q: 'Wie werden Wachstumsgradtage berechnet?', a: 'Als Summe von max(0, Tagesmittel − 10 °C) über das Jahr aus Stationstageswerten; Heizgradtage analog mit Basis 15 °C.' },
      { q: 'Gibt es ein Spritzfenster?', a: 'Nein. buscosun zeigt Wind, Böen, Regen und Feuchte, gibt aber keine Anwendungsempfehlung. Die Freigabe bleibt bei Fachberatung und Vorschrift.' },
      { q: 'Ist die Bodenfeuchte gemessen?', a: 'Nein, sie ist der Modellindex SMI aus ICON-D2 (0 Welkepunkt, 1 Feldkapazität) für 0–9 cm und 0–81 cm. Ein Messnetz gibt es nicht.' },
    ],
    related: ['/wetterkarte/hagel', '/waldbrand/trockenheit', '/wetterarchiv', '/wissen/wachstumsgradtage-heizgradtage/', '/wissen/trockenperioden/', '/wissen/kenntage-hitzetage-frosttage/'],
  },
  // ---------------------------------------------------------------------------
  // Belege: src/event/eventModel.ts (10 Anlässe + freier Anlass, Horizont 7 Tage,
  // Plan B Regen 3 mm / Böen 13 m/s / Score 50, Zelt/Halle/Unterstand/nur warnen),
  // methodik.mjs (Fläche 0,05–60 km, Ecken 10 % nach innen, 30-m-DEM, Grat
  // 30 km / 1°, Ausweichort 8 Richtungen 22 km ≥ 6 Punkte, RELIABLE 0,55,
  // AT/CH ~60 h), radar/konrad3d.ts, capAlerts.ts, NULL_BACKEND (FEATURE-INVENTAR E9).
  // ---------------------------------------------------------------------------
  {
    slug: 'veranstalter',
    title: 'Für Veranstalter',
    h1: 'buscosun für Veranstalter, Vereine und Festivals: bester Tag, Plan B, Festwiese im Gelände, Gewitterzellen',
    description: 'Sieben Tage nach Anlass bewertet, Plan B mit eigener Schwelle, Festwiese als Fläche mit Gelände, Zellbahnen und Warnungen wörtlich — kein Sicherheitskonzept.',
    answer: 'buscosun bewertet für Veranstalter die nächsten sieben Tage nach Anlass mit einem Score von 0 bis 100 und einer Konfidenz je Tag, bewertet Phasen einzeln, löst Plan B ab einstellbaren Schwellen aus, sucht Ausweichorte im Umkreis von 22 km und bewertet die Festwiese als Fläche mit Geländekennzahlen, Windpfeilen und der Stunde, in der die Sonne hinter dem Grat verschwindet. Am Veranstaltungstag zeigen Zellbahnen, Böen und wörtlich zitierte Warnungen die Lage.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Der <strong>Event-Wizard</strong> führt in fünf Schritten von Ort und Fläche über Anlass und Zeitfenster zu Plan B. Zehn Anlässe haben eigene Gewichte und Idealtemperaturen — Grillen, Hochzeit, Wandern, Drohne, Fotografie, Sterne, Radtour, Picknick, Laufen, Baden — plus ein freier Anlass; jedes Gewicht lässt sich feinjustieren. Bewertet wird das gewählte Fenster (ganzer Tag 8–20 Uhr, Vormittag, Nachmittag, Abend 18–23 Uhr oder Kernnacht) als gewichtete Summe aus Regen, Temperatur, Wind und Wolken, mit dem entscheidenden Negativfaktor im Klartext. Die Konfidenz ist Quellen-Einigkeit mal Vorlauf; unter 0,55 heißt es „nur Tendenz". Tage jenseits des Quellenhorizonts (AT/CH etwa 60 Stunden) werden als „keine Vorhersage" gezeigt, nicht als Null.') +
        p('<strong>Plan B</strong> löst aus, wenn die Regensumme im Fenster (Standard 3 mm, 0,5–15), die Spitzenböe (Standard 13 m/s, 6–25 — Zelt und Pavillon) oder der Gesamtscore (Standard 50) die Schwelle reißen, mit Ausweichoption Zelt/Pavillon, Innenraum/Halle, Unterstand oder nur warnen. Die <strong>Ausweichort-Suche</strong> fragt acht Himmelsrichtungen im Radius von 22 km mit demselben Profil ab und schlägt nur vor, was mindestens 6 Punkte besser ist. Für Auf- und Abbau stehen Phasen zur Verfügung, die einzeln bewertet werden; der Tag zählt die schwächste.') +
        p('Die <strong>Event-Fläche</strong> ersetzt den Punkt durch ein Rechteck (0,05 bis 60 km Kante): Bewertet werden vier um 10 % nach innen gerückte Ecken und die Mitte, und wo das Gelände flach ist, sagt die App „uniform", statt Nachkommastellen als Ortsauflösung auszugeben. Die Gelände-Bühne zeigt Höhenlage, Neigung, tiefsten und exponiertesten Punkt aus dem 30-m-Raster, Windpfeile zur Böen-Spitzenstunde und je Phase die Stunde, in der die Sonne hinter dem Grat verschwindet (Horizont aus dem DEM im 30-km-Umkreis). Am Tag selbst: KONRAD3D-Zellbahnen mit Ankunftszeit (DE), Gewitterpotenzial, Böenkarte, Regenradar und amtliche Warnungen wörtlich. Der Termin geht als .ics in den Kalender.') },
      { h2: 'So nutzt du buscosun als Veranstalter', html: ol([
        `Starte die ${a('/eventplanung', 'Event-Planung')}, setze den Ort und ziehe die Festwiese als Rechteck auf.`,
        `Wähle den Anlass (oder einen freien) und das Zeitfenster; lege Phasen für Aufbau, Programm und Abbau an — jede wird einzeln bewertet.`,
        `Stelle Plan B ein: Regen-, Böen- oder Score-Schwelle und die Ausweichoption; lass bei Bedarf Ausweichorte im 22-km-Umkreis suchen.`,
        `Prüfe die Gelände-Bühne: exponierteste Ecke, Windpfeile zur Böenspitze, Sonne hinter dem Grat je Phase; ${a('/methodik/event-bewertung/', 'so entsteht der Score')}.`,
        `Am Veranstaltungstag: ${a('/wetterkarte/zellbahnen', 'Zellbahnen')}, ${a('/wetterkarte/gewitter', 'Gewitterpotenzial')}, ${a('/wetterkarte/boeen', 'Böenkarte')}, ${a('/regenradar', 'Regenradar')} und ${a('/warnungen', 'Warnungen')} wörtlich.`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        'Kein Sicherheitskonzept, keine Blitz-Abstandsalarmierung, keine Evakuierungsempfehlung. Die Entscheidung über Abbruch oder Räumung bleibt bei Veranstalter und Behörden. ' + NO_WARNING,
        'Sieben Tage Horizont, weil MOSMIX ihn trägt; für Österreich und die Schweiz gibt es Bewertungen nur bis etwa 60 Stunden. Termine Monate voraus lassen sich nicht bewerten.',
        'Kein B2B-Produkt: kein Konto, keine Team-Freigabe, keine API, kein Dokumentations-Export außer .ics und Permalink.',
        'Die Gelände-Bühne kennt weder Gebäude noch Bühnenaufbauten noch Bäume; Windpfeile gelten für das freie Gelände aus dem 2,2-km-Modell.',
        'Zellbahnen und Blitzkarte sind Deutschland-fokussiert; amtliche Warnflächen gibt es nur für DE und CH.',
        NO_PUSH,
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Die Bewertung läuft auf dem Punktforecast: Stationen (DWD, TAWES, SMN), MOSMIX (DACH, rund 10 Tage) und für AT/CH C-LAEF (bis 60 Stunden) — daher der kürzere Horizont dort. Das Gelände stammt aus Terrarium-Höhenkacheln (rund 30 m). Ecken und Mitte werden nacheinander abgefragt, weil parallele Abrufe bei GeoSphere HTTP 429 auslösten. KONRAD3D-Zellbahnen und die Blitzkarte sind DWD-Produkte für Deutschland; das Gewitterpotenzial (ICON-D2) deckt DACH ab. Amtliche Warnungen: DWD für Deutschland, MeteoSchweiz über MeteoAlarm für die Schweiz, Österreich nur als Verweis auf GeoSphere.') },
    ],
    faqs: [
      { q: 'Wann löst Plan B aus?', a: 'Wenn im Zeitfenster die Regensumme (Standard 3 mm), die Spitzenböe (Standard 13 m/s) oder der Gesamtscore (Standard 50) die Schwelle reißt; die Werte sind einstellbar.' },
      { q: 'Wie weit voraus kann ich planen?', a: 'Sieben Tage; in Österreich und der Schweiz bewertet buscosun nur bis etwa 60 Stunden und zeigt darüber hinaus „keine Vorhersage" statt einer Zahl.' },
      { q: 'Warnt buscosun bei Gewitter am Veranstaltungstag?', a: 'Nein. Es zeigt KONRAD-Zellbahnen mit Ankunftszeit (DE), Gewitterpotenzial und die amtlichen Warnungen wörtlich — bei geöffneter App, ohne Push.' },
      { q: 'Bewertet buscosun die ganze Festwiese oder nur einen Punkt?', a: 'Die Fläche: vier nach innen gerückte Ecken und die Mitte. Bei flachem Gelände sagt die App „uniform", weil der Punktforecast dort keine Ortsauflösung hergibt.' },
    ],
    related: ['/eventplanung', '/funktionen/event-tag/', '/methodik/event-bewertung/', '/wetterkarte/zellbahnen', '/warnungen', '/fuer/hochzeit/'],
  },
  // ---------------------------------------------------------------------------
  // Belege: src/event/eventModel.ts (WEDDING_PHASES Trauung 13–15, Empfang 15–18,
  // Abendfeier 18–23; Plan B Standards; EVENT_HORIZON_DAYS 7), methodik.mjs
  // (Hochzeit 14–26 °C, Gewichte 1,0/0,5/0,4/0,3; RELIABLE 0,55; Ausweichort;
  // Foto-Licht NOAA), src/photo/sun.ts (blau −6…−4°, golden −4…+6°, Horizont
  // −0,833°), FEATURE-INVENTAR E2/E3 (`wedding` nutzt Default-Profil).
  // ---------------------------------------------------------------------------
  {
    slug: 'hochzeit',
    title: 'Für Hochzeit',
    h1: 'buscosun für die Hochzeit im Freien: Trauung, Empfang und Abendfeier einzeln bewertet, Plan B eingebaut',
    description: 'Trauung, Empfang und Abendfeier einzeln bewertet, der Tag zählt die schwächste Phase — dazu Plan B, Ausweichort im Umkreis und die goldene Stunde.',
    answer: 'buscosun bewertet für eine Hochzeit im Freien die nächsten sieben Tage in drei Phasen — Trauung 13–15 Uhr, Empfang 15–18 Uhr, Abendfeier 18–23 Uhr, frei anpassbar —, wobei der Tag die schwächste Phase zählt. Plan B löst ab einstellbaren Schwellen für Regen, Böen oder Gesamtwertung aus, die Ausweichort-Suche fragt den Umkreis von 22 km ab, und die goldene Stunde für die Paarfotos gilt astronomisch für jedes Datum, auch Monate voraus.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Der Anlass <strong>Hochzeit</strong> in der Event-Planung legt drei Phasen an — Trauung 13 bis 15 Uhr, Empfang 15 bis 18 Uhr, Abendfeier 18 bis 23 Uhr —, die sich verschieben, umbenennen und ergänzen lassen. Jede Phase wird einzeln bewertet (Regen, Temperatur, Wind, Wolken; Idealtemperatur 14–26 °C, Regen mit Gewicht 1,0, Temperatur 0,5, Wind 0,4, Wolken 0,3), und der Tag zählt die schwächste Phase — eine trockene Trauung rettet keinen verregneten Empfang. Die Hochzeitskarten für Wind, Hitze und Abendkälte erscheinen bei der Phase Trauung. Jeder Tag trägt eine Konfidenz aus Quellen-Einigkeit mal Vorlauf; unter 0,55 heißt es ausdrücklich „nur Tendenz".') +
        p('<strong>Plan B</strong> ist eingebaut: Ab einer Regensumme im Fenster (Standard 3 mm), einer Spitzenböe (Standard 13 m/s — die Grenze für Zelt und Pavillon) oder einer Gesamtwertung unter 50 Punkten schlägt buscosun den Ausweichplan vor, den du hinterlegt hast: Zelt/Pavillon, Innenraum/Halle, Unterstand oder nur ein Hinweis. Die <strong>Ausweichort-Suche</strong> fragt auf Knopfdruck acht Himmelsrichtungen im Radius von 22 km mit demselben Profil ab und nennt nur Orte, die mindestens 6 Punkte besser sind. Statt eines Punktes lässt sich die Wiese oder der Garten als Fläche aufziehen; die Gelände-Bühne zeigt dann, wo es exponiert ist und in welcher Stunde die Sonne je Phase hinter dem Grat verschwindet.') +
        p('Für die Paarfotos rechnet das <strong>Foto-Licht</strong> Sonnenstand und Lichtfenster rein astronomisch (NOAA-Verfahren, etwa eine Minute genau): blaue Stunde bei Sonnenhöhe −6° bis −4°, goldene Stunde −4° bis +6°, Auf- und Untergang bei −0,833°. Diese Zeiten gelten für jedes Datum — auch für den Termin im nächsten Sommer. Lichtqualität und Abendrot-Chance kommen erst im Vorhersagehorizont dazu. Der Termin geht als .ics in den Kalender.') },
      { h2: 'So nutzt du buscosun für die Hochzeit', html: ol([
        `Öffne die ${a('/eventplanung', 'Event-Planung')}, setze den Ort der Feier (oder ziehe die Wiese als Fläche auf) und wähle den Anlass Hochzeit.`,
        `Passe die drei Phasen an euren Ablauf an — Trauung, Empfang, Abendfeier — und lege die Plan-B-Schwelle mit eurer Ausweichoption fest.`,
        `Lies die Bewertung je Phase und die Konfidenz; bei „nur Tendenz" noch nicht entscheiden, sondern näher am Termin erneut prüfen.`,
        `Lass Ausweichorte im 22-km-Umkreis suchen und die goldene Stunde für die Fotos anzeigen — ${a('/wissen/goldene-blaue-stunde/', 'so entstehen die Lichtfenster')}.`,
        `Am Tag selbst das ${a('/regenradar', 'Regenradar')} mit Ankunftszeit und die ${a('/warnungen', 'amtlichen Warnungen')}; Rechenweg unter ${a('/methodik/event-bewertung/', 'Event-Bewertung')}.`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        'Keine Wettervorhersage für einen Termin in Monaten: Der Horizont ist sieben Tage, weil MOSMIX ihn trägt; in Österreich und der Schweiz etwa 60 Stunden. Vorher gibt es nur die astronomischen Lichtzeiten und die Klimastatistik des Ortes im Archiv.',
        'Keine Location-Datenbank und keine Kontakte zu Zeltverleih oder Hallen — Plan B ist deine hinterlegte Option, kein Buchungsservice.',
        'Die Hochzeitsgewichte entsprechen dem freien Standardprofil (14–26 °C); wer es strenger will, justiert die Gewichte selbst.',
        'Die Gelände-Bühne kennt weder Gebäude noch Zelte noch Bäume; Schatten kommt nur vom Gelände.',
        NO_PUSH + ' Der Kalender-Export (.ics) ist der Ersatz.',
        NO_WARNING,
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Die Bewertung nutzt den Punktforecast aus Stationen (DWD, TAWES, SMN), MOSMIX (DACH, rund 10 Tage) und für Österreich und die Schweiz C-LAEF (bis 60 Stunden) — deshalb bewertet buscosun dort nur die ersten zweieinhalb Tage und zeigt danach „keine Vorhersage" statt einer Zahl. Das Gelände stammt aus Terrarium-Höhenkacheln (rund 30 m). Die Lichtzeiten sind Astronomie ohne Länderunterschied. Amtliche Warnungen erscheinen als Flächen nur für Deutschland und die Schweiz.') },
    ],
    faqs: [
      { q: 'Kann ich das Wetter für unsere Hochzeit in vier Monaten sehen?', a: 'Nein, die Bewertung reicht sieben Tage. Die goldene und blaue Stunde für den Termin gelten astronomisch schon jetzt; die Klimastatistik des Ortes zeigt das Wetterarchiv.' },
      { q: 'Was heißt „der Tag zählt die schwächste Phase"?', a: 'Trauung, Empfang und Abendfeier werden einzeln bewertet; die Tageswertung ist die niedrigste der drei, damit ein trockener Nachmittag den verregneten Abend nicht kaschiert.' },
      { q: 'Wann schlägt buscosun Plan B vor?', a: 'Standardmäßig ab 3 mm Regen im Fenster, 13 m/s Spitzenböe oder unter 50 Punkten Gesamtwertung — alle drei Schwellen sind einstellbar, die Ausweichoption hinterlegst du selbst.' },
      { q: 'Wann ist die goldene Stunde am Hochzeitstag?', a: 'Bei Sonnenhöhe −4° bis +6°, morgens und abends; buscosun rechnet sie für jedes Datum etwa minutengenau nach dem NOAA-Verfahren.' },
    ],
    related: ['/eventplanung', '/methodik/event-bewertung/', '/funktionen/event-tag/', '/wissen/goldene-blaue-stunde/', '/fuer/veranstalter/', '/fuer/fotografen/'],
  },
  // ---------------------------------------------------------------------------
  // Belege: src/photo/sun.ts (BLUE −6…−4, GOLD −4…+6, HORIZON −0,833, ASTRO −18),
  // photoLight.ts (Lichtqualität aus Bedeckung + Schichtung, Nebel-/Abendrot-
  // Chance als Wahrscheinlichkeit), methodik.mjs (Fotografie-Profil 2–28 °C,
  // Wolken 1,0 weich), FEATURE-INVENTAR
  // A6 (Wolken 3-schichtig, nicht im Dock), A7 (Satellit), E7.
  // ---------------------------------------------------------------------------
  {
    slug: 'fotografen',
    title: 'Für Fotografen',
    updated: '2026-11-01',
    h1: 'buscosun für Landschafts- und Hobbyfotografen: goldene Stunde, Nebel-Chance, Abendrot-Chance',
    description: 'Goldene und blaue Stunde minutengenau für jedes Datum, Lichtqualität, Nebel- und Abendrot-Chance sowie Wolken in drei Stockwerken.',
    answer: 'buscosun rechnet Fotografen Sonnenauf- und -untergang, blaue und goldene Stunde rein astronomisch für jedes Datum und ergänzt im Vorhersagehorizont die Lichtqualität (weich, hart, dramatisch) aus Bedeckung und Schichtung sowie eine Nebel-Chance am Morgen und eine Abendrot-Chance am Abend — jede Lichtaussage mit Wahrscheinlichkeit, keine Garantie. Ob ein Standort über dem Nebel liegt, sagt buscosun nicht.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Das <strong>Foto-Licht</strong> im Event-Anlass Fotografie berechnet Sonnenstand und Lichtfenster nach dem NOAA-Verfahren, etwa eine Minute genau: blaue Stunde bei Sonnenhöhe −6° bis −4°, goldene Stunde −4° bis +6°, Auf- und Untergang bei −0,833° (Standard-Refraktion), astronomische Dunkelheit unter −18°. Diese Zeiten sind reine Astronomie und gelten für jedes Datum, auch Monate voraus — für die Planung einer Reise oder eines Shootings ohne Wettervorhersage. Das Anlass-Profil Fotografie gewichtet Wolken mit 1,0 („weich"), Regen 0,7, Wind 0,25, Temperatur 0,15 bei Idealtemperatur 2–28 °C.') +
        p('Im Vorhersagehorizont kommen Heuristiken aus dem Punktforecast dazu: die <strong>Lichtqualität</strong> — weiches Porträtlicht, reizvolle Wolkenstimmung oder flau und hart — aus Gesamtbedeckung und der Verteilung auf tiefe, mittlere und hohe Wolken; die <strong>Nebel-Chance</strong> am Morgen und die <strong>Abendrot-Chance</strong> am Abend aus Bewölkung, Feuchte und Wind. Jede Aussage trägt eine Wahrscheinlichkeit, keine Garantie — Licht ist nicht garantierbar, und der Code sagt das.') +
        p('Auf der Wetterkarte liegen die <strong>Wolken in drei Stockwerken</strong> (tief, mittel, hoch aus ICON-D2) übereinander, das Meteosat-Satellitenbild zeigt die reale Bewölkung, und die höhenkorrigierte Temperaturkarte hilft bei Raureif- und Frostfragen im Tal. Die Event-Fläche mit Gelände-Bühne nennt für einen Standort die Stunde, in der die Sonne hinter dem Grat verschwindet.') },
      { h2: 'So nutzt du buscosun als Fotograf', html: ol([
        `Öffne die ${a('/eventplanung', 'Event-Planung')}, wähle den Anlass Fotografie und den Ort — das Foto-Licht zeigt die Lichtfenster je Tag, ${a('/wissen/goldene-blaue-stunde/', 'so entstehen sie')}.`,
        `Für Nebelbilder im Herbst die Nebel-Chance am Morgen; Hintergrund ${a('/wissen/nebel-hochnebel-nebelobergrenze/', 'Nebel, Hochnebel, Nebelobergrenze')}.`,
        `Prüfe die ${a('/wetterkarte/bewoelkung', 'Bewölkungskarte')} in drei Stockwerken und das ${a('/wetterkarte/satellit', 'Satellitenbild')} für die reale Lage.`,
        `Für Standorte im Gebirge die ${a('/wetterkarte/temperatur', 'Temperaturkarte')} (höhenkorrigiert) und die Gelände-Bühne der Event-Fläche mit Sonne hinter dem Grat.`,
        `Die Rechenregeln stehen in ${a('/methodik/event-bewertung/', 'Event-Bewertung')} (Abschnitt Foto-Licht und Astro-Nacht).`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        'Keine Sichtweite und keine Fernsicht-Prognose — keine Quelle der Punkt-Kette führt sie. Ob der Gipfel 100 km weit sichtbar ist, sagt buscosun nicht.',
        'Lichtqualität, Nebel- und Abendrot-Chance sind Heuristiken aus Bedeckung, Schichtung, Feuchte und Wind — Wahrscheinlichkeiten, keine Garantien, und nur innerhalb des Vorhersagehorizonts (sieben Tage, AT/CH etwa 60 Stunden).',
        'Keine Polarlicht- oder Meteorstrom-Prognose, keine Milchstraßen-Sichtbarkeit (siehe die Seite für Astronomie).',
        'Keine Webcams, keine Standortdatenbank, kein Fotospot-Verzeichnis, keine Sonnenrichtungs-Überlagerung auf der Karte.',
        'Keine Nebelobergrenze und keine Inversionshöhe: Ob ein Standort über dem Nebel liegt, musst du aus Webcams und Erfahrung ableiten.',
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Die Lichtzeiten sind Astronomie ohne Länderunterschied. Lichtqualität und Chancen laufen auf dem Punktforecast: Stationen (DWD, TAWES, SMN), MOSMIX und für Österreich und die Schweiz C-LAEF (bis 60 Stunden) — dort ist der Horizont für Wetteraussagen kürzer. Die Wolkenstockwerke kommen aus ICON-D2 (DWD, 2,2 km, DACH), das Satellitenbild vom DWD-Kartendienst (EUMETSAT Meteosat, 3-Stunden-Takt).') },
    ],
    faqs: [
      { q: 'Kann ich die goldene Stunde für einen Termin in drei Monaten sehen?', a: 'Ja. Die Lichtfenster sind reine Astronomie (NOAA-Verfahren, etwa minutengenau) und gelten für jedes Datum; eine Wetterwahrscheinlichkeit gibt es erst im Vorhersagehorizont.' },
      { q: 'Wie zuverlässig ist die Abendrot-Chance?', a: 'Sie ist eine Heuristik aus Bewölkung, Schichtung, Feuchte und Wind und wird als Wahrscheinlichkeit gezeigt. Licht ist nicht garantierbar; der Code sagt das ausdrücklich.' },
      { q: 'Sagt buscosun, ob ich über dem Nebel stehe?', a: 'Nein. Eine Nebelobergrenze oder Inversionshöhe zeigt buscosun nicht. Die Nebel-Chance am Morgen ist eine Heuristik für den Punkt; sie sagt nichts darüber, wo die Nebeldecke endet.' },
      { q: 'Wo liegt die blaue Stunde?', a: 'Bei Sonnenhöhe −6° bis −4°, morgens vor und abends nach der goldenen Stunde (−4° bis +6°).' },
    ],
    related: ['/eventplanung', '/wissen/goldene-blaue-stunde/', '/wissen/nebel-hochnebel-nebelobergrenze/', '/wetterkarte/bewoelkung', '/wetterkarte/satellit', '/fuer/astronomie/'],
  },
  // ---------------------------------------------------------------------------
  // Belege: src/astro/astroNight.ts (Nacht 21–06 Uhr, Magnus-Taupunkt, Wolken-
  // schichten, Schlyter-Mond, Score), src/astro/lightPollution.ts (1/d^2,5-
  // Modell, Bortle 1–9, Kern ≈ 8, ~30 km ≈ 3–4, abgelegen ≈ 2, „grobe Heuristik"),
  // src/photo/sun.ts (ASTRO_NIGHT −18°), methodik.mjs (Sterne-Profil 0–30 °C,
  // Wolken 1,0 wenig, Kernnacht 22–4 Uhr; keine Milchstraße/Meteore/Polarlicht).
  // ---------------------------------------------------------------------------
  {
    slug: 'astronomie',
    title: 'Für Astronomie',
    h1: 'buscosun für Hobby-Astronomen und Astrofotografen: klare, dunkle, mondarme Nacht finden',
    description: 'Astro-Nacht mit Mondphase, Wolkenstockwerken, Tau-Risiko und astronomischer Dunkelheit; die Lichtverschmutzung ist eine Bortle-Schätzung, keine Messung.',
    answer: 'buscosun bewertet für Sternfreunde jede Nacht der nächsten sieben Tage von 21 bis 6 Uhr: Mondphase und Mondhöhe, Bewölkung in drei Stockwerken, Tau-Risiko aus dem Taupunkt und die astronomische Dunkelheit unter −18° Sonnenhöhe ergeben einen Nacht-Score mit Konfidenz. Die Lichtverschmutzung ist eine Offline-Schätzung aus der Nähe zu Städten auf der Bortle-Skala — kein Messatlas. Milchstraßen-Sichtbarkeit, Meteorströme und Polarlicht prognostiziert buscosun nicht.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Der Event-Anlass <strong>Sterne</strong> bewertet die Kernnacht (22 bis 4 Uhr, Profil: Wolken mit Gewicht 1,0 „wenig", Regen 0,9, Wind 0,2, Temperatur 0,15 bei 0–30 °C) und öffnet die <strong>Astro-Nacht</strong>: Für die Stunden von 21 bis 6 Uhr des Folgetags führt buscosun die mehrschichtige Bewölkung (tief, mittel, hoch), die Mondphase und Mondhöhe nach Schlyter, das Tau- und Feuchterisiko aus dem Taupunkt nach Magnus und die astronomische Dunkelheit (Sonne unter −18°) zu einem Nacht-Score zusammen, der die Nächte der Woche ordnet. Die Konfidenz kommt aus der Event-Bewertung: Quellen-Einigkeit mal Vorlauf.') +
        p('Die <strong>Lichtverschmutzung</strong> ist bewusst eine grobe, ehrliche Schätzung: ein additives 1/d^2,5-Modell aus der Nähe zu Städten, logarithmisch auf die Bortle-Skala 1 (exzellent dunkel) bis 9 (innerstädtisch) abgebildet und so kalibriert, dass ein Großstadtkern etwa Klasse 8 erhält, 30 km Abstand etwa 3 bis 4 und abgelegene Lagen etwa 2. Die Ausgabe nennt die nächste Stadt und ihre Entfernung, damit die Schätzung nachvollziehbar bleibt. Ein VIIRS-Atlas oder eine Messung steckt nicht dahinter.') +
        p('Auf der Wetterkarte zeigen die <strong>Wolken in drei Stockwerken</strong> aus ICON-D2, wo Zirren die Transparenz kosten, und das Meteosat-Satellitenbild die reale Lage. Die Astro-Zeiten sind Astronomie und gelten für jedes Datum; die Wolkenaussage erst im Vorhersagehorizont. Der Termin geht als .ics in den Kalender.') },
      { h2: 'So nutzt du buscosun in der Astronomie', html: ol([
        `Öffne die ${a('/eventplanung', 'Event-Planung')}, wähle den Anlass Sterne und deinen Beobachtungsort — die Astro-Nacht ordnet die Nächte der Woche.`,
        `Lies je Nacht Mondphase, Mondhöhe, Wolkenstockwerke, Tau-Risiko und Dunkelheitsfenster; Bortle-Schätzung und nächste Stadt stehen daneben — ${a('/wissen/lichtverschmutzung-bortle/', 'was die Klassen bedeuten')}.`,
        `Prüfe am Abend die ${a('/wetterkarte/bewoelkung', 'Bewölkungskarte')} (hoch, mittel, tief) und das ${a('/wetterkarte/satellit', 'Satellitenbild')}.`,
        `Bei Standorten im Gebirge: ${a('/wetterkarte/temperatur', 'Temperaturkarte')} für die Nachtkälte. Ob ein Standort über dem Nebel liegt, sagt buscosun nicht.`,
        `Der Rechenweg steht in ${a('/methodik/event-bewertung/', 'Event-Bewertung')} (Abschnitt Foto-Licht und Astro-Nacht).`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        'Keine Milchstraßen-Sichtbarkeit: buscosun kennt weder die Position des galaktischen Zentrums noch die Transparenz — nur Wolken, Mond und Dunkelheit.',
        'Keine Meteorstrom- und keine Polarlicht-Prognose; kein Seeing, keine Transparenz, kein Jetstream-Index.',
        'Die Bortle-Klasse ist eine Schätzung aus Stadtnähe (1/d^2,5-Modell), kein VIIRS-Atlas, keine Messung — für Nachbarorte kann sie gleich ausfallen, obwohl ein Hügel dazwischenliegt.',
        'Sieben Tage Horizont; in Österreich und der Schweiz etwa 60 Stunden. Die Dunkelheitszeiten gelten astronomisch, die Wolkenaussage nicht.',
        'Kein Teleskop-Steuerung, kein Objektkatalog, keine Sichtbarkeitstabelle für Planeten oder Deep-Sky-Objekte.',
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Mond und Dunkelheit sind Astronomie ohne Länderunterschied. Die Bewölkung in drei Stockwerken kommt aus dem Punktforecast (Stationen DWD/TAWES/SMN, MOSMIX, für AT/CH C-LAEF bis 60 Stunden) und auf der Karte aus ICON-D2 (DWD, 2,2 km, DACH). Die Lichtverschmutzung rechnet auf einer Städteliste im Gerät, ohne Netzabruf und ohne Länderunterschied. Das Satellitenbild stammt vom DWD-Kartendienst (Meteosat, 3-Stunden-Takt).') },
    ],
    faqs: [
      { q: 'Ist die Bortle-Klasse gemessen?', a: 'Nein. Sie ist eine Offline-Schätzung aus der Entfernung zu Städten (additives 1/d^2,5-Modell), kalibriert auf Großstadtkern ≈ 8 und abgelegen ≈ 2. buscosun nennt die nächste Stadt dazu.' },
      { q: 'Zeigt buscosun, wann die Milchstraße sichtbar ist?', a: 'Nein. Es bewertet Wolken, Mondphase und -höhe, Tau-Risiko und astronomische Dunkelheit — nicht die Lage des galaktischen Zentrums.' },
      { q: 'Wann beginnt die astronomische Dunkelheit?', a: 'Wenn die Sonne mehr als 18° unter dem Horizont steht; buscosun rechnet die Fenster je Nacht für jedes Datum.' },
      { q: 'Wie wird das Tau-Risiko berechnet?', a: 'Aus der Differenz von Temperatur und Taupunkt (Magnus-Formel) in den Nachtstunden — je kleiner, desto eher beschlägt die Optik.' },
    ],
    related: ['/eventplanung', '/wissen/lichtverschmutzung-bortle/', '/methodik/event-bewertung/', '/wetterkarte/bewoelkung', '/fuer/fotografen/'],
  },
  // ---------------------------------------------------------------------------
  // Belege: methodik.mjs Brandradar (FIRMS VIIRS 375 m, GWIS-Notbetrieb, 39 %
  // Dauerquellen, 462 Standorte, Bestätigung nur mit EFFIS/EMS/amtlicher Warnung,
  // MoWaS/NINA/Alertswiss nur verlinkt, 618 Paare, dNBR), src/fire/FireLayerCard.tsx
  // („keine Einsatzmeldung", 2,2 ha je deutschem Waldbrand), brandradarMeta.ts
  // (SMI, relhum), routes.ts (GWIS/ECMWF 8 km, +9 Tage, DWD/BAFU, AT ohne Stufe),
  // radar/konrad3d.ts, capAlerts.ts / warnField.ts (Zitatregel), NULL_BACKEND.
  // ---------------------------------------------------------------------------
  {
    slug: 'feuerwehr-katastrophenschutz',
    title: 'Für Feuerwehr und Katastrophenschutz',
    h1: 'buscosun für Feuerwehr, THW und Katastrophenschutz: Lagebild, kein Einsatzsystem',
    description: 'Waldbrandgefahr als EU-Index, Satelliten-Hotspots (unbestätigt ist der Normalfall), Trockenheit, Zellbahnen und Warnungen wörtlich — kein Einsatzsystem.',
    answer: 'buscosun liefert ehrenamtlichen und hauptamtlichen Einsatzkräften ein Wetter- und Brandlagebild: den europäischen Fire Weather Index als Fläche über DACH, Satellitendetektionen von NASA FIRMS mit Ortsfest-Filter, Bodentrockenheit und Luftfeuchte aus ICON-D2, für Deutschland die amtlichen KONRAD3D-Gewitterzellen sowie Böen und die amtlichen Warnungen im Wortlaut. Es ist kein Einsatzsystem: keine Alarmierung, keine Einsatzmeldungen, MoWaS nur verlinkt, Hotspots unbestätigt.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Das <strong>Brandradar</strong> zeigt den Fire Weather Index des Copernicus-Dienstes GWIS (ECMWF, 8 km) als durchgehende Fläche über Deutschland, Österreich und die Schweiz bis neun Tage voraus, mit Sub-Ansichten FWI, Perzentil-Einordnung („wie außergewöhnlich ist heute hier"), DC, ISI und FFMC. Zur Einordnung stehen die nationalen Skalen von DWD (fünf Stufen) und BAFU nebeneinander, nie umgerechnet; Österreich hat keine offene amtliche Stufe, und die Karte sagt das. Bodentrockenheit (SMI in 0–9 cm und 0–81 cm) und relative Feuchte in 2 m aus ICON-D2 sind Treiber, keine Indizes.') +
        p('<strong>Aktive Brände</strong> kommen aus den Wärmedetektionen von NASA FIRMS (VIIRS, 375 m) über 24 Stunden oder 7 Tage; fällt FIRMS aus, springt GWIS ohne Strahlungsleistung ein und die Karte zeigt „Notbetrieb". Ein Klassifikator markiert ortsfeste Dauerquellen grau — rund 39 Prozent aller DACH-Detektionen liegen auf Stahlwerken, Raffinerien und Fackeln; 462 solcher Standorte sind bekannt. Ein Brand heißt <strong>bestätigt</strong> nur mit EFFIS-Kartierung, Copernicus-EMS-Aktivierung oder amtlicher Warnung im selben Satz; „plausibel" bei mehreren Überflügen, sonst „unbestätigt" — der Normalfall, kein Versagen. Flächen tragen ihre Art (kartiert, „bis N ha" aus dem Raster, geschätzt mit Intervall), Tendenz und Verschiebung kommen aus dem FRP-Verlauf zwischen Überflügen; Sentinel-2-Bilder vorher/nachher und dNBR-Brandnarben mit 10 m ergänzen das Dossier.') +
        p('Für Unwetterlagen: die amtlichen <strong>KONRAD3D-Zellbahnen</strong> des DWD mit Zugbahn, Unsicherheitstrichter und Ankunftszeit (DE, 5 Minuten), Gewitterpotenzial und Blitzprognose (ICON-D2, 12 h), die Böenkarte bis +24 h, das Regenradar mit Zellverfolgung und die <strong>amtlichen Warnungen</strong> als Flächen, deren Text im Popup wörtlich steht — Überschrift, Beschreibung, Verhaltenshinweis unverändert, nie zusammengefasst oder verschärft.') },
      { h2: 'So nutzt du buscosun im Katastrophenschutz', html: ol([
        `Lagebild Waldbrand: ${a('/waldbrand/gefahrenindex', 'Gefahrenindex')} mit Perzentil-Einordnung, ${a('/waldbrand/trockenheit', 'Bodentrockenheit')}, ${a('/wissen/fire-weather-index/', 'FWI erklärt')} und ${a('/wissen/waldbrandwarnstufen-de-at-ch/', 'die Warnstufen in DE, AT und CH')}.`,
        `Detektionen prüfen: ${a('/waldbrand/aktive-braende', 'Aktive Brände')} — Punkt ist die Pixelmitte, grau ist ortsfest, ${a('/wissen/thermalanomalien-firms/', 'so entstehen Fehlalarme aus Industrie')}; Bestätigung nur mit Quelle.`,
        `Unwetterlage: ${a('/wetterkarte/zellbahnen', 'Zellbahnen')} mit Ankunftszeit, ${a('/wetterkarte/boeen', 'Böenkarte')}, ${a('/regenradar', 'Regenradar')}.`,
        `Amtliche Lage im Wortlaut: ${a('/warnungen', 'Warnungen')}; die amtlichen Meldewege (NINA/MoWaS, Alertswiss, Landes-Einsatzübersichten) sind im Brandradar verlinkt.`,
        `Rechenregeln: ${a('/methodik/brandradar-detektion-und-brandnarben/', 'Brandradar: Detektion, Bestätigung und Brandnarben')}.`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        '<strong>Kein Einsatzsystem und keine Alarmierung.</strong> buscosun ersetzt weder Leitstelle noch Funk noch Einsatzleitsoftware und ist rechtlich nicht für behördliche oder sicherheitskritische Entscheidungen gebaut.',
        '<strong>MoWaS/NINA werden nur verlinkt, nicht ausgewertet</strong> (Lizenz). Auch Alertswiss und die Landes-Einsatzübersichten sind reine Links.',
        '<strong>Hotspots sind unbestätigt</strong>, bis EFFIS, Copernicus EMS oder eine amtliche Warnung im selben Satz stehen. Ein Punkt ist eine Satellitenmessung, keine Einsatzmeldung; kleine Bodenfeuer unter der Pixelgröße bleiben unsichtbar — „keine Hotspots" heißt nicht „keine Brände".',
        'Keine Brandursache (keine Quelle liefert sie), kein Frontverlauf, keine Ausbreitungsprognose; die Verschiebung ist nur die Wanderung des Strahlungsschwerpunkts zwischen Überflügen.',
        'Amtliche Warnflächen nur für Deutschland und die Schweiz; Zellbahnen und Blitzkarte Deutschland-fokussiert; Österreich ohne offene Waldbrandstufe. ' + NO_WARNING,
        NO_PUSH + ' Kein Konto, keine API, keine Verfügbarkeitszusage.',
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Gefahrenindex: Copernicus GWIS/ECMWF (8 km) für DE, AT, CH. Nationale Skalen: DWD (Deutschland) und BAFU (Schweiz); für Österreich keine offene amtliche Stufe. Detektionen: NASA FIRMS (VIIRS 375 m) mit GWIS-Notbetrieb; Kartierung Copernicus EFFIS; Aktivierungen Copernicus EMS; Satellitenbilder Sentinel-2 und Landsat. Bodentrockenheit und Feuchte: ICON-D2 (DWD). Amtliche Warnungen: DWD (CAP) für Deutschland, MeteoSchweiz über MeteoAlarm für die Schweiz; für Österreich nennt das Panel GeoSphere Austria, und GeoSphere-Warntexte im Brandradar sind Kontext, nie Brandbestätigung. Behördenlinks: NINA/MoWaS (DE), Einsatzübersichten Oberösterreich und Burgenland (AT), Alertswiss (CH).') },
    ],
    faqs: [
      { q: 'Kann buscosun mich alarmieren?', a: 'Nein. Es gibt keinen Server, keine Push-Nachricht und keine Anbindung an Leitstellen oder MoWaS. buscosun ist ein Lagebild bei geöffneter App.' },
      { q: 'Ist ein Hotspot ein bestätigter Brand?', a: 'Nein. Ein Hotspot ist eine Satellitendetektion. Bestätigt heißt ein Brand nur mit EFFIS-Kartierung, Copernicus-EMS-Aktivierung oder amtlicher Warnung im selben Satz; unbestätigt ist der Normalfall.' },
      { q: 'Wertet buscosun MoWaS-Warnungen aus?', a: 'Nein, sie werden aus Lizenzgründen nur verlinkt. Wetterwarnungen des DWD und von MeteoSchweiz erscheinen als Flächen mit wörtlichem Text.' },
      { q: 'Warum fehlt für Österreich eine Waldbrandstufe?', a: 'Weil es keine offene amtliche Landesstufe gibt. buscosun zeigt den EU-Index auch über Österreich, überträgt aber keine deutsche oder Schweizer Skala.' },
    ],
    related: ['/waldbrand/gefahrenindex', '/waldbrand/aktive-braende', '/methodik/brandradar-detektion-und-brandnarben/', '/wetterkarte/zellbahnen', '/warnungen', '/funktionen/waldbrandgefahr/'],
  },
  // ---------------------------------------------------------------------------
  // Belege: src/pointForecast/foehnDetector.ts (Südsektor 135–225°, ≳ 5 m/s, Böigkeit, trockene Luft; nur Alpenraum, nördlich
  // von 49,2° N Score 0), src/route/weatherAggregate.ts + WeatherSummary.tsx (Föhn entlang der Tour),
  // AtmosphereDeck.tsx. Föhn-Ansicht mit Index und Isentropen: zurückgezogen 01.11.2026. Keine Gesundheitsaussagen (Regel).
  // ---------------------------------------------------------------------------
  {
    slug: 'wetterfuehlige',
    title: 'Für Wetterfühlige',
    updated: '2026-11-01',
    h1: 'buscosun für Wetterfühlige und Föhn-Geplagte: Wind, Temperatur und Föhn erklärt, ohne Gesundheitsaussagen',
    description: 'Wind in der Höhe, Böen, Temperatur und Feuchte je Stunde, dazu Föhn verständlich erklärt — kein Föhn-Index, kein Biowetter, keine Gesundheitsaussagen.',
    answer: 'buscosun zeigt Wetterfühligen die Größen, an denen sich eine Föhnlage ablesen lässt: Wind in der Höhe auf der Windkarte und im Vertikalschnitt, Böen im Tal, Temperatur und Feuchte je Stunde. Einen Föhn-Index oder eine Aussage „heute Föhn" für deinen Ort gibt es nicht; nur die Tourenplanung kennzeichnet Föhnverdacht entlang einer Strecke. Was das Wetter mit dem Körper macht, sagt buscosun nicht: Es gibt kein Biowetter und keine Gesundheitsaussage.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Die <strong>Windkarte</strong> mit Umschaltung auf 850 und 700 hPa zeigt großräumig, ob Südwind gegen die Alpen weht, die <strong>Böenkarte</strong> bis +24 h die Böen im Tal, und der Punktforecast nennt Temperatur, Feuchte und Wind stündlich. Steigt die Temperatur bei fallender Feuchte und auffrischendem Südwind, passt das zum typischen Bild einer Föhnlage. Diese Einschätzung triffst du selbst; buscosun gibt für einen Ort kein Urteil dazu aus.') +
        p('Der <strong>Vertikalschnitt</strong> der Atmosphäre-Ansicht zeigt den Wind über dem Gelände entlang einer Linie, die du auf der Karte ziehst. Läuft sie quer über den Alpenkamm, siehst du, wie stark es in der Höhe weht und wie der Wind sich mit der Zeit ändert. Das Absinken der Luft im Lee zeigt er nicht, und eine Föhnstärke rechnet er nicht aus.') +
        p('In der <strong>Tourenplanung</strong> erscheint ein Föhn-Hinweis mit Kilometerspanne, wenn Streckenabschnitte Föhnverdacht melden. Das ist eine transparente Heuristik aus Windrichtung (Südsektor), Windstärke, Böigkeit und trockener Luft, nur für den Alpenraum, und keine amtliche Aussage. Die Wissensseiten erklären <a href="/wissen/foehn/">Föhn</a> und <a href="/wissen/temperaturinversion/">Inversion</a> allgemeinverständlich.') },
      { h2: 'So nutzt du buscosun bei Wetterfühligkeit', html: ol([
        `Prüfe auf der ${a('/wetterkarte/wind', 'Windkarte')} in 850 hPa den Südwind über den Alpen und auf der ${a('/wetterkarte/boeen', 'Böenkarte')} die Böen im Tal.`,
        `Lies für deinen Ort — etwa ${a('/wetter/innsbruck/', 'Innsbruck')}, ${a('/wetter/chur/', 'Chur')}, ${a('/wetter/garmisch-partenkirchen/', 'Garmisch')} oder ${a('/wetter/muenchen/', 'München')} — Temperatur, Feuchte und Wind je Stunde in der ${a('/vorhersage', 'Vorhersage')}.`,
        `Ziehe im ${a('/atmosphaere/querschnitt', 'Vertikalschnitt')} eine Linie quer über den Kamm, um den Wind in der Höhe zu sehen.`,
        `Fahre im Zeit-Schieber voraus, um zu sehen, wann der Höhenwind dreht.`,
        `Hintergrund: ${a('/wissen/foehn/', 'Föhn')}, ${a('/wissen/temperaturinversion/', 'Temperaturinversion')} und ${a('/wissen/biowetter/', 'warum buscosun kein Biowetter zeigt')}.`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        'Kein Biowetter, kein Gesundheitsindex, keine Aussage über Kopfschmerz, Kreislauf oder Schlaf. buscosun zeigt die Wetterlage; wie sie sich auf dich auswirkt, weißt du selbst — oder fragst medizinischen Rat.',
        'Kein Föhn-Index und keine Aussage „heute Föhn" für einen Ort, kein Isentropen-Schnitt und keine Dauerprognose der Föhnlage. Der Föhnverdacht der Tourenplanung gilt nur entlang einer hochgeladenen Strecke.',
        'Keine Luv-Lee-Druckdifferenz als Anzeige. Nordföhn und Föhn außerhalb der Alpen sind nicht abgebildet.',
        'Die Modelle glätten Föhntäler wie das Wipptal oder das Rheintal; der Beginn des Durchbruchs im Tal kann Stunden abweichen.',
        'Keine amtliche Föhn-Warnung und keine Föhn-Statistik („wie oft im Jahr"); das Archiv kennt Wind, aber keinen Föhn-Marker.',
        NO_PUSH,
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Wind und Böen kommen für Deutschland, Österreich und die Schweiz aus ICON-D2 (DWD, 2,2 km), die Druckflächen der Windkarte aus ICON-EU (rund 7 km), die Werte je Höhe im Vertikalschnitt aus dem Höhen-Cube mit den ICON-D2-Modellflächen. Der Punktforecast nutzt die nächsten Messstationen (DWD, TAWES, SMN). Der Föhnverdacht der Tourenplanung ist auf Alpen-Südföhn ausgelegt, also Nordtirol, Vorarlberg, Ostschweiz und das Bayerische Oberland. Amtliche Warnungen, etwa Sturmwarnungen bei Föhnsturm, erscheinen als Flächen nur für Deutschland und die Schweiz.') },
    ],
    faqs: [
      { q: 'Sagt buscosun, ob ich heute Föhn-Kopfschmerzen bekomme?', a: 'Nein. buscosun macht keine Gesundheitsaussagen und hat kein Biowetter.' },
      { q: 'Zeigt buscosun, ob heute Föhn ist?', a: 'Nicht als Urteil für einen Ort. Du siehst Wind in der Höhe, Böen, Temperatur und Feuchte und kannst daraus selbst schließen. Nur die Tourenplanung kennzeichnet Föhnverdacht, und zwar entlang einer hochgeladenen Strecke.' },
      { q: 'Woran erkennt die Tourenplanung Föhnverdacht?', a: 'An einer Heuristik aus Wind aus dem Südsektor, kräftigem und böigem Wind und trockener Luft, nur im Alpenraum. Sie ist ein Hinweis, keine amtliche Aussage.' },
      { q: 'Gilt das auch für Nordföhn im Tessin?', a: 'Nein. Die Heuristik ist auf Alpen-Südföhn ausgelegt; Nordföhn auf der Alpensüdseite bildet sie nicht ab.' },
    ],
    related: ['/wissen/foehn/', '/wissen/temperaturinversion/', '/wissen/biowetter/', '/atmosphaere/querschnitt', '/wetterkarte/wind', '/wetter/innsbruck/'],
  },
  // ---------------------------------------------------------------------------
  // Belege: src/sources/dwdPollen.ts (8 Arten Hasel, Erle, Esche, Birke, Gräser,
  // Roggen, Beifuß, Ambrosia; Skala 0–6 mit Halbstufen; heute/morgen/übermorgen;
  // ~11 Regionen; Veröffentlichung ~11 Uhr; DE only), src/sources/openMeteoPollen.ts
  // (CAMS via Open-Meteo, Erle, Birke, Gräser, Beifuß, Ambrosia, Olive; Körner/m³
  // auf 0–6 gemappt, „gängige Richtwerte, keine medizinische Aussage", NUR Opt-in),
  // PointForecastPanel.tsx (DE-only, Opt-in-Schalter). Keine Gesundheitsaussagen.
  // ---------------------------------------------------------------------------
  {
    slug: 'allergiker',
    title: 'Für Allergiker',
    h1: 'buscosun für Pollenallergiker: DWD-Pollenflug für Deutschland, ehrliche Lücke für Österreich und die Schweiz',
    description: 'Pollenflug-Index des DWD für Deutschland; für Österreich und die Schweiz nur eine ausdrücklich zugeschaltete CAMS-Schätzung — dazu Wind und Regen als Kontext.',
    answer: 'buscosun zeigt Pollenallergikern in Deutschland den amtlichen Pollenflug-Gefahrenindex des DWD für acht Arten — Hasel, Erle, Esche, Birke, Gräser, Roggen, Beifuß, Ambrosia — auf der Skala 0 bis 6 für heute, morgen und übermorgen. Für Österreich und die Schweiz gibt es keinen offenen amtlichen Feed; dort bietet buscosun nur auf ausdrücklichen Wunsch eine Schätzung aus dem Copernicus-Dienst CAMS und sagt das im Panel. Gesundheitsratschläge gibt es keine.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Im <strong>Punktforecast-Panel</strong> der Wetterkarte erscheint für deutsche Orte der <strong>Pollenflug-Gefahrenindex des DWD</strong>: täglich gegen 11 Uhr veröffentlicht, für rund elf Vorhersageregionen und acht Arten — Hasel, Erle, Esche, Birke, Gräser, Roggen, Beifuß und Ambrosia — mit je einem Wert für heute, morgen und übermorgen auf der Skala 0 bis 6, inklusive Halbstufen wie „1–2" für Grenztage. Die Farben und Bezeichnungen sind die des DWD; buscosun rechnet nichts um und fügt nichts hinzu. Die Daten sind frei (CC BY 4.0) und gelten je Region, nicht je Straße.') +
        p('Für <strong>Österreich und die Schweiz</strong> gibt es keinen vergleichbaren offenen Datensatz: GeoSphere führt Pollen intern, MeteoSchweiz nur im Abonnement. Statt deutsche Werte über die Grenze zu übertragen, zeigt buscosun die Lücke — und bietet als ausdrücklich zuzuschaltende Option Konzentrationen aus dem Copernicus-Dienst CAMS über Open-Meteo (Erle, Birke, Gräser, Beifuß, Ambrosia, Olive in Körnern je Kubikmeter), die auf dieselbe 0-bis-6-Anzeige abgebildet werden. Die Schwellen dafür sind gängige Richtwerte, keine medizinische Aussage, und der Schalter ist nie voreingestellt: Erst dein Opt-in löst den Abruf aus.') +
        p('Als Kontext zeigt die Wetterkarte, was den Pollenflug am Tag steuert: die <strong>Windkarte</strong> mit Richtung und Stärke, das <strong>Regenradar</strong> mit der Ankunftszeit des nächsten Schauers am Standort und der Punktforecast mit Feuchte und Temperatur stündlich. Der UV-Tagespeak des DWD ergänzt das Panel — ebenfalls nur für Deutschland, für AT und CH als Klarhimmel-Schätzung gekennzeichnet.') },
      { h2: 'So nutzt du buscosun als Allergiker', html: ol([
        `Öffne die ${a('/wetterkarte', 'Wetterkarte')}, suche deinen Ort — etwa ${a('/wetter/berlin/', 'Berlin')}, ${a('/wetter/koeln/', 'Köln')} oder ${a('/wetter/stuttgart/', 'Stuttgart')} — und öffne das Punktforecast-Panel; der DWD-Pollenflug steht in der Übersicht.`,
        `Lies die acht Arten für heute, morgen und übermorgen; die Skala ist die des DWD (0 keine Belastung bis 6).`,
        `In Österreich oder der Schweiz — etwa ${a('/wetter/wien/', 'Wien')} oder ${a('/wetter/zuerich/', 'Zürich')} — zeigt das Panel die Lücke; die CAMS-Schätzung erscheint nur, wenn du sie ausdrücklich einschaltest.`,
        `Prüfe die ${a('/wetterkarte/wind', 'Windkarte')} und das ${a('/regenradar', 'Regenradar')}: Regen wäscht aus, trockener Wind trägt weit.`,
        `Warum buscosun kein Biowetter zeigt: ${a('/wissen/biowetter/', 'Biowetter')}; wie der Punktforecast entsteht: ${a('/methodik/punktvorhersage-quellenmix/', 'Quellenmix')}.`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        'Keine Gesundheitsaussagen: keine Symptomprognose, keine Medikamenten- oder Verhaltensempfehlung, kein Biowetter. Der Index ist der des DWD; was er für dich bedeutet, klärst du mit ärztlichem Rat.',
        'Kein amtlicher Pollenflug für Österreich und die Schweiz — nur die CAMS-Schätzung per Opt-in, deren Schwellen Richtwerte sind. Die Anzeige sagt das.',
        'Der DWD-Index gilt je Vorhersageregion (rund elf in Deutschland), nicht je Ort; buscosun ordnet deinen Ort der Region zu.',
        'Kein Pollen-Tagebuch, keine persönliche Belastungskurve, keine Standort-Messung (kein Pollenfallen-Netz in der App).',
        'Der Opt-in für AT/CH sendet eine Anfrage an Open-Meteo — das ist der einzige Fall, in dem Pollen-Daten von einem nicht-amtlichen Dienst kommen, und er ist nie voreingestellt. ' + NO_PUSH,
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Deutschland: DWD-Pollenflug-Gefahrenindex (opendata.dwd.de, CC BY 4.0, täglich gegen 11 Uhr, acht Arten, drei Tage, rund elf Regionen) und DWD-UV-Tagespeak. Österreich und Schweiz: kein offener amtlicher Feed; auf Wunsch Copernicus CAMS über Open-Meteo (sechs Arten als Konzentration, Opt-in, nie Standard), UV als Klarhimmel-Schätzung. Wind, Regen und Feuchte kommen für alle drei Länder aus ICON-D2, den Landesradaren (RADOLAN-RV, INCA, MeteoSchweiz) und den Messstationen (DWD, TAWES, SMN). buscosun sagt die Asymmetrie im Panel, statt sie zu kaschieren.') },
    ],
    faqs: [
      { q: 'Welche Pollenarten zeigt buscosun?', a: 'In Deutschland die acht Arten des DWD-Index: Hasel, Erle, Esche, Birke, Gräser, Roggen, Beifuß, Ambrosia — für heute, morgen und übermorgen auf der Skala 0 bis 6.' },
      { q: 'Gibt es Pollenflug für Österreich und die Schweiz?', a: 'Keinen amtlichen. Auf ausdrücklichen Wunsch zeigt buscosun eine CAMS-Schätzung (Erle, Birke, Gräser, Beifuß, Ambrosia, Olive) mit Richtwert-Schwellen — nie voreingestellt.' },
      { q: 'Gibt buscosun Tipps gegen Heuschnupfen?', a: 'Nein. buscosun macht keine Gesundheitsaussagen und kein Biowetter; es zeigt den amtlichen Index und das Wetter, das ihn steuert.' },
      { q: 'Wie aktuell ist der DWD-Pollenflug?', a: 'Der DWD veröffentlicht ihn täglich gegen 11 Uhr für den Tag, den Folgetag und den übernächsten Tag; buscosun holt die Datei beim Öffnen des Panels.' },
    ],
    related: ['/wetterkarte', '/wissen/biowetter/', '/methodik/punktvorhersage-quellenmix/', '/wetterkarte/wind', '/regenradar', '/fuer/wetterfuehlige/'],
  },
  // ---------------------------------------------------------------------------
  // Belege: src/sources/iconD2Snow.ts (Schneedecke h_snow, Neuschnee snow_gsp +
  // snow_con via SWE→cm, Step 0 = 0), src/scalar/snowLine.ts (T50 ≈ +1 °C +
  // Ortskorrektur, Lapse 0,0065), methodik.mjs (Niederschlagsart aus DEM +
  // Schneefallgrenze mit Übergangsband, Tal/Grat-Nowcast, Bewegungsarten ohne
  // Skitour), src/avalanche.ts (≥ 1 000 m), radar/radarModel (B1 Phasen als
  // Heuristik), history Kenntage (Frost/Eis).
  // ---------------------------------------------------------------------------
  {
    slug: 'wintersport',
    title: 'Für Wintersport',
    h1: 'buscosun für Skitour, Piste, Langlauf und Winterdienst: Neuschnee, Schneefallgrenze, Tal und Grat',
    description: 'Schneedecke und Neuschnee aus ICON-D2, Schneefallgrenze als Linie im Gelände, Regen oder Schnee im Radar — kein Lawinenlagebericht, keine Pistendaten.',
    answer: 'buscosun zeigt Wintersportlern die Schneedecke und den Neuschnee aus ICON-D2 als Fläche, die Schneefallgrenze als Linie im Gelände, im Regenradar die Niederschlagsart aus Geländehöhe und Schneefallgrenze mit getrenntem Tal- und Gratwert und die höhenkorrigierte Temperatur je Bildpunkt. Für die Lawinenlage verlinkt es ab 1 000 m den amtlichen Lagebericht. Pistenstatus, Liftbetrieb und gemessene Schneehöhen der Skigebiete gibt es nicht.',
    jsonLdType: 'WebPage',
    sections: [
      { h2: 'Was du hier bekommst', html:
        p('Die <strong>Schneekarte</strong> zeigt die Schneemenge aus ICON-D2 (DWD, 2,2 km) in zwei Modi: „Schneedecke" ist die aktuelle Schneehöhe des Modells (Feld h_snow, in cm), „Neuschnee" die seit Laufbeginn akkumulierte Schneefallsumme (snow_gsp plus snow_con), aus dem Wasseräquivalent mit der Modell-Schneedichte in Zentimeter umgerechnet — die Summe wächst mit dem Horizont, Stunde 0 ist strukturell null. Beides sind Modellwerte, keine Messung an einer Station.') +
        p('Die <strong>Schneefallgrenze</strong> ist eine Linie im Gelände: Aus dem je Bildpunkt höhenkorrigierten Temperaturfeld (Lapse-Rate 6,5 K/km gegen das 30-m-Geländemodell) wird die Null-Linie von T_korr − T50 gezogen, wobei T50 ein physikalischer Anker um +1 °C plus eine gelernte Ortskorrektur ist. Im <strong>Regenradar</strong> leitet buscosun die Niederschlagsart (Regen, Schnee, Graupel, Hagel) aus Geländehöhe gegen die regionale Schneefallgrenze mit weichem Übergangsband ab — ausdrücklich eine Heuristik, denn Radar misst Reflektivität, keine Phase — und trennt im Alpenraum Tal und Grat: Der Gratwert ist eine Hochrechnung über die Lapse-Rate und so gekennzeichnet. Der Layer „Radarsicht" zeigt, wo Gebirge das Radar abschattet.') +
        p('Die <strong>Temperaturkarte</strong> zeigt die Kälte am Grat statt der Modellglättung, die Böenkarte die Verfrachtung bis +24 h, der Vertikalschnitt den Wind über dem Grat. Ab 1 000 m Ortshöhe verlinkt der Punktforecast den amtlichen <strong>Lawinenlagebericht</strong> (SLF, lawinen.report, Lawinenwarndienst Bayern, EAWS). Das Wetterarchiv nennt Frost- und Eistage je Jahr.') },
      { h2: 'So nutzt du buscosun im Wintersport', html: ol([
        `Öffne die ${a('/wetterkarte/schnee', 'Schneekarte')}, wähle Schneedecke oder Neuschnee und fahre den Zeit-Schieber durch die nächsten Stunden.`,
        `Lege die ${a('/wetterkarte/schneegrenze', 'Schneefallgrenze')} darüber und prüfe die ${a('/wetterkarte/temperatur', 'Temperaturkarte')} am Grat — ${a('/wissen/schneefallgrenze/', 'so entsteht die Linie')}.`,
        `Vor der Abfahrt ins Tal das ${a('/regenradar', 'Regenradar')}: Regen oder Schnee, Tal und Grat getrennt, plus ${a('/wissen/regenradar-radolan-inca-rzc/', 'was die drei Landesradare unterscheiden')}.`,
        `Für Skitouren im Punktforecast der Karte den Lawinen-Link (ab 1 000 m) öffnen und die ${a('/wetterkarte/boeen', 'Böenkarte')} für Verfrachtung prüfen; Tourdatei in die ${a('/tourenplanung', 'Tourenplanung')} laden (Bewegungsart Bergwandern).`,
        `Wind am Grat? ${a('/atmosphaere/querschnitt', 'Vertikalschnitt')} mit einer Linie quer über den Kamm. Zum Nebelmeer: ${a('/wissen/temperaturinversion/', 'Temperaturinversion')}, eine eigene Anzeige dafür gibt es nicht.`,
      ]) },
      { h2: 'Was buscosun hier nicht kann', html: ul([
        'Kein Lawinenlagebericht: buscosun modelliert keine Lawinengefahr und verlinkt ab 1 000 m die amtliche Quelle; die Bulletins sind saisonal.',
        'Keine Pisten-, Lift- oder Loipendaten, keine gemessenen Schneehöhen der Skigebiete, keine Schneequalität — Schneedecke und Neuschnee sind ICON-D2-Modellwerte.',
        'Keine eigene Bewegungsart für Skitour oder Langlauf in der Tourenplanung (die acht Arten reichen von Wandern bis E-Bike); Bergwandern ist die nächstliegende Näherung, ohne Aufstiegs-Fell-Faktor.',
        'Die Niederschlagsart im Radar ist eine Ableitung aus Höhe und Schneefallgrenze, keine Messung der Phase; Graupel und Hagel sind Heuristiken.',
        'Kein Glätte- oder Streumodell für den Winterdienst; Schneefallgrenze im Tourenergebnis nur für AT und CH, amtliche Warnungen nur für DE. ' + NO_WARNING,
        NO_PUSH,
      ]) },
      { h2: 'Datenquellen und Länder', html:
        p('Schneekarte, Schneefallgrenze und Temperatur rechnen für DE, AT und CH auf ICON-D2 (DWD, 2,2 km) mit dem Terrarium-Geländemodell (rund 30 m). Das Regenradar nutzt RADOLAN-RV in Deutschland (25 Frames im 5-Minuten-Takt bis 2 h), INCA in Österreich (12 Frames im 15-Minuten-Takt bis 3 h) und das MeteoSchweiz-Radar als Analyse; die Schweiz liefert keine Nowcast-Frames. Lawinen: SLF (CH), lawinen.report (AT), Lawinenwarndienst Bayern (DE), dazu EAWS. Der Punktforecast nutzt für AT/CH zusätzlich C-LAEF für die Schneefallgrenze. Amtliche Warnflächen gibt es für DE und CH.') },
    ],
    faqs: [
      { q: 'Ist die Schneehöhe gemessen?', a: 'Nein. Die Schneekarte zeigt Modellwerte aus ICON-D2 (Schneedecke h_snow, Neuschnee aus snow_gsp und snow_con). Stationsmessungen der Skigebiete gibt es nicht.' },
      { q: 'Zeigt buscosun die Lawinenwarnstufe?', a: 'Nein, sie wird nicht modelliert. Ab 1 000 m Ortshöhe verlinkt der Punktforecast SLF, lawinen.report oder den Lawinenwarndienst Bayern sowie EAWS.' },
      { q: 'Woher weiß das Regenradar, ob Schnee fällt?', a: 'Aus der Geländehöhe gegen eine regionale Schneefallgrenze mit Übergangsband — eine Ableitung, keine Radarmessung der Phase. Tal und Grat werden getrennt ausgewiesen.' },
      { q: 'Gibt es eine Bewegungsart Skitour?', a: 'Nein. Die Tourenplanung kennt acht Arten von Wandern bis E-Bike; für Skitouren ist Bergwandern die Näherung, ohne eigenen Aufstiegsfaktor.' },
    ],
    related: ['/wetterkarte/schnee', '/wetterkarte/schneegrenze', '/wissen/schneefallgrenze/', '/regenradar', '/methodik/hoehenkorrektur/', '/fuer/bergsport/'],
  },
];

/** /fuer/<slug>/ — nutzt den Artikel-Renderer der Methodik unverändert (gleiche Seitenform). */
export function renderAudiencePage(page, updated) {
  // E10: eigene OG-Karte je Zielgruppe, solange sie existiert (sonst die Bereichs-Karte).
  return renderArticlePage(page, { hub: { path: '/fuer/', name: 'Für wen' }, updated, ogImage: ogImageOr(`fuer-${page.slug}`, undefined) });
}

/** /fuer/-Hub: CollectionPage + BreadcrumbList, Karten je Zielgruppe — nach dem Muster von renderMethodikHub. */
export function renderAudienceHub(pages, updated) {
  const canonicalPath = '/fuer/';
  const description = 'Gleitschirm, Bergsport, Rad und E-Bike, Segeln, Drohne, Bau und Kran, Landwirtschaft, Events und Hochzeit, Foto und Astronomie, Feuerwehr, Wetterfühlige, Allergiker, Wintersport — was buscosun je Anwendung kann und was nicht.';
  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Für wen', url: SITE.url + canonicalPath, description, inLanguage: 'de-DE', ...(updated ? { dateModified: updated } : {}) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Start', item: SITE.url + '/' },
      { '@type': 'ListItem', position: 2, name: 'Für wen', item: SITE.url + canonicalPath },
    ] },
  ];
  const head = headBlock({
    title: `buscosun für …: Wetter nach Anwendung | ${SITE.name}`,
    description, canonicalPath, locale: 'de-DE', ogImage: ogImageOr('fuer', DEFAULT_OG_IMAGE), jsonLd,
  });
  const cards = pages.map((pg) => `<a href="/fuer/${pg.slug}/" class="card"><strong>${escapeHtml(pg.title)}</strong><span>${escapeHtml(pg.description)}</span></a>`).join('\n      ');
  return `<!doctype html>
<html lang="de">
  <head>
${head}
    <style>${PAGE_CSS}
.cards{display:grid;gap:.8rem}@media(min-width:560px){.cards{grid-template-columns:1fr 1fr}}
.card{display:flex;flex-direction:column;gap:.3rem;background:#fff;border:1px solid var(--border);border-radius:12px;padding:.9rem 1rem;text-decoration:none;color:var(--ink)}
.card span{font-size:.88rem;color:var(--stone)}</style>
  </head>
  <body>
    <main class="wrap">
      <nav class="bc" aria-label="Brotkrumen"><a href="/">Start</a> › Für wen</nav>
      <h1>buscosun für …: Wetter nach Anwendung</h1>
      <p class="lead">Dieselben Daten, aber nicht dieselbe Frage: Ein Gleitschirmflieger braucht den Höhenwind, ein Kranführer die Böe auf Arbeitshöhe, ein Winzer den Hagel und die Bodenfeuchte, ein Hochzeitspaar den Plan B. Diese Seiten sagen je Anwendung, was buscosun konkret tut, wie man es nutzt — und was es ausdrücklich nicht kann: kein Briefing, keine Alarmierung, keine amtliche Warnung, keine Gesundheitsaussage. Die Länderunterschiede zwischen Deutschland, Österreich und der Schweiz stehen dabei, statt kaschiert zu werden.</p>
      <div class="cards">
      ${cards}
      </div>
      <section><h2>Verwandt</h2><div class="links"><a href="/funktionen/">Funktionen</a><a href="/methodik/">Methodik</a><a href="/wissen/">Wetterwissen</a><a href="/glossar/">Glossar</a><a href="/ueber/">Über buscosun</a><a href="/ohne-tracker/">Ohne Tracker</a></div></section>
      <footer>
        ${escapeHtml(SITE.name)} — ${escapeHtml(SITE.tagline)}. Datenbasis: Deutscher Wetterdienst (DWD, GeoNutzV) · GeoSphere Austria · MeteoSwiss. Keine Tracker, keine Werbung.
        <a href="/ueber/">Über buscosun</a> · <a href="/methodik/">Methodik</a> · <a href="/lizenzen/">Quellen &amp; Lizenzen</a> · <a href="/impressum/">Impressum</a> · <a href="/datenschutz/">Datenschutz</a>
      </footer>
    </main>
  </body>
</html>
`;
}
