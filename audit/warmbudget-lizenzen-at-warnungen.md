# audit/warmbudget-lizenzen-at-warnungen.md — Phase P1 (V-80 + V-104 + V-24)

> Stand: 2026-08-03. Auftrag: `improvements.md` V-80 (Warm-Budget), V-104 (`/lizenzen`), V-24 (AT-Warnungen).
> **Ergebnis vorab:** V-80 und V-104 sind umgesetzt. **V-24 ist an einem belegten Datenmangel gestoppt** — Details in §3. Das ist kein Umsetzungsproblem, sondern eine Entscheidung, die Jan treffen muss.

---

## 1 · V-80 — Warm-Budget an die sichtbaren Layer koppeln

### 1.1 Befund bestätigt

`scripts/warm-grib.mjs` wärmte die vier **Wolken-Params** (`clcl/clcm/clch/clct`), obwohl der Wolken-Toggle seit dem 2026-07-23 auskommentiert ist (`MapView.tsx:4049`, Jans Vorgabe). Gleichzeitig fehlten **vier sichtbare Layer** komplett: Gewitter (F1), Blitz-Prognose (F2), Schnee (F4) und Rotation (F5). Sie fielen auf den Directory-Scan zurück (`iconD2Precip.ts:112-116`) und luden **immer kalt** — ausgerechnet das, was Nutzer in Unwetterlagen und im Winter anschalten.

### 1.2 Umsetzung

`PARAMS` in zwei benannte Blöcke geteilt: `BASE_PARAMS` (t_2m, vmax_10m, tot_prec) und `FEATURE_PARAMS` (11 Params der vier Feature-Layer). Die Step-Caps sind **nicht geschätzt**, sondern das `MAX_STEP` des jeweiligen Quellmoduls — und ein Verifier prüft genau das (s. §1.4).

Wolken-Params entfernt, mit Rückholhinweis im Kommentar. **Der EPS-Baum wärmt `clct` weiterhin** — kein Widerspruch: die Fusions-Engine braucht Bewölkung unabhängig vom Karten-Toggle.

Step 0 wird auch für die Params gewärmt, deren Layer ihn per `minStepHours=1` überspringt (lpi_max, uh_*, snow_gsp). Am 2026-08-03 an DWD geprüft: **alle elf Params liefern Step 0**. Das Auslassen spräche gegen die Lückenlosigkeit, die der Betriebs-Wächter (V-79, H5) prüft, und spart nur ~2,8 MB/Lauf (≈ 3 %) — den Sonderfall nicht wert.

`WARM_FEATURE_LAYERS=0` nimmt den neuen Teil ohne Code-Änderung zurück.

### 1.3 🔴 Die Kostenaussage des Katalogs stimmt so nicht

V-80 stellt in Aussicht: „Nebeneffekt: rund 12 GB Datenverkehr im Monat, die aktuell für einen unsichtbaren Layer aufgewendet werden, werden frei." Das ist für sich genommen richtig — **wird aber vom Zuwachs deutlich übertroffen.**

Am 2026-08-03 an **echten DWD-Dateigrößen** gemessen (HEAD auf Lauf 2026080321), nicht geschätzt:

| | MB je Lauf |
|---|---|
| entfernt (4 Wolken-Params × 13 Steps) | **−25,4** |
| neu (11 Feature-Params) | **+90,8** |
| **netto** | **+65,4** |

Bei ~8 Läufen/Tag: **+0,5 GB/Tag ≈ +15 GB/Monat.**

Treiber sind vier Params: `cape_ml` 25,2 · `cin_ml` 23,3 · `sdi_2` 17,7 · `snow_gsp` 17,3 MB je Lauf.

