/**
 * Zahlen- und Zeitformat des Dashboards (Phase DB). Deutsch mit Komma (E-DB-6), Tausender mit festem Leerzeichen
 * („2 100 m" wie in der Vorlage), Zeiten in Europe/Berlin (DE/AT/CH teilen die Zeitzone).
 */
export const TZ = 'Europe/Berlin';
const NBSP = ' ';

/** Zahl mit `d` Nachkommastellen, Komma, Tausendertrennung ab 1 000 (feste Leerstelle). `null` ⇒ null. */
export function num(x: number | null | undefined, d = 0): string | null {
  if (x == null || !Number.isFinite(x)) return null;
  const r = Number(x.toFixed(d));
  const neg = r < 0 || Object.is(r, -0) && x < 0;
  const [int, frac] = Math.abs(r).toFixed(d).split('.');
  const grouped = int.length > 3 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) : int;
  const s = frac ? `${grouped},${frac}` : grouped;
  return neg && r !== 0 ? `−${s}` : s;
}

export function withUnit(x: number | null | undefined, d: number, unit: string): string | null {
  const n = num(x, d);
  return n == null ? null : `${n}${unit ? `${NBSP}${unit}` : ''}`;
}

const partsFmt = new Intl.DateTimeFormat('de-DE', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
});

export interface LocalParts { y: number; mo: number; d: number; h: number; mi: number; wd: string; dayKey: string }

const partsCache = new Map<number, LocalParts>();
/** Ortszeit-Teile (Europe/Berlin) eines Zeitpunkts; `dayKey` = JJJJ-MM-TT. */
export function localParts(ms: number): LocalParts {
  const hit = partsCache.get(ms);
  if (hit) return hit;
  const p: Record<string, string> = {};
  for (const x of partsFmt.formatToParts(new Date(ms))) p[x.type] = x.value;
  const out: LocalParts = {
    y: Number(p.year), mo: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute),
    wd: (p.weekday ?? '').replace('.', ''), dayKey: `${p.year}-${p.month}-${p.day}`,
  };
  if (partsCache.size > 4000) partsCache.clear();
  partsCache.set(ms, out);
  return out;
}

/** „Mi 16.09." */
export function dayLabel(ms: number): string {
  const p = localParts(ms);
  return `${p.wd} ${String(p.d).padStart(2, '0')}.${String(p.mo).padStart(2, '0')}.`;
}

/** „14:00" */
export function hhmm(ms: number): string {
  const p = localParts(ms);
  return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
}

/** „18.09. 06:00" */
export function dateTime(ms: number): string {
  const p = localParts(ms);
  return `${String(p.d).padStart(2, '0')}.${String(p.mo).padStart(2, '0')}. ${hhmm(ms)}`;
}

/** Himmelsrichtung (16-teilig, deutsch) einer meteorologischen Richtung (woher). */
export function compass16(deg: number | null | undefined): string | null {
  if (deg == null || !Number.isFinite(deg)) return null;
  const names = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return names[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** Himmelsrichtung, 8-teilig (für Schnittachse und Rose). */
export function compass8(deg: number): string {
  const names = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** Lauf-Kennung „2026092909" ⇒ „09Z". */
export function runLabel(run: string | null | undefined): string | null {
  if (!run) return null;
  const m = /^\d{8}(\d{2})/.exec(run);
  return m ? `${m[1]}Z` : null;
}
