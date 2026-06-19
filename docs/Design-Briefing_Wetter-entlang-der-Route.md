# Design-Briefing — Feature „Wetter entlang deiner Route"

**Produkt:** buscosun (Wetter-App für DE · AT · CH)
**Feature-ID:** `route` (Tourenplanung)
**Adressat:** UX/UI-Designer für UI-Mockups
**Stand:** Mai 2026 · Design-System v1.8
**Zweck dieses Dokuments:** Alle inhaltlichen, funktionalen und datentechnischen Informationen, die nötig sind, um das Feature als Mockups zu gestalten — inklusive aller Datenfelder, Zustände, Semantik, Microcopy und der bestehenden Designsprache.

> **Hinweis für den Designer:** Dieses Briefing beschreibt sowohl die *bestehende* Implementierung (was heute live ist) als auch die *Datenfülle dahinter* (was alles gezeigt werden könnte). An mehreren Stellen ist das Datenmodell reicher als die heutige Darstellung — das sind die Gestaltungs-Chancen. Sie sind als **💡 Chance** markiert.

---

## 1. Produkt-Kontext & Positionierung

buscosun ist eine Wetter-App für den DACH-Raum mit klarer Haltung:

- **„Wetter, das seine Arbeit zeigt."** — Transparenz statt einer einzelnen blanken Zahl. Konfidenz, Quellen und Modell-Spread werden offengelegt.
- **Native Behörden-Quellen:** DWD (Deutschland), GeoSphere (Österreich), MeteoSwiss (Schweiz) — live, **höhenkorrigiert**, ohne Tracker, ohne Werbung.
- **Ehrlich:** wo Daten fehlen oder geschätzt sind, wird das benannt (z. B. „UV außerhalb DE geschätzt", „heuristisch", Konfidenz-Werte).
- **Tonalität:** Deutsch, geduzt, sachlich-warm, kompetent ohne Fachjargon-Überfrachtung. Earthy/„labware"-Ästhetik (siehe §16).

Das Route-Feature ist eine von sechs Kacheln auf der Startseite (weitere: Event-Planung, Tagesablauf, Vorhersage, Nowcast, KI-Assistent). Kachel-Text heute:

> **Tourenplanung** · „Wetter entlang deiner Route" · *GPX hochladen oder Strecke planen. Sieh Wind, Regen und Temperatur an jedem Kilometer mit Zeit-Scrubber.*

---

## 2. Feature-Zweck & Wertversprechen

**Kernidee:** Lade deine geplante Tour (GPX & Co.) hoch, sag uns *wie* und *wann* du unterwegs bist — buscosun rechnet die realistische Zeitplanung und zeigt das Wetter **an jedem Punkt der Strecke zum tatsächlichen Zeitpunkt deiner Ankunft dort**.

Der entscheidende Unterschied zu „normalem" Wetter: Es ist **orts- UND zeitaufgelöst entlang der Bewegung**. Wer um 6:00 startet, ist auf dem Gipfel vielleicht erst um 11:00 — und genau das Gipfelwetter um 11:00 wird gezeigt, höhenkorrigiert auf die Gipfelhöhe.

**Was die App besonders gut kann (Differenzierung):**
- Höhenkorrektur pro Punkt (Tal warm, Grat kalt — physikalisch korrekt).
- Schneefallgrenze, Föhn-Erkennung, UV (inkl. Klarhimmel-Schätzung im Hochgebirge).
- Radar-Nowcast überschreibt Niederschlag in den nächsten Stunden (minutengenau statt Modell-Mittel).
- Amtliche Wetterwarnungen verortet auf km-Abschnitte der Tour.
- Acht Fortbewegungsmittel mit eigenen, kalibrierten Geschwindigkeitsmodellen (DIN/SAC-Gehzeit etc.).
- E-Bike-Akku-Reichweite entlang des Höhenprofils.

---

## 3. Zielgruppen & Use Cases

| Persona | Bewegungsart | Kernfrage | Wichtigste Daten |
|---|---|---|---|
| **Bergwanderer/in** | Wandern, Bergwandern | „Erwischt mich oben ein Gewitter? Ist es am Gipfel kalt?" | Temperatur/Gefühlt, Niederschlag + Warnungen, Wind/Böen, Schneefallgrenze, Gehzeit |
| **Rennradfahrer/in** | Rennrad, Gravel | „Habe ich Rückenwind? Werde ich nass?" | Wind (Richtung + Stärke), Niederschlag-Timing, Temperatur, Gesamtdauer |
| **E-Biker/in** | E-Bike Trekking | „Reicht der Akku? Wann komme ich an?" | Akku-Reichweite, Höhenprofil, Ankunftszeit, Wind |
| **Trailrunner/in** | Trail-Running, Jogging | „Schneller Lauf, kurzes Wetterfenster — passt es?" | Kompakte Zeit/Wetter-Übersicht, Regenrate, gefühlte Temperatur |
| **Tourenplaner/in (vorab)** | alle | „An welchem Tag/zu welcher Startzeit ist es am besten?" | Start-Variation, Konfidenz, Gesamtbild |

