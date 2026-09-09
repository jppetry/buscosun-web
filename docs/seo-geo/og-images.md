# og-images.md — Per-Seite-OG-/Hero-Bilder (Regenerierung)

Social-Plattformen (Facebook, X, LinkedIn, WhatsApp) und Google Discover rendern
**kein SVG** als Vorschaubild. Daher werden gebrandete **PNG**s (1200×630) pro
Seitentyp erzeugt und in `public/og/` eingecheckt. Keine Build-Dependency.

## Bestand (`public/og/*.png`)
| Datei | Verwendung |
|-------|------------|
| `home.png` | Startseite |
| `wetter.png` | `/wetter/`-Hub |
| `wetter-default.png` | alle Ortsseiten `/wetter/<slug>/` |
| `wissen.png` | `/wissen/`-Hub |
| `wissen-default.png` | Explainer-Scaffolds (noindex) |
| `funktionen.png` | `/funktionen/`-Hub |
| `funktionen-default.png` | Tool-Scaffolds (noindex) |
| `wetterlage.png` | `/wetterlage/`-Hub |
| `foehn.png`, `temperaturinversion.png`, `nebel-hochnebel-nebelobergrenze.png` | volle Explainer |
| `wetterkarte.png`, `atmosphaere.png` | volle Tools |
| `omega-lage-mitteleuropa.png` | Event-Artikel |

Verdrahtung: `explainerOgImage()` / `toolOgImage()` in `scripts/seo/content.mjs`;
Ortsseiten/Hubs/Home/Event setzen `ogImage` direkt. `verify-seo.mjs` erzwingt,
dass jedes `og:image` ein Raster ist (kein SVG).

## Renderer
`public/_og-card.html` rendert eine Karte aus Query-Params bzw. via
`window.__set(eyebrow, title)`. noindex + in robots disallowed.

## Bestand seit SEO/GEO 2026 (E10)

74 PNGs. Neu hinzugekommen: je eine Karte für alle 25 Explainer, alle 10 Werkzeugseiten,
die 16 Zielgruppen-Seiten (`fuer-<slug>.png`), die 9 Methodik-Seiten (`methodik-<slug>.png`),
die Hubs `fuer.png`, `methodik.png`, `glossar.png`, die Vertrauensseiten `ueber.png` und
`ohne-tracker.png` sowie den Saisonbericht.

Verdrahtung: `ogImageOr(slug, fallback)` in `scripts/seo/content.mjs` nimmt die eigene Karte
nur, WENN die PNG existiert — sonst die Bereichs-Karte. Dadurch zeigt keine Seite je auf ein
fehlendes Bild, auch wenn eine neue Seite vor ihrer Karte live geht.

## Die App-Karten (SH6, 2026-09-09) — zweiter Satz, eigener Renderer

Die 74 oben sind **Inhalts**-Karten (Wissen, Funktionen, Für wen, Methodik, Orte). Seit SH6
gibt es daneben **50 App-Karten** in `public/og/app/` — eine je Feature-Route und je
Sub-Route, damit ein geteilter Link nicht mehr die generische Startseiten-Karte zeigt.

| | Inhaltskarten | App-Karten |
|---|---|---|
| Ordner | `public/og/` | `public/og/app/` |
| Renderer | `public/_og-card.html` | `public/_og-app-card.html` |
| Optik | ganz hell (Sand/Ink) | heller Rahmen, **dunkles Kartenfeld** rechts (Jans Entscheidung E-5) |
| Zuordnung | `ogImageOr(slug, fallback)` (Datei-Existenz) | `ogCardPath()` in `src/share/ogCard.ts` (Regel) |
| Erzeugen | s. unten | `npm run og:app-cards` |

Die App-Karten tragen ein **Motiv** je Feature (Isolinien, Radarringe, Warndreieck,
Höhenprofil, …) und unten im dunklen Feld den **Pfad der Seite** — dieselbe lesbare URL,
die auch im Share-Sheet steht.

