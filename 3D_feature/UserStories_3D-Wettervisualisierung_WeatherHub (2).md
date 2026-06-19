# User Stories – 3D-Wettervisualisierung (WeatherHub)

**Grundlage:** Recherche „3D-Wettervisualisierung" + Funktionales Lastenheft v0.1
**Stand:** 2026-06-02
**Format:** Story (Als … möchte ich … damit …) + Akzeptanzkriterien (Gherkin) + Traceability (FA-ID, ZG) + MoSCoW + Schätzung (Story Points, Fibonacci)

**Personas (aus Lastenheft §3):**
ZG-1 Wanderer/Tourengeher/Fotograf · ZG-2 Gleitschirm-/Segelflieger · ZG-3 Drohnenpilot · ZG-4 Kranführer/Baustelle · ZG-5 Event-/Veranstaltungsplaner

**Schätz-Legende:** 1–2 klein · 3–5 mittel · 8 groß · 13 sehr groß (ggf. weiter splitten)

---

## Epic A – Höhenwind-Geländeschnitt *(Must)*

### US-A1 · Schnittlinie zeichnen
**Als** ZG-1 / ZG-2 / ZG-3
**möchte ich** auf der Karte eine Linie aus zwei oder mehr Punkten setzen,
**damit** ich festlege, entlang welcher Strecke der vertikale Wetterschnitt berechnet wird.
*FA-A1 · Must · 3 SP*

**Akzeptanzkriterien**
- Angenommen ich bin in der Kartenansicht, wenn ich den Schnitt-Modus aktiviere und zwei Punkte setze, dann wird eine Schnittlinie zwischen ihnen gezeichnet.
- Angenommen ich habe zwei Punkte gesetzt, wenn ich weitere Punkte hinzufüge, dann folgt die Schnittlinie allen Punkten in Reihenfolge.
- Angenommen eine Linie existiert, wenn ich einen Punkt verschiebe oder lösche, dann aktualisiert sich der Schnitt unmittelbar.

### US-A2 · Vertikalen Schnitt über reales Gelände anzeigen
**Als** ZG-1
**möchte ich** den vertikalen Schnitt mit der echten Geländekontur darunter sehen,
**damit** ich Wetterwerte räumlich dem Berg/Tal zuordnen kann.
*FA-A1 · Must · 5 SP*

**Akzeptanzkriterien**
- Angenommen eine Schnittlinie ist gesetzt, wenn der Schnitt rendert, dann erscheint das Geländeprofil (DEM) als untere Begrenzung.
- Angenommen das Geländeprofil ist sichtbar, dann sind horizontale Distanz und Höhe (m ü. NN) achsenbeschriftet.

### US-A3 · Wind auf echter Höhe über Grund (AGL)
**Als** ZG-3
**möchte ich** Windgeschwindigkeit und -richtung auf realer Höhe über Grund sehen (nicht nur Druckfläche),
**damit** ich den Wind auf meiner tatsächlichen Flughöhe ablesen kann.
*FA-A2 · Must · 8 SP*

**Akzeptanzkriterien**
- Angenommen der Schnitt ist aktiv, wenn ich eine Höhe in m AGL wähle, dann zeigt das System Windwerte für diese Höhe an.
- Angenommen ich lese einen Wert ab, dann ist klar erkennbar, dass er sich auf Höhe über Grund (nicht über NN) bezieht.
- Angenommen die Daten liegen als Druckfläche vor, dann interpoliert das System unter Nutzung des DEM auf AGL (siehe DA-2).

### US-A4 · Böen zusätzlich zum Mittelwind
**Als** ZG-3 / ZG-4
**möchte ich** Böen (Gusts) getrennt vom mittleren Wind sehen,
**damit** ich die für meine Sicherheit relevanten Spitzen einschätzen kann.
*FA-A3 · Must · 3 SP*

**Akzeptanzkriterien**
- Angenommen der Wind-Schnitt ist aktiv, wenn ich die Böen-Darstellung aktiviere, dann werden Böen visuell unterscheidbar vom Mittelwind gezeigt.
- Angenommen ich picke einen Punkt, dann werden Mittelwind und Böe als getrennte Zahlenwerte ausgegeben.

### US-A5 · Zeitlicher Verlauf im 15-Min-Takt
**Als** ZG-1 / ZG-3
**möchte ich** den Schnitt über die Zeit animieren bzw. per Slider durchsteppen,
**damit** ich den optimalen Zeitpunkt (Start/Flug) finde.
*FA-A4 · Must · 5 SP*

