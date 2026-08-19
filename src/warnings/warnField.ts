/**
 * CAP-Warnungen → Karten-GeoJSON, Farben, Zeitfilter, Texte (Phase W1).
 *
 * Rein und headless prüfbar (D-12): keine Karte, kein DOM, keine implizite Uhr —
 * die Bezugszeit wird immer übergeben.
 *
 * **Grundregel dieses Moduls (gate-blockierend, `audit/wetterwarnungen.md` §0):**
 * Amtliche Texte werden ZITIERT, nicht umformuliert. `headline`, `description`
 * und `instruction` gehen unverändert durch. Übersetzt wird ausschließlich ein
 * geschlossener, hier aufgeführter Satz englischer Aufzählungswörter aus den
 * `<parameter>`-Feldern; alles Unbekannte läuft wörtlich durch, statt geraten
 * zu werden.
 */

import type { CapAlert, CapArea, CapSeverity } from './capAlerts';
import { CEILING_UNRESTRICTED_M } from './capAlerts';

/** Rang der Warnstufe — steuert Zeichenreihenfolge und Sortierung. */
export const SEVERITY_RANK: Record<CapSeverity, number> = {
  Unknown: 0, Minor: 1, Moderate: 2, Severe: 3, Extreme: 4,
};

/**
 * Deutsche Stufenbezeichnung. Die Zuordnung CAP-`severity` → DWD-Warnstufe
 * folgt der bereits im Repo dokumentierten Staffelung (`sources/dwdAlerts.ts`
 * Kopfkommentar) und deckt sich für die beiden unteren Stufen mit der heute
 * gemessenen `AREA_COLOR` (Minor = gelb, Moderate = orange).
 * ⚠️ `Severe`/`Extreme` lagen am Messtag NICHT vor — Bezeichnung und
 * Fallback-Farbe sind für sie **nicht** an echten Daten belegt
 * (`audit/wetterwarnungen.md` §5.1). Auf der Karte spielt das praktisch keine
 * Rolle: dort gilt immer die `AREA_COLOR` aus der Meldung selbst.
 */
export const SEVERITY_LABEL: Record<CapSeverity, string> = {
  Extreme: 'extremes Unwetter',
  Severe: 'Unwetterwarnung',
  Moderate: 'markantes Wetter',
  Minor: 'Wetterwarnung',
  Unknown: 'Warnung',
};

/**
 * Rückfallfarbe, falls eine Meldung ausnahmsweise ohne `AREA_COLOR` kommt.
 * Minor/Moderate sind die am 2026-08-06 **gemessenen** amtlichen Werte;
 * Severe/Extreme stammen aus `sources/dwdAlerts.ts:146` und sind ungemessen.
 */
export const SEVERITY_FALLBACK_COLOR: Record<CapSeverity, string> = {
  Extreme: '#7e0028',
  Severe: '#cc0000',
  Moderate: '#fb8c00',
  Minor: '#ffeb3b',
  Unknown: '#9ec5e5',
};

// ---------------------------------------------------------------------------
// Quellen (Phase W2) — Stufen quellenrein, nie über die Stufennummer gemappt
// ---------------------------------------------------------------------------

/**
 * Die Warnstufen der Dienste sind **nicht ineinander übersetzbar**: DWD-Stufe 1
 * ist gelb, die Schweizer Stufe 1 ist grün („keine oder geringe Gefahr").
 * Deshalb trägt jede Meldung ihre Quelle mit sich, und gemappt wird
 * ausschließlich über Farbe und CAP-`severity` — nie über die Nummer
 * (`audit/warnungen-at-ch.md` §4.4).
 */
export type WarnSourceKey = 'DE' | 'CH';

export interface WarnSourceMeta {
  key: WarnSourceKey;
  /** Wer die Warnung herausgibt — steht im Steckbrief. */
  issuer: string;
  /** Land im Klartext, für Legende und Statuszeile. */
  country: string;
  /**
   * Stammt die Flächenfarbe aus der Meldung (`official`) oder haben wir sie
   * aus der amtlichen Stufe abgeleitet (`derived`)? Der Unterschied MUSS in
   * der Legende stehen (D-04) — sonst behauptet die Karte eine Amtlichkeit,
   * die die Farbe nicht hat.
   */
  colorOrigin: 'official' | 'derived';
  /**
   * Darf der Höhenband-Hinweis aus `<ceiling>` erzeugt werden?
   * Für CH **nein**: gemessen widerspricht das Feld bei 32 von 97 Meldungen
   * dem amtlichen Text (V-176). Der Text sagt es ohnehin selbst.
   */
  heightFromCeiling: boolean;
}

