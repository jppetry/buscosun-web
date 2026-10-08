# Kickoff — buscosun Fusion reads station measurements from `buscosun-data/obs/v1` (Phase OF)

> Written 08.10.2026 at the end of Phase OB (`audit/stationsmessungen.md`). Language of the documentation: German.
> Read `CLAUDE.md` first; its hard rules apply (diagnosis first, flag-gating, Jan's gates, no commits without a request).

## Goal

1. **One source for measurements.** Every place in buscosun-web that fetches *current station measurements* reads them from
   `buscosun-data/obs/v1` instead of the providers directly — in particular **no more BrightSky `current_weather`** calls,
   and no more direct TAWES / SwissMetNet fetches for the anchor. BrightSky *forecasts* (MOSMIX via BrightSky, wind source)
   are NOT part of this phase — list them in the diagnosis, do not touch them.
2. **More measurements in buscosun Fusion.** Use the denser network (incl. ≈ 2 100 precipitation-only stations) where it
   can help: the anchor (T, Td, wind, gust) and — new — **precipitation from rain gauges** for the first hours.
3. **Measure it on the Prüfstand** (`/pruefe-fusion`) against the current champion before anything is switched on.
   A switched-on change is a new stand ⇒ one entry in `src/pointForecast/fusion/fusionRelease.ts` (next number after the
   current one on `main`; check the register, do not assume).

## What exists (verified 07./08.10.2026)

- `obs/v1/` in the data repo, updated continuously by `obs.yml` (340-min long run + watchdog `obs-watchdog.yml`):
  `stations.json` (catalog), `latest.json` (newest values per station + `rr1h`/`rr24h` sums with completeness, ≈ 44 KB gz),
  per-station series (26 h at 10 min; daily sources 10 days), `status.json` (per source: newest stamp, last poll).
  Format and conventions: `buscosun-data/obs/README.md`, `audit/stationsmessungen.md` §1–§3. Stamps are UTC, end of interval.
- 3 123 stations (DE 2 346, AT 289, CH 485, LI 3), 3 046 with values; 2 145 precipitation-only.
  10-min stations ≈ 2 100 (DWD ≈ 1 430, of which 904 rain-only; TAWES ≈ 290; SwissMetNet + automatic precip ≈ 300).
  The rest are **daily** precipitation stations (previous day; window 05:50→05:50 UTC DE, 06→06 UTC CH) — useless for
  the anchor, usable for daily verification only.
- Freshness: DWD 10-min data is up to ≈ 30 min old when it appears (products every 30 min, staggered); TAWES ≈ 1–2 min;
  MeteoSwiss ≈ 10 min (VQHA) / 20 min (OGD). BrightSky `current_weather` is built on the same DWD 10-min files, so DE
  latency should not get worse — **measure it** (same stations, compare stamps over ≥ 2 h).
- Today's measurement path: `fetchCubeObs` (`src/pointForecast/cubeSource.ts`) → `fetchNearestStationObs`
  (`src/pointForecast/sampleSources.ts`): DE = BrightSky current grid (**5 × 4 = 20 requests per point**), AT = TAWES,
  CH = SMN; six nearest stations; INCA analysis in AT behind `incaAnchor`. Other consumers seen: `pointForecast.ts`
  (live path), `src/fusion/loadFusedForecast.ts` (raster fusion of the map), `src/sources/dachStations.ts`,
  `geosphereTawes.ts`, `meteoSwissSmn.ts`, the dashboard (`src/dashboard/model/build.ts`). Find all of them — this list is
  a starting point, not the truth.
- The anchor (`src/pointForecast/anchor.ts`) uses T, RH, u, v, gust only; τ = 4 h (T, humidity) and 2 h (wind, gust);
  Fusion 7 damps the wind anchor over distance (10 km), Fusion 9 anchors at the measurement minute.
  **There is no precipitation anchor today** — precipitation comes from radar (RV/INCA/RZC, hour mean since Fusion 8),
  the station product and the learned hurdle.

## Work packages (each: diagnosis → plan → implement → verify → gate, in `audit/obs-fusion.md`)

- **OF-0 Diagnosis.**
  - Inventory every measurement fetch in `src/`.
  - Compare `obs/v1` with what each consumer gets today: same station, same stamp, same value? Units, RH vs. Td, wind height.
  - Latency BrightSky vs. `obs` for DE.
  - Size and time of the reads on desktop and mobile-4G (jsDelivr cold/warm; `@main` resolves up to ≈ 3 min late — apply
    the pinning rules in `CLAUDE.md`).
  - What the Prüfstand replay can reconstruct for the past: the `obs` history is force-pushed by other lines and only 26 h
    deep ⇒ the replay must rebuild measurements from the originals (DWD CDC `recent`, GeoSphere, MeteoSwiss `t_recent`;
    truth W1 already does this). Define the leakage rule (a station used as anchor must not be the truth at the same
    point/time) **before** measuring.
  - If the data shape is unsuitable for the client (e.g. a compact anchor file or regional tiles would be better), change the
    mirror: Jan has authorised changes and pushes to `buscosun-data` for `obs/` and its workflows. `scripts/obs/obs-mirror.mjs`
    exists twice (buscosun-web + `buscosun-data/scripts/`) — keep both identical.
- **OF-1 Reader and replacement (no forecast change).** A reader for `obs/v1` that returns the same shape as today's fetchers,
  with deadline, hedge to `raw.githubusercontent.com` (pattern V-FI-5 / NL) and a fallback to the old direct fetch on error
  (flag-gating, e.g. `?obs=direct`). Gate: for identical stations and stamps the engine output is byte-identical; every
  difference is explained (other station set, fresher stamp). Count requests per point before/after (DE: 20 → 1–2 expected).
- **OF-2 Anchor with the denser network.** Same anchor math; only the station set changes (nearest by distance and height,
  within the existing rules). Engine option, default off.
- **OF-3 Precipitation from gauges (the main bet).** Options, default off, chosen in the diagnosis:
  (a) gauge–radar correction of the radar member for 0–2 h (bias from gauges within R km over the last 1–3 h, damped with lead);
  (b) an occurrence anchor "rains now / does not" for hour 0–1 from the nearest 10-min gauges;
  (c) the measured last hour (`rr1h`) as the shown value of the current hour where a gauge is close.
  Provenance rule: `measured` only for real measurements; say where no gauge is near.
- **OF-4 Measurement of the options.** Freeze the claims below with a hash **before** the runs; measure each option (OF-2,
  OF-3 a/b/c) on its own and in combination, decide by a rule written before the numbers which ones form the candidate.
  Report per cell (variable × lead window × country).
- **OF-5 Qualify a new stand of buscosun Fusion on the Prüfstand (mandatory end of the phase).** The changes of this phase
  end in a **new numbered stand** (next number after the current one on `main`, e.g. "buscosun Fusion 12" — read the
  register, do not assume), qualified exactly like Fusion 10 and 11 were (`audit/fusion-10.md`, `audit/fusion-11.md` — on the branches `fusion-10`/`fusion-11` until Jan merges them —
  `prompt-fusion11.md` as the model):
  1. Work on a branch `fusion-<n>` from `main`; the stand = one entry in `fusionRelease.ts` (`n`, option, note, switch) plus the
     default-off engine options; without the option the engine is byte-identical to the champion (identity verifier with a
     negative control). If OF-1 alone already changes outputs (other station set, fresher stamps), that change belongs to the
     new stand too — the switch of the measurement source is not "free".
  2. The Prüfstand replay must feed the new measurements (adapter `scripts/pruefstand/lib/replay.mjs`, new generation if the
     engine interface changes — exit code 4 tells you); measurements rebuilt from the originals with the leakage rule of OF-0.
  3. Register the candidate (`/pruefe-fusion <n>`; freeze date = the day the candidate is frozen; exit code 2 ⇒ ask Jan, never
     guess), then the **full test** on the development set against the champion: progress index with 95 % interval, gates
     G1–G4, best/worst core cells, "better than every single source" count. Say that the development set contains days the
     development has seen.
  4. **Acceptance only on Jan's word "abnahme"**; the clean judge is track P (≥ 4 archive days after the freeze with mature
     truth). Champion status in the register and the switch-on (push of `main`) are Jan's.
  5. If the candidate is not better (index not detectable or a gate red), say so plainly and leave it switched off —
     a phase result "no new stand" is valid.

