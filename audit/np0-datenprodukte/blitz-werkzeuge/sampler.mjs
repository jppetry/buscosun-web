// Latenz-Sampler D-NP0-4: alle STEP s die jüngste TIME beider Blitz-Layer gegen die Wanduhr (UTC), DUR min lang.
import { appendFileSync } from 'node:fs';
const STEP = Number(process.argv[2] ?? 120) * 1000;
const DUR = Number(process.argv[3] ?? 80) * 60_000;
const OUT = process.argv[4] ?? 'latency.log';
const SRC = {
  bd: 'https://maps.dwd.de/geoserver/dwd/Blitzdichte/wms?service=WMS&version=1.3.0&request=GetCapabilities',
  mtg: 'https://view.eumetsat.int/geoserver/mtg_fd/li_afa/wms?service=WMS&version=1.3.0&request=GetCapabilities',
};
const end = Date.now() + DUR;
appendFileSync(OUT, `# start ${new Date().toISOString()} step ${STEP / 1000}s\n`);
while (Date.now() < end) {
  for (const [k, url] of Object.entries(SRC)) {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      const x = await r.text();
      const m = /<Dimension name="time"[^>]*>([^<]*)</.exec(x);
      const last = m ? m[1].split('/')[1] : null;
      const lag = last ? Math.round((t0 - Date.parse(last)) / 1000) : null;
      appendFileSync(OUT, `${new Date(t0).toISOString()}\t${k}\t${r.status}\t${last}\tlagS=${lag}\tcapsMs=${Date.now() - t0}\n`);
    } catch (e) {
      appendFileSync(OUT, `${new Date(t0).toISOString()}\t${k}\tERR\t${e.message}\n`);
    }
  }
  await new Promise((r) => setTimeout(r, STEP));
}
appendFileSync(OUT, `# end ${new Date().toISOString()}\n`);
