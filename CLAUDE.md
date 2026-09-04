# CLAUDE.md — buscosun: Projekt-Verfassung für Claude-Code-Agenten

> **Stand: 2026-09-04.** **Aktuelle Phase: BW-12 / Gate GBW12 — Warm-Crons abgeschaltet, Lauf kommt aus dem Daten-Index**
> (`audit/bandbreite.md` §31). Ausgangspunkt war Jans Frage nach den Netlify-Kosten: gemessen **218
> Manifest-Commits in 7 Tagen ≈ 31 Produktions-Builds pro Tag** — für zwei Crons, die seit dem 2026-08-23
> **gar nichts mehr wärmen** (der Pfad wurde damals gelöscht, sie sind reine Manifest-Publisher).
> Die Auszählung fand den eigentlichen Treiber: **46 von 136 grib-Commits (34 %) änderten nichts als den
> `eps`-Abschnitt**, den der Client ausdrücklich nicht liest. Zwei Sofortfixe (Commit-SHA zählt nicht mehr
> als Änderung; `eps` fährt mit, statt umzulegen) nahmen ~26 % der Deploys weg — und der eigentliche Weg
> nahm den Rest: **der Client liest Lauf und Schritte aus dem `index.json` des Daten-Repos**, das er für
> den Repack-Abschnitt ohnehin holt. Beide Warm-Workflows tragen nur noch `workflow_dispatch`
> (Zeitplan auskommentiert, nicht gelöscht); `?repackrun=0` ist der benannte Rückfallweg. **JSON-Abrufe
> vor dem ersten Bild 3 → 1, GRIB über Netlify weiterhin 0, 0 Cron-Deploys** (nach dem Push belegt: drei
> fällige Zeitplan-Läufe fanden nicht statt). Rückwirkend über **24 Zyklen** gemessen: DWD publiziert
> Schritt 004 bei Lauf+50 min und 027 bei Lauf+67 min, der Repack-Batch landet 1–2 min später — der
> Index-Weg ist damit **früher** am neuen Lauf als der alte Weg, dessen Manifest den Repack-Abschnitt im
> Median erst bei Lauf+80,5 min trug (plus Netlify-Build). Der befürchtete Nachlauf existiert nicht.
> Kritische Fallen dieser Linie: die Schrittliste des Index enthält **Objekte** `{step,file,…}`, keine
> Zahlen — eine Fassung mit `Number.isInteger` war gegen synthetische Fixtures grün und gegen die
> Wirklichkeit für jede Familie `null`; ein **abgebrochener** Abruf ist kein Befund über seine Quelle
> (`AbortError` wurde als `absent` gemeldet und hinterließ einen Fehlalarm, den kein späterer Lauf mehr
> aufräumte); und wird eine Quelle durch eine andere ersetzt, **muss die Gesundheitsanzeige mitwandern**
> (`manifestHealth` kennt jetzt `primary`), sonst schweigt sie über den neuen Weg oder rauscht über den
> alten. `verify:repack` 321/321, routing/health/datenalter/warm-* grün, typecheck + Build grün,
> totalJs 1089,7/1109,8 KB. Gepusht als `26d2c7e` + `48ef19c`.
>
> **Drei wiederkehrende Mess-Lehren der Satelliten-Linie (SAT2h) gelten weiter:** ein Mikro-Prüfstand mit
> mehreren Varianten in EINEM Isolat misst nur *Verhältnisse*, keine Absolutwerte (⇒ ein Isolat je Variante);
> ein Leistungsanker misst immer auch die Maschine mit (Vergleiche nur innerhalb eines Laufs oder mit
> genannter Last); und Byte-Gleichheitstests brauchen eine Negativ-Kontrolle, sonst beweisen sie nichts.
> Dazu aus BW-12: eine Hochrechnung aus EINEM beobachteten Fall ist keine Messung (die „ein Drittel der
> Deploys"-Schätzung wurde beim Auszählen zu 13 % bzw. 0 %), und **synthetische Fixtures müssen die echte
> Datenform tragen**. PowerShell-Fallen: `Set-Content -Encoding utf8` kodiert eine BOM-lose UTF-8-Datei
> doppelt, und `node … 2>&1 | Out-File` macht aus stderr-Warnungen ErrorRecords und liefert Exit 1 —
> Verifier nie mit `2>&1` starten.
>
> **Historie:** Die vollständige Chronik jeder früheren Phase (Diagnose, Messwerte, Gate-Belege) steht
> in den jeweiligen `audit/<thema>.md`-Dateien — Übersicht in der Dokumenten-Landkarte unten und in
> den persistenten Session-Memories. Diese Kopfzeile hält bewusst nur den *aktuellen* Stand fest;
> Vergangenes gehört nach `context.md`/Git, nicht hierher (s. „Harte Regeln“).
>
> ⚠ **Bekannter Repo-Zustand (seit 2026-08-17):** `plan.md`, `checklist.md`, `context.md`,
> `mobile-design-guidelines.md`, **`roadmap.md` und `improvements.md`** fehlen im Arbeitsverzeichnis
> (Stand 2026-09-04 nachgeprüft). Bis zur Wiederherstellung gelten die `audit/*.md`-Dateien als Gate-Belege;
> V-Einträge (D-28) landen bis dahin im jeweiligen Phasen-Dokument. Alle Client-Änderungen seit 2026-07-30
> sind uncommitted, sofern nicht ausdrücklich vermerkt. Sessionspezifische Missionen stehen in
> `plan.md`/`prompt.md`, falls vorhanden.
>
> **Parallel offene Linie SEO/GEO (2026-09-04, wartet auf Jans Freigabe für Stufe 2):** Inventar, Audit und
> 11-Etappen-Plan liegen als `FEATURE-INVENTAR.md`, `SEO-AUDIT.md`, `SEO-PLAN.md`, `KEYWORDS.md`,
> `GEO-TESTSET.md`, `VERIFY.md` in der Repo-Wurzel (untracked, kein Code). Bekannte, noch nicht behobene
> Text-Defekte, die der Plan in Etappe 0 fasst: die Waldbrand-Metatexte in `src/router/routes.ts` bewerben
> zwei zurückgezogene Layer („amtliche Landesstufen", „Ausbreitungsrichtung"); der Wetterkarten-Lead
> verspricht Modellwahl und Zeit-Schieber, die im Erstbild wegen `START_NOW_ONLY` (`MapView.tsx`) erst
> nach dem ersten Slider-Zug erscheinen.

## Projekt

**buscosun** (Produktion: buscosun.com; die Kanonik ist seit 2026-09 durchgängig `.com` — Canonicals,
Sitemap, OG, `llms.txt`, robots; der frühere `.app`-Defekt ist behoben) ist eine DACH-fokussierte
Wetter-Visualisierungsplattform: reine Frontend-Web-App
ohne Backend, alle Wetterdaten werden **client-seitig** geholt und dekodiert (handgeschriebener
GRIB2-Decoder inkl. CCSDS-AEC).

**Mission:** buscosun zur führenden Wetterplattform im DACH-Raum ausbauen — Referenz in Qualität,
Nutzererlebnis, Geschwindigkeit, Genauigkeit, Innovation und Zuverlässigkeit. Zielgruppen-Fundament:
`docs/zielgruppen-dach.md`.

**Bereits umgesetzte Feature-Linien** (Details je in eigenem `audit/*.md`, s. Tabelle unten): Wetterkarte
mit 19 Layern + Fusion/Modell-Switcher; pfadbasiertes Routing (RT1); Regenradar auf denselben Layer-Modulen
wie die Wetterkarte (RL1); Bandbreiten-Linie BW-0…BW-11 (Netlify-Traffic für Wetterkarte + Regenradar über
jsDelivr-Repack + eigenes Daten-Repo praktisch auf 0 gebracht, inkl. Radar-/KONRAD-Spiegelung RD0–RD3);
komplette Waldbrand-/Brandradar-Linie (FIRMS/EFFIS-Grundlage, Brandflächen-Panel BP1–BP5, Aktiv-Feuer-Dynamik
AF1–AF4, Ausbreitungsrichtung SF1, Thermalanomalien-Trennung TA, Brand-Historie BH1–BH6, Brand-Dossier
BD1/BD2, Satellitenbilder SAT0–SAT2h vorher/nachher inkl. 10-m-COG-Viewer/SWIR/dNBR/SCL/WorldCover);
Geo-Versatz aller Kartenlayer auf ≤ 1 m korrigiert (KL0–KL11); 3D-Tourenansicht mit Schnitt- und
Geländebühne (R3D); Event-Fläche + Terrain-Bühne für die Eventplanung (EZ, ET); Layer-Ladezeit-Optimierung
(LE0–LE2). **Nicht mehr im Code** (bewusste Rückzüge mit Jans Freigabe): Feuerwetter/`fireSpread`-Rasterfläche,
`fireWind`/`fireDrought`/`fireVegetation`, „Amtliche Stufe" (`fireIndexNational`) — betroffene Bits bleiben
`null` reserviert.

> **Sonderregel für den Warn-Layer:** `warnings` ist der einzige Layer, der ein **amtliches Warnprodukt IST**;
> alle anderen verweisen darauf. Dort ist Warnsprache korrekt — aber **ausschließlich als wörtliches Zitat**,
> nie zusammengefasst, umformuliert, verschärft oder abgeschwächt. Zusätzlich gelten die Lizenzauflagen in
> `docs/API.md` §7. Dieselbe Zitatregel gilt für GeoSphere-Warntexte im Waldbrand-Kontext.

**Repo-weite Lehren aus der Waldbrand-Linie (gelten überall):**
1. **WFS-`maxfeatures` schneidet die jüngsten Datensätze ab**, nicht die ältesten — nie serverseitig deckeln;
   im Client nach dem BBox-Filter, jüngste zuerst.
2. **Der MapServer spiegelt die BBox-Achsenreihenfolge in die Ausgabe-Geometrie** — Anker prüfen die
   zurückgegebenen Koordinaten, nie Zählstände (`src/fire/sources/wfsAxis.ts`).
3. **`setData` auf `idle` ist eine Endlosschleife** — nur bei geänderter Referenz setzen.
4. **„Bestätigt"** braucht immer eine Quelle im selben Satz (EFFIS-Kartierung, EMS-Aktivierung). MoWaS wird
   nicht ausgewertet, nur verlinkt. „Unbestätigt" ist der Normalfall und wird so gesagt.
5. **Keine unklare Lizenz, keine NC-Klausel, kein Scraping** — Quellen ohne klare Lizenz oder mit NC-Klausel
   sind reine Deep-Links.

## Stack (verifiziert am Code, Stand 2026-07-31)

- React 19 + Vite 6 + TypeScript 5.7, MapLibre GL 5.6. Runtime-Dependencies nur: `maplibre-gl`, `react`,
  `react-dom`, `bz2`, `bzip2-wasm`, `jsfive`. Kein Router-Package außer `react-router` (seit RT1), keine
  State-, HTTP-, Chart-Bibliothek.
- **Nicht (mehr) im Code, auch wenn Alt-Doku es behauptet:** kein Three.js, **kein WebGPU** (nur WebGL —
  alle 3D-Ansichten sind MapLibre-Custom-Layer mit eigenen Shadern), kein WebLLM/KI-Meteorologe
  (`src/assistant` existiert nicht), kein Cloudflare R2/PMTiles, kein „AdaptiveQualityController" (real:
  `FrameGovernor` in `src/wind/perfGovernor.ts`).
