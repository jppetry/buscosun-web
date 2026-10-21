/**
 * SW-5/SW-6 — Readout of Seewetter (design: right column 400 px). Tabs Spot / Seegebiet / Quellen.
 * Every number names its origin: "Modell CWAM" (waves), "buscosun Fusion" (wind, gust), "gemessen" (DWD POI),
 * "amtlich" (Seewetterdienst Hamburg, verbatim with number and issue time). The official warning status stands ABOVE
 * the verdict whenever it is not the exact "no warning" sentence (Seewetter check 3). No text says "sicher".
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { SeaSpot } from './seaContract';
import type { SeaTextDoc, WodlCoast, WodlSeaArea } from './seaText';
import { WODL_AREA_IDS } from './seaText';
import type { SeaRunDoc, SeaPoiObs, SeaSpotsDoc } from './seaClient';
import { fmtWind, unitLabel, SHORE_LABEL, type SeaUnit, type SeaVerdict, type SeaWindow } from './seaProfiles';
import { WindChart, SeaStateChart, WaterLevelChart, DRY_COLOUR, type SeaChartHour } from './SeaCharts';
import SeaMiniMap from './SeaMiniMap';
import SeaSatImagery from './SeaSatImagery';
import { satEnabled } from '../fire/detail/fireSatImagery';
import {
  WL_ATTRIBUTION_PRE, WL_ATTRIBUTION_POST, WL_CURVE_STALE_MS, WL_FORECAST_STALE_MS, WL_LICENCE, WL_LICENCE_URL,
  WL_MOS_WHY, WL_REGION_LABEL, WL_SERVICE_PAGE, WL_WARN_SERVICE, wlAt, wlCurveEnd, wlFill, wlHasCategory, wlNextEvents,
  type WlFill, type WlForecast, type WlGauge,
} from './waterLevel';
import { BFT_ROWS, CLASS_COLOR, CLASS_LABEL, DRY_VALUE, compass16, dateTime, dayDate, dryHourText, dryNote, f1, hm, hh, utcHm, dayShort } from './seaView';
import type { SeaTab } from './seaState';

export interface SeaReadoutHour {
  t: number; windMs: number | null; gustMs: number | null; windDir: number | null;
  hs: number | null; dir: number | null; tm: number | null; ws: number | null; wsDir: number | null; wsPer: number | null; wsPeak: number | null;
  sw: number | null; swDir: number | null; swPer: number | null; swPeak: number | null;
  /** V-SW-20: no sea state at the model cell this hour. */
  dry: boolean;
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
  /** V-SW-20: hours of the shown axis without sea state at the spot's cell, and whether such hours stay unclassified. */
  dry: { hours: number; of: number; classed: boolean };
  /** WL-4: water level at the nearest BSH gauge; `null` = switched off (`?wl=0`). */
  waterLevel: SeaWaterLevel | null;
  /** Desktop: the spot picker (search, Revier, profile, spot list) rendered above the tabs. */
  head?: ReactNode;
  /** `dossier` = the centre stage (desktop): chapter tabs, head card with key tiles, the hourly band, two columns. */
  layout?: 'aside' | 'dossier';
  /** Dossier only: the hourly band and the time chips of the page, rendered inside the dossier. */
  band?: ReactNode;
  chips?: ReactNode;
  /** Dossier only: back to the map stage. */
  onMap?: () => void;
}

const TABS: Array<[SeaTab, string]> = [['spot', 'Spot'], ['gebiet', 'Seegebiet'], ['quellen', 'Quellen']];
/**
 * Dossier chapters (desktop centre stage): Allgemein · Satellit · Wetter. They replace the tabs Spot · Seegebiet ·
 * Quellen there and take over their content; the URL keeps the tab keys (`tab=spot|gebiet|quellen`, mobile uses
 * them as tabs): Allgemein ⇔ `quellen`, Wetter ⇔ `spot`/`gebiet`, Satellit is written as `spot`.
 */
type DsChapter = 'allgemein' | 'satellit' | 'wetter';
const DS_CHAPTERS: Array<[DsChapter, string, string, SeaTab]> = [
  ['wetter', 'Wetter', 'Stunde · Wasserstand · Verlauf · Amtlich', 'spot'],
  ['satellit', 'Satellit', 'Lage · Küste im Zeitverlauf', 'spot'],
  ['allgemein', 'Allgemein', 'Spot · Datenquellen · Prüfer-Bilanz', 'quellen'],
];
const chapterOf = (t: SeaTab): DsChapter => (t === 'quellen' ? 'allgemein' : 'wetter');
const SEC_AREA = 'sw-sec-seegebiet';
function DsSection({ id, title, hint, side, children }: { id?: string; title: string; hint: string; side?: ReactNode; children: ReactNode }) {
  const tid = id ? `${id}-t` : undefined;
  return (
    <section className="sw-sec" id={id} aria-labelledby={tid} aria-label={id ? undefined : title}>
      <header className="sw-sec-head">
        <div className="sw-sec-tx"><h3 id={tid}>{title}</h3><p>{hint}</p></div>
        {side && <div className="sw-sec-side">{side}</div>}
      </header>
      <div className="sw-sec-body">{children}</div>
    </section>
  );
}
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
        <text x="56" y="8" textAnchor="middle" fontSize="9.5" fontFamily="IBM Plex Mono, monospace" fill="#8B7355">N</text>
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
function waterRange(t: SeaTexts, s: SeaSpot): string | null {
  const fx = t.fx40?.parts.kind === 'medium' ? t.fx40.parts.seas.find((x) => x.sea === s.region) : null;
  if (!fx || !fx.water.length) return null;
  const lo = Math.min(...fx.water.map((w) => w.min)), hi = Math.max(...fx.water.map((w) => w.max));
  return `${lo}–${hi} °C`;
}

const seaName = (s: SeaSpot) => (s.region === 'nordsee' ? 'Nordsee' : 'Ostsee');

function waterText(t: SeaTexts, s: SeaSpot): string {
  const r = waterRange(t, s);
  return r ? `${r} ${seaName(s)}` : '–';
}

function Card({ children, cls = '' }: { children: ReactNode; cls?: string }) { return <section className={`sw-card ${cls}`}>{children}</section>; }

