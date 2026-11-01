# SEO Nischen (Phase SN): Waldbrand, Historie, Modellvergleich, Seewetter, Vertikalschnitt, Gletscher, Autobahnwetter

> Auftrag Jan, 01.11.2026. Direkt auf `main`, je Maßnahme ein Commit, Push erst nach Jans Ja. Datengrundlage, Flags und Gates bleiben
> unberührt, außer den Fühler-Fixes für das Autobahnwetter (Punkt 2 des Auftrags). Phase-1-Bericht steht im Sitzungsverlauf; die
> Kernbefunde sind hier in §1 und §7 festgehalten.

## 0. Kurzfassung

- **Gletscher:** freigeschaltet (Commit), wirksam mit dem Push. Offen: Jans Real-Device-Test (§4.3).
- **Autobahnwetter:** H1 und Hinweis sofort, Freischaltung vollständig vorbereitet hinter EINEM Schalter und im Probelauf grün (§6). Noch nicht
  geschaltet: Die Fühler-Fixes wirken erst nach dem Push, und `road-archiv` wird erst nach Einspielen der Vorlage grün (§3).
- **Atmosphäre:** alte Ansichten mit 301 auf `/atmosphaere/querschnitt`, Texte auf den echten Umfang gebracht (§5.1).
- **Fund außerhalb des Plans:** `/waldbrand` sprang live auf `/waldbrand/historie`, samt Titel und Canonical. Behoben (§5.6).

## 1. Korrekturen am Ausgangsstand

| Annahme im Auftrag | Befund |
|---|---|
| `/historie` zeigt denselben Inhalt wie `/wetterarchiv` | Falsch. Antwortet live mit 301 auf `/wetterarchiv`, ebenso `/rueckblick`. Nichts zu bereinigen. |
| Modellvergleich je Ort liegt in der Historie | Falsch. Er liegt auf `/vorhersage` (`src/confidence/HitRatePanel.tsx`), gemessen am Konsens der Modell-Analysen, nicht an Stationen. |
| „Vertikalschnitt“ fehlt vermutlich in Titel und H1 | Fehlte nur im App-Intro. Autocomplete liefert für „vertikalschnitt wetter“ und „höhenprofil atmosphäre“ keine Vorschläge. |

## 2. Commits

Reihenfolge wie auf `main`; fremde Radar-Commits liegen dazwischen.

| Commit | Inhalt |
|---|---|
| `7d6f6963` | Fühler-Regeln (`roadAir` eng, `precipFill`), Vorlage `road-archiv`, Prüfer |
| `d4bc2aba` | Atmosphäre: 301, Route und Seiten raus, Texte, Prüfer, Edge-Bündel |
| `d8fc3b5d` | Vertikalschnitt als Hauptseite: Titel, H1, Fakten |
| `ad34575f` | falsche Sätze in der Atmosphäre-Oberfläche |
| `3cdffe52` | Startseite: Nischen im statischen HTML, Kacheln als echte Links |
| `553818d3` | `/wetterarchiv`: Quellen, Abdeckung, Grenzen |
| `4d36aca9` | Modellvergleich je Ort benannt, mit Messgrundlage |
| `b93ab11d` | Seewetter: Funktion, Methodik, OG, Wasserstand im Titel, `/fuer/segler` |
| `960f2313` | Waldbrand: Titel und H1 getrennt, Links von Ortsseiten |
| `b68acb12` | Querverweise |
| `e85377d3` | OG-Karten neu |
| `9769247b` | Gletscher freigeschaltet, Lizenzseite, Ortsblöcke |
| `a7d02617`, `599032ed` | Autobahn-Freischaltung vorbereitet, H1, Hinweis; Korrekturen aus dem Probelauf |
| `60f3598f` | Edge-Bündel |
| `1281a08d`, `6d92fb13` | Text-Chunk nur wo nötig und bei Leerlauf, eigener kleiner Chunk |
| `3bd38e45` | `/waldbrand` bleibt `/waldbrand` |
| `7d6187f2` | H1 im Intro des Vertikalschnitts |
| `92baae6e` | Budget eagerJs 112 KB (Jan 01.11.) |

