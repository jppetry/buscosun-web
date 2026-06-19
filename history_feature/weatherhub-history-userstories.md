# WeatherHub – Feature „Wetterhistorie / Klima-Rückblick"
## Vollständiges User-Story-Set (Anfang bis Ende)

> Granulare User Stories für die professionelle Umsetzung, organisiert nach bedarfsorientierten Epics. Bewusst frei von Technologie- und Datenquellen-Festlegungen — rein funktional und nutzerseitig. Format pro Story: Rolle / Ziel / Nutzen + Akzeptanzkriterien (AK).

---

## Personas (Bezugsrahmen)

- **Klara, Klima-Neugierige** – will verstehen, wie sich das Wetter in ihrem Ort verändert hat; emotionaler, story-getriebener Zugang.
- **Gerd, Gärtner** – plant Aussaat/Pflanzung, braucht Frostfenster und Wachstumsindikatoren.
- **Eva, Eventplanerin** – will wissen, ob ein bestimmtes Datum/Monat historisch trocken, sonnig, warm ist.
- **Lars, Läufer/Outdoor** – interessiert an typischen Bedingungen zu einer Tageszeit/Saison.
- **Petra, Profi (Energie/Landwirtschaft/Bau)** – braucht abgeleitete Indizes, präzise Werte, exportierbare Berichte.
- **Mobil-Nutzer (alle)** – will schnelle, scanbare Kernwerte unterwegs.

---

## Epic-Übersicht

| # | Epic | Kern-Bedarf |
|---|------|-------------|
| E1 | Standort- & Regionsauswahl | „Zeig mir meinen Ort" |
| E2 | Fragengetriebener Einstieg | „Beantworte meine Frage" |
| E3 | Zeitraum & Aggregation | „Beliebig einstellbar" |
| E4 | Variablen & Kenntage | „Alle relevanten Größen" |
| E5 | Vergleich mit Normalwert / Anomalien | „Ist das ungewöhnlich?" |
| E6 | Visualisierungen | „Modern & verständlich darstellen" |
| E7 | Drill-down (Monate → Tage) | „Welche Tage genau?" |
| E8 | Rekorde & Rankings | „Was war der Extremwert?" |
| E9 | Vergleich (Orte / Jahre) | „Nebeneinander vergleichen" |
| E10 | Export, Teilen, Einbetten | „Mitnehmen & weitergeben" |
| E11 | Mobil & Responsive | „Unterwegs schnell" |
| E12 | Profi-/Prosumer-Indizes | „Abgeleitete Kennzahlen" |
| E13 | Verständlichkeit & Vertrauen | „Korrekt & nachvollziehbar" |
| E14 | Barrierefreiheit & Performance | „Für alle, schnell" |
| E15 | Onboarding & Leerzustände | „Sofort loslegen" |

---

## E1 — Standort- & Regionsauswahl

**US-1.1** Als Nutzer möchte ich einen Ort über eine Suchleiste (Ortsname/PLZ) finden, um schnell zu meinem Standort zu gelangen.
- AK: Tippvorschläge ab 2 Zeichen; Treffer mit Region/Land zur Unterscheidung gleichnamiger Orte; Auswahl lädt das Standort-Dashboard.

**US-1.2** Als Nutzer möchte ich auf eine Karte klicken/tippen, um eine beliebige Position auszuwählen, auch ohne benannten Ort.
- AK: Klick setzt Marker und übernimmt Koordinaten; gewählte Position wird mit nächstgelegenem Ortsnamen beschriftet; Karte und Charts bleiben synchron.

**US-1.3** Als Nutzer möchte ich eine Region/ein Bundesland/einen Kanton auswählen, um aggregierte Werte für ein Gebiet statt eines Punktes zu sehen.
- AK: Regionsauswahl per Liste oder Kartenfläche; Charts zeigen Gebietsmittel; UI kennzeichnet eindeutig „Punkt" vs. „Region".

**US-1.4** Als wiederkehrender Nutzer möchte ich meinen Standort automatisch vorgeschlagen bekommen, um nicht jedes Mal neu zu suchen.
- AK: Optionale Standortermittlung mit Einwilligung; ablehnbar; manuelle Auswahl bleibt jederzeit möglich.

