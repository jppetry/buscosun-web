/**
 * Bewertung einer Detektion / eines Ereignisses — **bewusst klein** (Phase A4, Gate GWBA1).
 *
 * Drei Beschriftungen, keine Zahl, die der Nutzer nicht prüfen kann:
 *
 *   **bestätigt**   — kartierte Brandfläche (EFFIS) ODER amtliche Warnung (MoWaS)
 *                     ODER Copernicus-EMS-Aktivierung. Jede davon mit Quelle im Satz.
 *   **plausibel**   — Persistenz (mehrere Überflüge) und/oder Kontext (GeoSphere-
 *                     Hitze/Gewitter/Sturm in AT, künftig Landbedeckung aus der
 *                     statischen Maske). Kein Nachweis.
 *   **unbestätigt** — nur Satellit, ein Überflug.
 *
 * Dazu, getrennt und ausgegraut: **wahrscheinlich statisch** (Persistenz-
 * Klassifikator aus `fireEvents.ts`) — **von jedem Bestätigungssignal
 * überstimmbar, nie umgekehrt** (Präzedenzfall Varallo, E1: 24 graue
 * Detektionen wurden von einer 47-ha-Kartierung überstimmt).
 *
 * Kein additiver Score, keine Gewichte: der vorhandene Klassifikator ist durch
 * zwei unabhängige Verfahren validiert; ein 14-Signal-Score wäre an zwei
 * Beispielen kalibriert und nur scheinbar genauer (Kickoff A4). Das gilt für
 * **eigene** Gewichte; publizierte Gleichungssysteme (FWI, `src/fire/fwi/`) sind
 * seit 2026-08-19 zugelassen (`audit/waldbrand-forecast.md` §13 (a)) — sie
 * betreffen das Feuerwetter, nicht diese Bestätigungslogik.
 *
 * Pur, DOM-frei — `npm run verify:fire-behoerden`.
 */

import type { BurntPolygon } from './fireCorroboration';
import { corroborationLabel } from './fireCorroboration';
import type { EmsActivation } from './sources/emsActivations';
import { emsLabel } from './sources/emsActivations';
import type { AtWarnContext } from './sources/geosphereWarnContext';
import { contextLabel, fireContextWarnings } from './sources/geosphereWarnContext';

export type AssessmentLevel = 'bestaetigt' | 'plausibel' | 'unbestaetigt';

/** Amtliche Warnung (MoWaS) — Platzhalter-Vertrag für Phase A1; bis dahin immer `null`. */
export interface OfficialWarning {
  /** Ausstellende Stelle (Klarname, `sender_langname`). */
  issuer: string;
  /** Wörtlicher Titel/Text — nie zusammengefasst. */
  headline: string;
  sentMs: number | null;
  identifier: string;
}

export interface AssessmentInput {
  mapped: BurntPolygon | null;
  official: OfficialWarning | null;
  ems: EmsActivation | null;
  /** Aus `fireEvents.ts` — Ereignis-Kennzahlen, falls bekannt. */
  overpasses: number | null;
  suspectedStatic: boolean;
  atContext: AtWarnContext | null;
  /** Reserviert für die statische Landbedeckungsmaske (A4, noch nicht gebaut). */
  landcover: 'natural' | 'artificial' | null;
  /**
   * TA3: bekannter Standort einer Dauerquelle (`anomaly/classify.ts`). `deviating` = das
   * Signal weicht vom Anlagenmuster ab ⇒ bleibt Brand, nicht grau. Fehlt ⇒ keine Aussage.
   */
  site?: { label: string; deviating: boolean } | null;
}

export interface Assessment {
  level: AssessmentLevel;
  /** Anzeigename. */
  label: string;
  /** Begründungen — jede mit Quelle, in Leserichtung. */
  reasons: string[];
  /** Grau zeichnen? Nur wenn statisch UND nicht bestätigt. */
  greyed: boolean;
}

export const LEVEL_LABEL: Record<AssessmentLevel, string> = {
  bestaetigt: 'bestätigt',
  plausibel: 'plausibel',
  unbestaetigt: 'unbestätigt',
};

