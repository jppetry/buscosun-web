/**
 * Phase BS — the dossier of a lake spot (`audit/seewetter-binnenseen.md`). A lake spot has no wave model, no official sea
 * weather report, no tide and no current: this component takes the place of `SeaReadout` for it and shows only what a
 * lake has — wind, gusts and band of buscosun Fusion, the estimated wind wave (our own computation), the official DWD
 * lake warning in its own words where the DWD issues one, the measurement of the station at the lake, water temperature
 * (measurement and model side by side, never mixed) and the level as information.
 *
 * Design (Command-Deck, skill `frontend-design`): one new mark, the FETCH ROSE — the lake as the wind sees it from this
 * spot, 36 spokes, the spoke the wind comes along drawn in petrol with its length in words. Everything else uses the
 * cards, tiles and the seam of the water temperature card that the page already has. No new colour, no motion.
 */
import type { ReactNode } from 'react';
import type { SeaSpot } from './seaContract';
import type { SeaPoiObs } from './seaClient';
import type { SeaReadoutHour } from './SeaReadout';
import { WindChart, type SeaChartHour } from './SeaCharts';
import { fmtWind, unitLabel, type SeaUnit } from './seaProfiles';
import { compass16, dateTime, dayShort, hh, hm } from './seaView';
import { BAND_LEGEND, BAND_NOTE, mostText } from './windBand';
import {
  ALPLAKES, BAFU_CREDIT, BAFU_PAGE, DWD_LAKE_WARN_CREDIT, LAKE_GUST_HINT_NOTE, LAKE_LINK_ONLY, LAKE_NO_WARNING, LAKE_VERDICT_OFF_NOTE, LAKE_WAVE_LABEL,
  WSV_CREDIT, WSV_PAGE, lakeGustHintText, type LakeWaterObs, type SeaLake,
} from './seaLakes';
import { LAKE_WAVE_SOURCE } from './lakeWave';
import { fetchKm, fetchRose, lakeGustAhead, lakeWaveAt, lakeWaveMax } from './lakeView';
import type { LakeWarnState } from './lakeWarn';

export interface LakeWaterView {
  /** Measured water temperature at the WSV gauge of the lake: `none` = no station near the spot. */
  wtObs: { state: 'none' } | { state: 'loading' | 'missing'; name: string; km: number } | { state: 'ok'; name: string; km: number; obs: LakeWaterObs };
  /** Modelled water temperature of the spot's basin (Alplakes): `none` = the model has no such lake. */
  wtModel: { state: 'none' } | { state: 'loading' } | { state: 'missing'; why: string } | { state: 'ok'; c: number | null; builtAt: string; next: { lo: number; hi: number } | null };
  /** Level: `none` = no gauge with a clear licence at this lake. */
  level: { state: 'none' } | { state: 'loading' | 'missing'; net: 'wsv' | 'bafu'; name: string; km: number } | { state: 'ok'; net: 'wsv' | 'bafu'; name: string; km: number; obs: LakeWaterObs };
}

interface Props {
  spot: SeaSpot; lake: SeaLake | null;
  hour: SeaReadoutHour | null; hours: readonly SeaReadoutHour[]; chartHours: readonly SeaChartHour[];
  unit: SeaUnit; nowMs: number; noData: string | null;
  windName: string; computedAt: string | null;
  /** Side of the wind to the shore at the chosen hour, in words (`null` = no direction). */
  shore: string | null;
  poi: SeaPoiObs | null | 'loading';
  warn: LakeWarnState;
  water: LakeWaterView;
  layout: 'aside' | 'dossier';
  head?: ReactNode; band?: ReactNode; chips?: ReactNode; sight?: ReactNode; onMap?: () => void;
}

const NET_NAME: Record<string, string> = { dwd10: 'DWD', dwdDay: 'DWD', tawes: 'GeoSphere Austria (TAWES)', smn: 'MeteoSchweiz (SwissMetNet)', smnp: 'MeteoSchweiz' };
const LAND_NAME: Record<string, string> = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', FR: 'Frankreich', IT: 'Italien', HU: 'Ungarn' };
const m1 = (x: number) => x.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const title = (s: string) => (s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s);

