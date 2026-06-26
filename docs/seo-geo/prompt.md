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
- Commit: folgt.
