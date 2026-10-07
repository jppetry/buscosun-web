/**
 * SW-1 — Contract of the Seewetter TEXT line: the DWD maritime bulletins (`weather/maritime/forecast/german/`).
 * One module for producer (`scripts/sea/sea-text.mjs`), client and `verify:sea-text`.
 *
 * Shown is ALWAYS the verbatim text. The producer keeps the bytes as `raw` (Latin-1 decoded, char for char — the
 * verifier re-encodes and compares byte for byte) and derives a display text that differs from the bulletin ONLY in
 * whitespace and transport characters: SOH/ETX and the WMO heading are dropped, line ends `\r\r\n`/`\r` become `\n`,
 * the HTML rest `<br>` (FQDL60) is dropped, trailing blanks are trimmed and telex wraps are joined (rule below).
 * `verify:sea-text` proves the invariant "same non-whitespace characters". The structure (areas, days, warning blocks)
 * only maps text to the map and to spots — it is never shown instead of the text.
 *
 * Measured formats: `audit/seewetter-datenpruefung.md` §6, fixtures `audit/seewetter/fixtures/` (+ warning case
 * `WODL45_EDZW_071200`, `audit/seewetter.md` §2.5). Warning status: E-SW-14 — `none` only from the exact known
 * sentence, anything else `unknown` with the text on top; never a "warning" status from pattern matching.
 */

// --- Products ----------------------------------------------------------------------------------

export type SeaTextProduct = 'FQDL50' | 'FQDL51' | 'WODL45' | 'FXDL40' | 'FQDL60';

export interface SeaTextSpec {
  product: SeaTextProduct;
  /** DWD file prefix (`<file>_EDZW_<DDHHMM>`); the bulletin heading differs (FQEN50 file ⇒ FQDL50 heading). */
  file: string;
  title: string;
  /** Last non-empty line of a complete bulletin. */
  end: '=' | 'Seewetterdienst Hamburg';
  /** Nominal issue hours (UTC) of the file stamp; `null` = daily file named DD0000 / DD1400 with a free time. */
  issueHours: readonly number[];
  /** Minutes from the stamp to the DWD file (measured; negative = before the stamp). */
  publishOffsetMin: number;
  /** The client asks for an issue only this long after its DWD time (workflow cadence + GitHub delay + CDN). */
  gateMin: number;
  /** Issue older than this ⇒ "veraltet" (plan: report 6 h, warning status 4 h ⇒ status `unknown`). */
  staleMs: number;
  stage: 1 | 2;
}

const H = 3_600_000;
export const SEA_TEXT_PRODUCTS: Readonly<Record<SeaTextProduct, SeaTextSpec>> = Object.freeze({
  FQDL50: { product: 'FQDL50', file: 'FQEN50', title: 'Seewetterbericht Nord- und Ostsee', end: '=', issueHours: [0, 3, 5, 8, 11, 14, 17, 20], publishOffsetMin: 15, gateMin: 50, staleMs: 6 * H, stage: 1 },
  FQDL51: { product: 'FQDL51', file: 'FQEN51', title: 'Seewetterbericht Deutsche Nord- und Ostseeküste', end: '=', issueHours: [0, 3, 5, 8, 11, 14, 17, 20], publishOffsetMin: 15, gateMin: 50, staleMs: 6 * H, stage: 1 },
  WODL45: { product: 'WODL45', file: 'WODL45', title: 'Starkwind-, Sturm- und Orkanwarnungen', end: 'Seewetterdienst Hamburg', issueHours: [0, 3, 6, 9, 12, 15, 18, 21], publishOffsetMin: -15, gateMin: 50, staleMs: 4 * H, stage: 1 },
  FXDL40: { product: 'FXDL40', file: 'FXDL40', title: 'Mittelfrist Nord- und Ostsee', end: 'Seewetterdienst Hamburg', issueHours: [0], publishOffsetMin: 660, gateMin: 50, staleMs: 36 * H, stage: 1 },
  FQDL60: { product: 'FQDL60', file: 'FQMM60', title: 'Seewetterbericht Mittelmeer', end: '=', issueHours: [14], publishOffsetMin: -104, gateMin: 50, staleMs: 36 * H, stage: 2 },
});
export const SEA_TEXT_STAGE1: readonly SeaTextProduct[] = Object.freeze(['FQDL50', 'FQDL51', 'WODL45', 'FXDL40']);
export const SEA_TEXT_DWD_BASE = 'https://opendata.dwd.de/weather/maritime/forecast/german';
export const seaTextFileName = (p: SeaTextProduct, ddhhmm: string) => `${SEA_TEXT_PRODUCTS[p].file}_EDZW_${ddhhmm}`;
export const seaTextUrl = (p: SeaTextProduct, ddhhmm: string) => `${SEA_TEXT_DWD_BASE}/${seaTextFileName(p, ddhhmm)}`;
export function seaTextProductOfFile(name: string): { product: SeaTextProduct; ddhhmm: string } | null {
  const m = /^([A-Z0-9]{6})_EDZW_(\d{6})$/.exec(name);
  if (!m) return null;
  const p = (Object.values(SEA_TEXT_PRODUCTS) as SeaTextSpec[]).find((s) => s.file === m[1]);
  return p ? { product: p.product, ddhhmm: m[2] } : null;
}

