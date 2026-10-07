# Autobahnwetter — Prüfung der angezeigten Daten auf Echtheit (06.10.2026)

> Auftrag Jan (06.10.2026): jede angezeigte Information bis zur Quelle verfolgen — echt, plausibel, aktuell, richtig
> dargestellt (Einheit, Zeitbezug, Ort). Keine neuen Funktionen; **nichts geändert**, nur gemessen und gelesen.
> Stand des Codes: `main` = `origin/main` `233695d`. Produktion: buscosun.com, geprüft 19:13–19:25 UTC.
> Belege: `audit/autobahnwetter/datenpruefung/` (Skripte, Aufnahmen). Messslot: `road/v1/obs/2610061900.json`
> (1 554 Punkte), Prognoseläufe `road/fc/v1/2610061831` (mit Anker) und `2610061900` (ohne Anker), je alle 157 Dateien.

## 0. Kurzfassung

**Echt ist:** Jeder Messwert der Seite kommt aus den DWD-Bulletins (SWIS). Unabhängig mit eccodes 2.47 dekodiert:
**15 502 von 15 502** veröffentlichten Einzelwerten des Slots 19:00 UTC sind bitgleich zur Quelle (Fahrbahn, Luft,
Taupunkt, Feuchte, Sicht, Wind, Böe, Richtung, Niederschlagsrate/-art, Position, Messzeit). Keine Platzhalter im Code,
keine Demo-Werte, kein Ersatzwert bei Ausfall (die Seite sagt dann „keine Messdaten“). Zeiten sind UTC im Datenbestand
und Europe/Berlin in der Anzeige, richtig umgerechnet. Die Prognose ist echte Ausgabe von buscosun Fusion 9 (MAE gegen
die gemessene Luft um 19 UTC 0,9 K mit / 1,5 K ohne Anker, n = 1 220). Korridor-km und Stationszuordnung sind
geometrisch konsistent (984 Stationen, 0 Abweichungen > 2 km).

**Nicht in Ordnung — die Seite zeigt Fehlwerte als gültige Messung:**

| # | Befund | Schwere |
|---|---|---|
| D-1 | **Alle 58 „Frostgefahr“-Zustände der letzten 24 h stammen von defekten Sensoren oder Gerätefüllwerten** (0,00 / −1,00 / −25,00 °C) — z. B. Richrath1 P (A 59): „Fahrbahn −25,0 °C · Frostgefahr · Überfrieren möglich“ bei +15 °C Luft, 3,75 h lang, ganzes 15-km-Band orange | kritisch |
| D-2 | Physikalisch unmögliche Werte erscheinen als gültige Messung mit „Plausibilität buscosun: bestanden“: Fahrbahn +60,1 °C nachts (Edemissen), Luft +41,7 °C (Irxleben), Luft −8,5 °C (Heringen), Böen 207 km/h bei 1 km/h Wind, Taupunkt −39,8 °C / Feuchte 0 % | hoch |
| D-3 | **„Niederschlag · 21,6 mm/h“ an 76 Anlagen in RP/Saarland bei trockener Fahrbahn** — ein Füllwert der Quelle; dieselbe Meldung sagt „kein Niederschlag“ (0 20 024 = 0, Art = keine), die Seite liest das nicht | hoch |
| D-4 | Der Messungs-Anker der Prognose übernimmt defekte Sensoren: Irxleben (A 2) bekam im Lauf 18:31 UTC **+36,9 °C** für 19 UTC (ohne Anker 14,6 °C) | hoch |
| D-5 | Kartenmarker, Callout und Warnungs-Zuordnung stehen auf der **Position aus der Meldung**, nicht (wie §17.1 sagt) auf der Kataloglage; 13 Anlagen > 10 km daneben, „Kahl, A 45“ 131 km entfernt bei Feuchtwangen | mittel |
| D-6 | „Luft 2 m“ bei den Messwerten — die Luftfühler der Anlagen hängen in **4–5 m** (1 075 von 1 099 mit Angabe), 12 in 1 m, keiner in 2 m | mittel |
| D-7 | „Prüfung des DWD: nicht durchgeführt“ steht auch an 288 Anlagen, bei denen der DWD geprüft und etwas beanstandet hat (204) oder das Flag fehlt (84) | mittel |
| D-8 | Prognose: Sägezahn an Einzelpunkten — alle 3 h ein Einbruch um 4–8 K (A 8 Chiemsee, nachts), sichtbar in Kacheln +3/+6 h und Verlauf | mittel |
| D-9 | Kleinere Darstellungsfragen (Höhe 0 m, „DE“ fest im Briefing, Ladezustand als „Keine Daten“, AT/CH-Zeilen fest, Ankunftszeit-Annahme mobil, Buchstabe „X“ = „beide Richtungen“ unbelegt) | niedrig |

