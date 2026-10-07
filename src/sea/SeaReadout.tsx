/**
 * SW-5/SW-6 — Readout of Seewetter (design: right column 400 px). Tabs Spot / Seegebiet / Quellen.
 * Every number names its origin: "Modell CWAM" (waves), "buscosun Fusion" (wind, gust), "gemessen" (DWD POI),
 * "amtlich" (Seewetterdienst Hamburg, verbatim with number and issue time). The official warning status stands ABOVE
 * the verdict whenever it is not the exact "no warning" sentence (Seewetter check 3). No text says "sicher".
 */
import type { ReactNode } from 'react';
import type { SeaSpot } from './seaContract';
import type { SeaTextDoc, WodlCoast, WodlSeaArea } from './seaText';
import { WODL_AREA_IDS } from './seaText';
import type { SeaRunDoc, SeaPoiObs, SeaSpotsDoc } from './seaClient';
import { fmtWind, unitLabel, SHORE_LABEL, type SeaUnit, type SeaVerdict, type SeaWindow } from './seaProfiles';
import { WindChart, SeaStateChart, type SeaChartHour } from './SeaCharts';
import { BFT_ROWS, CLASS_COLOR, CLASS_LABEL, compass16, dateTime, dayDate, f1, hm, hh, utcHm, dayShort } from './seaView';
import type { SeaTab } from './seaState';

export interface SeaReadoutHour {
  t: number; windMs: number | null; gustMs: number | null; windDir: number | null;
  hs: number | null; dir: number | null; tm: number | null; ws: number | null; wsDir: number | null; wsPer: number | null; wsPeak: number | null;
  sw: number | null; swDir: number | null; swPer: number | null; swPeak: number | null;
}
export interface SeaTexts { fq50: SeaTextDoc | null; fq51: SeaTextDoc | null; wodl: SeaTextDoc | null; fx40: SeaTextDoc | null; stale: Record<string, boolean>; loading: boolean }

interface Props {
  tab: SeaTab; onTab: (t: SeaTab) => void;
  spot: SeaSpot | null;
  hour: SeaReadoutHour | null;
  verdict: SeaVerdict | null;
  profileLabel: string;
  windows: { next: SeaWindow | null; longest: SeaWindow | null };
  chartHours: readonly SeaChartHour[];
  limitKn: number | null; limitLabel: string;
  unit: SeaUnit;
  run: SeaRunDoc | null; spotsDoc: SeaSpotsDoc | null; freshness: 'live' | 'stale' | 'dead';
  texts: SeaTexts;
  poi: SeaPoiObs | null | 'loading';
  nowMs: number;
  noData: string | null;
  warning: { coast: WodlCoast | null; area: WodlSeaArea | null; status: 'none' | 'unknown'; why: string };
}

const TABS: Array<[SeaTab, string]> = [['spot', 'Spot'], ['gebiet', 'Seegebiet'], ['quellen', 'Quellen']];
const runLabel = (r: SeaRunDoc | null) => (r ? `CWAM ${r.run.slice(8, 10)} UTC vom ${r.run.slice(6, 8)}.${r.run.slice(4, 6)}.` : '–');
const issued = (d: SeaTextDoc | null) => (d ? `${d.product} ${dayDate(Date.parse(d.issuedAt))} ${utcHm(Date.parse(d.issuedAt))} UTC` : '');

export function Compass({ normal, windFrom, waveFrom, label, shore }: { normal: number; windFrom: number | null; waveFrom: number | null; label: string; shore?: string | null }) {
  return (
    <figure className="sw-compass">
      <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={label}>
        <circle cx="56" cy="56" r="46" fill="#E3F0F1" stroke="#C9DCDE" />
        {/* land = the half-disc opposite the shore normal (sea side shows the water colour) */}
        <path d="M10 56 A46 46 0 0 1 102 56 Z" fill="#E7DCC3" transform={`rotate(${(normal + 180) % 360} 56 56)`} />
        <circle cx="56" cy="56" r="46" fill="none" stroke="#D9D0B8" />
        <text x="56" y="8" textAnchor="middle" fontSize="8" fontFamily="IBM Plex Mono, monospace" fill="#8B7355">N</text>
        {waveFrom != null && <g transform={`rotate(${waveFrom} 56 56)`}><path d="M56 16v62M49 70l7 9 7-9" fill="none" stroke="#0F6E7A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3" /></g>}
        {windFrom != null && <g transform={`rotate(${windFrom} 56 56)`}><path d="M56 12v66M48 69l8 10 8-10" fill="none" stroke="#2C2A26" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></g>}
      </svg>
      <figcaption>{shore && <strong>Wind {shore}<br /></strong>}Sand = Land · gestrichelt = Welle</figcaption>
    </figure>
  );
}

