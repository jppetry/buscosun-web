# CLAUDE.md — buscosun: Projekt-Verfassung für Claude-Code-Agenten

> **Stand: 2026-09-17 (früh).** Dieser Block trägt nur den AKTUELLEN Stand. Die Chronik der Phasen bis
> hierher liegt wortgleich in `audit/chronik-statusblock-2026-09-16.md` (ausgelagert am 16.09., weil der
> Statusblock zur Chronik geworden war) und je Linie in `audit/<thema>.md`.

## Aktueller Stand

**Phase FI — buscosun Fusion auf dem Punkt-Cube, 0–336 h, Antwort < 2 s** (`audit/fusion-implementierung.md`;
Plan von Jan freigegeben 16.09., Entscheidungen E-F-1…10 in §7.4). Architektur: **Integration** — der Cube
ist Hauptmember der bestehenden Fusion (`src/pointForecast/fusion/`, combine/dist/anchor bleiben); Zeitachse
109 native Cube-Schritte + markierte Interpolation; Gelände zur Laufzeit am Punkt, kein Terrain-Produkt im
Daten-Repo (307 MiB, kein Platz).

| Etappe | Stand | Beleg (Phasendokument) |
|---|---|---|
| AP0 Messbasis | fertig | §9.0 — Harness `verify:pv-latency` (esbuild-Lab + CDP, App-Bundle unberührt); heutiger Leser 3,0 s Desktop / 13,6 s Mobil-4G / 38,9 s 3G; kalter Chunk-TTFB p90 2,6 s |
| AP1 paralleler Leser | fertig, Gate grün | §9.2 — `readPointBundle` (`src/point/client/readPoint.ts`), IndexedDB-Cache je Pfadregel, Worker-Pool, Zwei-Skalen-DEM z11 + z8, Chunk-Adresse aus dem Index, `run.json@commit` nur für Provenienz, raw-Ausweichweg mit 2,5-s-Hedge; Kern warm 168 ms Desktop / 325 ms Mobil-4G, kalt 0,8–1,5 s / 2,2–2,3 s (bytes-gebunden); `verify:point-client` 112/112 |
| AP-PA2 AT/CH-Archivpunkte | fertig | §9.3 — Position = Messstelle, `rr1h` Stundensumme; seit PA3 **405 Punkte** (DE 203, AT 84, CH 101, LI 1, Nachbarn 16 — 5 leere POI-Stationen entfernt) |
| AP-PA3 Archiv-Befunde des Experten | **fertig (uncommitted), Push = Jans Gate vor 23:10 UTC** | §9.12 — 17 Befunde geprüft, 11 behoben: Schema **2** (Historie in `punktarchiv.mjs`, Schema 1 lesbar), Plan mit Stationshöhe (10 Gipfelstationen nahmen sich selbst nicht an), RV-Abdeckung als **Standortregel** 150 km um 17 DWD-Standorte (`sourceMatrix.ts`, an der rohen NaN-Maske gemessen: 99,53 %; der Kasten bis 14,1 °E lag an 36/410 Punkten falsch), Wahrheitsfenster ab Stundenboden (die 23-UTC-Stunde fehlte täglich), TAWES/SMN aus eigenen 10-min-Spalten + `fxh`, `ageAtSlotH`, `stepsCoverage`, `skipped`/`assignedAbsent`, Nowcast „außerhalb des Rasters" benannt, `stats.warnings`, `pointsFrom.rules`, `live.axis`; `toSegments` lückenlos (`resolve.ts`). **Jans Entscheidungen 17.09. umgesetzt (§9.12.5):** V-FI-25 MOSMIX-Taupunkt in die Live-Fusion (`sampleSources.ts`; gemessen 0/240 statt ~230/240 Klimatologie-Stunden an DE-Punkten) und V-FI-26 SMN-Böenspalte `fkl010z1` — **eigener Commit 2**; E-F-11 DE-Profil für DK/NL/BE/LU; E-F-12 Stationshöhe als h_true bei ≤ 250 m (`SELECTION.stationAtPointKm`, `elevationFrom`, `hTrue:station`). Gates: `verify:punktarchiv` **103/103**, `verify:point-data` **974/974**, `verify:point-client` **118/118**, `verify:pv-cube` **204/204**, `verify:pv-fusion` **227/227**, Build 241/241, Budget unverändert |
| AP12a Purge + Warm-up im Publisher | fertig, Abnahme (b) offen | §9.4 — `scripts/point/cdnSync.mjs`: jede geänderte Datei purgen (run.json zuerst), Index-Frischeprüfung, Warm-up mit 403/Frist als Fehlschlag, Budget je Job (Regel F); `verify:point-data` 969/969 |
| AP2–AP8 Algorithmus | **fertig (uncommitted), Desktop-Gate grün, Mobil-4G rot** | §9.5–§9.11 — `src/pointForecast/cubeSource.ts` hinter `pointSource: 'cube'` (Registrierung statt Import ⇒ App-Bundle unverändert, eagerJs 107,9), `fusion/{vertical,grid,uncertainty,terrainTerms,output}.ts`; `fuseCubePoint` = reine Funktion (Bündel, calib, nowMs, options): PAP 3 (2×2-Block, Nachbarn aus demselben Chunk) · PAP 4 (Fall A/B/C, Γ_inv-Deckel V-FI-15) · PAP 6 (σ_ens/σ_div/sys-only ⊕ Quantisierung ⊕ Höhenrest, Konfidenz-Score) · PAP 5 (Geometrie, Terme inaktiv bis A/A_uhi gemessen) · AP7 (Anker aus Messungen mit Frist, Radar-Flags `nowcastFallbackModel`/`stale`, Klimatologie-Schwanz, stündliche Achse: Station füllt, sonst markierte Interpolation, Nähte ungeglättet) · AP8 (`PointForecastV2`: je Stunde je Größe p10/p50/p90/σ, Verteilung, σ-Art, Konfidenz, Member mit Gewicht, Setzungen — Live-Pfad byte-gleich, `verify:pv-fusion` 222/222). Motor nur additiv angefasst (`errorSigma`, `cloudTotal`, lesender Hook `onWeights`). Gates: `verify:pv-cube` **201/201** (13 Blöcke, in CI), `verify:point-client` 112/112, Build 241/241, Budget unverändert. Lab (`--gate`, 4 Orte): **Desktop kalt p50 ≈ 1,0 s / p95 1,9 s, warm 0,4 s — §6 grün; Mobil-4G kalt 2,5 s — rot, Kern allein 2,1–2,4 s (bytes ⇒ AP12)**. Fristen (set): progressive Produkte 1 800 ms ab Start, Obs 1 500 ms + 500 ms Gnade. **Keine Genauigkeitsaussage** (kein Backtest) — Vergleich Cube gegen Live-Pfad an 10 Orten in §9.5.4 (T 57/100 innerhalb 0,5 K, Flachland 29/30; Bergorte: Station trägt, V-FI-13) |
| AP9 Backtest · AP11 Consumer · AP12 Härtung (Mobil) · AP10 Kalibrierung | **nächste Etappen** | AP9 über das Archiv (`verify:pv-score --archive`, Sammler nimmt den Cube-Pfad mit `pointSource: 'cube'`); 0–48 h bewertbar ab jetzt, 336 h ab 30.09., 30 Fälle je t3-Bin ≈ Ende Oktober; AP12 = Ebenen-Ranges/progressives Laden für Mobil (E-F-3) |

