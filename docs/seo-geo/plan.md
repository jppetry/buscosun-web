# plan.md — seo-geo Roadmap

Phasierte Roadmap. Quelle: `buscosun_seo_geo_claude_code_plan.md` (Repo-Wurzel),
angepasst an den verifizierten Stack (siehe `architecture.md`).

## Phase 0 — Foundation
- **0.0** Doku-System (neun Dateien). ✔
- **0.1** Diagnose Rendering/Indexierung → `architecture.md`. ✔
- **0.2** SSG/Prerender: SEO-Text im rohen HTML. Bereits via
  `scripts/generate-seo.mjs` umgesetzt; durch `verify-seo.mjs` permanent
  abgesichert. **HARD GATE.**
- **0.3** SEO-Infra: robots (alle Such-/AI-Crawler), sitemap(s), canonical,
  echte 404, per-Route Meta/OG/Twitter, JSON-LD.
- **0.4** Core Web Vitals (mobil): LCP < 2.5s, INP < 200ms, CLS < 0.1; LCP =
  Text/Poster, nie das Canvas.

## Phase 1 — Content & Programmatic
- **1.1** Programmatische Location-Pages auf amtlichen Quellen, Hub-and-Spoke-
  Verlinkung, nur Tier 1 vorgerendert. (Bereits vorhanden; um Cross-Links zu
  Explainern erweitert.)
- **1.2** GEO-Explainer (`/wissen/`): 8–12 Themen-Cluster, 3 Piloten voll, Rest
  Scaffold. Extrahierbare Direktantwort, hohe Faktendichte, Quellen,
  Article+FAQPage-JSON-LD.

## Phase 2 — Distribution
- **2.1** Tool-Landingpages (`/funktionen/`): pro realem Tool indexierbare Seite
  mit statischem Hero, OG-Großbild, SoftwareApplication-JSON-LD. 2 voll, Rest
  Scaffold. `seeding-kit.md`.

## Phase 3 — Discover & Events
- **3.1** RSS/Atom-Feed, Event-Template (`/wetterlage/`), NewsArticle-JSON-LD,
  News-Sitemap, Event-Checkliste.

## Phase ∞ — Measurement
- **4.1** GSC/Bing-Runbook, Server-Log-AI-Crawler-Parser, AI-Referral-Segment,
  AI-Visibility-Prompt-Baseline (20–30 Prompts + Log).

## Fail-Stop-Prinzip
Einziger Grund anzuhalten: ein fehlgeschlagenes Gate. Dann KEIN Weiterbauen —
Ursache nach `blockers.md`.
