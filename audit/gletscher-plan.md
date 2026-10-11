# Gletscher-Monitor DACH – Implementierungsplan (Phase GL)

> Stand 11.10.2026. Eingangsdokument für Claude Code. Diagnose und Protokoll entstehen in `audit/gletscher.md`.
> Konzept: `audit/gletscher-konzept.md` (Export des claude.ai-Docs „Gletscher-Monitor DACH – Feature-Konzept buscosun“,
> https://claude.ai/artifact/7BcKxBhiCoKPCzKTfdmFti). UI-Vorgabe: `reference/gletscher-*.dc.html` und
> `reference/README-gletscher.md` (Design-Canvas https://claude.ai/artifact/TWgwJKGeQ6eC3ksDWKsVEY). Startprompt: `prompt-gletscher.md`.
> **Jans Vorgabe 11.10.2026: Das ganze Feature entsteht zuerst auf dem Feature-Branch `feat/gletscher` — nichts auf `main`.**
> Bei Widerspruch zwischen Konzept und Plan gilt der Plan; die Abweichungen stehen in §1. E-GL-1 bis E-GL-13 sind Vorschläge.
> Im Auto-Modus entscheidet Claude Code E-GL-1 bis E-GL-12 nach `prompt-gletscher.md` selbst und dokumentiert sie zur Prüfung;
> E-GL-13 (Merge-Zeitpunkt) bleibt bei Jan.

## 0 Kurzfassung

- **Was entsteht:** Kachel 13 und Seite „Gletscher“ (`/gletscher`, Steckbrief `/gletscher/<slug>`) für die rund 2 200 Gletscher in DE, AT und CH. Drei Zeitebenen: heute (Schmelze 0–336 h mit buscosun Fusion), Saison (Schneegrenze, Ausaperung, Albedo je Sentinel-2-Szene), Jahrzehnte (Umrisse, Längen- und Massenreihen, Projektion).
- **Wo es entsteht:** Code und Doku im Worktree `C:\dev\buscosun-web\.wt-gl` auf `feat/gletscher` (Muster `.wt-af`). Alle Gletscherdaten liegen im neuen Repo `jppetry/buscosun-glacier`. `buscosun-data`, `buscosun-archiv` und `main` bleiben unberührt, bis Jan merged (§2).
- **Reihenfolge:** Atlas und Messreihen zuerst (ehrlich ohne Modell), dann Satellit, dann Schmelze mit Eich-Gate, dann Steckbrief und Updates. Stufe 1 = GL-0 bis GL-5, GL-6 ist Ausbau.
- **Jahreszeit:** Die Schmelzsaison 2026 ist vorbei. Gate B1 und C prüfen an Rückrechnungen (Sentinel-2-Archiv Sommer 2025/2026, Hindcast 2023–2026 gegen GLAMOS). Der Winterbetrieb (B2) läuft nach der Session weiter, die Live-Bestätigung im Sommer 2027 ist Gate E.
- **Ehrlichkeit:** Herkunft an jedem Wert, Bezugsjahr an jeder Fläche. Ohne bestandene Eichung gibt es nur einen Schmelzindex ohne Einheit. Keine Freigabesprache, Gefahren nur als wörtliches Zitat.
- **Frist:** Am 30.11.2026 endet beim DWD das alte URL-Schema für ICON-D2/-EU samt regulärem Gitter (QUELLENMATRIX §6). Der Gletscher-Job liest `hzerocl` deshalb von Anfang an aus `/weather/nwp/v1/m/` (Dreiecksgitter, CCSDS).

## 1 Abweichungen vom Konzept (der Plan gilt)

| Nr. | Konzept | Plan | Grund |
| --- | --- | --- | --- |
| A1 | Arbeit wie bisher im Haupt-Arbeitsbaum | Worktree `C:\dev\buscosun-web\.wt-gl` (lokal ausgeschlossen in `.git/info/exclude`, wie `.wt-af/`), Branch `feat/gletscher` von `origin/main` | Jans Vorgabe; im Haupt-Arbeitsbaum laufen parallel andere Sessions auf `main`. Der Worktree liegt innerhalb des Startordners der Session, deshalb braucht der Auto-Modus keinen zweiten Ordner |
| A2 | E-GL-3: veränderliche Daten in `buscosun-data/glacier/`, Statisches in `buscosun-glacier` | **alles** in `buscosun-glacier`: `main` = Datenlinie `v1/`, verwaister Zweig `archive` = Tagesablage. `buscosun-data` und `buscosun-archiv` werden nur gelesen | keine Änderung an Produktions-Repos vor dem Merge; eigenes jsDelivr-Paketbudget; kein Force-Push der Kartenlinie. Ob die Linie später nach `buscosun-data` zieht, entscheidet Jan an Gate D |
| A3 | Schritt `glacier-melt` im `point.yml` | eigener Workflow `glacier-melt.yml` in `buscosun-glacier`; er liest den Cube nur (Sparse-Clone `point/` wie `sea.yml`) | der Punkt-Cron ist produktionskritisch und gehört nicht zum Branch |
| A4 | E-GL-6: rund 30 Leitgletscher mit je drei Höhen ins Punktarchiv | kein Eingriff ins Punktarchiv (Bereich AP9, `scripts/punktarchiv/**`). Die Gletscherlinie schreibt ihr eigenes Tagesarchiv auf dem Zweig `archive` | Zuständigkeit (agents.md §3); wirkt sonst sofort in Produktion |
| A5 | Gate B: 30 Tage Schneegrenzen live; Gate C: Eichung | B1 = Rückrechnung Juni–Oktober 2025/2026 (blockiert GL-3); B2 = 14 Tage Winterbetrieb (läuft nach der Session, blockiert nichts); C = Hold-out am Hindcast; neu E = Sommer 2027 | Saison vorbei; im Winter sind die Gletscher schneebedeckt |
| A6 | Antrieb „T2m, Globalstrahlung, …“ aus dem Cube | **Der Cube führt keine Strahlung.** `radGlob` gibt es nur im MOSMIX-Stationsprodukt (`src/point/cubeFormat.ts`, `STATION_EXTRA_PLANES`). Neu E-GL-11: Klarhimmel-Strahlung aus Sonnenstand und DEM mal Bewölkungsfaktor aus buscosun Fusion; ICON-D2/-EU `aswdir_s`/`aswdifd_s` als Vergleich | am Code gelesen 11.10.2026 |
| A7 | „Laut CLAUDE.md laufen alle 3D-Ansichten als MapLibre-Custom-Layer“ | falsch: `TowerStage.tsx` und `EventTerrainMap.tsx` nutzen **nur eingebautes MapLibre-3D** (Terrarium `raster-dem`, `setTerrain`, drapierte Quellen, `fill-extrusion`), keinen Custom Layer, keinen Shader. Die 3D-Bühne des Steckbriefs folgt genau diesem Muster | am Code gelesen; Shader bleiben STOPP & FRAGEN |
| A8 | Favoriten über die bestehenden Favoriten | eigene Liste `gl.favs` (gleiches Bedienmuster wie `FavoriteStar`); `favorites.ts` bleibt unverändert | Funktionserhalt: die Orts-Favoriten speisen andere Seiten |
| A9 | `CLAUDE.md`-Statuszeile und `MANUELLE-SCHRITTE.md` je Phase | auf dem Branch **nicht** anfassen. Status und Jans Schritte stehen in `audit/gletscher.md` §0 und §„Jans Schritte“, beim Merge werden sie übertragen | beide Dateien ändern sich auf `main` täglich: Konflikte und doppelte Abschnittsnummern |
| A10 | Bandtemperatur „wie `profileColumn.ts`“ | `pressureProfileFromCell` liefert nur Γ und Inversion und gibt `null` bei weniger als drei Niveaus. An Gletscherzellen (ps ≈ 700–800 hPa) bleiben nur t2m und t700. Die Säule wird deshalb selbst gebaut: [Modellboden mit t2m/ps, 700 hPa per `hypsometricHeight`], darüber `hzerocl` (Muster `freezingLevel` in `heightTimeModel.ts`) | am Code gelesen (`profileColumn.ts` Z. 83–92, `heightTimeModel.ts` Z. 199) |
| A11 | Diagramme mit nivo, Schmelze als Balken | `@nivo/line` (im Bundle) und schlichtes SVG für Balken; **kein `@nivo/bar`** | der Brandradar hat `@nivo/bar` bewusst abgelehnt (`budget.json`-Notiz); drei Verifier prüfen die Abhängigkeitsliste |

## 2 Branch- und Repo-Modell

| Repo | Zweig | schreibt | Inhalt |
| --- | --- | --- | --- |
| `buscosun-web` | `feat/gletscher` (Worktree `C:\dev\buscosun-web\.wt-gl`) | Claude Code: Commits und Push dieses Zweigs | Code `src/glacier/`, `scripts/glacier/`, Verifier, Doku, Workflow-Vorlagen |
| `buscosun-web` | `main` | nur Jan | Merge des Zweigs (PR), frühestens nach Gate C mit `GLACIER_LIVE = false` |
| `buscosun-glacier` (neu, öffentlich) | `main` (Default-Branch) | Claude Code und die Workflows | Datenlinie `v1/`, Workflows `.github/workflows/glacier-*.yml`, README mit Quellenvermerken, `.gitattributes` mit `* -text` |
| `buscosun-glacier` | `archive` (verwaist) | Workflow | Tagesablage für die spätere Bewertung (Gate E) |
| `buscosun-data`, `buscosun-archiv`, `C:\dev\buscosun-hindcast` | – | niemand aus dieser Phase | nur lesen: Cube, Stationsmessungen, Wahrheit, Hindcast |

**Regeln auf dem Branch**

- **Worktree anlegen.** Pfade mit Schrägstrich vorwärts, denn im Bash-Werkzeug fallen Backslashes weg:
  - `git fetch origin`
  - `git worktree add --no-track -b feat/gletscher C:/dev/buscosun-web/.wt-gl origin/main`
  - `.wt-gl/` in `.git/info/exclude` eintragen
  - erster Push mit `git push -u origin feat/gletscher`
- **Im Haupt-Arbeitsbaum** nur lesend arbeiten und nur mit `git --no-optional-locks status`, damit keine Index-Sperre mit der parallelen Session entsteht.
- **Erster Commit auf `feat/gletscher`:** die Planungsunterlagen (dieser Plan, Konzept-Export, Referenz, Startprompt). Sie liegen seit 11.10. **untracked** im Haupt-Arbeitsbaum. Nach dem Commit werden genau diese Dateien dort entfernt.
- **Commits:** klein je Teilschritt (Conventional Commits, Scope `glacier`, englisch). Gepusht wird nach jedem fertigen Teilschritt, nicht nach jedem Mikro-Commit; das schont Netlify-Branch-Builds, falls sie an sind.
- **Nach dem ersten Push** kein Rebase und nie `--force`. `main` kommt per `git merge origin/main` in den Zweig: vor jedem Gate und immer dann, wenn sich auf `main` `src/pointForecast/fusion/fusionRelease.ts` ändert. Konflikte werden auf dem Zweig gelöst, danach laufen die Gates neu.
- **Kein PR**, kein Merge nach `main`, kein Push auf `main`: das ist Jans Gate.
- **Worktree-Umgebung:** eigenes `node_modules` per `npm ci`, keine Junction (Falle aus CLAUDE.md: zwei Vite-Server teilen sonst `node_modules/.vite`). Dev-Server fest auf `npx vite --port 5191 --strictPort`. Playwright- und CDP-Ausgaben mit absoluten Pfaden innerhalb von `.wt-gl`.
- **Erwartbare Merge-Reibung:** `package.json` (neue `verify:glacier-*`), `budget.json` (Ratsche), `src/router/routes.ts`, `src/router/router.tsx`, `src/App.tsx`, `src/SearchPage.tsx`, die Rail (`featureRail`), `netlify.toml` (Shell- und Alias-Einträge nach dem Muster der Seewetter-Route). Jede Änderung dort bleibt klein und additiv.

**Producer-Ref statt Producer-auf-main.**

- Die Workflows in `buscosun-glacier` klonen `buscosun-web` sparse am Ref aus der Repo-Variablen `PRODUCER_REF`, voreingestellt `feat/gletscher`.
- Vorher prüfen sie mit `git ls-remote --exit-code --heads`, ob der Ref existiert. Fehlen Ref oder Producer-Dateien, melden sie „producer not on <ref> yet“ und enden grün, ohne zu schreiben (Muster `workflow-sea.yml`).
- Zeitpläne laufen nur auf dem Default-Branch eines Repos. Deshalb liegen die Workflows auf `main` des Gletscher-Repos und nicht auf einem Zweig von `buscosun-web`.
- **Vor dem Löschen des Zweigs nach dem Merge** setzt Jan `PRODUCER_REF=main`.

**Merge-Pfad (Jan, nach Gate C oder D):**

1. Auf dem Zweig das Edge-Bündel neu bauen (`npm run edge:share`, Edge-Gate). `ci.yml` prüft `verify:share` und bliebe sonst rot.
2. PR `feat/gletscher` → `main`, CI grün, Merge.
3. `PRODUCER_REF=main` setzen.
4. Die CLAUDE.md-Zeile und den MANUELLE-SCHRITTE-Abschnitt mit der nächsten freien Nummer aus `audit/gletscher.md` übertragen.
5. Erst an Gate D `GLACIER_LIVE = true`.

## 3 Ausgangslage im Code

Gelesen am Haupt-Arbeitsbaum am 11.10.2026 (lokales `main` = `b5cdbab`, `origin/main` = `1798fc5`), nicht verändert. Der Branch entsteht von `origin/main`; Jans noch nicht gepushte Commits auf `main` kommen später per Merge. Fast jedes Bauteil hat ein Vorbild aus den Phasen SW (Seewetter), AW (Autobahn) und dem Brandradar.

| Stelle | Heute | Für Gletscher |
| --- | --- | --- |
| `src/App.tsx` | `FeatureId` mit `… 'road' \| 'sea' \| 'feedback' …` | `'glacier'` ergänzen |
| `src/router/routes.ts` | `RouteId` mit `'seewetter'`; `subParam?: 'layer' \| 'lens' \| 'view' \| 'road' \| 'spot'`; Route `seewetter` mit Aliasen; Selbsttests `[SW]` | Route `gletscher`, Aliase `/gletscherradar`, `/gletschermonitor`; neuer `subParam: 'glacier'` (Pfadsegment = Gletscher-Slug); `noindex` bis Gate D; Selbsttests `[GL]`; Meta-Texte kurz halten (eager Routentabelle) |
| `src/router/router.tsx` | `sub('seewetter')` → `import('./pages/SeaRoute')` | `sub('gletscher')` → `pages/GlacierRoute` |
| `src/SearchPage.tsx` | `TOOL_TILE_COUNT = 12`, `toolTileCount()` zieht AW/SW je Flag ab; `SW_TILE_STYLE` mit `order: 12` in voller Breite; `PALETTE` Eintrag `'13'` Seewetter | Kachel 13 (Zähler 13, minus `glacierFlagFrom()`), Palette `'14'` „Gletscher“, Stichworte Gletscher, Schmelze, Schneegrenze, Hochtour |
| `src/sea/seaFlag.ts` | `SEA_LIVE`, `seaFlagFrom` (Query vor localStorage vor Default), `rememberSeaFlag` | `src/glacier/glacierFlag.ts` mit `GLACIER_LIVE = false`, `?gl=0\|1`, Schlüssel `gl` |
| `src/sea/*` | `SeaPage`, `SeaMap`, `SeaDock`, `SeaBand`, `SeaReadout`, `SeaCharts`, `seaContract`, `seaClient`, `seaState`, `seaView`, `seaDeck.css` mit den `--sw-*`-Tokens (lazy) | gleiche Aufteilung unter `src/glacier/`, Tokens `--gl-*` im lazy `glacierDeck.css`, nicht in `designTokens.css` (eagerCss-Ratsche) |
| `scripts/sea/workflow-sea.yml`, `sea-publish.mjs` | Vorlage fürs Daten-Repo; Sparse-Clone des Producers mit `public/climaGrid.json` (V-SW-18); Leerlauf-Wache; `sea-publish` ersetzt den **ganzen** `sea/v1`-Speicher (heilt), nie `--force` | Vorlagen `scripts/glacier/workflow-glacier-{static,sat,melt}.yml` mit `PRODUCER_REF`; `glacier-publish.mjs` mit Ersetzen **nur des eigenen Teilpfads** (§6) |
| `scripts/road/road-forecast.mjs` | buscosun Fusion in Node an 2 766 Achspunkten + 1 658 Stationen: `getPointForecastFromCube`, `dirStore`, `fusionRelease.ts` (`FUSION_CURRENT`), Memo je Chunk, `repeatVerdict` (V-AW-31); Punkte mit fest `country: 'DE'` | gleiche Kette an den Gletscherpunkten, Land je Gletscher (AT/CH/DE-Profil) |
| `src/point/cubeFormat.ts`, `profileColumn.ts` | Cube-Größen u. a. `t2m`, `ps`, `hModEff`, `precip`, `clct`/`clcl`/`clcm`/`clch`, `snowlmt`, `t925`/`t850`/`t700`, `rh*`; **keine Strahlung im Raster**; `hypsometricHeight` exportiert, `pressureProfileFromCell` nur Γ/Inversion (A10) | Bandtemperatur nach A10, Strahlung nach E-GL-11 |
| `src/nowcast/heightTime/heightTimeModel.ts` | Nullgrad aus T925/850/700 per `freezingLevel`, oberhalb 700 hPa keine Extrapolation (E-HZS-4) | Muster für die Säule; Reiter Tour; über 3 000 m `hzerocl` (E-GL-4) |
| `src/fire/detail/cogTiff.ts` | COG-Leser DOM-frei: `parseCogIfds`, `pickLevel`, `tilesFor`, `decodeTile`/`U16`/`F32` | Sentinel-2-Bänder im Producer (Node) |
| `src/fire/detail/fireSatImagery.ts`, `sentinelGeo.ts` | STAC Earth Search v1 (`STAC_URL`, nicht exportiert), `parseS2CogCandidates` (liefert nur `swir22`/`nir08`/`red`/`scl` und TCI), `pickGranule`; `sentinel-cogs` ist CORS-offen | Szenen je Gletscher; die fehlenden Bänder (B02/B03/B08/B11) **additiv** ergänzen, Brandradar byte-gleich; Vorher-nachher im Browser |
| `src/fire/detail/burnIndex.ts`, `worldCover.ts` | SCL-Maske; WorldCover-Spiegel | SCL zuerst; WorldCover 70 als Plausibilitätsmaske |
| `src/fire/FireCogViewer.tsx` | 10-m-Viewer vorher/nachher | Muster für den Vergleichsregler 2017 ↔ heute |
| `src/nowcast/cellTowers/TowerStage.tsx`, `towerFlag.ts`, `src/event/EventTerrainMap.tsx` | eigene MapLibre-Instanz, Terrarium `raster-dem`, `setTerrain`, Hillshade, drapierte Quellen; `?z3d=0`, `?ansicht3d=` | 3D-Bühne des Steckbriefs nach demselben Muster (A7) |
| `src/snowCap/*` | Schneefallgrenze als Fläche | „Neuschnee auf Eis“, Schneegrenze als Fläche |
| `src/favorites.ts`, `FavoriteStar.tsx` | Orts-Favoriten | Bedienmuster für `gl.favs` (A8) |
| `src/avalanche.ts`, `imageExport.ts` | SLF-CAAML; Bild-Export | Link aufs Lawinenbulletin; Grafik-Download |
| `budget.json`, `scripts/check-budget.mjs` | Ratsche eagerJs 109,7 (IST 109,6), totalJs 1 720 | Routeneintrag und Rail kosten erfahrungsgemäß +0,3–0,4 KB eagerJs (AW, SW) ⇒ Grenze mit Notiz anheben; alles andere im Lazy-Chunk |
| `@nivo/core`, `@nivo/line`, `@nivo/radar` 0.99 | im Bundle; `@nivo/bar` bewusst nicht | Linien mit `@nivo/line`, Balken als SVG (A11) |
| `reference/seewetter-*.dc.html`, `scripts/sea/sea-ui-diff.mjs` | Soll-Bild und Pixelvergleich | `reference/gletscher-*.dc.html`, `scripts/glacier/glacier-ui-diff.mjs` |
| `C:\dev\buscosun-hindcast` | Slots ab 24.05.2023 in Cube-Form, Wahrheit an 405 Punkten, darunter 24 Bergstationen über 1 800 m; Python-venv für die Leser | Eichung mit gemessenem Antrieb; Temperaturfehler in der Höhe; Vorbild für die Werkzeug-venv |

## 4 Arbeitspakete im Überblick

```
Stufe 1 (diese Phase, Branch feat/gletscher)
  GL-0 Spike ──▶ (A) ──▶ GL-1 Vertrag + Atlas ──▶ GL-2 Satellit ──▶ (B1) ──▶ GL-3 Schmelze ──▶ (C)
  messen,        E-GL     Inventare, Reihen,       Schneegrenze,     Rück-      ETI, hzerocl,      Hold-out
  Lizenzen,      1…12,    DACH-Lage ?gl=1          AAR, Albedo       rechnung   Eichung            grün
  Schwellen      Schwellen                                           2025/26
  eingefroren    (sha256)
  (C) ──▶ GL-4 Steckbrief ──▶ GL-5 Updates ──▶ (D) Merge + live (Jan)
          5 Reiter, 3D,        Feed, Ranglisten,
          Vergleich            Wochenkarte, Download
Danach (blockiert nichts in dieser Session)
  (B2) 14 Tage Winterbetrieb · (E) Sommer 2027 live bestätigt ──▶ GL-6 Ausbau (DEM-Epochen, Fließen, Winter/IMIS, Einbetten)

(A), (B1), (C) entscheidet im Auto-Modus Claude Code und dokumentiert sie; (B2) wird nach der Session belegt; (D) und (E) entscheidet Jan.
```

## 5 GL-0 Spike: erst messen, dann bauen

Kein Produktcode, nur Messskripte unter `scripts/glacier/spike/` und der Phasenbericht `audit/gletscher.md`. Rohdaten kommen nach `C:\dev\buscosun-glacier-cache\`, außerhalb aller Repos, und werden nie committet. **Plattengrenze 40 GB.** Sentinel-2-Bänder werden fensterweise per HTTP-Range gelesen und nach der Auswertung verworfen; auf der Platte bleiben nur die Zahlen je Szene und die Fixtures der Prüfer.

1. **Werkzeuge.** Für Shapefiles, Umprojektion (LV95 EPSG:2056, Österreich-Lambert EPSG:31287, UTM), Flächenüberlappung und topologiesichere Vereinfachung gibt es eine Python-venv unter `C:\dev\buscosun-glacier-cache\.venv` (Muster `buscosun-hindcast`). Die Pakete werden versioniert gepinnt und im Bericht gelistet. **`package.json` bleibt unverändert**; die Workflows installieren dieselben Pins im Runner.
2. **Inventare.**
   - Quellen: SGI2016 (+ SGI1850/1931/1973/2010), GI4 2015 (+ GI1–GI3), AGI 5 (Stand der PANGAEA-Freigabe), Paul et al. 2020, RGI 6.0 (GLIMS, frei). RGI 7.0 braucht den NSIDC-Login und ist Jans Schritt, nicht blockierend.
   - Zu zählen: Gletscher und Fläche je Land und je Größenklasse A/B/C.
   - Soll laut Konzept: rund 2 200 Gletscher, rund 1 000 km²; die Zahlen bestätigen oder belegt korrigieren.
3. **Lizenzen am Originaltext.** Jede Quelle der Konzept-Tabelle „Zusätzliche Daten“ (grün und gelb) mit Zitat und URL in `audit/gletscher.md`. Offen sind vor allem: GI1–GI3, Hugonnet 2021, Länder-DGMs, OGGM (bis zur Klärung rot), ÖAV-Jahrgänge 2023/24 und 2024/25 auf PANGAEA. Rote Quellen werden nie geladen.
4. **Messreihen.**
   - GLAMOS-Höhenbandbilanzen 2023/24, 2024/25 und, falls schon veröffentlicht, 2025/26, **getrennt nach Winter- und Sommerbilanz**: Gletscher, Format, Bänder.
   - Dazu WGMS FoG/AMCE, die ÖAV-Längen, Hintereisferner (UIBK) und Goldbergkees.
   - GloGEM CMIP6 v2: einmal laden (≈ 3,4 GB, Prüfsumme gegen Zenodo), nur RGI-Region 11 (Mitteleuropa, RGI-6-IDs) extrahieren, das Original danach löschen. Kein Workflow lädt es je erneut.
5. **Leitgletscher festlegen** (≈ 30): alle mit GLAMOS-Höhenbandbilanz, die WGMS-Referenzgletscher in AT, die größten je Region und die vier deutschen. Die Liste ist Vertrag für Archiv und Prüfung.
6. **Sentinel-2.**
   - Am echten STAC (`sentinel-2-l2a`) für Juni–September 2026 je Leitgletscher: nutzbare Szenen nach SCL.
   - **Prüfung der SCL an bekannten klaren Tagen:** Sen2Cor hält hellen Schnee oft für Wolke (Klassen 8/9/10), eine reine Klaranteil-Regel benachteiligt dann schneebedeckte Szenen. Gegenprobe mit SWIR: Wolke ist in B11 hell, Schnee dunkel. Daraus folgt die endgültige Maskenregel; maskiert werden zusätzlich SCL 0/1 (keine Daten, gesättigt), 2 (dunkle Flächen, Geländeschatten) und 3 (Wolkenschatten).
   - Zu messen: COG-Blockgröße, Bytes je Gletscher und Szene, Durchsatz auf einem GitHub-Runner (ein `workflow_dispatch` im Gletscher-Repo). Damit wird die Überschlagsrechnung des Konzepts (650 MB je Aufnahmetag, 16 GB je Saison) bestätigt oder ersetzt.
7. **Cube und buscosun Fusion in Node.**
   - An 5 Leitgletschern (Hintereisferner, Großer Aletsch, Rhonegletscher, Pasterze, Nördlicher Schneeferner) mit der Kette aus `road-forecast.mjs`, Land je Gletscher.
   - Zu messen: Zeit je Punkt für 0–336 h und welche Größen ankommen (T2m mit σ, `ps`, `hModEff`, `t700`, `clct`/`clcl`/`clcm`/`clch`, `precip` mit Phase, `snowlmt`).
   - Gegenprobe V-SW-18: Ohne `public/climaGrid.json` muss der Lauf rot werden, nicht still `null` schreiben.
8. **`hzerocl` und Strahlung.**
   - ICON-D2 und ICON-EU im **neuen** Schema `/weather/nwp/v1/m/` (Dreiecksgitter, CCSDS; `gribDecode.ts` kann CCSDS-AEC) und, solange es lebt, im alten zum Vergleich.
   - Zu messen: Dateien, Gitterzuordnung je Gletscherpunkt, Ankunftszeiten, Bytes je Lauf.
   - `aswdir_s`/`aswdifd_s` sind Mittel seit Laufbeginn und werden in Schrittmittel zurückgerechnet.
   - Gegenprobe an Jungfraujoch und Sonnblick gegen die Messung.
   - Außerdem prüfen, ob das Open-Meteo-Archiv des Hindcasts `freezing_level_height` führt; dann geht die Höhenkorrektur auch über 3 000 m.
9. **Messantrieb.** Was führen Hindcast-Wahrheit und Punktarchiv an den 24 Bergstationen: T, Feuchte, Wind, Niederschlag, Globalstrahlung (SwissMetNet misst sie, TAWES teils)? Daraus folgt, ob die Eichung mit gemessener Strahlung (ETI) oder nur mit Temperatur (Gradtag als Rückfall) läuft.
10. **Budget und Wachstum.**
    - JSON-Größen für Statisches (Umrisse in drei Vereinfachungsstufen), je Szene und je Schmelzlauf, gemessen gegen die jsDelivr-Grenzen (20 MB je Datei, 150 MB je Paket).
    - **Wachstum der Git-Historie je Jahr** (ohne Force-Push bleibt jede Datei für immer in der Historie). Obergrenze 1 GB je Jahr für `main`. Reicht das nicht, werden die Läufe schlanker: Bänder nur für Klasse A, die anderen als Gletschermittel, weniger Läufe am Tag. Ein Neuschreiben der Historie entscheidet nur Jan.
11. **Offene Prüfpunkte aus dem Konzept.** Gletscherschwundtag 2026 (Quellen nennen 29.06. und 02.07.), Stand der AGI-5-Freigabe, Zahl der Gletscher je Klasse.
12. **Schwellen einfrieren.** Bevor Rückrechnung und Hold-out laufen, werden die Gate-Kriterien für B1 und C mit Basislinie und Schwellen in `audit/gletscher/claims-frozen.md` geschrieben und per sha256 im Bericht festgehalten (Muster Phasen FV/FS).
    - Schwellen dürfen nur **strenger** als die Richtwerte in §11 sein.
    - Jedes Kriterium braucht einen Vergleich gegen eine Basislinie, z. B. Gradtag mit Standard-Lapse bzw. Klimatologie der Schneegrenze.

**Ausgang:** Gate A, Tabelle E-GL-1 … E-GL-12 entschieden (§12), Kriterien eingefroren.

## 6 GL-1 Vertrag und Atlas

### Vertrag

`src/glacier/glacierContract.ts` ist die eine Quelle der Wahrheit für Producer, Client und Prüfer (Muster `seaContract.ts`).

| Ebene | Regel | Folge |
| --- | --- | --- |
| Identität | eigene ID `gl_<land>_<slug>`, Zuordnung zu SGI/GI/AGI/RGI/WGMS über Flächenüberlappung ≥ 50 % in beide Richtungen; Ausnahmen in einer Tabelle mit Grund | sonst kein Eintrag, Fall im Log |
| Fläche | jede Fläche mit `refYear` und `source`; Länder mit verschiedenen Inventarjahren nie als gleiches Jahr | fehlt `refYear`, wird der Build abgelehnt |
| Herkunft | jeder Wert `measured`, `satellite`, `model` oder `official`; dazu `set`/`literature` für Parameter | Client zeigt das Herkunftszeichen; fehlt es, gilt der Wert als ungültig |
| Reihe | jede Längen- und Massenreihe genau einem Gletscher zugeordnet, Methode (glaziologisch, geodätisch) mitgeführt | sonst verworfen |
| Summe | Fläche je Land gegen amtliche Summe ± 2 % (CH SGI2016, AT GI4/AGI 5, DE BAdW 2025) | Build in Quarantäne |
| Geometrie | Umrisse geschlossen, ohne Selbstschnitt in jeder Vereinfachungsstufe, Fläche je Stufe ± 3 % zum Original | Stufe verworfen |
| Einheit | Schmelze in mm w. e.; „cm Eis“ nur für Bänder mit Eisoberfläche (Dichte 900 kg/m³ benannt) | sonst ungültig |
| Client | Satellitenwert älter als 20 Tage: „keine klare Szene seit … Tagen“; Schmelzlauf älter als 30 h: „Keine Daten“; Kill-Schalter | keine Zahl, kein Farbwert |

### Dateilayout in `buscosun-glacier` (versioniert, ein Formatwechsel heißt `v2`)

```
v1/index.json                           Zeiger: aktueller Build, jüngste Szene je Kachel, jüngster Schmelzlauf, Saisonstand (klein; Leser mit Hedge raw ↔ CDN wie obs/v1)
v1/status.json                          Linien, Prüfer-Bilanz, Kill-Schalter
v1/static/<build>/catalog.json          je Gletscher: ID, Namen (de/fr/it/rm), Land, Region, Klasse, Fläche + Bezugsjahr, Höhen min/median/max, Exposition, Lage, Inventar-IDs
v1/static/<build>/points.json           Punkte für Zoom ≤ 8
v1/static/<build>/outline/<region>.json Umrisse je Region in Stufen (aktuell + Epochen, je mit Bezugsjahr)
v1/static/<build>/hypso/<region>.json   Fläche je 50-m-Band
v1/static/<build>/series/<region>.json  Längen-, Massen-, Flächenreihen mit Quelle je Wert
v1/static/<build>/proj/<region>.json    GloGEM CMIP6 v2: Volumen/Fläche bis 2100 je SSP als Spanne, „unter 10 % von 2020“
v1/static/<build>/official.json         amtliche Zahlen mit Datum, wörtlichem Kernsatz und Link (GLAMOS, ÖAV, BAdW)
v1/obs/<jahr>/<kachel>/<datum>.json     je Szene: Klaranteil, Schneegrenze ± Streuung, AAR, Albedo je Gletscher
v1/season/<jahr>/<region>/<stand>.json  Saisonreihen je Gletscher, je Aktualisierung ein neuer Stand; alte Stände nach 7 Tagen gelöscht
v1/melt/<lauf>.json                     Schmelze je Gletscher 0–336 h mit Spanne; Läufe der letzten 72 h bleiben liegen
v1/melt/state/<datum>.json              Zustand je Band (Schneewasser, Oberfläche), Diagnose
v1/feed/<jahr>-W<woche>.json            Ereignisse mit stabiler ID, Quelle, Zeit
v1/card/<jahr>-W<woche>.png             Wochenkarte
```

**Veröffentlichung.**

- Bis auf `index.json` und `status.json` trägt jede Datei einen unveränderlichen Namen (Build, Szene, Stand, Lauf, Woche). Unter `@main` kommt sie deshalb richtig an, sobald `index.json` sie nennt. Ein Zwei-Push-Muster mit Commit-Zeigern ist so nicht nötig.
- `index.json` liest der Client mit Hedge raw ↔ CDN. Läufe und Stände bleiben mindestens 72 h liegen, damit ein 12 h alter `index.json` am CDN-Knoten (V-SW-28) nie ins Leere zeigt.
- `glacier-publish.mjs` ersetzt **nur den Teilpfad seiner Linie**, nie den ganzen `v1/`-Baum. `index.json` wird bei jedem Versuch frisch gelesen, geändert und geschrieben. Bis zu 6 Versuche, jeder auf frischem `origin/main`.
- Alle drei Workflows teilen die Concurrency-Gruppe `glacier-publish`.

**Prüfung nach einem Push.**

- Geprüft wird über `raw.githubusercontent.com` oder `@<sha>`, nie zu früh über `@main`: eine früh abgefragte neue Datei bleibt sonst als 404 am Edge hängen.
- Purges sind für Pfade von `buscosun-glacier` erlaubt (das Repo ist nicht in Produktion) und werden protokolliert.

### Statischer Build

`scripts/glacier/static-build.mjs` steuert die Leser für SGI, GI, AGI 5, Paul 2020, RGI 6, GLAMOS, WGMS, ÖAV, GloGEM (Region 11) und `official.json`. Die Geometrie-Schritte laufen über die venv aus GL-0.

Workflow-Vorlage `workflow-glacier-static.yml`: nur manuell und monatlich. Sie prüft die Quellen per `If-Modified-Since` und lädt GloGEM nie.

### Seite, erste sichtbare Stufe hinter `?gl=1`

- Route, Kachel 13, Palette 14, Rail-Eintrag, `glacierFlag.ts`, `GlacierRoute.tsx`, SEO-Shell mit `noindex`, Shell- und Alias-Einträge in `netlify.toml` nach dem Muster der Seewetter-Route.
- DACH-Lage nach `reference/gletscher-desktop-lage.dc.html` mit allem, was ohne Modell auskommt: Längenänderung zuletzt (gemessen), Flächenänderung seit dem Inventar (amtlich), jüngste Massenbilanz (amtlich), Lageband mit den amtlichen Zahlen und Datum, Ranglisten aus Messreihen.
- Die Metriken „Schmelze heute“ und „Ausaperung“ stehen sichtbar, aber gesperrt da („ab GL-2/GL-3“). Sie werden nicht versteckt und nicht mit Platzhalterzahlen gefüllt.

**Prüfer:**

- `verify:glacier-contract`: Regeln gegen echte Auszüge, mit Negativkontrollen.
- `verify:glacier-static`: Zuordnung, Summen, Geometrie, Rundweg.
- Routing-Selbsttests `[GL]`.
- Erster Teil von `verify:glacier-ui`: Flag aus = keine Kachel, kein Palette-Eintrag; mit `?gl=1` ist die Route da.

## 7 GL-2 Satellit: Schneegrenze, AAR, Albedo

- **Ablauf** (`scripts/glacier/sat-scan.mjs`):
  1. STAC-Suche nach neuen Szenen der letzten 72 h über den Gletscher-Hüllen, gruppiert je MGRS-Kachel und Tag.
  2. Zuerst die SCL (20 m) mit der Maskenregel aus GL-0. Ab ≥ 70 % gültiger Fläche folgen die Bänder per HTTP-Range mit `cogTiff.ts`: B03/B08/B11 für den NDSI, B02/B04/B08/B11/B12 für die Albedo.
  3. Klassifikation Schnee, Eis und Schutt. Schutt kommt maskiert aus SGI2016 und AGI 5.
  4. Schneegrenze = Höhe, bei der der Schneeanteil im 50-m-Band 50 % kreuzt (Copernicus DEM GLO-30). Daraus AAR und Albedo nach Liang/Naegeli.
  5. Gütemarken: Neuschnee, Geländeschatten bei tiefer Sonne (September/Oktober), Klaranteil.
- **Klassen wie im Konzept:**
  - A (≥ 1 km²): Schneegrenze, AAR, Albedo.
  - B (0,1–1 km²): Ausaperung in % (AAR) und Albedo-Anomalie, **keine Schneegrenze**.
  - C: keine Satellitenzahl, nur Bild und Inventar; das gilt für alle vier deutschen Gletscher.
- **Rückrechnung:** Juni–Oktober 2025 und 2026 aus dem Archiv des STAC. Daraus entstehen die Saisonkurven, die Klimatologie je Kalenderwoche aus TSLA 2000–2025 und Sätze wie „350 m höher als üblich für Anfang August“.
- **Winterbetrieb:**
  - Ganz schneebedeckt: Zustand „schneebedeckt“, nicht „Schneegrenze unter der Zunge“.
  - Im Spätsommer ganz schneefrei: „über dem Gipfel“.
- **Workflow-Vorlage** `workflow-glacier-sat.yml`: täglich um 16 und 22 UTC, Leerlauf in Sekunden ohne neue Szene. Ein Fehler nimmt nur die Satellitenwerte, nie den Rest.
- **Vorher-nachher** lädt der Browser direkt aus `sentinel-cogs` (Muster `FireCogViewer.tsx`). Bilder werden nicht abgelegt.
- **Bestand additiv erweitern:** `parseS2CogCandidates` um die fehlenden Bänder, `STAC_URL` exportieren. Der Brandradar bleibt byte-gleich; das belegen seine Verifier (`verify:fire-detail` u. a.).

**Prüfer:** `verify:glacier-sat` an echten Fixtures, gespeichert mit Prüfsumme (Lehre BW-1): eine klare Augustszene Hintereisferner, eine teils bewölkte, eine mit Neuschnee, eine schneebedeckte, die Sen2Cor teils als Wolke führt, und eine Oktoberszene mit Geländeschatten. Dazu Gegenproben auf das eigene Muster.

## 8 GL-3 Schmelze 0–336 h mit Eich-Gate

- **Modell:** Enhanced Temperature Index je 50-m-Band (Pellicciotti et al. 2005). M = TF·T + SRF·(1 − α)·G für T > T_T, sonst 0.
  - TF, SRF und T_T kommen aus der Eichung.
  - **Gerechnet wird stündlich:** zwischen den Cube-Schritten (bis 120 h dreistündlich, danach sechsstündlich) wird T linear interpoliert, die Strahlung folgt dem Sonnenstand. Grund: die Schwelle T_T ist nichtlinear.
- **Bandtemperatur (E-GL-4, A10):**
  - Freie Atmosphäre: Säule [Modellboden `hModEff` mit t2m/ps, 700 hPa über `hypsometricHeight`]; darüber verankert an `hzerocl` aus ICON-D2 (0–48 h) und ICON-EU (bis 120 h).
  - Nach 120 h gilt die Gerade aus T700 mit der mittleren Rate der ersten 120 h, gekennzeichnet `set`.
  - **Über dem Eis** gilt eine gedämpfte Übertragung T_Eis = a + b · T_frei mit b < 1 (Kühlung durch den Gletscherwind wächst mit der Wärme), a und b je Größenklasse geeicht (Literaturansatz z. B. Shea & Moore 2010).
  - Höhenkorrektur je Vorlauf-Bin aus dem Fehler an den Bergstationen (Hindcast + Punktarchiv). Sie lebt nur im Gletscher-Job, ist gekennzeichnet und keine Änderung an buscosun Fusion.
- **Strahlung (E-GL-11):**
  - Klarhimmel-Strahlung je Band aus Sonnenstand, Exposition und Horizont (DEM), getrennt nach direkt und diffus.
  - Der Bewölkungsfaktor aus buscosun Fusion wirkt getrennt auf beide Anteile; für Bänder über der Untergrenze tiefer Wolken zählen nur `clcm`/`clch`.
  - Der Vergleich mit ICON `aswdir_s`/`aswdifd_s` (zurückgerechnet aus Laufmitteln) entscheidet im Spike, ob ICON 0–120 h übernimmt.
- **Spanne ohne addierte Quantile** (Repo-Regel, `ci.yml` „keine addierten Quantile“):
  - Je Stunde sind p10/p50/p90 der Schmelze zulässig (Schmelze steigt monoton mit T).
  - Summen über 7 und 14 Tage entstehen aus **Szenarien**: T-Pfade gezogen aus σ von buscosun Fusion mit zeitlicher Korrelation (Parameter `set`, im Hold-out geprüft). Die Spanne ist das Quantil der Summen.
  - Bis das belegt ist, steht nur die p50-Summe da und die Spanne wird als `set` beschriftet.
- **Zustand je Band:**
  - Schneewasser aus Fusion-Niederschlag mal Schneeanteil seit 1. Oktober, mal Niederschlagsfaktor aus der Eichung, verbraucht durch die Schmelze.
  - Mit jeder klaren Szene genudgt: Bänder über der Schneegrenze sind Schnee.
  - Albedo aus der letzten Szene, sonst Schnee- und Eis-Startwerte (`literature`).
- **Ausgabe:** Schmelze heute, in 7 und in 14 Tagen in mm w. e. (bei Eisoberfläche zusätzlich cm Eis) und m³ Wasser. Dazu Nullgradgrenze und Nächte ohne Frost an der Zunge. Der modellierte Gletscherschwundtag ist GL-3b, mit Spanne und neben dem amtlichen Wert.
- **Eichung (E-GL-5):**
  - Antrieb mit den gemessenen Werten der Bergstationen (Hindcast-Wahrheit ab 24.05.2023), übertragen per Säule.
  - **TF, SRF, T_T, a, b gegen die Sommerbilanz** je Höhenband, **Niederschlagsfaktor gegen die Winterbilanz**, damit Niederschlagsfehler nicht in die Schmelzparameter wandern.
  - Fit-Jahre 2023/24 und 2024/25.
  - Hold-out: 2025/26 (sind die Bänder noch nicht veröffentlicht, gilt Leave-year-out über die beiden Fit-Jahre), Leave-glacier-out und Hintereisferner 2024/25 (Sommerbilanz −2 595 mm w. e., Jahresbilanz −1 793 mm w. e.).
- **Prognose-Prüfung:** Vor der ersten Anzeige mit Einheit läuft ein zweiter Hindcast, angetrieben mit der **Vorhersage** (Hindcast-Slots durch die Kette des Gletscher-Jobs) statt mit der Messung. Bewertet wird je Vorlauf-Bin gegen dieselben Bilanzen und gegen die Basislinie.
- **Eich-Gate:** Besteht der Hold-out die eingefrorenen Kriterien nicht, zeigt das Feature nur einen Schmelzindex ohne Einheit.
- **Workflow-Vorlage** `workflow-glacier-melt.yml`:
  - Ablauf: `point/index.json` raw lesen; nur bei neuem Lauf der Stufen t2/t3 rechnen, höchstens 4 × täglich (gemessenes Wachstum aus GL-0 hat Vorrang). Wiederholungen werden übersprungen (`repeatVerdict`).
  - Eingaben: Cube per Sparse-Clone `point/`; Producer-Checkout mit `public/climaGrid.json` (V-SW-18).
  - Ablage: Läufe 72 h. Je Lauf gehen ins `archive` die Reihen der Leitgletscher und die Fusion-Vorhersage an den 24 Bergstationen (für Gate E).

**Prüfer:** `verify:glacier-melt`:
- ETI gegen Handrechnung, stündliche Integration, Säule und `hzerocl`-Verankerung.
- Szenario-Summen (keine addierten Quantile), Rundweg des Formats, Negativkontrolle.
- `git diff --stat origin/main...HEAD -- src/pointForecast src/point scripts/point scripts/punktarchiv` bleibt leer.
- Fehlt `climaGrid`, ist der Job rot.

## 9 GL-4 Steckbrief

| Modul | Aufgabe |
| --- | --- |
| `GlacierBrief.tsx` | Rahmen Dock │ Karte/3D │ Readout; Reiter Heute, Saison, Langzeit, Tour, Quellen (mobil Heute, Saison, Tour, Langzeit); Zeitpunkt „Aufnahme ↔ Modell“ |
| `GlacierMap.tsx` | MapLibre, Terrarium-Hillshade, Umrisse (aktuell + Epochen mit Bezugsjahr), Schneegrenze der letzten Szene; die DACH-Lage nutzt dieselbe Komponente mit Punkten und Flächen |
| `GlacierStage.tsx` | 3D nach `TowerStage`/`EventTerrainMap`: eigene Instanz, `setTerrain`, drapierte Umrisse und Schneegrenze; kein Custom Layer, kein Shader; `?gl3d=0` als Rückfall |
| `GlacierCompare.tsx` | Vergleichsregler Sentinel-2 2017 ↔ jüngste klare Szene und Umriss früher ↔ heute (Muster `FireCogViewer`) |
| `GlacierCharts.tsx` | `@nivo/line` für Schneegrenze gegen Band 2000–2025, Längenreihe, Projektion als Band je SSP, Nullgradgrenze 48 h und 14 Tage; Schmelzbalken als SVG (A11) |
| `glacierTour.ts` | Nullgradgrenze gegen Gletscherhöhe, Nächte ohne Frost, Blankeis-Anteil, Neuschnee auf Eis; Links SAC-Tourenportal, alpenvereinaktiv, Hütte, Lawinenbulletin; Vorbehalt fest im Reiter |
| `glacierState.ts`, `glacierView.ts` | URL-Zustand: Gletscher, Reiter, Ansicht 2D/3D, Zeitpunkt, Ebenen; teilbar |

**Prüfer:**

- `verify:glacier-ui` deckt alle Reiter ab, dazu die Zustände „veraltet“, „Keine Daten“, „keine klare Szene“, „Eichung nicht bestanden“ und eine Klasse-C-Ansicht.
- `glacier-ui-diff.mjs` vergleicht gegen die Referenz bei 1440 × 900 und 390 × 844 (DPR 3).

## 10 GL-5 Updates

- **Feed „Was sich verändert hat“:** `scripts/glacier/feed.mjs` schreibt Ereignisse mit stabiler ID (Muster Ereignis-Registry des Brandradars). Ereignistypen:
  - neue klare Szene mit einer Schneegrenzen-Änderung ≥ 100 m
  - Hitzetag: Nullgrad über der Gleichgewichtslinie und Schmelze p50 über einer Schwelle
  - Neuschnee auf Eis
  - amtlicher Bericht (kuratiert in `official.json`, wörtlich mit Link)
  - Statusverlust laut Behörde

  Jede Zeile trägt Quelle und Zeit.
- **Ranglisten:** stärkste Schmelze heute (Modell), größter Saisonverlust (Modell), größter Längenverlust (gemessen) und verschwundene Gletscher mit Kriterium (amtlich). Jede Liste hat genau eine Herkunft.
- **Folgen:** Stern am Gletscher, Liste `gl.favs` lokal (A8), dazu „Neu seit deinem letzten Besuch“ aus Feed und letztem Besuch.
- **Wochenkarte:** jeden Montag die drei wichtigsten Änderungen als PNG im Gletscher-Repo, teilbar über die vorhandene Share-Linie. Das Edge-Bündel baut Jan neu (Merge-Pfad Schritt 1). Bis dahin ist der bekannte rote Fall in `verify:share` benannt.
- **Download:** CSV der Reihen je Gletscher mit Quellenvermerk; Grafik über `imageExport.ts`.

## 11 Verifikation und Gates

| Prüfer | prüft | ab |
| --- | --- | --- |
| `verify:glacier-contract` | Regeln, Pfade, Herkunft, Bezugsjahre, Einheiten gegen echte Auszüge, Quarantäne-Fälle | GL-1 |
| `verify:glacier-static` | ID-Zuordnung, Summen je Land, Geometrie je Stufe, Reihen-Zuordnung, Rundweg | GL-1 |
| `verify:glacier-sat` | Maskenregel, Klassifikation und Schneegrenze an gespeicherten Szenen, Klassen-Regeln, Winterzustand | GL-2 |
| `verify:glacier-melt` | ETI stündlich, Säule, `hzerocl`-Verankerung, Szenario-Summen, Eich-Gate-Schalter, Fusion und Cube unberührt | GL-3 |
| `verify:glacier-ui` | Zustände von Lage und Steckbrief, Flag aus, Herkunftszeichen an jeder Zahl | GL-1, GL-4, GL-5 |
| `glacier-ui-diff.mjs` | Pixelvergleich gegen `reference/gletscher-*.dc.html` | Gate D |

| Gate | Bedingung (Richtwerte; die in GL-0 eingefrorenen Werte dürfen nur strenger sein) | entscheidet |
| --- | --- | --- |
| A Spike | Bericht GL-0 liegt vor, E-GL-1 … E-GL-12 entschieden, Kriterien für B1 und C mit sha256 eingefroren | Claude Code (Auto-Modus), dokumentiert |
| B1 Satellit plausibel | Rückrechnung 2025 und 2026 für alle Klasse-A/B-Gletscher vollständig, jede Quarantäne begründet; Endsaison-Schneegrenze gegen gemessene Gleichgewichtslinie bzw. AAR (GLAMOS, WGMS, UIBK) mit Median-Fehler ≤ 150 m und besser als die Klimatologie; Vergleich mit TSLA 2025 an denselben Szenen | Claude Code, dokumentiert; **blockiert GL-3** |
| B2 Winterbetrieb | 14 Tage `glacier-sat.yml` ohne falsche Schneegrenze und ohne Prüfer-Ausreißer | belegt nach der Session; blockiert nichts, gehört zur Vorlage von Gate D |
| C Eichung grün | Hold-out (2025/26 bzw. Leave-year-out, Leave-glacier-out, Hintereisferner) mit mittlerem absolutem Fehler der Sommerbilanz ≤ 0,3 m w. e. und besser als die Basislinie (Gradtag mit Standard-Lapse); Prognose-Hindcast je Vorlauf-Bin dokumentiert; sonst Index ohne Einheit, Gate C rot | Claude Code, dokumentiert |
| D Merge und live | Prüfer grün, B2 belegt, Pixelvergleich bestanden, die fünf Selbstverifikations-Fragen aus CLAUDE.md und die fünf Gletscher-Prüffragen beantwortet; Merge-Pfad §2, dann `GLACIER_LIVE` | Jan |
| E Sommer 2027 | 30 Live-Tage Juni/Juli 2027: Prüfer ohne Ausreißer, Schmelze und Bandtemperatur gegen Messung (Bergstationen, IMIS), erste amtliche Saisonzahl 2026/27 gegen das Modell | Jan |

**Fünf Gletscher-Prüffragen vor Gate D** (zusätzlich zu den fünf aus CLAUDE.md)

1. Trägt jede Zahl ihr Herkunftszeichen und jede Fläche ihr Bezugsjahr?
2. Kann eine Modellzahl irgendwo als Messung oder als amtlich gelesen werden, etwa in einer Rangliste? Soll: nein.
3. Was sieht man ohne bestandene Eichung? Soll: Index ohne Einheit mit Hinweis.
4. Sagt der Tour-Reiter irgendwo „begehbar“, „sicher“ oder „frei“? Soll: nein; Links und Vorbehalt.
5. Was zeigt der Blaueisgletscher im Reiter Saison? Soll: keine Satellitenzahl, die BAdW-Zahl als Zitat mit Datum.

## 12 Entscheidungen

| Nr. | Frage | Vorschlag |
| --- | --- | --- |
| E-GL-1 | Name, Route, Kachel | „Gletscher“, `/gletscher`, Aliase `/gletscherradar`, `/gletschermonitor`; Steckbrief `/gletscher/<slug>`; Kachel 13, Palette 14, Flag `?gl=1` |
| E-GL-2 | Zuschnitt Stufe 1 | alle Gletscher als Atlas mit Messreihen; Satellitenwerte nach Klassen (§7); Schmelze für alle, für Klasse C als Gletschermittel |
| E-GL-3 | Ablage | `buscosun-glacier` für alles während der Entwicklung (A2); Umzug nach `buscosun-data` erst nach Gate D, falls Jan es will |
| E-GL-4 | Nullgradgrenze über 3 000 m | `hzerocl` aus ICON-D2/-EU (neues Schema) im Gletscher-Job. T600/T500 im Cube wären eine Änderung am Cube-Format und an buscosun Fusion: nur als Empfehlung an Jan, nie selbst |
| E-GL-5 | Eichung | Sommer- und Winterbilanz getrennt (§8), gemessener Antrieb, Hold-out wie §8, Prognose-Hindcast vor der Anzeige mit Einheit |
| E-GL-6 | Archiv | eigenes Tagesarchiv auf `archive` (A4), kein Eingriff ins Punktarchiv |
| E-GL-7 | Saharastaub | kein CAMS-Key; „dunkler als üblich“ aus der Albedo |
| E-GL-8 | Umrisse im Browser | GeoJSON in Stufen (Punkte bis Zoom 8, Flächen je Region ab Zoom 9) statt PMTiles; keine neue Abhängigkeit |
| E-GL-9 | Österreich-Umrisse | AGI 5 nach der PANGAEA-Freigabe, bis dahin GI4 2015 mit sichtbarem Bezugsjahr |
| E-GL-10 | Akzent und Tokens | Namensraum `--gl-*` im lazy `glacierDeck.css`, Akzent „Gletscher-Cyan“ `#1E87A8` (README-gletscher.md) |
| E-GL-11 | Globalstrahlung | Klarhimmel aus DEM und Sonnenstand × Bewölkungsfaktor aus buscosun Fusion; ICON-Strahlung 0–120 h nur, wenn der Spike sie klar besser misst |
| E-GL-12 | Diagramme | `@nivo/line` und SVG, keine neue Abhängigkeit (A11) |
| E-GL-13 | Merge-Zeitpunkt | nach Gate C mit `GLACIER_LIVE = false` (Rule 2) oder erst an Gate D — Jan |

## 13 Risiken

| Risiko | Wirkung | Gegenmittel |
| --- | --- | --- |
| Modellschmelze wird als Messung gelesen | falsche Rekordmeldungen, Vertrauensverlust | Herkunftszeichen, Eich-Gate, amtliche Zahl daneben, Ranglisten mit genau einer Herkunft |
| Tour-Reiter wird als Freigabe gelesen | Sicherheits- und Haftungsfrage | keine Freigabesprache, Links und Vorbehalt, Prüffrage 4 |
| Temperatur in der Höhe falsch (V-FI-13) | Schmelze systematisch falsch | Säule + `hzerocl`, gedämpfte Übertragung, Höhenkorrektur gemessen, Hold-out, Prognose-Hindcast |
| Strahlung nur parametrisiert (A6) | Schmelze an Schatten- und Sonnenhängen falsch verteilt | Exposition und Horizont aus dem DEM, direkt/diffus getrennt; Vergleich mit ICON-Strahlung; Eichung |
| DWD-Umstellung 30.11.2026 | `hzerocl` fällt weg | von Anfang an neues Schema; altes nur zum Vergleich |
| Sen2Cor verwechselt Schnee und Wolke | Szenen fehlen oder Schneegrenze falsch | SWIR-Gegenprobe, Maskenregel aus GL-0, Fixture dafür |
| Branch läuft lange neben `main` | Merge-Konflikte | `git merge origin/main` vor jedem Gate und bei Änderungen am Fusion-Register, additive Änderungen an geteilten Dateien, A9 |
| Workflows hängen am Feature-Branch | Rebase oder Löschen verschiebt den Producer | kein Rebase nach dem ersten Push, nie `--force`, `ls-remote`-Wache; `PRODUCER_REF=main` vor dem Löschen |
| Historie des Gletscher-Repos wächst | Repo zu groß, CDN langsam | Wachstum in GL-0 gemessen, Obergrenze 1 GB/Jahr, schlankere Läufe; Neuschreiben nur durch Jan |
| Drei Linien schreiben in ein Repo | eine Linie löscht die andere | Teilpfad-Ersetzen, `index.json` frisch je Versuch, eine Concurrency-Gruppe |
| Wolken, Neuschnee, Geländeschatten | Schneegrenze fehlt oder liegt zu tief | Maskenregel, Gütemarken, „keine klare Szene seit … Tagen“ |
| Schuttbedeckte Zungen | Eis wird als Fels gelesen | Schuttmasken aus SGI2016/AGI 5; der Umriss bleibt das Inventar |
| IDs passen nicht 1:1 | Reihen am falschen Gletscher | Überlappungsregel, Ausnahmetabelle, Verifier |
| Lizenz einer Quelle unklar | Rechtsrisiko | Prüfung am Originaltext in GL-0, rot = nie laden |
| Schwellen nach Sicht der Daten gewählt | Gates werden zur Formsache | Kriterien vor den Läufen eingefroren (sha256), nur strenger als die Richtwerte, Basislinie Pflicht |

## 14 Unterlagen und Startprompt

Im Haupt-Arbeitsbaum `C:\dev\buscosun-web` liegen seit 11.10.2026 nur Unterlagen, untracked und ohne Code. Der Startprompt verschiebt sie als ersten Commit auf `feat/gletscher`.

| Datei | Inhalt |
| --- | --- |
| `audit/gletscher-konzept.md` | Export des Konzepts, oben die Abweichungen zu diesem Plan |
| `audit/gletscher-plan.md` | dieser Plan |
| `reference/gletscher-desktop-lage.dc.html`, `gletscher-desktop-steckbrief.dc.html`, `gletscher-mobile-lage.dc.html`, `gletscher-mobile-steckbrief.dc.html` | Soll-Bild für den Pixelvergleich (interaktiv) |
| `reference/README-gletscher.md`, `reference/gletscher/` | Lesehilfe, Tokens und die 17 Bilder der Referenz |
| `prompt-gletscher.md` | Startprompt (englisch): Stufe 1 GL-0 … GL-5 im Auto-Modus auf `feat/gletscher`, eigenes Daten-Repo `buscosun-glacier`, `main` bleibt Jans Gate |
