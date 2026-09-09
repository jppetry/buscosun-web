/**
 * Waldbrand DACH · Zustand in der QUERY (Phase SH3, pur).
 *
 * Löst den Fragment-Codec `#wb=` ab (`fireState.ts`, bleibt als Leser für
 * Alt-Links erhalten). Zwei Gründe, beide inhaltlich:
 *
 *  1. Ein `#…`-Fragment erreicht den Server **nie**. Solange der Zustand dort
 *     steht, kann kein Vorschaubild und kein zustandsbezogener `og:title`
 *     entstehen (`audit/teilen-share.md` §1.2).
 *  2. Die Zeit war **relativ** (`d` = Tage ab heute, `h` = Stunden ab jetzt).
 *     Ein geteilter Link zeigte dem Empfänger am nächsten Tag einen anderen
 *     Tag. Hier steht sie absolut (`t=2026-09-13` bzw. `t=2026-09-12T15:00Z`).
 *
 * ── Was NICHT in die URL kommt und warum ─────────────────────────────────────
 *
 * **Der Ort.** `FirePage` übergibt `location: null` an den alten Codec — die
 * Seite hat gar keine Ortswahl, sie ist ein DACH-Flächenblick. Der Decoder
 * konnte `l` zwar lesen, aber nichts hat es je geschrieben. Ein Ortssegment im
 * Pfad (`/waldbrand/aktive-braende/freiburg`) wäre also eine Behauptung ohne
 * Zustand dahinter; `audit/teilen-share.md` §3.9 hatte es vorgesehen und wird
 * korrigiert.
 *
 * **Die immer aktiven Layer** (`FIRE_ALWAYS_ON`: Detektionen, Brandflächen,
 * Thermalanomalien, frühere Brandflächen) stehen in JEDEM Zustand und sagen
 * deshalb nichts. In `l=` stehen nur die fünf **schaltbaren** Layer.
 *
 * **Der markierte Brand.** Seine Registry-Kennung ist sitzungsgebunden (BD2) —
 * das war beim Fragment schon so und bleibt so.
 */

import type { FireLayerId } from './fireModel';
import { FIRE_DEFAULT_LAYERS, FIRE_ALWAYS_ON } from './fireModel';
import { DANGER_VIEW_ORDER, DEFAULT_DANGER_VIEW, type DangerView } from './dangerViews';
import type { BurntBucket } from './sources/euContext';
import { HISTORY_DAYS } from './footprint/history';
import type { SoilDrynessMode } from '../sources/iconD2Smi';
import { applyFireView, type FireReadoutTab, type FireRouteView } from './fireRouteView';
import { encodeShareQuery, formatValidTime, parseValidTime } from '../share/shareSchema';

/** Die fünf schaltbaren Layer mit lesbarem Namen. Reihenfolge = Ausgabereihenfolge. */
export const FIRE_LAYER_SLUGS: ReadonlyArray<readonly [FireLayerId, string]> = [
  ['fireDanger', 'gefahrenindex'],
  ['fireWeather', 'feuerwetter'],
  ['fireSoilDryness', 'trockenheit'],
  ['fireFuel', 'brennmaterial'],
  ['fireContext', 'schutzgebiete'],
] as const;

const SLUG_BY_LAYER = new Map<FireLayerId, string>(FIRE_LAYER_SLUGS.map(([k, s]) => [k, s]));
const LAYER_BY_SLUG = new Map<string, FireLayerId>(FIRE_LAYER_SLUGS.map(([k, s]) => [s, k]));

/** Ist der Layer schaltbar (also überhaupt eine Aussage in der URL)? */
export const isSwitchableFireLayer = (l: FireLayerId): boolean => SLUG_BY_LAYER.has(l);

export const DEFAULT_FIRE_WINDOW_H = 24;
/**
 * Rückblickfenster der Detektionen — **genau** die zwei Werte, die
 * `FIRE_LAYER_TIME` anbietet (`windowsH: [24, 168]`).
 *
 * ⚠ Hier stand zuerst eine erfundene Leiter (6/12/48/72 h) aus der Plan-Skizze.
 * Am Preview fiel auf, dass `?fenster=48h` spurlos verschwindet:
 * `reconcileFireTime` klemmt jeden Wert, den kein aktiver Layer anbietet,
 * sofort auf `windows[0]`. Ein URL-Vokabular, das die App nicht kennt, ist
 * kein Zustand — es ist ein stiller Datenverlust.
 */
