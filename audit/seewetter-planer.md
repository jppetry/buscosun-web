# Phase SP — „Ausfahrt planen“ auf `/seewetter`

> Stand 18.11.2026. Auftrag (Jan 18.11.): ein Planer für die Ausfahrt auf der bestehenden Seewetter-Karte — Boot im
> Wasser vor dem Spot, Fenster Start → Rückkehr im Stundenband, Rückkehrlinie mit Wind zum Rückweg, Befunde für das
> ganze Fenster, alles im Teilen-Link. Kein Schalter (Jans Entscheidung, Ausnahme von Rule 2). Keine Screenshots, keine
> Sichtprüfung durch mich (Jans Entscheidung 18.11.) — das Aussehen prüft Jan.

## 1. Diagnose (18.11., vor dem Code)

**Was es gibt (gelesen an `cc99b3c4`).**

| Baustein | Ort | Für den Planer |
|---|---|---|
| Stundenreihe je Spot (Wind, Böe, Richtung, Seegang; 79 h ab Lauf) | `seaClient.ts` `SeaSpotsDoc.series`, in `SeaPage.tsx` als `spotHours` (ab jetzt, `hourOf`) | die Stundenwerte des Fensters — schon geladen, kein neuer Abruf |
| Uferwinkel | `seaProfiles.ts` `shoreAngle` (30/75/105/150°), `SHORE_LABEL` | Wechsel im Fenster, Farbe der Drift-Pfeile (von See / vom Land) |
| Grenzen des Profils | `seaProfiles.ts` `SeaLimits` (`windMax`, `gustMax` in kn), `loadLimits` | „über deiner Grenze ab …“ |
| Sonnenstand | `src/photo/sun.ts` `sunAltitudeDeg` (schon von `classify` benutzt) | Rückkehr gegen Sonnenuntergang |
| Pegelkurve | `waterLevel.ts` `wlAt`, in `SeaPage.tsx` `tideDoc`/`tideGauge` (Pegel MIT Kurve, E-WL-10) | Wasserstand zur Rückkehr — nur wo eine Kurve da ist |
| Karte | `SeaMap.tsx` (MapLibre, Bildquelle + GeoJSON-Ebenen, ein HTML-Marker `callout`) | Boot = Marker, Linie und Radius = Linien-Ebenen; keine eigene GL-Ebene nötig |
| Stundenband | `SeaBand.tsx` (Tabelle, Klick = Zeit) | Fenster als zusätzliche Zeile; ohne `plan` bleibt das Markup Byte für Byte (`verify:sea-wind-band` E1) |
| Zeit | `t` = Stunden ab jetzt, Chips + Band; im Link absolut (`share/hourOffset.ts`) | „mit Abspielen“ fehlt: ein Knopf, der `t` durch das Fenster führt |
| Adresse | `seaState.ts` `SeaUrlState` (`p`, `t`, `tw` …), einziger Schreiber `SeaRoute.tsx` | ein neuer Schlüssel; die Route-Tabelle und das Edge-Bündel kennen keine Seewetter-Parameter (`shareParser.js` nur die Route) ⇒ kein Eingriff dort |
| Mobil | `sw-bar` (Karte · Spot · Ebenen · ggf. Schwelle), Seiten als `sw-m-dock` über der Karte | „Ausfahrt“ als vierter Eintrag; der Planer braucht die Karte ⇒ Blatt statt Vollseite |

**Was fehlt.** (a) Die Rechnung für ein Fenster: Höchstwerte mit Stunde, erste Stunde über der Grenze, Wechsel des
Uferwinkels, Wind relativ zum Rückweg, Sonnenuntergang — heute rechnet die Seite je Stunde, nie über ein Fenster.
(b) Boot, Linie, Radius auf der Karte. (c) Fenster im Band. (d) Abspielen. (e) Zustand im Link. (f) Einstiege.

