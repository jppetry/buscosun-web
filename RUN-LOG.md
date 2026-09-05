# RUN-LOG — SEO/GEO-Lauf 2026 (Branch `seo-geo-2026`)

Protokoll des autonomen Laufs nach Jans Freigabe vom 2026-09-05. Je Etappe: Ziel, Ergebnis, Messwerte,
Zeitstempel (Europe/Berlin), Entscheidungen, die im Plan nicht standen. Prüfungen nach `VERIFY.md`.

## Rahmen

- **Arbeitsweise:** eigener Git-Worktree `C:\dev\buscosun-web-seo` auf Branch `seo-geo-2026` (abgezweigt von
  `main` @ `a6174e0`, BW-13). Grund: im Hauptarbeitsverzeichnis laufen parallel andere Linien mit
  uncommitted Änderungen (`src/fire/*`, Brandradar-Detail); ein Branch-Wechsel dort hätte deren Zustand
  verschoben. `node_modules` ist per Junction geteilt.
- **Jans Antworten (2026-09-05):** Deploy-Previews entstehen automatisch je Pull Request (Base `main`);
  `buscosun.app` ist vermutlich nicht registriert und nicht relevant → keine Migrationsschritte, nur
  Nennung tilgen; Repo ist **nicht** öffentlich → `/ohne-tracker/` ohne „Quelltext offen"-Aussage, kein
  Wikidata-Repo-Link; Impressum-Platzhalter füllt Jan am Ende → Build-Warnung bleibt sichtbar, `/ueber/`
  nennt keinen Betreiber; `/wetterlage/` läuft weiter → neuer Saisonbericht (Waldbrandsaison 2026) als
  Artikel; Stufe 2 freigegeben.
- **Werkzeuge:** `gh` fehlt, Netlify-CLI nicht eingeloggt → PR-Erstellung über die GitHub-API mit den
  gespeicherten Git-Credentials (Versuch), sonst manueller Schritt; Lighthouse nur, wenn der
  Chrome-DevTools-MCP startet, sonst Playwright-Metriken.

## Etappen

| Etappe | Start | Ende | Ergebnis | Commit |
|---|---|---|---|---|
| E0 Fundament | 2026-09-05 00:45 | 2026-09-05 01:20 | grün | d39f854 |
| E1 Kanonik & Ebene B | 2026-09-05 01:25 | 2026-09-05 03:05 | grün (lokal) | 4400a5c |
| E2 Gerenderter Inhalt & Verlinkung | 2026-09-05 03:10 | 2026-09-05 04:30 | grün (lokal + Preview) | f90dbff |
| E3 Entitäten, Vertrauen, Methodik | 2026-09-05 04:35 | 2026-09-05 06:10 | grün (lokal) | (s. u.) |

## E0 · Fundament — 2026-09-05

**Getan:** Worktree + Branch; die sechs Planungsdokumente, `RUN-LOG.md`, `MANUELLE-SCHRITTE.md` ins Repo;
`build` ruft jetzt `verify-seo.mjs` und `verify-routing.mjs` (SEO-Gate im Build, V-SEO-13); CI-Schritt
„Routing-Gate"; Metatexte in `src/router/routes.ts` ohne zurückgezogene Layer (Waldbrand) und mit
ehrlichem Erstbild-Hinweis (Wetterkarte); `llms.txt` 138 Orte; Alt-Doku `docs/seo-geo/*` auf `.com`;
SEO-PLAN um Jans Entscheidungen und V-SEO-15…23 ergänzt.

**Messwerte:** typecheck grün · build grün (Generator: 138 Geo, 10 Explainer (3 idx), 10 Tools (3 idx),
1 Wetterlage, 13 Route-Shells, Sitemap 189 URLs) · verify:seo grün · verify:routing 105/105 · budget grün
(größter Chunk maplibre 278,4 KB gzip, eager JS 317,8 KB roh) · **Negativ-Kontrolle V-15:** H1 aus
`dist/index.html` entfernt ⇒ `verify-seo.mjs` Exit 1; wiederhergestellt ⇒ Exit 0.

**Entscheidung außerhalb des Plans:** Worktree statt Branch-Wechsel im Hauptverzeichnis (parallele Linien).

## E1 · Kanonik & Ebene B — 2026-09-05

**Getan:**
- `src/map/layerCatalog.ts` (Dock-Label/Tooltip, Reihenfolge) — MapView leitet `LAYER_OPTIONS` daraus ab
  (Diff MapView: +7/−21 Zeilen, Tooltips wortgleich, Verifier prüft den Warn-Tooltip).
- `src/seo/layerSeoTexts.ts` (19 Layer × H1/Lead ≥ 60 Wörter/2 Absätze/5 Fakten/Explainer) und
  `src/seo/subRouteTexts.ts` (+3 Atmosphäre-Linsen, +3 Brand-Sichten) — **außerhalb des Start-Bundles**.
- `src/router/routes.ts`: `CONTENT_UPDATED`, `updated` je Route, `sitemapPaths()` mit lastmod,
  `indexableSubRoutes()` (24 = 18 Layer + 3 + 3; `/wetterkarte/warnungen` bleibt Cross-Alias),
  Waldbrand-Descriptions ≤ 160 Zeichen; `urlState.ts`: `LAYER_SLUG_DESCRIPTION` (24 eindeutige Descriptions).
