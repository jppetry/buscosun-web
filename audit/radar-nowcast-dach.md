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
- **Schalter**: `?nc=0` (= Stand vor NC in jedem Leser), `?ncbase=<url>` (Produktbasis für Prüfläufe, Muster `?rucbase=`),
  Producer `RADAR_NC=0`. Der Spiegel bildet die Produkte nur, wenn der Web-Klon den Vertrag trägt (Marker
  `src/sources/radarNowcastImg.ts`) — **live erst mit Jans Push von `main`**; das Spiegelskript im Daten-Repo ist schon aktualisiert
  (`6a7d113bd`, schlummert bis dahin).

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
