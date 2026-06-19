# WeatherHub — Feature: "Vorhersagesicherheit & Modellvergleich"
## User Stories (DACH-Markt, Laien + Profis)

> Granulare User Stories für ein Feature, das Forecast-Confidence, Modell-Übereinstimmung und Vorhersage-Stabilität abdeckt. Aufgebaut nach bedarfsorientierten Epics mit Progressive Disclosure (einfacher Default für Laien, Detailtiefe auf Abruf für Profis). Jede Story enthält Akzeptanzkriterien im Given/When/Then-Format. Bewusst technologie- und quellenneutral formuliert.

---

## Personas

- **Lena (Laie)** — checkt morgens schnell das Wetter, will nur wissen "kann ich mich drauf verlassen?". Keine Meteorologie-Kenntnisse.
- **Markus (Enthusiast)** — Hobby-Wetterfreak, segelt/läuft, vergleicht aktiv Vorhersagen, will Bandbreiten und Streuung sehen.
- **Dr. Berg (Profi/Power-User)** — braucht Verteilungen, Streuungsdetails, Verlaufsdaten, will einen Experten-Modus ohne Vereinfachung.

---

## EPIC 1 — Vertrauensanzeige auf einen Blick (Default für Laien)

**Bedarf:** "Wie sicher ist diese Vorhersage?" — sofort verständlich, ohne Fachwissen.

### US-1.1 — Confidence-Chip pro Tag
**Als** Lena **möchte ich** zu jeder Tagesvorhersage ein klares Vertrauenslabel sehen, **damit** ich einschätzen kann, wie verlässlich die Prognose ist.
- **Given** eine Tagesvorhersage in der 7-Tage-Ansicht
- **When** die Ansicht geladen wird
- **Then** wird pro Tag ein Chip mit Label + Prozentwert angezeigt: "Hohe Sicherheit (~80 %)", "Mittlere Sicherheit (~55 %)", "Niedrige Sicherheit (~30 %)"
- **And** das Label nutzt verankerte Schwellen (Hoch ≥ 70 %, Mittel 40–69 %, Niedrig < 40 %)
- **And** das Vertrauen sinkt sichtbar mit zunehmender Vorlaufzeit

### US-1.2 — Vertrauen nicht nur über Farbe kommunizieren (Accessibility)
**Als** farbsehschwacher Nutzer **möchte ich** Vertrauensstufen auch ohne Farbe erkennen, **damit** das Feature für mich nutzbar ist.
- **Given** ein Confidence-Chip
- **When** er gerendert wird
- **Then** wird die Stufe durch Farbe **und** Icon **und** Textlabel codiert (nie Farbe allein)
- **And** die Farbskala ist sequenziell, nicht Rot-Grün
- **And** Kontrastwerte erfüllen WCAG AA

### US-1.3 — Niederschlagswahrscheinlichkeit korrekt erklären
**Als** Lena **möchte ich** verstehen, was "30 % Regen" bedeutet, **damit** ich es nicht falsch interpretiere.
- **Given** eine angezeigte Niederschlagswahrscheinlichkeit
- **When** ich auf den Wert tippe/hovere
- **Then** erscheint ein Tooltip in Klartext, der die Bedeutung des Prozentwerts eindeutig erläutert
- **And** die App nutzt durchgängig **eine** definierte Bedeutung der Niederschlagswahrscheinlichkeit

### US-1.4 — Handlungsempfehlung bei niedriger Sicherheit
**Als** Lena **möchte ich** bei unsicherer Prognose einen Hinweis bekommen, **damit** ich weiß, was zu tun ist.
- **Given** eine Vorhersage mit niedriger Sicherheit (< 40 %)
- **When** ich die Tagesansicht öffne
- **Then** erscheint ein dezenter Hinweis: "Prognose noch unsicher — morgen erneut prüfen"
- **And** der Hinweis verschwindet bei hoher Sicherheit

### US-1.5 — Unsicherheitsband im Temperaturchart (Default)
**Als** Lena **möchte ich** im Temperaturverlauf sehen, wie groß die Bandbreite ist, **damit** ich Unsicherheit intuitiv erfasse.
- **Given** der Standard-Temperaturchart
- **When** er gerendert wird
- **Then** wird eine mittlere Verlaufslinie plus halbtransparentes Band für die Bandbreite dargestellt ("Unsicherheitswolke")
- **And** das Band wird mit zunehmender Vorlaufzeit breiter
- **And** es ist ohne statistisches Vorwissen lesbar (Tooltip: "größere Fläche = mehr Unsicherheit")
- **And** es werden **keine** harten Grenzlinien verwendet, die ein binäres "sicher/unsicher" suggerieren