**Der Push trägt fremde Commits mit:** `origin/main` steht auf `083a77ee`. Dazwischen liegen `9ec0bfab`, `ef7766e0`, `59df5943` (Radar CH), `a8ce5400`, `b07c1ecc` (Wind) einer anderen Linie im selben Arbeitsbaum. Nicht von dieser Phase, nicht geprüft außer durch den vollen Build.

## 3. Autobahnwetter: Fühlerfehler und `road-archiv`

### 3.1 Stichprobe 01.11.2026, 10:45–13:15 UTC (11 Slots, 16 201 Punkte)

| Befund | Messung | Art |
|---|---|---|
| V528 Fh. Mannheim | alle 3 „Frostgefahr“-Einträge: Fahrbahn 0,2 °C, Luft ≈ 12 °C (11,8 K, knapp innerhalb der harten 12-K-Grenze) | D-1 |
| E237 GMA Nordkreuz | Fahrbahn ≈ 40 °C bei Luft 11–12 °C (28 K, innerhalb 30 K), an 26 von 27 Archivtagen ≥ 15 K über der Luft | D-2 |
| B338, B773, K502, K447 u. a. | 20,16 und 21,6 mm/h auf trockener Fahrbahn, mit gesetzter Intensität oder Art | D-3 |

### 3.2 Regeln (`src/road/roadContract.ts`)

- **`ROAD_AIR_SOFT`:** ab 8 K unter oder 15 K über der eigenen Luft fällt ein Fahrbahnfühler, wenn die Nachbarn der Luft recht geben (≤ 4 K) und der Fahrbahn nicht (> 6 K).
  Ohne Nachbarn bleibt der Wert, damit eine einzelne echte Frostlage nicht verschwindet.
- **`ROAD_PRECIP_FILL`:** 20,16 und 21,6 mm/h zählen nur bei nasser Fahrbahn (Code ≥ 2); jede Rate ab 5 mm/h fällt, wenn alle Fühler trocken ohne Wasserfilm melden.
- **Nachrechnung am Archiv 02.–28.10. (stündlich, 666 940 Wertepaare):** 1 760 verworfen (0,26 %), 53 Stationen, vorn E237 553, P457 294, M531 290, M821 210, E774 114.
- **Gegenproben im Prüfer:** SN3 (ohne Nachbarn), SN4 (Strahlungsnacht, Nachbarn ebenso kalt), SN5 (Sonne, Nachbarn ähnlich warm), SN6 (Luftfühler defekt), SN9 (echte Raten bei Nässe). `verify:road-contract` 133/133.
- **Nicht belegt:** Die Schwellen sind `set`, gemessen nur am Herbst. Wirkung im Live-Slot erst nach dem Push (Radar-Job ≤ 5,75 h).

### 3.3 `road-archiv` rot seit 28.10. 09:30 UTC

- **Ursache, lokal nachgestellt:** Seit `ba0a83e` holt der Job SWSMOS. Der sparse App-Klon hat kein `node_modules`, `scripts/lib/bz2.mjs` importiert `bz2` ⇒ `ERR_MODULE_NOT_FOUND`, der Schritt ist `continue-on-error`, `swsmos/` entsteht nie, und `git add -A -- road swsmos` bricht mit `fatal: pathspec 'swsmos' did not match any files` (Exit 128) ab. Dadurch fehlt seit 28.10. 06:38 UTC jede Ablage. Die Fehlermeldung des echten Laufs ist nicht gelesen: die Logs brauchen eine Anmeldung, die Ursache ist also nachgestellt, nicht abgelesen.
- **Fix:** Vorlage `scripts/punktarchiv-repo/workflow-road-archiv.yml` installiert `bz2` im Schritt und nimmt `swsmos` nur, wenn es existiert. Lokaler Probelauf: alt Exit 128, neu Exit 0, ein SWSMOS-Lauf abgelegt. `verify:road-archive` 34/34 mit neuer Prüfung C7.
- **Verlust:** Halbtage und Quarantäne seit dem 28.10. sind nur soweit nachholbar, wie die Ringe reichen (24 h). Gate E braucht sein 7-Tage-Fenster also ab dem ersten grünen Lauf.

## 4. Gletscher

