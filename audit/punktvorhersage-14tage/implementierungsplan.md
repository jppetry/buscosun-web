# Architektur, Betrieb und Implementierungsplan

> Stand 2026-09-05 · Phase PV0 · **kein Code in dieser Runde**
> Aufwände sind **Schätzungen** in Arbeitstagen (AT) und als solche gekennzeichnet.

---

# §D — Architektur & Betrieb (ohne Backend)

## D.1 Die Grundentscheidung: was rechnet wo

| Ort | Rechnet | Warum dort |
|---|---|---|
| **GitHub Actions (offline)** | Ensemble-Ingest, DACH-Extraktion, Quantilbildung, Training/Kalibrierung, Archivpflege | Egress kostenlos, Rechenzeit vorhanden, keine Nutzerlatenz; die einzige Stelle, an der ein 190-MB-Ensemble-Ingest überhaupt möglich ist |
| **Statische Artefakte (Daten-Repo → jsDelivr)** | Quantil-Kacheln, Koeffizientenfelder, Schaake-Vorlagen, Klimatologie | zählt nicht auf das Netlify-Budget (D-31), unveränderlich per Commit-SHA adressierbar |
| **Browser** | Punktauswertung: Interpolation, Höhen-/Geländekorrektur, Anwenden der Koeffizienten, Blend, Trajektorien-Rekonstruktion, Beobachtungsanker | reine Arithmetik auf bereits geladenen Daten; kein Modell-Runtime nötig |

**Verworfen: ONNX-Modell im Browser.** Das wäre die achte Runtime-Dependency (D-06), brächte
ein Modellformat mit eigenem Lade- und Speicherprofil auf iPhone-Klasse-Geräten mit — und löst
ein Problem, das wir nicht haben: die gewählten Verfahren (§4/§5 der Mathematik-Spezifikation)
sind **lineare bzw. stückweise lineare Auswertungen weniger Koeffizienten**. Ein
Koeffizientenfeld + 30 Zeilen Arithmetik ist kleiner, schneller und prüfbarer als jede
Inferenz-Laufzeit. Sollte Phase 3 ein Gradient-Boosting-Modell erzwingen, werden dessen Bäume
als **kompakte JSON-Struktur** ausgeliefert und im Client ausgewertet (ein Baumdurchlauf ist
trivial) — auch dann kein Framework.

## D.2 Das Artefakt: Kachel statt Bild

Das bestehende Repack-Muster (D-31) liefert **PNG-Raster**, weil die Karte das ganze Bild
braucht. Hier ist die Zugriffsform eine andere: **eine Punktabfrage braucht genau eine Zelle**.
Ein PNG zwingt zum Laden des ganzen Bildes; deshalb hier **eine Datei je Kachel**.

**Geometrie**

| Größe | Wert | Herleitung |
|---|---|---|
| DACH-Ausschnitt | lng 5,5–17,5 · lat 45,5–55,5 | `DACH_VIEW.bounds`, bestehende Konvention |
| Kachelraster | 0,25° → **48 × 40 = 1 920 Kacheln** | entspricht der ECMWF/GEFS-Auflösung; feiner wäre Schein-Auflösung |
| Leads | stündlich 0–48 (49) + 3-stündlich bis 144 (32) + 6-stündlich bis 336 (32) = **113 Stützstellen** | folgt den Schrittrastern der Quellen |
| Variablen | T2m, Td2m, u10, v10, Böe, Niederschlag, Bewölkung = **7** | Reihenfolge s. `verifikation.md` §3 |
| Werte je Zelle | q10/q25/q50/q75/q90 + Mittel = **6** | 5 Quantile decken die Produktfragen; mehr kostet linear |

**Volumen (gerechnet, nicht gemessen)**

```
je Kachel : 113 × 7 × 6 = 4 746 Werte
            int16 →  9,5 KB   ·   int8 mit Skala je (Var, Lead) →  4,8 KB
je Lauf   : 1 920 Kacheln × 9,5 KB ≈ 18,2 MB   (int8: ≈ 9,1 MB)
Retention 4 Läufe ≈ 73 MB (int16) bzw. 36 MB (int8)
Client    : 1 Kachel ≈ 5–10 KB  +  Koeffizienten + Schaake-Vorlage (≈ 20–50 KB, einmalig)
```

