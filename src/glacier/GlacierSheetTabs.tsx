/**
 * GL-4 — the five tabs of the sheet: Heute · Saison · Langzeit · Tour · Quellen. Every number carries its origin chip, every area its reference year;
 * what is not there (no melt run, no clear scene, class C) is said in words and never replaced by a placeholder value.
 * The melt shows as an INDEX without a unit while the calibration gate (Gate C) is red — the unit appears only when the run document says so.
 */
import { useState, type ReactNode } from 'react';
import { OriginChip, LockNote } from './GlacierParts';
import { fmt0, fmt2, fmtKm2, fmtRefYear, fmtSigned } from './glacierView';
import {
  dateDe, dateDeLong, STATE_TEXT, indexWord, projectionSentence, tourLines, tourProblems, TOUR_DISCLAIMER, NOT_USED_SOURCES, againstBand, climaBand, albedoAnomaly, sourceRows, seasonSummary,
  elevFigure, elevSentence, hugFigure, hugCumFigure, hugSentence, hugNum, hugStakeScale, HUG_STAKE_KEYS, HUG_TEXT,
  type MeltView, type SeasonSummary, type ProjectionView, type MassRow, type SourceRow, type ElevView, type HugonnetView, type HugPeriod,
} from './glacierSheetModel';
import { SeasonChart, LengthChart, ProjectionChart, FreezeChart, MeltBars, ElevBars, CumulChart } from './GlacierCharts';
import type { GlacierCatalogEntry, GlacierOfficialItem, GlacierSeries } from './glacierContract';
import type { SheetData } from './glacierSheetData';
import { glacierSourceTerms, type GlacierSourceRow } from './glacierClient';
import { exportSvgAsPng } from '../imageExport';
import type { GlacierSeasonRow } from './glacierSatContract';

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const dayLabels = (runAt: string, n = 14): string[] => Array.from({ length: n }, (_, i) => WD[new Date(Date.parse(runAt) + i * 86_400_000).getUTCDay()]);

function Stat({ label, children, origin, note }: { label: string; children: ReactNode; origin: 'measured' | 'satellite' | 'model' | 'official'; note?: string }) {
  return (
    <div className="gl-stat" data-origin={origin}>
      <span className="gl-stat-l">{label}</span>
      <b className="gl-num" data-origin={origin}>{children}</b>
      <span className="gl-stat-n"><OriginChip origin={origin} />{note ? <em>{note}</em> : null}</span>
    </div>
  );
}

// --- Heute -------------------------------------------------------------------------------------------------------------------------------
export function TabHeute({ g, melt, meltWhy, season, nowMs, neighbourName, weather = null }: { g: GlacierCatalogEntry; melt: MeltView | null; meltWhy: string | null; season: SeasonSummary | null; nowMs: number; neighbourName: string | null; /** Phase GW: the card "Wetter am Gletscher" (`null` = off). */ weather?: ReactNode }) {
  const ok = melt && melt.fresh && melt.todayIdx;
  return (
    <>
      <section className="gl-card gl-hero" aria-label="Schmelzindex heute">
        <div className="gl-card-head"><b>SCHMELZINDEX · 24 h ab Lauf{melt ? ` ${melt.runAt.slice(11, 13)} UTC` : ''}</b><OriginChip origin="model" /></div>
        {ok ? (
          <>
            <div className="gl-big"><span className="gl-num" data-origin="model" data-melt-index={melt!.todayIdx![1]}>{melt!.todayIdx![1]}</span><span>von 100 · {indexWord(melt!.todayIdx![1])}</span></div>
            <p>Spanne {melt!.todayIdx![0]}–{melt!.todayIdx![2]} (10. bis 90. Perzentil der Szenarien) · Mittel der nächsten 7 Tage {melt!.ix7[1]} ({melt!.ix7[0]}–{melt!.ix7[2]})</p>
            <p className="gl-honest">Der Index hat keine Einheit: 100 entspricht einem sehr heißen Sommertag im Gletschermittel (gesetzt). Millimeter Eis oder Wasser zeigt der Steckbrief erst, wenn die Eichung gegen die gemessenen Bilanzen besteht — sie besteht noch nicht.</p>
            {melt!.unit ? null : <LockNote>Einheit gesperrt (Gate C nicht bestanden)</LockNote>}
          </>
        ) : <p className="gl-nodata"><strong>Keine Daten.</strong> {meltWhy ?? 'Der Schmelzlauf fehlt für diesen Gletscher.'}</p>}
      </section>
      {ok && (
        <>
          <div className="gl-stats">
            <Stat label="Nullgradgrenze, Tagesmaximum" origin="model" note={melt!.zf[0] == null ? 'kein Wert in diesem Lauf' : melt!.zs === 'cells' ? `${melt!.engine}, Druckflächen` : 'aus Temperatur und Standardgradient'}>{melt!.zf[0] != null ? `${fmt0(melt!.zf[0])} m` : '—'}</Stat>
            <Stat label="Fläche ohne Schneedecke" origin="model" note={melt!.state.source === 'cold' ? 'Modellzustand neu begonnen' : 'Zustand fortgeführt'}>{melt!.ice} %</Stat>
            <Stat label="Nächte über 0 °C an der Zunge" origin="model" note="von 13 berechneten">{melt!.nf}</Stat>
          </div>
          <h3 className="gl-h3">Schmelzindex der nächsten 14 Tage</h3>
          <MeltBars idx={melt!.idx} labels={dayLabels(melt!.runAt)} today={0} />
          <p className="gl-fine">Balken = Median, Strich = 10.–90. Perzentil von {40} Szenarien mit zeitlich korrelierter Temperaturabweichung. {neighbourName ? `Antrieb vom Nachbarn ${neighbourName} (kleiner Gletscher ohne eigenen Punkt), eigene Höhenbänder.` : 'Antrieb am eigenen Punkt in der Medianhöhe des Gletschers.'}</p>
        </>
      )}
      {weather}
      <SatCard g={g} season={season} nowMs={nowMs} />
    </>
  );
}

