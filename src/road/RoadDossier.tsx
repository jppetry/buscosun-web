/**
 * AWD — the visual frame of the dossier (look of the fire dossier: glass cards, accent gradient, tiles):
 *  - `RoadDossierHead`: the hero of the corridor with four key tiles,
 *  - `RoadRouteCard`: a route map of the motorway (SVG on the DACH outline, other motorways faint, segments in their
 *    level colour, measuring points, borders, scale) next to the list of ALL segments of the corridor — every segment
 *    can be picked on the map, on the proportional bar or in the list.
 * No map engine: the drawing is a few hundred SVG paths, so the dossier opens at once and costs no second WebGL context.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoadCorridor } from './roadClient';
import type { RoadPoint } from './roadContract';
import type { RoadSegment } from './roadSegments';
import type { RoadLevel } from './roadHazards';
import type { HzRow } from './roadHzView';
import { roadPointAtKm } from './roadFc';
import { AW_FONT, AW_SEV, AW_SEV_TINT, AW_UNKNOWN_TINT } from './roadNivoTheme';
import { EV_LABEL } from './roadHzView';
import { ROAD_CLASS_COLOR, ROAD_GAP_SHORT, corridorHeading, corridorRouteText, dec, f1, isCritical, isGapCorridor } from './roadView';

export interface SegState { lv: RoadLevel; unknown: boolean }

// --- hero --------------------------------------------------------------------------------------------------

export interface RoadDossierHeadProps {
  corridor: RoadCorridor;
  dir: 0 | 1;
  byId: ReadonlyMap<string, RoadPoint>;
  /** Level state per segment in the shared window (the colours of the map and the list; empty = no valid hazard file). */
  states: ReadonlyMap<string, SegState>;
  /** `false` = no valid hazard file (loading, dead, …): the hazard tile says so instead of „0“. */
  hzOk: boolean;
  segCount: number;
  standLabel: string;
}

export function RoadDossierHead({ corridor: c, dir, byId, states, hzOk, segCount, standLabel }: RoadDossierHeadProps) {
  const pts = c.stations.map((s) => byId.get(s.id)).filter((x): x is RoadPoint => !!x);
  const nCrit = pts.filter((x) => isCritical(x.cls)).length;
  const coldest = pts.filter((x) => x.rs != null).sort((a, b) => (a.rs as number) - (b.rs as number))[0];
  const sts = [...states.values()];
  const haz = sts.filter((x) => x.lv > 0);
  const nUnk = sts.filter((x) => x.lv === 0 && x.unknown).length;
  const max = haz.reduce<RoadLevel | null>((m, x) => (m === null || x.lv > m ? x.lv : m), null);
  const gap = isGapCorridor(c);
  const acc = max ? AW_SEV[max].bg : '#8B8474';
  return (
    <header className="aw-ds-head" style={{ ['--aw-ds-acc' as string]: acc }}>
      <div className="aw-ds-headrow">
        <div className="aw-ds-headtx">
          <div className="aw-ds-titlerow">
            {c.shields.map((s) => <span key={s} className="aw-shield is-big">{s}</span>)}
            <h2 className="aw-ds-title">{corridorRouteText(c, dir)}</h2>
          </div>
          <p className="aw-ds-sub">{corridorHeading(c, dir)} · {c.countries.join(' · ')} · {Math.round(c.lengthKm)} km</p>
        </div>
        <div className="aw-ds-chips" aria-label="Datenstand">
          <span className="aw-ds-chip">{standLabel}</span>
          {gap && <span className="aw-ds-chip is-warn">{ROAD_GAP_SHORT}</span>}
        </div>
      </div>
      <div className="aw-ds-tiles">
        <div className="aw-ds-tile">
          <span className="aw-ds-tile-l">Gefahren</span>
          <span className="aw-ds-tile-v">{!hzOk ? '—' : haz.length}</span>
          <span className="aw-ds-tile-s">{!hzOk ? 'Auswertung nicht verfügbar' : haz.length ? `${haz.length === 1 ? 'Abschnitt' : 'Abschnitte'} · höchste Stufe ${max}${nUnk ? ` · ${nUnk} unbekannt` : ''}` : nUnk ? `${nUnk}/${segCount} ohne Fahrbahnmessung — keine Entwarnung` : 'im Zeitraum keine erkannt'}</span>
        </div>
        <div className="aw-ds-tile">
          <span className="aw-ds-tile-l">Abschnitte</span>
          <span className="aw-ds-tile-v">{segCount || '—'}</span>
          <span className="aw-ds-tile-s">{segCount ? `auf ${Math.round(c.lengthKm)} km` : 'werden geladen'}</span>
        </div>
        <div className="aw-ds-tile">
          <span className="aw-ds-tile-l">Kälteste Stelle</span>
          <span className="aw-ds-tile-v">{coldest ? `${f1(coldest.rs as number)} °C` : '—'}</span>
          <span className="aw-ds-tile-s">{coldest ? `Fahrbahn · ${coldest.n}` : gap ? 'keine Fahrbahnmessung' : 'keine gültige Messung'}</span>
        </div>
        <div className="aw-ds-tile">
          <span className="aw-ds-tile-l">Messpunkte</span>
          <span className="aw-ds-tile-v">{gap ? '—' : `${pts.length}/${c.stations.length}`}</span>
          <span className="aw-ds-tile-s">{gap ? 'nur Prognosepunkte' : nCrit ? `${nCrit} mit Glätte oder Frostgefahr` : 'keine Glätte gemessen'}</span>
        </div>
      </div>
    </header>
  );
}