// --- Issue stamps (YYMMDDHHMM, UTC) --------------------------------------------------------------

const two = (n: number) => String(n).padStart(2, '0');
export function seaIssueStamp(ms: number): string {
  const d = new Date(ms);
  return `${two(d.getUTCFullYear() % 100)}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}${two(d.getUTCHours())}${two(d.getUTCMinutes())}`;
}
export function seaIssueMs(s: string): number {
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (!m) return NaN;
  const ms = Date.UTC(2000 + +m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return seaIssueStamp(ms) === s ? ms : NaN;
}
/** DWD `DDHHMM` (no month/year) → full time: the latest day DD whose time is not after `refMs` + 1 day. */
export function resolveDdhhmm(ddhhmm: string, refMs: number): number {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(ddhhmm);
  if (!m || !Number.isFinite(refMs)) return NaN;
  const ref = new Date(refMs + 86_400_000);
  for (let back = 0; back < 3; back++) {
    const y = ref.getUTCFullYear(), mo = ref.getUTCMonth() - back;
    const ms = Date.UTC(y, mo, +m[1], +m[2], +m[3]);
    if (new Date(ms).getUTCDate() === +m[1] && ms <= ref.getTime()) return ms;
  }
  return NaN;
}

/** Newest nominal issues of a product whose gate has passed, newest first (the client steps back on 404). */
export function seaExpectedIssues(p: SeaTextProduct, nowMs: number, n = 4): string[] {
  const s = SEA_TEXT_PRODUCTS[p];
  const out: string[] = [];
  const day0 = Math.floor(nowMs / 86_400_000) * 86_400_000;
  for (let d = 0; d > -4 && out.length < n; d--) {
    for (const h of [...s.issueHours].sort((a, b) => b - a)) {
      const ms = day0 + d * 86_400_000 + h * H;
      if (ms + (s.publishOffsetMin + s.gateMin) * 60_000 <= nowMs) out.push(seaIssueStamp(ms));
      if (out.length >= n) break;
    }
  }
  return out;
}

// --- Bytes → text ------------------------------------------------------------------------------

/** Latin-1 decode, char for char (every bulletin is ASCII or ISO-8859-1 — FXDL40 carries umlauts). */
export function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let k = 0; k < bytes.length; k += 8192) s += String.fromCharCode(...bytes.subarray(k, k + 8192));
  return s;
}

/** Lines of the bulletin body: transport removed, line ends unified, `<br>` dropped, trailing blanks trimmed. */
export function bulletinLines(raw: string): { heading: string | null; lines: string[] } {
  const all = raw.replace(/[\x01\x03]/g, '').split(/\r\r\n|\r\n|\n|\r/).map((l) => l.replace(/<br>/gi, '').replace(/[ \t]+$/, ''));
  let k = 0;
  while (k < all.length && all[k].trim() === '') k++;
  let heading: string | null = null;
  if (k < all.length && /^[A-Z]{4}\d{2} [A-Z]{4} \d{6}/.test(all[k].trim())) { heading = all[k].trim(); k++; }
  const lines = all.slice(k);
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return { heading, lines };
}

