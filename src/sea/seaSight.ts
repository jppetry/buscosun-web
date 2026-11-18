/**
 * Phase SG — sight and the shower/thunderstorm hint on /seewetter (`audit/seewetter-sicht-konvektion.md`): reading the
 * measured visibility, picking the official line, and the words of the page. Pure; imports nothing outside `src/sea`
 * (the archive workflow checks out `src/sea` only). The class rules and thresholds live in `seaContract.ts`, the producer
 * in `scripts/sea/sea-sight.mjs`.
 *
 * Four things, never mixed: a MEASURED visibility (station, distance, time), the OFFICIAL line (verbatim, complete), a
 * HINT for the chosen hour from model values (never a warning, fog only as "Nebel möglich"), and the shower/thunderstorm
 * HINT with its horizon. None of them changes passt / knapp / außerhalb.
 */
import { SEA_CONV, SEA_VIS, seaConvStale, visClassOfCode, type SeaSightColumns, type SeaSightMeta, type SeaSpot, type SeaVisClass } from './seaContract';
import type { SeaTextDoc } from './seaText';
import { dayShort, hh, hm } from './seaView';

// --- Measured visibility (reading: `seaSightObs.ts`) ------------------------------------------------------------------

export * from './seaSightObs';

/** "12 km" · "4,5 km" · "800 m" · "über 50 km" (the sensors report no more). */
export function visText(m: number): string {
  if (m >= 50_000) return 'über 50 km';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toLocaleString('de-DE', { minimumFractionDigits: m < 10_000 ? 1 : 0, maximumFractionDigits: m < 10_000 ? 1 : 0 })} km`;
}

// --- The official line (verbatim) --------------------------------------------------------------------------------

export interface SightOfficial {
  state: 'ok' | 'none';
  /** "Seewetterbericht Westliche Ostsee" / "Küstenbericht …". */
  head: string;
  product: 'FQDL50' | 'FQDL51' | null;
  issuedAt: string | null;
  stale: boolean;
  /** One entry per forecast day of the bulletin: its own label and the complete field "Sicht/Wetter", both verbatim. */
  days: { label: string; text: string }[];
  why: string | null;
}
const areaLines = (doc: SeaTextDoc | null, id: string | null | undefined) => {
  if (!doc || !id || doc.parts.kind !== 'report') return [];
  const out: { label: string; text: string; name: string }[] = [];
  for (const d of doc.parts.days) { const a = d.areas.find((x) => x.id === id); if (a?.sightWeather) out.push({ label: d.label, text: a.sightWeather, name: a.name }); }
  return out;
};
/**
 * The field "Sicht/Wetter" of the sea report (FQDL50) for the spot's sea area; a spot without a sea area (Stettiner
 * Haff) gets the one of its coast section (FQDL51). Nothing is shortened, joined or reworded.
 */
export function officialSight(spot: Pick<SeaSpot, 'seaArea' | 'coast' | 'country'>, fq50: SeaTextDoc | null, fq51: SeaTextDoc | null, stale: { FQDL50?: boolean; FQDL51?: boolean }, loading = false): SightOfficial {
  const none = (why: string): SightOfficial => ({ state: 'none', head: '', product: null, issuedAt: null, stale: false, days: [], why });
  const sea = areaLines(fq50, spot.seaArea?.id);
  if (sea.length) return { state: 'ok', head: `Seewetterbericht ${sea[0].name}`, product: 'FQDL50', issuedAt: fq50!.issuedAt, stale: !!stale.FQDL50, days: sea.map(({ label, text }) => ({ label, text })), why: null };
  const coast = areaLines(fq51, spot.coast?.id);
  if (coast.length) return { state: 'ok', head: `Küstenbericht ${coast[0].name}`, product: 'FQDL51', issuedAt: fq51!.issuedAt, stale: !!stale.FQDL51, days: coast.map(({ label, text }) => ({ label, text })), why: null };
  if (loading) return none('Die amtlichen Texte laden.');
  if (!spot.seaArea && !spot.coast) return none('Dieser Spot liegt in keinem Seegebiet und keinem Küstenabschnitt der Berichte des Seewetterdienstes Hamburg.');
  return none(!fq50 && !fq51 ? 'Der Seewetterbericht ist gerade nicht lesbar.' : 'Der aktuelle Bericht trägt für dieses Gebiet keine Zeile „Sicht/Wetter“.');
}

// --- Words ---------------------------------------------------------------------------------------------------------

export const CONV_LABEL: readonly string[] = Object.freeze(['kein Hinweis', 'Schauer möglich', 'Gewitter möglich']);
export const VIS_LABEL: Readonly<Record<SeaVisClass, string>> = Object.freeze({ gut: 'gut', eingeschraenkt: 'eingeschränkt möglich', nebel: 'Nebel möglich' });
/** What limits the sight in the class "eingeschränkt möglich" (codes 1–3 of the contract). */
export const VIS_REASON: Readonly<Record<number, string>> = Object.freeze({
  0: 'Luft trocken genug und kein Niederschlag in der Rechnung.',
  1: 'Die Luft ist fast gesättigt: Dunst kann die Sicht unter 10 km drücken.',
  2: 'In der Stunde ist Niederschlag gerechnet: darin kann die Sicht unter 10 km fallen.',
  3: 'Fast gesättigte Luft und Niederschlag: beides kann die Sicht unter 10 km drücken.',
  4: 'Temperatur und Taupunkt liegen fast gleich: Nebel ist möglich. Ob er sich bildet, zeigt diese Rechnung nicht.',
});
/** The legend sentence of the mark in the row "Böen" (Jan's wording). */
export const GUST_CONV_LEGEND = 'Bei Schauern liegen Böen oft deutlich über dem Mittelwind.';
export const SIGHT_HINT_NOTE = 'Hinweis aus Modellwerten, keine Messung und keine Warnung. Amtliche Warnungen gehen vor.';
const km = (m: number) => (m / 1000).toLocaleString('de-DE');
export const VIS_RULE = `Regel: Temperatur, Taupunkt und Niederschlag von buscosun Fusion am Spot gehen durch den Feuchte- und den Niederschlagsteil der Sicht-Diagnose der Autobahnlinie. „eingeschränkt möglich“, wenn einer der beiden Teile unter ${km(SEA_VIS.reducedM)} km liegt; „Nebel möglich“, wenn der Feuchte-Teil unter ${km(SEA_VIS.fogM)} km liegt. Kilometer nennt der Hinweis nicht.`;
/**
 * What step 0 measured (18.11.2026, DWD coastal stations): the rule fed with the stations' own measurements (22 stations,
 * 549 station hours of one rainy day), and the hint as built — buscosun Fusion values computed BEFORE the measurement —
 * on the 22 station hours that could be paired that evening. There the computation was drier than the measurement
 * (dew-point depression 1.1 K larger in the median), so the humidity part answers too rarely. The archive collects more.
 */
export const VIS_CHECK = Object.freeze({ day: '18.11.2026', stations: 22, pairs: 549, gutAbove10: 97, reducedBelow10: 29, fogBelow10: 64, fogBelow4: 24 });
export const VIS_HINT_CHECK = Object.freeze({ pairs: 22, gut: 17, gutAbove10: 15, reduced: 5, reducedBelow10: 1, fog: 0, spreadBiasK: 1.1 });
export const VIS_CHECK_NOTE = `An der Küste bisher nur an einem Tag geprüft (${VIS_CHECK.day}, ${VIS_CHECK.stations} Stationen). Regel mit deren Messwerten gerechnet: bei „gut“ lag die gemessene Sicht in ${VIS_CHECK.gutAbove10} % der Stunden über 10 km, bei „eingeschränkt möglich“ in ${VIS_CHECK.reducedBelow10} % darunter, bei „Nebel möglich“ in ${VIS_CHECK.fogBelow10} % darunter. Mit Vorhersagewerten erst an ${VIS_HINT_CHECK.pairs} Stationsstunden: ${VIS_HINT_CHECK.gut}-mal „gut“ (davon ${VIS_HINT_CHECK.gutAbove10}-mal über 10 km gemessen), ${VIS_HINT_CHECK.reduced}-mal „eingeschränkt möglich“ (davon ${VIS_HINT_CHECK.reducedBelow10}-mal darunter). Die Rechnung war dabei um ${VIS_HINT_CHECK.spreadBiasK.toLocaleString('de-DE')} K trockener als die Messung: „Nebel möglich“ erscheint deshalb seltener, als es sollte.`;
export const VIS_ROW_NOTE = 'Zeile Sicht: Hinweis aus Modellwerten, an der Küste erst an einem Tag geprüft';
export const VIS_ROW_KEY = 'Strich = gut, Schleier = eingeschränkt möglich, dichter Schleier = Nebel möglich';
export const CONV_RULE = `Regel: „Gewitter möglich“ ab einem Gewitterpotenzial von ${SEA_CONV.thunderStorm} (Skala 0 bis 100, aus ICON-D2) und einer Regenchance von ${Math.round(SEA_CONV.rainChance * 100)} %; „Schauer möglich“ ab ${SEA_CONV.capeShowerJkg} J/kg Labilität (CAPE) oder einem Gewitterpotenzial von ${SEA_CONV.thunderShower}, ebenfalls ab ${Math.round(SEA_CONV.rainChance * 100)} % Regenchance. Die Schwellen sind gesetzt, nicht gemessen.`;
export const CONV_SOURCE = 'Gewitterpotenzial und CAPE: Deutscher Wetterdienst, ICON-D2 (CC BY 4.0), eigene Darstellung. Regenchance: buscosun Fusion.';
export const POI_SOURCE = 'Messung: Deutscher Wetterdienst, Stationsmeldungen (POI).';
export const OFFICIAL_SOURCE = 'Deutscher Wetterdienst, Seewetterdienst Hamburg';

// --- The view of the chosen hour -----------------------------------------------------------------------------------

/** The page's sight data of one spot file: the checked columns per spot and the document block. */
export interface SeaSightData { spots: Record<string, SeaSightColumns>; meta: SeaSightMeta | null }

export interface SightHint { state: 'ok' | 'none'; code: number | null; cls: SeaVisClass | null; why: string | null }
export interface SightConv {
  state: 'ok' | 'none';
  cls: 0 | 1 | 2 | null;
  /** The hour lies behind the thunder index's reach: only CAPE speaks, the class is "Schauer möglich" at most. */
  capeOnly: boolean;
  /** Last hours (ms) the thunder index and CAPE reach; `null` without a readable repack run. */
  thunderTo: number | null; capeTo: number | null;
  run: string | null;
  why: string | null;
}
const WHY_NO_FILE = 'Die Stundenreihe dieses Laufs trägt den Hinweis noch nicht. Er entsteht mit der nächsten Windrechnung.';
const WHY_NO_SPOT = 'Für diesen Spot liegt keine Rechnung von buscosun Fusion vor, aus der der Hinweis entsteht.';
const WHY_NO_HOUR = 'Für diese Stunde liegt kein Wert von buscosun Fusion vor.';
const at = (t: number) => `${dayShort(t)} ${hh(t)} Uhr`;

/** The sight hint of hour `i` (index on the file's axis). */
export function sightHintAt(data: SeaSightData | null | undefined, spotId: string, i: number): SightHint {
  const none = (why: string): SightHint => ({ state: 'none', code: null, cls: null, why });
  if (!data?.meta) return none(WHY_NO_FILE);
  if (data.meta.vis.state !== 'ok') return none(data.meta.vis.why ?? WHY_NO_SPOT);
  const col = data.spots[spotId]?.vis;
  if (!col) return none(WHY_NO_SPOT);
  const code = col[i] ?? null, cls = visClassOfCode(code);
  return cls ? { state: 'ok', code, cls, why: null } : none(WHY_NO_HOUR);
}

/** The shower/thunderstorm hint of hour `i` valid at `tMs`. A repack run older than 12 h is "keine Daten", never a class. */
export function sightConvAt(data: SeaSightData | null | undefined, spotId: string, i: number, tMs: number, nowMs: number): SightConv {
  const base = { cls: null, capeOnly: false, thunderTo: null, capeTo: null, run: null } as const;
  const none = (why: string, more: Partial<SightConv> = {}): SightConv => ({ state: 'none', ...base, ...more, why });
  if (!data?.meta) return none(WHY_NO_FILE);
  const c = data.meta.conv;
  if (c.state !== 'ok') return none(c.why);
  const reach = { thunderTo: c.thunderTo, capeTo: c.capeTo, run: c.run };
  if (seaConvStale(c.runMs, nowMs)) return none(`Der ICON-D2-Lauf, aus dem der Hinweis stammt (${c.run.slice(8, 10)} UTC vom ${c.run.slice(6, 8)}.${c.run.slice(4, 6)}.), ist älter als ${SEA_CONV.maxRunAgeH} Stunden.`, { run: c.run });
  const col = data.spots[spotId]?.conv;
  if (!col) return none(WHY_NO_SPOT, reach);
  if (tMs > c.capeTo) return none(`Der Hinweis reicht bis ${at(c.capeTo)} (ICON-D2, ${SEA_CONV.capeMaxLeadH} Stunden ab Modelllauf). Für die gewählte Stunde gibt es keine Aussage.`, reach);
  const cls = col[i];
  if (cls !== 0 && cls !== 1 && cls !== 2) return none(WHY_NO_HOUR, reach);
  return { state: 'ok', cls, capeOnly: tMs > c.thunderTo, ...reach, why: null };
}

/** "reicht für Gewitter bis Mi 07 Uhr, für Schauer bis Mi 22 Uhr" — the horizon line of the hint. */
export function convReachText(c: Pick<SightConv, 'thunderTo' | 'capeTo'>): string | null {
  if (c.capeTo == null) return null;
  return c.thunderTo != null && c.thunderTo < c.capeTo
    ? `Der Hinweis auf Gewitter reicht bis ${at(c.thunderTo)}, der auf Schauer bis ${at(c.capeTo)}; danach gibt es keine Aussage.`
    : `Der Hinweis reicht bis ${at(c.capeTo)}; danach gibt es keine Aussage.`;
}

/** Words of one band cell of the row "Sicht". */
export const visCellWords = (code: number | null | undefined): string => { const cls = visClassOfCode(code); return cls ? `Sicht-Hinweis: ${VIS_LABEL[cls]}` : 'kein Sicht-Hinweis für diese Stunde'; };
/** "gemessen 20:00 Uhr" with the day when it is not today's. */
export const obsTimeText = (t: number, nowMs: number): string => (dayShort(t) === dayShort(nowMs) ? `${hm(t)} Uhr` : `${dayShort(t)} ${hm(t)} Uhr`);
