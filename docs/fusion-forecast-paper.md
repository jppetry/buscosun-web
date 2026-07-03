# A Minimum-Variance Fusion Framework for Open-Data Analysis, Nowcasting and Short-Range Forecasting of Surface Weather over the DACH Region

**Combining heterogeneous point observations, NWP and ML model grids, radar, and terrain covariates in a single statistically consistent estimation pipeline**

Jan [Surname] -- Independent Researcher, Germany -- [email]

*Draft, July 2026 -- methods paper; verification results pending (Sect. 5)*

---

## Abstract

We present a unified statistical framework for producing kilometre-scale gridded analyses, nowcasts and short-range forecasts of 2 m temperature, 10 m wind, precipitation and cloud cover over Germany, Austria and Switzerland (DACH), using exclusively open and freely redistributable data sources: national surface observation networks (DWD, GeoSphere Austria TAWES, MeteoSwiss SMN), operational NWP and post-processed products (ICON-D2, AROME, MOSMIX, INCA), machine-learned global models (ECMWF AIFS, DWD AICON), weather radar composites (RADOLAN), and a static digital elevation model with derived terrain covariates. The central claim is architectural rather than empirical: every stage of the proposed pipeline --- multi-model bias correction and combination, covariate-based downscaling, spatial analysis of station observations, temporal propagation of analysis increments, and radar--NWP blending in the nowcast range --- is an instance of a *single* estimation principle, the minimum-variance combination of information sources under an explicit error model. This replaces the heuristic weighting, ad-hoc interpolation, and hand-tuned blending that characterise typical multi-source weather aggregators with parameters that are either (i) derived from innovation statistics (Desroziers diagnostics), (ii) fitted by leave-one-station-out cross-validation against a proper scoring rule (CRPS), or (iii) documented physical priors with reliability-based shrinkage. We give the complete mathematical specification, analyse the computational complexity with a view to fully client-side execution, and define a rigorous verification protocol against operational baselines (MOSMIX, ICON-D2, INCA) and, where accessible, commercial reference products. The framework yields calibrated uncertainty fields as a by-product. We argue that, conditional on the verification protocol being passed, this architecture is the statistically optimal use of the open DACH data landscape as of 2026, in the precise sense of minimising expected point-forecast error among linear combination schemes with the same inputs.

**Keywords:** data fusion; optimal interpolation; nowcasting; model output statistics; complex terrain; open data; CRPS; DACH

# Introduction

## Problem setting

The DACH region (Germany, Austria, Switzerland; here the window $5.5$–$17.5^{\circ}$E, $45.5$–$55.5^{\circ}$N) offers one of the richest *open* meteorological data landscapes in the world: dense surface networks under permissive licences, several operational convection-permitting NWP models, a national radar composite with kilometre resolution, an operational analysis–nowcasting system (INCA), statistically post-processed point forecasts (MOSMIX), and — since 2025 — operational machine-learned global models with fully open output (ECMWF AIFS under CC-BY-4.0; DWD AICON). These sources are heterogeneous along every axis that matters: spatial support (points vs. grids), spatial density (15 km station spacing vs. 1 km radar pixels), temporal validity (observations at analysis time only; radar in the past; models into the future), resolution, error characteristics, and update cadence.

The question addressed in this paper is: *given exactly these sources and nothing else, what is the best possible gridded estimate of the surface weather state at horizontal scales of 1–2 km, for lead times from $-0$ h (analysis) through $+6$ h (nowcast) to $+72$ h (short range)?* “Best” is given a precise meaning in Sect. 3.9: minimum expected continuous ranked probability score (CRPS) under leave-one-station-out cross-validation, i.e. verified at locations withheld from the estimation.

## Why a unified treatment

Multi-source weather products typically treat their stages separately: an interpolation scheme for observations, a heuristic weight table for models, a hand-tuned crossover for radar extrapolation versus NWP. Each stage then carries free parameters justified only by visual plausibility. The premise of this work is that all of these stages are answers to the same question — *how should two or more noisy estimates of the same quantity be combined?* — and that the classical answer, weighting by inverse error covariance (Gandin, 1963; Daley, 1991), applies uniformly:

- across *sources* (multi-model combination, Sect. 3.2),

- across *space* (statistical interpolation of station increments, Sect. 3.4),

- across *scales* (terrain-covariate downscaling, Sect. 3.3),

- across *time* (increment persistence and radar–NWP blending, Sects. 3.5–3.6).

Once this is recognised, the design space collapses: the only remaining freedom lies in the specification of the error covariances, and these are estimable from the data themselves.

## Contributions

1.  A complete mathematical specification of an open-data fusion pipeline for the DACH region, in which every free parameter is either estimated from innovation statistics, fitted against a proper score, or declared as a shrinkage prior (Sects. 3.2–3.9).

