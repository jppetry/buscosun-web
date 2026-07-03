/**
 * Modellquellen-Zustand für die 2D-Karte (Phase 2 der Fusion→Layer-Integration).
 *
 * Reiner, DOM-/React-freier Zustand + Resolver: pro Kartenlayer entscheidet er, ob
 * die **gridded Fusion** (`src/fusion/`) oder die **native** Modellquelle (ICON-D2
 * etc.) rendert. Der native Pfad ist das eingefrorene Referenzverhalten und der
 * garantierte Fallback — der Resolver kann ihn nie „verlieren".
 *
 * Design (siehe `docs/fusion-2d-integration.md`):
 *  - Nur die Layer mit einem finalisierten, kontrakt-kompatiblen Fusion-Raster
 *    sind umschaltbar (`FUSION_CAPABLE_LAYERS`). Alle anderen sind „native-by-design"
 *    und der Resolver liefert für sie IMMER `'native'` — nie versehentlich anders.
 *  - Globaler Default + optionaler Per-Layer-Override; **Per-Layer gewinnt**.
 *  - Der Nutzer-Switch wirkt unabhängig vom Feature-Flag; das Flag setzt nur den
 *    Startwert des globalen Defaults (`defaultModelSource`).
 *
 * Headless verifizierbar über `verifyModelSource()` (Repo-Konvention, kein Runner).
 */

export type ModelSource = 'fusion' | 'native';

/**
 * Kartenlayer (LayerKey-Teilmenge) mit einem byte-/adapter-kompatiblen
 * gridded-Fusion-Raster-Produkt. Bewusst als lokale String-Literale gehalten
 * (kein Import von `MapView`), damit dieses Modul pur und importzyklusfrei bleibt.
 *
 *  - `wind`   → `DwdForecastResult.hours[].layers.wind`        (byte-identisch)
 *  - `temp`   → `…layers.temperature`                          (byte-identisch)
 *  - `clouds` → `…layers.clouds`                               (Transport-Adapter)
 *  - `nowcast`→ `…layers.precipitation` (Raster-Forecast-Precip; Radar-Nowcast bleibt nativ)
 */
export const FUSION_CAPABLE_LAYERS = ['wind', 'temp', 'clouds', 'nowcast'] as const;
export type FusionCapableLayer = (typeof FUSION_CAPABLE_LAYERS)[number];

const CAPABLE_SET: ReadonlySet<string> = new Set(FUSION_CAPABLE_LAYERS);

/** Hat der Layer überhaupt eine Fusion-Quelle (sonst „native-by-design")? */
export function isFusionCapable(layer: string): layer is FusionCapableLayer {
  return CAPABLE_SET.has(layer);
}

/**
 * Umschaltzustand. `global` ist der Default für alle fusion-fähigen Raster-Layer;
 * `overrides` hebt ihn pro Layer auf (Per-Layer gewinnt). Nicht-fähige Layer
 * tauchen hier nie auf.
 *
 * `point` ist die Quelle der **zweiten Engine** — des Punkt-Panels
 * (`getPointForecast`). Es steht bewusst NEBEN `global`, weil seine
 * eingefrorene Referenz **invertiert** ist: das heutige Punkt-Verhalten ist der
 * Multi-Quellen-**Blend** (`'fusion'`), während das Raster heute **nativ**
 * (ICON-D2) rendert. Ein einziger globaler Wert könnte nicht beide Domänen
 * gleichzeitig auf ihrem eingefrorenen Ist-Verhalten halten — daher ein
 * eigenes Feld mit eigenem Default (`defaultPointSource` → `'fusion'`).
 */
export interface ModelSourceState {
  global: ModelSource;
  overrides: Partial<Record<FusionCapableLayer, ModelSource>>;
  point: ModelSource;
}

/**
 * Feature-Flag-getriebener Start-Default (nur der GLOBALE Startwert; der Switch
 * wirkt danach unabhängig vom Flag). Konvention wie `fusionV2`:
 * `?fusion2d=fusion|native` bzw. `window.__fusion2d`, sonst `'native'`
 * (= heutiges, eingefrorenes Verhalten → Production-Default-Flip bleibt Hard Stop).
 */
