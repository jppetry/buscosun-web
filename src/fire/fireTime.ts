/**
 * Waldbrand DACH — Zeitmodell (pur, DOM-frei, headless verifizierbar nach D-12).
 *
 * ── Das Problem, das dieses Modul löst ───────────────────────────────────────
 * Die Waldbrand-Layer haben **vier verschiedene Zeitsemantiken** — mehr als
 * jede bisherige Phase (`architecture.md` §14.3):
 *
 *   EU-Gefahrenindex   `forecast`  Tag 0 … +9   (GWIS, WMS-TIME-Dimension)
 *   BAFU CH-Stufe      `instant`   nur jetzt    (Mo–Fr nach Mittag)
 *   Hotspots           `window`    rückwärts    (24 h bzw. 7 d)
 *   ICON-D2-Treiber    `forecast`  Tag 0 … +1   (0…+24 h in Tagesschritten)
 *
 * Ein **gemeinsamer** Regler muss auf den kleinsten gemeinsamen Horizont der
 * gerade aktiven Layer klemmen — sonst zieht der Nutzer auf Tag +7 und drei von
 * vier Layern zeigen still ihren letzten Stand weiter, ohne das zu sagen.
 *
 * ── WF3 (2026-08-19): EINE Achse, zwei Einheiten ─────────────────────────────
 * Der Regler zählt in Tagen (Standard) ODER in Stunden 0…+6 h ab jetzt
 * (`HOUR_AXIS_MAX`). Stunden gelten, wenn ein `hourly`-Layer aktiv ist
 * (erzwungen — der Waldbrand-Forecast, WF4) oder der Nutzer sie wählt, solange
 * ein Layer mit Stundenframes aktiv ist (`maxHour`: RH-Treiber, Boden, Wind). Auf der
 * Stundenachse folgen Tages-Layer als **Tageswert** des Kalendertags von
 * „jetzt + h" (`dayOfHour`), instant/window-Layer gar nicht — `hourFollow` sagt
 * je Layer, welches von dreien, damit die UI es so benennen kann.
 * `audit/waldbrand-forecast.md` §13 (c), §15.
 *
 * ── Was dieses Modul ausdrücklich NICHT ist ──────────────────────────────────
 * Es ist **nicht** die Vorwegnahme von `src/map/layerTime.ts`. Das gehört zu
 * Phase L5, arbeitet in Stundenschritten und bedient die Wetterkarte. Zwei
 * kleine Zeitmodelle sind billiger und risikoärmer als eine geteilte
 * Abstraktion, die L5 blockiert (V-193). Zusammenführen kann man später.
 *
 * Kein Fetch, kein Modulzustand, keine `Date.now()`-Aufrufe in der Logik —
 * jede Funktion bekommt „jetzt" hereingereicht und ist damit prüfbar.
 */

import type { FireLayerId } from './fireModel';

/** Wie ein Layer Zeit versteht. */
export type FireTimeMode =
  | 'instant'    // genau ein Zeitpunkt; der Regler bewegt daran nichts
  | 'window'     // ein Rückblickfenster (24 h / 7 d)
  | 'forecast'   // Tagesschritte vorwärts ab heute
  | 'hourly';    // WF3: Stundenschritte vorwärts ab jetzt, nur heute (0…maxHour)

export interface FireLayerTime {
  mode: FireTimeMode;
  /** Größter erreichbarer Tagesschritt (0 = nur heute). Bei `window`/`instant`/`hourly` 0. */
  maxDay: number;
  /** Für `window`: die wählbaren Rückblickfenster in Stunden. */
  windowsH?: readonly number[];
  /**
   * WF3 — Stundenhorizont **ab jetzt** (nicht ab Modelllauf), aus jedem Lauf
   * erreichbar. Pflicht bei `hourly`; bei `forecast` optional und heißt dann:
   * der Layer hat stündliche Frames und folgt der Stundenachse, wenn sie aktiv
   * ist. Fehlt er, folgt der Layer der Stundenachse nur als Tageswert
   * (`hourFollow` ⇒ `'daily'`) bzw. gar nicht (`instant`/`window` ⇒ `'none'`).
   */
  maxHour?: number;
}

/**
 * WF3 — die Stundenachse des Brandradars: 0…+6 h ab jetzt (Jans Entscheidung
 * `audit/waldbrand-forecast.md` §13 c, revidiert §15.5: „allgemein nur bis 6 h",
 * damit auch der Wind mitläuft — sein Gitter reicht +12 h **ab Lauf**, der Lauf
 * ist beim Abruf 2–5,5 h alt, also sind +6 h ab jetzt aus jedem Lauf da). Die
 * Zahl steht EINMAL hier; die Stundenlayer tragen sie als `maxHour`, damit die
 * Achse beim Layerwechsel nie springt (relhum/smi reichen +24 h ab Lauf — ein
 * Horizont, der mit der Tageszeit wandert, ist keiner).
 */