> **Konsequenz — Fassung nach J-2/J-3 (2026-09-05):** Ein eigenes Repo dafür ist **abgelehnt**.
> Damit gilt der Rahmen von `buscosun-data`: neben ~45 MB Repack passen bis zur
> **150-MB-jsDelivr-Grenze** realistisch ≤ 20 MB je Lauf bei Retention 2–4 ⇒ **nur die
> int8-Variante (≈ 9,1 MB/Lauf) ist tragfähig**, die int16-Variante nicht.
> Der Force-Push ist dabei nicht das Hindernis: `publish-repack.mjs` klont den Bestand vor jedem
> Publish und legt ihn als neuen Wurzel-Commit wieder ab (`scripts/publish-repack.mjs:143–216`),
> Dateien außerhalb von `runs/` überleben also. Das Problem ist allein die **Baumgröße**.
> Dieser ganze Abschnitt ist damit **kein Teil des Hauptpfads mehr**, sondern die ausgearbeitete
> Option für **PV5** — und wird erst aufgerufen, wenn PV3 trägt.
>
> **Was stattdessen zuerst gebaut wird** (PV1, J-3 präzisiert 2026-09-05): der MOSMIX-Auszug
> als **weitere Familie im bestehenden Repack-Schema** — `runs/<lauf>/…`, Eintrag in `FAMILIES`,
> `index.json` mit Commit-SHA, Retention `REPACK_KEEP`. Kein zweiter Publish-Pfad, keine
> Release-Assets: die frühere Archiv-Variante ist mit „genauso wie ICON-D2" hinfällig, und
> damit gibt es **kein MOSMIX-Archiv** (s. PV1).

**Zusätzliche Artefakte**

| Datei | Inhalt | Größe (geschätzt) | Rhythmus |
|---|---|---|---|
| `params/pv-emos-vN.json` | EMOS/Quantil-Koeffizienten je Variable × Lead-Bin × Geländeklasse | 50–300 KB | wöchentlich |
| `params/pv-blend-vN.json` | Spline-Knoten der Blend-Gewichte | < 50 KB | wöchentlich |
| `params/pv-rho-vN.json` | $\rho(\tau)$ je Variable × Saison × Geländeklasse | < 20 KB | monatlich |
| `params/pv-clima-vN.json` | stündliche Klimatologie (harmonisch), **aus lizenzsicheren Beobachtungen** | ~200–400 KB | jährlich |
| `params/pv-shuffle-vN.json` | Schaake-Vorlagen (Datums-IDs je Cluster × Saison) | < 50 KB | jährlich |

## D.3 Ingest-Budget in Actions (gerechnet aus den Messungen von `datenquellen-matrix.md`)

| Job | Rechnung | Download | Anfragen |
|---|---|---|---|
| GEFS `geavg`+`gespr` 0,5°, 7 Var, 105 Schritte | 105·2·7·0,13 MB | **≈ 191 MB** | ~1 470 Range-Abrufe |
| ECMWF HRES 0,25°, 7 Var, 85 Schritte | 85·7·0,65 MB | ≈ 387 MB | ~595 |
| ECMWF AIFS-single, dito | dito | ≈ 387 MB | ~595 |
| **Summe je Lauf** | | **≈ 0,97 GB** | ~2 660 |

Bei zwei Läufen pro Tag (00z/12z) sind das ~2 GB/Tag. Die Dekodierzeit ist der zweite Posten:
~2 660 GRIB-Nachrichten mit 0,26–1,04 Mio. Punkten; bei geschätzt 20–40 ms je Nachricht sind
das **1–2 min reine Dekodierung**. Der Rest ist Netz.
**Diese Zahlen sind gerechnet, nicht gemessen** — Arbeitspaket 0.4 misst sie in einem echten
Actions-Lauf, bevor irgendetwas darauf geplant wird.

**Warum 2×/Tag statt 4×:** Der Kachel-Artefakt bedient Leads ≥ 48 h. Zwischen 00z und 06z
ändert sich die Aussage für Tag 5–14 kaum; der halbe Aufwand ist der bessere Handel. Messbar
zu prüfen (CRPS mit 00z/12z vs. alle vier Läufe) — falls der Unterschied signifikant ist, wird
aufgestockt.

## D.4 Update-Kaskade

| Lead | Quelle zur Laufzeit | Takt | Wer rechnet |
|---|---|---|---|
| 0–2 h | Stationen + Radar (RADOLAN-RV / INCA / rzc) | 5–15 min | Browser (heute schon) |
| 2–6 h | + INCA/AROME + MOSMIX_S | stündlich | Browser |
| 6–48 h | + ICON-D2 (nativ/Repack) + MOSMIX_S | 3-stündlich / stündlich | Browser |
| 48–246 h | **MOSMIX_L aus `buscosun-data`** (PV1), Rückfallweg BrightSky | Producer 1×/Tag, Quelle 4×/Tag | Browser |
| 246–336 h | Kachel-Artefakt — **erst PV5**, bis dahin endet die Aussage bei 246 h | 2×/Tag | Artefakt |
| Koeffizienten | `params/pv-*.json` | wöchentlich/monatlich | Actions |

## D.5 Degradation — was passiert, wenn etwas fehlt

