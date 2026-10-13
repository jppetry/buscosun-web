/**
 * AW-7.2 — Detail text of a segment (`audit/autobahnwetter-gefahren.md` §Detailtext): rule-based sentence templates over
 * the hazard entry (`why` carries the inputs with value and source), the stations of the segment and the segment's site
 * features. No language model. Order: 1) the road now with value, source and time; 2) why (dew point, precipitation,
 * wind); 3) site features without a measurement; 4) outlook to +6 h, always "laut Prognose"; 5) what nobody measures
 * when an affected hazard touches it.
 *
 * Banned (verified by `verify:road-hazards` with golden texts): imperatives and alarm words („Achtung“, „Gefahr!“,
 * „unbedingt“), all-clear words („frei“, „sicher“), numbers without a source. Allowed: facts with a legal reference
 * (§ 3 Abs. 1 StVO at visibility under 50 m). Times are Europe/Berlin, as everywhere on the page.
 */
import { ROAD_CONDITION_LABEL } from './roadClasses';
import type { RoadSegment } from './roadSegments';
import { ROAD_HAZARD_BY_ID, ROAD_HZ_HOURS, type HzEntry, type RoadHazardId, type RoadLevel } from './roadHazards';

/** Words that never appear in a detail text (the verifier scans every golden text for them). */
export const ROAD_NARRATIVE_BANNED: readonly RegExp[] = Object.freeze([
  /\bAchtung\b/i, /Gefahr!/, /\bunbedingt\b/i, /\bVorsicht\b/i, /\bWarnung\b/, /\bfrei\b/i, /\bsicher\b/i, /\bbitte\b/i,
]);

/** Station names for the sources in `why` (`@K123`), and the one measurement time of the slot. */
export interface NarrativeContext {
  stationName: (id: string) => string | null;
  /** Europe/Berlin `HH:MM` of an instant. */
  hm: (ms: number) => string;
  slotMs: number;
  hours: readonly number[];
  /** Name of the buscosun Fusion stand of the forecast run (E-FR-1), `null` without a run. */
  fusion: string | null;
}

const dec = (v: number, d = 1) => v.toFixed(d).replace('.', ',').replace('-', '−');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** `key:value@src` → parts. */
export function parseWhy(s: string): { key: string; value: string; src: string } | null {
  const m = /^([^:]+):(.*)@([^@]+)$/.exec(s);
  return m ? { key: m[1], value: m[2], src: m[3] } : null;
}
const whyNum = (why: readonly string[], key: string): { v: number; src: string } | null => {
  for (const s of why) { const p = parseWhy(s); if (p && p.key === key && p.value !== '—' && Number.isFinite(Number(p.value))) return { v: Number(p.value), src: p.src }; }
  return null;
};
const whyText = (why: readonly string[], key: string): { v: string; src: string } | null => {
  for (const s of why) { const p = parseWhy(s); if (p && p.key === key) return { v: p.value, src: p.src }; }
  return null;
};
const has = (why: readonly string[], token: string) => why.includes(token);

function srcName(src: string, ctx: NarrativeContext): string {
  if (src === 'fc') return ctx.fusion ? `Prognose ${ctx.fusion}` : 'die Prognose von buscosun Fusion';
  if (src === 'RV') return 'das DWD-Radar (RADOLAN-RV)';
  if (src === 'KONRAD3D') return 'die DWD-Zellverfolgung KONRAD3D';
  if (src === 'GMA') return 'die Glättemeldeanlagen';
  if (src === 'sun') return 'der berechnete Sonnenstand';
  if (src === 'seg') return 'die Streckenmerkmale';
  if (src === 'state') return 'der Verlauf der letzten Slots';
  if (src.startsWith('+')) return `das Radar-Nowcast für ${src}`;
  if (src.includes('@')) return `der Prognosepunkt ${src}`;
  const n = ctx.stationName(src);
  return n ? `die Glättemeldeanlage ${n}` : `die Anlage ${src}`;
}

