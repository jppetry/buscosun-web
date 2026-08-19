# audit/waldbrand-layer.md — WB2: die fünf MVP-Layer (Gate GWB2)

> **Stand: 2026-08-14.** Diagnose **vor** dem ersten Handgriff (`CLAUDE.md`: Diagnose-First).
> Vorgänger: `audit/waldbrand-transport.md` (WB0, Quellen gemessen) und
> `audit/waldbrand-geruest.md` (WB1, Gerüst steht). Plan: `plan.md` §WB2 ·
> Gate: `checklist.md` §GWB2 · Protokoll: `tests.md` §WB-T2/§WB-T3.

## 0. Ausgangslage

Das Gerüst aus WB1 trägt fünf **leere** Layer mit korrekter Z-Ordnung, einen geklemmten Tagesregler
und die Skalentabellen. WB2 füllt sie mit Bytes. Alle Quellen sind in WB0 real gemessen — diese
Phase erfindet keine Endpunkte, sie setzt die gemessenen um.

**Vier Renderwege, nicht einer** — das ist der eigentliche Umfang dieser Phase:

| Layer | Weg | Neuer Code |
|---|---|---|
| `fireDanger` | MapLibre-`raster`-Source direkt gegen GWIS-WMS | URL-Bau + `TIME`, **kein Fetch im Client** |
| `fireIndexNational` CH | `fetch` → `geojson`-Source | Fetch + TTL + Farbe aus `level` |
| `fireIndexNational` DE | `fetch` je Station → `circle` | Stationsliste + gedeckeltes Nachladen + gzip |
| `fireHotspots` | `fetch` WFS → `geojson`-Source | Fetch + TTL + Fensterwahl |
| `fireBans` | `fetch` → `geojson`-Source | wie CH-Stufe, andere Collection |
| `fireWeather` | GRIB-Kette → `ScalarLayer` | **neuer Ein-Feld-Loader** `relhum_2m` |

## 1. Was wiederverwendet wird — und woher genau

| Baustein | Vorlage | Was daran wichtig ist |
|---|---|---|
| Ein-Feld-GRIB-Loader | `sources/iconD2Lpi.ts` (160 Z.) | nennt sich selbst „exakt das Böen-Muster": `resolveLatestRun` + `fetchStepField` aus `iconD2Precip`, RGBA-Canvas mit **R = Wert, A = Maske**, `onProgress` je Frame, gebündelte Nebenläufigkeit 4 |
| In-Memory-TTL | `sources/dwdCapAlerts.ts:59-62` | ein Modul-Cache `{run, at}` + `CACHE_TTL`; genau dieses Muster, nur mit **längerem** TTL für BAFU |
| geo.admin.ch | `sources/meteoSwissHail.ts` | im Repo produktiv, CORS bestätigt |
| `ScalarLayer` | `MapView.tsx:1443` (Böen) | `visRange` blendet irrelevante Flächen aus; **keine** DEM-Korrektur für ein 2-m-Diagnosefeld |
| Attribution | `dwdCapAlerts.ts:35-37` | zwei Formen: „Quelle: DWD" bei **Wiedergabe**, „Datenbasis: DWD, Rasterdaten bildlich wiedergegeben" bei **Ableitung** |
| Amtliche Deep-Links | `officialSources.ts` | Muster `warningsSourceFor` + `verifyOfficialSources()` |

## 2. Die sechs Entscheidungen, die vor dem Code feststehen müssen

