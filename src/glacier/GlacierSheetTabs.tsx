/**
 * GL-4 — the five tabs of the sheet: Heute · Saison · Langzeit · Tour · Quellen. Every number carries its origin chip, every area its reference year;
 * what is not there (no melt run, no clear scene, class C) is said in words and never replaced by a placeholder value.
 * The melt shows as an INDEX without a unit while the calibration gate (Gate C) is red — the unit appears only when the run document says so.
 */
import type { ReactNode } from 'react';
import { OriginChip, LockNote } from './GlacierParts';
import { fmt0, fmt2, fmtKm2, fmtRefYear, fmtSigned } from './glacierView';
import {
  dateDe, dateDeLong, STATE_TEXT, indexWord, projectionSentence, tourLines, tourProblems, TOUR_DISCLAIMER, NOT_USED_SOURCES, againstBand, climaBand, albedoAnomaly, sourceRows, seasonSummary,
  type MeltView, type SeasonSummary, type ProjectionView, type MassRow, type SourceRow,
} from './glacierSheetModel';
import { SeasonChart, LengthChart, ProjectionChart, FreezeChart, MeltBars } from './GlacierCharts';
import type { GlacierCatalogEntry, GlacierOfficialItem, GlacierSeries } from './glacierContract';
import type { SheetData } from './glacierSheetData';
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
export function TabHeute({ g, melt, meltWhy, season, nowMs, neighbourName }: { g: GlacierCatalogEntry; melt: MeltView | null; meltWhy: string | null; season: SeasonSummary | null; nowMs: number; neighbourName: string | null }) {
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
export function TabLangzeit({ g, area, length, lengthTotal, proj, compareYear, compareOn, onCompare, official, status, onCsv, hasSeries }: {
  g: GlacierCatalogEntry; area: { from: [number, number]; to: [number, number]; pct: number } | null; length: { points: { year: number; cum: number }[]; total: number; from: number; to: number; gaps: number } | null;
  lengthTotal?: number; proj: ProjectionView | null; compareYear: number | null; compareOn: boolean; onCompare: (on: boolean) => void;
  official: readonly GlacierOfficialItem[]; status: GlacierCatalogEntry['status'] | null; onCsv: () => void; hasSeries: boolean;
}) {
  void lengthTotal;
  const statusItem = status ? official.find((i) => i.kind === 'status' && i.scope === g.country) ?? null : null;
  return (
    <>
      {compareYear != null ? (
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
      <h3 className="gl-h3">Wann ist er weg?</h3>
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
export function TabQuellen({ rows, sources }: { rows: readonly SourceRow[]; sources: ReadonlyArray<{ id: string; label: string; licence: string; attribution: string; url: string; refYear: string; used: string }> | null }) {
  return (
    <>
      <h3 className="gl-h3">Jede Zahl in diesem Steckbrief, mit Herkunft und Stand</h3>
      <table className="gl-srctab">
        <thead><tr><th scope="col">Zahl</th><th scope="col">Herkunft</th><th scope="col">Stand</th><th scope="col">Quelle</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.what}><td>{r.what}</td><td><OriginChip origin={r.origin} /></td><td>{r.stand}</td><td>{r.source}</td></tr>)}</tbody>
      </table>
      <h3 className="gl-h3">Lizenzen</h3>
      {sources ? (
        <ul className="gl-lic">{sources.map((s) => <li key={s.id}><b>{s.label}</b><span>{s.licence} · Bezugsjahr {fmtRefYear(s.refYear)} · {s.used}</span><a href={s.url} target="_blank" rel="noopener noreferrer">Quelle ↗</a></li>)}</ul>
      ) : <p className="gl-fine">Die Quellenliste ist gerade nicht ladbar.</p>}
      <ul className="gl-fine gl-unused">{NOT_USED_SOURCES.map((n) => <li key={n.text}><strong>{n.kind === 'linked' ? 'Nur verlinkt:' : 'Nicht genutzt:'}</strong> {n.text.split(':')[0]}</li>)}</ul>
      <p className="gl-fine">Herkunft: <strong>gemessen</strong> = Messnetz oder Behörde, <strong>Satellit</strong> = aus Sentinel-2 gerechnet, <strong>Modell</strong> = gerechnet, <strong>amtlich</strong> = Inventar oder Meldung einer Behörde. Kein Wert ohne Herkunft.</p>
    </>
  );
}
export { sourceRows };
export type { GlacierSeries };