/** First sentences: the road now, from the `why` of the Glätte hazards with the measurement time. */
function roadNowSentence(e: HzEntry, ctx: NarrativeContext): string | null {
  const t = ctx.hm(ctx.slotMs);
  for (const id of ['reif', 'nass', 'glatteis', 'schnee'] as const) {
    const lv = e.lv[id]?.[0] ?? 0, why = e.why[id] ?? [];
    if (!lv || !why.length) continue;
    const code = whyText(why, 'code'), tf = whyNum(why, 'Tf'), td = whyNum(why, 'Td'), rh = whyNum(why, 'rF'), film = whyNum(why, 'film');
    const st = code?.src ?? tf?.src ?? null;
    const who = st ? srcName(st, ctx) : null;
    if (code && tf && who) {
      let s = `Auf der Fahrbahn liegt ${code.v}. ${cap(who)} meldet um ${t} den Zustand „${code.v}“ bei ${dec(tf.v)} °C Fahrbahntemperatur`;
      if (td) s += `; der Taupunkt liegt mit ${dec(td.v)} °C ${td.v > tf.v ? 'darüber, die Luftfeuchte schlägt sich als Eis nieder' : 'darunter'}`;
      return `${s}.`;
    }
    if (tf && who) {
      const what = id === 'reif' ? 'Reif kann sich bilden' : id === 'nass' ? 'die nasse Fahrbahn kann überfrieren' : 'die Fahrbahn ist kalt';
      let s = `${cap(who)} misst um ${t} ${dec(tf.v)} °C Fahrbahntemperatur`;
      if (td) s += ` bei einem Taupunkt von ${dec(td.v)} °C`;
      if (rh) s += ` und ${Math.round(rh.v)} % Luftfeuchte`;
      if (film) s += `; der Wasserfilm beträgt ${dec(film.v, 2)} mm`;
      return `${s} — ${what}.`;
    }
    const t2m = whyNum(why, 'T2m');
    if (t2m) return `Keine Fahrbahnmessung in diesem Abschnitt. Laut ${srcName(t2m.src, ctx)} liegt die Lufttemperatur um ${t} bei ${dec(t2m.v)} °C${whyNum(why, 'Td2m') ? `, der Taupunkt bei ${dec(whyNum(why, 'Td2m')!.v)} °C` : ''}.`;
  }
  return null;
}

