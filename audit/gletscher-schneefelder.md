# Phase GS — Schneefelder in „Wetter am Gletscher“ (nur Daten)

> Stand 21.11.2026. Auftrag: die Schneewerte, die buscosun Fusion ohnehin liefert, in `melt/wx/<lauf>` schreiben, damit später
> für jeden Gletscher eine Höhensäule gezeichnet werden kann. Keine neue Quelle, kein zusätzlicher Fusion-Abruf, keine Anzeige.
> Werkzeuge und Belege: `audit/gletscher-schneefelder/`.

## 1 Diagnose (vor dem Code, 21.11. 18:50 UTC)

### 1.1 Ist-Stand

- `scripts/glacier/melt.mjs` ruft buscosun Fusion je Gletscher der Klassen A/B einmal (flacher Punkt in der Medianhöhe, 336 h) und
  reicht dieselbe Antwort an `lib/weathercore.mjs`. Der Kern schreibt je Gletscher eine Tageszeile (14 Tage) und eine Stundenzeile (48 h).
- Schnee heute: Neuschnee je Tag an Zunge, Median, Oberkante = Niederschlag × Schneeanteil; der Anteil kommt aus der festen Regel
  des Schmelzkerns (0 bei 2 °C, 1 bei 0 °C, linear, Bandtemperatur). Schneefallgrenze nur als Tagesmittel (`sl`, mindestens 6 Werte je Tag).
  Summen sind Erwartungswerte ohne Spanne (`rules.sums === 'expected'`).
- Die Seite (`glacierClient.ts`) verwirft ein Dokument, das `weatherProblems` / `weatherHourlyProblems` nicht besteht. Diese Prüfer
  lesen nur die bekannten Felder; unbekannte Felder an Zeilen mit eigenem Antrieb stören sie nicht. Ein additiver Vertrag ist damit möglich,
  solange `rules.sums` `'expected'` bleibt und die alten Felder ihre Regeln halten.
- Der Workflow `glacier-melt.yml` klont den Producer bei jedem Lauf von `GLACIER_PRODUCER_REF` aus `buscosun-web`. Neue Felder stehen
  also erst in den Dokumenten, wenn `buscosun-web` gepusht ist. Am Daten-Repo ist für diese Phase nichts zu ändern.

### 1.2 Schritt 0 — was die Antwort je Vorlauf trägt (gemessen)

Sonde `audit/gletscher-schneefelder/probe-fields.mjs` (derselbe Aufruf wie `melt.mjs`), Cube `489c0e4` vom 21.11. 17:43 UTC
(t1 2026112115, t2 2026112112, t3 2026112100), Stand buscosun Fusion 14, sechs Gletscher zwischen 1 893 m und 4 033 m
(CH, AT, DE). Ergebnis an allen sechs gleich, Rohwerte in `probe-fields.json`.

| Feld der Antwort | 0–46 h | 47–115 h | 116–245 h | 246–335 h |
| --- | --- | --- | --- | --- |
| Schneefallgrenze `snowline.mean` | stündlich | 3-stündlich, **mit Lücken** | keine | keine |
| Spanne der Schneefallgrenze `snowline.p10/p90` | stündlich, mit Lücken | keine | keine | keine |
| `pSnow.mean` | stündlich | stündlich | stündlich | 6-stündlich (nur an den Modellschritten) |
| Niederschlag Mittel, p10, p90 | stündlich | stündlich | stündlich | stündlich (zwischen den Modellschritten interpoliert) |
| Niederschlag Verteilung (`hurdleLogNormal`) | stündlich | stündlich | stündlich | 6-stündlich |
| Böe Mittel, p10, p90 | stündlich | stündlich | stündlich | stündlich (interpoliert) |
| Böe Verteilung (`censoredNormal`) | stündlich | stündlich | stündlich | 6-stündlich |
| Temperatur Verteilung (`normal`), Feuchte-Median | stündlich | stündlich | stündlich | 6-stündlich / stündlich |

Lücken der Schneefallgrenze: sie steht nur an den Modellschritten, an denen das Modell eine Grenze nennt. Beispiele aus der Sonde:
Hochweißenfeldkees 0–46 h, dann nur 91, 94, 100 h; Höllentalferner 0–46 h, dann 88–97 h und 103 h; Aletschhorn N 0–46 h, 49–61 h, 67–115 h.
Nach 115 h gibt es an keinem Gletscher einen Wert.

