/**
 * verify:sea-seo — Phase SS (audit/seewetter-seo.md): die Spot-Seiten des Seewetters.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-sea-seo.mjs
 *
 * Netzfrei, ohne dist/. Prüft, dass Handliste, Namenstabelle und Steckbriefe dieselben Spots tragen, dass jede Spot-Seite
 * Sub-Route mit eigenem Canonical, Rewrite und Text ist, dass die Texte nur auf Seiten zeigen, die es gibt, und dass keine
 * Sicherheits- oder Warnsprache in eigener Stimme darin steht. Die Regeln der Texte selbst (Wortzahlen, Fakten, Einzigartigkeit)
 * prüft `verify-routing` über `verifySubRouteTexts`; hier nur, was die Seewetter-Linie zusätzlich verlangt.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEA_SPOT_NAMES } from '../src/sea/seaSpotNames.ts';
import { SEA_SPOT_FACTS } from '../src/sea/seaSpotFacts.ts';
import { seaSpotSeoTexts, seaSpotSeoText, dirWord, dwdName } from '../src/sea/seaSeoText.ts';
import { SEA_SPOT_COUNT } from '../src/sea/seaSeo.ts';
import { ROUTE_BY_ID, canonicalPath, metaForPath, indexableSubRoutes } from '../src/router/routes.ts';
import { ogCardPath } from '../src/share/ogCard.ts';
import { PLACES_ALL } from './seo/places.mjs';
import { seaSpotDirectory } from './seo/content.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });

// (1) Eine Spot-Liste, drei Quellen.
const src = JSON.parse(readFileSync(join(ROOT, 'scripts/sea/spots-src.json'), 'utf8')).spots.map((s) => s.id);
const names = Object.keys(SEA_SPOT_NAMES);
const facts = SEA_SPOT_FACTS.map((s) => s.id);
const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
add('Handliste, Namenstabelle und Steckbriefe nennen dieselben Spots', same(src, names) && same(names, facts), `src ${src.length} · Namen ${names.length} · Steckbriefe ${facts.length}`);
add('Namen in Namenstabelle und Steckbrief stimmen überein', SEA_SPOT_FACTS.every((s) => SEA_SPOT_NAMES[s.id]?.[0] === s.name && SEA_SPOT_NAMES[s.id]?.[1] === s.region));
add('SEA_SPOT_COUNT = Zahl der Spots', SEA_SPOT_COUNT === names.length && names.length >= 50, String(SEA_SPOT_COUNT));

// (2) Jede Spot-Seite ist eine eigene Sub-Route mit eigenem Canonical, Titel und Rewrite; die Übersicht bleibt die Übersicht.
const subs = ROUTE_BY_ID.seewetter.subs ?? [];
add('jeder Spot ist Sub-Route von /seewetter', same(subs.map((x) => x.slug), names));
add('jeder Spot ist indexierbar und kanonisch auf sich selbst', names.every((id) => !metaForPath(`/seewetter/${id}`).noindex && canonicalPath(`/seewetter/${id}`) === `/seewetter/${id}`));
add('jeder Spot hat eine eigene Shell', indexableSubRoutes(ROUTE_BY_ID.seewetter).every((x) => x.shell === `/seewetter--${x.sub.slug}.html`) && indexableSubRoutes(ROUTE_BY_ID.seewetter).length === names.length);
const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8').replace(/\r/g, '');
const rule = (id) => toml.indexOf(`from   = "/seewetter/${id}"\n  to     = "/seewetter--${id}.html"\n  status = 200`);
const wild = toml.indexOf('from   = "/seewetter/*"');
const badRules = names.filter((id) => rule(id) < 0 || rule(id) > wild);
add('netlify.toml: je Spot ein 200-Rewrite auf seine Shell VOR /seewetter/*', badRules.length === 0 && wild > 0, badRules.join(', '));
add('die Übersicht ist kanonisch /seewetter, ein unbekannter Spot noindex', canonicalPath('/seewetter') === '/seewetter' && metaForPath('/seewetter/gibt-es-nicht').noindex && canonicalPath('/seewetter/gibt-es-nicht') === '/seewetter');
add('Spot-Seiten teilen die Vorschau-Karte der Route (keine 56 PNG)', names.every((id) => ogCardPath('seewetter', id) === '/og/app/seewetter.png'));
const titles = subs.map((x) => x.title), descs = subs.map((x) => x.description);
add('Titel und Descriptions paarweise verschieden, Description ≤ 160 Zeichen', new Set(titles).size === titles.length && new Set(descs).size === descs.length && descs.every((d) => d.length <= 160));

// (3) Texte: Links nur auf Seiten, die es gibt; Ort im JSON-LD; Nachbarn aus derselben Küste.
const texts = seaSpotSeoTexts();
const placeSlugs = new Set(PLACES_ALL.map((p) => p.slug));
const badLinks = [];
for (const [path, t] of Object.entries(texts)) {
  for (const l of [...(t.links ?? []), ...(t.related?.items ?? [])]) {
    const h = l.href;
    const ok = h === '/seewetter' || (h.startsWith('/seewetter/') && names.includes(h.slice(11)))
      || (h.startsWith('/wetter/') && placeSlugs.has(h.slice(8).replace(/\/$/, '')))
      || ['/wissen/seegang-wellenhoehe/', '/wissen/seewetterbericht/'].includes(h);
    if (!ok) badLinks.push(`${path} → ${h}`);
  }
}
add('jeder Link einer Spot-Seite zeigt auf eine bestehende Seite', badLinks.length === 0, badLinks.slice(0, 5).join(', '));
add('jede Spot-Seite nennt ihren Ort (Place mit Koordinaten) und Nachbarspots', Object.values(texts).every((t) => t.place && Number.isFinite(t.place.lat) && t.related && t.related.items.length >= 2));
const sameRegion = SEA_SPOT_FACTS.every((s) => s.near.every(([id]) => SEA_SPOT_FACTS.find((o) => o.id === id)?.region === s.region));
add('Nachbarspots liegen an derselben Küste', sameRegion);
add('seaSpotSeoText kennt jeden Spot und keinen anderen', names.every((id) => !!seaSpotSeoText(id)) && seaSpotSeoText('gibt-es-nicht') === null);

// (4) Ehrlichkeit (CLAUDE.md, D-04): keine Sicherheitsfreigabe, keine eigene Warnung, keine Prognosezahl im statischen Text.
const all = Object.values(texts).map((t) => [t.h1, t.lead, ...t.body, ...t.facts.map((f) => f.text)].join(' ')).join(' ');
add('keine Sicherheitsfreigabe in eigener Stimme („sicher", „ungefährlich", „gefahrlos")', !/\b(ist|sind|bleibt|gilt als) (sicher|ungefährlich|gefahrlos)\b|\bsicheres? (Segeln|Baden|Kiten)\b/i.test(all));
add('„Warnung" nur als Hinweis auf den amtlichen Text', all.split(/[.;]/).every((sent) => !/Warnung/i.test(sent) || /amtlich|Seewetterdienst|Wortlaut|Warnstatus|kein amtliches Warnprodukt/i.test(sent)));
add('keine Prognosewerte im statischen Text (Meter-/Knotenwerte nur als Abstand oder Gitterweite)', !/\d+(,\d+)?\s?(m|Meter|kn|Knoten|Bft|Beaufort)\b/.test(all.replace(/rund 900 Metern Maschenweite/g, '').replace(/statt 0 Meter/g, '')));
add('DWD-Schreibweise wird umgesetzt (Suedliche → Südliche, Kueste → Küste)', dwdName('Suedliche Ostsee') === 'Südliche Ostsee' && dwdName('Boddengewaesser Ost und oestlich Ruegen') === 'Boddengewässer Ost und östlich Rügen' && !/Kueste|Suedl|Ruegen|gewaesser/.test(all));
add('Himmelsrichtungen: 0° Nord, 90° Ost, 284° Westnordwest, 359° Nord', dirWord(0) === 'Nord' && dirWord(90) === 'Ost' && dirWord(284) === 'Westnordwest' && dirWord(359) === 'Nord');

// (5) Übersicht: das Verzeichnis verlinkt jeden Spot genau einmal.
const dir = seaSpotDirectory();
const linked = [...dir.matchAll(/href="\/seewetter\/([a-z0-9-]+)"/g)].map((m) => m[1]);
add('das Verzeichnis auf /seewetter verlinkt jeden Spot genau einmal', same(linked, names) && new Set(linked).size === linked.length, `${linked.length} Links`);

// (6) Die App schreibt den Standard-Spot nicht in die Adresse der Übersicht (Canonical-Schutz, Textsonde mit Gegenprobe).
const page = readFileSync(join(ROOT, 'src/sea/SeaPage.tsx'), 'utf8');
const probe = (src) => /useState<boolean>\(!!initial\.spot\)/.test(src) && /spot: spotInUrl \? \(spot\?\.id \?\? spotId\) : null/.test(src)
  && /if \(spotInUrl\) onSpot\(/.test(src) && /setSpotId\(id\); setSpotInUrl\(true\)/.test(src);
add('SeaPage: auf /seewetter bleibt der Spot aus der Adresse, bis einer gewählt wird', probe(page));
add('Gegenprobe: die Sonde erkennt den alten Stand (Spot immer in der Adresse)', !probe(page.replace('if (spotInUrl) onSpot(', 'onSpot(')) && !probe(page.replace('spot: spotInUrl ? (spot?.id ?? spotId) : null', 'spot: spot?.id ?? spotId')));
const numbers = /\d+(,\d+)?\s?(m|Meter|kn|Knoten|Bft|Beaufort)\b/;
add('Gegenprobe: die Zahlenregel erkennt einen eingeschmuggelten Prognosewert', numbers.test('Welle 1,5 m') && numbers.test('Wind 5 Bft') && !numbers.test('5,2 km vom Spot'));

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail && !c.ok ? `  — ${c.detail}` : ''}`);
console.log(`\n  ${checks.length - failed.length}/${checks.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