const KINDS: Record<string, string> = { strand: 'Badestrand', kite: 'Kite-Spot', hafen: 'Hafen', revier: 'Revier' };
const kindsText = (k: readonly string[]) => k.map((x) => KINDS[x] ?? x).join(', ');
/** Water temperature of the spot's sea from FXDL40 (range over its parts, verbatim numbers), or '–'. */
function waterText(t: SeaTexts, s: SeaSpot): string {
  const fx = t.fx40?.parts.kind === 'medium' ? t.fx40.parts.seas.find((x) => x.sea === s.region) : null;
  if (!fx || !fx.water.length) return '–';
  const lo = Math.min(...fx.water.map((w) => w.min)), hi = Math.max(...fx.water.map((w) => w.max));
  return `${lo}–${hi} °C ${s.region === 'nordsee' ? 'Nordsee' : 'Ostsee'}`;
}

function Card({ children, cls = '' }: { children: ReactNode; cls?: string }) { return <section className={`sw-card ${cls}`}>{children}</section>; }

export default function SeaReadout(p: Props) {
  const h = p.hour, s = p.spot, v = p.verdict;
  const windName = p.spotsDoc?.wind?.engine ?? 'buscosun Fusion';
  const officialBanner = s && p.warning.status === 'unknown' && (
    <Card cls="is-warn">
      <div className="sw-eyebrow is-warn">Amtliche Meldung · Seewetterdienst Hamburg · zuerst lesen</div>
      {p.warning.area && p.warning.area.status === 'unknown' && p.warning.area.text && (
        <p className="sw-official"><span className="sw-official-meta">Seegebiet {p.warning.area.name} (WODL45, englischer Teil):</span>{p.warning.area.text}</p>
      )}
      {p.warning.coast && p.warning.coast.status === 'unknown' && (p.warning.coast.text
        ? <p className="sw-official"><span className="sw-official-meta">Deutsche {s.wodlCoast === 'Nordseekueste' ? 'Nordseeküste' : 'Ostseeküste'}{p.warning.coast.nr ? ` · NR. ${p.warning.coast.nr}` : ''}:</span>{p.warning.coast.text}</p>
        : null)}
      <p className="sw-official-why">{p.warning.why}</p>
    </Card>
  );

  const spotTab = s && (
    <>
      {officialBanner}
      <Card>
        <div className="sw-eyebrow is-accent">Spot · {kindsText(s.kinds)} · Profil {p.profileLabel}</div>
        <h2 className="sw-spot-title">{s.name}</h2>
        <div className="sw-spot-meta">{[s.coast?.name, s.seaArea ? `Seegebiet ${s.seaArea.name}` : null, s.tidal ? 'Watt' : null].filter(Boolean).join(' · ')} · Ufer zeigt nach {compass16(s.normal)} ({s.normal}°{s.normalFrom === 'set' ? ', gesetzt' : ''})</div>
        <div className={`sw-chip${p.freshness !== 'live' ? ' is-stale' : ''}`}><i />Welle Modell {runLabel(p.run)} · Wind {windName}{p.freshness === 'stale' ? ' · veraltet' : ''}</div>
        {p.noData && <div className="sw-empty"><strong>Keine Daten.</strong> {p.noData}</div>}
        {!p.noData && h && (
          <>
            <div className="sw-hero">
              <div className="sw-hero-vals">
                <div className="sw-eyebrow">Wind {dayShort(h.t)} {hh(h.t)} Uhr · {windName}</div>
                <div className="sw-hero-big">{h.windMs == null ? '–' : `${fmtWind(h.windMs, p.unit)} ${unitLabel(p.unit)}`}</div>
                <div className="sw-hero-sub">{h.windMs == null ? 'kein Wind für diese Stunde berechnet' : `aus ${compass16(h.windDir)}${h.windDir != null ? ` (${Math.round(h.windDir)}°)` : ''} · Böen ${fmtWind(h.gustMs, p.unit)} ${unitLabel(p.unit)}`}</div>
                <div className="sw-eyebrow sw-gap">Seegang · Modell CWAM</div>
                <div className="sw-hero-mid">{h.hs == null ? '–' : `${f1(h.hs)} m`}</div>
                <div className="sw-hero-sub">{h.hs == null ? 'kein Wert an der Wasserzelle' : `aus ${compass16(h.dir)} · Periode ${h.tm == null ? '–' : `${f1(h.tm)} s`}`}</div>
              </div>
              <Compass normal={s.normal} windFrom={h.windDir} waveFrom={h.hs != null && h.hs >= 0.05 ? h.dir : null}
                label={`Wind aus ${compass16(h.windDir)}, Welle aus ${compass16(h.dir)}, Ufer zeigt nach ${compass16(s.normal)}`} shore={v?.shore ? SHORE_LABEL[v.shore] : null} />
            </div>
            {v && (
              <div className={`sw-verdict is-${v.cls}`}>
                <span className={`sw-dot${v.cls === 'keine' ? ' is-hatched' : ''}`} style={v.cls !== 'keine' ? { background: CLASS_COLOR[v.cls] } : undefined} />
                <span><strong>{CLASS_LABEL[v.cls]}</strong><em>{v.reasons.join(' · ')}{v.shore ? ` · Wind ${SHORE_LABEL[v.shore]}` : ''}</em></span>
              </div>
            )}
            <div className="sw-vals">
              <div><span>Windsee · Modell</span><strong>{h.ws == null ? '–' : `${f1(h.ws)} m · ${h.wsPer == null ? '–' : `${f1(h.wsPer)} s`}`}</strong></div>
              <div><span>Dünung · Modell</span><strong>{h.sw == null ? '–' : `${f1(h.sw)} m · ${h.swPer == null ? '–' : `${f1(h.swPer)} s`} aus ${compass16(h.swDir)}`}</strong></div>
              <div><span>Wellenrichtung · Modell</span><strong>{h.hs == null || h.hs < 0.05 ? '–' : `aus ${compass16(h.dir)} (${Math.round(h.dir ?? 0)}°)`}</strong></div>
              <div><span>Wasser · Mittelfrist (amtlich)</span><strong>{waterText(p.texts, s)}</strong></div>
            </div>
            {s.tidal && <p className="sw-note">Watt: das Modell rechnet mit Gezeit und Wassertiefe, der Wasserstand selbst wird hier nicht gezeigt (BSH-Vorhersage gesperrt). Bei Niedrigwasser kann die Stelle trockenfallen.</p>}
          </>
        )}
      </Card>
      {!p.noData && (
        <Card cls="is-cream">
          <div className="sw-eyebrow is-accent">Fenster für {p.profileLabel}</div>
          <div className="sw-win-head">{p.windows.next ? `${dayShort(p.windows.next.from)} ${hh(p.windows.next.from)}–${hh(p.windows.next.to)} Uhr` : 'Kein Fenster bis zum Ende des Laufs'}</div>
          <div className="sw-win-sub">
            {p.windows.next
              ? `${p.windows.next.hours} h ${p.windows.next.tight ? 'passt oder knapp' : 'passt'}${p.windows.longest && p.windows.longest !== p.windows.next ? ` · längstes: ${dayShort(p.windows.longest.from)} ${hh(p.windows.longest.from)}–${hh(p.windows.longest.to)} Uhr (${p.windows.longest.hours} h)` : ''} · Fenster = mindestens 2 Stunden passt oder knapp`
              : 'Mindestens zwei zusammenhängende Stunden „passt“ oder „knapp“ — in diesem Lauf nicht gefunden.'}
          </div>
        </Card>
      )}
      {!p.noData && p.chartHours.length > 1 && (
        <Card cls="is-cream">
          <div className="sw-card-head"><span className="sw-eyebrow">Verlauf bis {dayShort(p.chartHours[p.chartHours.length - 1].t)} {hh(p.chartHours[p.chartHours.length - 1].t)} Uhr</span><span className="sw-unit">Welle {runLabel(p.run)} · Wind {windName}</span></div>
          <WindChart hours={p.chartHours} selMs={h?.t ?? p.chartHours[0].t} limitKn={p.limitKn} limitLabel={p.limitLabel} />
          <SeaStateChart hours={p.chartHours} selMs={h?.t ?? p.chartHours[0].t} />
          <div className="sw-chart-legend">
            <span><i style={{ background: '#2C2A26' }} />Wind (kn)</span><span><i style={{ background: 'rgba(139,115,85,0.4)', height: 6 }} />Böen-Band</span>
            <span><i style={{ background: '#0F6E7A' }} />Seegang gesamt</span><span><i style={{ background: '#3E9284' }} />Windsee</span><span><i style={{ background: '#7A9466' }} />Dünung (m)</span>
          </div>
        </Card>
      )}
      <OfficialCard spot={s} texts={p.texts} warning={p.warning} onArea={() => p.onTab('gebiet')} nowMs={p.nowMs} />
      <Card cls="is-cream">
        <div className="sw-eyebrow is-measured">Gemessen an der Küste</div>
        {!s.station ? <div className="sw-note">Keine liefernde Messstation in der Nähe.</div>
          : p.poi === 'loading' ? <div className="sw-note">Messung lädt …</div>
            : !p.poi ? <div className="sw-note">{s.station.name} ({s.station.km} km): derzeit keine Messung lesbar.</div>
              : (
                <>
                  <div className="sw-meas">{fmtWind(p.poi.ffMs, p.unit)} {unitLabel(p.unit)} aus {compass16(p.poi.ddDeg)} · Böen {fmtWind(p.poi.fxMs, p.unit)} {unitLabel(p.unit)}</div>
                  <div className="sw-note">DWD-Station {s.station.name.charAt(0) + s.station.name.slice(1).toLowerCase()}, {s.station.km} km vom Spot · gemessen {hm(p.poi.t)} Uhr (10-min-Mittel, Böe der letzten Stunde) · Messung an Land, nicht auf dem Wasser</div>
                </>
              )}
      </Card>
      <p className="sw-disclaimer">Kein amtliches Warnprodukt. Die Profile vergleichen Modell und Rechnung mit deinen Grenzen und sind keine Sicherheitsbewertung — die Entscheidung bleibt bei dir. Verbindlich sind die Meldungen des Seewetterdienstes Hamburg. Daten: Deutscher Wetterdienst (GeoNutzV).</p>
    </>
  );

  return (
    <aside className="sw-readout" aria-label="Details">
      <div role="tablist" aria-label="Ansicht" className="sw-seg sw-tabs">
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={p.tab === k} className={p.tab === k ? 'is-active' : ''} onClick={() => p.onTab(k)}>{l}</button>)}
      </div>
      {p.tab === 'spot' && (s ? spotTab : <div className="sw-empty">Spot wählen — in der Liste, auf der Karte oder über die Suche.</div>)}
      {p.tab === 'gebiet' && <AreaTab spot={s} texts={p.texts} nowMs={p.nowMs} />}
      {p.tab === 'quellen' && <SourcesTab spot={s} run={p.run} spotsDoc={p.spotsDoc} texts={p.texts} freshness={p.freshness} />}
    </aside>
  );
}