- Hosting: Netlify (statisch + 3 Edge Functions: `/_dwd_wind`, `/_dwd_grib`, `/_firms` als gehärtete
  Cache-/Schlüssel-Proxys **+ 6 offene Rewrites** `/_dwd_opendata`, `/_meteoalarm`, `/_gfs`, `/_cscs`,
  `/_mf`, `/_ecmwf` auf DWD, MeteoAlarm, NOAA-S3, CSCS, Météo-France, ECMWF — sie reichen auch
  Verzeichnislistings der Upstream-Server durch, s. `SEO-AUDIT.md`), GitHub-Actions-Warm-Crons pflegen
  `public/latest-{grib,wind}.json` sowie den Radar-/Repack-Spiegel im Daten-Repo `buscosun-data`
  (ausgeliefert über jsDelivr; zweites Spiegel-Repo `jppetry/buscosun-worldcover` für dNBR). Daneben laden
  viele Quellen weiterhin **direkt** von Fremd-Origins (GeoSphere, geo.admin.ch, BrightSky, Open-Meteo,
  Nominatim, AWS/Element84, NASA GIBS, Planetary Computer).
- Vollständige Architektur: `architecture.md`. Entscheidungs-Log: `decisions.md`.

## Dokumenten-Landkarte

| Datei | Rolle |
|---|---|
| `CLAUDE.md` | Diese Verfassung: Regeln, Konventionen, Doku-Landkarte |
| `README.md` | Repo-Einstieg: Was ist buscosun, Funktionsumfang, Schnellstart, Doku-Index |
| `architecture.md` | Repo-weite Architektur (App-Shell, Layer-System, Quellen, Fusion, Transport, Deployment) |
| `decisions.md` | ADR-Log: getroffene Grundsatzentscheidungen + Status |
| `roadmap.md` | Strategische Handlungsfelder, bekannte Defekte, Wettbewerb, Priorisierung |
| `improvements.md` | **Verbesserungskatalog (Pflicht, D-28):** jede gefundene Verbesserung als V-Eintrag mit Mehrwert + Umsetzungsskizze |
| `agents.md` | Agent-Teams-Betriebsmodell: Rollen, Zuständigkeiten, Arbeitsabläufe, Definition of Done |
| `CONTRIBUTING.md` | Arbeitsweise, Gates, Ehrlichkeitsregeln, Definition of Done (für Menschen **und** Agenten) |
| `DEVELOPMENT.md` | Entwicklungsumgebung, Skripte, Verifier-Harness, Transport, Fallstricke |
| `plan.md` | Aktive Phase (oben) + historischer Phasenplan (Archiv, unten) — derzeit fehlend, s. Statusblock |
| `context.md` | Projektstand + Session-Log (Archiv) — derzeit fehlend, s. Statusblock |
| `checklist.md` | Gates mit Belegen — derzeit fehlend, s. Statusblock |
| `tests.md` | Verifikationsprotokolle V-* |
| `prompt.md` | Kickoff-Prompt für die nächste Session |
| `mobile-design-guidelines.md` | Verbindliche Mobile-UI-Patterns — derzeit fehlend, s. Statusblock |
| `docs/` | Fachspezifikationen (s. Tabelle unten) |
| `audit/*.md` | Diagnose-/Phasen-Befunde je Feature-Linie, mit Messwerten und Gate-Belegen (historisch, Referenz unten) |