- Generator: 24 flache Sub-Shells `dist/<route>--<slug>.html` mit eigenem Title/Description/Canonical/OG/
  JSON-LD (WebPage + BreadcrumbList 3-stufig), Katalogtext + Fakten + Geschwister-Links + Hub-Links im
  `#root`; Sitemap-lastmod aus Inhalt (5 verschiedene Daten statt 1), kein `changefreq`; hreflang komplett
  entfernt (auch Hub `/wetter/`).
- `netlify.toml`: 24 Sub-Routen-Regeln vor den Wildcards; `[[headers]]`: `/assets/*` immutable + noindex,
  Manifest-MIME, `/fonts/*` immutable, 10 Datenpfade noindex. `robots.txt`: EINE UA-Gruppe (die alten
  UA-Einzelblöcke hätten die Disallows für Googlebot & Co. aufgehoben), Disallow für 6 Proxys, 3 Edge
  Functions, 8 Datenpfade; `/assets/` bewusst offen (Z1).
- Verifier: `verify-routing` +21 Checks (Katalog, Sub-Texte, Sub-Regeln, robots, Header, Sub-Shells),
  `verify-seo` +~200 Checks (24 Shells, Sitemap).

**Messwerte:** typecheck grün · build grün · verify-seo 383/383 · verify-routing 139/139 · budget grün
(eager roh 320,4 KB nach 317,8 KB; **Zwischenstand mit Texten im Start-Bundle: eagerJs 120,5 KB gzip > 107,9
Ratsche ⇒ Texte in lazy Modul verschoben**, Ratsche unverändert) · Sub-Shell `wetterkarte--temperatur`:
316 Wörter im `#root`, eigener Canonical · Sitemap 189 URLs, lastmod 2026-06-09 ×139 / 06-26 ×6 / 08-01 ×4 /
08-14 ×1 / 09-05 ×39 · hreflang in dist: 0 Dateien · CI-Verifier lokal: datenalter 54/54, precip-source 30/30,
governor, thunder 13, lpi 6, snow 20, rotation 30, warm-budget 30, health 20, model-source, event-zone,
official-sources alle grün; **verify:fire-detail 296/296**.