export const WARN_SOURCE_DE: WarnSourceMeta = {
  key: 'DE',
  issuer: 'Deutscher Wetterdienst',
  country: 'Deutschland',
  colorOrigin: 'official',
  heightFromCeiling: true,
};

export const WARN_SOURCE_CH: WarnSourceMeta = {
  key: 'CH',
  issuer: 'MeteoSchweiz',
  country: 'Schweiz',
  colorOrigin: 'derived',
  heightFromCeiling: false,
};

/**
 * MeteoAlarm-Warnstufen als Farbe. Die **Stufe und das Farbwort** stehen in der
 * Meldung (`<parameter> awareness_level` = z. B. `3; orange; Severe`) — der
 * RGB-Wert nicht. Er ist damit unsere Zutat und wird als abgeleitet
 * gekennzeichnet (`WARN_SOURCE_CH.colorOrigin`), statt ihn als amtlich
 * auszugeben. Gemessen kamen bisher nur `orange` und `red` vor.
 */
export const AWARENESS_COLOR: Record<string, string> = {
  green: '#4caf50',
  yellow: '#ffeb3b',
  orange: '#fb8c00',
  red: '#e53935',
};

/**
 * Amtliche Schweizer Gefahrenstufen-Bezeichnungen (MeteoSchweiz, „Erklärung der
 * Gefahrenstufen"). Bewusst NICHT die DWD-Staffelung: die Nummern bedeuten
 * Verschiedenes, und eine geteilte Bezeichnung wäre schlicht falsch.
 */
export const AWARENESS_LABEL: Record<number, string> = {
  1: 'keine oder geringe Gefahr',
  2: 'mässige Gefahr',
  3: 'erhebliche Gefahr',
  4: 'grosse Gefahr',
};

/**
 * `awareness_level` einer Meldung: `„3; orange; Severe"` → Stufe + Farbwort.
 * `null`, wenn der Parameter fehlt oder unlesbar ist — dann wird nichts
 * erfunden, sondern auf die dokumentierte Rückfallfarbe zurückgefallen.
 */
export function awarenessOf(a: CapAlert): { level: number; colorWord: string } | null {
  const raw = a.parameters.find((p) => p.name === 'awareness_level')?.value;
  if (!raw) return null;
  const parts = raw.split(';').map((s) => s.trim());
  const level = Number(parts[0]);
  const colorWord = (parts[1] ?? '').toLowerCase();
  if (!Number.isFinite(level) || !colorWord) return null;
  return { level, colorWord };
}

/**
 * Farbe einer Meldung.
 *  - **DE:** amtlich aus der Datei (`AREA_COLOR`), sonst dokumentierter Fallback.
 *  - **CH:** aus der amtlichen Stufe abgeleitet — der Schweizer Feed führt
 *    **kein** `AREA_COLOR`. Ohne diese Verzweigung liefe CH in
 *    `SEVERITY_FALLBACK_COLOR`, dessen Werte für `Severe`/`Extreme`
 *    ausdrücklich **ungemessene DWD**-Werte sind: Schweizer Flächen trügen dann
 *    eine deutsche Behelfsfarbe, die niemand je gemessen hat.
 */
export function warnColor(a: CapAlert, source: WarnSourceMeta = WARN_SOURCE_DE): string {
  if (source.key === 'CH') {
    const aw = awarenessOf(a);
    const c = aw ? AWARENESS_COLOR[aw.colorWord] : undefined;
    return c ?? SEVERITY_FALLBACK_COLOR[a.severity];
  }
  return a.areaColor ?? SEVERITY_FALLBACK_COLOR[a.severity];
}

/**
 * Stufenbezeichnung einer Meldung — quellenrein. DE nutzt die DWD-Staffelung,
 * CH die amtlichen Schweizer Gefahrenstufen.
 */
export function warnSeverityLabel(a: CapAlert, source: WarnSourceMeta = WARN_SOURCE_DE): string {
  if (source.key === 'CH') {
    const aw = awarenessOf(a);
    const name = aw ? AWARENESS_LABEL[aw.level] : undefined;
    if (aw && name) return `Gefahrenstufe ${aw.level} · ${name}`;
    if (aw) return `Gefahrenstufe ${aw.level}`;
  }
  return SEVERITY_LABEL[a.severity];
}

