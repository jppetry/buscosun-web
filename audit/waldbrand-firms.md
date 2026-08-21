# audit/waldbrand-firms.md — F0: Schlüsselhandhabung und Sonde für NASA FIRMS (Gate GWBF1)

> **Stand: 2026-08-14.** Phase **F0** der Phase **WBF** „`fireHotspots` auf NASA FIRMS".
> **Kein Produktivcode geschrieben.** Ergebnis sind dieses Dokument, ein **Vorschlag** für die
> Edge Function `netlify/edge-functions/firms.ts` (additiv, unverdrahtet, undeployt) und eine
> vorbereitete Sonde, die auf Jans Schlüssel wartet.
>
> **Grundlage:** `docs/DATA_SOURCES.md` §W.2 und **§W.2.1** (Jans Freigabe der Area API als
> Primärquelle, mit zwei Auflagen) · `src/fire/sources/gwisHotspots.ts` (V-198/V-199/V-202) ·
> `netlify/edge-functions/dwd-grib.ts` (Muster) · `CLAUDE.md` (Edge Functions = STOPP-&-FRAGEN).
>
> **Läufe (2026-08-14, alle mit `Origin: https://buscosun.com`):**
> **(1) keylos**, `curl` gegen `firms.modaps.eosdis.nasa.gov` — Doku-Seite `/api/area/`, Regions-CSV,
> zwei Fehlerproben mit absichtlich ungültigem Schlüssel.
> **(2) Sonde mit echtem Schlüssel**, 18:45 UTC, 9 Datenabrufe über alle drei VIIRS-Quellen.
> **(3) Zusatzanalyse**, 3 Abrufe à 5 Tage, 4.707 Detektionen — Wertebereiche und Tragfähigkeit der
> Persistenz-Heuristik.
> Beide Skripte lesen den Schlüssel aus `.env.local` und **redigieren ihn in jeder Ausgabe**.
> Dazu: netzfreie Prüfung der Schutzregeln des Vorschlags (26/26) · Dev-Server-Gegenprobe der
> Route · `npm run typecheck` grün.

---

## 0. Das Ergebnis

**Die Sonde ist gelaufen, alle fünf Fragen sind beantwortet** (§4). Die Quelle trägt, was der
Auftrag braucht — FRP, Konfidenz, Pixelgeometrie, Satellit, Tag/Nacht —, aber sie bringt **drei
Fallstricke mit, die keine Doku nennt** und die ein naiver Parser still falsch verarbeiten würde
(§4.2–§4.4): abgeschnittene führende Nullen in `acq_time`, einbuchstabige `confidence`-Codes statt
der Wörter aus der Regions-CSV, und eine zusätzliche Spalte `instrument`.

**Die Spalte `type` fehlt.** Damit tritt der STOPP-Fall aus dem Auftrag ein (§6). Die Gegenprobe
fällt aber günstig aus: die Persistenz-Heuristik trennt sauber — sie findet über fünf Tage genau
die bekannten Dauerquellen (ThyssenKrupp Duisburg, voestalpine Linz), und diese machen
**39,3 % aller Detektionen** aus. Ungefiltert wäre die Karte von Stahlwerken beherrscht.

**Eine eigene frühere Aussage muss ich korrigieren.** §1.1 dieses Dokuments schloss aus zwei
Proben, `firms.modaps.eosdis.nasa.gov` sende generell kein `Access-Control-Allow-Origin`. Auf der
**Area API** trifft das nicht zu: die 200er-Antwort sendet `ACAO: *`. Kein CORS sahen die
Fehlerantwort (400) und die **statische** Regions-CSV — letzteres bleibt gültig und trägt V-218.
Für die Area API ist der Proxy also **allein wegen des Schlüssels** nötig; das genügt als
Begründung, aber „doppelt begründet" war falsch.

**Der Transaktionspreis ist exakt vermessen:** `2 × DAY_RANGE` je erfolgreicher Anfrage, abgelehnte
Anfragen kosten nichts (§4.5). Ein vollständiger 7-Tage-Rückblick über alle drei Satelliten kostet
**42 von 5.000** Transaktionen pro Cache-Fenster. Auflage 2 aus §W.2.1 ist damit mit einer Zahl
belegt, nicht mit einer Annahme.

---

## 1. Was ohne Schlüssel messbar war

### 1.1 CORS — differenzierter als zunächst geschlossen

> ⚠️ **Korrektur.** Die ersten beiden Zeilen dieser Tabelle stammen aus der keylosen Vorphase; ich
> hatte daraus verallgemeinert, der Host sende generell kein CORS. Die dritte Zeile (mit
> Schlüssel, aus der Sonde) widerlegt das für die Area API. Die Verallgemeinerung war falsch, die
> Einzelmessungen stimmen.

| Probe | Ergebnis |
|---|---|
| `HEAD /data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Europe_24h.csv`, `Origin: https://buscosun.com` | `200` · `application/octet-stream` · **kein `Access-Control-Allow-Origin`** |
| `GET /api/area/csv/<ungültig>/…` (Fehlerfall) | `400` · `text/plain;charset=UTF-8` · **kein `Access-Control-Allow-Origin`** |
| `GET /api/area/csv/<gültig>/…` (Erfolgsfall, Sonde) | `200` · `text/plain;charset=UTF-8` · **`Access-Control-Allow-Origin: *`** · `Cache-Control: no-cache` |

**Konsequenz 1 — der Proxy ist wegen des Schlüssels nötig, nicht wegen CORS.** Die Area API ist im
Erfolgsfall CORS-offen. Das ändert nichts an der Architektur: der Schlüssel darf nicht ins Bundle
(§2), und das allein erzwingt den Proxy. Es nimmt der Entscheidung nur ein Scheinargument.

**Konsequenz 1b — der Upstream sendet `Cache-Control: no-cache`.** Für den Durable-Cache ist das
folgenlos, weil die Edge Function eine **neue** Response baut und aus dem Upstream nur
`last-modified` übernimmt; der Cache wird ausschließlich über die selbst gesetzten
`Netlify-CDN-Cache-Control`/`Cache-Control`-Header gesteuert. Wäre der Upstream-Header
durchgereicht worden, hätte der Edge-Cache nie gegriffen und Auflage 2 wäre unerfüllt geblieben —
ein stiller Fehlschlag, den man erst an der Transaktionsabrechnung bemerkt hätte.

**Konsequenz 2 — die keylose Regions-CSV taugt NICHT als Browser-Fallback.**
`docs/DATA_SOURCES.md` §W.2 führt sie als „🟡 OK als Fallback — keylos (200 OK verifiziert)". Das
200 OK stammt aber aus einer Server-zu-Server-Probe; aus der Seite heraus scheitert sie an CORS
genau wie die Area API. Als Rückfallebene bleibt damit **GWIS** (sendet `ACAO: *`, in WB0 belegt) —
so, wie es der Auftrag ohnehin vorsieht. Der Katalogeintrag ist irreführend und wird korrigiert
(**V-218**).

### 1.2 Die keylose Regions-CSV — Spaltensatz und Preis

```
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
65.75542,24.52995,298.92,0.45,0.39,2026-08-13,0048,N,nominal,2.0NRT,280.13,0.7,N
```

**13 Spalten, keine `type`-Spalte** — die Angabe in §W.2.1 bestätigt sich. Gemessen: **505.454 B**
für **ganz Europa**, in zwei Läufen **30,7 s** und **5,9 s** (der erste Wert war offenbar kalt; die
Streuung ist ehrlich auszuweisen, nicht auf den günstigeren Wert zu glätten). Selbst wenn CORS es
zuließe, wäre das für den Ladepfad untauglich: eine halbe Megabyte, aus der der Client den
DACH-Ausschnitt erst herausfiltern müsste — die Area API liefert denselben Ausschnitt für einen
Tag in **67 KB und 0,97 s** (§4.1).

