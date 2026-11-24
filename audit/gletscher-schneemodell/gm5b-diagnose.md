# GM-5b — Eichrunde 2: Faktor je Gletscher und Verteilung je Band, Winterschmelze wie im Betrieb — Diagnose (24.11.2026)

> Auftrag: E-GM-31 mit E-GM-9, E-GM-10, E-GM-11 (Jan 24.11.: alle wie empfohlen; „eigenständig, zuerst Diagnose und eingefrorene Regel, dann Code“). Dieses Dokument ist die Diagnose VOR der Regel und vor jedem Code. Gelesen: die Werkzeuge der ersten Runde (`snowcal-truth.mjs`, `snowcal-forcing.mjs`, `snowcal-fit.mjs`, `snowcal-table.mjs`, `lib/snowcal.mjs`), die eingefrorene Regel der ersten Runde samt Nachtrag, der Schmelzkern (`lib/meltcore.mjs`), der Producer im Stand `019ab63c`, das Einschwing-Werkzeug, der Zwischenspeicher `C:\dev\buscosun-glacier-cache\gm3\` (Verzeichnisse und Dateiformen). Nichts gerechnet.

## 1. Was die erste Runde hinterlassen hat

- **Wahrheit:** `gm3\truth\gy.json` — 488 Gletscherwinter (Schweiz 398 / 36 Gletscher GLAMOS, Österreich 90 / 8 WGMS), hydrologische Jahre 2012–2025; je Winter Stufen `{z0, z1, area, bw}` (100 m bei GLAMOS, meist 50 m bei WGMS), `t0`/`t1`, `zMed`, `catId`, `region`. Nutzbar 481 (44 Gletscher).
- **Antrieb:** Temperatur stündlich je STATION (`temp-<Land>-<Station>.json`, 19 SwissMetNet, 7 GeoSphere; bis 27 km entfernt, bis 1 800 m tiefer; im Fit mit −6,5 K/km auf die Stufe gelegt). Niederschlag: Schweiz RhiresD täglich je Gletscherpunkt (`rhires.json`, im Fit gleichmäßig auf 24 Stunden), Österreich INCA stündlich (`inca-<Gletscher>.json`, `inca-v1-1h-1km`, Parameter `RR` — von Jan am 24.11. bestätigt, E-GM-11).
- **Rechnung der ersten Runde:** Zuwachs `k · P · Schneeanteil(0–2 °C)`, Winterschmelze als Gradtag (`0,165 mm je K und Stunde`, Eis × 1,6); schnelle Tabelle über `k` (`eventsOf` / `balOf`), `k = F · Verlauf`. Auswahl mit ausgelassenem Gletscher (LGO) und ausgelassenem Jahr (LYO). Gewählt: `F` je Land (1,793 / 2,326), Verlauf −2,0 % je 100 m (nicht belastbar, K-4 rot).
- **Schon gemessen, explorativ (Nachtrag 1):** N1-a Faktor je Gletscher, ein Winter ausgelassen, 478 Winter / 43 Gletscher: Winterbilanz 227 statt 399 mm Fehler; **ohne Schrumpfung**, Steigung fest aus dem Voll-Fit. N1-c: je weniger Winterschmelze, desto besser (ohne 337 statt 433 mm Stufenfehler).
- **GM-5 A3 (V3):** das beständige Muster der Stufenwerte selbst senkt den Formfehler um 21 % (Schweiz 24 %, Österreich 6 %) — gemessen auf der Form `bw/bw̄`, nicht im Modell.

## 2. Was „Winterschmelze wie im Betrieb“ (E-GM-10) verlangt

Der Betrieb rechnet je Stunde und 50-m-Band (`simulate`, `model: 'eti'`): Schneeanteil 0–2 °C, Schnee-Albedo (frisch 0,85, altert mit 144 h auf 0,55), Schmelze `TF · T' + SRF · (1 − Albedo) · G` nur über `T' > 1 °C` (`T' = 0,85 · T`; also nichts unter rund 1,2 °C), mit `TF = 0,12`, `SRF = 0,005455` aus `melt-calibration.json` (Gate C rot, `TF` an der Grenze). Die Strahlung `G` ist im Betrieb Klarhimmel (Haurwitz, mit Höhenzuschlag) × Bewölkungsfaktor aus der Bewölkung von buscosun Fusion.

**Für vergangene Winter gibt es buscosun Fusion nicht.** Was es gibt:

