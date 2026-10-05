/**
 * adapter.ts — the contract between a version of buscosun Fusion (or a reference) and the Prüfstand (plan PS-2-2).
 *
 * An adapter turns the inputs of one issue into ONE forecast block for all stations of the network:
 *   data[(station · nLeads + lead) · channels + c], Float32, NaN = no forecast for this case
 *   channels = QUANTITY_VARS × nq quantiles (nq = the protocol's quantile set, or 1 for a point value), then `pWet`
 *   (probability that the mean rate of the step reaches the wet threshold) and `dd` (wind direction in degrees).
 * Units are those of the protocol's variable catalogue: °C, m/s, mm/h (mean rate over the step), % cloud cover.
 *
 * `checkBlock` is the contract test: a block in the wrong unit or with non-monotone quantiles is REJECTED with a
 * message — the run stops, nothing is scored (plan §0.3).
 */
import { EXTRA_CHANNELS, QUANTITY_VARS } from './protokoll';

export const ADAPTER_VERSION = 'cube-1';

export interface ForecastBlock {
  nStations: number;
  leads: number[];
  /** Quantiles per quantity: the protocol's set, or 1 = point value. */
  nq: number;
  data: Float32Array;
}

export const channelsOf = (nq: number): number => QUANTITY_VARS.length * nq + EXTRA_CHANNELS.length;

/** Plausible value range per quantity in the protocol's unit — wide, only to catch a wrong unit (Kelvin, km/h, mm per step × 100 …). */
export const UNIT_RANGE: Record<(typeof QUANTITY_VARS)[number], [number, number]> = {
  t: [-80, 60], td: [-100, 45], ws: [0, 90], gust: [0, 120], precip: [0, 200], clct: [0, 100],
};

export interface BlockCheck { defects: string[]; cases: number; filled: number; nonMonotone: number; outOfRange: number }

/** Contract test of a forecast block. `maxDefects` limits the messages, the counters are complete. */
export function checkBlock(b: ForecastBlock, nqProtocol: number, maxDefects = 5): BlockCheck {
  const defects: string[] = [];
  const ch = channelsOf(b.nq);
  let filled = 0, nonMonotone = 0, outOfRange = 0;
  if (b.nq !== 1 && b.nq !== nqProtocol) defects.push(`nq = ${b.nq}, erlaubt sind 1 (Punktwert) oder ${nqProtocol} (Quantilsatz des Protokolls)`);
  const cases = b.nStations * b.leads.length;
  if (b.data.length !== cases * ch) defects.push(`Blocklänge ${b.data.length}, erwartet ${cases * ch} (${b.nStations} Stationen × ${b.leads.length} Vorläufe × ${ch} Kanäle)`);
  if (defects.length) return { defects, cases, filled, nonMonotone, outOfRange };
  const say = (m: string) => { if (defects.length < maxDefects) defects.push(m); };
  for (let i = 0; i < cases; i++) {
    const o = i * ch;
    for (let v = 0; v < QUANTITY_VARS.length; v++) {
      const name = QUANTITY_VARS[v], [lo, hi] = UNIT_RANGE[name];
      let nan = 0;
      for (let k = 0; k < b.nq; k++) {
        const x = b.data[o + v * b.nq + k];
        if (x !== x) { nan++; continue; }
        if (x < lo - 1e-6 || x > hi + 1e-6) { outOfRange++; say(`${name}: Wert ${x} außerhalb ${lo}…${hi} (falsche Einheit?) bei Station ${Math.floor(i / b.leads.length)}, Vorlauf ${b.leads[i % b.leads.length]} h`); }
        if (k && x < b.data[o + v * b.nq + k - 1] - 1e-4) { nonMonotone++; say(`${name}: Quantile nicht monoton bei Station ${Math.floor(i / b.leads.length)}, Vorlauf ${b.leads[i % b.leads.length]} h`); }
      }
      if (nan && nan !== b.nq) say(`${name}: Quantilsatz teilweise leer bei Station ${Math.floor(i / b.leads.length)}, Vorlauf ${b.leads[i % b.leads.length]} h`);
      if (!nan) filled++;
    }
    const pw = b.data[o + QUANTITY_VARS.length * b.nq];
    if (pw === pw && (pw < -1e-6 || pw > 1 + 1e-6)) { outOfRange++; say(`pWet = ${pw} außerhalb 0…1`); }
    const dd = b.data[o + QUANTITY_VARS.length * b.nq + 1];
    if (dd === dd && (dd < 0 || dd > 360)) { outOfRange++; say(`dd = ${dd} außerhalb 0…360`); }
  }
  return { defects, cases, filled, nonMonotone, outOfRange };
}
