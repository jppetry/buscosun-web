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
 * SH1 deckt die drei Seiten ab, deren Zustand schon in Pfad + Query lebt:
 * Wetterkarte, Warnungen, Regenradar. Waldbrand, Atmosphäre, Event,
 * Wetterarchiv und Globus kommen in SH3/SH4 dazu, wenn ihr Zustand aus dem
 * Fragment umgezogen ist (ein `#` erreicht den Server nie, `audit/teilen-share.md` §1.2).
 */

import type { Location } from '../types';
import type { LayerKey } from '../map/layerTypes';
import { SITE_URL } from '../router/routes';
import {
  buildMapUrl, buildRadarUrl, layersFromRoute, parseMapSearch, placeFromRoute,
  LAYER_SLUGS, LAYER_SLUG_DESCRIPTION, type MapCamera,
} from '../router/urlState';
// Kurzlabel des Layers („Wind", „Böen") — dieselbe Quelle wie das Dock und die
// Sub-Routen-Texte. `LAYER_SLUG_TITLE` wäre hier redundant („Wetterkarte … — Windkarte").
import { LAYER_CATALOG } from '../map/layerCatalog';
import { placeBySlug, slugForPlace } from './placeTable';
import { shareableExtras, shareLengthVerdict, type ShareLengthVerdict } from './shareSchema';
import { shareCopy, shareMessage, type ShareCopy } from './shareText';

export type ShareRouteId = 'wetterkarte' | 'warnungen' | 'regenradar';

export const SHARE_ROUTES: readonly ShareRouteId[] = ['wetterkarte', 'warnungen', 'regenradar'];

/** Kurzname der Ansicht für Titel und Nachricht. */
export const SHARE_FEATURE_LABEL: Readonly<Record<ShareRouteId, string>> = {
  wetterkarte: 'Wetterkarte',
  warnungen: 'Amtliche Warnungen',
  regenradar: 'Regenradar',
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
  const routeId: ShareRouteId | null =
    head === 'wetterkarte' ? 'wetterkarte' : head === 'warnungen' ? 'warnungen' : head === 'regenradar' ? 'regenradar' : null;
  if (!routeId) return null;

  const parsed = parseMapSearch(search, nowMs);
  const layerSlug = routeId === 'wetterkarte' ? seg[1] : routeId === 'warnungen' ? LAYER_SLUGS.warnings : undefined;
  const ortSlug = routeId === 'wetterkarte' ? seg[2] : seg[1];
  const rp = placeFromRoute(ortSlug, parsed.place, placeBySlug);
  const route = routeId === 'regenradar'
    ? { primary: null, all: [] as LayerKey[] }
    : layersFromRoute(layerSlug, parsed.l);

  return {
    routeId,
    place: rp.place,
    layers: route.all,
    primary: route.primary,
    cam: parsed.cam,
    validAtMs: parsed.hour != null && parsed.hour > 0 ? nowMs + parsed.hour * 3_600_000 : null,
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
export function describeShareState(s: ShareState): ShareCopy {
  const feature = SHARE_FEATURE_LABEL[s.routeId];
  const topic = s.routeId === 'wetterkarte' && s.primary ? LAYER_CATALOG[s.primary].label : null;
  const description = s.routeId === 'wetterkarte' && s.primary ? LAYER_SLUG_DESCRIPTION[s.primary] : null;
  return shareCopy({
    feature,
    topic: topic || null,
    place: s.place,
    validAtMs: s.validAtMs,
    description,
  });
}

/** Bequemer Weg für die Edge Function (SH6): Link → Worte, in einem Schritt. */
export function describeShareUrl(pathname: string, search: string, nowMs: number = Date.now()): ShareCopy | null {
  const st = parseShareUrl(pathname, search, nowMs);
  return st ? describeShareState(st) : null;
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