**Kontext der Nutzung:** überwiegend **Vorbereitung am Vorabend (Desktop/Tablet)**, zunehmend **unterwegs (Mobile)** als Check vor dem Start. Mobile ist gleichwertig zu gestalten (siehe §19).

---

## 4. Kern-Nutzerreise (End-to-End)

```
Startseite (Kachel "Tourenplanung")
        │ Klick
        ▼
[A] Upload-Screen ──(Datei)──► [B] Prüfen/Lesen ──► (Fehler? → [B-err])
        │                                              │
        │                                       (Track aufbereiten:
        │                                        Glätten, DEM-Höhen,
        │                                        Punkt-Reduktion)
        ▼                                              ▼
                                            [C] Tour-Ergebnis-Screen
                                            ├─ Karte + Kennzahlen + Höhenprofil
                                            ├─ [C1] Bewegungsart wählen (8 Modi)
                                            ├─ [C2] Konfiguration:
                                            │       Richtung · Tempo · Start · Pausen · (E-Bike-Akku)
                                            └─ [C3] Ergebnis:
                                                    Zeitplan · Wetter-Strip · Wetter-Profil ·
                                                    Wetter-Zusammenfassung · Wetter-Punkte-Tabelle ·
                                                    Karten-Marker · Status-/Qualitätszeilen
```

### Phasen & Zustände

| Phase | Zustand | Was passiert / was zu zeigen ist |
|---|---|---|
| **A — Upload** | `idle` | Dropzone „Strecke hierher ziehen oder Datei auswählen". Liste unterstützter Formate (GPX/TCX/FIT/KML/KMZ, max. 25 MB). |
| **B — Verarbeitung** | `parsing` | „‚{Dateiname}' wird geprüft und gelesen …" |
| | `error` | Fehlerleiste mit Dateiname + verständlicher Meldung + „Andere Datei". (Fehlerfälle siehe §14) |
| | `working` (Aufbereitung) | „Strecke wird aufbereitet …" (Normalisierung, DEM-Höhenanreicherung, Glättung, Punkt-Reduktion) |
| **C — Tour** | `done` | Vollständige Ansicht (siehe §7). Wetter lädt asynchron nach Auswahl der Bewegungsart. |

**Wichtig:** Die Bewegungsart muss **zuerst** gewählt werden, bevor Zeitplan & Wetter erscheinen — ohne sie gibt es keine ETAs und damit kein zeitaufgelöstes Wetter. Heute ist das ein „MovementPicker" als erster Block. **💡 Chance:** Onboarding/Defaulting überdenken (z. B. sinnvolle Vorauswahl nach Gelände).

---

## 5. Informationsarchitektur — das vollständige Datenmodell

Das Feature kennt **drei Datenebenen**. Jede ist eine eigene Gestaltungs-Quelle.

### 5.1 Pro Wetter-Punkt (`SampleWeather`)
Eine Tour wird auf **strategische Stützpunkte** reduziert (typ. 20–300, je nach Länge/Gelände; alpin dichter). Jeder Punkt trägt:

| Feld | Bedeutung | Einheit / Wertebereich | Hinweis |
|---|---|---|---|
| `temperatureC` | Lufttemperatur (höhenkorrigiert auf Punkt-Höhe) | °C | — |
| `apparentTempC` | Gefühlte Temperatur (Wind-Chill / Hitze-Index) | °C | Nur merklich anders → separat zeigen |
| `windSpeedMps` | Mittelwind | m/s | auch km/h darstellbar (×3,6) |
| `windDirectionDeg` | Windrichtung (woher) | 0–360° meteorologisch | für Pfeile/Rücken-/Gegenwind |
| `gustMps` | Böen (Maximum) | m/s | ≥ Mittelwind |
| `relativeHumidityPct` | Luftfeuchte | 0–100 % | — |
| `cloudCoverPct` | Bewölkung gesamt | 0–100 % | treibt Wetter-Icon |
| `uvIndex` | UV-Index | 0–11+ | DE gemessen, AT/CH geschätzt (Klarhimmel-Modell) |
| `precipitationMmH` | Niederschlagsrate | mm/h | — |
| `precipitationSource` | Herkunft | `radar` \| `nwp` \| `null` | Radar = minutengenauer Nowcast |
| `precipitationType` | Art | `none` \| `rain` \| `sleet` \| `snow` | konsistent mit Schneefallgrenze |
| `snowLineM` | Schneefallgrenze | m ü. M. | nur AT/CH (AROME); DE: keine |
| `foehn` | Föhn-Einschätzung | `{ isFoehn, score 0–1, reasons[] }` | heuristisch (Tier C) |
| `warnings[]` | aktive amtliche Warnungen | `TourWarning[]` | DWD CAP (DE); Level 1–5 |
| `confidence` | Konfidenz je Variable | 0–1 (temp, wind, gust, humidity, precipitation, clouds, snowLine, uvIndex) | **wenig genutzt — 💡 große Chance** |
| `validityFlags[]` | Status-Marker | z. B. `ok`, `radar_override`, `elevation_corrected`, `uv_estimated`, `beyond_horizon`, `fusion_failed` | für Trust-Signale |
| `sourcesUsed[]` | beitragende Quellen | z. B. `dwd_obs`, `mosmix`, `arome_at`, `inca`, `smn`, `tawes`, `dwd_uv` | Transparenz |

