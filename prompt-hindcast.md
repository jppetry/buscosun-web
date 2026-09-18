# Kickoff-Prompt — AP10a „Fremdkalibrierung": Hindcast-Archiv lokal anlegen und verifizieren

> Für eine neue Claude-Code-Session in `C:\dev\buscosun-web`. Fassung vom 2026-09-19 (ersetzt die Etappenfassung vom
> 18.09.): die Session LEGT das Archiv AN (Pilotfenster zuerst, dann der volle Zeitraum als Hintergrundjobs) und
> nimmt es danach mit einer festen Prüfliste ab. Fit und Fallsätze sind die nächste Session. Grundlage: die Recherche
> `audit/kalibrierung-fremdarchive.md` und die Sonden vom 18.09. gegen Open-Meteo (API und S3), dynamical.org und den
> Live-Cube am CDN. Daten nach `C:\dev\buscosun-hindcast\` (kein Git-Repo), Code nach `scripts/hindcast/`. Parallel
> laufen AP9 (`scripts/punktarchiv/**`) und die Vollform-Linie (`src/point/**`, `src/pointForecast/**`). Prompts an
> Claude Code auf Englisch (CLAUDE.md).

```
You are starting AP10a ("Fremdkalibrierung") of phase FI ("buscosun Fusion on the point cube, 0–336 h") in
C:\dev\buscosun-web. This session BUILDS the local hindcast archive and then VERIFIES it once against a fixed
acceptance list. The archive is the cube's own slot form, filled from external forecast archives (Open-Meteo
on AWS S3, dynamical.org) and external observation archives (DWD CDC, GeoSphere, MeteoSwiss, IGRA2), so that
the calibration fit (src/point/calibFit.ts) can later run on 1.5–3 years of cases instead of waiting for
buscosun-archiv (first slot 14.09.2026; t3 bins scorable ≈ end of October; winter parameters only in winter
2026/27). Everything this archive yields is provenance `hindcast`, never `measured` (E-F-23). Case records
and the fit itself are the NEXT session — not here.

Working assumptions for this session (Jan can overrule them in his reply; otherwise they hold):
 • No Open-Meteo API calls beyond single probes: the free tier is non-commercial only and buscosun is a product.
   Data route = S3 (`s3://openmeteo`) + dynamical.org (Icechunk). What the API would add is listed under E-F-26
   and stays open.
 • Python is allowed for the readers (omfiles, fsspec + s3fs, icechunk, pystac, xarray, numpy, pyarrow) via
   scripts/hindcast/requirements.txt and a venv at C:\dev\buscosun-hindcast\.venv; package.json is untouched;
   Node writes the slots (E-F-27).
 • src/ is not edited. The fit contract's missing `source` field (E-F-28) is the vollform line's; you tag
   outside src/.

Read first, in this order:
1. The status block of CLAUDE.md and §18 of MANUELLE-SCHRITTE.md (what is live, what is Jan's gate).
2. audit/kalibrierung-fremdarchive.md — the research: §1 what AP10 needs per parameter and what the external
   route gives, §2 sources with licence checks, §3 routes, §4 what the external route cannot do, §5 the
   proposal, §6 risks RK1–RK6, §7 URLs. Where this prompt and §5 differ, this prompt wins (facts below).
3. The archive form you mirror: scripts/punktarchiv/lib/punktarchiv.mjs (schema history, integer coding,
   SENTINEL, newSlot, TRUTH_SCALES, parseSlot), scripts/punktarchiv/collect.mjs l.176–250 (the cube block per
   tier and point: cell, chunk, hModEffM, planes, empty), lib/truth.mjs (POI/TAWES/SMN conventions: stamp =
   END of the 10-min interval, rr1 vs rr1h, fxh, the 23-UTC dedupe), points.mjs + points.json (405 points: id,
   name, lat, lon, elev, demM, country, profile, wmo, truth.{poi,tawes,smn}, mosmix for AT/CH sites).
   prompt.md (the AP9 kickoff) describes the schema-3 block form (E-F-19 (a): neighbour cells carry only the
   31 PAP-3 planes). If AP9 has landed schema 3 in lib/punktarchiv.mjs by the time you read it, mirror THAT;
   if not, build the shape prompt.md deliverable 1b describes and say so.
4. The cube form: src/point/cubeFormat.ts (CUBE_SCHEMA 5, CUBE_PLANES = 57 planes, TIERS / TIER_BY_ID, cellOf,
   cellCenter, blockOffsets, blockCellsOutsideChunk, chunkOf, quantize / dequantize / quantStep, MISSING,
   PRESSURE_LEVELS_HPA, sigmaKindOf), src/point/sourceMatrix.ts (sources per tier, vars per source, domains),
   scripts/point/build-point-cube.mjs (HOW means, σ_div, σ_ens, pressure planes and hModEff are formed —
   replicate the RULES, do not import the producer), scripts/point/adapters/ensembleStats.mjs (the σ_ens
   estimator — use the same one), scripts/point/staticHmodel.mjs and src/point/client/staticPoint.ts (hModEff
   per source from point/static/hmodel/v1; the collector reads it in Node — do the same).
5. src/point/calibFit.ts (FitCaseBase … PhaseCase, CALIB_REGISTRY) and calibDoc.ts (CALIB_BINS_H, CALIB_N_MIN)
   — only to make sure the slots carry what the next session's case builder needs.
6. The local clones: C:\dev\buscosun-data (point/; may be behind the remote — the CDN is the truth:
   https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/point/index.json) and C:\dev\buscosun-archiv (git
   pull first; slots since 14.09., schema 1 until 17.09., schema 2 from the 18.09. 23:10 UTC slot; never push).
   Both remotes are Jan's.
Check `git status`: the tree carries uncommitted work of two parallel lines (AP9: scripts/punktarchiv/**;
vollform: src/point/**, src/pointForecast/**, verify-pv-cube / verify-point-client / verify-calib-fit). Never
revert, never commit, never edit their files.

────────────────────────────────────────────────────────────────────────────
Facts measured on 18.09.2026 — re-verify what you rely on; do not re-research what is settled
────────────────────────────────────────────────────────────────────────────
A. How the live cube is built (CDN, published 18.09. 16:58 UTC; producer unchanged in the working tree; the
   19.09. push changed the archive collector to schema 2 and the publisher, NOT the cube form):
   • t1 (0–48 h hourly; 0.05°, ny 201 × nx 241 from 45.5 N / 5.5 E; chunks 16×16, cy 13 × cx 16): deterministic
     icon_d2 (assigned) + icon_ch1_eps control + claef + icon_eu + ifs_hres + aifs_single (diversity, equal
     weight); σ_ens from icon_d2_eps (t2m u10 v10 gust precip, 6-hourly); q10/q90 from claef_eps; profile
     gammaEff/zBase/zInv/dTInv from ICON-D2 MODEL LEVELS; pressure 925/850/700 from icon_d2 (850/700 only),
     icon_eu, ifs_hres, aifs_single; hModEff = mean of the hmodel columns icon_d2, icon_ch1_eps, icon_eu,
     ifs_hres, aifs_single.
   • t2 (51–120 h 3-hourly; 0.1°, 101 × 121; chunks cy 7 × cx 8): icon_eu (assigned) + icon_eu_eps +
     icon_ch2_eps control + icon_global + aicon + ifs_hres + aifs_single; σ_ens icon_eu_eps (12-hourly); no
     quantiles, no profile; pressure 925/850/700 from icon_eu, ifs_hres, aifs_single; hmodel columns icon_eu,
     icon_ch2_eps, icon_global, ifs_hres, aifs_single.
   • t3 (126–336 h 6-hourly; 0.25°, 41 × 49; chunks cy 3 × cx 4): icon_global (to 180 h) + icon_eps_global +
     aicon + ifs_hres + ifs_ens + aifs_single; σ_ens icon_eps_global (t2m, 24-hourly) and ifs_ens (t2m precip
     u10 v10, 48-hourly); pressure 925/850/700 from ifs_hres + aifs_single (E-E-4 live); hmodel columns
     icon_global, ifs_hres, aifs_single. The t3 target means carry 7 vars (t2m td2m u10 v10 precip clct ps).
   • 57 planes: 12 target means, 12 _sd (σ_div), 6 _sd_ens, 14 _q10/_q90, profile gammaEff zBase zInv dTInv
     hModEff, pressure t925 t850 t700 rh925 rh850 rh700, srcCount ensCount. int16, MISSING −32768, scale and
     offset per plane in CUBE_PLANES. Sources enter the mean with EQUAL weight (fusion.provenance `fallback`);
     σ_div is the spread across the sources at the cell (estimator in build-point-cube.mjs); profile planes
     are never averaged; snowlmt is MISSING where the source masks it (dry cells).
B. External forecast archives (probed 18.09. at Innsbruck 47.27 N / 11.39 E):
   • Open-Meteo S3 time series `s3://openmeteo/data/<model>/<variable>/chunk_<n>.om` (us-west-2, anonymous,
     CC BY 4.0): the stitched "day-0" series (each run's first hours ⇒ lead ≈ 0–3 h for 3-hourly models, 0–6 h
     for 6-hourly ones; the run is NOT exposed). Chunk index n = floor(unixSeconds / (chunk_time_length ×
     temporal_resolution_seconds)), both from `data/<model>/static/meta.json` — verified by arithmetic against
     data_end_time. Whole-domain files of 34–41 MiB ⇒ NEVER download whole chunks; read cells by range (Python
     `omfiles` 1.2.0 via fsspec `blockcache::s3://…`, s3={"anon": True}, or the JS reader
     @openmeteo/file-reader 0.0.19). S3 values are RAW grid values (the API additionally adjusts 2-m
     temperature to the query elevation — the S3 route avoids that). `data/<model>/static/HSURF.om` is the
     model orography on the same grid (ICON-D2 verified; check the others). First chunk dates on S3:
       dwd_icon_d2   t2m, gust, cloud_cover_low, snowfall_height 2023-05-24; temperature_850hPa 2023-12-06;
                     121 h per chunk, hourly; no dew_point_2m folder (relative_humidity_2m yes)
       dwd_icon_eu   t2m 2023-05-24; temperature_925hPa 2023-12-03; 193 h per chunk, hourly
       dwd_icon      (ICON global) t2m 2023-05-25; 925 hPa 2023-11-30; 253 h per chunk, hourly
       ecmwf_ifs025  t2m + 925/850/700 hPa 2024-01-25; wind_gusts_10m 2024-11-06; 312 h per chunk, 3-HOURLY
       ecmwf_aifs025_single  t2m + 850 hPa 2025-02-05; 432 h per chunk, 6-HOURLY
       meteoswiss_icon_ch1   2025-07-01 (48 h per chunk), meteoswiss_icon_ch2 2025-06-29 (144 h); ROTATED POLE
                     (o_lat_p −43, lon_0 190; crs_wkt in meta.json); no pressure levels
       ecmwf_ifs     (IFS HRES 9 km — NOT our 0.25° source) from 2016-12-22, hourly, gusts + dew point, NO
                     pressure levels — not used unless Jan asks; a marked stand-in at most
     Ensemble folders on S3 hold only precipitation_probability. `<var>_previous_dayN` exists ONLY in the API.
   • Open-Meteo S3 runs `data_run/<model>/YYYY/MM/DD/hhmmZ/<variable>.om`: whole runs, every variable incl.
     pressure levels, ≤ 1 run per 3 h, RETAINED 3 MONTHS — on 18.09. 2026-06 … 2026-09-18 for dwd_icon_d2 (8
     runs per day, 93 files per run, 6–20 MiB each), dwd_icon_eu, dwd_icon, ecmwf_ifs025, ecmwf_aifs025_single,
     meteoswiss_icon_ch1/ch2, ecmwf_ifs. Backward-summed variables (precipitation) lack the first step there.
     THIS WINDOW EXPIRES DAILY — secure it before anything else that takes hours.
   • Open-Meteo APIs (free tier non-commercial; probes only): historical-forecast-api (ICON day-0 series from
     2022-11-24, ICON pressure levels from ≈ 2023-10-02, IFS 0.25° from 2024-02-03, AIFS from 2025-02-17,
     ICON-CH from 2025-07-29); previous-runs-api (`<var>_previous_day1…7`; only t2m, rh, td, precipitation,
     wind, gust (ICON only), total cloud, ps/msl; from 2024-01-19 / IFS 2024-02-04); single-runs-api
     (https://single-runs-api.open-meteo.com/v1/forecast, `run=`: ecmwf_ifs 9 km from 2024-03-14 without
     pressure levels; all other models from 2026-04-02 incl. pressure levels). = E-F-26, open.
   • dynamical.org (Icechunk on AWS Open Data; STAC https://stac.dynamical.org/<slug>/collection.json, asset
     `icechunk-https`; Python: `dynamical_catalog` or icechunk + pystac + xarray; CC BY 4.0 + ECMWF terms):
       ecmwf-ifs-ens-forecast-15-day-0-25-degree — init 2024-04-01 → present, 00z only, 51 members (member 0 =
         control), lead 0–360 h (3-hourly to 144 h, 6-hourly after); temperature_2m, dew_point_temperature_2m,
         precipitation_surface, pressure_surface, pressure_reduced_to_mean_sea_level,
         total_cloud_cover_atmosphere, wind_gust_10m, wind_u/v_10m, temperature_850hpa/925hpa, geopotential
         heights 500/850/925 — no 700 hPa, no RH
       ecmwf-aifs-single-forecast — init 2024-04-01 → present, 4 runs/day, 6-hourly to 360 h (t2m, td2m,
         precip, ps, msl, tcc, u/v 10 m, t850/t925, z500/850/925; no gust)
       ecmwf-aifs-ens-forecast — init 2025-07-02, 51 members, 4 runs/day, 6-hourly
       dwd-icon-eu-forecast-5-day — init 2026-02-10, 4 runs/day, hourly to 78 h then 3-hourly to 120 h (cloud
         low/mid/high, gust, td2m, ps/msl, precip; no snowlmt, no pressure levels)
C. Nothing external carries: ICON-D2-EPS, ICON-EU-EPS, ICON-CH1/CH2-EPS members, ICON-EPS global, C-LAEF and
   C-LAEF-EPS, AICON, ICON model levels (⇒ profile planes gammaEff/zBase/zInv/dTInv), MOSMIX history. These
   planes stay MISSING in every hindcast slot; srcCount / ensCount tell the truth.
D. Observation archives (licences in the report §2): DWD CDC hourly + 10-min ZIPs per station (GeoNutzV,
   attribution), GeoSphere `klima-v2-10min` (CC BY 4.0), MeteoSwiss OGD `ch.meteoschweiz.ogd-smn`
   historical/recent/now (CC BY 4.0, "Source: MeteoSwiss"), IGRA2 radiosondes (19 active DACH stations).
   Station-id mapping is NOT given: points.json ids are DWD POI/WMO ids (e.g. 10384), CDC uses its own
   Stations_id (e.g. 00433); map by coordinates + name from the CDC station list and PROVE the mapping on the
   14.09. → today overlap against the archive's POI truth (equal to the digit). Same for GeoSphere klima-v2
   ids vs TAWES ids and MeteoSwiss abbreviations.

────────────────────────────────────────────────────────────────────────────
What the archive contains (Jan, 18.09., revised by the S3 facts)
────────────────────────────────────────────────────────────────────────────
  t1  from 2023-05-24: the day-0 series of icon_d2 + icon_eu; ifs025 from 2024-01-25 (3-hourly), aifs from
      2025-02-05 (6-hourly), icon_ch1 from 2025-07-01 (CH domain only, rotated pole). Planes: 12 means,
      12 σ_div, hModEff, srcCount, ensCount = 0; pressure t925/t850/t700 (+ rh) from the dates above (icon_d2
      850/700 only; 925 from icon_eu / ifs / aifs); σ_ens, q10/q90, profile planes MISSING. Each hour records
      its leadH as an INTERVAL (the run is not exposed: assume the latest init ≤ valid − the model's
      availability delay; document the assumption; the fit bins these as 0–6 h) and the sources that entered.
  t2  from 2024-04-01 via dynamical.org: aifs_single (all four runs; 6-hourly ⇒ every second t2 step) + the
      IFS ENS control member as the `ifs_hres` stand-in (00z; 3-hourly ⇒ every t2 step; marked) + dwd_icon_eu
      from 2026-02-10 (the real assigned source). Planes: means of the vars each source carries (t2m td2m u10
      v10 precip clct ps; gust from ENS / ICON-EU; clcl/clcm/clch only with ICON-EU; snowlmt MISSING), σ_div
      where ≥ 2 sources, t850/t925 (no 700 hPa, no rh before 2026-04), hModEff, counts; σ_ens MISSING.
  t3  from 2024-04-01 via dynamical.org: aifs_single + IFS ENS control (stand-in, marked) as means; σ_ens
      t2m precip u10 v10 (+ gust) from the 51 members with the producer's estimator; t850/t925; hModEff;
      counts. icon_global / aicon / icon_eps_global MISSING.
  all tiers, 2026-06 → today from `data_run` (expiring): the EXACT full-run pseudo-cube with every source that
      exists there (icon_d2, icon_eu, icon, ifs025, aifs025_single, icon_ch1/ch2) and all planes except EPS /
      quantiles / profile — the shadow window against buscosun-archiv (14.09. →) AND 3.5 months of complete
      deterministic hindcast for all leads. One pseudo-run per cube tier cadence (t1 all 8 runs, t2 00/06/12/18,
      t3 00/12).
  truth for the same range, all three networks, plus IGRA2 (no date limit) for φ.

────────────────────────────────────────────────────────────────────────────
Files — code in scripts/hindcast/, data in C:\dev\buscosun-hindcast\ (NOT a git repo; never inside
buscosun-web, buscosun-data or buscosun-archiv)
────────────────────────────────────────────────────────────────────────────
C:\dev\buscosun-hindcast\
  README.md              what this is, provenance, ATTRIBUTION (Open-Meteo CC BY 4.0; dynamical.org CC BY 4.0 +
                         ECMWF terms; DWD GeoNutzV; GeoSphere CC BY 4.0; MeteoSwiss "Source: MeteoSwiss";
                         NOAA/NCEI IGRA2)
  index.json             kind hindcast/index, schema, days, per tier: first/last day, sources, planes covered,
                         and the verification stamp (below)
  cells\<tier>.json      per point and tier: the block cells (blockOffsets), the cube cell centres, and PER
                         SOURCE the source-grid index of each cube cell centre (nearest source cell, rotated-pole
                         aware for ICON-CH) — computed ONCE, verified
  cache\<source>\<var>\  extracted raw cell values (float32; parquet or npz), one file per om chunk / run /
                         Icechunk slice — the only thing the readers write; rebuildable; never whole om files;
                         the fsspec blockcache directory lives here too (bounded, measured)
  slots\<YYYY-MM-DD>\<HHMM>.json.gz   the hindcast slot (form below)
  truth\<YYYY-MM-DD>.json.gz          truth per day in the archive's form (TRUTH_SCALES, byPoint), all networks
  log\                   per pull: bytes, requests, seconds, failures, resumption points
  verify\<date>.json     the acceptance run (below)

scripts/hindcast\
  README.md              how to run, stage by stage, with the measured costs
  requirements.txt       the Python readers' dependencies (E-F-27)
  cells.mjs              builds cells\<tier>.json from points.json + cubeFormat.ts + each source's grid
                         (meta.json crs_wkt, static/HSURF.om dims); Node
  extract_openmeteo.py   S3 om series + data_run → cache (range reads; --source --var --from --to; resumable;
                         0 bytes on a re-run of a finished range)
  extract_dynamical.py   Icechunk → cache (AIFS single, IFS ENS all members, ICON-EU; --dataset --from --to)
  extract_truth.mjs      CDC / GeoSphere / MeteoSwiss / IGRA2 → truth\ (reuse lib/truth.mjs parsers where the
                         format is the same; new readers for the historical endpoints; id mapping with proof)
  build-slots.mjs        cache → slots (Node; imports cubeFormat.ts, punktarchiv.mjs coding, staticPoint.ts);
                         deterministic: the same cache gives byte-identical slots
  shadow.mjs             hindcast vs buscosun-archiv per plane and tier (part of the acceptance)
  verify-hindcast.mjs    the acceptance (V1–V8 below); writes verify\<date>.json and stamps index.json; run it
                         directly (package.json is shared — ask before adding an alias)

Slot form — mirror the archive, name every difference:
  { schema: 1, kind: 'hindcast/slot', slotAt, slotAtMs, createdAt, producer, codeHash, sentinel: -32768,
    scales: { cube: { t1: { plane → { scale, offset, unit } from CUBE_PLANES }, t2, t3 }, truth: TRUTH_SCALES },
    external: { openmeteo: { models: { id → { meta.json, chunk range, dataRun runs } } },
                dynamical: { datasets: { slug → { init range, members } } } },
    cube: { t1: { run: null | 'YYYYMMDDhh' (the init as pseudo-run), leadClass: 'day0' | 'run',
                  leadHours, planeOrder (57 ids), sources: [{ id, external, role, steps, vars, gridDeg }],
                  standIn: [{ plane or source, standsFor, why }],
                  provenance: { class: 'hindcast', perPlane: { plane → { sources, estimator } } },
                  byPoint: { id → { cell, chunk, block: [{ iy, ix, centre, distKm, sameChunk, planes (31) }],
                                    hModEffM, planes (int16-coded, 57), empty,
                                    leads: [{ leadH | [leadMinH, leadMaxH], validAtMs, srcCount }] } } },
            t2: …, t3: … },
    truth: { windowH, window, byPoint } (or the pointer to truth\<day>),
    stats: { errors, warnings, timing, bytes } }
  Coding: quantize() from cubeFormat.ts on the FINAL value only, never on intermediates; MISSING for absent;
  srcCount = sources that entered the mean at that step; ensCount = members that entered σ_ens (51 for ENS,
  else 0), as the producer defines them.
  Value rules = the producer's rules: raw source value at the cube cell centre's nearest source cell — no
  bilinear interpolation, no elevation correction; equal-weight mean; σ_div with the producer's estimator;
  σ_ens with ensembleStats.mjs's estimator; hModEff = mean of the hmodel columns of the sources that entered
  (point/static/hmodel/v1 via staticPoint.ts); pressure planes = mean across the sources carrying the level;
  td2m for sources without dew point = Magnus from t2m + rh (the producer does this for C-LAEF — document
  it); snowlmt MISSING where the source masks it.

────────────────────────────────────────────────────────────────────────────
Order of work
────────────────────────────────────────────────────────────────────────────
1. Diagnosis (short, written before code, §8.0 of the report): re-check the facts you depend on; list per tier,
   source and variable the exact first/last dates on S3 and dynamical; measure one om range read and one
   Icechunk point read (bytes, ms); count the needed cells per source (405 points × block cells, deduplicated);
   estimate bytes and hours per route. No blocking gate — write the numbers and go on; Jan reads them later.
2. Cells (cells.mjs) with their checks (V2) — before any pull, because every pull depends on them.
3. PILOT window, all parts of the pipeline end to end: data_run 2026-09-01 → today (all sources, all needed
   variables, all runs), day-0 series 2026-08-01 → today, dynamical 2026-08-01 → today, truth 2026-08-01 →
   today; build the slots; run the acceptance V1–V8 on the pilot. Fix what fails. Only then spend hours.
4. Full range as resumable BACKGROUND jobs with a log, in this order, while you verify and document:
   (a) data_run 2026-06 → 2026-08 (expiring), (b) dynamical 2024-04-01 → 2026-07, (c) day-0 series
   2023-05-24 → 2026-07, (d) truth 2023-05-24 → 2026-07. Build slots as each range lands. Never a foreground
   sleep loop; check with a Monitor/until condition or on the job's completion notice.
5. Acceptance V1–V8 on the full archive (sampled where noted); verify\<date>.json; index.json stamped with the
   verification (date, verifier version, pass/fail per check, sample sizes).
6. Report (§8 of audit/kalibrierung-fremdarchive.md; CLAUDE.md status: one row "AP10a Hindcast" —
   coordinate, two other lines edit that file).

────────────────────────────────────────────────────────────────────────────
Acceptance — verify-hindcast.mjs (netzfrei except V4/V5, which read the local clones), each with a negative
control; a check without a negative control does not count
────────────────────────────────────────────────────────────────────────────
V1 Form. Every slot parses; schema 1, kind hindcast/slot; 57 plane ids in CUBE_PLANES order; scales equal
   CUBE_PLANES; leadHours per tier equal TIERS (t2/t3 runs) or the day's hours (t1 day-0); block cells per
   point equal blockOffsets(lat − cellLat, lon − cellLon) and the nearest cell is complete while neighbours
   carry exactly the 31 PAP-3 planes; a punktarchiv slot is REJECTED by the hindcast reader and vice versa;
   a slot with one plane id renamed is rejected.
V2 Cells. The cube cell centre maps to the source cell whose centre is nearest (distance ≤ half the source
   grid step) for every source and point; rotated-pole round trip for ICON-CH (forward + inverse within 1e-6°);
   a deliberately shifted cell differs. INDEPENDENT proof: the source's own orography from S3
   (`data/<model>/static/HSURF.om`) at the mapped cell equals our point/static/hmodel/v1 column of the same
   source at the same cube cell within 1 m for ≥ 99 % of cells (report the rest with coordinates).
V3 Values. (a) Rebuild determinism: three random slots rebuilt from cache are byte-identical. (b) Round trip:
   for a random 1 % sample of (point, tier, step, plane), dequantize(plane) − the mean of the raw source
   values recomputed independently from cache ≤ quantStep/2; the σ_div plane equals an independent spread of
   the same raw values within quantStep; srcCount equals the number of sources present; MISSING exactly where
   no source has a value; no plane listed in C carries a value anywhere (count over the whole archive).
   (c) Chunk-index arithmetic reproduces data_end_time from meta.json for every model used.
V4 Shadow against the real cube (buscosun-archiv slots 14.09. → today, nearest cell, all planes). Two classes:
   • EXACTLY comparable planes — same sources on both sides: t1/t2/t3 pressure planes (icon_d2, icon_eu,
     ifs025 = ifs_hres, aifs_single all in data_run), hModEff (same static product), t3 σ_ens from the 00z
     ENS (dynamical members = the open-data ENS). Threshold: |Δ| ≤ 1 quantStep for ≥ 95 % of (point, step)
     pairs per plane; report the rest and the reason found (cell mapping, run choice, estimator).
   • NOT exactly comparable — the hindcast lacks claef, the EPS, icon_global/aicon, ch1 before 2025-07: the
     fused means and σ_div. Report MAE / bias / n per plane and tier and NAME the source-set difference; no
     threshold, no tuning. Add (a) ENS control vs ifs025 on the same run (the 2024–2026 stand-in error),
     (b) AIFS 6-hourly vs cube, (c) day-0 stitched vs the full run of the same hour (the lead-0–3 h error).
V5 Truth. For 14.09. → today every value that both the archive's truth and the hindcast truth carry is equal
   to the digit (t, td, rh, ff, dd, fx/fxh, rr1/rr1h, n, p) per network; the 23-UTC hour appears once; the
   TAWES/SMN rr1h is the six-value sum; coverage per network per month reported; IGRA2 parsed against one
   published sounding (values equal). Negative control: a shifted hour stamp fails.
V6 As-of. Truth stamps in slot N never lie before the slot's forecast init (t2/t3) or before the day-0 hour
   they are compared to; a shifted-time control fails.
V7 Resumability and inventory. A re-run of every extractor over a finished range transfers 0 bytes; index.json
   coverage equals the files on disk (days, tiers, planes); log\ carries bytes per source and route.
V8 Licence and provenance. README with attribution present; every plane with values names ≥ 1 source; every
   stand-in is listed in the slot; no API call in the logs (probes excepted, listed).

Ground rules:
 • Diagnosis first (step 1 before pulls). Nothing here is a calibration: no fit, no calib.json, no client.
 • Licences: only CC BY / GeoNutzV / MeteoSwiss OGD sources; attribution file in the archive root; log bytes
   per source (RK4).
 • Never write into src/, scripts/punktarchiv/**, scripts/point/**; import from them. Findings in your own
   namespace V-HC-1…; decisions E-F-26+ (check audit/fusion-vollform.md for collisions first).
 • No commits, no pushes, nothing into the data or archive repos (a git pull of the archive clone is fine).
   Verifiers run without asking, one at a time; PowerShell never with 2>&1; Bash truncates at ≈ 8 KB (Write
   tool for large files); npm run swallows `--` ⇒ node --experimental-strip-types --import
   ./scripts/lib/register-ts.mjs scripts/… ; Python via the venv; long pulls as background jobs with a log.
 • Numbers are measured or marked `set`; no extrapolation from one case; the V4 numbers are the only basis
   for calling a stand-in "usable".
 • Doku Deutsch (audit/kalibrierung-fremdarchive.md §8 as the protocol), code and comments English, the
   algorithm is always "buscosun Fusion".

End with a report that stands on its own: the diagnosis numbers (dates per source and variable, bytes / hours
per route), what was pulled (per tier first/last day, planes, sources, GB on disk), the acceptance table V1–V8
with pass/fail and sample sizes, the V4 shadow table, what is still running in the background and how to
resume it, the E-F-26 question with the reachable n per bin, and what the next session (cases + fit) needs.
```
