# audit/radar-nur-datenrepo.md — Phase RN: das DWD-Komposit nur noch aus dem Daten-Repo

> Jans Auftrag (18.11.2026): „mir ist aufgefallen, dass die Wetterkarte manchmal noch Radar-Komposits direkt zieht, obwohl wir
> eigentlich alles von GitHub ziehen wollen" — und nach der Bestätigung: „ich möchte, dass du das umbaust und nur aus dem
> Daten-Repo holst, das DWD-Komposit." Gemeint ist das Produkt RV (Radar-Vorhersage des DWD, 25 Bilder 0 … +120 min, 1 km).
> Vorgängerphasen: RD (`radar-datenrepo.md`, Spiegel und Bild-Weg), NL/ND (`niederschlag-ladezeit.md`,
> `niederschlag-laden-dach.md`, Ausweichweg raw.githubusercontent, Gates). Werkzeuge und Rohdaten: `audit/radar-nur-datenrepo/`.

## §0 Kurzfassung

- **Befund:** Ja, der Client holte das Komposit an fünf Stellen direkt beim DWD (über den Netlify-Rewrite `/_dwd_opendata`).
  Die häufigste: Beim Öffnen ist der jüngste Slot 3,3–8,3 min alt, das Daten-Repo wird für ihn aber erst ab 4,5 min gefragt. In
  diesem Fenster (72 von 300 s, also bei etwa jedem vierten Aufruf) kam der ganze Tar vom DWD.
- **Umgesetzt (E-RN-1, an für alle):** Das RV-Produkt kommt nur noch aus `buscosun-data` (jsDelivr oder
  raw.githubusercontent). Ein Slot, den das Repo noch nicht haben kann, wird nicht angefragt; die Karte zeichnet den Slot
  davor und lädt den neuen nach, sobald er sein Gate passiert hat (≤ 82 s später). Kein Tar, kein Verzeichnis-Listing, kein
  DWD-Abruf — auch nicht nach einem CDN-Fehler, im Rückblick oder wenn der Spiegel steht.
- **Preis:** Bei etwa jedem vierten Aufruf ist das erste Bild einen Slot (5 min) älter als bisher, bis zum Nachladen. Und der
  Spiegel ist jetzt die einzige Quelle für das deutsche Radar: steht er länger als ≈ 30 min, zeigt die Karte „RADOLAN-RV nicht
  erreichbar" statt eines frischen DWD-Bilds (E-RN-2 offen).
- **Rückfall:** `?rvdwd=1` bzw. `localStorage.rvdwd = '1'` stellt das alte Verhalten her. `?radarcdn=0` heißt weiter „Radar
  nicht vom CDN", also DWD-Weg.
- **Beleg:** Seite im Headless-Browser, geöffnet 203 s nach dem Slot: 0 Abrufe beim DWD, Slot davor aus dem Repo, der neue 76 s
  später nachgeladen; dieselbe Seite mit `?rvdwd=1` holt den Tar beim DWD (Gegenprobe). `verify:radar-fallback` 67/67.
- **Nicht angefasst:** AT (GeoSphere `/metadata`, NetCDF als Rückfall) und CH (STAC/HDF5 als Rückfall) haben weiter direkte
  Wege (V-RN-5). Der Spiegel selbst liest natürlich weiter beim DWD.
- **Am selben Tag dazugekommen (Jans Wort):** RN-2 — ICON-D2-Niederschlag (§8); RN-3 — Wind, Temperatur, Böen, Gewitter,
  Rotation, Blitzprognose, Schnee (§9, Schalter `?d2dwd=1`); RN-4 — Zellbahnen/KONRAD3D (§10, Schalter `?konraddwd=1`). Alle
  nur noch aus dem Daten-Repo, ein Fehlschlag wird wiederholt statt an den DWD gegeben.

## §1 Diagnose

### 1.1 Wo der Client das Komposit direkt holte (Stand vor RN, `src/sources/radolan.ts`, `radolanRuns.ts`)

| # | Fall | Was geholt wurde | Wie oft |
|---|---|---|---|
| 1 | Jüngster Slot jünger als das Bild-Gate (270 s). Der Leser rät den jüngsten Slot ab 198 s (DWD-Ablage 3:17–3:26). Unter 240 s: Tar vom DWD. 240–270 s: Tar über jsDelivr, bei 404 der DWD (jsDelivr löst `@main` erst 31–90 s nach dem Push auf, ND §1.4) | ganzer Tar (auf der Leitung 840 KB, entpackt 6–10 MB) | 72 von 300 s ⇒ ≈ 24 % der Aufrufe, und bei jedem 5-min-Refresh einer Sitzung, die in diesem Fenster geöffnet wurde |
| 2 | Slot über dem Gate, aber der Spiegel hat ihn noch nicht (19 % der Slots, ND §1.3), ein Bild fehlt, oder die CDN-Frist (8 s) reißt | ganzer Tar | je Vorfall |
| 3 | Sitzungs-Latch: zwei harte CDN-Fehler binnen 5 min schließen alle CDN-Wege für 5 min | alles direkt | je Vorfall, 5 min lang |
| 4 | Rückblick: Slot, dessen Analyse-Bild im Repo fehlt oder der älter als 115 min ist | ganzer Tar je Slot | selten |
| 5 | Alle geratenen Läufe scheitern | Verzeichnis-Listing des DWD (80 KB), dann Tar | selten |

Der Frühstart des Routers (`warmRvTar`) tat in Fall 1 dasselbe, noch bevor die Karte gemountet war.

### 1.2 Was das Daten-Repo für RV hält

Je Slot 25 Bilder + `meta.json` unter `radar/img/v1/rv/<Stempel>/` (12 Slots = 1 h), die Analyse zusätzlich unter `rv-past/`
(24 Slots = 2 h), den rohen Tar unter `radar/rv/` (12 Läufe). Der Spiegel pusht einen Slot im Median 234 s nach der Slot-Zeit
(min 209 s, p90 321 s, max 484 s; ND §1.3). Das Bild-Gate des Clients liegt bei 270 s, das Fenster endet bei 55 min.

### 1.3 Messung 18.11.: raw.githubusercontent hält ein 404 rund 60 s fest

Naheliegend wäre, den jungen Slot vor dem Gate schon auf raw.githubusercontent zu suchen (dort liegt er Sekunden nach dem Push).
Gemessen (eine nie existierende Datei im Daten-Repo, alle 20 s abgefragt, 290 s lang): `X-Cache: MISS` bei 1, 62, 123, 184 und
245 s, dazwischen `HIT` — der Edge hält die 404-Antwort also ≈ 60 s. Eine Sonde bei 230 s würde den Slot an diesem Edge bis 290 s
verstecken, also über das Gate hinaus, für alle Besucher dort. Eine Sonde, die das nicht kann (vor 210 s), kommt vor dem
frühesten gemessenen Push. **Folge: vor dem Gate wird nichts gefragt** — weder das CDN (hält 404 62–118 s, RD2 §10.3) noch raw.
Rohdaten: `raw-404-hold.txt`.

### 1.4 Mitschnitt 18.11. 18:31 UTC: jsDelivr schickt Kopfzeilen, aber keinen Inhalt

Der echte Leser gegen das echte Repo (`rn-trace.mjs`, Slot 374 s alt, CDN zuerst): 25 der 26 Dateien kamen vom CDN, für
`g015.png` kamen die Kopfzeilen (200) nach 0,55 s, der Inhalt nie. Der Ausweichweg (NL-2) greift nur, bis Kopfzeilen da sind;
also verwarf die 8-s-Frist den Slot. Danach versuchte der Leser den Repo-Tar am selben CDN (weitere 8 s, Fehler), der Latch
schloss, und erst der Slot davor kam — nach 32,7 s. Vor RN hätte an dieser Stelle der DWD-Tar gerettet. Rohdaten:
`trace-cdn-body-hang.txt`. Daraus folgt Baustein 5 in §3.

## §2 Entscheidungen