**Jans Gates (`MANUELLE-SCHRITTE.md` §15/§16):** Push von `buscosun-web/main` mit AP1 + PA2 + AP12a + **PA3 +
E-F-11/12** als Commit 1 **vor 23:10 UTC** (der Archiv-Cron klont `main` täglich 23:10 UTC; der Punkt-Cron fährt danach
den neuen Publisher), **V-FI-25/26 als Commit 2** direkt danach (Live-Pfad: MOSMIX-Taupunkt, SMN-Böe); Kopie von
`scripts/repack-repo/workflow-point.yml` ins Daten-Repo (optional, +11 Zeilen); Abnahme (b) mit
`npm run verify:pv-latency -- --only=bundle --profiles=desktop-none` nach dem ersten Cron-Job mit neuem
Publisher (Basis kalt Kern p50 1 458 ms).

**Offene Befunde der Phase:** V-FI-5 (jsDelivr antwortet vorübergehend 403 nach 1–8 s, auch statt 404;
Leser: kein Retry, Sonde = „nicht da", Hedge + raw), V-FI-6 (statische Produkte `@main` + 12 h statt
gepinnt), V-FI-7 (Radar-Slots am Edge immer MISS — Warm-up im Spiegel-Workflow wäre S&F; bis dahin trägt
München kalt in 0–3 h das Modell, benannt), V-FI-9 (kosmetisch; V-FI-8 in AP8 behoben), V-FI-11 (Live-Pfad
Zugspitze +0 h 12,6 °C auf 2 962 m), V-FI-13 (Bergorte: Cube-Member < 5 % — der Motor-Prior 0,0035 K/m
Höhenrest dominiert, AP10 misst), V-FI-17 (z0 nicht im Bündel ⇒ Wind-Blending inaktiv), V-FI-20 (stündliche
Achse +100–200 ms auf Mobil), V-FI-21 (v2-JSON 1,1 MB je Punkt — Transport braucht kompakte Kodierung),
V-FI-22 (statische Produkte auf dem kritischen Pfad). **Aus PA3 (§9.12.4; V-FI-25/26 am 17.09. behoben, §9.12.5):**
V-FI-24 (Live-Pfad rechnet an 31 Punkten mit DEM-Höhe > 50 m unter der Station; `getPointForecast` nimmt keine
Höhe an — der Cube-Pfad nimmt seit E-F-12 die Stationshöhe bei ≤ 250 m), V-FI-27 (Registry ordnet ICON-CH2-EPS
t1 und CLAEF t2 zu, der Producer liest sie dort nie), V-FI-28 (ICON-CH1 STAC-500 ohne Rückfall), V-FI-29
(INCA/RZC-Hüllen größer als das Raster), V-FI-31 (Legacy-Feld `relativeHumidity` des Live-Pfads an DE-Punkten nur in
Stunde 0 belegt — MOSMIX hat keine RH; `fusion.humidity` ist seit V-FI-25 da, das Feld füllt sich daraus nicht: Jans
Gate). AP9-Regel: die 23-UTC-Stunde von TAWES/SMN steht in zwei Slots — nach Punkt und Stempel deduplizieren. Long
Tasks sind in headless-shell nicht messbar (AP11 Real-Device).

