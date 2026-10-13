/**
 * AW-8.1 — The hazard rail („Lage“, gefahren §AW-8): head with the number of segments and the period switch Jetzt /
 * Bis +6 h, the matrix (one cell = filter on group and hour), filter chips with counters, the groups in the fixed
 * order with their rows (level bar, shield, name, hazard · km · direction, 7-hour strip, "seit/ab/bis", further
 * hazards, level chip, evidence form). Unknown rows last, hatched. Empty group: „Keine Abschnitte erkannt. Das ist
 * keine Entwarnung.“ Rows are buttons; ↑/↓ move the focus, Enter opens the detail.
 */
import { useEffect, useMemo, useRef } from 'react';
import { ROAD_HAZARD_GROUPS, ROAD_HZ_CAP_TEXT, ROAD_HZ_NO_LEVEL_TEXT, type RoadHazardGroup, type RoadHzFile, type RoadLevel } from './roadHazards';
import type { RoadSegment } from './roadSegments';
import type { RoadHzMode, RoadTime } from './roadState';
import { AW_SEV, AW_SEV_TINT, AW_HATCH, AW_UNKNOWN_TINT } from './roadNivoTheme';
import { EV_LABEL, HZ_SHORT, hzCounts, hzGroupRows, hzMatrix, windowLabel, type HzRow } from './roadHzView';
import RoadHazardMatrix from './RoadHazardMatrix';
import { hm } from './roadView';

export interface RoadHazardPanelProps {
  file: RoadHzFile | null;
  /** Why there is no file: loading, not-there, error, invalid, stale/dead by the freshness rules. */
  state: 'loading' | 'ok' | 'stale' | 'dead' | 'not-there' | 'error' | 'invalid' | 'no-segments';
  segments: ReadonlyMap<string, RoadSegment>;
  mode: RoadHzMode;
  filter: RoadHazardGroup | null;
  selectedId: string | null;
  onMode: (m: RoadHzMode) => void;
  onFilter: (g: RoadHazardGroup | null) => void;
  onHour: (h: RoadTime) => void;
  onPick: (segId: string) => void;
  onHover: (segId: string | null) => void;
  nowMs: number;
}

/** The evidence form: filled = measured, half = derived, ring = forecast (CSS shapes, never glyphs). */
export function EvDot({ ev, unknown }: { ev: 'm' | 'd' | 'p' | null; unknown?: boolean }) {
  if (unknown || !ev) return <i className="aw-hz-ev is-u" aria-hidden="true" />;
  return <i className={`aw-hz-ev is-${ev}`} aria-hidden="true" />;
}

export function LevelChip({ lv, ev }: { lv: RoadLevel | null; ev: 'm' | 'd' | 'p' | null }) {
  const t = lv === null ? AW_UNKNOWN_TINT : AW_SEV_TINT[lv];
  return (
    <span className="aw-hz-chip" style={{ background: t.bg, borderColor: t.border, color: t.ink }}>
      {lv === null ? 'unbekannt' : `Stufe ${lv}`}
      <span className="aw-hz-chip-ev"><EvDot ev={ev} unknown={lv === null} />{lv === null ? 'keine gültige Messung' : EV_LABEL[ev ?? 'p']}</span>
    </span>
  );
}

function Strip({ lv }: { lv: Array<RoadLevel | null> }) {
  return (
    <span className="aw-hz-strip" aria-hidden="true">
      {lv.map((l, i) => <span key={i} style={l === null ? { background: AW_HATCH } : { background: AW_SEV[l].bg }} />)}
    </span>
  );
}

