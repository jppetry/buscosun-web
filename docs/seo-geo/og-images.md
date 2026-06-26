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

## Neu erzeugen (wenn Titel/Marke sich ändern oder neue Piloten dazukommen)
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