export const FIRE_WINDOW_SLUGS: ReadonlyArray<readonly [hours: number, slug: string]> = [
  [24, '24h'], [168, '7t'],
] as const;

export const DEFAULT_BURNT_BUCKET_SLUGS = ['saison'] as const;
const BUCKET_SLUGS: ReadonlyArray<readonly [BurntBucket, string]> = [
  ['week', 'woche'], ['season', 'saison'], ['archive', 'archiv'],
] as const;

const SOIL_SLUGS: ReadonlyArray<readonly [SoilDrynessMode, string]> = [
  ['topsoil', 'oberboden'], ['rootzone', 'wurzelzone'],
] as const;
export const DEFAULT_SOIL_SLUG = 'oberboden';

export interface FireUrlState {
  /** Alle aktiven Layer (die immer aktiven dürfen dabei sein, sie werden gefiltert). */
  layers: readonly FireLayerId[];
  /** Absolute Gültigkeitszeit; `null` = heute/jetzt. */
  validAtMs: number | null;
  /** Zeitachse: Tage (Standard) oder Stunden (WF3). Bestimmt die Form von `t`. */
  hourly: boolean;
  windowH: number;
  dangerView: DangerView;
  burntBuckets: readonly BurntBucket[];
  /** BF4: einzelner Tag der 7-Tage-Historie (0 = heute, −6 = vor sechs Tagen). */
  burntDay: number | null;
  soilMode: SoilDrynessMode;
  readoutTab: FireReadoutTab;
  /** BH3: Historie-Fenster statt Live. */
  historyWindow: 'month' | 'season' | null;
  /** BD2: Mitte zeigt das Dossier statt der Karte. */
  dossier: boolean;
}

export const FIRE_QUERY_ORDER = ['t', 'l', 'fenster', 'index', 'flaechen', 'tag', 'boden', 'zeitraum', 'reiter', 'dossier'] as const;
const KNOWN: ReadonlySet<string> = new Set(FIRE_QUERY_ORDER);

/** Die Sicht im Pfad ergibt sich aus dem Zustand — dieselbe Regel wie bisher. */
export { fireViewFromState } from './fireRouteView';

/** Schaltbare Layer eines Zustands, in Katalogreihenfolge. */
function switchable(layers: Iterable<FireLayerId>): FireLayerId[] {
  const set = new Set(layers);
  return FIRE_LAYER_SLUGS.filter(([k]) => set.has(k)).map(([k]) => k);
}

/** Was die Sub-Route allein schon an schaltbaren Layern bedeutet. */
function layersOfView(view: FireRouteView): FireLayerId[] {
  return switchable(applyFireView(view, new Set<FireLayerId>(FIRE_DEFAULT_LAYERS)).layers);
}

/**
 * Zustand → Query-Paare. `view` ist die Sicht, die im Pfad steht: stimmt das
 * Layer-Set mit dem überein, was diese Sicht ohnehin bedeutet, entfällt `l=`.
 */
