# Punktvorhersage 0–336 h — Phase PV0 (Diagnose und Plan)

> Stand 2026-09-05 · **Runde: Analyse, Spezifikation, Plan — kein Code.**
> Auftrag: die Punkt-Vorhersagekette von heute (~10 Tage, deterministisch) zu einer
> **rein punktbasierten, probabilistischen Vorhersage 0–336 h** ausbauen, ohne Backend, ohne
> kostenpflichtige Quellen, mit belegter Verifikation gegen MOSMIX / ICON-D2 / Klimatologie.

## 1. Die fünf Sätze, die den Rest bestimmen

1. **Die im Auftrag beschriebene Engine existiert nicht.** OI, Minimum-Varianz-Hintergrund und
   Multi-Modell-Bias-Korrektur wurden am 2026-08-22 vollständig zurückgebaut
   (`audit/rasterfusion-rueckbau.md`). Was am Punkt rechnet, ist ein handgesetzter
   Gewichts-Blend mit guter DACH-Physik und **ohne jede Verifikation**.
2. **Das Archivproblem ist zur Hälfte keins.** Beobachtungen (DE/AT/CH) und die globalen
   Modellarchive (ECMWF ab 2023-01-18, GEFS ab mindestens 2024-01-01) sind **rückwirkend frei
   verfügbar**. Ein Hindcast gegen Klimatologie, Persistenz, ECMWF und GEFS ist **sofort**
   möglich.