2.  A terrain-aware background-error covariance with an anisotropic distance metric that separates valley and ridge air masses, generalising standard lapse-rate correction and remaining valid during inversions (Sect. 3.4).

3.  A scale-aware radar extrapolation and blending scheme in the spirit of S-PROG/STEPS (Seed, 2003; Bowler et al., 2006), reduced to a form executable in a browser GPU context (Sect. 3.6).

4.  A verification protocol that makes the informal claim “most accurate open-data system for DACH” falsifiable (Sect. 5).

5.  A complexity analysis demonstrating that the full pipeline is executable client-side at interactive latency, which distinguishes the system architecturally from server-side commercial products (Sect. 4).

## What this paper does not claim

No verification results are reported here; accordingly, no empirical superiority over any existing product is claimed. In particular, the framework performs statistical post-processing and extrapolation, not atmospheric dynamics: phenomena whose fine-scale structure is generated dynamically between observation times (föhn onset timing, convective initiation location) are recoverable only to the extent that they are resolved by the input model grids or the radar field. Section 6 makes these limits explicit.

# Data

Table 1 summarises the input sources. All are open, and all but one (Open-Meteo aggregation, optional) are redistributable and commercially usable under CC-BY-4.0 or equivalent national open-data terms.

| Source                  | Type | Resolution / density        | Horizon          | Cadence   | Role                                   |
|:------------------------|:-----|:----------------------------|:-----------------|:----------|:---------------------------------------|
| DWD surface network     | P    | $\sim$1500 stn (DE) | $t_0$ only       | 10–60 min | analysis, verification                 |
| GeoSphere TAWES         | P    | $\sim$280 stn (AT)  | $t_0$ only       | 10 min    | analysis, verification                 |
| MeteoSwiss SMN          | P    | $\sim$160 stn (CH)  | $t_0$ only       | 10 min    | analysis, verification                 |
| DWD MOSMIX              | P    | $\sim$5400 pts      | $+240$ h         | 1–6 h     | background member                      |
| DWD ICON-D2             | G    | 2.2 km                      | $+48$ h          | 3 h       | background member                      |
| GeoSphere AROME         | G    | 2.5 km                      | $+60$ h          | 3 h       | background member                      |
| GeoSphere INCA          | G    | 1 km                        | $+4$ h           | 15–60 min | nowcast reference                      |
| ECMWF AIFS (single/ENS) | G    | 0.25$^{\circ}$              | $+360$ h         | 6 h       | background member                      |
| DWD AICON               | G    | $\sim$13 km         | $+180$ h         | 6 h       | background member                      |
| DWD RADOLAN (RV/RY)     | R    | 1 km                        | $-2$ h $\to t_0$ | 5 min     | nowcast driver                         |
| MeteoSwiss CombiPrecip  | R    | 1 km                        | $t_0$            | 5 min     | nowcast driver (CH)                    |
| Mapzen Terrarium DEM    | G    | $\sim$100 m (z10)   | static           | —         | covariates, $\mathbf{H}$, $\mathbf{B}$ |

Input data sources. “Type”: P = point, G = grid, R = radar raster. “Role” refers to the pipeline stage of Sect. 3.



From the DEM we derive the static covariate vector $$\mathbf{Z}(\mathbf{x}) = \bigl(z,\; \mathrm{TPI}_{500},\; \mathrm{TPI}_{2000},\; \nabla z,\; \sin\alpha\sin\beta,\; \cos\alpha\sin\beta,\; d_{\mathrm{coast}},\; \mathrm{LU}\bigr), \qquad \text{(1)}$$ where $z$ is elevation, $\mathrm{TPI}_r$ the topographic position index at radius $r$ (negative in valleys — the cold-pool indicator), $\nabla z$ the slope magnitude, $(\alpha,\beta)$ aspect and slope angles combined with solar geometry at valid time to yield an insolation proxy, $d_{\mathrm{coast}}$ distance to the nearest coastline, and $\mathrm{LU}$ a coarse land-use class (urban/water/forest/open). These covariates are the carriers of legitimate sub-station-spacing structure (Sect. 3.3).

# Estimation framework

## State-space formulation

Let $v(\mathbf{x},\tau)$ denote the true value of one surface variable (2 m temperature, 10 m wind components, hourly precipitation, cloud fraction per layer) at location $\mathbf{x}$ in the analysis domain and lead time $\tau \ge 0$ relative to analysis time $t_0$. We seek the estimator $\hat v$ on a target grid of $n \approx 2\times10^4$–$10^6$ cells minimising $\mathbb{E}\,\mathrm{CRPS}(\hat v, v)$ at withheld station locations.

