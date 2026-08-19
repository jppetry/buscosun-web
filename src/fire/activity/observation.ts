/**
 * **Beobachtungsgelegenheit** — war „kein Signal" eine Aussage über das Feuer
 * oder über die Wolken? (Phase AF2, Gate GAF2, `audit/aktivfeuer.md` §5,
 * Konzept §5.6).
 *
 * ── Das Problem ─────────────────────────────────────────────────────────────
 * Das Fehlen einer Detektion ist keine Aussage über das Feuer. Bewölkung
 * blockiert die Aktiv-Feuer-Detektion genauso wie eine Kartierung. Ein Brand,
 * der als „kein Signal seit 30 h" geführt wird, kann seit 30 h unter einer
 * Wolkendecke brennen. Das ist der wahrscheinlichste inhaltliche Fehler des
 * ganzen Moduls — deshalb bekommt jedes „kein Signal" eine Qualifikation.
 *
 * ── Was hier geprüft wird (und was nicht) ───────────────────────────────────
 * **Regionale Aktivität** (Konzept §5.6, Stufe 1): Gab es NACH der letzten
 * Detektion dieses Brands Überflüge, bei denen der Sensor **im Umkreis von
 * `REGIONAL_RADIUS_KM`** andere Detektionen lieferte? Dann arbeitete er und
 * hatte in der Region zumindest teilweise freie Sicht ⇒ `confirmed` (Feuer
 * vermutlich unter der Schwelle oder aus). Sonst `unobserved` — keine Aussage.
 *
 * Das ist ein **grober Proxy**: regionale Sicht ist nicht lokale Sicht, und
 * ohne jede Detektion in der Region wissen wir nicht einmal, ob überflogen
 * wurde (Überflüge sind nur über ihre Detektionen bekannt). Beides steht in der
 * Beschriftung. **DWD-Bewölkung** (Stufe 2) ist NICHT angeschlossen — der
 * Client hält nur Vorhersage-Frames des aktuellen ICON-D2-Laufs, vergangene
 * Überflugzeiten sind nicht abgedeckt (Jan, 2026-08-18, Frage 8).
 *
 * Die Eingabe sind dieselben Zeilen, die die Karte zeigt (DACH-Ausschnitt);
 * am Rand des Ausschnitts ist der 150-km-Umkreis beschnitten — noch ein Grund,
 * das Ergebnis als Proxy zu lesen.
 *
 * Pur, DOM-frei, ohne `Date.now()` — `npm run verify:fire-activity`.
 */

import type { FirmsRow } from '../sources/firmsHotspots';
import { PASS_GAP_MS } from './overpasses';
import type { ObservationQuality } from './fireActivity';

/** Konzept §9 `regional_activity_radius_km`. */
export const REGIONAL_RADIUS_KM = 150;
const CELL_DEG = 1;
const M_PER_DEG = 111_320;

/** Detektionen EINES Überflugs (Satellit × 10-min-Slot) in EINER 1°-Zelle — Punkte flach als lat,lon,lat,lon,… */
interface PassCell { key: string; pts: number[] }

export interface ObservationIndex {
  /** 1°-Zellen → Überflüge in der Zelle mit ihren Punkten. */
  cells: ReadonlyMap<string, readonly PassCell[]>;
  /** Je Überflug (über ALLE Zellen): früheste und späteste Detektionszeit. */
  passFirstMs: ReadonlyMap<string, number>;
  passLastMs: ReadonlyMap<string, number>;
  rows: number;
}

const cellKey = (lat: number, lon: number) => `${Math.floor(lat / CELL_DEG)},${Math.floor(lon / CELL_DEG)}`;
const passKey = (r: { satellite: string; acqMs: number }) => `${r.satellite || ''}|${Math.floor(r.acqMs / PASS_GAP_MS)}`;

/**
 * Einmal je Zeilensatz bauen (Fensterwechsel ⇒ neu). Gruppiert je Zelle nach
 * Überflug, damit die Abfrage einen schon gesehenen oder zu frühen Überflug
 * ohne Zeilenscan überspringt — bei 7 Tagen (≈ 7 000 Zeilen, ≈ 900 Einträge
 * ohne Signal) ist das der Unterschied zwischen einem Long Task und keinem.
 */