export default function SeaReadout(p: Props) {
  const h = p.hour, s = p.spot, v = p.verdict;
  // Dossier chapter: follows the URL tab, except right after a chapter click wrote the tab itself (Satellit ⇒ `spot`).
  const [chapter, setChapter] = useState<DsChapter>(() => chapterOf(p.tab));
  const requestedTab = useRef<SeaTab | null>(null);
  const dsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (requestedTab.current === p.tab) { requestedTab.current = null; return; }
    requestedTab.current = null;
    setChapter(chapterOf(p.tab));
  }, [p.tab]);
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

  const spotCard = s && (
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
                <div className={`sw-hero-mid${h.dry ? ' is-dry' : ''}`}>{h.dry ? DRY_VALUE : h.hs == null ? '–' : `${f1(h.hs)} m`}</div>
                <div className="sw-hero-sub">{h.dry ? dryHourText(s.region) : h.hs == null ? 'kein Wert an der Wasserzelle' : `aus ${compass16(h.dir)} · Periode ${h.tm == null ? '–' : `${f1(h.tm)} s`}`}</div>
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
              <div><span>Windsee · Modell</span><strong>{h.dry || h.ws == null ? '–' : `${f1(h.ws)} m · ${h.wsPer == null ? '–' : `${f1(h.wsPer)} s`}`}</strong></div>
              <div><span>Dünung · Modell</span><strong>{h.dry || h.sw == null ? '–' : `${f1(h.sw)} m · ${h.swPer == null ? '–' : `${f1(h.swPer)} s`} aus ${compass16(h.swDir)}`}</strong></div>
              <div><span>Wellenrichtung · Modell</span><strong>{h.hs == null || h.hs < 0.05 ? '–' : `aus ${compass16(h.dir)} (${Math.round(h.dir ?? 0)}°)`}</strong></div>
              <div><span>Wasser · Mittelfrist (amtlich)</span><strong>{waterText(p.texts, s)}</strong></div>
            </div>
            {p.dry.hours > 0
              ? <p className="sw-note is-dry">{dryNote(s.region, p.dry.hours, p.dry.of, s.cell.km, p.dry.classed)}</p>
              : s.tidal && <p className="sw-note">Watt: das Modell rechnet mit Gezeit und Wassertiefe — den Wasserstand selbst zeigt die Karte „Wasserstand“ weiter unten, gemessen und vorhergesagt am nächsten BSH-Pegel. Bei Niedrigwasser kann die Stelle trockenfallen.</p>}
          </>
        )}
      </Card>
  );
  const windowCard = s && !p.noData && (
        <Card cls="is-cream">
          <div className="sw-eyebrow is-accent">Fenster für {p.profileLabel}</div>
          <div className="sw-win-head">{p.windows.next ? `${dayShort(p.windows.next.from)} ${hh(p.windows.next.from)}–${hh(p.windows.next.to)} Uhr` : 'Kein Fenster bis zum Ende des Laufs'}</div>
          <div className="sw-win-sub">
            {p.windows.next
              ? `${p.windows.next.hours} h ${p.windows.next.tight ? 'passt oder knapp' : 'passt'}${p.windows.longest && p.windows.longest !== p.windows.next ? ` · längstes: ${dayShort(p.windows.longest.from)} ${hh(p.windows.longest.from)}–${hh(p.windows.longest.to)} Uhr (${p.windows.longest.hours} h)` : ''} · Fenster = mindestens 2 Stunden passt oder knapp`
              : 'Mindestens zwei zusammenhängende Stunden „passt“ oder „knapp“ — in diesem Lauf nicht gefunden.'}
          </div>
        </Card>
  );
  const chartCardOf = (big = false) => s && !p.noData && p.chartHours.length > 1 && (
        <Card cls={big ? 'is-cream is-wide' : 'is-cream'}>
          <div className="sw-card-head"><span className="sw-eyebrow">Verlauf bis {dayShort(p.chartHours[p.chartHours.length - 1].t)} {hh(p.chartHours[p.chartHours.length - 1].t)} Uhr</span><span className="sw-unit">Welle {runLabel(p.run)} · Wind {windName}</span></div>
          <WindChart hours={p.chartHours} selMs={h?.t ?? p.chartHours[0].t} limitKn={p.limitKn} limitLabel={p.limitLabel} big={big} />
          <SeaStateChart hours={p.chartHours} selMs={h?.t ?? p.chartHours[0].t} big={big} />
          <div className="sw-chart-legend">
            <span><i style={{ background: '#2C2A26' }} />Wind (kn)</span><span><i style={{ background: 'rgba(139,115,85,0.4)', height: 6 }} />Böen-Band</span>
            <span><i style={{ background: '#0F6E7A' }} />Seegang gesamt</span><span><i style={{ background: '#3E9284' }} />Windsee</span><span><i style={{ background: '#7A9466' }} />Dünung (m)</span>
            {p.dry.hours > 0 && <span><i style={{ background: DRY_COLOUR, height: 5 }} />Modellzelle ohne Wasser</span>}
          </div>
        </Card>
  );
  const chartCard = chartCardOf();
  const waterCardOf = (big = false) => s && p.waterLevel && <WaterLevelCard wl={p.waterLevel} selMs={h?.t ?? p.nowMs} nowMs={p.nowMs} big={big} />;
  const waterCard = waterCardOf();
  const officialCard = s && <OfficialCard spot={s} texts={p.texts} warning={p.warning} onArea={() => p.onTab('gebiet')} nowMs={p.nowMs} />;
  const measuredCard = s && (
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
  );
  const disclaimer = <p className="sw-disclaimer">Kein amtliches Warnprodukt. Die Profile vergleichen Modell und Rechnung mit deinen Grenzen und sind keine Sicherheitsbewertung — die Entscheidung bleibt bei dir. Verbindlich sind die Meldungen des Seewetterdienstes Hamburg. Daten: Deutscher Wetterdienst (GeoNutzV).</p>;
  const spotTab = s && (
    <>
      {officialBanner}
      {spotCard}
      {windowCard}
      {chartCard}
      {waterCard}
      {officialCard}
      {measuredCard}
      {disclaimer}
    </>
  );
  const empty = <div className="sw-empty">Spot wählen — in der Liste, auf der Karte oder über die Suche.</div>;
  const areaTab = <AreaDossier spot={s} texts={p.texts} warning={p.warning} />;
  const sourcesTab = <SourcesTab spot={s} run={p.run} spotsDoc={p.spotsDoc} texts={p.texts} freshness={p.freshness} wl={p.waterLevel} />;

  if (p.layout === 'dossier') {
    // Head card on every chapter (title, meta, run chip); the official banner stays right below it on every chapter.
    // The hour card shows the same facts as the spot card (hour values, compass, verdict, model values) for the wide stage.
    const spread = h && h.windMs != null && h.gustMs != null ? h.gustMs - h.windMs : null;
    const gauge = p.waterLevel?.gauge ?? null;
    const stationName = s?.station ? s.station.name.charAt(0) + s.station.name.slice(1).toLowerCase() : null;
    const pick = (c: DsChapter, tab: SeaTab) => {
      // A new chapter starts at its top, not at the scroll position of the previous one.
      if (c !== chapter) dsRef.current?.closest('.sw-ds-scroll')?.scrollTo({ top: 0 });
      setChapter(c);
      if (tab !== p.tab) { requestedTab.current = tab; p.onTab(tab); }
    };
    // ←/→ move between the chapter tabs (one tab stop for the whole list).
    const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = DS_CHAPTERS.findIndex(([k]) => k === chapter);
      const n = DS_CHAPTERS[(i + (e.key === 'ArrowRight' ? 1 : DS_CHAPTERS.length - 1)) % DS_CHAPTERS.length];
      e.preventDefault();
      pick(n[0], n[3]);
      e.currentTarget.querySelector<HTMLElement>(`[data-ch="${n[0]}"]`)?.focus();
    };
    const headCard = s && (
      <section className="sw-card sw-ds-head" aria-label="Spot-Dossier · Kopf">
        <div className="sw-ds-headrow">
          <div className="sw-ds-headtx">
            <div className="sw-eyebrow is-accent">Spot-Dossier · {kindsText(s.kinds)} · Profil {p.profileLabel}</div>
            <h2 className="sw-ds-title">{s.name}<span className="sw-badge">{s.region === 'nordsee' ? 'NORDSEE' : 'OSTSEE'}</span></h2>
            <div className="sw-ds-sub">{[s.coast?.name, s.seaArea ? `Seegebiet ${s.seaArea.name}` : null, s.tidal ? 'Watt' : null].filter(Boolean).join(' · ')} · Ufer zeigt nach {compass16(s.normal)} ({s.normal}°{s.normalFrom === 'set' ? ', gesetzt' : ''})</div>
            <div className={`sw-chip${p.freshness !== 'live' ? ' is-stale' : ''}`}><i />Welle Modell {runLabel(p.run)} · Wind {windName}{p.freshness === 'stale' ? ' · veraltet' : ''}</div>
          </div>
          {p.onMap && <div className="sw-ds-headside"><button type="button" className="sw-link sw-ds-back" onClick={p.onMap}>↗ Zur Karte</button></div>}
        </div>
      </section>
    );
    // Allgemein: the spot's facts, combined with what the sources say about them (report, station, gauge, model cell).
    const w = p.spotsDoc?.wind;
    const facts: Array<[string, ReactNode, ReactNode?]> = s ? [
      ['Art', kindsText(s.kinds), `Profil ${p.profileLabel}`],
      ['Meer', s.region === 'nordsee' ? 'Nordsee' : 'Ostsee', `Warnstatus: Deutsche ${s.wodlCoast === 'Nordseekueste' ? 'Nordseeküste' : 'Ostseeküste'} (WODL45)`],
      ['Küstenabschnitt', s.coast?.name ?? '–', p.texts.fq51 ? `Küstenbericht FQDL51 · ${issued(p.texts.fq51)}` : 'Küstenbericht FQDL51 · nicht lesbar'],
      ['Seegebiet', s.seaArea?.name ?? 'keins', s.seaArea ? (p.texts.fq50 ? `Seewetterbericht FQDL50 · ${issued(p.texts.fq50)}` : 'Seewetterbericht FQDL50 · nicht lesbar') : 'liegt in keinem Seegebiet des Berichts (z. B. Haff)'],
      ['Ufer zeigt nach', `${compass16(s.normal)} · ${s.normal}°`, s.normalFrom === 'set' ? `gesetzt${s.normalWhy ? ` — ${s.normalWhy}` : ''}` : 'aus der Landmaske des Wellenmodells'],
      ...(s.tidal ? [['Watt', 'ja', 'bei Niedrigwasser kann die Stelle trockenfallen'] as [string, ReactNode, ReactNode]] : []),
      ['Wasserzelle', `${f1(s.cell.km)} km vom Spot`, `${s.cell.model.toUpperCase()} (900 m) · Seegang und Wind ${w?.engine ?? 'buscosun Fusion'} werden dort gelesen`],
      ['Wassertemperatur', waterText(p.texts, s), p.texts.fx40 ? `Mittelfrist FXDL40 · ${issued(p.texts.fx40)}` : 'Mittelfrist FXDL40 · nicht lesbar'],
      ['Messstation', stationName ? `DWD ${stationName}` : 'keine in der Nähe', s.station ? `${s.station.km} km vom Spot · stündlich · Messung an Land` : 'keine liefernde Station'],
      ['Pegel', p.waterLevel == null ? 'ausgeschaltet' : gauge ? gauge.name : p.waterLevel.state === 'loading' ? 'lädt …' : 'keiner lesbar',
        gauge && p.waterLevel?.km != null ? `BSH · ${f1(p.waterLevel.km)} km vom Spot` : 'BSH-Wasserstand'],
      ['Lage', `${s.lat.toFixed(4)}° N · ${s.lon.toFixed(4)}° O`, 'WGS84'],
    ] : [];
    const generalCard = s && (
      <section className="sw-card sw-facts" aria-label="Steckbrief des Spots">
        {facts.map(([k, val, sub]) => (
          <div key={k} className="sw-fact"><span className="sw-fact-k">{k}</span><strong>{val}</strong>{sub && <span className="sw-fact-s">{sub}</span>}</div>
        ))}
      </section>
    );
    const nowCard = s && (
      <section className="sw-card sw-ds-now" aria-label="Wetter zur gewählten Stunde">
        {p.noData && <div className="sw-empty"><strong>Keine Daten.</strong> {p.noData}</div>}
        {!p.noData && h && (
          <>
            <div className="sw-ds-stats">
              <div className="sw-ds-stat">
                <span className="sw-ds-stat-l">Wind {dayShort(h.t)} {hh(h.t)} Uhr · {windName}</span>
                <strong>{h.windMs == null ? '–' : `${fmtWind(h.windMs, p.unit)} ${unitLabel(p.unit)}`}</strong>
                <span className="sw-ds-stat-c">{h.windMs == null ? 'kein Wind für diese Stunde berechnet' : `aus ${compass16(h.windDir)}${h.windDir != null ? ` (${Math.round(h.windDir)}°)` : ''}${v?.shore ? ` · ${SHORE_LABEL[v.shore]}` : ''}`}</span>
              </div>
              <div className="sw-ds-stat">
                <span className="sw-ds-stat-l">Böen · {windName}</span>
                <strong>{h.gustMs == null ? '–' : `${fmtWind(h.gustMs, p.unit)} ${unitLabel(p.unit)}`}</strong>
                <span className="sw-ds-stat-c">{spread == null ? 'keine Böe für diese Stunde berechnet' : `Böenspanne ${fmtWind(spread, p.unit)} ${unitLabel(p.unit)}`}</span>
              </div>
              <div className="sw-ds-stat">
                <span className="sw-ds-stat-l">Seegang · Modell CWAM</span>
                <strong className={h.dry ? 'is-dry' : ''}>{h.dry ? DRY_VALUE : h.hs == null ? '–' : `${f1(h.hs)} m`}</strong>
                <span className="sw-ds-stat-c">{h.dry ? dryHourText(s.region) : h.hs == null ? 'kein Wert an der Wasserzelle' : `aus ${compass16(h.dir)}${h.hs >= 0.05 ? ` (${Math.round(h.dir ?? 0)}°)` : ''}`}</span>
              </div>
              <div className="sw-ds-stat">
                <span className="sw-ds-stat-l">Periode · Modell CWAM</span>
                <strong>{h.dry || h.tm == null ? '–' : `${f1(h.tm)} s`}</strong>
                <span className="sw-ds-stat-c">{h.dry ? 'kein Seegang' : h.tm == null ? 'kein Wert' : 'mittlere Periode Tm'}</span>
              </div>
              <div className="sw-ds-stat">
                <span className="sw-ds-stat-l">Windsee · Modell</span>
                <strong>{h.dry || h.ws == null ? '–' : `${f1(h.ws)} m`}</strong>
                <span className="sw-ds-stat-c">{h.dry ? 'kein Seegang' : h.ws == null ? 'kein Wert' : h.wsPer == null ? 'Periode –' : `Periode ${f1(h.wsPer)} s`}</span>
              </div>
              <div className="sw-ds-stat">
                <span className="sw-ds-stat-l">Dünung · Modell</span>
                <strong>{h.dry || h.sw == null ? '–' : `${f1(h.sw)} m`}</strong>
                <span className="sw-ds-stat-c">{h.dry ? 'kein Seegang' : h.sw == null ? 'kein Wert' : `Periode ${h.swPer == null ? '–' : `${f1(h.swPer)} s`} · aus ${compass16(h.swDir)}`}</span>
              </div>
              <div className="sw-ds-stat">
                <span className="sw-ds-stat-l">Wellenrichtung · Modell</span>
                <strong>{h.hs == null || h.hs < 0.05 ? '–' : `aus ${compass16(h.dir)}`}</strong>
                <span className="sw-ds-stat-c">{h.hs == null || h.hs < 0.05 ? 'kein Seegang mit Richtung' : `${Math.round(h.dir ?? 0)}°`}</span>
              </div>
              <div className="sw-ds-stat">
                <span className="sw-ds-stat-l">Wasser · Mittelfrist (amtlich)</span>
                <strong>{waterRange(p.texts, s) ?? '–'}</strong>
                <span className="sw-ds-stat-c">{waterRange(p.texts, s) ? seaName(s) : 'kein Wert im Bericht'}</span>
              </div>
              <Compass normal={s.normal} windFrom={h.windDir} waveFrom={h.hs != null && h.hs >= 0.05 ? h.dir : null}
                label={`Wind aus ${compass16(h.windDir)}, Welle aus ${compass16(h.dir)}, Ufer zeigt nach ${compass16(s.normal)}`} shore={v?.shore ? SHORE_LABEL[v.shore] : null} />
            </div>
            {p.dry.hours > 0
              ? <p className="sw-note is-dry">{dryNote(s.region, p.dry.hours, p.dry.of, s.cell.km, p.dry.classed)}</p>
              : s.tidal && <p className="sw-note">Watt: das Modell rechnet mit Gezeit und Wassertiefe — den Wasserstand selbst zeigt die Karte „Wasserstand“ unten, gemessen und vorhergesagt am nächsten BSH-Pegel. Bei Niedrigwasser kann die Stelle trockenfallen.</p>}
          </>
        )}
      </section>
    );
    const satCard = s && (
      <Card cls="is-cream">
        <div className="sw-card-head"><span className="sw-eyebrow">Satellit · Lage des Spots</span><span className="sw-unit">Esri World Imagery · Klick öffnet die Karte</span></div>
        <SeaMiniMap spot={s} gauge={gauge} height={320} onClick={p.onMap} ariaLabel={`Satellitenbild: ${s.name}${p.onMap ? ' — zur Kartenbühne wechseln' : ''}`} />
        <div className="sw-ds-maplegend">
          <span><i style={{ background: '#0F6E7A' }} />{s.name} · Ufer zeigt nach {compass16(s.normal)} (gestrichelt)</span>
          {s.station && <span><i style={{ background: '#5F7A4C' }} />DWD-Station {stationName} · {s.station.km} km</span>}
          {gauge && <span><i style={{ background: '#2C2A26' }} />Pegel {gauge.name}{p.waterLevel?.km != null ? ` · ${f1(p.waterLevel.km)} km` : ''}</span>}
        </div>
      </Card>
    );
    // Same kill switch as the Brandradar (`?sat=0`, `localStorage.sat = '0'`): off ⇒ no card, no request.
    const satDaysCard = s && satEnabled() && (
      <Card cls="is-cream">
        <div className="sw-card-head"><span className="sw-eyebrow">Satellit · Küste im Zeitverlauf</span><span className="sw-unit">Sentinel-2 / Landsat · Tag wählen</span></div>
        <SeaSatImagery lat={s.lat} lon={s.lon} name={s.name} nowMs={p.nowMs} />
      </Card>
    );
    // In the dossier the link of the official card scrolls to the sea-area report on the same chapter.
    return (
      <div className="sw-ds" aria-label="Spot-Dossier" ref={dsRef}>
        <div className="sw-ds-tabs" role="tablist" aria-label="Teilbereich des Dossiers" onKeyDown={onTabKey}>
          {DS_CHAPTERS.map(([k, t, hint, tab], i) => (
            <button key={k} type="button" role="tab" data-ch={k} tabIndex={chapter === k ? 0 : -1} aria-selected={chapter === k} className={`sw-ds-tab${chapter === k ? ' is-active' : ''}`} onClick={() => pick(k, tab)}>
              <span className="sw-ds-tab-n" aria-hidden="true">{i + 1}</span>
              <span className="sw-ds-tab-tx"><span className="sw-ds-tab-t">{t}</span><span className="sw-ds-tab-h">{hint}</span></span>
            </button>
          ))}
        </div>
        {headCard}
        {officialBanner}
        {chapter === 'allgemein' && (
          <>
            {s ? (
              <DsSection title="Steckbrief" hint="Lage, Küste und Seegebiet, Wasserzelle des Modells, Messstation und Pegel — mit dem Stand der Quelle">
                {generalCard}
              </DsSection>
            ) : empty}
            <DsSection title="Datenquellen" hint="Herkunft jedes Werts · Prüfer-Bilanz des Laufs · Modellabgleich · Lizenzen">
              <div className="sw-ds-grid is-flow">{sourcesTab}</div>
            </DsSection>
          </>
        )}
        {chapter === 'satellit' && (s ? (
          <div className={`sw-ds-grid${satDaysCard ? '' : ' is-one'}`}>{satCard}{satDaysCard}</div>
        ) : empty)}
        {chapter === 'wetter' && (
          <>
            {s ? (
              <DsSection title="Am Spot" hint="Gewählte Stunde · Stundenband · Wasserstand · Verlauf" side={p.chips}>
                {nowCard}
                {p.band}
                <div className="sw-ds-grid is-one">{waterCardOf(true)}{chartCardOf(true)}</div>
              </DsSection>
            ) : empty}
            <DsSection id={SEC_AREA} title="Amtlich · Küste und Seegebiet" hint="Seewetterdienst Hamburg im Wortlaut: Warnstatus, Küstenbericht, Seewetterbericht, Mittelfrist">
              <AreaDossier spot={s} texts={p.texts} warning={p.warning} />
            </DsSection>
            {s && disclaimer}
          </>
        )}
      </div>
    );
  }

  return (
    <aside className="sw-readout" aria-label="Details">
      {p.head}
      <div role="tablist" aria-label="Ansicht" className="sw-seg sw-tabs">
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={p.tab === k} className={p.tab === k ? 'is-active' : ''} onClick={() => p.onTab(k)}>{l}</button>)}
      </div>
      {p.tab === 'spot' && (s ? spotTab : empty)}
      {p.tab === 'gebiet' && areaTab}
      {p.tab === 'quellen' && sourcesTab}
    </aside>
  );
}