### 4.1 B2 (11.–31.10.2026)

| Prüfung | Ergebnis |
|---|---|
| Läufe | `glacier-sat` 41/41 grün, `melt` 100/100 (ab 20.10., die API zeigt nur die letzten 100), `feed` 21/21, `static` 3/3 |
| Szenen | 138, 3 593 Werte, davon 965 mit Schneegrenze an 185 Gletschern |
| Ausreißer | **0** Quarantänen wegen Höhe oder Albedo; 5 227 Verwerfungen allein wegen Wolken |
| Sprünge zwischen zwei Szenen (≤ 10 Tage), ≥ 400 m | 65 von 773 Paaren; 53 fallend (plausibel: Neuschnee ab Mitte Oktober), **12 steigend** am 15., 17. und 27.10., alle Schweiz, z. B. Oberaar 2 681 → 3 400 m in 3 Tagen, Weingarten N 4 067 m |

**Urteil:** Die Prüfer zeigen keine Ausreißer. Ob die 12 Anstiege falsch sind, lässt sich ohne Vergleichsmessung nicht entscheiden; ein Bild einzeln anzusehen wäre der nächste Schritt (V-SN-4). Der Wert steht als Szenenwert mit Datum da und trägt keinen Anspruch auf die Gleichgewichtslinie (E-GL-14). B1 und C bleiben rot, und die Seiten sagen das.

### 4.2 GLIMS (V-GL-20)

NSIDC-Datensatzseite, gelesen 01.11.: „As a condition of using these data, you must cite the use of this data set.“ Eine CC-BY-Angabe steht dort nicht, auch nicht auf den erreichbaren Seiten von glims.org. **Stand:** Zitierpflicht, nicht „CC BY 4.0“. `/lizenzen/`, Methodik und Ortsblöcke nennen das so. Der Anspruch „CC BY 4.0“ aus der älteren Quelle bleibt unbelegt und wird nicht behauptet.

### 4.3 Real-Device (Jan, mit Produktion möglich, `GLACIER_LIVE` ist seit 13.10. an)

Gerät: echtes Handy, am besten Mittelklasse, per scrcpy/ADB oder direkt.

1. **Parse-Zeit Höhengitter (V-GL-8):** `/gletscher/ch-grosser-aletschgletscher`, Karte oder 3D öffnen. `dem/<region>.json` ist 0,1–6,4 MB. Remote-DevTools ⇒ Performance aufzeichnen: gibt es beim Öffnen einen Block über 200 ms im Hauptthread (`JSON.parse`)? Ohne Werkzeug: Friert das Scrollen spürbar über eine Sekunde?
2. **Long Tasks allgemein:** Aufnahme der ersten 10 s auf `/gletscher`: längster Task, Zahl der Tasks > 200 ms. PageSpeed zeigt mobil 12,7 s Blockierzeit, das ist der kritischste Wert der Nische.
3. **Scrollen und Karte:** Steckbrief-Reiter wechseln und scrollen; Karte verschieben ohne Hänger; Vergleichsregler ziehen; Schneezone erscheint ohne Einfrieren (8-ms-Scheiben).
4. **3D:** Umschalten auf 3D und zurück, kein Absturz des Tabs (WebGL-Kontext).
5. **Startseite:** mit und ohne `?gl=1` (V-GL-16), Kachel öffnet die Seite.
6. **Touch:** Reiter, Chips und Teilen ≥ 44 px sind gemessen; prüfe nur, ob etwas verdeckt ist.

Zeigt 1 oder 2 Hänger über etwa 2 s: Parse in einen Worker (V-GL-8); kein Grund, die Freischaltung zurückzunehmen, wenn die Seite bedienbar bleibt. Stürzt der Tab ab, Commit `9769247b` nicht pushen und mir sagen.

## 5. Maßnahmen

### 5.1 Atmosphäre (Punkt 3, Maßnahme 1)

