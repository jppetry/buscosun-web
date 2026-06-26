# prompt.md — Ausführungs-Log (seo-geo)

Append-only. Ein Eintrag pro Schritt: Start → Kernentscheidung → Gate → Commit.

## [STEP 0.0] Workspace & Doku-System
- Start: neun Dateien unter `docs/seo-geo/` angelegt.
- Entscheidung: P0-Prinzip (SEO-Text im rohen HTML) in CLAUDE.md + context.md fixiert.
- Gate: alle neun Dateien existieren mit Inhalt → PASS.
- Commit: folgt.

## [STEP 0.1/0.2] Diagnose + SSG-Verifikation (HARD GATE)
- Start: Diagnose in `architecture.md` festgehalten (SSG-Generator behalten/erweitern).
- Entscheidung: `scripts/seo/verify-seo.mjs` als permanenter Roh-HTML-Regressionstest;
  Direktantwort-Lead (40–60 W) auf Ortsseiten + Home ergänzt (GEO-Direktantwort).
- Gate: `npm run build` grün; `verify:seo` 32 Checks, 0 Fehler → PASS.
- Commit: 160a203.

## [STEP 0.3] SEO-Infrastruktur
- Start: robots.txt um Googlebot, Bingbot, Claude-SearchBot, CCBot erweitert;
  `dist/404.html` (noindex, follow) im Generator ergänzt.
- Entscheidung: HTTP-404-Status ist host-Konfiguration → `your-actions.md`
  (Netlify/CF Pages automatisch; GitHub Pages liefert 200 → ungeeignet vor Tier-Expansion).
- Gate: robots ausgeliefert, sitemap valide XML (140 URLs), 404 erzeugt, JSON-LD
  valide (verify grün) → PASS.
- Commit: 6fdafd4.

## [STEP 0.4] Core Web Vitals
- Start: Lighthouse + Performance-Trace (mobil, Slow 4G, 4× CPU) auf Home + Ort.
- Entscheidung: keine App-internen Perf-Refactors (CWV bereits grün; Eingriff in
  laufenden SPA-Pfad = Risiko ohne Nutzen). Optionale Punkte in `blockers.md`.
- Gate: Home LCP 257 ms/CLS 0.00; Ort LCP 938 ms/CLS 0.00; LCP=Text; Lighthouse
  SEO 100 / BP 100 / A11y 92 → PASS.
- Commit: 11c51f3.

## [STEP 1.1] Location-Pages — Differenzierer + Dataset
- Start: Modell-Spread- + „bester-Tag"-Fakten, Dataset-JSON-LD (DWD CC BY 4.0),
  explizite Attribution „Datenbasis: Deutscher Wetterdienst".
- Entscheidung: URL-Schema `/wetter/<slug>/` unverändert; Location→Explainer-
  Cross-Links folgen mit 1.2 (Explainer existieren erst dann).
- Gate: Tier 1 baut (138 Seiten), `verify:seo` 32 Checks grün, Dataset-JSON-LD valide → PASS.
- Commit: 1b8b147.

## [STEP 1.2] GEO-Explainer (/wissen/)
- Start: `scripts/seo/explainers.mjs` (10 Themen) + Renderer in `content.mjs`
  (Article+FAQPage+Breadcrumb-JSON-LD, Direktantwort, Sektionen, Quellen, Hub).
- Entscheidung: 3 Piloten voll indexiert (Föhn, Inversion, Nebel/Nebelobergrenze),
  7 Scaffolds `noindex` (kein Thin-Spam); nur volle in Sitemap. Beidseitige
  Cross-Links Ort↔Wissen (vervollständigt 1.1).
- Gate: Build (10 Explainer, 3 indexiert, Sitemap 144 URLs), `verify:seo` 40 Checks
  grün; Pilot mit Sektionen + indexierbar, Stub noindex, Cross-Links vorhanden → PASS.
- Commit: (1.2-Hash siehe git log).

## [STEP 2.1] Tool-Landingpages (/funktionen/)
- Start: `scripts/seo/tools.mjs` (9 reale Tools) + Renderer in `content.mjs`
  (SoftwareApplication+FAQ+Breadcrumb-JSON-LD, OG-Großbild, CTA-Deep-Link).
- Entscheidung: 2 Piloten voll (Wetterkarte, Atmosphäre), 7 Scaffolds noindex;
  Deep-Links nur über sichere präfix-only Hashes (#atm=/#h=/#g=), sonst '/'.
  Hero = `og.svg` Platzhalter → Per-Tool-Screenshots in `your-actions.md`.
- Gate: Build (9 Tools, 2 idx, Sitemap 147 URLs), `verify:seo` 48 Checks grün,
  SoftwareApplication-JSON-LD valide; `seeding-kit.md` erstellt → PASS.
- Commit: (2.1-Hash siehe git log).

## [STEP 3.1] RSS, Discover-Templates, Event-Workflow
- Start: `scripts/seo/events.mjs` (1 Sample „Omega-Lage", evergreen + ehrlich) +
  Renderer (NewsArticle+Breadcrumb-JSON-LD, sichtbares Datum, Hero ≥1200px,
  separater og:title); `feed.xml` (RSS 2.0) + `sitemap-news.xml` (Google-News).
- Entscheidung: News-Sitemap nur Artikel ≤2 Tage; robots verweist auf beide
  Sitemaps; Feed nicht blockiert. Per-Event-Hero-Bilder → `your-actions.md`.
- Gate: Build (1 Wetterlage idx, Sitemap 149 URLs), Feed valide (4 Items),
  News-Sitemap valide XML, `verify:seo` 56 Checks grün, NewsArticle valide → PASS.
- Commit: (3.1-Hash siehe git log).

## [STEP 4.1] Measurement & Monitoring
- Start: `parse-crawler-logs.mjs` (AI-Crawler-200 + AI-Referrals über Referer,
  da tracker-frei), `measurement.md` (GSC/Bing-Runbook), `ai-visibility-prompts.md`
  (28 Prompts + Monats-Log), `npm run seo:logs`.
- Entscheidung: Server-Logs statt JS-Analytics (Privacy-Stance); externe Mess-
  schritte (GSC/Bing/Otterly) → `your-actions.md`.
- Gate: Parser an synthetischem Log getestet (GPTBot/ClaudeBot/Bingbot 100% 200,
  perplexity.ai-Referral erkannt); Runbook + Baseline gespeichert → PASS (final).
- Commit: 62c3122.

## [POST] OG-/Hero-Bilder (Raster statt SVG-Platzhalter)
- Start: SVG-OG wird von Social/Discover nicht gerendert → 14 gebrandete
  1200×630-PNGs via `public/_og-card.html` + Headless-Chrome erzeugt (keine Dep).
- Entscheidung (User-Gate): Browser-PNG committen statt Rasterizer-Dependency.
  Ortsseiten teilen `wetter-default.png`; volle Piloten/Hubs eigene Bilder.
- Verdrahtung: `explainerOgImage`/`toolOgImage` + per-Seite `ogImage`; `verify-seo`
  erzwingt nun Raster-og:image. Build grün, 0 og.svg-Referenzen, 63 Checks.
- Commit: folgt.
