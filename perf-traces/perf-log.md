# 2D-Layer Performance — Desktop (Diagnose + Iterations-Log)

Method: production build (`vite build` + `vite preview` :4173), Chrome DevTools MCP,
no CPU throttling, native DPR. Cold-start permalink `#m=` München, wind-only (default).
Metrics from Resource Timing API + performance trace + repeatable toggle harness
(click → longtask observer + network-settle, 700 ms quiet window).

## Baseline — Cold start (wind-only)
| Metric | Value | Evidence |
|---|---|---|
| Critical JS loaded (index+MapView+maplibre) | ~250 ms | resource timing |
| Map style fetch starts | 705 ms | openfreemap/styles/liberty start |
| LCP (map canvas first paint) | 823 ms | trace NAVIGATION_0, node 252 |
| Glyph fonts start / end | 2444 ms / 3951 ms | Noto Sans pbf, ~1.5 s each |
| Viewport basemap tile-fill (last basemap incl. glyphs) | 4553 ms | resource timing |
| Full settle (DEM 2nd wave) | 6753 ms | terrarium z7 wave |
| Terrarium DEM tiles fetched | 92 (2 waves) | loadElevationLookup |
| WMS GetCapabilities (warn area) | 6894 ms | "other" group |

## Baseline — Layer toggles (from wind-only, toggle ON)
| Layer | Toggle dur | longtasks>50ms | max longtask | new reqs |
|---|---|---|---|---|
| Temperatur | 6549 ms | 4 | 574 ms | 53 |
| Niederschlag | 8116 ms | 9 | **2903 ms** | 0 |
| Wolken | 2896 ms | 1 | 199 ms | 0 |
| Böen | 2899 ms | 3 | 385 ms | 0 |
| Satellit | 2716 ms | 1 | 318 ms | 0 |

## Iterations

### It1 — Defer inactive-layer WMS GetCapabilities (satellite + lightning)
Files: src/MapView.tsx (whenBasemapReady helper; gate sat/lightning fetchWmsLatestTime).
Change: the 2 WMS time-probes (4.2s each, Chrome's #1 critical chain) only fire eagerly
if the layer is active; otherwise after the basemap viewport is filled.
Measured: probe start moved ~6700ms → ~11900ms+ (out of critical chain) ✓.
Tile-fill: NO measurable change — viewport tile-fill is bounded by openfreemap glyph
download throughput (cross-origin 3rd party, varies 2.5–6.0s run-to-run). Null on headline,
positive in production (removes 4.2s cross-origin GetCapabilities from the early window).
Verdict: correct + zero-risk; keep, but unmeasurable locally.

### It2 — Preconnect to tiles.openfreemap.org
Files: index.html (preconnect + dns-prefetch, crossorigin).
Change: warm DNS+TCP+TLS to the basemap host during HTML parse, before MapLibre
requests style/tiles/glyphs (~700ms).
Measured: with change, first openfreemap request connSetup ~4ms (dns/tcp 0). BUT baseline
in a fresh isolated context ALSO shows ~2ms — this machine has warm DNS/TLS to openfreemap
from repeated testing, so the benefit (real for cold-DNS first-time users + prod) is
invisible here. Null locally, positive for real cold users.
Verdict: safe, Chrome-recommended; keep, but unmeasurable locally.

## KEY FINDING
Cold-start "viewport tile-fill" is dominated by openfreemap glyph-PBF download throughput
(cross-origin 3rd party) — confirmed via Context7 that glyphs/vector tiles bypass
maxParallelImageRequests. Time-to-interactive-map (LCP) is already ~0.7–0.8s. Controllable
cold-start headroom is small. The large, controllable, cleanly-measurable wins are the
LAYER TOGGLES (Gate B): Niederschlag 2903ms main-thread block, Temperatur 53-req refetch.
Recommend pivoting iterations to toggles.
