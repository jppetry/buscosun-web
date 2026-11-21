# Phase SL — Laden des 10-m-Satellitenbilds (Brandradar gegen Gletscher)

> Auftrag (Jan, 19.11.2026): Im Brandradar bleibt das Bild manchmal beim Laden hängen und ist dann verpixelt; im
> Gletscher-Feature lädt das Satellitenbild deutlich besser. Herausfinden, was der Gletscher besser macht, auf den
> Brandradar übertragen, die Ursache beheben. Erst messen, dann ändern; Datengrundlage und Darstellung bleiben.

Werkzeuge und Rohdaten liegen in `audit/brandradar-satellitenbilder/`:
`sat-load-probe.mjs` (Schrittfolge auf den echten Seiten), `sat-blip-probe.mjs` (Verbindungsabriss),
`range-bench.mjs` (Teilabrufe ohne App), Ergebnisse in `sl-messung/*.json`.

## 1. Was verglichen wird

Beide Features zeigen dasselbe Bild mit **demselben Betrachter**: `src/fire/FireCogViewer.tsx` liest das
Sentinel-2-Original (`TCI.tif`, Cloud-Optimized GeoTIFF) direkt vom AWS-Bucket `sentinel-cogs` über Teilabrufe
(`Range`) und zeichnet auf eine 2D-Canvas. Der Gletscher ruft ihn aus `GlacierSatImagery.tsx` auf, der Brandradar
aus `FireSatImagery.tsx` (Live-Dossier `FireDossier.tsx`, Historie-Dossier `FireHistoryPanel.tsx`).
Quelle, Format, Kacheln, Cache, Parallelität, Fristen und Zwischenbilder sind also **gleich** — der Unterschied
liegt im Aufruf. Die Basiskarte (Esri World Imagery) ist nicht die Ursache: der Dienst antwortet an sieben
DACH-Punkten bis z19/z20 mit echten Kacheln in 20–490 ms (Probe 19.11.).

Aufbau der Datei (gemessen am Kopf von `S2B_30TUK_20260808_0_L2A/TCI.tif`):

| Ebene | Raster | Kachel | Kacheln | Boden je Kachel | Bytes je Kachel (Mittel) |
|---|---|---|---|---|---|
| 10 m | 10 980² | 1 024² | 11 × 11 | 10,2 km | 2 111 KB |
| 20 m | 5 490² | 512² | 11 × 11 | 10,2 km | 547 KB |
| 40 m | 2 745² | 512² | 6 × 6 | 20,5 km | 469 KB |
| 80 m | 1 373² | 512² | 3 × 3 | 41 km | 449 KB |
| 160 m | 687² | 512² | 2 × 2 | 82 km | 257 KB |

Ab der 20-m-Ebene sind die Kacheln 512² statt 1 024²: dieselbe Bildschirmfläche braucht dort **viermal so viele
Kacheln** wie auf der 10-m-Ebene.

## 2. Was der Gletscher anders macht (und warum es dort läuft)

| | Gletscher | Brandradar |
|---|---|---|
| Startausschnitt | fest 12 m je CSS-Pixel um den Punkt (`START_MPP`) ⇒ immer die 10-m-Ebene, 1–4 Kacheln decken das Bild; Zoomen und Schieben im Vollbild brauchen meist **keine** neue Kachel | `fitView` rahmt die ganze Brandfläche (12 … 250 m je CSS-Pixel, Jan 04.11.) ⇒ bei größeren Bränden die 20-/40-/80-m-Ebenen mit 512²-Kacheln; jeder Zoom- oder Schiebeschritt braucht neue Kacheln |
| Kacheln je Ansicht | 2–12 (unter dem Bild-Budget 12 und unter dem Cache-Deckel 24) | im Vollbild bis 40–54 auf 1920 × 1080 (über dem Cache-Deckel 24) |
| Vorladen (`warmCogView`) | ja, sobald das Dossier steht (`warmGlacierSat`, 10.11.) | Live-Dossier ja (`warmSatImagery`, 10.11.); **Historie-Dossier nein** — dort beginnt alles erst mit dem Klick auf „Satellit“ |
| Modi | nur Echtfarbe | Echtfarbe, SWIR, dNBR teilen sich denselben Kachel-Cache |

