# Punkt-Cron: Stufe t1 steht seit dem 17.11.2026 — Diagnose (Phase PT1)

> Stand 19.11.2026, 08:15 UTC. Nur Diagnose, **kein Code und kein Workflow geändert**. Auftrag: „mach eine diagnose von t1“
> (Jan, 19.11.). Belege liegen in `audit/punkt-cron-t1-stillstand/`.

## 1 Befund in drei Sätzen

Der t1-Würfel (0–48 h, 0,05°) wird seit dem Lauf **2026111715** nicht mehr veröffentlicht: jeder t1-Job seit dem 17.11.
19:42 UTC läuft in die Job-Frist von 45 Minuten und wird abgebrochen, immer im Schritt „Build point cube — t1“, der
Publish-Schritt wird übersprungen. Der Bau hängt an der Quelle `claef` (GeoSphere `grid/forecast/nwp-v2-1h-1km`): der
Endpunkt antwortet zurzeit abwechselnd mit Hängern, HTTP 502, HTTP 503 und selten mit 200. Die Download-Schicht des
Producers hat keine Gesamtfrist je Abruf, deshalb wartet der Bau länger als die Job-Frist, statt die Quelle fallen zu
lassen.

## 2 Messungen

### 2.1 Was veröffentlicht ist

`point/index.json` (veröffentlicht 19.11. 05:55 UTC): `latestByTier` t1 = **2026111715**, t2 = 2026111900,
t3 = 2026111812. `sea/v1/status.json`: Wind zuletzt am 17.11. 17:38 UTC gerechnet (V-SG-9).

Der Lauf 2026111715 reicht bis 19.11. 15 UTC (Lauf + 48 h, gerechnet). Danach trägt t1 keine Stunde in der Zukunft
mehr. Was der Client dann zeigt, ist **nicht geprüft**.

### 2.2 Verlauf der t1-Jobs (GitHub-Actions-API, 600 Läufe des Workflows `point` seit 01.11.)

| Tag | t1 fertig | t1 in die Frist gelaufen |
|---|---|---|
| 01.–10.11. | 7–8 je Tag | 0 |
| 11.11. | 7 | 1 |
| 12.11. | 4 | 3 |
| 13.11. | 4 | 4 |
| 14.11. | 2 | 5 |
| 15.11. | 2 | 6 |
| 16.11. | 4 | 3 |
| 17.11. | 2 | 6 |
| 18.11. | 0 | 8 |
| 19.11. (bis 06 UTC) | 0 | 2 |

- Jeder abgebrochene Job endet im Schritt „Build point cube — t1“ nach 2 627–2 670 s (Frist `timeout-minutes: 45`).
- Fertige Bauten der letzten Tage: 955–1 719 s; im Oktober höchstens 16,5 min.
- Der Workflow sieht in der Übersicht grün aus, weil die stündlichen `stations-s`-Läufe und t2/t3 durchlaufen.
- Die Job-Protokolle selbst sind ohne Jans Anmeldung nicht lesbar (HTTP 403).

### 2.3 Was sich nicht geändert hat

- Producer `scripts/point/build-point-cube.mjs` und Adapter: unverändert seit `a02f2b5c` (30.09.).
- Terminregister `SCHEDULED_CHANGES`: nächster Termin 30.11. — nicht der Fall vom 19.10.
- DWD-Lieferung pünktlich; die Workflows `ruc` und `build` sind nicht langsamer geworden.
- Letztes gutes Manifest (`point/2026111715/run.json`): 0 gedrosselt, 0 Fehler, `claef`-Spur 159 s.

### 2.4 Nachbau lokal (Producer von `origin/main`, Node 22.17.0, kalter Cache)

Mit allen acht Quellen (`build-mit-claef.txt`), Start 06:18:43 UTC:

| UTC | Ereignis |
|---|---|
| 06:25:00 | `claef t2m`: `terminated` |
| 06:26:21 | Quantile aus `claef_eps` fertig — der Ensemble-Datensatz liefert |
| 07:04:40 | `claef u10`: HTTP 502 — nach ≈ 39 Minuten an EINER Adresse |
| 07:08:49 | `claef v10`: HTTP 502 |
| 07:11:02 | `claef gust`: HTTP 502 |
| 07:58:57 | von mir beendet; seit 07:11 keine Zeile mehr, 47 Minuten an der nächsten Adresse |

Über 100 Minuten ohne Ergebnis, vier Fehler gezählt — die Quelle fällt erst beim fünften (`POINT_SRC_MAX_ERRORS`).

Gegenprobe ohne `claef` (`--only=icon_d2,icon_d2_eps,icon_ch1_eps,claef_eps,icon_eu,ifs_hres,aifs_single`,
`build-noclaef.txt`), Start 07:59:33 UTC: **fertig nach 706 s**, 208 Chunks, 82,5 MiB, Manifest in derselben Form wie
der letzte gute Lauf (Schema 6, gleiche Schlüssel). Einschränkung: 920 von 2 325 Dateien kamen aus dem Cache des ersten
Laufs, darunter `claef_eps`; die Zeit ist also eine Untergrenze.

### 2.5 GeoSphere direkt (`geosphere-sample.txt`, 12 Proben 08:00–08:12 UTC)

| Abruf | 200 | 502 | 503 | keine Antwort in der Frist |
|---|---|---|---|---|
| `nwp-v2-1h-1km/metadata` (Frist 15 s) | 3 | — | 3 | 6 |
| `nwp-v2-1h-1km` kleines netCDF-Fenster (Frist 60 s) | 3 (45–52 s) | 4 | 3 | 2 |
| `ensemble-v2-1h-1km/metadata` (Frist 15 s) | 12 | — | — | 0 |

- Der Text der 503-Antwort ist vom Gateway: `failure to get a peer from the ring-balancer` — kein Ratenlimit (der
  Zähler stand bei 45 von 240 je Stunde frei).
- Der eingestellte `nwp-v1-1h-2500m` antwortet auf `/metadata` in 0,3 s mit 200; `nwp-v2-1h-2500m` gibt unter
  `grid/forecast` 404 (3 von 3 Proben). Keinen der beiden liest der Producer.

## 3 Ursache

1. **Auslöser (außen):** das Backend hinter `nwp-v2-1h-1km` bei GeoSphere ist instabil. Nur t1 liest `claef`, deshalb
   steht nur t1.
2. **Warum daraus ein Stillstand wird (bei uns):** `fetchBytes` in `scripts/point/adapters/shared.mjs:214` ruft `fetch`
   ohne Abbruch-Signal. Ein Abruf endet erst, wenn die Gegenseite die Verbindung schließt oder Node von sich aus
   aufgibt; fünf Versuche je Adresse; 503 zählt als Drosselung und darf bis `THROTTLE_MAX_WAIT_MS` = 10 min je Adresse
   warten (`shared.mjs:97`), ohne einen Versuch zu verbrauchen. Eine Obergrenze für die ganze Adresse oder die ganze
   Quelle gibt es nicht. Gemessen: 39 Minuten an einer Adresse, die Job-Frist ist 45.
3. **Warum es niemand sah:** der Wächter `health-watch.yml` ist seit 17.11. 22 UTC rot (t1 älter als 7 h), aber 68
   seiner letzten 84 Läufe waren ohnehin rot.

## 4 Was nicht bewiesen ist

- **Dass die Runner an derselben Stelle hängen.** Geschlossen aus dem Muster (gleicher Schritt, nur t1, Laufzeit bis
  zur Frist) und dem Nachbau. Der Beweis steht im Protokoll eines abgebrochenen Jobs — nur mit Jans Anmeldung lesbar.
- **Seit wann GeoSphere flattert.** Gemessen ist nur der 19.11. 06–08 UTC. Dass es am 11.11. begann und am 17.11.
  dauerhaft wurde, folgt allein aus der Tabelle in §2.2.