| Größe | Schweiz | Österreich |
|---|---|---|
| Strahlung | **gemessen an der Temperaturstation, liegt schon im Zwischenspeicher**: SwissMetNet `gre000h0` in `smn\raw-*.csv` (an den 19 Stationen fast lückenlos; DIA ab 20.11.2013, GRC ab 31.5.2013). Dieselbe Größe, an der Gate C `SRF` geeicht hat (`c-forcing.mjs`) | **nicht im Zwischenspeicher.** Dieselbe Quelle wie die Temperatur (`klima-v2-1h`, GeoSphere Data Hub, CC BY 4.0) führt die Globalstrahlung `cglo` — an der Hintereisferner-Prüfung von Gate C schon benutzt (`c-hef.mjs`, Station Obergurgl). Nachladen: 7 Stationen × 2011–2025, ein Parameter mehr im selben Abruf |
| Temperatur | wie in der ersten Runde (Station, −6,5 K/km) — **nicht** die Temperatur des Betriebs (buscosun Fusion in der Medianhöhe mit eigenem Gradienten) | ebenso |
| Niederschlag | RhiresD täglich, gleichmäßig auf 24 h — die Albedo-Auffrischung hängt am Zeitpunkt des Schneefalls, den ein Tageswert nicht trägt | INCA stündlich |

Folgen:
- „Wie im Betrieb“ heißt für vergangene Winter: **die Formel und die Konstanten des Betriebs**, mit gemessener Strahlung einer Station statt der modellierten. Die Temperatur bleibt die der ersten Runde. Das wird so benannt (V-GM-85).
- Die schnelle Tabelle der ersten Runde trägt die ETI-Schmelze nicht (die Albedo hängt an der Vorgeschichte von `k · S` und altert jede Stunde). Die neue Runde rechnet je Winter, Stufe und `k` die volle stündliche Rekursion mit `simulate` selbst (ein Band, `pGrad 0`) und legt daraus eine Tabelle über `k` an. Geschätzt 481 Winter × rund 12 Stufen × 236 `k`-Werte ≈ 1,4 Mio. Läufe über je rund 5 000 Stunden — Minuten, nicht Stunden; zu messen.
- Fehlende Strahlung einer Stunde: Regel des Betriebs für unbekannte Bewölkung (Klarhimmel × 0,55), gezählt je Winter; ein Winter mit zu vielen solchen Stunden fällt aus der Wertung (Schwelle in der Regel).
- Strahlung in der Höhe der Stufe: die Station steht bis 1 800 m tiefer. Der Betrieb kennt nur den Höhenzuschlag des Klarhimmels (`1 + 6·10⁻⁵ · z`); dieselbe Skalierung Station → Medianhöhe wird angewandt, sonst nichts (kein Hang, kein Schatten — wie im Betrieb).

## 3. Was „Faktor je Gletscher“ (E-GM-9) und „Verteilung je Band“ (E-GM-31) heißen

- **Faktor je Gletscher mit Schrumpfung:** `F̂_g = w · F_g + (1 − w) · F_Land`, `w = n / (n + n₀)`, `n` = Zahl der Winter des Gletschers. `F_g` aus den Wintern des Gletschers (kleinster Stufenfehler). `n₀` aus einem kleinen, vorher festgelegten Satz, gewählt mit ausgelassenem Winter. Geprüft immer mit ausgelassenem Winter: der Faktor eines Winters kommt nur aus den ANDEREN Wintern.
- **Verteilung je Band:** je Winter und Stufe der Multiplikator, der die gemessene Stufenbilanz genau trifft (`k*`, eindeutig, weil die Bilanz mit `k` steigt), daraus die Form `k*/k̄* − 1` (flächengewichtet mittelwertfrei); beständige Form des Gletschers = Mittel über die anderen Winter, auf die Höhe gelegt (die Stufen verschieben sich mit dem Rückzug kaum; Interpolation in der Höhe), mit derselben Schrumpfung gegen „keine Form“. Angewandt als `corr[b]` im Schmelzlauf: flächengewichtet mittelwertfrei, das Mittel des Gletschers bleibt beim Faktor.
- **Form und Niveau gehören in eine Runde** (V-GM-25): die Form wird auf dem Niveau des eigenen Faktors bestimmt, nicht auf dem Landeswert.
- **Geprüfte Varianten** (alle mit ETI-Schmelze, ein Winter ausgelassen, Gletscher mit mindestens 4 Wintern): V0 Landeswert ohne Form (der Betrieb heute) · V1 Faktor je Gletscher · V2 Faktor + Form · V3 Landeswert + Form · Negativkontrolle: Form eines fremden Gletschers. Dazu der Landeswert selbst neu mit ETI (LGO), gegen die erste Runde gestellt.
- **Was die Runde nicht leisten kann:** die übrigen rund 2 050 Gletscher bekommen nichts (benannte Regel „Landeswert, keine Form“). Der Winter 2025/26 fehlt in der Wahrheit (GLAMOS veröffentlicht ihn 2027) — die Prüfung an einem Winter, den die Eichung nie gesehen hat, bleibt offen (E-GM-10, GM-8).