export function SatCard({ g, season, nowMs }: { g: GlacierCatalogEntry; season: SeasonSummary | null; nowMs: number }) {
  if (g.country === 'DE' || g.klass === 'C') {
    return <section className="gl-card" aria-label="Satellit"><div className="gl-card-head"><b>SATELLIT</b><OriginChip origin="satellite" /></div><p>{g.country === 'DE' ? 'Für die vier deutschen Gletscher gibt es keine Satellitenzahl; es gelten die Zahlen der BAdW.' : 'Keine Zahl für Gletscher unter 0,1 km² (Klasse C): zu wenige Pixel für eine verlässliche Aussage.'}</p></section>;
  }
  const s = season?.last;
  const age = s ? Math.floor((nowMs - Date.parse(`${s.date}T12:00:00Z`)) / 86_400_000) : null;
  return (
    <section className="gl-card" aria-label="Satellit">
      <div className="gl-card-head"><b>SATELLIT · Sentinel-2</b><OriginChip origin="satellite" /></div>
      {!s ? <p className="gl-nodata"><strong>Keine Daten.</strong> Noch keine klare Szene im Datenspeicher.</p>
        : age != null && age > 20 ? <p className="gl-nodata"><strong>Keine klare Szene seit {age} Tagen.</strong> Letzte: {dateDeLong(s.date)}.</p> : (
          <>
            <div className="gl-big"><span className="gl-num" data-origin="satellite">{Math.round((1 - s.snow) * 100)} %</span><span>schneefrei · {dateDeLong(s.date)}</span></div>
            <p>{g.klass === 'A' && s.state === 1 && s.sla != null ? `Schneegrenze ${fmt0(s.sla)} m${s.aar != null ? ` · AAR ${fmt2(s.aar)}` : ''} · ` : g.klass === 'B' ? 'Klasse B: Schneeanteil, keine Schneegrenze · ' : `${STATE_TEXT[s.state]} · `}klar {Math.round(s.clear * 100)} % der Fläche</p>
          </>
        )}
    </section>
  );
}

