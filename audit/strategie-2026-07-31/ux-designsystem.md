# UX & Design-System — Strategie-Deep-Dive (2026-07-31)

> Rolle: **UX & Design-System** (Agent-Team, Planungsphase).
> Handlungsfelder aus `roadmap.md` §B: **2 (User Experience)**, **8 (Suche & Standort)**, **9 (Personalisierung)**.
> Verbindlich: `CLAUDE.md`, `decisions.md` D-23/D-27 (Command-Deck), D-03 (ohne Account), D-06 (near-zero-deps), Funktionserhalt.
> Alle Aussagen sind am Code verifiziert und mit `Datei:Zeile` belegt. **Keine Code-, Build- oder Config-Änderung erfolgt.**

---

## 1. Auftrag & Abgrenzung

**Auftrag:** Zielbild für Navigation, Design-System-Abstraktion, Ortssuche/Standort-Kontinuität, lokale Personalisierung, Onboarding und Mobile-Konformität — als Vorlage für den Masterplan.

**In Scope (gelesen/geprüft):** `src/App.tsx`, `src/SearchPage.tsx`, `src/designTokens.css`, alle sieben `*Deck.css` + `SearchPage.css`, `src/favorites.ts`, `src/mapState.ts`, `src/radar/radarState.ts`, `src/geocode.ts`, `src/mobile/*`, `src/intro/*`, `src/history/historyState.ts`, `src/atmosphere/atmosphereStore.tsx`, die Deck-Shells (`RouteDeck.tsx`, `NowcastDeck.tsx`, `ForecastDeck.tsx`, `AtmosphereDeck.tsx`, `HistoryPage.tsx`, `EventPage.tsx`) sowie die Deck-Regionen von `MapView.tsx`.

**Out of Scope (andere Rollen):** WebGL-/Shader-Pfade und `FrameGovernor` (Rendering & Performance), Datenquellen/Fusion (Daten & Meteorologie), WCAG-Programm im Detail (A11y & i18n — hier nur, wo es die Deck-Shell direkt betrifft), Netlify/Header/Domain (Infra), MapView-Zerlegung O-04 (Rendering & Performance; hier nur die Deck-UI-Schnittstelle).

**Abgrenzung zu bestehenden V-Einträgen:** Dieses Dokument **vertieft** V-04 (Favoriten-Defekt), V-05 (Navigation/Deep-Links), V-08 (Alt-Ballast/CSS), V-10 (Command-Deck vollenden), V-12 (A11y). Neue Einträge sind als „erweitert V-NN" markiert und dupliziert nichts.

**Bekannte Fiktionen** (nicht zitiert, nirgends als Ist behauptet): Three.js, WebLLM/`src/assistant`, R2/PMTiles, „AdaptiveQualityController". `docs/zielgruppen-dach.md` (Stand 2026-06-09) listet in Teil A weiterhin einen „KI-Meteorologe (`assistant`)" (Zeile 30) und behandelt `threed` als Seite (Zeile 28) — beides überholt: `src/threed/ThreeDPage.tsx` ist nicht mehr verdrahtet, der Vertikalschnitt lebt in `src/atmosphere` (`src/App.tsx:22,124`).

---

## 2. Ist-Stand am Code belegt

### 2.1 Die 12 `FeatureId`-Werte: Einstiege, Design-Zustand, Navigationsverhalten

`FeatureId` ist 12-breit (`src/App.tsx:29`). Der View-Switcher kennt drei Zustände `search | map | feature` (`src/App.tsx:41-44`) und initialisiert **einmalig** aus `location.hash` (`src/App.tsx:78-91`).

| # | FeatureId | Kachel (Bento) | Palette ⌘K | Footer | Hash-Permalink | Deck-Rail erreichbar? | Design-Zustand | Bemerkung |
|---|---|---|---|---|---|---|---|---|
| 1 | `map2d` | ✅ `SearchPage.tsx:467` | ✅ `:78` | ✅ `:707` | **teilweise** `#m=` (`mapState.ts:12`) | ✅ aktiv (`MapView.tsx:3485`) | Command-Deck (`map/mapDeck.css`) **+ `MapView.css` 67,9 KB parallel** (`MapView.tsx:94,105`) | Overview-Modus (`App.tsx:120`) ist **nicht** im Hash kodierbar (`mapState.ts:16-20`) |
| 2 | `route` | ✅ `:495` | ✅ `:79` | ✅ `:709` | ❌ **keiner** | ❌ | Command-Deck (`routeDeck.css`) **+ `tourTheme.css` 37,8 KB** (`TourView.tsx:40-42`) | `RoutePage.css` (5,4 KB) ist **nirgends importiert** = tot |
| 3 | `event` | ✅ `:512` | ✅ `:80` | ✅ `:710` | ✅ `#ev=` (`eventState.ts:17`) | ✅ ab MapView (`App.tsx:106`) | Command-Deck **+ `EventPage.css` 76,6 KB** (`EventResult.tsx:50`) | `EventResult.tsx` nutzt **179× `.ev-*` gegen 192× `.evd-*`** → Migration zur Hälfte offen |
| 4 | `nowcast` | ✅ `:527` | ✅ `:81` | ✅ `:708` | ❌ (`#r=` existiert, wird aber nirgends geschrieben/gelesen) | ✅ ab MapView (`App.tsx:104`) | Command-Deck (`nowcastDeck.css` + `nowcastMobile.css`) **+ `nowcast.css`, `tourTheme.css`, `radar.css`, `ml.css`** | siehe §2.2 |
| 5 | `forecast` | ✅ `:544` | ✅ `:82` | — | ❌ **keiner** | ✅ ab MapView (`App.tsx:105`) | Command-Deck **+ `forecast.css` + `tourTheme.css`** (`ForecastDeck.tsx:37-39`) | |
| 6 | `history` | ✅ `:561` | ✅ `:83` | ✅ `:711` | ✅ `#h=` (`HistoryPage.tsx:149`) | ❌ | Command-Deck **+ `history.css` + `tourTheme.css` + `intro.css`** (`HistoryPage.tsx:49-52`) | beste A11y im Repo |
| 7 | `atmosphere` | ✅ `:576` | ✅ `:84` | ✅ `:712` | ✅ `#atm=`, Migration `#3d=` (`App.tsx:82`) | ❌ | Command-Deck **+ `threed.css` + `atmosphere.css`** (`AtmosphereDeck.tsx:33-35`) | einziges Feature mit sauberer Hash-Migration |
| 8 | `globe` | ✅ `:594` | ✅ `:85` | ✅ `:720` | ✅ `#g=` (`GlobePage.tsx:91`) | ❌ | **Alt-Chrome** (`globe.css`, eigenes dunkles UI) | D-27-Migrationsziel #1 |
| 9 | `feedback` | ✅ `:610` | ✅ `:86` | ✅ `:718` | ❌ **keiner** | ❌ | **Alt-Chrome** (`tourTheme.css` + `feedback.css`) | D-27-Migrationsziel #3 |
| 10 | `validation` | ❌ **keine Kachel** | ✅ `:87` | ✅ `:719` | ✅ `#val` (`App.tsx:84`) | ❌ | **Alt-Chrome** (`FeaturePage.css` + `ValidationPage.css`, `FeatureTopbar`) | D-27-Migrationsziel #2 |
| 11 | `mobiletest` | ❌ | ❌ | ❌ | ✅ `#mobiletest` (`App.tsx:86`) | ❌ | Dev-Scaffold | einziger Nutzer der `mobile/*`-Primitives |
| 12 | `dayflow` | ❌ | ❌ | ❌ | ❌ | ❌ | — | **toter Platzhalter, verifiziert** (s. u.) |

**`dayflow` verifiziert tot:** Der String kommt in `src/` genau **einmal** vor — in der Typunion `src/App.tsx:29`. Kein Case im Renderer (`App.tsx:120-131`), keine Kachel, kein Palette-Eintrag, kein Hash. Würde ein `dayflow`-`FeatureInfo` konstruiert, fiele es in den generischen Fallback `FeaturePage` mit dem Text „Diese Funktion wird vorbereitet." (`src/feature/FeaturePage.tsx:24`). Die einzige weitere Erwähnung im Repo ist `docs/zielgruppen-dach.md:45`, die es korrekt als toten Platzhalter beschreibt.

**Nur per Kachel erreichbar, ohne jeden Permalink:** `route`, `forecast`, `feedback` (und `nowcast` faktisch, s. §2.2). Wer eine Tourenplanung oder eine Konfidenz-Ansicht teilen will, kann nur die Startseite verlinken.

**Rail-Navigation ist heute Attrappe (zentraler Befund).** Jede Deck-Rail zeigt Icons mit `title="Wetterkarte"`, `"Regenradar"`, `"Tourenplanung"`, `"Event-Planung"`, `"Einstellungen"` — aber **alle** nicht-aktiven Rail-Buttons rufen `onBack` bzw. `onHome` auf, und das ist in `App.tsx:117` durchgängig `goSearch` (`App.tsx:94-99`):

| Deck | Beleg | Verhalten |
|---|---|---|
| Route | `src/route/RouteDeck.tsx:105-109` (`onClick={onHome}`), Prop-Kette `RoutePage.tsx:115` → `App.tsx:122` | alle 4 Rail-Icons → Startseite |
| Event | `src/event/EventPage.tsx:194-199` | alle 4 → Startseite |
| Vorhersage | `src/confidence/ForecastDeck.tsx:371-376` | alle 4 → Startseite |
| Atmosphäre | `src/atmosphere/AtmosphereDeck.tsx:174-178` | alle 3 → Startseite |
| Nowcast | `src/nowcast/NowcastDeck.tsx:201-207` | alle 2 → Startseite |
| Historie | `src/history/HistoryPage.tsx:334-336` | „Vorhersage" ist ein **`<span aria-hidden="true">`** — ein rein dekoratives, unklickbares Icon |
| **Wetterkarte** | `src/MapView.tsx:3491-3497` | **einzige echte** Rail: `onOpenFeature('forecast'\|'nowcast'\|'event')` |

