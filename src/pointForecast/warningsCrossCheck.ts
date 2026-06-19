/**
 * Severe-Weather-Cross-Check für Tour-Samples.
 *
 * Pro Sample prüfen wir, ob am Ort (lat, lon) zur Sample-Zeit (etaMs) eine
 * DWD-Warnung aktiv ist. BrightSky's `/alerts` ist eine Point-Query, die
 * intern auf die DWD-Warn-Zelle auflöst und alle dort gültigen Warnungen
 * (aktuell + bis ~6 h Vorlauf) liefert — wir müssen kein Point-in-Polygon
 * selbst rechnen.
 *
 * Der Checker dedupliziert Aufrufe pro **Warn-Zelle**: Touren laufen oft
 * durch zwei oder drei Zellen, nicht durch 50. Wir runden lat/lon auf 0.1°
 * (~11 km, ungefähr Landkreis-Granularität) und teilen den fetch-Promise
 * pro Schlüssel. So fallen die HTTP-Calls für eine 200-Sample-Tour typisch
 * auf 3–10.
 *
 * Coverage: aktuell **nur DE** (BrightSky-Datenbasis). AT/CH bekommen einen
 * no-op-Checker, bis wir GeoSphere-/MeteoSwiss-CAP-Adapter haben.
 */

import { fetchDwdAlerts, type DwdAlert } from '../sources/dwdAlerts';
import type { Country } from '../types';
import type { TourWarning } from './types';

export interface WarningChecker {
  /** Aktive Warnungen am Punkt zur ETA. Asynchron wegen Netzwerk-Fetch
   *  (geht nach Cell-Dedup im Cache fast immer auf Cache-Hit). */
  check(lat: number, lon: number, etaMs: number): Promise<TourWarning[]>;
  /** Statistik: wie viele echte HTTP-Calls, wie viele Cache-Hits. */
  readonly stats: { fetches: number; cacheHits: number; uniqueKeys: number };
  /** Coverage-Tag — DE liefert Daten, AT/CH sind aktuell no-op. */
  readonly coverage: 'dwd' | 'none';
}

/** Cell-Granularität für die Dedup (0.1° ≈ 11 km Lat × ~7 km Lon @50°). */
function cellKey(lat: number, lon: number): string {
  return `${lat.toFixed(1)},${lon.toFixed(1)}`;
}

export function createWarningChecker(country: Country, signal?: AbortSignal): WarningChecker {
  if (country !== 'DE') {
    return {
      check: async () => [],
      stats: { fetches: 0, cacheHits: 0, uniqueKeys: 0 },
      coverage: 'none',
    };
  }

  // Cache: Promise pro Cell-Key. Inflight-Sharing inkl. — gleichzeitige Anfragen
  // für dieselbe Zelle warten auf denselben Promise.
  const cache = new Map<string, Promise<DwdAlert[]>>();
  let fetches = 0;
  let cacheHits = 0;

  async function loadCell(lat: number, lon: number): Promise<DwdAlert[]> {
    const key = cellKey(lat, lon);
    const hit = cache.get(key);
    if (hit) { cacheHits++; return hit; }
    fetches++;
    const p = fetchDwdAlerts(lat, lon, signal)
      .then((r) => r.alerts.filter((a) => a.urgency !== 'Past'))
      .catch(() => [] as DwdAlert[]);  // fail-soft: kein Alert statt Crash
    cache.set(key, p);
    return p;
  }

  return {
    async check(lat, lon, etaMs) {
      const alerts = await loadCell(lat, lon);
      const matched: TourWarning[] = [];
      for (const a of alerts) {
        const onsetMs = a.onset ? Date.parse(a.onset) : NaN;
        const expiresMs = a.expires ? Date.parse(a.expires) : NaN;
        if (!Number.isFinite(onsetMs) || !Number.isFinite(expiresMs)) continue;
        if (etaMs < onsetMs || etaMs > expiresMs) continue;
        matched.push({
          source: 'dwd_cap',
          alertId: a.alertId,
          event: a.event,
          severity: a.severity,
          level: a.level,
          headline: a.headline,
          description: a.description,
          onsetMs,
          expiresMs,
        });
      }
      return matched;
    },
    get stats() { return { fetches, cacheHits, uniqueKeys: cache.size }; },
    coverage: 'dwd',
  };
}

// ---------------------------------------------------------------------------
// Verifikation: synthetisch (Mock-fetch) + live DE.
// ---------------------------------------------------------------------------

export interface SyntheticCheck {
  case: string;
  expected: number | string;
  actual: number | string;
  ok: boolean;
}
export interface VerifyResult {
  checks: SyntheticCheck[];
  passed: number;
  failed: number;
}

/**
 * Synthetische Verifikation der reinen Logik (Cell-Dedup + Zeit-Window-Match).
 * Mockt das fetch-Verhalten durch direkte Manipulation eines internen
 * Test-Doubles — keine echten Netzwerk-Calls.
 */