// --- Saison ------------------------------------------------------------------------------------------------------------------------------
export function TabSaison({ g, data, year, selDate, mass }: { g: GlacierCatalogEntry; data: SheetData; year: number | null; selDate: string | null; mass: MassRow | null }) {
  const klass: 'A' | 'B' = g.klass === 'A' ? 'A' : 'B';
  const rows: readonly GlacierSeasonRow[] = (year != null ? data.seasons.get(year) : undefined) ?? [];
  const band = data.clima ? climaBand(data.clima.entry, data.clima.doy0, data.clima.bin) : [];
  if (g.country === 'DE' || g.klass === 'C') {
    return <section className="gl-card"><div className="gl-card-head"><b>SAISON</b><OriginChip origin="satellite" /></div><p>{g.country === 'DE' ? 'Für die vier deutschen Gletscher gibt es keine Satellitenzahl; es gelten die Zahlen der BAdW (Reiter Langzeit).' : 'Keine Satellitenzahl für Gletscher unter 0,1 km² (Klasse C).'}</p></section>;
  }
  const sum = seasonSummary(rows, klass);
  const anomaly = klass === 'A' && year != null ? albedoAnomaly(data.seasons, year) : null;
  const sel = selDate ? sum.scenes.find((s) => s.date === selDate) ?? null : null;
  const cmp = sel && sel.sla != null && band.length ? againstBand(band, sel.doy, sel.sla) : null;
  const lastOfBand = sum.last && sum.last.sla != null && band.length ? againstBand(band, sum.last.doy, sum.last.sla) : null;
  return (
    <>
      <section className="gl-card" aria-label="Saison">
        <div className="gl-card-head"><b>{year != null ? `SAISON ${year}` : 'SAISON'} · {klass === 'A' ? 'Schneegrenze je klarer Szene' : 'Ausaperung je klarer Szene'}</b><OriginChip origin="satellite" /></div>
        {sum.scenes.length === 0 ? <p className="gl-nodata"><strong>Keine Daten.</strong> In dieser Saison liegt keine klare Szene (Maske ≥ 70 % klar) im Datenspeicher.</p> : klass === 'A' ? (
          <>
            <SeasonChart scenes={sum.scenes} band={band} zRange={[g.z[0], g.z[2]]} />
            <div className="gl-legend-lines" aria-hidden="true"><span><i style={{ background: '#4B3D96' }} />Szenen 2026</span>{band.length ? <span><i style={{ background: '#CFC6EE' }} />2000–2025, p10–p90</span> : null}{band.length ? <span><i style={{ background: '#6B5BB8' }} />Median</span> : null}</div>
            {!band.length && <p className="gl-fine">Ein Band der Jahre 2000–2025 liegt für diesen Gletscher nicht vor (TSLA deckt Gletscher über 1 km² ab, die Zuordnung braucht eine Flächenübereinstimmung).</p>}
          </>
        ) : <p>Klasse B: nur der Schneeanteil je Szene, keine Schneegrenze. Zuletzt {Math.round((1 - (sum.last?.snow ?? 0)) * 100)} % schneefrei ({sum.last ? dateDeLong(sum.last.date) : '—'}).</p>}
      </section>
      {klass === 'A' && sum.scenes.length > 0 && (
        <div className="gl-stats">
          <Stat label="Höchste Schneegrenze" origin="satellite" note={sum.highest ? dateDe(sum.highest.date) : undefined}>{sum.highest ? `${fmt0(sum.highest.sla)} m` : '—'}</Stat>
          <Stat label="Schneeanteil (AAR), jüngste Szene" origin="satellite" note={sum.aar ? dateDe(sum.aar.date) : undefined}>{sum.aar ? fmt2(sum.aar.v) : '—'}</Stat>
          <Stat label="Albedo Blankeis gegen Vorjahre" origin="satellite" note={anomaly ? `${anomaly.nNow} Szenen gegen ${anomaly.nBefore} aus ${anomaly.years.join('/')}` : 'zu wenige frühere Szenen'}>{anomaly ? `${fmtSigned(anomaly.delta, 2)}` : '—'}</Stat>
        </div>
      )}
      {anomaly && <p className="gl-fine">{anomaly.delta < 0 ? `Das Eis ist ${fmt2(-anomaly.delta)} dunkler` : anomaly.delta > 0 ? `Das Eis ist ${fmt2(anomaly.delta)} heller` : 'Die Albedo des Eises liegt im Mittel'} als im Mittel der eigenen Szenen früherer Jahre im selben Zeitfenster. Ursache nicht belegt (Staub, Ruß, älteres Eis, Schmutz).</p>}
      {(cmp || lastOfBand) && (() => { const c = cmp ?? lastOfBand!; const when = cmp && sel ? dateDe(sel.date) : sum.last ? dateDe(sum.last.date) : ''; return <p className="gl-fine">Die Schneegrenze am {when} liegt {c.where === 'above' ? 'über' : c.where === 'below' ? 'unter' : 'innerhalb'} dem Band der Jahre 2000–2025 für diese Woche ({fmt0(c.p10)}–{fmt0(c.p90)} m, Median {fmt0(c.p50)} m; {fmtSigned(c.dev, 0)} m gegen den Median).</p>; })()}
      <section className="gl-card" aria-label="Bilanz">
        <div className="gl-card-head"><b>BILANZ</b><OriginChip origin="measured" /></div>
        {mass ? <><div className="gl-big"><span className="gl-num" data-origin="measured">{mass.ba != null ? `${fmt0(mass.ba)} mm w. e.` : '—'}</span><span>Jahresbilanz {mass.year - 1}/{String(mass.year).slice(2)}{mass.ela != null ? ` · Gleichgewichtslinie ${fmt0(mass.ela)} m` : ''}{mass.aar != null ? ` · AAR ${fmt2(mass.aar)}` : ''}</span></div><p>Gemessen (glaziologische Methode). Die Messung der laufenden Saison erscheint, sobald das Messnetz sie veröffentlicht.</p></> : <p>Für diesen Gletscher gibt es keine Massenbilanz-Messreihe.</p>}
        <LockNote>Saisonschätzung des Modells: nicht berechnet (die Eichung der Schmelze besteht noch nicht)</LockNote>
      </section>
    </>
  );
}

