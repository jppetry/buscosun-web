/**
 * verify:sea-text — Phase SW (audit/seewetter.md §4): the bulletin rules of `src/sea/seaText.ts` against the byte-exact
 * DWD fixtures (`audit/seewetter/fixtures/`, five from 06./07.10. + the first warning case WODL45 071200) and every
 * bulletin the SW-0 collector stored (`fixtures/collected/`). Heading, end marker, issue time, structure; `raw` stays
 * char for char (re-encoded = the bytes) and the display text differs only in whitespace/transport characters.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-sea-text.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseSeaBulletin, significantChars, latin1, seaExpectedIssues, resolveDdhhmm, berlinToUtc, coastWarnStatus,
  seaTextProductOfFile, SEA_TEXT_PRODUCTS, wodlNoWarningSentence, unwrapLines,
} from '../src/sea/seaText.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'audit', 'seewetter', 'fixtures');
const COL = join(FIX, 'collected');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const bytesOf = (name, dir = FIX) => new Uint8Array(readFileSync(join(dir, name)));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const enc = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const T = (iso) => Date.parse(iso);

// --- F: the six fixtures ---------------------------------------------------------------------------
const README_SHA = {
  FQEN50_EDZW_070800: 'd77cc404b327bca84060cee03b4ca89b6cd977e9cacab7d2e449d43a34ff1aea',
  FQEN51_EDZW_070800: '1487e68444e3f215a2b9d09741639f4006b0f98d2b248e11f04cc0f63a5c246c',
  WODL45_EDZW_070900: 'cd08acd50856d06ccdde19b83d6638bba1f7f5c347adfe0d4f4f0140119664a8',
  FXDL40_EDZW_060000: 'd47be1c68a757d49baf45992a037462aaaf059c1272d1a15782b1199671db2f5',
  FQMM60_EDZW_061400: 'bcddbfb35e7c043cd88734fd1d2006ccb27d92b275d9e89bd7d1234714c43cfa',
  WODL45_EDZW_071200: 'e0f44b31e1cb289aa9d4221fb368ac8becff64b1ceeecd75e40cdd5830659d04',
};
const shaBad = Object.entries(README_SHA).filter(([f, h]) => sha(bytesOf(f)) !== h).map(([f]) => f);
add('F0 Fixtures byte-genau (SHA-256 wie README/§2.5, .gitattributes -text greift)', shaBad.length === 0, shaBad.join(' ') || '6/6');

const REF = T('2026-10-07T12:00:00Z');
const P = Object.fromEntries(Object.keys(README_SHA).map((f) => [f, parseSeaBulletin(bytesOf(f), f, REF)]));
add('F1 alle sechs Fixtures gültig', Object.values(P).every((v) => v.ok), Object.entries(P).filter(([, v]) => !v.ok).map(([f, v]) => `${f}: ${v.reasons.map((r) => r.rule).join(',')}`).join(' ') || 'ok');

const d50 = P.FQEN50_EDZW_070800.doc, d51 = P.FQEN51_EDZW_070800.doc, w9 = P.WODL45_EDZW_070900.doc, w12 = P.WODL45_EDZW_071200.doc;
const fx = P.FXDL40_EDZW_060000.doc, mm = P.FQMM60_EDZW_061400.doc;
add('F2 Kopf, Produkt, Ausgabe: FQEN50-Datei trägt FQDL50, Ausgabe 2610070800, Zeit aus dem Text 08:00 UTC',
  d50.product === 'FQDL50' && d50.heading === 'FQDL50 DWHA 070800' && d50.issue === '2610070800' && d50.issuedAt === '2026-10-07T08:00:00.000Z' && d50.issuedFrom === 'text',
  `${d50.heading} · ${d50.issue} · ${d50.issuedAt}`);
const days = d50.parts.days ?? [];
const db = days[0]?.areas.find((a) => a.name === 'Deutsche Bucht');
add('F3 FQDL50: zwei Tage × neun Seegebiete mit Kennung, Wind/Sicht/Seegang je Gebiet',
  d50.parts.kind === 'report' && days.length === 2 && days.every((d) => d.areas.length === 9 && d.areas.every((a) => a.id && a.wind && a.sightWeather && a.sea)),
  days.map((d) => `${d.label}: ${d.areas.map((a) => a.name).join(', ')}`).join(' | '));
const db2 = days[1]?.areas.find((a) => a.name === 'Suedwestliche Nordsee');
add('F4 FQDL50: mehrzeiliger Wert zu einem Satz verbunden (Fernschreib-Umbruch), Gebiet → WARNCELLID',
  db?.id === '401000008' && db2?.wind === 'Nord 6 bis 7, langsam west- bis suedwestdrehend und abnehmend um 5.',
  `${db?.id} · „${db2?.wind}“`);
add('F5 FQDL50: Wetterlage und Fußnote erkannt', /^Ein Sturmtief 963/.test(d50.parts.situation ?? '') && /^Windstaerke in Beaufort/.test(d50.parts.footnote ?? ''), (d50.parts.situation ?? '').slice(0, 40));
const secs = d51.parts.days?.[0]?.areas ?? [];
add('F6 FQDL51: acht Küstenabschnitte mit Kennung 5…, Wind und Sicht, KEIN Seegang; Gruppen „Nordseekueste/Ostseekueste“ sind keine Abschnitte',
  d51.parts.kind === 'report' && secs.length === 8 && secs.every((a) => /^5010000\d\d$/.test(a.id ?? '') && a.wind && a.sightWeather && a.sea === null),
  secs.map((a) => `${a.name}=${a.id}`).join(', '));
add('F7 FQDL51: Doppel-Leerzeichen des Bulletins bleibt im Text erhalten (nur Umbrüche werden aufgelöst)',
  secs.find((a) => a.name === 'Nordfriesische Kueste')?.wind?.includes('spaeter  rechtdrehend'), secs.find((a) => a.name === 'Nordfriesische Kueste')?.wind);
const c9 = w9.parts.coasts ?? [];
add('F8 WODL45 09:00 ohne Warnung: beide Küsten `none` (Nr. 479/414, Ausgabe GZ → UTC), drei Seegebiete `none`',
  w9.parts.kind === 'warnings' && c9.length === 2 && c9.every((c) => c.status === 'none') && c9[0].nr === '479' && c9[1].nr === '414'
  && c9[0].issuedAt === '2026-09-29T09:25:00.000Z' && c9[1].issuedAt === '2026-09-30T15:55:00.000Z'
  && w9.parts.seaAreas.length === 3 && w9.parts.seaAreas.every((a) => a.status === 'none'),
  c9.map((c) => `${c.coast} ${c.nr} ${c.status} ${c.issuedAt}`).join(' · '));
const gb = w12.parts.seaAreas?.find((a) => a.name === 'GERMAN BIGHT');
add('F9 WODL45 12:00 (Warnfall): GERMAN BIGHT `unknown` mit Wortlaut „N to NW 7 later.“, übrige Gebiete und beide Küsten `none`',
  gb?.status === 'unknown' && gb?.text === 'N to NW 7 later.' && w12.parts.seaAreas.filter((a) => a.status === 'none').length === 2 && w12.parts.coasts.every((c) => c.status === 'none'),
  `${gb?.status} „${gb?.text}“`);
const ns = fx.parts.seas?.find((s) => s.sea === 'nordsee'), os = fx.parts.seas?.find((s) => s.sea === 'ostsee');
add('F10 FXDL40 (ISO-8859-1): Ausgabe „06.10.2026, 09.00 GZ“ = 07:00 UTC, Umlaute erhalten, je Meer 5 Tage und 3 Wassertemperaturen wie in der Datenprüfung',
  fx.encoding === 'latin1' && fx.issuedAt === '2026-10-06T07:00:00.000Z' && fx.text.includes('für Nord- und Ostsee') && ns?.days.length === 5 && os?.days.length === 5
  && JSON.stringify(ns.water) === JSON.stringify([{ part: 'Norden', min: 12, max: 15 }, { part: 'Mitte', min: 13, max: 16 }, { part: 'Süden', min: 16, max: 18 }])
  && JSON.stringify(os.water) === JSON.stringify([{ part: 'Osten', min: 12, max: 17 }, { part: 'Süden', min: 13, max: 17 }, { part: 'Westen', min: 14, max: 17 }]),
  `${fx.issuedAt} · NS ${JSON.stringify(ns?.water)} · OS ${JSON.stringify(os?.water)}`);
add('F11 FQDL60: `<br>` und Einzel-CR entfernt, 13 NIL-Zeilen bleiben einzeln', mm.parts.kind === 'plain' && !mm.text.includes('<br>') && !mm.text.includes('\r') && mm.text.split('\n').filter((l) => l === 'NIL').length === 13,
  `${mm.text.split('\n').filter((l) => l === 'NIL').length} NIL`);

// --- R: verbatim invariants on every bulletin we have ---------------------------------------------------
const collected = existsSync(COL) ? readdirSync(COL).filter((f) => seaTextProductOfFile(f) && !README_SHA[f]) : [];
const index = existsSync(join(COL, 'index.json')) ? JSON.parse(readFileSync(join(COL, 'index.json'), 'utf8')).files : {};
const all = [...Object.keys(README_SHA).map((f) => [f, FIX]), ...collected.map((f) => [f, COL])];
let rawOk = 0, wsOk = 0, parsed = 0;
const rawBad = [], wsBad = [], parseBad = [], warnCases = [];
for (const [f, dir] of all) {
  const b = bytesOf(f, dir);
  const ref = index[f]?.lastModified ? Date.parse(index[f].lastModified) : REF;
  const v = parseSeaBulletin(b, f, ref);
  if (!v.ok) { parseBad.push(`${f}: ${v.reasons.map((r) => `${r.rule} ${r.detail}`).join('; ')}`); continue; }
  parsed++;
  const back = enc(v.doc.raw);
  if (back.length === b.length && back.every((x, k) => x === b[k])) rawOk++; else rawBad.push(f);
  const body = latin1(b).replace(/^[\s\S]*?[A-Z]{4}\d{2} [A-Z]{4} \d{6}/, '');
  if (significantChars(v.doc.text) === significantChars(body)) wsOk++; else wsBad.push(f);
  if (v.doc.parts.kind === 'warnings') {
    for (const a of v.doc.parts.seaAreas) if (a.status !== 'none') warnCases.push(`${f} ${a.name}: ${a.text}`);
    for (const c of v.doc.parts.coasts) if (c.status !== 'none') warnCases.push(`${f} ${c.coast}: ${c.text.slice(0, 60)}`);
  }
}
add(`R1 alle ${all.length} Bulletins (6 Fixtures + ${collected.length} gesammelt) bestehen die Regeln`, parseBad.length === 0, parseBad.slice(0, 3).join(' | ') || `${parsed} gültig`);
add('R2 `raw` bleibt Zeichen für Zeichen: Latin-1 zurückkodiert = die DWD-Bytes', rawOk === parsed && rawBad.length === 0, `${rawOk}/${parsed}${rawBad.length ? ` · ${rawBad.join(' ')}` : ''}`);
add('R3 Anzeigetext unterscheidet sich nur in Leerraum/Übertragungszeichen (gleiche Nicht-Leerzeichen)', wsOk === parsed && wsBad.length === 0, `${wsOk}/${parsed}${wsBad.length ? ` · ${wsBad.join(' ')}` : ''}`);
add('R4 Warnfälle in der Sammlung benannt (Status `unknown`, Wortlaut)', true, warnCases.slice(0, 6).join(' | ') || 'keiner');
// Negative control for R3: one changed letter is caught.
const tampered = d50.text.replace('Deutsche Bucht', 'Deutsche Bucgt');
add('R5 Gegenprobe zu R3: ein geänderter Buchstabe fällt auf', significantChars(tampered) !== significantChars(latin1(bytesOf('FQEN50_EDZW_070800')).replace(/^[\s\S]*?FQDL50 DWHA 070800/, '')), 'Bucht → Bucgt');

// --- N: bad cases -------------------------------------------------------------------------------------
const s50 = latin1(bytesOf('FQEN50_EDZW_070800'));
const sW = latin1(bytesOf('WODL45_EDZW_070900'));
const v = (s, f, ref = REF) => parseSeaBulletin(enc(s), f, ref);
const rules = (r) => r.reasons.map((x) => x.rule).join(',');
const cut = v(s50.replace(/=\r\r\n[\s\S]*$/, ''), 'FQEN50_EDZW_070800');
add('N1 FQDL50 ohne „=“ am Ende ⇒ verworfen (incomplete)', !cut.ok && rules(cut).includes('incomplete'), rules(cut));
const cutW = v(sW.replace(/Seewetterdienst Hamburg\r\r\n[\s\S]*$/, ''), 'WODL45_EDZW_070900');
add('N2 WODL45 ohne Schlusszeile „Seewetterdienst Hamburg“ ⇒ verworfen', !cutW.ok && rules(cutW).includes('incomplete'), rules(cutW));
const wrongHead = v(s50.replace('FQDL50 DWHA', 'FQDL51 DWHA'), 'FQEN50_EDZW_070800');
add('N3 Kopf passt nicht zum Dateinamen (FQEN50-Datei mit FQDL51-Kopf) ⇒ verworfen', !wrongHead.ok && rules(wrongHead).includes('header'), rules(wrongHead));
const noHead = v(s50.replace('FQDL50 DWHA 070800', 'XXXX'), 'FQEN50_EDZW_070800');
add('N3b ohne Kopfzeile ⇒ verworfen', !noHead.ok && rules(noHead).includes('header'), rules(noHead));
const noTime = v(s50.replace('07.10.2026, 0800 UTC:', 'heute:'), 'FQEN50_EDZW_070800');
add('N4 FQDL50 ohne Ausgabezeit im Text ⇒ verworfen (issueTime)', !noTime.ok && rules(noTime).includes('issueTime'), rules(noTime));
const fxNoTime = v(latin1(bytesOf('FXDL40_EDZW_060000')).replace('09.00 GZ', '09 Uhr'), 'FXDL40_EDZW_060000');
add('N4b FXDL40 ohne „HH.MM GZ“ ⇒ verworfen', !fxNoTime.ok && rules(fxNoTime).includes('issueTime'), rules(fxNoTime));
const warnSentence = v(sW.replace('besteht keine Starkwind-, Sturm- oder', 'besteht eine Sturm- oder'), 'WODL45_EDZW_070900');
add('N5 geänderter Satz („besteht eine Sturm…“) ⇒ Status `unknown`, nie `none`', warnSentence.ok && warnSentence.doc.parts.coasts[0].status === 'unknown' && warnSentence.doc.parts.coasts[1].status === 'none',
  warnSentence.doc?.parts.coasts.map((c) => c.status).join('/'));
const rewrap = v(sW.replace('besteht keine Starkwind-, Sturm- oder\r\r\nOrkanwarnung.', 'besteht keine\r\r\nStarkwind-, Sturm- oder Orkanwarnung.'), 'WODL45_EDZW_070900');
add('N6 derselbe Satz anders umbrochen ⇒ weiter `none` (Umbruch an anderer Stelle möglich)', rewrap.ok && rewrap.doc.parts.coasts[0].status === 'none', rewrap.doc?.parts.coasts.map((c) => c.status).join('/'));
const noOst = v(sW.replace(/NR\. 414[\s\S]*?Orkanwarnung\.\r\r\n/, ''), 'WODL45_EDZW_070900');
add('N7 Küstenblock fehlt ⇒ diese Küste `unknown` (nie stillschweigend „keine Warnung“)', noOst.ok && noOst.doc.parts.coasts.find((c) => c.coast === 'Ostseekueste')?.status === 'unknown',
  noOst.doc?.parts.coasts.map((c) => `${c.coast}:${c.status}`).join(' '));
add('N8 Warnstatus aus einer WODL45 älter als 4 h ⇒ `unknown`; frisch ⇒ `none`; ohne Datei ⇒ `unknown`',
  coastWarnStatus(w9, 'Nordseekueste', T('2026-10-07T13:01:00Z')) === 'unknown' && coastWarnStatus(w9, 'Nordseekueste', T('2026-10-07T10:00:00Z')) === 'none' && coastWarnStatus(null, 'Ostseekueste', REF) === 'unknown',
  'ok');
const other = parseSeaBulletin(bytesOf('FQEN50_EDZW_070800'), 'FQEN70_EDZW_070800', REF);
add('N9 Dateiname eines fremden Produkts (FQEN70, englisch) ⇒ verworfen (product)', !other.ok && rules(other) === 'product', rules(other));
add('N10 Satz der „keine Warnung“-Regel exakt wie im Bulletin', wodlNoWarningSentence('Ostseekueste') === 'Fuer die deutsche Ostseekueste besteht keine Starkwind-, Sturm- oder Orkanwarnung.', wodlNoWarningSentence('Nordseekueste'));
const lines = unwrapLines(s50);
add('N11 Umbruch-Regel trennt Gebiets- und Feldzeilen (keine Zeile beginnt mitten in „Wind:“)', lines.includes('Deutsche Bucht:') && lines.some((l) => l.startsWith('Wind: Schwachwindig, suedostdrehend')), `${lines.length} logische Zeilen`);

// --- E: clock and calendar ---------------------------------------------------------------------------
const exp = seaExpectedIssues('FQDL50', T('2026-10-07T12:10:00Z'), 3);
add('E1 erwartete Ausgaben FQDL50 um 12:10 UTC: 11:00 (Tor 11:15 + 50 min = 12:05 erreicht), 08:00, 05:00', JSON.stringify(exp) === '["2610071100","2610070800","2610070500"]', JSON.stringify(exp));
const expW = seaExpectedIssues('WODL45', T('2026-10-07T12:40:00Z'), 2);
add('E2 erwartete Ausgaben WODL45 um 12:40 UTC: 12:00 (Datei 11:45 + 50 min = 12:35), 09:00', JSON.stringify(expW) === '["2610071200","2610070900"]', JSON.stringify(expW));
add('E3 DDHHMM über den Monatswechsel: „311800“ am 01.11. = 31.10.; „011800“ am 01.11. 19 UTC = 01.11.',
  new Date(resolveDdhhmm('311800', T('2026-11-01T01:00:00Z'))).toISOString() === '2026-10-31T18:00:00.000Z' && new Date(resolveDdhhmm('011800', T('2026-11-01T19:00:00Z'))).toISOString() === '2026-11-01T18:00:00.000Z',
  new Date(resolveDdhhmm('311800', T('2026-11-01T01:00:00Z'))).toISOString());
add('E4 GZ → UTC: 06.10.2026 09:00 MESZ = 07:00 UTC, 15.11.2026 09:00 MEZ = 08:00 UTC, 25.10.2026 (Umstellung) 03:00 MEZ = 02:00 UTC',
  new Date(berlinToUtc(2026, 10, 6, 9, 0)).toISOString() === '2026-10-06T07:00:00.000Z' && new Date(berlinToUtc(2026, 11, 15, 9, 0)).toISOString() === '2026-11-15T08:00:00.000Z' && new Date(berlinToUtc(2026, 10, 25, 3, 0)).toISOString() === '2026-10-25T02:00:00.000Z',
  'ok');
add('E5 Produkttabelle: Stufe 1 = FQDL50/51, WODL45, FXDL40; FQDL60 = Stufe 2', Object.values(SEA_TEXT_PRODUCTS).filter((s) => s.stage === 1).map((s) => s.product).join() === 'FQDL50,FQDL51,WODL45,FXDL40', '');

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`\nverify:sea-text — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
