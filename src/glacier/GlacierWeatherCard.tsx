/**
 * Phase GW — "Wetter am Gletscher" in the sheet (tab "Heute" and the Heute board): the weather at tongue, median elevation and top
 * from the same answer of buscosun Fusion the melt run computes (`melt/wx/<run>.json` + the hourly chunk of the region).
 *
 * Every value is a model value and says so (origin chip "Modell", the fixed wording of the contract); wind is the wind of the free
 * height. A glacier on a neighbour's forcing shows its temperatures only and says why. Without a fresh document the tile says
 * "Keine Daten" with the reason. No word about passability or safety.
 */
import { useEffect, useMemo, useState } from 'react';
import { OriginChip } from './GlacierParts';
import { fmt0, fmt1, displayName } from './glacierView';
import { loadWeather, loadWeatherHourly, type GlacierBases } from './glacierClient';
import type { GlacierCatalogEntry } from './glacierContract';
import {
  GLACIER_WEATHER_DAYS, GLACIER_WEATHER_HOURS, GLACIER_WEATHER_NOTE, GLACIER_WEATHER_WIND_NOTE,
  type GlacierWeatherDoc, type GlacierWeatherHourlyDoc, type GlacierWeatherHourlyRow, type GlacierWeatherPointer,
} from './glacierWeatherContract';
import { compassOf, weatherView } from './glacierWeatherView';

const H = 3_600_000;
const LEVEL_LABEL = ['Zunge', 'Mittlere Höhe', 'Oben'] as const;
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const degC = (v: number) => `${fmt1(v)} °C`;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="gl-stat" data-origin="model">
      <span className="gl-stat-l">{label}</span>
      <b className="gl-num" data-origin="model">{value}</b>
      <span className="gl-stat-n"><OriginChip origin="model" />{note ? <em>{note}</em> : null}</span>
    </div>
  );
}

/** 48 h: temperature at the three elevations, precipitation (snow share shaded), wind and gusts — three panels on one time axis. */
function Chart48({ h, t0Ms, nowHour }: { h: GlacierWeatherHourlyRow; t0Ms: number; nowHour: number }) {
  const n = GLACIER_WEATHER_HOURS, W = 640, L = 38, R = 8;
  const x = (i: number) => L + (i * (W - L - R)) / (n - 1);
  const all = h.t.flat();
  const tMin = Math.floor(Math.min(...all, 0) - 1), tMax = Math.ceil(Math.max(...all, 0) + 1);
  const yT = (v: number) => 12 + ((tMax - v) * 96) / (tMax - tMin);
  const line = (a: readonly number[], y: (v: number) => number) => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const own = h.w && h.g && h.p && h.s;
  const pMax = own ? Math.max(1, ...h.p!) : 1, wMax = own ? Math.max(20, ...h.g!) : 20;
  const yW = (v: number) => 248 - (v * 52) / wMax;
  const bw = (W - L - R) / (n - 1) - 1.5;
  const ticks = Array.from({ length: n }, (_, i) => i).filter((i) => new Date(t0Ms + i * H).getHours() % 6 === 0);
  const height = own ? 268 : 134;
  return (
    <svg className="gl-wx-chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Verlauf der nächsten 48 Stunden: Temperatur an Zunge, mittlerer Höhe und oben, Niederschlag, Wind und Böen">
      {ticks.map((i) => {
        const d = new Date(t0Ms + i * H);
        return (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={10} y2={height - 18} className={d.getHours() === 0 ? 'gl-wx-grid is-day' : 'gl-wx-grid'} />
            <text x={x(i)} y={height - 5} textAnchor="middle" className="gl-wx-tick">{d.getHours() === 0 ? `${WD[d.getDay()]} 0` : d.getHours()}</text>
          </g>
        );
      })}
      {nowHour > 0 && nowHour < n ? <line x1={x(nowHour)} x2={x(nowHour)} y1={8} y2={height - 18} className="gl-wx-now" /> : null}
      <line x1={L} x2={W - R} y1={yT(0)} y2={yT(0)} className="gl-wx-zero" />
      <text x={L - 5} y={yT(tMax) + 4} textAnchor="end" className="gl-wx-tick">{tMax}°</text>
      <text x={L - 5} y={yT(0) + 4} textAnchor="end" className="gl-wx-tick">0°</text>
      <text x={L - 5} y={yT(tMin) + 4} textAnchor="end" className="gl-wx-tick">{tMin}°</text>
      {h.t.map((a, lv) => <path key={lv} d={line(a, yT)} className={`gl-wx-line is-l${lv}`} />)}
      {own ? (
        <>
          <text x={L - 5} y={130} textAnchor="end" className="gl-wx-tick">{fmt1(pMax)}</text>
          <text x={L - 5} y={176} textAnchor="end" className="gl-wx-tick">mm</text>
          {h.p!.map((v, i) => {
            if (!(v > 0)) return null;
            const hh = (v * 50) / pMax, snow = (hh * h.s![i]) / 100;
            return (
              <g key={i}>
                <rect x={x(i) - bw / 2} y={176 - hh} width={bw} height={hh - snow} className="gl-wx-rain" />
                <rect x={x(i) - bw / 2} y={176 - snow} width={bw} height={snow} className="gl-wx-snow" />
              </g>
            );
          })}
          <line x1={L} x2={W - R} y1={176} y2={176} className="gl-wx-base" />
          <text x={L - 5} y={yW(wMax) + 4} textAnchor="end" className="gl-wx-tick">{wMax}</text>
          <text x={L - 5} y={248} textAnchor="end" className="gl-wx-tick">km/h</text>
          <path d={line(h.g!, yW)} className="gl-wx-line is-gust" />
          <path d={line(h.w!, yW)} className="gl-wx-line is-wind" />
          <line x1={L} x2={W - R} y1={248} y2={248} className="gl-wx-base" />
        </>
      ) : null}
    </svg>
  );
}

