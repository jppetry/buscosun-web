# Kickoff prompt — Phases NP-0a + NP-0b: data products for Regenradar 2.0 (03.10.2026)

> Paste the block below into a fresh Claude Code session in `C:\dev\buscosun-web`. Prompts to Claude Code are in
> English; all documentation you write stays German (CLAUDE.md, Sprache & Konventionen).

---

You are working on **buscosun** (`C:\dev\buscosun-web`). Read `CLAUDE.md` completely before anything else — it is the
constitution of this repo (hard rules, gates, naming, verification). Then read, in this order:

1. `audit/np0-datenprodukte.md` — the plan for THIS work: two phases, NP-0a and NP-0b. It is your work order.
2. `audit/niederschlagsplattform-konzept.md` §2, §8, §9 — why these data products exist (Regenradar 2.0).
3. `audit/regenradar-datenangleich.md` — Phase RR (done): V-RR-1 (lightning without time axis), V-RR-2 (look-back
   45 min), V-RR-5, V-RR-8, V-RR-12, and §2.7 (which requests go where today).
4. `audit/radar-datenrepo.md` §3.3, §3.4, §11, §14, §15 — the radar mirror (two writers on `main`, retention, derive,
   CDN gates, hour means) and `docs/DATA_SOURCES.md` §7 (lightning sources L1/L2).
5. `buscosun-data/README.md` (template `scripts/repack-repo/README.md`), `scripts/repack-repo/workflow-point.yml`,
   `scripts/point/{publish-point,prune,cdnSync,sparseCover}.mjs`, `scripts/verify-point-data.mjs` (rules A–F) — the
   point cron you will extend.

## Goal (Jan, 03.10.2026)

Two data tasks for the new precipitation platform, each ending in **Jan's push to the data repo**:

- **NP-0a — 2 h look-back + lightning mirror in buscosun-data.** The radar mirror keeps the measured analyses (DE RV
  `f000`, CH rzc) and KONRAD cells for 24 slots instead of 12, and mirrors lightning with a time axis (DWD
  `dwd:Blitzdichte` for DE, EUMETSAT MTG-LI `mtg_fd:li_afa` for DACH), 5-min slots, 24 slots.
- **NP-0b — forecast fields from the point cube for the map, built in the point cron.** After each tier build, write map
  fields under `point/field/v1/`: precipitation (chance of wet, amount if wet, unconditional q90) and snow line (middle +
  band + band provenance), labelled "Modell · Cube" — never "buscosun Fusion 8".

Neither phase changes the UI. Visible use comes in NP-1 (time axis) and NP-2 (forecast style).

## Preconditions — check first, then STOP & ASK if one fails

- `git status`: Phase RR (`audit/regenradar-datenangleich.md` §9, `MANUELLE-SCHRITTE.md` §33) must be committed. The
  radar mirror and the point cron clone `buscosun-web/main`, so NP-0 must not ride on uncommitted RR work. If RR files are
  still uncommitted, stop and ask Jan. (The NP-0 planning docs — `audit/np0-datenprodukte.md`, `prompt-np0.md`, the
  CLAUDE.md rows, the concept update — may be uncommitted; they belong to this work.)
- Never modify the working tree of `C:\dev\buscosun-data` (Jan copies files there). For probes against the data repo,
  use a sparse/blobless scratch clone outside both repos. Read-only `git fetch`/`ls-tree` is fine.

## Procedure (Diagnose-First, one topic = one phase = one gate)

1. **Diagnosis for both phases first** — D-NP0-1 … D-NP0-14 in `audit/np0-datenprodukte.md` §2.2 and §3.2. Re-check
   every anchor in §1.1 against the current tree (line numbers drift; code beats docs). Measure, do not assume: tree size
   at `origin/main` and jsDelivr behaviour (D-NP0-1), live lightning latency and whether either service returns
   **values** rather than styled colours (D-NP0-4/5, exact colour→class round trip or nothing), how buscosun Fusion 8
   builds the precipitation hurdle from a cube cell without station and radar (D-NP0-10), and the archive measurement
   for the field's chance definition (D-NP0-12: Brier, reliability, distance to Fusion 8 at the scorer points of
   `buscosun-archiv`, lead 3–48 h; no new collector in this phase). Write every result with evidence into §8 of the
   audit before any producer code.