export function firePairs(
  s: FireUrlState,
  view: FireRouteView,
  extra: ReadonlyArray<[string, string]> = [],
): Array<[string, string]> {
  const out: Array<[string, string]> = [];

  if (s.validAtMs != null) {
    // Tagesachse: reines Datum. Stundenachse: Datum + Uhrzeit.
    out.push(['t', s.hourly ? formatValidTime(s.validAtMs) : new Date(s.validAtMs).toISOString().slice(0, 10)]);
  }

  const mine = switchable(s.layers);
  const implied = layersOfView(view);
  if (mine.join(',') !== implied.join(',')) {
    out.push(['l', mine.length ? mine.map((k) => SLUG_BY_LAYER.get(k)!).join(',') : '-']);
  }

  if (s.windowH !== DEFAULT_FIRE_WINDOW_H) {
    const slug = FIRE_WINDOW_SLUGS.find(([h]) => h === s.windowH)?.[1] ?? `${Math.round(s.windowH)}h`;
    out.push(['fenster', slug]);
  }
  if (s.dangerView !== DEFAULT_DANGER_VIEW) out.push(['index', s.dangerView]);

  const buckets = BUCKET_SLUGS.filter(([b]) => s.burntBuckets.includes(b)).map(([, sl]) => sl);
  if (buckets.join(',') !== DEFAULT_BURNT_BUCKET_SLUGS.join(',')) out.push(['flaechen', buckets.length ? buckets.join(',') : '-']);

  if (typeof s.burntDay === 'number' && s.burntDay <= 0 && s.burntDay > -HISTORY_DAYS) out.push(['tag', String(s.burntDay)]);

  const soil = SOIL_SLUGS.find(([m]) => m === s.soilMode)?.[1] ?? DEFAULT_SOIL_SLUG;
  if (soil !== DEFAULT_SOIL_SLUG) out.push(['boden', soil]);

  // Nur, wenn der Pfad es nicht schon sagt: `/waldbrand/historie` BEDEUTET die
  // Saison (`applyFireView`), ein `zeitraum=saison` daneben wäre Ballast.
  const impliedHistory = applyFireView(view, new Set<FireLayerId>(FIRE_DEFAULT_LAYERS)).history;
  if (s.historyWindow && s.historyWindow !== impliedHistory) {
    out.push(['zeitraum', s.historyWindow === 'month' ? 'monat' : 'saison']);
  }
  // Der Reiter steht nur dann in der URL, wenn ihn der Pfad nicht schon sagt.
  if (s.readoutTab === 'anomalies' && view !== 'thermalanomalien') out.push(['reiter', 'anomalien']);
  if (s.dossier) out.push(['dossier', '1']);

  const ordered = FIRE_QUERY_ORDER.flatMap((k) => out.filter(([ok]) => ok === k));
  for (const [k, v] of extra) if (!KNOWN.has(k)) ordered.push([k, v]);
  return ordered;
}

export function buildFireSearch(s: FireUrlState, view: FireRouteView, extra: ReadonlyArray<[string, string]> = []): string {
  return encodeShareQuery(firePairs(s, view, extra));
}

export interface ParsedFireQuery extends FireUrlState {
  /** `t` lag in der Vergangenheit und wurde auf „heute/jetzt" geklemmt (V-SH-2). */
  timePast: boolean;
  /** Welcher Zeitpunkt (bzw. Tag) im Link stand; `timePast` sagt, ob er vorbei war. */
  wantedAtMs: number | null;
  /**
   * Hat die URL den Reiter ausdrücklich genannt (`reiter=`)? Das entscheidet
   * mobil, ob die Seite mit der Karte oder mit dem Brände-Blatt öffnet — der
   * alte Hash trug dafür `fp`/`ta`, und ohne diese Unterscheidung öffnete jede
   * Seite auf dem Blatt statt auf der Karte.
   */
  readoutExplicit: boolean;
  invalid: string[];
  extra: Array<[string, string]>;
}

/**
 * Pfad-Sicht + Query → Zustand. Nie ein Wurf: jeder unbrauchbare Wert fällt auf
 * seinen Standard zurück und wird gemeldet, damit der Aufrufer ihn aus der URL
 * entfernen kann.
 */