**`pSnow` lässt sich aus der Antwort nicht exakt nachrechnen.** Die Phasenfunktion des Motors auf die Temperaturverteilung und den
Feuchte-Median der Antwort angewandt weicht in Mischstunden um bis zu 0,085 vom `pSnow` der Antwort ab (sechs Gletscher, je 261 Stunden
mit Verteilung). Der Motor rechnet `pSnow` vor den späteren Stufen der Kette, die Verteilung in der Antwort ist die nach ihnen (V-GS-1).
Folge für die Höhen: an der Medianhöhe gilt das `pSnow` der Antwort; an Zunge und Oberkante wird es um die Differenz verschoben, die die
Phasenfunktion zwischen der Temperatur dieser Höhe und der Medianhöhe ergibt.

Dateigrößen vor der Phase (Lauf 2026112117 aus dem Daten-Repo, 2 084 Zeilen, 957 mit eigenem Antrieb, 26 Regionen):

| Dokument | roh | gzip | brotli |
| --- | --- | --- | --- |
| Tagesdokument `melt/wx/<lauf>.json` | 1 811 870 B | 401 726 B | 260 695 B |
| 26 Stunden-Chunks zusammen | 2 586 185 B | 535 923 B | 385 046 B |

### 1.3 Der Vergleich über 7 Tage ist rückwirkend nicht möglich

- Die Git-Historie von `buscosun-data` reicht 14 Commits zurück (das Repo wird laufend neu geschrieben); alte Cube-Läufe sind nicht erreichbar.
- Die Wetterdokumente liegen zwar seit dem 15.11. alle im Daten-Repo (24 Läufe, nichts wird gelöscht, V-GS-2), aber keines trägt `pSnow`
  oder die Temperaturverteilung. Die neue Regel lässt sich aus ihnen nicht rechnen.
- Lokal gibt es zwei Cubes: den vom 04.11. (alter Klon `C:\dev\buscosun-data`) und den von heute.

Folge: **die Regel wird gebaut, bleibt aber aus.** Der Producer rechnet ab jetzt in jedem Lauf beide Regeln und schreibt den Vergleich in
eine kleine Laufdatei (`melt/wx/phase.json`); das Urteil nach mindestens 7 Tagen rechnet der Producer selbst und nennt es in der Statuszeile.
Die zwei lokalen Cubes liefern vorab zwei Tage als Anhalt (§3.3).

### 1.4 Vor der Messung eingefroren

- **Grenze** `GLACIER_WEATHER_PHASE_LIMIT = 0,10`: über alle Gletscher mit eigenem Antrieb, alle 14 Tage und alle Läufe des
  Vergleichszeitraums darf die Summe des Neuschnees je Höhe (Zunge, Median, Oberkante) unter der neuen Regel um höchstens 10 % von der
  Summe unter der alten abweichen. Mehr ⇒ nicht umschalten, Jan fragen.
- **Mindestdauer** `GLACIER_WEATHER_PHASE_MIN_DAYS = 7` verschiedene UTC-Tage mit mindestens einem Lauf.
- Zusätzlich nur berichtet, nicht als Grenze: Anteil der Gletscher-Tage mit mindestens 1 mm Niederschlag, an denen sich der Neuschnee in
  der Medianhöhe um mehr als 1 mm verschiebt; größte Verschiebung eines Tages.

### 1.5 Plan der Felder (additiv)

| Schritt | Feld | Ort | Regel |
| --- | --- | --- | --- |
| 1 | `sl` Schneefallgrenze je Stunde, 120 Werte | Stunden-Chunk | Wert der Antwort, auf 10 m, `null` wo sie keinen hat; das Tagesmittel bleibt |
| 2 | `sn` Neuschnee je Stunde an Zunge, Median, Oberkante, 48 h | Stunden-Chunk | mm Wasserwert in 0,01; Niederschlag × Schneeanteil der Höhe |
| 3 | Schneeanteil aus `pSnow` | `s`, `sn` in beiden Dokumenten | Schalter `--phase=psnow` bzw. `GLACIER_WEATHER_PHASE`; Voreinstellung `temperature` (alte Regel); `rules.phase.rule` nennt die Regel |
| 4 | `pq`, `snq` Spanne p10/p90 der Tagessummen, `gq` Spanne der stärksten Böe | Tagesdokument | Summen: Quantile der Summen von K Szenarien; Böe: p10/p90 der Stunde mit der stärksten Böe; neue Regel `rules.spread`, `rules.sums` bleibt `'expected'` |
| 5 | Nachbar-Antrieb | — | keines der neuen Felder, `omit` unverändert |

