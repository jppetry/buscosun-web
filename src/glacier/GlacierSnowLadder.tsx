/**
 * Phase GV — dossier level "Heute", variant A "Höhenleiter" (`mockups_glacier/dossier-neue-parameter.html`), lazy chunk of `GlacierBrief`.
 *
 * One card "Am Gletscher, nach Höhe": a ladder from the top down — top, median elevation and tongue with the model's new snow per day
 * (p10–p90 of that day), the snowfall line of "now" at its elevation with its course over 120 h against the glacier's band, and every
 * station of the map at its elevation (same number as in the map list). The ice runs along as a column. Below, set apart because it has
 * no elevation: the snow analysis of SNOWGRID for the area around the glacier (Austria only).
 *
 * Origins: model values carry "Modell", station values "gemessen", the analysis "Analyse" (`data-origin="analysis"`, never `measured`).
 * The weather card above keeps its content; this card only adds. No word judges conditions.
 */
import { useEffect, useMemo, useState } from 'react';
import './glacierSnow.css';
import { OriginChip } from './GlacierParts';
import { fmt0, fmt1, fmtSigned } from './glacierView';
import { loadSnowCells, loadSnowDay, loadWeather, loadWeatherHourly, type GlacierBases } from './glacierClient';
import type { GlacierCatalogEntry } from './glacierContract';
import type { GlacierSnowPointer, SnowCellsDoc } from './glacierSnowContract';
import { GLACIER_WEATHER_HOURS, type GlacierWeatherDoc, type GlacierWeatherHourlyDoc, type GlacierWeatherPointer } from './glacierWeatherContract';
import { weatherView } from './glacierWeatherView';
import { GLACIER_STN_SITE_NOTE } from './glacierStationContract';
import { ageText, type StnViewStation } from './glacierStationView';
import { stnBest, stnMainValues } from './glacierStationMap';
import {
  SNOW_ORIGIN_LABEL, SNOW_VIEW_ORIGIN, SNOW_VIEW_TEXT, LADDER_LEVEL_NAME, ladderRungs, onIce, snowAnalysisView, snowDayLong, snowDayShort,
  snowModelView, snowViewDays, spreadText, mm, type SnowDayState, type SnowLine, type SnowModelDay, type LadderRung, type SnowModelView, type SnowAnalysisView,
} from './glacierSnowView';

const H = 3_600_000;
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dayLabel = (ms: number) => { const d = new Date(ms); return `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`; };
const dayShort = (ms: number) => WD[new Date(ms).getDay()];

function AnalysisChip() {
  return <span className="gl-chip is-analysis" data-origin={SNOW_VIEW_ORIGIN} title="Herkunft: Analyse auf einem Gitter, keine Messung"><i aria-hidden="true" />{SNOW_ORIGIN_LABEL}</span>;
}

