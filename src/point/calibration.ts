/**
 * calibration.ts — die Kalibrierdatei `point/calib.json` (Phase PD-A,
 * `audit/punktdaten-versorgung.md` §13.1 Zeilen 30–39, §21 (4)).
 *
 * ── Warum die Kalibrierung DATEN sind und keine Konstanten ─────────────────
 * `ABLAUFPLAENE.md` sagt es in den Offenen Punkten selbst:
 *
 *   „Amplituden A (Kaltluft) und A_uhi (Wärmeinsel) werden an Stationsbeobachtungen
 *    **gelernt**, nicht gesetzt."
 *   „Sämtliche Startwerte (L_d, L_h, Δz_min, v_ref, a, ε, z_b, Schmelzversatz) sind
 *    Kalibrierungsparameter, keine physikalischen Konstanten."
 *
 * Sie ändern sich, wenn die Verifikation neue Scorecards liefert. Wären sie im Code,
 * müsste für jede neue Messung die App neu gebaut werden — und niemand könnte am
 * ausgelieferten Stand ablesen, welche Zahlen gerade gelten. Deshalb liegen sie im
 * Daten-Repo, versioniert wie ein Modellfeld.
 *
 * ── Die Regel, die dieses Modul durchsetzt ─────────────────────────────────
 * **Kein Wert ohne Herkunft.** Jeder Eintrag trägt `provenance`:
 *
 *   `measured`    aus der Verifikation gegen Beobachtungen (`buscosun-archiv`, PA)
 *   `literature`  aus der Fachliteratur, mit Quelle im Feld `source`
 *   `physical`    physikalische Konstante, keine Kalibrierung
 *   `set`         gesetzt, weil noch nichts Besseres da ist — **erklärungspflichtig**
 *   `null`        nicht bekannt; der Wert ist `null`, NICHT 0
 *
 * Ein gesetzter Wert, der wie ein gemessener aussieht, ist der teuerste Fehler, den
 * dieses Produkt machen kann: er macht eine Vorhersage genau so selbstbewusst wie eine
 * gemessene und ist es nicht. Deshalb ist `null` hier der Normalfall und kein Mangel —
 * es gibt bis heute (2026-09-09) **keine einzige gemessene Kalibrierung**, weil
 * `buscosun-archiv` noch nicht läuft.
 */

export type Provenance = 'measured' | 'literature' | 'physical' | 'set' | null;

export interface CalibEntry<T = number> {
  /** `null` = unbekannt. Nie 0 als Ersatz. */
  readonly value: T | null;
  readonly provenance: Provenance;
  /** Woher — Literaturstelle, Scorecard-Lauf, oder die Begründung einer Setzung. */
  readonly source: string;
  /** Wann zuletzt fortgeschrieben (ISO). `null` = nie. */
  readonly updatedAt: string | null;
  readonly unit?: string;
  readonly pap?: string;
}

const unknown = <T>(source: string, unit?: string, pap?: string): CalibEntry<T> =>
  ({ value: null, provenance: null, source, updatedAt: null, unit, pap });

// PD-C4: `terrainPoint.ts` sagt seit PD-A „point/calib.json führt ihn als literature" —
// und es gab den Eintrag nicht. Die Tabelle bleibt DORT (der Client rechnet z₀ am Punkt);
// hier steht sie als Kalibriereintrag mit Herkunft, damit der Satz wahr ist.
import { WORLDCOVER_Z0 } from './terrainPoint';

export const CALIB_SCHEMA = 1;

/**
 * Der Inhalt von `point/calib.json` in der Fassung, die PD-A ausliefert.
 * Fast alles ist `null` — und das ist der ehrliche Stand, nicht ein unfertiger.
 */
