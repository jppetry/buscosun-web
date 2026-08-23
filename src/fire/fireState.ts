/**
 * Waldbrand DACH — teilbarer Zustand (`#wb=`, pur).
 *
 * Eigener Hash-Namensraum neben `#m=` (Karte), `#g=` (Globus), `#ev=` (Event).
 * Bewusst **nicht** `mapState.ts` mitbenutzt: andere Layer-Union, anderes
 * Zeitmodell, andere Ansicht.
 *
 * ── Der Fehler, der hier nicht wiederholt wird (V-191) ───────────────────────
 * `mapState.ts:24` führt eine **handgeschriebene** `LAYER_ORDER` mit 12 von 19
 * `LayerKey`s. Die restlichen sieben — `lightningfc`, `thunder`, `snow`,
 * `rotation`, `cells`, `hail`, `warnings` — sind dadurch **nicht
 * permalink-fähig**: `layersToBits` findet sie nicht (`indexOf` → −1) und
 * verwirft sie stillschweigend. Wer eine Karte mit aktivem Hagel-Layer teilt,
 * teilt eine Karte ohne Hagel, ohne je eine Fehlermeldung zu sehen.
 *
 * Hier wird die Bit-Reihenfolge deshalb **aus `FIRE_LAYER_ORDER` abgeleitet**
 * statt danebengeschrieben, und `verify:fire-model` prüft, dass diese Liste
 * jede `FireLayerId` enthält. Neue Layer werden angehängt (bit-stabil), aber
 * keiner kann mehr vergessen werden.
 *
 * Reine (De-)Serialisierung: kein Fetch, kein Modulzustand, headless testbar.
 */

import type { Country, Location } from '../types';
import { FIRE_BIT_ORDER, FIRE_LAYER_ORDER, type FireLayerId } from './fireModel';
import { DEFAULT_DANGER_VIEW, isDangerView, type DangerView } from './dangerViews';
import type { BurntBucket } from './sources/euContext';
import { HISTORY_DAYS } from './footprint/history';
import type { SoilDrynessMode } from '../sources/iconD2Smi';

export const FIRE_HASH_PREFIX = '#wb=';

/** Auf 5 Nachkommastellen runden — ~1 m Genauigkeit, kurze URLs. */
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** Standard-Körbe der Brandflächen: die Saison. Das Archiv nur auf Wunsch (4,8 MB). */
export const DEFAULT_BURNT_BUCKETS: readonly BurntBucket[] = ['season'] as const;

export interface FireState {
  /** Betrachteter Ort. `null` = DACH-Überblick ohne Punktbezug. */
  location: Location | null;
  layers: FireLayerId[];
  /** Tagesschritt ab heute (0 = heute). */
  day: number;
  /** Rückblickfenster der Hotspots in Stunden. */
  windowH: number;
  /** E3: Sub-Ansicht des EU-Index. Fehlt im Hash ⇒ Standard (Index). */
  dangerView?: DangerView;
  /** E2: eingeblendete Zeitkörbe der Brandflächen. Fehlt ⇒ Saison. */
  burntBuckets?: BurntBucket[];
  /**
   * BF4: Tagesschritt der 7-Tage-Historie. `0` = heute, `-6` = vor sechs Tagen,
   * `null`/fehlend = alle sieben Tage (Standard). Wirkt nur mit Korb `week`.
   */
  burntDay?: number | null;
  /** WT1: Tiefe der Bodentrockenheit. Fehlt im Hash ⇒ Standard (Oberboden). */
  soilMode?: SoilDrynessMode;
  /** BP2: ist das Brandflächen-Panel links geöffnet? Fehlt ⇒ zu (Standard). */
  footprintPanel?: boolean;
  /** TA4: Reiter „Thermalanomalien" offen? Fehlt ⇒ zu (Standard). Schließt `fp` nicht aus; `ta` gewinnt. */
  anomalyPanel?: boolean;
  /**
   * BH3: Historie-Fenster (`month` | `season`) statt des Live-Fensters `w`. Fehlt ⇒ Live
   * (Standard, Hash byte-gleich). `w` bleibt daneben erhalten — beim Verlassen der Historie
   * gilt wieder das gemerkte Live-Fenster.
   */
  historyWindow?: 'month' | 'season' | null;
  /**
   * WF3: Stundenschritt ab jetzt auf der Stundenachse. **Vorhanden ⇔ die
   * Stundenachse ist aktiv** (auch bei 0 — „jetzt" ist ein Wert, kein Fehlen);
   * `null`/fehlend ⇒ Tagesachse (Standard). Bestehende Links tragen kein `h`
   * und bleiben byte-gleich.
   */
  hour?: number | null;
}