**Was nicht angefasst wird.** Motor (`src/pointForecast/**`), Edge Functions, Shader/WebGL-Pipeline, Abhängigkeiten,
Producer und Workflows. **Daten-Repos: kein Bedarf** — der Planer liest nur, was die Seite schon lädt; es gibt in
dieser Phase keinen Push nach `buscosun-data` oder `buscosun-archiv`.

**Grenzen der Daten, die die Anzeige sagen muss.**
1. Wind und Böen sind **am Spot** gerechnet (Wasserzelle des Spots, ≤ 3 km vom Spot), nicht am Boot. Deshalb der Radius.
2. Es sind **Stundenwerte**. Ein Fenster hat einen „höchsten Stundenwert“, keine Spitze dazwischen. Die Anteile „über
   Grenze“ (Phase SU) gelten je Stunde und werden nie zu einer Aussage über das Fenster zusammengezogen.
3. Aus Wind allein folgt keine Abdrift (Bootstyp, Strömung, Seegang fehlen) ⇒ nur die **Richtung**, keine Strecke, keine
   Zeit, kein „sicher“/„unsicher“.
4. Die Rückkehrlinie ist die gerade Verbindung Boot → Startort, kein Kurs (Land, Flachwasser, Fahrwasser unbekannt).
5. An Watt-Spots (`tidal`, 7 von 56) liegt die Wasserkante je nach Wasserstand Kilometer weiter ⇒ dort keine Aussage
   über einen Abstand zum Ufer.
6. Die Pegelkurve des BSH endet im Median bei + 54 h und fehlt an vielen Pegeln ⇒ Wasserstand nur, wo sie da ist und
   reicht.

## 2. Entscheidungen (gesetzt, Jan kann sie drehen)

| Nr. | Frage | Entscheidung |
|---|---|---|
| E-SP-1 | Schalter | **keiner, an für alle (Jan 18.11.)**. Ohne geöffneten Planer rendert keine Klasse dieser Phase außer dem Knopf bzw. dem Eintrag „Ausfahrt“ |
| E-SP-2 | Radius des Boots | `SEA_PLAN_RADIUS_KM = 5` (`set`, in der Anzeige „gesetzt“ genannt): rund zwei Gitterweiten des Kurzfristmodells um den Punkt, an dem der Wind gerechnet ist. Alternative 3 km (= `SEA_SPOT_MAX_CELL_KM`, die Regel Spot ↔ Wasserzelle) |
| E-SP-3 | Klassen „Wind zum Rückweg“ | dieselben Grenzen wie der Uferwinkel (30 / 75 / 105 / 150°, `set`): von vorn · schräg von vorn · von der Seite · schräg von hinten · von hinten |
| E-SP-4 | Fenster beim Öffnen | Start = gewählte Stunde, Rückkehr 3 h später (`set`), mindestens 1 h, höchstens bis zum Ende der Reihe |
| E-SP-5 | Abstand zum Ufer | **nirgends** — strenger als der Auftrag (der ihn nur an Watt-Spots verbietet): es gibt keine Uferlinie in den Daten, nur die Ufernormale aus der 0,93-km-Maske. Genannt wird die Strecke Boot → Startort; an Watt-Spots mit dem Satz, dass sie nicht zur Wasserkante führt |
| E-SP-6 | Startlage des Boots | Mitte der Wasserzelle des Spots (laut Wellenmodell Wasser), mindestens 0,8 km vom Spot in derselben Richtung |
| E-SP-7 | Link | ein Schlüssel `pl=<Start>_<Rückkehr>_<Breite>_<Länge>`, Zeiten absolut als volle UTC-Stunde (`JJJJMMTTHH`), Lage auf 4 Stellen (≈ 11 m); das Profil steht schon in `p`. Ein Fenster in der Vergangenheit wird mit gleicher Dauer auf jetzt gesetzt und die Seite sagt es |
| E-SP-8 | Boot an Land | nicht geprüft: die Wellenmaske (0,93 km) würde ufernahe Lagen fälschlich sperren, eine Küstenlinie liegt nicht vor (V-SP-1) |
| E-SP-9 | Anteile „über Grenze“ im Planer | nur in den Karten „Start“ und „Rückkehr“, je für diese eine Stunde; in den Befunden zum Fenster stehen sie nicht |

