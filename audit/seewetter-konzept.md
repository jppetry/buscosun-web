# Seewetter – Feature-Konzept und Datenlage (Export für Phase SW)

> Stand 07.10.2026, Export des claude.ai Docs „Seewetter – Feature-Konzept buscosun“ (https://claude.ai/artifact/1FNWajcRyXEpRQxov7D32a). UI-Mockup: https://claude.ai/artifact/D1nvnMEM4AgET93ocaG3b1, Kopie in `reference/seewetter-*.dc.html`. Plan: `audit/seewetter-plan.md`. Rohbefunde der Quellenanalyse: `audit/seewetter-datenpruefung.md`.
>
> **Abweichungen zum Plan – bei Widerspruch gilt der Plan:**
>
> 1. **Ingest der Felder:** Der Abschnitt „Zwei Linien“ beschreibt einen eigenen Workflow `sea.yml`. Nach Plan ist das offen (E-SW-4): Produkt im Radar-Spiegel, wenn SW-0 Laufzeit und Speicher als unkritisch misst, sonst eigener Workflow.
> 2. **Ausblick bis 174 h:** Im Konzept Teil des Stundenbands und der Spot-Reihen. Im Plan ist Stufe 1 auf 0–78 h begrenzt; der GWAM-Ausblick kommt in SW-8.
> 3. **Seegangsfläche:** Das Konzept nennt „eigenen Shader“. Der Plan färbt auf der CPU ein und übergibt ein Bild an MapLibre; ein neuer Shader nur nach STOPP & FRAGEN.
> 4. **Komponenten-PNG `c/<schritt>.png`:** Im Plan doppelte Breite, links Windsee, rechts Dünung, je Hs, Richtung, Periode.
> 5. **Fenster:** Konzept „passt“ ab 2 h, Plan und Mockup „passt“ oder „knapp“ ab 2 h.
> 6. **Textende:** Das Konzept nennt `=` als Abschluss aller Bulletins. WODL45 und FXDL40 enden ohne `=` (siehe Datenprüfung §6 und Fixtures).
>
> Die Diagramme des Docs (Modellabgleich) sind hier nur als Platzhalter vermerkt; die Zahlen dazu stehen in der Datenprüfung §5.

## Kurzfassung

**Empfehlung: bauen, mit klarem Revier-Zuschnitt.** Das Feature wird die Kachel 12 „Seewetter“ im Command-Deck: deutsche Nord- und Ostseeküste in 900 m Auflösung, europäische Urlaubsreviere in 5 km, ein grober Ausblick bis 7 Tage, dazu Seewetterbericht und Warnstatus des DWD im Wortlaut.

- **Die Marktlücke ist belegbar.** Wind und Welle lösen Windy, Windfinder und Windguru gut. Eine kostenlose Seite ohne Registrierung, die auf Deutsch Seewetterbericht, Warnstatus, Wind mit Böen und Welle (Windsee und Dünung getrennt) zusammen zeigt, fand die Recherche nicht. Den amtlichen Bericht gibt es heute vor allem in der WarnWetter-App, ohne Wellenkarte.
- **Die DWD-Quelle trägt.** Drei Seegangsmodelle (CWAM 900 m, EWAM 5 km, GWAM 0,25°) mit je 13 Größen, zwei Läufe am Tag, in allen vier geprüften Läufen vollständig. Dazu fünf Textprodukte im 3-Stunden-Takt. Nutzung frei nach GeoNutzV, ohne Registrierung.
- **Drei Fallen prägen das Konzept.** Der Modellwind hat eine Untergrenze von exakt 2,00 m/s (6–9 % der Seepunkte). Perioden stehen bei glatter See auf dem Platzhalter 1,0 s. Windsee-Spitzenperioden über 15 s bei 0,2 m Höhe sind Artefakte. Wind kommt deshalb aus ICON und buscosun Fusion, nie aus dem Wellenmodell.
- **DACH-Binnenseen fehlen im Bestand.** Bodensee, Chiemsee, Genfersee und Neusiedler See sind in allen drei Modellen Land. Seen bekommen in einer späteren Stufe Wind, Böen und amtliche Warnungen, aber keine Welle, und das steht dann auch so da.
- **Technik ohne Backend.** Ein Job im Daten-Repo rechnet zweimal täglich Kartenfelder und Spot-Reihen, der Radar-Spiegel holt die Texte. Ein Vertrag mit Prüfern sperrt Unplausibles wie beim Autobahnwetter.
- **Kern der Bedienung.** Spot wählen, die Karte zeigt den Seegang, ein Stundenband unter der Karte ist Tabelle und Zeitregler zugleich. Rechts steht das Spot-Briefing: Zeitfenster nach den eigenen Grenzen, Verlauf, amtlicher Text, Messung an der Küste.

## Marktrecherche

Wassersportler wollen eine Seite statt fünf Apps: Wind in Knoten mit Böen, Welle mit Periode und Richtung, den amtlichen Bericht und die Warnlage, mobil, ohne Paywall. Recherche am 07.10.2026 über Fachpresse, App-Stores, Foren und Anbieterseiten; Zahlen bitte vor externer Verwendung am Original gegenprüfen.

### Markt

| Kennzahl | Wert | Quelle |
| --- | --- | --- |
| Sport- und Freizeitboote auf Bundeswasserstraßen | ≈ 370.000, dazu ≈ 4,8 Mio. Wassersportler | [BMV](https://www.bmv.de/SharedDocs/DE/Artikel/WS/wassersport.html) |
| DSV-Mitglieder 2024 | 194.592 in rund 1.300 Vereinen | [yacht.de](https://www.yacht.de/special/menschen/segeln-fuer-einsteiger-interview-mit-dem-dsv-ueber-den-schritt-in-den-segelsport/) |
| Ausgegebene Wassersport-Führerscheine | 100.000 (2021) → 78.000 (2024) | [yacht.de](https://www.yacht.de/yachten/werften/yachtmarkt-belebung-erwartet/) |
| Boote am Bodensee, Ende 2023 | 60.591 (DE 43.495 · CH 11.323 · AT 5.773) | [Schwäbische](https://www.schwaebische.de/regional/bodensee/friedrichshafen/mehr-als-60-000-boote-freizeitsportler-haben-den-bodensee-fest-im-griff-2526362) |
| Übernachtungen 2025 an der Küste | Schleswig-Holstein 38,6 Mio., Mecklenburg-Vorpommern 33,3 Mio., beide mit Gästen aus AT und CH | [hogapage SH](https://www.hogapage.de/nachrichten/wirtschaft/tourismus/schleswig-holstein-meldet-tourismus-rekord-2025/), [hogapage MV](https://www.hogapage.de/nachrichten/wirtschaft/tourismus/mecklenburg-vorpommern-verzeichnet-zweitbestes-tourismusjahr-seit-der-wende/) |
| DGzRS-Einsätze 2025 | 1.723, davon 85 für Surfer und SUP-Paddler | [yacht.de](https://www.yacht.de/special/seenot/dgzrs-bilanz-2025-haeufigste-pannen-bei-seglern/), [surf-magazin](https://www.surf-magazin.de/windsurfen/szene-und-events/sicherheit-jahresbilanz-der-dgzrs-85-einsaetze-fuer-surfer-und-sup-paddler/) |

Belastbare Zahlen für Kite, Wing, SUP und Kajak in Deutschland gibt es offen nicht. Der Markt ist groß, wächst aber nicht; die DACH-Zielgruppe ist an der Küste vor allem Urlauber, auf den Seen Eigner.

### Wettbewerber

| Angebot | Stärke | Lücke aus DACH-Sicht | Preis |
| --- | --- | --- | --- |
| [Windy](https://community.windy.com/topic/24068/free-items-removed/28) | Partikel, Modellvergleich, Wellen | gratis nur 3-h-Schritte, Wellenperiode nur im Punktabruf | Premium ≈ 26 €/Jahr |
| [Windfinder](https://windfinder.com/apps/) | Stundentabelle, Knoten, 160.000 Orte | Werbung, GFS-Basis, Superforecast kostet | Plus 12,99 €/Jahr |
| Windguru | Tabellen, Modellmix, Kite-Community | Rohdaten für Kenner | nicht belegt |
| [PredictWind](https://apps.apple.com/is/app/id477048487) | Profimodelle, Routing, Abfahrtsplaner | für Küstenfahrt überdimensioniert | 29–499 €/Jahr |
| [DWD WarnWetter](https://apps.apple.com/DE/app/id986420993) | amtliche Küsten- und Binnenseewarnungen, Seewetterbericht | keine Wellenkarte | 2,49 € einmalig |
| [Kachelmannwetter](https://kachelmannwetter.com/de/wellenhoehen-prognosen/dwd-ewam-europe) | DWD-Wellenmodelle, Windsee und Dünung | Komfort nur mit Plus | – |
| [meteoblue Sea & Surf](https://content.meteoblue.com/en/private-customers/website-help/outdoor-and-sports/sea-and-surf) | Meteogramm mit Dünung und Windsee | nur Küstenorte | – |
| [Wetterwelt / Seaman](https://www.yacht.de/ausruestung/elektronik/seewetter-kostenloser-test-der-schrader-app/) | Seewetter Nord-/Ostsee, offline | kostenpflichtig | ≈ 59 €/Jahr |

### Was nervt, was geliebt wird

- **Modellabweichungen und Böen.** Tests zeigen Abweichungen von 3–5 kn je App; Seebrise und Düseneffekte fehlen oft. In der Windy-Community gelten Böen als überzeichnet. Folge: Vertrauen sinkt, Nutzer vergleichen mehrere Apps ([Waterway Guide](https://www.waterwayguide.com/latest-news/news/9081/weather-app-shootout-round-2-chesapeake-bay), [Windy Community](https://community.windy.com/topic/8149/gust-information)).
- **Zu viele Apps, Paywalls, Werbung.** Windy nahm 2023 die 10-Tage-Prognose aus dem Gratisangebot; Windfinder-Anzeigen sind „extrem leicht anzuklicken“ ([Yachting Monthly](https://www.yachtingmonthly.com/gear/best-weather-apps-for-sailors-91944)).
- **Mobil und Sprache.** Kleine Schrift, Einstellungen gehen verloren; DMI nur auf Dänisch.
- **Geliebt:** Windfinders klare Stundentabelle in Knoten, Windys Modellvergleich, DWD-Verlässlichkeit, Yr ohne Werbung, Magicseaweeds Sterne ohne Login. Einsteiger wünschen einen Eignungswert je Können ([Breakfinder](https://breakfinder.surf/feature_wishes/spots-forecasts-for-wing-foiling-and-wind-sports)).

### Must-haves

1. Wind und Böen in kn, umschaltbar auf Bft und km/h, Richtung als Pfeil mit Grad.
2. Stundentabelle im Windfinder-Stil, dazu ein Verlauf.
3. Karte mit Seegang und Wind, mobil bedienbar.
4. Welle mit Höhe, Periode und Richtung, Windsee und Dünung getrennt.
5. Amtliche Warnungen prominent und wörtlich, mit Gültigkeit und Stand.
6. Seewetterbericht je Seegebiet als Text, mit Lesehilfe.
7. Wasserstand und Sturmflut als Hinweis (Watt, Ostsee).
8. Gewitter, Radar, Sicht, Wassertemperatur als Kontext.
9. Herkunft und Aktualität je Wert, ehrliche Unsicherheit.
10. Schnell, ohne Login, ohne Werbung, Favoriten lokal.

### Differenzierung für buscosun

1. **Eine Seite statt fünf Apps**, auf Deutsch, kostenlos.
2. **Amtliche Texte lesbar gemacht:** Wortlaut plus Gebietskarte und Lesehilfe, nie umformuliert.
3. **Profile mit offenen Grenzen** (SUP, Kite, Wing, Jolle, Yacht, Motorboot, Angeln) statt Blackbox-Score.
4. **Ehrlich bei Unsicherheit:** Modellabgleich sichtbar, Herkunft je Wert, „keine Daten“ nie als ruhige See.
5. **DACH-Seen als eigener Fall** in einer späteren Stufe: Wind, Böen, Föhn und Gewitter mit erklärter Warnleuchten-Logik.

### Bewusst nicht bauen

Routing und Törnoptimierung, Navigation und Seekarten, eigene Warnungen oder Entwarnungen, eine weltweite Spot-Datenbank, Konten, Push und AIS. Grund: Haftung, Lizenzen und Betrieb passen nicht zu einer Plattform ohne Backend und Registrierung.

## DWD weather/maritime: Evaluation

Die Quelle ist für Seegang und amtlichen Text hervorragend, für Wind nur bedingt und für Binnenseen gar nicht. Geprüft am 07.10.2026 am Inventar `content.log.bz2` (11.386 Dateien) und an dekodierten GRIB2-Feldern des Laufs 07.10. 00 UTC.

### Bestand

| Produkt | Inhalt | Gitter, Gebiet | Takt, Vorlauf | Größe | Rolle |
| --- | --- | --- | --- | --- | --- |
| CWAM | Küstenseegang Nord- und Ostsee | 630 × 387, 0,0139° × 0,0083° (≈ 900 m), 53,23–56,45 °N, 6,17–14,91 °E, 124.011 Seepunkte | 00 und 12 UTC, 0–78 h stündlich, Dateien ab Lauf + 3:31 bis + 4:07 h | ≈ 95 MB je Lauf, 30–85 KB je Datei | Kern |
| EWAM | Seegang Europa | 526 × 721, 0,1° × 0,05° (≈ 5 km), 30–66 °N, 10,5 °W–42 °E, inkl. Mittelmeer, Schwarzes Meer, IJsselmeer | 00 und 12 UTC, 0–78 h stündlich, ab + 3:16 h | ≈ 143 MB je Lauf | Urlaubsreviere |
| GWAM | Seegang global | 1440 × 699, 0,25° | 00 und 12 UTC, 0–174 h dreistündlich, ab + 3:38 h | ≈ 445 MB je Lauf | Ausblick |
| FQEN50 (Kopf FQDL50 DWHA) | Seewetterbericht Nord- und Ostsee, 9 Seegebiete, heute und morgen: Wind in Bft, Sicht/Wetter, Seegang in m | Text | 8 × täglich, Dateien um 00:15 bis 20:15 UTC | 3–4 KB | Kern |
| FQEN51 (FQDL51) | Küstenbericht, 8 Abschnitte von Ostfriesland bis Rügen: Wind, Sicht | Text | 8 × täglich | 1,4–1,8 KB | Kern |
| WODL45 | Starkwind-, Sturm- und Orkanwarnungen Deutsche Bucht, westliche und südliche Ostsee, Warnstatus der Küsten mit Nummer und Ausgabezeit | Text | alle 3 h, Datei um :45 | 0,9 KB ohne Warnung | Kern |
| FXDL40 | Mittelfrist Nord- und Ostsee, 5 Tage, Wassertemperaturen | Text | 1 × täglich | 1,6 KB | Ausblick |
| FQMM60 (FQDL60) | Seewetterbericht Mittelmeer | Text | 1 × täglich gegen 12:16 UTC | ≈ 1 KB | Urlaubsreviere |
| english/ | FQEN70/71, FQMM80, WODL45 | Text | wie oben | – | nicht nötig |

Alle GRIB2-Dateien sind einzeln bz2-gepackt, reguläres Lat/Lon-Gitter von Nord nach Süd, einfache Packung (Vorlage 5.0) mit 8–16 bit, Landmaske als Bitmap. Die Textprodukte sind WMO-Bulletins: Steuerzeichen am Anfang, Zeilenende `\r\r\n`, Abschluss `=`.

### Die 13 Größen je Modell

Wertebereich am Beispiel CWAM, + 24 h des Laufs 07.10. 00 UTC.

| Ordner | Größe | GRIB2 (Disziplin/Kat./Nr.) | Bereich | Einsatz |
| --- | --- | --- | --- | --- |
| swh | signifikante Wellenhöhe gesamt | 10/0/3 | 0–3,11 m | Hauptfeld, Tabelle |
| mwd | mittlere Wellenrichtung | 10/0/14 | 0–360° | Pfeile |
| tm10 | mittlere Periode Tm−1,0 | 10/0/15 | 1,0–7,8 s | Periode |
| shww | Höhe Windsee | 10/0/5 | 0–3,10 m | Ebene, Verlauf |
| mdww | Richtung Windsee | 10/0/4 | 0–360° | Readout |
| mpww | mittlere Periode Windsee | 10/0/6 | 1,0–6,4 s | Steilheit |
| ppww | Spitzenperiode Windsee | 10/0/35 | 1,0–21,8 s | nur gefiltert |
| shts | Höhe Dünung | 10/0/8 | 0–1,34 m | Ebene, Verlauf |
| mdts | Richtung Dünung | 10/0/7 | 0–360° | Readout |
| mpts | mittlere Periode Dünung | 10/0/9 | 1,0–10,2 s | Readout |
| ppts | Spitzenperiode Dünung | 10/0/36 | 1,0–11,2 s | Readout |
| sp_10m | Windgeschwindigkeit 10 m (Antrieb) | 0/2/1 | 2,00–17,8 m/s | nicht anzeigen |
| dd_10m | Windrichtung 10 m | 0/2/0 | 0–360° | Prüfung |

### Stärken

- **Vollständig und pünktlich.** Alle vier Läufe im 48-h-Fenster komplett: CWAM und EWAM je 1.027 Dateien (13 × 79), GWAM 767 (13 × 59). Ankunft je Lauf auf die Minute gleich.
- **CWAM sieht die Küste.** Im CWAM-Kasten hat EWAM 2.776 Seepunkte, CWAM 124.011. Nur CWAM rechnet in Elbe, Weser, Wismarbucht, Strelasund und Stettiner Haff.
- **Die Modelle passen zueinander.** Offshore liegen CWAM, EWAM und GWAM bis 72 h meist innerhalb von 10–20 % (Chart im nächsten Abschnitt).
- **Plausibel gegen den Text.** + 24 h zeigt das Modell Wind aus 336° in der Deutschen Bucht und aus 138–153° in der westlichen Ostsee; der Küstenbericht sagt „norddrehend“ bzw. „suedostdrehend, zunehmend 4“. Die Richtungen gelten also als „kommt aus“.
- **Genau die Größen, die der Markt will:** Windsee und Dünung getrennt, mit Periode und Richtung.

### Fallen

- **Windboden.** In CWAM stehen 7.487 von 124.011 Seepunkten auf exakt 2,00 m/s, in EWAM 12.499 von 138.388. Der Modellwind wird nie als Wind gezeigt.
- **Platzhalter.** tm10 = 1,0 s an 3.191 Punkten, alle mit Hs ≈ 0. Das heißt „keine Wellen“, nicht „1 Sekunde“.
- **Artefakte.** ppww über 15 s an 468 Punkten mit Hs im Median 0,17 m. Windsee mit solcher Periode gibt es nicht.
- **Watt.** Östlich von Sylt zeigt EWAM 1,95 m, CWAM 0,58 m. CWAM hat Vorrang; ob CWAM den Wasserstand berücksichtigt, klärt der Spike.
- **Keine Binnenseen.** Bodensee, Chiemsee, Genfersee, Neusiedler See, Gardasee und Balaton sind Land; Müritz und Dümmer liegen außerhalb oder auf Land.
- **Veraltete Verzeichnislisten.** Ein Listenabruf zeigte für GWAM den 02.10. als neuesten Lauf, das Inventar den 07.10. Der Producer liest `content.log.bz2` oder prüft erwartete Pfade per HEAD.
- **Keine Messung, kein Ensemble.** Der Bestand ist Vorhersage und Text. Wahrscheinlichkeiten für Welle gibt es nicht, nur den Abgleich der drei Modelle.
- **Ausgabeverzug.** Der erste Schritt kommt 3:16 h (EWAM) bis 3:41 h (GWAM) nach Laufbeginn; „Jetzt“ ist also Vorlaufstunde 4 bis 16.
- **Textformat.** FXDL40 ist ISO-8859-1 mit Umlauten, die übrigen ASCII mit „ue“. FQMM60 trägt HTML-Reste (`<br>`) und `NIL`-Zeilen. Dateiname und Bulletin-Kopf weichen ab (FQEN50_EDZW gegen FQDL50 DWHA).

**Lizenz:** GeoNutzV, entgeltfrei, ohne Registrierung, Quellenvermerk DWD. Die GDI-DE-Metadaten für CWAM und EWAM nennen keine Nutzungseinschränkung.

## Modellabgleich

*[Grafik im claude.ai-Dokument: DWD CWAM, EWAM, GWAM, Lauf 07.10.2026 00 UTC, selbst dekodiert; Punkte 54,20 N 7,75 E · 53,75 N 7,20 E · 54,50 N 10,27 E · 54,75 N 13,55 E; sechsstündlich]*

CWAM (900 m) taugt als Hauptmodell an der deutschen Küste; EWAM und GWAM bestätigen den Verlauf offshore und tragen Urlaubsreviere und Ausblick. Die großen Unterschiede liegen in Küstennähe, wo EWAM zu grob ist (Watt östlich Sylt: EWAM 1,95 m, CWAM 0,58 m). Weil der DWD kein Wellen-Ensemble veröffentlicht, ist dieser Abgleich die einzige Unsicherheitsangabe für Welle, und das Feature beschriftet ihn auch so.

## Ergänzende Quellen und Datenlage DACH

Wind, Messung und Gewitter kommen aus Quellen, die buscosun schon nutzt; offen ist vor allem, ob die DWD-Warnungen Küste und Binnenseen enthalten. Regeln wie bisher: DWD zuerst, keine Registrierung, keine unklare Lizenz, Kollisionen werden als blockiert markiert.

| Quelle | Inhalt | Zugang, Lizenz | Bewertung |
| --- | --- | --- | --- |
| buscosun Fusion 8 / ICON-D2, ICON-EU | Wind, Böen, Sicht, Gewitter je Spot; Windpartikel der Wetterkarte | vorhanden | nutzbar, Windquelle; Abdeckung des Cubes über See im Spike prüfen |
| DWD POI (`weather_reports/poi`) | stündliche Messung an Küstenstationen, u. a. Arkona 10091 mit Böen und Sicht | GeoNutzV | nutzbar als „gemessen jetzt“; Feuerschiffe UFS Deutsche Bucht (10007) und UFS TW Ems (10004) liefern am 07.10. nur „---“ |
| DWD Radar und Blitze | Gewitter an der Küste | vorhanden | nutzbar |
| DWD CAP-Warnungen | amtliche Warnungen; ob Küsten- und Binnenseewarnungen darin stehen, ist offen | GeoNutzV | im Spike prüfen; CAP-Profil auf dwd.de ist für meine Werkzeuge gesperrt |
| [PEGELONLINE](https://www.pegelonline.wsv.de/webservice/ueberblick) (WSV) | gemessener Wasserstand an Küstenpegeln | DL-DE Zero 2.0 | nutzbar, Ausbau „Wasserstand“ |
| BSH Wasserstandsvorhersage, Gezeiten | Vorhersage | Lizenz nicht geprüft | blockiert bis zur Klärung, nur Deep-Link |
| MeteoSchweiz SwissMetNet, GeoSphere TAWES | Wind und Böen an Seestationen (Bodensee, Zürichsee, Neusiedler See) | CC BY 4.0 | nutzbar für den Seen-Ausbau |
| Sturmwarnleuchten Bodensee und bayerische Seen | Status der Leuchten | nicht offen | blockiert; Logik erklären, auf DWD und Kantone verlinken |

**Folgerung je Revier**

- **Deutsche Nord- und Ostseeküste:** volles Paket aus CWAM, Texten, Warnstatus, POI-Messung und Fusion-Wind.
- **Europäische Urlaubsreviere:** EWAM-Seegang, Seewetterbericht Mittelmeer, Wind aus ICON-EU; keine Messung, keine amtliche Warnung des Ziellands.
- **DACH-Seen:** keine Welle im Bestand. Wind, Böen, Gewitter und, falls im CAP enthalten, die DWD-Binnenseewarnung; für AT und CH die Stationen von GeoSphere und MeteoSchweiz. Eigene Stufe, eigene Entscheidung.

## Zielgruppen und Fragen

Alle stellen dieselbe Grundfrage: „Kann ich raus, und wann?“ Das Feature beantwortet sie je Spot und Stunde, gemessen an den Grenzen, die der Nutzer selbst setzt.

| Nutzer | Typische Frage | Antwort im Feature |
| --- | --- | --- |
| Fahrtensegler, Charter Ostsee | Laufen wir morgen aus? | Profil „Yacht“, Fenster je Hafen, Seegang mit Periode, Seewetterbericht des Seegebiets, Warnstatus |
| Kite, Wing, Windsurf | Wann geht es, mit welcher Größe? | Stundenband in kn mit Böen, Richtung zum Ufer (auf-, side-, ablandig), Fenster nur bei Tageslicht |
| SUP, Kajak | Komme ich sicher zurück? | Profil mit niedriger Windgrenze, ablandiger Wind fällt immer heraus, Grenze überschritten ab Uhrzeit X |
| Motorboot, Angler, Kutter | Wie rau wird es, wann ist es ruhig? | Windsee-Höhe und -Periode (kurze, steile See), Tagesfenster |
| Küstenurlauber aus DACH | Was erwartet mich an Nordsee, Ostsee oder am Mittelmeer? | Urlaubsrevier, Seegang, Wassertemperatur aus dem Mittelfrist-Bericht, Gewitter |
| Binnensee-Segler DACH | Kommt Föhn oder ein Gewitter? | spätere Stufe: Wind, Böen und Warnungen, ausdrücklich ohne Welle |

Bewusst nicht im Umfang: Routing, Navigation, Seekarten, eigene Warnungen oder Entwarnungen, Konten, Push, AIS. Amtliche Warnungen erscheinen ausschließlich als wörtliches Zitat, wie im Warn-Layer.

## Feature-Konzept

Das Feature hat drei Zoomstufen: Revier, Spot und Stunde. Jede trennt sichtbar zwischen „Modell“, „gemessen“ und „amtlich“.

### Funktionen

1. **Revier wählen.** Deutsche Bucht und Nordsee · Westliche Ostsee · Östliche Ostsee und Bodden (CWAM, 900 m) · Urlaubsreviere Europa: Adria, Balearen, Côte d’Azur und Ligurien, Ägäis, Dänemark und Südschweden (EWAM, 5 km). Jenseits von 78 h ein grober Ausblick bis 174 h (GWAM).
2. **Spot wählen.** Kuratierter Katalog im Repo: Stufe 1 rund 60 Spots an der deutschen Küste (Häfen, Kite- und Surfspots, Badestrände), später rund 60 in den Urlaubsrevieren. Je Spot: Typ, Uferausrichtung in Grad, Seegebiet, Küstenabschnitt, nächste Messstation, nächster Gitterpunkt mit Wasser. Ein Klick aufs Wasser ohne Spot liefert in Stufe 2 die Reihe des nächsten Gitterpunkts.
3. **Profil wählen.** Jolle, Yacht, Kite, Wing/Windsurf, SUP/Kajak, Motorboot, Angeln. Jedes Profil hat Startgrenzen, die der Nutzer ändern kann; sie stehen in der URL und lokal im Browser.
4. **Stundenband.** Unter der Karte, zugleich Tabelle und Zeitregler: Stunden 0–78, danach dreistündlich bis 174 h als „grob“ markiert. Zeilen: Wind in kn mit Pfeil, Böen, Wellenhöhe, Periode, Wellenrichtung, Profil-Leiste. Tagestrenner, Nacht schattiert. Ein Klick setzt die Karte auf diese Stunde.
5. **Karte.** Seegang als Fläche, Wellenrichtung als Pfeile, Spots als Punkte in Profilfarbe. Ebenen: Seegang gesamt, Windsee, Dünung, Periode, Wind (Partikel der Wetterkarte), Seegebiete mit Warnstatus, Messstationen, Gewitter.
6. **Spot-Briefing.** Jetzt-Werte, das nächste passende Zeitfenster, Verlauf 0–78 h, Spot-Kompass (Wind und Welle zum Ufer), amtlicher Text des Gebiets, letzte Messung an der Küste.
7. **Amtlich lesen.** Seewetterbericht des Seegebiets und Küstenbericht des Abschnitts wörtlich, daneben Gebietskarte und Lesehilfe Bft ↔ kn. Warnstatus wörtlich mit Nummer und Ausgabezeit.
8. **Teilen und Favorit.** Zustand in der URL, etwa `/seewetter/st-peter-ording?p=kite&t=24`, Lieblings-Spots lokal.

### Profile und Startgrenzen

Alle Werte sind begründete Startwerte (`set`), nicht kalibriert: Es gibt keinen Wahrheitsdatensatz für „war ein guter Kitetag“. Quellen: Windguru-Leitfaden für Kite und Wing, Beaufort-Grenzen des Seewetterdienstes, Erfahrungswerte aus der Marktrecherche. Deshalb sind sie sichtbar und änderbar.

| Profil | Wind (kn) | Böen (kn) | Welle | Richtung zum Ufer | Sonst |
| --- | --- | --- | --- | --- | --- |
| Jolle | 5–16 | ≤ 20 | Hs ≤ 0,8 m | – | Tageslicht |
| Yacht (Küste) | 8–22 | ≤ 27 (unter Bft 7) | Hs ≤ 2,0 m | – | Windsee-Periode ≥ 3,5 s bei Hs > 1 m |
| Kite (fortgeschritten) | 15–28 | ≤ 33, Spanne ≤ 10 | – | nicht ablandig | Tageslicht |
| Wing, Windsurf | 12–25 | ≤ 30 | – | nicht ablandig | Tageslicht |
| SUP, Kajak | ≤ 10 | ≤ 14 | Hs ≤ 0,5 m | ablandig nie | Tageslicht |
| Motorboot | ≤ 18 | ≤ 24 | Windsee ≤ 1,0 m | – | – |
| Angeln, Kutter | ≤ 16 | ≤ 22 | Hs ≤ 1,2 m | – | – |

### Regeln

- **Klassen je Stunde:** „passt zu deinen Grenzen“ · „knapp“ (ein Wert innerhalb 10 % an einer Grenze) · „außerhalb deiner Grenzen“ · „keine Daten“. Nie „sicher“ oder „gefährlich“. „Keine Daten“ ist immer schraffiert und sieht nie wie „passt“ aus (D-04).
- **Fenster:** zusammenhängende Stunden „passt“ ab 2 h Länge, im Briefing das nächste und das längste.
- **Richtung zum Ufer:** Winkel zwischen Windrichtung (kommt aus) und der Uferausrichtung des Spots (zeigt seewärts). Bis 30° auflandig, 30–75° schräg auflandig, 75–105° sideshore, 105–150° schräg ablandig, darüber ablandig.
- **Beaufort:** WMO-Tabelle in Knoten (Bft 6 = 22–27 kn, Bft 7 = 28–33 kn, Bft 8 = 34–40 kn); Anzeige wahlweise kn, Bft, km/h, m/s, Voreinstellung kn.
- **Seegang gesamt:** Hs² = Hs(Windsee)² + Hs(Dünung)². Die Komponenten addieren sich nicht linear; Diagramme stapeln sie deshalb nie.
- **Modellwahl je Ort:** CWAM, wo CWAM Wasser hat, sonst EWAM; ab 79 h GWAM. Die Quelle steht an jedem Wert.
- **Hinweistexte:** regelbasiert, sachlich, Wert, Quelle und Uhrzeit im selben Satz. Beispiel: „Wind 24 kn aus Nordwest, Böen 31 kn (buscosun Fusion, Lauf 06 UTC). Deine Kite-Grenze für Böen liegt bei 33 kn.“ Steht eine amtliche Warnung an, folgt sie wörtlich darunter.

## Visualisierung: welche Form für welche Daten

Die Entscheidungsfrage des Nutzers ist zeitlich („wann?“), deshalb trägt eine Tabelle die Hauptlast; die Karte beantwortet „wo?“, nivo den Verlauf, 3D nichts. Geprüft je Datenart gegen die vier Formen.

| Daten | Frage des Nutzers | Form | Warum, was verworfen ist |
| --- | --- | --- | --- |
| Seegang-Feld (Hs) | Wo ist es rau? | **2D-Karte**, Rasterfläche mit eigenem Shader wie Wind- und Niederschlagslayer, sequenzielle Skala 0–6 m | räumliche Frage. 3D verworfen: Hs ist ein statistisches Maß (Mittel des höchsten Drittels), ein Relief täuscht echte Wellenform vor und kostet mobil GPU |
| Wellenrichtung | Woher kommt die See? | **2D-Karte**, Pfeilraster (etwa alle 40 px), Länge nach Periode | Partikel bleiben dem Wind vorbehalten; zwei Partikelsysteme sind nicht unterscheidbar |
| Windsee, Dünung | Kurze steile See oder lange Dünung? | **2D-Karte** als Ebenen-Umschalter, im Verlauf zwei eigene Linien | gestapelte Fläche verworfen: Hs addiert sich quadratisch, nicht linear |
| Periode | Wie unangenehm? | Kartenebene und Tabellenzeile | Platzhalter 1,0 s erscheint als „–“ |
| Wind | Wie viel Wind? | Windpartikel der Wetterkarte (ICON), Zahl in kn im Stundenband | Modellwind aus WAM verworfen (Boden 2,00 m/s) |
| Stundenwerte am Spot | Wann fahre ich? | **Tabelle als Zeitregler**: Stundenband mit eingefärbten Zellen nach Profil | Kernform des Markts (Windfinder, Windguru); Zahlen werden gelesen, nicht Kurven. nivo für diese Rolle verworfen |
| Verlauf 0–78 h | Wird es mehr oder weniger? | **nivo-Line**, zwei gestapelte Diagramme mit gemeinsamer Zeitachse: oben Wind mit Böen-Band (kn), unten Hs gesamt, Windsee, Dünung (m) | `@nivo/line` liegt schon im Repo (Brandradar, Dashboard); keine doppelte y-Achse |
| Richtung zum Ufer | Auf- oder ablandig? | **Spot-Kompass**, eigenes SVG mit Ufer-Sektoren, Wind- und Wellenpfeil | kein nivo-Typ passt; Radar-Chart wäre falsch |
| Ausblick 4–7 Tage | Lohnt das Wochenende? | Tagesbalken mit Spanne Hs min–max je Tag (Whisker) aus GWAM, grau „grob“ | Punktwert wäre falsche Genauigkeit |
| Seewetterbericht | Was sagt der DWD? | Text wörtlich, daneben kleine Gebietskarte (SVG) mit hervorgehobenem Seegebiet | kein Umformulieren, keine Ampel aus Text |
| Warnstatus | Gibt es eine Warnung? | Seegebiete und Küstenabschnitte auf der Karte, Text wörtlich im Readout | „Text nicht lesbar“ wird nie zu „keine Warnung“ |
| Modellabgleich | Wie belastbar? | **nivo-Line**, kleine Mehrfachdiagramme CWAM, EWAM, GWAM am Spot | als „Abgleich, keine Wahrscheinlichkeit“ beschriftet; kein Ensemble |
| Messung Küste | Stimmt das gerade? | Chip im Readout und Punkt auf der Karte | – |

**3D, geprüft und zurückgestellt.** Drei Kandidaten: Seegangsrelief über der Karte, 3D-Wellenspektrum, Querschnitt Küste–See. Keiner beantwortet eine Frage aus der Marktrecherche besser als Karte oder Tabelle; das Relief wäre zudem irreführend. Ein Showcase „3D-Seegang“ bleibt Option für später, falls Nutzung das rechtfertigt.

**Farbskala Seegang** (dunkle Karte, mehrfarbig, gleichmäßig in der Helligkeit steigend): 0–0,5 m Tiefblau, 1 m Petrol, 1,5 m Grünblau, 2 m Oliv, 3 m Amber, 4 m Terracotta, ab 6 m Purpur. Land bleibt dunkelgrau und ist von ruhiger See sicher unterscheidbar.

## UI-Aufbau

Das Feature übernimmt das Command-Deck von Brandradar und Autobahnwetter: Rail, Topbar, Dock links, Karte in der Mitte, Readout rechts, dazu das Stundenband über dem Kartenfuß. Das UI-Mockup zeigt Desktop (1440 px, klickbar) und Mobil (390 px) mit Seegangsfeldern aus dem echten CWAM-Lauf vom 07.10.2026.

Zum Anklicken: [Seewetter – UI-Mockup](https://claude.ai/artifact/D1nvnMEM4AgET93ocaG3b1) (Desktop 1440 interaktiv, Mobil 390). Umsetzung: [Seewetter – Implementierungsplan](https://claude.ai/artifact/UpwTiqUiFySdALFGpfwJy3).

| Bereich | Größe (Desktop) | Inhalt |
| --- | --- | --- |
| Rail | 62 px | Feature-Navigation, neues Icon „Seewetter“ (Welle) |
| Topbar | 60 px hoch | Marke, Laufstatus (CWAM 00 UTC, bereit 05:31), Seewetterbericht-Zeit, Einheit kn/Bft, Teilen |
| Dock links | 250 px | Suche, Revier-Chips, Profil mit Grenzen, Spotliste mit Profilstatus, Ebenen, Datenlage und blockierte Quellen |
| Karte | Rest (728 px bei 1440) | Seegangsfläche, Richtungspfeile, Seegebiete, Spots, Spot-Pille, Zeit-Chips, Legende, Modell-Badge |
| Stundenband | über dem Kartenfuß | 78 Stunden plus Ausblick, horizontal scrollbar, Klick setzt die Zeit |
| Readout rechts | 400 px | Reiter Spot, Seegebiet, Quellen |

### Interaktionen

- **Spot wählen** (Liste, Karte, Suche): Karte zentriert, Stundenband und Briefing wechseln.
- **Profil wählen:** Spotliste, Kartenpunkte, Profil-Leiste und Fenster rechnen neu; „Grenzen anpassen“ öffnet die Werte.
- **Stunde wählen** im Band oder über Zeit-Chips (Jetzt, +6, +12, +24, +48, +72 h): Karte, Pfeile und Readout springen mit.
- **Ebene wählen:** gesamt, Windsee, Dünung, Periode; Wind und Seegebiete sind Zusatzebenen.
- **Reiter Seegebiet:** Seewetterbericht und Küstenbericht wörtlich, Mittelfrist, Lesehilfe.
- **Reiter Quellen:** Modellabgleich, Laufzeiten, Prüfer-Bilanz, blockierte Quellen, Lizenzen.
- Zustand in der URL, etwa `/seewetter/st-peter-ording?p=kite&t=24&l=hs`, passend zur Share-Linie.

### Zeichensprache

- Gefüllter Punkt = Spot mit Modellreihe, Ring = Messstation, schraffiert = keine gültigen Daten.
- Spotfarbe nach Profilklasse: Salbei = passt, Amber = knapp, Terracotta = außerhalb, schraffiert = keine Daten. Die Klassen unterscheiden sich auch in der Helligkeit, nicht nur im Farbton.
- Neuer Token-Namespace `--sw-*`, Akzent „Seewetter-Petrol“ `#0F6E7A`; Schrift wie im Deck (League Spartan, IBM Plex Mono); Breakpoints 767 und 1439 px.
- Amtliches steht immer in einem eigenen Kasten mit Quelle, Nummer und Ausgabezeit.

### Mobil (bis 767 px)

Karte vollflächig, oben Spot-Pille, Teilen und Zeit-Chips. Ein Bottom-Sheet trägt das Briefing: nächstes Fenster, Kennzahlen, ein waagrecht wischbares Stundenband, der Warnstatus wörtlich gekürzt auf die Kopfzeile mit „ganzen Text lesen“. In der zweiten Stufe öffnet das Sheet den Readout mit Verlauf und Kompass.

## Datenpipeline und Architektur

Alle schweren Schritte laufen außerhalb des Browsers; der Browser bekommt geprüfte Felder als PNG und Spot-Reihen als JSON über jsDelivr, wie bei Radar, Cube und Autobahnwetter. Kein Backend, kein Netlify-Traffic.

### Zwei Linien

- **Feld- und Spot-Linie, 2 × täglich.** Ein Workflow `sea.yml` im Daten-Repo (Vorlage in `buscosun-web/scripts/sea/`) startet gegen 03:50, 04:20, 15:50 und 16:20 UTC mit Leerlauf-Schutz: Er prüft per HEAD, ob der letzte erwartete Schritt da ist, lädt nur die nötigen Größen, dekodiert mit dem vorhandenen GRIB2-Decoder, prüft, schreibt und veröffentlicht. GitHubs Startverzug von 7–31 min ist bei 12-h-Takt unkritisch.
- **Text-Linie, alle 3 h.** Als weiteres Produkt im Radar-Spiegel, wie das Autobahnwetter: HEAD auf `FQEN50`, `FQEN51`, `WODL45`, `FXDL40`, `FQMM60` je `_LATEST`, bei neuem Stand laden, Kopf und Struktur prüfen, wörtlich plus Gliederung ablegen.

### Bausteine

| Baustein | Ort | Aufgabe |
| --- | --- | --- |
| `sea.yml` + `scripts/sea/sea-derive.mjs` | Daten-Repo, Producer aus buscosun-web | GRIB2 laden, dekodieren, prüfen, Felder und Spot-Reihen schreiben |
| `scripts/sea/sea-text.mjs` | Kindprozess im Radar-Spiegel | Bulletins holen, prüfen, gliedern |
| `sea/v1/run/<modell>/<lauf>/f/<schritt>.png` | buscosun-data | Feld gesamt, RGBA8: R = Hs in 5-cm-Stufen, G = Richtung, B = Tm in 0,1 s, A = Wasser-Maske |
| `sea/v1/run/<modell>/<lauf>/c/<schritt>.png` | buscosun-data | Komponenten dreistündlich: Windsee- und Dünungshöhe, Dünungsrichtung |
| `sea/v1/spots/<lauf>.json` | buscosun-data | Reihen je Spot 0–174 h: Welle aus CWAM/EWAM/GWAM, Wind und Böen aus buscosun Fusion |
| `sea/v1/text/<produkt>/<ausgabe>.json` | buscosun-data | Bulletin wörtlich, gegliedert nach Gebiet → Wind, Sicht/Wetter, Seegang |
| `sea/v1/static/` | buscosun-data | Spots, Seegebiete, Küstenabschnitte als Geometrie |
| `src/sea/` | buscosun-web, Lazy-Chunk | Deck, Karte (MapLibre-Layer), Stundenband, Readout, Vertrag `seaContract.ts` |

### Budget (gemessen)

Ein CWAM-Schritt als RGBA-PNG wiegt 152 KB, ein EWAM-Schritt 206 KB (Browser-Encoder, unoptimiert, + 36 h). Stündlich über 79 Schritte wären das rund 12 MB (CWAM) und 16 MB (EWAM) je Lauf. Deshalb: stündlich bis 48 h, danach dreistündlich (59 Schritte); EWAM in Revier-Ausschnitten; PNG nachoptimieren; nur der neueste und der vorige Lauf liegen im Repo. Ziel: ≤ 25 MB je Lauf für `sea/` insgesamt, im Spike messen. Passt das nicht in buscosun-data, bekommt `sea/` ein eigenes Daten-Repo (E-SW-3).

### Repo-Regeln, die direkt greifen

- Flag `?sea=1`, voreingestellt aus bis Gate C.
- Herkunft je Wert: `model`, `measured`, `official`; amtlicher Text nur wörtlich.
- Der Client rechnet den erwarteten Lauf und die erwartete Ausgabe aus der Uhr und tritt bei 404 einen Schritt zurück; kein veränderliches Manifest am CDN.
- Verifier im Repo-Stil: `verify:sea-contract`, `verify:sea-decode`, `verify:sea-text`, `verify:sea-derive`, `verify:sea-ui`.
- Eigener Chunk, `eagerJs` darf nicht wachsen.

## Risiken und offene Fragen

Das größte Risiko ist das Vertrauen: Wer „passt“ liest, fährt raus. Darum zeigt das Feature nie eine Entwarnung, sondern immer Wert, Quelle, Uhrzeit und die eigene Grenze, und das Amtliche steht über allem.

| Risiko | Wirkung | Gegenmaßnahme |
| --- | --- | --- |
| „Passt“ wird als „sicher“ gelesen | Sicherheits- und Haftungsfrage | Wortwahl „deine Grenzen“, Vorbehalt auf Kachel und Seite, Amtliches zuerst, keine Entwarnungssprache |
| Parser liest eine Warnung falsch | „Keine Warnung“, obwohl eine gilt | Status nur aus dem exakt erkannten Satz „Fuer die deutsche …kueste besteht keine … Warnung“; sonst „Text lesen“ und Wortlaut |
| Repo- und CDN-Budget | Veröffentlichung scheitert | Messung im Spike, Ausschnitte, dreistündlich ab 48 h, notfalls eigenes Repo |
| DWD ändert Format oder Namen | Felder oder Texte falsch | Prüfer-Bilanz, Lauf- und Ausgabe-Sperre, versionierter Pfad `v1` |
| Lauf erst + 3–4 h verfügbar | „Jetzt“ ist eine Vorhersage | Laufzeit und Alter im Status; Messung an der Küste als Gegenprobe |
| Watt und Wasserstand | Welle im Watt ohne Gezeitenbezug | Hinweis an Watt-Spots, Spike prüft CWAM; Ausbau PEGELONLINE |
| Fusion über See nicht kalibriert | Wind am Spot ungenauer als an Land | Spots auf Hafen- oder Strandlage, Herkunft „Modell“, Spike prüft Cube-Abdeckung |
| Urlaubsreviere ohne Warnung und Messung | Erwartung gleicher Tiefe wie an der deutschen Küste | Revier-Badge „Modell, ohne amtliche Warnung des Ziellands“ mit Link zu Meteoalarm |

### Entscheidungen für dich

| Nr. | Frage | Empfehlung |
| --- | --- | --- |
| E-SW-1 | Name und Route | „Seewetter“, `/seewetter`, Aliase `/kuestenwetter`, `/segelwetter`, `/wellen` |
| E-SW-2 | Zuschnitt Stufe 1 | deutsche Küste mit CWAM und Texten; Urlaubsreviere als Stufe 2 |
| E-SW-3 | Ablage | Linie `sea/` in buscosun-data, falls das Budget passt, sonst eigenes Repo |
| E-SW-4 | Ingest der Felder | Produkt im Radar-Spiegel, wenn der Spike Laufzeit und Speicher als unkritisch misst; sonst eigener Workflow `sea.yml` (Stand Plan) |
| E-SW-5 | Spot-Katalog | eigene kuratierte Liste im Repo; OSM nur bei Freigabe von ODbL |
| E-SW-6 | DACH-Seen | eigene Stufe nach Gate C, ohne Welle |
| E-SW-7 | Wasserstand | PEGELONLINE als Ausbau, BSH-Vorhersage erst nach Lizenzklärung |
| E-SW-8 | Kachel-Platz | Kachel 12, volle Breite am Ende |
| E-SW-9 | Einheit | Knoten als Voreinstellung, Bft und km/h umschaltbar |

**Offene Prüfpunkte für den Spike:** Enthalten die DWD-CAP-Daten Küsten- und Binnenseewarnungen? Wie sehen WODL45 und FQEN50 bei aktiver Warnung aus (Beispiel sammeln)? Berücksichtigt CWAM Wasserstand und Strömung? Woher kommen Seegebietsgrenzen als Geometrie (BSH-Merkblatt „Wetter- und Warnfunk“, das PDF war für mich nicht lesbar)?

## Quellen

Geprüft am 07.10.2026. Die DWD-Daten selbst (Inventar, GRIB2, Bulletins) habe ich direkt von opendata.dwd.de gelesen und dekodiert; dwd.de und maps.dwd.de waren für meine Werkzeuge per robots.txt gesperrt.

- [DWD Open Data: weather/maritime](https://opendata.dwd.de/weather/maritime/) mit `content.log.bz2`, `forecast/german`, `wave_models/{cwam,ewam,gwam}/grib`
- [DWD Open Data: weather_reports/poi](https://opendata.dwd.de/weather/weather_reports/poi/)
- [GDI-DE: CWAM signifikante Wellenhöhe](https://gdk.gdi-de.org/geonetwork/srv/api/records/urn:x-wmo:md:de.dwd.nwv.cwam.SWH), [EWAM](https://gdk.gdi-de.org/geonetwork/srv/api/records/urn:x-wmo:md:de.dwd.nwv.ewam.SWH), [WAM-Dienst](https://gdk.gdi-de.org/geonetwork/srv/api/records/urn:x-wmo:md:de.dwd.nwv.services.wms.wam)
- [LuckGrib: DWD Wave Coast](https://luckgrib.com/models/dwd_wave_coast/), [Windy Community: DWD-Wellenmodelle](https://community.windy.com/topic/6113/free-wave-models-by-dwd)
- [PEGELONLINE Webservice](https://www.pegelonline.wsv.de/webservice/ueberblick)
- [yacht.de: Die 20 wichtigsten Segel-Apps 2026](https://www.yacht.de/segelwissen/navigation/die-20-wichtigsten-segel-apps-2026-alles-zu-wetter-navigation-und-toernplanung/), [Wetter-Apps für Einsteiger](https://www.yacht.de/segelwissen/wetterkunde/navigation-tornplanung-routing-apps-fur-einsteiger/), [Alpenseen-Sturmwarndienste](https://www.yacht.de/segelwissen/wetterkunde/extremwetter-auf-den-alpenseen-diese-sturmwarndienste-sollte-jeder-kennen/)
- [surf-magazin: Wetter-Apps für Windsurfer](https://www.surf-magazin.de/windsurfen/zubehoer/sonstiges/grosser-vergleich-wetter-apps-fuer-windsurfer/), [boote: Weather check 2026](https://www.boote-magazin.de/en/equipment/technology/weather-check-2026-the-best-apps-for-safe-boating/)
- [RideEvolve: Windguru für Kite und Wing](https://rideevolve.eu/en/blog/news-1/2026-guide-using-windguru-for-kite-and-wing-570)
- [Kanton Aargau: Sturmwarndienst](https://www.ag.ch/de/themen/mobilitaet-verkehr/schifffahrt/sturmwarndienst), [14-Tage-Wettervorhersage: Warnungen an süddeutschen Seen](https://14-tage-wettervorhersage.de/news/archiv/230610/)
- [§ 4 DWDG](https://www.gesetze-im-internet.de/dwdg/__4.html), [SeaHelp: NAVTEX](https://www.sea-help.eu/technik/navtex-nautische-wetter-warnmeldung/), [Windfinder AGB](https://es.windfinder.com/contact/terms/terms_2023)
- Marktzahlen und Wettbewerber: Links stehen in den Tabellen der Marktrecherche.