Wichtig für §4: dieser Spaltensatz ist der **Vergleichsanker**. Führt die Area API dieselben 13
Spalten, ist `type` endgültig vom Tisch und F2 braucht die Persistenz-Heuristik.

### 1.3 Der Endpunkt-Vertrag (Doku-Seite `/api/area/`, abgerufen 2026-08-14)

| Punkt | Wert |
|---|---|
| Pfad | `/api/area/csv/[MAP_KEY]/[SOURCE]/[AREA_COORDINATES]/[DAY_RANGE]` |
| Pfad mit Startdatum | `…/[DAY_RANGE]/[DATE]` — liefert `[DATE] .. [DATE + DAY_RANGE-1]` |
| `AREA_COORDINATES` | **`west,south,east,north`** — die Doku sagt ausdrücklich: eine BBox oder `world`, **nicht** „north/south/east/west" |
| `DAY_RANGE` | `1 .. 5` |
| `DATE` | `YYYY-MM-DD`, optional; ohne Angabe die jüngsten Daten |
| `SOURCE` (VIIRS) | `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT` (dazu `_SP` für SNPP/NOAA20 — **NOAA-21 hat kein `_SP`**), MODIS, LANDSAT_NRT (nur US/Kanada) |
| Schlüsselform | NASAs eigene Frontend-Prüfung: `/^[0-9a-z]+$/` **und Länge exakt 32** |
| Limit | **5.000 Transaktionen / 10 min**; „Larger transactions may count as multiple requests (ex. requesting 7 days)" |
| Verbrauchsanzeige | `/mapserver/mapkey_status/?MAP_KEY=<key>` |
| Ausgabe | nur CSV |

**NRT enthält RT und URT mit.** Die Doku vermerkt: „RT and URT data are removed when corresponding
NRT detections are processed or RT/URT is older than 6 hours." Für uns heißt das, dass eine
Detektion aus den letzten Stunden **verschwinden oder sich verschieben** kann, wenn die
NRT-Verarbeitung nachzieht. Das ist eine Ehrlichkeitsfrage für den Steckbrief (F1) und ein
handfester Grund, keine „bestätigt"-Sprache aus Wiederholung abzuleiten (F2).

**Die 5-Tage-Grenze kollidiert mit dem 7-Tage-Fenster aus F2** — s. §5.1.

### 1.4 Die Fehlerform

| Probe | Antwort |
|---|---|
| 32-stelliger, aber ungültiger Schlüssel | `400` · `text/plain;charset=UTF-8` · `Invalid MAP_KEY.` |
| formal falscher Schlüssel (`notavalidkey`) | `400` · `text/plain;charset=UTF-8` · `Invalid MAP_KEY.` |

Gut: Fehler kommen als **4xx**, nicht als 200. Der Proxy darf sich darauf aber nicht verlassen —
der Limit-Fall (5.000/10 min) ließ sich ohne echten Schlüssel nicht auslösen, und genau dort ist
eine 200-mit-Klartext denkbar. Deshalb die Kopfzeilen-Plausibilitätsprüfung in §3.

---

## 2. Warum der Schlüssel nicht ins Bundle darf — und was das konkret ausschließt

buscosun ist rein client-seitig (D-01). Drei Wege wären denkbar gewesen, zwei sind es nicht:

1. **Konstante im Frontend** — im Netzwerk-Tab und im `dist/`-Bundle im Klartext lesbar. Das Limit
   hängt am Schlüssel des Betreibers: ein abgeschriebener Schlüssel kostet nicht nur Budget,
   sondern legt bei Erschöpfung **den Layer für alle** lahm. **Ausgeschlossen.**
2. **`netlify.toml`-Rewrite wie `/_meteoalarm`** — ein Rewrite kann keinen Wert einsetzen, den er
   nicht im Repo stehen hat. Der Schlüssel müsste in die eingecheckte Datei. **Ausgeschlossen.**
3. **Edge Function mit `FIRMS_MAP_KEY` aus der Umgebung** — der Schlüssel steht in den Netlify
   Site settings, nie im Repo, nie im Bundle. **Der einzige tragfähige Weg** (§W.2.1, Auflage 1).

Daraus folgt die Ablage: Umgebungsvariable in Netlify für Produktion, `.env.local` im Repo-Root
für die lokale Entwicklung — durch die bestehende `.gitignore`-Zeile `*.local` bereits
ausgeschlossen, ohne dass an der Datei etwas geändert werden muss. **Der Schlüssel steht in keiner
Datei dieses Repos und in keinem Commit.**

---

## 3. Der Vorschlag: `netlify/edge-functions/firms.ts`

Die Datei ist **angelegt, aber unverdrahtet**: kein Client ruft sie auf, `netlify.toml` und
`vite.config.ts` sind unangetastet, ohne Deploy ist sie wirkungslos. Sie liegt Jan zur Freigabe vor.

**Pfadform:** `/_firms/<SOURCE>/<west,south,east,north>/<days>[/<YYYY-MM-DD>]`

### 3.1 Die zwei Stellen, an denen das Muster `dwd-grib.ts` hier gefährlich wäre

**(1) Pfad-Durchreichen → offenes Transaktionsbudget.** `dwd-grib.ts` hängt den eingehenden Pfad an
den Origin und prüft nur Präfix, Endung und `..`. Genau übertragen hieße das: jeder Fremde könnte
`/_firms/VIIRS_SNPP_NRT/-180,-90,180,90/5` aufrufen und Jans Schlüssel für Weltabfragen verbrauchen
— bei „larger transactions count as multiple" ist das ein wirksamer Hebel gegen den Layer.
**Lösung:** die Ziel-URL wird aus **einzeln geprüften** Komponenten neu gebaut, der Query-String
verworfen. Die BBox muss **vollständig innerhalb einer DACH-Hülle** (5,0/45,0/18,0/56,0) liegen.
Pfad-Traversal ist damit strukturell unmöglich, nicht nur weggefiltert.

