/**
 * Vorlagen-Fixture (Phase DB, audit/dashboard.md §5.7) — NUR Entwicklungsmodus (`?dbfixture=vorlage`), im
 * Produktions-Bau nicht enthalten (Zweig hinter `import.meta.env.DEV`, per Textsonde am `dist/` geprüft).
 *
 * Trägt die Zahlen aus reference/dashboard.dc.html (Garmisch-Partenkirchen, Mi 16.09. 14:07, Zustand „3 Tage") durch
 * dieselben Kacheln, damit der Pixel-Diff die DARSTELLUNG misst, nicht das Wetter von heute. Wo die freigegebenen
 * Entscheidungen die Vorlage ändern (Komma statt Punkt, wahre Quellennamen, „n. v." statt erfundener Werte, Band
 * p10–p90, echte Zeitachse), folgt die Fixture der Entscheidung — die Abweichung ist gewollt und im Bericht benannt.
 */
import { FOOTER, hourAxis } from './model/build';
import { isothermColor } from './model/rules';
import type { DashboardVM, HourPoint, Shown } from './model/types';
import type { ParamId } from './origin';

const H = 3_600_000;
const NB = ' ';
const s = (o: ParamId, t: string): Shown => ({ t, o });
const na = (o: ParamId, why: string): Shown => ({ t: null, o, na: why });
/** Mi 16.09.2026 14:07 MESZ. */
const NOW = Date.UTC(2026, 8, 16, 12, 7);
const START = Date.UTC(2026, 8, 16, 12, 0);

/** Polylinie der Vorlage (x 0…1330, y 0…178) → Wert je Stunde über 72 h, Wertmaßstab 5 px/°C ab y = 130. */
function fromPolyline(pts: Array<[number, number]>): number[] {
  const out: number[] = [];
  for (let h = 0; h <= 72; h++) {
    const x = (h / 72) * 1330;
    let i = 0;
    while (i < pts.length - 2 && pts[i + 1][0] < x) i++;
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const y = y0 + ((y1 - y0) * (x - x0)) / Math.max(1e-9, x1 - x0);
    out.push((130 - y) / 5);
  }
  return out;
}

