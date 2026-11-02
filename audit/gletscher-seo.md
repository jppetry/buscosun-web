# Gletscher-SEO (Phase GLS): Steckbrief-Seiten, Gletscher-Atlas, Head im Client

> Auftrag Jan, 02.11.2026: buscosun mit dem Gletscher-Feature bei Google und Bing für Gletscher-Suchen so weit wie möglich nach vorn
> bringen; erst Tiefenrecherche, dann Umsetzung im Repo auf `main`. Umgesetzt im Arbeitsbaum von `main` (Stand `fa33869b`),
> **nicht committet, nicht gepusht** (Commit und Push = Jans Gate). Datengrundlage: Gletscher-Build `20261012-1`.

## 0. Kurzfassung

- **Vorher:** genau eine indexierbare Gletscher-URL (`/gletscher`). Alle 2 199 Gletscher-Pfade teilten deren Shell und Canonical
  (`audit/seo-nischen.md` §8: „Einzelseiten je Gletscher … wären Stufe 2"). Für „Pasterze", „Hintereisferner", „Gletscher Deutschland"
  gab es also keine Seite, die ranken konnte.
- **Jetzt:** 354 Steckbrief-Seiten `/gletscher/<land>-<name>` mit eigenem Title, Description, Self-Canonical, JSON-LD (WebPage,
  Landform, BreadcrumbList) und 340–770 Wörtern Faktentext im Roh-HTML (Median 540); dazu der **Gletscher-Atlas** (`/gletscher-atlas/`, drei
  Länderseiten, 17 Regionsseiten) und `sitemap-gletscher.xml` (375 URLs, lastmod je Gletscher aus dem Datenstand).
- **Client:** Die App überschreibt Head und Canonical dieser Seiten nicht mehr und zeigt den Faktenblock im gerenderten DOM
  (zugeklappt in „Über diese Ansicht").
- **Ein Schalter:** `GLACIER_PAGES` in `scripts/seo/glacierPages.mjs` (`false` = Zustand vor GLS).

## 1. Diagnose

| Befund | Beleg |
|---|---|
| Nur `/gletscher` indexierbar, Gletscher-Pfade Canonical `/gletscher` | `routes.ts` `[GL]`-Prüfungen, `netlify.toml` `/gletscher/*` → `/gletscher.html` |
| Der Client setzt Canonical und Title aus `routes.ts` — eine vorgerenderte Einzelseite wäre nach dem Rendern wieder auf `/gletscher` gesprungen | `RouteMeta.tsx` (vorher), Google wertet den gerenderten Head |
| React ersetzt `#root`; vorgerenderter Text ist im gerenderten DOM weg | `RouteSeoBlock.tsx` Kopfkommentar (SEO-AUDIT §4) |
| Neue Shells mit `--` im Namen hätten `verify-seo` (exakt 34 Sub-Shells) gebrochen; ein Ordner `dist/gletscher/` riskiert den End-Slash-Redirect von `/gletscher` | `verify-seo.mjs` §5, `generate-seo.mjs` 4a (Kommentar „Flach statt index.html") |
| Datenlage reicht für eigenständige Seiten: 266 Gletscher mit Messreihe, Leitgletscher oder DE; 88 weitere ab 1 km² mit Inventarreihe, Höhenstufen und Projektion | `glacier/v1/static/20261012-1` (`catalog.json`, `series/`, `proj/`, `hypso/`) |
| Die deutsche Gletscherliste im Datensatz ist richtig (Watzmanngletscher drin, Südlicher Schneeferner nicht) | `catalog.json`; BAdW-Pressemitteilung 09/2022 vom 26.09.2022 |

**Recherche (Tiefenrecherche 02.11., Bericht im Chat):** Prerendering ist der größte Hebel (Bing/Copilot und KI-Crawler rendern
JavaScript schwach oder gar nicht); nur Gletscher mit eigenständigem Datenwert indexieren (Googles Regel gegen massenhaft erzeugte
Seiten ohne Mehrwert); Kurzantwort mit Zahl, Datum und Quelle unter der H1; kein hreflang bei einer Sprachfassung; `Landform` statt
eines nicht existierenden schema.org-Typs „Glacier"; FAQ-Rich-Results gibt es seit Mai 2026 nicht mehr; llms.txt ohne messbaren Effekt.
Suchvolumina sind dort **nicht** belegt (siehe V-GLS-8).

## 2. Entscheidungen (umgesetzt, Jan bestätigt beim Commit)

| Nr. | Entscheidung | Begründung |
|---|---|---|
| E-GLS-1 | Eigene Seite nur für benannte Gletscher der **Stufe A** (Leitgletscher, Längen- oder Massenreihe, alle vier deutschen) und **Stufe B** (Größenklasse A, ≥ 1 km²): 354 von 2 199 | Jede Seite trägt eigene Messwerte oder mehrere Datendimensionen; der Rest bleibt in Karte und Atlas-Tabellen |
| E-GLS-2 | Atlas als statische Seiten unter `/gletscher-atlas/` (eigener Namensraum, End-Slash wie `/wetter/`) | `/gletscher/<x>` gehört der App; Länder-Slugs dort wären Gletscher-Segmente |
| E-GLS-3 | Shell-Datei `dist/_gl/<segment>.html`, Umleitung per erzeugter `dist/_redirects` (200), `robots.txt` sperrt `/_gl/` | `_redirects` wirkt vor `netlify.toml`; kein Eingriff in die 110 Regeln dort |
| E-GLS-4 | lastmod je Gletscher = Datum der letzten Änderung seines Datensatzes (Hash im Datenstand), nie das Build-Datum | Regel aus `gitDate.mjs` (SEO-AUDIT §6) auf Daten übertragen |
| E-GLS-5 | Datenstand als Datei im Repo (`scripts/seo/data/glacier-pages.json`, 0,7 MB), erzeugt mit `npm run seo:glaciers` | Build bleibt netzfrei und deterministisch (Muster `place-modules.json`) |
| E-GLS-6 | Dataset-JSON-LD mit `license` = `/lizenzen/`, nicht „CC BY 4.0" | GLIMS hat nur eine Zitierpflicht (`seo-nischen.md` §4.2) |

## 3. Umsetzung

| Datei | Inhalt |
|---|---|
| `scripts/seo/refresh-glacier-pages.mjs` (neu) | liest den Build (lokaler Klon `--glacier=` oder raw.githubusercontent), Stufen A/B, Kennzahlen nach den Regeln von `glacierSheetModel.ts` (längste Längenreihe kumuliert mit Lücken, letzte Massenbilanz, Flächenänderung erstes → letztes Inventar, Projektion als Spanne), Summen je Land/Region, `updated` per Hash |
| `scripts/seo/data/glacier-pages.json` (neu) | Datenstand Build `20261012-1`: 354 Seiten (A 266, B 88), 990 Tabellenzeilen |
| `scripts/seo/glacierPages.mjs` (neu) | Texte und HTML: Einzelseite (Kurzantwort, Steckbrief, Längenänderung, Massenbilanz, Inventare, Projektion bis 2100, amtliche Angaben wörtlich, was der interaktive Steckbrief zusätzlich zeigt, Nachbargletscher, Wetter-Orte im Umkreis von 40 km), Atlas-Hub (Zahl je Land, amtliche Angaben, größte Gletscher, stärkster Rückzug, Massenbilanz 2024/25, Dataset), Länder- und Regionsseiten, Sitemap-Einträge, `_redirects` |
| `scripts/generate-seo.mjs` | Abschnitt 4d (Shells, Atlas, `_redirects`), Teilliste `sitemap-gletscher.xml` im Index, Atlas und Leitgletscher in der Shell von `/gletscher` |
| `scripts/seo/content.mjs` | `renderRouteRootContent(route, extraHtml)` |
| `scripts/seo/llms.mjs` | Atlas-Zeile |
| `public/robots.txt` | `Disallow: /_gl/`, `Sitemap: …/sitemap-gletscher.xml` |
| `src/seo/staticPage.ts` (neu), `src/main.tsx`, `src/router/RouteMeta.tsx` | Faktenblock vor dem ersten Render merken; auf dieser Adresse schreibt `RouteMeta` keinen Head. Nach Weiternavigation in der App gilt wieder der Head der Route, die `data-static`-JSON-LD gehen mit |
| `src/router/RouteSeoBlock.tsx`, `routeSeoBlock.css` | zeigt den vorgerenderten Faktenblock (H1 als `rsb-h1`-Absatz, die H1 trägt der Steckbrief) statt des Routentexts |
| `src/seo/routeTexts.ts` | Link „Gletscher-Atlas" im Text von `/gletscher` |
| `scripts/seo/verify-seo.mjs` | Abschnitt 9 „Gletscherseiten" + Entitäten-Prüfung für Steckbrief und Atlas |
| `scripts/seo/verify-live.mjs` | Abschnitt 4c (Steckbrief 200 + Self-Canonical, Gletscher ohne Seite → Shell der Route, Atlas, Aliase 301); Gletscher werden wie Ortsseiten gesampelt |
| `scripts/seo/indexnow.mjs` | `--match=/gletscher` |
| `package.json` | `seo:glaciers` |

**Ehrlichkeit:** Jeder Satz kommt aus den Daten; fehlt eine Größe, fehlt der Satz. Herkunft an jeder Zahl, Bezugsjahr an jeder
Fläche, Projektion nur als Spanne über 12 Klimamodelle, Schmelzindex ausdrücklich ohne Einheit, Schneegrenze als Szenenwert, amtliche
Sätze nur wörtlich mit Datum und Link. Keine Aussage über Begehbarkeit; „gibt keine Tour frei" steht wie im Routentext.

## 4. Verifikation (in einem Klon von `fa33869b`, ohne `node_modules`)

| Prüfung | Ergebnis |
|---|---|
| `generate-seo.mjs` gegen eine Test-`dist` (Vite-Shell ohne Bundles) | 354 Shells, 21 Atlas-Seiten, 375 Sitemap-URLs, 354 `_redirects`-Zeilen |
| `verify-seo` | **1 018 ok, 0 Fehler** (HEAD in derselben Umgebung: 808 ok, 0 Fehler; +210 = neuer Abschnitt 9 und Entitäten) |
| `verify-routing` | 265/274 — **dieselben 9** roten Prüfungen wie an HEAD in derselben Umgebung (Vorladelisten echter Vite-Bundles, die es in der Test-`dist` nicht gibt) |
| `tsc` auf `staticPage.ts`, `RouteMeta.tsx`, `RouteSeoBlock.tsx`, `main.tsx` mit den echten Typen von React und React Router | keine Fehler außer fehlenden Vite-Typen (`*.css`, `import.meta.env`) |
| Titel / Descriptions | 354 verschieden, Title ≤ 62 Zeichen + „ \| buscosun", Description ≤ 160 |
| Start-Chunk | `staticPage.ts` minifiziert 460 B (339 B gzip einzeln); Ratsche eagerJs 112 KB bei zuletzt 111,5 KB — **knapp**, `npm run budget` entscheidet (V-GLS-11) |

**Nicht gelaufen (Jans Build):** `npm run build` mit Vite und `tsc -b`, `npm run budget`, Browserprüfung, Real-Device. Die fünf
Selbstverifikations-Fragen: (1) Funktionserhalt — keine Funktion entfernt, die App-Ansicht `/gletscher/<x>` ist unverändert; (2) Desktop
pixelgleich — nur auf den 354 Steckbrief-Adressen ändert sich der Inhalt hinter dem Chip „Über diese Ansicht", der Chip selbst nicht;
(3) Touch-Ziele — keine neuen Bedienelemente; (4) Konsole und (5) Long Tasks — offen, Jans Browserprüfung (§82).

## 5. Nicht umgesetzt

| Punkt | Grund |
|---|---|
| Echte 404 für unbekannte Gletscher-Segmente | bräuchte alle 2 199 Segmente in `_redirects` und `/gletscher/*` → 404; ändert das Verhalten geteilter Links (V-GLS-1) |
| eigene OG-Bilder je Gletscher | Renderer (Satori/resvg) ist eine Abhängigkeit = Jans Gate (V-GLS-3) |
| Edge Function `og-meta` | STOPP-&-FRAGEN-Zone; sie überschreibt für Crawler weiter `og:*` (nicht Title/Canonical) (V-GLS-2) |
| Zenodo-DOI, Pressearbeit, Search Console, Bing | außerhalb des Repos (§82) |
| Wikidata-`sameAs` | nicht im Datensatz; nur mit geprüften Q-Nummern (V-GLS-4) |

## 6. Befunde (V-GLS)

| Nr. | Befund / Mehrwert | Skizze |
|---|---|---|
| V-GLS-1 | Unbekannte Segmente (`/gletscher/ch-gibt-es-nicht`) antworten 200 mit der Shell der Route (Soft-404) | alle Segmente in `_redirects`, danach `/gletscher/*` → `/404.html` 404; vorher klären, was geteilte Links mit Tippfehlern sehen sollen |
| V-GLS-2 | `og-meta` ersetzt für Crawler `og:title`/`og:image` der Steckbriefe durch die Share-Beschreibung (Name aus dem Slug, ohne ß/Umlaute) | in der Edge Function `og:*` unangetastet lassen, wenn die Shell `data-static-page` trägt |
| V-GLS-3 | Alle Steckbriefe zeigen die OG-Karte der Route | Karte je Stufe-A-Gletscher (Name, Fläche, letzte Messung) beim Build |
| V-GLS-4 | Kein `sameAs` auf Wikidata/Wikipedia | Q-Nummern für die bekanntesten Gletscher prüfen und als Tabelle im Datenstand führen |
| V-GLS-5 | Datenstand wird von Hand aufgefrischt | `npm run seo:glaciers` in den Workflow `glacier-static` oder nach den Berichtsterminen (GLAMOS Anfang Oktober, ÖAV März) |
| V-GLS-6 | Dataset-Search findet nur `catalog.json` (JSON) | CSV-Export und Zenodo-DOI je Jahresstand |
| V-GLS-7 | Der vorgerenderte Block blitzt bis zum App-Mount ungestylt auf (wie bei allen Shells) | kleines Inline-CSS für `#seo-fallback` |
| V-GLS-8 | Suchvolumina sind nicht gemessen; Titelmuster sind begründete Annahmen | nach 4–8 Wochen GSC-Suchanfragen je Seite exportieren, Titel nachziehen |
| V-GLS-9 | Tageswerte (Schmelzindex, letzte Szene) stehen bewusst nicht im Roh-HTML | Datum der letzten klaren Szene je Gletscher mit dem Datenstand schreiben |
| V-GLS-10 | Die fünf Schweizer Regionen sind eine Gliederung von buscosun | Kantone oder Einzugsgebiete aus den GLAMOS-Dateien |
| V-GLS-11 | eagerJs wächst um rund 0,3 KB | bei Rot: Ratsche mit Notiz anheben (Jan 30.09.) |