## 4. Was ein Bau danach berühren würde (noch nicht Teil dieser Diagnose)

- `scripts/glacier/snowcal-fit2.mjs` (neu) und ein Nachlade-Schritt für `cglo`; Bericht `gm5b-report.json`; `snow-calibration.json` bekommt einen Abschnitt je Gletscher (Faktor, Zahl der Winter, Form als Stützstellen über der Höhe, Urteil) — die bestehenden Abschnitte bleiben Byte für Byte, damit ein alter Producer sie liest.
- `lib/meltcore.mjs`: `simulate` nimmt heute nur `pGrad`, keinen Multiplikator je Band — ein optionaler Eingang `corr[]`, ohne den jede Zahl bleibt.
- `melt.mjs`: zwei neue Schalter, beide aus (Faktor je Gletscher; Form je Band), `lib/snowcal.mjs` (Leser der Tabelle), Prüfer, Gegenprobe, Byte-Gleichheit am vollen Lauf.
- **Die Schneedecke (drei Höhen) bleibt beim Landeswert:** ihr Zustand nennt die Rechnung, aus der er stammt (`rules.precip: country`), und nimmt keinen anderen an; ein Faktor je Gletscher dort bräuchte einen neuen Startzustand (V-GM-86).

## 4a. Stand (24.11., wird fortgeschrieben)

| Schritt | Stand |
|---|---|
| Strahlung laden | erledigt: `scripts/glacier/snowcal-radiation.mjs` → `gm3\rad-<Station>.json`, `radiation.json`. Schweiz aus den vorhandenen Dekadendateien, Österreich `cglo` nachgeladen (7 Stationen × 2011–2025, `gm3\geosphere\raw-1h-<id>-cglo-<Jahr>.json`). Abdeckung 82–100 % je Station, Brunnenkogel erst ab 14.12.2016 (61 %), Les Diablerets ab 20.11.2013, Grächen ab 31.5.2013, Gornergrat ab 17.10.2012, Les Attelas ab 8.10.2012. Von 488 Gletscherwintern fehlt die Strahlung in mehr als 2 % der Stunden an 50, in mehr als 15 % an 26, in mehr als 50 % an 14 |
| Werkzeug | `scripts/glacier/snowcal-fit2.mjs` (Tabellen über `k` mit dem Schmelzkern des Betriebs, Schätzer mit ausgelassenem Winter, Varianten V0 … V3 und N, Urteile K-5 … K-8, Empfindlichkeiten, Werte für die Tabelle) |
| Probe an erfundenen Wintern, VOR dem Einfrieren | 6 erfundene Gletscher × 7 Winter mit bekanntem Faktor und bekannter Form (2 % Rauschen), kein echter Wert gelesen: Faktoren auf 1,5 % wiedergefunden (1,404 / 2,169 / 1,803 / 2,609 / 2,004 / 2,300 gegen 1,4 / 2,2 / 1,8 / 2,6 / 2,0 / 2,3), Formen wiedergefunden, Stufenfehler V0 299 → V1 111 → V2 32 mm, die Negativkontrolle verschlechtert (181) |
| Regel eingefroren | `gm5b-method-frozen.md`, sha256 `c5242e51…`, 24.11. 07:26 UTC — vor dem ersten Lauf auf echten Wintern |
| Gewerteter Lauf | gestartet 24.11. 07:27 UTC → `gm3\report-fit2.json`; Ergebnis wird in §6 nachgetragen |

## 4b. Ergebnis des gewerteten Laufs (24.11. 07:27–07:39 UTC; Regel `c5242e51…`, Bericht `gm3\report-fit2.json`)