/**
 * WL-4 — Water level at the nearest BSH gauge (`audit/wasserstand-bsh.md` §6). Three rules shape this card:
 *
 *  - **E-WL-6** the official category is only ever QUOTED, never derived from a threshold of ours, and it is
 *    labelled with what the BSH's own parameter documentation says about it: it holds for the North Sea resp.
 *    the Baltic, not for this gauge. The official warning service is linked, always — buscosun never warns.
 *  - **E-WL-8** the forecast text is the published wording, markup removed, with its issue time and its
 *    scope (the coastal area, not the single gauge — 6 texts cover all 136 gauges).
 *  - **E-WL-9** numbers stay in cm above gauge zero, as delivered; the reference heights of the SAME gauge
 *    stand next to them instead of a conversion of ours.
 */
export interface SeaWaterLevel {
  state: 'loading' | 'missing' | 'error' | 'ok';
  gauge: WlGauge | null;
  km: number | null;
  doc: WlForecast | null;
  /** Why there is nothing to show — named, never silent. */
  why: string | null;
}

/** The service sends centimetres, sometimes with a half (12.5) — German decimal comma, no invented digits. */
const cmText = (cm: number) => cm.toLocaleString('de-DE', { maximumFractionDigits: 1 });

const WL_STALE = (doc: WlForecast, nowMs: number) => ({
  curve: doc.curveAt != null && nowMs - doc.curveAt > WL_CURVE_STALE_MS,
  forecast: doc.forecastAt != null && nowMs - doc.forecastAt > WL_FORECAST_STALE_MS,
});