---

## EPIC 2 — Vorhersagevergleich & Übereinstimmung (Enthusiasten)

**Bedarf:** "Sind sich die Vorhersagen einig?" — Übereinstimmung = Verlässlichkeit.

### US-2.1 — Mehrere Vorhersagen nebeneinander anzeigen
**Als** Markus **möchte ich** mehrere unabhängige Vorhersagen für meinen Ort vergleichen, **damit** ich Übereinstimmung/Abweichung erkenne.
- **Given** ich öffne "Vorhersagen vergleichen"
- **When** die Ansicht lädt
- **Then** sehe ich mehrere Vorhersagen gestapelt/überlagert für denselben Ort und Zeitraum
- **And** jede Vorhersage ist klar beschriftet (Bezeichnung und Aktualisierungszeitpunkt)
- **And** ich kann einzelne Vorhersagen ein-/ausblenden

### US-2.2 — Übereinstimmungs-Heuristik in Klartext
**Als** Markus **möchte ich** eine schnelle Aussage zur Einigkeit, **damit** ich nicht alle Linien selbst interpretieren muss.
- **Given** mehrere Vorhersagen sind geladen
- **When** die Vergleichsansicht angezeigt wird
- **Then** erscheint eine Klartext-Zusammenfassung: z. B. "4 von 5 Vorhersagen erwarten Regen am Samstag" oder "Vorhersagen uneinig — Wetterlage offen"
- **And** abweichende Ausreißer werden visuell hervorgehoben

### US-2.3 — Konsens-/Mittelwertlinie
**Als** Markus **möchte ich** eine kombinierte Konsenslinie sehen, **damit** ich einen aggregierten Best Guess habe.
- **Given** mehrere Vorhersagen sind geladen
- **When** ich "Konsens anzeigen" aktiviere
- **Then** wird eine mittlere Verlaufslinie über alle Vorhersagen gelegt
- **And** die Spannweite zwischen den Vorhersagen wird als Band dargestellt

### US-2.4 — Auswahl merken
**Als** Markus **möchte ich**, dass meine bevorzugte Auswahl gespeichert wird, **damit** ich sie nicht jedes Mal neu treffen muss.
- **Given** ich habe Vorhersagen ein-/ausgeblendet
- **When** ich die App erneut öffne
- **Then** ist meine letzte Auswahl wiederhergestellt

---

## EPIC 3 — Vorhersage-Stabilität / Verlauf (Differenzierungsmerkmal)

**Bedarf:** "Wie stark hat sich die Vorhersage seit gestern geändert?"

### US-3.1 — Delta-Badge pro Tag ("seit gestern")
**Als** Lena **möchte ich** sehen, ob sich die Prognose für einen Tag geändert hat, **damit** ich Stabilität einschätze.
- **Given** eine Tagesvorhersage mit Daten aus mindestens zwei aufeinanderfolgenden Aktualisierungen
- **When** ich die Tagesansicht öffne
- **Then** erscheint ein Delta-Badge: z. B. "Sa: 25 °C ▲ +5° seit gestern"
- **And** kleine Änderungen (< definierter Schwelle) werden als "stabil" markiert
- **And** das Badge ist optional ausblendbar

### US-3.2 — Stabilitäts-Label
**Als** Lena **möchte ich** ein einfaches Stabilitäts-Label, **damit** ich ohne Diagramm verstehe, ob die Prognose schwankt.
- **Given** Verlaufsdaten über mehrere Aktualisierungen liegen vor
- **When** die Tagesansicht gerendert wird
- **Then** wird "Stabil" oder "Wechselhaft" angezeigt, basierend auf einem Stabilitätsscore
- **And** der Schwellwert ist konfigurierbar/getunt
- **And** ein durchgehender Trend wird nicht fälschlich als "wechselhaft" gewertet