export function assess(i: AssessmentInput): Assessment {
  const reasons: string[] = [];

  // Bestätigung — jede Quelle einzeln, in Rangfolge der Verlässlichkeit.
  if (i.official) {
    reasons.push(`Amtliche Warnung (${i.official.issuer}): „${i.official.headline}"`);
  }
  if (i.mapped) reasons.push(corroborationLabel(i.mapped));
  if (i.ems) reasons.push(emsLabel(i.ems));
  if (reasons.length) {
    // Bestätigung schlägt die Statik-Graustufe — nie umgekehrt.
    if (i.suspectedStatic) reasons.push('Die Ortsfest-Vermutung ist damit aufgehoben.');
    if (i.site) reasons.push(`Standort einer Dauerquelle (${i.site.label}) — die Standort-Einordnung ist damit aufgehoben.`);
    return { level: 'bestaetigt', label: LEVEL_LABEL.bestaetigt, reasons, greyed: false };
  }

  // Plausibilität — Kontext, kein Nachweis.
  if (i.overpasses != null && i.overpasses >= 2 && !i.suspectedStatic) {
    reasons.push(`${i.overpasses} Überflüge — mehrfach detektiert, kein Nachweis`);
  }
  const atLabel = i.atContext ? contextLabel(i.atContext) : null;
  if (atLabel && fireContextWarnings(i.atContext).length) reasons.push(atLabel);
  if (i.landcover === 'natural') reasons.push('Landbedeckung: natürliche Fläche (statische Maske)');
  if (i.landcover === 'artificial') {
    reasons.push('Landbedeckung CORINE 2018: Industrie-/Abbau-/Deponiefläche — spricht für eine Dauerquelle (Plausibilität, kein Ausschluss)');
  }

  // TA3: ein bekannter Standort macht grau — außer das Signal weicht vom Anlagenmuster ab.
  const siteGrey = !!i.site && !i.site.deviating;
  const greyed = i.suspectedStatic || siteGrey;
  if (i.suspectedStatic) {
    reasons.push('wahrscheinlich statisch: seit ≥ 5 Tagen ortsfest ohne Ausdehnung — eigene Einordnung, kein Datenfeld');
  }
  if (i.site) {
    reasons.push(siteGrey
      ? `Standort einer bekannten Dauerquelle: ${i.site.label} — eigene Ableitung aus dem FIRMS-Archiv, kein Nachweis`
      : `Bekannter Standort einer Dauerquelle in der Nähe (${i.site.label}), aber das Signal weicht vom Anlagenmuster ab — als Brand behandelt`);
  }
  const plausible = !greyed && reasons.some((r) => !/Dauerquelle/.test(r));
  return {
    level: plausible ? 'plausibel' : 'unbestaetigt',
    label: plausible ? LEVEL_LABEL.plausibel : LEVEL_LABEL.unbestaetigt,
    reasons: reasons.length ? reasons : ['nur Satellitendetektion, ein Überflug'],
    greyed,
  };
}

/** Der Hinweis, der IMMER dazugehört: die Mehrheit bleibt unbestätigt — und das ist kein Versagen. */
export const ASSESSMENT_NOTE =
  '„Unbestätigt" ist der Normalfall: Warnungen entstehen nur bei Gefahr für die Bevölkerung, '
  + 'Kartierungen kommen mit Tagen Verzug, kleine Brände sieht der Satellit oft gar nicht. '
  + 'Für Österreich gibt es keine amtliche Bestätigung — dort steht Kontext und ein Link.';

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface AssessCheck { name: string; ok: boolean; detail?: string }