## 1. Vorgehen

1. Code der Seite vollständig gelesen (`src/road/*`, `RoadRoute.tsx`) und jede Anzeige einer Quelle zugeordnet (§2).
2. Live-Daten aus `buscosun-data` (raw.githubusercontent) und die 23 DWD-Bulletins desselben Slots von
   `opendata.dwd.de` geladen; Bulletins **unabhängig** mit eccodes dekodiert (`ec_dump.py`, `ec_norm.py`), Feld für
   Feld gegen die veröffentlichte Datei verglichen (`cmp.cjs`).
3. Verteilungen und Ausreißer, 24-h-Ringe aller 23 Reihen, Quarantäne des Slots, Katalog, Korridore, zwei
   Prognoseläufe vollständig ausgewertet; WMO-Tabellen 0 33 005, 0 20 021, 0 20 024 aus `wmo-im/BUFR4`.
4. Produktion im Browser (Playwright, 1440×900): A 59 mit Richrath1 P, A 8 Reiter „Strecke“, Vettelhoven (A 61).

## 2. Herkunft je Anzeige

| Anzeige | Quelle | Verarbeitung | Urteil |
|---|---|---|---|
| Fahrbahn °C, Zustand, Wasserfilm, Klasse | SWIS-Bulletin (DWD) | kältester Sensor, größter Film, schwerster Code; Klasse `classifySensor` | echt, aber D-1/D-2 |
| Luft, Taupunkt, Feuchte, Sicht, Wind/Böe | SWIS-Bulletin | Grenzen, DWD-Flags, Hänger-Regel | echt, aber D-2, Label D-6 |
| Niederschlag (Art, mm/h) | SWIS 0 20 021 / 0 13 055 | Bits → Wörter (Tabelle stimmt mit WMO) | D-3 |
| „gemessen HH:MM · vor x min“ | Messzeit der Meldung (UTC) | `hm` Europe/Berlin | richtig (alle 1 554 = Slotzeit) |
| Position Marker / Callout | Meldung (`p.lat/lon`) | gerundet 5 Stellen | D-5 |
| Name, Straße, km, Höhe | Meldung, Katalog 2020 als Rückfall | `normaliseRoad` | richtig; Höhe D-9 |
| Fahrtrichtung | Katalog-Suffix (`A59N`) | Buchstabe → Text | N/S/O/W plausibel, „X“ unbelegt |
| „x von 23 DWD-Reihen“, Lücken | `groups` des Slots | ohne SD-BW | richtig |
| 24-h-Verlauf, Zustandsleiste | `h24/<Reihe>/<Slot>` | Werte 0,1 °C, Klasse je Slot | echt, enthält D-1/D-2 |
| Prognose Luft/Taupunkt/Nd./Wind | `road/fc/v1` (Fusion 9) | nächste volle Stunde | echt; D-4, D-8 |
| „Lauf HH:MM“, Name „buscosun Fusion 9“ | `index.json`, `engine` der Laufdatei | | richtig |
| Ankunftszeiten, „Abfahrt“ | **Annahme**: Start am Korridoranfang zur nächsten Viertelstunde, Ø 100 km/h | | Desktop benannt („Ø 100 km/h“), mobil nicht (D-9) |
| Korridore, Städte, Grenzen | BKG DLM250, GeoNames, OSM | | geometrisch konsistent |
| Amtliche Warnungen | DWD CAP (`fetchDwdWarnings`) | wörtlich, nach Uhr gefiltert | Quelle echt; Ortszuordnung erbt D-5 |
| Radar-Ebene | RADOLAN-RV über Radar-Spiegel (Modul der Wetterkarte) | | nicht eigens nachgeprüft (gleicher Pfad wie Wetterkarte) |
| AT/CH-Zeilen im Dock, „Datenlage je Land“ | **fest im Code** (`STATIC_ROWS`) | | keine Daten, ehrlich beschriftet (D-9) |

## 3. Befunde im Einzelnen

### D-1 Falsche „Frostgefahr“ durch Gerätefüllwerte (kritisch)