### US-3.3 — Verlaufs-Overlay (Ghost-Lines) für Profis
**Als** Dr. Berg **möchte ich** frühere Vorhersagestände als Geisterlinien hinter dem aktuellen Stand sehen, **damit** ich Änderungen über die Zeit erkenne.
- **Given** der Experten-Modus oder die Stabilitätsansicht ist aktiv
- **When** ich den Verlauf öffne
- **Then** werden die letzten 2–4 Stände als abgeschwächte Linien hinter dem aktuellen Stand überlagert
- **And** jeder Stand ist mit Zeitstempel beschriftet
- **And** ich kann zwischen den Ständen vor-/zurückschalten

### US-3.4 — Stabilitäts-Sparkline
**Als** Markus **möchte ich** einen Mini-Trend der Prognoseänderung, **damit** ich Schwankungen schnell erfasse.
- **Given** Verlaufsdaten über mehrere Aktualisierungen
- **When** ich die Tagesansicht ansehe
- **Then** zeigt eine kompakte Sparkline, wie sich der prognostizierte Wert über die letzten Aktualisierungen entwickelt hat

---

## EPIC 4 — Streuung & Verteilung (Profi-Tiefe via Progressive Disclosure)

**Bedarf:** Echte Verteilung statt Einzelwert für Enthusiasten/Profis.

### US-4.1 — Bandbreiten-/Perzentil-Ansicht
**Als** Markus **möchte ich** die Verteilung der möglichen Werte sehen, **damit** ich die Bandbreite statt nur Einzellinien verstehe.
- **Given** Verteilungsdaten liegen vor
- **When** ich die Detailansicht öffne
- **Then** werden Bandbreiten (z. B. mittlere 50 % und mittlere 80 % der Szenarien) plus mittlere Verlaufslinie dargestellt
- **And** ich kann zwischen "Bandbreiten" und "alle Szenarien" umschalten

### US-4.2 — Einzelszenarien-Ansicht mit Erklärung
**Als** Dr. Berg **möchte ich** alle einzelnen Szenarien als Linien oder Dichtedarstellung sehen, **damit** ich Cluster und Ausreißer erkenne.
- **Given** Verteilungsdaten liegen vor
- **When** ich "Alle Szenarien" wähle
- **Then** werden alle Szenarien als Linien oder als Dichte-/Heatmap-Darstellung gezeigt
- **And** eine kurze Erklärung ist verfügbar ("enges Bündel = hohe Sicherheit, breite Streuung = unsicher")
- **And** diese Ansicht ist **nicht** Default (Progressive Disclosure)

### US-4.3 — Räumliche Niederschlagsunsicherheit
**Als** Markus **möchte ich** sehen, wie sicher Regen genau an meinem Ort ist, **damit** ich lokale Unsicherheit einschätze.
- **Given** ortsbezogene Verteilungsdaten liegen vor
- **When** ich die Niederschlagsdetails öffne
- **Then** wird ein kompaktes Raster der Umgebung gezeigt, das anzeigt, in wie vielen Szenarien Regen fällt

---

## EPIC 5 — Progressive Disclosure & Experten-Modus (verbindet beide Zielgruppen)

**Bedarf:** Eine App für Laien **und** Profis ohne Überforderung bzw. Unterforderung.

### US-5.1 — Einfacher Default mit Detail-Affordanz
**Als** Lena **möchte ich** standardmäßig nur das Wesentliche sehen, **damit** ich nicht überfordert werde.
- **Given** ich öffne eine Vorhersage
- **When** die Ansicht lädt
- **Then** sehe ich nur Headline-Wert + Confidence-Chip + Unsicherheitsband
- **And** ein dezenter Button "Vergleichen / Details" führt zu den Profi-Ansichten
- **And** komplexe Diagramme sind standardmäßig eingeklappt

### US-5.2 — Experten-Modus (Progressive Disclosure deaktivierbar)
**Als** Dr. Berg **möchte ich** einen Experten-Modus, **damit** ich direkt alle Detailansichten ohne Aufklappen sehe.
- **Given** ich aktiviere "Experten-Modus" in den Einstellungen
- **When** ich Vorhersagen öffne
- **Then** sind Vergleich, Verteilungs- und Stabilitätsansichten direkt sichtbar
- **And** die Einstellung wird persistiert

### US-5.3 — Feature-Discovery für neue Stabilitätsfunktion
**Als** bestehender Nutzer **möchte ich** auf die neue Stabilitätsanzeige hingewiesen werden, **damit** ich sie entdecke.
- **Given** das Feature ist neu ausgerollt
- **When** ich die App das erste Mal nach dem Update öffne
- **Then** erscheint ein einmaliger, schließbarer Hinweis auf die neue Funktion