## 2 Umsetzung (21.11.)

Geändert: `src/glacier/glacierWeatherContract.ts` (Vertrag, additiv), `scripts/glacier/lib/weathercore.mjs` (Kern),
`scripts/glacier/melt.mjs` (Schalter, Vergleichsdatei, Regeln im Dokument), `scripts/verify-glacier-weather.mjs` (Block G).
Neu: `scripts/glacier/make-weather-answer-fixture.mjs`, Fixtures `weather-answer.json` (zwei echte Antworten) und
`weather-contract-before-gs.ts` (eingefrorene Kopie des Vertrags vor der Phase = der alte Leser). Nicht angefasst: der Motor
(`src/pointForecast/**` nur gelesen: `quantileOf`, `Phi`, `wetBulbC`, `snowProbabilityFromWetBulb`, zwei Konstanten), Publisher,
Workflows, Seite, Daten-Repo.

### 2.1 Neue Felder

| Feld | Dokument | Inhalt | Regel |
| --- | --- | --- | --- |
| `sl` | Stunden-Chunk, eigener Antrieb | Schneefallgrenze je Stunde, 120 Werte ab Laufstunde, m auf 10 | Wert der Antwort oder `null`; nichts wird zwischen zwei Werten aufgefüllt |
| `sn` | Stunden-Chunk, eigener Antrieb | Neuschnee je Stunde an Zunge, Median, Oberkante, 48 h, mm Wasserwert auf 0,01 | Niederschlag der Stunde × Schneeanteil der Höhe |
| `pq` | Tagesdokument, eigener Antrieb | [p10, p90] der Niederschlagssumme je Tag | Quantile der Summen von 100 Szenarien |
| `snq` | Tagesdokument, eigener Antrieb | [p10, p90] der Neuschnee-Summe je Tag und Höhe | wie `pq`, je Szenario mit dem Schneeanteil seiner Temperatur |
| `gq` | Tagesdokument, eigener Antrieb | [p10, p90] der stärksten Böe des Tages, km/h | p10/p90 der einen Stunde mit der stärksten Böe |
| `rules.phase.rule` | Tagesdokument | `temperature` oder `psnow` | fehlt in Dokumenten vor der Phase (= `temperature`) |
| `rules.spread` | Tagesdokument | `{ sums: 'scenarios', k: 100, rho: 0.9, gust: 'strongest-hour', origin: 'set' }` | benennt die neue Regel; `rules.sums` bleibt `'expected'` für `p` und `sn` |
| `melt/wx/phase.json` | eigene Datei | je Lauf: Neuschnee-Summe je Höhe unter beiden Regeln, nasse und verschobene Gletscher-Tage | 21 Tage aufbewahrt; Urteil `phaseVerdict` |

Die Stundenzeile `s` (Schneeanteil in der Medianhöhe) und die Tageszeile `sn` folgen der Regel des Laufs. Mit der
Voreinstellung sind sie die alten Werte.

### 2.2 Schneeanteil aus `pSnow` (Schalter)

- Schalter des Producers: `--phase=temperature|psnow` an `melt.mjs`, oder die Umgebungsvariable `GLACIER_WEATHER_PHASE`.
  Voreinstellung `WEATHER_PHASE_DEFAULT = 'temperature'` in `weathercore.mjs`. Ein unbekanntes Wort schreibt kein Wetterdokument
  und nennt den Grund in der Statuszeile; der Schmelzlauf bleibt.
- Medianhöhe: der Schneeanteil ist das `pSnow` der Antwort.
- Zunge und Oberkante: `pSnow` plus die Differenz der Phasenfunktion des Motors (Feuchtkugel-Logistik über 21 Quantilknoten der
  Temperatur) zwischen der Temperatur dieser Höhe und der Medianhöhe; dieselbe Streuung und dieselbe Feuchte wie in der Medianhöhe
  (beides gesetzt, die Antwort kennt nur die Medianhöhe).
