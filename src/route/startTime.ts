/**
 * Start-Zeitpunkt: Zeitzone-Erkennung (Browser), Quick-Optionen, Forecast-
 * Horizont- und Vergangenheits-Erkennung sowie Konvertierung für
 * <input type="datetime-local">.
 */

export const FORECAST_HORIZON_H = 240; // 10 Tage

export type HorizonState = 'past' | 'ok' | 'far_future';

/** Browser-Zeitzone, z. B. „Europe/Berlin". */
export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'lokale Zeit';
  } catch {
    return 'lokale Zeit';
  }
}

export function horizonState(startMs: number, now = Date.now()): HorizonState {
  const diffH = (startMs - now) / 3_600_000;
  if (diffH < -1) return 'past';
  if (diffH > FORECAST_HORIZON_H) return 'far_future';
  return 'ok';
}

export interface QuickOption {
  key: string;
  label: string;
  ms: number;
}

/** Quick-Optionen relativ zu `now`. */
export function quickStartOptions(now = Date.now()): QuickOption[] {
  const base = new Date(now);

  const tomorrowMorning = atTime(addDays(base, 1), 7, 0);
  const nextSaturday = atTime(nextWeekday(base, 6), 9, 0);   // 6 = Samstag
  const nextSaturdayEarly = atTime(nextWeekday(base, 6), 7, 0);

  return [
    { key: 'now', label: 'Jetzt', ms: now },
    { key: 'plus30', label: '+30 min', ms: now + 30 * 60_000 },
    { key: 'tomorrow', label: 'Morgen früh', ms: tomorrowMorning.getTime() },
    { key: 'weekend', label: 'Wochenende', ms: nextSaturday.getTime() },
    { key: 'saturday', label: 'Nächster Sa. früh', ms: nextSaturdayEarly.getTime() },
  ];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function atTime(d: Date, h: number, m: number): Date {
  const r = new Date(d);
  r.setHours(h, m, 0, 0);
  return r;
}
/** Nächster Wochentag (0=So … 6=Sa) ab morgen; heute zählt nicht. */
function nextWeekday(from: Date, weekday: number): Date {
  let r = addDays(from, 1);
  while (r.getDay() !== weekday) r = addDays(r, 1);
  return r;
}

/** Date → "YYYY-MM-DDTHH:mm" in lokaler Zeit (für datetime-local). */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" (lokal) → Epoch-ms. */
export function fromLocalInput(value: string): number {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

/** „Sa, 30.05.2026, 09:00". */
export function formatStart(ms: number): string {
  return new Date(ms).toLocaleString('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
