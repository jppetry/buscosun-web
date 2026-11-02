# Waldbrand-SEO (Phase WBS): Sichtbarkeit bei Waldbrand-Suchen in Google, Bing und KI-Suche

> Auftrag Jan, 02.11.2026: buscosun mit dem Waldbrand-Feature bei Google und Bing so gut wie möglich ranken lassen, wenn jemand
> etwas zum Thema Waldbrand sucht; erst tiefe Recherche, dann direkt auf `main` umsetzen. Die Recherche lief als Claude-Research-Bericht
> im Chat („Waldbrand-SEO für buscosun.com: Umsetzungsplan für Google, Bing und KI-Suche"); ihre Kernaussagen stehen in §2.
>
> Umgesetzt in einer Cloud-Sitzung ohne Shell auf Jans Rechner: Die Dateien liegen im Arbeitsbaum von `C:\dev\buscosun-web`
> (Zweig `main`), **nicht committet**. Commit und Push sind Jans Schritt (§6). Parallel liefen im selben Arbeitsbaum die Linien
> GLS (Gletscher-SEO) und FX-UI (buscosun-Fusion-Erklärseite); geteilte Dateien sind nur an eng umrissenen Stellen ergänzt (§4.3).

## 1. Diagnose (Stand `fa33869` + Arbeitsbaum, 02.11.2026)

| Punkt | Befund |
|---|---|
| `/waldbrand` ohne JavaScript | 272 Wörter. `routeTexts.ts` hat für `/waldbrand` **keinen** Absatz und **keine** Fakten (`body: []`). Title „Waldbrandgefahr DACH — Brandradar": weder „aktuell" noch „Karte", die zwei häufigsten Zusätze bei Ereignis- und Lagesuchen. |
| Regionale Suchen | Für „Waldbrandgefahr Brandenburg", „… Tirol", „… Wallis" gibt es keine Zielseite. Die Wetter-Regionsseiten `/wetter/<land>/<region>/` sagen nichts zu Feuer. |
| Datenlage ohne Netz | `public/fire/bh/index-season-v1.json` (Saison 2026, ausgewertet 31.10.2026): 7 200 DACH-Ereignisse, davon 1 639 auf Anlagenstandorten; 271 Ereignisse mit EFFIS-Kartierung. `season-series-v1.json`: Saisonsummen 2020–2026 je Land. Beides liegt im Repo und ist beim Build ohne Netz lesbar. |
| Was die Ereignisse sind | 3 625 der 5 561 Ereignisse außerhalb von Anlagen bestehen aus **einer** Detektion. Die Zahl liegt weit über der amtlichen Waldbrandstatistik (BLE 2025: 1 175 Waldbrände in DE) — sie enthält Feld-, Gras- und Kleinfeuer. „Waldbrände" wäre als Überschrift falsch; „Brandereignisse aus Satellitendaten" ist richtig, „kartierte Brandfläche" nur mit EFFIS-Beleg. |
| Amtliche Stufen | Der Layer „Amtliche Stufe" (DWD-WBI, BAFU) ist auf Jans Entscheidung vom 19.08. zurückgezogen. Seiten zeigen keine amtliche Stufe, sie verlinken die zuständige Stelle. |
| Ladezeit `/waldbrand` | Lokal LCP 10–11 s, TBT 7–9 s; PageSpeed live ohne Ergebnis (`seo-nischen.md` §7, V-SN-9). Hier nicht angefasst: Eingriff in die Kartenladung (V-SN-3). |
| Standardsicht | `/waldbrand` zeigt die Saison-Voreinstellung, Title und H1 sprechen von Gefahr (V-SN-5, offen). |
| Impressum | `scripts/seo/legal.mjs` trägt TODO-Platzhalter für Name und Anschrift — für ein Sicherheitsthema ein Vertrauens- und ein Rechtsthema. |
| Schon vorhanden | robots.txt lässt OAI-SearchBot, PerplexityBot, Bingbot, Googlebot zu; IndexNow-Schlüssel und `scripts/seo/indexnow.mjs`; Sitemap-Index mit git-`lastmod`; `buscosun.de` → 301 auf `.com`; kein hreflang (eine URL je Seite); echte 404. |
| FIRMS | Laut FIRMS endet die Lieferung von Suomi-NPP am 02.11.2026. `FIRMS_SOURCES` (`src/fire/sources/firmsHotspots.ts`) enthält `VIIRS_SNPP_NRT`. Kein SEO-Thema, aber Datenpfad (V-WBS-1). |

## 2. Recherche: Kernaussagen

1. **Crawlbares HTML schlägt alles andere.** Google empfiehlt Server- oder Vorab-Rendering, weil nicht alle Bots JavaScript ausführen; Bing hat
   die Rendering-Hilfe aus den Richtlinien vom Februar 2026 gestrichen und warnt, nicht zuverlässig renderbarer Inhalt werde womöglich weder
   indexiert noch für Copilot-Antworten gewählt. Die Karte rankt nicht, der Text drumherum schon.
2. **Regionale Lageseiten sind die realistischste Chance**, aber nur mit eigenen Daten je Region (Googles Regeln zu „scaled content abuse"
   und „doorway abuse"). Keine Landkreis-Seiten mit austauschbarem Text.
3. **Ehrlichkeit ist ein Rankingvorteil bei YMYL:** EU-FWI nie „Waldbrandgefahrenstufe" nennen, amtliche Stellen verlinken, Notrufnummern
   nennen, Lizenzangaben korrekt (Copernicus CEMS CC BY 4.0, NASA FIRMS mit LANCE-Hinweis).
4. **KI-Suche:** keine Sondertricks. Google nutzt `llms.txt` nicht; FAQ-Rich-Results sind seit 07.05.2026 abgeschaltet, SpecialAnnouncement
   ausgemustert, Dataset wirkt nur in Dataset Search. OAI-SearchBot muss erlaubt sein (ist es). Zitierbare Lagesätze oben, Tabellen,
   Zeitstempel und Quellenzeilen helfen allen Systemen.
5. **Bing:** IndexNow bei jeder Änderung (nur geänderte URLs), Bing Webmaster Tools mit Sitemap, kein NOARCHIVE/NOCACHE.
6. **Wettbewerb:** DE dicht besetzt (DWD, Länderportale, waldbrandkarte.de, waldbrandgefahrenstufe.de, fire-map.de, Medienkarten). AT und
   CH weniger umkämpft und föderal zersplittert. Alleinstellung von buscosun: DACH-weit, FWI bis +9 Tage, Satelliten-Historie,
   Trennung Vegetationsbrand/Anlage.

## 3. Entscheidungen dieser Phase

| # | Entscheidung | Grund |
|---|---|---|
| D1 | Regionsseiten unter **`/waldbrandgefahr/<land>/<region>/`** statt `/waldbrand/<land>/<region>` | `/waldbrand/*` gehört dem App-Router (`subParam: 'view'`, unbekannter Slug = 404) und dem Rewrite auf `waldbrand.html`; ein Ordner `dist/waldbrand/` neben der flachen Shell `waldbrand.html` würde „Pretty URLs" auf den End-Slash umleiten lassen. Der Pfad trägt zudem genau das Suchwort („Waldbrandgefahr Brandenburg"). Statische Ordnerseiten wie `/wetter/…`, keine neue Netlify-Regel. |
| D2 | Eine Regionsseite nur ab **5 Brandereignissen oder einer EFFIS-Kartierung** in der Saison | Darunter wäre die Seite Text ohne eigene Daten. Kleinere Regionen stehen in der Tabelle der Länderseite, ohne eigene Adresse. |
| D3 | Zuordnung Ereignis → Bundesland/Kanton über **Natural Earth Admin-1 (10 m, gemeinfrei)**, nur innerhalb des Landes, das der Index nennt | Keine Grenzdaten im Repo; Natural Earth ist gemeinfrei. Grenzgenauigkeit im Kilometerbereich, als Grenze auf der Seite genannt. |
| D4 | Begriffe: „Brandereignisse aus Satellitendaten" (ohne Anlagen), „von EFFIS kartierte Brandflächen" (bestätigt mit Quelle), „Feuerwettergefahr (EU-Index)" | §1 Zeile „Was die Ereignisse sind"; Repo-Lehre 4 („bestätigt" nur mit Quelle im selben Satz). |
| D5 | **Live-Bild des EU-Feuerwetterindex** auf jeder Seite: GWIS-WMS `GetMap` für den Ausschnitt der Region, Tag per kleinem Inline-Skript (heute … +8), Legende aus `GetLegendGraphic` | Beantwortet „Waldbrandgefahr ‹Region› heute" ohne die Karte zu laden: ein Bild, kein Framework. Gleiche Quelle und gleiche Lizenz wie der Layer im Brandradar; kein Wert wird abgeleitet. |
| D6 | Keine amtliche Stufe auf den Seiten, nur Verweise; konkrete Landesangaben nur, wo belegt (Brandenburg, Mecklenburg-Vorpommern, Sachsen, Graubünden) | Rückzug „Amtliche Stufe" (19.08.); Ehrlichkeitsregel. Alle übrigen Regionen bekommen die belegte Regel ihres Landes. |
| D7 | Keine Edge Function, kein Datenabruf beim Build, kein FAQ-/Dataset-/SpecialAnnouncement-Markup | STOPP-Regel für Edge Functions; Build bleibt netzfrei; die Recherche (§2.4) nennt die Markups als wirkungslos oder ausgemustert. |
| D8 | `/waldbrand`: Title mit „Waldbrand aktuell" und „Karte", Absätze und Fakten in `routeTexts.ts`, Links auf die neuen Seiten | §1 Zeile 1. Die Standardsicht (V-SN-5) bleibt Jans Entscheidung. |

## 4. Umsetzung

### 4.1 Neue Seiten: `/waldbrandgefahr/` (37 Seiten, Stand Saison-Index 31.10.2026)

| Seite | Inhalt |
|---|---|
| `/waldbrandgefahr/` | Übersicht DE · AT · CH: Feuerwetter-Bild über DACH, je Land wer zuständig ist und eine Tabelle aller 51 Regionen, Saisons seit 2020, Zählregel |
| `/waldbrandgefahr/<land>/` (3) | was amtlich gilt (mit den belegten Landesangaben), Feuerwetter-Bild, Regionen mit eigener Seite, Saisonbilanz, Vergleichstabelle aller Regionen, Saisons seit 2020 |
| `/waldbrandgefahr/<land>/<region>/` (33) | Lead als zitierbarer Lagesatz, Feuerwetter-Bild der Region (Index und Perzentil, heute … +8), zuständige Stelle, Saisonbilanz (Monate, EFFIS-Flächen, Ereignisse mit den meisten Detektionen, Schwerpunkte nach Kreis/Bezirk), Fragen, Nachbarregionen |

Ohne eigene Seite (D2): Bremen, Vorarlberg und 16 Kantone (Appenzell AR/IR, Basel-Landschaft, Basel-Stadt, Freiburg, Glarus, Jura,
Luzern, Neuenburg, Nidwalden, Obwalden, Schaffhausen, Schwyz, Solothurn, Uri, Zug) — sie stehen in den Tabellen.

Jede Seite: genau eine H1, eigener Title/Description/Lead, Canonical mit End-Slash, Hinweis „Keine amtliche Warnung" mit Notrufen,
JSON-LD `WebPage`/`CollectionPage` + `BreadcrumbList` (`about` mit Wikidata-Kennung des Landes/Kantons), Quellen- und Lizenzzeile,
FIRMS-Hinweis „nicht für taktische Entscheidungen". Seitengröße 26–46 KB (Umrisse als SVG, Ganzzahl-Pfade).

### 4.2 Dateien

| Datei | Art | Zweck |
|---|---|---|
| `scripts/seo/build-dach-admin1.mjs` | neu | baut die Grenzdatei aus Natural Earth (Aufruf und Quelle im Kopf) |
| `scripts/seo/data/dach-admin1.json` | neu | 51 Regionen, 10 990 Punkte, 196 KB, nur beim Build gelesen |
| `scripts/seo/fireRegions.mjs` | neu | Zuordnung Ereignis → Region, Kennzahlen, amtliche Stellen, Links; lädt erst beim ersten Zugriff |
| `scripts/seo/fireRegionPages.mjs` | neu | Renderer der 37 Seiten, Feuerwetter-Bild + Inline-Skript (ES5), `llms.txt`-Abschnitt |
| `scripts/seo/verifyFireRegions.mjs` | neu | Prüfungen (§5), von `verify-seo.mjs` aufgerufen |
| `scripts/generate-seo.mjs` | ergänzt | Seiten schreiben, `sitemap-waldbrand.xml` im Index, `llms.txt`, Konsolenzeile |
| `scripts/seo/verify-seo.mjs` | ergänzt | ruft `verifyFireRegions` |
| `scripts/seo/llms.mjs` | ergänzt | Parameter `fireRegions` hinter dem Brandradar-Eintrag |
| `scripts/seo/content.mjs` | ergänzt | Ortsseiten verlinken „Waldbrandgefahr in ‹Bundesland/Kanton›" |
| `scripts/seo/regionPages.mjs` | ergänzt | Wetter-Regions- und Länderseiten verlinken die Waldbrand-Seite |
| `scripts/seo/tools.mjs` | korrigiert | `/funktionen/waldbrandgefahr/` behauptete noch DWD-/BAFU-Stufen auf der Karte (seit 19.08. zurückgezogen) und „ohne Schlüssel" (FIRMS braucht einen) |
| `scripts/seo/explainers-extra.mjs` | ergänzt | `/wissen/waldbrandwarnstufen-de-at-ch/` verlinkt die neuen Seiten |
| `src/router/routes.ts` | geändert | `/waldbrand`: Title „Waldbrand aktuell: Karte, Gefahr & aktive Brände in DE, AT, CH", neue Description/H1/Lead; Texte zusammen **kürzer** als vorher (729 statt 763 Zeichen im eager Bundle) |
| `src/seo/routeTexts.ts` | geändert | `/waldbrand`: drei Absätze, vier Fakten, Links auf Übersicht und Länder (lazy Text-Chunk, roh +2,3 KB) |
| `public/robots.txt` | ergänzt | `Sitemap: …/sitemap-waldbrand.xml` |

### 4.3 Zusammenarbeit mit GLS und FX-UI

Die geteilten Dateien (`generate-seo.mjs`, `verify-seo.mjs`, `llms.mjs`, `content.mjs`, `routes.ts`, `routeTexts.ts`, `robots.txt`,
`CLAUDE.md`, `MANUELLE-SCHRITTE.md`) sind nur an Ankern ergänzt, die in beiden Ständen vorkommen; die Änderungen der parallelen Linien
bleiben unberührt. Unmittelbar vor dem Schreiben wurde jede Datei frisch vom Rechner gelesen und das Schreiben an deren Änderungszeit
gebunden — eine zwischenzeitliche Änderung der anderen Sitzung hätte das Schreiben abgelehnt statt sie zu überschreiben.

## 5. Verifikation

In der Cloud-Sitzung ohne npm-Registry: kein `tsc`, kein `vite build`, kein `budget`, kein `verify:share` (braucht `esbuild`). Geprüft
wurde mit dem Arbeitsbaum des Rechners (Stand 21:40, inkl. der uncommitteten Dateien der Linien GLS, FX-UI und SA) auf einem öffentlichen
Klon von `fa33869`:

| Prüfung | Ergebnis |
|---|---|
| `generate-seo.mjs` | läuft, 37 Waldbrand-Regionsseiten, Sitemap-Index mit `sitemap-waldbrand.xml` |
| `verify-seo.mjs` | **1 282 ok, 0 Fehler** (mit dem Stand der parallelen Linien; um 21:17 war noch ein GLS-Punkt in `robots.txt` rot, nicht von WBS) |
| davon WBS (`verifyFireRegions`) | 15 Prüfungen grün, u. a.: 37 Seiten, keine Seite unter der Schwelle, keine unerwarteten; je Seite H1/Title/Description/Lead/Canonical, Hinweis + Notruf, Sprachregel **mit Gegenprobe**, FWI-Bild mit Lizenz, Breadcrumb, keine toten Ordner-Links (fand vier tote Links auf nicht existierende Wetter-Regionsseiten — behoben); Mindesttext; Summen je Land; Sitemap ohne Doppelung; robots; llms; `/waldbrand`-Shell 551 Wörter ohne JavaScript (vorher 272); Ortsseite Potsdam → Brandenburg, Gegenprobe Bremen |
| `verify-routing.mjs` | 265/274 — die 9 roten sind Vorlade-Prüfungen (E-DB-20), die einen echten `vite build` brauchen; auf dem Stand ohne WBS dieselben 9 |
| Browser (Chromium headless, 1440 × 900 und 390 × 844) | kein horizontaler Überlauf, Bedienknöpfe 44 px hoch, keine JS-Fehler; Tag- und Ansichtswahl setzen `TIME`/`LAYERS` richtig. Das GWIS-Bild selbst lädt in der Sandbox nicht (Proxy sperrt den Dienst) — die Seite zeigt dann den Fehlerhinweis statt einer leeren Fläche |
| IndexNow (trocken) | `node scripts/seo/indexnow.mjs --dry --match=waldbrand` → 46 URLs |

**Nicht belegt:** `npm run typecheck`, `npm run build`, `npm run budget`, `verify:share`, das Live-Bild des EU-Dienstes auf einer
echten Seite. Das ist Jans Schritt 1–3 in §6.

## 6. Offen (Jan)

1. `npm run edge:share` — `routes.ts` trägt neue Meta-Texte für `/waldbrand`; `verify:share` prüft das Edge-Bündel Byte für Byte.
2. `npm run typecheck`, `npm run build` (enthält `verify-seo`, `verify-routing`), `npm run budget`, `npm run verify:share`.
   Erwartung Budget: eagerJs unverändert oder minimal kleiner, totalJs etwa +1 KB (lazy Text-Chunk). Bei Rot: Grenze mit Notiz anheben.
3. Sichtprüfung einer Seite nach dem Deploy, z. B. `/waldbrandgefahr/deutschland/brandenburg/`: Feuerwetter-Bild und Legende laden,
   „Morgen" und „Einordnung" wechseln das Bild.
4. Commit auf `main` (Vorschlag: `feat(seo): Waldbrandgefahr nach Bundesland und Kanton, /waldbrand-Texte`), Push.
5. Nach dem Deploy: Search Console — `sitemap.xml` neu einreichen, URL-Prüfung + Indexierung für `/waldbrand`, `/waldbrandgefahr/`
   und die drei Länderseiten; Bing Webmaster Tools — Sitemap einreichen; IndexNow: `node scripts/seo/indexnow.mjs --match=waldbrand`.
6. Entscheidungen: **E-WBS-1** Standardsicht von `/waldbrand` (V-SN-5) — für Suchende nach „Waldbrand aktuell" wäre „Aktive Brände" die
   passende Voreinstellung; **E-WBS-2** Impressum vervollständigen (`scripts/seo/legal.mjs`, TODO-Platzhalter) — bei einem
   Sicherheitsthema ein Vertrauenssignal und Pflicht; **E-WBS-3** V-WBS-1 (FIRMS Suomi-NPP).

## 7. Befunde (V-WBS)

| Nr. | Befund / Mehrwert | Skizze |
|---|---|---|
| V-WBS-1 | FIRMS liefert laut eigener Ankündigung ab 02.11.2026 keine Suomi-NPP-Daten mehr; `FIRMS_SOURCES` ruft `VIIRS_SNPP_NRT` weiter ab, Texte nennen „Suomi-NPP, NOAA-20/21" als Takt | Abrufe beobachten (leer/404), Quelle aus der Liste nehmen, Texte anpassen; im Brandarchiv ab 2027 nur NOAA-20/21 und den Zeitreihenbruch kennzeichnen |
| V-WBS-2 | `/waldbrand` lädt lokal mit LCP 10–11 s, TBT 7–9 s (= V-SN-3/9); Core Web Vitals sind ein Rankingsignal | Karte erst nach dem ersten Bild starten, eigene Phase mit Messung; die statischen Regionsseiten sind bis dahin der schnelle Einstieg |
| V-WBS-3 | Die Saisonbilanz ist so frisch wie `index-season-v1.json` im Repo (zuletzt 31.10.); in der Saison veraltet sie zwischen zwei Batch-Läufen | Batch täglich in der Saison, danach Build (z. B. Build-Hook aus der Action); `lastmod` folgt dann dem Index |
| V-WBS-4 | Die Legende kommt als Bild vom EU-Dienst (englische Klassen); die Seite nennt die Klassen zusätzlich als Text | eigene Legende mit deutschen Namen und den am Bild gemessenen Farben |
| V-WBS-5 | Zuordnung über Natural Earth (rund 1 km); Ereignisse an Landesgrenzen können beim Nachbarn landen | amtliche Grenzen (VG250, swissBOUNDARIES3D, Statistik Austria) prüfen, wenn Lizenz und Größe passen |
| V-WBS-6 | `routes.ts` (Sub-Route Gefahrenindex) und `subRouteTexts.ts` sprechen noch von „nationalen Skalen von DWD und BAFU" neben dem Index; der Layer ist zurückgezogen, die Skalen stehen nur noch als Text im Dossier | Wortlaut angleichen (eager Bundle, deshalb nicht in dieser Phase) |
| V-WBS-7 | Linkaufbau: Feuerwehren, Gemeinden, Forst und Wanderportale verlinken Gefahrenkarten | einbettbares Feuerwetter-Bild je Region (iframe mit Quellenzeile und Rücklink), Hinweis an Lokalmedien in der Saison |
| V-WBS-8 | Ratgeber „Feuer und Grillen im Wald: was in DE, AT und CH gilt" fehlt (Suchen „Feuerverbot", „Grillen im Wald verboten") | nur mit belegter Tabelle je Land/Kanton (Rechtsgrundlage, zuständige Stelle, Prüfdatum); rechtlich heikel, deshalb nicht in dieser Phase |