- Stunden ohne `pSnow` (nach +245 h zwischen den 6-Stunden-Schritten): linear zwischen den zwei Nachbarwerten, höchstens über
  6 Stunden. Eine längere Lücke rechnet mit der Temperaturregel und wird gezählt. Liegt für weniger als 80 % der Stunden ein
  `pSnow` vor, wird der Gletscher unter `psnow` mit Grund übersprungen (`few-hours:psnow`).

### 2.3 Spanne der Summen (neue Regel `rules.spread`)

Je Gletscher 100 Szenarien (Keim aus Lauf und Kennung, der Lauf ist wiederholbar). Jedes Szenario zieht je Stunde ein Quantilniveau
für den Niederschlag und eine Temperaturabweichung, beide mit Stundenkorrelation 0,9 und voneinander unabhängig. Niederschlag der
Stunde = Quantil der Verteilung der Antwort; ohne Verteilung (spät im Lauf zwischen zwei Modellschritten) die lineare Mischung der
Nachbar-Quantile, wie die Antwort selbst dort rechnet. Die Spanne ist das p10/p90 der 100 Tagessummen, nie eine Summe von
Stundenquantilen. Der Erwartungswert kann außerhalb der Spanne liegen (ein Tag, der in neun von zehn Szenarien trocken bleibt).
Szenarienzahl, Korrelation und Unabhängigkeit sind gesetzt, nicht gemessen (E-GS-1).

### 2.4 Nachbar-Antrieb

Unverändert: die Zeile trägt Kennung, Höhen, Antrieb, Temperatur und `omit: 'neighbour-forcing'`, die Stundenzeile nur die
Temperatur. Der Vertrag lehnt jedes neue Feld an einer solchen Zeile ab. Im lokalen Lauf: 1 127 Zeilen, alle mit genau diesen Schlüsseln.

## 3 Messungen am lokalen Producer-Lauf (21.11.)

Lauf `melt.mjs` am frischen Cube (`489c0e4`, t1 2026112115 / t2 2026112112 / t3 2026112100), Lese-Ansicht aus `origin/main` und dem
Zweig `glacier` (Build 20261120-1), `--now=2026-11-21T17:50:00Z --always`: Lauf 2026112117, 2 094 Gletscher, 0 übersprungen; Wetter
2 084 Zeilen (957 eigener Antrieb, 1 127 Nachbar), 10 übersprungen (`elevations`, wie im Live-Lauf). Auswertung
`analyse-run.mjs`, Berichte `run-2026112117-temperature.json`, `run-2026112117-psnow.json`, `run-2026110412-temperature.json`.

### 3.1 Funktionserhalt gegen den Live-Lauf

Der Live-Lauf 2026112117 (Runner, 17:23 UTC) rechnete auf denselben Cube-Läufen. Mit der Voreinstellung `temperature` sind die
alten Felder meines Laufs in **2 084 von 2 084 Tageszeilen und 2 084 von 2 084 Stundenzeilen Byte für Byte gleich** dem
Live-Dokument. Gegenprobe: mit `--phase=psnow` weichen 923 Tageszeilen und 79 Stundenzeilen ab. Das Schmelzdokument ist mit und
ohne Wetterteil dasselbe (`cmp`), der Wetterlauf ist wiederholbar (zweiter Lauf, dieselben Bytes).

Die zwei Prüfer, die die Seite aufruft (`weatherProblems`, `weatherHourlyProblems`), sind Zeichen für Zeichen die von vorher; die
Schneefelder prüfen zwei eigene Funktionen (`weatherSnowProblems`, `weatherHourlySnowProblems`), die der Producer zusätzlich
aufruft. Der eingefrorene alte Vertrag nimmt beide vollen Dokumentsätze an (0 Verstöße, beide Regeln).

### 3.2 Dateigrößen vorher und nachher (Lauf 2026112117)

| Dokument | | roh | gzip | brotli |
| --- | --- | --- | --- | --- |
| Tagesdokument | vorher | 1 811 870 B | 401 726 B | 260 695 B |
| | nachher | 2 379 774 B (+31 %) | 498 474 B (+24 %) | 320 614 B (+23 %) |
| 26 Stunden-Chunks | vorher | 2 586 185 B | 535 923 B | 385 046 B |
| | nachher | 3 797 175 B (+47 %) | 684 403 B (+28 %) | 456 945 B (+19 %) |
| größter Chunk (roh) | vorher / nachher | 641 499 B / 963 341 B | | |