## 3. Plan

1. `src/sea/seaPlanner.ts` (rein): Geometrie (Strecke, Kurs, Radius), Wind zum Rückweg, Drift-Richtung und -Seite,
   Befunde des Fensters, Sonne zur Rückkehr, Link-Schlüssel, Wortlaute.
2. `seaState.ts`: Schlüssel `pl`. `SeaMap.tsx`: Boot-Marker, Rückkehrlinie, Radius. `SeaBand.tsx`: Zeile „Fenster“.
3. `SeaPlanPanel.tsx` (Befunde: Readout am Desktop, Blatt mobil), `SeaPage.tsx` (Einstiege, Zustand, Abspielen),
   `seaDeck.css` (`sw-pl-*`, mobil nur per Media Query).
4. Gate: `verify:sea-planner` (echte Spot-Datei), typecheck, build, budget, `verify:sea-*`.

## 4. Umsetzung (18.11.)

| Teil | Datei | Was |
|---|---|---|
| Rechnung | `src/sea/seaPlanner.ts` (rein, neu) | Geometrie (`planDistKm`, `planBearingDeg`, `clampToRadius`, `radiusRing`, `defaultBoat`), `relativeWind` (Wind zum Rückweg), `driftOf` (Richtung + Seite, sonst nichts), `planWindow`/`defaultWindow` (Fenster auf der Stundenachse), `planFindings` (Höchstwerte mit Stunde, erste Stunde über der Grenze, Wechsel des Uferwinkels, Wind Start → Rückkehr, fehlende Stunden), `sunAround`, Link `encodePlanParam`/`parsePlanParam`, alle Wortlaute als Konstanten oder reine Funktionen |
| Adresse | `src/sea/seaState.ts` | Schlüssel `pl` (`SEA_PL_RE`), in fester Reihenfolge nach `tf`; ohne Planer bleibt die Adresse wie bisher |
| Karte | `src/sea/SeaMap.tsx` | Prop `plan`: Boot als ziehbarer `maplibregl.Marker` (im Radius gehalten, Pfeiltasten 100 m), Beschriftung der Linie und „Startort“ als Marker, Quelle `sw-plan` mit drei Linien-Ebenen (Ring, Linie, Unterlage). Keine eigene GL-Ebene |
| Band | `src/sea/SeaBand.tsx` | Prop `plan`: Zeile „Fenster“ (Maus: über die Zeile ziehen; zwei Griffe S/R mit Zeiger und Pfeiltasten; mobil nur die Griffe), Spalten des Fensters getönt. Ohne `plan` unverändert |
| Befunde | `src/sea/SeaPlanPanel.tsx` (neu) | Kopf, amtliche Meldung im Wortlaut zuerst, Profil, Schiene Start → Befunde an ihrer Stunde → Rückkehr, „Im ganzen Fenster“, Hinweise, Fuß. Rechnet nichts |
| Seite | `src/sea/SeaPage.tsx` | Einstiege (Knopf in `sw-ov-right` über der Legende; vierter Eintrag „Ausfahrt“ in `sw-bar`), Zustand (`plan` in absoluter Zeit, `planAsk`, `planPick`), Link, Abspielen über das bestehende `t`, Karten-Ausschnitt auf den Radius, Layout im Planer-Modus |
| Stil | `src/sea/seaDeck.css` | `sw-pl-*`, `sw-band-planrow`; mobil (Blatt, 44-px-Griffe) nur in der Media Query der Seite |
| Prüfer | `scripts/verify-sea-planner.mjs`, `package.json` | `verify:sea-planner` |

