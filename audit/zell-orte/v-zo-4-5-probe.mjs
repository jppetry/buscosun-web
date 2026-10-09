// V-ZO-4/5 browser probe: shifted real KONRAD3D run, read the map's cell log line, the bar's class/colour, screenshot.
import { readFileSync, writeFileSync } from 'node:fs';
import { openBrowser, findHeadlessChrome } from 'file:///C:/dev/buscosun-web/scripts/lib/cdpBrowser.mjs';
const [bodyPath, outPng, url, mode = 'desktop'] = process.argv.slice(2);
const body = readFileSync(bodyPath);
const b = await openBrowser(findHeadlessChrome(), { extraArgs: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const mobile = mode === 'mobile';
const ctx = await b.newContext({ width: mobile ? 390 : 1440, height: mobile ? 844 : 900, mobile });
const logs = [], cellLogs = [];
b.on((m) => {
  if (m.sessionId !== ctx.sessionId) return;
  if (m.method === 'Runtime.consoleAPICalled') {
    const t = m.params.args.map((a) => a.value ?? a.description).join(' ');
    if (/Zellbahnen gezeichnet/.test(t)) cellLogs.push(t.replace(/^.*Zellen, /, '').slice(-160));
    if (m.params.type === 'error' || m.params.type === 'warning') logs.push(`${m.params.type}: ${t.slice(0, 200)}`);
  }
  if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails.exception?.description?.slice(0, 300)}`);
  if (m.method === 'Fetch.requestPaused' && /_dwd_opendata/.test(m.params.request.url)) {
    ctx.send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 503, body: '' }).catch(() => {});
  } else if (m.method === 'Fetch.requestPaused') {
    ctx.send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body: body.toString('base64') }).catch(() => {});
  }
});
await ctx.send('Fetch.enable', { patterns: [{ urlPattern: '*konrad3d/*/cells.json*' }, { urlPattern: '*_dwd_opendata/weather/radar/konrad3d/*' }] });
await ctx.send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, 30000));
const state = await ctx.evaluate(`(() => {
  const el = document.querySelector('.nc-radar-eta');
  const cs = el ? getComputedStyle(el) : null;
  const r = el?.getBoundingClientRect();
  return {
    leiste: el?.innerText ?? null, cls: el?.className ?? null, bg: cs?.backgroundColor, color: cs?.color, border: cs?.borderTopColor,
    box: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
    satz: document.querySelector('.zo-card')?.innerText.split('\\n').slice(0, 3).join(' | ') ?? null,
  };
})()`);
const shot = await ctx.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
state.cellLogs = cellLogs; state.logs = logs;
console.log(JSON.stringify(state, null, 1));
await ctx.close(); await b.close();
