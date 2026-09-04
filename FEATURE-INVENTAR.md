# FEATURE-INVENTAR — buscosun, aus dem Code ermittelt

> Stand: 2026-09-04 · Stufe 0 (Feature-Inventar) · erzeugt aus der Code-Inventur (drei parallele Lesungen von `src/`, `scripts/`, `public/`) und Live-Messungen gegen https://buscosun.com. Kein Code geändert, kein Commit.

Quelle: Code-Lesung 2026-09-04 (drei parallele Inventuren über `src/`, `scripts/`, `public/`), nicht Doku.
Reife: **F** fertig · **T** teilfertig · **P** geplant · **flag** default-off/Kill-Switch · **R** zurückgezogen.
USP-Skala gegen Windy / Ventusky / Kachelmannwetter / meteoblue / Bergfex: **★★★** kein Wettbewerber hat
das · **★★** seltener/tiefer als üblich · **★** Standard · **—** kein Alleinstellungsmerkmal.
URL-Status: **idx** eigene indexierbare URL · **sub** nur als Sub-Route mit Eltern-Canonical (Defekt) ·
**hash/query** nur Fragment/Query · **state** nur UI-Zustand.

## 0.1 Abgleich mit der Kontextbeschreibung des Auftrags — Abweichungen

| Aussage im Auftrag | Befund im Code |
|---|---|
| „MapLibre GL JS + Three.js" | **Kein Three.js.** `package.json` hat 7 Runtime-Deps: `maplibre-gl`, `react`, `react-dom`, `react-router`, `bz2`, `bzip2-wasm`, `jsfive`. Alle 3D-Ansichten sind MapLibre-Custom-Layer mit eigenen WebGL-Shadern. |
| „WebGL2/WebGPU" | **Kein WebGPU** (`navigator.gpu` kommt nicht vor). Nur WebGL. |
| „Hosting Netlify, kein Backend" | Korrekt, **aber** 3 Netlify Edge Functions (`/_dwd_wind`, `/_dwd_grib`, `/_firms`) als Cache-/Schlüssel-Proxys und 6 reine Rewrites auf Fremd-Origins (DWD, MeteoAlarm, NOAA-S3, CSCS, Météo-France, ECMWF). Für Ebene B relevant. |
| „Daten via buscosun-data über jsDelivr" | Korrekt für Wetterkarte/Regenradar-Repack und Radar-Spiegel; zusätzlich ein zweites jsDelivr-Repo `jppetry/buscosun-worldcover` (WorldCover-Spiegel für dNBR). Große Teile laden weiterhin **direkt** von Fremd-Origins (GeoSphere, geo.admin.ch, BrightSky, Open-Meteo, Nominatim, AWS S3/Element84, NASA GIBS/FIRMS, Planetary Computer). |
| „kostenlos, ohne Registrierung" | Korrekt. Zusätzlich: **trackerfrei** (D-02), kein Analytics — die einzige Messinfrastruktur ist ein Server-Log-Parser, für den es **keinen Log-Zugang** gibt (Netlify-Logdrains = Enterprise). |
| CLAUDE.md: „SEO-Kanonicals inkonsistent auf buscosun.app" | **Behoben.** Live: alle Canonicals, Sitemap-URLs und OG-URLs auf `buscosun.com` (0 Treffer `.app` in Sitemap/Home). `roadmap.md` und `improvements.md`, auf die CLAUDE.md verweist, **fehlen im Arbeitsverzeichnis** (wie plan/checklist/context). |
| Alt-Doku `docs/seo-geo/context.md` | „Hash-basiertes Routing", `SITE.url = buscosun.app` — beides veraltet (RT1 = Pfad-Routing, `.com`). |
| Startseiten-Lead/Route-Meta | Werben mit „Modellwahl je Land, Zeit-Schieber" — im Auslieferungszustand ist `START_NOW_ONLY = true` (`MapView.tsx:288`): Slider nur +2 h, kein Punkt-/7-Tage-Forecast bis zum ersten Slider-Zug. Funktional vorhanden, aber Text ≠ Erstbild. |
| Waldbrand-Meta | `routes.ts:184-193` beschreibt „amtliche Landesstufen" und „Ausbreitungsrichtung aus Wind und Gelände" — beide Layer sind **zurückgezogen** (Bits 1 und 14 reserviert). Textkorrektur nötig. |

## 0.2 Inventar

### A · 2D-Wetterkarte `/wetterkarte` (`src/MapView.tsx` 5 504 Z., `src/map/`, `src/scalar/`, `src/wind/`, `src/sources/`)

