/**
 * Teilen · Adapter je Feature-Seite (Phase SH1).
 *
 * EIN Ort je Seite, an dem steht, wie aus dem Zustand ein Link wird und aus
 * einem Link wieder ein Zustand — und wie beides in Worte gefasst wird.
 * Dieselbe Datei bedient
 *
 *  - das Share-Sheet (SH2, Vorschau + Kanäle),
 *  - `verify:share` (Rundlauf, Lesbarkeit, Längen),
 *  - ab SH6 die Netlify Edge Function für `og:title`/`og:description`.
 *
 * **Ein Parser, nicht zwei** (Jans Vorgabe): Wer die OG-Meta baut, benutzt
 * `parseShareUrl` — nicht eine zweite, „serverseitige" Auslegung derselben
 * Query.
 *
 * SH1 deckte die drei Seiten ab, deren Zustand schon in Pfad + Query lebte
 * (Wetterkarte, Warnungen, Regenradar); **SH3** brachte Waldbrand und Atmosphäre
 * dazu, **SH4** Eventplanung, Wetterarchiv und Globus, **SH5** die Vorhersage.
 * Damit sind acht der neun Feature-Seiten teilbar; die Tourenplanung ist
 * bewusst nicht dabei — eine GPX passt in keine URL, und ein Link, aus dem der
 * Empfänger die Strecke nicht sieht, verspricht mehr als er hält
 * (`audit/teilen-share.md` §1.8, Jans Entscheidung E-4).
 *
 * ── Zwei Bauarten, und warum ────────────────────────────────────────────────
 * Für die Kartenseiten wird die URL aus dem geparsten Zustand **neu gebaut** —
 * dort kennt dieses Modul das Vokabular ohnehin (`urlState.ts` ist eager).
 * Für Waldbrand und Atmosphäre wird der Pfad übernommen und nur die **Query
 * gefiltert**: ihr Wrapper schreibt die URL bereits kanonisch, und ein
 * Neuaufbau hier würde `fireUrl.ts`/`atmosphereUrl.ts` samt Fire-Modell,
 * EFFIS-Körben und Schnittgeometrie in den Share-Chunk ziehen — mehrere KB, die
 * jeder Kartennutzer beim ersten Klick mitlädt, ohne je das Brandradar zu
 * öffnen. Zu tun bleibt hier genau das, was der Wrapper NICHT tut: die
 * Diagnose-Schalter und Tracking-Parameter entfernen.
 */

import type { Location } from '../types';
import type { LayerKey } from '../map/layerTypes';
import { ROUTE_BY_ID, SITE_URL } from '../router/routes';
import {
  buildMapUrl, buildRadarUrl, layersFromRoute, parseMapSearch,
  LAYER_SLUGS, LAYER_SLUG_DESCRIPTION, type MapCamera,
} from '../router/urlState';
// Kurzlabel des Layers („Wind", „Böen") — dieselbe Quelle wie das Dock und die
// Sub-Routen-Texte. `LAYER_SLUG_TITLE` wäre hier redundant („Wetterkarte … — Windkarte").
import { LAYER_CATALOG } from '../map/layerCatalog';
import { ogCardPath } from './ogCard';
import { resolveRoutePlace, slugForPlace } from './placeTable';
import { encodeShareQuery, parseValidTime, roundTo, shareableExtras, shareLengthVerdict, type ShareLengthVerdict } from './shareSchema';
import { shareCopy, shareMessage, type ShareCopy } from './shareText';

export type ShareRouteId =
  | 'wetterkarte' | 'warnungen' | 'regenradar'
  | 'waldbrand' | 'atmosphaere' | 'eventplanung' | 'wetterarchiv' | 'globus' | 'vorhersage';

export const SHARE_ROUTES: readonly ShareRouteId[] = [
  'wetterkarte', 'warnungen', 'regenradar', 'waldbrand', 'atmosphaere', 'eventplanung', 'wetterarchiv', 'globus', 'vorhersage',
];

/** Seiten, deren URL übernommen (und nur gefiltert) statt neu gebaut wird. */
const PASSTHROUGH: ReadonlySet<ShareRouteId> = new Set([
  'waldbrand', 'atmosphaere', 'eventplanung', 'wetterarchiv', 'globus', 'vorhersage',
]);

/** Welche Durchreiche-Seite trägt den Ort im Pfad — und an welcher Stelle? */
const PLACE_SEGMENT: Readonly<Partial<Record<ShareRouteId, 1 | 2>>> = {
  atmosphaere: 2,     // hinter der Linse
  eventplanung: 2,    // hinter dem Anlass
  wetterarchiv: 1,    // direkt hinter der Route
  vorhersage: 1,      // dito
};

