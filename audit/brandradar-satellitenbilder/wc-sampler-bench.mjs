/**
 * V-SAT-16 — Prüfstand für die Pixel-Schleife des WorldCover-Samplers (§12.8).
 *
 * Misst NUR den CPU-Anteil der Zuordnung „Ausgabe-Pixel → (WorldCover-Kachel, Pixel darin)".
 * Der Netzanteil ist bewusst ausgeklammert (`loadWcTile` wird durch einen Zähler ersetzt) —
 * die Browser-Messung aus §12.7.4 hat gezeigt, dass die Last NICHT der Transport ist
 * (Spiegel 936 ms · PC 1 028 ms · ohne WorldCover 0 ms).
 *
 * `refMapBlock` ist die Schleife aus `worldCover.ts` VOR dieser Phase, wortgleich übernommen
 * (Strings als Kachelnamen, `names.indexOf` je Pixel, Template-Literal als Map-Schlüssel).
 * Sie ist damit zugleich das Gleichheits-Orakel: das neue `wcMapBlock` muss Pixel für Pixel
 * dasselbe liefern (BW-1-Muster „byte-gleich zur Referenz").
 *
 * Aufruf: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
 *           audit/brandradar-satellitenbilder/wc-sampler-bench.mjs
 */

import {
  wcGeoGrid, wcLocate, wcTileName, wcMapBlock, wcTileCode, WC_TILE_PX,
} from '../../src/fire/detail/worldCover.ts';

/* ------------------------------------------------------------------ Referenz (Stand vor V-SAT-16) */

/** Die Schleife von vorher — `perName` als Map<string,…>, Kachelschlüssel als Template-Literal. */
function refMapBlock(grid, nPix, names, perName, via, onNeed) {
  const tileOf = new Int32Array(nPix);
  const pixOf = new Int32Array(nPix);
  tileOf.fill(-1);
  const need = new Set();
  for (let k = 0; k < nPix; k++) {
    const loc = wcLocate(grid.lat[k], grid.lon[k]);
    const lv = perName.get(loc.name);
    if (!lv) continue;
    const x = Math.min(lv.ifd.width - 1, Math.floor(loc.x / lv.fac));
    const y = Math.min(lv.ifd.height - 1, Math.floor(loc.y / lv.fac));
    const col = Math.floor(x / lv.ifd.tileW);
    const row = Math.floor(y / lv.ifd.tileH);
    const idx = row * lv.ifd.tilesAcross + col;
    const key = `${via}|${loc.name}|${lv.ifd.width}|${idx}`;
    if (!need.has(key)) { need.add(key); onNeed(names.indexOf(loc.name), idx); }
    tileOf[k] = names.indexOf(loc.name) * (1 << 20) + idx;
    pixOf[k] = (y - row * lv.ifd.tileH) * lv.ifd.tileW + (x - col * lv.ifd.tileW);
  }
  return { tileOf, pixOf };
}

/* ------------------------------------------------------------------------------------ Fixtures */

const mkIfd = (width) => ({
  width, height: width, tileW: 1024, tileH: 1024, samplesPerPixel: 1, bitsPerSample: 8,
  littleEndian: true, compression: 8, predictor: 1,
  tilesAcross: Math.ceil(width / 1024), tilesDown: Math.ceil(width / 1024),
  tileOffsets: [], tileByteCounts: [],
});

/**
 * Zwei echte Lagen: der Hürtgenwald-Block (32631, eine Kachel) und ein Block auf der
 * 51°-Grenze (zwei Kacheln — der Fall, den die Blockecken-Regel §12.3 abdeckt).
 */
const CASES = [
  { label: 'Hürtgenwald 31UGS', epsg: 32631, e0: 732_000, n0: 5_618_000 },
  { label: '51°-Grenze', epsg: 32631, e0: 732_000, n0: 5_662_000 },
];

/** Die Ebenen, die `pickLevel` an den dNBR-Anzeigeauflösungen liefert. */
const LEVELS = { pc: 18000, mirror: 9000 };

