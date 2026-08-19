# audit/waldbrand-transport.md — WB0: Transport- und Lizenz-Vorklärung (Gate GWB0)

> **Stand: 2026-08-14.** Phase **WB0** der Phase WB „Waldbrand DACH" (`plan.md` §Phase WB,
> `prompt-waldbrand-dach.md`). **Kein Produktivcode geschrieben** — Ergebnis sind zwei
> Prüfskripte unter `scripts/l0/`, zwei JSON-Belege unter `audit/l0/` und dieses Dokument.
>
> **Belege:** `audit/l0/cors-waldbrand.json` (22 Endpunkte) ·
> `audit/l0/waldbrand-payloads.json` (Nutzlast-Prüfung) ·
> Protokoll `tests.md` §WB-T0 · Gate `checklist.md` §GWB0.
>
> **Läufe:** `PROBE_TIMEOUT_MS=180000 node scripts/l0/probe-cors.mjs --group fire --json audit/l0/cors-waldbrand.json`
> und `node scripts/l0/probe-waldbrand-payloads.mjs --json audit/l0/waldbrand-payloads.json`,
> beide mit `Origin: https://buscosun.com`, 2026-08-14.

---

## 0. Das Ergebnis in drei Sätzen

**Die Abbruchbedingung ist nicht eingetreten.** `maps.effis.emergency.copernicus.eu` sendet
`Access-Control-Allow-Origin: *` auf WMS **und** WFS, beantwortet den OPTIONS-Preflight mit 200 und
liefert auf einen echten `GetMap` ein 512×512-PNG — der EU-Gefahrenindex ist damit **ohne neuen
Rewrite** direkt in eine MapLibre-`raster`-Source ladbar. **`netlify.toml` bleibt unangetastet, die
STOPP-Zone wird nicht betreten.**

Dafür haben drei andere Annahmen des Plans die Messung **nicht** überstanden: der Hotspot-Endpunkt
aus `plan.md` §WB2 liefert einen sechseinhalb Jahre alten Archivstand, der DWD-Waldbrandindex kommt
als **484 Einzeldateien** statt als eine Tabelle, und die Schweizer Gefahrenstufen-Features tragen
**keine Farbe**. Alle drei ändern den Zuschnitt von WB2, keine davon kippt die Phase.

**Unverändert bestätigt:** Das DWD-1-km-Raster existiert weiterhin nicht (404), also bleibt die
Interpolationsfrage (V-197) offen wie geplant.

---

## 1. CORS — die Frage, an der die Phase hing

Alle 22 Endpunkte der Gruppe `fire` waren erreichbar, kein einziger Fehlschlag. Die
Plausibilitätssperre des Skripts hat nicht ausgelöst, und die **Negativkontrolle trennt sauber**:
`opendata.dwd.de` antwortet ohne `Access-Control-Allow-Origin`, während 18 andere Hosts einen Wert
liefern. Der Lauf unterscheidet also tatsächlich zwischen „offen" und „zu" (WB-T0-7).

| Host | ACAO | Preflight | Bedeutung für die Umsetzung |
|---|---|---|---|
| `maps.effis.emergency.copernicus.eu` (GWIS + EFFIS, WMS + WFS) | `*` | 200 | **direkt**, kein Proxy, keine STOPP-Zone |
| `drought.emergency.copernicus.eu` (EDO) | `*, *` | 204 | direkt — ⚠️ der Header ist **doppelt** gesetzt, s. §6 |
| `image.discomap.eea.europa.eu`, `bio.discomap.eea.europa.eu` (EEA) | `https://buscosun.com` | 204 | direkt, aber **origin-spiegelnd** mit `Vary: Origin` |
| `geoservice.dlr.de` (DLR) | `https://buscosun.com` | — | direkt, origin-spiegelnd |
| `data.geo.admin.ch` (BAFU/swisstopo) | `*` | 200 / 403 | direkt — im Repo ohnehin produktiv (`meteoSwissHail.ts`) |
| `opendata.dwd.de` | *(keins)* | 405 | Proxy-Pflicht — der **bestehende** Rewrite `/_dwd_opendata` genügt |

Die Origin-Spiegelung bei EEA und DLR ist kein Problem, aber ein Merkposten: solche Antworten sind
pro Origin verschieden und dürfen nicht origin-übergreifend zwischengespeichert werden. `Vary: Origin`
ist bei EEA gesetzt, bei DLR **nicht** — was für WB4 relevant wird, nicht für den MVP.

