/**
 * DWD weather alerts via BrightSky `/alerts` — point-query of the active
 * warnings for a (lat, lng). BrightSky maps each lat/lng to its DWD warn-cell
 * and returns whatever alerts are valid there right now plus the upcoming
 * 6 h. Free, no API key, no rate limit, commercial OK.
 *
 * Alert severity (DWD nomenclature):
 *   1 Vorabinformation
 *   2 Wetterwarnung      — typical: wind 50–70 km/h, snow, frost
 *   3 markantes Wetter   — wind 70–85 km/h, heavy rain
 *   4 Unwetterwarnung    — wind 85–100, heavy snow, ice rain
 *   5 extremes Unwetter  — wind > 130, flooding, blizzards
 * Higher number = more dangerous.
 */

export type DwdAlertSeverity = 'Minor' | 'Moderate' | 'Severe' | 'Extreme';

export interface DwdAlert {
  alertId: string;
  headline: string;            // short headline e.g. "Amtliche WARNUNG vor STURMBÖEN"
  description?: string;        // long description
  instruction?: string;        // recommendation
  event: string;               // event tag e.g. "Sturmböen"
  eventCode?: number;
  severity: DwdAlertSeverity;
  urgency: 'Immediate' | 'Future' | 'Past' | 'Unknown';
  level: number;               // 1..5 DWD severity level
  /** ISO timestamps */
  effective: string;
  onset: string;
  expires: string;
}

export interface DwdAlertsResult {
  alerts: DwdAlert[];
  location: {
    name: string;
    state: string;
    warnCellId: number;
  } | null;
  fetchedAt: number;
}

interface BrightSkyAlertRaw {
  alert_id: string;
  headline?: string;
  description?: string;
  instruction?: string;
  event_en?: string;
  event_de?: string;
  event_code?: number;
  severity?: string;
  urgency?: string;
  /**
   * DWD severity level — BrightSky exposes it as a number 1..5. 1 means
   * Vorabinformation, 5 means extremes Unwetter.
   */
  category?: string;
  /** ISO timestamps */
  effective?: string;
  onset?: string;
  expires?: string;
}

interface BrightSkyAlertsResponse {
  alerts: BrightSkyAlertRaw[];
  location?: {
    name?: string;
    state?: string;
    warn_cell_id?: number;
  };
}

/** Fetch active + near-future warnings for a single point. */
export async function fetchDwdAlerts(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<DwdAlertsResult> {
  const url = `https://api.brightsky.dev/alerts?lat=${lat.toFixed(3)}&lon=${lng.toFixed(3)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`BrightSky alerts HTTP ${res.status}`);
  const data = (await res.json()) as BrightSkyAlertsResponse;

  const alerts: DwdAlert[] = (data.alerts ?? []).map((a) => ({
    alertId: a.alert_id,
    headline: a.headline ?? a.event_de ?? a.event_en ?? 'Wetterwarnung',
    description: a.description,
    instruction: a.instruction,
    event: a.event_de ?? a.event_en ?? '',
    eventCode: a.event_code,
    severity: mapSeverity(a.severity),
    urgency: mapUrgency(a.urgency),
    level: severityToLevel(a.severity),
    effective: a.effective ?? '',
    onset: a.onset ?? '',
    expires: a.expires ?? '',
  }));
  // Sort: highest level first, then nearest onset.
  alerts.sort((a, b) => b.level - a.level || a.onset.localeCompare(b.onset));

  return {
    alerts,
    location: data.location
      ? {
          name: data.location.name ?? '',
          state: data.location.state ?? '',
          warnCellId: data.location.warn_cell_id ?? 0,
        }
      : null,
    fetchedAt: Date.now(),
  };
}

function mapSeverity(raw: string | undefined): DwdAlertSeverity {
  switch (raw) {
    case 'Minor': return 'Minor';
    case 'Moderate': return 'Moderate';
    case 'Severe': return 'Severe';
    case 'Extreme': return 'Extreme';
    default: return 'Minor';
  }
}

function mapUrgency(raw: string | undefined): DwdAlert['urgency'] {
  switch (raw) {
    case 'Immediate':
    case 'Future':
    case 'Past':
      return raw;
    default: return 'Unknown';
  }
}

function severityToLevel(s: string | undefined): number {
  switch (s) {
    case 'Minor': return 2;          // Wetterwarnung
    case 'Moderate': return 3;       // markantes Wetter
    case 'Severe': return 4;         // Unwetterwarnung
    case 'Extreme': return 5;        // extremes Unwetter
    default: return 1;               // Vorabinformation
  }
}

/** Background colour per DWD severity level — matches the WarnWetter app. */
export function severityColor(level: number): string {
  switch (level) {
    case 5: return '#7e0028';    // dark red — extremes Unwetter
    case 4: return '#cc0000';    // red — Unwetter
    case 3: return '#ff7f00';    // orange — markant
    case 2: return '#ffcc00';    // yellow — Warnung
    default: return '#9ec5e5';   // light blue — Vorabinfo
  }
}