// --- Langzeit ----------------------------------------------------------------------------------------------------------------------------
/**
 * Phase GH — elevation change of the surface 2000–2019 (Hugonnet et al. 2021): the figure of the whole period and the four five-year
 * columns. Rendered only for a glacier that has the block; period, origin and the end of the series stand at the numbers.
 */
export function ElevCard({ elev }: { elev: ElevView }) {
  const f = elevFigure(elev.total);
  const anyRange = elev.periods.some((r) => r?.rangeOnly);
  return (
    <section className="gl-card gl-elev" aria-label="Höhenänderung der Oberfläche" data-elev-rgi={elev.rgi}>
      <div className="gl-card-head"><b>HÖHENÄNDERUNG DER OBERFLÄCHE · {elev.total.label}</b><OriginChip origin="satellite" /></div>
      <div className="gl-big"><span className={`gl-num${elev.total.rangeOnly ? ' is-range' : elev.total.v < 0 ? '' : ' is-gain'}`} data-origin="satellite">{f.value}</span><span>{f.note}</span></div>
      <p>{elevSentence(elev)}</p>
      <ElevBars view={elev} />
      <div className="gl-legend-lines gl-elev-legend" aria-hidden="true">
        <span><i className="gl-elev-col" />Mittel je fünf Jahre</span>
        <span><i className="gl-elev-whisker" />Unsicherheit (1 σ)</span>
        {anyRange ? <span><i className="gl-elev-range" />nur Spanne</span> : null}
        {elev.total.rangeOnly ? null : <span><i className="gl-elev-mean" />Mittel {elev.total.label}</span>}
      </div>
      <p className="gl-fine">Aus Satellitenbildern abgeleitet (ASTER-Stereobilder; Hugonnet et al. 2021), gemittelt über den Umriss des Inventars RGI 6.0 von etwa 2003 ({fmtKm2(elev.km2)}). Die Reihe endet {elev.total.to}. Sie ist nicht der Schmelzindex und keine Vorhersage.{anyRange || elev.total.rangeOnly ? ' Wo die Unsicherheit so groß ist wie der Wert, steht nur die Spanne.' : ''}</p>
    </section>
  );
}

/** The period ladder: one row per length of period, each button as wide as its years (indices into `HugonnetView.periods`). */
const HUG_LADDER: ReadonlyArray<{ w: 4 | 2 | 1; i: readonly number[] }> = [{ w: 4, i: [0] }, { w: 2, i: [1, 2] }, { w: 1, i: [3, 4, 5, 6] }];
/**
 * The figure "per square metre": the yearly change of the surface and the same change as a layer of water, drawn to scale on ONE
 * metre staff. The scale is fixed per glacier (`hugStakeScale`), so the columns move when the period changes; the dashed line is the
 * mean of the whole period. With the uncertainty as large as the value there is no column, only the range it spans.
 */
