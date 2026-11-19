/**
 * Phase AM — what the modes Etappe and Strand show (`audit/seewetter-ausfahrt.md`, structure and wording of
 * `reference/seewetter-ausfahrt-*.dc.html`). Four pieces the page places: the input of a leg (left on the desktop), the
 * table „Entlang der Etappe“ (foot of the map), its findings (right), and the Strand list. They compute nothing —
 * `seaTrip.ts` does. Red is a value above YOUR limit and nothing else. Loaded lazily (own chunk).
 */
import type { ReactNode } from 'react';
import { SEA_PROFILES, SEA_PROFILE_BY_ID, fmtWind, unitLabel, type SeaProfileId, type SeaUnit } from './seaProfiles';
import { PLAN_FOOTER, REL_LABEL } from './seaPlanner';
import { compass16, dayShort, f1, hh, hm } from './seaView';
import { SEA_REVIERE, type SeaRevier } from './seaState';
import SeaTripSwitch from './SeaTripSwitch';
import {
  CUR_REL_LABEL, DUSK_LABEL, DUSK_SHORT, SEA_TRIP_MAX_POINTS, SEA_TRIP_SPEED_MAX_KN, SEA_TRIP_SPEED_MIN_KN, SHORE_SIDE_WORD, STRAND_DUSK_NOTE, STRAND_LEVEL_NOTE, STRAND_NOTE, STRAND_ORDER_NOTE,
  TRIP_ARRIVAL_HOUR_NOTE, TRIP_ARRIVAL_NOTE, TRIP_ASK_END, TRIP_ASK_START, TRIP_CONV_NOTE, TRIP_HOURLY_NOTE, TRIP_LEGEND, TRIP_LINE_NOTE, TRIP_MOTOR_NOTE, TRIP_NO_FUSION, TRIP_TWO_NOTE, TRIP_WAVE_NOTE,
  durText, nmText, overCountText, shoreWord, stopClock, strandCountText, tripSampleNote,
  type Dusk, type StrandOrder, type StrandRow, type TripMode, type TripRow,
} from './seaTrip';
import type { EtappeState, EtappeView } from './useSeaTrip';