**Akzeptanzkriterien**
- Angenommen ein Schnitt ist aktiv, wenn ich den Zeit-Slider bewege, dann aktualisiert sich der Schnitt im 15-Min-Raster.
- Angenommen ich starte die Animation, wenn sie läuft, dann wird der aktuell dargestellte Zeitstempel angezeigt.

### US-A6 · Wind-Shear hervorheben
**Als** ZG-2 / ZG-3
**möchte ich** Bereiche mit starker Windänderung über die Höhe hervorgehoben sehen,
**damit** ich gefährliche Scherungszonen erkenne.
*FA-A5 · Should · 5 SP*

**Akzeptanzkriterien**
- Angenommen der Schnitt ist aktiv, wenn ich Shear-Hervorhebung aktiviere, dann werden Höhenbänder mit hoher Windänderung markiert.
- Angenommen eine Shear-Zone ist markiert, dann ist der Schwellenwert der Markierung in der Legende dokumentiert.

### US-A7 · Gespeicherte Tour als Schnittlinie übernehmen
**Als** ZG-1
**möchte ich** eine bereits geplante Route als Schnittlinie laden,
**damit** ich nicht manuell nachzeichnen muss.
*FA-A6 · Should · 3 SP*

**Akzeptanzkriterien**
- Angenommen ich habe eine gespeicherte Tour, wenn ich „als Schnitt übernehmen" wähle, dann wird die Tour-Geometrie zur Schnittlinie.

### US-A8 · Verankerte Höhen-Streamlines am Hang
**Als** ZG-2
**möchte ich** Windpfeile/Streamlines am Geländeschnitt sehen, die räumlich verankert sind,
**damit** ich Anströmung und Hangwind intuitiv erfasse.
*FA-A7 · Could · 8 SP*

**Akzeptanzkriterien**
- Angenommen der Schnitt ist aktiv, wenn Streamlines eingeschaltet sind, dann folgen sie der Strömung relativ zum Gelände (kein freier, ortsloser Partikeleffekt).

---

## Epic B – Inversion / Kaltluftsee *(Must)*

### US-B1 · Inversionsobergrenze als 3D-Füllstand
**Als** ZG-1
**möchte ich** die Obergrenze des Kaltluftsees als gefüllten 3D-Körper über dem Gelände sehen,
**damit** ich sofort erkenne, bis wohin Nebel/Kaltluft reicht.
*FA-B1 · Must · 8 SP*

**Akzeptanzkriterien**
- Angenommen eine Inversion ist prognostiziert, wenn der Layer aktiv ist, dann wird die Kaltluft als Volumen bis zur Inversionshöhe über dem Terrain dargestellt.
- Angenommen keine Inversion ist prognostiziert, dann zeigt der Layer einen klaren „keine Inversion"-Zustand statt einer leeren Szene.

### US-B2 · Gipfel über/unter der Inversion markieren
**Als** ZG-1
**möchte ich** sehen, welche Gipfel/Orte über bzw. unter der Inversionsgrenze liegen,
**damit** ich ein sonniges Ziel oberhalb wählen kann.
*FA-B2 · Must · 5 SP*

**Akzeptanzkriterien**
- Angenommen der Inversions-Layer ist aktiv, wenn ein bekannter Gipfel oberhalb der Grenze liegt, dann wird er als „über Inversion" markiert.
- Angenommen ein Ort liegt unterhalb, dann wird er als „im Kaltluftsee/Nebel" markiert.

### US-B3 · Inversionshöhe über Zeit animieren
**Als** ZG-1
**möchte ich** die Entwicklung der Inversionshöhe über den Tagesverlauf durchsteppen,
**damit** ich erkenne, wann der Nebel sich auflöst oder absinkt.
*FA-B3 · Must · 3 SP*

**Akzeptanzkriterien**
- Angenommen der Layer ist aktiv, wenn ich den Zeit-Slider bewege, dann passt sich die dargestellte Inversionshöhe an.

### US-B4 · Temperaturdifferenz Tal ↔ oberhalb
**Als** ZG-1
**möchte ich** die Temperaturdifferenz zwischen Tal und Bereich oberhalb der Inversion als Zahl sehen,
**damit** ich den Mehrwert des Aufstiegs einschätze.
*FA-B4 · Should · 3 SP*

**Akzeptanzkriterien**
- Angenommen der Layer ist aktiv, dann zeigt das System Tal-Temperatur, Temperatur oberhalb und die Differenz.

