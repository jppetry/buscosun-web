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
- Commit: folgt.
