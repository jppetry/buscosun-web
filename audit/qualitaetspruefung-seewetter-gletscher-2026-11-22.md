# Qualitätsprüfung Seewetter und Gletscher-Monitor — 22.11.2026

Nur geprüft und dokumentiert. Kein Code, keine Daten, kein Commit, kein Push.
Stand der Prüfung: So 22.11.2026, 16:50–17:10 MEZ (15:50–16:10 UTC), `main` = `origin/main` (`6a3af934`), lokaler Dev-Server `localhost:5173`, Chromium 1440 × 900 und 390 × 844.

## Zusammenfassung

**74 Einträge: 5 kritisch, 30 mittel, 39 gering.**

Die fünf wichtigsten Punkte:

1. **Gletscher, Schweiz ohne Satellitenauswertung (K-1).** Der Leser verwirft alle zehn Schweizer Saisondateien der Jahre 2025 und 2026 als Ganzes. Am Grossen Aletschgletscher steht deshalb „Keine klare Szene seit 778 Tagen. Letzte: 05.10.2024“, obwohl klare Szenen aus 2026 im Daten-Repo liegen. Betrifft alle Schweizer Gletscher der Klassen A und B.
2. **Gletscher, Schneefallgrenze (K-2).** Das Dossier zeigt Werte wie „zwischen 10 und 1.290 m“. Die Grenze liegt 700–1 000 m unter dem, was die Temperatur derselben Karte und Open-Meteo ergeben, und widerspricht der Neuschnee-Rechnung an der Zunge.
3. **Gletscher, Tour-Aussagen (K-3, K-4).** „Nächte über 0 °C an der Zunge“ misst beim 11-UTC-Lauf den Nachmittag statt der Nacht. Die Tour-Kachel sagt aus einer bis zu 20 Tage alten Szene im Präsens „darunter liegt Eis offen“.
4. **Seewetter, Widersprüche auf derselben Karte (M-1, M-2).** „Wind 15 kn“ steht neben dem Grund „Wind unter 15 kn“. Die Kachel „Wasser 8–13 °C, amtlich“ steht in Büsum neben gemessenen 5,7 °C.
5. **Seewetter, Böenhinweis am See (K-5) und fehlende Aussagen im Dossier (M-3, M-4).** Der Hinweis „Böen ab 25/34 kn“ überspringt die laufende Stunde. Das Küsten-Dossier zeigt weder die Einordnung mit Grund noch einen ausdrücklichen Satz „keine Warnung“.

Die externen Vergleiche fielen überwiegend gut aus: Stationswerte werden unverändert durchgereicht (GeoSphere, SLF), Seegang, Wasserstand, Temperatur am Gletscher und Niederschlag liegen im plausiblen Rahmen. Auffällig sind nur die Schneefallgrenze (K-2) und der Küstenwind dieser einen Stunde (M-7).

### Was geprüft wurde

| Bereich | Umfang |
|---|---|
| Browser Seewetter | Übersicht, Kartenkarte und Dossier (alle Kapitel) für Warnemünde, Büsum, Hvide Sande, Flüelen (Vierwaldstättersee); mobil Sylt Westerland |
| Browser Gletscher | Übersicht mit Liste; Dossier mit allen drei Ebenen für Pasterze und Grosser Aletschgletscher; mobil Nördlicher Schneeferner (Ebene Wetter) |
| Live-Daten | Zeiger, Spot-, Seen-, Wetter-, Schmelz-, Stations-, Schnee- und Saisondateien aus `buscosun-data` (Stand 22.11. 15:37–15:44 UTC), mit dem echten Vertragscode geprüft |
| Code | Drei getrennte Lesedurchgänge (Küste, Seen und Planer, Gletscher) mit Wegwerf-Skripten gegen die echten Module; die wichtigsten Stellen habe ich selbst gegengelesen |
| Extern | DWD-Stationsmeldungen (über BrightSky), PEGELONLINE, Open-Meteo (Wetter und Marine), GeoSphere (TAWES, SNOWGRID), SLF (IMIS) |
| Produktion | Nur drei statische Seiten abgerufen (`/gletscher/at-pasterzen-kees`, `/gletscher-atlas/`, `/seewetter/warnemuende`): erreichbar, Zahlen wie in der App |

### Was nicht geprüft wurde

- Kein echtes Gerät. WebGL-Aussagen (Riffel, Windpartikel, 3D) stammen aus Chromium am Desktop.
- Der Planer „Ausfahrt planen“ (`?planer=1`) nicht im Browser, nur im Code (Abschnitt „Planer“).
- Keine Tablet-Breite (768–1 439 px), keine 3D-Ansicht, keine Teilen-Links und OG-Karten.
- Keine simulierten Ladefehler, kein Kill-Switch, kein veralteter Lauf im Browser. Diese Fälle sind nur aus dem Code beurteilt.
- Keine Leistungsmessung (Ladezeit, Long Tasks, Bildrate).
- Strömung, Sicht und Wassertemperatur der Seen nicht gegen eine externe Quelle.
- Langzeitwerte der Gletscher (Länge, Massenbilanz, Fläche) nicht gegen GLAMOS, WGMS oder ÖAV. Die Jahrgänge 2024–2026 kann ich nicht verlässlich aus dem Gedächtnis prüfen.
- Die statischen SEO-Seiten nur an drei Adressen.

### Wo die Stichprobe zu klein ist

- **Wind:** eine Stunde, eine Wetterlage (Nord bis Nordost 4–6 Bft). Keine Aussage zu Starkwind, ablandigem Wind oder Schwachwind an der Küste.
- **Seen:** nur Schwachwind (alle Messungen unter 10 kn). Keine Aussage zur Windwelle und zu den Böen bei Föhn oder Gewitter.
- **Seegang:** nur gegen einen zweiten Modellanbieter, nicht gegen Bojen.
- **Gletscher-Wetter:** zwei Gletscher, eine Stunde, eine Kaltluftlage. Niederschlag nur als 24-h-Summe gegen ein zweites Modell.
- **Dossiers:** 4 von 134 Spots und 3 von 2 094 Gletschern im Browser. Kein Klasse-B-Gletscher, kein Gletscher ohne Namen, kein Spot nördlich 55,5° N außer Hvide Sande.

### Wie die Belege zu lesen sind

