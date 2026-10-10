# Kickoff prompt — Phase RG: Darstellungsschwelle des Niederschlagsradars, gemessen an Stationen (10.10.2026)

> Paste the block below into a fresh Claude Code session in `C:\dev\buscosun-web`. Prompts to Claude Code are in
> English; all documentation you write stays German (CLAUDE.md, Sprache & Konventionen).

---

You are working on **buscosun** (`C:\dev\buscosun-web`). Read `CLAUDE.md` completely before anything else — it is the
constitution of this repo (hard rules, gates, naming, verification). Then read:

1. `audit/radar-hochaufloesung.md` — HD-3 (dual frames `g<lead>.png`, log plane 0,06–200 mm/h) and the colour ramp.
2. `audit/radar-250m.md` — R250 (250-m tiles in `rv-past/<stamp>/`, anchored to the RV mean per km²).
3. `audit/radar-randsaum.md` — RS (edge rule, `?hdedge`), the phase that ran directly before this one.
4. `audit/fusion-expertenbericht-2026-09-29.md` — how RV is read from ODIM-HDF5 (`src/sources/rvHdf5.ts`) and
   decision E-EX-6 (RADOLAN units stay the default for everything that computes with radar values).

## Goal (Jan, 10.10.2026, in German)

> „Wichtig ist es mir, dass es an einer blau gekennzeichneten Stelle (auch hellblau) mindestens ein bisschen regnet."
> „Erst gegen Messstationen messen und dann eine Schwelle bestimmen" — so professionell wie möglich.