---

## EPIC 6 — Datengrundlage & Korrektheit (Querschnitt)

**Bedarf:** Verlässliche Grundlage für alle obigen Anzeigen.

### US-6.1 — Mehrere Vorhersagequellen einbinden
**Als** System **möchte ich** mehrere unabhängige Vorhersagen beziehen, **damit** Vergleich und Streuung berechnet werden können.
- **Given** mehrere verfügbare Vorhersagequellen
- **When** eine neue Aktualisierung verfügbar ist
- **Then** werden die Daten abgerufen, normalisiert und mit Zeitstempel gespeichert
- **And** fehlende/verspätete Aktualisierungen werden sauber behandelt (Fallback, Kennzeichnung)

### US-6.2 — Confidence-Score-Berechnung
**Als** System **möchte ich** einen Confidence-Score aus Übereinstimmung und Streuung ableiten, **damit** die Vertrauensanzeige datenbasiert ist.
- **Given** Vergleichs- und Verteilungsdaten
- **When** der Score berechnet wird
- **Then** fließen Streuung und Übereinstimmung der Vorhersagen ein
- **And** der Score wird auf die Labels Hoch/Mittel/Niedrig gemappt

### US-6.3 — Verlaufshistorie speichern
**Als** System **möchte ich** vergangene Vorhersagestände vorhalten, **damit** Delta- und Stabilitätsanzeigen möglich sind.
- **Given** eingehende Aktualisierungen
- **When** ein neuer Stand gespeichert wird
- **Then** bleiben die letzten N Stände je Ort/Variable abrufbar
- **And** der Stabilitätsscore wird berechnet und zwischengespeichert

---

## EPIC 7 — Treffsicherheit / Rückblick (Verifikation gegen das tatsächliche Wetter)

**Bedarf:** "Wie nah lagen die Vorhersagen in den letzten Tagen an dem, was wirklich eingetreten ist?"

> **Wichtige Abgrenzung:** Dieses Epic vergleicht **vergangene Vorhersagen gegen das tatsächlich gemessene Wetter** (Trefferquote) — nicht Vorhersagen untereinander wie EPIC 3 (Stabilität). Eine Vorhersage kann stabil und trotzdem falsch sein; erst der Abgleich mit den Ist-Werten zeigt, wie zuverlässig eine Quelle wirklich war. Setzt eine gespeicherte Beobachtungs-/Ist-Referenz für denselben Ort und Zeitpunkt voraus und ist daher datenintensiver als reiner Verlauf.

### US-7.1 — Trefferquote pro Vorhersagequelle (Rückblick)
**Als** Markus **möchte ich** sehen, wie nah eine Vorhersagequelle in den letzten Tagen am tatsächlichen Wetter lag, **damit** ich einschätzen kann, wie verlässlich sie für meinen Ort ist.
- **Given** gespeicherte vergangene Vorhersagen und die zugehörigen Ist-Werte für meinen Ort
- **When** ich den Rückblick öffne
- **Then** wird je Quelle eine durchschnittliche Abweichung über einen Zeitraum (z. B. 7/14 Tage) angezeigt (z. B. "im Schnitt ±1,2 °C daneben")
- **And** die Abweichung ist je Variable abrufbar (Temperatur, Niederschlag, Wind)
- **And** der Betrachtungszeitraum ist umschaltbar (7/14/30 Tage)

### US-7.2 — Einfaches Trefferquoten-Label (Laien)
**Als** Lena **möchte ich** ohne Zahlen erkennen, ob die Vorhersage zuletzt meist gestimmt hat, **damit** ich Vertrauen aufbauen kann.
- **Given** eine berechnete Trefferquote für meinen Ort
- **When** ich die Tagesansicht öffne
- **Then** wird ein einfaches Label angezeigt (z. B. "Zuletzt meist zutreffend" / "Zuletzt häufig daneben")
- **And** das Label ist farb- und icon-codiert (nie Farbe allein)
- **And** Details mit Zahlen sind nur auf Abruf sichtbar (Progressive Disclosure)

