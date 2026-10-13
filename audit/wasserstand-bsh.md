# Phase WL — Wasserstandsvorhersage des BSH auf `/seewetter`

> **Auftrag Jan, 2026-10-12:** „Lizenz-Update BSH-Wasserstandsvorhersage: ist geklärt, bitte den Status
> ‚blockiert / Lizenz ungeklärt' aufheben und die Daten einbauen." Lizenz **CC BY 4.0**, EU High-Value-Dataset,
> kostenlos, ohne Registrierung, kommerziell nutzbar. Quelle:
> `https://gdi.bsh.de/ldproxy/rest/services/WaterLevelForecast`.
>
> Fünf Aufgaben: (1) Lizenz-Doku und Quellenliste auf „erlaubt, CC BY 4.0" mit Belegverweis, (2) Daten
> ausschließlich über die offizielle OGC API, kein Scraping von `wasserstand.bsh.de`, keine internen Endpoints,
> (3) den reinen Hinweis durch echte Daten ersetzen — Stationen auf der Karte, Vorhersagekurve je Pegel,
> Zeitstempel sichtbar, Antworten sinnvoll cachen, (4) Attribution sichtbar im UI, (5) nichts darf nach
> amtlicher Warnung oder BSH-Empfehlung aussehen; bei hohen Wasserständen auf `sturmflutwarndienst.de` verlinken.

## 0. Kurzfassung

Die Sperre stand an **vier Stellen im Code** und in **drei Dokumenten** — alle gefunden und benannt (§1). Die
API ist offen, CORS-frei nutzbar und trägt mehr, als der Auftrag verlangt (§3/§4): 136 Pegel, je Pegel eine
Modellkurve (10/15-min-Schritte, Vorhersage bis median +54,6 h, max +134 h), an der Nordsee zusätzlich 23
Hoch-/Niedrigwasser-Ereignisse mit Unsicherheit in cm, dazu der amtliche Vorhersagetext, die amtliche
Warnkategorie und Lizenz/Copyright **je Datensatz**.

Zwei Dinge waren Jans Wahl (§5): die Anzeige ist **voreingestellt an** (`?wl=0` schaltet aus) — eine bewusste
Ausnahme zur Regel „neue Rechenpfade default-off" (CLAUDE.md Rule 2), hier festgehalten; und die **Lage** der
136 Pegel kommt als kompakter Spiegel aus dem Daten-Repo (`sea/v1/static/gauges.json`, ≈ 6 KB gz), die
**Kurven** live aus der offiziellen API (1,5–10 KB gz je Pegel). Damit kostet die Voreinstellung „an" auf
Mobil nichts Nennenswertes, und die Daten kommen trotzdem ausschließlich aus der offiziellen API — der
Spiegel wird von unserem Producer aus derselben API gebaut.

**Der Befund, der die Anzeige geformt hat (V-WL-8, §4):** die **amtliche** Höhe eines Hoch- oder
Niedrigwassers reicht nur etwa einen Tag voraus. Darüber hinaus trägt an 39 von 82 Pegeln nur die
automatische Modellvorhersage (MOS) eine Zahl — an 732 von 1 863 Ereignissen ist sie die einzige. Die Karte
zeigt sie deshalb, aber nie als amtlichen Wert: jede Zeile nennt ihre Herkunft („amtlich" mit ±,
„automatisch (MOS r0)", oder „nur Zeit, kein Wert"). Gefunden hat das der Verifier, weil meine erste Sonde
den falschen Schlüsselnamen gelesen hatte.

**Ehrlichkeitsgrenze (§5, E-WL-6):** Der amtliche Warnstatus wird **nur wörtlich** gezeigt, wie beim
Warn-Layer und bei den GeoSphere-Texten (CLAUDE.md Sonderregel). Die BSH-Warnkategorie gilt laut
Parameterdoku **nicht pegelgenau**, sondern für die Nord- bzw. Ostsee — das steht im UI dabei. Für Warnungen
verweist die Karte auf `sturmflutwarndienst.de`; buscosun warnt nicht.

## 1. Bestand — wo die Sperre stand

Gesucht über den ganzen Baum (`BSH|Wasserstand|wasserstand|Seeschifffahrt|Sturmflut`), 13 Treffer-Dateien,
davon vier mit Code-Wirkung:

| Ort | Text | Wirkung |
|---|---|---|
| `src/sea/SeaDock.tsx:106–109` | Nicht klickbares Feld `sw-toggle is-blocked` mit Schloss-Icon, „Wasserstand-Vorhersage / blockiert · BSH-Lizenz ungeklärt" | Dock zeigt die Sperre als vierten, toten Schalter |
| `src/sea/SeaReadout.tsx:276` | Quellenzeile `['blockiert', 'Wasserstand-Vorhersage (BSH)', 'Lizenz ungeklärt — nur Hinweis, keine Daten', 'block']` | Reiter „Quellen" |
| `src/sea/SeaReadout.tsx:132` | „Watt: das Modell rechnet mit Gezeit und Wassertiefe, der Wasserstand selbst wird hier nicht gezeigt (BSH-Vorhersage gesperrt)." | Satz an Watt-Spots |
| `src/sea/seaView.ts:156` | `dryNote(...)`: „Der Wasserstand selbst wird hier nicht gezeigt (BSH-Vorhersage gesperrt); …" | Satz an trockenfallenden Zellen |
| `scripts/verify-sea-ui.mjs:285` | Prüfung D7 verlangt `/blockiert/` im Quellen-Reiter | Gate wird rot, sobald die Sperre fällt — **beabsichtigt**, wird mitgeändert |