24-h-Ringe aller 23 Reihen (Stand 19:00 UTC): 58 Slot-Zustände „f“, 0 „i“. Jeder einzelne ist ein Gerätefehler:

| Station | Werte in den Frost-Slots | Muster |
|---|---|---|
| H637 Richrath1 P (A 59) | Fahrbahn −25,00 bei Luft 15–24 °C, 15 Slots | bekannter Defektwert (AW-0) |
| P969 Rossmoos | Fahrbahn = Luft = Taupunkt = −1,00, 07:45–11:15 UTC, 8 Slots | Füllwert |
| P134 Schweinfurt Hafen, J909 Grumbacher Berg | Fahrbahn = Luft = Taupunkt = 0,00 | Füllwert |
| K677, O932, P285, P309, F136, V528 | Fahrbahn 0,00 / 0,2 bei Luft 10–21 °C | Füllwert / Defekt |

Ursache im Code: die Klasse `frost` (Fahrbahn ≤ +1 °C und Fahrbahn ≤ Taupunkt) greift auf jeden Wert, der die harten
Regeln besteht. Die Regeln, die diese Fälle fangen würden (`roadAir`, `neighbours`, `cube`), laufen im Beobachtungsmodus
bis Gate B — die Quarantäne von 19:00 UTC nennt H637 und V528 als „würde verwerfen“, die Seite zeigt sie trotzdem.
**Die Hänger-Regel nimmt Fahrbahnwerte zwischen −10 und 0 °C bei Luft innerhalb ±10 K von 0 °C ausdrücklich aus**
(`ROAD_STUCK_PLATEAU`): ein Füllwert 0,00 bleibt im Winter also unbegrenzt als „Frostgefahr“ stehen — genau dann, wenn
die Anzeige zählt. Im Browser (Beleg `datenpruefung/richrath-frost-falsch.png`): Badge „Frostgefahr“, Zustand
„trocken“, Hinweis „Überfrieren möglich“, ganzes Streckenband A 59 orange, Anlage wird als Voreinstellung gewählt
(E-AW-13: kritischste Klasse zuerst).

### D-2 Unmögliche Werte als gültige Messung (hoch)

Slot 19:00 UTC (21:00 MESZ), alle bitgleich zur Quelle, alle angezeigt:

| Station | Wert | Gegenprobe |
|---|---|---|
| E774 Edemissen (B 444) | Fahrbahn +60,1 °C, „Trocken“ | ganzer Ring 55–70 °C, Tag und Nacht |
| E237 Nordkreuz (A 293) | Fahrbahn +44,8 °C | Ring 40–50 °C, Nachbarn-Median 17,9 |
| N443 Irxleben (A 2) | Luft +41,7 °C, Taupunkt 31,7 | Ring konstant 41,1–41,6 °C |
| M080 Heringen (A 38) | Luft −8,5 °C (nachts −23,7) | Fahrbahn 17,3 °C, Modell 18,1 |
| V049 AK Regensburg (A 93) | Taupunkt −39,8 °C, Feuchte 0 % | |
| P415 Rügland, P595 Ludmannsdorf | Böe 57,6 / 56,5 m/s (≈ 207 km/h) bei Wind 0,4/0,9 m/s | |
| sechs weitere | Feuchte 0–11 %, Taupunkt −16…−28 °C | |

Die Seite schreibt darunter „Plausibilität buscosun: bestanden“ (`RoadReadout.tsx` Quellenzeile, fest).

### D-3 Niederschlagsrate aus einem Füllwert (hoch)

eccodes bestätigt: KO-RP (60 Anlagen) und RP-RP (16) melden `intensityOfPrecipitation = 0,006 kg m⁻² s⁻¹`
(= 21,6 mm/h) zusammen mit `intensityOfPhenomena = 0` („No phenomena“, WMO 0 20 024) und Art 0 (keine Bits). Die Seite
liest 0 20 024 nicht (`swisRecord` speichert es, `RoadRawStation` übernimmt es nicht) und zeigt
„Niederschlag · 21,6 mm/h“ neben „Zustand trocken“ (Browser, Vettelhoven A 61). Unklar, nicht belegt: MC-MV 20,16 mm/h
an zwei Anlagen (Code 3 „heavy“, Art fehlt), FN-BY 10,08 mm/h (Code 1, Art 0, Fahrbahn trocken).

