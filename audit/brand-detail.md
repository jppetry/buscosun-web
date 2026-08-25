# Brand-Detailansicht — Diagnose BD0 + Umsetzung BD1 (2026-08-25)

> Jans Auftrag: „an der Detailansicht der Brände arbeiten, sodass alle wichtigen Informationen
> in der kleinen Kachel angezeigt werden und beim Klick dem Anwender übersichtlich alle
> Informationen zu dem Brand zur Verfügung stehen — vielleicht auch die zeitliche Ausbreitung,
> Ursache und die Wetterbedingungen kurz zusammengefasst zum Zeitpunkt des Brands."
> Ein Thema, eine Phase, ein Gate (**GBD1**). Funktionserhalt: nichts Bestehendes fällt weg,
> es wird umgruppiert und ergänzt.

## 1. Befund — was heute steht

**Kachel (Listenkarte, `FireFootprintPanel.tsx:359-440`).** Unmarkiert eine Prosa-Zeile
(„128 ha EFFIS · 12 Detektionen · vor 3 h"), darunter die Meta-Zeile (ΣFRP · Ausdehnung ·
Status · Tendenz · Beobachtung), Kontextsätze (Landbedeckung, EMS, Anlage), Chips (Methode,
Bewertung). **Erst im markierten Zustand** erscheinen zwei Kennzahl-Kacheln (Fläche,
Detektionen). Die Zahlen sind alle da, aber nicht auf einen Blick vergleichbar — die Liste
liest sich als Fließtext.

**Detailkarte (`FootprintDetail`, Zeilen 531-723).** Eine flache `<dl>` mit 22 Zeilen in der
Reihenfolge Kennung · Status · Fläche · Schätzung · Erst-/Letztdetektion · Hotspots · Konfidenz
· Methode · ΣFRP · FRP je Überflug · Tendenz · Beobachtung · Ausbreitung · FRE · Überflüge ·
Merkmale · Ort · Landbedeckung · Kartierung · EMS · GeoSphere · Verlauf (8 Überflüge als
Text). Vollständig, aber ohne Gliederung: Zeitliches, Räumliches, Bestätigung und Herkunft
stehen durcheinander; der Verlauf ist eine Textliste.

**Was fehlt, gemessen an Jans drei Wünschen:**

| Wunsch | Datenlage | Befund |
|---|---|---|
| Zeitliche Ausbreitung | `FireRecord.passes` (je Überflug ΣFRP, Pixel, Tag/Nacht, Schwerpunkt, Pixelfläche), `activity.spreadBearingDeg/DistanceM`, `freMaxGapH` | alles gerechnet, nur als Text; Konzept `docs/konzept-brand-feature.md` §5 C4 beschreibt den Chart bereits (Stufen/Balken, Lücken > 6 h schraffiert, **kein** interpolierender Linienzug) |
| Ursache | **keine Quelle.** EFFIS, FIRMS, GWIS und EMS führen keine Brandursache je Brand; amtliche Ursachenermittlung (Polizei, Forst) ist nicht maschinenlesbar; die BLE-Waldbrandstatistik ist ein Jahresaggregat | ehrlich sagen — und das nennen, was eine Einordnung erlaubt (Anlagenstandort TA3, Landbedeckung CORINE, EMS-Aktivierungsname) |
| Wetterbedingungen zum Zeitpunkt | live nichts: ICON-D2 im Brandradar deckt jetzt → +6 h, der Brand liegt bis 7 Tage zurück; `fireDayWeather` (BH4) nutzt Meteostat (**NC**, laut Konzept §1.4 nicht als Live-Quelle) und ERA5 (Archiv) | **gemessen 2026-08-25:** `api.open-meteo.com/v1/forecast` mit `models=icon_seamless&past_days=7` liefert die DWD-ICON-Stundenwerte der letzten 7 Tage (T, RH, Wind, Richtung, Böe, Niederschlag) — **9,4 KB** je Abruf; `daily=precipitation_sum&past_days=31` **826 B**. Derselbe Host wie `openMeteoForecast.ts` (in Betrieb), Lizenz in `scripts/seo/licenses.mjs` geführt (CC BY 4.0, nicht-kommerziell) — keine neue Quelle, ein neuer Parameter |