export function buildObservationIndex(rows: readonly FirmsRow[]): ObservationIndex {
  const cells = new Map<string, PassCell[]>();
  const byCellPass = new Map<string, PassCell>();
  const passFirstMs = new Map<string, number>();
  const passLastMs = new Map<string, number>();
  for (const r of rows) {
    const pk = passKey(r);
    const ck = cellKey(r.lat, r.lon);
    const cpk = `${ck}#${pk}`;
    let pc = byCellPass.get(cpk);
    if (!pc) {
      pc = { key: pk, pts: [] };
      byCellPass.set(cpk, pc);
      const l = cells.get(ck); if (l) l.push(pc); else cells.set(ck, [pc]);
    }
    pc.pts.push(r.lat, r.lon);
    const f = passFirstMs.get(pk); if (f == null || r.acqMs < f) passFirstMs.set(pk, r.acqMs);
    const g = passLastMs.get(pk); if (g == null || r.acqMs > g) passLastMs.set(pk, r.acqMs);
  }
  return { cells, passFirstMs, passLastMs, rows: rows.length };
}

export interface Observation {
  quality: ObservationQuality;
  /** Überflüge (Satellit × 10-min-Slot), die mehr als 10 min NACH der letzten Detektion begannen und Detektionen im Umkreis haben. */
  laterPassesSeen: number;
  /** Zeit des jüngsten solchen Überflugs, `null` wenn keiner. */
  latestSeenMs: number | null;
  note: string;
}

/**
 * Für einen Brand ohne aktuelles Signal: gab es seit `lastMs` Überflüge mit
 * Sicht in der Region? Zählt Überflüge, deren Detektionen im Umkreis liegen.
 * Der Überflug, der die letzte Detektion des Brands selbst lieferte, zählt
 * nicht — er begann spätestens bei `lastMs`; deshalb zählt ein Überflug erst,
 * wenn seine früheste Detektion mehr als eine Überflug-Spanne (10 min) nach
 * `lastMs` liegt (ein an der Slot-Grenze geteilter Überflug fällt so nicht
 * fälschlich als „späterer" hinein; der nächste Satellit folgt ≈ 50 min später).
 */
export function observationFor(idx: ObservationIndex, lat: number, lon: number, lastMs: number, radiusKm = REGIONAL_RADIUS_KM): Observation {
  const seen = new Set<string>();
  const radiusM = radiusKm * 1000;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dLatMax = radiusM / M_PER_DEG;
  const dLonMax = radiusM / (M_PER_DEG * Math.max(0.2, cosLat));
  const spanY = Math.ceil(dLatMax / CELL_DEG);
  const spanX = Math.ceil(dLonMax / CELL_DEG);
  const cx = Math.floor(lon / CELL_DEG); const cy = Math.floor(lat / CELL_DEG);
  const minFirstMs = lastMs + PASS_GAP_MS;
  let latestSeenMs: number | null = null;
  for (let dy = -spanY; dy <= spanY; dy++) {
    for (let dx = -spanX; dx <= spanX; dx++) {
      const list = idx.cells.get(`${cy + dy},${cx + dx}`);
      if (!list) continue;
      for (const pc of list) {
        if (seen.has(pc.key)) continue;
        const first = idx.passFirstMs.get(pc.key);
        if (first == null || first <= minFirstMs) continue;
        const pts = pc.pts;
        for (let i = 0; i < pts.length; i += 2) {
          const dLat = pts[i] - lat; if (dLat > dLatMax || dLat < -dLatMax) continue;
          const dLon = pts[i + 1] - lon; if (dLon > dLonMax || dLon < -dLonMax) continue;
          if (Math.hypot(dLat * M_PER_DEG, dLon * M_PER_DEG * cosLat) > radiusM) continue;
          seen.add(pc.key);
          const last = idx.passLastMs.get(pc.key) ?? first;
          if (latestSeenMs == null || last > latestSeenMs) latestSeenMs = last;
          break;
        }
      }
    }
  }
  const laterPassesSeen = seen.size;
  if (laterPassesSeen > 0) {
    return {
      quality: 'confirmed', laterPassesSeen, latestSeenMs,
      note: `seit der letzten Detektion ${laterPassesSeen} Überflug${laterPassesSeen === 1 ? '' : 'e'} mit Detektionen im Umkreis von ${radiusKm} km, hier keine — der Sensor hatte in der Region Sicht; lokale Bewölkung ist damit nicht ausgeschlossen`,
    };
  }
  return {
    quality: 'unobserved', laterPassesSeen: 0, latestSeenMs: null,
    note: `seit der letzten Detektion kein Überflug mit Detektionen im Umkreis von ${radiusKm} km — ob überflogen wurde und ob Sicht bestand, ist aus den Daten nicht ablesbar; keine Aussage über das Feuer`,
  };
}

