# Wind in voller ICON-D2-Auflösung (Phase WH) — Diagnose, Umsetzung, Gate

Stand 22.11.2026. Auftrag (Jan, 22.11.): „könntest du das bitte angehen dass das 2,2 km Auflösung hat? du kannst dafür auch
gerne das Datenrepo ändern“ — und als Zwischeninfo: „es wäre super wenn du es für alle änderst, auch Windkarte etc. auf
2,2 km“. Gemeint ist das Windfeld, das die Partikel zeichnen (Wetterkarte, Regenradar, Dashboard-Kachel, Globus, Seekarte).
Die Werte am Punkt (buscosun Fusion) sind nicht berührt.

## 1. Diagnose (gemessen 22.11.2026, nur gelesen)

**Was heute gezeichnet wird.** Der Repack-Producer (`scripts/repack-icon-d2.mjs`) tastet den 10-m-Wind von ICON-D2
(1215 × 746 Zellen, 0,02° ≈ 2,2 km) mit `buildWindRgba(u, v, 700)` auf jede zweite Zelle herunter: `wind-<SSS>.png`,
608 × 373, 13 Schritte (0–12 h) je Lauf, alle drei Stunden ein Lauf. Der Browser liest diese Bilder
(`sources/repackSource.ts` → `wind/iconD2WindSource.ts`), die Partikel-Klasse rechnet sie am Desktop wieder auf das Doppelte
hoch (`upsample: 2`, bilinear + 3 × 3 geglättet) und lädt 1216 × 746 als Textur. Das feinere Raster ist also heute schon
die Texturgröße am Desktop — nur gefüllt mit interpolierten statt mit echten Werten.

| Größe | heute (jede 2. Zelle) | volle Auflösung |
|---|---|---|
| Bild | 608 × 373 | 1215 × 746 |
| Bytes je Schritt (Lauf 2026112206, Schritte 1 / 6 / 12) | 222 / 215 / 205 KB | 739 / 721 / 680 KB (× 3,3) |
| 13 Schritte je Lauf | 2,8 MB | 9,3 MB |
| Aufbereitung im Browser, Desktop (`refineNormalizedUV`, Median von 7, dieser Rechner) | 160 ms (608 × 373, × 2) | **48 ms** (1215 × 746, × 1) |
| Textur am Desktop | 1216 × 746 | 1215 × 746 |
| Aufbereitung am Touch-Gerät (× 1) | 11 ms, Textur 608 × 373 | 48 ms, Textur 1215 × 746 (vierfach) |
| volle Auflösung UND × 2 | — | 543 ms, 2430 × 1492 — scheidet aus |

Ein Repack-Lauf trägt heute 12,1 MB (alle zehn Familien); die Windbilder in voller Auflösung kämen mit 9,3 MB dazu
(+77 %). Das Daten-Repo hält vier Läufe.

**Warum nicht einfach `wind-<SSS>.png` größer schreiben.** Der Leser prüft die Bildgröße gegen das Gitter des Abschnitts
(`loadRgba(…, section.grid, …)`): ein Client mit altem Bündel (offener Tab, Service Worker) verwürfe ein 1215 × 746-Bild
und fiele für den Wind aus. Die alte Familie muss also unverändert bleiben; die volle Auflösung ist eine **zweite Familie**
mit eigenem Gitter — so wie `precip` und `cape`, die schon in voller Auflösung im Repack liegen (`fullRes`).

**Seekarte.** Ein eigener Ausschnitt nur für die Seekarte (45,3–56,6° N, 5,3–17,6° O) wären 316–350 KB je Schritt. Mit
Jans Zwischeninfo entfällt das: eine Familie für alle Karten.

**Nebenbefund.** Die Seekarte erreichte die Alpenseen nicht (`maxBounds`, V-BS-40) — behoben, `audit/seewetter-binnenseen.md` §9.7.

## 2. Plan