/**
 * Beginn der Gültigkeit. `onset` ist das Maß; fehlt es, gilt ersatzweise
 * `effective`, dann `sent`. Fehlt alles, wird die Meldung als laufend
 * behandelt — eine amtliche Warnung wegen eines fehlenden Zeitstempels zu
 * verschweigen wäre der schlechtere Fehler.
 */
export function alertStartMs(a: CapAlert): number | null {
  return a.onsetMs ?? a.effectiveMs ?? a.sentMs;
}

/**
 * Gilt die Meldung zum Zeitpunkt `tMs`?
 * Ohne `expires` ist die Warnung offen bis zur Aufhebung — sie verschwindet
 * dann erst, wenn sie nicht mehr im Vollstand steht (nicht durch Zeitablauf).
 */
export function isActiveAt(a: CapAlert, tMs: number): boolean {
  const start = alertStartMs(a);
  if (start != null && tMs < start) return false;
  if (a.expiresMs != null && tMs >= a.expiresMs) return false;
  return true;
}

/** Höhenband eines Gebiets als Klartext — `null`, wenn keine Einschränkung.
 *  Ohne diesen Hinweis überzeichnet die Fläche die Warnung (§5.3). */
export function heightBandText(area: CapArea): string | null {
  const floor = area.floorM != null && area.floorM > 1 ? Math.round(area.floorM) : null;
  const ceil = area.ceilingM != null && area.ceilingM < CEILING_UNRESTRICTED_M - 1
    ? Math.round(area.ceilingM) : null;
  if (floor == null && ceil == null) return null;
  if (floor != null && ceil != null) return `gilt nur zwischen ${floor} m und ${ceil} m Höhe`;
  if (ceil != null) return `gilt nur unterhalb ${ceil} m Höhe`;
  return `gilt nur oberhalb ${floor} m Höhe`;
}

const HHMM: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

/** Zeitangabe der Meldung, bezogen auf `nowMs` (für „heute/morgen"). */
export function validityText(a: CapAlert, nowMs: number): string {
  const start = alertStartMs(a);
  const day = (ms: number) => {
    const d = new Date(ms), n = new Date(nowMs);
    const sameDay = d.toDateString() === n.toDateString();
    const tomorrow = new Date(nowMs + 86_400_000).toDateString() === d.toDateString();
    const hm = `${d.toLocaleTimeString('de-DE', HHMM)} Uhr`;
    return sameDay ? hm : tomorrow ? `morgen ${hm}` : `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${hm}`;
  };
  if (a.expiresMs == null) {
    return start != null && start > nowMs ? `ab ${day(start)}, ohne festes Ende` : 'ohne festes Ende';
  }
  if (start != null && start > nowMs) return `${day(start)} bis ${day(a.expiresMs)}`;
  return `bis ${day(a.expiresMs)}`;
}

/**
 * Übersetzung der `<parameter>`-Aufzählungswörter. Bewusst eine geschlossene
 * Liste: Zahlenwerte („~70 [km/h]") laufen unverändert durch, unbekannte
 * Wörter ebenfalls — lieber englisch stehen lassen als sinnentstellend raten.
 */
const PARAM_NAME_DE: Record<string, string> = {
  gusts: 'Böen',
  'exposed gusts': 'Böen in exponierten Lagen',
  precipitation: 'Niederschlag',
  hail: 'Hagel',
  occurrence: 'Auftreten',
  'direction of approach': 'Zugrichtung',
  'wind direction': 'Windrichtung',
  'subsequent wind direction': 'danach Windrichtung',
  snowfall: 'Schneefall',
  'snow height': 'Schneehöhe',
  temperature: 'Temperatur',
  visibility: 'Sichtweite',
};
const PARAM_VALUE_DE: Record<string, string> = {
  north: 'Nord', 'north-east': 'Nordost', east: 'Ost', 'south-east': 'Südost',
  south: 'Süd', 'south-west': 'Südwest', west: 'West', 'north-west': 'Nordwest',
  localised: 'örtlich', scattered: 'vereinzelt', widespread: 'verbreitet',
};

export function paramLabel(name: string): string {
  return PARAM_NAME_DE[name] ?? name;
}
export function paramValue(value: string): string {
  return PARAM_VALUE_DE[value.trim().toLowerCase()] ?? value;
}

