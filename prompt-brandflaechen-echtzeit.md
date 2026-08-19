# Kickoff — Phase BF1: Real burnt-area footprints, live + 7-day history

> Sibling of `prompt-waldbrand-dach.md` / `prompt-waldbrand-ui.md`. One topic, one phase, one gate.
> Read `CLAUDE.md` first — the fire-line lessons in there are binding, not advisory.
> Gate: **GBF1**.

## Mission

The fire view currently shows **points** (FIRMS hotspots) and, separately, EFFIS burnt-area
polygons. Neither answers the question a user actually asks: *how large is this fire, right now?*

Build a single **footprint model** that answers it honestly at two speeds:

1. **Live estimate (0–24 h)** — derived from clustered FIRMS pixels. Fast, coarse, explicitly
   labelled as an estimate.
2. **Mapped truth (1–4 days old)** — the EFFIS polygon with its `AREA_HA`. Replaces the estimate
   for the same fire the moment it exists.
3. **7-day history** — the EFFIS `week` basket, as its own time axis.

**Never draw both representations for the same fire at once.** Two shapes read as two fires.
Replacement, not addition, is the core rule of this phase.

## Measured starting facts (2026-08-16, verify before relying on them)

DACH box `5.8,45.7,17.2,55.1`, FIRMS Area API, last 24 h, three VIIRS 375 m NRT streams:

| Stream | Pixels |
|---|---|
| VIIRS_SNPP_NRT | 408 |
| VIIRS_NOAA20_NRT | 339 |
| VIIRS_NOAA21_NRT | 483 |
| Sum (raw, no dedup) | 1 233 |

Confidence: 69 `high`, 1 164 `nominal`, 0 `low`. Acquisition slots in 24 h: 11.

Union-find clustering over the pooled 24 h set:

| Link distance | Clusters | Isolated pixels | Pixels in groups |
|---|---|---|---|
| 0.5 km | 66 | 19 (1.5 %) | 1 214 (98.5 %) |
| 1 km | 54 | 16 (1.3 %) | 1 217 (98.7 %) |
| 2 km | 48 | 14 (1.1 %) | 1 219 (98.9 %) |

Clustered **per overpass** instead (the honest figure): 11 passes → 339 clusters, **222 (18 %)
genuinely isolated pixels**.

The largest cluster — 822 pixels, ~6 × 8 km at 50.5 °N / 6.1 °E, present in all 5 passes,
7 419 MW total FRP — is almost certainly an **industrial heat source**, not a wildfire. It alone
accounts for two thirds of the entire DACH count. Any pipeline that does not neutralise it will
report a catastrophe every single day.

EFFIS WFS, same box, live:

| `typename` | Features |
|---|---|
| `ms:modis.ba.poly.week` | 23 |
| `ms:modis.ba.poly.season` | 293 |
| `ms:modis.ba.poly` (archive) | ~1 270 (since 2016) |

Feature properties:
`id, FIREDATE, LASTUPDATE, COUNTRY, PROVINCE, COMMUNE, AREA_HA, BROADLEA, CONIFER, MIXED,
SCLEROPH, TRANSIT, OTHERNATLC, AGRIAREAS, ARTIFSURF, OTHERLC, PERCNA2K, CLASS`

Observed `FIREDATE` → `LASTUPDATE` latency in the week basket: **1–4 days**.

## Existing code to reuse — do not rebuild

- `src/fire/sources/firmsHotspots.ts` — FIRMS ingest. The key lives only in `FIRMS_MAP_KEY`,
  proxied by `netlify/edge-functions/firms.ts`. Do not put a key in the client.
- `src/fire/sources/euContext.ts` — EFFIS baskets, `burntUrl()`, `buildBurntRun()`,
  `BURNT_MAX_FEATURES`, landcover parsing. The `week` typename is already declared.
- `src/fire/sources/wfsAxis.ts` — `assertDachAxis()`. Call it on every new WFS response.
- `src/fire/sources/gwisHotspots.ts` — GWIS hotspots are FIRMS 1:1; do not treat as independent.
- Deck styling: follow `prompt-waldbrand-ui.md` / `audit/waldbrand-ui-wbu1.md` (copy-not-import
  pattern for the deck shell; `../MapView` stays off-limits).

## Phase plan

### BF0 — Diagnosis (no code)

Write `audit/brandflaechen-echtzeit.md`. It must answer, each with a measurement:

1. **How many of the 66 clusters intersect an EFFIS polygon?** This is the confirmed/unconfirmed
   ratio and the single most important number in the phase.
2. **What is the hull overestimation factor?** For every matched pair, compute
   `hull_area / AREA_HA`. Report median and spread, not a mean — one outlier ruins a mean.
3. **Which link distance is right?** Justify from the data, not from the round number.
   Note that per-overpass and pooled clustering give very different answers and say which one
   the product uses and why.
4. **How is the 822-pixel industrial block excluded?** Candidate discriminators: persistence
   across days (a wildfire does not burn identically for weeks), `ARTIFSURF` landcover from the
   EFFIS/CORINE mask, absence of any EFFIS mapping despite huge FRP. Pick one, measure its
   false-positive rate against the rest of the set — do not hand-blacklist coordinates.