/** Standardtiefe der Bodentrockenheit: der Oberboden — er trägt das Zündrisiko. */
export const DEFAULT_SOIL_MODE: SoilDrynessMode = 'topsoil';
const isSoilMode = (v: unknown): v is SoilDrynessMode => v === 'topsoil' || v === 'rootzone';

/** Bit 1 = Saison, Bit 2 = Archiv, Bit 4 = letzte 7 Tage (BF4). */
const BUCKET_BIT: Record<BurntBucket, number> = { season: 1, archive: 2, week: 4 };
const bucketsToBits = (b: readonly BurntBucket[]) => b.reduce((m, x) => m | (BUCKET_BIT[x] ?? 0), 0);
const bitsToBuckets = (bits: number): BurntBucket[] =>
  (['week', 'season', 'archive'] as const).filter((x) => !!(bits & BUCKET_BIT[x]));

/**
 * Bit-Platz je Layer — aus `FIRE_BIT_ORDER`, NICHT aus `FIRE_LAYER_ORDER`:
 * zurückgezogene Layer halten ihren Platz besetzt (`null`), damit ein geteilter
 * Link nach ihrer Entfernung nicht plötzlich andere Layer öffnet.
 */
function layersToBits(ls: readonly FireLayerId[]): number {
  let bits = 0;
  for (const l of ls) {
    const i = FIRE_BIT_ORDER.indexOf(l);
    if (i >= 0) bits |= 1 << i;
  }
  return bits;
}

/** Ein Bit eines zurückgezogenen Layers wird still übergangen — nicht geraten. */
function bitsToLayers(bits: number): FireLayerId[] {
  return FIRE_BIT_ORDER.filter((l, i): l is FireLayerId => l !== null && !!(bits & (1 << i)));
}

/** Kodiert den Zustand in einen Hash-String (inkl. `#wb=`-Präfix). */
export function encodeFireState(s: FireState): string {
  const payload: Record<string, unknown> = {
    b: layersToBits(s.layers),
    d: Math.max(0, Math.round(s.day)),
    w: Math.round(s.windowH),
  };
  if (s.location) {
    payload.l = [r5(s.location.lat), r5(s.location.lon), s.location.name, s.location.country];
  }
  // Nur schreiben, was vom Standard abweicht — bestehende Links bleiben
  // byte-gleich, und ein Standard-Zustand erzeugt keinen längeren Hash.
  if (s.dangerView && s.dangerView !== DEFAULT_DANGER_VIEW) payload.v = s.dangerView;
  if (s.burntBuckets && bucketsToBits(s.burntBuckets) !== bucketsToBits(DEFAULT_BURNT_BUCKETS)) {
    payload.bb = bucketsToBits(s.burntBuckets);
  }
  if (s.soilMode && s.soilMode !== DEFAULT_SOIL_MODE) payload.sm = s.soilMode;
  // BP2: nur schreiben, wenn offen — der Standard (zu) verlängert den Hash nicht.
  if (s.footprintPanel) payload.fp = 1;
  // TA4: analog `fp` — nur wenn der Reiter offen ist.
  if (s.anomalyPanel) payload.ta = 1;
  // BH3: nur im Historie-Modus — Live-Links bleiben byte-gleich.
  if (s.historyWindow === 'month' || s.historyWindow === 'season') payload.bh = s.historyWindow;
  // BF4: nur schreiben, wenn ein einzelner Tag gewählt ist. Der Standard („alle
  // sieben Tage") ist `null` und verlängert den Hash nicht.
  if (typeof s.burntDay === 'number' && s.burntDay <= 0 && s.burntDay > -HISTORY_DAYS) payload.bd = s.burntDay;
  // WF3: nur auf der Stundenachse — dort auch die 0, sonst ginge die Achse verloren.
  if (typeof s.hour === 'number' && Number.isFinite(s.hour)) payload.h = Math.max(0, Math.round(s.hour));
  return FIRE_HASH_PREFIX + encodeURIComponent(JSON.stringify(payload));
}