Zusätzlich trägt jeder Punkt aus der Zeitberechnung: `dist` (km ab Start), `etaMs` (Ankunftszeit), `arrivalOffsetMin` (Minuten ab Start), `segmentSpeedKmh` (Tempo des Segments), optional `batteryPctRemaining` (E-Bike-Akku %), `ele` (Höhe).

### 5.2 Tour-Aggregat (`WeatherAggregate`)
Aus allen Punkten verdichtet — die **Zusammenfassung der ganzen Tour**:

- **Temperatur:** min / max / Ø
- **Gefühlt:** min / max
- **Wind:** Ø / max · **Böen:** max
- **Niederschlag:** Gesamtmenge `totalMm` (zeit-integriert!), Stunden-mit-Regen, max Regenrate, Anteil Radar vs. NWP, hat Schnee/Schneeregen, dominante Art
- **Bewölkung:** Ø · **Luftfeuchte:** Ø
- **UV:** max / Ø
- **Schneefallgrenze:** min / max / Ø
- **Föhn:** Anzahl Punkte, max Score, km-Spanne, Gründe
- **Warnungen:** Anzahl distinct, max Level, Liste mit je km-Spanne + Zeitfenster

> Detail, das in der UI wichtig ist: **Niederschlag wird zeit-integriert** — `totalMm` = Σ (Rate × Zeit bis nächster Punkt). „5,7 mm · 2 h 37 mit Regen" ist eine echte Mengenaussage, nicht nur ein Maximum.

### 5.3 Tour-Timing (`TourTiming`)
- `movingSec` (Geh-/Fahrzeit), `breakSec` (Pausen), `totalSec` (gesamt), `arrivalMs` (Ankunft)
- `avgKmh`, `minKmh`, `maxKmh`
- **Milestones:** Start → Pausen (Rast/Essen/Custom, je mit An-/Abfahrt + Dauer) → Ziel
- Pro Punkt: ETA, Offset, Segment-Tempo
- Wind-Iteration: konvergiert / Anzahl Iterationen / Drift / Quelle (Cluster-Anzahl, Stunden)

---

## 6. Bewegungsarten (8 Modi)

Jede mit eigenem Geschwindigkeitsmodell, Default-Profil und Slider-Bereichen. Der Picker zeigt Icon + Label + Kurzbeschreibung.

| Modus | Label / Kurztext | Kategorie | Flach-Tempo (Default · Bereich) | Besonderheit |
|---|---|---|---|---|
| `wandern` | **Wandern** — „T1–T2, einfache Wege" | Fuß | 4,5 km/h · 3–6 | DIN 33466 / SAC-Gehzeit |
| `bergwandern` | **Bergwandern** — „T3, alpine Steige" | Fuß | 3,5 km/h · 2,5–5 | + Steilstufen-Aufschlag |
| `jogging` | **Jogging** — „Straßenlauf" | Fuß | 9 km/h · 6–14 | Lauf-Pace + Grad-Penalty |
| `trail` | **Trail-Running** — „Laufen im Gelände" | Fuß | 8 km/h · 5–13 | + Trail-Overhead |
| `rennrad` | **Rennrad** — „Asphalt, schnell" | Rad | 26 km/h · 18–40 | Steigungsmodell, schnelle Abfahrt |
| `gravel` | **Gravel** — „Schotter & Asphalt" | Rad | 20 km/h · 14–32 | höherer Rollwiderstand |
| `mtb` | **MTB Cross-Country** — „Cross-Country" | Rad | 15 km/h · 9–26 | gedrosselte Technik-Abfahrt |
| `ebike` | **E-Bike Trekking** — „Motor bis 25 km/h" | Rad | 23 km/h · 15–25 | Motor halbiert Steigungsverlust; **Akku-Panel** |

Fuß-Modi haben zusätzlich Steig-/Abstiegsleistung (Hm/h) als Parameter. Rad-Modi haben „Bergfitness" (1–5) und Abfahrts-Limit.

---

## 7. Bildschirm-Inventar (Sektionen des Tour-Ergebnis-Screens)

Reihenfolge im heutigen Layout (Desktop, einspaltig, scrollend). Jede Sektion unten in §8/§9 detailliert.