function HugStake({ hug, p }: { hug: HugonnetView; p: HugPeriod }) {
  const sc = hugStakeScale(hug);
  const y = (v: number) => ((sc.hi - v) / (sc.hi - sc.lo)) * 100;
  const cols = HUG_STAKE_KEYS.map((k) => ({ k, q: p.q[k], f: hugFigure(p.q[k]), ref: p !== hug.total && !hug.total.q[k].rangeOnly ? hug.total.q[k].v : null }));
  const anyRange = cols.some((c) => c.q.rangeOnly), anyRef = cols.some((c) => c.ref != null);
  return (
    <div className="gl-hug-stk" data-origin="satellite">
      <div className="gl-hug-stk-head"><b>Je Quadratmeter Gletscher</b><span>Maßstab in m pro Jahr, unter 0 = Verlust</span></div>
      <div className="gl-hug-stk-plot" role="img" aria-label={cols.map((c) => `${HUG_TEXT[c.k].title}: ${c.f.value} ${c.f.unit} pro Jahr, ${c.f.note}`).join('; ')}>
        <div className="gl-hug-stk-scale" aria-hidden="true">
          {sc.ticks.map((t) => <span key={t} style={{ top: `${y(t)}%` }}>{Math.abs(t) < sc.step / 2 ? '0' : hugNum(t, sc.nd)}</span>)}
          <i style={{ backgroundSize: `100% ${200 / (sc.ticks.length - 1)}%` }} />
        </div>
        <div className="gl-hug-stk-lines" aria-hidden="true">
          {sc.ticks.map((t) => <i key={t} className={Math.abs(t) < sc.step / 2 ? 'is-zero' : undefined} style={{ top: `${y(t)}%` }} />)}
        </div>
        {cols.map((c, i) => {
          const top = y(c.q.v + c.q.err), h = y(c.q.v - c.q.err) - top;
          return (
            <div key={c.k} className="gl-hug-stk-col" style={{ gridColumn: i + 2 }} aria-hidden="true">
              {c.q.rangeOnly ? <i className="gl-hug-stk-bar is-range" style={{ top: `${top}%`, height: `${h}%` }} /> : (
                <>
                  <i className={`gl-hug-stk-bar ${c.k === 'dhdt' ? 'is-surf' : 'is-water'} ${c.q.v < 0 ? 'is-loss' : 'is-gain'}`} style={{ top: `${y(Math.max(c.q.v, 0))}%`, height: `${Math.abs(y(c.q.v) - y(0))}%` }} />
                  <i className="gl-hug-stk-err" style={{ top: `${top}%`, height: `${h}%` }} />
                </>
              )}
              {c.ref != null && <i className="gl-hug-stk-ref" style={{ top: `${y(c.ref)}%` }} />}
            </div>
          );
        })}
      </div>
      <div className="gl-hug-stk-caps">
        {cols.map((c, i) => (
          <div key={c.k} className="gl-hug-tile is-plain" style={{ gridColumn: i + 2 }} data-origin="satellite" data-hug={c.k}>
            <span className="gl-hug-tile-l">{HUG_TEXT[c.k].title}</span>
            <b className={`gl-num${c.f.range ? ' is-range' : c.q.v < 0 ? ' is-loss' : ''}`} data-origin="satellite">{c.f.value}<small>{c.f.unit}</small></b>
            <span className="gl-hug-tile-n">pro Jahr · {c.f.note}</span>
            <span className="gl-hug-tile-h">{HUG_TEXT[c.k].hint}</span>
          </div>
        ))}
      </div>
      <div className="gl-legend-lines gl-hug-legend" aria-hidden="true">
        {cols[0].q.rangeOnly ? null : <span><i className="gl-hug-k-surf" />Oberfläche</span>}
        {cols[1].q.rangeOnly ? null : <span><i className="gl-hug-k-water" />als Wasserschicht</span>}
        {cols.some((c) => !c.q.rangeOnly) ? <span><i className="gl-hug-k-err" />Unsicherheit (1 σ)</span> : null}
        {anyRange ? <span><i className="gl-hug-k-range" />nur die Spanne</span> : null}
        {anyRef ? <span><i className="gl-hug-k-ref" />Mittel {hug.total.label}</span> : null}
      </div>
    </div>
  );
}
/** Pictograms of the two totals over the whole glacier: a block for the volume, a weight for the mass. */
const HugIcon = ({ k }: { k: 'dvoldt' | 'dmdt' }) => (
  <svg className="gl-hug-ico" viewBox="0 0 28 28" aria-hidden="true">
    {k === 'dvoldt' ? <><path d="M14 3 24 8.5v11L14 25 4 19.5v-11Z" /><path d="M4 8.5 14 14l10-5.5M14 14v11" /></> : <><path d="M9.5 11h9L23 24H5Z" /><circle cx="14" cy="8" r="3" /></>}
  </svg>
);
/**
 * Phase GH, second product — height, volume and mass 2000–2019 (Hugonnet et al. 2021) in one card: the surface against its level of
 * 2000 year by year, the period ladder under the time axis, and for the chosen period the four yearly means with their uncertainty.
 * The five-year columns of the elevation block stay below. Rendered only for a glacier that has both blocks.
 */