### US-B5 · Hinweis bei stabiler Inversion (Luftqualität/Frost)
**Als** ZG-1
**möchte ich** bei stabiler Inversion einen Luftqualitäts-/Frosthinweis erhalten,
**damit** ich gesundheitliche/praktische Folgen berücksichtige.
*FA-B5 · Could · 3 SP*

**Akzeptanzkriterien**
- Angenommen eine stabile Inversion ist prognostiziert, wenn der Layer aktiv ist, dann erscheint ein entsprechender Hinweis mit Datenbezug.

### US-B6 · Lawinen-Kontext Oberflächenreif
**Als** ZG-1 (Tourengeher)
**möchte ich** einen Hinweis auf Oberflächenreif an der Nebelobergrenze sehen,
**damit** ich die Schwachschicht-Problematik einplane.
*FA-B6 · Could · 3 SP*

**Akzeptanzkriterien**
- Angenommen die Nebelobergrenze ist bekannt, wenn die Bedingungen Oberflächenreif begünstigen, dann erscheint ein klar als nicht-verbindlich gekennzeichneter Hinweis.

---

## Epic C – Wolkenbasis & Schichtbewölkung *(Should)*

### US-C1 · Wolkenbasis relativ zur Geländehöhe
**Als** ZG-1 / ZG-2
**möchte ich** die Wolkenbasis im Verhältnis zur Gipfelhöhe sehen,
**damit** ich beurteile, ob der Gipfel in der Wolke liegt.
*FA-C1 · Should · 5 SP*

**Akzeptanzkriterien**
- Angenommen der Layer ist aktiv, dann wird die Wolkenbasis-Höhe gegen das Geländeprofil dargestellt.
- Angenommen ein Gipfel liegt über der Basis, dann wird „Gipfel in Wolke" kenntlich gemacht.

### US-C2 · Mehrere Wolkenstockwerke unterscheiden
**Als** ZG-2
**möchte ich** tiefe/mittlere/hohe Bewölkung getrennt sehen,
**damit** ich die Schichtung für meine Flugplanung verstehe.
*FA-C2 · Should · 3 SP*

**Akzeptanzkriterien**
- Angenommen mehrere Schichten sind prognostiziert, dann sind sie visuell und in der Legende unterscheidbar.

### US-C3 · Volumetrische Wolken mit Entscheidungsbezug
**Als** ZG-1
**möchte ich** Wolken volumetrisch über dem Terrain sehen,
**damit** die Szene realistisch und dennoch ablesbar bleibt.
*FA-C3 · Could · 8 SP*

**Akzeptanzkriterien**
- Angenommen volumetrische Wolken sind aktiv, dann bleibt die Wolkenbasis-Höhe weiterhin numerisch/visuell ablesbar (kein reines Eye-Candy).

### US-C4 · Auf-/Zureißen animieren
**Als** ZG-1
**möchte ich** den zeitlichen Verlauf der Bewölkung durchsteppen,
**damit** ich Aufklarungs-Fenster finde.
*FA-C4 · Could · 3 SP*

**Akzeptanzkriterien**
- Angenommen der Layer ist aktiv, wenn ich den Zeit-Slider bewege, dann ändert sich der Bedeckungsgrad entsprechend.

---

## Epic D – Föhn / Lee-Wellen / Talwind *(Could)*