**Layout im Planer-Modus.** Desktop: rechts statt der Spot-Auswahl die Befunde („Spot wechseln“ holt die Auswahl zurück),
am Kartenfuß das Stundenband (seine ursprüngliche Lage), die Legende klappt darüber als „Legende“ zu — umgruppiert, nicht
entfernt. Telefon: Blatt über dem Kartenfuß mit Band und Befunden; „Karte“ zeigt Karte und Legende, das Boot bleibt.

**Regeln der Anzeige.** Nur Stundenwerte („Höchster Stundenwert im Fenster“). Die Anteile „über Grenze“ (SU) stehen nur
in den Karten Start und Rückkehr, je als „Nur diese Stunde: …“. Drift: drei Winkel, Richtung und Farbe (von See / vom
Land / längs des Ufers), keine Zahl. Die Linie heißt „gerade Verbindung … kein Kurs“. Strecke immer „zum Startort“. An
Watt-Spots zusätzlich der Satz zur Wasserkante. Wasserstand zur Rückkehr nur, wenn der Pegel der Seite eine Kurve trägt;
reicht sie nicht bis zur Rückkehr, steht das da. Fuß: „Amtliche Warnungen gehen vor.“

## 5. Gate (18.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-planner` (neu, netzfrei, ohne Browser) | **46/46** — A echte Lauf-Datei 17.11. 12 UTC + Auffrischung, gelesen wie im Betrieb · B Fensterlogik gegen aus der Datei abgelesene Werte UND eine zweite Regel (Höchstwerte auf 390 Fenstern = `Math.max`, erste Stunde über der Grenze = erste Stunde, in der `classify` die Grenze nennt; Wechsel des Uferwinkels 11–39; fehlende Stunden echt: vier Stunden ohne Wind, eine ohne Richtung) mit sechs Negativkontrollen · C Wind zum Rückweg inkl. 350° → 10° und der echten Drehung über Nord (Fehmarn 351° → 28°) · D Geometrie, Startlage an allen 56 Spots · E Fenster auf der Achse, Link · F Sonnenuntergang (15:21 UTC am 18.11.) · G Wortlaut auf 244 Texten mit Gegenproben · H Markup von Band und Befunden, Verdrahtung, CSS |
| Im ersten Lauf rot, behoben | G6: das Abzeichen nannte die Böe ohne Einheit („Böen 23“) — Code korrigiert. G2: mein Muster „Abstand zum Ufer“ traf „längs zum Ufer“ (eine Richtung) — Muster auf Länge + Ufer gestellt, Wort in „längs des Ufers“ geändert |
| `verify:sea-wind-band` | 41/41 — E1: das Stundenband ohne Planer ist Byte für Byte das von HEAD |
| `verify:sea-contract` · `-decode` · `-text` · `-waterlevel` · `-tide-window` · `-seo` | 30/30 · 13/13 · 35/35 · 63/63 · 49/49 · 23/23 |
| `verify:sea-derive` | 70/70 |
| `verify:sea-ui` | **nicht gelaufen**: Browser-Prüfung (Jan: keine Browser-Prüfungen in dieser Phase), an HEAD in B0 rot (V-TF-5) |
| `verify:fusion-release` | 33/33 |
| `npm run typecheck` | grün |
| `npm run build` | grün (280/280 Shell-Prüfungen) |
| `npm run budget` | grün: eagerJs 114,4 / 115 KB · eagerCss 2,4 / 2,5 KB · largestChunk 278,4 / 302 KB · totalJs 1 976,4 / 1 985 KB (vor der Phase 1 966,9 laut SU-Gate ⇒ +9,5 KB, nur lazy) |

**Die fünf Fragen** (Bild-Belege entfallen auf Jans Wort; was deshalb offen ist, steht dabei).
1. *Funktionserhalt:* ohne Planer ist das Band Byte für Byte das von HEAD; neu sichtbar sind nur der Knopf und der
   Eintrag. Im Planer-Modus sind Legende (zugeklappt) und Spot-Auswahl („Spot wechseln“) einen Klick entfernt, die
   Spot-Kachel der Karte entfällt, solange der Planer offen ist. **Nicht im Browser nachgesehen.**
