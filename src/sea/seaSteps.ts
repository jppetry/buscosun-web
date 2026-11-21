/**
 * Phase AM-W — the trip planner as a step-by-step assistant (`audit/seewetter-ausfahrt.md` §13). Pure: which steps a
 * kind of trip has, what each is called, what must stand before „Weiter“ goes on, and the step as written in the link
 * (`ps=<kind>.<step>`). Nothing here computes a plan — `seaPlanner.ts` and `seaTrip.ts` do, unchanged.
 */
import { TRIP_MODE_LABEL, type TripMode } from './seaTrip';
import type { SeaLimits } from './seaProfiles';

export type WizStep = 'wer' | 'art' | 'ort' | 'strecke' | 'revier' | 'zeit' | 'grenzen' | 'ergebnis';

/** The pages of the assistant per kind of trip. Step 1 is the same for all; Strand has no limits (E-AM-30/39). */
export const WIZ_STEPS: Readonly<Record<TripMode, readonly WizStep[]>> = Object.freeze({
  ort: ['wer', 'art', 'ort', 'zeit', 'grenzen', 'ergebnis'],
  etappe: ['wer', 'art', 'strecke', 'zeit', 'grenzen', 'ergebnis'],
  strand: ['wer', 'art', 'revier', 'zeit', 'ergebnis'],
});

/** The pages that need the map: the spot is picked, the route is set, the result is shown. */
const WIZ_MAP_STEPS: readonly WizStep[] = ['ort', 'strecke', 'ergebnis'];
/** Before the first page that needs the map, the assistant fills the screen (like the route planner); the map joins after. */
export function wizFullScreen(mode: TripMode, step: WizStep): boolean {
  const steps = WIZ_STEPS[mode], i = steps.indexOf(step);
  return i >= 0 && i < steps.findIndex((s) => WIZ_MAP_STEPS.includes(s));
}

/** The short name in the progress row. */
export function wizLabel(mode: TripMode, step: WizStep): string {
  switch (step) {
    case 'wer': return 'Angaben';
    case 'art': return 'Ausfahrt';
    case 'ort': return 'Startort';
    case 'strecke': return 'Strecke';
    case 'revier': return 'Revier';
    case 'zeit': return mode === 'etappe' ? 'Abfahrt' : 'Fenster';
    case 'grenzen': return 'Grenzen';
    default: return 'Ergebnis';
  }
}
/** The heading of the page. */
export function wizTitle(mode: TripMode, step: WizStep): string {
  switch (step) {
    case 'wer': return 'Grundangaben';
    case 'art': return 'Art der Ausfahrt';
    case 'ort': return 'Startort';
    case 'strecke': return 'Strecke';
    case 'revier': return 'Revier';
    case 'zeit': return mode === 'etappe' ? 'Fahrt und Abfahrt' : 'Zeitfenster';
    case 'grenzen': return 'Deine Grenzen';
    default: return 'Ergebnis';
  }
}
/** One sentence under the heading: what this page asks. */
export function wizLead(mode: TripMode, step: WizStep): string {
  switch (step) {
    case 'wer': return 'Wer fährt? Das Profil bringt seine Grenzen mit und schlägt die Art der Ausfahrt vor.';
    case 'art': return 'Was planst du? Jede Art fragt nach anderen Angaben und zeigt ein anderes Ergebnis.';
    case 'ort': return 'Von welchem Spot startest du? Wähle ihn in der Liste oder auf der Karte.';
    case 'strecke': return 'Setze Start und Ziel auf der Karte, dazwischen so viele Wegpunkte, wie du brauchst.';
    case 'revier': return 'In welchem Revier suchst du, und welcher Wind soll oben in der Liste stehen?';
    case 'zeit': return mode === 'etappe' ? 'Wie schnell fährst du, und wann legst du ab?' : mode === 'strand' ? 'Für welche Stunden soll die Liste zählen?' : 'Wann legst du ab, und wann bist du zurück?';
    case 'grenzen': return 'Daran misst der Planer jede Stunde. Es sind deine Grenzen, keine Bewertung der Sicherheit.';
    default: return `${TRIP_MODE_LABEL[mode]}: deine Angaben und was die Vorhersage dazu sagt.`;
  }
}

