# Regenchance im Regenradar — Phase RC (Diagnose, 09.10.2026)

Auftrag (Jan, 09.10.): im Regenradar eine Wahrscheinlichkeitskarte „Wie wahrscheinlich ist Niederschlag zur gewählten Zeit
an jedem Ort?". Karte aus den Kartenfeldern von buscosun Fusion (ehrlich beschriftet), am Ort die volle buscosun Fusion.
Grundstufe „Niederschlag ja/nein" je Stunde; Schwellen und Fenster nur, wo sie sich aus der Verteilung **exakt** ableiten
lassen; Lücke statt 0 %. Karte im Prognose-Stil (Punktraster nach Dichte, Konturen 30/50/70/90 % mit Beschriftung),
Legende mit Stufen, Quelle, Lauf, Lücken schraffiert; am Ort ein Satz + 48-h-Leiste mit Slider-Marke. Erst Diagnose,
Entscheidungen mit Jan, hinter einem Flag; buscosun Fusion nur nutzen.

Kürzel **RC** (Regenchance) — `CH` ist im Projekt die Schweiz. Befunde V-RC-*, Entscheidungen E-RC-*.

## 1 Was es schon gibt (am Code geprüft, `main` = `3eeed6d`)

| Baustein | Ort | Stand | Für RC |
|---|---|---|---|
| Dock „Darstellung" Intensität \| Summe | `precipSums/PrecipSumsUi.tsx` `SumControls`, Zustand `sumModel.ts` (`SumMode = 'intensity' \| 'sum'`), gemerkt in `localStorage` | **da** (Phase NS), Desktop-Dock + Mobil-Reiter „Layer" | dritte Taste „Chance" ergänzen, nichts umbauen |
| Ansicht „Chance" | — | **fehlt** (kein Treffer für „Chance" in `src/map`, `MapView`, `nowcast`, `precipSums`) | neu |
| Kartenfeld mit Chance | `point/fieldFormat.ts`: `precip-<LLL>.png`, R = round(254 · Chance), Chance = 1 − pDry der Hürde (`CHANCE_DEFINITION` F1) | **im Daten-Repo, live** (t1 `2026100906`, 49 Vorläufe stündlich, 241 × 201, 0,05°); **kein Leser im Client** | Rohstoff der Karte |
| Leser/Netz der Kartenfelder | `precipSums/fieldCum.ts` (Index, Manifest, Bilder), `obsSumStore.ts` `fetchDataRepo` (raw zuerst, jsDelivr nach 2,5 s), `browserPng.ts` | **da** — liest nur `precipcum` | Muster für `precip-<LLL>.png`, Index/Manifest/Netz wiederverwenden |
| Karten-Ebene ohne Shader | `precipSums/sumMapLayer.ts` (`image`-Source in Mercator-Zeilen + `circle`), Lazy-Chunk `sumMapEngine.ts` | **da** | Muster; RC braucht zusätzlich `fill` mit `fill-pattern`, `line`, `symbol` (alles Standard-MapLibre) |
| Schraffur „keine Daten" | `sumGrid.ts` `renderSumRgba` (Diagonale im Bild), Legende `.ns-hatch` | **da** | wiederverwenden (als Muster-Bild) |
| Legende unten | `SumLegend` (`.ns-legend`), mobil über der Leiste | **da** | gleiche Hülle, eigener Inhalt |
| P(nass) je Stunde am Ort | `nowcastEngine.ts` `fusionPWetOf` = `exceedance(dist, 0,1 mm/h)` (Phase RB, 25 h); `dashboard/model/build.ts` `pWetOf` = `exceedance(dist, 0)` | **da, zwei verschiedene Schwellen** (V-RC-1) | am Ort neu aus `cube.v2` lesen, Definition = die des Felds |
| Satz am Ort | `RainWindowCard` (RB, voreingestellt an seit 09.10.): „Regen möglich ab 23 Uhr · 32 % · buscosun Fusion", 24-h-Zeitleiste mit Band | **da**, aber Regenbeginn, kein „Chance zur gewählten Zeit" | nicht ersetzen; neue Karte darunter, Wortlaut abgestimmt (E-RC-4) |
| 48-h-Leiste der Stundenchance | — | **fehlt** (NS-Balken zeigen mm, RB-Leiste zeigt nur das Fenster-Band) | neu |
| Slider-Zeit im Readout | Slider-Zustand lebt in `NowcastRadarMap` (`framePos` → `profileTimeMs`); das Deck kennt ihn nicht | **fehlt** | additiver Melder `onTimeChange` (wie `onRadarStack`) |
| „Regenchance x % · 60 min" | `radar/PointStrip.tsx` (Flow-Ensemble, nur DE, eingeklappt) | da, **anderes Maß** (Radar-Verlagerung, V-RB-4: unterschätzt) | Wortkollision benennen, nicht anfassen |