**Feature-Linien-Audits** (jeweils Diagnose → Umsetzung → Gate, mit Messwerten und Fallstricken):

| Datei | Feature-Linie |
|---|---|
| `audit/brandradar-satellitenbilder.md` | SAT0–SAT2h: Satellitenbilder vorher/nachher, 10-m-COG-Viewer, SWIR/dNBR/SCL-Maske/WorldCover-Dämpfung, Performance-Härtung der Komposit-Schleife |
| `audit/route-3d.md` | R3D-1…R3D-8: 3D-Tourenansicht (Schnitt 1a/1b/1c + Geländekarte, Zeitplan, Ergebnis öffnet mit dem Gelände) |
| `audit/bandbreite.md` | BW-0…BW-11: Netlify-Bandbreite für Wetterkarte + Regenradar auf ≈ 0 (jsDelivr-Repack, PNG-Familien, Radar-/KONRAD-Spiegel `buscosun-data`, Service-Worker-Frischefallen) |
| `audit/radar-datenrepo.md` | RD0–RD3: Radar/KONRAD-Spiegel im Daten-Repo, zuletzt als fertige Bilder (PNG/JSON) statt Rohdaten |
| `audit/layer-erstbild.md` | LE0–LE2: Ladezeit Regenradar/Wetterkarte (Parser im Worker, Frühstart/`modulepreload`, Fetch-Prioritäten) |
| `audit/karten-layer-verortung.md` | KL0–KL11: Geo-Versatz aller Wetterkarten-Layer diagnostiziert und auf ≤ 1 m korrigiert (Warp-Meshes, Mercator im Shader) |
| `audit/radar-punktverortung.md` | RP0: Punktabfrage vs. Kartenposition für DE/AT/CH-Radar angeglichen |
| `audit/event-terrain.md` | ET0–ET5: Terrain-Bühne + Wetter-Readout der gezeichneten Event-Fläche |
| `audit/event-zone.md` | EZ0–EZ3: Event-**Fläche** (Rechteck) statt nur Punkt, Ecken-Abtastung |
| `audit/brandradar-detail-mitte.md` | BD2: Brand-Dossier in der Mitte umschaltbar „Karte \| Dossier" |
| `audit/brand-detail.md` | BD0/BD1: Detailkarte mit FRP-Verlauf, Wetterlage am Brandort, Ursache-Ehrlichkeit |
| `audit/regenradar-layer-angleich.md` | RL0/RL1: Regenradar nutzt dieselben Niederschlags-/Zellbahnen-/Schnee-Module wie die Wetterkarte |
| `audit/routing.md` | RT0/RT1: Pfadbasiertes Client-Routing (React Router) statt Hash-Fragmenten |
| `audit/brand-historie.md` | BH0–BH6: Brand-Historie über 24 h/7 d/Monat/Saison aus dem FIRMS-Archiv |
| `audit/thermalanomalien.md` | TA0–TA5: Trennung Vegetationsbrand vs. persistente Anlagen-Signatur, Reiter „Thermalanomalien" |
| `audit/aktivfeuer.md` | AF0–AF4: Aktiv-Feuer-Dynamik (Tendenz, Ausbreitung, Merkmale) + Flächen-Kalibriermodell aus dem Archiv |
| `audit/brandflaechen-panel.md` | BP0–BP5: Brandflächen als Polygone + Panel, Brand-Registry |
| `audit/brandflaeche-vorlaeufig.md` | VB0: eigene Brandflächen-Kontur vor EFFIS-Kartierung an 618 Archivpaaren widerlegt |
| `audit/waldbrand-ausbreitung.md` | SF0/SF1: Ausbreitungsrichtung aktiver Brände nach dem kanadischen FBP-System |
| `audit/waldbrand-forecast.md` | WF0–WF5: Waldbrand-Wetter-Forecast/FWI-Rechenkern auf ICON-D2 |
| `audit/waldbrand-cluster.md` | BC1: Brand-Cluster-Liste + konvexe Hülle |
| `audit/waldbrand-behoerden.md` | Behördendaten DACH: Achsen-Konvention, MoWaS-Befund, EMS, GeoSphere, CORINE |
| `audit/waldbrand-boden.md` | WT1: Bodentrockenheit aus ICON-D2 `smi` |
| `audit/waldbrand-wind.md` | WW1: Windlayer der Wetterkarte im Brandradar |
| `audit/waldbrand-firms.md` / `audit/waldbrand-effis.md` | F0–F2 (FIRMS Primärquelle) / E0–E3 (EFFIS/GWIS Sekundärquelle) |

