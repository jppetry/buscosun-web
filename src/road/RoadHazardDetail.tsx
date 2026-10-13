/**
 * AW-8.2 — The detail view of one segment (gefahren §AW-8, board `autobahnwetter-gefahren-detail.dc.html`): sticky
 * head with Zurück, „n / N“ and Vor/Zurück · article with shield, name, km, length, height, direction switch, chips of
 * the active hazards, the cross-section „Was auf der Fahrbahn liegt“ with the rule-based detail text · timetable
 * −2 … +6 h · temperatures −12 … +6 h · measured values against thresholds · wind to the road axis · site features ·
 * measuring points and anchors (the station card of AW-5 opens below) · official warning verbatim · „Nicht messbar“ ·
 * provenance. Charts (nivo) load lazily. Esc goes back; the focus lands on the heading.
 */
import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';
import type { RoadH24File, RoadPoint } from './roadContract';
import type { RoadCorridor } from './roadClient';
import type { RoadFcFile } from './roadFc';
import { roadFcDecode } from './roadFc';
import type { RoadSegment } from './roadSegments';
import { ROAD_HAZARD_BY_ID, ROAD_HZ_HOURS, type HzEntry, type RoadEvidence, type RoadHazardId, type RoadHzFile, type RoadLevel } from './roadHazards';
import { roadNarrative, type Narrative } from './roadNarrative';
import { AW_SEV, AW_SEV_TINT, AW_HATCH, AW_UNKNOWN_TINT, AW_MONO } from './roadNivoTheme';
import { HZ_FEATURE_ICON, HZ_GROUP_ICON, HZ_SHORT, bulletRows, crossSectionOf, featureRows, planRows, windSectors, segmentMainStation, tempSeriesOf } from './roadHzView';
import RoadCrossSection from './RoadCrossSection';
import { EvDot } from './RoadHazardPanel';
import { hm, dec, f1 } from './roadView';
import type { CapAlert } from '../warnings/capAlerts';