- **Warum GeoSphere flattert.** Jans Hinweis (19.11.): `nwp-v1-1h-2500m` trägt seit 16.11. das Banner „veraltet“, Daten
  bis 06.11.; `ensemble-v1-1h-2500m` endete am 04.11. Wir lesen beide nicht. Mehr Last auf v2 seit dem Ende von v1 passt
  zeitlich, ist aber eine Vermutung.
- **Node 22.23.5** (11.11., Sicherheits-Release an tls/http) fällt zeitlich mit dem Beginn zusammen. Der Nachbau hing
  mit Node 22.17.0 genauso ⇒ unwahrscheinlich, nicht eigens geprüft.

## 5 Folgen

- buscosun Fusion rechnet 0–48 h auf dem Lauf vom 17.11. 15 UTC; ab 19.11. 15 UTC liegt keine t1-Stunde mehr voraus.
- Seewetter: keine Wind-Auffrischung seit 17.11. 17:38 UTC (V-SG-9); die Etappe (Phase AM) hängt am selben Würfel.
- t2 und t3 sind aktuell.

## 6 Befunde und Vorschläge (Stand der Diagnose; V-PT1-1 bis V-PT1-3 sind umgesetzt, s. §8)

| Nr. | Befund / Vorschlag | Mehrwert | Skizze |
|---|---|---|---|
| V-PT1-1 | Kein Abruf hat eine Gesamtfrist | Eine kranke Quelle kostet Minuten statt den ganzen Lauf | `AbortSignal.timeout(…)` in `fetchBytes` / `fetchJson`; ein Abbruch ist ein Fehler, nie „nicht vorhanden“ (Lehre `AbortError` ≠ absent); Frist `set`, an den größten guten Abrufen messen |
| V-PT1-2 | Eine Quelle fällt nach fünf Fehlern, nicht nach Zeit | t1 erscheint auch bei Ausfall eines Lieferanten, mit `dropped` im Manifest | Zeitbudget je Quelle (Wanduhr) neben `POINT_SRC_MAX_ERRORS`; nur `POINT_SRC_MAX_ERRORS=1` hilft nicht, schon der erste Fehler dauerte 6 bzw. 39 min |
| V-PT1-3 | Ein 503 des Gateways (Ausfall) wird wie ein Ratenlimit behandelt | Ausfall und Drosselung werden unterschieden | 10-Minuten-Budget nur, wenn die Antwort `Retry-After` oder einen erschöpften Ratenlimit-Zähler trägt (Köpfe der 503-Antwort vorher lesen — nicht gemessen); sonst gewöhnlicher Fehler |
| V-PT1-4 | Der Wächter ist dauerrot und wird überlesen | Ein stehender Würfel fällt am selben Tag auf | die roten Dauerprüfungen bereinigen oder t1-Alter als eigenen Job mit eigener Meldung |
| V-PT1-5 | Der Würfel sagt nicht, dass `claef` fehlt, wenn t1 ohne die Quelle gebaut wird | Ehrlichkeit in Österreich: 1-km-Modell fehlt | prüfen, was Panel und Quellenzeile aus `sources[].dropped` machen, bevor V-PT1-2 scharf geht |

## 7 Entscheidungen für Jan

> **E-PT1-2 entschieden (Jan, 19.11.): „setze Punkt 2 um und trigger danach einen t1 lauf im buscosun data“** — s. §8.
> E-PT1-1 entfällt damit, E-PT1-3 und E-PT1-4 bleiben offen.

- **E-PT1-1 — Sofort wieder liefern?** Im Daten-Repo den t1-Schritt von `point.yml` vorübergehend mit
  `--only=icon_d2,icon_d2_eps,icon_ch1_eps,claef_eps,icon_eu,ifs_hres,aifs_single` starten. Lokal gemessen: 706 s,
  gleiche Manifest-Form. Preis: kein deterministisches C-LAEF in t1, bis die Zeile wieder raus ist; wie die Anzeige das
  ausweist, ist ungeprüft (V-PT1-5). Workflow-Änderung und Dispatch sind Jans Gate.
