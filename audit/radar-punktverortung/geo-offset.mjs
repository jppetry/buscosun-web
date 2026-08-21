// Misst den Versatz zwischen der Karten-Verortung (projektionskorrekt, Warp-Mesh)
// und der Punkt-Abtastung (quadSampler, 4-Eck-Bilinear) auf dem DE1200-Gitter.
import { inverseBilinear } from 'file:///C:/dev/buscosun-web/src/pointForecast/quadSampler.ts';

const DE1200_CORNERS = [
  [1.46330151, 55.86208711],   // NW
  [18.73161645, 55.84543856],  // NE
  [16.58086935, 45.68460578],  // SE
  [3.566994635, 45.69642538],  // SW
];
const W = 1100, H = 1200;

// --- exakte polar-stereografische Projektion (identisch zu src/sources/radolan.ts)
const PS_A = 6378137, PS_E = 0.081819190842622;
const PS_LON0 = 10 * Math.PI / 180, PS_PHIC = 60 * Math.PI / 180;
const psT = (phi) => { const es = PS_E * Math.sin(phi); return Math.tan(Math.PI/4 - phi/2) * Math.pow((1+es)/(1-es), PS_E/2); };
const psM = (phi) => Math.cos(phi) / Math.sqrt(1 - PS_E*PS_E*Math.sin(phi)*Math.sin(phi));
const PS_TC = psT(PS_PHIC), PS_MC = psM(PS_PHIC);
function psFwd(lonDeg, latDeg) {
  const phi = latDeg*Math.PI/180, lam = lonDeg*Math.PI/180;
  const rho = PS_A * PS_MC * psT(phi) / PS_TC;
  return [rho*Math.sin(lam-PS_LON0), -rho*Math.cos(lam-PS_LON0)];
}
const P = DE1200_CORNERS.map(([lo,la]) => psFwd(lo,la));
const [pNW,pNE,pSE,pSW] = P;
console.log('PS-Ecken (m):', P.map(p=>p.map(v=>Math.round(v))));
console.log('achsenparallel? dx(NW,SW)=', (pNW[0]-pSW[0]).toFixed(1), ' dy(NW,NE)=', (pNW[1]-pNE[1]).toFixed(1));

// exakte (u,v) im PS-Raster (Gitter ist in PS regulär/achsenparallel)
const x0 = pNW[0], x1 = pNE[0], y0 = pNW[1], y1 = pSW[1];
function exactUV(lat, lon) {
  const [x,y] = psFwd(lon, lat);
  return { u: (x-x0)/(x1-x0), v: (y-y0)/(y1-y0) };
}
// Entfernung zweier lat/lon-Punkte (m)
function distM(la1,lo1,la2,lo2){
  const R=6371008.8, p=Math.PI/180;
  const dla=(la2-la1)*p, dlo=(lo2-lo1)*p, m=(la1+la2)/2*p;
  return Math.hypot(dla*R, dlo*R*Math.cos(m));
}
// zurück von (u,v) auf lat/lon der EXAKTEN Gitterzelle
function psInv(x,y){
  const rho=Math.hypot(x,y), t=rho*PS_TC/(PS_A*PS_MC);
  let phi=Math.PI/2-2*Math.atan(t);
  for(let i=0;i<8;i++){const es=PS_E*Math.sin(phi); phi=Math.PI/2-2*Math.atan(t*Math.pow((1-es)/(1+es),PS_E/2));}
  return [(PS_LON0+Math.atan2(x,-y))*180/Math.PI, phi*180/Math.PI];
}
function uvToLonLat(u,v){ return psInv(x0+u*(x1-x0), y0+v*(y1-y0)); }

const places = [
  ['Hamburg', 53.5511, 9.9937], ['Berlin', 52.5200, 13.4050], ['Köln', 50.9375, 6.9603],
  ['Frankfurt', 50.1109, 8.6821], ['München', 48.1351, 11.5820], ['Stuttgart', 48.7758, 9.1829],
  ['Leipzig', 51.3397, 12.3731], ['Dresden', 51.0504, 13.7373], ['Hannover', 52.3759, 9.7320],
  ['Nürnberg', 49.4521, 11.0767], ['Bremen', 53.0793, 8.8017], ['Kiel', 54.3233, 10.1228],
  ['Saarbrücken', 49.2402, 6.9969], ['Rostock', 54.0924, 12.0991], ['Freiburg', 47.9990, 7.8421],
  ['Passau', 48.5667, 13.4319], ['Aachen', 50.7753, 6.0839], ['Görlitz', 51.1520, 14.9884],
  ['Flensburg', 54.7937, 9.4470], ['Konstanz', 47.6603, 9.1758],
];

console.log('\nOrt              | exakt(col,row) | Sampler(col,row) | Δcol  Δrow | Versatz km | Richtung');
console.log('-----------------|----------------|------------------|------------|------------|---------');
let max = 0, maxName = '';
const rows = [];
for (const [name, lat, lon] of places) {
  const e = exactUV(lat, lon);
  const b = inverseBilinear(DE1200_CORNERS, lat, lon);
  if (!b) { console.log(name, 'außerhalb'); continue; }
  const ec = [e.u*(W-1), e.v*(H-1)], bc = [b.u*(W-1), b.v*(H-1)];
  // wo liegt die vom Sampler getroffene Zelle geographisch wirklich?
  const [slon, slat] = uvToLonLat(b.u, b.v);
  const d = distM(lat, lon, slat, slon)/1000;
  const dir = (slat>lat?'N':'S') + (slon>lon?'O':'W');
  rows.push({name, d});
  if (d > max) { max = d; maxName = name; }
  console.log(
    name.padEnd(16), '|',
    `${ec[0].toFixed(0).padStart(4)},${ec[1].toFixed(0).padStart(5)}`.padEnd(14), '|',
    `${bc[0].toFixed(0).padStart(4)},${bc[1].toFixed(0).padStart(5)}`.padEnd(16), '|',
    `${(bc[0]-ec[0]).toFixed(1).padStart(5)} ${(bc[1]-ec[1]).toFixed(1).padStart(5)}`, '|',
    d.toFixed(1).padStart(9), ' |', dir,
  );
}
rows.sort((a,b)=>b.d-a.d);
console.log('\nMax:', maxName, max.toFixed(1), 'km · Median', rows[Math.floor(rows.length/2)].d.toFixed(1), 'km · Mittel', (rows.reduce((s,r)=>s+r.d,0)/rows.length).toFixed(1), 'km');
