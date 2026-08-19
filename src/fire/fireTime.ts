/**
 * Waldbrand DACH — Zeitmodell (pur, DOM-frei, headless verifizierbar nach D-12).
 *
 * ── Das Problem, das dieses Modul löst ───────────────────────────────────────
 * Die Waldbrand-Layer haben **fünf verschiedene Zeitsemantiken** — mehr als
 * jede bisherige Phase (`architecture.md` §14.3):
 *
 *   EU-Gefahrenindex   `forecast`  Tag 0 … +9   (GWIS, WMS-TIME-Dimension)
 *   DWD WBI/GLFI       `forecast`  Tag 0 … +6   (Spalten wbi_0…wbi_6)
 *   BAFU CH-Stufe      `instant`   nur jetzt    (Mo–Fr nach Mittag)
 *   Hotspots           `window`    rückwärts    (24 h bzw. 7 d)
 *   ICON-D2-Treiber    `forecast`  Tag 0 … +1   (0…+24 h in Tagesschritten)
 *
 * Ein **gemeinsamer** Regler muss auf den kleinsten gemeinsamen Horizont der
 * gerade aktiven Layer klemmen — sonst zieht der Nutzer auf Tag +7 und drei von
 * vier Layern zeigen still ihren letzten Stand weiter, ohne das zu sagen.
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
  | 'forecast';  // Tagesschritte vorwärts ab heute

export interface FireLayerTime {
  mode: FireTimeMode;
  /** Größter erreichbarer Tagesschritt (0 = nur heute). Bei `window`/`instant` 0. */
  maxDay: number;
  /** Für `window`: die wählbaren Rückblickfenster in Stunden. */
  windowsH?: readonly number[];
}

/**
 * Das Zeitverhalten je Layer — gemessen, nicht geraten.
 * Quellen und Belege: `audit/waldbrand-transport.md`, `docs/DATA_SOURCES.md` §W.
 */
export const FIRE_LAYER_TIME: Record<FireLayerId, FireLayerTime> = {
  // GWIS liefert ECMWF-FWI bis +9 Tage (TIME-Dimension 2018-01-01/2099-12-31).
  fireDanger: { mode: 'forecast', maxDay: 9 },
  // DE: wbi_0…wbi_6 ⇒ +6. CH ist `instant` — der gemeinsame Nenner ist der
  // kleinere; deshalb steht hier 6 und die CH-Fläche friert ab Tag 1 sichtbar ein.
  fireIndexNational: { mode: 'forecast', maxDay: 6 },
  // Rückblick statt Vorhersage: .today = 24 h, .week = 7 d (GWIS-Typenamen).
  fireHotspots: { mode: 'window', maxDay: 0, windowsH: [24, 168] },
  // ICON-D2 reicht ~+24 h ⇒ heute und morgen.
  fireWeather: { mode: 'forecast', maxDay: 1 },
  // Feuerverbote gelten, bis sie geändert werden — kein Vorhersageprodukt.
  fireBans: { mode: 'instant', maxDay: 0 },
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
   *    `sharedMaxDay` übergangen, genau wie die Feuerverbote.
   *
   * Die Ehrlichkeit trägt damit `followsSlider`/`laggingLayers`: ab Tag 1 steht
   * an der Zeile „gilt für heute — folgt dem Tagesregler nicht". Gefüttert wird
   * die Karte immer mit `Date.now()`, nie mit einer geklemmten Zukunft.
   */
  fireWind: { mode: 'instant', maxDay: 0 },
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
   * Regler behalten.
   */
  fireSoilDryness: { mode: 'forecast', maxDay: 1 },
  /**
   * BP2 — die Brandflächen der Registry. Sie fassen die Detektionen des
   * ANGEZEIGTEN Rückblickfensters je Brand zusammen — also dasselbe Fenster
   * wie die Hotspots (24 h / 7 d), kein eigenes. Ist der Hotspot-Layer aus,
   * trägt dieser Layer den Fensterschalter allein.
   */
  fireFootprints: { mode: 'window', maxDay: 0, windowsH: [24, 168] },
};

/** Millisekunden eines Tages — als Konstante, damit die Zahl nur einmal dasteht. */
const DAY_MS = 86_400_000;

export interface FireTimeState {
  /** Gewählter Tagesschritt ab heute (0 = heute). */
  day: number;
  /** Gewähltes Rückblickfenster in Stunden (nur für `window`-Layer). */
  windowH: number;
}

export function defaultFireTimeState(): FireTimeState {
  return { day: 0, windowH: 24 };
}

/**
 * Der kleinste gemeinsame Horizont der aktiven Layer.
 *
 * Reine `instant`- und `window`-Layer werden **übergangen**, nicht mitgezählt:
 * sonst klemmte ein zugeschalteter Feuerverbots-Layer den ganzen Regler auf
 * Tag 0 und der EU-Index verlöre seine neun Tage, obwohl er sie hat.
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
 * Zieht den Zustand nach, wenn sich die aktiven Layer geändert haben.
 *
 * Der Fall, der ohne das hier schiefgeht: Der Nutzer steht auf Tag +8 (EU-Index
 * allein), schaltet die amtliche Landesstufe zu — deren Horizont ist +6. Ohne
 * Klemmung stünde der Regler auf einem Tag, den niemand mehr liefert.
 */