function Section({ title: t, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="sw-sec" aria-label={t}>
      <header className="sw-sec-head"><div className="sw-sec-tx"><h3>{t}</h3><p>{hint}</p></div></header>
      <div className="sw-sec-body">{children}</div>
    </section>
  );
}

/** The fetch rose: the distance over the water per wind direction, seen from the spot's water point. North is up. */
export function FetchRose({ fetch, windFrom, normal, size = 230 }: { fetch: readonly number[]; windFrom: number | null; normal: number; size?: number }) {
  const rose = fetchRose(fetch), c = size / 2, R = c - 26;
  const pt = (x: number, y: number) => `${(c + x * R).toFixed(1)},${(c - y * R).toFixed(1)}`;
  const poly = rose.pts.map((p) => pt(p.x, p.y)).join(' ');
  const along = windFrom == null ? null : (() => {
    const d = ((windFrom % 360) + 360) % 360 / 10, k = Math.floor(d), f = d - k;
    const m = fetch[k % 36] + (fetch[(k + 1) % 36] - fetch[k % 36]) * f, r = Math.sqrt(Math.max(0, m) / rose.max), a = (windFrom * Math.PI) / 180;
    return { m, x: Math.sin(a) * r, y: Math.cos(a) * r };
  })();
  const na = (normal * Math.PI) / 180;
  const label = along ? `Wind aus ${compass16(windFrom)}: ${fetchKm(along.m)} km über den See bis zum Spot. Längste Strecke ${fetchKm(rose.max)} km.` : `Keine Windrichtung für diese Stunde. Längste Strecke über den See ${fetchKm(rose.max)} km.`;
  return (
    <figure className="sw-lk-rose">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>
        <circle cx={c} cy={c} r={R} className="sw-lk-rose-ring" />
        <circle cx={c} cy={c} r={R * Math.SQRT1_2} className="sw-lk-rose-ring is-half" />
        <polygon points={poly} className="sw-lk-rose-water" />
        {rose.pts.map((p) => <line key={p.deg} x1={c} y1={c} x2={c + p.x * R} y2={c - p.y * R} className="sw-lk-rose-spoke" />)}
        <line x1={c} y1={c} x2={c + Math.sin(na) * R} y2={c - Math.cos(na) * R} className="sw-lk-rose-normal" />
        {along && <line x1={c + along.x * R} y1={c - along.y * R} x2={c} y2={c} className="sw-lk-rose-wind" />}
        {along && <circle cx={c + along.x * R} cy={c - along.y * R} r={4} className="sw-lk-rose-tip" />}
        <circle cx={c} cy={c} r={3.5} className="sw-lk-rose-spot" />
        <text x={c} y={13} textAnchor="middle" className="sw-lk-rose-n">N</text>
      </svg>
      <figcaption>
        <strong>{along ? `${fetchKm(along.m)} km Wasser in Windrichtung` : 'Windrichtung nicht bestimmt'}</strong>
        <span>Fläche = Strecke über den See je Windrichtung, vom Spot aus gesehen (Rand = {fetchKm(rose.max)} km, halber Ring = ein Viertel davon). Gestrichelt: wohin das Ufer zeigt.</span>
      </figcaption>
    </figure>
  );
}