function WaterLevelCard({ wl, selMs, nowMs, big = false }: { wl: SeaWaterLevel; selMs: number; nowMs: number; big?: boolean }) {
  const doc = wl.doc, g = wl.gauge;
  const cls = big ? 'is-cream is-wide' : 'is-cream';
  const head = (
    <div className="sw-card-head">
      <span className="sw-eyebrow is-accent-dark">Wasserstand · amtlich (BSH)</span>
      <span className="sw-unit">cm über Pegelnull</span>
    </div>
  );
  if (wl.state !== 'ok' || !doc) {
    return (
      <Card cls={cls}>
        {head}
        <div className="sw-note">
          {wl.state === 'loading' ? 'Wasserstand lädt …'
            : wl.state === 'missing' ? (wl.why ?? 'Der Pegelkatalog liegt noch nicht im Daten-Repo — bis dahin zeigt die Karte keine Pegel.')
              : (wl.why ?? 'Die Wasserstandsvorhersage des BSH ist derzeit nicht lesbar. Das heißt nicht, dass der Wasserstand unauffällig ist.')}
        </div>
        <WaterLevelFooter doc={null} />
      </Card>
    );
  }

  const category = wlHasCategory(doc);
  const stale = WL_STALE(doc, nowMs);
  const at = wlAt(doc.curve, selMs);
  const shown = at?.forecast ?? at?.measured ?? null;
  const curveEnd = wlCurveEnd(doc.curve);
  // The page's hour axis reaches +78 h, the BSH curve about +54 h — beyond it there is no value, and that is
  // what the card says instead of repeating the last one.
  const beyond = shown == null && curveEnd != null && selMs > curveEnd;
  const events = wlNextEvents(doc.events, nowMs, 4);
  const window = doc.curve.filter((pt) => pt.t >= nowMs - 6 * 3_600_000 && pt.t <= nowMs + 48 * 3_600_000);
  // WL-5: the fill level — the chosen hour's value; beyond the curve the latest value at "now" (named as such).
  const fillPt = at ?? (beyond ? wlAt(doc.curve, nowMs) : null);
  const fill = wlFill(fillPt, window, { region: doc.region, mhwCm: doc.mhwCm, mlwCm: doc.mlwCm, zeroNhnCm: g?.zeroNhnCm ?? doc.zeroNhnCm });
  const fillNow = fill != null && at == null;
  // The Baltic has no tide: the BSH's mean_high/low_water are MHW/MNW there, MThw/MTnw only in the North Sea.
  const highLabel = fill?.highLabel ?? (doc.region === 'baltic_sea' ? 'MHW' : 'MThw');
  const lowLabel = fill?.lowLabel ?? (doc.region === 'baltic_sea' ? 'MNW' : 'MTnw');
  const refs = [
    g?.zeroNhnCm != null && g.zeroNhnCm !== 0 ? `Pegelnull ${Math.abs(g.zeroNhnCm)} cm ${g.zeroNhnCm < 0 ? 'unter' : 'über'} NHN` : null,
    doc.mhwCm != null ? `${highLabel} ${doc.mhwCm} cm` : null,
    doc.mlwCm != null ? `${lowLabel} ${doc.mlwCm} cm` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Card cls={cls}>
      {head}
      <div className="sw-official-meta">
        Pegel {doc.name}{wl.km != null ? ` · ${f1(wl.km)} km vom Spot` : ''}{doc.area ? ` · ${doc.area}` : ''} · {WL_REGION_LABEL[doc.region]}
      </div>

      {category && (
        <div className="sw-wl-cat">
          <strong>{category}</strong>
          <span>
            Kategorie des BSH, wörtlich. Sie gilt laut BSH für die {WL_REGION_LABEL[doc.region]}, nicht für diesen
            Pegel. Warnungen gibt der <a href={WL_WARN_SERVICE} target="_blank" rel="noreferrer">Sturmflutwarndienst</a> —
            buscosun warnt nicht.
          </span>
        </div>
      )}

      <div className="sw-vals">
        <div>
          <span>{at && at.forecast == null && at.measured != null ? 'Gemessen · zur gewählten Stunde' : 'Vorhersage · zur gewählten Stunde'}</span>
          <strong>{shown == null ? '–' : `${cmText(shown)} cm`}</strong>
        </div>
        <div><span>Bezug dieses Pegels</span><strong>{refs || '– (keine Bezugshöhen)'}</strong></div>
      </div>
      {fill && <WaterLevelFill fill={fill} isNow={fillNow} big={big} />}
      {beyond && (
        <p className="sw-note">Der Verlauf des BSH reicht bis {dayShort(curveEnd!)} {hm(curveEnd!)} Uhr — für die gewählte Stunde gibt es dort keinen Wert. Die Hoch- und Niedrigwasserzeiten unten reichen weiter.</p>
      )}

      {events.length > 0 && (
        <>
          <ul className="sw-wl-events">
            {events.map((e) => {
              // V-WL-8: the official height reaches about a day ahead. Beyond it only the automatic MOS
              // forecast carries a number — shown, but never as the official one (provenance rule).
              const official = e.forecast != null;
              const cm = official ? e.forecast : e.mosCm;
              const dev = official ? e.deviation : e.mosDeviation;
              return (
                <li key={e.t}>
                  <span className="sw-wl-ev">{e.kind === 'HW' ? 'Hochwasser' : 'Niedrigwasser'} {dayShort(e.t)} {hm(e.t)} Uhr</span>
                  <span className="sw-wl-cm">{cm == null ? '–' : `${cmText(cm)} cm`}{official && e.uncertaintyCm != null ? ` ± ${cmText(e.uncertaintyCm)} cm` : ''}</span>
                  {dev && <em>{dev} gegen {e.kind === 'HW' ? 'MThw' : 'MTnw'}</em>}
                  <em>{cm == null ? 'nur Zeit, kein Wert' : official ? 'amtlich' : `automatisch (MOS ${e.mosSystem})`}</em>
                </li>
              );
            })}
          </ul>
          {events.some((e) => e.forecast == null && e.mosCm != null) && (
            <p className="sw-note">
              Die amtliche Höhe gibt das BSH etwa einen Tag voraus. Danach steht hier die automatische
              Modellvorhersage (MOS) — dieselbe Quelle, aber ohne amtliche Prüfung und ohne Unsicherheitsangabe
              {events.some((e) => e.forecast == null && e.mosCm != null && e.mosSystem !== 'r0')
                ? `; ${WL_MOS_WHY[events.find((e) => e.forecast == null && e.mosCm != null && e.mosSystem !== 'r0')!.mosSystem!]}.`
                : '.'}
            </p>
          )}
          {events.some((e) => e.forecast == null && e.mosCm == null) && (
            <p className="sw-note">Für die späteren Zeiten nennt das BSH an diesem Pegel nur den Zeitpunkt, keine Höhe.</p>
          )}
        </>
      )}
      {doc.events.length === 0 && doc.curve.length > 0 && (
        <p className="sw-note">Dieser Pegel führt keine Hoch-/Niedrigwasserzeiten — in der {WL_REGION_LABEL[doc.region]} gibt das BSH dort nur den Verlauf aus.</p>
      )}
      {doc.curve.length === 0 && (
        <p className="sw-note">Für diesen Pegel liefert das BSH keinen Verlauf, nur die Hoch- und Niedrigwasserzeiten oben.</p>
      )}

      {window.length > 1 && (
        <>
          <WaterLevelChart points={window} selMs={selMs} nowMs={nowMs} mhwCm={doc.mhwCm} mlwCm={doc.mlwCm} highLabel={highLabel} lowLabel={lowLabel} big={big} />
          <div className="sw-chart-legend">
            <span><i style={{ background: '#2C2A26' }} />gemessen</span>
            <span><i style={{ background: '#0F6E7A' }} />Vorhersage</span>
            {window.some((pt) => pt.tide != null) && <span><i style={{ background: '#7A9466' }} />Gezeit</span>}
          </div>
        </>
      )}

      <div className="sw-official-meta sw-gap">
        Modellkurve {doc.curveAt == null ? 'ohne Stempel' : `${dateTime(doc.curveAt)}`}{stale.curve ? ' · älter als 3 h' : ''}
        {' · '}amtliche Vorhersage {doc.forecastAt == null ? 'ohne Stempel' : `${dateTime(doc.forecastAt)}`}{stale.forecast ? ' · älter als 12 h' : ''}
      </div>

      {doc.text && (
        <>
          <div className="sw-official-meta sw-gap">Amtlicher Text{doc.area ? ` · ${doc.area}` : ''}{doc.forecastAt != null ? ` · ${dateTime(doc.forecastAt)}` : ''} · wörtlich</div>
          <p className="sw-official">{doc.text}</p>
        </>
      )}
      {doc.textAdditional && <p className="sw-official">{doc.textAdditional}</p>}
      {doc.info && <p className="sw-note">Hinweis des BSH zum Betrieb: {doc.info}</p>}

      <WaterLevelFooter doc={doc} />
    </Card>
  );
}

