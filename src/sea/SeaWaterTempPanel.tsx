/**
 * Phase WT — the card „Wassertemperatur“ (`audit/seewetter-wassertemperatur.md`, contract `seaWaterTemp.ts`, rules
 * `waterTemp.ts`).
 *
 * One device carries the card: the SEAM. Left of it stands what a station measured (ink), right of it what the model of
 * the DMI computes for the chosen hour (petrol) — two halves with their own source line, never one number made of both.
 * The chart below repeats the seam at „jetzt“: the past days measured, the next days modelled. Where one half has
 * nothing, it says so in its own place; the other half never fills it.
 *
 * Words: the model is „Modell für das offene Wasser, im flachen Uferwasser kann es wärmer oder kälter sein“; a
 * measurement names where it is taken. The threshold is the user's own number — a line and a sentence about which side
 * a value lies on. No advice of any kind.
 */
import { lazy, Suspense, useEffect, useId, useState } from 'react';
import { dayShort, f1, hh, hm } from './seaView';
import { DMI_CREDIT, DMI_LICENCE, DMI_LICENCE_URL, DMI_TERMS_URL, DMI_WL_COLLECTION_LABEL } from './seaDmi';
import {
  WSV_CREDIT, WSV_LICENCE, WSV_LICENCE_URL, WSV_PAGE, WT_DAY_MIN_HOURS, WT_MODEL_LAYER_NOTE, WT_MODEL_NOTE, WT_NET_LABEL, WT_PAST_DAYS, WT_RAW_NOTE,
  WT_SEASON_MIN_YEARS, WT_SITE_LABEL, wtModelDryShare, type WtDayPoint, type WtPoint, type WtSeasonPoint, type WtStation,
} from './seaWaterTemp';
import {
  WT_SIDES, WT_SIDE_LABEL, parseWtInput, wtModelSentence, wtNum, wtObsSentence, wtThNum, wtThresholdText, wtWhen,
  type WtModelView, type WtObsView, type WtSide, type WtThreshold,
} from './waterTemp';

const WtChart = lazy(() => import('./SeaWaterTempChart'));
const WtRecordChart = lazy(() => import('./SeaWaterTempChart').then((m) => ({ default: m.WtRecordChart })));
const WtSeasonChart = lazy(() => import('./SeaWaterTempChart').then((m) => ({ default: m.WtSeasonChart })));

export interface SeaWaterTempView {
  model: WtModelView;
  obs: WtObsView;
  /** The station's values of the past days on whole hours (empty without a station or an answer). */
  obsHourly: readonly WtPoint[];
  /** Our own daily record of the station: `null` = none readable, `'loading'` while it is read. */
  record: { since: string; points: WtDayPoint[] } | null | 'loading';
  /** The course of the year from the source's own full years — only where it delivers at least five; else `null`. */
  season: { name: string; years: number[]; points: WtSeasonPoint[] } | null;
  threshold: WtThreshold | null;
  onThreshold: (th: WtThreshold | null) => void;
  /** Chosen hour of the page and the clock. */
  tMs: number; nowMs: number;
}