function WarnCard({ warn, lake, nowMs }: { warn: LakeWarnState; lake: SeaLake | null; nowMs: number }) {
  const services = (lake?.service ?? []).map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.name}</a>);
  if (warn.kind === 'alerts') {
    return (
      <>
        {warn.alerts.map((a) => (
          <section key={a.id} className="sw-card is-warn sw-lk-warn" aria-label="Amtliche Warnung des Deutschen Wetterdienstes">
            <div className="sw-card-head"><span className="sw-lk-kind is-official">Amtliche Warnung des Deutschen Wetterdienstes, im Wortlaut</span><span className="sw-unit">{a.area}</span></div>
            <h4 className="sw-ar-title">{a.headline || a.event}</h4>
            <p className="sw-lk-when">{a.active ? 'gilt' : 'angekündigt'} {a.onsetMs != null ? `ab ${dateTime(a.onsetMs)} Uhr` : ''}{a.expiresMs != null ? ` bis ${dateTime(a.expiresMs)} Uhr` : ' ohne angegebenes Ende, bis zur Aufhebung'}</p>
            {a.description && <p className="sw-official">{a.description}</p>}
            {a.instruction && <p className="sw-official">{a.instruction}</p>}
            <p className="sw-official-meta">{a.sender || 'Deutscher Wetterdienst'}{a.sentMs != null ? `, ausgegeben ${dateTime(a.sentMs)} Uhr` : ''}. {DWD_LAKE_WARN_CREDIT}.</p>
          </section>
        ))}
      </>
    );
  }
  if (warn.kind === 'clear') {
    const cell = lake?.warncells.find((c) => c.id === warn.cell)?.name ?? 'diesen See';
    return (
      <section className="sw-card sw-ar-card sw-lk-warn" aria-label="Amtlicher Warnstatus">
        <div className="sw-card-head"><span className="sw-lk-kind is-official">Amtlicher Warnstatus</span><span className="sw-unit">Deutscher Wetterdienst</span></div>
        <h4 className="sw-ar-title">Keine Warnung für „{cell}“ in der Warndatei</h4>
        <p className="sw-note">Der Deutsche Wetterdienst gibt für dieses Gebiet Warnungen für Binnenseen heraus{warn.publishedMs != null ? `; die Datei von ${hm(warn.publishedMs)} Uhr nennt es nicht` : ''}. Erscheint eine, steht sie hier im Wortlaut. {services.length ? <>Verbindlich: {services.reduce<ReactNode[]>((acc, x, i) => (i ? [...acc, ', ', x] : [x]), [])}.</> : null}</p>
      </section>
    );
  }
  if (warn.kind === 'loading' || warn.kind === 'error') {
    return (
      <section className="sw-card sw-ar-card sw-lk-warn" aria-label="Amtlicher Warnstatus">
        <div className="sw-card-head"><span className="sw-lk-kind is-official">Amtlicher Warnstatus</span><span className="sw-unit">Deutscher Wetterdienst</span></div>
        <h4 className="sw-ar-title">{warn.kind === 'loading' ? 'Warndatei lädt' : 'Warnstatus nicht lesbar'}</h4>
        {warn.kind === 'error' && <p className="sw-note">{warn.why} {services.length ? <>Bitte direkt nachsehen: {services.reduce<ReactNode[]>((acc, x, i) => (i ? [...acc, ', ', x] : [x]), [])}.</> : null}</p>}
      </section>
    );
  }
  void nowMs;
  return (
    <section className="sw-card sw-ar-card sw-dk-nowarn sw-lk-warn" aria-label={LAKE_NO_WARNING}>
      <div className="sw-card-head"><span className="sw-lk-kind">Warnstatus</span><span className="sw-unit">{lake?.name ?? 'See'}</span></div>
      <h4 className="sw-ar-title">{LAKE_NO_WARNING}</h4>
      <p className="sw-note">Für diesen See liegt uns keine amtliche Warnung in maschinenlesbarer Form mit geklärter Lizenz vor. Das heißt nicht, dass es keine Warnung gibt. Zuständig: {services.length ? services.reduce<ReactNode[]>((acc, x, i) => (i ? [...acc, ', ', x] : [x]), []) : 'der Wetterdienst des Landes'}.</p>
    </section>
  );
}