**Fazit:** Vorhanden sind der Rahmen (Dock-Leiste, Legende, Schraffur, Leser, Netz, Lazy-Chunk-Muster) und der Rohstoff
(Feld-Chance live, Fusion-Verteilung am Ort). Es fehlen die Ansicht „Chance" (Taste, Karte, Legende), die Ortskarte mit
48-h-Leiste und die Weitergabe der Slider-Zeit. Nichts davon wird neu gebaut, was schon funktioniert.

## 2 Was die Kartenfelder liefern (gemessen 09.10., Lauf t1 `2026100906`, raw.githubusercontent)

- Index `point/field/v1/index.json`: **t1 und t3, kein t2** (V-RC-2 — betrifft auch „Erwartet 48 h" der Summen).
- Manifest t1: 49 Vorläufe 0…48 h stündlich, Gültigzeit = Ende des Intervalls (t − 1 h, t]; `chain.options.fusionName`
  „buscosun Fusion 9", `station: null`, `radar: null`, Gelände „flach in Modellhöhe" ⇒ das Etikett „Modell · Cube" ist
  ehrlich und trägt **auch das fehlende Radar** (in den ersten 2 h wichtig: die Fusion am Ort nimmt dort das Radar-
  Stundenmittel, das Feld nicht).
- `stats`: 48 441 Zellen, `precipMissing` **0**, `errors` 0 — Lücken gibt es heute nur außerhalb des Gitters
  (45,5–55,5° N / 5,5–17,5° E, deckt DACH ganz) oder bei künftigen A = 0.
- Verteilung der Chance (Zellen): Vorlauf 3 h: ≥ 10 % 18 383 · ≥ 30 % 9 971 · ≥ 50 % 2 452 · ≥ 70 % 208 · ≥ 90 % 18;
  Vorlauf 12 h: 31 520 / 22 934 / 6 502 / 980 / 0; 24 h: 30 719 / 21 555 / 5 251 / 431 / 0; 36 h: 23 118 / 19 148 /
  2 246 / 121 / 0. Jede Zelle hat Chance > 0 (die Hürde gibt nie exakt trocken). Die 90-%-Kontur ist selten, 30/50 % tragen.
- Bekannte Güte (`CHANCE_DEFINITION.measured`): Brier 3–48 h 0,026–0,028, Skill gegen Orts-Klimatologie 0,17–0,30;
  im Mittel etwas zu nass (V-NP0-17). Gehört in den Tooltip, nicht in die Legende.

## 3 Was sich exakt ableiten lässt

**Grundstufe „Niederschlag ja/nein".** Chance = 1 − pDry der Hürde {pDry, μ, σ} — dieselbe Größe im Feld (R-Kanal) und am
Ort (`cdfOf(dist, 0)` aus `cube.v2`). Gemessen wurde sie gegen „Stationsstunde ≥ 0,1 mm". **Exakt, auf Karte und am Ort
gleich definiert.**

**Je Schritt, nicht je beliebiger Stunde.** Der Wert eines Schritts gilt für sein Intervall (t − Δ, t]: t1 Δ = 1 h,
t2 3 h, t3 6 h. Folgen:
- Karte: Der Slider reicht heute höchstens bis +2 h (DE RV) / +3 h (AT INCA), CH nur „jetzt" — dort liegt immer t1 ⇒
  stündlich, exakt. Eine Kartenzeit jenseits 48 h ab Init bräuchte t2/t3 (heute nicht im Index, V-RC-2).
- Ort: t1 trägt 48 h ab **Init**, der Init liegt 2–5 h zurück ⇒ die letzten 2–5 h der 48-h-Leiste fallen in t2: dort ist
  der Wert „Chance im 3-h-Intervall" — ein breiter Balken mit eigener Beschriftung, nie auf Stunden verteilt.
- Interpolierte Stunden der Stundenachse (`interpolated`, `dist: null`) haben keine Verteilung ⇒ **Lücke**. Stunden,
  die die Station füllt (`tier: 'station'`), liegen im Intervall eines t2-Schritts ⇒ dieselbe Zerlegungsregel wie die
  Summen (§9.2 NS: nativer Cube-Schritt zuerst, Station nur in sonst unbelegter Zeit, nie beides).

**Schwellen ≥ 1 mm / ≥ 5 mm.**
- *Am Ort:* exakt — `exceedance(dist, x/Δ)` am nativen Schritt (t1: ≥ 1 mm in der Stunde = Rate ≥ 1 mm/h; t2: ≥ 1 mm
  in 3 h = Rate ≥ ⅓ mm/h). Nur lesen, kein Motor-Eingriff.
- *Auf der Karte:* das Feld trägt keine Verteilung, nur Chance, Median | nass, q90 (8-bit-Log-Code). Weil die Familie die
  Hürde mit Lognormal ist (drei Parameter, drei Zahlen), lässt sich P(≥ x) **zurückrechnen**, wo pDry < 0,9. Gemessen
  (Skript `chance-diag2.mjs` im Session-Scratchpad, Vorläufe 3/12/24/36 h, ±½ Code-Stufe auf Median und q90):
  - ≥ 1 mm/h: Band (10/30/50/70/90) **eindeutig in 98,5–99,5 %** der Zellen mit Chance ≥ 10 %; **229–701 Zellen
    mehrdeutig** (die Quantisierung kreuzt eine Grenze); Zellen mit Chance < 10 % sind exakt (P(≥ x) ≤ Chance). Spanne
    der Wahrscheinlichkeit an Zellen ≥ 30 %: p50 0,4–0,5, max 1,5 Prozentpunkte. Verteilung ≥ 1 mm/h: ≥ 30 % in 149–1 242
    Zellen, ≥ 50 % in 9–41, ≥ 70 % fast nie.
  - ≥ 5 mm/h: ≥ 10 % in **28–113 Zellen**, ≥ 30 % in 0–1 — die Karte wäre fast leer (ehrlich, aber erklärungsbedürftig).
  - Grenze des Rückwegs: er hängt an der Annahme „Familie = Hürde-Lognormal" (heute wahr in `fs`; ein künftiger Stand mit
    anderer Familie rechnete still falsch — das Manifest nennt die Familie nicht). **Exakt und robust** wäre ein
    Producer-Zusatz: je Vorlauf ein Bild `pexc-<LLL>.png` mit R = P(≥ 1 mm), G = P(≥ 5 mm) aus derselben Verteilung
    (`exceedance`, eine Rechnung je Zelle mehr), Muster wie `precipcum` (E-NS-9). Wirksam erst nach Jans Push.

