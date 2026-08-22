# CLAUDE.md — buscosun: Projekt-Verfassung für Claude-Code-Agenten

> Stand: 2026-08-19 (Statusblock: Aktiv-Feuer AF0–AF4 umgesetzt inkl. Kalibriermodell v1 aus Archivdaten
> 2020–2026, Doku-Landkarte um `audit/aktivfeuer.md` und `docs/aktivfeuer-merkmale.md` ergänzt, Verifier-Zahl 51). Davor 2026-08-17 (Brandflächen-Panel BP0–BP4).
> Davor 2026-08-15 (Waldbrand-/Behördendaten-Lehren). Übrige Inhalte: Stand 2026-07-31.
> Dieses Dokument ist die **dauerhafte** Grundlage für alle Agenten-Sessions.
> Es ersetzt die frühere sessionspezifische Fassung („Mobile-Optimierung", abgeschlossen; Historie in Git).
> Sessionspezifische Missionen stehen in `plan.md` (aktive Phase) und `prompt.md` (Kickoff).

## Projekt

**buscosun** (Produktion: buscosun.com, SEO-Kanonicals derzeit inkonsistent auf buscosun.app — bekannter Defekt, s. `roadmap.md` §A) ist eine DACH-fokussierte Wetter-Visualisierungsplattform: reine Frontend-Web-App ohne Backend, alle Wetterdaten werden **client-seitig** geholt und dekodiert (handgeschriebener GRIB2-Decoder inkl. CCSDS-AEC).

**Mission:** buscosun zur führenden Wetterplattform im DACH-Raum ausbauen — Referenz in Qualität, Nutzererlebnis, Geschwindigkeit, Genauigkeit, Innovation und Zuverlässigkeit. Zielgruppen-Fundament: `docs/zielgruppen-dach.md`.

**Aktueller Modus (Stand 2026-08-18): Aktiv-Feuer-Linie — AF0 (Diagnose
`audit/aktivfeuer.md`, Jans Entscheidungen §10: TS-only, clientseitig, kein AF-Cron, keine Biomasse),
AF1 (Gate GAF1 grün, §11: Überflüge nach EINER Regel — 10 min je Satellit,
`src/fire/activity/overpasses.ts`, geteilt von `fireEvents`/`fireClusters` —, Intensität je Überflug
`frpLastPassMw`/`frpMaxPassMw`, FRE mit Gültigkeitsregel) und **AF2** (Gate GAF2 grün, §12:
`dynamics.ts` Tendenz nur mit FRP-Anstieg **und** Randwachstum, Ausbreitungsrichtung ab 3 Überflügen,
Windflag nur mit geladenem `fireWind` und Frame ±3 h; `observation.ts` Beobachtungsgelegenheit bei
„kein Signal" aus regionaler Aktivität ≤ 150 km, je Zelle nach Überflug indiziert — V-AF-7: 418 → 126 ms;
`src/wind/windPointSample.ts` als geteilter Wind-Sampler, V-AF-4) als additives `FireRecord.activity`
mit Zeilen-Chip und Detailkarte, sowie **AF3** (Gate GAF3 grün, §13/§14: `features.ts` = versioniertes
Merkmalsschema `FireFeatures` v1 + `featuresOf` als EINE Referenz für Client und späteren BA-Batch,
Schema-Doku `docs/aktivfeuer-merkmale.md`, Zeile „Merkmale" + „JSON kopieren" in der Detailkarte,
Persistenz-Haken benannt, nicht betrieben) sowie **AF4** (Gate GAF4 grün, §15 — Jans Entscheidung
2026-08-18: Kalibrierung **jetzt aus dem Archiv** statt Warten auf die BA-Linie): `scripts/fire/pairs-from-archive.mjs`
(EFFIS-RDA-Kartierungen 2020–2025 × FIRMS-SP-Detektionen, dieselben Module wie der Client, Schlüssel nur
lokal, Prod-Proxy unangetastet) ⇒ **531 Paare/519 zulässig**; `scripts/fire/calibrate.mjs` +
`src/fire/activity/calibration.ts` ⇒ `public/fire/af/area-estimate-v1.json` (**604 Paare 2020–2026**;
Detektionsmodell Grad 2 — das quadratische Glied ist signifikant (t = 3,5) und beseitigt die
Unterschätzung großer Brände —, σ 1,33 ln, LOO-Abdeckung 78,8 %; FRE schwächer und als Grad 2 **nicht
monoton** ⇒ dort Gerade; Prädiktor- und Gradwahl gemessen, nicht angenommen); `estimate.ts` + Panelzeile
„Schätzung" (nie ohne Intervall, keine Extrapolation, Kartierung geht vor), Kill-Switch `?afEst=0`,
Modelldatei mit `cache: 'no-store'` (SW führt `.json` als gehashtes Asset).
Neu 2026-08-19: **VB0/GVB1** (`audit/brandflaeche-vorlaeufig.md`) hat gemessen, dass eine EIGENE Brandflächen-Kontur vor der EFFIS-Kartierung die Übereinstimmung verschlechtert (618 Archivpaare, keine von vier Formregeln schlägt das Detektionsraster) — gebaut wurde daher nur die Wortwahl „Vorläufige Brandfläche (geschätzt)" mit Intervall, wortgleich in Panel und beiden Karten-Steckbriefen; die Geometrie bleibt das Raster, die Ersetzung durch EFFIS läuft unverändert über `reconcile.ts`.
**Die Aktiv-Feuer-Linie AF1–AF4 ist umgesetzt**; die BA-Linie (Sentinel-2-Batch, drei STOPP-Entscheidungen)
ist jetzt Verfeinerung (Modell v2 mit Trennbarkeit), kein Blocker. Davor: Brandflächen-Panel BP1–BP4 umgesetzt, Gate GBP1 grün; **BP5 (2026-08-19, Gate GBP5)** hat Brand- und Cluster-Liste zu EINER verschmolzen — je Brand, mit Stärke (Summe FRP), Skala, Ausdehnung und Rangfolge „Stärke“; sie steht auf beiden Größen im Readout (`Layer | Brände`), das Overlay am linken Kartenrand ist entfallen (`audit/brandflaechen-panel.md` §11)
(`audit/brandflaechen-panel.md` §9): Layer `fireFootprints` (Bit 12), Brand-Registry
(`footprint/fireRegistry.ts`, überflugstabile Kennung, Merge/Split), Panel links als Overlay bzw.
drittes Sheet-Segment, Ortsverzeichnis GeoNames (`public/fire/places-dach.json`). Uncommitted wie
alles seit 2026-07-30. Die Sentinel-2-Batch-Linie (BA-P1…P5) wartet weiter auf drei
STOPP-&-FRAGEN-Entscheidungen (Cron, Speicherweg, Toolchain) — nächste Phase ist Jans Wahl.
Neu 2026-08-18/19: **Waldbrand-Forecast-Linie WF** (`audit/waldbrand-forecast.md`) — WF0 diagnostiziert,
Jan hat entschieden (§13: Composite-Vorbehalt für publizierte Gleichungssysteme aufgehoben · Batch =
GitHub Actions + Commit-back Stations-JSON, kein R2 · Stundenregler eine Achse · **Punkt = Fusion,
Fläche = ICON-D2 nativ**), **WF1 + WF2 umgesetzt** (Gate §14: `src/fire/fwi/fwi.ts` FWI-Rechenkern gegen
cffdrs-Vektoren 43/43, `fireWeatherGrid.ts` + `src/sources/iconD2FireWeather.ts` Raster-Producer 39/39,
Browser-Smoke 14 Frames/11 s, kein UI verdrahtet) und **WF3 umgesetzt** (Gate GWF3, §15: EINE
Zeitachse mit zwei Einheiten im Brandradar — `fireTime.ts` `hourly`/`maxHour`/`HOUR_AXIS_MAX 6`/`timeUnit`
(erzwungen > gewählt > Tage)/`dayOfHour`/`hourFollow`, Permalink `h` nur auf der Stundenachse (Literal-Anker
byte-gleich), Umschalter „Tage | Stunden" sobald ein Layer Stundenframes hat (RH-Treiber, Boden, **Wind** — Jans Revision §15.5: Achse 0…6 h, damit der Wind aus jedem Lauf mitläuft; `FIRE_WEATHER_AHEAD_H` 6), Tages-Layer
als „Tageswert" des Kalendertags von jetzt + h, beide 12-UTC-Anker über `frameAtValidTime`; 111/111 + 106/106,
Prod-Preview 0 Long Tasks beim Scrubben) sowie **WF4 umgesetzt** (Gate GWF4, §16: Layer `fireForecast`
— **Bit 13**, angehängt, Z-Band 52, eigene Dock-Gruppe „Feuerwetter stündlich"; der ERSTE `hourly`-Layer,
er erzwingt die Stundenachse und klemmt die Tagesachse nicht (`sharedMaxDay` zählt nur `forecast`).
**Fläche = ICON-D2 nativ** (WF2-Producer, stündlicher ISI aus der hFFMC-Kette, Stufe 1 ohne
Vortagsgedächtnis, Start Gleichgewichtsfeuchte), **Punkt = Fusion** (Klick ⇒ dynamischer Import des
Punkt-Forecasts, DIESELBEN Gleichungen, eigener 30,4-KB-Chunk) — der Pflichtsatz „Punkt (Fusion) ≠
Fläche (ICON-D2)" steht in der Karte, weil beide am selben Ort nie identisch sind; `fwi/isiRamp.ts` mit
harten EFFIS-Klassenkanten (Doppel-Stops, Positionen `ISI/ISI_VMAX`); 123/123 + 127/127, Budget
914,1/926,1 KB, Prod-Preview 0 Long Tasks beim Scrubben/Leerlauf/Abspielen — Kaltstart-Tasks sind der
vorbestehende Hauptthread-GRIB-Dekode (V-WF-13, Kontrolle RH-Treiber allein 418 ms)).
Neu 2026-08-19/20: **SF1 — Ausbreitungsrichtung aktiver Brände** (`audit/waldbrand-ausbreitung.md`,
Jans Auftrag „weniger Karte, mehr Aussage je Brand"): Layer **`fireSpread` (Bit 14, Z-Band 82)** —
je aktivem Brand ein Pfeil (Symbol-Layer, `icon-rotate`, Fuß am Brand) plus Unsicherheitsfächer,
gerechnet mit dem **kanadischen FBP-System** (Forestry Canada 1992 ST-X-3 / Wotton u. a. 2009
GLC-X-10, abgeschrieben aus `cffdrs`) aus ICON-D2-Wind, stündlichem ISI und Hangneigung aus dem
Höhenmodell; Reichweite als **Spanne über vier Brennstofftypen** (D-1/C-2/C-3/O-1b), weil es für
frische Hotspots keine Vegetationskarte gibt. **Die Rasterfläche `fireForecast` ist zurückgezogen**
(Jans Entscheidung, ausdrückliche Ausnahme vom Funktionserhalt) — Bit 13 bleibt `null`, die
DATENQUELLE `iconD2FireWeather.ts` bleibt in Betrieb und schreibt jetzt ISZ in den freien G-Kanal;
die Punktkurve auf Klick hängt an `fireSpread`. Vier Lehren: (1) die **Stundenachse ist eine
Absicht, der geladene Lauf die Wirklichkeit** — der Warm-Cron-Windlauf war live 12,7 h alt und
endete bei „jetzt", während das Feuerwetter 3,7 h alt war ⇒ `horizonHour` + `horizonNote()` sagen
den nutzbaren Horizont, sonst entsteht stille Leere; (2) die SPECS-Einfügeschleife
(`FireMap.tsx:1704`) **überschrieb das `layout`** — für jeden Symbol-Layer tödlich, gefixt;
(3) die MapView-Import-Sperre las `src/fire/` **nicht rekursiv** (52 statt ~20 Dateien, gefixt);
(4) der **Service Worker liefert nach einem Rebuild das alte Bundle** — vor jeder
Prod-Preview-Verifikation Worker abmelden und Caches leeren. Verifier `verify:fire-spread`
**203/203**, Budget 918,2/926,1 KB. Gate GSF1: Konsole und Funktionserhalt belegt, Mobile/Trace/
Desktop-Diff offen (Browser-Automatisierung brach ab).
Davor: Nächste Phase **WF5** (Tages-Codes DMC/DC/BUI per Actions-Batch + Commit-back ⇒ ISI wird FWI; neue
Workflow-Datei = STOPP & FRAGEN, Prod-Dispatch bleibt Jans Gate).**
Was wann umgesetzt wurde, steht **nicht mehr hier**, sondern in `plan.md` (Stand + nächste
Phasen), `checklist.md` (Gates mit Belegen) und `context.md` (Chronik).
> ⚠ **Befund 2026-08-17:** `plan.md`, `checklist.md`, `context.md` und `mobile-design-guidelines.md`
> fehlen im Arbeitsverzeichnis (gegenüber HEAD 2026-07-30 gelöscht), `improvements.md`/`roadmap.md`
> gibt es weder im Baum noch in Git, und `src/fire/` ist seit 2026-07-30 uncommitted. Bis Jan
> entscheidet (wiederherstellen vs. neu anlegen), gelten die `audit/*.md`-Dateien als Gate-Belege;
> V-Einträge werden dort gesammelt (`audit/brandflaechen-panel.md` §8) und später nachgetragen.
Kurz: die 2D-Layer-
Erweiterung ist geplant (GL0) und für **L5 + L6** spezifiziert (GLS, `docs/zuglinien-radar-spec.md`);
daraus vorgezogen umgesetzt sind Zellbahnen (`cells`, Z1/Z2), Hagel (`hail`), amtliche Warnungen
DE + CH (`warnings`, W1/W2); dazu die Windpartikel-Phasen (WG1/WS1/WZ1/Z3), Startseite (SA1) und
die komplette **Waldbrand-Linie** (WB0–WB5, WBU1, F0–F2, E0–E3, GWBA1, GWT1, GWW1). Offen als
Länderlücke: **AT-Warnlayer (W3)**.

> **Sonderregel für den Warn-Layer:** `warnings` ist der einzige Layer, der ein **amtliches
> Warnprodukt IST**; alle anderen verweisen in ihren Texten darauf. Dort ist Warnsprache
> korrekt — aber **ausschließlich als Zitat**: amtliche Texte werden wortwörtlich übernommen,
> nie zusammengefasst, umformuliert, verschärft oder abgeschwächt. Zusätzlich gelten die
> Lizenzauflagen in `docs/API.md` §7 (kein Durable-Cache, Datenalter sichtbar, bei Ausfall
> ausdrücklich als Ausfall kennzeichnen statt als Leerstand). Dieselbe Zitatregel gilt für
> GeoSphere-Warntexte im Waldbrand-Kontext (`geosphereWarnContext.ts`).

**Repo-weite Lehren aus der Waldbrand-Linie (gelten überall):**
1. **WFS-`maxfeatures` gegen den EFFIS/GWIS-MapServer schneidet die jüngsten Datensätze ab** —
   auf `/effis` vor dem BBox-Filter (V-224), auf `/gwis` danach, aber älteste zuerst (GWBA1) ⇒
   **kein serverseitiger Deckel**; wenn nötig im Client nach dem BBox-Filter deckeln, jüngste zuerst.
2. **Der MapServer spiegelt die BBox-Achsenreihenfolge in die Ausgabe-Geometrie** — WFS 1.1.0 +
   EPSG:4326 verlangt lat,lon; Anker prüfen die **zurückgegebenen Koordinaten**, nie Zählstände
   (`src/fire/sources/wfsAxis.ts`).
3. **`setData` auf `idle` ist eine Endlosschleife** — nur bei geänderter Referenz setzen (V-220).
4. **„bestätigt"** fällt in der Waldbrand-Ansicht nur mit Quelle im selben Satz: EFFIS-Kartierung,
   Copernicus-EMS-Aktivierung (amtliche Warnung nur nach Freigabe — MoWaS wird **nicht** ausgewertet,
   Jans Entscheidung 2026-08-15, nur Deep-Link). „Unbestätigt" ist der Normalfall und wird so gesagt.
5. **Keine unklare Lizenz, keine NC-Klausel, kein Scraping** — Quellen ohne Lizenz (NINA/MoWaS,
   AT-Einsatzübersichten) oder mit NC (Alertswiss, ORF) sind Deep-Links, nichts sonst.

## Stack (verifiziert am Code, Stand 2026-07-31)

- React 19 + Vite 6 + TypeScript 5.7, MapLibre GL 5.6. Runtime-Dependencies nur: `maplibre-gl`, `react`, `react-dom`, `bz2`, `bzip2-wasm`, `jsfive`. Kein Router, keine State-, HTTP-, Chart-Bibliothek.
- **Nicht (mehr) im Code, auch wenn Alt-Doku es behauptet:** kein Three.js, kein WebLLM/KI-Meteorologe (`src/assistant` existiert nicht), kein Cloudflare R2/PMTiles, kein „AdaptiveQualityController" (real: `FrameGovernor` in `src/wind/perfGovernor.ts`).
- Hosting: Netlify (statisch + 3 Edge Functions: `/_dwd_wind`, `/_dwd_grib` als gehärtete Cache-Proxys, `/_firms` als Schlüssel-Proxy für NASA FIRMS — `FIRMS_MAP_KEY` nur in der Umgebung), GitHub-Actions-Warm-Crons pflegen `public/latest-{grib,wind}.json`.
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
| `plan.md` | Aktive Phase (oben) + historischer Phasenplan (Archiv, unten) |
| `context.md` | Projektstand (oben, korrigiert) + Session-Log (Archiv, unten) |
| `checklist.md` | Gates; oben das Gate der aktiven Phase |
| `tests.md` | Verifikationsprotokolle V-* |
| `prompt.md` | Kickoff-Prompt für die nächste Session |
| `prompt-zellbahnen-v2.md` | Kickoff-Prompt der Phase **Z2** (Zellbahnen: Lesbarkeit & Standortbezug) — eigenständig **neben** `prompt.md`, Muster wie das frühere `prompt-2d-zuglinien.md` |
| `prompt-waldbrand-dach.md` | Kickoff-Prompt der Phasen **WB0–WB5** (Waldbrand DACH) — umgesetzt 2026-08-14, GWB4 teilblockiert |
| `prompt-waldbrand-ui.md` | Kickoff-Prompt der Phase **WBU1** (Waldbrand-Deck in Wetterkarten-Optik) — reine Darstellungsphase nach Z2-Muster, umgesetzt 2026-08-14 (Gate GWBU1) |
| `prompt-warnungen-ch.md` | Kickoff-Prompt der Phase **W2** (amtliche Warnungen Schweiz) — umgesetzt 2026-08-08 |
| `prompt-brandflaechen-echtzeit.md` · `konzept-brandflaechen-modul.md` · `prompt-waldbrand-brandflaeche.md` | Konzept-Dokumente der Brandflächen-Linie: Live-Footprints (BF0–BF5, Diagnose `audit/brandflaechen-echtzeit.md`), Sentinel-2-dNBR-Kartierungsmodul (Batch, noch nicht gestartet) und die Quellenrecherche „echte Brandflächen statt Punkte" |
| `prompt-brandflaechen-panel.md` | Kickoff-Prompt der Phasen **BP1–BP4** (Brandflächen-Panel links + Polygone, Gate **GBP1**) — umgesetzt 2026-08-17; Diagnose + Gate `audit/brandflaechen-panel.md` |
| `audit/waldbrand-behoerden.md` | Diagnose + Entscheidungsprotokoll **GWBA1** (Behördendaten DACH: Achsen-Anker, MoWaS-Befund und -Entscheidung, EMS, GeoSphere, CORINE-Maske, V-222) |
| `audit/waldbrand-boden.md` | Diagnose der Phase **WT1** (Gate **GWT1**, 2026-08-15): Bodentrockenheit aus ICON-D2 `smi`, zwei Tiefen. Enthält drei gemessene Fallen für jeden künftigen ICON-Bodenlayer — (1) `smi` verlässt 0..1 in **beide** Richtungen, ein `clamp01` auf dem Rohwert schneidet die Aussage ab; (2) die NaN-Maske deckt nur den Modellrand, **212 735 Wasserzellen tragen Werte** → `soiltyp` mitladen; (3) die Ebenen 243 und 729 sind **wertgleich**. Außerdem: die Whitelist von `dwd-grib.ts` filtert nach **Pfad-Präfix, nicht nach Variable** — neue ICON-D2-Variablen brauchen keinen Edge-Function-Eingriff und sind damit kein STOPP & FRAGEN |
| `audit/waldbrand-wind.md` | Diagnose der Phase **WW1** (Gate **GWW1**, 2026-08-15): der Windlayer der Wetterkarte 1:1 im Brandradar. Enthält die beiden Regeln, die für die Folge-Layer **Temperatur** und **Niederschlag** genauso gelten — (1) 1:1 heißt `src/wind/*` **importieren**, nicht kopieren (nur `../MapView` ist gesperrt); (2) Layer, deren Horizont kürzer ist als ein Reglerschritt, sind `instant` und werden mit `Date.now()` gefüttert — als `forecast` mit `maxDay: 0` würden sie über `sharedMaxDay()` den gemeinsamen Tagesregler der anderen Layer abschalten |
| `audit/waldbrand-firms.md` · `audit/waldbrand-effis.md` | Diagnosen der Waldbrand-Folgephasen **F0–F2** (FIRMS als Primärquelle, Gate GWBF1) und **E0–E3** (EFFIS/GWIS als Sekundär- und Kontextquelle, Gate GWBE1) — inkl. der Sonden `scripts/l0/probe-waldbrand-effis.mjs` und der Belege unter `audit/l0/` |
| `audit/waldbrand-cluster.md` | Diagnose der Phase **BC1** (Gate **GBC1**, 2026-08-16): Brand-Cluster als Liste rechts + konvexe Hülle auf der Karte. Enthält drei Lehren, die über die Phase hinausgelten — (1) es gibt **ein** Clustering im Projekt (`spatialClusters` in `fireEvents.ts`, seit BC1 mit Radius-Parameter); wer dort die Vorgabe ändert, verschiebt die Ortsfest-Einstufung F2 mit; (2) eine Liste, die „Brände" heißt, muss den **Ortsfest-Vorbehalt der Karte** tragen — sonst steht ein Stahlwerk als siebtstärkster Brand darin (live passiert); (3) **lange Listen im Readout brauchen einen ausgesprochenen Deckel**: 1 111 Zeilen kosten am Prod-Build 253 ms bis in den DOM, `content-visibility` macht es schlechter, und still zu kürzen wäre eine Falschaussage über den Bestand (V-246) |
| `audit/aktivfeuer.md` | Diagnose **AF0** + Entscheidungsprotokoll §10 + Gates **GAF1** §11 / **GAF2** §12 / **GAF3** §13–14 / **GAF4** §15 (2026-08-18): das Konzept `konzept-aktivfeuer-modul.md` (Python, Objektspeicher, stündlicher Cron, Alpha-Shape) am Code widerlegt — AF ist eine reine TS-Erweiterung der BP1-Registry, clientseitig; ~70 % existierte schon (Überflüge, Rechteck-Union, Hülle, `statusOf`, `grew`). Lehren: (1) **eine** Überflug-Regel im Projekt (10 min je Satellit, `src/fire/activity/overpasses.ts`) — wer sie ändert, ändert `overpasses`/`eventLabel` sichtbar, F2 nicht; (2) Namenskollisionen benennen statt umdeuten (`frpSumMw` = Fenstersumme bleibt, Überfluggrößen heißen `frpLastPassMw`/`frpMaxPassMw`); (3) FRE nur mit Gültigkeitsregel, `null` heißt „nicht bestimmbar", nie 0; (4, GAF2) „wachsend" braucht FRP-Anstieg **und** Randwachstum (reiner FRP-Anstieg kann Blickwinkel sein), „kein Signal" trägt immer eine Beobachtungsqualifikation (Proxy: regionale Sicht ≤ 150 km, der eigene letzte Überflug zählt nie als „späterer"), das Windflag ist ein Flag mit `null`-Grund, nie eine Korrektur; (5, V-AF-7) eine „nur bei kein Signal"-Abfrage ist im 7-Tage-Fenster die Regel (≈ 90 % der Einträge) — Long Tasks am Prod-Build messen, nicht schätzen; (6, GAF3) das Merkmalsschema wird VOR der Zielgröße fixiert (Detektionen fallen nach 7 Tagen aus dem Fenster), `coverageHa` ist fensterabhängig (Baelen: 2,1× EFFIS über 7 Tage, BF0 sah 0,5–0,6× über 24 h), Perf-Anker als „bester von 3 Läufen" (V-AF-10); (7, GAF4) das Archiv liefert die Labelpaare **heute** (EFFIS-RDA seit 2020/21 Sentinel-2-gestützt bis 0–2 ha; FIRMS-SP mit demselben Schlüssel, lokal, 5-Tage-Chunks) — Detektionen schlagen FRE als Prädiktor, Modellwahl nach gemessener LOO-Streuung statt Konzept-Vorannahme; Residuen **nach Prädiktorklasse** prüfen (nach Zielgröße klassiert erzeugt der Regressionseffekt ein Scheinbild), Grad per t-Test statt LOO-Heuristik, **Monotonie als fachliche Nebenbedingung** (mehr Feuer ⇒ nie weniger Fläche), Ausschlüsse größenabhängig (0–2 ha 48 %, > 200 ha 25 %) und die Batch-Zuordnung bleibt exakt die des Clients (sonst trainiert man auf Paaren, die im Betrieb nie entstehen); Bash-Heredocs verdoppeln Backslashes nicht sauber (Patch-Skripte per Write-Tool), `npm run … --` reicht unter PowerShell keine Flags weiter (Skripte direkt mit `node`). Enthält Mapping-Tabelle Konzept→`FireRecord`, Phasenplan AF1–AF4 mit Aufwand, offene Fragen mit Defaults, 15 Konzept-Irrtümer mit Beleg |
| `audit/brandflaechen-panel.md` | Diagnose **BP0** + Gate-Protokoll **GBP1** (2026-08-17, §9): Brandflächen als Polygone + linkes, ausklappbares Panel im Brandradar. Drei Lehren aus dem Bau: (1) mehrere Cluster in EINER Kartierung sind EIN Brand — die Registry verschmilzt sie (Hohes Venn, 3 × „2 825 ha" live gesehen); (2) Raster und Registry-Fläche gleichen gegen verschiedene Flächenmengen ab (gezeichnete vs. geladene) — die Registry-Fläche **vertritt** die Zone auf der Karte (`mapZones`), sonst zwei Formen; (3) ein geteilter Lade-Cache darf nicht am Abbruch-Signal des ersten Aufrufers hängen (Reacts doppelte Dev-Effekte). Enthält Einhängepunkte mit Datei:Zeile, den Datenweg-Entscheid (Live + EFFIS clientseitig; eigene Sentinel-2-Detektion **nur** als GitHub-Actions-Batch mit Commit-back nach `public/` — **im Repo gibt es kein R2/PMTiles**), das `FireRecord`-Schema, den Vorschlag einer überflugstabilen Brand-ID (Anker = älteste Detektion), den Lizenzcheck (FIRMS + Nominatim blockiert nach den neuen Constraints) und den Plan BP1–BP4 / BA-P1–P5. Kickoff: `prompt-brandflaechen-panel.md` |
| `audit/brandflaeche-vorlaeufig.md` | Diagnose **VB0** + Gate **GVB1** (2026-08-19): Kann die App eine eigene Brandfläche zeichnen, solange EFFIS noch nicht kartiert hat? **Gemessen: nein.** 618 Archivpaare (EFFIS-Kartierung × FIRMS-Detektionen 2020–2026, netzfrei aus dem AF4-Cache, Paarzahl reproduziert AF4 exakt), vier Formregeln gegen die Nullhypothese „Detektionsraster": keine schlägt sie (IoU-Median 0,095 gegen 0,092/0,088/0,090). Schrumpft man das Raster auf die AF4-Schätzfläche, wird die **Größe** richtig (Verhältnis 1,03 statt 6,10) und die **Lage** falsch — der Anteil Formen ohne jede Überlappung steigt von 1 % auf 24–36 %. Drei Ursachen: 85,4 % aller Fälle sind **Sub-Pixel** (Schätzung kleiner als ein VIIRS-Pixel), der Schwerpunktversatz Raster ↔ Kartierung beträgt **rund ein Pixel** (Median 261 m: VIIRS sieht die Front, EFFIS kartiert die Narbe), und der AF4-**Punktwert regressiert zur Mitte** (7,45× bei 0–2 ha, 0,17× bei > 200 ha — das Intervall trägt, der Punktwert allein nicht). Umgesetzt wurde deshalb nur die Sprache an der vorhandenen Form: **„Vorläufige Brandfläche (geschätzt)"** mit Intervall und Einschluss-Satz, wortgleich in Panel-Detailkarte und **beiden** Karten-Steckbriefen (vorher stand die Schätzung nur im Panel). Lehren: eine Formregel wird an der Zielgröße gemessen, bevor sie gezeichnet wird — ein Abbruchkriterium vorab schützt vor der hübschen falschen Form; und eine Auskunft, die es nur an einer von zwei Stellen gibt, ist ein Widerspruch, kein Detail. Skript `scripts/fire/geometry-eval.mjs`, Ergebnisse `data/fire/vb/geometry-eval.*` |
| `audit/radar-punktverortung.md` | Diagnose **RP0** + Gates **GRP1** (DE, 2026-08-19) und **GRP2** (AT + CH, 2026-08-20): Karte und Punktabfrage des Regenradars beschrieben verschiedene Orte. Alle drei Landesgitter sind projiziert, keines ist in lon/lat regulär — die Punktabfrage interpolierte aber linear zwischen den vier Geo-Ecken und griff dadurch **DE 13–36 km** (Median 24, systematisch nach Norden), **AT 6,7 km** (Median, max 11,0) und **CH 10,3 km** (Median, max 11,1) daneben; an echten Daten kippte das bei 21,7 % von 700 DE-Städten die Aussage „regnet es hier“ (Slider „trocken“, während die Karte Regen zeigt — Jans Beobachtung). Behoben: je Quelle EIN Geo-Modul (`radolanGeo.ts` polar-stereografisch · `geosphereIncaGeo.ts` Lambert EPSG:31287 auf WGS84 · `meteoSwissGeo.ts` LV95/somerc), Punktabfrage über die Fassade `src/pointForecast/radarSample.ts` (`projectionFor` + `anchorFor`), Warp-Meshes für AT/CH im RainLayer und `GridKind` statt `ps: boolean` im DACH-Komposit der Wetterkarte. Ergebnis: DE 700/700, AT 51/51, CH 133/133 Orte wertgleich mit der Karte; Verifier `verify:radar-sampling` 25/25. Lehren: (1) Rendering und Punktabfrage desselben Feldes müssen **denselben** Verortungscode benutzen, sonst beschreibt der Text einen anderen Ort als das Bild; (2) ein Genauigkeits-Kommentar („Sub-Pixel“) ist eine Behauptung, bis sie an der Zielgröße gemessen ist — die Widerlegung („bis ~40 km“) stand zwei Dateien weiter im selben Repo; (3) die Projektion muss man nicht raten: **rzc nennt sie selbst** (`/where.projdef`), **INCA liefert die Zellkoordinaten**, an denen jeder Kandidat prüfbar ist; (4) die zweite Fehlerhälfte ist die Frage, **was die vier Ecken bezeichnen** — Zellmitten oder Außenkanten (eine halbe Zelle); (5) `regular-lat-lon` (ICON-D2) ist der einzige Fall, in dem die 4-Eck-Inverse exakt ist |
| `audit/karten-layer-verortung.md` | Diagnose **KL0** (2026-08-21, Jans Frage „kommt derselbe Fehler auch in den Wetterkarten-Layern vor?“): alle 19 Layer auf **Projektion** und **Eck-Konvention** geprüft, Versatz an 759 DACH-Orten gemessen. Die Projektionshälfte ist repo-weit abgesichert — der GRIB-Decoder nimmt nur GDT 0 und GDT 101 an (`gribDecode.ts:230`), und alle Switcher-Modelle liefern Punktlisten in die Fusion. Die **Eck-Konvention** ist es nicht: ICON-D2 liefert Außenkanten, die Fusion Zellmitten, und beide gehen durch denselben Shader. Sechs Befunde: **B1 (schwer)** `confidence` im PoP-Modus gibt die polar-stereografischen DE1200-Ecken als achsparalleles lon/lat-**Rechteck aus nur NW und SE** an den `ConfidenceLayer` ⇒ **Median 76,7 km, max 93,7 km** (DE) — schwerer als der Radar-Fehler, der die Linie ausgelöst hat; Kontrolle mit demselben Rechenweg auf `poprob` (mit `de1200WarpMesh`) 0,02 km. **B2** der IDW-Rasterer (nur bei explizit gewaehltem EXTERNEM Modell; das hauseigene „Buscosun Fusion“ ist am 2026-08-22 aus dem Katalog geloescht, der Rasterer selbst nicht) legt seine Zellen auf `i/(cols−1)`, der Shader liest sie als Außenkanten ⇒ Karte 3,1–9,2 km daneben (Punktabfrage richtig). **B3** ICON-D2-Subsampling nimmt den ersten Punkt jedes 2×2-Blocks, gezeichnet wird die Blockmitte ⇒ **konstant 1,11 km zu weit nördlich**; zusätzlich Karte ↔ Punktabfrage bis 1,42 km (betrifft die Stadt-Temperatur-Labels, deren Kommentar „matches the colour of the underlying heatmap pixel“ damit falsch ist, und die Schneefallgrenze). **B4** DACH-Komposit 0,5 km. **B5** `coarsenFrameU8` deckelt mit `floor(w/8)` und lässt 4 der 1100 RADOLAN-Spalten fallen, gezeichnet wird über die vollen Ecken ⇒ `flownowcast`/`poprob`/`confidence` nach Osten gedehnt, bis 4,0 km. **B6** das DEM des Temp-Layers tastet auf Zellmitten ab, der Shader liest es mit derselben `uv` wie die Werte-Textur (Außenkanten) ⇒ die Höhenkorrektur je Pixel greift bis 1,2 km daneben — der einzige Befund, der nicht die Position, sondern den **Wert** ändert (Wirkung = Geländerelief über diese Strecke, im Hochgebirge bestimmend, nicht gemessen). Lehre: der Radar-Fehler war nicht „RADOLAN ist projiziert“, sondern **es gibt keine Stelle, die weiß, was die vier Zahlen bedeuten** — `radarSample.ts`/`GridKind` sind diese Stelle nur für die Radar-Kette; für die übrigen Layer ist `lngToEquiX` in zwölf Dateien kopiert und die Konvention nirgends geschrieben. Umgesetzt am 2026-08-22 (Gate **GKL1**, §12): EINE benannte Stelle für die zweite Frage — `subsampledCorners(f, ss)` neben `gribCorners` in `gribDecode.ts` („wo liegt das Gitter“ vs. „wo liegen die Werte, die im Bild stehen“) plus `texelCoord(uv, n)` als die eine GPU-Konvention; neun Raster-Quellen, drei Wind-Pfade und fünf Punktabfragen darauf gezogen, DEM auf Zellmitten, `GRID_GEO.lonlat` auf `edge: true`, `coarsenFrameU8` auf `ceil`, und der PoP-Schleier per `buildIndexMap(…, 'radolan')` auf ein reguläres lon/lat-Gitter umgetastet — **ohne Shader-Änderung**, damit die STOPP-&-FRAGEN-Regel nicht fällt. Verifier `verify:layer-geometry` 15/15 (u. a. Rundlauf Karte→Punktabfrage 8,5e-14 Texel, Schleier max 5,42 km statt 76,7 km Median). **Nachmessung je Layer §13** (2026-08-22, Jans Nachfrage; `audit/karten-layer-verortung/nachmessung.mjs` importiert die echten Module): 17 der 19 Layer zeichnen jeden Wert exakt auf seinem Abtastpunkt (≈ 0 km, vorher 1,11 km N bzw. 4,60 km ICON-EU), Karte ↔ Punktabfrage überall 0,00 km. **B5 ist NICHT behoben** — `ceil` statt `floor` beseitigt zwar den Datenverlust (4 von 1100 RADOLAN-Spalten), aber nicht die Dehnung: `1100/8 = 137,5` kachelt die Domäne mit ganzzahligen Blöcken nie glatt, das Vorzeichen dreht sich nur (vorher +3,99 km, jetzt −3,96 km; an Orten Median 1,64 km) — betrifft `flownowcast`, `poprob` und den PoP-Schleier. Zwei exakte Wege: flächengewichtete Blöcke in `coarsenFrameU8` (empfohlen) oder `FLOW_FACTOR` 8 → 10 (1100/10 und 1200/10 gehen beide glatt auf). Zwei Nicht-Befunde sind dokumentiert, damit sie nicht wieder als Fehler gelesen werden: „3/759 falsche Zelle“ sind Zellgrenzen-Gleichstände (max Abstand 1,31 km < halbe Zelldiagonale 1,32 km), und die 2,99/5,92 km des Schleiers sind die erwartete Nächster-Nachbar-Umtastung 8 km → 8 km. Offen: **B5**, B2 (nur bei externem Raster-Modell) und die Browser-Verifikation |
| `audit/waldbrand-ausbreitung.md` | Diagnose **SF0** + Umsetzung + Gate **GSF1** (2026-08-19/20): Ausbreitungsrichtung je aktivem Brand (Pfeil + Fächer) statt Rasterfläche. Enthält die FBP-Gleichungstabelle mit Nummern und Quelle, den Brennstoffsatz mit ST-X-3-Koeffizienten (und **warum M-1/M-2 nicht gehen**: a = b = c = 0, PC wäre erfunden), die gemessene Datenlage (65 aktive Brände, 12 Pfeile, 12 DEM-Zellen, ISZ für alle 7 Stunden, Wind nur für Stunde 0) und acht Lehren — darunter: **Gl. 71/72 (Beschleunigung) gehören NICHT hierher** (sie beschreiben eine Punktzündung, unsere Brände brennen bereits), der Kurungsfaktor ist am Knick 58,8 % **nicht exakt stetig** (Sprung 4·10⁻⁴ — so veröffentlicht), **Textsonden am Quelltext scheitern an Zeilenumbrüchen im String** (auf den Werten prüfen), und **Leistungsanker messen die Maschine mit** (drei Anker fielen unter Last, im Leerlauf sofort grün) |
| `audit/waldbrand-forecast.md` | Diagnose **WF0** (2026-08-18) + Entscheidungsprotokoll **§13** + Gate **GWF1/GWF2** §14 + **WF3/GWF3** §15 (2026-08-19; Lehren WF3: die Stundenachse braucht eine **dreistufige** Ehrlichkeit — stündlich / Tageswert / gar nicht (`hourFollow`) —, ein Tages-Layer zeigt auf ihr den Kalendertag von jetzt + h (`dayOfHour`, Mitternacht = morgen), und ein Permalink-Feld, das „Achse aktiv" bedeutet, muss auch die 0 schreiben (`h` vorhanden ⇔ Stunden); CDP-`Page.navigate` auf denselben Pfad mit anderem Hash lädt die App NICHT neu — über `about:blank` gehen. Lehren WF1/2: cffdrs rechnet mit der exakten FF-Skalen-Konstante 250·59,5/101, nicht mit 147,2 — mit 147,2 verfehlt man die Referenzvektoren; die Stundenachse ist „jetzt + h", also `stepsForNowWindow` statt starrer Schritte 0…12; ein voller 608×373-Kettenschritt kostet ~90 ms ⇒ in Scheiben rechnen; **V-WF-10**: `bz2Worker.ts` degradiert nach dem 4-s-WASM-Timeout dauerhaft auf pure-JS — 28 min statt 11 s im Smoke): **WF4/GWF4** §16 (Layer `fireForecast`: Bit 13, Fläche ICON-D2 / Punkt Fusion, `isiRamp.ts`, Punktkurve per dynamischem Import; Lehren: ein neuer Custom-GL-Layer braucht DREI Einträge — `CUSTOM_GL_LAYERS` (sonst blockiert der Platzhalter aus `installLayers` den echten Layer), einen Lizenzträger (Custom-Layer tragen keine Source-Attribution) und `stateRef` **plus** `applyState`-Deps; Stundenlabels gegen `Date.now()` gerundet erzeugen zwei „jetzt" — Bezug ist der Beginn der laufenden Stunde; Long Tasks nur mit Kontrolllauf zuordnen, sonst schreibt man Bestand der neuen Phase zu — V-WF-13): Waldbrand-Forecast 0…+12 h **auf der Fusion** (Jans Vorgabe: Punkt-Forecast als Basis, fehlende Parameter in die Fusion, GitHub-Actions-Batch + R2). Kernbefunde: (1) der Punkt-Forecast trägt T/RH/Wind/Böe/Niederschlag stündlich, DE 24 h / AT+CH 60 h — für den Stundenanteil eines FWI **kein neuer Parameter**, aber **kein einziges ICON-D2-Feld**; (2) die Raster-Fusion (100×80, ~10 km) **verwirft RH und Böe** der Obs-Adapter (`fusionEngine.ts` greift sie nie ab; AROME-Grid fragt `rh2m` nicht ab) — RH ist der eine harte Ingest-Punkt; (3) die Brandradar-Treiber `fireWeather`/`fireSoilDryness`/`fireWind` sind **native ICON-D2 an der Fusion vorbei** — der Index aus der Fusion wäre eine zweite Meteo-Basis (Jans Entscheidung); (4) DMC/DC/FFMC₁₂ brauchen Vortagsgedächtnis — der Batch hebt die §W.5-Grenze auf, DWD-CDC `hourly/*/recent` (~600 Stationen, ~500 Tage) erlaubt Kaltstart ohne Einschwingphase in DE; (5) stündlicher Index ist fachlich tragfähig (Van Wagner 1977 hFFMC, `cffdrs::hffmc`, Rodell et al. 2024 hFWI aus NWP; **der DWD rechnet den WBI selbst stündlich**, publiziert nur das Tagesmax) — kein eigener Index, FWI-Gleichungen unverändert, nie „WBI"/„Gefahrenstufe"; (6) der Composite-Vorbehalt (`iconD2Relhum.ts:27-34`, `fireAssessment.ts:19-21`) trifft ein FWI nicht, steht aber im Code — nur Jan hebt ihn auf; (7) R2 existiert im Repo nicht (Transport-Zone). Enthält Parameter-Matrix (PF/RF/neu), ICON-D2-Katalog (148 Var., EPS-Abgleich), vier Wege A–D mit Schwächen, Empfehlung **B gestuft** (WF1 Rechenkern → WF2 RH in RF → WF3 Stundenregler → WF4 Layer ohne Batch → WF5 Batch+R2 → WF6 Kalibrierung an DWD-WBI), 11 Fragen mit Defaults, V-WF-1…8 |
| `mobile-design-guidelines.md` | Verbindliche Mobile-UI-Patterns (⚠ Datei fehlt derzeit im Arbeitsverzeichnis, s. Statusblock) |
| `docs/` | Fachspezifikationen (s. Tabelle unten) |
| `audit/` | Diagnose-/Phasen-Befunde (historisch, mit Belegen/Screenshots) |

**Fachspezifikationen unter `docs/`**

| Datei | Rolle |
|---|---|
| `docs/MAP.md` | 2D-Karte: Komponenten, Renderpipeline, Datenfluss, State, Konfiguration, Caching, Fehlerbehandlung, Performance |
| `docs/LAYER_SYSTEM.md` | Layer-Vertrag: die zwei Mechanismen, `LayerKey`-Verdrahtung, Z-Ordnung, Zielbild „Layer-Registry" |
| `docs/WEATHER.md` | Meteorologischer Layer-Katalog: 16 bestehende + 9 geplante Layer, Paletten-Ordnung, Länder-Abdeckungsmatrix |
| `docs/DATA_SOURCES.md` | Quellenbewertung DACH (DWD, GeoSphere, MeteoSchweiz, EUMETSAT, EUMETNET/OPERA, Copernicus) mit 24-Kriterien-Matrix je Quelle |
| `docs/API.md` | Externe Endpunkt-Kontrakte: URLs, Formate, Projektionen, Lizenz- und CORS-Lage |
| `docs/2d-layer-erweiterung.md` | **Integrationskonzept + Umsetzungsplan** für die neuen 2D-Layer (Phasen L0–L15) |
| `docs/zuglinien-radar-spec.md` | **Umsetzungsreife Spezifikation der Phasen L5 + L6:** Zeitmodell (`layerTime.ts`), Playback (`TimelinePlayer`), Frame-Budget, Prefetch, Regenradar-Rückblick, Niederschlagszuglinien (E1/E2), E3-Spec für L11, Verifier-Verträge, Byte-Identitäts-Kontrakte |
| `docs/niederschlag-architektur.md` | Niederschlags-Ansicht „jetzt–2 h" im Detail (D-14) |
| `docs/high-end-radar-feature-catalogue.md` | Funktionskatalog Radar (Referenzspezifikation) |
| `docs/fusion-*.md` | Fusions-Engine (Spec, Paper, v2-Plan, 2D-Integration) |
| `docs/zielgruppen-dach.md` | Zielgruppen-Fundament |
| `docs/model-switcher-gate0.md` | Per-Land-Modell-Switcher |
| `docs/aktivfeuer-merkmale.md` | **Merkmalsschema `FireFeatures` v1** (AF3) + **Kalibrierung** (AF4, §7): Felder mit Herkunft und `null`-Bedeutung, Regeln (kein `undefined`, keine Fläche ohne Art, deterministisch), Labelpaar mit zwei Quellen (`effis-rda` heute, `ba-dnbr` später) + `isEligiblePair`, log-log-Modelle `fre`/`det` mit 80-%-Prädiktionsintervall, Kalibrierbereich, Kill-Switch `?afEst=0` — Referenz `src/fire/activity/{features,calibration,estimate}.ts`, Skripte `scripts/fire/{pairs-from-archive,calibrate}.mjs` |

**Achtung Alt-Doku:** `docs/reports/*`, `docs/seo-geo/*`, `buscosun-atmosphaere-*.md`, `buscosun_seo_geo_*.md`, `prompt-loading.md` sind abgeschlossene Session-Artefakte — als Historie wertvoll, nicht als Ist-Beschreibung. Bei Widerspruch gilt: **Code > `architecture.md`/`decisions.md` > Alt-Doku.**

## Harte Regeln (gelten für jede Session)

- **Oberste Direktive: Funktionserhalt.** Keine bestehende Funktion wird entfernt, versteckt oder „vereinfacht". Umgruppieren ja, Weglassen nein — Ausnahmen nur mit expliziter Freigabe durch Jan.
- **Diagnose-First:** Diagnose → Plan → Implement → Verify → Gate. Kein Code vor schriftlicher Diagnose (`audit/<thema>.md`). Gates werden nur mit Beleg (Screenshot-Pfad, Trace, Konsolen-Auszug, Verifier-Output) abgehakt.
- **Ein Thema = eine Phase = ein Gate.** Keine zwei Features parallel in einer Session anfassen. (Für parallele Agent-Teams gelten die Zuständigkeits- und Konfliktregeln in `agents.md`.)
- **Desktop-Regression = Phase fehlgeschlagen.** Mobile-Änderungen nur per Media Query isoliert. Breakpoints: 767 px (mobil) / 1439 px (Desktop-Groß) — keine Ad-hoc-Breakpoints. Safe-Area via `env(safe-area-inset-*)`.
- **STOPP & FRAGEN (Jan) bei:** Shader-/WebGL-Pipeline-Änderungen, Fusion-Engine-Änderungen, Löschen von Komponenten, Dependency-Upgrades, Änderungen an Edge Functions/Warm-Crons/Manifest-Mechanik, allem Irreversiblen. Prod-Dispatch der Crons ist Jans Gate.
- **Mobile-GPU-Fallen:** kein Verlass auf `EXT_color_buffer_float`; explizite `highp`-Deklarationen; RGBA8-Packing-Pfad nicht anrühren. Performance-Regelung ausschließlich über den `FrameGovernor` (FPS-Leiter zuerst, Trail-0,5× als letzter Hebel, Partikelzahl ist **kein** Hebel) — keine Sonderpfade.
- **Ehrlichkeit ist Produktprinzip:** Unsicherheiten, Datenlücken und Länder-Asymmetrien (z. B. UV/Pollen/Warnungen DE-only) werden ausgewiesen, nie kaschiert. Experten-Layer (z. B. Rotation) tragen konservative Formulierungen — nie „Tornado"-Sprache.
- **Flag-Gating („Rule 2"):** Neue Rechenpfade ersetzen alte nie direkt; sie kommen default-off hinter Flags mit benanntem Fallback (Muster: Fusion v2).
- **Design-Standard Command-Deck (D-27):** Alle neue UI entsteht im Command-Deck-System (hell, Sand/Ink, League Spartan, Topbar+Rail+Dock, Feature-Token-Namespaces); Alt-Themes werden migriert, nie erweitert.
- **Verbesserungs-Pflicht (D-28):** Jede gefundene Verbesserung wird als `V-NN`-Eintrag in `improvements.md` festgehalten — immer mit Mehrwert (für Jan verständlich) und Umsetzungsskizze.

## Verifikation

- **Kein Test-Framework** (bewusst, s. `decisions.md`): stattdessen **55** Headless-Verifier `npm run verify:*` / `fusion:*` (gezählt 2026-08-22 inkl. `verify:layer-geometry` (KL1–KL7, 15/15), `verify:radar-sampling` (RP1/RP2, 25/25), `verify:fire-fwi` und `verify:fire-weather-grid`; WF4 kam ohne neues Skript aus — `verifyIsiRamp` läuft in `verify:fire-model` mit, das damit 123/123 zählt, `verify:fire-time` 127/127; die Angabe „25" von 2026-08-03 galt vor der Waldbrand-Linie) (Node `--experimental-strip-types` importiert echte App-Module; teils gegen Live-Server → Netzabhängigkeit einkalkulieren). `npm run typecheck` muss grün sein.
- **UI-Verifikation:** Chrome DevTools MCP (Desktop 1440×900, iPhone 12 Pro 390×844 DPR 3). Emulation ist für WebGL **nicht** repräsentativ — GPU-kritische Aussagen brauchen Real-Device (scrcpy/ADB), Jan informieren. Hinweis: In-App-Browser pausiert rAF → WebGL-Karten nur im Vordergrund-Browser verifizieren.
- Vor jedem Gate: die fünf Selbstverifikations-Fragen schriftlich mit Beleg beantworten (1 Funktionserhalt einzeln, 2 Desktop pixelgleich, 3 Touch-Targets ≥ 44 px, 4 Konsole sauber, 5 keine Long Tasks > 200 ms).

## Sprache & Konventionen

- Dokumentation auf **Deutsch**, Prompts an Claude Code auf **Englisch**, Code/Kommentare/Commits auf Englisch (Bestand ist gemischt — bei Neuanlage Englisch).
- Commits: Conventional Commits, Scope = Feature-/Themenname. Keine Commits ohne Auftrag.
- Nach jeder Phase: `checklist.md` aktualisieren, 3–5-Satz-Fazit in `context.md` §Session-Log anhängen.