Anteil der neuen Felder (roh): Tagesdokument `snq` 340 KB, `pq` 116 KB, `gq` 113 KB; Stunden-Chunks `sn` 644 KB, `sl` 567 KB.
`melt/wx/phase.json`: rund 190 B je Lauf. Die Seite lädt das Tagesdokument und einen Chunk je Region; über jsDelivr kommen sie
brotli-gepackt.

Laufzeit auf dieser Maschine (unter Fremdlast, je ein Lauf): mit Wetterteil 112 s, mit `--weather=0` 97 s. Der Wetterteil kostet
also rund 15 s; der Live-Lauf auf dem Runner brauchte vor der Phase 54 s insgesamt.

### 3.3 Schneefallgrenze je Stunde

957 Zeilen × 120 Stunden: 58 196 Werte, 56 644 `null`, kein Wert nach +115 h. Am 04.11. 66 021 Werte, 48 819 `null`.

### 3.4 Die zwei Phasenregeln im Vergleich (Anhalt aus zwei Tagen, kein Urteil)

Summe des Neuschnees über alle 957 Gletscher mit eigenem Antrieb und 14 Tage, in mm Wasserwert:

| Lauf | Höhe | alte Regel | `pSnow` | Verschiebung |
| --- | --- | --- | --- | --- |
| 2026112117 (Cube 21.11.) | Zunge | 40 703,8 | 40 093,7 | 1,50 % |
| | Median | 40 969,2 | 40 714,8 | 0,62 % |
| | Oberkante | 40 972,9 | 40 858,6 | 0,28 % |
| 2026110412 (Cube 04.11., lokaler Altklon) | Zunge | 24 975,2 | 23 770,5 | 4,82 % |
| | Median | 27 742,3 | 26 287,1 | 5,25 % |
| | Oberkante | 28 527,6 | 27 533,3 | 3,49 % |

Nasse Gletscher-Tage (≥ 1 mm) mit mehr als 1 mm Verschiebung in der Medianhöhe: 5 von 9 930 (21.11.), 312 von 8 584 (04.11.);
größte Verschiebung eines Tages 2,0 bzw. 4,1 mm. Beide Tage liegen unter der Grenze von 10 %. `pSnow` ergibt an beiden Tagen und
allen drei Höhen **weniger** Neuschnee als die alte Regel. Das sind 2 Tage, nicht 7: die Regel bleibt aus (§1.3, §1.4).

### 3.5 Spanne

Am Lauf 2026112117 liegt der Erwartungswert des Niederschlags an 2 514 von 13 398 Gletscher-Tagen außerhalb von [p10, p90], an
Tagen mit mindestens 1 mm an 668 von 10 164 (6,6 %). 656 Gletscher-Tage haben p90 = 0. Beispiel Großer Aletschgletscher, Tag 0:
erwartet 12,1 mm, Spanne 0,4–33,2 mm; stärkste Böe 65 km/h, Spanne 53–77 km/h.

## 4 Gate (21.11.)

