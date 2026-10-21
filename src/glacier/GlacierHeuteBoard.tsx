/**
 * GL — level "Heute" of the dossier as a dashboard: melt index as a gauge, the three model figures as tiles with a small picture each,
 * the 14-day bars and the satellite share side by side, the tour block as a grid of tiles. Same numbers, origins and wording as
 * TabHeute/TabTour of the sheet (which stays the list form); every value keeps its origin chip, every "no data" stays in words.
 */
import type { ReactNode } from 'react';
import { OriginChip, LockNote } from './GlacierParts';
import { fmt0, fmt2 } from './glacierView';
import { dateDeLong, STATE_TEXT, indexWord, tourLines, tourProblems, TOUR_DISCLAIMER, type MeltView, type SeasonSummary } from './glacierSheetModel';
import { MeltBars, FreezeChart } from './GlacierCharts';
import { dayLabels } from './GlacierSheetTabs';
import type { GlacierCatalogEntry } from './glacierContract';

const NIGHTS = 13;

/** Half-circle gauge 0–100: p10–p90 as a light band, the median as the filled arc. */
function Gauge({ lo, mid, hi }: { lo: number; mid: number; hi: number }) {
  const R = 78, CX = 100, CY = 96;
  const pt = (v: number) => { const a = Math.PI * (1 - Math.max(0, Math.min(100, v)) / 100); return [CX + R * Math.cos(a), CY - R * Math.sin(a)] as const; };
  const arc = (a: number, b: number) => { const [x0, y0] = pt(a), [x1, y1] = pt(b); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  return (
    <svg className="gl-hb-gauge" viewBox="0 0 200 108" aria-hidden="true">
      <path d={arc(0, 100)} stroke="#EFE8D6" strokeWidth="14" fill="none" strokeLinecap="round" />
      {hi > lo && <path d={arc(lo, hi)} stroke="#E7D3B4" strokeWidth="14" fill="none" />}
      {mid > 0 && <path d={arc(0, mid)} stroke="#B8862F" strokeWidth="14" fill="none" strokeLinecap="round" />}
      {[0, 50, 100].map((v) => { const [x, y] = pt(v); return <circle key={v} cx={x} cy={y} r="1.6" fill="#6F6553" />; })}
    </svg>
  );
}

function Ring({ pct }: { pct: number }) {
  const R = 30, C = 2 * Math.PI * R;
  return (
    <svg className="gl-hb-ring" viewBox="0 0 76 76" aria-hidden="true">
      <circle cx="38" cy="38" r={R} stroke="#EEEBF8" strokeWidth="9" fill="none" />
      {pct > 0 && <circle cx="38" cy="38" r={R} stroke="#6B5BB8" strokeWidth="9" fill="none" strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 38 38)" strokeLinecap="round" />}
    </svg>
  );
}

function Tile({ label, origin, value, note, children }: { label: string; origin: 'model' | 'satellite'; value: ReactNode; note: string; children?: ReactNode }) {
  return (
    <div className="gl-hb-tile" data-origin={origin}>
      <div className="gl-hb-tile-top"><span className="gl-hb-l">{label}</span><OriginChip origin={origin} /></div>
      <b className="gl-num" data-origin={origin}>{value}</b>
      {children}
      <small>{note}</small>
    </div>
  );
}

function SatPanel({ g, season, nowMs }: { g: GlacierCatalogEntry; season: SeasonSummary | null; nowMs: number }) {
  const head = <div className="gl-hb-cardhead"><span className="gl-hb-l">Satellit · Sentinel-2</span><OriginChip origin="satellite" /></div>;
  if (g.country === 'DE' || g.klass === 'C') {
    return <section className="gl-hb-card" aria-label="Satellit">{head}<p className="gl-nodata">{g.country === 'DE' ? 'Für die vier deutschen Gletscher gibt es keine Satellitenzahl; es gelten die Zahlen der BAdW.' : 'Keine Zahl für Gletscher unter 0,1 km² (Klasse C): zu wenige Pixel für eine verlässliche Aussage.'}</p></section>;
  }
  const s = season?.last;
  const age = s ? Math.floor((nowMs - Date.parse(`${s.date}T12:00:00Z`)) / 86_400_000) : null;
  return (
    <section className="gl-hb-card" aria-label="Satellit">
      {head}
      {!s ? <p className="gl-nodata"><strong>Keine Daten.</strong> Noch keine klare Szene im Datenspeicher.</p>
        : age != null && age > 20 ? <p className="gl-nodata"><strong>Keine klare Szene seit {age} Tagen.</strong> Letzte: {dateDeLong(s.date)}.</p> : (
          <div className="gl-hb-sat">
            <div className="gl-hb-ringwrap">
              <Ring pct={Math.round((1 - s.snow) * 100)} />
              <b className="gl-num" data-origin="satellite">{Math.round((1 - s.snow) * 100)} %</b>
            </div>
            <div className="gl-hb-sattx">
              <span>schneefrei · {dateDeLong(s.date)}</span>
              <small>{g.klass === 'A' && s.state === 1 && s.sla != null ? `Schneegrenze ${fmt0(s.sla)} m${s.aar != null ? ` · AAR ${fmt2(s.aar)}` : ''} · ` : g.klass === 'B' ? 'Klasse B: Schneeanteil, keine Schneegrenze · ' : `${STATE_TEXT[s.state]} · `}klar {Math.round(s.clear * 100)} % der Fläche</small>
            </div>
          </div>
        )}
    </section>
  );
}

export default function GlacierHeuteBoard({ g, melt, meltWhy, season, nowMs, neighbourName, head }: {
  g: GlacierCatalogEntry; melt: MeltView | null; meltWhy: string | null; season: SeasonSummary | null; nowMs: number; neighbourName: string | null; head: ReactNode;
}) {
  const ok = melt && melt.fresh && melt.todayIdx ? melt : null;
  const t = ok?.todayIdx ?? null;
  const [zMin, , zMax] = g.z;
  const zf0 = ok?.zf[0] ?? null;
  const zPos = zf0 != null ? Math.max(0, Math.min(100, ((zf0 - zMin) / Math.max(1, zMax - zMin)) * 100)) : null;
  const lines = tourLines(g, melt, season, nowMs);
  const bad = tourProblems(lines);
  const hasFreeze = !!(melt && melt.fresh && melt.zf.some((v) => v != null));

  return (
    <div className="gl-hb">
      <section className="gl-hb-card gl-hb-hero" aria-label="Gletscher auf einen Blick">{head}</section>

      <section className="gl-hb-row gl-hb-row--melt" aria-label="Heute">
        <div className="gl-hb-card gl-hb-gaugecard">
          <div className="gl-hb-cardhead"><span className="gl-hb-l">Schmelzindex · 24 h ab Lauf{melt ? ` ${melt.runAt.slice(11, 13)} UTC` : ''}</span><OriginChip origin="model" /></div>
          {ok && t ? (
            <>
              <div className="gl-hb-gaugewrap">
                <Gauge lo={t[0]} mid={t[1]} hi={t[2]} />
                <div className="gl-hb-gaugeval"><span className="gl-num" data-origin="model" data-melt-index={t[1]}>{t[1]}</span><small>von 100 · {indexWord(t[1])}</small></div>
              </div>
              <div className="gl-hb-chips">
                <span>Spanne <b>{t[0]}–{t[2]}</b></span>
                <span>Mittel 7 Tage <b>{ok.ix7[1]}</b> ({ok.ix7[0]}–{ok.ix7[2]})</span>
              </div>
              <p className="gl-fine">Spanne = 10. bis 90. Perzentil der Szenarien. Der Index hat keine Einheit: 100 entspricht einem sehr heißen Sommertag im Gletschermittel (gesetzt). Millimeter Eis oder Wasser zeigt der Steckbrief erst, wenn die Eichung gegen die gemessenen Bilanzen besteht — sie besteht noch nicht.</p>
              {ok.unit ? null : <LockNote>Einheit gesperrt (Gate C nicht bestanden)</LockNote>}
            </>
          ) : <p className="gl-nodata"><strong>Keine Daten.</strong> {meltWhy ?? 'Der Schmelzlauf fehlt für diesen Gletscher.'}</p>}
        </div>
        {ok && (
          <div className="gl-hb-tiles">
            <Tile label="Nullgradgrenze, Tagesmaximum" origin="model" value={zf0 != null ? `${fmt0(zf0)} m` : '—'}
              note={zf0 == null ? 'kein Wert in diesem Lauf' : ok.zs === 'cells' ? `${ok.engine}, Druckflächen` : 'aus Temperatur und Standardgradient'}>
              <span className="gl-hb-band" aria-hidden="true" title={`Gletscher ${fmt0(zMin)}–${fmt0(zMax)} m`}>
                <i className="gl-hb-band-fill" style={{ width: `${zPos ?? 0}%` }} />
                <em>{fmt0(zMin)}</em><em>{fmt0(zMax)} m</em>
              </span>
            </Tile>
            <Tile label="Fläche ohne Schneedecke" origin="model" value={`${ok.ice} %`} note={ok.state.source === 'cold' ? 'Modellzustand neu begonnen' : 'Zustand fortgeführt'}>
              <span className="gl-hb-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, ok.ice))}%` }} /></span>
            </Tile>
            <Tile label="Nächte über 0 °C an der Zunge" origin="model" value={ok.nf} note={`von ${NIGHTS} berechneten`}>
              <span className="gl-hb-dots" aria-hidden="true">{Array.from({ length: NIGHTS }, (_, i) => <i key={i} className={i < ok.nf ? 'is-on' : ''} />)}</span>
            </Tile>
          </div>
        )}
      </section>

      <section className="gl-hb-row gl-hb-row--week" aria-label="Die nächsten 14 Tage">
        {ok && (
          <div className="gl-hb-card gl-hb-barscard">
            <div className="gl-hb-cardhead"><span className="gl-hb-l">Schmelzindex der nächsten 14 Tage</span><OriginChip origin="model" /></div>
            <MeltBars idx={ok.idx} labels={dayLabels(ok.runAt)} today={0} />
            <p className="gl-fine">Balken = Median, Strich = 10.–90. Perzentil von {40} Szenarien mit zeitlich korrelierter Temperaturabweichung. {neighbourName ? `Antrieb vom Nachbarn ${neighbourName} (kleiner Gletscher ohne eigenen Punkt), eigene Höhenbänder.` : 'Antrieb am eigenen Punkt in der Medianhöhe des Gletschers.'}</p>
          </div>
        )}
        <SatPanel g={g} season={season} nowMs={nowMs} />
      </section>

      <section className="gl-hb-tour" aria-label="Tour">
        <div className="gl-hb-tourhead">
          <span className="gl-ds-eyebrow">Tour</span>
          <p className="gl-hb-disclaimer" role="note"><strong>Kein Urteil über Begehbarkeit.</strong> {TOUR_DISCLAIMER.replace('Kein Urteil über Begehbarkeit. ', '')}</p>
        </div>
        {hasFreeze && (
          <div className="gl-hb-card">
            <div className="gl-hb-cardhead"><span className="gl-hb-l">Nullgradgrenze, Tagesmaximum der nächsten 14 Tage</span><OriginChip origin="model" /></div>
            <FreezeChart zf={melt!.zf} zRange={g.z} labels={dayLabels(melt!.runAt)} />
          </div>
        )}
        <ul className="gl-hb-tourgrid">
          {lines.map((l) => (
            <li key={l.key} className="gl-hb-tourtile" data-origin={l.origin}>
              <div className="gl-hb-tile-top"><b>{l.title}</b><OriginChip origin={l.origin} /></div>
              <span>{l.text}</span>
              <small>{l.source}</small>
            </li>
          ))}
        </ul>
        <div className="gl-hb-links">
          <a className="gl-btn" href="https://www.alpenvereinaktiv.com/de/" target="_blank" rel="noopener noreferrer">Alpenvereinaktiv: Touren und Sperrungen ↗</a>
          <a className="gl-btn" href="https://lawinen.report/" target="_blank" rel="noopener noreferrer">Lawinenreport Euregio (Winter) ↗</a>
        </div>
        {bad.length > 0 && <p className="gl-problem" role="alert" data-tour-problems={bad.length}>Textprüfung: {bad.join('; ')}</p>}
      </section>
    </div>
  );
}