**Weitere offene Linien:** AROME-Ablösung im Live-Rückfallpfad vor 2026-11-01 (U-19); V-PD-62 (`hmodel.changed`
feuert bei jedem ECMWF-Laufwechsel); E-U-13 Archivgröße (≈ 6,7 GB/Jahr bei 410 Punkten); SEO/GEO Stufe 2
wartet auf Freigabe (`SEO-PLAN.md`, Etappe 0 fasst die bekannten Text-Defekte); Teilen SH7 (Vorschaubild zur
Laufzeit) freiwillig; Punkt-Vorstufe E-D-1…3, PD-E E-E-1…3 offen (je im Audit).

**Betrieb:** Punkt-Cron im Daten-Repo im Drei-Stunden-Takt (t1 `40 1,4,…,22`, t2 `30 4,10,16,22`, t3 `55 9,21`,
`JOB_MAX_MIN_BY_TIER` {20, 15, 10}); Archiv-Cron in `buscosun-archiv` täglich 23:10 UTC; Kartenlinie (Repack,
Radar-Spiegel) unverändert. Publikationslauf ≠ Quell-Lauf (§26), Bau-Ablage `point/.build`, Aufbewahrung je
Stufe {9, 24, 24 h}.

## Dauerhafte Lehren und Werkzeugfallen

Verkürzt aus den Phasen seit Juli; Herkunft, Messwerte und Belege stehen in den `audit/*.md`.

**Messen und belegen**
- Ein Format-Selbsttest beweist nichts über den Baum, den der Producer schreibt; ein Verifier gegen selbst
  erfundene Werte ist grün und trotzdem falsch — Fixtures tragen die echte Datenform, Gate-Zahlen werden neu
  gezählt statt fortgeschrieben (BW-1).
- Eine Prüfung, die eine Abwesenheit behauptet, braucht eine Gegenprobe auf ihr eigenes Muster; ein
  Byte-Gleichheitsbeweis braucht eine Negativkontrolle.
- Ein Leistungsanker misst die Maschine mit: nur innerhalb eines Laufs vergleichen, ein Isolat je Variante,
  der erste Abruf eines Browser-Prozesses ist Verbindungsaufbau (im Lab `prime`).
- Eine Hochrechnung aus einem Fall ist keine Messung; quellenweise Messungen sind blind für das Zusammenspiel
  (Speicher, Laufzeit) — der volle Lauf muss einmal gemessen sein.
- Zeitliches Verhalten ist oft rückwirkend lesbar (DWD-Verzeichnisse, Actions-Läufe, Git); aber die Kartenlinie
  force-pusht das Daten-Repo — Dateilisten sofort lesen oder vorher/nachher schnappschießen.
- Was in den Daten liegt, entscheidet, nicht die Doku: Registry-Angaben (Läufe, Horizonte, Einheiten, Level)
  sind am Verzeichnis zu messen; ein 404 ist ein Befund, ein Abbruch keiner (`AbortError` ≠ absent).

