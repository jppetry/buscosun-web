# High-End Precipitation Radar — Feature Catalogue

Reference specification for the buscosun / WeatherHub radar view.
Organized by capability area, not by UI layout — priority and screen-placement are downstream decisions.

> ⚠️ **Korrektur 2026-08-05:** Der frühere Hinweis an dieser Stelle beschrieb eine Ansicht
> „Niederschlag · jetzt–**12 h**" mit nahtlosem Übergang Radar → Modell. **Das ist überholt.**
> Mit **D-14** (Jan, 2026-07-24) wurde die Modellhälfte 2–12 h entfernt; die Ansicht heißt
> **„Niederschlag · jetzt–2 h"** und zeigt ausschließlich gemessenes Radar/Nowcast, per Land bis zum
> jeweiligen Horizont (DE 2 h · AT 3 h · CH ~0,5 h). Jenseits davon blendet der Layer aus —
> **keine Modellverlängerung**. Der separate Sim-Radar-Layer wurde mit **D-15** entfernt.
>
> **Umgesetzt:** [`niederschlag-architektur.md`](./niederschlag-architektur.md)
> (`PrecipSource`-Abstraktion, `RainLayer`, Quellen DE/AT/CH, Land-Horizonte).
> Spec: [`../audit/niederschlag-vereinheitlichung.md`](../audit/niederschlag-vereinheitlichung.md).
>
> **Dieser Katalog bleibt gültig als Referenzspezifikation** — die Funktionen aus §2 (Zeitachse,
> Playback, **harter Bruch Messung ↔ Vorhersage**), §3 (Layer-Katalog), §7 (Zellverfolgung) und §10
> (Datenqualität) sind in der Analyse vom 2026-08-05 als Ist/Soll gegenübergestellt und in einen
> Umsetzungsplan überführt: siehe [`2d-layer-erweiterung.md`](./2d-layer-erweiterung.md) und
> [`MAP.md`](./MAP.md) §7. Wo dieser Katalog eine 6- oder 12-Stunden-Radarextrapolation nahelegt,
> gilt D-14 — §16 „Anti-Features" führt genau das ohnehin selbst als Fehler.
>
> ▶ **Ergänzung 2026-08-05:** §2 (Zeitachse/Playback), §7 (Zellverfolgung) und die Punkte 1 und 4
> der Differenzierungs-Shortlist §15 sind jetzt **umsetzungsreif spezifiziert** in
> [`zuglinien-radar-spec.md`](./zuglinien-radar-spec.md) — Zeitmodell und Player in Teil II (Phase
> L5), Zugvektoren in §10 (Phase L6), Zellbahnen mit **amtlichem** Unsicherheitstrichter aus
> KONRAD3D in §11 (Phase L11).
> ⚠️ Korrektur zum Ist-Stand: §2 ist **nicht** unimplementiert. Der harte Mess-/Vorhersage-Bruch,
> Geschwindigkeitswahl, Frame-Schritt, „Jetzt"-Sprung, Loop und das Konfidenz-Abklingen existieren
> im Regenradar bereits (`src/radar/RadarTimeline.tsx:148-192`); Play/Pause, Loop und „Jetzt"
> zusätzlich in der 2D-Karte (`src/MapView.tsx:2985-2994, :3321-3340`). Was fehlt, ist die
> **Wiederverwendbarkeit** — die Abspiel-Engine liegt in einer React-Komponente statt in einem
> reinen Modul (V-145). L5 ist deshalb überwiegend Konsolidierung.

Legend: **[Core]** ship-blocking · **[Diff]** differentiator vs. WetterOnline/Windy/RainViewer · **[Expert]** behind a toggle · **[Trap]** looks good in screenshots, low real value.

---

## 1. Map & Rendering Foundation

| Feature | Notes |
|---|---|
| Intensity raster layer **[Core]** | DWD RADOLAN-RV / RW composite as base. Smooth bilinear sampling, not blocky nearest-neighbor. |
| Color scale that maps to **mm/h**, not dBZ **[Core]** | dBZ is meteorologically clean but unreadable for 95% of users. Keep dBZ as an Expert toggle only. |
| Perceptually-uniform palette **[Diff]** | Avoid rainbow. Banded (discrete steps) reads better for "is it raining HARD" than continuous gradient. Offer 1 colorblind-safe palette. |
| Opacity slider for the radar layer **[Core]** | Users need to see the basemap underneath to locate themselves. |
| Basemap toggle: terrain / streets / satellite **[Core]** | Terrain matters in DACH for reading valley vs. ridge precip. |
| Smooth zoom-dependent resampling **[Core]** | No hard pixelation when zoomed past native grid resolution (1 km RADOLAN). |
| Frame interpolation / morphing between radar timesteps **[Diff]** | Optical-flow tween between 5-min frames → buttery animation instead of strobe. This is what makes Windy *feel* premium. |
| GPU rendering of the raster **[Core]** | You already have WebGL2/WebGPU + MapLibre — render radar as a texture, not DOM tiles. Enables recoloring without re-fetch. |
| Hi-DPI / retina crispness **[Core]** | |

