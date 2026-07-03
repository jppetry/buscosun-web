/**
 * Modellquellen-Zustand für die 2D-Karte.
 *
 * Reiner, DOM-/React-freier Zustand + Resolver: pro Kartenlayer entscheidet er,
 * **welches Modell** rendert. Ursprünglich eine binäre Achse (`'fusion'` ⇄
 * `'native'`); jetzt zu einer **Modell-ID-Achse** erweitert, in der `'native'`
 * und `'fusion'` **Spezialwerte** neben konkreten Katalog-Modellen sind
 * (ICON-D2, AROME-AT, INCA …). Es bleibt **eine** State-Maschine — `global` ist
 * nur der Fallback-Default, wenn ein Land keine explizite Wahl hat.
 *
 * Der native Pfad ist das eingefrorene Referenzverhalten und der garantierte
 * Fallback — der Resolver kann ihn nie „verlieren".
 *
 * Design: `docs/fusion-2d-integration.md` (binärer Ursprung) + `docs/model-
 * switcher-gate0.md` (Per-Land-Erweiterung). Katalog: `./modelCatalog.ts`.
 *
 * Headless verifizierbar über `verifyModelSource()` (Repo-Konvention, kein Runner).
 */

import type { Country } from '../types';
import { canRasterIn, isWhitelisted, modelEntry, type ModelId } from './modelCatalog';

/** Binäre Ur-Achse; bleibt als Punkt-Domänen-Typ + Teilmenge von `ModelId`. */
export type ModelSource = 'fusion' | 'native';

/**
 * Kartenlayer (LayerKey-Teilmenge) mit einem umschaltbaren Raster-Produkt.
 * Bewusst als lokale String-Literale gehalten (kein Import von `MapView`), damit
 * dieses Modul pur und importzyklusfrei bleibt. Konkrete Modelle (ICON-D2/AROME/
 * INCA) speisen exakt dieselben Layer wie die Fusion — daher dieselbe Menge.
 *
 *  - `wind`   → `…layers.wind`          - `temp`   → `…layers.temperature`
 *  - `clouds` → `…layers.clouds`        - `nowcast`→ `…layers.precipitation`
 */
export const FUSION_CAPABLE_LAYERS = ['wind', 'temp', 'clouds', 'nowcast'] as const;
export type FusionCapableLayer = (typeof FUSION_CAPABLE_LAYERS)[number];

const CAPABLE_SET: ReadonlySet<string> = new Set(FUSION_CAPABLE_LAYERS);

/**
 * Master-Schalter für den **stillen Default-**Fusion-Raster-Pfad (Bestand).
 *
 * `false`: ohne explizite Nutzerwahl rendert die Karte ausschließlich **nativ**,
 * und `isFusionActive` bleibt aus. Grund (verifiziert 2026-07): das gridded
 * Fusion-Temperaturfeld unter-auflöst die alpine Höhenkorrektur (effektives
 * Lapse ~0,27 statt ~0,65 °C/100 m). Der komplette Switch-Mechanismus bleibt
 * intakt; ein Flip auf `true` reaktiviert den stillen Fusion-Default.
 *
 * Der **neue Per-Land-Switcher** (Phase 3, `resolveModel`/`activeModelId`) ist
 * von diesem Flag **unabhängig**: dort ist die Wahl explizit + mit Qualitäts-
 * Badge, daher rendert eine ausdrücklich gewählte Quelle unabhängig vom Flag.
 */
export const FUSION_RASTER_ENABLED: boolean = false;

/** Hat der Layer überhaupt eine umschaltbare Raster-Quelle (sonst „native-by-design")? */
export function isFusionCapable(layer: string): layer is FusionCapableLayer {
  return CAPABLE_SET.has(layer);
}

/**
 * Umschaltzustand — **eine** State-Maschine, eine Modell-ID-Achse.
 *
 *  - `country`    — aktives Land, aus dem der Per-Land-Default gezogen wird
 *                   (Viewport/Suche; s. MapView). Default `'DE'`.
 *  - `perCountry` — explizite Modellwahl je Land; fehlt ein Land, gilt `global`.
 *  - `global`     — Fallback-Default für Länder ohne eigene Wahl (Bestand;
 *                   Startwert `'native'`).
 *  - `overrides`  — Per-Layer-Override (schlägt Land + global). Nur fähige Layer.
 *  - `radar`      — **orthogonaler** Radar-Toggle (RADOLAN/INCA/rzc). Unabhängig
 *                   von der Modellwahl. Default `true` (= heutiges Verhalten).
 *  - `point`      — Quelle der zweiten Engine (Punkt-Panel). Eigener eingefrorener
 *                   Default `'fusion'` (Blend), invertiert zum Raster-`native`.
 */