All stages below are instances of the generalised least-squares combination: given unbiased estimates $a_1, a_2$ of the same scalar with error covariance $\Sigma$, the minimum-variance unbiased linear combination is $\hat a = \mathbf{w}^{\top}\mathbf{a}$ with $$\mathbf{w} = \frac{\Sigma^{-1}\mathbf{1}}{\mathbf{1}^{\top}\Sigma^{-1}\mathbf{1}}, \qquad \text{(2)}$$ and its vector-field generalisation with partial observations is the analysis equation $$\mathbf{x}_a \;=\; \mathbf{x}_b \;+\; \mathbf{K}\,\bigl(\mathbf{y} - \mathcal{H}(\mathbf{x}_b)\bigr),
\qquad
\mathbf{K} \;=\; \mathbf{B}\mathbf{H}^{\top}\bigl(\mathbf{H}\mathbf{B}\mathbf{H}^{\top}+ \mathbf{R}\bigr)^{-1}, \qquad \text{(3)}$$ where $\mathbf{x}_b \in \mathbb{R}^n$ is the background (prior) field, $\mathbf{y} \in \mathbb{R}^p$ the vector of station observations, $\mathcal{H}$ (linearised $\mathbf{H}$) the observation operator, $\mathbf{B}$ the background-error covariance and $\mathbf{R}$ the observation-error covariance (Gandin, 1963; Daley, 1991). Equation (3) is the exact conditional mean under Gaussian errors and the best linear unbiased estimator otherwise. The design problem therefore reduces to specifying $\mathbf{x}_b$, $\mathbf{H}$, $\mathbf{B}$, $\mathbf{R}$ — Sects. 3.2–3.4 — and to extending the estimate along the lead-time axis — Sects. 3.5–3.6.

We note that successive-correction schemes of Barnes type (Barnes, 1964; Bratseth, 1986) converge to (3) under mild conditions; a pipeline already built on Barnes/IDW kernels is thus structurally an approximation of the present framework, differing in that its weights are imposed rather than derived.

## Multi-model background construction

Let $x_m(\mathbf{x},\tau)$, $m = 1,\dots,M$ denote the available model fields (Table 1), each bilinearly mapped to the target grid. The background is built in two steps.

#### (a) Per-model bias removal.

For each model, station and lead time, define the drift-corrected field $\tilde x_m = x_m - \hat b_m$, where the bias estimate pools a local (per-station) and a regional component with reliability shrinkage, $$\hat b_m(s,\tau) \;=\; \frac{n_s}{n_s + k}\, \bar e_m(s,\tau) \;+\; \frac{k}{n_s + k}\, \bar e_m(\mathcal{R}(s),\tau), \qquad \text{(4)}$$ with $\bar e_m$ the trailing mean forecast-minus-observation error over a rolling window (30–90 days), $n_s$ the local sample count, $\mathcal{R}(s)$ a terrain-class region, and $k$ a shrinkage constant fitted in Sect. 3.9. Equation (4) is the standard hierarchical (James–Stein-type) estimator; it prevents sparse stations from overfitting while letting well-sampled stations earn local corrections. Station-space biases are spread to the grid by thin-plate interpolation of $\hat b_m$ with the covariance of Sect. 3.4.

#### (b) Minimum-variance combination.

The combined background is $x_b = \sum_m w_m(\tau)\,\tilde x_m$ with $\mathbf{w}$ from (2), where $\Sigma(\tau)$ is the $M\times M$ error covariance of the bias-corrected models estimated against station observations over the verification archive, per variable, lead time and (optionally) terrain class. The off-diagonal terms matter: models sharing a data-assimilation ancestry (e.g. MOSMIX and ICON-D2, both ICON-family) have strongly correlated errors, and (2) automatically discounts such redundancy, whereas any additive weighting scheme double-counts it. With shrinkage $\Sigma \leftarrow (1-\lambda)\hat\Sigma + \lambda\,\mathrm{diag}(\hat\Sigma)$ the estimate remains stable for short archives. In the diagonal limit the weights reduce to the familiar inverse-MSE rule $w_m \propto 1/\mathrm{MSE}_m(\tau)$.

Machine-learned global models (AIFS, AICON) enter here symmetrically as additional members. Their documented strength at synoptic scales and weakness at fine scales and precipitation extremes (Lam et al., 2023; Lang et al., 2024) is not hard-coded: it manifests automatically as lead-time- and variable-dependent weights, large for $\tau \gtrsim 24$ h upper-level-driven variables, small where convection-permitting members dominate.

## Covariate downscaling: legitimate sub-grid structure

