/**
 * SEO-Texte je Wetterkarten-Layer (SEO/GEO 2026, E1): H1, Direktantwort-Lead,
 * Fließtext, Faktenliste und passender Explainer — die EINE Quelle für die
 * statischen Sub-Routen-Shells (`scripts/generate-seo.mjs`, Roh-HTML für Crawler)
 * und den gerenderten Block nach dem App-Mount (`RouteSeoBlock`, lazy, E2).
 *
 * Bewusst getrennt von `src/map/layerCatalog.ts` (Dock-Label/Tooltip): diese Texte
 * dürfen NICHT ins Start-Bundle (Budget-Ratsche eagerJs 107,9 KB gzip) — nur
 * Build und lazy-Chunk laden sie.
 *
 * Fachliche Regeln (D-04): jede Beschreibung nennt Quelle, Auflösung, Horizont,
 * Länderabdeckung UND die Grenze. Warnsprache nur beim Layer `warnings`, dort nur
 * als Beschreibung des Zitats. Rotation konservativ formuliert.
 * Kein React, kein DOM; Node lädt per `--experimental-strip-types`.
 */

import type { LayerKey } from '../map/layerTypes';

export interface LayerFact {
  label: string;
  text: string;
}

export interface SeoText {
  /** H1 der Seite. */
  h1: string;
  /** Direktantwort-Lead (≥ 60 Wörter): Was zeigt die Ansicht, woher, für wen. */
  lead: string;
  /** Fließtext-Absätze (je ≥ 40 Wörter). */
  body: readonly string[];
  /** Faktenliste: Quelle · Auflösung/Takt · Horizont · Abdeckung · Grenze. */
  facts: readonly LayerFact[];
  /** Passender Explainer unter /wissen/<slug>/ (null = keiner). */
  explainer: string | null;
}

const DACH = 'Deutschland, Österreich und die Schweiz';

