/**
 * Autobahnwetter · Link auf EINEN Abschnitt (`/autobahnwetter/<strecke>/km-<beginn>`, pur, nur Typ-/Schema-Importe).
 *
 * ── Die Kennung, und die Regel dahinter ─────────────────────────────────────
 * Ein Abschnitt ist ein Stück einer Strecke (`static/corridors.json`) zwischen zwei Anschlussstellen (OSM), 5–25 km lang
 * (`roadSegments.ts`). Seine Kennung in der Seite ist `<Autobahn>[.<Teilstrecke>]-<Beginn-km, 3 Stellen>`: `A8-034`,
 * `A8.2-000`. Der Link trägt genau das, nur als Pfad:
 *
 *     /autobahnwetter/a8/km-034        ⇒  A8-034      (Strecke a8, Abschnitt ab km 34)
 *     /autobahnwetter/a8-2/km-000      ⇒  A8.2-000    (Teilstrecke 2 der A8)
 *
 * Autobahnnummer und Beginn-km sind die Merkmale; die Strecke steht im Pfad davor, damit der Link ohne Tabelle lesbar ist
 * (auch für die Vorschau der Edge Function). Ändern sich die Abschnittsgrenzen beim nächsten Bau der Datei (neue
 * OSM-Anschlussstellen), löst die Seite den Link nach dieser Regel auf: erst die genaue Kennung, sonst der Abschnitt
 * DERSELBEN Strecke, der den km des Links enthält (`kmFrom ≤ km < kmTo`) — mit Hinweis —, sonst „gibt es nicht".
 *
 * ── Der Zeitpunkt im Link ───────────────────────────────────────────────────
 * Die Seite führt die Zeit als Stunden voraus (`t=0…6`). Ein geteilter Link mit `t=3` würde für den Empfänger, der später
 * öffnet, einen anderen Zeitpunkt zeigen, ohne es zu sagen. Deshalb steht im Link der ABSOLUTE Zeitpunkt (volle Stunde, UTC:
 * `t=2026-11-02T17:00Z`, wie auf den anderen Seiten); beim Öffnen wird er zurück in Stunden gerechnet. Liegt er vorbei
 * oder jenseits der +6 h, klemmt die Seite auf „jetzt" bzw. +6 h und sagt es (`StaleLinkNotice`). Der Zustand ist sonst
 * immer der AKTUELLE — der Link trägt nur die Auswahl, nie Messwerte.
 */

import { formatValidTime, parseValidTime } from '../share/shareSchema';

export const ROAD_KM_SLUG_RE = /^km-(\d{3,4})$/;
/** Dasselbe Vokabular wie `roadState.ts` (Strecke: `a8`, `a8-2`). */
export const ROAD_CORRIDOR_SLUG_RE = /^[a-z][a-z0-9]{0,4}(?:-\d{1,2})?$/;
const SEG_ID_RE = /^([AB]\d{1,3}[A-Z]?)(?:\.(\d{1,2}))?-(\d{3,4})$/;

/** Strecke + `km-NNN` → Abschnitts-Kennung der Seite (`A8-034`); `null`, wenn eines von beiden unlesbar ist. */
export function roadSegIdFromLink(corridor: string | null | undefined, kmSlug: string | null | undefined): string | null {
  if (!corridor || !kmSlug || !ROAD_CORRIDOR_SLUG_RE.test(corridor)) return null;
  const km = ROAD_KM_SLUG_RE.exec(kmSlug);
  if (!km) return null;
  const m = /^([a-z][a-z0-9]*?)(?:-(\d{1,2}))?$/.exec(corridor);
  if (!m) return null;
  const id = `${m[1].toUpperCase()}${m[2] ? `.${m[2]}` : ''}-${km[1]}`;
  return SEG_ID_RE.test(id) ? id : null;
}

/** Abschnitts-Kennung → Pfadteile (`A8.2-034` → strecke `a8-2`, `km-034`); `null` bei unlesbarer Kennung. */
export function roadLinkPartsOf(segId: string | null | undefined): { corridor: string; kmSlug: string; km: number } | null {
  const m = segId ? SEG_ID_RE.exec(segId) : null;
  if (!m) return null;
  return { corridor: `${m[1].toLowerCase()}${m[2] ? `-${m[2]}` : ''}`, kmSlug: `km-${m[3]}`, km: Number(m[3]) };
}

/** Pfad zum Abschnitt (ohne Query). */
export function roadSegPath(segId: string): string | null {
  const p = roadLinkPartsOf(segId);
  return p ? `/autobahnwetter/${p.corridor}/${p.kmSlug}` : null;
}

