// GM-5 recording wrapper of lib/snowpackcore.mjs (frozen copy dc982141). Records the inputs of driveOf and snowpackOfGlacier, passes them through.
import * as orig from 'file:///C:/dev/buscosun-glacier-cache/gm5/code/scripts/glacier/lib/snowpackcore.mjs';
import { packToRow } from 'file:///C:/dev/buscosun-glacier-cache/gm5/code/scripts/glacier/lib/snowcore.mjs';
export * from 'file:///C:/dev/buscosun-glacier-cache/gm5/code/scripts/glacier/lib/snowpackcore.mjs';

const R = (globalThis.__gm5 ??= { sp: [], wx: new Map(), lastDrive: null });
export function driveOf(a) { R.lastDrive = a; return orig.driveOf(a); }
export function snowpackOfGlacier(a) {
  R.sp.push({ id: a.id, z: a.z, from: a.from, lapse: a.lapse, pars: a.pars, c: a.c, t0Ms: a.t0Ms, begin: a.begin, holes: a.holes, drive: a.drive,
    levelsRows: a.levels.map((lv) => ({ row: packToRow(lv.pack), aS: lv.aS })), driveArgs: R.lastDrive });
  R.lastDrive = null;
  return orig.snowpackOfGlacier(a);
}
