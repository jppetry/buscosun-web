# Phase TF — Tidenfenster auf `/seewetter`

> **Auftrag Jan, 2026-11-17:** aus der Wasserstandskurve des BSH Zeitfenster gegen eine eigene Schwelle
> zeigen („mindestens“/„höchstens“ x cm gegen einen vom BSH gelieferten Bezug), im Diagramm, im Stundenband
> und — nur mit gesetzter Schwelle — in passt/knapp/außerhalb. Dazu E-WL-10 (nächster Pegel MIT Kurve) und die
> Fläche zwischen Vorhersage und Gezeit. Voreingestellt aus: `SEA_TIDE_WINDOW_LIVE = false`, Schalter `?tf=1`.
> Keine neue Datenquelle, kein Daten-Repo, keine Abhängigkeit. Grundlage: `audit/wasserstand-bsh.md`.

## 1. Diagnose (17.11., vor dem Code)

**Bestand.** `waterLevelClient.ts` liest je gewähltem Pegel EINE Live-Antwort (`items/{id}`, TTL 10 min). Die
Seite nimmt den nächsten Pegel ohne Blick auf die Kurve (`wlNearest`, V-WL-19), die Karte zeigt Wert, Glas,
Ereignisse und ein Diagramm −6 … +48 h. Eine Schwelle, Fenster oder eine Verbindung zu den Profilklassen
gibt es nicht; `classify` (`seaProfiles.ts`) kennt nur Wind, Böen, Welle, Ufer, Licht.

**Live nachgemessen (17.11. 23:20 MEZ, vier Pegel, Antworten liegen als Fixtures unter
`scripts/lib/fixtures/sea/tidewindow/`):**

| Spot | nächster Pegel | Kurve | Pegel mit Kurve | Messung | Vorhersage | Gezeit |
|---|---|---|---|---|---|---|
| St. Peter-Ording | Süderoogsand 13,3 km | **keine** (22 Ereignisse) | Eider-Sperrwerk Außenpegel 16,5 km | 82 Punkte bis 23:10 | 842 Punkte bis **23.11. 15:50** (+136 h) | 924 Punkte, gleiches Ende |
| Cuxhaven-Duhnen | Cuxhaven Steubenhöft | 922 Punkte | derselbe | 82 | 839 bis 23.11. 15:50 | 922, gleiches Ende |
| Kiel-Schilksee | Kiel-Holtenau 6,5 km | 337 Punkte | derselbe | 141 | 196 bis **20.11. 00:00** (+49 h) | **keine** (Ostsee) |

Drei Befunde daraus:

1. **V-TF-1 — „nur Gezeit“ kommt an diesen Pegeln heute nicht vor.** An den Nordsee-Pegeln mit Gezeit reicht
   die Modellkurve genauso weit wie die Gezeitenvorausberechnung (+136 h); das Audit WL nannte „median +54,6 h“
   über ALLE Pegel. Der Fall „Gezeit reicht weiter als die Vorhersage“ ist damit ein Rückfall für Antworten mit
   kürzerer oder fehlender Modellkurve, kein Alltag. Er wird gebaut und im Verifier mit einer aus der echten
   Antwort abgeleiteten Form geprüft (Vorhersage-Felder ab einer Stunde entfernt) — benannt als abgeleitet,
   wie der Sturmflut-Fall in `verify:sea-waterlevel` (V-WL-3).
2. **V-TF-2 — an der Ostsee endet alles bei ≈ +49 h**, die Stundenachse der Seite reicht bis +78 h. Dahinter
   gibt es weder Vorhersage noch Gezeit: mit gesetzter Schwelle sind diese Stunden „keine Daten“, nicht „außerhalb“.
3. **V-TF-3 — `automated_curve_forecast` kommt als String** (`"443"`), nicht als Zahl wie in V-WL-2 notiert.
   `wlNum` liest beides; keine Änderung nötig.

**Bezüge je Pegel (Katalog, 136 Pegel):** `chartdatum_relative_to_gaugezero` an 136, davon 3 × 0;
`gaugezero_relative_to_nhn` 3 × 0 (`fino2`, `fynshav`, `sonderborg` — die Platzhalter aus V-WL-7). Ein Bezug mit
dem Wert 0 wird nicht angeboten (Pegelnull läge sonst angeblich auf NHN bzw. Seekartennull).