export const WIZ_NEXT = 'Weiter';
export const WIZ_BACK = 'Zurück';
export const WIZ_TO_RESULT = 'Ergebnis zeigen';
/** E-AM-43: on every page of the assistant — what the planner is not. */
export const WIZ_DISCLAIMER = 'Keine amtliche Warnung, kein Ersatz für den amtlichen Seewetterbericht und keine Navigationsgrundlage.';
/** E-AM-39: Strand ignores the profile — said where the profile is chosen. */
export const WIZ_STRAND_PROFILE_NOTE = 'Für „Strand“ zählt das Profil nicht: die Liste zeigt nur die Windrichtung zum Ufer. Der Schritt „Grenzen“ entfällt.';
export const WIZ_BOAT_NOTE = 'Das Boot auf der Karte ziehen.';
export const WIZ_BAND_NOTE = 'Oder das Fenster im Stundenband an seinen zwei Griffen ziehen.';
/** The kinds one can choose on the page „Art der Ausfahrt“ (Jan 19.11.: Strand is not offered any more; an old `sd=` link still opens it). */
export const WIZ_MODE_CHOICES: readonly TripMode[] = Object.freeze(['ort', 'etappe']);
/** The page „Art der Ausfahrt“: per kind what one sets, what one gets, and who it is made for. */
export const WIZ_MODE_GUIDE: Readonly<Record<TripMode, { give: string; get: string; fits: string }>> = Object.freeze({
  ort: {
    give: 'Den Spot, an dem du startest, das Boot im Umkreis von 5 km und wann du raus- und wieder zurückfährst.',
    get: 'Stunde für Stunde Wind, Böen, Welle und Strom am Spot, gemessen an deinen Grenzen.',
    fits: 'Kite, Wing/Surf, SUP/Kajak, Jolle, Angeln: du bleibst in der Nähe des Spots.',
  },
  etappe: {
    give: 'Start, Ziel und Wegpunkte auf der Karte, deine Fahrt in Knoten und die Abfahrt.',
    get: 'Wo du zu jeder vollen Stunde bist, dort Wind, Welle und Strom zu deinem Kurs, dazu die Ankunft.',
    fits: 'Yacht und Motorboot: du fährst von einem Ort zum anderen.',
  },
  strand: {
    give: 'Das Revier und die Stunden, die zählen sollen.',
    get: 'Die Spots des Reviers, geordnet nach Stunden mit Wind von See (oder vom Land).',
    fits: 'Ein Tag am Strand: ohne Profil und ohne Grenzen.',
  },
});
export const WIZ_MODE_GIVE = 'Du gibst an';
export const WIZ_MODE_GET = 'Du bekommst';
export const WIZ_MODE_FITS = 'Passt zu';
export const WIZ_LIMITS_COUNT_NOTE ='Auf der Etappe gezählt werden Hinweise über deinen Grenzen für Wind, Böen und Welle.';

// --- What must stand before one goes on ------------------------------------------------------------------------------

/** What the later pages cannot exist without: a spot (Vor Ort), start and end (Etappe). */
export interface WizCore {
  mode: TripMode;
  /** Vor Ort: the spot is chosen (the plan stands). */
  hasSpot: boolean;
  /** Etappe: points set on the map. */
  points: number;
}
export interface WizFacts extends WizCore {
  /** A window (Vor Ort, Strand) or an arrival (Etappe) stands on the hours of the forecast. */
  hasTime: boolean;
  /** Why there are no hourly values (no valid run, still loading); `null` = there are. */
  noData: string | null;
  limits: Pick<SeaLimits, 'windMin' | 'windMax'>;
}