**Fenster (6 h, 24 h).** P(„irgendwann im Fenster nass") braucht die gemeinsame Verteilung der Stunden; buscosun Fusion
liefert nur Ränder je Schritt (wie bei der Summen-Spanne, E-NS-8). **Nicht exakt ⇒ nicht gebaut.** Exakt wären nur
Schranken (Fréchet): max_h p_h ≤ P(Fenster) ≤ min(1, Σ p_h) — eine Untergrenze „mindestens 70 %" wäre wahr, aber keine
Fensterwahrscheinlichkeit. Native 3-h/6-h-Intervalle von t2/t3 sind Fenster, liegen aber fest im Laufraster
(z. B. 09–12 UTC) und sind heute nur am Ort erreichbar.

## 4 Darstellung — machbar ohne Shader (Command-Deck, D-27)

- **Punktraster nach Dichte:** Bänder „≥ 10 / 30 / 50 / 70 / 90 %" als Flächen (Marching Squares auf dem 241 × 201-Gitter,
  eigene ≈ 150 Zeilen, keine Abhängigkeit) mit `fill-pattern`. Jedes Band bringt nur die **zusätzlichen** Punkte einer
  geordneten Rastermatrix (Bayer 8 × 8) — übereinander ergibt das genau die Dichte des Bands (10 % ⇒ 6 von 64 Punkten,
  90 % ⇒ 58). Muster sind Bildschirmpixel ⇒ scharf bei jedem Zoom. Farbe Ink/Stahl, keine Radar-Palette (Verwechslung
  mit Intensität ausgeschlossen).
- **Konturen 30/50/70/90 %:** dieselben Ringe als `line` (dünn, 0,8–1,2 px), Beschriftung `symbol-placement: line` mit
  `Noto Sans Regular` (Glyphen von OpenFreeMap, wie `RoadMap.tsx`).
