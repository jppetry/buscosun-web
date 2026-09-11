# CLAUDE.md — buscosun: Projekt-Verfassung für Claude-Code-Agenten

> **Stand: 2026-09-11.** **Aktuelle Phase: PD-B10 erledigt — σ_ens bis 336 h aus IFS-ENS (V-PD-27, §45), dazu drei Fehler aus PD-B8 behoben (Niederschlags-σ war die Streuung einer Summe; der ECMWF-Filter strich IFS HRES und AIFS Single; C-LAEF-Fenster lagen als JS-Array im Heap — 84 % der Grenze). Offen und Jans Gate: der erste Push, V-PD-28 (Cron-Slot für MOSMIX-L). Danach Plan PD-C (16 Etappen, s. unten): C1+C2 umgesetzt (§46) — der Cron hatte 0 von 7 Läufen veröffentlicht; Jans Gate PD-C3 = Vorlage ins Daten-Repo kopieren**
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
> `verify:point-data` **241/241** (in CI); `scripts/repack-repo/README.md` neu (beschreibt alle
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
> ✅ **DER CRON LÄUFT (§32).** `workflow-point.yml` liegt als `.github/workflows/point.yml` im
> Daten-Repo (`fb9e483`, Push `70ed806..fb9e483`) — der Token trägt den `workflow`-Scope, die
> Annahme aus `MANUELLE-SCHRITTE.md` §13 galt nur für einen Push *aus einer Action heraus*.
> Am Remote nachgeprüft: 9 222 B, **byte-gleich zur Vorlage**, `50 3,9,15,21`, von der
> GitHub-API als `active` geführt. Erster planmäßiger Lauf 21:50 UTC.
> **§33 — Vollständigkeit gegen `ABLAUFPLAENE.md` gemessen, auf Jans Frage. Antwort: nein,
> und zwar an drei benennbaren Stellen.** Der RAUM stimmt (276/276 Chunks, Gitter
> 45,5–55,5 °N / 5,5–17,5 °E, kein DACH-Punkt fällt heraus) und die ACHSE trägt bis 336 h.
> Von den **41 Feldern**: 17 vollständig, 6 lückenhaft, **8 fehlen ganz**, 10 sind als Form
> da und tragen `null`. (1) **`gammaEff`/`zBase`/`zInv`/`dTInv` fehlen überall** ⇒ PAP 4 hat
> keine Fallunterscheidung, Fall B und C sind unerreichbar, Fall A fällt auf 6,5 K/km zurück —
> genau die Inversionslagen, für die der Algorithmus gebaut ist, kann er nicht (E-11).
> (2) **Ab 186 h trägt EINE Quelle** (AIFS Single): `srcCount` fällt dort auf 1, alle σ-Ebenen
> sind leer, und weil `σ_sys` ungemessen ist, gibt es auf **150 der 336 Stunden (44 %)
> überhaupt keine Unsicherheitsinformation** — ein p10/p90 dort wäre erfunden. Ursache: der
> Ingest greift den JÜNGSTEN IFS-Lauf, nicht den WEITESTEN (06z/18z sind `scda` und enden bei
> 144 h). (3) **Der Cube kennt keine Länder:** `srcCount` ist in München, Wien und Zürich
> Stunde für Stunde identisch — AT und CH werden aus der DEUTSCHEN Spalte der Matrix versorgt,
> C-LAEF, ICON-CH1/CH2 und E4 fehlen sämtlich (6 von 22 Registry-Einträgen ingestiert). Dazu:
> die Nowcast-Stunden 0–3 h laufen auf ICON-D2 statt auf dem Radar — RV liegt roh im Spiegel
> (ohne Leser), INCA und RZC nur als **PNG**, ein Punktwert daraus ist auf die Palette
> quantisiert. Bewusst so und keine Lücke: Terrain (§25, 8 von 12 rechnet der Client),
> Kontrollläufe (V-PD-9), MOSMIX als eigenes Produkt, die Achsenlücken 49/50 h und 121–125 h
> (E-10). **Der Satz zur Lage:** das Datenfundament trägt heute den Teil des Algorithmus, der
> auch ohne es funktioniert hätte — und noch nicht den, für den er entworfen wurde.
>
> **Aktuelle Phase: PD-B — die ganze Quellenmatrix ins Daten-Repo** (Plan mit Jans vier
> Entscheidungen: Matrix **plus** Profilfelder, Ensembles nur als Mittel + σ_ens in grobem
> Zeitraster, ≤ 500 MiB Arbeitsbaum, E4 bleibt Benchmark). Gemessenes Budget: **4,93 GiB
> Download je Lauf**; ⚠ das echte Laufzeitbudget ist **80 min, nicht 120** — der Verifier
> fordert `Abstand ≥ JOB_MAX_MIN + 20`, und `JOB_MAX_MIN` schreibt sich nicht selbst fort.
> Der Deckel bindet außerdem an der **Aufbewahrung** (4 Läufe × ~100 MiB), nicht an der
> Laufgröße.
> ✅ **PD-B1 umgesetzt (§34) — zwei Konstruktionsfehler behoben, ohne ein neues Byte.**
> (1) **Laufwahl nach Abdeckung statt nach Alter:** `discoverRun(leadHours[0])` prüfte die
> ERSTE Stunde der Stufe, also gewann bei ECMWF der `scda`-Lauf (144 h) über den `oper`-Lauf
> (360 h). Am echten Datum belegt: `ifs_hres` t3 **06z (4/36 Std.) → 00z (36/36 Std.)**, und
> damit ist §33.4 geschlossen — `srcCount` 186–336 h **1 → 2**, σ_div durchgehend vorhanden,
> Stufe 3 von 20 auf 21 belegte Ebenen und 0,76 → 1,29 MiB. Preis gemessen: t3 zieht jetzt
> **944,8 MiB in 6,4 min**. (2) **Die Domänen-Maske greift:** `coversPoint`/`clip`/
> `edgeMarginKm` standen seit PD-A ungenutzt in der Registry — die Fusionsschleife mittelte
> über JEDE Zelle. Für die heutigen sechs Quellen ändert sich kein Byte (`domainMask` gibt
> `null`, wenn eine Quelle den Ausschnitt ganz trägt); wirksam wird sie mit C-LAEF und
> ICON-CH, wo `fillNearest` sonst bis zu **15 km über den Domänenrand** verschmiert hätte.
> **Drei Korrekturen erzwang erst die Messung:** meine eigene Negativ-Kontrolle war falsch
> (Wien liegt schon außerhalb der RV-**Domäne**, nicht erst des `clip` — der richtige Fall
> ist **Linz**); die Abdeckung darf NICHT aus der Sonde folgen (der Entwurf meldete für AIFS
> Single in t2 `coverage: full` bei **null** gelieferten Stunden, weil AIFS 6-stündlich
> rechnet und 51 h kein Vielfaches von 6 ist) — sie kommt jetzt aus `leadsFor`; und
> `members` im Manifest stand auf `c.adapter?.…`, wo `contributors` nie ein `adapter`-Feld
> trug, war also **immer 0**. **Nebenbefund, nachgemessen:** `…/ifs/0p25/enfo/…-enfo-ef.index`
> enthält **1 800 sfc-Einträge, alle `type: "pf"`, `number` 1…50** — keinen Kontrolllauf; der
> Filter behält **null**, `ifs_ens` hat nie ein Feld geliefert (unbemerkt, weil
> `ensembleControlOnly` die Quelle ohnehin aussortiert). Behebung in PD-B8.
> `verify:point-data` **259/259** (war 241), typecheck + Build grün, totalJs 1 345,8/1 350
> unverändert.
> ✅ **PD-B2 umgesetzt (§35) — Schema 2: σ_ens hat einen eigenen Ort.** PAP 6 verzweigt
> ENTWEDER-ODER (`σ = c(p,f)·σ_ens` **gegen** `σ² = σ_div² + σ_sys²`); bis Schema 1 lagen
> beide Streuungsarten in DERSELBEN Ebene, die Verzweigung war unentscheidbar und
> `SIGMA_KIND.ensemble` unerreichbar. Neu: `<var>_sd_ens` je Größe plus die Metaebene
> `ensCount` ⇒ **27 → 36 Ebenen** (19 Größen + 9 σ_div + 8 σ_ens); `CubeVar.sigma` heißt
> jetzt `sigmaDiv`/`sigmaEns`. Der Bruch ist **heute kostenlos** (kein Client-Leser, 24 h
> Aufbewahrung) und später nicht mehr. Die Absage an eine `sigmaKind`-Rasterebene (§23.3)
> gilt weiter — sie galt EINEM Enum je Zelle über ALLE Größen; getrennte Ebenen **je Größe**
> sind die Konsequenz derselben Lehre. ⚠ Manifest sagt ausdrücklich: **`_sd` und `_sd_ens`
> NICHT addieren** (Doppelzählung).
> **Der Container ist jetzt selbstbeschreibend:** `decodeCubeChunk(bytes, { planes })` nimmt
> die Ebenenliste aus `run.json` ⇒ **die nächste Ebenenerweiterung braucht keinen
> Schemabruch mehr**; ein fremdes Schema ohne Liste wird LAUT abgelehnt (mit der Kur im
> Text), eine falsch lange Liste ebenso. `check-cdn.mjs` nutzt das sofort und läuft dadurch
> weiter gegen den veröffentlichten **Schema-1**-Stand („Manifest: Schema 1 · 27 Ebenen").
> **Der Verifier hat die Registry widerlegt, nicht das Format:** die Prüfung „jede
> σ_ens-Ebene hat eine mögliche Quelle" fiel bei `td2m`/`gust`/`ps` durch — die
> EPS-Verzeichnisse führen **mehr**, als die Registry behauptete (icon-d2-eps hat td_2m,
> vmax_10m, clct, clcl, clcm, clch, ps). Korrigiert gegen die Messung; Nebenbefund:
> **IFS-ENS führt die Böe nur als `10fg3`**, nicht als `10fg`. `snowlmt` bekommt bewusst
> KEIN σ_ens — kein Ensemble führt die Schneefallgrenze (am Verzeichnis geprüft).
> **Preis gemessen:** Stufe 3 zweimal aus demselben Cache gebaut ⇒ 1 355 202 → 1 359 522 B
> = **+0,32 %** für neun leere Ebenen, und **0 Abweichungen über 1 952 748 Werte** der 27
> gemeinsamen Ebenen. Drei fest verdrahtete `schema: 1` entfernt (BW-1-Klasse).
> `verify:point-data` **282/282**, typecheck + Build (241/241) + Budget grün.
> ✅ **PD-B3 umgesetzt (§36) — die 0–3-h-Zeile hat einen Leser.** Neu:
> `src/point/nowcastFormat.ts` (die Form), `scripts/point/nowcastReader.mjs` (+ CLI
> `npm run point:nowcast -- <lat> <lon>`), Nowcast-Block in `point/index.json`.
> **Kein Byte aus dem Netz** — RV, INCA und CombiPrecip liegen seit RD3 im Spiegel; es
> fehlte nur die Auskunft, WIE man daraus einen Punktwert gewinnt.
> **Korrektur an §33.5:** die PNGs sind **Werte-Bilder, keine Farbpaletten** — die
> Umkehrung ist exakt (0 Abweichungen über Bytes 1…254, Rundweg auf dasselbe Byte). Die
> echten Grenzen sind schärfer: (1) **Sättigung** — Byte 255 heißt „≥ 19,96 mm/h", ein
> offener Randbin; 20, 60 und 200 mm/h landen auf demselben Byte, deshalb liefert der
> Leser dort `saturated` statt einer erfundenen 20. (2) ⚠ **Byte 0 ist ZWEIDEUTIG** —
> `decodeRadolanRaw` setzt außerhalb der Radarabdeckung `NaN`, und `precipToU8` bildet
> `NaN` auf 0 ab: „kein Regen" und „kein Radar" werden dasselbe Byte. Am echten Slot
> gemessen: **Linz und Wien meldeten 0,0000 mm/h, wo die rohe Datei `NaN` sagt** — eine
> erfundene Trockenheit mitten in ⚠¹. Kur: der Leser wendet `coversPoint()` an, BEVOR er
> ein Byte anfasst. Nebenbei die Kodierungsaussage belegt: München PNG 0,1569 gegen roh
> 0,1200 = 0,0369, **unter dem halben Quantisierungsschritt**.
> ⚠ **`vMax` bleibt bei 20 — eine Erhöhung wäre ein Produktausfall:** `radarImg.ts` führt
> es als Drift-Wächter, ein abweichender Wert macht **jeden Slot für jeden Client
> ungültig** (Regenradar dunkel). Der Ausweg ohne Sättigung liegt für DE schon da: das
> unveränderte `tar.bz2` (`readRvExact`). **Der Nowcast wird NICHT in den Cube gebacken:**
> `leadH = 0` ist die LAUFZEIT, und der Lauf ist beim Bau 3,4–3,8 h alt ⇒ ein RV-Frame mit
> +120 min deckt Cube-Stunden ≈ 4–6, nicht 0–3. Am lebenden Datum: in **Wien steigen RV und
> CombiPrecip aus, INCA trägt allein** (0,00 → 1,33 mm/h über 165 min).
> `verify:point-data` **321/321**, typecheck + Build + Budget grün.
> ✅ **PD-B4 umgesetzt (§37) — und die Etappe hat einen Altfehler ans Licht gebracht, der
> wichtiger war als sie selbst.** `field(c.run, leadH, …)` reichte DIESELBE Vorhersagestunde
> an Quellen mit VERSCHIEDENEN Läufen: `leadH` heißt „Stunde nach dem Lauf DIESER Quelle",
> also trug **IFS in Stufe 3 Werte bei, die 12 h früher gültig waren** — gemittelt mit den
> anderen dreien. Das verwischt den Tagesgang und bläht σ_div mit einem Zeitversatz auf, der
> wie Modelluneinigkeit aussieht. ⚠ **Der Fehler ist älter als PD-B1, aber PD-B1 hat ihn
> vergrößert** (vorher 06z = 6 h, seither 00z = 12 h): ein Fix, der σ zurückholt, darf σ
> nicht gleichzeitig verfälschen. Kur: der Producer rechnet in **Gültigzeit** — je Quelle ein
> `offsetH`, gelesen wird bei `leadH + offsetH` (auch in `leadsFor` und bei der
> Entakkumulation), der Versatz steht im Manifest. **Gemessen, gleicher Cache, nur die
> Übersetzung anders: `t2m_sd` in Stufe 3 fällt von Median 3,060 K auf 1,070 K — −65 %.
> Zwei Drittel der Streuung in der Fernstufe waren der Tagesgang, nicht die Modelle.**
> **C-LAEF ist drin** (`scripts/point/adapters/geosphere.mjs`, **fünfte Zugriffsfamilie**:
> Fremd-REST statt GRIB). Gemessen: reguläres lat/lon-Gitter 0,009° × 0,0135° ⇒
> `sampleRegularToTier` ohne neue Mathematik; **HDF5** über `jsfive`; Stunden 0…60; Läufe
> **3-stündlich** (Registry sagte `[0,6,12,18]`); Vorhalt ≈ 18 h; Latenz **≈ 4,9 h**; Grenze
> **10 Mio Punkte/Anfrage**. ⚠ **Drei verschiedene int16-Skalen in DERSELBEN Datei** (2t 0,1 ·
> 2r/tcc/msl 0,01 · tp 0,001) — und `jsfive` liest die Attribute nicht, also gegen die
> `geojson`-Ausgabe **derselben Zelle** gemessen; mit einer Einheitsskala stünde die
> Temperatur bei **1,95 statt 19,5 °C**. ⚠ **`tp` ist die STUNDENSUMME**, nicht
> laufakkumuliert ⇒ `accumulated` bleibt leer. ⚠ **C-LAEF hat `msl`, NICHT `ps`** ⇒ `ps`
> bleibt MISSING (sonst 1013 statt 700 hPa auf der Zugspitze). ⚠ Taupunkt **abgeleitet**
> (Magnus aus 2t + 2r). Die Registry lag an **fünf** Stellen daneben und ist korrigiert; auch
> der ⚠³-Selbsttest prüfte die **falsche Quelle** (die Fußnote gilt `claef_eps`).
> **Die Länder-Blindheit aus §33.5 ist beseitigt**, am echten t1-Bau: `srcCount` Hamburg
> 4/2/2/3… gegen München, Wien, Innsbruck, Graz, Zürich, Genf 5/3/3/4… — C-LAEF trägt
> **28 920 von 48 441** Zellen, endet bei 51,5 °N, und München bekommt es sehr wohl. Taupunkt
> überall unter der Temperatur, Böe über dem Wind — PAP-6-Konsistenz ohne Nacharbeit.
> **`claef_eps` bleibt bewusst draußen:** 42 Felder = 14 Parameter × p10/p50/p90, keine
> Member. Seit Schema 2 heißt `_sd_ens` „Streuung zwischen MEMBERN"; `(p90−p10)/2,563` wäre
> eine Normalverteilungsannahme — für `precip` (zensiert) falsch. Ein gesetzter Wert in einer
> Ebene, die einen gemessenen verspricht, ist der teuerste Fehler dieses Produkts. Sauberer
> Pfad: eigene `_q10`/`_q90`-Ebenen (Formatentscheidung, in `PENDING` benannt).
> `verify:point-data` **332/332**, typecheck + Build (241/241) + Budget grün.
> ✅ **PD-B4b umgesetzt (§38) — der Nachbarindex, und ein Altfehler mit ihm.**
> `buildUnstructuredIndex` war `O(Zielzellen × Kandidaten)`. Selbst gemessen auf Stufe 1:
> ICON global (~7 500 Kandidaten) 13,7 s, ICON-D2-EPS (542 040) **60 s**, ICON-CH1
> (1,15 Mio) **299 s = 5,0 min JE STUFE** — bei 80 min Budget ein Blocker für B5 und B8.
> Ersetzt durch ein **Eimergitter** mit beweisbarer Abbruchschranke; die alte Fassung bleibt
> als `buildUnstructuredIndexBrute` **nur für den Gleichheitsbeweis**.
> **Zwei Fehler auf dem Weg, beide gemessen statt vermutet.** (1) Mein eigener: bei einer
> Quelle, die nur einen TEIL des Ausschnitts deckt, wuchs die Ringsuche durch leeres Gebiet
> und war **langsamer als das Original** (Lauf nach 5 min abgebrochen) ⇒ Sprung auf den
> belegten Bereich. (2) **Nicht meiner, sondern seit PD-A da: die alte Fassung kannte keine
> Entfernungsgrenze** und nahm den global nächsten Kandidaten, auch 700 km weit weg. Für
> C-LAEF (bis 51,5 °N) und ICON-CH (bis 50,5 °N) hieße das: EIN Randwert über halb
> Deutschland verteilt, aussehend wie eine Vorhersage. Der reguläre Weg verweigert das seit
> jeher (`fillNearest`, 3 Zellen, dann MISSING) — der unstrukturierte zieht nach:
> `maxDist = max(3·tier.deg, 2·Maschenweite)`. Gemessen: bei Süd-Abdeckung bleiben **1 470
> von 2 009 Zellen leer**, wo die alte Fassung **für alle** einen Wert erfand.
> **Beweise:** an ICON globals ECHTEN Zellkoordinaten (2 949 120 Zellen) über alle drei
> Stufen **0 von 62 671 Zielzellen verschieden**; am Ausgabebaum **12 von 12 Chunks
> byte-gleich**. Gleichstände entscheidet die Ringsuche ausdrücklich über `c < best` — ohne
> diese Zeile fiele der Gleichheitsbeweis **zufällig** aus.
> **Wirkung:** ICON-CH1-Größe alle drei Stufen **6,7 s** statt 5 min je Stufe (78×).
> **Lehre:** eine Optimierung, die nur am günstigen Fall gemessen wird, ist keine Messung —
> der erste Entwurf war am voll abgedeckten Gitter 1000× schneller und am **teilweise**
> abgedeckten langsamer als das Original. `verify:point-data` **342/342**, typecheck
> (`tsc -b --force`, voller Neudurchlauf) 0 Fehler, Build 241/241.
> ⚠ **Das Budget ist rot — aber NICHT aus PD-B (§38.6).** `largestChunk` 300,9 > 292,3 und
> `totalJs` 1 365,2 > 1 362. Gemessen, nicht behauptet: **kein einziges Punkt-Modul steht im
> Bundle** (Textsonde auf `dist/assets/*.js` nach `sd_ens`, `ensCount`, `BSPC`,
> `geosphere-grid`, `nowcastFromU8`, `C-LAEF AlpeAdria` ⇒ **null Treffer**), und kein
> `.ts`/`.tsx` unter `src/` importiert die Punkt-Module. Gewachsen ist der **FireRoute**-Chunk
> aus der **parallel laufenden Brandradar-Linie**: `budget.json` trägt deren eigenen Eintrag
> vom 2026-09-09 („Charts auf nivo", totalJs 1 350 → 1 362, damals gemessen 1 355,4 /
> largestChunk 291,1), und seither ist **`@nivo/radar`** für ein neues `FireProfileChart.tsx`
> dazugekommen — `package.json` führt jetzt **14 statt 13** Laufzeit-Abhängigkeiten, die
> Linie ist noch mitten in der Arbeit (`src/fire/charts/nivoTheme.ts`,
> `src/fire/detail/fireProfile.ts` untracked). **Die Ratsche bleibt unangetastet** — sie
> anzuheben verdeckte eine fremde Regression und wäre eine Entscheidung, die dieser Phase
> nicht gehört.
> ✅ **§39 — der verlorene Etappenplan ist rekonstruiert.** Die Liste, auf die §34 sich beruft
> („Der Plan steht (PD-B1…B8)"), war **nie niedergeschrieben**; ein Grep über alle `.md`, `.ts`
> und `.mjs` findet **PD-B5, B6, B7, B9 kein einziges Mal**. Abgeleitet aus `PENDING`
> (13 Quellen mit Grund), `TIER_BANDS` und §33 — und ausdrücklich als **Rekonstruktion**
> gekennzeichnet, damit sie niemand für ein Zitat hält. **PD-B8 wurde NICHT verschoben:** es
> ist an sieben Stellen benannt und überall für dieselbe Sache (Ensemble-Member); die
> Reihenfolge ist deshalb um die feste Nummer herum gebaut. Neu: **B5** Profilfelder ·
> **B6** ICON-CH1/CH2-EPS (STAC/CSCS) · **B7** C-LAEF-EPS als `_q10`/`_q90` (muss VOR B8
> liegen, sonst zweiter Ebenenindex-Bruch) · **B8** Member · **B9** MOSMIX-L.
> ✅ **PD-B5 umgesetzt (§40) — und der Beweis kommt aus dem Tagesgang, nicht aus dem Wertebereich.**
> `gammaEff`/`zBase`/`zInv`/`dTInv` waren in KEINER Zelle belegt ⇒ PAP 4 konnte Fall B und C
> nie erreichen und fiel auf 6,5 K/km zurück. **Zwei Dinge machten die Etappe billig:** die
> vier Ebenen existieren seit PD-A im Format (kein Formatbruch), und `t` auf Modellleveln
> liegt auf **demselben regulären Gitter** wie die Single-Level-Felder — also keine neue
> Zugriffsfamilie. **E-11 lag bei der Levelzahl daneben:** empfohlen waren 15, gemessen an
> `hhl` enden die bei 870–1 135 m über Grund (Talinversionen ja, **Absinkinversionen nein**)
> ⇒ **20 Level** (65…46, bis 1 349–1 792 m). **Die Entscheidung, die keine Rechenfrage ist:
> Profilfelder werden NICHT gemittelt** — der Mittelwert zweier Inversionsobergrenzen ist
> keine Inversionsobergrenze (400 m + „keine" ergäbe 200 m, eine Schicht, die kein Modell
> kennt); sie kommen aus EINER Quelle, `provenance: "single-source"` im Manifest.
> **Der eigentliche Beleg:** gleicher Code, nur andere Stunden ⇒ Anteil Zellen mit
> `zInv > zBase` **12,5 % mittags · 68,2 % nachts · 33,5 % morgens**. Nirgends im Code steht
> „Tag" oder „Nacht" — käme das nicht heraus, wäre das Vorzeichen gedreht, und das sähe am
> Wertebereich unauffällig aus. Nebenwirkung: ein Feld, das so schwankt, hat eine
> **Stundenstruktur** ⇒ der dreistündliche Vorschlag aus E-11 hätte den Auf- und Abbau
> verwischt; gerechnet wird im Raster der Stufe.
> **Volumen gemessen:** +141 Dateien / +131,3 MiB je 6 Stunden ⇒ volle Stufe 1 ≈ **906 MiB**
> (+18 % aufs Laufbudget). ⚠ **Die Laufzeit ist aus diesen Läufen NICHT ableitbar und das
> steht so da:** der Lauf MIT Profil war mit 69 s schneller als der ohne (132 s) bei
> 2,6-facher Datenmenge — der Durchsatz schwankte um den **Faktor 5** (0,61 → 3,06 MiB/s).
> Die Differenz misst die Leitung, nicht die Etappe (SAT2h-Lehre). Kill-Switch
> `POINT_PROFILE=0`. ICON-EU bleibt bewusst ohne Profil (74 statt 65 Level, eigene Messung).
> Die drei Schwellen stehen als **benannte Startwerte** im Manifest mit `calibrated: false`.
> `verify:point-data` **380/380** (war 342), typecheck + Build (241/241) grün, Budget grün
> (301,2/302 · 1 365,5/1 372 — die Ratsche hat die **Brandradar-Linie** angehoben, nicht
> diese; Textsonde: **null** Punkt-Signaturen in `dist/assets/*.js`).
>
> ✅ **PD-B6 umgesetzt (§41) — die Schweiz hat eine eigene Quelle, und der Cube kennt endlich Länder.**
> `scripts/point/adapters/meteoswiss.mjs`: ICON-CH1-EPS in Stufe 1, ICON-CH2-EPS in Stufe 2 —
> **sechste Zugriffsfamilie** (STAC-Katalog + vorsignierte S3-Objekte).
> **Der Beleg:** `srcCount` Hamburg/Berlin **2**, München/Wien/Innsbruck/Zürich/Genf **4** —
> vor PD-B4 war diese Spalte überall gleich. Nebenbefund, nicht bestellt: `t2m_sd` folgt der
> Geländekomplexität (Innsbruck 1,09 K · Zürich 1,03 K gegen Hamburg 0,25 K).
> **Die Registry stand auf einem VERBRAUCHER:** sie führte fünf Größen — abgeschrieben aus
> `WANTED_STAC` des Kartenclients, der nur fünf zeichnet. Der Katalog (`params_*.csv`) führt
> **alle zwölf**, inkl. nativem `TD_2M` und echtem `PS` (nicht auf Meeresniveau reduziert wie
> bei C-LAEF). Gitter am Konstanten-Asset gemessen: CH1 1 147 980 Zellen, CH2 283 876.
> **Drei Katalog-Fallen, alle gemessen:** (1) ⚠ **unbekannte Query-Parameter werden STILL
> ignoriert** — `?forecast:variable=T_2M` gibt **HTTP 200** und liefert `ALB_DIF`; dieselbe
> Stille wie `git add` im sparse-Checkout. (2) ⚠ der `next`-Cursor ist base64 von
> `p=<letzte ID>`, sieht also nach einem Keyset-Cursor aus — eine **konstruierte** ID liefert
> aber **0 Items** statt eines Sprungs (mit Roundtrip-Gegenprobe belegt, dass die Kodierung
> stimmt). **Ich hätte darauf gebaut, wenn ich es nicht gemessen hätte.** (3) ⚠ vorsignierte
> URLs sind **methodengebunden**: HEAD → 403, GET/Range → 200/206 ⇒ `headOk()` unbrauchbar, und
> weil `Signature`/`Expires` je Enumeration wechseln, cacht der Abruf unter dem **Objektnamen**.
> **Einheit gemessen, weil die Doku falsch ist:** `params_*.csv` nennt `TOT_PREC` `kg m-2 s-1`;
> am Feld sind es **0…155 mm laufakkumuliert**. ⚠ `SNOWLMT` ist bitmap-maskiert (270 559 von
> 283 876 Zellen) — MISSING, nicht 0.
> **Der ctrl-Member geht INS Mittel, und das bricht V-PD-9 nicht:** ausgeschlossen wird ein
> ctrl, der eine schon ingestierte Quelle dupliziert (IFS-ENS-ctrl **IST** IFS HRES).
> MeteoSchweiz veröffentlicht keinen separaten deterministischen Lauf ⇒ `controlNote` im
> Manifest. Die perturbed-Member (23 MB je Variable und Schritt) bleiben PD-B8.
> **Ein Wächter aus PD-B2 hat eine eigene Messung widerlegt:** „keine Ensemble-Größe ohne
> σ_ens-Ebene" wurde rot — PD-B2 hatte an den DWD/ECMWF-EPS gemessen „kein Ensemble führt die
> Schneefallgrenze", und für MeteoSchweiz ist das **falsch**. Aufgefallen nicht beim Lesen,
> sondern weil die Prüfung feuerte, für die sie gebaut war ⇒ `snowlmt` bekommt `sigmaEns`,
> **36 → 37 Ebenen, Schema 3**. Zwei feste Zählwerte sind auf **gezählte** umgestellt (BW-1).
> ⚠ **Der teuerste Befund war älter als die Etappe:** `chooseRun` stellte die
> Abdeckungs-Sonde nur bei `maxHorizon ≥ Bandende` — CH1 (33 h, Band 48 h) fiel deshalb auf
> „neuester Lauf mit Stunde 0" zurück, also auf den **frischesten** und am wenigsten
> veröffentlichten: **3 von 49 Stunden**. Dieselbe Klasse wie §34.1, nur andersherum. Und die
> naheliegende Kur reichte nicht: am Katalog gemessen ist CH1s Horizont **laufabhängig** —
> 33 h, **nur 03z trägt 45 h** (⚠⁵-Fall), und der war 14 h alt. Kur als **Leiter**: erst
> `min(Bandende, maxHorizon)`, dann `min(Bandende, Regelhorizont)`, dann Rückfall — höchstens
> zwei Sonden. Ergebnis 12 von 12 möglichen Schritten. **Regressionsprobe über 18
> (Quelle × Stufe)-Paare: genau EINES ändert sich** (CH1), §34.1 bleibt unangetastet.
> **Die Rechteck-Hülle überschätzt, der Nachbarindex fängt es:** von 23 203 erlaubten Zellen
> bleiben **63 (0,3 %)** ohne Gitterzelle in Reichweite — leer statt erfunden (PD-B4b).
> Dabei musste eine **Spannung in der Quellenmatrix** entschieden werden: §1 führt ICON-CH nur
> in der CH-Spalte, §2 verlangt wörtlich geometrische Auswahl „nicht über das Land" und
> tabelliert die DE/AT-Abdeckung. Der Cube folgt §2; die Registry-Notiz „die Zuordnung
> entscheidet" ist korrigiert.
> **Kosten gemessen:** CH1 **26,4 MiB je Schritt** ⇒ 317 MiB/Lauf bei dreistündlichem Raster
> (stündlich wären es **1,21 GiB**), CH2 6,5 MiB ⇒ 156 MiB, Konstanten 41 MiB.
> `verify:point-data` **410/410** (nach B5: 380), typecheck + Build (241/241) + Budget grün;
> Textsonde: der neue Adapter steht in **null** Chunks (die CSCS-Zeichenketten im Bundle
> stammen aus der **Kartenlinie**, `iconChEpsSource.ts` via `loadFusedForecast.ts`).
> **Nicht veröffentlicht** — `POINT_PUSH` bleibt aus.
>
> ✅ **PD-B7 umgesetzt (§42) — gemessene Quantile bekommen einen eigenen Ort, und ein
> Altfehler kommt mit ans Licht.** `<var>_q10`/`_q90` für sieben Größen ⇒ **37 → 51 Ebenen,
> Schema 4**. C-LAEF-EPS liefert keine Member, nur P10/P50/P90 (⚠³).
> **Warum σ dort falsch wäre, an einer nassen Zelle belegt:** Innsbruck +6 h steht
> **p10 = 0,000 mm bei p90 = 0,619 mm**; daraus σ = 0,241 mm und ein normales
> p10 = Median − 1,28σ ⇒ **negativer Niederschlag**. Ein gemessenes Quantil bleibt ein
> Quantil — dieselbe Lehre wie σ_div/σ_ens in Schema 2.
> **Sieben Größen, drei ausdrücklich nicht:** `td2m` nicht, weil das q10 des Taupunkts
> **nicht** Magnus(q10 T, q10 RH) ist — ein abgeleitetes Quantil ist keins (für den MEDIAN
> geht die Ableitung sehr wohl, so macht es §37); `ps` nicht (die Quelle hat nur `msl`);
> `clcl/clcm/clch` führt der Datensatz gar nicht.
> **Die Quelle geht NICHT ins Mittel, und das ist V-PD-9 statt dessen Bruch:** ihr p50 ist
> derselbe Modelllauf wie `claef`, den der Cube schon ingestiert. Umgesetzt über die
> bestehende Mechanik (`vars: []`), am Bau belegt: ein Lauf nur mit `claef_eps` füllt
> **14 von 51 Ebenen, ausschließlich Quantile** — `srcCount`, alle Mediane und alle
> σ-Ebenen bleiben MISSING. Quantile kommen aus GENAU EINER Quelle (wie die Profilfelder);
> Manifest warnt: **`_q10`/`_q90` NICHT mit `_sd`/`_sd_ens` verrechnen**.
> ⚠ **Der Fund, der nicht zur Etappe gehörte: −1 mm Niederschlag stand seit PD-B4 im Cube.**
> Die Konsistenzprobe meldete 29 161 negative `precip_q10`, mit **genau einem** verschiedenen
> Wert — also ein Marker, kein Rechenfehler. Bei Skala 0,001 heißt das Rohwert **−1000**, ein
> Füllwert, den die geratene Liste (−32768/−32767/−9999) nicht kannte. **Betroffen war auch
> der deterministische C-LAEF: 28 920 Zellen.** Alle liegen ausschließlich bei **Stunde 0** —
> `tp` ist die Menge „in the last forecast interval", und davor gibt es keins; die API sagt
> es selbst (`geojson` Lead 0 = **null**, Lead 1 = 0). Kur an **zwei** Stellen: −1000 in die
> Liste, **und** ein zweiter, listenunabhängiger Wall — `NON_NEGATIVE` für `precip`, `clct`,
> `gust`, `snowlmt` (`t2m`/`u10`/`v10` ausdrücklich NICHT, mit Gegenprüfung). Danach **0**
> negative Werte; `precip` verliert exakt die 28 920 Stunde-0-Zellen ⇒ MISSING statt −1 mm.
> **Verortungsbeweis:** `claef` und `claef_eps` stammen aus demselben Modell, also muss der
> deterministische Wert im eigenen 80-%-Band liegen — über 347 040 Zellen: **`q10 ≤ q90` zu
> 100,00 %** bei allen sieben Größen, Median im Band **77–97 %**. Bei einer Verschiebung um
> eine Zelle oder Stunde wäre das eingebrochen.
> **Registry zum zweiten Mal bei derselben Quellenfamilie korrigiert:** Läufe **dreistündlich**
> (stand auf `[0,6,12,18]` — exakt der Fehler, den §37 beim deterministischen C-LAEF schon
> behoben hatte), Vorhalt 12 h (stand auf `null`), 7 statt 4 Größen. Skalen einzeln gemessen;
> `tp` musste an einer **nassen** Zelle bestimmt werden, weil im Trockenen beide Quantile 0 sind.
> **Kosten:** Stufe 1 voll 57 Dateien · **339,1 MiB** · 306 s (+6 % aufs Laufbudget).
> ⚠ Damit steht die Phase bei **≈ 6,7 GiB je Lauf** ⇒ ~32 min bei gemessenem Durchsatz; PD-B8
> (Member) ist die teuerste Etappe und braucht eine Volumenentscheidung **vor** dem Bau.
> `verify:point-data` **440/440** (nach B6: 410), typecheck + Build (241/241) + Budget grün.
> **Nicht veröffentlicht** — `POINT_PUSH` bleibt aus.
> **Die Lehre:** eine Füllwert-Liste, die nicht gemessen ist, ist eine Vermutung mit drei
> Einträgen. Die Vollständigkeit einer Liste kann man nicht beweisen — die Nichtnegativität
> von Niederschlag schon.
>
> ✅ **PD-B8 umgesetzt (§43) — σ_ens und ensCount haben zum ersten Mal Daten.** PD-B2 schuf den
> Ort (Schema 2), PD-B6 die Ebene für `snowlmt` (Schema 3); **gefüllt hat sie niemand** — beide
> standen seit PD-A durchgehend MISSING. Neu: `scripts/point/adapters/dwdEps.mjs`, **siebte
> Zugriffsfamilie** (gebündelte Member auf dem ikosaedrischen Gitter).
> **Die Volumenentscheidung kam VOR dem Code, und das war nötig.** Gemessen je (Größe, Schritt):
> ICON-D2-EPS **13,4 MiB** (20 Member) · ICON-EU-EPS 9,1 (40) · ICON-EPS global **34,8** (40) ·
> IFS-ENS **55,8** (50 Byte-Bereiche) · AIFS-ENS **65,1**. ⚠ Weil die Dateien gebündelt UND
> bz2-gepackt sind, ist **keine Teilmenge der Member abrufbar** — die naheliegende Sparmaßnahme
> („20 von 50 Membern") fällt bei ICON aus. Stündlich wäre Stufe 1 allein **über 5 GiB je Lauf**.
> **Jans Entscheidung (2026-09-11): alle drei Stufen, sehr grob** — t1 ICON-D2-EPS 6-stündlich/
> 5 Größen · t2 ICON-EU-EPS 12-stündlich/5 · t3 ICON-EPS global 24-stündlich/nur t2m+precip.
> Zwischen den Rasterstunden bleibt MISSING; eine interpolierte Streuung sähe aus wie eine
> gemessene. Stufe 3 ist am stärksten beschnitten und trotzdem die wichtigste — dort fehlt heute
> **jede** Unsicherheitsinformation (§33.4).
> **Jans zweite Entscheidung: die Ensembles gehen NICHT ins Mittel.** Ihr Mittel ist derselbe
> Modelllauf wie der schon ingestierte deterministische ⇒ σ_div schrumpfte (V-PD-9, wie bei den
> ECMWF-Kontrollläufen und C-LAEF-EPS). Über dieselbe Mechanik: `vars: []`.
> ⚠ **Die Einheit einer STREUUNG ist nicht die eines Werts.** `convert()` addiert den Versatz;
> auf ein σ angewandt stünde eine 1,2-K-Streuung als **−271,95** im Cube — und beim Quantisieren
> schlicht geklemmt, also **ohne jede Fehlermeldung sichtbar**. Streuungen werden nur mit dem
> **Faktor** skaliert (`SD_FACTOR`); der Verifier prüft, dass `convert()` in der Datei gar nicht
> vorkommt.
> ⚠ **Der teuerste Fund: nicht jede GRIB-Nachricht ist ein Member.** Der erste Lauf meldete
> **„80 Member"** bei einem Ensemble mit 20. Am Objekt: `t_2m`/`u_10m`/`v_10m`/`vmax_10m` je 20,
> `tot_prec` aber **80** — bei identischer Parameter-Identität, Member 1…20 je viermal und
> nachweislich verschieden. **ICON-D2-EPS veröffentlicht den Niederschlag in VIERTELSTUNDEN**
> (Summen bis +6:00, +6:15, +6:30, +6:45). Ein σ über alle 80 hätte vier Gültigzeiten vermischt —
> der Zuwachs über 45 min sähe aus wie Modellstreuung. Der Decoder trägt dafür jetzt
> `productTemplate`, `statProcess`, `timeRangeMin` und `intervalEndMinute` (rein additiv, die
> Kartenlinie liest sie nicht).
> ⚠ **Und mein erster Filter war falsch — sichtbar am Volumen, nicht an einer Prüfung:** ich
> filterte auf die **Länge**, worauf `gust_sd_ens` von 119 auf **5 KiB** einbrach. `tot_prec` ist
> seit Laufbeginn akkumuliert (Spanne = leadH·60), `vmax_10m` das Maximum der **Vorstunde**
> (Spanne immer 60) — beide enden auf der vollen Stunde. Kriterium ist das **ENDE**, nicht die
> Länge. Die Zeile „mit Werten" im Bauprotokoll ist damit mehr als Buchhaltung.
> ⚠ **Ein Nachläufer, der ohne Gegenprobe ins Produkt gegangen wäre:** der deterministische
> ICON-D2 hat dieselben vier Viertelstunden, benutzt aber **Template 4.8** statt 4.11 — und 4.11
> ist 4.8 **plus drei Ensemble-Oktette**. Mit einem Offsetsatz las derselbe Code im Ensemble
> richtig und deterministisch **Spannen von 105 Milliarden Minuten**, während die Ende-Minute
> zufällig auf 0 stand: ein Filter darauf hätte **richtig ausgesehen und falsch funktioniert**.
> Jetzt nach Template verzweigt. **Nebenbefund (V-PD-25):** `decodeGrib2` nimmt die ERSTE
> Nachricht, und das ist heute die volle Stunde — der deterministische Niederschlag war also
> immer richtig, aber **durch die Dateireihenfolge, nicht durch Auswahl**.
> **Der Beleg:** σ_ens wächst mit der Vorhersagezeit, ohne dass das im Code steht — t2m
> 0,19–0,32 K bei 0 h → **0,57–0,64 K** bei 12 h; σ_ens(gust) bei Stunde 0 **exakt 0** an allen
> vier Prüfpunkten (alle 20 Member teilen die Analyse). `ensCount` = **20**.
> **§34.5 geschlossen:** der ECMWF-Filter greift jetzt über `type` (`cf`/`pf`) statt über
> `number`. Der Befund bleibt — `enfo-ef` hat keinen `cf` —, aber jetzt liefert die Quelle nichts,
> *weil der Katalog nichts hat*. Die ECMWF-Member bleiben draußen: 55,8/65,1 MiB gegen 34,8 bei
> ICON-EPS global für dieselbe Aussage.
> ⚠ **Der volle Lauf ist am Speicher gestorben — und meldete Exit 0.** Bis dahin war jede
> Etappe QUELLENWEISE gemessen worden (`--only=…`). Der erste Bau über alle Stufen mit allen
> Quellen lief gegen die **4-GB-Heapgrenze** von Node („allocation failure", V8 Mark-Compact),
> starb mitten in Stufe 1 ohne einen einzigen Chunk — und die Shell meldete **Exit 0**, weil
> `grep` am Ende der Pipeline den Status setzt. Auf einem GitHub-Runner gilt dieselbe Grenze:
> der Cron wäre bei seinem ersten Lauf gestorben. Ursache war der **unbegrenzte Fenstercache**
> in `geosphere.mjs` (~19 MiB je Parameter-Fenster, 22 gleichzeitig lebendig) — **PD-B7 hatte
> ihn von 8 auf 22 Parameter verdreifacht, ohne dass es auffiel**, weil dort nur mit
> `--only=claef_eps` gemessen wurde. Kur: gedeckelter LRU. Danach Speicher **stabil ~2,1 GB**,
> während der Plattencache von 2,0 auf 2,7 GiB wuchs.
> **Lehre:** quellenweise Messungen sind billig, ehrlich und blind für alles, was aus dem
> ZUSAMMENSPIEL entsteht — für Speicher wie für Laufzeit, und beides entscheidet über den Cron.
> ✅ **End-zu-End erstmals gemessen statt hochgerechnet:** `EXIT=0`, **2 315 s = 38,6 min**,
> 3 325 Dateien, **5 965,7 MiB**, 276 Chunks, 77,84 MiB Ausgabe (t1 70,99 · t2 6,47 · t3 0,38).
> Die Hochrechnung aus Einzelquellen lag bei 8,2 GiB — sie unterstellt Vollbesetzung, die es nie
> gibt (ICON global trug 10 von 36 Schritten, das Profil 38 von 49). `JOB_MAX_MIN` **45 → 50**;
> der Cron-Abstand von 100 min hält weiter.
> ⚠ **Der Befund, der Jans t3-Entscheidung relativiert:** σ_ens in der Fernstufe deckt
> **2 von 9 Rasterstunden** (144 h und 168 h) — nicht wegen des groben Rasters, sondern weil
> **ICON-EPS global bei 180 h endet** und das Band bis 336 geht. Die gelieferte Information
> liegt damit ganz im Bereich, der ohnehin σ_div aus vier Quellen hat, und **jenseits 180 h ist
> es so leer wie in §33.4**. Die einzigen Ensembles bis 336 h sind IFS/AIFS-ENS — also die aus
> Kostengründen ausgeschlossenen. Entscheidung offen (**V-PD-27**): entweder ECMWF-Member für
> t2m + precip alle 48 h (gerechnet **≈ 558 MiB**, tragbar), oder die Fernunsicherheit kommt
> erst aus `σ_sys` mit `buscosun-archiv`.
> **Kosten Stufe 1 einzeln:** 47 Dateien · 670,2 MiB · 206 s.
> `verify:point-data` **482/482** (nach B7: 440), typecheck + Build (241/241) + Budget grün.
> ⚠ **Erstmals berührt eine Punkt-Etappe das Bundle:** die Decoder-Felder liegen in
> `gribDecode.ts`, das die Kartenlinie lädt — **+0,5 KB** (1 365,5 → 1 366,0 von 1 372). Die
> Punkt-Module selbst stehen weiter in null Chunks.
> **Nicht veröffentlicht** — `POINT_PUSH` bleibt aus.
>
> ✅ **PD-B9 umgesetzt (§44) — die Phase PD-B ist damit durch.** MOSMIX-L liegt als eigenes
> Produkt `point/stations/`. Die Besonderheit dieser Etappe: **die Form war seit PD-A da, der
> Schreiber fehlte** — `stationBundlePath`, `stationManifestPath`, `STATION_CATALOG_PATH` und der
> Stationsblock in `index.json` standen im Code, erzeugt hat sie nie jemand. Dieselbe Klasse wie
> V-SH-11, nur andersherum: es sah **gepflegt aus**.
> Neu: `scripts/point/mosmix.mjs` (reiner Leser, netzfreier Selbsttest 17/17) und
> `scripts/point/build-stations.mjs`, **achte Zugriffsfamilie** (KMZ/KML statt GRIB, netCDF oder REST).
> **MOSMIX geht bewusst NICHT ins Gitter** (Entscheidung aus PD-A, unverändert): die Quelle ist auf
> DWD-Stationen bias-korrigiert, eine Interpolation auf 0,05° verschmierte die Korrektur über die
> Fläche und würfe genau ihren einzigen Vorteil weg. Ausgeliefert im **selben Container**: eine
> Stationsreihe ist ein Chunk mit `ny = 1`, gebündelt nach dem Chunk-Raster der Stufe 1, die
> Zuordnung Spalte → Station im Lauf-Manifest.
> ⚠ **Die Koordinatenfalle, die keine Zählung gefunden hätte:** `mosmix_stationskatalog.cfg` führt
> Lat/Lon als **Grad + Dezimalminuten** — Wien/Hohe Warte steht dort als `48.15/16.22` und liegt bei
> `48.2489/16.3564`. Die Dezimalgrad-Lesart verschiebt jede Station um bis zu **20 km**, und die
> Stationszahl im Ausschnitt hätte es NICHT gezeigt (3 049 gegen 3 055, beides plausibel). Der
> Producer liest den Katalog deshalb **gar nicht**; die Koordinaten kommen aus `<kml:coordinates>`
> der Datei selbst (an München, Zürich und Wien gegen die bekannten Lagen geprüft).
> ⚠ **Zwei Fallen in der Zugriffsfamilie, beide gemessen:** (1) DWD schreibt das Zip als **Strom mit
> Data-Descriptor** — Größen im lokalen Kopf sind **0**, die echten stehen im Central Directory; der
> vorhandene `unzip()` in `build-places-dach.mjs` scheitert daran mit `Z_BUF_ERROR`. (2) Die Datei
> ist **76,2 MiB gepackt und 1 750 MiB entpackt** und passt in keinen JS-String; gelesen wird als
> Strom, je vollständigem `</kml:Placemark>` ausgewertet und weggeworfen. **Gemessen: Rest-Puffer
> 0,31 MiB, Heap unter 40 MiB** bei 1 750 MiB Durchsatz — die Lehre aus §43.11, diesmal VOR dem
> Absturz angewandt.
> **Zugriffsweg gegeneinander gemessen:** `single_stations/` wären 53 MiB in **3 071 Anfragen**,
> `all_stations/` sind **76,2 MiB in 6,2 s und einer**. Gesamtlauf **55 s**.
> **Die Registry lag zum vierten Mal in dieser Phase bei einer Quellenfamilie daneben:** Läufe
> **03/09/15/21** (standen als acht), Horizont **247 h** (stand auf 240), Schrittfolge **1…247 h
> durchgehend stündlich** (stand auf `null`), und `ps` war zu Unrecht gelistet.
> ⚠ **`PPPP` ist NICHT der Stationsdruck** — am Datum belegt statt der Doku geglaubt: München
> (515 m) 1 019,3 hPa gegen Schleswig (47 m) 1 017,5 — 470 m für 1,8 hPa —, und die Zugspitze führt
> **gar keinen Wert**. Also auf Meeresniveau reduziert ⇒ **`ps` bleibt MISSING**, wie bei C-LAEF
> (§37). `snowlmt` und die vier Profilfelder ebenso, alle fünf als `MOSMIX_NOT_MAPPED` **mit Grund**
> im Manifest — benannt abwesend statt stillschweigend leer.
> ⚠ **Die PAP-6-Bö-Bedingung ist nicht geschenkt:** `v_max := max(v_max, |v10|)` ist am echten Lauf
> **in 97 Fällen verletzt** (die MOS-Regression rechnet Mittel und Bö getrennt). Der Producer
> klammert und zählt mit. Die übrigen Bedingungen halten ohne Nacharbeit: Taupunkt ≤ Temperatur in
> **allen 758 536** Paaren, **0** negative Niederschläge (anders als C-LAEF).
> **Die Zeitachse ist eine Entscheidung mit gemessenem Preis:** eigene Achse 247 Schritte =
> **6,79 MiB**, Cube-Achse 109 Schritte = 2,89 MiB. Gewählt ist die eigene — 3,9 MiB gegen die
> 77,84 MiB des Cubes sind nichts, und dafür bleibt, was MOSMIX als **einzige** Quelle im Repo kann:
> **stündlich bis 246 h**. Der Cube ist ab 51 h dreistündlich, weil FLÄCHEN teuer sind; eine
> Stationsreihe ist es nicht.
> **Ergebnis:** Lauf 2026091103 · **3 071 Stationen** von 5 648 im Ausschnitt · **179 Bündel ·
> 6,71 MiB · 9 094 710 Werte** · 12 von 51 Ebenen belegt. Länderabdeckung **gezählt statt
> übernommen** (die Quellenmatrix §7 sagt selbst, dass die Zahlen für DE und AT nicht ermittelt
> sind): **DE 281 · AT 120 · CH 122**, Höhen 0…3 797 m. `srcCount` = 1; `ensCount` bleibt **MISSING
> statt 0** — 0 hieße „gemessen und null". `hModEff` trägt die Stationshöhe: MOSMIX gilt AM Ort,
> PAP 4 hat hier nichts zu korrigieren — genau deshalb darf die Quelle nicht ins Gitter.
> **Verortungsbeweis gegen eine UNABHÄNGIG geholte Quelle:** vier Stationen einzeln aus
> `single_stations/` abgerufen, die Bündel mit dem Client-Leser zurückgelesen ⇒ je **2 470 Werte,
> 0 fehlend, größte Abweichung 5,0·10⁻³** = exakt der halbe Quantisierungsschritt. Bei einer
> Verschiebung um eine Spalte oder Stunde wäre das um Größenordnungen eingebrochen.
> ⚠ **Zwei Betriebsbefunde, die nicht zur Etappe gehörten.** (1) **Der Cron erreicht MOSMIX-L nie im
> eigenen Zyklus:** die Datei erscheint bei Lauf **+ 72…79 min**, der Job läuft bei + 50 min ⇒
> genommen wird stets der Vorlauf, ~6,8 h alt. Kein Fehler, aber es muss dastehen: `ageH` und ein
> `caveat` im Manifest (V-PD-28). (2) **Das Stationsprodukt fiel durch JEDE Aufbewahrung** —
> `runsIn(point/)` nimmt nur Verzeichnisse, die wie ein Lauf HEISSEN, und `stations` heißt nicht so:
> 6,7 MiB je Lauf, achtmal täglich, unbegrenzt und lautlos. Kur: dieselbe Regel in einer zweiten
> Runde, derselbe Boden, und **überalterte Läufe werden benannt statt verschwiegen**; am Datenträger
> mit drei gealterten Läufen nachgebaut.
> **Laufzeit:** 38,6 + 0,9 = **39,5 min** gegen `JOB_MAX_MIN` 50 — unverändert ausreichend, der
> Schritt steht `continue-on-error` in der Vorlage (das Stationsprodukt darf den Cube nicht
> mitreißen). Kill-Switch `POINT_STATIONS=0`.
> `verify:point-data` **533/533** (nach B8: 482), typecheck 0 Fehler, Build 241/241, Budget grün und
> **`totalJs` 1 366 unverändert** (Textsonde: `stationBundlePath`, `kml:Placemark`,
> `MOSMIX_L_LATEST` in **null** Chunks).
> **Nicht veröffentlicht** — `POINT_PUSH` bleibt aus.
>
> ✅ **PD-B10 umgesetzt (§45) — σ_ens reicht bis 336 h (V-PD-27), und drei Fehler aus PD-B8 sind
> behoben.** Jans Entscheidung vom 2026-09-11: ECMWF-Member für t2m + Niederschlag im 48-h-Raster.
> Neu: `scripts/point/adapters/ecmwfEns.mjs` (IFS-ENS als reine σ_ens-Quelle, 50 Member, nichts ins
> Mittel), `scripts/point/adapters/ensembleStats.mjs` (EINE Streuungsrechnung für alle Ensembles,
> netzfreier Selbsttest), `fetchRanges()` in `shared.mjs`. **Am Katalog gemessen, bevor gebaut
> wurde:** 50 gestörte Member einzeln adressierbar, kein Kontrolllauf in `enfo-ef`; je Member `2t`
> 0,63 und `tp` 1,05 MiB (die 55,8 MiB aus PD-B8 galten einem anderen Parameter); nur **00z/12z**
> reichen bis 336 h.
> ⚠ **Fehler 1 aus PD-B8: `precip_sd_ens` war die Streuung einer SUMME.** Der Ensemble-Pfad streute
> direkt über `tot_prec`, also über den Niederschlag seit Laufbeginn, und schrieb das in eine
> mm/h-Ebene. Gemessen an ICON-D2-EPS: in nassen Zellen **2,5- bis 3,7-mal** zu groß, über alle
> Zellen bei +48 h 1,23 statt 0,04; bei IFS-ENS +240 h **9,57 statt 0,18 (Faktor 53)** — immer im
> erlaubten Wertebereich. Zellen, in denen es JETZT trocken ist, trugen die Streuung des Regens der
> letzten Tage. Kur: je Member `max(0, Summe[t] − Summe[t−Δ]) / Δ` mit Δ = Stufenschritt, Member
> über ihre **Nummer** gepaart (der Decoder liest dafür jetzt Oktett 36 der Templates 4.1/4.11 — die
> Reihenfolge wäre V-PD-25). **Die Kur hat Folgen, die dastehen:** ICON-EU-EPS rechnet ab 78 h
> 6-stündlich, ICON-EPS global ab 132 h 12-stündlich — dort ist die Rate nicht bildbar und die Ebene
> bleibt MISSING. **Die Fernstufe hatte also nie ein richtiges σ_ens für Niederschlag, nur ein
> falsches**; das richtige kommt jetzt von IFS-ENS.
> ⚠ **Fehler 2 aus PD-B8, schwerer: IFS HRES und AIFS Single lieferten seit PD-B8 NICHTS.** Der
> Indexfilter wurde auf `type !== 'cf'` umgestellt, damit Ensembles nur den Kontrolllauf behalten —
> als EINE Bedingung für alle Modelle. Deterministische Dateien tragen `type: "fc"`: am echten
> `.index` blieben **0 von 36** (IFS HRES) und **0 von 21** (AIFS Single) Einträgen. Jenseits 180 h
> tragen genau diese zwei Quellen — der PD-B8-Cube hatte dort **gar keine Vorhersage** (156 von 336
> Stunden). Der einzige Hinweis war die Größe (Stufe 3: 1,29 → 0,38 MiB), und den habe ich in §43.12
> übersehen. **Und der Verifier hat den Fehler bestätigt statt gefunden:** er verlangte per Regex
> genau diese Zeile. Kur: `keepIndexEntry()`, vom Verifier mit Zeilen in echter Form gefüttert.
> Veröffentlicht war nichts davon — der Cron baut mit dem committeten Stand vor PD-B8.
> **Warum 50 Member und nicht 20:** gemessen weicht σ aus 20 bei t2m im Median um 4,9 % ab, bei
> Niederschlag um **39,9 %** — intermittierend, ob eine Teilmenge die nassen Member erwischt, ist
> Zufall. 538 MiB, innerhalb der freigegebenen ≈ 558.
> **Mehrere Byte-Bereiche in EINER Anfrage:** `data.ecmwf.int` liefert 50 Bereiche als HTTP 206
> multipart — **5 statt 150 Anfragen** je Schritt; Teile über `Content-Range` zugeordnet (Server
> dürfen umordnen und zusammenlegen), Abbruch VOR dem Lesen, wenn der Server die ganze Datei schicken
> will. Derselbe Weg für die deterministischen ECMWF-Felder: **12/12 Chunks byte-gleich** zum
> Einzelweg.
> **Je Stunde genau EINE Quelle** — Member zweier Modelle zu mischen wäre σ_div in der σ_ens-Ebene.
> Stufe 3: 144/168 h ICON-EPS global (nur t2m), 192/240/288/336 h IFS-ENS. ⚠ Der Quellenwechsel
> ist sichtbar (168 h 1,93 K → 192 h 1,47 K): zwei Systeme streuen verschieden — `byHour` im
> Manifest benennt es, ausgleichen kann erst `c(p,f)` je Quelle (V-PD-32).
> **Der Beleg:** σ_ens(t2m) wächst ohne Vorgabe im Code, 1,47 → 2,35 → 2,60 → 3,48 K (192 → 336 h);
> Adapter und eine getrennt geschriebene Sonde stimmen auf die Stelle (2,350 K · 0,180 mm/h · 312
> geklemmt). **Und σ_div gegen σ_ens kippt mit der Vorhersagezeit:** in Stufe 1 streuen die Modelle
> stärker als das Ensemble (0,63 gegen 0,46 K bei +6 h), in Stufe 3 sind sich IFS HRES und AIFS
> Single weit einiger, als die Lage sicher ist (0,63 gegen **2,35 K** bei +240 h). Einen festen
> Faktor zwischen beiden gibt es nicht — PAP 6 verzweigt zu Recht.
> **Gesamtlauf kalt:** EXIT 0, **42,3 min**, 7,8 GiB Netz, 276 Chunks, 83,63 MiB. Der PD-B8-Wert
> (38,6 min) war zu kurz gemessen, weil die ECMWF-Abrufe fehlten ⇒ `JOB_MAX_MIN` **55**. 
> ⚠ **Fehler 3 aus PD-B8, gefunden über den Speicher:** die neue Speicherzeile je Stufe zeigte in
> Stufe 1 **Heap max 3 486 von 4 144 MiB (84 %)** — die Lage aus §43.11, 16 % davor. Ursache:
> `jsfive` liefert gechunkte HDF5-Daten als gewöhnliches JS-Array, und der C-LAEF-Fenstercache legte
> es so ab — gemessen **72 MiB Heap je Fenster** statt der ~19 MiB, mit denen §43.11 die Obergrenze
> von 26 ausgelegt hatte (bis zu ~1,9 GB). Dazu wurde jedes Fenster doppelt entpackt (`d.value` ist
> ein Getter). Kur: `Int16Array` (je Fenster 0 MiB Heap, 18 MiB außerhalb), einmal lesen.
> Danach **Heap max 98 statt 3 486 MiB**, Prozess 1,5 statt 3,8 GB; mit halbierter
> Heap-Grenze stirbt der alte Code nach 444 s („heap out of memory“), der neue läuft durch. Der
> Gesamtlauf (42,3 min) ist noch mit dem alten Code gemessen, neu gemessen ist Stufe 1.
> ⚠ Plattencache **9,1 GiB** gegen 14 GB auf dem Runner — erstmals gemessen (V-PD-36).
> **Nebenbefunde, nur benannt:** ⚠⁷ der Quellenmatrix gilt auch für IFS ENS (Jans Dokument,
> V-PD-33); AIFS Single fällt in Stufe 2 aus, weil die Horizontsuche die erste Stunde prüft
> (V-PD-37, älter als PD-B10); `--run` aus der Cron-Vorlage erreicht den Producer nie (V-PD-38).
> `verify:point-data` 586/586 (nach B9: 533), typecheck + Build + Budget grün, `totalJs` 1 366,1
> (+0,1 KB Decoder, nicht im Start-Chunk). **Nicht veröffentlicht** — `POINT_PUSH` bleibt aus.
>
> ✅ **PD-C1/PD-C2 umgesetzt (§46) — Betrieb zuerst, weil NICHTS von PD-B je im Daten-Repo ankam.**
> Gemessen am GitHub-API-Verlauf: **0 von 7 Cron-Läufen veröffentlicht**, CDN auf Schema 1 /
> Handlauf `2026090912`. Läufe 1–6 starben am Publish — die sparse-Muster `point` + `index.json`
> deckten `.gitattributes` nicht, der §29-Wächter im Publisher brach korrekt ab, nur eben erst im Job;
> Lauf 7 am Bau — ein ECMWF-429 bei AIFS Single, ungefangen in der deterministischen Schleife
> (V-PD-40, jetzt belegt). Kur C1: drittes sparse-Muster, Nachprüfung im Job, `timeout-minutes`
> 330 → 75, und `scripts/point/sparseCover.mjs` als EINE Form für Publisher und Verifier — der
> Verifier liest den Block der Vorlage und hält ihn gegen die Publisher-Pfade (Negativ-Kontrolle:
> das deployte Muster fällt durch). Kur C2: `safeCall()` um alle sechs deterministischen
> Adapteraufrufe (Fehler je Quelle gezählt, ab 5 fällt die Quelle, Abbruch nur ohne jede Quelle),
> Drosselung zählt gegen 10 min Wartezeit statt gegen Versuche, ECMWF-Takt 600 ms, Netz **je Quelle**
> im Log und Manifest (`tiers[].net`), Fehlerinjektion `POINT_FAULT_INJECT`, `--run` als Obergrenze
> (V-PD-38), Cache je Stufe leeren (V-PD-36, nur im Cron). **Laufzeitbeweis:** Bau mit injiziertem
> AIFS-Fehler ⇒ 6 Fehler, Quelle herausgefallen, IFS trägt, 12 Chunks, EXIT 0; Cron-Nachbau mit
> sparse-Klon ⇒ Publisher Exit 0. `verify:point-data` **615/615**, typecheck grün.
> ⚠ **Nicht deployt — Jans Gate PD-C3:** die Vorlage nach `buscosun-data/.github/workflows/point.yml`
> kopieren, vorher C1+C2 pushen (der Cron klont den Producer frisch). Plan: `~/.claude/plans/…`
> (PD-C1…C16), Etappen C3 ff. offen.
> **Werkzeugfalle zum dritten Mal in dieser Phase:** `[^
]` in einer Regex wurde durch die
> Python-in-Bash-Kette zum echten Zeilenumbruch und hat den Verifier zerschossen. Kur wie
> festgelegt — Edit-Werkzeug und `NEWLINE`-Konstante, hier ganz ohne Regex.
> **E-19 erledigt (§31) — und die Messung hat meinen eigenen Vorschlag widerlegt.** Die
> Slots liefen ins Publish-Fenster der Kartenlinie (:30 derselben Stunden); ich hatte
> `10 1,7,13,19` vorgeschlagen, **ausdrücklich als ungemessen markiert**. Auf Jans „kannst
> du das verschieben?" erst gemessen (`Last-Modified` der letzten gebrauchten Datei, über
> **vier** Läufe): **ICON-D2 Lauf + 1,35 h** (±0,01), **ICON-EU + 3,53…3,70 h**,
> **IFS + 6,45 h** (`scda` 06/18z) bzw. **+ 7,57 h** (`oper` 00/12z, volle 360 h). Um
> 01:10 ist also **nicht einmal ICON-D2 fertig** — mein Vorschlag war falsch. Gültig ist
> **`50 3,9,15,21`**: jede Quelle mit dem neuesten Lauf, den sie *vollständig* hat, und
> **100 min** Abstand zum Repack-Push. Fachlicher Gewinn obendrein: beim alten Takt waren
> ICON-EU und ICON global des laufenden Zyklus noch nicht fertig, der Ingest fiel auf den
> vorigen Lauf zurück — **sechs Stunden verschenkte Frische in t2 und t3**.
> Neuer Wächter, der es **ausrechnet** statt es zu behaupten: `verify:point-data` liest die
> Cron-Zeilen aus **beiden** Vorlagen und misst den engsten Abstand — mit Negativ-Kontrolle,
> die beziffert, wie eng es war: **der alte Slot 02:10 hatte 20 min bei 20–40 min Laufzeit**.
> Der Publisher sieht zusätzlich nach dem Push nach und purgt das CDN **nur, wenn die Dateien
> wirklich auf `origin/main` stehen** (sonst ersetzte der Purge die letzte gute Fassung durch
> eine 404). `verify:point-data` **241/241**.
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
> die Aussage am Code fest. `verify:point-data` **241/241**.
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