481 nutzbare Gletscherwinter (7 nicht nutzbar, wie in der ersten Runde); gewertet **478 Winter an 43 Gletschern** mit mindestens vier Wintern (Schweiz 391 / 35, Österreich 87 / 8). Strahlung ohne Messung in mehr als 2 % der Stunden an 44 der nutzbaren Winter. Alle Zahlen in mm Wasserwert, jeder Winter mit Werten vorhergesagt, die ihn nicht gesehen haben; Urteile vom Werkzeug.

| Variante | s1 Stufenfehler | s2 Winterbilanz | s3 Bias | s4 Form | Schweiz s1 / s2 | Österreich s1 / s2 |
|---|---|---|---|---|---|---|
| **V0** Landeswert (der Betrieb heute) | 432,7 | 402,2 | −92,1 | 131,7 | 428,7 / 397,1 | 450,8 / 425,3 |
| **V1** Faktor je Gletscher | 281,3 | **233,0** | −39,9 | 132,0 | 255,1 / 204,3 | 398,8 / 361,8 |
| **V2** Faktor + Form | **249,5** | 233,0 | −41,6 | **73,7** | 221,2 / 204,2 | 376,6 / 362,2 |
| V3 Landeswert + Form | 411,8 | 402,4 | −93,8 | 76,7 | 406,5 / 397,1 | 436,0 / 426,1 |
| N Negativkontrolle (fremde Form) | 294,7 | 232,9 | −40,4 | 158,5 | | |

Landeswerte mit der Schmelze des Betriebs (alle Winter): **Schweiz 1,821, Österreich 2,416** (erste Runde, Gradtag: 1,793 / 2,326). Schrumpfung: `n₀ = 0` (s1 281,3 / 283,0 / 287,2 / 298,5 / 319,7 für 0 / 1 / 2 / 4 / 8 — der eigene Faktor ohne Schrumpfung ist am besten), `n₀ˢ = 2` (249,3 / 249,1 / 249,5 / 251,1 / 254,9 — Gleichstand der ersten drei, nach der Regel der größere). 88 von 5 267 Stufen an einer Grenze des Multiplikators gekappt.

| Urteil | Wert | |
|---|---|---|
| **K-5** Schmelze des Betriebs gegen Gradtag (Landeswert, LGO-s1) | 432,7 gegen 429,0 (−0,9 %) | **gleich** — die Schmelze des Betriebs trifft die Winterbilanz weder besser noch schlechter |
| **K-6** Faktor je Gletscher | s2 **−42,1 %** gegen V0 (p10 −34,6 %, p90 −48,4 %), Grenze 20 % | **trägt** |
| **K-7** Form je Stufe | s4 **−44,1 %** gegen V1 (p10 −39,8 %); die fremde Form verschlechtert um 20,1 % | **trägt** |
| **K-8** Winterbilanz ≤ 350 mm | V2: 233,0 | erreicht — in der Schweiz 204, **in Österreich 362 (über der Grenze)** |

Empfindlichkeiten (ändern nichts an Auswahl und Urteil; V0 / V1 / V2 je s1):

| | Landeswerte CH / AT | V0 | V1 | V2 |
|---|---|---|---|---|
| gewertet | 1,821 / 2,416 | 432,7 | 281,3 | 249,5 |
| `TF`, `SRF` × 0,5 | 1,620 / 2,167 | 373,5 | 248,2 | 219,2 |
| `TF`, `SRF` × 1,5 | 2,031 / 2,670 | 512,4 | 336,6 | 292,4 |
| Strahlung überall Klarhimmel × 0,55 | 1,749 / 2,331 | 407,9 | 264,9 | 235,1 |
| nur Winter mit gemessener Strahlung (434) | — | 430,0 | 274,2 | 241,2 |
| Gradtag-Schmelze der ersten Runde | 1,793 / 2,323 | 429,0 | 277,4 | 243,5 |