- **Lücke:** Zellen mit A = 0 als eigenes Band mit Schraffur-Muster; außerhalb des Feldgitters wie bei „Summe" nichts.
- **Legende:** Punktdichte-Stufen 10…90 %, „Chance auf Niederschlag in der Stunde HH–HH Uhr", „buscosun Fusion 9 ·
  Modell · Cube (ohne Station, Radar und Gelände am Ort) · Lauf 06 UTC", Schraffur = keine Daten.
- Kosten: ein PNG je gezeigter Stunde (32–75 KB), Konturen je Stunde ≈ 50 k Zellen — im Leerlauf/Worker, gemessen beim Bau.

## 5 Befunde

- **V-RC-1** Zwei Definitionen von „Regenwahrscheinlichkeit" am selben Ort: RB nimmt `exceedance(dist, 0,1 mm/h)`, das
  Feld und das Dashboard 1 − pDry. Bei Median | nass 0,5 mm/h und σ 1,2 liegt der RB-Wert um ≈ 9 % (relativ) tiefer
  (70 % gegen 64 %). Da die Hürde gegen „Stunde ≥ 0,1 mm" gelernt ist, zählt RB die Schwelle doppelt. Mehrwert: eine Zahl
  je Stunde in der ganzen App. Skizze: RB auf 1 − pDry stellen (eigene Entscheidung, berührt `verify:rain-window`). **Gemessen und umgesetzt 09.10. (§11): gleichauf ⇒ 1 − pDry, `?rbwet=0.1` Rückfall.**
- **V-RC-2** Der Feld-Index führt am 09.10. keine Stufe t2 (`latestByTier` nur t1, t3). Mehrwert: „Erwartet 48 h" der
  Summen und jede Kartenzeit > 48 h ab Init. Skizze: Punkt-Cron-Log des t2-Feldschritts lesen (Regel F′ 10 min?). **Ursache belegt und behoben 09.10. (§10): Frist ab Jobstart, Mindestfenster 45 s + Wächter.**
- **V-RC-3** „Regenchance" steht schon am Punkt-Streifen für das Flow-Ensemble (V-RB-4: unterschätzt herannahenden Regen).
  Mehrwert: kein Wort für zwei Maße. Skizze: dort „Radar-Ensemble" nennen.

## 6 Entscheidungen (Jan, 09.10.2026 — E-RC-1…4 je die Empfehlung; E-RC-5/6 nach Empfehlung, nicht eigens gefragt)