- **E-RN-1 (Jan, 18.11.2026): das DWD-Komposit nur aus dem Daten-Repo.** Umgesetzt und für alle an. Das ist eine Ausnahme von
  Rule 2 (neue Wege kommen sonst aus), auf Jans ausdrückliches Wort; der alte Weg bleibt als benannter Rückfall hinter
  `rvdwd=1`.
- **E-RN-2 (offen, Jan): Notweg bei Spiegel-Ausfall?** Heute gibt es keinen. Steht der Spiegel, zeichnet die Karte den letzten
  gepushten Lauf (seine Bilder reichen +120 min), solange er unter den sechs jüngsten lesbaren Slots ist (≈ 30 min), danach
  nennt die Statuszeile das deutsche Radar als ausgefallen. Möglich wäre: ab einem benannten Alter des jüngsten Repo-Slots
  (etwa 15 min) automatisch der DWD-Weg. Das widerspricht dem Wortlaut „nur aus dem Daten-Repo", deshalb nicht gebaut.
- **E-RN-3 (offen, Jan): Schalter `rvdwd` und den DWD-Code später löschen?** Löschen ist Jans Freigabe. Solange E-RN-2 offen
  ist, ist der Schalter der einzige Handgriff bei einem Spiegel-Ausfall (und nur je Browser).
- **E-RN-4 (offen, Jan): roher Tar im Spiegel.** Der Standard-Client liest `radar/rv/*.tar` nur noch mit `?radarimg=0` oder wenn
  er die `meta.json` eines Slots nicht lesen kann. Ältere Client-Bündel (Service Worker, offene Tabs) lesen ihn weiter. Der
  Spiegel könnte ihn später weglassen — nicht vor Ablauf der alten Bündel.

## §3 Umsetzung

1. **Schalter** (`radolanRuns.ts`): `rvDwdFlagFrom` liest `?rvdwd=0|1` vor `localStorage.rvdwd`, Voreinstellung
   `RV_DWD_DIRECT_DEFAULT = false`. `rvDwdDirect()` ist wahr mit dem Schalter oder wenn `?radarcdn=0` alle CDN-Wege abschaltet.
   `rvdwd` steht in `SHARE_BLOCKED_KEYS` (ein geteilter Link trägt den Schalter nicht).
2. **Kandidaten** (`rvRepoRuns`): die jüngsten Slots, die jetzt im Repo lesbar sind — über dem Gate, im Fenster des Spiegels.
   Der Leser probiert sechs davon (`RV_REPO_TRIES`, gesetzt; ≈ 30 min zurück), ohne Listing dahinter. Ein Slot, den das Repo
   nicht hat, wirft `RvNotInRepo`, der nächste ältere folgt.
3. **Nachladen** (`rvFollowUpInMs`, in `MapView` und `NowcastRadarMap`): Wer einen älteren Lauf hält, während der jüngste auf
   sein Gate wartet, fragt bei Gate + 10 s noch einmal; ist der Spiegel dann spät, alle 70 s wieder, bis 90 s hinter dem Gate
   (alle drei Zahlen gesetzt; die 70 s liegen über den 60 s aus §1.3). Ohne das bliebe eine Sitzung, die im Fenster vor dem Gate
   geöffnet wurde, dauerhaft einen Slot zurück, weil ihr 5-min-Takt an der Öffnungszeit hängt. Nur im sichtbaren Tab.
4. **Gehaltener Lauf:** Ist der neue Slot am Gate noch nicht da, gibt der Leser dasselbe Objekt zurück, das er hält (zwei
   kleine Abrufe, kein zweiter Download der 25 Bilder). Die 60-s-Wiederverwendung gilt nur, solange seit dem letzten Blick kein
   neuer Slot sein Gate passiert hat — sonst verschluckte sie das Nachladen.
5. **Rückfall im Repo statt beim DWD:** Scheitert ein Slot hart am CDN (Frist, hängender Inhalt, §1.4), liest der Leser
   denselben Slot noch einmal mit raw.githubusercontent als erstem Weg. Den Repo-Tar nimmt er nur, wenn der Bild-Weg
   abgeschaltet ist (`?radarimg=0`) oder der Slot da, aber nicht als Bilder lesbar ist.
6. **Latch:** Er übergab an den DWD-Weg. Ohne diesen bleibt das Repo der Weg des RV-Produkts; solange der Latch zu ist, liest
   RV raw zuerst (jsDelivr ist dann nur der Ausweichweg). Für INCA, rzc und KONRAD gilt der Latch unverändert.
7. **Rückblick:** ein Slot ist sein Analyse-Bild im Repo oder er fehlt in der Reihe; kein Tar, kein Listing.
8. **Frühstart:** wärmt den Slot, den der Leser nehmen wird (vor dem Gate also den Slot davor), nie eine DWD-Adresse.
   Nebenbei: nicht abgeholte Frühstart-Antworten werden nach 5 min vergessen (vorher blieben sie in der Tabelle).

Mit `rvdwd=1` läuft an jeder dieser Stellen der alte Code.

## §4 Was sich für Besucher ändert

- Geöffnet 198–270 s nach einem Slot (24 % der Zeit): das erste Bild ist der Slot davor, 5 min älter als bisher; der neue
  folgt bei Gate + 10 s. Gemessen (§5.2): mit DWD-Weg stand Slot 18:30 um 18:33:37 auf der Karte, ohne ihn um 18:34:42.
- Ist der Spiegel für einen Slot spät (19 % der Slots), bleibt das ältere Bild, bis der Spiegel ihn hat (Versuche bei
  Gate + 10 s, + 80 s und + 150 s, danach der 5-min-Takt); bisher kam in diesem Fall der Tar vom DWD.
- Dasselbe gilt für alles, was denselben Leser nutzt: den Radar-Anteil von buscosun Fusion in den ersten zwei Stunden
  (`pointForecast/radarNowcast.ts`) und den Radar-Stapel des Regenradars (`radar/radarFrames.ts`) mit allem, was aus ihm
  abgeleitet wird. Sie rechnen im Fenster vor dem Gate mit dem Lauf davor. Am Motor von buscosun Fusion ist nichts geändert, nur sein Radar-Eingang ist dann bis zu 5 min älter.
- Jeder Sekunde, die der Spiegel früher pusht, folgt jetzt die Karte (E-ND-3 bekommt damit mehr Gewicht, V-RN-4).
- Dafür: kein 840-KB-Tar mehr bei jedem vierten Aufruf, kein Abruf über Netlify, und die Bilder tragen immer die Log-Ebene
  und den Störecho-Filter (der Tar-Weg hatte beides nicht).

## §5 Gate

### 5.1 Prüfer (18.11., gegen den Stand an HEAD vor der Änderung)

| Prüfer | vorher | nachher | Anmerkung |
|---|---|---|---|
| `npm run typecheck` | grün | grün | |
| `verify:radar-fallback` | 48/48 | **67/67** | neuer Block R (R0–R9), B3 hinter `rvdwd=1` |
| `verify:routing` | 280/280 | 281/281 | Frühstart vor dem Gate: Slot davor aus dem Repo; alter Weg mit Schalter |
| `verify:radar-runs` | 53/54 | 54/55 | rot bleibt „Listing > 100 KB" (Live-Größe 79 808 B, schon vorher) |
| `verify:np0-radar` | 40/40 | 40/40 | |
| `verify:layer-erstbild` | 35/38 | 35/38 | dieselben drei (B, 2 × F), schon vorher |
| `verify:radar-repack` | 50/51 | 50/51 | unverändert |
| `verify:share` | 516/517 (E-DK-8) | 516/517 | rot bleibt SH6 (Edge-Bündel); `rvdwd` in der Sperrliste kommt mit demselben `npm run edge:share` |
| `npm run build` | — | grün | |
| `npm run budget` | rot: totalJs 2003,5 KB > 1991 KB; eagerJs 114,7 KB | rot: totalJs **2004,4 KB**; eagerJs **114,9 KB** (Grenze 115) | „vorher" = derselbe Arbeitsbaum mit den fünf `src`-Dateien dieser Phase auf HEAD-Stand (die uncommittete Wassertemperatur-Linie ist in beiden Zahlen). Anteil RN: totalJs +0,9 KB, eagerJs +0,2 KB. Die Ratsche war schon rot (V-HB-1, §73.4); **eagerJs hat noch 0,1 KB Luft** |