- 301 von `/atmosphaere/fliegen`, `/berg-und-weg`, `/arbeitsfenster` (auch mit Ort) und `/funktionen/arbeitsfenster/` auf `/atmosphaere/querschnitt`. Clientseitig getestet, mit Ort und Query, ohne 404. **Die Netlify-Regeln sind erst nach dem Deploy prüfbar:** `scripts/seo/verify-live.mjs` prüft sie dann.
- Raus aus Sitemap und `llms.txt`, interne Links angepasst.
- **Share/Edge:** `shareParser.js` kannte die Routen; neu gebaut, `verify:share` 533/533. Alte Share-Links landen auf dem Schnitt.
- **Stark umgeschrieben, bitte ansehen:** `/fuer/gleitschirmflieger/`, `/fuer/drohnenpiloten/`, `/fuer/bau-und-kran/`, `/fuer/wetterfuehlige/`, `/eventplanung/drohne`, `/wissen/thermik/`, `/wissen/talwind/`, `/wissen/skew-t/`, `/wissen/windgrenzwerte-arbeit-drohne/`, `/wissen/windboeen-sturm/`.
- **OG:** Drei Karten alter Ansichten gelöscht, weil `verify:share` Karten ohne Route ablehnt. Alte externe Vorschauen verlieren damit das Bild.

### 5.2 Startseite

Kacheln sind `<a href>`, ein einfacher Klick bleibt die App-Navigation, Strg-Klick öffnet einen Tab. Das statische HTML nennt die indexierbaren Nischen als Links. `perf-measure.mjs` kennt den neuen Selektor.

### 5.3 Wetterarchiv und Modellvergleich

`/wetterarchiv` ohne JavaScript 364 Wörter (vorher 77), mit Quellen, Abdeckung, Grenzen und Link zum Modellvergleich. Der Modellvergleich sagt jetzt „welches Modell lag an deinem Ort zuletzt am nächsten“, nennt den Konsens der Modell-Analysen als Messgrundlage und ausdrücklich, dass das kein „genauestes Modell“ ist. Keine Genauigkeitszahl.

### 5.4 Seewetter

Titel mit Wasserstand, Text ohne JavaScript 338 Wörter (vorher 93), `/funktionen/seewetter/`, `/methodik/seewetter-quellen/`, eigene OG-Karten, `llms.txt`, Eintrag `/lizenzen/`. `/fuer/segler/` behauptete noch „kein Seegang“.

### 5.5 Seewetter-Ladezeit (Maßnahme 9): nicht verbessert, Befund

Blockierzeit fast ganz in MapLibre (8,2 von 11 s Hauptthread unter Software-Rendering), lange Tasks ab 7 s beim Aufbau der Karte. Das LCP-Element ist der Hinweis im Sheet (`.bs-hint-sub`), sein Verzug ist zu 90 % Render-Verzögerung, weil der Hauptthread belegt ist. Die Mini-Karte und die Charts sind nicht die Ursache. Ein Hebel wäre, die Karte erst nach dem ersten Bild zu starten; das greift in die Ladeordnung der Karte ein und ist hier nicht gemacht (V-SN-3).

### 5.6 Waldbrand

- Titel und H1 von `/waldbrand` und `/funktionen/waldbrandgefahr/` getrennt, Ortsseiten verlinken die Hauptseite.
- **Fehler gefunden und behoben:** Der erste Abgleich schrieb `/waldbrand` auf die aus dem Zustand abgeleitete Sicht um, zuletzt immer `/waldbrand/historie`, mit Titel, H1 und Canonical. Nachher bleibt die URL, ein echter Sichtwechsel führt weiter auf den Sicht-Pfad. **Unverändert:** Inhaltlich zeigt `/waldbrand` weiter die Saison-Voreinstellung, während Titel und H1 von der Waldbrandgefahr sprechen (V-SN-5).

### 5.7 Vertikalschnitt

**Nullgradgrenze: nicht erwähnt.** `LAYER_ROWS` (`AtmosphereDeck.tsx`) und `SectionChart.tsx` zeichnen keine 0-°C-Linie; Temperatur steht nur beim Klick auf einen Punkt. Die Nullgradgrenze gibt es im Regenradar („Karte + Höhe“), das Glossar verweist dorthin. Inversion ebenfalls nicht mehr behauptet; ICON-EU durch ICON-D2-Modellflächen ersetzt, „48 h“ durch rund 36 h.

## 6. Autobahnwetter: Freischaltung

