/**
 * `/atmosphaere/:lens?/:ort?` — Linse im Pfad (`fliegen` · `berg-und-weg` ·
 * `querschnitt` · `arbeitsfenster`), Ort als lesbares letztes Segment,
 * Unterlinse des Querschnitts in `?ansicht=`, der übrige Zustand in der Query
 * (`t`, `nerd`, `marker`, `schnitt` — `src/atmosphere/atmosphereUrl.ts`).
 *
 * ── SH3: der Zustand ist aus dem Fragment gewandert ──────────────────────────
 * Bis 2026-09-08 lag er als prozentkodiertes JSON in `#atm=` (und davor `#3d=`).
 * Ein Fragment erreicht den Server nie — damit war für diese Seite kein
 * Vorschaubild und kein zustandsbezogener `og:title` möglich
 * (`audit/teilen-share.md` §1.2). Jetzt steht alles in Pfad + Query, und
 * **dieser Wrapper ist der einzige Schreiber** (Muster `WetterkarteRoute`, RT1):
 * der Store meldet seinen Zustand per `onUrlState`, hier entsteht daraus die URL.
 *
 * Alt-Links laufen weiter: beim Ankommen wird `#atm=`/`#3d=` einmal gelesen, in
 * Pfad + Query übersetzt und per `replace` ersetzt. Die Codecs bleiben Leser.
 *
 * Pfad und Query werden an EINER Stelle gerechnet (`urlFor`) und pro Tick einmal
 * geschrieben, damit Linsen- und Unterlinsen-Wechsel im selben Commit nicht zwei
 * Einträge erzeugen.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router';
import AtmospherePage, { type DeckSub } from '../../atmosphere/AtmospherePage';
import type { Lens } from '../../atmosphere/atmosphereState';
import { decodeState as decodeAtmHash } from '../../atmosphere/atmosphereState';
import { decodeState as decodeThreeD, hasThreeDHash } from '../../threed/threedState';
import {
  buildAtmosphereSearch, parseAtmosphereQuery, validAtFromHour, type AtmosphereUrlState,
} from '../../atmosphere/atmosphereUrl';
import { resolveRoutePlace, slugForPlace } from '../../share/placeTable';
import { ATMOSPHERE_LENS_SLUGS, ATMOSPHERE_WORK_WINDOW_SLUG } from '../routes';
import { useAppNav } from '../useAppNav';
import StaleLinkNotice from '../../share/StaleLinkNotice';
import NotFoundRoute from './NotFoundRoute';

const SLUG_TO_LENS: Record<string, Lens> = {
  [ATMOSPHERE_LENS_SLUGS.fly]: 'fly',
  [ATMOSPHERE_LENS_SLUGS.mountain]: 'mountain',
  [ATMOSPHERE_LENS_SLUGS.section]: 'section',
  [ATMOSPHERE_WORK_WINDOW_SLUG]: 'section',
};
/** Sub-Route mit eigener Unterlinse (der Rest kommt aus `?ansicht=`). */
const SLUG_TO_SUB: Record<string, DeckSub> = { [ATMOSPHERE_WORK_WINDOW_SLUG]: 'gonogo' };
const SUBS: readonly DeckSub[] = ['hoehenwind', 'inversion', 'gonogo'];

const STATE_DEBOUNCE_MS = 300;

/** Kanonische URL aus Linse, Unterlinse, Ort und Zustand. Die EINE Stelle. */
function urlFor(lens: Lens, sub: DeckSub, st: AtmosphereUrlState | null, extra: ReadonlyArray<[string, string]>): string {
  const base = lens === 'section' && sub === 'gonogo'
    ? `/atmosphaere/${ATMOSPHERE_WORK_WINDOW_SLUG}`
    : `/atmosphaere/${ATMOSPHERE_LENS_SLUGS[lens]}`;
  const slug = st?.place ? slugForPlace(st.place) : null;
  const path = slug ? `${base}/${slug.slug}` : base;
  // `ansicht` bleibt Query und gehört dem Wrapper — deshalb hier, nicht im Codec.
  const withSub: Array<[string, string]> = lens === 'section' && sub === 'inversion' ? [['ansicht', 'inversion']] : [];
  const rest = extra.filter(([k]) => k !== 'ansicht');
  return path + buildAtmosphereSearch(st ?? { place: null, validAtMs: null, nerd: false, marker: null, cut: [] }, slug, [...withSub, ...rest]);
}