**Daten-Repo und CDN**
- Ein SHA ist erst unveränderlich, wenn er auf dem Remote steht (ein Rebase schreibt Commits neu); `--amend`
  macht Manifest-SHAs ungültig ⇒ Datencommit → Push → SHA lesen → Manifest → zweiter Push.
- `git add` in einem sparse Checkout verwirft außerhalb der Muster still mit Exit 0; ein Pfad, den es nicht
  gibt, bricht `git add` ab; `.gitattributes` mit `*.bin -text` vor dem ersten `add`.
- jsDelivr: ein Cache-Eintrag je `Accept-Encoding`-Variante; `@main` löst bis ~3 min nach dem Push auf den
  alten Commit auf; eine 404 hängt am Edge (purgen); 403 kommt vorübergehend nach Sekunden (V-FI-5);
  veränderliche Dateien unter festem Pfad nur `@<commit>` lesen, unveränderliche `@main`; purgen nur, was
  wirklich auf `origin/main` liegt.
- Nie ein Purge oder Cron-Dispatch gegen Produktion von der lokalen Maschine — Jans Gate. Warm-up (GET) ist
  erlaubt.
- Streuungen werden nur mit dem Faktor skaliert, nie mit dem Versatz; Quantile einer Quelle nie mit σ
  verrechnen; Profilfelder nie mitteln; MOSMIX nie ins Gitter.

**Werkzeuge**
- Der Bash-Kanal schneidet Kommandos bei ≈ 8 KB ab — große Dateien nur per Write-Werkzeug; `\b` und `[^\n]`
  in Python-in-Bash werden zu echten Bytes (Backspace, Zeilenumbruch) — Edit-Werkzeug benutzen.
- PowerShell: Verifier nie mit `2>&1` starten (ErrorRecords ⇒ Exit 1); `Set-Content -Encoding utf8` kodiert
  BOM-lose UTF-8 doppelt; `npm run` schluckt `--`-Argumente ⇒ Skripte direkt mit
  `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs …` aufrufen.
- `chrome-headless-shell --screenshot` tut nichts mehr; CDP über `scripts/lib/headlessShot.mjs` bzw.
  `cdpBrowser.mjs`; Chrome-MCP drosselt rAF (FPS-Traces unbrauchbar); In-App-Browser rendert WebGL nur im
  Vordergrund; `window.print()` blockiert die Prüfsitzung; `PerformanceObserver('longtask')` liefert in
  headless-shell nichts.
- `decompressBz2` ist asynchron; reines JS-bz2 liefert bei manchen Läufen richtige Länge und falsche Bytes ⇒
  Binary bevorzugen, jede Dekodierung verifizieren; `spawnSync` blockiert einen In-Process-HTTP-Nachbau.
- Verifier prüfen Listen statt Zahlen (Dependencies), Texte hängen an Konstanten statt an Stichworten;
  V-Einträge landen bis zur Wiederherstellung von `improvements.md` im jeweiligen Phasendokument.

## Projekt

**buscosun** (Produktion: buscosun.com; die Kanonik ist seit 2026-09 durchgängig `.com` — Canonicals,
Sitemap, OG, `llms.txt`, robots) ist eine DACH-fokussierte Wetter-Visualisierungsplattform: reine
Frontend-Web-App ohne Backend, alle Wetterdaten werden **client-seitig** geholt und dekodiert
(handgeschriebener GRIB2-Decoder inkl. CCSDS-AEC).

**Mission:** buscosun zur führenden Wetterplattform im DACH-Raum ausbauen — Referenz in Qualität,
Nutzererlebnis, Geschwindigkeit, Genauigkeit, Innovation und Zuverlässigkeit. Zielgruppen-Fundament:
`docs/zielgruppen-dach.md`.