## 2. Entscheidungen (Defaults, ohne Rückfrage — Jan kann jede kippen)

- **D1 Wetterquelle:** Open-Meteo Forecast-API, `models=icon_seamless` (DWD ICON-D2/EU/global),
  `past_days=7` stündlich + `past_days=31` täglich. Nur auf Klick (Detail offen), einmal je Brand
  und Sitzung (30 min), **kein Netlify-Traffic**. Kennzeichnung „Modellwerte DWD ICON (Open-Meteo,
  2–13 km) — keine Messung". Fällt ein Teil aus, sagt es die Karte (`notes`), nie still.
- **D2 „Zeitpunkt des Brands"** = Stunde der **Erstdetektion** (FIRMS `firstMs`), dazu die Stunde
  der **letzten Detektion** und **jetzt**. Vortage: Niederschlag 24 h vor der Erstdetektion, Tage
  seit dem letzten Regentag (≥ 1 mm, dieselbe Schwelle wie BH4 `RAIN_DAY_MM`, Rückblick 30 Tage).
- **D3 Ursache:** eine feste Zeile „Ursache" mit dem Satz „keine Quelle" und den drei
  Einordnungshilfen (Anlage/Abweichung, Landbedeckung, EMS-Name). Keine Vermutung, kein
  Deep-Link auf Presse.
- **D4 Verlauf:** reines SVG (D-06), Balken ΣFRP je Überflug auf **log-Achse** (FRP p50 3 MW,
  max 373 MW), Beobachtungslücken > 6 h als schraffierte Streifen, ☀/☾ je Balken, Überflüge
  ohne FRP als Marke. Die Textliste bleibt darunter (Funktionserhalt).
- **D5 Kachel:** vier Kennzahlen **immer** (nicht erst markiert): Fläche · Detektionen · Stärke ·
  Tendenz — je Wert mit Untertitel (Herkunft / letzte vor X / Ausdehnung / Beobachtung). Meta-,
  Kontext- und Chip-Zeilen bleiben.
- **D6 Detail-Gliederung:** Kopf → Kennzahlen → **Verlauf** → **Wetterlage** → Einordnung &
  Bestätigung (inkl. Ursache) → Merkmale. Jede Zeile behält Art und Quelle.

## 3. Umsetzung BD1

| Datei | Änderung |
|---|---|
| `src/fire/detail/fireWeatherAtPoint.ts` (neu) | URL-Bau, pure Parser `parseFireWeather` (Stunde ≤ 90 min, 24-h-Summe, Regentage), Abruf mit Sitzungs-Cache, Beschriftungen, Selbstverifikation |
| `src/fire/detail/passTimeline.ts` (neu) | pure Geometrie des Verlaufs (Balken, Lücken, Achsen, log-Skala), Selbstverifikation |
| `src/fire/FirePassChart.tsx` (neu) | SVG-Komponente auf `passTimeline` |
| `src/fire/FireFootprintPanel.tsx` | Kachel mit vier Kennzahlen; Detail in Abschnitte, Wetterlage (lazy), Ursache |
| `src/fire/fireDeck.css` | Kennzahl-Raster, Abschnittsköpfe, Chart, Wetter-Kacheln (Desktop + Sheet) |
| `scripts/verify-fire-detail.mjs`, `package.json` | `verify:fire-detail` (netzfrei) |
| `docs/API.md` §8.7, `scripts/seo/licenses.mjs` | Endpunkt-Parameter und Ref |

## 4. Gate GBD1 — Belege

**Verifier.** `verify:fire-detail` **44/44** (Wetter-Parser 24 Checks an einer 72-h-Fixture: Stunde ≤ 90 min, 24-h-Summe
nur bei vollständiger Reihe, Brandtag-Summe, Regentage inkl. „länger als 30 Tage", Ausfälle als Sätze; Verlauf 12 Checks:
log-Skala, Lücken > 6 h, Nachlauf-Lücke bis jetzt, 24-h-Mindestfenster, Achsen-Ticks; Textsonden Panel/CSS/Doku).
`typecheck` grün, `npm run build` grün, `npm run budget`: eagerJs 101,5 / 106,5 · largestChunk 278,4 / 292,3 ·
**totalJs 980,5 / 1 017,7 KB** — alle Budgets eingehalten (Chart und Wettermodul liegen im Brandradar-Chunk, nicht im
Eager-Pfad). `verify:fire-model` 118/118.