function OfficialCard({ spot, texts, warning, onArea, nowMs }: { spot: SeaSpot; texts: SeaTexts; warning: Props['warning']; onArea: () => void; nowMs: number }) {
  const coastName = spot.wodlCoast === 'Nordseekueste' ? 'Nordseeküste' : 'Ostseeküste';
  const c = warning.coast;
  const sec = texts.fq51?.parts.kind === 'report' ? texts.fq51.parts.days[0]?.areas.find((a) => a.id === spot.coast?.id) : null;
  return (
    <Card cls="is-official">
      <div className="sw-card-head"><span className="sw-eyebrow is-accent-dark">Amtlich · Seewetterdienst Hamburg</span><span className="sw-unit">wörtlich</span></div>
      <div className="sw-official-meta">Warnstatus {coastName}{c?.nr ? ` · NR. ${c.nr}` : ''} · {texts.wodl ? `Stand ${issued(texts.wodl)}` : texts.loading ? 'lädt' : 'nicht lesbar'}{texts.stale.WODL45 ? ' · veraltet' : ''}</div>
      {c && c.status === 'none' && !texts.stale.WODL45
        ? <p className="sw-official is-strong">{c.text}</p>
        : <p className="sw-official is-strong is-unknown">{c?.text ? c.text : 'Warnstatus derzeit unbekannt — es gibt keine lesbare, aktuelle Meldung. Das heißt nicht „keine Warnung“.'}</p>}
      {c?.issuedText && <div className="sw-official-meta">{c.kind ? `${c.kind} · ` : ''}{c.issuedText}</div>}
      {sec ? (
        <>
          <div className="sw-official-meta sw-gap">Küstenbericht {sec.name} · {issued(texts.fq51)}{texts.stale.FQDL51 ? ' · veraltet' : ''}</div>
          <p className="sw-official">{sec.wind ? `Wind: ${sec.wind}` : ''}{sec.sightWeather ? `\nSicht/Wetter: ${sec.sightWeather}` : ''}{sec.other.length ? `\n${sec.other.join('\n')}` : ''}</p>
        </>
      ) : <div className="sw-official-meta sw-gap">Küstenbericht: {texts.loading ? 'lädt' : 'kein Abschnitt für diesen Spot lesbar'}</div>}
      {spot.seaArea && <button type="button" className="sw-link" onClick={onArea}>Seewetterbericht {spot.seaArea.name} lesen →</button>}
      {void nowMs}
    </Card>
  );
}

