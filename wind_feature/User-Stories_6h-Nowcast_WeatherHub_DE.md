# User Stories – 6-Stunden-Niederschlags-Nowcast (DACH)

**Produkt:** WeatherHub (buscosun.com) · **Modul:** Niederschlags-Nowcast 0–6 h
**Datenbasis:** ICON-D2 / ICON-EU + DWD-Radar · **Stack:** Vite + React + TS, MapLibre GL JS + Three.js
**Grundlage:** Funktionslastenheft (F-01…F-26, N-01…N-06) + DACH-Nutzerrecherche

> **Scope-Abgrenzung (wichtig):** Dieses Feature ist der **detaillierte Niederschlagskern** für die nächsten 6 h.
> - **Kein** Routing/Streckenwetter — das liefert das Bestandsfeature **„Wetter entlang der Route"**.
> - **Kein** Best-Day-/Event-Empfehler — das liefert das Bestandsfeature **„Event-Planer"**.
> - Beide Bestandsfeatures **konsumieren** diesen Nowcast als Datenquelle (siehe Integrations-Story US-A7); sie werden hier **nicht** nachgebaut.
> - Der Fokus liegt auf **Niederschlags-Tiefe** (Epic B): Phase, Schneefallgrenze, Gewitter/Hagel, Summe, Schauer- vs. Dauerregen, Trockenfenster — also genau das, was Routen- und Event-Feature nicht liefern.

**Konventionen**
- Jede Story verweist auf die erfüllte(n) Lastenheft-ID(s) (`→ F-xx`). **F-27…F-33** sind hier vorgeschlagene **Lastenheft-Ergänzungen** für die Niederschlags-Tiefe.
- Priorität: `MUSS` (MVP) · `SOLL` (Fast-Follow) · `KANN` (später).
- Akzeptanzkriterien in Wenn/Dann-Form, wo das Verhalten testbar ist.

---

## Personas

| Key | Persona | Kernbedürfnis |
|-----|---------|---------------|
| P1 | **Standort-Nutzer** (z. B. vor dem Losgehen) | Regnet es an MEINEM Standort in den nächsten 60–90 min – und wann genau? |
| P2 | **Alpenwanderer** | Tal- vs. Grat-Genauigkeit, Schneefallgrenze, vor dem Aufstieg. |
| P3 | **Eltern/Garten** | Verlässliche Warnung, bevor das Gewitter wirklich da ist. |
| P4 | **Power-User** | Modell, Phase & Unsicherheit sehen, selbst beurteilen. |
| P5 | **Casual/Schnellblick** | Ein-Blick-Antwort ohne Wühlen. |
| P7 | **Skeptiker** (Ex-Apple-Wetter) | App muss zu dem passen, was ich gerade aus dem Fenster sehe. |

*(Die frühere Event-Planer-Persona entfällt hier — sie ist durch das Bestandsfeature abgedeckt.)*

---

## EPIC A — Kern-Forecast & Datenfusion (→ F-01…F-06)

### US-A1 — Nahtloser 0–6-h-Verlauf ohne Lücken
**MUSS** · → F-01
**Als** Standort-Nutzer (P1) **möchte ich** eine durchgehende Niederschlagsprognose von jetzt bis +6 h ohne zeitliche Lücke an meinem Standort, **damit** ich nie vor dem „Was ist in einer Stunde?"-Loch zwischen Radar-Loop und Modellblöcken stehe.
- **AK1** Gegeben ich öffne den Nowcast, wenn ich die Timeline von t=0 bis t=+6 h schiebe, dann liefert jeder Schritt (≤15 min Granularität) einen Wert ohne „keine Daten"-Segment.
- **AK2** Gegeben der Radar-Horizont endet (~+90 min), wenn ich darüber hinausgehe, dann läuft die Kurve ohne sichtbaren Bruch oder Wertesprung weiter.
- **AK3** Die aktive Quelle (Radar / Blend / Modell) ist je Zeitschritt abfragbar (für QA & US-E5).