function hazardSentence(id: RoadHazardId, e: HzEntry, ctx: NarrativeContext): string | null {
  const why = e.why[id] ?? [], lv = e.lv[id] ?? [];
  const now = lv[0] ?? 0;
  const t = ctx.hm(ctx.slotMs);
  switch (id) {
    case 'aqua': case 'gischt': {
      const film = whyNum(why, 'film'), rate = whyNum(why, 'rate') ?? whyNum(why, 'rateRV') ?? whyNum(why, 'rr');
      if (film && now) return `${cap(srcName(film.src, ctx))} misst um ${t} einen Wasserfilm von ${dec(film.v, 2)} mm${id === 'gischt' ? ' — Gischt hängt zusätzlich vom Verkehr ab, den niemand misst' : ''}.`;
      if (rate) return `${cap(srcName(rate.src, ctx))} ${rate.src === 'RV' ? 'zeigt' : 'nennt'} eine Regenrate von ${dec(rate.v)} mm/h${rate.src === 'fc' || rate.src.startsWith('+') ? ' (Prognose)' : ` um ${t}`}.`;
      return null;
    }
    case 'nebel': {
      const vis = whyNum(why, 'vis'), rh = whyNum(why, 'rF'), mos = whyNum(why, 'visMOS'), t2m = whyNum(why, 'T2m'), td = whyNum(why, 'Td2m');
      if (vis) return `${cap(srcName(vis.src, ctx))} misst um ${t} ${Math.round(vis.v)} m Sichtweite bei ${rh ? `${Math.round(rh.v)} % Luftfeuchte` : 'hoher Luftfeuchte'}${vis.v < 50 ? ' — unter 50 m Sicht gilt höchstens 50 km/h (§ 3 Abs. 1 StVO)' : ''}.`;
      if (mos) return `Laut DWD MOSMIX an der Station nahe ${mos.src} liegt die Sichtweite bei ${Math.round(mos.v)} m (Prognose).`;
      if (t2m && td) return `Laut ${srcName(t2m.src, ctx)} liegen Luft (${dec(t2m.v)} °C) und Taupunkt (${dec(td.v)} °C) nahe beieinander bei schwachem Wind — Nebel ist möglich.`;
      return null;
    }
    case 'sonne': {
      const az = whyNum(why, 'az'), el = whyNum(why, 'elev');
      const dir = e.dir?.sonne ?? 0;
      let from: string | null = null, to: string | null = null;
      lv.forEach((l, i) => { if ((l ?? 0) >= 1) { if (!from) from = ctx.hm(ctx.hours[i]); to = ctx.hm(ctx.hours[i]); } });
      if (!el) return null;
      return `${dir === 0 ? 'In Fahrtrichtung aufsteigender' : 'In Fahrtrichtung absteigender'} Kilometer steht die Sonne ${from === to ? `um ${from}` : `zwischen ${from} und ${to}`} tief vor der Windschutzscheibe (Sonnenhöhe ${dec(el.v)}°, Richtung ${Math.round(az?.v ?? 0)}°, berechnet)${has(why, 'wet:1') ? ', auf nasser Fahrbahn mit Spiegelung' : ''}.`;
    }
    case 'quer': case 'baum': {
      const gust = whyNum(why, 'gust'), cross = whyNum(why, 'cross'), dir = whyNum(why, 'dir');
      if (!gust) return null;
      const where = gust.src === 'fc' ? `Laut ${srcName('fc', ctx)} wehen` : `${cap(srcName(gust.src, ctx))} misst um ${t}`;
      let s = `${where} Böen von ${Math.round(gust.v)} km/h${dir ? ` aus ${Math.round(dir.v)}°` : ''}`;
      if (cross) s += `, davon ${Math.round(cross.v)} km/h quer zur Fahrbahn`;
      if (has(why, 'feature:bridge/dam/clearing')) s += ' — auf Brücken, Dämmen und Waldschneisen greift der Wind früher';
      if (id === 'baum') s += '; umgestürzte Bäume oder Teile auf der Fahrbahn erfasst niemand, hier stehen nur die Bedingungen';
      return `${s}.`;
    }
    case 'gewitter': case 'hagel': {
      const cell = whyText(why, 'cell'), cross = whyNum(why, 'crossMin'), dist = whyNum(why, 'distKm'), th = whyNum(why, 'thunder'), rate = whyNum(why, 'rate');
      if (cell && has(why, 'over:1')) return `Die DWD-Zellverfolgung KONRAD3D führt um ${t} eine Gewitterzelle über dem Abschnitt${id === 'hagel' && has(why, 'hail:1') ? ' mit Hagelkennung' : ''}.`;
      if (cell) return `KONRAD3D führt um ${t} eine Gewitterzelle ${dist ? `${dec(dist.v)} km entfernt` : 'in der Nähe'}${cross ? `, deren Zugbahn den Abschnitt in etwa ${Math.round(cross.v)} min erreicht` : ''}${has(why, 'hail:1') ? ' (Hagelkennung gesetzt)' : ''}.`;
      if (rate) return `${cap(srcName(rate.src, ctx))} zeigt um ${t} ${dec(rate.v)} mm/h über dem Abschnitt.`;
      if (th) return `Laut ICON-D2 (DWD) liegt das Gewitterpotenzial bei ${Math.round(th.v)} von 100${whyNum(why, 'cape') ? `, CAPE ${Math.round(whyNum(why, 'cape')!.v)} J/kg` : ''} (Prognose).`;
      return null;
    }
    case 'blowup': {
      const tmax = whyNum(why, 'Tmax'), days = whyNum(why, 'days'), rs = whyNum(why, 'TfMax');
      if (rs) return `${cap(srcName('GMA', ctx))} messen heute bis ${dec(rs.v)} °C Fahrbahntemperatur auf Betonbelag (OpenStreetMap).`;
      if (tmax) return `Der Belag ist laut OpenStreetMap Beton; ${tmax.src === 'GMA' ? 'gemessen' : `laut ${srcName(tmax.src, ctx)}`} erreicht die Luft heute ${dec(tmax.v)} °C${days && days.v > 1 ? `, der ${Math.round(days.v)}. heiße Tag in Folge` : ''}. Reifenplatzer bei Hitze misst niemand.`;
      return null;
    }
    case 'frost1': {
      const tf = whyNum(why, 'Tf'), t2m = whyNum(why, 'T2m');
      if (tf) return `${cap(srcName(tf.src, ctx))} ${tf.src === 'GMA' ? 'messen' : 'misst'} um ${t} erstmals seit dem 1. August ${dec(tf.v)} °C auf der Fahrbahn.`;
      if (t2m) return `Laut ${srcName(t2m.src, ctx)} sinkt die Lufttemperatur erstmals seit dem 1. August auf ${dec(t2m.v)} °C.`;
      return null;
    }
    case 'sturz': {
      const dT = whyNum(why, 'dT'), from = whyNum(why, 'fromMs'), to = whyNum(why, 'toMs');
      if (!dT) return null;
      const span = from && to ? ` zwischen ${ctx.hm(from.v)} und ${ctx.hm(to.v)}` : ' binnen sechs Stunden';
      return `${dT.src === 'fc' ? `Laut ${srcName('fc', ctx)} fällt die Lufttemperatur` : `${cap(srcName(dT.src, ctx))} misst einen Rückgang der Lufttemperatur um`}${dT.src === 'fc' ? ' um' : ''} ${dec(Math.abs(dT.v))} K${span}${has(why, 'zero:1') ? ', durch den Gefrierpunkt' : ''}${has(why, 'wet:1') ? ', auf nasser Fahrbahn' : ''}.`;
    }
    case 'glatteis': case 'schnee': case 'reif': case 'nass': {
      const rr = whyNum(why, 'rr'), t2m = whyNum(why, 'T2m'), t850 = whyNum(why, 'T850'), sl = whyNum(why, 'snowline'), fresh = whyNum(why, 'fresh') ?? whyNum(why, 'fresh6h');
      if (id === 'glatteis' && rr && t2m) return `Laut ${srcName(rr.src, ctx)} fällt Niederschlag (${dec(rr.v)} mm/h) bei ${dec(t2m.v)} °C${t850 ? ` und ${dec(t850.v)} °C in 850 hPa — warme Luft über kalter Bodenschicht` : ''}.`;
      if (id === 'schnee' && (sl || fresh)) return `Laut ${srcName((sl ?? fresh)!.src, ctx)} ${sl ? `liegt die Schneefallgrenze bei ${Math.round(sl.v)} m${whyNum(why, 'h') ? `, der Abschnitt auf ${Math.round(whyNum(why, 'h')!.v)} m` : ''}` : `fällt Neuschnee (${dec(fresh!.v)} cm)`}.`;
      return null;
    }
    default: return null;
  }
}