/** Sicht bzw. Linse im Pfad → Kurzname für den Titel. */
const VIEW_LABEL: Readonly<Record<string, string>> = {
  // Waldbrand
  gefahrenindex: 'Gefahrenindex',
  'aktive-braende': 'Aktive Brände',
  trockenheit: 'Trockenheit',
  historie: 'Historie',
  thermalanomalien: 'Thermalanomalien',
  // Atmosphäre
  'berg-und-weg': 'Föhn, Berg & Weg',
  fliegen: 'Thermik & Fliegen',
  querschnitt: 'Querschnitt',
  arbeitsfenster: 'Arbeitsfenster',
  // Eventplanung (Anlass)
  grillen: 'Grillen', hochzeit: 'Hochzeit', wandern: 'Wandern', drohne: 'Drohnenflug',
  fotografie: 'Fotografie', sterne: 'Sternenhimmel', radtour: 'Radtour', picknick: 'Picknick',
  laufen: 'Laufen', baden: 'Baden',
};

/** Kurzname der Ansicht für Titel und Nachricht. */
export const SHARE_FEATURE_LABEL: Readonly<Record<ShareRouteId, string>> = {
  wetterkarte: 'Wetterkarte',
  warnungen: 'Amtliche Warnungen',
  regenradar: 'Regenradar',
  waldbrand: 'Brandradar',
  atmosphaere: 'Atmosphäre',
  eventplanung: 'Event-Planung',
  wetterarchiv: 'Wetterarchiv',
  globus: 'Globus',
  vorhersage: 'Vorhersage',
};

export interface ShareState {
  routeId: ShareRouteId;
  place: Location | null;
  /** Alle aktiven Layer (nur Wetterkarte/Warnungen). */
  layers: LayerKey[];
  primary: LayerKey | null;
  cam: MapCamera | null;
  /** Absolute Gültigkeitszeit in ms; `null` = jetzt. */
  validAtMs: number | null;
  model?: string | null;
  point?: 'fusion' | 'native';
  radar?: boolean;
  /** Fremde Query-Schlüssel, die erhalten bleiben (bereits gefiltert). */
  extra: Array<[string, string]>;
  /** Sicht/Linse im Pfad (Waldbrand, Atmosphäre) — `null` bei den Kartenseiten. */
  viewSlug?: string | null;
  /** Übernommener Pfad der Durchreiche-Seiten (samt Ortssegment). */
  rawPath?: string;
  /** Übernommene, bereits gefilterte Query-Paare der Durchreiche-Seiten. */
  rawQuery?: Array<[string, string]>;
  /** Der geteilte Zeitpunkt lag beim Öffnen in der Vergangenheit (V-SH-2). */
  timePast?: boolean;
  /** Der Ort-Slug im Pfad ließ sich nicht auflösen. */
  placeUnresolved?: boolean;
}

export interface ShareUrl {
  /** Vollständige URL inklusive Origin — das, was kopiert und verschickt wird. */
  url: string;
  /** Pfad + Query ohne Origin (für `navigate`/`replaceState`). */
  path: string;
  verdict: ShareLengthVerdict;
  copy: ShareCopy;
  /** Titel + Link, fertig für WhatsApp. */
  message: string;
}

// --- Zustand → Link -----------------------------------------------------------

/**
 * Zustand → teilbarer Link. Diagnose-Schalter (`?lz=0`, `?radarcdn=0`, …) und
 * Tracking-Parameter werden dabei entfernt — ein geteilter Link trägt den
 * Zustand, nicht die Werkstatt (`SHARE_BLOCKED_KEYS`).
 */
export function buildShareUrl(s: ShareState, origin: string = SITE_URL, nowMs: number = Date.now()): ShareUrl {
  const slugged = s.place ? slugForPlace(s.place) : null;
  const extra = shareableExtras(s.extra ?? []);
  // Absolute Zeit → Slider-Stunde, die `buildMapUrl` wieder in ein absolutes
  // `t=` zurückrechnet. Der Umweg hält EINE Zeitformel im Repo.
  const hour = s.validAtMs != null ? Math.max(0, (s.validAtMs - nowMs) / 3_600_000) : 0;

  // Durchreiche: Pfad übernehmen, Query nur filtern (s. Kopfkommentar).
  if (PASSTHROUGH.has(s.routeId)) {
    const path = (s.rawPath ?? '/') + encodeShareQuery(shareableExtras(s.rawQuery ?? []));
    const url = origin + path;
    const copy = describeShareState(s);
    return { url, path, verdict: shareLengthVerdict(url), copy, message: shareMessage(copy, url) };
  }

  const path = s.routeId === 'regenradar'
    ? buildRadarUrl(s.place, slugged, s.cam, extra)
    : buildMapUrl({
      primary: s.primary, layers: s.layers, cam: s.cam, hour,
      model: s.model, point: s.point, radar: s.radar,
      place: s.place,
      placeSlug: slugged?.slug ?? null, placeInTable: !!slugged?.inTable,
    }, nowMs, s.routeId === 'warnungen' ? '/warnungen' : '/wetterkarte', extra);

  const url = origin + path;
  const copy = describeShareState(s);
  return { url, path, verdict: shareLengthVerdict(url), copy, message: shareMessage(copy, url) };
}