const clock = (t: number) => `${dayShort(t)} ${hm(t)}`;
const Profiles = ({ profile, onProfile }: { profile: SeaProfileId; onProfile: (p: SeaProfileId) => void }) => (
  <section className="sw-am-sec">
    <h3 id="sw-am-who">Wer fährt?</h3>
    <div className="sw-profiles" role="group" aria-labelledby="sw-am-who">
      {SEA_PROFILES.map((pf) => <button key={pf.id} type="button" aria-pressed={profile === pf.id} className={profile === pf.id ? 'is-active' : ''} onClick={() => onProfile(pf.id)}>{pf.label}</button>)}
    </div>
  </section>
);
const Close = ({ onClose }: { onClose: () => void }) => (
  <button type="button" className="sw-pl-close" onClick={onClose} aria-label="Planer schließen">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
  </button>
);
const Chevron = ({ back }: { back?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={back ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /></svg>
);

// --- Etappe: input ---------------------------------------------------------------------------------------------------

export interface EtappeInputProps {
  profile: SeaProfileId; onProfile: (p: SeaProfileId) => void;
  mode: TripMode; onMode: (m: TripMode) => void;
  etappe: EtappeState; view: EtappeView | null;
  limitsText: string;
  /** The next click on the map sets a waypoint. */
  armed: boolean; onArm: (on: boolean) => void;
  onRemove: (index: number) => void; onReverse: () => void;
  onSpeed: (kn: number) => void; onDepart: (ms: number) => void;
  canEarlier: boolean; canLater: boolean;
  /** Desktop: the layers of the map, folded under the input (regrouped, not removed). */
  children?: ReactNode;
}
export function EtappeInput(p: EtappeInputProps) {
  const pts = p.etappe.points, n = pts.length, v = p.view;
  const label = (i: number) => v?.names.way[i] ?? `${pts[i].lat.toFixed(3).replace('.', ',')}° N ${pts[i].lon.toFixed(3).replace('.', ',')}° O`;
  const ways = n > 2 ? n - 2 : 0;
  return (
    <div className="sw-am-in">
      <Profiles profile={p.profile} onProfile={p.onProfile} />
      <SeaTripSwitch mode={p.mode} onMode={p.onMode} />
      <section className="sw-am-sec">
        <h3>Etappe</h3>
        <dl className="sw-am-box">
          <div><dt>Start</dt><dd>{n > 0 ? label(0) : 'auf der Karte setzen'}</dd></div>
          <div><dt>Wegpunkte</dt><dd>{ways === 0 ? 'keine' : `${ways} gesetzt`}</dd></div>
          {ways > 0 && (
            <div className="sw-am-ways">
              <ol>{pts.slice(1, -1).map((_, j) => (
                <li key={j}><span>{label(j + 1)}</span><button type="button" onClick={() => p.onRemove(j + 1)} aria-label={`Wegpunkt ${j + 1} löschen`}>löschen</button></li>
              ))}</ol>
            </div>
          )}
          <div><dt>Ziel</dt><dd>{n > 1 ? label(n - 1) : 'auf der Karte setzen'}</dd></div>
          <div>
            <dt><label htmlFor="sw-am-speed">Fahrt</label></dt>
            <dd className="sw-am-speed"><input id="sw-am-speed" type="number" inputMode="decimal" min={SEA_TRIP_SPEED_MIN_KN} max={SEA_TRIP_SPEED_MAX_KN} step={0.5} value={p.etappe.speedKn}
              onChange={(e) => { const x = Number(e.target.value.replace(',', '.')); if (Number.isFinite(x) && x > 0) p.onSpeed(x); }} /> kn</dd>
          </div>
          <div><dt>Strecke · Dauer</dt><dd>{v?.timeline ? `${nmText(v.route.km)} · ${durText(v.timeline.durMin)}` : '–'}</dd></div>
        </dl>
        {n >= 2 && n < SEA_TRIP_MAX_POINTS && (
          <button type="button" className={`sw-am-add${p.armed ? ' is-on' : ''}`} aria-pressed={p.armed} onClick={() => p.onArm(!p.armed)}>
            {p.armed ? 'Jetzt auf die Karte klicken (abbrechen)' : 'Wegpunkt auf der Karte setzen'}
          </button>
        )}
        {n < 2 && <p className="sw-am-ask" role="status">{n === 0 ? TRIP_ASK_START : TRIP_ASK_END}</p>}
        {n >= 2 && <div className="sw-am-tools"><button type="button" className="sw-link" onClick={p.onReverse}>Richtung umkehren</button><button type="button" className="sw-link" onClick={() => p.onRemove(-1)}>Alle Punkte löschen</button></div>}
        <p className="sw-am-fine">Punkte auf der Karte ziehen; ein Klick auf einen Spot rastet an seiner Wasserzelle ein.</p>
      </section>

      {v?.timeline && (
        <section className="sw-am-sec">
          <h3>Abfahrt vergleichen</h3>
          <div className="sw-am-cmp">
            {v.compare.map((c) => (
              <button key={c.departMs} type="button" aria-pressed={c.chosen} className={c.chosen ? 'is-active' : ''} disabled={c.over == null} onClick={() => p.onDepart(c.departMs)}>
                <span>{clock(c.departMs)}</span>
                <span className={c.over ? 'is-over' : ''}>{c.over == null ? 'außerhalb der Vorhersage' : `${overCountText(c.over)}${c.gaps ? ' · Werte fehlen' : ''}`}</span>
              </button>
            ))}
          </div>
          <div className="sw-am-shift">
            <span>Abfahrt eine Stunde</span>
            <button type="button" disabled={!p.canEarlier} onClick={() => p.onDepart(p.etappe.departMs - 3_600_000)}><Chevron back />früher</button>
            <button type="button" disabled={!p.canLater} onClick={() => p.onDepart(p.etappe.departMs + 3_600_000)}>später<Chevron /></button>
          </div>
          <p className="sw-am-fine">Gezählt werden Hinweise über deinen Grenzen: Wind, Böen, Welle.</p>
        </section>
      )}

      <section className="sw-am-sec">
        <h3>Deine Grenzen</h3>
        <p className="sw-am-limits">{p.limitsText}</p>
        {p.profile === 'motor' && <p className="sw-am-fine">{TRIP_MOTOR_NOTE}</p>}
      </section>
      {p.children}
    </div>
  );
}

// --- Etappe: table ---------------------------------------------------------------------------------------------------

const ND = <span className="sw-am-nd">keine Daten</span>;
function cells(r: TripRow, unit: SeaUnit) {
  const w = r.wind, wave = r.wave, cur = r.cur;
  return {
    rel: !w || w.windMs == null ? ND : r.rel ? REL_LABEL[r.rel] : <span className="sw-am-nd">Richtung fehlt</span>,
    wind: !w || w.windMs == null ? ND : <span className={r.over.wind ? 'is-over' : ''}>{fmtWind(w.windMs, unit)}</span>,
    gust: !w || w.gustMs == null ? ND : <span className={r.over.gust ? 'is-over' : ''}>{fmtWind(w.gustMs, unit)}</span>,
    wave: wave == null ? ND : wave === 'land' ? <span className="sw-am-nd">kein Seegang im Modell</span> : wave.hs == null ? ND
      : <span className={r.over.wave ? 'is-over' : ''}>{f1(wave.hs)}{r.waveRel ? <small> {REL_LABEL[r.waveRel]}</small> : null}</span>,
    cur: cur == null ? ND : cur === 'land' ? <span className="sw-am-nd">kein Wasserpunkt</span> : <span className={r.wac ? 'is-wac' : ''}>{f1(cur.kn)}{r.curRel ? <small> {CUR_REL_LABEL[r.curRel]}</small> : null}</span>,
    conv: r.conv == null ? '' : r.conv.cls === 2 ? 'Gewitter möglich' : r.conv.cls === 1 ? 'Schauer möglich' : '–',
  };
}
export function EtappeTable({ view, unit, onPick }: { view: EtappeView; unit: SeaUnit; onPick: (row: number) => void }) {
  const rows = view.rows;
  if (!rows.length) return null;
  const cs = rows.map((r) => cells(r, unit));
  const cls = (i: number) => (i === view.sel ? 'is-sel' : undefined);
  const line = (label: string, pick: (c: ReturnType<typeof cells>) => ReactNode) => (
    <tr><th scope="row">{label}</th>{cs.map((c, i) => <td key={i} className={cls(i)}>{pick(c)}</td>)}</tr>
  );
  const arrival = rows[rows.length - 1].stop;
  return (
    <section className="sw-am-tablebox" aria-label="Entlang der Etappe">
      <header>
        <h3>Entlang der Etappe</h3>
        <span>Stundenwerte am jeweiligen Ort, gerade Linie zwischen deinen Punkten</span>
        <ul className="sw-am-key" aria-label="Farbe der Route">
          <li><i className="is-in" />{TRIP_LEGEND.in}</li><li><i className="is-over" />{TRIP_LEGEND.over}</li><li><i className="is-missing" />{TRIP_LEGEND.missing}</li>
        </ul>
      </header>
      <div className="sw-am-scroll">
        <table className="sw-am-table">
          <thead>
            <tr className="sw-am-strand" aria-hidden="true"><th />{rows.map((r, i) => <td key={i} className={`is-${r.status}${i === 0 ? ' is-first' : ''}${i === rows.length - 1 ? ' is-last' : ''}`}><i /></td>)}</tr>
            <tr><th scope="row">Uhr</th>{rows.map((r, i) => (
              <th key={i} scope="col" className={cls(i)}><button type="button" aria-pressed={i === view.sel} onClick={() => onPick(i)} title={r.stop.arrival ? TRIP_ARRIVAL_HOUR_NOTE(r.stop.hourMs) : undefined}>{stopClock(r.stop)}</button></th>
            ))}</tr>
          </thead>
          <tbody>
            <tr><th scope="row">Ort</th>{rows.map((r, i) => <td key={i} className={cls(i)}>{r.place}</td>)}</tr>
            {line('Wind zum Kurs', (c) => c.rel)}
            {line(`Wind ${unitLabel(unit)}`, (c) => c.wind)}
            {line(`Böen ${unitLabel(unit)}`, (c) => c.gust)}
            {line('Welle m', (c) => c.wave)}
            {line('Strom kn', (c) => c.cur)}
            {line('Wetter', (c) => c.conv)}
          </tbody>
        </table>
      </div>
      {arrival.tMs !== arrival.hourMs && <p className="sw-am-fine">{TRIP_ARRIVAL_HOUR_NOTE(arrival.hourMs)}</p>}
    </section>
  );
}

// --- Etappe: findings ------------------------------------------------------------------------------------------------

function EndCard({ title, row, unit, sel }: { title: string; row: TripRow; unit: SeaUnit; sel: boolean }) {
  const w = row.wind, wave = row.wave && row.wave !== 'land' ? row.wave : null;
  return (
    <div className={`sw-am-card${sel ? ' is-sel' : ''}`}>
      <span className="sw-am-card-k">{title} {stopClock(row.stop)}</span>
      <strong>{w?.windMs != null ? `${fmtWind(w.windMs, unit)} ${unitLabel(unit)}` : 'keine Daten'}</strong>
      <span>{w?.gustMs != null ? `Böen ${fmtWind(w.gustMs, unit)}` : 'Böen: keine Daten'}{w?.windMs != null ? ` · ${row.rel ? REL_LABEL[row.rel] : 'Richtung fehlt'}` : ''}</span>
      <span>{w?.windDir != null ? `aus ${compass16(w.windDir)} · ` : ''}{wave?.hs != null ? `Welle ${f1(wave.hs, ' m')}` : 'Welle: keine Daten'}</span>
    </div>
  );
}
export interface EtappeResultProps {
  view: EtappeView | null; etappe: EtappeState; unit: SeaUnit; profile: SeaProfileId;
  /** Why there is nothing to plan with (no run, kill switch). */
  noData: string | null;
  onClose: () => void;
}
export function EtappeResult({ view, etappe, unit, profile, noData, onClose }: EtappeResultProps) {
  const tl = view?.timeline ?? null, rows = view?.rows ?? [], f = view?.findings ?? null;
  const loading = !!view && view.wind.done < view.wind.total;
  return (
    <section className="sw-pl sw-am-res" aria-label="Etappe">
      <header className="sw-pl-head">
        <div className="sw-pl-headtx">
          <h2>{view && etappe.points.length > 1 ? `${view.names.start} → ${view.names.end}` : 'Etappe planen'}</h2>
          {tl && <p>{clock(tl.departMs)} bis {dayShort(tl.arriveMs) !== dayShort(tl.departMs) ? `${dayShort(tl.arriveMs)} ` : ''}{hm(tl.arriveMs)} · {SEA_PROFILE_BY_ID[profile].label}</p>}
          {f && <p className={`sw-am-count${f.over ? ' is-over' : ''}`}>{f.over ? `${overCountText(f.over)} über deiner Grenze` : f.gaps ? 'Kein Stundenwert über deinen Grenzen, soweit Werte vorliegen' : 'Kein Stundenwert über deinen Grenzen'}</p>}
        </div>
        <Close onClose={onClose} />
      </header>

      {noData ? <div className="sw-empty"><strong>Keine Etappe planbar.</strong> {noData}</div>
        : !tl ? <div className="sw-empty"><strong>{etappe.points.length === 0 ? 'Start setzen.' : 'Ziel setzen.'}</strong> {etappe.points.length === 0 ? TRIP_ASK_START : TRIP_ASK_END}</div>
          : (
            <>
              {loading && <p className="sw-am-load" role="status">Wind an {view!.wind.done} von {view!.wind.total} Punkten der Etappe gerechnet …</p>}
              {!loading && view!.wind.none > 0 && <p className="sw-am-load is-none" role="status">{view!.wind.why === 'off' ? 'Wind und Böen: keine Daten. buscosun Fusion auf dem Punkt-Cube ist abgeschaltet (?pf=live).' : `${TRIP_NO_FUSION} Betroffen: ${view!.wind.none} von ${view!.wind.total} Punkten der Etappe${view!.wind.why === 'outside' ? ' (außerhalb des Punkt-Cubes, etwa nördlich von 55,5° N)' : ''}.`}</p>}
              {view!.beyond && <p className="sw-am-load is-none" role="status">Die Ankunft liegt hinter der letzten Stunde der Vorhersage. Für diesen Teil stehen keine Daten.</p>}
              {rows.length > 1 && (
                <div className="sw-am-cards">
                  <EndCard title="Abfahrt" row={rows[0]} unit={unit} sel={view!.sel === 0} />
                  <EndCard title="Ankunft" row={rows[rows.length - 1]} unit={unit} sel={view!.sel === rows.length - 1} />
                </div>
              )}
              {f && (
                <ul className="sw-am-findings">
                  {f.list.map((x) => <li key={x.text} className={x.over ? 'is-over' : x.kind === 'wac' ? 'is-hint' : x.kind === 'missing' ? 'is-missing' : undefined}>{x.text}</li>)}
                  {view!.level && <li>{view!.level}</li>}
                </ul>
              )}
            </>
          )}

      {view && view.official.length > 0 && (
        <div className="sw-am-official">
          <h3>Amtlich · Seegebiete auf der Route</h3>
          {view.official.map((o) => (
            <div key={o.title} className={o.text ? '' : 'is-none'}>
              <h4>{o.title}</h4>
              {o.text && <p className="sw-official">{o.text}</p>}
              {o.issued && <span className="sw-official-meta">{o.issued}, wörtlich</span>}
              {o.note && <p className="sw-am-fine">{o.note}</p>}
            </div>
          ))}
        </div>
      )}

      <details className="sw-am-notes">
        <summary>Was die Etappe zeigt und was nicht</summary>
        <ul>
          <li>{TRIP_LINE_NOTE}</li><li>{TRIP_ARRIVAL_NOTE}</li><li>{TRIP_TWO_NOTE}</li><li>{TRIP_HOURLY_NOTE}</li>
          {view && view.samples.n > 0 && <li>{tripSampleNote(view.samples.n, view.samples.stepKm, view.samples.widened)}</li>}
          <li>{TRIP_WAVE_NOTE}</li><li>{TRIP_CONV_NOTE}</li>
        </ul>
      </details>
      <p className="sw-am-safe">Keine Aussage über Sicherheit. Die Etappe ist eine gerade Linie zwischen deinen Punkten, kein Kurs, keine Navigationsgrundlage.</p>
      <p className="sw-pl-foot">{PLAN_FOOTER}</p>
    </section>
  );
}

// --- Strand ----------------------------------------------------------------------------------------------------------

const REVIER_LABEL: Readonly<Record<SeaRevier, string>> = { alle: 'Alle', nordsee: 'Nordsee', ostsee: 'Ostsee', daenemark: 'Dänemark' };
export interface StrandStripHour { k: number; t: number; inWin: boolean; see: number; known: number; dusk: Dusk }
export interface StrandPanelProps {
  mode: TripMode; onMode: (m: TripMode) => void;
  /** The window on the page's hours, or why there is none. */
  win: { startMs: number; endMs: number; hours: number; cut: boolean } | null; noData: string | null;
  head: string;
  strip: readonly StrandStripHour[]; pickK: number; onPick: (k: number) => void;
  onShift: (which: 'start' | 'end', by: -1 | 1) => void; can: { startEarlier: boolean; startLater: boolean; endEarlier: boolean; endLater: boolean };
  rows: readonly StrandRow[]; order: StrandOrder; onOrder: (o: StrandOrder) => void;
  revier: SeaRevier; onRevier: (r: SeaRevier) => void; hasDk: boolean;
  unit: SeaUnit; levels: ReadonlyMap<string, string>;
  selectedId: string | null; onSpot: (id: string) => void;
  onClose: () => void;
}
export function StrandPanel(p: StrandPanelProps) {
  const w = p.win;
  return (
    <section className="sw-pl sw-am-strandp" aria-label="Strand">
      <header className="sw-pl-head">
        <div className="sw-pl-headtx">
          <h2>{w ? `${dayShort(w.startMs)} ${hh(w.startMs)} bis ${dayShort(w.endMs) !== dayShort(w.startMs) ? `${dayShort(w.endMs)} ` : ''}${hh(w.endMs)} Uhr` : 'Strand'}</h2>
          <p>{w ? p.head : 'Welche Strände bekommen den Wind von See?'}</p>
        </div>
        <Close onClose={p.onClose} />
      </header>
      <SeaTripSwitch mode={p.mode} onMode={p.onMode} />
      <div className="sw-am-revier sw-profiles" role="group" aria-label="Revier">
        {SEA_REVIERE.filter((r) => r !== 'daenemark' || p.hasDk).map((r) => <button key={r} type="button" aria-pressed={p.revier === r} className={p.revier === r ? 'is-active' : ''} onClick={() => p.onRevier(r)}>{REVIER_LABEL[r]}</button>)}
      </div>

      {p.noData || !w ? <div className="sw-empty"><strong>Kein Fenster.</strong> {p.noData ?? 'Das Fenster liegt außerhalb der Vorhersage.'}</div> : (
        <>
          <div className="sw-am-win">
            {(['start', 'end'] as const).map((which) => (
              <span key={which} role="group" aria-label={which === 'start' ? 'Beginn des Fensters' : 'Ende des Fensters'}>
                <em>{which === 'start' ? 'Beginn' : 'Ende'}</em>
                <button type="button" disabled={!(which === 'start' ? p.can.startEarlier : p.can.endEarlier)} onClick={() => p.onShift(which, -1)} aria-label={`${which === 'start' ? 'Beginn' : 'Ende'} eine Stunde früher`}><Chevron back /></button>
                <button type="button" disabled={!(which === 'start' ? p.can.startLater : p.can.endLater)} onClick={() => p.onShift(which, 1)} aria-label={`${which === 'start' ? 'Beginn' : 'Ende'} eine Stunde später`}><Chevron /></button>
              </span>
            ))}
          </div>
          {w.cut && <p className="sw-am-load is-none">Ein Teil des Fensters liegt außerhalb der Vorhersage. Gezählt werden die Stunden mit Werten.</p>}
          <ol className="sw-am-strip" aria-label="Stunden des Fensters">
            {p.strip.map((h) => (
              <li key={h.k} className={`${h.inWin ? 'is-in' : ''}${h.k === p.pickK ? ' is-sel' : ''} is-${h.dusk}`}>
                <button type="button" aria-pressed={h.k === p.pickK} onClick={() => p.onPick(h.k)} title={`${hh(h.t)} Uhr: ${DUSK_LABEL[h.dusk]}, Wind von See an ${h.see} von ${h.known} Stränden`}>
                  <span>{hh(h.t)}</span><strong>{h.known ? `${h.see}/${h.known}` : '–'}</strong><small>{DUSK_SHORT[h.dusk]}</small>
                </button>
              </li>
            ))}
          </ol>
          <p className="sw-am-fine">Je Stunde: Strände mit Wind von See, von allen mit Windrichtung.</p>

          <div className="sw-am-order" role="group" aria-label="Reihenfolge">
            <button type="button" aria-pressed={p.order === 'see'} className={p.order === 'see' ? 'is-active' : ''} onClick={() => p.onOrder('see')}>Wind von See zuerst</button>
            <button type="button" aria-pressed={p.order === 'land'} className={p.order === 'land' ? 'is-active' : ''} onClick={() => p.onOrder('land')}>Wind vom Land zuerst</button>
          </div>
          <ul className="sw-am-key is-shore" aria-label="Farbe der Spots auf der Karte"><li><i className="is-see" />von See</li><li><i className="is-quer" />längs des Ufers</li><li><i className="is-land" />vom Land</li></ul>
          <ol className="sw-am-list">
            {p.rows.map((r, i) => {
              const h = r.hour, lvl = p.levels.get(r.id);
              return (
                <li key={r.id}>
                  <button type="button" className={r.id === p.selectedId ? 'is-sel' : ''} onClick={() => p.onSpot(r.id)}>
                    <span className="sw-am-rank">{i + 1}</span>
                    <span className="sw-am-rowtx">
                      <strong>{r.name}</strong>
                      <span>{h?.windMs != null ? `${fmtWind(h.windMs, p.unit)} ${unitLabel(p.unit)}${h.windDir != null ? ` aus ${compass16(h.windDir)}` : ''}` : 'Wind: keine Daten'} · {h?.dry ? 'kein Seegang' : h?.hs != null ? `Welle ${f1(h.hs, ' m')}` : 'Welle: keine Daten'}{lvl ? ` · ${lvl}` : ''}</span>
                      <span>{strandCountText(r, p.order, w.hours)}</span>
                    </span>
                    <span className={`sw-am-shore${r.side ? ` is-${r.side}` : ''}`}>{shoreWord(r.shore)}{r.side ? <small>{SHORE_SIDE_WORD[r.side]}</small> : null}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {p.rows.length === 0 && <div className="sw-empty">In diesem Revier steht kein Spot im Katalog.</div>}
        </>
      )}
      <details className="sw-am-notes">
        <summary>Was die Liste zeigt und was nicht</summary>
        <ul><li>{STRAND_NOTE}</li><li>{STRAND_ORDER_NOTE}</li><li>{STRAND_DUSK_NOTE}</li><li>{STRAND_LEVEL_NOTE}</li></ul>
      </details>
      <p className="sw-am-safe">{STRAND_NOTE}</p>
      <p className="sw-pl-foot">{PLAN_FOOTER}</p>
    </section>
  );
}