| Prüfung | Ergebnis |
| --- | --- |
| `verify:glacier-weather` | **33/33** (21 wie vorher + Block G mit 12 Prüfungen) |
| G1 echte Antwort | Fixture `weather-answer.json`: zwei echte Antworten (Hochweißenfeldkees 2 525–3 175 m, Firenband 1 825–2 175 m), Form der Felder wie in §1.2 |
| G2 Funktionserhalt | alte Felder Byte für Byte die des Kerns vor der Phase (Commit `e63933a1`); Negativkontrolle mit `psnow` |
| G3 Vorlauf ohne Schneefallgrenze | `null`, auch zwischen zwei 3-Stunden-Werten; +47 … +90 h am hohen Gletscher ganz ohne Wert |
| G5, G6, G9 Schalter in beide Richtungen | Kern und Ende zu Ende (`--phase`, `GLACIER_WEATHER_PHASE`, unbekanntes Wort ⇒ kein Wetterdokument, Grund in der Statuszeile) |
| G7 Spanne | Handfälle, Wiederholbarkeit, Gegenprobe mit anderem Keim, keine Summe von Stundenquantilen |
| G8, D2 Nachbar-Antrieb | nur Temperatur, `omit` benennt den Grund, kein neues Feld |
| G10 altes Dokument lesbar, alter Leser liest neues | eingefrorener Vertrag vor der Phase nimmt die neuen Dokumente; neuer Vertrag nimmt das alte Dokument; Negativkontrolle `rules.sums` |
| G11 Negativkontrollen | 10 Verletzungen am Tagesdokument, 7 am Stunden-Chunk, jede gemeldet |
| G12 Vergleichsdatei und Urteil | 6 Tage reichen nicht, 7 reichen; −20 % an der Zunge ⇒ nicht innerhalb |
| lokaler Producer-Lauf | §3: 2 084 Zeilen, 0 Vertragsverstöße (neu und alt), alte Felder gleich dem Live-Lauf, `glacierForbiddenWords` findet nichts |
| übrige `verify:glacier-*` | contract 64/64, static 7/7 (Fixture), publish 34/34, sat 28/28, melt 41/41, sheet 45/45, feed 22/22, hugonnet 41/41, stations 61/61 |
| `npm run typecheck` | grün |
| `npm run build` | grün (281/281 der Build-Prüfer) |
| `npm run budget` | grün: eagerJs 116,2 / 117, largestChunk 278,4 / 302, totalJs 2 096,1 / 2 097 KB. Gegenprobe mit dem Vertrag von HEAD: totalJs ebenfalls 2 096,1 — die Phase fügt dem Bundle nichts hinzu. Die Grenze 2 097 hat während der Phase eine andere Linie im selben Arbeitsbaum gesetzt (vorher 2 095, da war der Stand rot) |

Nicht geprüft: `verify:glacier-ui` (braucht einen Browser, bricht an HEAD ab, V-GH-6), keine Sichtprüfung, kein Real-Device
(Auftrag: keine Bildschirmfotos, keine Sichtprüfung). Kein Lauf auf dem Runner: der Producer wirkt erst mit dem Push von `buscosun-web`.

Die fünf Fragen: (1) Funktionserhalt — §3.1, G2, G10; (2) Desktop pixelgleich — kein Byte im Bundle geändert (Budget-Gegenprobe), nicht
angesehen; (3) Touch-Flächen — keine Anzeige geändert; (4) Konsole — nicht geprüft (kein Browser); (5) Long Tasks — keine Anzeige geändert.

## 5 Entscheidungen und Befunde