| # | Feature (technisch) | Nutzen | Quelle / Modell · Abdeckung | Reife | USP | Zielgruppe · Suchbegriff · Situation | URL |
|---|---|---|---|---|---|---|---|
| A1 | `wind` Windkarte (`src/wind/WindLayer.ts`, `iconD2WindSource.ts`) — Partikel + Heatmap, Dichte-Slider, Intensität | „Woher und wie stark weht es jetzt/in 12 h" | DWD ICON-D2 u/v 10 m, 2,2 km, 0–12 h · DACH | F | ★ (Windy-Standard; Partikel px/s exakt aus GRIB ist Nische) | Segler, Drohne, Gleitschirm · „Windkarte Deutschland", „Wind aktuell Bodensee" · vor der Ausfahrt | sub |
| A2 | Höhenwind-Switcher 10 m/850/700/500 hPa (`src/wind/iconEuPressureWind.ts`) | Höhenwind für Flug/Berg | ICON-EU Druckflächen ~7 km | F | ★★ (in Windy vorhanden, hier DACH-gebündelt) | Gleitschirm, Segelflug, Bergsteiger · „Höhenwind 850 hPa", „Wind 3000 m Alpen" | state (nur im Wind-Panel/Detail-Modus) |
| A3 | `gust` Böenkarte (`iconD2GustSource.ts`) | Böenspitzen bis +24 h | ICON-D2 vmax_10m | F | ★ | Kran, Drohne, Bau, Zeltaufbau · „Böen Vorhersage Karte", „Sturmböen morgen" | sub |
| A4 | `nowcast` Niederschlag jetzt–2 h (`src/scalar/precipComposite.ts`, `RainLayer.ts`) — DACH-Komposit **je Zelle nach Land**, keine Modellverlängerung | Gemessener Regen, minutengenau, ehrlich am Radarhorizont endend | DE RADOLAN-RV ≤2 h · AT INCA ≤3 h · CH rzc ≤0,5 h | F | ★★ (drei Landesradare in **einem** Komposit; Ehrlichkeit statt Modell-Extrapolation) | Pendler, Eltern, Gastro · „Regenradar", „regnet es gleich" | sub |
| A5 | `temp` Temperaturkarte höhenkorrigiert (Shader-Lapse je Pixel, `ScalarLayer.ts`) + Stadt-Labels (`temperatureLabels.ts`) | Realistische Temperatur im Gebirge statt Modellglättung | ICON-D2 t_2m + DEM | F | ★★★ (per-Pixel-DEM-Korrektur im Shader hat kein Wettbewerber in DACH) | Alle · „Temperaturkarte", „Wetter Berge Temperatur Höhe" | sub |
| A6 | `clouds` Bewölkung 3-schichtig (`CloudLayer.ts`) | Wolkenstockwerke | ICON-D2 CLCL/CLCM/CLCH | F, **nicht im Dock** (Jans Vorgabe 23.07.) | ★ | Fotografen, Astro · „Wolkenkarte", „Bewölkung Vorhersage" | sub |
| A7 | `sat` Satellit EU/Welt (`dwdSatellite.ts`) | Meteosat-Bild | DWD-WMS (EUMETSAT), 3 h | F | — | „Satellitenbild Wetter Europa" | sub |
| A8 | `lightning` Blitze 60 min (`dwdLightning.ts`) | Wo hat es geblitzt | DWD-WMS (Linet/Sferics), DE-Fokus | F | ★ | Klettersteig, Segler · „Blitzkarte aktuell", „Blitzortung Deutschland" | sub |
| A9 | `lightningfc` Blitzprognose (`radar/lightningPotential.ts`) | Blitzpotenzial 0–12 h | ICON-D2 lpi_max | F | ★★ (LPI als Karte ist selten) | Klettersteig, Outdoor-Events · „Gewitter Vorhersage heute Karte" | sub |
| A10 | `stations` Live-Stationen (`dachStations.ts`) | Messwerte ~1 000 Stationen DACH | DWD (BrightSky) · TAWES · SMN | F | ★★ (DACH-Stationsnetz in einer Karte) | Wetter-Enthusiasten · „Wetterstation aktuell Messwerte" | sub |
| A11 | `confidence` Sicherheits-Schleier (`ConfidenceLayer.ts`, `ml/confidenceField.ts`) — Regen-Modus (15-Member-Flow-Ensemble, DE) / Temperatur-Modus (Klimatologie × Lauf-Übereinstimmung) | Zeigt, **wo** die Vorhersage unsicher ist | eigene Ableitung | F, nicht im Dock | ★★★ (Unsicherheit als Fläche gibt es sonst nirgends) | Skeptiker, Planer · „Wie sicher ist die Wettervorhersage" | sub |
| A12 | `snowline` Schneefallgrenze als Linie (`scalar/snowLine.ts`, `ml/snowModel.ts`) | Wo fällt Schnee statt Regen | ICON-D2 + DEM + gelernte T50 | F, nicht im Dock | ★★ | Skitour, Winterdienst · „Schneefallgrenze heute Alpen" | sub |
| A13 | `flownowcast` Flow-Nowcast (`ml/opticalFlowNowcast.ts`) | Radar-Advektion 0–60 min | RADOLAN, nur DE | F, nicht im Dock | ★ | — (Regenradar deckt es ab) | sub |
| A14 | `poprob` Regen-Chance (`ml/flowEnsemble.ts`, isoton kalibriert) | PoP-Fläche 0–60 min | 15-Member-Flow-Ensemble, nur DE | F, nicht im Dock | ★★ | Pendler · „Regenwahrscheinlichkeit nächste Stunde" | sub |
| A15 | `thunder` Gewitterpotenzial (`radar/thunderPotential.ts`) | CAPE×CIN×LPI → 0–100 | ICON-D2, 0–12 h | F | ★★ | Klettersteig, Segler, Veranstalter · „Gewitterpotenzial", „CAPE Karte" | sub |
| A16 | `snow` Schneekarte Decke/Neuschnee (`iconD2Snow.ts`) | Schneehöhe/Neuschnee-Prognose | ICON-D2 h_snow / snow_gsp | F | ★ | Ski · „Neuschnee Prognose Karte" | sub |
| A17 | `rotation` Rotationspotenzial (Experten-Layer, `radar/rotationPotential.ts`) | Superzellen-**Verdacht**, konservativ | ICON-D2 uh_max/sdi_2 | F | ★★★ (konservativ formuliert, nie „Tornado") | Storm-Spotter · „Superzellen Vorhersage", „Updraft Helicity" | sub |
| A18 | `cells` Zellbahnen (`radar/konrad3d.ts`, `cellLayers.ts`) — amtliche Zugbahn + Unsicherheitstrichter + ETA-Satz | „Trifft mich die Zelle, wann?" | DWD KONRAD3D, 5 min, DE-Verbund | F | ★★★ (amtliches Objektprodukt statt eigener Extrapolation) | Veranstalter, Segler, Feuerwehr · „Gewitterzelle Zugrichtung", „KONRAD" | sub |
| A19 | `hail` Hagel (`radar/hailField.ts`, `meteoSwissHail.ts`) — CH MESHS/POH-Fläche + DE KONRAD-Hagelzellen, **AT-Lücke benannt** | Hagelgefahr jetzt | MeteoSchweiz 1 km/5 min (Apr–Sep) + DWD | F | ★★ | Landwirte, Winzer, Autobesitzer · „Hagelradar", „Hagel aktuell Schweiz" | sub |
| A20 | `warnings` Amtliche Warnungen als Flächen, Popup **wortwörtlich** (`warnings/warnField.ts`) | Amtliche Warnlage DE+CH, AT-Lücke ausgewiesen | DWD CAP + MeteoAlarm (MeteoSchweiz), 5 min | F (AT geplant W3) | ★★ (Zitatregel, getrennte Skalen) | Alle, Feuerwehr, Bau · „Unwetterwarnung aktuell", „Wetterwarnung Landkreis" | idx `/warnungen` |
| A21 | Modell-Bibliothek + Switcher je Land (`src/map/ModelLibraryOverlay.tsx`, `fusion/modelCatalog.ts`, 23 Modelle, Whitelist nur freie Lizenzen, Abdeckungskarte DE/AT/CH, Ehrlichkeits-Notizen „vereinfachtes Raster") | Modell wählen, sehen was es kann/nicht kann | ICON-D2/-EU/-CH1/-CH2/EPS, AROME-AT/-FR, ARPEGE, IFS/AIFS, GFS, ICON-global/AICON, MOSMIX | F | ★★★ (per-Land-Modellwahl mit Abdeckungs-Ehrlichkeit) | Wetter-Nerds · „ICON-D2 vs ICON-EU", „welches Wettermodell für die Schweiz" | query `?modell=` |
| A22 | Zeit-Deck 0,1-h-Slider, Zeitraffer, Datenstand „Stand · HH:MM" (`dataAge.ts`), Warm-Manifest-Hinweis | Ehrliche Aktualität | — | F | ★★ (Datenalter statt „jetzt") | — | state |
| A23 | Punktforecast-Panel (`src/pointForecast/`) — 24 h × Temp/Wind/Böe/RH/gefühlt/Schneegrenze/Wolken/Regen/UV, Konfidenz je Variable (Skill-Decay), Quellen-Blend Stationen+MOSMIX+AROME+INCA+Radar, Lapse per Regression, Representativeness-QC, AT/CH-Warnlücke benannt, DWD-Pollen (DE) / CAMS-Opt-in (AT/CH), Lawinen-Deep-Link ≥1 000 m | Ehrliche Punktvorhersage mit Herkunft | DWD/GeoSphere/MeteoSwiss, kein Open-Meteo-Default | F (im Erstbild aus, `?startnow=0`) | ★★★ (Konfidenz je Variable + Quellenmix sichtbar) | Alle · „Wetter <Ort> stündlich" | query `?ort=` |
| A24 | 7-Tage-Forecast Modellvergleich (`map/SevenDayForecast.tsx`, `confidence/multiModel.ts`) | Regenrisiko = Modell-Einigkeit | Open-Meteo 5 Modelle (explizite Quelle) | F | ★★ | — | state |
| A25 | Ortssuche ⌘K (Nominatim DE/AT/CH), Favoriten (max 8, localStorage), Länder-Tabs, Land-Maske, Permalink-Codec (`router/urlState.ts`) | — | — | F | — | — | query |
| A26 | 3D-Globus `/globus` (`src/globe/`) — GFS **live** via S3-Range, Temp/Wind/RH/MSLP, sfc/850/500/250 hPa, +120 h | Globales Windfeld | NOAA GFS 1° | F | ★ (nullschool-Vorbild) | Neugierige, Lehrer · „Wind Globus 3D", „earth wind map deutsch" | idx (Zustand `#g=`) |
| A27 | Validierung `/validierung` (`src/validation/`) — Live-Hindcast Flow-Ensemble vs RADOLAN: BSS/ECE/Brier/CSI, Reliability | Beweist Kalibrierung statt sie zu behaupten | RADOLAN DE | F, **noindex** | ★★★ | Skeptiker, Fachleute · „Wie gut ist das Regenradar-Nowcast" | idx, noindex |

**Hinweis Dock vs. URL:** `clouds`, `confidence`, `snowline`, `flownowcast`, `poprob` sind aus dem Dock
auskommentiert (`MapView.tsx:5360–5393`), aber per Sub-Route voll funktionsfähig. Für SEO sind das fünf
fertige, aber unbeworbene Layer.

### B · Regenradar `/regenradar` (`src/nowcast/`, `src/radar/`)

| # | Feature | Nutzen | Quelle | Reife | USP | Zielgruppe · Suchbegriff | URL |
|---|---|---|---|---|---|---|---|
| B1 | 12 Radar-Layer (`radar/radarModel.ts:296`): precip, rain/snow/graupel/hail (**Phasen aus DEM + Schneefallgrenze abgeleitet, als Heuristik gekennzeichnet**), snowline, lightning, cells, accum, wind, warnings, **coverage „Radarsicht"** | Regen/Schnee-Trennung, Radarschatten sichtbar | RADOLAN-RV/INCA/rzc | F | ★★ (Radarsicht-Layer) | Pendler, Wintersport · „Regenradar Schnee oder Regen", „Radar Alpen Abschattung" | idx (Zustand `#r=`) |
| B2 | Presets Standard / Gewitter-Jagd / Winter | — | — | F | ★ | — | hash |
| B3 | Frame-Stack DE 25×5 min bis +120 · AT 12×15 min bis +180 · CH nur jetzt; **gemessene Vergangenheit** per Session-Cache; `measured`-Bruch in der Timeline | Ehrlicher Messung↔Prognose-Übergang | — | F | ★★ | — | — |
| B4 | Eigenes Zell-Tracking (`cellTracking.ts`) → km/h, Peilung, **ETA zum Standort** | „In 12 min Regen bei dir" | Radar | F | ★★ | Pendler · „Wann hört der Regen auf" | — |
| B5 | Gewittergefahr-Index am Punkt (`convectiveIndex.ts`), Punkt-PoP-Streifen (DE, 15 Member), Nowcast-Engine 6 h/15 min (`nowcastEngine.ts`), alpine Tal/Grat-Trennung (`alpineSplit.ts`) | Klartext „Regen beginnt in 12 min" | Radar + ICON-D2 | F | ★★★ (Tal/Grat-Split) | Bergsport · „Regen Nowcast Berg Tal" | — |
| B6 | Regen-Alarme (`nowcastAlerts.ts`) — nur bei offener App | Hinweis | — | T (kein Push) | — | — | — |
| B7 | Farbenfehlsicht-sichere Palette, dBZ-Skala | Barrierefreiheit | — | F | ★ | — | hash |

### C · Vorhersage `/vorhersage` (`src/confidence/`)

| # | Feature | Nutzen | Quelle | Reife | USP | Suchbegriff | URL |
|---|---|---|---|---|---|---|---|
| C1 | Modellvergleich 5 Modelle + Ensemble (ICON-EPS bis 40 Member) + Vorläufe | Wo sind sich Modelle einig | Open-Meteo (explizit) | F | ★★ (meteoblue hat Multimodel, aber nicht so ehrlich) | Wetter-Nerds · „Wettermodelle vergleichen", „Ensemble Vorhersage" | idx |
| C2 | Konfidenz-Score je Tag (Spread × Vorlauf), Ausreißer-Erkennung (LOO), p10–p90-Bänder, Stabil⇄Wechselhaft („stabil ≠ richtig") | Ehrliche Sicherheit | — | F | ★★★ | Skeptiker · „Wie zuverlässig ist die 7-Tage-Vorhersage" | idx |
| C3 | Trefferquoten-Rückblick 30 Tage, Leads 1/3 d (`hitRate.ts`) | „Wie gut lag die Vorhersage bei mir" | Modell-Analysen als Referenz | F | ★★★ | „Wettervorhersage Genauigkeit prüfen" | state |
| C4 | Niederschlags-Unsicherheits-Raster 5×5 (~5,5 km) | „westlich mehr" | — | F | ★★ | — | state |

### D · Tourenplanung `/tourenplanung` (`src/route/`, `src/threed/`)

| # | Feature | Nutzen | Quelle | Reife | USP | Zielgruppe · Suchbegriff | URL |
|---|---|---|---|---|---|---|---|
| D1 | Upload GPX/TCX/FIT/KML/KMZ mit Magic-Byte-Erkennung, Validierung (25 MB, 100 k Punkte, DACH+50 km) | Jede Tour-App-Datei | — | F | ★★ (FIT/KMZ selten) | Rad, Wandern · „GPX Wetter entlang der Route" | state |
| D2 | DEM-Anreicherung + **Gegenprobe** mitgelieferter Höhen (Terrarium ~30 m) | Falsche Höhen erkannt | AWS Terrarium | F | ★★ | — | — |
| D3 | 8 Bewegungsarten mit DIN-33466/SAC-Gehzeit, Rad-Steigungsmodell, Trail, **Wind-Effekt aufs Tempo** (iterativ) | Realistische Ankunftszeit je km | — | F | ★★★ (Wind→Tempo→ETA→Wetter zur ETA) | Rennrad, Bergwandern · „Wanderzeit berechnen Wetter", „Rennrad Gegenwind Route" | state |
| D4 | Pausenplanung (auto/eigene), Startzeit-Quickpicks, Horizont 10 Tage | Zeitplan | — | F | ★ | — | state |
| D5 | **E-Bike-Akku** (P_grav+P_roll+P_aero, Stufen Eco–Turbo, SoC-Verlauf, „eine Stufe runter") | Reicht der Akku? | — | F (vereinfacht) | ★★★ (kein Wetterdienst hat das) | E-Bike · „E-Bike Reichweite berechnen Steigung Wind" | state |
| D6 | Wetter je km zur ETA: Cluster 6/10/14 km + 300-m-Höhenband, Radar-Override im Nowcast-Horizont, Warnungen (DE), Schneegrenze (AT/CH), Föhn-Banner, UV | Wetter dort, wo man dann ist | Punkt-Blend + Radar je Land | F | ★★★ | „Wetter unterwegs Radtour Uhrzeit" | state |
| D7 | 2D-Ergebnis: Wetter-Strip mit Verlässlichkeits-Ring, Statgrid, Scrubber, Sparklines (PNG-Export), Gelände/Karte-Umschalter | Übersicht | — | F | ★★ | — | state |
| D8 | **3D-Bühne** `/tourenplanung/3d`: Schnitt (Windwand, Regen, Wolkenbasis, Schneegrenze, Warnzone) + Gelände (MapLibre-Terrain + Vorhang 300 m über Grund); Zeitkorridor (Regenfenster, **Startempfehlung ±2 h**), Go/No-Go-Grenzwerte (Böen/Wind/Regen/gefühlt/Warnstufe DE), Zeitplan „was wann passiert" mit Hysterese, Text-Export | Entscheidung | — | F | ★★★ | Bergführer, Rennrad · „Beste Startzeit Tour Wetter" | idx, **noindex** (leer ohne Datei) |
| D9 | Gerätespeicher IndexedDB 7 Tage („Wetter nie gespeichert") | Tour bleibt | — | F | — | — | — |
| D10 | Knöpfe „Als Event / Tagesablauf / Speichern" | — | — | **P (Attrappe, kein onClick)** | — | — | — |

### E · Event-Planung `/eventplanung` (`src/event/`, `src/photo/`, `src/astro/`)

| # | Feature | Nutzen | Quelle | Reife | USP | Zielgruppe · Suchbegriff | URL |
|---|---|---|---|---|---|---|---|
| E1 | 5-Schritt-Wizard: Ort → **Fläche (Rechteck)** → Anlass → Zeitfenster/Phasen → Plan B | Bester Tag in 7 Tagen | Punkt-Blend | F | ★★★ | Hochzeit, Vereine · „Bester Tag für Gartenparty Wetter" | state |
| E2 | 11 Anlässe mit eigenen Gewichten (Grillen, Hochzeit, Wandern, Drohne, Foto, Sterne, Rad, Picknick, Laufen, Baden, frei); Feinjustierung | Anlass-bewusster Score 0–100 | — | F (**`wedding` nutzt Default-Profil**, vermutlich Versehen) | ★★★ | je Anlass eigener Suchbegriff („Hochzeit Wetter Plan B", „Drohne fliegen Wind Vorhersage") | state |
| E3 | Phasen (Trauung/Empfang/Abendfeier), Tag zählt schwächste Phase; Hochzeits-Wind-/Hitze-/Abendkälte-Karten | Zeremonie-genau | — | F | ★★★ | Hochzeitspaare, Planer | state |
| E4 | Konfidenz = Quellen-Einigkeit × Vorlauf, `RELIABLE_CONFIDENCE 0,55`, „keine Vorhersage" statt Null jenseits Horizont (AT/CH >60 h) | Ehrlich | — | F | ★★★ | — | — |
| E5 | Plan B (Schwellen Regen/Böen/Score, Zelt/Halle/Unterstand), **Ausweichort-Suche 8 Richtungen/22 km** | Alternative | — | F | ★★★ | „Ausweichtermin Wetter" | state |
| E6 | Event-Zone: 4 Ecken + Mitte, gemessene Auflösungsgrenze („uniform" statt Scheingenauigkeit), **Gelände-Bühne** mit Score-Chips, Windpfeilen, tiefster/exponiertester Punkt, **Sonne hinter dem Grat je Phase** | Wiese/Zelt-Planung | Terrarium-DEM | F | ★★★ (einzigartig) | Festival, Hochzeit im Freien · „Festwiese Wetter Planung Gelände" | hash |
| E7 | **Foto-Licht** (`src/photo/`): goldene/blaue Stunde exakt (NOAA), Lichtqualität (soft/harsh/dramatic), Nebel-/Abendrot-Chance | Fotoplanung **für jedes Datum** | Astronomie + Blend | F | ★★★ | Fotografen · „Goldene Stunde <Ort> heute", „Abendrot Wahrscheinlichkeit" | state (nur Anlass photo) |
| E8 | **Astro-Nacht** (`src/astro/`): Mond (Schlyter), Wolkenschichten, Tau-Risiko (Magnus), astronomische Dunkelheit, **Bortle-Schätzung offline** | Sternennacht finden | — | F | ★★★ | Astrofotografen · „Klare Nacht Sterne Vorhersage", „Lichtverschmutzung Bortle <Ort>" | state (nur Anlass stargazing) |
| E9 | .ics-Export, Permalink `#ev=`, Benachrichtigungs-Center (nur bei offener App, `NULL_BACKEND`) | — | — | F / T | ★ | — | hash |
| E10 | Gewitter-Ausblick (ICON-D2 CAPE + DWD-Alerts) | — | — | F, DE-lastig | ★ | — | — |

### F · Wetterarchiv `/wetterarchiv` (`src/history/`)

| # | Feature | Nutzen | Quelle | Reife | USP | Zielgruppe · Suchbegriff | URL |
|---|---|---|---|---|---|---|---|
| F1 | Rückblick (Tag/Monat/Jahr, Stunden-Drill-down) | „Wie war das Wetter am …" | Meteostat-Station (DWD `dwd_daily`, Default) + ERA5 (Open-Meteo Archive, bis 1940); Modell-gefüllte Anteile ausgewiesen | F | ★★ | Alle · „Wetter Rückblick <Datum> <Ort>", „Wetter letztes Jahr" | hash `#h=` |
| F2 | Veränderung: Klimastreifen, Anomalien vs 1961–1990, Trend, **Kenntage** (Hitze/Sommer/Tropennacht/Frost/Eis, Schwelle einstellbar), Rekorde, Kalender-Heatmap, Boxplot, Windrose, „Wetter an meinem Tag", Perzentil-Einordnung | Klimawandel am eigenen Ort | s. o. | F | ★★★ (nur Wetterdienste/Klimaportale, keine Wetter-App) | Klima-Interessierte, Lehrer, Journalisten · „Klimastreifen <Ort>", „Hitzetage pro Jahr <Stadt>", „Erwärmung seit 1940" | hash |
| F3 | HistoryPro: Ortsvergleich, **HDD/GDD, Hitzewellen, Trockenperioden, frostfreie Periode**, Presets Gärtner/Energie/Event/Landwirtschaft, CSV/PNG/Permalink/**Embed-iframe** | Fachnutzen | s. o. | F | ★★★ | Landwirte, Gärtner, Energie · „Wachstumsgradtage", „Heizgradtage <Ort>", „letzter Frost Datum Statistik" | hash `embed=1` |

### G · Atmosphäre `/atmosphaere` (`src/atmosphere/`, `src/threed/crossSection.ts`)

| # | Feature | Nutzen | Quelle | Reife | USP | Zielgruppe · Suchbegriff | URL |
|---|---|---|---|---|---|---|---|
| G1 | Vertikalschnitt entlang freier Linie: Höhenwind in 5 Bändern, Shear, Geländeprofil, 0–48 h | Luftschichten sehen | ICON-D2 Boden + Standardprofile (ehrlich: „nicht aus echten Druckflächen") | F | ★★★ | Gleitschirm · „Höhenwind Vorhersage Gleitschirm", „Windprofil Startplatz" | idx `/atmosphaere/querschnitt` (sub) |
| G2 | Inversion (Höhe, Nebelobergrenze, Aufstiegs-Delta) | „Über dem Nebel Sonne?" | — | F | ★★★ | Wanderer, Fotografen · „Nebelobergrenze heute", „Inversion Alpen Sonne über Nebel" | query `?ansicht=inversion` |
| G3 | **Go/No-Go Arbeitsfenster** (Arbeitshöhe AGL + Böengrenzwert → GO/NO-GO-Zeitbahn, Extra-Grenzwerte) | Drohne/Kran/Höhenarbeit | — | F | ★★★ (einziges B2B-Angebot) | Kranführer, Drohnen-Gewerbe, Gerüstbau · „Kran Windgrenze Vorhersage", „Drohne Windlimit Tag" | query `?ansicht=gonogo` (**nicht kanonisch**, obwohl llms.txt + Tool-Seite darauf verlinken) |
| G4 | Föhn-Index (kein/tendenziell/aktiv, Südsektor, Druckdifferenz-Gate **ehrlich als fehlend** benannt), **Isentropen-Schnitt** | Föhn-Vorwarnung | ICON-EU-Profil | F | ★★★ | Wetterfühlige, Innsbruck/Chur/Garmisch · „Föhn heute Innsbruck", „Föhn Vorhersage" | idx `/atmosphaere/berg-und-weg` (sub) |
| G5 | Thermik-Karte (Grenzschichttiefe aus Parcel + 3 K Überhitzung, als SCHÄTZUNG gelabelt), Talwind-Tagesgang | Flugtag einschätzen | ICON-EU | F | ★★★ | Gleitschirm, Segelflug · „Thermik Vorhersage", „Talwind Umkehr Uhrzeit" | idx `/atmosphaere/fliegen` (sub) |
| G6 | Nerd-Mode: Skew-T, CAPE/CIN/LCL/LFC/EL/LI, rohe ICON-EU-Level | Profi | ICON-EU | F | ★★ | Meteo-Studierende · „Skew-T Diagramm <Ort>" | hash `n=1` |
| G7 | Verdict je Linse (deterministisch, kein LLM); „Himmel"-Linse | — | — | F / **P** | — | — | — |
| G8 | Knopf „Link teilen" | — | — | **P (kein onClick)** | — | — | — |

### H · Brandradar `/waldbrand` (`src/fire/`, `scripts/fire/`, `public/fire/` 16,9 MB Artefakte)

| # | Feature | Nutzen | Quelle | Reife | USP | Zielgruppe · Suchbegriff | URL |
|---|---|---|---|---|---|---|---|
| H1 | EU-Gefahrenindex `fireDanger` + **5 Sub-Ansichten** FWI / Perzentil-Einordnung / DC / ISI / FFMC, +9 Tage | Gefahr flächig, ohne Ländergrenze | Copernicus GWIS (ECMWF) WMS, 8 km | F | ★★★ (Perzentil-Einordnung „wie außergewöhnlich ist heute hier") | Feuerwehr, Forst, Camper · „Waldbrandgefahr heute Karte", „FWI Deutschland", „Waldbrandgefahrenindex" | idx `/waldbrand/gefahrenindex` (sub); Sub-Ansichten nur `#wb=v=` |
| H2 | Nationale Skalen DE (DWD 5 Stufen) / CH (BAFU) **nebeneinander, nie umgerechnet**, „AT hat keine offene amtliche Stufe" | Amtliches korrekt einordnen | — | F | ★★★ | „Waldbrandwarnstufe Brandenburg", „Waldbrandgefahr Schweiz Kanton" | state |
| H3 | Detektionen `fireHotspots` (FIRMS VIIRS 375 m via Edge Function, GWIS-Notbetrieb ohne FRP), 24 h/7 d, **Ortsfest-Klassifikator** (39 % aller DACH-Detektionen sind Dauerquellen), EFFIS-Bestätigung | „Wo hat der Satellit Feuer gesehen" | NASA FIRMS, GWIS | F | ★★★ (Ortsfest-Filter, „unbestätigt ist Normalfall") | Feuerwehr, Journalisten · „Aktive Waldbrände Deutschland Karte", „FIRMS Hotspots" | idx `/waldbrand/aktive-braende` (sub) |
| H4 | Brand-Registry `fireFootprints`: Brände als Liste mit Fläche (kartiert/bis-N-ha/**geschätzt mit Intervall**), Status AKTIV/ERLOSCHEN nur mit Quelle, Sortierung/Filter, Leerzustände mit Grund | Brandübersicht | FIRMS + EFFIS + EMS + GeoNames | F | ★★★ | „Waldbrand <Ort> aktuell Fläche" | hash `fp=` |
| H5 | **Brand-Dossier** (Karte\|Dossier): Kennzahlen, FRP-Verlauf je Überflug, Tendenz, Ausbreitungsvektor (FRP-Schwerpunkt, Windabgleich), Wetterlage am Brandort (Open-Meteo ICON, Modellwerte), Landbedeckung, Natura 2000, EMS-Link, GeoSphere-Warntext **wörtlich**, „Ursache: keine Quelle" | Einordnung eines Brands | s. o. | F | ★★★ | „Waldbrand Hürtgenwald Satellitenbild", „Brand Gohrischheide Fläche" | hash `ds=1`, **Brand-ID bewusst nicht im Hash** |
| H6 | **Satellitenbild vorher/nachher** (GIBS/Worldview HLS 30 m, STAC-Szenenliste) + **10-m-COG-Viewer** Echtfarbe/SWIR/**dNBR** mit SCL-Wolkenmaske + WorldCover-Dämpfung | Brandnarbe sehen | Sentinel-2 (AWS), Landsat, ESA WorldCover | F (flags `?sat`, `?sat10`, `?wc`) | ★★★ (10-m-dNBR im Browser hat niemand) | „Brandfläche Satellitenbild Sentinel", „dNBR" | state (3 Klicks tief) |
| H7 | Brand-Historie Monat/Saison (statische Indizes 2020–2026, 5 881 Ereignisse, Saisonverlauf-Chart vs Vorjahre, Ereignis-Dossier mit Meteostat/ERA5-Wetter) | „Wie läuft die Saison" | eigener FIRMS-SP-Batch + EFFIS | F (flag `?bh=0`) | ★★★ | Journalisten, Forst · „Waldbrandsaison 2026 Bilanz Deutschland", „Waldbrände Statistik Monat" | hash `bh=` |
| H8 | Thermalanomalien (462+ Standorte A/B/C aus FIRMS-Archiv × E-PRTR/MaStR/BFE, Signaturvergleich) | Fehlalarm vs Brand | s. o. | F (flag `?ta=0`) | ★★★ | „Stahlwerk Hotspot FIRMS", „Thermalanomalie Satellit" | hash `ta=1` |
| H9 | Feuerwetter-Treiber (ICON-D2 relhum, „Treiber, kein Index"), **Bodentrockenheit SMI** Oberboden/Wurzelzone, „% Fläche am Welkepunkt" | Trockenheit | ICON-D2 | F | ★★ | Landwirte · „Bodenfeuchte Karte Deutschland", „Dürre aktuell" | idx `/waldbrand/trockenheit` (sub) |
| H10 | EFFIS-Kontext: Brennmaterial (2017), frühere Brandflächen (7 d/Saison/Archiv), Schutzgebiete (CH-Lücke benannt), CORINE-Maske | Kontext | EFFIS/EEA | F | ★ | — | hash |
| H11 | Behörden-Links DE NINA/MoWaS (**Auswertung gesperrt, Lizenz**), AT OÖ/Bgld (keine landesweite Quelle), CH Alertswiss | — | — | F / P | ★★ (Ehrlichkeit) | — | — |
| H12 | Zurückgezogen: Amtliche Stufe, Feuerverbote CH, EDO-Dürre/-Vegetation, Wind-Layer, Feuerwetter-Raster, FBP-Ausbreitung | — | — | **R** | — | — | — |

### I · Querschnitt, Start, Infrastruktur

| # | Feature | Nutzen | Reife | USP | URL |
|---|---|---|---|---|---|
| I1 | Startseite Command-Deck, 10 Kacheln, ⌘K-Palette, Favoriten, Intro-Tour 9 Schritte (nie automatisch) | — | F | — | idx `/` |
| I2 | Feedback `/feedback` (mailto, kein Backend) | — | F | — | idx |
| I3 | Statische SEO-Seiten: 138 `/wetter/<ort>/` (DE 58 · AT 40 · CH 40, keine Live-Zahlen, FAQ, Dataset), 10 `/wissen/` (3 voll), 10 `/funktionen/` (3 voll), 1 `/wetterlage/`, `/impressum/ /datenschutz/ /kontakt/ /lizenzen/` (Modelltabelle aus `modelCatalog.ts`) | — | F/T | ★★ (Ehrlichkeits-Texte, Lizenzverzeichnis) | idx |
| I4 | PWA: SW v4 network-first für HTML (SEO-Seiten werden nie aus dem Cache geliefert — unkritisch), Manifest | — | F | — | — |
| I5 | Benachrichtigungen (`NULL_BACKEND`), `dayflow` (toter Platzhalter), `src/threed/ThreeDPage` (nicht geroutet), `FeaturePage` | — | T / P / R | — | — |
| I6 | Kill-Switches (Query > localStorage): `?startnow=0 ?radar=0 ?mode=native ?ta=0 ?bh=0 ?afEst=0 ?sat=0 ?sat10=0 ?wc=0 ?wcm= ?dem=0 ?tour=0 ?h5worker=0 ?radarcdn ?radarimg ?repack` | Diagnose | F | — | query |

## 0.3 Features mit hohem Suchpotenzial ohne (tragfähige) indexierbare URL — **wichtigste Ausgabe**

Rangfolge nach Suchvolumen × Alleinstellung × Aufwand.

| Rang | Feature | Heute erreichbar über | Warum SEO-wertvoll | Vorschlag (Etappe) |
|---|---|---|---|---|
| 1 | **25 Sub-Routen** (19 Layer, 3 Linsen, 3 Brand-Sichten) | URL existiert, aber Roh-HTML = Eltern-Shell mit Eltern-Canonical; gerenderter DOM ohne H1/Text/Links | „Temperaturkarte", „Windkarte", „Hagelradar", „Föhn Vorhersage", „aktive Waldbrände" sind Kopf-Keywords | eigene Shell + Inhalt je Sub-Route (E1, E2) |
| 2 | **Foto-Licht** (goldene/blaue Stunde exakt für jedes Datum) | Event-Wizard → Anlass „Foto" | „Goldene Stunde heute <Ort>" hat hohes, stabiles Volumen; die Astronomie gilt ohne Vorhersagehorizont → dauerhaft gültige Seiten | Zielgruppen-Seite `/fuer/fotografen/` + Explainer + Ortsseiten-Block „Sonnenzeiten" (E5/E6/E8) |
| 3 | **Astro-Nacht** (Bortle-Schätzung, Mond, Dunkelheit) | Anlass „Sterne" | „Sternenhimmel heute", „Lichtverschmutzung <Ort>", „Neumond Nacht klar" | `/fuer/astronomie/`, Explainer Bortle, Ortsseiten-Block (E5/E6/E8) |
| 4 | **Go/No-Go Arbeitsfenster** (einziges B2B-Angebot) | `?ansicht=gonogo` (nicht kanonisch) | „Kran Windgrenze", „Drohne Windlimit", „Höhenarbeit Wind Vorhersage" | kanonische Sub-Route `/atmosphaere/arbeitsfenster` (E7) + `/fuer/bau-und-kran/`, `/fuer/drohnenpiloten/` |
| 5 | **Brand-Historie / Saisonbilanz** | `#wb=bh=season` | „Waldbrände 2026 Deutschland Bilanz", „Waldbrandsaison Statistik" — journalistisch stark, statische Daten liegen im Repo | Sub-Route `/waldbrand/historie` (E7) + Saisonbericht-Seite als `/wetterlage/`-Artikel |
| 6 | **Thermalanomalien** (462 Standorte) | `#wb=ta=1` | „FIRMS Fehlalarm Industrie", Nische, aber einzigartig | Sub-Route `/waldbrand/thermalanomalien` (E7) + Explainer |
| 7 | **FWI-Teilindizes** (FFMC/DC/ISI/Perzentil) | `#wb=v=` | „Fire Weather Index erklärt", „Drought Code" | Explainer + Glossar (E5), keine eigene App-Route (Preset-Charakter) |
| 8 | **Event-Anlässe** (Hochzeit, Drohne, Grillen …) | Wizard-Schritt 3 | „Hochzeit Wetter Plan B", „Grillabend Wetter bester Tag" | Sub-Routen `/eventplanung/<anlass>` mit Vorauswahl (E7) + Zielgruppen-Seiten |
| 9 | **E-Bike-Akku-Reichweite** | Bewegungsart im Tour-Ergebnis | „E-Bike Reichweite Steigung Wind berechnen" — kein Wetterdienst, keine Radapp verbindet Wetter+Akku | `/fuer/e-bike/` + Methodik-Seite (E3/E6) |
| 10 | **Kenntage/Klimastreifen/GDD/HDD** | `#h=` | „Hitzetage <Stadt> pro Jahr", „Klimastreifen <Ort>", „Wachstumsgradtage" | Explainer + Ortsseiten-Klimablock (E5/E8); Sub-Routen im Archiv sind ohne Ort leer → nicht sinnvoll |
| 11 | **Konfidenz-Layer / Validierung** | Sub-Route ohne Dock; `/validierung` noindex | „Wie zuverlässig ist Wettervorhersage" ist Kopf-Keyword; Validierung ist Beleg | `/wetterkarte/sicherheit` mit Inhalt (E1/E2); `/validierung` **indexierbar machen** mit erklärendem Text (E4) |
| 12 | **Modell-Bibliothek** (23 Modelle mit Abdeckung/Lizenz) | Overlay | „ICON-D2 erklärt", „welches Wettermodell Schweiz" | Methodik/Glossar-Seiten je Modell aus `modelCatalog.ts` generiert (E3) |
| 13 | **Zellbahnen KONRAD** | Sub-Route | „Gewitterzelle Zugbahn", „KONRAD DWD" | Inhalt auf `/wetterkarte/zellbahnen` (E1/E2) + Explainer |
| 14 | **Tal/Grat-Nowcast, Schneefallgrenze-Linie** | Regenradar/`/wetterkarte/schneegrenze` | „Schneefallgrenze heute" | Explainer voll (E4) + Sub-Route-Inhalt |
| 15 | **10-m-dNBR-Viewer** | 3 Klicks tief, kein URL-Zustand | Fach-Nische | Methodik-Seite „Brandnarben aus Sentinel-2" (E3); kein URL-Zustand nötig |

## 0.4 Verborgene / nur per Untermenü oder Query erreichbare Funktionen (Auszug, vollständig in den Agenten-Berichten)

Nicht gedockte Layer (5) · Höhenwind-Switcher (Wind-Panel/Detail-Modus) · Satellit/Schnee/Hagel-Sub-Switcher (mobil nur „Detail") · `?startnow=0` · Per-Layer-Modell-Overrides (nur Dev-Global) · 3D-Tour-Modi Zeitkorridor/Grenzwerte/Zeitplan · E-Bike-Panel · Foto-Licht/Astro nur je Anlass · Hochzeitskarten nur bei Phase „Trauung" · Event-Zonen-Gelände nur mit gezogener Fläche · HistoryPro/Embed · Atmosphäre Nerd-Mode/Isentropen/Talwind · Brand: 5 FWI-Sub-Ansichten, Monat/Saison-Chips, 10-m-Viewer, Filter, Wurzelzone, Stundenachse, Signaturprüfung, nationale Skalen · `/validierung` noindex.

## 0.5 Zielgruppen, die ein Feature bedienen würde, aber nicht adressiert werden

| Zielgruppe | Passendes Feature | Heute adressiert? |
|---|---|---|
| Kranführer/Kranverleih, Gerüstbau, Dachdecker, Höhenarbeit | Go/No-Go, Böenkarte, Warnungen | nur `/funktionen/arbeitsfenster/` (Stub, 41 Wörter) |
| Kommerzielle Drohnenpiloten (Vermessung, Film) | Go/No-Go, Böen, Event-Anlass Drohne | nein |
| Landwirte/Winzer/Obstbau | Hagel (CH/DE), Bodentrockenheit SMI, GDD/frostfreie Periode, Trockenperioden, Warnungen | nein |
| Feuerwehr/Katastrophenschutz (ehrenamtlich) | Brandradar, Zellbahnen, Warnungen, Böen | nein (und ehrlich: kein Einsatzwerkzeug — genau das gehört auf die Seite) |
| Forstbetriebe | Brandradar, Trockenheit, Sturm | nein |
| Segler/Surfer Alpenseen | Wind/Böen, Föhn-Böen, Zellbahnen, Blitze | nein |
| Astrofotografen/Sternfreunde | Astro-Nacht, Bewölkung 3-schichtig | nein |
| Landschaftsfotografen | Foto-Licht, Inversion/Nebelobergrenze | nein |
| Wetterfühlige/Föhn-Geplagte | Föhn-Index | nur Explainer Föhn |
| Allergiker AT/CH | Pollen-Opt-in (Negativ-Auskunft!) | nur Orts-FAQ |
| Winterdienst/Hausmeister | Schneefallgrenze, Niederschlagsart, Schnee-Layer | nein |
| Journalisten/Datenredaktionen | Brand-Historie, Klimastreifen, Embed | nein |
| Lehrer/Studierende | Skew-T, Globus, Klimastreifen, Validierung | nein |
| Camper/Wohnmobil | Event-Score, Böen, Warnungen | nein |
| Klettersteig-/Kletter-Community | Blitzprognose, Gewitterpotenzial, Zellbahnen | nein |

---
