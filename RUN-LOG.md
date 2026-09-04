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