export default function AtmosphereRoute() {
  const { lens: slug, ort } = useParams<{ lens?: string; ort?: string }>();
  const loc = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const nav = useAppNav();

  const lens = slug ? SLUG_TO_LENS[slug] ?? null : null;
  const parsed = useMemo(() => parseAtmosphereQuery(loc.search, Date.now()), [loc.search]);
  const ansichtRaw = new URLSearchParams(loc.search).get('ansicht');
  const subFromQuery = (SUBS as readonly string[]).includes(ansichtRaw ?? '') ? (ansichtRaw as DeckSub) : null;
  // Der Pfad schlägt die Query: `/atmosphaere/arbeitsfenster?ansicht=inversion` bleibt Go/No-Go.
  const initialSub = (slug ? SLUG_TO_SUB[slug] : null) ?? subFromQuery;

  /**
   * Alt-Link (`#atm=` / `#3d=`) → Pfad + Query, EINMAL beim Ankommen.
   * Wird vor dem ersten Render gerechnet, damit die Seite gar nicht erst mit
   * dem alten Zustand mountet.
   */
  const legacy = useMemo(() => {
    if (typeof window === 'undefined' || !loc.hash) return null;
    const atm = decodeAtmHash(loc.hash);
    if (atm) {
      const place = atm.loc ? { name: atm.loc.name, lat: atm.loc.lat, lon: atm.loc.lon, country: atm.loc.country } : null;
      return {
        lens: atm.lens,
        state: {
          place,
          validAtMs: validAtFromHour(atm.hour, Date.now()),
          nerd: atm.nerd,
          marker: atm.marker,
          cut: atm.cut,
        } satisfies AtmosphereUrlState,
      };
    }
    const td = hasThreeDHash(loc.hash) ? decodeThreeD(loc.hash) : null;
    if (td) {
      const place = td.loc ? { name: td.loc.name, lat: td.loc.lat, lon: td.loc.lon, country: td.loc.country } : null;
      return { lens: 'section' as Lens, state: { place, validAtMs: null, nerd: false, marker: null, cut: td.points } satisfies AtmosphereUrlState };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ort: Pfadsegment (Tabellenort) und/oder ort/olat/olon (freier Ort).
  const routePlace = useMemo(() => resolveRoutePlace(ort, parsed.place), [ort, parsed.place]);

  const initialUrl = useMemo<AtmosphereUrlState>(() => legacy?.state ?? ({
    place: routePlace.place,
    validAtMs: parsed.validAtMs,
    nerd: parsed.nerd,
    marker: parsed.marker,
    cut: parsed.cut,
  }), [legacy, routePlace.place, parsed.validAtMs, parsed.nerd, parsed.marker, parsed.cut]);

  const lensRef = useRef<Lens | null>(legacy?.lens ?? lens);
  const subRef = useRef<DeckSub>(initialSub ?? 'hoehenwind');
  const stateRef = useRef<AtmosphereUrlState | null>(initialUrl);
  const extraRef = useRef<Array<[string, string]>>(parsed.extra);
  const pendingRef = useRef(false);
  const replaceRef = useRef(false);

  /** Ein Schreibvorgang je Tick — Linse und Unterlinse melden im selben Commit. */
  const syncUrl = useCallback((replace: boolean) => {
    if (replace) replaceRef.current = true;
    if (pendingRef.current) return;
    pendingRef.current = true;
    queueMicrotask(() => {
      pendingRef.current = false;
      const asReplace = replaceRef.current;
      replaceRef.current = false;
      const l = lensRef.current;
      if (!l) return;
      const here = window.location.pathname + window.location.search + window.location.hash;
      const target = urlFor(l, subRef.current, stateRef.current, extraRef.current);
      if (target === here) return;
      void navigate(target, { replace: asReplace });
    });
  }, [navigate]);

  // Zustandsänderungen sind kein Seitenwechsel: replaceState am Router vorbei,
  // gebündelt (der Zeit-Scrubber feuert sonst je Pixel einen History-Eintrag).
  const timer = useRef<number | null>(null);
  const unmountedRef = useRef(false);
  const onUrlState = useCallback((st: AtmosphereUrlState) => {
    stateRef.current = st;
    if (unmountedRef.current) return;
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (unmountedRef.current || !window.location.pathname.startsWith('/atmosphaere')) return;
      const l = lensRef.current;
      if (!l) return;
      const url = urlFor(l, subRef.current, stateRef.current, extraRef.current);
      if (url !== window.location.pathname + window.location.search) {
        window.history.replaceState(window.history.state, '', url);
      }
    }, STATE_DEBOUNCE_MS);
  }, []);
  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; if (timer.current != null) window.clearTimeout(timer.current); };
  }, []);

  // Alt-Link oder unbrauchbare Werte: einmal kanonisch nachziehen (und das
  // Fragment loswerden — es ist der Grund, warum es diese Etappe gibt).
  useEffect(() => {
    if (slug && !lens && !legacy) return;
    if (legacy || parsed.invalid.length || routePlace.unresolved || (parsed.place && !ort)) {
      const l = lensRef.current ?? lens ?? 'mountain';
      void navigate(urlFor(l, subRef.current, stateRef.current, extraRef.current), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLensChange = useCallback((l: Lens, initial: boolean) => {
    lensRef.current = l;
    syncUrl(initial);
  }, [syncUrl]);

  // Unterlinsen-Wechsel ist kein Seitenwechsel: immer `replace` (wie bisher).
  const onSubChange = useCallback((sub: DeckSub) => {
    subRef.current = sub;
    syncUrl(true);
  }, [syncUrl]);

  if (slug && !lens) return <NotFoundRoute />;

  return (
    <>
      <StaleLinkNotice at={parsed.timePast ? parsed.wantedAtMs : null} shows="die Lage für jetzt" />
      <AtmospherePage
        onBack={nav.goHome}
        onOpenFeature={nav.openFeature}
        initialLens={legacy?.lens ?? lens}
        routeLens={navType === 'POP' ? lens : undefined}
        initialSub={initialSub}
        routeSub={navType === 'POP' ? initialSub : undefined}
        onLensChange={onLensChange}
        onSubChange={onSubChange}
        initialUrl={initialUrl}
        onUrlState={onUrlState}
      />
    </>
  );
}