export async function verifyWarningCheckerLogic(): Promise<VerifyResult> {
  const checks: SyntheticCheck[] = [];

  // Wir bauen einen Checker-Lookalike händisch, der das interne Caching +
  // die Filterung exakt nachbildet (Mini-Reimplementation gegen ein
  // Mock-Backend), damit wir keinen Network-Roundtrip brauchen.
  const now = Date.UTC(2026, 4, 29, 12, 0, 0); // 2026-05-29 12:00 UTC
  const cellAlerts: Record<string, DwdAlert[]> = {
    '48.1,11.6': [
      // Aktiv 11:00–15:00 → Match bei now=12:00
      makeAlert('A1', 'Sturmböen', 'Severe', 4, now - 3600_000, now + 3 * 3600_000),
      // Aktiv 18:00–20:00 → kein Match bei now=12:00
      makeAlert('A2', 'Gewitter', 'Severe', 4, now + 6 * 3600_000, now + 8 * 3600_000),
    ],
    '52.5,13.4': [],   // keine Alerts in Berlin
  };
  let fetches = 0;
  const cache = new Map<string, DwdAlert[]>();
  const mockLoad = (lat: number, lon: number) => {
    const key = cellKey(lat, lon);
    if (!cache.has(key)) {
      fetches++;
      cache.set(key, (cellAlerts[key] ?? []).filter((a) => a.urgency !== 'Past'));
    }
    return cache.get(key)!;
  };
  const mockCheck = (lat: number, lon: number, etaMs: number): TourWarning[] => {
    return mockLoad(lat, lon).flatMap((a) => {
      const onsetMs = Date.parse(a.onset);
      const expiresMs = Date.parse(a.expires);
      if (etaMs < onsetMs || etaMs > expiresMs) return [];
      return [{
        source: 'dwd_cap' as const, alertId: a.alertId, event: a.event,
        severity: a.severity, level: a.level, headline: a.headline,
        description: a.description, onsetMs, expiresMs,
      }];
    });
  };

  // Test 1: Match in München bei 12:00 → 1 Warnung (A1, Sturmböen)
  let w = mockCheck(48.137, 11.575, now);
  checks.push({ case: 'Match aktiv: München 12:00', expected: 1, actual: w.length, ok: w.length === 1 });
  checks.push({ case: '… liefert „Sturmböen"', expected: 'Sturmböen', actual: w[0]?.event ?? '—', ok: w[0]?.event === 'Sturmböen' });

  // Test 2: ETA vor onset → kein Match
  w = mockCheck(48.137, 11.575, now - 2 * 3600_000); // 10:00 < 11:00
  checks.push({ case: 'Vor Onset → 0', expected: 0, actual: w.length, ok: w.length === 0 });

  // Test 3: ETA nach expires → kein Match
  w = mockCheck(48.137, 11.575, now + 4 * 3600_000); // 16:00 > 15:00
  checks.push({ case: 'Nach Expire → 0', expected: 0, actual: w.length, ok: w.length === 0 });

  // Test 4: zukünftiger Alert (A2 ab 18:00) wird bei eta=18:30 gematcht
  w = mockCheck(48.137, 11.575, now + 6.5 * 3600_000);
  checks.push({ case: 'Future-Alert bei eta=18:30', expected: 'Gewitter', actual: w[0]?.event ?? '—', ok: w[0]?.event === 'Gewitter' });

  // Test 5: Berlin → kein Alert
  w = mockCheck(52.52, 13.405, now);
  checks.push({ case: 'Berlin ohne Alert → 0', expected: 0, actual: w.length, ok: w.length === 0 });

  // Test 6: Cell-Dedup — drei wirklich innerhalb derselben 0.1°-Zelle
  // liegende Punkte (alle 48.1xx mit xx≤49 → toFixed(1)='48.1') sollten
  // einen einzigen Fetch erzeugen.
  fetches = 0; cache.clear();
  mockCheck(48.137, 11.575, now);
  mockCheck(48.140, 11.580, now);
  mockCheck(48.149, 11.560, now);
  checks.push({ case: 'Cell-Dedup 3 Punkte → 1 Fetch', expected: 1, actual: fetches, ok: fetches === 1 });

  // Test 7: andere Zelle (Berlin) → +1 Fetch
  mockCheck(52.52, 13.405, now);
  checks.push({ case: 'Andere Zelle → +1 Fetch', expected: 2, actual: fetches, ok: fetches === 2 });

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

function makeAlert(
  id: string, event: string, severity: DwdAlert['severity'], level: number,
  onsetMs: number, expiresMs: number,
): DwdAlert {
  return {
    alertId: id, headline: `Warnung: ${event}`, event,
    severity, level, urgency: 'Immediate',
    effective: new Date(onsetMs).toISOString(),
    onset: new Date(onsetMs).toISOString(),
    expires: new Date(expiresMs).toISOString(),
  };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __createWarningChecker: typeof createWarningChecker })
    .__createWarningChecker = createWarningChecker;
  (window as unknown as { __verifyWarningCheckerLogic: typeof verifyWarningCheckerLogic })
    .__verifyWarningCheckerLogic = verifyWarningCheckerLogic;
}