### US-A2 — Radar→NWP-Blending nach Vorlaufzeit gewichtet
**MUSS** · → F-02
**Als** System **möchte ich** die Radar-Extrapolation bei t=0 hoch gewichten und mit steigender Vorlaufzeit zu ICON-D2(-RUC) überblenden, **damit** die Prognose jede Quelle dort nutzt, wo sie am skillvollsten ist.
- **AK1** Bei t=0…~+30 min ist der Blend radar-dominant; ab ~+2…3 h modell-dominant; der Übergang ist monoton (keine Oszillation).
- **AK2** Die Blend-Gewichte sind je Niederschlagstyp/-skala (konvektiv vs. stratiform, siehe US-B5) konfigurierbar, nicht eine fixe Kurve.
- **AK3** Ein Unit-/Regressionstest prüft, dass die Blend-Gewichte zu festen Vorlaufzeiten innerhalb definierter Toleranzen bleiben.

### US-A3 — Intensität in Stufen, nicht binär
**MUSS** · → F-03
**Als** Casual-Nutzer (P5) **möchte ich** Niederschlag in abgestuften Intensitätsbändern (z. B. kein / leicht / mäßig / stark / sehr stark), **damit** ich Niesel von Platzregen unterscheiden kann.
- **AK1** Jeder Zeitschritt bildet auf ein benanntes Band ab, mit explizitem mm/h-Bereich bei Tap/Hover.
- **AK2** Die Band-Schwellen sind dokumentiert und über Kartenfarben, Timeline und Alerts hinweg konsistent.

### US-A4 — Präzise Start-/Stopp-Zeiten im Nahbereich
**MUSS** · → F-04
**Als** Standort-Nutzer (P1) **möchte ich** die prognostizierte Regen-Start- und -Stoppzeit an meinem Standort, **damit** ich im Nahbereich minutengenau planen kann (z. B. kurz vor die Tür gehen).
- **AK1** Gegeben Regen wird innerhalb ~90 min erwartet, wenn ich meinen Standort ansehe, dann wird „beginnt ~HH:MM / endet ~HH:MM" angezeigt.
- **AK2** Auflösung ≤15 min innerhalb des Radar-Horizonts; das Label degradiert sauber zu einem gröberen Fenster weiter draußen (Anschluss an US-A6).
- **AK3** Wird in 6 h kein Regen erwartet, wird klar „die nächsten 6 h trocken" angezeigt.

### US-A5 — Häufige Nowcast-Aktualisierung
**SOLL** · → F-05
**Als** System **möchte ich** den Radar-/Nowcast-Layer alle ≤5–15 min aktualisieren, **damit** das Nahbereichsbild aktuell bleibt.
- **AK1** Die UI zeigt den Zeitstempel der letzten Aktualisierung; veraltete Daten (> Intervall × 2) werden markiert.
- **AK2** Die Aktualisierung setzt Zoom/Pan und Timeline-Position des Nutzers nicht zurück.

### US-A6 — Confidence sinkt sichtbar mit Vorlaufzeit
**SOLL** · → F-06, N-01
**Als** Skeptiker (P7) **möchte ich** sehen, dass die Prognose weiter draußen unsicherer wird, **damit** mich keine falsche scharfe Präzision bei +3…6 h täuscht.
- **AK1** Die 0–6-h-Darstellung unterscheidet visuell den sicheren Nahbereich vom unsichereren Fernbereich (z. B. breiter werdendes Band, Ausblenden, explizites Label).
- **AK2** Für Vorlaufzeiten jenseits des Skill-Horizonts wird keine minutengenaue Start-/Stopp-Aussage gerendert (Guardrail gegen N-01).

### US-A7 — Nowcast als Datenquelle für Bestandsfeatures bereitstellen
**SOLL** · → F-01, F-03
**Als** System **möchte ich** den 0–6-h-Niederschlag (inkl. Phase, Intensität, Summe) über eine interne Schnittstelle bereitstellen, **damit** die Bestandsfeatures „Wetter entlang der Route" und „Event-Planer" diesen Kern konsumieren können, statt eigene Niederschlagslogik zu führen.
- **AK1** Eine punkt-/zeitbasierte Abfrage liefert je Standort und Zeitschritt: Intensitätsband, Phase, Wahrscheinlichkeit, Summe.
- **AK2** Die Schnittstelle ist von der UI entkoppelt (kein UI-Code nötig, um Werte zu beziehen).
- **AK3** Routen-/Event-Feature bauen **keine** eigene Nowcast-Logik nach (Scope-Guardrail).

---

## EPIC B — Niederschlags-Detail & -Tiefe (→ F-27…F-33, NEU) ★ Kern dieses Features