Der Gletscher macht also nichts im Lader besser — er bleibt in dem Bereich, in dem die Schwächen des Laders
nicht greifen. Die Schwächen selbst stecken im gemeinsamen Betrachter (§3) und treffen auch den Gletscher,
sobald man dort herauszoomt oder die Verbindung kurz abreißt (§3.3).

## 3. Ursachen, mit Messwerten

### 3.1 U1 — Der Browser bedient Teilabrufe derselben Datei nacheinander; die Wartezeit läuft gegen die 10-s-Frist

Der Betrachter schickt bis zu sechs Teilabrufe gleichzeitig an **eine** Adresse (`…/TCI.tif`). Chrome führt je
Adresse einen Cache-Eintrag und lässt nur einen Abruf daran schreiben — die anderen warten. `range-bench.mjs`
(sechs Bereiche à 190 KB gleichzeitig, Wartezeit bis zum Antwortkopf):

| Abrufart | Kopf nach (sechs gleichzeitige Abrufe) | Wiederholung derselben Bereiche |
|---|---|---|
| wie bisher (eine Adresse) | 222 · 447 · 676 · 897 · 1 112 · 1 325 ms — eine Treppe | wieder Treppe, 0 von 12 aus dem Cache |
| `cache: 'no-store'` | 282 · 291 · 447 · 388 · 395 · 415 ms | 0 von 12 aus dem Cache, alles neu vom Netz |
| eigene Adresse je Bereich (`?r=<von>-<bis>`) | 240 · 227 · 217 · 224 · 239 · 238 ms | **12 von 12 aus dem Cache, 0 Bytes, 6 ms** |

Dieselbe Treppe in Jans Chrome 157 mit normalem Profil (226 · 439 · 655 · 873 · 1 090 · 1 297 ms; mit eigener
Adresse 222–333 ms). Eine 1,9-MB-Kachel in sechs Teilen braucht mit eigener Adresse 519 ms gegen 1 425 ms in einem
Abruf; „wie bisher“ sind die sechs Teile **langsamer** als ein Abruf (1 509 gegen 931 ms) — die Aufteilung vom
06.11. wirkt im Browser-Alltag also gar nicht.

Folge im Betrachter: `fetchSat` gibt einen Abruf auf, wenn nach 10 s kein Antwortkopf da ist
(`TILE_FETCH.firstByteMs`), und versucht es einmal neu. Die Frist läuft aber schon, während der Abruf nur in der
Schlange des Browsers wartet. Mitschnitt in der Seite (Brandradar, Kapitel „Satellit“ geöffnet): die ersten sechs
Abrufe kommen durch, die nächsten sechs warten 10 s ohne Kopf und werden abgebrochen, der zweite Versuch ebenso,
die Kachel gilt als ausgefallen (Pause 4 … 30 s) — nach 50 s standen 2 Kacheln, 24 von 30 Abrufen waren
abgebrochen. Am Gletscher dasselbe Muster milder: 4 Abbrüche im ersten Schub, danach läuft es, weil nur vier
Kacheln nötig sind.

### 3.2 U2 — Im Vollbild braucht die Ansicht mehr Kacheln, als der Cache hält ⇒ Ladeschleife ohne Ende

`_tiles` hält 24 Kacheln und wirft die **älteste** hinaus (`TILE_CACHE_MAX`), auch wenn sie gerade im Bild liegt.
1920 × 1080 auf der 20-m-Ebene sind bis zu 8–9 × 5–6 = 40–54 Kacheln: jede neu geladene Kachel verdrängt eine,
die das Bild noch braucht, die wird wieder angefordert, verdrängt die nächste. Gemessen (Brand Navaluenga,
Vollbild 1920 × 1080, ein Zoomschritt auf die 20-m-Ebene, danach Stillstand der Ansicht): nach 90 s 142
„Kacheln“ und 74 MB im Zähler, 376 Abrufe auf 106 verschiedene Bereiche, einzelne Bereiche fünfmal — die Zeile
„schärfere Ebene lädt …“ geht nie weg, das Bild wechselt zwischen scharfen und unscharfen Stellen.

