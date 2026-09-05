/**
 * Methodik-, Über- und Trackerfrei-Seiten (SEO/GEO 2026, E3) — build-only.
 *
 * /methodik/<slug>/ erklärt, WIE buscosun rechnet: Quellen, Formeln, Schwellen,
 * Grenzen — jede Zahl stammt aus einer Code-Konstante (Belegstelle im Kommentar).
 * /ueber/ und /ohne-tracker/ sind die Entitäts- und Vertrauensseiten.
 *
 * Regeln: keine Live-Werte (veralten), keine Warnsprache, „bestätigt" nur mit
 * Quelle im selben Satz, Grenzen immer benannt (D-04). Betreiberdaten kommen
 * ausschließlich aus legal.mjs (nie erfunden).
 */
import { CONTACTED_HOSTS, STORAGE_GROUPS, OPERATOR, TODO } from './legal.mjs';
import { readModelCatalog } from './licenses.mjs';

export const METHODIK_UPDATED = '2026-09-05';

const p = (s) => `<p>${s}</p>`;
const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const table = (head, rows) => `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

/** Gemeinsamer Grenzen-Hinweis. */
const NO_WARNING = 'buscosun gibt keine amtlichen Warnungen heraus; maßgeblich bleiben DWD, GeoSphere Austria und MeteoSchweiz.';

export const METHODIK_PAGES = [
  {
    slug: 'hoehenkorrektur',
    title: 'Höhenkorrektur',
    h1: 'Wie buscosun die Temperatur auf das echte Gelände umrechnet',
    description: 'Lapse-Rate, Geländemodell und Shader: warum buscosun in den Alpen andere Temperaturen zeigt als das Modell — und wo die Korrektur an ihre Grenze kommt.',
    answer: 'buscosun korrigiert die 2-Meter-Temperatur des Modells ICON-D2 an jedem Bildpunkt auf die tatsächliche Geländehöhe: Das Modell rechnet auf einer geglätteten 2,2-km-Oberfläche, ein digitales Geländemodell mit etwa 30 Metern Auflösung liefert die echte Höhe, und die Differenz wird mit einer Lapse-Rate von 6,5 K je Kilometer umgerechnet. Im Punktforecast wird die Lapse-Rate zusätzlich aus den umliegenden Stationen geschätzt, statt fest angenommen.',
    sections: [
      { h2: 'Das Problem', html: p('Ein Wettermodell wie ICON-D2 des DWD rechnet auf einem Gitter von 2,2 km. Seine Modelloberfläche ist eine geglättete Landschaft: Ein 2 500 m hoher Gipfel und das 700 m tiefe Tal daneben teilen sich womöglich eine Gitterzelle auf 1 400 m. Die Modelltemperatur gilt für diese Zwischenhöhe — für den Gipfel ist sie zu warm, für das Tal zu kalt. Genau das ist der Grund, warum Wetter-Apps im Gebirge so oft daneben liegen.') },
      { h2: 'Die Korrektur auf der Karte', html: p('Die Temperaturkarte legt unter jedes Modellpixel ein digitales Geländemodell (Mapzen/AWS Terrarium, rund 30 m Auflösung im DACH-Raum). Die Modellhöhe (Feld <code>hsurf</code>) steckt als Grünkanal in derselben Textur wie die Temperatur; der Grafik-Shader rechnet je Bildpunkt <code>T_korr = T_modell − γ · (h_gelände − h_modell)</code> mit γ = 6,5 K/km. Die Stadt-Labels auf der Karte werden mit exakt derselben Arithmetik berechnet — was am Label steht, ist der Wert der Fläche darunter, kein separater Punktwert.') + p('Dieselbe Idee steckt in der Schneefallgrenze (Null-Linie von <code>T_korr − T50</code> im Gelände), im Tal/Grat-Nowcast des Regenradars und in der Wolkenkomposition, die die Stockwerke höhenbewusst übereinanderlegt.') },
      { h2: 'Die Korrektur im Punktforecast', html: p('Für einen einzelnen Ort geht buscosun einen Schritt weiter: Aus dem Satz der nächsten Messstationen (DWD, TAWES, SMN) wird die Lapse-Rate per Regression geschätzt — sie schwankt real zwischen etwa 3 und 10 K/km je nach Wetterlage. Liefert der Stationssatz keine belastbare Steigung, greift der Standardwert 0,0065 K/m. Die Tourenplanung bündelt ihre Wetterpunkte deshalb nicht nur räumlich (6, 10 oder 14 km je Gelände), sondern zusätzlich in Höhenbändern von 300 m — ohne diese Bänderung lagen Talwerte im Test bis zu 4 °C zu kalt.') },
      { h2: 'Grenzen', html: ul([
        'Eine Lapse-Rate ist ein Mittelwert. Bei <strong>Inversionen</strong> (Kaltluftsee im Tal, Sonne am Berg) kehrt sich das Verhältnis um; die Flächenkarte kann das Tal dann zu warm zeigen. Die Atmosphäre-Ansicht erkennt Inversionen und nennt Inversionshöhe und Nebelobergrenze.',
        'Das Geländemodell kennt weder Gebäude noch Bewuchs; in Städten ist der Wärmeinseleffekt nicht enthalten.',
        'Korrigiert wird die Temperatur, nicht der Wind: Düsen und Kuppen unter 2 km Gitterweite bleiben geglättet.',
        'Modellwert, keine Messung. Der Stationslayer zeigt die Messung daneben.',
      ]) },
    ],
    faqs: [
      { q: 'Welche Lapse-Rate nutzt buscosun?', a: 'Auf der Karte fest 6,5 K je Kilometer; im Punktforecast eine aus den umliegenden Stationen geschätzte Rate mit 6,5 K/km als Rückfall.' },
      { q: 'Woher kommt das Geländemodell?', a: 'Aus den Terrarium-Höhenkacheln von Mapzen/AWS (Open Data), rund 30 m Auflösung in DACH.' },
      { q: 'Warum zeigt die Karte im Tal trotzdem manchmal zu warm?', a: 'Bei Inversionen ist die Luft im Tal kälter als in der Höhe; eine Lapse-Rate kann das nicht abbilden. Die Atmosphäre-Ansicht zeigt solche Lagen.' },
    ],
    related: ['/wetterkarte/temperatur', '/wetterkarte/schneegrenze', '/wissen/hoehenkorrektur-lapse-rate/', '/wissen/temperaturinversion/'],
  },
  {
    slug: 'punktvorhersage-quellenmix',
    title: 'Punktvorhersage: der Quellenmix',
    h1: 'Wie der Punktforecast aus Stationen, MOSMIX, AROME und Radar eine Vorhersage mischt',
    description: 'Welche Quellen der Punktforecast von buscosun je Land verwendet, wie sie gewichtet werden und wie die Konfidenz je Variable entsteht.',
    answer: 'Der Punktforecast von buscosun mischt für jeden Ort die nächsten amtlichen Messstationen (DWD, TAWES, SMN), die DWD-Stationsvorhersage MOSMIX, für Österreich und die Schweiz die GeoSphere-Modelle AROME und INCA sowie das Radar-Nowcast — gewichtet nach Vorlaufzeit, an den Live-Messwerten verankert und mit einer Konfidenz je Variable aus der Streuung der Quellen. Open-Meteo wird bewusst nicht als Standardquelle benutzt.',
    sections: [
      { h2: 'Die Quellen je Land', html: table(['Quelle', 'Land', 'Horizont', 'Rolle'], [
        ['Live-Stationen DWD (via BrightSky) · GeoSphere TAWES · MeteoSchweiz SMN', 'DE · AT · CH', 'jetzt', 'Anker der ersten Stunden, Lapse-Rate, Qualitätsprüfung'],
        ['MOSMIX (DWD, Stationsvorhersage)', 'DACH', '~10 Tage', 'Grundlinie'],
        ['AROME (GeoSphere Austria)', 'AT · CH', 'bis 60 h', 'Feinauflösung im Alpenraum, Schneefallgrenze'],
        ['INCA (GeoSphere Austria)', 'AT', 'bis 4 h', 'Nowcast'],
        ['RADOLAN-RV / INCA / rzc', 'DE / AT / CH', '2 h / 3 h / jetzt', 'Niederschlag überschreibt im Radarhorizont'],
        ['GFS (NOAA)', 'DACH', '216–372 h', 'nur wenn mehr als 240 h angefragt werden (Langfrist-Schwanz)'],
        ['DWD UV-Tagespeak, DWD Pollenflug', 'DE', 'Tage', 'UV je Stunde über den Sonnenstand verteilt; Pollen 6 Arten'],
      ]) + p('Für Österreich und die Schweiz gibt es keinen amtlichen UV- und Pollenfeed; UV wird per Klarhimmel-Modell geschätzt, Pollen sind nur als ausdrücklich zugeschaltete Open-Meteo/CAMS-Quelle verfügbar. buscosun sagt das im Panel, statt deutsche Werte zu übertragen.') },
      { h2: 'Gewichtung und Anker', html: p('Jede Quelle bekommt ein Gewicht nach Vorlaufzeit und Eignung. Die Live-Messung der nächsten Stationen verankert die Stunden 0 bis 5 mit abklingendem Gewicht — die Vorhersage startet dort, wo das Thermometer wirklich steht. Eine Plausibilitätsprüfung („Representativeness-QC") wertet Quellen ab, die mehr als 3,5 °C vom ko-lokalisierten Messanker abweichen (gaußförmig, nicht hart). Die Lapse-Rate für die Höhe des Ortes wird aus dem Stationssatz geschätzt, Rückfall 6,5 K/km.') },
      { h2: 'Konfidenz je Variable', html: p('Für jede Variable und Stunde berechnet buscosun aus der gewichteten Streuung der Quellen eine Konfidenz zwischen 0 und 1 und multipliziert sie mit einem Skill-Abfall je Vorlaufzeit — Niederschlag verliert am schnellsten, Temperatur am langsamsten. Die Zeitkonstanten (Stunden) und Untergrenzen sind fest im Code:') + table(['Variable', 'τ (h)', 'Untergrenze'], [['Temperatur', '160', '0,45'], ['Wind', '80', '0,40'], ['Böe', '60', '0,35'], ['Feuchte', '120', '0,40'], ['Niederschlag', '36', '0,25'], ['Bewölkung', '60', '0,30'], ['Schneefallgrenze', '120', '0,40'], ['UV', '200', '0,50']]) + p('Angezeigt wird die Konfidenz als Balken: hoch 80–100 %, moderat 50–79 %, niedrig unter 50 %.') },
      { h2: 'Der isolierte Modus', html: p('Wählt man in der Modell-Bibliothek ein konkretes Modell für ein Land, isoliert sich auch der Punktforecast auf die native Quelle des Landes (DE: MOSMIX, AT/CH: AROME) — ohne Blend, ohne Messanker, ohne Radar. Liefert die Quelle nichts, bleibt der volle Mix, damit das Panel nie leer ist.') },
      { h2: 'Grenzen', html: ul([
        'Modellvorhersagen bleiben Modelle; die Konfidenz misst die Einigkeit der Quellen, nicht die Wahrheit.',
        'MOSMIX ist eine Stationsvorhersage; zwischen den Stationen wird interpoliert.',
        'Warnungen erscheinen im Panel nur für Deutschland (DWD); für AT und CH nennt das Panel die amtliche Stelle statt einer Fläche. ' + NO_WARNING,
      ]) },
    ],
    faqs: [
      { q: 'Nutzt buscosun Open-Meteo für die Vorhersage?', a: 'Nicht als Standard. Der Punktforecast geht direkt an DWD, GeoSphere Austria und MeteoSchweiz; Open-Meteo erscheint nur als ausdrücklich benannte Quelle (Modellvergleich, Archiv, optionale Pollen für AT/CH).' },
      { q: 'Wie weit reicht die Punktvorhersage?', a: 'Standard 24 Stunden im Panel; die Quellen tragen bis etwa 10 Tage (MOSMIX), darüber hinaus nur der GFS-Schwanz bis 372 h, wenn er angefragt wird.' },
      { q: 'Was bedeutet die Konfidenz in Prozent?', a: 'Wie einig sich die Quellen sind, abgeschwächt mit der Vorlaufzeit — 80 % heißt hohe Einigkeit, unter 50 % niedrige.' },
    ],
    related: ['/wetterkarte', '/vorhersage', '/methodik/konfidenz-und-trefferquote/', '/wissen/modellvergleich-unsicherheit/'],
  },
  {
    slug: 'regenradar-nowcast',
    title: 'Regenradar und Nowcast',
    h1: 'Wie das Regenradar von buscosun aus drei Landesradaren ein Nowcast macht',
    description: 'RADOLAN-RV, INCA und das MeteoSchweiz-Radar als DACH-Komposit, Zellverfolgung mit Ankunftszeit, Regenwahrscheinlichkeit aus 15 Varianten — und warum buscosun am Radarhorizont aufhört.',
    answer: 'Das Regenradar von buscosun zeigt die gemessenen Landesradare als ein Komposit — RADOLAN-RV des DWD mit 25 Frames im 5-Minuten-Takt bis zwei Stunden, INCA von GeoSphere Austria mit 12 Frames im 15-Minuten-Takt bis drei Stunden, das MeteoSchweiz-Radar als Analyse — und leitet daraus eine Zellverfolgung mit Ankunftszeit, eine kalibrierte Regenwahrscheinlichkeit aus 15 Bewegungsvarianten und einen 6-Stunden-Nowcast im Viertelstundentakt ab. Am Radarhorizont endet die Radarschicht bewusst.',
    sections: [
      { h2: 'Die drei Quellen', html: table(['Land', 'Produkt', 'Frames', 'Horizont'], [['Deutschland', 'DWD RADOLAN-RV (Analyse + amtliches Nowcast)', '25 × 5 min', 'jetzt bis +120 min'], ['Österreich', 'GeoSphere INCA', '12 × 15 min', '+15 bis +180 min (keine Analyse)'], ['Schweiz', 'MeteoSchweiz rzc/RR', '1', 'nur jetzt']]) + p('Jede Kartenzelle nimmt die Quelle des Landes, in dem sie liegt. Die gemessene Vergangenheit entsteht ohne Archiv-API aus einem Sitzungs-Cache; die Zeitleiste markiert den Bruch zwischen Messung und Vorhersage ausdrücklich. Seit dem 24. Juli 2026 verlängert buscosun den Radarhorizont nicht mehr mit Modellregen — die Modellhälfte wurde entfernt, weil sie die Verlässlichkeit der Messung verwässerte.') },
      { h2: 'Regen, Schnee, Graupel, Hagel', html: p('Radar misst Reflektivität, keine Phase. buscosun leitet die Niederschlagsart aus der Geländehöhe gegen eine regionale Schneefallgrenze mit weichem Übergangsband ab; Graupel und Hagel sind ausdrücklich Heuristiken. Der Layer „Radarsicht" zeigt den Randsaum der Radarabdeckung als „eingeschränkte Sicht" — echte Abschattungs-Klimatologien liegen nicht vor, deshalb ist es ein Reichweiten-Abfall plus Kontext (Alpen vs. Flachland).') },
      { h2: 'Zellverfolgung und Ankunftszeit', html: p('Aus dem gegröberten Radarbild werden zusammenhängende Zellen gebildet (Union-Find), per Block-Matching zwischen zwei Frames verschoben und daraus Geschwindigkeit in km/h, Zugrichtung und Trend bestimmt. Für den eigenen Standort ergibt sich eine Ankunftszeit in Minuten („Regen beginnt in 12 min"). Auf der 2D-Wetterkarte kommt für Deutschland stattdessen das amtliche Objektprodukt KONRAD3D zum Einsatz, das Zugbahn und Unsicherheitstrichter vom DWD selbst liefert.') },
      { h2: 'Regenwahrscheinlichkeit aus 15 Varianten', html: p('Aus zwei RADOLAN-Frames im Abstand von fünf Minuten schätzt buscosun das Bewegungsfeld (Horn-Schunck) und schiebt das Bild intensitätserhaltend weiter (semi-Lagrange-Advektion). Ein Ensemble aus fünf Tempo-Skalen mal drei Richtungsstörungen ergibt 15 Varianten; der Anteil nasser Varianten je Zelle ist die Regenwahrscheinlichkeit, isotonisch kalibriert, damit 70 % auch 70 % bedeuten. Nur Deutschland, etwa 60 Minuten. Die Validierungsseite rechnet die Kalibrierung live gegen das beobachtete Radar nach (Brier Score, Reliability).') },
      { h2: 'Der 6-Stunden-Nowcast am Punkt', html: p('Die Nowcast-Engine verbindet Radar (0–2 h) und den ICON-D2-Punktforecast (2–6 h) zu einer Viertelstunden-Serie über sechs Stunden, jede Stufe mit Quelle und Konfidenz. Im Alpenraum trennt sie Tal und Grat: Der Gratwert ist eine physikalische Hochrechnung über die Lapse-Rate und als Heuristik gekennzeichnet. Regen-Alarme (Gewitter/Hagel, gefrierender Regen, Starkregen) nutzen dieselben Intensitätsbänder wie die Karte, sind entprellt und auf etwa zwei Stunden Vorlauf gedeckelt — und funktionieren nur bei geöffneter App, weil buscosun keinen Server hat.') },
      { h2: 'Grenzen', html: ul(['Radar sieht Niederschlag in der Höhe; Verdunstung unterwegs und Radarschatten hinter Gebirgen verfälschen das Bodenbild.', 'Verschieben kann kein Entstehen und kein Zerfallen von Zellen.', 'Die Schweiz liefert keine Nowcast-Frames; dort endet die Zeitachse nach einer halben Stunde.', NO_WARNING]) },
    ],
    faqs: [
      { q: 'Warum endet das Regenradar nach zwei Stunden?', a: 'Weil dort das gemessene Radar-Nowcast endet. buscosun verlängert es bewusst nicht mit Modellregen; die Modellvorhersage steht getrennt im Punktforecast.' },
      { q: 'Woher weiß buscosun, ob es Schnee oder Regen ist?', a: 'Aus der Geländehöhe gegen eine regionale Schneefallgrenze mit Übergangsband — eine Ableitung, keine Radarmessung der Phase.' },
      { q: 'Gibt es die Regenwahrscheinlichkeit auch für Österreich?', a: 'Nein. Das Flow-Ensemble braucht Radarframes im 5-Minuten-Takt (RADOLAN) und ist auf Deutschland begrenzt.' },
    ],
    related: ['/regenradar', '/wetterkarte/niederschlag', '/wetterkarte/zellbahnen', '/wetterkarte/regen-chance', '/validierung'],
  },
  {
    slug: 'konfidenz-und-trefferquote',
    title: 'Konfidenz und Trefferquote',
    h1: 'Wie buscosun sagt, wie sicher eine Vorhersage ist — und es nachprüft',
    description: 'Modellvergleich, Ensemble-Spread, Stabilität seit gestern, Trefferquote der letzten 30 Tage und die Live-Validierung des Nowcasts gegen das Radar.',
    answer: 'buscosun weist Unsicherheit an vier Stellen aus: als Konfidenz-Score je Tag aus der Streuung von fünf Wettermodellen und der Vorlaufzeit, als Stabilität gegenüber den Vorläufen, als Trefferquote der eigenen Vorhersage über die letzten 30 Tage und als Live-Validierung des Regen-Nowcasts gegen das später beobachtete Radar mit Brier Score, Reliability und Skill. Stabil heißt dabei ausdrücklich nicht automatisch richtig.',
    sections: [
      { h2: 'Modellvergleich und Konfidenz-Score', html: p('Die Vorhersage-Seite holt fünf Modelle über die Open-Meteo-Schnittstelle (ICON/DWD, ECMWF IFS, GFS, GEM, Météo-France) sowie das ICON-Ensemble mit bis zu 40 Mitgliedern und die Vorläufe der letzten drei Tage. Der Konfidenz-Score je Tag entsteht aus der Streuung der Modelle und der Vorlaufzeit und wird als hoch, mittel oder niedrig gezeigt. Ein Leave-one-out-Vergleich markiert Ausreißer-Modelle mit ⚠. Regenwahrscheinlichkeit ist hier die Modell-Einigkeit: der Anteil der Modelle mit mindestens 0,5 mm am Tag.') },
      { h2: 'Stabilität seit gestern', html: p('Aus den Vorläufen („vor 3 Tagen", „vorgestern", „gestern") ergibt sich, ob die Vorhersage stabil oder wechselhaft ist. Ein durchgehender Trend zählt nicht als wechselhaft — nur echtes Hin und Her. Die Seite sagt ausdrücklich: Stabil heißt nicht automatisch richtig.') },
      { h2: 'Trefferquote der letzten 30 Tage', html: p('Für Temperatur, Niederschlag und Wind vergleicht buscosun die Vorhersagen mit Vorlauf 1 und 3 Tage gegen den Konsens der Modell-Analysen je Stunde — als mittleren absoluten Fehler für Temperatur und Wind, als Ja/Nein-Trefferquote für Regen. Eine Mindest-Datenbasis schützt vor Zufallsaussagen; das Ergebnis bekommt ein Laien-Label und fließt als Faktor in die Konfidenz ein. Ehrlich benannt: Die „Wahrheit" ist hier ein Analysen-Konsens, keine Stationsmessung.') },
      { h2: 'Die Validierungsseite', html: p('Die Seite /validierung rechnet beim Aufruf ein echtes Hindcast: Aus den ältesten beobachteten RADOLAN-Analysen wird das Bewegungsfeld geschätzt, 15 gestörte Varianten laufen vorwärts, und das Ergebnis wird gegen die später tatsächlich beobachtete Analyse verifiziert. Ausgewiesen werden Brier Skill Score (gegen Klimatologie), Expected Calibration Error (unter 0,05 gut, unter 0,1 brauchbar), Brier Score gegen die Basisrate, Critical Success Index und ein Reliability-Diagramm je Vorlaufminute. Die Werte schwanken mit der Wetterlage — das ist kein Fehler, sondern der Punkt.') },
      { h2: 'Unsicherheit als Fläche', html: p('Der Layer „Sicherheit" auf der Wetterkarte zeigt, wo die Vorhersage unsicher ist: bei aktivem Niederschlag den echten Spread des 15-Member-Flow-Ensembles (Deutschland), sonst die Abweichung von der 30-jährigen DWD-Stationsklimatologie multipliziert mit der Übereinstimmung zweier aufeinanderfolgender ICON-D2-Läufe.') },
      { h2: 'Grenzen', html: ul(['Fünf Modelle sind kein Ensemble; Einigkeit kann gemeinsamer Irrtum sein.', 'Die Trefferquote nutzt Analysen als Referenz, keine Stationsmessung.', 'Die Validierung misst nur das Flow-Ensemble (0–60 min, DE), nicht den Temperatur-Schleier.', 'Alle Aussagen sind Wahrscheinlichkeiten. ' + NO_WARNING]) },
    ],
    faqs: [
      { q: 'Was heißt „Konfidenz hoch"?', a: 'Die Modelle streuen wenig und der Vorlauf ist kurz. Es ist ein Maß für Einigkeit, kein Versprechen.' },
      { q: 'Wie berechnet buscosun die Trefferquote?', a: 'Vorhersagen mit 1 und 3 Tagen Vorlauf über die letzten 30 Tage gegen den Konsens der Modell-Analysen — MAE für Temperatur und Wind, Ja/Nein-Treffer für Regen.' },
      { q: 'Was ist der Brier Score?', a: 'Der mittlere quadratische Fehler einer Wahrscheinlichkeitsvorhersage; 0 wäre perfekt. Der Skill Score vergleicht ihn mit der Klimatologie.' },
    ],
    related: ['/vorhersage', '/validierung', '/wetterkarte/sicherheit', '/wissen/modellvergleich-unsicherheit/'],
  },
  {
    slug: 'event-bewertung',
    title: 'Event-Bewertung',
    h1: 'Wie buscosun den besten Tag für ein Event findet',
    description: 'Anlass-Profile, Score 0–100, Konfidenz, Phasen, Plan B, Ausweichort, Event-Fläche mit Gelände, Foto-Licht und Astro-Nacht — die Rechenregeln der Event-Planung.',
    answer: 'Die Event-Planung bewertet die nächsten sieben Tage für einen Anlass mit einem Score von 0 bis 100 aus vier Faktoren — Niederschlag, Temperatur, Wind, Bewölkung — mit anlassabhängigen Gewichten und Idealtemperaturen. Jeder Tag trägt eine Konfidenz aus Quellen-Einigkeit mal Vorlauf; unter 0,55 gilt nur noch eine Tendenz. Phasen werden einzeln bewertet und der Tag zählt die schwächste. Plan B, Ausweichort im Umkreis von 22 km, Event-Fläche mit Geländekennzahlen, Foto-Licht und Astro-Nacht bauen auf derselben Punktvorhersage auf.',
    sections: [
      { h2: 'Die Anlass-Profile', html: table(['Anlass', 'Ideal-Temperatur', 'Regen', 'Temp', 'Wind', 'Wolken', 'Fenster'], [
        ['Wandern', '12–22 °C', '1,0', '0,6', '0,4', '0,25', 'Tag'], ['Radtour', '12–24 °C', '1,0', '0,5', '0,7', '0,2', 'Tag'], ['Grillen', '19–30 °C', '1,0', '0,7', '0,5', '0,5 (wenig)', 'Tag'],
        ['Drohne', '2–30 °C', '0,9', '0,1', '1,0', '0,4', 'Tag'], ['Fotografie', '2–28 °C', '0,7', '0,15', '0,25', '1,0 (weich)', 'Tag'], ['Picknick', '17–28 °C', '1,0', '0,7', '0,5', '0,45 (wenig)', 'Tag'],
        ['Laufen', '5–17 °C', '0,8', '0,6', '0,4', '0,15', 'Tag'], ['Baden', '24–34 °C', '0,8', '1,0', '0,4', '0,6 (wenig)', 'Tag'], ['Sterne', '0–30 °C', '0,9', '0,15', '0,2', '1,0 (wenig)', 'Kernnacht 22–4 Uhr'],
        ['Hochzeit, freier Anlass', '14–26 °C', '1,0', '0,5', '0,4', '0,3', 'Tag'],
      ]) + p('Die Gewichte lassen sich je Anlass feinjustieren (Idealtemperatur und alle vier Gewichte). Bewertet wird das gewählte Tageszeitfenster: ganzer Tag 8–20 Uhr, Vormittag, Nachmittag, Abend 18–23 Uhr oder Kernnacht.') },
      { h2: 'Score, Konfidenz, Tendenz', html: p('Für jeden Tag fasst buscosun die Stunden des Fensters zusammen (Tmax/Tmin, Regensumme und Regenstunden über 0,1 mm/h, Böen, Bewölkung, UV, gefühlte Temperatur, die schlimmste Einzelstunde als Spitze). Jeder Faktor liefert einen Teilscore 0–1 mit Bewertung gut/ok/schlecht und einem Satzbaustein; der Score ist die gewichtete Summe, dazu der entscheidende Negativfaktor. Die Konfidenz ist Quellen-Einigkeit mal Vorlauf; unter der Schwelle 0,55 wird der Tag als Tendenz gekennzeichnet. Tage jenseits des Horizonts der Quelle (AT/CH etwa 60 h) werden nicht bewertet, sondern als „keine Vorhersage" ausgewiesen — keine Null, die wie eine Aussage aussieht.') },
      { h2: 'Phasen, Plan B, Ausweichort', html: p('Eine Hochzeit hat drei Phasen (Trauung 13–15, Empfang 15–18, Abendfeier 18–23 Uhr); jede wird einzeln bewertet, der Tag zählt die schwächste. Plan B löst aus, wenn die Regensumme im Fenster (Standard 3 mm), die Böen (Standard 13 m/s) oder der Gesamtscore (Standard 50) eine Schwelle reißen — mit Ausweichoption Zelt, Halle, Unterstand oder nur warnen. Die Ausweichort-Suche fragt auf Knopfdruck acht Himmelsrichtungen im Radius von 22 km mit demselben Anlassprofil ab und schlägt nur vor, was mindestens 6 Punkte besser ist.') },
      { h2: 'Die Event-Fläche und das Gelände', html: p('Statt eines Punktes lässt sich ein Rechteck aufziehen (0,05 bis 60 km Kante). Bewertet werden vier um 10 % nach innen gerückte Ecken und die Mitte — nacheinander abgefragt, weil parallele Abrufe bei GeoSphere HTTP 429 auslösten. Gemessen: Über flachem Gelände ergibt der Punktforecast bei 8 km Kante nur 0,16 K Spanne; dort sagt die App „uniform", statt Nachkommastellen als Ortsauflösung auszugeben. In Zell am See (6 km, Gebirge) waren es 3,82 K — dort trägt die Fläche. Die Gelände-Bühne zeigt Höhenlage, Neigung, tiefsten und exponiertesten Punkt aus dem 30-m-Raster (ohne Gebäude und Bewuchs), Windpfeile zur Böen-Spitzenstunde und die Stunde, in der die Sonne je Phase hinter dem Grat verschwindet (Horizont aus dem DEM im 30-km-Umkreis; ein Grat unter 1° gilt als Sonnenuntergang).') },
      { h2: 'Foto-Licht und Astro-Nacht', html: p('Sonnenstand und Lichtfenster sind reine Astronomie (NOAA-Verfahren, etwa eine Minute genau): blaue Stunde bei Sonnenhöhe −6° bis −4°, goldene Stunde −4° bis +6°, Auf- und Untergang bei −0,833°. Sie gelten für jedes Datum, auch Monate voraus. Lichtqualität (weich, hart, dramatisch) und Nebel- bzw. Abendrot-Chance sind Wahrscheinlichkeiten aus Bedeckung und Schichtung — erst im Vorhersagehorizont. Die Astro-Nacht bewertet 21 bis 6 Uhr: Mondphase und -höhe (Schlyter), Wolkenschichten, Tau-Risiko aus dem Taupunkt (Magnus) und die astronomische Dunkelheit. Die Lichtverschmutzung ist eine Offline-Schätzung aus der Nähe zu Städten (additives 1/d^2,5-Modell, auf Bortle 1–9 abgebildet) — kein VIIRS-Atlas, keine Messung.') },
      { h2: 'Grenzen', html: ul(['Sieben Tage Horizont, weil MOSMIX ihn trägt; darüber hinaus nichts.', 'Die Lichtverschmutzung ist eine Schätzung aus Stadtnähe, kein Messwert.', 'Keine Milchstraßen-Sichtbarkeit, keine Meteorstrom- oder Polarlicht-Prognose.', 'Benachrichtigungen funktionieren nur bei geöffneter App (kein Server); der Kalender-Export (.ics) ist der backend-freie Ersatz.']) },
    ],
    faqs: [
      { q: 'Wie entsteht der Score von 0 bis 100?', a: 'Gewichtete Summe von vier Teilscores (Regen, Temperatur, Wind, Wolken) mit anlassabhängigen Gewichten und Idealtemperaturen.' },
      { q: 'Was bedeutet „nur Tendenz"?', a: 'Die Konfidenz (Quellen-Einigkeit mal Vorlauf) liegt unter 0,55; der Tag wird gezeigt, aber nicht als verlässlich bewertet.' },
      { q: 'Kann ich die goldene Stunde für einen Termin in drei Monaten sehen?', a: 'Ja, die Lichtfenster sind reine Astronomie und gelten für jedes Datum; eine Wetterwahrscheinlichkeit gibt es erst im Vorhersagehorizont.' },
    ],
    related: ['/eventplanung', '/funktionen/event-tag/', '/methodik/punktvorhersage-quellenmix/'],
  },
  {
    slug: 'tourenplanung-zeitmodell',
    title: 'Tourenplanung: Zeitmodell und Wetter zur Ankunftszeit',
    h1: 'Wie buscosun eine Route in Ankunftszeiten und Wetter je Kilometer übersetzt',
    description: 'GPX bis KMZ, DIN-33466-Gehzeit, Rad-Steigungsmodell, Wind-Effekt aufs Tempo, Pausen, Wetter-Cluster und die Grenzwerte der 3D-Ansicht — das Rechenmodell der Tourenplanung.',
    answer: 'Die Tourenplanung von buscosun liest GPX, TCX, FIT, KML oder KMZ, prüft die Höhen gegen ein Geländemodell, rechnet mit acht Bewegungsarten (Gehzeit nach DIN 33466/SAC, Rad-Steigungsmodell, Lauf-Pace) die Ankunftszeit je Trackpunkt — inklusive Gegen- und Rückenwind, iterativ mit dem Wetter — und holt für jeden Streckenabschnitt das Wetter zur voraussichtlichen Ankunftszeit aus derselben Punktvorhersage wie die Karte.',
    sections: [
      { h2: 'Datei und Prüfung', html: p('Erkannt wird das Format an den Bytes, nicht an der Endung (ZIP-Kopf für KMZ, „.FIT" an Byte 8–11, XML-Wurzel für GPX/TCX/KML). Grenzen: 25 MB, 100 000 Trackpunkte, mindestens 100 m Länge, höchstens 5 km Lücke zwischen Punkten, Gebiet DACH plus etwa 50 km Puffer. Mitgelieferte Höhen werden gegen das Terrarium-Geländemodell (rund 30 m) geprüft; beschreiben sie das Gelände nicht, ersetzt buscosun sie und sagt das — denn falsche Höhen stecken sonst über die Höhenkorrektur in Temperatur, Wind und Go/No-Go.') },
      { h2: 'Acht Bewegungsarten', html: table(['Art', 'Flach-Tempo', 'Regler', 'Modell'], [
        ['Wandern (T1–T2)', '4,5 km/h', '3–6', 'DIN 33466/SAC: 350 Hm/h auf, 500 ab; größere Teilzeit voll, kleinere halb'],
        ['Bergwandern (T3)', '3,5 km/h', '2,5–5', 'wie Wandern, 300/400 Hm/h, Steilstufen-Aufschlag über 25 %'],
        ['Jogging', '9 km/h', '6–14', 'Pace mit linearer Steigungsstrafe'],
        ['Trail-Running', '8 km/h', '5–13', 'Pace mit Trail-Aufschlag, gradtoleranter'],
        ['Rennrad', '26 km/h', '18–40', 'v = v_flach / (1 + Steigung · k), Abfahrt bis 60 km/h'],
        ['Gravel', '20 km/h', '14–32', 'dito, Abfahrt bis 50 km/h'],
        ['MTB', '15 km/h', '9–26', 'dito, Abfahrt bis 45 km/h'],
        ['E-Bike Trekking', '23 km/h', '15–25', 'Motor halbiert den Steigungsverlust, Flach-Deckel 25 km/h'],
      ]) },
      { h2: 'Wind, Pausen, Startzeit', html: p('Die Windkomponente entlang der Fahrtrichtung verändert das Tempo: Rad mit Faktor 1 + 0,04 · Komponente (begrenzt auf 0,5 bis 1,4), zu Fuß 1 + 0,012 · Komponente (0,7 bis 1,2). Weil der Wind zur Ankunftszeit gilt, die Ankunftszeit aber vom Wind abhängt, rechnet buscosun Zeitplan → Wind → Zeitplan iterativ. Pausen kommen aus Vorgaben je Art (Wandern alle 120 min 15 min plus 45 min Mahlzeit, Rennrad alle 50 km 10 min …) oder als eigene Pausen an Streckenpunkten. Der Horizont beträgt 240 Stunden; jenseits davon warnt die App vor reduzierter Konfidenz.') },
      { h2: 'Wetter je Kilometer', html: p('Die Trackpunkte werden räumlich (6, 10 oder 14 km je Gelände) und nach Höhenbändern von 300 m zu Wetterpunkten gebündelt; je Bündel läuft dieselbe Punktvorhersage wie auf der Karte, höchstens vier parallel. Je Abschnitt wird stundenweise interpoliert (Windrichtung auf dem kürzesten Bogen, Niederschlag stundengebinnt); im Radarhorizont überschreibt das gemessene Radar den Modellregen. Amtliche Warnungen erscheinen nur für Deutschland, die Schneefallgrenze nur für AT und CH — beides steht so im Ergebnis. Die Verlässlichkeit je Punkt kommt aus der Konfidenz der Vorhersage.') },
      { h2: 'Die 3D-Ansicht und ihre Grenzwerte', html: p('Der Schnitt zeigt die Wetterwand 300 m über Grund — die Luft, durch die man geht — als Windbänder (unter 15, 15–30, 30–45, 45–60, über 60 km/h), Regen, Wolkenbasis (LCL-Näherung, als „abgeleitet" markiert), Schneefallgrenze und Warnzone. Der Zeitkorridor rechnet Regenfenster und eine Startempfehlung im 15-Minuten-Raster ±2 h. Grenzwerte für Go/No-Go: Böen 10–120 km/h (Start 40), Wind 10–100, Regen 0,5–20 mm/h, gefühlte Temperatur −25 bis 20 °C, Warnstufe (nur DE). Bewusst nicht enthalten: eine Sichtweite (aus Bewölkung geschätzt wäre eine erfundene Zahl), Zellgeschwindigkeiten und Treffer-Wahrscheinlichkeiten. Der Zeitplan „was wann passiert" nennt nur Änderungen, mit interpolierten Schwellen und Hysterese gegen Flattern, und sagt, wie viele Zeilen ein Deckel weglässt.') },
      { h2: 'Grenzen', html: ul(['Ein Wegtyp-Faktor (OSM) ist vorbereitet, aber noch 1,0 — Schotter und Asphalt zählen gleich.', 'Die Cluster-Auflösung ist 6–14 km, nicht 2 km; die App nennt den echten Radius.', 'Die zuletzt geplante Tour bleibt sieben Tage im Gerät (IndexedDB), das Wetter wird nie gespeichert, sondern sichtbar neu geholt.', NO_WARNING]) },
    ],
    faqs: [
      { q: 'Welche Dateiformate kann ich hochladen?', a: 'GPX, TCX, FIT, KML und KMZ — erkannt an den Bytes, nicht an der Endung.' },
      { q: 'Wie berechnet buscosun die Gehzeit?', a: 'Nach DIN 33466/SAC: horizontale und vertikale Teilzeit, die größere voll, die kleinere halb; Bergwandern mit Steilstufen-Aufschlag.' },
      { q: 'Berücksichtigt die Ankunftszeit den Wind?', a: 'Ja, iterativ: Der Wind zur Ankunftszeit verändert das Tempo, das die Ankunftszeit verändert.' },
    ],
    related: ['/tourenplanung', '/funktionen/tourenplanung/', '/methodik/e-bike-reichweite/', '/methodik/hoehenkorrektur/'],
  },
  {
    slug: 'e-bike-reichweite',
    title: 'E-Bike-Reichweite',
    h1: 'Wie buscosun die E-Bike-Reichweite aus Steigung, Wind und Unterstützungsstufe schätzt',
    description: 'Das Akku-Modell der Tourenplanung: Steigungs-, Roll- und Luftwiderstandsleistung, Motor-Deckel je Stufe, Wirkungsgrad, Ladezustand entlang der Strecke — und was das Modell vereinfacht.',
    answer: 'buscosun schätzt den Akkuverbrauch eines E-Bikes entlang der Route aus einer Leistungsbilanz: Steigungsleistung plus Rollwiderstand plus Luftwiderstand, davon übernimmt der Motor bis zum Deckel seiner Unterstützungsstufe (Eco 200 W, Tour 350 W, Sport 500 W, Turbo 750 W), über 25 km/h nichts mehr; der Batteriestrom ist Motorleistung durch Wirkungsgrad 0,85. Daraus ergibt sich der Ladezustand je Kilometer und die Empfehlung, notfalls eine Stufe herunterzuschalten.',
    sections: [
      { h2: 'Die Leistungsbilanz', html: p('Für jeden Streckenabschnitt rechnet buscosun im stationären Zustand: <code>P_grav = m · g · v · sin(Steigung)</code>, <code>P_roll = m · g · v · Crr</code>, <code>P_aero = ½ · ρ · CdA · v_rel³</code> mit der relativen Anströmung aus Fahrt- und Windgeschwindigkeit. Die Summe ist die nötige Antriebsleistung; der Fahrer liefert seinen Anteil (Standard 100 W), der Motor den Rest bis zum Deckel seiner Stufe. Bergab ist die Bilanz negativ, dann fließt kein Batteriestrom (keine Rekuperation angenommen).') },
      { h2: 'Standardwerte', html: table(['Größe', 'Standard', 'einstellbar'], [['Akku', '500 Wh, 100 % Ladung', 'ja'], ['Stufe', 'Tour (350 W)', 'Eco 200 · Tour 350 · Sport 500 · Turbo 750 W'], ['Gesamtmasse', '95 kg (Rad + Fahrer + Gepäck)', 'ja'], ['Fahrerleistung', '100 W', 'ja'], ['Rollwiderstand Crr', '0,006', 'ja'], ['Luftwiderstandsfläche CdA', '0,55 m²', 'ja'], ['Wirkungsgrad Motor+Akku', '0,85', 'ja'], ['Abregelung', '25 km/h', 'fest (gesetzlich)']]) },
      { h2: 'Ausgabe', html: p('Das Panel zeigt, ob der Akku reicht, den Ladezustand entlang der Strecke (aus der kumulierten Batterieleistung mal Segmentdauer) und, wenn es knapp wird, ab welcher Stufe es reicht. Der Wind kommt aus derselben Vorhersage wie das Tourenwetter — Gegenwind auf dem Rückweg ist damit im Verbrauch drin. Der Ladezustand wird je Kilometer als Kurve über dem Höhenprofil gezeichnet; wer eine Rundtour plant, sieht so, ob der Akku am steilsten Anstieg oder erst auf dem windigen Rückweg knapp wird. Das Panel erscheint nur bei der Bewegungsart E-Bike Trekking und rechnet mit denselben Streckenabschnitten wie der Zeitplan — Steigung je Segment aus den gegen das Geländemodell geprüften Höhen.') },
      { h2: 'Vereinfachungen, ausdrücklich', html: ul(['Die Unterstützungsstufe begrenzt nur die Motorleistung; das Tempo bleibt das des Bewegungsmodells (E-Bike halbiert den Steigungsverlust, Flach-Deckel 25 km/h). Echte Räder fahren mit Turbo schneller — das Modell ist eine MVP-Vereinfachung.', 'Keine Temperaturabhängigkeit des Akkus, keine Alterung, keine Rekuperation.', 'Crr und CdA sind Richtwerte für Trekking-Räder; MTB-Reifen oder Aufrechtsitz ändern sie deutlich.', 'Die Schätzung ist eine Planungshilfe, keine Herstellerangabe.']) },
    ],
    faqs: [
      { q: 'Wie viel Watt hat die Tour-Stufe?', a: 'Im Modell 350 W Motor-Deckel; Eco 200, Sport 500, Turbo 750 W — an gängigen Mittelmotoren orientiert, einstellbar.' },
      { q: 'Rechnet buscosun mit Gegenwind?', a: 'Ja, der Luftwiderstand nutzt die relative Anströmung aus Fahrt- und Windgeschwindigkeit der Vorhersage zur Ankunftszeit.' },
      { q: 'Warum stimmt die Reichweite nicht mit der Anzeige am Rad überein?', a: 'Das Modell ist stationär, ohne Temperatur, Alterung und Rekuperation, und setzt Richtwerte für Rollwiderstand und Luftwiderstand. Es soll die Größenordnung und den Effekt von Steigung und Wind zeigen.' },
    ],
    related: ['/tourenplanung', '/methodik/tourenplanung-zeitmodell/', '/funktionen/tourenplanung/'],
  },
  {
    slug: 'brandradar-detektion-und-brandnarben',
    title: 'Brandradar: Detektion, Bestätigung und Brandnarben',
    h1: 'Wie das Brandradar aus Satellitendetektionen Brände macht — und wann es „bestätigt" sagt',
    description: 'FIRMS-Hotspots, Ortsfest-Klassifikator, EFFIS-Abgleich, Flächenschätzung mit Prädiktionsintervall, Thermalanomalien, Satellitenbild vorher/nachher und dNBR — die Regeln des Brandradars.',
    answer: 'Das Brandradar liest die Wärmedetektionen des NASA-Systems FIRMS (VIIRS, 375 m), bündelt sie zu Bränden mit stabiler Kennung, markiert ortsfeste Dauerquellen grau (rund 39 Prozent aller DACH-Detektionen liegen auf Stahlwerken, Raffinerien und Fackeln), gleicht mit den EFFIS-Brandflächen und Copernicus-EMS-Aktivierungen ab und nennt einen Brand nur dann bestätigt, wenn eine dieser Quellen im selben Satz steht. Unbestätigt ist der Normalfall. Für kartierte Brände zeigt es Sentinel-2-Bilder vorher und nachher, auf Wunsch als dNBR-Brandnarbe mit 10 m.',
    sections: [
      { h2: 'Detektion', html: p('Primärquelle ist NASA FIRMS (VIIRS 375 m, Near-Real-Time) über einen Schlüssel-Proxy; fällt FIRMS aus, springt GWIS ein — ohne Strahlungsleistung, was die Karte als „Notbetrieb" ausweist. Eine Detektion ist eine Satellitenmessung, keine Einsatzmeldung: Punkt = Pixelmitte, Rechteck = Pixelgeometrie, Strahlungsleistung (FRP) in Megawatt ist eine Leistung, nie eine Fläche. Überflüge desselben Satelliten innerhalb von 10 Minuten zählen als ein Überflug — die eine Regel dafür im ganzen Projekt.') },
      { h2: 'Ortsfest oder Brand', html: p('Der Klassifikator markiert Detektionen grau, wenn sie über Tage ortsfest bleiben und sich nicht ausdehnen — beides zusammen. Im 24-h-Fenster lädt er dazu sieben Tage Vorgeschichte nach, im Hintergrund, nach dem ersten Bild; bis dahin behauptet kein Punkt etwas. Eine von EFFIS kartierte Fläche hebt die Ortsfest-Vermutung auf, macht aber nie etwas grau. Ergänzend gibt es eine statische Liste von 462 Standorten persistenter Wärmequellen aus dem FIRMS-Archiv 2020–2026 (Regel: eine 0,01°-Zelle mit mindestens 5 Detektionstagen in mindestens 2 Kalenderjahren, EFFIS-Jahre zählen nicht), verknüpft mit Anlagenverzeichnissen (E-PRTR, Marktstammdatenregister, BFE) im Umkreis von 1,5 km und in die Klassen A (benannte Anlage), B (Dauerquelle) und C (reines Tagessignal, wahrscheinlich Reflexion) eingeteilt.') },
      { h2: 'Bestätigung', html: p('Drei Stufen: <strong>bestätigt</strong> nur mit EFFIS-Kartierung, Copernicus-EMS-Aktivierung oder amtlicher Warnung im selben Satz; <strong>plausibel</strong> bei mehreren Überflügen oder Kontext; <strong>unbestätigt</strong>, wenn nur der Satellit spricht — der Normalfall, kein Versagen. „Erloschen" gibt es nur mit Quelle (EFFIS-Enddatum, EMS geschlossen); eine Überflugslücke ist kein Ende. Für aktive Brände existiert in DE, AT und CH keine offene behördliche Echtzeitquelle; buscosun verlinkt NINA/MoWaS, die Einsatzübersichten Oberösterreich und Burgenland und Alertswiss, wertet sie aber nicht aus (Lizenz). GeoSphere-Warntexte werden wörtlich zitiert und als Kontext gekennzeichnet, nie als Brandbestätigung. Die Brandursache liefert keine der Quellen; das Dossier sagt „Ursache: keine Quelle".') },
      { h2: 'Fläche und Dynamik', html: p('Flächen tragen immer ihre Art: kartiert (EFFIS), „bis N ha" (Detektionsraster als Obergrenze) oder geschätzt mit Intervall. Die Schätzung ist eine log-log-Regression auf 618 Paaren aus EFFIS-Kartierung und FIRMS-Archiv 2020–2026 (604 verwertbar), mit Prädiktionsintervall auf Niveau 0,8, Monotonie-Nebenbedingung und ohne Extrapolation außerhalb des Trainingsbereichs; das FRE-Modell (n = 368) hat eine Leave-one-out-Abdeckung von 0,77. Ein Versuch, aus Detektionen eine eigene Brandkontur zu zeichnen, wurde an denselben 618 Paaren widerlegt — keine Regel schlägt das Detektionsraster. Die Tendenz (wächst, stabil, klingt ab) kommt aus dem FRP-Verlauf derselben Tageshälfte, Wachstum verlangt zusätzlich räumliche Ausdehnung; die „Ausbreitung" ist die Verschiebung des FRP-gewichteten Schwerpunkts zwischen Überflügen (ab drei Überflügen, mehr als eine halbe Pixelbreite) mit Windabgleich als Flag — kein Frontverlauf.') },
      { h2: 'Satellitenbild und Brandnarbe', html: p('Für jeden Brand sucht buscosun in der Szenenliste von Element84 (Sentinel-2, Landsat) die letzte wolkenarme Aufnahme (≤ 40 % Wolken) vor dem Brandbeginn und die erste danach, ±30 Tage, und zeigt sie als 30-m-Bild aus NASA GIBS/Worldview. Der 10-m-Viewer liest Sentinel-2-Originale per HTTP-Range direkt aus dem AWS-Bucket: Echtfarbe, SWIR-Falschfarbe (B12/B8A/B04) oder „Verbrannt" als dNBR gegen die Vorher-Szene desselben Granulats, mit den USGS-Klassengrenzen 0,10 / 0,27 / 0,44 / 0,66 — ausdrücklich unkalibriert. Die Szenenklassifikation (SCL) maskiert Wolken in der Vorher-Szene; die ESA-WorldCover-Karte dämpft Acker und Siedlung, weil dort Ernte oder Nutzung wahrscheinlicher ist als Brand. Kleine Brände unter etwa 10–20 ha zeigen im 30-m-Bild oft keine Narbe; die App sagt das.') },
      { h2: 'Grenzen', html: ul(['Kleine Brände fehlen dem Satelliten systematisch; „keine Hotspots" heißt nicht „keine Brände".', 'Die Historie (Monat/Saison) reicht bis 2020 — „langjährig" wird nicht behauptet.', 'Der EU-Gefahrenindex ist ein Bild aus dem Kartendienst, kein Zahlenfeld; Österreich hat keine offene amtliche Waldbrandstufe.', 'Kein amtliches Warnprodukt. ' + NO_WARNING]) },
    ],
    faqs: [
      { q: 'Ist ein Hotspot ein bestätigter Brand?', a: 'Nein. Ein Hotspot ist eine Satellitendetektion. Bestätigt heißt ein Brand nur mit EFFIS-Kartierung, Copernicus-EMS-Aktivierung oder amtlicher Warnung.' },
      { q: 'Warum erscheinen Stahlwerke als Brände?', a: 'Weil der Satellit Wärme sieht, nicht Feuer. buscosun markiert ortsfeste Dauerquellen grau und führt 462 bekannte Standorte mit Anlagenbezug.' },
      { q: 'Was ist dNBR?', a: 'Die Differenz des Normalized Burn Ratio aus Nahinfrarot und kurzwelligem Infrarot vor und nach dem Brand; buscosun nutzt die USGS-Klassengrenzen ohne eigene Kalibrierung.' },
    ],
    related: ['/waldbrand', '/waldbrand/aktive-braende', '/waldbrand/gefahrenindex', '/funktionen/waldbrandgefahr/'],
  },
];

/** Wettermodelle: Tabelle aus dem Modellkatalog der App (wie /lizenzen/), nie abgetippt. */
export function buildWettermodellePage() {
  const models = readModelCatalog();
  const cov = (m) => m.coverage ? ['DE', 'AT', 'CH'].map((c) => `${c} ${({ full: 'voll', partial: 'teilweise', coarse: 'grob', none: '—' })[m.coverage[c]] ?? m.coverage[c]}`).join(' · ') : '—';
  const rows = models.filter((m) => m.special !== 'native').map((m) => [
    `<strong>${m.name}</strong>${m.ensemble ? ' (Ensemble)' : ''}${m.ai ? ' [KI]' : ''}`,
    m.operator ?? '—',
    m.resolutionKm != null ? `${String(m.resolutionKm).replace('.', ',')} km` : 'Stationen',
    m.horizonH != null ? `+${m.horizonH} h` : '—',
    cov(m),
    m.ingested === false ? 'bald verfügbar' : 'aktiv',
    m.license ?? '—',
  ]);
  return {
    slug: 'wettermodelle',
    title: 'Die Wettermodelle',
    h1: 'Welche Wettermodelle buscosun nutzt und wie die Modellwahl je Land funktioniert',
    description: 'ICON-D2, ICON-EU, AROME, INCA, ICON-CH1/CH2, IFS, GFS, MOSMIX und mehr: Auflösung, Horizont, Abdeckung DE/AT/CH und Lizenz — direkt aus dem Modellkatalog der App.',
    answer: `buscosun führt ${models.length} Modelle und Quellen in einem Katalog, der nur frei lizenzierte Daten zulässt (CC BY 4.0, GeoNutzV-kompatibel, Etalab 2.0, OGL, Public Domain). Standard ist „Native": ICON-D2 des DWD als 2,2-km-Raster für DE, AT und CH, das jeweilige Landesradar und der Punktforecast-Quellenmix. Ein Modell lässt sich je Land umschalten; deckt es das Land nicht ab, fällt die Karte still auf Native zurück, statt leer zu bleiben.`,
    sections: [
      { h2: 'Der Katalog', html: table(['Modell', 'Betreiber', 'Auflösung', 'Horizont', 'Abdeckung', 'Status', 'Lizenz'], rows) + p('Die Tabelle wird beim Build aus <code>src/fusion/modelCatalog.ts</code> erzeugt — dieselbe Datei, die die Modell-Bibliothek der App speist. Eine abgetippte Zweitliste würde driften.') },
      { h2: 'Native: der Standard', html: p('„Native" ist kein einzelnes Modell, sondern die Zusammensetzung: ICON-D2 (Karte, 2,2 km), das Landesradar (RADOLAN-RV, INCA, rzc) und der Punktforecast-Mix aus Stationen, MOSMIX und AROME. Der Höhenwind kommt aus den ICON-EU-Druckflächen (~7 km), weil ICON-D2 seine Druckflächen nur im ikosaedrischen Gitter veröffentlicht, das der eingebaute GRIB2-Decoder nicht liest.') },
      { h2: 'Modellwahl je Land', html: p('Die Modell-Bibliothek zeigt je Modell eine Abdeckungskarte für DE, AT und CH (voll, teilweise, grob, keine), Auflösung, Horizont, Update-Takt und einen „Gut für"-Satz, der aus den Katalogdaten erzeugt wird — keine Werbeaussagen. Modelle, die die Engine nur vereinfacht rastert, tragen den Hinweis „vereinfachtes Raster — in Gebirgslagen weniger genau" und sind nie „empfohlen". Wählt man ein Modell für ein Land, isoliert sich auch der Punktforecast auf die native Quelle dieses Landes. Der Radar-Schalter ist unabhängig von der Modellwahl.') },
      { h2: 'Was buscosun mit den Daten macht', html: p('Die dargestellten Werte sind nicht die Rohprodukte der Wetterdienste: Höhenkorrektur, Quellenmix, Radar-Nowcast, abgeleitete Indizes (Gewitterpotenzial, Rotation, Schneefallgrenze) und eigene Farbskalen verändern sie. Deshalb nennt buscosun die Quelle an jeder Stelle und verweist für amtliche Aussagen auf die Dienste selbst. Vollständiges Verzeichnis: <a href="/lizenzen/">Quellen &amp; Lizenzen</a>.') },
    ],
    faqs: [
      { q: 'Welches Modell ist für die Schweiz am besten?', a: 'Standard ist ICON-D2 (2,2 km) mit dem MeteoSchweiz-Radar; ICON-CH1-EPS (1 km) und ICON-CH2-EPS (2,1 km) von MeteoSchweiz lassen sich für CH zuschalten.' },
      { q: 'Warum kommt der Höhenwind aus ICON-EU?', a: 'ICON-D2 veröffentlicht Druckflächen nur im ikosaedrischen Gitter; der eingebaute Decoder liest nur reguläre Gitter, ICON-EU liefert sie mit ~7 km.' },
      { q: 'Nutzt buscosun KI-Modelle?', a: 'AIFS und AICON stehen im Katalog als KI-Modelle (Kennzeichnung [KI]); sie sind global und grob und werden nie automatisch gewählt.' },
    ],
    related: ['/wetterkarte', '/lizenzen/', '/methodik/punktvorhersage-quellenmix/', '/vorhersage'],
  };
}