/** Signed centimetres for the sentences: "+12" / "−8", German comma. */
const cmSigned = (cm: number) => `${cm > 0 ? '+' : cm < 0 ? '−' : '±'}${cmText(Math.abs(cm))}`;

/**
 * WL-5 — the fill level of the gauge as a glass: the value of the chosen hour on a scale that holds the chart
 * window and the gauge's own reference heights (mean high/low water, NHN) as marks. Every number is the BSH's
 * value in cm above gauge zero or a subtraction in that same reference; the colour names the origin
 * (forecast teal, measurement ink — the chart's colours).
 */
function WaterLevelFill({ fill, isNow, big = false }: { fill: WlFill; isNow: boolean; big?: boolean }) {
  const W = big ? 132 : 104, H = big ? 150 : 124, x0 = 6, x1 = big ? 46 : 40, top = 8, bottom = H - 8;
  const y = (cm: number) => bottom - ((cm - fill.lo) / (fill.hi - fill.lo)) * (bottom - top);
  const colour = fill.kind === 'forecast' ? '#0F6E7A' : '#2C2A26';
  const yv = y(fill.cm);
  const spanPct = fill.spanFrac != null ? Math.round(fill.spanFrac * 100) : null;
  const spanText = fill.band === 'within' ? `${fill.spanLabel} zu ${spanPct} % gefüllt`
    : fill.band === 'above' ? `über dem ${fill.spanLabel} (${cmSigned(fill.vsHigh!)} cm gegen ${fill.highLabel})`
      : fill.band === 'below' ? `unter dem ${fill.spanLabel} (${cmSigned(fill.vsLow!)} cm gegen ${fill.lowLabel})`
        : null;
  const label = `Füllstand des Pegels: ${cmText(fill.cm)} cm über Pegelnull, ${fill.kind === 'forecast' ? 'Vorhersage' : 'gemessen'} ${hm(fill.t)} Uhr`
    + (fill.marks.length ? `; Marken ${fill.marks.map((m) => `${m.label} ${m.cm} cm`).join(', ')}` : '');
  return (
    <div className="sw-wl-fill" data-kind={fill.kind} data-band={fill.band ?? 'none'}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <rect x={x0} y={top} width={x1 - x0} height={bottom - top} rx={5} fill="#F4F0E4" stroke="#E0D6BE" />
        <rect className="sw-wl-fill-water" x={x0 + 1} y={yv} width={x1 - x0 - 2} height={Math.max(0, bottom - 1 - yv)} rx={4} fill={colour} fillOpacity={0.78} />
        <line x1={x0} x2={x1} y1={yv} y2={yv} stroke={colour} strokeWidth={2} />
        {fill.marks.map((m) => (
          <g key={m.label}>
            <line x1={x0 - 2} x2={x1 + 4} y1={y(m.cm)} y2={y(m.cm)} stroke="#8B7355" strokeDasharray="3 2" />
            <text x={x1 + 7} y={y(m.cm) + (big ? 4 : 3)} fontSize={big ? 12.5 : 10} fill="#8B7355" fontFamily="IBM Plex Mono, monospace">{m.label} {m.cm}</text>
          </g>
        ))}
      </svg>
      <div className="sw-wl-fill-txt">
        <span className="sw-wl-fill-k">Füllstand · {fill.kind === 'forecast' ? 'Vorhersage' : 'gemessen'} {hm(fill.t)} Uhr{isNow ? ' (letzter Wert, nicht die gewählte Stunde)' : ''}</span>
        <strong>{cmText(fill.cm)} cm <small>über Pegelnull</small></strong>
        {fill.nhnCm != null && <span>{cmText(Math.abs(fill.nhnCm))} cm {fill.nhnCm < 0 ? 'unter' : fill.nhnCm > 0 ? 'über' : 'auf'} NHN</span>}
        {fill.vsHigh != null && fill.vsLow != null && fill.vsHigh !== fill.vsLow && (
          <span>{cmSigned(fill.vsLow)} cm gegen {fill.lowLabel} · {cmSigned(fill.vsHigh)} cm gegen {fill.highLabel}</span>
        )}
        {fill.marks.some((m) => m.label === 'MW') && fill.vsHigh != null && <span>{cmSigned(fill.vsHigh)} cm gegen Mittelwasser</span>}
        {spanText && <span className="sw-wl-fill-span">{spanText}</span>}
      </div>
    </div>
  );
}