**2.1 `fireDanger` braucht keinen Fetch.** Eine MapLibre-`raster`-Source setzt die Kachel-URL selbst
ab; wir bauen nur das Template mit `{bbox-epsg-3857}`. Das ist in WB0 als der funktionierende
Aufruf gemessen (200, PNG 512×512, 36–364 ms, `ACAO: *`). Folge: **kein `dataAge` aus einem
Response-Header** — die Referenzzeit ist der angeforderte `TIME`-Tag selbst, und genau das wird
beschriftet, statt eine Abrufzeit zu behaupten (`dataAge.ts:79`, Fall „keine Referenz").

**2.2 Die WBI-CSVs sind roh gzip-komprimiert.** In WB0 musste Node sie mit `gunzipSync` auspacken —
der DWD setzt also **kein** `Content-Encoding: gzip`, sondern liefert `.csv.gz` als Nutzlast. Im
Browser übernimmt das `DecompressionStream('gzip')` (Baseline-fähig, **keine neue Abhängigkeit**,
D-06 eingehalten). Defensiv beide Fälle behandeln: schickt der Proxy irgendwann doch
`Content-Encoding`, ist der Körper schon Klartext und das Entpacken muss übersprungen werden.

**2.3 Die DE-Ladestrategie ist entschieden und darf nicht aufgeweicht werden.**
`stations_list.txt` **einmal je Sitzung** (98 KB, die einzige Koordinatenquelle), Wert-CSVs nur für
Stationen im Viewport, **höchstens 60 gleichzeitig**, Tages-TTL, und aus jeder Datei zählt nur die
**letzte** Zeile. Ohne den Deckel wären es 484 Requests je Sitzung (V-200).

**2.4 CH ist ein Abruf je Sitzung.** Fair Use `geo.admin.ch`: TTL ≥ 1 h, kein Polling. Der Server
sendet selbst `Cache-Control: max-age=7200` — die Auflage ist also die Vorgabe der Quelle. Zwei
Collections teilen sich denselben Cache-Mechanismus: Gefahrenstufe und Feuerverbote.

**2.5 Die CH-Farbe wird abgeleitet, nicht gelesen.** Die Features tragen
`region_id, canton, level, name_*, title_*, valid_from` und **kein** `color` (WB0 gemessen). Die
Farbe kommt aus `FIRE_SOURCE_CH.scale` und die Legende sagt, dass sie unsere ist
(`colorOrigin: 'derived'`, schon in `fireModel.ts` verankert). `valid_from` ist die `dataAge`-
Referenz — damit liest der Wochenendfall als **Alter**, nicht als Aktualität (Risiko R4).

**2.6 `fireHotspots` zeigt kein `frp`.** Live liefert GWIS nur `id, acq_at, CLASS`. Einheitliche
Punktgröße, Fenster über die Typenamen `.today` / `.week`, und der Steckbrief benennt die Lücke
(V-199). Der EFFIS-Endpunkt aus dem ursprünglichen Plan wird **nicht** verwendet — sein Bestand
endet im Oktober 2021.

## 3. Fallstricke, die diese Phase kosten wird

| # | Fallstrick | Gegenmaßnahme |
|---|---|---|
| L1 | **Kein Durable-Cache auf amtlichen Stufen** (`docs/API.md` §7). Der bestehende `/_dwd_opendata` ist ein einfacher Rewrite ohne Edge-Cache — gut so. Für WBI **nicht** auf `/_dwd_grib` ausweichen (das cached 6 h durable) | WBI läuft über `/_dwd_opendata`, belegt im Netzwerk-Tab |
| L2 | **Layer-Fehler dürfen nicht als Leerstand aussehen.** „Keine Daten" und „keine Gefahr" sehen auf einer Karte identisch aus | Bei Fehler Layer **abschalten** + amtliche Quelle verlinken (Gate-Punkt WB-T2-6) |
| L3 | `fireWeather` ist ein **Treiber, kein Index** — die kumulativen FWI-Codes fehlen strukturell | Layername, Steckbrief und Legende sagen es; Muster: der Rotations-Layer |
| L4 | `relhum_2m` ohne Warm-Cron ⇒ Lauf per Verzeichnis-Scan. Der erste Abruf ist dadurch langsamer als bei den manifest-gestützten Layern | Lazy laden (erst beim Aktivieren), Ladezustand zeigen |
| L5 | `verifyOfficialSources()` (`officialSources.ts:98-147`) prüft heute nur Warnungen; ein Waldbrand-Zweig ohne Anpassung der Selbsttests bricht den Verifier | Zweig **und** Selbsttests zusammen erweitern |
| L6 | Die WMS-`TIME`-Dimension erwartet `YYYY-MM-DD` in **UTC** — `fireTime.dayToIsoDate()` liefert das bereits so und ist dagegen verifiziert | keine zweite Datumsrechnung einführen |
| L7 | Der DACH-Ausschnitt der WFS-Abfrage nutzt WFS 1.1.0 mit **lat,lon** — in WB0 an 200 Features belegt | Achsenreihenfolge nicht „korrigieren" |

## 4. Reihenfolge der Umsetzung

1. `src/fire/sources/gwisFwi.ts` — reiner URL-Bau, headless verifizierbar (kein Netz)
2. `src/fire/sources/gwisHotspots.ts` — WFS + TTL + Fenster
3. `src/fire/sources/bafuFire.ts` — CH-Stufe + Feuerverbote, ein Abruf je Sitzung
4. `src/fire/sources/dwdFireIndex.ts` — Stationsliste + gedeckeltes Nachladen + gzip
5. `src/sources/iconD2Relhum.ts` — Ein-Feld-Loader nach `iconD2Lpi`-Muster
6. Verdrahtung in `FireMap`/`FirePage`: Quellen, Steckbriefe, `dataAge`, Attribution
7. `officialSources.ts` Waldbrand-Zweig + `verify:official-sources` wieder grün
8. `scripts/seo/licenses.mjs` §`NON_MODEL_SOURCES` + `verify:fire-sources` (neu)

Die Schritte 1–4 sind ohne Netz prüfbar (reine Parser/URL-Bauer + injizierbarer `fetch`); Schritt 5
hängt an der bestehenden GRIB-Kette und wird gegen den Live-Lauf geprüft.