export const HOUR_AXIS_MAX = 6;

/** WF3 — Einheit der einen Achse: Tage (Standard) oder Stunden. */
export type FireTimeUnit = 'days' | 'hours';

/**
 * Das Zeitverhalten je Layer — gemessen, nicht geraten.
 * Quellen und Belege: `audit/waldbrand-transport.md`, `docs/DATA_SOURCES.md` §W.
 */
export const FIRE_LAYER_TIME: Record<FireLayerId, FireLayerTime> = {
  // GWIS liefert ECMWF-FWI bis +9 Tage (TIME-Dimension 2018-01-01/2099-12-31).
  fireDanger: { mode: 'forecast', maxDay: 9 },
  // Rückblick statt Vorhersage: .today = 24 h, .week = 7 d (GWIS-Typenamen).
  fireHotspots: { mode: 'window', maxDay: 0, windowsH: [24, 168] },
  // ICON-D2 reicht ~+24 h ⇒ heute und morgen. WF3: die Frames sind stündlich
  // (MIN_STEP 0 … MAX_STEP 24) — auf der Stundenachse folgt der Layer bis +6 h.
  fireWeather: { mode: 'forecast', maxDay: 1, maxHour: HOUR_AXIS_MAX },
  // WB4 — Werte vorbelegt, damit der Regler beim Zuschalten nicht springt.
  fireDrought: { mode: 'instant', maxDay: 0 },
  fireVegetation: { mode: 'instant', maxDay: 0 },
  fireFuel: { mode: 'instant', maxDay: 0 },
  // Ein Rückblick auf frühere Brände und statische Schutzgebiete — beide
  // folgen dem Tagesregler nicht und sagen das über `followsSlider`.
  fireBurnt: { mode: 'instant', maxDay: 0 },
  fireContext: { mode: 'instant', maxDay: 0 },
  /**
   * WW1 — der Windlayer der Wetterkarte. `instant`, obwohl ICON-D2 ein
   * Vorhersageprodukt ist, und das ist eine bewusste Entscheidung mit zwei
   * Gründen (`audit/waldbrand-wind.md` §2):
   *
   * 1. Das Windgitter reicht bis **+12 h** (`iconD2WindSource.ts` MAX_STEP).
   *    Der kleinste Schritt DIESES Reglers ist ein Tag; +24 h liegt bereits
   *    jenseits des Horizonts. Tag 0 ist also der einzige bedienbare Schritt.
   * 2. Als `forecast` mit `maxDay: 0` würde der Wind über `sharedMaxDay()` den
   *    GEMEINSAMEN Regler auf 0 ziehen — Zuschalten des Windes ließe den
   *    Tagesregler des EU-Index verschwinden. `instant`-Layer werden von
   *    `sharedMaxDay` übergangen, genau wie die übrigen `instant`-Layer.
   *
   * Die Ehrlichkeit trägt damit `followsSlider`/`laggingLayers`: ab Tag 1 steht
   * an der Zeile „gilt für heute — folgt dem Tagesregler nicht".
   *
   * WF3 (§15.5): auf der **Stundenachse** folgt der Wind — `maxHour` 6, und genau
   * deshalb ist die Achse 6 h lang: +6 h ab jetzt liegen aus jedem Lauf innerhalb
   * der +12 h ab Lauf. Die Karte bekommt dann „jetzt + h" statt `Date.now()`;
   * reicht der geladene Lauf einmal kürzer, zeigt sie den letzten Schritt und
   * die Zeile sagt es (`FirePage` `windClamped`) — kein stilles Klemmen.
   */
  fireWind: { mode: 'instant', maxDay: 0, maxHour: HOUR_AXIS_MAX },
  /**
   * WT1 — Bodentrockenheit. Anders als der Wind ist das ein **echter**
   * Vorhersage-Layer: `smi` liegt bis +48 h vor, und am Feld gemessen ändern
   * sich zwischen +0 h und +24 h **67 % der Zellen** der 9-cm-Ebene. Der
   * Tagesregler bewegt hier also wirklich etwas.
   *
   * `maxDay: 1` und nicht 2, obwohl 48 h reichen würden: Der Regler zielt auf
   * den **Mittag** des gewählten Tages (`FirePage`), und aus einem 00z-Lauf
   * liegt der Mittag von Tag 2 bei +60 h — jenseits des Horizonts. Ein Horizont,
   * der je nach Tageszeit des Laufs mal gilt und mal nicht, ist keiner. 1 gilt
   * aus jedem Lauf. Identisch zum Luft-Treiber, damit beide zusammen denselben
   * Regler behalten. WF3: stündliche Frames ⇒ folgt der Stundenachse bis +6 h.
   */
  fireSoilDryness: { mode: 'forecast', maxDay: 1, maxHour: HOUR_AXIS_MAX },
  /**
   * BP2 — die Brandflächen der Registry. Sie fassen die Detektionen des
   * ANGEZEIGTEN Rückblickfensters je Brand zusammen — also dasselbe Fenster
   * wie die Hotspots (24 h / 7 d), kein eigenes. Ist der Hotspot-Layer aus,
   * trägt dieser Layer den Fensterschalter allein.
   */
  fireFootprints: { mode: 'window', maxDay: 0, windowsH: [24, 168] },
  /**
   * SF1 — Ausbreitungsrichtung aktiver Brände: der einzige `hourly`-Layer (er
   * hat die Rolle vom zurückgezogenen `fireForecast` übernommen). Er ERZWINGT
   * die Stundenachse (`timeUnit`), klemmt die Tagesachse aber nicht —
   * `sharedMaxDay` zählt nur `forecast`. Horizont = die eine Achse, 0…+6 h.
   */
  fireSpread: { mode: 'hourly', maxDay: 0, maxHour: HOUR_AXIS_MAX },
};

