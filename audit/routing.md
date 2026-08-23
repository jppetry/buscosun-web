# Pfad-Routing (Phase RT1) — Diagnose, Umsetzung, Gate GRT1

> Stand 2026-08-22 (abends). Auftrag Jan: „vollständiges, SEO-taugliches Client-Routing — jedes Feature
> eine sprechende URL, Kartenzustand in der URL, Deep-Links zuverlässig". Plan-Freigabe + vier
> Vorab-Entscheidungen (§2). Hebt die Leitentscheidung „Hash bleibt" (V-05,
> `audit/strategie-2026-07-31/ux-designsystem.md` §4/§9) auf — protokolliert als **D-30** in `decisions.md`.

## 1 Diagnose RT0 (am Code verifiziert, vor der ersten Änderung)

| Frage | Befund (Datei:Zeile, Stand vor RT1) |
|---|---|
| Navigation | `src/App.tsx` hielt EIN `useState<View>` (`search \| map \| feature`), las den Hash **einmal beim Mount** (`App.tsx:86-100`) und navigierte danach nur in-memory (`setView`). Alle Seiten `React.lazy` (`:19-35`), nur `SearchPage` eager. Rail (`src/nav/featureRail.tsx:112-123`) und Startseiten-Kacheln (`SearchPage.tsx:70-107`) riefen `onOpenFeature(id)`. **Kein** `popstate`/`hashchange`/`pushState` im Repo; 7 `replaceState`-Schreiber (`App.tsx:105`, `MapView.tsx:4315-4319`, `fire/FirePage.tsx:1371`, `event/EventPage.tsx:83`, `history/HistoryPage.tsx:148`, `atmosphere/atmosphereStore.tsx:120`, `globe/GlobePage.tsx:91`) ⇒ Zurück verließ die Seite. |
| URL-würdiger Zustand | Wetterkarte: `active: Set<LayerKey>` (`MapView.tsx:823`), `forecastHour` (`:900`, 0 = jetzt, Klemmung auf `sliderMax` `:4251`), `modelSource` (`:943`; `country/perCountry/global/radar/point`), Ort = Prop `location`. **Kamera lag nirgends im React-State** (nur MapLibre). `mapState.ts` kodierte 12 von 19 Layern (V-191). Regenradar hatte **keinen** URL-State (`radar/radarState.ts` `#r=` = Codec ohne Aufrufer). Atmosphäre-Unterlinsen Höhenwind/Inversion/Go-No-Go nur lokal (`AtmosphereDeck.tsx:101`). Waldbrand komplett in `#wb=` (`fireState.ts`, `FIRE_BIT_ORDER`). |
| Legacy-Links | `#m=`, `#wb=`, `#ev=`, `#h=`, `#atm=`, `#3d=`, `#g=`, `#val`, `#mobiletest`; Query-Flags `?startnow=0` (`MapView.tsx:409`), `?ta=0` (`fire/anomaly/thermalSites.ts:172`), `?afEst=0\|1` (`fire/activity/estimate.ts:126`). Build-seitig baute `scripts/seo/content.mjs:37-41` (`mapPermalink`) `#m=`-Links für 138 `/wetter/<ort>/`-Seiten; `scripts/seo/tools.mjs` trug Hash-`deepLink`s. |
| Netlify | `netlify.toml`: sechs `force=true` 200-Proxys, dann `/* → /404.html 404` (V-101, nicht forced). Edge Functions `/_dwd_grib/*`, `/_dwd_wind/*`, `/_firms/*` laufen **vor** Redirects. Kein `public/_redirects` — und das muss so bleiben: **`_redirects` wird VOR `netlify.toml` ausgewertet**, ein SPA-Fallback dort hätte die sechs Proxys überdeckt. **Netlify matcht `from` ohne End-Slash**; `/x/ → /x 301` ist dokumentiert eine Endlosschleife; „Pretty URLs" leitet `/dir` → `/dir/` um, sobald `dir/index.html` existiert. |
| Statische SEO-Seiten | `scripts/generate-seo.mjs` schreibt `/wetter/` (138), `/wissen/`, `/funktionen/` (10), `/wetterlage/`, Legal, `404.html`, Sitemaps und **mutiert `dist/index.html`** (Home-Canonical `/`, `WebApplication`-JSON-LD, crawlbarer Inhalt). Würde `index.html` für `/wetterkarte` ausgeliefert, trüge jede App-Route im Roh-HTML den Canonical `/` (Duplicate-Signal). Kein Pfadkonflikt mit den neuen Routen (`/funktionen/wetterkarte/` ≠ `/wetterkarte`). |
| Vite/Bundle | `manualChunks: { maplibre }`, Worker `format: 'es'`, `appType` default `spa`. Kein Three.js, kein `RepaintScheduler` (Globus = MapLibre-Globe-Projektion; Repaints = `WindLayer`-rAF + Unmount-Cleanups — die Anforderung wurde darauf bezogen). Gemessen (gzip, `check-budget`): eager 121,2 KB (Limit 130,2), eagerCss 8,7 / 8,9, `maplibre` 278,4, **totalJs 929,9 / 934,0** (4,1 KB Luft). |
| Service Worker | `public/sw.js` v1: Navigationen network-first, Antwort unter festem Key `/index.html` — eine statische `/funktionen/…`-Seite überschrieb die Offline-Shell. |
| Karten-Instanzen | 10 `new maplibregl.Map`-Stellen, je eigener Unmount-Cleanup (`map.remove()`, Intervalle, Abort). `MapView` zusätzlich **eingebettet** in `event/EventResult.tsx:53` ⇒ muss router-agnostisch bleiben. Layerwechsel per `setLayoutProperty` ohne Neubau (`:1875-1914`); Präzedenz für externe Layer-Steuerung `embeddedLayer → active` (`:4292-4295`). |
| Node | `.nvmrc` 22.17.0 (CI + Netlify) ⇒ der Build-Generator darf `--experimental-strip-types` nutzen und die TS-Routen-Tabelle importieren. |

