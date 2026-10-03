# Kickoff prompt — Phase RR: Regenradar on the Wetterkarte map and buscosun-data (03.10.2026)

> Paste the block below into a fresh Claude Code session in `C:\dev\buscosun-web`. Prompts to Claude Code are in
> English; all documentation you write stays German (CLAUDE.md, Sprache & Konventionen).

---

You are working on **buscosun** (`C:\dev\buscosun-web`). Read `CLAUDE.md` completely before anything else — it is the
constitution of this repo (hard rules, gates, naming, verification). Then read, in this order:

1. `audit/regenradar-datenangleich.md` — the diagnosis (RR0) and the plan (RR1) for THIS phase. It is your work order.
2. `audit/niederschlagsplattform-konzept.md` — the concept "Regenradar 2.0" this phase is the foundation for (read for
   direction only; its later phases NP-0…NP-5 are NOT in scope).
3. `audit/regenradar-layer-angleich.md` (RL1) — how the Regenradar already shares layer modules with the Wetterkarte.
4. `docs/niederschlag-architektur.md` — Jan's decision of 24.07.2026: the precipitation view shows measured radar /
   nowcast only, no model extension. It stays valid for this phase.
5. `reference/README-regenradar2.md` and `reference/regenradar2-desktop.dc.html` — the UI direction (the map in the
   centre is now the real `MapView`; the 3D stage and the 14-day axis are later phases).

## Goal (Jan, 03.10.2026, verbatim in German in the audit)

The Regenradar (`/regenradar`, `src/nowcast/*`) must use **exactly the same map and the same logic as the Wetterkarte**
(`src/MapView.tsx`) and read its data from **buscosun-data** like the Wetterkarte does. It is about precipitation only:
precipitation, cell tracks (KONRAD3D), snow, snow line and lightning — "soweit vorhanden".

## What the diagnosis found (verify it yourself first — code beats docs)

- Radar frames (RV/INCA/rzc), KONRAD3D, snow already come from buscosun-data through the same loaders (RD3, BW-6, RL1).
- Different today: (a) the map (`src/radar/RadarMap.tsx`, liberty/Esri) vs `MapView` (positron); (b) the snow line
  (one point value contoured over the DEM, `precipPhase.snowLineGeoJSON`) vs the Wetterkarte's field
  (`scalar/snowLine.ts`, ICON-D2 temperature repack + DEM + ML #2); (c) the point strip 2–6 h uses the live path
  `getPointForecast` (BrightSky/GeoSphere/stations from foreign origins) instead of **buscosun Fusion 8** on the point
  cube (`pointSource: 'cube'`, as `PointForecastPanel.tsx:170` does); (d) the Regenradar has a 45-min look-back the
  Wetterkarte does not have.
- Lightning, CH hail and warnings are live (not in buscosun-data) in BOTH views. Same logic as the Wetterkarte here means
  "live like the Wetterkarte". Do NOT build a lightning mirror in this phase.

## Procedure (Diagnose-First, one topic = one phase = one gate)

1. **RR0 — verify the diagnosis.** Re-read every anchor in §1/§2 of the audit against the current tree (line numbers
   drift). Record deviations in the audit (§1 table, new rows if needed). Take a network capture of a cold
   `/regenradar/muenchen` load and list every request with its origin (§2). No code before this is written down.
2. **STOP & ASK Jan** for E-RR-1, E-RR-2, E-RR-3 (audit §6) unless he already answered them in the audit or in
   `MANUELLE-SCHRITTE.md`. Do not guess them. Present the options exactly as written, with your recommendation.
3. **RR1 — implement steps RR-a … RR-g** from audit §4, in that order, each additive and flag-gated:
   - `MapView` changes only behind new optional props (`profile`, `timeMs`, pick/hover callbacks). Without them the
     Wetterkarte must stay pixel-identical — prove it with a pixel diff against HEAD.
   - `PrecipCompositor.build()` gets an optional `rvPast`; without it the output must be byte-identical (verifier with a
     real frame, plus a negative control).
   - Import, never copy (RL1 rule). Shared logic moves into small pure modules that a Node verifier can import.
   - The old `RadarMap` path stays reachable behind `?rr=legacy` as the named fallback (Rule 2). Do not delete files.
   - The point strip: `import('../pointForecast/cubeSource')` then `getPointForecast({ …, pointSource: 'cube',
     includeRadarNowcast: true })`; on error or with `?pf=live` fall back to the live path and log the reason. Keep
     `assembleNowcast` pure.
4. **RR-h — gate GRR** (audit §5): the five self-verification questions in writing with evidence (screenshot paths,
   verifier output, traces), all listed verifiers green, new `verify:regenradar-profile` (+ npm alias), `npm run
   typecheck`, `npm run build`, `npm run budget` (raise limits only with a note). UI checks with Chrome DevTools MCP at
   1440×900 and 390×844 (DPR 3); WebGL claims need a real device — tell Jan.

## Hard limits for this phase

- STOP & ASK before: any shader/WebGL pipeline change (`RainLayer`, `ScalarLayer`, `WindLayer`), any change to buscosun
  Fusion (engine, tables, options, `FUSION8_*`), Edge Functions, crons, the data repo, retention, deleting components,
  dependency changes.
- Mobile changes only via the 767 px media query; desktop regression = phase failed.
- Honesty rules: every value keeps its provenance; AT/CH gaps (no cells, no lightning network, no CH nowcast) are shown,
  never hidden; cells carry "Hinweis", never warning language.
- No commits, no pushes, no purges. Jan's gates go into `MANUELLE-SCHRITTE.md` as a new section.

## Deliverables

- `audit/regenradar-datenangleich.md` completed: §1/§2 verified, implementation log with evidence (new §9), gate
  table §5 filled, new V-RR entries.
- `CLAUDE.md`: replace the status block row for this phase (current state only, no chronicle).
- `MANUELLE-SCHRITTE.md`: new section with Jan's gates (push/deploy check, E-RR decisions, real-device test).
- A short German summary for Jan at the end: what changed, what is measured, what is open.