**Achtung Alt-Doku:** `docs/reports/*`, `docs/seo-geo/*`, `buscosun-atmosphaere-*.md`, `buscosun_seo_geo_*.md`,
`prompt-loading.md` sind abgeschlossene Session-Artefakte — als Historie wertvoll, nicht als Ist-Beschreibung.
Bei Widerspruch gilt: **Code > `architecture.md`/`decisions.md` > Alt-Doku.**

**Fachspezifikationen unter `docs/`**

| Datei | Rolle |
|---|---|
| `docs/MAP.md` | 2D-Karte: Komponenten, Renderpipeline, Datenfluss, State, Konfiguration, Caching, Fehlerbehandlung, Performance |
| `docs/LAYER_SYSTEM.md` | Layer-Vertrag: die zwei Mechanismen, `LayerKey`-Verdrahtung, Z-Ordnung, Zielbild „Layer-Registry" |
| `docs/WEATHER.md` | Meteorologischer Layer-Katalog: bestehende + geplante Layer, Paletten-Ordnung, Länder-Abdeckungsmatrix |
| `docs/DATA_SOURCES.md` | Quellenbewertung DACH (DWD, GeoSphere, MeteoSchweiz, EUMETSAT, EUMETNET/OPERA, Copernicus) |
| `docs/API.md` | Externe Endpunkt-Kontrakte: URLs, Formate, Projektionen, Lizenz- und CORS-Lage |
| `docs/2d-layer-erweiterung.md` | Integrationskonzept + Umsetzungsplan für neue 2D-Layer |
| `docs/zuglinien-radar-spec.md` | Umsetzungsreife Spec: Zeitmodell, Playback, Frame-Budget, Prefetch, Verifier-Verträge |
| `docs/niederschlag-architektur.md` | Niederschlags-Ansicht „jetzt–2 h" im Detail (D-14) |
| `docs/high-end-radar-feature-catalogue.md` | Funktionskatalog Radar (Referenzspezifikation) |
| `docs/fusion-*.md` | Fusions-Engine (Spec, Paper, v2-Plan, 2D-Integration) |
| `docs/zielgruppen-dach.md` | Zielgruppen-Fundament |
| `docs/model-switcher-gate0.md` | Per-Land-Modell-Switcher |
| `docs/aktivfeuer-merkmale.md` | Merkmalsschema `FireFeatures` v1 + Kalibrierung |