/** Five day bars of one elevation: expected new snow, the whisker = p10–p90 of THAT day. */
function DayBars({ days, level, max, name }: { days: readonly SnowModelDay[]; level: 0 | 1 | 2; max: number; name: string }) {
  const W = 300, HH = 78, bw = W / Math.max(1, days.length);
  const y = (v: number) => 8 + (1 - Math.min(v, max) / max) * (HH - 26);
  const label = `Neuschnee an der ${name} je Tag als Wasserwert: ${days.map((d) => `${dayLabel(d.startMs)} erwartet ${mm(d.sn[level])}, ${spreadText(d.snq[level], 'mm')}`).join('; ')}`;
  return (
    <svg className="gl-sv-bars" viewBox={`0 0 ${W} ${HH}`} role="img" aria-label={label}>
      {days.map((d, i) => {
        const cx = bw * i + bw / 2, [q1, q9] = d.snq[level], v = d.sn[level];
        return (
          <g key={d.d}>
            <line x1={cx} x2={cx} y1={y(q9)} y2={y(q1)} className="gl-sv-whisker" />
            <line x1={cx - 5} x2={cx + 5} y1={y(q9)} y2={y(q9)} className="gl-sv-whisker" />
            <line x1={cx - 5} x2={cx + 5} y1={y(q1)} y2={y(q1)} className="gl-sv-whisker" />
            <rect x={cx - 9} y={y(v)} width="18" height={Math.max(1.5, HH - 18 - y(v))} rx="3" className={`gl-sv-bar${i === 0 ? ' is-now' : ''}`} />
            <text x={cx} y={HH - 4} textAnchor="middle" className="gl-sv-tick">{dayShort(d.startMs)} {fmt1(v)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** The snowfall line per hour from now to +120 h against the glacier's elevation band (gaps stay gaps). */
function SnowlineSpark({ sl, z, t0Ms }: { sl: SnowLine; z: readonly [number, number, number]; t0Ms: number }) {
  const W = 600, HH = 104, L = 4, R = 4, n = sl.values.length;
  const vals = sl.values.filter((v): v is number => v != null);
  const lo = Math.min(z[0], ...vals) - 150, hi = Math.max(z[2], ...vals) + 120;
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, n - 1);
  const y = (m: number) => 6 + ((hi - m) * (HH - 30)) / (hi - lo);
  let path = '', pen = false;
  sl.values.forEach((v, i) => { if (v == null) { pen = false; return; } path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
  const ticks = Array.from({ length: n }, (_, i) => i).filter((i) => new Date(t0Ms + (sl.from + i) * H).getHours() === 0);
  const endI = sl.last != null ? sl.last - sl.from : -1;
  const label = vals.length
    ? `Schneefallgrenze der nächsten ${Math.round(n / 24)} Tage zwischen ${fmt0(Math.min(...vals))} und ${fmt0(Math.max(...vals))} m, Gletscher von ${fmt0(z[0])} bis ${fmt0(z[2])} m${endI >= 0 && endI < n - 1 ? `; nach ${dayLabel(t0Ms + (sl.last! + 1) * H)} ${new Date(t0Ms + (sl.last! + 1) * H).getHours()} Uhr keine Angabe` : ''}`
    : 'Schneefallgrenze: buscosun Fusion nennt in diesen Tagen keine';
  return (
    <svg className="gl-sv-spark" viewBox={`0 0 ${W} ${HH}`} role="img" aria-label={label}>
      <rect x={L} y={y(z[2])} width={W - L - R} height={Math.max(2, y(z[0]) - y(z[2]))} rx="4" className="gl-sv-band" />
      <line x1={L} x2={W - R} y1={y(z[1])} y2={y(z[1])} className="gl-sv-mid" />
      {ticks.map((i) => (
        <g key={i}>
          <line x1={x(i)} x2={x(i)} y1="4" y2={HH - 22} className="gl-sv-grid" />
          <text x={x(i) + 3} y={HH - 8} className="gl-sv-tick">{dayShort(t0Ms + (sl.from + i) * H)}</text>
        </g>
      ))}
      {endI >= 0 && endI < n - 1 ? <text x={Math.min(W - R - 4, x(endI + 1) + 4)} y={y(lo + 90)} className="gl-sv-tick" textAnchor={x(endI + 1) > W * 0.8 ? 'end' : 'start'}>keine Angabe</text> : null}
      <path d={path} className="gl-sv-sl" />
      {sl.now != null ? <circle cx={x(0)} cy={y(sl.now)} r="4" className="gl-sv-now" /> : null}
      <text x={W - R - 4} y={y(z[2]) + 12} textAnchor="end" className="gl-sv-bandlabel">Gletscher {fmt0(z[0])}–{fmt0(z[2])} m</text>
    </svg>
  );
}

/** Place 0–100 among the winters 1991–2020: the bands of the stored percentiles and the marker. */
function PlaceRuler({ place, flag }: { place: number; flag: -1 | 0 | 1 }) {
  const W = 520, x = (q: number) => 10 + (q / 100) * (W - 20);
  const seg = (a: number, b: number, c: string) => <rect x={x(a)} y="22" width={x(b) - x(a)} height="12" className={c} />;
  const p = flag === -1 ? 0 : flag === 1 ? 100 : place;
  const lab = flag === -1 ? 'unter jedem Winter' : flag === 1 ? 'über jedem Winter' : `Lage ${place} von 100`;
  return (
    <svg className="gl-sv-ruler" viewBox={`0 0 ${W} 70`} role="img" aria-label={`Lage ${place} von 100 unter den Wintern 1991 bis 2020 an diesem Kalendertag`}>
      {seg(0, 10, 'gl-sv-r1')}{seg(10, 25, 'gl-sv-r2')}{seg(25, 75, 'gl-sv-r3')}{seg(75, 90, 'gl-sv-r2')}{seg(90, 100, 'gl-sv-r1')}
      <line x1={x(50)} x2={x(50)} y1="18" y2="38" className="gl-sv-r-mid" />
      <text x={x(0)} y="52" className="gl-sv-tick">kleinster Wert</text>
      <text x={x(50)} y="52" textAnchor="middle" className="gl-sv-tick">Mitte</text>
      <text x={x(100)} y="52" textAnchor="end" className="gl-sv-tick">größter Wert</text>
      <text x={x(50)} y="67" textAnchor="middle" className="gl-sv-tick">der Winter 1991–2020 an diesem Kalendertag</text>
      <circle cx={x(p)} cy="28" r="7" className="gl-sv-r-dot" />
      <text x={p < 15 ? x(p) - 6 : p > 85 ? x(p) + 6 : x(p)} y="12" textAnchor={p < 15 ? 'start' : p > 85 ? 'end' : 'middle'} className="gl-sv-r-lab">{lab}</text>
    </svg>
  );
}

/** Snow depth of the last seven days (bars), a missing day as a gap with its reason in the title. */
function WeekBars({ week }: { week: ReadonlyArray<{ day: string; hs: number | null; why: string | null }> }) {
  const W = 300, HH = 70, bw = W / week.length;
  const max = Math.max(10, ...week.map((w) => w.hs ?? 0)) * 1.15;
  const label = `Schneehöhe im Gebiet ${snowDayShort(week[0].day)} bis ${snowDayShort(week[week.length - 1].day)}: ${week.map((w) => `${snowDayShort(w.day)} ${w.hs != null ? `${w.hs} cm` : `keine Daten (${w.why})`}`).join(', ')}`;
  return (
    <svg className="gl-sv-week" viewBox={`0 0 ${W} ${HH}`} role="img" aria-label={label}>
      {week.map((w, i) => {
        const cx = bw * i + bw / 2;
        if (w.hs == null) return <g key={w.day}><text x={cx} y={HH - 22} textAnchor="middle" className="gl-sv-tick"><title>{w.why}</title>–</text><text x={cx} y={HH - 4} textAnchor="middle" className="gl-sv-tick">{snowDayShort(w.day)}</text></g>;
        const bh = (w.hs / max) * (HH - 32);
        return (
          <g key={w.day}>
            <rect x={cx - 10} y={HH - 16 - bh} width="20" height={Math.max(1.5, bh)} rx="3" className={`gl-sv-wbar${i === week.length - 1 ? ' is-now' : ''}`} />
            <text x={cx} y={HH - 19 - bh} textAnchor="middle" className="gl-sv-wval">{w.hs}</text>
            <text x={cx} y={HH - 4} textAnchor="middle" className="gl-sv-tick">{snowDayShort(w.day)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export interface SnowLadderProps {
  g: GlacierCatalogEntry;
  snowPointer: GlacierSnowPointer | null;
  weatherPointer: GlacierWeatherPointer | null;
  byId: ReadonlyMap<string, GlacierCatalogEntry>;
  /** Stations of the map (DK-H), in the order of its list; `null` = none. */
  stations: readonly StnViewStation[] | null;
  nowMs: number;
  bases: GlacierBases;
}

/** The daily document and the region's hourly chunk of the weather run (memoised loaders: the weather card reads the same two files, nothing is fetched twice). */
function useWeatherDocs(g: GlacierCatalogEntry, weatherPointer: GlacierWeatherPointer | null, byId: ReadonlyMap<string, GlacierCatalogEntry>, bases: GlacierBases) {
  const catalogIds = useMemo(() => new Set(byId.keys()), [byId]);
  const [daily, setDaily] = useState<GlacierWeatherDoc | null | undefined>(undefined);
  const [hourly, setHourly] = useState<GlacierWeatherHourlyDoc | null | undefined>(undefined);
  const run = weatherPointer?.run ?? null;
  useEffect(() => {
    let alive = true;
    setDaily(undefined); setHourly(undefined);
    if (!run) { setDaily(null); setHourly(null); return; }
    void loadWeather(run, catalogIds, bases).then((d) => {
      if (!alive) return;
      setDaily(d);
      if (!d) { setHourly(null); return; }
      void loadWeatherHourly(d, g.region, bases).then((hd) => { if (alive) setHourly(hd); }, () => { if (alive) setHourly(null); });
    }, () => { if (alive) { setDaily(null); setHourly(null); } });
    return () => { alive = false; };
  }, [run, g.region, catalogIds, bases]);
  return { daily, hourly };
}

export default function GlacierSnowLadder({ g, snowPointer, weatherPointer, byId, stations, nowMs, bases }: SnowLadderProps) {
  const { daily, hourly } = useWeatherDocs(g, weatherPointer, byId, bases);
  // --- the snow analysis: the pointer's day and the six before it, and the cells file (Austria only) ---
  const [days, setDays] = useState<ReadonlyMap<string, SnowDayState>>(new Map());
  const [cells, setCells] = useState<SnowCellsDoc | null | undefined>(undefined);
  const snowDay = g.country === 'AT' ? snowPointer?.day ?? null : null, cellsFile = snowPointer?.cells ?? null;
  useEffect(() => {
    let alive = true;
    setDays(new Map()); setCells(undefined);
    if (!snowDay) return;
    for (const d of snowViewDays(snowDay)) {
      void loadSnowDay(d, bases).then((x) => { if (alive) setDays((m) => new Map(m).set(d, x)); }, () => { if (alive) setDays((m) => new Map(m).set(d, null)); });
    }
    if (cellsFile) void loadSnowCells(cellsFile, bases).then((c) => { if (alive) setCells(c); }, () => { if (alive) setCells(null); });
    else setCells(null);
    return () => { alive = false; };
  }, [snowDay, cellsFile, bases]);

  const model = useMemo(() => snowModelView(daily, hourly, g.id, nowMs), [daily, hourly, g.id, nowMs]);
  const snow = useMemo(() => snowAnalysisView({ g, pointer: snowPointer, days, cells, nowMs }), [g, snowPointer, days, cells, nowMs]);
  return <SnowLadderBody g={g} model={model} snow={snow} stations={stations} nowMs={nowMs} />;
}

/** The card itself from the two pure views — rendered by the page and, without a browser, by `verify:glacier-snow-view`. */
export function SnowLadderBody({ g, model, snow, stations, nowMs }: { g: GlacierCatalogEntry; model: SnowModelView; snow: SnowAnalysisView; stations: readonly StnViewStation[] | null; nowMs: number }) {
  const stns = stations ?? [];
  const best = useMemo(() => stnBest(stns, g.z, nowMs), [stns, g.z, nowMs]);
  const ok = model.kind === 'ok' ? model : null;
  const z = ok ? ok.z : g.z;
  const rungs = ladderRungs(z, ok?.sl?.now ?? null, stns);
  const max = ok ? Math.max(1, ...ok.days.flatMap((d) => [...d.sn, ...d.snq.map((q) => q[1])])) : 1;

  const iceBody = (r: Extract<LadderRung, { kind: 'ice' }>) => {
    if (!ok) return <div className="gl-sv-rhead"><b>{r.name}</b><OriginChip origin="model" /></div>;
    const d0 = ok.days[0], lv = r.level;
    return (
      <>
        <div className="gl-sv-rhead"><b>{r.name}</b><OriginChip origin="model" /></div>
        <div className="gl-sv-fig">
          <div className="gl-sv-figtx">
            <b className="gl-num" data-origin="model">{fmt1(d0.sn[lv])}<small>mm</small></b>
            <span>Neuschnee {dayLabel(d0.startMs)} als Wasserwert, {spreadText(d0.snq[lv], 'mm')}</span>
            <span>{ok.days.length} Tage zusammen erwartet {mm(ok.sum[lv])}, ohne Spanne</span>
          </div>
          <DayBars days={ok.days} level={lv} max={max} name={LADDER_LEVEL_NAME[lv]} />
        </div>
        {lv === 1 ? (
          <div className="gl-sv-gust">
            <span className="gl-sv-gust-l">Stärkste Böe je Tag, km/h <em>freie Höhe, nicht die Gletscherfläche</em></span>
            <dl>
              {ok.days.map((d) => (
                <div key={d.d}><dt>{dayShort(d.startMs)}</dt><dd><b className="gl-num" data-origin="model">{fmt0(d.gx)}</b><small>{fmt0(d.gq[0])}–{fmt0(d.gq[1])}</small></dd></div>
              ))}
            </dl>
          </div>
        ) : null}
      </>
    );
  };
  const slBody = (sl: SnowLine) => (
    <>
      <div className="gl-sv-rhead"><b>Schneefallgrenze</b><OriginChip origin="model" /></div>
      <p className="gl-sv-meta">
        {sl.now != null ? <>Jetzt bei <b className="gl-num" data-origin="model">{fmt0(sl.now)} m</b></> : 'Jetzt keine Angabe'}
        {sl.next24 ? `, in den nächsten 24 Stunden zwischen ${fmt0(sl.next24[0])} und ${fmt0(sl.next24[1])} m` : ', in den nächsten 24 Stunden keine Angabe'}. {SNOW_VIEW_TEXT.slMeaning}
      </p>
      <SnowlineSpark sl={sl} z={g.z} t0Ms={ok!.t0Ms} />
    </>
  );
  const stnBody = (s: StnViewStation, n: number) => {
    const vals = stnMainValues(s);
    return (
      <>
        <div className="gl-sv-rhead"><span className={`gl-sv-sn${s.id === best ? ' is-best' : ''}`} aria-hidden="true">{n}</span><b>{s.name}</b><OriginChip origin="measured" />{s.ms != null ? <span className="gl-sv-age">{ageText(nowMs - s.ms)}</span> : null}</div>
        {vals.length ? (
          <dl className="gl-sv-vals">{vals.map((v) => <div key={v.q}><dt>{v.label}</dt><dd><b className="gl-num" data-origin="measured">{v.text}</b></dd></div>)}</dl>
        ) : <p className="gl-sv-meta"><strong>Keine Daten.</strong> Die Station meldet gerade keinen gezeigten Wert.</p>}
      </>
    );
  };
  const rung = (r: LadderRung, i: number, last: boolean) => {
    const ice = onIce(r.z, g.z);
    const cls = `gl-sv-rung is-${r.kind}${ice ? ' on-ice' : ''}${last ? ' is-last' : ''}`;
    const origin = r.kind === 'stn' ? 'measured' : 'model';
    return (
      <li key={`${r.kind}-${i}`} className={cls} data-origin={origin} data-z={r.z}>
        <span className="gl-sv-z">{fmt0(r.z)} m</span>
        <span className="gl-sv-ice" aria-hidden="true" />
        <div className="gl-sv-body">
          {r.kind === 'ice' ? iceBody(r) : r.kind === 'sl' ? slBody(ok!.sl!) : stnBody(stns.find((s) => s.id === r.id)!, r.n)}
        </div>
      </li>
    );
  };
  // a snowfall line with no value "now" has no elevation: it stands under the ladder with its course
  const slApart = ok?.sl && ok.sl.now == null ? ok.sl : null;

  return (
    <section className="gl-card gl-sv" aria-label="Am Gletscher, nach Höhe">
      <div className="gl-sv-head">
        <div>
          <h3>Am Gletscher, nach Höhe</h3>
          <p>Neuschnee und Schneefallgrenze laut Modell{stns.length ? ', dazu die Messstationen in der Nähe,' : ''} in der Reihenfolge der Höhe.{stns.length ? ` ${GLACIER_STN_SITE_NOTE}.` : ''}</p>
        </div>
        <div className="gl-sv-chips"><OriginChip origin="model" />{stns.length ? <OriginChip origin="measured" /> : null}</div>
      </div>
      {!ok ? <p className="gl-nodata"><strong>Keine Daten.</strong> {model.kind === 'nodata' ? model.why : ''}</p> : null}
      {ok && !ok.sl && ok.slWhy ? <p className="gl-fine">Schneefallgrenze je Stunde: {ok.slWhy}</p> : null}
      <ol className="gl-sv-ladder">
        {rungs.map((r, i) => rung(r, i, i === rungs.length - 1 && !slApart))}
        {slApart ? (
          <li className="gl-sv-rung is-sl is-last" data-origin="model">
            <span className="gl-sv-z">—</span><span className="gl-sv-ice" aria-hidden="true" />
            <div className="gl-sv-body">{slBody(slApart)}</div>
          </li>
        ) : null}
      </ol>

      <div className="gl-sv-area" data-origin={SNOW_VIEW_ORIGIN} data-snow={snow.kind}>
        <div className="gl-sv-rhead"><b>Im Gebiet, ohne Höhe</b><AnalysisChip /></div>
        {snow.kind === 'outside' ? <p className="gl-sv-empty">{snow.text}</p>
          : snow.kind === 'loading' ? <p className="gl-sv-empty" role="status">{snow.text}</p>
          : snow.kind === 'nodata' ? <p className="gl-sv-empty"><strong>Keine Daten.</strong> {snow.why}</p>
          : (
            <>
              <div className="gl-sv-areagrid">
                <div className="gl-sv-areafig">
                  <b className="gl-num gl-sv-big" data-origin={SNOW_VIEW_ORIGIN}>{fmt0(snow.hs)}<small>cm Schnee</small></b>
                  <span>Wasserwert <b className="gl-num" data-origin={SNOW_VIEW_ORIGIN}>{fmt0(snow.swe)} mm</b></span>
                  <span>Analyse vom {snowDayLong(snow.day)}{snow.change ? `, ${fmtSigned(snow.change.cm, 0)} cm seit ${snowDayShort(snow.change.from)}` : ''}</span>
                </div>
                <div className="gl-sv-areapic">
                  <p className="gl-sv-place">{snow.place != null ? <><b>Lage {snow.place} von 100:</b> {snow.placeText}.</> : <>{snow.placeText[0].toUpperCase()}{snow.placeText.slice(1)}.</>}</p>
                  {snow.place != null ? <PlaceRuler place={snow.place} flag={snow.flag} /> : null}
                  <WeekBars week={snow.week} />
                </div>
              </div>
              <p className="gl-fine">
                {SNOW_VIEW_TEXT.analysis} {snow.cellsText[0].toUpperCase()}{snow.cellsText.slice(1)}.{snow.sharedText ? ` ${snow.sharedText}` : ''} {SNOW_VIEW_TEXT.place} Lage 0 = so wenig Schnee wie im Winter mit dem kleinsten Wert, 100 = so viel wie im Winter mit dem größten.
                {snow.week.some((w) => w.hs == null) ? ` Ohne Wert: ${snow.week.filter((w) => w.hs == null).map((w) => `${snowDayShort(w.day)} (${w.why})`).join(', ')}.` : ''}
              </p>
              <p className="gl-fine gl-sv-src">
                <a href={snow.source.url} target="_blank" rel="noopener noreferrer">{snow.source.label}</a>, {snow.source.note}, <a href={snow.source.licenceUrl} target="_blank" rel="noopener noreferrer">{snow.source.licence}</a>, <a href={snow.source.doi} target="_blank" rel="noopener noreferrer">DOI</a>. Von buscosun bearbeitet: {snow.source.changes}.
              </p>
            </>
          )}
      </div>

      <p className="gl-fine">
        {SNOW_VIEW_TEXT.ladder} {SNOW_VIEW_TEXT.unit} {SNOW_VIEW_TEXT.spread}
        {ok ? ` Ein Tag zählt 24 Stunden ab der Laufstunde (${new Date(ok.t0Ms).getHours()} Uhr). ${SNOW_VIEW_TEXT.slGaps} Modell: ${ok.engine}, Lauf ${ok.runAt.slice(11, 13)} UTC, im Hochgebirge noch nicht nachgemessen.` : ''}
      </p>
    </section>
  );
}

/**
 * Dossier level "Heute": one line of model values for now — temperature at the median elevation, today's strongest gust and new snow,
 * the snowfall line of this hour — and the way to the level "Wetter", where all of it stands in full. Same files as the weather card.
 */
export function WeatherNowStrip({ g, weatherPointer, byId, nowMs, bases, onMore }: {
  g: GlacierCatalogEntry; weatherPointer: GlacierWeatherPointer | null; byId: ReadonlyMap<string, GlacierCatalogEntry>; nowMs: number; bases: GlacierBases; onMore: () => void;
}) {
  const { daily, hourly } = useWeatherDocs(g, weatherPointer, byId, bases);
  const v = daily === undefined ? null : weatherView(daily, g.id, nowMs);
  const h = v && !('why' in v) && hourly ? hourly.glaciers[v.row.id] ?? null : null;
  const items: Array<{ l: string; v: string }> = [];
  if (v && !('why' in v)) {
    const { row, hour, day } = v, own = row.f === 'own';
    if (h && hour >= 0 && hour < GLACIER_WEATHER_HOURS) items.push({ l: `Temperatur, mittlere Höhe (${fmt0(row.z[1])} m)`, v: `${fmt1(h.t[1][hour])} °C` });
    if (own && row.gx) items.push({ l: 'Stärkste Böe heute', v: `${fmt0(row.gx[day])} km/h` });
    if (own && row.sn) items.push({ l: 'Neuschnee heute, mittlere Höhe', v: `${fmt1(row.sn[1][day])} mm Wasserwert` });
    const sl = own && h?.sl && hour >= 0 && hour < h.sl.length ? h.sl[hour] : null;
    if (own) items.push({ l: 'Schneefallgrenze jetzt', v: sl != null ? `${fmt0(sl)} m` : 'keine Angabe' });
  }
  const why = !weatherPointer ? 'Der Datenspeicher nennt noch keinen Lauf mit dem Wetter am Gletscher.' : daily === undefined ? 'Wird geladen …' : v && 'why' in v ? v.why : null;
  return (
    <section className="gl-hb-card gl-wn" aria-label="Wetter jetzt">
      <div className="gl-hb-cardhead"><span className="gl-hb-l">Wetter jetzt</span><OriginChip origin="model" /></div>
      {why || !items.length ? <p className="gl-nodata"><strong>Keine Daten.</strong> {why ?? 'Für jetzt liegen keine Stundenwerte vor.'}</p> : (
        <dl className="gl-wn-vals">
          {items.map((x) => <div key={x.l}><dt>{x.l}</dt><dd><b className="gl-num" data-origin="model">{x.v}</b></dd></div>)}
        </dl>
      )}
      <button type="button" className="gl-btn gl-wn-more" onClick={onMore}>Mehr auf der Ebene Wetter</button>
    </section>
  );
}