2. **STOP & ASK Jan for E-NP0-1 … E-NP0-6** (audit §4). Present the options exactly as written, with your measured
   numbers and your recommendation. Do not guess them.
3. **NP-0a — build** steps NP-0a-1 … NP-0a-7 (audit §2.3): contract first (`src/sources/radarImg.ts` /
   `radolanRuns.ts` for the look-back, new `src/sources/lightningImg.ts` for lightning), then the producer
   (`scripts/radar-mirror/radar-mirror.mjs` + derive), per-source retention with kill switches `PAST_KEEP=12` and
   `LIGHTNING=0`, no extra push cadence (lightning rides along with the next product push), local test against a bare
   repo including a simulated force-push of the map line and a job seam, new `verify:np0-radar` (offline + `--live`).
   Every file the mirror writes today must come out **byte-identical** (proof with real inputs + a negative control).
   **Gate G-NP0a** (audit §2.4). Then write Jan's NP-0a gates as a new section in `MANUELLE-SCHRITTE.md` (template in
   audit §6). Suggest one commit for NP-0a.
4. **NP-0b — build** steps NP-0b-1 … NP-0b-7 (audit §3.3): contract `src/point/fieldFormat.ts` (paths, grid from
   `TIERS`, encoder AND decoder, builder + checker, label, version), producer `scripts/point/build-point-fields.mjs`
   reading the freshly built tier with the same reader the clients use, workflow template step between build and publish
   (`POINT_FIELDS`, non-fatal: a field error must never block the cube), prune/CDN-sync/index for `point/field/`, rules
   A–F recalculated with the measured field runtime, new `verify:np0-fields` (encoding round trip, consistency probe at
   ≥ 50 cells against the chosen chain, negative controls, cube byte-identity with fields on vs off, `--live`).
   **Gate G-NP0b** (audit §3.4). Then Jan's NP-0b gates in `MANUELLE-SCHRITTE.md`. Suggest one commit for NP-0b.

If context runs short, finish NP-0a cleanly (gate + docs) and hand NP-0b over in the audit — never leave a half-built
producer.

## Hard limits

- STOP & ASK before: any change to buscosun Fusion (`src/pointForecast/**` including `fusion/*`, tables, options,
  `FUSION*` switches — calling it is fine, changing it is not), any new dependency (PNG/GeoTIFF/WCS decoding must use
  `node:zlib` and existing modules), shader/WebGL, `MapView`, router, Edge Functions, deleting files, anything
  irreversible.
- No push, no commit into the data repo, no workflow file in the data repo, no purge, no cron dispatch against
  production — all of that is Jan's gate. Warm-up GETs are allowed.
- Existing contract constants (`vMax`, gates, `RADAR_CDN_WINDOW_MS`, `v1` paths, cube schema) stay as they are.
- Honesty: "missing" is never 0; Blitzdichte frames overlap (15-min window every 5 min) and must be marked as such;
  satellite lightning carries the parallax note; AT has no look-back and no ground-network lightning — say so; fields
  carry "Modell · Cube" and the chance definition with its measured scores.
- No commits without Jan's explicit order.

## Deliverables

- `audit/np0-datenprodukte.md` §8 filled: diagnosis with evidence, Jan's decisions, implementation log per phase, gate
  tables §2.4/§3.4 completed, new V-NP0 entries.
- `CLAUDE.md`: replace the NP-0 status row (current state only, no chronicle) and keep the doc-map row accurate.
- `MANUELLE-SCHRITTE.md`: one new section per phase with Jan's gates (push web, copy into the data repo, wait for or
  dispatch the job, run the live verifier, rollback switches).
- Templates updated: `scripts/radar-mirror/*`, `scripts/repack-repo/workflow-point.yml`, `scripts/repack-repo/README.md`.
- A short German summary for Jan at the end of each phase: what changed, what is measured, what he has to do.