| Ausfall | Verhalten | Sichtbar für Nutzer |
|---|---|---|
| Kachel-Artefakt fehlt oder ist zu alt | Horizont schrumpft auf das MOSMIX-Ende; **kein** Extrapolieren | „Aussage endet bei Tag 10 — Langfristdaten nicht verfügbar" |
| Kachel-Artefakt veraltet (> definierte Schranke) | wird **nicht** angezeigt | Datenalter sichtbar (bestehendes `dataAge`-Muster) |
| **MOSMIX aus `buscosun-data` fehlt oder ist zu alt** (PV1) | **BrightSky greift als benannter Rückfallweg** — im Code, nicht auf dem Papier (Muster D-31) | Quellenbadge nennt den tatsächlichen Weg |
| BrightSky **und** Repo aus | Stationen tragen 0–6 h; darüber endet die Aussage | „Vorhersage endet bei +6 h — Modellquelle nicht erreichbar" |
| Koeffizienten fehlen | Rückfall auf den heutigen unkalibrierten Blend | **ausdrücklich als „unkalibriert" gekennzeichnet** |
| Stationen aus | Anker entfällt, Terrain-Korrektur läuft ungedämpft | Konfidenz sinkt entsprechend (jetzt echt, nicht heuristisch) |
| Radar aus | Nowcast-Familie entfällt | Nowcast-Kennzeichnung entfällt |

**Harte Regel:** Es gibt keinen stillen Rückfall. Jeder Degradationspfad ist im Produkt sichtbar
(D-04) und wird von einem Verifier geprüft.

## D.6 Betriebs-Wächter (aus V-BW-58 gelernt)

1. **Publisher mit Wiederholung**: Commit-back-Loop nach dem Muster aus `warm-grib.yml` (T2c),
   nicht der Einmal-Push aus `publish-repack.mjs`.
2. **Externer Wächter** nach dem Muster `health.yml`: prüft über HTTPS wie ein Besucher, ob das
   Artefakt frisch ist; rot ⇒ GitHub-Fehlermail an den Owner. Kein zusätzlicher Dienst.
3. **Client-Alterssperre**: Ein Artefakt jenseits der Schranke wird nicht angezeigt, statt still
   veraltet zu wirken.
4. **Archiv-Lückenwächter**: Der Archiv-Cron meldet Lücken, statt grün durchzulaufen (die
   Lehre aus V-79: „Erfolg gemeldet, obwohl nichts ausgerichtet").

---

# §E — Implementierungsplan (Fassung nach Jans Entscheidungen, 2026-09-05)

> **Diese Fassung ersetzt die Phasen 0–5 der ersten Planung.** Grundlage sind J-1 … J-5
> (`audit/punktvorhersage-14tage.md` §2). Die vier Änderungen mit der größten Wirkung:
>
> 1. **Kein neues Repo** (J-2) ⇒ das Langfrist-Kachel-Artefakt aus §D.2 rückt ans Ende und wird
>    nur gebaut, wenn der Kern trägt. §D.2 bleibt als ausgearbeitete Option stehen, ist aber
>    **nicht** mehr Teil des Hauptpfads.
> 2. **Keine langfristige Testkampagne** (J-1/J-2) ⇒ der prospektive Schattenbetrieb entfällt
>    als eigenes Vorhaben. Seine Rolle übernimmt das **Modellvergleich-Feature** (J-5): die
>    laufende Messung wird zum Produkt statt zum Testlauf.
> 3. **MOSMIX kommt über `buscosun-data`** (J-3) ⇒ das war Phase 0.2 „Archiv"; es ist jetzt
>    **PV1** und liefert zwei Dinge auf einmal (Client-Eingang + wachsendes Archiv).
> 4. **Vergleichsbereich endet bei 246 h** (J-1) — dort endet MOSMIX.

**Gemeinsame Regeln (unverändert)**

- Diagnose → Plan → Implement → Verify → Gate; Belege im Phasendokument.
- **Flag-Gating (D-11):** jede neue Rechenstufe default-off mit benanntem Rückfallweg; alle
  Flags aus ⇒ heutiges Verhalten unverändert.
- **Funktionserhalt:** kein Consumer (Event/Route/3D/Nowcast/Notifications/Panel) verliert etwas.
- Kein Gate ohne Beleg; kein Beleg ohne Negativkontrolle.

---

## PV1 — MOSMIX in `buscosun-data`, nach dem ICON-D2-Schema (J-3, präzisiert 2026-09-05)

**Ziel:** Die Punktvorhersage bezieht MOSMIX aus dem eigenen Daten-Repo statt von BrightSky.
**Nach demselben Schema wie ICON-D2** — also als weitere Familie in der bestehenden
Repack-Mechanik, nicht als Sonderweg.

**Was „genauso wie ICON-D2" konkret heißt** (gelesen in `scripts/lib/repackManifest.mjs` und
`scripts/publish-repack.mjs`):