2. *Desktop pixelgleich:* **nicht gemessen.** Bekannte, gewollte Änderung: der Knopf über der Legende; `.sw-ov-right`
   ist dafür eine Spalte (`flex`).
3. *Touch-Ziele:* per Regel 44 px (Griffe, Schließen, Stunden vor/zurück, Abspielen, Boot); **nicht gemessen**.
4. *Konsole:* **nicht gemessen.**
5. *Long Tasks:* **nicht gemessen.** Rechnung je Änderung: ein Durchlauf über die Stunden des Fensters und höchstens
   2 × 1 440 Sonnenhöhen; beim Ziehen des Boots kein React-Zustand je Bewegung (erst beim Loslassen).

## 6. Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| **V-SP-1** | Das Boot lässt sich auf Land ziehen | Kein „Boot im Wald“. Skizze: Küstenlinie (BKG DLM250, wie V-SW-9) als Polygon je Spot ins Daten-Repo, Lage dagegen prüfen; die 0,93-km-Wellenmaske taugt dafür nicht |
| **V-SP-2** | Wind und Böen gelten für den Spot, nicht für das Boot; der Radius (5 km, gesetzt) ist die ehrliche Grenze | Wind am Boot: buscosun Fusion an der Bootslage aus dem Cube rechnen (Laufzeit-Hälfte, im Client vorhanden) — dann darf der Radius wachsen. Motor unberührt, aber ein eigener Abruf je Lage |
| **V-SP-3** | Ungesehen: Überlagerung von Abzeichen und Linienbeschriftung bei kurzem Abstand, Höhe des Bands am Desktop, Höhe des Blatts (46 %), Griffe gegen das Scrollen des Bands, `<details>` als Spalte | Jans Sichtprüfung (§91.1); danach die Maße nachziehen |
| **V-SP-4** | `verify:sea-planner` steht nicht in `.github/workflows/ci.yml` | Eine Zeile hinter „Verifier — Tidenfenster“ (wie V-SU-4) |
| **V-SP-5** | Vorschau-Karte und Teilen-Text kennen den Planer nicht (der Link trägt ihn, die Karte ist die der Route) | „Ausfahrt ab St. Peter-Ording, Sa 14–17 Uhr“ in `shareAdapters.ts` — das Bündel der Edge Function müsste neu gebaut werden (Jans Gate) |
| **V-SP-6** | Das Fenster steht in absoluter Zeit; läuft die Uhr über den Start, wird es stillschweigend gekürzt und die Seite sagt nur „ein Teil liegt außerhalb“ | Eigener Satz „Dein Start liegt in der Vergangenheit“ mit Knopf „ab jetzt“ |
| **V-SP-7** | Wasserstand zur Rückkehr gibt es nur mit eingeschalteter Ebene „Wasserstand-Vorhersage“; mit `?tf=0` zählt nur der nächste Pegel, auch wenn er keine Kurve trägt | Den Pegel mit Kurve (E-WL-10) für den Planer unabhängig vom Tidenfenster suchen |
| **V-SP-8** | Abspielen läuft einmal durch, 0,9 s je Stunde (gesetzt), ohne Schleife | Tempo und Schleife nach Jans Blick |
| **V-SP-9** | Mobil verdeckt das Blatt die Quellenzeile der Karte, solange es offen ist (wie die anderen mobilen Seiten) | `--msl-bottom` auf die Höhe des Blatts setzen |
| **V-SP-10** | Die Stunden-Zellen des Bands sind am Desktop 27 px breit; die Griffe (22 px) liegen unter 44 px — Maus-Ziel, mobil 44 px | Am Desktop mit Touch (Tablet quer) die mobile Zeile zeigen |