## 2 Entscheidungen (Jan, 2026-08-22)

1. **React Router 7.18** (`react-router`; v8 verlangt React ≥ 19.2.7, installiert 19.2.6 — kein Bump). 7. Runtime-Dependency = bewusste D-06-Ausnahme.
2. **Explizite 200-Rewrites je Route** in `netlify.toml`, unterhalb der Proxys, oberhalb von `/* → /404.html 404` (V-101 bleibt). Kein `_redirects`.
3. **Multi-Layer:** Pfad = zuletzt eingeschalteter Hauptlayer, Rest in `l=`.
4. **`/warnungen`** = eigene Route (eigenes Meta), rendert die Wetterkarte mit festem Warn-Layer; `/wetterkarte/warnungen` → 301.
5. **Atmosphäre:** `fliegen`=fly · `berg-und-weg`=mountain · `querschnitt`=section (+ `?ansicht=hoehenwind|inversion|gonogo`). **Kein `/atmosphaere/himmel`** — es gibt keine Linse dahinter.
6. **State-Umfang:** Wetterkarte (+ Regenradar Ort/Kamera) vollständig als Query; Waldbrand/Event/Historie/Atmosphäre/Globus behalten ihre Hash-Payload unter dem neuen Pfad; Sub-Routen = Preset.

**Zwei Abweichungen von der Spec, erzwungen durch Netlify-Fakten (§1):** Trailing-Slash-301 ist serverseitig nicht umsetzbar ⇒ Normalisierung clientseitig (`App.tsx`, `replace`) + Canonical ohne Slash; Route-Shells als **flache** `dist/<route>.html`.

## 3 Umsetzung

### 3.1 Routen (Quelle `src/router/routes.ts`)

| Route | Rendert | Aliase (301) |
|---|---|---|
| `/` | `SearchPage` (jetzt lazy) | — |
| `/wetterkarte/:layer?` | `WetterkarteRoute` → `MapView` | `/karte`, `/map` |
| `/warnungen` | `WetterkarteRoute fixedPrimary='warnings'` | `/unwetterwarnungen`, `/warnung`, `/wetterkarte/warnungen` |
| `/regenradar` | `NowcastPage` | `/niederschlagsradar`, `/radar`, `/regen` |
| `/vorhersage` | `ForecastPage` | `/wettervorhersage`, `/forecast` |
| `/tourenplanung` | `RoutePage` | `/touren`, `/tour` |
| `/eventplanung` | `EventPage` | `/events`, `/event` |
| `/wetterarchiv` | `HistoryPage` | `/historie`, `/rueckblick` |
| `/atmosphaere/:lens?` | `AtmospherePage` | `/atmosph%C3%A4re` (+ roh), `/atmosphere` |
| `/globus` | `GlobePage` | `/3d-globus`, `/3d` |
| `/waldbrand/:view?` | `FirePage` | `/waldbraende`, `/feuer` |
| `/feedback` · `/validierung` · `/mobiletest` | Bestand (Funktionserhalt; die letzten zwei `noindex`) | — |
| `*` | `NotFoundRoute` (Command-Deck, `noindex`) | — |

