// BW-6a Beweis: die neuen DOM-freien Builder (`src/sources/scalarFrameBuild.ts`) sind
// byte-gleich zu den alten Canvas-Schleifen (HEAD-Fassungen unter ./bw6-old, importiert
// über einen minimalen `document`/`ImageData`-Shim). Läuft gegen ECHTE Felder aus dem
// Producer-Plattencache (.cache/repack). Aufruf:
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/l0/probe-bw6a-equality.mjs

// ── Shim: nur was build*Image braucht ────────────────────────────────────────
class ImageDataShim { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } }
globalThis.document = {
  createElement() {
    const c = { width: 0, height: 0, _img: null };
    c.getContext = () => ({
      createImageData: (w, h) => new ImageDataShim(w, h),
      putImageData: (img) => { c._img = img; },
    });
    return c;
  },
};

const { fetchField, urls, findLatestRun } = await import('../repack-icon-d2.mjs');
const neu = await import('../../src/sources/scalarFrameBuild.ts');
const oGust = await import('./bw6-old/iconD2GustSource.ts');
const oLpi = await import('./bw6-old/iconD2Lpi.ts');
const oSnow = await import('./bw6-old/iconD2Snow.ts');
const oTh = await import('./bw6-old/iconD2Thunder.ts');
const oRot = await import('./bw6-old/iconD2Rotation.ts');

const run = (await findLatestRun()).run;
const ss = 2;
let pass = 0, fail = 0;
function cmp(label, oldImg, fresh) {
  const a = oldImg.image._img.data, b = fresh.rgba;
  let diff = 0;
  if (a.length !== b.length || oldImg.width !== fresh.width || oldImg.height !== fresh.height) diff = -1;
  else for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  const ok = diff === 0;
  ok ? pass++ : fail++;
  console.log(`${ok ? '✓' : '✗'} ${label} — ${oldImg.width}×${oldImg.height}, ${diff === -1 ? 'Maße verschieden' : diff + ' abweichende Bytes'}`);
}
const f = (p, s) => fetchField(urls.step(run, p, s)).catch(() => null);

for (const s of [0, 12, 24]) { const g = await f('vmax_10m', s); if (g) cmp(`gust ${s}`, oGust.buildGustImage(g, ss), neu.buildGustRgba(g, ss)); }
for (const s of [1, 6, 12]) { const g = await f('lpi_max', s); if (g) cmp(`lightningfc ${s}`, oLpi.buildLpiImage(g, ss), neu.buildLpiRgba(g, ss)); }
for (const s of [0, 12, 24]) { const g = await f('h_snow', s); if (g) cmp(`snowDepth ${s}`, oSnow.buildDepthImage(g, ss), neu.buildSnowDepthRgba(g, ss)); }
for (const s of [1, 12, 24]) {
  const [g, c, r] = await Promise.all([f('snow_gsp', s), f('snow_con', s), f('rho_snow', s)]);
  if (g) { cmp(`snowFresh ${s}`, oSnow.buildFreshImage(g, c, r, ss), neu.buildSnowFreshRgba(g, c, r, ss));
    cmp(`snowFresh ${s} ohne Nebenfelder`, oSnow.buildFreshImage(g, null, null, ss), neu.buildSnowFreshRgba(g, null, null, ss)); }
}
for (const s of [0, 6, 12]) {
  const [ca, ci, l] = await Promise.all([f('cape_ml', s), f('cin_ml', s), f('lpi', s)]);
  if (ca) { cmp(`thunder ${s}`, oTh.buildThunderImage(ca, ci, l, ss), neu.buildThunderRgba(ca, ci, l, ss));
    cmp(`thunder ${s} ohne Nebenfelder`, oTh.buildThunderImage(ca, null, null, ss), neu.buildThunderRgba(ca, null, null, ss)); }
}
for (const s of [1, 6, 12]) {
  const [u, lo, sd] = await Promise.all([f('uh_max', s), f('uh_max_low', s), f('sdi_2', s)]);
  if (u) { cmp(`rotation ${s}`, oRot.buildRotationImage(u, lo, sd, ss), neu.buildRotationRgba(u, lo, sd, ss));
    cmp(`rotation ${s} ohne Nebenfelder`, oRot.buildRotationImage(u, null, null, ss), neu.buildRotationRgba(u, null, null, ss)); }
}
console.log(`\n${pass}/${pass + fail} byte-gleich (Lauf ${run})`);
process.exit(fail ? 1 : 0);