**Browser (Chrome, Desktop 1600 px, Dev-Server).** (1) Liste: jede Kachel trägt die vier Kennzahlen mit Untertitel — z. B.
„147 ha · Obergrenze (Raster) | 14 · letzte vor 9 h | 29,5 MW · 0,5 km² Ausdehnung | stabil · 8 Überflüge"; Status-Zeile,
Kontext und Chips darunter wie vorher. (2) Klick „bei Hammelburg": Detailkarte mit Kopf (Name, Abzeichen, Region,
Koordinaten, Kennung) und den fünf Abschnitten; Chart mit einem Balken (14,3 MW ☀), schraffierte Nachlauf-Lücke „23 h",
gestrichelte Jetzt-Linie; Wetterlage live: „trockene Luft (RH 41 %) · Böen 23 km/h aus O · kein Regen in den 24 h davor",
Kacheln Erstdetektion 24.08. 14:00 (21,1 °C · RH 41 % · Wind aus O 14 km/h · Böen 23 km/h · 0 mm), Brandtag (Tmax 21,7 ·
RHmin 35 % · Böen max 29 · 3,9 mm), Vortage (0 mm / 1 Tag seit Regentag), Jetzt 25.08. 13:00; Ursache „keine Quelle … auch
keine Einordnungshilfe" (kein EFFIS, keine Anlage). (3) Zweiter Brand (51,69° N · 15,98° E, Abweichung): Netzwerk zeigt genau
die zwei Open-Meteo-Abrufe (hourly `past_days=7`, daily `past_days=31`, beide 200), „Anlage?"-Zeile und Ursache mit
Einordnungshilfe „nahe bekanntem Standort (Oddział Huta Miedzi „Głogów" …)". Konsole in allen Schritten ohne Fehler.

**Mobil (Chrome-DevTools-MCP, Viewport 500 × 769 ⇒ `is-mobile`, zweiter Anlauf nach „browser already in use").** Sheet „Brände":
jede Kachel mit den vier Kennzahlen in **zwei Spalten** (`grid-template-columns: 211,5 px 211,5 px` gemessen); Klick „bei
Aachen" öffnet die Detailkarte im Sheet — Kopf, Kennzahlen (einspaltig), Chart auf Sheet-Breite (417 px), Wetterlage live
(„feuchte Luft (RH 78 %) · Böen 25 km/h aus O · kein Regen in den 24 h davor", Kacheln Erstdetektion/Brandtag bis jetzt/
Vortage/Jetzt), Ursache, Merkmale; Bottom-Bar bleibt bedienbar. Konsole: nur Altbestand (EMS-CORS, 16 × 404 GeoSphere-
Warnkontext `wsapp/api/getWarningsForCoords`), nichts aus BD1. Emulation ist für WebGL nicht repräsentativ (CLAUDE.md) —
die Karte selbst war nicht Gegenstand dieser Phase. `verify:fire-clusters` steht
unverändert auf 105/117 (zwölf Textsonden auf seit RT1/TA/BH umbenannten Code); Nachpflege ist ein eigener Auftrag. Die
BP5-Sonde „ohne Detektion keine erfundene Leistung" bleibt grün — die Kachel sagt weiter „keine Leistung (keine Detektion)".

**Fünf Fragen.** (1) Funktionserhalt: jede Zeile der alten Detailkarte steht weiter drin (nur sortiert), die Kachel zeigt
mehr, nicht weniger; (2) Desktop: Layout unverändert bis auf die Kachel-Kennzahlen (Auftrag); (3) Touch-Ziele: Kachel-Button
und Schließen-Knopf unverändert; (4) Konsole sauber; (5) Long Tasks nicht gemessen (Prod-Preview offen — der Chart ist
≤ 40 SVG-Knoten je Brand, das Wettermodul parst ≈ 10 KB JSON).