- **E-PT1-2 — Dauerhaft beheben?** V-PT1-1 bis V-PT1-3 im Producer (Download-Schicht, STOPP & FRAGEN). Danach kann
  E-PT1-1 zurück.
- **E-PT1-3 — Beweis nachholen?** Protokoll eines abgebrochenen t1-Jobs herunterladen (Actions → `point` → Job `t1` →
  „Download log archive“); die letzten Zeilen vor dem Abbruch entscheiden §4, erster Punkt.
- **E-PT1-4 — GeoSphere fragen?** Meldung an den Data Hub mit den Zahlen aus §2.5.

## 8 Umsetzung (19.11.2026, E-PT1-2)

### 8.1 Was geändert ist

| Datei | Änderung |
|---|---|
| `scripts/point/adapters/shared.mjs` | Frist je Abruf für Kopf und Körper (`POINT_FETCH_TIMEOUT_S`, Standard 120 s) an allen vier Netzwegen (`fetchBytes`, `fetchJson`, `headOk`, `fetchRanges`); kein neuer Versuch, sobald die Fehlversuche einer Adresse 1,5 Fristen gekostet haben (ein Hänger: zwei Versuche, 240 s); 503 ohne `Retry-After` = Ausfall, gewartet wird 1, 2, 4, 8, 16 s bis höchstens `POINT_OUTAGE_WAIT_S` (Standard 60 s) |
| `scripts/point/sourceBudget.mjs` (neu) | Zeitbudget je Quelle und Stufe: Dauer der fehlgeschlagenen Aufrufe, dazu Aufrufe ab 30 s, sobald die Quelle schon einen Fehler hatte; über `POINT_SRC_MAX_LOST_S` (Standard 300 s) fällt die Quelle heraus |
| `scripts/point/build-point-cube.mjs` | `safeCall` bucht jeden Aufruf in das Budget und schreibt den Grund als `dropped`; die Zählregel (`POINT_SRC_MAX_ERRORS`) bleibt daneben |
| `scripts/verify-point-fetch.mjs` (neu), `package.json` | `npm run verify:point-fetch` — echte Funktionen gegen einen lokalen Server, der hängt, den Körper abbricht, 503/429/502/404 gibt |

Unverändert: 429 und 503 mit `Retry-After` dürfen weiter bis zu 10 Minuten warten (Lauf 7 vom 11.09., ECMWF);
404 bleibt „nicht vorhanden“; schnelle Fehler behalten fünf Versuche. Eine abgelaufene Frist ist ein Fehler mit dem
Text „Frist von 120 s abgelaufen“, nie „nicht vorhanden“. Alle vier Zahlen sind **gesetzt**, nicht gemessen; Anhalt
aus dem letzten guten Lauf 2026111715: größte Dateiklasse 9,8 s je Datei (ICON-D2-EPS, 23,5 MiB), `claef` 4,2 s,
ein Aufruf je Quelle im Mittel 0,7–1,8 s.

### 8.2 Die drei Prüfungen vor dem Bau

1. **Halb geladene Quelle:** der Würfel mittelt je Zelle, Größe und Stunde über die Quellen, die dort einen Wert haben
   (`consumeHour`); fehlt `claef` an einer Größe, fehlt eine Stimme, `srcCount` zählt sie nicht. Kein Sonderfall nötig.
2. **Anzeige:** `sources[].dropped` steht im Manifest und der Client liest es (`src/point/manifest.ts`,
   `cubeSource.ts:992`); ob Panel und Quellenzeile es dem Nutzer sagen, ist weiter ungeprüft (V-PT1-5 bleibt offen).
3. **Größe der Fristen:** s. Anhalt in §8.1 — 120 s sind das Zwölffache des langsamsten guten Mittels.

### 8.3 Belege

- **Rot vor der Änderung:** `verify:point-fetch` 7/18 — jeder Hänger und der 503-Ausfall standen nach 6 bzw. 8 s noch
  aus („pending“).
- **Grün danach:** `verify:point-fetch` 24/24; `verify:point-data` 1028/1028 (das Gate, das der Workflow vor jedem Bau
  fährt).