| Nr. | Frage | Vorschlag |
|---|---|---|
| **E-WH-1** | Wo entsteht das Bild? | Im Repack, als Nebenprodukt des Windschritts aus denselben schon dekodierten Feldern (kein zweiter Abruf beim DWD, rund 0,15 s je Schritt): Familie `windHd`, Datei `windhd-<SSS>.png`, RGB, eigenes Gitter, Normierung je Schritt. `wind` bleibt unverändert |
| **E-WH-2** | Welche Geräte? | **Desktop (feiner Zeiger): volle Auflösung, ohne Hochrechnen** — gleiche Textur wie heute, weniger Rechenarbeit, echte statt interpolierter Werte. **Touch-Geräte bleiben zunächst beim heutigen Bild** (dort wären es vierfache Textur und 3,3-fache Datenmenge, ungeprüft am Gerät); `?windhd=1` schaltet es zum Ansehen am Telefon ein. *Jans Entscheidung nach dem Blick am Gerät* |
| **E-WH-3** | Rückfall | `?windhd=0` = das heutige Bild. Fehlt die neue Familie für einen Lauf (alter Lauf, Schritt ausgefallen), nimmt der Client für den GANZEN Lauf das heutige Bild — zwei Raster werden nie gemischt |
| **E-WH-4** | Preis, den jeder Desktop-Besucher zahlt | 3,3-fache Bytes je Windschritt: die zwei Bilder um „jetzt“ 1,4 statt 0,43 MB, der nahe Horizont (5 Schritte) 3,6 statt 1,1 MB, alle 13 Schritte 9,3 statt 2,8 MB. Das erste Windbild kommt entsprechend später (bei 20 Mbit/s rund 0,4 s) — zu messen |
| **E-WH-5** | Daten-Repo | +9,3 MB je Lauf, +37 MB im Baum bei vier Läufen. Der Producer kommt mit dem Push von `main` (der Workflow klont ihn); am Workflow selbst ist nichts zu ändern |

Jan hat den Auftrag gegeben (22.11.); E-WH-1 … E-WH-5 sind so umgesetzt. E-WH-2 (Touch-Geräte) und E-WH-4 (Preis) sind
gesetzt und warten auf seinen Blick.

## 3. Umsetzung (22.11.2026, lokal committet, nicht gepusht)

**Datenseite (Repack).**
- `scripts/lib/repackManifest.mjs`: Familie `windHd` (`file: 'windhd'`, drei Kanäle, dieselben Felder und derselbe Horizont
  0–12 h wie `wind`, `hd: true`, `of: 'wind'`, nur über `index.json` wie `wind`).
- `scripts/repack-icon-d2.mjs`: `repackWindHdStep` = `buildWindRgba(u, v, u.ni)` — dieselbe Funktion wie bisher, nur ohne
  Abtastung; gebaut aus den schon dekodierten Feldern des Windschritts (kein zweiter Abruf, kein zweites Dekodieren).
  Eintrag im Lauf-Manifest: `windHd: { channels: 3, grid: { ss: 1, width: 1215, height: 746, corners }, steps: [{ step, file,
  bytes, uMin, uMax, vMin, vMax }] }`. `REPACK_WIND_HD=0` lässt die Familie weg. `wind-<SSS>.png` ist Byte für Byte, was es
  war (am veröffentlichten Bild geprüft).
- README-Vorlage des Daten-Repos nennt die Datei. **Am Workflow des Daten-Repos ist nichts zu ändern**: er klont den
  Producer von `main`, zählt die Schritte je Familie generisch aus dem Index und der Publisher schreibt jede Familie des
  Lauf-Manifests in den Index (`indexEntry`).

**Datenvertrag, mit Namen.** Neu: `runs/<lauf>/windhd-<SSS>.png` (13 Dateien je Lauf, 680–740 KB) und der Schlüssel
`windHd` im Lauf-Manifest `runs/<lauf>/repack.json`, im Zeiger `runs/<lauf>/index.json` und im Eintrag des Laufs in
`index.json`. Nichts Bestehendes ändert sich; ein Client, der die Familie nicht kennt, übergeht den Schlüssel.

**Leser und Karten.**
- `src/sources/repackSource.ts`: `windHd` in `REPACK_FAMILIES`, Abschnitt mit eigenem Gitter (abgelehnt ohne Gitter, mit
  abgetastetem Gitter, mit anderer Kanalzahl), `loadWindHdStep`, `uvBoundsOfGrid`.
- `src/wind/iconD2WindSource.ts`: Schalter `windHdFrom` (feiner Zeiger = an, Touch = aus, `?windhd=1|0`); nach dem Lauf
  wird der Abschnitt `windHd` DESSELBEN Laufs geholt und nur genommen, wenn er jeden geladenen Schritt trägt — sonst der
  ganze Lauf abgetastet wie bisher; `IconD2Wind.hd`, `windUpsampleOf`, `windModelLabel`; der Sofort-Start-Cache merkt sich
  die Auflösung.
- `src/wind/WindLayer.ts`: `WindMeta.upsample` — der Faktor des Hochrechnens je Feld (1 beim vollen Bild) schlägt die
  Voreinstellung der Schicht; ohne Angabe wie bisher. Zwei Zeilen, kein Shader, keine Option geändert. **Das ist der
  Eingriff an der Partikel-Klasse, den Jans Auftrag deckt.**