Dokumente mit dem alten Status: `audit/seewetter-datenpruefung.md:128` („Lizenz nicht geprüft | blockiert,
nur Deep-Link"), `audit/seewetter-konzept.md:168` und `:351` (E-SW-7), `audit/seewetter-plan.md:22` und `:198`,
`audit/seewetter.md:736` und `:877`. In `docs/API.md` und `docs/DATA_SOURCES.md` war das BSH **überhaupt nicht
geführt** — es gab also keinen falschen Eintrag, sondern eine Lücke; beide bekommen jetzt einen.

**Kein Scraping im Bestand.** Es gab keinen Abruf gegen `wasserstand.bsh.de` und keinen internen Endpoint —
die Sperre war reiner Text. Aufgabe 2 ist damit keine Umstellung, sondern eine Regel für den Neubau.

## 2. Lizenz — Beleg aus der Quelle selbst

Die Lizenz steht nicht nur auf der Portalseite, sie steht **in jeder Antwort**:

- `collections?f=json` → `description`: „The offered data meets the legal requirements for a **high-value
  dataset** … This is why the data can be obtained **free of charge and without registration** and reused
  under the **'CC BY 4.0'** licence." Dazu wörtlich die Auflagen: Namensnennung, Link auf die Lizenz, Angabe
  von Änderungen, „must not give the impression that the licensor supports or recommends you or your use",
  keine zusätzlichen Restriktionen.
- Jedes Feature trägt `licence = "CC BY 4.0"` (136/136) und `copyright` (de/en), de wörtlich:
  „@Bundesamt für Seeschifffahrt und Hydrographie (BSH). Das BSH übernimmt für die angegebenen Informationen
  keine Gewähr. Amtliche Wasserstandsvorhersage des Bundes gemäß §1 SeeAufG."
- Parameterdoku (`parameter_documentation.pdf`, Stand 27.05.2026), Seite 1: „The information provided via the
  API may be incorrect or out of date, and **should not be relied upon instead of the officially published
  forecasts on the website** (www.bsh.de)."

Die zweite und dritte Zeile sind der Grund, warum im UI **drei** Dinge stehen müssen und nicht eines: die
Attribution (Aufgabe 4), der Gewährleistungsausschluss des BSH und der Verweis auf die amtliche
Veröffentlichung (Aufgabe 5). Der Satz „must not give the impression that the licensor … recommends you"
deckt sich mit Jans Aufgabe 5 — die Lizenz selbst verbietet den Eindruck einer BSH-Empfehlung.

## 3. Die API gemessen — Prüfbogen `docs/API.md` §9

Alles am 2026-10-12 gegen `gdi.bsh.de` gemessen, Rohdaten im Scratchpad der Sitzung.

| Punkt der Prüfliste | Befund |
|---|---|
| CORS im Browser | **offen.** `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST`, `Access-Control-Expose-Headers: Link, Content-Crs, OATiles-hint, Prefer, ETag` — auf der Collection **und** auf Einzel-Items (mit `Origin: https://buscosun.com` geprüft). Kein Edge-Proxy nötig |
| Lizenz, Attribution, kommerziell | §2: CC BY 4.0, kommerziell ausdrücklich gedeckt, Attributionsstring festgelegt (§5, E-WL-5) |
| API-Key, Registrierung | **keiner.** `access_token` ist als Parameter zulässig, aber nicht verlangt |
| Rate-Limit | keines erkennbar: 8 Einzelabrufe in Folge je `http=200`, 0,198–0,222 s, kein Drosseln, kein 429. Trotzdem sparsam: ein Abruf je Pegelwahl, TTL-Cache (§5, E-WL-4) |
| Aktualisierungstakt und echte Referenzzeit | **zwei Stempel je Pegel.** `forecast_timestamp` = amtliche Vorhersage (im Messfall 12:58:19+02:00, Textstempel 13:10:52), `automated_curveforecast_timestamp` = Modellkurve (17:11:26+02:00 — also stündlich oder häufiger, deutlich jünger als die amtliche). Je Ereignis zusätzlich `forecast_event_forecast_timestamp`. Alle Stempel mit explizitem UTC-Offset |
| Projektion, Eckkoordinaten | `CRS84` (WGS84 lon/lat), `storageCrs` identisch, Punktgeometrien. BBox der Collection `6.747778, 53.073056 … 14.7317, 55.016667` — reine Küste DE, deckt sich mit dem CWAM-Ausschnitt der Seite (`SEA_VIEW_BOUNDS` 6,1 … 14,95 / 53,2 … 56,5) |
| Format-/Kompressionsfilter | JSON (GeoJSON) und FlatGeoBuf. JSON reicht; FGB bräuchte einen Decoder und bringt nichts |
| Retention, Archivtiefe | **keine Historie.** Die Antwort trägt ein Fenster um „jetzt": die Kurve beginnt 8–34 h in der Vergangenheit (gemessene Reihe) und endet 54,6 h (median) bis 134,1 h in der Zukunft. Kein Zeitreise-Parameter; `datetime` filtert Features, nicht die Reihen. Animation über die Vergangenheit ist damit nicht möglich und nicht geplant |
| Abdeckung DE/AT/CH | **nur DE** (Nord- und Ostseeküste). AT/CH haben keine Küste — keine Länder-Asymmetrie, die ausgewiesen werden müsste; die Seite ist ohnehin DE-Küste |
| Fehlerverhalten bei fehlenden Daten | drei verschiedene Formen, alle gemessen: fehlendes Feld (`information_text` leer an 136/136), fehlender Block (`curve` an 43/136 **gar nicht da**, `high_water_low_water` an 54/136 nicht da), unbekannte Kennung ⇒ eigener Fehlerkörper mit `status`/`title`/`detail`. `properties=` wird mit **400** und einer Liste der gültigen Parameter abgelehnt — kein stilles Ignorieren |
| Kontrakt-Sonde | `verify:sea-waterlevel --live` (§7) |
| Beispiel-URL in `docs/API.md` | §8.10 neu (§8 dieses Dokuments) |

Zwei Fallen, die der Prüfbogen nicht abfragt und die ich hier festhalte:

- **V-WL-1 — 301 ohne CORS.** `…/collections?f=json` antwortet **301** auf `…?lang=en&f=json`. Der Redirect
  selbst trägt **keine** CORS-Header (`Content-Type: text/html`), nur die Zielantwort. `fetch` folgt dem
  Redirect und liest die Zielantwort, das geht — aber jede Sonde, die den ersten Hop prüft, sieht „kein
  CORS". Deshalb rufen wir von Anfang an mit explizitem `lang=` auf, dann entfällt der Hop.
- **V-WL-2 — gemischte Typen im selben Objekt.** `tidal_prediction_value`, `tidal_prediction` und
  `measurement` sind **Strings** (`"685"`), `forecast_value`, `forecast_uncertainty` und
  `automated_curve_forecast` sind **Zahlen**. `forecast_deviation` ist ein **deutsch formatierter String**
  (`"+0,2 m"`). Jeder Leser muss das abfangen, sonst steht `"685"` als Text in einer Rechnung.

## 4. Was die Daten tragen (Parameterdoku + Messung)

136 Pegel: **82 Nordsee**, **54 Ostsee**; Bundesländer SH 50, NI 37, MV 31, HH 8, HB 4, ohne 6.

**Werte-Bezug.** Alle Höhen in **cm über Pegelnull (PNP)**. `gaugezero_relative_to_nhn` (cm, gemessen −511
… 0) rechnet nach NHN um, `chartdatum_relative_to_gaugezero` auf Seekartennull. `mean_high_water` /
`mean_low_water` (131 bzw. 128 von 136) sind die Bezugsgrößen der Abweichungstexte. Die Ostsee-Texte sprechen
von Abweichung gegen **NHN**, die Nordsee-Texte gegen **das mittlere Hochwasser** — zwei Bezugssysteme in
einer Antwort, die im UI nie vermischt werden dürfen.

**`curve` (Tab. 4), 93 von 136 Pegeln.** Felder `timestamp`, `tidal_prediction` (Gezeitenvorausberechnung),
`automated_curve_forecast` (Modellkurve), `measurement` (gemessene Reihe) — nie alle vier zugleich: fünf
verschiedene Feldkombinationen gemessen. Schritt **15 min** an der Ostsee (337 Punkte, −24 h … +58 h),
**10 min mit 4- und 6-min-Einschüben** an der Nordsee (923 Punkte, −13 h … +137 h). Vorhersage vorhanden an
92, Messung an 89, Gezeit an 39 Pegeln.

**`high_water_low_water` (Tab. 2), 82 von 136 (alle Nordsee).** 23 Ereignisse ≈ 6 Tage: `event` HW/NW,
`event_timestamp`, `tidal_prediction_value`, `forecast_value`, **`forecast_uncertainty`** (cm, im Messfall
10), `forecast_deviation` („+0,2 m"), `forecast_automated_event_warning`,
`forecast_event_forecast_timestamp`, dazu die MOS-Felder `mos_forecast_r0_value` … `r5_value` je mit
`_deviation` und einem gemeinsamen `mos_forecast_event_forecast_timestamp` (Tab. 3).

**V-WL-8 — die amtliche Höhe endet nach etwa einem Tag.** Das ist der wichtigste Befund dieser Phase, und er
hat eine Fehlmessung von mir korrigiert: meine erste Sonde suchte `mos_forecast_value` (so nennt die
Parameterdoku die Zeile im Text), der Schlüssel heißt aber `mos_forecast_r0_value` — ich hatte deshalb „MOS an
0 von 82 Pegeln" notiert. Der Verifier fiel darüber, richtig nachgemessen über alle 1 863 Ereignisse:

| | Pegel | Ereignisse | mit amtlichem `forecast_value` | mit MOS r0 | nur MOS | ohne jede Höhe |
|---|---|---|---|---|---|---|
| mit MOS | 39 | 907 | 128 | 833 | **732** | 47 (23 davon mit r1 … r5) |
| ohne MOS | 43 | 956 | 152 | 0 | 0 | 804 |

Der amtliche Wert reicht **−4,5 … +20,9 h**, MOS **−13,2 … +133,6 h**. `forecast_uncertainty` gibt es nur
zusammen mit dem amtlichen Wert (128/128). Eine Anzeige, die nur `forecast_value` liest, zeigt also an 732
Ereignissen „–", obwohl eine Zahl vorliegt — und an 804 weiteren ist „–" die Wahrheit. Deshalb zeigt die Karte
den amtlichen Wert mit ±, sonst den MOS-Wert **mit genannter Herkunft** („automatisch (MOS r0)"), sonst nur
die Zeit („nur Zeit, kein Wert"); gelesen wird der erste belegte der dokumentierten Systeme r0 … r5, das
System steht dabei (Tab. 3 nennt je einen Grund, warum ein Ersatzsystem einspringt).

**43 Nordsee-Pegel ohne Kurve, nur mit Ereignissen.** Das ist kein Fehler, sondern die Form: an diesen
Pegeln gibt es Hoch-/Niedrigwasser-Zeiten, aber keine Reihe. Das UI muss beides einzeln können.

**`forecast_text`.** Nur **6 verschiedene Texte** für 136 Pegel: einer für die ganze Nordseeküste (82 Pegel)
und je einer pro Ostsee-Bereich (Kieler Bucht 15, Westlich Rügens 14, Kleines Haff 10, Östlich Rügens 9,
Lübecker Bucht 6). Der Text ist **gebietsbezogen, nicht pegelbezogen** — und trägt HTML (`<b>`). `de` und
`en` liegen beide vor. `forecast_text_additional` und `information_text` waren leer (0 bzw. 0 von 136).

**Warnkategorien (Tab. 5), wörtlich aus der Doku:** `Wasserstandsvorhersage` (Default), `Erhoehter
Wasserstand`, `Sturmflut`, `Schwere Sturmflut`, `Sehr schwere Sturmflut`, `Niedriger Wasserstand`,
`Niedrigwasser`, `Schweres Niedrigwasser`, `Sehr schweres Niedrigwasser`; Schwellen für Nordsee gegen MHW
(+1,5 / +2,5 / +3,5 m) und Ostsee gegen NHN (+0,75 / +1,0 / +1,5 / +2,0 m). Die Doku sagt ausdrücklich:
„Please note that the warning level **does not apply specifically to a particular gauge station**." Im
Messfall stand an 136/136 `official_warning_level_region = "Wasserstandsvorhersage"`, also der Normalfall —
der Fall „Sturmflut" ist in dieser Sitzung **nicht beobachtbar** und wird deshalb aus den Daten gelesen,
nie aus einer eigenen Rechnung (E-WL-6, V-WL-3).

**Größen.** Alle 136 mit allem: **500 KB gz / 5,66 MB JSON** in 1,8 s. Ein Pegel: **1,5 KB** (nur
Ereignisse) bis **10,2 KB** gz (Nordsee mit 923 Kurvenpunkten), 0,2 s. `limit`/`offset`/`bbox`/`datetime`
gehen, **`properties=` nicht** (400) — eine schlanke Feldauswahl ist serverseitig nicht möglich. Genau
deshalb trennt E-WL-2 Lage und Kurve.

## 5. Entscheidungen

| Nr. | Frage | Entscheidung |
|---|---|---|
| **E-WL-1** | Voreinstellung der Anzeige | **An.** Pegel auf der Karte und die Kurve im Readout sind ohne Klick da; `?wl=0` schaltet aus (Jan, 12.10.). Bewusste **Ausnahme zu CLAUDE.md Rule 2** (default-off): Jans Auftrag 3 sagt „den reinen Hinweis durch echte Daten ersetzen". Benannter Rückfall ist der Schalter, nicht ein zweiter Rechenpfad |
| **E-WL-2** | Woher die Lage der 136 Pegel | **Kompakter Spiegel im Daten-Repo** (Jan, 12.10.): `sea/v1/static/gauges.json` (≈ 6 KB gz) wird vom Producer `scripts/sea/sea-gauges.mjs` aus **derselben offiziellen API** gebaut; der Client liest Lagen daraus, **Kurven live** je gewähltem Pegel aus der API. 25× günstiger als der Volllauf im Browser, und die Voreinstellung „an" kostet mobil fast nichts |
| **E-WL-3** | Welche Quelle im Client | **Nur die offizielle OGC API** `gdi.bsh.de/ldproxy/rest/services/WaterLevelForecast`, direkt (CORS offen), mit `lang=de` (V-WL-1). Kein `wasserstand.bsh.de`, kein `www2.bsh.de/aktdat/…`, kein Edge-Proxy. Verifier C2 prüft es am Quelltext |
| **E-WL-4** | Cachen | Zwei Stufen: **Speicher-Cache** je Pegel mit **TTL 10 min** (der Kurvenstempel war 13 min alt ⇒ stündlich oder häufiger; 10 min holt Neues zügig und bündelt Klickwechsel), dazu `cache: 'default'` — der Server liefert `ETag`, also revalidiert der Browser selbst. Kein IndexedDB: die Daten veralten zu schnell, um sie über die Sitzung zu heben |
| **E-WL-5** | Attributionstext | Wörtlich wie beauftragt: „**Wasserstandsvorhersage: Bundesamt für Seeschifffahrt und Hydrographie (BSH), CC BY 4.0, eigene Darstellung**", mit Link auf `creativecommons.org/licenses/by/4.0/deed.de` **und** auf die API-Seite. Sichtbar an der Karte (nicht nur im Quellen-Reiter), dazu der Gewährleistungssatz des BSH und der Verweis auf die amtliche Veröffentlichung (§2) |
| **E-WL-6** | Warnstatus | **Nur wörtlich, nie gerechnet.** Die Kategorie kommt aus `official_warning_level_region` bzw. `forecast_automated_event_warning`; wir berechnen keine Schwelle aus Tab. 5. Ist sie nicht der Normalfall `Wasserstandsvorhersage`, steht sie **über** den Zahlen — im Wortlaut, mit dem Zusatz der Doku, dass sie nicht pegelgenau gilt, und mit dem Link auf `sturmflutwarndienst.de`. Der Link steht **immer** in der Karte (nicht nur im Warnfall), damit die amtliche Stelle nie erst gesucht werden muss. Keine eigene Farbskala, keine eigene Stufe, kein Wort wie „Gefahr" |
| **E-WL-7** | Welcher Pegel zum Spot | Der **nächste** Pegel nach Großkreisabstand, ohne Obergrenze, aber **mit genannter Entfernung** — plus Pegelwahl von Hand (Karte und Liste). Keine Interpolation zwischen Pegeln: Wasserstand ist kein Feld, das man zwischen zwei Pegeln mitteln darf (Gezeitenphase verschiebt sich je km) |
| **E-WL-8** | Der amtliche Text | Wörtlich, mit Stempel, als **Gebietstext** gekennzeichnet (§4: 6 Texte für 136 Pegel). HTML-Auszeichnung (`<b>`) wird entfernt, **die Wörter bleiben unverändert** — kein `dangerouslySetInnerHTML` |
| **E-WL-9a** | Wert zur gewählten Stunde | Die Stundenachse der Seite reicht bis **+78 h**, der Verlauf des BSH endet median bei **+54,6 h**. Der letzte Kurvenpunkt wird deshalb **nicht** als Wert späterer Stunden ausgegeben: `wlAt` gibt jenseits einer Toleranz von 60 min null, und die Karte sagt, bis wann der Verlauf reicht. Gefunden beim Browser-Durchgang, nicht gedacht |
| **E-WL-9** | Einheit der Anzeige | **cm über Pegelnull** als Primärwert (so liefert das BSH), dazu in der Karte der Bezug: Pegelnull gegen NHN und das mittlere Hochwasser/Niedrigwasser desselben Pegels. Keine eigene Umrechnung in „Meter über Meeresspiegel" — die wäre eine stille Behauptung |

## 6. Plan

| AP | Inhalt |
|---|---|
| **WL-1** | Vertrag: `src/sea/waterLevel.ts` — Pfade/Parameter der OGC API, Typen nach Tab. 1/2/4/5, Parser mit den Typfallen aus V-WL-2, Katalogform `gauges.json`, Prüfregeln für Producer **und** Client (Muster `seaContract.ts`) |
| **WL-2** | Producer: `scripts/sea/sea-gauges.mjs` — liest die offizielle API, schreibt `sea/v1/static/gauges.json`; Schritt in `workflow-sea.yml` (continue-on-error, schreibt nur bei Änderung); lokal gegen die echte API gebaut, Paket für Jans Kopie |
| **WL-3** | Client-Leser: `src/sea/waterLevelClient.ts` — Katalog aus dem Spiegel (`fetchSea`-Muster mit raw-Hedge), Pegel live aus der API mit TTL-Cache, Abbruch, benannte Fehlerzustände |
| **WL-4** | UI: Karte (Pegel-Raute, Wahl), Readout-Karte „Wasserstand" (Kurve, HW/NW, Stempel, Text, Attribution, Sturmflut-Link), Dock-Schalter statt der Sperre, Quellen-Reiter „erlaubt · CC BY 4.0", Watt-Sätze ohne „gesperrt" |
| **WL-5** | Doku: `docs/API.md` §8.10 + Prüfbogen, `docs/DATA_SOURCES.md`, die vier Seewetter-Audits, `MANUELLE-SCHRITTE.md` §66 |
| **WL-6** | Gates: `verify:sea-waterlevel` neu, `verify-sea-ui.mjs` D7 umgestellt, Nachbarn grün, typecheck, Build, Budget, Browser |

## 7. Gates

| Gate | Inhalt |
|---|---|
| **G-WL-1** | `verify:sea-waterlevel` grün, inkl. `--live` gegen die echte API (Form, CORS, Stempel, Typfallen) |
| **G-WL-2** | Kein Abruf gegen `wasserstand.bsh.de`, `www2.bsh.de` oder einen anderen als den OGC-Pfad — am Quelltext geprüft (C2) |
| **G-WL-3** | `?wl=0` ist der benannte Rückfall: kein Abruf an den Dienst, keine Pegel-Ebene, keine Karte. Pixel-Diff HEAD ↔ Arbeitsbaum je Modul; die EINZIGEN Unterschiede dürfen die drei beabsichtigten Textänderungen aus §1 sein (Dock-Zeile, Watt-Satz, Quellenzeile) — „byte-gleich" wäre hier eine falsche Behauptung, s. §8.3 |
| **G-WL-4** | Kein Wort über dem Warnstatus, das nicht aus den Daten kommt; Sturmflut-Link vorhanden (C5/C6) |
| **G-WL-5** | Nachbar-Verifier, typecheck 0, Build, Budget-Ratsche, Konsole sauber, Touch-Ziele ≥ 44 px |

## 8. Umsetzung

### 8.1 Was entstanden ist

| Datei | Rolle |
|---|---|
| `src/sea/waterLevel.ts` | **Vertrag** (neu, importfrei): Endpunkt und Parameter, Typen nach Tab. 1/2/4/5, die Parser `wlNum`/`wlStr`/`wlTime`/`wlText` gegen die Typfallen, `wlRefPair` (V-WL-7), Katalogform + `wlCatalogProblems`, `wlGaugeOf`/`wlForecastOf`, `wlNearest`/`wlDistKm`, `wlAt` mit Toleranz + `wlCurveEnd`, `wlIsDefaultWarning`/`wlHasCategory`, die Kategorien- und MOS-Tabellen der Doku |
| `src/sea/waterLevelClient.ts` | **Leser** (neu): Katalog über `fetchSea` (jsDelivr + raw-Hedge wie jede andere statische Datei der Linie), Vorhersage je Pegel live über `wlItemUrl`, Speicher-Cache mit TTL 10 min + In-Flight-Bündelung, `WlCatalogMissing` als benannte Lücke, `setWlIo` als Prüfnaht |
| `scripts/sea/sea-gauges.mjs` | **Producer** (neu): liest die offizielle API seitenweise, prüft dass die Lizenz an **jedem** Datensatz `CC BY 4.0` ist (sonst Abbruch ohne Schreiben), baut `static/gauges.json`, schreibt nur bei Änderung, vermerkt den Durchgang in `status.json` |
| `scripts/sea/workflow-sea.yml` | Schritt „Gauges" im 15-min-Workflow (continue-on-error, überspringt sich selbst solange der Producer nicht auf `main` liegt) |
| `src/sea/SeaReadout.tsx` | Karte „Wasserstand · amtlich (BSH)" im Spot-Reiter, Quellenzeile „erlaubt · CC BY 4.0", Watt-Satz ohne Sperre |
| `src/sea/SeaCharts.tsx` | `WaterLevelChart`: gemessen · Vorhersage · Gezeit, MThw/MTnw als gestrichelte Bezugslinien, „jetzt"-Naht |
| `src/sea/SeaMap.tsx` | Pegel-Ebene `sw-gauges` (Raute, wählbar, Auswahl hervorgehoben) — nur additiv |
| `src/sea/SeaDock.tsx` | der gesperrte Eintrag ist ein echter Schalter geworden |
| `src/sea/SeaPage.tsx` | Verdrahtung: Katalog beim Einschalten, nächster Pegel zum Spot, Pegelwahl von Hand, Vorhersage je Pegel, benannte Zustände |
| `src/sea/seaFlag.ts` | `seaWaterLevelFrom` — `?wl=0` |
| `src/sea/seaDeck.css` | `.sw-wl-cat`, `.sw-wl-events`, Link-Stil im Kleingedruckten; mobil eigene Zeilenumbrüche |
| `scripts/verify-sea-waterlevel.mjs` | **Verifier** (neu, in CI), Fixtures `scripts/lib/fixtures/sea/waterlevel/` = echte Antworten dreier Pegel + der Katalog von heute |
| `scripts/sea/sea-wl-pixeldiff.mjs` | Pixel-Diff HEAD ↔ Arbeitsbaum mit `?wl=0` (Gate G-WL-3) |

### 8.2 Was die Kette kostet

+7,7 KB gzip, **vollständig im lazy `SeaPage`-Chunk** (33,0 KB gz); Erstbild-Pfad unverändert (eagerJs 109,6,
Ratsche 109,7 nicht angefasst — nur `seaWaterLevelFrom` kam in den geteilten `seaFlag`-Chunk, 324 B gz
gesamt). `totalJs` 1 715,0 → 1 722,7, Ratsche von Hand 1 720 → **1 726** mit Notiz in `budget.json`.
Laufzeit: der Katalog ist ein Abruf von **10,3 KB gz** aus dem Daten-Repo, die Vorhersage **1,5–10,2 KB gz**
je gewähltem Pegel in 0,2 s (gemessen), danach 10 min aus dem Speicher.

### 8.3 Gates

| Gate | Beleg |
|---|---|
| G-WL-1 | `verify:sea-waterlevel` **55/55** netzfrei, **60/60** mit `--live` gegen den echten Dienst (H1 CORS `*` ohne 301-Hop, H2 Vertrag auf der Live-Antwort, H4 Katalog von heute 136 Pegel / 0 Probleme, H5 Lizenz an 136/136) |
| G-WL-2 | C1 kein Abruf gegen `wasserstand.bsh.de`, `www2.bsh.de/aktdat/…` oder PEGELONLINE-Webservices (mit Gegenprobe C1b, dass das Muster einen solchen Abruf erkennt), C2 der Leser nutzt ausschließlich `wlItemUrl` und `fetchSea` und trägt keine andere URL, C3 `wlGaugePage` nur als `href` |
| G-WL-3 | `scripts/sea/sea-wl-pixeldiff.mjs`, HEAD ↔ Arbeitsbaum mit `?wl=0`, 1440 × 900, Uhr eingefroren (`audit/wasserstand-bsh/pixel/report.json`): **Rail, Topbar und Karte 0 px in allen drei Szenarien**. Dock 0 px in der Standardansicht — der Schalterblock liegt unterhalb der Faltung (Dock `scrollHeight` 3 541 bei 840 sichtbar, auf **beiden** Seiten gleich, weil HEAD dort dieselbe 36-px-Zeile als Sperre trug); hereingescrollt 7 765 px (3,7 %) = die getauschte Zeile. Readout 1 490 px (0,44 %) im Spot-Reiter = der geänderte Watt-Satz, 60 423 px (17,98 %) im Quellen-Reiter = die Lizenzzeile und der Umbruch darunter. **Das sind genau die drei beabsichtigten Textänderungen** (§1); dass `?wl=0` keine Ebene, keine Karte und keinen Abruf erzeugt, prüft `verify:sea-ui` L10/L11 |
| G-WL-4 | E2 keine Schwelle im Code (kein 1,5/2,5/3,5/0,75 in `waterLevel.ts`, `WL_WARN_LEVELS` wird in der Anzeige nicht indexiert), E3/E4 die Kategorie kommt aus den Daten — Gebiet, Pegel und Einzelereignis, mit erfundenen aber formtreuen Sturmflut-Fällen geprüft (V-WL-3), E5 der Wortlaut steht mit dem Zusatz „gilt laut BSH für die Nordsee/Ostsee, nicht für diesen Pegel" und „buscosun warnt nicht", E5b der Warndienst ist **immer** verlinkt, E6 keine Warnfarbe der Seite für den Wasserstand, E7 kein `dangerouslySetInnerHTML` in der Linie (mit Gegenprobe) |
| G-WL-5 | `verify:sea-ui` **62/62** (neuer Block L1–L12, inkl. I1 Konsole ohne Ausnahme), `verify:sea-contract` 30/30, `verify:sea-text` 35/35, `verify:sea-derive` 69/69, `verify:sea-decode` 13/13, `npm run typecheck` 0, `npm run build` **256/256**, `npm run budget` grün (§8.2) |

### 8.4 Was der Browser-Durchgang gefunden hat

Drei Fehler, die kein Verifier gegen selbst gewählte Werte gefunden hätte — sie kamen aus dem Blick auf die
echte Karte (die Bilder liegen in `audit/wasserstand-bsh/pixel/`):

1. **V-WL-8** (§4): die amtliche Höhe endet nach ≈ 21 h; ohne die MOS-Zeile hätte die Karte an 732 von
   1 863 Ereignissen „–" gezeigt.
2. **E-WL-9a**: der Wert „zur gewählten Stunde" war der letzte Kurvenpunkt, auch wenn die gewählte Stunde
   Stunden später lag — die Stundenachse der Seite reicht weiter als der Verlauf des BSH.
3. **Dezimalkomma**: `forecast_uncertainty` kommt auch als `12.5`; im Deutschen muss „± 12,5 cm" stehen.
   Jetzt geht jede Zentimeterzahl durch einen `de-DE`-Formatierer (`verify:sea-ui` L2b am gerenderten Text).

### 8.4a Ende-zu-Ende gegen den echten Dienst

Die Bilder in `audit/wasserstand-bsh/bilder/` (Desktop 1440 × 900, Mobil 390 × 844, Nordsee- und Ostsee-Pegel)
sind mit genau der Produktionsarchitektur entstanden: **Katalog aus dem Spiegel** (als Fixture
untergeschoben, weil er noch nicht im Daten-Repo liegt) und **Kurve live aus der offiziellen BSH-API** —
erkennbar am Stempel „Modellkurve Mo 12.10. 19:04", der jünger ist als die Fixture, und am vollen
48-h-Fenster des Verlaufs. Die Kette steht also von Ende zu Ende gegen den echten Dienst; die Konsole bleibt
sauber (`verify:sea-ui` I1).

Mobil trägt das Spot-Briefing die Karte vollständig (374 px breit, 686 px hoch), die Ereigniszeilen brechen
dort auf zwei Zeilen um (eigene Media Query ≤ 767 px). Trefferflächen: die Links im Kleingedruckten liegen
bei 21–25 px statt 44 px — benannt als V-WL-12.

### 8.4b Füllstand des Pegels (WL-5, Jans Auftrag 13.10.: „Füllstand anzeigen, Daten richtig ziehen")

**Befund zur Datenlage (13.10. 05:30 UTC):** `buscosun-web/main` trägt die Linie seit `ec68705`, aber im
Daten-Repo fehlten `sea/v1/static/gauges.json` (CDN und raw: 404) und der Workflow-Schritt „Gauges" — die
Karte sagte in Produktion deshalb „Der Pegelkatalog liegt noch nicht im Daten-Repo". Der Katalog wurde
neu aus der offiziellen API gebaut (136 Pegel, 82 Nordsee / 54 Ostsee, 0 verworfen, Lizenz CC BY 4.0 an
jedem Datensatz, Dienst-Stempel 05:31:43Z) und zusammen mit der Workflow-Vorlage in den Klon
`C:\dev\buscosun-data` gelegt (Arbeitsbaum auf `origin/main`, beide Dateien gestaged, Diff zur Vorlage =
genau die drei Hunks des Schritts „Gauges"). **Commit und Push hat der Auto-Modus abgelehnt** („Production
Deploy" / „Modify Shared Resources") — beides bleibt Jans Schritt, Paket zusätzlich unter
`C:\dev\buscosun-sea-publish\2026-10-13-wl\` (§66.1). Bis zum Push bleibt die Pegel-Ebene leer, nichts
rechnet falsch.

**Füllstand** — neu in der Karte „Wasserstand · amtlich (BSH)" unter den beiden Wertefeldern: ein Glas
(SVG, 104 × 124 px, ohne Bibliothek) mit dem Wasserstand der gewählten Stunde als Füllung, auf einer Skala,
die das Diagrammfenster und die Bezugshöhen des Pegels umfasst (gleiche Rundung wie das Diagramm,
`wlFillScale`), mit den Bezugshöhen als gestrichelten Marken (`MThw`/`MTnw`, `NHN` aus
`gaugezero_relative_to_nhn`). Daneben: der Wert in cm über Pegelnull, der Wert gegen NHN, die Differenzen
gegen MTnw und MThw als Vorzeichen-Zahlen und die Lage im Tidehub („Tidehub zu 44 % gefüllt", „über dem
Tidehub (+44 cm gegen MThw)"). Jede Zahl ist der gelieferte Wert oder eine Subtraktion im SELBEN Bezug
(E-WL-9); die Farbe nennt die Herkunft wie im Verlauf (Vorhersage Petrol, Messung Tinte), `data-kind`
und `data-band` am Element. Liegt die gewählte Stunde jenseits der Kurve, zeigt das Glas den letzten Wert
und sagt es („letzter Wert, nicht die gewählte Stunde"); ohne Punkt gibt es kein Glas (V-WL-6). Reine
Rechnung `wlFill` in `waterLevel.ts` (abhängigkeitsfrei), Komponente `WaterLevelFill` in `SeaReadout.tsx`,
CSS `.sw-wl-fill*`.

**Ostsee:** die Felder `mean_high_water`/`mean_low_water` sind dort kein Tidehoch-/-niedrigwasser; die Marken
und die Bezugszeile heißen deshalb **MHW/MNW** und die Spanne „Spanne MNW–MHW" statt „Tidehub" (V-WL-14,
vorher stand auch an Ostsee-Pegeln „MThw"). MHW = MNW (tidenlos, `prerow` 500/500) ⇒ eine Marke „MW" und
„gegen Mittelwasser", keine Spanne; 0/0 ⇒ keine Marken (V-WL-7). Auch das Diagramm beschriftet seine
Bezugslinien jetzt je Revier (`WaterLevelChart` `highLabel`/`lowLabel`) — das hat die Prüfung L12b gefunden,
weil der Kartentext an der Ostsee noch „MThw" aus dem SVG trug.

**Gates (13.10.):** `verify:sea-waterlevel` **63/63** netzfrei (neu F11…F11h: Rechnung, Skala, Marken je
Revier, Differenzen, Randfälle tidenlos/0-0/über-unter, Quelltext), `verify:sea-ui` **68/68** gegen den
Produktions-Build auf `127.0.0.1:5212` (neu L1b/L1c: Glas gerendert, Wasserhöhe 62 von 124 px, Marken
MThw 656 / MTnw 366 / NHN 503, Vorzeichen-Differenzen gegen die große Zahl nachgerechnet; L12a Abrufe der
Ostsee-Seite aus der Fixture; L12b Ostsee-Wörter), typecheck 0, Build grün, Budget grün (totalJs 1 768,2 /
1 772 — +1,7 KB im SeaPage-Chunk, eagerJs 109,9 / 110 unverändert). Bild: Cuxhaven-Duhnen Desktop mit Glas
(`verify:sea-ui --shots`), Konsole ohne Ausnahme (I1). Drei Nebenbefunde beim Prüfen: V-WL-16 (der
Verifier lief ohne App-Server vier Mal gegen `chrome-error://`), V-WL-17 (Zähler „Werkzeuge" seit der
Gletscher-Kachel 13 statt 12), V-WL-18 (ein Lauf las Warnemünde als „nicht lesbar"). Real-Device (V-WL-9)
weiter offen; mobil liegt das Glas als erste Zeile unter den Wertefeldern im Spot-Briefing (Flex-Zeile,
Text bricht um).

**Katalog im Daten-Repo (13.10. 16:33 UTC, Jans Freigabe im Chat):** Commit `a762bede5` auf `origin/main`,
Diff genau die zwei Dateien. Gegenprobe: raw und jsDelivr (`@a762bede5`, `@main`) antworten 200 / 57 698 B,
sha256 des Blobs, der CDN-Datei und des Pakets gleich `a59a314390a2…` (die Arbeitskopie im Klon hat durch
`autocrlf` ein Byte mehr, unerheblich). Produktion danach ohne den Satz „Pegelkatalog liegt noch nicht im
Daten-Repo"; die Karte zeigt für St. Peter-Ording den Pegel Süderoogsand (14,9 km, Pegelnull 500 cm unter
NHN, MThw 636 / MTnw 351, vier Hoch-/Niedrigwasser mit ± und „amtlich"), Bild
`wasserstand-bsh/prod-2026-10-13-gauges-live.png`. Der Wert „zur gewählten Stunde" steht dort auf „–", weil
Süderoogsand live keinen `curve`-Block trägt (V-WL-6, nachgemessen 16:39 UTC: Antwort ohne `curve`) — die
Karte sagt das („Für diesen Pegel liefert das BSH keinen Verlauf …"), und ohne Kurve gibt es auch kein Glas
(V-WL-19). Der Weg dorthin: V-WL-20 (Rebase gegen force-gepushte Historie). Der Workflow lief als Nr. 400
(16:23 UTC) noch VOR dem Push; **Lauf 401** (≈ 16:45 UTC, `2d82e5f38`) trug den Schritt „Gauges (BSH water
level catalogue)" zum ersten Mal — `success`, Publish `success` (GitHub-API `actions/runs/38433382415/jobs`).

### 8.5 Was offen ist

- **Jans Gate** (`MANUELLE-SCHRITTE.md` §66.0): Commit + Push von `buscosun-web/main` mit dem Füllstand (WL-5).
  Der Katalog liegt seit 13.10. 16:33 UTC im Daten-Repo (§8.4b); bis zum Web-Push zeigt Produktion die
  Pegel-Ebene ohne Glas und an Ostsee-Pegeln noch „MThw/MTnw" (V-WL-14).
- **V-WL-19:** am nächsten Pegel ohne Kurve gibt es kein Glas — Entscheidung E-WL-10 (nächster Pegel MIT
  Kurve fürs Glas, benannt) liegt bei Jan.
- **Real-Device** (V-WL-9): Diagramm, Ereignisliste und Pegel-Rauten sind nur in headless Chromium gesehen.
- Der Warnfall ist nie live beobachtet (V-WL-3) — nur mit formtreuen Fällen geprüft.

## 9. Befunde

| Nr. | Befund | Umgang |
|---|---|---|
| **V-WL-1** | `?f=json` ohne `lang` antwortet 301 auf `lang=en`; der Redirect-Hop trägt keine CORS-Header | Immer mit `lang=de` aufrufen, dann kein Hop |
| **V-WL-2** | Gemischte Typen: `tidal_prediction`/`measurement`/`tidal_prediction_value` als String, `forecast_value`/`automated_curve_forecast` als Zahl, `forecast_deviation` als deutsch formatierter String | Ein Parser für alle Zahlenfelder (`num()`), Abweichung nie gerechnet, nur zitiert |
| **V-WL-3** | Der Warnfall („Sturmflut" …) war am 12.10. nicht beobachtbar — alle 136 Pegel im Normalfall | Kategorie wird gelesen, nie gerechnet; der Pfad ist im Verifier mit erfundenen, aber formtreuen Fällen geprüft und als **nicht live beobachtet** benannt |
| **V-WL-4** | `properties=` wird mit 400 abgelehnt ⇒ keine schlanke Feldauswahl am Server | Trennung Spiegel/Live (E-WL-2) |
| **V-WL-5** | Keine Historie in der API (kein Zeitreise-Parameter) | Kein Rückblick, keine Animation; die gemessene Reihe der Kurve (−8 … −34 h) ist alles, was es gibt |
| **V-WL-6** | 43 Nordsee-Pegel ohne `curve`, 54 Ostsee-Pegel ohne `high_water_low_water`, 5 ohne `mean_high_water` | Jeder Block einzeln optional; das UI sagt, was fehlt, statt zu rechnen |
| **V-WL-7** | Platzhalter im Bezugsblock: `fynshav` und `sonderborg` (beide dänisch) tragen MThw = MTnw = Pegelnull-gegen-NHN = 0, `fino2` (Forschungsplattform) nur das Letztere. `prerow` trägt dagegen echte 500/500 — in der tidenlosen Ostsee ist Gleichstand legitim | Regel entschärft: nur eine **Umkehrung** (MThw < MTnw) ist unmöglich und wird gemeldet; das Paar 0/0 wird zur Abwesenheit (`wlRefPair`), damit die Karte keine „0 cm" als Bezugshöhe zeigt. Gefunden, weil die erste, zu scharfe Regel den Producer anhielt |
| **V-WL-8** | Die amtliche Höhe reicht nur ≈ +21 h; darüber trägt an 39 von 82 Pegeln nur MOS eine Zahl (bis +134 h), an den anderen 43 gar keine. Meine erste Sonde hatte den Schlüssel falsch (`mos_forecast_value` statt `mos_forecast_r0_value`) und MOS für leer erklärt | §4: amtlicher Wert mit ±, sonst MOS mit genannter Herkunft, sonst nur die Zeit. Lehre: eine Abwesenheit, die auf EINEM Schlüsselnamen beruht, braucht die Gegenprobe am Schema — der Verifier hat sie erzwungen |
| **V-WL-9** | Real-Device fehlt: Diagramm, Ereignisliste und die Pegel-Rauten sind nur in headless Chromium gesehen | Jans Durchsicht am Gerät; Long Tasks sind in headless-shell ohnehin nicht messbar (Hauslehre) |
| **V-WL-10** | Der Schalterblock des Docks liegt bei 1440 × 900 unterhalb der Faltung (`scrollHeight` 3 541 bei 840 sichtbar) — der neue Schalter ist nur nach Scrollen erreichbar. Das gilt für alle vier Schalter und ist Bestand, keine Regression | Benannt. Weil die Anzeige voreingestellt an ist (E-WL-1), braucht niemand den Schalter, um die Daten zu sehen; ein Umbau des Docks wäre eine eigene Phase |
| **V-WL-12** | Die Links im Kleingedruckten der Karte (Lizenz, Quelle, Pegel beim BSH, Warndienst) sind Fließtext mit **25 px** Trefferfläche, nicht 44 px | Senkrechtes Padding hebt die Fläche von 13 auf 25 px, ohne den Zeilenfall zu ändern; 44 px würden den Satz auseinanderreißen. Die Seite hält es bei sekundären Textaktionen schon so (`.sw-details summary` 28 px). Benannt statt stillschweigend |
| **V-WL-13** | Die UI-Harness hätte am **Live**-Dienst messen können: `Fetch` feuert nicht bei einem HTTP-Cache-Treffer, und der Leser fragt mit `cache: 'default'` — ein zweiter Lauf las die echte API aus dem Profil-Cache (334 Stützstellen über 48 h statt 74 über 12 h) | `Network.setCacheDisabled` in `openPage`, dazu zwei Prüfungen, die die Herkunft belegen: **L0** zählt die abgefangenen Abrufe (13), **L4b** prüft die Stützstellen gegen das Fixture-Fenster. Gefunden beim Nachmessen des Diagramms, nicht von einer Prüfung |
| **V-WL-11** | Der Katalog nennt je Pegel, ob er beim Bau eine Kurve bzw. Ereignisse trug (`has`) — ändert der Dienst das zwischen zwei Workflow-Läufen, ist die Angabe bis zu 15 min alt | Nur ein Hinweis für die Anzeige, nie eine Zusage: die Live-Antwort entscheidet (F5/F6). Ein Pegel, der beides verliert, fällt beim nächsten Lauf aus dem Katalog (Regel in `wlCatalogProblems`) |
| **V-WL-14** | Die Bezugszeile nannte an **Ostsee**-Pegeln „MThw/MTnw" — dort gibt es keine Tide, die Felder sind MHW/MNW (mittleres Hoch-/Niedrigwasser gegen NHN, Parameterdoku) | Behoben mit dem Füllstand (§8.4b): Wörter je Revier aus `wlFill` (`highLabel`/`lowLabel`/`spanLabel`), Bezugszeile und Marken gleich; `verify:sea-ui` L12b |
| **V-WL-16** | `verify:sea-ui` setzt einen App-Server auf `127.0.0.1:5212` voraus, prüfte das aber nicht: ohne Server landet jede Seite auf `chrome-error://`, die Prüfungen mit `?.` liefen still ins Leere, und A7 stürzte an einem fehlenden Element ab — vier Läufe am 13.10., bis die Ursache sichtbar war | Fail-fast am Start (`fetch(BASE)`, Exit 2 mit dem Startbefehl), A7 ohne Absturz, Seitenfehler werden sofort gedruckt, B0 nennt den Seitenzustand. Lehre: ein Harness, der etwas von außen braucht, prüft das zuerst |
| **V-WL-17** | A2/A3 zählten „11/12 Werkzeuge" — seit der Gletscher-Kachel (Phase GL, `8e8646a`) sind es 12/13; der Verifier war seit Jans Merge rot, ohne dass es jemand gesehen hat | Erwartung auf 12/13 gesetzt (Phase GL hat keine eigene Zeile dafür) |
| **V-WL-18** | Ein Lauf von `verify:sea-ui` (von drei) las die Karte an Warnemünde als „gerade nicht lesbar" — die Fixture-Antwort kam in diesem Lauf nicht an; die beiden anderen Läufe und die Wiederholung waren grün | L12a zählt seither die abgefangenen Abrufe der Ostsee-Seite (Katalog + Pegel) und die Wartebedingung lässt den Zustand „lädt" ausklingen; tritt es wieder auf, steht die Abruffolge im Detail. Nicht erklärt, nur eingezäunt |
| **V-WL-15** | Der Katalog lag bis zum 13.10. nicht im Daten-Repo (404 am CDN und bei raw), obwohl `main` die Linie seit `ec68705` trägt — in Produktion blieb die Pegel-Ebene leer und die Karte nannte den Grund. Der Auto-Modus lehnt Commit und Push im Daten-Repo ab | Katalog frisch gebaut und mit dem Workflow-Schritt im Klon gestaged (§8.4b); **gepusht 13.10. 16:33 UTC als `a762bede5` nach Jans Freigabe im Chat** (der Klassifizierer ließ den Push danach durch). Lehre: ein Daten-Gate, das nur eine Kopie braucht, gehört in die erste Zeile von `MANUELLE-SCHRITTE`, nicht hinter die Beschreibung |
| **V-WL-19** | Die Seite nimmt den **nächsten** Pegel je Spot (`wlNearest`), ohne auf `has.curve` zu achten. Vor St. Peter-Ording ist das Süderoogsand (13,3 km, Katalog `curve: false`, live ohne `curve`-Block): Wert „zur gewählten Stunde" = „–", kein Diagramm, kein Glas — das Glas, das Jan bestellt hat, ist am Standard-Spot der Nordsee nicht zu sehen. 43 von 82 Nordsee-Pegeln tragen keine Kurve (V-WL-6); die nächsten MIT Kurve wären Eider-Sperrwerk Außenpegel (16,5 km), Büsum Schleuse (26,8 km) | Mehrwert: Füllstand an jedem Nordsee-Spot. Skizze (**E-WL-10**, Jans Entscheidung): die Hoch-/Niedrigwasserzeiten bleiben vom nächsten Pegel; für Glas und Diagramm zusätzlich der nächste Pegel mit `has.curve` (zweiter Live-Abruf, 10-min-TTL), in der Karte als eigener Pegel benannt („Füllstand vom Pegel Eider-Sperrwerk, 16,5 km"), nie stillschweigend. Bis dahin ist der Pegel wählbar (`gaugePick`) und die Karte sagt, dass es keinen Verlauf gibt |
| **V-WL-20** | Das Daten-Repo wird vom Publisher force-gepusht; `git rebase origin/main` auf einem Klon mit alter Historie spielt **alle** alten Commits neu ab (97, Konflikte in jeder Datei) — und zwischen Fetch (Minuten, weil die alte Basis fehlt) und Push kommt ein Cron-Push dazwischen (`fetch first`, zweimal) | `git rebase --abort`; dann `git checkout --detach origin/main` → `git cherry-pick <commit>` → `git push origin HEAD:main` in einer Schleife (Erfolg im ersten Durchlauf, weil der inkrementelle Fetch nun Sekunden dauert). Lokales `main` auf `origin/main` gesetzt, der verlorene Zeiger (RG-Commit `ea8884e44`, Inhalt schon auf `origin/main`) als Zweig `keep/rg-radar-log-native` gesichert. Gehört in die Hauslehren „Daten-Repo und CDN" |
