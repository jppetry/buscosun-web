/**
 * fv-bytes-check.mjs — phase FV §3.1: the new `fit.mjs`/`score.mjs` without `--thin` must write exactly what the HEAD versions
 * wrote (only `builtAt`, and for cards `codeHash`, may differ); `--thin=hash` must differ (positive control). Reads the outputs of
 * `C:\dev\buscosun-hindcast\fit\fv-bytes.sh`.
 */
import { readFileSync } from 'node:fs';
const O = 'C:/dev/buscosun-hindcast/fit/fv-bytes';
const read = (p) => readFileSync(`${O}/${p}`, 'utf8');
const strip = (s, keys) => { const o = JSON.parse(s); for (const k of keys) delete o[k]; return JSON.stringify(o); };
const res = [];
const cmp = (name, a, b, keys, expectSame) => { const A = strip(read(a), keys), B = strip(read(b), keys); const same = A === B; res.push({ name, same, ok: same === expectSame, bytes: [read(a).length, read(b).length] }); };
cmp('fit head ≡ new (ohne builtAt)', 'head/fusion.hindcast.json', 'new/fusion.hindcast.json', ['builtAt'], true);
cmp('client head ≡ new (ohne builtAt)', 'head/fusion.client.json', 'new/fusion.client.json', ['builtAt'], true);
cmp('fit hash ≠ new (Positivkontrolle)', 'new/fusion.hindcast.json', 'hash/fusion.hindcast.json', ['builtAt'], false);
cmp('score head ≡ new (ohne builtAt, codeHash)', 'score-head/scorecard.json', 'score-new/scorecard.json', ['builtAt', 'codeHash'], true);
cmp('score hash ≠ new (Positivkontrolle)', 'score-new/scorecard.json', 'score-hash/scorecard.json', ['builtAt', 'codeHash'], false);
const mdHead = read('score-head/scorecard.md').split('\n').slice(1).join('\n').replace(/codeHash \S+/, ''), mdNew = read('score-new/scorecard.md').split('\n').slice(1).join('\n').replace(/codeHash \S+/, '');
res.push({ name: 'score.md head ≡ new (ohne Kopfzeile/codeHash)', same: mdHead === mdNew, ok: mdHead === mdNew });
const h = JSON.parse(read('score-hash/scorecard.json')), n = JSON.parse(read('score-new/scorecard.json'));
const mdHash = read('score-hash/scorecard.md');
const extra = { scoredHash: h.inputs.scored, scoredNew: n.inputs.scored, thin: h.inputs.thin, reliabilitySection: /## Reliability-Diagramme/.test(mdHash), holdoutSection: /## Anspruch B/.test(mdHash) };
res.push({ name: 'hash-Karte: inputs.thin + Reliability- und Holdout-Abschnitt im Markdown', same: null, ok: extra.thin?.mode === 'hash' && extra.reliabilitySection && extra.holdoutSection });
for (const r of res) console.log(`${r.ok ? 'OK  ' : 'FAIL'}  ${r.name}${r.bytes ? `  (${r.bytes.join(' / ')} B)` : ''}`);
console.log(JSON.stringify(extra));
if (res.some((r) => !r.ok)) process.exit(1);