// --- Link → Zustand -----------------------------------------------------------

/** Pfad + Query → Zustand; `null`, wenn die Route (noch) nicht teilbar ist. */
export function parseShareUrl(pathname: string, search: string, nowMs: number = Date.now()): ShareState | null {
  const seg = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const head = seg[0] ?? '';
  const routeId: ShareRouteId | null = (SHARE_ROUTES as readonly string[]).includes(head) ? (head as ShareRouteId) : null;
  if (!routeId) return null;

  // Waldbrand und Atmosphäre: Pfad übernehmen, Query filtern. Ort und Zeit
  // liest auch hier NUR der gemeinsame Wortschatz — kein Feature-Modul.
  if (PASSTHROUGH.has(routeId)) {
    const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const pairs: Array<[string, string]> = [...q.entries()];
    // Beim Wetterarchiv steht an Stelle 1 der ORT, bei den anderen die Sicht.
    const placeAt = PLACE_SEGMENT[routeId];
    const viewSlug = placeAt === 1 ? null : seg[1] ?? null;
    const rp = resolveRoutePlace(placeAt ? seg[placeAt] : undefined, placeFromPairs(q));
    const t = parseValidTime(q.get('t'));
    return {
      routeId,
      place: rp.place,
      layers: [], primary: null, cam: null,
      validAtMs: t != null && t > nowMs ? t : null,
      extra: shareableExtras(pairs),
      timePast: t != null && t <= nowMs ? true : undefined,
      placeUnresolved: rp.unresolved,
      viewSlug,
      rawPath: '/' + seg.join('/'),
      rawQuery: pairs,
    };
  }

  const parsed = parseMapSearch(search, nowMs);
  // Die Zeit kommt DIREKT aus `t=`, nicht über die Slider-Stunde.
  // `parseMapSearch` rundet die Stunde auf 10-Minuten-Schritte **relativ zu
  // jetzt** — für die Karte richtig (ihre Schritte liegen auf diesem Raster),
  // für einen Text falsch: aus `t=2027-01-08T15:00Z` wurde je nach Uhrzeit des
  // Lesers „15:59" statt „16:00". Gefunden am 2026-09-09 an der echten
  // Crawler-Antwort der Edge Function. Der geteilte Zeitpunkt ist absolut
  // (Jans Vorgabe), also wird er auch absolut gelesen.
  const tExact = parseValidTime(new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('t'));
  const layerSlug = routeId === 'wetterkarte' ? seg[1] : routeId === 'warnungen' ? LAYER_SLUGS.warnings : undefined;
  const ortSlug = routeId === 'wetterkarte' ? seg[2] : seg[1];
  const rp = resolveRoutePlace(ortSlug, parsed.place);
  const route = routeId === 'regenradar'
    ? { primary: null, all: [] as LayerKey[] }
    : layersFromRoute(layerSlug, parsed.l);

  return {
    routeId,
    place: rp.place,
    layers: route.all,
    primary: route.primary,
    cam: parsed.cam,
    validAtMs: tExact != null && tExact > nowMs
      ? tExact
      : (parsed.hour != null && parsed.hour > 0 ? nowMs + parsed.hour * 3_600_000 : null),
    model: parsed.model,
    point: parsed.point,
    radar: parsed.radar,
    extra: shareableExtras(parsed.extra),
    timePast: parsed.timePast,
    placeUnresolved: rp.unresolved,
  };
}

// --- Zustand → Worte ----------------------------------------------------------

/** Titel, Beschreibung und Nachricht zu einem Zustand (auch für die OG-Meta). */
export function describeShareState(s: ShareState, timeZone?: string): ShareCopy {
  const feature = SHARE_FEATURE_LABEL[s.routeId];
  const topic = s.routeId === 'wetterkarte' && s.primary
    ? LAYER_CATALOG[s.primary].label
    : (s.viewSlug ? VIEW_LABEL[s.viewSlug] ?? null : null);
  const description = s.routeId === 'wetterkarte' && s.primary
    ? LAYER_SLUG_DESCRIPTION[s.primary]
    : subRouteDescription(s.routeId, s.viewSlug);
  return shareCopy({
    feature,
    topic: topic || null,
    place: s.place,
    validAtMs: s.validAtMs,
    description,
  }, 'de', timeZone);
}

