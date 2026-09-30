# Wetter-Dashboard (Umschalten Dashboard ⇄ Karte) — Phase DB, Diagnose und Konzept

> **Stand: 2026-09-30, Phase 2 (Umsetzung) fertig, uncommitted — Protokoll, Pixel-Diff, Tests, Latenz und Budget in §10.**
> Phase 1 (Analyse, 29.09.) steht unverändert in §0–§9. Auftrag: Dashboard-Ansicht neben der Wetterkarte, Werte primär
> aus der neuesten Stufe von buscosun Fusion, Alternativquellen nur von der Plattform, Umschalter mit Zustand in der URL,
> Karte ohne Neu-Initialisierung und ohne Render-Loop im Hintergrund.
> **Jans Entscheidungen 29.09. (Freigabe „starte phase 2"):** alle Empfehlungen E-DB-3…17 übernommen, Breakpoints 767/1279
> wie Vorlage (E-DB-1), Umschalter nach der Marke + mobil in der Schwebeleiste (E-DB-2), Zustände ohne Vorlage streng aus
> Bausteinen abgeleitet (E-DB-18) — §7. Offen bleiben nur Jans Gates in `MANUELLE-SCHRITTE.md` §25.
> Vorlagen: `reference/dashboard.dc.html` + `reference/{desktop,tablet,mobile}.png` + `reference/buscosun-mark.svg`.

## 0. Kurzfassung für Jan

1. **Neueste Fusion-Version ist eindeutig:** der Cube-Pfad mit Stufe `fs` (`defaultCubeIo()`, `src/pointForecast/cubeSource.ts:1718`;
   `pfFlags.ts:13`: alles außer `?pf=live` ⇒ Cube). Ausgabe `PointForecastV2` (`src/pointForecast/fusion/output.ts:29`):
   14 Größen je Stunde 0–336 h mit p10/p50/p90/σ, Verteilung, σ-Art, Konfidenz, Membern mit Gewicht, Flags und Setzungen.
   `src/fusion/` (Rasterfusion, „fusionV2") und der Live-Pfad (`getPointForecast` ohne `pointSource:'cube'`) sind **nicht**
   buscosun Fusion in der neuesten Form und werden vom Dashboard nicht benutzt — auch nicht als Rückfall.
2. **Abdeckung (88 Vorlagen-Parameter, §4, am Dokument gezählt):** 49 aus der Fusion (24 direkt, 25 abgeleitet — z. B.
   Tagesmaximum aus der Stundenreihe), 21 aus einer Alternativquelle der Plattform (11 aus `buscosun-data`, 10 aus bestehenden
   Pfaden von buscosun-web), **8 nicht verfügbar**, 10 reine Beschriftung/Zustand. Nicht verfügbar: **Sonnenscheindauer**,
   **Wind je Höhenniveau** (Schnitt und Tabelle), **Blitze 1 h** am Punkt, **Feuerwetter** (zurückgezogen), **Anker-Uhrzeit**,
   **„belastbar bis … h"** der Windrichtung samt Balken. Teilweise nicht verfügbar: Druck auf Meereshöhe, UV außerhalb DE und ab
   Tag 4, Schneegrenze ab 126 h, Gipfel ohne Station.
3. **Die Vorlage behauptet an sieben Stellen etwas, das die Plattform so nicht hat** (ERA5 als Member, „ICON-D2 42 %",
   „ICON-D2 2,2 km" im Schnitt, „48 h" im ICON-D2-Kasten, „CombiPrecip", Feuerwetter, CAMS-Pollen „überall"). Ehrlichkeit geht vor Pixeltreue —
   die Texte müssen der wahren Herkunft folgen (E-DB-13).
4. **Architektur (§5):** Dashboard als Ansicht **derselben Route** `/wetterkarte/<layer>[/<ort>]?ansicht=dashboard`
   (ein Routenwechsel würde `MapView` abbauen und `map.remove()` rufen, `MapView.tsx:2497-2514`). Eigener Lazy-Chunk
   `src/dashboard/`, Karte bleibt montiert und wird **explizit pausiert** (WindLayer ist der einzige Dauer-Loop,
   `WindLayer.ts:517-555`; eine öffentliche Pause gibt es nicht — E-DB-5).
5. **Blocker für Phase 2 sind Jans Entscheidungen**, vor allem: Breakpoints der Vorlage (768/1280) gegen die Repo-Regel
   (767/1439) — E-DB-1; Lage des Umschalters in der **Karten**ansicht (keine Vorlage, ändert Desktop-Pixel der Karte) — E-DB-2;
   Zustände Heute/7/14 Tage, Laden, Fehler, leer (keine Vorlage) — E-DB-18/§6; Werkzeug für den Pixel-Diff
   (Playwright ist weder Abhängigkeit noch als MCP verbunden) — E-DB-15.
6. **Ergebnis Phase 2 (30.09., §10):**
   - Das Dashboard steht als Lazy-Chunk hinter `?ansicht=dashboard`, mit Umschalter in beiden Ansichten und Zeitraum in der URL.
   - Die Karte bleibt beim Wechsel dasselbe Canvas und zeichnet hinter dem Dashboard **0** WebGL-Aufrufe.
   - Pixel-Diff: Kacheln ausgerichtet 0,1–7,9 %. Ausnahmen sind der Stundenverlauf (echte Zeitachse gegen schematische Vorlage) und der Fuß; jede Abweichung ist begründet.
   - Tests: `verify:dashboard` 56/56, `verify:dashboard-switch` 26/26.
   - Latenz Desktop 1,5 s ✓; **mobil-4G 4,7 s ✗** (Karten-JS auf demselben Weg, E-DB-20).
   - **eagerJs +37 B über der Ratsche** (E-DB-19).

## 1. Auftrag und Regeln, die hier greifen

- Vorlagen verbindlich; wo sie schweigen: nichts erfinden, Lücke nennen (§6).
- Werte: Fusion (neueste Stufe) → sonst `buscosun-data` (inkl. `point/`) → sonst bestehende Datenpfade von buscosun-web →
  sonst **„nicht verfügbar"**. Keine neuen externen Quellen, keine Schätzung, kein stiller Rückfall.
- Herkunft jedes Werts im Code und in der Doku nachvollziehbar (§5.4: eine Herkunftstabelle im Code, die diese Matrix trägt).
- Repo-Regeln (CLAUDE.md): Funktionserhalt; Desktop-Regression = Phase fehlgeschlagen; Breakpoints 767/1439;
  Flag-Gating neuer Pfade; STOPP & FRAGEN bei Fusion-Engine, WebGL-Pipeline, Edge Functions, neuen Abhängigkeiten;
  Warn-Layer-Sonderregel (Warntext **nur wörtlich**, `docs/API.md` §7); Design-Standard Command-Deck (D-27);
  Latenzziele der Punktabfrage (`audit/fusion-implementierung.md` §6: kalt p50 < 2,0 s / p95 < 5,0 s, warm < 0,5 s,
  Mobil-4G zählt die **erste Darstellung**, Jan 18.09.).

## 2. Inventar `reference/`

### 2.1 Dashboard-Vorlagen (neu, uncommitted)

| Datei | Inhalt | Maße |
|---|---|---|
| `dashboard.dc.html` | Quelle aller drei Größen („Sand-Bento · Dashboard mit Prognose-Zone"), Zustand **„3 Tage"**, Ort Garmisch-Partenkirchen 708 m, Mi 16.09. 14:07 | Artikel `#vd` 1440 px, `#vt` 1024 px, `#vm` 402 px |
| `desktop.png` | Render von `#vd` bei DPR 2 | 2880×3718 = **1440×1859** CSS-px |
| `tablet.png` | Render von `#vt` bei DPR 2 | 2048×4938 = **1024×2469** |
| `mobile.png` | Render von `#vm` bei DPR 2, **mit iOS-Statusleiste** (14:07, 44 px) und 36-px-Geräteradius | 804×8408 = **402×4204** |
| `buscosun-mark.svg` | Logo-Marke (24 px Desktop/Tablet, 22 px Mobile) | — |

Gemessen: alle drei PNG haben transparente Ecken (Rahmen-Radius 16 px bzw. 36 px) und den 1-px-Rahmen `#E0D6BE` —
sie sind Aufnahmen einer **Karte auf einer Design-Leinwand**, nicht einer Seite. `desktop.png`, `tablet.png`, `mobile.png`
lagen vorher als Karten-Vorschauen vom Juli im Repo (Commit `fc67d42`) und sind im Arbeitsbaum durch die Dashboard-Renders
ersetzt (`git diff --stat reference/`); kein Dokument verweist auf die alten Fassungen (Grep über `*.md`).

Die Vorlage nennt selbst: Desktop **≥ 1280 px**, Tablet **768–1279 px**, Mobile **< 768 px**; „Alle Diagramme später mit Nivo
(`@nivo/line`, `@nivo/bar`)"; Schrift im Inhalt ausschließlich **League Spartan** (IBM Plex Mono und Inter Tight nur im
Leinwand-Kopf außerhalb der Artikel — geprüft per Grep). League Spartan 300–800 liegt selbst gehostet in `public/fonts/`
(`src/fonts.css`), es fehlt also keine Schrift.

### 2.2 Übrige Dateien in `reference/` (nicht Teil dieses Auftrags)

Vorlagen früherer Linien: `brandradar*.dc.html` + `br-detail-*` (BD2/BDM), `1a/1b/1c-*` (R3D), `desktop-*/mobile-*/tablet-*`
mit Nummern (Command-Deck-Redesigns Juli), `historie/modellvergleich/regenradar/routenplaner/vertikalschnitt/desktop/mobile/
tablet.dc.html`, `support.js` (Laufzeit der `.dc.html`-Leinwand), `ios-frame.jsx`, `README-brandradar-detail.md`.

### 2.3 Module der Vorlage (Reihenfolge Desktop, Raster)

| # | Modul | Desktop 1440 | Tablet 1024 | Mobile 402 |
|---|---|---|---|---|
| M0 | Kopfzeile: Marke · Umschalter **Dashboard/Karte** · Ortssuche „Ort · Höhe" · „Lauf 12Z · Anker Station 14:00" · „FUSION LIVE" | eine Zeile, 58 px | eine Zeile, ohne Laufzeile, Ortsname gekürzt „Garmisch-P." | Marke + FUSION LIVE / Suche volle Breite / Umschalter volle Breite (44-px-Ziele) / Laufzeile |
| M1 | Jetzt-Zeile: **Jetzt** · **Amtliche Warnung** · **Konfidenz & Quellen** | 3 Spalten 2,1fr/1,3fr/1fr | Jetzt volle Breite, darunter 2 Spalten | gestapelt |
| M2 | **Prognose-Zone**: Segment Heute/3/7/14 Tage, Zeitraum-Zeile, Konfidenz im Mittel; 3 Tageskarten (4 Tagesphasen + 3 Tageswerte + Konfidenzbalken); **Stundenverlauf** über den Zeitraum | 3 Karten nebeneinander | 3 Karten nebeneinander | Karten gestapelt, Segment volle Breite, Diagramm 150 px hoch |
| M3 | Detail-Kacheln: **Nowcast · Radar** · **Bewölkung 4 Schichten** · **Windrichtung · Reichweite** | 3 Spalten 1,25fr/1fr/1fr | Nowcast volle Breite, 2 Spalten darunter | gestapelt |
| M4 | **Terrain-Feld**: Schnitt ±20/±50 km, Temperaturschichtung, Isothermen, Schneegrenze, Windvektoren, Gipfel, Ort; Tabelle **Je Höhenstufe**; **Ablesung** | Schnitt + 268-px-Spalte rechts | Schnitt, darunter Tabelle + Ablesung 2-spaltig | Schnitt 760 px breit **seitlich wischbar**, Hinweis „Schnitt seitlich wischen · SW ← Ort → NO" |
| M5 | Stufe 2: **UV-Index** · **Pollen** · **ICON-D2-Layer** | 1fr/2fr/1fr | UV + ICON-D2 2-spaltig, Pollen volle Breite (8 Kacheln) | gestapelt, Pollen 4 × 2 |
| M6 | Quellenzeile (Fuß) | zentriert | zentriert | zentriert |

Interaktion laut Vorlage: nur die vier Zeitraum-Knöpfe tragen `cursor:pointer`. Hover-, Fokus-, Tooltip-, Lade-, Fehler- und
Leerzustände sind **nicht** gezeichnet (§6).

## 3. Parameterliste

Aus der Vorlage abgeleitet, Nummern P01–P88 werden in §4 und im Code (§5.4) benutzt. Beispielwerte der Vorlage in Klammern.

- **M0 Kopf:** P01 Ortsname (Garmisch-Partenkirchen) · P02 Ortshöhe (708 m) · P03 Lauf (12Z) · P04 Anker-Uhrzeit (14:00) · P05 Status „FUSION LIVE".
- **M1 Jetzt:** P06 Temperatur (18.1 °C) · P07 Wettersymbol · P08 Taupunkt (11.2 °C) · P09 rel. Feuchte (63 %) · P10 Wind (3.2) · P11 Böen (7.4) ·
  P12 Druck (1018 hPa) · P13 Windrichtung (SW · 228°) · P14 Bewölkung (35 %) · P15 Schneegrenze (2 100 m) · P16 T 925/850/700 hPa (18/13/2 °C) ·
  P17 Herkunftszeile „BrightSky · 4 Stationen".
- **M1 Warnung:** P18 Warntext wörtlich · P19 gültig bis · P20 Absender/Kanal („DWD CAP", „MeteoSchweiz via MeteoAlarm") · P21 Länderhinweis („AT offen").
- **M1 Konfidenz & Quellen:** P22 Konfidenz % (82 %) · P23 Einstufung („solide · Stunde 0") · P24 Gewicht je Quelle (ICON-D2 42 / MOSMIX 27 / Station 18 / ERA5 13 %).
- **M2 Kopf:** P25 Zeitraum (Mi 16.09. → Fr 18.09.) · P26 Modelle („ICON-D2 + MOSMIX") · P27 „Ensemble vollständig (< 78 h)" · P28 Konfidenz im Mittel (74 %).
- **M2 Tageskarte (je Tag):** P29 Tagesname/Datum · P30 Tagestext („heiter, später auflockernd") · P31 Tagessymbol · P32 Tmax/Tmin (21°/9°) ·
  Phasen MORGEN/MITTAG/ABEND/NACHT: P33 Symbol · P34 Temperatur · P35 Niederschlagswahrscheinlichkeit (10 %) · P36 Wind (2 m/s) ·
  P37 Böenhinweis („Böen 17") · P38 Hervorhebung einer Phase (ABEND) · Tageswerte: P39 Regen-Summe (0,2 mm) · P40 „max 15 %" ·
  P41 Wind max (17 m/s) + Richtung/Hinweis · P42 „Warnung aktiv" · P43 Sonnenscheindauer (8,4 h) · P44 UV (5) ·
  P45 Schneegrenze (1 650 m) + Tendenz („sinkt um 450 m") · P46 Konfidenz je Tag (86 %).
- **M2 Stundenverlauf:** P47 Temperaturlinie · P48 „Ensemble-Spread" · P49 Taupunktlinie · P50 Niederschlag mm/h (Balken, einer violett) ·
  P51 Tagesgrenzen + 6-h-Achse · P52 „Phasen-Segmente oben synchron" · P53 Kopf „72 h · Ensemble vollständig".
- **M3 Nowcast:** P54 „Trocken bis 16:40" · P55 Radarbalken je 5 min (einer violett), „jetzt"-Linie · P56 Horizont „0–2 h DE · 0–3 h AT" ·
  P57 Zellen · P58 Blitze 1 h · P59 Hagel (nur CH).
- **M3 Bewölkung:** P60 hoch/mittel/tief · P61 gesamt mit Quantilen · P62 Spanne „336 h".
- **M3 Wind:** P63 Windrose (Sektoren) · P64 aktuelle Richtung · P65 „belastbar bis 46 h @ 3 m/s, bis 229 h @ 12 m/s" · P66 Balken (31 %).
- **M4 Terrain:** P67 Schnittachse in Windrichtung · P68 Geländeprofil ±20/±50 km · P69 Temperaturschichtung (Farbverlauf) · P70 γ + „keine Inversion" ·
  P71 Isothermen 6/10/14 °C mit Höhe · P72 Schneefallgrenze im Schnitt · P73 Windvektoren je Niveau · P74 Gipfel/Stationen mit Name, Höhe, T ·
  P75 Ortsmarke (Ort · Höhe · T · Wind) · P76 Tabelle T je Höhenstufe · P77 Tabelle Wind je Höhenstufe · P78 Ablesung (Fließtext) ·
  P79 Hinweis Stationen außerhalb des Schnitts · P80 Kopfzeile „ICON-D2 2,2 km, höhenkorrigiert".
- **M5:** P81 UV heute/morgen/übermorgen · P82 Pollen 8 Arten, Region · P83 CAMS-Opt-in-Hinweis · P84 Gewitterpotenzial · P85 Rotation ·
  P86 Neuschnee 24 h · P87 Böen max · P88 Feuerwetter.
- **M6:** Quellenzeile (geht in §4 als Textpflicht ein, nicht als Wert).

## 4. Abdeckungsmatrix

Status: **F** = buscosun Fusion (v2), **F·abg** = aus Fusion-Werten abgeleitet (reine Rechnung, Regel in §5.4 festgeschrieben),
**A-data** = Alternativquelle in `buscosun-data`, **A-web** = bestehender Datenpfad in buscosun-web, **n. v.** = nicht verfügbar
(im Dashboard als „nicht verfügbar" gekennzeichnet), **UI** = Beschriftung/Zustand ohne Wetterwert.
Zeit: t1 = 0–48 h stündlich, t2 = 51–120 h dreistündlich, t3 = 126–336 h sechsstündlich (Cube-Stufen, `src/point/cubeFormat.ts:480-493`);
dazwischen markierte Interpolation, ab ≈ 318 h Klimatologie-Schwanz (`cubeSource.ts:1320-1396`).

### 4.1 Kopf und Jetzt-Zeile

| P | Vorlagen-Element | Fusion? | Alternativquelle (Pfad) | Auflösung / Vorlauf | Status |
|---|---|---|---|---|---|
| P01 | Ortsname in der Suche | — | Ort aus der URL (`src/share/placeTable.ts:94` `resolveRoutePlace`) bzw. Nominatim `geocodeDACH` (`src/geocode.ts:23`) | — | UI |
| P02 | „708 m" | ja: `v2.point.hTrue` (Terrarium z11, bzw. MOSMIX-Stationshöhe bei ≤ 250 m, `src/point/client/resolve.ts`) | — | fest | F |
| P03 | „Lauf 12Z" | ja: `v2.provenance.runs.t1.run` | — | je Abfrage | F |
| P04 | „Anker Station 14:00" | **nein**: Anker-Member trägt keine Messzeit; `fetchCubeObs` setzt `validAtMs = Date.now()`, weil die Adapter keinen Zeitstempel liefern (`cubeSource.ts:1703-1704`, `brightSkyCurrent.ts:74-113`) | — | — | **n. v.** (V-DB-2) |
| P05 | „FUSION LIVE" | ja: Cube-Pfad hat geantwortet (`cube.v2` vorhanden); Stufe `fs` ist in `provenance.notes` benannt (V-DB-9) | — | je Abfrage | F·abg |
| P06 | Temperatur jetzt | ja: `t2m` Schritt 0 (mit Messanker) — **oder** roher Messwert, E-DB-6 | Messwert: BrightSky `/current_weather` (`src/sources/brightSkyCurrent.ts:129`, DE), TAWES (`geosphereTawes.ts:65`, AT), SMN (`meteoSwissSmn.ts:221`, CH) | Stunde 0 | F |
| P07 | Symbol jetzt | ja, abgeleitet aus `clct`, `precip`, `pSnow`, Sonnenstand | — | Stunde 0 | F·abg (Symbolregel fehlt, §6) |
| P08 | Taupunkt | ja: `td2m` | — | Stunde 0 | F |
| P09 | rel. Feuchte | ja: `rh` (aus T/Td, `sigmaKind:'derived'`) | — | Stunde 0 | F |
| P10 | Wind | ja: `wind` | — | Stunde 0 | F |
| P11 | Böen | ja: `gust` | — | Stunde 0 | F |
| P12 | Druck „1018 hPa" | **nur Stationsdruck** `ps` an h_true (in 708 m ≈ 935 hPa, nicht 1018) | MSL: nicht im Cube; BrightSky `/current_weather` liefert `pressure_msl`, der Adapter liest es nicht | Stunde 0 | F mit anderer Bedeutung — **E-DB-7** |
| P13 | „Wind SW · 228°" | ja: `windDir` (p50; `null` unter der Konzentrationsschranke, `fuse.ts:628-652`) | — | Stunde 0 | F |
| P14 | Bewölkung | ja: `clct` | — | Stunde 0 | F |
| P15 | Schneegrenze | ja: `snowline` (Cube `snowlmt`, ohne Schmelzversatz) | — | t1/t2; **t3 ohne Quelle** | F |
| P16 | T 925/850/700 hPa | nicht in v2 | Cube-Ebenen `t925/t850/t700` im selben Bündel (`buscosun-data/point/<lauf>/t1/…`, `readPoint.ts:164`); t925 in t1 nur an 35/49 Schritten (ICON-D2 ohne 925) | t1–t3 | **A-data** (Durchreichung E-DB-8) |
| P17 | „BrightSky · 4 Stationen" | ja: Anker-Member `anchor.sources/pairs` | — | Stunde 0 | F |
| P18 | Warntext wörtlich | — | DE: DWD-CAP `fetchDwdWarnings` (`src/sources/dwdCapAlerts.ts:70`) + Punkt-in-Polygon `pointInRings` (`src/countryMask.ts:105`); CH: MeteoAlarm-CAP `fetchChWarnings` (`src/sources/meteoAlarmCh.ts:151`); AT: GeoSphere-Punktabfrage `fetchWarnContext` (`src/fire/sources/geosphereWarnContext.ts:140`, heute nur Brandseite) | aktuell | **A-web** (AT: E-DB-12) |
| P19 | „gültig bis" | — | `CapAlert.expiresMs` (`src/warnings/capAlerts.ts:96-143`), `validityText` (`warnField.ts:214`) | — | A-web |
| P20 | Absender/Kanal | — | `CapAlert.senderName` | — | A-web |
| P21 | „AT offen" | — | abhängig von E-DB-12 | — | UI |
| P22 | Konfidenz % | ja: `vars.*.confidence.score` je Schritt (T, Td, Wind, Böe, Wolken; **nicht** Niederschlag), kein Wahrscheinlichkeitsmaß (`uncertainty.ts:180-198`) | — | 0–336 h | F·abg (Größe/Mittel: E-DB-9) |
| P23 | „solide · Stunde 0" | Einstufung aus P22 | — | — | F·abg (Schwellen fehlen, §6) |
| P24 | Gewichte je Quelle | ja: `vars.*.members[].weight` + `steps[].members` (Produkte `cube-t1/t2/t3` = Mittel aus mehreren Modellen, `station` = MOSMIX, `nowcast`, `climatology`; Anker ohne Gewicht) | — | je Schritt | F — **Beschriftung der Vorlage passt nicht** (kein ERA5, kein „ICON-D2" als Member), E-DB-9 |

### 4.2 Prognose-Zone

| P | Vorlagen-Element | Fusion? | Alternativquelle | Auflösung / Vorlauf | Status |
|---|---|---|---|---|---|
| P25 | Zeitraum-Zeile | Kalender (Europe/Berlin) über `v2.axis` | — | — | UI |
| P26 | „ICON-D2 + MOSMIX" | ja: `provenance.runs.t1/t2/t3.models`, `runs.stations` | — | je Stufe | F |
| P27 | „Ensemble vollständig (< 78 h)" | ja: `sigmaKind === 'ensemble'` je Schritt | — | 0–336 h | F·abg (Definition fehlt, §6) |
| P28 | Konfidenz im Mittel | ja: Mittel von P22 über den Zeitraum | — | — | F·abg |
| P29 | Tagesname/Datum | Kalender | — | — | UI |
| P30 | Tagestext | abgeleitet aus `clct`/`precip`/`pSnow`-Verlauf; Bausteine `cloudDescription`/`precipDescription` (`PointForecastOverview.tsx:241-253`) kennen nur Einzelwörter | — | — | F·abg (**Textregel fehlt**, §6) |
| P31 | Tagessymbol | abgeleitet | — | — | F·abg (Symbolregel fehlt) |
| P32 | Tmax/Tmin | ja: Max/Min von `t2m.p50` über den Kalendertag | — | t1 stündlich; t2/t3 aus 3-/6-h-Schritten + markierter Interpolation | F·abg |
| P33 | Phasensymbol | abgeleitet | — | — | F·abg (Phasenfenster fehlen, §6) |
| P34 | Phasentemperatur | ja: `t2m` | — | wie P32 | F·abg |
| P35 | Phasen-Niederschlagswahrscheinlichkeit | ja: 1 − `pDry` der Hürden-Verteilung (`fusion/dist.ts:68`), stündlich | — | 0–336 h | F·abg (Aggregat in der Phase: E-DB-9/§6) |
| P36 | Phasenwind | ja: `wind` | — | — | F·abg |
| P37 | „Böen 17" | ja: `gust` | — | — | F·abg (Schwelle der Hervorhebung fehlt) |
| P38 | Hervorhebung ABEND | — | — | — | UI (Regel fehlt: „aktuelle Phase"?) |
| P39 | Regen-Summe | ja: Σ `precip.mean` über den Tag (Summe der Mittel = Mittel der Summe; Summe der p50 wäre falsch) | — | wie P32; t2/t3-Raten interpoliert ⇒ Flag | F·abg |
| P40 | „max 15 %" | ja: Max von P35 | — | — | F·abg |
| P41 | „Wind max 17 m/s" | ja: `wind` **oder** `gust` — die Vorlage beschriftet „Wind max" und zeigt den Böenwert der Warnung (17) | — | — | F·abg (E-DB-9) |
| P42 | „Warnung aktiv" | — | Warnungen aus P18 mit `onset/expires` im Tag | — | A-web |
| P43 | Sonne 8,4 h | **nein** (keine Strahlung/Sonnenscheindauer im Cube; MOSMIX `SunD1` wird nicht gelesen, `scripts/point/mosmix.mjs:54-65`) | BrightSky `/weather` liefert `sunshine` im bereits abgefragten Datensatz des Live-Pfads, der Adapter ignoriert das Feld (`sampleSources.ts:163-173`); nur DE sicher | — | **n. v.** (Optionen E-DB-10) |
| P44 | UV 5 | nein (`uvIndex: null` im Cube-Pfad, `cubeSource.ts:1457,1482`) | DWD-UV `fetchUvDailyForecast` (`src/sources/dwdUvForecast.ts:191`): nächster von 38 Orten, heute/morgen/übermorgen | Tagesmaximum, 3 Tage, **nur DE** | **A-web** (AT/CH und Tag 4+: n. v.) |
| P45 | Schneegrenze + Tendenz | ja: `snowline` | — | t1/t2; **ab 126 h keine Quelle** | F·abg (Anzeigeregel fehlt) |
| P46 | Konfidenz je Tag | ja: Mittel P22 | — | — | F·abg (Farbschwellen fehlen) |
| P47 | Temperaturlinie | ja: `t2m.p50` | — | 0–336 h | F |
| P48 | „Ensemble-Spread" | ja: `t2m.p10/p90` + `sigmaKind` | — | 0–336 h | F — **Vorlagen-Element unklar** (Fläche bis zur Achse + Schraffur statt Band), E-DB-9/§6 |
| P49 | Taupunktlinie | ja: `td2m.p50` | — | — | F |
| P50 | Niederschlagsbalken | ja: `precip.mean` (p50 der Hürde ist meist 0) | — | stündlich | F (Bedeutung der violetten Balken fehlt, §6) |
| P51 | Tagesgrenzen, Achse | — | — | — | UI |
| P52 | „Phasen-Segmente oben synchron" | — | — | — | UI (**in der Vorlage nicht gezeichnet**, §6) |
| P53 | „72 h · Ensemble vollständig" | wie P27 | — | — | F·abg |

### 4.3 Detail-Kacheln

| P | Vorlagen-Element | Fusion? | Alternativquelle | Auflösung / Vorlauf | Status |
|---|---|---|---|---|---|
| P54 | „Trocken bis 16:40" | Fusion nimmt den Radar-Nowcast als Member, gibt ihn aber nur stündlich aus | Radarbilder am Punkt aus demselben Bündel: `readNowcastPoint` (`src/point/client/nowcastPoint.ts:169`) über den Radar-Spiegel `buscosun-data/radar/img/v1/{rv,inca,rzc}/…` | DE RV 5 min 0–120 min; AT INCA 15 min bis 3 h; CH RZC nur Analyse | **A-data** (Schwelle „trocken" fehlt, §6) |
| P55 | Radarbalken, „jetzt"-Linie | wie P54 | wie P54 | wie P54 | A-data (Achse vergangen/künftig unklar, §6) |
| P56 | „0–2 h DE · 0–3 h AT" | — | Horizonte `RADAR_HORIZON_H` (`src/nowcast/precipSource.ts:48`) | — | UI |
| P57 | Zellen | — | KONRAD3D aus dem Radar-Spiegel `buscosun-data/radar/img/v1/konrad3d/<stempel>/cells.json` + `cellLocationRelevance` (`src/radar/cellPolygons.ts:421`) | 5 min, Zellprognose +60 min, DE-Radarverbund | **A-data** |
| P58 | Blitze 1 h | — | nur WMS-Kachel `dwd:Accumulated_Flash_Area` (`src/sources/dwdLightning.ts:15`), keine Punktabfrage | — | **n. v.** |
| P59 | Hagel (nur CH) | — | POH/MESHS `fetchSwissHail` (`src/sources/meteoSwissHail.ts:151`), Raster ohne Punktableser (reine Ablesung wäre zu bauen); Saison 1.4.–30.9. | Analyse | **A-web** (DE: KONRAD3D-Hagelflag, P57) |
| P60 | hoch/mittel/tief | ja: `clch/clcm/clcl` (roher Zellwert; `null` auf interpolierten Schritten) | — | t1–t3 | F |
| P61 | gesamt mit Quantilen | ja: `clct.p10/p50/p90` | — | 0–336 h | F |
| P62 | „336 h" | — | — | — | UI (Bezug zum gewählten Zeitraum unklar, §6) |
| P63 | Windrose | ja: Verteilung von `windDir.p50` über den Zeitraum | — | — | F·abg (Sektorzahl/Gewichtung fehlen) |
| P64 | aktuelle Richtung | ja: `windDir` Schritt 0 | — | — | F |
| P65 | „belastbar bis 46 h @ 3 m/s …" | teilweise: die Fusion gibt die Richtung je Stunde nur über der Konzentrationsschranke ν/σ ≥ 1 frei (`fuse.ts:1393-1411`) ⇒ „belastbar bis" = letzte Stunde vor der ersten Stunde ohne Freigabe (umgesetzt 29.09.); der **windstärkeabhängige** Teil („@ 3 m/s", „@ 12 m/s") hat keine Quelle und steht als „n. v." | — | 0–336 h | F·abg (Windstärke-Teil n. v.) |
| P66 | Balken 31 % | Anteil von P65 am Horizont 336 h (Regel gesetzt; die Vorlage definiert den Balken nicht) | — | — | F·abg |

### 4.4 Terrain-Feld

| P | Vorlagen-Element | Fusion? | Alternativquelle | Auflösung / Vorlauf | Status |
|---|---|---|---|---|---|
| P67 | Schnittachse „SW → NO durch die Fahrtrichtung des Windes" | ja: `windDir` Schritt 0 | — | — | F (Achse bei `windDir = null` ungeregelt, §6) |
| P68 | Geländeprofil ±20/±50 km | — | Terrarium-DEM `loadElevationLookup` (`src/fusion/elevation.ts:91`), `sampleElevations` (`src/route/enrichElevation.ts:152`) — dieselben Kacheln wie das Punktgelände der Fusion | ~ 76 m (z11) | **A-web** |
| P69 | Temperaturschichtung | abgeleitet aus P70 | — | — | F·abg |
| P70 | „γ 7,1 K/km · keine Inversion" | teilweise: Flag `inversionBody` in v2; γ selbst ist Cube-Ebene `gammaEff` (+ `zInv`, `dTInv`), **nur t1**, nicht in v2 | Cube-Profil-Ebenen im selben Bündel (`buscosun-data/point/`, `cubeFormat.ts:272-313`) | t1 stündlich | **A-data** (Durchreichung E-DB-8; die **Vorlage** rechnet γ aus Ort gegen Zugspitze: (18,4 − 2,4)/(2 964 − 708) = 7,1 K/km — E-DB-11) |
| P71 | Isothermen mit Höhe | abgeleitet: Höhe = h_Ort + (T_Ort − T_iso)/γ (die Vorlage schreibt selbst „Höhe aus γ gerechnet") | — | — | F·abg (Zulässigkeit E-DB-11) |
| P72 | Schneefallgrenze im Schnitt | ja: `snowline` | — | t1/t2 | F |
| P73 | Windvektoren je Niveau | **nein** (kein Wind auf Druckflächen im Cube) | ICON-EU-Sounding `fetchSoundingAtPoint` (`src/sources/iconEuSounding.ts:150`) hat U/V auf 10 Flächen, kostet aber ≈ 40 Dateien / ≈ 40 MB je Punkt (Kopfkommentar dort) — mit dem Latenzziel unvereinbar; das Potenzgesetz der Atmosphäre-Seite (`crossSection.ts`, α 0,2) ist eine Annahme = Schätzung | — | **n. v.** (E-DB-11) |
| P74 | Gipfel/Stationen mit Name, Höhe, T | — | Namen + Höhen nur für **Stationen** im MOSMIX-Katalog (`buscosun-data/point/stations/catalog.json`, 3 071 Stationen; `nearestStations`, `src/point/client/stationPoint.ts:73`), T dort aus dem MOSMIX-Stationsprodukt oder der Messung; **kein Gipfel-Gazetteer** (Wank existiert im Code nicht) | — | **A-data** für Stationen, **n. v.** für Gipfel ohne Station |
| P75 | Ortsmarke | ja: `hTrue`, `t2m`, `wind`, `windDir` | — | — | F |
| P76 | T je Höhenstufe | abgeleitet aus T_Ort und γ (ein Gradient, so beschreibt es die Vorlage) | — | — | F·abg (Zulässigkeit E-DB-11) |
| P77 | Wind je Höhenstufe | nein | wie P73 | — | **n. v.** |
| P78 | Ablesung (Fließtext) | aus P67–P77 zusammengesetzt | — | — | F·abg (**Textregel fehlt**; Aussagen über Wind in der Höhe entfallen mit P73) |
| P79 | „… liegen außerhalb des Schnitts" | — | Abstand der Katalogstationen zur Schnittachse | — | A-data |
| P80 | „ICON-D2 2,2 km, höhenkorrigiert" | — | — | — | UI — **Text falsch** für den Cube (t1 = Mittel mehrerer Modelle auf 0,05°); E-DB-13 |

### 4.5 Stufe 2

| P | Vorlagen-Element | Fusion? | Alternativquelle | Auflösung / Vorlauf | Status |
|---|---|---|---|---|---|
| P81 | UV heute/morgen/übermorgen, „38 Vorhersageorte" | nein | DWD-UV (`dwdUvForecast.ts:191`) | Tagesmaximum, 3 Tage, **nur DE** | **A-web** (Farbskala fehlt) |
| P82 | Pollen 8 Arten, Region | nein | DWD-Pollen `fetchPollenForecast` (`src/sources/dwdPollen.ts:125`), 21 Teilregionen (nächster Schwerpunkt) | Index 0–6, heute/morgen/übermorgen, **nur DE** | **A-web** (drei Tage je Art: Darstellung fehlt; Farbskala fehlt) |
| P83 | „CAMS-Opt-in aus · 6 Arten, 4 Tage, überall" | nein | Open-Meteo/CAMS `fetchOpenMeteoPollen` (`src/sources/openMeteoPollen.ts:84`) hinter `src/optIn.ts` — im Code **nur AT/CH** | — | UI — nur Hinweis (Text „überall" stimmt nicht: im Code AT/CH; kein Schalter in der Vorlage) |
| P84 | Gewitterpotenzial „gering" | nein | ICON-D2-Repack `buscosun-data/runs/<lauf>/thunder-*.png` (Index 0–100, `scripts/lib/repackManifest.mjs:105-117`) über `repackSource.ts`; ein Punkt-Ableser muss gebaut werden (Muster `TemperatureSampler`, `src/temperatureLabels.ts:342`) | bis 12 h | **A-data** (Wortschwellen fehlen) |
| P85 | Rotation | nein | Repack `rotation` | 1–12 h | A-data |
| P86 | Neuschnee 24 h | nein | Repack `snowfresh-*` (cm) | 1–24 h | A-data |
| P87 | Böen max | ja: `gust` (Fusion) | Repack `gust` (ICON-D2 roh) | ≤ 24 h | A-data laut Vorlagentitel — doppelt zur Fusion, E-DB-13 |
| P88 | Feuerwetter „niedrig" | nein | **zurückgezogen** (CLAUDE.md, `src/fire/fireModel.ts:58-70`); `fireWeather` („Feuerwetter-Treiber", Brandseite) ist kein Index | — | **n. v.** (E-DB-13) |

### 4.6 Zählung und Pflichttexte

- Gezählt am Dokument (letzte Spalte je Zeile, 88 Zeilen, keine Dublette): **F 24 · F·abg 25 · A-data 11 · A-web 10 · n. v. 8 · UI 10.**
  Mischfälle zählen nach ihrem Hauptstatus: P12 als F (MSL n. v.), P15/P45 als F (ab 126 h n. v.), P44/P81 als A-web (außerhalb DE
  n. v.), P74 als A-data (Gipfel ohne Station n. v.).
- **Titel mit falscher Behauptung** (Text muss der Herkunft folgen): „ERA5" (Konfidenz-Kachel und Fuß — die Klimatologie ist
  `climaGrid.json` aus Meteostat-Stationen, `src/ml/_buildClimaGrid.ts:1-25`, bzw. `point/static/clima/v1`), „ICON-D2 42 %"
  (Member ist das Stufenmittel), „ICON-D2 2,2 km" (P80), „48 h" im ICON-D2-Kasten (Repack-Familien des Kastens reichen 12–24 h), „CombiPrecip" (tatsächlich RZC),
  Feuerwetter, CAMS-Pollen „überall" (im Code nur AT/CH, P83). Die Quellenzeile muss zusätzlich C-LAEF (GeoSphere), ICON-CH1/CH2 (MeteoSchweiz), ICON-EU/global, AICON und
  IFS/AIFS nennen, die der Cube wirklich trägt (`buscosun-data/point/sources.json`).

## 5. Architekturvorschlag

### 5.1 Routing und URL-Zustand

- **Dieselbe Route.** Das Dashboard ist eine Ansicht von `/wetterkarte/:layer?/:ort?`. Ein eigener Pfad (`/dashboard`) hieße
  Routenwechsel ⇒ `MapView` wird abgebaut (`WetterkarteRoute.tsx:19-20`, Cleanup `map.remove()` in `MapView.tsx:2497-2514`).
- **Zwei neue Query-Schlüssel, lesbar und mit implizitem Standard** (SH-Zielbild, `architecture.md` §15.2):
  `ansicht=dashboard` (Standard `karte`, wird nicht geschrieben) und `zeitraum=heute|7-tage|14-tage` (Standard `3-tage` laut
  Vorlage, wird nicht geschrieben). Beispiel: `/wetterkarte/wind/garmisch-partenkirchen?ansicht=dashboard&zeitraum=7-tage`.
  Alle übrigen Schlüssel (`t`, `land`, `modell`, `mode`, `radar`, Kamera, Layer im Pfad) bleiben unverändert stehen ⇒ Zustand
  bleibt beim Wechsel in beide Richtungen erhalten.
- **Wie sie in die URL kommen (E-DB-3):** Empfehlung für Phase 2 — als **durchgereichte Schlüssel** (`parsed.extra`,
  `urlState.ts:303/399`), gelesen und geschrieben nur im Lazy-Chunk `WetterkarteRoute`. Damit bleibt `urlState.ts` (eager,
  eagerJs steht mit 107,9 KB exakt an der Ratsche) unberührt, und das Bündel der Edge Function
  (`netlify/edge-shared/shareParser.js`, byteweise von `verify:share` geprüft) muss nicht neu gebaut werden. Die Vorschau eines
  geteilten Dashboard-Links zeigt dann die Karte des Layers — Titel „Dashboard" in der Vorschau wäre ein Edge-Eingriff (Jans Gate).
- **Verlauf:** Umschalten ⇒ `navigate` (push) ⇒ Browser-Zurück kehrt zur vorigen Ansicht zurück (dieselbe Unterscheidung
  eigener/fremder Navigation per `loc.key`/`lastWrittenRef`, `WetterkarteRoute.tsx:103-118`). Zeitraumwechsel ⇒ `replaceState`
  wie die Stunde (`:133-146`). Ortswahl im Dashboard ⇒ derselbe `onSelectLocation`-Weg (push, `:216-220`).
- **Teilen:** Der Link trägt den vollen Zustand; `ShareButton` liest `window.location` (`shareOpen.ts:45`), durchgereichte
  Schlüssel sind nicht gesperrt (`SHARE_BLOCKED_KEYS`, `shareSchema.ts:68-71`). Die Vorlage zeigt im Dashboard **keinen**
  Teilen-Knopf (§6).
- **Geltungsbereich:** nur `/wetterkarte` (nicht `/warnungen`, nicht Regenradar), Dashboard ohne Ort: E-DB-4.

### 5.2 Komponenten (Lazy-Chunk `src/dashboard/`)

```
WetterkarteRoute (lazy, besteht)
├─ liest ansicht/zeitraum aus parsed.extra, schreibt sie zurück
├─ <MapView … suspended={ansicht==='dashboard'} />   ← erst montiert, wenn die Karte einmal gebraucht wird; danach nie abgebaut
└─ {ansicht==='dashboard' && <Suspense><DashboardView …/></Suspense>}   ← React.lazy(() => import('../../dashboard/DashboardView'))

src/dashboard/
  DashboardView.tsx        Seitenrahmen M0–M6, Raster je Breakpoint (E-DB-1)
  ViewToggle.tsx           Umschalter Dashboard|Karte (auch in der Kartenkopfzeile, E-DB-2) — klein, im Wetterkarte-Chunk
  useDashboardForecast.ts  buscosun Fusion: import('../pointForecast/cubeSource') + getPointForecast({pointSource:'cube', hours:336, onUpdate})
                           — KEIN Rückfall auf den Live-Pfad (Fehlerzustand statt stiller Legacy-Werte, E-DB-17)
  useDashboardExtras.ts    Alternativquellen, gestaffelt (§5.3)
  model/                   rein, headless prüfbar: days.ts, phases.ts, confidence.ts, windRose.ts, nowcast.ts,
                           profile.ts, warnings.ts, origin.ts (Herkunftstabelle P01–P88)
  tiles/                   NowCard, WarningCard, ConfidenceCard, ForecastZone (RangeTabs, DayCard, HourlyChart),
                           NowcastTile, CloudLayersTile, WindTile, TerrainField (Section, LevelTable, Readout),
                           UvTile, PollenTile, IconD2Tile, SourcesLine, Unavailable
  dashboard.css            Präfix .dbd-, Token-Namespace --dbd-* (D-27), Farben der Vorlage (Sand/Ink + dunkle Kacheln)
```

### 5.3 Datenfluss und Latenz

1. **Kritischer Pfad = Fusion allein.** Beim Ankommen mit `ansicht=dashboard` startet `WetterkarteRoute` den Fusion-Abruf
   **parallel** zum Laden des Dashboard-Chunks (sonst addieren sich Chunk-Ladezeit und Datenweg). Erste Ausgabe `first`
   (t1, 0–47 h) füllt Jetzt, Konfidenz, „Heute" und die ersten zwei Tage; `core` den ganzen Zeitraum; `update` Radar/Anker.
   Messlatte: die Werte der Punktabfrage — Desktop kalt erste Darstellung p50 779 ms, Mobil-4G 1 812 ms (§9.14 FI);
   mit Stufe `fs` (Dev-Server, Desktop kalt) first 2,1 s / core 2,5 s (`fusion-stationswert.md` §7). Ziel für das
   Dashboard: **dieselben** Zahlen, kein Zuschlag durch Nebenquellen.
2. **Zweite Staffel nach `first`:** Warnungen (DE-CAP-ZIP teilt den 60-s-Cache der Kartenebene; Größe in Phase 2 messen),
   UV-JSON, Pollen-JSON — klein, aber nie vor dem t1-Chunk.
3. **Dritte Staffel erst bei Sichtbarkeit (IntersectionObserver):** Terrain (zusätzliche z11-Kacheln entlang ±20/±50 km),
   ICON-D2-Kasten (Repack-PNGs je Familie und Stunde), KONRAD3D-Zellen, Hagel.
4. **Durchreichung aus dem Cube (E-DB-8):** `t925/t850/t700`, `gammaEff/zInv/dTInv`, Radarbilder liegen schon im Bündel der
   Fusion, sind aber nicht in `PointForecast` ausgewiesen. Empfehlung: additives, rein lesendes Feld in `CubePathSummary`
   (v2 bleibt byte-gleich, `verify:pv-cube` als Beleg) — berührt `cubeSource.ts` und ist damit Jans Gate. Alternative ohne
   Eingriff: zweites `readPointBundle` gegen denselben IndexedDB-Speicher (kein Netz, aber ein zweites Dekodieren).
5. **Stufe `fs` nicht blockierend:** fehlt `fusion.client.json` bei der ersten Ausgabe, rechnet die Abfrage ohne Lernstufe und
   schreibt das in `provenance.notes` (`cubeSource.ts:1889-1896`). Das Dashboard zeigt diese Notiz (Ehrlichkeit), statt „neueste
   Stufe" zu behaupten (V-DB-9).

### 5.4 Herkunft im Code

`src/dashboard/model/origin.ts` hält je Parameter P01–P88 `{ kind: 'fusion'|'fusion-derived'|'data'|'web'|'unavailable'|'ui',
source, path, rule }`. Jede Kachel holt Wert **und** Herkunft über diese Tabelle; „nicht verfügbar" ist ein eigener
Darstellungszustand (`<Unavailable reason=…/>`), nie eine Zahl. `verify:dashboard` prüft: jede Zeile dieser Matrix hat einen
Eintrag, kein `unavailable`-Eintrag rendert eine Zahl, kein Eintrag zeigt auf den Live-Pfad oder `src/fusion/`.

### 5.5 Diagramme

- `@nivo/line` (vorhanden, bisher nur im FireRoute-Chunk) für den **Stundenverlauf** (T-Linie, Td gestrichelt, Band p10–p90,
  Niederschlagsbalken und Tagesgrenzen als eigene Layer auf der **Zeitachse**) und den Radarverlauf.
- `@nivo/bar` nennt die Vorlage, ist aber **keine** Abhängigkeit — bewusst nicht (budget.json-Notiz 2026-09-09: jede fertige
  Balkenkomponente verlangt eine Band-Achse, die Zeitabstände zerstört). Neue Abhängigkeit = Jans Gate (E-DB-14).
- Windrose, Terrain-Schnitt, Wolkenschichten, UV-/Pollenkacheln: SVG/HTML wie in der Vorlage (Nivo hat dafür keine passende Form).

### 5.6 Karte pausieren, nicht neu initialisieren

- **Befund:** MapLibre rendert nur auf Anstoß; der einzige Dauer-Loop ist `WindLayer.scheduleParticleRepaint`. Er pausiert
  heute bei `document.hidden` oder Canvas außerhalb des Viewports (IntersectionObserver, `WindLayer.ts:524-555, 1252-1260`).
  Eine öffentliche Pause gibt es nicht; `FrameGovernor` ist ein reiner Regler ohne Pause. Eine `RepaintScheduler`-Klasse existiert
  **nicht** (nur in Audits erwähnt).
- **`display:none` reicht nicht sauber:** MapLibre misst dann `clientWidth || 400` und verkleinert auf 400×300
  (`maplibre-gl/src/ui/map.ts:3349-3384`), feuert `moveend` (Kamera-Schreiben in die URL) und der WindLayer verwirft Spuren.
- **Vorschlag (E-DB-5):** `MapView` bekommt `suspended`; dann (a) `.mdk-root` `visibility:hidden` + `inert` (Größe bleibt, kein
  Resize), (b) neue öffentliche `WindLayer.setSuspended(bool)` als dritter Eingang in `updatePausedState` (reines Scheduling wie P3,
  kein Shader), (c) laufende Wiedergabe (Play, 900-ms-Intervall) stoppen. Datenabrufe der Karte laufen weiter, damit sie beim
  Zurückwechseln aktuell ist (Netz, kein GPU-Loop) — oder ebenfalls pausieren, Jans Wahl.
- **Montage:** Ankommen direkt im Dashboard montiert die Karte **nicht**; sie entsteht beim ersten Wechsel und bleibt danach
  stehen. Spart dem Dashboard-Link MapLibre-Start und Wind-Daten.

### 5.7 Pixel-Diff und Prüfungen (Phase 2)

- **Werkzeug (E-DB-15):** Playwright ist weder Abhängigkeit (`package.json`) noch als MCP verbunden (Verbindungsfehler in dieser
  Sitzung). Vorschlag ohne neue Abhängigkeit: vorhandener CDP-Weg (`scripts/lib/cdpBrowser.mjs`, `headlessShot.mjs`) mit
  `deviceScaleFactor: 2` in 1440/1024/402 px Breite, Vergleich mit dem strengen PNG-Dekoder `scripts/lib/png.mjs`
  (Schwelle |ΔRGB| > 12 wie `audit/waldbrand-ui/map-pixel-parity.json`), Differenzbild je Größe und Aufschlüsselung je Modul.
- **Vergleichbar wird es nur mit den Vorlagenwerten:** ein Dev-only-Schalter speist eine Fixture mit exakt den Zahlen der
  Vorlage (Garmisch, Mi 16.09. 14:07) durch **dieselben** Komponenten; mit Live-Daten kann kein Balken pixelgleich sein.
- **Masken:** abgerundeter Leinwandrahmen + 1-px-Rahmen der Vorlage, iOS-Statusleiste (44 px) und Geräteradius der Mobil-Vorlage.
- **Erwartete Rest-Abweichungen:** Schrift-Rasterung (Google-Fonts-Fassung gegen selbst gehostete League Spartan), Nivo-Pfade gegen
  handgezeichnete Polylinien, alle Stellen aus §4.6 und alle „nicht verfügbar".
- **Tests Umschalter** (`verify:dashboard-switch`, CDP gegen `vite preview`): Zustand bleibt (Ort, `t`, `land`, `modell`, Layer);
  URL trägt `ansicht`; Zurück/Vorwärts; frischer Tab mit Teilen-Link öffnet das Dashboard; **keine Neu-Initialisierung**
  (Markierung am Canvas-Element überlebt den Hin- und Rückweg); **kein Render-Loop** (per `addScriptToEvaluateOnNewDocument`
  gezählte WebGL-Draw-Aufrufe über 5 s Dashboard = 0 außer Daten-Anstößen); eagerJs unverändert (Textsonde auf `index-*.js`).
- **Rein:** `verify:dashboard` (Modell, Herkunftstabelle, URL-Schlüssel, Rundlauf) mit Fixtures aus `scripts/lib/pvCubeFixtures.mjs`.

## 6. Vorlagen-Lücken (die Vorlage schweigt — nichts wird erfunden)

1. **Zustände:** Laden (je Staffel), Fehler (Cube-Pfad scheitert; einzelne Nebenquelle scheitert), leer (keine Warnung — der
   Normalfall!; UV/Pollen außerhalb DE; kein Radar in CH), Darstellung von **„nicht verfügbar"**.
2. **Zeiträume:** nur „3 Tage" ist gezeichnet. Heute (eine Karte? Stundenverlauf 24 h?), 7 Tage und 14 Tage (7/14 Tageskarten?
   Raster? t3 6-stündlich + Klimatologie-Schwanz ab ≈ 318 h) fehlen; ebenso der Standardzeitraum.
3. **Umschalter in der Kartenansicht** (Desktop-Kopfzeile und mobile Schwebeleiste von `MapView`) — keine Vorlage.
4. **Breiten:** 1280–1439 px und > 1440 px (volle Breite oder Maximalbreite?); Vorlagen-Breakpoints 768/1280 gegen Repo 767/1439.
5. **Interaktion:** Hover/Fokus/Tooltip auf Diagrammen und Kacheln, Tastatur, ±50-km-Zustand, Klick auf Tageskarte oder Phase.
6. **Regeln hinter gezeichneten Elementen:** Phasenfenster Morgen/Mittag/Abend/Nacht; welche Phase hervorgehoben wird; Symbolregel;
   Tagestext; Ablesungstext; Schwellen „solide", Konfidenzfarben (grün 86/74 %, ocker 61 %), Niederschlags-% (hell ≤ 5 %, dunkel,
   fett ≥ 65 %), Böenhervorhebung; Bedeutung der **violetten Balken** (Stundenverlauf und Nowcast); „Ensemble vollständig (< 78 h)";
   „trocken"-Schwelle; Zeitachse der Nowcast-Kachel (vergangen/künftig); wann „Schneegrenze" statt „Wind max" in der Tageskarte steht;
   Sektorzahl und Gewichtung der Windrose; Schnittachse ohne Windrichtung; UV- und Pollen-Farbskala (DWD-Stufen 0 … 3);
   drei Tage je Pollenart bei einer gezeichneten Kachel je Art; Kürzung „Garmisch-P." auf dem Tablet.
7. **Gezeichnet, aber ohne Element:** „Phasen-Segmente oben synchron" (Legende), „Ensemble-Spread" (Fläche bis zur Achse +
   Schraffur, kein Band).
8. **Navigation:** kein Teilen-Knopf, keine Feature-Leiste (Rail), kein Land/Modell-Wähler im Dashboard.
9. **Zahlenformat:** Jetzt-Kachel mit Punkt („18.1", „11.2 °C", „3.2 / 7.4"), alle anderen mit Komma.
10. **Mobile Geräteschale:** Statusleiste 14:07 und 36-px-Radius sind Gerät, nicht App.

## 7. Entscheidungen (Jan) — E-DB-1 … 18

**Entschieden am 29.09. (Jan, vor Phase 2):** E-DB-3…17 = Empfehlung übernommen („Alle übernehmen"); E-DB-1 = 767/1279
wie Vorlage; E-DB-2 = nach der Marke + mobil in der Schwebeleiste (Pixeländerung der Karte freigegeben); E-DB-18 = Zustände
ohne Vorlage streng aus den Bausteinen der Vorlage ableiten, als „ohne Vorlage" markieren, Screenshots zur Abnahme; E-DB-4
(Dashboard ohne Ort) fällt darunter. Die Spalte „Empfehlung" ist damit die umgesetzte Entscheidung.

| E | Frage | Empfehlung (= Entscheidung) |
|---|---|---|
| E-DB-1 | Breakpoints: Vorlage 768/1280, Repo-Regel 767/1439 | Dashboard intern 767 / 1279 mit Jans Ausnahme, nur im Dashboard-CSS; Karte unberührt |
| E-DB-2 | Umschalter in der **Karten**ansicht: Ort (Desktop-Kopf nach der Marke? mobil?) — ändert Desktop-Pixel der Karte | Gleiche Komponente direkt nach der Marke; Jan gibt die Karten-Pixeländerung frei |
| E-DB-3 | `ansicht`/`zeitraum` als durchgereichte Schlüssel (ohne Eager-/Edge-Eingriff) oder ins Schema (`urlState.ts` + Edge-Bündel) | Durchreichen; Schema später gemeinsam mit einer OG-Karte „Dashboard" |
| E-DB-4 | Nur `/wetterkarte`? Dashboard ohne gewählten Ort (Übersicht)? | Nur `/wetterkarte`; ohne Ort: Jan legt den Zustand fest |
| E-DB-5 | Kartenpause per `suspended` + `WindLayer.setSuspended` (MapView = Hochrisiko-Datei) statt `display:none`; Datenabrufe der Karte weiterlaufen lassen? | Ja; Abrufe weiter |
| E-DB-6 | Jetzt-Kachel: Fusion Stunde 0 (verankert) oder roher Messwert? Punkt oder Komma? | Fusion Stunde 0, Herkunft „Anker: n Stationen"; Komma |
| E-DB-7 | Druck: Stationsdruck `ps` (≈ 935 hPa) oder MSL (nicht verfügbar)? | `ps` mit Beschriftung „Druck am Ort"; MSL nur mit Adapter-Erweiterung |
| E-DB-8 | Cube-Ebenen (925/850/700, γ, Inversion, Radarbilder) aus dem Fusionslauf durchreichen (additiv in `cubeSource.ts`) oder zweites Lesen | Additiv, v2 byte-gleich belegt |
| E-DB-9 | Konfidenz (welche Größe/Mittel), Einstufung, Farbschwellen; Member-Beschriftung statt „ICON-D2/MOSMIX/Station/ERA5"; „Wind max" = Wind oder Böe; Band p10–p90 im Stundenverlauf statt der Fläche | T-Konfidenz; Member nach Produkt; „Böen max"; Band zeichnen |
| E-DB-10 | Sonnenscheindauer: n. v. / BrightSky-`sunshine` im bestehenden Abruf (DE) / MOSMIX `SunD1` ins Stationsprodukt (Producer, Daten-Repo) | n. v. in Phase 2; `SunD1` als eigene Etappe |
| E-DB-11 | Terrain: T je Höhe und Isothermen aus einem γ (abgeleitet) zulässig? γ aus Cube (`gammaEff`) oder aus Ort gegen Bergstation (Vorlagentext)? Wind je Niveau: n. v. / ICON-EU-Sounding auf Abruf (≈ 40 MB) / Wind auf Druckflächen in den Cube (Producer) | γ aus Cube, deutlich als Gradient beschriftet; Wind n. v. |
| E-DB-12 | Warnungen: AT über die vorhandene GeoSphere-Punktabfrage? mehrere Warnungen? keine Warnung? | AT ja (wörtlich, wie Brandseite); alle aktiven, höchste zuerst |
| E-DB-13 | Texte mit falscher Herkunft (ERA5, ICON-D2 2,2 km, 48 h, CombiPrecip, Feuerwetter, „überall"): wahrheitsgemäß ändern; Feuerwetter-Zeile streichen oder n. v.; „Böen max" doppelt zur Fusion | Ändern; Feuerwetter-Zeile als n. v.; Böen aus ICON-D2 lassen (Titel sagt es) |
| E-DB-14 | `@nivo/bar` als neue Abhängigkeit (Vorlagennotiz) | Nein — `@nivo/line` mit eigenen Layern |
| E-DB-15 | Pixel-Diff mit Playwright (neue Dev-Abhängigkeit) oder vorhandenem CDP-Weg | CDP-Weg |
| E-DB-16 | Budget: totalJs steht schon bei 1 451,2 > 1 438 (vor dieser Phase); Dashboard-Chunk kommt dazu | Ratsche je Etappe um den gemessenen Zuwachs (Muster E-F-21) |
| E-DB-17 | `mode=native`/`modell` im Dashboard ignorieren (bleiben in der URL); kein Rückfall auf den Live-Pfad bei Cube-Fehler | Ja |
| E-DB-18 | Standardzeitraum und Layout Heute/7/14 Tage | Vorlagen nachliefern |

## 8. Befunde (V-DB, D-28)

| V | Befund | Mehrwert | Skizze |
|---|---|---|---|
| V-DB-1 | `fetchDwdAlerts` (BrightSky `/alerts`) liest `headline/description/instruction` (`dwdAlerts.ts:44-63`); ob BrightSky diese Felder so liefert, ist unbelegt (am 29.09. keine aktive Warnung in DE zum Gegenprüfen), und der letzte Rückfall ist der **erfundene** Text `'Wetterwarnung'` (`:87`) — widerspricht der Zitatregel | Warnpanel zitiert sicher wörtlich | Bei der nächsten Warnlage Antwort mitschneiden, Fixture anlegen, Rückfall auf `event` statt erfundenem Text |
| V-DB-2 | Die Stations-Adapter liefern weder Messzeit noch Namen; `fetchCubeObs` nimmt `Date.now()` als Messzeit (`cubeSource.ts:1703-1704`) | Anker-Uhrzeit ehrlich anzeigbar, Anker-Paarung zeitgenau | Zeitstempel und Stationsname in `brightSkyCurrent`/`geosphereTawes`/`meteoSwissSmn` durchreichen |
| V-DB-3 | Veraltete Stellen: CLAUDE.md-Zeile FS „offen nur Commit/Push/Deploy" (HEAD `56066ae` enthält die Phase); `cubeSource.ts:1577` „nur hinter ?pf=cube"; Kopf von `PointForecastPanel.tsx`; `designTokens.css:167` „Google-Fonts" | Doku = Code | Beim nächsten Statuswechsel nachziehen |
| V-DB-4 | SEO-Text `src/seo/subRouteTexts.ts:56` nennt ICON-D2 + ICON-EU für den Vertikalschnitt; der Code rechnet aus Bodenwerten mit Potenzgesetz | Ehrlichkeit | Text an den Code anpassen |
| V-DB-5 | TAWES und SMN liefern Taupunkt, Druck, Sonnenschein, Schneehöhe; die Adapter fragen sie nicht ab bzw. parsen sie nicht | Gemessene Jetzt-Werte in AT/CH | Parameterliste der Adapter erweitern |
| V-DB-6 | CH-Stationen: der Punktpfad nimmt 80 alphabetisch statt räumlich (`sampleSources.ts:583`) | Nächste Station fehlt nicht mehr | Nach Abstand wählen |
| V-DB-7 | Budget totalJs 1 451,2 > 1 438 schon vor dieser Phase (`npm run budget` gegen `dist/` vom 29.09.) | Ratsche wieder grün | Jans Zahl nachtragen (E-FS-6) |
| V-DB-8 | Im Daten-Repo liegt ein verwaistes Verzeichnis `radar/img/v1/inca/20260920T0030.tmp-3300` auf `main`; der lokale Klon `C:\dev\buscosun-data` steht auf `5ea830a` (15.09.) | Aufräumen, Doku-Pfade stimmen | Spiegel-Workflow räumt `.tmp-*` ab; Hinweis in MANUELLE-SCHRITTE |
| V-DB-9 | Stufe `fs` wird je Abfrage bei der ersten Ausgabe entschieden und blockiert nie (`cubeSource.ts:1889-1896`) — kalt kann eine Abfrage ohne Lernstufe laufen | „Neueste Stufe" ist prüfbar statt angenommen | Im Dashboard die Notiz zeigen; ggf. zweite Ausgabe mit Stufe nachreichen |

## 9. Plan Phase 2 (nach Freigabe; je Etappe ein Gate) — umgesetzt 29./30.09., Protokoll §10

| Etappe | Inhalt | Gate |
|---|---|---|
| DB1 | Umschalter + URL (`ansicht`, `zeitraum`) + leerer Dashboard-Rahmen (Lazy-Chunk) + Kartenpause/Montage | `verify:dashboard-switch` grün; eagerJs 107,9 unverändert; Karte Desktop pixelgleich bis auf den freigegebenen Umschalter |
| DB2 | Datenmodell rein (`model/*`), Herkunftstabelle, Fixture der Vorlage | `verify:dashboard` grün |
| DB3 | Kacheln aus der Fusion (M0–M3 ohne Nebenquellen, Stundenverlauf) | Pixel-Diff 1440/1024/402 gegen die Fixture, Abweichungsbericht |
| DB4 | Nebenquellen gestaffelt (Warnung, UV, Pollen, Nowcast/Zellen/Hagel, ICON-D2-Kasten, Terrain) | Latenz erste Darstellung ≤ Punktabfrage (§5.3), Pixel-Diff vollständig |
| DB5 | Abnahme: fünf Fragen, Budget, Konsole, Long Tasks, Real-Device-Hinweis (V-FI-50 gilt auch hier) | Jans Abnahme |

## 10. Phase 2 — Umsetzung (29./30.09.2026, uncommitted)

### 10.1 Was gebaut ist

| Datei | Rolle |
|---|---|
| `src/dashboard/DashboardView.tsx` | Seite (Lazy-Chunk): Kopfzeile mit Suche/Umschalter/Status, gestaffeltes Laden (Fusion → Warnung/UV/Pollen → sichtbare Kacheln), Zustände ohne Vorlage, Vorlagen-Fixture nur im Entwicklungsmodus |
| `src/dashboard/ViewToggle.tsx` + `viewToggle.css` | Umschalter Dashboard \| Karte (Dashboard-Kopf, Karten-Topbar, mobile Schwebeleiste) |
| `src/dashboard/dashUrl.ts` | URL-Schlüssel `ansicht`/`zeitraum` (rein, Selbstprüfung) |
| `src/dashboard/origin.ts` | Herkunftstabelle P01–P88 (= Matrix §4, von `verify:dashboard` Zeile für Zeile abgeglichen) |
| `src/dashboard/model/{types,rules,build}.ts` | View-Model rein aus Fusion + Alternativquellen; alle gesetzten Regeln an einer Stelle |
| `src/dashboard/data/forecastStore.ts` | buscosun Fusion (Cube-Pfad, Stufe fs) ohne Rückfall auf den Live-Pfad, progressiv, ein Abruf je Ort |
| `src/dashboard/data/extras.ts` | Alternativquellen: Warnungen (DWD-CAP/MeteoAlarm/GeoSphere), UV, Pollen, Radar-Nowcast, KONRAD3D, Hagel, Gelände + Stationskatalog, ICON-D2-Repack |
| `src/dashboard/{tiles,ForecastZone,TerrainField,charts,icons}.tsx` + `dashboard.css` | Kacheln nach Vorlage; Diagramme auf `@nivo/line` mit eigenen Ebenen |
| `src/dashboard/fixture.ts` | Werte der Vorlage für den Pixel-Diff (nur `import.meta.env.DEV`, im Produktions-Bau nicht enthalten — Textsonde) |
| `src/router/pages/WetterkarteRoute.tsx` | Ansicht als Query-Schlüssel (push/replace), Karte erst bei Bedarf montiert und danach nie abgebaut, Vorabruf der Fusion |
| `src/MapView.tsx`, `src/map/mapDeck.css` | additiv: `suspended` (unsichtbar + inert, Wind-Loop an, Wiedergabe aus), `onOpenDashboard` (Umschalter), mobile Zeile + Pillen-/Chip-Versatz |
| `src/wind/WindLayer.ts` | additiv: `setSuspended()` als dritter Eingang in `paused` (reines Scheduling wie P3) |
| `src/pointForecast/cubeSource.ts` | additiv: `CubePathSummary.cells` (E-DB-8) und Re-Exporte (`exceedance`, `solarPosition`, `loadStationCatalog`, `nowcastSourcesFor`, `readNowcastPoint`), damit die Punkt-Module im Cube-Chunk bleiben |
| `scripts/verify-dashboard.mjs`, `scripts/verify-dashboard-switch.mjs`, `scripts/dashboard-pixel-diff.mjs`, `scripts/dashboard-latency.mjs` | Gates und Messwerkzeuge (§10.5–10.7) |

Ohne `?ansicht=dashboard` ist der Kartenpfad bis auf den Umschalter unverändert; `/warnungen` bekommt keinen Umschalter.

### 10.2 Gesetzte Regeln (die Vorlage zeigt, legt aber nicht fest — `model/rules.ts`)

| Regel | Wert | Herkunft |
|---|---|---|
| Tagesphasen | Morgen 06–12, Mittag 12–18, Abend 18–24, Nacht 00–06 des Folgetags | set |
| Phasenwerte | T = Mittel, Wind = Mittel, Wahrscheinlichkeit = Maximum der Stunden | set |
| Böen-Hervorhebung | Phase mit Böe ≥ 14 m/s zeigt „Böen N" und wird hervorgehoben (Vorlage ABEND) | literature (DWD-Warnkriterium Windböen) |
| Niederschlagswahrscheinlichkeit | P(> 0) = 1 − pDry der Fusions-Verteilung | Fusion |
| Farbe/Gewicht der Wahrscheinlichkeit | ≤ 5 % hell, sonst Stahl, ≥ 60 % fett | set (aus Vorlage) |
| Regen-Tag blau | ab 1 mm | set (aus Vorlage) |
| Symbole | ≥ 50 % ⇒ Regen (Tropfen nach mm/h < 1 / < 2,5 / sonst); Wolke < 20 / < 60 % | set (aus den 15 Symbolen der Vorlage) |
| Starker Niederschlag violett | ≥ 2,5 mm/h | literature (DWD-Stufe leicht/mäßig) |
| „trocken" | < 0,1 mm/h | literature (Nachweisgrenze) |
| Tagestext | Grundwort nach mittlerer Bewölkung 06–18 h, Schauer/Regen, kühler/wärmer (±3 K), Schneegrenze sinkt (≥ 300 m), später auflockernd/bewölkt (±25 %) | set (reproduziert die drei Texte der Vorlage) |
| Schneegrenze statt Böen | Regen ≥ 1 mm, Grenze < Ort + 1 000 m, keine Warnung | set (Vorlage Tag 3) |
| Konfidenz | Konfidenz-Index der Temperatur (`vars.t2m.confidence.score`); ≥ 70 % grün, sonst ocker; Wörter hoch/solide/mäßig/unsicher | set; der Index selbst ist Fusion und kein Wahrscheinlichkeitsmaß |
| Gewichtsleiste | Member × β, Klimatologie 1 − β (K-3) — zusammen 100 %; Beschriftung nach Produkt (z. B. „ICON-D2 +3", „MOSMIX", „Radar", „Klimatologie") | Fusion |
| Herkunft der Bandbreite | sigmaKind der Temperatur an Stunde 0 und bis wann ohne Wechsel („Streuung gelernt bis … h", „Ensemble vollständig (< … h)") | Fusion |
| „belastbar bis" | letzte Stunde vor der ersten Stunde ohne freigegebene Richtung; Balken = Anteil an 336 h; je Windstärke „n. v." | Fusion |
| Isothermen | Vielfache von 4 °C mit Rest 2, ≥ 150 m über dem Ort, < Achsenobergrenze − 150 m; bei Inversion keine | set (reproduziert 6/10/14 °C in 2 450/1 890/1 330 m) |
| T je Höhe | ein Gradient γ aus dem Modellprofil (`gammaEff`, t1); bei Inversion „n. v." | Cube-Ebene (E-DB-11) |
| Schnittachse | Windrichtung Stunde 0, sonst W → O (benannt) | Fusion / set |
| Stationen im Schnitt | Katalog, ≤ 3 km (±20) bzw. 5 km (±50) neben der Achse, max. 4 | set |
| UV-Farbe/-Höhe | WHO-Stufen, 12,5 % je Einheit | set |
| Pollenfarbe | DWD-Index 0 / ≤ 1 / ≤ 2 / 3 ⇒ neutral/grün/amber/rot; drei Tage je Art als Streifen | set |
| Gewitter-Wort | Viertel des Index 0–100 | set |
| Achsenmarken | Desktop 6 h an 02/08/14/20 Uhr (ab 7 Tagen 12 h, 14 Tage 24 h); mobil ≤ 5 mit Wochentag | set (Vorlage) |

### 10.3 Zustände ohne Vorlage (aus Bausteinen abgeleitet, E-DB-18 — zur Abnahme)

Laden („…" in der Farbe der Beschriftung, `aria-busy`), Fusion gescheitert (Jetzt-Kachel als Hinweis „nicht erreichbar … kein
Rückfall" + „Erneut versuchen"), keine Warnung (ruhige Warnkachel „Keine amtliche Warnung für diesen Ort." + Stand), Warnungen
nicht abrufbar (Hinweis, kein Ersatztext), kein Ort (eine Kachel „Kein Ort gewählt"), vergangene Phasen heute („n. v.",
Grund „vergangen"), Tage jenseits des Horizonts, UV/Pollen außerhalb DE, „nicht verfügbar" überall als „n. v." bzw.
ausgeschrieben mit Grund im Tooltip (`data-na`, `title`), Heute/7/14 Tage (dieselben Karten im selben Raster; 14 Tage = 14
Karten), Umschalter in der Karte (Desktop nach der Marke; mobil zweite Zeile der Schwebeleiste, Modell-Pille und Chip „Über
diese Ansicht" eine Zeile tiefer). Aufnahmen: `audit/dashboard/pixel/` (Fixture) und `audit/dashboard/states/`.

### 10.4 Pixel-Diff gegen die Vorlagen (`npm run dashboard:pixeldiff`, Bericht `audit/dashboard/pixel/report.json`)

Methode (§5.7, E-DB-15): CDP + `scripts/lib/png.mjs` (die Playwright-Anbindung dieser Sitzung war nicht verbunden; der
CDP-Weg fährt dasselbe Chromium aus `ms-playwright`), Dev-Server mit `?dbfixture=vorlage` (Zahlen der Vorlage durch dieselben
Kacheln), DPR 2, ganze Seite, |ΔRGB| > 12 ⇒ abweichend. **A** = Viewport exakt Vorlagenbreite (1440/1024/402), gleiche
Koordinaten; **B** = Innenfläche der Vorlagen-Leinwand (Breite − 2 px, 1-px-Rahmen und iOS-Statusleiste der Mobil-Vorlage
entfernt). Je Modul zusätzlich **ausgerichtet**: der senkrechte Versatz dy (css px, Suche ±200), bei dem die Vorlage am besten
passt, und die Abweichung dort — trennt „liegt tiefer, weil darüber ein Text anders umbricht" von „sieht anders aus".

| Größe | A ganze Seite | B Innenfläche | Seitenhöhe App / Vorlage (css px) |
|---|---|---|---|
| Desktop 1440 | 19,28 % | 15,04 % | 1 857 / 1 859 |
| Tablet 1024 | 19,35 % | 15,21 % | 2 505 / 2 469 |
| Mobile 402 | 32,93 % | 29,85 % | 4 130 / 4 204 (Vorlage mit 44 px Statusleiste) |

| Modul (B, ausgerichtet; dy in Klammern, wenn ≠ 0) | Desktop | Tablet | Mobile |
|---|---|---|---|
| Kopfzeile | 0,5 % | 0,1 % | 0,6 % |
| Jetzt · Warnung · Konfidenz | 1,1 · 1,6 · 1,0 % | 0,9 · 0,5 · 0,7 % | 0,7 · 2,0 · 0,8 % (dy 9) |
| Tageskarten (3) | 0,3–0,5 % | 0,5–0,6 % | 0,3–0,5 % (dy 10) |
| **Stundenverlauf** an der echten Position | **33,9 %** | **34,0 %** | **26,3 %** |
| Nowcast · Bewölkung · Wind | 3,3 · 1,5 · 3,1 % | 2,4 · 1,4 · 2,5 % (dy 0–4) | 4,4 · 1,9 · 2,6 % (dy 35–43) |
| Terrain-Feld | 4,6 % (dy 4) | 6,0 % (dy 9) | 7,9 % (dy 43) |
| UV · Pollen · ICON-D2 | 0,3 · 0,5 · 0,8 % (dy 46) | 0,2 · 0,4 · 0,6 % (dy 23) | 0,2 · 0,2 · 0,7 % (dy 96) |
| Quellenzeile | 22,2 % (dy 70) | 16,1 % (dy 35) | 14,9 % (dy 133) |

Lesart: Die Ganzseiten-Werte sind vom **senkrechten Versatz** getrieben (Desktop 46 px an der untersten Kachelreihe, Mobil bis
133 px am Fuß), nicht vom Aussehen der Kacheln — ausgerichtet liegen alle Kacheln außer Stundenverlauf und Fuß bei 0,1–7,9 %.
Beim Stundenverlauf findet die Suche einen Scheintreffer (dy −180/−169, 30,6/31,9/26,7 %); maßgeblich ist der Wert an der
echten Position.

**Verbleibende Abweichungen und ihr Grund** (Bilder: `*-A.png` = Aufnahme, `*-B-diff.png` = rot abweichend):

- *Entscheidungen (gewollt):* Komma statt Punkt in der Jetzt-Kachel (E-DB-6) · „DRUCK AM ORT" statt „DRUCK" (E-DB-7) ·
  „BÖEN MAX" statt „WIND MAX" und Band p10–p90 statt Fläche bis zur Achse, Legende „Temperatur + Bandbreite p10–p90"
  (E-DB-9) · Gewichtsleiste nach wahrem Produkt („ICON-D2 +3 · MOSMIX · Radar · Klimatologie") statt „… Station · ERA5"
  (E-DB-9/13) · Schnitt-Kopfzeile, ICON-D2-Titel, CAMS-Hinweis, Quellenzeile wahrheitsgemäß (E-DB-13) · Feuerwetter,
  Sonnenscheindauer, Wind je Niveau (keine Pfeile, Tabellenzeile „n. v."), Anker-Uhrzeit, windstärkeabhängige Reichweite:
  „n. v." (E-DB-10/11, V-DB-2) · Warn-Fuß nennt den Absender der Meldung statt „MeteoSchweiz via MeteoAlarm · AT offen";
  Warntext in der Schreibung des Originals (Zitatregel) · Rotation „keine" statt „—".
- *Vorlage schematisch, App datentreu:* Stundenverlauf mit echter Zeitachse — Tagesgrenzen an Mitternacht statt bei 1/3 und
  2/3, Marken 02/08/14/20 Uhr an ihrer Zeit statt gleichverteilt · Isothermen gerade (ein Gradient) statt gewellt · Ort in der
  Mitte des Schnitts (s = 0) · Windrose in 8 Sektoren à 45° statt 6 freier Keile · Balken an ihrer Zeit.
- *Darstellung:* Diagramme von `@nivo/line` in Pixel-Koordinaten statt eines mit `preserveAspectRatio="none"` verzerrten SVG
  (Strichstärken; mobil sind die Texte der Vorlage horizontal gestaucht, hier nicht) · Schrift-Rasterung (Vorlage: League
  Spartan von Google Fonts; App: selbst gehostet).
- *Leinwand/Gerät (nur A):* 1-px-Rahmen und Radius der Vorlagenkarte; iOS-Statusleiste und 36-px-Geräteradius (Mobil).
- *Seitenende:* +60 px unten (mobil +64), damit der globale Chip „Über diese Ansicht" (`RouteSeoBlock`, fest unten rechts)
  die Quellenzeile nicht überdeckt; mobil sitzt der Chip im Dashboard unten, in der Karte eine Zeile tiefer (Klassen am
  `body`, kein `:has`). Für den Diff ist der Chip ausgeblendet.

Zustände ohne Vorlage (E-DB-18) als Aufnahmen zur Abnahme in `audit/dashboard/states/`: 01 Laden · 02 Fusion gescheitert (CDN
gesperrt) · 03 kein Ort · 04 Heute · 05 7 Tage · 06 14 Tage · 07 Tablet live · 08 Mobil live · 09/10 Karte mit Umschalter
Desktop/Mobil · 11 Bern (CH: MeteoAlarm, SMN-Anker, POH) · 12 Wien (AT: GeoSphere-Warnungen).

### 10.5 Tests und Gates (Stand 30.09., Arbeitsbaum)

| Gate | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run build` (inkl. SEO-Shells, `verify-seo`, `verify-routing`) | grün, routing **241/241** |
| `verify:dashboard` (rein; echte Fusions-Form aus `pvCubeFixtures`) | **56/56**; mit `--dist` (Textsonde am Bau) **59/59**: kein Dashboard-Code im Start-Chunk, Fixture in keinem Chunk, Dashboard-Text in genau einem Lazy-Chunk; Herkunftstabelle Zeile für Zeile gegen die Matrix §4; GeoSphere-Kopie gegen das Original |
| `verify:dashboard-switch` (CDP, echter Browser) | **26/26** — u. a.: Karte → Dashboard behält Pfad und alle Schlüssel (Ort, Kamera, `radar`), push; **0 WebGL-Draw-Aufrufe in 3 s hinter dem Dashboard gegen 2 984 in 2 s auf der Karte**; Zeitraum per replaceState; zurück zur Karte **dasselbe Canvas-Element** (keine Neu-Initialisierung), Loop läuft wieder (3 120 Draws in 2 s); Zurück/Vorwärts; Teilen-Link öffnet das Dashboard mit 14 Tagen **ohne** die Karte zu montieren, erster Wechsel montiert sie; Kanonisierung ungültiger Werte; `/warnungen` ohne Umschalter; mobil 44-px-Trefferfläche; keine ungefangene Ausnahme |
| `verify:share` · `verify:wind-advection` · `verify:point-client` | 528/528 · 59/59 · 167/167 |
| `verify:pv-cube` | 337/338 — rot ist eine **Kostenprüfung** ((8) bzw. (9), wechselnd) unter Fremdlast der parallelen Sitzung; **Gegenprobe HEAD ohne diese Phase: ebenfalls 337/338**. buscosun Fusion ist unverändert (Diff `cubeSource.ts`: nur Zusammenfassung `cells` + Re-Exporte) |
| Karte Desktop 1440×900, HEAD-Bau gegen Arbeitsstand | Rail, Layer-Dock, Readout **0 abweichende Pixel**; Topbar rechts 0,05 %; Topbar links 23,25 % = der freigegebene Umschalter (E-DB-2) und die dadurch nach rechts gerückten Elemente |
| SEO-Shells (Vorlade-Hinweise) | alle Shells mit **denselben** `modulepreload`/`preload`-Einträgen wie HEAD — nach der Korrektur in `generate-seo.mjs` (s. V-DB-12) |
| Konsole Dashboard (Produktions-Bau) | keine Ausnahme, kein `console.error`; drei 404 der Slot-Suche im Radar-Spiegel (vorgesehenes Sondieren) |
| Budget | eagerJs **107,922 > 107,9** (E-DB-19) · totalJs 1 492,0 > 1 475 (Ratsche um den Zuwachs dieser Phase angehoben, Rest = Altlast, §10.6) |

### 10.6 Latenz und Budget (`scripts/dashboard-latency.mjs`, Produktions-Bau über `vite preview`, HEAD im Worktree, kalter Kontext je Lauf)

| Messung | Desktop | Mobil-4G (Fast 4G, 4× CPU) |
|---|---|---|
| Karte: erster WebGL-Draw, HEAD → Arbeitsstand, p50 | 780 → 794 ms (n = 5; 743–850 gegen 765–941) | 2 722 → 2 780 ms (n = 20 gepoolt; Lauf A 2 750 → 2 755, Lauf B 2 727 → 2 856) |
| Dashboard-Link: erste Fusions-Ausgabe p50 / p95 | **1 510 / 1 542 ms** | **4 721 / 4 764 ms** |
| Dashboard-Link: ganzes Fenster p50 | 1 510 ms | 5 457 ms |
| Übertragen je Dashboard-Link | 2,14 MB | 2,16 MB |

Karte: kein belastbarer Unterschied — gepoolt +58 ms (+2 %) bei ±100 ms Streuung desselben Baus zwischen zwei Läufen; der
Ladeweg hat dieselben 34 Chunks (+3,5 KB gz) und dieselben Vorlade-Hinweise. Eine erste Fassung mit `body:has(…)`-Regeln lag
mobil höher; die Regeln sind durch Klassen am `body` ersetzt.

Dashboard gegen die Ziele der Punktabfrage (fusion-implementierung §6: kalt p50 < 2,0 s, p95 < 5,0 s): **Desktop erfüllt,
Mobil-4G verfehlt p50 (4,7 s), erfüllt p95.** Aufschlüsselung mobil (n = 5): Route-Chunk 0,80–0,89 s → Dashboard-Chunk samt
Karten-JS 2,14–2,32 s → Fusionsstart 2,18–2,35 s → erste Ausgabe 4,51–4,76 s. Die Fusion selbst braucht ≈ 2,4 s wie im
Punkt-Panel; die ersten ≈ 2,3 s kostet das Karten-JS (MapView, MapLibre; Route-Chunks 513 KB), das das Dashboard als Ansicht
**derselben Route** (E-DB-3/5) mitlädt. Geprüft und verworfen: Fusions-Frühstart aus dem Vorlade-Modul des Routers — kein
messbarer Gewinn (die 2,2 MB teilen sich dieselbe 4G-Leitung) und Bytes im Start-Chunk ⇒ zurückgenommen. Der Wechsel Karte →
Dashboard in der App lädt kein Karten-JS nach. Option: **E-DB-20**.

totalJs 1 455,5 (HEAD) → 1 492,0 KB (+36,5): Lazy-Chunk `DashboardView` und der nun geteilte `@nivo/line`-Chunk (vorher im
FireRoute-Chunk). Die Ratsche steht auf 1 475 (Grenze 1 438 + Zuwachs dieser Phase, E-DB-16); die übrigen ≈ 17 KB über der
Grenze stammen aus früheren Ständen (E-FS-6, HDF5-Commit `cdc9a9b`) und sind nicht Teil dieser Anhebung. eagerJs 107,885 →
107,922 KB: Vite trägt jeden Chunk, den eine Lazy-Route statisch braucht, in die Vorladeliste `__vite__mapDeps` des
Start-Chunks ein — der neue geteilte `nivo-line`-Chunk steht dort für die Brandradar-Route (**E-DB-19**). Ein zweiter solcher
Eintrag (`geosphereWarnContext`) ist durch eine Kopie mit Wächter vermieden (`data/atWarnings.ts`). `buildDashboardVM` rechnet
in Node p50 2,6 ms / max 9,0 ms (3 Tage) bzw. p50 6,3 ms / max 27,3 ms (14 Tage) auf echter Fusions-Ausgabe.

### 10.7 Die fünf Fragen (CONTRIBUTING §3)

1. **Funktionserhalt:** ja. Ohne `?ansicht=dashboard` ist die Karte unverändert bis auf den Umschalter — Rail, Dock, Readout
   pixelgleich; Layer, Stunde, Modell, Kamera, Teilen, `/warnungen`, Punkt-Panel, SEO-Chip bleiben (Gates §10.5). Kein Code
   entfernt; `MapView`/`WindLayer`/`cubeSource` nur additiv, ohne die neuen Props im Verhalten wie vorher.
2. **Desktop pixelgleich:** Karte ja bis auf die freigegebene Topbar-Änderung (E-DB-2); Dashboard gegen die Vorlage §10.4.
3. **Touch-Ziele ≥ 44 px:** mobil Umschalter (sichtbar 32 px, Trefferfläche 44 — E2E geprüft), Zeitraum, Schnittlänge,
   Suchfeld, „Erneut versuchen" über `::after`-Erweiterungen ohne Bildänderung.
4. **Konsole sauber:** keine Ausnahme, kein `console.error` (§10.5); die 404 der Radar-Slot-Suche sind vorgesehen.
5. **Long Tasks > 200 ms:** in headless-shell nicht messbar (Projektlehre). Indiz: das View-Model rechnet ≤ 27 ms (max, 14 Tage,
   Node); der Cube-Pfad bleibt der bekannte Kandidat (V-FI-50, ≈ 300 ms mobil). **Real-Device offen (Jan).**

### 10.8 Neue Befunde (V-DB, D-28)

| V | Befund | Mehrwert | Skizze |
|---|---|---|---|
| V-DB-10 | Der Konfidenz-Index der Fusion ist das Produkt dreier Faktoren und dadurch in der Stufe fs klein (gemessen Garmisch 30.09.: Stunde 0 **6,4 %** = spread 0,30 · agree 0,38 · lage 0,57; Tagesmittel 1,1–19,5 %). Das Dashboard zeigt ihn wahrheitsgemäß mit der Einstufung „unsicher" — irritierend neben einer gut belegten Temperatur | Konfidenz sagt etwas über die Güte | Index für `sigmaKind: learned` neu definieren (Lern-σ gegen Klima-σ) oder geometrisches Mittel der Faktoren — buscosun Fusion, Jans Gate |
| V-DB-11 | Der Cube-Pfad wirft nicht, wenn er nichts lesen kann (CDN gesperrt): er liefert `v2` mit **leerer Achse** und die Gründe in `cube.errors` | Verbraucher erkennen Ausfälle sicher | Im Dashboard behandelt (leere Achse = Fehler); für das Punkt-Panel prüfen, ob es denselben Fall als Antwort zeigt |
| V-DB-12 | `generate-seo.mjs` fand die Vorlade-Liste nicht, sobald ein Route-Import die Form `import(…).then(c=>c.x)` hat — auf HEAD betrifft das schon **Atmosphäre, Eventplanung, Tourenplanung, Brandradar** (ihre Shells tragen nur die Basis-Hinweise); durch das Dashboard wäre auch die Wetterkarte betroffen gewesen | Erstbild dieser Seiten wie LE1 vorgesehen | Toleranz für `.then(…)` in der Regex — umgesetzt NUR für die Routen in `PRECONNECT_BY_ROUTE` (sonst hätte diese Phase das Verhalten anderer Seiten geändert); für die übrigen vier: Jans Entscheidung |
| V-DB-13 | Katalog-Stationsnamen kommen in Großbuchstaben und abgekürzt | Lesbarkeit im Schnitt | Anzeigenamen-Tabelle für den Stationskatalog (Producer) |
| V-DB-14 | Wolkenschichten enden bei ≈ 235 h (danach Quellen ohne Schichten); benannt in der Beschriftung | Klarheit bis 336 h | t3-Quelle mit Schichten in den Cube (Producer) |
| V-DB-15 | Das Karten-JS ist für Dashboard-Links Pflichtweg, weil das Dashboard eine Ansicht derselben Route ist | Dashboard-Link mobil ≈ 2 s schneller | E-DB-20 |

### 10.9 Offen — Jans Entscheidungen (gespiegelt in MANUELLE-SCHRITTE §25)

| E | Frage | Empfehlung |
|---|---|---|
| E-DB-19 | eagerJs 107,885 → 107,922 KB (+37 B) allein durch den Vorlade-Eintrag des geteilten `@nivo/line`-Chunks: Ratsche auf 108,0 heben — oder im Dashboard auf `@nivo/line` verzichten (eigener Zeitachsen-Rahmen; die Diagramme zeichnen ohnehin eigene Ebenen; widerspricht aber der Vorlagen-Notiz und E-DB-14) | Ratsche 108,0 (Wirkung: 37 B Text im Start-Chunk, keine zusätzliche Anfrage auf dem Kartenweg) |
| E-DB-20 | Dashboard-Link mobil 4,7 s statt < 2 s: eigener Einstieg für `?ansicht=dashboard`, der das Karten-JS erst beim Wechsel lädt (Eingriff in Start-Chunk/Router) — oder so lassen (Desktop 1,5 s erfüllt, p95 mobil erfüllt) | Erst Real-Device, dann entscheiden |
| E-DB-16′ | totalJs-Ratsche 1 475 bestätigen (Zuwachs dieser Phase); die Altlast 1 438 → 1 455,5 gehört zu E-FS-6/`cdc9a9b` | bestätigen |
| — | Pixel-Abweichungen (§10.4) und Zustände ohne Vorlage (`states/`) abnehmen; Real-Device (Long Tasks, Touch, WebGL-Pause) | — |
| V-DB-12 | Vorlade-Toleranz auch für Atmosphäre/Eventplanung/Tourenplanung/Brandradar einschalten | ja, als eigene kleine Phase |
