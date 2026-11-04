/** nivo theme of the route planner charts: recessive grid and axes on the deck's panel colour. */
export const ROUTE_CHART_FONT = "'League Spartan', system-ui, sans-serif";

export const routeNivoTheme = {
  text: { fontFamily: ROUTE_CHART_FONT, fontSize: 11, fill: '#6F5E45' },
  axis: {
    domain: { line: { stroke: 'transparent', strokeWidth: 0 } },
    ticks: { line: { stroke: 'transparent', strokeWidth: 0 }, text: { fontFamily: ROUTE_CHART_FONT, fontSize: 11, fill: '#6F5E45' } },
  },
  grid: { line: { stroke: '#E0D6BE', strokeWidth: 1 } },
  crosshair: { line: { stroke: '#2C2A26', strokeWidth: 1, strokeOpacity: 0.5, strokeDasharray: '4 4' } },
};

export const ROUTE_CHART_COLOR = {
  temp: '#A85E2E',
  rain: '#3A6FA8',
  sleet: '#B8862F',
  snow: '#1E9AA8',
  wind: '#3A6FA8',
  gust: '#A85E2E',
  cursor: '#2C2A26',
  marker: '#C97B47',
} as const;