function AreaTab({ spot, texts, nowMs }: { spot: SeaSpot | null; texts: SeaTexts; nowMs: number }) {
  const d = texts.fq50;
  const id = spot?.seaArea?.id ?? null;
  const days = d?.parts.kind === 'report' ? d.parts.days : [];
  const fx = texts.fx40?.parts.kind === 'medium' ? texts.fx40.parts : null;
  const sea = fx?.seas.find((x) => x.sea === spot?.region) ?? null;
  return (
    <>
      <Card cls="is-official">
        <div className="sw-eyebrow is-accent-dark">Seewetterbericht · Seegebiet</div>
        <h2 className="sw-spot-title">{spot?.seaArea?.name ?? 'Seegebiet'}</h2>
        <div className="sw-official-meta">{d ? `${d.heading} · herausgegeben vom Seewetterdienst Hamburg, ${dateTime(Date.parse(d.issuedAt))} (${utcHm(Date.parse(d.issuedAt))} UTC) · Windstärke in Beaufort` : texts.loading ? 'lädt …' : 'Seewetterbericht derzeit nicht lesbar'}{texts.stale.FQDL50 ? ' · veraltet' : ''}</div>
        {!id && <p className="sw-note">Dieser Spot liegt in keinem Seegebiet des Berichts (z. B. Haff) — siehe Küstenbericht im Reiter Spot.</p>}
        {days.map((day) => {
          const a = day.areas.find((x) => x.id === id);
          return a ? (
            <div key={day.label}>
              <div className="sw-area-day">{day.label}:</div>
              <p className="sw-official">{[a.wind && `Wind: ${a.wind}`, a.sightWeather && `Sicht/Wetter: ${a.sightWeather}`, a.sea && `Seegang: ${a.sea}`, ...a.other].filter(Boolean).join('\n')}</p>
            </div>
          ) : null;
        })}
        {d && <details className="sw-details"><summary>Ganzen Bericht lesen (alle Gebiete, Wetterlage)</summary><pre className="sw-pre">{d.text}</pre></details>}
      </Card>
      <Card cls="is-cream">
        <div className="sw-eyebrow">Mittelfrist · {texts.fx40 ? `FXDL40 ${dateTime(Date.parse(texts.fx40.issuedAt))}` : texts.loading ? 'lädt' : 'nicht lesbar'}{texts.stale.FXDL40 ? ' · veraltet' : ''}</div>
        {sea ? (
          <>
            <p className="sw-official">{sea.days.map((x) => `${x.label}: ${x.text}`).join('\n')}</p>
            {sea.water.length > 0 && <><div className="sw-official-meta sw-gap">Temperaturen Wasser</div><p className="sw-official">{sea.water.map((w) => `${w.part} ${w.min} bis ${w.max} Grad`).join('\n')}</p></>}
          </>
        ) : <p className="sw-note">{texts.fx40 ? 'Kein Abschnitt für dieses Meer gefunden — ganzer Text unten.' : ''}</p>}
        {texts.fx40 && <details className="sw-details"><summary>Ganzen Mittelfrist-Bericht lesen</summary><pre className="sw-pre">{texts.fx40.text}</pre></details>}
      </Card>
      {texts.wodl && (
        <Card cls="is-official">
          <div className="sw-eyebrow is-accent-dark">Starkwind-, Sturm- und Orkanwarnungen · {issued(texts.wodl)}</div>
          <pre className="sw-pre">{texts.wodl.text}</pre>
        </Card>
      )}
      <Card cls="is-cream">
        <div className="sw-eyebrow">Lesehilfe Beaufort</div>
        <table className="sw-bft">
          <thead><tr><th>Bft</th><th>Knoten</th><th>Bezeichnung</th></tr></thead>
          <tbody>{BFT_ROWS.map(([b, k, n]) => <tr key={b}><td>{b}</td><td>{k}</td><td>{n}</td></tr>)}</tbody>
        </table>
        <p className="sw-note">„Seegang“ im Bericht meint die signifikante Wellenhöhe; einzelne Wellen können fast doppelt so hoch sein.</p>
      </Card>
      {void nowMs}
    </>
  );
}