**Bereits umgesetzte Feature-Linien** (Details je in eigenem `audit/*.md`, s. Tabelle unten): Wetterkarte
mit 19 Layern + Fusion/Modell-Switcher; pfadbasiertes Routing (RT1); Regenradar auf denselben Layer-Modulen
wie die Wetterkarte (RL1); Bandbreiten-Linie BW-0…BW-13 (Netlify-Traffic für Wetterkarte + Regenradar über
jsDelivr-Repack + eigenes Daten-Repo praktisch auf 0, inkl. Radar-/KONRAD-Spiegelung RD0–RD3, Windlayer
vollständig aus dem Daten-Repo); Layer-Ladezeit (LE0–LE2, LZ0–LZ1); komplette Waldbrand-/Brandradar-Linie
(FIRMS/EFFIS-Grundlage, Brandflächen-Panel BP1–BP5, Aktiv-Feuer-Dynamik AF1–AF4, Ausbreitungsrichtung SF1,
Thermalanomalien-Trennung TA, Brand-Historie BH1–BH6, Brand-Dossier BD1/BD2, Satellitenbilder SAT0–SAT2h
vorher/nachher inkl. 10-m-COG-Viewer/SWIR/dNBR/SCL/WorldCover); Geo-Versatz aller Kartenlayer auf ≤ 1 m
korrigiert (KL0–KL11); 3D-Tourenansicht mit Schnitt- und Geländebühne (R3D); Event-Fläche + Terrain-Bühne für
die Eventplanung (EZ, ET); „Auswahl teilen" SH0–SH6 (Zustand lesbar in der URL, Share-Sheet, Open Graph je
Zustand über die Edge Function `og-meta`); Punktdaten-Linie PD-A…PD-E (Punkt-Cube `point/` im Daten-Repo,
Schema 5, 57 Ebenen, drei Stufen bis 336 h, Stationsprodukt MOSMIX-L, `static/hmodel` + `static/urban`,
Drei-Job-Cron) und Punktarchiv PA1/PA2 (`buscosun-archiv`, täglicher Slot). **Nicht mehr im Code** (bewusste
Rückzüge mit Jans Freigabe): Feuerwetter/`fireSpread`-Rasterfläche, `fireWind`/`fireDrought`/`fireVegetation`,
„Amtliche Stufe" (`fireIndexNational`) — betroffene Bits bleiben `null` reserviert.

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
  State-, HTTP-, Chart-Bibliothek. (Die Brandradar-Linie führt zusätzlich `@nivo/*`; der Verifier prüft die
  Liste der Laufzeit-Abhängigkeiten, nicht ihre Zahl.)
- **Nicht (mehr) im Code, auch wenn Alt-Doku es behauptet:** kein Three.js, **kein WebGPU** (nur WebGL —
  alle 3D-Ansichten sind MapLibre-Custom-Layer mit eigenen Shadern), kein WebLLM/KI-Meteorologe
  (`src/assistant` existiert nicht), kein Cloudflare R2/PMTiles, kein „AdaptiveQualityController" (real:
  `FrameGovernor` in `src/wind/perfGovernor.ts`).
- Hosting: Netlify (statisch + 4 Edge Functions: `/_dwd_wind`, `/_dwd_grib`, `/_firms` als gehärtete
  Cache-/Schlüssel-Proxys, dazu seit SH6 `og-meta` auf den neun teilbaren Routen — sie schreibt NUR
  für Vorschau-Crawler die `og:*`-Tags je Zustand und lässt jeden Browser unverändert durch **+ 6 offene Rewrites** `/_dwd_opendata`, `/_meteoalarm`, `/_gfs`, `/_cscs`,
  `/_mf`, `/_ecmwf` auf DWD, MeteoAlarm, NOAA-S3, CSCS, Météo-France, ECMWF — sie reichen auch
  Verzeichnislistings der Upstream-Server durch, s. `SEO-AUDIT.md`). Der Repack-Cron pflegt den
  Radar-/Repack-Spiegel im Daten-Repo `buscosun-data` (ausgeliefert über jsDelivr; die Warm-Crons für
  `public/latest-*.json` sind seit BW-12/13 still, `warm-wind.yml` gelöscht); zweites Spiegel-Repo
  `jppetry/buscosun-worldcover` für dNBR; Punkt-Cron und Archiv-Cron s. „Betrieb". Daneben laden viele Quellen
  weiterhin **direkt** von Fremd-Origins (GeoSphere, geo.admin.ch, BrightSky, Open-Meteo, Nominatim,
  AWS/Element84, NASA GIBS, Planetary Computer).
- Vollständige Architektur: `architecture.md`. Entscheidungs-Log (`decisions.md`) fehlt im Baum — Grundsatzentscheidungen
  stehen bis zur Wiederherstellung in den `audit/*.md` (je Linie als E-…-Punkte mit Jans Entscheidung).

## Dokumenten-Landkarte