/** /ueber/ — Entitätsseite. Betreiber nur aus legal.mjs, nie erfunden. */
export function buildUeberPage() {
  const operatorKnown = OPERATOR.name !== TODO;
  return {
    slug: 'ueber',
    title: 'Über buscosun',
    h1: 'Was buscosun ist — und was es bewusst nicht ist',
    description: 'buscosun ist eine kostenlose, tracker-freie Wetter-Web-App für Deutschland, Österreich und die Schweiz aus amtlichen Quellen, höhenkorrigiert, ohne Konto — mit ausgewiesener Unsicherheit statt Scheingenauigkeit.',
    answer: 'buscosun ist eine kostenlose Wetter-Web-App für Deutschland, Österreich und die Schweiz, die ausschließlich amtliche und frei lizenzierte Daten nutzt (DWD, GeoSphere Austria, MeteoSchweiz, Copernicus, NOAA), sie über ein Geländemodell höhenkorrigiert, vollständig im Browser rechnet und ohne Konto, ohne Werbung und ohne Tracker auskommt. Ehrlichkeit ist Produktprinzip: Unsicherheiten, Datenlücken und Länderunterschiede werden ausgewiesen, nie kaschiert.',
    sections: [
      { h2: 'Grundsätze', html: ul([
        '<strong>Amtliche Quellen.</strong> Wetterdaten kommen von DWD, GeoSphere Austria, MeteoSchweiz, ECMWF, NOAA, Météo-France, Copernicus und NASA — jede Quelle steht unter <a href="/lizenzen/">Quellen &amp; Lizenzen</a>.',
        '<strong>Ehrlichkeit vor Scheingenauigkeit.</strong> Jede Ansicht nennt Quelle, Auflösung, Horizont und Grenze. Warnungen erscheinen nur als wörtliches Zitat der Wetterdienste; buscosun gibt selbst keine heraus.',
        '<strong>Ohne Konto, ohne Werbung, ohne Tracker.</strong> Keine Analytics, keine Cookies, selbst gehostete Schriften — nachprüfbar unter <a href="/ohne-tracker/">Ohne Tracker</a>.',
        '<strong>Alles im Browser.</strong> Es gibt keinen Server, der Daten sammelt: GRIB2-Dateien der Wetterdienste werden im Browser dekodiert, Radar und Modelle dort verrechnet. Die Kehrseite: keine Push-Benachrichtigungen bei geschlossener App.',
        '<strong>DACH.</strong> Deutschland, Österreich und die Schweiz mit ihren Asymmetrien: UV, Pollen und Warnflächen amtlich nur für Deutschland (und Warnungen für die Schweiz), Schneefallgrenze aus AROME nur für AT und CH, Hagel aus dem Schweizer Radar. Das wird gesagt, nicht geglättet.',
      ]) },
      { h2: 'Was buscosun kann', html: ul([
        '<a href="/wetterkarte">Wetterkarte</a> mit 19 Layern (Wind, Böen, Radar, höhenkorrigierte Temperatur, Gewitterpotenzial, Zellbahnen, Hagel, amtliche Warnungen …) und Modellwahl je Land',
        '<a href="/regenradar">Regenradar</a> aus drei Landesradaren mit Nowcast bis 2 Stunden',
        '<a href="/vorhersage">Vorhersage mit Konfidenz</a>, Modellvergleich und Trefferquote',
        '<a href="/tourenplanung">Tourenplanung</a>: Wetter je Kilometer zur Ankunftszeit, E-Bike-Reichweite, 3D-Schnitt',
        '<a href="/eventplanung">Event-Planung</a>: bester Tag, Phasen, Plan B, Foto-Licht, Astro-Nacht',
        '<a href="/wetterarchiv">Wetterarchiv</a> seit 1940 mit Klimastreifen und Kenntagen',
        '<a href="/atmosphaere">Atmosphäre</a>: Vertikalschnitt, Föhn, Thermik, Arbeitsfenster für Drohne und Kran',
        '<a href="/waldbrand">Brandradar</a>: Waldbrandgefahr, aktive Brände aus Satellitendaten, Brandnarben',
        '<a href="/globus">3D-Globus</a> mit dem globalen GFS-Windfeld',
      ]) },
      { h2: 'Was buscosun nicht ist', html: ul([
        'Kein amtliches Warnsystem und kein Einsatzwerkzeug für Feuerwehr oder Katastrophenschutz.',
        'Kein Flugwetter-Briefing (kein METAR/TAF), kein Lawinenlagebericht (nur Links zu SLF, lawinen.report, LWD Bayern), kein Seegangsmodell.',
        'Kein Alarmierungsdienst: Ohne Server gibt es keine zuverlässigen Push-Hinweise bei geschlossener App; der Kalender-Export ist der Ersatz.',
        'Kein B2B-Produkt: keine Konten, keine API, keine SLA.',
      ]) },
      { h2: 'Wie buscosun rechnet', html: p('Die Rechenwege sind offengelegt: <a href="/methodik/">Methodik</a> beschreibt Höhenkorrektur, Quellenmix, Radar-Nowcast, Konfidenz und Trefferquote, Event-Bewertung, Tourenplanung, E-Bike-Reichweite, Brandradar und die Wettermodelle — mit den Konstanten und Schwellen aus dem Code. Fachbegriffe erklärt das <a href="/glossar/">Glossar</a>, Phänomene das <a href="/wissen/">Wetterwissen</a>.') },
      { h2: 'Betreiber und Kontakt', html: (operatorKnown ? p(`Betreiber: ${OPERATOR.name}. `) : '') + p(`Anbieterkennzeichnung im <a href="/impressum/">Impressum</a>, Datenschutz unter <a href="/datenschutz/">Datenschutz</a>. Ideen, Wünsche und Fehlerberichte: <a href="/feedback">Feedback</a> oder <a href="/kontakt/">Kontakt</a> (${OPERATOR.email}).`) },
      { h2: 'Zitierhinweis', html: p('Wer buscosun zitiert: „buscosun (buscosun.com) — Wetter für DE · AT · CH aus amtlichen Quellen, höhenkorrigiert. Datenbasis: DWD, GeoSphere Austria, MeteoSchweiz u. a.; dargestellte Werte sind verändert (Höhenkorrektur, Quellenmix) und nicht identisch mit den Rohprodukten der Dienste." Für amtliche Warnungen gilt immer die Quelle selbst.') },
    ],
    faqs: [
      { q: 'Ist buscosun kostenlos?', a: 'Ja. Ohne Konto, ohne Werbung, ohne Tracker.' },
      { q: 'Woher kommen die Daten?', a: 'Von DWD, GeoSphere Austria, MeteoSchweiz, ECMWF, NOAA, Météo-France, Copernicus und NASA — Verzeichnis unter Quellen & Lizenzen.' },
      { q: 'Gibt buscosun Unwetterwarnungen heraus?', a: 'Nein. Die amtlichen Warnungen von DWD und MeteoSchweiz werden wörtlich zitiert; maßgeblich bleiben die Dienste.' },
      { q: 'Funktioniert buscosun offline?', a: 'Einmal geladene Ansichten und Daten bleiben über den Service Worker verfügbar; neue Vorhersagen brauchen Netz.' },
    ],
    related: ['/ohne-tracker/', '/methodik/', '/lizenzen/', '/funktionen/'],
    jsonLdType: 'AboutPage',
  };
}