**Voraussetzungen (Jan):** Push der Fühler-Fixes, ein Radar-Lauf danach, Stichprobe erneut (V528, E237, 20,16/21,6 mm/h), Vorlage nach `buscosun-archiv` kopiert und `road-archiv` grün.

**Der Schritt ist dann ein Commit:**

1. `ROAD_INDEXABLE = true` in `src/router/routes.ts`.
2. Inhalt von `audit/seo-nischen/road-release.toml` in `netlify.toml` vor die Regel `/autobahnwetter/*`.
3. `npm run og:app-cards` (20 Karten) und `npm run edge:share`.
4. `npm run build`, `verify:share`, `budget`.

**Probelauf in einer Wegwerf-Kopie (Stand `6d92fb13`):** Build grün, `verify-seo` 1 037 ohne Fehler, `verify-routing` 274/274, `verify:share` 533/533, 21 Einträge in der Sitemap, Link in `llms.txt`, 261 Ortsblöcke. eagerJs 111,5 KB; Grenze seit `92baae6e` 112 KB.

**Offen dabei:** Real-Device (V-AW-13), Gate E neu (7 Tage). Die Freigabe des Auftrags nennt nur Fühler-Fixes und `road-archiv`; Gate C und E bleiben formal offen, das entscheidet Jan beim Umlegen.

## 7. Vorher/Nachher

### 7.1 Lighthouse lokal, Median aus 3 Läufen, GPU an, abwechselnd im selben Lauf

A = Stand vor der Phase, B = Stand `6d92fb13`. Vorschau-Server ohne Netlify-Proxys. Über drei Runden streuen die Werte stark, vor allem FCP.

| Route | Perf A → B | SEO A → B | LCP A → B | TBT A → B | CLS |
|---|---|---|---|---|---|
| `/waldbrand` | 38 → 31 | 100 → 100 | 10,4 → 11,3 s | 9,5 → 7,6 s | 0 |
| `/wetterarchiv` | 88 → 87 | 100 → 100 | 3,4 → 3,2 s | 0,07 → 0,08 s | 0,071 |
| `/seewetter` | 41 → 42 | 100 → 100 | 8,4 → 8,3 s | 2,6 → 2,2 s | 0,003 |
| `/atmosphaere/querschnitt` | 70 → 72 | 100 → 100 | 5,6 → 5,6 s | 0,17 → 0,16 s | 0,056 |
| `/gletscher` | 37 → 36 | **69 → 100** | 10,2 → 10,2 s | 6,1 → 6,2 s | 0,009 |
| `/autobahnwetter` | 41 → 39 | 69 → 69 | 9,5 → 9,9 s | 2,1 → 3,1 s | 0,039 |

**Lesart:** Keine Route zeigt in allen Runden eine Verschlechterung. `/waldbrand` lag in Runde 1 und 2 bei 29 → 34 und 38 → 34, in Runde 3 bei 38 → 31, getrieben von einem zweigeteilten FCP (1,8 oder 3,5 s) auf beiden Seiten. `/autobahnwetter` TBT lag in den Vorrunden bei 2,5 → 2,6 und 2,7 → 2,4 s. **Das ist kein Beweis für „keine Verschlechterung“**, dafür sind drei Läufe zu wenig; die PageSpeed-Nachher-Werte müssen es bestätigen.

### 7.2 PageSpeed Insights mobil, live: nur Vorher (Stand vor dem Push, 01.11. 15:36–15:40 UTC)

| Route | Perf | SEO | FCP | LCP | TBT | CLS | Felddaten |
|---|---|---|---|---|---|---|---|
| `/waldbrand` | **kein Ergebnis** nach je 60 s, zweimal | | | | | | |
| `/wetterarchiv` | 97 | 100 | 1,4 s | 1,4 s | 0 ms | 0,034 | keine |
| `/seewetter` | 40 | 100 | 0,8 s | 5,5 s | 4 730 ms | 0,003 | keine |
| `/atmosphaere/querschnitt` | 98 | 100 | 1,4 s | 1,4 s | 10 ms | 0,007 | keine |
| `/gletscher` | 52 | 69 | 1,4 s | 3,3 s | 12 660 ms | 0,009 | keine |
| `/autobahnwetter` | 39 | 69 | 1,4 s | 7,6 s | 2 670 ms | 0,018 | keine |