export interface ModelSourceState {
  country: Country;
  perCountry: Partial<Record<Country, ModelId>>;
  global: ModelId;
  overrides: Partial<Record<FusionCapableLayer, ModelId>>;
  radar: boolean;
  point: ModelSource;
}

/**
 * Feature-Flag-getriebener Start-Default des GLOBALEN Raster-Werts. Konvention
 * wie `fusionV2`: `?fusion2d=fusion|native` bzw. `window.__fusion2d`, sonst
 * `localStorage['fusion2d.default']`, sonst `'native'` (eingefroren).
 */
export function defaultModelSource(): ModelSource {
  try {
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __fusion2d?: unknown };
      if (w.__fusion2d === 'fusion' || w.__fusion2d === 'native') return w.__fusion2d;
      const q = new URLSearchParams(window.location.search).get('fusion2d')
        ?? (window.location.hash.includes('fusion2d=')
          ? new URLSearchParams(window.location.hash.replace(/^[^?]*\??/, '')).get('fusion2d')
          : null);
      if (q === 'fusion' || q === 'native') return q;
      const cfg = window.localStorage?.getItem('fusion2d.default');
      if (cfg === 'fusion' || cfg === 'native') return cfg;
    }
  } catch { /* SSR / gesperrter Storage → Default unten */ }
  return 'native';
}

/** Eingefrorener Start-Default der Punkt-Engine: immer `'fusion'` (der Blend). */
export function defaultPointSource(): ModelSource {
  return 'fusion';
}

/** Frischer Zustand: Flag-Default global, kein Override, Radar an, Land DE. */
export function initialModelSourceState(): ModelSourceState {
  return {
    country: 'DE',
    perCountry: {},
    global: defaultModelSource(),
    overrides: {},
    radar: true,
    point: defaultPointSource(),
  };
}

// --- Resolver -------------------------------------------------------------------

/**
 * Die für ein Land gewählte Modell-ID (ohne Layer-/Abdeckungs-Auflösung):
 * Per-Land-Wahl, sonst globaler Default.
 */
export function activeModelId(state: ModelSourceState, country: Country = state.country): ModelId {
  return state.perCountry[country] ?? state.global;
}

/**
 * DER binäre Resolver (Bestand, unverändert im Verhalten): welche **Quelle**
 * rendert Layer `layer`?  Nicht-fähig → immer `'native'`; sonst Override,
 * sonst Per-Land-Wahl, sonst global. Rückgabetyp jetzt `ModelId` (umfasst
 * `'fusion'|'native'`), damit bestehende `=== 'fusion'`-Vergleiche weiter gelten.
 */
export function resolveModelSource(layer: string, state: ModelSourceState): ModelId {
  if (!isFusionCapable(layer)) return 'native';
  return state.overrides[layer] ?? state.perCountry[state.country] ?? state.global;
}

/**
 * DER erweiterte Resolver mit **Fähigkeits-/Abdeckungs-Fallback**: welche
 * Modell-ID rendert Layer `layer` tatsächlich?
 *  - Nicht-fähiger Layer → `'native'` (native-by-design, unverlierbar).
 *  - Gewählt `'native'`/`'fusion'` → unverändert (Spezialwerte).
 *  - Gewählt konkretes Modell, das im aktiven Land **kein Raster** liefert
 *    (Punkt-only wie MOSMIX, außerhalb der Abdeckung, oder nicht ingestiert)
 *    → `'native'` (stiller Fallback, Deliverable e/f). Nie leerer Layer.
 */
export function resolveModel(layer: string, state: ModelSourceState): ModelId {
  const chosen = resolveModelSource(layer, state);
  if (chosen === 'native' || chosen === 'fusion') return chosen;
  return canRasterIn(chosen, state.country) ? chosen : 'native';
}

/**
 * Wie `resolveModel`, aber meldet, ob ein Fallback griff (für den UI-Indikator
 * „⚠ … nicht verfügbar · nativ"). `fellBack` ist true, wenn die gewählte
 * konkrete Quelle im Land nicht rasterfähig war.
 */
export function resolveModelWithFallback(
  layer: string,
  state: ModelSourceState,
): { id: ModelId; requested: ModelId; fellBack: boolean } {
  const requested = resolveModelSource(layer, state);
  const id = resolveModel(layer, state);
  return { id, requested, fellBack: id !== requested };
}

/**
 * Bequemer Boolean für die Render-Effekte des **stillen Default-Pfads**
 * (Bestand). Respektiert `FUSION_RASTER_ENABLED`. Der explizite Per-Land-
 * Switcher nutzt stattdessen `resolveModel`/`activeModelId`.
 */