5. **What is `min(AREA_HA)` in each basket right now?** That is the mapping threshold; below it,
   FIRMS is the only evidence and must say so.
6. **Does `week` ⊂ `season`?** Check by `id`. If yes, the history layer is a filter, not a
   second fetch.

### BF1 — Clustering module

`src/fire/footprint/cluster.ts`, pure and headless-testable:

- Union-find over pixels, link distance from BF0.
- Per cluster: pixel count, distinct satellites, distinct overpasses, FRP sum, bbox, first/last
  acquisition, max confidence.
- Cross-satellite dedup: the same fire seen by SNPP and NOAA-20 in the same window is one
  cluster, not two.
- **No `Date.now()` inside** — pass `nowMs` in (D-12).

### BF2 — Footprint geometry

`src/fire/footprint/hull.ts`:

- **Alpha shape, not convex hull.** Fires follow terrain and forest edges; a convex hull erases
  exactly that. Fall back to a buffered point for clusters below the alpha-shape minimum.
- Buffer radius calibrated from BF0's overestimation factor, not guessed.
- Output GeoJSON with `estimated: true` and the ingredients of the estimate in the properties,
  so the popup can show its own reasoning.

### BF3 — Reconciliation

`src/fire/footprint/reconcile.ts` — the heart of the phase:

- Spatial join of clusters against `season` polygons.
- Match → emit the **EFFIS polygon only**, `confirmed: true`, `AREA_HA`, `LASTUPDATE`.
- No match → emit the **estimate only**, `confirmed: false`.
- Never both. Guarantee this with a headless assertion, not with review discipline.

### BF4 — History (7 days)

- `ms:modis.ba.poly.week` as its own layer with its own time axis.
- If BF0 proved `week ⊂ season`, filter the season basket instead of fetching twice.
- The day slider drives `FIREDATE`, **not** `LASTUPDATE` — the user asks when it burned, not when
  Copernicus processed it.
- Show `LASTUPDATE` in the readout as the freshness stamp.

### BF5 — Presentation and honesty layer

Distinct visual languages, never a gradient between them:

- **Confirmed** (EFFIS): filled polygon, hard edge, area in ha.
- **Estimated** (FIRMS): soft/dashed edge, hatched fill, no hectare number — a pixel hull is not
  a measurement. Show the ingredients instead: "8 hotspots, 3 satellites, 2 overpasses".
- Legend states the mapping threshold and the 1–4 day latency in plain German.
- The `fuel_map` WMS stays available as spread context.

Wording rules (binding, from `CLAUDE.md`):
- **"Bestätigt" only with the source named in the same sentence** — EFFIS mapping or a Copernicus
  EMS activation. "Unbestätigt" is the normal case and is stated as such, not hidden.
- Never summarise, sharpen or soften an official warning text. Quote verbatim or deep-link.
- No hectare figure on an estimated footprint. Ever.

## Traps — all of these were paid for once already

1. **`maxfeatures` is applied BEFORE the bbox filter** on `/effis` — a server-side cap silently
   drops the *newest* features first (V-224). No server cap. Cap client-side after the bbox
   filter, newest first, and surface `truncated`.
2. **WFS 1.1.0 + EPSG:4326 means `lat,lon`**, and the MapServer mirrors the bbox axis order into
   the output geometry. Assert on **returned coordinates**, never on feature counts
   (`wfsAxis.ts`).
3. **`setData` on `idle` is an infinite loop** (V-220). Only set on a changed reference.
4. **FIRMS is billed per transaction** (5 000 / 10 min on the operator key). Cache in the edge
   function, not per client. Do not add satellite streams "for completeness".
5. **The archive basket ships ~4.8 MB with no `content-encoding`** (V-226). Not in this phase.
6. **GWIS hotspots duplicate FIRMS.** Do not double-count them into clusters.

## Verification (Gate GBF1)

Headless verifier `npm run verify:fire-footprint`, following the `verify-fire-firms.mjs` pattern,
proving on fixtures:

- Clustering is stable and order-independent.
- Reconciliation never emits both shapes for one fire.
- Axis assertion fires on a mirrored-geometry fixture.
- No footprint carries a hectare figure without an EFFIS source.
- Mapping threshold and time span are read from the data, never hardcoded.

Plus: `npm run typecheck` green, and the five self-verification questions answered in writing with
evidence (function preservation itemised, desktop pixel-identical, touch targets ≥ 44 px, clean
console, no long tasks > 200 ms — measure long tasks on the **production build**).

Log every improvement found along the way as a `V-NN` entry in `improvements.md` (D-28), each with
its user-visible benefit and an implementation sketch.

## STOP & ASK Jan before

- Touching `netlify/edge-functions/firms.ts` or any warm-cron (edge functions are a stop-and-ask
  zone by constitution; a new cache window counts).
- Adding a FIRMS product beyond the three whitelisted VIIRS NRT streams.
- Loading the EFFIS archive basket in the default path.
- Any wording that would call an unconfirmed footprint a confirmed fire.
