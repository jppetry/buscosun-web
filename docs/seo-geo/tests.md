# tests.md — seo-geo Verifikation

## Statisches Gate (jeder Schritt)
```
npm run typecheck      # tsc -b --noEmit
npm run build          # tsc -b && vite build && node scripts/generate-seo.mjs
node scripts/seo/verify-seo.mjs   # Roh-HTML-Regressionstest (siehe unten)
```

## Permanenter Regressionstest (0.2 — HARD GATE)
`scripts/seo/verify-seo.mjs` prüft gegen `dist/` (nach Build):
- **Home** `dist/index.html`: enthält `<h1`, einen Lead-Absatz, `<title`,
  `meta name="description"`, `og:`-Tags und mindestens ein `application/ld+json`.
- **Ort** (Stichprobe, z. B. `dist/wetter/muenchen/index.html` +
  `.../innsbruck/`): H1 „Wetter …", Lead/Fakten, canonical, FAQPage-JSON-LD.
- **Explainer** (Stichprobe, z. B. `dist/wissen/foehn/index.html`): H1,
  40–60-Wort-Direktantwort, Article- + FAQPage-JSON-LD.
- Jedes gefundene JSON-LD ist **valides JSON** und hat `@context`/`@type`.

Exit-Code ≠ 0 ⇒ Fail-Stop.

## Manuelle Roh-HTML-Probe (ohne JS)
```
# Beispiel nach `npm run build`:
node -e "const s=require('fs').readFileSync('dist/wetter/muenchen/index.html','utf8'); \
  console.log(/<h1/.test(s), /application\/ld\+json/.test(s))"
```
JS deaktiviert im Browser → H1/Lead/FAQ müssen sichtbar bleiben.

## CWV (0.4)
Lighthouse mobil (Chrome DevTools MCP) auf Home + einer Ortsseite. Schwellen:
LCP < 2.5s, INP < 200ms, CLS < 0.1 (p75). LCP-Element MUSS Text/Poster sein.
Ergebnis bzw. dokumentierte Lücke in `blockers.md`.

## Strukturdaten
JSON-LD gegen schema.org-Typen validieren (Rich-Results-Test extern; lokal:
`verify-seo.mjs` prüft JSON-Gültigkeit + Pflichtfelder).