function Row({ r, selected, onPick, onHover }: { r: HzRow; selected: boolean; onPick: (id: string) => void; onHover: (id: string | null) => void }) {
  const lv = r.best.lv;
  return (
    <button type="button" className={`aw-hz-row${selected ? ' is-selected' : ''}${lv === null ? ' is-unknown' : ''}`} data-seg={r.segId}
      onClick={() => onPick(r.segId)} onMouseEnter={() => onHover(r.segId)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(r.segId)} onBlur={() => onHover(null)}
      aria-label={`${r.seg.shields.join(' ')} ${r.seg.name}, ${r.sub}, ${lv === null ? 'unbekannt' : `Stufe ${lv}`}, ${lv === null ? 'keine gültige Messung' : EV_LABEL[r.best.ev ?? 'p']}`}>
      <span className="aw-hz-row-bar" style={{ background: lv === null ? AW_HATCH : AW_SEV[lv].bg }} />
      <span className="aw-hz-row-body">
        <span className="aw-hz-row-title">
          {r.seg.shields.map((s) => <span key={s} className="aw-shield">{s}</span>)}
          <span className="aw-hz-row-name">{r.seg.name}</span>
        </span>
        <span className="aw-hz-row-sub">{r.sub}</span>
        <span className="aw-hz-row-strip"><Strip lv={r.strip} /><span className="aw-hz-row-when">{r.when}</span></span>
        {r.also.length > 0 && <span className="aw-hz-row-also">außerdem: {r.also.map((h) => HZ_SHORT[h]).join(', ')}</span>}
      </span>
      <span className="aw-hz-row-right">
        <span className="aw-hz-lv" style={lv === null ? { background: AW_UNKNOWN_TINT.bg, borderColor: AW_UNKNOWN_TINT.border, color: AW_UNKNOWN_TINT.ink } : { background: AW_SEV_TINT[lv].bg, borderColor: AW_SEV_TINT[lv].border, color: AW_SEV_TINT[lv].ink }}>{lv === null ? 'unbekannt' : `Stufe ${lv}`}</span>
        <span className="aw-hz-row-ev"><EvDot ev={r.best.ev} unknown={lv === null} />{lv === null ? 'keine gültige Messung' : EV_LABEL[r.best.ev ?? 'p']}</span>
      </span>
    </button>
  );
}

