/**
 * verify:fusion-release — the guard of the register of stands of buscosun Fusion (`src/pointForecast/fusion/fusionRelease.ts`,
 * `audit/fusion-release.md`). It answers one question: does every part of the platform follow a new stand by itself?
 *
 *   A  the register itself: stands without gaps, the newest stand, the stage per switch, notes and product stamps
 *   B  no fixed stand outside the register: no „buscosun Fusion <n>" in code (comments are free), no hand-copied
 *      option of a stand — each with a counter-probe on the pattern, exceptions listed WITH their reason
 *   C  every part of the platform is wired to the register (table: part → how it follows)
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
  fusionName, fusionStage, fusionStageIo, fusionStageNote, fusionVersionOfNotes, fusionVersionOfEngine, fusionProductBehind,
} from '../src/pointForecast/fusion/fusionRelease.ts';
import { ROAD_FC_RAW_BASE, ROAD_FC_INDEX_PATH, ROAD_FC_SOURCE_TEXT } from '../src/road/roadFc.ts';
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
// Not scanned: verifiers (they pin wordings on purpose), the offline research of the learning phase (its variants ARE fixed stands).
const SKIP = (p) => /^scripts\/verify-/.test(p) || /^scripts\/(fusionfit|hindcast)\//.test(p) || p === REGISTER;
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
    { part: 'Streckenprognose road/fc (Producer)', file: 'scripts/road/road-forecast.mjs', how: 'fusionStageIo(), Name + Nummer im Kopf, Neubau bei älterem Stand', ok: (p) => has(p, '...fusionStageIo(),', 'name: FUSION_NAME, version: FUSION_CURRENT', 'fusionVersionOfNotes(fc.cube.notes) === FUSION_CURRENT', 'fusionVersionOfEngine(prev.engine)') },
    { part: 'Autobahnwetter (Seite)', file: 'src/road/RoadReadout.tsx', how: 'Name aus der Laufdatei (roadFcEngineName)', ok: (p) => has(p, 'roadFcEngineName(file)', 'roadFcUiNote(p.fcFile)') },
    { part: 'Kartenfelder point/field (Producer)', file: 'scripts/point/build-point-fields.mjs', how: 'fusionStage().options, Stand im Manifest (chain.options.fusion)', ok: (p) => has(p, '...fusionStage().options,', 'fusion: FUSION_CURRENT') },
  ];
  const bad = PARTS.filter((x) => !x.ok(x.file));
  add(`C1 jeder der ${PARTS.length} Plattformteile hängt am Register`, bad.length === 0, bad.map((x) => x.part).join(', '));
  for (const x of PARTS) info(`${x.ok(x.file) ? FUSION_NAME : 'NICHT am Register'}  ${x.part} — ${x.how}`);
  add('C2 Texte der Streckenprognose: der Vertragstext nennt den neuesten Stand; die Seite nennt den Stand der DATEI (älter ⇒ ältere Nummer), ohne Datei nur die Marke',
    ROAD_FC_SOURCE_TEXT.startsWith(FUSION_NAME + ' ') && roadFcEngineName({ engine: { name: fusionName(FUSION_CURRENT - 1) } }) === fusionName(FUSION_CURRENT - 1)
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
