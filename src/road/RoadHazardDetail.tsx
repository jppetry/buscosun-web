/**
 * AW-8.2 — The detail view of one segment (gefahren §AW-8, board `autobahnwetter-gefahren-detail.dc.html`): sticky
 * head with Zurück, „n / N“ and Vor/Zurück · article with shield, name, km, length, height, direction switch, chips of
 * the active hazards, the cross-section „Was auf der Fahrbahn liegt“ with the rule-based detail text · timetable
 * −2 … +6 h · temperatures −12 … +6 h · measured values against thresholds · wind to the road axis · official warning
 * verbatim · „Nicht messbar“ · provenance. Charts (nivo) load lazily. Esc goes back; the focus lands on the heading.
 * The site chapter (features, measuring points and anchors, station card) was removed on Jan's word (27.10.2026,
 * „Ort & Messung brauchts im autobahn feature eigentlich nicht“); the OSM attribution (ODbL) stays in the provenance line.
 */
import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';
import type { RoadH24File, RoadPoint } from './roadContract';
import type { RoadCorridor } from './roadClient';
import type { RoadFcFile } from './roadFc';
import { roadFcDecode } from './roadFc';
import type { RoadSegment } from './roadSegments';
import { ROAD_HAZARD_BY_ID, ROAD_HAZARD_RANK, ROAD_HZ_HOURS, type HzEntry, type RoadEvidence, type RoadHazardId, type RoadHzFile, type RoadLevel } from './roadHazards';
import { roadNarrative, type Narrative } from './roadNarrative';
import { AW_SEV, AW_SEV_TINT, AW_HATCH, AW_UNKNOWN_TINT, AW_MONO } from './roadNivoTheme';
import { HZ_GROUP_ICON, HZ_SHORT, bulletRows, crossSectionOf, planRows, windSectors, segmentMainStation, tempSeriesOf } from './roadHzView';
import RoadCrossSection, { type CrossSectionFx } from './RoadCrossSection';
import { EvDot } from './RoadHazardPanel';
import { hm, dec, f1 } from './roadView';
import { ROAD_SURFACE_WORD } from './roadSurface';
import type { CapAlert } from '../warnings/capAlerts';

const Charts = lazy(() => import('./RoadHazardCharts').then((m) => ({ default: function ChartsBundle({ temp, slotMs, bullets, wind }: { temp: ReturnType<typeof tempSeriesOf>; slotMs: number; bullets: ReturnType<typeof bulletRows>; wind: ReturnType<typeof windSectors> }) {
  return (
    <>
      <section className="aw-card" aria-label="Temperaturen">
        <div className="aw-card-head"><span className="aw-eyebrow">Fahrbahn, Luft und Taupunkt</span><span className="aw-unit">−12 h bis +6 h · °C</span></div>
        <m.TempChart s={temp} slotMs={slotMs} />
      </section>
      <section className="aw-card" aria-label="Messgrößen gegen Schwellen">
        <div className="aw-card-head"><span className="aw-eyebrow">Messgrößen gegen Schwellen</span><span className="aw-unit">Wo liegt der Wert jetzt — wie nah an einer Stufe?</span></div>
        <m.ThresholdBullets rows={bullets} />
        <div className="aw-note">Die Schwellen sind Startwerte und werden kalibriert. Je weiter rechts, desto ungünstiger.</div>
      </section>
      <section className="aw-card" aria-label="Wind zur Fahrbahnachse">
        <span className="aw-eyebrow">Wind zur Fahrbahnachse</span>
        <div className="aw-hz-windrow">
          <m.WindPolar w={wind} />
          <div className="aw-hz-windtext">
            <strong>{wind.nowGust != null ? `Böe jetzt ${wind.nowGust} km/h` : 'Böe jetzt: keine Messung'}{wind.fcMax != null ? ` · Prognose bis ${wind.fcMax} km/h` : ''}</strong>
            <span>{wind.nowDeg != null ? `aus ${wind.nowDeg}°, ` : ''}Fahrbahnachse {wind.axisDeg}°</span>
            <span className="aw-note">Balken = Böen nach Herkunft (jetzt und Prognose), Farbe = Stufe der Querkomponente · Linie = Fahrbahn · Punkt = Wind jetzt. Schwellen 45 / 60 / 75 km/h Querkomponente (Startwerte), auf Brücken und Dämmen 10 km/h weniger.</span>
          </div>
        </div>
      </section>
    </>
  );
} })));

