/**
 * nodeShims.mjs — what the browser brings and Node does not, for running the LIVE path
 * of buscosun Fusion (`getPointForecast`) inside the archive collector.
 *
 * Two gaps, both measured on 2026-09-14 (PA1):
 *
 *  1. `src/fusion/elevation.ts` decodes Terrarium tiles with `createImageBitmap` + a
 *     `<canvas>`. In Node both are undefined, `loadTile` swallows the error and the
 *     forecast silently runs with **elevation 0** — every lapse-rate and terrain term
 *     would be wrong and nothing would fail. The shim decodes the same PNG bytes with
 *     the repo's own decoder (`scripts/lib/png.mjs`) and hands back an object with the
 *     three canvas calls the loader uses (`getContext`, `drawImage`, `getImageData`).
 *  2. The app addresses some upstreams through Netlify rewrites (`/_dwd_opendata/*`,
 *     `/_gfs/*`, `/_cscs/*`, `/_ecmwf/*`, see netlify.toml). A relative URL is not
 *     fetchable in Node; the shim maps the prefixes to the same upstream hosts the
 *     rewrites point to. `src/globe/gfs.ts` already does this for `/_gfs` on its own.
 *
 * What the shim does NOT do: Web Workers. `src/sources/radolan.ts` spawns one for the
 * RADOLAN decode, so the live path must run with `includeRadarNowcast: false` in Node —
 * the collector records that as a caveat, it does not paper over it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { decodePng } from '../../lib/png.mjs';

/** `public/` of the app — `ClimaField.load()` fetches `${BASE_URL}climaGrid.json`, in Node that is `/climaGrid.json`. */
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public');

const REWRITES = [
  ['/_dwd_opendata/', 'https://opendata.dwd.de/'],
  ['/_gfs/', 'https://noaa-gfs-bdp-pds.s3.amazonaws.com/'],
  ['/_cscs/', 'https://rgw.cscs.ch/'],
  ['/_ecmwf/', 'https://data.ecmwf.int/'],
];

export function rewriteProxyUrl(url) {
  const s = typeof url === 'string' ? url : url instanceof URL ? url.href : String(url?.url ?? url);
  for (const [from, to] of REWRITES) if (s.startsWith(from)) return to + s.slice(from.length);
  return s;
}

let installed = false;
export function installNodeShims() {
  if (installed) return;
  installed = true;
  // (1) Terrarium tiles: createImageBitmap + canvas → the repo's PNG decoder.
  if (typeof globalThis.createImageBitmap === 'undefined') {
    globalThis.createImageBitmap = async (blob) => {
      const buf = Buffer.from(await blob.arrayBuffer());
      const png = decodePng(buf);
      return { width: png.width, height: png.height, _png: png, close() {} };
    };
  }
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      createElement(tag) {
        if (tag !== 'canvas') throw new Error(`nodeShims: document.createElement(${tag}) not supported`);
        let bmp = null;
        return {
          width: 0, height: 0,
          getContext() {
            return {
              drawImage(b) { bmp = b; },
              getImageData(x, y, w, h) {
                if (!bmp?._png) throw new Error('nodeShims: getImageData before drawImage');
                const { width, channels, data } = bmp._png;
                const out = new Uint8ClampedArray(w * h * 4);
                for (let j = 0; j < h; j++) {
                  for (let i = 0; i < w; i++) {
                    const src = ((y + j) * width + (x + i)) * channels;
                    const dst = (j * w + i) * 4;
                    out[dst] = data[src];
                    out[dst + 1] = channels >= 3 ? data[src + 1] : data[src];
                    out[dst + 2] = channels >= 3 ? data[src + 2] : data[src];
                    out[dst + 3] = channels === 4 ? data[src + 3] : channels === 2 ? data[src + 1] : 255;
                  }
                }
                return { width: w, height: h, data: out };
              },
            };
          },
        };
      },
    };
  }
  // (2) Netlify rewrites → upstream hosts.
  const orig = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const s = typeof input === 'string' ? input : input instanceof URL ? input.href : null;
    if (s && s.startsWith('/_')) return orig(rewriteProxyUrl(s), init);
    // (3) bundled assets under `public/` that the app fetches by root-relative path.
    if (s === '/climaGrid.json') {
      try {
        return Promise.resolve(new Response(readFileSync(join(PUBLIC_DIR, 'climaGrid.json')), { status: 200, headers: { 'content-type': 'application/json' } }));
      } catch (e) { return Promise.resolve(new Response(String(e.message), { status: 404 })); }
    }
    return orig(input, init);
  };
}

/** Netzfrei: der Shim liefert für einen bekannten PNG die Pixel, die Terrarium-Dekodierung erwartet. */
export async function nodeShimsSelfTest() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  add('rewrite: /_dwd_opendata → opendata.dwd.de', rewriteProxyUrl('/_dwd_opendata/a/b.json') === 'https://opendata.dwd.de/a/b.json');
  add('rewrite: fremde URLs bleiben', rewriteProxyUrl('https://x.y/z') === 'https://x.y/z');
  installNodeShims();
  // 2×2 RGB PNG über den Encoder des Repos, dann der Weg, den elevation.ts geht.
  const { encodePng } = await import('../../lib/png.mjs');
  const rgb = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
  const png = encodePng(2, 2, rgb, 3);
  const blob = new Blob([png]);
  const bmp = await globalThis.createImageBitmap(blob);
  const canvas = globalThis.document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, 2, 2);
  add('shim: getImageData liefert RGBA mit Alpha 255', img.data.length === 16 && img.data[0] === 10 && img.data[1] === 20 && img.data[2] === 30 && img.data[3] === 255 && img.data[12] === 100 && img.data[15] === 255,
    Array.from(img.data).join(','));
  // Terrarium-Formel auf dem Shim: (R·256 + G + B/256) − 32768
  const e = img.data[0] * 256 + img.data[1] + img.data[2] / 256 - 32768;
  add('shim: Terrarium-Höhe aus den Shim-Pixeln ist rechenbar', Number.isFinite(e) && Math.abs(e - (10 * 256 + 20 + 30 / 256 - 32768)) < 1e-9);
  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}
