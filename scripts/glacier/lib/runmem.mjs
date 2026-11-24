/**
 * Phase GM, V-GM-81 (audit/gletscher-schneemodell.md §3l) — the memory of a producer run for its status line. Pure bookkeeping: nothing here changes
 * what a run computes or writes besides the three numbers.
 *
 *   rssMb        the highest resident set size of the PROCESS, kept by the operating system (`process.resourceUsage().maxRSS`, kilobytes) — not sampled.
 *                On the runner one process is one run; a process that ran other things before (a verifier) reports those as well.
 *   heapMb       the highest JavaScript heap in use seen at the sample points. An UPPER bound of what the run holds: garbage not collected yet counts.
 *   heapLimitMb  the heap size at which Node stops with "heap out of memory" (`v8.getHeapStatistics().heap_size_limit`) — depends on the Node version
 *                and the memory of the machine.
 *
 * The three sources can be handed in (the verifier does); the defaults read the process.
 */
import { getHeapStatistics } from 'node:v8';

const MB = 1024 * 1024;

export function memWatch({ heapUsed = () => process.memoryUsage().heapUsed, peakRssKb = () => process.resourceUsage().maxRSS, heapLimit = () => getHeapStatistics().heap_size_limit } = {}) {
  let heap = 0;
  const sample = () => { const u = heapUsed(); if (u > heap) heap = u; };
  sample();
  return {
    /** One sample of the heap in use (cheap: microseconds). */
    sample,
    /** The line for the status file; takes one last sample. */
    line: () => { sample(); return { rssMb: Math.round(peakRssKb() / 1024), heapMb: Math.round(heap / MB), heapLimitMb: Math.round(heapLimit() / MB) }; },
  };
}