1. **Datei-Leiste** — Format-Badge, Dateiname, Größe + Tier, „Andere Datei".
2. **Tour-Name** (falls in Datei) + **Wetter-Strip** (komoot-artig, sobald Wetter geladen).
3. **Karte** (MapLibre) — Routenlinie, Start/Ziel-Marker, Pausen, Wegpunkte, **Wetter-Marker**.
4. **Kennzahlen-Block** — Distanz, Aufstieg, Abstieg, Höchster/Tiefster Punkt, Dauer, Track-Punkte, Wetter-Punkte; **Höhenprofil**-Mini-Chart; „Gelände: alpin/hügelig/flach".
5. **Tour-Planung** (`<section>`):
   - **MovementPicker** (8 Radio-Kacheln) — solange nichts gewählt.
   - Danach **Konfiguration**: Bewegungsart-Header (+ „andere Art"), **Tempo-Profil** (Slider), **Richtung** (Hinweg/Rückwärts oder „Rundtour"-Badge), **Startzeit**, **Pausen**, (E-Bike: **Akku-Panel**).
   - **Zeit-Zusammenfassung** (dl): Start · Geh-/Fahrzeit · Pausen · Gesamtdauer · Ankunft.
   - **Wind-Status-Zeile** (Konvergenz/Quelle).
   - **Zeitplan** (Timeline: Start → Pausen → Ziel).
   - **Wetter-Status-Zeile** (Cluster/Calls/Korrekturen/…); **Abdeckungs-Hinweis**.
   - **Wetter — Tour-Zusammenfassung** (Stat-Grid + Warn-/Föhn-Banner).
   - **Wetter-Profil** (3 gestapelte Sparklines über Distanz).
   - **Wetter-Punkte-Tabelle** (repräsentative Auswahl).
   - **Horizont-Hinweis** (falls Ankunft > 10 Tage in der Zukunft).

> **💡 Große Chance:** Heute ist alles vertikal gestapelt. Die größte ungenutzte Interaktion ist ein **gekoppelter „Zeit-Scrubber"**, der Karte ↔ Höhenprofil ↔ Wetter-Strip synchron an einer km-Position scrubbed (siehe §11.6). Das Mockup `mockups-v2/28-mobile-route-scrubber.svg` skizziert die Richtung.

---

## 8. Datenelemente im Detail — Formate, Einheiten, Labels

Deutsche Lokalisierung: **Komma als Dezimaltrenner**, Uhrzeit `HH:MM`, Datum `Sa., 30.05.2026`.

### 8.1 Kennzahlen-Block (`RouteSummary`)
| Label | Beispielwert | Format |
|---|---|---|
| Distanz | `8,6 km` | 1 Nachkomma |
| Aufstieg | `1652 hm` | Höhenmeter, ganzzahlig |
| Abstieg | `0 hm` | — |
| Höchster Punkt | `2234 m` | — |
| Tiefster Punkt | `581 m` | — |
| Dauer | `—` / `9 h 02 min` | erst nach Planung |
| Track-Punkte | `161` | — |
| Wetter-Punkte | `21` | Stützpunkte |
| Gelände | `alpin` | flach / hügelig / alpin |

Zusätzlich: **Höhenprofil** als kleine Flächen-Sparkline (x = km, y = Höhe), mit Achsbeschriftung „0 km / 2234 m / 8,6 km". Badge: „161 → 21 Wetter-Punkte".

### 8.2 Zeit-Zusammenfassung
| Label | Beispiel |
|---|---|
| Start | `Sa., 30.05.2026, 06:00` |
| Gehzeit *(Fuß)* / Fahrzeit *(Rad)* | `7 h 17 min` |
| Pausen | `4 · 1 h 45 min` (nur wenn > 0) |
| Gesamtdauer | `9 h 02 min` |
| Ankunft | `So., 31.05.2026, 09:00` |

Dauer-Format: `formatHM` → „2 h 35 min" bzw. „45 min".

### 8.3 Wetter-Zusammenfassung (`WeatherSummary`, Stat-Grid)
Acht bis zehn Kacheln (nur die mit Daten):

| Kachel | Wert (Beispiel) | Sub |
|---|---|---|
| Temperatur | `2,3 – 28,8 °C` | `Ø 18,5 °C` |
| Gefühlt | `0,4 – 28,8 °C` | — |
| Wind | `Ø 1,4 m/s` | `max 2 m/s` |
| Max Böen | `5 m/s` | `18,1 km/h` |
| Niederschlag | `0,3 mm` | `1 h 17 mit Regen` / `trocken` |
| Max Regenrate | `0,2 mm/h` | `9 Punkte Radar` / `NWP-Modell` |
| Bewölkung | `34 %` | `leicht bewölkt` |
| Luftfeuchte | `39 %` | — |
| UV-Index (max) | `2,7` | `niedrig` (Kategorie) |
| Schneefallgrenze | `3158 m` | `3076–3222 m` (wenn Spanne) |

Bewölkungs-Worte: wolkenlos / leicht bewölkt / wechselnd / überwiegend bewölkt / bedeckt.
Niederschlags-Sub: „mit Regen / mit Schneeregen / mit Schnee".

