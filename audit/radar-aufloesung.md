# Phase RA — Auflösung des Niederschlagsradars auf der ganzen DACH-Karte, 250 m nur auf Wunsch

> Auftrag Jan 13.10.2026 (Punkte 5–7 des Kickoffs „Radar: Phase SE abschließen und Auflösung auf der ganzen DACH-Karte"):
> **1 km überall in DACH** (DE RV, AT INCA, CH rzc auf ihren nativen Gittern) — erst die Diagnose, wo das heute NICHT gilt
> (Zeitachse, Nähte, AT-Rückblick, Komposit `?hd=0`), Lücken schließen oder in der Statuszeile benennen, nichts hochrechnen;
> **250 m nur auf Wunsch** (Schalter „250 m" im Layer-Panel, Voreinstellung aus, Zustand in `localStorage` und im Teilen-Link,
> Verfügbarkeit dezent gezeigt, Vorhersage sichtbar 1 km, AT/CH ohne Schalter); **Darstellungen verifizieren** (Bildmatrix).
> Vorgänger: HD (`radar-hochaufloesung.md`), R250 (`radar-250m.md`), RS/RG/SE (`radar-randsaum.md`, `radar-regenschwelle.md`,
> `radar-stoerecho.md`). Bilder und Werkzeuge in `audit/radar-aufloesung/`. Nicht Teil: buscosun Fusion, Regenbeginn, Summen
> (V-SE-2), Virga (V-SE-11).

## §0 Kurzfassung für Jan

- **1 km gilt heute fast überall — die Lücken lagen auf der Zeitachse, nicht im Raum.** Alle drei Landesradare werden seit
  Phase HD auf ihren nativen 1-km-Gittern gezeichnet (DE 1100 × 1200, AT 701 × 431, CH 710 × 640, Besitz-Maske je Pixelmitte).
  Was NICHT galt (§2): (a) der **Rückblick** (`/regenradar`) zeichnete DE aus dem v1-Byte (lineare Rampe, jedes Echo, nicht die
  Log-Ebene mit Schwelle und Störecho-Filter) — „gestern 19:00" sah anders aus als „jetzt" bei derselben Lage; (b) der
  **CH-Rückblick** war beim Öffnen leer und wuchs nur über die Sitzung (kein Archiv-Seed wie DE); (c) der **AT-Rückblick**
  gibt es nicht (INCA hat keine Analyse) und **CH hat keine Vorhersage** (rzc = nur Messung) — beides war nirgends gesagt;
  (d) `?hd=0` (Komposit 600 × 512, 2,2 × 1,3–1,5 km) nannte sich nicht. Nähte und Ränder: kein Loch, keine Doppelung gefunden
  (§7, Bilder an DE/AT, DE/CH, AT/CH/LI).
- **Geschlossen:** (a) der Spiegel legt die Dual-Analyse `g000.png` in den Rückblick-Slot, der Client liest sie (V-SE-3;
  auch aus `rv-past`, 115 min statt 55); (b) CH seedet seinen Rückblick aus den 24 rzc-Slots des Spiegels (V-RA-3);
  (c)/(d) die Statuszeile sagt es: „AT INCA (ab +15 min, kein Rückblick)", „CH rzc (nur Messung)", „Komposit 600 × 512
  (≈ 2 km, kein 1-km-Gitter)" mit `?hd=0`. Nichts wird hochgerechnet.
- **250 m nur auf Wunsch (§6):** Voreinstellung AUS (`RADAR_HD250_DEFAULT_ON = false`). Schalter „1 km | 250 m" unter der
  Niederschlag-Zeile im Layer-Panel der Wetterkarte und im Dock/der Layer-Tafel des Regenradars — nur für DE-Orte. Zustand
  in `localStorage.radarhd250` und im Teilen-Link (`hd250=1` nur, wenn an). Schalter aus: **keine Kachel wird geholt**; nur
  die Meta des gezeigten Analyse-Slots (`hd250.json`, wenige KB) wird in den Kachel-Zooms geprüft, damit die Karte ehrlich
  „250 m verfügbar" sagen kann (E-RA-2 — Jans Entscheidung, ob auch das wegfällt). Schalter an: wie R250, und beim Abspielen
  in die Vorhersage sagt die Statuszeile „Vorhersage: 1 km"; der Hinweis „250-m-Gitter · 250 m radial · 1° Azimut" steht
  neben dem Schalter, wenn die Kacheln zu sehen sind.
- **Störecho-Filter (Phase SE):** committet (`24ac8d2`), im Daten-Repo eingeschaltet (`a019b6954`, E-SE-1), Statuszeile und
  Layer-Karte nennen „Echos ohne Niederschlag ausgeblendet", sobald der Slot `meta.dual.clutter.cells > 0` trägt (E-SE-3);
  Stand im Betrieb s. `radar-stoerecho.md` §8.
- **Gates (§7):** s. Tabelle — Verifier, typecheck, Build, Budget, Bildmatrix, Pixel-Diff `?hd250=0`.

## §1 Bestand vor dieser Phase (13.10.2026, `main` `24ac8d2`)

| Ebene | DE | AT | CH |
|---|---|---|---|
| Gitter, Zeichnung | RV 1100 × 1200 à 1 km, `RainLayer` `precip-rain-hd-de`, Besitz-Maske | INCA 701 × 431, `precip-rain-hd-at` | rzc 710 × 640, `precip-rain-hd-ch` |
| „jetzt" | Analyse (Lead 0) | nächster Frame = **+15 min** (INCA hat keine Analyse) | Analyse |
| Vorhersage | +5 … +120 min (25 Frames, 1 km) | +15 … +180 min (15-min-Schritte, 1 km) | **keine** (`RZC_MAX_H = 0,5`: die Analyse gilt bis +30 min, danach nichts) |
| Rückblick (Profil `/regenradar`) | Sitzungscache + Archiv-Seed 9 Analysen (`rv/<ts>/f000.png`, ≤ 55 min; darüber Tar) — **nur v1-Byte** | **keiner** (`radarProfileComposite`: `inca: past ? null : …`) | nur Sitzungscache (wächst alle 5 min; beim Öffnen leer) |
| 250 m | `rv-past/<stamp>/h??.png`, Voreinstellung an ab Zoom 9, nur Analysen | — | — |
| `?hd=0` | lat/lon-Komposit 600 × 512 (2,22 km N–S × 1,26–1,50 km O–W), Status ohne Hinweis | ebenso | ebenso |

## §2 Diagnose RA-0 — wo 1 km heute NICHT gilt

Gelesen am Code (`precipComposite.ts` `pickCompositeFrames`, `mapProfile.ts` `radarProfileComposite`, `radolan.ts`
`fetchRvAnalysisSequence`, `radarFrames.ts`, `MapView.tsx` `syncHd`) und an der Bildmatrix (§7):

1. **Zeitachse DE, Rückblick:** die Analysen des Rückblicks kamen als `RvAnalysisFrame { values }` (Kanal 1 = v1-Byte,
   0,12-mm/h-Stufen, jedes Echo) — der HD-DE-Layer zeichnet sie mit der linearen Rampe, „jetzt" dagegen aus der Log-Ebene
   (`values2`: nativ ab 0,06 mm/h, feine Stufen 0,06 … 0,5, seit SE ohne Störecho). Beim Rückwärts-Abspielen wechselte das
   Bild die Sprache (V-SE-3). Gitter blieb 1 km — die Ebene war die falsche.
2. **Zeitachse DE, Rückblick-Tiefe:** `rvImgEligible` erlaubt den Bild-Weg nur 55 min; der Seed holt 9 Frames (45 min) —
   die 24 Rückblick-Slots des Spiegels (`rv-past`, 115 min) las der Client nicht; ältere Stempel gingen über den 1,4-MB-Tar.
3. **Zeitachse AT:** kein Rückblick (INCA ohne Analyse, Entscheidung aus Phase RR — ein Nachbar zeigt für eine frühere Zeit
   nie sein aktuelles Bild) und „jetzt" = +15 min. Beides richtig, aber unbenannt.
4. **Zeitachse CH:** keine Vorhersage (rzc ist eine Messung; die Analyse steht bis +30 min, danach ist CH leer); der
   Rückblick kam nur aus dem Sitzungscache — beim Öffnen leer, obwohl der Spiegel 24 rzc-Slots (2 h, mit `g000.png`) hält.
5. **Nähte und Ränder:** Besitz-Maske je Gitter (Pixelmitte → `pickCountry`, verify:radar-hd B2 = 0 Pixel anders). An einer
   Grenze trägt jeder Punkt der Karte das Pixel des Gitters, dessen Pixelmitte in seinem Land liegt; die Bilder bei Zoom 10/12
   (Salzburg DE/AT, Basel DE/CH/FR, Vaduz AT/CH/LI) zeigen keine Sandlücke und keine Doppelzeichnung (§7). Liechtenstein
   fällt nach der Box-Regel (`pickCountryByBox`) an ein Nachbargitter (INCA oder rzc, beide decken LI) — kein Loch; welches,
   steht in V-RA-5.
6. **Komposit `?hd=0`:** 600 × 512 auf lat/lon = 2,2 × 1,3–1,5 km, ein Radarpixel je Zelle (HD-0: 30 % der Pixel) — der
   benannte Rückfall von E-HD-2, aber die Statuszeile sagte nur „DACH-Komposit". Nicht hochrechnen, benennen.
7. **250 m:** gezeichnet ab Zoom 9 von selbst (E-R250-1), nur Analysen; beim Abspielen in die Vorhersage sprang die Schärfe
   ohne Wort (V-R250-3).

## §3 Entscheidungen

- **E-RA-1 (Auftrag):** 1-km-Lücken schließen (1, 2, 4) oder benennen (3, 4, 6); 250 m aus, Schalter DE; nichts hochrechnen.
- **E-RA-2 (Jans Entscheidung, Empfehlung: so lassen):** Mit Schalter AUS holt der Client **keine Kachel**, prüft aber in den
  Kachel-Zooms (≥ 9) die Meta des gezeigten Analyse-Slots (`hd250.json`, 1–3 KB, eine Anfrage je Slot), damit „250 m
  verfügbar" ehrlich ist (Slots vor dem ersten Kachel-Lauf und gescheiterte Derives haben keine). „0 hd250-Abrufe" im
  Wortsinn hieße: kein Hinweis, nur der Schalter. Rückweg ohne Code: den Hinweis ignorieren; mit Code: `probe` in
  `syncHd250` entfernen (eine Zeile).
- **E-RA-3 (so gebaut):** der Schalter sitzt im Layer-Panel unter der Niederschlag-Zeile (Wetterkarte: `mdk-subseg` wie der
  Schnee-Modus, Desktop und mobil „Detail"; Regenradar: Dock und mobile Layer-Tafel), nur wenn der Ort in DE liegt.

## §4 Umsetzung — Rückblick auf derselben Ebene wie „jetzt" (V-SE-3, V-RA-3)

| Datei | Änderung |
|---|---|
| `scripts/radar-mirror/radar-mirror.mjs` (Vorlage) + Daten-Repo `scripts/radar-mirror.mjs` (`9b35c098d`) | `rvPastCopy` kopiert neben `f000.png` die Dual-Analyse `g000.png` byte-gleich in `rv-past/<stamp>/` (fehlt sie, bleibt der Slot wie bisher). `verify:np0-radar` C3b: genau die Slots mit `g000` tragen sie, Blob-gleich (40/40) |
| `src/sources/radolan.ts` | `RvAnalysisFrame.values2?`; `fetchRvAnalysisFromImg` liest mit dem Dual-Schalter `g000.png` (erst `rv/<ts>/`, dann `rv-past/<ts>/`), bei 404 `f000.png`, sonst wie bisher; `fetchRvAnalysisSequence` nimmt den Bild-Weg auch im Rückblick-Fenster (115 min) |
| `src/radar/radarFrames.ts`, `src/scalar/precipComposite.ts`, `src/nowcast/NowcastRadarMap.tsx` | `values2` wandert durch `RadarFrame`/`PastEntry`/`RvPastFrame`; die Analyse des laufenden Laufs bleibt mit Log-Ebene im Sitzungscache |
| `src/sources/meteoSwissRadar.ts`, `radarFrames.ts`, `NowcastRadarMap.tsx` | `fetchRzcAnalysisSequence` (24 rzc-Slots, nur Bild-Weg), `seedChPastArchive` wie der DE-Seed, beim ersten Griff in die Vergangenheit; `loadCh` trägt `values2` |
| `src/MapView.tsx` | Statuszeile: `AT INCA (ab +15 min, kein Rückblick)`, `CH rzc (nur Messung)`, mit `?hd=0` `Komposit 600 × 512 (≈ 2 km, kein 1-km-Gitter)` |

Ohne Schalter byte-gleich: der Spiegel kopiert mit `RADAR_CLUTTER=0` dieselbe `g000.png`, die er ohnehin in `rv/` schreibt;
im Client zeichnet `syncHd` eine Analyse mit `values2` genauso wie „jetzt" (dieselbe Funktion `plane()`).

## §5 Umsetzung — E-SE-3 (Statuszeile und Layer-Karte nennen den Filter)

`RvNowcast.clutter` (aus `meta.dual.clutter`, nur beim Lesen der Dual-Frames) → `setCompositeStatus`: „· Echos ohne
Niederschlag ausgeblendet" hinter „ab 0,06 mm/h", wenn `cells > 0`; `LayerInfoPanel` bekommt `note` — die Niederschlag-Karte
sagt, was der Filter tut und was er nicht anfasst (Regenbeginn, buscosun Fusion rechnen mit dem amtlichen Komposit). Ein Slot
ohne das Feld (Filter aus, v1-Frames, `?hd=0`) zeigt nichts.

## §6 Umsetzung — 250 m nur auf Wunsch

| Datei | Änderung |
|---|---|
| `src/scalar/radarHd250.ts` | `RADAR_HD250_DEFAULT_ON = false`; `hd250SearchWith` (Teilen-Link: `hd250=1` nur wenn an, andere Schlüssel byte-gleich, keine Umkodierung); `setRadarHd250Pref` (Store + `replaceState` + Ereignis), `onRadarHd250Pref`; Notiz-Bus `publishRadarHd250Note`/`onRadarHd250Note` (`tiles` / `loading` / `forecast` / `none` / `avail`), Wortlaut `radarHd250NoteText` |
| `src/scalar/radarHd250Store.ts` | `probe(stamp)`: nur die Meta, nie eine Kachel |
| `src/components/Hd250Switch.tsx` (neu) | „1 km | 250 m" mit Notiz; Hooks `useRadarHd250Pref`, `useRadarHd250Note` |
| `src/MapView.tsx` | Schalter als State (Ereignis ⇒ ohne Reload), 16 Kachel-Ebenen entstehen mit HD (ohne Frame zeichnen sie nichts), `syncHd250`: Schalter aus ⇒ Kacheln verstecken + Meta-Probe (`avail`), an ⇒ wie R250 + Notiz (`forecast` = Vorhersage-Frame, `none`, `loading`, `tiles`); Statuszeile „DE 250 m (Standortradare, ab Zoom 9) · ‹Notiz›" bzw. „250 m verfügbar (DE)"; `hd250Seg` im Dock (Desktop, mobil Detail) für DE |
| `src/nowcast/NowcastDeck.tsx` | Dock (`country`-Prop) und mobile Layer-Tafel: der Schalter neben „Niederschlag", nur DE |
| `src/MapView.css` | `.layer-info-note`, `.hd250-note` |
| `scripts/verify-radar-250m.mjs` | A1 Voreinstellung aus, A1b `hd250SearchWith`, A1c Notiz-Wortlaut und Headless-No-ops |

Rückwege: `?hd250=0` (hart aus, schlägt Store), `?hd250=1`; `RADAR_HD250_DEFAULT_ON = true` = das Verhalten von R250.

## §7 Gates (13.10.2026)

| Gate | Beleg | Ergebnis |
|---|---|---|
| G1 Verifier | `verify:radar-250m` 23/23 (2 ⊘ ohne `RADAR_250_RAW`), `radar-hd` 53/53, `np0-radar` 40/40 (C3b neu), `regenradar-profile` 24/24, `radar-fallback`, `precip-source`, `radar-clutter` 39/39, `radar-threshold` 28/28, `fusion-release`, `layer-geometry` | grün |
| G2 typecheck / Build / Budget | typecheck 0; Build 2 067 Module; `npm run budget`: eagerJs 109,9 / 110, largestChunk 278,4 / 302, totalJs **1 770,6 / 1 772** (Arbeitsbaum mit RA/LM/WL anderer Sitzungen) | grün |
| G3 Bildmatrix | `scripts/radar-aufloesung-shots.mjs` → `audit/radar-aufloesung/shots/` + `report.jsonl` (s. §7.1) | s. §7.1 |
| G4 `?hd250=0` pixelgleich | `regenradar-wk-pixeldiff.mjs` Arbeitsbaum (Voreinstellung aus) ↔ HEAD `24ac8d2` mit `?hd250=0`, `audit/radar-aufloesung/pixeldiff-hd250-off/` | s. §7.2 |
| G5 Spiegel live | erster Spiegel-Job nach `a019b6954`/`9b35c098d` | s. §7.3 |

### §7.1 Bildmatrix (G3)

`scripts/radar-aufloesung-shots.mjs` (CDP, chrome-headless-shell, Dev-Server `vite --port 5241`): je Szene EIN Seitenaufruf,
darin Zoom 6 / 8 / 10 / 12 und die Zeiten Rückblick (−30 min) / jetzt / +60 min über die Timeline-Knöpfe („Ein Frame zurück/vor",
„Jetzt" = `.rdr-tl-now`; der Rückblick-Seed kommt erst nach dem ersten Schritt in die Vergangenheit). Desktop 1440 × 900 und
Telefon 390 × 844 (DPR 3, `mobile`). Orte: Gießen (DE, Störecho-Fleck), Salzburg (AT, Grenze DE/AT), Basel (CH, Dreiländereck
FR/DE/CH), Vaduz (LI). 250 m aus/an über `?hd250=0|1`; der Filter aus/an über die zwei lokal abgeleiteten SE-Slots (22:35 UTC
Zugnacht, 11.10. 10:05 Regen; `derive-slots.mjs`: je `rv/` + `rv-past/` mit `RADAR_CLUTTER` leer/`1`), die per
`Fetch`-Interception unter JEDEM Stempel ausgeliefert werden, den die Seite verlangt (Meta umgestempelt). **152 Bilder** in
`shots/`, je Bild eine Zeile in `report.jsonl` (Zoom, Slider-Index, Status, Kachel-Ebenen, DE-1-km-Ebene, 250-m-Abrufe,
Konsole); 29 Szenen mussten nach einem Ausfall des Basemap-Stils (`tiles.openfreemap.org/styles/dark` „Failed to fetch" —
ohne Stil keine Ebenen) und zwei Läufer-Fehlern (Zählen statt „Jetzt"-Knopf; Timeline-Seed) wiederholt werden; die jüngste
Zeile je Bild zählt. Im Repo liegen 33 ausgewählte Bilder (`shots/`, 12 MB mit den Diff-Bildern); der volle Satz (152 Bilder,
52 MB) und die `head`/`cur`-Bilder des Pixel-Diffs liegen außerhalb unter `C:\dev\buscosun-radar-truth\ra-shots\`.

| Prüfpunkt | Beleg | Ergebnis |
|---|---|---|
| 1-km-Zellgröße passt zum Zoom | DE/AT/CH-Ebenen tragen ihre nativen Texturen (1100 × 1200 / 701 × 431 / 710 × 640) in jeder Szene; bei z10 ≈ 5 px, z12 ≈ 20 px je Zelle (Bilder `*-now-z10/z12.png`) | ✓ |
| Grenzen: keine Lücke, keine Doppelung | `at-*-now-z10/z12` (Salzburg: Bayern links, INCA rechts, Besitzgrenze als Stufe, kein Sand), `ch-*-now-z10` (Basel: FR = Sand, DE/CH ohne Naht), `li-*-now-z10` (Vaduz: Bild aus dem Nachbargitter, kein Loch) | ✓ (V-RA-5: welches Gitter LI trägt, sagt die Karte nicht) |
| 250 m aus = pixelgleich zu `?hd250=0` | §7.2; in allen Szenen mit Schalter aus **0 Kachel-Abrufe** (`hd250Tiles` = 0), nur Meta-Proben (bis 13 je Szene beim Abspielen über 9 Rückblick-Frames, V-RA-7) | ✓ |
| 250 m an: Kacheln, Versatz, Blockmittel | `de-live-*-hd250-1`: Rückblick und jetzt bei z10/z12 **1 Kachel sichtbar, DE-1-km-Ebene auf 0**; +60 min 0 Kacheln, 1 km (Note „Vorhersage: 1 km"); Blockmittel = RV und Versatz ≤ 125 m sind die Verifier-Gates E/F von R250 (`verify:radar-250m` mit `RADAR_250_RAW`, unverändert) — hier nur das Bild (`de-live-desktop-hd250-1-now-z12.png`: 4 × 4-Struktur in jedem 1-km-Block, keine Kante versetzt) | ✓ |
| Verfügbarkeitsanzeige = vorhandene Kacheln | Schalter aus bei z10/z12 über Gießen: Note „250 m verfügbar" genau dann, wenn `hd250.json` des Slots eine Kachel in der Ansicht listet (Live-Slot: ja; lokaler 22:35-Slot bei z10: Kacheln trocken ⇒ an, aber nichts zu zeichnen) | ✓ |
| Filter an: Störecho weg, Regen unverändert | `de-local-2610122235-{off,on}-desktop-hd250-0-now-z8.png`: der Fleck westlich von Gießen (1 890 Zellen laut Derive) ist mit Filter weg, der radiale Reststreifen bleibt (V-SE-1); `de-local-2610111005-{off,on}-*`: Regenbild gleich bis auf 807 Zellen am Rand (Derive-Log), im Bild nicht unterscheidbar | ✓ |
| Konsole sauber | je Szene `consoleErrors` = 0 (nach der Wiederholung); die zwei Warnungen `Image "circle-11"/"wood-pattern" could not be loaded` sind der Basemap-Stil (vor RA) | ✓ |
| Long Tasks beim Umschalten | headless nicht messbar (V-RA-6); Umschalten Desktop z10: Kachel-Abrufe 0 → 1, URL `…&hd250=1`, Store `1`, Note „250-m-Gitter · 250 m radial · 1° Azimut", zurück: 0 Kacheln, DE 0,85, Store `0`, Query ohne `hd250` | — (Real-Device) |
| Touch-Targets | Telefon, Layer-Tafel: Schalter 354 × 56 px, Knöpfe **169 × 44 px** (`*-layersheet.png`; vor der CSS-Regel 41 px) | ✓ |
| Schalter nur DE | `hasSwitch`: Gießen ja, Salzburg/Basel/Vaduz nein (Desktop); Telefon in der Layer-Tafel (Gießen) | ✓ |
| Wetterkarte | `wk-de-desktop-now-z8/z10.png`: Statuszeile „… · 1-km-Gitter (HD) · ab 0,06 mm/h · Echos ohne Niederschlag ausgeblendet", Layer-Karte mit der Zeile zum Filter, Schalter unter „Niederschlag"; bei z10 „250 m verfügbar (DE)"; Telefon: Schalter nur im Modus „Detail" (nicht geschossen) | ✓ |

**Selbstverifikation:** (1) Funktionserhalt — jede Ebene und jeder Schalter wie vor RA, dazu der neue Schalter; `?hd250=1` =
R250-Verhalten; (2) Desktop ohne Schalter pixelgleich bis auf Statustext und Ladezeit (§7.2); (3) Touch-Targets 44 px (Tabelle);
(4) Konsole 0 Fehler; (5) Long Tasks headless nicht messbar — offen wie V-R250/V-HD-9.

### §7.2 Pixel-Diff `?hd250=0` (G4)

**Gegen HEAD nicht messbar:** ein Produktionsbuild von `24ac8d2` (Worktree) unterscheidet sich vom Arbeitsbaum um die
uncommitteten Phasen anderer Sitzungen (LM-Ländermaske `DACH.geojson`, RA-Deck, LB-1-Karten) — 41–45 % der Pixel
(`pixeldiff-hd250-off/` erster Lauf, HEAD-Seite mit dunklem Basemap-Stil und Modell-Chip). Deshalb **derselbe Build**
(Arbeitsbaum, Voreinstellung aus) gegen sich selbst mit `?hd250=0` (`regenradar-wk-pixeldiff.mjs --head=5214 --cur=5214
--curQuery=hd250=0`, zwei Läufe):

| Szenario | Lauf 1 | Lauf 2 |
|---|---|---|
| `rr-ort-mobile` (`/regenradar/muenchen`, 1170 × 2532) | **0 px** | — |
| `rr-ort-desktop` | 32 px (0,0025 %, Uhr) | 40 px (0,0031 %, Uhr) |
| `wk-niederschlag-live-mobile` | 1 894 px (0,06 %) | — |
| `wk-niederschlag-live-desktop` | 35 307 px (2,7 %) | 21 291 px (1,6 %) |

Die Wetterkarte-Desktop-Abweichung liegt ausschließlich über Österreich und den Alpen (`*.diff.png`): die INCA-Ebene und die
Schneelinie waren auf der Seite mit Query nach 40 s noch nicht da. Sonde (`q-probe.mjs`, Dev-Server, beide Seiten im selben
Moment): nach 40 s `inca: false`, `precip-rain-hd-at` Deckkraft 0 auf der Query-Seite, `true`/0,85 auf der anderen; **nach 75 s
beide Seiten gleich** (rv/inca/rzc da, DE/AT/CH-Ebenen 0,85 mit 1100 × 1200 / 701 × 431 / 710 × 640). Das ist die Ladereihenfolge
(eigenes Radar zuerst, INCA 1 MB zuletzt, Phase PF M10) und das 40-s-Fenster des Labors (V-HD-8), kein Schalterpfad: mit
Schalter aus und mit `?hd250=0` läuft in `MapView` derselbe Zweig (`hd250On = false`), die Kachel-Ebenen bekommen nie einen
Frame. Der Query-Schlüssel überlebt das URL-State-Rewriting (`?lat=…&lon=…&z=…&hd250=0`) — Teilen-Link trägt ihn.

### §7.3 Spiegel (G5, erster Job nach den Pushes)

Job `38442817587`, gestartet 13.10. 17:58:16 UTC (der Vorgänger `38395293383` lief seit 12:10 UTC mit der alten Umgebung bis
≈ 17:56). Gelesen um 19:48 UTC vom `raw.githubusercontent`-Weg, Slot **2610131930**:

- `rv/2610131930/meta.json` → `dual: { native: true, displayMin: 0.06, clutter: { cells: 733, wet: 90038, sites: 17,
  missing: [], rule: { rhoMax: 0.8, zCapDbz: 15, kernel: 3, fill: true, rhoMaxRich: 0.85 }, file: "clutter.png", bytes: 2552 } }`
  — **der Filter läuft** (E-SE-1), mit der eingefrorenen Regel R85 ohne Nachbarschaftsstimme; `clutter.png` liegt im Slot (2 552 B).
- `rv-past/2610131930/g000.png` vorhanden, **byte-gleich** zu `rv/2610131930/g000.png` (149 689 B, `cmp`) — V-SE-3 im Betrieb.
- `rv-past/2610131930/hd250.json` → `blocks: { wet: 89305, structured: 81025, flat: 8280, belowMin: 49469, clutter: 733 }`,
  15 Kacheln, 17 Standorte — die 250-m-Kacheln lassen dieselben 733 Blöcke trocken.
- `status.json`: `errors: []`; die jüngsten `rv`-Zeilen (19:40 UTC: Download 2,2 s, Derive 4,6 s, `hd250` 1,0 s, 15 Kacheln,
  17/17 Standorte) ohne Fehlerfeld. Die einzigen `error`-Einträge sind drei `HTTP 404` des MTG-Blitzprodukts (EUMETSAT,
  `lightning-mtg`, Phase NP-0) — nicht Teil dieser Phase. Die Derive-Zeit je RV-Slot (4,6 s inkl. Filter) steht nur als Summe
  im Status; die Zeile `clutter: … in N ms` des Filters selbst liegt im Job-Log des Daten-Repos (Jan, §70).

## §8 Befunde und Entscheidungen

- **V-RA-1** AT „jetzt" ist der +15-min-Frame (INCA ohne Analyse). Benannt in der Statuszeile; eine echte AT-Analyse gäbe es
  nur aus dem INCA-Analysefeld (GeoSphere `inca-v1-1h-1km`? — 1 h) oder aus den österreichischen Standortradaren (nicht offen).
- **V-RA-2** CH ohne Vorhersage: rzc ist Messung; ein CH-Nowcast müsste aus dem Fluss der rzc-Analysen extrapoliert werden
  (Interpolation — nicht gebaut, E-RA-1). Benannt.
- **V-RA-3 (behoben)** CH-Rückblick leer beim Öffnen — Seed aus den 24 rzc-Slots des Spiegels.
- **V-RA-4** `?hd=0` ist kein 1-km-Gitter (2,2 × 1,3–1,5 km); seit E-HD-2 nur Rückfall. Benannt; ein Rückbau wäre Jans Entscheidung.
- **V-RA-5** Liechtenstein: `pickCountry` kennt LI nicht (Box-Regel) — das Radarbild über LI stammt aus dem Nachbargitter mit
  der tieferen Box-Lage; sichtbar ohne Loch (Phase LM zeigt LI seit 13.10.). Welche Quelle, sagt die Statuszeile nicht.
- **V-RA-6** Long Tasks beim Umschalten sind headless nicht messbar (CLAUDE.md); der Umschalter setzt 16 Ebenen auf
  Deckkraft und lädt ≤ 4 Kacheln parallel (Worker-Decode) — Real-Device offen wie V-R250 (Jans Gate).
- **V-RA-7** Die Meta-Probe mit Schalter aus (E-RA-2) ist eine Anfrage je Analyse-Slot in den Kachel-Zooms; beim Abspielen
  über 9 Rückblick-Frames bis zu 9 kleine JSON-Abrufe.
- **V-RA-8** Der Rückblick des Profils kennt nur die Vergangenheit des EIGENEN Landes: `radarPast` kommt aus dem Radar-Stack
  des Orts (`NowcastRadarMap`: DE-Ort ⇒ `rv`-Analysen, CH-Ort ⇒ `rzc`-Analysen, nie beides). An einem CH-Ort ist die DE-Seite
  im Rückblick leer (Basel: Lörrach/Rheinfelden ohne Bild für −30 min), an einem DE-Ort die CH-Seite — „jetzt" und die
  Vorhersage zeigen beide. Am 13.10. abends war es überall trocken, im Bild nicht sichtbar (`ch-desktop-past-z10.png`),
  aus dem Code sicher. Mehrwert: 1 km auch im Rückblick über die Grenze. Skizze: beide Seeds (`seedDePastArchive`,
  `seedChPastArchive`) unabhängig vom Ort laden und `radarPast` aus beiden Caches füllen (≈ 9 × 200 KB + 9 × 15 KB), AT bleibt
  ohne (INCA). Eigener Schritt, weil `radarPast` den Frame-Speicher von `MapView` leert (Re-Render-Kette prüfen).
- **V-RA-9** Der Basemap-Stil (`tiles.openfreemap.org/styles/dark`) fiel während der Bildmatrix für ≈ 1 h aus („Failed to
  fetch"); ohne Stil entstehen in MapLibre keine Ebenen — die Karte bleibt leer, ohne Hinweis. Mehrwert: ein Satz „Karte lädt
  nicht" statt einer leeren Fläche. Skizze: `map.on('error')` auf den Stil-Fehler hören und die Statuszeile füllen; Ausweich-Stil
  (Positron) wäre eine Designfrage (D-27).
- **V-SE-12** `src/components/LayerInfoPanel.tsx` trägt uncommitted (LB-1/RA einer anderen Sitzung) in 20 Einträgen `desc` und
  `source` auf EINER Zeile — ein verlorener Zeilenumbruch beim Bearbeiten (die `\n`-Falle der Werkzeuge, CLAUDE.md). Gültig,
  aber unleserlich; vor dem Commit jener Phase geradeziehen. Die `note`-Zeilen dieser Phase sind davon getrennt committet.
