/** Sonde EZ0: Wie stark unterscheidet sich der Punktforecast innerhalb einer Zone? */
import { getPointForecast } from '../../src/pointForecast/pointForecast.ts';

const CASES = [
  { name: 'Flach · Berlin-Tempelhofer Feld (1,5 km)', lat: 52.4735, lon: 13.4030, km: 1.5, country: 'DE' },
  { name: 'Flach · Lueneburger Heide (8 km)', lat: 53.1670, lon: 10.0000, km: 8, country: 'DE' },
  { name: 'Alpin · Zell am See (6 km)', lat: 47.3230, lon: 12.7980, km: 6, country: 'AT' },
];

const R = 6371;
const off = (lat, lon, brg, d) => {
  const dr = d / R, t = brg * Math.PI / 180, p1 = lat * Math.PI / 180, l1 = lon * Math.PI / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2));
  return [p2 * 180 / Math.PI, ((l2 * 180 / Math.PI + 540) % 360) - 180];
};

for (const c of CASES) {
  const half = c.km / 2 * Math.SQRT2;
  const pts = [['Mitte', c.lat, c.lon], ...[45, 135, 225, 315].map((b, i) => {
    const [la, lo] = off(c.lat, c.lon, b, half);
    return [['NO', 'SO', 'SW', 'NW'][i], la, lo];
  })];
  const rows = [];
  for (const [tag, la, lo] of pts) {
    try {
      const f = await getPointForecast({ lat: la, lng: lo, country: c.country, hours: 30 });
      const h = f.hours.filter((x) => x.temperature != null).slice(0, 30);
      const t = h.map((x) => x.temperature);
      const p = h.map((x) => x.precipitation ?? 0);
      const w = h.map((x) => x.gustSpeed ?? x.windSpeed ?? 0);
      rows.push({ tag, elev: f.query.elevation ?? null, stations: f.nearestStations.slice(0,2).map((s2)=>`${s2.source}@${Math.round(s2.distanceMeters/100)/10}km`).join(','),
        tMax: Math.max(...t), tMean: t.reduce((a, b) => a + b, 0) / t.length,
        pSum: p.reduce((a, b) => a + b, 0), wMax: Math.max(...w) });
    } catch (e) { rows.push({ tag, err: String(e).slice(0, 80) }); }
  }
  console.log('\n### ' + c.name);
  for (const r of rows) console.log(r.err ? `${r.tag}: FEHLER ${r.err}` : `${r.tag.padEnd(6)} h=${String(r.elev).padStart(6)} m  Tmean=${r.tMean.toFixed(2)}  Tmax=${r.tMax.toFixed(2)}  Regen30h=${r.pSum.toFixed(2)}mm  Boeemax=${r.wMax.toFixed(2)}  ${r.stations}`);
  const ok = rows.filter((r) => !r.err);
  if (ok.length > 1) {
    const sp = (k) => (Math.max(...ok.map((r) => r[k])) - Math.min(...ok.map((r) => r[k]))).toFixed(2);
    console.log(`SPANNE  Tmean ${sp('tMean')} K · Tmax ${sp('tMax')} K · Regen ${sp('pSum')} mm · Boee ${sp('wMax')} m/s`);
  }
}