Interpolation of point data cannot reconstruct spatial scales below roughly twice the mean station spacing ($\sim$30 km in DE); any finer structure in the output must be imported from an information source that actually resolves it. We therefore decompose the target field as $$v(\mathbf{x}) \;=\; \underbrace{x_b(\mathbf{x})}_{\text{synoptic + mesoscale (models)}} \;+\; \underbrace{f\bigl(\mathbf{Z}(\mathbf{x}), t\bigr)}_{\text{terrain-explained}} \;+\; \underbrace{\varepsilon(\mathbf{x})}_{\text{residual, analysed}}, \qquad \text{(5)}$$ the regression-kriging decomposition (Hengl et al., 2007). The classical lapse-rate correction is the special case $f = -\gamma\,z$; we generalise $f$ to a low-complexity learner (regularised linear model or shallow gradient-boosted trees) on the covariates (1) interacting with time-of-day and season, trained on station residuals $y - \mathcal{H}(x_b)$. For temperature specifically, the vertical component of $f$ retains an hourly lapse-rate estimate with reliability shrinkage to the standard atmosphere, $$\hat\gamma \;=\; \alpha\,\hat\gamma_{\mathrm{OLS}} + (1-\alpha)\,\gamma_0,
\qquad
\alpha = \mathrm{clip}_{[0,1]}\!\Bigl(\tfrac{\Delta z_{\mathrm{spread}} - 300}{700}\Bigr)\cdot \mathrm{clip}_{[0,1]}\!\Bigl(\tfrac{R^2 - 0.3}{0.5}\Bigr), \qquad \text{(6)}$$ $\gamma_0 = 6.5\times10^{-3}$ K m$^{-1}$, $\hat\gamma$ clamped to $[-8, +12]\times10^{-3}$ K m$^{-1}$ so that genuine inversions ($\hat\gamma < 0$: clear winter nights, valley cold pools) survive while regression outliers do not. This is the mechanism by which the framework produces physically meaningful 1-km structure from a 100-m DEM without inventing information: variance is transferred from covariates that are *known* at full resolution.

## Analysis of station observations

The residual field $\varepsilon$ in (5) is estimated by local optimal interpolation of the innovations $d = y - \mathcal{H}(x_b + f)$.

#### Observation operator.

$\mathcal{H}$ is bilinear interpolation to the station location *plus vertical adjustment to station elevation*, $$\mathcal{H}(x)\big|_s \;=\; x(\mathbf{x}_s) \;+\; \hat\gamma\,\bigl(z_{\mathrm{grid}}(\mathbf{x}_s) - z_s\bigr). \qquad \text{(7)}$$ Omitting the second term contaminates every mountain innovation with representativeness error of several kelvin; including it moves the elevation physics into $\mathcal{H}$, where it belongs, and leaves the covariance model isotropic in the transformed space.

#### Background-error covariance.

$\mathbf{B}$ is modelled as $B_{ij} = \sigma_b^2\,\rho(d_{ij})$ with a second-order auto-regressive correlation $\rho(d) = (1 + d)\,e^{-d}$ and the terrain-aware anisotropic metric $$d_{ij}^2 \;=\; \frac{\|\mathbf{x}_i - \mathbf{x}_j\|^2}{L_h^2} \;+\; \frac{(z_i - z_j)^2}{L_v^2}, \qquad \text{(8)}$$ with horizontal length scale $L_h \approx 40$–$80$ km and vertical scale $L_v \approx 300$–$800$ m (fitted, Sect. 3.9). The vertical term encodes the statement *valleys do not covary with ridges*: a valley station then corrects the valley floor and not the adjacent crest — exactly the required behaviour during inversions, and unattainable by any two-dimensional distance weighting. During diagnosed inversion conditions ($\hat\gamma < 0$ in (6)) $L_v$ is halved, reflecting the stronger vertical decoupling of the boundary layer (Frei, 2014).

#### Observation-error covariance.

$\mathbf{R}$ is diagonal with per-network variances $\sigma_o^2$ comprising instrument and representativeness error. Rather than being asserted, these are estimated from innovation statistics by the Desroziers consistency diagnostics (Desroziers et al., 2005), $$\hat\sigma_o^2 \approx \mathbb{E}\bigl[(y - \mathcal{H}x_a)(y - \mathcal{H}x_b)\bigr],
\qquad
\widehat{\mathbf{H}\mathbf{B}\mathbf{H}^{\top}} \approx \mathbb{E}\bigl[(\mathcal{H}x_a - \mathcal{H}x_b)(y - \mathcal{H}x_b)\bigr], \qquad \text{(9)}$$ accumulated over a few weeks of operation per network and variable. The familiar heuristic “station weight 5, model weight 1.4” is thereby replaced by its estimable counterpart $w \propto 1/\sigma^2$, iterated to consistency.

#### Localisation and cost.

The analysis is computed independently per grid cell using the $k \le 32$ nearest observations in the metric (8) (local OI; Lorenc, 1981). Each cell requires one $k \times k$ Cholesky factorisation; for $n = 2\times10^4$ cells this is $\mathcal{O}(n k^3) \approx 7\times10^8$ flops, well within interactive client-side budgets, and the neighbour lists are precomputable once per session because station positions are static (Sect. 4).

## Temporal propagation of increments