### D-4 Anker trägt Sensorfehler in die Prognose (hoch)

Seit E-AW-30 nimmt jeder Stationspunkt seine eigene SWIS-Luft der vollen Stunde als Anker (`anchorObsFor`), ohne
weitere Prüfung als die harten Regeln. Lauf `2610061831`: 1 218 Punkte verankert, Versatz p1/p99 −3,4/+6,0 K,
sechs Punkte am Anschlag ±8 K. Irxleben (N443, Luftfühler defekt, D-2): Prognose 19 UTC **+36,9 °C**, 20 UTC 29,8 °C
(Lauf ohne Anker: 14,6 / 14,0 °C). Die Notiz des Motors nennt +8,0 K Versatz, die Ausgabe weicht um +22 K ab — die
Wirkung des Ankers ist größer als der gemeldete Versatz (Ursache in buscosun Fusion, nicht untersucht = Jans Gate).
Zusätzlich: der SWIS-Fühler hängt in 4–5 m, der Anker behandelt ihn als 2-m-Wert (D-6).

### D-5 Marker auf der Meldeposition (mittel)

`validateRoadSlot` übernimmt `lat/lon` der Meldung; `RoadMap` zeichnet `p.lon/p.lat`. §17.1 im Phasendokument sagt
„Marker und Prognosepunkt liegen auf der Kataloglage“ — das gilt nur für den Prognosepunkt. Abstand Meldung ↔ Katalog
heute: > 0,5 km 303, > 2 km 95, > 10 km 13 (P101 Kahl 131 km, P301 Ensbrücke 69 km, P142 Wildbach 55 km, K441 47 km,
P670 43 km …). Folgen: Marker an der falschen Straße, Messung und Prognose derselben Station an verschiedenen Orten,
Warnungen nach der falschen Position zugeordnet. Welche Lage stimmt, entscheidet je Station Jan (Liste
`audit/autobahnwetter/stationslage.md`).

### D-6 „Luft 2 m“ (mittel)

Höhe des Luftfühlers über Grund (0 07 032 vor 0 12 101), eccodes, 1 557 Meldungen: 4 m 618 · 4,05 m 381 · 5 m 76 ·
1 m 12 · 3,3–3,6 m 2 · 0,4–0,6 m 2 · fehlt 458 · sieben offensichtlich Stationshöhen (251–646 m). Kein Fühler in 2 m.
Die Messwerte-Kachel und der Verlauf beschriften „Luft 2 m“; richtig wäre „Luft“ (Höhe der Anlage). Bei der Prognose
ist „2 m“ richtig.

### D-7 Aussage zur DWD-Prüfung (mittel)

Flag 0 33 005 (WMO: Bit 1 = „No automated meteorological data checks performed“), 1 557 Meldungen: 0 → 325 · nur Bit 1
→ 944 · andere Bits ohne Bit 1 (DWD prüfte und beanstandete z. B. Bodentemperatur, Wassergehalt) → 204 · fehlt → 84.
Die Seite zeigt für alles außer 0 „Prüfung des DWD: nicht durchgeführt (DWD-Flag)“ — für 288 Anlagen falsch bzw.
unbelegt. Die Zuordnung der Bits zu Feldern (`DWD_SUSPECT_BITS`) stimmt mit der WMO-Tabelle.

### D-8 Sägezahn in der Prognose (mittel)

Lauf 18:31, Krümmung t(i) − (t(i−1)+t(i+1))/2 je Schritt: um 06 und 18 UTC je ≈ 55 Punkte mit einem Einbruch > 2 K,
an Einzelpunkten 4–8 K (A 8 km 65: … 7,9 · 2,1 · 10,4 …; P890: 13,0 · 4,6 · 11,8). Herkunft-Code 0 (t1, nicht
interpoliert) an allen Schritten. Entspricht V-FI-104 (Sägezahn im Producer-Mix), hier größer als dort gemessen
(0,76 K). Gilt für Kacheln +3/+6 h, Verlauf und Band; Motor/Producer = Jans Gate.

### D-9 Kleinere Punkte (niedrig)

- Höhe aus der Meldung: 6 Anlagen „0 m ü. NN“ (P970 Katalog 710 m, P780 645 m), 51 mit > 50 m Abweichung.
- Strecken-Briefing: „· DE“ fest im Text (`RoadReadout.tsx`, StreckeTab), auch für Korridore bis zur Grenze.
- Während des Ladens zeigt die Kopfzeile „Keine Daten · derzeit keine Messdaten“ und das Dock „Keine Autobahn passt zu
  „““ (wenige Sekunden, Browser A 8) — Ladezustand sieht aus wie Ausfall.