export interface RoadHazardDetailProps {
  seg: RoadSegment;
  entry: HzEntry | null;
  file: RoadHzFile;
  /** Earlier slots (−1 h, −2 h) for the timetable; `undefined` = not loaded, `null` = gone. */
  prev: ReadonlyArray<RoadHzFile | null | undefined>;
  corridor: RoadCorridor | null;
  byId: ReadonlyMap<string, RoadPoint>;
  fcFile: RoadFcFile | null;
  ring: RoadH24File | null;
  nowMs: number;
  dir: 0 | 1;
  onDir: (d: 0 | 1) => void;
  pos: { i: number; n: number };
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  warnings: CapAlert[];
  warnState: 'off' | 'loading' | 'ok' | 'error';
  warnAt: number | null;
  stale: boolean;
  /** AWD: label of the back button — in the dossier it closes the segment, not a list below it. */
  backLabel?: string;
  /** AWD chapters: render only one part (`seg` = segment + timetable + warnings + provenance, `wx` = charts); absent = all. */
  part?: 'seg' | 'wx';
  /** Phase FB: show buscosun Fusion — Fahrbahn (the computed road temperature of the run) where the segment has no measurement. */
  surface?: boolean;
}

export default function RoadHazardDetail(p: RoadHazardDetailProps) {
  const { seg, entry, file } = p;
  const headRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headRef.current?.focus(); }, [seg.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); p.onBack(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.onBack]); // eslint-disable-line react-hooks/exhaustive-deps

  // Forecast hours of the segment's support points (the hour of the window = file.hours[i], nearest full hour step).
  const fcHours = useMemo(() => file.hours.map((ms) => {
    if (!p.fcFile) return null;
    const i = Math.round((ms - p.fcFile.t0Ms) / 3_600_000);
    if (i < 0 || i >= p.fcFile.steps) return null;
    const pts = seg.points.map((id) => p.fcFile!.points.find((q) => q.id === id)).filter((q): q is NonNullable<typeof q> => !!q);
    if (!pts.length) return null;
    const dec1 = (v: 't' | 'td' | 'fx' | 'dd' | 'vs' | 'rr' | 'rs', pick: 'min' | 'max' | 'first') => { const vals = pts.map((q) => roadFcDecode(v, (q.v as Record<string, Array<number | null>>)[v]?.[i])).filter((x): x is number => x != null); return vals.length ? (pick === 'min' ? Math.min(...vals) : pick === 'max' ? Math.max(...vals) : vals[0]) : null; };
    return { t: dec1('t', 'min'), td: dec1('td', 'first'), fx: dec1('fx', 'max'), dd: dec1('dd', 'first'), vis: dec1('vs', 'min'), rr: dec1('rr', 'max'), rs: p.surface ? dec1('rs', 'min') : null };
  }), [file.hours, p.fcFile, seg.points, p.surface]);
  const fusion = file.inputs.fc?.fusion ?? null;
  const xs = useMemo(() => crossSectionOf(seg, p.byId, file.slotMs, fusion, fcHours[0] ? { t: fcHours[0].t, td: fcHours[0].td } : null), [seg, p.byId, file.slotMs, fusion, fcHours]);
  const narrative: Narrative | null = useMemo(() => (entry ? roadNarrative(seg, entry, { stationName: (id) => p.byId.get(id)?.n ?? null, hm, slotMs: file.slotMs, hours: file.hours, fusion }) : null), [entry, seg, p.byId, file, fusion]);
  const plan = useMemo(() => (entry ? planRows(entry, p.prev.map((f) => (f === undefined ? undefined : f ? f.seg[seg.id] ?? null : null))) : []), [entry, p.prev, seg.id]);
  const bullets = useMemo(() => bulletRows(xs, seg, fcHours), [xs, seg, fcHours]);
  const wind = useMemo(() => windSectors(seg, xs.station, fcHours), [seg, xs.station, fcHours]);
  const mainSt = xs.station?.id ?? segmentMainStation(seg, p.byId);
  const temp = useMemo(() => tempSeriesOf(p.ring, mainSt, file.slotMs, fcHours.map((h) => (h ? { t: h.t, td: h.td, rs: h.rs } : null))), [p.ring, mainSt, file.slotMs, fcHours]);
  temp.stationName = mainSt ? p.byId.get(mainSt)?.n ?? null : null;

  // Chips of the active hazards (now, or "ab HH:MM").
  const chips = entry ? (Object.keys(entry.lv) as RoadHazardId[]).filter((id) => ROAD_HAZARD_BY_ID[id]).map((id) => {
    const lv = entry.lv[id]!, v0 = lv[0];
    const ev0 = (entry.ev[id]?.[0] ?? '-') as RoadEvidence | '-';
    if (v0 === null) return { id, text: `${HZ_SHORT[id]} · unbekannt`, tint: AW_UNKNOWN_TINT, ev: null as RoadEvidence | null, unknown: true };
    if (v0 > 0) return { id, text: `${HZ_SHORT[id]} · Stufe ${v0}`, tint: AW_SEV_TINT[v0], ev: ev0 === '-' ? null : ev0, unknown: false };
    const first = lv.findIndex((l) => (l ?? 0) > 0);
    if (first > 0) return { id, text: `${HZ_SHORT[id]} · ab ${hm(file.hours[first])}`, tint: AW_SEV_TINT[lv[first] as RoadLevel], ev: 'p' as RoadEvidence, unknown: false };
    return null;
  }).filter((c): c is NonNullable<typeof c> => !!c) : [];
  // Scene of the cross-section: the strongest hazard now (rank breaks ties), else the first one ahead in the window.
  const xsFx = useMemo<CrossSectionFx | null>(() => {
    if (import.meta.env.DEV) {
      // Dev only: `?xsfx=<hazard>:<level>[:ab]` (or localStorage `awxsfx`, survives the URL sync) forces the scene for a visual check.
      let raw: string | null = new URLSearchParams(window.location.search).get('xsfx');
      try { raw ??= window.localStorage.getItem('awxsfx'); } catch { /* storage blocked */ }
      const q = raw?.split(':');
      if (q && ROAD_HAZARD_BY_ID[q[0] as RoadHazardId]) return { id: q[0] as RoadHazardId, lv: Math.max(1, Math.min(3, Number(q[1]) || 1)) as RoadLevel, at: q[2] ? hm(file.hours[2] ?? file.slotMs) : null, ev: null };
    }
    if (!entry) return null;
    const ids = (Object.keys(entry.lv) as RoadHazardId[]).filter((id) => ROAD_HAZARD_BY_ID[id]).sort((a, b) => ROAD_HAZARD_RANK[a] - ROAD_HAZARD_RANK[b]);
    let best: CrossSectionFx | null = null, bestI = Infinity;
    for (const id of ids) {
      const lv = entry.lv[id]!;
      const i = lv.findIndex((l) => (l ?? 0) > 0);
      if (i < 0) continue;
      const l = lv[i] as RoadLevel;
      if (i < bestI || (i === bestI && best && l > best.lv)) {
        bestI = i;
        best = { id, lv: l, at: i > 0 ? hm(file.hours[i]) : null, ev: ((entry.ev[id]?.[i] ?? null) as RoadEvidence | '-' | null) === '-' ? null : (entry.ev[id]?.[i] ?? null) as RoadEvidence | null };
      }
    }
    return best;
  }, [entry, file.hours, file.slotMs]);
  const nHaz = chips.filter((c) => !c.unknown).length, nUnk = chips.length - nHaz;
  // With the „Nicht auswertbar“ block below, the unknown chips would say the same twice — the chips keep the levels only.
  const shownChips = narrative?.unknown.length ? chips.filter((c) => !c.unknown) : chips;
  const evTop = xs.kind === 'unbekannt' ? 'Fahrbahnsensor verworfen' : xs.kind === 'nichtgemessen' ? 'Prognose, ohne Fahrbahnmessung' : `Messung ${hm(file.slotMs)}${p.stale ? ' · veraltet' : ''}`;
  // Measuring points in and near the segment — only counted (key tile); their list and the station card left with the site chapter.
  const stations = [...seg.stations, ...seg.near].map((id) => p.byId.get(id)).filter((s): s is RoadPoint => !!s);
  const fcPointsN = seg.points.length;
  const show = (k: 'seg' | 'wx') => !p.part || p.part === k;
  // Key tiles of the segment (dossier look): level now, road, size, measuring points.
  const nowLv: RoadLevel | null = entry ? (Math.max(0, ...(Object.values(entry.lv) as Array<Array<RoadLevel | null> | undefined>).map((a) => a?.[0] ?? 0)) as RoadLevel) : null;

  return (
    <div className="aw-hz-detail">
      <div className="aw-hz-nav">
        <button type="button" className="aw-hz-back" onClick={p.onBack}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>{p.backLabel ?? 'Alle Gefahren'}</button>
        {p.part && p.part !== 'seg' && <span className="aw-hz-nav-name">{seg.shields.map((s) => <span key={s} className="aw-shield">{s}</span>)}<span>{seg.name}</span></span>}
        <span className="aw-hz-pos">{p.pos.i} / {p.pos.n}</span>
        <button type="button" className="aw-icon-btn" aria-label="Vorheriger Abschnitt" onClick={p.onPrev}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 15l-6-6-6 6" /></svg></button>
        <button type="button" className="aw-icon-btn" aria-label="Nächster Abschnitt" onClick={p.onNext}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg></button>
      </div>

      {show('seg') && (
      <article className="aw-card aw-hz-article" aria-label="Detailansicht Abschnitt">
        <div className={`aw-eyebrow${xs.kind === 'unbekannt' ? ' is-muted' : xs.kind === 'nichtgemessen' ? ' is-warn' : ' is-accent'}`}>Abschnitt · DE · {evTop}</div>
        <div className="aw-hz-article-title">
          {seg.shields.map((s) => <span key={s} className="aw-shield is-big">{s}</span>)}
          <h2 ref={headRef} tabIndex={-1} className="aw-hz-h2">{seg.name}</h2>
        </div>
        <div className="aw-hz-article-sub">km {Math.round(seg.kmFrom)}–{Math.round(seg.kmTo)} · {dec(seg.lengthKm, 1)} km{seg.f.h ? ` · ${seg.f.h[1]}–${seg.f.h[2]} m` : ''}</div>
        <div className="aw-ds-tiles is-seg">
          <div className="aw-ds-tile">
            <span className="aw-ds-tile-l">Gefahr jetzt</span>
            <span className="aw-ds-tile-v" style={nowLv ? { color: nowLv > 0 ? AW_SEV_TINT[nowLv].ink : undefined } : undefined}>{nowLv === null ? '—' : nowLv > 0 ? `Stufe ${nowLv}` : chips.some((c) => c.unknown) ? 'unbekannt' : 'keine'}</span>
            <span className="aw-ds-tile-s">{nowLv === null ? 'keine Auswertung' : nHaz ? `${nHaz} ${nHaz === 1 ? 'Gefahr' : 'Gefahren'} im Zeitraum${nUnk ? ` · ${nUnk} unbekannt` : ''}` : nUnk ? `${nUnk} Größen unbekannt — keine Entwarnung` : 'im Zeitraum keine erkannt'}</span>
          </div>
          <div className="aw-ds-tile">
            <span className="aw-ds-tile-l">Fahrbahn</span>
            {xs.station?.rs == null && fcHours[0]?.rs != null
              ? <>
                <span className="aw-ds-tile-v">{f1(fcHours[0].rs)} °C</span>
                <span className="aw-ds-tile-s">{fusion ?? 'buscosun Fusion'} — Fahrbahn · {ROAD_SURFACE_WORD}, keine Messung</span>
              </>
              : <>
                <span className="aw-ds-tile-v">{xs.station?.rs != null ? `${f1(xs.station.rs)} °C` : '—'}</span>
                <span className="aw-ds-tile-s">{xs.label}</span>
              </>}
          </div>
          <div className="aw-ds-tile">
            <span className="aw-ds-tile-l">Länge</span>
            <span className="aw-ds-tile-v">{dec(seg.lengthKm, 1)} km</span>
            <span className="aw-ds-tile-s">{seg.f.h ? `Höhe ${seg.f.h[1]}–${seg.f.h[2]} m` : `km ${Math.round(seg.kmFrom)}–${Math.round(seg.kmTo)}`}</span>
          </div>
          <div className="aw-ds-tile">
            <span className="aw-ds-tile-l">Messpunkte</span>
            <span className="aw-ds-tile-v">{stations.length}</span>
            <span className="aw-ds-tile-s">{fcPointsN} {fcPointsN === 1 ? 'Stützpunkt' : 'Stützpunkte'} der Prognose</span>
          </div>
        </div>
        <div role="group" aria-label="Fahrtrichtung" className="aw-hz-dirs">
          {([0, 1] as const).map((d) => <button key={d} type="button" aria-pressed={p.dir === d} className={p.dir === d ? 'is-on' : ''} onClick={() => p.onDir(d)}>{d === 0 ? `Richtung ${seg.to}` : `Richtung ${seg.from}`}</button>)}
        </div>
        {/* Cross-section and its text side by side (one column on narrow screens); the unknown inputs follow as one block. */}
        <div className="aw-hz-xsgrid">
          <div className="aw-hz-xscol">
            <div className="aw-eyebrow aw-hz-xs-head">Was auf der Fahrbahn liegt</div>
            <RoadCrossSection xs={xs} fx={xsFx} />
          </div>
          <div className="aw-hz-txtcol">
            {shownChips.length > 0 && (
              <div className="aw-hz-nowchips">
                {shownChips.map((c) => <span key={c.id} className="aw-hz-chip" style={{ background: c.tint.bg, borderColor: c.tint.border, color: c.tint.ink }}><EvDot ev={c.ev} unknown={c.unknown} />{c.unknown ? '? ' : ''}{c.text}</span>)}
              </div>
            )}
            {narrative ? (
              <>
                {narrative.now.length > 0 && <p className="aw-hz-text">{narrative.now.join(' ')}</p>}
                {narrative.outlook.length > 0 && <p className="aw-hz-text is-sub">{narrative.outlook.join(' ')}</p>}
                {!shownChips.length && !narrative.now.length && !narrative.outlook.length && <p className="aw-hz-text is-sub">Keine Gefahrenstufe erkannt — die offenen Eingänge stehen darunter.</p>}
              </>
            ) : (
              <p className="aw-hz-text is-sub">Für diesen Abschnitt ist im Fenster bis +6 h keine Gefahrenstufe erkannt und kein Eingang unbekannt. Das ist keine Entwarnung: Stufen sind Regeln über Messwerten und Prognosen, keine amtlichen Warnungen.</p>
            )}
          </div>
        </div>
        {narrative && narrative.unknown.length > 0 && <UnknownList items={narrative.unknown} />}
      </article>
      )}

      {show('seg') && entry && (
        <section className="aw-card" aria-label="Gefahren-Fahrplan">
          <div className="aw-card-head"><span className="aw-eyebrow">Gefahren-Fahrplan</span><span className="aw-unit">−2 h bis +6 h · stündlich</span></div>
          <div className="aw-hz-plan" role="img" aria-label={`Gefahren-Fahrplan des Abschnitts ${seg.name} von −2 bis +6 Stunden`}>
            <span />
            {[-2, -1, ...Array.from({ length: ROAD_HZ_HOURS }, (_, i) => i)].map((h) => <span key={h} className={`aw-hz-plan-h${h === 0 ? ' is-now' : ''}`} style={{ fontFamily: AW_MONO }}>{h === 0 ? 'jetzt' : h > 0 ? `+${h}` : String(h).replace('-', '−')}</span>)}
            {plan.map((row) => (
              <PlanRow key={row.id} id={row.id} cells={row.cells} />
            ))}
          </div>
          <table className="aw-visually-hidden">
            <caption>Gefahren-Fahrplan {seg.name}</caption>
            <thead><tr><th>Gefahr</th>{[-2, -1, 0, 1, 2, 3, 4, 5, 6].map((h) => <th key={h}>{h === 0 ? 'jetzt' : `${h > 0 ? '+' : ''}${h} h`}</th>)}</tr></thead>
            <tbody>{plan.map((row) => <tr key={row.id}><td>{HZ_SHORT[row.id]}</td>{row.cells.map((c, i) => <td key={i}>{c.lv === undefined ? 'nicht vorgehalten' : c.lv === null ? 'unbekannt' : c.lv ? `Stufe ${c.lv}${c.ev ? ` (${c.ev === 'm' ? 'gemessen' : c.ev === 'd' ? 'abgeleitet' : 'Prognose'})` : ''}` : '0'}</td>)}</tr>)}</tbody>
          </table>
          <div className="aw-hz-legend"><span className="aw-hz-legend-ev"><EvDot ev="m" />gemessen <EvDot ev="d" />aus Messwerten abgeleitet <EvDot ev="p" />Prognose · blauer Rahmen = jetzt</span></div>
        </section>
      )}

      {show('wx') && (
      <Suspense fallback={<section className="aw-card"><span className="aw-eyebrow">Diagramme laden …</span></section>}>
        <Charts temp={temp} slotMs={file.slotMs} bullets={bullets} wind={wind} />
      </Suspense>
      )}

      {show('seg') && p.warnState === 'ok' && p.warnings.map((w) => (
        <div key={w.id} className="aw-card aw-warn">
          <div className="aw-eyebrow is-warn">Amtliche Warnung · DWD{w.areas[0]?.desc ? ` · ${w.areas[0].desc}` : ''}</div>
          <p className="aw-warn-text">„{w.headline}“</p>
          {w.description && <p className="aw-warn-text">„{w.description}“</p>}
          <div className="aw-warn-meta">gültig {w.onsetMs ? `ab ${hm(w.onsetMs)}` : ''}{w.expiresMs ? ` bis ${hm(w.expiresMs)}` : ' bis auf Widerruf'} · Quelle: Deutscher Wetterdienst{p.warnAt ? ` · abgerufen ${hm(p.warnAt)}` : ''} · hebt keine Stufe an und senkt keine</div>
        </div>
      ))}

      {show('seg') && <div className="aw-hz-notobs"><strong>Nicht messbar:</strong> {narrative?.notMeasured ?? 'Verkehrsdichte (Gischt), Spurrinnen und Reifenzustand kennt buscosun nicht; Hinweise dazu beruhen nur auf Wetterbedingungen.'}</div>}
      {show('seg') && (
      <div className="aw-sources aw-hz-src">
        Herkunft: DWD-Glättemeldeanlagen (Messung) · {fusion ?? 'buscosun Fusion'} an {fcPointsN} Stützpunkten, DWD RADOLAN-RV, KONRAD3D, ICON-D2 (Prognose) · Abschnitte und Ortsmerkmale © OpenStreetMap-Mitwirkende (ODbL)
        {file.missing.length ? ` · fehlend in diesem Slot: ${file.missing.join(', ')}` : ''}<br />Kein amtliches Warnprodukt · Prognose-Stufen in Erprobung, höchstens Stufe 2 · Stand {hm(file.slotMs)}
      </div>
      )}
    </div>
  );
}