| Nr. | Inhalt | Stand |
| --- | --- | --- |
| E-GS-1 | Spanne der Summen: 100 Szenarien, Stundenkorrelation 0,9, Temperatur und Niederschlag unabhängig — alle drei gesetzt | offen (Jan); im Dokument als `origin: 'set'` |
| E-GS-2 | Spanne nur je Tag. Je Stunde ist sie nicht gebaut (Neuschnee je Stunde und Höhe wären 288 weitere Werte je Gletscher); die Stunden-p10/p90 von Niederschlag und Böe trägt die Antwort und ließen sich direkt schreiben | offen (Jan) |
| E-GS-3 | Umschalten auf `pSnow`: erst bei `enough` und `within` in der Statuszeile, dann `WEATHER_PHASE_DEFAULT = 'psnow'` | offen (Jan), frühestens 7 Tage nach dem Push |
| E-GS-4 | Kein Push nach `buscosun-data`: nichts dort war zu ändern, und ein von Hand eingespielter Lauf hätte einen der vier Läufe des Tages verbraucht | so umgesetzt |
| V-GS-1 | Das `pSnow` der Antwort passt nicht zur Temperaturverteilung derselben Antwort (bis 0,085 Abweichung in Mischstunden): der Motor rechnet es vor späteren Stufen der Kette. Mehrwert: Phase und Temperatur einer Stunde widersprechen sich nicht mehr. Skizze: `pSnow` nach der letzten Stufe rechnen — Änderung am Motor, eigener Stand, Jans Entscheidung | offen |
| V-GS-2 | Im Daten-Repo wird kein Schmelz- und kein Wetterlauf gelöscht: `glacier/v1/melt/` trägt alle Läufe seit dem 12.10., `melt/wx/` alle 24 seit dem 15.11. (106 MB im Arbeitsbaum). Der Producer kopiert nur die letzten 72 h in sein Paket, der Publisher löscht aber nichts (`GLACIER_POLICIES.melt` ist leer). Mit den neuen Feldern rund 6,2 MB je Lauf statt 4,4 MB. Mehrwert: das Repo wächst nicht um rund 25 MB am Tag. Skizze: Regel „älter als 72 h“ für `melt` und `melt/wx` im Publisher — löscht Dateien im Daten-Repo, Jans Entscheidung | offen |
| V-GS-3 | Die Schneefallgrenze hat nach +46 h Lücken auch an den 3-Stunden-Schritten und endet bei +115 h. Eine Höhensäule muss dort „keine Angabe“ zeigen; die Hälfte der 120 Stunden ist `null` | für die Anzeige-Phase |
| V-GS-4 | Der Vergleich der Regeln läuft im Spätherbst, wenn fast aller Niederschlag an den Gletschern Schnee ist (0,3–1,5 % am 21.11., 3,5–5,3 % am wärmeren 04.11.). Über den Sommer sagt er wenig. Skizze: die Vergleichsdatei weiterlaufen lassen (21 Tage Fenster) und das Urteil im Juni noch einmal lesen | offen |
| V-GS-5 | Die Breite der Spanne hängt an der gesetzten Korrelation; der Erwartungswert liegt an 6,6 % der nassen Gletscher-Tage außerhalb. Skizze: Korrelation an den Stationsreihen des Prüfstands messen (Tagessummen gegen Szenarien) | offen |
| V-GS-6 | Der Stunden-Niederschlag `p` steht auf 0,1 mm; leichter Schneefall unter 0,05 mm/h rundet auf null. `sn` je Stunde steht deshalb auf 0,01 mm. Eine Höhensäule sollte Summen aus `sn` bilden, nicht aus `p` × `s` | für die Anzeige-Phase |

## 6 Nach dem Push (22.11.)

Jan hat `main` am 21.11. abends gepusht (`93401022` auf `origin/main`). Geprüft am Live-Stand, nur lesend:

| Lauf | Workflow-Lauf | Schritt „Melt run“ | Ergebnis |
|---|---|---|---|
| 20:22 UTC | 44945980683, grün | 2 s, Publish übersprungen | kein rechnender Lauf (die Linie rechnet um 23, 05, 11, 17 UTC) |
| 23:22 UTC | 44961481945, grün | rechnet, veröffentlicht `2026112123` | `rules` ohne `spread` und ohne `phase.rule`, Zeilen ohne `pq`/`snq`/`gq`, `melt/wx/phase.json` 404, Statuszeile `weather` ohne `phase`, 27 Dateien / 4 422 798 B |

**V-GS-7 — der Producer des Schmelzlaufs kommt nicht von `main`.** `glacier-melt.yml` (wie `glacier-feed`, `-sat`, `-static`,
`-archiv`) liest `vars.GLACIER_PRODUCER_REF || 'feat/gletscher'`. Der Zweig `feat/gletscher` steht noch auf `origin`
(`01fec8f9`, 15.11., Vorfahr von `main`, 74 Commits zurück), also rechnet der Runner mit dem Producer vom 15.11.; nur
`glacier-stations.yml` hat `main` als Voreinstellung. §1 dieser Datei („erst in den Dokumenten, wenn `buscosun-web` gepusht ist“)
war damit unvollständig: ich habe den Namen der Variable gelesen, nicht den Zweig, auf den sie zeigt. Folge: die Schneefelder und
der Regelvergleich laufen erst, wenn die Variable `main` heißt oder der Zweig gelöscht ist (Jans Schritt, `MANUELLE-SCHRITTE.md`
§108.1); die 7 Tage zählen ab dann. Zwischen Zweig und `main` unterscheiden sich an gemeinsam genutzten Producer-Dateien nur
`glacier-publish.mjs` (Zeile `stations` dazu), `glacierContract.ts` und fünf Zeilen in `fusionRelease.ts`; `sat-scan.mjs`,
`feed.mjs` und `glacier-archive.mjs` sind gleich. Am lokalen Lauf
mit dem Producer von `main` waren die alten Felder Byte für Byte gleich dem Live-Lauf (§3).