### 3.3 U3 — Fällt eine vorgeladene Kachel aus, fragt niemand mehr nach ihr

Nur Kacheln, die ein Bild selbst angefordert hat, bekommen bei einem Ausfall einen neuen Versuch (`retryLater`).
Kacheln aus dem Vorladen (`warmCogView`) oder aus einem früheren Bild nicht: ihr Ausfall löst kein neues Bild
aus. `sat-blip-probe.mjs` am Gletscher (Kapitel öffnen, während sechs vorgeladene Abrufe unterwegs sind, 3 s ohne
Netz, Netz wieder da): „0 Kacheln · schärfere Ebene lädt …“, und in 77 s geht **keine einzige** Anfrage mehr
hinaus. In der eingebetteten Ansicht (ohne Vergrößern) kann man weder zoomen noch schieben — der Zustand bleibt,
bis man die Seite neu lädt.

### 3.4 Was daraus im Alltag wird

| Lauf (Schrittfolge öffnen → vergrößern → 2 × hinein → 2 × schieben → 2 × heraus → Folge) | zur Ruhe gekommen | Abrufe abgebrochen/fehlgeschlagen |
|---|---|---|
| Gletscher · Desktop 1440 × 900 | 9 von 9 Schritten (Öffnen 20,9 s) | 0 von 51 |
| Gletscher · mobil 390 × 844 | 9 von 9 (Öffnen 20,4 s) | 3 von 14 |
| Brandradar · Desktop 1440 × 900 | **0 von 9** | 86 von 167 |
| Brandradar · Desktop 1920 × 1080 | **0 von 6** (danach reagierte die Seite nicht mehr auf die Eingabe der Sonde) | 125 von 165 |
| Brandradar · mobil 390 × 844 | **0 von 9** | 71 von 203 |

(Schrittfrist 30 s; Zahlen aus `sl-messung/vorher-*.json`; langsame Verbindung in §6.)

### 3.5 Korrektur zu §3.1 und §3.4 (19.11. abends): der 10-s-Abbruch kam vom Mess-Browser, nicht vom Cache des Browsers

Die Seitenläufe in §3.4 liefen in `chrome-headless-shell` **ohne Grafikkarte**. Auf der Brandradar-Seite liegt hinter
dem Dossier eine MapLibre-Karte mit Satelliten-Basiskarte, die in jedem Bild neu zeichnet (rund 57 Bildanforderungen
je Sekunde bei stehender Seite). Ohne Grafikkarte blockiert das den Haupt-Thread: im CPU-Profil 17 von 26 s in
`bindTexture` (`_render` → `raster`), lange Aufgaben von zusammen 52 s in zwei Minuten, eine einfache Abfrage der
Seite wartete bis zu 22 s. Die Antworten des Bild-Speichers kamen dabei an, wurden aber zu spät verarbeitet und
liefen in die 10-s-Frist von `fetchSat` — das Muster „sechs kommen durch, die nächsten sechs warten 10 s“.

Belege: (a) dieselben Teilabrufe als gleitendes Fenster von sechs, 30 Stück, jede mit eigener Adresse — auf einer
leeren Seite, auf einer Seite unter dem Service Worker und IM geladenen Brand-Dossier (Kapitel zu): Kopf nach
0,2 … 1,0 s (die ersten sechs mit Verbindungsaufbau), kein Abbruch. (b) Mit geöffnetem Kapitel im Mess-Browser ohne Grafikkarte: 13 Abrufe gut, danach
jeder Abruf nach 10 s abgebrochen — auch mit eigener Adresse je Bereich (SL-1). (c) Dieselbe Seite in einem vollen
Chromium mit Grafikkarte (`--chrome`, `--headless=new`): keine lange Aufgabe nach dem Öffnen, 21 Abrufe, 0 Abbrüche,
das Bild steht 4 s nach dem Klick.