`data.geo.admin.ch` beantwortet den OPTIONS-Preflight des GeoJSON-Assets mit **403**. Das ist
folgenlos, solange der Client einen *Simple Request* stellt (reines `fetch(url)` ohne eigene Header)
— dann gibt es keinen Preflight. **Konsequenz für WB2:** beim CH-Layer **kein** `If-None-Match`,
kein `Cache-Control`-Request-Header, kein `Authorization`. Sobald einer davon gesetzt wird, kippt der
Request in einen Preflight und der Layer stirbt an einem 403, das mit den Daten nichts zu tun hat.

### Was die Messung **nicht** beweist

Node erzwingt kein CORS; gemessen sind die gesendeten Header, nicht das Browser-Verhalten. Der
Beweis im engeren Sinn ist ein `fetch()` von der echten Seite — der fällt in **WB1** an, sobald es
eine Seite gibt. Angesichts von `ACAO: *` **plus** 200er-Preflight auf allen kritischen Endpunkten
ist das Restrisiko gering und rechtfertigt keine Verzögerung.

---

## 2. GWIS `ecmwf.fwi` — der Layer `fireDanger` ist buchstäblich abholbereit

`GetCapabilities` (190 KB, 0,4–1,0 s) meldet **231 Layer, davon 24 aus der `ecmwf.*`-Familie**,
darunter alle im Plan vorgesehenen: `ecmwf.fwi`, `.ffmc`, `.dmc`, `.dc`, `.isi`, `.bui`, `.anomaly`,
`.anomaly_sigm`, `.anomaly_day`, `.ranking` — und zusätzlich `ecmwf.mark5.kbdi`.

- **`TIME`-Dimension: `2018-01-01/2099-12-31`** — der gemeinsame Tagesregler aus `fireTime.ts` kann
  den WMS also direkt über den `TIME`-Parameter steuern. Bestätigt `architecture.md` §14.3.
- **`EPSG:3857` wird angeboten** — der Weg, den MapLibre über `{bbox-epsg-3857}` selbst geht.

Drei `GetMap`-Aufrufe desselben DACH-Ausschnitts, um die Achsenfalle auszuschließen:

| Variante | HTTP | Zeit | Antwort |
|---|---|---|---|
| `1.3.0` + `CRS=EPSG:3857`, BBOX in Metern | 200 | 36–364 ms | PNG 512×512, 11.645 B |
| `1.3.0` + `CRS=EPSG:4326`, BBOX **lat,lon** | 200 | 34–287 ms | PNG 512×512, 11.775 B |
| `1.1.1` + `SRS=EPSG:4326`, BBOX **lon,lat** | 200 | 32–282 ms | PNG 512×512, 11.775 B |

Die beiden 4326-Varianten liefern **byte-gleich große** Bilder — der Server löst die
Achsenreihenfolge also konventionsgerecht auf, und die 3857-Variante ergibt erwartungsgemäß ein
anderes (weil anders projiziertes) Bild. **Für WB2 heißt das: der Standardweg der MapLibre-
`raster`-Source funktioniert unverändert; die Achsenreihenfolge muss nicht umgangen werden.**

---

## 3. ⚠️ Befund 1 — der Hotspot-Endpunkt aus dem Plan liefert Daten von 2019/2021

`plan.md` §WB2 und `docs/DATA_SOURCES.md` §W.2 nennen für `fireHotspots`:

```
maps.effis.emergency.copernicus.eu/effis?service=WFS&request=GetFeature&typename=ms:viirs.hs…
```

und beschreiben die Quelle als **NRT**. Gemessen liefert genau diese URL Erfassungszeiten von
**2019-11-13** — und ein OGC-Filter auf `acq_at` grenzt den Bestand ein auf **Ende Oktober 2021**:

| Filter `acq_at >` | Features |
|---|---|
| `2019-01-01` | vorhanden (2019-11-13) |
| `2021-06-01` | vorhanden (bis 2021-10-01) |
| `2021-11-01` | **0** |
| `2022-01-01` / `2024-01-01` / `2026-01-01` | **0** |