Block R prüft mit gestelltem `fetch` und echtem App-Code: R0 Gegenprobe des Musters (die DWD-Adresse liegt unter dem geprüften
Präfix) und Schalter; R1 Kandidaten; R2 vor dem Gate der Slot davor, 0 DWD, der junge Slot wird nicht gefragt; R3 Nachladen am
Gate; R4 Spiegel spät ⇒ dasselbe Objekt, zwei Abrufe; R5 Spiegel steht ⇒ `RvNotInRepo` nach sechs Slots, kein Listing; R6 Latch
zu ⇒ raw zuerst; R7 Rückblick ohne Tar; R8 mit `rvdwd=1` Tar und Listing beim DWD wie früher (die Negativkontrolle zu „0
Abrufe"); R9 Inhalt hängt am CDN ⇒ derselbe Slot über raw.

### 5.2 Seite im Headless-Browser (`rn-page.mjs`, Dev-Server, `/wetterkarte/niederschlag/muenchen`, Desktop 1440 × 900)

Zwei frische Browser-Kontexte, geöffnet im Fenster vor dem Gate, 115 s offen. Lauf 1 (`page-run1.txt`):

| | geöffnet | RV-Abrufe beim DWD | RV aus dem Repo | Konsole |
|---|---|---|---|---|
| Voreinstellung | 18:33:24 UTC, Slot 18:30 ist 203 s alt | **0** | Slot 18:25: 27 Abrufe (jsDelivr, alle 200); Slot 18:30 ab 18:34:40: 26 Abrufe (raw, alle 200) | 18:33:45 „Slot 2611181825 … Quelle Daten-Repo (PNG)", 18:34:42 „Slot 2611181830 … Quelle Daten-Repo (PNG)", 0 Fehler |
| Gegenprobe `?rvdwd=1` | 18:33:26 UTC | **1** (`composite_rv_20261118_1830.tar`, 6 328 656 B über den Dev-Proxy) | 0 | 18:33:37 „… Quelle DWD (Netlify)", 0 Fehler |

Lauf 2 mit dem endgültigen Code (nach Baustein 5, `page-run2.txt`): geöffnet 18:38:24 UTC (Slot 18:35 ist 204 s alt).
Voreinstellung: **0** RV-Abrufe beim DWD, Slot 18:30 vom CDN (27 Abrufe, alle 200), Slot 18:35 ab 18:39:40 über raw (26, alle
200), Konsole 18:38:42 und 18:39:42 „Quelle Daten-Repo (PNG)", 0 Fehler. Gegenprobe `?rvdwd=1`: **1** Abruf
(`composite_rv_20261118_1835.tar`, 6 256 976 B), Konsole 18:38:33 „Quelle DWD (Netlify)". Der neue Slot stand ohne DWD-Weg
also 65 s (Lauf 1) bzw. 69 s (Lauf 2) später auf der Karte als mit ihm.

Die Bytes des Tars sind die des Dev-Proxys (unkomprimiert); in Produktion waren es über Netlify 840 KB (ND §1.2).

### 5.3 Leser gegen das echte Repo (Node, `rn-live.mjs`, `live.txt`)

18:28:20 UTC, Slot 18:25 ist 201 s alt: Kandidaten 18:20, 18:15, 18:10; gelesen wurde 18:15 (nicht 18:20 — der Vorfall aus
§1.4, noch ohne Baustein 5), 29 Abrufe, 0 beim DWD. Nachlade-Termin 56,6 s; danach Slot 18:25 über raw (26 Abrufe, 5,2 s),
kein weiterer Termin. Summe 55 Abrufe, **0 beim DWD**.

### 5.4 Regenradar und Dashboard (Jans Nachfrage 18.11., `rn-pages-dwd.mjs`, `pages-dwd.txt`)

Beide Seiten für München, geöffnet 19:28:24 UTC (Slot 19:25 ist 204 s alt), 150 s offen; mitgeschnitten ist JEDER Abruf an
den DWD (`/_dwd_*`-Rewrites und `*.dwd.de`).

| Seite | RV-Komposit beim DWD | Radar aus dem Daten-Repo | Sonst beim DWD |
|---|---|---|---|
| `/regenradar/muenchen` | **0** (Konsole: Slot 19:20, dann 19:25, beide „Quelle Daten-Repo (PNG)") | 215 Dateien (rv 131, inca 46, rzc 32, konrad3d 4, inca-5m 2) | **KONRAD3D 4 Abrufe, 178 KB** (zweimal Listing + XML über `/_dwd_opendata/weather/radar/konrad3d/`, 19:28:40); Blitze 7 Abrufe an `maps.dwd.de` (WMS); ICON-D2 `tot_prec` 1 Listing + 2 GRIB (4,3 MB über `/_dwd_grib`) |
| `/wetterkarte/muenchen?ansicht=dashboard` | **0** | 21 Dateien (rv 7, inca 9, rzc 5) | **nichts** (0 Abrufe an den DWD) |

Im Code führen alle RV-Leser beider Seiten durch dieselben drei Funktionen (`fetchRvNowcast`, `fetchRvAnalysisSequence`,
`fetchRvLatestAnalysis`); das Dashboard liest seinen Radar-Verlauf über den Punkt-Leser (`readNowcastPoint`) und das Bild der
Mini-Karte über `fetchRvLatestAnalysis` — beide kannten nie einen DWD-Weg.

Der KONRAD3D-Abruf im Regenradar ist kein Komposit, aber ein DWD-Radarprodukt auf direktem Weg. Warum der Repo-Weg in diesem
Lauf nicht trug, ist **nicht geklärt** (der Lauf lag außerhalb des Frische-Fensters, die Dateien des Slots lagen im Repo). Eine
Minute später antwortete jsDelivr für die `cells.json` des Folge-Slots 403, raw 200 — der KONRAD-Leser hat keinen Ausweichweg
über raw und zählt einen Netzfehler als Grund für den DWD-Weg (V-RN-5).

### 5.5 Die fünf Fragen

1. **Funktionserhalt:** Karte, Regenradar, Streifen, Punktvorhersage und Rückblick lesen RV über dieselben Funktionen
   (`fetchRvNowcast`, `fetchRvAnalysisSequence`, `fetchRvLatestAnalysis`). Der alte Weg ist nicht gelöscht, sondern hinter
   `rvdwd=1`. Weggefallen ohne Schalter: Rückblick-Slots, die im Repo fehlen — der Rückblick fragt 9 Slots (45 min), das Repo
   hält 24; und das frische DWD-Bild bei Spiegel-Ausfall (E-RN-2).
2. **Desktop pixelgleich:** keine Änderung an Markup, CSS oder Zeichenweg. Ein Pixelvergleich wurde nicht gemacht.
3. **Touch-Ziele:** keine neue Bedienfläche.
4. **Konsole:** 0 Fehler in beiden Headless-Läufen (§5.2).
5. **Long Tasks:** nicht gemessen. Neu auf dem Hauptthread ist nur ein Timer; das Nachladen ist dieselbe Arbeit wie ein
   5-min-Refresh, höchstens dreimal je Slot.

Nicht geprüft: Real-Device, Produktion (die Messung lief am Dev-Server gegen das echte Daten-Repo), mobile Leitung.

## §6 Befunde

- **V-RN-1 — raw.githubusercontent hält ein 404 ≈ 60 s (§1.3).** Der CH-Leser fragt seit Phase RL einen jungen rzc-Slot vor
  dessen Gate auf raw an (`loadRzcMirrorSlot`). Ein Fehlgriff versteckt den Slot an diesem Edge eine Minute lang. Mehrwert:
  CH-Bild bis zu einer Minute früher für die Besucher danach. Skizze: die Sonde nur in einem Abstand vor dem Gate erlauben,
  der die 60 s deckt, oder weglassen und wie hier nachladen.
- **V-RN-2 — der Ausweichweg deckt keinen hängenden Inhalt (§1.4).** `fetchImgRes` startet raw nur, solange keine Kopfzeilen
  da sind. Mehrwert: 2,5 s statt 8 s + zweiter Durchgang. Skizze: Fortschrittsuhr je Datei auch nach den Kopfzeilen.
- **V-RN-3 — kein Altershinweis für RV.** Steht der Spiegel, zeichnet die Karte bis ≈ 30 min alte Läufe ohne Vermerk (INCA
  nennt sein Alter über `staleFromMs`). Mehrwert: ehrliche Anzeige. Skizze: Statuszeile „DE Radar, Lauf vor n min" ab 15 min;
  dazu eine Regel in `health-watch.yml` auf das Alter des jüngsten RV-Slots.
- **V-RN-4 — E-ND-3 wird wichtiger.** Das Gate (270 s) liegt 36 s über dem Push-Median und unter p90. Jede Sekunde, die der
  Spiegel gewinnt, gewinnt jetzt die Karte; ein Gate näher am Push hilft nur, wenn der Spiegel pünktlicher wird.
- **V-RN-5 — die anderen direkten Radarwege.** AT: Laufstempel bei jedem Laden von GeoSphere, NetCDF als Rückfall. CH:
  STAC-Item und HDF5 als Rückfall. KONRAD3D: Listing + XML ≈ 45 s je 5 min. Dieselbe Behandlung wäre möglich; AT braucht dafür
  einen Laufzeiger im Repo.
- **V-RN-6 — Doku.** `docs/API.md` und `docs/DATA_SOURCES.md` beschreiben den DWD-Weg des Clients noch als Rückfall. Beide
  Dateien tragen gerade uncommittete Änderungen einer anderen Linie und wurden deshalb nicht angefasst.
- **V-RN-8 — ICON-D2-Layer fallen bei EINER langsamen CDN-Antwort für die ganze Sitzung auf den DWD (Jans Nachfrage 18.11.).**
  Der Niederschlag ab +2 h kommt im Normalfall als Bilder aus dem Daten-Repo (`fetchPrecipRepack`; Lauf 18 UTC stand seit
  19:07 UTC im Index). Scheitert dort irgendein Abruf oder reißt eine Frist (`FIRST_TIMEOUT_MS` 3 s, `STEP_TIMEOUT_MS` 6 s),
  setzt `markBroken` den Weg für die Sitzung aus und ALLE Repack-Layer laden GRIB über `/_dwd_grib` — ohne Ablauf, ohne
  Ausweichweg über raw (anders als der Radar-Leser seit NL/ND). Gemessen 19:38 UTC (`rn-pages-icond2.mjs`,
  `pages-icond2.txt`): Regenradar und Wetterkarte beide „[repack] CDN nicht nutzbar (Frist abgelaufen) → GRIB für diese
  Sitzung", danach `tot_prec` 001 + 002 als GRIB (4,3 MB). Direkt nachgemessen (curl, dieselbe Minute, 8 Abrufe): jsDelivr
  `index.json` TTFB 7,4 s und 4,2 s, `runs/2026111818/index.json` 24,0 s, sonst 0,1–0,5 s; raw.githubusercontent 0,3 s.
  Eine Maschine, ein Abend — wie oft das in Produktion vorkommt, ist nicht gemessen. Mehrwert: 4 MB GRIB und Sekunden
  Dekodieren weniger je betroffener Sitzung. Skizze: raw als Ausweichweg nach der Frist (Muster `fetchImgRes`), `broken` mit
  Ablauf (Muster ND-5); danach entscheiden, ob der DWD-Weg hier ebenfalls hinter einen Schalter soll. Layer-Transport ist
  Jans Gate.
- **V-RN-7 — `verify:layer-erstbild`** prüft in zwei F-Zeilen eine Signatur (`fmt`), die es seit E-HDR-7 nicht mehr gibt.

## §8 RN-2: der ICON-D2-Niederschlag nur noch aus dem Daten-Repo (Jans Auftrag 18.11., zweiter Teil)

> „mache die Daten auch nur noch aus dem Daten-Repo, sodass nicht mehr der DWD-Weg genommen wird. Wenn es scheitert, versuch
> es nochmal. Warum war es gescheitert?"

### 8.1 Warum es gescheitert war

Der Niederschlag ab +2 h (ICON-D2, `tot_prec`) liegt als fertige Bilder im Daten-Repo; der Lauf 18 UTC stand seit 19:07 UTC im
Index. Der Client fragt dafür drei Dinge bei jsDelivr: den Index (`index.json`, 116 KB), bei Bedarf den Zeiger des Laufs
(`runs/<Lauf>/index.json`) und die Bilder. Jede dieser Anfragen hatte **eine** Frist und **keinen** zweiten Versuch:

| Was | Frist | Wenn sie reißt (vor RN-2) |
|---|---|---|
| Index, Zeiger | 3 s | „kein Lauf" bzw. „kein Abschnitt" ⇒ Lauf aus dem DWD-Verzeichnis (`/_dwd_opendata/…/tot_prec/`), Felder als GRIB (`/_dwd_grib`); der Fehlschlag bleibt 60 s im Speicher |
| erstes Bild der Sitzung | 3 s | `markBroken` ⇒ **alle** Repack-Layer laden GRIB, bis die Seite neu geladen wird |
| jedes weitere Bild | 6 s bis zu den Kopfzeilen | dasselbe |

Gemessen 18.11. 19:38 UTC (curl, acht Abrufe in einer Minute): jsDelivr brauchte für `index.json` 7,4 s und 4,2 s und für den
Zeiger 24,0 s bis zur ersten Antwort, sonst 0,1–0,5 s; raw.githubusercontent 0,3 s. Im Seitentest (`pages-icond2.txt`):
Regenradar — Index und Zeiger beide abgebrochen (Frist), danach Listing + zwei GRIB-Dateien; Wetterkarte — ein Bild über der
Frist, Konsole „[repack] CDN nicht nutzbar (Frist abgelaufen) → GRIB für diese Sitzung". Es lag also nicht an fehlenden Daten,
sondern an einem CDN, das einzelne Antworten um Sekunden verzögert, und an einem Client, der darauf mit dem DWD antwortete.
Eine Maschine, ein Abend — wie oft das in Produktion vorkommt, ist nicht gemessen.

### 8.2 Entscheidung

- **E-RN-5 (Jan, 18.11.2026): der ICON-D2-Niederschlag nur aus dem Daten-Repo; bei einem Fehlschlag noch einmal versuchen.**
  Umgesetzt, für alle an (Ausnahme von Rule 2 auf Jans Wort); der alte Weg bleibt hinter `?precipdwd=1`.

### 8.3 Umsetzung

1. **Zweiter Host für jede Datei des Repack-Wegs** (`repackSource.ts`, alle Familien): scheitert jsDelivr (Frist, Netz, 403/5xx;
   ein Bild auch bei 404), fragt der Client dieselbe Datei **einmal** auf raw.githubusercontent (`repackRawUrl`: gleiche Ref,
   gleicher Pfad). Ein 404 des Index oder Zeigers bleibt „nicht da" (dafür gibt es die Kette Zeiger → Index). Schalter
   `?repackraw=0`.
2. **Die Sperre läuft ab** (alle Familien): „kaputt" ist erst, was beide Hosts sagen, und gilt `REPACK_BROKEN_MS` = 5 min
   (gesetzt, wie der Radar-Latch seit ND-5) statt bis zum Neuladen. Die Konsolenzeile nennt beide Gründe.
3. **Niederschlag ohne DWD** (`iconD2Precip.ts`): der Lauf kommt allein aus dem Index des Repos (kein Manifest, kein
   Verzeichnis-Listing), die Bilder aus dem Repo, nie GRIB. Bleibt ein Ladevorgang ohne Ergebnis, wiederholt ihn der Leser:
   `PRECIP_REPO_TRIES` = 3 Versuche mit 3 s und 8 s Pause (gesetzt); vor jedem öffnet `retryRepackNow` die Sperre und vergisst
   gescheiterte Index-Antworten. Danach der benannte Fehler `IconD2NotInRepo`.
4. **Die Karte fragt später noch einmal** (`MapView.installIconD2`): nach `IconD2NotInRepo` in 60 s wieder, höchstens dreimal je
   Aufruf der Seite. Vorher gab es das nicht, weil GRIB einsprang; der 30-min-Refresh erneuert nur eine Vorhersage, die schon da ist.
5. **Schalter:** `?precipdwd=1` / `localStorage.precipdwd = '1'` = Kette wie vorher. `?repack=0`, `?repackidx=0`, `?repackrun=0`
   nehmen den Index-Weg weg und heißen deshalb weiter „alte Kette". `precipdwd` und `repackraw` stehen in der Sperrliste der
   teilbaren Schlüssel.

### 8.4 Was sich ändert

- Kein Listing und kein GRIB mehr für den Niederschlag (je betroffener Sitzung 4 MB im Jetzt-Fenster, bis 27 Dateien im vollen
  Horizont). Die anderen Repack-Layer (Temperatur, Böen, Wind, Gewitter, Rotation, Blitzprognose, Schnee, CAPE) behalten GRIB als
  Rückfall, erreichen ihn aber erst, wenn beide Hosts versagen, und kehren nach 5 min zum Repo zurück.
- **Preis:** Der Lauf ist der neueste, den das Repo gepackt hat. Solange der Producer einen neuen DWD-Lauf noch nicht gepackt
  hat, bleibt die Karte beim Lauf davor (das galt über den Index-Weg schon bisher). Und: sind jsDelivr UND raw nicht
  erreichbar, gibt es keine Niederschlagsvorhersage hinter dem Radar, bis ein späterer Versuch gelingt — die Karte sagt das
  heute nicht eigens (V-RN-9).
- Layer ohne Repack-Familie holen weiter GRIB beim DWD: Wolken (`clcl/clcm/clch/clct`), relative Feuchte, Bodenfeuchte,
  ICON-D2-EPS, ICON-EU, ICON global, AICON (V-RN-10).

### 8.5 Gate (18.11.)

| Prüfer | vorher | nachher | Anmerkung |
|---|---|---|---|
| `npm run typecheck` | grün | grün | |
| `verify:precip-repo` (neu) | — | **19/19** | echter Index als Fixture; P3 „beide Hosts tot" ⇒ 3 Versuche, `IconD2NotInRepo`, 0 DWD; Gegenprobe `precipdwd=1` ⇒ 12 Abrufe beim DWD |
| `verify:repack` | 345/347 | 345/347 | dieselben zwei wie vorher („isHashedAsset …", „M3: Prefetch …"). Erster Lauf nach dem Umbau 344/347: die Zeile „Client precip … fällt als GANZES auf GRIB zurück" suchte wörtlich `return null;`; nachgezogen auf `return no(` plus die Probe, dass GRIB nur noch hinter dem alten Zweig steht |
| `verify:routing` | 281/281 | 281/281 | |
| `verify:radar-fallback` | 67/67 | 67/67 | |
| `verify:radar-runs` · `verify:layer-erstbild` | 54/55 · 35/38 | 54/55 · 35/38 | dieselben Punkte wie vorher |
| `verify:share` | 516/517 | 516/517 | SH6 (Edge-Bündel) wie vorher; `precipdwd`, `repackraw` kommen mit `npm run edge:share` |
| `npm run build` | grün | grün | |
| `npm run budget` | — | **rot: totalJs 2011,7 KB > 2010 KB**; eagerJs 114,9 KB (Grenze 115) | Der Arbeitsbaum ist geteilt: seit RN-1 wurde die Wassertemperatur-Linie committet (`e8bbf125`) und eine weitere Seewetter-Linie hat die Grenze uncommittet von 2004 auf 2010 gehoben. Anteil dieser Phase, GESCHÄTZT (die vier geänderten Module einzeln minifiziert und gezippt, HEAD gegen jetzt): RN-1 +0,7 KB (`radolan`, `radolanRuns`; im Bau gemessen +0,9 KB), RN-2 +1,4 KB (`repackSource` +0,54, `iconD2Precip` +0,83). Ohne diese Phase läge der Baum bei ≈ 2009,4 KB. `budget.json` nicht angefasst (fremde, laufende Änderung) — für grün braucht es 2013 KB mit Notiz |

Seite im Headless-Browser (`rn-precip-repo.mjs`, Dev-Server, `/wetterkarte/niederschlag/muenchen`, je Fall ein frischer
Kontext, nacheinander; `precip-repo-ab.txt`, `precip-repo-cd.txt`):

| Fall | `tot_prec` beim DWD | Niederschlagsbilder | Index / Zeiger | Konsole |
|---|---|---|---|---|
| A Voreinstellung, beide Hosts erreichbar | **0** | 1 von jsDelivr (200) | 1 jsDelivr (200) | — |
| B Voreinstellung, jsDelivr gesperrt | **0** | 1 über raw (200) | jsDelivr 2 × gescheitert, raw 1 × 200 | — |
| C Gegenprobe `?precipdwd=1`, beide gesperrt | **3** (Listing 20:06:44, dann GRIB) | 0 | 5 gescheitert | — |
| D Voreinstellung, beide gesperrt (130 s) | **0** | 0 | 15 gescheitert, in Runden 20:07:54 · 20:08:27 · 20:08:35 · 20:09:35 · 20:09:38 · 20:09:46 | „Versuch 1/3 …", „Versuch 2/3 …", nach 60 s dieselbe Folge noch einmal; 0 Fehler |

Im Jetzt-Fenster lädt die Karte ein Bild (der erste Schritt ist nur die Referenz). Der Headless-Browser rendert in Software
und ist langsam: die Vorhersage startet dort ≈ 30–40 s nach dem Öffnen, deshalb die langen Standzeiten.

Die fünf Fragen: 1 Funktionserhalt — der alte Weg liegt hinter `precipdwd=1`, alle Layer laden wie zuvor, GRIB-Rückfall der
anderen Familien bleibt; weggefallen ist der GRIB-Niederschlag bei Ausfall beider Hosts. 2 Desktop pixelgleich — keine
Änderung an Markup, CSS oder Zeichenweg; kein Pixelvergleich. 3 Touch-Ziele — keine neue Bedienfläche. 4 Konsole — 0 Fehler in
allen sechs Kontexten; neu sind Info-Zeilen bei einem Fehlschlag. 5 Long Tasks — nicht gemessen; weniger Arbeit als GRIB.
Nicht geprüft: Produktion, Real-Device, mobile Leitung.

### 8.6 Befunde

- **V-RN-9 — die Karte sagt nicht, wenn die Vorhersage hinter dem Radar fehlt.** `installIconD2` verschluckt den Fehler („nicht
  fatal"). Mehrwert: ehrliche Statuszeile. Skizze: „Vorhersage ab +2 h derzeit nicht geladen" im Komposit-Status, gelöscht
  beim nächsten guten Laden (Muster ND-6).
- **V-RN-10 — was sonst noch GRIB beim DWD holt.** Ohne Repack-Familie: Wolken, relative Feuchte, Bodenfeuchte, EPS, ICON-EU,
  ICON global, AICON. Mit Familie, aber mit GRIB als Rückfall: Temperatur, Böen, Wind, Gewitter, Rotation, Blitzprognose,
  Schnee, CAPE. Mehrwert: „alles von GitHub". Skizze: für die zweite Gruppe derselbe Schalter wie beim Niederschlag (ein
  Eingriff je Leser); die erste braucht erst Familien im Producer (Daten-Repo, Jans Gate).
- **V-RN-11 — der Körper eines Bilds darf 30 s hängen** (`BODY_TIMEOUT_MS`), bevor der zweite Host gefragt wird; jsDelivr
  hing am 18.11. genau so (§1.4). Skizze: Fortschrittsuhr statt fester Körper-Frist, wie beim Radar (D-PF-13).

## §9 RN-3: die übrigen ICON-D2-Layer mit Bildern im Repo nur noch aus dem Daten-Repo (Jan 18.11.: „ja mache das")

### 9.1 Diagnose

Der Index des Daten-Repos (gelesen 18.11. 20:57 UTC, Commit `1e008026`, 4 Läufe) führt je Lauf zehn Familien, jede mit genau
dem Horizont, den der Client lädt: `wind` 0–12, `temp` 0–24 (+ `hsurf-v1.png`), `gust` 0–24, `thunder` 0–12, `rotation` 1–12,
`lightningfc` 1–12, `snowDepth` 0–24, `snowFresh` 1–24, `precip` 0–27, `cape` 0–27. Für diese Layer fehlt im Repo nichts.

Wo der Client trotzdem zum DWD ging (Stand nach RN-2):

| # | Leser | Weg zum DWD | Wann |
|---|---|---|---|
| 1 | Temperatur, Böen, Gewitter, Rotation, Blitzprognose, Schnee (`iconD2*.ts`) | Lauf: `resolveLatestRun` fällt vom Index auf `/latest-grib.json` und dann auf das Verzeichnis-Listing (`/_dwd_opendata/…/icon-d2/grib/<HH>/<param>/`) | Index auf beiden Hosts nicht lesbar |
| 2 | dieselben | ohne Abschnitt: ein GRIB für die Geometrie, dann je Schritt 1–3 GRIB über `/_dwd_grib` (Gewitter, Rotation, Neuschnee: drei Felder je Schritt) | kein Abschnitt, oder Sperre zu (`markBroken`, 5 min) |
| 3 | dieselben | je Schritt GRIB statt Bild | ein Bild auf beiden Hosts gescheitert ⇒ alle weiteren Schritte dieser und jeder anderen Familie für 5 min |
| 4 | Temperatur | `hsurf` als GRIB (647 KB) | Orographie-Bild nicht ladbar |
| 5 | Wind (`iconD2WindSource.ts`) | „Notweg": drei Schritte auf Verdacht (u + v, `/_dwd_wind`), Listing `u_10m`, dann GRIB je Schritt | Index nicht lesbar, Lauf deckt „jetzt" nicht mehr, oder der nahe Horizont lieferte kein Bild |
| 6 | Dashboard-Kasten „ICON-D2" (`extras.ts` `familyAtPoint`) | nur der Lauf über `resolveLatestRun` (Listing); die Werte kommen ohnehin nur aus Bildern | Index nicht lesbar |
| 7 | 30-min-Auffrischung der Karte (`refreshIconD2Layers`) | `resolveLatestRun('t_2m', …, 'temp')` vorab | Index nicht lesbar |

Nicht Gegenstand, weil ohne Bilder im Repo (bleibt DWD, V-RN-10): Wolken, relative Feuchte, Bodenfeuchte, EPS, ICON-EU, ICON
global, AICON — und der Lauf-zu-Lauf-Unterschied der Temperatur für den Layer „Sicherheit" (`fetchTempRunSpread`: je Stützstelle
zwei GRIB, jüngster und voriger Lauf; nur wenn „Sicherheit" im Temperatur-Modus an ist). `iconD2Cape.ts` (CAPE am Punkt) hat
im Code keinen Aufrufer mehr und liegt in keinem Chunk; die Datei bleibt unverändert (zwei Prüfer lesen sie als Text).

Die Karte lädt jeden dieser Layer beim Einschalten und alle 30 min neu; scheitert das Laden, steht im Layer-Status
„… nicht erreichbar" und nichts fragt vor der nächsten halben Stunde wieder (anders als beim Niederschlag seit RN-2).

### 9.2 Entscheidung

- **E-RN-6 (Jan, 18.11.2026): auch die übrigen ICON-D2-Layer mit Bildern im Repo nur aus dem Daten-Repo.** Für alle an
  (Ausnahme von Rule 2 auf Jans Wort); der alte Weg bleibt hinter `?d2dwd=1`.

### 9.3 Umsetzung

1. **Ein gemeinsames Modul** `src/sources/iconD2Repo.ts` (lazy): Schalter (`dwdDirect`, `d2DwdDirect`), der benannte Fehler
   `IconD2NotInRepo` (eine Klasse für alle Leser, auch den Niederschlag), `resolveRepoRun` (Lauf und Abschnitt allein aus dem
   Index des Repos, drei Versuche mit 3 s und 8 s Pause, vor jedem öffnet `retryRepackNow` die Sperre) und `pumpSteps` (lädt
   die Schritte; was kein Bild brachte, wird in bis zu drei Runden noch einmal gefragt). Alle Zahlen gesetzt, wie bei RN-2.
2. **Sieben Leser umgestellt** (`iconD2GustSource`, `iconD2Thunder`, `iconD2Rotation`, `iconD2Lpi`, `iconD2Snow`,
   `iconD2TempSource`, `wind/iconD2WindSource`): in der Voreinstellung kommt der Lauf aus `resolveRepoRun`, jedes Bild aus dem
   Repo; der GRIB-Zweig steht unverändert dahinter und wird nur mit `?d2dwd=1` erreicht. Bleibt kein einziges Bild, wirft der
   Leser `IconD2NotInRepo`; fehlen nach drei Runden einzelne Schritte, zeichnet der Layer die vorhandenen (wie bisher bei
   einem fehlenden GRIB-Schritt) und die Konsole nennt die Zahl.
3. **Temperatur:** die Orographie (`hsurf-v1.png`) wird bis zu dreimal gefragt; ohne sie gibt es keinen Layer
   (`IconD2NotInRepo`), statt `hsurf` als GRIB zu holen oder 25 Schritte ohne Höhenkorrektur zu zeichnen.
4. **Wind:** kein spekulativer GRIB-Abruf, kein Listing, kein „Notweg". Deckt der Lauf im Index „jetzt" nicht mehr (Spiegel
   steht > 9 h), ist das ein benannter Fehler ohne Wiederholung.
5. **`resolveLatestRun` fragt für eine Familie nie den DWD,** solange ihr Leser auf „nur Daten-Repo" steht — das deckt den
   Dashboard-Kasten „ICON-D2" und die 30-min-Auffrischung. Ohne Familie (Wolken, Feuchte …) bleibt alles wie es war.
6. **Die Karte fragt später noch einmal** (`MapView`, `retryNotInRepo`): nach `IconD2NotInRepo` in 60 s wieder, höchstens
   dreimal je Layer und Seitenaufruf — jetzt für Wind, Temperatur, Böen, Gewitter, Blitzprognose, Schnee, Rotation und (wie
   seit RN-2) den Niederschlag.
7. **Schalter:** `?d2dwd=1` / `localStorage.d2dwd = '1'` = Kette wie vorher für diese sieben Layer; der Niederschlag behält
   `?precipdwd=1`. `?repack=0`, `?repackidx=0`, `?repackrun=0` heißen weiter „alte Kette". `d2dwd` steht in der Sperrliste der
   teilbaren Schlüssel.

### 9.4 Was sich ändert

- Für diese sieben Layer gibt es in der Voreinstellung keinen Abruf mehr über `/_dwd_grib`, `/_dwd_wind` oder
  `/_dwd_opendata`. Ein gescheitertes Bild kostet eine Pause (3 s, dann 8 s) statt 1–3 GRIB-Dateien.
- **Preis:** (a) Sind jsDelivr und raw.githubusercontent beide nicht erreichbar, hat der Layer keine Daten, bis ein späterer
  Versuch gelingt — der Layer-Status sagt „… nicht erreichbar". (b) Der Lauf ist der neueste, den das Repo gepackt hat (galt
  über den Index-Weg schon). (c) Steht der Repack länger als 24 h (Wind: sobald der Lauf „jetzt" nicht mehr deckt), gibt es
  den Layer nicht — einen Notweg zum DWD gibt es nicht mehr (E-RN-2 gilt jetzt für alle diese Layer).
- **Weiter beim DWD** (keine Bilder im Repo): Wolken, relative Feuchte, Bodenfeuchte, EPS, ICON-EU, ICON global, AICON, der
  Lauf-zu-Lauf-Unterschied für „Sicherheit" im Temperatur-Modus (V-RN-16).

### 9.5 Gate (18.11.)

| Prüfer | Ergebnis | Anmerkung |
|---|---|---|
| `npm run typecheck` | grün | |
| `verify:repo-only` (neu) | **63/63** | echter Index als Fixture. Je Layer: Normalfall, jsDelivr tot ⇒ raw, beide tot ⇒ 3 Versuche + `IconD2NotInRepo` + 0 DWD, je eine Gegenprobe mit `?d2dwd=1` (DWD-Abrufe da). Dazu: ein Bild scheitert auf beiden Hosts ⇒ nach 3,0 s noch einmal, dann vollständig; Orographie; Wind-Lauf zu alt; `resolveLatestRun` |
| `verify:precip-repo` | 19/19 | unverändert nach dem Umzug von Schalter und Fehlerklasse |
| `verify:repack` | 345/347 | dieselben zwei wie vorher („isHashedAsset …", „M3: Prefetch …") |
| `verify:radar-fallback` · `verify:routing` | 67/67 · 281/281 | |
| `verify:radar-runs` · `verify:layer-erstbild` | 54/55 · 35/38 | dieselben Punkte wie vorher |
| `verify:share` | 516/517 | SH6 (Edge-Bündel) wie vorher; `d2dwd`, `konraddwd` kommen mit `npm run edge:share` |
| `npm run build` · `npm run budget` | grün · grün (totalJs 2023,2 / 2024 KB, eagerJs 114,9 / 115) | Grenze von Hand gehoben: 2010 → 2015 für RN bis RN-4 (Anteil geschätzt +5,3 KB, Module einzeln minifiziert, HEAD gegen jetzt; RN-3 + RN-4 davon ≈ 3,1 KB); die Seewetter-Linie SR hat danach +9 auf 2024 gesetzt. Beide Notizen stehen in `budget.json` |

Seite im Headless-Browser gegen den **fertigen Build** (`vite preview`, `/wetterkarte/temperatur/muenchen` mit allen Layern
über `l=`, je Fall ein frischer Kontext; `rn-layers-repo.mjs`; `layers-repo-ab.txt`, `layers-repo-cd.txt`,
`layers-repo-d-times.txt`, `layers-repo-a-temp-precip.txt`):

| Fall | Abrufe dieser Produkte beim DWD | Bilder aus dem Repo | Konsole |
|---|---|---|---|
| A beide Hosts erreichbar | **0** | Wind 2, Böen 2, Gewitter 2, Blitzprognose 2, Schnee 4, Rotation 2 — alle jsDelivr 200; Temperatur 3 (Orographie + 2) und Niederschlag 1 im Einzellauf | 0 Fehler |
| B jsDelivr gesperrt | **0** | je Layer dieselben Dateien über raw (200), davor je ein gescheiterter Abruf am CDN; Index über raw | 0 Fehler |
| C Gegenprobe `?d2dwd=1&konraddwd=1&precipdwd=1`, beide gesperrt | **49** (Wind 6, Temperatur 5, Böen 5, Gewitter 8, Blitzprognose 4, Schnee 8, Rotation 8, Niederschlag 3, KONRAD 2) | 0 | 0 Fehler |
| D beide gesperrt (150 s) | **0** | 0 | je Layer „Versuch 1/3", „Versuch 2/3" bei 0 s und +4 s, dann 73 s später dieselbe Folge noch einmal, und noch einmal; 0 Fehler |

Der Dev-Server taugt für diesen Test nicht: dort lädt React jeden Effekt doppelt, und Böen, Gewitter, Blitzprognose und
Rotation werden dabei abgebrochen und nicht neu gestartet (V-RN-13) — deshalb der fertige Build. Im Lauf mit neun Layern kamen
Temperatur-Bilder und Niederschlag in 210 s nicht an die Reihe (Software-Grafik); im Einzellauf nach 120 s beide da.

Die fünf Fragen: 1 Funktionserhalt — jeder Layer lädt wie zuvor, der alte Weg liegt hinter `d2dwd=1`; weggefallen ist der
GRIB-Rückfall bei Ausfall beider Hosts. 2 Desktop pixelgleich — keine Änderung an Markup, CSS oder Zeichenweg; kein
Pixelvergleich. 3 Touch-Ziele — keine neue Bedienfläche. 4 Konsole — 0 Fehler in allen Kontexten; neu sind Info-Zeilen bei
einem Fehlschlag. 5 Long Tasks — nicht gemessen; ohne GRIB-Dekodieren weniger Arbeit. Nicht geprüft: Produktion, Real-Device,
mobile Leitung.

### 9.6 Befunde

- **V-RN-13 — im Dev-Server laden vier Layer aus einem Link nicht.** Böen, Gewitter, Blitzprognose und Rotation, die schon beim
  Öffnen aktiv sind (Pfad oder `l=`), bleiben im Dev-Server leer: StrictMode bricht den ersten Lader ab, der Wächter
  `lazyInFlightRef` verschluckt den zweiten. Im fertigen Build nicht. Bestand, nicht aus dieser Phase. Mehrwert: Links am
  Dev-Server prüfbar. Skizze: den Wächter im Cleanup leeren oder das Nachholen wie bei Wind/Temperatur.
- **V-RN-14 — Schnee lädt beim Öffnen aus einem Link doppelt** (Aktivierungs-Effekt und Modus-Effekt starten je einen Lader;
  der Seq-Wächter verwirft einen). Bestand. Skizze: der Modus-Effekt startet nur bei einem echten Wechsel.
- **V-RN-15 — der Layer-Status nennt das Nachfragen nicht.** Er sagt „… nicht erreichbar", nicht „neuer Versuch in 1 min"; und
  das Nachfragen läuft auch, wenn der Layer inzwischen abgewählt wurde (höchstens drei Ladevorgänge). Skizze: Statuswort
  ergänzen, vor dem Nachfragen den aktiven Satz prüfen.
- **V-RN-16 — was mit diesen Layern noch zum DWD geht.** „Sicherheit" im Temperatur-Modus (`fetchTempRunSpread`: GRIB des
  jüngsten und des vorigen Laufs). Skizze: den Unterschied aus den Temperatur-Bildern zweier Läufe rechnen (das Repo hält
  vier) — das ändert die Werte (8 bit) und braucht eine Messung. Dazu: `iconD2Cape.ts` hat keinen Aufrufer mehr; Löschen ist
  Jans Entscheidung.

## §10 RN-4: Zellbahnen (KONRAD3D) nur noch aus dem Daten-Repo (Jan 18.11.: „ja mache das")

### 10.1 Diagnose

Der Radar-Spiegel legt jede KONRAD3D-Datei als `radar/konrad3d/KONRAD3D_<Stempel>.xml` (≈ 255 KB) und als
`radar/img/v1/konrad3d/<Stempel>/cells.json` (10–30 KB, dieselbe Parser-Ausgabe) ab, 24 Slots = 2 h. Der Leser
(`src/sources/dwdKonrad3d.ts`, Verbraucher: Zellbahnen und Hagel DE auf der Wetterkarte, Zellbahnen im Regenradar,
Dashboard-Zeile „Zellen") ging in diesen Fällen zum DWD (Listing 79 KB + XML 0,6–0,8 MB über `/_dwd_opendata`):

| # | Fall | Wie oft |
|---|---|---|
| 1 | „Frische-Fenster": der DWD hat den Slot schon (Ablage ≈ 285 s), das Gate des Repo-Wegs (330 s) sperrt ihn noch | 45 von 300 s ⇒ ≈ 15 % der Abrufe |
| 2 | beide Kandidaten (jüngster und der davor) am CDN 404 | Spiegel hinkt, oder jsDelivr hält ein 404 fest |
| 3 | Netzfehler oder Frist (8 s) am CDN | je Vorfall; der Leser hat **keinen** zweiten Host (anders als die Radarbilder seit NL-2) |
| 4 | Radar-Latch zu (zwei harte CDN-Fehler in 5 min) | 5 min lang jeder Abruf |

Gemessen 18.11. (Commit-Zeiten des Spiegels über die GitHub-API, fünf Slots 20:30–20:50 UTC): die Datei eines Slots wird
303, 326, 311, 303 und 324 s nach der Slot-Zeit committet. Das Gate von 330 s liegt also 4–27 s hinter dem Commit, und
jsDelivr löst `@main` erst 31–90 s nach dem Push auf (ND §1.4) — bei 330 s antwortet das CDN für den jüngsten Slot meist 404,
und der Leser nahm still den Slot davor. Im Seitentest vom Abend (§5.4) antwortete jsDelivr für die `cells.json` 403, raw 200.

### 10.2 Entscheidung

- **E-RN-7 (Jan, 18.11.2026): KONRAD3D nur aus dem Daten-Repo.** Für alle an; der alte Weg bleibt hinter `?konraddwd=1`
  (`?radarcdn=0` heißt weiter DWD).

### 10.3 Umsetzung (`src/sources/dwdKonrad3d.ts`)

1. **Kandidaten:** der jüngste Slot, der sein Gate (330 s, unverändert) passiert hat, dann die zwei davor. Je Slot die
   `cells.json`; das XML desselben Stempels nur, wenn das JSON da, aber unlesbar ist (fremdes Schema) oder mit `?radarimg=0` —
   ebenfalls aus dem Repo.
2. **Zwei Hosts:** jeder Abruf läuft über `fetchImgRes` (der Leser der Radarbilder): raw.githubusercontent springt nach 2,5 s
   ohne Kopfzeilen ein, sofort bei 403/404/5xx/Netzfehler. Ein Slot jünger als 450 s (`KONRAD_CDN_READY_MS`, gesetzt: Commit
   ≤ 328 s + jsDelivr-Verzug ≤ 90 s + Reserve) liest raw **zuerst**; ebenso jeder Slot, solange der Radar-Latch zu ist.
3. **Wiederholung:** ein harter Fehler (beide Hosts, oder die 8-s-Frist) ⇒ derselbe Slot noch einmal, raw zuerst, dann der
   Slot davor; nach drei harten Fehlern der benannte Fehler `KonradNotInRepo`. „Nicht da" (404 auf beiden Hosts) ist eine
   Antwort: der Slot davor, ohne Fehlerzähler.
4. **Nichts vor dem Gate** (raw hält ein 404 ≈ 60 s, §1.3). Dafür sagt der Leser, wann nachzuladen ist
   (`konradFollowUpInMs`): hat der DWD schon einen neueren Slot als den geladenen, bei Gate + 20 s; war der Spiegel zu spät,
   noch einmal nach 70 s, bis 90 s hinter dem Gate. Die drei Verbraucher mit Dauerabruf setzen dafür einen Timer (Zellbahnen
   und Hagel DE in `MapView`, Zellbahnen in `NowcastRadarMap`).
5. **Zwischenspeicher:** der 60-s-Speicher des Laufs fragt zusätzlich, welcher Slot fällig ist — sonst bekäme das Nachladen
   den Lauf von eben zurück.
6. **Schalter:** `?konraddwd=1` / `localStorage.konraddwd = '1'` = der Weg wie vorher (CDN mit Frische-Fenster, dann Listing
   und XML beim DWD). In der Sperrliste der teilbaren Schlüssel.

### 10.4 Was sich ändert

- Kein Listing und kein XML mehr über `/_dwd_opendata/weather/radar/konrad3d/`. Ein Abruf sind 10–30 KB statt bis 0,8 MB.
- **Frische:** in 45 von 300 s (≈ 15 % der Abrufe) ist der erste Stand einen Slot (5 min) älter als über den DWD-Weg; die
  Karte lädt 20–65 s später den neuen nach. Außerhalb dieses Fensters ist der Stand gleich oder frischer als vorher, weil ein
  junger Slot jetzt über raw gelesen wird, statt am CDN in ein 404 zu laufen und still den Slot davor zu nehmen.
- **Preis:** steht der Spiegel länger als 10 min (drei Slots), gibt es keine Zellbahnen und keine DE-Hagelzellen — der Status
  sagt „konnten nicht geladen werden" (E-RN-2 gilt auch hier). Das Dashboard zeigt dann „nicht abrufbar".

### 10.5 Gate (18.11.)

`verify:repo-only` K0–K9 (im selben Lauf, 63/63): Normalfall alt und jung (raw zuerst), Frische-Fenster ohne DWD mit
Nachlade-Zeit, Spiegel hinkt, jsDelivr 403, jsDelivr hängt (Lauf nach 2,5 s über raw), beide Hosts tot (drei Fehlversuche,
`KonradNotInRepo`), nichts im Spiegel (Latch bleibt offen), fremdes JSON-Schema, `radarimg=0`, Zwischenspeicher — und zwei
Gegenproben mit `?konraddwd=1` (Listing beim DWD). `verify:radar-runs` 54/55 und `verify:layer-erstbild` 35/38 wie vorher.
`verify:cell-towers` 57/58: Zeile G10 vergleicht `dwdKonrad3d.ts` mit HEAD und wird mit dem Commit wieder grün.

Seite im Headless-Browser gegen den fertigen Build:

| Lauf | Ergebnis |
|---|---|
| Fälle A–D aus §9.5 | KONRAD beim DWD: A 0, B 0, D 0 (dort 3 × 2 gescheiterte Abrufe am Repo, dann Schluss); Gegenprobe C 2 |
| `rn-konrad-follow.mjs`, geöffnet 21:44:48 UTC = Slot + 288 s (`konrad-follow.txt`) | 0 beim DWD. Slot 21:35 nach 4 s (jsDelivr hing, raw sprang nach 2,5 s ein), Slot 21:40 um 21:45:40 nachgeladen (Gate + 10 s; seither auf + 20 s gesetzt) |

Messung des Spiegels am selben Abend (`konrad-mirror-lag.txt`, 15 Slots, Commit-Zeit minus Slot-Zeit): 303–328 s, Median 310 s.

Die fünf Fragen: 1 Funktionserhalt — Zellbahnen, Hagel DE, Regenradar-Zellen und Dashboard-Zeile lesen denselben Lauf über
denselben Parser; der alte Weg liegt hinter `konraddwd=1`. 2 Desktop pixelgleich — keine Änderung an Markup, CSS oder
Zeichenweg; kein Pixelvergleich. 3 Touch-Ziele — keine neue Bedienfläche. 4 Konsole — 0 Fehler. 5 Long Tasks — nicht
gemessen. Nicht geprüft: Produktion, Real-Device, eine Lage mit Zellen (alle Läufe des Abends: 0 Zellen).

### 10.6 Befunde

- **V-RN-12 — das KONRAD-Gate liegt knapp hinter dem Spiegel.** Commit 303–328 s nach der Slot-Zeit, dazu der Push; das Gate
  ist 330 s. Ein Abruf zwischen 330 s und dem Push läuft in ein 404, das raw ≈ 60 s und jsDelivr länger festhält — der Leser
  nimmt dann den Slot davor und fragt 70 s später wieder. Mehrwert: kein versteckter Slot. Skizze: die Zeit bis zum Ende des
  Pushs messen (nicht nur den Commit) und das Gate danach setzen (≈ 345 s), oder der Spiegel wird pünktlicher (E-ND-1).
- **V-RN-17 — `verify:cell-towers` G10** prüft „unverändert gegenüber HEAD" und ist deshalb bei jeder uncommitteten Änderung
  an `dwdKonrad3d.ts` rot. Skizze: gegen einen festen Commit oder den Inhalt prüfen.
- **V-RN-18 — zwei Layer, zwei Abrufe.** Zellbahnen und Hagel fragen im selben Augenblick; der Speicher greift erst nach dem
  ersten fertigen Abruf. Bestand. Skizze: laufenden Abruf teilen (`shareInFlight`, wie beim RV-Leser).

## §7 Offen

Commit und Push (Jan, `MANUELLE-SCHRITTE.md` §94), dazu `npm run edge:share` (schon offen, E-DK-8). Sichtprüfung in
Produktion und am Gerät. E-RN-2 … 4 (E-RN-2 betrifft jetzt auch die ICON-D2-Layer und KONRAD3D: kein Notweg, wenn der
Spiegel oder der Repack steht). V-RN-1 … 18. Weiter beim DWD, weil ohne Bilder im Repo: Wolken, relative Feuchte,
Bodenfeuchte, EPS, ICON-EU, ICON global, AICON, „Sicherheit" im Temperatur-Modus; dazu die direkten Radarwege AT und CH und
die Blitze (WMS `maps.dwd.de`).