Was bleibt: U1 ist echt (die Treppe ist in `range-bench.mjs` und in Jans Chrome gemessen), aber sie kostet rund
220 ms je wartendem Abruf, nicht 10 s. U2 und U3 sind unabhängig vom Mess-Browser. Die Brandradar-Zeilen der Tabelle
in §3.4 messen vor allem den Rechner der Sonde; der Vergleich vorher/nachher steht deshalb in §5 mit Grafikkarte neu.
Der Gletscher lief in §3.4 durch, weil dort keine Rasterkarte hinter dem Dossier zeichnet.

## 4. Umsetzung (19.11.)

| | Was | Wo |
|---|---|---|
| **SL-1** (U1) | Jeder Bytebereich wird unter einer eigenen Adresse gefragt (`?r=<von>-<bis>`, der Bucket ignoriert den Parameter): keine Treppe mehr, und ein Bereich, der noch einmal gebraucht wird, kommt aus dem Cache des Browsers. Gilt für Kachel-Teile und Dateikopf. | `rangeAddress` in `detail/fireSatImagery.ts`, `fetchPart` / `fetchIfds` in `FireCogViewer.tsx` |
| **SL-2** (U2) | Der Kachel-Cache zählt Bytes statt Kacheln (96 MB = was die 24 Kacheln der 10-m-Ebene bisher hielten; eine 512²-Kachel kostet ein Viertel), wirft die am längsten ungenutzte zuerst hinaus und **nie eine Kachel, die das Bild auf dem Schirm braucht**. Solange die gewählte Ebene nicht vollständig ist, gilt das auch für das Zwischenbild der Ebenen darunter. | `detail/cogTileCache.ts` (rein: `tilesToEvict`, `tileBytes`), `putBitmap` / `touchTile` / Pins im `draw` |
| **SL-3** (U2) | Eine Ansicht wird aus einer Ebene gezeichnet, deren Kacheln im Bild in den Cache passen (höchstens 80 MB je Ebene: 20 Kacheln der 10-m-Ebene oder 80 der 20-m-Ebene) — sonst aus der nächstgröberen. Damit ist der Deckel eine echte Grenze statt einer Schleife. Greift nur weit herausgezoomt im Vollbild auf 2×-Bildschirmen; die Statuszeile nennt die Auflösung der Ebene, die wirklich gezeigt wird. `set`. | `levelThatFits` in `cogTileCache.ts`, `viewLevel` im Betrachter (drei Modi und Vorladen) |
| **SL-4** (U3) | Ankunft und Ausfall einer Kachel erfahren **alle** offenen Betrachter, nicht nur das Bild, das sie angefordert hat: eine vorgeladene oder früher angeforderte Kachel, die ausfällt, wird nach der Pause (4 · 8 · 16 · 30 s) neu geholt. | `_watchers` / `tellWatchers` in `putBitmap`, Abo im Betrachter |
| **SL-5** | Das Historie-Dossier lädt das Bild vor wie das Live-Dossier seit 10.11. — sobald das Ereignis-Detail da ist (seine Pixelfläche rahmt die Startansicht). | `HistoryDossierBody` in `FireHistoryPanel.tsx` → `warmSatImagery` |

Nicht geändert: Quelle, Format, Kachelbau, Farben, Startausschnitt (`fitView`, Jan 04.11.), die Fristen von
`fetchSat`, die Modi SWIR und dNBR, der Gletscher-Aufruf. Der Gletscher bekommt SL-1 bis SL-4 mit, weil es derselbe
Betrachter ist.

**Schalter:** `?satload=0` stellt alles zurück auf den Lader vor dem 19.11. (eine Adresse je Datei, 24 Kacheln,
älteste zuerst, kein neuer Versuch für vorgeladene Kacheln, kein Vorladen in der Historie). Einmal je Seite gelesen.

**Prüfer:** `verify:fire-detail` 480/490 — sieben neue Punkte `[sl]`, alle grün: die Cache-Regeln als echte Rechnung
(54 Kacheln im Bild stehen nach einem Durchgang; Gegenprobe mit der alten Regel: lädt in jeder Runde neu), die
Ebenenwahl, die Adresse je Bereich, die Pausen, die Verdrahtung. Die zehn roten Punkte sind dieselben wie am sauberen
HEAD (473/483; `[bd2]`, `[sat3]`, `[bde]`, `[dnbr]` — nicht aus dieser Phase). `verify:fire-history` 110/118, rot wie
am HEAD. `typecheck` grün, Build grün. Budget: totalJs 2 057,4 KB bei einer Grenze von 2 051 KB — schon vor dieser
Phase rot (2 055,8), SL kostet 1,6 KB; die Grenze ist nicht angehoben.

