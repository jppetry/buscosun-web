# Ist-Analyse — „Fusion" und der Weg zu 0–336 h am Punkt

> Stand 2026-09-05 · Runde: **Analyse und Plan, kein Code** · Phase PV0
> Belege: Codestellen mit Datei:Zeile, Messungen mit Datum. Alles ohne Beleg ist als
> **Annahme** gekennzeichnet.

---

## 0. Die Kurzfassung in fünf Sätzen

1. Die im Auftrag beschriebene Engine — „Minimum-Varianz-Schätzung, OI mit terrain-aware
   Kovarianz, Multi-Modell-Bias-Korrektur" — **existiert im Code nicht mehr**; sie wurde am
   2026-08-22 vollständig zurückgebaut (`audit/rasterfusion-rueckbau.md`, 16 Module ≈ 2 300 Zeilen
   gelöscht, dazu 452 Fixture-Dateien / 59 MB und 12 Skripte).
2. Was heute „buscosun Fusion" am Punkt ist, steht in `src/pointForecast/` (5 247 Zeilen):
   ein **handgesetzter, lead-zeit-abhängiger Gewichts-Blend** mehrerer Quellen mit guter
   DACH-Physik (Lapse-Rate, Kaltluftsee, Hangexposition, Stations-Anker-QC) — aber ohne
   prädiktive Verteilung, ohne Kalibrierung und **ohne jede Verifikation gegen Beobachtungen**.
3. Die „confidence"-Werte, die die App heute anzeigt, sind eine **Anzeige-Heuristik**
   (gewichtete Streuung ÷ Toleranz × exponentieller Lead-Faktor + Familienbonus,
   `pointForecast.ts:604–640`) — keine Wahrscheinlichkeit. Sie sind nie gegen eintretendes
   Wetter geprüft worden.
4. Es gibt jedoch **mehr wiederverwendbare Substanz als erwartet**: `src/ml/` enthält bereits
   Klimatologie (harmonische Regression + LOYO-CV), isotone Kalibrierung (PAV),
   Analog-Ensemble mit CRPS-Kreuzvalidierung, CRPS/Brier/BSS/Reliability-Metriken und einen
   MOS-Kombinierer — plus ein ausgeliefertes Klimatologie-Artefakt
   (`public/climaGrid.json`, 178 DACH-Stationen, 1995–2024).
5. Die härteste Restriktion des Auftrags ist **nicht** das Archivproblem: Beobachtungen und
   die globalen Modellarchive (ECMWF, GEFS) sind rückwirkend frei verfügbar (§4 und
   `datenquellen-matrix.md`). Rückwirkend **nicht** verfügbar sind genau zwei Dinge —
   **MOSMIX und ICON**. Und das sind ausgerechnet die Referenzen, gegen die der Auftrag
   gemessen werden will.

---

## 1. Abweichungen zwischen Auftragskontext und Repo-Wirklichkeit

Der Auftrag verlangt ausdrücklich, den mitgelieferten Kontext zuerst zu prüfen. Ergebnis:

| Aussage im Auftrag | Befund | Beleg |
|---|---|---|
| „Fusion-Engine mit Minimum-Varianz-Schätzung" | **falsch** — `background.ts` (eq. 2/4) gelöscht | `audit/rasterfusion-rueckbau.md` §5 |
| „OI mit terrain-aware Kovarianz" | **falsch** — `oi.ts` (eq. 3/7/8/15) gelöscht | ebd. |
| „Multi-Modell-Bias-Korrektur" | **falsch** — Bias-Tabellen ohne Lesecode; `public/params/background-v1.json` (164 KB) liegt verwaist im Repo | ebd. §7 |
| „`fusionV2`" | **falsch** — der gesamte Flag-Apparat entfernt | ebd. §5 |
| „Radar-Nowcast über RADOLAN RV" | **richtig** — und am Punkt integriert | `pointForecast.ts:180–186`, `radarNowcast.ts` |
| „ICON-D2/ICON-D2-EPS-Ladepfad" | **richtig** | `src/sources/iconD2*.ts`, `iconD2EpsSource.ts` |
| „Auslieferung über `buscosun-data` + jsDelivr" | **richtig** | `scripts/publish-repack.mjs`, `docs/API.md` §8.1a |
| „kein Backend, Netlify" | **richtig** (D-01) | `decisions.md` |
| „aktuell ~60 h" | **teilweise falsch** — der Punktforecast kann seit 2026-06 ~10 Tage (MOSMIX für alle Länder) und **verifiziert 336 h** über den GFS-Schwanz; der 60-h-Schnitt ist nur noch der *Default* für AT/CH (`countryProfiles.ts:92,108`) | `docs/buscosun-fusion-audit-2026-06.md`; `pointForecast.ts:80–86` |

