# context.md — seo-geo

## Produkt
buscosun ist eine kostenlose, tracker-freie Wetter-Web-App für die DACH-Region
(DE · AT · CH). Daten aus amtlichen Quellen (DWD ICON-D2/MOSMIX/RADOLAN,
GeoSphere Austria, MeteoSwiss), höhenkorrigiert über ein digitales Geländemodell.
Reine Frontend-App (Vite + React 19 + TypeScript), Karte = MapLibre GL 5.6.

## Ziel des Pakets
Maximale organische Reichweite: klassisches + lokales SEO, GEO/AI-Sichtbarkeit
(ChatGPT, Perplexity, Gemini, Claude), Google Discover.

## Nicht verhandelbares Prinzip
Aller SEO-relevante Text (Vorhersage-/Standort-Fakten, Explainer, Meta, JSON-LD)
MUSS im vorgerenderten rohen HTML stehen. Das MapLibre-Canvas / jede 3D-Ansicht
bleibt eine client-only, lazy gemountete Erweiterung.

## Stack-Realität (verifiziert gegen das Repo, nicht gegen den Plan)
- **Rendering**: MapLibre GL 5.6 — **kein Three.js, kein WebGPU-Partikelsystem**.
  Die „Atmosphäre"-Ansicht ist ein MapLibre-Custom-WebGL-Layer.
- **Kein Browser-LLM mehr**: der frühere `src/assistant`-Browser-LLM wurde
  entfernt; Erklärungen sind deterministisch. → Plan-Erwähnungen von Three.js/
  WebGPU/Browser-LLM sind veraltet und werden ignoriert.
- **Routing** (seit RT1, 2026-08-22): pfadbasiert über React Router
  (`src/router/routes.ts`), je Route eine build-seitig erzeugte Shell
  `dist/<route>.html` per Netlify-200-Rewrite; Alt-Hashes werden migriert.
  Statische Seiten (`/wetter/<slug>/`, `/wissen/`, `/funktionen/`, `/wetterlage/`,
  Rechtsseiten) sind build-time generierte HTML-Dateien.
- **Kein WebGPU**, nur WebGL. Edge Functions (`/_dwd_wind`, `/_dwd_grib`,
  `/_firms`) und sechs offene Rewrites auf Fremd-Origins (DWD, MeteoAlarm, NOAA,
  CSCS, Météo-France, ECMWF) sind für die Ebene-B-Abschottung relevant
  (`SEO-AUDIT.md`, 2026-09-04).
- **Daten-Leitplanke**: nur bestehende Pipelines (ICON-D2-Blend, ICON-EU-Sounding,
  GFS, DEM). Geo-Landingpages nennen **stabile Standort-Fakten**, keine Live-Zahlen
  (die wären sofort veraltet) — ehrlich und GEO-zitierbar.

## Lizenz / Attribution
DWD-Open-Data steht unter **GeoNutzV** (nicht CC BY 4.0 — Etiketten in
`content.mjs` sind noch zu korrigieren, s. `SEO-PLAN.md` E3) → Attribution
„Datenbasis: Deutscher Wetterdienst".
Nie amtliche Warnungen implizieren; YMYL-nah → Genauigkeit hat Vorrang.

## Domain
Kanonische Origin ist **`https://buscosun.com`** (`SITE_URL` in
`src/router/routes.ts`, deckungsgleich mit `scripts/seo/content.mjs`; der
Verifier prüft das). Der frühere `.app`-Defekt (O-03) ist behoben; live sind
Canonicals, Sitemap, OG-URLs, `llms.txt` und robots durchgängig `.com`
(gemessen 2026-09-04).

## Stand 2026-09-04
Neue SEO/GEO-Linie: Inventar, Audit und 11-Etappen-Plan in der Repo-Wurzel
(`FEATURE-INVENTAR.md`, `SEO-AUDIT.md`, `SEO-PLAN.md`, `KEYWORDS.md`,
`GEO-TESTSET.md`, `VERIFY.md`); Umsetzung erst nach Jans Freigabe. Die Dateien
unter `docs/seo-geo/` sind damit Historie des ersten Pakets (Juni 2026).