## 2. Entscheidungen (gesetzt, Jan kann sie drehen)

| Nr. | Frage | Gesetzt |
|---|---|---|
| **E-TF-1** | Welcher Pegel trägt Kurve, Glas und Fenster | Der gewählte bzw. nächste Pegel, wenn seine LIVE-Antwort eine Kurve trägt; sonst der dem Spot nächste Pegel mit Kurve (E-WL-10), höchstens drei Versuche, immer mit Name und Entfernung. Hoch-/Niedrigwasserzeiten bleiben vom nächsten Pegel. Höhen und Schwelle gelten nur an dem Pegel, an dem sie stehen — nichts wird zwischen Pegeln gerechnet |
| **E-TF-2** | Schwelle | `mindestens`/`höchstens` + ganze cm + Bezug (Pegelnull, NHN, Seekartennull, MThw bzw. MHW an der Ostsee). Verglichen wird „Kurvenwert − gelieferte Bezugshöhe“ gegen die Zahl — nur Subtraktion (E-WL-9). Gespeichert JE PEGEL (`localStorage['sea.tide.v1']`), denn 550 cm über Pegelnull in Cuxhaven sagen in Kiel nichts |
| **E-TF-3** | Teilen-Link | `tw=<min\|max>.<cm>.<bezug>.<pegel>`; der Pegel steht im Link, der Empfänger sieht die Schwelle an genau diesem Pegel. Solange der Schalter nicht live ist, bleibt `tf=1` in der Adresse, sonst sähe der Empfänger nichts |
| **E-TF-4** | Fenster | Zusammenhängende Zeit ab jetzt, in der die Kurve auf der erlaubten Seite der Schwelle liegt; der Übergang zwischen zwei Stützstellen DESSELBEN Pegels wird linear in der Zeit bestimmt. Quelle Messung/Modellkurve; hinter deren Ende die Gezeitenvorausberechnung, als eigenes Fenster „nur Gezeit“. Lücke > 45 min trennt |
| **E-TF-5** | Stunde im Band und in der Klasse | ganz im Fenster = erfüllt, teilweise = „knapp“, gar nicht = „außerhalb“, ohne Kurve = „keine Daten“. Zusätzlich „knapp“, wenn der Abstand zur Schwelle in der Stunde unter **10 cm** fällt (`TIDE_TIGHT_CM`, **gesetzt** — Größenordnung der Unsicherheit, die das BSH an amtlichen Ereignissen nennt; im UI als gesetzt benannt). Ohne Schwelle ändert sich keine Klasse |
| **E-TF-6** | Abweichung | Fläche zwischen Modellkurve und Gezeit, dazu die Differenz zur gewählten Stunde, beschriftet „Abweichung von der Gezeit (eigene Rechnung)“ — das BSH liefert diese Zahl an der Kurve nicht |
| **E-TF-7** | Diagrammfenster | mit Schalter −6 … +78 h (Stundenachse der Seite) statt +48 h, damit jedes Fenster des Bands auch im Diagramm steht |

## 3. Plan

| AP | Inhalt |
|---|---|
| TF-1 | `src/sea/tideWindow.ts` (rein, importfrei bis auf Typen): Bezüge, Schwelle, Link-/Speicherform, Reihe, Fenster, Stunden, Klassen-Zusatz; `wlNearestWithCurve` in `waterLevel.ts`; Schalter in `seaFlag.ts`; `tw`/`tf` in `seaState.ts` |
| TF-2 | `SeaPage.tsx`: zweiter Pegel (Kurve), Schwelle je Pegel, Fenster/Stunden, Einspeisung in die Klassen nur des gewählten Spots |
| TF-3 | UI: `SeaTideWindow.tsx` (Regler, Fensterliste), `WaterLevelChart` (Bänder, Schwellenlinie, Abweichungsfläche), Zeile „Pegel“ in `SeaBand`, Mobil-Regler in der unteren Leiste |
| TF-4 | `verify:sea-tide-window`, Nachbarn, typecheck, Build, Budget, Bilder |