/** Millisekunden eines Tages — als Konstante, damit die Zahl nur einmal dasteht. */
const DAY_MS = 86_400_000;

export interface FireTimeState {
  /** Gewählter Tagesschritt ab heute (0 = heute). */
  day: number;
  /** Gewähltes Rückblickfenster in Stunden (nur für `window`-Layer). */
  windowH: number;
  /** WF3: gewählter Stundenschritt ab jetzt (0 = jetzt) — wirkt nur auf der Stundenachse. */
  hour: number;
  /**
   * WF3: die vom Nutzer gewählte Einheit. Was tatsächlich gilt, sagt `timeUnit`:
   * ein `hourly`-Layer erzwingt Stunden, ohne stundenfähigen Layer gelten Tage.
   */
  unit: FireTimeUnit;
}

export function defaultFireTimeState(): FireTimeState {
  return { day: 0, windowH: 24, hour: 0, unit: 'days' };
}

/**
 * Der kleinste gemeinsame Horizont der aktiven Layer.
 *
 * Reine `instant`- und `window`-Layer werden **übergangen**, nicht mitgezählt:
 * sonst klemmte ein zugeschalteter `instant`-Layer (z. B. der Wind) den ganzen
 * Regler auf Tag 0 und der EU-Index verlöre seine neun Tage, obwohl er sie hat.
 * Sind ausschließlich solche Layer aktiv, gibt es keinen Vorhersage-Regler —
 * dann ist der Horizont 0 und die UI blendet ihn aus, statt einen toten
 * Schieber anzubieten.
 */
export function sharedMaxDay(active: readonly FireLayerId[]): number {
  const horizons = active
    .map((l) => FIRE_LAYER_TIME[l])
    .filter((t) => t.mode === 'forecast')
    .map((t) => t.maxDay);
  if (horizons.length === 0) return 0;
  return Math.min(...horizons);
}

/** Klemmt einen Tagesschritt auf den erlaubten Bereich (nie negativ). */
export function clampDay(day: number, active: readonly FireLayerId[]): number {
  const max = sharedMaxDay(active);
  if (!Number.isFinite(day)) return 0;
  return Math.max(0, Math.min(max, Math.round(day)));
}

/**
 * WF3 — der kleinste gemeinsame **Stunden**horizont der aktiven Layer.
 *
 * Gezählt werden alle Layer mit `maxHour` — gleich ob `hourly` oder `forecast`
 * mit Stundenframes. Layer ohne `maxHour` werden übergangen, aus demselben
 * Grund wie bei `sharedMaxDay`: der EU-Index (Tageswert) darf dem RH-Treiber
 * seine zwölf Stunden nicht nehmen. 0 heißt: keine Stundenachse möglich.
 */
export function sharedMaxHour(active: readonly FireLayerId[]): number {
  const horizons = active
    .map((l) => FIRE_LAYER_TIME[l].maxHour ?? 0)
    .filter((h) => h > 0);
  if (horizons.length === 0) return 0;
  return Math.min(...horizons);
}

/** WF3 — gibt es unter den aktiven Layern einen mit Stundenframes? */
export function hourlyAvailable(active: readonly FireLayerId[]): boolean {
  return sharedMaxHour(active) > 0;
}

/** WF3 — erzwingt ein aktiver Layer die Stundenachse (`mode: 'hourly'`)? */
export function hourlyForced(active: readonly FireLayerId[]): boolean {
  return active.some((l) => FIRE_LAYER_TIME[l].mode === 'hourly');
}