// --- route map ------------------------------------------------------------------------------------------------

const S = 100;
type LonLat = readonly [number, number];

let outlinePromise: Promise<number[][][][] | null> | null = null;
function loadOutline(): Promise<number[][][][] | null> {
  if (!outlinePromise) {
    outlinePromise = fetch('/countries/DACH.geojson')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.geometry?.type === 'MultiPolygon' ? (j.geometry.coordinates as number[][][][]) : null))
      .catch(() => { outlinePromise = null; return null; });
  }
  return outlinePromise;
}

interface View { k: number; x0: number; y0: number; W: number; H: number }
/** The view fits the corridor with a margin and takes exactly the aspect (w/h) of the box it is drawn in — no empty bands at the sides. */
function viewOf(line: readonly LonLat[], aspect: number): View {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lo, la] of line) { if (lo < minLon) minLon = lo; if (lo > maxLon) maxLon = lo; if (la < minLat) minLat = la; if (la > maxLat) maxLat = la; }
  const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const w = Math.max((maxLon - minLon) * k, 0.05), h = Math.max(maxLat - minLat, 0.05);
  let W = w * 1.28, H = h * 1.28;
  if (W / H > aspect) H = W / aspect; else W = H * aspect;
  const cx = ((minLon + maxLon) / 2) * k, cy = (minLat + maxLat) / 2;
  return { k, x0: cx - W / 2, y0: cy + H / 2, W, H };
}
const num = (v: number) => (Math.round(v * 10) / 10).toString();
function pathOf(line: readonly LonLat[], v: View, step = 1): string {
  let d = '';
  for (let i = 0; i < line.length; i += step) d += `${d ? 'L' : 'M'}${num((line[i][0] * v.k - v.x0) * S)} ${num((v.y0 - line[i][1]) * S)}`;
  const last = line[line.length - 1];
  if (step > 1 && (line.length - 1) % step) d += `L${num((last[0] * v.k - v.x0) * S)} ${num((v.y0 - last[1]) * S)}`;
  return d;
}
const UNKNOWN_LINE = '#B9AC8C';
const lvColor = (s: SegState | undefined) => (!s ? '#4A5260' : s.lv > 0 ? AW_SEV[s.lv].bg : s.unknown ? UNKNOWN_LINE : '#4A5260');

export interface RoadRouteCardProps {
  corridor: RoadCorridor;
  dir: 0 | 1;
  /** All segments of the corridor, in travel order. */
  segs: readonly RoadSegment[];
  geo: ReadonlyMap<string, readonly LonLat[]>;
  states: ReadonlyMap<string, SegState>;
  rows: ReadonlyMap<string, HzRow>;
  byId: ReadonlyMap<string, RoadPoint>;
  others: readonly RoadCorridor[];
  selectedId: string | null;
  onPick: (id: string) => void;
  /** Why there are no segments (loading / not available), shown instead of the list. */
  segNote: string | null;
}