// ---------------------------------------------------------------------------
// Zeit
// ---------------------------------------------------------------------------

const HOUR = 3_600_000;
/** Die volle Stunde, ab der die Seite „+t h" zählt. */
export const roadBaseHour = (nowMs: number): number => Math.floor(nowMs / HOUR) * HOUR;

/** `t` Stunden voraus → absoluter Zeitpunkt für den Link (`2026-11-02T17:00Z`). */
export const roadTimeToParam = (t: number, nowMs: number): string => formatValidTime(roadBaseHour(nowMs) + t * HOUR);

/**
 * Ein `t` aus dem Link in Stunden. Nur die absolute Form wird umgerechnet — `t=3` (alte Links) bleibt Sache von
 * `parseRoadUrl`. `past`/`beyond` tragen den gemeinten Zeitpunkt, damit die Seite sagen kann, was sie stattdessen zeigt.
 */
export function roadTimeFromParam(raw: string | null, nowMs: number, maxH = 6): { t: number; past: number | null; beyond: number | null } | null {
  if (!raw || !raw.includes('T')) return null;
  const ms = parseValidTime(raw);
  if (ms == null) return null;
  const h = Math.round((ms - roadBaseHour(nowMs)) / HOUR);
  if (h < 0) return { t: 0, past: ms, beyond: null };
  if (h > maxH) return { t: maxH, past: null, beyond: ms };
  return { t: h, past: null, beyond: null };
}

/** Query mit absolutem `t` → Query mit Stunden-`t` (was `parseRoadUrl` versteht) + was geklemmt wurde. */
export function roadNormalizeSearch(search: string, nowMs: number): { search: string; past: number | null; beyond: number | null } {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const conv = roadTimeFromParam(q.get('t'), nowMs);
  if (!conv) return { search, past: null, beyond: null };
  q.set('t', String(conv.t));
  return { search: `?${q.toString()}`, past: conv.past, beyond: conv.beyond };
}

/**
 * Zustand → Adresse. Mit geöffnetem Abschnitt DERSELBEN Strecke steht er im Pfad (`/autobahnwetter/a8/km-034`; `seg` und `ds`
 * entfallen, denn der Pfad bedeutet „Abschnitt, Detailansicht offen"); `t` steht absolut. Sonst unverändert die Query-Form.
 * `base` ist `buildRoadUrl` — hier als Parameter, damit dieses Modul keinen Seitenzustand importiert.
 */
export function roadLinkUrl(
  st: { corridor: string | null; t: number; seg?: string | null },
  base: (s: never) => string,
  state: unknown,
  nowMs: number,
): string {
  const parts = st.seg ? roadLinkPartsOf(st.seg) : null;
  const asPath = !!parts && parts.corridor === st.corridor;
  const s = asPath ? { ...(state as object), seg: null, ds: false } : state;
  let url = base(s as never);
  if (asPath && parts) url = url.replace(`/autobahnwetter/${st.corridor}`, `/autobahnwetter/${st.corridor}/${parts.kmSlug}`);
  if (st.t > 0) url = url.replace(/([?&])t=\d+/, `$1t=${encodeURIComponent(roadTimeToParam(st.t, nowMs))}`);
  return url;
}

// --- Worte (Teilen-Vorschau; keine Daten, nur Werte aus dem Link) -----------

/** `a8` → `A8`, `a8-2` → `A8 (Teilstrecke 2)`. */
export function roadCorridorLabel(corridor: string): string | null {
  if (!ROAD_CORRIDOR_SLUG_RE.test(corridor)) return null;
  const m = /^([a-z][a-z0-9]*?)(?:-(\d{1,2}))?$/.exec(corridor);
  return m ? `${m[1].toUpperCase()}${m[2] ? ` (Teilstrecke ${m[2]})` : ''}` : null;
}

export function describeRoadLink(corridor: string | null, kmSlug: string | null, validAtMs: number | null, whenText: string | null): { title: string; description: string } | null {
  const road = corridor ? roadCorridorLabel(corridor) : null;
  if (!road) return null;
  const km = kmSlug ? ROAD_KM_SLUG_RE.exec(kmSlug) : null;
  const where = km ? `${road}, Abschnitt ab km ${Number(km[1])}` : road;
  const when = validAtMs != null && whenText ? ` · Prognose ${whenText}` : '';
  return {
    title: `${where} — Autobahnwetter${when}`,
    description: km
      ? `Wetterbedingte Hinweise auf dem Abschnitt ab km ${Number(km[1])} der ${road}: Regeln über Messwerte der Glättemeldeanlagen und die Prognose von buscosun Fusion. `
        + 'Der Link zeigt immer die aktuelle Lage. Keine amtliche Verkehrs- oder Wetterwarnung.'
      : `Fahrbahn- und Wetterlage entlang der ${road}: Messwerte der Glättemeldeanlagen und Prognose von buscosun Fusion. `
        + 'Der Link zeigt immer die aktuelle Lage. Keine amtliche Verkehrs- oder Wetterwarnung.',
  };
}

