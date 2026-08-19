# audit/waldbrand-ausbau.md — WB4: Ausbaustufe 2 (Gate GWB4)

> **Stand: 2026-08-14.** Diagnose **vor** dem ersten Handgriff. Vorgänger: WB0–WB3, MVP steht
> (Gates GWB0–GWB3, GWB5 grün). Plan: `plan.md` §WB4 · Gate: `checklist.md` §GWB4.

## 0. Das Ergebnis der Vorprüfung in einem Satz

**Von den fünf geplanten Ausbau-Layern sind zwei hart blockiert, einer ist etwas anderes als der
Plan annimmt, und zwei sind ohne Weiteres baubar.** Alles davon ist im echten Browser gegen die
echten Dienste gemessen, nicht aus der Quellenmatrix übernommen.

| Layer | Quelle | Befund |
|---|---|---|
| `fireDrought` | EDO `smian`/`smand` | ⛔ **blockiert** — MapLibre: `AJAXError: Failed to fetch (0)` |
| `fireVegetation` | EDO `fpanv` | ⛔ **blockiert** — derselbe Host, dieselbe Ursache |
| `fireFuel` | GWIS `fuel_map` | ✅ 12 Kacheln, fehlerfrei |
| `fireContext` | EEA Natura 2000 + CLC2018 | ✅ je 12 Kacheln, fehlerfrei |
| `fireBurnt` | EFFIS `ms:modis.ba.poly` | ⚠️ **nur 2016–2018** · NRT-Variante liefert **502** |
| — | FNEWS (Thünen) | ⛔ Lizenz ungeklärt — laut Plan **nicht bauen** |

## 1. Der EDO-Blocker — und warum ihn erst der Browser gezeigt hat

In WB0 antwortete `drought.emergency.copernicus.eu` in Node mit **HTTP 200** und einem
`access-control-allow-origin`-Header. Auffällig war nur, dass er **doppelt** kam: `*, *`. Das habe
ich damals als „vor WB4 im echten Browser gegenzuprüfen" vermerkt (V-202) — zu Recht.

Die Messung jetzt, in vier Stufen:

| Prüfung | Ergebnis | Bedeutung |
|---|---|---|
| `fetch(edo)` normal | **`TypeError: Failed to fetch`** | der Browser lehnt ab |
| `fetch(edo, {mode:'no-cors'})` | `type: 'opaque'`, status 0 | **der Server läuft** — CORS ist die Hürde, nicht die Erreichbarkeit |
| Gegenprobe `fetch(gwis)` | 200 OK | Browser und Netz sind in Ordnung, es liegt an EDO |
| als `<img>` | **geladen**, 256×256 in 486 ms | Bilder unterliegen keiner CORS-**Lese**prüfung |
| als MapLibre-`raster`-Source | **`AJAXError: Failed to fetch (0)`**, 0 Kacheln | **das ist die entscheidende Stufe** |

Die vierte Zeile ist der Punkt: Dass ein `<img>` lädt, heißt **nicht**, dass MapLibre die Kachel
verwenden kann. MapLibre holt Raster-Kacheln per `fetch` (um sie als WebGL-Textur hochzuladen) und
unterliegt damit der vollen CORS-Prüfung. Ein doppelter `Access-Control-Allow-Origin`-Header ist
nach Spezifikation ungültig — Chrome verwirft ihn, und zwar ohne dass eine Konsolenmeldung im
Seiten-Log landet.

**Konsequenz:** `fireDrought` und `fireVegetation` brauchen einen **neuen Rewrite in
`netlify.toml`**. Das ist nach `CLAUDE.md` eine **STOPP-&-FRAGEN-Zone**. Sie werden in dieser Phase
**nicht** gebaut, und der Rewrite wird **nicht** von mir eingetragen — nur vorgeschlagen (§4).

## 2. `fireBurnt` — und eine Korrektur an mir selbst

> ⚠️ **Nachtrag nach dem Bau (2026-08-14).** Der Abschnitt unten sagte, der Bestand ende **2018**.
> Das war **falsch**, und der Fehler lag in meiner Stichprobe: Die Vorprüfung lief mit
> `maxfeatures=50`, und die ersten 50 Features waren zufällig alle aus 2016–2018. Mit
> `maxfeatures=800` kommen **716 Flächen** zurück, und die Spanne reicht bis **2025** — die
> Statuszeile liest live „Brandflächen 2016–2025".
>
> Bemerkenswert daran ist, was die Fehlannahme **nicht** angerichtet hat: Weil die Zeitspanne
> aus den Daten gelesen und nicht fest eingetragen wird (§unten), hat der Layer von sich aus die
> richtige Beschriftung gewählt und den „Rückblick"-Hinweis **weggelassen**, weil der jüngste
> Brand keine 18 Monate zurückliegt. Die Vorsichtsmaßnahme gegen einen fremden Fehler (V-198) hat
> hier einen eigenen abgefangen. Der Text unten bleibt als Beleg stehen, wie der Befund entstand.