Die API antwortete ohne Schlüssel mit 429, gemessen wurde über pagespeed.web.dev. **Nachher geht erst nach dem Push** (§9).

### 7.3 Verifier

| Prüfer | Vorher | Nachher (`6d92fb13`) |
|---|---|---|
| `verify-seo` | 813 ohne Fehler | 808 ohne Fehler (weniger Seiten durch die entfernten Atmosphäre-Routen) |
| `verify-routing` | 263/263 | 274/274 |
| `verify:share` | 531/531 | 533/533 |
| Build | grün | grün |
| Budget | eagerJs 110,2 · largestChunk 278,4 · totalJs 1 919,1 | eagerJs 110,3 · largestChunk 278,4 · totalJs 1 921,6 |
| `verify:road-contract` | | 133/133 |
| `verify:road-archive` | | 34/34 |

**Rot, schon vor dieser Phase (am Vorher-Stand gegengeprüft):**

- `verify:road-derive` 34/36 (J1, J3), identisch am sauberen HEAD.
- `verify:glacier-ui` 35/62, dieselben 27 roten Prüfungen auf beiden Ständen (V-SN-6).
- `verify:road-ui` bricht auf beiden Ständen an derselben Stelle ab (`verify-road-ui.mjs:365`, V-SN-6). **Die neue Hinweiszeile im Readout ist deshalb nicht durch diesen Prüfer gedeckt.**

### 7.4 Browser

**Startseite vorher gegen nachher:** 11 Kacheln, jetzt `<a>` mit dem Pfad des Features; Lage, Größe, Anzeige, Farbe und Textausrichtung gleich. Pixelvergleich: Desktop 0,021 % geänderte Pixel, mobil 0,0 %. Ein Klick auf die Seewetter-Kachel bleibt im selben Dokument und landet auf `/seewetter/st-peter-ording`.

Screenshots `audit/seo-nischen/shots/` (Desktop 1440 × 900, mobil 390 × 844). Horizontaler Überlauf 0 auf allen Hauptseiten, genau eine H1 auf jeder Seite außer `/autobahnwetter` (dort bis zur Freischaltung keine gerenderte H1, weil der Block bei `noindex` fehlt; nur die Shell trägt sie). Ohne JavaScript: alle Hauptseiten zeigen H1 und Text. Für `/atmosphaere/querschnitt` hat die lokale Vorschau keine Netlify-Rewrites; die Shell-Datei ist direkt geprüft. Konsole und Long Tasks sind in dieser Prüfung nicht ausgewertet; Real-Device bleibt offen.

## 8. Nicht umgesetzt

| Punkt | Grund |
|---|---|
| Autobahn `noindex` raus | erst nach Fixes live und `road-archiv` grün (Auftrag) |
| Seewetter-Ladezeit | kein Hebel ohne Eingriff in die Kartenladung (§5.5) |
| PageSpeed Nachher | braucht den Push |
| „Nullgradgrenze“ im Vertikalschnitt | der Schnitt zeigt sie nicht |
| 3D-Beschriftungen („3D-Wetter“ in Kachel und Rail) | Jans Kachel-Text von heute; im Schnitt gibt es keine 3D-Ansicht (V-SN-7) |
| tote Komponenten der alten Ansichten (`FoehnPanel`, `ThermalMap`, `GoNoGoPanel`, `NerdPanel` …) | nicht im Auftrag; Löschen von Komponenten ist Jans Gate |
| Einzelseiten je Gletscher | Pfade teilen die Hauptseite als Canonical; eigene Texte wären Stufe 2 |

## 9. Außerhalb des Repos

**Nach dem Push:**