export function parseFireQuery(view: FireRouteView, search: string, nowMs: number): ParsedFireQuery {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const invalid: string[] = [];
  const extra: Array<[string, string]> = [];
  for (const [k, v] of p.entries()) if (!KNOWN.has(k)) extra.push([k, v]);

  const preset = applyFireView(view, new Set<FireLayerId>(FIRE_DEFAULT_LAYERS));

  let validAtMs: number | null = null;
  let timePast = false;
  let wantedAtMs: number | null = null;
  let hourly = false;
  if (p.has('t')) {
    const raw = (p.get('t') ?? '').trim();
    const ms = parseValidTime(raw);
    if (ms == null) invalid.push('t');
    else {
      hourly = raw.includes('T');
      wantedAtMs = ms;
      // Tagesachse: „heute" ist der ganze Tag, erst ein früheres DATUM ist Vergangenheit.
      const past = hourly ? ms < nowMs : ms < new Date(nowMs).setUTCHours(0, 0, 0, 0);
      if (past) { timePast = true; hourly = false; } else validAtMs = ms;
    }
  }

  let layers: FireLayerId[] = switchable(preset.layers);
  if (p.has('l')) {
    const raw = p.get('l') ?? '';
    if (raw === '-') layers = [];
    else {
      const got: FireLayerId[] = [];
      for (const sl of raw.split(',')) {
        if (!sl) continue;
        const k = LAYER_BY_SLUG.get(sl);
        if (k) got.push(k); else invalid.push('l');
      }
      layers = switchable(got);
    }
  }

  let windowH = DEFAULT_FIRE_WINDOW_H;
  if (p.has('fenster')) {
    const hit = FIRE_WINDOW_SLUGS.find(([, sl]) => sl === p.get('fenster'));
    if (hit) windowH = hit[0]; else invalid.push('fenster');
  }

  let dangerView: DangerView = DEFAULT_DANGER_VIEW;
  if (p.has('index')) {
    const v = p.get('index') ?? '';
    if ((DANGER_VIEW_ORDER as readonly string[]).includes(v)) dangerView = v as DangerView; else invalid.push('index');
  }

  let burntBuckets: BurntBucket[] = BUCKET_SLUGS.filter(([, sl]) => (DEFAULT_BURNT_BUCKET_SLUGS as readonly string[]).includes(sl)).map(([b]) => b);
  if (p.has('flaechen')) {
    const raw = p.get('flaechen') ?? '';
    if (raw === '-') burntBuckets = [];
    else {
      const got: BurntBucket[] = [];
      for (const sl of raw.split(',')) {
        if (!sl) continue;
        const hit = BUCKET_SLUGS.find(([, x]) => x === sl);
        if (hit) got.push(hit[0]); else invalid.push('flaechen');
      }
      burntBuckets = BUCKET_SLUGS.filter(([b]) => got.includes(b)).map(([b]) => b);
    }
  }

  let burntDay: number | null = null;
  if (p.has('tag')) {
    const n = Number(p.get('tag'));
    if (Number.isInteger(n) && n <= 0 && n > -HISTORY_DAYS) burntDay = n; else invalid.push('tag');
  }

  let soilMode: SoilDrynessMode = 'topsoil';
  if (p.has('boden')) {
    const hit = SOIL_SLUGS.find(([, sl]) => sl === p.get('boden'));
    if (hit) soilMode = hit[0]; else invalid.push('boden');
  }

  let historyWindow: 'month' | 'season' | null = preset.history;
  if (p.has('zeitraum')) {
    const v = p.get('zeitraum');
    if (v === 'monat') historyWindow = 'month';
    else if (v === 'saison') historyWindow = 'season';
    else invalid.push('zeitraum');
  }

  let readoutTab: FireReadoutTab = preset.readoutTab;
  if (p.has('reiter')) {
    const v = p.get('reiter');
    if (v === 'anomalien') readoutTab = 'anomalies';
    else if (v === 'braende') readoutTab = 'fires';
    else invalid.push('reiter');
  }

  const dossier = p.get('dossier') === '1';
  if (p.has('dossier') && p.get('dossier') !== '1') invalid.push('dossier');

  return {
    layers, validAtMs, hourly, windowH, dangerView, burntBuckets, burntDay,
    soilMode, readoutTab, historyWindow, dossier, timePast, wantedAtMs,
    readoutExplicit: p.has('reiter'), invalid, extra,
  };
}

/** Absolute Zeit → Tagesschritt ab heute (0 = heute). */
export function dayFromValidAt(validAtMs: number | null, nowMs: number): number {
  if (validAtMs == null) return 0;
  const d0 = new Date(nowMs).setUTCHours(0, 0, 0, 0);
  return Math.max(0, Math.round((new Date(validAtMs).setUTCHours(0, 0, 0, 0) - d0) / 86_400_000));
}

