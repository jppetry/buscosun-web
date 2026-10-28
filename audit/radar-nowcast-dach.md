# Phase NC — Niederschlagsradar: 25 Bilder bis +2 h überall in DACH

> Stand 2026-10-27. Auftrag (Jan, Schnellmodus): „Überall steht das Radar von jetzt bis +2 h in 5-Minuten-Schritten zur Verfügung,
> also 25 Bilder wie beim DWD-RV." Gebietsaufteilung, Zusammenführung, CH-Hochrechnung, AT-Verfeinerung und ehrliche Beschriftung
> wie im Auftrag; Verifikation mit Browser-Check. Kein Plan-Modus; Entscheidungen E-NC-n sind Jans, Befunde V-NC-n.

## §0 Kurzfassung

- **Zwei neue Produkte des Radar-Spiegels** (Vertrag `src/sources/radarNowcastImg.ts`, Arithmetik `radarNowcastExtrap.ts`, Producer
  `scripts/radar-mirror/radar-derive.mjs` Quellen `rzc-nc` und `inca-5m`, Spiegel-Haken `radar-mirror.mjs` `deriveNc`):
  - `radar/img/v1/rzc-nc/<stamp>/` — **Hochrechnung buscosun aus MeteoSwiss-Radar**: die rzc-Analyse des Stempels, 24 × 5 min
    semi-Lagrange verschoben (Zugrichtung = gewichtetes Mittel der Horn–Schunck-Felder der letzten 3–6 Analysen, Faktor 4, α 0,5,
    100 Iterationen); `f005…f120.png` (v1-Byte), `g…png` (Dual mit Log-Ebene, wenn die Analyse eine trägt), `u…png` (255 =
    **unbekannt**: der Rückweg des Pixels beginnt außerhalb des Radargitters — nie „trocken"), `meta.json` mit `motion`
    (km/h, Richtung „aus", Paare, nasse Zellen), `series`, `caveats`, `label`.
  - `radar/img/v1/inca-5m/<stamp>/` — **INCA-Nowcast · auf 5 min verfeinert**: die 12 INCA-Bilder (+15…+180) plus je zwei
    Zwischenbilder, entlang des Horn–Schunck-Felds des Paars verschoben (beide Nachbarn zur Mitte advehiert, Regel wie der
    Shader-Morph, `betweenPlanes`); `meta.json` mit `validAtMs` = Reftime + Lead und `kind: inca | between`. Nichts neu
    hochgerechnet (INCA ist schon eine Hochrechnung).
- **Abtastregel** überall `wet-bilinear-round` (Randregel RS): nass nur bei nassem Anteil ≥ ½, Wert = Mittel der nassen Nachbarn —
  kein erfundener Leichtregen an Kanten; v1- und Log-Ebene teilen eine Maske.
- **Gebietsaufteilung mit Übergangszone** (`src/scalar/radarZones.ts`, E-NC-1 = Jans Regel): RV = DE ∪ AT westlich 14,0° E ∪ CH
  nördlich 46,7° N; INCA = übriges AT; rzc-Hochrechnung = übrige CH. Band ± 0,2° (Länge) bzw. ± 0,135° (Breite) ≈ ± 15 km, lineare
  Gewichte. Die Maske des `RainLayer` ist jetzt ein **Gewicht 0…255** (Alpha-Faktor im Fragment-Shader, 4 Zeilen; 0/1-Masken
  byte-gleich zu vorher). Worker-Op `zone`, `zoneMaskOffMain`.
- **Alles nach Gültigkeitszeit** (`pickCompositeFrames`): AT = das verfeinerte Bild, das der gefragten Zeit am nächsten liegt
  (± 3 min), CH = Analyse zu ihrer Zeit, sonst das Hochrechnungsbild; Wetterkarte (jetzt + h) und Regenradar-Profil (absolute Zeit)
  gleich. Regenradar-Stack (`radarFrames.ts`): AT 25 Schritte ab jetzt mit „jetzt" = nächstgelegene Gültigkeit und Altersangabe des
  Laufs; CH Rückblick + Analyse + 24 Hochrechnungsbilder.
- **Übergang zum Modell** (Punktreihe, `nowcastEngine.ts` `crossoverMin`): Radar allein bis zum Kreuzungspunkt, dann weich über
  30 min zum Modell (RUC hinter buscosun Fusion in DE; buscosun Fusion mit ICON-CH1 in CH). Kreuzungspunkte: DWD-RV 120 min
  (Skill-Horizont des DWD, wie bisher), INCA 120 min und CH-Hochrechnung 60 min **gesetzt** — gemessen ist noch nichts (V-NC-1).
- **Ehrliche Beschriftung**: Statuszeile der Karte, Regenradar-Dock, Zeitachse (`ageNote`), „Methodik & Datenqualität" (Zeitbezug,
  Schwächen, grau = unbekannt), Layer-Katalog, Quellenzeile. Grauer Schleier `precip-rain-hd-ch-unknown` über den unbekannten
  Flächen.
- **Schalter** (Stand 28.10. abends, E-NC-6): Client **an**, `?nc=0` (alias `?chnc=0`) oder `localStorage.radarnc = '0'` = jeder
  Leser byte-gleich zum Stand vor NC; `?ncbase=<url>` (Produktbasis für Prüfläufe, Muster `?rucbase=`); Producer **an**, `RADAR_NC=0`
  = aus (gleich der Kopie im Daten-Repo `6a7d113bd`). Der Spiegel bildet die Produkte, sobald der Web-Klon von `main` den Vertrag
  trägt (Marker `src/sources/radarNowcastImg.ts`) — mit dem Merge `6916d1f0`/Push vom 28.10.

## §1 Bestand vor der Phase

| | DE | AT | CH |
|---|---|---|---|
| Vorhersage | RV 0…+120 min, 25 Bilder | INCA +15…+180 je 15 min, nach **Vorlauf** gezeichnet (Lauf-Reftime ignoriert, bis 30 min Versatz) | **keine** (Analyse bis +30 min, danach leer) |
| „jetzt" | Analyse | +15-min-Bild | Analyse |
| Naht | Besitzmaske je Land (`pickCountry`), harte Kante | ebenso | ebenso |
| Punktreihe | Radar bis 120 min, dann Modell | 15-min-Raster, Anker = Abrufzeit | eine Analyse (± 5 min) |

## §2 Messwerte der Producer (lokal, 27.10. 17:10–17:35 UTC, Daten-Repo `805618d94`…)

| Produkt | Eingabe | Laufzeit | Dateien / Bytes | Befund |
|---|---|---|---|---|
| `rzc-nc` 20261027T1710 | 6 Analysen, 5 Paare | 3,7 s | 73 / 297 KB | 2,1 km/h aus 274°, 399 nasse Zellen; Masse 32 787 → 32 788 (+5) → 26 604 (+120, Rand); unbekannt 0 → 344 px |
| `rzc-nc` …T1730 | 6 / 5 | 4,6 s | 73 / 390 KB | 1,8 km/h aus 266° |
| `inca-5m` 20261027T1700 | 12 Bilder | 3,4 s | 69 / 48 KB | 34 Bilder, 11 Paare; AT fast trocken (55 px), Zwischenbilder = Nachbarn |

Zonengewichte an Testpunkten (`zoneWeights`): Basel/Bern/Chur/Bregenz/Innsbruck/Salzburg/München RV 1,00 · Sion/Lugano/St. Moritz
rzc 1,00 · Linz/Graz/Wien INCA 1,00 · Interlaken RV 0,46 / rzc 0,54 · 14,0° E RV 0,50 / INCA 0,50 · 46,7° N RV 0,50 / rzc 0,50.
Bandpixel auf den echten Gittern: rzc 11 470, INCA 10 331, DE1200 24 346 (Rest 0 oder 255).

## §3 Browser-Check (27.10. 18:35–18:40 MEZ, Dev-Server, `?ncbase=/nc-test` mit lokal erzeugten Produkten)

- Sitten (CH, rzc-Zone): Konsole „CH Hochrechnung → Slot 20261027T1730 · 24 Frames (+5…+120 min) · 1.8 km/h aus 266° (5 Paare)";
  Zeitachse 25 Schritte à 5 min, „18:35 · in 5 min · Vorhersage", „19:30 · in 1 h · Vorhersage"; Zeile „Analyse 18:30 · Zugrichtung
  aus 6 Bildern: 2 km/h aus 266°"; Methodik: Quelle „MeteoSchweiz rzc (RR) · CC BY 4.0 · Hochrechnung buscosun", Skill ~1 h, Zeitbezug,
  Schwächen (drei Sätze), „grau = unbekannt …".
- Graz (AT, INCA-Zone): „AT INCA · 5 min → Lauf 20261027T1715 · 34 Frames"; Zeitachse „18:40 · in 1 min · Vorhersage", Zeile
  „INCA-Lauf 18:15 (vor 24 min) · „jetzt" = Bild gültig 18:40 · Zwischenbilder entlang der Bewegung verschoben — flüssiger, nicht genauer".
- Wetterkarte Niederschlag: beide Produkte geladen (Konsole), RV wie bisher.
- **Nicht prüfbar heute:** DACH war ohne Echo (CH-Regen nur über Frankreich, AT 55 px) — Nähte und grauer Schleier sind numerisch
  (Masken, Unbekannt-Pixel) belegt, nicht im Bild (V-NC-3).
- Befund im Check: ein fehlender Pfad liefert beim Dev-Server eine HTML-Seite mit 200 ⇒ `.json()` warf und zählte als harter
  CDN-Fehler (Latch) — der Leser wertet eine Antwort ohne JSON jetzt als „nicht da" (`metaJson`).

## §4 Prüfläufe

`npm run typecheck` grün · `verify:np0-radar` 40/40 (Aufbewahrungstabelle beider Seiten mit `rzc-nc`/`inca-5m`) ·
`verify:precip-source` 30/30 · `verify:radar-hd` 52/1: **E2 rot** = die Shader-Zeile der Maske (Gewicht statt Discard) ·
`verify:regenradar-profile` 33/3 → nach dem Umzug des Samplers 34/2: **E8 rot** = dieselbe Shader-Änderung (RainLayer), **C1b rot** =
datenabhängig („0 Werte anders": die betroffenen Zellen sind heute trocken; vor der Phase am sauberen HEAD gegenprüfen).

## §5 Entscheidungen und Befunde

- **E-NC-1 (Auftrag):** Zonenregel 14,0° E / 46,7° N, Band ± 15 km — gesetzt nach Jans Wortlaut („etwa 14° E", „Nordschweiz").
- **E-NC-2 (STOPP-Grenze, Jan):** die weiche Naht braucht ein Alpha-Gewicht im Fragment-Shader des `RainLayer` (Maske 0…1 statt
  Discard < ½; 0/1-Masken byte-gleich). Zwei Wächter (radar-hd E2, regenradar-profile E8) melden das. Nein ⇒ Maske wieder binär,
  Nähte hart an den neuen Linien (eine Zeile `mw` zurück).
- **E-NC-3:** die Produkte liegen unter `radar/img/v1/` (Spiegel-Bestand, Zählregel 12 Slots) statt in einem eigenen Pfad.
- **V-NC-1:** Kreuzungspunkte INCA 120 / CH 60 min sind gesetzt — gegen Stationen messen (Hindcast-Route, ≥ 14 Tage Produkte).
- **V-NC-2:** die Reichweite des DWD-Komposits in CH/West-AT ist nicht gemessen; die 14° E / 46,7° N könnten gegen die RV-`nodata`-
  Maske ersetzt werden (Abdeckung aus den Daten statt aus einer Linie).
- **V-NC-3:** Sichtprüfung der Nähte und des grauen Schleiers an einem Regentag (Interlaken, 14° E bei Linz/Steyr).
- **V-NC-4:** das Hintergrundbild der unbekannten Fläche ist ein Schleier über dem Gelände; eine Schraffur wäre lesbarer (CSS/Shader).
- **V-NC-5:** `sourceLabel` der Punktreihe nannte für AT/CH „DWD RADOLAN-RV" (Altfehler, mit behoben).

## §6 Verifikation 28.10.2026 (Jans Auftrag: Zeitschritte, Farben, Georeferenz, „blaue Flecken Südschweiz")

Stand vorher: NC lag im Sammel-Commit `baa47d1a` (28.10. 10:23, Zweig `feat/aw-6.2-virtueller-sensor`, zusammen mit Sea/Road/History),
nicht auf `main`; die Produkte `rzc-nc/`, `inca-5m/` liegen **nicht** im Daten-Repo (`radar/img/v1/` live: 404). Es gab keinen eigenen
NC-Verifier; zwei Wächter rot (`radar-hd` E2 = Shader-Zeile `mw`, E-NC-2; `regenradar-profile` C1b datenabhängig, bekannt).

### 6.1 Die blauen Flecken — Befund

Produktion (`buscosun.com/regenradar/lugano`, 11:05–11:20 MEZ) Layer für Layer isoliert:
- **alle Radar-Layer aus:** die große schwarze Fläche bleibt — sie ist die dunkle Basiskarte (`WEATHER_BASEMAP_STYLE` = OpenFreeMap
  `dark`, seit 23.10.) INNERHALB von DACH, Sand außen. Design, kein Fehler.
- **nur Niederschlag:** eckige, hellblau-stahlblaue 1-km-Echos über Tessin/Graubünden — das ist die rzc-Analyse. Gegenprobe an den
  Daten: Slot `20261028T1005` roh von MeteoSchweiz (`rzc263011005rl.001.h5`: `quantity RATE`, gain 1, offset 0, `nodata` NaN,
  `undetect` 0, max 3,76 mm/h, keine Sonderwerte) ⇒ `precipToU8(raw)` byte-gleich zu `frame.png` des Spiegels (0 Differenzen); 62 945
  nasse Pixel, 58 723 davon EIN Cluster über den Alpen (Stau-Lage), vier Kleincluster ≤ 45 px mit log-Byte ≤ 20 (≈ 0,1 mm/h). Farben
  aus `precipRainRamp`/`precipRainRampLog` (0,1–0,5 hellblau, 0,5–2 stahlblau) — echter Regen, korrekt verortet.
- **nur Schnee:** leuchtend blaue, RUNDE Blobs mit hellem Kern über Wallis, Berner Alpen, Bernina, Mont Blanc (auch über die Maske
  hinaus) — der Layer **Schneedecke** (ICON-D2 `h_snow`, `snowRamp` Weiß→Blau, Deckel 150 cm „Gletscher sättigen"). Hover auf einen
  Blob: „Niederschlag trocken (unter 0,06 mm/h) · Höhe 3 502 m". Im Regenradar-Profil ist Schnee standardmäßig **an** („5 aktiv").
  ⇒ **Das sind die „seltsamen blauen Flecken": Schneedecke auf Gletscherhöhe, keine Radar-Farbe, kein NC-Artefakt.** Nicht geändert
  (Funktionserhalt); Vorschlag V-NC-8.
- Dev-Server (Zweig, NC an, keine Produkte): Südschweiz identisch zur Produktion; Interlaken (46,7° N) zeigt die Übergangszone als
  halbtransparente Überlagerung RV/rzc (E-NC-2-Verhalten).

### 6.2 Zeitschritte, Gültigkeiten, Zonen, Beschriftung

Mit lokal erzeugten Produkten (`radar-derive.mjs` auf den sechs Live-Slots 09:50–10:15 UTC und INCA-Lauf 10:00, `?ncbase=/nc-test`):
CH „CH Hochrechnung → Slot 20261028T1015 · 24 Frames (+5…+120 min)", Zeitachse 25 Schritte, „in 1 h · Vorhersage" zeigt das
Hochrechnungsbild, Altersnotiz „Analyse 11:15 · Zugrichtung aus 6 Bildern"; AT „34 Frames (+15…+180 min, 12 INCA-Bilder)", Graz
„jetzt · Vorhersage · INCA-Lauf 11:00 (vor 25 min) · „jetzt" = Bild gültig 11:25". Mobil 390 × 844 (`headlessShot.mjs`, Belege
`audit/radar-nowcast-dach/2026-10-28-*.png`): Lugano sauber; Graz: die INCA-Notiz wird am rechten Rand abgeschnitten (V-NC-9).
Zonen, Auswahl nach Gültigkeitszeit, Parser, Beschriftungen: `verify:radar-nc` A–E (unten).

### 6.3 Farben und Georeferenz — Befund „nichts weicht ab, per Konstruktion"

- **Eine Farbdefinition:** Komposit und die drei HD-Layer (DE/AT/CH) zeichnen `precipRainRamp` (Log-Ebene `precipRainRampLog`,
  Stützen an denselben mm/h ab 0,5), Schwelle 0,06 mm/h (`precipToU8`/`precipToU8Log`, `RADAR_DISPLAY_MIN_MMH`), Deckkraft 0,85, ein
  Byte-Codec für RV, INCA, rzc, rzc-nc, inca-5m (`vMax = PRECIP_VMAX`, Parser lehnen anderes ab). Die Hochrechnung verschiebt
  v1- und Log-Byte mit EINER Nassmaske (F3: 0 Differenzen über 24 Frames). RUC und ICON-CH1 sind keine Kartenlayer (Minutenverlauf
  bzw. Member von buscosun Fusion); der ICON-D2-Rückfall des Komposits nutzt denselben Byte und dieselbe Rampe. Der Unbekannt-Schleier
  ist ein eigener Layer in Grau (B6). ⇒ keine Abweichung.
- **Georeferenz:** die Produkte liegen auf den Gittern ihrer Quelle (710 × 640 LV95/`somerc` bzw. 701 × 431 Lambert), die Ecken werden
  aus `meta.json` der Analyse/des Laufs übernommen (F5/F7: identisch), die Verschiebung rechnet in nativen Pixeln ohne Reprojektion;
  die Karte warpt mit denselben Meshes (`rzcWarpMesh`, `incaWarpMesh`) und die Zonenmaske tastet die Pixelmitten über dieselbe
  Projektion ab wie die Besitzmaske (D5 auf dem echten rzc-Gitter: 0 Mismatch). ⇒ keine Abweichung.

### 6.4 Abweichungen von der Vorgabe und Fehler — behoben

1. **Schalter standardmäßig an** (Client `RADAR_NC_DEFAULT_ON = true`, Producer `RADAR_NC !== '0'`) — der Auftrag verlangt „im
   Daten-Job standardmäßig aus, im Client mit `?chnc=1`, ohne Schalter byte-gleich". Mit NC an und OHNE Produkte (der Live-Zustand bis
   zum Push) hatte sich das Bild trotzdem geändert: Zonenmaske statt Besitzmaske (Nord-CH zeichnete DWD-RV statt rzc, Band an 46,7° N).
   **Behoben:** Client aus bis `?nc=1`/`?chnc=1`/Store, Producer aus bis `RADAR_NC=1` (E-NC-4). `verify:radar-nc` D7/D8 belegen die
   Byte-Gleichheit ohne Schalter (Maskenwahl, Auswahlregel über den Schieberbereich, Stack und Punkt-Sampler am Flag).
2. **V-NC-7 — die Hochrechnung blieb stehen.** Messung (`audit/radar-nowcast-dach/flow-scale.mjs`, Gauß-Blobs σ 4/8/16 px, wahre
   Verschiebung 1…8 px/Schritt, 4 Bilder): das Horn–Schunck-Feld (Faktor 4, α 0,5, 100 Iterationen) maß die Geschwindigkeit mit
   51–85 % der wahren, und der Schwerpunkt wanderte nach 24 Advektionsschritten nur **+13 … +35 px statt +24 … +192 px** — das lokale
   Feld ist nur dort ≠ 0, wo das Echo gerade liegt; ein Zielpixel vor dem Regen hat keinen Fluss, seine Rückwärts-Trajektorie erreicht
   das Echo nie. Am 27./28.10. unsichtbar (Stau, ≈ 0 km/h). **Behoben (E-NC-5):** `flowFromSeries` misst je Bildpaar EINE Verschiebung
   (`translationBetween`: normierte Kreuzkorrelation der 4×-vergröberten Bilder über ± 6 Grobpixel, Parabel-Subpixel; Paare mit < 12
   nassen Grobzellen tragen nichts) und legt das gewichtete Mittel als konstantes Feld über das ganze Gitter — der Auftrag spricht von
   „der Zugrichtung". Nachmessung: Anteil 0,92–1,00, Schwerpunkt exakt (+48 von +48, +96 von +96). Auf der echten Serie 09:50–10:15 UTC:
   12,8 km/h aus 279° statt 0,2 km/h; Gegenprobe (`series-motion-check.mjs`): beste ganzzahlige Verschiebung der Nassmasken (1, 0) in
   3 von 5 Paaren, Schwerpunkt driftet ostwärts. `method.flow: 'translation'` im Produkt (Parser nimmt beide Wörter). Horn–Schunck
   bleibt für den Karten-Morph und die INCA-Zwischenbilder (Form auf halbem Weg, keine Vorhersage).
3. **Kein eigener Verifier** — jetzt `npm run verify:radar-nc` (`scripts/verify-radar-nc.mjs`): A Schalter/Konstanten, B Schema +
   Farbvertrag, C Arithmetik (Identität, exakte Verschiebung mit Unbekannt-Spalten, keine erfundenen Bytes, Zwischenbilder, Richtung,
   Serienfluss ohne Stillstand), D Zonen + Byte-Gleichheit ohne Schalter, E Auswahl nach Gültigkeit, F echte Daten (`--fixture`,
   sonst live aus dem Daten-Repo; `--derived` prüft Producer-Slots). **40/40** mit den sechs Live-Slots und dem INCA-Lauf 10:00 UTC.

### 6.5 Übrige Prüfläufe 28.10.

`typecheck` grün · `verify:np0-radar` 40/40 · `verify:precip-source` 30/30 · `verify:radar-hd` 52/1 (E2 = Shader-Zeile, E-NC-2 offen)
· `verify:regenradar-profile` 35/1 (C1b datenabhängig; E8 grün, weil der Shader-Diff im Commit liegt — der Wächter vergleicht gegen HEAD).
`npm run build` grün (260/260) · `npm run budget`: eagerJs 110,2 / 111 KB ✓, largestChunk 278,4 / 302 KB ✓, **totalJs 1 941,7 KB
> 1 932 KB ✗** — nicht aus dieser Verifikation (`radarNowcastExtrap.ts` liegt in keinem Client-Chunk, die Client-Änderung ist eine
Zeile Schalter-Grammatik); die Ratsche war durch HB/NC/VS auf dem Zweig schon überschritten (V-HB-1, CLAUDE.md). Anheben = Jans
Notiz (30.09.), nicht `--update`.

### 6.6 Neue Befunde

- **V-NC-6:** Nord-CH (≥ 46,7° N) zeichnet mit NC DWD-RV statt rzc — die Schweizer Radare (Albis, Dole, Plaine Morte) sehen dort besser
  als die deutschen aus 100–150 km; die Zonenregel folgt Jans Wortlaut, die Qualitätsfrage ist offen (zusammen mit V-NC-2 messen).
- **V-NC-7:** s. 6.4 (2), behoben; die Nachmessung an Regentagen mit Zug (Schwerpunkt der Nassmaske gegen die Hochrechnung) steht aus.
- **V-NC-8:** Schneedecke im Regenradar-Profil: gleiche Farbfamilie wie leichter Regen, standardmäßig an ⇒ „blaue Flecken". Vorschlag:
  im Profil `radar` aus oder eigene Palette (Jans Wahl, Funktionserhalt).
- **V-NC-9:** Mobil: die INCA-Altersnotiz (`ageNote`, ≈ 110 Zeichen) wird in `.rdr-tl-status` abgeschnitten; Umbruch oder Kurzform.
- **V-NC-10:** `ageNote` nennt bei 0,2 km/h „0 km/h aus 289°" — unter 1 km/h sollte die Richtung entfallen (`fromDeg`-Schwelle 0,05).
- **V-NC-11:** INCA-Zwischenbilder nutzen weiter das Horn–Schunck-Feld; bei 15-min-Paaren (Verschiebungen bis 10 km) ist die
  Zwischenform damit eher Mischung als Verschiebung — „flüssiger, nicht genauer" bleibt wahr, die Korrelations-Verschiebung wäre auch
  hier die ehrlichere Basis.

### 6.7 Entscheidungen

- **E-NC-4 (umgesetzt nach Jans Auftrag, mittags):** Voreinstellung aus, Client `?nc=1`/`?chnc=1`, Producer `RADAR_NC=1`.
- **E-NC-5 (umgesetzt, Bestätigung erbeten):** Zugrichtung der CH-Hochrechnung = Korrelations-Verschiebung je Paar statt Horn–Schunck.
- **E-NC-6 (Jan 28.10. abends, „setze alles aktiv und pushe"):** hebt E-NC-4 auf — Client und Producer **an**, `?nc=0` bzw.
  `RADAR_NC=0` sind die benannten Rückwege (`verify:radar-nc` A1). Merge des Zweigs nach `main` (`6916d1f0`) + Push durch Claude
  auf Jans Wort; die Daten-Repo-Kopie des Spiegelskripts bleibt (sie ist schon „an").