function setup(c, outW, outH, stepM, levelPx) {
  const grid = wcGeoGrid(c.epsg, c.e0, c.n0, stepM, outW, outH);
  if (!grid) throw new Error('wcGeoGrid null');
  const nPix = outW * outH;
  const cornerIdx = [0, outW - 1, (outH - 1) * outW, nPix - 1];
  const names = [...new Set(cornerIdx.map((k) => wcTileName(grid.lat[k], grid.lon[k])))];
  const ifd = mkIfd(levelPx);
  const perName = new Map(names.map((n) => [n, { ifd, fac: WC_TILE_PX / ifd.width }]));
  const slots = names.map((n, i) => ({
    code: wcTileCode(grid.lat[cornerIdx.find((k) => wcTileName(grid.lat[k], grid.lon[k]) === n)],
      grid.lon[cornerIdx.find((k) => wcTileName(grid.lat[k], grid.lon[k]) === n)]),
    fac: WC_TILE_PX / ifd.width,
    width: ifd.width, height: ifd.height, tileW: ifd.tileW, tileH: ifd.tileH,
    tilesAcross: ifd.tilesAcross,
    _i: i,
  }));
  return { grid, nPix, names, perName, slots };
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

function time(fn, runs = 7) {
  fn(); // warm
  const ms = [];
  for (let i = 0; i < runs; i++) { const t = performance.now(); fn(); ms.push(performance.now() - t); }
  return median(ms);
}

/* ---------------------------------------------------------------------------------------- Lauf */

let fails = 0;
console.log('V-SAT-16 — Pixel-Schleife des WorldCover-Samplers, Median aus 7 Läufen\n');
console.log('Fall                          Ebene   Block      vorher     nachher   Faktor  gleich  Umfang');
console.log('─'.repeat(84));

for (const c of CASES) {
  for (const [via, levelPx] of Object.entries(LEVELS)) {
    for (const side of [256, 1024]) {
      // Der Grenzfall braucht Spannweite, sonst liegt der Block doch in EINER Kachel
      // (erster Anlauf: als „2 Kacheln" gelabelt, tatsächlich eine — der Verifier fand es).
      const stepM = c.n0 > 5_660_000 ? (side === 1024 ? 40 : 160) : (side === 1024 ? 20 : 80);
      const { grid, nPix, names, perName, slots } = setup(c, side, side, stepM, levelPx);

      const refNeed = [];
      const before = time(() => refMapBlock(grid, nPix, names, perName, via, (s, i) => refNeed.push(s * 4096 + i)));
      const newNeed = [];
      const after = time(() => wcMapBlock(grid, nPix, slots, (s, i) => newNeed.push(s * 4096 + i)));

      const r = refMapBlock(grid, nPix, names, perName, via, () => {});
      const n = wcMapBlock(grid, nPix, slots, () => {});
      let same = r.tileOf.length === n.tileOf.length;
      for (let k = 0; same && k < nPix; k++) {
        if (r.tileOf[k] !== n.tileOf[k] || r.pixOf[k] !== n.pixOf[k]) same = false;
      }
      const needSame = [...new Set(refNeed)].sort().join(',') === [...new Set(newNeed)].sort().join(',');
      if (!same || !needSame) fails++;

      console.log(
        `${c.label.padEnd(28)}  ${String(levelPx).padStart(5)}  ${String(side).padStart(4)}²  `
        + `${before.toFixed(1).padStart(9)} ms ${after.toFixed(1).padStart(8)} ms  `
        + `${(before / after).toFixed(1).padStart(5)}×  ${same && needSame ? 'ja' : 'NEIN'}`
        + `   ${names.length} Kachel${names.length === 1 ? '' : 'n'}`,
      );
    }
  }
}

console.log('─'.repeat(84));
console.log(fails === 0
  ? '\nGleichheit: jede Zuordnung (tileOf/pixOf) und jeder angeforderte Kachel-Satz identisch.'
  : `\nFEHLER: ${fails} Fälle weichen von der Referenz ab.`);
process.exit(fails === 0 ? 0 : 1);