export const LAYER_SEO: Readonly<Record<LayerKey, SeoText>> = {
  wind: {
    h1: `Windkarte für ${DACH}`,
    lead: `Die Windkarte von buscosun zeigt Richtung und Geschwindigkeit des Windes in 10 Metern Höhe als animierte Partikel über einer Geschwindigkeits-Heatmap — für ${DACH} aus dem DWD-Modell ICON-D2 mit 2,2 Kilometern Auflösung, stündlich bis zwölf Stunden voraus. Die Partikel bewegen sich exakt proportional zur Modellgeschwindigkeit; wer Höhenwind braucht, schaltet im Wind-Panel auf die Druckflächen 850, 700 oder 500 hPa aus ICON-EU um.`,
    body: [
      'Der Layer ist für alle gebaut, die Wind planen müssen: Segler und Surfer auf den Alpenseen, Drohnen- und Gleitschirmpiloten, Radfahrer mit Gegenwind, Zeltaufbau auf einem Festival. Die Heatmap zeigt die Fläche, die Partikel die Strömung; die Dichte der Partikel lässt sich regeln, und „Aus" behält nur die Heatmap. Der Zeit-Schieber läuft in Zehntelstunden, die angezeigte Stunde ist die Gültigkeitszeit des Modelllaufs, nicht die Uhrzeit des Abrufs.',
      'Grenzen, die die Karte selbst benennt: Ein 2,2-km-Modell kennt keine Böen zwischen Häusern und keine Düsen in engen Tälern; die Böenkarte zeigt Spitzen, die Windkarte den Mittelwind. Außerhalb von DE, AT und CH wird die Fläche abgedunkelt, weil das Modell dort zwar rechnet, buscosun aber nur den DACH-Raum verantwortet. Der Datenstand steht in der Statuspille — bei mehr als 45 Minuten Verzug heißt es „Stand HH:MM" statt „jetzt".',
    ],
    facts: [
      { label: 'Quelle', text: 'DWD ICON-D2, Windkomponenten u/v in 10 m (GeoNutzV)' },
      { label: 'Auflösung · Takt', text: '2,2 km · stündlich, acht Modellläufe am Tag' },
      { label: 'Horizont', text: '0 bis +12 h; Höhenwind 850/700/500 hPa aus ICON-EU (~7 km)' },
      { label: 'Abdeckung', text: 'DE, AT, CH vollständig; jenseits der Grenzen abgedunkelt' },
      { label: 'Grenze', text: 'Mittelwind, keine Böen; keine Straßenschluchten, keine Talwind-Systeme unter 2 km' },
    ],
    explainer: 'windboeen-sturm',
  },
  gust: {
    h1: `Böenkarte für ${DACH}`,
    lead: `Die Böenkarte zeigt die erwartete Spitzenböe in 10 Metern Höhe als Fläche über ${DACH} — aus dem DWD-Modell ICON-D2 (Feld vmax_10m, 2,2 km) für jede Stunde bis 24 Stunden voraus. Sie ist der Layer für alles, was bei Böen gefährlich wird: Kranarbeit, Gerüst, Drohnenflug, Zeltaufbau, Segeln. Die Farbrampe orientiert sich an Beaufort; ab Sturmböen kippt sie ins Rote.`,
    body: [
      'Böen sind nicht der Mittelwind: Das Modell rechnet aus Turbulenz und Schichtung die wahrscheinliche Spitze je Stunde. Für einen Arbeitstag lässt sich damit ablesen, ab wann ein Grenzwert gerissen wird — die Atmosphäre-Ansicht „Arbeitsfenster" macht daraus eine GO/NO-GO-Zeitleiste mit einstellbarem Böengrenzwert und Arbeitshöhe. Die Karte selbst bleibt die Übersicht: Wo baut sich die Böenfront auf, wann erreicht sie den eigenen Ort.',
      'Ehrliche Grenze: 2,2 km Gitterweite glätten Kuppen und Talausgänge, in denen reale Böen deutlich höher liegen können. Die Karte ist kein amtliches Warnprodukt — für Sturmwarnungen gilt der Layer „Amtliche Warnungen" mit dem wörtlichen DWD- bzw. MeteoSchweiz-Text. Für Österreich fehlt dort weiterhin die amtliche Quelle; die Böenkarte deckt AT trotzdem ab, weil ICON-D2 über die Grenze reicht.',
    ],
    facts: [
      { label: 'Quelle', text: 'DWD ICON-D2, vmax_10m (Spitzenböe je Stunde)' },
      { label: 'Auflösung · Takt', text: '2,2 km · stündlich' },
      { label: 'Horizont', text: '0 bis +24 h' },
      { label: 'Abdeckung', text: 'DE, AT, CH' },
      { label: 'Grenze', text: 'Modellböe, keine Messung; Kuppen und Düsen unter 2 km werden geglättet; kein Warnprodukt' },
    ],
    explainer: 'windboeen-sturm',
  },
  nowcast: {
    h1: `Niederschlagskarte für ${DACH} — Radar und Nowcast bis 2 Stunden`,
    lead: `Die Niederschlagskarte legt die drei Landesradare als ein Komposit über ${DACH}: RADOLAN-RV des DWD (bis zwei Stunden voraus), INCA von GeoSphere Austria (bis drei Stunden) und das MeteoSchweiz-Radar (Analyse). Jede Kartenzelle nimmt die Quelle des Landes, in dem sie liegt. Am Radarhorizont endet der Layer bewusst — buscosun verlängert ihn nicht mit Modellregen, weil das die Verlässlichkeit des gemessenen Radars verwässern würde.`,
    body: [
      'Wer wissen will, ob es in der nächsten Stunde nass wird, braucht Messung, nicht Modell. Der Layer zeigt die gemessene Reflektivität in Millimeter pro Stunde und die amtlichen Nowcasts der Wetterdienste, im Fünf-Minuten-Takt (DE) bzw. Viertelstunden-Takt (AT). Die Textur wird in Echtzeit auf die vier echten Geo-Ecken des Radarprodukts gewarpt; beim Ziehen des Zeit-Schiebers tauschen die Frames flüssig.',
      'Grenzen: Die Schweizer Quelle liefert eine Analyse, keinen Nowcast — dort endet die Zeitachse nach einer halben Stunde. Radar sieht Niederschlag in der Höhe; im Winter kann Regen am Boden Schnee sein und umgekehrt (dafür gibt es die Schneefallgrenze). Radarschatten hinter Gebirgszügen erscheinen als „kein Niederschlag", obwohl es dort regnen kann; das Regenradar zeigt diese Zonen als „Radarsicht" gesondert.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD RADOLAN-RV · GeoSphere INCA · MeteoSchweiz rzc/RR' },
      { label: 'Auflösung · Takt', text: '1 km · 5 min (DE), 1 km · 15 min (AT), 1 km (CH Analyse)' },
      { label: 'Horizont', text: 'DE bis +2 h, AT bis +3 h, CH nur jetzt — keine Modellverlängerung' },
      { label: 'Abdeckung', text: 'DE, AT, CH je aus dem eigenen Landesradar; Grenzsäume aus dem Nachbarradar' },
      { label: 'Grenze', text: 'Radar misst in der Höhe, nicht am Boden; Radarschatten im Gebirge; Phase (Regen/Schnee) nicht enthalten' },
    ],
    explainer: 'regenradar-radolan-inca-rzc',
  },
  temp: {
    h1: `Temperaturkarte für ${DACH} — höhenkorrigiert auf das echte Gelände`,
    lead: `Die Temperaturkarte zeigt die 2-Meter-Temperatur aus dem DWD-Modell ICON-D2 für ${DACH}, stündlich bis 24 Stunden voraus — und korrigiert jeden Bildpunkt auf die tatsächliche Geländehöhe. Das Modell rechnet auf einer geglätteten 2,2-km-Oberfläche; buscosun legt ein digitales Geländemodell darunter und rechnet mit der Lapse-Rate auf Gipfel, Grat und Talboden um. Deshalb sind Alpentäler und Höhenzüge hier so differenziert wie in keiner anderen Wetterkarte für den DACH-Raum.`,
    body: [
      'Die Korrektur passiert im Grafik-Shader je Pixel: Das Geländemodell steckt als Höhenkanal in der Textur, die Differenz zur Modelloberfläche wird mit der Lapse-Rate multipliziert. Die Stadt-Labels auf der Karte werden mit exakt derselben Arithmetik berechnet, nicht aus einem separaten Punktwert — was am Label steht, ist der Wert der Fläche darunter. Ab Zoomstufe 8 kommen die Orte der Basiskarte als zusätzliche Labels dazu.',
      'Grenzen: Die Lapse-Rate ist ein Mittelwert; bei Inversionen (Kaltluftsee im Tal, Sonne am Berg) kehrt sich das Verhältnis um, und die Karte kann das Tal zu warm zeigen. Die Atmosphäre-Ansicht erkennt Inversionen ausdrücklich; der Punktforecast rechnet die Lapse-Rate aus den umliegenden Stationen statt mit dem Standardwert. Der Datenstand steht in der Statuspille, veraltete Läufe werden markiert.',
    ],
    facts: [
      { label: 'Quelle', text: 'DWD ICON-D2, t_2m; Gelände: Mapzen/AWS Terrarium-DEM (~30 m)' },
      { label: 'Auflösung · Takt', text: '2,2 km Modell, per Pixel höhenkorrigiert · stündlich' },
      { label: 'Horizont', text: '0 bis +24 h' },
      { label: 'Abdeckung', text: 'DE, AT, CH' },
      { label: 'Grenze', text: 'Standard-Lapse-Rate, keine Inversionen im Flächenbild; Modellwert, keine Messung' },
    ],
    explainer: 'hoehenkorrektur-lapse-rate',
  },
  clouds: {
    h1: `Bewölkungskarte für ${DACH} — tief, mittel und hoch getrennt`,
    lead: `Die Bewölkungskarte zeigt drei Wolkenstockwerke getrennt: tiefe, mittelhohe und hohe Bewölkung aus dem DWD-Modell ICON-D2 für ${DACH}. Statt einer einzigen Prozentzahl komponiert der Layer die Schichten höhenbewusst übereinander — so ist zu sehen, ob eine Hochnebeldecke unter blauem Himmel liegt oder Cirrus über freiem Tal. Das ist die Ansicht für Fotografen, Astro-Nächte und alle, die wissen wollen, ob die Sonne durchkommt.`,
    body: [
      'Für die Lichtplanung zählt die Schichtung: Hohe Schleierwolken geben weiches Licht und Abendrot, tiefe Stratusdecken schlucken beides. Die Event-Planung nutzt dieselben Felder für den Foto-Licht- und den Astro-Nacht-Modus; die Karte zeigt die Fläche dazu. Der Zeit-Schieber läuft bis zum Horizont der geladenen Wolkenfelder, sub-stündlich interpoliert.',
      'Grenzen: Wolken sind im Modell das unsicherste Feld — Nebel und Hochnebel entstehen unterhalb der Gitterauflösung und werden oft zu spät oder zu früh aufgelöst. Ob der Nebel in einem bestimmten Tal aufreißt, sagt die Karte nicht; die Atmosphäre-Ansicht mit Inversionshöhe und Nebelobergrenze ist dafür das bessere Werkzeug. Dieser Layer ist nicht im Standard-Dock, aber über diese Adresse jederzeit erreichbar.',
    ],
    facts: [
      { label: 'Quelle', text: 'DWD ICON-D2, CLCL / CLCM / CLCH (+ CLCT)' },
      { label: 'Auflösung · Takt', text: '2,2 km · stündlich, sub-stündlich interpoliert' },
      { label: 'Horizont', text: 'bis zum geladenen Wolkenhorizont (typisch 12–27 h)' },
      { label: 'Abdeckung', text: 'DE, AT, CH' },
      { label: 'Grenze', text: 'Nebel/Hochnebel unter der Gitterweite unsicher; Modell, keine Satellitenmessung' },
    ],
    explainer: 'nebel-hochnebel-nebelobergrenze',
  },
  sat: {
    h1: 'Satellitenbild Europa und Welt — Meteosat über der Wetterkarte',
    lead: `Der Satellitenlayer legt das Meteosat-Bild über die Wetterkarte: als Europa-Ausschnitt in Echtfarbe am Tag und Infrarot in der Nacht (1 km) oder als Welt-Mosaik im Infrarotkanal 10,8 µm (3 km). Die Bilder kommen über den DWD-OpenData-Kartendienst und werden alle drei Stunden erneuert. Sie zeigen die gemessene Wolkenverteilung über Europa — die Referenz, an der sich jede Wolkenprognose der Modelle messen lassen muss.`,
    body: [
      'Ein Satellitenbild beantwortet „Wo sind gerade Wolken?" ehrlicher als jedes Modell. In Kombination mit dem Bewölkungslayer lässt sich sehen, ob das Modell die Front richtig legt; in Kombination mit dem Regenradar, ob die Zellen unter dem Wolkenschirm wirklich Niederschlag bringen. Der Umschalter „EU / Welt" wechselt zwischen dem hochaufgelösten Ausschnitt und dem globalen Infrarot-Mosaik.',
      'Grenzen: Drei Stunden Takt sind für Gewitterlagen zu grob — die Zellbahnen (KONRAD3D) und das Regenradar laufen im Fünf-Minuten-Takt und sind dort die richtige Wahl. Das Infrarotbild zeigt Wolkenoberflächen-Temperaturen: Hohe, kalte Wolken erscheinen hell, tiefe warme Wolken und Nebel bleiben unauffällig. Datenherkunft ist EUMETSAT, die Bereitstellung erfolgt durch den DWD.',
    ],
    facts: [
      { label: 'Quelle', text: 'EUMETSAT Meteosat über DWD OpenData WMS' },
      { label: 'Auflösung · Takt', text: 'EU RGB/IR 1 km, Welt IR 3 km · alle 3 h' },
      { label: 'Horizont', text: 'nur Messung (kein Vorhersagebild)' },
      { label: 'Abdeckung', text: 'Europa bzw. Welt' },
      { label: 'Grenze', text: '3-h-Takt, keine Gewitterverfolgung; Nebel im IR schwer erkennbar' },
    ],
    explainer: null,
  },
  lightning: {
    h1: 'Blitzkarte — Einschläge der letzten 60 Minuten',
    lead: `Die Blitzkarte zeigt die gemessenen Blitzeinschläge der letzten Stunde aus dem Blitzortungsnetz des DWD (Linet/Sferics) als Fläche über der Wetterkarte, erneuert etwa alle zehn Minuten. Sie ist die Messung zum Gewitter: Wo es in der letzten Stunde geblitzt hat, ist die Zelle aktiv. Zusammen mit den Zellbahnen (Zugrichtung) und der Blitzprognose (was das Modell erwartet) ergibt sich das vollständige Gewitterbild.`,
    body: [
      'Für Klettersteig, Segeln, Baustelle und Veranstaltung ist die Frage „blitzt es schon?" die wichtigste. Der Layer beantwortet sie mit Messdaten, nicht mit Modellwerten. Die Farbdichte entspricht der Blitzhäufigkeit je Fläche; ein Klick auf die Karte öffnet keinen Blitz-Steckbrief, die Fläche ist ein Aggregat.',
      'Grenzen: Die Quelle ist ein Kartendienst des DWD mit Schwerpunkt Deutschland; Österreich und die Schweiz sind am Rand abgedeckt, aber nicht mit derselben Dichte. Ein Blitz vor 55 Minuten und einer vor 5 Minuten sehen gleich aus — für die Bewegung der Zelle sind die Zellbahnen zuständig. Die Karte ist kein amtliches Warnprodukt; Gewitterwarnungen stehen im Layer „Amtliche Warnungen".',
    ],
    facts: [
      { label: 'Quelle', text: 'DWD OpenData WMS „Accumulated Flash Area" (Linet/Sferics)' },
      { label: 'Auflösung · Takt', text: 'Flächenaggregat · ~10 min' },
      { label: 'Horizont', text: 'letzte 60 Minuten (Messung)' },
      { label: 'Abdeckung', text: 'DE vollständig, AT/CH am Rand' },
      { label: 'Grenze', text: 'kein Zeitverlauf innerhalb der Stunde; kein Warnprodukt' },
    ],
    explainer: 'gewitter-unwetter',
  },
  lightningfc: {
    h1: `Blitzprognose für ${DACH} — Lightning Potential Index bis 12 Stunden`,
    lead: `Die Blitzprognose zeigt, wo das DWD-Modell ICON-D2 in den nächsten zwölf Stunden Blitze für möglich hält: den Lightning Potential Index (lpi_max) als Fläche über ${DACH}, stündlich über den Zeit-Schieber. Der Index misst, wie viel Energie ein Gewitteraufwind in Graupel und Eis umsetzen kann — die physikalische Voraussetzung für Blitze. Die Palette ist bewusst violett, damit sie sich von den gemessenen Blitzen (bernstein) und dem Gewitterpotenzial (magenta) unterscheidet.`,
    body: [
      'Der Layer ist die Vorwarnung vor dem ersten Radarecho: Wer am Nachmittag einen Klettersteig, eine Regatta oder einen Kranhub plant, sieht am Vormittag, ob und wann Blitze im Bereich des Möglichen liegen. Die Bänder 1/3/8/15/30 J/kg sind an der Skala des Modells orientiert; unter dem ersten Band bleibt die Fläche transparent.',
      'Grenzen: Prognose ist nicht Messung — die gemessenen Einschläge der letzten Stunde zeigt der Layer „Blitze". Der Index sagt, dass ein Gewitter blitzen könnte, nicht, dass es entsteht; deshalb bündelt der Layer „Gewitterpotenzial" LPI mit CAPE und CIN. Am Modellrand ohne Wert, nur im nahen Vorhersagehorizont, kein amtliches Warnprodukt.',
    ],
    facts: [
      { label: 'Quelle', text: 'DWD ICON-D2, lpi_max' },
      { label: 'Auflösung · Takt', text: '2,2 km · stündlich' },
      { label: 'Horizont', text: '0 bis +12 h' },
      { label: 'Abdeckung', text: 'DE, AT, CH' },
      { label: 'Grenze', text: 'Potenzial, keine Auslösung; kein Warnprodukt; Prognose ≠ Messung' },
    ],
    explainer: 'gewitter-unwetter',
  },
  stations: {
    h1: `Wetterstationen in ${DACH} — Live-Messwerte auf der Karte`,
    lead: `Der Stationslayer zeigt rund tausend amtliche Messstationen in ${DACH} mit ihren aktuellen Werten: die DWD-Stationen über BrightSky, das TAWES-Netz von GeoSphere Austria und das SwissMetNet (SMN) von MeteoSchweiz. Ein Klick öffnet Temperatur, Wind, Niederschlag und Bewölkung der Station samt Höhe und Kennung. Das ist die Messung, an der sich jede Modellkarte messen lassen muss — und die Grundlage, mit der der Punktforecast von buscosun seine Modelle verankert.`,
    body: [
      'Für Wetter-Enthusiasten ist der Layer die schnellste Plausibilitätsprüfung: Zeigt die Temperaturkarte 24 Grad und die Station daneben 19, weiß man, was das Modell gerade nicht sieht. Die Stationen werden erst beim Aktivieren geladen; die Schweizer Werte kommen aus einzelnen CSV-Dateien je Station, die deutschen Werte werden beim Klick nachgeladen.',
      'Grenzen: Die drei Netze messen unterschiedlich oft und veröffentlichen mit unterschiedlichem Verzug; der angezeigte Zeitstempel ist der der Station, nicht der des Abrufs. Stationswerte gelten für den Standort — eine Bergstation auf 2 500 Metern sagt nichts über das Tal. Die Lizenzen der drei Dienste stehen auf der Seite „Quellen & Lizenzen".',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD (via BrightSky) · GeoSphere TAWES · MeteoSchweiz SMN' },
      { label: 'Umfang', text: '~650 DE · ~200 AT · ~160 CH Stationen' },
      { label: 'Takt', text: 'Stationsabhängig, 10 min bis 1 h' },
      { label: 'Abdeckung', text: 'DE, AT, CH' },
      { label: 'Grenze', text: 'Punktmessung am Standort; Verzug je Netz unterschiedlich' },
    ],
    explainer: null,
  },
  confidence: {
    h1: 'Vorhersage-Sicherheit als Karte — wo die Wettervorhersage unsicher ist',
    lead: `Der Sicherheitslayer legt eine Kreuzschraffur über die Wetterkarte: je dichter, desto unsicherer die Vorhersage an dieser Stelle. Er hat zwei Modi, die automatisch wechseln. Mit aktivem Niederschlag zeigt er den echten Spread eines 15-Member-Ensembles, das das Radar mit gestörten Bewegungsfeldern in die Zukunft schiebt (Deutschland). Ohne Niederschlag zeigt er, wie stark die Temperaturvorhersage von der 30-jährigen DWD-Stationsklimatologie abweicht und wie einig sich zwei aufeinanderfolgende ICON-D2-Läufe sind.`,
    body: [
      'Unsicherheit als Fläche gibt es sonst nirgends: Wetterkarten zeigen eine Zahl, als wäre sie sicher. buscosun zeigt daneben, wo die Zahl trägt und wo nicht — an Niederschlagskanten, in fernen Vorlaufzeiten, bei ungewöhnlichen Temperaturen. Muster statt Farbe, damit die Schraffur als Interpretation lesbar bleibt und die Datenfarbe darunter nicht verfälscht.',
      'Grenzen: Der Regen-Modus ist auf Deutschland und etwa 60 Minuten begrenzt (RADOLAN-Basis); der Temperatur-Modus vergleicht zwei Läufe, kein volles Ensemble. Die Klimatologie ist ein gebündeltes Stationsraster (1995–2024), höhenkorrigiert mit 6,5 K/km. Wie gut der Regen-Modus wirklich kalibriert ist, rechnet die Validierungsseite live gegen das beobachtete Radar nach.',
    ],
    facts: [
      { label: 'Quellen', text: 'RADOLAN-Flow-Ensemble (15 Member) · DWD-Stationsklimatologie · zwei ICON-D2-Läufe' },
      { label: 'Modi', text: 'Regen (mit Niederschlagslayer) · Temperatur (sonst) — automatisch' },
      { label: 'Horizont', text: 'Regen ~60 min (DE) · Temperatur bis +24 h' },
      { label: 'Abdeckung', text: 'Regen-Modus DE; Temperatur-Modus DACH' },
      { label: 'Grenze', text: 'Zwei-Lauf-Vergleich statt Ensemble; Klimatologie 1995–2024; Kalibrierung schwankt mit der Wetterlage' },
    ],
    explainer: 'modellvergleich-unsicherheit',
  },
  snowline: {
    h1: `Schneefallgrenze für ${DACH} — die Linie zwischen Regen und Schnee`,
    lead: `Die Schneefallgrenze zeigt als Linie über der Wetterkarte, oberhalb welcher Höhe Niederschlag als Schnee fällt — für ${DACH}, stündlich über den Zeit-Schieber. Die Linie folgt dem Gelände: Sie wird aus dem höhenkorrigierten Temperaturfeld von ICON-D2 berechnet, mit einem physikalischen Anker um +1 °C und einer aus DWD-Stationsdaten gelernten Orts-Korrektur. In milder Tieflandsluft existiert keine Linie — dann ist überall Regen, und die Karte sagt das.`,
    body: [
      'Für Skitour, Winterdienst, Pässe und Alpenwanderungen ist die Schneefallgrenze die entscheidende Zahl: 300 Meter Unterschied entscheiden zwischen Pulverschnee und Regen. Die Linie ist mit Kontur und Saum gezeichnet, damit sie über jeder Farbfläche lesbar bleibt. Der Punktforecast nennt für AT und CH zusätzlich die Schneefallgrenze aus AROME in Metern.',
      'Grenzen: Die Grenze liegt in Wirklichkeit einige hundert Meter unter der Nullgradgrenze und schwankt mit Niederschlagsintensität und Luftfeuchte — die gelernte Korrektur bildet das ortsweise ab, nicht wetterlagenweise. Die Linie ist ein Modellprodukt, keine Messung; Radar kennt die Phase nicht. Nicht im Standard-Dock, über diese Adresse jederzeit erreichbar.',
    ],
    facts: [
      { label: 'Quelle', text: 'DWD ICON-D2 t_2m + Terrarium-DEM; Orts-Korrektur aus DWD-Stationshistorie (P(Schnee|T,RH))' },
      { label: 'Auflösung · Takt', text: '2,2 km Modell, Linie dem Gelände folgend · stündlich' },
      { label: 'Horizont', text: '0 bis +24 h' },
      { label: 'Abdeckung', text: 'DE, AT, CH' },
      { label: 'Grenze', text: 'Modell, keine Messung; Intensitätsabhängigkeit nicht aufgelöst; bei milder Luft keine Linie' },
    ],
    explainer: 'schneefallgrenze',
  },
  flownowcast: {
    h1: 'Flow-Nowcast — das Radarbild eine Stunde weitergeschoben',
    lead: `Der Flow-Nowcast schiebt das gemessene Radarbild in die nahe Zukunft: Aus zwei aufeinanderfolgenden RADOLAN-Frames wird das Bewegungsfeld geschätzt (Horn-Schunck) und der Niederschlag intensitätserhaltend entlang dieser Bewegung weitergeführt, etwa 60 Minuten weit. Das ist die einfachste ehrliche Form eines Nowcasts: kein Training, keine Modellannahme, nur die beobachtete Bewegung der letzten fünf Minuten. Verfügbar für Deutschland, wo das RADOLAN-Radar des DWD im Fünf-Minuten-Takt vorliegt.`,
    body: [
      'Der Layer ist vor allem Referenz und Baustein: Die Regenwahrscheinlichkeit („Regen-Chance") und der Regen-Modus der Vorhersage-Sicherheit bauen auf demselben Bewegungsfeld auf, nur mit 15 gestörten Varianten. Wer sehen will, was das reine Verschieben leistet, schaltet diesen Layer neben den amtlichen Nowcast (RADOLAN-RV) — die Differenz ist die Wirkung der Modellphysik.',
      'Grenzen: Verschieben kann kein Wachsen und kein Zerfallen — eine Zelle, die sich auflöst, wandert im Flow-Nowcast unverändert weiter. Deshalb ist der amtliche RADOLAN-RV-Nowcast der Standardlayer für Niederschlag und dieser hier nicht im Dock. Nur Deutschland, nur wenn mindestens zwei Radarframes vorliegen.',
    ],
    facts: [
      { label: 'Quelle', text: 'DWD RADOLAN (zwei Frames im Abstand von 5 min)' },
      { label: 'Verfahren', text: 'Horn-Schunck-Bewegungsfeld + semi-Lagrange-Advektion, vergröbert auf ~140×150' },
      { label: 'Horizont', text: '~0 bis +60 min' },
      { label: 'Abdeckung', text: 'nur DE' },
      { label: 'Grenze', text: 'keine Entstehung/Auflösung von Zellen; trainingsfrei' },
    ],
    explainer: 'regenradar-radolan-inca-rzc',
  },
  poprob: {
    h1: 'Regenwahrscheinlichkeit für die nächste Stunde — kalibriertes Flow-Ensemble',
    lead: `Die Regen-Chance zeigt für jede Kartenzelle in Deutschland, wie wahrscheinlich es in den nächsten 60 Minuten regnet — in Prozent, nicht in Millimetern. Dahinter steht ein Ensemble aus 15 Varianten des Flow-Nowcasts: fünf Tempo-Skalen mal drei Richtungsstörungen schieben das Radarbild je etwas anders; der Anteil der Varianten, die eine Zelle nass machen, ist die Wahrscheinlichkeit. Die Skala ist isotonisch kalibriert, damit 70 Prozent auch 70 Prozent bedeuten.`,
    body: [
      '„Wie wahrscheinlich" ist für Pendler und Eltern oft die nützlichere Frage als „wie viel": 30 Prozent Chance heißt Regenjacke einpacken, 90 Prozent heißt zehn Minuten warten. Das Regenradar zeigt dieselbe Rechnung als Streifen für den eigenen Standort; die Validierungsseite rechnet live nach, wie gut die Prozentwerte gegen das beobachtete Radar kalibriert sind (Brier Score, Reliability).',
      'Grenzen: Nur Deutschland (RADOLAN-Basis), nur etwa eine Stunde, und wie beim Flow-Nowcast ohne Entstehung neuer Zellen — die Wahrscheinlichkeit, dass ein Gewitter erst entsteht, kann das Ensemble nicht kennen. Die Prozentwerte gelten je Kartenzelle von etwa einem Kilometer, nicht für den Garten dahinter. Nicht im Standard-Dock; über diese Adresse jederzeit erreichbar.',
    ],
    facts: [
      { label: 'Quelle', text: 'DWD RADOLAN, Flow-Ensemble mit 15 Membern' },
      { label: 'Verfahren', text: '5 Tempo-Skalen × 3 Richtungsstörungen, isotone Kalibrierung' },
      { label: 'Horizont', text: '~0 bis +60 min' },
      { label: 'Abdeckung', text: 'nur DE' },
      { label: 'Grenze', text: 'keine Neuentstehung von Zellen; Kalibrierung schwankt mit der Wetterlage (s. Validierung)' },
    ],
    explainer: 'modellvergleich-unsicherheit',
  },
  thunder: {
    h1: `Gewitterpotenzial für ${DACH} — CAPE, CIN und Blitzbereitschaft in einer Karte`,
    lead: `Das Gewitterpotenzial fasst drei Modellgrößen zu einem Index von 0 bis 100 zusammen: die verfügbare Energie (CAPE), den Deckel, der die Auslösung hemmt (CIN), und die Blitzbereitschaft (LPI) — aus dem DWD-Modell ICON-D2 für ${DACH}, stündlich bis zwölf Stunden voraus. Hohe Energie allein ist noch kein Gewitter; erst wenn der Deckel schwach ist und der Aufwind Eis bilden kann, wird es kritisch. Genau das zeigt die Fläche.`,
    body: [
      'Der Layer ist die Vorwarnung vor dem ersten Radarecho: Am Vormittag lässt sich sehen, welche Region am Nachmittag zündet. Für Klettersteig-Geher, Segler, Veranstalter und Baustellen ist das die Planungsgrundlage; sobald es tatsächlich losgeht, übernehmen Blitzkarte (Messung) und Zellbahnen (Zugrichtung). Die Stufen 8/30/55/78 sind an der Verteilung des Index kalibriert, unter 8 bleibt die Fläche transparent.',
      'Grenzen: Potenzial ist nicht Auslösung — ob ein Gewitter entsteht, hängt an Auslösern (Front, Gebirge, Konvergenz), die das Modell auf 2,2 km nur teilweise auflöst. Am Modellrand bleibt die Fläche ohne Wert, jenseits von zwölf Stunden endet der Layer. Kein amtliches Warnprodukt: Gewitterwarnungen stehen wörtlich im Layer „Amtliche Warnungen".',
    ],
    facts: [
      { label: 'Quelle', text: 'DWD ICON-D2: cape_ml, cin_ml, lpi_max' },
      { label: 'Auflösung · Takt', text: '2,2 km · stündlich' },
      { label: 'Horizont', text: '0 bis +12 h' },
      { label: 'Abdeckung', text: 'DE, AT, CH' },
      { label: 'Grenze', text: 'Potenzial ≠ Auslösung; kein Warnprodukt' },
    ],
    explainer: 'gewitter-unwetter',
  },
  snow: {
    h1: `Schneekarte für ${DACH} — Schneedecke und Neuschnee`,
    lead: `Die Schneekarte zeigt die Schneemenge als Fläche in Zentimetern über ${DACH}, in zwei umschaltbaren Modi: die aktuelle Schneedecke (ICON-D2 h_snow) und den Neuschnee-Zuwachs über das Vorhersagefenster (aus dem Schneewasseräquivalent snow_gsp + snow_con in Zentimeter umgerechnet). Das ist die Schneemenge als Fläche für Ski, Skitour, Pässe und Winterdienst — die Linie zwischen Regen und Schnee ist der eigene Layer „Schneefallgrenze".`,
    body: [
      'Für Skifahrer, Skitourengeher, Winterdienst und Pässe ist die Karte die schnelle Antwort auf „wie viel liegt, wie viel kommt": Der Decke-Modus zeigt das Ist des Modells, der Neuschnee-Modus summiert, was bis zur eingestellten Stunde dazukommt. Beide Modi nutzen dieselbe Palette, die Sättigung liegt bei 150 cm (Decke) bzw. 50 cm (Neuschnee).',
      'Grenzen: Modellwerte, keine Messung — das Modell kennt weder Pistenpräparierung noch Windverfrachtung. Die Umrechnung von Schneewasser in Zentimeter ist eine Näherung (Schneedichte bevorzugt aus dem Modell, sonst Standardwert). Für Lawinen gibt es keinen Layer: buscosun modelliert keine Lawinengefahr und verlinkt oberhalb von 1 000 Metern die amtlichen Lageberichte.',
    ],
    facts: [
      { label: 'Quelle', text: 'DWD ICON-D2: h_snow (Decke), snow_gsp + snow_con (Neuschnee), rho_snow' },
      { label: 'Auflösung · Takt', text: '2,2 km · stündlich' },
      { label: 'Horizont', text: 'Decke jetzt; Neuschnee akkumuliert bis zur gewählten Stunde' },
      { label: 'Abdeckung', text: 'DE, AT, CH' },
      { label: 'Grenze', text: 'Modell, keine Messung; Schnee-Wasser-Verhältnis genähert; keine Lawinenaussage' },
    ],
    explainer: 'schneefallgrenze',
  },
  rotation: {
    h1: `Rotationspotenzial für ${DACH} — Experten-Layer für rotierende Gewitter`,
    lead: `Das Rotationspotenzial ist ein Experten-Layer: Es zeigt geglättete Modell-Verdachtsflächen für rotierende Aufwinde aus dem DWD-Modell ICON-D2 — Updraft-Helicity in zwei Schichten (uh_max, uh_max_low) und den Supercell Detection Index (sdi_2), zu einem Score von 0 bis 100 verrechnet, für ${DACH} bis zwölf Stunden voraus. Rotierende Gewitter (Superzellen) bringen Großhagel und organisierte Schwergewitter. Die Karte formuliert bewusst zurückhaltend: Verdacht, nicht Ereignis.`,
    body: [
      'Der Layer ist für Wetter-Enthusiasten und Storm-Spotter gedacht, die die Modellsignale kennen. Die Palette ist entsättigt violett, die Aktivierungsschwelle liegt bei Score 20, die Felder werden mit einem 5×5-Mittel geglättet — lieber zu wenig als zu viel Farbe. Die Skala wurde an der gemessenen Verteilung der Modellfelder kalibriert, nicht an Literaturwerten, die für ICON-D2 um Größenordnungen zu hoch lagen.',
      'Grenzen, ohne Abstriche: hohe Fehlalarmrate, rauschige Felder, nur naher Vorhersagehorizont, am Modellrand ohne Wert. Kein amtliches Warnprodukt und kein Warnersatz — maßgeblich sind die Unwetterwarnungen des DWD und von MeteoSchweiz im Layer „Amtliche Warnungen". Wer die Signale einordnen will, findet die Messung dazu in den Layern Blitze, Zellbahnen und Hagel.',
    ],
    facts: [
      { label: 'Quelle', text: 'DWD ICON-D2: uh_max, uh_max_low, sdi_2' },
      { label: 'Auflösung · Takt', text: '2,2 km, 5×5-geglättet · stündlich' },
      { label: 'Horizont', text: '+1 bis +12 h' },
      { label: 'Abdeckung', text: 'DE, AT, CH' },
      { label: 'Grenze', text: 'Verdacht ≠ Ereignis; hohe Fehlalarmrate; kein Warnprodukt' },
    ],
    explainer: 'gewitter-unwetter',
  },
  cells: {
    h1: 'Zellbahnen — Gewitterzellen mit amtlicher Zugbahn (DWD KONRAD3D)',
    lead: `Die Zellbahnen zeigen erkannte Gewitterzellen aus dem DWD-Objektprodukt KONRAD3D: den gemessenen Zellumriss, die amtliche Zugspur mit Pfeil, Zeitmarken bei +15, +30 und +60 Minuten und den amtlichen Unsicherheitstrichter — im Fünf-Minuten-Takt, bis eine Stunde voraus. Ein Klick auf eine Zelle öffnet den Steckbrief mit Zuggeschwindigkeit, Echotop und Hinweisen auf Hagel, Böen und Starkregen. Steht ein Ort gesetzt, sagt ein Satz über der Legende, welche Zelle ihn betrifft.`,
    body: [
      'Für Veranstalter, Segler, Feuerwehr und Baustellen ist die Zugrichtung wichtiger als die Intensität: Zieht die Zelle vorbei oder direkt über uns, und wann? Spur und Trichter stammen vom DWD, nicht aus einer eigenen Extrapolation — der Trichter ist die konvexe Hülle der amtlichen Unsicherheitsellipsen und wird nach hinten durchsichtiger, weil er dort unsicherer ist. Beim Herauszoomen entfallen zuerst die Zeitmarken, dann der Trichterverlauf; Umriss und Spur bleiben immer.',
      'Grenzen: Abdeckung ist die Reichweite des deutschen Radarverbunds, die über die Grenze reicht und dort ausdünnt — für Österreich und die Schweiz gibt es kein gleichwertiges offenes Objektprodukt. Ankunftszeiten gibt es nur als Spanne und nur mit amtlicher Ellipse. Jenseits von +1 h ist der Layer aus, weil die Spur dort endet. Kein amtliches Warnprodukt; keine Zellen an ruhigen Tagen ist der Normalfall.',
    ],
    facts: [
      { label: 'Quelle', text: 'DWD KONRAD3D (Objektprodukt, eigener Parser)' },
      { label: 'Takt', text: '5 min' },
      { label: 'Horizont', text: 'jetzt bis +60 min (amtliche Spur)' },
      { label: 'Abdeckung', text: 'deutscher Radarverbund, grenzüberschreitend ausdünnend' },
      { label: 'Grenze', text: 'kein Warnprodukt; Ankunftszeit nur als Spanne; kein AT/CH-Pendant' },
    ],
    explainer: 'gewitterzellen-konrad',
  },
  hail: {
    h1: 'Hagelkarte — MESHS/POH der Schweiz und Hagelzellen des DWD',
    lead: `Die Hagelkarte zeigt zwei amtliche Radarprodukte, bewusst nicht vermischt: als Fläche das Schweizer MESHS (maximal erwartete Korngröße) oder POH (Hagelwahrscheinlichkeit) von MeteoSchweiz, 1 km und 5 Minuten, von April bis September — und als Zellen die Hagelerkennung des DWD aus KONRAD3D mit Hagelfläche und Großhagel-Hinweis. Beide Radarverbünde reichen über die Grenzen; Ostösterreich hat keine offene Hagelquelle, und die Karte sagt das, statt dort eine leere Fläche als „kein Hagel" auszugeben.`,
    body: [
      'Für Winzer, Obstbauern, Autobesitzer und Veranstalter ist Hagel das teuerste Wetter; die Karte zeigt, wo das Radar ihn gerade erkennt. Der Umschalter „Korngröße / Chance" gilt für die Schweizer Fläche; die deutschen Zellen bleiben in beiden Stellungen sichtbar. Ein Klick auf eine Zelle nennt Hagelfläche, Großhagelfläche, Hagel-Obergrenze und Reflektivität.',
      'Grenzen: Radarerkennung, keine Bodenmeldung — das Radar sieht Hagel in der Wolke, nicht das Korn auf dem Feld. Die Karte gilt für jetzt; ab der ersten Vorhersagestunde ist der Layer aus, weil es kein Vorhersageprodukt für Hagel gibt. Kein amtliches Warnprodukt; die Warnungen stehen im Layer „Amtliche Warnungen". Kein erkannter Hagel ist an den allermeisten Tagen der Normalfall.',
    ],
    facts: [
      { label: 'Quellen', text: 'MeteoSchweiz MESHS/POH (CC BY 4.0) · DWD KONRAD3D hail_flag' },
      { label: 'Auflösung · Takt', text: '1 km · 5 min (CH); Zellen 5 min (DE)' },
      { label: 'Horizont', text: 'nur jetzt; CH-Fläche nur 1. April – 30. September' },
      { label: 'Abdeckung', text: 'CH + Grenzsaum, DE-Verbund; Ostösterreich ohne Quelle' },
      { label: 'Grenze', text: 'Radar, keine Bodenmeldung; kein Warnprodukt; keine Vorhersage' },
    ],
    explainer: 'hagel-meshs-poh',
  },
  warnings: {
    h1: 'Amtliche Unwetterwarnungen für Deutschland und die Schweiz',
    lead: 'Der Warnlayer zeigt die amtlichen Wetterwarnungen des Deutschen Wetterdienstes (landkreisgenau, CAP) und von MeteoSchweiz (Warnregionen, über MeteoAlarm) als Flächen auf der Karte, alle fünf Minuten aktualisiert. Ein Klick öffnet alle Warnungen des Ortes — Überschrift, Beschreibung und Handlungshinweis wortwörtlich aus der amtlichen Meldung, höchste Stufe zuerst. Es ist der einzige Layer, der ein amtliches Warnprodukt ist; alle anderen verweisen darauf.',
    body: [
      'Die Karte übernimmt die Warntexte als Zitat, fasst nichts zusammen und formuliert nichts um. Die Flächenfarbe ist in Deutschland die amtliche Warnfarbe aus der Meldung; der Schweizer Feed führt keine Farbe, dort wird sie aus der amtlichen Gefahrenstufe abgeleitet und in der Legende so gekennzeichnet. Die Stufenskalen bleiben getrennt, weil DWD-Stufe 1 und Schweizer Stufe 1 Verschiedenes bedeuten. Der Zeit-Schieber wählt, was zur eingestellten Stunde gilt.',
      'Grenzen: Für Österreich fehlt der Layer — dort warnt GeoSphere Austria, und eine leere Fläche über Österreich heißt nicht „keine Warnung". Fällt eine der Quellen aus, sagt die Karte, welches Land fehlt, und verlinkt die amtliche Seite. Maßgeblich bleiben die amtlichen Bekanntmachungen unter dwd.de/warnungen und meteoschweiz.admin.ch; die Nutzungsbedingungen der Dienste sind auf der Seite „Quellen & Lizenzen" dokumentiert.',
    ],
    facts: [
      { label: 'Quellen', text: 'DWD CAP 1.2 (DISTRICT) · MeteoSchweiz über MeteoAlarm (EUMETNET)' },
      { label: 'Takt', text: '5 min' },
      { label: 'Zeit', text: 'folgt dem Zeit-Schieber (onset/expires)' },
      { label: 'Abdeckung', text: 'DE landkreisgenau, CH Warnregionen; AT fehlt (GeoSphere, geplant)' },
      { label: 'Grenze', text: 'nur Zitat; kein Ersatz für die amtliche Bekanntmachung' },
    ],
    explainer: 'gewitter-unwetter',
  },
};

/** Wortzahl eines Textes (Verifier-Helfer, kein DOM). */
export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}