export default function SeaLakeReadout(p: Props) {
  const s = p.spot, l = s.lake!, h = p.hour;
  const wave = h ? lakeWaveAt(l, h.windMs, h.windDir) : null;
  const waveMax = lakeWaveMax(l, p.hours);
  const gust = lakeGustAhead(p.hours, p.nowMs);
  const windMost = h ? mostText(h.windQ, p.unit) : null, gustMost = h ? mostText(h.gustQ, p.unit) : null;
  const hasBand = p.chartHours.some((c) => c.windBand || c.gustBand);
  const st = l.stations.wind;
  const lands = (p.lake?.lands ?? [l.land]).map((x) => LAND_NAME[x] ?? x).join(', ');
  const linkOnly = LAKE_LINK_ONLY.filter((x) => x.lakes.includes(l.id));
  const w = p.water;

  const headCard = (
    <section className="sw-card sw-ds-head" aria-label="Spot-Dossier · Kopf">
      <div className="sw-ds-headrow">
        <div className="sw-ds-headtx">
          <h2 className="sw-ds-title">{s.name}<span className="sw-badge sw-lk-badge">{p.lake?.name ?? 'See'}</span></h2>
          <div className="sw-ds-sub">{lands}, Seespiegel {Math.round(l.elevM)} m ü. M., mittlere Tiefe {l.depthM.toLocaleString('de-DE')} m. Ufer zeigt nach {compass16(s.normal)} ({s.normal}°).</div>
          <div className="sw-chip"><i />Wind {p.windName}{p.computedAt ? `, gerechnet ${hm(Date.parse(p.computedAt))} Uhr` : ''}, auf Höhe des Seespiegels{l.fusion.note ? ` (${l.fusion.note})` : ''}</div>
        </div>
        <div className="sw-ds-headside">
          {p.onMap && <button type="button" className="sw-link sw-ds-back" onClick={p.onMap}>Zur Karte</button>}
          {h && !p.noData && <div className="sw-ds-kpibar"><span className="sw-ds-kpibar-t">{dayShort(h.t)} {hh(h.t)} Uhr</span>{p.chips}</div>}
        </div>
      </div>
    </section>
  );

  const gustHint = gust && (
    <p className="sw-lk-gust" role="note">
      <strong>{lakeGustHintText(gust.cls)}</strong> {gust.t <= p.nowMs + 3_600_000 ? 'in dieser Stunde' : `ab ${dayShort(gust.t)} ${hh(gust.t)} Uhr`} am Spot ({LAKE_GUST_HINT_NOTE}).
    </p>
  );

  const now = (
    <div className="sw-ds-now sw-dash">
      {p.noData && <div className="sw-card sw-empty"><strong>Keine Daten.</strong> {p.noData}</div>}
      {!p.noData && h && (
        <>
          <div className="sw-kpis">
            <article className="sw-kpi">
              <span className="sw-kpi-l">Wind</span>
              <div className="sw-kpi-v"><strong>{h.windMs == null ? '–' : fmtWind(h.windMs, p.unit)}</strong>{h.windMs != null && <span>{unitLabel(p.unit)}</span>}</div>
              {windMost && <span className="sw-kpi-most">{windMost}</span>}
              <small>{h.windMs == null ? 'für diese Stunde nicht berechnet' : h.windDir == null ? 'Richtung für diese Stunde nicht bestimmt' : `aus ${compass16(h.windDir)}, ${Math.round(h.windDir)}°${p.shore ? `, ${p.shore}` : ''}`}</small>
            </article>
            <article className="sw-kpi">
              <span className="sw-kpi-l">Böen</span>
              <div className="sw-kpi-v"><strong>{h.gustMs == null ? '–' : fmtWind(h.gustMs, p.unit)}</strong>{h.gustMs != null && <span>{unitLabel(p.unit)}</span>}</div>
              {gustMost && <span className="sw-kpi-most">{gustMost}</span>}
              <small>{h.gustMs != null && h.windMs != null ? `${fmtWind(h.gustMs - h.windMs, p.unit)} ${unitLabel(p.unit)} über dem Mittel` : 'für diese Stunde nicht berechnet'}</small>
            </article>
            <article className="sw-kpi is-sea sw-lk-wave">
              <span className="sw-kpi-l">{LAKE_WAVE_LABEL}</span>
              <div className="sw-kpi-v"><strong>{wave ? `${wave.upper ? 'bis ' : ''}${m1(wave.hsM)}` : '–'}</strong>{wave && <span>m</span>}</div>
              <small>{!wave ? 'ohne Wind keine Schätzung' : wave.upper ? `höchstens, über die längste Strecke von ${fetchKm(wave.fetchM)} km gerechnet: die Windrichtung ist nicht bestimmt` : `Periode ${m1(wave.periodS)} s bei ${fetchKm(wave.fetchM)} km Wasser in Windrichtung`}</small>
            </article>
            {st && p.poi && p.poi !== 'loading' && (
              <article className="sw-kpi is-meas">
                <span className="sw-kpi-l">An Land gemessen</span>
                <div className="sw-kpi-v"><strong>{fmtWind(p.poi.ffMs, p.unit)}</strong><span>{unitLabel(p.unit)}</span></div>
                <small>aus {compass16(p.poi.ddDeg)}, Böen {fmtWind(p.poi.fxMs, p.unit)} {unitLabel(p.unit)}, {hm(p.poi.t)} Uhr</small>
              </article>
            )}
            {st && p.poi === null && (
              <article className="sw-kpi is-meas">
                <span className="sw-kpi-l">An Land gemessen</span>
                <div className="sw-kpi-v"><strong className="is-text">keine Messung</strong></div>
                <small>{title(st.name)}, {m1(st.km)} km: kein Wert der letzten 90 Minuten</small>
              </article>
            )}
            {!st && (
              <article className="sw-kpi is-meas">
                <span className="sw-kpi-l">An Land gemessen</span>
                <div className="sw-kpi-v"><strong className="is-text">keine Station in der Nähe</strong></div>
                <small>keine liefernde Station bis 25 km auf Höhe des Sees</small>
              </article>
            )}
          </div>
          {gustHint}
          <div className="sw-lk-wavebox">
            <FetchRose fetch={l.fetch} windFrom={h.windMs == null ? null : h.windDir} normal={s.normal} />
            <div className="sw-lk-wavetx">
              <p><strong>Die Windwelle ist geschätzt, nicht gemessen und nicht amtlich.</strong> Gerechnet aus dem Wind von buscosun Fusion, der Strecke über den See in Windrichtung und der mittleren Tiefe des Sees ({l.depthM.toLocaleString('de-DE')} m), für anhaltenden Wind. Hat der Wind gerade erst aufgefrischt, ist die Welle niedriger. Keine Dünung, keine Brandung am Ufer.</p>
              {waveMax && <p>Höchste Schätzung bis {dayShort(p.hours[p.hours.length - 1].t)} {hh(p.hours[p.hours.length - 1].t)} Uhr: {waveMax.wave.upper ? 'bis ' : ''}{m1(waveMax.wave.hsM)} m am {dayShort(waveMax.t)} um {hh(waveMax.t)} Uhr.</p>}
              <p className="sw-lk-src">Verfahren: <a href={LAKE_WAVE_SOURCE.url} target="_blank" rel="noreferrer">{LAKE_WAVE_SOURCE.title}</a>, Gleichungen {LAKE_WAVE_SOURCE.equations}.</p>
            </div>
          </div>
          <p className="sw-kpi-note">
            Wind {p.windName} am Wasserpunkt {Math.round(l.pt.km * 1000)} m vor dem Ufer{st && p.poi && p.poi !== 'loading' ? `. Messung: ${NET_NAME[st.net] ?? st.net}, Station ${title(st.name)}, ${m1(st.km)} km vom Spot${st.dElevM ? `, ${Math.abs(st.dElevM)} m ${st.dElevM > 0 ? 'über' : 'unter'} dem See` : ''} (10-min-Mittel, Böe der letzten 10 Minuten), an Land, nicht auf dem Wasser` : ''}.
            {(windMost || gustMost) && <span className="sw-su-note"> {BAND_NOTE}</span>}
          </p>
          <p className="sw-note">{LAKE_VERDICT_OFF_NOTE}</p>
        </>
      )}
    </div>
  );

  const chart = !p.noData && p.chartHours.length > 1 && (
    <section className="sw-card sw-chartpanel" aria-label="Verlauf Wind">
      <header className="sw-chartpanel-h">
        <div><span className="sw-tile-h"><span>Verlauf</span><em>bis {dayShort(p.chartHours[p.chartHours.length - 1].t)} {hh(p.chartHours[p.chartHours.length - 1].t)} Uhr</em></span><span className="sw-unit">Wind {p.windName}</span></div>
        <div className="sw-chartpanel-leg">
          <span><i style={{ background: '#2C2A26' }} />Wind</span><span><i className="is-band" />Böen-Band</span>
          {hasBand && <span className="sw-su-leg" title={BAND_NOTE}><i className="is-most is-wind" /><i className="is-most is-gust" />Wind und Böen meist ({BAND_LEGEND})</span>}
        </div>
      </header>
      <div className="sw-chartpanel-p"><span className="sw-chartpanel-l">Wind in kn</span><WindChart hours={p.chartHours} selMs={h?.t ?? p.chartHours[0].t} limitKn={null} limitLabel="" big={p.layout === 'dossier'} /></div>
    </section>
  );

  const waterCard = (
    <section className="sw-card sw-wt sw-lk-water" aria-label="Wassertemperatur">
      <div className="sw-wt-pair">
        <div className="sw-wt-half">
          <span className="sw-wt-kind">Gemessen</span>
          {w.wtObs.state === 'ok' ? <span className="sw-wt-val">{m1(w.wtObs.obs.value)}<span>°C</span></span>
            : <span className="sw-wt-val is-text">{w.wtObs.state === 'none' ? 'keine Station in der Nähe' : w.wtObs.state === 'loading' ? 'lädt' : 'keine Messung'}</span>}
          {w.wtObs.state === 'none' ? <p className="sw-wt-where">Am See misst keine Station mit geklärter Lizenz die Wassertemperatur. Das Modell steht nicht an ihrer Stelle.</p>
            : <p className="sw-wt-where">WSV-Pegel {w.wtObs.name}, {m1(w.wtObs.km)} km vom Spot{w.wtObs.state === 'ok' ? `, gemessen ${hm(w.wtObs.obs.t)} Uhr` : w.wtObs.state === 'missing' ? ': kein Wert der letzten drei Stunden' : ''}</p>}
          {w.wtObs.state !== 'none' && <p className="sw-wt-src">{WSV_CREDIT}</p>}
        </div>
        <div className="sw-wt-half is-model">
          <span className="sw-wt-kind">Modell</span>
          {w.wtModel.state === 'ok' && w.wtModel.c != null ? <span className="sw-wt-val">{m1(w.wtModel.c)}<span>°C</span></span>
            : <span className="sw-wt-val is-text">{w.wtModel.state === 'none' ? 'kein Modell für diesen See' : w.wtModel.state === 'loading' ? 'lädt' : 'keine Daten'}</span>}
          {w.wtModel.state === 'ok' && <p className="sw-wt-where">Für das ganze Becken in 1 m Tiefe gerechnet, kein Wert am Ufer. {w.wtModel.c == null ? 'Für die gewählte Stunde trägt die Rechnung keinen Wert. ' : ''}{w.wtModel.next ? `In den nächsten Tagen ${m1(w.wtModel.next.lo)} bis ${m1(w.wtModel.next.hi)} °C.` : ''}</p>}
          {w.wtModel.state === 'missing' && <p className="sw-wt-where">{w.wtModel.why}</p>}
          {w.wtModel.state === 'none' && <p className="sw-wt-where">Das Seenmodell Alplakes rechnet diesen See nicht.</p>}
          {w.wtModel.state !== 'none' && <p className="sw-wt-src"><a href={ALPLAKES.page} target="_blank" rel="noreferrer">{ALPLAKES.model}</a>, <a href={ALPLAKES.licenceUrl} target="_blank" rel="noreferrer">{ALPLAKES.licence}</a>, eigene Darstellung{w.wtModel.state === 'ok' ? `, Stand ${dateTime(Date.parse(w.wtModel.builtAt))} Uhr` : ''}</p>}
        </div>
      </div>
    </section>
  );
  const levelCard = (
    <section className="sw-card sw-lk-level" aria-label="Wasserstand">
      <span className="sw-wt-kind">Wasserstand, zur Auskunft</span>
      {w.level.state === 'none' ? <p className="sw-lk-levelv is-text">kein Pegel mit geklärter Lizenz an diesem See</p>
        : w.level.state === 'ok' ? <p className="sw-lk-levelv">{w.level.net === 'wsv' ? `${Math.round(w.level.obs.value)} cm über Pegelnull` : `${w.level.obs.value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m ü. M.`}</p>
          : <p className="sw-lk-levelv is-text">{w.level.state === 'loading' ? 'lädt' : 'keine Messung'}</p>}
      {w.level.state !== 'none' && <p className="sw-wt-where">{w.level.net === 'wsv' ? 'WSV-Pegel' : 'BAFU-Station'} {w.level.name}, {m1(w.level.km)} km vom Spot{w.level.state === 'ok' ? `, gemessen ${hm(w.level.obs.t)} Uhr` : w.level.state === 'missing' ? ': kein Wert der letzten drei Stunden' : ''}. Ein See hat keinen Gezeitenverlauf: gezeigt wird nur der gemessene Stand, keine Vorhersage.</p>}
      {w.level.state !== 'none' && <p className="sw-wt-src">{w.level.net === 'wsv' ? <a href={WSV_PAGE} target="_blank" rel="noreferrer">{WSV_CREDIT}</a> : <a href={BAFU_PAGE} target="_blank" rel="noreferrer">{BAFU_CREDIT}</a>}</p>}
      {linkOnly.length > 0 && <p className="sw-note">Nur verlinkt, nicht eingebunden (kein dokumentierter Abruf oder keine geklärte Lizenz): {linkOnly.map((x, i) => <span key={x.url}>{i ? ', ' : ''}<a href={x.url} target="_blank" rel="noreferrer">{x.name}</a> ({x.what})</span>)}.</p>}
    </section>
  );

  const sources = (
    <section className="sw-card sw-lk-sources" aria-label="Quellen dieses Sees">
      <ul>
        <li><strong>Wind, Böen, Spanne, Hinweise</strong> buscosun Fusion auf dem Punkt-Cube, am Wasserpunkt des Spots, auf Höhe des Seespiegels ({Math.round(l.elevM)} m), mit den Landesparametern für {LAND_NAME[l.fusion.country]}.</li>
        <li><strong>Windwelle</strong> eigene Schätzung nach dem {LAKE_WAVE_SOURCE.title} ({LAKE_WAVE_SOURCE.by}); Fetch aus dem Umriss, mittlere Tiefe aus <a href={l.depthFrom} target="_blank" rel="noreferrer">der genannten Quelle</a>.</li>
        <li><strong>Umriss des Sees</strong> {p.lake?.outline.credit ?? '–'}</li>
        <li><strong>Warnungen</strong> {l.warncell ? `${DWD_LAKE_WARN_CREDIT}; Warnzelle „${l.warncell.name}“` : 'keine amtliche Quelle im Datenbestand, nur der Link zum zuständigen Dienst'}</li>
        {st && <li><strong>Messung Wind</strong> {NET_NAME[st.net] ?? st.net}, Station {title(st.name)}, über den Datenspeicher von buscosun (obs/v1)</li>}
        {w.wtObs.state !== 'none' && <li><strong>Wassertemperatur gemessen</strong> {WSV_CREDIT}</li>}
        {w.wtModel.state !== 'none' && <li><strong>Wassertemperatur Modell</strong> {ALPLAKES.credit}</li>}
        {w.level.state !== 'none' && <li><strong>Wasserstand</strong> {w.level.net === 'wsv' ? WSV_CREDIT : BAFU_CREDIT}</li>}
      </ul>
    </section>
  );
  const disclaimer = <p className="sw-disclaimer">Kein amtliches Warnprodukt. Die Schätzung der Windwelle und der Böenhinweis ersetzen keine amtliche Warnung und keine eigene Beobachtung; die Entscheidung bleibt bei dir.</p>;

  return (
    <div className={p.layout === 'dossier' ? 'sw-ds sw-lk' : 'sw-readout sw-lk'} aria-label="Spot-Dossier">
      {p.head}
      {headCard}
      <WarnCard warn={p.warn} lake={p.lake} nowMs={p.nowMs} />
      <Section title="Wind und Windwelle" hint="Die gewählte Stunde; die Welle ist eine eigene Schätzung">{now}</Section>
      {(chart || p.band) && <Section title="Verlauf und Stundenband" hint="Eine Stunde im Band wählen setzt Karte und Werte auf diese Zeit">{chart}{p.band}</Section>}
      {p.sight && <Section title="Sicht, Schauer und Gewitter" hint="Als Hinweis aus Modellwerten">{p.sight}</Section>}
      <Section title="Wasser" hint="Temperatur gemessen und gerechnet, getrennt; der Wasserstand zur Auskunft">{waterCard}{levelCard}</Section>
      <Section title="Quellen dieses Sees" hint="Nur was an diesem Spot verwendet wird">{sources}</Section>
      {disclaimer}
    </div>
  );
}