export function templateVM(): DashboardVM {
  const t50 = fromPolyline([[0, 86], [80, 100], [160, 58], [240, 46], [340, 52], [443, 92], [520, 104], [600, 62], [700, 68], [800, 88], [886, 104], [980, 112], [1080, 76], [1180, 84], [1280, 100], [1330, 108]]);
  const td = fromPolyline([[0, 118], [200, 124], [443, 120], [700, 112], [886, 122], [1080, 116], [1330, 126]]);
  // Niederschlagsbalken der Vorlage: Höhe 20/28/14 (Do) und 42/50/34/22 (Fr) bei 50 px = 2,9 mm/h (nur der 50-px-Balken ≥ 2,5 ⇒ violett).
  const bars: Record<number, number> = { 33: 1.16, 34: 1.62, 35: 0.81, 52: 2.44, 53: 2.9, 54: 1.97, 55: 1.28 };
  const points: HourPoint[] = t50.map((v, h) => ({ t: START + h * H, t50: v, t10: v - 3.6, t90: v + 1.2, td: td[h], pr: bars[h] ?? 0 }));
  const { dayLines, ticks, ticksMobile } = hourAxis(START, START + 72 * H, 72);
  const phase = (id: 'MORGEN' | 'MITTAG' | 'ABEND' | 'NACHT', icon: DashboardVM['zone']['days'][number]['phases'][number]['icon'], t: string, p: string, lvl: 'faint' | 'mid' | 'high', w: string, hl = false) => ({
    id, icon, temp: s('P34', t), pop: s('P35', `${p}${NB}%`), popLevel: lvl, wind: hl ? s('P37', w) : s('P36', w), highlight: hl,
  });
  const noSun = na('P43', 'keine Sonnenschein-Quelle auf der Plattform (E-DB-10)');
  // Geländeprofil der Vorlage (x, y im 900×340-Raster) → s in km, h in m (Achse 500 … 3000 m auf y 282 … 10).
  const prof: Array<[number, number]> = [[58, 183], [110, 150], [150, 96], [200, 14], [248, 78], [290, 168], [330, 238], [380, 255], [420, 259], [470, 252], [520, 218], [560, 178], [600, 143], [650, 186], [700, 212], [760, 228], [830, 240], [900, 249]];
  const toS = (x: number) => ((x - 58) / 842) * 40 - 20;
  const toH = (yy: number) => 3000 - ((yy - 10) * 2500) / 272;
  const profile: Array<{ s: number; h: number }> = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const [xa, ya] = prof[i], [xb, yb] = prof[i + 1];
    for (let k = 0; k < 10; k++) { const f = k / 10; profile.push({ s: toS(xa + (xb - xa) * f), h: toH(ya + (yb - ya) * f) }); }
  }
  profile.push({ s: 20, h: toH(249) });
  const level = (h: number, t: string, ort = false) => ({
    h, label: `${h >= 1000 ? `${Math.floor(h / 1000)}${NB}${String(h % 1000).padStart(3, '0')}` : h}${NB}m`, ort,
    t: s(ort ? 'P75' : 'P76', t), wind: ort ? s('P75', `SW 3,2${NB}m/s`) : na('P77', 'kein Höhenwind im Punkt-Cube'),
  });
  return {
    nowMs: NOW,
    place: { name: 'Garmisch-Partenkirchen', lat: 47.4917, lon: 11.0955, country: 'DE' },
    range: '3-tage',
    status: 'ok',
    error: null,
    top: { place: s('P01', 'Garmisch-Partenkirchen'), elev: s('P02', `708${NB}m`), run: s('P03', '12Z'), anchorTime: na('P04', 'Die Stationsdaten tragen keine Messzeit (V-DB-2)'), status: { text: 'FUSION LIVE', tone: 'ok' } },
    now: {
      temp: s('P06', '18,1'), unit: '°C', icon: { kind: 'sun' },
      td: s('P08', `11,2${NB}°C`), rh: s('P09', `63${NB}%`), windGust: s('P10', '3,2 / 7,4'), ps: s('P12', `1${NB}018${NB}hPa`), psLabel: 'DRUCK AM ORT',
      chips: [s('P13', 'Wind SW · 228°'), s('P14', `Bewölkung 35${NB}%`), s('P15', `Schneegrenze 2${NB}100${NB}m`), s('P16', `925 / 850 / 700${NB}hPa · 18 / 13 / 2${NB}°C`)],
      source: s('P17', 'BrightSky · 4 Stationen'),
    },
    warning: {
      state: 'active', channel: 'DWD CAP',
      quote: 'Amtliche WARNUNG vor WINDBÖEN — es treten Windböen mit Geschwindigkeiten um 60 km/h (17 m/s, Bft 7) aus südwestlicher Richtung auf.',
      footer: 'gültig bis 18.09. 06:00 · wörtlich zitiert · Deutscher Wetterdienst',
    },
    conf: {
      pct: 82, value: s('P22', `82${NB}%`), word: s('P23', 'solide'), typical: s('P22', `typisch ±0,8${NB}°C`),
      weights: [{ label: 'ICON-D2 +3', pct: 42, color: '#C97B47' }, { label: 'MOSMIX', pct: 27, color: '#3A6FA8' }, { label: 'Radar', pct: 18, color: '#7A9466' }, { label: 'Klimatologie', pct: 13, color: '#6E675A' }],
      weightsText: s('P24', `ICON-D2 +3 42${NB}% · MOSMIX 27${NB}% · Radar 18${NB}% · Klimatologie 13${NB}%`),
      // E-DB-23 — die Vorlage kennt Bandbreite und Trichter nicht; plausible Werte zur Kontrolle der Darstellung.
      band: s('P89', `±1,2${NB}°C`), bandRange: s('P89', `jetzt: 80${NB}% zwischen 16,9 und 19,3${NB}°C`),
      funnel: Array.from({ length: 15 }, (_, i) => ({ h: i * 24, half: 1.2 + 3.3 * Math.pow(i / 14, 0.8) })),
      funnelMarks: [{ h: 75, k: 2, label: '±2° ab Sa 19.09.' }, { h: 200, k: 3, label: '±3° ab Do 24.09.' }, { h: 330, k: 4, label: '±4° ab Mi 30.09.' }],
    },
    zone: {
      head: { period: s('P25', 'Mi 16.09. → Fr 18.09.'), models: s('P26', 'ICON-D2 + MOSMIX'), ensemble: s('P27', 'Ensemble vollständig (< 78 h)'), conf: s('P28', `Konfidenz 74${NB}% im Mittel`), confCls: 'good' },
      lead: s('P91', `Heute heiter, später auflockernd, bis 21°. Morgen wechselnd bewölkt, Schauer, 4,1${NB}mm.`),
      days: [
        {
          key: '2026-09-16', title: 'Heute · Mi 16.09.', highlight: true, text: s('P30', 'heiter, später auflockernd'), icon: { kind: 'sun' }, tmax: s('P32', '21°'), tmin: s('P32', '9°'),
          phases: [phase('MORGEN', { kind: 'sunCloud' }, '12°', '10', 'mid', `2${NB}m/s`), phase('MITTAG', { kind: 'sun' }, '20°', '5', 'faint', `3${NB}m/s`), phase('ABEND', { kind: 'sun' }, '21°', '5', 'faint', 'Böen 17', true), phase('NACHT', { kind: 'moon' }, '11°', '15', 'mid', `2${NB}m/s`)],
          rain: s('P39', `0,2${NB}mm`), rainWet: false, rainSub: s('P40', `max 15${NB}%`),
          mid: { label: 'BÖEN MAX', value: s('P41', `17${NB}m/s`), sub: s('P42', 'Warnung aktiv'), subWarn: true },
          sun: noSun, sunSub: s('P44', 'UV 5'), conf: { pct: 86, text: s('P46', `86${NB}%`), cls: 'good' },
        },
        {
          key: '2026-09-17', title: 'Morgen · Do 17.09.', highlight: false, text: s('P30', 'wechselnd bewölkt, Schauer'), icon: { kind: 'sunCloud' }, tmax: s('P32', '19°'), tmin: s('P32', '8°'),
          phases: [phase('MORGEN', { kind: 'cloud' }, '10°', '35', 'mid', `3${NB}m/s`), phase('MITTAG', { kind: 'rain', drops: 2 }, '18°', '65', 'high', `4${NB}m/s`), phase('ABEND', { kind: 'sunCloud' }, '16°', '30', 'mid', `3${NB}m/s`), phase('NACHT', { kind: 'moonCloud' }, '9°', '25', 'mid', `2${NB}m/s`)],
          rain: s('P39', `4,1${NB}mm`), rainWet: true, rainSub: s('P40', `max 65${NB}%`),
          mid: { label: 'BÖEN MAX', value: s('P41', `11${NB}m/s`), sub: s('P41', 'SW'), subWarn: false },
          sun: noSun, sunSub: s('P44', 'UV 6'), conf: { pct: 74, text: s('P46', `74${NB}%`), cls: 'good' },
        },
        {
          key: '2026-09-18', title: 'Übermorgen · Fr 18.09.', highlight: false, text: s('P30', 'Regen, kühler, Schneegrenze sinkt'), icon: { kind: 'rain', drops: 2 }, tmax: s('P32', '15°'), tmin: s('P32', '7°'),
          phases: [phase('MORGEN', { kind: 'rain', drops: 1 }, '9°', '70', 'high', `4${NB}m/s`), phase('MITTAG', { kind: 'rain', drops: 3, dark: true }, '14°', '85', 'high', `5${NB}m/s`), phase('ABEND', { kind: 'rain', drops: 1 }, '11°', '55', 'mid', `4${NB}m/s`), phase('NACHT', { kind: 'cloud', dark: true }, '7°', '40', 'mid', `3${NB}m/s`)],
          rain: s('P39', `11,6${NB}mm`), rainWet: true, rainSub: s('P40', `max 85${NB}%`),
          mid: { label: 'SCHNEEGRENZE', value: s('P45', `1${NB}650${NB}m`), sub: s('P45', `sinkt um 450${NB}m`), subWarn: false },
          sun: noSun, sunSub: s('P44', 'UV 4'), conf: { pct: 61, text: s('P46', `61${NB}%`), cls: 'fair' },
        },
      ],
      hourly: {
        startMs: START, endMs: START + 72 * H, hours: 72, points, dayLines, ticks, ticksMobile, head: s('P53', `72${NB}h · Ensemble vollständig`),
        // Nächte etwa 20–07 Uhr (Mitte September); Marken leer — die Vorlage zeigt keine.
        nights: [6, 30, 54].map((h) => ({ from: START + h * H, to: START + (h + 11) * H })),
        marks: [],
      },
      hourlyHead: s('P53', `72${NB}h · Ensemble vollständig`),
    },
    nowcast: {
      state: 'ok', headline: s('P54', 'Trocken bis 16:40'), horizon: '0–2 h DE · 0–3 h AT',
      nowMs: NOW, fromMs: NOW - 118 * 60_000, toMs: NOW + 92 * 60_000,
      frames: [[9, 1.2], [20, 2.1], [31, 3.0], [43, 1.8], [54, 0.75]].map(([m, mmh]) => ({ t: NOW + m * 60_000, mmh })),
      chips: [s('P57', 'Zellen: keine'), na('P58', 'nur als Kartenkachel, keine Punktabfrage'), s('P59', 'Hagel: — (nur CH)')],
    },
    clouds: {
      state: 'ok', fromMs: START, toMs: START + 336 * H,
      layers: [
        { id: 'high', cells: [{ from: START, to: START + 134.4 * H, pct: 100 }] },
        { id: 'mid', cells: [{ from: START + 100.8 * H, to: START + 252 * H, pct: 100 }] },
        { id: 'low', cells: [{ from: START + 192.6 * H, to: START + 310.2 * H, pct: 100 }] },
      ],
      total: [[0, 84, 90, 76], [67.2, 78, 84, 70], [134.4, 88, 94, 82], [201.6, 76, 82, 68], [268.8, 84, 90, 76], [336, 78, 84, 70]].map(([h, y50, ylo, yhi]) => ({
        t: START + h * H, p50: ((94 - y50) / 24) * 100, p10: ((94 - ylo) / 24) * 100, p90: ((94 - yhi) / 24) * 100,
      })),
      caption: s('P62', 'hoch · mittel · tief + gesamt mit Quantilen · 336 h'),
    },
    wind: {
      state: 'ok',
      sectors: [{ deg: 0, share: 0.06 }, { deg: 45, share: 0 }, { deg: 90, share: 0 }, { deg: 135, share: 0 }, { deg: 180, share: 0.08 }, { deg: 225, share: 0.34 }, { deg: 270, share: 0.3 }, { deg: 315, share: 0.22 }],
      nowDeg: 228, title: s('P64', 'SW · 228°'), reach: s('P65', `46${NB}h`), reachHours: 46, reachPct: 14,
    },
    terrain: {
      state: 'ok', halfKm: 20,
      header: s('P80', 'Schnitt SW → NO durch die Fahrtrichtung des Windes · Punkt-Cube t1 (0,05°), γ aus dem Modellprofil'),
      chip: s('P70', 'γ 7,1 K/km · keine Inversion'), chipTone: 'ok', fromLabel: 'SW', toLabel: 'NO',
      profile, axis: { top: 3000, bottom: 500, step: 500 }, hOrt: 708,
      isotherms: [[6, 2450], [10, 1890], [14, 1330]].map(([t, h]) => ({ t, h, color: isothermColor(t), label: `${t}${NB}°C · ${Math.floor(h / 1000)}${NB}${String(h % 1000).padStart(3, '0')}${NB}m` })),
      snowline: 2100, snowlineLabel: `Schneegrenze 2${NB}100${NB}m`,
      stations: [{ name: 'Zugspitze', s: toS(200), h: 2964, label: `Zugspitze 2${NB}964${NB}m · 2,4${NB}°C` }, { name: 'Wank', s: toS(600), h: 1780, label: `Wank 1${NB}780${NB}m · 10,8${NB}°C` }],
      ort: { title: `Garmisch-P. · 708${NB}m`, sub: `18,4${NB}°C · Wind 3,2${NB}m/s SW` },
      table: [level(3000, '2,1°'), level(2500, '5,7°'), level(2000, '9,2°'), level(1780, '10,8°'), level(1500, '12,8°'), level(1000, '16,3°'), level(708, '18,4°', true)],
      readout: {
        main: ['Die Temperatur nimmt ', { b: 'durchgehend mit der Höhe ab' }, ` — 18,4${NB}°C am Ort (708${NB}m) gegen 2,4${NB}°C an der Station Zugspitze (2${NB}964${NB}m) ergibt `, { b: 'γ 7,1 K/km' }, '. Das ist steil und zeigt heute ', { b: 'keine Inversion' }, '.', ' Wind je Höhenniveau ist ', { b: 'nicht verfügbar' }, ' (kein Höhenwind im Punkt-Cube).'],
        note: ['Gelände, Stationen und Schneegrenze sitzen auf ihrer ', { b: 'tatsächlichen Höhe' }, ' der Achse; Zwischenwerte folgen dem einen Gradienten, nichts wird aus zwei Modellen gemischt.', ' Oberstdorf und Hohenpeißenberg liegen außerhalb des ±20-km-Schnitts.'],
      },
      legendIso: `gestrichelte Linien: Isothermen 6 / 10 / 14${NB}°C — Höhe aus γ 7,1 K/km gerechnet`,
      note: null,
    },
    uv: { state: 'ok', days: [{ label: 'heute', value: 5 }, { label: 'morgen', value: 6 }, { label: 'übermorgen', value: 4 }], caption: s('P81', 'Tagesmaximum · 38 Vorhersageorte'), na: null },
    pollen: {
      state: 'ok',
      species: [['Erle', 1], ['Birke', 2], ['Gräser', 3], ['Roggen', 0], ['Beifuß', 1], ['Ambrosia', 0], ['Esche', 2], ['Hasel', 0]].map(([name, l]) => ({ name: name as string, levels: [l as number, l as number, l as number] })),
      caption: s('P82', 'heute · morgen · übermorgen je Art · Region Oberbayern'), cams: 'CAMS-Opt-in aus · 6 Arten, 4 Tage, nur AT/CH', na: null,
    },
    icond2: {
      state: 'ok', title: 'ICON-D2-LAYER · 12–24 h · DACH', foot: 'Kartenlayer · am Ort abfragbar',
      rows: [
        { label: 'Gewitterpotenzial', value: s('P84', 'gering'), tone: 'good' },
        { label: 'Rotation', value: s('P85', 'keine'), tone: 'muted' },
        { label: 'Neuschnee 24 h', value: s('P86', `0${NB}cm`), tone: 'strong' },
        { label: 'Böen max', value: s('P87', `17${NB}m/s`), tone: 'warn' },
        { label: 'Feuerwetter', value: na('P88', 'zurückgezogen — kein Feuerwetter-Index mehr auf der Plattform'), tone: 'muted' },
      ],
    },
    footer: FOOTER,
    notes: ['Vorlagen-Fixture (Entwicklungsmodus) — keine Wetterdaten'],
  };
}