/** The „unbekannt“ sentences of the narrative as one compact block — the common closing sentence is said once. */
function UnknownList({ items }: { items: readonly string[] }) {
  const parsed = items.map((u) => { const m = /^(.*?): (.*) unbekannt — ein Eingang fehlt oder ist zu alt; das ist keine Entwarnung\.$/.exec(u); return m ? { name: m[1], when: m[2] } : null; });
  if (parsed.some((x) => !x)) return <>{items.map((u) => <p key={u} className="aw-hz-text is-unknown">{u}</p>)}</>;
  return (
    <div className="aw-hz-unk">
      <div className="aw-hz-unk-head">Nicht auswertbar · {items.length}</div>
      <ul>{parsed.map((x) => <li key={x!.name}><b>{x!.name}</b><span>{x!.when}</span></li>)}</ul>
      <p>Ein Eingang fehlt oder ist zu alt — das ist keine Entwarnung.</p>
    </div>
  );
}

function PlanRow({ id, cells }: { id: RoadHazardId; cells: Array<{ lv: RoadLevel | null | undefined; ev: RoadEvidence | null }> }) {
  const group = ROAD_HAZARD_BY_ID[id].group;
  return (
    <>
      <span className="aw-hz-plan-name"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5C5447" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={HZ_GROUP_ICON[group]} /></svg><span>{HZ_SHORT[id]}</span></span>
      {cells.map((c, i) => {
        const h = i - 2;
        const style = c.lv === undefined ? { background: '#F5F1E8', color: '#C9BE9E', opacity: 0.5 } : c.lv === null ? { background: AW_HATCH, color: '#5C5447' } : c.lv ? { background: AW_SEV[c.lv].bg, color: AW_SEV[c.lv].ink } : { background: '#F5F1E8', color: '#C9BE9E' };
        return (
          <span key={i} className={`aw-hz-plan-cell${h === 0 ? ' is-now' : ''}${h < 0 ? ' is-past' : ''}`} style={style} title={`${HZ_SHORT[id]} ${h === 0 ? 'jetzt' : `${h > 0 ? '+' : ''}${h} h`}: ${c.lv === undefined ? 'nicht vorgehalten' : c.lv === null ? 'unbekannt' : c.lv ? `Stufe ${c.lv}` : 'keine'}`}>
            {c.lv ? <EvDot ev={c.ev} /> : c.lv === null ? '?' : c.lv === undefined ? '' : '·'}
          </span>
        );
      })}
    </>
  );
}
