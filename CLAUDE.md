# CLAUDE.md — buscosun: Projekt-Verfassung für Claude-Code-Agenten

> **Stand: 2026-09-08.** **Aktuelle Phase: SH0 — „Auswahl teilen“ (Diagnose + Plan)** (`audit/teilen-share.md`).
> Jans Auftrag: Teilen-Knopf je Feature-Seite, Zustand vollständig UND lesbar in der URL, Share-Sheet
> (WhatsApp/Gmail/Mail/Kopieren), serverseitiges Vorschaubild. **Kein Code — SH0 ist Diagnose und Plan,
> die Umsetzung braucht Jans Bestätigung.** Kernbefund: der Zustand steht heute in **zwei** Formen in der
> URL — Query (Wetterkarte, Warnungen, Regenradar; `urlState.ts`, RT1) und **prozentkodiertes JSON im
> Fragment** (Waldbrand, Atmosphäre, Event, Historie, Globus); Tourenplanung, Vorhersage, Feedback und
> Validierung tragen gar keinen. **Ein Fragment erreicht den Server nie** ⇒ für fünf von neun Seiten ist
> ein zustandsbezogenes Vorschaubild heute grundsätzlich unmöglich, auch mit Edge Function. Gemessen
> (echte Codecs): Event 340, Globus 238, Waldbrand 195 Zeichen — alles unlesbarer JSON-Salat; das
> Zielschema `/<feature>/<ansicht>[/<ort-slug>]?<abweichungen>` bringt den Median auf **81 Zeichen**,
> größter Worst Case 513 (Atmosphäre mit 24-Punkt-Schnittlinie). Weiterer Befund: `ogImage` ist nur für
> `/wetterkarte` und `/atmosphaere` gesetzt — **alle anderen Seiten und alle 37 Sub-Routen zeigen
> `/og/home.png`**, obwohl der Kartenrenderer (`public/_og-card.html`, 74 PNGs) längst existiert.
> Etappen SH1–SH6 mit Gates und die offenen Entscheidungen E-1…E-7 (u. a. Ort hinter statt vor dem Layer,
> Tourenplanung ohne Strecke, helle statt dunkle OG-Karten, Edge-Function-Freigabe) stehen im
> Phasen-Dokument; `architecture.md` §2 (war noch Vor-RT1) und §15 sind nachgezogen.
> ⚠ **R2 gibt es in diesem Repo nicht** — der CDN-Weg ist `buscosun-data` über jsDelivr.
>
> **Davor (2026-09-07): LZ1 — Ladezeit am Layer-Klick** (`audit/layer-ladezeit.md`).
> Diagnose LZ0: Dekodieren + GPU kosten 15–60 ms; dominant war der **kalte jsDelivr-TTFB** (p50 0,60 s,
> p90 1,43 s), weil der Publish je Lauf force-pusht und jede Bild-URL den Commit trug — fast jeder Klick
> ein MISS —, dazu der Index-Round-Trip nach 60 s (+93 ms warm, +1,36 s nach Purge). Umgesetzt (Jans
> „ja starte damit", uncommitted): **M4** Fetch im `toggle` vor dem Render, **M2** Index stale-while-
> revalidate (15 min) + `@main`-Bild-URLs mit 404-Rückfall auf den Commit, **M1** Edge-Warm-up im
> Publisher (413 URLs, Chrome-`Accept-Encoding` — wirkt erst nach dem Push von `publish-repack.mjs`),
> **M3** Prefetch der Jetzt-Schritte von Böen/Gewitter/Rotation/Schnee/Blitz im Leerlauf. Kill-Switch
> `?lz=0`. A/B lokal gegen das echte CDN: Böen kalt **765 → 156 ms**, Klick nach 65 s **502 → 386 ms**,
> vorgeladene Layer **≈ 180–220 ms** Desktop / **394 ms** iPhone-Emu (alt 665). Fallen: jsDelivr hält je
> `Accept-Encoding`-Variante einen Cache-Eintrag (curl ohne Header misst einen Cache, den kein Browser
> liest); ein Effekt an `nowcastTick` mit Cleanup bricht einen laufenden Prefetch je Tick ab. Offen: M5–M8,
> Prod-Nachmessung, Real-Device (Chrome-MCP/Extension waren nicht verbunden ⇒ Playwright-core).
>
> **Davor (2026-09-04): BW-13 — der Windlayer kommt vollständig aus dem Daten-Repo**
> (`audit/bandbreite.md` §32; davor BW-12 / Gate GBW12 in §31). Ausgangspunkt war Jans Frage nach den
> Netlify-Kosten: gemessen **218 Manifest-Commits in 7 Tagen ≈ 31 Produktions-Builds pro Tag** — für zwei
> Crons, die seit dem 2026-08-23 **gar nichts mehr wärmen**. Die Auszählung fand den eigentlichen Treiber:
> **46 von 136 grib-Commits (34 %) änderten nichts als den `eps`-Abschnitt**, den der Client ausdrücklich
> nicht liest. Zwei Sofortfixe nahmen ~26 % der Deploys weg, der Index-Weg den Rest: **der Client liest Lauf
> und Schritte aus dem `index.json` des Daten-Repos**, das er für die Bilder ohnehin holt. Beide
> Warm-Workflows sind still (`warm-grib.yml` nur noch `workflow_dispatch`, **`warm-wind.yml` gelöscht**);
> `?repackrun=0` ist der benannte Rückfallweg. **JSON-Abrufe vor dem ersten Bild 3 → 1, GRIB über Netlify 0,
> 0 Cron-Deploys** (belegt: nach dem Push fanden drei fällige Zeitplan-Läufe nicht statt).
>
> **BW-13** hat danach die zweite Quelle ganz entfernt: `/latest-wind.json`, sein Cron, sein Verifier und
> der Wind-Manifest-Resolver sind weg. Der Windlayer nennt Lauf, Schritte und Bytes aus EINER Datei —
> gemessen `/wetterkarte/wind` kalt: **0 Abrufe an Manifeste, 0 an `/_dwd_*`**, alles von `cdn.jsdelivr.net`.
> Zwei Wächter mussten dabei einzeln mitwandern (V-BW-59): der **Horizont-Guard** (`runCoversNow` — ein Lauf
> kann jung genug sein und trotzdem keinen Schritt für „jetzt" tragen) und der **Preconnect**, der im
> gelöschten Resolver stand. Als Notweg bleibt Directory-Scan + GRIB; er greift nur bei CDN-Ausfall.
>
> **Rückwirkend über 24 Zyklen gemessen** (§31.18): DWD publiziert Schritt 004 bei Lauf+50 min und 027 bei
> Lauf+67 min, der Repack-Batch landet 1–2 min später — der Index-Weg ist damit **15–30 min früher** am neuen
> Lauf als der alte (Manifest mit Abschnitt: Median Lauf+80,5 min, plus Build). Ausbreitung Daten-Repo →
> jsDelivr am baren Pfad: **≤ 1,1 min**, im ungünstigen Fall einer 4,4 h alten Cache-Kopie.
>
> ⚠ **Offener Folgebefund (V-BW-58), jetzt der wichtigste:** `scripts/publish-repack.mjs` pusht genau EINMAL
> ohne Wiederholung, während der Radar-Spiegel im selben Repo alle 1–2 min pusht. Am 2026-09-04 scheiterte
> der Publish **dreimal** (10:07, 16:07, 17:32 — immer der Schritt „Publish", 16–18 s); 09z kam 84 min zu
> spät, **15z fiel ganz aus**, die Karte stand sechs Stunden auf 12z. Seit BW-13 ist das Daten-Repo für den
> Windlayer die einzige reguläre Quelle — der Fehler ist dadurch dringender geworden. Kur: der
> Commit-back-Loop aus `warm-grib.yml` (T2c). Zweiter offener Posten: **`relhum_2m`** (Feuerwetter) hat keine
> Repack-Familie und zieht ≈ 27 MB roh über Netlify je Kaltaktivierung.
>
> **Kritische Fallen dieser Linie:** die Schrittliste des Index enthält **Objekte** `{step,file,…}`, keine
> Zahlen — eine Fassung mit `Number.isInteger` war gegen synthetische Fixtures grün und gegen die
> Wirklichkeit für jede Familie `null`; ein **abgebrochener** Abruf ist kein Befund über seine Quelle
> (`AbortError` wurde als `absent` gemeldet und hinterließ einen Fehlalarm); wird eine Quelle durch eine
> andere ersetzt, **muss die Gesundheitsanzeige mitwandern** (`manifestHealth` kennt jetzt `primary`); und
> eine **Messsonde, die ihre eigene Quelle drosselt, misst nichts** (45-s-Polling auf die GitHub-API, 60/h).
> `verify:repack` **348/348** (LZ1), routing 105/105, health 20/20, datenalter 54/54, warm-budget 30/30,
> layer-erstbild 37/37, typecheck + Build grün, totalJs 1089,3/1109,8 KB.
>
> **Drei wiederkehrende Mess-Lehren der Satelliten-Linie (SAT2h) gelten weiter:** ein Mikro-Prüfstand mit
> mehreren Varianten in EINEM Isolat misst nur *Verhältnisse*, keine Absolutwerte (⇒ ein Isolat je Variante);
> ein Leistungsanker misst immer auch die Maschine mit (Vergleiche nur innerhalb eines Laufs oder mit
> genannter Last); und Byte-Gleichheitstests brauchen eine Negativ-Kontrolle, sonst beweisen sie nichts.
> Dazu aus BW-12/13: eine Hochrechnung aus EINEM beobachteten Fall ist keine Messung (die „ein Drittel der
> Deploys"-Schätzung wurde beim Auszählen zu 13 % bzw. 0 %); **synthetische Fixtures müssen die echte
> Datenform tragen**; und eine Frage nach *zeitlichem* Verhalten braucht nicht immer ein Beobachtungsfenster —
> DWD-Verzeichnisse, Actions-Läufe und Git-Verläufe sind rückwirkend lesbar. PowerShell-Fallen:
> `Set-Content -Encoding utf8` kodiert eine BOM-lose UTF-8-Datei doppelt, und `node … 2>&1 | Out-File` macht
> aus stderr-Warnungen ErrorRecords und liefert Exit 1 — Verifier nie mit `2>&1` starten.
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
| `audit/punktvorhersage-14tage.md` (+ `audit/punktvorhersage-14tage/`) | PV0 Diagnose/Spezifikation/Plan **und PV3 Implementierung** der punktbasierten probabilistischen Vorhersage („buscosun Fusion", `src/pointForecast/fusion/`): Verteilungsalgebra, Minimum-Varianz-Kombination mit Fehlerkorrelation, Repräsentativität aus dem Gelände, Klimatologie als Prior, Feuchtkugel-Phase. Gate GPV3 grün, danach **GPV3b: 0–336 h** (§8 — ACC mit zwei Zeitskalen, Taupunkt statt RH als Fusionsgröße, Klimatologie als letzter Member statt `null`). `verify:pv-fusion` **208/208** (nach Gate GPV3d, §10), netzfrei; alle sieben Skalargrößen tragen bis **372 h** eine echte Quelle, die Windrichtung endet konzentrationsabhängig (229 h bei 12 m/s, 46 h bei 3 m/s). Default-off hinter `distribution: true` — **kein Consumer nutzt das Flag**; drei Fachprüfungen (Statistik · Meteorologie · Integration) eingearbeitet. **Externes Audit 2026-09-07** (`FUSION_AUDIT.md`, `FUSION_VERIFICATION.md`, `FUSION_IMPROVEMENTS.md` in der Repo-Wurzel): Block 0 umgesetzt — Stationsanker jetzt Anomaliepersistenz (`validAtMs`/`climaAt`), ohne Klimatologie `null` statt stiller 8 °C, MOSMIX-Amplitude α = √ρ, Taupunkt-Lapse, Quellen-Auslauf auf dem Gewicht statt auf ρ; **K-2 umgesetzt** (§10): Niederschlag zweistufig — Auftreten im Probit-Latentraum mit eigenen Auftretens-ACC und Tail-Prior, Menge bedingt auf nass zur Nassstunden-Klimatologie, Ausgabe `hurdleLogNormal` (MOSMIX 5 mm/h bei 24 h: P(nass) 59 → 79 %, Median 0,22 → 1,95 mm/h). Falle: Nassmenge nie als Normalverteilung in log1p (30 % Masse < 0), und die MOS-Amplitude gehört nicht aufs Auftretens-Latent. **V-A₁ gelaufen** (§11, `npm run verify:pv-score`, netzabhängig): 111 DE-Stationen, MOSMIX_L as-of, POI-Wahrheit — Fusion-T = MOSMIX ± 3 % MAE, aber **Spread/Skill 0,5–0,6 (zweifach überkonfident, Gate verletzt)**, Wind +0,3 m/s Bias, K-1 an 435 Fällen belegt, **Altpfad bei 1–6 h 2,3× schlechter als rohes MOSMIX (V-PV-19, Produktdefekt)** — **behoben 2026-09-08 auf Jans Auftrag (§12): Stationsanker als Innovations-Persistenz (`src/pointForecast/anchor.ts`, Modell + Versatz·e^{−h/τ}, Versatz altersgewichtet aus den letzten 6 h ohne Archiv: BrightSky-Messungen + laufender MOSMIX-Lauf per `source_id`, TAWES-Historie, SMN-Tagesdatei), Default im Produkt, Kill-Switch `?anchor=value` / `anchorMode`; gemessen T 1–6 h 2,18 → 0,92 K (MOSMIX 0,90), Td 1,05 → 0,70. Fusion unberührt (behält K-1). `verify:pv-fusion` 222/222.** **Offen, in dieser Reihenfolge: Priors aus den Scorecards fitten (V-PV-18), Scorecards täglich fortschreiben, dann ICON-D2 aus dem CDN und IFS als zweites Zentrum; die K-2-Priors (`ACC.precipOcc`, `PRECIP_WET_CLIMA`, `PRECIP_OCC_TAIL`) sind ungemessen (V-PV-17); `climatologyOnly`/`climaSource` werden noch nirgends angezeigt (V-PV-14); Stufe 4 (GEFS-Spread) braucht einen neuen Actions-Cron ⇒ STOPP & FRAGEN** |
| `audit/teilen-share.md` | **SH0–SH6: „Auswahl teilen“** — Diagnose des URL-Zustands je Feature-Seite (Query vs. Fragment vs. gar nichts, gemessene Link-Längen), Zielschema `/<feature>/<ansicht>[/<ort-slug>]?<abweichungen>` mit Beispiel-URL je Seite, Share-UI, Kanäle, Open-Graph-Empfehlung in zwei Stufen, Etappenplan mit Gates, V-SH-1…10 |
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
- **Namensregel „buscosun Fusion" (Jans Festlegung 2026-09-06):** Der Punkt-Algorithmus in
  `src/pointForecast/fusion/` heißt im Projekt **immer „buscosun Fusion"** — in Doku, Code-Kommentaren,
  Commits und UI. Keine Umschreibungen („Punkt-Fusion", „point engine", „die Fusion", „der Algorithmus").
  Der Ordner bleibt `fusion/`; die erwogene Umbenennung nach `predictive/` ist damit erledigt.
  **Abgrenzung:** `src/fusion/` ist etwas anderes — der IDW-Rasterisierer der 2D-Karte, Name historisch
  (s. `audit/rasterfusion-rueckbau.md` §2). Wo beides gemeint sein könnte: „buscosun Fusion" für den Punkt,
  „Rasterfusion" für die Karte.
- Commits: Conventional Commits, Scope = Feature-/Themenname. Keine Commits ohne Auftrag.
- Nach jeder Phase: `checklist.md` aktualisieren, 3–5-Satz-Fazit in `context.md` §Session-Log anhängen.