export const WIZ_NEED_SPOT = 'Wähle zuerst den Spot, von dem du startest.';
export const WIZ_NEED_START = 'Setze Start und Ziel auf der Karte.';
export const WIZ_NEED_END = 'Setze noch das Ziel auf der Karte.';
export const WIZ_NEED_TIME = 'Auf den Stunden der Vorhersage steht gerade kein Fenster.';
export const WIZ_NEED_ARRIVAL = 'Aus Strecke und Fahrt ergibt sich gerade keine Ankunft.';
export const WIZ_LIMITS_CROSSED = '„Wind ab“ liegt über „Wind bis“. So läge jede Stunde außerhalb deiner Grenzen.';

/** What the pages after `step` cannot exist without (a spot; start and end) — the only reason a page ever sends one back. */
export function wizCoreBlock(step: WizStep, f: WizCore): string | null {
  if (step === 'ort') return f.hasSpot ? null : WIZ_NEED_SPOT;
  if (step === 'strecke') return f.points >= 2 ? null : f.points === 0 ? WIZ_NEED_START : WIZ_NEED_END;
  return null;
}
/**
 * Why „Weiter“ does not go on from `step`, in words — `null` = it does. Beyond `wizCoreBlock`: hourly values that are
 * not there (yet) and limits that cross hold „Weiter“, but never send one back from a later page.
 */
export function wizBlock(step: WizStep, f: WizFacts): string | null {
  const core = wizCoreBlock(step, f);
  if (core) return core;
  if (step === 'zeit') return f.noData ?? (f.hasTime ? null : f.mode === 'etappe' ? WIZ_NEED_ARRIVAL : WIZ_NEED_TIME);
  if (step === 'grenzen') return f.limits.windMin != null && f.limits.windMax != null && f.limits.windMin > f.limits.windMax ? WIZ_LIMITS_CROSSED : null;
  return null;
}
/** Index of the furthest page one may open: the first one that still needs something (the last page if none does). */
export function wizReach(f: WizFacts): number {
  const steps = WIZ_STEPS[f.mode];
  const i = steps.findIndex((s) => wizBlock(s, f) != null);
  return i < 0 ? steps.length - 1 : i;
}
/** The page to show for a wanted one: itself, or the first page before it that the following ones cannot exist without. */
export function wizClamp(step: WizStep | null | undefined, f: WizCore): WizStep {
  const steps = WIZ_STEPS[f.mode];
  const want = step ? steps.indexOf(step) : steps.length - 1;
  const need = steps.findIndex((s) => wizCoreBlock(s, f) != null);
  return steps[Math.min(want < 0 ? steps.length - 1 : want, need < 0 ? steps.length - 1 : need)];
}
export function wizNeighbour(mode: TripMode, step: WizStep, by: -1 | 1): WizStep | null {
  const steps = WIZ_STEPS[mode], i = steps.indexOf(step);
  return i < 0 ? null : steps[i + by] ?? null;
}

// --- The step in the link --------------------------------------------------------------------------------------------

/** Form of `ps` — kind of trip and page; the result page writes none, so a link without `ps` opens on the result (E-AM-40). */
export const PS_PARAM_RE = /^(ort|etappe|strand)\.(wer|art|ort|strecke|revier|zeit|grenzen)$/;
export interface WizLink { mode: TripMode; step: WizStep }
export function parseWizParam(raw: string | null | undefined): WizLink | null {
  const m = raw ? PS_PARAM_RE.exec(raw) : null;
  if (!m) return null;
  const mode = m[1] as TripMode, step = m[2] as WizStep;
  return WIZ_STEPS[mode].includes(step) ? { mode, step } : null;
}
export const encodeWizParam = (mode: TripMode, step: WizStep): string | null => (step === 'ergebnis' || !WIZ_STEPS[mode].includes(step) ? null : `${mode}.${step}`);

/** One line of „Deine Angaben“ on the result page: what was set, and the page that changes it. */
export interface WizSummaryRow { label: string; value: string; step: WizStep }