Der Filtermechanismus arbeitet also korrekt — der **Datenbestand des EFFIS-WFS ist eingefroren**.
Wer die Plan-URL umsetzt, baut einen Layer, der aussieht wie eine Echtzeitlage und in Wahrheit
Brände aus dem Jahr 2021 zeigt. Das ist genau die Sorte stiller Falschaussage, die D-04 verbietet.

### Die Auflösung liegt im selben Dienst, nicht in einer neuen Quelle

Der **GWIS**-Zweig desselben Hosts führt Fenster-Layer, die `docs/DATA_SOURCES.md` §W.2 bereits als
🟢 gelistet, aber nicht einzeln benannt hat. Gemessen am 2026-08-14:

| Typename (Dienst `gwis`) | Zeit | Erfassungszeiten | Bewertung |
|---|---|---|---|
| `ms:viirs.hs.today` | 0,6–1,6 s | 2026-08-13 | **live** — das 24-h-Fenster aus dem Plan |
| `ms:viirs.hs.week` | 0,7–1,9 s | 2026-08-07 … 2026-08-12 | **live** — das 7-d-Fenster aus dem Plan |
| `ms:all.hs.today` | 0,9 s | 2026-08-13 | live, alle Sensoren |
| `ms:viirs.hs` (ohne Fenster) | 14–48 s | ab 2025-08-14 | rollierendes Jahr, **zu langsam** |

Die Capabilities führen die Fenster systematisch: `.today`, `.week`, `.month`, `.season` — jeweils
für `viirs`, `viirs.n20`, `viirs.n21`, `viirs.suomi`, `modis`, `s3` und `all`.

**Der DACH-Ausschnitt funktioniert**: `ms:viirs.hs.week` mit `bbox=45.5,5.5,55.5,17.5,EPSG:4326`
gab 200 Features zurück, **alle 200 geometrisch innerhalb DACH** — die WFS-1.1.0-Achsenreihenfolge
(lat,lon) ist damit belegt, nicht angenommen. Erfassungszeiten 2026-08-07 bis 2026-08-12.

Das ist **keine Quellensubstitution**: derselbe Betreiber (JRC/Copernicus EMS), dieselbe Lizenz
(CC BY 4.0), derselbe Host, kein Key, kein Limit. Es ist eine **Korrektur der URL** in `plan.md`
und `docs/DATA_SOURCES.md` §W.2. Die Korrektur ist unten trotzdem als Entscheidungspunkt gelistet,
weil sie eine schriftlich fixierte Quellenangabe ändert.

### ⚠️ Befund 1b — `frp` gibt es live nicht

Die attributreiche Fassung liegt ausgerechnet auf dem **eingefrorenen** EFFIS-Bestand:

| Dienst / Layer | Eigenschaften |
|---|---|
| EFFIS `ms:viirs.hs` (Stand 2019/2021) | `id, acq_at, lon, lat, frp, confidence, night, satellite, scan, track, ver, bright_mir, bright_tir, ndvi, cci_class, mask_flag, upload_at, checked, flag_lc, gid_0, hs_mask_flag, CLASS` |
| GWIS `ms:viirs.hs.today` / `.week` (live) | **`id, acq_at, CLASS`** |
| GWIS `ms:viirs.hs` + Zeitfilter (live, 48 s) | **`id, acq_at, CLASS`** |
| GWIS `ms:viirs.hs.today.query` | Verbindung abgebrochen — per WFS nicht bedienbar |

**Damit sind zwei Vorgaben aus dem Plan nicht erfüllbar:** `plan.md` §WB2 („`circle`, Radius nach
`frp`") und `tests.md` WB-T2-9 („zeigt `frp`, Erfassungszeit, Satellit"). Live verfügbar sind
Position, Erfassungszeit und `CLASS`. **Das ist eine Entscheidung für Jan (§7, Punkt 2)** — ich habe
weder den Radius umdefiniert noch die im Katalog als 🟡 „nur Fallback" geführte
FIRMS-Regions-CSV zur Primärquelle erhoben.

---

## 4. ⚠️ Befund 2 — der DWD-Waldbrandindex kommt als 484 Einzeldateien

Spaltennachweis erbracht, über den **bestehenden** Rewrite `/_dwd_opendata` (WB-T0-5):

```
StationsID;Termin;wbi_0;wbi_1;wbi_2;wbi_3;wbi_4;wbi_5;wbi_6
991;20260226 04:13;1;1;2;2;2;3;2
```

