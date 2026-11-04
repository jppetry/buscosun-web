/**
 * Wetter entlang der Strecke (`@nivo/line`, lazy geladen): drei Kurven übereinander mit derselben km-Achse statt einer
 * Grafik mit zwei Skalen. 1 Temperatur + gefühlt (gestrichelt, nur wenn merklich anders), 2 Niederschlag als Balken
 * (Farbe = Art, kräftig = Radar, blass = Modell), 3 Wind + Böen (gestrichelt).
 *
 * Ein Fadenkreuz läuft durch alle drei, die Zeile darüber nennt die Werte an der Stelle. Ein Klick oder Tipp setzt die
 * Position der Tour (dieselbe wie Scrubber und Karte). Der Export legt die drei Diagramme zu einem Bild zusammen.
 * Liefert null, wenn keine Wetter-Samples vorliegen.
 */

import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ResponsiveLine, type LineCustomSvgLayerProps, type LineSeries } from '@nivo/line';
import type { SampleETA } from './tourTiming';
import { exportSvgAsPng } from '../imageExport';
import { clock } from './tourUi';
import { ROUTE_CHART_COLOR as C, ROUTE_CHART_FONT, routeNivoTheme } from './routeNivoTheme';

interface Props {
  samples: SampleETA[];
  /** Gekoppelte Position der Tour (m): dieselbe wie Scrubber und Karte. */
  markerM?: number | null;
  onPickDist?: (distM: number) => void;
}

type PrecipType = 'rain' | 'sleet' | 'snow' | 'none';
interface Row {
  km: number; dist: number; etaMs: number;
  t: number | null; at: number | null;
  p: number; ptype: PrecipType; radar: boolean;
  w: number | null; g: number | null;
}
type L = LineCustomSvgLayerProps<LineSeries>;
type Scale = (v: number) => number;

const MARGIN_L = 40;
const MARGIN_R = 12;
const AXIS_H = 24;
const PANEL_H = 92;

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');
const PRECIP_COLOR: Record<PrecipType, string> = { rain: C.rain, sleet: C.sleet, snow: C.snow, none: C.rain };
const PRECIP_WORD: Record<PrecipType, string> = { rain: 'Regen', sleet: 'Schneeregen', snow: 'Schnee', none: 'Regen' };

