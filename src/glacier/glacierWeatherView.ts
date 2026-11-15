/**
 * Phase GW — pure view rules of the card "Wetter am Gletscher" (`GlacierWeatherCard.tsx`): which row and which position in it
 * the card shows, or the reason it shows nothing. DOM-free, so the verifier reads the same rules as the page.
 */
import {
  GLACIER_WEATHER_DAYS, GLACIER_WEATHER_FRESH_MS, glacierWeatherFresh, type GlacierWeatherDoc, type GlacierWeatherRow,
} from './glacierWeatherContract';

const H = 3_600_000;
const COMPASS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
/** Compass word of a direction the wind blows FROM. */
export const compassOf = (deg: number): string => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

const SKIP_TEXT: Record<string, string> = {
  elevations: 'die mittlere Höhe des Katalogs liegt außerhalb der Höhenbänder',
  'temperature-gaps': 'die Temperatur hat Lücken',
  'no-quantiles': 'die Antwort trägt keine Spanne der Temperatur',
};
/** Wording of a skip reason of the producer. */
export const weatherSkipText = (reason: string): string =>
  SKIP_TEXT[reason] ?? (reason.startsWith('few-hours') ? 'für Wind, Niederschlag oder Bewölkung fehlen zu viele Stunden' : 'der Lauf nennt einen Fehler');

export type WeatherView = { row: GlacierWeatherRow; day: number; hour: number; t0Ms: number } | { why: string };

/** The row of glacier `id` and where "now" lies in it (`hour` from the run hour, `day` = its 24-h block), or the reason there is nothing to show. */
export function weatherView(doc: GlacierWeatherDoc | null, id: string, nowMs: number): WeatherView {
  if (!doc) return { why: 'Das Wetter am Gletscher ist nicht ladbar.' };
  const runMs = Date.parse(doc.runAt);
  if (!glacierWeatherFresh(runMs, nowMs)) return { why: `Der letzte Lauf ist ${Math.round((nowMs - runMs) / H)} Stunden alt (Grenze ${GLACIER_WEATHER_FRESH_MS / H} Stunden).` };
  const row = doc.glaciers.find((r) => r.id === id);
  if (!row) {
    const s = doc.skipped.find((x) => x.id === id);
    return { why: s ? `In diesem Lauf fehlt dieser Gletscher: ${weatherSkipText(s.reason)}.` : 'Für diesen Gletscher gibt es in diesem Lauf keine Zeile.' };
  }
  const t0Ms = Math.floor(runMs / H) * H;
  const hour = Math.floor((nowMs - t0Ms) / H);
  return { row, t0Ms, hour, day: Math.min(GLACIER_WEATHER_DAYS - 1, Math.max(0, Math.floor(hour / 24))) };
}