| Datei | Rolle |
|---|---|
| `CLAUDE.md` | Diese Verfassung: Stand, Regeln, Konventionen, Doku-Landkarte |
| `README.md` | Repo-Einstieg: Was ist buscosun, Funktionsumfang, Schnellstart, Doku-Index |
| `architecture.md` | Repo-weite Architektur (App-Shell, Layer-System, Quellen, Fusion, Transport, Deployment) |
| `agents.md` | Agent-Teams-Betriebsmodell: Rollen, Zuständigkeiten, Arbeitsabläufe, Definition of Done |
| `CONTRIBUTING.md` | Arbeitsweise, Gates, Ehrlichkeitsregeln, Definition of Done (für Menschen **und** Agenten) |
| `MANUELLE-SCHRITTE.md` | Was nur Jan tun kann (Pushes, Kopien in die Daten-/Archiv-Repos, Deploy-Prüfungen), je Phase nummeriert |
| `prompt.md` | Kickoff-Prompt für die nächste Session (aktuell: AP2–AP8) |
| `ABLAUFPLAENE.md`, `QUELLENMATRIX.md` | Design-Dokumente von buscosun Fusion (PAP 1–6; Primärquellen je Land und Stunde) |
| `plan.md`, `context.md`, `checklist.md`, `roadmap.md`, `improvements.md`, `mobile-design-guidelines.md`, `decisions.md`, `DEVELOPMENT.md`, `tests.md` | **Fehlen im Arbeitsverzeichnis** (die ersten sechs seit 2026-08-17; die letzten drei sind nicht getrackt, am 16.09. nachgeprüft). Bis zur Wiederherstellung gelten die `audit/*.md` als Gate-Belege und ADR-Ort; V-Einträge (D-28) landen im jeweiligen Phasendokument |
| `docs/` | Fachspezifikationen (s. Tabelle unten) |
| `audit/*.md` | Diagnose-/Phasen-Befunde je Linie, mit Messwerten und Gate-Belegen |

**Phasen-Audits** (jeweils Diagnose → Umsetzung → Gate, mit Messwerten und Fallstricken):