export function HugonnetCard({ hug, elev }: { hug: HugonnetView; elev: ElevView }) {
  const [sel, setSel] = useState(0);
  const p = hug.periods[sel] ?? hug.total;
  const cum = hug.last ? hugCumFigure(hug.last) : null;
  const sentence = hugSentence(hug);
  const anyRange = elev.periods.some((r) => r?.rangeOnly);
  const span: [number, number] = [p.from - hug.year0, p.to + 1 - hug.year0];
  const ladder = (
    <div className="gl-hug-ladder" role="group" aria-label="Zeitraum wählen">
      {HUG_LADDER.flatMap((row) => row.i.map((i) => {
        const q = hug.periods[i];
        return (
          <button key={i} type="button" className={`is-w${row.w}`} aria-pressed={sel === i && q != null} disabled={!q} onClick={() => setSel(i)}
            aria-label={q ? `Zeitraum ${q.label}` : 'Zeitraum ohne Wert'} title={q ? undefined : 'Für diesen Zeitraum nennt die Tabelle keinen Wert'}>
            {q ? (row.w === 1 ? `${q.from}–${String(q.to).slice(2)}` : q.label) : '—'}
          </button>
        );
      }))}
    </div>
  );
  return (
    <section className="gl-card gl-hug" aria-label="Höhe, Volumen und Masse" data-hug-rgi={hug.rgi}>
      <div className="gl-card-head"><b>HÖHE, VOLUMEN UND MASSE · {hug.total.label}</b><OriginChip origin="satellite" /></div>
      {cum && hug.last ? (
        <>
          <div className="gl-big"><span className={`gl-num${cum.range ? ' is-range' : hug.last.v < 0 ? '' : ' is-gain'}`} data-origin="satellite">{cum.value}</span><span>{cum.note} · gegenüber dem Stand von {hug.year0}</span></div>
          {sentence && <p>{sentence}</p>}
        </>
      ) : <p>Für diesen Gletscher nennt der Datensatz keine aufsummierte Jahresreihe; die Mittel je Zeitraum stehen unten.</p>}
      <div className="gl-hug-body">
        <div className="gl-hug-figcol">
          <CumulChart view={hug} span={span}>{ladder}</CumulChart>
          {hug.series && (
            <div className="gl-legend-lines gl-hug-legend" aria-hidden="true">
              <span><i className="gl-hug-k-line" />Oberfläche gegenüber {hug.year0}, in m</span>
              <span><i className="gl-hug-k-band" />Unsicherheit (1 σ)</span>
              <span><i className="gl-hug-k-sel" />gewählter Zeitraum</span>
            </div>
          )}
        </div>
        <div className="gl-hug-side">
          <h3 className="gl-h3" aria-live="polite">Mittel pro Jahr · {p.label}</h3>
          <HugStake hug={hug} p={p} />
        </div>
      </div>
      <div className="gl-hug-whole">
        <span className="gl-hug-grp">Über den ganzen Gletscher ({fmtKm2(hug.km2)}), Mittel pro Jahr {p.label}</span>
        <div className="gl-hug-tiles">
          {(['dvoldt', 'dmdt'] as const).map((k) => {
            const f = hugFigure(p.q[k]);
            return (
              <div key={k} className="gl-hug-tile has-ico" data-origin="satellite" data-hug={k}>
                <HugIcon k={k} />
                <div className="gl-hug-tile-b">
                  <span className="gl-hug-tile-l">{HUG_TEXT[k].title}</span>
                  <b className={`gl-num${f.range ? ' is-range' : p.q[k].v < 0 ? ' is-loss' : ''}`} data-origin="satellite">{f.value}<small>{f.unit}</small></b>
                  <span className="gl-hug-tile-n">pro Jahr · {f.note}</span>
                  <span className="gl-hug-tile-h">{HUG_TEXT[k].hint}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <h3 className="gl-h3">Höhenänderung je fünf Jahre</h3>
      <ElevBars view={elev} />
      <div className="gl-legend-lines gl-elev-legend" aria-hidden="true">
        <span><i className="gl-elev-col" />Mittel je fünf Jahre</span>
        <span><i className="gl-elev-whisker" />Unsicherheit (1 σ)</span>
        {anyRange ? <span><i className="gl-elev-range" />nur Spanne</span> : null}
        {elev.total.rangeOnly ? null : <span><i className="gl-elev-mean" />Mittel {elev.total.label}</span>}
      </div>
      <p className="gl-fine">Aus Satellitenbildern abgeleitet (ASTER-Stereobilder; Hugonnet et al. 2021), gemittelt oder summiert über den Umriss des Inventars RGI 6.0 von etwa 2003 ({fmtKm2(hug.km2)}). Volumen und Masse sind die Zahlen des Datensatzes mit seiner Dichteannahme von 850 kg/m³; hier ist nichts umgerechnet. Die Reihe endet {hug.total.to}. Sie ist nicht der Schmelzindex und keine Vorhersage. Unsicherheit 1 σ; wo sie so groß ist wie der Wert, steht nur die Spanne.</p>
    </section>
  );
}

export function TabLangzeit({ g, area, length, lengthTotal, proj, elev = null, hug = null, compareYear, compareOn, onCompare, noCompare, official, status, onCsv, hasSeries }: {
  /** Phase GH: elevation change 2000–2019; `null` = no block for this glacier (nothing is shown in its place). */
  elev?: ElevView | null;
  /** Phase GH, second product: mass balance, volume, mass and the yearly series; `null` = the elevation card as before. */
  hug?: HugonnetView | null;
  g: GlacierCatalogEntry; area: { from: [number, number]; to: [number, number]; pct: number } | null; length: { points: { year: number; cum: number }[]; total: number; from: number; to: number; gaps: number } | null;
  lengthTotal?: number; proj: ProjectionView | null; compareYear: number | null; compareOn: boolean; onCompare: (on: boolean) => void; noCompare?: boolean;
  official: readonly GlacierOfficialItem[]; status: GlacierCatalogEntry['status'] | null; onCsv: () => void; hasSeries: boolean;
}) {
  void lengthTotal;
  const statusItem = status ? official.find((i) => i.kind === 'status' && i.scope === g.country) ?? null : null;
  return (
    <>
      {noCompare ? null : compareYear != null ? (
        <section className="gl-card" aria-label="Vergleich">
          <div className="gl-card-head"><b>VORHER – NACHHER</b><OriginChip origin="official" /></div>
          <p>Umriss {compareYear} (gestrichelt) gegen den heutigen Umriss ({g.area.source}, {fmtRefYear(g.area.refYear)}). Regler in der Karte ziehen.</p>
          <button type="button" className="gl-btn" aria-pressed={compareOn} onClick={() => onCompare(!compareOn)}>{compareOn ? 'Vergleich beenden' : 'Vergleichsregler einblenden'}</button>
        </section>
      ) : <section className="gl-card"><div className="gl-card-head"><b>VORHER – NACHHER</b><OriginChip origin="official" /></div><p>Für diesen Gletscher liegt kein früherer Umriss vor.</p></section>}
      <div className="gl-stats">
        <Stat label={area ? `Fläche ${area.from[0]} → ${area.to[0]}` : 'Fläche'} origin="official" note={area ? 'Inventare' : `Bezugsjahr ${fmtRefYear(g.area.refYear)}`}>{area ? `${fmtSigned(area.pct, 0)} %` : fmtKm2(g.area.km2)}</Stat>
        <Stat label={length ? `Länge ${length.from} → ${length.to}` : 'Länge'} origin="measured" note={length?.gaps ? `${length.gaps} Jahre ohne Messung` : undefined}>{length ? `${fmt0(length.total)} m` : '—'}</Stat>
      </div>
      {length && <><h3 className="gl-h3">Längenänderung der Zunge, kumuliert</h3><LengthChart points={length.points} /></>}
      {!length && <p className="gl-fine">Für diesen Gletscher gibt es keine Längenmessreihe.</p>}
      {elev && (hug ? <HugonnetCard hug={hug} elev={elev} /> : <ElevCard elev={elev} />)}
      {statusItem && (
        <section className="gl-card" aria-label="Amtlicher Status">
          <div className="gl-card-head"><b>AMTLICHER STATUS</b><OriginChip origin="official" /></div>
          <blockquote className="gl-quote">{statusItem.quote}</blockquote>
          <p className="gl-src">{statusItem.source.split(',')[0]} · {dateDeLong(statusItem.date)} · <a href={statusItem.url} target="_blank" rel="noopener noreferrer">Quelle</a></p>
          {statusItem.criterion && <p className="gl-fine">Kriterium: {statusItem.criterion}</p>}
        </section>
      )}
      <div className="gl-dl" role="group" aria-label="Herunterladen">
        <button type="button" className="gl-btn" disabled={!hasSeries} onClick={onCsv} title={hasSeries ? 'Längen-, Bilanz- und Flächenreihen als CSV mit Quelle je Reihe' : 'Für diesen Gletscher gibt es keine Reihe'}>Reihen als CSV</button>
        <button type="button" className="gl-btn" disabled={!length} onClick={() => { const svg = document.querySelector<SVGSVGElement>('#gl-tabpanel .gl-chart-s svg'); if (svg) void exportSvgAsPng(svg, { filename: `${g.id}-laenge.png`, title: `${g.name ?? g.id}: Längenänderung der Zunge, kumuliert`, source: 'Quelle: Messnetz (gemessen) · buscosun.com/gletscher' }).catch(() => { /* download refused */ }); }}>Grafik als Bild</button>
      </div>
      <h3 className="gl-h3">Wie entwickelt sich der Gletscher?</h3>
      {proj ? (
        <>
          <ProjectionChart view={proj} />
          <div className="gl-legend-lines" aria-hidden="true">{proj.scenarios.map((s) => <span key={s.key}><i style={{ background: ({ ssp126: '#1E87A8', ssp245: '#B8862F', ssp370: '#B5602C', ssp585: '#7E3C17' } as Record<string, string>)[s.key] ?? '#999' }} />{s.label}</span>)}</div>
          <p><OriginChip origin="model" /> {projectionSentence(proj)}</p>
          <p className="gl-fine">GloGEM, CMIP6, Median und Spanne über 12 Klimamodelle; Bezug Volumen 2020 = 100 %. Eine Projektion ist eine Spanne, nie ein einzelnes Jahr und keine Vorhersage des Zeitpunkts.</p>
        </>
      ) : <p className="gl-fine">Für diesen Gletscher liegt keine Projektion vor (GloGEM modelliert Gletscher des Inventars RGI 6; die Zuordnung braucht eine Flächenübereinstimmung).</p>}
    </>
  );
}

// --- Tour ---------------------------------------------------------------------------------------------------------------------------------
export function TabTour({ g, melt, season, nowMs, bandZ }: { g: GlacierCatalogEntry; melt: MeltView | null; season: SeasonSummary | null; nowMs: number; bandZ: [number, number, number] }) {
  const lines = tourLines(g, melt, season, nowMs);
  const bad = tourProblems(lines);
  return (
    <>
      <section className="gl-card gl-tour-note" aria-label="Vorbehalt"><p><strong>Kein Urteil über Begehbarkeit.</strong> {TOUR_DISCLAIMER.replace('Kein Urteil über Begehbarkeit. ', '')}</p></section>
      {melt && melt.fresh && melt.zf.some((v) => v != null) && (
        <>
          <h3 className="gl-h3">Nullgradgrenze, Tagesmaximum der nächsten 14 Tage</h3>
          <FreezeChart zf={melt.zf} zRange={bandZ} labels={dayLabels(melt.runAt)} />
        </>
      )}
      <ul className="gl-tour">
        {lines.map((l) => (
          <li key={l.key} data-origin={l.origin}>
            <div><b>{l.title}</b><OriginChip origin={l.origin} /></div>
            <span>{l.text}</span>
            <small>{l.source}</small>
          </li>
        ))}
      </ul>
      <ul className="gl-links">
        <li><a href="https://www.alpenvereinaktiv.com/de/" target="_blank" rel="noopener noreferrer">Alpenvereinaktiv: Touren und Sperrungen ↗</a></li>
        <li><a href="https://lawinen.report/" target="_blank" rel="noopener noreferrer">Lawinenreport Euregio (Winter) ↗</a></li>
      </ul>
      {bad.length > 0 && <p className="gl-problem" role="alert" data-tour-problems={bad.length}>Textprüfung: {bad.join('; ')}</p>}
    </>
  );
}

// --- Quellen ------------------------------------------------------------------------------------------------------------------------------
export function TabQuellen({ rows, sources: listed, elev = false, more }: { rows: readonly SourceRow[]; sources: readonly GlacierSourceRow[] | null; /** Phase GH: the sheet shows the elevation change of Hugonnet et al. 2021. */ elev?: boolean; /** Phase GO: the station networks of "Gemessen in der Nähe" (shown when the store names station measurements). */ more?: readonly GlacierSourceRow[] }) {
  const sources = listed && more ? [...listed, ...more] : listed;
  return (
    <>
      <h3 className="gl-h3">Jede Zahl in diesem Steckbrief, mit Herkunft und Stand</h3>
      <table className="gl-srctab">
        <thead><tr><th scope="col">Zahl</th><th scope="col">Herkunft</th><th scope="col">Stand</th><th scope="col">Quelle</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.what}><td>{r.what}</td><td><OriginChip origin={r.origin} /></td><td>{r.stand}</td><td>{r.source}</td></tr>)}</tbody>
      </table>
      <h3 className="gl-h3">Lizenzen</h3>
      {sources ? (
        <ul className="gl-lic">{sources.map((s) => {
          const t = glacierSourceTerms(s);
          return (
            <li key={s.id}>
              <b>{s.label}</b>
              <span>{t.licenceUrl ? <a href={t.licenceUrl} target="_blank" rel="license noopener noreferrer">{s.licence}</a> : s.licence} · Bezugsjahr {fmtRefYear(s.refYear)} · {s.used}</span>
              {s.attribution && <span>Quellenangabe: {s.attribution}</span>}
              {t.changes && <span>{t.changes}</span>}
              <a href={s.url} target="_blank" rel="noopener noreferrer">Quelle ↗</a>
            </li>
          );
        })}</ul>
      ) : <p className="gl-fine">Die Quellenliste ist gerade nicht ladbar.</p>}
      <ul className="gl-fine gl-unused">{NOT_USED_SOURCES.map((n) => <li key={n.text}><strong>{n.kind === 'linked' ? 'Nur verlinkt:' : 'Nicht genutzt:'}</strong> {n.text.split(':')[0]}</li>)}</ul>
      <p className="gl-fine">Herkunft: <strong>gemessen</strong> = Messnetz oder Behörde, <strong>Satellit</strong> = aus Sentinel-2 gerechnet{elev ? '; die Höhenänderung 2000–2019 stammt aus ASTER-Stereobildern, ausgewertet von Hugonnet et al. (2021), Werte unverändert' : ''},<strong>Modell</strong> = gerechnet, <strong>amtlich</strong> = Inventar oder Meldung einer Behörde. Kein Wert ohne Herkunft.</p>
    </>
  );
}
export { sourceRows };
export type { GlacierSeries };