## 5. Messung nachher (19.11., mit Grafikkarte)

`sat-load-probe.mjs --chrome <volles Chromium>` gegen den Vorschau-Build (`vite preview`, Port 5199), dieselbe
Schrittfolge wie in §3.4, Schrittfrist 30 s. „Alt“ ist derselbe Build mit `?satload=0`, direkt danach gemessen.
Brand: Navaluenga (`40.34891_-4.74644_202607221411`, Historie-Dossier), Gletscher: Großer Aletschgletscher.

| Lauf | zur Ruhe gekommen | Öffnen | längster Schritt | Abrufe | Bereiche mehrfach gefragt | abgebrochen |
|---|---|---|---|---|---|---|
| Brandradar neu · 1440 × 900 | **9 von 9** | 4,7 s | 4,7 s | 92 | keiner | 0 |
| Brandradar neu · 1920 × 1080 | **9 von 9** | 5,1 s | 5,6 s | 219 | keiner | 0 |
| Brandradar neu · mobil 390 × 844 | **9 von 9** | 4,4 s | 7,9 s | 223 | keiner | 0 |
| Gletscher neu · 1440 × 900 | 9 von 9 | 8,7 s | 8,7 s | 51 | keiner | 0 |
| Gletscher neu · mobil 390 × 844 | 9 von 9 | 5,8 s | 5,8 s | 11 | keiner | 0 |
| Brandradar alt · 1440 × 900 | 9 von 9 | 8,0 s | 24,2 s (Folge) | 234 | ja (bis 2 ×) | 0 |
| Brandradar alt · 1920 × 1080 | **3 von 9** — ab dem zweiten Zoom nie mehr | 7,4 s | nie | 905 | ja (bis 2 × je Schritt) | 0 |
| Brandradar alt · mobil 390 × 844 | 8 von 9 (Folge nie) | 6,0 s | nie | 319 | ja | 0 |

Einzelne Schritte am Desktop 1440 × 900, alt gegen neu: erster Zoom 14,8 s → 4,2 s; herauszoomen 8,3 s → 2,1 s
(28 gegen 8 Abrufe — der alte Cache hatte die Kacheln schon wieder verworfen); schnelle Folge 24,2 s und 122 Abrufe →
1,9 s und kein Abruf. Im Vollbild 1920 × 1080 zählte die Statuszeile des alten Laders am Ende 321 „Kacheln“ und
167,7 MB für eine Ansicht, die 50 Kacheln braucht (U2); der neue steht bei 73 Kacheln und 37,9 MB.

**Verbindungsabriss (U3),** `sat-blip-probe.mjs --chrome` gegen den Dev-Server (Port 5173, ohne Service Worker —
unter dem Service Worker des Vorschau-Builds greift das Trennen der Sonde nicht, seine Abrufe laufen weiter):
Brandradar neu — sechs vorgeladene Kacheln unterwegs, 3 s ohne Netz, 26 Abrufe fehlgeschlagen, das Bild steht 3,1 s
nach dem Wiederkommen (13 neue Abrufe). Der Fall aus §3.3 (vorgeladene Kachel fällt aus, nichts fragt nach) tritt
nicht mehr auf. Am Gletscher erreichte die Sonde in meinen zwei Läufen den Betrachter nicht (leere Statuszeile) —
dort steht für U3 nur der Lauf aus §3.3 vorher; nachher ist am Gletscher **nicht gemessen**.

Rohdaten: `sl-messung/nachher-fire-gpu.*`, `nachher-glacier-gpu.*`, `vorher-fire-gpu.*`, `nachher-blip-dev-gpu.log`,
`vorher-blip-dev-gpu.log`; der erste Lauf ohne Grafikkarte (§3.5) liegt als `nachher-fire-desktop-ohne-gpu.json` dabei.
Die Spalte „MB“ der Sonde zeigt unter dem Vorschau-Build 0: die Abrufe laufen dort durch den Service Worker, die
Seite sieht keine Bytes auf dem Draht — die Megabyte stehen in der Statuszeile des Betrachters.