| Element | Übernahme |
|---|---|
| Ablage | `runs/<YYYYMMDDHH>/mosmix-<station>.bin` unter `RUNS_DIR`, wie jede Repack-Familie |
| Register | neuer Eintrag in `FAMILIES` (`scripts/lib/repackManifest.mjs:105`) — Producer, Publisher, Verifier und Client lesen die Liste an **einer** Stelle; `verify:repack` prüft, dass Client-Spiegel (`REPACK_FAMILIES`) und Producer-Liste gleich sind |
| Adressierung | `index.json` nennt den **Commit-SHA**; der Client baut URLs ausschließlich über `stepUrl()` (`…@<sha>/…` ⇒ `immutable`) |
| Anti-Drift | `repack.run === manifest.run`, sonst kein Abschnitt — dieselbe Regel, die verhindert, dass ein Lauf auf die Daten des Vorlaufs zeigt |
| **Retention** | `REPACK_KEEP` (Default **4 Läufe**), Prune + Force-Push mit frischer Historie |

**Die Folge, die ausgesprochen werden muss:** Mit dieser Retention wird **kein Archiv**
aufgebaut — alte Läufe werden geprunt und sind weg. Ein *rückwirkender* Vergleich gegen MOSMIX
ist damit dauerhaft ausgeschlossen. Das ist mit „keine Zeit für langfristige Tests" vereinbar
und hier nur festgehalten, damit es später niemand als Versäumnis liest. Der Vergleich
„Vorhersage vs. tatsächlich" läuft stattdessen **prospektiv im Modellvergleich** (PV4) — und
braucht dort einen eigenen, sehr kleinen Datenweg (J-7, s. §E.2).

| WP | Inhalt |
|---|---|
| 1.1 | **DACH-Stationskatalog** einmalig aus `MOSMIX_L_LATEST.kmz` (82,6 MB) ziehen: id, lat, lon, elev; Geländeattribute je Station aus dem DEM |
| 1.2 | **Producer**: MOSMIX_L je DACH-Station holen (≈ 4,7 MB je Lauf, ≈ 19 MB/Tag), auf die gebrauchten Elemente reduzieren, kompaktes Binärformat je Station. Lauf-Takt = Quell-Takt (4×/Tag) |
| 1.3 | **Familie `mosmix` registrieren** und in Producer/Publisher/Verifier durchziehen — kein zweiter Publish-Pfad, kein zweiter Manifest-Mechanismus |
| 1.4 | **Client**: `fetchBrightSkyPointForecast` bekommt einen Vorschalter, der zuerst das Repo liest. **BrightSky bleibt der benannte Rückfallweg im Code** (Muster D-31), Kill-Switch analog `?repack=0` |
| 1.5 | **Wächter**: Publisher mit Commit-back-Retry (T2c-Muster statt des Einmal-Push aus V-BW-58), externer HTTPS-Wächter (`health.yml`-Muster), Client-Alterssperre |
| 1.6 | **Volumenprüfung**: ~1 MB je Lauf × 4 = ~4 MB im Baum — neben ~45 MB Repack unkritisch gegenüber der 150-MB-jsDelivr-Grenze |

**Akzeptanz**
- Punktvorhersage in DE/AT/CH liefert über das Repo dieselben Werte wie über BrightSky
  (Wertidentität an ≥ 50 Stichprobenpunkten, **Negativkontrolle Pflicht**).
- **Netlify-Bytes für MOSMIX: 0** (Kaltsitzung gemessen, Muster `audit/bandbreite.md`).
- Fällt das Repo aus, greift BrightSky ohne sichtbaren Bruch (Ausfall simuliert).
- `verify:repack` grün mit der neuen Familie; Client- und Producer-Liste beweisbar gleich.
- Der Repo-Baum wächst nicht über die Retention hinaus.

**Abbruch**
- Nicht wertidentisch ⇒ nicht umschalten, Producer korrigieren.
- Die Familie lässt sich nicht sauber in `FAMILIES` einhängen (z. B. weil MOSMIX kein
  Schritt-PNG-Schema hat) ⇒ **anhalten und fragen**, statt einen zweiten Publish-Pfad zu bauen.
  *(Offener Punkt: die Repack-Familien sind PNG-Raster je Schritt; MOSMIX ist eine Stationsreihe.
  Die Ablage-, Index- und SHA-Mechanik ist übertragbar, das `channels`/`params`-Feld nicht.
  Das ist beim ersten Arbeitsschritt zu klären — Erwartung: eigenes `kind: 'points'` in
  derselben Familienliste.)*

**Aufwand (Schätzung):** 8–12 AT · **Abhängigkeiten:** keine · **STOPP-&-FRAGEN:** neuer Cron (J-3 erteilt)

---

## PV2 — Messen, was heute ist

**Ziel:** Die erste ehrliche Zahl über die bestehende Punktvorhersage. Ohne sie ist jede
Verbesserung eine Behauptung.