Observations exist only at $t_0$, but model error is temporally correlated, so the analysis increment carries predictive information into the forecast range. We propagate it with exponential decay, $$\hat v(\mathbf{x},\tau) \;=\; x_b(\mathbf{x},\tau) + f(\mathbf{Z}(\mathbf{x}),t_0{+}\tau) \;+\; \bigl[x_a(\mathbf{x},t_0) - x_b(\mathbf{x},t_0)\bigr]\, e^{-\tau/T_v}, \qquad \text{(10)}$$ where $T_v$ is the error de-correlation time of variable $v$, estimated as the $e$-folding scale of the lagged autocorrelation of station innovations (typical values: 3–6 h for temperature, 1–2 h for wind, shorter for precipitation, where (10) is superseded by Sect. 3.6). The limiting cases recover pure analysis ($\tau = 0$) and pure model forecast ($\tau \gg T_v$); intermediate lead times gain the well-documented skill of persistence-of-error post-processing at almost zero cost.

## Precipitation nowcasting and blending

For lead times $0 < \tau \lesssim 6$ h, Lagrangian extrapolation of the radar field outperforms any NWP for precipitation (Germann and Zawadzki, 2002); beyond a crossover time it does not. Both regimes and the transition are handled by the same principle (2) applied along the lead-time axis.

#### (a) Motion estimation.

A motion field $\mathbf{u}(\mathbf{x})$ is estimated from consecutive composite frames $R(\cdot, t_0{-}\Delta t), R(\cdot, t_0)$ by the variational optical-flow problem $$\min_{\mathbf{u}} \int_\Omega \bigl|R(\mathbf{x},t_0) - R(\mathbf{x} - \mathbf{u}\Delta t,\, t_0{-}\Delta t)\bigr|^2 \, d\mathbf{x} \;+\; \lambda \int_\Omega \|\nabla \mathbf{u}\|^2\, d\mathbf{x}, \qquad \text{(11)}$$ solved coarse-to-fine (Horn and Schunck, 1981); a block cross-correlation on $16\times16$ tiles followed by smoothing is an adequate and GPU-trivial approximation. Advection is performed semi-Lagrangian and backward, $\hat R(\mathbf{x},\tau) = R(\mathbf{x} - \mathbf{u}\tau,\, t_0)$, which is unconditionally stable and mass-conserving on the pixel level.

#### (b) Scale-dependent decay.

Pure Lagrangian persistence overestimates the lifetime of small scales. Following the S-PROG/STEPS cascade principle (Seed, 2003; Bowler et al., 2006), the (log-transformed) field is decomposed into $K$ spectral bands $L_k$ and each band is damped by its own AR(1) factor, $$\hat R(\mathbf{x},\tau) \;=\; \exp\!\Bigl(\sum_{k=1}^{K} \phi_k(\tau)\, L_k(\mathbf{x} - \mathbf{u}\tau)\Bigr) - 1,
\qquad
\phi_k(\tau) = \rho_k^{\,\tau/\tau_k}, \qquad \text{(12)}$$ where $\rho_k, \tau_k$ are the lag-one autocorrelation and de-correlation time of band $k$, estimated online from the recent radar sequence. Small convective scales ($\tau_k \sim 20$ min) decay quickly toward the smooth advected field; frontal bands persist. A two-band version ($K = 2$: smooth + detail) preserves most of the skill at a fraction of the cost and is the recommended client-side configuration.

#### (c) Blending with NWP.

The nowcast and the multi-model background are combined per pixel and lead time with skill-derived weights, $$\hat v(\mathbf{x},\tau) \;=\; \alpha(\tau)\,\hat R(\mathbf{x},\tau) \;+\; \bigl(1 - \alpha(\tau)\bigr)\, x_b(\mathbf{x},\tau),
\qquad
\alpha(\tau) = \frac{\sigma_{\mathrm{now}}^{-2}(\tau)}{\sigma_{\mathrm{now}}^{-2}(\tau) + \sigma_{\mathrm{nwp}}^{-2}(\tau)}, \qquad \text{(13)}$$ the scalar case of (2). The error variances are verified curves, not assumptions; published and expected behaviour puts the crossover $\alpha = \tfrac12$ at 2–4 h, consistent with the INCA design (Haiden et al., 2011), but here $\alpha(\tau)$ is re-fitted continuously from the system’s own verification archive and may legitimately differ by season and regime. All precipitation statistics (variances, cascade parameters, blending) are computed in the transform $p \mapsto \log(1+p)$, whose approximately symmetric error distribution prevents heavy-rain outliers from dominating every second-moment estimate; the zero-rain mass is handled as a censored value.

#### (d) Analysis anchoring.

At $\tau = 0$ gauge observations correct the radar field multiplicatively (mean-field bias plus local OI of $\log$-ratios), the standard gauge-adjustment step; RADOLAN RW-type products already implement a variant of this server-side, in which case the step reduces to consistency checking.

## Variable-specific treatments

#### Wind.