const DATE = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const dateOf = (day: string) => DATE.format(new Date(`${day}T12:00:00Z`));
const runText = (ms: number) => { const d = new Date(ms).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)}., ${d.slice(11, 13)} UTC`; };
/** The catalogue carries the names ready to read (PEGELONLINE's capitals are set in the catalogue builder). */
const stationName = (st: WtStation) => st.name;
/** „am WSV-Pegel Hörnum (Nordsee)“ / „im Hafen, DMI-Station Gedser Havn II“ — where the value is taken. */
export const wtWhereText = (st: WtStation): string =>
  `${st.site === 'pegel' ? (st.net === 'wsv' ? 'am WSV-Pegel' : 'an der DMI-Station') : `${WT_SITE_LABEL[st.site]}, ${WT_NET_LABEL[st.net]}`} ${st.name}${st.water ? ` (${st.water})` : ''}`;

/** The source note in its own words („DMI, CC BY 4.0“), with the licence's name as the link to its text. */
function Credit({ credit, licence, url }: { credit: string; licence: string; url: string }) {
  const i = credit.lastIndexOf(licence);
  if (i < 0) return <>{credit}</>;
  return <>{credit.slice(0, i)}<a href={url} target="_blank" rel="noreferrer">{licence}</a>{credit.slice(i + licence.length)}</>;
}
const DmiCredit = () => <Credit credit={DMI_CREDIT} licence={DMI_LICENCE} url={DMI_LICENCE_URL} />;

function ObsHalf({ v }: { v: WtObsView }) {
  const src = v.station?.net === 'dmi'
    ? <><DmiCredit />, {WT_RAW_NOTE}</>
    : <><Credit credit={WSV_CREDIT} licence={WSV_LICENCE} url={WSV_LICENCE_URL} />, {WT_RAW_NOTE}</>;
  return (
    <div className="sw-wt-half is-obs">
      <span className="sw-wt-kind">Gemessen{v.latest ? `, ${hm(v.latest.t)} Uhr` : ''}</span>
      {v.state === 'ok' && v.latest
        ? <strong className="sw-wt-val">{wtNum(v.latest.c)}<span>°C</span></strong>
        : <strong className="sw-wt-val is-text">{v.state === 'loading' ? 'lädt …' : v.state === 'nostation' ? 'keine Station in der Nähe' : 'keine Messung'}</strong>}
      {v.station && v.km != null && <p className="sw-wt-where">{wtWhereText(v.station)}, {f1(v.km)} km vom Spot</p>}
      {v.why && <p className="sw-wt-why">{v.why}</p>}
      {v.station && <p className="sw-wt-src">{src}</p>}
    </div>
  );
}

function ModelHalf({ v, tMs }: { v: WtModelView; tMs: number }) {
  const when = `${dayShort(tMs)} ${hh(tMs)} Uhr`;
  const gapText = v.gap === 'dry' ? 'In dieser Stunde führt die Modellzelle kein Wasser (im Modell trockengefallen).'
    : v.gap === 'beyond' && v.until != null ? `Der Lauf des Modells reicht bis ${dayShort(v.until)} ${hh(v.until)} Uhr — für die gewählte Stunde gibt es keinen Wert.`
      : v.gap === 'before' && v.runMs != null ? `Der Lauf des Modells beginnt ${dayShort(v.runMs)} ${hh(v.runMs)} Uhr — für die gewählte Stunde gibt es keinen Wert.` : null;
  const dry = v.entry ? wtModelDryShare(v.entry) : 0;
  return (
    <div className="sw-wt-half is-model">
      <span className="sw-wt-kind">Modell, {when}</span>
      {v.state === 'ok' && v.c != null
        ? <strong className="sw-wt-val">{wtNum(v.c)}<span>°C</span></strong>
        : <strong className="sw-wt-val is-text">{v.state === 'loading' ? 'lädt …' : v.gap === 'dry' ? 'ohne Wasser' : 'keine Daten'}</strong>}
      {v.state === 'ok' && <p className="sw-wt-where">{WT_MODEL_NOTE}.</p>}
      {(v.why || gapText) && <p className="sw-wt-why">{v.why ?? gapText}</p>}
      {v.state === 'ok' && v.entry && (
        <p className="sw-wt-facts">
          {DMI_WL_COLLECTION_LABEL[v.entry.coll]}, {WT_MODEL_LAYER_NOTE}; Gitterpunkt {f1(v.entry.km)} km vom Spot.
          {v.runMs != null && <> Lauf vom {runText(v.runMs)}{v.until != null ? `, reicht bis ${dayShort(v.until)} ${hh(v.until)} Uhr` : ''}.</>}
          {dry >= 0.05 && <> In {Math.round(dry * 100)} % der Stunden dieses Laufs führt die Zelle kein Wasser.</>}
        </p>
      )}
      <p className="sw-wt-src"><DmiCredit /> (<a href={DMI_TERMS_URL} target="_blank" rel="noreferrer">Nutzungsbedingungen</a>), auf 0,1 °C gerundet</p>
    </div>
  );
}

/** The threshold as one sentence to fill in. Commits on every valid change; an empty number clears it. */
export function WtThresholdControl({ threshold: th, onThreshold }: { threshold: WtThreshold | null; onThreshold: (th: WtThreshold | null) => void }) {
  const id = useId();
  const [side, setSide] = useState<WtSide>(th?.side ?? 'over');
  const [text, setText] = useState<string>(th ? wtThNum(th.c) : '');
  const key = th ? `${th.side}.${th.c}` : '';
  // A link or another view changed the threshold: follow it (not while the user is typing the same number).
  useEffect(() => {
    if (!th) { setText(''); return; }
    setSide(th.side);
    setText((cur) => (parseWtInput(cur) === th.c ? cur : wtThNum(th.c)));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (s: WtSide, raw: string) => {
    if (raw.trim() === '') { if (th) onThreshold(null); return; }
    const c = parseWtInput(raw);
    if (c != null) onThreshold({ side: s, c });
  };
  const invalid = text.trim() !== '' && parseWtInput(text) == null;
  return (
    <div className="sw-wt-ctl">
      <div className="sw-wt-sentence">
        <span>Zeig, wann das Wasser</span>
        <span className="sw-seg sw-wt-side" role="group" aria-label="Seite der Schwelle">
          {WT_SIDES.map((s) => <button key={s} type="button" aria-pressed={side === s} className={side === s ? 'is-active' : ''} onClick={() => { setSide(s); commit(s, text); }}>{WT_SIDE_LABEL[s]}</button>)}
        </span>
        <span className="sw-wt-num">
          <label className="sw-sr" htmlFor={`${id}-c`}>Schwelle in Grad Celsius</label>
          <input id={`${id}-c`} type="text" inputMode="decimal" autoComplete="off" placeholder="z. B. 18" value={text} aria-invalid={invalid}
            aria-describedby={`${id}-h`} onChange={(e) => { setText(e.target.value); commit(side, e.target.value); }} />
          <span>°C</span>
        </span>
        <span>liegt.</span>
      </div>
      <p className="sw-wt-hint" id={`${id}-h`}>
        {invalid ? 'Eine Zahl zwischen −2 und 35, höchstens eine Nachkommastelle.' : 'Deine eigene Zahl: sie wird in diesem Browser gemerkt und steht im Link zum Teilen.'}
        {th && <> <button type="button" className="sw-link sw-wt-clear" onClick={() => onThreshold(null)}>Schwelle löschen</button></>}
      </p>
    </div>
  );
}

/** „2015–2017, 2019, 2022–2025“ — the years as they are, runs joined. */
export function wtYearsText(years: readonly number[]): string {
  const out: string[] = [];
  for (let i = 0; i < years.length; i++) {
    let j = i;
    while (j + 1 < years.length && years[j + 1] === years[j] + 1) j++;
    out.push(j > i ? `${years[i]}–${years[j]}` : String(years[i]));
    i = j;
  }
  return out.join(', ');
}

/**
 * Below the chart: the course of the year where the station's own source delivers five full years (measured: four DMI
 * stations), else „Verlauf seit <Datum>“ from our own record. Never a climatology of another place or of a model.
 */
function Record({ v, big }: { v: SeaWaterTempView; big: boolean }) {
  const st = v.obs.station;
  if (!st) return null;
  const name = stationName(st);
  const rec = v.record !== 'loading' ? v.record : null;
  if (v.season) {
    const s = v.season;
    return (
      <div className="sw-wt-record">
        <p className="sw-wt-record-h">Jahresgang an der Station {name}</p>
        <p className="sw-wt-record-n">
          Aus den Messwerten des DMI: {s.years.length} volle Jahre ({wtYearsText(s.years)}). Fläche: niedrigstes bis höchstes Tagesmittel dieser Jahre am selben Kalendertag. Dünne Linie: ihr Mittel. Nicht geglättet und nicht aufgefüllt — Lücken bleiben Lücken.
          {rec ? ` Kräftige Linie: dieses Jahr aus unserer eigenen Ablage, seit ${dateOf(rec.since)}.` : ''}
        </p>
        <Suspense fallback={<div className="sw-wt-chart-ph is-record">Jahresgang lädt …</div>}><WtSeasonChart season={s.points} record={rec?.points ?? []} nowMs={v.nowMs} big={big} /></Suspense>
        <div className="sw-chart-legend sw-wt-legend">
          <span><i className="is-span" />Spanne der Jahre</span><span><i className="is-years" />Mittel der Jahre</span>
          {rec && <span><i className="is-obs" />dieses Jahr, eigene Ablage</span>}
          <span><i className="is-now" />heute</span>
        </div>
        <p className="sw-wt-src"><DmiCredit />, eigene Auswertung der Rohwerte</p>
      </div>
    );
  }
  const noSeason = `Keine Jahreskurve: die Quelle liefert für diese Station keine ${WT_SEASON_MIN_YEARS} vollen Jahre${st.net === 'wsv' ? ' (PEGELONLINE hält 31 Tage)' : ''}, und unsere Ablage ist jünger. Hier steht nur, was gemessen und gespeichert wurde.`;
  if (v.record === 'loading') return <div className="sw-wt-record"><p className="sw-wt-record-h">Verlauf der Station {name} lädt …</p></div>;
  if (!rec) {
    return (
      <div className="sw-wt-record">
        <p className="sw-wt-record-h">Für die Station {name} liegt in unserer eigenen Ablage noch kein voller Tag.</p>
        <p className="sw-wt-record-n">Die Ablage speichert die Messwerte täglich; ein Tag zählt ab {WT_DAY_MIN_HOURS} Stundenwerten. {noSeason}</p>
      </div>
    );
  }
  const pts = rec.points, last = pts[pts.length - 1];
  return (
    <div className="sw-wt-record">
      <p className="sw-wt-record-h">Verlauf seit {dateOf(rec.since)}</p>
      <p className="sw-wt-record-n">
        Gemessen an der Station {name}, aus unserer eigenen Ablage: {pts.length === 1 ? 'ein voller Tag' : `${pts.length} volle Tage`}, zuletzt {dateOf(last.day)} mit {wtNum(last.min)} bis {wtNum(last.max)} °C (Mittel {wtNum(last.mean)} °C).
        {pts.length < 2 ? ' Eine Kurve erscheint ab dem zweiten vollen Tag.' : ' Linie: Tagesmittel. Fläche: Spanne zwischen dem niedrigsten und dem höchsten Stundenwert des Tages.'}
      </p>
      {pts.length >= 2 && <Suspense fallback={<div className="sw-wt-chart-ph is-record">Verlauf lädt …</div>}><WtRecordChart points={pts} big={big} /></Suspense>}
      <p className="sw-wt-record-n">{noSeason}</p>
    </div>
  );
}

/** The card. `big` = the wide dossier stage. */
export default function SeaWaterTempPanel({ view: v, big = true }: { view: SeaWaterTempView; big?: boolean }) {
  const e = v.model.entry;
  const model = e ? e.c.map((x, i) => ({ t: e.t0 + i * 3_600_000, c: x == null ? null : x / 10 })) : [];
  const hasChart = v.obsHourly.length + model.filter((p) => p.c != null).length >= 2;
  const th = v.threshold;
  return (
    <section className={`sw-card is-cream${big ? ' is-wide' : ''} sw-wt`} aria-label="Wassertemperatur am Spot">
      <div className="sw-wt-pair">
        <ObsHalf v={v.obs} />
        <ModelHalf v={v.model} tMs={v.tMs} />
      </div>
      {hasChart && (
        <div className="sw-wt-plot">
          <Suspense fallback={<div className="sw-wt-chart-ph">Verlauf lädt …</div>}>
            <WtChart obs={v.obsHourly} model={model} nowMs={v.nowMs} selMs={v.tMs} threshold={th} big={big} />
          </Suspense>
          <div className="sw-chart-legend sw-wt-legend">
            {v.obsHourly.length > 0 && <span><i className="is-obs" />gemessen, letzte {WT_PAST_DAYS} Tage</span>}
            {model.length > 0 && <span><i className="is-model" />Modell des DMI</span>}
            <span><i className="is-now" />jetzt</span>
            {th && <span><i className="is-th" />deine Schwelle</span>}
          </div>
        </div>
      )}
      <div className="sw-wt-th">
        <WtThresholdControl threshold={th} onThreshold={v.onThreshold} />
        {th && (
          <ul className="sw-wt-says" aria-label={`Lage zur Schwelle ${wtThresholdText(th)}`}>
            {v.obs.latest && <li className="is-obs">{wtObsSentence(v.obs.latest, th)}</li>}
            {!v.obs.latest && v.obs.station && <li className="is-obs">Keine aktuelle Messung — zur Schwelle lässt sich für die Station nichts sagen.</li>}
            {e && v.model.state === 'ok' ? <li className="is-model">{wtModelSentence(e, th, v.nowMs)}</li> : <li className="is-model">Keine Daten des Modells — zur Schwelle lässt sich für das Modell nichts sagen.</li>}
          </ul>
        )}
        {th && <p className="sw-wt-foot">„{WT_SIDE_LABEL[th.side]}“ heißt streng {th.side === 'over' ? 'größer' : 'kleiner'} als {wtThNum(th.c)} °C. Die Sätze sagen nur, auf welcher Seite deiner Zahl ein Wert liegt{e && v.model.until != null ? ` — für das Modell bis ${wtWhen(v.model.until)}` : ''}.</p>}
      </div>
      <Record v={v} big={big} />
      {v.obs.station?.net !== 'dmi' && v.obs.station && <p className="sw-disclaimer sw-wt-more"><a href={WSV_PAGE} target="_blank" rel="noreferrer">PEGELONLINE der WSV</a></p>}
    </section>
  );
}