Wortlaut: „über deiner Schwelle am Pegel X“ / „unter deiner Schwelle am Pegel X“. Nie eine Aussage über Wassertiefe,
Fahrwasser oder Eignung — die Schwelle ist eine Zahl des Nutzers an einem Pegel.

## 4. Umsetzung (17./18.11.)

| Datei | Rolle |
|---|---|
| `src/sea/tideWindow.ts` | **Regeln** (neu, rein): Bezüge je Pegel, Schwelle, Link-/Speicherform, Reihe (Messung/Modellkurve, dahinter Gezeit), Fenster, Stunden, Klassen-Zusatz, Abweichung, Wortlaut |
| `src/sea/SeaTideWindow.tsx` | **Regler und Fensterliste** (neu): ein Satz zum Ausfüllen; in der Karte (Desktop) und im Blatt hinter „Schwelle“ der unteren Leiste (Mobil) |
| `src/sea/waterLevel.ts` | `wlNearestWithCurve` (E-WL-10) |
| `src/sea/seaFlag.ts` | `SEA_TIDE_WINDOW_LIVE = false`, `seaTideWindowFrom` (`?tf=1`/`?tf=0`) |
| `src/sea/seaState.ts` | `tw`, `tf` im URL-Zustand (`SEA_TW_RE`); ohne beide bleibt jede Adresse wie zuvor |
| `src/sea/SeaPage.tsx` | zweiter Pegel (Kurve), Schwelle je Pegel, Fenster/Stunden, Einspeisung in die Klassen des gewählten Spots (Band, Dossier, Spotliste, Kartenpunkt), Mobil-Blatt. Der WL-4-Block steht jetzt vor der Stundenachse (reine Verschiebung) |
| `src/sea/SeaReadout.tsx` | Karte mit Regler, Fenstern, Abweichungszeile; zweite Karte „Verlauf · nächster Pegel mit Kurve“ |
| `src/sea/SeaCharts.tsx` | `WaterLevelChart`: Bänder mit Zeit, Schwellenlinie (Tinte), Fläche zwischen Modellkurve und Gezeit |
| `src/sea/SeaBand.tsx` | Zeile „Pegel“ |
| `src/sea/seaDeck.css` | `.sw-tf-*`, Mobil per Media Query |
| `scripts/verify-sea-tide-window.mjs`, `scripts/lib/fixtures/sea/tidewindow/` | Verifier + vier unveränderte BSH-Antworten vom 17.11. |
| `audit/tidenfenster/shots.mjs`, `bilder/` | Bildwerkzeug und Belege |

**Datenvertrag:** kein neuer Pfad, kein neues Produkt. Neu sind zwei Adress-Schlüssel (`tw`, `tf`) und ein
`localStorage`-Schlüssel (`sea.tide.v1`). Mit dem Schalter kommt je Spot höchstens ein zweiter Abruf gegen die
BSH-API dazu (Pegel mit Kurve, gleiche 10-min-TTL), bei falschem Katalog-Hinweis bis zu drei.

## 5. Gate (18.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:sea-tide-window` | **49/49** (echte Antworten; „nur Gezeit“ und Loch in der Kurve abgeleitet und so benannt) |
| `npm run typecheck` | 0 |
| `npm run build` | grün (verify-seo 1739/0, Routing 280/280) |
| `npm run budget` | grün ohne Anhebung: eagerJs 114,4 / 115, totalJs 1964 / 1985 |
| `verify:sea-waterlevel` 63/63 · `sea-contract` 30/30 · `sea-text` 35/35 · `sea-derive` 69/69 · `sea-decode` 13/13 · `sea-seo` 23/23 | grün |
| `verify:sea-ui` | **rot, schon an HEAD** (V-TF-5): bricht in B0 ab, vor jeder Prüfung dieser Phase |
| Bilder | `audit/tidenfenster/bilder/` — je Spot Desktop (Fenster, Pegel-Karten, Stundenband) und Mobil (Dossier, Leiste), dazu `cuxhaven-duhnen-desktop-aus.png` ohne Schalter; `report.json` zählt je Bild Fenster, Bänder, Linie, Fläche, Band-Zeile |