3. **Die andere Hälfte bleibt unlösbar.** Für **MOSMIX und ICON** gibt es kein öffentliches
   Archiv (gemessen: Rollfenster 48 Läufe / 8 Läufe). Ein Eigenarchiv wäre der einzige Weg —
   und ist mit J-3 („genauso wie ICON-D2", also mit Retention) bewusst **nicht** gewählt.
   ⇒ Ein rückwirkender MOSMIX-Vergleich findet nicht statt; der Vergleich läuft prospektiv
   im Modellvergleich (§2.0/§2.2).
4. **Das volle ECMWF-Ensemble ist kein Planungsbaustein.** Gemessen: ~0,65 MB je Member und
   Feld ⇒ **≈ 197 GB je Lauf** für 7 Variablen × 51 Member × 85 Schritte. Der Regelweg ist
   **GEFS-Mittel + Spread (≈ 191 MB/Lauf)** plus zwei deterministische ECMWF-Anker.
5. **Der größte sofort erreichbare Gewinn ist die Ehrlichkeit selbst.** Bei verschwindendem
   Skill ist eine kalibrierte Verteilung gegenüber dem besten Punktwert exakt um den Faktor
   $1/\sqrt2$ (**29,3 % CRPS**) besser — hergeleitet in `punktvorhersage-14tage/mathematik-spezifikation.md`
   §1.3. Das ist unabhängig davon, ob wir MOSMIX schlagen.

## 2. Jans Entscheidungen (2026-09-05) — der Auftrag ist damit deutlich enger

| # | Entscheidung | Wirkung |
|---|---|---|
| **J-1** | **Kein 14-Tage-Anspruch gegen MOSMIX.** Verglichen wird nur **so weit, wie MOSMIX überhaupt reicht** (gemessen: 246 h). Und geprüft wird **retrospektiv**: „hätte es bei den vergangenen Vorhersagen besser abgeschnitten?" | Die 12-Monats-Kampagne aus `verifikation.md` §7.1 entfällt als Gate. Der Vergleichsbereich endet bei 246 h. |
| **J-2** | **Kein neues Repo.** Ziel ist ein **mathematisch und physikalisch besseres Modell**; der Vergleich passiert im vorhandenen **Modellvergleich-Feature** (`src/confidence/`). **Keine langfristigen Tests.** | Das Kachel-Artefakt bekommt kein eigenes Zuhause ⇒ Langfrist (246–336 h) rückt hinter den Kern. Der Schattenbetrieb aus `retro-verifikation.md` §6 entfällt als Kampagne — seine Rolle übernimmt das Produkt-Feature. |
| **J-3** | **Alle MOSMIX-Läufe nach `buscosun-data`** — und von dort auch als **Eingang für die Berechnung von buscosun Fusion** nutzen. | Doppelter Gewinn: ersetzt die Fremdabhängigkeit BrightSky (privat betrieben, kein SLA), 0 Netlify-Bytes, alle DACH-Stationen auf einmal statt einer Nächste-Station-Abfrage — **und** das Archiv entsteht nebenbei, ohne eigene Kampagne. |
| **J-4** | **Meteostat-Lizenz später.** | `climaGrid.json` bleibt vorerst wie es ist. Für die stündliche Klimatologie wird trotzdem eine lizenzsichere Quelle gebraucht — das ist dann Teil von PV3, nicht eine Lizenzaktion. |
| **J-5** | **Darf sichtbar werden**, zuerst **im Modellvergleich** — „dort sieht man schon, ob es kurzfristig besser abschneidet". | Die laufende Messung wird zum Produkt statt zum Testlauf. |
| **J-6** | *(nicht beantwortet)* — volles ECMWF-ENS vs. GEFS-Mittel+Spread | Entfällt vorerst durch J-2: ohne Langfrist-Artefakt stellt sich die Frage erst wieder bei PV5. |
| **J-8** | **Der Algorithmus heißt im Projekt immer „buscosun Fusion"** (2026-09-06). | Verbindlich in Doku, Code-Kommentaren, Commits und UI — keine Umschreibungen. Der Ordner bleibt `src/pointForecast/fusion/`, die erwogene Umbenennung nach `predictive/` ist damit erledigt. Als Regel in `CLAUDE.md` §Sprache & Konventionen aufgenommen, samt Abgrenzung gegen `src/fusion/` (Rasterfusion der 2D-Karte). |

### 2.0 Präzisierung vom 2026-09-05 (zweite Runde)

| Aussage | Wirkung |
|---|---|
| „Bestes Punkt-**Fore- und Nowcast** aus mathematischer, physikalischer und meteorologischer Sicht" | Der Nowcast bekommt eine **eigene Phase PV2-N**; „meteorologisch" wird ein eigenes Arbeitspaket (PV3.8) statt einer Nebenbemerkung |
| „Für langfristige Tests in externen Repos fehlt mir die Zeit" | Keine Kampagne, kein zweites Repo. Alles Messbare muss **rückwirkend oder nebenbei** entstehen |
| „Nur MOSMIX zusätzlich in `buscosun-data`, **genauso nach dem Schema wie ICON-D2**" | MOSMIX wird eine weitere **Familie im Repack-Schema** (`runs/<lauf>/…`, `FAMILIES`, `index.json`, Commit-SHA, `REPACK_KEEP`). **Folge: kein Archiv** — alte Läufe werden geprunt. Ein rückwirkender MOSMIX-Vergleich ist damit dauerhaft ausgeschlossen. Die Release-Asset-Variante aus der ersten Runde ist hinfällig |
| „Am Ende soll buscosun Fusion bei *Vorhersage vs. tatsächlich* im Modellvergleich sehr gut abschneiden" | Das ist jetzt das **Abnahmekriterium der ganzen Linie** — und es hat eine Lücke: sie hängt daran, wie weit die Quellen zurückreichen — **nachrechenbar statt gespeichert**, §2.2–2.4 |

### 2.1 Zwei technische Klarstellungen zu J-3 und J-5

**J-3 — der Force-Push ist nicht das Problem, die Baumgröße ist es.**
`publish-repack.mjs` klont den Bestand vor jedem Publish und legt ihn als **neuen Wurzel-Commit**
wieder ab (`scripts/publish-repack.mjs:143–216`). Dateien außerhalb von `runs/` überleben also
sehr wohl. Was nicht funktioniert: bei ~4–5 MB Archiv pro Tag reißt der **Git-Baum** in ~3 Monaten
die **150-MB-Grenze von jsDelivr**, und jeder Repack-Publish klont und pusht das ganze Archiv mit.
⇒ Die ursprünglich vorgeschlagene Archiv-Ablage (Release-Assets) ist mit der Präzisierung
„genauso wie ICON-D2" **hinfällig**. Es bleibt **eine** Ablage:

| Zweck | Ablage in `buscosun-data` | Größe | Folge |
|---|---|---|---|
| **Client-Eingang** (aktuelle MOSMIX-Läufe) | Repack-Schema: `runs/<lauf>/…`, Eintrag in `FAMILIES`, `index.json` mit Commit-SHA, Retention `REPACK_KEEP` | ~1 MB/Lauf, ~4 MB bei 4 Läufen | unkritisch neben ~45 MB Repack |
| ~~Archiv~~ | **entfällt** | — | alte Läufe werden geprunt ⇒ **kein rückwirkender MOSMIX-Vergleich**, dauerhaft |

**J-5 — der Modellvergleich misst heute gegen die falsche Wahrheit.**
`src/confidence/hitRate.ts:8–10` sagt es selbst: „Ground Truth = Konsens der **Modell-Analysen**
je Stunde", bezogen über Open-Meteos Previous-Runs-API. buscosun Fusion ist bei h = 0 auf
**Stationsmessungen** verankert — gegen einen Modell-Analysen-Konsens gemessen entsteht ein
systematischer Vergleichsfehler, und zwar zu unseren Ungunsten. Für die Frage „schneidet unser
Modell besser ab?" muss die Wahrheit die **Messung** sein. Sie ist frei, lizenzsicher und
rückwirkend verfügbar (DWD POI 974 Stationen · GeoSphere `klima-v2-1h` · MeteoSchweiz OGD-SMN).
⇒ Die Umstellung der Wahrheitsquelle ist **Teil** der Modellvergleich-Integration, kein Extra.

### 2.2 Nachrechnen statt Speichern — und wie weit das trägt (gemessen 2026-09-05)

**Der Gedanke ist richtig und er ist der Kern der Sache.** buscosun Fusion ist kein Modell,
sondern eine **Rechnung** über Fremddaten (Modelle, Stationen, Radar, Höhe, Gelände). Das hat
eine technische Folge, die diese ganze Frage erst beantwortbar macht: **die Rechnung ist rein.**
`blendVariable`, `estimateLapseRate`, `terrainTempDeltaC`, `assembleNowcast` — alle ohne DOM,
ohne Netz, ohne Zufall (D-12, „Purity-Grenze"). Gleiche Eingaben ⇒ **bit-gleiche** Ausgabe.
Ein Nachrechnen ist also nicht „ungefähr wie damals", sondern **exakt damals**.

**Die Grenze ist nicht die Rechnung, sondern wie weit die Quellen zurückreichen.** Gemessen:

| Eingang | Wie weit zurück abrufbar | gemessen |
|---|---|---|
| Stationsmessungen (DE/AT/CH) | **Jahre** | CDC / GeoSphere `klima-v2-1h` (ab 1880) / MeteoSchweiz OGD-SMN |
| DEM, Gelände | statisch | — |
| MOSMIX_S | **48 h** (48 stündliche Läufe) | Verzeichnis-Listing |
| MOSMIX_L | **48 h** (8 Läufe) | Verzeichnis-Listing |
| ICON-D2 | **24 h** (8 Läufe × 3 h) | Verzeichnis-Listing |
| **AROME (GeoSphere)** | **≈ 15 h** — nur **6** `available_forecast_reftimes`, 2026-09-04T21:00 → 2026-09-05T12:00 | `nwp-v1-1h-2500m/metadata` |
| INCA-Nowcast | **nur jetzt** (Analyse-Archiv `inca-v1-1h-1km` hat ~14 Tage Verzug) | `docs/API.md` §4.1 |
| RADOLAN-RV | kurz — aber `radarHindcast.ts` rechnet ohnehin aus beobachteten Analysen | Code |

**Daraus die Antwort in einem Satz:** Ja, man kann die Quellen wieder hernehmen und neu rechnen —
**aber nur etwa 15 Stunden zurück in AT/CH, etwa 24 Stunden in DE**, weil AROME nur sechs Läufe
und ICON-D2 nur acht vorhält. Beschränkt man sich auf MOSMIX + Stationen, sind es 48 Stunden.

### 2.3 Was das für „Vorhersage vs. tatsächlich" bedeutet — J-7 schrumpft

| Lead in der Auswertung | Braucht Speicherung? |
|---|---|
| **bis ~15 h (AT/CH) bzw. ~24 h (DE)** | **nein** — vollständig nachrechenbar, rückwirkend, ab sofort, ohne ein einziges gespeichertes Byte |
| **1 Tag** | grenzwertig: in DE knapp machbar, in AT/CH nicht (AROME weg) |
| **3 Tage** (der zweite Lead in `hitRate.ts`) | **ja** — die Läufe von damals existieren nirgends mehr |
| **Nowcast 0–3 h** | **nein** — `radarHindcast.ts` erzeugt die Vorhersage aus beobachteten RADOLAN-Analysen bei T−Δ und prüft gegen T |

**J-7 lautet damit nicht mehr „dürfen wir ein Archiv anlegen", sondern:**

> Sollen in der Treffsicherheits-Auswertung **auch Leads über ~24 h** erscheinen?
> · **Nein** ⇒ es wird **nichts** gespeichert. Ein Job rechnet die letzten ~15–24 h nach,
>   vergleicht gegen die Messung und schreibt die Note. Fertig.
> · **Ja** ⇒ dann die kleine Variante: je Lauf ≈ 220 KB, ~4 Tage Haltezeit (~3,5 MB),
>   danach bleibt nur die Scorecard (~0,7 MB/Jahr). **Gespeichert werden die Noten, nicht die
>   Vorhersagen.**

### 2.4 Die Falle beim Nachrechnen, die alles wertlos machen würde

Beim Rekonstruieren einer 15 Stunden alten Vorhersage ist die **Stationsmessung** der
gefährlichste Eingang: Sie ist rückwirkend jahrelang abrufbar — man bekommt sie also *zu leicht*.
Füttert man die Rechnung mit den Messungen von **heute**, wird der `h = 0`-Anker zur Wahrheit,
und die „Vorhersage" sagt das Ergebnis voraus, das sie schon kennt. Das Resultat sähe
hervorragend aus und wäre wertlos.

⇒ Der Nachrechen-Pfad muss die Eingaben **hart auf `t₀` begrenzen** (`retro-verifikation.md` §1),
und der Verifier muss genau das prüfen — mit einer **Negativkontrolle**, die fehlschlagen *muss*,
wenn jemand versehentlich frischere Messungen durchreicht.

## 3. Dokumente dieser Runde

| Datei | Inhalt |
|---|---|
| [`punktvorhersage-14tage/analyse-fusion-14d.md`](punktvorhersage-14tage/analyse-fusion-14d.md) | Ist-Analyse: was der Code wirklich tut, was wiederverwendbar ist, was ersetzt gehört |
| [`punktvorhersage-14tage/datenquellen-matrix.md`](punktvorhersage-14tage/datenquellen-matrix.md) | Quelle × Variable × Lead × Auflösung × Zyklus × Latenz × Lizenz × Volumen, alles am 2026-09-05 gemessen |
| [`punktvorhersage-14tage/mathematik-spezifikation.md`](punktvorhersage-14tage/mathematik-spezifikation.md) | Zielfunktion, Modellwahl mit Begründung, verworfene Alternativen |
| [`punktvorhersage-14tage/verifikation.md`](punktvorhersage-14tage/verifikation.md) | Regime-Tabelle, Metriken, Splits, Signifikanz, Erfolg **und Misserfolg** |
| [`punktvorhersage-14tage/implementierungsplan.md`](punktvorhersage-14tage/implementierungsplan.md) | Architektur/Betrieb (§D) + Phasen 0–5 mit Akzeptanz- und Abbruchkriterien (§E) |
| [`punktvorhersage-14tage/retro-verifikation.md`](punktvorhersage-14tage/retro-verifikation.md) | As-of-Rekonstruktion, Archivfahrplan, Schattenbetrieb, Vorab-Registrierung |
| [`punktvorhersage-14tage/implementierung-pv3.md`](punktvorhersage-14tage/implementierung-pv3.md) | **PV3 — der gebaute Algorithmus**: Module, Kette, Gate GPV3 (148/148), die Befunde der drei Fachprüfungen und was daraus wurde, offene Punkte |

## 4. Messprotokoll — 2026-09-05, gegen die Live-Endpunkte

| # | Messung | Ergebnis |
|---|---|---|
| M-01 | MOSMIX_L Einzelstation 10488 (KMZ) | 18 953 B; KML 344 445 B; **247 Schritte, lückenlos stündlich**, 2026-09-05T10:00Z → 2026-09-15T16:00Z = **246 h**; **114** `elementName`; IssueTime 09:00Z |
| M-02 | MOSMIX_L Publikationslatenz | Lauf 09z → Datei 10:13 UTC ⇒ **+73 min** (Einzelfall) |
| M-03 | MOSMIX_L Takt / Retention | Takt **4×/Tag** (03/09/15/21 UTC), Retention **8 Läufe ≈ 48 h**; `all_stations` 82,5–83,5 MB, `single_stations` **6 046 Einträge** |
| M-04 | MOSMIX_L DACH-Abdeckung | AT 11035 → 200 (15 981 B), CH 06670 → 200 (18 020 B) ⇒ **AT/CH enthalten** |
| M-05 | MOSMIX_S | **stündlich**, Horizont 240, **37,0–37,4 MB/Lauf**, **49 Dateien ⇒ 48-h-Rollfenster**, nur `all_stations` |
| M-06 | DWD POI | **974** `*-BEOB.csv`, **42 Parameter**, **25 Zeilen ⇒ 24-h-Rollfenster**, ~7,2 KB; enthält AT/CH |
| M-07 | DWD CDC stündlich `recent` | **503** Stations-ZIPs (air_temperature), ~80 KB |
| M-08 | ICON-D2 Retention | **8 Läufe** (00…21); t_2m 98 Dateien/Lauf |
| M-09 | ICON-EPS global | t_2m **70 Schritte** (1 h ≤48, 3 h ≤120, 6 h ≤180), **~36,2 MB bz2 je Schritt** (alle Member in einer Datei) |
| M-10 | ECMWF IFS oper 0,25° | 184 Sätze/Schritt, Schritt gesamt **137,3 MB**, Feld `2t` **650 356 B** |
| M-11 | ECMWF IFS ENS `enfo-ef` | 8 500 Sätze, **ausschließlich `type: pf`, 50 Member — kein Kontrolllauf** (Schritt 0 und 24 geprüft); `2t` je Member 660 768 B; Schritte bis **360 h** |
| M-12 | ECMWF AIFS-ENS | `enfo-cf` + `enfo-pf` getrennt; 50 perturbierte Member; **6-stündlich**, bis 360 h; `2t` 623 502 B |
| M-13 | ECMWF-Lizenz | „Creative Commons CC-BY-4.0 licence and the ECMWF Terms of Use … may be redistributed and used commercially" (ecmwf.int/en/forecasts/datasets/open-data) |
| M-14 | S3 `ecmwf-forecasts` | Präfixe **ab 2023-01-18**; 20250905 mit `enfo`/`aifs-single` stichprobenhaft vorhanden |
| M-15 | S3 `noaa-gefs-pds` | 20240101 **und** 20250905 vorhanden, 20200101 nicht; `geavg`/`gespr` als eigene Produkte; 0,25° bis **f240**, 0,5° bis **f384** |
| M-16 | GEFS 0,5° Feldgröße | `TMP 2 m` bei f336 = **122 747 B**; Datei geavg f024 = 13,17 MB |
| M-17 | S3 `noaa-gefs-retrospective` | Präfix `GEFSv12/` vorhanden |
| M-18 | GeoSphere `klima-v2-1h` | **823 AT-Stationen** mit lat/lon/Höhe; **1880-04-01 → Abrufzeitpunkt**; tl, ff/ffx, dd, rf, rr, p, cglo, so_h + `*_flag` |
| M-19 | MeteoSchweiz OGD-SMN | STAC-Collection, `license: CC-BY`; je Station `_h_now`, `_h_recent`, `_h_historical_<Dekade>` |
| M-20 | Meteostat-Lizenz | **nicht belegbar** — zwei Terms-Abrufe ohne auswertbaren Lizenztext |
| M-21 | **AROME-Rückblickfenster** (GeoSphere `nwp-v1-1h-2500m/metadata`) | **nur 6 `available_forecast_reftimes`**: 2026-09-04T21:00 → 2026-09-05T12:00 ⇒ **≈ 15 h**, 3-stündlich; `forecast_length` 61 |
| M-22 | GeoSphere-Gitter-Datensätze | 27 Einträge; **kein** historisches AROME-Forecast-Produkt — `grid/historical/*` sind Analysen/Klima (INCA, SPARTACUS, SNOWGRID, WINFORE) |

## 5. Die drei größten Risiken

| # | Risiko | Warum es das Vorhaben trifft | Gegenmaßnahme |
|---|---|---|---|
| **R1** | *(mit J-1/J-2 entschärft, aber nicht weg)* **Der Retro-Vergleich gegen MOSMIX braucht MOSMIX-Läufe, die es rückwirkend nicht gibt.** | J-1 verlangt genau diesen Rückblick („hätte es besser abgeschnitten?"). Gegen Klimatologie, Persistenz, ECMWF und GEFS ist er **sofort** möglich (Archive ab 2023-01-18 bzw. 2024). Gegen **MOSMIX** ist er es nicht — dort beginnt der Rückblick am Tag, an dem J-3 in Betrieb geht, und wächst dann täglich. | J-3 löst es nebenbei: Die MOSMIX-Läufe wandern ohnehin nach `buscosun-data`, weil der Client sie braucht. Das Archiv ist damit **Nebenprodukt statt Kampagne** — kein „langfristiger Test", nur ein Ordner, der voller wird. Der MOSMIX-Rückblick wird ausgewertet, wenn genug da ist; er blockiert nichts. |
| **R2** | **Ein kalibriert *aussehendes* Produkt auf einem unveränderten, unverifizierten Blend.** | Quantile, PIT-Diagramme und Trajektorien erzeugen den Eindruck wissenschaftlicher Fundierung. Wenn darunter dieselben 45 handgesetzten Konstanten liegen, ist das Produkt **unehrlicher** als heute — heute sagt es wenigstens nur „confidence 0,42". | Reihenfolge umdrehen: Phase 0 misst **zuerst die heutige Engine** und veröffentlicht die Zahl, auch wenn sie schlecht ist. Kein Verteilungs-UI vor bestandenem Kalibrierungs-Gate (PIT + Spread-Skill sind **gate-blockierend**, unabhängig vom CRPS). |
| **R3** | **Stille Veralterung der Artefaktkette** — und mit J-3 wird sie **produktkritisch**. | V-BW-58 ist der belegte Präzedenzfall: Einmal-Push ohne Wiederholung, drei Fehlschläge an einem Tag, ein ausgefallener Lauf, sechs Stunden alte Karte — **ohne Alarm**. Bisher hing daran ein Kartenlayer. Sobald MOSMIX über `buscosun-data` läuft (J-3), hängt daran die **Punktvorhersage aller Features** (Panel, Event, Route, 3D, Benachrichtigungen). Ein stiller Ausfall wäre dann kein Schönheitsfehler. | Publisher **mit** Commit-back-Retry (Muster T2c aus `warm-grib.yml`), externer HTTPS-Wächter (Muster `health.yml`), **Client-Alterssperre**, Archiv-Lückenwächter — und, weil hier die Kernfunktion dranhängt: **BrightSky bleibt als benannter Rückfallweg im Code**, nicht nur auf dem Papier (dieselbe Regel wie „Netlify bleibt der Fallback" in D-31). |

## 6. Verbesserungskatalog (D-28) — V-PV-01 … V-PV-15

> `improvements.md` fehlt im Arbeitsverzeichnis (`CLAUDE.md`-Statusblock); die Einträge stehen
> bis zu dessen Wiederherstellung hier.

**V-PV-01 — Die Punktvorhersage ist nie gegen Beobachtungen geprüft worden.**
*Mehrwert:* buscosun weiß heute nicht, ob seine wichtigste Zahl besser oder schlechter ist als
die des DWD. Jede Produktentscheidung darüber ist ein Bauchgefühl.
*Umsetzung:* `verify:pv-score` (Phase 0.5) + Beobachtungsarchiv; erste Messgröße ist die
**heutige** Engine, nicht die künftige.

**V-PV-02 — `confidence` sieht aus wie eine Wahrscheinlichkeit, ist aber keine.**
*Mehrwert:* Nutzer lesen „62 %" als Eintrittswahrscheinlichkeit. Tatsächlich ist es
Quellenübereinstimmung × gesetztem Lead-Faktor. Das ist der Kern des Ehrlichkeitsprinzips.
*Umsetzung:* Entweder umbenennen (z. B. „Quellenübereinstimmung") — sofort, ein Textdiff — oder
durch echte Quantile ersetzen (Phase 1). **Die Umbenennung sollte nicht auf Phase 1 warten.**

**V-PV-03 — `SKILL_DECAY` und `leadWeight()` behaupten Skill, statt ihn zu messen.**
*Mehrwert:* `temperature: τ = 160 h, floor = 0,45` sagt, die Temperaturvorhersage sei bei Tag 14
noch zu 45 % sicher. Ob das stimmt, entscheidet, wie weit das Produkt überhaupt gehen darf.
*Umsetzung:* Ersatz durch gefittetes $\rho(\tau)$ (Phase 2.5); vorher die Zahlen als Setzung
kennzeichnen.

**V-PV-04 — Für MOSMIX und ICON existiert kein Archiv, und die Zeit läuft.**
*Mehrwert:* Jeder Tag ohne Archiv-Cron verschiebt den einzigen Beleg, der den Auftragsanspruch
tragen kann, um einen Tag nach hinten. Kosten: ≈ 19 MB/Tag.
*Umsetzung:* **entschieden am 2026-09-05 (J-3): wird nicht gebaut.** MOSMIX kommt nach dem
ICON-D2-Schema mit Retention nach `buscosun-data` — Client-Eingang statt Archiv. Der Eintrag
bleibt als Begründung stehen, warum es später kein MOSMIX-Hindcast geben wird, und ist damit
**geschlossen, nicht offen**.

**V-PV-05 — GRIB-Teilbereich für räumliche Ausschnitte (Forschung).**
*Mehrwert:* Ein DACH-Ausschnitt statt eines Weltfelds würde den Ensemble-Ingest um Faktor ~100
verbilligen und ECMWF-ENS überhaupt erst planbar machen.
*Umsetzung:* Bei DRT 0/1 aus dem Bit-Offset der Zielzeilen einen Teil-Range berechnen; bei
DRT 42 die AEC-RSI-Blockgrenzen nutzen. **Explizit kein Plan-Baustein**, sondern ein Experiment.

**V-PV-06 — `npm run capture` zeigt auf ein gelöschtes Skript.**
*Mehrwert:* Der Alias `capture` verweist auf `scripts/capture-fixture.mjs`, das beim Rückbau
entfernt wurde (geprüft: Datei existiert nicht). Ein Alias, der bricht, kostet die nächste
Session Zeit.
*Umsetzung:* Alias entfernen — Ein-Zeilen-Diff in `package.json`.

**V-PV-07 — `public/params/background-v1.json` (164 KB) hat keinen Leser, und seine Datenquelle
ist lizenzoffen.**
*Mehrwert:* Zwei getrennte Themen an einer Stelle. (a) Die Datei wird ausgeliefert und von
niemandem gelesen (`grep` über `src/` und `scripts/`: kein Treffer) — 164 KB toter Ballast.
(b) Wichtiger: `public/climaGrid.json` stammt laut eigener `meta.source` aus **Meteostat**,
dessen Lizenz in dieser Runde **nicht belegt werden konnte**. Ein ausgeliefertes Artefakt aus
einer Quelle mit unklarer Lizenz ist genau das, was `CLAUDE.md` („keine unklare Lizenz")
ausschließt.
*Umsetzung:* (a) auf Jans Wort entfernen (er hatte das Liegenlassen 2026-08-22 ausdrücklich
gewünscht — daher Rückfrage, kein Alleingang). (b) Meteostat-Lizenz belegen; falls NC oder
unklar: `climaGrid.json` aus DWD CDC + GeoSphere `klima-v2-*` + MeteoSchweiz OGD-SMN neu bauen
(alle CC BY 4.0, alle rückwirkend verfügbar — der Ersatz ist verfügbar, nicht hypothetisch).
**Nachtrag 2026-09-07 zu (b):** `dev.meteostat.net/license` nennt **CC BY 4.0** mit Attribution
an Meteostat und die Datenlieferanten (abgerufen 2026-09-07, `FUSION_IMPROVEMENTS.md` §3.13).
Die Lizenzfrage ist damit **überholt**: `climaGrid.json` ist nicht blockiert. Was bleibt, ist
die fachliche Grenze — Tagesauflösung, σ aus Tagesmittel-Residuen, 6 Stationen über 1500 m
(Audit M-2) — und die wird mit der stündlichen Klimatologie aus CDC/`klima-v2-1h`/SMN gelöst
(`FUSION_IMPROVEMENTS.md` #13), nicht mit einer Lizenzaktion. (a) bleibt offen.

**V-PV-08 — Der Wolken-Split 55/30/15 wird als Messwert dargestellt.**
*Mehrwert:* MOSMIX liefert eine Gesamtbedeckung; die drei Schichten low/mid/high entstehen im
Client durch feste Faktoren (`sampleSources.ts:211–219`). Das Produkt zeigt sie wie gemessene
Größen. Für Astro-/Foto-Nutzung ist die Schichtangabe entscheidungsrelevant.
*Umsetzung:* Kennzeichnen als abgeleitet (sofort) und für Quellen mit echten Schichten
(ICON-D2 `clc*`, AROME) die nativen Kanäle bevorzugen (Phase 3).

**V-PV-09 — MOSMIX-Samples trugen ihre Distanz nie (vorbestehender Defekt, behoben).**
*Mehrwert:* `brightSkyToHourSamples` setzte `distanceMeters: haversine(station, station)` = 0,
mit dem Kommentar „Distanz vom Abfragepunkt wird anderswo gerechnet" — was nirgends geschah.
Eine MOSMIX-Station kann 30 km entfernt und 800 m höher liegen; das Ergebnis behauptete
Ko-Lokation. Im Altpfad blieb das folgenlos (beide Leser sind auf `family === 'obs'`
gegattert), für jede geometrische Bewertung ist es aber die Grundlage.
*Umsetzung:* erledigt in PV3 — die Funktion nimmt jetzt optional die Abfrageposition und
rechnet die echte Distanz. Ohne die Parameter unverändertes Verhalten.

**V-PV-10 — `snowLine` ist die einzige Variable ohne Verteilung.**
*Mehrwert:* Die Schneefallgrenze kommt heute nur aus AROME (AT/CH) und bleibt in DE null.
Die Fusion kann sie aus Temperatur, Feuchte und Lapse-Rate **selbst** ableiten
(`meteo.impliedSnowLineM`) — damit hätte auch DE eine Schneefallgrenze, und sie wäre mit der
Phasenwahrscheinlichkeit konsistent statt eine zweite, unabhängige Aussage.
*Umsetzung:* in `fuseHour` ergänzen und gegen die AROME-Angabe verifizieren, wo beide
vorliegen — das ist zugleich der Test, ob die abgeleitete Grenze taugt.

**V-PV-11 — Die ACC-Kurve konnte Kurzfrist und Langfrist nicht trennen (behoben 2026-09-06).**
*Mehrwert:* Mit einer einzigen Zeitskala ρ₀·exp(−(τ/T)^k) war jede Verbesserung im
Kurzfristbereich automatisch eine Verschlechterung im Langfristbereich. Konkret gemessen:
die meteorologisch richtige Verkürzung von T für Feuchte und Bewölkung drückte
ρ(336 h) auf **0,002** — der Tag-14-Bereich war damit rechnerisch tot, ohne dass eine
einzelne Zahl falsch gewesen wäre. Die zweite Zeitskala (großräumiges Regime) trennt die
beiden Enden und macht sie unabhängig einstellbar.
*Umsetzung:* erledigt, `priors.ts` `AccCurve.w` / `tauSlowH`. **Offen bleibt der
Kalibrierpunkt:** `w = 0,18` und `T_slow = 500 h` sind Priors, keine Messwerte; sie zu
messen braucht das Archiv aus PV1.

**V-PV-12 — GFS liefert Taupunkt und Böe bis f384, geholt wurden sie nie (behoben 2026-09-06).**
*Mehrwert:* Die Feuchte endete bei 229 h — nicht an einer Modellgrenze, sondern weil zwei
Felder aus einer Datei, die der Client ohnehin liest, nicht angefragt wurden. Nachgemessen
am `.idx` von `gfs.tHHz.pgrb2.1p00.fFFF` (2026-09-05, alle vier Läufe): `:DPT:2 m` und
`:GUST:surface` sind bei f240, f336, f372 und f384 vorhanden.
*Umsetzung:* erledigt, `gfsPoint.ts`; Kosten 135 → 189 Range-Abrufe, und nur bei Anfragen
über 240 h.

**V-PV-13 — Jenseits des letzten Modellhorizonts wurde vorhandenes Wissen weggeworfen (behoben 2026-09-06).**
*Mehrwert:* Die Fusion gab `null` zurück, sobald keine Quelle mehr trug — obwohl die
Klimatologie als Prior fertig vorlag. Eine Lücke auszugeben, wo man etwas weiß, ist nicht
ehrlicher, sondern nur ärmer. Jetzt kommt die Klimatologie heraus, sichtbar als
`climatologyOnly` markiert, und die Zeitachse hängt nicht mehr davon ab, wann die letzte
Quelle endet.
*Umsetzung:* erledigt, `fuse.ts`. Die Grenze bleibt scharf: **ohne echte Klimatologie
weiterhin `null`** — die festen Rückfallkonstanten (8 °C, 30 % Nasstage) sind ein
legitimer Anker für die Schrumpfung, aber als alleinstehende Antwort eine erfundene Zahl.

**V-PV-14 — `climatologyOnly` wird noch nirgends angezeigt.**
*Mehrwert:* Der Marker existiert und ist korrekt gesetzt, aber er erreicht bisher nur den
Datenpfad (`PointForecastHour.fusion`). Solange keine Oberfläche ihn liest, sieht eine
reine Klimatologie im Produkt genauso aus wie eine Vorhersage — und das ist genau der
Fall, den D-04 (Ehrlichkeit) verbietet. Der Marker ist erst dann eine Verbesserung, wenn
man ihn sieht.
*Umsetzung:* im jeweiligen Consumer eine sichtbare Kennzeichnung („nur Klimatologie —
keine Modellaussage mehr") an Kurve und Kachel; Wortlaut und Ort gehören zur UI-Phase,
nicht in die Engine. **Der wichtigste offene Punkt dieser Linie.**

**V-PV-15 — Die T/Td-Korrelation ist gesetzt, nicht gemessen.**
*Mehrwert:* Sie bestimmt die Breite der abgeleiteten RH fast allein (die beiden partiellen
Ableitungen haben entgegengesetzte Vorzeichen, der Kreuzterm zieht ab). Mit
Unabhängigkeit — dem scheinbar konservativen Weg — kam σ(RH) = 44 % heraus, mit
0,55/0,88 kommen 14,5 % heraus. Beide Zahlen sind Annahmen; die Größenordnung ist an der
klimatologischen RH-Streuung (~15 %) plausibilisiert, nicht verifiziert.
*Umsetzung:* aus Stationspaaren (T, Td) je Vorlauf empirisch bestimmen — geht mit
demselben Archiv wie V-PV-01/03 und ist dort ein Nebenprodukt, kein eigener Aufwand.

**V-PV-16 — Externes Audit von buscosun Fusion (2026-09-07): 22 Befunde, vier davon behoben.**
*Mehrwert:* Das Audit (`FUSION_AUDIT.md`, Repo-Wurzel) hat am echten Modul nachgerechnet, wo
die Kette die Wirklichkeit verfehlt — nicht in der Mathematik, sondern an ihren Rändern: der
Stationsanker rechnete Wertpersistenz (bis 1,4 K Tageszeit-Bias bei h = 2), ein fehlendes
`climaGrid.json` ergab stille 8-°C-Vorhersagen, MOSMIX wurde als rohes Modell doppelt gedämpft
(−30 % Anomalie bei Tag 7), der Taupunkt kam ohne Höhenkorrektur (+5 %-Punkte RH). Dazu der
konzeptionelle Befund: in DE ist die „Fusion" ab h ≈ 6 eine Ein-Quellen-Schrumpfung (nur MOSMIX).
*Umsetzung:* K-1, K-3, H-1, H-2 **behoben 2026-09-07** (Gate GPV3c 187/187,
`punktvorhersage-14tage/implementierung-pv3.md` §9). Offen und priorisiert in
`FUSION_IMPROVEMENTS.md` §2: K-2 (Niederschlagsmengen werden durch die Gauß-Schrumpfung im
log1p-Raum zerdrückt — der wichtigste offene Punkt der Engine), H-3…H-7, M-1…M-12; Messplan in
`FUSION_VERIFICATION.md` (V-A Nachrechnen 0–24 h gegen Stationen zuerst).
**Nachtrag 2026-09-07:** K-2 umgesetzt (`implementierung-pv3.md` §10, Gate GPV3d 208/208).

**V-PV-17 — Die Niederschlags-Priors von K-2 sind gesetzt, nicht gemessen.**
*Mehrwert:* Seit K-2 tragen drei neue Prior-Blöcke die Niederschlagsaussage: die
Auftretens-ACC-Kurven `ACC.precipOcc` (Nass/Trocken-Skill je Familie und Lead), die
Nassstunden-Klimatologie `PRECIP_WET_CLIMA` (Lognormal, Median 0,6 mm/h, q90 3,2, q99 12) und
der Tail-Prior `PRECIP_OCC_TAIL` (starke Signale sind verlässlichere Nass-Aussagen). Sie
entscheiden P(nass) und die bedingte Streuung fast allein; die q90-Werte (9,8 mm/h bei einer
5-mm/h-Vorhersage) sind entsprechend breit. Ob das kalibriert ist, weiß niemand.
*Umsetzung:* alle drei aus Stationsstunden schätzen — die Nassstunden-Klimatologie je
Station/Höhenband aus DWD CDC / GeoSphere `klima-v2-1h` / SMN (dasselbe Archiv wie V-PV-01);
die Auftretens-Skills als tetrachorische Korrelation Vorhersage-nass × beobachtet-nass je
Lead, stratifiziert nach Menge (das misst den Tail-Prior direkt); die bedingte Mengen-ACC
nur an gemeinsam nassen Stunden. Gate: Reliability-Diagramm der P(nass) auf der Diagonale
und PIT der Hurdle-Verteilung flach (`FUSION_VERIFICATION.md` §3). **H-4** (Tobit-Varianz
25 % zu schmal) bleibt offen und sitzt jetzt in der Auftretensstufe.

**V-PV-18 — Die Fusion ist an Messungen gemessen doppelt überkonfident; σ_c und ρ₀ müssen aus
den V-A-Daten kommen.**
*Mehrwert:* Der erste Nachrechen-Schnappschuss (`verify:pv-score`, 2026-09-07, 111 Stationen,
`implementierung-pv3.md` §11) zeigt für die Temperatur Spread/Skill 0,50–0,60 und PIT-Ränder
0,42–0,51 (Soll 1,0 bzw. 0,20): die Intervalle sind halb so breit wie die Fehler. Ursache ist
benannt: σ_c stammt aus dem Tagesmittel-Residuum des Klimagrids (Audit M-2), ρ₀ = 0,985 für
MOSMIX ist zu hoch. Ein kalibriert *aussehendes* Produkt mit halbierten Intervallen ist genau
das Risiko R2 aus §5. Dazu: Wind-Bias +0,23…+0,35 m/s (Prior zu windig), Td/Böe zu breit.
*Umsetzung:* Fit-Skript auf den Scorecard-Datensätzen — stündliche Anomalie-Streuung je Station
und Jahreszeit, ρ(τ) je Familie aus den MAE-Reihen, Wind-Klimatologie aus den Stationsmitteln;
Ergebnis als `params/pv-*.json`, das `priors.ts` überlagert (die Datei ist dafür gebaut). Gate:
Spread/Skill in [0,85; 1,20], PIT-Ränder 0,15–0,25 über ≥ 2 Wochen Scorecards.

**V-PV-19 — Der Altpfad (das Produkt) ist in den ersten sechs Stunden 2,3-mal schlechter als
rohes MOSMIX.**
*Mehrwert:* Gemessen an 2 720 Datensätzen: Altpfad-T MAE **2,03 K** (Bias −0,80) gegen 0,89 K
für das MOSMIX, das er verrechnet. Die Station geht mit Gewicht 5,0 und Halbwertszeit 2,5 h als
**Wert**-Persistenz in den Blend (`leadTimeWeights.ts:36-44`) — derselbe Fehler, den K-1 in der
Fusion behoben hat, nur größer, weil das Gewicht höher ist. Das ist der Wert, den Panel, Event,
Route und Benachrichtigungen heute zeigen.
*Umsetzung:* zwei Wege, beide klein: (a) das Obs-Gewicht auf ~1,5 mit Halbwertszeit ~1 h
zurücknehmen, (b) den Anker wie in K-1 als Anomalie gegen die Stundenklimatologie führen.
Beides ändert das sichtbare Produkt ⇒ **Jans Entscheidung**; der Harness misst beide Varianten
vorher (Altpfad-Replikat in `verify-pv-score.mjs`).
**Entschieden und umgesetzt 2026-09-08 (Jan: „setz das um"):** dritter Weg — **Innovations-
Persistenz** (`src/pointForecast/anchor.ts`): Modell + (Messung − Modell, altersgewichtet über
die letzten 6 h) · e^{−h/τ}. Default im Produkt, Kill-Switch `?anchor=value`. Gemessen an
denselben 111 Stationen: T 1–6 h **2,18 → 0,92 K** (MOSMIX 0,90), Bias −0,62 → +0,05; Td
1,05 → 0,70 (besser als MOSMIX 0,74); Wind 0,78 → 0,69; Böe 1,22 → 0,96. Gate GPV3f 222/222
(`implementierung-pv3.md` §12). Die Historie kommt ohne Archiv: BrightSky (Messungen +
laufender MOSMIX-Lauf per `source_id`), TAWES-Historie (ein Aufruf), SMN-Tagesdatei.

**V-PV-20 — Der INCA-Punktabruf hat keine Frist und wird bei wiederholten Abfragen serverseitig
langsam (AT-Pfad bis 12 s).**
*Mehrwert:* Beim Nachmessen von GPV3f (`implementierung-pv3.md` §12, Protokoll) trug der
INCA-Punktabruf (`timeseries/forecast/nowcast-v1-15min-1km`, `sampleSources.ts:336`) allein 9,3
bzw. 11,7 s der AT-Antwort — in beiden Anker-Modi, also unabhängig vom Anker; per curl dieselbe
URL in Folge 0,33 → 1,78 → 3,30 s. Der Abruf steht im Pflicht-`Promise.all` ohne Frist, ein
langsamer INCA hält damit die gesamte Punktvorhersage in AT auf. Die Stationshistorie hat seit
GPV3f eine 1,5-s-Frist (`Promise.race`); INCA nicht.
*Umsetzung:* (a) INCA wie die Stationshistorie hinter eine Frist legen (2–3 s, danach ohne
Nowcast weiterrechnen — der Blend kennt fehlende Quellen), oder (b) den Punkt aus dem
INCA-Bild im CDN-Spiegel lesen, das der Regenradar-Pfad bereits holt (`audit/bandbreite.md`),
statt den GeoSphere-Zeitreihen-Endpunkt je Punkt zu fragen. Klein; ändert kein Ergebnis, nur
die Wartezeit.

## 7. Was diese Runde bewusst **nicht** liefert

- **Keinen Code** (Auftragsregel §10).
- **Keine Skill-Zahlen aus der Literatur.** Die Verfahren sind benannt; ihre berichteten Gewinne
  sind auf dieses Archiv erst nach eigener Messung übertragbar und werden deshalb nicht zitiert.
- **Keine Aussage über die exakte Zahl der DACH-MOSMIX-Stationen** — dafür ist die 82,6-MB-
  Gesamtdatei einmalig auszuwerten (WP 0.1). Bis dahin ist „~250" eine Setzung.
- **Keine gemessene Actions-Laufzeit.** Alle Ingest-Zeiten in `implementierungsplan.md` §D.3
  sind gerechnet; WP 0.4 misst sie.

## 8. Nächster Schritt

Vor jeder Umsetzung: **Jans Entscheidungen J-1 … J-6** in
[`punktvorhersage-14tage/implementierungsplan.md`](punktvorhersage-14tage/implementierungsplan.md) §E.2.
Zwei davon sind STOPP-&-FRAGEN-Zonen nach `CLAUDE.md` (neue Crons, neue Daten-Repos), eine ist
eine Lizenzfrage mit Wirkung auf ein bereits ausgeliefertes Artefakt.
