/**
 * Verifier — Brand-Detailansicht (BD1, `audit/brand-detail.md`).
 *
 *   npm run verify:fire-detail
 *
 * Netzfrei. (a) Selbstverifikation der puren Module `detail/fireWeatherAtPoint.ts`
 * (Parser, Regentage, Beschriftungen) und `detail/passTimeline.ts` (Balken, Lücken, Achsen);
 * (b) Textsonden am Panel: die vier Kennzahlen stehen IMMER in der Kachel, die Detailkarte ist
 * gegliedert, „Ursache" nennt „keine Quelle", die Wetterlage trägt das Modell-Label;
 * (c) Doku: der Endpunkt-Parameter steht in `docs/API.md`, der Lizenz-Ref in `licenses.mjs`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { verifyFireWeatherAtPoint } from '../src/fire/detail/fireWeatherAtPoint.ts';
import { verifyPassTimeline } from '../src/fire/detail/passTimeline.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

for (const c of verifyFireWeatherAtPoint().checks) add(`[wetter] ${c.name}`, c.ok, c.detail);
for (const c of verifyPassTimeline().checks) add(`[verlauf] ${c.name}`, c.ok, c.detail);

const panel = readFileSync(join(ROOT, 'src', 'fire', 'FireFootprintPanel.tsx'), 'utf8');
const css = readFileSync(join(ROOT, 'src', 'fire', 'fireDeck.css'), 'utf8');
const api = readFileSync(join(ROOT, 'docs', 'API.md'), 'utf8');
const lic = readFileSync(join(ROOT, 'scripts', 'seo', 'licenses.mjs'), 'utf8');

add('[kachel] vier Kennzahlen: Fläche · Detektionen · Stärke · Tendenz', /lbl="Fläche"/.test(panel) && /lbl="Detektionen"/.test(panel) && /lbl="Stärke"/.test(panel) && /lbl="Tendenz"/.test(panel));
add('[kachel] Kennzahlen stehen nicht mehr hinter `sel ?` (immer sichtbar)', !/\{sel \? \(\s*<span className="br-fire-stats">/.test(panel));
add('[detail] Abschnitte Kennzahlen · Verlauf · Wetterlage · Einordnung · Merkmale', ['Kennzahlen', 'Verlauf', 'Wetterlage', 'Einordnung', 'Merkmale'].every((s) => new RegExp(`<Sec[^>]*>${s}`).test(panel)));
add('[detail] Ursache: „keine Quelle" mit Einordnungshilfen', /<dt>Ursache<\/dt>/.test(panel) && /keine Quelle/.test(panel));
add('[detail] Wetterlage trägt das Modell-Label (keine Messung)', /FIRE_WEATHER_SOURCE_LABEL/.test(panel));
add('[detail] Wetter lädt erst bei offenem Detail (Effekt an r.id)', /fetchFireWeatherAtPoint\(/.test(panel) && /useEffect/.test(panel));
add('[detail] Chart ist eingebunden und die Textliste bleibt', /<FirePassChart/.test(panel) && /fire-fp-passes--af/.test(panel));
add('[css] Kennzahl-Raster vierspaltig, im Sheet/Tablet zweispaltig', /\.br-fire-stats \{[^}]*grid-template-columns: repeat\(4/.test(css) && /\.br-fire-stats \{[^}]*repeat\(2/.test(css));
add('[doku] API.md nennt past_days + icon_seamless', /past_days/.test(api) && /icon_seamless/.test(api));
add('[doku] Lizenz-Ref zeigt auf das neue Modul', /fireWeatherAtPoint/.test(lic));

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
console.log(`\n${checks.length - failed.length}/${checks.length} Prüfungen bestanden.`);
if (failed.length) process.exit(1);