export function isFusionActive(layer: string, state: ModelSourceState): boolean {
  return FUSION_RASTER_ENABLED && resolveModelSource(layer, state) === 'fusion';
}

/**
 * Quelle der Punkt-Engine (`getPointForecast`). `'fusion'` = Multi-Quellen-
 * Blend, `'native'` = Einzelmodell-Isolation. Gekoppelt an die Raster-Wahl
 * (Brief: R+P koppeln): wählt der Nutzer im aktiven Land ein **konkretes**
 * Modell, isoliert auch das Punkt-Panel (→ `'native'`); bei `'fusion'`/`'native'`
 * gilt der eigene `point`-Default.
 */
export function resolvePointSource(state: ModelSourceState): ModelSource {
  const chosen = activeModelId(state, state.country);
  if (chosen === 'fusion') return 'fusion';
  if (chosen === 'native') return state.point;
  return 'native';
}

/** Die konkrete Punkt-Modell-ID (für Attribution/Kopplung); `native`/`fusion` als Spezialwerte. */
export function resolvePointModel(state: ModelSourceState): ModelId {
  return activeModelId(state, state.country);
}

// --- Reine Reducer (neuer Zustand, kein Mutieren) -------------------------------

const clone = (s: ModelSourceState): ModelSourceState => ({
  country: s.country,
  perCountry: { ...s.perCountry },
  global: s.global,
  overrides: { ...s.overrides },
  radar: s.radar,
  point: s.point,
});

/** Globalen Fallback-Default setzen (Bestand). Nur Whitelist-IDs. */
export function setGlobalSource(state: ModelSourceState, src: ModelId): ModelSourceState {
  if (!isWhitelisted(src)) return state;
  const next = clone(state);
  next.global = src;
  return next;
}

/** Aktives Land setzen (steuert, aus welchem Per-Land-Slot resolved wird). */
export function setActiveCountry(state: ModelSourceState, country: Country): ModelSourceState {
  if (state.country === country) return state;
  const next = clone(state);
  next.country = country;
  return next;
}

/** Modellwahl für ein Land setzen (Whitelist-gegated). */
export function setCountryModel(
  state: ModelSourceState,
  country: Country,
  id: ModelId,
): ModelSourceState {
  if (!isWhitelisted(id)) return state;
  const next = clone(state);
  next.perCountry[country] = id;
  return next;
}

/** Modellwahl eines Landes entfernen → folgt wieder `global`. */
export function clearCountryModel(state: ModelSourceState, country: Country): ModelSourceState {
  if (!(country in state.perCountry)) return state;
  const next = clone(state);
  delete next.perCountry[country];
  return next;
}

/** Radar-Toggle setzen (orthogonal zur Modellwahl). */
export function setRadar(state: ModelSourceState, on: boolean): ModelSourceState {
  if (state.radar === on) return state;
  const next = clone(state);
  next.radar = on;
  return next;
}

/** Radar-Toggle umschalten. */
export function toggleRadar(state: ModelSourceState): ModelSourceState {
  const next = clone(state);
  next.radar = !state.radar;
  return next;
}

/** Per-Layer-Override setzen (nur für fähige Layer; Whitelist-gegated). */
export function setLayerOverride(
  state: ModelSourceState,
  layer: string,
  src: ModelId,
): ModelSourceState {
  if (!isFusionCapable(layer) || !isWhitelisted(src)) return state;
  const next = clone(state);
  next.overrides[layer] = src;
  return next;
}

/** Per-Layer-Override entfernen → Layer folgt wieder Land/global. */
export function clearLayerOverride(state: ModelSourceState, layer: string): ModelSourceState {
  if (!(layer in state.overrides)) return state;
  const next = clone(state);
  delete next.overrides[layer as FusionCapableLayer];
  return next;
}

/** Override pro Layer togglen (Fusion↔Native), relativ zum aktuell resolvten Wert. */
export function toggleLayerOverride(state: ModelSourceState, layer: string): ModelSourceState {
  if (!isFusionCapable(layer)) return state;
  const current = resolveModelSource(layer, state);
  return setLayerOverride(state, layer, current === 'fusion' ? 'native' : 'fusion');
}

/** Quelle der Punkt-Engine setzen (unabhängig von `global`/Overrides). */
export function setPointSource(state: ModelSourceState, src: ModelSource): ModelSourceState {
  const next = clone(state);
  next.point = src;
  return next;
}

// --- Headless-Selbsttest (Repo-Konvention: kein Test-Runner) ---------------------

