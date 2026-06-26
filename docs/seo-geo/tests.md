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

## CWV-Messung (0.4) — Ergebnis
Gemessen via Chrome-DevTools-MCP-Performance-Trace, mobil (390×844×3),
Throttling Slow 4G + 4× CPU, `vite preview` (`dist/`). Lab-Werte (CrUX/Feld n/a,
da noch kein Traffic):

| Seite | LCP | CLS | LCP-Element |
|-------|-----|-----|-------------|
| Home `/` | **257 ms** | **0.00** | vorgerenderter Text-Fallback (H1/Lead), nicht Canvas |
| Ort `/wetter/muenchen/` | **938 ms** | **0.00** | Fakten-/Lead-Text |

Schwellen (LCP < 2.5s, CLS < 0.1) **deutlich erfüllt**. Lighthouse mobil auf der
Ortsseite: **SEO 100, Best Practices 100, A11y 92**.

Befund: Das P0-Prinzip (SEO-Text im rohen HTML) liefert nebenbei ausgezeichnete
CWV — der LCP-Text paintet vor dem schweren SPA-JS-Bundle (Progressive
Enhancement). Nicht-blockierende Beobachtungen (App-intern, kein SEO-Risiko):
Render-Blocking-CSS + ein Forced-Reflow auf der Home → in `blockers.md` als
optionale Optimierung notiert, nicht umgesetzt (CWV bereits grün, Eingriff in den
laufenden interaktiven Pfad wäre Risiko ohne Nutzen).

## Strukturdaten
JSON-LD gegen schema.org-Typen validieren (Rich-Results-Test extern; lokal:
`verify-seo.mjs` prüft JSON-Gültigkeit + Pflichtfelder).
