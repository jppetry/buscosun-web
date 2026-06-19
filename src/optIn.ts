/**
 * Opt-in-Schalter für rate-limitierte / nicht-kommerzielle Fremd-APIs.
 *
 * Projekt-Grundsatz: Open-Meteo & Co. werden NIE als Default-Quelle benutzt,
 * sondern nur, wenn der Nutzer sie bewusst aktiviert (Rate-Limit, Lizenz). Diese
 * winzige localStorage-Hülle hält die Zustimmung pro Anbieter fest.
 */

const OPEN_METEO_KEY = 'buscosun.optin.openMeteo.v1';

export function isOpenMeteoOptIn(): boolean {
  try { return localStorage.getItem(OPEN_METEO_KEY) === '1'; } catch { return false; }
}

export function setOpenMeteoOptIn(on: boolean): void {
  try { localStorage.setItem(OPEN_METEO_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}