Componentwise smoothing of $(u,v)$ under direction variability cancels vector amplitude: $\|\mathbb{E}[\mathbf{u}]\| \le \mathbb{E}\|\mathbf{u}\|$, with equality only for constant direction — an effect empirically reaching a factor $\sim$2 against station speeds. Speed is therefore analysed *separately as a scalar* $s = \|\mathbf{u}\|$ through the identical pipeline, and the analysed vector is rescaled per cell, $$\mathbf{u}^{\ast} = \mathbf{u}_a \cdot \min\!\Bigl(\frac{s_a}{\|\mathbf{u}_a\|},\, c_{\max}\Bigr),
\qquad c_{\max} = 4, \qquad \text{(14)}$$ the cap acknowledging that where cancellation is extreme the direction estimate itself is unreliable. Gusts are treated as a multiplicative factor on $s_a$ with its own regression on covariates (roughness, TPI).

#### Cloud cover.

Layered cloud fractions are bounded in $[0,1]$; analysis is performed in logit space with censoring at the bounds. Station contribution is limited (few networks report layered cloud), so the multi-model background dominates and the temporal median filter of Sect. [sec:temporal] carries most of the correction burden.

#### Temporal coherence.

A three-point running median along lead time is applied to temperature and cloud layers to suppress single-hour outliers characteristic of statistically post-processed products between assimilation cycles; the analysis hour and the final hour are left untouched, and the filter is applied only where all three values are finite so that coverage information is preserved. <span id="sec:temporal" label="sec:temporal"></span>

## Uncertainty quantification

The framework yields calibrated uncertainty without additional machinery: $$\sigma_a^2(\mathbf{x}) \;=\; \sigma_b^2\Bigl(1 - \mathbf{b}^{\top}(\mathbf{H}\mathbf{B}\mathbf{H}^{\top}+ \mathbf{R})^{-1}\mathbf{b}\Bigr),
\qquad
\sigma_{\mathrm{fc}}^2(\mathbf{x},\tau) \;=\; \sigma_a^2\,e^{-2\tau/T} + \sum_m w_m\,(\tilde x_m - x_b)^2, \qquad \text{(15)}$$ i.e. the OI analysis-error variance (small near stations, growing with distance in the metric (8)) relaxing toward the multi-model spread with lead time. Calibration of these variances is verified by rank histograms and the spread–skill relation (Sect. 5); an inflation factor per variable is admitted and fitted. The uncertainty field is a first-class product: it is what distinguishes an honest kilometre-scale product from a merely fine-looking one.

## Unified parameter estimation

Every free parameter introduced above — $L_h, L_v$, the inversion contraction, $k$ in (4), $\lambda$, $T_v$, $\rho_k, \tau_k$, $\alpha(\tau)$ curves, inflation factors — is determined by the single objective $$\hat\theta \;=\; \arg\min_\theta\; \mathbb{E}_{s \sim \text{LOSO}}\Bigl[\mathrm{CRPS}\bigl(F_\theta(\cdot \mid \mathbf{x}_s, \tau),\, y_s\bigr)\Bigr], \qquad \text{(16)}$$ leave-one-station-out cross-validation over the verification archive, scored by the continuous ranked probability score (Gneiting and Raftery, 2007), which for a Gaussian predictive law $\mathcal{N}(\mu,\sigma^2)$ has the closed form $$\mathrm{CRPS} = \sigma\Bigl[\tfrac{y-\mu}{\sigma}\bigl(2\Phi(\tfrac{y-\mu}{\sigma})-1\bigr) + 2\varphi(\tfrac{y-\mu}{\sigma}) - \tfrac{1}{\sqrt{\pi}}\Bigr]. \qquad \text{(17)}$$ CRPS is a strictly proper score reducing to MAE for deterministic forecasts; optimising it therefore cannot reward overconfidence, and the deterministic and probabilistic products are trained by one criterion. Parameters not identifiable from the archive remain at their physical prior values with the shrinkage structure (4)/(6) — the design rule being: *every constant in the system is either fitted under (16), estimated by (9), or a named physical prior with an explicit shrinkage path.*

# Implementation and complexity

A distinguishing architectural constraint is that the entire inference path (not the training path) executes client-side in a browser, which bounds acceptable complexity and memory. Table 2 summarises the per-refresh cost on a $160\times128$ interactive grid ($n \approx 2\times10^4$) with $p \approx 2000$ stations and $H = 24$–$72$ hourly frames; a $1$–$2$ km product grid ($n \sim 10^5$–$10^6$) is produced by the same code path at reduced frame count or as tiles.

<div id="tab:cost">