/** /ohne-tracker/ — überprüfbare Trackerfreiheit aus den Daten der Datenschutzseite. */
export function buildOhneTrackerPage() {
  const hostCount = CONTACTED_HOSTS.reduce((n, g) => n + g.hosts.length, 0);
  const groups = CONTACTED_HOSTS.map((g) => `<h3>${g.group}${g.proxied ? ' (über den buscosun-Server weitergereicht, Ihre IP bleibt bei Netlify)' : ' (direkt vom Browser abgerufen — der Anbieter sieht Ihre IP)'}</h3>${ul(g.hosts)}`).join('');
  const storage = STORAGE_GROUPS.map((g) => `<h3>${g.purpose}</h3>${ul((g.keys ?? []).map((k) => `<code>${k}</code>`))}`).join('');
  return {
    slug: 'ohne-tracker',
    title: 'Ohne Tracker',
    h1: 'Ohne Tracker — und wie Sie das selbst nachprüfen',
    description: 'buscosun setzt keine Cookies, keine Analytics, keine Werbe- oder Social-Skripte und hostet seine Schriften selbst. Welche Server der Browser trotzdem kontaktiert und was lokal gespeichert wird — mit Anleitung zum Nachprüfen.',
    answer: `buscosun nutzt kein Analytics, keine Cookies, keine Werbe- oder Social-Media-Skripte, keine Google-Schriften und kein Fingerprinting. Was der Browser speichert, bleibt im Gerät (localStorage, Cache, IndexedDB) und wird nie übertragen. Trotzdem kontaktiert der Browser ${hostCount} fremde Server — die Wetterdienste, Kartenkacheln und die Ortssuche — und dort sieht der Anbieter die IP-Adresse. Diese Liste steht hier vollständig, damit sie sich mit den Entwicklerwerkzeugen jedes Browsers nachprüfen lässt.`,
    sections: [
      { h2: 'Was buscosun nicht tut', html: ul(['Keine Cookies, keine Analytics (auch kein „datenschutzfreundliches"), keine Werbung, keine Social-Buttons.', 'Keine Schriften von Google: seit dem 1. August 2026 sind Space Grotesk, IBM Plex Mono und League Spartan selbst gehostet.', 'Kein Konto, kein Login, keine E-Mail-Erfassung.', 'Kein Server, der Nutzungsdaten sammelt — die Messung der Reichweite beschränkt sich auf Server-Logs des Hosters, die buscosun derzeit nicht einmal auswertet.']) },
      { h2: 'Welche Server der Browser kontaktiert', html: p('Wetterdaten müssen irgendwoher kommen. Ein Teil läuft über den buscosun-Hoster (Netlify) als Proxy, der Rest direkt vom Browser zum Anbieter — dort sieht der Anbieter die IP-Adresse, wie bei jedem Bildaufruf im Netz. Vollständige Liste (Stand der Datenschutzseite):') + groups },
      { h2: 'Was im Gerät gespeichert wird', html: p('Alle Einträge liegen ausschließlich lokal im Browser und lassen sich jederzeit über die Browser-Einstellungen löschen:') + storage },
      { h2: 'So prüfen Sie das selbst', html: ul([
        '<strong>Netzwerk:</strong> Entwicklerwerkzeuge öffnen (F12 → „Netzwerk"), Seite neu laden. Jede Anfrage geht an buscosun.com oder an einen der oben genannten Anbieter. Keine Anfrage an google-analytics, googletagmanager, facebook, doubleclick oder ähnliche Domains.',
        '<strong>Cookies:</strong> „Anwendung/Speicher → Cookies": leer.',
        '<strong>Skripte:</strong> Der Quelltext der Seite (Strg+U) lädt nur eigene Dateien unter /assets/ — kein externes Skript.',
        '<strong>Schriften:</strong> „Netzwerk → Schriftarten": alle von buscosun.com/fonts/.',
      ]) },
      { h2: 'Was das kostet', html: p('Ohne Nutzungsdaten gibt es keinen Funnel und keine A/B-Tests; Produktentscheidungen entstehen aus Feedback und Messungen an den eigenen Systemen. Und ohne Server gibt es keine Push-Benachrichtigungen bei geschlossener App. Beides ist Absicht.') },
    ],
    faqs: [
      { q: 'Sieht der DWD meine IP-Adresse?', a: 'Nur für Abrufe, die direkt vom Browser gehen; die meisten DWD-Abrufe laufen über den buscosun-Proxy bei Netlify. Die Liste oben nennt beide Gruppen.' },
      { q: 'Nutzt buscosun Google Fonts?', a: 'Nein, seit dem 1. August 2026 sind alle Schriften selbst gehostet.' },
      { q: 'Wie misst buscosun dann seine Reichweite?', a: 'Gar nicht im Browser. Es gibt nur die Server-Logs des Hosters, die derzeit nicht ausgewertet werden.' },
    ],
    related: ['/ueber/', '/datenschutz/', '/lizenzen/'],
  };
}

export function allMethodikPages() {
  return [...METHODIK_PAGES, buildWettermodellePage()];
}
