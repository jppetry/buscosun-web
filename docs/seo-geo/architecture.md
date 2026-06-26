# architecture.md — seo-geo Rendering- & Indexierungs-Diagnose

Diagnose-first (intern, ohne Halt). Stand: verifiziert gegen den Repo-Zustand auf
Branch `feat/atmosphere`.

## 1. Rendering-Modus
- `index.html` liefert ein leeres `<div id="root">` an die SPA. **Aber**: der
  Post-Build-Generator `scripts/generate-seo.mjs` ersetzt dieses `<div>` in
  `dist/index.html` durch einen crawlbaren Inhalts-Block
  (`renderHomeRootContent`) und fügt Head-Meta/JSON-LD ein. React ersetzt den
  Block beim Mount durch inhaltsgleichen Inhalt → **kein Cloaking**.
- `/wetter/<slug>/` sind **vollständig statische** HTML-Dateien (eigenes
  minimales CSS inline), generiert aus `scripts/seo/content.mjs`. Sie enthalten
  H1, Lead, Fakten, FAQ, JSON-LD ohne jeglichen JS.
- **Befund**: SEO-Text steht bereits im rohen HTML. Das harte 0.2-Gate ist
  strukturell erfüllt; es wird durch `scripts/seo/verify-seo.mjs` permanent
  abgesichert.

## 2. Routing
- SPA = **Hash-Routing** (`#m=` Karte, `#3d=`/`#atm=` Atmosphäre, `#h=` Historie,
  `#g=` Globus, `#ev=` Event). Keine React-Router-Path-Routes.
- Path-URLs (`/wetter/<slug>/`, künftig `/wissen/`, `/funktionen/`,
  `/wetterlage/`) werden als physische `index.html`-Dateien ausgeliefert →
  echte, eigenständige URLs, kein Soft-404.
- Unbekannte `/wetter/<x>/` ohne Datei → 404 des Hosts. `dist/404.html` wird
  ergänzt; host-seitige 404-Zuordnung steht in `your-actions.md`.

## 3. Head / Meta
- Statisch in `index.html` (Basis-Title/Description) **plus** build-time
  angereichert (`homeHeadExtras`: canonical, hreflang, OG, Twitter, JSON-LD).
- Geo-Seiten: vollständiger eigener `headBlock` (Title, Description, canonical,
  hreflang de-DE/AT/CH + x-default, OG, Twitter, JSON-LD). Alles im rohen HTML.

## 4. robots.txt + sitemap
- `public/robots.txt`: erlaubt `*` + explizit GPTBot, OAI-SearchBot,
  ChatGPT-User, ClaudeBot, Claude-Web, PerplexityBot, Google-Extended,
  Applebot-Extended; verlinkt Sitemap. **Ergänzt in 0.3**: Bingbot, CCBot,
  Claude-SearchBot, Googlebot (explizit).
- `sitemap.xml` build-time generiert (Home, /wetter/-Hub, alle Orte). **Ergänzt**:
  Explainer-, Tool-, Event-URLs; `sitemap-news.xml` für Discover.
- `public/llms.txt` vorhanden (GEO-Kurzprofil).

## 5. Structured Data
- JSON-LD im rohen HTML: `WebApplication`, `Organization` (Home); `Place`,
  `BreadcrumbList`, `FAQPage`, `WebApplication` (Geo-Seiten). **Ergänzt**:
  `Article`/`FAQPage` (Explainer), `SoftwareApplication` (Tools), `NewsArticle`
  (Events), `Dataset` (Geo).

## 6. Build-Tooling & Versionen (verifiziert)
- Vite `^6.0.5`, React `^19`, TypeScript `~5.7.2`, MapLibre GL `^5.6`.
- **Kein** react-router, **kein** Three.js, **kein** WebGPU-Partikelsystem.
- Deploy-Target: statisches CDN (reine Frontend-App, kein Node-Server). `build` =
  `tsc -b && vite build && node scripts/generate-seo.mjs`.

## DECISION (auto, per Master-Defaults)
- **Rendering-Ansatz**: SSG via bestehendem Post-Build-Node-Generator
  beibehalten. Begründung: Der Plan-Default „React-Router-v7-Prerender > Vike >
  vite-react-ssg" zielt auf SPAs OHNE Prerender. Hier existiert bereits ein
  funktionierender, schlanker SSG-Pfad ohne schwere Dependency, der das
  P0-Prinzip erfüllt. Ein Framework-Wechsel würde gegen die CLAUDE.md-Leitplanke
  „keine neue schwere Dependency" verstoßen und das laufende Hash-Routing
  brechen. → **Bestehenden Generator erweitern statt ersetzen.**
- **URL-Schema**: bestehendes `/wetter/<slug>/` beibehalten (Plan-Default
  `/wetter/{id}-{slug}` würde existierende, evtl. bereits indexierte URLs brechen).
  Neu: `/wissen/<slug>/` (Explainer), `/funktionen/<slug>/` (Tools),
  `/wetterlage/<slug>/` (Events).
- **hreflang**: bestehendes de-DE/AT/CH + x-default beibehalten (feiner als der
  Plan-Default „de + x-default", reziprok, kein Schaden).
- **Tiering**: Die Ortsliste (`places.mjs`, ~140 kuratierte DACH-Orte) ist bewusst
  differenziert (kein Thin-Spam) und gilt als „Tier 1". Keine Auto-Expansion.

## Decision-Log (Append-only)
- [0.1] Bestehenden SSG-Generator erweitern, nicht durch ein Framework ersetzen.
- [0.1] URL-Schemata `/wissen/`, `/funktionen/`, `/wetterlage/` ergänzen; `/wetter/`
  unverändert.