---

## 2. Time Dimension

| Feature | Notes |
|---|---|
| Timeline scrubber **[Core]** | ~2 h measured past + ~2 h nowcast. Drag to any frame. |
| Play / pause / loop **[Core]** | |
| Playback speed control **[Core]** | 0.5× / 1× / 2×, remembered per user. |
| **Hard visual break between "measured" and "forecast"** **[Core][Diff]** | The single most-underrated feature. Dashed track, color shift, or a "⟶ Vorhersage" marker on the timeline. The user must never confuse extrapolation with measurement. |
| Large, unambiguous timestamp **[Core]** | Absolute time + relative ("vor 10 min" / "in 25 min"). Localized, 24 h. |
| Frame-step buttons (±1 timestep) **[Core]** | For precise inspection. |
| "Jump to now" button **[Core]** | After scrubbing, snap back to live. |
| Auto-advance to newest frame on data refresh **[Core]** | When live and a new 5-min frame lands, follow it. |
| Confidence decay indicator on the nowcast portion **[Diff]** | The further into the future, the more the timeline visually "fades" or widens — honest signaling that minute-90 ≠ minute-5. |
| Loop-range selection **[Expert]** | Let power users loop just the last 30 min. |

---

## 3. Layer Catalogue (toggleable, mutually non-cluttering)

| Layer | Priority | Notes |
|---|---|---|
| Precipitation intensity (mm/h) | **[Core]** | The base layer. |
| **Precipitation type** (rain / snow / sleet / freezing rain / graupel) | **[Core]** | Non-optional in DACH. Color or hatch pattern per type. Derive from ICON-D2 + RADOLAN type product where available. |
| **Snow line / freezing-level altitude** | **[Core][Diff]** | The most-asked implicit Alpine question. Render as an isoline or shaded band. Pull from ICON-D2 0 °C isotherm. |
| Lightning strikes | **[Diff]** | Point markers with **age fade** (last 5/10/30 min). Cloud-to-ground vs. intra-cloud if your source supports it. |
| Cell motion vectors | **[Diff]** | Arrow + speed/direction per convective cell — answers "is this storm coming toward me?". |
| Storm cell tracking / outlines | **[Diff]** | Polygon hull around active cells, with ID + projected path cone. See §7. |
| Accumulation heatmap (1 h / 3 h / 6 h / 24 h totals) | **[Diff]** | Toggle between "instantaneous rate" and "how much has fallen". Different mental model, both valuable. |
| Wind layer (your existing particle layer) | **[Diff]** | You already have ICON-D2 RG16F. Let users overlay it to read storm steering. |
| Hail probability / size | **[Expert]** | If you can derive it (reflectivity + freezing level). B2B-relevant. |
| Echo tops / cloud height | **[Expert]** | Convective severity proxy. |
| Severe weather warning polygons (DWD/GeoSphere/MeteoSwiss official warnings) | **[Core]** | Overlay official warnings; never invent your own severity. |
| 0 °C isotherm line | **[Expert]** | Ties into snow-line layer. |
| Radar coverage / quality mask | **[Diff]** | See §10 — shade where radar is unreliable. |

Rule: never show more than ~3 layers stacked by default. Provide a clean layer panel with sane presets ("Standard", "Gewitter-Jagd", "Winter", "Wandern").

---

## 4. Location Intelligence (the part people actually open the app for)