Für Grasland identisch mit `glfi_0`…`glfi_6`. Beide Verzeichnisse: **HTTP 200 über
`https://buscosun.com/_dwd_opendata/…`**, also durch die Produktions-Rewrite hindurch. `ACAO` fehlt
dort erwartungsgemäß und ist auch nicht nötig — der Rewrite macht die Antwort *same-origin*
(`netlify.toml:27-31`).

**Was der Plan nicht vorhergesehen hat:** `recent/` enthält **484 Dateien, eine je Station** —
nicht eine Tabelle mit 484 Zeilen. Jede Datei ist eine **Zeitreihe** über 170 Termine (ab
2026-02-26), in der erst die *letzte* Zeile den aktuellen Tag 0…+6 trägt. Für den Layer
`fireIndexNational` (DE) heißt das ohne Gegenmaßnahme: **484 HTTP-Requests je Sitzung**
(je ~0,9–1,0 KB gzip, zusammen ~450 KB) — und aus jeder Datei werden 169 von 170 Zeilen verworfen.

**Was der Plan ebenfalls nicht kennt und was ihn rettet:** Im selben Verzeichnis liegen zwei
Dateien, die nicht dem Stationsmuster folgen:

- `…_v2-3--0_stations_list.txt` — **97.970 B, 484 Stationen, mit `Höhe in m`, `Breite`, `Länge`,
  `Name`, `Bundesland`.** Ohne diese Datei ließe sich **kein einziger WBI-Punkt** verorten, denn die
  Wert-CSVs enthalten nur die `StationsID`. Sie ist in `docs/DATA_SOURCES.md` §W.1 nicht erwähnt.
- `…_v2-3--0_stations_map.png` — Übersichtsbild, für uns ohne Belang.

Ebenfalls vorhanden: `…/woodland/forecast/` enthält `historical/`, `recent/`,
`BESCHREIBUNG_…pdf`, `DESCRIPTION_…pdf`, `preview_WBI.png`. Eine **Sammeldatei über alle Stationen
existiert nicht** — der 484-Requests-Befund ist also nicht durch eine übersehene Datei zu umgehen.

**Folge für WB2:** Der DE-Index braucht eine bewusste Ladestrategie (Vorschlag in §7, Punkt 3).
Der Aufwand von WB2 steigt dadurch am oberen Rand der geschätzten 5–8 PT.

---

## 5. ⚠️ Befund 3 — die Schweizer Features tragen keine Farbe

`architecture.md` §14.2 und `plan.md` §WB2 sehen für den CH-Layer vor: „`fill` + `line`, **Farbe am
Feature** (`['get','color']`)". Gemessen enthält
`gefahren-waldbrand_warnung_2056.geojson` (534 KB, 143 Features, `EPSG:2056`) diese Eigenschaften:

```
region_id, canton, level, name_de, name_fr, name_it, name_en,
title_de, title_fr, title_it, title_en, valid_from
```