const Charts = lazy(() => import('./RoadHazardCharts').then((m) => ({ default: function ChartsBundle({ temp, slotMs, bullets, wind }: { temp: ReturnType<typeof tempSeriesOf>; slotMs: number; bullets: ReturnType<typeof bulletRows>; wind: ReturnType<typeof windSectors> }) {
  return (
    <>
      <section className="aw-card" aria-label="Temperaturen">
        <div className="aw-card-head"><span className="aw-eyebrow">Fahrbahn, Luft und Taupunkt</span><span className="aw-unit">−12 h bis +6 h · °C</span></div>
        <m.TempChart s={temp} slotMs={slotMs} />
      </section>
      <section className="aw-card" aria-label="Messgrößen gegen Schwellen">
        <div className="aw-card-head"><span className="aw-eyebrow">Messgrößen gegen Schwellen</span><span className="aw-unit">Balken jetzt · Strich Prognose</span></div>
        <m.ThresholdBullets rows={bullets} />
        <div className="aw-note">Bänder = Stufe 1 / 2 / 3 (Startwerte, werden kalibriert). Je weiter rechts, desto ungünstiger.</div>
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
  selectedStation: string | null;
  onPickStation: (id: string) => void;
  warnings: CapAlert[];
  warnState: 'off' | 'loading' | 'ok' | 'error';
  warnAt: number | null;
  /** The station card of AW-5 for the selected station (rendered by the readout). */
  stationCard: React.ReactNode;
  stale: boolean;
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
    const dec1 = (v: 't' | 'td' | 'fx' | 'dd' | 'vs' | 'rr', pick: 'min' | 'max' | 'first') => { const vals = pts.map((q) => roadFcDecode(v, (q.v as Record<string, Array<number | null>>)[v]?.[i])).filter((x): x is number => x != null); return vals.length ? (pick === 'min' ? Math.min(...vals) : pick === 'max' ? Math.max(...vals) : vals[0]) : null; };
    return { t: dec1('t', 'min'), td: dec1('td', 'first'), fx: dec1('fx', 'max'), dd: dec1('dd', 'first'), vis: dec1('vs', 'min'), rr: dec1('rr', 'max') };
  }), [file.hours, p.fcFile, seg.points]);
  const fusion = file.inputs.fc?.fusion ?? null;
  const xs = useMemo(() => crossSectionOf(seg, p.byId, file.slotMs, fusion, fcHours[0] ? { t: fcHours[0].t, td: fcHours[0].td } : null), [seg, p.byId, file.slotMs, fusion, fcHours]);
  const narrative: Narrative | null = useMemo(() => (entry ? roadNarrative(seg, entry, { stationName: (id) => p.byId.get(id)?.n ?? null, hm, slotMs: file.slotMs, hours: file.hours, fusion }) : null), [entry, seg, p.byId, file, fusion]);
  const plan = useMemo(() => (entry ? planRows(entry, p.prev.map((f) => (f === undefined ? undefined : f ? f.seg[seg.id] ?? null : null))) : []), [entry, p.prev, seg.id]);
  const bullets = useMemo(() => bulletRows(xs, seg, fcHours), [xs, seg, fcHours]);
  const wind = useMemo(() => windSectors(seg, xs.station, fcHours), [seg, xs.station, fcHours]);
  const mainSt = xs.station?.id ?? segmentMainStation(seg, p.byId);
  const temp = useMemo(() => tempSeriesOf(p.ring, mainSt, file.slotMs, fcHours.map((h) => (h ? { t: h.t, td: h.td } : null))), [p.ring, mainSt, file.slotMs, fcHours]);
  temp.stationName = mainSt ? p.byId.get(mainSt)?.n ?? null : null;
  const feats = useMemo(() => featureRows(seg), [seg]);

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
  const evTop = xs.kind === 'unbekannt' ? 'Fahrbahnsensor verworfen' : xs.kind === 'nichtgemessen' ? 'Prognose, ohne Fahrbahnmessung' : `Messung ${hm(file.slotMs)}${p.stale ? ' · veraltet' : ''}`;
  const stations = [...seg.stations, ...seg.near].map((id) => p.byId.get(id)).filter((s): s is RoadPoint => !!s);
  const fcPointsN = seg.points.length;

  return (
    <div className="aw-hz-detail">
      <div className="aw-hz-nav">
        <button type="button" className="aw-hz-back" onClick={p.onBack}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>Alle Gefahren</button>
        <span className="aw-hz-pos">{p.pos.i} / {p.pos.n}</span>
        <button type="button" className="aw-icon-btn" aria-label="Vorheriger Abschnitt" onClick={p.onPrev}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 15l-6-6-6 6" /></svg></button>
        <button type="button" className="aw-icon-btn" aria-label="Nächster Abschnitt" onClick={p.onNext}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg></button>
      </div>

      <article className="aw-card aw-hz-article" aria-label="Detailansicht Abschnitt">
        <div className={`aw-eyebrow${xs.kind === 'unbekannt' ? ' is-muted' : xs.kind === 'nichtgemessen' ? ' is-warn' : ' is-accent'}`}>Abschnitt · DE · {evTop}</div>
        <div className="aw-hz-article-title">
          {seg.shields.map((s) => <span key={s} className="aw-shield is-big">{s}</span>)}
          <h2 ref={headRef} tabIndex={-1} className="aw-hz-h2">{seg.name}</h2>
        </div>
        <div className="aw-hz-article-sub">km {Math.round(seg.kmFrom)}–{Math.round(seg.kmTo)} · {dec(seg.lengthKm, 1)} km{seg.f.h ? ` · ${seg.f.h[1]}–${seg.f.h[2]} m` : ''}</div>
        <div role="group" aria-label="Fahrtrichtung" className="aw-hz-dirs">
          {([0, 1] as const).map((d) => <button key={d} type="button" aria-pressed={p.dir === d} className={p.dir === d ? 'is-on' : ''} onClick={() => p.onDir(d)}>{d === 0 ? `Richtung ${seg.to}` : `Richtung ${seg.from}`}</button>)}
        </div>
        {chips.length > 0 && (
          <div className="aw-hz-nowchips">
            {chips.map((c) => <span key={c.id} className="aw-hz-chip" style={{ background: c.tint.bg, borderColor: c.tint.border, color: c.tint.ink }}><EvDot ev={c.ev} unknown={c.unknown} />{c.unknown ? '? ' : ''}{c.text}</span>)}
          </div>
        )}
        <div className="aw-eyebrow aw-hz-xs-head">Was auf der Fahrbahn liegt</div>
        <RoadCrossSection xs={xs} />
        {narrative ? (
          <>
            {narrative.now.length > 0 && <p className="aw-hz-text">{narrative.now.join(' ')}</p>}
            {narrative.outlook.length > 0 && <p className="aw-hz-text is-sub">{narrative.outlook.join(' ')}</p>}
            {narrative.unknown.map((u) => <p key={u} className="aw-hz-text is-unknown">{u}</p>)}
          </>
        ) : (
          <p className="aw-hz-text is-sub">Für diesen Abschnitt ist im Fenster bis +6 h keine Gefahrenstufe erkannt und kein Eingang unbekannt. Das ist keine Entwarnung: Stufen sind Regeln über Messwerten und Prognosen, keine amtlichen Warnungen.</p>
        )}
      </article>

      {entry && (
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

      <Suspense fallback={<section className="aw-card"><span className="aw-eyebrow">Diagramme laden …</span></section>}>
        <Charts temp={temp} slotMs={file.slotMs} bullets={bullets} wind={wind} />
      </Suspense>

      <section className="aw-card" aria-label="Ortsmerkmale">
        <span className="aw-eyebrow">Ortsmerkmale im Abschnitt</span>
        <div className="aw-hz-feats">
          {feats.map((f, i) => (
            <div key={i} className="aw-hz-feat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F5FAE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={HZ_FEATURE_ICON[f.icon]} /></svg>
              <span><strong>{f.t}</strong><em>{f.d}</em></span>
            </div>
          ))}
        </div>
        <div className="aw-note">Ortsmerkmale lösen allein keine Stufe aus; sie senken Schwellen oder ergänzen den Text. Quellen: OpenStreetMap (ODbL), Terrarium-Höhenmodell, ESA WorldCover.</div>
      </section>

      <section className="aw-card" aria-label="Messpunkte und Anker">
        <span className="aw-eyebrow">Messpunkte und Anker</span>
        <div className="aw-hz-stations">
          {stations.map((s) => {
            const inside = seg.stations.includes(s.id);
            const rej = s.rs == null && !!s.x && 'rs' in s.x;
            return (
              <button key={s.id} type="button" className={`aw-hz-station${p.selectedStation === s.id ? ' is-on' : ''}`} onClick={() => p.onPickStation(s.id)} aria-pressed={p.selectedStation === s.id}>
                <i style={rej || s.rs == null ? { background: AW_HATCH } : { background: '#2C2A26' }} />
                <span className="aw-hz-station-body"><strong>{s.n} <small style={{ fontFamily: AW_MONO }}>{s.km != null ? `km ${dec(s.km)}` : ''}{inside ? '' : ' · in Reichweite'}</small></strong><em>{s.rs != null ? `Fahrbahn ${f1(s.rs)} °C${s.cond != null ? ` · ${['trocken', 'feucht', 'nass', 'Reif', 'Schnee', 'Eis', 'Glätte', 'nicht trocken'][s.cond] ?? 'unbekannt'}` : ''}${s.wf ? ` · ${dec(s.wf, 2)} mm` : ''}` : rej ? 'Fahrbahnsensor verworfen' : s.ta != null ? `Luft ${f1(s.ta)} °C · keine Fahrbahn` : 'keine gültige Messung'}</em></span>
                <span className="aw-hz-station-k">{hm(s.t)}</span>
              </button>
            );
          })}
          {!stations.length && <div className="aw-hz-group-empty">Keine Glättemeldeanlage im Abschnitt oder in 5 km Reichweite — die Stufen jetzt stammen aus dem Modell an {fcPointsN} {fcPointsN === 1 ? 'Stützpunkt' : 'Stützpunkten'} (Nachweis Prognose).</div>}
          {stations.length > 0 && <div className="aw-note">{fcPointsN} {fcPointsN === 1 ? 'Stützpunkt' : 'Stützpunkte'} der Streckenprognose alle 5 km; die Anlagen in Reichweite (± 5 km) zählen mit.</div>}
        </div>
        {p.stationCard && <div className="aw-hz-stationcard">{p.stationCard}</div>}
      </section>

      {p.warnState === 'ok' && p.warnings.map((w) => (
        <div key={w.id} className="aw-card aw-warn">
          <div className="aw-eyebrow is-warn">Amtliche Warnung · DWD{w.areas[0]?.desc ? ` · ${w.areas[0].desc}` : ''}</div>
          <p className="aw-warn-text">„{w.headline}“</p>
          {w.description && <p className="aw-warn-text">„{w.description}“</p>}
          <div className="aw-warn-meta">gültig {w.onsetMs ? `ab ${hm(w.onsetMs)}` : ''}{w.expiresMs ? ` bis ${hm(w.expiresMs)}` : ' bis auf Widerruf'} · Quelle: Deutscher Wetterdienst{p.warnAt ? ` · abgerufen ${hm(p.warnAt)}` : ''} · hebt keine Stufe an und senkt keine</div>
        </div>
      ))}

      <div className="aw-hz-notobs"><strong>Nicht messbar:</strong> {narrative?.notMeasured ?? 'Verkehrsdichte (Gischt), Spurrinnen und Reifenzustand kennt buscosun nicht; Hinweise dazu beruhen nur auf Wetterbedingungen.'}</div>
      <div className="aw-sources aw-hz-src">
        Herkunft: DWD-Glättemeldeanlagen (Messung) · {fusion ?? 'buscosun Fusion'} an {fcPointsN} Stützpunkten, DWD RADOLAN-RV, KONRAD3D, ICON-D2 (Prognose) · Abschnitte und Ortsmerkmale © OpenStreetMap-Mitwirkende (ODbL)
        {file.missing.length ? ` · fehlend in diesem Slot: ${file.missing.join(', ')}` : ''}<br />Kein amtliches Warnprodukt · Prognose-Stufen in Erprobung, höchstens Stufe 2 · Stand {hm(file.slotMs)}
      </div>
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