/** Site features without a measurement (gefahren §Grundsatz 4): bridges, shade, gradient, lowland — only when a hazard touches them. */
function featureSentences(seg: RoadSegment, e: HzEntry): string[] {
  const out: string[] = [];
  const ids = Object.keys(e.lv) as RoadHazardId[];
  const glaette = ids.some((id) => ROAD_HAZARD_BY_ID[id]?.group === 'glaette');
  const wind = ids.some((id) => ROAD_HAZARD_BY_ID[id]?.group === 'wind');
  if (glaette && seg.f.bridges.length) {
    const b = seg.f.bridges[0];
    out.push(`Auf ${b.name ? `der ${b.name}` : `der Brücke bei km ${Math.round(b.km[0])}`}${seg.f.bridges.length > 1 ? ` und ${seg.f.bridges.length - 1} weiteren Brücken` : ''} steht keine Messung — Brücken kühlen schneller aus als die Strecke.`);
  }
  if (glaette && (seg.f.forest ?? 0) >= 0.3) out.push(`Rund ${Math.round((seg.f.forest ?? 0) * 100)} % der Strecke verlaufen im Wald (ESA WorldCover) — im Schatten bleibt die Fahrbahn länger kalt.`);
  if (ids.includes('schnee') && seg.f.grade && seg.f.grade.pct >= 4) out.push(`Zwischen km ${Math.round(seg.f.grade.km[0])} und ${Math.round(seg.f.grade.km[1])} steigt die Strecke mit ${dec(seg.f.grade.pct)} % (Terrarium-Höhenmodell) — Lkw können an Steigungen hängen bleiben.`);
  if (wind && ((seg.f.embankment ?? 0) > 0.05 || seg.f.bridges.length)) out.push(`Dammlagen und Brücken (OpenStreetMap) sind dem Wind stärker ausgesetzt als die übrige Strecke.`);
  if (ids.includes('nebel') && seg.f.lowland) out.push(`Der Abschnitt liegt in einer Niederung (Geländemodell) — dort hält sich Nebel länger.`);
  return out;
}