/** Liest den Zustand aus einem Hash-String; `null` bei fehlend/ungültig. */
export function decodeFireState(hash: string): FireState | null {
  if (!hash || !hash.startsWith(FIRE_HASH_PREFIX)) return null;
  try {
    const o = JSON.parse(decodeURIComponent(hash.slice(FIRE_HASH_PREFIX.length))) as {
      l?: [number, number, string, string]; b?: number; d?: number; w?: number;
      v?: unknown; bb?: unknown; sm?: unknown; bd?: unknown; fp?: unknown; ta?: unknown; h?: unknown; bh?: unknown;
    };
    let location: Location | null = null;
    if (Array.isArray(o.l) && Number.isFinite(o.l[0]) && Number.isFinite(o.l[1])) {
      location = {
        lat: o.l[0], lon: o.l[1],
        name: String(o.l[2] ?? ''), country: o.l[3] as Country,
      };
    }
    return {
      location,
      layers: bitsToLayers(typeof o.b === 'number' ? o.b : 0),
      day: typeof o.d === 'number' && Number.isFinite(o.d) ? Math.max(0, Math.round(o.d)) : 0,
      windowH: typeof o.w === 'number' && Number.isFinite(o.w) ? Math.round(o.w) : 24,
      // Unbekannte Sub-Ansicht ⇒ Standard, nie ein Absturz und nie ein leerer Layer.
      dangerView: isDangerView(o.v) ? o.v : DEFAULT_DANGER_VIEW,
      burntBuckets: typeof o.bb === 'number' && Number.isFinite(o.bb)
        ? bitsToBuckets(o.bb) : [...DEFAULT_BURNT_BUCKETS],
      // Unbekannte Tiefe ⇒ Standard, nie ein Absturz und nie ein leerer Layer.
      soilMode: isSoilMode(o.sm) ? o.sm : DEFAULT_SOIL_MODE,
      // Ein Tagesschritt außerhalb des Fensters ⇒ alle sieben Tage, nie ein
      // leerer Layer (dieselbe Regel wie bei der Sub-Ansicht).
      burntDay: typeof o.bd === 'number' && Number.isFinite(o.bd)
        && Math.round(o.bd) <= 0 && Math.round(o.bd) > -HISTORY_DAYS ? Math.round(o.bd) : null,
      footprintPanel: o.fp === 1,
      anomalyPanel: o.ta === 1,
      // BH3: unbekannter Wert ⇒ Live, nie ein Absturz.
      historyWindow: o.bh === 'month' || o.bh === 'season' ? o.bh : null,
      // WF3: `h` vorhanden ⇒ Stundenachse; Klemmung auf den Horizont macht `reconcileFireTime`.
      hour: typeof o.h === 'number' && Number.isFinite(o.h) ? Math.max(0, Math.round(o.h)) : null,
    };
  } catch {
    return null;
  }
}

