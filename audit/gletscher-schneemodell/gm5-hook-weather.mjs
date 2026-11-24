// GM-5 recording wrapper of lib/weathercore.mjs (frozen copy dc982141). Records what the scenarios need from weatherOfGlacier, passes it through.
import * as orig from 'file:///C:/dev/buscosun-glacier-cache/gm5/code/scripts/glacier/lib/weathercore.mjs';
export * from 'file:///C:/dev/buscosun-glacier-cache/gm5/code/scripts/glacier/lib/weathercore.mjs';

const R = (globalThis.__gm5 ??= { sp: [], wx: new Map(), lastDrive: null });
export function weatherOfGlacier(a) {
  const res = orig.weatherOfGlacier(a);
  R.wx.set(a.id, { from: a.from ?? 'own', z: a.z, sg: a.sg, pDist: a.wx?.pDist ?? null, levelsSg: a.levels?.sg ?? null, ctx: res.ctx ?? null, skip: res.skip ?? null,
    sn: res.row?.sn ?? null, snq: res.row?.snq ?? null, pq: res.row?.pq ?? null, p: res.row?.p ?? null });
  return res;
}