/**
 * WF3 — die Einheit, die tatsächlich gilt: **erzwungen > gewählt > Tage.**
 *
 * Ein `hourly`-Layer hat keine Tagesachse (sein Horizont sind zwölf Stunden),
 * also gelten mit ihm immer Stunden. Sonst zählt die Wahl des Nutzers — aber
 * nur, solange ein Layer mit Stundenframes aktiv ist; ohne einen solchen wäre
 * eine Stundenachse ein Regler, an dem nichts hängt.
 */
export function timeUnit(state: Pick<FireTimeState, 'unit'>, active: readonly FireLayerId[]): FireTimeUnit {
  if (hourlyForced(active)) return 'hours';
  return state.unit === 'hours' && hourlyAvailable(active) ? 'hours' : 'days';
}

/** WF3 — klemmt einen Stundenschritt auf den erlaubten Bereich (nie negativ). */
export function clampHour(hour: number, active: readonly FireLayerId[]): number {
  const max = sharedMaxHour(active);
  if (!Number.isFinite(hour)) return 0;
  return Math.max(0, Math.min(max, Math.round(hour)));
}

/**
 * Zieht den Zustand nach, wenn sich die aktiven Layer geändert haben.
 *
 * Der Fall, der ohne das hier schiefgeht: Der Nutzer steht auf Tag +8 (EU-Index
 * allein), schaltet die amtliche Landesstufe zu — deren Horizont ist +6. Ohne
 * Klemmung stünde der Regler auf einem Tag, den niemand mehr liefert.
 *
 * WF3: dasselbe für die Stunde; und die gewählte Einheit fällt auf Tage zurück,
 * sobald kein stundenfähiger Layer mehr aktiv ist — sonst trüge der Permalink
 * ein `h`, an dem nichts hängt, und der nächste stundenfähige Layer spränge
 * ungefragt in die Stundenachse.
 */
export function reconcileFireTime(
  state: FireTimeState,
  active: readonly FireLayerId[],
): FireTimeState {
  const day = clampDay(state.day, active);
  const hour = clampHour(state.hour, active);
  const unit: FireTimeUnit = state.unit === 'hours' && hourlyAvailable(active) ? 'hours' : 'days';
  const windows = windowChoices(active);
  const windowH = windows.includes(state.windowH) ? state.windowH : (windows[0] ?? state.windowH);
  return day === state.day && windowH === state.windowH && hour === state.hour && unit === state.unit
    ? state
    : { day, windowH, hour, unit };
}

/** Die Rückblickfenster, die die aktiven Layer anbieten (leer, wenn keiner). */
export function windowChoices(active: readonly FireLayerId[]): readonly number[] {
  for (const l of active) {
    const t = FIRE_LAYER_TIME[l];
    if (t.mode === 'window' && t.windowsH?.length) return t.windowsH;
  }
  return [];
}

/** Ist der Vorhersage-Regler überhaupt sinnvoll? (Tagesachse) */
export function hasForecastSlider(active: readonly FireLayerId[]): boolean {
  return sharedMaxDay(active) > 0;
}

/** WF3 — gibt es in der geltenden Einheit eine bedienbare Achse? */
export function hasTimeSlider(active: readonly FireLayerId[], unit: FireTimeUnit): boolean {
  return unit === 'hours' ? sharedMaxHour(active) > 0 : sharedMaxDay(active) > 0;
}

/**
 * WF3 — der Tagesschritt, in den „jetzt + hour" fällt (UTC-Kalendertage, wie
 * `dayToIsoDate`). Das ist der Tag, den die Tages-Layer (EU-Index, DWD-Stufe)
 * auf der Stundenachse zeigen: bis Mitternacht UTC ist das Tag 0 — abends
 * springt „jetzt + 3 h" auf morgen, und der Tageswert folgt, statt den Wert
 * von gestern Mittag als den von heute Nacht auszugeben.
 */
export function dayOfHour(hour: number, nowMs: number): number {
  const h = Number.isFinite(hour) ? Math.max(0, hour) : 0;
  return Math.floor((nowMs + h * 3_600_000) / DAY_MS) - Math.floor(nowMs / DAY_MS);
}

/** WF3 — Beschriftung eines Stundenschritts („jetzt", „+3 h"). */
export function hourLabel(hour: number): string {
  return hour <= 0 ? 'jetzt' : `+${Math.round(hour)} h`;
}

/**
 * Der Kalendertag zu einem Schritt, als `YYYY-MM-DD` in **UTC**.
 *
 * UTC, weil genau dieser String als WMS-`TIME`-Parameter an GWIS geht und der
 * Dienst in UTC denkt. Eine lokale Zeitzone würde am Tageswechsel um bis zu
 * zwei Stunden danebenliegen und den falschen Tag anfordern.
 */
