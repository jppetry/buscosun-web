# checklist.md — seo-geo

Abhaken pro Schritt. `[x]` erledigt, `[~]` teilweise/Scaffold, `[ ]` offen.

## 0 — Foundation
- [x] 0.0 Neun Doku-Dateien unter `docs/seo-geo/`
- [x] 0.1 Diagnose in `architecture.md` (versions-verifiziert, mit DECISION)
- [x] 0.2 `verify-seo.mjs` prüft Roh-HTML (Home + Ort, Explainer/Tool/Event sobald vorhanden): H1, Lead, Meta, JSON-LD — 32 Checks grün
- [x] 0.3 robots.txt erweitert (Googlebot, Bingbot, CCBot, Claude-SearchBot)
- [x] 0.3 `dist/404.html` (noindex) erzeugt; sitemap valide (140 URLs); canonical überall (verify grün). HTTP-404-Status host-seitig → your-actions
- [x] 0.4 CWV mobil gemessen: Home LCP 257 ms / CLS 0.00, Ort LCP 938 ms / CLS 0.00; LCP=Text; Lighthouse SEO/BP 100. Optionale App-Opt. in `blockers.md`

## 1 — Content & Programmatic
- [x] 1.1 Location-Pages (Tier 1, ~140 Orte): Direktantwort-Lead, Föhn/Schneefall-
      grenze (alpin), Modell-Spread, „bester Tag", Dataset-JSON-LD, DWD-CC-BY-Attribution
- [x] 1.1 Cross-Links Location ↔ Explainer (beidseitig: Ort→Wissen + Wissen→Ort)
- [x] 1.2 GEO-Explainer `/wissen/`: 10 Themen, 3 Piloten voll (Föhn, Inversion,
      Nebel/Nebelobergrenze), 7 Scaffolds (noindex); Article+FAQPage-JSON-LD,
      Direktantwort, Quellen, /wissen/-Hub; nur volle Explainer in Sitemap

## 2 — Distribution
- [x] 2.1 Tool-Landingpages `/funktionen/`: 9 Tools, 2 voll (Wetterkarte,
      Atmosphäre), 7 Scaffold (noindex); SoftwareApplication+FAQ+Breadcrumb-JSON-LD,
      OG-Großbild, Deep-Link in die App, /funktionen/-Hub
- [x] 2.1 `seeding-kit.md` (Community → Winkel → Tool)

## 3 — Discover & Events
- [x] 3.1 RSS-2.0-Feed `/feed.xml` (Events + volle Explainer, nicht in robots blockiert)
- [x] 3.1 Event-Template `/wetterlage/` + NewsArticle-JSON-LD + Hub; 1 Sample
      (Omega-Lage), Hero ≥1200px, sichtbares datePublished/dateModified, separater og:title
- [x] 3.1 News-Sitemap `/sitemap-news.xml` (Google-News-Format, nur Artikel ≤2 Tage)
- [x] 3.1 Event-Content-Checkliste (unten)

## 4 — Measurement
- [x] 4.1 GSC/Bing-Runbook (`measurement.md`) inkl. monatlicher Routine
- [x] 4.1 Server-Log-Parser `parse-crawler-logs.mjs` (AI-Crawler-200 + AI-Referrals), `npm run seo:logs`
- [x] 4.1 AI-Referral-Erkennung über Referer (tracker-frei, statt JS-Analytics)
- [x] 4.1 AI-Visibility-Baseline `ai-visibility-prompts.md` (28 Prompts + Monats-Log)

---

## Event-Content-Checkliste (wiederverwendbar, für `/wetterlage/`)
- [ ] Aktualität: Ereignis benannt, Zeitbezug klar, kein veralteter Bezug
- [ ] Hero-Bild ≥ 1200px Breite
- [ ] Sichtbares `datePublished` + `dateModified` (auch im NewsArticle-JSON-LD)
- [ ] Akkurate, nicht-clickbaitige Überschrift; separat optimierter `og:title`
- [ ] Interne Links zu relevanten Orts- + Explainer-Seiten
- [ ] Kein Implizieren amtlicher Warnungen; Attribution DWD