**Abweichung/Befund:** `verify:route-3d` meldet im Worktree 563/564 („im Grenzwert-Modus bleibt keine Ebene
ohne Schalter eingeschaltet"), im Hauptverzeichnis 564/564 bei identischer Datei: der Check sucht einen
LF-String (`mode === 'gonogo'
      // …`), der Worktree ist per autocrlf CRLF ausgecheckt. Kein Befund
gegen den Code; Verifier ist CRLF-empfindlich (V-SEO-24, s. SEO-PLAN). CI (Linux, LF) ist davon unberührt.
`verify-layer-matrix.mjs` ist ein Golden-Baseline-Werkzeug mit Argumenten, kein npm-Alias — nicht Teil des Gates.

**Entscheidungen außerhalb des Plans:** kein SW-Version-Bump (Cache-Control `immutable` ändert das SW-Verhalten
nicht — `ASSET_RE` ist ohnehin stale-while-revalidate); Header wirken nicht auf Proxy-Rewrites (Netlify), dort
schützt nur robots.txt (in netlify.toml dokumentiert); `sitemap-news.xml` bleibt (Jan schreibt einen Saisonbericht).

## E2 · Gerenderter Inhalt & interne Verlinkung — 2026-09-05

**Getan:**
- `src/router/RouteSeoBlock.tsx` + `routeSeoBlock.css`: „Über diese Ansicht" als natives `<details>` — Chip
  sichtbar, Inhalt zugeklappt im DOM (kein `display:none`, kein versteckter Text). Inhalt = derselbe Text wie die
  Shell (Route-Meta bzw. `subRouteText()`, lazy geladen), Brotkrumen, Fakten, Geschwister-Ansichten, Hub-Links.
  H1 nur, wenn die Seite keine eigene hat. Lazy über `React.lazy` im `page()`-Wrapper (`router.tsx`,
  `withSeo`), damit eagerJs/eagerCss unverändert bleiben.
- **Abweichung vom Plan (Z3):** statt einer Karte am Ende der Readout-Spalte (je Deck anders) ein einheitlicher
  Chip unten rechts (Desktop) bzw. rechts neben der Modell-Pille unter dem schwebenden Kopf (Mobil). Grund: zehn
  Decks mit verschiedenen Layouts; der Chip lässt jede Bühne pixelgleich.
- `src/nav/featureRail.tsx`: Rail-Einträge sind `<Link to>` statt `<button>` (gleiche Klassen; Deck-Handler
  übernimmt per preventDefault — Klickverhalten unverändert, jetzt 11 crawlbare Links je Deck).
- Startseiten-Footer: Spalte „Entdecken" (`/wetter/ /wissen/ /funktionen/ /wetterlage/`).
- Punktforecast: Link „Mehr über das Wetter in <Ort>" auf `/wetter/<slug>/`, wenn ein kuratierter Ort ≤ 3 km liegt
  (`src/router/placePages.ts`, `placeSlugs.json` via `npm run seo:places`, Verifier prüft Gleichheit mit `places.mjs`).
- `scripts/seo/verify-live.mjs` (V-2…V-5, V-9, V-13 gegen ein Deploy), `npm run verify:live <url>`.
- `budget.json`: **totalJs-Ratsche bewusst 1109,8 → 1114,0 KB gzip** (lazy Text-Chunk `subRouteTexts` ≈ 13 KB gzip,
  nur nach dem App-Mount, immutable gecacht); eagerJs-Ratsche unverändert 107,9 (Ist 105,0), eagerCss 2,4/2,5.
  Zwischenstand vor der Lazy-Umstellung: eagerCss 3,3 > 2,5 (Block-CSS im Start-Bundle) ⇒ behoben.

**Messwerte (lokaler `vite preview` von dist/, Chrome-DevTools-MCP):**

| Seite | Viewport | H1 | interne Links (DOM) | Wörter im Block (textContent) | Chip |
|---|---|---|---|---|---|
| `/wetterkarte/temperatur` | 390×844 | 1 (aus Katalog) | 25 | 293 | 166×44 @ (212,68) |
| `/regenradar` | 1440×900 | 1 (eigene „Regnet es bald?", Block als `<p>`) | 16 (Rail 13) | 89 | 147×30 @ (1277,856) |
| `/waldbrand/aktive-braende` | 1440×900 | 1 (aus Katalog) | 18 | 310 | 147×30, liegt über `.br-fires` frei |

Vorher (Live, SEO-AUDIT §4): 0 H1, 0 Links, 35 Wörter. Konsole: 0 Fehler/Warnungen. Touch-Ziele im geöffneten
Block mobil: alle ≥ 44 px (nach Fix der Brotkrumen-Links; Erstmessung 13 px). typecheck grün · build grün ·
verify-seo 383/383 · verify-routing 142/142 · budget grün.
Belege: `audit/seo-geo-2026/e2-mobile-temperatur-chip.jpeg`, `e2-desktop-regenradar-chip.jpeg`.

## Preview-Belege E1 + E2 — deploy-preview-2--weatherhub94.netlify.app @ f90dbff (2026-09-05 05:20)

- `npm run verify:live <preview> --sample 30`: **92 Checks ok, 1 Fehler** — `/wetter/`-Hub ohne JSON-LD (Altbestand,
  in E3 behoben: CollectionPage + Entitäten). Geprüft: robots (Disallows, /assets offen), `assets/index-*.js`
  → 200 + `X-Robots-Tag: noindex` + `immutable`, Manifest-MIME, `/latest-grib.json` + `/sw.js` noindex,
  HTML max-age=0, 404, fünf 301s, 62 Sitemap-URLs (alle App-/Sub-Routen + Stichprobe) mit Self-Canonical,
  eigenem Title, H1, JSON-LD, ohne hreflang. `/_dwd_opendata/` antwortet weiter 200 (nur robots-gesperrt, s. Z2).
- **V-7 Desktop-Regression** (1440×900, Chrome-DevTools-MCP, Produktion vs. Preview, `/wetterkarte/temperatur`):
  Bounding-Boxes und Farben von Topbar, Rail, Dock, Readout, Stage, Zeit-Deck, Zoom, aktivem Rail-Knopf und
  Canvas **identisch** (z. B. Stage 298/64/794×836, Zeit-Deck 322/783/746×99). Rail: Produktion `BUTTON`,
  Preview `A` mit gleicher Box/Farbe; einziger Unterschied `text-decoration: underline` (ohne Text unsichtbar)
  → in E3 per Inline-Style entfernt. H1: Produktion 0, Preview 1; interne Links: Produktion 0, Preview 36.
  Chip `.rsb-summary` 147×30 @ (1277,856) unten rechts, über keinem Bedienelement.

## E3 · Entitäten, Vertrauen, Methodik — 2026-09-05

**Getan:**
- `@id`-Graph: `Organization` (`/#organization`, Logo, knowsAbout, areaServed) und `WebSite` (`/#website`,
  publisher-Referenz) auf JEDER Seite genau einmal definiert (`entityScripts()` in headBlock, Route-/Sub-Shells,
  Home); `linkEntities()` ersetzt eingebettete Organization/WebSite-Objekte automatisch durch `{@id}`-Referenzen
  und hängt `isPartOf {@id website}` an Seitenknoten; `WebApplication` trägt `/#app` + publisher-Referenz.
- DWD-Etikett in vier Footern: „CC BY 4.0" → „GeoNutzV"; `Dataset.license` (DE) auf die erreichbare
  DWD-Rechtshinweis-Seite (alte URL 404, geprüft 2026-09-05). Modellkatalog (`license: 'CC-BY-4.0'` für DWD)
  unverändert — fusion-Datei, Lizenzfrage an Jan (MANUELLE-SCHRITTE).
- Neue Seiten (`scripts/seo/methodik.mjs`, Renderer `renderArticlePage`/`renderMethodikHub`): `/methodik/` Hub +
  9 Seiten (Höhenkorrektur, Punktvorhersage-Quellenmix, Regenradar-Nowcast, Konfidenz & Trefferquote,
  Event-Bewertung, Tourenplanung-Zeitmodell, E-Bike-Reichweite, Brandradar, Wettermodelle — letztere als Tabelle
  aus `modelCatalog.ts`, Parser in `licenses.mjs` um Zahlen/Flags/Abdeckung erweitert), `/ueber/` (AboutPage,
  Betreiber nur aus `legal.mjs` — Platzhalter bleiben sichtbar), `/ohne-tracker/` (Hosts + Speicher aus
  `legal.mjs`, Prüfanleitung). Jede Seite: TechArticle/AboutPage + FAQPage + BreadcrumbList, ≥ 500 Wörter,
  Stand-Zeile, Konstanten aus dem Code.
- `/validierung` indexierbar (noindex entfernt, Lead erweitert); Sitemap 190 URLs → 202 mit Methodik/Vertrauen.
- Footer (Rechtsseiten, Startseite, RouteSeoBlock) verlinken Über/Methodik/Ohne Tracker; `/wetter/`-Hub bekommt
  CollectionPage + Entitäten.
- Verifier: `verify-seo` +120 Checks (Methodik-Wortzahl ≥ 500, Typen, keine Platzhalter; Entitäten-Graph auf 11
  Seitentypen: je genau eine Organization/WebSite-Definition, alle `@id`-Referenzen auflösbar, keine eingebettete
  Organization ohne `@id`, kein „DWD, CC BY 4.0").

**Messwerte:** typecheck grün · build grün · verify-seo 503/503 · verify-routing 142/142 · budget eagerJs 105,1 /
totalJs 1113,3 (Ratsche 1114,0) · Generator: 9 Methodik + 2 Vertrauensseiten, Sitemap 202 URLs.

## E4 · Content-Reife bestehender Seiten — 2026-09-05

**Getan:** Alle 14 `stub`-Seiten sind `full` — 0 noindex-Gerüste im Bestand.
- `scripts/seo/explainers.mjs`: 7 Explainer ausgeschrieben (thermik, schneefallgrenze, gewitter-unwetter,
  biowetter, hoehenkorrektur-lapse-rate, modellvergleich-unsicherheit, windboeen-sturm) — je 4 Abschnitte,
  4 FAQ, ≥ 2 Quellen, gemessen **647–733 Wörter** (Vorgabe ≥ 450). Zahlen aus dem Code:
  `src/atmosphere/thermalField.ts`, `src/scalar/snowLine.ts`, `src/ml/snowModel.ts`,
  `src/radar/thunderPotential.ts`, `lightningPotential.ts`, `konrad3d.ts`, `src/confidence/*`,
  `src/sources/iconD2GustSource.ts`. „Biowetter" ist bewusst eine Negativ-Auskunft: buscosun hat kein
  Biowetter-Modul; die Seite erklärt Föhn, UV und Pollen mit der DE/AT/CH-Asymmetrie.
- `scripts/seo/tools.mjs`: 7 Tool-Seiten ausgeschrieben (tourenplanung, event-tag, nowcast, modellvergleich,
  globus, historie, arbeitsfenster) — je „So geht's" als nummerierter Ablauf, ein Abschnitt „Was das Werkzeug
  nicht kann", 3 FAQ, gemessen **614–782 Wörter** (Vorgabe ≥ 400). Arbeitsfenster aus den echten Konstanten in
  `src/threed/goNoGo.ts` (Voreinstellung 120 m AGL / 40 km/h, 15-Min-Raster, Potenzprofil α = 0,2 mit
  Sättigung bei 1 500 m aus `crossSection.ts`, Referenzanker = höchstes Gelände).
- `scripts/seo/content.mjs`: `ogImageOr()` — eine Seite bekommt ihr eigenes OG-Bild nur, wenn die PNG
  existiert, sonst die Bereichs-Karte. Ohne das hätten die 14 neuen `full`-Seiten auf nicht existierende
  Bilder gezeigt (die PNGs entstehen in E10).

## E5 · Neue Explainer, Glossar, Saisonbericht — 2026-09-05

**Getan:**
- `scripts/seo/explainers-extra.mjs` (neu): **15 Explainer**, alle `full`, gemessen **488–648 Wörter**,
  je 4 FAQ und 2–4 Quellen — fire-weather-index, waldbrandwarnstufen-de-at-ch, thermalanomalien-firms,
  goldene-blaue-stunde, lichtverschmutzung-bortle, klimastreifen, kenntage-hitzetage-frosttage,
  wachstumsgradtage-heizgradtage, trockenperioden, talwind, skew-t, gewitterzellen-konrad, hagel-meshs-poh,
  regenradar-radolan-inca-rzc, windgrenzwerte-arbeit-drohne. `explainers.mjs` führt Basis und Neue in EINER
  Liste zusammen (`EXPLAINERS_BASE` + `EXPLAINERS_EXTRA`), damit Hub, Sitemap, Feed und Verifier nur eine
  Quelle lesen. Bestand danach: **25 Explainer, alle indexierbar**.
- `scripts/seo/glossary.mjs` (neu): `/glossar/` mit **75 Begriffen**, je Anker-`id`, Kurz-Definition
  (`DefinedTerm.description`) und ≥ 40 Wörtern Erläuterung; `DefinedTermSet` + `BreadcrumbList` als
  JSON-LD, A–Z-Sprungleiste. Explainer und Sub-Routen können damit auf `/glossar/#<begriff>` zeigen.
- Saisonbericht `waldbrandsaison-2026-dach-zwischenbilanz` in `scripts/seo/events.mjs` (982 Wörter).
  **Jede Zahl aus den Artefakten im Repo**, nicht geschätzt: `public/fire/bh/index-season-v1.json`
  (5 881 Ereignisse, DE 5 349 · AT 368 · CH 164, 1 195 auf Anlagenstandorten, 120 nur über EFFIS, 37
  Abweichungen; Regel Cluster 2 km × Lücke 48 h, Saison 1.3.–31.10.) und `season-series-v1.json`
  (Saisontag 174 = 22.8.2026: DACH 4 686 gegen Mittel 2 475,5 der Jahre 2020–2025, Spanne 1 544–4 045;
  Saisonenden 2020–2025 2 792 / 1 980 / 3 171 / 2 992 / 2 814 / 4 528). Der Artikel sagt ausdrücklich, dass
  die Zahlen Satellitendetektionen und keine amtliche Statistik sind, dass die Reihe die Anlagenstandorte
  ausschließt, und **er nennt keine Ursache** — die Daten geben keine her. Die `limits` des Artefakts sind
  als Abschnitt „Grenzen dieser Bilanz" übernommen.

## E6 · Zielgruppen-Landingpages /fuer/ — 2026-09-05

**Getan:** `scripts/seo/audiences.mjs` (neu) mit **16 Seiten + Hub**: gleitschirmflieger, bergsport,
radsport, e-bike, segler, drohnenpiloten, bau-und-kran, landwirtschaft, veranstalter, hochzeit, fotografen,
astronomie, feuerwehr-katastrophenschutz, wetterfuehlige, allergiker, wintersport. Gemessen **586–766 Wörter**
je Seite (Vorgabe ≥ 500), je 4 FAQ, Descriptions paarweise verschieden und ≤ 160 Zeichen (15 von 16 waren
zunächst 169–198 Zeichen lang und wurden gekürzt). Jede Seite hat den Pflicht-Abschnitt **„Was buscosun hier
nicht kann"** — Feuerwehr: kein Einsatzsystem, keine Alarmierung; Wintersport/Bergsport: kein
Lawinenlagebericht; Segler: keine Wellenhöhe; Allergiker: Pollen amtlich nur in Deutschland; Wetterfühlige:
keine Gesundheitsaussagen; Landwirtschaft: kein Agrar-Modul. Der Verifier erzwingt diesen Abschnitt per Regex.

**Generator/Verifier (E5+E6):** `scripts/generate-seo.mjs` erzeugt `/glossar/` und `/fuer/<gruppe>/` +
Hub und nimmt sie in die Sitemap; `verify-seo.mjs` prüft Glossar (≥ 60 Begriffe, DefinedTermSet) und
Zielgruppen-Seiten (≥ 16, ≥ 500 Wörter, Negativ-Abschnitt, paarweise verschiedene Descriptions).
Startseiten-Footer und „Über diese Ansicht" verlinken `/fuer/` und `/glossar/`.

**Abweichung vom Plan (Prozess, ohne inhaltliche Wirkung):** E4, E5 und E6 liegen in EINEM Commit statt in
dreien. Die drei Etappen sind parallel entstanden und teilen sich dieselben Hunks in `generate-seo.mjs`,
`verify-seo.mjs` und `explainers.mjs`; eine Aufteilung hätte Zwischenstände erzeugt, die nicht bauen.
Der Commit nennt alle drei Etappennummern.

**Anmerkung zur Erzeugung:** Die drei Content-Agenten liefen in ein Sitzungslimit (HTTP 429). Fertig geworden
waren die 7 Explainer, 9 von 10 Tool-Seiten, die 15 neuen Explainer, das Glossar und die 16 Zielgruppen-Seiten;
von Hand nachgezogen wurden die Tool-Seite Arbeitsfenster, der Saisonbericht, eine zu kurze Glossar-Erläuterung
(KONRAD, 38 statt 40 Wörter) und die 15 zu langen Descriptions.

## E7 · Neue App-Sub-Routen — 2026-09-05

**Getan:** 13 neue kanonische Pfade, **24 → 37 indexierbare Sub-Routen**.
- `/atmosphaere/arbeitsfenster` (Go/No-Go): lag bisher nur auf `?ansicht=gonogo` — eine Query-URL, die
  Google auf die Elternseite faltet, obwohl `llms.txt` und die Tool-Seite darauf verlinkten. `urlFor()` in
  `AtmosphereRoute.tsx` rechnet Pfad und Query an EINER Stelle und schreibt sie pro Tick einmal
  (`queueMicrotask`), damit Linsen- und Unterlinsen-Wechsel im selben Commit nicht zwei History-Einträge
  erzeugen. Alte Links bleiben gültig und werden per `replace` auf den Pfad umgeschrieben.
  `routeSub` wandert wie `routeLens` durch `AtmospherePage` → `AtmosphereDeck`, damit Zurück/Vorwärts
  zwischen Querschnitt und Arbeitsfenster die Unterlinse mitnimmt.
- `/waldbrand/historie` und `/waldbrand/thermalanomalien`: `fireRouteView.ts` kennt zwei neue Sichten;
  `applyFireView` liefert zusätzlich ein `history`-Feld (`'season'` für die Historie), `fireViewFromState`
  nimmt das Historie-Fenster als drittes Argument — Historie schlägt Reiter, Reiter schlägt Layer. In
  `FirePage.tsx` vier kleine Stellen: Anfangszustand des Historie-Fensters (Hash gewinnt weiter, `?bh=0`
  schaltet ab), Mobil-Reiter, Meldung an den Router, Übernahme bei Zurück/Vorwärts.
  `verifyFireRouteView` 7 → **11/11** (neu: beide Sichten, „Historie schlägt Reiter", „jede Sicht ist ihr
  eigener Rückweg").
- `/eventplanung/<anlass>` ×10 (grillen, hochzeit, wandern, drohne, fotografie, sterne, radtour, picknick,
  laufen, baden): `EVENT_ACTIVITY_SLUGS` in `routes.ts`, `EventRoute.tsx` wählt den Anlass vor,
  `EventPage` nimmt `initialActivityId` (setzt Anlass, Phasen und Gewichte) und meldet einen Anlasswechsel
  per `onActivityChange` zurück in den Pfad (`replace`, nur bei echter Nutzeraktion — die Wiederherstellung
  aus `#ev=` löst nichts aus). Unbekannter Slug ⇒ 404 statt stiller Eltern-Shell.
- `src/seo/subRouteTexts.ts`: 13 neue Texte, jeder mit ≥ 60-Wort-Lead, ≥ 2 Absätzen, ≥ 4 Fakten inkl.
  Quelle und Grenze. Zahlen aus dem Code bzw. den Artefakten: Go/No-Go-Konstanten aus `goNoGo.ts`;
  Anlass-Gewichte und Idealtemperaturen aus `src/event/eventScoring.ts`; Thermalanomalien aus
  `public/fire/ta/thermal-sites-v1.json` (218 Standorte — A 145 · B 8 · C 65; DE 92 · AT 12 · CH 8, übrige
  außerhalb DACH; Regel ≥ 2 Jahre mit je ≥ 5 Tagen, Anlagen-Join 1,5 km, Archiv 2020-01…2026-05);
  Historie aus `index-season-v1.json`.
- `netlify.toml`: 13 neue 200-Regeln je vor ihrer Wildcard, dazu erstmals `/eventplanung/*`.
- `public/llms.txt`: Go/No-Go-Link auf den kanonischen Pfad, alle Sub-Routen benannt.
  **Zwei Textfehler korrigiert** (V-SEO-25, V-SEO-26): Der Globus lädt GFS **live** per HTTP-Range aus dem
  AWS-Bucket (`src/globe/gfs.ts`) — die Datei behauptete „gebündelte Beispieldaten, keine globale
  Live-Vorhersage" und verschenkte damit ein Feature; und „amtliche Landesstufen" wurde durch die genaue
  Formulierung ersetzt (nationale Skalen von DWD und BAFU, Österreich hat keine offene amtliche Stufe).

**Messwerte E4–E7:** typecheck grün · build grün · **verify-seo 785/785** (E3: 503) ·
**verify-routing 146/146** (E3: 142) · `verifyFireRouteView` 11/11 · `verifySubRouteTexts` 9/9 für 37 Pfade ·
**Sitemap 202 → 263 URLs** · 37 Sub-Routen-Shells · 25 Explainer + 10 Tool-Seiten + 2 Wetterlage-Artikel +
75 Glossar-Begriffe + 16 Zielgruppen-Seiten, alle indexierbar.

**Budget bewusst angehoben:** totalJs 1114,0 → **1124,0** (IST 1123,5). Ursache benannt und begrenzt: die 13
neuen Sub-Routen-Texte liegen im **lazy** Chunk `subRouteTexts` (74 KB roh, ~9,5 KB gzip), der erst nach dem
App-Mount lädt und immutable gecacht ist. Die Erstbild-Ratsche **eagerJs bleibt 107,9** (IST 106,3), eagerCss
2,5 (IST 2,4), largestChunk 292,3 (IST 278,4) — der Erstbild-Pfad wächst nicht mit.
**Falle:** `npm run budget -- --update` setzt pauschal +5 % auf ALLE Metriken (eagerJs wäre auf 111,6
gewandert) und löscht die Notiz. Die Grenzen wurden deshalb von Hand gesetzt; der Hinweis steht jetzt in
`budget.json`.

## E8 · Ortsseiten v2 — 2026-09-05

**Getan:** Aus 138 Landingpages nach einem Muster wurden 138 Nachschlagewerke.
- `scripts/seo/climate.mjs` (neu) rechnet je Ort eine **Monats-Klimatologie** aus
  `public/climaGrid.json` (178 Stationen, DWD-Messungen über Meteostat, 1995–2024) — und zwar mit
  **derselben Klasse wie die App** (`src/ml/climaField.ts`: drei nächste Stationen, entfernungsgewichtet,
  Höhenkorrektur 6,5 K/km). Kein zweiter Rechenweg, der driften kann (Lehre V-80). Ausgewiesen wird das
  Ergebnis als Schätzung aus Stationsdaten mit der **Entfernung zur nächsten Station** — die Zahl, die
  bestimmt, was die Schätzung wert ist (Berlin 9 km, Innsbruck 4 km, Zermatt 39 km).
  Stichprobe gegen bekannte Normalwerte: Berlin Juli-Maximum 25,1 °C / Januar-Minimum −1,3 °C,
  Zermatt (1 608 m) 19,1 / −8,5 °C, Hamburg 23,5 / −0,6 °C — plausibel.
- **Sonnenzeiten je Monat** (Aufgang, Untergang, Tageslänge, goldene und blaue Stunde am Abend) aus
  `src/photo/sun.ts`. **Zeitzonen-Falle vermieden:** Tagesgrenze UND Formatierung sind an
  `Europe/Berlin` verankert, nicht an der Systemuhr — Netlify baut in UTC, die Zeiten wären lokal
  richtig und in Produktion um ein bis zwei Stunden falsch gewesen. Gegenprobe: Hamburg 15. Juni
  04:50–21:51 (17:01 h), Berlin 15. Dezember 08:10–15:52 (7:41 h).
- Block **„Was wir für <Ort> nicht wissen"** je Ort: Radar-Horizont des Landes, wer warnt und wo die
  Warnung fehlt (Österreich), Pollen/UV-Verfügbarkeit, Lawinen nur als Deep-Link, und dass die
  Klimatabelle geschätzt ist.
- **Eigene Description je Ort** aus Region, Höhe und zwei Klimakennzahlen: **138/138 verschieden**,
  alle ≤ 160 Zeichen (vorher 138× derselbe Satz — ein Duplikat-Signal ohne Informationswert).
- **Defekt behoben:** Die sechs Funktions-Knöpfe der Ortsseite zeigten **alle auf `/`**. Jetzt acht
  Deep-Links in die passende Ansicht, mit dem Ort in der Query, wo die Ansicht ihn annimmt.
- `Dataset` JSON-LD trägt `temporalCoverage 1995/2024`; `PLACES_UPDATED` auf 2026-09-05.

**Messwerte:** **994 Wörter je Ortsseite** (vorher ~520; Vorgabe ≥ 650) · 138 eigene Descriptions ·
verify-seo 792/792 (+7 neue Ortsseiten-Checks: Wortzahl, Klimatabelle, Sonnenzeiten, Lücken-Abschnitt,
temporalCoverage, Description-Eindeutigkeit).

**Falle notiert:** `scripts/generate-seo.mjs` ist **nicht idempotent** gegen ein bereits erzeugtes
`dist/`. Ein zweiter Lauf ohne vorheriges `vite build` leitet die Route-Shells aus der schon
angereicherten `index.html` ab — Ergebnis: 196 Fehler mit Startseiten-Canonical auf allen Shells. Das
ist kein Regress, sondern ein Bedienfehler; Verifier immer nach vollem `npm run build` lesen.

## E9 · GEO-Schicht — 2026-09-05

**Getan:**
- `scripts/seo/llms.mjs` (neu) **erzeugt** `llms.txt` und `llms-full.txt` aus denselben Listen wie die
  Seiten. Die handgeschriebene Fassung war an drei Stellen veraltet: „~140 Orte" bei 138, Go/No-Go auf
  einer Query-URL ohne eigenen Canonical, und die Behauptung, der Globus zeige gebündelte Beispieldaten
  (er liest GFS live per HTTP-Range, `src/globe/gfs.ts`). `public/llms.txt` ist entfallen.
  `llms.txt` (10 KB): Funktionen mit kanonischen URLs, Orte je Land, Methodik, Erklärungen, Zielgruppen,
  Glossar, **Zitierhinweis** und ein Abschnitt **Grenzen**. `llms-full.txt` (321 KB): Direktantworten und
  Volltext aller 25 Erklärungen, 9 Methodik-Seiten, 16 Zielgruppen-Seiten, 10 Werkzeugseiten,
  2 Wetterlage-Artikel und 75 Glossar-Begriffe.
- **Sitemap-Index:** `sitemap.xml` verweist jetzt auf `sitemap-pages.xml` (125 URLs) und
  `sitemap-orte.xml` (138). Die URL bleibt gleich, damit eine eingereichte Sitemap weiter funktioniert;
  in der Search Console lässt sich die Indexierung dadurch je Seitentyp lesen. `robots.txt` nennt alle drei.
- `feed.xml` um Methodik- und Zielgruppen-Seiten erweitert (die zitierfähigsten Texte).
- `speakable` (h1 + Lead) auf Erklärungen, Methodik- und Zielgruppen-Seiten.
- Verifier: `verify-seo` prüft die GEO-Dateien selbst (Ortszahl in `llms.txt` == gebaute Ortsseiten,
  Go/No-Go auf dem kanonischen Pfad, Zitierhinweis vorhanden, `llms-full.txt` < 2 MB, keine relativen
  Links, kein `buscosun.app`); `verify-live` löst den Sitemap-Index auf und holt beide GEO-Dateien.

**Messwerte:** verify-seo 803/803 · verify-routing 146/146 · Sitemap 263 URLs (125 + 138).

## E10 · Abschluss — 2026-09-05

**OG-Bilder:** 60 neue Karten (Bestand 14 → **74**) für alle Erklärungen, Werkzeugseiten,
Zielgruppen- und Methodik-Seiten, die Hubs `/fuer/`, `/methodik/`, `/glossar/`, die Vertrauensseiten und
den Saisonbericht. Erzeugt aus `public/_og-card.html` mit dem lokal vorhandenen **Headless-Chromium**
(`--screenshot`, 1200×630) — kein Netzdienst, keine neue Abhängigkeit, rund fünf Minuten für 60 Karten.
Verdrahtet über `ogImageOr(slug, fallback)`: die eigene Karte wird nur genommen, wenn die PNG existiert,
sonst die Bereichs-Karte — so zeigt keine Seite je auf ein fehlendes Bild. Vorgehen in
`docs/seo-geo/og-images.md` festgehalten.
Der Playwright-MCP-Server war für diesen Lauf gesperrt („Browser is already in use", Profilkonflikt);
der Weg über die Chromium-Binärdatei ist ohnehin der schnellere und ist jetzt dokumentiert.

**Preview-Verifikation (deploy-preview-2, Commit d4f04a9):** `npm run verify:live <preview> --sample 25`
→ **142 Checks ok, 0 Fehler**, 103 Sitemap-URLs geprüft. Darunter: Sitemap-Index samt beider Teillisten,
robots mit allen Disallows, `/assets/*.js` 200 mit `X-Robots-Tag: noindex` und `immutable`,
Manifest-MIME, 404, fünf 301-Weiterleitungen, je URL Self-Canonical, eigener Title, H1, JSON-LD, kein
hreflang, dazu `llms.txt` (kanonischer Go/No-Go-Pfad, Zitierhinweis) und `llms-full.txt`.
Unverändert gemeldet: `/_dwd_opendata/` antwortet weiter 200 — nur `robots.txt` hält Bots fern, eine
echte Abschottung braucht eine Edge Function (Zielkonflikt Z2, MANUELLE-SCHRITTE Nr. 8).

**MANUELLE-SCHRITTE finalisiert:** Rich-Results-Liste mit 14 URLs je Seitentyp, Sitemap-Einreichung mit
Index-Erklärung, IndexNow-Vorlage (`scripts/seo/indexnow.example.json`), Entscheidung zum
DWD-Lizenzetikett im Modellkatalog (Fusions-Datei ⇒ STOPP & FRAGEN, im Lauf nicht angefasst),
Hinweis zur Neuerzeugung der OG-Karten, Vorschlag zur Taktung der 300 GEO-Prompts.

**Lighthouse (mobil, Chrome-DevTools):** Zwei Läufe, weil der erste allein nicht interpretierbar war.

| Lauf | SEO | Best Practices | Barrierefreiheit | Agentic Browsing |
|---|---|---|---|---|
| Preview `/wissen/fire-weather-index/` | 66 | 96 | 93 | 67 |
| Produktion `/wissen/foehn/` (gleicher Seitentyp) | **100** | **100** | 92 | **100** |

Die 66 im Preview kommen **nicht** aus dem Code: Netlify setzt auf Deploy-Previews automatisch
`X-Robots-Tag: noindex` (Lighthouse-Befund woertlich: „source: x-robots-tag: noindex"). Gegenprobe an der
Produktion: `curl -I https://buscosun.com/wissen/foehn/` → 200 ohne `X-Robots-Tag`; unsere `[[headers]]`
setzen noindex nur auf `/assets/*`, `/_*` und Artefakte. Auch der Agentic-Befund „llms.txt Fetch timed out"
war fluechtig — nachgemessen antwortet `/llms.txt` am Preview in 0,31 s (10 KB), `/llms-full.txt` in 0,82 s
(321 KB); die Produktion erreicht in derselben Kategorie 100.

**Zwei echte Befunde, beide behoben (E10):**
1. **Kontrast 3,03:1** — die Linkfarbe der statischen Seiten (Terracotta `#C97B47` auf Sand `#FAF6EA`)
   lag unter den geforderten 4,5:1. Betroffen waren ALLE statischen Seiten, auch die alten. Neuer Token
   `--terra-ink: #96521F` **nur fuer Linktext** (gemessen 5,52:1); `--terra` bleibt als Akzentfarbe fuer
   Balken, Eyebrows und Raender unveraendert. Die App-Oberflaeche ist nicht betroffen.
2. **Kein `main`-Landmark** — die 14 Seitenvorlagen trugen `<div class="wrap">`. Jetzt `<main class="wrap">`
   (gleiche CSS-Klasse, keine Layoutaenderung), damit Screenreader und agentische Browser den Inhaltsbereich
   finden.

Die Kennzahlen des Erstbilds bleiben unberuehrt: CLS 0 in beiden Laeufen, eagerJs/eagerCss unveraendert.

## Vorher / Nachher (gemessen, nicht geschätzt)

| Kennzahl | Vorher (2026-09-04, Live) | Nachher (Branch `seo-geo-2026`) |
|---|---|---|
| Sub-Routen mit eigenem Roh-HTML | 0 von 25 (alle trugen Eltern-Title und Eltern-Canonical) | **37 von 37** |
| Kanonische URLs in der Sitemap | 189 | **263** (125 Seiten + 138 Orte, als Index) |
| Indexierbare Erklärungen | 3 von 10 (7 `noindex`-Gerüste) | **25 von 25** |
| Indexierbare Werkzeugseiten | 3 von 10 | **10 von 10** |
| Zielgruppen-Seiten | 0 | **16 + Hub** |
| Glossar | – | **75 Begriffe mit Anker** |
| Methodik-Seiten | 0 | **9 + Hub** |
| Wörter je Ortsseite | ~520 | **994** |
| Eigene Descriptions der Ortsseiten | 1 Satz für alle 138 | **138 verschiedene** |
| Gerenderter DOM je App-Route | 0 H1, 0 interne Links, 35 Wörter | **1 H1, 36 interne Links, ≥ 120 Wörter** |
| `X-Robots-Tag` auf Bundles/Datenpfaden | keiner | **noindex auf /assets, /_*, Artefakten** |
| Proxy-Verzeichnisse in `robots.txt` | nicht gesperrt | **6 Rewrites + Edge Functions gesperrt** |
| hreflang | 4 Tags je Seite, alle auf dieselbe URL | **entfernt** |
| Sitemap-`lastmod` | Build-Datum für alle 189 | **aus dem Inhalt, 8 verschiedene Daten** |
| OG-Karten | 14 | **74** |
| `llms.txt` | handgepflegt, 3 veraltete Aussagen | **erzeugt**, dazu `llms-full.txt` (321 KB) |
| SEO-Gate im Build | nicht verdrahtet | `verify-seo` **803** + `verify-routing` **146** im `npm run build` |
| Live-Prüfung gegen Preview | – | `verify:live` **142/142** |