**Bewertung:** Der Zweck von V-80 („die vier Layer, die Nutzer in Unwetterlagen anschalten, sind heute die langsamsten der App") wird erfüllt. Der Nebeneffekt „wird billiger" wird **nicht** erfüllt — es wird teurer. Wer das Volumen drücken will, ist bei **V-84** (Delta wärmen statt jedem Mal den ganzen Lauf) richtig, nicht beim Weglassen sichtbarer Layer. **V-85** (Netlify-Usage einmal ablesen) sollte vor dem Prod-Dispatch stehen — Risiko R6.

### 1.4 Drift-Wächter statt Zweitliste

Der eigentliche Fehler hinter V-80 war ein **Drift**-Fehler: Toggle und Warm-Liste liefen monatelang auseinander, ohne dass es jemandem auffiel. Neuer `npm run verify:warm-budget` liest **beide Seiten aus dem echten Code** — aktive Layer aus `DECK_GROUPS` (auskommentierte Zeilen zählen ausdrücklich nicht), Params aus `warm-grib.mjs`, Caps aus dem jeweiligen `MAX_STEP`. **30/30 PASS.**

**Red-Test:** `clcl` testweise wieder in die Warm-Liste ⇒ `FAIL ausgeblendeter Layer 'clouds' wird NICHT gewärmt (noch in der Warm-Liste: clcl)`, Exit **1**; zurückgebaut ⇒ 30/30.

---

## 2 · V-104 — `/lizenzen/`

### 2.1 Umsetzung

Statische Generator-Seite über die bestehende Rechtsseiten-Hülle (`renderLegalPage`). Die **Modelltabelle wird beim Build aus `src/fusion/modelCatalog.ts` gelesen** — derselben Datei, aus der die App ihre Modellauswahl speist. **24 Modelle** mit Betreiber, Lizenz und Nennungstext, alle vier Felder je Eintrag vollständig.

Warum nicht abgetippt: eine Zweitliste würde driften — genau der Fehler, den V-80 aufgedeckt hat. Findet der Parser weniger als 15 Einträge, **bricht der Build ab**, statt eine unvollständige Quellenliste auszuliefern.

Ergänzt um die Nicht-Modell-Quellen in drei Gruppen (Karten & Geodaten · Messnetze, Radar & Satellit · Schriften & Software), jede mit Betreiber, Lizenz, Pflichttext und **Belegstelle im Code**.

Weitere Bestandteile:
- **JSON-LD `CreativeWork`** mit `license` und `sourceOrganization` (DWD, GeoSphere, MeteoSchweiz, ECMWF, OSM) — `renderLegalPage` nimmt dafür ein optionales `extraJsonLd`.
- **Verlinkt** aus dem Fuß aller statischen Seiten, dem App-Footer (`SearchPage.tsx`) und der Modellbibliothek (`ModelLibraryOverlay`, „Alle Quellen & Lizenzen").
- **`llms.txt`** um einen Abschnitt „Quellen & Lizenzen" ergänzt — inkl. des Hinweises, dass buscosun die Daten **verändert**.
- **Indexierbar** (kein `noindex`), in `sitemap.xml` (153 URLs, vorher 152).

### 2.2 Ehrlichkeit statt Beschönigung

Zwei Punkte stehen bewusst so auf der Seite:

- **Esri** ist als **🔴 „in Klärung"** ausgewiesen, mit dem Hinweis auf die offene Nutzungsberechtigung (V-106). Eine Lizenzseite, die eine ungeklärte Nutzung als geklärt darstellt, wäre schlimmer als keine.
- Ein eigener Abschnitt **„Was buscosun daraus macht"** benennt Höhenkorrektur, Fusion, Nowcast und eigene Farbskalen — und schließt mit: „Fehler in der Darstellung sind deshalb *unsere* Fehler, nicht die der Wetterdienste." Genau das erwartet der DWD bei veränderter Nutzung.

### 2.3 Belegt

`npm run build` grün · `npm run verify:seo` **63 Checks, 0 Fehler** · Seite gerendert geprüft (Playwright-MCP, `vite preview`): canonical `/lizenzen/`, kein `noindex`, `CreativeWork`-JSON-LD mit `sourceOrganization`, **24 Modellzeilen**, DWD genannt, GeoSphere-Wortlaut wörtlich, Esri als offen markiert, OpenFreeMap-Pflichttext vorhanden. Screenshot: `audit/screenshots/lizenzen/desktop-1440-lizenzen.png`.

---

## 3 · V-24 — AT-Warnungen: 🔴 GESTOPPT an einem Datenmangel

### 3.1 Was funktioniert

Die GeoSphere-Warnschnittstelle ist erreichbar und liefert brauchbare Daten:

```
GET https://warnungen.zamg.at/wsapp/api/getWarnstatus?lang=de
→ 200 · application/json · 303 KB · FeatureCollection, 10 aktive Warnungen
→ Access-Control-Allow-Origin: *
```

**Zwei gute Nachrichten:**
1. **CORS ist offen (`*`)** — es braucht **keinen** Edge-Proxy und keine `netlify.toml`-Änderung. Damit entfällt der STOPP-&-FRAGEN-Punkt „V-24 (CORS-Rewrite)" aus `masterplan.md` §7 ersatzlos.
2. Die Geometrien sind Gemeinde-Polygone in **EPSG:31287** (Austria Lambert; Koordinatenbereich X 112.553–685.409, Y 275.487–570.407 passt exakt). Die Projektion ist handschreibbar (~40 Zeilen, D-06-konform).

### 3.2 Was fehlt — und warum das blockiert

Die vollständige Property-Liste **jeder** Warnung lautet:

```
warnid, wtype, wlevel, start, end, gemeinden
```

Beispiel: `{ "warnid": "w10c202608030v21", "wtype": 6, "wlevel": 1, "start": "1785794400", "end": "1785880740" }`

**Es gibt keinerlei Text.** Kein Titel, keine Beschreibung, keine Handlungsempfehlung. `wtype` ist eine nackte Zahl, und es gibt **keine abrufbare Legende**: geprüft und mit 404 beantwortet wurden `getWarntypes`, `getTypes`, `getLegend`, `getConfig`, `getMetadata`, `getWarnTypeList`, `getInfo`, `getWarnDetail`, `getWarntext`, `getWarning`, `getCap`, `getWarnstatusCap`, `getWarningGeoJson`, `getGemeinden`.

Beobachtet wurden am 2026-08-03 die Kombinationen `wtype/wlevel`: **6/1, 5/1, 6/2, 6/3**.

**Warum ich hier aufhöre statt weiterzubauen:** Aus „wtype 6 im August" ließe sich „Hitze" erraten und aus „5" „Gewitter". Das wäre eine **erfundene Bezeichnung im sicherheitskritischsten Feature der App**. Eine falsch beschriftete Unwetterwarnung ist schädlicher als gar keine — und es wäre derselbe Fehler wie die erfundenen „78 % Trefferquote" (V-18), nur mit ungleich höherem Schaden. `CLAUDE.md` verlangt an dieser Stelle ausdrücklich Ehrlichkeit statt Kaschieren; „Warnung Typ 6, Stufe 1" anzuzeigen wäre zwar ehrlich, aber für Nutzer wertlos.

### 3.3 Drei Wege — Jans Entscheidung

| Weg | Was zu tun ist | Bewertung |
|---|---|---|
| **(a)** Offizielle `wtype`-Legende beschaffen | GeoSphere Austria anschreiben bzw. Doku des Data Hub prüfen; die Zuordnung dann als benannte Konstante mit Quellenangabe hinterlegen | **Empfohlen.** Danach ist V-24 in wenigen Stunden fertig — Projektion, Punkt-in-Polygon und UI sind gerade Fleißarbeit |
| **(b)** Anderen amtlichen Kanal nutzen | Prüfen, ob GeoSphere/EUMETNET einen **CAP**-Feed für Österreich anbietet (CAP trägt Klartext-Titel und -Beschreibung) | Sauberste Lösung, falls es ihn gibt — CAP ist der Standard, den auch V-22 mittelfristig braucht |
| **(c)** Ohne Typ ausliefern | Nur „amtliche Warnung Stufe 1–3, gültig bis HH:MM" + Deep-Link zu `warnungen.zamg.at` | Sofort machbar und ehrlich, aber schwacher Nutzen. Als Zwischenschritt vertretbar |

Als **V-133** registriert. Der Vorbau (CORS geklärt, CRS bestimmt, Datenmodell dokumentiert) ist damit gesichert und muss nicht erneut erarbeitet werden.

---

## 4 · Ergebnis (Gate GP1, 2026-08-03)

| Prüfung | Ergebnis |
|---|---|
| `npm run verify:warm-budget` | **30/30 PASS**, netzfrei; Red-Test Exit 1 → 0 |
| `npm run verify:seo` | **63 Checks, 0 Fehler** |
| `/lizenzen/` gerendert | 24 Modellzeilen, JSON-LD, alle Pflichttexte, indexierbar |
| `npm run typecheck` | grün |
| `npm run build` | grün, sitemap 153 URLs |
| V-24 | 🔴 gestoppt, Diagnose vollständig, als V-133 registriert |

### Die fünf Selbstverifikations-Fragen

1. **Funktionserhalt.** Kein Layer, kein Bedienelement entfernt. Der Wolken-**Layer** bleibt funktionsfähig — nur sein *Warmen* entfällt, solange sein Toggle ausgeblendet ist; der EPS-Pfad für die Fusion ist unberührt. `/lizenzen/` und die drei Links sind rein additiv.
2. **Desktop pixelgleich.** Zwei sichtbare Zusätze, beide beabsichtigt: der Fußzeilen-Link auf der Startseite und „Alle Quellen & Lizenzen" im Fuß der Modellbibliothek. Sonst keine Layout-Änderung; `/lizenzen/` ist eine neue Seite.
3. **Touch-Targets.** Die neuen Elemente sind Textlinks in Fußzeilen — sie folgen der dort bestehenden Typografie; eine eigene Touch-Zielgröße wurde **nicht** erzwungen, um die Fußzeilen nicht umzubrechen. Gehört zu V-64/V-70 (A11y-Programm).
4. **Konsole sauber.** `/lizenzen/` ist eine statische Seite ohne JS.
5. **Long Tasks.** Kein neuer Rechenpfad im Client. Build-seitig kostet das Parsen des Modellkatalogs Millisekunden.

### 🔴 Offen an Jan

- **V-80 kostet ~15 GB/Monat mehr, nicht weniger** (§1.3). **Prod-Dispatch ist dein Gate** — bitte vorher V-85 (Netlify-Usage ablesen), Risiko R6. Rücknahme jederzeit per `WARM_FEATURE_LAYERS=0`.
- **V-24 braucht eine Entscheidung** zwischen (a), (b) und (c) — §3.3.
- **`/lizenzen/` inhaltlich gegenlesen**, besonders die Esri-Zeile (hängt an V-106) und die Open-Meteo-Zeile (hängt an D-18/V-28).
