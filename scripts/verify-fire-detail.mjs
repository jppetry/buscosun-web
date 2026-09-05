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
import { verifyFireSatImagery } from '../src/fire/detail/fireSatImagery.ts';
import { verifyCogTiff, writeTiledTiff, parseCogIfds, decodeTile } from '../src/fire/detail/cogTiff.ts';
import { remuxWcLevel, assertWcLevelContract } from './fire/wc/wcRemux.mjs';
import { verifySentinelGeo } from '../src/fire/detail/sentinelGeo.ts';
import {
  verifyBurnIndex, dnbrTileRgba, swirTileRgba, nbrOf, dnbrRgba, swirChannel, DNBR_CLASSES,
  sclPreMasked, sclPostMasked, sclPostUnsure, wcDamped,
} from '../src/fire/detail/burnIndex.ts';
import { verifyWorldCover } from '../src/fire/detail/worldCover.ts';
import { verifySatDetections } from '../src/fire/detail/satDetections.ts';
import { verifyBurnScar, floodScar, seedsFromRects, SCAR_MIN_CLASS } from '../src/fire/detail/burnScar.ts';
import { CLS_UNSURE_FLAG } from '../src/fire/detail/burnIndex.ts';
import {
  verifyFireDrivers, driverRating, dominantWind, windRose, spreadVsWind, fireIndexSeries,
  DRIVER_RULES, DRIVER_RULE_TEXT, FIRE_INDEX_NOTE, STEADY_MIN,
} from '../src/fire/detail/fireDrivers.ts';
import { mappingGapText, EFFIS_LAG_DAYS, EFFIS_SIZE_EVIDENCE } from '../src/fire/footprint/fireRegistry.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

for (const c of verifyFireWeatherAtPoint().checks) add(`[wetter] ${c.name}`, c.ok, c.detail);
for (const c of verifyPassTimeline().checks) add(`[verlauf] ${c.name}`, c.ok, c.detail);

const panel = readFileSync(join(ROOT, 'src', 'fire', 'FireFootprintPanel.tsx'), 'utf8');
const css = readFileSync(join(ROOT, 'src', 'fire', 'fireDeck.css'), 'utf8');
const api = readFileSync(join(ROOT, 'docs', 'API.md'), 'utf8');
const lic = readFileSync(join(ROOT, 'scripts', 'seo', 'licenses.mjs'), 'utf8');
const audit = readFileSync(join(ROOT, 'audit', 'brandradar-satellitenbilder.md'), 'utf8');