| WP | Inhalt |
|---|---|
| 2.1 | `verify:pv-metrics` — CRPS/Brier/PIT/Diebold-Mariano-HAC/Block-Bootstrap gegen **analytisch bekannte** Fälle, inkl. des $1/\sqrt2$-Tests und ≥ 3 Negativkontrollen |
| 2.2 | Beobachtungs-Rückgriff: DWD CDC (`recent` + `historical`), GeoSphere `klima-v2-1h` (823 Stationen, ab 1880), MeteoSchweiz OGD-SMN — als Wahrheit |
| 2.3 | Retro-Leser für S3 `ecmwf-forecasts` (ab 2023-01-18) und `noaa-gefs-pds`; **nicht kopieren**, in Actions lesen, nur die DACH-Extraktion zwischenspeichern |
| 2.4 | `verify:pv-score` — ein Kommando, ein Manifest (Daten-/Code-/Parameter-Hashes), reproduzierbares Ergebnis |
| 2.5 | **Die heutige `getPointForecast` vermessen**: T2m, Wind, Böe, Niederschlag über 0–246 h gegen Klimatologie, Persistenz, ECMWF- und GEFS-Mittel |

**Akzeptanz**
- `verify:pv-metrics` grün inkl. Negativkontrollen.
- Eine CRPSS-Tabelle für ≥ 150 DACH-Stationen über ≥ 2 Jahre Rückblick, mit
  Block-Bootstrap-Intervallen, stratifiziert nach Jahreszeit, Höhenband und Tageszeit.
- **Die Zahl für die heutige Engine ist veröffentlicht — auch wenn sie schlecht ist.**

**Abbruch**
- Kein Abbruch möglich: Dieses Ergebnis ist die Grundlage für alles Weitere, unabhängig davon,
  wie es ausfällt.

**Aufwand:** 10–15 AT · **Abhängigkeiten:** PV1.7 (Beobachtungen), sonst keine

---

## PV2-N — Nowcast 0–3 h (eigene Phase, 2026-09-05 ergänzt)

**Warum eigene Phase:** Der Auftrag lautet „bestes Punkt-**Fore- und Nowcast**". Der Nowcast ist
methodisch etwas anderes (Advektion statt Statistik), er hat andere Fehlerquellen, und — der
entscheidende Punkt — **sein Verifikationsproblem ist bereits gelöst**: `src/ml/radarHindcast.ts`
vergleicht eine aus RADOLAN bei T−Δ erzeugte Vorhersage gegen die **beobachtete** Analyse bei T.
Eingabe und Wahrheit sind beide echte `_000`-Analysen; der DWD-Forecast wird nie als Wahrheit
benutzt. Das ist genau „Vorhersage vs. tatsächlich", **nicht-zirkulär, rückwirkend und ohne
jedes Archiv** — die RADOLAN-Läufe der letzten Stunden reichen.

**Bestand, der trägt** (alles vorhanden, headless prüfbar):

| Modul | Was es kann |
|---|---|
| `src/ml/opticalFlowNowcast.ts` | Horn-Schunck-Fluss + semi-Lagrange-Advektion, intensitätserhaltend (D-17) |
| `src/ml/flowEnsemble.ts` | stochastisches Lagrange-Ensemble (±Tempo, ±Richtung) ⇒ **echter** Spread, der mit der Lead-Zeit intrinsisch wächst; Brier/Reliability/ECE eingebaut |
| `src/ml/radarHindcast.ts` | die nicht-zirkuläre Live-Validierung |
| `src/nowcast/nowcastEngine.ts` | Radar 0–2 h + Punkt-NWP 2–6 h zu einer 15-Min-Serie, `assembleNowcast` ist pur |
| `src/pointForecast/radarNowcast.ts` | Radar am Punkt (DE RADOLAN-RV, CH rzc); AT über INCA |

| WP | Inhalt |
|---|---|
| N.1 | `radarHindcast` von DEV-Hook zu **Gate** machen: `verify:pv-nowcast` mit Reliability, Brier/BSS, CSI gegen **Persistenz** und **Lagrange-Persistenz** je Lead (5–180 min) |
| N.2 | Den **Ensemble-Spread am Punkt** nutzen: die Nowcast-Wahrscheinlichkeit im Punktforecast kommt aus `flowEnsemble` statt aus der Heuristik — damit hat der Nowcast als Erster eine echte, kalibrierte Wahrscheinlichkeit |
| N.3 | **Isotone Kalibrierung** (`src/ml/isotonic.ts`) auf die Ensemble-PoP, je Lead-Bin und Intensitätsschwelle (0,1 / 1 / 5 mm/h) |
| N.4 | **Übergabe Nowcast → NWP** (`BLEND_FROM_MIN`/`BLEND_TO_MIN` in `nowcastModel.ts`): die Übergabezone wird aus dem gemessenen Skill-Schnittpunkt bestimmt statt gesetzt — dort, wo die Lagrange-Persistenz unter das NWP fällt |
| N.5 | **Meteorologie am Punkt**: Niederschlagsphase (`precipType.ts`, `snowModel.ts`, Schneefallgrenze), Konvektionskennzeichnung, alpine Aufteilung (`alpineSplit.ts`) — jeweils mit ausgewiesener Unsicherheit statt als harte Klasse |

