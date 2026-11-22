/**
 * verify:sea-wizard — Phase AM-W (`audit/seewetter-ausfahrt.md` §13): the trip planner as a step-by-step assistant.
 *
 *   A  the steps per kind of trip, their names, and what must stand before „Weiter“ goes on (`seaSteps.ts`)
 *   B  the page of the assistant in the link (`ps=`): old links stay what they were
 *   C  the frame and the shared pages, rendered without a browser (progress, Zurück / Weiter, the reason, the foot)
 *   D  every profile × every kind of trip (7 × 3)
 *   E  the page's wiring, read from the source
 *   F  CSS and words
 *
 * No network, no browser. The planning itself (`seaPlanner.ts`, `seaTrip.ts`) is covered by verify:sea-planner and
 * verify:sea-trip — this verifier only asks whether the pages lead to it.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { SEA_PROFILES, SEA_PROFILE_BY_ID, limitsSummary } from '../src/sea/seaProfiles.ts';
import { buildSeaUrl, parseSeaUrl, SEA_DEFAULT_STATE, SEA_PS_RE } from '../src/sea/seaState.ts';
import { TRIP_MODES, TRIP_MODE_LABEL, TRIP_MODE_WHAT, TRIP_MOTOR_NOTE, defaultTripMode } from '../src/sea/seaTrip.ts';
import * as W from '../src/sea/seaSteps.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail ?? '') });
const src = (f) => readFileSync(join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const cnt = (s, re) => (s.match(re) ?? []).length;

// --- A: steps --------------------------------------------------------------------------------------------------------
const S = W.WIZ_STEPS;
add('A1 Schritte je Art: Vor Ort und Etappe sechs, Strand fünf (ohne „Grenzen“, E-AM-30/39); Schritt 1 ist für alle „wer“, Schritt 2 „art“ (Art der Ausfahrt auf eigener Seite), der letzte für alle „ergebnis“; jede Art hat genau eine Seite für das Wo und eine für das Wann',
  S.ort.join() === 'wer,art,ort,zeit,grenzen,ergebnis' && S.etappe.join() === 'wer,art,strecke,zeit,grenzen,ergebnis' && S.strand.join() === 'wer,art,revier,zeit,ergebnis'
  && TRIP_MODES.every((m) => S[m][0] === 'wer' && S[m][1] === 'art' && S[m].at(-1) === 'ergebnis' && S[m].filter((x) => x === 'zeit').length === 1 && new Set(S[m]).size === S[m].length) && Object.keys(S).sort().join() === [...TRIP_MODES].sort().join());
const names = TRIP_MODES.flatMap((m) => S[m].map((st) => [W.wizLabel(m, st), W.wizTitle(m, st), W.wizLead(m, st)]));
add('A2 Namen: jede Seite hat einen kurzen Namen für die Leiste, eine Überschrift und einen Satz; Schritt 1 heißt „Grundangaben“; das Wann heißt je Art anders (Fenster / Abfahrt)',
  names.every((n) => n.every((x) => typeof x === 'string' && x.length > 3)) && TRIP_MODES.every((m) => W.wizTitle(m, 'wer') === 'Grundangaben' && W.wizLabel(m, 'ergebnis') === 'Ergebnis')
  && W.wizLabel('etappe', 'zeit') === 'Abfahrt' && W.wizLabel('ort', 'zeit') === 'Fenster' && W.wizTitle('etappe', 'zeit') === 'Fahrt und Abfahrt' && W.wizTitle('strand', 'zeit') === 'Zeitfenster'
  && names.every((n) => n[0].length <= 9), names.map((n) => n[0]).join(' '));
const LIM = SEA_PROFILE_BY_ID.kite.limits;
const F = (o) => ({ mode: 'ort', hasSpot: true, points: 0, hasTime: true, noData: null, limits: LIM, ...o });
add('A3 Prüfung je Schritt (Vor Ort): ohne Spot geht „Startort“ nicht weiter; ohne Fenster bzw. ohne Stundenwerte „Zeitfenster“ nicht (mit dem Grund der Seite); „Wind ab“ über „Wind bis“ hält „Grenzen“; Schritt 1 und das Ergebnis halten nie',
  W.wizBlock('ort', F({ hasSpot: false })) === W.WIZ_NEED_SPOT && W.wizBlock('ort', F({})) === null && W.wizBlock('zeit', F({ hasTime: false })) === W.WIZ_NEED_TIME
  && W.wizBlock('zeit', F({ noData: 'Kein geprüfter Lauf.' })) === 'Kein geprüfter Lauf.' && W.wizBlock('zeit', F({})) === null
  && W.wizBlock('grenzen', F({ limits: { ...LIM, windMin: 30, windMax: 28 } })) === W.WIZ_LIMITS_CROSSED && W.wizBlock('grenzen', F({ limits: { ...LIM, windMin: 28, windMax: 28 } })) === null
  && W.wizBlock('grenzen', F({ limits: { ...LIM, windMin: null } })) === null && W.wizBlock('wer', F({ hasSpot: false, hasTime: false, noData: 'x' })) === null && W.wizBlock('ergebnis', F({ hasSpot: false })) === null);
add('A4 Prüfung je Schritt (Etappe, Strand): ohne Punkt „Start und Ziel“, mit einem „noch das Ziel“, ab zwei frei; ohne Ankunft hält „Fahrt und Abfahrt“; Strand hält nur am Fenster',
  W.wizBlock('strecke', F({ mode: 'etappe', points: 0 })) === W.WIZ_NEED_START && W.wizBlock('strecke', F({ mode: 'etappe', points: 1 })) === W.WIZ_NEED_END && W.wizBlock('strecke', F({ mode: 'etappe', points: 2 })) === null
  && W.wizBlock('zeit', F({ mode: 'etappe', points: 2, hasTime: false })) === W.WIZ_NEED_ARRIVAL && W.wizBlock('revier', F({ mode: 'strand', hasSpot: false })) === null
  && W.wizBlock('zeit', F({ mode: 'strand', hasTime: false })) === W.WIZ_NEED_TIME && W.wizBlock('zeit', F({ mode: 'strand' })) === null);
add('A5 Reichweite der Leiste: bis zur ersten Seite, die noch etwas braucht — ohne Spot bis „Startort“ (2), ohne Fenster bis „Zeitfenster“ (3), mit allem bis zum Ergebnis; Etappe ohne Ziel bis „Strecke“',
  W.wizReach(F({ hasSpot: false })) === 2 && W.wizReach(F({ hasTime: false })) === 3 && W.wizReach(F({ limits: { ...LIM, windMin: 40 } })) === 4 && W.wizReach(F({})) === 5
  && W.wizReach(F({ mode: 'etappe', points: 1 })) === 2 && W.wizReach(F({ mode: 'etappe', points: 2 })) === 5 && W.wizReach(F({ mode: 'strand' })) === 4 && W.wizReach(F({ mode: 'strand', hasTime: false })) === 3);
const core = (o) => ({ mode: 'ort', hasSpot: true, points: 0, ...o });
add('A6 Seite zu einem Wunsch (`wizClamp`): ohne Wunsch das Ergebnis; eine Seite, der etwas fehlt, wird zur ersten, die es braucht (ohne Spot ⇒ „Startort“, ohne Ziel ⇒ „Strecke“) — aber NIE wegen fehlender Stundenwerte oder gekreuzter Grenzen (ein Link darf vor den Daten ankommen); eine frühere Seite bleibt; ein Schritt einer anderen Art fällt auf das Ergebnis',
  W.wizClamp(null, core({})) === 'ergebnis' && W.wizClamp('ergebnis', core({ hasSpot: false })) === 'ort' && W.wizClamp('zeit', core({ hasSpot: false })) === 'ort' && W.wizClamp('wer', core({ hasSpot: false })) === 'wer'
  && W.wizClamp('ort', core({ hasSpot: false })) === 'ort' && W.wizClamp('grenzen', core({})) === 'grenzen' && W.wizClamp(null, core({ mode: 'etappe', points: 1 })) === 'strecke' && W.wizClamp(null, core({ mode: 'etappe', points: 2 })) === 'ergebnis'
  && W.wizClamp('zeit', core({ mode: 'etappe', points: 0 })) === 'strecke' && W.wizClamp(null, core({ mode: 'strand', hasSpot: false })) === 'ergebnis' && W.wizClamp('strecke', core({})) === 'ergebnis'
  && W.wizCoreBlock('zeit', core({})) === null && W.wizCoreBlock('grenzen', core({})) === null);
add('A7 Nachbarn: Zurück und Weiter folgen der Liste der Art; vor Schritt 1 und nach dem Ergebnis steht nichts',
  W.wizNeighbour('ort', 'wer', -1) === null && W.wizNeighbour('ort', 'wer', 1) === 'art' && W.wizNeighbour('ort', 'art', 1) === 'ort' && W.wizNeighbour('etappe', 'art', 1) === 'strecke' && W.wizNeighbour('etappe', 'strecke', 1) === 'zeit' && W.wizNeighbour('strand', 'zeit', 1) === 'ergebnis'
  && W.wizNeighbour('strand', 'ergebnis', 1) === null && W.wizNeighbour('strand', 'zeit', -1) === 'revier' && W.wizNeighbour('strand', 'grenzen', 1) === null);

// --- B: the link -------------------------------------------------------------------------------------------------------
const valid = TRIP_MODES.flatMap((m) => S[m].filter((x) => x !== 'ergebnis').map((st) => `${m}.${st}`));
add('B1 `ps`: jede Seite außer dem Ergebnis hat genau einen Wert `<art>.<schritt>` (vierzehn), er liest sich zurück; das Ergebnis schreibt keinen (E-AM-40); ein Schritt, den die Art nicht hat, und Kaputtes sind nichts',
  valid.length === 14 && valid.every((v) => { const p = W.parseWizParam(v); return p && W.encodeWizParam(p.mode, p.step) === v; }) && TRIP_MODES.every((m) => W.encodeWizParam(m, 'ergebnis') === null)
  && W.parseWizParam('strand.grenzen') === null && W.parseWizParam('ort.strecke') === null && W.parseWizParam('etappe.ort') === null && W.parseWizParam('ort.ergebnis') === null && W.parseWizParam('ort') === null
  && W.parseWizParam('') === null && W.parseWizParam(null) === null && W.parseWizParam('ORT.wer') === null && W.encodeWizParam('strand', 'grenzen') === null && String(SEA_PS_RE) === String(W.PS_PARAM_RE), valid.join(' '));
const OLD = ['?pl=2026111913_2026111916_54.2876_8.5903', '?p=yacht&et=2026111906_80_544020x101800.548500x105200', '?sd=2026111916_2026111921', '?p=jolle&t=3&rv=ostsee&sd=2026111916_2026111921&wt=over.18'];
const round = (q, slug = 'laboe') => buildSeaUrl(parseSeaUrl(slug, q).state);
add('B2 alte Links bleiben, was sie waren: `pl=`, `et=`, `sd=` ohne `ps` lesen sich ohne Beanstandung und schreiben sich Zeichen für Zeichen zurück — und tragen kein `ps` (sie öffnen auf dem Ergebnis); Gegenprobe: mit `ps` steht es in der Adresse',
  OLD.every((q) => parseSeaUrl('laboe', q).invalid.length === 0 && parseSeaUrl('laboe', q).state.ps === null && round(q) === `/seewetter/laboe${q}`) && SEA_DEFAULT_STATE.ps === null
  && round('?pl=2026111913_2026111916_54.2876_8.5903&ps=ort.zeit') === '/seewetter/laboe?pl=2026111913_2026111916_54.2876_8.5903&ps=ort.zeit' && buildSeaUrl(SEA_DEFAULT_STATE) === '/seewetter', OLD.map((q) => round(q)).join(' | ').slice(0, 200));
add('B3 Adresse der Seite: `ps` steht hinter `sd` und vor `wt`; ohne Plan trägt es die Art allein (`/seewetter?ps=etappe.strecke`); ein kaputter Wert fällt heraus und wird gemeldet',
  buildSeaUrl({ ...SEA_DEFAULT_STATE, sd: '2026111916_2026111921', ps: 'strand.zeit', wt: 'over.18' }) === '/seewetter?sd=2026111916_2026111921&ps=strand.zeit&wt=over.18'
  && buildSeaUrl({ ...SEA_DEFAULT_STATE, ps: 'etappe.strecke' }) === '/seewetter?ps=etappe.strecke' && parseSeaUrl(null, '?ps=etappe.strecke').state.ps === 'etappe.strecke'
  && parseSeaUrl(null, '?ps=kaputt').invalid.includes('ps') && parseSeaUrl(null, '?ps=kaputt').state.ps === null && parseSeaUrl(null, '?ps=ort.ergebnis').invalid.includes('ps'));

// --- C: display without a browser ------------------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'sea-wizard-'));
const out = join(tmp, 'bundle.mjs');
await build({
  stdin: { resolveDir: ROOT, loader: 'ts', contents: `
    export { default as SeaWizard, WerStep, ArtStep, LimitsStep, WizSummary } from './src/sea/SeaWizard.tsx';
    export { createElement } from 'react';
    export { renderToStaticMarkup } from 'react-dom/server';
  ` },
  bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile: out, logLevel: 'silent', jsx: 'automatic',
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'process.env.NODE_ENV': '"production"' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const UI = await import(pathToFileURL(out).href);
const h = UI.createElement, html = UI.renderToStaticMarkup, plain = (s) => s.replace(/<[^>]+>/g, ' ');
const frame = (o) => html(h(UI.SeaWizard, { mode: 'ort', step: 'zeit', reach: 5, block: null, onGo: () => {}, onClose: () => {}, ...o }, h('p', { className: 'x-page' }, 'Seite')));
const mid = frame({});
const lis = (s) => [...s.matchAll(/<li class="sw-wz-stepli([^"]*)"( aria-current="step")?><button type="button"( disabled="")?/g)].map((m) => ({ cls: m[1].trim(), now: !!m[2], off: !!m[3] }));
add('C1 Rahmen, mittlere Seite (Vor Ort, Schritt 4 von 6): Leiste mit sechs Schritten — drei erledigt (Haken), der laufende markiert (`aria-current="step"`, selbst kein Ziel), die folgenden nummeriert und erreichbar; „Schritt 4 von 6“, die Überschrift, der Satz der Seite, dann die Seite; Zurück und Weiter; Schließen im Kopf',
  lis(mid).length === 6 && lis(mid).map((x) => x.cls).join('|') === 'is-done|is-done|is-done|is-now||' && lis(mid).filter((x) => x.now).length === 1 && lis(mid).map((x) => x.off).join() === 'false,false,false,true,false,false'
  && cnt(mid, /<i aria-hidden="true">✓<\/i>/g) === 3 && mid.includes('<i aria-hidden="true">4</i>') && mid.includes('<p class="sw-wz-count">Schritt 4 von 6</p>') && mid.includes('>Zeitfenster</h2>') && mid.includes(W.wizLead('ort', 'zeit'))
  && mid.indexOf('>Zeitfenster</h2>') < mid.indexOf('x-page') && mid.indexOf('x-page') < mid.indexOf('sw-wz-foot') && />Zurück<\/button>/.test(mid) && /class="sw-wz-next">Weiter</.test(mid) && cnt(mid, /aria-label="Planer schließen"/g) === 1
  && mid.includes('aria-label="Schritt 1 von 6: Angaben, erledigt"') && mid.includes('Ausfahrt planen · Vor Ort'), JSON.stringify(lis(mid)));
const held = frame({ step: 'ort', reach: 2, block: W.WIZ_NEED_SPOT });
add('C2 gehalten: der Grund steht da (`role="status"`), „Weiter“ ist gesperrt, die Schritte hinter der Reichweite sind es auch — zurück geht immer',
  held.includes(`<p class="sw-wz-block" role="status">${W.WIZ_NEED_SPOT}</p>`) && /class="sw-wz-next" disabled="">/.test(held) && lis(held).map((x) => x.off).join() === 'false,false,true,true,true,true' && /class="sw-wz-back">/.test(held)
  && !mid.includes('sw-wz-block') && !/class="sw-wz-next" disabled/.test(mid));
const first = frame({ step: 'wer', reach: 5 }), last = frame({ step: 'ergebnis', reach: 5 }), beforeLast = frame({ step: 'grenzen', reach: 5 });
add('C3 Enden: Schritt 1 hat kein Zurück; vor dem Ergebnis heißt die Haupt-Aktion „Ergebnis zeigen“; das Ergebnis hat kein Weiter, aber Zurück, und alle Schritte davor tragen den Haken; ein Grund ohne folgende Seite wird nicht gezeigt',
  !first.includes('sw-wz-back') && /class="sw-wz-next">Weiter</.test(first) && /class="sw-wz-next">Ergebnis zeigen</.test(beforeLast) && !last.includes('sw-wz-next') && last.includes('sw-wz-back') && cnt(last, /✓/g) === 5
  && !frame({ step: 'ergebnis', block: 'x' }).includes('sw-wz-block') && frame({ mode: 'strand', step: 'ergebnis', reach: 4 }).includes('Schritt 5 von 5') && lis(frame({ mode: 'strand', step: 'revier', reach: 4 })).length === 5);
const goes = [];
const walk = (el, o = []) => { if (Array.isArray(el)) el.forEach((x) => walk(x, o)); else if (el && typeof el === 'object' && el.props) { o.push(el); walk(el.props.children, o); } return o; };
// SeaWizard uses hooks, so its tree is read from the summary (a plain function) and from the markup of the frame above.
const rows = [{ label: 'Grundangaben', value: 'Kite · Vor Ort', step: 'wer' }, { label: 'Startort', value: 'Juist · Boot 850 m davor', step: 'ort' }, { label: 'Fenster', value: 'Do 12:00 bis Do 15:00 · 3 Stunden', step: 'zeit' }, { label: 'Grenzen', value: 'Wind 15–28 kn', step: 'grenzen' }];
const sum = html(h(UI.WizSummary, { rows, onGo: () => {} }, h('button', { className: 'x-play' }, 'Fenster abspielen')));
walk(UI.WizSummary({ rows, onGo: (st) => goes.push(st) })).filter((e) => e.type === 'button').forEach((b) => b.props.onClick());
const fold = html(h(UI.WizSummary, { rows, onGo: () => {}, fold: true }));
add('C4 „Deine Angaben“ (Ergebnis): je Zeile Name, Wert und „ändern“ — der Knopf führt auf GENAU die Seite der Zeile; darunter, was man mit dem Plan tut; mobil eingeklappt zu einer Zeile mit allen Werten (V-AM-32), aufgeklappt dieselben Zeilen',
  sum.includes('>Deine Angaben</h3>') && rows.every((r) => sum.includes(`<dt>${r.label}</dt><dd>${r.value}</dd><button type="button" class="sw-link" aria-label="${r.label} ändern">ändern</button>`)) && goes.join() === 'wer,ort,zeit,grenzen'
  && sum.indexOf('Grenzen') < sum.indexOf('x-play') && fold.startsWith('<details class="sw-wz-sumfold"><summary>') && fold.includes(`<span class="sw-wz-sumgist">${rows.map((r) => r.value).join(' · ')}</span>`)
  && cnt(fold, /aria-label="[^"]+ ändern"/g) === 4 && !/<details[^>]* open/.test(fold), goes.join());
const lim = (mode, profile) => html(h(UI.LimitsStep, { mode, profile, limits: SEA_PROFILE_BY_ID[profile].limits, onLimits: () => {} }));
add('C5 Seite „Deine Grenzen“ (E-AM-38): die Felder des Profils mit seinen Startwerten (Kite: Wind ab, Wind bis, Böen bis, Böenspanne bis; Motorboot: Wind bis, Böen bis, Windsee bis), die festen Regeln als Text, der Satz „keine Sicherheitsbewertung“; auf der Etappe, was gezählt wird, und beim Motorboot der Hinweis zur Windsee — bei „Vor Ort“ nicht',
  cnt(lim('ort', 'kite'), /<input type="number"/g) === 4 && ['Wind ab', 'Wind bis', 'Böen bis', 'Böenspanne bis', 'nicht ablandig', 'nur hell'].every((x) => lim('ort', 'kite').includes(x)) && lim('ort', 'kite').includes('value="28"')
  && cnt(lim('etappe', 'motor'), /<input type="number"/g) === 3 && lim('etappe', 'motor').includes('Windsee bis') && lim('etappe', 'motor').includes(TRIP_MOTOR_NOTE) && lim('etappe', 'motor').includes(W.WIZ_LIMITS_COUNT_NOTE)
  && !lim('ort', 'motor').includes(TRIP_MOTOR_NOTE) && !lim('ort', 'kite').includes(W.WIZ_LIMITS_COUNT_NOTE) && !lim('etappe', 'yacht').includes(TRIP_MOTOR_NOTE) && lim('ort', 'kite').includes('keine Sicherheitsbewertung')
  && lim('ort', 'yacht').includes('Grenzen für Yacht'));
const pages = TRIP_MODES.flatMap((m) => S[m].map((st) => frame({ mode: m, step: st, reach: S[m].length - 1 })));
add(`C6 kein amtliches Produkt (E-AM-43): der Satz steht im Fuß JEDER der ${pages.length} Seiten, genau einmal, und nennt Warnung, Seewetterbericht und Navigation`,
  pages.length === 17 && pages.every((p) => cnt(p, new RegExp(W.WIZ_DISCLAIMER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) === 1 && p.indexOf('sw-wz-foot') < p.indexOf(W.WIZ_DISCLAIMER))
  && /Keine amtliche Warnung/.test(W.WIZ_DISCLAIMER) && /amtlichen Seewetterbericht/.test(W.WIZ_DISCLAIMER) && /keine Navigationsgrundlage/.test(W.WIZ_DISCLAIMER));

// Phase BS-N (V-BS-4): on a lake leg the limits page says that only wind and gusts are counted.
{
  const limLake = html(h(UI.LimitsStep, { mode: 'etappe', profile: 'yacht', limits: SEA_PROFILE_BY_ID.yacht.limits, onLimits: () => {}, lake: true }));
  const pageSrc = readFileSync(join(ROOT, 'src/sea/SeaPage.tsx'), 'utf8');
  add('C9 Grenzen auf einer See-Etappe: „gezählt … für Wind und Böen“, mit dem Satz, dass die Wellengrenzen dort nicht geprüft werden; ohne `lake` und an der Küste der bisherige Satz; die Seite reicht den See der Etappe durch',
    limLake.includes(W.WIZ_LIMITS_COUNT_NOTE_LAKE) && !limLake.includes(W.WIZ_LIMITS_COUNT_NOTE) && /für Wind und Böen\. Auf dem See gibt es kein Wellenmodell/.test(W.WIZ_LIMITS_COUNT_NOTE_LAKE)
    && lim('etappe', 'yacht').includes(W.WIZ_LIMITS_COUNT_NOTE) && !lim('etappe', 'yacht').includes(W.WIZ_LIMITS_COUNT_NOTE_LAKE) && !html(h(UI.LimitsStep, { mode: 'ort', profile: 'kite', limits: SEA_PROFILE_BY_ID.kite.limits, onLimits: () => {}, lake: true })).includes(W.WIZ_LIMITS_COUNT_NOTE_LAKE)
    && /<LimitsStep mode=\{wizMode\} profile=\{profile\} limits=\{limits\} onLimits=\{setLimits\} lake=\{!!tripView\?\.lake\} \/>/.test(pageSrc));
}

// --- D: every profile × every kind of trip ---------------------------------------------------------------------------
const unesc = (s) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const combos = SEA_PROFILES.flatMap((pf) => TRIP_MODES.map((m) => ({ pf, m, page: unesc(html(h(UI.WerStep, { profile: pf.id, onProfile: () => {}, mode: m, onMode: () => {}, limitsText: limitsSummary(pf.limits) }))) })));
const pressed = (s) => [...s.matchAll(/<button type="button" aria-pressed="true" class="([^"]*)">(?:<span class="sw-wz-art-sk">[\s\S]*?<strong>)?([^<]+)</g)].map((m) => m[2]);
const arts = TRIP_MODES.map((m) => ({ m, page: unesc(html(h(UI.ArtStep, { mode: m, onMode: () => {} }))) }));
add(`D1 Schritt 1 in allen ${combos.length} Kombinationen (7 Profile × 3 Arten): sieben Kacheln „Wer fährt?“, genau eine gewählt — die richtige, keine Karte der Art; Schritt 2 „Art der Ausfahrt“ je Art: zwei Karten mit Skizze (Vor Ort, Etappe — Strand wird nicht mehr angeboten, Jan 19.11.), genau eine gewählt — die richtige, bei einem alten Strand-Link keine; jede Karte trägt ihren Satz und was man angibt, bekommt und wem sie passt`,
  combos.length === 21 && combos.every((c) => cnt(c.page, /class="sw-wz-tile[ "]/g) === 7 && !c.page.includes('sw-wz-art') && pressed(c.page).join('|') === c.pf.label)
    && W.WIZ_MODE_CHOICES.join() === 'ort,etappe'
    && arts.every((a) => cnt(a.page, /class="sw-wz-art[ "]/g) === 2 && cnt(a.page, /<svg viewBox="0 0 240 120"/g) === 2 && pressed(a.page).join('|') === (a.m === 'strand' ? '' : TRIP_MODE_LABEL[a.m])
      && W.WIZ_MODE_CHOICES.every((m) => a.page.includes(`<strong>${TRIP_MODE_LABEL[m]}</strong>`) && a.page.includes(TRIP_MODE_WHAT[m]) && Object.values(W.WIZ_MODE_GUIDE[m]).every((t) => a.page.includes(t)))
      && !a.page.includes(`<strong>${TRIP_MODE_LABEL.strand}</strong>`)
      && a.page.includes(W.WIZ_STRAND_PROFILE_NOTE) === (a.m === 'strand')),
  [...combos.filter((c) => pressed(c.page).join('|') !== c.pf.label).map((c) => `${c.pf.id}/${c.m}:${pressed(c.page).join('|')}`), ...arts.map((a) => `${a.m}:${pressed(a.page).join('|')}`)].join(' '));
add('D2 was vom Profil abhängt, entfällt im Strand: dort steht statt der Grenzen des Profils der Satz, dass das Profil nicht zählt und „Grenzen“ entfällt (E-AM-39); in den zwei anderen Arten stehen die Grenzen des gewählten Profils und der Verweis auf den Schritt',
  combos.every((c) => (c.m === 'strand' ? c.page.includes(W.WIZ_STRAND_PROFILE_NOTE) && !c.page.includes(limitsSummary(c.pf.limits)) : c.page.includes(`${c.pf.label}: ${limitsSummary(c.pf.limits)}. Änderbar im Schritt „Grenzen“.`) && !c.page.includes(W.WIZ_STRAND_PROFILE_NOTE))));
const walkAll = combos.map((c) => {
  const f = { mode: c.m, hasSpot: true, points: 2, hasTime: true, noData: null, limits: c.pf.limits };
  let st = 'wer'; const seen = [st];
  while (W.wizNeighbour(c.m, st, 1) && W.wizBlock(st, f) == null) { st = W.wizNeighbour(c.m, st, 1); seen.push(st); }
  return { ...c, seen };
});
add('D3 jede der 21 Kombinationen kommt mit vollständigen Angaben und den Startwerten ihres Profils von Schritt 1 bis zum Ergebnis — kein Profil hält an seinen eigenen Grenzen; Vor Ort und Etappe über fünf Seiten, Strand über vier; das Profil setzt beim Öffnen die Art (Yacht, Motorboot ⇒ Etappe, sonst Vor Ort, nie Strand)',
  walkAll.every((c) => c.seen.join() === S[c.m].join()) && SEA_PROFILES.every((pf) => defaultTripMode(pf.id) === (pf.id === 'yacht' || pf.id === 'motor' ? 'etappe' : 'ort')) && SEA_PROFILES.length === 7,
  walkAll.filter((c) => c.seen.join() !== S[c.m].join()).map((c) => `${c.pf.id}/${c.m}:${c.seen.join('>')}`).join(' '));

// --- E: the page's wiring --------------------------------------------------------------------------------------------
const page = src('src/sea/SeaPage.tsx'), wiz = src('src/sea/SeaWizard.tsx'), css = src('src/sea/seaDeck.css'), steps = src('src/sea/seaSteps.ts');
add('E1 Zustand: der Assistent ist offen mit einem Plan jeder Art und solange „Vor Ort“ nach dem Spot fragt; die Art ist der offene Plan; die Seite ist die gewünschte oder die erste davor, der etwas fehlt, und wird so auch gemerkt (sonst spränge sie mit dem zweiten Punkt aufs Ergebnis)',
  /const wizOpen = tripOpen \|\| planAsk;/.test(page) && /const wizMode: TripMode = etappe \? 'etappe' : strand \? 'strand' : 'ort';/.test(page)
  && /const step: WizStep \| null = wizOpen \? wizClamp\(wizStep, \{ mode: wizMode, hasSpot: planOpen, points: wizPoints \}\) : null;/.test(page) && /useEffect\(\(\) => \{ if \(step && step !== wizStep\) setWizStep\(step\); \}, \[step, wizStep\]\);/.test(page));
add('E2 Öffnen und Schließen: „Ausfahrt planen“ beginnt auf Schritt 1 mit der Art des Profils; ein offener Planer kommt nur nach vorn; Schließen setzt die Seite und die gemerkten Fenster zurück; jeder Seitenwechsel lässt die Angaben stehen (er setzt nur Seite, Wegpunkt-Modus und Blatt)',
  /modePicked\.current = false;\s*setWizStep\('wer'\);\s*setTripMode\(defaultTripMode\(profile\)\);/.test(page) && /if \(wizOpen\) \{ setStage\('map'\); setMobTab\('plan'\); setPlanPick\(false\); return; \}/.test(page)
  && /setWizStep\(null\); setLinkPs\(null\); planKeep\.current = null; strandKeep\.current = null;/.test(page)
  && /const wizGo = useCallback\(\(s: WizStep\) => \{\s*modePicked\.current = true;\s*setWizStep\(s\); setTripArm\(false\); setPlanPick\(false\); setStage\('map'\); setMobTab\('plan'\); setPlanSheetOpen\(false\);\s*\}, \[\]\);/.test(page));
add('E3 Angaben behalten (E-AM-41): beim Wechsel der Art warten das Fenster von „Vor Ort“ (je Spot) und das Strand-Fenster, wie die Etappe schon immer; sie kommen beim Zurückwechseln wieder',
  /if \(plan && spot\) planKeep\.current = \{ spot: spot\.id, plan \};/.test(page) && /const kept = planKeep\.current\?\.spot === sp\.id \? planKeep\.current\.plan : null;\s*setPlan\(kept \?\? \{/.test(page)
  && cnt(page, /setStrand\(\(s\) => \{ if \(s\) strandKeep\.current = s; return null; \}\)/g) === 2 && /setStrand\(\(s\) => s \?\? strandKeep\.current \?\? strandDefaultWindow\(nowMs\)\);/.test(page)
  && /setEtappe\(\(e\) => e \?\? etappeKeep\.current \?\? \{/.test(page));
add('E4 Adresse: die Seite reist als `ps` (das Ergebnis schreibt keins); ein Link auf eine Seite ohne Spot oder Punkt öffnet die Art, sobald der Katalog da ist; passt `ps` nicht zur Art des Plans im Link, gewinnt der Plan; Zurück im Browser stellt die Seite der Adresse wieder her',
  /const ps = wizOpen && step \? encodeWizParam\(wizMode, step\) : linkPs \|\| linkPl \? initial\.ps : null;/.test(page) && /pl, et, sd, ps, wt: wtemp\.wt \};/.test(page)
  && /if \(!linkPs \|\| linkPl \|\| catalog === 'loading'\) return;/.test(page) && /if \(open\) \{ setWizStep\(null\); return; \}/.test(page) && /setTripMode\(linkPs\.mode\);/.test(page)
  && /const ps = parseWizParam\(popState\.ps\);\s*setWizStep\(ps\?\.step \?\? null\); setLinkPs\(ps\); if \(!ps\) setPlanAsk\(false\);/.test(page));
add('E5 Karte und Seiten: ein Klick setzt einen Wegpunkt nur auf der Seite „Strecke“ (E-AM-42); die rechte Spalte ruht während der Eingabe (E-AM-36); am Kartenfuß stehen Stundenwerte nur als Eingabe oder Ergebnis (E-AM-37); ohne Planer bleibt der Dock, wie er war',
  /armed: step === 'strecke' && \(etappe\.points\.length < 2 \|\| tripArm\),/.test(page) && /\{wizard \? wizResult && <aside className="sw-readout is-plan"/.test(page) && /const wizResult = step !== 'ergebnis' \? null : etappe \? etappeResult : strand \? strandPanel : planner;/.test(page) && /: <aside className="sw-readout is-picker" aria-label="Spots und Profil">\{dockOf\('picker'\)\}<\/aside>\}/.test(page)
  && /const footKind: 'band' \| 'table' \| 'strip' \| null = !wizOpen \|\| !step \? null/.test(page) && /\) : <div className="sw-ov-right">\{planBtn\}\{legend\}<\/div>\}/.test(page) && /const planBtn = wizOpen \|\| !plannerOn \? null : \(/.test(page));
add('E6 Schritt 1 in der Seite: das Profil schlägt die Art nur vor, bis sie von Hand gewählt wurde, und setzt die Fahrt einer Etappe, an der noch niemand gedreht hat; die Wahl der Art merkt sich das',
  /if \(!modePicked\.current && defaultTripMode\(p\) !== wizMode\) setTripMode\(defaultTripMode\(p\), p\);/.test(page) && /setEtappe\(\(e\) => \(e && e\.speedKn === defaultSpeedKn\(profile\) \? \{ \.\.\.e, speedKn: defaultSpeedKn\(p\) \} : e\)\);/.test(page)
  && /<WerStep profile=\{profile\} onProfile=\{wizProfile\} mode=\{wizMode\} limitsText=\{limitsTx\} \/>/.test(page) && /<ArtStep mode=\{wizMode\} onMode=\{wizPickMode\} \/>/.test(page) && /const modePicked = useRef\(true\);/.test(page));
add('E7 keine neue Rechnung, kein Schalter: der Assistent und die Schrittlogik rechnen nichts (kein Import aus dem Motor, kein `fetch`), `seaSteps.ts` kennt weder Planer noch Etappe; um die Phase steht kein Flag',
  !/pointForecast|fetch\(|planFindings|tripRows|strandRows|classify\(/.test(wiz + steps) && !/from '\.\/seaPlanner'/.test(steps) && /import \{ TRIP_MODE_LABEL, type TripMode \} from '\.\/seaTrip';/.test(steps)
  && !/SEA_WIZ\w*_LIVE|wizFlag|\?wz=|\?wizard=/.test(page + wiz + steps + src('src/sea/seaFlag.ts')));

// --- F: CSS and words ------------------------------------------------------------------------------------------------
const mq = '@media (max-width: 767px), (max-width: 1439px) and (pointer: coarse) {';
const tsx = wiz + src('src/sea/SeaTripSwitch.tsx') + src('src/sea/SeaPlanPanel.tsx') + src('src/sea/SeaTripPanels.tsx') + page;
const used = [...new Set([...tsx.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g)].flatMap((m) => (m[1] ?? m[2]).match(/sw-wz-[a-z]+/g) ?? []))];
const defined = [...new Set(css.match(/\.sw-wz-[a-z]+/g) ?? [])].map((c) => c.slice(1));
const section = css.slice(css.indexOf('Phase AM-W (audit/seewetter-ausfahrt.md §13)'));
add(`F1 CSS: jede der ${used.length} Klassen des Assistenten ist definiert, und keine definierte ist ohne Markup; die Regeln fürs Telefon stehen in der letzten mobilen Media Query der Seite, sonst nur der Breakpoint 1439; kein Rot (Rot heißt im Planer nur „über deiner Grenze“); keine neue Bewegung`,
  used.length >= 20 && used.every((c) => css.includes(`.${c}`)) && defined.every((c) => used.includes(c)) && css.slice(css.lastIndexOf(mq)).includes('.sw-pl-sheet .sw-wz-body')
  && [...section.matchAll(/@media[^{]*\{/g)].every((m) => m[0] === '@media (max-width: 1439px) {') && !/#8A3320|#B5482E|--sw-out/.test(section) && !/animation|transition|@keyframes/.test(section),
  [used.filter((c) => !css.includes(`.${c}`)).join(','), defined.filter((c) => !used.includes(c)).join(',')].join(' / '));
const words = [...Object.values(W).filter((v) => typeof v === 'string'), ...names.flat(), ...Object.values(TRIP_MODE_WHAT), ...Object.values(W.WIZ_MODE_GUIDE).flatMap((g) => Object.values(g))];
const banned = /\b(un)?sicher\b|gefahrlos|ungefährlich|\d\s?%|Prozent|empfohlen|Empfehlung|ideal|\bbeste[rsn]?\b|lohnt|Ampel/i;
add('F2 Worte des Assistenten: kein Urteil über Sicherheit, keine Prozente, keine Empfehlung; „Vor Ort“ trägt den Satz des Auftrags, die zwei anderen Arten einen im selben Bau',
  words.length > 40 && words.every((t) => !banned.test(t)) && ['Die Etappe ist sicher.', 'in 30 % der Fälle', 'Bester Strand heute'].every((t) => banned.test(t))
  && TRIP_MODE_WHAT.ort === 'Ein Spot, das Boot davor, ein Fenster von Start bis Rückkehr.' && /^Eine Strecke von Start bis Ziel/.test(TRIP_MODE_WHAT.etappe) && /^Ein Revier, ein Fenster/.test(TRIP_MODE_WHAT.strand),
  words.filter((t) => banned.test(t)).join(' | '));

rmSync(tmp, { recursive: true, force: true });
const passed = checks.filter((x) => x.ok).length;
const failed = checks.length - passed;
for (const x of checks) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? `  [${x.detail.slice(0, 260)}]` : ''}`);
console.log(`\nverify:sea-wizard — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