add('[kachel] vier Kennzahlen: Fläche · Detektionen · Stärke · Tendenz', /lbl="Fläche"/.test(panel) && /lbl="Detektionen"/.test(panel) && /lbl="Stärke"/.test(panel) && /lbl="Tendenz"/.test(panel));
add('[kachel] Kennzahlen stehen nicht mehr hinter `sel ?` (immer sichtbar)', !/\{sel \? \(\s*<span className="br-fire-stats">/.test(panel));
add('[detail] Wetterlage trägt das Modell-Label (keine Messung)', /FIRE_WEATHER_SOURCE_LABEL/.test(panel));
add('[detail] Wetter lädt erst bei offenem Detail (Effekt an r.id)', /fetchFireWeatherAtPoint\(/.test(panel) && /useEffect/.test(panel));
add('[detail] Chart ist eingebunden und die Textliste bleibt', /<FirePassChart/.test(panel) && /fire-fp-passes--af/.test(panel));
add('[css] Kennzahl-Raster vierspaltig, im Sheet/Tablet zweispaltig', /\.br-fire-stats \{[^}]*grid-template-columns: repeat\(4/.test(css) && /\.br-fire-stats \{[^}]*repeat\(2/.test(css));
add('[doku] API.md nennt past_days + icon_seamless', /past_days/.test(api) && /icon_seamless/.test(api));
add('[doku] Lizenz-Ref zeigt auf das neue Modul', /fireWeatherAtPoint/.test(lic));

// --- BD2 (2026-08-29): Brand-Dossier in der Mitte — audit/brandradar-detail-mitte.md ---
const dossier = readFileSync(join(ROOT, 'src', 'fire', 'FireDossier.tsx'), 'utf8');
const mini = readFileSync(join(ROOT, 'src', 'fire', 'FireMiniMap.tsx'), 'utf8');
const page = readFileSync(join(ROOT, 'src', 'fire', 'FirePage.tsx'), 'utf8');
const chart = readFileSync(join(ROOT, 'src', 'fire', 'FirePassChart.tsx'), 'utf8');
const fstate = readFileSync(join(ROOT, 'src', 'fire', 'fireState.ts'), 'utf8');
const BLOCKS = ['DetailSubline', 'DetailKennzahlenRows', 'DetailConfidenceRows', 'DetailFrpRows', 'DetailVerlauf', 'WeatherBlock', 'DetailEinordnungRows', 'CauseText', 'FeaturesRow', 'RecordStats'];
// BD3 (2026-09-03): die Abschnitte stehen im DOSSIER — die Inline-Karte im Readout ist gestrichen.
add('[detail] Abschnitte Kennzahlen · Verlauf · Wetterlage · Einordnung · Merkmale (jetzt im Dossier)',
  ['Verlauf', 'Wetterlage am Brandort', 'Einordnung', 'Merkmale'].every((x) => dossier.includes(x)) && /<DetailKennzahlenRows/.test(dossier));
add('[detail] Ursache: „keine Quelle" mit Einordnungshilfen (Text im Panel, Kasten im Dossier)',
  /keine Quelle/.test(panel) && /<CauseText/.test(dossier) && /br-ds-cause/.test(dossier));
// BD3: `FootprintDetail` ist gestrichen — das Dossier ist die Obermenge (audit §6). Geprüft wird
// beides: dass die Karte wirklich weg ist und dass KEIN Baustein mit ihr verschwunden ist.
add('[bd2] die Bausteine der Detailkarte sind exportiert (EINE Quelle für Readout und Dossier)',
  BLOCKS.every((b) => new RegExp(`export (function|const) ${b}\\b`).test(panel)));
add('[bd3] die Inline-Detailkarte im Readout ist gestrichen (das Dossier ist der einzige Detailort)',
  !/function FootprintDetail/.test(panel) && !/<FootprintDetail/.test(panel) && !/detail: FireRecord/.test(panel));
add('[bd3] kein Baustein ist mit ihr verschwunden — das Dossier setzt ALLE zusammen',
  BLOCKS.every((b) => dossier.includes(`<${b}`)));
add('[bd2] das Dossier setzt dieselben Bausteine in D6-Ordnung zusammen (Kopf → Kennzahlen → Verlauf → Wetterlage → Einordnung → Merkmale)', (() => {
  if (BLOCKS.some((b) => dossier.indexOf(`<${b}`) < 0)) return false;
  const order = ['RecordStats', 'DetailKennzahlenRows', 'DetailVerlauf', 'WeatherBlock', 'DetailEinordnungRows', 'CauseText', 'FeaturesRow'].map((b) => dossier.indexOf(`<${b}`));
  return order.every((v, i) => i === 0 || v > order[i - 1]);
})());
add('[bd2] Dossier hat keine eigenen Fachtexte zur Ursache (nur der geteilte CauseText)', !/keine Quelle/.test(dossier));
add('[bd2] Ursache steht im Warn-Kasten (--br-warn-*), Wetterlage in Steel',
  /\.br-ds-cause \{[^}]*--br-warn-tint/.test(css) && /\.br-ds-card\.is-steel \{[^}]*#C7D6E4/.test(css) && /#EAF1F7/.test(css));
add('[bd2] Verlauf: SVG-Texte tragen League Spartan, wide-Maß wideWidth × 160 (Standard 380; 12 px rendern als 12 px)',
  /League Spartan/.test(chart) && /wide \? wideWidth/.test(chart) && /wideWidth = 380/.test(chart) && /wide \? 160/.test(chart) && /wide \? 12 : 8/.test(chart) && (chart.match(/fontFamily=\{FONT\}/g) ?? []).length >= 6);
add('[bd2] Minikarte ist KEINE zweite FireMap (eigene leichte Instanz, nicht interaktiv, Klick ⇒ Bühne)',
  /new maplibregl\.Map\(/.test(mini) && /interactive: false/.test(mini) && !/<FireMap\b/.test(mini) && /onClick/.test(mini));
add('[bd2] Bühne: Segment Karte | Dossier, Klick auf Brand (Karte + Registry) öffnet das Dossier',
  /br-stage-seg/.test(page) && /const openDossier/.test(page)
  && /setStage\('dossier'\)/.test(page.slice(page.indexOf('const selectFootprintFromMap'), page.indexOf('const clearFootprint')))
  && /onSelect=\{openDossier\}/.test(page));
add('[bd2] Hauptkarte bleibt im Dossier montiert (nur außer Bild, kein Remount)',
  /fire-center\$\{inDossier && !isMobile \? ' is-offstage'/.test(page) && /\.fire-center\.is-offstage \{[^}]*visibility: hidden/.test(css));
add('[bd2] Permalink: ds nur wenn offen, Decoder nimmt nur die 1',
  /payload\.ds = 1/.test(fstate) && /dossier: o\.ds === 1/.test(fstate) && /dossier: stage === 'dossier'/.test(page));
add('[bd2] Zeit-Deck im Dossier als Leiste über die ganze Breite (derselbe Knoten)',
  /className="br-ds-foot">\{timeDeck\}/.test(page) && /\.br-ds-foot \.br-timedeck \{[^}]*position: static/.test(css));
// BD2d (2026-08-31, Jans Auftrag): die Sidebars bleiben in jeder Bühne — Dock links und Readout
// rechts rendern unabhängig von der Bühne, das Dossier ersetzt nur die Karten-Mitte.
add('[bd2d] Sidebars bleiben: kein Registry-/Rail-Ersatz mehr, Dossier als Scrollbereich + Zeit-Deck im Zentrum',
  !/DossierRegistryRail|br-ds-registry|br-ds-side/.test(page) && /br-ds-scroll/.test(css)
  && /\.br-ds-grid \{[^}]*minmax\(0, 1fr\) 250px/.test(css));
add('[bd2] Mobil: eigene Seite mit Kartenstreifen, Segment ≥ 44 px, Bottom-Bar bleibt',
  /br-m-dossier/.test(page) && /br-ds-mapstrip/.test(page) && /\.br-stage-seg\.is-big button \{[^}]*min-height: 44px/.test(css) && /\{bottomBar\}/.test(page));
// --- BD2a (2026-08-31, Jans Auftrag): jeder Brand-Klick auf der Karte öffnet das Dossier ---
const fmap = readFileSync(join(ROOT, 'src', 'fire', 'FireMap.tsx'), 'utf8');
add('[bd2a] Hüllen-Klick öffnet das Dossier (auch ohne Brandflächen-Layer) und meldet es zurück', (() => {
  const fn = page.slice(page.indexOf('const selectFromMap'), page.indexOf('const selectFootprintFromMap'));
  return /useCallback\(\(id: string \| null\): boolean/.test(fn) && /setStage\('dossier'\)/.test(fn) && /return true;/.test(fn);
})());
add('[bd2b] auch der Anlagen-Eintrag (site) öffnet sein Dossier — der Reiter bleibt Thermalanomalien (Jans Auftrag 2026-08-31)', (() => {
  const fn = page.slice(page.indexOf('const selectFromMap'), page.indexOf('const selectFootprintFromMap'));
  const site = fn.slice(fn.indexOf("kind === 'site'"), fn.indexOf("kind === 'site'") + 220);
  return /setReadoutTab\('anomalies'\); setStage\('dossier'\); return true;/.test(site);
})());
// BD2f (2026-08-31): auch im Historie-Modus (Monat/Saison) öffnet der Ereignis-Klick das Dossier —
// derselbe Detailkörper (HistoryDetailBody) für Inline-Karte und Mitte, Minikarte strukturell (MiniMapTarget).
const hpanel = readFileSync(join(ROOT, 'src', 'fire', 'FireHistoryPanel.tsx'), 'utf8');
add('[bd2f/g] Historie: Klick (Karte + Liste) öffnet das Ereignis-Dossier in der BD2-Kartenform (geteilter Hook, Kacheln, Verlauf aus den Shard-Detektionen)',
  !/HistoryDetailBody/.test(hpanel) && !/HistoryEventDetail/.test(hpanel)
  && /export function HistoryDossierBody/.test(hpanel) && /useHistoryEventData/.test(hpanel) && /groupPasses\(shardRows\(ev\)\)/.test(hpanel)
  && /setStage\('dossier'\)/.test(page.slice(page.indexOf('const selectHistory'), page.indexOf('const selectHistory') + 900))
  && (page.match(/<HistoryDossierBody\b/g) ?? []).length === 1 && /historyStatTiles\(historyEntry\)/.test(page)
  && /history \? historyDossier :/.test(page)
  && /export interface MiniMapTarget/.test(mini));
// BD2e (2026-08-31): MapLibre öffnet die kompakte Attribution beim Start ausgeklappt — sie schluckte
// Brand-Klicks in der unteren Kartenhälfte (612 × 62 px gemessen). Beide Karten klappen sie zu.
add('[bd2e] die Start-Attribution wird zugeklappt (Haupt- und Minikarte) — sonst schluckt sie Brand-Klicks',
  (fmap.match(/details\.maplibregl-ctrl-attrib\[open\]/g) ?? []).length === 1
  && (mini.match(/details\.maplibregl-ctrl-attrib\[open\]/g) ?? []).length === 1);
add('[bd2c] Detektionspunkt-Klick öffnet das Dossier des Brands (kleinste Bbox gewinnt), VOR dem Steckbrief',
  /openDossierForDetection/.test(page) && /onSelectDetectionRef\.current\?\.\(geom\.coordinates\[0\], geom\.coordinates\[1\]\) === true/.test(fmap)
  && /area\(b\) < area\(a\)/.test(page));
add('[bd2b] EFFIS-Fläche und Raster-Zone mit Brand dahinter öffnen das Dossier, ohne Eintrag bleibt der Steckbrief',
  /openDossierForEffis/.test(page) && /openDossierForZone/.test(page)
  && /onSelectBurntRef\.current\?\.\(String\(poly\.id\)\) === true/.test(fmap)
  && /onSelectZoneRef\.current\?\.\(zone\.id\) === true/.test(fmap)
  && /rec \? selectFootprintFromMap\(rec\.id\) : false/.test(page));
add('[bd2a] auch der wiederholte Klick auf den markierten Brand zählt (kein Gleichheits-Wächter mehr)',
  !/id !== s\.selectedFootprintId\) onSelectFootprintRef/.test(fmap) && !/id !== s\.selectedClusterId\) onSelectClusterRef\.current\(id/.test(fmap));
add('[bd2a] der Klick, der das Dossier öffnet, öffnet kein Popup (und räumt ein offenes weg)',
  /let openedDossier = false;/.test(fmap) && /if \(openedDossier\) \{ popupRef\.current\?\.remove\(\); popupRef\.current = null; return; \}/.test(fmap));
add('[bd2] kleinste Dossier-Schrift Desktop ≥ 12 px, mobil ≥ 11 px', (() => {
  const block = css.slice(css.indexOf('BD2 — Brand-Dossier'));
  const desk = block.slice(0, block.indexOf('@media (max-width: 1439px)'));
  const mob = block.slice(block.indexOf('@media (max-width: 767px)'));
  const min = (t) => Math.min(...[...t.matchAll(/font-size: ([0-9.]+)px/g)].map((m) => Number(m[1])));
  return min(desk) >= 12 && min(mob) >= 11;
})());
add('[bd2] keine neuen Farben im Dossier-CSS: nur Tokens und die Vorlagen-Hex (#FDFBF4 Kachel, #EAF1F7/#C7D6E4 Steel)', (() => {
  const block = css.slice(css.indexOf('BD2 — Brand-Dossier'));
  const hex = [...block.matchAll(/#[0-9A-Fa-f]{3,6}\b/g)].map((m) => m[0].toUpperCase());
  // SAT3/§13.5: #FFB08A ist eine bewusste AUSNAHME — die Signalfarbe der Detektions-Rechtecke ÜBER
  // dem Satellitenfoto. Sie ist kein UI-Chrome (D-27 zielt auf das Deck), und das matte Deck-Token
  // --terracotta-500 war auf braun-grünem Gelände gemessen unsichtbar. Sie darf NUR dort stehen.
  const allowed = new Set(['#FDFBF4', '#EAF1F7', '#C7D6E4', '#F5F1E8', '#E0D6BE', '#FAF6EA', '#2C2A26', '#3A3833', '#5C5447', '#8B7355', '#A89A7A', '#EDE6D3', '#FFF', '#FFB08A']);
  return hex.every((h) => allowed.has(h));
})());
// --- SAT1 (2026-09-01): Satellitenbilder vorher/während/nachher — audit/brandradar-satellitenbilder.md ---
for (const c of verifyFireSatImagery().checks) add(`[sat] ${c.name}`, c.ok, c.detail);
const satc = readFileSync(join(ROOT, 'src', 'fire', 'FireSatImagery.tsx'), 'utf8');
const satm = readFileSync(join(ROOT, 'src', 'fire', 'detail', 'fireSatImagery.ts'), 'utf8');
add('[sat] EINE Komponente, zwei Aufrufer: SatImageryBlock je 1× im Live- und im Ereignis-Dossier',
  (dossier.match(/<SatImageryBlock/g) ?? []).length === 1 && (hpanel.match(/<SatImageryBlock/g) ?? []).length === 1);
add('[sat] strukturelle Props — die Komponente kennt weder FireRecord noch HistoryIndexEntry',
  !/fireRegistry/.test(satc) && !/historyArtifacts/.test(satc)); // Import-Sonde — Kommentare dürfen die Worte nennen (Lehre §14.5)
add('[sat] Kill-Switch ?sat=0 im Modul, beide Einbauorte hängen daran (Rule 2)',
  /get\('sat'\)/.test(satm) && /localStorage\?\.getItem\('sat'\)/.test(satm)
  && (dossier.match(/satEnabled\(\) &&/g) ?? []).length === 1 && (hpanel.match(/satEnabled\(\) &&/g) ?? []).length === 1);
add('[sat] Data-Present wird VOR der Anzeige ausgewertet — „kein Bild" ist ein benannter Zustand',
  /Data-Present'\) === 'false'/.test(satc) && /nodata/.test(satc) && /noch kein Bild auf dem Bilddienst/.test(satc));
add('[sat] Bilder strikt on-demand: genau EINE Abrufstelle, kein Vorladen (V-SAT-1)',
  (satc.match(/loadSnapshot\(/g) ?? []).length === 2 && !/scenes\.map\([^)]*loadSnapshot/.test(satc));
add('[sat] Ehrlichkeit: 30-m-Grenze und „Wolken je Szene, nicht am Brandort" stehen an der Karte',
  /keine sichtbare Narbe/.test(satc) && /nicht am Brandort/.test(satc) && /SAT_ATTRIBUTION/.test(satc));
add('[sat] Deep-Link (10 m, Copernicus Browser) mit gewähltem Tag und rel="noopener"',
  /copernicusBrowserUrl\(t\.lat, t\.lon, scene\.dayIso\)/.test(satc) && /rel="noopener"/.test(satc));
add('[sat] leere Phase ist deaktiviert, nie stummer Leerraum (Grund als Satz in notes)',
  /disabled=\{!pick\}/.test(satc) && /Kein Überflug während des Brandes/.test(satm));
add('[sat] CSS: Satellitenbild volle Breite Reihe 3, Einordnung/Merkmale rücken auf 4/5',
  /\.br-ds-satbild \{ grid-column: 1 \/ -1; grid-row: 3; \}/.test(css)
  && /\.br-ds-einordnung \{ grid-column: 1 \/ -1; grid-row: 4; \}/.test(css)
  && /\.br-ds-merkmale \{ grid-column: 1 \/ -1; grid-row: 5; \}/.test(css));
add('[sat] mobil: Phasen- und Tagesknöpfe ≥ 44 px', (() => {
  const block = css.slice(css.indexOf('BD2 — Brand-Dossier'));
  const mob = block.slice(block.indexOf('@media (max-width: 767px)'));
  return /\.br-sat-seg button \{ min-height: 44px; \}/.test(mob) && /\.br-sat-day \{ min-height: 44px/.test(mob);
})());
add('[sat][doku] API.md nennt GIBS/Worldview-Snapshot/Earth-Search als Client-Kontrakt',
  /wvs\.earthdata\.nasa\.gov/.test(api) && /gibs\.earthdata\.nasa\.gov/.test(api) && /Data-Present/.test(api));
add('[sat][doku] Lizenzregister referenziert fireSatImagery', /fireSatImagery/.test(lic));

// --- SAT2a (2026-09-02): COG-Leser + 10-m-Viewer — audit/brandradar-satellitenbilder.md §9 ---
for (const c of (await verifyCogTiff()).checks) add(`[cog] ${c.name}`, c.ok, c.detail);
for (const c of verifySentinelGeo().checks) add(`[geo] ${c.name}`, c.ok, c.detail);
const cogv = readFileSync(join(ROOT, 'src', 'fire', 'FireCogViewer.tsx'), 'utf8');
add('[cog] Viewer ist ein eigener Lazy-Chunk und lädt erst mit dem Klick (NerdPanel-Muster)',
  /lazy\(\(\) => import\('\.\/FireCogViewer'\)\)/.test(satc) && /\{cog10 && \(/.test(satc) && /<Suspense/.test(satc));
add('[cog] Kill-Switch ?sat10=0 im Modul, der Einstiegsknopf hängt daran (Rule 2)',
  /get\('sat10'\)/.test(satm) && (satc.match(/sat10Enabled\(\)/g) ?? []).length === 2);
add('[cog] Kostenzahl steht am Knopf, BEVOR etwas lädt',
  /lädt je nach Zoom ~1–10 MB/.test(satc));
add('[cog] Landsat ist ausgeschlossen UND der Grund steht als Satz im Fußtext',
  /scene\.sat === 's2' && sat10Enabled\(\)/.test(satc) && /nur an Sentinel-2-Tagen/.test(satc)
  && /scene\?\.sat !== 's2'/.test(satc));
add('[cog] Canvas 2D, kein WebGL (kein STOPP-&-FRAGEN-Fall) — Sonde auf der Aufruf-Ebene',
  /getContext\('2d'\)/.test(cogv) && !/getContext\('webgl/.test(cogv));
add('[cog] Fadenkreuz am Brandpunkt + Maßstabsbalken sind Teil des Bildes',
  /drawCross/.test(cogv) && /scaleBar\(/.test(cogv) && /br-cog-scale/.test(cogv));
add('[cog] Statuszeile zählt Kacheln/MB ehrlich und nennt die 10-m-Kosten der Sicht (estimateBytes)',
  /Kacheln ·/.test(cogv) && /MB geladen/.test(cogv) && /estimateBytes\(/.test(cogv) && /volle 10 m hier/.test(cogv));
add('[cog] Vollbild als Portal (position:fixed entkäme dem overflow:hidden des Rahmens sonst nicht)',
  /createPortal\(body, document\.body\)/.test(cogv));
add('[cog] Esc schließt erst das Vollbild, dann den Viewer; Body-Scroll ist im Vollbild gesperrt',
  /'Escape'/.test(cogv) && /body\.style\.overflow = 'hidden'/.test(cogv));
add('[cog] Kachel-Cache mit Deckel (ImageBitmap.close) und In-Flight-Deckel',
  /TILE_CACHE_MAX/.test(cogv) && /\.close\(\)/.test(cogv) && /MAX_IN_FLIGHT/.test(cogv));
add('[cog] jeder Fehlerzustand ist benannt und trägt den Copernicus-Link als Ausweg',
  /nennt der Katalog kein 10-m-Original/.test(cogv) && /kann die App nicht lesen/.test(cogv)
  && /gerade nicht erreichbar/.test(cogv) && /fallbackUrl/.test(cogv) && /rel="noopener"/.test(cogv));
add('[cog] Szenenrand wird erklärt (schwarze Flächen sind der Szenenrand, kein Bildfehler)',
  /Szenenrand, kein Bildfehler/.test(cogv));
add('[cog] Viewer kennt weder FireRecord noch Registry (strukturelle Props)',
  !/fireRegistry/.test(cogv) && !/historyArtifacts/.test(cogv));
add('[cog] CSS: Vollbild-Overlay + Rad/Pinch-taugliche Canvas (touch-action: none)',
  /\.br-cog-full \{ position: fixed; inset: 0;/.test(css) && /touch-action: none/.test(css));
add('[cog] mobil: Einstiegs- und Steuer-Knöpfe ≥ 44 px', (() => {
  const block = css.slice(css.indexOf('BD2 — Brand-Dossier'));
  const mob = block.slice(block.indexOf('@media (max-width: 767px)'));
  return /\.br-cog-open button \{ min-height: 44px; \}/.test(mob) && /\.br-cog-ctrl button \{ width: 44px; height: 44px; \}/.test(mob);
})());
add('[cog][doku] API.md nennt den CORS-offenen COG-Bucket samt Preflight-Beleg',
  /sentinel-cogs\.s3\.us-west-2\.amazonaws\.com/.test(api) && /Access-Control-Allow-Headers: range/.test(api));
add('[cog][doku] Lizenzregister nennt den 10-m-COG-Pfad', /sentinel-cogs/.test(lic));

// --- SAT2b (2026-09-02): SWIR-Falschfarbe + dNBR-Overlay — audit/brandradar-satellitenbilder.md §10 ---
for (const c of verifyBurnIndex().checks) add(`[dnbr] ${c.name}`, c.ok, c.detail);
const burnSrc = readFileSync(join(ROOT, 'src', 'fire', 'detail', 'burnIndex.ts'), 'utf8');
add('[dnbr] Reflektanz-Skala kommt je Szene aus raster:bands, nie als Konstante (Baseline-Wechsel 2022)',
  /raster:bands/.test(satm) && /'raster:bands'/.test(satm) && /offset === -0\.1/.test(satm));
add('[dnbr] jede dNBR-Beschriftung führt das Wort „unkalibriert"',
  /unkalibriert/.test(burnSrc) && (cogv.match(/unkalibriert/g) ?? []).length >= 2);
add('[dnbr] Vorher-Szene NUR aus demselben Granulat (identisches Pixelgitter, §10.1 (3))',
  /pickPreDay/.test(satm) && /_\$\{square\}_/.test(satm) && /c\.square === square/.test(satm));
add('[dnbr] Modus-Chips nur mit vorhandenen Band-Assets; Echtfarbe bleibt Default',
  /hasBands && \(/.test(cogv) && /useState<CogMode>\('tci'\)/.test(cogv));
add('[dnbr] uint16-Dekodepfad wird benutzt (decodeTileU16) und B04 über den Ausschnitt (subTileU16)',
  /decodeTileU16/.test(cogv) && /subTileU16/.test(cogv) && /pairSwirLevels/.test(cogv) && /pairDnbrLevels/.test(cogv));
add('[dnbr] dNBR ist ein Overlay ÜBER der Echtfarbe und zeichnet NUR die gewählte Ebene (Deckkraft)',
  // Die Sonde haelt die AUSSAGE fest (dNBR ist der letzte Aufruf, chosenOnly = true),
  // nicht den Wortlaut der Argumentliste - V-SAT-17 haengt dort ein viertes Argument an.
  /chosenOnly/.test(cogv)
  // SAT3d: zwischen dem Overlay-Aufruf und drawCross liegt jetzt die Narben-Rechnung — die zweite
  // Zeile hält fest, dass dort KEIN weiterer Pyramiden-Aufruf steht (dNBR bleibt der letzte).
  && /chosen\.ifd\.width, true[^)]*\);\s*\/\/ SAT3d/.test(cogv.replace(/\r/g, ''))
  && !/drawPyramid\(/.test(cogv.slice(cogv.lastIndexOf('chosen.ifd.width, true'), cogv.indexOf('const drawScar'))));
add('[dnbr] Legende aus DERSELBEN Quelle wie die Canvas-Farben (DNBR_CLASSES, eine Wahrheit)',
  /DNBR_CLASSES\.map/.test(cogv) && /DNBR_CLASSES/.test(burnSrc));
add('[dnbr] jede Lücke ist ein benannter Satz: kein Band / keine Vorher-Szene / fremdes Format',
  /keine Band-Originale/.test(cogv) && /Keine wolkenarme Vorher-Szene desselben Granulats/.test(cogv)
  && /kann die App nicht lesen/.test(cogv));
add('[dnbr] rAF-Aufräumung setzt die ID zurück (sonst zeichnet schedule() nie wieder, §10.3 (2))',
  /cancelAnimationFrame\(rafRef\.current\); rafRef\.current = 0;/.test(cogv));
add('[dnbr] Anker der Vorher-Suche ist der BRANDBEGINN, nicht der Betrachtungstag (§10.3 (1))',
  /fireStartIso != null && fireStartIso < dayIso/.test(cogv) && /fireStartIso=\{t\.firstMs != null/.test(satc));
add('[dnbr] der dNBR-Satz nennt beide Vergleichstage und die fehlende Wolkenmaske',
  /Vergleich \{fmtDay\(preInfo\.dayIso\)\} → \{fmtDay\(dayIso\)\}/.test(cogv) && /keine Wolkenmaske/.test(cogv));

// --- SAT2c (§11): SCL-Maske am dNBR-Overlay ---------------------------------------------------
add('[scl] Vorher hart, Nachher nie binär: Prädikate + halbe Deckkraft im Kompositor',
  /sclPreMasked/.test(burnSrc) && /sclPostMasked/.test(burnSrc) && /sclPostUnsure/.test(burnSrc)
  && /al >> 1/.test(burnSrc));
add('[scl] SCL-Header und -Kacheln laufen fehlertolerant (catch ⇒ null, Overlay läuft weiter)',
  /sclIfds = \(href/.test(cogv) && /\.catch\(\(\) => null\)/.test(cogv)
  && /loadSclTile\(href, ifd, t\.idx, onBytes\)\.catch\(\(\) => null\)/.test(cogv));
add('[scl] SCL-Kacheln haben einen eigenen gedeckelten Cache und zählen in die Byte-Statuszeile',
  /SCL_CACHE_MAX/.test(cogv) && /_sclTiles\.delete/.test(cogv)
  && /loadSclTile\([\s\S]*?onBytes: \(n: number\) => void/.test(cogv));
add('[scl] Ebenen-Paarung: fehlendes/unpassendes SCL nimmt nur die Maske, nie das Overlay',
  /postScl: \(postScl && same\(postScl\)\) \?\? null/.test(cogv));
add('[scl] der Satz unterscheidet Maske aktiv (Vorher maskiert, Nachher blasser, Zirrus läuft durch) von „nicht verfügbar"',
  /in der Vorher-Szene maskiert, in der Nachher-Szene blasser dargestellt \(dünner Zirrus läuft durch\)/.test(cogv)
  && /keine Wolkenmaske \(Szenenklassifikation nicht verfügbar\)/.test(cogv));
add('[scl] die Legende erklärt die Blasser-Regel nur bei aktiver Maske',
  /d\?\.sclMask && \(/.test(cogv) && /blasser: Wolke\/Schatten nachher möglich/.test(cogv));
add('[scl] bands.scl ist optional im STAC-Kandidaten (fehlendes SCL schaltet SWIR/dNBR nie ab)',
  /scl: string \| null/.test(satm) && /scl: h\('scl'\)/.test(satm));
add('[dnbr] SWIR/dNBR sagen die 20-m-Datenauflösung (BAND_M_PER_PX in Glättung und Statuszeile)',
  /BAND_M_PER_PX = 20/.test(cogv) && /dataResM/.test(cogv));
add('[dnbr] uint16-Bandkacheln haben einen eigenen gedeckelten Cache',
  /BAND_CACHE_MAX/.test(cogv) && /_bandTiles\.delete/.test(cogv));
add('[dnbr] CSS: Modus-Chips + gestapelte Sätze + Legende, mobil 44 px',
  /\.br-cog-mode \{/.test(css) && /\.br-cog-notes \{/.test(css) && /\.br-cog-legend \{/.test(css)
  && /\.br-cog-mode button \{ min-height: 44px; \}/.test(css));
add('[dnbr][doku] API.md nennt die Band-COGs (B12/B8A, uint16, Predictor 2 auf 16-bit)',
  /B12\.tif|B8A\.tif/.test(api) && /16-bit|uint16/.test(api));

// --- SAT2d: WorldCover-Landbedeckungs-Dämpfung (§12) -------------------------------------------
for (const c of verifyWorldCover().checks) add(`[wc] ${c.name}`, c.ok, c.detail);
const wcSrc = readFileSync(join(ROOT, 'src', 'fire', 'detail', 'worldCover.ts'), 'utf8');
add('[wc] Dämpfungsregel im Kompositor: EINMAL halbiert (SCL-unsicher ODER Landbedeckung), nie gelöscht',
  /wcDamped/.test(burnSrc) && /\(postScl != null && sclPostUnsure\(postScl\[i\]\)\) \|\| \(wcCls != null && wcDamped\(wcCls\[i\]\)\)/.test(burnSrc));
add('[wc] Token: anonym, Sitzungs-Cache mit Ablauf-Wächter, Fehlschlag nie memoiert',
  /_tok && _tok\.expMs - Date\.now\(\)/.test(wcSrc) && /catch \{\s*return null;/.test(wcSrc)
  // `_tok = null` darf nur in der Deklaration und im Test-Haken `_resetWc` stehen —
  // ein Fehlschlag des Token-Abrufs selbst wird nie durch Nullen memoiert.
  && !/_tok = null/.test(wcSrc.replace(/let _tok[^;]*;/, '').replace(/export function _resetWc[\s\S]*?\n\}/, '')));
add('[wc] jeder Abruf fehlertolerant: Header, Kacheln und Sampler enden in catch ⇒ null',
  (wcSrc.match(/\.catch\(\(\) => null\)/g) ?? []).length >= 2 && /catch \{\s*return null;\s*\}/.test(wcSrc));
add('[wc] Fehlversuche werden aus den Caches entfernt (kein memoierter Ausfall)',
  /_wcHeaders\.delete/.test(wcSrc) && /_wcTiles\.delete/.test(wcSrc) && /WC_TILE_CACHE_MAX/.test(wcSrc));
add('[wc] der Viewer entscheidet die Dämpfung VOR dem ersten Kachelbau und der Schlüssel trägt sie',
  /prepareWcSampler\(lat, lon, onHeaderBytes\)\.catch\(\(\) => null\)/.test(cogv)
  // V-SAT-15: der Schlüssel trägt zusätzlich den Transportweg (|wc = PC, |wcm = Spiegel).
  && /\$\{wcArgs \? \(wcArgs\.via === 'mirror' \? '\|wcm' : '\|wc'\) : ''\}/.test(cogv)
  && /\$\{wcKeySuffix\(d\.wc != null\)\}/.test(cogv));
add('[wc] Sampler-Ausfall je Kachel nimmt nur die Dämpfung (catch ⇒ null im Kachelbau)',
  /wcArgs\.stepM, lv\.postS\.tileW, lv\.postS\.tileH, onBytes\)\.catch\(\(\) => null\)/.test(cogv));
add('[wc] Kill-Switch ?wc=0 gated die Vorbereitung (Rule 2, Query schlägt Speicher)',
  /wcEnabled\(\) \? await prepareWcSampler/.test(cogv));
add('[wc] der Satz nennt Quelle + Lizenz bei aktiver Dämpfung und behält den Ernte-Satz ohne sie',
  /ESA WorldCover 2021, CC BY 4\.0/.test(cogv)
  && /Feldwechsel \(Ernte\) können außerhalb von Wald ein Signal erzeugen/.test(cogv));
add('[wc] die Legende erklärt die Blasser-Regel nur bei aktiver Dämpfung',
  /\{wcOn && \(/.test(cogv) && /blasser: Acker\/Siedlung — Ernte statt Brand möglich/.test(cogv));
add('[wc] WC-Bytes zählen in die ehrliche Statuszeile (onBytes/onHeaderBytes durchgereicht)',
  /onBytes: \(n: number\) => void/.test(wcSrc) && /onHeaderBytes/.test(wcSrc));
add('[wc][doku] Lizenzregister führt ESA WorldCover mit Pflichttext und CORS-Befund',
  (() => {
    const lic = readFileSync(join(ROOT, 'scripts', 'seo', 'licenses.mjs'), 'utf8');
const audit = readFileSync(join(ROOT, 'audit', 'brandradar-satellitenbilder.md'), 'utf8');
    return /ESA WorldCover 2021/.test(lic) && /Planetary Computer/.test(lic) && /CC BY 4\.0/.test(lic);
  })());
add('[wc][doku] API.md beschreibt Token-Weg + CORS-Messung des AWS-Buckets',
  /planetarycomputer|Planetary Computer/.test(api) && /esa-worldcover|WorldCover/.test(api));

// --- V-SAT-15: jsDelivr-Spiegel als benannter Ersatzweg (§12.7) --------------------------------
// (Die Modul-Checks — Spiegel-URL, wcMirrorFlag, Latch, Ein-IFD-pickLevel, wcVia — laufen oben
// im verifyWorldCover-Block mit; hier stehen der Remux-Rundlauf und die Verdrahtungs-Sonden.)

/** Sonden auf das, was NICHT dastehen darf, lesen den Code ohne Kommentare (Lehre §14.5). */
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*)/.test(l))
  .join('\n');

{
  // Remux-Rundlauf headless: synthetische Ein-Ebenen-Quelle (Deflate-Kacheln, Randkacheln) →
  // remuxWcLevel mit In-Memory-readRange → beide Dateien durch DENSELBEN Leser, byte-gleich —
  // UND die kodierten Nutzlasten sind verbatim übernommen (kein Re-Encode).
  const deflate = async (bytes) => new Uint8Array(await new Response(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate')),
  ).arrayBuffer());
  const W = 10; const H = 7; const TW = 4; const TH = 4;
  const across = Math.ceil(W / TW); const down = Math.ceil(H / TH);
  const encoded = [];
  for (let row = 0; row < down; row++) for (let col = 0; col < across; col++) {
    const tile = new Uint8Array(TW * TH);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const gy = row * TH + y; const gx = col * TW + x;
      tile[y * TW + x] = gy < H && gx < W ? ((gy * W + gx) * 41 + 7) & 0xff : 0;
    }
    encoded.push(await deflate(tile));
  }
  const srcBuf = writeTiledTiff({ le: true, width: W, height: H, tileW: TW, tileH: TH, spp: 1, bits: 8, predictor: 1, compression: 8, encodedTiles: encoded });
  const srcParsed = parseCogIfds(srcBuf);
  add('[wcm] Remux-Quelle: exportierter Writer erzeugt lesbares Ein-IFD-TIFF',
    srcParsed.kind === 'ok' && srcParsed.ifds.length === 1 && srcParsed.ifds[0].tilesAcross === across);
  if (srcParsed.kind === 'ok') {
    const srcIfd = srcParsed.ifds[0];
    const srcU8 = new Uint8Array(srcBuf);
    const derBuf = await remuxWcLevel(srcIfd, async (offset, length) => srcU8.slice(offset, offset + length));
    const derParsed = parseCogIfds(derBuf);
    const derOk = derParsed.kind === 'ok' && derParsed.ifds.length === 1;
    add('[wcm] Remux-Derivat: Ein-IFD, gleiche Geometrie/Kompression', derOk
      && derParsed.ifds[0].width === W && derParsed.ifds[0].compression === 8 && derParsed.ifds[0].predictor === 1);
    if (derOk) {
      const derIfd = derParsed.ifds[0];
      const derU8 = new Uint8Array(derBuf);
      let decEq = true; let rawEq = true;
      for (let i = 0; i < encoded.length; i++) {
        const a = await decodeTile(srcU8.slice(srcIfd.tileOffsets[i], srcIfd.tileOffsets[i] + srcIfd.tileByteCounts[i]), srcIfd);
        const b = await decodeTile(derU8.slice(derIfd.tileOffsets[i], derIfd.tileOffsets[i] + derIfd.tileByteCounts[i]), derIfd);
        if (a.length !== b.length || !a.every((v, k) => v === b[k])) decEq = false;
        const raw = derU8.slice(derIfd.tileOffsets[i], derIfd.tileOffsets[i] + derIfd.tileByteCounts[i]);
        if (raw.length !== encoded[i].length || !raw.every((v, k) => v === encoded[i][k])) rawEq = false;
      }
      add('[wcm] Rundlauf: jede Kachel dekodiert byte-gleich (Quelle ↔ Derivat, derselbe Leser)', decEq);
      add('[wcm] Verbatim-Beweis: die kodierten Nutzlasten sind unverändert übernommen (kein Re-Encode)', rawEq);
    }
  }
  let contractErr = '';
  try { assertWcLevelContract({ width: 9000, height: 9000, tileW: 512, tileH: 1024, samplesPerPixel: 1, bitsPerSample: 8, compression: 8, predictor: 1, littleEndian: true }, 'X'); } catch (e) { contractErr = String(e); }
  add('[wcm] Ebenen-Vertrag: Abweichung ⇒ lauter, benannter Abbruch (nie eine unlesbare Datei)',
    contractErr.includes('X') && contractErr.includes('1024'));
}

{
  const wcCode = codeOnly(wcSrc);
  // Seit V-SAT-16 baut die Sampler-Closure GAR KEINEN Schlüssel mehr (sie indiziert ganzzahlig);
  // die via-Trennung sitzt jetzt ausschließlich in den beiden Cache-Stellen, durch die auch die
  // Closure geht (`wcIfds`/`loadWcTile`) — deshalb prüft die Sonde dort und verbietet die
  // Rückkehr des Schlüsselbaus je Pixel.
  add('[wcm] Cache-Schlüssel tragen den Transportweg (via-Präfix in Header- und Kachel-Schlüssel)',
    /`\$\{src\.via\}\|\$\{name\}`/.test(wcCode) && /`\$\{src\.via\}\|\$\{name\}\|\$\{ifd\.width\}\|\$\{idx\}`/.test(wcCode)
    && !/`\$\{src\.via\}\|\$\{loc\.name\}\|/.test(wcCode) && !/`\$\{src\.via\}\|\$\{name\}\|\$\{lv\.ifd\.width\}\|/.test(wcCode));
  add('[wcm] genau EINE console-Zeile nennt den Wegwechsel (RD2-Muster)',
    (wcCode.match(/console\.info/g) ?? []).length === 1 && /_mirrorAnnounced/.test(wcCode));
  add('[wcm] nur GEWORFENE Abrufe zählen in den Latch — eine Antwort (!r.ok, Nordsee-404) nie',
    /catch \(e\) \{\s*if \(src\.via === 'pc'\) notePcFailure\(\); else noteMirrorFailure\(\);/.test(wcSrc)
    && /if \(!r\.ok\) return null;/.test(wcCode));
  add('[wcm] 200-statt-206-Härtung: der Ausschnitt wird notfalls selbst geschnitten',
    /bytes\.length > byteCount\) bytes = bytes\.slice\(offset, offset \+ byteCount\)/.test(wcCode));
  add('[wcm] die Verfügbarkeitsprobe ist begrenzt (max. 3 Runden) und bricht bei definitiver Antwort ab',
    /round < 3/.test(wcCode) && /wcFailCount\(\) === before\) return null/.test(wcCode));
  add('[wcm] die Sampler-Closure läuft je Aufruf durch die Wegwahl (Latch-Kipp wandert transparent)',
    /const src = await wcSource\(\);/.test(wcCode));
  add('[wcm] ?wc=0 bleibt der Alles-aus-Schalter über der Wegwahl (Rule 2 unangetastet)',
    /wcEnabled\(\) \? await prepareWcSampler/.test(codeOnly(cogv)));
  const cogCode = codeOnly(cogv);
  add('[wcm] der Satz sagt den Spiegel nur im Spiegel-Fall („37 m statt 10 m" unter wcSrcVia-Bedingung)',
    /wcSrcVia === 'mirror' \? ' — Landbedeckung hier aus dem eigenen Spiegel \(37 m statt 10 m\)' : ''/.test(cogCode)
    && /setWcSrcVia\(wc != null \? wcVia\(\) : null\)/.test(cogCode));
  add('[wcm] ein Latch-Kipp wird beim Draw sichtbar (wcSrcVia aufgefrischt, Kacheln unter |wcm)',
    /setWcSrcVia\(\(v\) => \(v === wcVia\(\) \? v : wcVia\(\)\)\)/.test(cogCode) && /'\|wcm'/.test(cogCode));
}

{
  const producer = readFileSync(join(ROOT, 'scripts', 'fire', 'wc', 'build-wc-mirror.mjs'), 'utf8');
  add('[wcm] Producer: Budgets hart geprüft (20 MB/Datei, 150 MB/Paket) und Kachelliste begründet',
    /FILE_LIMIT = 20 \* 1024 \* 1024/.test(producer) && /PACKAGE_LIMIT = 150 \* 1024 \* 1024/.test(producer)
    && /N51E003/.test(producer) && /Selfkant/.test(producer) && /Druckventil/.test(producer));
  add('[wcm] Producer beweist am Objekt: Derivat-Kacheln byte-gleich durch DENSELBEN Leser',
    /decodeTile/.test(producer) && /nicht byte-gleich/.test(producer));
  add('[wcm][doku] Spiegel-README trägt die CC-BY-4.0-Attribution (Lizenzpflicht)',
    /WC_ATTRIBUTION/.test(producer) && /CC BY 4\.0/.test(producer));
  add('[wcm][doku] API.md nennt Spiegel-Repo, 37 m und den ?wcm-Schalter',
    /buscosun-worldcover/.test(api) && /wcm/.test(api));
  add('[wcm][doku] Lizenzregister führt den eigenen Spiegel als Ersatzweg',
    /buscosun-worldcover|Spiegel/.test(lic));
}

/* ---------------- V-SAT-16: keine Strings mehr in der Pixel-Schleife (§12.8) ---------------- */
{
  const wcCode = codeOnly(wcSrc);
  // Der Rumpf von `wcMapBlock` — die Schleife, die je Ausgabe-Pixel einmal läuft.
  const body = wcCode.slice(wcCode.indexOf('export function wcMapBlock'));
  const loop = body.slice(0, body.indexOf('\n}'));

  add('[v16] die Pixel-Schleife baut keinen String (kein Template-Literal, kein wcTileName)',
    !/`/.test(loop) && !/wcTileName|wcNameFromCode/.test(loop) && !/\.indexOf\(/.test(loop));
  add('[v16] die Pixel-Schleife hält keine Map/kein Set (nur typisierte Felder)',
    !/new Map|new Set|\.get\(|\.has\(/.test(loop));
  add('[v16] der Sampler nutzt wcMapBlock und lokalisiert nicht mehr je Pixel selbst',
    /const \{ tileOf, pixOf \} = wcMapBlock\(/.test(wcCode) && !/wcLocate\(grid\.lat/.test(wcCode));
  add('[v16] Namen entstehen nur noch für die URL (≤ 4 je Block, aus den Blockecken-Codes)',
    /const codes = \[\.\.\.new Set\(cornerIdx\.map\(\(k\) => wcTileCode\(/.test(wcCode)
    && /const names = codes\.map\(wcNameFromCode\)/.test(wcCode));
  add('[v16] der Abruf beginnt weiterhin während der Schleife (onNeed startet loadWcTile)',
    /wcMapBlock\(grid, nPix, slots, \(slot, idx\) => \{\s*pending\[slot\]\[idx\] = loadWcTile\(/.test(wcCode));
  add('[v16] die Zuordnung bleibt fehlertolerant: Kachel ohne Ebene bekommt fac 0, nie eine Klasse',
    /fac: 0/.test(wcCode) && /if \(slot < 0 \|\| fac === 0\) continue;/.test(wcCode)
    && /\} else \{ fac = 0; \}/.test(wcCode));
  add('[v16][doku] Audit führt V-SAT-16 mit Vorher/Nachher und dem Prüfstand',
    /V-SAT-16/.test(audit) && /wc-sampler-bench\.mjs/.test(audit));
}

/* --------------------------------------------------- V-SAT-17: Frame-Budget des Kachelbaus */
{
  add('[v17] es gibt genau EINEN Deckel für teure Kachelstarts, und er ist 1',
    (cogv.match(/const WC_STARTS_PER_FRAME = 1;/g) || []).length === 1);
  add('[v17] drawPyramid nimmt das Budget als Parameter mit dem alten Wert als Vorgabe',
    /chosenW: number, chosenOnly: boolean, maxStarts = 12,/.test(cogv)
    && /let started = 0;/.test(cogv));
  add('[v17] der Deckel überspringt den Start und merkt sich das Bild — er verwirft nichts',
    /if \(started >= maxStarts\) \{ frame\.deferred = true; continue; \}/.test(cogv));
  add('[v17] der Bild-Deckel 12 bleibt zusätzlich in Kraft (Frame-Budget ersetzt ihn nicht)',
    /budget\.n < 12\) \{\s*if \(started >= maxStarts\)/.test(cogv)
    && /budget\.n\+\+; started\+\+;/.test(cogv));
  add('[v17] das Budget greift NUR beim gedämpften dNBR — sonst unverändert 12',
    /chosen\.ifd\.width, true, d\.wc \? WC_STARTS_PER_FRAME : 12\);/.test(cogv));
  add('[v17] Echtfarbe und SWIR rufen drawPyramid weiterhin ohne Budget auf',
    (cogv.match(/chosen\.ifd\.width, false\);/g) || []).length === 2);
  add('[v17] ein liegen gebliebener Start fordert das nächste Bild an (kein Stillstand)',
    /if \(frame\.deferred\) schedule\(\);/.test(cogv));
  add('[v17] schedule bleibt rAF-koalesziert — der Nachschlag kann keine Schleife werden',
    /const schedule = \(\) => \{\s*if \(rafRef\.current\) return;/.test(cogv));
  add('[v17][doku] Audit führt V-SAT-17 mit der gemessenen Kachelzahl und dem Kontrolllauf',
    /V-SAT-17/.test(audit) && /12\.9\.1/.test(audit) && /262 144/.test(audit));
}

/* ------------------------------------------ V-SAT-18: die Komposit-Schleifen ohne null-Union */
{
  // Die Schleifen rechnen `nbrOf`/`swirChannel` inline (§12.10 E1). Der Beleg ist NICHT der
  // Wortlaut, sondern die Gleichheit: hier laufen die lesbaren Regelfunktionen als Referenz
  // gegen die ausgelieferten Kompositoren — über eine Kachel, die JEDEN Sonderfall enthält.
  const S1 = { scale: 1e-4, offset: -0.1 };   // Baseline 04.00
  const S2 = { scale: 1e-4, offset: 0 };      // Archiv-Szene ohne Offset — beide Skalen im Spiel
  const NPX = 64 * 64;
  const preN = new Uint16Array(NPX), preS = new Uint16Array(NPX);
  const postN = new Uint16Array(NPX), postS = new Uint16Array(NPX);
  const preScl = new Uint8Array(NPX), postScl = new Uint8Array(NPX), wcCls = new Uint8Array(NPX);
  // Deterministisches Muster (kein Zufall — ein Verifier muss reproduzierbar sein), das die
  // Sonderfälle erzwingt: nodata je Band einzeln, beide Bänder geklemmt (Summe 0), exakte
  // Klassenkanten, jede SCL-Klasse 0…11 und jede WorldCover-Klasse.
  const EDGES = [0.1, 0.27, 0.44, 0.66];
  for (let i = 0; i < NPX; i++) {
    preN[i] = 3000 + (i * 7) % 900; preS[i] = 520 + (i * 13) % 400;
    postN[i] = 2600 + (i * 11) % 800; postS[i] = 700 + (i * 17) % 1200;
    if (i % 23 === 0) preN[i] = 0;
    if (i % 29 === 0) preS[i] = 0;
    if (i % 31 === 0) postN[i] = 0;
    if (i % 37 === 0) postS[i] = 0;
    if (i % 41 === 0) { preN[i] = 400; preS[i] = 400; }          // beide geklemmt ⇒ Summe 0
    if (i % 43 === 0) { postN[i] = 300; postS[i] = 300; }
    if (i % 53 === 0) {
      // Exakt auf eine Klassenkante: NBR(vorher) = 1 (SWIR geklemmt), NBR(nachher) = 1 − Kante.
      const e = EDGES[(i / 53 | 0) % EDGES.length];
      const t = (1 - e);                                          // gewünschtes NBR nachher
      preN[i] = 3105; preS[i] = 400;
      postN[i] = 5000; postS[i] = Math.round(((1 - t) / (1 + t)) * 5000);
    }
    preScl[i] = i % 12; postScl[i] = (i * 5) % 12;
    wcCls[i] = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100][i % 12];
  }
  const refDnbr = (pn, ps, qn, qs, sA, sB, pScl, qScl, wc) => {
    const out = new Uint8ClampedArray(pn.length * 4);
    for (let i = 0, j = 0; i < pn.length; i++, j += 4) {
      if (pScl && sclPreMasked(pScl[i])) continue;
      if (qScl && sclPostMasked(qScl[i])) continue;
      const a = nbrOf(pn[i], ps[i], sA);
      const b = nbrOf(qn[i], qs[i], sB);
      const [r, g, bl, al] = dnbrRgba(a == null || b == null ? null : a - b);
      if (al === 0) continue;
      out[j] = r; out[j + 1] = g; out[j + 2] = bl;
      const unsure = (qScl != null && sclPostUnsure(qScl[i])) || (wc != null && wcDamped(wc[i]));
      out[j + 3] = unsure ? al >> 1 : al;
    }
    return out;
  };
  const refSwir = (a, b, c, s) => {
    const out = new Uint8ClampedArray(a.length * 4);
    for (let i = 0, j = 0; i < a.length; i++, j += 4) {
      const r = swirChannel(a[i], s), g = swirChannel(b[i], s), bl = swirChannel(c[i], s);
      if (r == null || g == null || bl == null) continue;
      out[j] = r; out[j + 1] = g; out[j + 2] = bl; out[j + 3] = 255;
    }
    return out;
  };
  const eq = (x, y) => {
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  };
  const SHAPES = [
    ['ohne SCL/WorldCover (SAT2b)', null, null, null],
    ['nur SCL (SAT2c)', preScl, postScl, null],
    ['nur WorldCover (SAT2d)', null, null, wcCls],
    ['SCL + WorldCover (Betrieb)', preScl, postScl, wcCls],
  ];
  for (const [label, a, b, c] of SHAPES) {
    add(`[v18] dNBR-Kachel byte-gleich zur lesbaren Regelfassung — ${label}`,
      eq(dnbrTileRgba(preN, preS, postN, postS, S1, S2, a, b, c),
        refDnbr(preN, preS, postN, postS, S1, S2, a, b, c)));
  }
  add('[v18] SWIR-Kachel byte-gleich zur lesbaren Regelfassung (swirChannel)',
    eq(swirTileRgba(postS, postN, preN, S1), refSwir(postS, postN, preN, S1))
    && eq(swirTileRgba(preN, preS, postS, S2), refSwir(preN, preS, postS, S2)));

  // Die Sonderfälle einzeln — damit ein Fehlschlag oben sagt, WELCHER Fall gebrochen ist.
  const one = (pn, ps, qn, qs) => dnbrTileRgba(
    Uint16Array.of(pn), Uint16Array.of(ps), Uint16Array.of(qn), Uint16Array.of(qs), S1, S1);
  add('[v18] nodata (DN 0) in irgendeinem der vier Bänder bleibt transparent — NaN, nicht Klasse 1',
    one(0, 542, 2688, 1723)[3] === 0 && one(3105, 0, 2688, 1723)[3] === 0
    && one(3105, 542, 0, 1723)[3] === 0 && one(3105, 542, 2688, 0)[3] === 0);
  add('[v18] beide Bänder geklemmt (Summe 0) bleibt transparent, nie Division durch 0',
    one(400, 400, 2688, 1723)[3] === 0 && one(3105, 542, 400, 400)[3] === 0);
  add('[v18] Goldwert 0,600 landet unverändert in der Klasse 0,44–0,66 (§10.1)',
    one(3105, 542, 2688, 1723)[3] === DNBR_CLASSES[2].rgba[3]
    && one(3105, 542, 2688, 1723)[0] === DNBR_CLASSES[2].rgba[0]);
  add('[v18] SWIR: nodata in irgendeinem Band bleibt transparent',
    swirTileRgba(Uint16Array.of(0), Uint16Array.of(2000), Uint16Array.of(1500), S1)[3] === 0
    && swirTileRgba(Uint16Array.of(3500), Uint16Array.of(0), Uint16Array.of(1500), S1)[3] === 0
    && swirTileRgba(Uint16Array.of(3500), Uint16Array.of(2000), Uint16Array.of(0), S1)[3] === 0);

  // Struktur: die Regeln dürfen nicht neben DNBR_CLASSES noch einmal als Zahl im Code stehen.
  add('[v18] Klassenkanten sind aus DNBR_CLASSES ABGELEITET, nicht daneben geschrieben',
    /const CLS_MIN = Float64Array\.from\(DNBR_CLASSES/.test(burnSrc)
    && /const CLS_A = Uint8Array\.from\(DNBR_CLASSES/.test(burnSrc)
    // Nur der Rumpf des Kompositors — die Selbstverifikation darunter nennt die Kanten zu Recht.
    && !/0\.27/.test(burnSrc.slice(
      burnSrc.indexOf('export function dnbrTileRgba'), burnSrc.indexOf('// --- Selbstverifikation'))));
  add('[v18] die NaN-Abfrage ist `!(d >= …)` — `d < …` wäre bei NaN still falsch',
    /if \(!\(d >= min0\)\) continue;/.test(burnSrc));
  add('[v18] die lesbaren Regelfunktionen bleiben exportiert (Legende, Selbstverifikation)',
    /export function nbrOf/.test(burnSrc) && /export function boaOf/.test(burnSrc)
    && /export function dnbrRgba/.test(burnSrc) && /export function swirChannel/.test(burnSrc));
  add('[v18] die Maskenregeln werden weiter AUFGERUFEN, nicht in die Schleife kopiert',
    /sclPreMasked\(preScl\[i\]\)/.test(burnSrc) && /sclPostMasked\(postScl\[i\]\)/.test(burnSrc)
    && /wcDamped\(wcCls\[i\]\)/.test(burnSrc));
  add('[v18][doku] Audit führt V-SAT-18 mit der Browser-Zerlegung (createImageBitmap 1,1 ms)',
    /V-SAT-18/.test(audit) && /12\.10\.1/.test(audit) && /1,1 ms/.test(audit));
}

// --- SAT3 (2026-09-05): Detektionen im Bild + Narbe an den Detektionen — audit/brandradar-satellitenbilder.md §13 ---
{
  for (const c of verifySatDetections().checks) add(`[sat3] ${c.name}`, c.ok, c.detail);
  for (const c of verifyBurnScar().checks) add(`[sat3][narbe] ${c.name}`, c.ok, c.detail);
  const dossier = readFileSync(join(ROOT, 'src', 'fire', 'FireDossier.tsx'), 'utf8');
  const page = readFileSync(join(ROOT, 'src', 'fire', 'FirePage.tsx'), 'utf8');
  const detSrc = readFileSync(join(ROOT, 'src', 'fire', 'detail', 'satDetections.ts'), 'utf8');
  const scarSrc = readFileSync(join(ROOT, 'src', 'fire', 'detail', 'burnScar.ts'), 'utf8');

  add('[sat3] Durchreichung: FirePage → FireDossier → SatImageryBlock → FireCogViewer, als reine FirmsRow-Liste',
    (page.match(/detections=\{hotspotRows\}/g) ?? []).length === 2
    && /detections\?: readonly FirmsRow\[\] \| null/.test(dossier) && /detections \}\} nowMs/.test(dossier)
    && /detections\?: readonly FirmsRow\[\] \| null/.test(satc) && /detections=\{t\.detections \?\? null\}/.test(satc)
    && /detections\?: readonly FirmsRow\[\] \| null/.test(cogv));
  // §13.5: gemessen unsichtbar war das matte Deck-Token auf braun-grünem Gelände. Die Sonde hält
  // fest, was die Sichtbarkeit trägt: EINE Farbe für beide Bilder, Füllung + Strich + dunkler Halo.
  add('[sat3] EINE Rechteckfarbe für beide Bilder, mit Füllung und dunklem Halo (Sichtbarkeit bei ~10 px)',
    /const DET_COLOR = '#FFB08A'/.test(cogv) && /const DET_FILL = 'rgba\(255, 176, 138, 0\.28\)'/.test(cogv)
    && /\.br-sat-det rect \{ fill: rgba\(255, 176, 138, \.28\); stroke: #FFB08A; stroke-width: 2;/.test(css)
    && /drop-shadow\(0 0 2px rgba\(44, 42, 38, \.95\)\)/.test(css)
    && /const DET_HALO = 'rgba\(44, 42, 38, 0\.85\)'/.test(cogv));
  add('[sat3] die Signalfarbe #FFB08A steht NUR an den Detektions-Rechtecken, nirgends sonst im Deck',
    (css.match(/#FFB08A|255, 176, 138/gi) ?? []).every((_, i, a) => a.length === 2)
    && css.slice(css.indexOf('.br-sat-det rect {'), css.indexOf('.br-sat-det rect.is-after')).includes('#FFB08A'));
  add('[sat3] „danach" ist in BEIDEN Bildern ungefüllt und gestrichelt — sichtbar UND unterscheidbar',
    /\.br-sat-det rect\.is-after \{ fill: none; stroke-dasharray: 5 3; \}/.test(css)
    && /ctx\.setLineDash\(after \? \[5 \* dpr, 3 \* dpr\] : \[\]\)/.test(cogv)
    && /path\(false\);\s*ctx\.fill\(\);/.test(cogv));
  add('[sat3] Rechtecke kommen aus footprintRing — dieselbe Regel wie der Karten-Layer, kein zweiter Bau',
    /import \{ footprintRing, type FirmsRow \} from '\.\.\/sources\/firmsHotspots'/.test(detSrc)
    && (detSrc.match(/footprintRing\(r\)/g) ?? []).length === 2);
  add('[sat3] 30 m: SVG im Bildmaß — viewBox aus SNAP_W/SNAP_H, Rahmen 5:4, Bild nur skaliert (object-fit: cover ohne Beschnitt)',
    /viewBox=\{`0 0 \$\{SNAP_W\} \$\{SNAP_H\}`\}/.test(satc) && /detectionRects30m\(t\.detections, data\.bbox, SNAP_W, SNAP_H/.test(satc)
    && /\.br-sat-frame \{[^}]*aspect-ratio: 5 \/ 4/.test(css) && /export const SNAP_W = 600/.test(satm) && /export const SNAP_H = 480/.test(satm));
  add('[sat3] 30 m: Umschalter „Detektionen" default an, nennt die Zahl im Bild, Sitzungszustand (kein Permalink)',
    /useState\(true\)/.test(satc) && /br-sat-dettoggle/.test(satc) && /keine im Bild/.test(satc) && !/showDet/.test(readFileSync(join(ROOT, 'src', 'fire', 'fireState.ts'), 'utf8')));
  add('[sat3] Zeitbezug: Aufnahme nach dem Szenentag ist gestrichelt — in beiden Bildern, aus EINER Regel (sceneDayEndMs)',
    /is-after/.test(satc) && /\.br-sat-det rect\.is-after \{ fill: none; stroke-dasharray/.test(css)
    && /setLineDash\(after \?/.test(cogv) && (detSrc.match(/sceneDayEndMs\(dayIso\)/g) ?? []).length === 2);
  add('[sat3] Ehrlichkeit: „Pixelgrundfläche … das Feuer liegt irgendwo darin" steht an BEIDEN Bildern; Historie sagt, warum sie fehlen',
    (satc.match(/das Feuer liegt irgendwo darin/g) ?? []).length === 1 && /das Feuer liegt irgendwo darin/.test(cogv)
    && /nur im Live-Dossier/.test(satc));
  add('[sat3] 10 m: Ecken laufen einzeln durch pixelOf (UTM-Drehung bleibt), Rechtecke außerhalb der Szene+Rand fallen weg',
    /detectionPolysPx\(/.test(cogv) && /DET_MARGIN_PX/.test(cogv) && /for \(let i = 0; i < 4; i\+\+\)/.test(detSrc));
  add('[sat3] 10 m: Overlays zeichnen nach JEDER Kachel neu (Narbe → Detektionen → Fadenkreuz), Fadenkreuz bleibt',
    /const drawOverlays = \(\) => \{ drawScar\(\); drawDet\(\); drawCross\(\); \}/.test(cogv)
    && /place\(lv\.ifd, t, bmp\); drawOverlays\(\);/.test(cogv));

  add('[sat3][narbe] Klassenkachel ist ein Nebenprodukt derselben Schleife (outCls), unter dem Bitmap-Schlüssel gecacht',
    /outCls\?: Uint8Array \| null/.test(burnSrc) && /if \(outCls\) outCls\[i\] = unsure \? \(k \+ 1\) \| CLS_UNSURE_FLAG : k \+ 1;/.test(burnSrc)
    && /putCls\(key, cls\)/.test(cogv) && /const _clsTiles = new Map<string, Uint8Array>/.test(cogv));
  add('[sat3][narbe] Saat = Rechtecke der Aufnahmen BIS zum Szenentag; ohne Zeilen der Brandort — und der Satz sagt, welche',
    /d\.det\.filter\(\(q\) => !q\.after\)/.test(cogv) && /seedKind === 'det'/.test(cogv)
    && /keine Detektionen im Umkreis der Szene/.test(cogv));
  add('[sat3][narbe] Schwelle ist SCAR_MIN_CLASS = 2 (dNBR ≥ 0,27) — EINE Stelle, der Satz nennt denselben Wert',
    /export const SCAR_MIN_CLASS = 2/.test(scarSrc) && /floodScar\(grid, gw, gh, seedsFromRects\(rects, gw, gh\), SCAR_MIN_CLASS\)/.test(cogv)
    && (cogv.match(/dNBR ≥ 0,27/g) ?? []).length >= 2);
  add('[sat3][narbe] Hektarzahl nennt Auflösung, Unvollständigkeit und Randberührung im selben Satz; nie das Wort „Brandfläche"',
    /ha bei \$\{Math\.round\(scar\.stepM\)\} m\/px, dNBR ≥ 0,27, unkalibriert/.test(cogv)
    && /Untergrenze/.test(cogv) && /reicht bis an den Rand/.test(cogv)
    && !/Brandfläche/.test(cogv.slice(cogv.indexOf('SAT3d: die Narbe in Zahlen'), cogv.indexOf('SAT3: was die Rechtecke sind'))));
  add('[sat3][narbe] Umriss in Creme (keine dNBR-Klassenfarbe), Legende nennt ihn',
    /const SCAR_COLOR = '#FDFBF4'/.test(cogv) && /Umriss: zusammenhängende Narbe an den Detektionen/.test(cogv)
    && !DNBR_CLASSES.some((c) => `#${c.rgba.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase() === '#FDFBF4'));
  add('[sat3][narbe] Fill-Schlüssel trägt Ebene, Kachelmenge, Ladestand und Saat — Verschieben im selben Satz rechnet nicht neu',
    /const key = `\$\{lv\.postS\.width\}\|\$\{tiles\.map\(\(t\) => t\.idx\)\.join\(','\)\}\|\$\{present\.join\(''\)\}/.test(cogv)
    // SAT3d/§13.4 (3): der Fill läuft in einem EIGENEN Makrotask, nicht im Draw — deshalb prüft
    // die Sonde die Anstoß-Bedingung samt laufendem Auftrag, nicht mehr den früheren Inline-Zweig.
    && /if \(\(!sc \|\| sc\.key !== key\) && scarJobRef\.current\?\.key !== key\)/.test(cogv)
    && /window\.setTimeout\(\(\) => \{[\s\S]{0,200}scarRef\.current = computeScar\(\);[\s\S]{0,80}\}, SCAR_SETTLE_MS\)/.test(cogv)
    && /const SCAR_SETTLE_MS = \d+/.test(cogv)
    && /clearTimeout\(scarJobRef\.current\.id\); scarJobRef\.current = null;/.test(cogv));
  // Goldfall am Hürtgenwald-Narbenpixel (§10.1 (2)): eine 3×3-Kachel, Mitte = Narbe, Rest gesund — Klasse 3, Fläche 0,04 ha bei 20 m.
  {
    const S = { scale: 1e-4, offset: -0.1 };
    const n = 9;
    const preN = new Uint16Array(n).fill(3310), preS = new Uint16Array(n).fill(586);
    const postN = new Uint16Array(n).fill(3017), postS = new Uint16Array(n).fill(725);
    preN[4] = 3105; preS[4] = 542; postN[4] = 2688; postS[4] = 1723;
    const cls = new Uint8Array(n);
    dnbrTileRgba(preN, preS, postN, postS, S, S, null, null, null, cls);
    const r = floodScar(cls, 3, 3, seedsFromRects([{ x0: 1, y0: 1, x1: 1, y1: 1 }], 3, 3), SCAR_MIN_CLASS);
    add('[sat3][narbe] Goldfall: Narbenpixel (dNBR 0,600) wird Klasse 3, Fill zählt genau 1 Pixel, Umriss 4 Kanten',
      cls[4] === 3 && cls[0] === 0 && r.count === 1 && r.seeded === 1 && r.edges.length === 16 && !r.touchesEdge);
    add('[sat3][narbe] Saat auf gesundem Pixel neben der Narbe ⇒ nichts (Diagonale zählt nicht)',
      floodScar(cls, 3, 3, seedsFromRects([{ x0: 0, y0: 0, x1: 0, y1: 0 }], 3, 3), SCAR_MIN_CLASS).count === 0);
    // Neutrebbin-Lehre (§13.4 (2)): dasselbe Narbenpixel unter Wolke (SCL 8 nachher) ist KEINE Narbe mehr.
    const cloudy = new Uint8Array(n);
    const scl = new Uint8Array(n).fill(4); scl[4] = 8;
    dnbrTileRgba(preN, preS, postN, postS, S, S, new Uint8Array(n).fill(4), scl, null, cloudy);
    add('[sat3][narbe] Narbenpixel unter Nachher-Wolke trägt das Flag und wird nicht gefüllt (14 563-ha-Falle)',
      cloudy[4] === (3 | CLS_UNSURE_FLAG)
      && floodScar(cloudy, 3, 3, seedsFromRects([{ x0: 1, y0: 1, x1: 1, y1: 1 }], 3, 3), SCAR_MIN_CLASS).count === 0
      && /nur volldeckende Pixel/.test(cogv) && /function isScar/.test(scarSrc) && /v < CLS_UNSURE_FLAG/.test(scarSrc));
  }
  add('[sat3] CSS: Overlay-Umschalter mobil ≥ 44 px, Rechtecke nicht klickbar (pointer-events: none)', (() => {
    const block = css.slice(css.indexOf('BD2 — Brand-Dossier'));
    const mob = block.slice(block.indexOf('@media (max-width: 767px)'));
    return /\.br-cog-over button, \.br-sat-dettoggle \{ min-height: 44px; \}/.test(mob) && /\.br-sat-det \{[^}]*pointer-events: none/.test(css)
      // §13.4 (4): mobil deckelt der Satz-Block das Bild nicht mehr zu — gescrollt, nie gekürzt.
      && /\.br-cog-inline \.br-cog-notes \{ max-height: 42%; overflow-y: auto;/.test(mob);
  })());
  add('[sat3][narbe] Kill-Switch ?scar=0 im Viewer (Rule 2): Overlay wie vor SAT3, kein Fill — der Kontrolllauf der Messung',
    /get\('scar'\) !== '0'/.test(cogv) && /scarEnabled\(\) \? d\.dnbrLevels\.find/.test(cogv));
  add('[sat3][doku] Audit §13 führt Diagnose, Jans Entscheidung (Narbe an den Detektionen) und V-SAT-20/21',
    /## §13 SAT3/.test(audit) && /V-SAT-20/.test(audit) && /V-SAT-21/.test(audit) && /Zusammenhängende Narbe an den Detektionen/.test(audit));
}

// ---------------------------------------------------------------------------
// BDE (2026-09-05) — Detailansicht erweitert: EFFIS-Fläche, Ausbreitung, Wetterführung
// `audit/brand-detail-erweiterung.md`
// ---------------------------------------------------------------------------
{
  const dossier = readFileSync(join(ROOT, 'src', 'fire', 'FireDossier.tsx'), 'utf8');
  const charts = readFileSync(join(ROOT, 'src', 'fire', 'FireDriverCharts.tsx'), 'utf8');
  const drv = readFileSync(join(ROOT, 'src', 'fire', 'detail', 'fireDrivers.ts'), 'utf8');
  const reg = readFileSync(join(ROOT, 'src', 'fire', 'footprint', 'fireRegistry.ts'), 'utf8');
  const dyn = readFileSync(join(ROOT, 'src', 'fire', 'activity', 'dynamics.ts'), 'utf8');
  const wx = readFileSync(join(ROOT, 'src', 'fire', 'detail', 'fireWeatherAtPoint.ts'), 'utf8');
  const bdeAudit = readFileSync(join(ROOT, 'audit', 'brand-detail-erweiterung.md'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  /** Ohne Block- und Zeilenkommentare — der Modulkopf beschreibt die Regel, er ist nicht ihr Beleg. */
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const drvCode = code(drv);
  const chartsCode = code(charts);

  for (const c of verifyFireDrivers().checks) add(`[bde][treiber] ${c.name}`, c.ok, c.detail);

  // --- A) EFFIS-Fläche ----------------------------------------------------
  const rec = (over) => ({
    sources: { effis: null, effisExtra: 0, cluster: null, zones: [], ems: null },
    areaHa: { value: null, kind: null, source: null, capped: false },
    firstMs: null, lastMs: null, ...over,
  });
  const now = Date.UTC(2026, 8, 5, 12);
  add('[bde][effis] mit Kartierung kein Begründungstext (die Zahlen stehen für sich)',
    mappingGapText(rec({ sources: { effis: { id: 'E1' }, effisExtra: 0 }, areaHa: { value: 40, kind: 'mapped' } }), now) === null);
  const fresh = mappingGapText(rec({ firstMs: now - 6 * 3_600_000, lastMs: now - 6 * 3_600_000 }), now);
  add('[bde][effis] junger Brand: „kein Befund" + der 1–3-Tage-Verzug, KEINE Größenaussage',
    /kein Befund/.test(fresh) && new RegExp(`1–${EFFIS_LAG_DAYS} Tage`).test(fresh) && !/30 ha/.test(fresh), fresh);
  const old = mappingGapText(rec({ firstMs: now - 9 * 86_400_000, lastMs: now - 8 * 86_400_000 }), now);
  add('[bde][effis] älterer Brand ohne Kartierung: die Gründe werden genannt, keiner behauptet',
    /Möglich sind/.test(old) && /wolkenfreie Sentinel-2-Szene/.test(old) && /sagt uns keine Quelle/.test(old), old);
  add('[bde][effis] die WIDERLEGTE Regel „erst ab ~30 ha" steht nirgends als Aussage — nur als benannter Gegenbeleg',
    /an der Größe liegt es nicht/.test(EFFIS_SIZE_EVIDENCE) && /231 davon unter 30 ha/.test(EFFIS_SIZE_EVIDENCE)
    && /Median 5 ha/.test(EFFIS_SIZE_EVIDENCE) && old.includes(EFFIS_SIZE_EVIDENCE));
  add('[bde][effis] der Beleg für die Zahlen steht am Code (audit/waldbrand-effis.md B3)',
    /waldbrand-effis\.md.*B3|Befund B3/.test(reg));
  add('[bde][effis] Detailansicht zeigt Fläche, Branddatum, Stand und die Quelle EFFIS',
    /<dt>Kartierung<\/dt>/.test(panel) && /Branddatum \{fmtDate\(e\.firedateMs\)\}/.test(panel)
    && /Stand \{fmtDate\(e\.lastUpdateMs\)\}/.test(panel) && /effis\.jrc\.ec\.europa\.eu/.test(panel));
  add('[bde][effis] kein leerer Platzhalter: ohne Kartierung UND ohne Grund rendert die Zeile gar nicht',
    /if \(!gap\) return null;/.test(panel));

  // --- B) Ausbreitung -----------------------------------------------------
  add('[bde][ausbreitung] Geschwindigkeit heißt „Verlagerung" und wird nie als Frontgeschwindigkeit ausgegeben',
    /NICHT die Geschwindigkeit der Feuerfront/.test(dyn) && /heißt in der\s+\* Oberfläche „Verlagerung"/.test(dyn)
    && /nicht die Geschwindigkeit der Feuerfront/.test(panel) && !/Ausbreitungsgeschwindigkeit/.test(panel));
  add('[bde][ausbreitung] Weg und Zeit aus DERSELBEN Gewichtung (sonst gehören sie nicht zusammen)',
    /wMs \+= p\.atMs \* p\.sumFrp/.test(dyn) && /Dieselben Gewichte wie beim Schwerpunkt/.test(dyn));
  add('[bde][ausbreitung] Konfidenzzeile nennt Überflüge, Detektionen, Zeitspanne und mittleren Schritt',
    /<dt>Konfidenz der Richtung<\/dt>/.test(panel) && /spreadConfidence\.detections/.test(panel)
    && /spreadConfidence\.spanMs/.test(panel) && /spreadConfidence\.meanStepM/.test(panel));
  add('[bde][ausbreitung] die Konfidenz sagt auch, wenn sie GEGEN die Richtung spricht (Springen)',
    /springt weiter hin und her/.test(panel));
  add('[bde][ausbreitung] „nicht bestimmbar" bleibt die Pflichtaussage bei einer Detektion',
    /keine Richtung bestimmbar/.test(panel));

  // --- C) Wetterführung ---------------------------------------------------
  add('[bde][wetter] das Brandzeitfenster ist EINE Rechnung (24 h davor, 3 h danach) und wird ausgewiesen',
    /WINDOW_PRE_H = 24/.test(wx) && /WINDOW_POST_H = 3/.test(wx) && /windowRange/.test(wx));
  add('[bde][wetter] die Reihe kommt aus DEMSELBEN Abruf wie die Wetterlage (ein Netzaufruf je Brand)',
    (panel.match(/fetchFireWeatherAtPoint\(/g) ?? []).length === 2 && /Sitzungs-Cache je Brand/.test(panel));
  add('[bde][wetter] Einstufung, Regeltext, Windrose, Zeitreihe und Winkeldifferenz stehen im Dossier',
    /<DriversBlock/.test(dossier) && /DRIVER_RULE_TEXT/.test(panel) && /<WindRoseChart/.test(panel)
    && /<DriverSeriesChart/.test(panel) && /Ausbreitung gegen Wind/.test(panel));
  add('[bde][wetter] die Heuristik ist offengelegt: jede Zeile mit Punkten, dazu der Regeltext',
    /br-drv-reasons/.test(panel) && /br-drv-pt/.test(panel) && /Punktsumme/.test(panel));
  add('[bde][wetter] die Einstufung wird nie als Messwert ausgegeben',
    /abgeleitete Einstufung/.test(panel) && /kein Messwert und keine amtliche Aussage/.test(DRIVER_RULE_TEXT));
  add('[bde][wetter] Rose und Ausbreitungspfeil tragen ihre GEGENSÄTZLICHE Konvention im Text',
    /aus der der Wind <b>kommt<\/b>/.test(charts) && /andere Konvention als die Rose/.test(charts));
  add('[bde][wetter] keine vorherrschende Richtung ohne Beständigkeit ≥ STEADY_MIN',
    STEADY_MIN === 0.5 && dominantWind([
      { atMs: 0, tempC: 20, rhPct: 50, windKmh: 10, windFromDeg: 0, gustKmh: null, precipMm: 0 },
      { atMs: 1, tempC: 20, rhPct: 50, windKmh: 10, windFromDeg: 180, gustKmh: null, precipMm: 0 },
    ]).fromDeg === null);

  // --- FWI: was gerechnet wird und was nicht ------------------------------
  add('[bde][fwi] der geprüfte Rechenkern ist zurück (cffdrs-Vektoren) und hat seinen Verifier',
    typeof pkg.scripts['verify:fire-fwi'] === 'string' && /fwi\/fwi/.test(drv));
  add('[bde][fwi] NUR FFMC und ISI — der Gesamt-FWI wird ausdrücklich nicht ausgegeben',
    /NICHT ausgegeben/.test(FIRE_INDEX_NOTE) && !/const .*fwi\b.*=.*fwi\(/.test(drv)
    && /FFMC \/ ISI/.test(panel));
  add('[bde][fwi] GWIS wird verlinkt statt eingerechnet, mit dem Grund (nicht queryable)',
    /gwis\.jrc\.ec\.europa\.eu/.test(panel) && /nur als Bild aus, nicht als Zahl/.test(panel));
  add('[bde][fwi] die ersten Stunden sind Vorlauf und werden als solche beschriftet',
    /noch im Vorlauf der Kette/.test(panel) && /spinup/.test(drv));

  // --- Haus-Regeln --------------------------------------------------------
  add('[bde] die neuen Module sind pur: kein Date.now(), kein fetch, kein DOM',
    !/Date\.now\(/.test(drvCode) && !/fetch\(/.test(drvCode) && !/document\./.test(drvCode));
  add('[bde] keine neue Abhängigkeit für die Charts (SVG von Hand, D-06)',
    !/recharts|chart\.js|d3|@mui/i.test(chartsCode) && Object.keys(pkg.dependencies).length === 7);
  add('[bde] SVG-Texte tragen font-family ausdrücklich (Befund B1)',
    (chartsCode.match(/<text/g) ?? []).length === (chartsCode.match(/fontFamily=\{FONT\}/g) ?? []).length
    && (chartsCode.match(/<text/g) ?? []).length >= 5);
  add('[bde] Chart-Farben nur aus vorhandenen Tokens — keine neue Hex-Farbe im neuen CSS',
    !/#[0-9A-Fa-f]{3,6}/.test(charts) && !/#[0-9A-Fa-f]{3,6}/.test(css.slice(css.indexOf('BDE-C — Wetterführung'))));
  add('[bde] Touch-Targets und Umbruch mobil geregelt (Rose zentriert, Spalten untereinander)',
    /\.br-drv-wind \{ flex-direction: column/.test(css.slice(css.indexOf('BDE-C — Wetterführung'))));
  add('[bde][doku] das Analyse-Dokument führt Jans Entscheidungen und die drei Kollisionen',
    /Phase 1: Analyse/.test(bdeAudit) && /Kollisionen mit dem Ist-Zustand/.test(bdeAudit)
    && /Jans Entscheidungen/.test(bdeAudit));
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
console.log(`\n${checks.length - failed.length}/${checks.length} Prüfungen bestanden.`);
if (failed.length) process.exit(1);