/**
 * Reiner Selbsttest des Resolvers/der Reducer. Gibt `{checks, passed, failed}`
 * zurück; die Node-Harness (`scripts/verify-modelsource.mjs`) und der Dev-Global
 * `window.__verifyModelSource` schließen auf `failed === 0`. Deckt die
 * Deliverables (a) Native-Default-Pin, (b) Land-Wechsel, (c) native-by-design,
 * (e) Fallback + Per-Layer, (f) Punktquelle→native, (h) Whitelist-Gate.
 */
export function verifyModelSource(): { checks: string[]; passed: number; failed: number } {
  const checks: string[] = [];
  let passed = 0, failed = 0;
  const ok = (cond: boolean, label: string) => {
    checks.push(`${cond ? 'PASS' : 'FAIL'} — ${label}`);
    if (cond) passed++; else failed++;
  };
  const mk = (p: Partial<ModelSourceState> = {}): ModelSourceState => ({
    country: 'DE', perCountry: {}, global: 'fusion', overrides: {}, radar: true, point: 'fusion', ...p,
  });

  const base = mk();

  // (c) Native-by-design ist unverlierbar: nicht-fähige Layer bleiben IMMER native.
  for (const l of ['gust', 'sat', 'lightning', 'stations', 'confidence', 'snowline', 'flownowcast', 'poprob']) {
    ok(resolveModelSource(l, base) === 'native', `nicht-fähiger Layer "${l}" bleibt native bei global=fusion`);
    ok(resolveModel(l, setLayerOverride(base, l, 'fusion')) === 'native', `Override auf "${l}" wird ignoriert (native-by-design)`);
  }

  // Fusion-fähige Layer folgen dem globalen Default (Spezialwerte, kein Fallback).
  for (const l of FUSION_CAPABLE_LAYERS) {
    ok(resolveModelSource(l, base) === 'fusion', `fähiger Layer "${l}" folgt global=fusion`);
    ok(resolveModelSource(l, mk({ global: 'native' })) === 'native', `fähiger Layer "${l}" folgt global=native`);
  }

  // (a) Native-Default-Pin: Frischzustand rendert nativ, Radar an, Punkt=Blend.
  const init = initialModelSourceState();
  ok(init.global === 'native', '(a) initial global=native (eingefroren)');
  ok(init.radar === true, '(a) initial Radar an (heutiges Verhalten)');
  ok(resolveModel('temp', init) === 'native', '(a) temp rendert nativ im Frischzustand');
  ok(resolvePointSource(init) === 'fusion', '(a) Punkt-Default ist der Blend');

  // (b) Land-Wechsel: Per-Land-Wahl greift nur im aktiven Land.
  const perAt = setCountryModel(mk({ global: 'native' }), 'AT', 'arome-at');
  ok(resolveModel('temp', setActiveCountry(perAt, 'AT')) === 'arome-at', '(b) AT wählt AROME-AT → temp=arome-at in AT');
  ok(resolveModel('temp', setActiveCountry(perAt, 'DE')) === 'native', '(b) DE folgt global=native trotz AT-Wahl');
  ok(resolveModel('temp', setActiveCountry(perAt, 'CH')) === 'native', '(b) CH ohne eigene Wahl folgt global=native (Land-isoliert)');
  ok(resolveModel('temp', setActiveCountry(setCountryModel(perAt, 'CH', 'arome-at'), 'CH')) === 'arome-at', '(b) CH wählt AROME-AT (voll) → arome-at in CH');

  // (e/f) Abdeckungs-/Fähigkeits-Fallback:
  ok(resolveModel('temp', mk({ country: 'AT', global: 'inca' })) === 'inca', '(e) INCA in AT rasterfähig → inca');
  ok(resolveModel('temp', mk({ country: 'CH', global: 'inca' })) === 'native', '(e) INCA in CH nicht abgedeckt → native');
  ok(resolveModel('temp', mk({ country: 'DE', global: 'inca' })) === 'native', '(e) INCA in DE (AT-only) → native');
  ok(resolveModel('temp', mk({ global: 'mosmix' })) === 'native', '(f) MOSMIX (Punkt) auf Raster → native');
  ok(resolveModel('temp', mk({ global: 'icon-eu' })) === 'native', '(f) ICON-EU nicht ingestiert → native');
  const fb = resolveModelWithFallback('temp', mk({ global: 'mosmix' }));
  ok(fb.fellBack && fb.requested === 'mosmix' && fb.id === 'native', '(e) Fallback meldet requested=mosmix→native');
  ok(!resolveModelWithFallback('temp', mk({ global: 'icon-d2' })).fellBack, '(e) ICON-D2 kein Fallback (voll)');

  // (e) Per-Layer schlägt Land/global — in beide Richtungen.
  ok(resolveModelSource('wind', mk({ global: 'native', overrides: { wind: 'fusion' } })) === 'fusion', 'Override fusion schlägt global=native');
  ok(resolveModelSource('temp', mk({ global: 'fusion', overrides: { temp: 'native' } })) === 'native', 'Override native schlägt global=fusion');
  ok(resolveModel('wind', mk({ country: 'DE', global: 'native', overrides: { wind: 'icon-d2' } })) === 'icon-d2', 'Override konkretes Modell greift');

  // (h) Whitelist-Gate: keine Nicht-Katalog-ID gelangt in den State.
  ok(setGlobalSource(base, 'not-a-model' as ModelId) === base, '(h) setGlobalSource weist Nicht-Whitelist-ID ab');
  ok(setCountryModel(base, 'DE', 'gpt-weather' as ModelId) === base, '(h) setCountryModel weist Nicht-Whitelist-ID ab');
  ok(modelEntry('icon-d2') != null && modelEntry('not-a-model' as ModelId) == null, '(h) Katalog kennt nur Whitelist-IDs');

  // Radar-Orthogonalität (d): Toggle ändert NUR `radar`, nie die Modell-Resolution.
  const radarOff = setRadar(base, false);
  ok(radarOff.radar === false, '(d) setRadar(false) schaltet Radar aus');
  ok(resolveModel('temp', radarOff) === resolveModel('temp', base), '(d) Radar-Toggle ändert die Modell-Resolution nicht');
  ok(toggleRadar(radarOff).radar === true, '(d) toggleRadar schaltet zurück');
  ok(setGlobalSource(base, 'native').radar === base.radar, '(d) Modellwechsel lässt Radar unangetastet');

  // Reducer-Semantik: setGlobal lässt Overrides + perCountry bestehen; clear entfernt.
  const withOverride = setLayerOverride(base, 'clouds', 'native');
  ok(withOverride.overrides.clouds === 'native', 'setLayerOverride setzt Override');
  ok(setGlobalSource(withOverride, 'native').overrides.clouds === 'native', 'setGlobalSource bewahrt Overrides');
  ok(!('clouds' in clearLayerOverride(withOverride, 'clouds').overrides), 'clearLayerOverride entfernt Override');
  ok(resolveModelSource('nowcast', toggleLayerOverride(base, 'nowcast')) === 'native', 'toggle fusion→native');
  ok(resolveModelSource('nowcast', toggleLayerOverride(mk({ global: 'native' }), 'nowcast')) === 'fusion', 'toggle native→fusion');
  ok(!('AT' in clearCountryModel(perAt, 'AT').perCountry), 'clearCountryModel entfernt Land-Wahl');
  ok(setActiveCountry(base, 'CH').country === 'CH', 'setActiveCountry setzt Land');

  // Punkt-Engine: eigener Default 'fusion'; konkretes Modell koppelt Punkt→native (Isolation).
  ok(resolvePointSource(mk({ global: 'native' })) === 'fusion', 'Punkt behält Blend-Default bei global=native (invertiert)');
  ok(resolvePointSource(mk({ global: 'native', point: 'native' })) === 'native', 'Punkt=native wenn explizit isoliert');
  ok(resolvePointSource(mk({ global: 'fusion' })) === 'fusion', 'Punkt=Blend bei global=fusion');
  ok(resolvePointSource(mk({ global: 'arome-at', country: 'AT' })) === 'native', 'konkretes Modell koppelt Punkt→Isolation');
  ok(resolvePointModel(mk({ global: 'arome-at', country: 'AT' })) === 'arome-at', 'resolvePointModel liefert gekoppelte ID');
  ok(setLayerOverride(base, 'wind', 'native').point === 'fusion', 'Layer-Override lässt point unangetastet');

  // Immutabilität: Reducer mutieren den Eingangszustand nicht.
  const snapshot = mk({ overrides: { wind: 'native' }, perCountry: { AT: 'arome-at' } });
  const before = JSON.stringify(snapshot);
  setGlobalSource(snapshot, 'native'); setLayerOverride(snapshot, 'temp', 'native');
  clearLayerOverride(snapshot, 'wind'); setPointSource(snapshot, 'native');
  setCountryModel(snapshot, 'DE', 'icon-d2'); setActiveCountry(snapshot, 'CH'); setRadar(snapshot, false);
  ok(JSON.stringify(snapshot) === before, 'Reducer mutieren den Eingangszustand nicht');

  return { checks, passed, failed };
}