// --- Selbstverifikation (Muster D-12) ---------------------------------------

export interface RoadLinkCheck { name: string; ok: boolean; detail?: string }

export function verifyRoadLink(): { checks: RoadLinkCheck[]; passed: number; failed: number } {
  const checks: RoadLinkCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  add('A8-034 ⇒ /autobahnwetter/a8/km-034', roadSegPath('A8-034') === '/autobahnwetter/a8/km-034', String(roadSegPath('A8-034')));
  add('A8.2-000 ⇒ Teilstrecke a8-2', roadSegPath('A8.2-000') === '/autobahnwetter/a8-2/km-000');
  add('A5A / B-Straße', roadSegPath('A5A-012') === '/autobahnwetter/a5a/km-012' && roadSegPath('B96-120') === '/autobahnwetter/b96/km-120');
  add('Rundlauf Pfad ⇒ Kennung', roadSegIdFromLink('a8-2', 'km-034') === 'A8.2-034' && roadSegIdFromLink('a8', 'km-034') === 'A8-034' && roadSegIdFromLink('a5a', 'km-012') === 'A5A-012');
  for (const [c, k] of [['a8', 'km-34'], ['a8', 'x'], ['A8', 'km-034'], ['a8-2-3', 'km-034'], ['', 'km-034'], ['a8', 'km-03a'], ['../x', 'km-034']] as const) {
    add(`ungültig: ${c} / ${k}`, roadSegIdFromLink(c, k) === null);
  }
  const now = Date.UTC(2026, 10, 2, 14, 37);
  add('Zeit: +3 h ⇒ volle Stunde, UTC', roadTimeToParam(3, now) === '2026-11-02T17:00Z', roadTimeToParam(3, now));
  const back = roadTimeFromParam('2026-11-02T17:00Z', now);
  add('Zeit: Rundlauf +3 h', back?.t === 3 && back.past == null && back.beyond == null);
  add('Zeit: vorbei ⇒ jetzt + past', roadTimeFromParam('2026-11-02T10:00Z', now)?.t === 0 && roadTimeFromParam('2026-11-02T10:00Z', now)?.past != null);
  add('Zeit: jenseits +6 h ⇒ 6 + beyond', roadTimeFromParam('2026-11-03T10:00Z', now)?.t === 6 && roadTimeFromParam('2026-11-03T10:00Z', now)?.beyond != null);
  add('Zeit: alte Stundenform bleibt unberührt', roadTimeFromParam('3', now) === null && roadNormalizeSearch('?t=3', now).search === '?t=3');
  const base = (s: never) => { const x = s as { corridor: string; t: number; seg?: string | null; ds?: boolean }; return `/autobahnwetter/${x.corridor}${x.t ? `?t=${x.t}` : ''}${x.seg ? `${x.t ? '&' : '?'}seg=${x.seg}` : ''}`; };
  const url = roadLinkUrl({ corridor: 'a8', t: 3, seg: 'A8-034' }, base, { corridor: 'a8', t: 3, seg: 'A8-034' }, now);
  add('URL: Abschnitt im Pfad, Zeit absolut, kein seg in der Query', url === '/autobahnwetter/a8/km-034?t=2026-11-02T17%3A00Z', url);
  const other = roadLinkUrl({ corridor: 'a9', t: 0, seg: 'A8-034' }, base, { corridor: 'a9', t: 0, seg: 'A8-034' }, now);
  add('URL: Abschnitt einer ANDEREN Strecke bleibt in der Query-Form', other === '/autobahnwetter/a9?seg=A8-034', other);
  const d = describeRoadLink('a8', 'km-034', null, null);
  add('Vorschau nennt Autobahn und km, grenzt von Warnungen ab', !!d && d.title.startsWith('A8, Abschnitt ab km 34') && d.description.includes('Keine amtliche Verkehrs- oder Wetterwarnung'), d?.title);
  add('Vorschau: Teilstrecke', describeRoadLink('a8-2', null, null, null)?.title === 'A8 (Teilstrecke 2) — Autobahnwetter');
  add('Vorschau: unlesbare Strecke ⇒ null', describeRoadLink('Quatsch', 'km-034', null, null) === null);
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
