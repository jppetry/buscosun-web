/**
 * slotio.mjs — the reader of hindcast slots (kind `hindcast/slot`, schema 1). It refuses what is not a hindcast
 * slot — a punktarchiv slot, an unknown schema, a slot whose plane order is not CUBE_PLANES — so a scorer can never
 * mix the provenance classes `measured` (buscosun-archiv) and `hindcast` (E-F-23) by accident.
 */
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { CUBE_PLANES, MISSING } from '../../../src/point/cubeFormat.ts';
import { PAP3_PLANES } from './common.mjs';

export const HINDCAST_SLOT_SCHEMAS_READABLE = Object.freeze([1]);
export const HINDCAST_SLOT_KIND = 'hindcast/slot';
const PLANE_IDS = CUBE_PLANES.map((p) => p.id);

export function validateSlot(slot) {
  const errs = [];
  if (!HINDCAST_SLOT_SCHEMAS_READABLE.includes(slot?.schema)) errs.push(`schema ${slot?.schema}`);
  if (slot?.kind !== HINDCAST_SLOT_KIND) errs.push(`kind ${slot?.kind}`);
  if (slot?.sentinel !== MISSING) errs.push(`sentinel ${slot?.sentinel}`);
  for (const [t, c] of Object.entries(slot?.cube ?? {})) {
    if (JSON.stringify(c.planeOrder) !== JSON.stringify(PLANE_IDS)) errs.push(`${t}: planeOrder ≠ CUBE_PLANES`);
    if (JSON.stringify(c.pap3Planes) !== JSON.stringify(PAP3_PLANES)) errs.push(`${t}: pap3Planes ≠ PAP3_PLANES`);
    const sc = slot.scales?.cube?.[t];
    for (const p of CUBE_PLANES) {
      const s = sc?.[p.id];
      if (!s || s.scale !== p.scale || s.offset !== p.offset || s.unit !== p.unit) { errs.push(`${t}: scale of ${p.id}`); break; }
    }
    if (c.provenance?.class !== 'hindcast') errs.push(`${t}: provenance.class ${c.provenance?.class}`);
    for (const [id, bp] of Object.entries(c.byPoint ?? {})) {
      if (!bp) continue;
      const names = [...Object.keys(bp.planes), ...bp.empty];
      if (names.length !== PLANE_IDS.length || names.some((n) => !PLANE_IDS.includes(n))) { errs.push(`${t}/${id}: nearest cell planes`); break; }
      for (const b of bp.block) {
        if (b.planes === 'nearest') continue;
        const nb = [...Object.keys(b.planes), ...b.empty];
        if (nb.length !== PAP3_PLANES.length || nb.some((n) => !PAP3_PLANES.includes(n))) { errs.push(`${t}/${id}: block cell ${b.iy}_${b.ix} planes`); break; }
      }
    }
  }
  return errs;
}

/** gzip bytes → slot, or a thrown error naming why it is not a hindcast slot. */
export function parseHindcastSlot(bytes) {
  const slot = JSON.parse(gunzipSync(bytes).toString('utf8'));
  const errs = validateSlot(slot);
  if (errs.length) throw new Error(`hindcast: not a hindcast slot — ${errs.slice(0, 3).join('; ')}`);
  return slot;
}
export const readHindcastSlot = (path) => parseHindcastSlot(readFileSync(path));