**Welche Karte es gibt, entscheidet keine Liste, sondern eine Regel:** `ogCardPath(routeId,
sub)` in `src/share/ogCard.ts`. Renderer, Shell-Generator, Edge Function und Verifier
benutzen dieselbe. `npm run verify:share` schlägt fehl, wenn eine Karte fehlt ODER eine
Karte ohne Seite herumliegt — eine umbenannte Sub-Route fällt damit sofort auf, statt still
auf ein 404-Bild zu zeigen.

```
npm run og:app-cards                 # nur fehlende
npm run og:app-cards -- --all        # alle neu (~90 s für 50 Karten)
node --experimental-strip-types --import ./scripts/lib/register-ts.mjs   scripts/render-og-app-cards.mjs --pick wetterkarte-wind,globus
```

> ⚠ `npm run og:app-cards -- --pick …` schluckt npm manchmal (`invalid config`); im Zweifel
> `node …` direkt aufrufen wie oben.

## ⚠ Der `--screenshot`-Schalter ist weg (gemessen 2026-09-09)

Das Rezept unten stammt aus E10 und **funktioniert nicht mehr**. Geprüft mit beiden
Chromium-Ständen auf dem Rechner (`chromium_headless_shell-1217` = Chrome 147,
`-1223` = Chrome 148): der Aufruf endet mit **Status 0**, `--dump-dom` liefert sauberes
HTML — und es entsteht **keine Datei**. Ein Rezept, das still nichts tut, ist schlimmer als
eines, das scheitert.

Der Ersatz steht in `scripts/lib/headlessShot.mjs`: EIN Browser über das DevTools-Protokoll
(`Page.captureScreenshot`), gesteuert mit dem `WebSocket`, den Node 22 mitbringt — keine
neue Abhängigkeit, und schneller, weil nicht je Bild ein Prozess startet. `openShooter()`
kann PNG und JPEG; die Inhaltskarten lassen sich damit genauso erzeugen wie die App-Karten.

## Alter Weg (E10, nur noch als Beschreibung der Absicht)


Das Repo hat weder Playwright noch Puppeteer als Abhängigkeit — nötig ist beides nicht:
auf dem Entwicklungsrechner liegt bereits ein Headless-Chromium (von Playwright-MCP
installiert), und der alte `--screenshot`-Schalter erledigt eine Karte je Aufruf.

1. `npm run build && npx vite preview` (serviert `dist/` auf :4173).
2. Liste der zu rendernden Karten aus den Inhaltsmodulen erzeugen (Slug, Eyebrow, Titel, Akzent).
3. Je Eintrag:
   `chrome-headless-shell.exe --headless --disable-gpu --hide-scrollbars --window-size=1200,630 \n    --screenshot=public/og/<slug>.png "http://localhost:4173/_og-card.html?e=<Eyebrow>&t=<Titel>&c=<Akzent>"`
   (Binärpfad unter `%LOCALAPPDATA%/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-win64/`.)
   60 Karten brauchten so rund fünf Minuten.
4. `npm run build && npm run verify:seo` — der og:image-Raster-Check muss grün sein.

Akzentfarben je Bereich: Wetterwissen `#C97B47`, Funktion `#2C2A26`, Für wen `#6E8B6F`,
Methodik `#5C5447`, Glossar `#8B7355`, Wetterlage `#B4552F`.

## Alter Weg (Chrome-DevTools-MCP, weiterhin gültig)
1. `npm run build && npm run preview` (serviert `dist/` auf :4173).
2. Headless-Chrome: Viewport **1200×630, DPR 1** (kein Mobile), zu
   `http://localhost:4173/_og-card.html` navigieren.
3. Pro Bild: `window.__set('<Eyebrow>', '<Titel>')` ausführen, dann Viewport-
   Screenshot (PNG) nach `public/og/<key>.png` speichern.
   - In dieser Repo-Historie via Chrome-DevTools-MCP (`evaluate_script` +
     `take_screenshot filePath`) erzeugt.
4. `npm run build && npm run verify:seo` — og:image-Raster-Check muss grün sein.

> Hinweis: Ortsseiten teilen sich bewusst `wetter-default.png` (138 Einzelbilder
> wären unverhältnismäßig). Sollen je Ort eigene Bilder entstehen, wäre ein
> Build-Rasterizer (z. B. @resvg/resvg-js) nötig — bewusst nicht eingeführt
> (Dependency-Gate, siehe `architecture.md`).