| Nr. | Frage | Empfehlung = Entscheidung |
|---|---|---|
| E-RC-1 | Zeitbereich der Karte: nur der Slider (−2 … +2/3 h, CH nur jetzt) — oder zusätzlich Kartenzeit bis +48 h über die 48-h-Leiste am Ort? | Slider + Klick in die Leiste (Karte zeigt dann diese Stunde, Slider-Marke „außerhalb") |
| E-RC-2 | Schwellen ≥ 1 / ≥ 5 mm auf der Karte | Producer-Zusatz `pexc-<LLL>.png` (exakt, nach Push); bis dahin Segment auf der Karte = benannte Lücke, am Ort sofort |
| E-RC-3 | Definition „Niederschlag ja/nein" | 1 − pDry überall in RC (= Feld); RB bleibt, V-RC-1 getrennt |
| E-RC-4 | Satz am Ort | Stunde unter dem Slider; Slider in der Vergangenheit ⇒ nächste volle Stunde ab jetzt |
| E-RC-5 | Fenster 6/24 h | nicht bauen (nicht exakt); Fréchet-Untergrenze nur auf Wunsch |
| E-RC-6 | Schalter | `?rc=1` an, voreingestellt aus; ohne Schalter byte-gleich (Regel 2) |

**Auslegung E-RC-4:** „nächste volle Stunde ab jetzt" ist als **laufende Stunde** umgesetzt (Slider 5 min zurück und Slider
„jetzt" zeigen dieselbe Stunde; sonst spränge die Anzeige beim kleinsten Rückblick um eine Stunde). Satz und Legende sagen
dann „Slider im Rückblick — gezeigt ist die laufende Stunde". Andere Lesart = eine Zeile in `chanceHourAt`.

## 7 Umsetzung (09.10., uncommitted, Schalter `?rc=1`, voreingestellt aus)

| Teil | Dateien | Inhalt |
|---|---|---|
| Producer (E-RC-2) | `src/point/fieldFormat.ts`, `scripts/point/build-point-fields.mjs` | neues Bild je Vorlauf `pexc-<LLL>.png`: R = P(≥ 1 mm), G = P(≥ 5 mm) im Intervall = `exceedance(dist, x/stepH)` **derselben** Verteilung (`pexcOf`), A = 0 = fehlt; Manifest `leads[].pexc`, `encoding.pexc/pexcMm`; Felder ohne `pexc` bleiben gültig; Schalter `POINT_FIELD_PEXC=0`. buscosun Fusion nur gelesen |
| Rechenkerne (rein) | `src/precipChance/chanceModel.ts`, `chanceSeries.ts`, `chanceField.ts`, `contours.ts`, `chanceGeometry.ts` | Schalter, Schwellen, Stufen, Bayer-Raster, Stunde, Wörter; Chance am Ort je nativem Schritt (Zerlegung wie die Summen, 3-h-Werte nie verteilt, Interpolation nie, Lücke = null); Schritt zur Stunde im Feld; Marching Squares mit Ringen/Löchern (RFC 7946, eigene Umsetzung, keine Abhängigkeit) |
| Karte | `chanceMapEngine.ts` (eigener Lazy-Chunk), `chanceMapLayer.ts`, `useChanceMap.ts`, `chanceMapTypes.ts` | Punktraster als `fill-pattern` je Band (nur Zuwachs-Punkte, scharf bei jedem Zoom), Lücken schraffiert, Konturen `line` + Beschriftung `symbol` (Noto Sans); Farben für das dunkle Radarfeld (`basemap-dim` Ink 80 %); je Stunde eine Rechnung; Hover „35 % · Modell · Cube" |
| Ort | `usePointChance.ts`, `PrecipChanceUi.tsx` `PointChanceCard` | volle buscosun Fusion (`getPointForecast`, `pointSource: 'cube'`, 50 h), Satz zur gewählten Stunde, 48-h-Leiste (breit = 3-h-Wert, Lücke schraffiert, Slider-Marke, Klick/Pfeiltasten wählen die Kartenzeit, „Karte folgt wieder dem Slider") |
| Oberfläche | `PrecipSumsUi.tsx` (Slot `chance`), `sumModel.ts` (`SumMode` + `chance`), `NowcastDeck.tsx`, `NowcastRadarMap.tsx`, `precipChance.css` | Dock „Darstellung" Intensität \| Chance \| Summe + Schwelle „> 0 · ≥ 1 mm · ≥ 5 mm"; Legende; Readout „Chance am Ort" unter dem Hero, mobil im Schnellblick; Karte meldet die Slider-Zeit (`onTimeChange`), Nutzer-Zeit beendet die Wahl aus der Leiste (`onUserTime`) |
| Prüfung | `scripts/verify-regenchance.mjs` (`verify:regenchance`, in CI), `verify-np0-fields.mjs` B2 (+ pexc), `verify-precip-sums.mjs` G3 (Muster um `\|\| chanceMode` erweitert) | s. §8 |

**Rückfall (Regel 2):** ohne `?rc=1` bzw. mit `?sum=0` kein Element, keine Ebene, Dock wie vorher (geprüft im Browser);
eine gespeicherte Ansicht „Chance" wird ohne Schalter zu „Intensität". Der Producer-Zusatz wirkt erst mit Jans Push; bis
dahin zeigt die Karte bei „≥ 1/≥ 5 mm" eine benannte, schraffierte Lücke, am Ort gelten die Schwellen sofort.

## 8 Gates (Belege)

| Gate | Ergebnis |
|---|---|
| `verify:regenchance` | **44/44** (A Modell 8, B Vertrag 3, C Rechnung 5, D Feld 6, E Konturen 8, F Ort 7, G Verdrahtung 7), mit `--live` **45/45** (L1 am echten t1-Feld `2026100906` +12 h: 4 699 Zellmitten auf der richtigen Seite jeder Bandgrenze, 0 falsch, Geometrie 67 ms) |
| `verify:np0-fields --data=C:/dev/buscosun-data` | 23/24 — **B2 mit P(≥ 1/5 mm): t1 2 940, t2 1 440, t3 2 160 Werte, 0 daneben** (Feld = Kette über die volle Ausgabe); B3 Teilmengen-Weg exakt; **B14 rot unabhängig von RC** (Gegenprobe mit `POINT_FIELD_PEXC=0`: derselbe Abbruch, V-RC-4) |
| `verify:precip-sums` | 57/57 + 2 ⊘ (G3-Muster erweitert, Summe unverändert) |
| `verify:regenradar-profile` | 34/36 — C1b = bekannte Phasenwache vor V-FR-11; **E7** = Phasenwache „kein Diff unter `src/point`" wegen der additiven Erweiterung von `fieldFormat.ts` (grün nach dem Commit, wie bei NS) |
| `verify:rain-window` 57/57, `verify:fusion-release` 28/28, `verify:dashboard` 80/80 | grün |
| typecheck, Build | 0 Fehler; Build 255/255 |
| Budget | eagerJs 109,3 unverändert; totalJs Kontrollbau HEAD `3eeed6d` 1 638,9 → **1 649,3** (+10,4 KB lazy: `chanceMapEngine` 5,5 KB, Rest im Regenradar-Route-Chunk), Grenze 1 640 → **1 651** mit Notiz |
| Browser (Dev-Server, Playwright) | Desktop 1440×900 München: Dock „Intensität \| Chance \| Summe", Schwellen-Leiste, Legende „buscosun Fusion 9 · Modell · Cube · Lauf 06 UTC" + Etikett-Zeile + „t2: kein Feld im Index"; Punktraster und 30-%-Kontur mit Beschriftung (`audit/regenchance/desktop-chance-v2.png`); Klick in die Leiste ⇒ Karte und Satz „Regen morgen 10–11 Uhr: 50 % wahrscheinlich"; „≥ 1 mm" ⇒ Karte schraffiert mit Grund, am Ort „20 %" (`desktop-chance-ge1-gap.png`); mobil 390×844 Legende über der Leiste, Karte im Schnellblick, Leiste 62 px hoch (`mobile-glance-card.png`); ohne `?rc=1` 0 RC-Elemente, 0 `rc-`-Ebenen, Dock „Intensität \| Summe"; Konsole: nur die bekannten 404 der Slot-Sonden am CDN (V-FI-5) |

**Selbstprüfung:** (1) Funktionserhalt — nichts entfernt; Intensität, Summe, Regenbeginn, Hero unverändert; neu nur hinter
`?rc=1`. (2) Desktop ohne Schalter: dieselben Elemente und Ebenen (Zählung oben); kein Pixel-Diff gerechnet. (3) Touch-Ziele
mobil: Leiste 62 px, Schwellen-Tasten und Rücksprung `min-height: 44px`. (4) Konsole sauber bis auf bekannte CDN-Antworten.
(5) Long Tasks: Geometrie einer Stunde 67 ms (Node, echtes Feld), einmal je Stunde; im Browser nicht gemessen
(headless-shell liefert keine Long Tasks) — **Real-Device offen**.

## 9 Befunde (ergänzt)

- **V-RC-4** `verify:np0-fields` B14 (Publisher mit/ohne Felder) bricht am lokalen Klon ab: die Probe kopiert je Stufe nur
  die Chunks des jüngsten Laufs dieser Stufe, `2026100812/run.json` führt aber auch t1 (208 fehlende Dateien). Mit und ohne
  RC gleich. Mehrwert: das Gate läuft wieder an jedem Klon. Skizze: je kopiertem Lauf alle Stufen seines `run.json` kopieren.
- **V-RC-5** Die Feld-Chance zeigt in den ersten 2 h kein Radar (Etikett sagt es); am Ort trägt buscosun Fusion dort das
  Radar-Stundenmittel — Karte und Ort können sich in den ersten Stunden sichtbar unterscheiden. Mehrwert: eine Karte, die in
  der ersten Stunde mit dem Radar übereinstimmt. Skizze: 0–2 h die Chance aus dem Radar-Nowcast-Ensemble (nach V-RB-4
  kalibriert) überblenden — eigene Entscheidung.
- **V-RC-6** Die Dichtestufen 10 % (6/64 Punkte) und 30 % (19/64) sind auf dem dunklen Feld bei kleinem Zoom schwer zu
  unterscheiden. Skizze: Punktradius je Band leicht wachsen lassen oder Rasterweite 4 statt 5 px; am Real-Device beurteilen.

## 10 V-RC-2 — t2-Kartenfeld: Ursache, Fix, Wächter (09.10., Jans Auftrag)

**Diagnose (Actions-API, öffentlich, nur lesend; 11 t2-Jobs 06.10. 16:41 … 09.10. 04:45 UTC).** Minuten ab Jobstart:

| Jobstart (UTC) | Cube fertig | Feldschritt beginnt | Feldschritt dauert | Feld? |
|---|---|---|---|---|
| 06.10. 16:41 | 6,6 | 7,5 | 8 s | ja |
| 06.10. 22:38 | 7,7 | 8,6 | 9 s | ja |
| 07.10. 04:43 | 9,9 | 10,9 | 0 s | **nein** |
| 07.10. 10:39 | 7,8 | 8,8 | 10 s | ja |
| 07.10. 16:42 | 7,1 | 7,8 | 6 s | ja |
| 07.10. 22:39 | 8,4 | 9,4 | 0 s | **nein** |
| 08.10. 04:44 | 11,2 | 12,1 | 0 s | **nein** |
| 08.10. 10:40 | 8,0 | 9,0 | 10 s | ja (= `2026100806`, `budget.json` 10:49) |
| 08.10. 16:42 | 11,9 | 12,9 | 0 s | **nein** |
| 08.10. 22:39 | 7,7 | 8,7 | 10 s | gebaut, **Publish fehlgeschlagen** (Log nur mit Anmeldung lesbar) |
| 09.10. 04:45 | 9,4 | 10,4 | 0 s | **nein** |

Ursache: Regel F′ rechnet die Frist ab dem **Jobstart** (`FIELD_END_MIN` t2 = 10 min, 20 s Rand, Abbruch unter 30 s). Der t2-Bau
schwankt 5,7…11,9 min, dazu ≈ 1 min MOSMIX-L/-S davor — beginnt der Feldschritt nach ≈ 9,2 min, endet er sofort mit „kein Feld für
diesen Lauf" (Exit 0, `continue-on-error`, Job grün, `budget.json` unverändert). Gebraucht hätte er 6–10 s. Die Aufbewahrung
entfernt ein Feld mit seinem Cube-Lauf ⇒ seit dem 09.10. führt der Index **keine** Stufe t2. Die Planungsgrenze `JOB_MAX_MIN` t2 = 15
wird vom Cube-Bau allein überschritten (12,2…16,9 min Job; V-NP0-14 maß 19,3) — eigener Befund, nicht hier.

**Fix (Producer, wirkt mit dem Push von `main`):** Mindestfenster je Stufe `FIELD_MIN_S_BY_TIER` = {t1 0, t2 45, t3 45} s
(`scripts/point/fieldStore.mjs`): Frist = max(Restzeit bis `FIELD_END_MIN`, Mindestfenster), weiter gedeckelt durch
`FIELD_DEADLINE_S`. Ein langsamer Cube-Bau nimmt dem Feld also nie mehr die ganze Frist; der Job wird um höchstens 45 s länger.
t1 (30–42 s, Regel b′) bleibt an der Frist allein. Ein ausgelassener Versuch steht jetzt in `budget.json` (`skipped: true`).
`FIELD_MIN_S=0` = Verhalten vorher.

**Wächter:** `scripts/point/field-watch.mjs` + `fieldStaleness` (`fieldStore.mjs`, rein): je Stufe die Zahl der Cube-Läufe, die jünger
sind als das jüngste Feld. Mehr als `FIELD_WATCH_MAX_MISSED` = 1 ⇒ veraltet (t1 nach 6 h, t2 nach 12 h, t3 nach 24 h; ein
ausgelassener t1-Lauf nach b′ ist erlaubt). Im Punkt-Job (Vorlage `workflow-point.yml`, Jans Kopie) als letzter Schritt jeder Stufe
NACH dem Publish, ohne `continue-on-error` ⇒ der Job wird rot und GitHub meldet es, mit `::error`-Annotation; in `verify:np0-fields
--live` als C0 gegen den Cube-Index des Daten-Repos.

**Gates:** `verify:np0-fields` 35/38 — B15 (Mindestfenster baut t3 bei aufgebrauchter Restzeit), B16 (Negativkontrolle
`FIELD_MIN_S=0` ⇒ kein Feld, `budget.json` hält den Versuch), B17 (Wächter rein: der Fall vom 09.10. = t2 drei Läufe ohne Feld ⇒
veraltet), B18 (CLI: Exit 1 mit Annotation / Exit 0 / still mit `POINT_FIELDS=0`) grün; rot nur B14 (V-RC-4, jetzt im eigenen `try`,
verdeckt B9…B18 nicht mehr) und **C0 + „C t2" live — das ist der Befund selbst** (t2 Cube `2026100900`, kein Feld), grün nach dem
nächsten t2-Job mit gepushtem `main`. `verify:point-data` **1028/1028** inkl. neuer Prüfung (V-RC-2: Fenster ≤ 60 s, Wächter je Stufen-Job nach
dem Publish, ohne `continue-on-error`, eigene Stufe). Lokal am Klon des Daten-Repos (Stand 08.10. 22:32): t1/t3 in Ordnung, t2 ein Lauf
ohne Feld.

## 11 V-RC-1 — eine Lesart von „nass" (09.10., Jans Auftrag „erst messen, dann eine Definition")

**Regel vorab eingefroren** (`regenchance/vrc1-regel.md`, sha256 `89a077afbc1a…`, 10:46:07Z, vor der ersten Rechnung; das Skript
bricht ab, wenn die Regel danach geändert wurde). A = 1 − pDry (Feld, Chance, Dashboard), B = exceedance(dist, 0,1 mm/h) (Regenbeginn
bis heute). Zeilen `C:\dev\buscosun-hindcast\score\2026-10-02-f8r-b\rows.jsonl.gz` (Ausgabe-Slots 16.09.–01.10., 15 Ausgabetage,
389 DACH-Stationen), Kandidat F8r = buscosun Fusion 8 (Niederschlag = Fusion 9), Stufe t1, Vorlauf 1–24 h, Ereignis Stationsstunde
≥ 0,1 mm. Skript `scripts/fusionfit/vrc1-wet-definition.mjs`, Ergebnis `regenchance/vrc1-ergebnis.json`.

| Modus | Vorlauf | n | Basisrate | mittleres p A / B | Brier A / B | Skill B gegen A | p (BH) | 90-%-Intervall |
|---|---|---|---|---|---|---|---|---|
| S (Punkt = Station) | 1–6 h | 30 261 | 3,4 % | 3,5 / 2,8 % | 0,02295 / 0,02253 | +1,8 % | 0,48 (0,64) | −0,9…+3,8 % |
| S | 7–24 h | 94 647 | 3,7 % | 3,1 / 2,7 % | 0,02361 / 0,02364 | −0,1 % | 0,87 (0,87) | −1,2…+0,8 % |
| L (ohne Station) | 1–6 h | 30 261 | 3,4 % | 4,8 / 4,0 % | 0,02440 / 0,02341 | +4,1 % | 0,14 (0,50) | +1,4…+6,3 % |
| L | 7–24 h | 94 647 | 3,7 % | 5,4 / 4,8 % | 0,02557 / 0,02529 | +1,1 % | 0,25 (0,50) | +0,2…+2,2 % |

**Urteil nach der Regel: GLEICHAUF (B besser 0, A besser 0 von 4) ⇒ eine Definition, 1 − pDry; der Regenbeginn ist umgestellt.**

Ehrlich dazu (berichtet, zählt nicht): B ist in drei Tupeln nominell besser, im Modus L schließt das Bootstrap-Intervall die 0 aus —
der DM-Test über 15 Tage trägt das nicht. Der Unterschied kommt aus den kleinen Wahrscheinlichkeiten (L 7–24 h, Klasse 20–30 %: A
sagt 25 %, es regnet in 17 %). In der Mitte sind **beide** zu vorsichtig (Klasse 50–60 %: A 54 % → beobachtet 63 %, B 55 % → 66 %);
bei p ≥ 0,5 trifft A mehr (POD L 0,33 gegen 0,29), B meldet seltener falsch (FAR 0,35 gegen 0,30), beide rufen viel zu selten „Regen"
aus (Häufigkeit 0,25…0,56). Die Wahl der Schwelle repariert das nicht; das wäre eine gemeinsame Nachkalibrierung (Fusion-8-Kandidat
`precipCal` war am 02.10. gleichauf, V-AX). Länderschichten: nirgends ein signifikanter Unterschied (CH L 1–6 h +7,6 %, p 0,12).

**Umgesetzt:** `fusionPWetOf(forecast, exceedance, x = RB_WET_X_MMH = 0)` (`nowcastEngine.ts`), `rbWetThresholdFrom` + Rückfall
**`?rbwet=0.1`** (`rainWindow.ts`), die Schwelle läuft als `fusionPWetMmH` bis in den Hinweistext („P(Niederschlag) = 1 − pDry wie Karte
und Dashboard"). Folge im Produkt: die Prozente des Regenbeginns liegen im Mittel 13…26 % (relativ) höher; die Schwellen Rand 30 % /
Kern 50 % / trocken < 20 % bleiben gesetzt (V-RB-3). buscosun Fusion unverändert. Gates: `verify:rain-window` **63/63** (H1–H5 neu, mit
Gegenprobe), `verify:regenchance` 44/44, `verify:precip-sums` grün, `verify:fusion-release` 28/28, `verify:regenradar-profile` 34/36
(C1b bekannt, E7 Phasenwache), typecheck 0, Build 255/255, Budget grün (totalJs 1 649,5 / 1 651).
