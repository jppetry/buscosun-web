# Phase FX-UI — buscosun Fusion erklären: Vorschau auf der Startseite + Detailseite `/buscosun-fusion`

> Stand: 02.11.2026 · Flag `FUSION_EXPLAINER_LIVE = false` · Entscheidungen E-FXU-n (Jan, 02.11.2026), Befunde V-FXU-n.
> Visuelle Vorlage: Design-Canvas `https://claude.ai/artifact/AHp3qmKoQwXrdsKVaMPheA` (Artboards „Startseite · Vorschau", „Detailseite", Desktop 1440 px / Mobil 390 px). Verbindlich ist der Auftrag, der Canvas ist die Bildvorlage.

## 0. Auftrag in einem Satz

Nutzer sollen verstehen, WAS das Postprocessing „buscosun Fusion" tut, ohne dass wir offenlegen, WIE es abgestimmt ist. Zwei Teile: (A) eine kompakte Vorschau, die den Block „Fundament · Fusion Forecast" auf der Startseite ersetzt, (B) eine Detailseite `/buscosun-fusion`. Kein Eingriff in den Motor, keine Datenprodukte, keine neue Abhängigkeit.

## 1. Entscheidungen

| Nr | Entscheidung (Jan, 02.11.2026) |
|---|---|
| E-FXU-1 | Detailseite = In-App-Route `/buscosun-fusion` (Command-Deck, Lazy-Chunk) mit Routentext für die statische Shell. `/methodik/punktvorhersage-quellenmix/` bleibt unberührt (Folgephase). |
| E-FXU-2 | Ständeleiste auf der Detailseite. Neues Anzeigefeld `publicLabel?: string` an `FusionRelease` + Konstante `FUSION_BASE_PUBLIC_LABEL`; der Motor liest beides nie. `verify:fusion-release` prüft: jeder Eintrag hat ein nicht leeres `publicLabel` ≤ 50 Zeichen. Das ist die einzige Änderung in `fusionRelease.ts`. |
| E-FXU-3 | Farben wie im Canvas: Eyebrows/Kicker `#7A6548` (5,0 : 1 auf dem Glas), Pill-Text `#8F4E22` auf terracotta-50. |
| E-FXU-4 | Flag: `FUSION_EXPLAINER_LIVE = false`; `?fx=1` zeigt Vorschau + Route, `?fx=0` erzwingt den alten Block. Die Route existiert nur mit Flag. Jan schaltet nach der Sichtprüfung. |

## 2. Diagnose (Schritt 1) — wie die Dinge heute laufen

### 2.1 Kacheln und Navigation