**Akzeptanz**
- BSS > 0 gegen **Lagrange-Persistenz** (nicht nur gegen Persistenz — Letzteres wäre ein
  Strohmann) je Lead-Bin bis mindestens 90 min, gemessen über ≥ 200 unabhängige Zeitpunkte.
- Reliability-Diagramm auf der Diagonalen (ECE unter Schranke) für alle drei Schwellen.
- Der Skill-Schnittpunkt Nowcast↔NWP ist **gemessen** und die Übergabezone entspricht ihm.
- Keine Regression an der bestehenden Nowcast-Anzeige (Funktionserhalt).

**Abbruch**
- Kein BSS-Gewinn gegen Lagrange-Persistenz ⇒ das Ensemble bringt keine Information; dann bleibt
  die bestehende Anzeige, und der Aufwand wandert in PV3.

**Aufwand:** 8–12 AT · **Abhängigkeiten:** PV2 (Metrik-Harness) · **läuft parallel zu PV3**

---

## PV3 — Das Modell mathematisch und physikalisch besser machen (Jans eigentliches Ziel)

**Ziel:** Die gesetzten Konstanten durch gemessene Größen ersetzen und aus dem Punktwert eine
Verteilung machen. Reihenfolge nach erwartetem Hebel.

| WP | Inhalt | ersetzt |
|---|---|---|
| 3.1 | **Kalibrierte Verteilung** statt Punktwert + Heuristik: EMOS/NGR (T, Td) und Quantilregression (Niederschlag, Böe, Bewölkung), CRPS- bzw. Pinball-gefittet | `confidence`-Heuristik (`pointForecast.ts:604–640`) |
| 3.2 | **Schrumpfung zur Klimatologie mit gefittetem $\rho(\tau)$** — parameterfrei hergeleitet (`mathematik-spezifikation.md` §6) | `SKILL_DECAY` (τ/floor), `leadWeight()` |
| 3.3 | **Stündliche Klimatologie** aus lizenzsicheren Beobachtungen (Jahresgang × Tagesgang) | tägliche `climaGrid.json` (die Lizenzfrage bleibt J-4, hier geht es um die Auflösung) |
| 3.4 | **Gelernte Blend-Gewichte**: Softmax mit Spline in τ, glättungsreguliert, Stetigkeit an den Modellhorizonten 48/60/246 h geprüft | `FAMILY_CURVES` + `VARIABLE_MULTIPLIER` (~45 Konstanten) |
| 3.5 | **Online-Bias** (Kalman/EWMA) je Station × Lead + hierarchische Schrumpfung über Geländeklassen; Bias-Feld höhenbewusst auf beliebige Punkte interpoliert | — (neu) |
| 3.6 | **Terrain-Prädiktoren statt Faustformeln**: Wind-Speed-up, Böen-×1,4, `ANCHOR_TOL_C` werden gelernte Terme mit Unsicherheit | `pointForecast.ts:405, 576–586`, `ANCHOR_TOL_C` |
| 3.7 | Auslieferung als `params/pv-*.json` (Koeffizienten, wenige hundert KB) — **kein neues Repo nötig**, das passt in `public/params/` bzw. in den vorhandenen Datenbaum |
| 3.8 | **Meteorologie explizit** (Jans dritte Achse): Niederschlagsphase und Schneefallgrenze mit ausgewiesener Unsicherheit statt harter Klasse (`precipType.ts`, `snowModel.ts`, `alpineSplit.ts`); Inversion/Kaltluftsee als **Regime-Kovariate** statt als Zuschlag; Föhn (`foehnDetector.ts`) vom Tier-C-Badge zum Prädiktor; Böen aus der Windverteilung statt aus einem Faktor; Taupunkt/Nebelrisiko als eigene Aussage |

**Akzeptanz (je Variable einzeln, kein Bündel)**
- CRPSS > 0 gegen die **heutige Engine**, signifikant (5 %, FDR-korrigiert), in **jedem**
  Lead-Bin 0–246 h — gemessen im Rückblick nach PV2.
- **Kalibrierung gate-blockierend:** PIT-Abweichung unter Schranke, Spread-Skill in
  [0,85; 1,20] je Lead-Bin. Ein CRPS-Gewinn bei kaputter Kalibrierung wird nicht ausgeliefert.
- Keine Verschlechterung in einer der fünf Extremklassen (Sturm, Starkniederschlag,
  Inversion/Kaltluftsee, Föhn, Frostwechsel).
- Zusätzlicher eager-JS-Anteil **0 KB** (dynamischer Import); Koeffizienten < 500 KB.