Ergebnis: Der visuelle Vertrag des Command-Decks („Rail = App-weite Werkzeugleiste") wird an 6 von 7 Stellen gebrochen. Der Nutzer erlebt „12 Inseln mit gemeinsamer Lackierung", nicht eine App.

**Standort-Kontinuität: existiert nicht.** Jedes Feature startet mit `null` und fragt neu:

| Feature | Startzustand | Beleg |
|---|---|---|
| Nowcast | `useState<Location \| null>(null)` | `src/nowcast/NowcastPage.tsx:79` |
| Vorhersage | `useState<Location \| null>(null)` | `src/confidence/ForecastPage.tsx:50` |
| Event | `useState<Location \| null>(null)` | `src/event/EventPage.tsx:57` |
| Historie | `useState<HistoryLocation \| null>(null)` | `src/history/HistoryPage.tsx:97` |
| Atmosphäre | aus Hash, sonst `loc: null` | `src/atmosphere/atmosphereStore.tsx:89,95` |
| Karte | Prop von `App` (Suche oder `#m=`) | `src/App.tsx:115,135` |

`SearchPage.onSelect` führt **immer** zur 2D-Karte (`src/App.tsx:135`) — ein gesuchter Ort kann nie direkt in Nowcast/Event/Historie münden. Geolocation („Mein Standort") gibt es genau **einmal**, im Nowcast (`src/nowcast/NowcastPage.tsx:86-91`); alle anderen Features bieten sie nicht an.

**Fünf parallele Ort-Picker:** `SearchPage.tsx:257` (HeroSearch, ruft Nominatim **selbst**, statt `geocodeDACH`), `nowcast/NowcastLocationField.tsx:9`, `event/EventPage.tsx:224`, `confidence/ForecastPage.tsx:99`, `atmosphere/AtmospherePage.tsx:146`. Alle vier letzteren nutzen `geocodeDACH` (`src/geocode.ts:23`), aber jeweils mit eigenem State, eigener Fehlerbehandlung und eigenem Markup.

### 2.2 Permalink-Mechanik: was schreibt, was liest

| Hash | Encoder | Decoder | Von `App.tsx` gelesen? | Von der App geschrieben? | Status |
|---|---|---|---|---|---|
| `#m=` | `mapState.ts:35` | `mapState.ts:45` | ✅ `App.tsx:88` | ✅ `MapView.tsx:2941-2945` (`replaceState`) | funktioniert; `overview` fehlt im Payload |
| `#ev=` | `eventState.ts:22` | `eventState.ts:34` | ✅ `App.tsx:87` | ✅ `EventPage.tsx:83` | funktioniert |
| `#h=` | `historyState.ts` | dito | ✅ `App.tsx:83` | ✅ `HistoryPage.tsx:149` | funktioniert |
| `#atm=` / `#3d=` | `atmosphereStore.tsx:116` | dito | ✅ `App.tsx:82` | ✅ `atmosphereStore.tsx:120` | funktioniert inkl. Alt-Link-Migration |
| `#g=` | `GlobePage.tsx:91` | `GlobePage.tsx:61` | ✅ `App.tsx:85` | ✅ | funktioniert |
| `#val`, `#mobiletest` | — | — | ✅ `App.tsx:84,86` | ❌ | nur Einstieg, kein Zustand |
| **`#r=`** | `radarState.ts:40` | `radarState.ts:52` | ❌ **nie** | ❌ **nie** | **komplett tote Infrastruktur** |
| `#route`, `#fc`, `#fb` | — | — | ❌ | ❌ | existieren nicht |

**`#r=` ist toter als in `roadmap.md` A5 beschrieben.** Ein Grep über `src` zeigt: `encodeRadarState`, `decodeRadarState`, `hasRadarHash` haben **außer dem Verifier** (`src/radar/_verify.ts:11,19`) keinen einzigen Aufrufer. Nur `saveLastView`/`loadLastView` (localStorage, `radarState.ts:78-88`) werden benutzt (`NowcastDeck.tsx:68`, `NowcastRadarMap.tsx:97,255`). A5 sagt „App.tsx prüft ihn nie" — richtig ist zusätzlich: **das Radar schreibt ihn auch nie.** Beide Enden fehlen.

**Kein `hashchange`, kein `pushState` — nirgends im Repo.** Ein Grep über `src` findet ausschließlich `history.replaceState` (7 Fundstellen: `App.tsx:96`, `MapView.tsx:2944`, `atmosphereStore.tsx:120`, `EventPage.tsx:83,85`, `HistoryPage.tsx:116,149`, `GlobePage.tsx:91`, `ThreeDPage.tsx:66`). Kein `pushState`, kein `hashchange`- und kein `popstate`-Listener. Folge: **Browser-Zurück verlässt die App**, statt zum vorigen Feature zu wechseln.

### 2.3 localStorage-Keys — vollständige Bestandsaufnahme

`decisions.md` D-03 spricht von „20 `buscosun.*`-Keys". Verifiziert sind **21 statische Schlüssel plus eine dynamische Familie**; drei davon tragen **nicht** das `buscosun.`-Präfix.

| # | Key | Datei:Zeile | Inhalt | Gehört ins Profil? |
|---|---|---|---|---|
| 1 | `buscosun.favorites.v1` | `src/favorites.ts:11` | Favoriten-Orte (max. 8) | ✅ Orte |
| 2 | `buscosun.history.favorites.v1` | `src/history/historyState.ts:131` | **zweites** Favoritensystem (max. 12) | ✅ Orte (Migration) |
| 3 | `buscosun.history.recents.v1` | `src/history/historyState.ts:132` | zuletzt genutzte Orte | ✅ Orte |
| 4 | `buscosun.history.dark.v1` | `src/history/HistoryPage.tsx:106,111` | Dark-Mode nur der Historie | ✅ Darstellung |
| 5 | `buscosun.radar.lastview.v1` | `src/radar/radarState.ts:78` | Layer/Palette/Basemap/Deckkraft | ✅ Layer-Preset |
| 6 | `buscosun.nowcast.alerts.config.v1` | `src/nowcast/nowcastAlerts.ts:224` | Alert-Konfiguration | ✅ Aktivitäten/Alerts |
| 7 | `buscosun.nowcast.alerts.locs.v1` | dito | Alert-Orte | ✅ Orte |
| 8 | `buscosun.nowcast.alerts.state.v1` | dito | Zustellzustand | ➖ flüchtig |
| 9 | `buscosun.notify.subscriptions.v1` | `src/notifications/notificationStore.ts:32` | Abos | ✅ Alerts |
| 10 | `buscosun.notify.delivered.v1` | dito `:33` | zugestellt | ➖ flüchtig |
| 11 | `buscosun.notify.settings.v1` | dito `:34` | Einstellungen | ✅ Alerts |
| 12 | `buscosun.forecast.distMode.v1` | `src/confidence/DistributionPanel.tsx:13` | Ansichtsmodus | ✅ Darstellung |
| 13 | `buscosun.forecast.compareSel.v1` | `src/confidence/ModelCompare.tsx:14` | Modellauswahl | ✅ Modell-Preset |
| 14 | `buscosun.forecast.compareMetric.v1` | dito `:15` | Metrik | ✅ Darstellung |
| 15 | `buscosun.atm.lens.v1` | `src/atmosphere/atmosphereStore.tsx:29` | zuletzt genutzte Linse | ✅ Darstellung |
| 16 | `buscosun.threed.gonogo.v1` | `src/threed/goNoGo.ts:92` | Höhe AGL + Böen-Limit | ✅ Aktivitäts-Schwellen |
| 17 | `buscosun.vsd.limit.<storeKey>` | `src/atmosphere/AtmosphereDeck.tsx:494` | **dynamische Key-Familie** je Grenzwert | ✅ Aktivitäts-Schwellen |
| 18 | `buscosun.optin.openMeteo.v1` | `src/optIn.ts:9` | Einwilligung Open-Meteo (D-18) | ✅ Einwilligungen |
| 19 | `buscosun.intro.seen.v1` | `src/intro/useIntroTour.ts:15` | Erstbesuch-Flag | ✅ Onboarding |
| 20 | **`fusion2d.default`** | `src/fusion/modelSource.ts:83` | Modell-Default 2D (**kein `buscosun.`-Präfix**) | ✅ Modell-Preset |
| 21 | **`bs-temp-labels-v1`** | `src/temperatureLabels.ts:31` | Temperatur-Label-Cache (**Fremdpräfix**) | ➖ Cache |
| 22 | **`bc_wind_now_v2`** | `src/wind/iconD2WindSource.ts:684` | Alt-Wind-Cache, wird best-effort aufgeräumt (**Fremdpräfix**) | ➖ Cache |

**Zwei konkurrierende Favoritensysteme, belegt:**

* `src/favorites.ts` — vollständige API (`getFavorites` `:16`, `isFavorite` `:29`, `addFavorite` `:34`, `removeFavorite` `:41`, `toggleFavorite` `:48`), Dedupe auf 3 Nachkommastellen (`:14`), Limit 8 (`:12`). **Aufrufer von `addFavorite`/`toggleFavorite`: null.** Ein Grep über `src` findet als einzigen Konsumenten `SearchPage.tsx:35` — und der importiert nur `getFavorites` und `removeFavorite` (`SearchPage.tsx:380,391`). Damit bestätigt sich V-04 exakt: **anzeigen und löschen ja, anlegen nein.**
* `src/history/historyState.ts:138-150` — eigenes, funktionierendes System (`toggleFavorite` `:141`, `pushRecent` `:147`), Dedupe auf 0,01° (`:136`), Limit 12 (`:135`), plus „Zuletzt"-Liste, die es im globalen System gar nicht gibt.

Die beiden Systeme haben **unterschiedliche Datentypen** (`Location` vs. `HistoryLocation`), **unterschiedliches Dedupe-Raster** und **unterschiedliche Limits** — eine Vereinheitlichung ist eine echte Migration, kein Umbenennen.

### 2.4 Deck-CSS: Größen, Struktur, Wiederholung

Gesamtvolumen `src/**/*.css`: **670 969 Bytes**. Davon in den acht Command-Deck-Stylesheets **243 029 Bytes (36 %)**; die restlichen **~428 KB** sind Alt-/Parallel-Stylesheets, die zum Teil weiterhin geladen werden.

| Stylesheet | Bytes | Zeilen | Klassenpräfix | Shell-Regeln¹ | Media Queries (Zeile) |
|---|---:|---:|---|---:|---|
| `src/map/mapDeck.css` | 49 319 | 917 | `.mdk-` | 26 | 628 (1439/768), 650 (767 + Landscape), 914 (Landscape) |
| `src/history/historyDeck.css` | 35 708 | 410 | `.hd-` | 36 | 279 (1439), 396 (767) |
| `src/event/eventDeck.css` | 34 090 | 408 | `.evd-` | 40 | 328 (1439), 402 (767) |
| `src/route/routeDeck.css` | 29 004 | 414 | `.rd-` | 31 | 100 (1439), 365 (767) |
| `src/SearchPage.css` | 28 048 | 536 | `.deck-` | — | 448 (**768–1024 ad hoc**), 482 (767), 534 (**400 ad hoc**) |
| `src/atmosphere/atmosphereDeck.css` | 26 089 | 288 | `.vsd-` | 33 | 251 (1439) — **kein 767-Block** |
| `src/confidence/forecastDeck.css` | 20 752 | 263 | `.fcd-` | 41 | 195 (**1400 ad hoc**) |
| `src/nowcast/nowcastDeck.css` | 20 019 | 300 | `.rr-` | 31 | 259 (**1024 ad hoc**) |
| **Summe Deck** | **243 029** | | | **~238** | |

¹ Regeln, deren Selektor eine Shell-Region trifft (`root, topbar, brand*, mark, topdiv*, topright, topsearch, topbtn, toppill, live*, avatar, icon-btn, back, crumb, body, rail*, scroll, dock, center, content, link`).

**Die Wiederholung ist wörtlich, nicht nur konzeptionell.** Beispiel Topbar/Rail, `routeDeck.css:37-89` vs. `eventDeck.css:33-85` — identische Werte, nur der Präfix wechselt:

```
.rd-topbar  { flex:0 0 auto; height:60px; display:flex; align-items:center; gap:18px;
              padding:0 20px; padding-top:env(safe-area-inset-top,0); border-bottom:1px solid var(--border-default); box-sizing:content-box; }
.evd-topbar { … identisch, nur background: var(--cream-50) statt var(--rd-card) … }

.rd-rail  / .evd-rail      { width:62px; background:var(--ink-900); padding:14px 0; gap:6px; … }   ← Wert-identisch
.rd-rail-btn / .evd-rail-btn { width:42px; height:42px; border-radius:11px; …; }                    ← Wert-identisch
.rd-rail-btn--active::before / .evd-rail-btn--active::before
        { left:-14px; top:9px; bottom:9px; width:3px; border-radius:2px; background:var(--terracotta-500); } ← Wert-identisch
```

Dasselbe Muster wiederholt sich in `historyDeck.css:35-78`, `atmosphereDeck.css:31-64`, `forecastDeck.css:44-71`, `nowcastDeck.css:23-78`, `mapDeck.css:50-148`. **Sieben Kopien derselben ~30–40 Regeln.**

**Die Namespaces sind in der Praxis bereits gebrochen.** `tourTheme.css` (37,8 KB, nominell „Routen-Theme") ist der **faktische gemeinsame Basis-Layer** — importiert von fünf fremden Features: `atmosphere/AtmospherePage.tsx:19`, `confidence/ForecastDeck.tsx:37` und `ForecastPage.tsx:14`, `feedback/FeedbackPage.tsx:13`, `history/HistoryPage.tsx:50`, `nowcast/NowcastPage.tsx:22`. Darin definiert: `.rt-card` (`tourTheme.css:50`) **und** `.ev-search-wrap` (`:458`) **und** `.ev-loc-chip` (`:492`) — also *Event*-präfigierte Ort-Picker-Styles im *Route*-Stylesheet, die *Nowcast*, *Vorhersage*, *Atmosphäre* und *Historie* benutzen. `.ev-search-wrap` wird in **sieben** Stylesheets definiert oder überschrieben (`route/tourTheme.css`, `event/EventPage.css`, `nowcast/nowcast.css`, `nowcast/nowcastDeck.css`, `nowcast/nowcastMobile.css`, `confidence/forecast.css`, `history/history.css`). Der Beleg im Markup: `src/nowcast/NowcastLocationField.tsx:42,53-54` rendert `ev-loc-chip`, `rt-card`, `ev-search-wrap` — Nowcast-Komponente, Event- und Route-Klassen.

**Drei divergente Bottom-Sheet-Implementierungen** (Guideline §2 fordert **eine**: collapsed ~64 px / half ~45 % / full ~90 %):

| Implementierung | Snaps | Beleg | Bewertung |
|---|---|---|---|
| `src/mobile/BottomSheet.tsx` | collapsed 64 px / half 45 vh / full 90 vh | `:6-8` | **exakt guideline-konform — und ungenutzt** (einziger Import: `mobile/MobilePrimitivesTestPage.tsx`, erreichbar nur über `#mobiletest`) |
| `src/MapView.tsx` (`.mdk-sheet`) | collapsed **128 px** / half **430 px (feste px!)** / full **78 dvh** | Logik `MapView.tsx:2955-2995`, Höhen `map/mapDeck.css:719-721`, Landscape-Override `:915-916` | eigene Drag-Logik, eigene Snap-Tabellen |
| `src/nowcast/NowcastDeck.tsx` (`.rm-sheet`) | **nur zwei**: peek 34 vh / full 92 vh | `NowcastDeck.tsx:557-573`, CSS `nowcastMobile.css:172-197` | eigene Drag-Logik, kein „collapsed" |

Ebenso ungenutzt: `src/mobile/MobileToolbar.tsx` (einziger Import: die Testseite). `useIsMobile`/`useMediaQuery` (`src/mobile/useIsMobile.ts`) hingegen wird breit genutzt (6 Features) — die Primitives sind also **nicht pauschal** tot, nur die zwei UI-Bausteine.

### 2.5 Suche & Standort — Ist

* **Geocoder:** Nominatim, zwei Aufrufwege. Gemeinsamer Helfer `src/geocode.ts:23` (`geocodeDACH`, `countrycodes=de,at,ch`, `limit=8`, `Accept-Language: de`, `AbortSignal`) — **plus eine wörtliche Kopie** inline in `src/SearchPage.tsx:287-295` ohne Abort-Handling. Reverse-Geocoding existiert (`geocode.ts:41`), wird aber nur für Event-Plan-B benutzt.
* **Rate-Limit-Konformität:** Alle fünf Picker sind **submit-getriggert** (Enter/Button), kein Type-Ahead — `SearchPage.tsx:279`, `NowcastLocationField.tsx:35-38`, `EventPage.tsx:249-252`. Die Nominatim-Policy (max. 1 Anfrage/s) wird damit in der Praxis eingehalten. **Aber:** kein Cache, keine Entprellung, kein Backoff, keine 429/403-spezifische Fehlermeldung — der Nutzer sieht bei Sperre nur `Geocoder: 429` (`geocode.ts:31`) bzw. `Suche fehlgeschlagen.` (`EventPage.tsx:244`).
* **Attribution:** Die Karten-Attribution steht im Footer (`SearchPage.tsx:726`, „MapLibre · © OpenStreetMap-Mitwirkende"). Eine **suchbezogene** Nominatim-Attribution an der Ergebnisliste gibt es nicht; die Nominatim-Policy verlangt einen erkennbaren Hinweis. → Prüfauftrag an SEO/GEO & Recht.
* **DACH-Begrenzung:** über `countrycodes`, **keine** Bounding-Box, **kein** `featureType`, kein Ranking-Tuning. Berge, Hütten, Seen, Pässe sind damit nur zufällig gut auffindbar.
* **Command-Palette:** `SearchPage.tsx:736-811`. Platzhalter und Trigger-Text lauten „**Ort suchen** oder Werkzeug springen …" (`:210`, `:779`) — der Filter arbeitet aber ausschließlich über die 10 Werkzeug-Einträge (`:745-749`). **Orte kann die Palette nicht.** Zusätzlich: `.deck-kbar { display: none; }` im Mobile-Block (`SearchPage.css:485`), und ⌘K ist ein Tastatur-Shortcut — die Palette ist auf Mobil **vollständig unerreichbar**.

### 2.6 Onboarding & Erstkontakt — Ist

* `src/intro/useIntroTour.ts` — die Tour **öffnet nie automatisch** (Vertrag im Header dokumentiert, `:4-9`); `pulse` ist beim allerersten Besuch `true` und wird sofort persistiert (`:36-44`, Key `buscosun.intro.seen.v1`). Der Auslöser ist ein dezenter Button „Entdecke buscosun" unter der Suche (`SearchPage.tsx:401-411`).
* `src/intro/IntroOverlay.tsx` — 9 Schritte (`introSteps.tsx`), `role="dialog" aria-modal`, echter Focus-Trap (`:74-83`), ESC + Pfeiltasten, Fokus-Restore (`:54-64`). **Qualitativ die beste Overlay-Implementierung im Repo** — sie ist die Referenz für den Focus-Trap, den `CommandPalette` und die Sheets nicht haben.
* **Aber:** Kein Schritt der Tour öffnet ein Feature. Der letzte Schritt hat als CTA `tour.close` (`IntroOverlay.tsx:146`). Die Tour erklärt — und entlässt den Nutzer dann wieder auf die Startseite.
* **Schnellster Weg zu Wert („Regnet es gleich?") heute:** Startseite → Kachel „04 · NOWCAST" (`SearchPage.tsx:527`) → Idle-Screen → Ort tippen + Enter **oder** „Mein Standort" (`NowcastPage.tsx:154`) → Daten. **Mindestens 3 Interaktionen, davon eine Texteingabe** — und beim nächsten Besuch identisch, weil kein Ort gemerkt wird. Der Hero-Suchschlitz führt stattdessen zur 2D-Karte (`App.tsx:135`), also nicht zur schnellsten Regen-Antwort.
* Die Bento-Kachel Nowcast wirbt mit „0–2 h Radar, **2–6 h ICON-D2**" (`SearchPage.tsx:539`) und der Palette-Eintrag mit „Regen **0–6 h**" (`:81`) — beides widerspricht **D-14** (radar-only, jetzt–2 h). Ehrlichkeits-Defekt auf der Startseite.

### 2.7 Mobile — Ist gegen `mobile-design-guidelines.md`

**Gut umgesetzt:** `viewport-fit=cover` gesetzt (`index.html:5`); `safeArea.css` mit `env(safe-area-inset-*)`-Tokens vorhanden und genutzt; im Mobile-Block von `mapDeck.css` sind Touch-Ziele konsequent auf `min-height: 44px` gesetzt (`:681,695,742`), Slider-Trefferflächen bewusst vergrößert (`:753-756`), Sheet-Scroll mit `overscroll-behavior: contain; touch-action: pan-y` gegen Gesten-Konflikte (`:729`) — genau, was Guideline §2 fordert.

**Drift-Befunde (alle mit Beleg):**

| # | Befund | Beleg | Guideline-Bezug |
|---|---|---|---|
| M1 | **Ad-hoc-Breakpoint 1400 px** statt 1439 px | `src/confidence/forecastDeck.css:195` | `CLAUDE.md` §Harte Regeln |
| M2 | **Ad-hoc-Breakpoint 1024 px** statt 767/1439 | `src/nowcast/nowcastDeck.css:259` | dito |
| M3 | **Ad-hoc-Breakpoints 1024 px und 400 px** auf der Startseite | `src/SearchPage.css:448,534` | dito |
| M4 | Atmosphäre-Deck hat **keinen 767-px-Block** — Mobile läuft über `.vsd-m-*`-Markup statt Media Query | `src/atmosphere/atmosphereDeck.css` (einzige MQ: `:251`) | uneinheitliches Muster |
| M5 | **Suchfeld der Startseite auf Mobil 15 px** → iOS-Auto-Zoom beim Fokus | `src/SearchPage.css:497` (`.deck-search-input { font-size: 15px; }` innerhalb `@media (max-width:767px)`) | Guideline §3 „Formularfelder ≥ 16 px" |
| M6 | **Command-Palette auf Mobil nicht erreichbar** (Trigger ausgeblendet, ⌘K braucht Tastatur) | `src/SearchPage.css:485` + `SearchPage.tsx:122-131` | Guideline §7 „keine Funktionen hinter Desktop verstecken" |
| M7 | **Drei divergente Sheet-Kontrakte**, keiner davon der guideline-konforme | §2.4 | Guideline §2 |
| M8 | Breakpoint-Kommentar im Code widerspricht `CLAUDE.md`: „tablet 768–1024px, desktop > 1024px" | `src/mobile/useIsMobile.ts:3` | `CLAUDE.md` sagt 767/1439 |
| M9 | Alt-Stylesheets bringen 20+ weitere Breakpoints mit (480/520/560/620/640/680/720/760/820/860/900/920/980/1000/1100 px) — Beispiele `route/tourTheme.css:*`, `history/history.css:*`, `event/EventPage.css:*` | `grep @media src/**/*.css` | Ursache: Alt-Layer wird mitgeladen (V-08) |

Der Landscape-Zusatz `(max-height: 430px) and (orientation: landscape)` (`mapDeck.css:650,914`, `MapView.css`) ist **kein** Ad-hoc-Breakpoint im Sinne der Regel, sondern eine bewusste Orientierungs-Bedingung — sollte aber als kanonisches drittes Token in der Deck-Shell festgeschrieben werden, statt an drei Stellen wiederholt zu werden.

---

## 3. Lücken-Quantifizierung

| Lücke | Messgröße heute | Zielgröße | Quelle |
|---|---|---|---|
| Features ohne Permalink | **4 von 11 lebenden** (`route`, `forecast`, `nowcast`, `feedback`) | 0 | §2.1 |
| Permalinks mit Zustandsverlust | 1 (`#m=` verliert `overview`) | 0 | `mapState.ts:16-20` |
| Tote Permalink-Infrastruktur | 1 komplettes Modul (`radarState.ts`, 3 exportierte Funktionen ohne Aufrufer) | 0 | §2.2 |
| Rail-Buttons, die ihr Label einlösen | **1 von 7 Decks** (nur MapView) | 7 von 7 | §2.1 |
| `pushState`-/`hashchange`-Handler | **0** | 1 zentraler | §2.2 |
| Features, die den gewählten Ort übernehmen | **0 von 6** | 6 von 6 | §2.1 |
| Ort-Picker-Implementierungen | **5** | 1 | §2.1 |
| Nominatim-Aufrufstellen | **2** (`geocode.ts:24`, `SearchPage.tsx:287`) | 1 | §2.5 |
| Favoritensysteme | **2** (inkompatible Typen/Raster/Limits) | 1 | §2.3 |
| `addFavorite`-Aufrufer | **0** | ≥ 2 (Suche, Punktpanel) | `favorites.ts:34` |
| localStorage-Keys ohne gemeinsames Modell | **21 statisch + 1 dynamische Familie**, davon 3 mit Fremdpräfix | 1 versioniertes Profil + Cache-Keys | §2.3 |
| Deck-CSS gesamt | **243 029 B** in 8 Dateien | −25…35 % nach Shell-Extraktion (Schätzung, in Phase 0 zu messen) | §2.4 |
| Kopierte Shell-Regeln | **~238** (7 Kopien × 26–41) | ~40 (eine Quelle) | §2.4 |
| Alt-/Parallel-CSS neben Deck-CSS | **~428 KB**, davon `EventPage.css` 76,6 KB + `MapView.css` 67,9 KB + `tourTheme.css` 37,8 KB **aktiv importiert** | siehe V-08 | §2.4 |
| Event-Ergebnisseite: Migrationsgrad | **179 `.ev-*` gegen 192 `.evd-*`** ⇒ ~48 % Alt-Klassen | 0 Alt-Klassen | `EventResult.tsx` |
| Bottom-Sheet-Implementierungen | **3** (davon die guideline-konforme ungenutzt) | 1 | §2.4 |
| Ad-hoc-Breakpoints in Deck-CSS | **4** (1400, 1024, 1024, 400) | 0 | §2.7 |
| Interaktionen bis „Regnet es gleich?" (Erstbesuch) | **3+, davon 1 Texteingabe** | 1 Tap (Wiederkehrer), 2 (Erstbesuch) | §2.6 |
| Features mit Geolocation-Angebot | **1 von 11** | alle ortsbezogenen | `NowcastPage.tsx:86` |

---

## 4. Navigations-/Router-Modell

> **erweitert V-05.** V-05 nennt das Ziel („Hash-Schema vervollständigen, `hashchange` + `pushState`"). Hier steht das ausführbare Modell: vollständiges Schema, Präzedenz, Back-Semantik, Koexistenz und Migrationsgarantie — **ohne Router-Dependency** (D-06).

### 4.1 Leitentscheidungen

1. **Hash bleibt der Routing-Träger.** Pfad-Routing bräuchte Netlify-Rewrites pro Route und kollidiert mit den statisch generierten SEO-Seiten (`scripts/generate-seo.mjs` erzeugt `/wetter/ /wissen/ /funktionen/ /wetterlage/`). Hash-Routing braucht **null** Server-Konfiguration und **null** Dependency.
2. **Ehrlich zur SEO-Wirkung:** Ein Hash ist für Crawler unsichtbar. Deep-Links verbessern **Teilbarkeit, Bookmarks und Zurück-Verhalten** — nicht direkt das Ranking. `roadmap.md` A5 („SEO leiden") ist nur indirekt richtig (Link-Signale durch geteilte Links). Wer echte indexierbare Feature-URLs will, braucht eine separate Grundsatzentscheidung → §9.
3. **Ein Hash, ein Feature.** Das Präfix **ist** die Route. `#m=`, `#r=`, `#h=`, `#ev=`, `#atm=`, `#g=` koexistieren nicht gleichzeitig — jeweils genau ein Feature ist gemountet und alleiniger Schreiber seines Hashes. Das ist das bereits gelebte Muster (`atmosphereStore.tsx:110` kommentiert es explizit als „Sole writer") und wird nur festgeschrieben.
4. **`pushState` beim Feature-Wechsel, `replaceState` bei Zustandsänderung im Feature.** Damit erzeugt ein Zeit-Slider **keine** 40 History-Einträge, ein Feature-Wechsel aber genau einen.

### 4.2 Vollständiges Hash-Schema (alle 12 FeatureIds)

| FeatureId | Hash | Nutzlast | Status |
|---|---|---|---|
| `search` (kein Feature) | `` (leer) oder `#` | — | bestehend |
| `map2d` | `#m=<json>` | `{l:[lat,lon,name,cc], b:bits, h:hour, o?:1}` | **erweitert** um optionales `o` (Overview) |
| `nowcast` | `#r=<json>` | `{l,y,p,b,t,o}` — **Encoder/Decoder existieren fertig** (`radarState.ts:40,52`) | **neu verdrahtet** |
| `route` | `#route` | keine (GPX liegt lokal, nicht teilbar) | neu |
| `event` | `#ev=<json>` | bestehend (`eventState.ts:22`) | unverändert |
| `forecast` | `#fc=<json>` | `{l:[lat,lon,name,cc]}` + optional Modus | neu (Ort ist teilbar, Modelldaten nicht) |
| `history` | `#h=<query>` | bestehend | unverändert |
| `atmosphere` | `#atm=<json>` (+ Alt `#3d=`) | bestehend | unverändert |
| `globe` | `#g=<json>` | bestehend | unverändert |
| `feedback` | `#fb` | keine | neu |
| `validation` | `#val` | keine | unverändert |
| `mobiletest` | `#mobiletest` | keine | unverändert |
| `dayflow` | — | — | **STOPP & FRAGEN** (§9) |

### 4.3 Ein neues pures Modul: `src/appRoute.ts`

Reines (De-)Serialisierungsmodul nach D-12 — DOM-frei, netzfrei, headless verifizierbar wie `mapState.ts`:

```ts
export type Route =
  | { kind: 'search' }
  | { kind: 'map'; state: MapState; overview: boolean }
  | { kind: 'feature'; id: Exclude<FeatureId,'map2d'|'dayflow'>; hash: string };

/** Kanonische, geordnete Präfix-Tabelle — die EINZIGE Quelle der Wahrheit. */
export const ROUTE_PREFIXES: ReadonlyArray<[prefix: string, id: FeatureId]> = [
  ['#3d=',        'atmosphere'],   // Alt-Link-Migration ZUERST
  ['#atm=',       'atmosphere'],
  ['#mobiletest', 'mobiletest'],   // vor '#m=' — längeres Präfix gewinnt
  ['#m=',         'map2d'],
  ['#r=',         'nowcast'],
  ['#route',      'route'],
  ['#ev=',        'event'],
  ['#fc',         'forecast'],
  ['#fb',         'feedback'],
  ['#h=',         'history'],
  ['#g=',         'globe'],
  ['#val',        'validation'],
];

export function parseRoute(hash: string): Route;   // erstes passendes Präfix gewinnt
export function routeHash(r: Route): string;       // Gegenrichtung
export function verifyAppRoute(): VerifyResult;    // Selbsttest, Muster wie radarState.ts:95
```

**Präzedenz-Regel:** Längeres Präfix vor kürzerem, danach Tabellenreihenfolge. Kritisch ist genau ein Fall: `#mobiletest` muss **vor** `#m=` geprüft werden (heute zufällig korrekt, weil `App.tsx:86` vor `:88` steht — künftig durch die Tabelle garantiert und durch einen Verifier-Check abgesichert). Kein anderes Präfixpaar ist mehrdeutig.

**Warum eine Tabelle statt einer `if`-Kette:** Sie ist gleichzeitig die Quelle für (a) den Parser, (b) den Rail-Navigator (§5.3), (c) den Verifier und (d) — falls später gewünscht — die statische SEO-Feature-Seitenliste.

### 4.4 App-Shell: `hashchange`, `popstate`, `pushState`

```
Nutzeraktion                 → history-API        → Effekt
────────────────────────────────────────────────────────────────────
Feature öffnen (Kachel /
Rail / Palette / Footer)     → pushState(hash)    → 1 History-Eintrag, setView(...)
Zustand im Feature ändern
(Slider, Layer, Linse)       → replaceState(hash) → 0 History-Einträge  (Ist-Verhalten, bleibt)
„Zur Startseite"             → pushState('#')     → 1 Eintrag, Zurück führt zurück ins Feature
Browser-Zurück/Vorwärts      → popstate           → parseRoute(location.hash) → setView(...)
Hash manuell editiert /
Link im selben Dokument      → hashchange         → dito
```

Skizze in `src/App.tsx` (ersetzt die Einmal-Initialisierung `:78-91`):

```ts
const ownWriteRef = useRef<string | null>(null);

const navigate = (r: Route) => {
  const h = routeHash(r) || window.location.pathname;
  ownWriteRef.current = h;
  window.history.pushState(null, '', h);
  setView(viewFromRoute(r));
};

useEffect(() => {
  const sync = () => {
    const h = window.location.hash;
    if (ownWriteRef.current === h) { ownWriteRef.current = null; return; } // Eigenschreibung ignorieren
    setView(viewFromRoute(parseRoute(h)));
  };
  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);
  return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
}, []);
```

**Zwei Fallen, bewusst adressiert:**

* `pushState`/`replaceState` lösen **weder** `hashchange` **noch** `popstate` aus — die eigenen Schreibvorgänge der Features (`MapView.tsx:2944` u. a.) triggern den Listener also gar nicht. Der `ownWriteRef`-Wächter ist trotzdem nötig, weil `popstate` und `hashchange` bei echter Navigation **beide** feuern und der Sync sonst doppelt liefe.
* Ein Feature darf beim Mount **nur seinen eigenen Präfix** schreiben. Heute schreibt `MapView.tsx:2941-2945` bedingungslos — das ist korrekt, solange die Karte gemountet ist, muss aber beim Umbau erhalten bleiben (`atmosphereStore.tsx:111-115` hat dafür bereits einen `restoredRef`-Wächter; dasselbe Muster generalisieren).

### 4.5 Migration bestehender Permalinks — Garantie

| Alt-Link | Verhalten nach dem Umbau | Absicherung |
|---|---|---|
| `#m=<json>` (ohne `o`) | **identisch** — `decodeMapState` liefert `overview: false`, das war schon immer die Semantik | Roundtrip-Verifier gegen eine Fixture-Liste realer Alt-Hashes |
| `#3d=<json>` | **identisch** — Migration in die Schnitt-Linse bleibt (`atmosphereStore.tsx:82-88`) | dito |
| `#atm=`, `#h=`, `#ev=`, `#g=`, `#val`, `#mobiletest` | **identisch** — Payload-Formate werden nicht angefasst | dito |
| `#r=` | war **nie** in Umlauf (nie geschrieben) → keine Alt-Links, rein additiv | — |
| `#route`, `#fc`, `#fb` | neu, rein additiv | — |

**Regel:** Kein bestehendes Payload-Format wird geändert. Das `o`-Feld in `#m=` ist **optional und JSON-additiv** — ein alter Decoder ignoriert unbekannte Felder, ein neuer toleriert das Fehlen. Damit sind Alt→Neu **und** Neu→Alt kompatibel.

**Verifikation (D-10-konform, kein Test-Framework):** `scripts/verify-approute.mjs` importiert `src/appRoute.ts` per `--experimental-strip-types` und prüft (1) Roundtrip aller 12 Routen, (2) Präzedenz `#mobiletest` vor `#m=`, (3) Fixture-Liste echter Alt-Hashes → erwartete Route, (4) Fremd-Hash → `{kind:'search'}`, (5) Determinismus `routeHash(parseRoute(h)) === h`. Muster: `radarState.ts:95-122`.

### 4.6 Was das Modell **nicht** löst (ehrlich)

* Kein Zustand für `route` (die GPX-Datei liegt im Browser des Nutzers — ein Link kann sie nicht mitbringen). `#route` ist ein reiner Feature-Marker.
* Keine Indexierbarkeit durch Suchmaschinen (§4.1 Punkt 2).
* Keine Rückwärts-Navigation *innerhalb* eines Features (z. B. Event-Wizard-Schritt zurück) — das bleibt bewusst Feature-intern, sonst explodiert die History.

---

## 5. Design-System-Abstraktionsplan

> **erweitert V-10.** V-10 nennt die drei Schritte. Hier steht, *welche* Komponenten, *welches* Basis-CSS, *wie* Feature-Tokens namespaced bleiben, *in welcher Reihenfolge* migriert wird und *welches Gate* jede Migration passieren muss.

### 5.1 Zielarchitektur: neues Modul `src/deck/`

```
src/deck/
  deckShell.css     ← EINZIGE Quelle für Topbar/Rail/Dock/Center/Readout/Sheet/Mobile-Header
                       Präfix .dk- · enthält die drei kanonischen Media-Bedingungen (767 / 1439 / Landscape)
  DeckShell.tsx     ← <DeckShell feature="event" topbar rail dock center readout mobile>
  DeckRail.tsx      ← rendert RAIL_ITEMS; onNavigate(FeatureId) — löst §2.1-Attrappe zentral
  DeckSheet.tsx     ← EIN Bottom-Sheet (collapsed 64px / half 45% / full 90%, Guideline §2)
  DeckTopbar.tsx    ← Marke · Trenner · Krümel/Suche · rechts (DATEN LIVE, Avatar, Icon-Buttons)
  deckIcons.tsx     ← Umzug/Re-Export von src/map/deckIcons.tsx (existiert bereits)
  DeckPlaceField.tsx← der EINE Ort-Picker (§6 / V-UX-23), ersetzt die 5 Kopien
```

**Was in `deckShell.css` gehört** (aus den 7 Kopien extrahiert, Werte aus `routeDeck.css:37-89` als Referenz, weil dort die vollständigste Topbar liegt):

`.dk-root` · `.dk-topbar` · `.dk-brandwrap .dk-mark .dk-brand` · `.dk-topdivider` · `.dk-crumb .dk-back .dk-crumb-txt` · `.dk-topsearch` · `.dk-topright .dk-live .dk-live-dot .dk-live-txt .dk-avatar .dk-icon-btn` · `.dk-body` · `.dk-rail .dk-rail-btn .dk-rail-btn--active .dk-rail-spacer` · `.dk-dock .dk-dock-head .dk-dock-count` · `.dk-center` · `.dk-readout` · `.dk-content` · `.dk-scroll` (inkl. Webkit-Scrollbar) · `.dk-sheet*` · `.dk-m-root .dk-m-header .dk-m-scroll` · `.dk-tabbar`.

**Wie Feature-Tokens namespaced bleiben (die Kernfrage):** Die Shell liest **ausschließlich generische** Tokens (`--ink-900`, `--sand-*`, `--cream-50`, `--border-*`, `--stone-*`, `--terracotta-500`, `--shadow-*`). Feature-Abweichungen laufen über **eine** Indirektion pro Variationspunkt statt über eine Kopie des Regelsatzes:

```css
/* deckShell.css — Shell-interne Variablen mit generischen Defaults */
.dk-root { --dk-topbar-bg: var(--cream-50); --dk-rail-icon: var(--terracotta-500); --dk-content-bg: var(--sand-100); }
.dk-topbar   { background: var(--dk-topbar-bg); … }
.dk-rail-btn--active { color: var(--dk-rail-icon); … }

/* designTokens.css — Feature-Tokens bleiben, wo sie sind (--evd-*, --rd-*, --hd-*, --vs-*, --fd-*, --nc-*) */
/* Feature-Deck-CSS — nur noch die Zuordnung, nicht mehr der Regelsatz: */
.dk-root[data-feature="event"] { --dk-rail-icon: var(--evd-rail-icon); }
.dk-root[data-feature="route"] { --dk-rail-icon: var(--rd-rail-icon); --dk-topbar-bg: var(--rd-card); --dk-content-bg: var(--rd-content-bg); }
```

Aus **~238 kopierten Regeln** werden so **~40 Shell-Regeln + 7 Zuordnungsblöcke à 1–5 Zeilen.** Die Token-Namespaces aus `designTokens.css:58-158` bleiben **unangetastet** — D-27 ist gewahrt.

### 5.2 Migrationstechnik: „add-then-subtract" (risikoarm, reversibel)

Ein Big-Bang-Rename von 7 Präfixen wäre ein Regressionsrisiko über 243 KB CSS. Stattdessen pro Deck **zwei** verifizierbare Halbschritte:

1. **Add:** Die Shell-Klasse wird **zusätzlich** aufs Element geschrieben (`className="dk-topbar rd-topbar"`). Da beide Regelsätze wertidentisch sind, ist das Rendering **pixelgleich** → Screenshot-Diff muss leer sein. Vollständig reversibel.
2. **Subtract:** Erst danach werden die nun redundanten `.rd-*`-Deklarationen aus `routeDeck.css` gelöscht und die Klasse aus dem Markup entfernt. Wieder Screenshot-Diff, jetzt mit gemessenem CSS-Byte-Delta.

Jeder Halbschritt ist ein eigener Commit; ein Fehlschlag kostet höchstens einen Revert.

### 5.3 Die Rail wird das Navigations-Rückgrat

`DeckRail.tsx` rendert **eine** Tabelle, die aus `ROUTE_PREFIXES` (§4.3) abgeleitet ist:

```ts
const RAIL_ITEMS = [
  { id: 'map2d',      icon: IconRailMap,     label: 'Wetterkarte' },
  { id: 'nowcast',    icon: IconRailRadar,   label: 'Regenradar' },
  { id: 'route',      icon: IconRailTour,    label: 'Tourenplanung' },
  { id: 'event',      icon: IconRailEvent,   label: 'Event-Planung' },
  { id: 'forecast',   icon: IconRailCompare, label: 'Vorhersage' },
  { id: 'atmosphere', icon: IconRail3D,      label: 'Vertikalschnitt' },
  { id: 'history',    icon: IconRailClock,   label: 'Historie' },
] as const;
```

`<DeckRail active="event" onNavigate={navigate} />` — `navigate` ist die `App`-Funktion aus §4.4. Damit springt „Regenradar" aus jedem Deck ins Regenradar, **mit dem aktuellen Ort** (§6), statt auf die Startseite. Das ist der Kern von „eine App statt 12 Inseln" und wird an **einer** Stelle gelöst.

Funktionserhalt: Der bisherige Weg zur Startseite bleibt erhalten — über Marke/Logo in der Topbar (heute schon so, `RouteDeck.tsx:97`) und den Rail-Fuß-Button.

### 5.4 Bottom-Sheet: eine Implementierung

`DeckSheet.tsx` ersetzt die drei Varianten aus §2.4. Basis ist `src/mobile/BottomSheet.tsx` (bereits guideline-konform, `:6-8`), erweitert um die drei nachweislich benötigten Fähigkeiten aus den Eigenbauten:

* **Zwei-Stufen-Sprung bei langem Zug** (aus `MapView.tsx:2977,2980`),
* **Tap-auf-Kopf öffnet aus `collapsed`** (aus `MapView.tsx:2993`),
* **Scrim mit Rückfall auf `half`** (aus `mapDeck.css:706-712` / `MapView.tsx:3645-3646`),
* konfigurierbare Snap-Höhen mit **guideline-konformen Defaults**; Nowcasts „peek/full" wird auf `collapsed/full` abgebildet (Funktionserhalt: identisches Fahrverhalten, nur ein Zwischenstopp mehr — **vor der Umsetzung von Jan zu bestätigen**, siehe §9).

**V-08-Berührung, wichtig:** V-08 listet die BottomSheet-Primitives als Löschkandidaten. **Sie dürfen nicht gelöscht werden** — sie sind die einzige guideline-konforme Implementierung im Repo und werden hier zur Basis. Zu löschen ist stattdessen `src/mobile/MobilePrimitivesTestPage.tsx` (Scaffold, dessen Zweck laut eigenem Header `:8-10` mit Phase 1 endet) — und das erst nach Jans Freigabe (Löschungen = STOPP & FRAGEN).

### 5.5 Migrationsreihenfolge mit Gates

| Phase | Inhalt | Warum diese Position | Risiko |
|---|---|---|---|
| **D-0 Pilot** | `src/deck/` anlegen; **Route** als Pilot auf die Shell heben (add-then-subtract) | Route hat als einziges Deck bereits eine echte Shell-Komponente (`RouteDeck.tsx:83`) und das zweitkleinste Deck-CSS → beweist die Abstraktion an einem *bereits* Command-Deck-konformen Feature, ohne ein un-migriertes anzufassen | niedrig |
| **D-1** | **Globus** neu auf der Shell (`globe.css` → Deck) | D-27/V-10-Reihenfolge; Neubau ist billiger als Umbau | mittel (eigenes dunkles UI, WebGL-Karte darunter) |
| **D-2** | **Validierung** auf die Shell (`FeaturePage.css`/`ValidationPage.css` → Deck) | D-27-Reihenfolge; kleinste Seite (~380 LOC) | niedrig |
| **D-3** | **Feedback** auf die Shell | D-27-Reihenfolge; löst gleichzeitig `tourTheme.css` aus dem Feedback-Pfad | niedrig |
| **D-4** | `DeckRail` mit echter Navigation in **allen** Decks aktivieren | setzt §4 (Router) voraus | mittel (7 Dateien, aber je 1 Zeile) |
| **D-5** | `DeckPlaceField` + „Mein Ort" (§6) in allen Decks | setzt D-4 voraus (Navigation muss den Ort mitnehmen können) | mittel |
| **D-6** | **Event** und **Nowcast** auf die Shell; `EventPage.css` und `nowcast.css` abtragen | größte Alt-Anteile (76,6 KB / 26,4 KB); `EventResult.tsx` ist Hochrisiko-Datei (`agents.md` §3) | **hoch** |
| **D-7** | **Historie**, **Atmosphäre**, **Vorhersage** auf die Shell; `tourTheme.css` aus allen Fremd-Importen lösen | erst wenn die Shell die `ev-*`/`rt-*`-Ort-Picker-Styles ersetzt hat (§2.4) | mittel |
| **D-8** | **Wetterkarte** auf die Shell | `MapView.tsx` ist Sperrzone und Gegenstand von O-04 — **zuletzt**, koordiniert mit der Rendering-Rolle | **hoch** |
| **D-9** | Alt-CSS-Abriss (V-08) mit Import-Graph-Beleg | erst wenn niemand mehr davon abhängt | niedrig, wenn D-0…D-8 sauber |

**Funktionserhalt-Gate je Phase (verbindlich, alle Punkte belegpflichtig):**

1. **Funktionsinventar** der betroffenen Seite **vorher** schriftlich (jede Schaltfläche, jeder Toggle, jeder Tastaturpfad) — nachher **einzeln** abgehakt. Keine Sammelaussage.
2. **Desktop 1440×900 pixelgleich** (MCP-Screenshot vorher/nachher; bei `add`-Halbschritten muss der Diff **leer** sein).
3. **Mobil 390×844** Screenshot; **Touch-Ziele ≥ 44 px** stichprobenweise nachgemessen.
4. **Konsole sauber**, keine neuen Warnungen.
5. **Keine Long Tasks > 200 ms** bei Deck-Interaktionen.
6. `npm run typecheck` grün; betroffene `verify:*` grün.
7. **CSS-Byte-Delta** dokumentiert (Ziel: monoton fallend ab dem ersten `subtract`).
8. **Breakpoint-Audit:** in der geänderten Datei **nur** 767 / 1439 / Landscape-Bedingung (M1–M4 aus §2.7).

---

## 6. Initiativen

| # | Initiative | Ziel | Aufwand | Wirkung (1–5) | Abhängigkeiten | Definition of Success (messbar) |
|---|---|---|---|---|---|---|
| I-1 | **Hash-Router `appRoute.ts`** (§4) | Jede Ansicht teilbar, Zurück funktioniert | M | **5** | keine (D-06 gewahrt) | 11/11 lebende Features haben einen Hash · `verify:approute` 100 % grün inkl. Alt-Hash-Fixtures · Browser-Zurück wechselt in ≥ 5 stichprobenartig geprüften Pfaden zum vorigen Feature statt die App zu verlassen |
| I-2 | **Rail = echte Navigation** (§5.3) | „Eine App statt 12 Inseln" | S (nach I-1) | **5** | I-1 | 7/7 Decks: jeder Rail-Button öffnet das benannte Feature; 0 Buttons, die auf die Startseite fallen; 0 dekorative `aria-hidden`-Rail-Icons |
| I-3 | **„Mein Ort"-Kontext** (§2.1, V-UX-21) | Ort einmal wählen, überall gültig | M | **5** | I-1, I-2 | 6/6 ortsbezogene Features starten mit dem zuletzt gewählten Ort · Interaktionen bis „Regnet es gleich?" beim Wiederkehrer = **1 Tap** · Hash schlägt Speicher (Deep-Link-Treue nachgewiesen) |
| I-4 | **Geteilte Deck-Shell** (§5) | Ein Designsystem statt sieben Kopien | L | 4 | keine (Pilot autark) | Shell-Regeln von ~238 auf ~40 · Deck-CSS −25…35 % Bytes · 0 Ad-hoc-Breakpoints in `src/deck/**` und in migrierten Decks · jedes Gate §5.5 grün |
| I-5 | **Lokales Profil + Export/Import** (V-UX-22) | Personalisierung ohne Account (D-03) | M | 4 | I-3 | 1 Favoritensystem statt 2 · Migration aus beiden Alt-Keys verlustfrei (Verifier) · Export/Import-Roundtrip stellt alle Profilwerte wieder her |
| I-6 | **Ein Ort-Picker + gehärteter Geocoder** (V-UX-23) | Suche, die Berge und Hütten findet | M | 4 | I-3 | 1 Picker-Komponente statt 5 · 1 Nominatim-Aufrufstelle statt 2 · Trefferquote für eine 30er-Referenzliste DACH-Gipfel/Hütten von Ist (zu messen) auf ≥ 90 % · verständliche Meldung bei 429/Offline |
| I-7 | **Entscheidungs-IA auf der Startseite** (V-UX-26) | Differenzierungs-Achse 1 sichtbar machen | M | 4 | I-1, I-3 | 6 Entscheidungs-Fragen über dem Bento-Grid, jede ein Ein-Tap-Deep-Link · alle 9 Kacheln + 10 Palette-Einträge **unverändert** erhalten (Funktionserhalt einzeln belegt) |
| I-8 | **Ein Bottom-Sheet** (§5.4) | Mobile fühlt sich überall gleich an | M | 3 | I-4 (D-0) | 1 Implementierung statt 3 · Snap-Kontrakt = Guideline §2 · MapView- und Nowcast-Gestenverhalten im Funktionsinventar einzeln abgehakt |
| I-9 | **Mobile-Guideline-Drift beheben** (V-UX-27) | Regeln wieder gültig statt dekorativ | S | 3 | keine | 0 Ad-hoc-Breakpoints in Deck-CSS · Suchfeld ≥ 16 px auf Mobil (kein iOS-Auto-Zoom, Video-/Screenshot-Beleg) · Palette auf Mobil erreichbar · `useIsMobile.ts:3` mit `CLAUDE.md` in Deckung |
| I-10 | **Erstkontakt „Regnet es gleich?"** (V-UX-25) | Wert in einem Tap | S | 4 | I-1, I-3, I-7 | Erstbesuch ≤ 2 Interaktionen bis zur Regenantwort · Intro-Tour-Schritte öffnen ihr Feature (CTA statt „Los geht's" ins Leere) · D-14-Widerspruch auf der Startseite behoben |
| I-11 | **Deck-A11y-Basis** (V-UX-30) | Tastatur- und Screenreader-Basis in der Shell | M | 3 | I-4 | Focus-Trap in Palette und Sheets (Muster `IntroOverlay.tsx:74-83`) · Rail als `role="navigation"` mit Pfeiltasten · `aria-current="page"` in 7/7 Decks korrekt (heute uneinheitlich) |
| I-12 | **Alt-Theme-Migration Globus/Validierung/Feedback** (V-10) | D-27 einlösen | M | 3 | I-4 (D-0) | 3/3 Seiten auf `src/deck/` · `globe.css`, `ValidationPage.css`, `feedback.css` als Deck-CSS ersetzt · `tourTheme.css` aus dem Feedback-Pfad entfernt |

---

## 7. Vorgeschlagene V-Einträge

> Nummerierung `V-UX-NN` gemäß Auftrag; der Koordinator vergibt beim Übertrag nach `improvements.md` die fortlaufenden Nummern ab V-17.

### V-UX-01 · Deck-Rail zu echter Navigation machen  (Priorität P1 · Aufwand M · Status offen)
**Was:** Alle Deck-Rails zeigen Werkzeug-Icons mit sprechenden Titeln, aber jeder nicht-aktive Button führt zur Startseite statt zum benannten Werkzeug: `route/RouteDeck.tsx:105-109`, `event/EventPage.tsx:194-199`, `confidence/ForecastDeck.tsx:371-376`, `atmosphere/AtmosphereDeck.tsx:174-178`, `nowcast/NowcastDeck.tsx:201-207` (alle `onClick={onBack}` bzw. `onHome`, das über `App.tsx:117` immer `goSearch` ist). In der Historie ist „Vorhersage" sogar ein unklickbares `<span aria-hidden="true">` (`history/HistoryPage.tsx:336`). Einzige echte Rail: `MapView.tsx:3491-3497`. **Erweitert V-05 und V-10.**
**Mehrwert:** Vom Regenradar direkt in die Tourenplanung springen — statt jedes Mal über die Startseite und eine neue Ortssuche. buscosun fühlt sich an wie ein Programm mit Werkzeugleiste, nicht wie zwölf getrennte Webseiten.
**Umsetzung:** `src/deck/DeckRail.tsx` mit einer `RAIL_ITEMS`-Tabelle (abgeleitet aus `ROUTE_PREFIXES`, V-UX-02); jedes Deck ersetzt seinen handgeschriebenen Rail-Block durch `<DeckRail active={id} onNavigate={navigate} />`. Setzt V-UX-02 voraus, damit der Sprung einen History-Eintrag erzeugt. Risiko: 7 Dateien betroffen, davon `MapView.tsx` und `EventResult.tsx` Sperrzonen (`agents.md` §3) → dort zuletzt und einzeln. Funktionserhalt: Weg zur Startseite bleibt über Marke + Rail-Fuß erhalten.
**Quelle:** UX & Design-System (Agent-Team), 2026-07-31.

### V-UX-02 · Hash-Router `appRoute.ts` mit Back-Verhalten  (Priorität P1 · Aufwand M · Status offen)
**Was:** Kein `hashchange`-, kein `popstate`-Listener und kein einziges `pushState` im gesamten `src` — nur sieben `replaceState`-Stellen. `App.tsx:78-91` liest den Hash **einmal** beim Start. Vier lebende Features haben gar keinen Hash (`route`, `forecast`, `nowcast`, `feedback`). **Erweitert V-05** um das ausführbare Modell (vollständiges Schema, Präzedenztabelle, Push/Replace-Trennung, Migrationsgarantie) — Details in `audit/strategie-2026-07-31/ux-designsystem.md` §4.
**Mehrwert:** Der Zurück-Button tut, was jeder erwartet: eine Ansicht zurück, statt die App zu verlassen. Und jede Ansicht lässt sich verschicken oder als Lesezeichen ablegen — auch die Tourenplanung und das Regenradar, die heute gar keinen Link haben.
**Umsetzung:** Neues **pures** Modul `src/appRoute.ts` (D-12) mit `ROUTE_PREFIXES`, `parseRoute`, `routeHash`, `verifyAppRoute`; `App.tsx` bekommt `navigate()` (`pushState`) und einen `popstate`/`hashchange`-Sync mit `ownWriteRef`-Wächter. Feature-interne Zustandsschreibungen bleiben `replaceState` (kein History-Müll durch Slider). Neue Hashes: `#route`, `#fc`, `#fb`; `#r=` wird verdrahtet (V-UX-03). Alle bestehenden Payload-Formate bleiben **unverändert** → Alt-Links funktionieren weiter; abgesichert durch `scripts/verify-approute.mjs` mit einer Fixture-Liste echter Alt-Hashes. Keine Dependency (D-06 gewahrt). Risiko: `#mobiletest` muss vor `#m=` geprüft werden — als Verifier-Check festgeschrieben.
**Quelle:** UX & Design-System (Agent-Team), 2026-07-31.

### V-UX-03 · Permalink-Treue: `#r=` verdrahten, Overview kodieren  (Priorität P1 · Aufwand S · Status offen)
**Was:** Zwei konkrete Deep-Link-Defekte. (1) `src/radar/radarState.ts` ist eine **vollständig tote** Permalink-Infrastruktur: `encodeRadarState:40`, `decodeRadarState:52`, `hasRadarHash:72` haben außer dem Verifier (`radar/_verify.ts:11`) keinen Aufrufer — das Radar **schreibt** den Hash nie und `App.tsx` liest ihn nie (`roadmap.md` A5 kennt nur die zweite Hälfte). (2) Der Overview-Modus der Karte (`App.tsx:120`, DACH-Übersicht ohne Marker) ist nicht in `MapState` kodiert (`mapState.ts:16-20`) — `MapView.tsx:2941-2945` schreibt trotzdem einen `#m=`-Hash, der beim Öffnen die *normale* Karte mit Punktpanel wiederherstellt. **Erweitert V-05.**
**Mehrwert:** „Schau dir das Gewitter über Innsbruck an" wird ein Link, den man verschicken kann — mit genau den Ebenen, der Farbskala und der Minute, die man selbst sieht. Und ein geteilter Überblickslink zeigt beim Empfänger denselben Überblick.
**Umsetzung:** In `NowcastRadarMap.tsx` neben dem bestehenden `saveLastView` (`:255`) auch `encodeRadarState` in den Hash schreiben (`replaceState`); `parseRoute` (V-UX-02) liest `#r=`. Für (2): optionales Feld `o` im `#m=`-Payload ergänzen (`mapState.ts:36-41,45-57`) — JSON-additiv, alte Links bleiben gültig; `App.tsx` reicht `overview` durch. Verifier `verify:radarstate` um einen App-Route-Roundtrip erweitern.
**Quelle:** UX & Design-System (Agent-Team), 2026-07-31.

### V-UX-04 · Geteilte Deck-Shell `src/deck/`  (Priorität P1 · Aufwand L · Status offen)
**Was:** Die Command-Deck-Muster sind siebenfach **wörtlich** kopiert: ~238 Shell-Regeln über `mapDeck.css` (49,3 KB), `historyDeck.css` (35,7 KB), `eventDeck.css` (34,1 KB), `routeDeck.css` (29,0 KB), `atmosphereDeck.css` (26,1 KB), `forecastDeck.css` (20,8 KB), `nowcastDeck.css` (20,0 KB) — z. B. `.rd-topbar` (`routeDeck.css:38-49`) und `.evd-topbar` (`eventDeck.css:34-45`) sind wertidentisch, ebenso die kompletten Rail-Blöcke. Die Namespaces sind zusätzlich **faktisch bereits gebrochen**: `tourTheme.css` (37,8 KB) ist der inoffizielle gemeinsame Basis-Layer, importiert von fünf fremden Features, und definiert Event-präfigierte Ort-Picker-Klassen (`.ev-search-wrap:458`, `.ev-loc-chip:492`), die Nowcast (`NowcastLocationField.tsx:53`), Vorhersage, Atmosphäre und Historie benutzen. **Erweitert V-10 (Schritt 1).**
**Mehrwert:** Eine Design-Änderung — z. B. eine höhere Topbar oder ein neues Rail-Icon — muss künftig **einmal** gemacht werden statt siebenmal. Das halbiert den Pflegeaufwand und verhindert, dass Seiten mit der Zeit auseinanderdriften.
**Umsetzung:** Neues Modul `src/deck/` (`deckShell.css`, `DeckShell.tsx`, `DeckTopbar.tsx`, `DeckRail.tsx`, `DeckSheet.tsx`, `deckIcons.tsx`). Feature-Tokens bleiben in `designTokens.css` namespaced; die Shell liest nur generische Tokens und bietet je Variationspunkt **eine** Indirektion (`.dk-root[data-feature="event"] { --dk-rail-icon: var(--evd-rail-icon); }`) — statt eines kopierten Regelsatzes. Technik: **add-then-subtract** (Shell-Klasse zusätzlich aufs Element → Screenshot-Diff muss leer sein → dann Alt-Regeln löschen), jeder Halbschritt ein eigener Commit und damit revertierbar. Reihenfolge und Gates: §5.5 des Audits. Risiko: `MapView.tsx` (O-04-Sperrzone) und `EventResult.tsx` zuletzt und in Abstimmung mit der Rendering-Rolle.
**Quelle:** UX & Design-System (Agent-Team), 2026-07-31.

### V-UX-05 · Ein Bottom-Sheet statt drei  (Priorität P1 · Aufwand M · Status offen)
**Was:** Drei divergente Sheets mit drei Gesten-Implementierungen: `src/mobile/BottomSheet.tsx:6-8` (collapsed 64 px / half 45 vh / full 90 vh — **exakt guideline-konform, aber nur über `#mobiletest` erreichbar**), `MapView.tsx:2955-2995` mit `mapDeck.css:719-721` (128 px / **feste 430 px** / 78 dvh) und `NowcastDeck.tsx:557-573` (nur zwei Stufen: peek 34 vh / full 92 vh). `mobile-design-guidelines.md` §2 schreibt **einen** Kontrakt vor. **Erweitert V-08 mit einer Korrektur:** die BottomSheet-Primitives dürfen **nicht** gelöscht werden — sie sind die einzige regelkonforme Implementierung und werden zur Basis; Löschkandidat ist stattdessen die Testseite `mobile/MobilePrimitivesTestPage.tsx`.
**Mehrwert:** Das Panel unten fährt auf jeder Seite gleich — gleicher Griff, gleiche Stufen, gleiches Gefühl. Nutzer müssen die Bedienung nicht pro Feature neu lernen, und Wisch-Konflikte mit der Karte werden an einer Stelle richtig gelöst statt dreimal halb.
**Umsetzung:** `src/deck/DeckSheet.tsx` auf Basis von `mobile/BottomSheet.tsx`, ergänzt um die drei bewährten Fähigkeiten der Eigenbauten (Zwei-Stufen-Sprung bei langem Zug `MapView.tsx:2977`, Tap-öffnet-aus-collapsed `:2993`, Scrim mit Rückfall auf half `:3645`), Snap-Höhen konfigurierbar mit guideline-konformen Defaults. Nowcasts „peek/full" wird auf „collapsed/full" abgebildet — **das ist eine Verhaltensänderung und braucht Jans Freigabe** (§9). Funktionserhalt-Gate: Gestenverhalten beider Bestandssheets einzeln abgehakt.
**Quelle:** UX & Design-System (Agent-Team), 2026-07-31.

### V-UX-06 · „Mein Ort" — ein Standort-Kontext für alle Features  (Priorität P1 · Aufwand M · Status offen)
**Was:** Kein Feature übernimmt den gewählten Ort. Alle starten mit `null` und fragen neu: `nowcast/NowcastPage.tsx:79`, `confidence/ForecastPage.tsx:50`, `event/EventPage.tsx:57`, `history/HistoryPage.tsx:97`, `atmosphere/atmosphereStore.tsx:89`. `SearchPage.onSelect` führt zudem **immer** zur 2D-Karte (`App.tsx:135`) — ein gesuchter Ort kann nie direkt ins Regenradar. Geolocation gibt es genau einmal (`NowcastPage.tsx:86-91`).
**Mehrwert:** Ort einmal sagen, dann gilt er überall: Regenradar, Karte, Tour, Event, Rückblick. Das spart bei jedem Feature-Wechsel eine Tipp-Eingabe — der mit Abstand häufigste Reibungspunkt der App.
**Umsetzung:** `src/location/placeStore.ts` — kleiner React-Context plus **pures** Persistenzmodul (D-12), Key `buscosun.place.v1` mit `{ current, favorites[], recents[] }`. Präzedenz beim Feature-Start: **Hash > gespeicherter Ort > null** (Deep-Link-Treue bleibt absolut). Jedes Feature ersetzt nur seinen `useState<Location|null>(null)`-Initialwert; **die Ort-Picker bleiben unverändert erhalten** (Funktionserhalt) — sie sind dann nur schon ausgefüllt und schreiben durch. „Mein Standort" (Geolocation) wandert aus dem Nowcast in den geteilten Picker. Abhängigkeit: V-UX-02 (die Rail-Navigation muss den Ort mitnehmen). D-03 gewahrt: rein lokal, kein Konto.
**Quelle:** UX & Design-System (Agent-Team), 2026-07-31.

### V-UX-07 · Lokales Profil mit Export/Import  (Priorität P1 · Aufwand M · Status offen)
**Was:** 21 statische `localStorage`-Schlüssel plus eine dynamische Familie (`buscosun.vsd.limit.<key>`, `atmosphere/AtmosphereDeck.tsx:494`), verstreut über 19 Dateien, ohne gemeinsames Modell, ohne Versionierung, ohne Migrationspfad — drei davon ohne `buscosun.`-Präfix (`fusion2d.default` in `fusion/modelSource.ts:83`, `bs-temp-labels-v1` in `temperatureLabels.ts:31`, `bc_wind_now_v2` in `wind/iconD2WindSource.ts:684`). Zwei inkompatible Favoritensysteme: `favorites.ts` (Dedupe 3 Nachkommastellen, Limit 8) gegen `history/historyState.ts:131-150` (Dedupe 0,01°, Limit 12, plus „Zuletzt"-Liste). **Erweitert V-04:** V-04 behebt den Defekt (Anlegen verdrahten), dieser Eintrag liefert das Datenmodell dahinter.
**Mehrwert:** Alles, was buscosun sich über den Nutzer merkt — Orte, Aktivitäts-Grenzwerte, Einheiten, Layer-Voreinstellungen, Einwilligungen — an **einer** Stelle, versioniert und in einer Datei exportierbar. Das ist die ehrliche Antwort auf „ich will meine Einstellungen auf dem Handy auch haben", ohne je ein Konto zu verlangen (D-03).
**Umsetzung:** `src/profile/profileStore.ts` mit versioniertem Schema `{ v: 1, places, activities, units, layerPresets, consents, ui }`; Einmal-Migration liest `buscosun.favorites.v1` **und** `buscosun.history.favorites.v1`/`.recents.v1` und führt sie auf dem gröberen Raster zusammen (verlustfrei, Verifier belegt). Bestehende Feature-Keys werden **nicht** sofort abgelöst, sondern schrittweise gespiegelt (Flag-Gating nach D-11, Fallback = heutige Keys). Export: `buscosun-profil.json` per Blob-Download, Import per File-Input mit Schema-Validierung und Vorschau. Ehrlichkeitshinweis im Export-Dialog (D-04): „enthält deine gespeicherten Orte". Abhängigkeit: V-UX-06.
**Quelle:** UX & Design-System (Agent-Team), 2026-07-31.

### V-UX-08 · Ein Ort-Picker, gehärteter Geocoder, Berge & Hütten  (Priorität P1 · Aufwand M · Status offen)
**Was:** Fünf parallele Ort-Picker (`SearchPage.tsx:257`, `nowcast/NowcastLocationField.tsx:9`, `event/EventPage.tsx:224`, `confidence/ForecastPage.tsx:99`, `atmosphere/AtmospherePage.tsx:146`) und **zwei** Nominatim-Aufrufstellen — der gemeinsame Helfer `geocode.ts:23` und eine wörtliche Kopie ohne Abort-Handling in `SearchPage.tsx:287-295`. Kein Cache, kein Backoff, keine spezifische Meldung bei Rate-Limit (der Nutzer sieht `Geocoder: 429`, `geocode.ts:31`). Die DACH-Begrenzung läuft nur über `countrycodes` — ohne Bounding-Box und ohne `featureType`, weshalb Gipfel, Hütten, Seen und Pässe nur zufällig gut ranken. Suchbezogene Nominatim-Attribution fehlt (nur Karten-Attribution im Footer, `SearchPage.tsx:726`).
**Mehrwert:** „Watzmann", „Franz-Senn-Hütte" oder „Timmelsjoch" findet man dann genauso zuverlässig wie „München" — für eine Berg- und Touren-App ist das der eigentliche Suchfall. Und wenn der Suchdienst mal streikt, sagt die App das verständlich, statt eine Fehlernummer zu zeigen.
**Umsetzung:** (1) `src/deck/DeckPlaceField.tsx` als **der eine** Picker (Command-Deck-konform, Topbar- und Panel-Variante); alle fünf Bestandspicker werden darauf umgestellt, **keine Funktion entfällt** (Geolocation, Ändern-Aktion, Höhenanzeige aus `EventPage.tsx:256` wandern mit). (2) `geocode.ts` wird alleinige Aufrufstelle: In-Memory-LRU + `sessionStorage`-Cache, 1-req/s-Drossel, 429/Offline-Meldungen in Klartext, sichtbare Nominatim-Attribution an der Ergebnisliste. (3) **Berge/Hütten/POI — zu verifizieren:** favorisierter Weg ist ein **zur Bauzeit erzeugtes statisches JSON** (`public/places-dach.json`) aus Overpass/OSM (`natural=peak`, `tourism=alpine_hut|wilderness_hut`, `mountain_pass=yes`), analog zum Muster von `scripts/generate-seo.mjs` — kein Laufzeit-Dienst, keine Rate-Limits, D-01/D-06 gewahrt. Zu klären vor der Umsetzung: Datenmenge/Bundle-Budget, Lizenz-/Attributionspflicht (ODbL), Aktualisierungs-Kadenz. Alternativen GeoNames (braucht Zugangskennung) und Nominatim-`featureType` (Ranking unklar) sind **nicht** geprüft.
**Quelle:** UX & Design-System (Agent-Team), 2026-07-31.

### V-UX-09 · Command-Palette: Orte und Mobil  (Priorität P1 · Aufwand S · Status offen)
**Was:** Zwei Versprechen der Palette werden nicht eingelöst. (1) Platzhalter und Trigger sagen „**Ort suchen** oder Werkzeug springen …" (`SearchPage.tsx:210,779`), der Filter arbeitet aber ausschließlich über die 10 Werkzeug-Einträge (`:745-749`) — Orte kann sie nicht. (2) Auf Mobil ist sie **vollständig unerreichbar**: der Trigger ist ausgeblendet (`SearchPage.css:485`, `.deck-kbar { display: none; }`) und ⌘K braucht eine Tastatur (`SearchPage.tsx:122-131`); die Mobile-Tab-Bar bietet nur „Suche", was ins Geocode-Feld fokussiert (`:832`).
**Mehrwert:** Ein Feld für alles: Ort tippen oder Werkzeug tippen, Enter — der schnellste Weg durch die App. Und Handy-Nutzer bekommen ihn überhaupt erst.
**Umsetzung:** Palette um eine Orte-Sektion erweitern (gespeicherte Orte und Zuletzt aus V-UX-06 sofort, Geocode-Treffer per Enter über den gedrosselten Geocoder aus V-UX-08); Auswahl eines Ortes setzt „Mein Ort" **und** öffnet das zuletzt genutzte ortsbezogene Werkzeug. Auf Mobil ersetzt der „Suche"-Tab der Bottom-Bar (`SearchPage.tsx:832`) das Fokussieren durch das Öffnen der Palette als Vollbild-Sheet (`DeckSheet`, V-UX-05) — Funktionserhalt: das Hero-Suchfeld bleibt unverändert erreichbar. A11y: Focus-Trap nach dem Muster `intro/IntroOverlay.tsx:74-83` (heute fehlt er in der Palette).
**Quelle:** UX & Design-System (Agent-Team), 2026-07-31.

### V-UX-10 · Erstkontakt: „Regnet es gleich?" in einem Tap  (Priorität P1 · Aufwand S · Status offen)
**Was:** Der schnellste Weg zur Regenantwort kostet heute mindestens drei Interaktionen inklusive einer Texteingabe (Startseite → Kachel `SearchPage.tsx:527` → Idle-Screen → Ort tippen bzw. „Mein Standort" `NowcastPage.tsx:154`) — und beim nächsten Besuch identisch, weil kein Ort gemerkt wird. Das Hero-Suchfeld führt stattdessen zur 2D-Karte (`App.tsx:135`). Die Intro-Tour (9 Schritte, `intro/introSteps.tsx`) erklärt jedes Feature, öffnet aber keines: der Abschluss-CTA ist `tour.close` (`intro/IntroOverlay.tsx:146`). Zusätzlich widersprechen zwei Startseiten-Texte **D-14**: „0–2 h Radar, **2–6 h ICON-D2**" (`SearchPage.tsx:539`) und „Regen **0–6 h**" (`:81`) — die Ansicht ist seit N1 radar-only bis 2 h.
**Mehrwert:** Wer buscosun zum ersten Mal öffnet, hat in zwei Schritten die Antwort auf die häufigste Wetterfrage überhaupt. Wer wiederkommt, in einem. Und die Startseite verspricht nichts mehr, was die App nicht liefert.
**Umsetzung:** (1) Über dem Hero eine „Regnet es gleich?"-Aktion, die mit „Mein Ort" (V-UX-06) direkt `#r=` öffnet und ohne gespeicherten Ort einmalig Geolocation anbietet — Command-Deck-konform als primäre Aktionspille, das Bento-Grid bleibt **vollständig unverändert**. (2) Jeder Intro-Schritt bekommt neben „Weiter" einen „Jetzt öffnen"-CTA auf sein Feature (die Schritt-IDs `map/radar/route/event/forecast/globe/atmosphere` in `introSteps.tsx` entsprechen bereits `FeatureId`s). (3) Die zwei D-14-Widersprüche in `SearchPage.tsx:539,81` korrigieren. Abhängigkeit: V-UX-02, V-UX-06.
**Quelle:** UX & Design-System (Agent-Team), 2026-07-31.

### V-UX-11 · Entscheidungs-Einstieg auf der Startseite  (Priorität P2 · Aufwand M · Status offen)
**Was:** Die Startseite ist ein **Werkzeug**-Katalog, kein **Entscheidungs**-Einstieg. Die Filter-Chips heißen „Alle / Karten & Radar / Planen / Verstehen / Erkunden" (`SearchPage.tsx:417-423`) — eine Werkzeug-Taxonomie. Von 9 Kachel-Titeln sind nur 3 als Frage formuliert (`:538,516,472`). Damit landet ein neuer Nutzer im Layer-Umschalter statt bei seiner Entscheidung — obwohl genau die Entscheidungs-Features (Tour zur Ankunftszeit, Event-Phasen + Plan B, E-Bike-Akku) laut `roadmap.md` §C die Differenzierungs-Achse 1 tragen.
**Mehrwert:** Nutzer kommen mit einer Frage, nicht mit einem Werkzeugwunsch. Wer „Passt das Wetter für meine Tour am Samstag?" liest, versteht sofort, wofür buscosun da ist — und findet Funktionen, die im Kachelraster als „Tourenplanung" untergehen.
**Umsetzung:** **Rein additiv** über dem Bento-Grid: eine Zeile mit 6 Entscheidungs-Fragen, jede ein Ein-Tap-Deep-Link mit „Mein Ort" — „Regnet es gleich?" → `#r=` · „Passt das Wetter für meine Tour?" → `#route` · „Welcher Tag passt für mein Event?" → `#ev=` · „Kann ich fliegen / die Drohne starten?" → `#atm=` (Go-No-Go-Linse) · „Wie wird's morgen bei mir?" → `#m=` · „Wie hat sich das Wetter bei mir verändert?" → `#h=`. Muster und Präzedenz existieren bereits im Repo: `history/historyState.ts:162-169` (`QUESTION_TILES`) macht genau das innerhalb der Historie — keine Erfindung, nur Hochziehen auf die Startseite. **Funktionserhalt zwingend:** alle 9 Kacheln, alle 10 Palette-Einträge, alle Footer-Links und die Filter-Chips bleiben **unverändert** erhalten und werden im Gate einzeln abgehakt. Abhängigkeit: V-UX-02, V-UX-06.
**Quelle:** UX & Design-System (Agent-Team), 2026-07-31.

### V-UX-12 · Mobile-Guideline-Drift beheben  (Priorität P1 · Aufwand S · Status offen)
**Was:** Sieben belegte Abweichungen von `mobile-design-guidelines.md` bzw. `CLAUDE.md`. Ad-hoc-Breakpoints statt 767/1439: `confidence/forecastDeck.css:195` (1400 px), `nowcast/nowcastDeck.css:259` (1024 px), `SearchPage.css:448` (768–1024 px) und `:534` (400 px). Das Suchfeld der Startseite steht auf Mobil auf **15 px** (`SearchPage.css:497`, innerhalb `@media (max-width:767px)`) → iOS zoomt beim Fokus automatisch hinein, entgegen Guideline §3. Die Command-Palette ist auf Mobil unerreichbar (`SearchPage.css:485`) — Guideline §7 verbietet ausdrücklich, Funktionen hinter „Desktop only" zu verstecken. `atmosphereDeck.css` hat als einziges Deck **keinen** 767-px-Block. Und der Breakpoint-Kommentar im Code widerspricht der Verfassung: „tablet 768–1024px, desktop > 1024px" (`mobile/useIsMobile.ts:3`) gegen 767/1439 in `CLAUDE.md`.
**Mehrwert:** Auf dem Handy hüpft die Seite beim Antippen des Suchfelds nicht mehr weg — der häufigste Ärger auf iPhones. Und die Layouts brechen an denselben Stellen um wie überall sonst, statt an vier zufälligen Zwischengrößen.
**Umsetzung:** Vier Media Queries auf die kanonischen Breakpoints ziehen (visuelle Prüfung bei 1024/1400/1439 px vorher/nachher — bei `forecastDeck` und `nowcastDeck` ist das eine echte Layout-Änderung im Tablet-Bereich und braucht einen eigenen Screenshot-Beleg). Suchfeld auf `16px` (die einzige Zeile `SearchPage.css:497`). Palette-Zugang auf Mobil über V-UX-09. Kommentar in `useIsMobile.ts:3` mit `CLAUDE.md` in Deckung bringen. Die Landscape-Bedingung `(max-height: 430px) and (orientation: landscape)` (`mapDeck.css:650,914`) wird als **drittes kanonisches Token** in `deckShell.css` festgeschrieben statt weiter kopiert. Der Rest der Ad-hoc-Breakpoints (20+ in den Alt-Stylesheets, u. a. `route/tourTheme.css`, `history/history.css`, `event/EventPage.css`) verschwindet mit V-08/V-UX-04.
**Quelle:** UX & Design-System (Agent-Team), 2026-07-31.

### V-UX-13 · Event- und Nowcast-Migration vollenden  (Priorität P2 · Aufwand M · Status offen)
**Was:** V-10 nennt Globus, Validierung und Feedback als Alt-Chrome-Fälle. Verifiziert ist: auch **bereits migrierte** Features laufen doppelt. `event/EventResult.tsx` benutzt **179 `.ev-*`-Klassen gegen 192 `.evd-*`-Klassen** und importiert dafür `EventPage.css` (**76,6 KB — die größte CSS-Datei des Repos**, `EventResult.tsx:50`) zusätzlich zu `eventDeck.css`. Nowcast lädt `nowcastDeck.css` + `nowcastMobile.css` **und** `nowcast.css` + `tourTheme.css` + `radar.css` + `ml.css` (`NowcastPage.tsx:21-24`, `NowcastRadarMap.tsx:48-49`), wobei `NowcastLocationField.tsx:42,53` Klassen rendert, die in `route/tourTheme.css:458,492` definiert sind. Historie, Vorhersage und Atmosphäre laden ebenfalls je zwei bis vier Stylesheets. **Erweitert V-10 und V-08.**
**Mehrwert:** Weniger Ballast bei jedem Seitenaufbau — und vor allem: eine Änderung am Event-Ergebnis wirkt sich nicht mehr überraschend auf das Regenradar aus, weil beide heute an derselben Alt-Datei hängen.
**Umsetzung:** Teil der Deck-Shell-Migration (V-UX-04, Phasen D-6/D-7). Kritischer Pfad: die `ev-`/`rt-`-Ort-Picker-Styles aus `tourTheme.css:458-500` werden durch `DeckPlaceField` (V-UX-08) ersetzt — erst danach lässt sich `tourTheme.css` aus fünf fremden Features lösen. `EventResult.tsx` ist Hochrisiko-Datei (`agents.md` §3): eigene Phase, eigenes Gate, keine Parallelarbeit. Löschungen erst mit Import-Graph-Beleg und Jans Freigabe.
**Quelle:** UX & Design-System (Agent-Team), 2026-07-31.

### V-UX-14 · A11y-Basis in der Deck-Shell  (Priorität P1 · Aufwand M · Status offen)
**Was:** Die beste Overlay-Implementierung des Repos ist die Intro-Tour: echter Focus-Trap, Fokus-Restore, ESC und Pfeiltasten (`intro/IntroOverlay.tsx:54-83`). Sie ist **die einzige**. Die Command-Palette hat `role="dialog" aria-modal="true"` (`SearchPage.tsx:773`), aber **keinen** Focus-Trap — Tab läuft hinter das Overlay. Die Bottom-Sheets setzen `aria-modal` abhängig vom Snap (`MapView.tsx:3651`), ebenfalls ohne Trap. Die Rails sind uneinheitlich ausgezeichnet: `<nav aria-label="Werkzeuge">` in `RouteDeck.tsx:104` und `ForecastDeck.tsx:370`, aber ein einfaches `<div className="rr-rail">` im Nowcast (`NowcastDeck.tsx:200`); `aria-current="page"` ist meist gesetzt, in `HistoryPage.tsx:335` aber auf einem `<span>`. Tastatur-Navigation innerhalb der Rail gibt es nirgends. **Erweitert V-12** um den konkreten Shell-Anteil.
**Mehrwert:** Wetter ist Grundversorgung. Wer die Maus nicht benutzen kann oder einen Screenreader nutzt, kommt heute an Palette und Panels nicht sinnvoll vorbei. In der geteilten Shell wird das **einmal** richtig gebaut statt siebenmal vergessen.
**Umsetzung:** `src/deck/useFocusTrap.ts` — der bewährte Trap aus `IntroOverlay.tsx:74-83` als wiederverwendbarer Hook; angewendet in `DeckSheet` und `CommandPalette`. `DeckRail` rendert `<nav role="navigation" aria-label="Werkzeuge">` mit Pfeiltasten-Roving-Tabindex und korrektem `aria-current="page"` auf einem **fokussierbaren** Element. Abhängigkeit: V-UX-04. Abstimmung mit der Rolle A11y & i18n, damit sich das Programm aus V-12 nicht überschneidet.
**Quelle:** UX & Design-System (Agent-Team), 2026-07-31.

---

## 8. Bewertung gegen die vier Differenzierungs-Achsen (`roadmap.md` §C)

Achsen: **(1)** Entscheidungs- statt Datenprodukt · **(2)** Alpin-/Vertikal-Tiefe · **(3)** radikale Ehrlichkeit · **(4)** trackerfrei / ohne Account / schnell.

| V-Eintrag | A1 Entscheidung | A2 Alpin | A3 Ehrlichkeit | A4 frei & schnell | Begründung |
|---|:--:|:--:|:--:|:--:|---|
| V-UX-01 Rail-Navigation | ●●● | ● | — | ●● | Entscheidungs-Features (Tour, Event, Regen) werden aus jedem Kontext in einem Tap erreichbar |
| V-UX-02 Hash-Router | ●● | — | ● | ●●● | Teilen/Bookmarken ist die kontolose Alternative zu Konto-Sync; Zurück-Verhalten ist Basis-Ergonomie |
| V-UX-03 Permalink-Treue | ●● | — | ●● | ●● | Ein geteilter Link zeigt exakt das, was der Absender sah — Ehrlichkeit im Wortsinn |
| V-UX-04 Deck-Shell | ● | — | — | ●● | mittelbar: weniger CSS, schnellerer Aufbau, halber Pflegeaufwand |
| V-UX-05 Ein Bottom-Sheet | ● | — | — | ●● | konsistente Bedienung, ein Gesten-Fix statt drei |
| V-UX-06 „Mein Ort" | ●●● | ●● | — | ●●● | Voraussetzung für jede Ein-Tap-Entscheidung; alpine Nutzer wechseln häufig Feature bei gleichem Gipfel; lokal, kein Konto |
| V-UX-07 Lokales Profil | ●● | ●● | ●● | ●●● | Aktivitäts-Schwellen (Böen-Limit, Höhe AGL) sind Entscheidungs-Parameter; Export/Import ist **die** ehrliche Konto-Alternative (D-03) |
| V-UX-08 Ort-Picker/Geocoder | ●● | ●●● | ● | ●● | Gipfel/Hütten/Pässe finden ist der alpine Kern-Suchfall; ehrliche Fehlermeldung statt Fehlernummer |
| V-UX-09 Palette Orte + Mobil | ●● | ● | — | ●●● | schnellster Pfad durch die App; behebt eine Desktop-only-Funktion |
| V-UX-10 Erstkontakt | ●●● | — | ●●● | ●●● | Achse 1 im ersten Moment erlebbar; korrigiert zwei D-14-Widersprüche auf der Startseite |
| V-UX-11 Entscheidungs-IA | ●●● | ●● | ● | ● | die Achse-1-These wird zur Informationsarchitektur statt nur zur Feature-Liste |
| V-UX-12 Mobile-Drift | ● | ● | — | ●●● | iOS-Auto-Zoom und unerreichbare Palette sind direkte Geschwindigkeits-/Zugangsverluste |
| V-UX-13 Migration vollenden | — | — | — | ●● | Bundle- und Klarheitsgewinn |
| V-UX-14 Deck-A11y | ● | — | ●● | ●● | „ehrlichste App" muss auch die zugänglichste sein — im DACH-Wettermarkt unbesetzt |

**Gesamteinschätzung der Rolle:** Der stärkste Hebel für Achse 1 ist **nicht** ein neues Feature, sondern das Trio **V-UX-02 + V-UX-06 + V-UX-01** — Router, Ortskontext, echte Rail. buscosun **hat** die Entscheidungs-Features bereits (Tour zur Ankunftszeit, Event-Phasen + Plan B, E-Bike-Akku, Go-No-Go); sie sind nur hinter zwölf getrennten Einstiegen mit zwölf getrennten Ortssuchen vergraben. Achse 4 („schnell") wird heute technisch exzellent bedient (Code-Splitting, Durable-Edge-Cache, Warm-up), **erlebt** aber durch Reibung in der Navigation verwässert: die schnellste Karte nützt wenig, wenn davor drei Interaktionen und eine Texteingabe liegen.

---

## 9. STOPP & FRAGEN an Jan

1. **`dayflow` — behalten oder streichen?** Die `FeatureId` existiert nur in der Typunion (`App.tsx:29`), es gibt keine Seite, keine Kachel, keinen Hash; `docs/zielgruppen-dach.md:45` verweist auf ein Mockup (`mockups-v2/18-tagesablauf-24h.svg`). Optionen: (a) als geplantes Feature stehen lassen und im Router als reservierte Route führen, (b) aus der Union entfernen (= Löschung → braucht deine Freigabe). **Keine Entscheidung ohne dich.**
2. **Nowcast-Sheet: zwei oder drei Stufen?** Die Vereinheitlichung (V-UX-05) bildet „peek 34 vh / full 92 vh" (`NowcastDeck.tsx:557`) auf den Guideline-Kontrakt „collapsed / half / full" ab. Das ist eine **spürbare Verhaltensänderung** an einer bestehenden Funktion — Funktionserhalt-Direktive greift, deshalb Freigabe erforderlich.
3. **Löschungen (alle STOPP-pflichtig):** `src/route/RoutePage.css` (5,4 KB, **nirgends importiert** = beweisbar tot), `src/mobile/MobilePrimitivesTestPage.tsx` samt `#mobiletest`-Route (Scaffold, dessen Zweck laut eigenem Header `:8-10` erfüllt ist). **Gegenanweisung zu V-08:** `src/mobile/BottomSheet.tsx` + `.css` bitte **nicht** löschen — sie sind die einzige guideline-konforme Sheet-Implementierung und werden Basis von `DeckSheet`.
4. **Tablet-Layout ändert sich sichtbar.** Das Ziehen von `forecastDeck.css:195` (1400 px) und `nowcastDeck.css:259` (1024 px) auf 1439 px verschiebt den Umbruchpunkt bei diesen beiden Features. Soll das mit Screenshot-Beleg gemacht werden, oder bleiben die Ausnahmen mit dokumentierter Begründung stehen?
5. **Startseiten-Texte widersprechen D-14.** „0–2 h Radar, 2–6 h ICON-D2" (`SearchPage.tsx:539`) und „Regen 0–6 h" (`:81`) versprechen den 2026-07-24 von dir gestrichenen Modell-Teil. Sofort korrigieren (P0-Ehrlichkeit) oder gebündelt mit V-UX-10?
6. **Neue POI-Datenquelle für Berge/Hütten.** Der Vorschlag (statisches, zur Bauzeit erzeugtes `public/places-dach.json` aus OSM/Overpass) fügt keine Runtime-Dependency hinzu, aber eine Bauzeit-Abhängigkeit, ein Bundle-Budget und eine ODbL-Attributionspflicht. Grundsatzfreigabe nötig, bevor Aufwand hineinfließt.
7. **Nominatim-Attribution.** Für die Ortssuche fehlt ein suchbezogener Hinweis (nur Karten-Attribution im Footer, `SearchPage.tsx:726`). Ich bin nicht der Rechts-Owner — bitte an die Rolle SEO/GEO & Recht zur verbindlichen Prüfung geben.
8. **Reihenfolge-Abweichung gegenüber V-10.** V-10/D-27 nennt Globus → Validierung → Feedback. Ich schlage **davor** einen additiven Pilot auf dem Routen-Deck vor (§5.5, Phase D-0), damit die Shell an einem bereits Command-Deck-konformen Feature bewiesen wird, bevor ein Alt-Theme umgebaut wird. Die D-27-Reihenfolge der eigentlichen **Migrationen** bleibt unverändert. Einverstanden?
9. **Berührung mit O-04 (MapView-Zerlegung).** Die Deck-Shell-Migration der Wetterkarte (Phase D-8) fasst `MapView.tsx` an — Sperrzone und Gegenstand der Rendering-Rolle. Vorschlag: die Deck-UI-Extraktion aus MapView wird **Teil** des O-04-Zerlegeplans, nicht ein paralleler Umbau. Zuschnitt muss der Koordinator vor Arbeitsbeginn festlegen (`agents.md` §3).

---

## 10. Gefundene Doku-Inkonsistenzen

| # | Behauptung | Realität am Code | Quelle |
|---|---|---|---|
| K1 | `roadmap.md` A5 / V-05: „`#r=` wird von `App.tsx` nie geprüft" | Stimmt — **und** das Radar schreibt den Hash nie. `encodeRadarState`/`decodeRadarState`/`hasRadarHash` haben außer `radar/_verify.ts:11` **keinen** Aufrufer. Beide Enden fehlen. | §2.2 |
| K2 | `decisions.md` D-03: „20 `buscosun.*`-localStorage-Keys" | **21 statische** Keys plus eine dynamische Familie (`buscosun.vsd.limit.<key>`, `AtmosphereDeck.tsx:494`); zusätzlich **drei Keys ohne `buscosun.`-Präfix** (`fusion2d.default`, `bs-temp-labels-v1`, `bc_wind_now_v2`) | §2.3 |
| K3 | V-08: „tote … BottomSheet-Primitives" | `BottomSheet.tsx`/`.css` und `MobileToolbar.tsx`/`.css` sind ungenutzt — **aber** `useIsMobile.ts` aus demselben Ordner wird von 6 Features genutzt, und `safeArea.css` von 4. „Die `mobile/*`-Primitives" pauschal als tot zu führen ist falsch. Zudem ist `BottomSheet.tsx` die **einzige** guideline-konforme Sheet-Implementierung. | §2.4, §5.4 |
| K4 | V-08: „tote `EventPage.css`" | `EventPage.css` (76,6 KB) ist **aktiv importiert** (`EventResult.tsx:50`) und liefert 179 verwendete `.ev-*`-Klassen. Nicht tot, sondern **parallel** — die Migration ist zur Hälfte offen. Tatsächlich tot ist `route/RoutePage.css` (kein Import im Repo). | §2.4 |
| K5 | `architecture.md` §9: „per-Feature-Token-Namespaces" | Für die **Token** korrekt (`designTokens.css:58-158`). Für die **Klassen** faktisch gebrochen: `tourTheme.css` definiert `.ev-search-wrap:458` / `.ev-loc-chip:492`, die von fünf fremden Features benutzt werden; `.ev-search-wrap` wird in sieben Stylesheets definiert/überschrieben. | §2.4 |
| K6 | `docs/zielgruppen-dach.md:30` listet „KI-Meteorologe (`assistant`)" als SHIPPED; `:28` behandelt `threed` als Seite | `src/assistant` existiert nicht (bekannte Fiktion); `ThreeDPage.tsx` ist nicht verdrahtet, der Vertikalschnitt lebt in `src/atmosphere` (`App.tsx:22,124`). Das Dokument datiert auf 2026-06-09 und ist in Teil A überholt — Teil B/C (Zielgruppen) bleiben nutzbar. | §1 |
| K7 | `SearchPage.tsx:539,81` (D-14) | Startseite verspricht „2–6 h ICON-D2" / „Regen 0–6 h"; D-14 hat den Modellteil am 2026-07-24 gestrichen (radar-only, jetzt–2 h). | §2.6 |
| K8 | `mobile/useIsMobile.ts:3`: „tablet 768–1024px, desktop > 1024px" | `CLAUDE.md` §Harte Regeln: 767 px (mobil) / 1439 px (Desktop-Groß). Der Code-Kommentar zementiert einen dritten, nicht abgestimmten Breakpoint — und `nowcastDeck.css:259` folgt ihm. | §2.7 |
| K9 | `SearchPage.tsx:427` zeigt „09 WERKZEUGE" | 9 Bento-Kacheln, aber **10** Palette-Einträge (`:77-88`, Validierung fehlt als Kachel) und 9 Footer-Links. Kleine, aber sichtbare Zählinkonsistenz. Zusätzlich hat die Feedback-Kachel `cats=[]` (`:610`) → sie wird von **jedem** Filter ausgeblendet. | §2.1 |
| K10 | `architecture.md` §8: Nowcast-Einstieg „Kachel/Deck-Rail" | Korrekt, aber unvollständig: die Deck-Rail führt **nur aus der Wetterkarte** zum Nowcast (`App.tsx:104`); aus allen anderen Decks landet dieselbe Geste auf der Startseite. | §2.1 |

---

## 11. Offene Fragen / nicht verifizierbar

1. **Reale CSS-Einsparung durch die Shell.** Die geschätzten −25…35 % beruhen auf der Regelzählung (~238 kopierte Shell-Regeln), nicht auf einem durchgeführten Refactoring. **Belastbar wird die Zahl erst nach dem Pilot D-0** (Route) — dort ist sie zu messen und in `improvements.md` nachzutragen.
2. **Trefferquote der Ortssuche für Gipfel/Hütten** ist nicht gemessen. Nötig wäre eine Referenzliste von 30 DACH-Gipfeln/Hütten/Pässen gegen den heutigen Nominatim-Aufruf. **Konnte in dieser Phase nicht laufen** (keine Netzabfragen im Analyse-Auftrag).
3. **Datenmenge eines `places-dach.json`** (Gipfel + Hütten + Pässe in DE/AT/CH) ist unbekannt — von der Größenordnung hängt ab, ob es als statisches Asset tragbar ist oder lazy nachgeladen werden muss. **Zu verifizieren.**
4. **ODbL-/Nominatim-Attributionspflichten** im Detail: nicht meine Rolle, an SEO/GEO & Recht (§9.7).
5. **Nutzungsdaten fehlen strukturell (D-02).** Aussagen wie „der häufigste Reibungspunkt ist die wiederholte Ortssuche" sind aus dem Code **hergeleitet** (6 Features × eigener `null`-Start), nicht **gemessen**. Ohne O-06 (privacy-erhaltendes RUM) bleibt jede UX-Priorisierung eine begründete Annahme — das gilt für dieses Dokument genauso wie für jedes andere.
6. **Reale Geräte.** Alle Mobile-Befunde stammen aus CSS/TSX-Analyse. Der iOS-Auto-Zoom (M5) ist aus der 15-px-Regel **abgeleitet**, nicht auf einem Gerät gesehen — Real-Device-Beleg fehlt (`CLAUDE.md`: Emulation ist für solche Aussagen nur bedingt tauglich).
7. **Ob `#fc=` einen Ort tragen soll**, hängt davon ab, ob die Vorhersage-Ansicht ohne geladene Modelldaten sinnvoll rekonstruierbar ist — von der Rolle Daten & Meteorologie zu bestätigen.
8. **Wechselwirkung Deck-Shell ↔ O-04.** Ob die Deck-UI-Extraktion aus `MapView.tsx` sinnvoll **vor**, **während** oder **nach** der Zerlegung erfolgt, kann ich ohne den Zerlegeplan der Rendering-Rolle nicht entscheiden (§9.9).

---

*Erstellt von der Rolle **UX & Design-System** im Rahmen der Strategie-Session 2026-07-31. Keine Quellcode-, Build- oder Config-Änderung erfolgt; keine Commits. Alle Befunde sind mit `Datei:Zeile` belegt und am Code verifiziert.*