/** Tagesschritt → absolute Zeit (UTC-Mitternacht). Tag 0 ⇒ `null`. */
export function validAtFromDay(day: number, nowMs: number): number | null {
  const d = Math.max(0, Math.round(day));
  return d <= 0 ? null : new Date(nowMs).setUTCHours(0, 0, 0, 0) + d * 86_400_000;
}

/** Absolute Zeit → Stundenschritt ab jetzt. */
export function fireHourFromValidAt(validAtMs: number | null, nowMs: number): number {
  if (validAtMs == null) return 0;
  return Math.max(0, Math.round((validAtMs - nowMs) / 3_600_000));
}

/** Stundenschritt → absolute Zeit. Auf der Stundenachse zählt auch die 0. */
export function validAtFromFireHour(hour: number, nowMs: number): number {
  return nowMs + Math.max(0, Math.round(hour)) * 3_600_000;
}

// --- Selbstverifikation (Muster D-12) ---------------------------------------

export interface FireUrlCheck { name: string; ok: boolean; detail?: string }

const baseState = (over: Partial<FireUrlState> = {}): FireUrlState => ({
  layers: [...FIRE_DEFAULT_LAYERS, ...FIRE_ALWAYS_ON],
  validAtMs: null, hourly: false, windowH: DEFAULT_FIRE_WINDOW_H,
  dangerView: DEFAULT_DANGER_VIEW, burntBuckets: ['season'], burntDay: null,
  soilMode: 'topsoil', readoutTab: 'fires', historyWindow: null, dossier: false,
  ...over,
});

