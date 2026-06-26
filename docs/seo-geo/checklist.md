# checklist.md — seo-geo

Abhaken pro Schritt. `[x]` erledigt, `[~]` teilweise/Scaffold, `[ ]` offen.

## 0 — Foundation
- [x] 0.0 Neun Doku-Dateien unter `docs/seo-geo/`
- [x] 0.1 Diagnose in `architecture.md` (versions-verifiziert, mit DECISION)
- [x] 0.2 `verify-seo.mjs` prüft Roh-HTML (Home + Ort, Explainer/Tool/Event sobald vorhanden): H1, Lead, Meta, JSON-LD — 32 Checks grün
- [ ] 0.3 robots.txt erweitert (Bingbot, CCBot, Claude-SearchBot, Googlebot)
- [ ] 0.3 `dist/404.html` + sitemap(s) valide + canonical überall
- [ ] 0.4 CWV mobil gemessen / Lücke in `blockers.md` dokumentiert

## 1 — Content & Programmatic
- [x] 1.1 Location-Pages (Tier 1, ~140 Orte) mit Differenzierern
- [ ] 1.1 Cross-Links Location ↔ Explainer
- [ ] 1.2 GEO-Explainer `/wissen/`: 3 Piloten voll, Rest Scaffold

## 2 — Distribution
- [ ] 2.1 Tool-Landingpages `/funktionen/`: 2 voll, Rest Scaffold
- [ ] 2.1 `seeding-kit.md`

## 3 — Discover & Events
- [ ] 3.1 RSS/Atom-Feed
- [ ] 3.1 Event-Template `/wetterlage/` + NewsArticle-JSON-LD
- [ ] 3.1 News-Sitemap
- [ ] 3.1 Event-Content-Checkliste (unten)

## 4 — Measurement
- [ ] 4.1 GSC/Bing-Runbook
- [ ] 4.1 Server-Log-AI-Crawler-Parser
- [ ] 4.1 AI-Visibility-Prompt-Baseline + Log

---

## Event-Content-Checkliste (wiederverwendbar, für `/wetterlage/`)
- [ ] Aktualität: Ereignis benannt, Zeitbezug klar, kein veralteter Bezug
- [ ] Hero-Bild ≥ 1200px Breite
- [ ] Sichtbares `datePublished` + `dateModified` (auch im NewsArticle-JSON-LD)
- [ ] Akkurate, nicht-clickbaitige Überschrift; separat optimierter `og:title`
- [ ] Interne Links zu relevanten Orts- + Explainer-Seiten
- [ ] Kein Implizieren amtlicher Warnungen; Attribution DWD