### US-7.3 — Vergleich der Quellen nach Treffsicherheit
**Als** Markus **möchte ich** sehen, welche Vorhersagequelle für meinen Ort zuletzt am verlässlichsten war, **damit** ich der besten mehr Gewicht geben kann.
- **Given** Trefferquoten mehrerer Quellen für denselben Ort und Zeitraum
- **When** ich die Vergleichsansicht öffne
- **Then** werden die Quellen nach Treffsicherheit gereiht dargestellt
- **And** Unterschiede sind auf einen Blick erkennbar
- **And** es wird kenntlich gemacht, wenn die Datenbasis für eine faire Reihung noch zu klein ist

### US-7.4 — Rückblick: Vorhersage vs. tatsächlich eingetreten
**Als** Dr. Berg **möchte ich** für vergangene Tage die damalige Vorhersage neben dem tatsächlich eingetretenen Wetter sehen, **damit** ich Fehlerquellen nachvollziehen kann.
- **Given** gespeicherte Vorhersagen und Ist-Werte
- **When** ich einen vergangenen Tag auswähle
- **Then** werden die damalige(n) Vorhersage(n) und der gemessene Verlauf gemeinsam dargestellt
- **And** die Abweichung wird sichtbar hervorgehoben
- **And** ich kann nach Vorlaufzeit filtern (z. B. "Vorhersage 1 Tag vorher" vs. "3 Tage vorher")

### US-7.5 — Treffsicherheit fließt in die Vertrauensanzeige ein
**Als** Lena **möchte ich**, dass eine zuletzt verlässliche Quelle auch ein höheres angezeigtes Vertrauen erhält, **damit** die Confidence-Anzeige realistisch ist.
- **Given** eine berechnete historische Trefferquote je Quelle
- **When** der Confidence-Score (EPIC 1 / US-6.2) gebildet wird
- **Then** fließt die jüngste Trefferquote als ein Faktor mit ein
- **And** der Einfluss ist nachvollziehbar dokumentiert (nicht für Endnutzer, aber im System definiert)

---

## Ergänzung zu EPIC 6 — Datengrundlage

### US-6.4 — Ist-Werte (Beobachtungen) speichern und zuordnen
**Als** System **möchte ich** tatsächlich eingetretene Wetterwerte vorhalten und vergangenen Vorhersagen zuordnen, **damit** Trefferquoten berechnet werden können.
- **Given** eine verfügbare Beobachtungs-/Ist-Referenz für relevante Orte
- **When** Ist-Werte eintreffen
- **Then** werden sie je Ort/Zeitpunkt/Variable gespeichert und der jeweils zuvor gültigen Vorhersage zugeordnet
- **And** die durchschnittliche Abweichung je Quelle/Variable/Vorlaufzeit wird berechnet und zwischengespeichert
- **And** fehlende oder unsichere Ist-Werte werden gekennzeichnet und nicht in die Wertung gezogen

---

## Priorisierung (Vorschlag)

1. **MVP / Stufe 1 (Laien-Default):** EPIC 1 + US-6.1/6.2 + US-5.1
2. **Stufe 2 (Differenzierung):** EPIC 3 + US-6.3
3. **Stufe 3 (Profi-Tiefe):** EPIC 2 + EPIC 4 + US-5.2/5.3
4. **Stufe 4 (Verifikation):** EPIC 7 + US-6.4 — bewusst nachgelagert, da datenintensiv (benötigt Ist-Referenz)

## Offene Validierungspunkte
- Schwellwerte für "stabil/wechselhaft" empirisch tunen.
- Eine einzige, konsistente Bedeutung der Niederschlagswahrscheinlichkeit festlegen und durchgängig erklären.
- Stabilitätsansicht in Usability-Tests prüfen — falls Laien sie ignorieren/missverstehen, auf einen einzelnen Chip reduzieren und Overlays nur im Experten-Modus zeigen.
- Stabilität (EPIC 3) und Treffsicherheit (EPIC 7) klar voneinander trennen — auch in der UI-Sprache, damit Nutzer "stabil" nicht mit "richtig" verwechseln.
- Mindest-Datenbasis festlegen, ab der eine Trefferquoten-Reihung als belastbar angezeigt wird (sonst irreführende Rangfolgen bei wenigen Tagen).
- Definieren, wie Niederschlags-Treffer bewertet werden (Ja/Nein-Treffer vs. Mengenabweichung), da hier keine einfache ±-Differenz wie bei Temperatur greift.