### US-D1 · Föhn-Durchgriff markieren
**Als** ZG-2
**möchte ich** sehen, wo der Föhn durchgreift („Föhnfenster"),
**damit** ich Start-/Flugzonen einschätze.
*FA-D1 · Could · 5 SP*

**Akzeptanzkriterien**
- Angenommen Föhn ist prognostiziert, wenn der Layer aktiv ist, dann werden Durchgriffszonen räumlich markiert.

### US-D2 · Lee-Wellen/Rotoren im Schnitt
**Als** ZG-2
**möchte ich** Lee-Wellen- und Rotorzonen entlang des Schnitts sehen,
**damit** ich Turbulenz-/Steiggebiete erkenne.
*FA-D2 · Could · 8 SP*

**Akzeptanzkriterien**
- Angenommen Wellenbildung ist prognostiziert, dann werden Wellen-/Rotorzonen entlang der Schnittlinie dargestellt.

### US-D3 · Talwind-Umkehrzeitpunkt
**Als** ZG-2
**möchte ich** den Zeitpunkt der Talwind-Umkehr sehen,
**damit** ich Start-/Landezeit plane.
*FA-D3 · Could · 3 SP*

**Akzeptanzkriterien**
- Angenommen ein Talwindsystem ist prognostiziert, dann wird der Umkehrzeitpunkt ausgegeben.

---

## Epic E – B2B-Schwellenwert-Layer *(Should, separat validierbar)*

### US-E1 · Arbeits-/Flughöhe definieren
**Als** ZG-3 / ZG-4
**möchte ich** meine Arbeits- oder Flughöhe eingeben,
**damit** ich Wind/Böen exakt für diese Höhe erhalte.
*FA-E1 · Should · 3 SP*

**Akzeptanzkriterien**
- Angenommen ich gebe eine Höhe ein, dann gibt das System Wind und Böen genau für diese Höhe aus.

### US-E2 · Eigene Schwellenwerte hinterlegen
**Als** ZG-4 / ZG-5
**möchte ich** eigene Grenzwerte (z. B. Böen-Limit) speichern,
**damit** das System gegen meine Vorgaben prüft.
*FA-E2 · Should · 3 SP*

**Akzeptanzkriterien**
- Angenommen ich hinterlege einen Grenzwert, dann wird er für die aktuelle Auswertung verwendet und bleibt gespeichert.

### US-E3 · Go/No-Go-Status
**Als** ZG-3 / ZG-5
**möchte ich** einen eindeutigen grün/rot-Status bei Über-/Unterschreitung,
**damit** ich schnell eine Betriebsentscheidung treffe.
*FA-E3 · Should · 5 SP*

**Akzeptanzkriterien**
- Angenommen ein Grenzwert ist gesetzt, wenn die Prognose ihn überschreitet, dann zeigt das System „No-Go" mit Zeitfenster.
- Angenommen kein Grenzwert wird überschritten, dann zeigt das System „Go".

### US-E4 · Höhenfaktor-Profil zur Plausibilisierung
**Als** ZG-4
**möchte ich** sehen, wie der Wind vom Boden zur Arbeitshöhe zunimmt,
**damit** ich die Prognose nachvollziehe.
*FA-E4 · Could · 5 SP*

**Akzeptanzkriterien**
- Angenommen eine Arbeitshöhe ist gesetzt, dann zeigt das System Bodenwert, Höhenwert und Faktor.

### US-E5 · Auswertung exportieren/teilen
**Als** ZG-5
**möchte ich** die Schwellenwert-Auswertung als PDF/Link exportieren,
**damit** ich sie dokumentieren und weitergeben kann.
*FA-E5 · Could · 5 SP*

**Akzeptanzkriterien**
- Angenommen eine Auswertung liegt vor, wenn ich exportiere, dann enthält die Ausgabe Ort, Zeit, Höhe, Werte, Grenzwert und Status.

---

## Epic F – Interaktion & 2D-Kopplung *(Must)*

### US-F1 · 2D bleibt Default
**Als** ZG-1
**möchte ich** dass die 2D-Sicht der Standard bleibt und ich 3D aktiv aufrufe,
**damit** ich nicht überfordert werde und schnell Basics sehe.
*FA-F1 · Must · 2 SP*

**Akzeptanzkriterien**
- Angenommen ich öffne WeatherHub, dann ist die 2D-Sicht aktiv und 3D ist ein separat aufrufbarer Modus.

### US-F2 · Zustandserhaltender Wechsel 2D ↔ 3D
**Als** ZG-1
**möchte ich** beim Wechsel zwischen 2D und 3D Ort, Zeit und Parameter behalten,
**damit** ich den Kontext nicht verliere.
*FA-F2 · Must · 5 SP*

**Akzeptanzkriterien**
- Angenommen ich habe Ort/Zeit/Parameter gewählt, wenn ich zu 3D wechsle, dann bleiben alle drei erhalten — und umgekehrt.

### US-F3 · Legende mit Einheit und Höhenbezug
**Als** ZG-1 / ZG-3
**möchte ich** zu jedem 3D-Layer eine Legende mit Einheit und Höhenbezug,
**damit** ich Werte korrekt interpretiere.
*FA-F3 · Must · 2 SP*

**Akzeptanzkriterien**
- Angenommen ein 3D-Layer ist aktiv, dann zeigt die Legende Einheit, Skala und ob sich Höhen auf AGL oder NN beziehen.

### US-F4 · Punkt-Pick mit Exaktwerten
**Als** ZG-3 / ZG-4
**möchte ich** auf einen Punkt im Schnitt klicken und exakte Werte sehen,
**damit** ich konkrete Zahlen statt nur Farben erhalte.
*FA-F4 · Should · 3 SP*

**Akzeptanzkriterien**
- Angenommen ein Schnitt ist aktiv, wenn ich einen Punkt picke, dann erscheinen Höhe, Wind, Böe und Temperatur an dieser Stelle.

### US-F5 · Teilbarer Permalink des 3D-Zustands
**Als** ZG-2 / ZG-5
**möchte ich** den aktuellen 3D-Zustand als Link teilen,
**damit** andere genau dieselbe Ansicht sehen.
*FA-F5 · Should · 5 SP*

**Akzeptanzkriterien**
- Angenommen ich habe einen 3D-Zustand (Ort/Zeit/Layer/Schnittlinie), wenn ich den Permalink öffne, dann wird genau dieser Zustand rekonstruiert.

---

## Epic NFR – Querschnittliche, technische Stories *(überwiegend Must)*

### US-N1 · Performance Renderzeit
**Als** Nutzer
**möchte ich** dass ein 3D-Layer schnell lädt,
**damit** ich nicht abbreche.
*NFA-1 · Must · 5 SP* — AK: Initiale Renderzeit ≤ 2 s (Mid-Range-Desktop), ≤ 4 s (aktuelles Mobilgerät) auf definierter Referenz-Hardware.

### US-N2 · Flüssige Interaktion
**Als** Nutzer
**möchte ich** ruckelfreies Drehen/Zoomen/Slidern,
**damit** die Bedienung angenehm ist.
*NFA-2 · Must · 5 SP* — AK: ≥ 30 FPS bei Interaktion auf Referenz-Hardware.

### US-N3 · Graceful Degradation
**Als** Nutzer mit schwachem Gerät
**möchte ich** einen automatischen 2D-Fallback,
**damit** die App trotzdem funktioniert.
*NFA-3 · Must · 3 SP* — AK: Bei fehlender WebGL-/Performance-Eignung fällt das System auf 2D mit erklärendem Hinweis zurück.

### US-N4 · Touch-Bedienbarkeit
**Als** mobiler Nutzer
**möchte ich** Schnitt/Höhe/Zeit per Touch bedienen,
**damit** ich unterwegs arbeiten kann.
*NFA-4 · Should · 5 SP* — AK: Kernfunktionen sind per Touch ohne Maus bedienbar.

### US-N5 · Barrierearme Farbkodierung
**Als** Nutzer mit Farbsehschwäche
**möchte ich** Layer auch ohne Rot-Grün-Unterscheidung verstehen,
**damit** ich nichts fehlinterpretiere.
*NFA-5 · Must · 2 SP* — AK: Jede Kodierung hat Label/Legende; keine reine Rot-Grün-Logik.

### US-N6 · Datenaktualität sichtbar
**Als** Nutzer
**möchte ich** den Modelllauf-Zeitstempel je Layer sehen,
**damit** ich die Aktualität einschätze.
*NFA-6 · Should · 2 SP* — AK: Je Layer ist der Modelllauf-Zeitstempel sichtbar.

### US-N7 · Kein irreführender Photorealismus
**Als** Nutzer
**möchte ich** dass die Darstellung Modellunsicherheit nicht verschleiert,
**damit** ich keine Scheingenauigkeit annehme.
*NFA-7 · Must · 3 SP* — AK: Bei hoher Unsicherheit erscheint ein Hinweis; Detailgrad suggeriert keine Genauigkeit über die Modellauflösung hinaus.

---

## Sprint-/Reihenfolge-Empfehlung (abgeleitet aus MoSCoW)

**Iteration 1 (MVP, Must):** US-F1, US-F2, US-F3, US-A1, US-A2, US-A3, US-A5, US-B1, US-B2, US-B3, US-N1, US-N2, US-N3, US-N5, US-N7
**Iteration 2 (Should):** US-A4, US-A6, US-A7, US-B4, US-C1, US-C2, US-E1, US-E2, US-E3, US-F4, US-F5, US-N4, US-N6
**Iteration 3 (Could):** US-A8, US-B5, US-B6, US-C3, US-C4, US-D1, US-D2, US-D3, US-E4, US-E5

> Hinweis: US-A4 (Böen) ist im Lastenheft Must, hier aber bewusst für die B2B-Relevanz in Iteration 2 gruppierbar, falls der MVP zunächst Consumer-fokussiert (Inversion + Basis-Höhenwind) ausgeliefert wird. Entscheidung an dich.

## Offene Punkte (blockieren finale AK)
- Referenz-Hardware für US-N1/US-N2 definieren.
- E-1-Engagement-Schwellwert (Lastenheft §2.3) festlegen — beeinflusst „Definition of Done" der Layer.
- Inversionshöhen-Toleranz (m) für US-B1/US-B2 festlegen.
- Erste B2B-Vertikale für Epic E final wählen (Empfehlung: Drohne/ZG-3).