| Feature | Notes |
|---|---|
| **Point precipitation timeline strip** **[Core][Diff]** | Horizontal bar over next 90–120 min showing intensity *at the user's exact GPS point*. This is THE jogging-decision feature. |
| Plain-language nowcast text **[Core][Diff]** | "Regen beginnt in 12 min", "Trocken für die nächsten 2 h", "Schauer endet in ~20 min, dann wieder Regen ab ~16:40". |
| Tap-anywhere point query **[Core]** | Tap any map location → get the same strip + text for that point, not just GPS. |
| Multiple saved locations **[Core]** | Home / work / a hiking trailhead. Quick-switch. |
| "Compare two points" **[Diff]** | Side-by-side strips — great for "stay or drive 20 km west to dry out". Ties into your event-planner DNA. |
| Route-aware radar **[Diff][Expert]** | Draw/import a route (run, drive, bike) → radar sampled *along the route over time*, i.e. "you'll hit rain at km 4 around 17:15". Premium differentiator, technically your wheelhouse. |
| Reverse-geocoded place name in the readout **[Core]** | "Regen in Dillenburg-Frohnhausen", not lat/lng. |
| Elevation context at the point **[Diff]** | Show altitude — matters for rain-vs-snow interpretation. |

---

## 5. Values, Legends & Units

| Item | Notes |
|---|---|
| Intensity bands in mm/h with named tiers **[Core]** | leicht <0.5 · mäßig 0.5–2 · stark 2–10 · Starkregen 10–50 · extrem >50 (tune to DWD definitions). |
| Live legend that reflects the active palette **[Core]** | Updates if user switches colorblind mode. |
| Hover/tap readout of exact mm/h under cursor **[Core]** | |
| Accumulated total readout (mm in selected window) **[Core]** | |
| dBZ display **[Expert]** | Toggle for meteorology nerds. |
| Imperial/metric switch **[Expert]** | DACH defaults metric; only needed if you go international. |
| Probability-of-precipitation where shown **[Core]** | Especially in the >90 min forecast horizon, switch from "amount" to "probability" framing. |

---

## 6. Interaction & Controls

| Feature | Notes |
|---|---|
| Pinch-zoom / pan, momentum **[Core]** | |
| Geolocate-me button **[Core]** | |
| Search bar (place / postal code / coordinates) **[Core]** | |
| Layer panel with presets **[Core]** | §3. |
| Fullscreen / immersive mode **[Diff]** | Hide chrome, just map + timeline. |
| Share: deep-link to exact view (location + time + layers) **[Diff]** | URL encodes state. Huge for "look at THIS storm" messaging. |
| Share: export current frame / animation as image/GIF/MP4 **[Diff]** | Social-shareable, free marketing. |
| Keyboard shortcuts (desktop) **[Expert]** | Space = play, ←/→ = step, L = layers. |
| Haptic tick on timeline scrub (mobile) **[Diff]** | Small touch, feels premium. |
| Remember last view on reopen **[Core]** | |

---

## 7. Storm / Cell Tracking

| Feature | Notes |
|---|---|
| Automatic cell detection & outlining **[Diff]** | Identify contiguous high-reflectivity blobs above a threshold. |
| Per-cell motion vector + speed **[Diff]** | |
| **Projected path cone** ("Trichter") **[Diff]** | Where the cell is likely to be in 15/30/60 min, with widening uncertainty. |
| ETA-to-my-location for an approaching cell **[Diff][Core-feel]** | "Gewitterzelle erreicht dich in ~22 min." This is a headline feature. |
| Cell intensity trend (intensifying / weakening) **[Expert]** | From reflectivity history. |
| Tap a cell → mini-profile (peak mm/h, lightning count, motion) **[Expert]** | |

---

## 8. Alerts & Notifications

| Feature | Notes |
|---|---|
| Push: "Regen in [Ort] in X Minuten" **[Diff]** | Threshold-based, per saved location. The retention engine. |
| Push: approaching thunderstorm / lightning within radius **[Diff]** | |
| Push: official severe-weather warning for saved location **[Core]** | Relay DWD/GeoSphere/MeteoSwiss, clearly attributed. |
| User-configurable thresholds **[Core]** | Intensity, lead time, quiet hours. |
| "Window of dryness" alert **[Diff]** | Inverse logic — "Nächste trockene Phase: 14:30–16:00." Unique, ties to event planner. |
| Snooze / per-location muting **[Core]** | |

---

## 9. Views / Screen Modes

| View | Notes |
|---|---|
| Full map view **[Core]** | Default. |
| Compact "should I go now?" card **[Diff]** | Strip + plain text + one-line verdict, no map needed. Glanceable. |
| List/forecast hybrid **[Core]** | Radar feeds into your hourly forecast seamlessly — same precip story, two representations. |
| Desktop split (map + detail panel) **[Diff]** | Map left, point detail / cell info right. |
| Widget / lock-screen glance **[Diff][Later]** | If/when you do a native shell. |
| Embed mode **[Expert]** | iframe-able radar for B2B clients (your DACH B2B angle). |