/** Beschreibung der Sub-Route aus der EINEN Routen-Tabelle (kein zweiter Text). */
function subRouteDescription(routeId: ShareRouteId, viewSlug: string | null | undefined): string | null {
  const def = ROUTE_BY_ID[routeId];
  if (!def) return null;
  const sub = viewSlug ? def.subs?.find((x) => x.slug === viewSlug) : null;
  return sub?.description ?? def.meta.description ?? null;
}

/**
 * Ort aus `ort`/`olat`/`olon`/`land` — derselbe Wortschatz wie auf der Karte.
 *
 * ⚠ `Number(null)` und `Number('')` sind **0**, nicht `NaN`. Bis SH6 stand hier
 * `Number(q.get('olat'))`, und jede Durchreiche-URL mit Ortssegment, aber ohne
 * Koordinaten-Paar (`/vorhersage/stuttgart`) bekam still einen Ort auf
 * **0°/0°** im Atlantik — mit richtigem Namen aus der Tabelle, deshalb fiel es
 * nirgends auf. Sichtbar wurde es erst am Cache-Schlüssel des Vorschaubilds
 * (`o:0.00,0.00` für JEDEN Ort). Die Werte werden deshalb erst geprüft und
 * dann gelesen, nie umgekehrt.
 */
function placeFromPairs(q: URLSearchParams): Location | null {
  const latRaw = q.get('olat'), lonRaw = q.get('olon');
  if (!latRaw || !lonRaw) return null;
  const lat = Number(latRaw), lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const land = (q.get('land') ?? '').toUpperCase();
  return {
    name: (q.get('ort') ?? '').trim(),
    lat: roundTo(lat, 4), lon: roundTo(lon, 4),
    country: land === 'AT' || land === 'CH' ? land : 'DE',
  };
}

/** Bequemer Weg für die Edge Function (SH6): Link → Worte, in einem Schritt. */
export function describeShareUrl(
  pathname: string, search: string, nowMs: number = Date.now(), timeZone?: string,
): ShareCopy | null {
  const st = parseShareUrl(pathname, search, nowMs);
  return st ? describeShareState(st, timeZone) : null;
}

// --- Vorschaubild zum Zustand (SH6) -------------------------------------------

/**
 * Welche Vorschaukarte gehört zu diesem Zustand?
 *
 * Die Sicht im Pfad entscheidet (`/waldbrand/historie`), bei den Kartenseiten
 * der **Hauptlayer** (`/wetterkarte/wind` ⇒ `wetterkarte-wind.png`). Zwei
 * Sonderfälle, beide vom Bestand erzwungen:
 *  · `/warnungen` trägt den Layer `warnings` als Hauptlayer, hat aber keine
 *    Sub-Route — die Karte heißt wie die Route.
 *  · `/wetterkarte?l=warnungen` zeigt inhaltlich die Warnungen; es gibt bewusst
 *    keine eigene Karte dafür (der Pfad `/wetterkarte/warnungen` ist ein
 *    Cross-Alias auf `/warnungen`), also nimmt sie dessen Karte.
 */
export function ogCardForShare(s: ShareState): string | null {
  const view = s.viewSlug ?? (s.primary ? LAYER_SLUGS[s.primary] : null);
  if (s.routeId === 'warnungen') return ogCardPath('warnungen');
  if (s.routeId === 'wetterkarte' && view === LAYER_SLUGS.warnings) return ogCardPath('warnungen');
  return ogCardPath(s.routeId, view);
}

// --- Kanonischer Cache-Schlüssel (SH6 vorbereitet) -----------------------------

/**
 * Normalisierter Parameter-String als Cache-Schlüssel für das Vorschaubild.
 * Er entsteht aus dem GEPARSTEN Zustand, nicht aus der rohen Query — dadurch
 * erzeugt weder eine andere Schlüsselreihenfolge noch ein unbekannter Parameter
 * noch ein Zoom-Rauschen von 0,01 einen zweiten Eintrag.
 */
export function canonicalShareKey(s: ShareState): string {
  const parts: string[] = [s.routeId];
  if (s.viewSlug) parts.push(`v:${s.viewSlug}`);
  if (s.primary) parts.push(`l:${LAYER_SLUGS[s.primary]}`);
  const rest = s.layers.filter((k) => k !== s.primary).map((k) => LAYER_SLUGS[k]).sort();
  if (rest.length) parts.push(`l+:${rest.join(',')}`);
  if (s.place) {
    const sl = slugForPlace(s.place);
    parts.push(sl?.inTable ? `o:${sl.slug}` : `o:${s.place.lat.toFixed(2)},${s.place.lon.toFixed(2)}`);
  }
  // Auf die volle Stunde: ein Vorschaubild je Stunde reicht, und der Cache
  // zerfasert nicht an Zehn-Minuten-Schritten.
  if (s.validAtMs != null) parts.push(`t:${new Date(Math.floor(s.validAtMs / 3_600_000) * 3_600_000).toISOString().slice(0, 13)}`);
  return parts.join('|');
}