**(2) `String(err)` im Fehlertext → Schlüssel-Leck.** `dwd-grib.ts` antwortet bei Netzfehlern mit
`Upstream fetch failed: ${String(err)}`. Bei DWD ist das harmlos; hier steht der Schlüssel **im
Pfad** der angefragten URL, und fetch-Fehlertexte führen die URL regelmäßig mit. **Lösung:** jede
Fehlerantwort ist ein fester, kurzer Text ohne Upstream-Bezug; auch Upstream-Fehlertexte
(„Invalid MAP_KEY.") werden nicht durchgereicht.

### 3.2 Die übrigen Schutzregeln

| Regel | Warum |
|---|---|
| Methoden nur `GET`/`HEAD` | Anti-Open-Proxy, wie im Muster |
| `SOURCE` aus Whitelist (3 VIIRS-NRT) | MODIS/`_SP`/LANDSAT kosten Budget und gehören nicht zum Layer |
| BBox: 4 endliche Zahlen, `west<east`, `south<north`, in der Hülle | s. (1); fängt zugleich die **vertauschte lat,lon-Box** ab, die sonst still leer antwortet |
| `days` ganzzahlig 1–5 | Doku-Grenze; in §4 am echten Schlüssel gegenzuprüfen |
| `date` streng `YYYY-MM-DD` **und kalendarisch gültig** | `2026-13-40` fällt durch |
| `FIRMS_MAP_KEY` gegen `/^[0-9a-z]{32}$/` geprüft, sonst `503` | Konfigurationsfehler wird als solcher sichtbar, ohne den erwarteten Wert zu verraten |
| Body-Kopf muss mit `latitude,longitude` beginnen | sonst würde ein 200-Klartext als „keine Brände" gelesen und 30 min durable gecacht |
| Nicht-2xx **nie** durable cachen | ein transienter Limit-Treffer wäre sonst für 30 min festgetackert |
| Antwortdeckel 8 MB | schützt die Function vor einer entarteten Antwort |

### 3.3 Cache-Fenster

`Netlify-CDN-Cache-Control: public, durable, max-age=1800` (30 min) für Erfolge,
`Cache-Control: public, max-age=300` für den Browser, `no-store` für alles andere.
**Kein `immutable` und kein 6-h-Fenster** wie bei den GRIB-Dateien — deren URL trägt Lauf und Step
und ist unveränderlich; eine FIRMS-Antwort wächst mit jedem Überflug. Bei ~3 h NRT-Latenz verliert
ein 30-Minuten-Fenster nichts und entkoppelt die Upstream-Last vollständig von der Nutzerzahl
(Auflage 2).

### 3.4 Netzfreie Vorprüfung des Vorschlags

26 von 26 Prüfungen bestanden — u. a. `world` abgelehnt, Europa-BBox abgelehnt, vertauschte
lat,lon-Box abgelehnt, `MODIS_NRT`/`LANDSAT_NRT`/`_SP` abgelehnt, `days=0`/`6`/`2.5` abgelehnt,
Traversal abgelehnt, fünftes Pfadsegment abgelehnt, Query-String nicht weitergereicht,
Schlüssel falscher Form ⇒ keine URL. `npm run typecheck` grün.

Diese Prüfungen werden in F1 zum festen Verifier `verify:fire-firms` ausgebaut; als F0-Beleg liefen
sie aus dem Scratchpad, damit vor dem Gate kein Produktcode entsteht.

---

## 4. Die Sonde — Ergebnisse

Gelaufen am **2026-08-14, 18:45 UTC**, Schlüssel aus `.env.local` (BOM + CRLF, vom Loader
abgefangen), Ausgabe durchgehend redigiert (`<KEY>`). Zwei Läufe: die Sonde selbst (9 Datenabrufe)
und eine Zusatzanalyse über 5 Tage × 3 Satelliten (3 Abrufe, 4.707 Detektionen).

### 4.1 Frage 4 — Spaltensatz, Größe, Zeit

```
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
52.15121,10.40221,321.2,0.45,0.63,2026-08-14,33,N,VIIRS,n,2.0NRT,286.51,1.6,N
```

| Quelle | DAY_RANGE=1 | Zeit | Größe | Zeilen |
|---|---|---|---|---|
| `VIIRS_SNPP_NRT` | 200 | 966 ms | 67.288 B | 836 |
| `VIIRS_NOAA20_NRT` | 200 | 441 ms | 33.434 B | 409 |
| `VIIRS_NOAA21_NRT` | 200 | 273 ms | 26.201 B | 318 |
| `VIIRS_SNPP_NRT`, DAY_RANGE=5 | 200 | 712 ms | 135.427 B | 1.691 |

**NOAA-21 liefert DACH-Daten** — die dritte Quelle trägt bei, die Zusammenführung lohnt.
**Alle Attribute des Auftrags sind da:** `frp`, `confidence`, `bright_ti4`/`ti5`, `scan`/`track`,
`daynight`, `satellite`. Antwortzeiten sind ladepfadtauglich (0,3–1,0 s, GWIS-Fensterlayer
0,6–1,9 s).

**14 Spalten statt der 13 der Regions-CSV:** neu ist **`instrument`** (Wert `VIIRS`) zwischen
`satellite` und `confidence`. Ein Parser, der sich auf Spaltenpositionen der Regions-CSV verlässt,
läse ab dort **alles um eine Spalte verschoben** — `confidence` würde als `instrument` gelesen.
⇒ F1 parst **nach Spaltennamen aus der Kopfzeile**, nie nach Index.

### 4.2 ⚠️ Fallstrick — `acq_time` ohne führende Nullen

`acq_time` kommt **numerisch**, nicht als vierstellige Zeichenkette. Über 4.707 Detektionen:

| Länge der Rohzeichenkette | Anzahl |
|---|---|
| 1 Zeichen (z. B. `7` = 00:07) | 29 |
| 2 Zeichen (z. B. `33` = 00:33) | 730 |
| 3 Zeichen (z. B. `137` = 01:37) | 1.736 |
| 4 Zeichen (z. B. `1230`) | 2.212 |

Wertebereich `7 … 2358`. Mit `padStart(4,'0')` gelesen: **0 ungültige Zeiten** von 4.707. Die
Gegenprobe an `daynight` bestätigt die Lesart unabhängig — Nachtdetektionen liegen bei
23–03 h UTC, Tagdetektionen bei 10–13 h UTC, exakt die VIIRS-Überflugfenster über Mitteleuropa:

```
daynight=D: 10h:61  11h:819  12h:1196  13h:112
daynight=N: 00h:759 01h:967  02h:706   03h:63   23h:24
```

**Die Regions-CSV füllt dagegen auf `0048` auf.** Wer den GWIS-Parser (`parseAcqAt`) oder ein
Regions-CSV-Muster überträgt, liest `33` als 33 Minuten nach Mitternacht **oder als 3:30** — je
nach Implementierung. Beides ist falsch, und beides fällt niemandem auf, weil die Punkte trotzdem
irgendwo auf der Zeitachse landen. **Das ist der teuerste stille Fehler dieser Quelle.**

### 4.3 ⚠️ Fallstrick — `confidence` als Einzelbuchstabe

| Quelle | Werte |
|---|---|
| Area API (gemessen, 4.707 Zeilen) | `n` 4.188 · `l` 427 · `h` 92 |
| Regions-CSV (gemessen) | `nominal` |

Der Auftrag spricht von „low/nominal/high" — die Area API liefert `l`/`n`/`h`. F1 muss **beide
Schreibweisen** abbilden, sonst fällt die Konfidenz-Kodierung (Deckkraft/Ring) still auf einen
Default zurück und die Anzeige behauptet Gleichwertigkeit, die die Daten nicht hergeben.

### 4.4 Fragen 2 und 3 — BBox-Reihenfolge und Tagesspanne

**Vertauschte lat,lon-Box (GWIS-Form `45.5,5.5,55.5,17.5`): `HTTP 200`, 122 B, `0 Zeilen`.**
Genau die vorhergesagte stille Leerantwort — kein Fehler, kein Hinweis, nur „keine Brände". Die
Hüllenprüfung der Edge Function fängt das ab (§3.4), und der Verifier hält es fest.

**Tagesspanne:** `days=5` → 200 · 1.691 Zeilen. `days=6/7/10` → **`400 · Invalid day range.
Expects [1..5].`** Die Doku stimmt. **Optionales Startdatum funktioniert:** `DATE=2026-08-08,
days=2` → 200 · 762 Zeilen.

### 4.5 Frage 5 — der Transaktionspreis, exakt

`current_transactions` über beide Läufe: **0 → 22 → 52**. Beide Deltas gehen ohne Rest auf:

| Lauf | Anfragen | Rechnung | Delta |
|---|---|---|---|
| Sonde | 3×`days=1`, 1×`days=5`, 1×`days=1`(vertauscht), 1×`days=2`, 3× abgelehnt (400) | `2·(1+1+1+5+1+2) + 0` | **22** |
| Analyse | 3×`days=5` | `2·(5+5+5)` | **30** |

⇒ **Kosten = 2 × DAY_RANGE je erfolgreicher Anfrage. Abgelehnte Anfragen (400) kosten nichts,
`mapkey_status` kostet nichts.** Nicht dokumentiert, aber an zwei unabhängigen Deltas belegt.

**Damit ist Auflage 2 beziffert:** ein 7-Tage-Rückblick über drei Satelliten (je `days=5` +
`days=2`) kostet `3 × (10 + 4) = 42` von 5.000 Transaktionen — **pro 30-Minuten-Cache-Fenster,
unabhängig von der Nutzerzahl.** Ohne Proxy wären es 42 **pro Sitzung**, und das Budget wäre nach
~119 gleichzeitigen Nutzern erschöpft.

### 4.6 Datenvolumen — größer als beim GWIS-Layer

5 Tage × 3 Satelliten = **4.707 Detektionen**, ~380 KB CSV. Hochgerechnet auf 7 Tage: **~6.600
Detektionen, ~530 KB**. Zum Vergleich: der GWIS-Layer deckelt bei 1.500 Features.

Das ist für F1 zu entscheiden, nicht hier — aber es ist die Größenordnung, an der Feature-Deckel,
Footprint-Rechtecke (jedes Rechteck ist ein Polygon mit 5 Stützpunkten) und Parse-Budget zu
bemessen sind. `scan` liegt gemessen zwischen **0,32 und 0,80 km** (Median 0,42), die Angabe
„375 m am Nadir bis ~800 m am Schwadrand" aus dem Auftrag ist damit am Feld bestätigt.

**FRP-Verteilung** (für die Radius-/Farbskala): min 0,22 · p50 **3,09** · p90 11,85 · p99 68,07 ·
max 372,86 MW; 550 von 4.707 unter 1 MW. Stark rechtsschief ⇒ eine **lineare** Skala würde 90 %
der Punkte ununterscheidbar klein zeichnen. Die Legende muss die gewählte Stauchung benennen.

---

## 5. Was schon jetzt für F1/F2 feststeht

### 5.1 Sieben Tage brauchen zwei Abrufe je Quelle — aber keine Überlappungs-Dedup

`DAY_RANGE` endet bei 5 (§4.4 gemessen), das Fenster aus F2 umfasst 7 Tage. Ein 7-Tage-Rückblick
über drei Satelliten kostet damit **sechs** Abrufe (je Quelle `days=5` ohne Datum plus `days=2` mit
Startdatum `heute−6`), nicht drei — 42 Transaktionen je Cache-Fenster (§4.5).

**Korrektur an meiner ersten Einschätzung:** Die beiden Teilfenster überlappen **nicht**. `days=5`
ohne Datum liefert `heute … heute−4`, `days=2` ab `heute−6` liefert `heute−6 … heute−5`; zusammen
exakt sieben Tage ohne gemeinsamen Tag. Eine Überlappungs-Dedup ist also **nicht** nötig. Was
stattdessen zu beachten ist: die Fenstergrenze wandert mit dem **UTC**-Tageswechsel. Wird der eine
Abruf vor und der andere nach Mitternacht UTC beantwortet (oder kommt einer aus dem Edge-Cache),
entsteht ein **Loch oder eine Dopplung von einem Tag**. Empfehlung für F1: das Startdatum des
zweiten Fensters **explizit** aus dem `acq_date`-Minimum des ersten ableiten statt aus der lokalen
Uhr — dann ist der Anschluss datenseitig garantiert, nicht zeitseitig gehofft.

### 5.2 Der Dev-Pfad — entschieden und gebaut

`vite dev` kennt keine Edge Functions. Die bestehenden Proxys (`/_dwd_wind`, `/_dwd_grib`) haben in
`vite.config.ts` einen dünnen Pass-Through als Dev-Fallback — das geht hier **nicht**, weil der
Fallback den Schlüssel einsetzen müsste, also in die eingecheckte Konfiguration schreiben würde.

**Jans Entscheidung (2026-08-14): Variante (a), Vite-Plugin.** Umgesetzt als `firmsDevProxy()` in
`vite.config.ts`. Die entscheidende Eigenschaft: Das Plugin schreibt die Prüflogik **nicht ein
zweites Mal**, sondern ruft den **echten Edge-Handler** auf (`import firmsHandler from
'./netlify/edge-functions/firms.ts'`). Dev und Produktion können damit nicht divergieren — gleiche
Whitelist, gleiche DACH-Hülle, gleiche Fehlertexte, gleiche CSV-Kopfprüfung. Ein Unterschied ist
gewollt: die Cache-Header werden im Dev verworfen und durch `no-store` ersetzt, sonst würde ein
5-Minuten-Browser-Cache jede Iteration am Layer zur Rätselarbeit machen.

Der Schlüssel kommt über `loadEnv(mode, cwd, '')` aus `.env.local` und wird in `process.env`
gelegt, wo `readMapKey()` ihn findet. Er kann von dort **nicht ins Bundle geraten**: Vite inlint aus
`import.meta.env` ausschließlich `VITE_`-Variablen, ersetzt `process.env.<X>` im Client nur für
`NODE_ENV`, und `FIRMS_MAP_KEY` trägt bewusst keinen `VITE_`-Präfix und wird nirgends an `define`
übergeben. Im Build (`command === 'build'`) liest das Plugin den Wert gar nicht erst.

**Zwei Nebenwirkungen, beide protokolliert:**

- `tsconfig.node.json` bekommt `"DOM"` in `lib`, weil `vite.config.ts` jetzt den Edge-Handler
  importiert und dessen Web-Standard-Globals (fetch/Request/Response/Headers/URL) dort typisiert
  sind — dieselbe Begründung wie in `tsconfig.edge.json`. **Keine neue Abhängigkeit** (D-06).
- Die Middleware-Parameter sind `unknown` mit Einengung an einer Stelle: ohne `@types/node` lösen
  Connects `IncomingMessage`/`ServerResponse` zu leeren Interfaces auf, an denen TS'
  Weak-Type-Prüfung eine direkte Annotation ablehnt. `@types/node` wäre eine neue (Typ-)Abhängigkeit
  und damit STOPP-Zone — deshalb der Cast.

**Verifiziert am laufenden Dev-Server, ohne und mit Schlüssel:**

| Anfrage | ohne `.env.local` | mit `.env.local` |
|---|---|---|
| `…/VIIRS_SNPP_NRT/5.5,45.5,17.5,55.5/1` | `503 · not configured` | **`200 · 67.288 B`** |
| `…/VIIRS_NOAA21_NRT/5.5,45.5,17.5,55.5/1` | `503` | **`200 · 26.201 B`** |
| `…/VIIRS_SNPP_NRT/10,47,12,49/1` (Teilausschnitt) | `503` | **`200 · 8.292 B`** |
| `…/VIIRS_SNPP_NRT/5.5,45.5,17.5,55.5/2/2026-08-08` | `503` | **`200 · 61.179 B`** |
| `…/-180,-90,180,90/5` (world) | `503` | **`400 · Bad FIRMS proxy path`** |
| `…/MODIS_NRT/…` | `503` | **`400`** |
| vertauschte lat,lon-BBox | `503` | **`400`** |
| `days=9` | `503` | **`400`** |
| `…/1/../../etc` (Traversal) | — | **`400`** |
| `/_dwd_grib/weather/nwp/icon-d2/grib/00/t_2m/` | `200` | `200` — **bestehender Proxy unberührt** |

Drei Dinge sind damit belegt:

1. **Output-Gleichheit.** 67.288 / 26.201 / 61.179 B sind **exakt** die Größen aus dem
   Direktabruf der Sonde (§4.1) — der Proxy liefert dieselben Bytes, er verändert nichts.
2. **Der Schlüssel wird gelesen, trotz BOM und CRLF.** Ohne ihn antwortet alles 503, mit ihm
   antworten die Schutzregeln differenziert 400 statt pauschal 503. Vites `loadEnv` kommt mit der
   von Windows geschriebenen Datei zurecht — das war nicht selbstverständlich und ist damit
   gemessen statt angenommen.
3. **Kein Leck.** Über drei Antworten (Erfolg, Hüllen-Ablehnung, Whitelist-Ablehnung) wurde Body
   **und** Header-Satz gegen den echten Schlüssel geprüft: kein Treffer.

**Bundle-Gegenprobe nach `npm run build`:** `dist/` mit 304 Dateien / 10,3 MB byteweise gegen den
Schlüssel durchsucht — **0 Treffer**, und auch der Variablenname `FIRMS_MAP_KEY` kommt in keiner
Datei vor. Negativkontrolle: dieselbe Suche findet „buscosun" in 196 Dateien, die Suche greift also
tatsächlich. Auflage 1 aus §W.2.1 ist damit belegt, nicht behauptet.

### 5.3 Die Persistenz-Heuristik trägt — und der Satelliten-Dedup läuft ins Leere

Weil `type` fehlt (§6), habe ich die Ersatzheuristik **an echten Daten geprüft**: 4.707
Detektionen über 5 Tage, gerastert auf ~1-km-Zellen (0,01°), gezählt an wie vielen
**verschiedenen Tagen** eine Zelle getroffen wird.

| an … von 5 Tagen getroffen | Zellen |
|---|---|
| 1 | 1.163 |
| 2 | 152 |
| 3 | 49 |
| 4 | 52 |
| 5 | 39 |

**1.455 belegte Zellen, davon 91 an ≥4 von 5 Tagen — diese 91 Zellen tragen 1.851 Detektionen,
also 39,3 % aller Punkte.** Die Verteilung ist klar zweigipflig: 80 % der Zellen werden genau
einmal getroffen, und eine kleine Gruppe fast täglich. Die hartnäckigsten Zellen sind
namentlich identifizierbar:

| Zelle | 5-Tage-Detektionen | ΣFRP | Was dort steht |
|---|---|---|---|
| 51,48 / 6,72 · 51,49 / 6,71 · 51,48 / 6,71 · 51,48 / 6,70 | 70 · 61 · 53 · 36 | 319 · 230 · 240 · 94 MW | **ThyssenKrupp Duisburg** (vier benachbarte Zellen) |
| 48,28 / 14,34 · 48,27 / 14,34 | 52 · 40 | 304 · 233 MW | **voestalpine Linz** |
| 45,74 / 8,17 · 45,74 / 8,18 | 54 · 37 | 373 · 267 MW | Industriestandort Norditalien |
| 48,60 / 7,82 | 30 | 60 MW | Raum Straßburg |

**Die Heuristik funktioniert also — sie findet die Stahlwerke, ohne dass ihr jemand gesagt hätte,
wo sie stehen.** Ungefiltert wäre die Karte „Aktive Brände" zu zwei Fünfteln eine Karte der
Schwerindustrie.

**Gegenbefund, der ebenso wichtig ist:** die Dedup-Regel aus dem Auftrag (≤200 m **und** ±90 s,
verschiedene Satelliten) findet in diesen 4.707 Detektionen **null** Treffer. Das ist kein Fehler
der Regel, sondern Bahnmechanik: SNPP, NOAA-20 und NOAA-21 überfliegen dieselbe Stelle rund
**50 Minuten** versetzt, nie gleichzeitig. Zwei Detektionen desselben Feuers durch zwei Satelliten
sind damit **zwei echte Beobachtungen** — genau das Signal, aus dem F2 die Überflugzahl bildet.
Sie wegzudeduplizieren wäre falsch. Die Regel darf bleiben (sie kostet nichts und deckt einen
Doppelabruf ab), aber sie ist **keine** Mengenreduktion und darf im Steckbrief nicht als solche
erscheinen.

### 5.4 Was der Layer künftig sagen muss

Aus §1.3: NRT enthält RT/URT, die bei Nachverarbeitung **verschwinden oder umziehen** können.
Zusammen mit den Vorgaben des Auftrags (Punkt ist Pixelmitte, nicht Feuer; `low` kann Sonnenglanz
sein; nie Hektar aus FRP) gehört das in den Steckbrief — eine Detektion, die eine Stunde später
weg ist, ist kein Fehler der Anzeige, sondern die Natur der Quelle.

---

## 6. STOPP & FRAGEN — Stand der Entscheidungen

| # | Frage | Jans Entscheidung (2026-08-14) |
|---|---|---|
| 1 | Freigabe der Edge Function, DACH-Hülle als harte Grenze? | ✅ **freigegeben, Hülle hart.** Ein späterer Europa-Kontextlayer verlangt eine bewusste Erweiterung genau einer Konstante (`ENVELOPE`) — das ist der Preis und er ist gewollt |
| 2 | Weg des Schlüssels zur Sonde | ✅ **`.env.local`** im Repo-Root, `FIRMS_MAP_KEY=<32 Zeichen>`. Über `.gitignore:4` (`*.local`) ausgeschlossen — mit `git check-ignore` gegengeprüft |
| 3 | Dev-Pfad | ✅ **(a) Vite-Plugin**, umgesetzt und verifiziert (§5.2) |
| 4 | Netlify-Umgebungsvariable `FIRMS_MAP_KEY` in den Site settings | ⏳ **offen** — Jans Handgriff, nicht automatisierbar. Ohne sie antwortet der Proxy in Produktion 503 und der Layer fällt auf GWIS zurück (das ist der beabsichtigte, nicht der kaputte Zustand) |

Fragen 1–3 sind erledigt, die Sonde ist gelaufen (§4). **Es bleibt eine neue, vom Auftrag
ausdrücklich als STOPP-Fall benannte Frage.**

### 6.1 STOPP — `type` fehlt, die Heuristik muss es ersetzen

Der Auftrag sagt: *„STOP & ASK (Jan): … if `type` is absent and the static-source heuristic would
mislabel real fires."* **`type` ist nicht vorhanden** (§4.1). Die Lage ist aber besser als
befürchtet:

**Dafür.** Die Heuristik trennt an echten Daten sauber (§5.3): 80 % der Zellen werden genau einmal
getroffen, die Dauerbrenner sind identifizierbare Stahlwerke, und die betroffene Menge ist mit
39,3 % zu groß, um sie unmarkiert zu lassen.

**Dagegen — das reale Fehlrisiko.** Ein **großer, mehrtägiger Waldbrand** wird ebenfalls über Tage
in denselben Zellen detektiert. Das reine Tageszählen würde ihn als „statische Quelle" ausgrauen —
und zwar genau in der Lage, in der der Layer zählt. Das wäre der schlimmste denkbare Fehler dieses
Layers.

**Mein Vorschlag, um beides zu haben:** Persistenz **allein** grenzt nicht aus. Ausgegraut wird nur,
was **zusätzlich räumlich nicht wächst** — die Regel des Auftrags („≥5 distinct days *without
spatial growth*"), streng gelesen und um zwei Anker ergänzt:

1. **Ausdehnung statt Zelle.** Ein Vegetationsbrand vergrößert oder verschiebt seine Detektions-
   wolke; ein Hochofen hat über Tage dieselbe Ausdehnung von ein bis vier Nachbarzellen. Kriterium:
   ≥5 verschiedene Tage **und** die Fläche der Detektionswolke wächst über den Zeitraum nicht.
2. **Nie verstecken, nur zurücknehmen.** `suspectedStatic` blendet nichts aus, sondern zeichnet
   grau und sagt im Steckbrief, warum — mit dem Hinweis, dass die Einordnung **unsere Ableitung**
   ist und nicht aus den Daten stammt (Muster `colorOrigin: 'derived'`, §W.1). Ein falsch
   eingeordneter Brand bleibt damit sichtbar und anklickbar.
3. **Formulierung.** Weder „Industrie" noch „Fehlalarm", sondern „seit ≥5 Tagen ortsfest — häufig
   eine dauerhafte Wärmequelle (z. B. Industrieanlage), kein Nachweis". Die Heuristik behauptet
   nichts, was sie nicht messen kann.

✅ **Jans Entscheidung (2026-08-14): genau dieser Zuschnitt.** Verbindlich für F2:

- Ausgegraut wird nur, was **≥5 verschiedene Tage UND kein Flächenwachstum** zeigt — Persistenz
  allein genügt nicht.
- **Ausgrauen, nie ausblenden.** Ein falsch eingeordneter Brand bleibt sichtbar und anklickbar.
- Die Einordnung wird als **unsere Ableitung** gekennzeichnet (Muster `colorOrigin: 'derived'`),
  nicht als Eigenschaft der Daten.
- Wortlaut ohne Behauptung: „seit ≥5 Tagen ortsfest — häufig eine dauerhafte Wärmequelle, kein
  Nachweis". Weder „Industrie" noch „Fehlalarm".

### 6.2 Zeitpunkt der Kennzeichnung

✅ **Jans Entscheidung (2026-08-14): erst in F2.** F1 bleibt reine Darstellung (Footprint, FRP,
Konfidenz, Alter, D/N) und zeigt alle Detektionen gleichwertig — ein bewusst in Kauf genommener
Zwischenzustand mit rund **940 Detektionen pro Tag** in DACH, von denen ein erheblicher Teil keine
Vegetationsbrände sind. Grund: „ein Thema = eine Phase = ein Gate" (`CLAUDE.md`). Jan weiß, wie der
Zwischenstand aussieht, bevor er ihn sieht.

---

## 7. Umsetzung F1 — Quelle und Darstellung

`src/fire/sources/firmsHotspots.ts` (neu) · `verify:fire-firms` (86 Prüfungen) ·
Karte, Steckbrief und Popup in `FireMap.tsx`/`FireLayerCard.tsx`/`fireDeck.css`.

### 7.1 Die drei Fallstricke, im Code verankert

Jeder der drei Befunde aus §4.2–§4.4 hat einen Prüfanker, der ihn festnagelt — sie sind die Sorte
Fehler, die still passieren und die niemand später wiederfindet:

| Fallstrick | Anker im Verifier |
|---|---|
| `acq_time` ohne führende Null | `"33"` ⇒ **00:33 UTC** (nicht 33 Minuten, nicht 3:30); dazu `7`, `137`, `1230`, `2358` und die aufgefüllte Regions-CSV-Form `0048` |
| `confidence` einbuchstabig | `l`/`n`/`h` **und** `low`/`nominal`/`high`; alles andere ⇒ `null`, keine Erfindung |
| Spalte `instrument` | „confidence ist die Konfidenz, **NICHT** der Instrumentenname" — ein indexbasierter Parser läse hier `VIIRS` |

Geparst wird durchgehend **nach Spaltennamen aus der Kopfzeile**. Kaputte Zeilen werden gezählt
(`skipped`) und übersprungen, nie stillschweigend verschluckt.

### 7.2 Das 24-Stunden-Fenster holt zwei Tage — und warum

`days=1` ist **nicht** „die letzten 24 Stunden": die API rechnet in UTC-**Kalendertagen**. Um
00:30 UTC wären das dreißig Minuten Daten, und die Karte wäre fast leer, ohne es zu sagen.
`windowPlan()` holt deshalb immer **einen Tag mehr** als das Fenster breit ist und klemmt
anschließend am Zeitstempel. Am laufenden Dev-Server belegt: das 24-h-Fenster fordert `days=2`,
das 7-Tage-Fenster `days=5` + `days=3` ab `heute−7` — acht Kalendertage, lückenlos und ohne
Überlappung.

### 7.3 Vier Darstellungskanäle, jeder aus einem echten Feld

| Kanal | Feld |
|---|---|
| Radius + Füllfarbe | `frp` (Wurzelskala — die Verteilung ist stark rechtsschief, linear wäre eine Lüge in Bildform) |
| Deckkraft + Ringstärke | `confidence` |
| Ringfarbe | Alter der Detektion |
| Footprint-Rechteck, Umriss gestrichelt | `scan`×`track`; gestrichelt = Nachtüberflug |

`FRP_STOPS` steht **einmal** da und speist Karte **und** Legende — eine zweite handgeschriebene
Farbreihe wäre eine zweite Wahrheit. Das Rechteck erscheint ab Zoom 7; darunter wäre es kleiner
als der Punkt darauf.

**Zwei Dinge, die MapLibre erzwungen hat:** `line-dasharray` ist **nicht** datengetrieben — der
Tag/Nacht-Unterschied läuft deshalb über zwei gefilterte Layer statt über ein `['case', …]`, das
der Stil-Validator abgelehnt hätte. Und die Footprint-Features tragen **nur** `day` statt des
vollen Eigenschaftssatzes: bei ~6.000 Rechtecken wären elf Felder je Rechteck rund 66.000 Werte,
die nur zur Worker-Serialisierung beitragen und nie gelesen werden (messbar, §7.6).

### 7.4 Der Steckbrief einer Detektion

Klick auf einen Punkt öffnet FRP (MW), Konfidenz, Erfassungszeit UTC **und** Ortszeit, Satellit,
Tag-/Nachtüberflug, Helligkeitstemperatur I4, I4−I5 und die Pixelfläche in Metern. Dazu drei
Pflichtsätze: „Thermalanomalie — keine Einsatzmeldung", der Punkt ist die **Pixelmitte**, und die
Pixelfläche ist eine Obergrenze der Auflösung, **keine Brandfläche**. Bei `low` kommt der Hinweis
auf mögliche Sonnenreflexion dazu.

**Nachgebessert:** In dichten Nestern liegen mehrere Detektionen übereinander; die erste Fassung
zeigte wortlos irgendeine davon. Jetzt wird die **jüngste** gezeigt und die Zahl der übrigen
genannt („3 Detektionen an dieser Stelle").

### 7.5 Der Rückfall auf GWIS — und was er kosten würde, wenn man ihn verschweigt

Fällt der Primärpfad aus, wird auf den keylosen GWIS-Fensterlayer zurückgefallen: dasselbe
Verhalten wie vor dieser Phase, Punkte ohne Intensität. Am laufenden Prod-Build mit blockiertem
`/_firms/*` verifiziert:

| | Antwort |
|---|---|
| Statuszeile | „1500 Detektionen (Anzeige begrenzt) · **Notbetrieb: NASA FIRMS nicht erreichbar, Anzeige ohne Intensität**" |
| Attribution | NASA verschwindet, **GWIS** erscheint |
| Footprints | keine (GWIS führt kein `scan`/`track`) |

**Beim Prüfen selbst gefunden und behoben:** Die Statuszeile sagte den Notbetrieb — die
Steckbrief-Karte zeigte daneben weiter die **FRP-Skala und zwei Konfidenzstufen**, also Größen,
die in diesem Zustand gar nicht existieren. Genau der Fall, den D-04 verbietet. Der Layer hat
jetzt eine eigene Notbetriebs-Fassung (`HOTSPOTS_DEGRADED_INFO`): eigener Eyebrow, GWIS als
Quelle, und eine Legende, die sagt „keine Intensitätsangabe verfügbar".

### 7.6 Messungen am Prod-Build

| Fenster | Detektionen | Nutzlast |
|---|---|---|
| 24 h (Voreinstellung) | 1.503 | 3 Abrufe |
| 7 Tage | 6.068 | 6 Abrufe, 3,93 MB GeoJSON |

Antwortzeiten im Dev-Pass-Through 1,1–6,3 s (kalt, ohne Durable-Cache); in Produktion trägt der
Edge-Cache. Byte-Gleichheit zum Direktabruf belegt (67.288 / 26.201 / 61.179 B, §5.2).

---

## 8. Umsetzung F2 — Brandereignisse

`src/fire/fireEvents.ts` (neu, pur) · `verify:fire-events` (41 Prüfungen) · **kein zusätzlicher
Abruf**: die Gruppierung rechnet auf denselben Zeilen, die die Karte ohnehin lädt.

### 8.1 Wie gruppiert wird

Räumliche Einfachverkettung (Union-Find über ein Gitter) mit **1,5 km** Verknüpfungsradius, danach
Trennung an Zeitlücken > **48 h**. Je Ereignis: Zeitraum, Überflugzahl (gleiche Minute = ein
Überflug), Pixelzahl, Tage, Ausdehnung, ΣFRP, maxFRP, Konfidenzverteilung, Satelliten, Tendenz.

Die Kette ist gewollt: A–B–C mit je 1 km Abstand wird **ein** Ereignis, obwohl A und C 2 km
trennen — eine Feuerfront ist zusammenhängend, nicht kugelförmig.

### 8.2 Die Ortsfestigkeits-Regel, wie Jan sie entschieden hat

Ausgegraut wird nur, was **beides** erfüllt: ≥5 verschiedene Tage **und** kein räumliches
Wachstum (Ausdehnung und Schwerpunkt bewegen sich um weniger als eine Pixelbreite, 1 km).

**Der Gegentest ist der wichtigste Prüfpunkt der Phase** und steht doppelt im Verifier — einmal
eingebettet, einmal unabhängig: Ein Brand, der sich über sechs Tage ausbreitet, wird **nicht**
ausgegraut. Ebenso wenig ein Ereignis ohne auswertbare Zeitspanne — im Zweifel gegen die
Ausgrauung.

### 8.3 Das Ergebnis bestätigt die F0-Analyse unabhängig

| Verfahren | Anteil ortsfest |
|---|---|
| F0: Zählung über 1-km-Rasterzellen, ≥4 von 5 Tagen | **39,3 %** |
| F2: raumzeitliches Clustering mit Wachstumsprüfung | **39,2 %** (2.380 von 6.068) |

Zwei unabhängige Verfahren auf 0,1 Prozentpunkte. Die 43 als ortsfest eingestuften Ereignisse
liegen dort, wo die F0-Analyse sie vorhergesagt hat — der angeklickte graue Punkt bei
51,49 / 6,70 ist ThyssenKrupp Duisburg.

### 8.4 Ehrlichkeit

- **Ausgegraut, nie ausgeblendet.** Graue Punkte behalten Größe, Sichtbarkeit und Klickbarkeit.
- Das Popup nennt den Grund und schreibt ausdrücklich: „**Eigene Einordnung aus dem Muster, kein
  Nachweis** und kein Feld der Quelle" (`origin: 'derived'`).
- Weder „Industrie" als Tatsache noch „Fehlalarm" — beides wäre eine Behauptung über etwas, das
  wir nicht gemessen haben.
- **Das Wort „bestätigt" entsteht aus der Gruppierung nie.** Ein einzelner Überflug heißt
  „unbestätigt (1 Überflug)". Ein Verifier-Check prüft alle ausgegebenen Texte darauf.
- Im **24-Stunden-Fenster** ist die Einordnung mangels Vorgeschichte gar nicht möglich. Der
  Steckbrief sagt das, statt die Abwesenheit grauer Punkte als „hier ist keine Industrie" wirken
  zu lassen.
- Im **Notbetrieb** (GWIS) gibt es keine Ereignisbildung — GWIS liefert die nötigen Felder nicht.

---

## 9. Verifikation — die fünf Selbstverifikations-Fragen

**1 · Funktionserhalt.** Kein Layer, kein Regler, keine Ansicht entfernt. `fireHotspots` behält
beide Fenster (24 h / 7 Tage), beide Basiskarten-Modi, den Permalink und das mobile Sheet. GWIS
bleibt vollständig erhalten und wird zur Rückfallebene — `gwisHotspots.ts` unverändert,
`verify:fire-sources` grün. Der bestehende Proxy `/_dwd_grib` antwortet unverändert 200.

**2 · Desktop pixelgleich.** Änderungen betreffen ausschließlich `src/fire/*`, `netlify/edge-
functions/firms.ts`, `vite.config.ts` (additives Dev-Plugin), `tsconfig.node.json` (`lib`) und
`scripts/seo/licenses.mjs`. Die Wetterkarte lädt `fireDeck.css` nicht; alle neuen Klassen tragen
das `fire-`-Präfix, `.maplibregl-popup-content` wurde bewusst **nicht** angefasst (sonst
Rückleak in Regenradar, Wetterkarte, 3D-Globus).

**3 · Touch-Targets ≥ 44 px.** Keine neuen Bedienelemente. Das Popup ist ein Anzeigeelement; sein
Schließknopf ist der MapLibre-Standard.

**4 · Konsole sauber.** Dev-Build und Prod-Build, 24-h- und 7-Tage-Fenster, Normal- und
Notbetrieb: **keine Fehler, keine Warnungen**.

**5 · Long Tasks.** ⚠️ **Teilweise erfüllt — mit einem vorbestehenden Anteil.** Alle Werte am
**Prod-Build** (`vite preview`), Einzelläufe:

| Zustand | Tasks > 200 ms | schlechtester |
|---|---|---|
| **Grundlinie, kein Layer aktiv** | **3** | **352 ms** |
| Hotspots 24 h (Voreinstellung) | 1 | 248 ms |
| Hotspots 7 Tage, erste Fassung | 12 | 595 ms |
| Hotspots 7 Tage, nach Aufteilung (Lauf 1 / Lauf 2) | 1 / 2 | 374 / 246 ms |

**Die 200-ms-Grenze wird von der Seite auch OHNE diesen Layer verletzt** — das ist ein
vorbestehender Befund, nicht ein Ergebnis dieser Phase (V-220). Der Layer selbst liegt nach der
Aufteilung auf dem Niveau der Grundlinie; in der Voreinstellung darunter.

Der Weg dahin war eine Messung, keine Vermutung: An echten Daten aufgeschlüsselt kostete der
7-Tage-Fall Dedup 29 ms · Ereignisbildung 170 ms · Zuordnung 31 ms · GeoJSON 46 ms ·
Serialisierung 78 ms. **Jeder Schritt für sich liegt unter 200 ms — zusammen bildeten sie einen
einzigen Task von ~600 ms.** Zwischen den Schritten wird jetzt an den Browser zurückgegeben. Das
macht die Arbeit nicht schneller, aber es hält die Seite bedienbar, und genau darum geht es bei
der Grenze.

**Schlüssel-Gegenprobe:** `dist/` nach vollem Build, 304 Dateien byteweise gegen den echten
Schlüssel — **0 Treffer**, auch der Variablenname `FIRMS_MAP_KEY` kommt nirgends vor.
Negativkontrolle: dieselbe Suche findet „buscosun" in 196 Dateien. Zusätzlich über drei
Live-Antworten (Erfolg, Hüllen-Ablehnung, Whitelist-Ablehnung) Body **und** Header-Satz geprüft:
kein Treffer.

**Verifier:** `fire-firms` 86/86 · `fire-events` 41/41 · `fire-sources` 120/120 ·
`fire-model` 66/66 · `fire-time` 67/67 — **380/380**. `npm run typecheck` grün.

---

## 10. Verbesserungskatalog (D-28)

| Nr. | Kurz |
|---|---|
| **V-218** | `docs/DATA_SOURCES.md` §W.2: „FIRMS Regions-CSV — keylos, OK als Fallback" ist als **Browser**-Aussage falsch. Der Host sendet kein `Access-Control-Allow-Origin`, auch nicht auf 200 mit echtem Origin. Ohne Proxy ist die Datei aus der Seite heraus unerreichbar; als Rückfallebene bleibt GWIS. Eintrag korrigieren. |
| **V-219** | `netlify/edge-functions/dwd-grib.ts` und `dwd-wind.ts` geben bei Netzfehlern `String(err)` und damit möglicherweise die Upstream-URL an den Client. Bei DWD ohne Geheimnis harmlos, als **Muster** aber gefährlich — der FIRMS-Vorschlag musste bewusst davon abweichen. Kommentarwarnung im Muster oder Angleichung. |
| **V-220** | Die Waldbrandseite verletzt die 200-ms-Long-Task-Grenze **ohne jeden aktiven Layer** (3 Tasks > 200 ms, schlechtester 352 ms, am Prod-Build gemessen). Vorbestehend, nicht aus dieser Phase. Ursache noch unbestimmt — Verdacht auf Stil-/Kachelaufbau. Eigene Messphase nötig, sonst bleibt die Grenze für jede künftige Waldbrand-Phase unerreichbar und damit bedeutungslos. |
| **V-221** | Die DACH-BBox `45,5–55,5 N / 5,5–17,5 O` umfasst große Teile Polens, Tschechiens, Norditaliens und Ostfrankreichs; „Aktive Brände" zeigt dort Detektionen, obwohl die Seite DACH heißt. **Vorbestehend** (GWIS nutzte dieselbe Box), fällt mit FIRMS nur stärker auf, weil es mehr Punkte sind. Optionen: auf die DACH-Ländergeometrie filtern (die Maske existiert bereits als `fire-dach-mask`) oder den Umgriff im Steckbrief benennen. |
| **V-222** | Die Ortsfestigkeits-Einordnung braucht ≥5 verschiedene Tage und ist deshalb im 24-h-Fenster **prinzipiell** nicht möglich — dort ist kein Punkt grau. Der Steckbrief sagt es, aber ein Nutzer, der nur die Voreinstellung sieht, bekommt die Einordnung nie zu sehen. Denkbar: das 7-Tage-Fenster im Hintergrund mitziehen (kostet 42 von 5.000 Transaktionen je Cache-Fenster, also praktisch nichts) und die Einordnung auch in der 24-h-Ansicht anwenden. Widerspräche „kein zusätzlicher Abruf" aus dem F2-Auftrag — deshalb Jans Entscheidung, nicht meine. |

## 17. FIRMS auf localhost — Diagnose und Härtung (2026-08-19, Jans Befund „NASA FIRMS nicht erreichbar")

**Ausgangslage:** Dev-Server auf `:5174`, Ansicht `#wb={"b":12,…}` (Hotspots + Treiber). Gemeldet: „NASA FIRMS ist nicht erreichbar".

### 17.1 Was gemessen wurde — der Mechanismus war intakt

| Prüfung | Ergebnis |
|---|---|
| `curl /_firms/VIIRS_SNPP_NRT/<DACH>/1` gegen `:5174` | HTTP 200, echtes CSV (1,4 KB) |
| Schlüssel-Status bei NASA (`mapkey_status`) | gültig, **70 von 5000** Transaktionen im 10-Minuten-Fenster |
| `.env.local` | `FIRMS_MAP_KEY` vorhanden, 32 Zeichen, passt auf `KEY_SHAPE` (BOM am Dateianfang schadet nicht — `\s*` in dotenv deckt ihn ab) |
| Headless-Browser gegen `:5174`, dieselbe URL | **53 Detektionen**, kein Notbetrieb, alle `/_firms`-Antworten 200, Konsole rein |
| Prozesse | `:5174` = PID 12636 (heute gestartet) — also derselbe Server, den Jan benutzt |

Der Dev-Pfad (Vite-Plugin ruft **den echten Edge-Handler** auf) funktioniert also. Was fehlte, war Ausfallsicherheit — und zwar an einer Stelle, die auf localhost besonders oft trifft.

### 17.2 Der Defekt: ein Abruf reißt neun mit

`fetchFirmsHotspots` holte Satellit × Zeitabschnitt über **`Promise.all`** (24 h: 3 Abrufe, 7 Tage: 9). Eine einzige abgelehnte Zusage — 5xx von FIRMS, Timeout, Netzaussetzer — verwarf damit den **gesamten** Lauf; `FirePage` fing das ab und fiel auf die keylose GWIS-Rückfallebene: „Notbetrieb: NASA FIRMS nicht erreichbar, Anzeige ohne Intensität". Acht gelieferte Antworten wurden weggeworfen, um eine fehlende zu bestrafen.

Warum das auf localhost häufiger trifft als in Produktion: dort liegt der Edge-Cache (30 min) vor dem Proxy und fängt Wackler ab; in Dev geht **jeder** Reload direkt an FIRMS, und React StrictMode feuert die Effekte doppelt.

Zweiter Befund: Ein **fehlender Schlüssel** sah im Produkt exakt so aus wie ein Ausfall der NASA — der Handler antwortet 503, die Seite fällt still zurück, dieselbe Meldung. Zwei sehr verschiedene Ursachen, eine Anzeige.

### 17.3 Behoben

| Datei | Änderung |
|---|---|
| `src/fire/sources/firmsHotspots.ts` | `Promise.allSettled` statt `Promise.all`: **alles, was geantwortet hat, wird gezeigt**. Geworfen wird nur, wenn **kein** Abruf durchkam — dann greift der GWIS-Rückfall wie bisher. Abbruch (`signal.aborted`) wirft weiterhin sofort. Neu im `HotspotRun`: `failedFetches` / `plannedFetches`. |
| `src/fire/FirePage.tsx` | Die Statuszeile **sagt** den Teilausfall: „N von M Abrufen ohne Antwort — die Anzeige kann Lücken haben" — an **beiden** Stellen, auch nach der Einordnung (die zweite Zeile ersetzt die erste; im ersten Smoke verschwand der Hinweis genau dort wieder). Eine Teilmenge ohne Hinweis wäre eine Falschaussage über den Bestand (D-04). |
| `vite.config.ts` | Der Dev-Proxy meldet beim Start, ob der Schlüssel geladen wurde — **nie den Wert, nur die Länge**: `[firms] MAP_KEY aus .env.local geladen (32 Zeichen)` bzw. `[firms] KEIN FIRMS_MAP_KEY gefunden … fällt auf die keylose GWIS-Ebene zurück`. Damit ist „kein Schlüssel" auf localhost nicht mehr von „NASA down" ununterscheidbar. |
| `scripts/verify-fire-firms.mjs` | +6 Sonden: `allSettled` statt `all`, Wurf nur bei null Antworten, Zählfelder im `HotspotRun`, Statuszeile nennt den Teilausfall, Dev-Start meldet den Schlüsselzustand, und der Schlüsselwert wird dabei **nicht** ausgegeben. |
| `scripts/verify-fire-clusters.mjs` | Die Sonde „Liste und Karte lesen dieselbe Schlüsselmenge" hing an der vollständigen Argumentliste von `toRun` und schlug bei der Erweiterung fehl. Jetzt prüft sie das Präfix — ihre Absicht (dieselbe `keys`-Menge speist Punkte und Zeilen), nicht die Stelligkeit. |

**Beleg am laufenden System** (`scratchpad/cdp-firms-partial.mjs`, Dev-Server `:5174`, ein Satellit per CDP blockiert = erzwungener Teilausfall):

> `39 Detektionen, davon 19 ortsfest (grau) · Einordnung aus 7 Tagen Vorgeschichte · **1 von 3 Abrufen ohne Antwort — die Anzeige kann Lücken haben**`
> `degradedVisible: false` · `notbetrieb: false`

Vorher wäre an dieser Stelle der Notbetrieb gestanden — mit weniger Daten, ohne Intensität und ohne Einordnung. Verifier: `verify:fire-firms` **92/92**, `verify:fire-clusters` **105/105**, `fire-model` 123/123, `fire-time` 127/127, `typecheck` grün.

**Was das nicht behebt:** Ist FIRMS wirklich vollständig aus, bleibt es beim Notbetrieb über GWIS — richtig so. Und der Vorbehalt bleibt: „keine Hotspots" heißt nie „keine Brände".