- **Voller Durchlauf mit hängender Quelle** (`build-claef-haengt-nach-fix.txt`, `proxy-claef-haengt.txt`): Producer aus
  dem Arbeitsbaum, Standardwerte, `--only=claef,ifs_hres,aifs_single`, GeoSphere durch einen lokalen Stellvertreter
  ersetzt, der `/metadata` durchreicht und jeden Datenabruf hängen lässt. Ergebnis: vier Abrufe je 120 s, zwei Fehler,
  `claef` fällt nach 481 s heraus, **Bau fertig nach 517 s**, Exit 0, `validateRunManifest` 0 Fehler,
  `tiers[0].dropped = [{ id: "claef", … }]`. Vor der Änderung endete derselbe Fall nicht (§2.4).

### 8.4 Was offen bleibt

| Nr. | Befund | Mehrwert | Skizze |
|---|---|---|---|
| V-PT1-6 | `scripts/point/adapters/meteoswiss.mjs:183` ruft die STAC-Sammlung mit nacktem `fetch` ohne Frist | derselbe Fehler kann t1 über MeteoSchweiz treffen | über `fetchJson` führen |
| V-PT1-7 | Ein hängender `HEAD` endet als „Lauf gibt es nicht“ (`headOk` gibt `false`) | ein Netzfehler wird nicht als fehlender Lauf gebucht | nach verbrauchtem Zeitbudget werfen statt `false`; Aufrufer prüfen |
| V-PT1-8 | Ein hängender Lieferant kostet im schlimmsten Fall 8 Minuten (zwei Adressen je zwei Fristen) | mehr Luft unter der Job-Frist | Frist je Host aus den Manifesten messen und senken |
| V-PT1-9 | `JOB_MAX_MIN(t1)` = 24 und die Regeln A–C rechnen ohne diese 8 Minuten | die Abstandsregeln zur Kartenlinie stimmen auch im Störfall | nach einer Woche Laufzeiten aus den Manifesten nachziehen |

V-PT1-4 (Wächter dauerrot) und V-PT1-5 (Anzeige) bleiben offen; solange GeoSphere flattert, erscheint t1 **ohne
deterministisches C-LAEF**.

### 8.5 Am Runner (19.11.2026, Commit `dd162736` auf `origin/main` seit 09:10 UTC)

| Lauf | Start UTC | Region | Ergebnis | `claef` | Bau |
|---|---|---|---|---|---|
| #1943 (alter Code, zum Vergleich) | 04:59 | eastus2 | abgebrochen nach 45 min | drei Abrufe `terminated`, nie herausgefallen | Profil +6:42, Druckflächen +11:05, σ_ens +12:45 nach Start |
| #1949 (manuell, `tiers=t1`) | 09:29 | centralus | **abgebrochen nach 45 min** | zweimal „Frist von 120 s abgelaufen“, heraus nach 501 s (10 min nach Start) | Profil +12:37, Druckflächen +18:13, Felder nie fertig |
| #1953 (planmäßig 10:40) | 10:51 | — | **veröffentlicht 11:15:14 UTC, t1 = 2026111909** | „HTTP 503 (Ausfall, kein Retry-After)“, 4 Fehler, heraus nach 400 s | 23 min 46 s (discover 248 s, fields 1 169 s) |

- **E-PT1-3 ist damit beantwortet:** das Protokoll von #1943 zeigt den alten Code an genau der vermuteten Stelle
  (`claef` td2m/u10/v10 an `nwp-v2-1h-1km`: `terminated`). Die Runner hingen an GeoSphere.
- **#1953 belegt die Änderung:** beide neuen Regeln griffen (Ausfall-503 und Zeitbudget), `claef_eps` fiel mit sechs
  HTTP 500 über die alte Zählregel. Manifest `point/2026111909/run.json`: `dropped` = `claef_eps`, `claef`; die übrigen
  sechs Quellen ohne Fehler. **Dieser t1 trägt weder C-LAEF noch die Quantile aus C-LAEF-EPS** („Quantile aus
  claef_eps — 0 Stunden, 49 ohne“).