---

## 10. Data Quality & Transparency **[Diff — your moat]**

This is where seriousness beats the big players. Most consumer apps hide radar's lies.

| Feature | Notes |
|---|---|
| Beam-blockage / shadowing mask | Mountains block low radar beams. Shade affected regions ("eingeschränkte Radarsicht"). Critical in the Alps and Mittelgebirge. |
| Bright-band warning | Melting-layer over-estimation flag. |
| Ground clutter / non-meteo echo filtering | Already in RADOLAN-RV, but note residuals. |
| Radar range falloff | Quality degrades far from stations. |
| "Data source & age" badge | Which composite, last update timestamp, latency. |
| Honest nowcast disclaimer | Past ~60–90 min, radar extrapolation is noise. Blend with ICON-D2 and *say so*, or stop. Don't sell rauschen as Vorhersage. |
| Per-region "confidence in this area" note | Small, contextual, high trust-ROI. |

---

## 11. Expert / Pro Mode

| Feature | Notes |
|---|---|
| dBZ scale | |
| Raw vs. corrected product toggle | RW vs. RV vs. RY etc. |
| Multiple model overlays (ICON-D2 vs. ECMWF nowcast) | Ties to your existing model-comparison feature. |
| Vertical cross-section along a drawn line **[Expert][Diff]** | Reflectivity with height — connects to your 3D viz work. |
| Numeric grid inspector | Exact value matrix on hover. |
| Time-lapse export with annotations | |

---

## 12. Performance & Technical (stack-specific)

| Concern | Notes |
|---|---|
| Texture-based radar frames, prefetched | Fetch the full loop window once; recolor/animate on GPU. No per-frame network stall during playback. |
| RepaintScheduler integration | Reuse your existing scheduler — animate only when playing, idle otherwise. Avoid the continuous-repaint regression you hit on the cloud layer. |
| Frame budget on mobile | Cap interpolation/particle density by device tier (you already do zoom-adaptive density for wind). |
| Cache + delta updates | Only the newest 5-min frame changes; don't refetch the loop. |
| Graceful degradation | If WebGPU unavailable → WebGL2 path; if optical-flow tween too heavy → straight crossfade. |
| Netlify Function as tile/composite proxy | Cache DWD composites server-side to respect your "no API limits / open data" constraint and shield clients. |
| Offline last-frame | Show last cached radar with a stale badge when offline. |

---

## 13. Accessibility & i18n

- Colorblind-safe palette option (already in §1).
- Don't encode meaning in color alone — type via hatch/icon, intensity via numeric readout too.
- Screen-reader text for the plain-language nowcast ("the strip" must have a text equivalent).
- Reduced-motion mode: disable morphing/particles, keep stepped frames.
- DE primary; clean EN; AT/CH spelling and source attribution correct (GeoSphere for AT, MeteoSwiss for CH).

---

## 14. DACH-Specific Edge Cases (don't skip)

- Cross-border seam handling between DWD / GeoSphere / MeteoSwiss composites — avoid a visible "wall" at the border.
- Alpine snow-line is a first-class feature, not an afterthought.
- Föhn / valley effects: don't over-promise point precision in complex terrain.
- Winter precip-type transitions (rain→sleet→snow within 200 m elevation) — your type layer must handle this gracefully.
- Summer convective pop-up cells move fast; nowcast lead time matters most here.

---

## 15. Differentiation Shortlist (if you only nail five things)

1. **Honest measured-vs-forecast split** on the timeline.
2. **Point timeline strip + plain-language "Regen in X min"** at GPS and tap point.
3. **Snow-line / precip-type layer** done properly for the Alps.
4. **Storm-cell ETA-to-me** with projected cone.
5. **Data-quality transparency** (beam blockage, nowcast honesty) — the trust moat the big apps won't build.

---

## 16. Anti-Features (resist these) **[Trap]**

- 3D radar "towers" / volumetric precip you can fly through — screenshot candy, used once.
- Heavy particle rain effects *on the map itself* — kills mobile FPS, adds nothing.
- A vague "KI-Sturm-Score" with no defined methodology — erodes the trust you're building.
- Continuous rainbow palette for intensity — pretty, harder to read than bands.
- Auto-playing audio/thunder sounds.
- Nowcast confidently extended to 6 h on radar extrapolation alone.

---

*Tune intensity bands, nowcast horizons, and source priorities to your existing Lastenheft (2 h default) before locking the spec.*