function WaterLevelFooter({ doc }: { doc: WlForecast | null }) {
  return (
    <p className="sw-disclaimer">
      {WL_ATTRIBUTION_PRE}
      <a href={WL_LICENCE_URL} target="_blank" rel="noreferrer">{WL_LICENCE}</a>
      {WL_ATTRIBUTION_POST}
      {' · '}
      <a href={WL_SERVICE_PAGE} target="_blank" rel="noreferrer">Quelle (OGC API)</a>
      {doc?.url ? <> · <a href={doc.url} target="_blank" rel="noreferrer">Pegel beim BSH</a></> : null}
      {' · '}<a href={WL_WARN_SERVICE} target="_blank" rel="noreferrer">Sturmflutwarndienst</a>
      {'. '}
      {doc?.copyright ?? 'Das BSH übernimmt für die angegebenen Informationen keine Gewähr.'}
      {' Verbindlich ist die amtliche Veröffentlichung des BSH, nicht diese Darstellung.'}
    </p>
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

/**
 * Official texts (Seewetterdienst Hamburg) — dossier chapter Wetter and the mobile tab Seegebiet: warning status as two status tiles, the coast report
 * and each forecast day as labelled rows, the medium range as a day list with water temperature tiles. Every text is
 * the parsed report verbatim — only arranged; numbers are set bold, nothing is reworded (quote rule). The Beaufort
 * chip is a conversion of the highest number in the wind line and says so.
 */
const RowIcon = ({ k }: { k: 'wind' | 'sight' | 'sea' | 'other' }) => (
  <svg className="sw-ar-ic" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
    {k === 'wind' && <path d="M2 7h10a2.5 2.5 0 1 0-2.5-2.5M2 11h14a2.5 2.5 0 1 1-2.5 2.5M2 15h7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    {k === 'sight' && <><path d="M1.5 10s3.2-5.5 8.5-5.5S18.5 10 18.5 10s-3.2 5.5-8.5 5.5S1.5 10 1.5 10Z" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="10" cy="10" r="2.4" fill="currentColor" /></>}
    {k === 'sea' && <path d="M1.5 8c2 0 2-1.8 4.2-1.8S7.9 8 10 8s2-1.8 4.2-1.8S16.4 8 18.5 8M1.5 13.5c2 0 2-1.8 4.2-1.8s2.2 1.8 4.3 1.8 2-1.8 4.2-1.8 2.2 1.8 4.3 1.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    {k === 'other' && <circle cx="10" cy="10" r="2.6" fill="currentColor" />}
  </svg>
);

/** The quoted text with its numbers set bold — the characters stay exactly as in the report. */
const numBold = (t: string) => t.split(/(\d+(?:,\d+)?)/).map((x, i) => (i % 2 ? <b key={i}>{x}</b> : x));

/** Highest Beaufort number in a wind line, as a conversion chip (only where the table has the row). */
function BftChip({ wind }: { wind: string | null }) {
  const nums = (wind?.match(/\d+/g) ?? []).map(Number).filter((n) => n <= 12);
  if (!nums.length) return null;
  const top = Math.max(...nums);
  const row = BFT_ROWS.find(([b]) => b === top);
  return row ? <span className="sw-ar-bft" title="Umrechnung der höchsten Windstärke im Text">bis {top} Bft ≈ {row[1]}</span> : null;
}

function ReportRows({ a }: { a: { wind: string | null; sightWeather: string | null; sea?: string | null; other: string[] } }) {
  const rows: Array<['wind' | 'sight' | 'sea' | 'other', string, string]> = [];
  if (a.wind) rows.push(['wind', 'Wind', a.wind]);
  if (a.sightWeather) rows.push(['sight', 'Sicht/Wetter', a.sightWeather]);
  if (a.sea) rows.push(['sea', 'Seegang', a.sea]);
  a.other.forEach((o) => rows.push(['other', '', o]));
  return (
    <dl className="sw-ar-rows">
      {rows.map(([k, label, text], i) => (
        <div key={i} className={`sw-ar-row is-${k}`}>
          <dt><RowIcon k={k} />{label && <span>{label}</span>}</dt>
          <dd>{numBold(text)}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusTile({ title, meta, status, text, missing }: { title: string; meta: string; status: 'none' | 'unknown' | null; text: string; missing: string }) {
  const tone = status === 'none' ? 'is-none' : 'is-unknown';
  return (
    <div className={`sw-ar-status ${tone}`}>
      <span className="sw-ar-status-ic" aria-hidden="true">{status === 'none' ? '✓' : '!'}</span>
      <div className="sw-ar-status-tx">
        <span className="sw-ar-k">{title}</span>
        <p className="sw-official">{text || missing}</p>
        <span className="sw-ar-meta">{meta}</span>
      </div>
    </div>
  );
}

function AreaDossier({ spot, texts, warning }: { spot: SeaSpot | null; texts: SeaTexts; warning: Props['warning'] }) {
  const coastName = spot ? (spot.wodlCoast === 'Nordseekueste' ? 'Nordseeküste' : 'Ostseeküste') : 'Küste';
  const c = warning.coast, area = warning.area;
  const stale = texts.stale.WODL45;
  const sec = spot && texts.fq51?.parts.kind === 'report' ? texts.fq51.parts.days[0]?.areas.find((a) => a.id === spot.coast?.id) : null;
  const d = texts.fq50;
  const id = spot?.seaArea?.id ?? null;
  const days = d?.parts.kind === 'report' ? d.parts.days : [];
  const fx = texts.fx40?.parts.kind === 'medium' ? texts.fx40.parts : null;
  const sea = fx?.seas.find((x) => x.sea === spot?.region) ?? null;
  const wodlAt = texts.wodl ? `Stand ${issued(texts.wodl)}` : texts.loading ? 'lädt' : 'nicht lesbar';
  return (
    <div className="sw-ar">
      <div className="sw-ar-statusrow">
        <StatusTile title={`Warnstatus ${coastName}`} status={c && !stale ? c.status : null}
          text={c?.text ?? ''} missing="Warnstatus derzeit unbekannt — es gibt keine lesbare, aktuelle Meldung. Das heißt nicht „keine Warnung“."
          meta={`${c?.nr ? `NR. ${c.nr} · ` : ''}${wodlAt}${stale ? ' · veraltet' : ''}${c?.issuedText ? ` · ${c.kind ? `${c.kind} · ` : ''}${c.issuedText}` : ''}`} />
        {spot?.seaArea && (
          <StatusTile title={`Warnstatus Seegebiet ${spot.seaArea.name}`} status={area && !stale ? area.status : null}
            text={area?.text ?? ''} missing="Für dieses Seegebiet ist keine Zeile der Warnmeldung lesbar — das heißt nicht „keine Warnung“."
            meta={`WODL45, englischer Teil · ${wodlAt}${stale ? ' · veraltet' : ''}`} />
        )}
      </div>

      <div className="sw-ar-grid">
        <section className="sw-card is-official sw-ar-card">
          <div className="sw-card-head"><span className="sw-eyebrow is-accent-dark">Küstenbericht</span><span className="sw-unit">wörtlich</span></div>
          <h4 className="sw-ar-title">{sec?.name ?? spot?.coast?.name ?? 'Küste'}</h4>
          <div className="sw-ar-meta">{texts.fq51 ? issued(texts.fq51) : texts.loading ? 'lädt' : 'nicht lesbar'}{texts.stale.FQDL51 ? ' · veraltet' : ''}</div>
          {sec ? <><BftChip wind={sec.wind} /><ReportRows a={sec} /></> : <p className="sw-note">Küstenbericht: {texts.loading ? 'lädt' : 'kein Abschnitt für diesen Spot lesbar'}</p>}
        </section>

        <section className="sw-card is-official sw-ar-card">
          <div className="sw-card-head"><span className="sw-eyebrow is-accent-dark">Seewetterbericht · Seegebiet</span><span className="sw-unit">Windstärke in Beaufort</span></div>
          <h4 className="sw-ar-title">{spot?.seaArea?.name ?? 'Seegebiet'}</h4>
          <div className="sw-ar-meta">{d ? `${d.heading} · herausgegeben vom Seewetterdienst Hamburg, ${dateTime(Date.parse(d.issuedAt))} (${utcHm(Date.parse(d.issuedAt))} UTC)` : texts.loading ? 'lädt …' : 'Seewetterbericht derzeit nicht lesbar'}{texts.stale.FQDL50 ? ' · veraltet' : ''}</div>
          {!id && <p className="sw-note">Dieser Spot liegt in keinem Seegebiet des Berichts (z. B. Haff) — siehe Küstenbericht.</p>}
          <div className="sw-ar-days">
            {days.map((day) => {
              const a = day.areas.find((x) => x.id === id);
              return a ? (
                <div key={day.label} className="sw-ar-day">
                  <div className="sw-ar-day-head"><span>{day.label}:</span><BftChip wind={a.wind} /></div>
                  <ReportRows a={a} />
                </div>
              ) : null;
            })}
          </div>
          {d && <details className="sw-details"><summary>Ganzen Bericht lesen (alle Gebiete, Wetterlage)</summary><pre className="sw-pre">{d.text}</pre></details>}
        </section>
      </div>

      <section className="sw-card is-cream sw-ar-card">
        <div className="sw-card-head"><span className="sw-eyebrow">Mittelfrist · {texts.fx40 ? `FXDL40 ${dateTime(Date.parse(texts.fx40.issuedAt))}` : texts.loading ? 'lädt' : 'nicht lesbar'}{texts.stale.FXDL40 ? ' · veraltet' : ''}</span><span className="sw-unit">wörtlich · Windstärke in Beaufort</span></div>
        {sea ? (
          <div className="sw-ar-mid">
            <ol className="sw-ar-timeline">
              {sea.days.map((x) => (
                <li key={x.label}><span className="sw-ar-tl-day">{x.label}:</span><span className="sw-ar-tl-tx">{numBold(x.text)}</span></li>
              ))}
            </ol>
            {sea.water.length > 0 && (
              <div className="sw-ar-water">
                <span className="sw-ar-k">Temperaturen Wasser</span>
                {sea.water.map((w) => (
                  <div key={w.part} className="sw-ar-wt"><span>{w.part}</span><strong>{w.min} bis {w.max} Grad</strong></div>
                ))}
              </div>
            )}
          </div>
        ) : <p className="sw-note">{texts.fx40 ? 'Kein Abschnitt für dieses Meer gefunden — ganzer Text unten.' : ''}</p>}
        {texts.fx40 && <details className="sw-details"><summary>Ganzen Mittelfrist-Bericht lesen</summary><pre className="sw-pre">{texts.fx40.text}</pre></details>}
      </section>

      <div className="sw-ar-grid">
        {texts.wodl && (
          <section className="sw-card is-official sw-ar-card">
            <div className="sw-eyebrow is-accent-dark">Starkwind-, Sturm- und Orkanwarnungen · {issued(texts.wodl)}</div>
            <details className="sw-details" open={warning.status === 'unknown'}><summary>Warnmeldung im Wortlaut (WODL45)</summary><pre className="sw-pre">{texts.wodl.text}</pre></details>
          </section>
        )}
        <section className="sw-card is-cream sw-ar-card">
          <div className="sw-eyebrow">Lesehilfe Beaufort</div>
          <div className="sw-ar-bftscale">
            {BFT_ROWS.map(([b, k, n]) => (
              <div key={b} className={`sw-ar-bftcell${b >= 8 ? ' is-hot' : ''}`} style={{ ['--b' as string]: b }}>
                <strong>{b}</strong><span>{k}</span><em>{n}</em>
              </div>
            ))}
          </div>
          <p className="sw-note">„Seegang“ im Bericht meint die signifikante Wellenhöhe; einzelne Wellen können fast doppelt so hoch sein.</p>
        </section>
      </div>
    </div>
  );
}

function SourcesTab({ spot, run, spotsDoc, texts, freshness, wl }: { spot: SeaSpot | null; run: SeaRunDoc | null; spotsDoc: SeaSpotsDoc | null; texts: SeaTexts; freshness: string; wl: SeaWaterLevel | null }) {
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
    [wl ? (wl.state === 'ok' ? 'amtlich' : wl.state === 'loading' ? 'lädt' : 'fehlt') : 'aus', 'Wasserstand-Vorhersage (BSH)',
      `erlaubt · ${WL_LICENCE} (EU High-Value-Dataset, ohne Registrierung, kommerziell nutzbar) · ausschließlich über die offizielle OGC API`
      + (!wl ? ' · mit ?wl=0 ausgeschaltet' : wl.state === 'ok' && wl.doc
        ? ` · Pegel ${wl.doc.name}${wl.km != null ? ` (${f1(wl.km)} km)` : ''}, Modellkurve ${wl.doc.curveAt == null ? 'ohne Stempel' : dateTime(wl.doc.curveAt)}`
        : wl.why ? ` · ${wl.why}` : ''),
      wl ? (wl.state === 'ok' ? 'ok' : 'off') : 'off'],
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
