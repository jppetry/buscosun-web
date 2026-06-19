// Generiert realistische GPX-Testrouten innerhalb DACH (für die E2E-Wetter-Verifikation).
// Punkte werden linear zwischen Stützpunkten interpoliert; Höhe ebenfalls (plausibles Profil).
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('.', import.meta.url), { recursive: true });

/** @param {{name:string, file:string, country:string, wp:[number,number,number][], perLeg?:number}} cfg */
function gpx(cfg) {
  const per = cfg.perLeg ?? 40;
  const pts = [];
  for (let i = 0; i < cfg.wp.length - 1; i++) {
    const [la, lo, ea] = cfg.wp[i];
    const [lb, lob, eb] = cfg.wp[i + 1];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      pts.push([la + (lb - la) * t, lo + (lob - lo) * t, ea + (eb - ea) * t]);
    }
  }
  pts.push(cfg.wp[cfg.wp.length - 1]);
  const trkpts = pts
    .map(([la, lo, e]) => `      <trkpt lat="${la.toFixed(6)}" lon="${lo.toFixed(6)}"><ele>${e.toFixed(1)}</ele></trkpt>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="buscosun-test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${cfg.name}</name></metadata>
  <trk><name>${cfg.name}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>
`;
  writeFileSync(new URL(cfg.file, import.meta.url), xml);
  // grobe Länge
  let dist = 0;
  for (let i = 1; i < pts.length; i++) {
    const R = 6371000, toR = (d) => d * Math.PI / 180;
    const dLat = toR(pts[i][0] - pts[i - 1][0]), dLon = toR(pts[i][1] - pts[i - 1][1]);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(pts[i][0])) * Math.cos(toR(pts[i - 1][0])) * Math.sin(dLon / 2) ** 2;
    dist += 2 * R * Math.asin(Math.sqrt(a));
  }
  console.log(`${cfg.file}: ${pts.length} pts, ~${(dist / 1000).toFixed(1)} km, ${cfg.country}, ele ${Math.min(...pts.map(p=>p[2])).toFixed(0)}–${Math.max(...pts.map(p=>p[2])).toFixed(0)} m`);
}

// 1) AT-alpin: Innsbruck (Inntal) → Igls → Patscherkofel-Gipfel. Großer Anstieg.
gpx({ name: 'Innsbruck–Patscherkofel', file: 'at-alpine-patscherkofel.gpx', country: 'AT',
  wp: [[47.2654, 11.3927, 574], [47.2370, 11.4090, 870], [47.2290, 11.4170, 1180], [47.2150, 11.4540, 1750], [47.2079, 11.4610, 2246]] });

// 2) DE-flach: Berlin Mitte → Tempelhofer Feld → Süden. Flach.
gpx({ name: 'Berlin Flachrunde', file: 'de-flat-berlin.gpx', country: 'DE',
  wp: [[52.5200, 13.4050, 38], [52.4990, 13.4030, 40], [52.4730, 13.4020, 48], [52.4550, 13.4010, 45], [52.4400, 13.4000, 42]] });

// 3) CH-alpin: Grindelwald → Kleine Scheidegg. Anstieg, Hochgebirge.
gpx({ name: 'Grindelwald–Kleine Scheidegg', file: 'ch-alpine-scheidegg.gpx', country: 'CH',
  wp: [[46.6240, 8.0340, 1034], [46.6080, 8.0090, 1380], [46.5950, 7.9800, 1750], [46.5850, 7.9620, 2061]] });

// 4) DE-hügelig: Freiburg → Schauinsland (Schwarzwald). Mittelgebirgs-Anstieg.
gpx({ name: 'Freiburg–Schauinsland', file: 'de-hilly-schauinsland.gpx', country: 'DE',
  wp: [[47.9950, 7.8490, 278], [47.9700, 7.8650, 480], [47.9450, 7.8800, 820], [47.9240, 7.8930, 1100], [47.9140, 7.8970, 1284]] });