- **[B]** im Browser gesehen (Text der Seite oder Bildschirmfoto in `C:\dev\buscosun-web\.playwright-mcp\qa\`, git-ignoriert).
- **[D]** aus den Live-Dateien gelesen oder mit dem echten Modul gerechnet (`C:\Users\User\AppData\Local\Temp\claude\c71f0a7be8715222\a1fd2bb8-98dd-47dc-9c60-31e4c6b1a21f\scratchpad\qa-season.mjs` und `C:\Users\User\AppData\Local\Temp\claude\c71f0a7be8715222\a1fd2bb8-98dd-47dc-9c60-31e4c6b1a21f\scratchpad\qa-ext.mjs`; der Ordner ist flüchtig).
- **[C]** von mir im Code gelesen.
- **[A]** Befund eines Lesedurchgangs mit Wegwerf-Skript. Von mir nicht im Browser nachgestellt, wenn nicht anders vermerkt.
- **[X]** externe Quelle, mit Adresse und Zeitpunkt im Abschnitt „Externe Vergleiche“.
- Aufwand: klein = unter einem halben Tag, mittel = ein bis zwei Tage, groß = mehr.

---

## Kritisch

### K-1 · Gletscher · Dossier „Heute“ (Satellit, Saison), Kartenebene „Ausaperung“
- **Art:** Logikfehler (Leser gegen eigene Daten).
- **Beschreibung:** `seasonProblems` verwirft eine Saisondatei als Ganzes, sobald eine Zeile eine Regel verletzt. Seit dem Katalog-Build `20261120-1` tragen Gletscher, die jetzt Klasse B sind, in den Saisondateien noch eine Schneegrenze („Klasse B mit Schneegrenze“). Damit fallen alle Schweizer Regionen der Jahre 2025 und 2026 weg. Das Dossier nimmt das jüngste Jahr, das übrig bleibt (2024).
- **Nachstellen:** `/gletscher?sel=ch-grosser-aletschgletscher&dossier=1`, Ebene „Heute“.
- **Beleg:** [B] „Keine klare Szene seit 778 Tagen. Letzte: 05.10.2024.“, Überschrift „SAISON 2024“, darunter die Legende „Szenen 2026“; in der Kartenlegende „Sentinel-2 in 10 m · 05.10.2024“ und Zeitpunkte „Szene 05.10. / 02.10. / 22.09.“ ohne Jahr. [D] Die Datei `season/2026/ch-mitte-west/20261121T2245Z.json` enthält für den Aletschgletscher klare Szenen ab 01.06.2026. [D] `qa-season.mjs` mit dem echten `seasonProblems`: 36 Dateien angenommen, 10 verworfen (2025 und 2026 je `ch-mitte-ost`, `ch-mitte-west`, `ch-ost`, `ch-sued`, `ch-west`), zum Beispiel „2026 ch-mitte-west (252 Gletscher): 147 Probleme“. Österreich ist nicht betroffen (Pasterze zeigt „SAISON 2026“).
- **Schwere · Aufwand:** kritisch · klein bis mittel.
- **Vorschlag:** Im Leser nur die verletzende Zeile oder den Gletscher verwerfen, nicht die Region. Im Producer die Schneegrenze für Klasse B beim Schreiben weglassen und die zehn Dateien neu bauen (Push ins Daten-Repo ist Jans Schritt). Datum einer Szene, die älter als ein Jahr ist, immer mit Jahr zeigen.

### K-2 · Gletscher · Dossier „Wetter“ (Karte „Wetter am Gletscher“, Leiter „Am Gletscher, nach Höhe“)
- **Art:** Datenabweichung und Widerspruch auf derselben Seite. Die Schneefallgrenze kommt aus buscosun Fusion — Änderungen dort sind eine STOPP-Grenze.
- **Beschreibung:** (a) Die Schneefallgrenze fällt in der Nacht auf 10–50 m über Meer, in Österreich und der Schweiz also unter jedes Gelände. (b) Sie liegt unter der Zunge, während die Zunge Plusgrade hat. (c) Die Leiter sagt „Darüber fällt Niederschlag laut Modell als Schnee“, rechnet an derselben Zunge aber nur einen Teil als Schnee (Regel „Temperatur“). Wahrscheinliche Ursache (Vermutung): die Grenze wird vom kalten Punkt der mittleren Höhe mit festem Gradienten nach unten gerechnet.
- **Nachstellen:** `/gletscher?sel=at-pasterzen-kees&dossier=1` und `…sel=ch-grosser-aletschgletscher…`, Ebene „Wetter“.
- **Beleg:** [B] Pasterze: „Schneefallgrenze, Mittel 720 m“ und „Jetzt bei 1.290 m, in den nächsten 24 Stunden zwischen 10 und 1.290 m“. [D] Stundenreihe `sl` der Pasterze im Lauf `2026112211`: 1360, 1370, 1450, 1290 … 80, 10, 10, 10, 10, 20; Tagesmittel 720 und 240 m. [D] Im selben Lauf haben 160 von 957 Gletschern mit Schneefallgrenze ein Tagesmittel unter 600 m, 4 unter 100 m. [B] Aletsch: Zunge 1.725 m „Jetzt 2,9 °C“, Schneefallgrenze „Jetzt bei 1.580 m“, Neuschnee Zunge 16,3 von 31,7 mm. [D] Stundenreihe `sn` der Aletsch-Zunge: 0 mm Schnee in den ersten sieben Stunden bei 1,0–1,2 mm Niederschlag je Stunde. [X] Open-Meteo, 16 UTC: Nullgradgrenze an der Pasterze 2 180–2 560 m (24 h: 1 700–2 580 m), am Aletsch 2 380–2 750 m; Temperatur an der Aletsch-Zunge 2,1 °C (buscosun 2,8 °C). Eine Schneefallgrenze liegt üblicherweise 200–400 m unter der Nullgradgrenze, hier also bei rund 1 800–2 300 m statt 1 150–1 580 m.
- **Schwere · Aufwand:** kritisch · mittel (Anzeige) bis groß (Ursache in buscosun Fusion, erst nach Rücksprache).
- **Vorschlag:** Sofort in der Anzeige: Werte unter der Talhöhe als „bis ins Tal“ zeigen, nie als Meterzahl; den Satz „Darüber fällt … als Schnee“ nur zeigen, wenn die Neuschnee-Regel dasselbe ergibt. Danach die Herleitung der Schneefallgrenze an Hochlagenpunkten gegen Messungen prüfen (zum Beispiel SLF-Schneefallgrenze, Radiosonden).

### K-3 · Gletscher · Dossier „Heute“, Kachel „Nächte über 0 °C an der Zunge“
- **Art:** Logikfehler.
- **Beschreibung:** Der Kommentar sagt „night = 22–05 UTC“, der Index zählt aber Stunden ab der Laufstunde. Beim 11-UTC-Lauf ist das Fenster 09–17 UTC, also der Nachmittag. Die Zahl springt mit der Laufstunde.
- **Nachstellen:** Ebene „Heute“ eines Gletschers mit tiefer Zunge, Lauf 11 UTC.
- **Beleg:** [C] `scripts/glacier/melt.mjs:214`: `const from = 24 * d + 22, to = from + 8;` auf `tTongue[h]`, das ab der Laufstunde läuft. [A] Probe: tags +6 °C, nachts −4 °C ergibt bei Lauf 05, 17, 23 UTC „0 von 13“, bei Lauf 11 UTC „13 von 13“. [B] Lauf 11 UTC: Pasterze „6 von 13“ bei Zungen-Minimum −7,0 °C, Aletsch „9 von 13“ bei Minimum −1,1 °C in den nächsten 24 Stunden.
- **Schwere · Aufwand:** kritisch (Frostnächte sind eine Tour-Größe) · klein.
- **Vorschlag:** Fenster aus der Uhrzeit von `t0 + h` bestimmen (22–06 Uhr Ortszeit), nur vollständige Nächte zählen.

### K-4 · Gletscher · Dossier „Heute“, Block „Tour“, Zeile „Zustand der Oberfläche“
- **Art:** Formulierung zu sicher.
- **Beschreibung:** Die Zeile beschreibt eine bis zu 20 Tage alte Szene im Präsens („Eis und Spalten liegen offen“, „darunter liegt Eis offen“). Schnee seit der Szene geht nicht ein. Dünner Neuschnee über Spalten ist der gefährliche Fall.
- **Nachstellen:** Pasterze, Ebene „Heute“, Block „Tour“.
- **Beleg:** [B] „Zustand der Oberfläche, Satellit 15.11.2026 — Schneegrenze bei 2 079 m; darunter liegt Eis offen“ am 22.11.; der Gletscher beginnt bei 2.077 m (2 m Höhenband), AAR 1,00. Dieselbe Seite zeigt in der Schneeanalyse „61 cm Schnee, +5 cm seit 15.11.“. [C] `src/glacier/glacierSheetModel.ts:357`, Altersgrenze 20 Tage.
- **Schwere · Aufwand:** kritisch · klein.
- **Vorschlag:** Vergangenheit mit Datum („Am 15.11. zeigte die Szene …“), dazu „Schneefall seither ist nicht erfasst“. Kein Satz über Spalten. Liegt die Schneegrenze am unteren Rand, „ganz schneebedeckt“ schreiben. Im Winter kürzere Altersgrenze.

### K-5 · Seewetter · Seen-Dossier, Zeile „Böen ab 25/34 kn“
- **Art:** Logikfehler.
- **Beschreibung:** Die Stundenreihe beginnt bei der vollen Stunde, verglichen wird gegen die ungerundete Uhrzeit. Die laufende Stunde wird übersprungen. An Seen ohne amtliche Warnung im Datenbestand (Schweiz, Österreich) ist das der einzige Hinweis.
- **Nachstellen:** Seen-Dossier in einer Stunde, in der nur die laufende Stunde 25 kn erreicht (heute nicht im Browser nachstellbar, Schwachwind).
- **Beleg:** [C] `src/sea/lakeView.ts:41`: `if (h.t < fromMs || …) continue;`. [A] Probe: jetzt 13:20 UTC, Böe 27 kn nur in der Stunde 13:00 ergibt keinen Hinweis, während die Kachel „Böen 27 kn“ zeigt.
- **Schwere · Aufwand:** kritisch · klein.
- **Vorschlag:** Gegen die abgerundete Stunde vergleichen; „in dieser Stunde“ nur bei der laufenden Stunde.

---

## Mittel

### Seewetter

#### M-1 · Seewetter · Kartenkarte und Liste (Einordnung nach Profil)
- **Art:** Darstellungsfehler (Rundung).
- **Beschreibung:** Die Klasse rechnet ungerundet, die Anzeige rundet. Wert und Grund widersprechen sich.
- **Nachstellen:** `/seewetter/sylt-westerland`, Profil Kite, Stunde So 16 Uhr.
- **Beleg:** [B] Bildschirmfoto `sea-05-sylt-card-390.jpg`: „WIND 15 kn“ und darunter „Wind unter 15 kn“. [D] Spot-Datei: 7,7 m/s = 14,97 kn. [A] Weitere Fälle: 0,54 m gezeigt als „0,5 m“ mit „Welle über 0,5 m“; Gründe stehen immer in kn, auch bei km/h oder Bft. Dasselbe am See und im Planer (24,6 kn als „25 kn“ ohne Hinweis „ab 25 kn“).
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Im Grund den Wert eine Stelle genauer nennen („Wind 14,97 kn“ → „knapp unter 15 kn“) oder am gerundeten Wert vergleichen. Eine Regel für Küste, See und Planer.

#### M-2 · Seewetter · Dossier „Wetter“, Kachel „Wasser“
- **Art:** Widerspruch auf der Seite; amtlicher Text zusammengefasst.
- **Beschreibung:** Die Kachel bildet Minimum und Maximum über alle Teile des Mittelfrist-Berichts und beschriftet das mit „amtlich“. Die Spanne steht so in keinem amtlichen Text und gilt für das offene Meer.
- **Nachstellen:** `/seewetter/buesum`, Kapitel „Wetter“ und „Wasserstand“.
- **Beleg:** [B] „WASSER 8–13 °C · Nordsee · Mittelfrist, amtlich“; im Kapitel Wasserstand „Gemessen, 16:44 Uhr 5,7 °C am WSV-Pegel Büsum“ und „Modell 4,9 °C“. Warnemünde: Kachel „7–10 °C“, Modell 6,9 °C. [D] FXDL40 im Wortlaut: „Norden 9 bis 11 Grad / Mitte 10 bis 12 Grad / Süden 8 bis 13 Grad“. [C] `SeaReadout.tsx:140–145`.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Kachel durch den Wert der Wassertemperatur-Karte ersetzen (Messung, sonst Modell, mit Herkunft). Den amtlichen Text nur wörtlich im Kapitel „Amtlich“ lassen.

#### M-3 · Seewetter · Dossier „Wetter“ (Stundenkarte)
- **Art:** Lücke.
- **Beschreibung:** Das Dossier zeigt die Einordnung („außerhalb“), den Grund und das nächste Fenster nicht als Text. Sie stehen nur in der Kartenkarte, in der Liste und als Farbbalken „Profil“ im Stundenband (Tooltip, auf Touch nicht erreichbar).
- **Nachstellen:** `/seewetter/warnemuende`, Dossier, Kapitel „Wetter“.
- **Beleg:** [B] Kartenkarte: „außerhalb deiner Grenzen · Dunkelheit · Nächstes Fenster Mo 08–16 Uhr“; im Dossier-Text aller drei Kapitel kommt nichts davon vor. [A] `SeaReadout.tsx:339–556` liest aus dem Urteil nur die Lage zum Ufer; der Zweig mit `spotCard` und `windowCard` ist nie erreichbar, weil `SeaPage.tsx:1551` immer `layout="dossier"` übergibt.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Zeile „‹Klasse› · ‹Gründe›“ und „Nächstes Fenster“ in die Stundenkarte. Den toten Zweig danach mit Jans Freigabe entfernen oder wieder anschließen.

#### M-4 · Seewetter · Dossier, Kapitel „Amtlich“
- **Art:** Lücke (Ehrlichkeit des Warnstatus).
- **Beschreibung:** Liegt keine Warnung vor, fehlt das Banner, und nirgends steht der amtliche Satz mit Nummer und Ausgabezeit. Der Nutzer liest „keine Warnung“ aus der Abwesenheit.
- **Nachstellen:** `/seewetter/buesum`, Kapitel „Satellit & Amtlich“.
- **Beleg:** [B] Nur die zugeklappte Zeile „Warnmeldung im Wortlaut (WODL45) — Rohtext“; Warnemünde hat dagegen das Banner „Amtliche Meldung … Nr. 506“. [A] `OfficialCard` (`SeaReadout.tsx:890–912`) ist nicht erreichbar.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Statuskachel je Küste mit dem wörtlichen Satz, der Nummer und der Ausgabezeit, auch im Fall „keine Warnung“.

#### M-5 · Seewetter · Kachel „An Land gemessen“ (Rückfall auf die DWD-POI-Datei)
- **Art:** Logikfehler.
- **Beschreibung:** Der Rückfall nimmt die jüngste Zeile mit Wert, egal wie alt, und zeigt nur die Uhrzeit. Die anderen Messpfade haben Altersgrenzen (Sicht 3 h, DMI 1 h, obs/v1 90 min).
- **Nachstellen:** Station, deren POI-Datei steht, während obs/v1 keinen frischen Wert hat (nicht im Browser nachgestellt).
- **Beleg:** [C] `src/sea/seaClient.ts:476`: `if (o.ffMs != null || o.fxMs != null) return o;` ohne Altersprüfung. [A] Probe mit gestelltem Abruf: Zeile von vor 51 h wird als „… · 10:00 Uhr“ gezeigt. Dazu [A]: die Notiz sagt „Böe der letzten Stunde“, obs/v1 liefert die Böe der letzten 10 Minuten.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Altersgrenze wie bei der Sicht, darüber „keine Messung“; Wochentag zeigen, wenn nicht heute.

#### M-6 · Seewetter · Tidenfenster (eigene Schwelle)
- **Art:** Logikfehler.
- **Beschreibung:** Fenster werden auf einen Beginn innerhalb von 78 Stunden gefiltert. Der Satz nennt aber das Ende der ganzen Reihe (Gezeit bis etwa +137 h) und sagt „zu keiner Zeit“.
- **Nachstellen:** Pegel mit Gezeit, Schwelle so wählen, dass sie nur nach +78 h überschritten wird.
- **Beleg:** [C] `SeaPage.tsx:617–618`: `end: series.end` neben `.filter((w) => w.from < horizon)`. [A] Probe: Schwelle „mindestens 680 cm“, nur bei +90 h überschritten, ergibt „Bis Sa 06:00 Uhr liegt der Wasserstand zu keiner Zeit über deiner Schwelle“. Nicht im Browser nachgestellt.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Im Satz den Horizont nennen oder nicht filtern.

#### M-7 · Seewetter · Wind an den Spots (buscosun Fusion 14)
- **Art:** Datenabweichung (plausibel, aber einseitig).
- **Beschreibung:** An vier von sieben Stationen bis 7 km vom Spot lag der gemessene Mittelwind über der oberen Grenze der Spanne „meist“ (q90). Die Lage war auflandig aus Nord bis Nordost.
- **Beleg:** [X][D] 15:30–15:40 UTC, Messung gegen buscosun Fusion in kn: Norderney 16,5 gegen 13,4 (meist 11,3–15,4); Cuxhaven 16,9 gegen 11,5 (8,2–14,8); Fehmarn Westermarkelsdorf 19,8 gegen 16,1 (14,0–18,1); Warnemünde 20,4 gegen 16,7 (14,6–18,9). In der Spanne: Helgoland 16,5 gegen 15,4; List 11,1 gegen 13,0; Kiel 8,4 gegen 9,9. Böen: −4,3 bis +4,9 kn. Die Seite nennt selbst eine Trefferquote von „rund 3 von 4“.
- **Schwere · Aufwand:** mittel · mittel (Auswertung über mehr Lagen).
- **Vorschlag:** Aus der Ablage auswerten, ob der Mittelwind bei auflandigem Wind an Küstenstationen systematisch zu niedrig ist. Eine Stunde ist dafür zu wenig. Änderungen an buscosun Fusion erst nach Rücksprache.

#### M-8 · Seewetter · Pegelkarte, Kategorie des BSH
- **Art:** Logikfehler und Formulierung zu sicher.
- **Beschreibung:** Unter einem Etikett stehen drei Felder (Regionsstufe, automatische Pegelwarnung, Ereignisse), ohne Zeitfilter. Der Text darunter („gilt für die Nordsee, nicht für diesen Pegel“) stimmt nur für die Regionsstufe.
- **Beleg:** [A] `waterLevel.ts:477–482`; Probe: ein Ereignis von vor 10 h mit „Sturmflut“ steht oben. Ob das BSH an vergangenen Ereignissen solche Werte führt, ist eine Vermutung. [B] Normalfall gesehen: „Erhoehter Wasserstand — Kategorie des BSH, wörtlich. Sie gilt laut BSH für die Ostsee“.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Herkunft je Feld benennen; Ereignisse nur ab jetzt und mit ihrer Zeit.

#### M-9 · Seewetter · Kopfzeile „Aktuell“
- **Art:** Logikfehler.
- **Beschreibung:** Die Frische wird beim Laden berechnet und gespeichert. Scheitert die Auffrischung, bleibt „Aktuell“ in einem offenen Tab stehen; „Veraltet“ (18 h) und „Keine Daten“ (30 h) kommen nie.
- **Beleg:** [A] `SeaPage.tsx:342, 353`: der alte Stand bleibt samt `freshness: 'live'`. Nicht im Browser nachgestellt.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Frische bei jedem Zeichnen aus Laufzeit und Uhr rechnen.

#### M-10 · Seewetter · Alter der Windrechnung an der Küste
- **Art:** Lücke.
- **Beschreibung:** Die Kopfzeile bewertet nur den Wellenlauf. Wann der Wind gerechnet wurde und aus welchem Cube, steht an der Küste nirgends (an den Seen schon). Steht der Punkt-Cron, zeigt die Seite alten Wind mit „Aktuell“.
- **Beleg:** [B] Kopfzeile: „Lauf CWAM 00 UTC · bereit 05:19 · Seewetterbericht 15:00 · Warnstatus 16:00 MEZ“, kein Wort zum Wind; Seen: „gerechnet 15:12 Uhr“. [A] Quellen-Reiter mit `computedAt` ist nicht erreichbar.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** „Wind gerechnet ‹Zeit›“ in die Notiz der Windkachel; „veraltet“ ab einer gesetzten Grenze.

#### M-11 · Seewetter · Pegelkarte zwischen Ende der Modellkurve und Ende der Gezeit
- **Art:** Logikfehler.
- **Beschreibung:** Für eine Stunde hinter dem Ende der Modellkurve zeigt die Karte „–“ ohne den erklärenden Satz, weil als Ende der letzte Punkt überhaupt gilt (auch reine Gezeit).
- **Beleg:** [A] `SeaReadout.tsx:636–641`, `waterLevel.ts:465`; Probe: Stunde +60 h, Modell endet +54 h. Nicht im Browser nachgestellt.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Ende der Modellkurve wie in `tideSeries().curveEnd` bestimmen.

#### M-12 · Seewetter · Kacheln „Böen“ (Küste und Seen), Einheit Bft
- **Art:** Logikfehler (Einheit).
- **Beschreibung:** Die Differenz Böe − Mittel geht durch die Beaufort-Skala. Aus 20 und 30 kn wird „Spanne 3 Bft“ (richtig: zwei Stufen oder 10 kn); am See „4 Bft über dem Mittel“ statt 2.
- **Beleg:** [C] `SeaReadout.tsx:414`: `Spanne ${fmtWind(spread, p.unit)}`. [A] dasselbe in `SeaLakeReadout.tsx:195`.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Spanne immer in kn oder als Differenz der gezeigten Stufen.

#### M-13 · Seewetter · Seen: Marke „keine Daten“, Legende und Fußzeile
- **Art:** Darstellungsfehler.
- **Beschreibung:** An einem See mit Wind- und Böenwert steht die Marke „keine Daten“, gemeint ist „keine Einstufung“. Legende und Band nennen Seegang, Strömung und „Welle: Modell CWAM“, die es am See nicht gibt. Die leeren Wellenzeilen sind als V-BS-19 bekannt, die Marke und die CWAM-Fußzeile nicht.
- **Nachstellen:** `/seewetter/vierwaldstaettersee-flueelen`.
- **Beleg:** [B] Kartenkarte: „keine Daten“ über „WIND 2 kn · BÖEN 6 kn“, darunter „an Seen noch keine Einstufung“; Band: „Profil | keine Daten“, „Welle: Modell CWAM 00 UTC · Wind/Böen: buscosun Fusion 14“; Legende „Modell CWAM 00 UTC, Vorlauf +15 h“.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Marke „noch keine Einstufung“; am See die Wellenzeilen, die CWAM-Fußzeile und die Seegangslegende weglassen.

#### M-14 · Seewetter · Seen: Böenhinweis nennt nur die höchste Klasse
- **Art:** Logikfehler.
- **Beschreibung:** Sind 25 kn ab +1 h und 34 kn ab +5 h erreicht, nennt die Seite nur „Böen ab 34 kn ab 19 Uhr“. Der frühere Beginn fehlt.
- **Beleg:** [C] `lakeView.ts:43`. [A] Probe.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Erste Stunde je Klasse getrennt führen und beide nennen.

### Gletscher

#### M-15 · Gletscher · Übersicht, Ebene „Länge zuletzt“ (Karte und Rangliste)
- **Art:** Logikfehler (Vergleichbarkeit).
- **Beschreibung:** Die Beschriftung sagt „Längenänderung im letzten Messjahr“. Verglichen werden aber Mehrjahres-Intervalle und Jahrzehnte alte Messungen, ohne Normierung und ohne Altersgrenze.
- **Nachstellen:** `/gletscher`, Liste rechts.
- **Beleg:** [B] Rang 2 „Turtmanngletscher −562 m, 2018–2024“, Rang 3 „Feegletscher −475 m, 2020–2023“, Rang 18 „Habach Kees −100 m, 1985/86“, Rang 19 „Schwarzgletscher −100 m, 2014/15“, neben Einjahreswerten wie „Pasterzen Kees −204 m, 2022/23“. [A] Im Build enden 35 von 248 Reihen mit einem Mehrjahres-Intervall, 50 vor 2015; `glacierView.ts:120–124`.
- **Schwere · Aufwand:** mittel · mittel.
- **Vorschlag:** Auf Meter je Jahr normieren; für Farbe und Rang nur Messungen der letzten zwei bis drei Jahre; Älteres als „letzte Messung 1986“ ohne Rang.

#### M-16 · Gletscher · Übersicht, Ebene „Fläche je Jahrzehnt“
- **Art:** Logikfehler (Vergleichbarkeit).
- **Beschreibung:** Die Rate reicht vom ersten bis zum letzten Inventar. Österreich: 2015 bis 2021–23; Schweiz meist 1850 bis 2021–24. Ein 173-Jahres-Mittel steht neben einer 8-Jahres-Rate, Österreich erscheint systematisch dunkler.
- **Beleg:** [A] `glacierView.ts:95–101`; Probe: −60 % über 1850–2023 ergibt „−5,2 %“, −56,7 % über 2015–2023 ergibt „−64,9 %“. Nicht im Browser angesehen.
- **Schwere · Aufwand:** mittel · mittel.
- **Vorschlag:** Rate aus den zwei jüngsten Inventaren oder nur Paare mit Startjahr ab 2000; die Mischung in der Legende benennen.

#### M-17 · Gletscher · Dossier „Wetter“ und „Heute“: 24-Stunden-Blöcke als Kalendertage
- **Art:** Darstellungsfehler.
- **Beschreibung:** Ein „Tag“ zählt 24 Stunden ab der Laufstunde (`rules.day: "from-run-hour"`), wird aber mit einem Wochentag beschriftet. Zwei Stellen beschriften denselben Block verschieden (UTC-Wochentag gegen Ortsdatum).
- **Beleg:** [B] Pasterze: Karte „Niederschlag 3,7 mm … 24 Stunden ab Lauf“ und Leiter „Neuschnee So 22.11. 3,7 mm“ mit demselben Wert; Aletsch 31,7 mm an beiden Stellen. [D] `rules.day` im Lauf `2026112211`. [A] `GlacierSheetTabs.tsx:22` gegen `GlacierWeatherCard.tsx:126`; beim Lauf 17 UTC ist „Sa“ überwiegend Sonntag.
- **Schwere · Aufwand:** mittel · mittel.
- **Vorschlag:** Im Producer auf Kalendertage in Ortszeit schneiden. Mindestens ein gemeinsamer Beschriftungshelfer („So ab 12 Uhr“).

#### M-18 · Gletscher · Dossier „Heute“, Kachel „Fläche ohne Schneedecke“
- **Art:** Logikfehler und Widerspruch zur Schneeanalyse.
- **Beschreibung:** Gezählt werden nur Bänder unter der Medianhöhe mit höchstens 5 mm Schneewasser. Nach einem Neustart des Zustands zeigt die Kachel rund 50 %, auch im Winter. Der Abgleich mit dem Satelliten wird bei jedem Lauf neu angewandt und löscht Schnee, der nach der Szene fiel.
- **Beleg:** [D] Lauf `2026112211`: 195 von 2 094 Gletschern mit mindestens 40 % „ohne Schneedecke“ (169 Schweiz, 26 Österreich), 98 mit mindestens 50 %; darunter Vadret da Morteratsch 50 %. Gegenprobe mit SNOWGRID vom 21.11.: Schareckkees E 44 % bei 113 cm Schnee, Hocharnkees 62 % bei 96 cm, Schlapperebenkees 57 % bei 104 cm. [A] `melt.mjs:198–199`, `352–356`. [B] Pasterze 0 %, Aletsch 2 % (dort unauffällig).
- **Schwere · Aufwand:** mittel · mittel.
- **Vorschlag:** Je Szene nur einmal abgleichen; beim Neustart „keine Daten“ statt 50 %; die Kachel so benennen, wie gerechnet wird, oder die Grenze an der Medianhöhe streichen.

#### M-19 · Gletscher · Dossier: Vorbehalt und amtliche Verweise
- **Art:** Lücke (Ehrlichkeit).
- **Beschreibung:** Das Dossier öffnet auf der Ebene „Wetter“ (Neuschnee, Böen, Schneefallgrenze). „Kein amtliches Warnprodukt“ steht dort nicht, „Kein Urteil über Begehbarkeit“ nur im Tour-Block der Ebene „Heute“. Der einzige Lawinen-Link ist für alle Gletscher `lawinen.report` (Euregio Tirol, Südtirol, Trentino). Ein Link auf amtliche Wetterwarnungen fehlt.
- **Beleg:** [B] Pasterze (Kärnten/Salzburg) und Aletsch (Schweiz): „Lawinenreport Euregio (Winter) ↗“. [C] `GlacierHeuteBoard.tsx:180`, `GlacierSheetTabs.tsx:378`, feste Adresse ohne Land oder Region. [B] Ebene „Wetter“ trägt nur „Modell, im Hochgebirge noch nicht nachgemessen“.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Fester Vorbehalt auf jeder Ebene. Lawinendienst je Land und Region (SLF, Landesdienste, Lawinenwarndienst Bayern), dazu die amtliche Warnseite.

#### M-20 · Gletscher · Dossier-Kopf, Kachel „Massenbilanz“
- **Art:** Darstellungsfehler und Lücke.
- **Beschreibung:** Am Nördlichen Schneeferner steht als Kennzahl eine 58 Jahre alte, positive Bilanz ohne Vorzeichen. „Massenbilanz seit 1962/63“ klingt nach einer laufenden Reihe.
- **Nachstellen:** `/gletscher?sel=de-noerdlicher-schneeferner&dossier=1`.
- **Beleg:** [B] „MASSENBILANZ 623 mm w. e. · gemessen 1967/68“ und „Leitgletscher · Massenbilanz seit 1962/63“; andere Gletscher tragen das Vorzeichen („−1.450 mm w. e.“).
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Werte älter als etwa fünf Jahre nicht als Kennzahl, sondern als „letzte Messung 1967/68“; Vorzeichen immer; „Massenbilanz 1962/63–1967/68“.

#### M-21 · Gletscher · Stationskarten: „vor x Minuten“ und die Drei-Stunden-Grenze
- **Art:** Logikfehler.
- **Beschreibung:** Die Uhr der Seite läuft nur alle 30 Minuten weiter. Altersangabe, Striche „Aktuell“, die Grenze „älter als drei Stunden“ und das „Jetzt“ der Wetterkarte hängen daran.
- **Beleg:** [A] `GlacierPage.tsx:80, 155`; Probe: Stempel 09:50, geladen 10:00, um 10:29 steht weiter „vor 10 Minuten“. Nicht im Browser nachgestellt.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Im Dossier ein Minutentakt oder Uhrzeiten statt Altersangaben.

#### M-22 · Gletscher · Lauf älter als 24 Stunden
- **Art:** Darstellungsfehler (nur bei ausgefallenen Läufen).
- **Beschreibung:** Ein Schmelzlauf gilt bis 30 Stunden als frisch. Ab 24 Stunden kommt die Zahl aus Tag 1, Überschrift, Markierung und Nullgradgrenze aber aus Tag 0.
- **Beleg:** [A] `glacierSheetModel.ts:335–338`, `GlacierHeuteBoard.tsx:111, 129, 150`.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Tagesindex durchreichen oder die Grenze auf 24 Stunden setzen.

#### M-23 · Gletscher · Tour-Zeile bei Klasse B
- **Art:** Darstellungsfehler.
- **Beschreibung:** Klasse B trägt nie eine Schneegrenze. Bei teilweiser Schneedecke entsteht „Schneegrenze bei —; darunter liegt Eis offen“.
- **Beleg:** [A] `glacierSheetModel.ts:357`; Probe. Kein Klasse-B-Gletscher im Browser geprüft.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Für Klasse B „x % der Fläche schneefrei (Szene vom …)“.

#### M-24 · Gletscher · Längenmessungen Österreich enden 2022/23
- **Art:** Lücke (Vermutung zur Verfügbarkeit).
- **Beschreibung:** Die Pasterze zeigt als jüngste Länge 2022/23, die Massenbilanz reicht bis 2024/25. Ob die Quelle (WGMS) die jüngeren Längen schon führt, habe ich nicht geprüft.
- **Beleg:** [B] „Pasterzen Kees −204 m 2022/23“, „Länge 1969 → 2023“, „Massenbilanz gemessen 2024/25“.
- **Schwere · Aufwand:** mittel · mittel.
- **Vorschlag:** Beim nächsten Katalog-Build prüfen, ob die Gletscherberichte 2023/24 und 2024/25 verfügbar sind; sonst den Stand der Quelle an der Zahl nennen.

### Planer „Ausfahrt planen“ (ausgeblendet, nur mit `?planer=1`)

Alle Punkte aus dem Code, nicht im Browser. Sie sind vor dem Wiedereinschalten wichtig.

#### M-25 · Planer · Etappe und „Eigener Punkt“: Windrichtung nicht gefüllt
- **Art:** Logikfehler (Widerspruch zum Dossier).
- **Beschreibung:** Der Producer füllt die Richtung an interpolierten Stunden, der Planer liest sie roh. Eine Etappe ab dem Wasserpunkt eines Spots zeigt „Richtung fehlt“, das Dossier desselben Punkts nennt eine.
- **Beleg:** [A] `seaTripData.ts:47`. Das Ausmaß ist nicht gemessen.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Dieselbe Füllung im Planer anwenden.

#### M-26 · Planer · Bodensee-Etappe: Landesparameter hängen von der Fahrtrichtung ab
- **Art:** Logikfehler.
- **Beschreibung:** Das Land des ersten Endes gilt für alle Probenpunkte: Konstanz → Bregenz rechnet mit DE, Bregenz → Konstanz mit AT. Kein Vermerk.
- **Beleg:** [A] `lakeTrip.ts:47–51`. Die Größe der Abweichung ist nicht gemessen.
- **Schwere · Aufwand:** mittel · mittel.
- **Vorschlag:** Land je Probenpunkt aus den Landesumrissen bestimmen oder die Mischung benennen.

#### M-27 · Planer · Fenster über Nacht
- **Art:** Lücke, Formulierung zu sicher.
- **Beschreibung:** Der Sonnenstand wird nur zur Rückkehr bestimmt. Start 15:00, Rückkehr am Folgetag 10:00 ergibt „Rückkehr 6 h 8 min vor Sonnenuntergang“, ohne ein Wort zur Nacht dazwischen.
- **Beleg:** [A] `SeaPage.tsx:829–833`, `seaPlanner.ts:270–280`; Probe Kiel 22./23.11.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Alle Sonnenunter- und -aufgänge im Fenster nennen („davon n Stunden bei Dunkelheit“).

#### M-28 · Planer · „Vor Ort“: Welle nie gegen die Grenze geprüft
- **Art:** Lücke.
- **Beschreibung:** Die Zusammenfassung kennt nur Wind und Böen. Der Assistent verspricht „Wind, Böen, Welle und Strom …, gemessen an deinen Grenzen“.
- **Beleg:** [A] `seaPlanner.ts:163–167, 211–256`; `seaSteps.ts:81`.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Welle wie Wind prüfen oder den Satz „Welle wird im Fenster nicht geprüft“ zeigen.

#### M-29 · Planer · „n von m Stunden haben keinen Windwert“ nennt die falsche Größe
- **Art:** Logikfehler.
- **Beschreibung:** Fehlt der Wind in einer und die Böe in vier von fünf Stunden, steht „4 von 5 Stunden … keinen Windwert“.
- **Beleg:** [A] `seaPlanner.ts:386–389`.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Zwei Sätze mit je eigener Zahl.

#### M-30 · Planer · Etappe durch dänisches Wasser ohne den dänischen Hinweis
- **Art:** Lücke.
- **Beschreibung:** Der Satz „Kalibrierung für Deutschland, in Dänemark nicht geprüft“ steht an jedem dänischen Spot, im Planer nirgends, obwohl die Etappe dort mit deutschen Parametern rechnet.
- **Beleg:** [A] `seaTripData.ts:58`; die Konstante wird nur in `SeaReadout.tsx` und `seaSeoText.ts` benutzt.
- **Schwere · Aufwand:** mittel · klein.
- **Vorschlag:** Hinweis in die Befunde, sobald ein Probenpunkt außerhalb des deutschen Umrisses liegt.

---

## Gering

### Seewetter

#### G-1 · Seewetter · Kartenhinweis „Karte erkunden“
- **Art:** Verbesserung, Darstellungsfehler mobil.
- **Beschreibung:** Der Hinweis erscheint bei jedem Laden (Absicht: `always`), auch bei einem Link auf einen Spot, und liegt dann über der Spot-Karte. Mobil ist das Etikett des Leuchtpunkts links abgeschnitten, und das Bild zeigt eine Maus.
- **Beleg:** [B] `sea-03-flueelen-map-1440.jpg` (Hinweis über der Karte „Flüelen“), `sea-04-sylt-390.jpg` („asterland · Klicken für Details“). [C] `SeaPage.tsx:1650, 1752`.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Bei gewähltem Spot nicht zeigen; Etikett in den sichtbaren Bereich klemmen; auf Touch eine Fingergeste zeigen.

#### G-2 · Seewetter · Dezimalzeichen und Stationsnamen
- **Art:** Darstellungsfehler.
- **Beschreibung:** Entfernungen stehen teils mit Punkt, teils mit Komma auf derselben Seite. Achsen im Diagramm mit Punkt. Stationsnamen in DWD-Schreibweise.
- **Beleg:** [B] „DWD-Station Warnemuende, 0.2 km vom Spot“ und „0,2 km vom Spot“; „Elpersbuettel, 12.9 km“; Achse „0 · 0.5 · 1 · 1.5“ neben „0,6 m“. [A] Aus dem Katalog entstehen „St. peter ording“, „List/sylt“, „Kiel-h.“.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Ein Zahlenformat; Anzeigenamen der Stationen im Katalog pflegen.

#### G-3 · Seewetter · Füllstand-Text am Pegel
- **Art:** Darstellungsfehler.
- **Beschreibung:** „unter dem Tidehub“ (ein Hub ist keine Höhe); in der Ostsee „über dem Spanne MNW–MHW“.
- **Beleg:** [B] Büsum: „unter dem Tidehub (−1 cm gegen MTnw)“. [A] `SeaReadout.tsx:820–823`.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** „unter MTnw“, „über MThw“ beziehungsweise „über MHW“.

#### G-4 · Seewetter · Hoch- und Niedrigwasser: Vorzeichen, Einheiten, Fachkürzel
- **Art:** Darstellungsfehler.
- **Beschreibung:** Auf einer Karte stehen „641 cm ± 10 cm“, „-0,2 m gegen MThw“ (Bindestrich statt Minus, Meter statt Zentimeter), „+/-0,0 m“ und „automatisch (MOS r0)“.
- **Beleg:** [B] Büsum, Kapitel Wasserstand. Ob die Texte wörtlich vom BSH stammen, habe ich nicht geprüft.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Eigene Angaben einheitlich in cm mit echtem Minus; „MOS r0“ erklären oder weglassen.

#### G-5 · Seewetter · Pegelkarte „Bezug dieses Pegels“
- **Art:** Darstellungsfehler.
- **Beschreibung:** Der Satz „Pegelnull 498 cm unter NHN · MHW 617 cm · MNW 407 cm“ steht in der großen Schrift eines Werts.
- **Beleg:** [B] `sea-02-warnemuende-dossier-1440.jpg`.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Als kleine Liste setzen.

#### G-6 · Seewetter · Dünung „0,0 m“ mit Periode und Richtung
- **Art:** Darstellungsfehler.
- **Beleg:** [B] Warnemünde: „DÜNUNG 0,0 m · Periode 4,2 s · aus NW“.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Unter einer kleinen Schwelle „keine Dünung“ ohne Periode und Richtung.

#### G-7 · Seewetter · Hvide Sande: Fußzeilen ohne Grundlage
- **Art:** Darstellungsfehler.
- **Beschreibung:** Unter „keine Daten“ steht „Hinweis aus Modellwerten … Werte: DMI HARMONIE“ und „Der Hinweis auf Gewitter reicht bis Mo 01 Uhr“. Die Strömung nennt „Gebiet Deutsche Bucht“ für einen Spot bei 56° N.
- **Beleg:** [B] `/seewetter/hvide-sande`, Kapitel Wetter.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Fußzeilen nur zeigen, wenn es einen Hinweis gibt; Gebiet als „BSH-Modellgebiet“ benennen.

#### G-8 · Seewetter · Kopfzeile und Kapitelreiter am Desktop
- **Art:** Darstellungsfehler.
- **Beleg:** [B] `sea-02-warnemuende-dossier-1440.jpg`: Statuszeile bricht um, Reiter abgeschnitten („Wind und Seegang · Verl…“, „Lage des Spots · Seewet…“).
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Statuszeile kürzen, Reitertexte kürzen.

#### G-9 · Seewetter · Zeitknöpfe mobil
- **Art:** Darstellungsfehler.
- **Beleg:** [B] `sea-05-sylt-card-390.jpg`: „+24 h“ angeschnitten, „+48 h“ nicht sichtbar, kein Zeichen, dass die Leiste rollt.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Kürzere Knöpfe oder ein Verlauf am Rand.

#### G-10 · Seewetter · Seen: Quelle „nime“
- **Art:** Darstellungsfehler.
- **Beleg:** [B] Flüelen: „Messung: nime, Station Altdorf“ (ein Netzkürzel aus den Daten).
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Klarname des Betreibers.

#### G-11 · Seewetter · Schauer und Gewitter: Band und Karte urteilen bis zu einer Stunde verschieden
- **Art:** Logikfehler.
- **Beleg:** [A] `SeaPage.tsx:593` (volle Stunde) gegen `:1523` (Uhrzeit); Probe: Band „Schauer möglich“, Karte „älter als 12 Stunden — keine Daten“.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Beide mit derselben Uhr.

#### G-12 · Seewetter · Sicht-Hinweis „gut“
- **Art:** Formulierung zu sicher.
- **Beschreibung:** Die anderen Klassen heißen „… möglich“. Die eigene Prüfnotiz nennt die Rechnung 1,1 K zu trocken.
- **Beleg:** [B] „Hinweis für So 16 Uhr: gut“. [A] `seaSight.ts:65, 87`.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** „kein Hinweis auf eingeschränkte Sicht“.

#### G-13 · Seewetter · „Wind gegen Strom“: „fast gegeneinander“ ab 121°
- **Art:** Formulierung.
- **Beleg:** [A] `seaCurrent.ts:186, 211–212`.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Wortlaut nach Winkel staffeln.

#### G-14 · Seewetter · „seltener als 1 von 10“ ohne Vorbehalt
- **Art:** Formulierung zu sicher.
- **Beschreibung:** Die Spanne deckt gemessen nur etwa 3 von 4 Fällen statt 8 von 10. Der Satz steht mobil allein in der Leiste.
- **Beleg:** [B] `sea-05-sylt-card-390.jpg`. [A] `windBand.ts:42, 69, 90`.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Vorbehalt am Satz oder Worte „selten / oft“.

#### G-15 · Seewetter · Beaufort 0 und 1
- **Art:** Logikfehler.
- **Beleg:** [A] `seaProfiles.ts:62–63`: 1,0 und 1,4 kn ergeben Bft 0, nach WMO Bft 1.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Erste Grenze auf 0 setzen.

#### G-16 · Seewetter · Küstenbericht ohne Gültigkeitstag
- **Art:** Lücke.
- **Beleg:** [B] „KÜSTENBERICHT · Oestlich Fehmarn bis Ruegen · FQDL51 So 22.11. 14:00 UTC“ ohne „Vorhersage fuer …“. [A] `SeaReadout.tsx:1079`.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Die Tageszeile des Berichts mitzeigen.

#### G-17 · Seewetter · Grenzen-Editor
- **Art:** Logikfehler.
- **Beschreibung:** Ein geleertes Feld speichert 0; keine Prüfung „Wind ab ≤ Wind bis“.
- **Beleg:** [A] `SeaDock.tsx:118–119`. Nicht im Browser nachgestellt.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Leeres Feld nicht speichern; Bereich prüfen.

#### G-18 · Seewetter · Dänische Spots: veraltete Warnmeldung wird still unterdrückt
- **Art:** Lücke.
- **Beleg:** [A] `SeaReadout.tsx:1335–1341`: bei veralteter Meldung „keine“, an deutschen Spots „unbekannt“.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Auch dort „unbekannt“.

#### G-19 · Seewetter · Alter der BSH-Kurve nur im zugeklappten Block
- **Art:** Lücke.
- **Beleg:** [A] `SeaReadout.tsx:596–599, 770–775`; keine Grenze, ab der die Kurve nicht mehr als Vorhersage gilt (Strömung 30 h, DMI 12 h).
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Hinweis neben den Wert; Grenze setzen.

#### G-20 · Seewetter · Texte der Spot-Seiten überholt
- **Art:** Darstellungsfehler.
- **Beleg:** [A] `seaSeoText.ts:78` („Im Reiter „Seegebiet““), `:97, :254` („keine Strömung“, die Seite zeigt sie).
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Texte an den Stand der Seite angleichen.

#### G-21 · Seewetter · Warnmeldung: unveränderlicher Speicher je Ausgabe
- **Art:** Vermutung.
- **Beschreibung:** Schreibt der DWD eine Warnmeldung im selben Zeitfenster unter gleichem Namen neu, sähe die Seite das bis zur nächsten Ausgabe nicht.
- **Beleg:** [A] `scripts/sea/sea-text.mjs:66–68`. Im Archiv (180 Ausgaben) kein Fall gefunden. Bestätigen würde es ein Vergleich der Prüfsumme am Ende eines Fensters.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Prüfsumme der DWD-Datei bei jedem Durchgang vergleichen.

#### G-22 · Seewetter · Seen: Radolfzell zeigt den Pegel Konstanz
- **Art:** Logikfehler im Katalogbau.
- **Beleg:** [A] `scripts/sea/build-lake-spots.mjs:351`: ein WSV-Pegel gewinnt vor jeder BAFU-Station (Radolfzell → Konstanz 17,9 km; Bregenz → Konstanz 45,7 km). Name und Abstand werden gezeigt.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Die nähere Quelle nehmen, am Bodensee das Becken beachten.

#### G-23 · Seewetter · Seen: „Höchste Schätzung“ mischt Obergrenzen mit Schätzungen
- **Art:** Verbesserung.
- **Beleg:** [A] `lakeView.ts:28–32`: eine Stunde ohne Richtung rechnet mit der längsten Strecke. [B] Flüelen: „bis 0,0 m … höchstens, über die längste Strecke von 5,5 km“.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Beides getrennt nennen.

#### G-24 · Seewetter · Seen ohne Daten, wenn der t1-Lauf steht
- **Art:** Vermutung.
- **Beleg:** [A] `sea-lakes.mjs:71–73`, `seaLakes.ts:35` (Seite verwirft nach 12 h). Heute nicht eingetreten (gerechnet 14:12 UTC).
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Fälligkeit zusätzlich nach Alter.

#### G-25 · Planer · Kleinere Punkte (ausgeblendet)
- **Art:** Darstellungsfehler, Formulierung.
- **Beschreibung:** „durchgehend von vorn“, obwohl die Richtung in 3 von 4 Stunden fehlt; „n von m Stunden“ zählt Tabellenspalten; Fensterlänge dreifach verschieden gezählt (3, 4 und 6 Stunden); Vermerk „fremdes Ufer“ prüft die Probenpunkte nicht; „kein Hinweis“, wenn gar kein Wert vorliegt; Strand: hell/dunkel am Mittelpunkt aller Spots; Strand-Liste an Seen „Welle: keine Daten“.
- **Beleg:** [A] `seaTrip.ts:439–446, 469`, `SeaPage.tsx:1388, 1417, 984–988`, `useSeaTrip.ts:195`, `SeaTripPanels.tsx:126, 234, 409`.
- **Schwere · Aufwand:** gering · je klein.
- **Vorschlag:** Vor dem Wiedereinschalten einzeln abarbeiten.

### Gletscher

#### G-26 · Gletscher · Höhen von „Zunge“ und „Oben“ je Karte verschieden
- **Art:** Darstellungsfehler.
- **Beschreibung:** Wettertabelle und Leiter nutzen Bandmitten, der Kopf die Katalogwerte. „Oben“ kann über dem höchsten Punkt, „Zunge“ unter dem tiefsten liegen.
- **Beleg:** [B] Aletsch: Kopf „1.639–4.119 m“, Tabelle „Zunge 1.725 m“, „Oben 4.125 m“. Pasterze: 2.077–3.658 m gegen 2.075 und 3.625 m. Schneeferner: Tabelle „Zunge 2.475 m“, Leiter „2.492 m Zunge“.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Eine Höhenquelle oder „Band um … m“.

#### G-27 · Gletscher · Legende der Karte „Länge zuletzt“
- **Art:** Darstellungsfehler.
- **Beleg:** [B] `gl-01-overview-1440.jpg`: die Stufen „25“, „50“, „≥100“ stehen hell auf hellem Grund und sind kaum lesbar.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Dunkle Schrift unter dem Farbband.

#### G-28 · Gletscher · Startansicht der Karte
- **Art:** Verbesserung.
- **Beleg:** [B] `gl-01-overview-1440.jpg`: 3D ist ab Werk an, der Ausschnitt reicht von den Niederlanden bis Mittelitalien, die Alpen füllen ein schmales Band.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Auf den Alpenbogen rahmen.

#### G-29 · Gletscher · Zahlen- und Textformen
- **Art:** Darstellungsfehler.
- **Beleg:** [B] „1 Jahre ohne Messung“ (Pasterze, Langzeit); „Schneegrenze 2.079 m“ und „2 079 m“ auf derselben Ebene; „Umriss BAdW 2025 2025“ und „Umriss SGI2023 2023“; „CH 2021–2024 · AT 2021–23“; „rund 2.094 Gletscher“ (genaue Zahl mit „rund“).
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Einzahl/Mehrzahl, ein Tausenderzeichen, Jahr nur einmal.

#### G-30 · Gletscher · Seitentitel im Dossier
- **Art:** Lücke.
- **Beleg:** [B] Im Dossier bleibt der Titel „Gletscher DACH — Lage, Schmelze und Messreihen“; das Seewetter nennt den Spot.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Gletschername in den Titel.

#### G-31 · Gletscher · Stationen: Lage und Schreibweise
- **Art:** Verbesserung.
- **Beschreibung:** Der Pasterze ist die Rudolfshütte zugeordnet (3,4 km vom Rand, 699 m tiefer, jenseits des Hauptkamms). Namen in Großbuchstaben. Karten naher Stationen überdecken sich (als V-DKH bekannt).
- **Beleg:** [B] „RUDOLFSHUETTE-ALPINZENTRUM 2.317 m · Niederschlag 0,9 mm in 24 Stunden“; `gl-02-aletsch-wetter-1440.jpg`.
- **Schwere · Aufwand:** gering · mittel.
- **Vorschlag:** Anzeigenamen pflegen; bei Stationen jenseits eines Kamms den Hinweis „anderes Tal“.

#### G-32 · Gletscher · Saison-Diagramm: Achse und Legende
- **Art:** Darstellungsfehler.
- **Beschreibung:** Die Achse endet am 17.10., der Satellit läuft ganzjährig. Die Legende „Szenen 2026“ ist fest verdrahtet.
- **Beleg:** [B] Aletsch: Überschrift „SAISON 2024“, Legende „Szenen 2026“. [A] `GlacierCharts.tsx:17, 47`, `GlacierSheetTabs.tsx:108`.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Achse aus den Szenen ableiten, Jahr in die Legende.

#### G-33 · Gletscher · Nullgradgrenze „0 m“ in Kältephasen
- **Art:** Darstellungsfehler (latent).
- **Beleg:** [A] `melt.mjs:113, 202–209`: gekappt bei 0 m; Probe: Medianhöhe 3 100 m bei −22 °C ergibt 0 m. [D] Im heutigen Lauf kein Wert unter 500 m. [B] Die Achse am Schneeferner beginnt bei 0.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Unter der Talhöhe „unter … m“ zeigen.

#### G-34 · Gletscher · Text „über die Nullgradgrenze umgerechnet“
- **Art:** Formulierung zu sicher.
- **Beleg:** [A] `GlacierWeatherCard.tsx:131`, `melt.mjs:69–74`: bei höchstens +1 °C an der mittleren Höhe gilt immer der Standardgradient. [B] Die Abstände Zunge − Mitte − Oben sind in allen drei Spalten gleich (Pasterze 6,1 und 3,9 K).
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Text nach Fall („mit Standardgradient 0,65 K je 100 m“).

#### G-35 · Gletscher · Falscher Grund bei fehlender Schmelzzeile
- **Art:** Darstellungsfehler.
- **Beleg:** [A] `GlacierBrief.tsx:146` behauptet „kein Nachbar mit Antrieb im Umkreis von 60 km“; die echten Gründe stehen in `doc.skipped`.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Grund aus der Datei lesen.

#### G-36 · Gletscher · Massenbilanz an drei Stellen verschieden, Vorzeichenformat
- **Art:** Darstellungsfehler.
- **Beleg:** [A] Karte „−1,2 m w. e.“, Steckbrief „−1.234 mm w. e.“; `fmtSigned(-1.234, 2)` ergibt „−1,2“, eine Bilanz von −40 mm wird „−0,0 m w. e.“ (`glacierView.ts:23`).
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Eine Funktion und eine Einheit.

#### G-37 · Gletscher · Kleine Punkte aus dem Code
- **Art:** Darstellungsfehler, Lücke.
- **Beschreibung:** Amtliche Länderkarten zeigen bei fehlendem Wert „0,0 m“ mit dem Zeichen „amtlich“; Zähler-Rückfall „rund 2 199 Gletscher“ während des Ladens (Katalog: 2 094); Tooltip „Zunge kürzer als …“ auch bei Vorstoß; SNOWGRID-„Lage 50“ bei 0 cm gegen lauter Nullen.
- **Beleg:** [A] `GlacierReadout.tsx:35–62`, `GlacierPage.tsx:313`, `GlacierCharts.tsx:107`, `glacierSnowContract.ts:256–265`.
- **Schwere · Aufwand:** gering · je klein.
- **Vorschlag:** Bei fehlendem Wert die Zeile weglassen; Zähler aus dem Katalog; Wort nach Vorzeichen; ohne Spanne keine Lage zeigen.

#### G-38 · Gletscher · Texte der statischen Seiten gegen die App
- **Art:** Darstellungsfehler.
- **Beleg:** [A] `scripts/seo/glacierPages.mjs:273, 57`: „alle drei Stunden neu“ (tatsächlich höchstens vier Läufe am Tag); „Fläche … aus Sentinel-2“ (die App nimmt Flächen nur aus Inventaren). [X] Stichprobe Produktion: Pasterze 14,7 km² (2022), −1.582 m seit 1969, wie in der App.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Texte aus den Vertragskonstanten ableiten.

#### G-39 · Gletscher · Konsole: 403 von jsDelivr bei Saisondateien
- **Art:** Verbesserung.
- **Beleg:** [B] Zwei Fehler „403“ für `season/2025/at-granatspitzgruppe/…` und `…/at-glocknergruppe/…`; die Seite lädt weiter (zweiter Host). Als V-FI-5 bekannt.
- **Schwere · Aufwand:** gering · klein.
- **Vorschlag:** Keine Änderung nötig; nur im Blick behalten, weil jeder 403 eine Wartezeit kostet.

---

## Externe Vergleiche

Alle Abrufe am 22.11.2026 zwischen 16:02 und 16:04 UTC. Werte von buscosun aus den Live-Dateien desselben Zeitpunkts.

### Wind an der Küste — buscosun Fusion 14 gegen DWD-Stationsmeldung

Quelle: `https://api.brightsky.dev/current_weather?wmo_station_id=<Kennung>` (10-Minuten-Mittel, Böe der letzten Stunde). Werte in kn.

| Spot | Station (Abstand) | Zeit UTC | Messung Wind / Böe | buscosun Wind (meist) / Böe | Urteil |
|---|---|---|---|---|---|
| Norderney | Norderney (0,7 km) | 15:40 | 16,5 / 22,7 | 13,4 (11,3–15,4) / 19,8 | 3,1 kn zu niedrig, außerhalb der Spanne |
| Helgoland | Helgoland (3 km) | 15:30 | 16,5 / 23,1 | 15,4 (13,2–17,3) / 21,0 | plausibel |
| Cuxhaven-Duhnen | Cuxhaven (5,3 km) | 15:40 | 16,9 / 19,8 | 11,5 (8,2–14,8) / 17,3 | 5,4 kn zu niedrig, außerhalb |
| Sylt List | List (1,2 km) | 15:30 | 11,1 / 18,3 | 13,0 (10,9–15,2) / 19,4 | plausibel |
| Kiel-Schilksee | Kiel-Holtenau (5,2 km) | 15:30 | 8,4 / 13,8 | 9,9 (6,4–13,2) / 18,7 | Wind plausibel, Böe 4,9 kn hoch |
| Fehmarn Grüner Brink | Westermarkelsdorf (6,5 km) | 15:40 | 19,8 / 25,5 | 16,1 (14,0–18,1) / 21,2 | 3,7 kn zu niedrig, außerhalb |
| Warnemünde | Warnemünde (0,2 km) | 15:40 | 20,4 / 23,9 | 16,7 (14,6–18,9) / 22,7 | 3,7 kn zu niedrig, außerhalb |
| Zingst | Barth (12,2 km, im Binnenland) | 15:30 | 9,3 / 17,7 | 22,2 / 23,5 | nicht vergleichbar (Station hinter dem Bodden) |
| Binz | Putbus (9,1 km, im Binnenland) | 15:30 | 6,8 / 12,1 | 9,7 / 15,6 | plausibel (Land gegen Küste) |

### Seegang — CWAM (Spot-Zelle) gegen Open-Meteo Marine

Quelle: `https://marine-api.open-meteo.com/v1/marine?latitude=<lat>&longitude=<lon>&hourly=wave_height,wave_period,wave_direction`, Stunde 16 UTC.

| Spot | buscosun Hs / Periode | Open-Meteo Hs / Periode | Urteil |
|---|---|---|---|
| Helgoland | 1,03 m / 4,6 s | 1,28 m / 5,3 s | plausibel |
| Sylt Westerland | 0,67 m / 4,4 s | 0,96 m / 4,75 s | plausibel (Zelle am Ufer gegen offene Zelle) |
| Norderney | 0,99 m / 5,7 s | 1,10 m / 5,3 s | plausibel |
| Warnemünde | 0,69 m / 3,5 s | 0,70 m / 3,45 s | sehr nah |
| Binz | 0,40 m / 4,1 s | 0,42 m / 2,9 s | Höhe nah, Periode 1,2 s länger |
| Fehmarn Grüner Brink | 0,52 m / 2,9 s | 0,60 m / 3,25 s | plausibel |
| Kiel-Schilksee | 0,31 m / 3,1 s | 0,52 m / 3,2 s | plausibel (Open-Meteo-Zelle liegt weiter draußen) |
| Hvide Sande | 0,77 m / 5,1 s | 0,76 m / 5,2 s | sehr nah |

Die Richtungen weichen ufernah um bis zu 60° ab (Helgoland 24° gegen 354°, Hvide Sande 278° gegen 341°). Das passt zur Brechung am Ufer und zur gröberen Zelle des Vergleichs, ist aber nicht gegen eine Messung geprüft.

### Wasserstand und Wassertemperatur — gegen PEGELONLINE

Quelle: `https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/<Name>/W/currentmeasurement.json` (und `/WT/`).

| Pegel | PEGELONLINE | buscosun | Urteil |
|---|---|---|---|
| Warnemünde W | 581 cm (16:57 MEZ) | 577 cm „gemessen · zur gewählten Stunde“ (16:00) | stimmig, steigend |
| Büsum W | 345 cm (16:57 MEZ) | 347 cm (16:00) | stimmig |
| Büsum WT | 5,7 °C (16:54 MEZ) | 5,7 °C gemessen; Modell DKSS 4,9 °C | Messung gleich; Modell 0,8 K kälter (auf der Seite benannt) |

### Seen — Wind gegen DWD-Stationen

Quelle: `https://api.brightsky.dev/current_weather?lat=<lat>&lon=<lon>`, 15:00–15:40 UTC, Werte in kn. Durchweg Schwachwind.

| Spot | Station (Abstand) | Messung Wind / Böe | buscosun Wind / Böe |
|---|---|---|---|
| Konstanz | Konstanz (5,3 km) | 2,9 / 5,4 | 3,9 / 8,2 |
| Friedrichshafen | Friedrichshafen (0,4 km) | 7,0 / 9,5 | 5,8 / 9,3 |
| Lindau | Lindau (0,6 km) | 2,5 / 5,2 | 5,8 / 8,4 |
| Chieming | Chieming (0,9 km) | 6,4 / 9,5 | 4,9 / 7,4 |
| Waren (Müritz) | Waren (1,7 km) | 3,7 / 9,9 | 5,2 / 11,3 |
| Flüelen | Altdorf (1,7 km, Wert der Seite) | 0 / 1 | 2 / 6 |

Abweichungen bis 3,5 kn, bei so schwachem Wind ohne Aussagekraft. Die Richtungen streuen stark (Lindau 10° gegen 90°).

### Gletscher — Wetter gegen Messung und Open-Meteo

Quellen: Stationswerte der Seite (unten gegengeprüft) und `https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>&elevation=<Höhe>&hourly=temperature_2m,freezing_level_height,precipitation,snowfall,wind_gusts_10m`, Stunde 16 UTC.

| Größe | buscosun | Vergleich | Urteil |
|---|---|---|---|
| Pasterze, Temperatur auf 3.454 m (zwischen Mitte und Oben gerechnet) | −8,1 °C | Kals Adlersruhe gemessen −8,1 °C | sehr nah |
| Aletsch, Temperatur auf 3.571 m (gerechnet) | −9,1 °C | Jungfraujoch gemessen −9,4 °C | sehr nah |
| Schneeferner, Temperatur auf 2.956 m (gerechnet) | etwa −7,3 °C | Zugspitze gemessen −6,1 °C (74 min alt) | plausibel |
| Pasterze, Temperatur Zunge / Mitte / Oben | 0,7 / −5,4 / −9,4 °C | Open-Meteo −1,7 / −7,3 / −11,2 °C | Open-Meteo rund 2 K kälter; die Messung stützt buscosun |
| Aletsch, Temperatur Zunge / Mitte / Oben | 2,8 / −6,4 / −12,8 °C | Open-Meteo 2,1 / −7,9 / −14,2 °C | plausibel |
| Aletsch, Niederschlag 24 h ab Lauf | 31,7 mm (4,8–71,6) | Open-Meteo 30,3–40,8 mm | plausibel |
| Pasterze, Niederschlag 24 h ab Lauf | 3,7 mm (0–7,8) | Open-Meteo 0,8–1,8 mm | plausibel |
| Stärkste Böe 24 h, Pasterze / Aletsch | 62 / 80 km/h | Open-Meteo 91–106 / 82–110 km/h; gemessen zur Stunde 45 / 61 km/h | plausibel, buscosun niedriger als das Vergleichsmodell |
| Schneefallgrenze, Pasterze / Aletsch (16 UTC) | 1 150–1 290 m / 1 510–1 580 m, nachts bis 10 m | Open-Meteo Nullgradgrenze 2 180–2 560 m / 2 380–2 750 m | **echter Fehler wahrscheinlich, siehe K-2** |

### Gletscher — Stationswerte und Schneeanalyse gegen die Quelle

| Wert | buscosun (Slot 15:30 UTC) | Quelle | Urteil |
|---|---|---|---|
| Sonnblick (11343), 15:40 UTC | −7,3 °C, 6,7 m/s aus 253°, Böe 8,6 m/s, Schnee 37 cm | GeoSphere TAWES `https://dataset.api.hub.geosphere.at/v1/station/historical/tawes-v1-10min?…&station_ids=11343`: TL −7,3, FF 6,7, DD 253, FFX 8,6, SCHNEE 37 | identisch |
| Rudolfshütte (11138), 15:40 UTC | −4,8 °C, 0,5 m/s, Böe 1,4 m/s | GeoSphere TAWES: TL −4,8, FF 0,5, FFX 1,4 | identisch |
| IMIS EGH2 | −3,9 °C, Schnee 66,9 cm (15:30) | SLF `https://measurement-api.slf.ch/public/api/imis/station/EGH2/measurements`, 15:00: TA −4,2, HS 66,7 | stimmig (eine halbe Stunde Abstand) |
| IMIS GOR2 | −4,8 °C, Schnee 59,3 cm (15:30) | SLF, 15:00: TA −4,6, HS 59,7 | stimmig |
| SNOWGRID Pasterze, 21.11. | 61 cm, 120 mm (Mittel aus 13 Zellen) | GeoSphere `https://dataset.api.hub.geosphere.at/v1/timeseries/historical/snowgrid_cl-v2-1d-1km?…&lat_lon=47.101,12.693`: 0,32 m, 62 kg/m² (eine Zelle am Katalogpunkt) | Einheiten richtig umgerechnet; der Unterschied ist Zelle gegen Flächenmittel |

---

## Geprüft und in Ordnung

- **Umrechnungen:** m/s in kn, km/h und Bft (bis auf G-15), cm/s in kn, m in cm, kg/m² in mm; Bezugshöhen am Pegel (Warnemünde 577 cm über Pegelnull = 79 cm über NHN, Spanne zu 81 % gefüllt: nachgerechnet).
- **Richtungen:** Wind „aus“, Strom „nach“, Lage zum Ufer (Büsum: Wind aus Nord, Ufer nach Südwest, „ablandig“; Warnemünde „auflandig“).
- **Trockene Zellen im Watt:** „∅ kein Seegang“ in den Trockenstunden, „0,0 m“ nur bei nasser Zelle; Strömung „–“ hinter dem Ende des BSH-Laufs.
- **Amtliche Texte:** Seewetterbericht, Küstenbericht und Mittelfrist stehen wörtlich; die Wasserstands-Kategorie ist als wörtlich gekennzeichnet; „buscosun warnt nicht“ steht an der Pegelkarte.
- **Haftungshinweis Seewetter:** in der Kartenkarte und am Ende jedes Dossier-Kapitels („Kein amtliches Warnprodukt … kein Ersatz für die Navigation“).
- **Seen:** Windwelle überall als „geschätzt“ gekennzeichnet; Messung und Modell der Wassertemperatur getrennt; „Kein amtlicher Warnstatus im Datenbestand … Das heißt nicht, dass es keine Warnung gibt“. Wellenformel gegen die Beispiele des Handbuchs nachgerechnet (Lesedurchgang).
- **Gletscher:** Höhenänderung nach Hugonnet in sich stimmig (Pasterze −31,3 m in 20 Jahren = −1,6 m je Jahr, Volumen und Masse passen zur Fläche und Dichte); Schneeanalyse nie als Messung gekennzeichnet, außerhalb Österreichs ein Satz; Spannen je Tag, nie über Tage addiert; „Kein Urteil über Begehbarkeit“ im Tour-Block; Schmelzindex ohne Einheit mit dem Grund.
- **Layout:** kein waagerechtes Rollen der Seite bei 390 px in beiden Features; Konsole im Seewetter ohne Fehler.
