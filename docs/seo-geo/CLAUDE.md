# CLAUDE.md — Work-Package „seo-geo"

Leitfaden für jede Arbeit am SEO/GEO-Paket von buscosun. Gilt zusätzlich zur
Wurzel-`CLAUDE.md` (Atmosphäre-Leitplanken), nicht statt ihr.

## Nicht verhandelbares Prinzip (P0)
**Aller SEO-relevante Text (Vorhersage-/Standort-Fakten, Explainer, Meta-Tags,
JSON-LD) MUSS im vorgerenderten rohen HTML ausgeliefert werden.** Das
MapLibre-GL-Canvas (und jede WebGL-/3D-Erweiterung) bleibt eine rein
client-seitige, lazy gemountete Verbesserung — niemals der Träger von
indexierbarem Inhalt.

## Architektur in einem Satz
Kein SSR/Hydration-Framework. Indexierbarer Inhalt entsteht **build-time** durch
einen reinen Node-ESM-Post-Build-Generator (`scripts/generate-seo.mjs` +
`scripts/seo/*`), der echte statische HTML-Seiten nach `dist/` schreibt und die
Home-`index.html` anreichert. Die React-SPA nutzt **Hash-Routing** (`#m=`,
`#3d=` …) und ersetzt `#root` erst beim Mount durch inhaltsgleichen Inhalt
(kein Cloaking). Siehe `architecture.md`.

## Konventionen
- Implementierungscode + Kommentare Englisch; alle nutzersichtbaren Texte Deutsch.
- Keine neue schwere Dependency, kein neuer Fetch-/Ingest-Pfad. SEO-Generierung
  ist reines Node-ESM und liegt NICHT im App-/tsc-Graph.
- v1.8-Design-System / bestehende Farbtokens; keine hardcodierten Fremd-Hex.
- Statisches Gate: `npm run typecheck` + `npm run build` + `node scripts/seo/verify-seo.mjs`.

## Autonomie-Regeln (aus dem Master-Prompt)
1. Diagnose-first ist INTERN: diagnostizieren, nach vorab fixierten Defaults
   entscheiden, in `architecture.md` loggen, weiterarbeiten.
2. Jeder Schritt endet mit einem Self-Verification-GATE. PASS → loggen, committen,
   weiter. FAIL → Fail-Stop, Ursache nach `blockers.md`, anhalten.
3. Externe Aktionen (GSC/Bing-Verifizierung, Sitemap-Einreichung, Community-
   Posting, CDN/WAF) → `your-actions.md`, NICHT darauf warten.
4. Nach jedem Schritt: `checklist.md` + `prompt.md` aktualisieren, atomarer Commit.

## Die zwei harten Gates
- **0.2**: Roh-HTML (curl/JS aus) für Home + Ort + Explainer enthält H1, Lead,
  Meta, JSON-LD. Bricht das → Fail-Stop (kein Content auf totem Fundament).
- Jede weitere Verifikation, die scheitert, ist ebenfalls ein Fail-Stop.