/** Meldungen, die zur Zeit `tMs` gelten — höchste Stufe zuerst. */
export function activeAlertsAt(alerts: CapAlert[], tMs: number): CapAlert[] {
  return alerts
    .filter((a) => isActiveAt(a, tMs))
    .sort((a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
      || (alertStartMs(a) ?? 0) - (alertStartMs(b) ?? 0));
}

/** Zusammenfassung für Legende und Statuszeile — ausschließlich aus den Daten,
 *  damit die Legende nie eine Stufe behauptet, die gerade nicht auf der Karte
 *  ist (D-04). */
export interface WarnSummaryTier {
  severity: CapSeverity;
  label: string;
  color: string;
  count: number;
}
export function warnSummary(
  alerts: CapAlert[], tMs: number, source: WarnSourceMeta = WARN_SOURCE_DE,
): {
  total: number;
  tiers: WarnSummaryTier[];
  topSeverity: CapSeverity | null;
} {
  const act = activeAlertsAt(alerts, tMs);
  const byTier = new Map<string, WarnSummaryTier>();
  for (const a of act) {
    // Der Schlüssel ist die BEZEICHNUNG, nicht die CAP-Stufe: die Schweizer
    // Gefahrenstufen 3 und 4 fallen beide unter `Severe`/`Extreme`, dürfen in
    // der Legende aber nicht zu einer Zeile verschmelzen.
    const label = warnSeverityLabel(a, source);
    const t = byTier.get(label);
    if (t) t.count++;
    else byTier.set(label, { severity: a.severity, label, color: warnColor(a, source), count: 1 });
  }
  const tiers = [...byTier.values()].sort((x, y) => SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity]);
  return { total: act.length, tiers, topSeverity: tiers[0]?.severity ?? null };
}

/** Properties eines Warnflächen-Features (das, was der Steckbrief liest). */
export interface WarnFeatureProperties {
  kind: 'area';
  id: string;
  /** Rang der Warnstufe — zugleich `fill-sort-key`: höhere Stufe zeichnet oben. */
  sev: number;
  color: string;
  event: string;
  /** Amtliche Überschrift, unverändert. */
  headline: string;
  severityLabel: string;
  areaDesc: string;
  senderName: string;
  /** Klartext-Gültigkeit, bezogen auf die übergebene Bezugszeit. */
  validity: string;
  /** Höhenband-Hinweis oder `''`. */
  heightNote: string;
  description: string;
  instruction: string;
  /** `Name: Wert`-Paare, bereits eingedeutscht wo belegt. */
  details: string;
  license: string;
  web: string;
  onsetMs: number | null;
  expiresMs: number | null;
  sentMs: number | null;
  /** Quelle der Meldung — der Steckbrief nennt, wer gewarnt hat. */
  sourceKey: WarnSourceKey;
  issuer: string;
  /** `'official'` | `'derived'` — muss am Farbfeld erkennbar bleiben (D-04). */
  colorOrigin: 'official' | 'derived';
  /**
   * Hinweis, wenn die gewünschte Sprachfassung fehlte und ersatzweise die
   * erste (englische) genommen wurde — `''`, wenn alles in Ordnung war.
   */
  languageNote: string;
}

/**
 * Warnlage → FeatureCollection. Ein Feature je (Meldung × Gebiet); die Ringe
 * eines Gebiets werden zu einem MultiPolygon zusammengefasst.
 *
 * CAP kennt **keine Löcher**: mehrere `<polygon>` in einem `<area>` sind
 * mehrere getrennte Flächen (z. B. Inseln), nicht Außen- und Innenring. Sie als
 * Ring-Liste EINES Polygons zu übergeben würde Flächen ausstanzen, die es gibt.
 */