export function reconcileFireTime(
  state: FireTimeState,
  active: readonly FireLayerId[],
): FireTimeState {
  const day = clampDay(state.day, active);
  const windows = windowChoices(active);
  const windowH = windows.includes(state.windowH) ? state.windowH : (windows[0] ?? state.windowH);
  return day === state.day && windowH === state.windowH ? state : { day, windowH };
}

/** Die Rückblickfenster, die die aktiven Layer anbieten (leer, wenn keiner). */
export function windowChoices(active: readonly FireLayerId[]): readonly number[] {
  for (const l of active) {
    const t = FIRE_LAYER_TIME[l];
    if (t.mode === 'window' && t.windowsH?.length) return t.windowsH;
  }
  return [];
}

/** Ist der Vorhersage-Regler überhaupt sinnvoll? */
export function hasForecastSlider(active: readonly FireLayerId[]): boolean {
  return sharedMaxDay(active) > 0;
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
 * Das ist die Ehrlichkeitsfunktion des Moduls: Ein `instant`-Layer (CH-Stufe,
 * Feuerverbote) bleibt stehen, während die EU-Fläche weiterläuft. Die UI muss
 * das sagen können — „gilt für heute, folgt dem Regler nicht" — statt eine
 * eingefrorene Fläche als Vorhersage aussehen zu lassen (D-04).
 */
export function followsSlider(layer: FireLayerId, day: number): boolean {
  const t = FIRE_LAYER_TIME[layer];
  if (t.mode !== 'forecast') return day === 0;
  return day <= t.maxDay;
}

/** Layer, die beim aktuellen Reglerstand NICHT mitlaufen (für den Hinweistext). */
export function laggingLayers(active: readonly FireLayerId[], day: number): FireLayerId[] {
  return active.filter((l) => !followsSlider(l, day));
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
  add('amtliche Stufe allein: 6 Tage', sharedMaxDay(['fireIndexNational']) === 6);
  add('ICON-Treiber allein: 1 Tag', sharedMaxDay(['fireWeather']) === 1);
  add('EU + amtlich ⇒ kleinster gemeinsamer Horizont 6',
    sharedMaxDay(['fireDanger', 'fireIndexNational']) === 6);
  add('EU + Treiber ⇒ 1', sharedMaxDay(['fireDanger', 'fireWeather']) === 1);

  // Der Fall, für den die Filterung da ist: instant/window dürfen den Regler
  // nicht auf 0 ziehen, sonst verliert der EU-Index seine neun Tage.
  add('Feuerverbote (instant) klemmen den Regler NICHT auf 0',
    sharedMaxDay(['fireDanger', 'fireBans']) === 9);
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
    sharedMaxDay(['fireBans', 'fireHotspots']) === 0
      && hasForecastSlider(['fireBans', 'fireHotspots']) === false);
  add('leere Auswahl ⇒ Horizont 0', sharedMaxDay([]) === 0);

  // --- Klemmung
  add('clampDay begrenzt nach oben', clampDay(12, ['fireDanger']) === 9);
  add('clampDay begrenzt nach unten', clampDay(-3, ['fireDanger']) === 0);
  add('clampDay rundet', clampDay(2.6, ['fireDanger']) === 3);
  add('clampDay verträgt NaN', clampDay(Number.NaN, ['fireDanger']) === 0);

  // DER Regressionsanker: Zuschalten eines kürzeren Layers zieht den Regler nach.
  const at8 = { day: 8, windowH: 24 };
  add('Tag 8 + amtliche Stufe zugeschaltet ⇒ auf 6 nachgezogen',
    reconcileFireTime(at8, ['fireDanger', 'fireIndexNational']).day === 6,
    String(reconcileFireTime(at8, ['fireDanger', 'fireIndexNational']).day));
  add('unveränderter Zustand wird identisch zurückgegeben (kein Render-Sturm)',
    reconcileFireTime(at8, ['fireDanger']) === at8);

  // --- Fenster
  add('Hotspots bieten 24 h und 7 d', windowChoices(['fireHotspots']).join(',') === '24,168');
  add('ohne Hotspots gibt es keine Fensterwahl', windowChoices(['fireDanger']).length === 0);
  add('unpassendes Fenster wird auf das erste gültige gezogen',
    reconcileFireTime({ day: 0, windowH: 999 }, ['fireHotspots']).windowH === 24);

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
  add('Feuerverbote folgen nur auf Tag 0',
    followsSlider('fireBans', 0) === true && followsSlider('fireBans', 1) === false);
  add('Hotspots folgen nur auf Tag 0',
    followsSlider('fireHotspots', 0) === true && followsSlider('fireHotspots', 3) === false);
  add('Wind folgt nur auf Tag 0 und sagt das ab Tag 1',
    followsSlider('fireWind', 0) === true && followsSlider('fireWind', 1) === false
      && laggingLayers(['fireDanger', 'fireWind'], 1).join(',') === 'fireWind');
  add('laggingLayers nennt auf Tag 0 niemanden',
    laggingLayers(['fireDanger', 'fireBans', 'fireHotspots'], 0).length === 0);
  add('laggingLayers nennt auf Tag 2 genau die stehenden Layer',
    laggingLayers(['fireDanger', 'fireBans', 'fireHotspots'], 2).join(',') === 'fireBans,fireHotspots',
    laggingLayers(['fireDanger', 'fireBans', 'fireHotspots'], 2).join(','));

  // --- Vollständigkeit: kein Layer ohne Zeitmodell.
  const all: FireLayerId[] = [
    'fireDanger', 'fireIndexNational', 'fireHotspots', 'fireWeather', 'fireBans',
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

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