Blue on the precipitation map (Wetterkarte „Niederschlag" and `/regenradar`) must mean: precipitation actually reaches
the ground there. The display threshold is to be **determined by measurement against stations**, with a rule frozen
before the numbers are computed — not picked by eye.

## What the previous session found (10.10.2026, 07:40 UTC, Herborn / Lahn-Dill / Siegerland) — verify it yourself first

Trigger: around Herborn the map showed light precipitation, and west of it (Burbach, Dillenburg, Herdorf, Haiger) a
light-blue „front" that Kachelmann HD+ did not show.

- **We have effectively no threshold.** The DWD RV composite (ODIM-HDF5, uint32, gain 0,001 mm/5 min, offset −0,001,
  undetect 0) is read in RADOLAN units by default: `src/sources/rvHdf5.ts:171`
  `Math.max(1, Math.floor(um / unitUm)) * mmPerHourPerUnit` ⇒ **every echo is lifted to one unit = 0,12 mm/h**, also
  raw 1 (0,000 mm/h) and raw 2 (0,012 mm/h). The log plane (`precipToU8Log`, `src/scalar/RainLayer.ts:592–607`,
  `PRECIP_LOG_MIN = 0.06`) is built from these lifted values (`decodeRvHdf5Tar(…, { secondary })`, line 186 ff.), so the
  nominal 0,06 mm/h floor never bites — every echo becomes light blue. The smallest real step in the DWD file is
  0,012 mm/h.
- Raw-value count in a box around Herborn (07:40 UTC, 1 406 wet pixels): 0,000 → 18 px · 0,012 → 209 · 0,024 → 135 ·
  0,036 → 76 · 0,048 → 108 · 0,060–0,108 → 278 · exactly 0,12 → 34. **59 % of the wet pixels are shown as 0,12 mm/h
  although the original is lower.** Over a larger box (≈ 8 000 km²): shown blue 17,6 %; native ≥ 0,06 → 10,8 %;
  ≥ 0,12 → 7,3 %; ≥ 0,2 → 4,7 %. Mask identical to the DWD original — only the values are lifted.
- DWD original in a ±3 px window: Herborn max 0,02, Dillenburg 0,36, Burbach 0,16, Herdorf 0,10, Haiger 0,50,
  Siegen 0,68 mm/h.
- **Stations** (rr1h to 07:20 UTC vs. native radar sum 06:25–07:20): all 6 dry stations under an echo had native radar
  sums < 0,05 mm (Burbach-Würgendorf 0,007, Hilgenroth 0,003, Elkhausen 0,012, Attendorn 0,031, Isert 0,006,
  Battenberg 0,002); wet stations matched radar sums of about 0,2 mm. One case — indicative, not a measurement.
- **250-m artefact:** the R250 downscaling sometimes puts the whole block mass into one 250-m cell (16 × 0,12 =
  1,95 mm/h) — 50 of 881 wet blocks in the box. With the lifted minimum this creates bright spots where it barely rains.
- **What professionals do:** Kachelmann HD+ legend starts at 0,1 mm/h („minimal" 0,1–0,4, „leicht" ab 0,4);
  wetterdienst.de (DWD data) 0,1 mm/h ≈ 5 dBZ; SMHI counts < 5 dBZ as no precipitation; NWS precipitation mode starts at
  5 dBZ; Arpae < 10 dBZ / < 0,2 mm/h = absent. With DWD Z = 256 R^1,42: 0,1 mm/h ≈ 10 dBZ, 0,06 ≈ 7 dBZ.
- Scratch tools of that session (recreate if gone): a probe that samples `f000`/`g000`/hd250 at named places, and a box
  histogram — both via `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs <script>`, pixel lookup
  with `psFwd` + `DE1200_CORNERS` from `src/sources/radolanGeo.ts` (uv linear in PS between the corners).

## Procedure (Diagnose-First, one topic = one phase = one gate)

Write everything into a new phase document **`audit/radar-regenschwelle.md`** (German): §0 Kurzfassung für Jan,
Diagnose, Messprotokoll, Ergebnis, Umsetzung, Gates, V-RG-…, E-RG-….

### RG-0 — Diagnosis (no code before this is written down)

1. Re-verify the findings above against the current tree and a current RV slot (line numbers drift).
2. **Inventory every consumer** of the RV values: the v1 byte frames `f<lead>.png`, the log plane `g<lead>.png`, the
   hour-mean product `m<lead>.png` (buscosun Fusion 8 radar member), hd250 tiles, precipitation sums (`precipsum`),
   rain start (RB), rain chance (RC), cell/nowcast code, point queries. State for each whether it reads lifted RADOLAN
   units and whether it must stay byte-identical. **buscosun Fusion and everything that computes with radar values stays
   unchanged** (E-EX-6); this phase is about the DISPLAY only unless the measurement proves otherwise and Jan decides.
3. Check AT (INCA) and CH (rzc) for the same effect (minimum value, quantisation, floor of the log plane). If stations
   allow (TAWES, SwissMetNet in `obs/v1`), include them in the measurement; otherwise name the gap.

### RG-1 — Measurement against stations

**Truth.** Prefer DWD CDC 10-minute precipitation (`climate_environment/CDC/observations_germany/climate/10_minutes/
precipitation/` — `now/` and `recent/`; verify the paths and columns yourself). It carries, besides the amount
`RWS_10`, the **precipitation indicator `RWS_IND_10`** and the **duration `RWS_DAU_10`** (minutes) from a separate sensor
that detects precipitation below the gauge resolution — exactly Jan's „mindestens ein bisschen". Check how many stations
report the indicator and its reliability. Truth definition (freeze it): „it precipitated in this 10-min interval" =
indicator set OR duration > 0 OR amount ≥ 0,01 mm. Also keep the amount-only variant as a sensitivity check.
`obs/v1` in buscosun-data (`latest.json`, `stations.json`, 10-min `rr`, `rr1h`) is the live alternative.

**Radar.** The DWD RV composite tars in their ORIGINAL native values (raw → mm/h, not the RADOLAN floor), analysis only
(`_000`), the two 5-min analyses inside each 10-min station interval. Check how far back
`opendata.dwd.de/weather/radar/composite/rv/` reaches (≈ 48 h last time) — that gives a first result immediately. Then
**collect forward 7–14 days** locally (a local script, no production cron, no workflow change) so different weather types
are in the sample (stratiform, showers, drizzle, snow if any).

**Matching.** Station position → DE1200 pixel (same geometry as the client). Primary: the pixel under the station.
Sensitivity: max over 3 × 3 (position/drift tolerance). Exclude stations outside the RV coverage (`sourceMatrix.ts`,
150 km rule) and RV nodata.

**Metrics per candidate threshold** (0,012 … 0,5 mm/h in the native steps, plus dBZ equivalents):
- **Trefferquote der Farbe** (precision): P(truth wet | radar ≥ threshold).
- **Erfassung** (POD): P(radar ≥ threshold | truth wet).
- Area share shown blue, FAR, CSI, with block-bootstrap intervals (blocks = days; reuse the statistics conventions of the
  Prüfstand, `scripts/pruefstand/`).
- Stratified by **distance to the nearest DWD radar site** (beam height ⇒ virga/overshooting), by hour of day, and by
  phase (rain/snow, from station temperature) — if the strata differ significantly, a distance-dependent threshold is a
  candidate, otherwise one threshold.

**Freeze the rule before computing.** Write the decision rule into the audit and hash it (as in Phase FV,
`claims-frozen.sha256`) before the first metric is computed: „threshold = the smallest native value whose precision
(lower bound of the 90-% interval) reaches the target Z, over the whole sample". The target Z is **Jan's decision
E-RG-1** — ask him before freezing (options 80 / 85 / 90 / 95 %, recommendation 90 %: „an 9 von 10 blauen Stellen
regnet es wirklich"). Report the full precision/POD curve as a table and an image, not only the chosen point.

### STOP & ASK Jan after RG-1

Present: the curve, the threshold from the frozen rule, what it costs in POD and blue area, the Herborn case before /
after, and whether strata need different thresholds. Jan decides E-RG-2 (the threshold, possibly per stratum) and
E-RG-3 (what happens below it: invisible, or a separate very faint hatch/„Spuren" class — default recommendation:
invisible, Jan's „blau = es regnet").

### RG-2 — Implementation (flag-gated, additive)

- **Producer** (`scripts/radar-mirror/radar-derive.mjs`, `decodeRvHdf5Tar` `secondary`): the log plane `g<lead>.png`
  from NATIVE values instead of the RADOLAN-floored ones, behind an env switch (e.g. `RADAR_LOG_NATIVE=1`, default off,
  workflow template line only). `f<lead>.png` and `m<lead>.png` stay byte-identical (prove it with a negative control).
  If the chosen threshold is < 0,06 mm/h the log range must change — that is a contract change (`meta.dual`), name it.
- **hd250**: apply the threshold on the 1-km mean before downscaling (block below threshold ⇒ all 16 cells dry) and
  diagnose/limit the single-cell concentration (measure the concentration ratio on real slots first; R250 measured
  median spike 1,34 × mean). Behind the same producer switch.
- **Client**: the display threshold as one constant with provenance `measured` (link to the audit), applied identically to
  analysis frames, nowcast frames (+5 … +120 min), the HD layers DE/AT/CH and the 250-m tiles; switch `?rmin=0` = state
  before this phase (and optionally `?rmin=<mm/h>` for comparison). Legend/status text names the threshold
  („Radar ab x mm/h"). Old path textually unchanged.
- No shader change unless unavoidable — if it is, STOP & ASK (hard rule).

### RG-3 — Acceptance

- Re-measure on stations NOT used for choosing (hold-out: every k-th station by hash, or the days collected after the
  freeze) — the target Z must hold there.
- New verifier `scripts/verify-radar-threshold.mjs` (`verify:radar-threshold`, in CI) with fixtures in the real data form
  (a real RV tar excerpt, real station rows), including a negative control.
- Pixel diff / browser oracle: `scripts/regenradar-wk-pixeldiff.mjs`, `scripts/radar-hd-pixelcheck.mjs` — with
  `?rmin=0` pixel-identical to HEAD; with the threshold, the Herborn slot shows the expected change.
- Neighbour gates green: `verify:radar-hd`, `verify:radar-250m`, `verify:radar-edge`, `verify:radar-repack`,
  `verify:precip-source`, `verify:radar-sampling`, `verify:regenradar-profile`, `verify:precip-sums`,
  `verify:rain-window`, `verify:fusion-release`, typecheck 0, `npm run build`, `npm run budget` (limits may be raised
  with a note, never `--update`).
- The five self-verification questions in writing, with evidence.

## Rules (from CLAUDE.md, repeated because they matter here)

- No push, no copy into buscosun-data (workflow template line, producer switch), no purge, no cron dispatch — all Jan's
  gate; list them in `MANUELLE-SCHRITTE.md` as a new section.
- Verifiers run without asking, via PowerShell, never with `2>&1`; call scripts directly with
  `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs …` (npm swallows `--` args).
- Downloads (DWD tars, CDC zips) go into their own empty directory in the scratchpad or `C:\dev\buscosun-radar-truth\`
  (no repo); never into the repo.
- Honesty: if the sample is too small, too dry, or one-sided (no convection, no snow), say so in §0 and give the date
  range; the threshold carries the date of its measurement and is re-measured in winter (V entry).
- At the end: replace the RG line in the status table of `CLAUDE.md` (one row, current state only), close the audit with
  gate evidence, add a memory entry.