export function buildWarnFeatures(
  alerts: CapAlert[], tMs: number, source: WarnSourceMeta = WARN_SOURCE_DE,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const a of activeAlertsAt(alerts, tMs)) {
    const color = warnColor(a, source);
    const details = a.parameters
      .filter((p) => p.name && p.value)
      // `awareness_*` sind Steuerfelder von MeteoAlarm, keine Wetterangaben —
      // sie stehen bereits als Stufe in der Legende und gehören nicht als
      // „awareness_level: 3; orange; Severe" in den Steckbrief.
      .filter((p) => !p.name.startsWith('awareness_'))
      .map((p) => `${paramLabel(p.name)}: ${paramValue(p.value)}`)
      .join(' · ');
    for (const area of a.areas) {
      if (!area.rings.length) continue;
      const props: WarnFeatureProperties = {
        kind: 'area',
        id: a.id,
        sev: SEVERITY_RANK[a.severity],
        color,
        event: a.event,
        headline: a.headline,
        severityLabel: warnSeverityLabel(a, source),
        areaDesc: area.desc,
        senderName: a.senderName,
        validity: validityText(a, tMs),
        // ⚠️ Nur wo das Feld dem amtlichen Text nicht widerspricht (V-176).
        heightNote: source.heightFromCeiling ? heightBandText(area) ?? '' : '',
        description: a.description,
        instruction: a.instruction,
        details,
        license: a.license ?? '',
        web: a.web ?? '',
        onsetMs: a.onsetMs,
        expiresMs: a.expiresMs,
        sentMs: a.sentMs,
        sourceKey: source.key,
        issuer: source.issuer,
        colorOrigin: source.colorOrigin,
        languageNote: a.languageFallback
          ? 'Die deutschsprachige Fassung dieser Meldung lag nicht vor — gezeigt wird der englische Originaltext.'
          : '',
      };
      features.push({
        type: 'Feature',
        geometry: { type: 'MultiPolygon', coordinates: area.rings.map((r) => [closeRing(r)]) },
        properties: props as unknown as GeoJSON.GeoJsonProperties,
      });
    }
  }
  // Schwächere Stufen zuerst → höhere Stufen zeichnen darüber. `fill-sort-key`
  // regelt es zusätzlich in MapLibre; die Reihenfolge hier ist der Gürtel dazu.
  features.sort((x, y) => ((x.properties?.sev as number) ?? 0) - ((y.properties?.sev as number) ?? 0));
  return { type: 'FeatureCollection', features };
}

// ---------------------------------------------------------------------------
// Mehrere Quellen in EINEM Layer (Phase W2)
// ---------------------------------------------------------------------------

/** Eine Quelle mit ihrem aktuellen Stand. */
export interface WarnLayerInput {
  alerts: CapAlert[];
  source: WarnSourceMeta;
}

/**
 * Ein Layer, mehrere Quellen. Die Quellen bleiben getrennt geführt (Farbe,
 * Stufenbezeichnung, Höhenband je Quelle) und werden erst in der
 * FeatureCollection zusammengelegt — die Karte zeichnet danach eine Fläche,
 * nicht zwei Systeme.
 */
export function buildWarnFeaturesMulti(
  inputs: WarnLayerInput[], tMs: number,
): GeoJSON.FeatureCollection {
  const features = inputs.flatMap((i) => buildWarnFeatures(i.alerts, tMs, i.source).features);
  // Erneut sortieren: die Einzelaufrufe sortieren nur innerhalb ihrer Quelle,
  // übereinanderliegende Stufen zweier Länder müssten sonst zufällig gewinnen.
  features.sort((x, y) => ((x.properties?.sev as number) ?? 0) - ((y.properties?.sev as number) ?? 0));
  return { type: 'FeatureCollection', features };
}

/**
 * Zusammenfassung über mehrere Quellen — zusätzlich **je Land**, weil die
 * Stufenskalen nicht vergleichbar sind und eine gemeinsame Zeile
 * „3 Warnungen" verschweigen würde, welches Land gemeint ist (D-04).
 */
export function warnSummaryMulti(inputs: WarnLayerInput[], tMs: number): {
  total: number;
  perSource: Array<{ source: WarnSourceMeta; total: number; tiers: WarnSummaryTier[] }>;
} {
  const perSource = inputs.map((i) => {
    const s = warnSummary(i.alerts, tMs, i.source);
    return { source: i.source, total: s.total, tiers: s.tiers };
  });
  return { total: perSource.reduce((n, s) => n + s.total, 0), perSource };
}

/** Ring zu einem gültigen GeoJSON-Ring schließen (CAP liefert bereits
 *  geschlossene Ringe — gemessen 136/136; die Prüfung ist die Absicherung). */
function closeRing(ring: Array<[number, number]>): Array<[number, number]> {
  if (ring.length < 3) return ring;
  const f = ring[0], l = ring[ring.length - 1];
  return f[0] === l[0] && f[1] === l[1] ? ring : [...ring, [f[0], f[1]]];
}