| Stage                                                                                                                                                                                                   | Complexity                        | Notes                                |
|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:----------------------------------|:-------------------------------------|
| Neighbour lists (metric (8))                                                                                    | $\mathcal{O}(n \log p)$ once      | static station positions             |
| Local OI per hour                                                                                                                                                                                       | $\mathcal{O}(n k^3)$, $k \le 32$  | Cholesky per cell; SIMD/GPU-parallel |
| Background combination                                                                                                                                                                                  | $\mathcal{O}(n M H)$              | $M \le 8$ members                    |
| Covariate model $f$                                                                                                                                                                                     | $\mathcal{O}(n)$ eval             | trained offline, shipped as weights  |
| Optical flow (11)                                                                                                      | $\mathcal{O}(n_R)$ per frame pair | tile correlation; WebGL pass         |
| Cascade + blend (12)–(13) | $\mathcal{O}(n_R K)$              | $K = 2$ client-side                  |
| Texture encoding                                                                                                                                                                                        | $\mathcal{O}(n H)$                | direct canvas write                  |

Computational cost per stage. Precomputed-once quantities are amortised across hours and across model-selector switches.



Training-path computations — rolling bias archives (4), model error covariance $\Sigma$, Desroziers accumulation (9), the covariate learner $f$, and the optimisation (16) — run offline on commodity hardware over the station archive and ship to the client as small parameter sets (kilobytes: per-station bias tables, covariance hyperparameters, $f$ as an ONNX graph of $<1$ MB). The client therefore performs *estimation*, never *learning*; reproducibility of the shipped parameters is ensured by versioning the training archive window.

Two engineering identities from the estimation structure are worth stating because they dominate practical latency: (i) sample *positions* are constant across hours, so kernels, neighbour lists and Cholesky factors are hour-invariant and reusable across the full forecast sequence; (ii) the analysis equation is linear in the innovations, so switching between source subsets (single-model transparency views) re-runs only the combination and analysis, not the fetch or factorisation path.

# Verification protocol

The claim “most accurate open-data nowcast/forecast system for the DACH region” is meaningful only as the outcome of a pre-registered protocol. We specify it here so that the claim is falsifiable.

#### Ground truth and splitting.

Hourly observations from the three national networks; *spatial* leave-one-station-out (no station appears in both estimation and scoring), plus a fully held-out random 10 % station set never used in any fitting, including (16). Temporal split: all hyperparameters frozen at the end of a training season; scoring on the subsequent season.

#### Baselines.

\(i\) Raw ICON-D2 bilinear; (ii) MOSMIX at its own stations; (iii) INCA (precipitation, AT domain, $\le 4$ h); (iv) persistence and Eulerian radar persistence; (v) the framework with $\mathbf{B},\mathbf{R}$ replaced by the heuristic IDW/weight-table configuration (ablation of exactly the statistical content); (vi) where licensing permits point retrieval, commercial reference products, scored strictly at common stations and lead times.

#### Scores.

CRPS (17) and MAE per variable and lead time $\tau \in \{0,1,3,6,12,24,48,72\}$ h; for precipitation additionally FSS at 1/5/10 km neighbourhoods and thresholds $\{0.1, 1, 5\}$ mm h$^{-1}$ (Roberts and Lean, 2008), ETS, and reliability diagrams for probability of precipitation; for wind, vector RMSE and speed bias separately (the decomposition that exposes cancellation artefacts, Sect. 3.7); rank histograms and spread–skill for (15). Stratification by terrain class (flat / hilly / alpine, via TPI), by season, and by weather regime (GWL classification), because aggregate scores hide exactly the regimes — inversions, föhn, convection — where methods differ most.

#### Significance.

Paired block-bootstrap over days (blocks absorb synoptic autocorrelation), reporting skill-score differences with 95 % intervals; Diebold–Mariano tests per stratum (Diebold and Mariano, 1995).

#### Publication of verification.

Scores are computed continuously in operation and published; the system’s own $\alpha(\tau)$, $\Sigma(\tau)$ and Desroziers estimates are exposed as diagnostics. A system whose weights are earned from its own public verification archive is auditable in a way that hand-tuned aggregation is not; we consider this transparency a scientific feature of the architecture, not merely a product feature.

# Discussion and limitations

#### Information-theoretic limits.

The framework transfers variance from resolved sources (model grids, radar, DEM covariates) and corrects systematic error; it does not integrate dynamics. Consequences: (i) fine-scale structure not explained by static covariates or resolved by input grids — convective initiation location, föhn breakthrough *timing*, gravity-wave detail — is not recoverable and appears, correctly, as inflated $\sigma_a$; (ii) nowcast skill for growth/decay of convection is bounded by the cascade climatology in (12), which models decay statistics but not initiation; (iii) beyond $\tau \sim T_v$ the system’s point skill converges to that of its best model combination — the added value concentrates at $\tau \lesssim 12$ h and in complex terrain, which should be stated rather than obscured.

#### Gaussianity and transforms.

Equation (3) is optimal in the linear–Gaussian setting; precipitation and cloud bounds violate it, mitigated but not removed by the log/logit transforms. A censored-Gaussian (Tobit) treatment of the zero-rain mass is the natural next refinement.