**US-1.5** Als Nutzer möchte ich zuletzt betrachtete und favorisierte Orte speichern, um schnell zu ihnen zurückzukehren.
- AK: Liste „Zuletzt"/„Favoriten"; Hinzufügen/Entfernen mit einem Tap; persistiert über Sitzungen.

**US-1.6** Als Nutzer möchte ich beim Wechsel des Standorts meine aktuellen Einstellungen (Zeitraum, Variable, Diagrammtyp) behalten, um Orte unter gleichen Bedingungen zu vergleichen.
- AK: Einstellungen bleiben beim Standortwechsel erhalten; sichtbarer Reset-Button.

---

## E2 — Fragengetriebener Einstieg

**US-2.1** Als Nutzer möchte ich vorformulierte Fragen als Einstiegspunkte sehen (z. B. „Wie warm war der letzte Sommer im Vergleich zu normal?"), um ohne Fachwissen zum Ergebnis zu kommen.
- AK: Kuratierte Fragen-Kacheln auf der Startansicht; Auswahl konfiguriert automatisch Zeitraum, Variable und Diagrammtyp; Ergebnis sofort sichtbar.

**US-2.2** Als Gärtner möchte ich die Frage „Wann war der letzte Frost?" stellen, um meine Pflanzplanung zu stützen.
- AK: Antwort nennt Datum des letzten Frosttags je Jahr und typisches Frostende; Hinweis auf Schwankungsbreite über die Jahre.

**US-2.3** Als Eventplanerin möchte ich fragen „Wie trocken/sonnig ist Datum X historisch?", um ein Datum zu bewerten.
- AK: Antwort zeigt historische Verteilung (z. B. Anteil trockener Jahre) für ein gewähltes Kalenderdatum/-fenster.

**US-2.4** Als Nutzer möchte ich von einer Frage-Antwort aus tiefer einsteigen können, um Details zu erkunden.
- AK: Jede Antwort hat einen „Mehr ansehen"-Pfad ins volle Dashboard mit übernommenem Kontext.

**US-2.5** Als Nutzer möchte ich Fragen in natürlicher Sprache eingeben können, um flexibel zu suchen.
- AK: Freitext wird auf passende Variable/Zeitraum/Diagramm gemappt; bei Unklarheit Rückfrage mit Auswahloptionen.

---

## E3 — Zeitraum & Aggregation

**US-3.1** Als Nutzer möchte ich einen beliebigen Start- und Endzeitpunkt wählen, um exakt meinen Zeitraum zu betrachten.
- AK: Datumsbereich frei wählbar; ungültige Bereiche werden verhindert; Charts aktualisieren sofort.

**US-3.2** Als Nutzer möchte ich Schnell-Presets (z. B. letztes Jahr, letzte 10 Jahre, gesamter verfügbarer Zeitraum, einzelnes Jahr), um häufige Bereiche mit einem Klick zu setzen.
- AK: Presets als Buttons; aktiver Preset hervorgehoben; jederzeit auf eigenen Bereich umschaltbar.

**US-3.3** Als Nutzer möchte ich die zeitliche Aggregation umschalten (täglich / monatlich / saisonal / jährlich), um die passende Granularität zu sehen.
- AK: Umschalter sichtbar; Aggregation wird auf alle aktiven Charts angewandt; Achsen passen sich an.

**US-3.4** Als Nutzer möchte ich beim Einstellen sehen, welcher Zeitraum tatsächlich verfügbar ist, um keine leeren Bereiche zu wählen.
- AK: Verfügbarer Gesamtzeitraum ist visuell markiert; Auswahl außerhalb wird sichtbar begrenzt oder gekennzeichnet.

**US-3.5** Als Nutzer möchte ich einen Zeitraum per Slider/Zoom direkt im Diagramm eingrenzen, um intuitiv zu navigieren.
- AK: Ziehen/Zoomen im Chart aktualisiert den gewählten Bereich und die Bereichsanzeige bidirektional.

**US-3.6** Als Nutzer möchte ich saisonale Fenster definieren (z. B. nur Sommermonate über mehrere Jahre), um Saisons über Jahre zu vergleichen.
- AK: Monats-/Saison-Filter kombinierbar mit Mehrjahresbereich; Charts zeigen nur gefilterte Perioden.

---

## E4 — Variablen & Kenntage

**US-4.1** Als Nutzer möchte ich zwischen Kernvariablen wechseln (Temperatur max/min/Mittel, Niederschlag, Sonnenstunden, Wind, Luftfeuchte), um die relevante Größe zu sehen.
- AK: Variablen-Auswahl als benannte Optionen; Einheiten klar; Wechsel ohne Neuladen der Seite.

**US-4.2** Als Nutzer möchte ich die „Kenntage" als benannte Ein-Klick-Optionen wählen (Hitzetage ≥30 °C, Sommertage ≥25 °C, Tropennächte Tmin >20 °C, Frosttage <0 °C, Eistage Tmax <0 °C), um sie ohne eigene Formel zu zählen.
- AK: Jeder Kenntag als vordefinierte Option mit erklärtem Schwellenwert; Ergebnis als Anzahl je Periode.

**US-4.3** Als Nutzer möchte ich Kenntage pro Jahr/Monat gezählt und gerankt sehen, um Extremjahre zu erkennen.
- AK: Zählung je Jahr/Monat; Ranking (z. B. Top-Jahre nach Hitzetagen); Hervorhebung des aktuellen/gewählten Jahres.

**US-4.4** Als Nutzer möchte ich Windrichtung und -stärke als Häufigkeit dargestellt sehen, um typische Windverhältnisse zu verstehen.
- AK: Windrichtungs-/stärkeverteilung über den gewählten Zeitraum; nach Saison filterbar.

**US-4.5** Als Nutzer möchte ich die Schwellenwerte einzelner Kenntage anpassen können, um eigene Definitionen zu nutzen.
- AK: Schwellenwert editierbar; geänderte Definition wird klar gekennzeichnet; Rücksetzen auf Standard möglich.

**US-4.6** Als Nutzer möchte ich mehrere Variablen in einer Ansicht kombiniert sehen (z. B. Temperatur + Niederschlag), um Zusammenhänge zu erkennen.
- AK: Sekundärachse/überlagerte Darstellung; Legende eindeutig; einzeln ein-/ausblendbar.

---

## E5 — Vergleich mit Normalwert / Anomalien

**US-5.1** Als Nutzer möchte ich Werte gegen den langjährigen Normalwert sehen, um einzuschätzen, ob etwas ungewöhnlich ist.
- AK: Normalbereich als Referenz im Chart; Auswahl der Referenzperiode (z. B. mehrere Standard-Normalperioden) möglich.

**US-5.2** Als Nutzer möchte ich monatliche/jährliche Abweichungen als Anomalie-Balken sehen („zu warm / zu kalt / zu nass"), um Ausreißer schnell zu erkennen.
- AK: Abweichung über/unter Normal farblich getrennt; Nulllinie = Normal; Hover zeigt exakte Abweichung.

**US-5.3** Als Nutzer möchte ich eine Trendlinie über den gewählten Zeitraum sehen, um die Richtung der Entwicklung zu erkennen.
- AK: Trend optional einblendbar; Steigung/Änderung als Zahl angegeben; klar als statistischer Trend gekennzeichnet.

**US-5.4** Als Nutzer möchte ich die Referenz-Normalperiode auswählen, um verschiedene Vergleichsbasen zu nutzen.
- AK: Auswahl aus verfügbaren Referenzperioden; aktive Referenz immer sichtbar beschriftet.

---

## E6 — Visualisierungen

**US-6.1** Als Klima-Neugierige möchte ich „Warming Stripes" (Klimastreifen) für meinen Ort sehen, um die Veränderung auf einen Blick zu erfassen.
- AK: Streifen werden live für gewählten Ort/Variable erzeugt; Farbskala erklärt; als Hero-Element prominent.

**US-6.2** Als Nutzer möchte ich Klimastreifen optional mit Achsen-/Wertbeschriftung einblenden, um die tatsächliche Größenordnung zu verstehen, nicht nur die Farbe.
- AK: Umschalter „Beschriftung anzeigen"; mit Labels werden Jahre und Temperatur-/Wertskala sichtbar; Standard ist optional konfigurierbar.

**US-6.3** Als Nutzer möchte ich ein Tagesband-Diagramm sehen (Tageswert gegenüber Normalbereich und Rekordbereich), um einzuschätzen, wie außergewöhnlich ein Tag/Zeitraum war.
- AK: Gefüllte Bänder für Normal- und Rekordbereich; aktueller/gewählter Verlauf darüber; Hover zeigt Tageswerte.

**US-6.4** Als Nutzer möchte ich eine Kalender-Heatmap (ein Jahr als farbiges Tagesraster) sehen, um Hitzewellen, Kälteeinbrüche und Trockenphasen auf einen Blick zu erkennen.
- AK: Tageszellen farbcodiert nach Wert; mehrere Jahre stapelbar; Klick auf Zelle öffnet Tagesdetail.

**US-6.5** Als Nutzer möchte ich Jahre als Überlagerung („Spaghetti") sehen — aktuelles Jahr hervorgehoben gegen Vorjahre, um zu erkennen, ob das Jahr ungewöhnlich verläuft.
- AK: Mehrere Jahreslinien; aktuelles/gewähltes Jahr betont; einzelne Jahre ein-/ausblendbar.

**US-6.6** Als Nutzer möchte ich den „Anteil der Zeit in Temperaturbändern" (z. B. kalt/kühl/angenehm/heiß) über das Jahr sehen, um typische Bedingungen intuitiv einzuschätzen.
- AK: Gestapelte Flächen über den Jahresverlauf; Bänder mit Schwellen erklärt.

**US-6.7** Als Profi möchte ich Verteilungen pro Monat über die Jahre als Box-/Verteilungsplot sehen, um Streuung und Ausreißer zu beurteilen.
- AK: Verteilung je Monat; Median/Quartile/Ausreißer erkennbar.

**US-6.8** Als Nutzer möchte ich pro Chart eine kurze Klartext-Zusammenfassung sehen, um die Aussage ohne Diagramm-Lesen zu erfassen.
- AK: 1–2 Sätze automatisch generiert (z. B. „Dieser Sommer war 1,8 °C wärmer als das langjährige Mittel"); ein-/ausblendbar.

**US-6.9** Als Nutzer möchte ich zwischen Diagrammtypen für dieselbe Frage wechseln, um die für mich passende Darstellung zu wählen.
- AK: Diagrammtyp-Wechsler ohne Verlust von Zeitraum/Variable; nicht sinnvolle Kombinationen werden deaktiviert.

---

## E7 — Drill-down (Monate → Tage)

**US-7.1** Als Nutzer möchte ich von „welche Monate waren heiß" zu „welche konkreten Tage" wechseln, um vom Überblick ins Detail zu gelangen.
- AK: Klick auf Monat/Periode öffnet Tagesansicht dieses Zeitraums mit übernommener Variable.

**US-7.2** Als Nutzer möchte ich einen einzelnen Tag im Detail sehen, um genaue Werte nachzulesen.
- AK: Tagesdetail zeigt verfügbare Werte des Tages (z. B. Max/Min, Niederschlag, Wind) und Einordnung gegenüber Normal/Rekord.

**US-7.3** Als Nutzer möchte ich eine Brotkrumen-/Zurück-Navigation, um den Drill-down-Pfad nachzuvollziehen.
- AK: Sichtbarer Pfad (z. B. Jahr → Monat → Tag); jeder Schritt anklickbar; Zurück erhält Kontext.

**US-7.4** Als Nutzer möchte ich innerhalb eines Tages auf den Tagesverlauf (Stunden) zugreifen, sofern feinere Daten vorliegen, um Tageszeit-Bedingungen zu sehen.
- AK: Falls verfügbar, Stundenverlauf; falls nicht, klarer Hinweis statt leerer Ansicht.

---

## E8 — Rekorde & Rankings

**US-8.1** Als Nutzer möchte ich Rekorde für meinen Ort sehen (wärmster/kältester/nassester/sonnigster Tag und Monat), um Extremwerte zu kennen.
- AK: Rekordwerte mit Datum; getrennt nach Tag und Monat; bezogen auf gewählten Zeitraum oder gesamten verfügbaren.

**US-8.2** Als Nutzer möchte ich „Hitlisten" (Top-N heißeste/kälteste Jahre oder Tage) sehen, um Extreme zu ranken.
- AK: Sortierbare Top-N-Liste; gewähltes Jahr/Tag hervorgehoben; Variable wählbar.

**US-8.3** Als Nutzer möchte ich „Was war das Wetter an meinem Geburtstag/Hochzeitstag?" abfragen, um persönliche Daten nachzuschlagen.
- AK: Datumseingabe zeigt Werte dieses Tages über mehrere Jahre und Einordnung gegen Normal.

**US-8.4** Als Nutzer möchte ich sehen, wann ein Rekord gebrochen wurde, um die zeitliche Einordnung zu verstehen.
- AK: Rekord zeigt Datum; bei aktuellem Zeitraum Hinweis, ob im gewählten Bereich ein neuer Extremwert liegt.

---

## E9 — Vergleich (Orte / Jahre)

**US-9.1** Als Nutzer möchte ich zwei Orte nebeneinander vergleichen, um Standorte gegeneinander zu bewerten.
- AK: Zwei Standorte gleichzeitig; identische Skalen; Differenz optional hervorgehoben.

**US-9.2** Als Nutzer möchte ich mehrere Jahre überlagern, um Jahre direkt zu vergleichen.
- AK: Mehrjahres-Auswahl; je Jahr eine erkennbare Reihe; ein-/ausblendbar.

**US-9.3** Als Nutzer möchte ich beim Vergleich identische Einstellungen für beide Seiten erzwingen, um faire Vergleiche zu sichern.
- AK: Variable/Zeitraum/Aggregation gelten für alle Vergleichsobjekte; Abweichungen werden verhindert oder klar markiert.

**US-9.4** Als Nutzer möchte ich Vergleichsergebnisse als kurze Aussage zusammengefasst bekommen, um den Unterschied schnell zu erfassen.
- AK: Automatischer Satz (z. B. „Ort A hatte im Schnitt 5 Hitzetage mehr pro Jahr als Ort B").

---

## E10 — Export, Teilen, Einbetten

**US-10.1** Als Nutzer möchte ich ein Diagramm als Bild exportieren, um es weiterzuverwenden.
- AK: Export als Bilddatei in sichtbarer Qualität; Titel, Ort, Zeitraum und Quellenhinweis im Bild enthalten.

**US-10.2** Als Profi möchte ich die zugrunde liegenden Werte als Tabelle exportieren, um eigene Auswertungen zu machen.
- AK: Export der aktuell sichtbaren Datenreihe als Tabelle; Spalten beschriftet; gewählter Zeitraum/Aggregation berücksichtigt.

**US-10.3** Als Nutzer möchte ich einen Link teilen, der genau meine aktuelle Ansicht wiederherstellt, um Ergebnisse weiterzugeben.
- AK: Link kodiert Ort, Zeitraum, Variable, Diagrammtyp; Aufruf stellt identische Ansicht her.

**US-10.4** Als Nutzer möchte ich ein Diagramm einbetten können, um es auf einer eigenen Seite anzuzeigen.
- AK: Einbettcode verfügbar; eingebettetes Diagramm bleibt interaktiv im definierten Rahmen; Quellenhinweis sichtbar.

**US-10.5** Als Nutzer möchte ich „meine Klimastreifen teilen" als Social-Hook, um den Ort-Bezug viral weiterzugeben.
- AK: Teilbare, vorbereitete Grafik mit Ortsname; ein Tap zum Teilen/Kopieren.

---

## E11 — Mobil & Responsive

**US-11.1** Als Mobil-Nutzer möchte ich Kernwerte ohne tiefe Navigation sehen, um unterwegs schnell eine Antwort zu bekommen.
- AK: Wichtigste Kennzahl(en) ≤1 Tap entfernt; keine zwingende Mehrschritt-Navigation für Standardfragen.

**US-11.2** Als Mobil-Nutzer möchte ich neben Diagrammen auch klare Zahlen sehen, um nicht aus einem Mini-Diagramm ableiten zu müssen.
- AK: Zu jedem mobilen Chart eine scanbare Zahlen-Zusammenfassung; Diagramm ersetzt nicht den Klartext-Kernwert.

**US-11.3** Als Mobil-Nutzer möchte ich Diagramme per Touch erkunden (zoomen, tippen für Detail), um auch auf kleinem Display zu navigieren.
- AK: Touch-Gesten unterstützt; Detail-Tooltip per Tap; keine Hover-Abhängigkeit.

**US-11.4** Als Mobil-Nutzer möchte ich Steuerelemente (Zeitraum, Variable) in einem leicht erreichbaren Panel haben, um einhändig zu bedienen.
- AK: Bedienelemente in erreichbarem Bereich (z. B. Bottom-Sheet); Auswahl ohne Zoom/Scrollkampf möglich.

**US-11.5** Als Nutzer möchte ich einen Dunkelmodus, um die Ansicht angenehm zu nutzen.
- AK: Heller/dunkler Modus; folgt optional Systemeinstellung; Diagrammfarben bleiben in beiden Modi lesbar.

---

## E12 — Profi-/Prosumer-Indizes

**US-12.1** Als Profi möchte ich Heizgradtage/Gradtagzahlen sehen, um den Energiebedarf einzuschätzen.
- AK: Index als benannte Option; Basis-/Schwellenwert konfigurierbar; je Periode aggregiert.

**US-12.2** Als Gärtner/Landwirt möchte ich Wachstumsgradtage (GDD) sehen, um phänologische Planung zu stützen.
- AK: GDD mit konfigurierbarem Basiswert; kumuliert über Saison darstellbar.

**US-12.3** Als Profi möchte ich Trocken-/Hitzewellen-Perioden automatisch erkannt sehen, um Risikozeiträume zu identifizieren.
- AK: Erkennung anhand einstellbarer Kriterien (Dauer/Schwelle); markierte Perioden im Zeitverlauf.

**US-12.4** Als Gärtner möchte ich frostfreie Periode / Länge der Wachstumsperiode je Jahr sehen, um Saisonlängen zu vergleichen.
- AK: Start/Ende und Länge je Jahr; Mehrjahresvergleich möglich.

**US-12.5** Als Profi möchte ich Segment-Presets (Gärtner, Energie, Event, Landwirtschaft) wählen, um relevante Indizes gebündelt zu erhalten.
- AK: Preset aktiviert passende Variablen/Indizes/Diagramme; weiterhin frei anpassbar.

**US-12.6** Als Profi möchte ich einen zusammengestellten Bericht erzeugen, um Ergebnisse zu dokumentieren.
- AK: Mehrere Diagramme/Werte in einem strukturierten, exportierbaren Dokument mit Ort/Zeitraum/Quellenhinweis.

---

## E13 — Verständlichkeit & Vertrauen

**US-13.1** Als Nutzer möchte ich zu jedem Diagramm eine kurze Erklärung („Wie lese ich das?"), um die Darstellung richtig zu deuten.
- AK: Zugänglicher Hilfetext/Tooltip je Diagrammtyp; Fachbegriffe erklärt.

**US-13.2** Als Nutzer möchte ich Herkunfts- und Genauigkeitshinweise zu den angezeigten Werten sehen, um die Verlässlichkeit einzuschätzen.
- AK: Sichtbarer Hinweis zu Datenherkunft und ggf. Genauigkeits-/Interpolationsgrenzen (z. B. in Berglagen); ohne den Lesefluss zu stören.

**US-13.3** Als Nutzer möchte ich erkennen, ob ein Wert gemessen oder abgeleitet/modelliert ist, um Aussagekraft einzuordnen.
- AK: Kennzeichnung der Art der Werte; Erklärung des Unterschieds auf Nachfrage.

**US-13.4** Als Nutzer möchte ich bei Datenlücken einen klaren Hinweis statt verfälschter Darstellung sehen, um nicht in die Irre geführt zu werden.
- AK: Lücken sichtbar markiert; keine stillschweigende Interpolation ohne Kennzeichnung.

**US-13.5** Als Nutzer möchte ich die verwendete Referenzperiode und Schwellenwerte stets sichtbar haben, um Aussagen korrekt zu interpretieren.
- AK: Aktive Referenz/Schwellen dauerhaft beschriftet im jeweiligen Chart.

---

## E14 — Barrierefreiheit & Performance

**US-14.1** Als Nutzer mit eingeschränktem Sehen möchte ich farbenblind-sichere Paletten und ausreichende Kontraste, um Diagramme lesen zu können.
- AK: Farbskalen mit Mustern/Beschriftung zusätzlich zur Farbe; Kontraste erfüllen anerkannte Richtlinien.

**US-14.2** Als Nutzer mit Tastatur/Screenreader möchte ich alle Funktionen bedienen und Diagramminhalte erfassen können, um das Feature voll zu nutzen.
- AK: Vollständige Tastaturbedienbarkeit; Diagramme bieten textuelle Alternative (z. B. zugängliche Datentabelle/Zusammenfassung).

**US-14.3** Als Nutzer möchte ich, dass Diagramme schnell laden, um nicht auf Daten zu warten.
- AK: Erste sinnvolle Darstellung zügig; sichtbarer Ladezustand; Standortwechsel/Variablen­wechsel reagiert flüssig.

**US-14.4** Als Nutzer möchte ich bei sehr großen Zeiträumen weiterhin flüssige Interaktion, um lange Historien ohne Hänger zu erkunden.
- AK: Darstellung großer Bereiche bleibt bedienbar (z. B. durch sinnvolle Aggregation in der Übersicht); kein Einfrieren der Oberfläche.

**US-14.5** Als Nutzer möchte ich verständliche Fehlermeldungen, wenn etwas nicht verfügbar ist, um zu wissen, wie ich weiterkomme.
- AK: Klartext-Fehler mit Handlungsoption (z. B. anderen Zeitraum/Ort wählen); keine technischen Rohfehler.

---

## E15 — Onboarding & Leerzustände

**US-15.1** Als neuer Nutzer möchte ich beim ersten Aufruf sofort ein Beispiel-Ergebnis sehen, um den Nutzen ohne Konfiguration zu verstehen.
- AK: Vorbefüllter Beispielort/-zeitraum; klarer Hinweis, dass alles anpassbar ist.

**US-15.2** Als neuer Nutzer möchte ich eine kurze, überspringbare Einführung in die Bedienelemente, um mich schnell zurechtzufinden.
- AK: Optionale Kurz-Tour; jederzeit abbrechbar; einmalig, nicht aufdringlich.

**US-15.3** Als Nutzer möchte ich bei leerer Auswahl hilfreiche Vorschläge statt einer leeren Seite, um weiterzukommen.
- AK: Leerzustand zeigt Beispiel-Fragen/Orte und einen klaren nächsten Schritt.

**US-15.4** Als Nutzer möchte ich erkennen, welche Funktionen Profi-/erweiterte Optionen sind, um nicht überfordert zu werden.
- AK: Klare Trennung zwischen Standard- und erweiterten Optionen; erweiterte Optionen ausklappbar/auf Abruf.

---

## Querschnittliche „Definition of Done" (Vorschlag)

- **Konsistenz:** Variable, Zeitraum, Aggregation und Referenzperiode bleiben über Standort-/Diagrammwechsel erhalten und sind jederzeit sichtbar.
- **Verständlichkeit:** Jede „schöne" Visualisierung (z. B. Klimastreifen) hat optionale Beschriftung und einen Pfad in die echten Werte — kein Diagramm ohne erklärbare Aussage.
- **Zahlen vor Diagramm-Zwang:** Kernwerte sind immer auch als Klartext/Zahl verfügbar, besonders mobil.
- **Transparenz:** Datenherkunft, Art der Werte (gemessen/abgeleitet), Lücken und Genauigkeitsgrenzen sind kenntlich gemacht.
- **Barrierefreiheit:** Tastatur, Screenreader, farbsichere Paletten, ausreichende Kontraste in hell/dunkel erfüllt.
- **Geteilte Ansicht = exakte Ansicht:** Links/Einbettungen stellen den vollständigen Zustand wieder her.
- **Drill-Pfad erhalten:** Jahr → Monat → Tag (→ Stunde, falls verfügbar) ist durchgängig nachvoll-/rückverfolgbar.

---

## Mapping zur empfohlenen Roadmap (aus dem Report)

- **Stufe 1 (MVP):** E1, E2 (Kern), E3, E4 (Variablen + Kenntage), E5, E6 (Streifen, Tagesband, Anomalie-Balken, Kenntage-Zählung), E11, E13, E15.
- **Stufe 2 (Differenzierung):** E6 (Kalender-Heatmap, Jahres-Overlay, Windrose, Temperaturbänder), E7, E8, E9, E10.
- **Stufe 3 (Profi-Layer):** E12, erweiterte E10 (Berichte), vertiefte E13/E14.
