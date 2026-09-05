# SEO-PLAN — priorisierte Etappen (Aufwand × Effekt)

> Stand: 2026-09-04 · Stufe 1 (Plan, wartet auf Freigabe) · erzeugt aus der Code-Inventur (drei parallele Lesungen von `src/`, `scripts/`, `public/`) und Live-Messungen gegen https://buscosun.com. Kein Code geändert, kein Commit.

Prinzipien: Ehrlichkeit bleibt Produktprinzip (keine Zahlen, die veralten; Warnungen nur als Zitat; keine
„Tornado"-Sprache; „bestätigt" nur mit Quelle). Alle Texte werden **aus dem Code abgeleitet** (Inventar),
nicht aus Alt-Doku. Jede Etappe: ein Commit `seo(E<n>): …`, danach VERIFY-Block, RUN-LOG-Eintrag.
Aufwand S/M/L (Agentenlaufzeit ≈ 0,5 h / 1–2 h / 3–4 h), Effekt ●○○ … ●●●.

## Etappe 0 · Fundament (S · ●●○)
**Ziel:** Branch, Planungsdokumente im Repo, SEO-Gate im Build, offensichtliche Text-Defekte.
**Dateien:** neu `FEATURE-INVENTAR.md`, `SEO-AUDIT.md`, `SEO-PLAN.md`, `KEYWORDS.md`, `GEO-TESTSET.md`,
`VERIFY.md`, `RUN-LOG.md`, `MANUELLE-SCHRITTE.md` (Repo-Wurzel); `package.json` (`build` ruft
`verify:seo` + `verify:routing` nach dem Generator; `verify:seo`-Alias bleibt); `.github/workflows/ci.yml`
(Schritt ergänzen, falls `build` dort läuft); `src/router/routes.ts` (Waldbrand-Meta ohne zurückgezogene
Layer; Wetterkarten-Lead ohne Versprechen, das das Erstbild nicht hält); `public/llms.txt` (138 Orte,
Go/No-Go-Link auf künftigen kanonischen Pfad erst in E7 — hier nur Zahl korrigieren);
`docs/seo-geo/context.md` + `measurement.md` (`.app` → `.com`, „Hash-Routing" → RT1) — Doku-Hygiene.
**Abnahme:** `npm run build` grün und bricht bei absichtlich entferntem H1 (Negativ-Kontrolle) ab;
`verify:routing` grün; RUN-LOG hat Eintrag E0.
**Rollback:** `git revert` des Etappen-Commits; keine Laufzeitwirkung.

## Etappe 1 · Kanonik & Ebene B (M · ●●●)
**Ziel:** Jede Sitemap-URL liefert im Roh-HTML ihr eigenes Title/Canonical/H1/Lead; Datenpfade und
Bundles sind vom Index ausgeschlossen, bleiben aber für Googlebot ladbar (Rendering).
**Maßnahmen / Dateien:**
1. **Sub-Routen-Shells**: `scripts/generate-seo.mjs` erzeugt je Sub-Route eine flache Datei
   `dist/<route>--<slug>.html` (Bindestrich-Doppel, damit „Pretty URLs" nicht greifen) mit eigenem
   `<title>`, Description, Canonical, OG, BreadcrumbList (Eltern → Sub) und crawlbarem `#root`
   (H1 = Sub-Titel, Lead ≥ 60 Wörter, Absatz „Was diese Ansicht zeigt / Quelle / Abdeckung DE-AT-CH /
   Grenzen", Links zur Elternroute, zu Geschwister-Sub-Routen, passendem Explainer, `/wetter/`).
   Textquelle: neue **reine** Datei `src/map/layerCatalog.ts` (Verschiebung von `LAYER_OPTIONS`-Tooltips
   und `layerExtNote`-Texten aus `MapView.tsx` als Daten, `MapView.tsx` importiert sie zurück — reine
   Umgruppierung, keine Funktionsänderung; `README`-Kommentar, dass Node die Datei per strip-types lädt).
   Für Atmosphäre-Linsen und Brand-Sichten kommen die Texte aus `routes.ts` (erweitert um `lead`/`body`
   je SubRoute).
2. `netlify.toml`: je Sub-Route eine 200-Regel **vor** der `/<route>/*`-Regel (25 Regeln, generiert;
   `scripts/verify-routing.mjs` erweitert: „jede indexierbare Sub-Route hat genau eine Shell-Regel").
   Unbekannte Sub-Slugs behalten die Eltern-Shell (bleibt `noindex` per Client, wie heute).
3. **Ebene B** — `public/robots.txt`: `Disallow:` für `/_dwd_opendata/ /_meteoalarm/ /_gfs/ /_cscs/ /_mf/
   /_ecmwf/ /_firms /_dwd_wind /_dwd_grib /params/ /fire/ /countries/ /globe/ /wind/ /latest-grib.json
   /latest-wind.json /climaGrid.json /nowcasterWeights.json /sw.js` für **alle** UAs; **`/assets/` bewusst
   NICHT disallowen** (s. Zielkonflikt Z1). Zusätzlich `[[headers]]` in `netlify.toml`:
   `X-Robots-Tag: noindex, nofollow` für `/assets/*`, `/_*`, `/params/*`, `/fire/*`, `/countries/*`,
   `/globe/*`, `/wind/*`, `/*.json`, `/sw.js`, `/_og-card.html`; `Cache-Control: public, max-age=31536000,
   immutable` für `/assets/*` (gehasht; SW-Zweig `ASSET_RE` ist damit konsistent);
   `Content-Type: application/manifest+json` für `/manifest.webmanifest`. **Keine** Änderung an Edge
   Functions, Rewrites oder Crons (STOPP-Liste).
4. `scripts/seo/content.mjs`: hreflang-Block entfernen (`<html lang="de">` bleibt); Sitemap-`lastmod`
   aus Inhalt (`dateModified` je Explainer/Tool/Event/Rechtsseite; Orte = Datum der letzten Änderung von
   `places.mjs`/`content.mjs` per `git log -1 --format=%cs`; App-Routen = letzte Änderung von
   `routes.ts`), `changefreq` entfernen; `sitemap-news.xml` nur erzeugen, wenn ≥ 1 Artikel ≤ 2 Tage
   (sonst Datei weglassen und `robots.txt`-Zeile bedingt — Vorschlag 7 des Vor-Audits).
**Abnahme:** `curl -A Googlebot` auf allen 25 Sub-Routen liefert eigenes `<title>` + Self-Canonical;
`/_dwd_opendata/` und `/assets/index-*.js` tragen `X-Robots-Tag: noindex`; `robots.txt` enthält die
Disallows und weiter `Allow: /` für Seiten; JS bleibt für UA Googlebot abrufbar (200); Sitemap ohne
`changefreq`, `lastmod` je URL plausibel (nicht alle gleich); `verify:routing`/`verify:seo` grün;
Deploy-Preview: Karte lädt, Konsole sauber, SW aktualisiert Assets (Version-Bump `v5` in `sw.js`,
weil Cache-Control-Semantik sich ändert).
**Rollback:** Commit revert; `sw.js` Version zurück; Netlify-Regeln sind rein additiv.

## Etappe 2 · Gerenderter Inhalt & interne Verlinkung (M · ●●●)
**Ziel:** Nach dem App-Mount tragen alle App-Routen H1, Lead, Beschreibung und echte Links; die statischen
Seiten hängen im gerenderten Graphen.
**Maßnahmen / Dateien:**
1. Neue Komponente `src/router/RouteSeoBlock.tsx`: rendert `h1` + Lead + Absätze + Linkliste aus
   `routes.ts`/`layerCatalog.ts` (dieselbe Quelle wie die Shell). Platzierung ohne Desktop-Regression:
   **Desktop** als zusätzliche Karte „Über diese Ansicht" am Ende der bestehenden Readout-Spalte
   (Wetterkarte/Warnungen), im Dock-Fuß (Brandradar), unter dem Idle-Intro (Tourenplanung, Atmosphäre,
   Event, Archiv, Vorhersage, Regenradar, Globus); **Mobil** im jeweiligen Sheet/Layer-Tab. Kein
   `display:none`, keine `visually-hidden`-Tricks (Cloaking-Risiko); Schrift/Abstände aus den
   Command-Deck-Tokens. Die heutige `<h1>`-lose Seite bekommt damit genau eine H1 (Kartenkopf zeigt
   weiter die Wortmarke).
2. `src/nav/featureRail.tsx`: Rail-Einträge als `<Link to>` (react-router) statt `<button>` mit
   identischer Klasse/Optik; `onClick`-Verhalten (Warm-up, Sheet schließen) bleibt im Link-Handler.
   Gleiches für die Startseiten-Kacheln (`SearchPage.tsx`), falls dort Buttons sind.
3. `src/SearchPage.tsx` Footer: Links zu `/wetter/`, `/wissen/`, `/funktionen/`, `/wetterlage/`,
   `/lizenzen/`, `/impressum/`, `/datenschutz/`, `/kontakt/` (später `/glossar/`, `/methodik/`, `/fuer/`).
4. `src/pointForecast/PointForecastPanel.tsx`: Zeile „Mehr über das Wetter in <Ort> →" auf
   `/wetter/<slug>/`, wenn der gesuchte Ort in `places` liegt (Slug-Liste als kleines JSON aus
   `places.mjs` generiert nach `src/router/placeSlugs.json`, ≤ 5 KB).
5. Layer-Readout-Karten (`LayerInfoPanel`) bekommen einen Link „Erklärung: <Explainer>" wo vorhanden.
**Abnahme:** Playwright auf Preview (mobil 390×844 + Desktop 1440×900): jede App-Route hat genau 1 H1,
≥ 120 Wörter Text, ≥ 8 interne `<a href>`; Desktop-Screenshots der Karte vor/nach pixelgleich **oberhalb**
der neuen Karte (Diff-Bild im RUN-LOG); Touch-Targets ≥ 44 px; Konsole sauber; `verify:routing` grün.
**Rollback:** Commit revert (rein additive UI).

## Etappe 3 · Entitäten, Vertrauen, Methodik (M · ●●○)
**Ziel:** buscosun als eine Entität mit nachvollziehbarer Methodik (E-E-A-T, GEO).
**Maßnahmen / Dateien:**
1. `scripts/seo/content.mjs`: `@id`-Graph — `Organization#organization`, `WebSite#website`
   (`publisher`), jede Seite `isPartOf`, `Dataset.creator {@id}`, `Place` ↔ `Dataset.spatialCoverage`,
   `BreadcrumbList` mit `@id`. DWD-Etikett → „DWD (GeoNutzV)"; `Dataset.license` DE → erreichbare
   DWD-Rechtshinweis-URL (beim Build per HEAD geprüft, sonst Fallback ohne `license`).
2. Neue statische Seiten (Generator + `scripts/seo/pages.mjs`): `/ueber/` (Was ist buscosun, wer betreibt
   es — Betreiberdaten aus `legal.mjs`, nie erfunden — Grundsätze D-02/D-04, Quellen), `/ohne-tracker/`
   (überprüfbar: Liste der 25 Origins, localStorage-Schlüssel, keine Cookies; aus V-SEO-12),
   `/methodik/` Hub + 8 Seiten: `hoehenkorrektur`, `punktvorhersage-quellenmix`, `regenradar-nowcast`,
   `konfidenz-und-trefferquote`, `event-bewertung`, `tourenplanung-zeitmodell`, `e-bike-reichweite`,
   `brandradar-detektion-und-brandnarben`, `wettermodelle` (Tabelle aus `modelCatalog.ts` wie
   `/lizenzen/`). Jede ≥ 500 Wörter, aus dem Code belegt (Konstanten, Schwellen, Grenzen), mit
   „Grenzen"-Abschnitt, `TechArticle` + `BreadcrumbList` JSON-LD.
3. `/validierung`: `noindex` entfernen, Route-Shell mit erklärendem Lead (Metriken, Grenzen), Link aus
   `/methodik/konfidenz-und-trefferquote/`.
**Abnahme:** JSON-LD aller Seiten parsebar, jeder `@id` genau einmal definiert (Verifier-Check), kein
`CC BY 4.0` neben „DWD"; neue Seiten in Sitemap; `verify:seo` prüft ≥ 500 Wörter für `/methodik/*`.
**Rollback:** Commit revert.

## Etappe 4 · Content-Reife bestehender Seiten (L · ●●●)
**Ziel:** Keine `noindex`-Gerüste mehr; die drei größten Features haben tragfähige Landingpages.
**Dateien:** `scripts/seo/explainers.mjs` (7 Stubs → `full`, je ≥ 450 Wörter, 3 Abschnitte, 4 FAQ,
Quellen, DACH-Asymmetrie), `scripts/seo/tools.mjs` (7 Stubs → `full`, je ≥ 400 Wörter, Ablauf in
Schritten als Fließtext, „Was es nicht kann", 3 FAQ, Deep-Link), `public/og/` (14 neue PNGs via
`_og-card.html` + Playwright-Screenshot), `docs/seo-geo/og-images.md` fortschreiben.
Inhaltliche Leitplanken: Thermik-/Schneefallgrenze-/Gewitter-Texte nur mit den im Code umgesetzten
Größen (LPI, CAPE×CIN, KONRAD); Biowetter ehrlich (kein Biowetter-Feature — Föhn/UV/Pollen mit
DE-Grenze); „Arbeitsfenster" mit den echten Grenzwert-Konstanten aus `gonogo.ts`.
**Abnahme:** 0 `stub` in beiden Dateien; Sitemap +14 URLs; `verify:seo` Wortzahl-Checks; RSS aktualisiert.
**Rollback:** Commit revert (Seiten fallen auf `noindex` zurück).

## Etappe 5 · Neue Explainer + Glossar (L · ●●●)
**Ziel:** Kopf- und Long-Tail-Keywords aus KEYWORDS, die kein Explainer deckt.
**Dateien:** `explainers.mjs` +15: `fire-weather-index`, `waldbrandwarnstufen-de-at-ch`,
`thermalanomalien-firms`, `goldene-blaue-stunde`, `lichtverschmutzung-bortle`, `klimastreifen`,
`kenntage-hitzetage-frosttage`, `wachstumsgradtage-heizgradtage`, `trockenperioden`, `talwind`,
`skew-t`, `gewitterzellen-konrad`, `hagel-meshs-poh`, `regenradar-radolan-inca-rzc`,
`windgrenzwerte-arbeit-drohne`. Neu `scripts/seo/glossary.mjs` → `/glossar/` (eine Seite mit ≥ 60
Begriffen als `dl`, Anker je Begriff, `DefinedTermSet`/`DefinedTerm` JSON-LD) — Begriffsliste aus den
Inventar-Fachbegriffen (FWI, FRP, dNBR, MESHS, POH, KONRAD, LPI, CAPE/CIN, Lapse-Rate, Inversion,
Bortle, GDD/HDD, RADOLAN-RV, INCA, rzc, MOSMIX, ICON-D2 …). OG-Bilder wie E4.
**Abnahme:** 15 neue `full`-Explainer + `/glossar/` in Sitemap; jeder Glossar-Eintrag ≥ 40 Wörter;
Explainer verlinken Glossar und Ziel-Sub-Route; `verify:seo` grün.
**Rollback:** Commit revert.

## Etappe 6 · Zielgruppen-Landingpages `/fuer/` (L · ●●●)
**Ziel:** Jede Zielgruppe aus KEYWORDS hat eine Seite, die ehrlich sagt, was buscosun für sie kann und
was nicht, mit Deep-Links in die passenden Ansichten.
**Dateien:** neu `scripts/seo/audiences.mjs` + Renderer in `content.mjs`; 16 Seiten:
`gleitschirmflieger`, `bergsport`, `radsport`, `e-bike`, `segler`, `drohnenpiloten`, `bau-und-kran`,
`landwirtschaft`, `veranstalter`, `hochzeit`, `fotografen`, `astronomie`,
`feuerwehr-katastrophenschutz`, `wetterfuehlige`, `allergiker`, `wintersport`; Hub `/fuer/`.
Struktur je Seite: Direktantwort (40–60 Wörter), „So nutzt du buscosun" (3–5 Schritte mit Deep-Links),
„Was buscosun hier **nicht** kann" (aus `docs/zielgruppen-dach.md` Teil C und Code), FAQ (4),
verwandte Explainer/Methodik, `WebPage` + `FAQPage` + `BreadcrumbList`. Wortzahl ≥ 500.
Verlinkung: Startseiten-Footer, Hub, passende Explainer, RouteSeoBlock der jeweiligen Ansicht.
**Abnahme:** 16 + Hub in Sitemap; jede Seite hat den Negativ-Abschnitt (Verifier-Regex „nicht");
OG-Bilder vorhanden.
**Rollback:** Commit revert.

## Etappe 7 · Neue App-Sub-Routen (M · ●●○) — enthält Code in `src/`
**Ziel:** Fachlich eigenständige Ansichten bekommen kanonische Pfade.
**Dateien:**
1. `src/router/routes.ts`: Atmosphäre-Sub `arbeitsfenster` (Lens `section`, Ansicht `gonogo`);
   Waldbrand-Subs `historie` (Preset `bh=season`, Reiter Brände) und `thermalanomalien` (Preset
   `fireAnomalies` + `ta=1`); Event-Subs je Anlass (`grillen`, `hochzeit`, `wandern`, `drohne`,
   `fotografie`, `sterne`, `radtour`, `picknick`, `laufen`, `baden`) mit Vorauswahl des Anlasses im
   Wizard. `src/router/pages/AtmosphereRoute.tsx` (Slug ↔ `ansicht`), `src/fire/fireRouteView.ts`
   (+2 Slugs ↔ Zustand; minimaler Eingriff, da `src/fire` uncommitted Änderungen trägt — nur
   Slug-Tabelle + `fireViewFromState`), `src/event/EventPage.tsx` + `eventState.ts` (Anlass aus
   Pfadparameter, `subParam: 'view'`), `netlify.toml` + Generator (Shells wie E1), `public/llms.txt`
   (Go/No-Go-Link auf `/atmosphaere/arbeitsfenster`), Tool-Seite `arbeitsfenster` Deep-Link.
2. Alte Query-/Hash-Formen bleiben gültig (Funktionserhalt); Canonical zeigt auf den neuen Pfad.
**Abnahme:** `verify:routing` grün (Sub-Routen-Zähler aktualisiert), Preview: `/eventplanung/hochzeit`
öffnet Wizard mit Anlass vorgewählt; `/waldbrand/historie` zeigt Saison; `/atmosphaere/arbeitsfenster`
zeigt Go/No-Go; Zurück-Navigation ohne Remount-Schleife; `verify:fire-detail` unverändert grün.
**Rollback:** Commit revert; keine Datenpfad-Änderung.

## Etappe 8 · Ortsseiten v2 (L · ●●○)
**Ziel:** 138 Seiten werden vom Landingpage-Muster zum Nachschlagewerk (G1/G2 des Vor-Audits).
**Dateien:** `scripts/seo/content.mjs`, neu `scripts/seo/climate.mjs` (liest `public/climaGrid.json`:
harmonische Koeffizienten der 178 DWD/Meteostat-Stationen 1995–2024 → je Ort per k-NN + Lapse-Korrektur
Monatstabelle Ø Tmax/Tmin/Regenwahrscheinlichkeit; klar gelabelt „Klimatologie 1995–2024 aus
Stationsdaten, höhenkorrigiert — Schätzung, keine Messreihe des Ortes"), Block „Sonnenzeiten"
(Sonnenauf-/-untergang, goldene/blaue Stunde heute **berechnet zur Build-Zeit für den Build-Tag** +
Link in die Event-Planung — oder alternativ als Monatstabelle, weil Build-Datum sonst veraltet:
**Entscheidung: Monatstabelle je 15. des Monats**, zeitlos gültig), Block „Was wir für <Ort> nicht
wissen" (Radar-Horizont je Land, Pollen/UV/Warnungen je Land, Lawinen), je Ort **eigene** Description
(Template mit Höhe, Region, Klimakennzahl), Deep-Links zu Regenradar/Archiv/Event/Atmosphäre mit
Ort-Parametern. Optional (nur wenn Zeit): Tier 2 `places.mjs` +60 Orte (Kreisstädte/Tourismusorte
DACH mit Höhe aus DEM-Datei — muss offline aus `meteostatStations.ts`/kuratierter Liste kommen).
**Abnahme:** Stichprobe 10 Orte: Klimatabelle plausibel gegen Meteostat-Normalwerte (±1,5 K), Descriptions
paarweise verschieden (Verifier), `Dataset` JSON-LD um `temporalCoverage 1995/2024` ergänzt; Wortzahl
je Ort ≥ 650.
**Rollback:** Commit revert.

## Etappe 9 · GEO-Schicht (S · ●●○)
**Dateien:** `public/llms.txt` v2 (Abschnitte je Land „Quellen und Grenzen", Zitierhinweis, Links auf
Explainer/Methodik/Glossar/`/fuer/`, Datum), neu `public/llms-full.txt` (Volltext aller `full`-Explainer,
Methodik, Glossar, Zielgruppen-Seiten, Orts-Faktensätze — generiert), `feed.xml` um Methodik/Zielgruppen
ergänzt, `robots.txt` Sitemap-Zeilen unverändert; `sitemap.xml` splitten in `sitemap-index.xml` +
`sitemap-pages.xml`/`sitemap-orte.xml` (Übersicht in GSC). `Article.speakable` für Direktantworten.
**Abnahme:** `llms-full.txt` ≤ 2 MB, UTF-8, Links absolut; Sitemap-Index valide (XML-Parse im Verifier).
**Rollback:** Commit revert.

## Etappe 10 · Abschluss (S)
Gesamt-VERIFY auf dem Deploy-Preview (alle Blöcke), Lighthouse mobil für 6 Seitentypen (falls
Chrome-DevTools verfügbar; sonst Playwright-Metriken), `MANUELLE-SCHRITTE.md` finalisieren, `RUN-LOG.md`
Vorher/Nachher-Tabelle, Abschlussbericht. Kein Merge nach `main` (Jans Gate).

**Gesamt: 11 Etappen (E0–E10), 11 Commits.**

### Bewusst NICHT im Plan (und warum)
- Kein Framework-Wechsel/SSR (bestehender Generator reicht; Entscheidung 0.1 des Vor-Audits).
- Keine Änderung an WebGL/Shadern, Fusion, Edge Functions, Crons, Rewrites (STOPP-Liste) — daher keine
  Origin-/Referrer-Prüfung der Proxys (s. Z2) und keine INP-Optimierung der Karte.
- Kein `/assets/`-Disallow (Z1), keine Wettbewerber-Vergleichsseiten („buscosun vs Windy" — dünn, rechtlich
  heikel), kein englischer Content (O-05 offen), keine Backlink-/PR-Maßnahmen (extern → MANUELLE-SCHRITTE),
  kein IndexNow-Push (kostenlos, aber Registrierung/Key-Datei = Jans Entscheidung; vorbereitet in
  MANUELLE-SCHRITTE), keine Google-News-Einreichung (ohne Redaktionsrhythmus sinnlos).

---

---

# MANUELLE-SCHRITTE (Vorbereitung; wird in Etappe 10 als eigene Datei finalisiert)

1. **Google Search Console + Bing Webmaster Tools**: Property `https://buscosun.com` (Domain-Property per
   DNS-TXT) verifizieren; `sitemap-index.xml` einreichen; nach 2 Wochen „Seiten"-Bericht: Zahl indexiert
   vs. eingereicht (Ziel ≥ 80 %), „Duplikat — Google hat andere kanonische Seite" muss für Sub-Routen
   verschwinden.
2. **Rich-Results-Test** für je eine URL je Seitentyp (Liste wird in E10 erzeugt).
3. **Netlify**: prüfen, ob Deploy-Previews/Branch-Deploys aktiv sind (Voraussetzung des Laufs); Log-Drain
   (Enterprise) = einzige Möglichkeit für Crawler-Log-Messung — sonst bleibt `parse-crawler-logs.mjs`
   ungenutzt; Netlify Analytics ($9/Monat, serverseitig, tracker-frei) als Option benennen.
4. **AI-Sichtbarkeit**: GEO-TESTSET monatlich in ChatGPT/Perplexity/Claude/AI Overviews abfragen, Ergebnis
   in die Log-Tabelle (Vorlage in GEO-TESTSET.md).
5. **Entitäten**: Wikidata-Item „buscosun" (Software, Website, Betreiber, Lizenzquellen), Einträge in
   AlternativeTo/Product-Hunt-artigen Verzeichnissen, GitHub-Repo-Beschreibung/README-Link (falls
   öffentlich), DWD-/GeoSphere-Community-Erwähnung nur wo Regeln es erlauben (`seeding-kit.md`).
6. **IndexNow** (optional, kostenlos): Key-Datei ablegen + einmaliger `curl`-Ping der Sitemap-URLs an
   `api.indexnow.org` — Vorlage wird bereitgestellt.
7. **Impressum**: Platzhalter in `scripts/seo/legal.mjs` prüfen (Build warnt, falls unvollständig).
8. **Entscheidung Origin-/Referrer-Prüfung der Proxys** (Edge-Function-Änderung, STOPP-Liste) — s. Z2.
9. Merge `seo-geo-2026` → `main` und Prod-Deploy = Jans Gate.

---

---

# Zwei-Ebenen-Zielkonflikte (explizit)

- **Z1 · JS-Bundles fernhalten vs. Google-Rendering.** Ein `Disallow: /assets/` würde Googlebot am Laden
  der Bundles hindern; die SPA-Routen würden nur aus dem Roh-HTML indexiert (das nach E1/E2 tragfähig ist),
  aber Google meldet „blockierte Ressourcen", Mobile-Friendly-Prüfungen scheitern, und AI-Crawler, die
  rendern, sehen die Karte nicht. **Entscheidung im Plan:** Bundles bleiben abrufbar, tragen aber
  `X-Robots-Tag: noindex, nofollow` (erscheinen nie als Suchtreffer). Datenpfade, Manifeste, Proxys und
  Artefakte werden per `robots.txt` **und** Header ausgeschlossen. Reversibel per Etappe 1.
- **Z2 · Proxy-Missbrauch vs. STOPP-Liste.** Die offenen Rewrites (`/_dwd_opendata/*` u. a.) lassen sich
  ohne Edge Function nicht an Origin/Referer binden. `robots.txt` hält nur höfliche Bots fern. Eine echte
  Abschottung braucht eine Edge-Function-Änderung → Jans Gate (MANUELLE-SCHRITTE Nr. 8). Der Plan setzt
  nur die reversible Hälfte um.
- **Z3 · Sichtbarer SEO-Block vs. „Desktop pixelgleich".** E2 fügt jeder App-Route eine sichtbare
  Textkarte hinzu; versteckter Text wäre Cloaking. Platzierung am Ende bestehender Spalten/Sheets hält den
  Kartenbereich pixelgleich (V-7), ändert aber die Seite unterhalb. **Annahme:** akzeptiert, weil die
  Anforderung Funktionserhalt und Kartenbereich meint; falls nicht, entfällt E2 Punkt 1 (dann bleibt
  Google nur das Roh-HTML — messbar schlechter).
- **Z4 · „Keine Live-Zahlen" vs. Zitierfähigkeit.** Bleibt: Ortsseiten nennen nur zeitlose
  Klimatologie/Sonnenzeiten (E8), keine Vorhersagewerte.
- **Z5 · Ehrlichkeit vs. Keyword-Volumen.** Seiten für Feuerwehr, Lawinen, Wellen, Milchstraße werden mit
  ausdrücklichen Negativ-Auskünften gebaut („kein Einsatzsystem", „kein Lagebericht", „keine Wellenhöhe").
  Das kostet Klicks und gewinnt Zitate — bewusst so.

---

---

# Freigabe-Zusammenfassung

- **Etappen:** 11 (E0–E10), je ein Commit auf `seo-geo-2026`, Prüfung auf Netlify-Deploy-Preview.
- **Geschätzte Laufzeit:** 12–18 h Agentenzeit (Content-Etappen E4–E6/E8 dominieren; ~60 neue Seiten
  ≥ 400 Wörter, 138 Ortsseiten-Erweiterung, ~45 OG-Bilder).
- **Risiken:** (1) `MapView.tsx`-Umgruppierung von Layer-Texten in eine reine Datei (5 500-Zeilen-Datei,
  uncommitted Bestand) — mitigiert durch reine Verschiebung + `verify:layer-matrix`; (2) `src/fire` trägt
  uncommitted Änderungen → E7 fasst nur `fireRouteView.ts`/`routes.ts` an; (3) Netlify-Regelzahl +~40
  (Limit weit entfernt, aber Reihenfolge kritisch — Verifier); (4) Cache-Control `immutable` ändert
  SW-Interaktion → SW-Version-Bump + Preview-Test; (5) OG-Rendering braucht Playwright-Screenshots von
  `_og-card.html` (lokal, kein Netzdienst); (6) Content-Fehler (Fachlichkeit) — jede Zahl/Schwelle kommt
  aus Code-Konstanten mit Pfadangabe im RUN-LOG; (7) ohne GSC bleibt Index-Wirkung unbelegt.
- **Unklarheiten:** Sind Deploy-Previews für Branch-Pushes aktiv? Ist `buscosun.app` registriert (301)?
  Ist das Repo öffentlich (für `/ohne-tracker/`-Nachweis und Wikidata)? Betreiberdaten im Impressum
  vollständig? Soll `/wetterlage/` redaktionell weiterlaufen (sonst News-Sitemap/NewsArticle abschalten —
  Plan: abschalten, wenn 0 aktuelle Artikel)?
- **Annahmen im autonomen Lauf:** Deutsch, DACH, keine EN-Seiten · Sichtbarer SEO-Block laut Z3 ·
  `/assets/` nicht disallowed (Z1) · keine Edge-Function-/Cron-/Rewrite-Änderung · `improvements.md`
  fehlt → V-Einträge landen als Abschnitt in `SEO-PLAN.md` (D-28-konform, bis die Datei zurück ist) ·
  Sitemap `lastmod` per `git log` · `sitemap-news.xml` entfällt bei 0 aktuellen Artikeln · `/validierung`
  wird indexierbar · Tier-2-Orte nur, wenn Zeit bleibt · Impressum-Platzhalter werden **nie** erfunden
  (Build-Warnung bleibt sichtbar) · kein Merge nach `main`, kein Prod-Dispatch.
<<<<<<< HEAD
=======

---

# Entscheidungen Jans zur Freigabe (2026-09-05)

| Frage | Antwort | Wirkung im Lauf |
|---|---|---|
| Deploy-Previews | automatisch je Pull Request gegen `main` | Branch pushen, PR (Draft) öffnen, `deploy-preview-<Nr>--<site>.netlify.app` prüfen |
| `buscosun.app` | vermutlich nicht registriert, nicht relevant | keine Migrationsschritte; letzte Nennungen in Alt-Doku auf `.com` gesetzt (E0) |
| Repo öffentlich | nein | `/ohne-tracker/` ohne „Quelltext offen"; kein Repo-Link in Wikidata |
| Impressum | Jan füllt am Ende | Build-Warnung bleibt; `/ueber/` nennt keinen Betreiber, verweist auf `/impressum/` |
| `/wetterlage/` | weiterführen, neuer Saisonbericht | E5 ergänzt Artikel „Waldbrandsaison 2026 DACH — Zwischenbilanz" aus `public/fire/bh/*` |
| Stufe 2 | freigegeben | Lauf E0–E10 ohne Zwischenstopps |

# V-Einträge (D-28; `improvements.md` fehlt im Arbeitsverzeichnis — hier geführt, bis die Datei zurück ist)

| V | Mehrwert (für Jan) | Umsetzungsskizze | Status |
|---|---|---|---|
| V-SEO-15 | Jede Layer-/Linsen-/Brand-Sicht ist eine eigene Google-Seite statt Duplikat der Elternseite | Sub-Routen-Shells + Netlify-Regeln aus `routes.ts` generiert | E1 |
| V-SEO-16 | Google sieht nach dem App-Start Text und Links, nicht nur die Karte | `RouteSeoBlock` + Rail als Links | E2 |
| V-SEO-17 | Bots können die Wetterdaten-Proxys nicht mehr als Spiegel von opendata.dwd.de missbrauchen | robots-Disallow + `X-Robots-Tag`; Origin-Guard = Edge Function (Jans Gate) | E1 / offen |
| V-SEO-18 | Zweitbesuche laden gehashte Bundles aus dem Browser-Cache statt neu | `Cache-Control: immutable` für `/assets/*` | E1 |
| V-SEO-19 | Suchmaschinen und KI erkennen buscosun als eine Entität mit Methodik | `@id`-Graph, `/ueber/`, `/methodik/` | E3 |
| V-SEO-20 | Zielgruppen finden eine Seite, die ehrlich sagt, was für sie geht und was nicht | `/fuer/<gruppe>/` | E6 |
| V-SEO-21 | Ortsseiten beantworten Klimafragen zeitlos statt nur zu verlinken | Klimatabelle aus `climaGrid.json`, Sonnenzeiten je Monat | E8 |
| V-SEO-22 | Tote Knöpfe („Als Event", „Tagesablauf", „Speichern" in der Tour; „Link teilen" in der Atmosphäre) irritieren Nutzer und Crawler | verdrahten oder entfernen — **nicht Teil dieses Laufs**, Jans Entscheidung (Funktionserhalt) | offen |
| V-SEO-24 | `verify:route-3d` scheitert in CRLF-Checkouts (autocrlf) an einem LF-String-Vergleich — falsches Rot auf Windows-Worktrees | `viewSrc12.replace(/
/g, "
")` im Verifier | offen (nicht Teil dieses Laufs, fremde Linie) |
| V-SEO-25 | `llms.txt` behauptete, der Globus zeige gebündelte Beispieldaten — er liest GFS live per HTTP-Range (`src/globe/gfs.ts`); die Falschaussage verschenkte ein Feature gegenüber KI-Crawlern | Zeile korrigiert; `llms.txt` wird seit E9 aus dem Build erzeugt, damit sie nicht wieder driftet | E7/E9 |
| V-SEO-26 | `llms.txt` sprach von „amtlichen Landesstufen" — zwei der gemeinten Layer sind zurückgezogen, und Österreich hat gar keine offene Stufe | genaue Formulierung: nationale Skalen von DWD und BAFU, AT-Lücke benannt | E7 |
| V-SEO-27 | Linktext auf allen statischen Seiten erreichte nur 3,03:1 Kontrast (Lighthouse gemessen), gefordert sind 4,5:1 — betrifft auch die Bestandsseiten | eigener Token `--terra-ink #96521F` (5,52:1) nur für Linktext; Akzentfarbe unverändert | E10 |
| V-SEO-28 | Die 14 statischen Seitenvorlagen hatten keinen `main`-Landmark — Screenreader und agentische Browser finden den Inhaltsbereich nicht | `<div class="wrap">` → `<main class="wrap">`, gleiche CSS-Klasse, keine Layoutänderung | E10 |
| V-SEO-29 | Auf jeder Ortsseite zeigten die sechs Funktions-Knöpfe **alle auf `/`** — sechs gleich aussehende Links ohne Ziel | acht Deep-Links in die passende Ansicht, mit dem Ort in der Query | E8 |
| V-SEO-30 | `scripts/generate-seo.mjs` ist nicht idempotent: ein zweiter Lauf ohne `vite build` leitet die Route-Shells aus der bereits angereicherten `index.html` ab und meldet 196 falsche Fehler | Bedienhinweis im RUN-LOG; sauberer wäre ein Rohshell-Snapshot vor der Anreicherung | offen |
| V-SEO-31 | `npm run budget -- --update` hebt pauschal ALLE Metriken um 5 % an und löscht die Begründungs-Notiz — aus einer bewussten Ratsche wird unbemerkt eine Blanko-Erhöhung | Grenzen von Hand gesetzt; Warnhinweis steht jetzt in `budget.json` | E7 (dokumentiert) |
| V-SEO-32 | `src/fusion/modelCatalog.ts` führt für die DWD-Modelle `license: CC-BY-4.0`, die Seiten nennen seit E3 GeoNutzV — zwei Wahrheiten im selben Repo | eine Zeile je DWD-Eintrag; Fusions-Datei ⇒ STOPP & FRAGEN, deshalb im Lauf nicht angefasst | offen (Jans Gate) |
| V-SEO-23 | `wedding` nutzt das Default-Bewertungsprofil, obwohl der Anlass eigene Phasen hat | eigenes Profil in `eventScoring.ts` — fachliche Entscheidung, nicht SEO | offen |
>>>>>>> b35e8525fec3332340576fed27aa2ce070a07b6c
