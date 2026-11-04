/**
 * Elevation profile of the preview stage (`@nivo/line`), loaded lazily. A track can hold 100 000 points, so the
 * line is thinned to at most MAX_POINTS; hovering or touching reads kilometre and height at that spot.
 */
import { useMemo } from 'react';
import { ResponsiveLine, type LineCustomSvgLayerProps, type LineSeries } from '@nivo/line';
import type { TourPoint } from './tourTrack';
import { ROUTE_CHART_COLOR, routeNivoTheme } from './routeNivoTheme';

const MAX_POINTS = 400;
const nn = (n: number) => Math.round(n).toLocaleString('de-DE');
const km1 = (n: number) => n.toFixed(1).replace('.', ',');

type L = LineCustomSvgLayerProps<LineSeries>;

/** Start and goal on the line: a ringed dot each, so they stay readable over the area. */
function Ends({ series, xScale, yScale }: L) {
  const pts = series[0]?.data ?? [];
  if (pts.length < 2) return null;
  const X = xScale as (v: number) => number, Y = yScale as (v: number) => number;
  const a = pts[0].data, b = pts[pts.length - 1].data;
  return (
    <g stroke="#FAF6EA" strokeWidth={2}>
      <circle cx={X(a.x as number)} cy={Y(a.y as number)} r={5} fill="var(--sage-600, #5F7A4C)" />
      <circle cx={X(b.x as number)} cy={Y(b.y as number)} r={5} fill="var(--rd-red, #A8431F)" />
    </g>
  );
}

export default function RouteElevationChart({ points }: { points: TourPoint[] }) {
  const { data, lo, hi, totalKm } = useMemo(() => {
    const step = Math.max(1, Math.ceil(points.length / MAX_POINTS));
    const rows = points.filter((_, i) => i % step === 0 || i === points.length - 1)
      .map((p) => ({ x: p.dist / 1000, y: Math.round(p.ele) }));
    const ys = rows.map((r) => r.y);
    const min = Math.min(...ys), max = Math.max(...ys);
    const pad = Math.max(5, (max - min) * 0.08);
    return { data: [{ id: 'Höhe', data: rows }] as LineSeries[], lo: Math.floor(min - pad), hi: Math.ceil(max + pad), totalKm: rows[rows.length - 1]?.x ?? 0 };
  }, [points]);

  return (
    <ResponsiveLine
      data={data}
      margin={{ top: 12, right: 16, bottom: 28, left: 50 }}
      xScale={{ type: 'linear', min: 0, max: totalKm }}
      yScale={{ type: 'linear', min: lo, max: hi }}
      curve="monotoneX"
      colors={[ROUTE_CHART_COLOR.temp]}
      lineWidth={2}
      enableArea
      areaBaselineValue={lo}
      areaOpacity={0.14}
      enablePoints={false}
      enableGridX={false}
      gridYValues={4}
      axisLeft={{ tickValues: 4, tickSize: 0, tickPadding: 8, format: (v) => `${nn(Number(v))} m` }}
      axisBottom={{ tickValues: 6, tickSize: 0, tickPadding: 8, format: (v) => `${km1(Number(v))} km` }}
      theme={routeNivoTheme}
      animate={false}
      useMesh
      enableCrosshair
      crosshairType="x"
      tooltip={({ point }) => (
        <div className="rd-chart-tip"><b>{nn(Number(point.data.y))} m</b> bei km {km1(Number(point.data.x))}</div>
      )}
      layers={['grid', 'axes', 'areas', 'crosshair', 'lines', Ends, 'mesh']}
    />
  );
}