### Ursprüngliche Fassung (mit dem Stichprobenfehler)

`ms:modis.ba.poly` liefert für den DACH-Ausschnitt 46 Polygone mit den Attributen
`FIREDATE, FINALDATE, LASTUPDATE, COUNTRY, PROVINCE, COMMUNE, AREA_HA, BROADLEA, CONIFER`.
Die Feuerdaten reichen von **2016-04-21 bis 2018-09-20**. Die als „near real time" gedachte
Variante `ms:effis.nrt.ba` antwortet mit **HTTP 502** — auf beiden Diensten, zweimal geprüft.

Das ist **exakt dasselbe Muster wie bei den Hotspots** (V-198): ein Endpunkt, den die Quellenmatrix
als aktuell führt, liefert einen jahrealten Stand. Wer den Layer „Brandflächen" nennt und
kommentarlos zeichnet, behauptet eine Lage, die acht Jahre zurückliegt.

**Entscheidung:** Der Layer wird gebaut — aber als das, was er ist: ein **Rückblick auf frühere
Brandflächen**, mit der Zeitspanne **aus den Daten gelesen** statt fest eingetragen. Ändert EFFIS
den Bestand, wandert die Beschriftung automatisch mit. Fachlich ist das kein Verlust: Wo es schon
einmal gebrannt hat, sagt etwas über Bestand und Exposition — nur eben nichts über heute.

## 3. Was gebaut wird

| Layer | Quelle | Renderweg | Ehrlichkeitsauflage |
|---|---|---|---|
| `fireFuel` | GWIS `fuel_map` (WMS) | `raster` | Stand **2017**, 42 Vegetationskomplexe auf 13 NFFL-Klassen; keine Aussage über den heutigen Zustand |
| `fireContext` | EEA Natura 2000 (Layer `0`) + CLC2018 (Layer `1`) | `raster` | **CH nicht enthalten** (Nicht-EU) — das muss dastehen, sonst liest sich die leere Schweiz wie „keine Schutzgebiete" |
| `fireBurnt` | EFFIS `ms:modis.ba.poly` (WFS) | `fill` + `line` | Zeitspanne **aus den Daten**; heißt „frühere Brandflächen", nicht „Brandflächen" |

**Nicht gebaut, mit Begründung:** `fireDrought` und `fireVegetation` (Transportzone, §1) · FNEWS
(Lizenzwiderspruch CC BY-SA vs. dl-de/by-2-0, beide Lizenzseiten 404 — laut `plan.md` erst nach
schriftlicher Klärung durch Thünen) · OSM-Waldflächen (wären eine reine Renderebene; ohne
Kachelserver hieße das, `.osm.pbf` im Browser zu verarbeiten — das ist eine eigene Phase, nicht ein
Nebenprodukt) · Global WUI (nur als Zenodo-ZIP, kein Dienst).

## 4. Vorschlag für Jan — nicht umgesetzt

Für EDO wäre der Rewrite ein Zweizeiler nach dem Muster der bestehenden fünf:

```toml
# Copernicus EDO/GDO — Dürre- und Vegetationsindizes. Der Dienst sendet
# `access-control-allow-origin` DOPPELT (`*, *`); das ist ungültiges CORS, und
# MapLibre scheitert daran mit `AJAXError: Failed to fetch (0)`. Am 2026-08-14
# im Browser gegengeprüft: der Server antwortet (no-cors → opaque), nur die
# Freigabe ist unbrauchbar.
[[redirects]]
  from   = "/_edo/*"
  to     = "https://drought.emergency.copernicus.eu/:splat"
  status = 200
  force  = true
```

Ein **einfacher Rewrite**, keine Edge Function: Es geht nur um den kaputten Header, nicht um
Caching. `docs/API.md` §7 spräche ohnehin gegen einen Durable-Cache auf Gefahrenangaben.
**Das ist Jans Entscheidung; diese Phase trägt ihn nicht ein.**

## 5. Risiken

| # | Risiko | Gegenmaßnahme |
|---|---|---|
| A1 | Ein weiterer Endpunkt entpuppt sich als Archiv | Bei jedem neuen Layer die **Datumsspanne aus den Daten** lesen und anzeigen, nie fest eintragen |
| A2 | Natura 2000 endet an der CH-Grenze und liest sich als „keine Schutzgebiete" | Hinweis im Steckbrief **und** im Readout, analog zur AT-Lücke |
| A3 | Fünf zusätzliche Raster über der EU-Fläche ⇒ Kachelflut | Ausbau-Layer bleiben **default-off**, keiner ist in einem Preset |
| A4 | `totalJs` reißt erneut die Grenze | Die neuen Layer sind Quellen-Konfiguration, kein neuer Rechenpfad — Zuwachs klein halten, Budget messen |