export default function GlacierWeatherCard({ g, pointer, byId, nowMs, bases }: {
  g: GlacierCatalogEntry; pointer: GlacierWeatherPointer | null; byId: ReadonlyMap<string, GlacierCatalogEntry>; nowMs: number; bases: GlacierBases;
}) {
  const catalogIds = useMemo(() => new Set(byId.keys()), [byId]);
  // `undefined` = still loading, `null` = not loadable
  const [daily, setDaily] = useState<GlacierWeatherDoc | null | undefined>(undefined);
  const [hourly, setHourly] = useState<GlacierWeatherHourlyDoc | null | undefined>(undefined);
  const run = pointer?.run ?? null;
  useEffect(() => {
    let alive = true;
    setDaily(undefined); setHourly(undefined);
    if (!run) return;
    void loadWeather(run, catalogIds, bases).then((d) => {
      if (!alive) return;
      setDaily(d);
      if (!d) { setHourly(null); return; }
      void loadWeatherHourly(d, g.region, bases).then((hd) => { if (alive) setHourly(hd); }, () => { if (alive) setHourly(null); });
    }, () => { if (alive) { setDaily(null); setHourly(null); } });
    return () => { alive = false; };
  }, [run, g.region, catalogIds, bases]);

  const view = useMemo(() => (daily === undefined ? null : weatherView(daily, g.id, nowMs)), [daily, g.id, nowMs]);
  const head = <div className="gl-card-head"><b>WETTER AM GLETSCHER{daily ? ` · Lauf ${daily.runAt.slice(11, 13)} UTC` : ''}</b><OriginChip origin="model" /></div>;
  const nodata = (why: string) => <section className="gl-card gl-wx" aria-label="Wetter am Gletscher">{head}<p className="gl-nodata"><strong>Keine Daten.</strong> {why}</p></section>;
  if (!pointer) return nodata('Der Datenspeicher nennt noch keinen Lauf mit dem Wetter am Gletscher.');
  if (!view) return nodata('Wird geladen …');
  if ('why' in view) return nodata(view.why);

  const { row, day, hour, t0Ms } = view;
  const own = row.f === 'own';
  const neighbour = own ? null : byId.get(row.f) ?? null;
  const neighbourName = neighbour ? displayName(neighbour) : null;
  const h = hourly ? hourly.glaciers[row.id] ?? null : null;
  const nowIn = h && hour >= 0 && hour < GLACIER_WEATHER_HOURS;
  const dayLabel = (d: number) => { const dt = new Date(t0Ms + d * 24 * H); return `${WD[dt.getDay()]} ${dt.getDate()}.${dt.getMonth() + 1}.`; };
  const days = Array.from({ length: GLACIER_WEATHER_DAYS }, (_, d) => d);
  return (
    <section className="gl-card gl-wx" aria-label="Wetter am Gletscher">
      {head}
      <p className="gl-honest">{GLACIER_WEATHER_NOTE} · {daily!.engine.name} am Punkt der mittleren Höhe, auf Zunge und oberen Rand über die Nullgradgrenze umgerechnet.</p>

      <div className="gl-wx-scroll">
        <table className="gl-wx-table gl-wx-levels">
          <thead><tr><th scope="col">Höhe</th><th scope="col">Jetzt</th><th scope="col">Minimum</th><th scope="col">Maximum</th></tr></thead>
          <tbody>
            {LEVEL_LABEL.map((label, lv) => (
              <tr key={label}>
                <th scope="row">{label}<span>{fmt0(row.z[lv])} m</span></th>
                <td><b className="gl-num" data-origin="model">{nowIn ? degC(h!.t[lv][hour]) : '—'}</b></td>
                <td><span className="gl-num" data-origin="model">{degC(row.tn[lv][day])}</span></td>
                <td><span className="gl-num" data-origin="model">{degC(row.tx[lv][day])}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="gl-fine">Minimum und Maximum der 24 Stunden ab {dayLabel(day)} {new Date(t0Ms).getHours()} Uhr.{row.tq ? ` Spanne an der mittleren Höhe ${degC(row.tq[day][0])} bis ${degC(row.tq[day][1])} (10. bis 90. Perzentil einzelner Stunden).` : ''}{nowIn ? '' : hourly === undefined ? ' Stundenwerte werden geladen.' : ' Stundenwerte für jetzt liegen nicht vor.'}</p>

      {own ? (
        <>
          <div className="gl-stats gl-wx-stats">
            <Stat label="Wind, Mittel" value={`${row.w![day]} km/h${row.wd![day] != null ? ` aus ${compassOf(row.wd![day]!)}` : ''}`} note={GLACIER_WEATHER_WIND_NOTE} />
            <Stat label="Stärkste Böe" value={`${row.gx![day]} km/h`} note={GLACIER_WEATHER_WIND_NOTE} />
            <Stat label="Niederschlag" value={`${fmt1(row.p![day])} mm`} note="Summe, Erwartungswert" />
            <Stat label="Neuschnee, mittlere Höhe" value={`${fmt1(row.sn![1][day])} mm`} note={`Wasserwert · Zunge ${fmt1(row.sn![0][day])} · oben ${fmt1(row.sn![2][day])}`} />
            <Stat label="Bewölkung, Mittel" value={`${row.c![day]} %`} />
            <Stat label="Schneefallgrenze, Mittel" value={row.sl![day] != null ? `${fmt0(row.sl![day]!)} m` : '—'} note={row.sl![day] != null ? undefined : 'kein Wert für diesen Tag'} />
          </div>
          <p className="gl-fine">Alle Werte gelten für die 24 Stunden ab Lauf an der mittleren Höhe ({fmt0(row.z[1])} m). Neuschnee ist Niederschlag mal Schneeanteil aus der Temperatur der Höhe, als Wasserwert in Millimetern.</p>
        </>
      ) : (
        <p className="gl-fine">Wind, Niederschlag, Neuschnee und Bewölkung zeigt der Steckbrief hier nicht: dieser kleine Gletscher rechnet mit dem Antrieb des Nachbarn{neighbourName ? ` ${neighbourName}` : ''}. Übertragen wird nur die Temperatur, umgerechnet auf die eigenen Höhen.</p>
      )}

      <details className="gl-wx-more">
        <summary>Verlauf der nächsten 48 Stunden <OriginChip origin="model" /></summary>
        {h ? (
          <>
            <Chart48 h={h} t0Ms={t0Ms} nowHour={hour} />
            <div className="gl-wx-legend" aria-hidden="true">
              <span><i className="is-l0" />Zunge</span><span><i className="is-l1" />Mittlere Höhe</span><span><i className="is-l2" />Oben</span>
              {own ? <><span><i className="is-rain" />Regen</span><span><i className="is-snow" />Schnee</span><span><i className="is-wind" />Wind</span><span><i className="is-gust" />Böen</span></> : null}
            </div>
            <p className="gl-fine">Uhrzeiten in deiner Ortszeit. {own ? `Wind: ${GLACIER_WEATHER_WIND_NOTE}.` : ''}</p>
          </>
        ) : <p className="gl-nodata"><strong>Keine Daten.</strong> {hourly === undefined ? 'Die Stundenwerte werden geladen …' : 'Die Stundenwerte dieser Region sind nicht ladbar.'}</p>}
      </details>

      <details className="gl-wx-more">
        <summary>Die nächsten 14 Tage <OriginChip origin="model" /></summary>
        <div className="gl-wx-scroll">
          <table className="gl-wx-table gl-wx-days">
            <thead>
              {own
                ? <tr><th scope="col">Tag</th><th scope="col">Min</th><th scope="col">Max</th><th scope="col">Wind</th><th scope="col">Böe</th><th scope="col">Niederschlag</th><th scope="col">Neuschnee</th><th scope="col">Wolken</th></tr>
                : <tr><th scope="col">Tag</th><th scope="col">Zunge</th><th scope="col">Mittlere Höhe</th><th scope="col">Oben</th></tr>}
            </thead>
            <tbody>
              {days.map((d) => (own ? (
                <tr key={d} data-origin="model">
                  <th scope="row">{dayLabel(d)}</th>
                  <td>{fmt1(row.tn[1][d])}°</td><td>{fmt1(row.tx[1][d])}°</td>
                  <td>{row.w![d]}{row.wd![d] != null ? ` ${compassOf(row.wd![d]!)}` : ''}</td><td>{row.gx![d]}</td>
                  <td>{fmt1(row.p![d])}</td><td>{fmt1(row.sn![1][d])}</td><td>{row.c![d]} %</td>
                </tr>
              ) : (
                <tr key={d} data-origin="model">
                  <th scope="row">{dayLabel(d)}</th>
                  {[0, 1, 2].map((lv) => <td key={lv}>{fmt1(row.tn[lv][d])}° / {fmt1(row.tx[lv][d])}°</td>)}
                </tr>
              )))}
            </tbody>
          </table>
        </div>
        <p className="gl-fine">{own ? 'Temperatur an der mittleren Höhe in °C, Wind und Böe in km/h, Niederschlag und Neuschnee (Wasserwert) in mm je Tag. Summen sind Erwartungswerte ohne Spanne. ' : 'Minimum / Maximum je Tag in °C. '}Ein Tag zählt 24 Stunden ab der Laufstunde. {GLACIER_WEATHER_NOTE}.</p>
      </details>
    </section>
  );
}
