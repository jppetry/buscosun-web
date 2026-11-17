/**
 * Phase TF — the threshold control and the list of tide windows (`audit/tidenfenster.md`). One sentence to fill in
 * ("… mindestens 550 cm über Pegelnull …") instead of a form: the threshold IS a sentence about one gauge. Used in the
 * water level card (desktop) and in the sheet behind the bottom bar (phone) — the same component, the same words.
 *
 * Wording rule of the brief: a window is "über deiner Schwelle am Pegel X" (resp. "unter"). Nothing here speaks about
 * depth at the spot or about suitability.
 */
import { useEffect, useId, useState } from 'react';
import {
  TIDE_CM_MAX, TIDE_DEVIATION_LABEL, TIDE_MODES, TIDE_MODE_LABEL, TIDE_TIGHT_CM, tideRefOf, tideSideText, tideThresholdText, tideWindowLabel,
  type TideMode, type TideRef, type TideRefInfo, type TideThreshold, type TideWindow,
} from './tideWindow';

export interface SeaTideView {
  threshold: TideThreshold | null;
  onThreshold: (t: TideThreshold | null) => void;
  /** Name of the gauge whose curve the windows are read from; null until it answered. */
  gaugeName: string | null;
  /** Its distance to the spot, km. */
  km: number | null;
  /** References this gauge carries (gauge zero always). */
  refs: readonly TideRefInfo[];
  /** Windows from now on; null = no threshold, or its reference is not delivered at this gauge. */
  windows: readonly TideWindow[] | null;
  /** Last instant of the curve the windows were read from. */
  end: number | null;
}

const cmDe = (cm: number) => cm.toLocaleString('de-DE', { maximumFractionDigits: 0 });
const WHEN = new Intl.DateTimeFormat('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Berlin' });
const when = (t: number) => WHEN.format(new Date(t)).replace('.,', '').replace(',', '');

/** The sentence. Commits on every valid change; an empty number clears the threshold. */
export function TideControl({ view, atCm }: { view: SeaTideView; /** Curve value of the chosen hour, cm above gauge zero. */ atCm?: number | null }) {
  const id = useId();
  const th = view.threshold;
  const [mode, setMode] = useState<TideMode>(th?.mode ?? 'min');
  const [ref, setRef] = useState<TideRef>(th?.ref ?? 'pnp');
  const [text, setText] = useState<string>(th ? String(th.cm) : '');
  // Another gauge, a link or the other copy of the control (card and sheet) changed the threshold: follow it.
  const key = th ? `${th.mode}.${th.cm}.${th.ref}` : '';
  useEffect(() => {
    if (!th) { setText(''); return; }
    setMode(th.mode); setRef(th.ref); setText(String(th.cm));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (m: TideMode, r: TideRef, raw: string) => {
    const s = raw.trim().replace('−', '-');
    if (s === '') { if (th) view.onThreshold(null); return; }
    const n = Number(s);
    if (/^-?\d{1,4}$/.test(s) && Math.abs(n) <= TIDE_CM_MAX) view.onThreshold({ mode: m, cm: n, ref: r });
  };
  const info = tideRefOf(view.refs, ref);
  const refGone = !!th && !tideRefOf(view.refs, th.ref);
  const gauge = view.gaugeName ?? 'des Spots';
  const here = atCm != null && info ? atCm - info.offsetCm : null;

  return (
    <div className="sw-tf-ctl">
      <div className="sw-tf-sentence">
        <span>Zeig die Zeit, in der der Wasserstand am Pegel <strong>{gauge}</strong></span>
        <span className="sw-seg sw-tf-mode" role="group" aria-label="Richtung der Schwelle">
          {TIDE_MODES.map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} className={mode === m ? 'is-active' : ''} onClick={() => { setMode(m); commit(m, ref, text); }}>{TIDE_MODE_LABEL[m]}</button>
          ))}
        </span>
        <span className="sw-tf-num">
          <label className="sw-sr" htmlFor={`${id}-cm`}>Schwelle in Zentimetern</label>
          <input id={`${id}-cm`} type="text" inputMode="numeric" autoComplete="off" placeholder="z. B. 550" value={text}
            aria-invalid={text.trim() !== '' && !/^[-−]?\d{1,4}$/.test(text.trim())}
            onChange={(e) => { setText(e.target.value); commit(mode, ref, e.target.value); }} />
          <span>cm</span>
        </span>
        <span className="sw-tf-ref">
          <label className="sw-sr" htmlFor={`${id}-ref`}>Bezug der Schwelle</label>
          <select id={`${id}-ref`} value={ref} onChange={(e) => { const r = e.target.value as TideRef; setRef(r); commit(mode, r, text); }}>
            {view.refs.map((r) => <option key={r.ref} value={r.ref}>über {r.over}</option>)}
          </select>
        </span>
        <span>liegt.</span>
      </div>
      <p className="sw-tf-hint">
        {refGone
          ? 'Der Bezug deiner Schwelle wird an diesem Pegel nicht geliefert — wähle einen anderen Bezug.'
          : here != null && info
            ? `Zur gewählten Stunde: ${cmDe(Math.abs(here))} cm ${here < 0 ? 'unter' : 'über'} ${info.over}. Eine negative Zahl meint „unter“ dem Bezug.`
            : 'Eine negative Zahl meint „unter“ dem Bezug.'}
        {th && <> <button type="button" className="sw-link sw-tf-clear" onClick={() => view.onThreshold(null)}>Schwelle löschen</button></>}
      </p>
    </div>
  );
}

