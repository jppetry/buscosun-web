# buscosun

**DACH-fokussierte Wetter-Visualisierungsplattform.** Reine Frontend-Web-App ohne Backend: alle
Wetterdaten werden **client-seitig** von offenen, amtlichen Quellen geholt, dekodiert und gerendert —
inklusive eines handgeschriebenen GRIB2-Decoders (mit CCSDS-AEC) und eines RADOLAN-Binärdecoders.

Produktion: [buscosun.com](https://buscosun.com)

---

## Was buscosun anders macht

**Ehrlichkeit ist Produktprinzip.** Unsicherheiten, Datenlücken und Länder-Asymmetrien werden
ausgewiesen, nicht kaschiert: sichtbare Trefferquote, Spread-Bänder, Datenalter statt Abrufzeit,
konservative Sprache bei Experten-Layern. Wo für Österreich oder die Schweiz keine amtliche Quelle
existiert, sagt die App das — und verlinkt die zuständige Stelle.

**Trackerfrei, ohne Account, ohne Paywall.** Kein JS-Tracking, keine Analytics, keine Anmeldung.
Personalisierung ausschließlich lokal.

**Entscheidungen statt Zahlen.** Wetter zur echten Ankunftszeit entlang einer Route, Event-Phasen mit
Plan B, E-Bike-Akkuprognose, alpine Vertikalstruktur (Föhn, Inversion, Tal/Grat) für Laien
verständlich.

---

## Funktionsumfang

| Bereich | Inhalt |
|---|---|
| **2D-Wetterkarte** | 19 Layer: Wind (GPU-Partikel), Böen, Niederschlag jetzt–2 h, Schnee, Temperatur (höhenkorrigiert), Wolken, Satellit, Gewitterpotenzial, Rotation, Blitze, Blitzprognose, Stationen, Vertrauens-Schleier, Schneegrenze, Flow-Nowcast, Regen-Chance, **Zellbahnen** (KONRAD3D), **Hagel** (MESHS/POH), **amtliche Warnungen** (DE + CH) |
| **Waldbrand DACH** | Eigene Kartenansicht: EU-Gefahrenindex (GWIS FWI + Komponenten), amtliche Stufen DE (DWD WBI) / CH (BAFU), Feuerverbote CH, aktive Brände (NASA FIRMS, Fallback GWIS) mit Ereignisbildung und Bewertung bestätigt/plausibel/unbestätigt (EFFIS-Kartierung, Copernicus EMS, GeoSphere-Kontext, CORINE-Maske), Feuerwetter-Treiber, Bodentrockenheit, Wind, Brandflächen, Dürre/Vegetation, Brennmaterial, Schutzgebiete |
| **Nowcast** | 0–2-h-Radaransicht, Blitz-Alerts, alpiner Tal/Grat-Split |
| **Route** | GPX/FIT/KML-Import, Wetter zur echten Ankunftszeit, E-Bike-Akku |
| **Event** | 3-Schritt-Assistent, Phasen-Scoring, Plan B, ICS-Export |
| **Vorhersage** | Multi-Modell-Spread, Konfidenz, Trefferquoten-Rückblick |
| **Atmosphäre / 3D** | Föhn, Thermik, Isentropen, Skew-T, Vertikalschnitte |
| **Historie** | ERA5 seit 1940, 12 Diagrammtypen |
| **Globus** | MapLibre-Globe mit GFS-Live-Wind |

## Datenquellen

Ausschließlich offene, überwiegend amtliche Quellen ohne API-Key:

**DWD** (ICON-D2/EU/Global, AICON, RADOLAN-RV, Radar-WMS, CAP-Warnungen, Blitze, Pollen, UV,
Meteosat) · **GeoSphere Austria** (INCA, AROME, TAWES) · **MeteoSchweiz** (Radar, SMN,
ICON-CH1/CH2-EPS) · **Météo-France** (AROME, ARPEGE) · **ECMWF** (IFS, AIFS, AIFS-ENS) ·
**NOAA** (GFS) · **Bright Sky**, **Open-Meteo** (opt-in) · **Waldbrand:** NASA FIRMS (Area API über Edge-Proxy),
Copernicus GWIS/EFFIS/EDO/EMS, DWD WBI/GLFI, BAFU, EEA (Natura 2000, CORINE), GeoSphere Warn-API (Kontext AT).

Vollständige Bewertung: [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) ·
Endpunkt-Kontrakte: [`docs/API.md`](docs/API.md)

---

## Technik

**React 19 · Vite 6 · TypeScript 5.7 · MapLibre GL 5.6.**
Genau sechs Runtime-Abhängigkeiten: `maplibre-gl`, `react`, `react-dom`, `bz2`, `bzip2-wasm`,
`jsfive`. Kein Router, keine State-, HTTP- oder Chart-Bibliothek — alles handgeschrieben (D-06).

Hosting: Netlify (statisch) plus drei gehärtete Edge Functions als Cache-/Schlüssel-Proxys (`/_dwd_wind`, `/_dwd_grib`, `/_firms`).
GitHub-Actions-Warm-Crons halten die Manifeste frisch.

Architektur im Detail: [`architecture.md`](architecture.md)

---

## Schnellstart

```bash
node --version        # ≥ 22.6 erforderlich
npm install
npm run dev           # Vite-Dev-Server inkl. Upstream-Proxys
npm run typecheck     # muss grün sein
npm run build         # tsc -b && vite build && SEO-Generator
npm run preview       # Produktionsbuild mit denselben Proxys
```

Details, Verifier-Harness und Fallstricke: [`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## Dokumentation

**Grundlagen**

| Datei | Rolle |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Projekt-Verfassung: Regeln, Konventionen, Doku-Landkarte |
| [`architecture.md`](architecture.md) | Repo-weite Architektur |
| [`decisions.md`](decisions.md) | ADR-Log (D-NN) + offene Entscheidungen (O-NN) |
| [`roadmap.md`](roadmap.md) | Strategie, bekannte Defekte, Wettbewerb |
| [`improvements.md`](improvements.md) | Verbesserungskatalog (V-NN, Pflichtprozess D-28) |
| [`agents.md`](agents.md) | Betriebsmodell für Agent-Teams |
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | Entwicklungsumgebung, Skripte, Verifikation |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Arbeitsweise, Gates, Definition of Done |

**Fachspezifikationen (`docs/`)**

| Datei | Inhalt |
|---|---|
| [`docs/MAP.md`](docs/MAP.md) | 2D-Karte: Komponenten, Renderpipeline, Datenfluss, State, Caching |
| [`docs/LAYER_SYSTEM.md`](docs/LAYER_SYSTEM.md) | Layer-Vertrag, Registrierung, Z-Ordnung, Zielbild |
| [`docs/WEATHER.md`](docs/WEATHER.md) | Meteorologischer Layer-Katalog (bestehend + geplant) |
| [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) | Quellenbewertung DACH mit Vergleichsmatrizen |
| [`docs/API.md`](docs/API.md) | Externe Endpunkt-Kontrakte |
| [`docs/2d-layer-erweiterung.md`](docs/2d-layer-erweiterung.md) | Integrationskonzept + Umsetzungsplan neue Layer |
| [`docs/zuglinien-radar-spec.md`](docs/zuglinien-radar-spec.md) | Umsetzungsreife Spezifikation L5 + L6: Zeitmodell, Playback, Regenradar-Rückblick, Niederschlagszuglinien |
| [`docs/niederschlag-architektur.md`](docs/niederschlag-architektur.md) | Niederschlags-Ansicht im Detail |
| [`docs/high-end-radar-feature-catalogue.md`](docs/high-end-radar-feature-catalogue.md) | Funktionskatalog Radar |
| [`docs/fusion-forecast-spec.md`](docs/fusion-forecast-spec.md) | Fusions-Engine |
| [`docs/zielgruppen-dach.md`](docs/zielgruppen-dach.md) | Zielgruppen-Fundament |

**Bei Widerspruch gilt: Code > `architecture.md`/`decisions.md` > Alt-Doku.**
Abgeschlossene Session-Artefakte (`docs/reports/*`, `docs/seo-geo/*`, `buscosun-*.md`) sind Historie,
keine Ist-Beschreibung.

---

## Lizenz und Attribution

Der Code ist nicht öffentlich lizenziert. Die genutzten Wetterdaten stehen unter den Bedingungen
ihrer Anbieter — überwiegend **CC BY 4.0** (DWD/GeoNutzV, GeoSphere Austria, MeteoSchweiz).
Attribution erfolgt in der App an den jeweiligen Layern.

**Warnungen** unterliegen zusätzlichen Auflagen: DWD verlangt, dass die Darstellung sicherstellt,
dass Warnungen alle Nutzer „vollständig und unverzüglich" erreichen; MeteoSchweiz erlaubt die
Weitergabe nur unverzüglich und inhaltlich unverändert. Siehe [`docs/API.md`](docs/API.md) §7.