| Datei | Linie |
|---|---|
| `audit/fusion-implementierung.md` (+ `latency/`) | **FI (laufend):** Plan §0–§8, Etappenprotokoll §9 (AP0 Messbasis, AP1 Leser, PA2, AP12a, ab AP2 der Algorithmus), Befunde V-FI-* |
| `audit/chronik-statusblock-2026-09-16.md` | Der frühere Statusblock dieser Datei, wortgleich (PD-A…PD-U, SH, LZ1, BW-13, PA0 …) |
| `audit/punktvorhersage-14tage.md` (+ `audit/punktvorhersage-14tage/`) | PV0/PV3: buscosun Fusion (`src/pointForecast/fusion/`) — Verteilungsalgebra, Minimum-Varianz-Kombination, Klimatologie-Prior, Feuchtkugel-Phase, 0–336 h (GPV3b), K-1/K-2 (Niederschlag zweistufig), Stationsanker als Innovations-Persistenz (§12), V-A₁-Scorecard (`verify:pv-score`: Spread/Skill 0,5–0,6 überkonfident); `verify:pv-fusion` 222/222; offen V-PV-14/17/18 |
| `audit/punktdaten-umsetzungsplan.md` | PD-U: Umsetzungsplan vor FI, Punktarchiv PA1 (`scripts/punktarchiv/*`, Repo `buscosun-archiv`), Retention-Korrektur, Stadt-Raster `urban/v1`, M-1 (Windmember, σ_ens bis 336 h), Bereitschaft §8.1 |
| `audit/punktdaten-druckflaechen.md` | PD-E: Druckflächen 925/850/700 im Cube (Schema 5), `static/hmodel` je Quelle, E-E-1…5, V-PD-57…60 |
| `audit/punktdaten-versorgung.md` | PD0/PD-A…PD-C, Block F: Punkt-Cube `point/` (Format, Adapter der acht Zugriffsfamilien, Aufbewahrung, Publikationslauf ≠ Quell-Lauf §26, Cron im Drei-Stunden-Takt), E-1…18, V-PD-1…56 |
| `audit/fusion-vorstufe.md` | PD-D: Leser + Auswähler für `buscosun-data` (`src/point/client/*`, `point:read`), Auswahl auf Produktebene, V-PD-52…56 |
| `audit/datenrepo-beschreibungen.md` | README des Daten-Repos an Konstanten gebunden; Backspace-Fund in einer Verneinungsprüfung |
| `audit/teilen-share.md` | SH0–SH6: „Auswahl teilen" — URL-Schema, Share-UI, Open Graph (Edge Function `og-meta`, 50 Karten), V-SH-1…13 erledigt, SH7 offen |
| `audit/layer-ladezeit.md` | LZ0/LZ1: Ladezeit am Layer-Klick (kalter jsDelivr-TTFB, Index-SWR, `@main`-URLs, Publisher-Warm-up, Prefetch; `?lz=0`) |
| `audit/brandradar-satellitenbilder.md` | SAT0–SAT2h: Satellitenbilder vorher/nachher, 10-m-COG-Viewer, SWIR/dNBR/SCL-Maske/WorldCover-Dämpfung |
| `audit/route-3d.md` | R3D-1…R3D-8: 3D-Tourenansicht (Schnitt + Geländekarte, Zeitplan) |
| `audit/bandbreite.md` | BW-0…BW-13: Netlify-Bandbreite auf ≈ 0 (jsDelivr-Repack, PNG-Familien, Radar-/KONRAD-Spiegel, Index-Weg, V-BW-58 Push-Wiederholung) |
| `audit/radar-datenrepo.md` | RD0–RD3: Radar/KONRAD-Spiegel im Daten-Repo als fertige Bilder |
| `audit/layer-erstbild.md` | LE0–LE2: Erstbild Regenradar/Wetterkarte (Parser im Worker, Frühstart) |
| `audit/karten-layer-verortung.md` | KL0–KL11: Geo-Versatz aller Layer auf ≤ 1 m korrigiert |
| `audit/radar-punktverortung.md` | RP0: Punktabfrage vs. Kartenposition DE/AT/CH-Radar |
| `audit/event-terrain.md`, `audit/event-zone.md` | ET0–ET5 Terrain-Bühne + Readout; EZ0–EZ3 Event-Fläche |
| `audit/brandradar-detail-mitte.md`, `audit/brand-detail.md` | BD2 Dossier in der Mitte; BD0/BD1 Detailkarte mit FRP-Verlauf |
| `audit/regenradar-layer-angleich.md` | RL0/RL1: Regenradar auf den Layer-Modulen der Wetterkarte |
| `audit/routing.md` | RT0/RT1: Pfadbasiertes Client-Routing (React Router) |
| `audit/brand-historie.md`, `audit/thermalanomalien.md`, `audit/aktivfeuer.md`, `audit/brandflaechen-panel.md`, `audit/brandflaeche-vorlaeufig.md` | BH0–BH6, TA0–TA5, AF0–AF4, BP0–BP5, VB0 (Brandradar-Linie) |
| `audit/waldbrand-ausbreitung.md`, `audit/waldbrand-forecast.md`, `audit/waldbrand-cluster.md`, `audit/waldbrand-behoerden.md`, `audit/waldbrand-boden.md`, `audit/waldbrand-wind.md`, `audit/waldbrand-firms.md`, `audit/waldbrand-effis.md` | SF0/SF1, WF0–WF5, BC1, Behördendaten DACH, WT1, WW1, F0–F2, E0–E3 (Waldbrand-Linie) |

**Achtung Alt-Doku:** `docs/reports/*`, `docs/seo-geo/*`, `buscosun-atmosphaere-*.md`, `buscosun_seo_geo_*.md`,
`FUSION_*.md` (externes Audit vom 07.09.) und `SEO-*.md`/`KEYWORDS.md`/`GEO-TESTSET.md`/`VERIFY.md`
(SEO-Linie, wartet auf Freigabe) sind Session-Artefakte — als Historie
wertvoll, nicht als Ist-Beschreibung. Bei Widerspruch gilt: **Code > `architecture.md`/`decisions.md` > Alt-Doku.**

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
  Irreversiblen. Prod-Dispatch der Crons, Purges gegen das CDN, Pushes und Kopien in die Daten- und
  Archiv-Repos sind Jans Gate.
- **Mobile-GPU-Fallen:** kein Verlass auf `EXT_color_buffer_float`; explizite `highp`-Deklarationen;
  RGBA8-Packing-Pfad nicht anrühren. Performance-Regelung ausschließlich über den `FrameGovernor`
  (FPS-Leiter zuerst, Trail-0,5× als letzter Hebel, Partikelzahl ist **kein** Hebel).
- **Ehrlichkeit ist Produktprinzip:** Unsicherheiten, Datenlücken und Länder-Asymmetrien (z. B.
  UV/Pollen/Warnungen DE-only) werden ausgewiesen, nie kaschiert. Experten-Layer (z. B. Rotation) tragen
  konservative Formulierungen — nie „Tornado"-Sprache. Kein Wert ohne Herkunft: nur `measured` wirkt
  stillschweigend, `set`/`literature` wird gekennzeichnet (Provenienzregel der Punktlinie).