function SourcesTab({ spot, run, spotsDoc, texts, freshness }: { spot: SeaSpot | null; run: SeaRunDoc | null; spotsDoc: SeaSpotsDoc | null; texts: SeaTexts; freshness: string }) {
  const w = spotsDoc?.wind;
  const b = run?.balance;
  const rows: Array<[string, string, string, string]> = [
    [run ? (freshness === 'live' ? 'aktuell' : 'veraltet') : 'fehlt', 'Seegang · DWD CWAM (Modell, 900 m)', run ? `Lauf ${runLabel(run)}, 0–78 h, Windsee und Dünung getrennt; veröffentlicht ${dateTime(Date.parse(run.builtAt))}` : 'kein Lauf lesbar', run ? 'ok' : 'off'],
    [w?.engine ? 'aktuell' : 'fehlt', `Wind und Böen · ${w?.engine ?? 'buscosun Fusion'}`, w?.computedAt ? `gerechnet ${dateTime(Date.parse(w.computedAt))} an der Wasserzelle des Spots (Höhe 0 m), Würfel t1 ${w.runs?.t1 ?? '–'} · t2 ${w.runs?.t2 ?? '–'}; der Antriebswind des Wellenmodells wird nie gezeigt` : 'keine Windreihe in diesem Lauf', w?.engine ? 'ok' : 'off'],
    [texts.fq50 ? 'amtlich' : 'fehlt', 'Seewetterbericht Nord- und Ostsee (FQDL50)', texts.fq50 ? `wörtlich, ${issued(texts.fq50)}` : 'nicht lesbar', texts.fq50 ? 'ok' : 'off'],
    [texts.fq51 ? 'amtlich' : 'fehlt', 'Küstenbericht (FQDL51)', texts.fq51 ? `wörtlich, ${issued(texts.fq51)}` : 'nicht lesbar', texts.fq51 ? 'ok' : 'off'],
    [texts.wodl ? 'amtlich' : 'fehlt', 'Warnstatus Küste (WODL45)', texts.wodl ? `wörtlich, ${issued(texts.wodl)}; „keine Warnung“ nur aus dem exakten Satz` : 'nicht lesbar ⇒ Status unbekannt', texts.wodl ? 'ok' : 'off'],
    [texts.fx40 ? 'amtlich' : 'fehlt', 'Mittelfrist und Wassertemperatur (FXDL40)', texts.fx40 ? `wörtlich, ${issued(texts.fx40)}` : 'nicht lesbar', texts.fx40 ? 'ok' : 'off'],
    [spot?.station ? 'gemessen' : '–', `Messung · DWD-Station ${spot?.station?.name ?? '–'}`, spot?.station ? `${spot.station.km} km vom Spot, stündlich (POI)` : '', spot?.station ? 'ok' : 'off'],
    ['blockiert', 'Wasserstand-Vorhersage (BSH)', 'Lizenz ungeklärt — nur Hinweis, keine Daten', 'block'],
    ['Stufe 2', 'Urlaubsreviere (EWAM 5 km, Mittelmeer)', 'nach Gate C und D', 'later'],
    ['später', 'Binnenseen DACH', 'keine Welle im DWD-Bestand; Wind und Warnungen in einer eigenen Stufe', 'later'],
  ];
  return (
    <>
      <Card cls="is-cream">
        <div className="sw-eyebrow">Quellen dieses Spots</div>
        <div className="sw-sources">
          {rows.map(([st, name, what, k]) => (
            <div key={name} className={`sw-source is-${k}`}><span className="sw-source-status">{st}</span><span className="sw-source-body"><strong>{name}</strong><span>{what}</span></span></div>
          ))}
        </div>
      </Card>
      {run && b && (
        <Card cls="is-cream">
          <div className="sw-eyebrow">Prüfer-Bilanz · {runLabel(run)}</div>
          <ul className="sw-balance">
            <li>{run.dwd.files} von 1.027 Dateien im DWD-Inventar · Lauf veröffentlicht</li>
            <li>{(b.tm10?.placeholder ?? 0).toLocaleString('de-DE')} Perioden-Platzhalter (1,0 s bei Hs &lt; 0,05 m) → „keine Wellen“, nicht „1 Sekunde“</li>
            <li>{(b.ppww?.ppwwArtefact ?? 0).toLocaleString('de-DE')} Windsee-Spitzenperioden über 12 s bei unter 0,3 m Windsee → gefiltert</li>
            <li>{Object.values(b).reduce((a, x) => a + x.invalid, 0).toLocaleString('de-DE')} Werte außerhalb der Grenzen (über alle Felder und Schritte)</li>
            <li>Modellwind des Wellenmodells (Boden exakt 2,00 m/s) wird nicht geladen und nie als Wind gezeigt</li>
          </ul>
        </Card>
      )}
      {run?.check?.steps?.length ? (
        <Card cls="is-cream">
          <div className="sw-eyebrow">Modellabgleich, keine Wahrscheinlichkeit</div>
          <p className="sw-note">CWAM gegen EWAM (5 km) auf gemeinsamen Seepunkten, Median der Abweichung der Wellenhöhe: {run.check.steps.map((x) => `+${x.step} h ${f1(x.medianAbsM)} m`).join(' · ')}. In Küstennähe rechnet nur CWAM; der DWD veröffentlicht kein Wellen-Ensemble.</p>
        </Card>
      ) : null}
      <p className="sw-disclaimer">Lizenzen: Deutscher Wetterdienst (GeoNutzV); Seegebiete © GeoBasis-DE / BKG 2021 (Daten modifiziert), VMAP0; Kartengrundlage OpenFreeMap / OpenStreetMap-Mitwirkende.</p>
    </>
  );
}