Die Bilder stammen vom Produktions-Build gegen die echten Daten (Daten-Repo und BSH-API, 18.11. 00:00 MEZ),
headless Chromium ohne GPU. Schwellen der Bilder: St. Peter-Ording „mindestens 50 cm über NHN“ am Pegel
Eider-Sperrwerk (zwei Karten, 15,1 km), Cuxhaven-Duhnen „mindestens 550 cm über Pegelnull“, Kiel-Schilksee
„höchstens 45 cm über NHN“ (keine Gezeit, keine Abweichungsfläche — Ostsee).

Fünf Selbstprüfungs-Fragen: (1) Funktionserhalt — ohne `?tf=1` rendert keine `.sw-tf-*`-Klasse (Bild „aus“,
`report.json`), Diagramm-Ebenen und 48-h-Fenster wie zuvor (A3); nicht pixelverglichen. (2) Desktop pixelgleich —
**nicht gemessen**, nur am Quelltext und am Bild „aus“ belegt. (3) Touch-Ziele — Regler im Mobil-Blatt 44 px
(CSS), Leisten-Knopf wie die drei anderen; nicht am Gerät gemessen. (4) Konsole — nicht ausgewertet (der Prüfer
dafür ist `verify:sea-ui`, V-TF-5). (5) Long Tasks — in headless nicht messbar.

## 6. Befunde

| Nr. | Befund | Umgang |
|---|---|---|
| **V-TF-1** | An den Nordsee-Pegeln mit Gezeit reicht die Modellkurve so weit wie die Gezeit (+136 h) — „nur Gezeit“ tritt dort heute nicht auf | Gebaut als Rückfall, mit abgeleiteter Form geprüft (D3, E7, F4). Das Hohl-Band ist live erst zu sehen, wenn eine Antwort mit kürzerer Modellkurve kommt |
| **V-TF-2** | Ostsee: Kurve endet bei ≈ +49 h, Stundenachse +78 h | Mit Schwelle sind die Stunden dahinter „keine Daten“ (Grund „Wasserstand am Pegel … fehlt“); das Profil-Fenster eines Ostsee-Spots endet dort. Skizze: Hinweiszeile am Band, bis wann die Kurve reicht |
| **V-TF-3** | `automated_curve_forecast` kommt als String | `wlNum` liest es; nur die Notiz in V-WL-2 ist überholt |
| **V-TF-4** | `headlessShot.mjs` nimmt über den Viewport hinaus auf; das baut die Seite neu auf — das Dossier fällt auf sein erstes Kapitel zurück, das Mobil-Blatt schließt, im Bild steht ein anderer Zustand als im DOM | Bildwerkzeug dieser Phase nimmt nur den Viewport über `cdpBrowser.mjs`. Mehrwert einer Korrektur dort: Bilder von Zuständen nach einem Klick stimmen. Skizze: Option `beyondViewport: false` |
| **V-TF-5** | `verify:sea-ui` wartet auf `.sw-spot-title` und das Band auf `/seewetter?sea=1`; seit dem Dossier-Umbau (15.11., `27281b44`) rendert die Seite nur noch `layout="dossier"`, der Selektor existiert dort nicht — der Prüfer ist an HEAD rot (am Quelltext von HEAD belegt, HEAD nicht eigens gebaut) | Nicht in dieser Phase angefasst. Mehrwert: die Seewetter-Seite hat wieder einen Browser-Prüfer (Konsole, Maße, Touch-Ziele). Skizze: READY und die Blöcke B–L auf Dossier/Karte umstellen, dann ein Block für `?tf=1` |
| **V-TF-6** | Der neue Verifier steht nicht in `.github/workflows/ci.yml` (Workflows waren ausgenommen) | Eine Zeile `node scripts/ci-run.mjs verify:sea-tide-window` neben `verify:sea-waterlevel` — Jans Schritt |
| **V-TF-7** | Die Klasse mit Wasserstand gilt nur für den GEWÄHLTEN Spot (nur dessen Pegel ist geladen); die übrigen 55 Spots der Liste und Karte zeigen ihre Klasse ohne Wasserstand | Benannt. Für alle Spots bräuchte es 136 Live-Abrufe oder ein Kurven-Produkt im Daten-Repo — eigene Phase |
| **V-TF-8** | Die 10 cm für „knapp“ sind gesetzt (E-TF-5) | Im UI als gesetzt benannt; die Zahl steht in `TIDE_TIGHT_CM` |