### 8.4 Wetter-Punkte-Tabelle (`SampleTable`)
Repräsentative Auswahl (Start, 3 Zwischenstützen, Ziel). Spalten:
`#` · `km` · `Ankunft` (HH:MM) · `+min` (Offset) · `km/h` (Segment-Tempo) · *(E-Bike: `Akku %`)* · `°C` · `mm/h` (+ „R" wenn Radar, „❄" wenn Schnee, „❄/💧" Schneeregen) · `m/s` (Wind) · `⚠` (Warnung).

> **💡 Chance:** Heute nur 5 Zeilen + knappe Spalten. Die Tabelle könnte zu einer scroll-/aufklappbaren Voll-Liste mit Wind-Pfeilen, Föhn-, UV- und Schneefallgrenzen-Spalten werden.

---

## 9. Wetter-Visualisierungen im Detail

### 9.1 Wetter-Strip (`TourWeatherStrip`, komoot-Stil)
Horizontaler Streifen **über der Karte**, festes km-Raster (~1,5 km, max. 48 Zellen). Jede Zelle:
- km-Label (oben), **Wetter-Icon** (30 px), **Temperatur** (`22°`), **Uhrzeit** (HH:MM)
- Badges: `⚠` (Warnung, mit Event-Tooltip) · `🌬️` (Föhn) · Niederschlag (`5 mm` bzw. `5❄`) · **UV-Badge** (nur ab UV ≥ 6, eingefärbt nach Kategorie, „UV7")
- Zellen-Hintergrund-Akzent bei Warnung bzw. Föhn.

### 9.2 Wetter-Profil (`WeatherProfile`, 3 Sparklines)
Gestapelte SVG-Panels, x = Distanz:
1. **Temperatur** — Linie (terracotta), Fläche darunter, gefühlte Temp gestrichelt (nur wenn ≥ 1 °C Unterschied). Y-Achse min/max rechts.
2. **Niederschlag** — Balken (mm/h), **eingefärbt nach Art** (Regen = steel-blau, Schneeregen = violett, Schnee = eisblau), Radar-Variante kräftiger/höhere Deckkraft. Y-Skala mind. 0–4 mm/h.
3. **Wind** — Mittelwind-Linie (slate-blau) + **Böen-Ribbon** (Fläche zwischen Wind und Gust), Gust gestrichelt.

Dynamische Legende (zeigt nur vorkommende Niederschlagsarten) + „Radar (sonst NWP)".

### 9.3 Karte (`RouteMap`, MapLibre / OpenFreeMap)
- Routenlinie, **Start-/Ziel-Marker**, **Pausen-Marker** (Rast/Essen/Custom), **Wegpunkte**.
- **Wetter-Marker** pro Sample mit: Temperatur, Niederschlag (Rate/Art/Quelle), Wind (Stärke + Richtung), UV, Warn-Flag (+Event), Föhn-Flag.
- Karte ist klickbar: Klick fügt eine **Custom-Pause** an dieser Position hinzu.
- Zoom/Rotate-Controls, Maßstab.

### 9.4 Zeitplan (`Timeline`)
Vertikale Liste der Milestones: **Start** → **Pausen** (Uhrzeit, Label, km, „+15 min → 12:45") → **Ziel** (Ankunft + km). Farblich nach Typ (start/rest/meal/custom/end).

### 9.5 E-Bike-Akku (`EbikeBatteryPanel`)
Nur bei E-Bike. Akku-Verlauf über die Strecke (monoton fallend auf Flach, Rekuperation bergab), Start 100 %, Rest am Ziel; Konfiguration (Akku-Kapazität etc.). In der Tabelle zusätzlich „Akku %"-Spalte.

### 9.6 💡 Fehlt heute: der „Zeit-Scrubber"
Die Kachel verspricht ihn, die Live-UI hat ihn noch nicht. **Konzept für Mockups:** Ein ziehbarer Marker entlang km/Zeit, der **Karte, Höhenprofil, Wetter-Strip und eine Detail-Karte synchron** auf eine Position setzt — „Wo bin ich um X Uhr, und wie ist dort das Wetter?". Existierendes Skizzen-Mockup: `mockups-v2/28-mobile-route-scrubber.svg`. Dies ist die **wichtigste Gestaltungsaufgabe**.

---

## 10. Tourplanung-Controls

| Control | Verhalten | Microcopy |
|---|---|---|
| **Bewegungsart** | 8 Radio-Kacheln (Icon + Label + Kurztext) | „Wie bist du unterwegs?" |
| **Tempo-Profil** | Slider: Flach-Tempo (+ Steig-/Abstieg bzw. Bergfitness/Abfahrtslimit) | je Modus eigene Bereiche |
| **Richtung** | Segmented „Hinweg / Rückwärts" — **oder** Badge „↻ Rundtour erkannt — Richtung egal" | — |
| **Startzeit** | Datum/Uhrzeit-Picker | Default: jetzt |
| **Pausen** | Auto-Pausen (Zeit-/Distanz-Intervall, Dauer) + Mahlzeit + Custom (auch via Kartenklick) | — |
| **E-Bike-Akku** | Kapazität/Verbrauch | nur E-Bike |

Slider-Tweaks, die die Sample-Positionen/ETAs nicht ändern (z. B. kleine Tempo-Korrekturen im selben 5-min-Raster), lösen **kein** erneutes Wetter-Laden aus (Performance).

---

## 11. Semantik & Farbcodierung (verbindlich)

### 11.1 Niederschlagsart (Profil-Balken)
| Art | NWP | Radar (kräftiger) |
|---|---|---|
| Regen | `#4f627e` (slate-blau) | `#3a6fa3` (steel-blau) |
| Schneeregen | `#a994d1` (violett hell) | `#8a6dc4` (violett) |
| Schnee | `#b6c8d6` (eisblau hell) | `#9ab8cf` (eisblau) |

### 11.2 UV-Index (Badge-Farben + Kategorien)
| UV | Kategorie | Farbe |
|---|---|---|
| 0–2 | niedrig | `#5a9e4b` (grün) |
| 3–5 | mäßig | `#f5b700` (gelb) |
| 6–7 | hoch | `#f46036` (orange) |
| 8–10 | sehr hoch | `#d7263d` (rot) |
| 11+ | extrem | `#6b49c8` (violett) |

UV-Badge im Strip erst ab **≥ 6** (relevant für Sonnenschutz).

### 11.3 Wetterwarnungen (DWD-Level 1–5)
Severity-Tags: Minor / Moderate / Severe / Extreme; Level 1–5 (höher = gefährlicher). Banner mit Severity-Tag, Event-Name, km-Spanne, Zeitfenster. Farbskala nach Level (Gelb → Orange → Rot). Bsp.: „Sturmböen", „Gewitter".

### 11.4 Föhn
Banner „**Föhn-Lage wahrscheinlich**" + km-Spanne + Punktanzahl + Gründe (z. B. „Südwind, böig") + „(heuristisch)". Icon 🌬️. Immer als *heuristisch* kennzeichnen.

### 11.5 Temperatur / Wind (Linien)
- Temperatur-Linie: terracotta (`--terracotta-500 #C97B47`), Fläche transluzent; gefühlte Temp: dunkleres terracotta gestrichelt.
- Wind-Linie: slate-blau `#4f627e`; Böen: terracotta gestrichelt; Ribbon transluzent terracotta.

### 11.6 Quelle & Konfidenz (Trust)
- **Radar vs. NWP:** Radar = „R"/höhere Deckkraft = minutengenauer Nowcast (vertrauenswürdiger fürs Timing).
- **Konfidenz 0–1 pro Variable:** heute kaum visualisiert. **💡 Chance:** als dezente Unsicherheits-Bänder/Punkt-Opazität/„±"-Angaben — passt zur Marke „ehrlicher Spread".

---

## 12. Wetter-Icons & Bedingungen

Handgezeichnete SVG-Glyphs (Stroke 1,4 px, runde Enden; Sonne terracotta, Wolken slate, Niederschlag steel, Nacht ink). Auswahl-Logik (cloud %, precip mm/h, Stunde; Nacht = < 6 oder ≥ 21 Uhr):

| Bedingung | Regel | Icon-Key |
|---|---|---|
| Starker Regen | precip > 2 | `heavy-rain` / `rain-night` |
| Regen | precip > 0,1 | `rain` / `rain-night` |
| Bedeckt | cloud > 80 | `cloudy` |
| Bewölkt | cloud > 40 | `partly-cloudy(-night)` |
| Heiter | cloud > 15 | `sun-with-cloud` / `moon-with-cloud` |
| Klar | sonst | `sun` / `moon` |

Textuelle Beschreibung (`describeCondition`): Klar · Heiter · Bewölkt · Bedeckt · Leichter/Regen/Starker Regen.

---

## 13. Status- & Qualitäts-Zeilen (heute als kleine Notizen)

Diese Meta-Infos sind heute knappe graue Textzeilen — **💡 Chance** für eine elegantere „Daten-Herkunft/Vertrauen"-Darstellung.

- **Wind-Status:** „Wind: konvergiert nach 3 Iterationen · letzte Drift 3 s · Quelle AT (5 Cluster, 58 h)" — bzw. „Wind nicht verfügbar — Timing ohne Wind berechnet."
- **Wetter-Status:** „Wetter: 1/1 Cluster · 1 Calls · 9 Punkte mit Radar-Nowcast · 21 höhenkorrigiert · 3 UV geschätzt · 2295 ms"
- **Abdeckungs-Hinweis** (nur wenn Lücken): „Abdeckung: Schneefallgrenze nur AT/CH · UV außerhalb DE geschätzt (Klarhimmel-Modell)"
- **Horizont-Hinweis:** „⚠ Die Ankunft liegt über 10 Tage in der Zukunft — reduzierte Vorhersage-Konfidenz."

---

## 14. Zustände, Sonderfälle & Fehler

| Fall | Auslöser | Anzeige-Anforderung |
|---|---|---|
| Datei zu groß / leer | > 25 MB / 0 B | Fehlerleiste + verständliche Meldung |
| Format unbekannt | Magic-Byte-Sniff scheitert | „Dateiinhalt nicht erkannt — keine gültige GPX/TCX/FIT/KML/KMZ-Datei." |
| Zu viele Punkte | > 100.000 | Meldung mit Zahl |
| Strecke zu kurz | < 100 m | „Die Strecke ist zu kurz (… m). Mindestens 100 m nötig." |
| Punkte zu weit auseinander | > 5 km Lücke | „… vermutlich fehlerhaft. Ggf. einzelnen Track wählen." |
| Außerhalb DACH | Bounding-Box | „Die Strecke liegt außerhalb der unterstützten Region (DE, AT, CH)." |
| Mehrere Tracks in Datei | — | Track-Auswahl (Chips: „Alle (zusammengefügt)" + je Track) |
| Keine Höhe in Datei | — | DEM-Höhen werden ergänzt; falls nicht verfügbar: Höhen-/Akku-/Steigungs-Features degradieren sauber |
| Kein Wetter (Netz/offline) | Cluster-Fehler | Sample mit `fusion_failed`-Flag → Tour läuft weiter, Wert „—" |
| Jenseits Forecast-Horizont | ETA > Modell-Horizont | `beyond_horizon` → Wert „—", Zähler im Status |
| Föhn/Schneefallgrenze/UV-Lücke | Land-abhängig | Coverage-Hinweis (nicht als „Datenausfall" missverstehen!) |
| Rundtour | Start ≈ Ziel | Richtungs-Auswahl entfällt → Badge |
| Weit in der Zukunft | > 10 Tage | Konfidenz-Warnung |

**Leitprinzip:** *graceful degradation* — ein fehlender Einzelwert darf nie die ganze Ansicht blockieren; er wird als „—" gezeigt, das Feature läuft weiter.

---

## 15. Vertrauens- & Qualitätssignale (Marken-Kern)

buscosuns Versprechen ist Ehrlichkeit. Diese Signale müssen gestalterisch *präsent, aber nicht alarmierend* sein:

- **„höhenkorrigiert"** — Kernkompetenz, ruhig sichtbar machen.
- **„geschätzt" / „heuristisch"** — bei UV-Fallback (AT/CH), Föhn.
- **Radar-Nowcast** vs. **NWP-Modell** — Quelle des Niederschlags.
- **Quellen-Tags** — DWD/GeoSphere/MeteoSwiss, Stationen, Modelle.
- **Konfidenz** pro Variable (0–1) — *die größte ungenutzte Chance.*
- **Coverage-Lücken** — klar als „in diesem Land nicht verfügbar" (≠ „Ausfall").

---

## 16. Design-System & visuelle Sprache (v1.8)

**Ästhetik:** warm, erdig, „labware/Papier"-Anmutung — analog/handgezeichnet statt kalt-technisch. Sanfte Schatten, gerundete Formen, viel Sand/Creme-Flächen.

**Farb-Tokens (Auszug):**
- Flächen: `--sand-50 #F5F1E8`, `--sand-100 #EDE6D3`, `--sand-200 #E0D6BE`, `--cream-50 #FAF6EA`
- Text: `--ink-900 #2C2A26`, `--stone-600 #5C5447`, `--stone-500 #8B7355` (gedämpft)
- Semantik: `--sage-600 #7A9466` (live/positiv/grün), `--terracotta-500 #C97B47` (Akzent/Wärme/Temp), `--amber-500 #D4A373`, `--steel-600 #3A6FA8` (Niederschlag/Wind/Wasser), `--slate-500 #6B7A8F` (Wolken)
- Border: `#E0D6BE`/`#D9D0B8`/`#C4B896`; Schatten weich (`0 4px 16px rgba(44,42,38,.06)` …)
- Typo: System-Sans (`ui-sans-serif, system-ui, …`)

**Primitive:**
- **Eyebrow:** kleine Versalien, Letterspacing 0,22em, gedämpft (z. B. „Tourenplanung").
- **Live-Dot:** sage-grüner pulsierender Punkt für Echtzeit-Daten.
- **Wetter-Icons:** eigener handgezeichneter Stil (siehe §12) — bitte konsistent halten.

**Layout heute:** zentrierte, einspaltige Content-Spalte; Karte als breites Element; Blöcke als Karten auf Sand-Grund.

---

## 17. Bestehende Mockup-Referenzen

Im Repo unter `mockups-v2/` (SVG) — als Design-Referenz/Tonsetzung sichten:
- `11-route-planner.svg` — Desktop-Routenplaner-Konzept
- `28-mobile-route-scrubber.svg` — Mobile mit Zeit-Scrubber (Zielbild für §9.6)
- `26-mobile-hero.svg`, `01-hero-homepage.svg` — Marken-/Hero-Sprache

Diese sind Konzept-Skizzen, nicht der Live-Stand — der Live-Stand ist konservativer (§7). Die Mockups zeigen die **angestrebte** Richtung.

---

## 18. Microcopy & Tonalität

- Deutsch, geduzt, knapp, sachlich-warm. Beispiele live: „Wie bist du unterwegs?", „Strecke, Tempo, Start und Pausen stehen. Im nächsten Schritt holen wir das Wetter entlang der 21 Punkte — getaktet nach deinem Plan.", „Wetter wird pro Sample geladen …".
- Einheiten ausgeschrieben/symbolisch wie gewohnt (°C, m/s, mm/h, km, hm, m).
- Ehrliche Qualifizierer beibehalten: „(heuristisch)", „geschätzt", „höhenkorrigiert".
- Keine reißerischen Wetter-Warnungen — amtliche Warnungen sachlich mit Severity/Zeit/Ort.

---

## 19. Responsive & Plattform

- **Desktop/Tablet:** primärer Planungs-Kontext, Platz für Karte + Profil + Strip nebeneinander. **💡 Chance:** mehrspaltiges Layout statt heutigem Stapel.
- **Mobile:** vollwertig. Karte + Strip + Scrubber im Vordergrund; Konfiguration als Sheets/Accordion. Der **Zeit-Scrubber** ist mobil besonders wertvoll (Daumen-Interaktion). Siehe `28-mobile-route-scrubber.svg`.
- Verfügbar als Web (claude.ai-unabhängig), Karten via MapLibre.

---

## 20. Barrierefreiheit

- Wetter darf **nicht nur per Farbe** kodiert sein — immer Icon + Text/Wert dazu (z. B. Niederschlagsart als Text/Symbol, nicht nur Balkenfarbe).
- Warnungen mit `role="alert"`, Föhn als `role="note"`, Strip als beschriftete Gruppe (heute schon so).
- Ausreichende Kontraste auf Sand-Flächen prüfen (gedämpfte Texte `stone-500` ggf. zu hell für Fließtext).
- Touch-Ziele ≥ 44 px (Slider, Picker, Scrubber-Griff).
- SVG-Charts brauchen Text-Alternativen / zugängliche Wertetabelle (Tabelle existiert bereits).

---

## 21. Constraints & Limits

- **Region:** nur DACH (+ ~50 km Puffer). Außerhalb → Fehler.
- **Formate:** GPX, TCX (Tier 1) · FIT, KML, KMZ (Tier 2). Max. 25 MB, 100.000 Trackpunkte.
- **Datenquellen pro Land:**

| Land | Temperatur/Wind/… | Niederschlag-Nowcast | Schneefallgrenze | UV |
|---|---|---|---|---|
| **DE** | DWD-Stationen + MOSMIX | RADOLAN/RV-Radar | — (nicht verfügbar) | DWD (gemessen) |
| **AT** | TAWES-Stationen + AROME + INCA | INCA-Radar | AROME (ja) | Klarhimmel-Schätzung |
| **CH** | SMN-Stationen + AROME | (rzc) | AROME (ja) | Klarhimmel-Schätzung |

- **Prognose-Horizont:** modell-/landabhängig (~24–60 h für stündliche Werte); darüber „beyond_horizon".
- **Philosophie:** keine ratenlimitierten/nicht-kommerziellen Drittquellen als Default (kein Open-Meteo o. Ä.) — native Behörden-Quellen.

---

## 22. Offene Design-Fragen / Entscheidungen für den Designer

1. **Zeit-Scrubber** (§9.6): primäres Interaktionsmodell? Wie koppeln (Karte ↔ Profil ↔ Strip ↔ Detailkarte)? Mobile-first?
2. **Konfidenz sichtbar machen** (§15): wie elegant Unsicherheit zeigen, ohne zu verunsichern? (Bänder? Opazität? „±"? On-demand?)
3. **Layout-Hierarchie:** Was ist die „Haupt-Antwort"? (Vorschlag: *„Wann ist es entlang der Tour kritisch?"* — Niederschlag/Warnungen/Wind als Top-Layer, Rest auf Abruf.)
4. **Onboarding ohne Bewegungsart:** Soll vor der Auswahl schon ein Vor-Wetter (z. B. nur ortsbezogen) gezeigt werden? Oder hart führen?
5. **Desktop-Mehrspaltigkeit** vs. heutige einspaltige Stapelung.
6. **Strip vs. Profil vs. Tabelle:** Redundanz reduzieren — welche Darstellung ist die führende?
7. **„Beste Startzeit"-Hilfe:** Variation der Startzeit, um das beste Wetterfenster zu finden (verwandt mit dem Event-Feature) — eigene Mini-Ansicht?
8. **Höhenprofil als Wetter-Träger:** Wetter direkt aufs Höhenprofil legen (Temperatur-Gradient, Schneefallgrenze als horizontale Linie, Niederschlag als Overlay)?

---

## 23. Anhang — Glossar

- **Sample / Wetter-Punkt:** strategischer Stützpunkt der Tour, an dem Wetter berechnet wird.
- **ETA:** errechnete Ankunftszeit am Punkt (Basis fürs zeitaufgelöste Wetter).
- **Höhenkorrektur (Lapse-Rate):** Temperatur/Phase auf die echte Punkt-Höhe gebracht.
- **Cluster:** räumlich+höhlich gruppierte Samples mit einer gemeinsamen Wetter-Abfrage.
- **Nowcast (Radar):** minutengenaue Niederschlagsextrapolation für die nächsten Stunden.
- **NWP:** numerisches Wettermodell (Stundenwerte) jenseits des Radar-Horizonts.
- **Schneefallgrenze (snowLineM):** Höhe (m ü. M.), oberhalb der Niederschlag als Schnee fällt.
- **Föhn:** warmer, trockener Fallwind im Lee der Alpen — heuristisch erkannt.
- **MOSMIX / AROME / INCA / RADOLAN / TAWES / SMN:** Behörden-Modelle/Stationsnetze (DWD/GeoSphere/MeteoSwiss).
- **DIN 33466 / SAC-Gehzeit:** Standard-Formel für Wander-Gehzeiten (Referenz der Timing-Engine).

---

*Quelle der Angaben: aktueller Implementierungsstand der Module `route/*` und `pointForecast/*` (Mai 2026). Bei Detailfragen zu konkreten Feldern/Formaten kann das jeweilige Modul herangezogen werden.*