**Abbruch**
- Kein signifikanter Gewinn gegen die heutige Engine ⇒ die betroffene Stufe wird **nicht**
  ausgeliefert; der heutige Pfad bleibt. Kein Nachjustieren des Gates.
- Gate scheitert **wegen Stichprobengröße** ⇒ Stopp mit der Diagnose „zu wenig Daten", nicht
  mit einer gelockerten Schwelle.

**Aufwand:** 20–30 AT · **Abhängigkeiten:** PV2

---

## PV4 — Integration in den Modellvergleich (J-5)

**Ziel:** Der Vergleich wird ein Produkt-Feature, kein Testlauf. „Dort sieht man schon, ob es
kurzfristig besser abschneidet."

| WP | Inhalt |
|---|---|
| 4.1 | **buscosun Fusion als eigene Linie** in `src/confidence/` neben den fünf vorhandenen Modellen (`multiModel.ts:FORECAST_MODELS`) |
| 4.2 | **Wahrheitsquelle umstellen**: heute „Konsens der Modell-Analysen" über Open-Meteo (`hitRate.ts:8–10`) → **Stationsmessung** (DWD POI / TAWES / SMN, alle CC BY 4.0, im Archiv aus PV1.7). Der Modell-Konsens bleibt als zweite, klar beschriftete Ansicht |
| 4.3 | Treffsicherheits-Rückblick zeigt buscosun Fusion mit denselben Leads (1 und 3 Tage) wie die übrigen Modelle — gleiche Regeln, kein Heimvorteil |
| 4.4 | Ehrlichkeitstext: was verglichen wird, gegen welche Wahrheit, über welchen Zeitraum, und wo MOSMIX endet (246 h) |
| 4.5 | **„Vorhersage vs. tatsächlich" für buscosun Fusion — nachrechnen statt speichern.** Die Rechnung ist rein (D-12), gleiche Eingaben ⇒ bit-gleiche Ausgabe; die Grenze ist allein, wie weit die Quellen zurückreichen. Gemessen: AROME **≈ 15 h** (6 Reftimes), ICON-D2 **24 h**, MOSMIX **48 h**, Stationen Jahre. ⇒ Leads **bis ~15 h (AT/CH) bzw. ~24 h (DE)** sind **ohne ein gespeichertes Byte** rückwirkend auswertbar; ein Job rechnet nach, vergleicht gegen die Messung, schreibt die Note. **Pflicht dabei:** Eingaben hart auf `t₀` begrenzen — die Stationsmessung ist der gefährlichste Leck-Pfad (sie ist jahrelang abrufbar), mit Negativkontrolle im Verifier |
| 4.6 | **Nur falls Leads > 24 h in der Auswertung erscheinen sollen (J-7):** je Lauf ≈ 220 KB buscosun Fusion an den DACH-Stationen, ~4 Tage Haltezeit (~3,5 MB), danach geprunt; dauerhaft bleibt nur die Scorecard (~0,7 MB/Jahr). **Gespeichert werden die Noten, nicht die Vorhersagen.** Ohne diese Entscheidung endet die Auswertung bei ~24 h — für „schneidet es kurzfristig besser ab?" reicht das |

**Akzeptanz**
- Die Hit-Rate-Auswertung ist gegen **Messungen** gerechnet und als solche beschriftet.
- buscosun Fusion erscheint mit denselben Metriken, denselben Leads und ohne Sonderbehandlung.
- Verliert unser Modell in einem Bin, **steht das dort** (D-04).
- Bestehende Funktionen des Modellvergleichs bleiben vollständig erhalten.

**Abbruch**
- Lässt sich die Wahrheitsquelle nicht auf Messungen umstellen, wird buscosun Fusion **nicht**
  in die Hit-Rate aufgenommen — ein Vergleich gegen Modell-Analysen wäre für die eigene Engine
  systematisch verzerrt und damit irreführend.

**Aufwand:** 8–14 AT · **Abhängigkeiten:** PV1.7, PV3

---

## PV5 — Langfrist 246–336 h *(nur bei Bedarf, ohne neues Repo)*

**Ziel:** Der Horizont jenseits von MOSMIX. Wird **erst aufgerufen**, wenn PV3 trägt.

Gegenüber der ersten Planung entfällt das eigene Repo (J-2). Damit gilt:

- Der Volumenrahmen ist das, was in `buscosun-data` neben ~45 MB Repack noch in die
  **150-MB-jsDelivr-Grenze** passt ⇒ realistisch ≤ 20 MB je Lauf bei Retention 2–4.
  Die Kachel-Rechnung aus §D.2 (int8, ~9 MB/Lauf) passt genau hinein, die int16-Variante nicht.
- Quelle bleibt **GEFS-Mittel + Spread** (Public Domain, ≈ 191 MB/Lauf Ingest) plus die
  deterministischen ECMWF-Anker. Das volle ECMWF-ENS (≈ 197 GB/Lauf) bleibt draußen — J-6 ist
  damit vorerst gegenstandslos.