/** Eine Linie mit Lücken: fehlende Werte werden nicht überbrückt. */
function polyPoints(rows: Row[], get: (r: Row) => number | null, X: Scale, Y: Scale): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (const r of rows) {
    const v = get(r);
    if (v == null) { if (cur.length) out.push(cur.join(' ')); cur = []; continue; }
    cur.push(`${X(r.km).toFixed(1)},${Y(v).toFixed(1)}`);
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

function Panel({ title, height, axis, totalKm, yMin, yMax, children, cursorKm, markerKm }: {
  title: string; height: number; axis: boolean; totalKm: number; yMin: number; yMax: number;
  children: (x: Scale, y: Scale, innerHeight: number, innerWidth: number) => ReactNode;
  cursorKm: number | null; markerKm: number | null;
}) {
  // nivo braucht eine Reihe für die Skalen; gezeichnet wird in der eigenen Ebene.
  const data: LineSeries[] = [{ id: title, data: [{ x: 0, y: yMin }, { x: totalKm, y: yMax }] }];
  const Marks = ({ xScale, yScale, innerHeight, innerWidth }: L) => <g>{children(xScale as Scale, yScale as Scale, innerHeight, innerWidth)}</g>;
  const Cursor = ({ xScale, innerHeight }: L) => {
    const X = xScale as Scale;
    return (
      <g pointerEvents="none">
        {markerKm != null && <line x1={X(markerKm)} x2={X(markerKm)} y1={0} y2={innerHeight} stroke={C.marker} strokeWidth={2} />}
        {cursorKm != null && <line x1={X(cursorKm)} x2={X(cursorKm)} y1={0} y2={innerHeight} stroke={C.cursor} strokeWidth={1} strokeDasharray="4 4" />}
      </g>
    );
  };
  return (
    <div className="wp-panel">
      <div className="wp-panel-title">{title}</div>
      <div className="wp-chart" style={{ height }}>
        <ResponsiveLine
          data={data}
          margin={{ top: 6, right: MARGIN_R, bottom: axis ? AXIS_H : 4, left: MARGIN_L }}
          xScale={{ type: 'linear', min: 0, max: totalKm }}
          yScale={{ type: 'linear', min: yMin, max: yMax }}
          enablePoints={false}
          enableGridX={false}
          gridYValues={3}
          axisLeft={{ tickValues: 3, tickSize: 0, tickPadding: 6 }}
          axisBottom={axis ? { tickValues: 6, tickSize: 0, tickPadding: 7, format: (v) => `${fmt1(Number(v))} km` } : null}
          theme={routeNivoTheme}
          animate={false}
          isInteractive={false}
          layers={['grid', 'axes', Marks, Cursor]}
        />
      </div>
    </div>
  );
}

export default function WeatherProfile({ samples, markerM = null, onPickDist }: Props) {
  const series = useMemo(() => buildSeries(samples), [samples]);
  const figRef = useRef<HTMLElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (!series) return null;

  const { rows, totalKm } = series;
  const idxAt = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left - MARGIN_L) / Math.max(1, r.width - MARGIN_L - MARGIN_R)));
    const km = frac * totalKm;
    let best = 0, bd = Infinity;
    rows.forEach((row, i) => { const d = Math.abs(row.km - km); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const i = idxAt(e.clientX, e.currentTarget);
    if (i !== hoverIdx) setHoverIdx(i);
  };
  const onPick = (e: ReactMouseEvent<HTMLDivElement>) => { onPickDist?.(rows[idxAt(e.clientX, e.currentTarget)].dist); };

  const markerKm = markerM != null ? markerM / 1000 : null;
  const cursorKm = hoverIdx != null ? rows[hoverIdx].km : null;
  let shownIdx = hoverIdx;
  if (shownIdx == null && markerKm != null) {
    let bd = Infinity;
    rows.forEach((row, i) => { const d = Math.abs(row.km - markerKm); if (d < bd) { bd = d; shownIdx = i; } });
  }
  const shown = shownIdx != null ? rows[shownIdx] : null;
  const panelProps = { totalKm, cursorKm, markerKm };

  const exportImage = () => {
    const charts = figRef.current ? Array.from(figRef.current.querySelectorAll<SVGSVGElement>('.wp-chart svg')) : [];
    const titles = figRef.current ? Array.from(figRef.current.querySelectorAll('.wp-panel-title')).map((t) => t.textContent ?? '') : [];
    if (!charts.length) return;
    const NS = 'http://www.w3.org/2000/svg';
    const width = charts[0].getBoundingClientRect().width;
    const out = document.createElementNS(NS, 'svg');
    let y = 0;
    charts.forEach((svg, i) => {
      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', String(MARGIN_L));
      label.setAttribute('y', String(y + 13));
      label.setAttribute('font-family', ROUTE_CHART_FONT);
      label.setAttribute('font-size', '12');
      label.setAttribute('font-weight', '600');
      label.setAttribute('fill', '#2C2A26');
      label.textContent = titles[i] ?? '';
      out.appendChild(label);
      y += 18;
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', `translate(0,${y})`);
      Array.from(svg.childNodes).forEach((n) => g.appendChild(n.cloneNode(true)));
      out.appendChild(g);
      y += svg.getBoundingClientRect().height + 6;
    });
    out.setAttribute('viewBox', `0 0 ${width} ${y}`);
    out.setAttribute('width', String(width));
    out.setAttribute('height', String(y));
    // Der Export liest berechnete Stile und braucht das Element deshalb kurz im Dokument.
    out.style.position = 'fixed';
    out.style.left = '-99999px';
    document.body.appendChild(out);
    void exportSvgAsPng(out, {
      filename: 'buscosun-wetterprofil.png',
      title: 'Wetter entlang der Strecke',
      subtitle: `${fmt1(totalKm)} km · Temperatur · Niederschlag · Wind`,
      source: 'buscosun · Quellen: DWD · GeoSphere · MeteoSwiss (höhenkorrigiert)',
    }).finally(() => out.remove());
  };

  const summary = `Wetter über ${fmt1(totalKm)} Kilometer: Temperatur ${series.tempRange ? `${Math.round(series.tempLo)} bis ${Math.round(series.tempHi)} °C` : 'unbekannt'}, höchste Niederschlagsrate ${fmt1(series.precipMax)} mm/h, stärkste Böen ${fmt1(series.windHi)} m/s.`;
  const tableRows = rows.filter((_, i) => i % Math.max(1, Math.ceil(rows.length / 12)) === 0);

  return (
    <figure className="wp-figure" ref={figRef}>
      <div className="wp-head">
        <figcaption>Wetter entlang der Strecke</figcaption>
        <button type="button" className="wp-export" title="Wetterprofil als Bild (PNG) herunterladen" onClick={exportImage}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7,10 12,15 17,10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Als Bild</span>
        </button>
      </div>

      {/* Ablesezeile: feste Höhe, damit die Kurven beim Überfahren nicht springen. */}
      <div className="wp-readout" aria-live="off">
        {shown ? (
          <>
            <span><b>km {fmt1(shown.km)}</b> um {clock(shown.etaMs)} Uhr</span>
            {shown.t != null && <span><b>{fmt1(shown.t)} °C</b>{shown.at != null && series.apparentDiffers ? ` gefühlt ${fmt1(shown.at)}` : ''}</span>}
            <span><b>{fmt1(shown.p)} mm/h</b>{shown.p > 0 ? ` ${PRECIP_WORD[shown.ptype]}, ${shown.radar ? 'Radar' : 'Modell'}` : ''}</span>
            {shown.w != null && <span><b>{fmt1(shown.w)} m/s</b>{shown.g != null ? ` Böen ${fmt1(shown.g)}` : ''}</span>}
          </>
        ) : <span>Zeig auf die Kurven, um die Werte abzulesen. Ein Klick setzt deine Position auf Karte und Höhenprofil.</span>}
      </div>

      <div className="wp-charts" role="img" aria-label={summary} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHoverIdx(null)} onClick={onPick}>
        <Panel title="Temperatur in °C" height={PANEL_H} axis={false} yMin={series.tempLo} yMax={series.tempHi} {...panelProps}>
          {(X, Y, h) => (
            <g fill="none" strokeLinejoin="round" strokeLinecap="round">
              {polyPoints(rows, (r) => r.t, X, Y).map((pts, i) => {
                const first = pts.split(' ')[0].split(',')[0], last = pts.split(' ').at(-1)!.split(',')[0];
                return <polygon key={`a${i}`} points={`${first},${h} ${pts} ${last},${h}`} fill={C.temp} opacity={0.1} stroke="none" />;
              })}
              {series.apparentDiffers && polyPoints(rows, (r) => r.at, X, Y).map((pts, i) => <polyline key={`g${i}`} points={pts} stroke={C.temp} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.8} />)}
              {polyPoints(rows, (r) => r.t, X, Y).map((pts, i) => <polyline key={`t${i}`} points={pts} stroke={C.temp} strokeWidth={2} />)}
            </g>
          )}
        </Panel>

        <Panel title="Niederschlag in mm/h" height={PANEL_H} axis={false} yMin={0} yMax={series.precipScale} {...panelProps}>
          {(X, Y, h, w) => (
            <g>
              {series.precipMax <= 0 && <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontFamily={ROUTE_CHART_FONT} fontSize={12} fill="#6F5E45">trocken auf der ganzen Strecke</text>}
              {rows.map((r, i) => {
                if (r.p <= 0) return null;
                const prev = i > 0 ? rows[i - 1].km : r.km, next = i + 1 < rows.length ? rows[i + 1].km : r.km;
                const halfKm = Math.min(next - r.km || Infinity, r.km - prev || Infinity) / 2;
                const barW = Number.isFinite(halfKm) ? Math.max(2, (X(r.km + halfKm) - X(r.km)) * 2 - 2) : 2;
                const top = Y(r.p);
                return <rect key={i} x={X(r.km) - barW / 2} y={top} width={barW} height={Math.max(1, h - top)} rx={Math.min(2, barW / 2)} fill={PRECIP_COLOR[r.ptype]} opacity={r.radar ? 1 : 0.55} />;
              })}
            </g>
          )}
        </Panel>

        <Panel title="Wind und Böen in m/s" height={PANEL_H + AXIS_H} axis yMin={0} yMax={series.windHi} {...panelProps}>
          {(X, Y) => (
            <g fill="none" strokeLinejoin="round" strokeLinecap="round">
              {polyPoints(rows, (r) => r.g, X, Y).map((pts, i) => <polyline key={`b${i}`} points={pts} stroke={C.gust} strokeWidth={1.5} strokeDasharray="4 4" />)}
              {polyPoints(rows, (r) => r.w, X, Y).map((pts, i) => <polyline key={`w${i}`} points={pts} stroke={C.wind} strokeWidth={2} />)}
            </g>
          )}
        </Panel>
      </div>

      <div className="wp-legend">
        <span><i className="wp-key" style={{ borderTopColor: C.temp }} /> Temperatur</span>
        {series.apparentDiffers && <span><i className="wp-key is-dashed" style={{ borderTopColor: C.temp }} /> Gefühlt</span>}
        {series.precipTypes.has('rain') && <span><i className="wp-key-bar" style={{ background: C.rain }} /> Regen</span>}
        {series.precipTypes.has('sleet') && <span><i className="wp-key-bar" style={{ background: C.sleet }} /> Schneeregen</span>}
        {series.precipTypes.has('snow') && <span><i className="wp-key-bar" style={{ background: C.snow }} /> Schnee</span>}
        {series.precipMax > 0 && <span>Kräftig: Radar, blass: Modell</span>}
        <span><i className="wp-key" style={{ borderTopColor: C.wind }} /> Wind</span>
        <span><i className="wp-key is-dashed" style={{ borderTopColor: C.gust }} /> Böen</span>
      </div>

      <table className="wp-sr">
        <caption>Wetter entlang der Strecke</caption>
        <thead><tr><th>km</th><th>Uhrzeit</th><th>Temperatur °C</th><th>Niederschlag mm/h</th><th>Wind m/s</th><th>Böen m/s</th></tr></thead>
        <tbody>
          {tableRows.map((r) => (
            <tr key={r.dist}><td>{fmt1(r.km)}</td><td>{clock(r.etaMs)}</td><td>{r.t != null ? fmt1(r.t) : '—'}</td><td>{fmt1(r.p)}</td><td>{r.w != null ? fmt1(r.w) : '—'}</td><td>{r.g != null ? fmt1(r.g) : '—'}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

// ---------------------------------------------------------------------------

function buildSeries(samples: SampleETA[]) {
  const withW = samples.filter((s) => s.weather != null);
  if (withW.length < 2) return null;
  const totalM = samples[samples.length - 1].dist;
  if (totalM <= 0) return null;

  const rows: Row[] = withW.map((s) => {
    const w = s.weather!;
    return {
      km: s.dist / 1000, dist: s.dist, etaMs: s.etaMs,
      t: w.temperatureC, at: w.apparentTempC,
      p: w.precipitationMmH ?? 0, ptype: w.precipitationType, radar: w.precipitationSource === 'radar',
      w: w.windSpeedMps, g: w.gustMps,
    };
  });

  const ts = rows.flatMap((r) => (r.t != null ? [r.t] : []));
  const tempRange = ts.length > 0;
  const lo = tempRange ? Math.min(...ts) : 0, hi = tempRange ? Math.max(...ts) : 1;
  const pad = Math.max(1, (hi - lo) * 0.1);

  // Gefühlte Temperatur nur zeigen, wenn sie merklich anders ist; sie darf die Skala mitbestimmen.
  const diff = rows.reduce((m, r) => (r.t != null && r.at != null ? Math.max(m, Math.abs(r.at - r.t)) : m), 0);
  const apparentDiffers = diff >= 1;
  const ats = apparentDiffers ? rows.flatMap((r) => (r.at != null ? [r.at] : [])) : [];

  const precipMax = rows.reduce((m, r) => Math.max(m, r.p), 0);
  const precipTypes = new Set<'rain' | 'sleet' | 'snow'>();
  for (const r of rows) if (r.p > 0 && r.ptype !== 'none') precipTypes.add(r.ptype);

  const winds = rows.flatMap((r) => [r.w, r.g].filter((v): v is number => v != null));

  return {
    rows, totalKm: totalM / 1000, tempRange, apparentDiffers,
    tempLo: Math.floor(Math.min(lo, ...ats) - pad), tempHi: Math.ceil(Math.max(hi, ...ats) + pad),
    precipMax, precipScale: Math.max(4, Math.ceil(precipMax * 1.2)), precipTypes,
    windHi: Math.max(2, Math.ceil(Math.max(0, ...winds) * 1.1)),
  };
}