## Harte Regeln (gelten für jede Session)

- **Oberste Direktive: Funktionserhalt.** Keine bestehende Funktion wird entfernt, versteckt oder
  „vereinfacht". Umgruppieren ja, Weglassen nein — Ausnahmen nur mit expliziter Freigabe durch Jan.
- **Diagnose-First:** Diagnose → Plan → Implement → Verify → Gate. Kein Code vor schriftlicher Diagnose
  (`audit/<thema>.md`). Gates werden nur mit Beleg (Screenshot-Pfad, Trace, Konsolen-Auszug,
  Verifier-Output) abgehakt.
- **Ein Thema = eine Phase = ein Gate.** Keine zwei Features parallel in einer Session anfassen. (Für
  parallele Agent-Teams gelten die Zuständigkeits- und Konfliktregeln in `agents.md`.)
- **Desktop-Regression = Phase fehlgeschlagen.** Mobile-Änderungen nur per Media Query isoliert.
  Breakpoints: 767 px (mobil) / 1439 px (Desktop-Groß) — keine Ad-hoc-Breakpoints. Safe-Area via
  `env(safe-area-inset-*)`.
- **STOPP & FRAGEN (Jan) bei:** Shader-/WebGL-Pipeline-Änderungen, Fusion-Engine-Änderungen, Löschen von
  Komponenten, Dependency-Upgrades, Änderungen an Edge Functions/Warm-Crons/Manifest-Mechanik, allem
  Irreversiblen. Prod-Dispatch der Crons ist Jans Gate.
