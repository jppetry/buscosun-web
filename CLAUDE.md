# CLAUDE.md — buscosun: Projekt-Verfassung für Claude-Code-Agenten

> **Stand: 2026-09-09.** **Aktuelle Phase: PD-A — Datenversorgung für buscosun Fusion, Fundament steht**
> (`audit/punktdaten-versorgung.md` §12–§22, Gate GPD-A grün). Jans zweiter Auftrag des Tages:
> `ABLAUFPLAENE.md` (sechs DIN-66001-Pläne des Fusions- und Downscaling-Algorithmus) und
> `QUELLENMATRIX.md` (Primärquellen je Land und Vorhersagestunde) liegen in der Wurzel; daraus ist
> der Datenbedarf abzuleiten und **`jppetry/buscosun-data` so weit zu bringen, dass es ihn dauerhaft
> trägt** — der Algorithmus selbst bleibt unangetastet.
> **Kernbefund:** das Daten-Repo trägt heute **4 von 41 benötigten Feldern**, und diese vier in der
> falschen Achse (Fläche-je-Zeitpunkt statt Zeitreihe-je-Ort), zu grob quantisiert und mit 12–27 h
> statt 336 h Horizont. Es fehlen nicht einzelne Felder, sondern **drei Produktlinien**: der
> **Punkt-Cube** (`point/`, dynamisch) und die
> **Kalibrierung** (`point/calib.json` — `σ_sys`, `Σ`, `c(p,f)`, `L_d`, `A`, `φ` … sind DATEN aus der
> Verifikation, keine Konstanten, und **kein einziger ist gemessen**, solange `buscosun-archiv` nicht
> läuft). Die Kartenlinie (`runs/`, `radar/`) bleibt unberührt.
> **Umgesetzt (uncommitted):** `src/point/{cubeFormat,sourceMatrix,terrainPoint,calibration,manifest}.ts`
> als EINE Form für Producer und Client (kein Spiegel wie bei `repackManifest.mjs` — beide importieren
> dieselbe Datei); `scripts/point/{build-point-cube,publish-point}.mjs` plus die Adapter-Schicht;
> `verify:point-data` **238/238** (in CI); `scripts/repack-repo/README.md` neu (beschreibt alle
> Linien — V-PD-3) und `workflow-point.yml` als Cron-Vorlage.
> **Gemessen am echten Datum, nicht geschätzt:** Cube Stufe 1 (ICON-D2 2026090909, 0–3 h) 208 Chunks
> à 14,1 KiB Median, 2,64 MiB, Abruf 53,3 MiB bz2 in 89 s ⇒ volle Stufe 1 ≈ 32 MiB (mit gefüllten
> σ- und Profilebenen ≈ 65 MiB, Abruf ≈ 640 MiB/Lauf). Die Zeilendifferenz vor dem Deflate spart
> 28–41 % bei glatten Feldern, kostet aber **+22 %** bei Klassenrastern ⇒ der Container wählt den
> Filter **je Block per Messung** und schreibt die Wahl ins Verzeichnis.
> **Befunde am echten Datum:** (1) Die Cube-Verortung stimmt und **belegt nebenbei den Algorithmus**: `hModEff` im Flachland
> ±7–18 m, in Zermatt **+718 m**, an der Zugspitze **−938 m** — genau das `h_true − h_mod_eff`,
> das PAP 4 korrigieren soll (4,7 K in Zermatt). (2) `decompressBz2` ist **asynchron**; ein
> vergessenes `await` meldete 147 Abrufe, 160 MiB und **alle 48 Felder als „fehlend"** — die
> Wiederholschleife unterscheidet jetzt Netzabbruch von Dekodierfehler. (3) `git commit --amend`
> machte den **Manifest-SHA ungültig** (Log 808da93, Manifest 25e90c6) ⇒ zwei Commits statt Amend;
> dazu `.gitattributes` mit `*.bin -text`, weil ein CRLF-verfälschter Chunk erst am CRC beim Nutzer
> auffiele. (4) `git add` mit einem Pfad, den es nicht gibt, **bricht den Lauf ab** — der Publisher
> übergibt nur existierende. (5) `git add` in einem **sparse** Checkout verwirft außerhalb der Muster
> **still, mit Exit 0** — ein Lauf hätte gerechnet und nichts committet; Kur doppelt: passende
> Muster in der Vorlage UND ein Abbruch im Publisher mit der Kur im Klartext. Nebenbei: die Vorlage pushte zweimal, wodurch der jsDelivr-Purge (im Publisher
> HINTER dem Push) nie erreicht worden wäre — jetzt pusht genau eine Stelle.
> ✅ **VERÖFFENTLICHT (2026-09-09, §29).** Auf Jans „sodass all diese Daten in buscosun-data
> erscheinen" liegt `point/2026090912/` im Daten-Repo: **276 Chunks, 53,27 MiB, ein Lauf, ein
> Manifest**, Datencommit `2e96e22`, jsDelivr-Purge 200. Am CDN nachgemessen (`npm run
> point:check-cdn`): beide Wege (`@commit` und `@main`) liefern **byte-gleich**, die CRC im
> Containerkopf hält, `core.autocrlf=true` im Daten-Repo schadet nicht, weil `.gitattributes`
> mit `*.bin -text` vor dem `git add` steht (einzeln gegen den Git-Blob geprüft).
> **Der erste echte Push hat einen Fehler aufgedeckt, den kein Probelauf zeigen konnte:** der
> Push wurde abgewiesen (der Radar-Spiegel war schneller), die Wiederholung rebasete — und
> **ein Rebase schreibt jeden eigenen Commit neu**, auch den Datencommit, den das Manifest
> schon genannt hatte. `index.json` nannte `bcaeef5`, im Repo stand `fbdd1c3`; jsDelivr
> antwortete auf den gepinnten SHA mit **404**, während `@main` byte-gleich auslieferte. Die
> Zwei-Commit-Regel schützt gegen `--amend`, nicht gegen einen Rebase dazwischen. Die schärfere
> Regel: **ein SHA ist erst unveränderlich, wenn er auf dem Remote steht** ⇒ Datencommit →
> pushen → SHA lesen → Manifest → zweiter Push (wird der rebaset, macht es nichts: er nennt,
> er wird nicht genannt), plus eine Gegenprobe, dass der genannte Commit existiert, das
> Lauf-Manifest trägt und auf `origin/main` liegt. Nebenbei geschlossen: nach einem Probelauf
> hätte `POINT_PUSH=1` bei „Nichts zu committen" ausgesteigen — **der Schalter hätte nie
> feuern können**.
> **Zwei Gegenproben an den Zahlen, weil „es hat gerechnet" nichts über Richtigkeit sagt:**
> nur **0,41 %** der `t2m_sd`-Werte sind exakt null (also vier echte Quellen, keine vier
> Kopien); und `srcCount` reproduziert **exakt die Publikationstakte**, ohne dass ein Takt
> hinterlegt wäre — 2 Quellen in den 32 Stunden, die nicht durch 3 teilbar sind (nur die zwei
> stündlichen ICON), 3 bei 3/9/15/… (+ IFS, dreistündlich), 4 bei 0/6/12/… (+ AIFS,
> sechsstündlich). ⚠ **Derselbe Befund als Warnung:** in zwei Dritteln der t1-Stunden steht
> σ_div auf nur zwei Quellen, **und beide sind ICON** — dort misst σ weitgehend die
> Auflösungsdifferenz, nicht die Meinungsverschiedenheit unabhängiger Zentren (PAP 6, §29.3).
> **`buscosun-web` ist committet und gepusht** (`388c9ac`, Fix `f8342d2`) — nötig, weil der
> Cron den Producer bei jedem Lauf frisch von GitHub klont (`scripts src package.json`).
> **§30 — den Cron nachgebaut statt angenommen, und das hat einen Abbruch verhindert:**
> frisch von GitHub geklont, sparse ausgecheckt, Gate gelaufen ⇒ **230/231, `QUELLENMATRIX.md`
> fehlt**. Die Matrix IST committet, sie liegt nur in der **Wurzel** und war nicht im
> sparse-Set — und weil das Gate im Job **vor** dem Ingest steht, wäre **jeder planmäßige
> Lauf abgebrochen, bevor er ein Byte zieht**. Lokal unsichtbar, weil hier immer der volle
> Baum liegt: wieder „geprüft wurde der Bauplan, nicht das Bauwerk", diesmal die *Umgebung*
> statt des Ausgabebaums. Kur an beiden Enden: die Vorlage holt die Datei mit **und prüft es
> mit `test -f` nach** (ein sparse-Muster, das nichts trifft, meldet nichts — dieselbe Stille
> wie beim `git add`), und eine fehlende *Dokumentations*datei ist jetzt ein Überspringen mit
> Hinweis statt eines Fehlschlags; CI hat den vollen Baum und erzwingt weiter. Am gepushten
> Stand belegt: Klon `f8342d2`, Matrix 10 349 B, **28 Namen aufgelöst, 235/235, Exit 0**
> (lokal 238 — die drei Mehr sind die, die einen Baum unter `data/point` brauchen und sonst
> **hörbar** übersprungen werden).
> ⚠ **Es fehlt genau ein Schritt, und der ist Jans:** `workflow-point.yml` von Hand nach
> `.github/workflows/point.yml` im Daten-Repo (`MANUELLE-SCHRITTE.md` §13; eine Action darf
> ohne `workflows`-Scope keine Workflow-Datei pushen). Bis dahin ist der veröffentlichte Lauf
> ein Einzelstand und altert.
> **Werkzeugfalle zum dritten Mal in dieser Phase:** `[^
]` in einer Regex wurde durch die
> Python-in-Bash-Kette zum echten Zeilenumbruch und hat den Verifier zerschossen. Kur wie
> festgelegt — Edit-Werkzeug und `NEWLINE`-Konstante, hier ganz ohne Regex.
> Dazu **E-19** (§27.3): die Punkt-Slots (:10 der Stunden 02/08/14/20) laufen ins
> Publish-Fenster der Kartenlinie (:30 derselben Stunden) — `publish-repack.mjs` klont,
> wirft `.git` weg und **force-pusht**, was dazwischen ankommt, ist spurlos weg. Der Publisher
> sieht deshalb nach dem Push nach und purgt das CDN **nur, wenn die Dateien wirklich auf
> `origin/main` stehen** (sonst ersetzte der Purge die letzte gute Fassung durch eine 404).
> Vorschlag: Slots auf `10 1,7,13,19` — gleiche Modelllage, keine Überschneidung.
> Gute Nebenwirkung desselben Force-Pushes: **die Historie wächst nicht** (sie wird achtmal
> täglich ersetzt), das Repo bleibt bei Arbeitsbaum-Größe ≈ 200–260 MiB.
> **Danach (Jans dritter Auftrag): die ganze Quellenmatrix abbilden — PD3–PD5 begonnen (§23).**
> Befund, der es tragbar macht: die 19 Quellen sind **sechs Zugriffsfamilien**, nicht 19 Jobs.
> Drei davon sind umgesetzt und finden am echten Server ihren Lauf: DWD reguläres GRIB
> (ICON-D2, ICON-EU), DWD ikosaedrisch (ICON global, AICON — Nachbarindex über `clat`/`clon`,
> einmal je Stufe), ECMWF `.index` + Byte-Bereiche (IFS HRES, AIFS Single; die ENS-Kontrollläufe
> bewusst NICHT im Mittel, s. u.). Offen mit benanntem Grund: MOSMIX (Stationsquelle),
> C-LAEF und ICON-CH (Fremd-APIs), die EPS-Member, und die Radarquellen (liegen schon in `radar/`).
> **Stufe 3 gemessen** (126–150 h, vier Quellen): 12 Chunks, 0,21 MiB, **20 von 27 Ebenen mit
> Werten** — darunter zum ersten Mal echte σ-Ebenen. t2m 14,7–22,5 °C mit **σ 1,75–4,26 K**,
> Taupunkt überall unter der Temperatur, Bodendruck folgt der Modellhöhe (Hamburg 1 020,
> Innsbruck 865 hPa). Alle vier Konsistenzbedingungen aus PAP 6 halten ohne Nacharbeit.
> **Vier weitere Befunde, alle nur am echten Datum sichtbar:** (1) **AICON** benennt Schritte
> `PT003H00M.grib2` (ISO-Dauer, drei Stellen) unter `/p/<PARAM>/r/<ISO-Lauf>/s/` — geraten gibt
> es 404, und ein 404 sieht aus wie „Quelle hat den Schritt nicht". (2) **AIFS-ENS** hat kein
> `enfo-ef`, sondern `enfo-cf`/`enfo-pf` getrennt. (3) **ECMWF drosselt mit HTTP 429** — 36 HEADs
> je Stufe hintereinander; Kur: Taktung je Host, 429 als *wiederholbar* mit `Retry-After`, und
> Horizontsuche per **Halbierung** (36 Sonden → 6). (4) **IFS und AIFS benutzen für dasselbe Feld
> verschiedene Einheiten und sagen es im GRIB**: `tcc` cat 6/num **192** (0…1) gegen num **1**
> (0…100), `tp` cat 1/num **193** (Meter) gegen num **52** (mm). Ohne diese Unterscheidung stand
> für Wien **3 597 % Bewölkung** und **21 976 mm** im Cube — und `f_rad = (1 − clct/100)^a` wäre
> dauerhaft null gewesen, hätte also **sämtliche Geländeterme von PAP 5 abgeschaltet**, ohne eine
> Fehlermeldung. Die Einheit kommt jetzt aus der Parameter-Identität, nicht aus dem Modellnamen.
> Dazu zwei Design-Korrekturen: die **Ensemble-Kontrollläufe gehen nicht in den Mittelwert**
> (IFS-ENS-Kontrolle *ist* IFS HRES — als vierter „unabhängiger" Wert würde sie σ schrumpfen
> lassen, V-PD-9), und die Ebene `sigmaKind` ist zu **`srcCount`** geworden: sie stand überall auf
> `systematic`, weil `gust` mit nur einer Quelle die ganze Zelle vergiftete. Der PAP-6-Zweig ist
> **je Größe** aus den Daten ablesbar (`<var>_sd` vorhanden = Divergenz), die Ebene zählt jetzt
> die Quellen.
> ⚠ **Eine Beschreibung war strenger als die Rechnung und ist korrigiert:** die als „zweite
> Meinung" geführten Quellen gehen **mit gleichem Gewicht in den Mittelwert**, nicht „nur in σ" —
> eine Trennung bräuchte das gemessene Σ, das es erst mit `buscosun-archiv` gibt. Praktische Folge,
> am echten Lauf sichtbar: in t2 trägt ICON-EU kurz nach dem Lauf nur **5 von 24** Stunden, den
> Rest tragen die gröberen Globalmodelle — damit steckt in σ_div dort auch die
> **Auflösungsdifferenz**, nicht nur Vorhersageunsicherheit. Das Manifest sagt es jetzt als
> `fusion.resolutionCaveat` und je Quelle über `role` und `steps`; drei Verifier-Prüfungen halten
> die Aussage am Code fest. `verify:point-data` **238/238**.
>
> **Jans Entscheidung (2026-09-09): im Daten-Repo liegen nur Daten der letzten 24 Stunden,
> quellenunabhängig (§24).** Das begrenzt das ALTER eines Laufs, nicht seinen Horizont — ein Lauf
> von heute trägt weiterhin 0–336 h. Umgesetzt als **Alter statt Anzahl** (`RETENTION_HOURS = 24`,
> im Manifest), weil `keep: N` am Takt hängt; damit ist **E-4 erledigt**. Zwei Dinge waren daran
> nicht trivial: **mindestens zwei Läufe bleiben immer stehen** (fallen mehrere Publishes aus —
> V-BW-58 —, altern sonst ALLE heraus, und ein leeres Repo ist schlimmer als ein altes; überalterte
> Läufe werden BENANNT, nicht verschwiegen), und **die Register sind ausgenommen** — blind angewandt
> hätte die Regel `sources.json`, `calib.json` und `index.json` nach einem Tag mitgelöscht.
> `TIMELESS_PATHS` führt die Ausnahmen als Liste. Repo-Gewicht damit gedeckelt: ≈ 200–260 MiB.
>
> **Jans Entscheidung (2026-09-09): kein Geländeprodukt im Daten-Repo — „bei dem Repo geht es
> erstmal um Wetterdaten" (§25).** Ich hatte einen 300-MiB-Terrain-Stack (`terrain/`, COP-DEM +
> WorldCover als Kacheln) gebaut, den es nicht braucht: die Höhe kommt aus den **Terrarium-Kacheln,
> die die App für die 3D-Ansichten ohnehin lädt**, die Landbedeckung aus dem bestehenden Spiegel
> `jppetry/buscosun-worldcover`. TPI, Sky-View, Horizont und Hangneigung rechnet der Client **am
> Punkt** (`src/point/terrainPoint.ts`, 21/21 gegen analytisches Gelände) — ein Punkt braucht keine
> Fläche. Vollständig zurückgebaut: `terrainFormat.ts`, `build-terrain-tile.mjs`, `cogWindow.mjs`
> gelöscht, und `verify:point-data` prüft aktiv, dass **kein** Geländeprodukt zurückkommt.
> **Zweiter Befund desselben Abends (§25):** das reine-JS-`bz2` liefert bei manchen ICON-Läufen
> die **richtige Länge und falsche Bytes** (ICON global CLON 06z/12z bestehen die Längenprüfung
> und scheitern an der AEC-Dekodierung, 00z ist heil). Der Ingest bevorzugt jetzt das Binary,
> **verifiziert jede Dekodierung** und hält den Cache versioniert. Die Produktion war nie betroffen
> (`REPACK_BZIP2: '1'`) — aber `verify-repack.mjs` hatte Byte-Gleichheit aus **einer** Stichprobe
> behauptet; jetzt vergleicht er bis zu 40 Dateien, zählt Abweichungen und prüft die Aussage, die
> wirklich gilt: dass die Produktion das Binary benutzt.
>
> **§26 — ein Verzeichnis, eine Veröffentlichung, ein Manifest.** Der erste vollständige Bau über
> alle drei Stufen legte einen Konstruktionsfehler offen: jede Stufe schnitt ihre Chunks unter dem
> Lauf **ihrer eigenen Quellen** (t1 aus ICON-D2 12z, t2/t3 aus ICON global 06z), das Manifest lag
> aber unter dem neuesten. Ergebnis: `point/2026090906/` trug 68 Chunks und ein `run.json`, das nur
> t2 nannte — **zwölf t3-Chunks waren für jeden Client unauffindbar**. Im Verzeichnisnamen steckten
> zwei Begriffe, die niemand getrennt hatte: der **Quell-Lauf** (Eigenschaft der Stufe) und der
> **Publikationslauf** (Eigenschaft des Ablageorts). `placeUnderPublishRun()` legt jetzt alle Stufen
> unter einen Publikationslauf — reine Umbenennung, **kein Byte im Chunk ändert sich**, der Header
> behält sein `runHours` —, und jeder Stufeneintrag nennt `run`, `runAt` und `ageH`. Ohne diese
> Felder hielte man die Fernstufe für sechs Stunden jünger, als sie ist. Drei Wächter zählen jetzt
> nach: `verify:point-data` §3c (der Fall synthetisch auf dem Datenträger nachgebaut) und §3d (der
> echte Baum, wenn einer da ist — sonst wird der Abschnitt übersprungen **und das gesagt**), und
> der Publisher bricht **vor dem ersten Git-Befehl** ab, wenn ein Chunk ohne Manifesteintrag im
> Repo läge. Lehre, die über diese Linie hinausgeht: **ein Format-Selbsttest beweist nichts über
> den Baum, den der Producer schreibt** — 216 grüne Prüfungen und der Fehler lag im Ausgabeordner.
>
> Offen und benannt: **E-10** (die Ablaufpläne nennen 141 Zeitschritte, aus ihren eigenen Bändern
> ist die Zahl nicht rekonstruierbar — die abgeleitete Achse ergibt **109**), **E-11** (Profil-Ingest
> 1,13 GiB/Lauf), **E-16** (`sx_*` kosten 534 von 940 KiB je Alpenkachel für eine Vorschrift, die in
> keinem der beiden Dokumente steht ⇒ reserviert), **V-PD-5** (⚠² der Quellenmatrix lässt sich aus
> der Bounding-Box nicht nachrechnen: 40,2 km gemessen gegen 15–20 km behauptet).
>
> **Davor abgeschlossen (2026-09-09 vormittags): SH — „Auswahl teilen“; SH0–SH6 durch, Gates GSH1–GSH6 grün** (`audit/teilen-share.md`). Der Auftrag ist in allen vier Teilen umgesetzt: Zustand vollständig und lesbar in der URL, Teilen-Knopf mit Sheet und vier Kanälen auf acht der neun Feature-Seiten, und serverseitige Vorschau je geteiltem Zustand. Offen nur noch die freiwillige Stufe 2 (SH7: Vorschaubild zur Laufzeit) — **alle V- und E-Punkte der Phase sind erledigt** (V-SH-2 §21, V-SH-12 + E-7 §22, V-SH-13 §23).
> Jans Auftrag: Teilen-Knopf je Feature-Seite, Zustand vollständig UND lesbar in der URL, Share-Sheet
> (WhatsApp/Gmail/Mail/Kopieren), serverseitiges Vorschaubild. Kernbefund der Diagnose (SH0): der Zustand steht heute in **zwei** Formen in der
> URL — Query (Wetterkarte, Warnungen, Regenradar; `urlState.ts`, RT1) und **prozentkodiertes JSON im
> Fragment** (Waldbrand, Atmosphäre, Event, Historie, Globus); Tourenplanung, Vorhersage, Feedback und
> Validierung tragen gar keinen. **Ein Fragment erreicht den Server nie** ⇒ für fünf von neun Seiten ist
> ein zustandsbezogenes Vorschaubild heute grundsätzlich unmöglich, auch mit Edge Function. Gemessen
> (echte Codecs): Event 340, Globus 238, Waldbrand 195 Zeichen — alles unlesbarer JSON-Salat; das
> Zielschema `/<feature>/<ansicht>[/<ort-slug>]?<abweichungen>` bringt den Median auf **81 Zeichen**,
> größter Worst Case 513 (Atmosphäre mit 24-Punkt-Schnittlinie). Weiterer Befund: `ogImage` ist nur für
> `/wetterkarte` und `/atmosphaere` gesetzt — **alle anderen Seiten und alle 37 Sub-Routen zeigen
> `/og/home.png`**, obwohl der Kartenrenderer (`public/_og-card.html`, 74 PNGs) längst existiert.
> Etappen SH1–SH6 mit Gates und die offenen Entscheidungen E-1…E-7 stehen im Phasen-Dokument;
> `architecture.md` §2 (war noch Vor-RT1) und §15 sind nachgezogen.
> ⚠ **R2 gibt es in diesem Repo nicht** — der CDN-Weg ist `buscosun-data` über jsDelivr.
>
> **SH1 umgesetzt (Jans „starte", §14, uncommitted):** das reine Fundament `src/share/*`
> (Ort-Slug, Query-Schema v1, Textbau, Kanäle, Adapter-Registry), `npm run verify:share` **236/236**,
> und der **Ort als lesbares Pfadsegment** für die drei Query-Seiten:
> `/wetterkarte/temperatur/muenchen` (32 statt 76 Zeichen), `/regenradar/muenchen` (20 statt 90),
> `/warnungen/wien`. Dazu die schonende Kodierung (`t=2026-09-12T15:00Z` statt `…15%3A00Z`,
> `l=wind,stationen` statt `l=wind%2Cstationen`) und Zoom auf 1 Nachkommastelle.
> Der Ort-Slug ist **nie kanonisch** und **nie in der Sitemap** (sonst unendlicher Indexraum);
> ein Ortssegment gibt es **nur hinter einem bekannten Layer-Slug**, damit ein Tippfehler
> (`/wetterkarte/tempratur/muenchen`) eine echte 404 bleibt (V-101). `verify:routing` **235/235**,
> typecheck + Build grün, Budget eagerJs **107,3/107,9** (+1,0 KB — §10.9 hatte „kein Wachstum"
> zugesagt, das galt nur für den lazy Share-Chunk; Ortstabelle, Sperrlisten und alle `verify*()`
> sind per Textsonde am Bundle nachweislich NICHT im Start-Chunk). Browser-Beleg: alle drei Pfade
> mounten, Alt-Links werden einmal per `replace` auf die Slug-Form gezogen, ein unbekannter
> Ort-Slug fällt auf den DACH-Überblick zurück, Konsole leer.
> Fallen: `placeSlugs.json` trägt jetzt das **Land** als fünfte Spalte und braucht
> `with { type: 'json' }`; `land=` wird auch für Tabellenorte geschrieben, sobald es von DE
> abweicht — sonst fiele der RADOLAN-Frühstart (V-LE-12) für AT/CH still aus.
>
> **SH2 umgesetzt (Share-UI), Gate GSH2 grün:** Teilen-Knopf in den Topbars von Wetterkarte,
> Warnungen und Regenradar — Desktop-Popover, mobiles Bottom-Sheet, vier Kanäle (WhatsApp ·
> Gmail · mailto · Kopieren), mobil zuerst das **native** Teilen-Blatt. Der Zustand kommt aus
> `window.location` und wird mit **demselben** `parseShareUrl` ausgelegt, das ab SH6 die
> OG-Meta baut — keine zweite Zustandsquelle, und die Share-Logik hängt an keinem Renderpfad:
> `shareOpen-*.js` und `ShareSheet-*.js` erscheinen im Netzwerk-Mitschnitt **erst nach dem
> Klick**. `verify:share` **260/260**, `verify:routing` 235/235, typecheck + Build grün,
> eagerJs **107,5/107,9** unverändert gedeckelt, totalJs 1324 → **1330,9/1340** (Ratsche
> angehoben; 5,3 KB davon sind die zwei Klick-Chunks — der 13,6-KB-Chunk namens
> `ShareButton-*.js` ist der geteilte maplibre-Bucket beider Decks, nicht der Knopf).
> **Drei Fehler, die erst der Browser zeigte und die kein headless-Verifier fangen konnte:**
> das Sheet lag im Flex-Container des Decks (`.mdk-m-topfloat > div { display: flex }`) und
> wurde in eine Zeile zerlegt — `position: fixed` nimmt aus dem Fluss, aber nicht aus der
> Vererbung ⇒ jetzt `createPortal` an den Body (räumt zugleich die `transform`-Falle aus);
> ein hängendes `navigator.share()` blockierte den Knopf dauerhaft ⇒ `busy` deckt nur noch
> das Nachladen ab; `clipboard.writeText` kann ohne Dokument-Fokus hängen ⇒ 1,5-s-Frist mit
> ehrlichem „Kopieren ging nicht". Weggelassen, weil unerreichbar: der Sheet-Hinweis auf einen
> unauflösbaren Ort — die Wrapper bereinigen ihn schon beim Ankommen.
> **Offen aus SH2: die Empfängerseite von V-SH-2** — „der geteilte Zeitpunkt liegt in der
> Vergangenheit" gehört auch beim ÖFFNEN eines alten Links ins Readout, nicht nur ins Sheet
> des Absenders.
>
> **SH3 umgesetzt (Waldbrand + Atmosphäre aus dem Fragment), Gate GSH3 grün:** Der Zustand
> beider Seiten steht jetzt in Pfad + Query statt in `#wb=`/`#atm=`/`#3d=` — **die Etappe, die
> Teil 4 überhaupt erst möglich macht.** Neue reine Codecs `src/fire/fireUrl.ts` und
> `src/atmosphere/atmosphereUrl.ts`; die Wrapper `FireRoute`/`AtmosphereRoute` sind jetzt die
> **einzigen Schreiber** (Muster `WetterkarteRoute`), Seite und Store melden ihren Zustand per
> `onUrlState`. Alt-Links laufen weiter: das Fragment wird beim Ankommen einmal gelesen,
> übersetzt und per `replace` ersetzt (die alten Codecs bleiben als LESER).
> Gemessen: `…/waldbrand/aktive-braende#wb=%7B%22b%22%3A37124…%7D` (195) ⇒
> `…/waldbrand/aktive-braende?fenster=7t` (52); `#atm=…` (247) ⇒
> `…/atmosphaere/querschnitt/innsbruck?t=2026-09-13T00:00Z&nerd=1&schnitt=47.2,11.3;47.4,11.5&land=at` (88).
> `verify:share` **330/330**, `verify:routing` 238/238, typecheck + Build grün,
> eagerJs 107,6/107,9, totalJs 1334,6/1340.
> **Drei Befunde am Code, die den Plan korrigieren:** (1) das **Brandradar hat keine Ortswahl**
> (`FirePage` übergab fest `location: null`) — §3.9 sah ein Ortssegment vor, das es nicht gibt;
> (2) die **immer aktiven Layer** (`FIRE_ALWAYS_ON`) stehen in jedem Zustand und gehören deshalb
> nicht in die URL — `l=` führt nur die fünf schaltbaren; (3) **`?fenster=48h` verschwand
> spurlos**: `FIRE_LAYER_TIME` bietet nur `[24, 168]` an, `reconcileFireTime` klemmt alles andere
> sofort. Lehre wie bei V-BW-51: **das URL-Vokabular kommt aus dem Code, nicht aus der
> Plan-Skizze** — ein Verifier gegen selbst erfundene Werte ist grün und trotzdem falsch.
> Dazu eine vermiedene Regression: der alte Hash trug `fp`/`ta`, im neuen Schema ist der Reiter
> immer gesetzt — ohne `readoutExplicit` hätte das Brandradar mobil künftig auf dem Brände-Blatt
> statt auf der Karte geöffnet.
> V-SH-1 halb erledigt (die drei Atmosphären-Attrappen sind echte Knöpfe und stehen jetzt in
> JEDER Linse; der PDF-Knopf bleibt Attrappe = E-7). Damals neu, inzwischen erledigt (§19)
> **V-SH-11**: `decodeFireState` las ein Ort-Feld `l`, das nie jemand schrieb.
> **Offen: Empfängerseite von V-SH-2.**
>
> **SH4 umgesetzt (Event, Wetterarchiv, Globus), Gate GSH4 grün:** Die letzten drei
> Fragment-Seiten tragen ihren Zustand jetzt in Pfad + Query — **acht der neun Feature-Seiten
> sind teilbar**, nur die Tourenplanung kann es nicht (eine GPX passt in keine URL).
> Damit ist die Voraussetzung für Teil 4 erfüllt: eine Edge Function kann den Zustand lesen.
> Neue reine Codecs `eventUrl.ts`, `historyUrl.ts`, `globeUrl.ts`; die Wrapper sind die
> einzigen Schreiber, die Seiten melden per `onUrlState`, Alt-Links werden beim Ankommen
> übersetzt. Gemessen: Event **340 → 81** Zeichen (war der längste Link im Repo),
> Wetterarchiv 144 → 74, Globus 238 → 97.
> **V-SH-3 erledigt:** die Globus-Achsen stehen gerade — `#g=` speicherte `c`/`pin` als
> `[lon, lat]`, neu ist `lat,lon`; der Alt-Leser behält die alte Reihenfolge, sonst spränge
> jeder bestehende Link nach Asien (am Preview belegt). **V-SH-5 erledigt:** die vierte eigene
> `clipboard`-Stelle (`EventResult`) ist durch den gemeinsamen Knopf ersetzt.
> **Der lehrreiche Fall:** die Globus-Zeit war eine Vorhersagestunde ab dem GFS-Lauf, und der
> Lauf ist beim Mount noch **unbekannt** (er kommt asynchron mit dem ersten Frame). Die Seite
> merkt sich den gewünschten Zeitpunkt und rechnet ihn GENAU EINMAL um, sobald `RunInfo` da ist;
> ohne bekannten Lauf schreibt sie **kein** `t` — eine erfundene Gültigkeitszeit wäre schlimmer
> als keine. Weiter: beim Wetterarchiv steht der Ort an Segment 1 (die Seite hat keine Sichten),
> bei Atmosphäre/Event erst an Segment 2 — `shareAdapters` führt das als Tabelle statt es zu raten.
> Und das Archiv kennt kein Land (`HistoryLocation` hat `admin` statt `country`), also steht in
> seinen Links nie ein `land=`.
> `verify:share` **411/411**, `verify:routing` 238/238, typecheck + Build grün,
> eagerJs **107,6/107,9 unverändert**, totalJs 1339,7/**1350** (Ratsche angehoben; +8,8 KB über
> SH3+SH4 für fünf Codecs, alle in lazy Chunks — die alten Fragment-Codecs bleiben als LESER
> daneben stehen, das ist der Preis der Rückwärtskompatibilität).
> Neu **V-SH-12**: der Globus ist die einzige dunkle Oberfläche im Repo; sein Teilen-Knopf hat
> eine dunkle Glasfläche, das Sheet bleibt hell (Dialog in der App-Sprache) — Design-Entscheidung,
> kein Fehler. **Offen: Empfängerseite von V-SH-2** (V-SH-11 ist erledigt, §19).
>
> **SH5 umgesetzt (Vorhersage + Tourenplanung), Gate GSH5 grün — der Umzug ist damit fertig:**
> **acht der neun Feature-Seiten sind teilbar**, die neunte bewusst nicht.
> Die **Vorhersage** hatte gar keinen URL-Zustand (Ort, Tag, Diagrammgröße und Modellauswahl
> lagen in React-State und `localStorage`); jetzt: `/vorhersage/stuttgart?tag=2026-09-14&groesse=regen&ohne=gfs_seamless`.
> Der Tag steht als **Datum**, nicht als Index — ein Index zeigte morgen einen anderen Tag; ist
> der Tag durchgelaufen, bleibt die Seite bei „heute" und rät nicht. **V-SH-10 erledigt:**
> `localStorage` bleibt der Standard, die URL gewinnt (mit geleertem Speicher am Preview belegt).
> **Die Tourenplanung korrigiert §3.10 des Plans.** Vorgesehen waren auch Geschwindigkeitsprofil
> und Pausen — beides ist (1) nicht URL-förmig (`SpeedProfile` sechs Zahlen, `BreakConfig` sieben
> plus Liste, `EbikeConfig` sieben ⇒ `tempo=24,600,900,3,55,1&pausen=1,zeit,90,10,…`, genau die
> Zahlenkette, die Vorgabe B ausschließt) und (2) überflüssig, weil `selectType(id)` Profil UND
> Pausen aus `getMovementType(id).defaults` setzt. Der Link trägt deshalb nur, was etwas über die
> TOUR sagt und lesbar ist: `/tourenplanung/3d?art=gravel&start=2026-09-13T07:30Z&richtung=rueckwaerts`.
> **Und die Tourenplanung bekommt KEINEN Teilen-Knopf:** die Strecke passt in keine URL, der
> Empfänger sähe die Tour nicht — ein Knopf verspräche mehr, als er hält. Der URL-Zustand nützt
> dem, der selbst zurückkommt (Lesezeichen, Reload). E-4 lautete „Einstellungen ohne Strecke, mit
> ehrlichem Hinweis"; der ehrlichste Hinweis ist, den Knopf dort nicht anzubieten —
> **wenn Jan ihn trotzdem will, ist das eine Zeile.**
> `verify:share` **448/448**, `verify:routing` 238/238, typecheck + Build grün,
> eagerJs **107,6/107,9 unverändert**, totalJs 1342,1/1350. Konsole über alle Prüfungen leer.
> Damit war die Voraussetzung für SH6 erfüllt: eine Edge Function kann den Zustand jeder
> teilbaren Seite lesen. (Jans Freigabe E-6 kam am 2026-09-09 — s. den SH6-Absatz unten.)
>
> **V-SH-11 erledigt (§19): der Ort ist aus `fireState.ts` raus.** `decodeFireState` las ein Feld
> `l` (Ort) — und **kein einziger Commit hat es je geschrieben**: über alle elf Commits, die
> `FirePage.tsx` berühren, steht am Encoder-Aufruf `location: null`. Das Brandradar hat keine
> Ortswahl, es ist ein DACH-Flächenblick. Ein Leser ohne Schreiber ist schlimmer als toter Code —
> er sieht gepflegt aus. Entfernt: Feld, Encoder-Zweig, Decoder-Zweig, Helfer `r5`, Import; der
> Kopf sagt jetzt auch, dass die Datei seit SH3 **nur noch Alt-Links liest**. Ein handgeschriebener
> Link **mit** `l` bricht trotzdem nicht (das Feld wird überlesen) — zweifach belegt: netzfreier
> Selbsttest in `verify:fire-model` **123/123** und am Preview
> (`#wb=…%22l%22…` ⇒ `/waldbrand/gefahrenindex?fenster=7t`, kein Ort). share 448/448,
> routing 238/238, typecheck + Build grün, totalJs 1342,0/1350, `FireRoute` 281,6 → **281,5 KB**.
> **Konsole nicht leer, und das gehört gesagt:** acht Einträge, alle fremd — 1× Copernicus-EMS
> (`rapidmapping…`, interne Dashboard-API, still abgefangen) und 18× `404` von
> `warnungen.zamg.at`, weil die grobe AT-Hülle `AT_BOUNDS` Bayern und Baden-Württemberg
> überlappt. **Nebenbefund für die Waldbrand-Linie** (nicht hier behoben, ein Thema = eine Phase):
> die vergeblichen Abrufe verbrauchen den Deckel `MAX_LOOKUPS = 20` — an einem Tag mit vielen
> deutschen Detektionen bleibt für die österreichischen kein Kontingent.
>
> **SH6 umgesetzt (Open Graph, Stufe 1), Gate GSH6 grün — die Phase ist damit fertig.**
> Jans Freigaben vom 2026-09-09: **E-5** wie empfohlen (heller Rahmen, dunkles Kartenfeld)
> und **E-6** („Netlify Edge Function ist okay"). Ein geteilter Link zeigt beim Empfänger jetzt
> seinen eigenen Zustand statt der Startseiten-Karte:
> `…/wetterkarte/wind/muenchen?t=2027-01-08T15:00Z` ⇒ **„Wetterkarte München — Wind,
> Fr. 08.01. 16:00"** mit `/og/app/wetterkarte-wind.png`.
> **Drei Teile.** (1) **50 statische Karten** in `public/og/app/` (eine je Feature-Route und
> je Sub-Route, 1200×630, 4,5 MB) aus dem neuen Renderer `public/_og-app-card.html`, erzeugt
> mit `npm run og:app-cards`: heller Rahmen in Sand/Ink, dunkles Kartenfeld mit Motiv je
> Feature (Isolinien, Radarringe, Warndreieck, Höhenprofil …) und dem **Pfad der Seite** im
> Feld — derselbe Vertrauensanker wie der lesbare Link. Zur Laufzeit wird **nichts**
> gerendert; ein zustandsabhängiges Bild wäre Stufe 2 (SH7, eigene Phase).
> (2) **Ein Parser, zwei Laufzeiten.** Die Edge Function läuft unter Deno und kann den
> App-Baum nicht importieren (Deno verlangt Datei-Endungen an jedem Import). Statt einer
> zweiten Implementierung liegt DASSELBE Modul als Bündel daneben: `src/share/edgeShare.ts`
> → `npm run edge:share` (esbuild, war schon im Baum) → `netlify/edge-shared/shareParser.js`
> (50 KB, eingecheckt), Typen über ein `.d.ts`, das nur `export *` aus der Quelle tut.
> **`verify:share` baut das Bündel bei jedem Lauf neu und vergleicht byteweise** — ein
> vergessenes `edge:share` ist ein roter Verifier, keine Vorschau von vorgestern; der
> Verifier läuft ab jetzt auch in CI.
> (3) **`netlify/edge-functions/og-meta.ts`** auf den neun teilbaren Routen (Datei-Konfig wie
> `firms.ts`). Für Vorschau-Crawler tauscht sie `og:*`/`twitter:*` gegen die Beschreibung des
> Zustands; für alle anderen kehrt sie **vor** dem Lesen der Shell und **vor** dem Import des
> Parsers zurück. **Belegt mit `netlify dev` (echtes Deno) gegen den gebauten Stand:** die
> Antwort an einen iPhone-Safari ist `cmp`-**byte-gleich** zu `dist/wetterkarte--wind.html`
> (12 934 B, kein `x-buscosun-og`, kein `Vary: User-Agent`); Crawler und Mensch unterscheiden
> sich in genau 15 Zeilen (og:title, og:url, twitter:title, og:image:width/height).
> Sieben Seiten, sieben verschiedene Vorschauen; `/tourenplanung`, `/wissen/…`, `/wetter/…`
> und `/` bleiben unberührt. Kaputte Query, unauflösbarer Ort-Slug, 1600-Zeichen-URL und
> Nicht-HTML ⇒ Shell unverändert, nie ein Fehler.
> **Drei Abweichungen vom Plan, alle begründet:** kein `durable`-Cache (die Antwort hängt am
> User-Agent — eine gecachte Fassung ohne exakt passendes `Vary` könnte die Crawler-Antwort
> an Menschen ausliefern; `Vary: User-Agent` zersplittert den Cache ohnehin); `og:url` trägt
> den Zustand, `rel=canonical` bleibt der Routenpfad; und statt 49 `ogImage`-Literalen in
> `routes.ts` (§8 des Plans) entscheidet **eine Regel** `ogCardPath()` in
> `src/share/ogCard.ts`, die Renderer, Shell-Generator, Edge Function und Verifier teilen —
> die zwei toten Felder `RouteMeta.ogImage` und `SubRoute.ogImage` (letzteres nie
> geschrieben, dasselbe Muster wie V-SH-11) sind entfallen.
> **Zwei Fehler, die erst die ECHTE Crawler-Antwort gezeigt hat:** `Number(null)` ist **0**,
> nicht `NaN` — seit SH3 bekam jede Durchreiche-URL mit Ortssegment ohne Koordinatenpaar
> (`/vorhersage/stuttgart`) still einen Ort auf **0°/0°** im Atlantik (der Name kam aus der
> Tabelle, deshalb sah alles richtig aus; sichtbar wurde es erst am Cache-Schlüssel
> `o:0.00,0.00`). Und die geteilte Zeit verlor eine Minute: `parseShareUrl` rechnete sie über
> die **Slider-Stunde** zurück, die `parseMapSearch` auf 10-Minuten-Schritte **relativ zu
> jetzt** rundet — aus `t=…T15:00Z` wurde „15:59". Jetzt wird `t=` absolut gelesen. Beides mit
> Regressionsprüfung. Drittens die Zeitzone: eine Edge Function läuft in UTC, also nehmen
> `formatWhen`/`shareCopy`/`describeShareState` eine Zone und die Function übergibt
> `Europe/Berlin` (eine Zone für ganz DACH).
> **Nebenbefund an der Werkzeugkette:** `chrome-headless-shell --screenshot=…` — das Rezept
> aus `docs/seo-geo/og-images.md` — **tut nichts mehr**: gemessen mit Chrome 147 UND 148,
> Status 0, `--dump-dom` liefert HTML, es entsteht **keine Datei**. Ersatz ist
> `scripts/lib/headlessShot.mjs`: EIN Browser über das DevTools-Protokoll mit dem
> `WebSocket`, den Node 22 mitbringt (keine neue Abhängigkeit, 50 Karten in ~90 s). Doku
> korrigiert.
> `verify:share` **491/491** (SH1–SH5 waren 448), routing 238/238, verify:seo 803/803,
> typecheck + Build grün, **eagerJs 107,7/107,9 — Ratsche unverändert** (der erste Anlauf
> kostete +0,4 KB, weil `hasOgCard()` die Schlüssel der Stil-Tabelle las und Rollup damit
> Akzente und Motive in den Start-Chunk zog; nach der Trennung in `OG_CARD_ROUTES` und
> `OG_CARD_STYLE` bleiben +0,1 KB), totalJs 1342,2/1350.
> **Damit ist der Auftrag in allen vier Teilen umgesetzt.** Offen und nicht blockierend:
> V-SH-2 (Empfängerseite des Zeit-Hinweises), V-SH-12 (helles Sheet auf dem dunklen Globus),
> E-7 (PDF-Attrappe der Atmosphäre) und die freiwillige Stufe 2 (SH7, Bild zur Laufzeit).
> **Ein manueller Schritt bleibt Jan:** die Vorschau am echten Deploy prüfen (WhatsApp an
> sich selbst, Facebook-Sharing-Debugger) — `MANUELLE-SCHRITTE.md` §12.
>
> **V-SH-2 erledigt (§21): der Hinweis steht jetzt beim EMPFÄNGER.** Ein geteilter Link trägt
> einen absoluten Zeitpunkt; wird er später geöffnet, klemmte jede Seite still auf „jetzt"
> bzw. „heute". Gewarnt wurde nur der Absender (SH2) — der Kopfkommentar in `urlState.ts`
> versprach seit SH2 wörtlich „die UI kann das ab SH2 benennen", und keine UI tat es.
> Neu: `src/share/StaleLinkNotice.tsx` (1,1 KB, eigener lazy Chunk, Portal an den Body) auf
> Wetterkarte, Warnungen, Brandradar, Atmosphäre und Globus —
> „Geteilter Zeitpunkt: Mi. 09.09. 07:00 — vorbei. Angezeigt wird die Lage für jetzt.",
> beim Brandradar „Geteilter **Tag**: Mo. 07.09. … Angezeigt wird **heute**.", beim Globus
> „… **der aktuelle Lauf**." Jede Seite sagt, was BEI IHR stattdessen gilt; ein Einheitssatz
> wäre für den Globus unwahr. Das Regenradar bekommt keinen (es hat gar keine `t`-Achse).
> Dafür mussten die vier Parser mehr sagen: `timePast: boolean` hieß „es war einer", aber
> nicht WELCHER — jetzt liefern sie `pastAtMs`, und ein Selbsttest hält beide zusammen
> (`timePast` ⟺ `pastAtMs != null`).
> **Zwei Entscheidungen fielen beim Bauen anders aus:** (1) Der Hinweis **verschwindet nach
> zwölf Sekunden**. Bleibt er stehen, wird er zur Lüge, sobald der Empfänger die Zeit selbst
> verstellt — „angezeigt wird die Lage für jetzt" stimmt dann nicht mehr, und ein falscher
> Hinweis ist schlimmer als keiner. (2) **Mobil steht er oben, nicht unten**: unten lag er
> genau auf dem Zeit-Schieber (am iPhone-12-Pro-Bild gesehen). Auf dem Desktop wanderte er
> zweimal — 72 px verdeckte die Modellzeile, 118 px die **Quellenangabe**; jetzt 176 px
> (Desktop) / 122 px (mobil), an den Unterkanten der Chips gemessen.
> `verify:share` **512/512**, routing **240/240**, fire-model 123/123, typecheck + Build grün,
> eagerJs 107,8/107,9 (Ratsche unverändert), totalJs 1343,7/1350. Vier Seiten am gebauten
> Stand belegt (Screenshots), Gegenprobe „Zeit in der Zukunft ⇒ kein Hinweis", Konsole auf
> Karte und Atmosphäre leer, auf dem Brandradar dieselben fremden Fehler wie in §19.4.
> **Bewusst hingenommen:** auf dem Brandradar mobil überlappt der Hinweis für seine zwölf
> Sekunden die Sortier-Chips der Brandliste — Bedienelemente, keine Wahrheitsangaben.
> **Neuer Befund V-SH-13 (nicht behoben):** die andere Richtung. Eine geteilte Zeit in der
> **Zukunft** jenseits des Layer-Horizonts wird ebenfalls still geklemmt (gemessen
> 2026-09-09 11:10 UTC: `+3 h` und `+11 h` landeten beide bei `+2 h`). Beim Senden unmöglich,
> beim Empfangen genau dann, wenn der Lauf zurückliegt — der Fall aus V-BW-58. Die Kur
> braucht eine Rückmeldung aus `MapView`, dass die Stunde beschnitten wurde: eigene Etappe.
>
> **V-SH-12 und E-7 erledigt (§22) — beides waren Entscheidungen, keine Fehler.**
> **V-SH-12:** Sheet und Hinweis haben auf dem **Globus** jetzt eine dunkle Fassung (er ist die
> einzige dunkle Oberfläche im Repo; ein weißes Rechteck auf der nachtblauen Kugel sah aus wie
> ein Fremdkörper). NICHT gebaut wurde eine zweite Optik: die Palette liegt jetzt EINMAL als
> `--shp-*`-Variablen auf `.sh-sheet, .sh-stale`, und `--dark` tauscht nur diese Werte — die
> dunklen sind die Glasflächen und Textfarben aus `globe.css`, keine neuen Farben. Weitergabe
> als `tone="dark"` (ShareButton → ShareSheet → StaleLinkNotice). **Der eigentliche Beleg ist
> die Gegenprobe:** die helle Fassung auf der Wetterkarte ist nach der Umstellung
> **wertgleich** (Fläche rgb(250,246,234), Text rgb(44,42,38), Ziel #fff, Eyebrow
> rgb(168,94,46)) — kein Pixel Unterschied auf acht der neun Seiten.
> **E-7:** der PDF-Knopf des Arbeitsfensters war seit dem Redesign eine Attrappe ohne
> `onClick`, während die Bildunterschrift daneben einen Export versprach. Von den drei Wegen —
> PDF-Bibliothek (neue Laufzeit-Abhängigkeit ⇒ STOPP & FRAGEN, ~100 KB), Knopf entfernen, oder
> der **Druckweg des Browsers** („Als PDF speichern") — ist der dritte gebaut:
> `src/atmosphere/GoNoGoReport.tsx` hängt per Portal am Body, ist am Schirm `display: none` und
> im Druck das EINZIGE (`#root` wird ausgeblendet). Auf dem Blatt steht genau die Zusage —
> Ort (der **exponierteste Anker**, nicht das Ortszentrum: derselbe Punkt, den
> `evaluateGoNoGo` rechnet), Zeitfenster, Modelllauf, Arbeitshöhe, Grenzwert, Status, Werte,
> die Fenster über dem Limit, Quelle samt α, der Link — plus „keine amtliche Freigabe".
> **Beim Bauen dazugekommen:** der Status gilt für JETZT, also nennt die Statuszeile das
> **nächste** Fenster über dem Limit. Ein großes „GO" über einem No-Go-Fenster, das in einer
> Viertelstunde beginnt, liest sich auf Papier wie eine Freigabe für den Tag; am Schirm sieht
> man das Band daneben, der Ausdruck muss es sagen.
> `verify:route-3d` **587/587** (23 neue E-7-Prüfungen), share 512/512, routing 240/240,
> seo 803/803, typecheck + Build grün, eagerJs 107,8/107,9 (Ratsche unverändert),
> totalJs 1345,6/1350. Druck-Isolation in BEIDEN Medien gemessen (`Emulation.setEmulatedMedia`:
> print ⇒ `#root` none / Bericht block, screen ⇒ umgekehrt); der Inhalt des Berichts aus dem
> echten Browser gelesen und gegen die Bildschirmwerte geprüft (31 km/h auf 120 m, Limit 40,
> Boden 19, Faktor ×1,6, „GO ab 18:15" ⇔ Fenster 14:15–18:15).
> **Ehrlich zur Lücke:** ein Druckbild MIT Inhalt gibt es nicht — Headless baut die
> Schnittlinie nicht (kein WebGL ⇒ keine Karte ⇒ kein Schnitt), der echte Browser kann kein
> Druckmedium emulieren, und `window.print()` öffnet einen modalen Dialog, der die Prüfsitzung
> blockiert. Inhalt und Druckoptik sind deshalb getrennt belegt.
> **Zwei Verifier-Befunde:** mein eigener Check schlug beim ersten Lauf falsch an (die Regex
> zählte die gerade verdrahteten Knöpfe als Attrappen — behoben); und **`verify:route-3d` war
> vorher schon rot**, ohne dass es jemandem aufgefallen war: „die Laufzeit-Abhängigkeiten sind
> unverändert **sieben**" ist seit dem MUI-Beschluss vom 2026-09-06 falsch (zwölf). Genau die
> fortgeschriebene Zahl aus der BW-1-Lehre. Die Prüfung vergleicht jetzt die **Liste** statt der
> Anzahl — dann sagt ein Fehlschlag auch, was dazugekommen ist.
> **Zwei Befunde außerhalb der Aufgabe:** (1) `fetchIncaPoint` hat **keine eigene Frist**
> (`fetch(url, { signal })`, und kein Aufrufer setzt eine) — beim Prüfen hingen zwei von sechs
> Ankerpunkten über vier Minuten auf `pending` (nicht „failed"), und das Arbeitsfenster stand
> dauerhaft auf „Wetterdaten an Ankerpunkten …". `AbortSignal.timeout` an dieser Stelle wäre die
> Kur; gehört in die Atmosphären-/Punkt-Linie. (2) **Parallelarbeit im selben Baum:** eine
> andere Linie schreibt gerade `src/point/*` + `scripts/point/*` (neue Skripte `point:cube`,
> `point:terrain`, `point:publish`, `verify:point-data`); ein Zwischenstand von
> `sourceMatrix.ts` hat `npm run typecheck` für Minuten rot gemacht — in einer Datei, die diese
> Etappe nicht berührt. Wer Gates abnimmt, muss wissen, dass der Baum nicht allein ihm gehört.
>
> **V-SH-13 erledigt (§23) — und die Diagnose hat den Befund gekippt.** Vermutet war „der
> Horizont des Layers ist zu kurz". Gemessen ist es der **Erstbild-Modus**: `START_NOW_ONLY`
> (default an) baut eine Zeitbasis von **drei** Stunden (`NOWONLY_AHEAD_H + 1`), und jede aus
> der URL wiederhergestellte Stunde jenseits davon wurde sofort auf +2 h gekürzt — dauerhaft.
> **Das Kontrollexperiment ist eindeutig:** derselbe Link mit `&startnow=0` kam korrekt bei
> 21:00 UTC an („Stand · Mi 23:00"). Die Daten waren da, nur das Fenster war zu kurz. Damit
> war ein Link auf „Wind, morgen 15:00" **gar nicht** wiederherstellbar — ein Loch in Jans
> Vorgabe „Deep-Link-Restore inklusive Zeit", seit es den Erstbild-Modus gibt.
> **Der Fix sind zwei Zeilen in `MapView.tsx`:** `forecastAheadHRef` startet auf der verlangten
> Stunde, und die Zeitbasis wird voll, wenn der Link über das Jetzt-Fenster hinaus verlangt.
> **Ohne `t=` ändert sich exakt nichts** (`initialHour` ist 0 ⇒ beide Zeilen liefern die alten
> Werte) — am gebauten Stand nachgeprüft: ein Aufruf ohne `t=` zeigt weiter „JETZT · MI 15:30"
> ohne Stundenmarken, also dieselbe kurze Basis; LZ1 ist unberührt. Und es lädt nicht mehr als
> nötig: `stepsForNowWindow` schneidet bei `jetzt + ahead` ab — ein Link auf +6 h holt sechs
> Stunden, nicht vierundzwanzig (billiger als der `startnow=0`-Weg).
> Jenseits der 24-h-Basis kürzt die Karte weiter — sagt es jetzt aber:
> `onHourChange(hour, 'clamped')`, und der Wrapper zählt nur die ERSTE Meldung nach dem
> Ankommen (eine spätere Kürzung kommt daher, dass der Nutzer selbst einen Layer abschaltet).
> **Der Hinweis nennt bewusst KEINE Ersatzzeit** — Korrektur eines Fehlers, den erst der
> Screenshot zeigte: der erste Entwurf schrieb „Angezeigt wird Do. 10.09. 14:20" (die
> Schieber-Stunde), während das Deck darunter „+23 H · **DO 02:00**" zeigte, weil der Windlayer
> nur so weit reicht. Zwei Zeiten, von denen eine falsch ist, sind schlechter als eine Aussage
> ohne Zahl.
> **Ein Feld statt zweier:** `pastAtMs` heißt in allen vier Parsern jetzt `wantedAtMs` („was
> der Link verlangt hat"), `timePast` sagt zusätzlich, ob es vorbei ist — V-SH-2 und V-SH-13
> brauchen denselben Wert, zwei Felder wären die zweite Wahrheit.
> `verify:share` **528/528** (13 neue Prüfungen), routing **241/241**, route-3d 587/587,
> typecheck + Build grün, eagerJs 107,8/107,9 (Ratsche unverändert), totalJs 1345,8/1350.
> Drei Fälle am gebauten Stand belegt (+8 h kommt an und schweigt · +30 h wird gekürzt und
> sagt es · ohne `t=` alles wie vorher), Konsole leer.
> **Aufgefallen, nicht behoben:** der Schieber kann weiter reichen als die geladenen Frames
> (`sliderMax` nimmt den Wolken-Horizont bis 12 h auf, das Fenster wächst im Erstbild-Modus nur
> auf 2 h) — wer dann zieht, sieht den nächstgelegenen Frame ohne Hinweis. Andere Ursache
> (Nutzer statt Link), Kur wäre Nachladen WÄHREND des Ziehens ⇒ Layer-/Ladezeit-Linie mit
> Messpflicht, nicht die Teilen-Phase.
>
> **Parallel offen (2026-09-08): PA0 — Punktarchiv für buscosun Fusion** (`audit/punktarchiv.md`, Diagnose +
> Plan, **kein Sammler-Code**). Anlass: Jans Frage, ob buscosun Fusion sein Ziel (0–336 h, jeder Punkt, besser
> als jede Quelle) erreicht — Antwort nein, und ohne Archiv der eigenen Vorhersagen ist es weder belegbar noch
> widerlegbar. Gemessen: Vorhersagen sind **nicht nachholbar** (MOSMIX_L 48 h, ICON-D2 ≈ 24 h, ECMWF 4 Tage
> online), Wahrheit schon (POI 24 h **auch für AT/CH-Stationen**, TAWES-Historie, SMN, CDC). Plan: Punkte
> statt Felder, Eingaben je Quelle + Fusion-Parameter + Altpfad je Slot als `json.gz` in
> `jppetry/buscosun-archiv` (existiert, leer), Sammler-Cron **dort** (Standard-Token, keine Workflow-Datei in
> buscosun-web), 4 Slots/Tag, ≈ 250 Punkte, ≈ 2 MB je Voll-Slot (Schätzung), IFS/GEFS als v1.1/v2.
> **Erster Push und Cron = Jans Gate; Entscheidungen E-1…E-7 in §9.** Die Vorläufer-Linie „Monatsarchiv der
> Repack-Läufe" (AR0/AR1, `archive-runs.mjs`, `audit/daten-archiv.md`) ist mit Jans Freigabe entfernt (§1.6).
>
> **Davor (2026-09-07): LZ1 — Ladezeit am Layer-Klick** (`audit/layer-ladezeit.md`).
> Diagnose LZ0: Dekodieren + GPU kosten 15–60 ms; dominant war der **kalte jsDelivr-TTFB** (p50 0,60 s,
> p90 1,43 s), weil der Publish je Lauf force-pusht und jede Bild-URL den Commit trug — fast jeder Klick
> ein MISS —, dazu der Index-Round-Trip nach 60 s (+93 ms warm, +1,36 s nach Purge). Umgesetzt (Jans
> „ja starte damit", uncommitted): **M4** Fetch im `toggle` vor dem Render, **M2** Index stale-while-
> revalidate (15 min) + `@main`-Bild-URLs mit 404-Rückfall auf den Commit, **M1** Edge-Warm-up im
> Publisher (413 URLs, Chrome-`Accept-Encoding` — wirkt erst nach dem Push von `publish-repack.mjs`),
> **M3** Prefetch der Jetzt-Schritte von Böen/Gewitter/Rotation/Schnee/Blitz im Leerlauf. Kill-Switch
> `?lz=0`. A/B lokal gegen das echte CDN: Böen kalt **765 → 156 ms**, Klick nach 65 s **502 → 386 ms**,
> vorgeladene Layer **≈ 180–220 ms** Desktop / **394 ms** iPhone-Emu (alt 665). Fallen: jsDelivr hält je
> `Accept-Encoding`-Variante einen Cache-Eintrag (curl ohne Header misst einen Cache, den kein Browser
> liest); ein Effekt an `nowcastTick` mit Cleanup bricht einen laufenden Prefetch je Tick ab. Offen: M5–M8,
> Prod-Nachmessung, Real-Device (Chrome-MCP/Extension waren nicht verbunden ⇒ Playwright-core).
>
> **Davor (2026-09-04): BW-13 — der Windlayer kommt vollständig aus dem Daten-Repo**
> (`audit/bandbreite.md` §32; davor BW-12 / Gate GBW12 in §31). Ausgangspunkt war Jans Frage nach den
> Netlify-Kosten: gemessen **218 Manifest-Commits in 7 Tagen ≈ 31 Produktions-Builds pro Tag** — für zwei
> Crons, die seit dem 2026-08-23 **gar nichts mehr wärmen**. Die Auszählung fand den eigentlichen Treiber:
> **46 von 136 grib-Commits (34 %) änderten nichts als den `eps`-Abschnitt**, den der Client ausdrücklich
> nicht liest. Zwei Sofortfixe nahmen ~26 % der Deploys weg, der Index-Weg den Rest: **der Client liest Lauf
> und Schritte aus dem `index.json` des Daten-Repos**, das er für die Bilder ohnehin holt. Beide
> Warm-Workflows sind still (`warm-grib.yml` nur noch `workflow_dispatch`, **`warm-wind.yml` gelöscht**);
> `?repackrun=0` ist der benannte Rückfallweg. **JSON-Abrufe vor dem ersten Bild 3 → 1, GRIB über Netlify 0,
> 0 Cron-Deploys** (belegt: nach dem Push fanden drei fällige Zeitplan-Läufe nicht statt).
>
> **BW-13** hat danach die zweite Quelle ganz entfernt: `/latest-wind.json`, sein Cron, sein Verifier und
> der Wind-Manifest-Resolver sind weg. Der Windlayer nennt Lauf, Schritte und Bytes aus EINER Datei —
> gemessen `/wetterkarte/wind` kalt: **0 Abrufe an Manifeste, 0 an `/_dwd_*`**, alles von `cdn.jsdelivr.net`.
> Zwei Wächter mussten dabei einzeln mitwandern (V-BW-59): der **Horizont-Guard** (`runCoversNow` — ein Lauf
> kann jung genug sein und trotzdem keinen Schritt für „jetzt" tragen) und der **Preconnect**, der im
> gelöschten Resolver stand. Als Notweg bleibt Directory-Scan + GRIB; er greift nur bei CDN-Ausfall.
>
> **Rückwirkend über 24 Zyklen gemessen** (§31.18): DWD publiziert Schritt 004 bei Lauf+50 min und 027 bei
> Lauf+67 min, der Repack-Batch landet 1–2 min später — der Index-Weg ist damit **15–30 min früher** am neuen
> Lauf als der alte (Manifest mit Abschnitt: Median Lauf+80,5 min, plus Build). Ausbreitung Daten-Repo →
> jsDelivr am baren Pfad: **≤ 1,1 min**, im ungünstigen Fall einer 4,4 h alten Cache-Kopie.
>
> ⚠ **Offener Folgebefund (V-BW-58), jetzt der wichtigste:** `scripts/publish-repack.mjs` pusht genau EINMAL
> ohne Wiederholung, während der Radar-Spiegel im selben Repo alle 1–2 min pusht. Am 2026-09-04 scheiterte
> der Publish **dreimal** (10:07, 16:07, 17:32 — immer der Schritt „Publish", 16–18 s); 09z kam 84 min zu
> spät, **15z fiel ganz aus**, die Karte stand sechs Stunden auf 12z. Seit BW-13 ist das Daten-Repo für den
> Windlayer die einzige reguläre Quelle — der Fehler ist dadurch dringender geworden. Kur: der
> Commit-back-Loop aus `warm-grib.yml` (T2c). Zweiter offener Posten: **`relhum_2m`** (Feuerwetter) hat keine
> Repack-Familie und zieht ≈ 27 MB roh über Netlify je Kaltaktivierung.
>
> **Kritische Fallen dieser Linie:** die Schrittliste des Index enthält **Objekte** `{step,file,…}`, keine
> Zahlen — eine Fassung mit `Number.isInteger` war gegen synthetische Fixtures grün und gegen die
> Wirklichkeit für jede Familie `null`; ein **abgebrochener** Abruf ist kein Befund über seine Quelle
> (`AbortError` wurde als `absent` gemeldet und hinterließ einen Fehlalarm); wird eine Quelle durch eine
> andere ersetzt, **muss die Gesundheitsanzeige mitwandern** (`manifestHealth` kennt jetzt `primary`); und
> eine **Messsonde, die ihre eigene Quelle drosselt, misst nichts** (45-s-Polling auf die GitHub-API, 60/h).
> `verify:repack` **348/348** (LZ1), routing 105/105, health 20/20, datenalter 54/54, warm-budget 30/30,
> layer-erstbild 37/37, typecheck + Build grün, totalJs 1089,3/1109,8 KB.
>
> **Drei wiederkehrende Mess-Lehren der Satelliten-Linie (SAT2h) gelten weiter:** ein Mikro-Prüfstand mit
> mehreren Varianten in EINEM Isolat misst nur *Verhältnisse*, keine Absolutwerte (⇒ ein Isolat je Variante);
> ein Leistungsanker misst immer auch die Maschine mit (Vergleiche nur innerhalb eines Laufs oder mit
> genannter Last); und Byte-Gleichheitstests brauchen eine Negativ-Kontrolle, sonst beweisen sie nichts.
> Dazu aus BW-12/13: eine Hochrechnung aus EINEM beobachteten Fall ist keine Messung (die „ein Drittel der
> Deploys"-Schätzung wurde beim Auszählen zu 13 % bzw. 0 %); **synthetische Fixtures müssen die echte
> Datenform tragen**; und eine Frage nach *zeitlichem* Verhalten braucht nicht immer ein Beobachtungsfenster —
> DWD-Verzeichnisse, Actions-Läufe und Git-Verläufe sind rückwirkend lesbar. PowerShell-Fallen:
> `Set-Content -Encoding utf8` kodiert eine BOM-lose UTF-8-Datei doppelt, und `node … 2>&1 | Out-File` macht
> aus stderr-Warnungen ErrorRecords und liefert Exit 1 — Verifier nie mit `2>&1` starten.
>
> **Historie:** Die vollständige Chronik jeder früheren Phase (Diagnose, Messwerte, Gate-Belege) steht
> in den jeweiligen `audit/<thema>.md`-Dateien — Übersicht in der Dokumenten-Landkarte unten und in
> den persistenten Session-Memories. Diese Kopfzeile hält bewusst nur den *aktuellen* Stand fest;
> Vergangenes gehört nach `context.md`/Git, nicht hierher (s. „Harte Regeln“).
>
> ⚠ **Bekannter Repo-Zustand (seit 2026-08-17):** `plan.md`, `checklist.md`, `context.md`,
> `mobile-design-guidelines.md`, **`roadmap.md` und `improvements.md`** fehlen im Arbeitsverzeichnis
> (Stand 2026-09-04 nachgeprüft). Bis zur Wiederherstellung gelten die `audit/*.md`-Dateien als Gate-Belege;
> V-Einträge (D-28) landen bis dahin im jeweiligen Phasen-Dokument. Alle Client-Änderungen seit 2026-07-30
> sind uncommitted, sofern nicht ausdrücklich vermerkt. Sessionspezifische Missionen stehen in
> `plan.md`/`prompt.md`, falls vorhanden.
>
> **Parallel offene Linie SEO/GEO (2026-09-04, wartet auf Jans Freigabe für Stufe 2):** Inventar, Audit und
> 11-Etappen-Plan liegen als `FEATURE-INVENTAR.md`, `SEO-AUDIT.md`, `SEO-PLAN.md`, `KEYWORDS.md`,
> `GEO-TESTSET.md`, `VERIFY.md` in der Repo-Wurzel (untracked, kein Code). Bekannte, noch nicht behobene
> Text-Defekte, die der Plan in Etappe 0 fasst: die Waldbrand-Metatexte in `src/router/routes.ts` bewerben
> zwei zurückgezogene Layer („amtliche Landesstufen", „Ausbreitungsrichtung"); der Wetterkarten-Lead
> verspricht Modellwahl und Zeit-Schieber, die im Erstbild wegen `START_NOW_ONLY` (`MapView.tsx`) erst
> nach dem ersten Slider-Zug erscheinen.

## Projekt

**buscosun** (Produktion: buscosun.com; die Kanonik ist seit 2026-09 durchgängig `.com` — Canonicals,
Sitemap, OG, `llms.txt`, robots; der frühere `.app`-Defekt ist behoben) ist eine DACH-fokussierte
Wetter-Visualisierungsplattform: reine Frontend-Web-App
ohne Backend, alle Wetterdaten werden **client-seitig** geholt und dekodiert (handgeschriebener
GRIB2-Decoder inkl. CCSDS-AEC).

**Mission:** buscosun zur führenden Wetterplattform im DACH-Raum ausbauen — Referenz in Qualität,
Nutzererlebnis, Geschwindigkeit, Genauigkeit, Innovation und Zuverlässigkeit. Zielgruppen-Fundament:
`docs/zielgruppen-dach.md`.

**Bereits umgesetzte Feature-Linien** (Details je in eigenem `audit/*.md`, s. Tabelle unten): Wetterkarte
mit 19 Layern + Fusion/Modell-Switcher; pfadbasiertes Routing (RT1); Regenradar auf denselben Layer-Modulen
wie die Wetterkarte (RL1); Bandbreiten-Linie BW-0…BW-11 (Netlify-Traffic für Wetterkarte + Regenradar über
jsDelivr-Repack + eigenes Daten-Repo praktisch auf 0 gebracht, inkl. Radar-/KONRAD-Spiegelung RD0–RD3);
komplette Waldbrand-/Brandradar-Linie (FIRMS/EFFIS-Grundlage, Brandflächen-Panel BP1–BP5, Aktiv-Feuer-Dynamik
AF1–AF4, Ausbreitungsrichtung SF1, Thermalanomalien-Trennung TA, Brand-Historie BH1–BH6, Brand-Dossier
BD1/BD2, Satellitenbilder SAT0–SAT2h vorher/nachher inkl. 10-m-COG-Viewer/SWIR/dNBR/SCL/WorldCover);
Geo-Versatz aller Kartenlayer auf ≤ 1 m korrigiert (KL0–KL11); 3D-Tourenansicht mit Schnitt- und
Geländebühne (R3D); Event-Fläche + Terrain-Bühne für die Eventplanung (EZ, ET); Layer-Ladezeit-Optimierung
(LE0–LE2). **Nicht mehr im Code** (bewusste Rückzüge mit Jans Freigabe): Feuerwetter/`fireSpread`-Rasterfläche,
`fireWind`/`fireDrought`/`fireVegetation`, „Amtliche Stufe" (`fireIndexNational`) — betroffene Bits bleiben
`null` reserviert.

> **Sonderregel für den Warn-Layer:** `warnings` ist der einzige Layer, der ein **amtliches Warnprodukt IST**;
> alle anderen verweisen darauf. Dort ist Warnsprache korrekt — aber **ausschließlich als wörtliches Zitat**,
> nie zusammengefasst, umformuliert, verschärft oder abgeschwächt. Zusätzlich gelten die Lizenzauflagen in
> `docs/API.md` §7. Dieselbe Zitatregel gilt für GeoSphere-Warntexte im Waldbrand-Kontext.

**Repo-weite Lehren aus der Waldbrand-Linie (gelten überall):**
1. **WFS-`maxfeatures` schneidet die jüngsten Datensätze ab**, nicht die ältesten — nie serverseitig deckeln;
   im Client nach dem BBox-Filter, jüngste zuerst.
2. **Der MapServer spiegelt die BBox-Achsenreihenfolge in die Ausgabe-Geometrie** — Anker prüfen die
   zurückgegebenen Koordinaten, nie Zählstände (`src/fire/sources/wfsAxis.ts`).
3. **`setData` auf `idle` ist eine Endlosschleife** — nur bei geänderter Referenz setzen.
4. **„Bestätigt"** braucht immer eine Quelle im selben Satz (EFFIS-Kartierung, EMS-Aktivierung). MoWaS wird
   nicht ausgewertet, nur verlinkt. „Unbestätigt" ist der Normalfall und wird so gesagt.
5. **Keine unklare Lizenz, keine NC-Klausel, kein Scraping** — Quellen ohne klare Lizenz oder mit NC-Klausel
   sind reine Deep-Links.

## Stack (verifiziert am Code, Stand 2026-07-31)

- React 19 + Vite 6 + TypeScript 5.7, MapLibre GL 5.6. Runtime-Dependencies nur: `maplibre-gl`, `react`,
  `react-dom`, `bz2`, `bzip2-wasm`, `jsfive`. Kein Router-Package außer `react-router` (seit RT1), keine
  State-, HTTP-, Chart-Bibliothek.
- **Nicht (mehr) im Code, auch wenn Alt-Doku es behauptet:** kein Three.js, **kein WebGPU** (nur WebGL —
  alle 3D-Ansichten sind MapLibre-Custom-Layer mit eigenen Shadern), kein WebLLM/KI-Meteorologe
  (`src/assistant` existiert nicht), kein Cloudflare R2/PMTiles, kein „AdaptiveQualityController" (real:
  `FrameGovernor` in `src/wind/perfGovernor.ts`).
- Hosting: Netlify (statisch + 4 Edge Functions: `/_dwd_wind`, `/_dwd_grib`, `/_firms` als gehärtete
  Cache-/Schlüssel-Proxys, dazu seit SH6 `og-meta` auf den neun teilbaren Routen — sie schreibt NUR
  für Vorschau-Crawler die `og:*`-Tags je Zustand und lässt jeden Browser unverändert durch **+ 6 offene Rewrites** `/_dwd_opendata`, `/_meteoalarm`, `/_gfs`, `/_cscs`,
  `/_mf`, `/_ecmwf` auf DWD, MeteoAlarm, NOAA-S3, CSCS, Météo-France, ECMWF — sie reichen auch
  Verzeichnislistings der Upstream-Server durch, s. `SEO-AUDIT.md`), GitHub-Actions-Warm-Crons pflegen
  `public/latest-{grib,wind}.json` sowie den Radar-/Repack-Spiegel im Daten-Repo `buscosun-data`
  (ausgeliefert über jsDelivr; zweites Spiegel-Repo `jppetry/buscosun-worldcover` für dNBR). Daneben laden
  viele Quellen weiterhin **direkt** von Fremd-Origins (GeoSphere, geo.admin.ch, BrightSky, Open-Meteo,
  Nominatim, AWS/Element84, NASA GIBS, Planetary Computer).
- Vollständige Architektur: `architecture.md`. Entscheidungs-Log: `decisions.md`.

## Dokumenten-Landkarte

| Datei | Rolle |
|---|---|
| `CLAUDE.md` | Diese Verfassung: Regeln, Konventionen, Doku-Landkarte |
| `README.md` | Repo-Einstieg: Was ist buscosun, Funktionsumfang, Schnellstart, Doku-Index |
| `architecture.md` | Repo-weite Architektur (App-Shell, Layer-System, Quellen, Fusion, Transport, Deployment) |
| `decisions.md` | ADR-Log: getroffene Grundsatzentscheidungen + Status |
| `roadmap.md` | Strategische Handlungsfelder, bekannte Defekte, Wettbewerb, Priorisierung |
| `improvements.md` | **Verbesserungskatalog (Pflicht, D-28):** jede gefundene Verbesserung als V-Eintrag mit Mehrwert + Umsetzungsskizze |
| `agents.md` | Agent-Teams-Betriebsmodell: Rollen, Zuständigkeiten, Arbeitsabläufe, Definition of Done |
| `CONTRIBUTING.md` | Arbeitsweise, Gates, Ehrlichkeitsregeln, Definition of Done (für Menschen **und** Agenten) |
| `DEVELOPMENT.md` | Entwicklungsumgebung, Skripte, Verifier-Harness, Transport, Fallstricke |
| `plan.md` | Aktive Phase (oben) + historischer Phasenplan (Archiv, unten) — derzeit fehlend, s. Statusblock |
| `context.md` | Projektstand + Session-Log (Archiv) — derzeit fehlend, s. Statusblock |
| `checklist.md` | Gates mit Belegen — derzeit fehlend, s. Statusblock |
| `tests.md` | Verifikationsprotokolle V-* |
| `prompt.md` | Kickoff-Prompt für die nächste Session |
| `mobile-design-guidelines.md` | Verbindliche Mobile-UI-Patterns — derzeit fehlend, s. Statusblock |
| `docs/` | Fachspezifikationen (s. Tabelle unten) |
| `audit/*.md` | Diagnose-/Phasen-Befunde je Feature-Linie, mit Messwerten und Gate-Belegen (historisch, Referenz unten) |

**Feature-Linien-Audits** (jeweils Diagnose → Umsetzung → Gate, mit Messwerten und Fallstricken):

| Datei | Feature-Linie |
|---|---|
| `audit/punktvorhersage-14tage.md` (+ `audit/punktvorhersage-14tage/`) | PV0 Diagnose/Spezifikation/Plan **und PV3 Implementierung** der punktbasierten probabilistischen Vorhersage („buscosun Fusion", `src/pointForecast/fusion/`): Verteilungsalgebra, Minimum-Varianz-Kombination mit Fehlerkorrelation, Repräsentativität aus dem Gelände, Klimatologie als Prior, Feuchtkugel-Phase. Gate GPV3 grün, danach **GPV3b: 0–336 h** (§8 — ACC mit zwei Zeitskalen, Taupunkt statt RH als Fusionsgröße, Klimatologie als letzter Member statt `null`). `verify:pv-fusion` **208/208** (nach Gate GPV3d, §10), netzfrei; alle sieben Skalargrößen tragen bis **372 h** eine echte Quelle, die Windrichtung endet konzentrationsabhängig (229 h bei 12 m/s, 46 h bei 3 m/s). Default-off hinter `distribution: true` — **kein Consumer nutzt das Flag**; drei Fachprüfungen (Statistik · Meteorologie · Integration) eingearbeitet. **Externes Audit 2026-09-07** (`FUSION_AUDIT.md`, `FUSION_VERIFICATION.md`, `FUSION_IMPROVEMENTS.md` in der Repo-Wurzel): Block 0 umgesetzt — Stationsanker jetzt Anomaliepersistenz (`validAtMs`/`climaAt`), ohne Klimatologie `null` statt stiller 8 °C, MOSMIX-Amplitude α = √ρ, Taupunkt-Lapse, Quellen-Auslauf auf dem Gewicht statt auf ρ; **K-2 umgesetzt** (§10): Niederschlag zweistufig — Auftreten im Probit-Latentraum mit eigenen Auftretens-ACC und Tail-Prior, Menge bedingt auf nass zur Nassstunden-Klimatologie, Ausgabe `hurdleLogNormal` (MOSMIX 5 mm/h bei 24 h: P(nass) 59 → 79 %, Median 0,22 → 1,95 mm/h). Falle: Nassmenge nie als Normalverteilung in log1p (30 % Masse < 0), und die MOS-Amplitude gehört nicht aufs Auftretens-Latent. **V-A₁ gelaufen** (§11, `npm run verify:pv-score`, netzabhängig): 111 DE-Stationen, MOSMIX_L as-of, POI-Wahrheit — Fusion-T = MOSMIX ± 3 % MAE, aber **Spread/Skill 0,5–0,6 (zweifach überkonfident, Gate verletzt)**, Wind +0,3 m/s Bias, K-1 an 435 Fällen belegt, **Altpfad bei 1–6 h 2,3× schlechter als rohes MOSMIX (V-PV-19, Produktdefekt)** — **behoben 2026-09-08 auf Jans Auftrag (§12): Stationsanker als Innovations-Persistenz (`src/pointForecast/anchor.ts`, Modell + Versatz·e^{−h/τ}, Versatz altersgewichtet aus den letzten 6 h ohne Archiv: BrightSky-Messungen + laufender MOSMIX-Lauf per `source_id`, TAWES-Historie, SMN-Tagesdatei), Default im Produkt, Kill-Switch `?anchor=value` / `anchorMode`; gemessen T 1–6 h 2,18 → 0,92 K (MOSMIX 0,90), Td 1,05 → 0,70. Fusion unberührt (behält K-1). `verify:pv-fusion` 222/222.** **Offen, in dieser Reihenfolge: Priors aus den Scorecards fitten (V-PV-18), Scorecards täglich fortschreiben, dann ICON-D2 aus dem CDN und IFS als zweites Zentrum; die K-2-Priors (`ACC.precipOcc`, `PRECIP_WET_CLIMA`, `PRECIP_OCC_TAIL`) sind ungemessen (V-PV-17); `climatologyOnly`/`climaSource` werden noch nirgends angezeigt (V-PV-14); Stufe 4 (GEFS-Spread) braucht einen neuen Actions-Cron ⇒ STOPP & FRAGEN** |
| `audit/punktarchiv.md` | **PA0–PA7: Punktarchiv für buscosun Fusion** — Diagnose der Aufbewahrung je Quelle (Vorhersagen nicht nachholbar, Wahrheit schon), Datenmodell v1 (Slot-Datei spaltenweise, ganzzahlig skaliert, Fusion als Verteilungsparameter), Sammler als Datenschritt des V-A-Harness, Repo `buscosun-archiv` mit eigenem Cron, Bewerter-Modus `--archive`, Gates GPA1–GPA7, E-1…E-7, V-PA-1…5 |
| `audit/punktdaten-versorgung.md` | **PD0/PD-A: Punktdaten aus dem Daten-Repo** — warum buscosun Fusion `buscosun-data` heute nicht liest, der vollständige Datenbedarf aus `ABLAUFPLAENE.md` (41 Felder) mit Quellenzuordnung aus `QUELLENMATRIX.md`, die fehlenden Produktlinien (Punkt-Cube, Kalibrierung), gemessene Formate und Volumina, Etappen PD1–PD6 mit Gates, E-1…E-18, V-PD-1…8; §22 = das Fundament, §23 die Adapter, §24 die 24-h-Aufbewahrung, §25 Geländerückbau + bz2-Befund, §26 ein Verzeichnis = eine Veröffentlichung |
| `audit/teilen-share.md` | **SH0–SH6: „Auswahl teilen“ (vollständig umgesetzt)** — Diagnose des URL-Zustands je Feature-Seite (Query vs. Fragment vs. gar nichts, gemessene Link-Längen), Zielschema `/<feature>/<ansicht>[/<ort-slug>]?<abweichungen>` mit Beispiel-URL je Seite, Share-UI, Kanäle, Open-Graph-Empfehlung in zwei Stufen, Etappenplan mit Gates, V-SH-1…13 (alle erledigt), §20 = SH6, §22 = V-SH-12 + E-7, §23 = V-SH-13 mit Edge Function, 50 Vorschaubildern und den zwei Fehlern, die erst die echte Crawler-Antwort zeigte |
| `audit/brandradar-satellitenbilder.md` | SAT0–SAT2h: Satellitenbilder vorher/nachher, 10-m-COG-Viewer, SWIR/dNBR/SCL-Maske/WorldCover-Dämpfung, Performance-Härtung der Komposit-Schleife |
| `audit/route-3d.md` | R3D-1…R3D-8: 3D-Tourenansicht (Schnitt 1a/1b/1c + Geländekarte, Zeitplan, Ergebnis öffnet mit dem Gelände) |
| `audit/bandbreite.md` | BW-0…BW-11: Netlify-Bandbreite für Wetterkarte + Regenradar auf ≈ 0 (jsDelivr-Repack, PNG-Familien, Radar-/KONRAD-Spiegel `buscosun-data`, Service-Worker-Frischefallen) |
| `audit/radar-datenrepo.md` | RD0–RD3: Radar/KONRAD-Spiegel im Daten-Repo, zuletzt als fertige Bilder (PNG/JSON) statt Rohdaten |
| `audit/layer-erstbild.md` | LE0–LE2: Ladezeit Regenradar/Wetterkarte (Parser im Worker, Frühstart/`modulepreload`, Fetch-Prioritäten) |
| `audit/karten-layer-verortung.md` | KL0–KL11: Geo-Versatz aller Wetterkarten-Layer diagnostiziert und auf ≤ 1 m korrigiert (Warp-Meshes, Mercator im Shader) |
| `audit/radar-punktverortung.md` | RP0: Punktabfrage vs. Kartenposition für DE/AT/CH-Radar angeglichen |
| `audit/event-terrain.md` | ET0–ET5: Terrain-Bühne + Wetter-Readout der gezeichneten Event-Fläche |
| `audit/event-zone.md` | EZ0–EZ3: Event-**Fläche** (Rechteck) statt nur Punkt, Ecken-Abtastung |
| `audit/brandradar-detail-mitte.md` | BD2: Brand-Dossier in der Mitte umschaltbar „Karte \| Dossier" |
| `audit/brand-detail.md` | BD0/BD1: Detailkarte mit FRP-Verlauf, Wetterlage am Brandort, Ursache-Ehrlichkeit |
| `audit/regenradar-layer-angleich.md` | RL0/RL1: Regenradar nutzt dieselben Niederschlags-/Zellbahnen-/Schnee-Module wie die Wetterkarte |
| `audit/routing.md` | RT0/RT1: Pfadbasiertes Client-Routing (React Router) statt Hash-Fragmenten |
| `audit/brand-historie.md` | BH0–BH6: Brand-Historie über 24 h/7 d/Monat/Saison aus dem FIRMS-Archiv |
| `audit/thermalanomalien.md` | TA0–TA5: Trennung Vegetationsbrand vs. persistente Anlagen-Signatur, Reiter „Thermalanomalien" |
| `audit/aktivfeuer.md` | AF0–AF4: Aktiv-Feuer-Dynamik (Tendenz, Ausbreitung, Merkmale) + Flächen-Kalibriermodell aus dem Archiv |
| `audit/brandflaechen-panel.md` | BP0–BP5: Brandflächen als Polygone + Panel, Brand-Registry |
| `audit/brandflaeche-vorlaeufig.md` | VB0: eigene Brandflächen-Kontur vor EFFIS-Kartierung an 618 Archivpaaren widerlegt |
| `audit/waldbrand-ausbreitung.md` | SF0/SF1: Ausbreitungsrichtung aktiver Brände nach dem kanadischen FBP-System |
| `audit/waldbrand-forecast.md` | WF0–WF5: Waldbrand-Wetter-Forecast/FWI-Rechenkern auf ICON-D2 |
| `audit/waldbrand-cluster.md` | BC1: Brand-Cluster-Liste + konvexe Hülle |
| `audit/waldbrand-behoerden.md` | Behördendaten DACH: Achsen-Konvention, MoWaS-Befund, EMS, GeoSphere, CORINE |
| `audit/waldbrand-boden.md` | WT1: Bodentrockenheit aus ICON-D2 `smi` |
| `audit/waldbrand-wind.md` | WW1: Windlayer der Wetterkarte im Brandradar |
| `audit/waldbrand-firms.md` / `audit/waldbrand-effis.md` | F0–F2 (FIRMS Primärquelle) / E0–E3 (EFFIS/GWIS Sekundärquelle) |

**Achtung Alt-Doku:** `docs/reports/*`, `docs/seo-geo/*`, `buscosun-atmosphaere-*.md`, `buscosun_seo_geo_*.md`,
`prompt-loading.md` sind abgeschlossene Session-Artefakte — als Historie wertvoll, nicht als Ist-Beschreibung.
Bei Widerspruch gilt: **Code > `architecture.md`/`decisions.md` > Alt-Doku.**

**Fachspezifikationen unter `docs/`**

| Datei | Rolle |
|---|---|
| `docs/MAP.md` | 2D-Karte: Komponenten, Renderpipeline, Datenfluss, State, Konfiguration, Caching, Fehlerbehandlung, Performance |
| `docs/LAYER_SYSTEM.md` | Layer-Vertrag: die zwei Mechanismen, `LayerKey`-Verdrahtung, Z-Ordnung, Zielbild „Layer-Registry" |
| `docs/WEATHER.md` | Meteorologischer Layer-Katalog: bestehende + geplante Layer, Paletten-Ordnung, Länder-Abdeckungsmatrix |
| `docs/DATA_SOURCES.md` | Quellenbewertung DACH (DWD, GeoSphere, MeteoSchweiz, EUMETSAT, EUMETNET/OPERA, Copernicus) |
| `docs/API.md` | Externe Endpunkt-Kontrakte: URLs, Formate, Projektionen, Lizenz- und CORS-Lage |
| `docs/2d-layer-erweiterung.md` | Integrationskonzept + Umsetzungsplan für neue 2D-Layer |
| `docs/zuglinien-radar-spec.md` | Umsetzungsreife Spec: Zeitmodell, Playback, Frame-Budget, Prefetch, Verifier-Verträge |
| `docs/niederschlag-architektur.md` | Niederschlags-Ansicht „jetzt–2 h" im Detail (D-14) |
| `docs/high-end-radar-feature-catalogue.md` | Funktionskatalog Radar (Referenzspezifikation) |
| `docs/fusion-*.md` | Fusions-Engine (Spec, Paper, v2-Plan, 2D-Integration) |
| `docs/zielgruppen-dach.md` | Zielgruppen-Fundament |
| `docs/model-switcher-gate0.md` | Per-Land-Modell-Switcher |
| `docs/aktivfeuer-merkmale.md` | Merkmalsschema `FireFeatures` v1 + Kalibrierung |

## Harte Regeln (gelten für jede Session)

- **Oberste Direktive: Funktionserhalt.** Keine bestehende Funktion wird entfernt, versteckt oder
  „vereinfacht". Umgruppieren ja, Weglassen nein — Ausnahmen nur mit expliziter Freigabe durch Jan.
- **Diagnose-First:** Diagnose → Plan → Implement → Verify → Gate. Kein Code vor schriftlicher Diagnose
  (`audit/<thema>.md`). Gates werden nur mit Beleg (Screenshot-Pfad, Trace, Konsolen-Auszug,
  Verifier-Output) abgehakt.
- **Ein Thema = eine Phase = ein Gate.** Keine zwei Features parallel in einer Session anfassen. (Für
  parallele Agent-Teams gelten die Zuständigkeits- und Konfliktregeln in `agents.md`.)
- **Desktop-Regression = Phase fehlgeschlagen.** Mobile-Änderungen nur per Media Query isoliert.
  Breakpoints: 767 px (mobil) / 1439 px (Desktop-Groß) — keine Ad-hoc-Breakpoints. Safe-Area via
  `env(safe-area-inset-*)`.
- **STOPP & FRAGEN (Jan) bei:** Shader-/WebGL-Pipeline-Änderungen, Fusion-Engine-Änderungen, Löschen von
  Komponenten, Dependency-Upgrades, Änderungen an Edge Functions/Warm-Crons/Manifest-Mechanik, allem
  Irreversiblen. Prod-Dispatch der Crons ist Jans Gate.
- **Mobile-GPU-Fallen:** kein Verlass auf `EXT_color_buffer_float`; explizite `highp`-Deklarationen;
  RGBA8-Packing-Pfad nicht anrühren. Performance-Regelung ausschließlich über den `FrameGovernor`
  (FPS-Leiter zuerst, Trail-0,5× als letzter Hebel, Partikelzahl ist **kein** Hebel).
- **Ehrlichkeit ist Produktprinzip:** Unsicherheiten, Datenlücken und Länder-Asymmetrien (z. B.
  UV/Pollen/Warnungen DE-only) werden ausgewiesen, nie kaschiert. Experten-Layer (z. B. Rotation) tragen
  konservative Formulierungen — nie „Tornado"-Sprache.
- **Flag-Gating („Rule 2"):** Neue Rechenpfade ersetzen alte nie direkt; sie kommen default-off hinter
  Flags mit benanntem Fallback.
- **Design-Standard Command-Deck (D-27):** Alle neue UI entsteht im Command-Deck-System (hell, Sand/Ink,
  League Spartan, Topbar+Rail+Dock, Feature-Token-Namespaces); Alt-Themes werden migriert, nie erweitert.
- **Verbesserungs-Pflicht (D-28):** Jede gefundene Verbesserung wird als `V-NN`-Eintrag in
  `improvements.md` festgehalten — immer mit Mehrwert (für Jan verständlich) und Umsetzungsskizze.
- **Historie gehört nicht in diese Datei.** Was wann umgesetzt wurde, steht in `plan.md`/`checklist.md`/
  `context.md` bzw. bis zu deren Wiederherstellung in den `audit/*.md`-Dateien — der Statusblock oben hält
  nur den aktuellen Stand fest, keine Chronik.

## Verifikation

- **Kein Test-Framework** (bewusst, s. `decisions.md`): stattdessen Headless-Verifier `npm run verify:*`
  (ein `.mjs`-Skript je Thema unter `scripts/`, teils gegen echte Module/Live-Server importiert). Stand
  zuletzt ausgezählt (2026-08-28): **56 npm-Aliase / 57 Harnische** — Einzelzahlen je Phase (z. B.
  `verify:fire-detail` 296/296, `verify:route-3d` 564/564, `verify:layer-geometry`, `verify:repack` u. a.)
  stehen im jeweiligen `audit/<thema>.md`; bei Bedarf neu zählen statt fortschreiben (Lehre aus BW-1: eine
  fortgeschriebene Zahl war falsch). `npm run typecheck` muss vor jedem Gate grün sein.
- **UI-Verifikation:** Chrome DevTools MCP (Desktop 1440×900, iPhone 12 Pro 390×844 DPR 3). Emulation ist
  für WebGL **nicht** repräsentativ — GPU-kritische Aussagen brauchen Real-Device (scrcpy/ADB), Jan
  informieren. In-App-Browser pausiert rAF → WebGL-Karten nur im Vordergrund-Browser verifizieren.
- Vor jedem Gate: die fünf Selbstverifikations-Fragen schriftlich mit Beleg beantworten (1 Funktionserhalt
  einzeln, 2 Desktop pixelgleich, 3 Touch-Targets ≥ 44 px, 4 Konsole sauber, 5 keine Long Tasks > 200 ms).

## Sprache & Konventionen

- Dokumentation auf **Deutsch**, Prompts an Claude Code auf **Englisch**, Code/Kommentare/Commits auf
  Englisch (Bestand ist gemischt — bei Neuanlage Englisch).
- **Namensregel „buscosun Fusion" (Jans Festlegung 2026-09-06):** Der Punkt-Algorithmus in
  `src/pointForecast/fusion/` heißt im Projekt **immer „buscosun Fusion"** — in Doku, Code-Kommentaren,
  Commits und UI. Keine Umschreibungen („Punkt-Fusion", „point engine", „die Fusion", „der Algorithmus").
  Der Ordner bleibt `fusion/`; die erwogene Umbenennung nach `predictive/` ist damit erledigt.
  **Abgrenzung:** `src/fusion/` ist etwas anderes — der IDW-Rasterisierer der 2D-Karte, Name historisch
  (s. `audit/rasterfusion-rueckbau.md` §2). Wo beides gemeint sein könnte: „buscosun Fusion" für den Punkt,
  „Rasterfusion" für die Karte.
- Commits: Conventional Commits, Scope = Feature-/Themenname. Keine Commits ohne Auftrag.
- Nach jeder Phase: `checklist.md` aktualisieren, 3–5-Satz-Fazit in `context.md` §Session-Log anhängen.
