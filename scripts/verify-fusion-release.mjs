/**
 * verify:fusion-release — the guard of the register of stands of buscosun Fusion (`src/pointForecast/fusion/fusionRelease.ts`,
 * `audit/fusion-release.md`). It answers one question: does every part of the platform follow a new stand by itself?
 *
 *   A  the register itself: stands without gaps, the newest stand, the stage per switch, notes and product stamps
 *   B  no fixed stand outside the register: no „buscosun Fusion <n>" in code (comments are free), no hand-copied
 *      option of a stand — each with a counter-probe on the pattern, exceptions listed WITH their reason
 *   C  every part of the platform is wired to the register (table: part → how it follows); FR-2: no part calls the live path
 *      directly (C3), the entry `getFusionForecast` chooses the path, adds the DWD UV and calls the stage (C4)
 *   D  --live: the published data products — which stand they were built with (informational; a product behind
 *      follows at its next producer run, `repeatVerdict` does not skip that run)
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-fusion-release.mjs [--live]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FUSION_RELEASES, FUSION_BASE, FUSION_BASE_OPTIONS, FUSION_CURRENT, FUSION_NAME, FUSION_BRAND, FUSION_STAGE_NOTE_PREFIX,
  fusionName, fusionStage, fusionStageIo, fusionStageNote, fusionVersionOfNotes, fusionVersionOfEngine, fusionProductBehind, FUSION_PARTS,
} from '../src/pointForecast/fusion/fusionRelease.ts';
import { ROAD_FC_RAW_BASE, ROAD_FC_INDEX_PATH, ROAD_FC_SOURCE_TEXT, roadFcSourceText } from '../src/road/roadFc.ts';
import { roadFcEngineName, roadFcUiNote } from '../src/road/roadFcView.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LIVE = process.argv.includes('--live');
const checks = [];
const add = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
const info = (line) => console.log(`      ${line}`);
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

// ── A: the register ──────────────────────────────────────────────────────────
{
  const ns = FUSION_RELEASES.map((r) => r.n);
  add('A1 Stände lückenlos aufsteigend ab der Basis, jeder mit Datum, Beleg, Option, Notiz; Optionen und Schalter je einmal',
    ns.every((n, i) => n === FUSION_BASE + 1 + i) && FUSION_RELEASES.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.ref && r.option && r.note)
    && new Set(FUSION_RELEASES.map((r) => r.option)).size === ns.length && new Set(FUSION_RELEASES.filter((r) => r.io).map((r) => r.io.key)).size === FUSION_RELEASES.filter((r) => r.io).length
    && FUSION_RELEASES.every((r) => !(r.option in FUSION_BASE_OPTIONS)), ns.join(', '));
  const on = FUSION_RELEASES.filter((r) => r.value !== false && r.value !== 0);
  const full = fusionStage();
  add('A2 neuester Stand = höchster eingeschalteter Stand ohne Lücke; Name daraus; die Stufe ohne Schalter rechnet ihn mit Basis + jeder Option',
    FUSION_CURRENT === (on.length ? on[on.length - 1].n : FUSION_BASE) && FUSION_NAME === `${FUSION_BRAND} ${FUSION_CURRENT}` && full.version === FUSION_CURRENT && full.current && full.label === FUSION_NAME
    && Object.entries(FUSION_BASE_OPTIONS).every(([k, v]) => full.options[k] === v) && on.every((r) => full.options[r.option] === r.value) && on.every((r) => full.note.includes(r.note)), FUSION_NAME);
  // Every stand with a switch: off ⇒ the stand before, its option gone, the others kept.
  const sw = FUSION_RELEASES.filter((r) => r.io);
  const offOk = sw.every((r) => {
    const s = fusionStage((x) => x.n === r.n);
    return s.version === r.n - 1 && !s.current && !(r.option in s.options) && !s.note.includes(r.note) && s.label.startsWith(fusionName(r.n - 1)) && (r.offLabel ? s.label === `${fusionName(r.n - 1)} (${r.offLabel})` : s.label === fusionName(r.n - 1))
      && FUSION_RELEASES.filter((x) => x.n !== r.n).every((x) => s.options[x.option] === x.value);
  });
  add('A3 je Schalter (CubeIo-Feld = false): der Stand davor, Option und Notiz dieses Stands fehlen, alle anderen bleiben', offOk && sw.length > 0, sw.map((r) => `${r.io.flag} ⇒ ${fusionStage((x) => x.n === r.n).label}`).join(' · '));
  const io = fusionStageIo();
  add('A4 CubeIo der Stufe: Tabellen json, stage fs, Leser-Schalter der Stände mit `set`',
    io.learnedSource === 'json' && io.climaSource === 'json' && io.stackSource === 'json' && io.stage === 'fs' && FUSION_RELEASES.every((r) => (r.io?.set ? io[r.io.key] === true : !r.io || !(r.io.key in io))));
  const note = fusionStageNote(full, ', Stationswert');
  add('A5 Stufen-Notiz ⇄ Stand: geschrieben und zurückgelesen, auch hinter einem Schalter; ohne Stufen-Notiz kein Stand (Gegenprobe)',
    note.startsWith(FUSION_STAGE_NOTE_PREFIX + FUSION_NAME + '): ') && fusionVersionOfNotes(['x', note]) === FUSION_CURRENT
    && sw.every((r) => fusionVersionOfNotes([fusionStageNote(fusionStage((x) => x.n === r.n), '')]) === r.n - 1)
    && fusionVersionOfNotes(['stage:fs — keine gelernten Tabellen ⇒ Rechnung wie ohne die Stufe']) === null && fusionVersionOfNotes([]) === null, note.slice(0, 60) + '…');
  add('A6 Stand eines Datenprodukts: Nummer, sonst Name; nichts von beidem ⇒ unbekannt; „zurück" genau dann, wenn nicht der neueste Stand',
    fusionVersionOfEngine({ name: 'x', version: 12 }) === 12 && fusionVersionOfEngine({ name: fusionName(8) }) === 8 && fusionVersionOfEngine({ name: 'buscosun Fusion 8 beta' }) === null
    && fusionVersionOfEngine({}) === null && fusionVersionOfEngine(null) === null
    && fusionProductBehind({ name: fusionName(FUSION_CURRENT - 1) }) && fusionProductBehind({}) && !fusionProductBehind({ name: FUSION_NAME }) && !fusionProductBehind({ version: FUSION_CURRENT }));
}

// ── B: no fixed stand outside the register ───────────────────────────────────
const REGISTER = 'src/pointForecast/fusion/fusionRelease.ts';
/** Code only: block comments, JSDoc lines and line comments removed (a `//` after `:` is a URL and stays). */
export function codeOf(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split('\n').map((l) => {
    const t = l.trimStart();
    if (t.startsWith('//') || t.startsWith('*')) return '';
    const i = l.search(/(^|[^:'"`\\])\/\/ /);
    return i < 0 ? l : l.slice(0, i + (l[i] === '/' ? 0 : 1));
  }).join('\n');
}
const walk = (dir, out = []) => {
  for (const f of readdirSync(join(ROOT, dir))) {
    const p = `${dir}/${f}`;
    if (statSync(join(ROOT, p)).isDirectory()) { if (!/^(node_modules|__fixtures__|fixtures)$/.test(f)) walk(p, out); } else if (/\.(ts|tsx|mjs|js)$/.test(f)) out.push(p);
  }
  return out;
};
// Not scanned: verifiers (they pin wordings on purpose), the offline research of the learning phase (its variants ARE fixed stands),
// the test bench (`scripts/pruefstand/`: it registers and replays the historical stands 5e…9 with their commits — fixed on purpose).
const SKIP = (p) => /^scripts\/verify-/.test(p) || /^scripts\/(fusionfit|hindcast|pruefstand)\//.test(p) || p === REGISTER;
const FILES = [...walk('src'), ...walk('scripts'), ...walk('netlify')].filter((p) => !SKIP(p));

/** Fixed numbers that are right as they are — the stand that INTRODUCED an option, in the engine's provenance lines. */
const NAME_EXCEPTIONS = [
  { file: 'src/pointForecast/cubeSource.ts', has: 'precipCal:archive', why: 'Provenienzzeile der Option precipCal (aus): nennt den Stand, mit dem sie gemessen wurde' },
  { file: 'src/pointForecast/cubeSource.ts', has: 'nowcastHourMean:set', why: 'Provenienzzeile des Radar-Stundenmittels: nennt den Kandidaten, als der es gemessen wurde (Wortlaut im Archiv)' },
];
const NAME_RE = /buscosun Fusion \d/;
{
  const hits = [];
  for (const p of FILES) codeOf(src(p)).split('\n').forEach((l, i) => { if (NAME_RE.test(l)) hits.push({ p, line: i + 1, l }); });
  const open = hits.filter((h) => !NAME_EXCEPTIONS.some((e) => e.file === h.p && h.l.includes(e.has)));
  const used = NAME_EXCEPTIONS.filter((e) => hits.some((h) => e.file === h.p && h.l.includes(e.has)));
  const probe = codeOf("const a = 'buscosun Fusion 8';\n// buscosun Fusion 7\n/** buscosun Fusion 6\n * buscosun Fusion 5 */\nconst u = 'https://x/y'; // buscosun Fusion 4\nconst b = `${n} buscosun Fusion 3`;");
  add('B1 Gegenprobe: das Muster trifft Zeichenketten und Vorlagen, nicht Kommentare; eine URL bleibt ganz',
    NAME_RE.test(probe) && /Fusion 8/.test(probe) && /Fusion 3/.test(probe) && !/Fusion [4567]/.test(probe) && probe.includes("'https://x/y'"));
  add(`B2 kein fester Stand „buscosun Fusion <n>" im Code außerhalb des Registers (${FILES.length} Dateien; Kommentare frei; ${NAME_EXCEPTIONS.length} begründete Ausnahmen, jede noch gebraucht)`,
    open.length === 0 && used.length === NAME_EXCEPTIONS.length, open.slice(0, 6).map((h) => `${h.p}:${h.line}`).join(', ') || NAME_EXCEPTIONS.filter((e) => !used.includes(e)).map((e) => `Ausnahme ohne Treffer: ${e.has}`).join(', '));
  for (const e of NAME_EXCEPTIONS) info(`Ausnahme ${e.file} „${e.has}": ${e.why}`);

  // Hand-copied options of a stand: an object key of a stand's option outside the engine and the reader.
  const keys = [...FUSION_RELEASES.map((r) => r.option), ...Object.keys(FUSION_BASE_OPTIONS)];
  const KEY_RE = new RegExp(`(^|[^.\\w])(${keys.join('|')})\\s*:\\s*[^;]`);
  // Where these keys are DEFINED or read as options: the engine and its reader, the URL switches, the scorer of the archive.
  const KEY_HOME = (p) => /^src\/pointForecast\//.test(p) || /^src\/point\//.test(p);
  const khits = [];
  for (const p of FILES) if (!KEY_HOME(p)) codeOf(src(p)).split('\n').forEach((l, i) => { if (KEY_RE.test(l)) khits.push(`${p}:${i + 1}`); });
  const kprobe = (s) => KEY_RE.test(codeOf(s));
  add('B3 keine handkopierte Option eines Stands (Objektschlüssel) außerhalb von Motor und Leser; Gegenprobe: das Muster trifft die frühere Liste, nicht den Zugriff über das Register',
    khits.length === 0 && kprobe('  anchorWindKm: FUSION7_ANCHOR_WIND_KM, nowcastHourMean: true,') && kprobe('{ learnedAtPoint: true }') && !kprobe('hourMean: fusionStage().options.nowcastHourMean === true, runs,') && !kprobe('...fusionStage().options,'),
    khits.slice(0, 6).join(', '));
}

// ── C: every part of the platform follows the register ───────────────────────
{
  const has = (p, ...needles) => { const s = codeOf(src(p)); return needles.every((n) => (n instanceof RegExp ? n.test(s) : s.includes(n))); };
  const PARTS = [
    { part: 'Motor (Stufe fs)', file: 'src/pointForecast/cubeSource.ts', how: 'fusionStage / fusionStageNote / fusionStageIo', ok: (p) => has(p, 'fusionStage((r) =>', 'fusionStageNote(st,', '...fusionStageIo(),') },
    { part: 'Punkt-Panel', file: 'src/pointForecast/PointForecastPanel.tsx', how: "pointSource: 'cube' ⇒ defaultCubeIo()", ok: (p) => has(p, "pointSource: 'cube'") },
    { part: 'Wetter-Dashboard', file: 'src/dashboard/data/forecastStore.ts', how: 'defaultCubeIo()', ok: (p) => has(p, 'defaultCubeIo()', "pointSource: 'cube'") },
    { part: 'Regenradar-Streifen', file: 'src/nowcast/nowcastEngine.ts', how: "pointSource: 'cube' ⇒ defaultCubeIo()", ok: (p) => has(p, "pointSource: 'cube'", "import('../pointForecast/cubeSource')") },
    { part: 'Streckenprognose road/fc (Producer)', file: 'scripts/road/road-forecast.mjs', how: 'fusionStageIo(), Name + Nummer im Kopf, Neubau bei älterem Stand', ok: (p) => has(p, '...fusionStageIo(),', 'name: FUSION_NAME, version: FUSION_CURRENT', 'fusionVersionOfNotes(fc.cube.notes) === FUSION_CURRENT', 'fusionVersionOfEngine(prev.engine)', 'roadFcSourceText(FUSION_NAME') },
    { part: 'Autobahnwetter (Seite)', file: 'src/road/RoadReadout.tsx', how: 'Name aus der Laufdatei (roadFcEngineName)', ok: (p) => has(p, 'roadFcEngineName(file)', 'roadFcUiNote(p.fcFile)') },
    { part: 'Kartenfelder point/field (Producer)', file: 'scripts/point/build-point-fields.mjs', how: 'fusionStage().options, Stand im Manifest (chain.options.fusion)', ok: (p) => has(p, '...fusionStage().options,', 'fusion: FUSION_CURRENT') },
    // FR-2 (§8): the parts that used to call the live path reach buscosun Fusion through the entry; each follows once it is on.
    ...[
      ['route', 'src/pointForecast/weatherEnrichment.ts', 'Wetter je Abschnitt'],
      ['route', 'src/route/windSampling.ts', 'Wind der Tourzeit'],
      ['event', 'src/event/EventResult.tsx', 'Tage bewerten'],
      ['event', 'src/event/eventZoneScan.ts', 'Ecken der Fläche'],
      ['event', 'src/event/eventAltLocation.ts', 'besserer Ort'],
      ['section', 'src/threed/buildCrossSection.ts', 'Anker des Schnitts'],
      ['section', 'src/atmosphere/TalwindPanel.tsx', 'Talwind'],
      ['notify', 'src/notifications/useNotifications.tsx', 'Abo-Prüfung'],
    ].map(([id, file, what]) => {
      const part = FUSION_PARTS.find((p) => p.id === id);
      return { part: `${part.name} (${what})`, file, gate: part, how: `getFusionForecast(…, '${id}') — ${part.on ? 'an' : 'aus bis zur Messung (§8.4), rechnet den Live-Pfad'}`, ok: (p) => has(p, `getFusionForecast(`, `}, '${id}')`) };
    }),
  ];
  const bad = PARTS.filter((x) => !x.ok(x.file));
  add(`C1 jeder der ${PARTS.length} Plattformteile hängt am Register`, bad.length === 0, bad.map((x) => x.part).join(', '));
  for (const x of PARTS) info(`${!x.ok(x.file) ? 'NICHT am Register' : x.gate && !x.gate.on ? 'Live-Pfad (Teil aus)' : FUSION_NAME}  ${x.part} — ${x.how}`);

  // C3: no part of the platform calls the live path directly — every `getPointForecast(` in src asks for the cube or is a named
  // fallback of a part that already computes on the cube. A future part that calls the live path makes this red.
  const CORE = new Set(['src/pointForecast/pointForecast.ts', 'src/pointForecast/fusionForecast.ts', 'src/pointForecast/cubeSource.ts']);
  const LIVE_EXCEPTIONS = [
    { file: 'src/pointForecast/PointForecastPanel.tsx', n: 2, why: 'Rückfall und ?pf=live des Punkt-Panels (rechnet sonst auf dem Cube, E-FS-7)' },
    { file: 'src/nowcast/nowcastEngine.ts', n: 1, why: 'Rückfall und ?pf=live des Regenradar-Streifens (rechnet sonst auf dem Cube, RR-e)' },
  ];
  const liveCalls = (code) => {
    const out = [];
    for (const m of code.matchAll(/(?<![\w.])getPointForecast\(/g)) {
      if (/function\s+$/.test(code.slice(Math.max(0, m.index - 16), m.index))) continue;
      let depth = 0, i = m.index + m[0].length - 1;
      for (; i < code.length; i++) { if (code[i] === '(') depth++; else if (code[i] === ')' && --depth === 0) break; }
      const call = code.slice(m.index, i + 1);
      if (!/pointSource:\s*'cube'/.test(call)) out.push(code.slice(0, m.index).split('\n').length);
    }
    return out;
  };
  const found = new Map();
  for (const p of FILES) if (p.startsWith('src/') && !CORE.has(p)) { const l = liveCalls(codeOf(src(p))); if (l.length) found.set(p, l); }
  const open = [...found].filter(([p, l]) => !LIVE_EXCEPTIONS.some((e) => e.file === p && e.n === l.length));
  const probe = liveCalls("const a = await getPointForecast({ lat, lng, country, hours: 24 });\nconst b = await getPointForecast({ lat, lng, country, pointSource: 'cube' });\nexport async function getPointForecast(opts) {}\nx.getPointForecast(q);\nconst c = getFusionForecast({ lat }, 'route');");
  add('C3 Gegenprobe: das Muster trifft einen direkten Live-Aufruf, nicht den Cube-Aufruf, die Definition, eine Methode oder den Einstieg', probe.length === 1 && probe[0] === 1, `Treffer in Zeile ${probe.join(', ')}`);
  add(`C3 kein Plattformteil ruft den Live-Pfad direkt (src ohne Kern; ${LIVE_EXCEPTIONS.length} benannte Rückfälle, Zahl je Datei fest)`,
    open.length === 0 && LIVE_EXCEPTIONS.every((e) => found.get(e.file)?.length === e.n), open.map(([p, l]) => `${p}:${l.join('/')}`).join(', '));
  for (const e of LIVE_EXCEPTIONS) info(`Rückfall ${e.file} (${e.n}×): ${e.why}`);

  // C4: the entry itself — path choice, UV supplement without touching the shared cube object, the cube call it makes.
  const ff = await import('../src/pointForecast/fusionForecast.ts');
  const pf = await import('../src/pointForecast/pointForecast.ts');
  add('C4 Weg je Teil: aus ⇒ live, an ⇒ Cube, ?pf=cube erzwingt den Cube, ?pf=live erzwingt live, ein fremder Wert ändert nichts',
    ff.fusionPathFor('route', '', false) === 'live' && ff.fusionPathFor('route', '', true) === 'cube' && ff.fusionPathFor('route', '?pf=cube', false) === 'cube'
    && ff.fusionPathFor('event', '?pf=live', true) === 'live' && ff.fusionPathFor('event', '?pf=xyz', false) === 'live' && ff.fusionPathFor('event', '?pf=xyz', true) === 'cube'
    && FUSION_PARTS.every((p) => ff.fusionPathFor(p.id, '') === (p.on ? 'cube' : 'live')));
  const H = 3_600_000, t0 = Math.floor(Date.UTC(2026, 9, 6, 9, 20) / H) * H;
  const conf0 = { temperature: 0.5, wind: 0.5, gust: 0.5, humidity: 0.5, precipitation: 0.5, clouds: 0.5, snowLine: 0, uvIndex: 0 };
  const hour = (k, uv) => ({ timestamp: new Date(t0 + k * H), temperature: 10, uvIndex: uv, confidence: { ...conf0 } });
  const fc = { query: { lat: 48.1, lng: 11.6, elevation: 520, country: 'DE' }, hours: [hour(0, null), hour(1, 3.5), hour(2, null), hour(3, null)], fetchedAt: t0, lapseRatePerM: 0.0065, nearestStations: [], sourcesAvailable: ['cube'], cube: { notes: ['n'] } };
  const before = JSON.stringify(fc);
  const uv = [{ time: new Date(t0), uvIndex: 1.2 }, { time: new Date(t0 + H), uvIndex: 9 }, { time: new Date(t0 + 2 * H), uvIndex: 2.4 }, { time: new Date(t0 + 3 * H), uvIndex: null }];
  const out = ff.withDwdUv(fc, uv, t0 + 20 * 60_000);
  add('C4 DWD-UV: nur leere Stunden gefüllt (Cube-Wert bleibt), Sicherheit wie eine Einzelquelle im Live-Pfad, Herkunft dwd_uv + cube.uv, das geteilte Cube-Objekt unverändert; ohne UV-Wert dasselbe Objekt',
    out !== fc && JSON.stringify(fc) === before && out.hours[0].uvIndex === 1.2 && out.hours[1].uvIndex === 3.5 && out.hours[2].uvIndex === 2.4 && out.hours[3].uvIndex === null
    && out.hours[2].confidence.uvIndex === pf.singleSourceConfidence('uvIndex', 2) && out.hours[1].confidence.uvIndex === 0 && out.hours[0].confidence.temperature === 0.5
    && out.sourcesAvailable.includes('dwd_uv') && out.cube.uv?.hours === 2 && out.cube.notes[0] === 'n'
    && ff.withDwdUv(fc, [], t0) === fc && ff.withDwdUv(fc, [{ time: new Date(t0 + 99 * H), uvIndex: 4 }], t0) === fc,
    `UV ${out.hours.map((h) => h.uvIndex).join('/')}`);
  // The cube call: the entry loads cubeSource (it registers itself), then the stub registered here stands in for it.
  await import('../src/pointForecast/cubeSource.ts');
  const seen = [];
  pf.registerPointSource('cube', async (o) => { seen.push(o); if (o.lat === 0) { const e = new Error('stop'); e.name = 'AbortError'; throw e; } return { ...fc, query: { ...fc.query, country: o.country } }; });
  const got = await ff.getFusionForecast({ lat: 47.3, lng: 11.4, country: 'AT', hours: 36 }, 'section', { path: 'cube' });
  let aborted = false;
  try { await ff.getFusionForecast({ lat: 0, lng: 0, country: 'AT', hours: 8 }, 'route', { path: 'cube' }); } catch (e) { aborted = e?.name === 'AbortError'; }
  add('C4 Cube-Aufruf des Einstiegs: Stufe mit Radar (includeRadarNowcast), pointSource cube, Stunden des Teils; außerhalb DE kein UV-Abruf; ein Abbruch fällt NICHT auf live zurück',
    seen[0]?.pointSource === 'cube' && seen[0]?.includeRadarNowcast === true && seen[0]?.hours === 36 && got.query.country === 'AT' && !got.sourcesAvailable.includes('dwd_uv') && aborted && seen.length === 2);
  add('C2 Texte der Streckenprognose: der Producer schreibt den neuesten Stand in den Quelltext (roadFcSourceText(FUSION_NAME)), der Vertrag selbst nennt ohne Datei nur die Marke (er lädt das Register nicht — Archiv-Job, V-AW-35); die Seite nennt den Stand der DATEI (älter ⇒ ältere Nummer)',
    roadFcSourceText(FUSION_NAME).startsWith(FUSION_NAME + ' ') && ROAD_FC_SOURCE_TEXT.startsWith(FUSION_BRAND + ' auf') && roadFcEngineName({ engine: { name: fusionName(FUSION_CURRENT - 1) } }) === fusionName(FUSION_CURRENT - 1)
    && roadFcEngineName({ engine: { name: FUSION_NAME, version: FUSION_CURRENT } }) === FUSION_NAME && roadFcEngineName(null) === FUSION_BRAND && roadFcUiNote(null).startsWith(`Prognose: ${FUSION_BRAND},`));
}

// ── D: published data products (informational) ───────────────────────────────
if (LIVE) {
  const get = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
  try {
    const idx = await get(`${ROAD_FC_RAW_BASE}/${ROAD_FC_INDEX_PATH}`);
    const e = idx.runs?.[0]?.engine, v = fusionVersionOfEngine(e);
    info(`road/fc Lauf ${idx.runs?.[0]?.run ?? '—'}: ${v == null ? 'Stand unbekannt' : fusionName(v)} — ${fusionProductBehind(e) ? `zieht beim nächsten Lauf auf ${FUSION_NAME} nach (kein Wiederholungs-Schutz)` : 'nachgezogen'}`);
  } catch (err) { info(`road/fc: nicht lesbar (${err.message})`); }
  try {
    const idx = await get('https://raw.githubusercontent.com/jppetry/buscosun-data/main/point/field/v1/index.json');
    for (const [tier, l] of Object.entries(idx.latestByTier ?? {})) {
      const man = await get(`https://raw.githubusercontent.com/jppetry/buscosun-data/main/point/field/v1/${l.run}/${tier}/manifest.json`).catch(() => null);
      const v = man?.chain?.options?.fusion;
      info(`point/field ${tier} Lauf ${l.run}: ${typeof v === 'number' ? fusionName(v) : 'Stand nicht im Manifest (vor dem Register gebaut)'} — ${v === FUSION_CURRENT ? 'nachgezogen' : 'zieht mit dem nächsten Punkt-Cron nach'}`);
    }
  } catch (err) { info(`point/field: nicht lesbar (${err.message})`); }
} else info('Datenprodukte im Daten-Repo: mit --live (liest road/fc und point/field, nur Auskunft)');

const passed = checks.filter((c) => c.ok).length;
console.log(`\nverify:fusion-release — ${passed}/${checks.length} · neuester Stand ${FUSION_NAME}`);
process.exit(passed === checks.length ? 0 : 1);