- **Mobile-GPU-Fallen:** kein Verlass auf `EXT_color_buffer_float`; explizite `highp`-Deklarationen;
  RGBA8-Packing-Pfad nicht anrühren. Performance-Regelung ausschließlich über den `FrameGovernor`
  (FPS-Leiter zuerst, Trail-0,5× als letzter Hebel, Partikelzahl ist **kein** Hebel).
- **Ehrlichkeit ist Produktprinzip:** Unsicherheiten, Datenlücken und Länder-Asymmetrien (z. B.
  UV/Pollen/Warnungen DE-only) werden ausgewiesen, nie kaschiert. Experten-Layer (z. B. Rotation) tragen
  konservative Formulierungen — nie „Tornado"-Sprache.
- **Flag-Gating („Rule 2"):** Neue Rechenpfade ersetzen alte nie direkt; sie kommen default-off hinter
  Flags mit benanntem Fallback.
- **Design-Standard Command-Deck (D-27):** Alle neue UI entsteht im Command-Deck-System (hell, Sand/Ink,
  League Spartan, Topbar+Rail+Dock, Feature-Token-Namespaces); Alt-Themes werden migriert, nie erweitert.
- **Verbesserungs-Pflicht (D-28):** Jede gefundene Verbesserung wird als `V-NN`-Eintrag in
  `improvements.md` festgehalten — immer mit Mehrwert (für Jan verständlich) und Umsetzungsskizze.
- **Historie gehört nicht in diese Datei.** Was wann umgesetzt wurde, steht in `plan.md`/`checklist.md`/
  `context.md` bzw. bis zu deren Wiederherstellung in den `audit/*.md`-Dateien — der Statusblock oben hält
  nur den aktuellen Stand fest, keine Chronik.

## Verifikation

- **Kein Test-Framework** (bewusst, s. `decisions.md`): stattdessen Headless-Verifier `npm run verify:*`
  (ein `.mjs`-Skript je Thema unter `scripts/`, teils gegen echte Module/Live-Server importiert). Stand
  zuletzt ausgezählt (2026-08-28): **56 npm-Aliase / 57 Harnische** — Einzelzahlen je Phase (z. B.
  `verify:fire-detail` 296/296, `verify:route-3d` 564/564, `verify:layer-geometry`, `verify:repack` u. a.)
  stehen im jeweiligen `audit/<thema>.md`; bei Bedarf neu zählen statt fortschreiben (Lehre aus BW-1: eine
  fortgeschriebene Zahl war falsch). `npm run typecheck` muss vor jedem Gate grün sein.
- **UI-Verifikation:** Chrome DevTools MCP (Desktop 1440×900, iPhone 12 Pro 390×844 DPR 3). Emulation ist
  für WebGL **nicht** repräsentativ — GPU-kritische Aussagen brauchen Real-Device (scrcpy/ADB), Jan
  informieren. In-App-Browser pausiert rAF → WebGL-Karten nur im Vordergrund-Browser verifizieren.
- Vor jedem Gate: die fünf Selbstverifikations-Fragen schriftlich mit Beleg beantworten (1 Funktionserhalt
  einzeln, 2 Desktop pixelgleich, 3 Touch-Targets ≥ 44 px, 4 Konsole sauber, 5 keine Long Tasks > 200 ms).

## Sprache & Konventionen

- Dokumentation auf **Deutsch**, Prompts an Claude Code auf **Englisch**, Code/Kommentare/Commits auf
  Englisch (Bestand ist gemischt — bei Neuanlage Englisch).
- Commits: Conventional Commits, Scope = Feature-/Themenname. Keine Commits ohne Auftrag.
- Nach jeder Phase: `checklist.md` aktualisieren, 3–5-Satz-Fazit in `context.md` §Session-Log anhängen.