export function defaultModelSource(): ModelSource {
  try {
    if (typeof window !== 'undefined') {
      // 1) Dev-/Preview-Override (flüchtig, höchste Präzedenz): window.__fusion2d bzw. ?fusion2d=.
      const w = window as unknown as { __fusion2d?: unknown };
      if (w.__fusion2d === 'fusion' || w.__fusion2d === 'native') return w.__fusion2d;
      const q = new URLSearchParams(window.location.search).get('fusion2d')
        ?? (window.location.hash.includes('fusion2d=')
          ? new URLSearchParams(window.location.hash.replace(/^[^?]*\??/, '')).get('fusion2d')
          : null);
      if (q === 'fusion' || q === 'native') return q;
      // 2) Deploybarer Config-Default: localStorage['fusion2d.default']. Erlaubt den
      //    Production-Default-Flip OHNE Code-Änderung — der Flip selbst bleibt Hard Stop
      //    (dieser Schlüssel wird von uns nirgends auf 'fusion' gesetzt).
      const cfg = window.localStorage?.getItem('fusion2d.default');
      if (cfg === 'fusion' || cfg === 'native') return cfg;
    }
  } catch { /* SSR / gesperrter Storage → Default unten */ }
  // 3) Eingefrorener Default: native (= heutiges Raster-Verhalten ICON-D2).
  return 'native';
}

/**
 * Eingefrorener Start-Default der **Punkt-Engine**: immer `'fusion'` (der
 * heutige Blend). Bewusst flag-**unabhängig** und invertiert zum Raster —
 * der Umstieg des Punkt-Panels auf Einzelmodell-Isolation ist eine echte
 * Verhaltensänderung und bleibt bis zum Production-Default-Flip Hard-Stop-
 * pflichtig. Der Nutzer-Switch (Phase 4) kann ihn danach flippen.
 */
export function defaultPointSource(): ModelSource {
  return 'fusion';
}

/** Frischer Zustand mit dem Flag-Default und ohne Overrides. */
export function initialModelSourceState(): ModelSourceState {
  return { global: defaultModelSource(), overrides: {}, point: defaultPointSource() };
}

/**
 * DER Resolver: welche Quelle rendert Layer `layer`?
 *  - Nicht fusion-fähig → IMMER `'native'` (native-by-design, nie versehentlich Fusion).
 *  - Per-Layer-Override vorhanden → dieser gewinnt.
 *  - Sonst globaler Default.
 */
export function resolveModelSource(layer: string, state: ModelSourceState): ModelSource {
  if (!isFusionCapable(layer)) return 'native';
  return state.overrides[layer] ?? state.global;
}

/** Bequemer Boolean für die Render-Effekte. */
export function isFusionActive(layer: string, state: ModelSourceState): boolean {
  return resolveModelSource(layer, state) === 'fusion';
}

/**
 * Quelle der **Punkt-Engine** (`getPointForecast`). Eigene Domäne, unabhängig
 * vom Raster-`global` (invertierter eingefrorener Default, s. `ModelSourceState`).
 * `'fusion'` = bestehender Multi-Quellen-Blend, `'native'` = Einzelmodell-Isolation.
 */
export function resolvePointSource(state: ModelSourceState): ModelSource {
  return state.point;
}

// --- Reine Reducer (neuer Zustand, kein Mutieren) -------------------------------

/** Globalen Raster-Default setzen (Overrides + Punkt-Quelle bleiben unberührt). */
export function setGlobalSource(state: ModelSourceState, src: ModelSource): ModelSourceState {
  return { global: src, overrides: { ...state.overrides }, point: state.point };
}

/** Per-Layer-Override setzen (nur für fusion-fähige Layer; sonst unverändert). */
export function setLayerOverride(
  state: ModelSourceState,
  layer: string,
  src: ModelSource,
): ModelSourceState {
  if (!isFusionCapable(layer)) return state;
  return { global: state.global, overrides: { ...state.overrides, [layer]: src }, point: state.point };
}

/** Per-Layer-Override entfernen → Layer folgt wieder dem globalen Default. */
export function clearLayerOverride(state: ModelSourceState, layer: string): ModelSourceState {
  if (!(layer in state.overrides)) return state;
  const next = { ...state.overrides };
  delete next[layer as FusionCapableLayer];
  return { global: state.global, overrides: next, point: state.point };
}

/** Override pro Layer togglen (Fusion↔Native), relativ zum aktuell resolvten Wert. */
export function toggleLayerOverride(state: ModelSourceState, layer: string): ModelSourceState {
  if (!isFusionCapable(layer)) return state;
  const current = resolveModelSource(layer, state);
  return setLayerOverride(state, layer, current === 'fusion' ? 'native' : 'fusion');
}

/** Quelle der Punkt-Engine setzen (unabhängig von `global`/Overrides). */
export function setPointSource(state: ModelSourceState, src: ModelSource): ModelSourceState {
  return { global: state.global, overrides: { ...state.overrides }, point: src };
}

// --- Headless-Selbsttest (Repo-Konvention: kein Test-Runner) ---------------------