const lvText = (s: SegState | undefined) => (!s ? 'keine Auswertung' : s.lv > 0 ? `Stufe ${s.lv}` : s.unknown ? 'unbekannt' : 'keine Gefahr');

export function RoadRouteCard(p: RoadRouteCardProps) {
  const { corridor: c } = p;
  const [hover, setHover] = useState<string | null>(null);
  const [outline, setOutline] = useState<number[][][][] | null>(null);
  useEffect(() => { let alive = true; loadOutline().then((o) => { if (alive) setOutline(o); }); return () => { alive = false; }; }, []);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setAspect(Math.round((r.width / r.height) * 100) / 100); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const view = useMemo(() => viewOf(c.line, aspect), [c.line, aspect]);
  const outlineD = useMemo(() => {
    if (!outline) return '';
    let d = '';
    for (const poly of outline) for (const ring of poly) {
      let inside = false;
      for (const [lo, la] of ring) { const x = lo * view.k - view.x0, y = view.y0 - la; if (x > -view.W * 0.1 && x < view.W * 1.1 && y > -view.H * 0.1 && y < view.H * 1.1) { inside = true; break; } }
      if (inside) d += pathOf(ring as unknown as LonLat[], view, 1) + 'Z';
    }
    return d;
  }, [outline, view]);
  const othersD = useMemo(() => {
    const out: string[] = [];
    for (const o of p.others) {
      if (o.id === c.id || o.line.length < 2) continue;
      let hit = false;
      for (let i = 0; i < o.line.length; i += 8) { const [lo, la] = o.line[i]; const x = lo * view.k - view.x0, y = view.y0 - la; if (x > 0 && x < view.W && y > 0 && y < view.H) { hit = true; break; } }
      if (hit) out.push(pathOf(o.line, view, Math.max(1, Math.ceil(o.line.length / 70))));
    }
    return out;
  }, [p.others, c.id, view]);
  const baseD = useMemo(() => pathOf(c.line, view, Math.max(1, Math.ceil(c.line.length / 600))), [c.line, view]);
  const segD = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of p.segs) { const g = p.geo.get(s.id); if (g && g.length > 1) m.set(s.id, pathOf(g, view, Math.max(1, Math.ceil(g.length / 200)))); }
    return m;
  }, [p.segs, p.geo, view]);

  const u = Math.max(view.W, view.H) * S / 100;
  const pos = (km: number) => { const [lo, la] = roadPointAtKm(c.line, km); return { x: (lo * view.k - view.x0) * S, y: (view.y0 - la) * S }; };
  const stations = useMemo(() => c.stations.map((s) => ({ id: s.id, ...pos(s.km), pt: p.byId.get(s.id) })), [c, p.byId, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const borders = useMemo(() => c.borders.map((b) => ({ ...pos(b.km), country: b.country })), [c, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const towns = useMemo(() => {
    const t = c.towns;
    if (!t.length) return [];
    const n = Math.min(5, t.length);
    return Array.from({ length: n }, (_, i) => t[Math.round((i * (t.length - 1)) / Math.max(1, n - 1))]).filter((x, i, a) => a.indexOf(x) === i).map(([km, name]) => ({ ...pos(km), name }));
  }, [c, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = p.selectedId ? p.segs.find((s) => s.id === p.selectedId) ?? null : null;
  const focus = (hover ? p.segs.find((s) => s.id === hover) : null) ?? sel;
  const scaleLen = (50 / 111.19) * S; // 50 km in view units (1° of latitude = 111.19 km)

  // The selected row scrolls into view in the list.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!p.selectedId || !listRef.current) return;
    listRef.current.querySelector<HTMLElement>(`[data-seg="${p.selectedId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [p.selectedId]);

  const total = p.segs.reduce((a, s) => a + s.lengthKm, 0) || 1;
  const fS = u * 0.032;
  return (
    <section className="aw-ds-card aw-ds-route" aria-label="Streckenkarte und Abschnitte">
      <div className="aw-ds-cardhead">
        <span className="aw-ds-eyebrow">Streckenkarte</span>
        <span className="aw-ds-cardsub">{p.segs.length ? `${p.segs.length} Abschnitte — auf der Karte oder in der Liste wählen` : 'Verlauf der Autobahn'}</span>
      </div>
      <div className="aw-ds-routegrid">
        <div className="aw-ds-mapcol">
          <div className="aw-ds-svgwrap" ref={wrapRef}>
          <svg className="aw-ds-svg" viewBox={`0 0 ${num(view.W * S)} ${num(view.H * S)}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Verlauf der ${c.shields.join(' ')} mit ihren Abschnitten`}>
            <defs><clipPath id="aw-ds-clip"><rect width={view.W * S} height={view.H * S} rx={u * 0.02} /></clipPath></defs>
            <g clipPath="url(#aw-ds-clip)">
              <rect width={view.W * S} height={view.H * S} fill="#E9E2CF" />
              {outlineD && <path d={outlineD} fill="#F7F2E4" stroke="#CFC4A6" strokeWidth={1.2} fillRule="evenodd" vectorEffect="non-scaling-stroke" />}
              {othersD.map((d, i) => <path key={i} d={d} fill="none" stroke="#B9AD8E" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.75} />)}
              <path d={baseD} fill="none" stroke="#FFFFFF" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.95} />
              <path d={baseD} fill="none" stroke="#4A5260" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              {p.segs.map((s) => {
                const d = segD.get(s.id);
                if (!d) return null;
                const st = p.states.get(s.id);
                const on = s.id === p.selectedId, hv = s.id === hover;
                return (
                  <g key={s.id}>
                    {(on || hv) && <path d={d} fill="none" stroke="#FAF6EA" strokeWidth={on ? 20 : 15} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.9} />}
                    {(on || hv) && <path d={d} fill="none" stroke="#0B0E12" strokeWidth={on ? 12 : 9.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
                    <path d={d} fill="none" stroke={lvColor(st)} strokeWidth={on ? 7.5 : hv ? 6.5 : 4.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  </g>
                );
              })}
              {borders.map((b) => (
                <g key={b.country + b.x} transform={`translate(${num(b.x)} ${num(b.y)})`}>
                  <rect x={-u * 0.9} y={-u * 0.9} width={u * 1.8} height={u * 1.8} rx={u * 0.3} fill="#2C2A26" transform="rotate(45)" />
                  <text x={u * 1.6} y={fS * 0.35} fontSize={fS} fontFamily={AW_FONT} fontWeight={700} fill="#2C2A26" stroke="#F7F2E4" strokeWidth={fS * 0.3} paintOrder="stroke">{b.country}</text>
                </g>
              ))}
              {stations.map((s) => (
                <circle key={s.id} cx={num(s.x)} cy={num(s.y)} r={u * 0.85} fill={s.pt ? (s.pt.cls === 'nodata' || s.pt.cls === 'unknown' ? '#C9BE9E' : ROAD_CLASS_COLOR[s.pt.cls]) : '#C9BE9E'} stroke="#FFFFFF" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
              ))}
              {towns.map((t) => (
                <text key={t.name} x={num(t.x + u * 1.4)} y={num(t.y + fS * 0.35)} fontSize={fS} fontFamily={AW_FONT} fontWeight={600} fill="#5C5447" stroke="#F7F2E4" strokeWidth={fS * 0.3} paintOrder="stroke">{t.name}</text>
              ))}
              {sel && (() => {
                const a = pos(sel.kmFrom), b = pos(sel.kmTo);
                return [a, b].map((q, i) => <circle key={i} cx={num(q.x)} cy={num(q.y)} r={u * 1.1} fill="#FFFFFF" stroke="#0B0E12" strokeWidth={2.2} vectorEffect="non-scaling-stroke" />);
              })()}
              {/* Hit areas last, wide and invisible — they take the pointer. */}
              {p.segs.map((s) => {
                const d = segD.get(s.id);
                return d ? (
                  <path key={s.id} d={d} fill="none" stroke="transparent" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                    style={{ cursor: 'pointer', pointerEvents: 'stroke' }} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover((h) => (h === s.id ? null : h))} onClick={() => p.onPick(s.id)} />
                ) : null;
              })}
              <g transform={`translate(${num(u * 2.2)} ${num(view.H * S - u * 2.6)})`} pointerEvents="none">
                <path d={`M0 0V${num(-u * 0.9)}M0 ${num(-u * 0.45)}H${num(scaleLen)}M${num(scaleLen)} 0V${num(-u * 0.9)}`} stroke="#5C5447" strokeWidth={1.6} fill="none" vectorEffect="non-scaling-stroke" />
                <text x={num(scaleLen + u * 1)} y={num(-u * 0.1)} fontSize={fS} fontFamily={AW_FONT} fontWeight={600} fill="#5C5447">50 km</text>
              </g>
              <g transform={`translate(${num(view.W * S - u * 3)} ${num(u * 5.5)})`} pointerEvents="none">
                <path d={`M0 ${num(-u * 1.6)}L${num(u * 0.9)} ${num(u * 1.4)}L${num(-u * 0.9)} ${num(u * 1.4)}Z`} fill="#5C5447" />
                <text x={0} y={num(-u * 2.3)} textAnchor="middle" fontSize={fS} fontFamily={AW_FONT} fontWeight={700} fill="#5C5447">N</text>
              </g>
            </g>
          </svg>
          </div>
          <div className="aw-ds-cap" role="status" aria-live="polite">
            {focus ? (
              <>
                {focus.shields.map((s) => <span key={s} className="aw-shield">{s}</span>)}
                <strong>{focus.name}</strong>
                <span>km {Math.round(focus.kmFrom)}–{Math.round(focus.kmTo)} · {dec(focus.lengthKm, 1)} km</span>
                <span className="aw-ds-cap-lv" style={(() => { const st = p.states.get(focus.id); const t = st && st.lv > 0 ? AW_SEV_TINT[st.lv] : AW_UNKNOWN_TINT; return { background: t.bg, borderColor: t.border, color: t.ink }; })()}>{lvText(p.states.get(focus.id))}</span>
              </>
            ) : <span>Abschnitt auf der Karte wählen — oder rechts aus der Liste.</span>}
          </div>
          <div className="aw-ds-leg" aria-label="Legende">
            {([1, 2, 3] as const).map((l) => <span key={l}><i style={{ background: AW_SEV[l].bg }} />Stufe {l}</span>)}
            <span><i style={{ background: '#4A5260' }} />keine Gefahr</span>
            <span><i style={{ background: UNKNOWN_LINE }} />unbekannt (keine Fahrbahnmessung)</span>
            <span><i className="is-dot" />Messpunkt</span>
          </div>
        </div>

        <div className="aw-ds-listcol">
          {p.segs.length > 0 && (
            <div className="aw-ds-bar" role="group" aria-label="Abschnitte im Maßstab der Strecke">
              {p.segs.map((s) => {
                const st = p.states.get(s.id);
                return (
                  <button key={s.id} type="button" className={`aw-ds-bar-seg${s.id === p.selectedId ? ' is-on' : ''}`} style={{ flexGrow: s.lengthKm / total, background: lvColor(st) }}
                    title={`${s.name} · ${lvText(st)}`} aria-label={`${s.name}, ${lvText(st)}`} aria-pressed={s.id === p.selectedId}
                    onClick={() => p.onPick(s.id)} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)} />
                );
              })}
            </div>
          )}
          <div className="aw-ds-list" ref={listRef}>
            {p.segs.map((s, i) => {
              const st = p.states.get(s.id), r = p.rows.get(s.id);
              const lv = st && st.lv > 0 ? st.lv : null;
              const tint = lv ? AW_SEV_TINT[lv] : AW_UNKNOWN_TINT;
              return (
                <button key={s.id} type="button" data-seg={s.id} className={`aw-ds-item${s.id === p.selectedId ? ' is-on' : ''}${st && st.lv === 0 && st.unknown ? ' is-unknown' : ''}`} aria-pressed={s.id === p.selectedId}
                  onClick={() => p.onPick(s.id)} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(s.id)} onBlur={() => setHover(null)}>
                  <span className="aw-ds-item-n" style={{ background: lvColor(st) }}>{i + 1}</span>
                  <span className="aw-ds-item-body">
                    <strong>{s.name}</strong>
                    <em>{r ? `${dec(s.lengthKm, 1)} km · ${r.sub}` : `km ${Math.round(s.kmFrom)}–${Math.round(s.kmTo)} · ${dec(s.lengthKm, 1)} km`}</em>
                  </span>
                  <span className="aw-ds-item-lv" style={lv || (st && st.unknown) ? { background: tint.bg, borderColor: tint.border, color: tint.ink } : undefined}>
                    {lvText(st)}{r && r.best.ev && lv ? <small>{EV_LABEL[r.best.ev]}</small> : null}
                  </span>
                </button>
              );
            })}
            {!p.segs.length && <div className="aw-ds-note">{p.segNote ?? 'Für diese Strecke sind keine Abschnitte vorhanden.'}</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

// --- chapters (like the fire dossier) ---------------------------------------------------------------------------

export type RoadDossierChapter = 1 | 2 | 3;

/**
 * The three parts of the dossier as tabs, pinned on top (same pattern as the fire dossier): only the chosen part is
 * rendered. 2–3 belong to the open segment; without one they point back to the route map. A fourth chapter
 * „Ort & Messung“ (features, measuring points, provenance) was removed on Jan's word (27.10.2026).
 */
export function RoadDossierTabs({ value, onChange, segName }: { value: RoadDossierChapter; onChange: (c: RoadDossierChapter) => void; segName: string | null }) {
  const chapters: ReadonlyArray<{ id: RoadDossierChapter; title: string; hint: string }> = [
    { id: 1, title: 'Strecke', hint: 'Karte · alle Abschnitte' },
    { id: 2, title: 'Abschnitt', hint: segName ?? 'Fahrbahn · Gefahren-Fahrplan' },
    { id: 3, title: 'Wetter', hint: 'Temperaturen · Schwellen · Wind' },
  ];
  return (
    <div className="aw-ds-tabs" role="tablist" aria-label="Teilbereich des Dossiers">
      {chapters.map((c) => (
        <button key={c.id} type="button" role="tab" aria-selected={value === c.id} className={`aw-ds-tab${value === c.id ? ' is-active' : ''}${c.id > 1 && !segName ? ' is-idle' : ''}`} onClick={() => onChange(c.id)}>
          <span className="aw-ds-tab-n" aria-hidden="true">{c.id}</span>
          <span className="aw-ds-tab-tx">
            <span className="aw-ds-tab-t">{c.title}</span>
            <span className="aw-ds-tab-h">{c.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** The picked segment on the route chapter: short summary and the way into its chapter. */
export function RoadPickBar({ seg, state, onOpen }: { seg: RoadSegment; state: SegState | undefined; onOpen: () => void }) {
  const t = state && state.lv > 0 ? AW_SEV_TINT[state.lv] : AW_UNKNOWN_TINT;
  return (
    <div className="aw-ds-pick" style={{ ['--aw-ds-acc' as string]: lvColor(state) }}>
      <span className="aw-ds-pick-bar" aria-hidden="true" />
      <span className="aw-ds-pick-tx">
        <span className="aw-ds-pick-l">Gewählter Abschnitt</span>
        <span className="aw-ds-pick-n">{seg.shields.map((s) => <span key={s} className="aw-shield">{s}</span>)} {seg.name}</span>
        <span className="aw-ds-pick-s">km {Math.round(seg.kmFrom)}–{Math.round(seg.kmTo)} · {dec(seg.lengthKm, 1)} km</span>
      </span>
      <span className="aw-ds-cap-lv" style={{ background: t.bg, borderColor: t.border, color: t.ink }}>{lvText(state)}</span>
      <button type="button" className="aw-ds-pick-cta" onClick={onOpen}>
        Abschnitt öffnen
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </div>
  );
}
