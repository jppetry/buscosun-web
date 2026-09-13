# Prompt — buscosun Fusion, Stage 0: point source selection and raw readout (0–336 h)

*Paste into Claude Code in `C:\dev\buscosun-web`.*

---

## Task

Build the pre-stage of **buscosun Fusion**: given a location and a time, determine
**which available source is the best one at that exact point for that exact lead hour**,
and return that source's **raw values** together with full provenance.

**No algorithm in this stage.** Selection and readout only.

## Inputs

- `lat`, `lon` — any point in the DACH area (decimal degrees)
- `time` — a single timestamp **or** a range, anywhere in 0–336 h from the latest usable run
- optional: a place name, resolved to lat/lon, for convenience only

## Read these first, do not re-derive them

- `QUELLENMATRIX.md` — the authority on which source covers which country and lead hour
  (§1 buckets, §2 domains, §5 licences). Treat its footnotes as binding constraints.
- `ABLAUFPLAENE.md` — the target algorithm. Stage 0 is explicitly **upstream** of PAP 3–6.
- `audit/punktdaten-versorgung.md` — the journal of the point-data line.
- `CLAUDE.md` status block — current phase and what is already published.
- Existing code, one form for producer and client:
  `src/point/{cubeFormat,sourceMatrix,manifest,terrainPoint,calibration,nowcastFormat}.ts`,
  `scripts/point/*` incl. `adapters/` and `nowcastReader.mjs` (CLI `npm run point:nowcast -- <lat> <lon>`).
- Data repo `jppetry/buscosun-data` via jsDelivr: `point/index.json` (`latestByTier`, nowcast block),
  `point/<run>/run.json`, chunked `.bin`, `point/stations/` (MOSMIX-L), `point/static/`, `point/calib.json`.
  Tiers: **t1** 0–48 h @0,05° · **t2** 51–120 h @0,10° · **t3** 126–336 h @0,25°.

Start by writing down **what `sourceMatrix.ts` and `cubeFormat.ts` already do** of this task.
Reuse it. Do not build a second registry next to the existing one.

## Non-goals — do not implement any of this

- no fusion, no weighting, no minimum-variance combination
- no vertical correction, no lapse rate, no inversion handling (PAP 4)
- no terrain terms, no cold-air-pool or UHI correction (PAP 5)
- no bias correction, no quantiles, no confidence score (PAP 6)
- no new data sources, no new ingest, no change to `build-point-cube.mjs`, `point.yml`,
  or the map line (`runs/`, `radar/`)

Values are returned **as they come out of the cube**, dequantized and nothing else.

## Selection rules — derive them, never invent them

1. **Availability is geometric, not national.** Test the point against each source's domain
   from `QUELLENMATRIX.md` §2 — including the 20 km inset on the ICON-CH domain and the
   150 km radar range behind RADVOR RV / RADOLAN. Where a constraint is an assumption
   rather than a measurement (the inset is), say so in the output.
2. **Lead-hour bucket** from §1; bold entries are primary, the rest are candidates.
3. **Run availability.** A source only counts if a run covering this lead actually exists in
   the manifest — ICON-EU reaches 48 h at 03/09/15/21 UTC, ICON global 120 h at 06/18 UTC,
   IFS HRES 144 h on `scda`. Read this from the manifest, do not assume the main run.
4. **Tier and resolution** of the cube for that lead, plus the quantization step it carries.
5. **Tie-break:** write the rule down and justify it from data age, resolution and domain
   margin. A tie-break that only exists in code is a defect.

## Output — one record per target variable and lead hour

- chosen source, its **raw value** and unit
- run id, `runAt`, resulting data age at query time
- tier, grid resolution, quantization step, distance to the nearest grid point
- model orography at that cell vs. DEM height at the point — **reported, not applied**
- **every rejected candidate** with its value and the exact reason for rejection
  (outside domain, run missing, lead beyond horizon, coarser tier, …)
- where nothing is available: explicit `MISSING` with the reason. Never a substituted value,
  never a silent nearest-neighbour from a source that does not cover the point.

Target variables: T2m, dew point / RH, wind 10 m, gusts, precipitation amount / type /
probability, cloud cover total + low/mid/high, global radiation, pressure, snow line,
visibility. List explicitly which of these the cube carries today and which it does not —
the gap is a result, not a failure to report.

## Project rules that apply

- **Diagnose-First.** Written diagnosis in `audit/punktdaten-versorgung.md` (new section)
  before any code. Then stop and wait for Jan's approval.
- One topic, one phase, one gate. Funktionserhalt: nothing existing is removed or simplified.
- New paths are flag-gated default-off with a named fallback.
- No test framework: a `npm run verify:point-query` harness, `npm run typecheck` green before the gate.
- Docs German, code / comments / commits English.
- Honesty is a product principle: data gaps, country asymmetries and uncertain constraints
  are stated in the output, never smoothed over.
- No invented constants, no weights without a data-based derivation, no accuracy claim
  without a verification run.

## Verification cases the harness must contain

- **Wien** (16,37 °E) — no RV, no CombiPrecip, ICON-CH1 inside the relaxation zone;
  nowcast must resolve to INCA alone
- **Bregenz** — RV, CombiPrecip and ICON-CH1 all available; all three must appear as candidates
- **Zermatt** (`hModEff` ≈ +718 m) and **Zugspitze** (≈ −938 m) — the height delta must be in
  the output and must **not** have been applied
- one flatland DE point as control (delta ±7–18 m)
- lead hours **47 / 48 / 51** and **119 / 120 / 126** — the tier borders
- a **03 UTC** run — the ICON-EU gap between 48 h and 120 h must be visible as such
- a point outside every domain — `MISSING`, no fallback value

## Deliverable of this step

The diagnosis section plus a written selection specification, ending with:
**how many of the 41 required fields this selection can serve today, and which it cannot.**
Then stop at the gate.