export function dayToIsoDate(day: number, nowMs: number): string {
  return new Date(nowMs + day * DAY_MS).toISOString().slice(0, 10);
}

/** Beschriftung eines Tagesschritts in Alltagssprache. */
export function dayLabel(day: number, nowMs: number): string {
  if (day === 0) return 'heute';
  if (day === 1) return 'morgen';
  if (day === 2) return 'übermorgen';
  const d = new Date(nowMs + day * DAY_MS);
  const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getUTCDay()];
  return `${wd} +${day}`;
}

/** Beschriftung eines Rückblickfensters. */
export function windowLabel(hours: number): string {
  return hours >= 168 ? '7 Tage' : hours >= 48 ? `${Math.round(hours / 24)} Tage` : `${hours} h`;
}

/**
 * Sagt für einen Layer, ob er dem Regler auf diesen Tag **wirklich** folgt.
 *
 * Das ist die Ehrlichkeitsfunktion des Moduls: Ein `instant`-Layer (Wind,
 * Schutzgebiete) bleibt stehen, während die EU-Fläche weiterläuft. Die UI muss
 * das sagen können — „gilt für heute, folgt dem Regler nicht" — statt eine
 * eingefrorene Fläche als Vorhersage aussehen zu lassen (D-04).
 */
export function followsSlider(layer: FireLayerId, day: number): boolean {
  const t = FIRE_LAYER_TIME[layer];
  if (t.mode !== 'forecast') return day === 0;
  return day <= t.maxDay;
}

/**
 * WF3 — wie ein Layer der Stundenachse folgt:
 *   `'hourly'` — stündlich (Stundenframes, oder Stunde 0: dort gilt alles für jetzt),
 *   `'daily'`  — als Tageswert (EU-Index, DWD-Stufe: der Kalendertag von jetzt + h),
 *   `'none'`   — gar nicht (instant/window: Verbote, Hotspots, Wind).
 * Ehrlichkeitsfunktion wie `followsSlider`, nur dreistufig — „Tageswert" ist
 * weder „folgt" noch „steht": die UI muss es so sagen können.
 */
export function hourFollow(layer: FireLayerId, hour: number): 'hourly' | 'daily' | 'none' {
  const t = FIRE_LAYER_TIME[layer];
  if (hour <= 0) return 'hourly';
  if ((t.maxHour ?? 0) >= hour) return 'hourly';
  if (t.mode === 'forecast') return 'daily';
  return 'none';
}

/** WF3 — Layer, die auf der Stundenachse nur als Tageswert mitgehen. */
export function dailyOnlyLayers(active: readonly FireLayerId[], hour: number): FireLayerId[] {
  return active.filter((l) => hourFollow(l, hour) === 'daily');
}

/**
 * Layer, die beim aktuellen Reglerstand NICHT mitlaufen (für den Hinweistext).
 * WF3: `unit` wählt die Achse — `pos` ist dann Tag bzw. Stunde. Ohne `unit`
 * verhält sich die Funktion wie vor WF3 (Tagesachse).
 */