- AT/CH-Zeilen im Dock sind feste Einträge ohne Daten („Prognosepunkte folgen“) — ehrlich beschriftet, aber Platzhalter.
- Mobil: „an HH:MM“ je Station ohne Hinweis auf die Annahme (Start am Korridoranfang, 100 km/h); Desktop nennt „Ø 100 km/h“.
- Legende des Bands: Feld „Messung DWD“ in der Farbe von „Nass“ (#5E97D1).
- Suffix „X“ → „beide Richtungen“: Bedeutung im DWD-Katalog nicht belegt.
- `?st=K030` ohne Korridor im Pfad öffnet A 8 (Karte/Band) mit Vettelhoven (A 61) im Readout.
- Lauf zur vollen Minute 00 (z. B. 19:00:05) läuft ohne Anker, der Lauf um :31 mit — Prognose an Stationen springt
  zwischen Läufen (benannt in der Quellenzeile).

## 4. Was nicht beanstandet wird

Decoder (bitgleich, s. o.); Zeitbezug (Messzeit = Slotzeit, Anzeige MESZ); Frische-Regeln (Slot 19:00 nach 3 min
veröffentlicht, Client fragt ab +10 min); Korridor-Geometrie; Klassenlogik im Client gegen Producer nachgerechnet;
Einheiten Wind (m/s → km/h ×3,6), Wasserfilm (mm), Sicht (m/km); Prognose-Kodierung (Skalen, Gültigkeit volle Stunde);
Name des Stands aus der Laufdatei; Warnungen wörtlich.

## 5. Maßnahmenplan, am Archiv nachgerechnet (06.10.2026, Jans Frage „konkrete, reale Verbesserungen?“)

Datenbasis: Archiv `buscosun-archiv/road/v1`, 03.10. 00 UTC – 06.10. 12 UTC, 7 Halbtage, 336 Slots, 435 636
Stations-Slots (Werte nach den harten Regeln, 0,1 °C) + Slot 19:00 UTC mit eccodes. Skripte
`datenpruefung/archiv-regeln.cjs`, `archiv-regeln-2.cjs`. Frost/Glätte im Fenster: 144 × „f“, 1 × „i“.

**M1 Fahrbahn-Füllwerte und Fahrbahn weit unter der Luft (D-1) — hart, vor Gate B**

| Regel | Treffer im Archiv | Frost/Glätte entfernt | Stationen | Bewertung |
|---|---|---|---|---|
| R-a `rs < ta − 12 K` (AW-0: p1 = −5,4 K) | 392 | 53 | 12, davon N443 (Luft defekt, Fahrbahn gut) | sicher; bei N443 muss die LUFT fallen, nicht die Fahrbahn ⇒ Entscheidung über den Nachbar-Median der Fahrbahn |
| R-b `rs` genau 0,00 oder −1,00 und Luft ≥ 5 K wärmer | 113 | 111 | 10 | sicher (echte 0,0 °C bei Luft nahe 0 bleiben: 27 Fälle unberührt) |
| R-c `rs = ta = td` genau und Wert ∈ {0,00; −1,00} | 21 | 21 | 4 (P969, P134, J909, O453) | sicher |
| ~~R-x `rs = ta = td` beliebig~~ | 183 | — | 60, meist Nebel-Sättigung (9,4/9,4/9,4) | **verworfen**: trifft echte Werte |

R-a ∪ R-b ∪ R-c: **144 von 145** Frost/Glätte-Zuständen entfernt; übrig E751 Lahe (Fahrbahn −1,3 bei Luft 9,3, 10,6 K —
unentschieden, bleibt). Darunter die einzige „Glätte gemessen“ (F461: Eis-Code bei Fahrbahn 0,00, Luft 12,3).
Zusätzlich die Plateau-Ausnahme der Hänger-Regel nur gelten lassen, wenn der Wert sich in der Folge bewegt (sonst
bleibt ein 0,00 im Winter dauerhaft). Kosten: ≈ 1,5 verworfene Werte je Slot (Slot-Sperre bei 10 % unberührt).

**M2 Weitere unmögliche Werte (D-2)**

| Regel | Treffer | Stationen | Bewertung |
|---|---|---|---|
| `ta − td > 25 K` ⇒ td, rh verworfen (p99 = 15,2 K) | 1 753 | 12, fünf dauerhaft defekt (J701, J735, P512, H488, V049) | Oktober sicher; im Hochsommer (35 °C/5 °C) möglich ⇒ Schwelle 25 K Okt–Apr, 30 K Mai–Sep |
| `rs > ta + 30 K` | 891 | 13, drei dauerhaft (E774, E237, M080) | nur zusammen mit der Nachbarregel hart (Sommer-Mittag nicht gemessen) |
| Böe > 40 m/s bei Mittelwind < 10 m/s | 2 im Slot | P415, P595 | hart |
| Beobachtungsregel gerissen (`roadAir`, `neighbours`, `cube`, `jump`) | 5 413 Einträge, 177 Stationen in 3,5 Tagen | — | nicht verwerfen, aber am Punkt kennzeichnen: „Wert auffällig“ statt „Plausibilität bestanden“ |

**M3 Niederschlags-Füllwert (D-3):** Rate nur zeigen, wenn 0 20 024 > 0 oder eine Art gesetzt ist. Slot 19:00: 84
Raten > 0, davon 76 Füllwerte (Intensität 0, Art 0) — verschwinden; 8 bleiben (P731, P819, P837, P961, E368, A041,
B773, B338). Braucht `precipIntensity` im Punkt (`swisRecord` liest es schon).

**M4 Anker der Prognose (D-4):** im Producer (`road-forecast.mjs`, `swisTable`) nur Stationen, deren Luft nach M1/M2
gültig ist und die im Anker-Slot keine Beobachtungsregel reißen. Slot 19:00: etwa 20 von ≈ 1 220 fallen heraus, darunter N443.
Die `cube`-Regel nicht allein nehmen — ihre Referenz ist der verankerte Lauf (zirkulär). Messung mit dem vorhandenen
`road-fc-anchor-backtest.mjs` vor dem Einschalten. Ändert `road/fc` ⇒ Jans Gate.

**M5 Texte (D-6, D-7, D-9):** „Luft“ statt „Luft 2 m“ bei Messwerten (Prognose bleibt „2 m“); DWD-Prüftext aus den Bits
(nur Bit 1 ⇒ „nicht durchgeführt“, andere Bits ⇒ „geprüft, beanstandet: <Felder>“, kein Flag ⇒ „unbekannt“); Höhe 0 m
⇒ Katalog oder „—“; „DE“ im Briefing aus `corridor.countries`; Ladezustand „lädt“ statt „Keine Daten“; mobil „Ø 100 km/h“
an der Ankunftszeit.

**M6 Position (D-5):** Marker auf dieselbe Lage wie der Prognosepunkt (Katalog), bei > 2 km Abstand die Station in die
Liste für Jan (95 Stationen; 13 > 10 km). Welche Lage stimmt, entscheidet Jan.

**M6a Welche Lage stimmt — gemessen (06.10.2026):** je Station geprüft, welche der beiden Lagen an der EIGENEN Straße
liegt (Autobahn: Abstand zur DLM250-Achse derselben Nummer < 0,5 km, Skript `datenpruefung/pos.cjs`; übrige: Straße
mit derselben Nummer in OpenStreetMap im Umkreis 300 m, `datenpruefung/osm.cjs`). 95 Stationen > 2 km:

| | Autobahn (74) | Bundes-/Landesstraße, Sonstige (21) | zusammen |
|---|---|---|---|
| nur die Meldung liegt an der Straße | 42 | 1 (H472) | 43 |
| nur der Katalog liegt an der Straße | 4 (P101, P301, P142, M417) | 7 (K441, P670, P925, K502, J710, V069, L284) + K512 wahrscheinlich | 11–12 |
| beide liegen an der Straße (Versatz längs der Straße) | 24 (größter: H273 A 33, 21,6 km) | 3 (P214, P419, L465) | 27 |
| keine / nicht prüfbar | 4 (H371, H409, H302 — Straßennummer passt zu keiner Lage; O329) | 9 (vier Flughafen-Messfelder, P110, L225, C501, C502, H232) | 13 |

Keine der beiden Quellen ist durchgehend richtig: an Autobahnen ist die Meldung besser (Katalog 2020 oft auf Bogenminuten
gerundet), abseits davon der Katalog (grobe Fehler der Meldung v. a. FN-BY, ND-BY, RP-RP). **Regel:** die Lage an der
eigenen Straße gewinnt; liegen beide daran → Meldung (aktuell, 5 Nachkommastellen); keine → Meldung, Station gekennzeichnet
und auf Jans Liste (13 + H273). Messmarker UND Prognosepunkt bekommen dieselbe gewählte Lage. Heute steht der
Prognosepunkt auf dem Katalog — für die 43 Stationen der ersten Zeile also neben der Straße (z. B. H508 MG West 8 km, H453
AK Hagen 6 km), der Marker für die 12 der zweiten Zeile an falscher Stelle.

**M6b Umsetzung (Jan 06.10.2026: „ja mache es genau so“):**

- `scripts/road/station-positions.mjs` — Regel (`pickPosition`), Lage je Station (`stationPosition`), Bauwerkzeug.
  Straßennummern mit allen Ziffern (`roadKeyOf`, „St 2260“ ≠ „St 226“). Geprüft wird gegen OSM-Wege mit derselben
  Nummer ≤ 300 m: Autobahnen offline aus dem Auszug aller `highway=motorway` (Stand 04.10., derselbe wie für die
  Achspunkte), übrige Straßen per Overpass (fortsetzbar, Zwischenstand je Stapel). Gelistet werden nur Stationen mit
  Meldung und Katalog > 0,3 km auseinander; alle anderen behalten die Meldelage.
- `scripts/road/station-positions.json` — die Tabelle (Producer-Daten neben `de-outline.geojson`; der Spiegel-Job
  klont `scripts/` sparse mit). Eine Entscheidung gilt nur, solange die Meldung (≤ 0,3 km) noch dieselbe Lage nennt —
  korrigiert der DWD die Meldung, zählt wieder die Meldung.
- `road-derive.mjs` setzt die gewählte Lage in den Punkt; Kennzeichen `posCatalog` (+ `rpos` = Meldelage) bzw.
  `posUnverified`; Zusammenfassung zählt beide. Vertrag `roadContract.ts`: Felder `posFlag`/`reportPos` (Eingang),
  `rpos` (Punkt, vom Client-Prüfer geprüft). Ohne Tabelle bytegleich zum Stand vorher.
- `build-fc-points.mjs`: Stationspunkte auf derselben Lage (`pos: report|catalog`), `--axis-from=<points.json>` übernimmt
  die Achspunkte unverändert (kein OSM-Neubau), `--no-positions` = alter Weg. Nicht meldende Stationen: Katalog.
- Seite: Quellenzeile der Station nennt „Position aus dem DWD-Stationskatalog — die Meldung nennt eine Stelle abseits
  dieser Straße“ bzw. „Position nicht bestätigt“.
- `verify:road-positions` (neu): Regel, Abstände, Lage-Funktion, Ableitung auf den echten Bulletins 2610030800
  (P101 Kahl → A 45, alle anderen Punkte bytegleich, Gegenprobe veraltete Entscheidung), Prognosepunkte, Client, Tabelle.
- **Ergebnis der Tabelle** (Stand 06.10. 21:29 UTC, Meldungen der Slots 19:00/20:00, Autobahnen gegen den OSM-Auszug vom
  04.10., übrige per Overpass): 368 Stationen > 0,3 km → Meldung an der Straße 153 · nur Katalog 58 · beide 134 · keine 13 ·
  ohne Straßennummer 10 (Flughafen-Messfelder u. a.). Die 58 Katalog-Fälle sind eindeutig (knappster: Meldung 303 m,
  Katalog 26 m) und folgen Mustern der Reihen: KO-RP-Meldungen systematisch ≈ 400 m N / 300–600 m W verschoben,
  RH-HE/KK-SH-Meldungen auf 1–2 Nachkommastellen gerundet, dazu die groben Fehler (Kahl 130 km …). Die Nummer aus der
  Meldung zählt als zweiter Schlüssel (A/B), weil Katalogzeilen die falsche Straße nennen (H273 A 44 statt A 33, H691,
  K513, H422). Liste für Jan: `datenpruefung/lage-liste.md`.
- **Echte Ableitung** des Slots 2610061900 aus den DWD-Originalen mit Tabelle: veröffentlicht, 1 554 Punkte, 58 auf
  Kataloglage (`posCatalog`), 13 `posUnverified`; alle Werte gleich der veröffentlichten Datei außer 23 Punkten der
  Hänger-Regel (lokal ohne `state.json`, alle `stuck` — keine Folge von M6).
- **Prognosepunkte neu** (`--axis-from`, `--geo-from`): 4 569 Punkte, gleiche Kennungen, Achspunkte bytegleich,
  1 320 Stationen auf Meldelage + 58 Katalog (übrige melden nicht / ohne Katalog), 807 Stationspunkte verschoben
  (p50 71 m, p90 1,9 km, 80 > 2 km — alle zur Meldelage, weil der Katalog dort neben der Straße lag), geo 9 096 Einträge,
  0 unvollständig. Paket `C:\dev\buscosun-road-publish\2026-10-07-m6\` (MANUELLE-SCHRITTE §43).
- **Gates:** `verify:road-positions` 23/23 (mit Gegenproben E5, H2b), `verify:road-derive` 36/36, `verify:road-contract`
  69/69, `verify:road-fc` 102/102, `verify:road-archive` 26/26, `verify:road-decode` 15/15, `verify:road-ui` 64/64
  (gegen `vite preview` des frischen Builds), typecheck 0, Build, Budget grün.
- Korridore bleiben unverändert (Zuordnung schon heute aus der Meldelage); Stationen, die durch M6 an ihre Straße
  rücken (Kahl, Ensbrücke, Wildbach, Nessetal), kommen erst mit dem nächsten Korridor-Neubau in einen Korridor.

**D-10 (neu, Nebenfund):** `normaliseRoad` schneidet vierstellige Straßennummern ab (`\d{1,3}`): „St 2260“ → „ST226“,
„L3078“ → „L307“ — 166 Katalogstationen, angezeigt im Readout und in der Suche.

**M7 Sägezahn (D-8):** nur Diagnose (welche Quelle liefert die Werte zu den synoptischen Stunden an den betroffenen
Punkten) — buscosun Fusion/Producer, Jans Gate.

Reihenfolge: M1 → M3 → M5 → M2 → M6 → M4 → M7. M1–M3 ändern den Vertrag `roadContract.ts` (Producer UND Client, je
Slot sofort wirksam nach Push), mit vorher roten Fällen im Verifier (`verify:road-contract`) aus den echten Werten oben.

## 6. Vorschläge (V-AW, nicht umgesetzt — Entscheidung Jan)

| Nr | Vorschlag | Mehrwert | Skizze |
|---|---|---|---|
| V-AW-40 | `roadAir` hart schalten, mindestens für `frost`/`ice`; Füllwerte 0,00 / −1,00 / −25,00 bei identischem Luft/Taupunkt oder ≥ 10 K unter der Luft verwerfen; Plateau-Ausnahme nur, wenn der Wert sich bewegt | keine falsche Frostgefahr mehr (D-1) | Regel-Tabelle in `roadContract.ts`, Gegenprobe am Archiv seit 03.10. |
| V-AW-41 | Beobachtungsregeln als Kennzeichnung an den Punkt (`f: ['suspect']`) und Text „Wert auffällig“ statt „Plausibilität bestanden“ | ehrliche Anzeige bis Gate B (D-2) | Quarantäne-Einträge mit `observe` → Flag am Punkt |
| V-AW-42 | 0 20 024 übernehmen; Rate nur zeigen, wenn Intensität > 0 oder eine Art gesetzt ist | kein Phantom-Niederschlag (D-3) | `RoadRawStation.precipIntensity`, Regel `precipFill` |
| V-AW-43 | Anker nur mit Stationen, die keine Beobachtungsregel reißen (`cube`, `roadAir`, `neighbours`) | Prognose ohne Sensorfehler (D-4) | Filter in `swisTable` über die Quarantäne des Slots |
| V-AW-44 | Marker auf die Lage legen, die Jan je Station festlegt (Liste V-AW-30), sonst Katalog | Ort stimmt (D-5) | Feld `pos` im Katalog, Derive setzt `lat/lon` |
| V-AW-45 | „Luft 2 m“ → „Luft“ (+ Fühlerhöhe, wenn gemeldet) bei Messwerten | richtige Beschriftung (D-6) | 0 07 032 in den Punkt |
| V-AW-46 | Prüftext aus den Bits: „nicht durchgeführt“ nur bei Bit 1, sonst „geprüft, beanstandet: …“, bei fehlendem Flag „unbekannt“ | richtige Aussage (D-7) | `q` um `qBits` erweitern |