## Expectations (freeze as claims before measuring — hypotheses, not results)

| Variable | Lead window | Expected effect | Why |
|---|---|---|---|
| Precipitation occurrence (Brier, POD/FAR) | 0–1 h | **clearly better**, most in DE and CH | 1 400+ gauges every 10 min vs. radar alone; radar misses or overestimates at the point (bright band, orography, beam height in the Alps) |
| Precipitation amount (CRPS) | 0–2 h | **better**, mainly via gauge–radar correction | radar bias persists over 1–3 h |
| Precipitation | 3–6 h | small, at most ≈ +1–2 % | correction fades as the field moves |
| Precipitation | > 6 h | none | decay |
| T, Td | 0–3 h | small (≈ 0–2 %) | the T network barely grows (rain-only stations carry no T); gains mainly where the nearest T station was not delivered before (AX-1: 4 of 8 city points had none ≤ 5 km) |
| Wind, gust | 0–2 h | small or none | few new wind stations; τ = 2 h; Fusion 7 already damps by distance |
| everything | > 6 h | none — not significantly different | negative control |
| Robustness | — | 1–2 requests instead of ≈ 20 in DE; no BrightSky outage or rate limit; latency not worse | measured in OF-0/OF-1 |

If a claim does not hold, say so plainly. Nothing is switched on with a significantly worse cell.

## Constraints and gates

- Engine changes (`src/pointForecast/fusion/**`) only as default-off options; switching on = Jan, after the Prüfstand.
- No commit or push of buscosun-web without Jan's request; data-repo pushes only for `obs/` and the obs workflows.
- No purge or cron dispatch against production from the local machine beyond what the obs mirror itself does.
- The raster fusion of the map (`src/fusion/`) is a different thing: replacing its BrightSky measurement fetch belongs to OF-1
  (same reader), its interpolation stays unchanged.
- End: status block in `CLAUDE.md` replaced, `audit/obs-fusion.md` with gates and V-OF-n, `MANUELLE-SCHRITTE.md` with Jan's gates.