export const findWarning = (doc: SeaTextDoc | null, spot: SeaSpot | null, stale: boolean): Props['warning'] => {
  if (!spot) return { coast: null, area: null, status: 'none', why: '' };
  if (!doc || doc.parts.kind !== 'warnings') return { coast: null, area: null, status: 'unknown', why: 'Der Warnstatus des Seewetterdienstes ist derzeit nicht lesbar — das heißt nicht „keine Warnung“.' };
  const coast = doc.parts.coasts.find((c) => c.coast === spot.wodlCoast) ?? null;
  const areaName = Object.entries(WODL_AREA_IDS).find(([, id]) => id === spot.seaArea?.id)?.[0];
  const area = areaName ? doc.parts.seaAreas.find((a) => a.name === areaName) ?? null : null;
  const unknown = stale || coast?.status !== 'none' || area?.status === 'unknown';
  return {
    coast, area, status: unknown ? 'unknown' : 'none',
    why: stale ? `Der Warnstatus ist älter als 4 Stunden (${issued(doc)}) und gilt deshalb als unbekannt.`
      : 'Für dein Gebiet liegt eine Meldung vor, die nicht der Satz „keine Warnung“ ist. Sie steht hier im Wortlaut — die Einordnung nach deinem Profil ersetzt sie nicht.',
  };
};