const ENDS_LOGICAL = /[.:=!?]$/;
/**
 * Joins telex wraps: line L continues the previous line P when P does not end a sentence or label (`.:=!?`) and
 * either P ended in a blank in the bulletin (the DWD's wrap marker) or L starts with a lower-case letter, a digit or
 * `(`. `NIL` lines stay lines. Only whitespace changes — `verify:sea-text` checks it on every fixture.
 */
export function unwrapLines(raw: string): string[] {
  const src = raw.replace(/[\x01\x03]/g, '').split(/\r\r\n|\r\n|\n|\r/).map((l) => l.replace(/<br>/gi, ''));
  // drop leading blanks and the heading, exactly as bulletinLines
  let k = 0;
  while (k < src.length && src[k].trim() === '') k++;
  if (k < src.length && /^[A-Z]{4}\d{2} [A-Z]{4} \d{6}/.test(src[k].trim())) k++;
  const out: string[] = [];
  let prevRaw = '';
  for (const line of src.slice(k)) {
    const t = line.replace(/[ \t]+$/, '').replace(/^[ \t]+/, '');
    const prev = out.length ? out[out.length - 1] : null;
    const cont = prev != null && prev !== '' && t !== '' && t !== 'NIL' && prev !== 'NIL' && !ENDS_LOGICAL.test(prev)
      && (/[ \t]$/.test(prevRaw) || /^[a-zäöüß0-9(]/.test(t));
    if (cont) out[out.length - 1] = `${prev} ${t}`;
    else out.push(t);
    prevRaw = line;
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  // collapse runs of empty lines to one
  return out.filter((l, i) => !(l === '' && out[i - 1] === ''));
}

/** Non-whitespace characters of a bulletin body (the invariant `verify:sea-text` holds the display text to). */
export function significantChars(s: string): string {
  return s.replace(/[\x01\x03]/g, '').replace(/<br>/gi, '').replace(/\s+/g, '');
}

// --- Berlin time (GZ = gesetzliche Zeit) --------------------------------------------------------

/** UTC offset of Europe/Berlin in hours at a UTC instant (EU rule: CEST from last Sunday of March 01:00 UTC to last Sunday of October 01:00 UTC). */
export function berlinOffsetH(ms: number): number {
  const y = new Date(ms).getUTCFullYear();
  const lastSunday = (month: number) => { const d = new Date(Date.UTC(y, month + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); };
  return ms >= lastSunday(2) && ms < lastSunday(9) ? 2 : 1;
}
/** Local Berlin wall time → UTC ms. */
export function berlinToUtc(y: number, mo: number, d: number, h: number, mi: number): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return guess - berlinOffsetH(guess - 2 * H) * H;
}

// --- Rules and parse ---------------------------------------------------------------------------

export type SeaTextRuleId = 'header' | 'incomplete' | 'issueTime' | 'empty' | 'product';
export const SEA_TEXT_RULES: Readonly<Record<SeaTextRuleId, string>> = Object.freeze({
  product: 'Dateiname gehört zu keinem Produkt der Linie ⇒ verwerfen',
  header: 'Kopf nicht FQDL50/FQDL51/WODL45/FXDL40/FQDL60 mit DWHA oder anderes Produkt als der Dateiname ⇒ verwerfen',
  incomplete: 'Textende fehlt (FQDL50/51/60 ohne „=“, WODL45/FXDL40 ohne „Seewetterdienst Hamburg“) ⇒ verwerfen',
  issueTime: 'Ausgabezeit fehlt oder passt nicht zum Kopf ⇒ verwerfen',
  empty: 'kein Text ⇒ verwerfen',
});

export type WarnStatus = 'none' | 'unknown';
export interface SeaAreaForecast { name: string; id: string | null; wind: string | null; sightWeather: string | null; sea: string | null; other: string[] }
export interface SeaForecastDay { label: string; areas: SeaAreaForecast[] }
export interface WodlSeaArea { name: string; text: string; status: WarnStatus }
export interface WodlCoast { coast: 'Nordseekueste' | 'Ostseekueste' | null; nr: string | null; kind: string | null; issuedText: string | null; issuedAt: string | null; text: string; status: WarnStatus }
export interface FxdlDay { label: string; text: string }
export interface FxdlSea { sea: 'nordsee' | 'ostsee'; heading: string; days: FxdlDay[]; water: { part: string; min: number; max: number }[] }

export type SeaTextParts =
  | { kind: 'report'; situation: string | null; days: SeaForecastDay[]; footnote: string | null }
  | { kind: 'warnings'; seaAreas: WodlSeaArea[]; coasts: WodlCoast[] }
  | { kind: 'medium'; situation: string | null; seas: FxdlSea[]; validTo: string | null; next: string | null }
  | { kind: 'plain' };

export interface SeaTextDoc {
  schema: 1;
  product: SeaTextProduct;
  file: string;
  heading: string;
  /** `YYMMDDHHMM` UTC of the heading's DDHHMM. */
  issue: string;
  /** Issue time stated by the bulletin (UTC ISO), else the heading time. */
  issuedAt: string;
  issuedFrom: 'text' | 'heading';
  /** Verbatim bulletin (Latin-1 decoded bytes, unchanged). */
  raw: string;
  /** Display text: `raw` with whitespace/transport changes only (see module comment). */
  text: string;
  parts: SeaTextParts;
  encoding: 'ascii' | 'latin1';
  bytes: number;
  /** Filled by the producer (Node crypto). */
  sha256?: string;
  dwdAt?: string | null;
  fetchedAt?: string;
}

export interface SeaTextVerdict { ok: boolean; reasons: { rule: SeaTextRuleId; detail: string }[]; doc: SeaTextDoc | null }

/** Sea areas of FQDL50 (ASCII spelling of the bulletin) → DWD WARNCELLID (sea area shapes, E-SW-13). */
export const SEA_AREA_IDS: Readonly<Record<string, string>> = Object.freeze({
  'Deutsche Bucht': '401000008', 'Suedwestliche Nordsee': '401000003', 'Fischer': '401000009', 'Skagerrak': '401000011',
  'Kattegat': '401000012', 'Belte und Sund': '401000013', 'Westliche Ostsee': '401000014', 'Suedliche Ostsee': '401000016',
  'Suedoestliche Ostsee': '401000017', 'Boddengewaesser Ost': '401000015',
});
/** Coast sections of FQDL51 → DWD WARNCELLID (coast shapes). */
export const SEA_COAST_IDS: Readonly<Record<string, string>> = Object.freeze({
  'Ostfriesische Kueste': '501000001', 'Helgoland': '501000002', 'Elbmuendung': '501000003', 'Elbe von Hamburg bis Cuxhaven': '501000004',
  'Nordfriesische Kueste': '501000005', 'Flensburg bis Fehmarn': '501000006', 'Oestlich Fehmarn bis Ruegen': '501000007',
  'Boddengewaesser Ost und oestlich Ruegen': '501000008',
});
/** WODL45 English sea areas → FQDL50 area id (the warning blocks map onto the same shapes). */
export const WODL_AREA_IDS: Readonly<Record<string, string>> = Object.freeze({
  'GERMAN BIGHT': '401000008', 'WESTERN BALTIC': '401000014', 'SOUTHERN BALTIC': '401000016',
});

/** The only sentence that yields "keine Warnung" for a coast (E-SW-14), compared after collapsing whitespace. */
export const wodlNoWarningSentence = (coast: 'Nordseekueste' | 'Ostseekueste') => `Fuer die deutsche ${coast} besteht keine Starkwind-, Sturm- oder Orkanwarnung.`;
export const WODL_SEA_NO_WARNING = 'no warning.';
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

const FIELD = /^(Wind|Sicht\/Wetter|Seegang):\s*(.*)$/;
const HEAD = /^([A-ZÄÖÜa-zäöüß][^:]{0,60}):$/;

function parseReport(logical: string[]): SeaTextParts {
  let situation: string | null = null, footnote: string | null = null;
  const days: SeaForecastDay[] = [];
  let mode: 'pre' | 'situation' | 'day' = 'pre';
  let area: SeaAreaForecast | null = null;
  const situ: string[] = [];
  for (const l of logical) {
    if (l === '' || l === '=') continue;
    if (/^Wetterlage:/.test(l)) { mode = 'situation'; const rest = l.replace(/^Wetterlage:\s*/, ''); if (rest) situ.push(rest); continue; }
    const day = /^(Vorhersage fuer .+?):\s*$/.exec(l);
    if (day) { mode = 'day'; days.push({ label: day[1], areas: [] }); area = null; continue; }
    if (/^Windstaerke in Beaufort/.test(l)) { footnote = l; continue; }
    if (mode === 'situation') { situ.push(l); continue; }
    if (mode !== 'day') continue;
    const f = FIELD.exec(l);
    if (f && area) {
      const key = f[1] === 'Wind' ? 'wind' : f[1] === 'Seegang' ? 'sea' : 'sightWeather';
      area[key] = area[key] ? `${area[key]} ${f[2]}` : f[2];
      continue;
    }
    const h = HEAD.exec(l);
    if (h) {
      if (h[1] === 'Nordseekueste' || h[1] === 'Ostseekueste') { area = null; continue; }   // FQDL51 group headings
      area = { name: h[1], id: SEA_AREA_IDS[h[1]] ?? SEA_COAST_IDS[h[1]] ?? null, wind: null, sightWeather: null, sea: null, other: [] };
      days[days.length - 1].areas.push(area);
      continue;
    }
    if (area) area.other.push(l);
  }
  if (situ.length) situation = situ.join(' ');
  return { kind: 'report', situation, days, footnote };
}

function parseWarnings(lines: string[]): SeaTextParts {
  const seaAreas: WodlSeaArea[] = [];
  const coasts: WodlCoast[] = [];
  // English sea-area blocks: "<AREA>:" followed by text up to the next blank line.
  for (let i = 0; i < lines.length; i++) {
    const m = /^(GERMAN BIGHT|WESTERN BALTIC|SOUTHERN BALTIC):$/.exec(lines[i].trim());
    if (!m) continue;
    const body: string[] = [];
    for (let k = i + 1; k < lines.length && lines[k].trim() !== ''; k++) body.push(lines[k].trim());
    const text = body.join('\n');
    seaAreas.push({ name: m[1], text, status: collapse(text) === WODL_SEA_NO_WARNING ? 'none' : 'unknown' });
  }
  // German coast blocks: "NR. <n>" … up to the next "NR." or the closing line.
  const starts = lines.map((l, i) => (/^NR\.\s*\d+/.test(l.trim()) ? i : -1)).filter((i) => i >= 0);
  starts.forEach((s, n) => {
    const end = n + 1 < starts.length ? starts[n + 1] : lines.findIndex((l, i) => i > s && l.trim() === 'Seewetterdienst Hamburg');
    const block = lines.slice(s, end > s ? end : lines.length).map((l) => l.trim());
    const nr = /^NR\.\s*(\d+)/.exec(block[0])?.[1] ?? null;
    const coastLine = block.find((l) => /^fuer die deutsche (Nordsee|Ostsee)kueste$/.test(l));
    const coast = coastLine ? (/(Nordsee|Ostsee)kueste/.exec(coastLine)![0] as 'Nordseekueste' | 'Ostseekueste') : null;
    const issuedText = block.find((l) => /^herausgegeben am /.test(l)) ?? null;
    const im = issuedText ? /den (\d{2})\.(\d{2})\.(\d{4}) um (\d{2}):(\d{2}) Uhr GZ/.exec(issuedText) : null;
    const kind = block[1] && !/^fuer die deutsche/.test(block[1]) ? block[1] : null;
    // Message = everything after the first blank line of the block.
    const blank = block.indexOf('');
    const msg = blank >= 0 ? block.slice(blank + 1).join('\n').replace(/\n+$/, '').trim() : '';
    const status: WarnStatus = coast && collapse(msg) === wodlNoWarningSentence(coast) ? 'none' : 'unknown';
    coasts.push({ coast, nr, kind, issuedText, issuedAt: im ? new Date(berlinToUtc(+im[3], +im[2], +im[1], +im[4], +im[5])).toISOString() : null, text: msg, status });
  });
  // A coast without its own block is unknown — never silently "no warning".
  for (const c of ['Nordseekueste', 'Ostseekueste'] as const) {
    if (!coasts.some((x) => x.coast === c)) coasts.push({ coast: c, nr: null, kind: null, issuedText: null, issuedAt: null, text: '', status: 'unknown' });
  }
  for (const a of Object.keys(WODL_AREA_IDS)) if (!seaAreas.some((x) => x.name === a)) seaAreas.push({ name: a, text: '', status: 'unknown' });
  return { kind: 'warnings', seaAreas, coasts };
}

function parseMedium(logical: string[], lines: string[]): SeaTextParts {
  const seas: FxdlSea[] = [];
  let situation: string | null = null, validTo: string | null = null, next: string | null = null;
  let cur: FxdlSea | null = null, inTemp = false, inSitu = false;
  const situ: string[] = [];
  for (const l of logical) {
    if (/^gültig bis /.test(l)) { validTo = l; continue; }
    if (/^Nächste Aktualisierung/.test(l)) { next = l; continue; }
    if (/^Wetterlage/.test(l)) { inSitu = true; continue; }
    const v = /^Vorhersage für die (Nordsee|Ostsee)/.exec(l);
    if (v) { inSitu = false; cur = { sea: v[1] === 'Nordsee' ? 'nordsee' : 'ostsee', heading: l, days: [], water: [] }; seas.push(cur); inTemp = false; continue; }
    if (inSitu) { if (l) situ.push(l); continue; }
    if (!cur || l === '') { inTemp = false; continue; }
    if (/^Temperaturen Wasser/.test(l)) { inTemp = true; continue; }
    if (inTemp) {
      const w = /^(\S+) (-?\d+) bis (-?\d+) Grad$/.exec(l);
      if (w) cur.water.push({ part: w[1], min: +w[2], max: +w[3] });
      continue;
    }
    const d = /^([A-Za-zäöüÄÖÜ]+tag|Mittwoch|Samstag|Sonnabend):$/.exec(l);
    if (d) { cur.days.push({ label: d[1], text: '' }); continue; }
    const last = cur.days[cur.days.length - 1];
    if (last) last.text = last.text ? `${last.text} ${l}` : l;
  }
  void lines;
  if (situ.length) situation = situ.join(' ');
  return { kind: 'medium', situation, seas, validTo, next };
}

/** Rules + parse of one bulletin. `fileName` = DWD name (`FQEN50_EDZW_070800`); `refMs` resolves DDHHMM (Last-Modified or now). */
export function parseSeaBulletin(bytes: Uint8Array, fileName: string, refMs: number): SeaTextVerdict {
  const reasons: SeaTextVerdict['reasons'] = [];
  const pf = seaTextProductOfFile(fileName);
  if (!pf) return { ok: false, reasons: [{ rule: 'product', detail: fileName }], doc: null };
  const spec = SEA_TEXT_PRODUCTS[pf.product];
  const raw = latin1(bytes);
  const { heading, lines } = bulletinLines(raw);
  if (!lines.some((l) => l.trim() !== '')) reasons.push({ rule: 'empty', detail: `${bytes.length} B` });
  const hm = heading ? /^(FQDL50|FQDL51|WODL45|FXDL40|FQDL60) DWHA (\d{6})/.exec(heading) : null;
  if (!hm || hm[1] !== pf.product) reasons.push({ rule: 'header', detail: heading ?? '(kein Kopf)' });
  const lastLine = [...lines].reverse().find((l) => l.trim() !== '')?.trim() ?? '';
  if (lastLine !== spec.end) reasons.push({ rule: 'incomplete', detail: `letzte Zeile „${lastLine.slice(0, 40)}“` });
  const headMs = hm ? resolveDdhhmm(hm[2], refMs) : NaN;
  if (hm && hm[2] !== pf.ddhhmm) reasons.push({ rule: 'header', detail: `Kopf ${hm[2]} ≠ Datei ${pf.ddhhmm}` });
  // Issue time stated in the text.
  let issuedMs = NaN;
  let issuedFrom: 'text' | 'heading' = 'heading';
  const body = lines.join('\n');
  if (pf.product === 'FQDL50' || pf.product === 'FQDL51') {
    const m = /(\d{2})\.(\d{2})\.(\d{4}), (\d{2})(\d{2}) UTC:/.exec(body);
    if (m) { issuedMs = Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]); issuedFrom = 'text'; }
    if (!m) reasons.push({ rule: 'issueTime', detail: 'keine Zeile „TT.MM.JJJJ, HHMM UTC:“' });
    else if (Number.isFinite(headMs) && Math.abs(issuedMs - headMs) > 3 * H) reasons.push({ rule: 'issueTime', detail: `Text ${new Date(issuedMs).toISOString()} ≠ Kopf` });
  } else if (pf.product === 'FXDL40') {
    const m = /den (\d{2})\.(\d{2})\.(\d{4}), (\d{2})\.(\d{2}) GZ/.exec(body);
    if (m) { issuedMs = berlinToUtc(+m[3], +m[2], +m[1], +m[4], +m[5]); issuedFrom = 'text'; }
    else reasons.push({ rule: 'issueTime', detail: 'keine Zeile „den TT.MM.JJJJ, HH.MM GZ“' });
  } else if (pf.product === 'FQDL60') {
    if (!/vom \d{2}\.\d{2}\.\d{4}/.test(body)) reasons.push({ rule: 'issueTime', detail: 'kein „vom TT.MM.JJJJ“' });
  }
  if (!Number.isFinite(headMs)) reasons.push({ rule: 'issueTime', detail: 'Kopfzeit nicht auflösbar' });
  if (!Number.isFinite(issuedMs)) { issuedMs = headMs; issuedFrom = 'heading'; }
  if (reasons.length) return { ok: false, reasons, doc: null };
  const logical = unwrapLines(raw);
  const parts: SeaTextParts = pf.product === 'WODL45' ? parseWarnings(lines)
    : pf.product === 'FXDL40' ? parseMedium(logical, lines)
      : pf.product === 'FQDL60' ? { kind: 'plain' } : parseReport(logical);
  const doc: SeaTextDoc = {
    schema: 1, product: pf.product, file: fileName, heading: heading!, issue: seaIssueStamp(headMs),
    issuedAt: new Date(issuedMs).toISOString(), issuedFrom, raw, text: logical.join('\n'), parts,
    encoding: /[\x80-\xff]/.test(raw) ? 'latin1' : 'ascii', bytes: bytes.length,
  };
  return { ok: true, reasons: [], doc };
}

/** Client check before display: shape and age. Returns the reason it must not be shown as current, or null. */
export function seaTextFreshness(doc: Pick<SeaTextDoc, 'product' | 'issuedAt'>, nowMs: number): 'live' | 'stale' {
  const age = nowMs - Date.parse(doc.issuedAt);
  return age > SEA_TEXT_PRODUCTS[doc.product].staleMs ? 'stale' : 'live';
}

/** Warning status of a coast for the page: `none` only from a live WODL45 with the exact sentence; else `unknown`. */
export function coastWarnStatus(doc: SeaTextDoc | null, coast: 'Nordseekueste' | 'Ostseekueste', nowMs: number): WarnStatus {
  if (!doc || doc.product !== 'WODL45' || doc.parts.kind !== 'warnings') return 'unknown';
  if (seaTextFreshness(doc, nowMs) !== 'live') return 'unknown';
  return doc.parts.coasts.find((c) => c.coast === coast)?.status ?? 'unknown';
}