Lesart (meine):
- **Der Faktor je Gletscher ist die große Verbesserung** (Winterbilanz 0,23 statt 0,40 m), wie N1-a es explorativ zeigte — jetzt mit der Schmelze des Betriebs und nach eingefrorener Regel. In Österreich wirkt er viel schwächer (362 statt 425 mm) als in der Schweiz (204 statt 397).
- **Die Form je Stufe halbiert fast den Formfehler** (74 statt 132 mm) und senkt den Stufenfehler um weitere 11 %; sie ändert die Winterbilanz des Gletschers nicht (mittelwertfrei). Sie trägt auch ohne den eigenen Faktor (V3).
- **Die Höhe des Faktors hängt weiter an der Winterschmelze:** halbe Schmelze gibt 1,62 / 2,17 und trifft besser, anderthalbfache 2,03 / 2,67 und trifft schlechter — wie N1-c. Mit der gemessenen Stationsstrahlung trifft die Rechnung schlechter als mit pauschalem Klarhimmel × 0,55 (433 gegen 408): ein Hinweis, dass die Winterschmelze des Betriebs eher zu groß ist (V-GM-88, V-GM-89).
- **Mont Collon liegt wieder an der Obergrenze 5** (wie V-GM-19): kein gemessener Faktor.

Werte für die Tabelle: 43 Gletscher (Schweiz 35, Österreich 8); Faktor p10 / Median / p90 = 1,38 / 1,97 / 2,91, kleinster 1,107 (Hohsaasgletscher), Österreich 1,91 (Venediger, Zettalunitz/Mullwitz) bis 3,14 (Hintereisferner). Stärkster Ausschlag der Form je Gletscher: Median 0,19, p90 0,66, höchstens 1,02.

**Nachtrag zur Regel, nach dem Lauf geschrieben (ändert kein Urteil und keine Zahl oben):** ein Faktor an einer Grenze des Suchbereichs (0,30 oder 5,00) ist kein Messwert. Der Eintrag bleibt in der Tabelle, trägt `atBound: true`, und der Producer nimmt für diesen Gletscher den Landeswert (benannt). Trifft einen Gletscher (Mont Collon).

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GM-89 | Mit gemessener Stationsstrahlung trifft die Winterbilanz schlechter als mit Klarhimmel × 0,55, und mit halber Schmelze besser: die Winterschmelze des Betriebs (`TF` an der Grenze, Gate C rot) ist eher zu groß | ein Faktor, der nicht die Schmelze ausgleicht · `TF`/`SRF` an Winter UND Sommer gemeinsam neu eichen (V-GM-26, vor Mai 2027) |
| V-GM-90 | In Österreich bringt der Faktor je Gletscher wenig (Winterbilanz 362 statt 425 mm; 8 Gletscher, INCA stündlich, Stationen bis 1 800 m tiefer) | Klarheit, ob es am Niederschlag (INCA) oder an der Temperatur liegt · je Gletscher die Streuung des Faktors von Winter zu Winter ansehen; eine zweite Analyse (SNOWGRID-Wasserwert) als Gegenprobe |
| V-GM-91 | Der Schmelzzustand (`melt/state.json`) kennt die Rechnung nicht, aus der sein Schnee stammt: nach dem Einschalten des Faktors je Gletscher liegt an den 42 Gletschern Schnee aus zwei Faktoren übereinander (wie V-GM-27) | eine Schneedecke aus einer Rechnung · beim Einschalten den Schmelzzustand dieser Gletscher neu einschwingen oder die Regel im Zustand vermerken |

## 5. Offene Punkte vor der Regel

| Nr. | Punkt | Vorgehen |
|---|---|---|
| V-GM-85 | „Wie im Betrieb“ ist für vergangene Winter nur für Formel und Konstanten erfüllbar; Strahlung und Temperatur kommen von einer Station | so benennen; die Empfindlichkeit gegen die Strahlung (Station gegen Klarhimmel × 0,55) in der Runde mitmessen |
| V-GM-86 | Ein Faktor je Gletscher im Schmelzlauf und der Landeswert in der Schneedecke desselben Gletschers stehen dann nebeneinander | benennen; für die Schneedecke ein eigener Schritt mit neuem Startzustand |
| V-GM-87 | `cglo` der sieben österreichischen Stationen fehlt im Zwischenspeicher | nachladen aus derselben, von Jan freigegebenen Quelle (`klima-v2-1h`); nur lesend, ein Parameter mehr |
| V-GM-88 | `TF` steht in `melt-calibration.json` an der Grenze, Gate C ist rot: die Winterschmelze „wie im Betrieb“ trägt die Unsicherheit dieser Eichung | Empfindlichkeit `TF`/`SRF` × 0,5 und × 1,5 wie S1 der ersten Runde, ohne Einfluss auf die Auswahl |