/** Steht im Hash ein Waldbrand-Zustand? (Routing in `App.tsx`.) */
export function hasFireHash(hash: string): boolean {
  return !!hash && hash.startsWith(FIRE_HASH_PREFIX);
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (Muster D-12; läuft in verify:fire-model mit)
// ---------------------------------------------------------------------------

export interface FireStateCheck { name: string; ok: boolean; detail?: string }

export function verifyFireState(): { checks: FireStateCheck[]; passed: number; total: number } {
  const checks: FireStateCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const loc: Location = { name: 'Freiburg im Breisgau', lat: 47.99609, lon: 7.84913, country: 'DE' };

  // --- DIE Regel: jeder Layer überlebt die Runde. Das ist der Test, der in
  //     mapState.ts fehlt und dort sieben Layer hat verschwinden lassen.
  const every = [...FIRE_LAYER_ORDER];
  const roundTrip = decodeFireState(encodeFireState({ location: loc, layers: every, day: 0, windowH: 24 }));
  add('Round-Trip erhält JEDEN Layer — kein stiller Verlust (V-191)',
    roundTrip?.layers.length === every.length
      && every.every((l) => roundTrip.layers.includes(l)),
    `${roundTrip?.layers.length ?? 0}/${every.length}`);

  for (const l of FIRE_LAYER_ORDER) {
    const rt = decodeFireState(encodeFireState({ location: null, layers: [l], day: 0, windowH: 24 }));
    add(`Layer „${l}" einzeln permalink-fähig`, rt?.layers.join(',') === l, rt?.layers.join(','));
  }

  // --- Ort
  const withLoc = decodeFireState(encodeFireState({ location: loc, layers: ['fireDanger'], day: 2, windowH: 168 }));
  add('Ort überlebt den Round-Trip',
    withLoc?.location?.name === loc.name && withLoc.location.country === 'DE'
      && Math.abs((withLoc.location.lat ?? 0) - loc.lat) < 1e-4);
  add('Tag und Fenster überleben', withLoc?.day === 2 && withLoc.windowH === 168);
  const noLoc = decodeFireState(encodeFireState({ location: null, layers: [], day: 0, windowH: 24 }));
  add('ohne Ort bleibt es ohne Ort (DACH-Überblick)', noLoc?.location === null);

  // --- Robustheit gegen kaputte Hashes: nie werfen, immer null oder Default.
  add('fremder Präfix ⇒ null', decodeFireState('#m=abc') === null);
  add('leerer Hash ⇒ null', decodeFireState('') === null);
  add('Müll im Payload ⇒ null statt Absturz', decodeFireState('#wb=%7Bnope') === null);
  add('leeres Objekt ⇒ Defaults statt Absturz',
    decodeFireState(`${FIRE_HASH_PREFIX}${encodeURIComponent('{}')}`)?.day === 0);
  add('negativer Tag wird geklemmt',
    decodeFireState(`${FIRE_HASH_PREFIX}${encodeURIComponent('{"d":-5}')}`)?.day === 0);
  add('hasFireHash trennt sauber',
    hasFireHash('#wb=x') && !hasFireHash('#m=x') && !hasFireHash(''));

  // --- Bit-Stabilität: Bit 0 ist und bleibt fireDanger.
  const onlyFirst = decodeFireState(`${FIRE_HASH_PREFIX}${encodeURIComponent('{"b":1}')}`);
  add('Bit 0 ⇒ fireDanger (Bit-Stabilität bestehender Links)',
    onlyFirst?.layers.join(',') === 'fireDanger', onlyFirst?.layers.join(','));
  // 2026-08-19: Bit 1 gehörte der zurückgezogenen amtlichen Stufe. Der Platz
  // bleibt reserviert — ein alter Link öffnet sie nicht mehr, aber er
  // verschiebt auch nichts: Bit 2 ist weiterhin fireHotspots.
  const retired = decodeFireState(`${FIRE_HASH_PREFIX}${encodeURIComponent('{"b":2}')}`);
  add('Bit 1 (zurückgezogen) öffnet keinen Layer und verschiebt keinen',
    retired?.layers.length === 0, retired?.layers.join(','));
  const thirdBit = decodeFireState(`${FIRE_HASH_PREFIX}${encodeURIComponent('{"b":4}')}`);
  add('Bit 2 ⇒ fireHotspots — unverändert wie vor dem Rückzug',
    thirdBit?.layers.join(',') === 'fireHotspots', thirdBit?.layers.join(','));

  // --- Der Gegentest zu mapState.ts: unbekannte Bits werden ignoriert, aber
  //     bekannte Layer gehen nie verloren.
  const highBits = decodeFireState(`${FIRE_HASH_PREFIX}${encodeURIComponent('{"b":65535}')}`);
  add('überzählige Bits kippen nichts um',
    highBits?.layers.length === FIRE_LAYER_ORDER.length, String(highBits?.layers.length));

  // --- E2/E3: Sub-Ansicht und Körbe — additiv, standard-still ------------------
  const base = { location: null, layers: ['fireDanger' as FireLayerId], day: 0, windowH: 24 };
  add('Standard-Sub-Ansicht und Standard-Korb verlängern den Hash NICHT (Links bleiben byte-gleich)',
    encodeFireState(base) === encodeFireState({ ...base, dangerView: DEFAULT_DANGER_VIEW, burntBuckets: [...DEFAULT_BURNT_BUCKETS] }));
  const rk = decodeFireState(encodeFireState({ ...base, dangerView: 'ranking', burntBuckets: ['season', 'archive'] }));
  add('Sub-Ansicht überlebt den Round-Trip', rk?.dangerView === 'ranking');
  add('Körbe überleben den Round-Trip', rk?.burntBuckets?.join(',') === 'season,archive');
  add('alter Hash ohne v/bb ⇒ Index und Saison (Standard, kein Leerzustand)',
    decodeFireState(encodeFireState(base))?.dangerView === 'fwi'
      && decodeFireState(encodeFireState(base))?.burntBuckets?.join(',') === 'season');
  add('unbekannte Sub-Ansicht ⇒ Standard statt leerem Layer',
    decodeFireState(`${FIRE_HASH_PREFIX}${encodeURIComponent('{"v":"bui"}')}`)?.dangerView === 'fwi');
  add('nur Archiv ist kodierbar (Saison aus)',
    decodeFireState(encodeFireState({ ...base, burntBuckets: ['archive'] }))?.burntBuckets?.join(',') === 'archive');

  // --- BF4: der Wochenkorb und sein Tagesschritt — additiv, standard-still ----
  add('der Wochenkorb überlebt den Round-Trip',
    decodeFireState(encodeFireState({ ...base, burntBuckets: ['week'] }))?.burntBuckets?.join(',') === 'week');
  add('alle drei Körbe zusammen überleben den Round-Trip',
    decodeFireState(encodeFireState({ ...base, burntBuckets: ['week', 'season', 'archive'] }))
      ?.burntBuckets?.join(',') === 'week,season,archive');
  add('ein alter Hash ohne bb bleibt bei Saison (der Wochenkorb ist NICHT Standard)',
    decodeFireState(encodeFireState(base))?.burntBuckets?.join(',') === 'season');
  add('Standard-Tagesschritt (alle 7 Tage) verlängert den Hash NICHT',
    encodeFireState(base) === encodeFireState({ ...base, burntDay: null }));
  add('Tagesschritt überlebt den Round-Trip',
    decodeFireState(encodeFireState({ ...base, burntDay: -3 }))?.burntDay === -3);
  add('Tagesschritt heute (0) überlebt den Round-Trip',
    decodeFireState(encodeFireState({ ...base, burntDay: 0 }))?.burntDay === 0);
  add('Tagesschritt außerhalb des Fensters ⇒ alle 7 Tage statt leerem Layer',
    decodeFireState(`${FIRE_HASH_PREFIX}${encodeURIComponent('{"bd":-99}')}`)?.burntDay === null
      && decodeFireState(`${FIRE_HASH_PREFIX}${encodeURIComponent('{"bd":5}')}`)?.burntDay === null);

  // --- WT1: die Bodentiefe — additiv und standard-still, wie v/bb -------------
  add('Standard-Bodentiefe verlängert den Hash NICHT',
    encodeFireState(base) === encodeFireState({ ...base, soilMode: DEFAULT_SOIL_MODE }));
  add('Wurzelzone überlebt den Round-Trip',
    decodeFireState(encodeFireState({ ...base, soilMode: 'rootzone' }))?.soilMode === 'rootzone');
  add('alter Hash ohne sm ⇒ Oberboden (Standard, kein leerer Layer)',
    decodeFireState(encodeFireState(base))?.soilMode === 'topsoil');
  add('unbekannte Bodentiefe ⇒ Standard statt Absturz',
    decodeFireState(`${FIRE_HASH_PREFIX}${encodeURIComponent('{"sm":"bedrock"}')}`)?.soilMode === 'topsoil');

  // --- BP2: das Panel — additiv und standard-still --------------------------
  add('geschlossenes Panel verlängert den Hash NICHT',
    encodeFireState(base) === encodeFireState({ ...base, footprintPanel: false }));
  add('offenes Panel überlebt den Round-Trip',
    decodeFireState(encodeFireState({ ...base, footprintPanel: true }))?.footprintPanel === true);
  add('alter Hash ohne fp ⇒ Panel zu', decodeFireState(encodeFireState(base))?.footprintPanel === false);
  // TA4: Reiter „Thermalanomalien" — `ta` nur, wenn offen; alte Links bleiben byte-gleich.
  add('TA4: Reiter zu ⇒ kein ta im Hash (byte-gleich)', encodeFireState(base) === encodeFireState({ ...base, anomalyPanel: false }));
  add('TA4: Reiter offen ⇒ ta=1 und zurück', decodeFireState(encodeFireState({ ...base, anomalyPanel: true }))?.anomalyPanel === true && /%22ta%22%3A1|"ta":1/.test(decodeURIComponent(encodeFireState({ ...base, anomalyPanel: true }))));
  add('TA4: alter Hash ohne ta ⇒ Reiter zu', decodeFireState(encodeFireState(base))?.anomalyPanel === false);
  add('BH3: Live ⇒ kein bh im Hash (byte-gleich)', encodeFireState(base) === encodeFireState({ ...base, historyWindow: null }));
  add('BH3: Saison ⇒ bh=season und zurück, w bleibt', decodeFireState(encodeFireState({ ...base, windowH: 168, historyWindow: 'season' }))?.historyWindow === 'season' && decodeFireState(encodeFireState({ ...base, windowH: 168, historyWindow: 'season' }))?.windowH === 168);
  add('BH3: unbekanntes bh ⇒ Live', decodeFireState(`${FIRE_HASH_PREFIX}${encodeURIComponent('{"b":1,"bh":"decade"}')}`)?.historyWindow === null);
  add('Layer fireFootprints ist permalink-fähig (Bit 12)',
    decodeFireState(encodeFireState({ ...base, layers: ['fireFootprints'] }))?.layers.join(',') === 'fireFootprints');

  // --- WF3: die Stundenachse — additiv; Tagesachse bleibt byte-gleich ---------
  // DER Anker: ein Link von vor WF3, als Literal. Ändert sich diese Zeile, sind
  // alle geteilten Links anders — und genau das verbietet GWF3.
  add('Tagesachse: Hash ist byte-identisch zum Stand vor WF3 (Literal-Anker)',
    encodeFireState(base) === `${FIRE_HASH_PREFIX}${encodeURIComponent('{"b":1,"d":0,"w":24}')}`,
    encodeFireState(base));
  add('Tagesachse (hour fehlt/null) verlängert den Hash NICHT',
    encodeFireState(base) === encodeFireState({ ...base, hour: null })
      && encodeFireState(base) === encodeFireState({ ...base, hour: undefined }));
  add('Stunde überlebt den Round-Trip', decodeFireState(encodeFireState({ ...base, hour: 7 }))?.hour === 7);
  add('Stunde 0 ist ein Wert, kein Fehlen (Stundenachse bleibt aktiv)',
    decodeFireState(encodeFireState({ ...base, hour: 0 }))?.hour === 0);
  add('alter Hash ohne h ⇒ Tagesachse (hour null)', decodeFireState(encodeFireState(base))?.hour === null);
  add('negative oder kaputte Stunde ⇒ 0 bzw. Tagesachse, nie ein Absturz',
    decodeFireState(`${FIRE_HASH_PREFIX}${encodeURIComponent('{"h":-4}')}`)?.hour === 0
      && decodeFireState(`${FIRE_HASH_PREFIX}${encodeURIComponent('{"h":"x"}')}`)?.hour === null);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