export function verifyFireAssessment(): { checks: AssessCheck[]; passed: number; total: number } {
  const checks: AssessCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const base: AssessmentInput = { mapped: null, official: null, ems: null, overpasses: 1, suspectedStatic: false, atContext: null, landcover: null };
  const poly: BurntPolygon = {
    id: 'v', firedateMs: Date.UTC(2026, 7, 9), finaldateMs: null, lastUpdateMs: Date.UTC(2026, 7, 11), areaHa: 47,
    country: 'IT', province: 'Vercelli', commune: 'Varallo', percNa2k: 0, polys: [], bbox: [8, 45.8, 8.1, 45.9],
    landcover: { CONIFER: 0, BROADLEA: 90, MIXED: 10, SCLEROPH: 0, TRANSIT: 0, OTHERNATLC: 0, AGRIAREAS: 0, ARTIFSURF: 0, OTHERLC: 0 },
  };
  const ems: EmsActivation = { code: 'EMSR920', name: 'Forest fire in Huertgen Forest, Germany', countries: ['Germany'], category: 'Wildfire', isFire: true, lat: 50.75, lon: 6.38, eventMs: Date.UTC(2026, 7, 13, 12, 55), activationMs: null, closed: false };
  const atCtx: AtWarnContext = { gemeindenr: 50101, gemeinde: 'Salzburg', fetchedMs: 0, warnings: [{ type: 6, typeLabel: 'Hitze', level: 2, levelLabel: 'orange', text: 'x', beginRaw: null, endRaw: null, createMs: null, fireContext: true }] };

  add('nur Satellit, ein Überflug ⇒ unbestätigt', assess(base).level === 'unbestaetigt');
  add('kartierte Fläche ⇒ bestätigt, mit EFFIS im Satz', (() => { const a = assess({ ...base, mapped: poly }); return a.level === 'bestaetigt' && /EFFIS/.test(a.reasons[0]); })());
  add('EMS-Aktivierung ⇒ bestätigt, mit Kennung', (() => { const a = assess({ ...base, ems }); return a.level === 'bestaetigt' && /EMSR920/.test(a.reasons[0]); })());
  add('amtliche Warnung ⇒ bestätigt, mit Stelle und Wortlaut', (() => {
    const a = assess({ ...base, official: { issuer: 'Leitstelle Düren', headline: 'Waldbrand in der Gemeinde Hürtgenwald', sentMs: null, identifier: 'x' } });
    return a.level === 'bestaetigt' && /Leitstelle Düren/.test(a.reasons[0]) && /Waldbrand in der Gemeinde Hürtgenwald/.test(a.reasons[0]);
  })());
  // DER Varallo-Test: Bestätigung überstimmt die Statik-Graustufe.
  add('Varallo: statisch + kartiert ⇒ bestätigt und NICHT grau', (() => {
    const a = assess({ ...base, mapped: poly, suspectedStatic: true, overpasses: 24 });
    return a.level === 'bestaetigt' && a.greyed === false && a.reasons.some((r) => /Ortsfest-Vermutung/.test(r));
  })());
  add('statisch ohne Bestätigung ⇒ grau und unbestätigt (nie plausibel)', (() => {
    const a = assess({ ...base, suspectedStatic: true, overpasses: 12 });
    return a.greyed && a.level === 'unbestaetigt';
  })());
  add('mehrere Überflüge ⇒ plausibel, kein „bestätigt"', (() => {
    const a = assess({ ...base, overpasses: 3 });
    return a.level === 'plausibel' && !a.reasons.some((r) => /(?<!un)bestätigt/.test(r));
  })());
  add('AT-Hitzewarnung ⇒ plausibel mit „keine Brandbestätigung"', (() => {
    const a = assess({ ...base, atContext: atCtx });
    return a.level === 'plausibel' && a.reasons.some((r) => /GeoSphere/.test(r) && /keine Brandbestätigung/.test(r));
  })());
  add('AT-Kontext erzeugt NIE „bestätigt"', assess({ ...base, atContext: atCtx, overpasses: 9 }).level !== 'bestaetigt');
  add('Kunstfläche allein macht nicht plausibel', assess({ ...base, landcover: 'artificial' }).level === 'unbestaetigt');
  add('natürliche Fläche ⇒ plausibel', assess({ ...base, landcover: 'natural' }).level === 'plausibel');
  add('Beschriftungen sind genau die drei Wörter', Object.values(LEVEL_LABEL).join('|') === 'bestätigt|plausibel|unbestätigt');
  add('Hinweis nennt die AT-Lücke und den Normalfall', /Österreich/.test(ASSESSMENT_NOTE) && /Normalfall/.test(ASSESSMENT_NOTE));
  add('kein „zwei Quellen"/„verifiziert"-Vokabular', ![ASSESSMENT_NOTE, ...Object.values(LEVEL_LABEL)].some((s) => /verifiziert|zwei Quellen/i.test(s)));
  // TA3: Standort-Einordnung — grau, überstimmbar, und Abweichung bleibt Brand.
  const site = { label: 'Fixture-Stahlwerk (Eisen/Stahl, E-PRTR, 300 m)', deviating: false };
  add('bekannter Standort ⇒ grau und unbestätigt, mit Quelle im Satz', (() => { const a = assess({ ...base, overpasses: 3, site }); return a.greyed && a.level === 'unbestaetigt' && a.reasons.some((r) => /E-PRTR/.test(r) && /kein Nachweis/.test(r)); })());
  add('Standort + Abweichung ⇒ NICHT grau, „als Brand behandelt"', (() => { const a = assess({ ...base, overpasses: 3, site: { ...site, deviating: true } }); return !a.greyed && a.level === 'plausibel' && a.reasons.some((r) => /als Brand behandelt/.test(r)); })());
  add('Standort + Kartierung ⇒ bestätigt, Einordnung aufgehoben', (() => { const a = assess({ ...base, mapped: poly, site }); return a.level === 'bestaetigt' && !a.greyed && a.reasons.some((r) => /Standort-Einordnung ist damit aufgehoben/.test(r)); })());

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