/** Outlook to +6 h: the hazards that reach a level in the forecast hours, with "laut Prognose". */
function outlookSentence(e: HzEntry, ctx: NarrativeContext): string | null {
  const parts: string[] = [];
  for (const [hid, lv] of Object.entries(e.lv)) {
    const def = ROAD_HAZARD_BY_ID[hid as RoadHazardId];
    if (!def) continue;
    let from: number | null = null, to: number | null = null, max: RoadLevel = 0;
    for (let i = 1; i < ROAD_HZ_HOURS; i++) { const l = lv[i]; if ((l ?? 0) >= 1) { if (from === null) from = i; to = i; if ((l as RoadLevel) > max) max = l as RoadLevel; } }
    if (from === null || to === null) continue;
    const now = lv[0] ?? 0;
    const ev = e.ev[hid as RoadHazardId] ?? '';
    const persisted = (e.why[hid as RoadHazardId] ?? []).includes('persist:now');
    const when = from === 1 && now ? `bis ${ctx.hm(ctx.hours[to])}` : `${from === to ? 'um' : 'von'} ${ctx.hm(ctx.hours[from])}${from === to ? '' : ` bis ${ctx.hm(ctx.hours[to])}`}`;
    parts.push(`${def.label} ${when} (Stufe ${max}${ev.slice(1).includes('p') ? ', Prognose' : ''}${persisted ? ', fortgeschrieben solange die Luft unter +1 °C bleibt' : ''})`);
  }
  if (!parts.length) return null;
  return `Laut Prognose${ctx.fusion ? ` von ${ctx.fusion}` : ''}: ${parts.join('; ')}. Prognose-Stufen sind in Erprobung und auf Stufe 2 begrenzt.`;
}

/** What nobody measures, for the hazards present (gefahren §Grundsatz 5). */
function notMeasuredSentence(e: HzEntry): string | null {
  const ids = Object.keys(e.lv) as RoadHazardId[];
  const items: string[] = [];
  if (ids.includes('gischt')) items.push('die Verkehrsdichte (Gischt)');
  if (ids.includes('baum')) items.push('umgestürzte Bäume oder Teile auf der Fahrbahn');
  if (ids.some((id) => ROAD_HAZARD_BY_ID[id]?.group === 'glaette' || id === 'aqua')) items.push('Spurrinnen und der Zustand der Reifen');
  if (ids.includes('blowup')) items.push('Reifenplatzer bei Hitze');
  if (!items.length) return null;
  return `Nicht gemessen werden ${items.join(', ')} — die Stufen beschreiben die Bedingungen, keine Ereignisse.`;
}

export interface Narrative {
  /** Paragraph 1: the road now and why. */
  now: string[];
  /** Paragraph 2: site features and outlook. */
  outlook: string[];
  /** Paragraph 3: what nobody measures. */
  notMeasured: string | null;
  /** Hazards with unknown hours and why (input gaps). */
  unknown: string[];
}

/** The detail text of a segment entry. Every sentence names value, source and time or says "Prognose". */
export function roadNarrative(seg: RoadSegment, e: HzEntry, ctx: NarrativeContext): Narrative {
  const now: string[] = [];
  const road = roadNowSentence(e, ctx);
  if (road) now.push(road);
  const seen = new Set<string>();
  for (const id of Object.keys(e.lv) as RoadHazardId[]) {
    if (ROAD_HAZARD_BY_ID[id]?.group === 'glaette' && road) continue;
    if ((e.lv[id]?.[0] ?? 0) < 1 && !(e.lv[id] ?? []).some((l) => (l ?? 0) >= 1)) continue;
    const s = hazardSentence(id, e, ctx);
    if (s && !seen.has(s)) { seen.add(s); now.push(s); }
  }
  const unknown: string[] = [];
  for (const [hid, lv] of Object.entries(e.lv)) {
    const def = ROAD_HAZARD_BY_ID[hid as RoadHazardId];
    if (!def) continue;
    const nulls = lv.map((l, i) => (l === null ? i : -1)).filter((i) => i >= 0);
    if (!nulls.length) continue;
    const gap = (e.why[hid as RoadHazardId] ?? []).some((w) => w.startsWith('gap:'));
    unknown.push(`${def.label}: ${nulls[0] === 0 ? 'jetzt' : `ab ${ctx.hm(ctx.hours[nulls[0]])}`} unbekannt — ${gap ? 'die Messstelle des Abschnitts ist verworfen und keine gültige liegt im Umkreis von 10 km' : 'ein Eingang fehlt oder ist zu alt'}; das ist keine Entwarnung.`);
  }
  const outlook = [...featureSentences(seg, e)];
  const o = outlookSentence(e, ctx);
  if (o) outlook.push(o);
  return { now, outlook, notMeasured: notMeasuredSentence(e), unknown };
}

/** All sentences of a narrative as one text (golden texts of the verifier). */
export const narrativeText = (n: Narrative) => [...n.now, ...n.outlook, ...(n.notMeasured ? [n.notMeasured] : []), ...n.unknown].join(' ');

/** Label of a condition code for the cross-section („Reif“, „nass“ …); `null` = unknown. */
export const conditionWord = (code: number | null | undefined) => (code == null ? null : ROAD_CONDITION_LABEL[code] ?? null);