- Aufrufstellen: Wetterkarte / Regenradar (`MapView.tsx`: Sofortbild, Bild, Arbeiter-Weg), Dashboard-Kachel
  (`MiniMap.tsx`), Seekarte (`SeaParticleLayer.ts`). Der Globus (GFS) und die Druckflächen (ICON-EU) sind nicht berührt.
- Ehrlichkeit: die Statuszeile der Wetterkarte sagte „2,2 km“, gezeichnet wurde jede zweite Zelle — sie nennt jetzt, was
  gezeichnet wird; die Legende der Seekarte ebenso.

**Wie es wirksam wird.** Mit dem Push von `main`: (1) die Seite fragt nach `windHd`; solange kein Lauf die Familie trägt,
liest sie `wind` wie bisher. (2) Der nächste `build`-Lauf im Daten-Repo klont den neuen Producer; der vorhandene Lauf gilt
dann als unvollständig (`windHd 0/13`) und wird EINMAL neu gerechnet und veröffentlicht — danach trägt jeder Lauf beide
Familien. Kein Handgriff am Daten-Repo.

## 4. Belege und Gate (22.11.2026)

- **`verify:wind-hd` 23/23** (neu, netzfrei, in der CI) und **25/25 mit `--live`**: an einem echten Feldausschnitt (80 × 60
  Zellen) trägt jeder Bildpunkt den Modellwert seiner Zelle (höchstens ein halber Quantisierungsschritt), mit Gegenprobe
  auf das Maß (Süden oben, u/v vertauscht, um eine Zelle verschoben fallen auf); Lage aus den Ecken; PNG-Rundlauf; der
  Vertrag am echten Manifest des Producers bis durch den Index; fünf kaputte Abschnitte abgelehnt; die alte Familie
  unberührt. Live: das volle Bild des Laufs 2026112206, Schritt 1, an allen 906 390 Zellen gegen das GRIB; das
  abgetastete Bild Byte für Byte das veröffentlichte.
- Producer lokal, Lauf 2026112206, Schritte 1 und 6: `wind` 216 / 209 KB, `windHd` 722 / 704 KB, zusammen 6,9 s.
- `verify:sea-particles` 32/32 (C13: volles Feld mit Faktor 1 an die Schicht), `verify:repack-publish` 24/24,
  `verify:repo-only` 63/63, `verify:precip-repo` 19/19, `verify:radar-fallback` 67/67, `verify:sea-sight` 80/80.
- Typecheck 0, Build 281/281. **Budget:** totalJs 2 102,1 gegen 2 101,4 davor (+0,7 KB); Grenze von Hand 2 102 → 2 103
  mit Notiz.
- Rechenzeit, gemessen in Node auf diesem Rechner: Aufbereitung 48 ms (voll, × 1) gegen 160 ms (abgetastet, × 2);
  Mischen zweier Bilder für den Zeitregler 2,1 s gegen 2,3 s (läuft im Arbeiter, nicht auf dem Hauptfaden).
- **Nicht geprüft:** nichts im Browser — kein Bild, keine Konsole, keine Ladezeit, kein Gerät. Das Erstbild des Winds
  mit 1,4 statt 0,43 MB ist nicht gemessen (`scripts/perf-measure.mjs`, sobald ein Lauf die Familie trägt).

Die fünf Fragen: (1) Funktionserhalt — nichts entfernt; ohne die Familie im Index, mit `?windhd=0` und auf Touch-Geräten
liest der Client wie bisher (B4, B6, C1, D1). (2) Desktop pixelgleich — nein, und das ist der Zweck: das Windfeld ist
feiner; alles andere unberührt, nicht gesehen. (3) Touch-Ziele — keine Bedienung geändert. (4) Konsole — nicht geprüft.
(5) Long Tasks — nicht im Browser gemessen; in Node ist die Aufbereitung kürzer als bisher.