**Konsequenz für die Planung:** Es gibt keine „Erweiterung einer bestehenden probabilistischen
Engine". Es gibt einen deterministischen Blend, der auf 336 h *gestreckt* werden kann, und
eine leere Stelle da, wo die Statistik sein müsste. Das ist eine bessere Ausgangslage, als es
klingt — die gelöschten OI-Module waren für ein **Rasterprodukt** gebaut; für ein Punktprodukt
wäre die Hälfte davon ohnehin falsch dimensioniert gewesen.

---

## 2. Was `src/pointForecast/` tatsächlich rechnet

### 2.1 Ablauf einer Abfrage (`getPointForecast`, `pointForecast.ts:163–478`)

```
1  Terrain-Kontext aus DEM (Terrarium z9 ~ 150 m/px) -> elevationM, sinkDepthM, slopeRad, aspectRad
2  parallel: BrightSky/MOSMIX · DWD-UV (DE) · INCA (AT, <=4 h) · AROME (AT/CH) ·
   naechste 6 Stationen · Radar-Sampler (opt-in) · GFS-Schwanz (nur wenn hours > 240)
3  Lapse-Rate aus dem Stationsset (estimateLapseRate, Shrinkage zum Prior 0,0065)
4  Stundenweise Sample-Listen vereinigen; Stationen werden an h = 0…5 angehaengt
5  je Variable: gewichteter Mittelwert  Sum(w·v)/Sum(w)
6  Post-Blend-Physik: Kaltluftsee + Hangeinstrahlung (gedeckelt, anker-gedaempft),
   gefuehlte Temperatur
7  „confidence" je Variable aus gewichteter Streuung × Lead-Zerfall + Familienbonus
```

### 2.2 Die Gewichte

`leadTimeWeights.ts` — fünf Quellen-**Familien** (`obs`, `nowcast`, `highres`, `mosmix`,
`global`) mit je einer handgesetzten Kurve (`base0`, `base24`, Form `linear|sticky|plateau`),
multipliziert mit einem handgesetzten Variablen-Faktor. Beispiele: `obs.base0 = 5.0`,
Halbwertszeit 2,5 h; `highres` Plateau bis h = 3, dann linear auf 1,8; Niederschlag bekommt
`nowcast × 1,6`, Wolken `obs × 0,4`.

Die Kommentare belegen die Herkunft dieser Zahlen ehrlich: sie sind an *Einzelfällen*
kalibriert („Innsbruck", „Schmalkalden vs. alle NWP-Modelle", `leadTimeWeights.ts:38–41`,
`pointForecast.ts:575–582`). Das ist gute Ingenieursarbeit und schlechte Statistik: es gibt
keinen Datensatz, gegen den diese 40+ Konstanten optimiert wurden, und keinen, an dem man
merken würde, wenn eine davon schadet.

### 2.3 Die Physik — der wertvollste Teil des Bestands