export default function RoadHazardPanel(p: RoadHazardPanelProps) {
  const { file, mode, filter } = p;
  const groups = useMemo(() => (file ? hzGroupRows(file, p.segments, mode, filter) : []), [file, p.segments, mode, filter]);
  const counts = useMemo(() => (file ? hzCounts(file, mode) : null), [file, mode]);
  const matrix = useMemo(() => (file ? hzMatrix(file) : null), [file]);
  const listRef = useRef<HTMLDivElement>(null);
  // ↑/↓ between the rows of the list (gefahren §Bedienung).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const rows = [...el.querySelectorAll<HTMLButtonElement>('button.aw-hz-row')];
      const i = rows.indexOf(document.activeElement as HTMLButtonElement);
      if (i < 0) return;
      e.preventDefault();
      rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, []);

  const hours = file?.hours ?? [];
  const hour = typeof mode === 'number' ? mode : mode === 'now' ? 0 : null;
  const n = counts?.all ?? 0;
  const note = p.state === 'loading' ? 'Gefahrenlage lädt …'
    : p.state === 'no-segments' ? 'Die Abschnitte sind noch nicht veröffentlicht (static/segments.json fehlt).'
      : p.state === 'dead' ? 'Gefahrenlage derzeit nicht verfügbar: der letzte Gefahren-Slot ist älter als 3 Stunden.'
        : p.state === 'not-there' ? 'Gefahrenlage derzeit nicht verfügbar: für den gezeigten Messslot wurde kein Gefahren-Slot veröffentlicht.'
          : p.state === 'error' ? 'Gefahrenlage derzeit nicht erreichbar (Datenspeicher).'
            : p.state === 'invalid' ? 'Gefahrenlage gesperrt: die Datei besteht den Prüfer nicht.' : null;
  return (
    <div className="aw-hz" ref={listRef}>
      <div className="aw-hz-head">
        <div className="aw-eyebrow is-accent">Gefahrenlage DACH</div>
        <h2 className="aw-hz-title">{file ? `${n} ${n === 1 ? 'Abschnitt' : 'Abschnitte'} mit Hinweisen` : 'Gefahrenlage'}</h2>
      </div>
      <div className="aw-hz-subrow">
        <div className="aw-hz-sub">{file ? `${windowLabel(mode, hours)} · DE gemessen, AT/CH folgen${p.state === 'stale' ? ' · veraltet' : ''}${file.missing.length ? ` · ohne ${file.missing.join(', ')}` : ''}` : note}</div>
        <div role="group" aria-label="Zeitraum" className="aw-hz-modes">
          {(['now', 'p6'] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} className={mode === m ? 'is-on' : ''} onClick={() => p.onMode(m)}>{m === 'now' ? 'Jetzt' : 'Bis +6 h'}</button>)}
        </div>
      </div>
      {file && note && <p className="aw-note" role="status">{note}</p>}
      {!file && note && <p className="aw-empty" role="status">{note} Das ist keine Entwarnung.</p>}
      {file && matrix && (
        <section className="aw-card aw-hz-matrix-card" aria-label="Lage-Matrix">
          <div className="aw-card-head"><span className="aw-eyebrow">Abschnitte je Gefahr und Stunde</span><span className="aw-unit">Farbe = höchste Stufe</span></div>
          <RoadHazardMatrix matrix={matrix} hours={hours} filter={filter} hour={hour} onCell={(g, h) => { p.onFilter(g); p.onMode(h as RoadTime); p.onHour(h as RoadTime); }} onHour={(h) => { p.onMode(h as RoadTime); p.onHour(h as RoadTime); }} />
          <div className="aw-hz-legend aw-hz-legend-matrix">
            <span><i style={{ background: AW_SEV[1].bg }} />Stufe 1</span><span><i style={{ background: AW_SEV[2].bg }} />2</span><span><i style={{ background: AW_SEV[3].bg }} />3</span><span><i style={{ background: AW_HATCH }} />unbekannt</span>
            <span className="aw-hz-legend-ev"><EvDot ev="m" />gemessen <EvDot ev="d" />abgeleitet <EvDot ev="p" />Prognose</span>
          </div>
        </section>
      )}
      {file && counts && (
        <div className="aw-hz-chips" role="group" aria-label="Filter">
          <button type="button" aria-pressed={filter === null} className={filter === null ? 'is-on' : ''} onClick={() => p.onFilter(null)}>Alle</button>
          {ROAD_HAZARD_GROUPS.map((g) => <button key={g.id} type="button" aria-pressed={filter === g.id} className={`${filter === g.id ? 'is-on' : ''}${counts.byGroup[g.id] ? '' : ' is-zero'}`} onClick={() => p.onFilter(filter === g.id ? null : g.id)}>{g.label} {counts.byGroup[g.id]}</button>)}
        </div>
      )}
      {file && (filter || typeof mode === 'number') && (
        <div className="aw-hz-filternote"><span>Filter: {filter ? ROAD_HAZARD_GROUPS.find((g) => g.id === filter)?.label : 'alle Gefahren'} · {windowLabel(mode, hours)}</span><button type="button" onClick={() => { p.onFilter(null); p.onMode('now'); }}>zurücksetzen</button></div>
      )}
      {file && groups.map((g) => (
        <section key={g.group} className="aw-hz-group" aria-label={g.label}>
          <div className="aw-hz-group-head">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2C2A26" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={g.icon} /></svg>
            <span>{g.label}</span>
            <span className="aw-hz-group-n">{g.rows.length - g.unknown}{g.unknown ? ` + ${g.unknown} ?` : ''}</span>
          </div>
          {g.rows.length === 0 && <div className="aw-hz-group-empty">{ROAD_HZ_NO_LEVEL_TEXT}</div>}
          <div className="aw-hz-rows">
            {g.rows.map((r) => <Row key={`${g.group}/${r.segId}`} r={r} selected={p.selectedId === r.segId} onPick={p.onPick} onHover={p.onHover} />)}
          </div>
        </section>
      ))}
      {file && (
        <p className="aw-note aw-hz-foot">{ROAD_HZ_CAP_TEXT}: höchstens Stufe 2, bis ein Abgleich mit späteren Messungen sie bestätigt. Stufen sind Regeln über Messwerten und Prognosen, keine amtlichen Warnungen. Gischt, umgestürzte Bäume, Spurrinnen und Reifenschäden misst niemand — angezeigt werden nur Wetterbedingungen, die sie begünstigen. Stand {hm(file.slotMs)}.</p>
      )}
    </div>
  );
}