**Nicht gemessen:** langsame Verbindung nach der Änderung (der Lauf vorher in `vorher-slow.json` lief ohne
Grafikkarte), SWIR und dNBR im Vollbild, ein echtes Telefon, der Speicherverbrauch im Browser.

## 6. Antwort auf die Frage

Brandradar und Gletscher laden das Satellitenbild mit **demselben** Code. Der Gletscher lief gut, weil seine Ansicht
mit 1 bis 4 Kacheln auskommt; das Brandradar rahmt die ganze Brandfläche, braucht im Vollbild bis über 50 Kacheln und
lief damit in die Schwächen des Laders (§3.2, §3.3). Die sind im gemeinsamen Lader behoben — beide Features laden
jetzt gleich, und das Brandradar kommt in jeder gemessenen Lage zur Ruhe. Im Historie-Dossier beginnt das Laden
außerdem schon, bevor man „Satellit“ anklickt, wie im Live-Dossier und im Gletscher.

## 7. Offen

- **E-SL-1** (gesetzt, Jan): 80 MB je Ebene einer Ansicht — darüber zeichnet der Betrachter eine Ebene gröber. Greift
  weit herausgezoomt im Vollbild auf 2×-Bildschirmen. Wert nicht gemessen, sondern aus dem bisherigen Cache-Deckel
  abgeleitet.
- **V-SL-1** Die Karte hinter dem Brand-Dossier zeichnet jedes Bild neu, auch verdeckt (rund 57 Bildanforderungen je
  Sekunde bei stehender Seite, `_render` → `raster`). *Mehrwert:* weniger Rechenzeit und Akku auf dem Telefon, und
  eine Seite, die auch auf schwacher Grafik nicht ins Stocken kommt (§3.5). *Skizze:* die Karte anhalten, solange das
  Dossier sie verdeckt — wie die Karte hinter dem Wetter-Dashboard. Fasst `FireMap` an: Jans Gate.
- **V-SL-2** Der Service Worker greift in jeden Teilabruf des Bild-Speichers und versucht die Antwort in seinen Cache
  zu legen; bei Teilantworten (206) schlägt das immer fehl, die Kopie des Antwortkörpers wird dabei angelegt.
  *Mehrwert:* weniger Speicher und ein Umweg weniger je Kachel. *Skizze:* `sentinel-cogs…amazonaws.com` wie das
  Daten-CDN durchreichen (kein `respondWith`); der Browser-Cache hält die Bereiche seit SL-1 selbst. Ändert
  `public/sw.js`: Jans Gate.
- **V-SL-3** Fällt der Dateikopf oder die Szenensuche aus, zeigt der Betrachter den Fehlersatz und versucht es nicht
  von selbst noch einmal (anders als bei Kacheln seit SL-4). *Skizze:* derselbe Weg über die Pausen 4 … 30 s.
- **V-SL-4** Die Caches der Bandkacheln (`_bandTiles`, `_sclTiles`, je 32 Stück) und der Klassenkacheln (`_clsTiles`,
  24) zählen weiter Stücke und werfen die älteste hinaus. Sie lösen keine Ladeschleife aus (das fertige Bild liegt im
  Bitmap-Cache), aber SWIR nach dNBR lädt geteilte Bänder im Vollbild neu. Nicht gemessen.
- **V-SL-5** Wechselt im Historie-Dossier das Ereignis, ohne dass die Ansicht neu aufgebaut wird, kann das Vorladen
  einmal mit dem Rahmen des vorigen Ereignisses starten (ein paar Kacheln zu viel, kein falsches Bild).
- **V-SL-6** `sat-blip-probe.mjs` erreicht am Gletscher den Betrachter nicht mehr (leere Statuszeile) — die Sonde
  prüfen, bevor man sich auf sie stützt.
- Real-Device, Commit und Push: `MANUELLE-SCHRITTE.md` §104.