export const CALIBRATION_V1 = Object.freeze({
  schema: CALIB_SCHEMA,
  note: 'Kalibrierung von buscosun Fusion. Kein Wert ohne provenance. null = unbekannt, nicht 0.',
  updatedAt: null as string | null,

  /** PAP 6: der Sockel, den die Ablaufpläne „zwingend" nennen. Je Zielgröße × Vorhersagestunde. */
  sigmaSys: unknown<Record<string, number[]>>(
    'Aus der Verifikation gegen Beobachtungen zu messen (buscosun-archiv, PA). PAP 6: „σ_div allein unterschätzt systematisch — er misst nur, worin die Modelle sich unterscheiden, nicht ihren gemeinsamen Fehler."',
    'Einheit der jeweiligen Zielgröße', 'PAP 6'),

  /** PAP 2: die Fehlerkovarianz, aus der die Fusionsgewichte `w = Σ⁻¹1/(1ᵀΣ⁻¹1)` fallen. */
  sigmaMatrix: unknown<Record<string, number[][]>>(
    'Fehlerkovarianz je Quellenpaar, Variable und Vorhersagestunde. Ohne Archiv nicht messbar.',
    '—', 'PAP 2'),

  /** PAP 6: `σ = c(p,f) · σ_ens` — die Spread-Skill-Umrechnung. */
  cSpread: unknown<Record<string, number[]>>(
    'Spread-Skill-Faktor je Zielgröße und Vorhersagestunde. Der Ensemble-Spread ist nicht der Fehler; c(p,f) ist der gemessene Umrechnungsfaktor.',
    '—', 'PAP 6'),

  /** PAP 3: Längenskalen der Nachbargewichtung. */
  Ld: unknown('Horizontale Längenskala. PAP 3: „L_d und L_h sind Kalibrierungsparameter, keine physikalischen Konstanten."', 'm', 'PAP 3'),
  Lh: unknown('Vertikale Längenskala (Höhendifferenz zum Nachbarpunkt).', 'm', 'PAP 3'),

  /** PAP 5: Amplituden, die an Stationen GELERNT werden. */
  A: unknown<Record<string, number>>(
    'Kaltluftsee-Amplitude, regional. PAP 5 Offene Punkte: „werden an Stationsbeobachtungen gelernt, nicht gesetzt. Ob genug Stationen in Muldenlagen liegen, ist auszuzählen."',
    'K', 'PAP 5'),
  Auhi: unknown<Record<string, number>>('Wärmeinsel-Amplitude als Funktion von imperv und SVF.', 'K', 'PAP 5'),

  /** PAP 5: der Wetterfaktor, der entscheidet, ob die Geländeterme überhaupt wirken. */
  fRad: Object.freeze({
    a: unknown('Exponent von (1 − clct/100).', '—', 'PAP 5'),
    vRef: unknown('Bezugswind in exp(−v10/v_ref).', 'm/s', 'PAP 5'),
    epsilon: unknown('Schwelle, unter der die Atmosphäre als durchmischt gilt.', '—', 'PAP 5'),
    fSaison: unknown('In PAP 5 verwendet, aber weder als Formel noch als Wertebereich definiert — s. §21 (6).', '—', 'PAP 5'),
  }),

  /** PAP 4: die Form der Inversionsfunktion φ. */
  phi: Object.freeze({
    shape: { value: 'linear', provenance: 'set' as Provenance,
      source: 'PAP 4: „Startform linear, kalibrierbar gegen Stationspaare in Inversionslagen." Bis zur Kalibrierung ist linear die Startform, ausdrücklich als Setzung markiert.',
      updatedAt: null, pap: 'PAP 4' },
    knots: unknown<number[][]>('Stützstellen der kalibrierten Form. φ muss monoton steigen mit φ(0)=0 und φ(1)=1.', '—', 'PAP 4'),
  }),

  /** PAP 2: Mindestmächtigkeit, ab der eine Temperaturzunahme als Inversion gilt. */
  dzMin: unknown('PAP 2: „∂T/∂z > 0 über ≥ Δz_min". Ohne Kalibrierung nicht gesetzt — eine zu kleine Schwelle macht jede Messrauschspitze zur Inversion.', 'm', 'PAP 2'),

  /** PAP 6: Versatz zwischen der Feuchtkugel-Nullgradgrenze und der Schneefallgrenze. */
  meltOffset: unknown('PAP 6: „Schneefallgrenze = T_w-Nullgradgrenze − Schmelzversatz."', 'm', 'PAP 6'),

  /** PAP 5: die regionale Streuung des TPI, gegen die „TPI < −1σ" gemessen wird. */
  tpiSigma: unknown<Record<string, number>>(
    'PAP 5 prüft „Muldenlage (TPI < −1σ)". Das σ ist eine Eigenschaft der REGION, nicht der Zelle — aus dem Terrain-Stack auszuzählen, sobald er gebaut ist.',
    'm', 'PAP 5'),

  /** Werte, die KEINE Kalibrierung sind — physikalisch bzw. aus der Literatur. */
  fixed: Object.freeze({
    dryAdiabatic: { value: 0.0098, provenance: 'physical' as Provenance,
      source: 'PAP 2: „∂T/∂z > 0 entspricht ∂θ/∂z > (θ/T)·g/c_p ≈ 0,0098 K/m." Trockenadiabatischer Gradient, keine Kalibrierung.',
      updatedAt: null, unit: 'K/m', pap: 'PAP 2' },
    standardLapse: { value: 0.0065, provenance: 'literature' as Provenance,
      source: 'ICAO-Standardatmosphäre. Im Repo als STANDARD_LAPSE_RATE_PER_M in src/fusion/elevation.ts derselbe Wert — Rückfall, wenn gamma_eff fehlt.',
      updatedAt: null, unit: 'K/m', pap: 'PAP 4' },
    gammaSign: { value: '-dT/dz', provenance: 'physical' as Provenance,
      source: 'PAP 4, Vorzeichenkonvention „hier verbindlich": normale Schichtung → Γ > 0, Inversion → Γ < 0. Steht hier, damit ein Leser sie nicht aus dem Vorzeichen der Daten raten muss.',
      updatedAt: null, unit: '—', pap: 'PAP 4' },
    /** PAP 3/5: Rauhigkeitslänge je WorldCover-Klasse — Literatur (Davenport/Wieringa), keine Messung. */
    z0Table: { value: WORLDCOVER_Z0 as Readonly<Record<number, number>>, provenance: 'literature' as Provenance,
      source: 'Davenport/Wieringa-Klassen auf ESA WorldCover v200 (Codes 10…100). Dieselbe Tabelle rechnet der Client am Punkt (src/point/terrainPoint.ts, WORLDCOVER_Z0); hier steht sie mit Herkunft, weil PAP 5 O7 damit den Wind korrigiert. Bis PD-C4 behauptete terrainPoint.ts diesen Eintrag, ohne dass es ihn gab.',
      updatedAt: null, unit: 'm', pap: 'PAP 5' },
  }),
});