#### Archive dependence.

Bias tables, $\Sigma(\tau)$ and $\alpha(\tau)$ require months of archived innovations before they outperform sensible priors; the shrinkage estimators (4) guarantee graceful degradation to prior behaviour, not failure, under short archives. Model upgrades by providers (e.g. NWP cycle changes) reset error climatologies; change-point detection on innovation statistics with archive-window truncation is required operationally.

#### Relation to full data assimilation and ML forecasting.

The scheme is deliberately the stationary, local limit of variational assimilation — no flow-dependent covariances, no cycling of a dynamical model. The open availability of operational ML forecasts (AIFS, AICON) changes the economics of this choice: the expensive dynamical prior is now a free input, and the residual task — local correction, downscaling, uncertainty — is precisely what the present framework formalises. We regard hybrid pipelines of this shape (open global ML prior $+$ local statistical analysis $+$ radar extrapolation) as the rational architecture for small teams operating on open data.

# Conclusion

We have specified, end to end, a fusion architecture in which multi-model combination, terrain downscaling, station analysis, temporal increment propagation and radar blending are the same minimum-variance estimator applied along different axes, with all parameters estimable from the system’s own innovation archive under a single proper-score objective. The framework’s claim to optimality is conditional and precise: among linear combination schemes over the stated open DACH sources, no configuration achieves lower expected CRPS at withheld stations, because the configuration is by construction the minimiser of that criterion. Whether this translates into superiority over specific operational and commercial products is an empirical question that the verification protocol of Sect. 5 is designed to answer — and the authors’ position is that it should be answered in public.

## References

- Barnes, S. L., 1964: A technique for maximizing details in numerical weather map analysis. *J. Appl. Meteor.*, **3**, 396–409.
- Bowler, N. E., C. E. Pierce, and A. W. Seed, 2006: STEPS: A probabilistic precipitation forecasting scheme which merges an extrapolation nowcast with downscaled NWP. *Quart. J. Roy. Meteor. Soc.*, **132**, 2127–2155.
- Bratseth, A. M., 1986: Statistical interpolation by means of successive corrections. *Tellus A*, **38**, 439–447.
- Daley, R., 1991: *Atmospheric Data Analysis*. Cambridge University Press, 457 pp.
- Desroziers, G., L. Berre, B. Chapnik, and P. Poli, 2005: Diagnosis of observation, background and analysis-error statistics in observation space. *Quart. J. Roy. Meteor. Soc.*, **131**, 3385–3396.
- Diebold, F. X., and R. S. Mariano, 1995: Comparing predictive accuracy. *J. Bus. Econ. Stat.*, **13**, 253–263.
- Frei, C., 2014: Interpolation of temperature in a mountainous region using nonlinear profiles and non-Euclidean distances. *Int. J. Climatol.*, **34**, 1585–1605.
- Gandin, L. S., 1963: *Objective Analysis of Meteorological Fields*. Gidrometeorologicheskoe Izdatelstvo, Leningrad (Israel Program for Scientific Translations, 1965).
- Germann, U., and I. Zawadzki, 2002: Scale-dependence of the predictability of precipitation from continental radar images. Part I: Description of the methodology. *Mon. Wea. Rev.*, **130**, 2859–2873.
- Gneiting, T., and A. E. Raftery, 2007: Strictly proper scoring rules, prediction, and estimation. *J. Amer. Stat. Assoc.*, **102**, 359–378.
- Haiden, T., A. Kann, C. Wittmann, G. Pistotnik, B. Bica, and C. Gruber, 2011: The Integrated Nowcasting through Comprehensive Analysis (INCA) system and its validation over the Eastern Alpine region. *Wea. Forecasting*, **26**, 166–183.
- Hengl, T., G. B. M. Heuvelink, and D. G. Rossiter, 2007: About regression-kriging: From equations to case studies. *Comput. Geosci.*, **33**, 1301–1315.
- Horn, B. K. P., and B. G. Schunck, 1981: Determining optical flow. *Artif. Intell.*, **17**, 185–203.
- Lam, R., and Coauthors, 2023: Learning skillful medium-range global weather forecasting. *Science*, **382**, 1416–1421.
- Lang, S., and Coauthors, 2024: AIFS — ECMWF’s data-driven forecasting system. arXiv:2406.01465.
- Lorenc, A. C., 1981: A global three-dimensional multivariate statistical interpolation scheme. *Mon. Wea. Rev.*, **109**, 701–721.
- Roberts, N. M., and H. W. Lean, 2008: Scale-selective verification of rainfall accumulations from high-resolution forecasts of convective events. *Mon. Wea. Rev.*, **136**, 78–97.
- Seed, A. W., 2003: A dynamic and spatial scaling approach to advection forecasting. *J. Appl. Meteor.*, **42**, 381–388.