- `src/SearchPage.tsx`: `FEATURE` (Zeile 84) ist die einzige Quelle der Feature-Ziele (`{ id, eyebrow, title }`). Jede Kachel entsteht in `makeTile()` (Zeile 303) als **echter Link** `<a href={pathForFeature(feature.id)}>`; ein einfacher Klick (`button 0`, keine Modifier) ruft `preventDefault()` und `onOpenFeature(feature)`.
- `onOpenFeature` kommt über `HomeRoute` aus `useAppNav().openFeature` → `navigate(pathForFeature(id))` (`src/router/useAppNav.ts`). `pathForFeature` liest `FEATURE_PATH` (`routes.ts`, `Record<FeatureId, string>`). `FeatureId` ist in `src/App.tsx` Zeile 18 deklariert.
- Folge: eine neue Kachel/Route braucht (1) `FeatureId` in `App.tsx`, (2) `FEATURE_PATH`-Eintrag, (3) `RouteDef` in `ROUTES` mit `featureId`, (4) einen Eintrag in `router.tsx`, (5) einen `FEATURE`-Eintrag in der Startseite. `verify:routing` hält alles zusammen (u. a. „jede FeatureId hat einen Pfad, der auf eine Route zeigt").

### 2.2 Wie `/seewetter` und `/gletscher` durchgängig angelegt wurden

| Schicht | Ort | Was dort steht |
|---|---|---|
| Route-Tabelle | `src/router/routes.ts` `ROUTES` | `id`, `path`, `aliases`, `featureId`, `subParam`, `meta` (Titel, Beschreibung, H1, Lead, `noindex`) |
| Pfad → Feature | `routes.ts` `FEATURE_PATH` | `glacier: '/gletscher'` |
| Router | `src/router/router.tsx` | `{ path: sub('gletscher'), ...page(() => import('./pages/GlacierRoute')) }` — Lazy-Chunk, `withSeo` hängt den `RouteSeoBlock` an |
| Seiten-Wrapper | `src/router/pages/GlacierRoute.tsx` | prüft das Flag (`glacierFlagFrom`), sonst `NotFoundRoute`; lädt die Seite lazy |
| Flag | `src/glacier/glacierFlag.ts` (abhängigkeitsfrei) | `?gl=0|1` > `localStorage.gl` > Konstante; `rememberGlacierFlag` |
| Routentext | `src/seo/routeTexts.ts` + `ROUTE_TEXT_IDS` in `routes.ts` | Absätze, Fakten, Amtlich-Zeile, Links; `verify:routing` hält beide Listen gleich |
| Statische Shell | `scripts/generate-seo.mjs` (Z. 531) | schreibt `dist/<id>.html` mit H1/Lead/Routentext; Flag-Route bekommt `flagGateScript(param, live)` (`scripts/seo/flagGate.mjs`), das `#root` bei ausgeschaltetem Flag leert |
| Netlify | `netlify.toml` | `from = "/gletscher"` → `to = "/gletscher.html"`, Status 200 (+ `/*`-Variante für Unterpfade) |
| Sitemap | aus `ROUTES` (`sitemapPaths()`), `noindex` ⇒ nicht drin | |
| Verifier | `verify:routing`, `verify:seo` | Routenlisten, Texte, Sitemap, Shells |

Bewusst NICHT berührt: `netlify/edge-functions/og-meta.ts` (STOPP: Edge Functions). Die Detailseite bekommt also vorerst keine eigene Vorschau-Karte für Crawler; sie fällt auf die allgemeine Vorschau zurück. Das ist für eine noindex-Route hinter Flag unkritisch und steht unter „Offen".

### 2.3 Command-Deck-Topbar für eine Inhaltsseite

Vorhandene Muster: `FeatureTopbar` (`src/feature/featureHeader.tsx`: Logo + „Zurück zur Startseite", Klassen `feature-page-*`, gebaut für Platzhalter-Seiten) und die `rt-nav` der Feedback-/Validierungsseite (`tourTheme.css`, älteres Theme, „nie erweitern"). Beide tragen weder den Kicker „METHODIK · BUSCOSUN FUSION" noch den 44-px-Link „← Startseite" des Canvas, und `rt-*` ist ein Alt-Theme (D-27: migrieren, nie erweitern). **Entscheidung:** eigene schlanke Topbar im Namensraum `.fx-` mit dem Wortmarke-Aufbau aus `featureHeader` (`/buscosun-mark.svg` + „buscosun") — das ist der Fall „kein vorhandener passt" aus dem Auftrag.

### 2.4 Nutzung von `.deck-steps/.deck-step*/.deck-pills/.deck-pill*`

`grep` über `src`: Treffer **nur** in `SearchPage.tsx` (die Funktion `Fundament`) und `SearchPage.css` (Z. 702–709 und die Mobil-Zeile 907). Kein anderer Verbraucher. Die Klassen bleiben für den Rückfall `?fx=0` unverändert stehen (der alte Block muss pixelgleich bleiben); sie werden NICHT gelöscht (Funktionserhalt, Löschen von Komponenten = STOPP). Die Vorschau bekommt eigene Klassen `.fxp-*` in einer eigenen CSS-Datei, die zusammen mit der Vorschau-Komponente im Lazy-Chunk liegt.

### 2.5 Befunde

- **V-FXU-1 (Budget):** `FundamentPreview` wird `lazy` geladen (`Suspense` mit gleich hohem Platzhalter). Damit bleibt die Startseite im eager-Bundle um ~0 gewachsen (nur Flag-Leser + Lazy-Import); die zwei Schaubilder und ihr CSS liegen im Vorschau-Chunk, der sich den Daten-Chunk `charts` mit der Detailseite teilt.
- **V-FXU-2 (Flag über Navigation):** Der Klick auf die Kachel verliert die Query (`navigate(pathForFeature)`). Wie bei `?gl=`/`?road=` merkt sich `rememberFxFlag` ein ausdrückliches `?fx=0|1` in `localStorage.fx`; `?fx=` in der Adresse schlägt den Speicher, der Speicher schlägt die Konstante.
- **V-FXU-3 (Shell-Gate):** Solange das Flag aus ist, soll die statische Shell der Route für Besucher ohne `?fx=1` leer werden (`flagGateScript('fx', FUSION_EXPLAINER_LIVE)`); die Route ist `noindex` und nicht in der Sitemap, bis Jan das Flag umlegt.
- **V-FXU-4 (RouteSeoBlock):** `withSeo` hängt hinter jede Route den Block „Über diese Ansicht" mit dem Routentext. Auf der Detailseite wiederholt er den Kerntext knapp unter dem Footer; das ist Muster aller Feature-Routen (SEO/GEO 2026) und bleibt.
- **V-FXU-5 (Zahl im Text):** Texte, die den Stand nennen, nehmen `fusionName(FUSION_CURRENT)` zur Laufzeit; im statischen Routentext steht „buscosun Fusion" ohne Nummer. `verify:fusion-release` Block B (keine feste Nummer außerhalb des Registers) gilt auch für die neuen Dateien.

## 3. Plan der Dateien

| Datei | Zweck |
|---|---|
| `audit/fusion-erklaerung.md` | dieses Dokument |
| `scripts/gen-fusion-explainer.mjs` → `src/fusionExplainer/charts.ts` | Schaubilder (GENERIERT, Schemata ohne Messdaten) |
| `src/fusionExplainer/fxFlag.ts` | `FUSION_EXPLAINER_LIVE`, `fxFlagFrom`, `rememberFxFlag` (abhängigkeitsfrei) |
| `src/fusionExplainer/StepPanel.tsx` | ein Schritt-Schaubild (gemeinsam für Vorschau und Detail) |
| `src/fusionExplainer/FundamentPreview.tsx` + `.css` | Teil A |
| `src/fusionExplainer/FusionExplainerPage.tsx` + `.css` (+ `TerrainFigure.tsx`, `OutputFigure.tsx`, `copy.ts`) | Teil B |
| `src/router/pages/FusionExplainerRoute.tsx` | Flag-Wächter + Lazy-Seite |
| `src/router/routes.ts`, `router.tsx`, `src/App.tsx` (nur `FeatureId`) | Route, Pfad, Feature |
| `src/seo/routeTexts.ts` | Routentext der statischen Shell |
| `scripts/generate-seo.mjs`, `netlify.toml` | Flag-Gate der Shell, Rewrite `/buscosun-fusion` → `/buscosun-fusion.html` |
| `src/SearchPage.tsx` | `FEATURE.fusion` + Umschalter `Fundament`/Vorschau |
| `src/pointForecast/fusion/fusionRelease.ts` | `publicLabel?` + `FUSION_BASE_PUBLIC_LABEL` + 8 Labels (E-FXU-2) |
| `scripts/verify-fusion-release.mjs` | Label-Prüfung (A-Block) |
| `scripts/verify-routing.mjs` / `verify-seo` | nur wo Listen die neue Route nennen müssen |

Unverändert: `src/pointForecast/**` außer der genannten Datei, Shader, Edge Functions, Dependencies, Daten-Repos.

## 4. Umsetzung (02.11.2026, nicht committet, nicht gepusht)

- **Schaubilder:** `scripts/gen-fusion-explainer.mjs` (Inhalt aus dem Auftrag, unverändert) → `src/fusionExplainer/charts.ts` (GENERIERT: `STEP_PANELS`, `TERRAIN`, `OUTPUT`). Jede Grafik ist ein Schema und trägt die Beschriftung „SCHEMA"; alle Linien `vector-effect="non-scaling-stroke"`, runde Enden/Ecken.
- **Teil A:** `FundamentPreview.tsx/.css` (Lazy). Die Glasfläche ist weiter `.deck-fundament-inner`; sie ist jetzt EIN `<a href="/buscosun-fusion">` (Klick = `onOpenFeature(FEATURE.fusion)`, Strg/Cmd/Mittelklick bleibt ein normaler Link). Innen nichts Interaktives (Chips und „So rechnet …"-Knopf sind `aria-hidden`-Optik).
- **Teil B:** `FusionExplainerPage.tsx/.css` mit den Abschnitten Hero, 01–07, Schluss, Fußzeile; `TerrainFigure`, `OutputFigure`, `StepPanel`, `copy.ts` (der deutsche Text wörtlich aus dem Auftrag; keine feste Nummer). Die Ständeleiste entsteht aus `FUSION_RELEASES` (Grundstand → `FUSION_CURRENT`, Datum `dd.mm.` aus dem Eintrag, Label aus `publicLabel`); Nr. 14 ist hervorgehoben.
- **Route:** `routes.ts` (`id: 'buscosun-fusion'`, `featureId: 'fusion'`, `noindex: !FUSION_EXPLAINER_LIVE`, in `ROUTE_TEXT_IDS`), `router.tsx`, `FusionExplainerRoute.tsx` (Flag-Wächter, sonst 404-Seite), `App.tsx` (`FeatureId`), `routeTexts.ts` (statischer Text, ohne Nummer), `generate-seo.mjs` (`flagGateScript('fx', …)`), `netlify.toml` (ein Rewrite `/buscosun-fusion` → `/buscosun-fusion.html`).
- **Flag:** `src/fusionExplainer/fxFlag.ts` (`FUSION_EXPLAINER_LIVE = false`; `?fx=1|0` > `localStorage.fx` > Konstante).
- **Register (E-FXU-2):** `publicLabel?` an `FusionRelease`, acht Labels (7–14), `FUSION_BASE_PUBLIC_LABEL`; `verify:fusion-release` A1b/A1c prüfen nicht leer und ≤ 50 Zeichen samt Gegenprobe. Sonst keine Änderung in `src/pointForecast/**`.
- Alte Klassen `.deck-steps/.deck-step*/.deck-pills/.deck-pill*` und die Funktion `Fundament()` bleiben stehen (Rückfall `?fx=0`); `SearchPage.css` ist unverändert.

### Abweichungen und Auslegungen

- Die Topbar ist eine eigene, schmale `.fx-`-Leiste (Begründung 2.3), kein Wiederverwenden von `FeatureTopbar`.
- „Ort suchen →" im Schluss führt auf `/` ohne Fokus im Suchfeld: die Startseite unterstützt das Fokussieren per Link nicht (kein Parameter, kein Hash).
- „sand-50 auf ink" beim Schlusslink als gefüllter sand-50-Knopf mit ink-Schrift gelesen (auf dem ink-Band sonst nicht als Knopf erkennbar).
- Mobil sitzt der Chip „nach der Karte" über `order` im Grid (`display: contents` am Textblock); die Lesereihenfolge im DOM bleibt Text, Karte.
- Vorschau und alter Block liegen im selben `section.deck-fundament`; solange der Chunk lädt, steht ein gleich benannter, 360 px hoher Platzhalter (Glasfläche).
- Die Schaubild-Texte „Gitterzelle", „dein Ort" usw. sind SVG-Text in Nutzereinheiten des viewBox (12,5 / mobil 21), nicht in Pixeln.

## 5. Verifikation

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run build` (tsc, vite, generate-seo, verify-seo, verify-routing) | grün; `verify-routing` 274/274 |
| `verify:fusion-release` | 31/32; neu A1b/A1c grün. Rot ist **C7** (`src/atmosphere/AtmospherePage.tsx` nennt „ICON-D2" im Text, Zeilen 102/140) — vor dieser Phase vorhanden, die Datei ist nicht angefasst |
| `npm run budget` | `eagerJs` **113,0 KB** gegen Grenze 112 KB ✗, `eagerCss` 2,4 KB ✓, `largestChunk` 278,4 KB ✓, `totalJs` 1 952,9 KB ✓ (Grenze 1 957) |
| Budget-Delta (sauberer Worktree: HEAD gegen HEAD + nur meine Dateien, jeweils `vite build`) | `eagerJs` 112,6 → 113,0 KB (**+0,4 KB**: Routentabelle, Flag-Leser, Umschalter); `totalJs` 1 934,9 → 1 952,9 KB (**+18,0 KB**: Detailseite, Vorschau und `charts` als Lazy-Chunks). Die Ratsche `eagerJs` war an HEAD schon rot (112,6 > 112, vgl. V-HB-1); die Grenze habe ich nicht angehoben |
| Statische Shell | `dist/buscosun-fusion.html` mit `noindex`, Flag-Skript für `fx`; nicht in der Sitemap |

Hinweis zur Messung: Im Arbeitsbaum liegen fremde, uncommittete Änderungen einer parallelen Gletscher-SEO-Phase (`audit/gletscher-seo.md`, `scripts/seo/glacierPages.mjs`, `src/main.tsx`, `RouteMeta.tsx`, `RouteSeoBlock.tsx`, `generate-seo.mjs` u. a.). Eine Messung im Arbeitsbaum (eagerJs 113,2 KB) mischt sie mit; darum die Worktree-Messung oben. In `generate-seo.mjs` stehen meine zwei Zeilen und die Gletscher-Hunks nebeneinander — beim Committen nach Hunks trennen.

### Screenshots (`audit/fusion-erklaerung/`, `scripts/lib/headlessShot.mjs`, 1440×900 und 390×844 DPR 3)

`start-fx1-desktop.png`, `start-fx1-mobile.png` (Vorschau), `start-fx0-desktop.png`, `start-fx0-mobile.png` (alter Block), `detail-desktop.png`, `detail-mobile.png` (ganze Seite). Visueller Vergleich mit dem Canvas: Abschnitte, Grafiken, Ständeleiste und mobiler Wischstreifen entsprechen dem Auftrag; den Canvas selbst habe ich nicht eingesehen (kein Abruf), Maßgabe war der Text des Auftrags.

### Flag-Verhalten (frische Browserprofile)

| Fall | Ergebnis |
|---|---|
| `/` ohne Flag | alter Block |
| `/buscosun-fusion` ohne Flag | „Diese Seite gibt es nicht." |
| `?fx=1` | Vorschau + Seite; `localStorage.fx = 1` (damit der Kachelklick ohne Query funktioniert) |
| `?fx=0` nach `?fx=1` | alter Block / 404-Seite, Speicher 0 |

### Die fünf Selbstverifikations-Fragen

1. **Funktionserhalt:** Mit `?fx=0` und ohne Flag läuft derselbe alte `Fundament()`-Zweig, `SearchPage.css` ist unverändert; sonst wird nichts entfernt oder versteckt.
2. **Desktop pixelgleich:** Nicht pixelweise gegen HEAD verglichen (kein Baseline-Bild von vor der Änderung). Beleg ist der unveränderte Code-Pfad und `start-fx0-desktop.png`; mit dem Flag aus ändert sich nur die Zeile im JSX und ein Lazy-Import, der nie geladen wird.
3. **Touch-Ziele ≥ 44 px:** Sonde über alle Links, `summary` und fokussierbaren Elemente der Seite, Desktop und Mobil: keine unter 44 px (Fragen-Zeilen 52, Schlusslink 48, Topbar-Links 44).
4. **Konsole sauber:** nicht gemessen (kein Konsolen-Mitschnitt in der Headless-Sonde); die Seite rendert ohne Laufzeitfehler, sichtbar in den Screenshots, und `tsc` ist grün.
5. **Keine Long Tasks > 200 ms:** nicht gemessen (`PerformanceObserver('longtask')` liefert in headless-shell nichts, CLAUDE.md). Die Seite hat keine Animation und keine Daten- oder Kartenabrufe; Real-Device-Prüfung offen.

## 6. Offen / Befunde

- **V-FXU-6:** Kontrast der Eyebrows `#7A6548` auf dem Glas (5,0 : 1 laut Auftrag) und `#8F4E22` auf terracotta-50 nicht eigens nachgerechnet; die Werte kommen aus der Entscheidung E-FXU-3.
- **V-FXU-7:** Vorschau-Karte für Crawler (`og-meta`) fehlt, solange die Route hinter dem Flag liegt (STOPP Edge Function); beim Umlegen `/buscosun-fusion` in `og-meta.ts` und im Share-Bündel ergänzen (Jans Freigabe nötig).
- **V-FXU-8:** `/methodik/punktvorhersage-quellenmix/` bleibt unverändert (E-FXU-1) und sagt weiterhin das Alte; Folgephase.
- **V-FXU-9:** Das Start-Fokussieren des Suchfelds über „Ort suchen →" würde einen kleinen Hook auf der Startseite brauchen (z. B. `#suche`).
- **Jans Gates:** Sichtprüfung gegen den Canvas, dann `FUSION_EXPLAINER_LIVE = true` setzen (hebt `noindex` und nimmt die Route in die Sitemap auf), Commit/Push, `eagerJs`-Ratsche mit Notiz.

## 7. Freigabe (02.11.2026)

Jan: „schalte ihn aktiv" ⇒ `FUSION_EXPLAINER_LIVE = true` (`fxFlag.ts`). Lokal gebaut: `dist/buscosun-fusion.html` ohne `noindex`, Canonical `https://buscosun.com/buscosun-fusion`, genau ein Eintrag in der Sitemap; `verify-seo` und `verify-routing` (274/274) grün. `?fx=0` bleibt der Rückfall auf den alten Block. Live erst mit dem Push (Jan). Offen: V-FXU-7 (`og-meta` kennt die Route nicht).
