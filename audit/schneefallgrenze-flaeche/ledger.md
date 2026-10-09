# SDD ledger — plan: docs/superpowers/plans/2026-10-09-schneefallgrenze-flaeche.md

Setup: Ruling: work in the main working tree, no worktree, no commits — SK depends on uncommitted HZS (`snowSentence`) and ZT (`TowerStage.onStageReady`) code that a worktree would not contain; CLAUDE.md makes commits Jan's gate — cost if wrong: SK changes mix with other sessions' uncommitted changes (kept apart by file/hunk).
Setup: Ruling: "BASE" for task-start/task-done = HEAD e2c3a2c (no commits are made) — ranges are not meaningful; evidence = verifier output per task.
Setup: Ruling: G5 checks `git diff` only on src/pointForecast, src/point, src/fusion; for src/MapView.tsx (already modified by ZT) G5b checks that its diff contains no SK identifier — cost if wrong: an SK edit to MapView slips through unnoticed (MapView is not on SK's file list).

Pre-flight:
- T1→T3/T6/T7: CapPalette, SK_* constants, fmtSnowLine — consistent.
- T1 snowPhase.phaseAt → T6 engine — consistent after the plan fix (SkPhase).
- T2 SnowGrid/snowAt → T3 buildCap, T6 — consistent.
- T3 CapResult → T5 layer.setData — consistent.
- T4 WetGrid/wetSampler → T6 — consistent.
- T6 useSnowCap(map, active, tMs, opts{palette,beforeId,prefix,mobile}) → T7 — consistent.
- T8 HZS exports (snowSentence, wetAround, dayClock, fmtM, HZS_DRY_P, snowPointsFromV2, columnsFromV2) — verified present 09.10.
- T8/T9 TowerStage prop is `onStageReady` (verified TowerStage.tsx:72), ZT_FIRST_DRAPED_LAYER = 'zt-cone' (:38) — consistent.
Task 1: complete (no commits, tests: node … scripts/verify-snowcap.mjs → 6 ✓ / 0 ✗; RED seen: ERR_MODULE_NOT_FOUND). Ruling: model exports fmtMeters (plan had private fmtM) — reused by UI — cost if wrong: none
Task 2: complete (tests: verify-snowcap.mjs → 12 ✓ / 0 ✗; RED seen: snowField.ts missing)
Task 3: complete (tests: verify-snowcap.mjs → 21 ✓ / 0 ✗; RED seen: capRaster.ts missing)
Task 3: Ruling: verifier flattens LineString coords with flatMap(coordinates) instead of the plan's `.flat()` (which turned points into numbers) — plan defect — cost if wrong: none
Task 3: Ruling: synthetic DEM samples pixel corners (px/256) to match demAt's bilinear convention (elevation.ts) — cost if wrong: C0 tolerance only
Task 3: Ruling: CapResult.stats gains `ms` (build time) for the ?sklog=1 measurement of Task 10 — cost if wrong: none
Task 4: complete (tests: verify-snowcap.mjs → 25 ✓ / 0 ✗; RED seen: capWet.ts missing). Added D4 (radar overrides field in its own country; AT falls back) beyond the plan.
Task 5: complete (typecheck 0). Ruling: explicit fields instead of constructor parameter properties; openSnowTap (Task 9) placed here already — cost if wrong: none
Task 6: complete (tests: verify-snowcap.mjs → 30 ✓ / 0 ✗, typecheck 0; RED seen: snowCapView.ts missing)
Task 6: Ruling: capViewFor/demZoomFor live in pure `snowCapView.ts` (engine imports browser modules the node verifier cannot load); engine re-exports them and SnowCapLayer so the hook loads ONE lazy module — cost if wrong: none
Task 6: Ruling: radar stacks memoized 120 s ('latest') and fetched only when the map time lies in −2.2…+3.2 h of now (getRadarStack has no cache; 3 countries per 5-min key would refetch) — cost if wrong: AT/CH stacks fetched once more than needed when the user is in DE
Task 6: Ruling: DEM tile loads are not aborted (memo shared by successive views) — cost if wrong: a few tiles downloaded for a view already left
Task 7: Ruling: G5 drops src/nowcast/heightTime + cellTowers (untracked ⇒ git diff vacuous); instead sha256 snapshot before SK edits, compared at the end — cost if wrong: none
Snapshot (before Task 7):
  fd31341e40428cc2075375984b107e6a89ea9c8cd95e7b4bf51df6c40c2b026e *src/nowcast/heightTime/heightTime.css
  861e173d0fca80fad25ba02f0efd7b4a82f7e667ded52202499f22b5d8ef982b *src/nowcast/heightTime/HeightTimeChart.tsx
  0cbf7e5f31460ffb13b708b2038a5e036f4b4aa6a2474f03bffa30f4bbe8ea85 *src/nowcast/heightTime/heightTimeFlag.ts
  2a63d84d563292c6391bb3b63baae26544a5352b3914e2fe561de821d51ae812 *src/nowcast/heightTime/heightTimeModel.ts
  801c3e55dbf0a63f391f9cf00a916e70b3ef888cb95d834345fb689e32b17f7a *src/nowcast/heightTime/HeightTimePanel.tsx
  35f175fb6ab1db57cf2eeebbf373f6f6f9fd7c0a3d4f6e171a8ec687631051a2 *src/nowcast/heightTime/terrainRing.ts
  30b83a5eec8721722ebc6d885d633a70b079236b09e0971bde55e06ad238d850 *src/nowcast/heightTime/useHeightTime.ts
  83372e5c12d028f9461578e059876a0ddda598701e1167f904e22a95d60efbb4 *src/nowcast/cellTowers/cellTowers.css
  62732b2d0627d3f7434dddfc5eb1ae0824464d25cfb8aa342a0401a2520a8191 *src/nowcast/cellTowers/cellTowersShell.css
  efccb80420600cda6ccd07db2b25a062fc4d47556bd9ee8b4bc4c7d404376523 *src/nowcast/cellTowers/konradAt.ts
  384a88308b7c978fde82e57aa7f16a852db6a61cc14788f6f9fc28a201268c66 *src/nowcast/cellTowers/radarDrape.ts
  d1505d1dd8d91192f07206cf6d891fa4d13743cd2b2b479425ad2daedb642f54 *src/nowcast/cellTowers/towerFlag.ts
  3b5c4e79bd88ea1185835ef478188637accb7b00a88ac1d8959fc112495afb49 *src/nowcast/cellTowers/towerModel.ts
  2f580930199897502fdab1a2d030d229b724bb4db62b5f608db1646467e307ae *src/nowcast/cellTowers/TowerStage.tsx
  c1b9b6228b6b74b2ffe4b57ea8ff2ab62f7c1bbb4cb1ec96fdf249428dfed335 *src/nowcast/cellTowers/towerTrend.ts
Task 7: Ruling: layer list keyed on boolean `skOnMap` (the deck passes a new `snowCap` object per render — keying on it would rebuild MapView's layer list every render); G1 regex follows — cost if wrong: none
Task 7: Ruling: legend renders as `.nc-radar-snownote.sk-legend` in the RR note's slot (same position as before) instead of an own absolute box; on mobile (where map legends are hidden) only the status line shows — cost if wrong: hint less visible on mobile
Task 7: Ruling: hover shows "mm/h · Höhe … · Schneefallgrenze … · Phase" (radar value kept) via separate skHover state instead of hijacking sumHoverRef — cost if wrong: none
Task 7: Ruling: 3D tap effect implemented in Task 7 (same place, needs snowCap3d) — Task 9 reduced to the browser check
Task 8: complete (tests: verify-snowcap.mjs → 47 ✓ / 0 ✗, typecheck 0; RED seen: snowArrival.ts missing, G3/G4 red before deck wiring)
Task 8: Ruling: place card + its hook live in lazy `SnowArrivalPanel.tsx` (static import via SnowCapUi would pull the HZS model and fusion/meteo into the map/deck chunk); G6c pins it — cost if wrong: none
Task 8: Ruling: `pct` says "< 5 %"/"> 95 %" at the ends like the chance card (never 0/100 %) — cost if wrong: wording only
Task 8: Ruling: mobile bar = 16 cells of 3 h (44-px targets), kind = most snowy of the three (`groupCells3h`, F6) — cost if wrong: coarser mobile bar
Task 8: Ruling: dock sub-label "Fläche + Spanne" skipped — it sits in the mobile LayerPanel (separate component, would need a prop through ZT/HZS-touched lines); label stays "Schneegrenze · Schneefallgrenze" — cost if wrong: dock does not say that the layer changed with ?sk=1
Task 9: folded into Task 7 (tap effect) + Task 10 (browser check)
Task 10: Ruling: mobile bar scrolls horizontally with 44×44 px 3-h cells (plan's 16 cells in 1fr columns were ~21 px wide, violating touch ≥ 44 px) — cost if wrong: the user has to swipe the bar on mobile
Task 10: Browser finding → fixed: TDZ crash in "Karte + 3D" (`towerStage(…)` called during render read `skOn` declared below) — G4b RED→GREEN, decl moved above the ZT block
Task 10: Browser finding → fixed: 2D cap was ABOVE the radar (getStyle() lists no custom layers) — G2c RED→GREEN, anchor via getLayer('precip-rain-layer'); layer re-anchored on each setData
Task 10: Ruling: desktop legend = items in the radar legend (bottom); the top-left note slot collided with KONRAD/source chips in split view; mobile keeps a status note — cost if wrong: none
Task 10: Ruling: labels as points on the 3 longest runs (alpine contours too winding for line-placed labels — none rendered) — C3b RED→GREEN — cost if wrong: fewer labels than along-line placement in flat terrain
Task 10: Ruling: no build pixel diff against HEAD — the shared tree has ZT default-on since 09.10. (every pixel diff vs HEAD differs for ZT reasons); evidence for "no flag ⇒ unchanged" = probe run "Ohne Schalter" (0 sk elements, ICON-D2 line + note as before) + all SK paths gated on snowCap/skOn — cost if wrong: an unnoticed visual change without the flag; redo the diff after Jan splits the commits
Task 10: complete (tests: verify-snowcap 50/50, --live 53/53; neighbours green; typecheck 0; build green; budget 1691.5/1693; probe: console 0)
Final review: opus reviewer (fresh context), 11 findings. Re-graded by effect.
Final: fixed #1 pitched 3D clip centred on bounds instead of look-at point — E6 RED→GREEN, suite 56/56
Final: fixed #2 2D cap cut to a 6°×4° box when zoomed out — E7 RED→GREEN, suite 56/56
Final: fixed #3 stale hour after a failed preparation — G7 RED→GREEN (catch clears prep + image), suite 56/56
Final: fixed #4 playback starvation — G7 RED→GREEN (coalesced prep + raster, no 'loading' with a state, async toBlob, 2D build rests in "3D"), suite 56/56
Final: fixed #5 (re-graded Minor→Important: console warning on leaving 3D = gate question 4) touching the removed stage map — G8 RED→GREEN, probe "zurück auf Karte" console 0
Final: fixed #8 (re-graded Minor→Important: legacy fallback triggers automatically on a chunk error) cap on the legacy map — G2d RED→GREEN
Final: fixed #11 accidental change of HEAD line `const i0 = stack` — G2e RED→GREEN
Final: Ruling: #3 partly — during a normal time change the previous image stays until the new one is built (clearing it would flicker during playback); only a FAILED preparation clears it — cost if wrong: for ≤ one build the old hour is visible under a new slider time
Final: Ruling: G2d avoids the token `stage3d` in SK lines (ZT's verifier G9 counts any such line as a ZT line); the deck passes `snowCap.mapHidden` — cost if wrong: none
Final: minor (deferred): #6 contour runs split at the ring start (a run crossing ring[0] becomes two features)
Final: minor (deferred): #7 "no data" note says "bis 120 h ab Lauf" also for look-back times before the latest t1 run / at the t1–t2 seam
Final: minor (deferred): #9 place card does not roll to the next hour while the page stays open
Final: minor (deferred): #10 hatch is effectively 2 px (integer modulo) and in image pixels
Final suite: verify:snowcap 56/56, --live 59/59; cell-towers 59/59, height-time 58/58, regenchance 44/44, rain-window 63/63, cell-places 60/60, fusion-release 28/28, regenradar-profile 24/0/1, dashboard 80/80; typecheck 0; build green; budget totalJs 1691.9/1693, eagerJs 109.3; probe console 0
