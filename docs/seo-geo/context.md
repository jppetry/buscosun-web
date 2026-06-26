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
- **Routing**: Hash-basiert in der SPA; Path-Routes (`/wetter/<slug>/`) sind
  statische, build-time generierte HTML-Seiten.
- **Daten-Leitplanke**: nur bestehende Pipelines (ICON-D2-Blend, ICON-EU-Sounding,
  GFS, DEM). Geo-Landingpages nennen **stabile Standort-Fakten**, keine Live-Zahlen
  (die wären sofort veraltet) — ehrlich und GEO-zitierbar.

## Lizenz / Attribution
DWD-Daten CC BY 4.0 → Attribution „Datenbasis: Deutscher Wetterdienst".
Nie amtliche Warnungen implizieren; YMYL-nah → Genauigkeit hat Vorrang.

## Domain
Kanonische Origin in `scripts/seo/content.mjs` → `SITE.url` (`https://buscosun.app`).
Bei abweichender Live-Domain dort anpassen.