/**
 * Reiner Selbsttest des Resolvers/der Reducer. Gibt `{checks, passed, failed}` zurück;
 * die Node-Harness (`scripts/verify-*.mjs`) und der Dev-Global `window.__verifyModelSource`
 * schließen auf `failed === 0`. Deckt Tests (c) nativer Pfad festgenagelt und
 * (e) Per-Layer schlägt Global ab (siehe Deliverables).
 */
export function verifyModelSource(): { checks: string[]; passed: number; failed: number } {
  const checks: string[] = [];
  let passed = 0, failed = 0;
  const ok = (cond: boolean, label: string) => {
    checks.push(`${cond ? 'PASS' : 'FAIL'} — ${label}`);
    if (cond) passed++; else failed++;
  };

  const base: ModelSourceState = { global: 'fusion', overrides: {}, point: 'fusion' };

  // (c) Native-by-design ist unverlierbar: nicht-fähige Layer bleiben IMMER native,
  //     selbst bei global='fusion' und selbst wenn ein Override versucht wird.
  for (const l of ['gust', 'sat', 'lightning', 'stations', 'confidence', 'snowline', 'flownowcast', 'poprob']) {
    ok(resolveModelSource(l, base) === 'native', `nicht-fähiger Layer "${l}" bleibt native bei global=fusion`);
    ok(resolveModelSource(l, setLayerOverride(base, l, 'fusion')) === 'native', `Override auf "${l}" wird ignoriert (native-by-design)`);
  }

  // Fusion-fähige Layer folgen dem globalen Default.
  for (const l of FUSION_CAPABLE_LAYERS) {
    ok(resolveModelSource(l, base) === 'fusion', `fähiger Layer "${l}" folgt global=fusion`);
    ok(resolveModelSource(l, { global: 'native', overrides: {}, point: 'fusion' }) === 'native', `fähiger Layer "${l}" folgt global=native`);
  }

  // (e) Per-Layer schlägt Global — in beide Richtungen.
  ok(resolveModelSource('wind', { global: 'native', overrides: { wind: 'fusion' }, point: 'fusion' }) === 'fusion', 'Override fusion schlägt global=native');
  ok(resolveModelSource('temp', { global: 'fusion', overrides: { temp: 'native' }, point: 'fusion' }) === 'native', 'Override native schlägt global=fusion');

  // Reducer-Semantik: setGlobal lässt Overrides bestehen; clear/toggle wie erwartet.
  const withOverride = setLayerOverride(base, 'clouds', 'native');
  ok(withOverride.overrides.clouds === 'native', 'setLayerOverride setzt Override');
  ok(setGlobalSource(withOverride, 'native').overrides.clouds === 'native', 'setGlobalSource bewahrt Overrides');
  ok(!('clouds' in clearLayerOverride(withOverride, 'clouds').overrides), 'clearLayerOverride entfernt Override');
  ok(resolveModelSource('nowcast', toggleLayerOverride(base, 'nowcast')) === 'native', 'toggle fusion→native');
  ok(resolveModelSource('nowcast', toggleLayerOverride({ global: 'native', overrides: {}, point: 'fusion' }, 'nowcast')) === 'fusion', 'toggle native→fusion');

  // Punkt-Engine (zweite Engine): eigener Default 'fusion', unabhängig von global,
  // per setPointSource flippbar; Layer-Reducer lassen `point` unangetastet.
  ok(resolvePointSource(initialModelSourceState()) === 'fusion', 'Punkt-Default ist fusion (eingefrorener Blend)');
  ok(resolvePointSource({ global: 'native', overrides: {}, point: 'fusion' }) === 'fusion', 'Punkt-Quelle folgt NICHT global (invertierter Default)');
  ok(resolvePointSource(setPointSource(base, 'native')) === 'native', 'setPointSource flippt die Punkt-Quelle');
  ok(setLayerOverride(base, 'wind', 'native').point === 'fusion', 'Layer-Override lässt point unangetastet');
  ok(setGlobalSource(setPointSource(base, 'native'), 'fusion').point === 'native', 'setGlobalSource bewahrt point');

  // Immutabilität: Reducer mutieren den Eingangszustand nicht.
  const snapshot: ModelSourceState = { global: 'fusion', overrides: { wind: 'native' }, point: 'fusion' };
  const before = JSON.stringify(snapshot);
  setGlobalSource(snapshot, 'native'); setLayerOverride(snapshot, 'temp', 'native');
  clearLayerOverride(snapshot, 'wind'); setPointSource(snapshot, 'native');
  ok(JSON.stringify(snapshot) === before, 'Reducer mutieren den Eingangszustand nicht');

  return { checks, passed, failed };
}