- **Akzeptanz:** CRPSS > 0 gegen die kalibrierte Klimatologie in jedem Lead-Bin 246–336 h.
  Schlägt es die Klimatologie nicht, bleibt der Horizont bei 246 h und der 14-Tage-Anspruch
  entfällt — ein ehrliches „bis 10 Tage" ist besser als ein unbelegtes „14 Tage".

**Aufwand:** 15–25 AT · **Abhängigkeiten:** PV3, PV4

---

## E.1 Was sich zeitlich ändert

| | erste Planung | nach J-1 … J-5 |
|---|---|---|
| Erster belastbarer Rückblick | nach Phase 0 | **nach PV2** — gegen Klimatologie/Persistenz/ECMWF/GEFS, ab 2023 verfügbar |
| MOSMIX-Rückblick | Gate, ≥ 12 Monate | **kein Gate mehr** — wächst als Nebenprodukt von PV1 und wird ausgewertet, wenn genug da ist |
| Schattenbetrieb | eigenes Vorhaben, ≥ 6–12 Monate | **entfällt** — der Modellvergleich (PV4) ist die laufende Messung |
| Erster sichtbarer Produktgewinn | Phase 5 | **PV1** (0 Netlify-Bytes, kein BrightSky-Risiko) und **PV3** (kalibrierte Bandbreite) |

**Ehrlicher Hinweis zum Wegfall des Schattenbetriebs:** Ein Rückblick bleibt methodisch ein
*Verdacht*, kein *Beweis* — er misst auf Daten, die bei der Modellwahl schon sichtbar waren.
Die Regeln aus `retro-verifikation.md` §1/§2 (As-of-Rekonstruktion, walk-forward, gesperrter
Testzeitraum) sind deshalb **nicht optional**, sondern das, was den Rückblick überhaupt
belastbar hält. Der Modellvergleich (PV4) liefert danach die prospektive Bestätigung — nur eben
als Feature, das ohnehin läuft, statt als Kampagne.

## E.2 Jans Entscheidungen — Stand

| # | Frage | Entschieden am 2026-09-05 |
|---|---|---|
| J-1 | Anspruch und Prüfweg gegen MOSMIX | **nur bis zum MOSMIX-Horizont (246 h), retrospektiv** |
| J-2 | Eigenes Repo für das Langfrist-Artefakt | **nein.** Ziel ist ein besseres Modell; Vergleich im Modellvergleich-Feature; keine langen Tests |
| J-3 | MOSMIX-Läufe archivieren / neuer Cron | **ja, nach `buscosun-data`** — und von dort auch als Eingang für buscosun Fusion |
| J-4 | Meteostat-Lizenz | **später** |
| J-5 | Sichtbarkeit vor dem Beleg | **ja, zuerst im Modellvergleich** |
| J-6 | Volles ECMWF-ENS | *offen — durch J-2 vorerst gegenstandslos, wird mit PV5 wieder aufgerufen* |
| **J-7** | **Sollen in der Treffsicherheits-Auswertung auch Leads über ~24 h erscheinen?** Bis ~15 h (AT/CH) bzw. ~24 h (DE) ist alles **nachrechenbar, ohne ein gespeichertes Byte** (M-21). Darüber hinaus bräuchte es ≈ 220 KB je Lauf mit ~4 Tagen Haltezeit | **offen, aber nicht mehr blockierend.** „Nein" ⇒ nichts wird gespeichert, die Auswertung endet bei ~24 h. „Ja" ⇒ die kleine Variante, Noten statt Vorhersagen |

### E.2.1 Präzisierungen vom 2026-09-05

- **„Genauso wie ICON-D2" ⇒ kein Archiv.** Die Repack-Retention (`REPACK_KEEP`, Default 4)
  prunt alte Läufe. Ein rückwirkender MOSMIX-Vergleich ist damit dauerhaft ausgeschlossen —
  bewusst, weil für lange Testkampagnen die Zeit fehlt.
- **Der Nowcast ist Teil des Ziels** („bestes Punkt-Fore- **und Nowcast**") und hat mit
  **PV2-N** eine eigene Phase bekommen. Dort ist das Verifikationsproblem bereits gelöst:
  `src/ml/radarHindcast.ts` misst nicht-zirkulär gegen beobachtete RADOLAN-Analysen — ohne
  Archiv, ab sofort.
- **„Mathematisch, physikalisch, meteorologisch"** ist als drei getrennte Achsen in PV3
  abgebildet: 3.1–3.5 mathematisch (Verteilung, Kalibrierung, gelernte Gewichte),
  3.6 physikalisch (Gelände statt Faustformeln), **3.8 meteorologisch** (Phase, Schneefallgrenze,
  Inversion, Föhn, Böen, Nebel).