| Baustein | Ort | Bewertung |
|---|---|---|
| Lapse-Rate mit Reliabilitäts-Shrinkage (OLS ↔ Prior 0,0065, geklemmt [−0,008; +0,012]) | `spatialInterp.ts:estimateLapseRate` | **behalten** — genau die Form, die die Literatur für stationsgestützte Höhenkorrektur nutzt; Inversionen bleiben erhalten |
| Höhenkorrektur je Sample vor dem Blend | `pointForecast.ts:569–574` | **behalten** |
| Representativeness-QC gegen ko-lokalisierten Stations-Anker (gaußförmige Abwertung, Toleranz 3,5 °C) | `pointForecast.ts:519–545, 588–593` | **behalten, aber lernen statt setzen** — das ist faktisch ein handgesetztes R/B-Verhältnis |
| Kaltluftsee (TPI-Senkentiefe × Nacht × windstill × wolkenarm, Deckel −3,5 °C) | `terrainPhysics.ts` | **behalten** — genau die Effekte, die ein 2,5-km-Gitter am Punkt verfehlt |
| Hangexposition (NOAA-Sonnenstand × Neigung/Exposition, Deckel ±1,5 °C) | `terrainPhysics.ts` | **behalten** |
| Doppelzähl-Schutz (Anker-Dämpfung 0,35) | `pointForecast.ts:212–216` | **behalten** — konzeptionell richtig |
| Wind-Speed-up 0,15 %/m, gedeckelt ±80 % | `pointForecast.ts:576–586` | **ersetzen** — reine Faustformel, sollte ein gelernter Terrain-Prädiktor werden |
| Böen-Fallback `1,4 × Wind` | `pointForecast.ts:405` | **ersetzen** — gehört in die Verteilung, nicht in eine Konstante |
| Wolken-Split 55/30/15 aus einer Gesamtbedeckung | `sampleSources.ts:211–219` | **ehrlich benennen** — MOSMIX liefert nur `N`; die drei Schichten sind erfunden |

### 2.4 Was das Produkt heute ausgibt — und warum das für 14 Tage nicht reicht

`PointForecastHour` (`types.ts:51–90`) trägt pro Stunde **einen** Wert je Variable plus
`confidence: 0..1`. Diese Zahl entsteht so (`pointForecast.ts:604–640`):

```
stdConf     = clamp(1 − stdW / (3·tol))          tol: T 1,5 °C · Wind 2 m/s · Precip 0,5 mm/h …
agreement   = vs.length >= 2 ? stdConf : min(stdConf, 0.6)
leadFactor  = max(floor, e^(−h/tau))             tau: T 160 h · Precip 36 h · Wolken 60 h …
confidence  = agreement · leadFactor + Familienbonus
```

Drei Probleme, die ab Tag 3 produktentscheidend werden:

- **Es ist keine Verteilung.** Aus `confidence = 0,42` folgt kein Intervall, keine
  Überschreitungswahrscheinlichkeit, keine Entscheidungsgrundlage. Für Touren- und
  Eventplanung („regnet es zwischen 14 und 18 Uhr mehr als 1 mm?") ist genau das die Frage.
- **Die Streuung der Quellen ist nicht die Unsicherheit.** Bei Lead 200 h liefert der Blend
  in DE praktisch nur noch MOSMIX (+ ggf. GFS): eine Quelle ⇒ Streuung 0 ⇒ die Formel deckelt
  auf 0,6 statt auf die tatsächliche, dann sehr große Unsicherheit. Der Code weiß das und
  kommentiert es (`pointForecast.ts:625–630`) — er kann es nur nicht reparieren, weil ihm die
  Klimatologie im Blend fehlt.
- **τ und `floor` sind gesetzt, nicht gemessen.** `temperature: tau = 160 h, floor = 0,45`
  behauptet, die Temperaturvorhersage behalte bei 14 Tagen 45 % „Sicherheit". Das ist
  nachprüfbar falsch oder richtig — geprüft ist es nicht.

### 2.5 Der 14-Tage-Schwanz, den es schon gibt

`gfsPoint.ts` + `pointForecast.ts:187–194`: ab `hours > 240` wird GFS (Public Domain, über
`/_gfs`) mit Overlap ab 216 h bis max. 372 h geladen, als Familie `global` eingespeist. Der
Audit von 2026-06 nennt eine Laufzeit-Verifikation (Frankfurt, 336 h, Konfidenz bei Lead 312 h
Temp 0,27 / Niederschlag 0,15). **Kein heutiger Consumer fragt > 240 h an** — die Fähigkeit
existiert ungenutzt. Ehrliche Grenzen laut Audit: GFS 1° grob, keine Höhenkorrektur (die
Gitterzelle mittelt Topografie), Niederschlag aus 6-h-Eimern ÷ 6, ~100 GRIB-Range-Abrufe je
Abfrage.

> **Bewertung:** Der Schwanz ist als *Machbarkeitsnachweis* wertvoll und als *Produkt*
> untauglich: ein deterministischer 1°-GFS-Wert an einem Alpenpunkt bei Tag 13 ist keine
> Information, und 100 Range-Abrufe pro Punktabfrage skalieren nicht auf Massen-Consumer
> (Route/3D fragen heute pro Cluster).

---

## 3. Was wiederverwendbar ist — und was ersetzt gehört

### 3.1 Wiederverwenden (unverändert)

| Baustein | Ort | Warum |
|---|---|---|
| GRIB2-Decoder inkl. CCSDS-AEC (DRT 0/1/42) | `src/sources/gribDecode.ts` | öffnet ECMWF/AIFS/GEFS überhaupt erst; D-07 |
| ECMWF-`.index`-Range-Adapter (IFS · AIFS-single · AIFS-ENS-cf) | `src/sources/ecmwfIfsSource.ts` | **das entscheidende Werkzeug** für den Langfrist-Ausbau |
| GFS-idx-Range-Adapter | `src/globe/gfs.ts`, `pointForecast/gfsPoint.ts` | dito für NOAA |
| ICON-D2-EPS-Adapter (ikosaedrisch, clat/clon) | `src/sources/iconD2EpsSource.ts` | Muster für ICON-EPS/ICON-EU-EPS |
| DEM-Lookup + Terrain-Kontext | `src/fusion/elevation.ts`, `pointForecast/terrainPhysics.ts` | Prädiktoren-Lieferant für §Mathematik |
| Lapse-Rate-Shrinkage | `src/fusion/spatialInterp.ts` | fertige, korrekte Form |
| CRPS · Brier · BSS · Reliability · RMSE/MAE · CSI | `src/ml/metrics.ts` | Verifikationskern, headless prüfbar |
| Isotone Regression (PAV) | `src/ml/isotonic.ts` | IDR-Baustein und Kalibrierer |
| Harmonische Klimatologie + LOYO-CV | `src/ml/climatology.ts` | Klimatologie-Referenz (Pflicht-Baseline) |
| Analog-Ensemble + CRPS-CV | `src/ml/analogEnsemble.ts` | AnEn-Kandidat fürs lange Ende |
| Repack → PNG → jsDelivr-Kette + Byte-Identitäts-Verifier | `scripts/repack-icon-d2.mjs`, `scripts/lib/repackManifest.mjs`, `verify:repack` (325/325) | **das Auslieferungsmuster für jedes neue Artefakt** |
| Verifier-Harness-Konvention | `scripts/verify-*.mjs`, D-10 | Gate-Form steht fest, kein neuer Runner |

### 3.2 Ersetzen

| Baustein | Warum | Ersatz (s. `mathematik-spezifikation.md`) |
|---|---|---|
| `FAMILY_CURVES` + `VARIABLE_MULTIPLIER` (≈ 45 Konstanten) | handgesetzt, nie optimiert, nie geprüft | CRPS-optimal gelernte, in τ glatte Gewichte |
| `SKILL_DECAY` (τ/floor je Variable) | behauptet Skill statt ihn zu messen | aus dem Archiv gefittete Anomalie-Korrelation ρ(τ) |
| `confidence` (Anzeige-Heuristik) | keine Wahrscheinlichkeit | Quantile + Verteilungsparameter, PIT-kalibriert |
| Wind-Speed-up 0,0015/m, Böen ×1,4 | Faustformeln | Terrain-Prädiktoren im Verteilungsmodell |
| ANCHOR_TOL_C = 3,5 °C | handgesetztes R/B-Verhältnis | aus Innovationsstatistik geschätzt |
| GFS-Schwanz als einzige Langfrist-Quelle | 1°, deterministisch, teuer je Abfrage | vorprozessiertes Quantil-Kachel-Artefakt (`implementierungsplan.md` §D) |

### 3.3 Bewusst **nicht** anfassen

- `src/confidence/` (Modellvergleich, Hit-Rate, Verlauf) — eigenständiges Feature auf
  Open-Meteo, kein Duplikat des Punktforecasts (so schon 2026-06 entschieden).
- `src/nowcast/` Radar-Kette und `precipSource.ts` — D-14 („radar-only, jetzt–2 h") ist eine
  bewusste Ehrlichkeitsentscheidung und keine Lücke.
- Der IDW-Rasterer in `src/fusion/` — Darstellungs-Infrastruktur für 20 Modelle
  (`engineGridded`), orthogonal zum Punktprodukt.

---

## 4. Der Zustand, der die Planung wirklich bestimmt

### 4.1 Das Archivproblem ist kleiner als angenommen — aber an einer Stelle unlösbar

Gemessen am 2026-09-05 (Rohwerte in `datenquellen-matrix.md`):

| Was | Rückwirkend verfügbar? | Beleg |
|---|---|---|
| Beobachtungen DE (stündlich) | **ja**, `recent` 503 Stationen + `historical` | DWD CDC |
| Beobachtungen AT (stündlich) | **ja**, 823 Stationen, 1880-04-01 → jetzt | GeoSphere `klima-v2-1h`, Metadaten abgerufen |
| Beobachtungen CH (stündlich) | **ja**, `_h_historical_<Dekade>.csv` je Station | MeteoSchweiz OGD-SMN (STAC) |
| ECMWF IFS/ENS/AIFS 0,25° | **ja, zurück bis 2023-01-18** | S3 `ecmwf-forecasts`, Präfix-Listing |
| NOAA GEFS | **ja** (20240101 und 20250905 geprüft vorhanden) | S3 `noaa-gefs-pds` |
| GEFSv12-Reforecast | **ja** | S3 `noaa-gefs-retrospective` |
| **DWD MOSMIX_S / _L** | **nein** — Rollfenster: 48 Läufe (S), 4 Läufe (L) | Verzeichnis-Listing |
| **DWD ICON-D2 / ICON-EU / ICON-EPS** | **nein** — 8 Läufe (D2) | Verzeichnis-Listing |

**Daraus folgt die zentrale Planungsaussage:** Ein Hindcast gegen Klimatologie, Persistenz,
ECMWF-ENS und GEFS ist **ab heute** über mehrere Jahre möglich. Ein Vergleich gegen **MOSMIX**
ist es nicht und wird es frühestens nach 12 zusammenhängenden Monaten Eigenarchivierung sein.
Die Archivierung der DWD-Referenz ist deshalb der erste Arbeitspaket-Block überhaupt — und sie
ist klein: **≈ 19 MB/Tag Rohdownload** für MOSMIX_L an ~250 DACH-Stationen.

### 4.2 Zwei Betriebsdefekte, die dieses Vorhaben erben würde

- **V-BW-58 (offen, `CLAUDE.md`-Kopf):** `scripts/publish-repack.mjs` pusht **genau einmal ohne
  Wiederholung**. Am 2026-09-04 scheiterte der Publish dreimal; 15z fiel ganz aus, die Karte
  stand sechs Stunden auf einem alten Lauf. Ein 14-Tage-Artefakt, das still auf einem drei Tage
  alten Lauf stehenbleibt, ist schädlicher als keins.
- **`publish-repack.mjs` force-pusht eine frische Zwei-Commit-Historie** (Kopfkommentar, §„Warum
  EINE Commit-Historie"). Ein Archiv darf deshalb **niemals** in `buscosun-data` liegen — es
  wäre nach dem nächsten Publish weg.

### 4.3 Lizenz-Befund mit Handlungsbedarf

`public/climaGrid.json` — das ausgelieferte Klimatologie-Artefakt — ist laut eigener
`meta.source` aus **Meteostat** (`data.meteostat.net`) gebaut. Die Lizenzlage von Meteostats
Bulk-Daten konnte in dieser Runde **nicht belegt werden** (zwei Abrufe der Terms-Seiten lieferten
keinen auswertbaren Lizenztext). Solange das offen ist, darf **kein neues** Artefakt aus dieser
Quelle entstehen; das bestehende ist zu prüfen (→ V-PV-07). Ersatz steht bereit und ist
lizenzsicher: DWD CDC + GeoSphere `klima-v2-*` + MeteoSchweiz OGD-SMN, alle CC BY 4.0.

---

## 5. Ehrliche Bewertung: Was hier erreichbar ist und was nicht

**Erreichbar, mit den vorhandenen Mitteln und ohne Backend:**

- Eine **kalibrierte prädiktive Verteilung** je Variable und Stunde für 0–336 h an jedem
  DACH-Punkt, deren Quantile ihr Versprechen halten (PIT-flach, Reliability-Diagramm auf der
  Diagonale). Das ist unabhängig davon, ob wir MOSMIX schlagen, ein echter Produktgewinn:
  heute zeigt buscosun eine Zahl und eine erfundene Prozentangabe.
- Ein **belegter Vorsprung gegen Klimatologie und Persistenz** über alle Leads — sofort
  messbar am vorhandenen Archiv, ohne Wartezeit.
- Ein **belegter Vorsprung gegen rohes ECMWF-ENS-Mittel / GEFS-Mittel** an Stationen, per
  Bias-Korrektur und Kalibrierung — der klassische, gut belegte MOS-Gewinn.
- **Zeitliche Kohärenz** (Trajektorien statt unabhängiger Quantile) — technisch machbar über
  Schaake-Shuffle-Vorlagen, Kosten pro Punkt im einstelligen KB-Bereich.

**Nicht erreichbar bzw. nicht belegbar:**

- **„Besser als MOSMIX von Sekunde 0 bis 14 Tage."** Erstens ist MOSMIX bei ~246 h zu Ende, es
  gibt also für 246–336 h keinen MOSMIX-Vergleich. Zweitens ist MOSMIX **an seinen Stationen**
  ein statistisch am Ort korrigiertes Produkt mit langer Trainingsbasis; ein Vorsprung dort ist
  eine hohe Hürde. Drittens braucht der Beleg 12 Monate Eigenarchiv.
- **„Besser als ICON-D2 ab Sekunde 0."** Bei h = 0 gewinnt jede Methode, die die Station liest —
  das ist keine wissenschaftliche Aussage. Sinnvoll ist ausschließlich der Vergleich gegen
  MOSMIX/Persistenz/Radar in den jeweils passenden Regimen.
- **Deterministischer Skill jenseits Tag ~10.** Physikalisch nicht vorhanden. Das Produkt muss
  dort die Verteilung zeigen und das auch sagen.
- **Ein Verfahren, das ohne Wartezeit *alles* belegt.** Wer das verspricht, hat entweder gegen
  Reanalyse verifiziert (misst Selbstähnlichkeit) oder gegen den Trainingszeitraum.

---

## 6. Verbesserungs-Einträge aus dieser Analyse (D-28)

Bis `improvements.md` wiederhergestellt ist, stehen die V-Einträge im Phasendokument
`audit/punktvorhersage-14tage.md` §5.