- **Flag-Gating („Rule 2"):** Neue Rechenpfade ersetzen alte nie direkt; sie kommen default-off hinter
  Flags mit benanntem Fallback.
- **Design-Standard Command-Deck (D-27):** Alle neue UI entsteht im Command-Deck-System (hell, Sand/Ink,
  League Spartan, Topbar+Rail+Dock, Feature-Token-Namespaces); Alt-Themes werden migriert, nie erweitert.
- **Verbesserungs-Pflicht (D-28):** Jede gefundene Verbesserung wird als `V-NN`-Eintrag in
  `improvements.md` festgehalten — immer mit Mehrwert (für Jan verständlich) und Umsetzungsskizze
  (bis zur Wiederherstellung der Datei: im Phasendokument).
- **Historie gehört nicht in diese Datei.** Was wann umgesetzt wurde, steht in den `audit/*.md` (und in
  `audit/chronik-statusblock-2026-09-16.md` für die Zeit bis zum 16.09.) — der Statusblock oben hält nur den
  aktuellen Stand fest, keine Chronik. Beim Etappenwechsel wird er ersetzt, nicht verlängert.

## Verifikation

- **Kein Test-Framework** (bewusste Grundsatzentscheidung): stattdessen Headless-Verifier `npm run verify:*`
  (ein `.mjs`-Skript je Thema unter `scripts/`, teils gegen echte Module/Live-Server importiert). Stand
  zuletzt ausgezählt (2026-08-28): **56 npm-Aliase / 57 Harnische**, seither dazu `verify:point-data`,
  `verify:point-client`, `verify:punktarchiv`, `verify:pv-score`, `verify:pv-latency` — Einzelzahlen je Phase
  stehen im jeweiligen `audit/<thema>.md`; bei Bedarf neu zählen statt fortschreiben (BW-1).
  `npm run typecheck` muss vor jedem Gate grün sein; `npm run build` + `npm run budget` (Ratsche eagerJs /
  largestChunk / totalJs) bei jeder Änderung an `src/`.
- **UI-Verifikation:** Chrome DevTools MCP (Desktop 1440×900, iPhone 12 Pro 390×844 DPR 3). Emulation ist
  für WebGL **nicht** repräsentativ — GPU-kritische Aussagen brauchen Real-Device (scrcpy/ADB), Jan
  informieren. In-App-Browser pausiert rAF → WebGL-Karten nur im Vordergrund-Browser verifizieren.
- Vor jedem Gate: die fünf Selbstverifikations-Fragen schriftlich mit Beleg beantworten (1 Funktionserhalt
  einzeln, 2 Desktop pixelgleich, 3 Touch-Targets ≥ 44 px, 4 Konsole sauber, 5 keine Long Tasks > 200 ms).
- Verifier laufen ohne Rückfrage, im Repo per PowerShell, nie mit `2>&1`.

## Sprache & Konventionen

- Dokumentation auf **Deutsch**, Prompts an Claude Code auf **Englisch**, Code/Kommentare/Commits auf
  Englisch (Bestand ist gemischt — bei Neuanlage Englisch).
- **Namensregel „buscosun Fusion" (Jans Festlegung 2026-09-06):** Der Punkt-Algorithmus in
  `src/pointForecast/fusion/` heißt im Projekt **immer „buscosun Fusion"** — in Doku, Code-Kommentaren,
  Commits und UI. Keine Umschreibungen („Punkt-Fusion", „point engine", „die Fusion", „der Algorithmus").
  Der Ordner bleibt `fusion/`; die erwogene Umbenennung nach `predictive/` ist damit erledigt.
  **Abgrenzung:** `src/fusion/` ist etwas anderes — der IDW-Rasterisierer der 2D-Karte, Name historisch
  (s. `audit/rasterfusion-rueckbau.md` §2). Wo beides gemeint sein könnte: „buscosun Fusion" für den Punkt,
  „Rasterfusion" für die Karte. Der Cube in `buscosun-data/point/` ist die vorgerechnete Hälfte von buscosun
  Fusion (PAP 2), die Laufzeit-Hälfte (PAP 1, 3–6) macht daraus die Punktvorhersage.
- Commits: Conventional Commits, Scope = Feature-/Themenname. Keine Commits ohne Auftrag.
- Nach jeder Phase: Statusblock oben ersetzen, Phasendokument mit Gate-Belegen abschließen, `MANUELLE-SCHRITTE.md`
  um Jans Gates ergänzen (bis `checklist.md`/`context.md` wiederhergestellt sind).