- **#1949 belegt, dass es nicht reicht:** das Warten auf `claef` kostete 10 Minuten, in denen alle Feldbahnen standen
  (Verbraucher in Stundenordnung, `lanes.mjs`), und auf diesem Runner liefen die DWD-Blöcke 2- bis 5-mal langsamer als
  sonst (Profil 648 s gegen 121–282 s). Ursache der Langsamkeit **nicht bewiesen**: lokal ist die neue Schicht nicht
  langsamer als die alte (sechs Vergleichsbauten `--only=icon_d2`, auch mit Node 22.23.4 wie am Runner und mit Fristen,
  die mitten im Lauf ablaufen: alt 145–185 s, neu 110–174 s); #1953 lief mit demselben Code normal schnell. Der einzige
  gemessene Unterschied ist die Region des Runners.
- Die Node-Vermutung aus §4 ist erledigt: der Runner fährt 22.23.4, nicht 22.23.5.

| Nr. | Befund | Mehrwert | Skizze |
|---|---|---|---|
| V-PT1-10 | 10 Minuten Warten auf GeoSphere sind zu teuer: auf einem langsamen Runner reißt der Job die Frist trotzdem | t1 erscheint auch dann | **gebaut, nicht committet (E-PT1-5):** Frist je Host (`timeoutMsFor`, GeoSphere 30 s statt 120 s) und Budget je Quelle (`SRC_MAX_LOST_MS_BY_SOURCE`, `claef`/`claef_eps` 45 s = eine hängende Adresse) ⇒ Warten ≈ 1 statt 10 Minuten; `verify:point-fetch` 29/29, `verify:point-data` 1028/1028 |
| V-PT1-11 | „Langsam, aber ohne Fehler“ fängt das Zeitbudget nicht: Lauf #1887 (17.11.) brauchte für `claef` 1 464 s bei 0 Fehlern | auch dieser Fall kostet nicht mehr den Lauf | mit der 30-s-Frist aus V-PT1-10 wird aus 44 s je Fenster eine abgelaufene Frist |
| V-PT1-12 | Die Laufzeit hängt am Runner (955–1 719 s bei gesunden Läufen, #1949 noch langsamer) | Abstandsregeln und Job-Frist rechnen mit dem langsamen Fall | Region und Blockzeiten je Lauf ins Manifest schreiben, nach zwei Wochen `JOB_MAX_MIN` nachziehen |
| V-PT1-13 | Ohne `claef_eps` hat t1 keine Quantile (q10/q90) | sichtbar machen, was der Bandbreite dann fehlt | prüfen, was buscosun Fusion und die Seewetter-Bandbreite (Phase SU) aus einem t1 ohne Quantil-Ebenen machen |

**E-PT1-5 (Jan):** V-PT1-10 pushen? Preis: an einem zähen, aber noch lieferndem GeoSphere-Tag fehlt C-LAEF früher als
nötig (alles über 30 s je Fenster gilt als Ausfall; gesund sind 4,2 s).

## 9 Belege

- `audit/punkt-cron-t1-stillstand/build-mit-claef.txt` — Nachbau mit allen Quellen (§2.4).
- `audit/punkt-cron-t1-stillstand/build-noclaef.txt` — Gegenprobe ohne `claef` (§2.4).
- `audit/punkt-cron-t1-stillstand/geosphere-sample.txt` — zwölf Proben gegen GeoSphere (§2.5).
- Die Actions-Abfragen (§2.2) lagen nur im Temp-Ordner der Sitzung und sind nicht abgelegt; sie sind über
  `api.github.com/repos/jppetry/buscosun-data/actions/workflows/point.yml/runs` wiederholbar.
- `audit/punkt-cron-t1-stillstand/build-claef-haengt-nach-fix.txt`, `proxy-claef-haengt.txt` — voller Durchlauf nach der
  Änderung mit hängender Quelle (§8.3).