export interface CalibCheck { name: string; ok: boolean; detail?: string }

/**
 * Selbsttest. Prüft nicht die WERTE (es gibt keine), sondern die Regel: kein Wert
 * ohne Herkunft, und keine stille Null.
 */
export function calibrationSelfTest(): { checks: CalibCheck[]; passed: number; total: number } {
  const checks: CalibCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const entries: Array<[string, CalibEntry<unknown>]> = [];
  const walk = (obj: unknown, path: string) => {
    if (obj == null || typeof obj !== 'object') return;
    const o = obj as Record<string, unknown>;
    if ('value' in o && 'provenance' in o && 'source' in o) {
      entries.push([path, o as unknown as CalibEntry<unknown>]);
      return;
    }
    for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k);
  };
  walk(CALIBRATION_V1, '');

  add('Kalibriereinträge gefunden', entries.length >= 15, `${entries.length} Einträge`);
  add('jeder Eintrag nennt eine Quelle', entries.every(([, e]) => e.source.length > 20),
    entries.filter(([, e]) => e.source.length <= 20).map(([p]) => p).join(',') || 'alle');
  add('kein Wert ohne provenance',
    entries.every(([, e]) => e.value == null || e.provenance != null),
    entries.filter(([, e]) => e.value != null && e.provenance == null).map(([p]) => p).join(',') || 'alle');
  add('kein Eintrag setzt 0 statt null',
    entries.every(([, e]) => e.value !== 0),
    entries.filter(([, e]) => e.value === 0).map(([p]) => p).join(',') || 'keiner');
  add('nichts ist als „measured" ausgegeben, solange kein Archiv läuft',
    entries.every(([, e]) => e.provenance !== 'measured'),
    'PA (buscosun-archiv) ist Voraussetzung — s. §21 (4)');
  add('Setzungen sind ausdrücklich markiert',
    entries.filter(([, e]) => e.provenance === 'set').every(([, e]) => e.source.includes('Setzung') || e.source.includes('Startform')),
    entries.filter(([, e]) => e.provenance === 'set').map(([p]) => p).join(',') || 'keine');
  add('die physikalischen Konstanten tragen ihre Werte',
    CALIBRATION_V1.fixed.dryAdiabatic.value === 0.0098 && CALIBRATION_V1.fixed.standardLapse.value === 0.0065);
  add('die Vorzeichenkonvention steht in der Datei',
    CALIBRATION_V1.fixed.gammaSign.value === '-dT/dz');
  // PD-C4: der Eintrag, den terrainPoint.ts seit PD-A behauptete — mit allen elf Klassen,
  // als Literatur markiert, und Wasser rauer als nichts (0,0002 m, nicht 0).
  add('z0-Tabelle: elf WorldCover-Klassen, Literatur, kein Wert 0',
    CALIBRATION_V1.fixed.z0Table.provenance === 'literature'
    && Object.keys(CALIBRATION_V1.fixed.z0Table.value).length === 11
    && Object.values(CALIBRATION_V1.fixed.z0Table.value).every((v) => v > 0)
    && CALIBRATION_V1.fixed.z0Table.value[80] === 0.0002);
  add('jeder PAP-Verweis zeigt auf einen der sechs Pläne',
    entries.every(([, e]) => e.pap == null || /^PAP [1-6]$/.test(e.pap)),
    entries.filter(([, e]) => e.pap != null && !/^PAP [1-6]$/.test(e.pap)).map(([p]) => p).join(',') || 'alle');

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