### US-B1 — Niederschlagsphase (Regen/Schnee/Schneeregen/gefrierender Regen)
**MUSS** · → F-27
**Als** Standort-Nutzer (P1) **möchte ich** je Zeitschritt die Phase sehen — Regen, Schnee, Schneeregen oder gefrierender Regen —, **damit** ich Glätte- und Schneerisiko einschätzen kann, nicht nur „Niederschlag".
- **AK1** Jeder Zeitschritt trägt eine eindeutige Phase; die Phase ist in Karte und Timeline farblich/ikonografisch unterscheidbar.
- **AK2** Ein Phasenwechsel im 6-h-Fenster wird mit Übergangszeitpunkt ausgewiesen (z. B. „ab ~16:40 Übergang Regen → Schnee").
- **AK3** Gefrierender Regen wird als eigenes, deutlich markiertes Signal behandelt (Glättegefahr).

### US-B2 — Schneefallgrenze (Höhenangabe)
**SOLL** · → F-28
**Als** Alpenwanderer (P2) **möchte ich** die prognostizierte Schneefallgrenze in Metern über die 6 h, **damit** ich weiß, ab welcher Höhe auf meiner Tour Schnee statt Regen fällt.
- **AK1** Die Schneefallgrenze wird als Höhe (m ü. NN) je Zeitschritt angezeigt und kann sich über die 6 h ändern.
- **AK2** Für alpine Standorte wird die Grenze in Bezug zur Tal-/Grat-Höhe (US-F1) gesetzt („Grenze 1.800 m – dein Gipfelziel 2.400 m liegt darüber").

### US-B3 — Gewitter- und Hagel-Wahrscheinlichkeit als eigenes Signal
**MUSS** · → F-29
**Als** Elternteil/Garten (P3) **möchte ich** Gewitter- und Hagel-Risiko als eigene Signale (nicht nur „Intensität"), **damit** ich konvektive Gefahren früh erkenne.
- **AK1** Gewitter- und Hagelrisiko werden je Zeitschritt separat als Wahrscheinlichkeit/Stufe ausgewiesen.
- **AK2** Ein erhöhtes Risiko ist in der Schnellblick-Ansicht (US-D1) ohne Navigation sichtbar.

### US-B4 — Starkregen-/Unwetter-Signal
**SOLL** · → F-30
**Als** Standort-Nutzer (P1) **möchte ich** ein klares Starkregen-/Unwetter-Signal bei kritischen Mengen/Raten, **damit** ich Überflutungs-/Sturzflut-Risiko einschätzen kann.
- **AK1** Überschreitet die prognostizierte Rate oder Summe eine Starkregen-Schwelle, wird dies eigens markiert (nicht nur als oberstes Intensitätsband).
- **AK2** Die Schwellen orientieren sich an etablierten DWD-Warnstufen und sind dokumentiert.

### US-B5 — Charakter: Schauer vs. Dauerregen
**SOLL** · → F-32
**Als** Power-User (P4) **möchte ich** wissen, ob der Niederschlag konvektiv (Schauer, kurz/intensiv/lokal) oder stratiform (Dauerregen, flächig/anhaltend) ist, **damit** ich die räumliche/zeitliche Unsicherheit richtig einordne.
- **AK1** Der Charakter wird je Zeitschritt/Phase ausgewiesen (Schauer vs. Dauerregen).
- **AK2** Der Charakter speist die Blend-Gewichtung (US-A2 AK2) und die Confidence-Darstellung (US-A6).

### US-B6 — Niederschlagssumme (Akkumulation) über 0–6 h
**SOLL** · → F-31
**Als** Standort-Nutzer (P1) **möchte ich** die erwartete Niederschlagssumme in mm über die nächsten 6 h (kumuliert), **damit** ich die Gesamtmenge einschätze, nicht nur die Momentanrate.
- **AK1** Eine kumulierte mm-Summe für 0–6 h wird angezeigt, optional als wachsende Kurve über die Timeline.
- **AK2** Bei Unsicherheit wird die Summe als Bandbreite (min/wahrscheinlich/max) gezeigt (Anschluss an US-E2).

### US-B7 — Trockene Fenster explizit ausweisen
**MUSS** · → F-33
**Als** Standort-Nutzer (P1) **möchte ich**, dass niederschlagsfreie Fenster innerhalb der 6 h explizit benannt werden (z. B. „trocken 14:20–15:10"), **damit** ich kurze Pausen für Aktivitäten im Freien nutzen kann.
- **AK1** Zusammenhängende trockene Intervalle ≥ einer Mindestdauer werden mit Start/Ende ausgewiesen.
- **AK2** Trockenfenster sind in Timeline und Schnellblick-Ansicht erkennbar.

---

## EPIC C — Kartendarstellung & Geo (→ F-07…F-10)

### US-C1 — Zoombare, hochauflösende Niederschlagskarte
**MUSS** · → F-07
**Als** Alpenwanderer (P2) **möchte ich** die Radar-/Niederschlagskarte bis zu meinem Tal zoomen, **damit** die Karte nutzbar ist, statt „einen viel zu großen Bereich" abzudecken.
- **AK1** Die Karte zoomt flüssig auf Straßen-/Talebene; das Niederschlagsraster bleibt lesbar (kein einzelner grober Pixel, der meine Position überdeckt).
- **AK2** Die MapLibre-Tile-/Raster-Quelle unterstützt den Ziel-Zoombereich ohne klotzige Hochskalierungs-Artefakte bei nutzbaren Stufen.

### US-C2 — Hohe Gitterauflösung aus ICON-D2 (keine grobe Interpolation)
**MUSS** · → F-08
**Als** Alpenwanderer (P2) **möchte ich** das Prognosegitter fein genug, um Grat von Tal zu trennen, **damit** ein Gebirge nicht als „ein einziger großer Berg" dargestellt wird.
- **AK1** Das dargestellte Feld stammt aus ICON-D2-Auflösung, nicht aus grober Global-Modell-Interpolation.
- **AK2** Zwei real unterschiedliche Punkte eines Tal-/Grat-Paares können verschiedene Werte zeigen.

### US-C3 — Animierter Vor-/Rückwärts-Loop
**SOLL** · → F-09
**Als** beliebiger Nutzer **möchte ich** eine Animation des Niederschlagsfeldes über das 0–6-h-Fenster vor- und zurückspielen, **damit** ich sehe, wie das System auf mich zukommt.
- **AK1** Play/Pause + Scrub; der Loop deckt vergangenes Radar (≥ −60 min) bis +6 h ab.
- **AK2** Der Zeitstempel des aktuellen Frames ist immer sichtbar; die Animation folgt der aktiven Timeline-Position.

### US-C4 — Punktabfrage an meiner exakten Position
**MUSS** · → F-10
**Als** Skeptiker (P7) **möchte ich** die Prognose an meiner exakten GPS-Position (oder einem gesetzten Pin), **damit** die Antwort hyperlokal ist („regnet es HIER").
- **AK1** Gegeben Standortfreigabe, wenn ich den Nowcast öffne, dann zentriert er auf meine Position und meldet den dortigen Punktwert.
- **AK2** Ich kann einen Pin setzen/verschieben, um jeden anderen Punkt abzufragen; die Timeline aktualisiert sich auf diesen Punkt.

---

## EPIC D — Schnellblick-Ansichten & Alerts (→ F-11…F-15)

### US-D1 — Schnellblick-Einstiegsansicht „Regen in den nächsten Stunden?"
**MUSS** · → F-11
**Als** Casual-Nutzer (P5) **möchte ich** eine Ein-Blick-Antwort auf der Start-/Einstiegsansicht (inkl. Phase & erhöhtem Gewitterrisiko), **damit** ich nicht navigieren oder durch Menüs wühlen muss.
- **AK1** Der erste Bildschirm sagt ohne Interaktion, ob in den nächsten Stunden Niederschlag erwartet wird, in welcher Phase und ungefähr wann.
- **AK2** Ein kompaktes Home-Widget (wo die Plattform es erlaubt) spiegelt diese Zusammenfassung.

### US-D2 — Einfaches Timeline-/Intensitätsdiagramm als Karten-Alternative
**SOLL** · → F-12
**Als** Casual-Nutzer (P5) **möchte ich** ein einfaches Intensität-über-Zeit-Diagramm (mit markierten Trockenfenstern), **damit** ich die Prognose ohne Karteninterpretation lesen kann.
- **AK1** Ein Balken-/Liniendiagramm zeigt die Intensität je Schritt für 0–6 h mit hervorgehobenem Regenfenster und Trockenfenstern (US-B7).
- **AK2** Diagramm und Karte sind umschaltbar und für denselben Punkt/dieselbe Zeit stets konsistent.

### US-D3 — Push-Benachrichtigung bei Regenbeginn am Standort
**MUSS** · → F-13
**Als** Elternteil im Garten (P3) **möchte ich** einen Push-Alert, bevor Niederschlag meinen Standort erreicht, **damit** ich nicht unvorbereitet erwischt werde.
- **AK1** Gegeben gespeicherter Standort und erteilte Freigabe, wenn Niederschlagsbeginn innerhalb des Vorlauffensters prognostiziert wird, dann wird ein Push mit Startzeit + Intensität + Phase gesendet.
- **AK2** Pushes werden dedupliziert (kein wiederholter Alert für dasselbe Ereignis) und respektieren Ruhezeiten.

### US-D4 — Einstellbare, kalibrierte Alert-Schwellen
**MUSS** · → F-14, N-01
**Als** Elternteil (P3) **möchte ich** Intensitäts- und Vorlaufzeit-Schwellen für Alerts setzen (und optional Gewitter/Glätte separat), **damit** ich sowohl Fehlalarme als auch verpasste Gefahren vermeide.
- **AK1** Nutzer kann minimales Intensitätsband und gewünschte Vorlaufzeit setzen; Defaults sind sinnvoll (keine Überwarnung bei trivialen Schwellen).
- **AK2** Alert-Schwellen bilden auf dieselben Intensitätsbänder wie US-A3 ab (eine konsistente Skala).
- **AK3** Ein Test prüft, dass ein Alert nur feuert, wenn das prognostizierte Band ≥ Nutzer-Schwelle innerhalb des Vorlauffensters liegt.

### US-D5 — Keine Tagesüberzeichnung
**SOLL** · → F-15, N-02
**Als** beliebiger Nutzer **möchte ich**, dass eine einzelne kurze Regenstunde NICHT den ganzen Tag als „Regen" markiert, **damit** Zusammenfassungen nicht irreführen.
- **AK1** Eine Zusammenfassung spiegelt Regendauer/-abdeckung, nicht einen Einzelstunden-Trigger.
- **AK2** Kein eigenständiger Tages-Prozentwert wird als Headline-Zahl verwendet (Guardrail gegen N-02).

---

## EPIC E — Vertrauen, Transparenz & Unsicherheit (→ F-16…F-19)

### US-E1 — Sichtbare Datenherkunft
**MUSS** · → F-16
**Als** Power-User (P4) **möchte ich** sehen, welche Daten die Prognose speisen (ICON-D2/ICON-EU, DWD-Radar), **damit** ich einer bekannten, quellengetriebenen Pipeline vertraue.
- **AK1** Eine zugängliche „Datenquellen"-Angabe nennt Modell(e), Radarquelle und letzten Modelllauf.

### US-E2 — Unsicherheits-/Wahrscheinlichkeitsband je Stunde
**SOLL** · → F-17
**Als** Power-User (P4) **möchte ich** die Unsicherheit je Stunde als Bandbreite oder Wahrscheinlichkeit (auch für Phase und Summe), **damit** ich die Confidence beurteilen kann, statt einer falsch-präzisen Zahl zu vertrauen.
- **AK1** Jeder Schritt zeigt eine Wahrscheinlichkeit oder min/wahrscheinlich/max-Bandbreite (ensemble-artig), nicht nur einen Punktwert.
- **AK2** Die Wahrscheinlichkeit ist explizit stundenbezogen („Regenwahrscheinlichkeit in dieser Stunde"), nie ein vager Tageswert.

### US-E3 — Nowcast und Stundenprognose widersprechen sich nie sichtbar
**MUSS** · → F-18, N-04
**Als** beliebiger Nutzer **möchte ich**, dass Radar-Nowcast und Stundenprognose eine kohärente Story erzählen, **damit** mich kein „Regen jetzt laut Radar, trocken jetzt laut Prognose" verwirrt.
- **AK1** Für jeden überlappenden Zeitschritt stimmen Karte, Timeline, Diagramm und Textzusammenfassung innerhalb der Band-Toleranz überein.
- **AK2** Ein Regressionstest markiert jeden Widerspruch zwischen Ansichten an der Blend-Grenze.

### US-E4 — Bekannte Radar-Artefakte erklären
**KANN** · → F-19
**Als** Skeptiker (P7) **möchte ich** eine kurze Erklärung, wenn das Radar irreführen kann (Niederschlag aloft, der verdunstet; Bodenclutter/Fehlechos; Sprühregen nicht erkannt), **damit** eine scheinbar „falsche" Anzeige mein Vertrauen nicht bricht.
- **AK1** Kontexthilfe/Info erklärt diese Grenzen in klarer Sprache, auf Abruf (nicht aufdringlich).

### US-E5 — Quellen-/Skill-Indikator je Zeitschritt (intern + optional UI)
**SOLL** · → F-01, F-06
**Als** Power-User (P4) **möchte ich** optional sehen, ob ein Zeitschritt radar-, blend- oder modellgetrieben ist, **damit** ich verstehe, warum sich Nah- und Fernbereichs-Confidence unterscheiden.
- **AK1** Standardmäßig ausgeblendet; in einer Detail-/Pro-Ansicht verfügbar.

---

## EPIC F — DACH-/Terrain-Spezifika (→ F-20…F-21)

### US-F1 — Tal- vs. Berg-Aufteilung (Berg-/Talwetter)
**SOLL** · → F-20
**Als** Alpenwanderer (P2) **möchte ich** getrennten Tal- und Grat-Niederschlag (inkl. Phase & Schneefallgrenze), **damit** ein Pixel nicht zwei sehr unterschiedliche Lagen vermischt.
- **AK1** Für alpine Standorte bietet die Prognose einen Tal-Wert und einen repräsentativen Grat-/Gipfel-Wert.
- **AK2** Die Schneefallgrenze (US-B2) wird relativ zu beiden Höhen eingeordnet.

### US-F2 — Regionales Quellenbewusstsein (DE/CH/AT)
**KANN** · → F-21
**Als** Schweizer/österreichischer Nutzer **möchte ich**, dass die App die vertrauenswürdige nationale Quelle meiner Region anerkennt (DE: DWD; CH: MeteoSwiss; AT: GeoSphere/INCA), **damit** die Prognose zu dem passt, dem ich bereits vertraue.
- **AK1** Die Herkunft (US-E1) spiegelt die regional passende Quelle, wo integriert.

*(Frühere Stories US-E3 „Use-Case-Presets" und US-E4 „Event-6-h-Ansicht" entfernt — durch Bestandsfeature „Event-Planer" abgedeckt; siehe Integrations-Story US-A7.)*

---

## EPIC G — UX, Performance & Geschäftsmodell (→ F-23…F-26)

### US-G1 — Kernfunktion „wird es regnen" werbefrei und ohne Paywall
**MUSS** · → F-23, N-06
**Als** beliebiger Nutzer **möchte ich** den Kern-Nowcast frei von Werbung und Paywall, **damit** die Basisantwort nie hinter Monetarisierung verschwindet.
- **AK1** Die 0–6-h-Niederschlagsantwort, Karte, Timeline und ein Basis-Alert sind ohne Bezahlung und ohne Werbe-Interstitials nutzbar.
- **AK2** Kein aggressives Drittanbieter-Tracking im Kern-Flow (Guardrail gegen N-06).

### US-G2 — Flüssige, ruckelfreie Karte & Animation
**MUSS** · → F-24
**Als** beliebiger Nutzer **möchte ich**, dass Karte und Animation flüssig rendern, **damit** die App nicht ruckelt oder abstürzt.
- **AK1** Die Animation hält eine Ziel-Framerate auf Mittelklasse-Mobilhardware; kein Absturz bei wiederholtem Zoom/Scrub.
- **AK2** Performance-Budget für Tile-/Raster-Laden und Three.js-Layer definiert.

### US-G3 — Optionaler Pro-/Daten-Modus mit Modellvergleich
**KANN** · → F-25
**Als** Power-User (P4) **möchte ich** einen optionalen erweiterten Modus zum Modellvergleich / zur Dateninspektion, **damit** ich selbst interpretieren kann.
- **AK1** Der Pro-Modus ist Opt-in und überfrachtet die Default-Ansicht nicht.

### US-G4 — Aufgeräumtes Default-UI, Komplexität ausblendbar
**SOLL** · → F-26, N-04
**Als** Casual-Nutzer (P5) **möchte ich** ein aufgeräumtes Default aus Karte + Timeline mit ausgeblendeten Detaildaten, **damit** ich nicht „von der schieren Menge erschlagen" werde.
- **AK1** Der Default-Bildschirm zeigt nur das Wesentliche; erweiterte Layer/Metriken (Phase-Detail, Charakter, Summe) liegen hinter einem Toggle.

---

## EPIC H — Guardrails / Negative Stories (→ N-01…N-06)

Explizite „darf NICHT"-Stories, die als Akzeptanz-Gates im Backlog bleiben.

| ID | Guardrail-Story | → N-xx |
|----|-----------------|--------|
| US-H1 | Das System **darf nicht** minutengenaue Regen-Aussagen jenseits des Skill-Horizonts (~30 min konvektiv / ~2 h stratiform) anzeigen. | N-01 |
| US-H2 | Die UI **darf nicht** einen einzelnen Tages-Regenwahrscheinlichkeitswert als Headline-Zahl verwenden. | N-02 |
| US-H3 | Das Produkt **darf nicht** eine „präzise" 14-Tage-Prognose bewerben. | N-03 |
| US-H4 | Die Default-Ansicht **darf nicht** ein Alles-auf-einmal-Dashboard sein. | N-04 |
| US-H5 | Das Produkt **darf nicht** Deko-Animation über Prognose-Korrektheit stellen. | N-05 |
| US-H6 | Die App **darf nicht** aggressives Tracking / viele Werbepartner im Kern-Flow ausliefern. | N-06 |
| US-H7 | Das Feature **darf nicht** Routing/Streckenwetter oder einen Event-Empfehler nachbauen — diese liefern die Bestandsfeatures. | (Scope) |

---

## Lastenheft-Ergänzungen (vorgeschlagen)

Diese IDs erweitern das bisherige Lastenheft um die Niederschlags-Tiefe (Epic B):

| ID | Anforderung | Prio | Story |
|----|-------------|------|-------|
| F-27 | Niederschlagsphase (Regen/Schnee/Schneeregen/gefrierender Regen) inkl. Übergangszeitpunkt | MUSS | US-B1 |
| F-28 | Schneefallgrenze als Höhenangabe (m ü. NN) über 0–6 h | SOLL | US-B2 |
| F-29 | Gewitter- und Hagel-Wahrscheinlichkeit als eigenes Signal | MUSS | US-B3 |
| F-30 | Starkregen-/Unwetter-Signal an DWD-Warnstufen orientiert | SOLL | US-B4 |
| F-31 | Niederschlagssumme/Akkumulation über 0–6 h (mm) | SOLL | US-B6 |
| F-32 | Charakter Schauer (konvektiv) vs. Dauerregen (stratiform) | SOLL | US-B5 |
| F-33 | Trockene Fenster explizit ausweisen (Start/Ende) | MUSS | US-B7 |

---

## Coverage-Matrix (Story ↔ Anforderung)

| Anforderung | Abgedeckt durch |
|-------------|-----------------|
| F-01 | US-A1, US-A7, US-E5 |
| F-02 | US-A2 |
| F-03 | US-A3, US-A7 |
| F-04 | US-A4 |
| F-05 | US-A5 |
| F-06 | US-A6, US-E5 |
| F-07 | US-C1 |
| F-08 | US-C2 |
| F-09 | US-C3 |
| F-10 | US-C4 |
| F-11 | US-D1 |
| F-12 | US-D2 |
| F-13 | US-D3 |
| F-14 | US-D4 |
| F-15 | US-D5 |
| F-16 | US-E1 |
| F-17 | US-E2 |
| F-18 | US-E3 |
| F-19 | US-E4 |
| F-20 | US-F1 |
| F-21 | US-F2 |
| F-23 | US-G1 |
| F-24 | US-G2 |
| F-25 | US-G3 |
| F-26 | US-G4 |
| F-27 | US-B1 |
| F-28 | US-B2 |
| F-29 | US-B3 |
| F-30 | US-B4 |
| F-31 | US-B6 |
| F-32 | US-B5 |
| F-33 | US-B7 |
| N-01…N-06 | US-A6/US-D5 + US-H1…US-H6 |

*Hinweis: F-22 (Use-Case-Presets) entfällt in diesem Feature, da durch den bestehenden „Event-Planer" abgedeckt. Jede verbleibende Anforderung (F-01…F-21, F-23…F-26) sowie die neuen F-27…F-33 bilden auf mindestens eine Story ab. Story-übergreifend gilt der Scope-Guardrail US-H7. AK-reiche Stories (US-A2, US-B1, US-D4) im Sprint-Planning weiter in Sub-Tasks splitten.*