export const OBSERVATION_LABEL: Record<ObservationQuality, string> = {
  confirmed: 'kein Signal — Sicht in der Region gegeben',
  unobserved: 'kein Signal — nicht beobachtbar (Sicht/Überflug unbekannt)',
};

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface ObservationCheck { name: string; ok: boolean; detail?: string }

function row(lat: number, lon: number, acqMs: number, satellite = 'N'): FirmsRow {
  return {
    lat, lon, acqMs, frp: 5, confidence: 'nominal', brightTi4: 320, brightTi5: 290,
    scanKm: 0.4, trackKm: 0.4, satellite, day: false, source: 'VIIRS_SNPP_NRT',
  };
}

export function verifyObservation(): { checks: ObservationCheck[]; passed: number; total: number } {
  const checks: ObservationCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const H = 3_600_000; const t0 = Date.UTC(2026, 7, 15, 1, 30);
  // Brand bei 48/11, letzte Detektion t0. Danach: ein Überflug mit Detektion 80 km östlich (t0+12h),
  // einer 400 km entfernt (t0+13h), einer VOR t0 (irrelevant).
  const rows = [row(48, 11, t0), row(48, 12.1, t0 + 12 * H), row(52, 8, t0 + 13 * H, 'N20'), row(48.5, 11, t0 - 5 * H)];
  const idx = buildObservationIndex(rows);
  const o = observationFor(idx, 48, 11, t0);
  add('späterer Überflug mit Detektion 80 km entfernt ⇒ confirmed, 1 Überflug gezählt',
    o.quality === 'confirmed' && o.laterPassesSeen === 1 && o.latestSeenMs === t0 + 12 * H, JSON.stringify(o));
  add('400 km entfernte und frühere Detektionen zählen nicht',
    observationFor(buildObservationIndex([rows[0], rows[2], rows[3]]), 48, 11, t0).quality === 'unobserved');
  add('ohne spätere Detektion im Umkreis ⇒ unobserved mit ehrlicher Note',
    /keine Aussage/.test(observationFor(buildObservationIndex([rows[0]]), 48, 11, t0).note));
  add('zwei Detektionen desselben Überflugs (gleicher Satellit, gleiche 10 min) zählen als EIN Überflug',
    observationFor(buildObservationIndex([row(48, 12.1, t0 + 12 * H), row(48.2, 12.1, t0 + 12 * H + 60_000)]), 48, 11, t0).laterPassesSeen === 1);
  add('zwei Satelliten ⇒ zwei Überflüge',
    observationFor(buildObservationIndex([row(48, 12.1, t0 + 12 * H, 'N'), row(48, 12.1, t0 + 12 * H, 'N21')]), 48, 11, t0).laterPassesSeen === 2);
  add('die Note nennt den Vorbehalt „lokale Bewölkung nicht ausgeschlossen"', /lokale Bewölkung/.test(o.note));
  // Der Überflug, der die letzte Detektion selbst lieferte, ist kein „späterer": eine Zeile desselben
  // Satelliten 4 min nach lastMs, 60 km entfernt, zählt nicht — erst ein Überflug > 10 min danach.
  add('eine Zeile desselben Überflugs kurz nach der letzten Detektion (4 min, 60 km) zählt NICHT als späterer Überflug',
    observationFor(buildObservationIndex([row(48, 11, t0), row(48, 11.8, t0 + 4 * 60_000)]), 48, 11, t0).quality === 'unobserved');
  add('ein anderer Satellit 50 min später mit Sicht in 60 km ⇒ confirmed',
    observationFor(buildObservationIndex([row(48, 11, t0), row(48, 11.8, t0 + 50 * 60_000, 'N20')]), 48, 11, t0).quality === 'confirmed');
  add('Index kennt Erst- und Letztzeit je Überflug (global über Zellen)',
    (() => { const i = buildObservationIndex([row(48, 11, t0), row(50, 14, t0 + 3 * 60_000)]); const k = [...i.passFirstMs.keys()][0]; return i.passFirstMs.size === 1 && i.passFirstMs.get(k) === t0 && i.passLastMs.get(k) === t0 + 3 * 60_000; })());
  add('Radius ist 150 km (Konzept)', REGIONAL_RADIUS_KM === 150);
  add('Labels: „kein Signal" steht in beiden, „erloschen" in keinem',
    /kein Signal/.test(OBSERVATION_LABEL.confirmed) && /kein Signal/.test(OBSERVATION_LABEL.unobserved)
    && !/erloschen/.test(OBSERVATION_LABEL.confirmed + OBSERVATION_LABEL.unobserved));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