## 5. Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-WH-1** | Nichts im Browser gesehen, Ladezeit des ersten Windbilds nicht gemessen | Nach dem ersten Lauf mit `windHd`: Wetterkarte ansehen (Desktop), `perf-measure.mjs` gegen `?windhd=0` |
| **V-WH-2** | ~~Touch-Geräte zeichnen weiter jede zweite Zelle~~ — seit §6 an auf jedem Gerät, **am Telefon ungeprüft**: vierfache Textur (1215 × 746 statt 608 × 373), 3,3-fache Bytes, Aufbereitung je Bild rund viermal so lang wie bisher am Touch-Gerät | Real-Device gleich nach dem Push: Wetterkarte mit Wind am Telefon (Ruckeln beim Ziehen, Zeit bis zum ersten Windbild im Mobilnetz); Rückfall je Link `?windhd=0`, für alle `WIND_HD_DEFAULT = false` |
| **V-WH-3** | Desktop lädt 3,3-fache Windbytes (zwei Bilder um „jetzt“ 1,4 statt 0,43 MB, alle 13 Schritte 9,3 statt 2,8 MB) | Skizze, falls das Erstbild leidet: zuerst das abgetastete Bild zeigen, das volle nachladen und tauschen |
| **V-WH-4** | Daten-Repo: +9,3 MB je Lauf (12,1 → 21,4 MB), bei vier Läufen +37 MB im Baum; der erste Lauf nach dem Push wird einmal ganz neu gerechnet | Nur vermerkt. Später kann `wind` entfallen, wenn kein alter Client mehr unterwegs ist und Touch das volle Bild nimmt (−2,8 MB je Lauf) |
| **V-WH-5** | **Die anderen Flächen zeichnen weiter jede zweite Zelle:** Temperatur, Böen, Gewitter, Rotation, Blitzprognose, Schnee (608 × 373). Nur Niederschlag und CAPE liegen schon in voller Auflösung. Layer-Katalog und Info-Panel nennen dort „2,2 km“ (das Modell) | Jans „auch Windkarte etc.“ kann das mit meinen — je Familie derselbe Weg wie hier (zweite Familie, eigenes Gitter), aber mit eigener Maske und Höhenkorrektur bei der Temperatur. Eigene Phase, Jans Wort |
| **V-WH-6** | Der Sofort-Start-Cache (IndexedDB) hält am Desktop 3,6 statt 0,9 MB | Nur vermerkt |
| **V-WH-7** | Der Wind am Punkt (`sampleWindAt`, Ablese-Marke der Karte) kommt am Desktop aus dem vollen, am Telefon aus dem abgetasteten Feld — die Zahl kann sich zwischen den Geräten leicht unterscheiden | Nur vermerkt |
| **V-WH-8** | `verify:repack` (Byte-Gate der Repack-Linie, mit Netz, rund 11 min): erster Lauf 344/347, **zweiter Lauf nach der Anpassung 345/347** (11 Familien, Familienliste Producer = Client grün). Eine der drei roten Prüfungen des ersten Laufs war diese Phase (die Regel „alle Familien außer Wind hängen an `latest-grib.json`“ zählte eine Familie ohne Manifest — jetzt `wind` und `windHd`, angepasst). **Zwei sind schon am committeten Stand rot und gehören nicht zu dieser Phase:** M3 (die Prefetch-Zeile in `MapView.tsx` trägt seit einer früheren Phase zusätzlich `(profile && !RADAR_PROFILE.prefetch)`, der Prüfer sucht den alten Wortlaut — an `HEAD` nachgezählt) und die Service-Worker-Prüfung `isHashedAsset` (`public/sw.js`, von mir nicht berührt) | Beide Prüfungen auf den heutigen Wortlaut stellen — eigene kleine Aufgabe der Repack-Linie |

## 6. An auf jedem Gerät (22.11.2026, Jans Wort)

Jan nach dem Bericht: „aktiviere es jetzt standardmäßig“ — E-WH-2 ist damit entschieden: `WIND_HD_DEFAULT = true` in
`src/wind/iconD2WindSource.ts`, die Wahl hängt nicht mehr am Zeiger des Geräts. **Eingeschaltet vor jeder Prüfung an einem
echten Gerät und ohne dass ich es im Browser gesehen habe.** Wirkt wie der Rest mit dem Push und dem ersten Repack-Lauf
danach.

- Geändert: die Voreinstellung und ihr Kommentar, `verify:wind-hd` C1 / C1b (an ab Werk, `?windhd=0` zurück, der Schalter
  wirkt in beiden Stellungen; kein `matchMedia` mehr in der Wahl). Sonst kein Code.
- Gate: `verify:wind-hd` 24/24, `verify:sea-particles` 32/32, `verify:repo-only` 63/63, Typecheck 0, Build 281/281,
  Budget totalJs 2 102,0 / 2 103.
- Was das am Telefon heißt (gerechnet, nicht gemessen): Textur 1215 × 746 statt 608 × 373; die zwei Bilder um „jetzt“ 1,4
  statt 0,43 MB — im Mobilnetz spürbar; die Aufbereitung je Bild in Node 48 statt 11 ms (am Telefon ein Mehrfaches).
- Rückfall: `?windhd=0` je Link; für alle `WIND_HD_DEFAULT = false` und ein Push, oder im Daten-Repo `REPACK_WIND_HD=0`
  (dann liest jeder Client wieder `wind`).