export function laggingLayers(
  active: readonly FireLayerId[], pos: number, unit: FireTimeUnit = 'days',
): FireLayerId[] {
  if (unit === 'hours') return active.filter((l) => hourFollow(l, pos) === 'none');
  return active.filter((l) => !followsSlider(l, pos));
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (Muster D-12; headless über verify:fire-time)
// ---------------------------------------------------------------------------

export interface FireTimeCheck { name: string; ok: boolean; detail?: string }

export function verifyFireTime(): { checks: FireTimeCheck[]; passed: number; total: number } {
  const checks: FireTimeCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // 2026-08-14 12:00 UTC — ein Freitag, damit auch die Wochentagslogik greift.
  const now = Date.UTC(2026, 7, 14, 12, 0);

  // --- Horizonte
  add('EU-Index allein: 9 Tage', sharedMaxDay(['fireDanger']) === 9);
  add('ICON-Treiber allein: 1 Tag', sharedMaxDay(['fireWeather']) === 1);
  add('EU + Treiber ⇒ 1', sharedMaxDay(['fireDanger', 'fireWeather']) === 1);

  // Der Fall, für den die Filterung da ist: instant/window dürfen den Regler
  // nicht auf 0 ziehen, sonst verliert der EU-Index seine neun Tage.
  add('Schutzgebiete (instant) klemmen den Regler NICHT auf 0',
    sharedMaxDay(['fireDanger', 'fireContext']) === 9);
  add('Hotspots (window) klemmen den Regler NICHT auf 0',
    sharedMaxDay(['fireDanger', 'fireHotspots']) === 9);
  // WW1-Regressionsanker: Wind zuschalten darf dem EU-Index seine neun Tage
  // nicht nehmen. Wäre `fireWind` ein `forecast`-Layer mit maxDay 0, stünde hier
  // 0 und der Tagesregler verschwände (audit/waldbrand-wind.md §2).
  add('Wind (instant) klemmt den Regler NICHT auf 0',
    sharedMaxDay(['fireDanger', 'fireWind']) === 9,
    String(sharedMaxDay(['fireDanger', 'fireWind'])));
  add('Wind allein ⇒ kein Vorhersage-Regler (ICON-D2 reicht nur +12 h)',
    hasForecastSlider(['fireWind']) === false);
  // WT1: der Boden ist — anders als der Wind — ein echter Vorhersage-Layer.
  add('Bodentrockenheit allein: 1 Tag', sharedMaxDay(['fireSoilDryness']) === 1);
  add('Boden + Luft-Treiber teilen denselben Horizont (kein Regler-Sprung)',
    sharedMaxDay(['fireSoilDryness', 'fireWeather']) === 1);
  add('Boden folgt dem Regler auf Tag 1, aber nicht auf Tag 2',
    followsSlider('fireSoilDryness', 1) === true
      && followsSlider('fireSoilDryness', 2) === false);
  add('Boden + Wind: der Boden behält seinen Tagesregler (Wind ist instant)',
    sharedMaxDay(['fireSoilDryness', 'fireWind']) === 1);
  add('nur instant/window ⇒ kein Vorhersage-Regler',
    sharedMaxDay(['fireContext', 'fireHotspots']) === 0
      && hasForecastSlider(['fireContext', 'fireHotspots']) === false);
  add('leere Auswahl ⇒ Horizont 0', sharedMaxDay([]) === 0);

  // --- Klemmung
  add('clampDay begrenzt nach oben', clampDay(12, ['fireDanger']) === 9);
  add('clampDay begrenzt nach unten', clampDay(-3, ['fireDanger']) === 0);
  add('clampDay rundet', clampDay(2.6, ['fireDanger']) === 3);
  add('clampDay verträgt NaN', clampDay(Number.NaN, ['fireDanger']) === 0);

  // DER Regressionsanker: Zuschalten eines kürzeren Layers zieht den Regler nach.
  const at8: FireTimeState = { day: 8, windowH: 24, hour: 0, unit: 'days' };
  add('Tag 8 + ICON-Treiber zugeschaltet ⇒ auf 1 nachgezogen',
    reconcileFireTime(at8, ['fireDanger', 'fireWeather']).day === 1,
    String(reconcileFireTime(at8, ['fireDanger', 'fireWeather']).day));
  add('unveränderter Zustand wird identisch zurückgegeben (kein Render-Sturm)',
    reconcileFireTime(at8, ['fireDanger']) === at8);

  // --- Fenster
  add('Hotspots bieten 24 h und 7 d', windowChoices(['fireHotspots']).join(',') === '24,168');
  add('ohne Hotspots gibt es keine Fensterwahl', windowChoices(['fireDanger']).length === 0);
  add('unpassendes Fenster wird auf das erste gültige gezogen',
    reconcileFireTime({ day: 0, windowH: 999, hour: 0, unit: 'days' }, ['fireHotspots']).windowH === 24);

  // --- Datum und Beschriftung
  add('Tag 0 ist heute in UTC', dayToIsoDate(0, now) === '2026-08-14');
  add('Tag 3 zählt korrekt weiter', dayToIsoDate(3, now) === '2026-08-17');
  add('Monatswechsel bricht nicht', dayToIsoDate(20, Date.UTC(2026, 7, 25, 12)) === '2026-09-14');
  // Der Tageswechsel-Fallstrick: 23:30 lokal wäre in MESZ schon der Folgetag.
  add('spät am Abend bleibt der UTC-Tag stabil',
    dayToIsoDate(0, Date.UTC(2026, 7, 14, 23, 30)) === '2026-08-14');
  add('dayLabel: 0/1/2 in Alltagssprache',
    dayLabel(0, now) === 'heute' && dayLabel(1, now) === 'morgen' && dayLabel(2, now) === 'übermorgen');
  add('dayLabel: ab 3 mit Wochentag', dayLabel(3, now) === 'Mo +3', dayLabel(3, now));
  add('windowLabel: 24 h und 7 Tage',
    windowLabel(24) === '24 h' && windowLabel(168) === '7 Tage');

  // --- Ehrlichkeit: wer folgt dem Regler, wer nicht?
  add('EU-Index folgt bis Tag 9', followsSlider('fireDanger', 9) === true);
  add('EU-Index folgt NICHT auf Tag 10', followsSlider('fireDanger', 10) === false);
  add('Schutzgebiete folgen nur auf Tag 0',
    followsSlider('fireContext', 0) === true && followsSlider('fireContext', 1) === false);
  add('Hotspots folgen nur auf Tag 0',
    followsSlider('fireHotspots', 0) === true && followsSlider('fireHotspots', 3) === false);
  add('Wind folgt nur auf Tag 0 und sagt das ab Tag 1',
    followsSlider('fireWind', 0) === true && followsSlider('fireWind', 1) === false
      && laggingLayers(['fireDanger', 'fireWind'], 1).join(',') === 'fireWind');
  add('laggingLayers nennt auf Tag 0 niemanden',
    laggingLayers(['fireDanger', 'fireContext', 'fireHotspots'], 0).length === 0);
  add('laggingLayers nennt auf Tag 2 genau die stehenden Layer',
    laggingLayers(['fireDanger', 'fireContext', 'fireHotspots'], 2).join(',') === 'fireContext,fireHotspots',
    laggingLayers(['fireDanger', 'fireContext', 'fireHotspots'], 2).join(','));

  // --- WF3: Stundenachse ---------------------------------------------------
  add('Stundenachse ist 6 h (eine Zahl, einmal definiert — Jans Entscheidung §15.5)', HOUR_AXIS_MAX === 6);
  add('RH-Treiber, Boden und Wind tragen die Stundenachse, EU-Index nicht',
    sharedMaxHour(['fireWeather']) === 6 && sharedMaxHour(['fireSoilDryness']) === 6
      && sharedMaxHour(['fireWind']) === 6 && sharedMaxHour(['fireDanger']) === 0);
  add('Tages-Layer ziehen die Stundenachse NICHT auf 0 (wie instant bei Tagen)',
    sharedMaxHour(['fireDanger', 'fireWeather']) === 6);
  // Der Grund für die 6: Wind reicht +12 h ab Lauf, der Lauf ist bis ~5,5 h alt.
  add('Wind allein: Tagesachse nein (WW1), Stundenachse ja (§15.5)',
    hasForecastSlider(['fireWind']) === false && hourlyAvailable(['fireWind']) === true
      && hasTimeSlider(['fireWind'], 'hours') === true);
  add('Standard ist die Tagesachse — auch mit stundenfähigem Layer (Funktionserhalt)',
    timeUnit(defaultFireTimeState(), ['fireWeather', 'fireDanger']) === 'days');
  add('gewählte Stunden gelten nur mit stundenfähigem Layer',
    timeUnit({ unit: 'hours' }, ['fireWeather']) === 'hours'
      && timeUnit({ unit: 'hours' }, ['fireDanger']) === 'days');
  add('ohne den Stundenlayer erzwingt kein Layer die Stundenachse (Wahl bleibt beim Nutzer)',
    hourlyForced(['fireDanger', 'fireWeather', 'fireSoilDryness', 'fireWind']) === false);
  // SF1: die Ausbreitung ist der `hourly`-Layer — Stunden erzwungen, Tagesachse unberührt.
  add('SF1: fireSpread erzwingt die Stundenachse',
    hourlyForced(['fireSpread']) === true && timeUnit({ unit: 'days' }, ['fireSpread']) === 'hours');
  add('SF1: fireSpread klemmt die Tagesachse NICHT (EU-Index behält 9 Tage)',
    sharedMaxDay(['fireDanger', 'fireSpread']) === 9);
  add('SF1: Ausbreitung + Wind teilen die 6-h-Achse; Ausbreitung allein ebenso',
    sharedMaxHour(['fireSpread', 'fireWind']) === HOUR_AXIS_MAX && sharedMaxHour(['fireSpread']) === HOUR_AXIS_MAX);
  add('SF1: mit der Ausbreitung folgt der EU-Index als Tageswert, die Ausbreitung stündlich',
    hourFollow('fireDanger', 3) === 'daily' && hourFollow('fireSpread', 6) === 'hourly');
  add('SF1: reconcile behält die Stundenachse, solange die Ausbreitung aktiv ist',
    reconcileFireTime({ day: 0, windowH: 24, hour: 4, unit: 'hours' }, ['fireSpread']).unit === 'hours');
  add('clampHour klemmt auf den gemeinsamen Stundenhorizont',
    clampHour(20, ['fireWeather']) === 6 && clampHour(-2, ['fireWeather']) === 0
      && clampHour(Number.NaN, ['fireWeather']) === 0 && clampHour(4.4, ['fireWeather']) === 4);
  const hrs: FireTimeState = { day: 0, windowH: 24, hour: 5, unit: 'hours' };
  add('reconcile: Stundenachse bleibt mit RH-Treiber, Stunde bleibt 5',
    reconcileFireTime(hrs, ['fireWeather']) === hrs);
  add('reconcile: ein alter Link mit h=12 wird auf 6 geklemmt',
    reconcileFireTime({ ...hrs, hour: 12 }, ['fireWeather']).hour === 6);
  add('reconcile: RH-Treiber aus ⇒ zurück auf Tage (kein totes h im Permalink)',
    reconcileFireTime(hrs, ['fireDanger']).unit === 'days');
  add('hasTimeSlider: Stunden nur mit Stundenframes, Tage wie gehabt',
    hasTimeSlider(['fireWeather'], 'hours') === true && hasTimeSlider(['fireDanger'], 'hours') === false
      && hasTimeSlider(['fireDanger'], 'days') === true && hasTimeSlider(['fireWind'], 'days') === false);
  // Der Tag, in den „jetzt + h" fällt — UTC, wie dayToIsoDate.
  add('dayOfHour: mittags + 6 h ist noch heute, 18:00 + 6 h (Mitternacht) ist morgen — wie dayToIsoDate',
    dayOfHour(6, now) === 0 && dayOfHour(6, Date.UTC(2026, 7, 14, 18, 0)) === 1
      && dayToIsoDate(dayOfHour(6, Date.UTC(2026, 7, 14, 18, 0)), Date.UTC(2026, 7, 14, 18, 0))
        === new Date(Date.UTC(2026, 7, 15, 0, 0)).toISOString().slice(0, 10));
  add('dayOfHour: 22:30 UTC + 3 h ist morgen', dayOfHour(3, Date.UTC(2026, 7, 14, 22, 30)) === 1);
  add('dayOfHour: Stunde 0 ist immer heute', dayOfHour(0, Date.UTC(2026, 7, 14, 23, 59)) === 0);
  add('hourLabel: jetzt / +3 h', hourLabel(0) === 'jetzt' && hourLabel(3) === '+3 h');
  // Ehrlichkeit dreistufig: folgt stündlich / als Tageswert / gar nicht.
  add('hourFollow: RH-Treiber und Wind stündlich bis 6, EU-Index Tageswert, Schutzgebiete gar nicht',
    hourFollow('fireWeather', 6) === 'hourly' && hourFollow('fireWind', 6) === 'hourly'
      && hourFollow('fireDanger', 3) === 'daily' && hourFollow('fireContext', 3) === 'none'
      && hourFollow('fireHotspots', 1) === 'none');
  add('hourFollow: auf Stunde 0 folgt alles (gilt für jetzt)',
    hourFollow('fireContext', 0) === 'hourly' && hourFollow('fireDanger', 0) === 'hourly');
  add('laggingLayers auf der Stundenachse nennt nur die stehenden Layer (Wind läuft mit)',
    laggingLayers(['fireDanger', 'fireWeather', 'fireWind', 'fireHotspots', 'fireContext'], 4, 'hours').join(',') === 'fireHotspots,fireContext'
      && dailyOnlyLayers(['fireDanger', 'fireWeather', 'fireWind'], 4).join(',') === 'fireDanger');
  add('laggingLayers ohne Einheit = Tagesachse (Verhalten vor WF3)',
    laggingLayers(['fireDanger', 'fireWind'], 1).join(',') === laggingLayers(['fireDanger', 'fireWind'], 1, 'days').join(','));

  // --- Vollständigkeit: kein Layer ohne Zeitmodell.
  const all: FireLayerId[] = [
    'fireDanger', 'fireHotspots', 'fireWeather',
    'fireDrought', 'fireVegetation', 'fireFuel', 'fireBurnt', 'fireContext',
    'fireWind', 'fireSoilDryness', 'fireFootprints',
  ];
  add('jeder Layer hat ein Zeitmodell', all.every((l) => !!FIRE_LAYER_TIME[l]));
  // BP2: die Registry teilt das Fenster der Hotspots — kein zweites Zeitmodell.
  add('Brandflächen (Registry) haben dasselbe Fenster wie die Hotspots',
    windowChoices(['fireFootprints']).join(',') === windowChoices(['fireHotspots']).join(',')
    && windowChoices(['fireFootprints', 'fireHotspots']).join(',') === '24,168');
  add('maxDay ist bei instant/window immer 0',
    all.every((l) => FIRE_LAYER_TIME[l].mode === 'forecast' || FIRE_LAYER_TIME[l].maxDay === 0));
  add('maxHour ist nie größer als die Stundenachse und bei hourly gesetzt',
    all.every((l) => (FIRE_LAYER_TIME[l].maxHour ?? 0) <= HOUR_AXIS_MAX
      && (FIRE_LAYER_TIME[l].mode !== 'hourly' || (FIRE_LAYER_TIME[l].maxHour ?? 0) > 0)));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