1. `node scripts/seo/verify-live.mjs` gegen Produktion (prüft die 301).
2. PageSpeed Nachher auf den sechs URLs, Vergleich mit §7.2.
3. **Search Console:** Sitemap neu einreichen; URL-Prüfung und Indexierung beantragen für `/gletscher`, `/funktionen/gletscher/`, `/methodik/gletscher-daten/`, `/seewetter`, `/funktionen/seewetter/`, `/methodik/seewetter-quellen/`, `/waldbrand`, `/wetterarchiv`, `/atmosphaere/querschnitt`. Nach 2–4 Wochen die Berichte „Seite mit Weiterleitung“ für die vier alten URLs und „Gecrawlt, nicht indexiert“ prüfen. Export der Suchanfragen je Nische liefert die Volumen, die hier fehlen.
4. **Bing Webmaster Tools:** Sitemap einreichen.
5. **IndexNow:** geänderte URLs melden (`scripts/seo/indexnow.mjs`, Beispiel `indexnow.example.json`).

**Externe Verlinkung, nur wo sie wirklich nützt, ohne bezahlte Links:**

| Nische | Anlaufstellen |
|---|---|
| Gletscher | Alpenverein-Sektionen und Bergsport-Portale, Bildungsseiten zum Klimawandel, Wikipedia-Artikel einzelner Gletscher nur als Weblink mit eigenem Mehrwert und nach deren Regeln |
| Seewetter | Segelvereine und Hafenseiten an Nord- und Ostsee, Kitesurf-Schulen, Segelforen mit Revierfragen |
| Waldbrand | Forst- und Feuerwehrverbände, Wetterforen zur Waldbrandsaison; Hinweis, dass die Stufen amtlich beim DWD und bei waldbrandgefahr.ch stehen |
| Autobahn | erst nach Freischaltung: Lkw- und Motorradforen, Winterdienst-Fachmedien |
| Vertikalschnitt | DHV und Gleitschirm-Foren, Bergsport-Portale (Höhenwind) |
| Historie, Modellvergleich | Wetterforen (Modelldiskussion), Lokalmedien zu Wetter-Rückblicken |

**Autobahn- und Archiv-Repo:** Vorlage kopieren (§3.3). Das ist ein Push in `buscosun-archiv`, Jans Gate.

## 10. Befunde (V-SN)

| Nr. | Befund / Mehrwert | Skizze |
|---|---|---|
| V-SN-1 | Der Prüfer sah npm-Importe im sparse Klon nicht; so blieb `road-archiv` vier Tage rot | C7 prüft SWSMOS; auf die anderen Schritte ausweiten |
| V-SN-2 | `ROAD_AIR_SOFT` ist nur am Herbst gemessen; Brücken wie P457 stehen dauerhaft ≥ 15 K über der Luft (Heizung?) | im Winter und Sommer nachrechnen; P457, L817 beim DWD klären |
| V-SN-3 | Seewetter: TBT fast ganz MapLibre; schnellere erste Bedienbarkeit | Karte erst nach dem ersten Bild starten, eigene Phase mit Messung |
| V-SN-4 | 12 steigende Schneegrenzen ≥ 400 m in ≤ 10 Tagen, alle CH | Szenen ansehen; Weingarten N 4 067 m zuerst |
| V-SN-5 | `/waldbrand` zeigt per Voreinstellung die Saison, spricht aber von Waldbrandgefahr | Jans Entscheidung: Standardsicht Gefahrenindex oder Text anpassen |
| V-SN-6 | `verify:glacier-ui` (27 rot) und `verify:road-ui` (Abbruch) sind nicht mehr auf dem Stand der Seiten | neu aufsetzen, beide vor Gate D/C wichtig |
| V-SN-7 | „3D-Wetter“ in Kachel und Rail, obwohl der Schnitt kein 3D zeigt; „+48 h“ am Zeit-Deck, die Anker reichen 36 h | Jans Wortwahl; Text anpassen |
| V-SN-8 | Meteostat (CC BY-NC 4.0) und Open-Meteo (nicht-kommerziell) stehen in `/lizenzen/`, obwohl die Projektregel NC-Klauseln ausschließt | Lizenzlage für die Historie prüfen, bevor sie stärker beworben wird |
| V-SN-9 | `/waldbrand` liefert bei PageSpeed nach 60 s kein Ergebnis | nach dem Push erneut, sonst gesondert untersuchen |
| V-SN-10 | Vier Gleitschirm-, Drohnen-, Bau- und Wetterfühligen-Seiten haben durch den Rückzug viel Substanz verloren | beobachten, ggf. `noindex` oder zusammenlegen |