**Kein `color`, kein Hex, kein Stil.** Es gibt `level` (heute belegt mit **4 und 5**, also „grosse"
und „sehr grosse Gefahr" — die Schweiz steht gerade hoch) und `valid_from`.

Das bestätigt die Warnung aus `docs/DATA_SOURCES.md` §W.1 (⚠️ „die amtlichen Farbwerte waren in
keiner abrufbaren Quelle als Hex hinterlegt") und hat eine unmittelbare Ehrlichkeits-Folge: **die
CH-Farbe ist unsere Zutat, nicht die amtliche.** Damit ist exakt der Fall gegeben, für den
`warnField.ts:79` bereits ein Feld hat — `colorOrigin: 'derived'`. `FIRE_SOURCE_CH` muss dieselbe
Unterscheidung führen und die Legende muss sie zeigen.

**Zwei Geschenke** liefert der Befund gratis mit:
- `valid_from` ist die **Referenzzeit** für `dataAge` — der Wochenend-Fall (R4) lässt sich damit
  ehrlich als *Alter* beschriften, statt eine Abrufzeit zu behaupten (`dataAge.ts:79`,
  `kind: 'measured'`).
- `Cache-Control: max-age=7200, public` kommt vom Server. Das deckt sich mit der Fair-Use-Auflage
  (ein Abruf je Sitzung, TTL ≥ 1 h) — die Auflage ist also nicht nur einhaltbar, sie ist die
  Vorgabe der Quelle selbst.

Die Feuerverbote-Collection existiert unter der aus §W abgeleiteten Id
(`ch.bafu.gefahren-waldbrand_praeventionsmassnahmen_kantone`, Titel „Forest fire prevention measures
of the cantons"). Ihr STAC-Feld meldet `"license": "proprietary"` — der in §W.6 beschriebene
Platzhalter, verbindlich bleiben die FSDI-Terms. **Bestätigt, nicht widerlegt.**

---

## 6. Betriebsbefunde, die in WB2/WB4 Geld kosten

| Befund | Messung | Konsequenz |
|---|---|---|
| **EFFIS-WFS `GetCapabilities` ist unbrauchbar langsam** | 80 s / 86 s / Abbruch nach 150 s | **Im Produktivpfad nie aufrufen.** Typenamen und Attribute fest verdrahten, nicht zur Laufzeit entdecken. |
| **GWIS-WFS ohne Fensterlayer ist langsam** | `ms:viirs.hs` 14–48 s | Nur `.today`/`.week` verwenden. |
| GWIS-WFS mit Fensterlayer ist schnell | 0,6–1,9 s | tauglich für einen Abruf beim Layer-Einschalten |
| GWIS-WMS `GetCapabilities` | 0,4–1,0 s, 190 KB | unkritisch, aber ebenfalls nicht nötig |
| GWIS `GetMap` | 32–364 ms, ~11 KB je Kachel | unauffällig, Kachel-Prefetch in WB3 realistisch |
| BAFU-GeoJSON | 534 KB, 0,1–0,2 s | einmalig je Sitzung — passt zur Fair-Use-Auflage |
| **EDO sendet `ACAO` doppelt** | `access-control-allow-origin: *, *` | Ein Browser wertet einen doppelten ACAO-Header als **ungültig** und blockiert. Betrifft nur WB4 (`fireDrought`, `fireVegetation`) — **vor** WB4 im Browser gegenzuprüfen, nicht jetzt. |
| DWD `relhum_2m` vorhanden | 98 Dateien, Lauf `2026081400` | Transport über die **bestehende** Edge Function `/_dwd_grib`; Warm-Cron bleibt STOPP & FRAGEN |

---

## 7. Entscheidungspunkte für Jan — hier endet WB0

> **Nachtrag 2026-08-14, nach Jans Freigabe („die offenen Fragen können gerne mit deinen
> Empfehlungen beantwortet werden"):** Punkte 2, 3, 4, 5 und 6 sind entschieden und in
> `plan.md`, `checklist.md`, `tests.md`, `architecture.md` §14.2 und `docs/DATA_SOURCES.md`
> §W.1/§W.2/§W.8 eingearbeitet. **Getroffene Entscheidungen:**
> **(2)** Weg **(a)** — `fireHotspots` ohne `frp`, einheitliche Punktgröße, Lücke im Steckbrief
> benannt; Quelle ist GWIS `.today`/`.week`. Die FIRMS-CSV bleibt, was §W.6 sagt: Fallback, nicht
> Primärquelle. **(3)** `stations_list.txt` einmal je Sitzung, Wert-CSVs sichtfeldabhängig und auf
> **60 gleichzeitig** gedeckelt, Tages-TTL — **kein** verdichtender Warm-Cron. **(4)** `relhum_2m`
> **nicht** in den Warm-Cron; Lauf per Verzeichnis-Scan über die bestehende Edge Function. Damit
> bleiben Warm-Budget (90,8 MB/Lauf), Manifest-Mechanik und Prod-Dispatch unangetastet — die
> Aufnahme ist jederzeit nachholbar. **(5)** FNEWS wird **nicht** gebaut; die Lizenzanfrage an
> Thünen ist vor WB4 zu stellen, nicht jetzt. **(6)** Doku-Korrekturen eingearbeitet, Statuswechsel
> bei `V-198`…`V-202` gesetzt.
> **Offen bleibt allein Punkt 7** (Reihenfolge WB gegen L5/L6) — eine reine Terminfrage.

**1. Rewrite in `netlify.toml`: nicht nötig.** ✅ Keine Entscheidung erforderlich. EFFIS/GWIS, EDO,
EEA, DLR und `data.geo.admin.ch` sind direkt erreichbar; DWD läuft über den bestehenden
`/_dwd_opendata`. Die STOPP-Zone wird in WB1–WB3 nicht berührt.

**2. `fireHotspots` ohne `frp` — wie weiter?** Live gibt es Position, Erfassungszeit und `CLASS`;
`frp`, `confidence` und `satellite` liegen nur auf dem eingefrorenen EFFIS-Bestand.
Zur Wahl (ich habe nichts davon vorentschieden):
   - **(a)** Layer ohne `frp` bauen: einheitliche Punktgröße, Zeitfenster 24 h / 7 d, Steckbrief sagt
     „Thermalanomalie, keine Einsatzmeldung" **und** „Feuerstrahlungsleistung wird von der offenen
     Schnittstelle nicht mitgeliefert". Kein neuer Vertrag, keine neue Quelle. *Meine Empfehlung.*
   - **(b)** FIRMS-Regions-CSV (`SUOMI_VIIRS_C2_Europe_24h.csv`, keylos, 200 OK verifiziert) zur
     **Primärquelle** erheben — bringt `frp`/`confidence`/`satellite` zurück, widerspricht aber
     `docs/DATA_SOURCES.md` §W.6 („nur als Fallback hinter EFFIS, nie als Primärquelle") und
     braucht damit deine ausdrückliche Änderung dieser Festlegung.
   - **(c)** `fireHotspots` auf WB4 verschieben und den MVP mit vier Layern fahren.

**3. Ladestrategie für die 484 WBI-Stationsdateien.** Vorschlag ohne Backend und ohne neue
Abhängigkeit: `stations_list.txt` einmalig laden (98 KB, liefert Koordinaten), die Wert-CSVs
**sichtfeldabhängig und begrenzt** nachladen (Stationen im Viewport, Deckel z. B. 60 gleichzeitig,
In-Memory-Tages-TTL). Die Karte zeigt dann sofort die Stützstellen und füllt Werte nach. Alternative
wäre ein Warm-Cron, der die 484 Dateien zu einer Datei verdichtet — **das wäre Transport-/Cron-Zone
und damit deine Freigabe**. Ich habe nichts gebaut.

**4. `relhum_2m` in den Warm-Cron?** Unverändert offen wie in der Analyse (R5). Feld ist vorhanden
(98 Dateien je Lauf), Transport über `/_dwd_grib` gedeckt. Ohne Freigabe löst WB2 den Lauf per
Verzeichnis-Scan auf, wie der Pfad vor dem Manifest. Warm-Budget heute 90,8 MB/Lauf.

**5. FNEWS-Lizenzanfrage an Thünen (`fnews@thuenen.de`) stellen?** Betrifft erst WB4. Nicht geprüft,
weil außerhalb von WB0.

**6. Doku-Korrekturen freigeben.** `plan.md` §WB2 und `docs/DATA_SOURCES.md` §W.2 nennen für
`fireHotspots` eine URL, die 2021er-Daten liefert; §W.1 kennt die Stationsliste nicht;
`architecture.md` §14.2 behauptet eine Feature-Farbe, die es nicht gibt. Ich habe die Fundstellen
**nicht** überschrieben — sie stehen hier und als `V-198`…`V-202` in `improvements.md`.

**7. Phasenreihenfolge WB gegen L5/L6** — unverändert deine Entscheidung.

---

## 8. Gate-Bewertung

**GWB0 ist grün.** Die Abbruchbedingung (T0-2 negativ) ist nicht eingetreten; alle acht
Checklisten-Punkte sind mit Beleg abgehakt (`checklist.md` §GWB0). Die fünf
Selbstverifikations-Fragen aus `CLAUDE.md` sind für diese Phase **gegenstandslos bis auf eine**:
es wurde kein Produktivcode, keine UI und kein Renderpfad angefasst — geändert wurden ausschließlich
`scripts/l0/probe-cors.mjs` (additiv, Gruppe `fire`, bestehender Lauf unverändert aufrufbar) und die
neue Datei `scripts/l0/probe-waldbrand-payloads.mjs`. Frage 1 (Funktionserhalt) ist damit trivial
erfüllt und über `--group` explizit abgesichert: ohne die Flagge läuft `probe-cors.mjs` wie zuvor,
nur um die `fire`-Zeilen erweitert.

**WB1 ist freigegeben** — mit der Maßgabe, dass die Entscheidungspunkte 2 und 3 vor **WB2**
beantwortet sein müssen, nicht vor WB1.