/** The windows as a strip of times; hollow = read from the tidal prediction only. */
export function TideWindows({ view }: { view: SeaTideView }) {
  const th = view.threshold;
  const info = th ? tideRefOf(view.refs, th.ref) : null;
  if (!th || !info || !view.gaugeName) return null;
  const side = tideSideText(th.mode, view.gaugeName);
  const ws = view.windows ?? [];
  return (
    <div className="sw-tf-wins" data-count={ws.length}>
      <div className="sw-tf-wins-h">
        <strong>Fenster {side}</strong>
        <span>{tideThresholdText(th, info)}{view.km != null ? ` · Pegel ${view.km.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km vom Spot` : ''}</span>
      </div>
      {ws.length > 0 ? (
        <ul className="sw-tf-list">
          {ws.map((w) => (
            <li key={`${w.from}-${w.tideOnly ? 't' : 'c'}`} className={w.tideOnly ? 'is-tide' : ''}>
              <span>{tideWindowLabel(w)}</span>
              {w.tideOnly && <em>nur Gezeit</em>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="sw-note">{view.end != null ? `Bis ${when(view.end)} Uhr liegt der Wasserstand zu keiner Zeit ${side}.` : `Für diesen Pegel liegt keine Kurve vor — kein Fenster ${side}.`}</p>
      )}
      <p className="sw-tf-foot">
        {ws.some((w) => w.tideOnly) && 'Hohl umrandet = nur Gezeit: hinter dem Ende der Vorhersage steht allein die Gezeitenvorausberechnung, ohne Wind und Stau. '}
        Die Schwelle ist deine Zahl an diesem Pegel, keine Aussage über die Wassertiefe an deinem Spot. Im Stundenband gilt eine Stunde als „knapp“, wenn sie nur zum Teil im Fenster liegt oder weniger als {TIDE_TIGHT_CM} cm Abstand zur Schwelle bleibt ({TIDE_TIGHT_CM} cm sind gesetzt, nicht gemessen).
      </p>
    </div>
  );
}

/** Legend entries of the chart that only exist with the tide window. */
export function TideLegend({ hasWindows, hasTideOnly, hasDeviation }: { hasWindows: boolean; hasTideOnly: boolean; hasDeviation: boolean }) {
  return (
    <>
      {hasWindows && <span><i className="sw-tf-leg is-win" />Fenster</span>}
      {hasTideOnly && <span><i className="sw-tf-leg is-tide" />Fenster, nur Gezeit</span>}
      {hasDeviation && <span><i className="sw-tf-leg is-dev" />{TIDE_DEVIATION_LABEL}</span>}
    </>
  );
}