export function verifyFireUrl(): { checks: FireUrlCheck[]; passed: number; failed: number } {
  const checks: FireUrlCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const now = Date.UTC(2026, 8, 12, 12, 0);

  add('Standardzustand auf der Standard-Sicht schreibt nichts',
    buildFireSearch(baseState(), 'gefahrenindex') === '', buildFireSearch(baseState(), 'gefahrenindex'));
  add('immer aktive Layer stehen NIE in der URL',
    !buildFireSearch(baseState(), 'gefahrenindex').includes('detektionen'));

  const s1 = baseState({ windowH: 168, readoutTab: 'fires', layers: ['fireHotspots', 'fireFootprints', 'fireAnomalies', 'fireBurnt'] });
  add('aktive Brände mit 7-Tage-Fenster', buildFireSearch(s1, 'aktive-braende') === '?fenster=7t', buildFireSearch(s1, 'aktive-braende'));
  add('nur die Fenster, die die App wirklich anbietet',
    FIRE_WINDOW_SLUGS.map(([h]) => h).join(',') === '24,168', FIRE_WINDOW_SLUGS.map(([h]) => h).join(','));
  add('ein erfundenes Fenster wird als ungültig gemeldet, nicht still verschluckt',
    parseFireQuery('aktive-braende', '?fenster=48h', now).invalid.includes('fenster'));

  const s2 = baseState({ layers: ['fireSoilDryness'], soilMode: 'rootzone' });
  add('Trockenheit in der Wurzelzone', buildFireSearch(s2, 'trockenheit') === '?boden=wurzelzone', buildFireSearch(s2, 'trockenheit'));

  const s3 = baseState({ layers: ['fireDanger', 'fireWeather'], dangerView: 'isi', validAtMs: Date.UTC(2026, 8, 14), burntBuckets: ['season', 'archive'], dossier: true });
  const q3 = buildFireSearch(s3, 'gefahrenindex');
  add('voller Zustand bleibt lesbar',
    q3 === '?t=2026-09-14&l=gefahrenindex,feuerwetter&index=isi&flaechen=saison,archiv&dossier=1', q3);
  add('Tagesachse schreibt ein reines Datum, keine Uhrzeit', !q3.includes('T00:00Z'));

  const s4 = baseState({ hourly: true, validAtMs: Date.UTC(2026, 8, 12, 15, 0), layers: ['fireWeather'] });
  add('Stundenachse schreibt Datum + Uhrzeit', buildFireSearch(s4, 'aktive-braende').includes('t=2026-09-12T15:00Z'));

  // Rundlauf über alle Sichten
  for (const view of ['gefahrenindex', 'aktive-braende', 'trockenheit', 'historie', 'thermalanomalien'] as FireRouteView[]) {
    const preset = applyFireView(view, new Set<FireLayerId>(FIRE_DEFAULT_LAYERS));
    const st = baseState({ layers: preset.layers, readoutTab: preset.readoutTab, historyWindow: preset.history });
    const q = buildFireSearch(st, view);
    const back = parseFireQuery(view, q, now);
    add(`Rundlauf ${view}: Layer, Reiter und Fenster identisch`,
      switchable(back.layers).join(',') === switchable(st.layers).join(',')
      && back.readoutTab === st.readoutTab && back.historyWindow === st.historyWindow,
      `${q} → ${switchable(back.layers).join(',')}`);
    add(`Rundlauf ${view}: Preset schreibt keine Query`, q === '', q);
  }

  const back3 = parseFireQuery('gefahrenindex', q3, now);
  add('Rundlauf voller Zustand', switchable(back3.layers).join(',') === 'fireDanger,fireWeather'
    && back3.dangerView === 'isi' && back3.burntBuckets.join(',') === 'season,archive' && back3.dossier
    && back3.validAtMs === Date.UTC(2026, 8, 14) && !back3.hourly);
  add('Rundlauf ist ein Fixpunkt', buildFireSearch({ ...s3, ...back3 }, 'gefahrenindex') === q3);

  add('kein schaltbarer Layer ⇒ l=-',
    buildFireSearch(baseState({ layers: [...FIRE_ALWAYS_ON] }), 'gefahrenindex') === '?l=-');
  add('l=- wird als „keiner" gelesen', switchable(parseFireQuery('gefahrenindex', '?l=-', now).layers).length === 0);

  // Zeit
  add('Tag ⇄ absolute Zeit', dayFromValidAt(validAtFromDay(2, now), now) === 2 && validAtFromDay(0, now) === null);
  add('Stunde ⇄ absolute Zeit (0 zählt auf der Stundenachse)',
    fireHourFromValidAt(validAtFromFireHour(5, now), now) === 5 && fireHourFromValidAt(validAtFromFireHour(0, now), now) === 0);
  add('heute ist auf der Tagesachse NICHT Vergangenheit',
    parseFireQuery('gefahrenindex', '?t=2026-09-12', now).timePast === false);
  add('ein früheres Datum wird gemeldet (V-SH-2)',
    (() => { const r = parseFireQuery('gefahrenindex', '?t=2026-09-10', now); return r.timePast && r.validAtMs === null; })());
  add('V-SH-2: der vergangene Tag wird benannt',
    (() => { const r = parseFireQuery('gefahrenindex', '?t=2026-09-10', now); return r.wantedAtMs === Date.UTC(2026, 8, 10); })());

  // Robustheit
  const bad = parseFireQuery('gefahrenindex', '?t=irgendwann&l=quatsch&fenster=99x&index=xx&flaechen=blah&tag=5&boden=tief&zeitraum=nie&reiter=xx&dossier=2&fremd=1', now);
  add('jeder unbrauchbare Wert wird gemeldet',
    ['t', 'l', 'fenster', 'index', 'flaechen', 'tag', 'boden', 'zeitraum', 'reiter', 'dossier'].every((k) => bad.invalid.includes(k)), bad.invalid.join(','));
  add('und fällt auf den Standard zurück, statt zu werfen',
    bad.windowH === DEFAULT_FIRE_WINDOW_H && bad.dangerView === DEFAULT_DANGER_VIEW && bad.soilMode === 'topsoil'
    && bad.burntDay === null && !bad.dossier);
  add('Fremdschlüssel bleiben erhalten', bad.extra.some(([k]) => k === 'fremd'));
  add('leere Query ⇒ Preset der Sicht',
    switchable(parseFireQuery('trockenheit', '', now).layers).join(',') === 'fireSoilDryness');

  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