**Layer-Slugs** (`Record<LayerKey,string>` — tsc erzwingt alle 19, V-191 kann im neuen Codec nicht entstehen): `wind`, `boeen`, `niederschlag`, `temperatur`, `bewoelkung`, `satellit`, `blitze`, `blitzprognose`, `stationen`, `sicherheit`, `schneegrenze`, `flow-nowcast`, `regen-chance`, `gewitter`, `schnee`, `rotation`, `zellbahnen`, `hagel`, `warnungen`. Von Jan gelistet waren 6; die übrigen **13** sind nach denselben Regeln abgeleitet.
**Waldbrand-Views** (`src/fire/fireRouteView.ts`): `gefahrenindex` · `aktive-braende` (Hotspots + Brandflächen, Reiter „Brände") · `trockenheit`; Rückabbildung `fireViewFromState(active, readoutTab)`.

### 3.2 Query-Schema Wetterkarte (`src/router/urlState.ts`)

Feste Reihenfolge `lat lon z t l modell mode radar ort olat olon land`; Koordinaten 4, Zoom 2 Nachkommastellen; Defaults werden nicht geschrieben (Muster `fireState.ts`); unbekannte Keys (`startnow`, `ta`, `afEst`, `utm_*`) werden durchgereicht; bekannte Keys mit ungültigem Wert werden ignoriert und per `replaceState` entfernt. `t` = Gültigkeitszeit ISO-Minute UTC (lesen: `round10((t−now)/3,6e6)`, Vergangenheit ⇒ 0, oben klemmt die App; schreiben: auf 10 min gerundet, Stunde 0 ⇒ kein `t`). `l=-` = „kein Layer". Beispiel (aus dem Verifier, byte-genau):
`/wetterkarte/temperatur?lat=48.7751&lon=9.1835&z=8&t=2026-08-22T15%3A00Z&l=wind%2Cstationen&modell=icon-d2&mode=native&radar=0&ort=Stuttgart&olat=48.7758&olon=9.1829&land=de`.
Regenradar: `ort/olat/olon/land` + `lat/lon/z`.

### 3.3 Architektur

```
src/router/routes.ts      Tabelle: Pfade, Aliase, Sub-Routen, Meta; routeForPath/normalizePath/canonicalPath/metaForPath/sitemapPaths; verifyRoutes()
src/router/urlState.ts    Slugs, Query-Codec, t↔Stunde, Hauptlayer-Wahl, Regenradar-Query; verifyUrlState()
src/router/legacyHash.ts  Alt-Hash → neue URL (Vorrang #mobiletest vor #m=); läuft in main.tsx VOR createAppRouter()
src/router/router.tsx     createBrowserRouter, lazy je Seite, HydrateFallback, Alias-<Navigate> (Dev/Preview-Parität), ErrorBoundary
src/App.tsx               Root-Layout: RouteMeta · RouteAnnouncer · ScrollRestoration · Suspense/Outlet · normalizePath-Effekt
src/router/RouteMeta.tsx  title/description/canonical(path-only)/og/robots/WebPage-JSON-LD (auf / entfernt — WebApplication bleibt allein)
src/router/RouteAnnouncer.tsx  aria-live + Fokus h1 → main → #root (Karten-Decks haben keine h1)
src/router/useAppNav.ts   goHome/openFeature/selectLocation — ersetzt setView; Seiten-Props unverändert
src/router/pages/*Route.tsx    14 Wrapper (je Seite ein Chunk); WetterkarteRoute = Schreibpolitik (s. u.); NotFoundRoute + notFound.css
src/fire/fireRouteView.ts      Preset ↔ Zustand
```
**MapView** (additiv, router-agnostisch; eingebettete Nutzung unverändert): `routeLayers` (Spiegel nur bei echter Set-Differenz, Spiegel-Flag unterdrückt die Rückmeldung — sonst entstünde auf Zurück ein neuer Eintrag), `onLayersChange(layers, added)`, `routeHour`/`onHourChange`, `initialView`/`onViewChange` (`moveend`), `initialModelSource`/`routeModelSource`/`onModelSourceChange` (über die bestehenden Reducer, Whitelist-gated). Der `#m=`-Schreiber (`:4315-4319`) ist ersetzt; `decodeMapState` bleibt für Alt-Links. Klemmung `forecastHour > sliderMax` erst bei `forecast != null` (V-R-07: vorher wurde eine aus der URL kommende Stunde vor dem ersten Frame auf 0 geklemmt).
**Schreibpolitik (`WetterkarteRoute`):** Layer = `navigate` (push) · Stunde/Modell/Kamera = `history.replaceState(history.state, …)` debounced 300 ms am Router vorbei (kein Re-Render je Pan; `history.state` trägt den Router-Index) · fremde Navigation (Zurück/Vorwärts, Normalisierung, Alias) ⇒ Refs im Render neu aus der URL (`loc.key` ≠ eigener Write) · Kamera wird auf Zurück bewusst **nicht** zurückgesetzt · nach dem Verlassen nie mehr schreiben (`unmountedRef` + Pfad-Guard).
**Andere Features:** Atmosphäre `initialLens/routeLens/onLensChange` (Provider) + `initialSub/onSubChange` (Deck), Waldbrand `initialView/routeView/onViewChange` (Preset nur ohne `#wb=`), Regenradar `initialLocation/onLocationChange/initialView/onViewChange` durch `NowcastDeck → NowcastRadarMap → RadarMap`. Die Hash-Codecs schreiben weiter nur das Fragment.

### 3.4 Server, Shell, Build

- `netlify.toml`: 22 Alias-301 (`/wetterkarte/warnungen` **vor** `/wetterkarte/*`, Umlaut roh + kodiert), 16 unforced 200-Rewrites auf `dist/<route>.html`, `/* → /404.html 404` bleibt letzte Regel. Proxys/Edge Functions unangetastet.
- `public/sw.js` v2: Shell nur speichern, wenn die Antwort `id="root"` trägt.
- `scripts/generate-seo.mjs` (läuft jetzt unter `--experimental-strip-types --import ./scripts/lib/register-ts.mjs`): **13 Route-Shells** aus der unangereicherten Vite-Shell (Title/Description/Canonical/hreflang/OG/`WebPage`+`BreadcrumbList`-JSON-LD, H1 + Lead ≥ 25 Wörter, Sub-Routen-Links); Sitemap + 35 App-URLs (jetzt 189); `mapPermalink` → Pfad + Query (Verifier prüft Parität mit `mapPathForPlace`); `tools.mjs` deepLinks auf Pfade; `verify-seo.mjs` prüft fünf Shells + genau eine `WebApplication` auf `/`.
- `vite.config.ts`: `manualChunks` als Funktion — die Listenform zog Rollups CommonJS-Helfer (`getDefaultExportFromCjs`) in den maplibre-Chunk, der Start-Chunk importierte maplibre statisch + `modulepreload` ⇒ eager **379,7 KB** (gemessen). Eigener `cjs-helpers`-Chunk (0,13 KB).

## 4 Bundle-Zahlen (gzip, `scripts/check-budget.mjs`)

| Metrik | vorher | nachher | Δ |
|---|---|---|---|
| eagerJs | 121,2 KB | **101,5 KB** | −19,7 KB (Startseite ist eigener Chunk `HomeRoute` 15,4 KB) |
| eagerCss | 8,7 KB | **2,4 KB** | −6,3 KB |
| largestChunk (`maplibre`) | 278,4 KB | 278,4 KB | 0 |
| totalJs | 929,9 KB | **975,7 KB** | +45,8 KB (React-Router-Data-Router im Start-Chunk; Wrapper ≈ 1–2 KB je Seite) |

Budget einmal geratscht (`--update`): Limits 106,6 / 2,5 / 292,3 / 1024,5. `dist/index.html` trägt genau einen `modulepreload` (`cjs-helpers`), kein Feature-Chunk; Worker/WASM unverändert in eigenen Chunks.

## 5 Gate GRT1 — Belege

| # | Prüfung | Beleg |
|---|---|---|
| 1 | `npm run typecheck` | grün |
| 2 | `npm run verify:routing` | **70/70** (Selbsttests routes/urlState/legacy/fireView, Origin ≡ `content.mjs`, `mapPermalink` ≡ `mapPathForPlace`, alle `tools.mjs`-Links auf Routen, `netlify.toml`: jede Route 200 vor dem 404, jeder Alias 301, Cross-Alias vor `/wetterkarte/*`, kein `/*`-200, kein Loop, Proxys unverändert; SW v2 + Guard; Router deckt Tabelle) |
| 3 | `npm run build` → `verify:seo` → `budget` | 13 Shells, Sitemap 189 URLs; verify-seo **114 Checks, 0 Fehler**; Budget grün |
| 4 | Deep-Link Hard-Reload (`vite preview` :5211, Chrome DevTools MCP, isolierter Kontext, Desktop 1440×900) `/wetterkarte/temperatur?lat=48.775&lon=9.183&z=8&l=wind&t=…&foo=bar` | Layer Wind + Temperatur aktiv, Title „Temperaturkarte DACH \| buscosun", Canonical `/wetterkarte/temperatur`, `WebPage`-JSON-LD, Query in kanonischer Ordnung, `foo=bar` erhalten; Konsole leer. `t` wurde auf den 2-h-Horizont des Nur-Jetzt-Modus geklemmt (App-Verhalten, nicht Routing). Screenshot `audit/screenshots/rt1-desktop-1440-wetterkarte-deeplink.png` |
| 5 | **Kein Remount** / History | Böen einschalten ⇒ `/wetterkarte/boeen?…&l=wind,temperatur`, `history.length` 2 → 3, **Canvas-Element identisch** (`__c0 === document.querySelector('.maplibregl-canvas')`), Title/Canonical aktualisiert. Drei Wheel-Zooms ⇒ `lat=48.9734&z=8.54`, `history.length` unverändert. Zurück ⇒ `/wetterkarte/temperatur`, aktive Layer `Wind, Temperatur`, Canvas identisch; Vorwärts ⇒ Böen wieder an |
| 6 | Legacy | `/#wb={"b":1,"d":0,"w":24}` ⇒ `/waldbrand/gefahrenindex#wb=…`; `/#m=` (München, b=4) ⇒ `/wetterkarte/temperatur?ort=München&olat=48.1374&olon=11.5755&land=de` mit Marker; `/karte?foo=1` ⇒ `/wetterkarte/wind?…&foo=1`; `/Wetterkarte/Wind/` ⇒ `/wetterkarte/wind` (nach Fix, s. §6); `/wetterkarte` ⇒ `/wetterkarte/wind` (replace) |
| 7 | `/warnungen` · `/wetterkarte/warnungen` | Warn-Layer fest; Title „Amtliche Unwetterwarnungen DE · CH", Canonical `/warnungen` in beiden Fällen; Temperatur dazu ⇒ `/warnungen?…&l=temperatur`, push, kein Remount |
| 8 | Atmosphäre / Regenradar / 404 | `/atmosphaere/querschnitt?ansicht=gonogo` bleibt stehen (Store hängt `#atm=` an), Canonical `/atmosphaere/querschnitt`; `/regenradar?ort=München&…&lat=48.2&lon=11.6&z=9` rendert Deck mit Ort + Radar-Canvas; `/nope` ⇒ 404-Karte, `noindex`, 11 Werkzeug-Links, Touch-Ziele min. **44 px** (Screenshots `rt1-desktop-1440-404.png`, `rt1-mobile-390-404.png`, `rt1-mobile-390-wetterkarte.png`) |
| 9 | Routen-Verlassen (Rail: Wetterkarte ↔ Waldbrand 3×, → Regenradar → Wetterkarte) | stets **1 Canvas**, Konsole leer (kein „Too many active WebGL contexts"), URLs konsistent, Live-Region sagt den Titel an, Fokus auf `main.mdk-stage` / `main.fire-center` / `h1.nc-intro-title` |
| 10 | Long Tasks beim Routenwechsel | Wetterkarte → Waldbrand 54 + 54 ms; → Vorhersage keine; Waldbrand → Wetterkarte 56 + **411 ms** = der MapView-Mount (vorbestehender Hauptthread-GRIB-Dekode, V-WF-13 — derselbe Mount lief vorher über `setView`). Der Routenwechsel selbst bleibt < 60 ms |
| 11 | Desktop-Regression | Feature-Layouts unverändert (nur Props/Wrapper; keine CSS-Änderung außer der neuen 404-Seite); Rail/Kacheln unverändert |

**Fünf Selbstverifikations-Fragen:** (1) Funktionserhalt je Feature — alle 13 Seiten erreichbar, Props unverändert, Hash-Codecs unangetastet, `?startnow/ta/afEst` durchgereicht, eingebettete MapView (Event) ohne Rückkanäle ✓; (2) Desktop pixelgleich — keine Layout-Änderung ✓; (3) Touch ≥ 44 px (404 gemessen 44) ✓; (4) Konsole sauber ✓; (5) Long Tasks nur der vorbestehende Karten-Kaltstart ✓.

**Noch offen (nur am Deploy-Preview belegbar — Jans Gate):** `curl -sI` auf `/karte` (301 + Query-Durchreichung), `/wetterkarte` (200 mit Shell-Canonical), `/wetterkarte/warnungen` (301), `/atmosph%C3%A4re` (301), `/nope` (404), `/wetter/muenchen/` (200), `/_dwd_opendata/…`, `/_dwd_grib/…`, `/latest-grib.json`, `/.netlify/*` unverändert; SW-Offline-Probe.

## 6 Lehren

1. **Netlify matcht `from` ohne End-Slash** — `/x/ → /x 301` ist eine Endlosschleife; Trailing-Slash-Normalisierung gehört in den Client, der Canonical sagt den Rest. Pretty URLs erzwingt flache Route-Shells.
2. **Eine `manualChunks`-Liste entscheidet, wo Rollup seine CommonJS-Helfer ablegt** — landet `getDefaultExportFromCjs` im maplibre-Chunk, importiert der Start-Chunk maplibre statisch (380 KB eager). Messen, nicht annehmen: `dist/index.html` auf `modulepreload` prüfen.
3. **React Router meldet den Erstaufruf als `POP`** und matcht Pfade **case-insensitiv** — ein „nur auf POP"-Spiegel läuft beim Mount, und `/Wetterkarte/Wind` trifft `:layer` mit `Wind`. Wrapper-Refs müssen bei JEDER fremden Navigation (`loc.key` ≠ eigener Write) aus der URL neu gelesen werden — sonst schreibt der nächste `replaceState` einen veralteten Zustand (`/wetterkarte?l=-`, live gesehen).
4. **Ein Spiegel von außen darf nichts zurückmelden** (`mirrorRef`) — sonst erzeugt jeder Zurück-Klick einen neuen History-Eintrag. Und ein später Kamera-Callback nach dem Verlassen darf nie auf die Route des nächsten Features schreiben (Pfad-Guard).
5. Karten-Decks haben keine `h1` — Fokus-Management braucht einen benannten Fallback (`main`), sonst bleibt der Fokus im `body`.
6. Die Seiten selbst mussten nichts vom Router wissen: Wrapper je Route + additive Props halten `MapView` für den Event-Embed und die Verifier unverändert.

## 7 Prerendering — Vorschlag (nicht umgesetzt)

Client-Routing liefert Crawlern zunächst nur die Shell. Gebaut ist **Option A** (Route-Shells im bestehenden Generator: H1/Lead/Meta/JSON-LD je Top-Route, ≈ 0,5 Tag, keine Strukturänderung). Sub-Routen (`/wetterkarte/<layer>` usw.) teilen die Eltern-Shell; ihr Title/Canonical wird clientseitig gesetzt — Google rendert JS, aber das Roh-HTML trägt den Eltern-Canonical. Weitergehend: **Option B** React-Router-Framework-Mode `prerender` (Wechsel auf `@react-router/dev`-Vite-Plugin = Toolchain-Wechsel, 1–2 Tage, kollidiert mit dem Generator — STOPP & FRAGEN); **Option C** Playwright-Snapshots der 25 Sub-Routen im CI (≈ 0,5 Tag, neue devDep, WebGL-fragil — STOPP & FRAGEN). Empfehlung: A behalten, Sub-Routen-Shells im Generator nachziehen (≈ 2 h), B/C nur bei „Gecrawlt – nicht indexiert" in der Search Console.
