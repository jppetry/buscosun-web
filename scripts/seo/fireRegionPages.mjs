/**
 * Statische Waldbrand-Seiten nach Region (Phase WBS, `audit/seo-waldbrand.md`):
 *
 *   /waldbrandgefahr/                       Übersicht DE · AT · CH, alle 51 Bundesländer und Kantone
 *   /waldbrandgefahr/<land>/                was amtlich gilt, Feuerwetter heute, Saisonbilanz, Regionen
 *   /waldbrandgefahr/<land>/<region>/       Feuerwetter heute, wer die Stufe festlegt, Saisonbilanz der Region
 *
 * Jede Zahl kommt aus `fireRegions.mjs` (Saison-Index des Brandarchivs). Das Feuerwetter-Bild ist der EU-Index aus dem
 * GWIS-WMS (Copernicus EMS, CC BY 4.0), unverändert, für den Ausschnitt der Region; ein kleines Inline-Skript wählt Tag und
 * Ansicht. Keine amtliche Stufe, kein abgeleiteter Wert (D5/D6). Reines Node-ESM, kein App-Import.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { headBlock, PAGE_CSS, SITE, escapeHtml } from './content.mjs';
import { REGIONS as WEATHER_REGIONS, countryPath as weatherCountryPath } from './regions.mjs';
import {
  fireData, FIRE_BASE, FIRE_COUNTRIES, FIRE_OFFICIAL, MIN_REGION_EVENTS, fireCountryPath,
} from './fireRegions.mjs';

const esc = escapeHtml;
const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const n0 = (v) => nf0.format(v);
const OG = '/og/waldbrandgefahr.png';
const GWIS = 'https://maps.effis.emergency.copernicus.eu/gwis';
const MONTHS = ['März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober'];
const MONTHS_SHORT = ['Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt'];
const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
/** `2026-07-30` → `30. Juli 2026` (ohne Jahr, wenn `noYear`). */
function deDay(iso, noYear = false) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}. ${MONTH_NAMES[m - 1]}${noYear ? '' : ` ${y}`}`;
}
/** Ortsnamen aus GeoNames/VG250 lesbar machen. */
function placeLabel(p) {
  if (!p) return 'ohne Ortsangabe';
  return String(p).replace(/, (?:Stadt|St|Hansestadt)$/, '').replace(/, gemfr\. Bezirk$/, ' (gemeindefreies Gebiet)');
}
const plural = (n, one, many) => `${n0(n)} ${n === 1 ? one : many}`;

// ------------------------------------------------------------------ Feuerwetter-Bild (D5)

const MERC = 20037508.342789244;
const mx = (lon) => (lon * MERC) / 180;
const my = (lat) => (Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)) * MERC) / Math.PI;

/** Ausschnitt in Web-Mercator mit Rand; kleine Regionen (Stadtstaaten) bekommen mindestens 90 km Breite für den Kontext. */
function frameOf(bbox) {
  let [w, s, e, n] = [mx(bbox[0]), my(bbox[1]), mx(bbox[2]), my(bbox[3])];
  const minSpan = 90_000 / Math.cos(((bbox[1] + bbox[3]) / 2) * Math.PI / 180);
  const cx = (w + e) / 2, cy = (s + n) / 2;
  let dx = Math.max(e - w, minSpan) * 1.12, dy = Math.max(n - s, minSpan * 0.6) * 1.12;
  // Seitenverhältnis zwischen 1:1 und 16:10 halten, damit das Bild auf dem Handy nicht zum Streifen wird.
  if (dx / dy > 1.6) dy = dx / 1.6;
  if (dy / dx > 1.0) dx = dy;
  w = cx - dx / 2; e = cx + dx / 2; s = cy - dy / 2; n = cy + dy / 2;
  const W = 800, H = Math.round((W * dy) / dx);
  return { w, s, e, n, W, H };
}

/** Douglas–Peucker in Bildpunkten (Umrisse fürs SVG, nicht für Rechnungen). */
function simplifyPx(pts, tol) {
  if (pts.length <= 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = 1; keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let best = -1, bd = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > bd) { bd = d; best = i; }
    }
    if (best > 0 && bd > tol) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
/** SVG-Pfad der äußeren Ringe im Bildraum (viewBox = W × H des Frames). */
function pathOf(polygons, f) {
  const sx = f.W / (f.e - f.w), sy = f.H / (f.n - f.s);
  const parts = [];
  for (const poly of polygons) {
    const ring = poly[0].map(([lon, lat]) => [(mx(lon) - f.w) * sx, (f.n - my(lat)) * sy]);
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    if (Math.max(...xs) < 0 || Math.min(...xs) > f.W || Math.max(...ys) < 0 || Math.min(...ys) > f.H) continue; // außerhalb des Bildes
    const simple = simplifyPx(ring, 1.2);
    if (simple.length < 3) continue;
    parts.push('M' + simple.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join('L') + 'Z');
  }
  return parts.join('');
}

/**
 * Das Feuerwetter-Bild: GWIS-`GetMap` für den Ausschnitt, darüber die Umrisse. Ohne JavaScript bleibt ein Hinweis mit Link;
 * mit JavaScript setzt das Skript unten Tag (UTC, heute … +8 — der gemessene Horizont, `audit/waldbrand-effis.md` §4.4) und Ansicht.
 */
function fwiFigure({ bbox, label, thin = [], bold = [] }) {
  const f = frameOf(bbox);
  const thinPath = thin.length ? `<path class="t" d="${pathOf(thin, f)}"/>` : '';
  const boldPath = bold.length ? `<path class="b" d="${pathOf(bold, f)}"/>` : '';
  const bboxAttr = [f.w, f.s, f.e, f.n].map((v) => v.toFixed(0)).join(',');
  const days = Array.from({ length: 9 }, (_, d) => `<button type="button" data-d="${d}"${d === 0 ? ' aria-pressed="true"' : ' aria-pressed="false"'}>${d === 0 ? 'Heute' : d === 1 ? 'Morgen' : `+${d}`}</button>`).join('');
  return `<figure class="fwi" data-bbox="${bboxAttr}" data-w="${f.W}" data-h="${f.H}">
        <div class="fwi-stage" style="aspect-ratio:${f.W}/${f.H}">
          <img alt="EU-Feuerwetterindex über ${esc(label)} für den gewählten Tag" width="${f.W}" height="${f.H}" decoding="async" hidden />
          <svg viewBox="0 0 ${f.W} ${f.H}" preserveAspectRatio="none" aria-hidden="true">${thinPath}${boldPath}</svg>
          <p class="fwi-msg">Das Bild lädt mit JavaScript direkt vom EU-Dienst. Ohne JavaScript: <a href="/waldbrand/gefahrenindex">Gefahrenindex im Brandradar öffnen</a>.</p>
        </div>
        <div class="fwi-ctl">
          <div role="group" aria-label="Ansicht"><button type="button" data-l="ecmwf.fwi" aria-pressed="true">Index (FWI)</button><button type="button" data-l="ecmwf.ranking" aria-pressed="false">Einordnung (Perzentil)</button></div>
          <div role="group" aria-label="Tag">${days}</div>
        </div>
        <img class="fwi-legend" alt="Legende des EU-Dienstes zur gewählten Ansicht" loading="lazy" decoding="async" src="${GWIS}?SERVICE=WMS&amp;VERSION=1.3.0&amp;REQUEST=GetLegendGraphic&amp;LAYER=ecmwf.fwi&amp;FORMAT=image/png&amp;SLD_VERSION=1.1.0" />
        <figcaption>Feuerwettergefahr nach dem europäischen Fire Weather Index (FWI) für <span class="fwi-day">heute</span>, 12 UTC, Auflösung rund 8 km — ein Modellwert aus der ECMWF-Vorhersage, <strong>keine amtliche Waldbrandgefahrenstufe</strong>. „Einordnung" zeigt, wie ungewöhnlich der Wert für diesen Ort ist (Perzentil gegen rund 40 Jahre). Klassen des Index: Low &lt; 11,2 · Moderate 11,2–21,3 · High 21,3–38 · Very High 38–50 · Extreme 50–70 · Very Extreme &gt; 70. Bild: © European Union, Copernicus Emergency Management Service — <a href="https://gwis.jrc.ec.europa.eu/" rel="noopener">GWIS</a> (CC BY 4.0), unverändert; Umrisse: Natural Earth.</figcaption>
      </figure>`;
}

/** ES5-Skript, einmal je Seite: Tag (UTC) und Ansicht setzen, Fehler sichtbar machen statt leer zu bleiben. */
const FWI_SCRIPT = `<script>(function(){var W=["So","Mo","Di","Mi","Do","Fr","Sa"];function iso(d){var t=new Date(Date.now()+d*864e5);return t.toISOString().slice(0,10)}
function lab(d){var t=new Date(Date.now()+d*864e5);return W[t.getUTCDay()]+" "+t.getUTCDate()+"."+(t.getUTCMonth()+1)+"."}
var figs=document.querySelectorAll("figure.fwi");for(var i=0;i<figs.length;i++)(function(f){var img=f.querySelector(".fwi-stage img"),msg=f.querySelector(".fwi-msg"),leg=f.querySelector(".fwi-legend"),dayEl=f.querySelector(".fwi-day"),st={d:0,l:"ecmwf.fwi"};
function set(){var u="${GWIS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS="+st.l+"&STYLES=&CRS=EPSG:3857&BBOX="+f.getAttribute("data-bbox")+"&WIDTH="+f.getAttribute("data-w")+"&HEIGHT="+f.getAttribute("data-h")+"&FORMAT=image/png&TRANSPARENT=TRUE&TIME="+iso(st.d);
msg.textContent="Lädt …";msg.hidden=false;img.onload=function(){img.hidden=false;msg.hidden=true};img.onerror=function(){img.hidden=true;msg.hidden=false;msg.textContent="Der EU-Dienst liefert für diesen Tag gerade kein Bild. Im Brandradar steht derselbe Index als Karte."};img.src=u;
leg.src="${GWIS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&LAYER="+st.l+"&FORMAT=image/png&SLD_VERSION=1.1.0";dayEl.textContent=st.d===0?"heute ("+lab(0)+")":lab(st.d);}
var bs=f.querySelectorAll("button");for(var j=0;j<bs.length;j++){var b=bs[j];var dd=b.getAttribute("data-d");if(dd!==null&&dd>1)b.textContent=lab(+dd);b.onclick=function(){var x=this,g=x.parentNode.querySelectorAll("button");for(var k=0;k<g.length;k++)g[k].setAttribute("aria-pressed",g[k]===x?"true":"false");if(x.hasAttribute("data-d"))st.d=+x.getAttribute("data-d");else st.l=x.getAttribute("data-l");set()}}
set()})(figs[i])})()</script>`;

const CSS = `${PAGE_CSS}
.fwi{margin:1.2rem 0;background:#fff;border:1px solid var(--border);border-radius:12px;padding:.6rem}
.fwi-stage{position:relative;width:100%;background:#F3EEDF;border-radius:8px;overflow:hidden}
.fwi-stage img,.fwi-stage svg{position:absolute;inset:0;width:100%;height:100%}
.fwi-stage path{fill:none;vector-effect:non-scaling-stroke;stroke-linejoin:round}.fwi-stage path.t{stroke:#5C5447;stroke-width:.8;opacity:.55}.fwi-stage path.b{stroke:#2C2A26;stroke-width:2}
.fwi-msg{position:absolute;left:.8rem;right:.8rem;bottom:.6rem;margin:0;font-size:.85rem;color:var(--stone);background:rgba(250,246,234,.92);padding:.4rem .6rem;border-radius:8px}
.fwi-ctl{display:flex;flex-direction:column;gap:.4rem;margin:.6rem 0 .3rem}.fwi-ctl div{display:flex;flex-wrap:wrap;gap:.35rem}
.fwi-ctl button{min-height:44px;min-width:44px;padding:.3rem .7rem;border:1px solid var(--border);border-radius:999px;background:var(--sand);color:var(--ink);font:inherit;font-size:.85rem;cursor:pointer}
.fwi-ctl button[aria-pressed="true"]{background:var(--ink);color:#fff;border-color:var(--ink)}
.fwi-legend{display:block;max-width:100%;height:auto;margin:.3rem 0}
figcaption{font-size:.8rem;color:var(--stone)}
.notice{border-left:4px solid var(--terra);background:#fff;padding:.6rem .9rem;border-radius:0 10px 10px 0;margin:1rem 0}
.bars{display:grid;grid-template-columns:repeat(8,1fr);gap:.3rem;align-items:end;height:140px;margin:.8rem 0 .2rem}
.bars span{display:block;background:var(--terra);border-radius:4px 4px 0 0;min-height:2px;position:relative}
.bars span b{position:absolute;top:-1.3em;left:0;right:0;text-align:center;font-size:.72rem;font-weight:600;color:var(--ink)}
.bars-x{display:grid;grid-template-columns:repeat(8,1fr);gap:.3rem;font-size:.72rem;color:var(--stone);text-align:center}
.cards{display:grid;gap:.6rem;grid-template-columns:1fr}@media(min-width:560px){.cards{grid-template-columns:1fr 1fr}}
.card{display:flex;flex-direction:column;gap:.2rem;background:#fff;border:1px solid var(--border);border-radius:12px;padding:.7rem .9rem;text-decoration:none;color:var(--ink)}
.card span{font-size:.85rem;color:var(--stone)}
.cta-row{display:flex;flex-wrap:wrap;gap:.5rem}.cta-row .cta{margin:.3rem 0}
h3{font-size:1rem;margin:1.2rem 0 .2rem}`;

// ------------------------------------------------------------------ Bausteine

function crumbJson(items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE.url + c.path })) };
}

const SOURCES_LINE = 'Satellitendetektionen: NASA FIRMS / LANCE (VIIRS 375 m), gebündelt im Brandarchiv von buscosun · Brandflächen: EFFIS Rapid Damage Assessment (Copernicus EMS) · Feuerwetter: Copernicus EMS GWIS / ECMWF (CC BY 4.0) · Ortsnamen: GeoNames (CC BY 4.0) · Anlagenstandorte: E-PRTR (EEA), Marktstammdatenregister, BFE · Grenzen: Natural Earth (gemeinfrei)';

function pageShell({ title, description, path, crumbs, h1, sub, lead, body, jsonLd, locale }) {
  const head = headBlock({ title, description, canonicalPath: path, locale, ogImage: OG, jsonLd: [...jsonLd, crumbJson(crumbs)] });
  const nav = crumbs.map((c, i) => (i === crumbs.length - 1 ? esc(c.name) : `<a href="${c.path}">${esc(c.name)}</a>`)).join(' › ');
  const D = fireData();
  return `<!doctype html>
<html lang="de">
  <head>
${head}
    <style>${CSS}</style>
  </head>
  <body>
    <main class="wrap">
      <nav class="bc" aria-label="Brotkrumen">${nav}</nav>
      <h1>${esc(h1)}</h1>
      <p class="sub">${sub}</p>
      <p class="lead">${esc(lead)}</p>
      <p class="notice"><strong>Keine amtliche Warnung.</strong> buscosun zeigt Satellitendaten und den EU-Feuerwetterindex. Maßgeblich sind der DWD und die Landesbehörden (DE), Bezirkshauptmannschaften und Länder (AT), die Kantone mit waldbrandgefahr.ch (CH). Bei Feuer: Notruf 112 — in Österreich Feuerwehr 122, in der Schweiz 118.</p>
${body}
      <footer>
        ${esc(SITE.name)} — ${esc(SITE.tagline)}. Quellen dieser Seite: ${esc(SOURCES_LINE)}.
        Stand der Saisonauswertung: ${esc(deDay(D.season.evaluated))}. NASA rät, FIRMS-Daten nicht für taktische Entscheidungen vor Ort zu nutzen; eine Detektion ist keine Einsatzmeldung, kleine Brände fehlen dem Satelliten systematisch.
        Rechenwege: <a href="/methodik/brandradar-detektion-und-brandnarben/">Methodik des Brandradars</a>. Keine Tracker, keine Werbung.
      </footer>
    </main>
    ${FWI_SCRIPT}
  </body>
</html>
`;
}

/** Monatsbalken März–Oktober. */
function barsHtml(months) {
  const max = Math.max(1, ...months);
  const bars = months.map((v, i) => `<span style="height:${Math.max(1.5, (v / max) * 100).toFixed(1)}%" title="${MONTHS[i]}: ${v}"><b>${v || ''}</b></span>`).join('');
  return `<div class="bars" role="img" aria-label="Brandereignisse je Monat: ${months.map((v, i) => `${MONTHS[i]} ${v}`).join(', ')}">${bars}</div>
        <div class="bars-x" aria-hidden="true">${MONTHS_SHORT.map((m) => `<span>${m}</span>`).join('')}</div>`;
}

/** „(Kreis)" hinter dem Ort — nicht, wenn der Kreis nur den Ortsnamen wiederholt (Visp, Visp). */
function districtSuffix(x) {
  const bare = (x.district || '').replace(/^(?:Landkreis|Kreis|Bezirk|Region|Wahlkreis) /, '');
  if (!x.district || bare === placeLabel(x.place)) return '';
  return ` <span class="note">(${esc(x.district)})</span>`;
}

function effisTable(top) {
  if (!top.length) return '';
  const rows = top.map((x) => `<tr><td>bei ${esc(placeLabel(x.place))}${districtSuffix(x)}</td><td>${esc(deDay(x.day, true))}</td><td>${n0(x.ha)} ha</td></tr>`).join('');
  return `<table><thead><tr><th>Brandfläche nahe</th><th>Beginn</th><th>Fläche (EFFIS)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function largestTable(list) {
  if (!list.length) return '';
  const rows = list.map((x) => `<tr><td>bei ${esc(placeLabel(x.place))}${districtSuffix(x)}</td><td>${esc(deDay(x.day, true))}${x.lastDay !== x.day ? ` – ${esc(deDay(x.lastDay, true))}` : ''}</td><td>${n0(x.hotspots)}</td><td>${x.effis ? 'ja' : '—'}</td></tr>`).join('');
  return `<table><thead><tr><th>Ereignis nahe</th><th>Zeitraum</th><th>Detektionen</th><th>EFFIS</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function officialHtml(country, regionOfficial) {
  const o = FIRE_OFFICIAL[country];
  const links = [...(regionOfficial ? [regionOfficial.link] : []), ...o.links].map((l) => `<a href="${l.href}" rel="noopener">${esc(l.label)}</a>`).join(' · ');
  return `<p>${esc(o.who)}</p>
        ${regionOfficial ? `<p>${esc(regionOfficial.text)}</p>` : ''}
        <p>Amtliche Quellen: ${links}.</p>
        <p><strong>${esc(o.emergency)}</strong></p>`;
}

const APP_LINKS = `<div class="cta-row"><a class="cta" href="/waldbrand/gefahrenindex">Gefahrenindex als Karte →</a><a class="cta" href="/waldbrand/aktive-braende">Aktive Brände der letzten 24 h →</a></div>`;

/** Satz über die Saisonzahlen einer Region oder eines Landes (zitierbarer Lead). */
function seasonSentence(inName, st, season) {
  const span = season.closed ? `In der Saison ${season.year} (1. März bis 31. Oktober)` : `In der laufenden Saison ${season.year} (bis ${deDay(season.evaluated)})`;
  if (!st.events) return `${span} haben Satelliten ${inName} kein Brandereignis außerhalb bekannter Anlagen registriert.`;
  let s = `${span} haben Satelliten ${inName} ${plural(st.events, 'Brandereignis', 'Brandereignisse')} außerhalb bekannter Anlagen registriert${st.peakMonth ? `, die meisten im ${st.peakMonth}` : ''}.`;
  const t = st.effis.top[0];
  if (st.effis.n === 1) s += ` Für eines davon hat der EU-Dienst EFFIS eine Brandfläche kartiert: ${n0(t.ha)} Hektar bei ${placeLabel(t.place)} ab dem ${deDay(t.day, true)}.`;
  else if (st.effis.n > 1) s += ` Für ${n0(st.effis.n)} davon hat der EU-Dienst EFFIS Brandflächen kartiert, zusammen rund ${n0(st.effis.ha)} Hektar; die größte lag bei ${placeLabel(t.place)} (${n0(t.ha)} ha ab dem ${deDay(t.day, true)}).`;
  else s += ' Eine von EFFIS kartierte Brandfläche gab es dort in dieser Saison nicht.';
  return s;
}

/** Halbsatz zur amtlichen Stufe je Land (Lead der Regionsseite). */
const OFFICIAL_CLAUSE = {
  DE: 'Die amtliche Einschätzung kommt vom DWD und den Landesbehörden, die geltenden Regeln legen Land und Kreise fest',
  AT: 'Eine offene amtliche Waldbrandstufe gibt es in Österreich nicht, Waldbrandverordnungen erlassen die Bezirkshauptmannschaften',
  CH: 'Die amtliche Waldbrandgefahrenstufe legt der Kanton fest',
};

function seasonSection(inName, st, season, { sites = true } = {}) {
  const singlesShare = st.events ? Math.round((st.singles / st.events) * 100) : 0;
  const parts = [];
  if (st.events) parts.push(`<p class="note">Brandereignisse ${esc(inName)} je Monat ihres Beginns, ${season.year}:</p>\n        ${barsHtml(st.months)}`);
  else parts.push(`<p>${esc(seasonSentence(inName, st, season))}</p>`);
  const facts = [];
  if (st.events) facts.push(`<li><strong>${n0(st.singles)} von ${n0(st.events)}</strong> Ereignissen (${singlesShare} %) bestehen aus einer einzigen Detektion. Ob Wald, Feld oder Grasfläche gebrannt hat, sagt die Detektion allein nicht; als bestätigt gilt ein Brand hier nur mit EFFIS-Kartierung.</li>`);
  if (sites && st.sites) facts.push(`<li><strong>Nicht mitgezählt:</strong> ${plural(st.sites, 'Ereignis', 'Ereignisse')} auf bekannten Anlagenstandorten (Stahl- und Zementwerke, Kraftwerke, Raffinerien), die der Satellit dauerhaft warm sieht.</li>`);
  if (st.nrt) facts.push(`<li>${plural(st.nrt, 'Ereignis trägt', 'Ereignisse tragen')} noch Echtzeit-Detektionen; die nachträgliche Standardverarbeitung kann sie verschieben oder streichen.</li>`);
  if (st.districts.length) facts.push(`<li><strong>Schwerpunkte nach ${st.districtWord}</strong> (${st.districtWord} des nächstgelegenen Orts): ${st.districts.map(([d, n]) => `${esc(d)} ${n0(n)}`).join(' · ')}.</li>`);
  if (facts.length) parts.push(`<ul class="facts">\n          ${facts.join('\n          ')}\n        </ul>`);
  if (st.effis.n) parts.push(`<h3>Von EFFIS kartierte Brandflächen</h3>\n        ${effisTable(st.effis.top)}${st.effis.n > st.effis.top.length ? `\n        <p class="note">Die ${st.effis.top.length} größten von ${st.effis.n}. Die Fläche stammt aus der Schnellkartierung des EU-Dienstes und kann sich ändern.</p>` : ''}`);
  if (st.largest.length) parts.push(`<h3>Ereignisse mit den meisten Detektionen</h3>\n        ${largestTable(st.largest)}\n        <p class="note">Viele Detektionen heißen viele Überflüge mit Wärmesignal — ein Maß für Dauer und Ausdehnung, keine Flächenangabe. Ortsangabe: nächstgelegener Ort laut GeoNames.</p>`);
  return parts.join('\n        ');
}

function regionTable(regions) {
  const rows = regions.map((r) => `<tr><td>${r.hasPage ? `<a href="${r.path}">${esc(r.name)}</a>` : esc(r.name)}</td><td>${n0(r.stats.events)}</td><td>${r.stats.effis.n ? `${n0(r.stats.effis.n)} · ${n0(r.stats.effis.ha)} ha` : '—'}</td><td>${n0(r.stats.sites)}</td></tr>`).join('');
  return `<table><thead><tr><th>Region</th><th>Brandereignisse</th><th>EFFIS-kartiert</th><th>Anlagen (nicht gezählt)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function seriesTable(series, season) {
  if (!series.length) return '';
  const rows = series.map((s) => `<tr><td>${s.year}${s.complete ? '' : season.closed ? '' : ' (läuft)'}</td><td>${n0(s.total)}</td></tr>`).join('');
  return `<table><thead><tr><th>Saison</th><th>Brandereignisse (1.3.–31.10.)</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="note">Gleiche Zählregel für alle Jahre (Saisonkurve der App, Ereignisse ohne Anlagen). Vorbehalt: Sensorlaufzeiten und Verarbeitung unterscheiden sich zwischen den Jahren; die Reihe ist zu kurz für ein Klimamittel. Die Zahl im Text oben stammt aus dem Saison-Index und kann um wenige Ereignisse abweichen.</p>`;
}

// ------------------------------------------------------------------ Seiten

function regionPage(r) {
  const D = fireData(), season = D.season, c = FIRE_COUNTRIES[r.country], C = D.countries[r.country];
  const st = r.stats;
  const lead = `${seasonSentence(r.inName, st, season)} ${OFFICIAL_CLAUSE[r.country]}; die Karte unten zeigt die Feuerwettergefahr nach dem EU-Index für heute und die nächsten acht Tage.`;
  const neighbours = C.regions.filter((x) => x !== r && x.hasPage);
  const crumbs = [{ name: 'Start', path: '/' }, { name: 'Waldbrandgefahr', path: FIRE_BASE }, { name: c.name, path: C.path }, { name: r.name, path: r.path }];
  const effisPart = st.effis.n ? `${st.effis.n} kartierte Brandfläche${st.effis.n === 1 ? '' : 'n'} (${n0(st.effis.ha)} ha)` : 'keine EFFIS-Kartierung';
  const description = `Waldbrandgefahr ${r.inName}: EU-Feuerwetterindex heute bis +8 Tage, wer die amtliche Stufe festlegt, Saison ${season.year}: ${n0(st.events)} Brandereignisse, ${effisPart}.`;
  // Wetter-Regionsseiten gibt es erst ab drei Orten (regions.mjs); sonst führt der Link auf die Länderseite.
  const wx = WEATHER_REGIONS.find((x) => x.country === r.country && x.name === r.name && x.hasPage);
  const weatherLink = wx ? `<a href="${wx.path}">Wetter ${esc(r.inName)}</a>` : `<a href="${weatherCountryPath(r.country)}">Wetter ${esc(C.inName)}</a>`;
  const body = `
      <section>
        <h2>Feuerwetter heute ${esc(r.inName)}</h2>
        ${fwiFigure({ bbox: r.bbox, label: r.name, thin: C.polygons.filter((p) => !r.polygons.includes(p)), bold: r.polygons })}
        ${APP_LINKS}
      </section>

      <section>
        <h2>Wer ${esc(r.inName)} die Waldbrandgefahr festlegt</h2>
        ${officialHtml(r.country, r.official)}
      </section>

      <section>
        <h2>Brände ${esc(r.inName)}: Saison ${season.year}</h2>
        ${seasonSection(r.inName, st, season)}
        <p class="note">Zuordnung zum ${esc(c.regionWord)} über vereinfachte Grenzen (Natural Earth, rund 1 km genau); Ereignisse direkt an der Grenze können beim Nachbarn stehen. Vergleich mit den übrigen ${esc(c.regionsDat)}: <a href="${C.path}">Waldbrandgefahr ${esc(c.name)}</a>.</p>
      </section>

      <section>
        <h2>Häufige Fragen</h2>
        <h3>Wie hoch ist die Waldbrandgefahr ${esc(r.inName)} heute?</h3>
        <p>Die amtliche Einschätzung kommt ${r.country === 'CH' ? 'vom Kanton, gesammelt auf waldbrandgefahr.ch' : r.country === 'AT' ? 'von den Bezirkshauptmannschaften und dem Land' : r.official ? 'von der zuständigen Landesstelle (Link oben) und dem DWD' : 'vom DWD (Waldbrandgefahrenindex) und den Landesbehörden'}. Das Bild oben zeigt dazu die Feuerwettergefahr nach dem EU-Index für heute und die kommenden Tage; es ersetzt die amtliche Stufe nicht.</p>
        <h3>Wo hat es ${esc(r.inName)} ${season.year} gebrannt?</h3>
        <p>${st.effis.n ? `Die größten von EFFIS kartierten Brandflächen stehen in der Tabelle oben, angeführt von ${esc(placeLabel(st.effis.top[0].place))} (${n0(st.effis.top[0].ha)} ha).` : 'EFFIS hat in dieser Saison keine Brandfläche kartiert.'} Alle ${n0(st.events)} Satelliten-Ereignisse mit Ort, Zeitraum und Wetterlage zeigt die <a href="/waldbrand/historie">Waldbrand-Historie</a> im Brandradar.</p>
        <h3>Was tun bei einem Waldbrand?</h3>
        <p>${esc(FIRE_OFFICIAL[r.country].emergency)} Den Standort möglichst genau angeben, den Bereich zügig über breite Wege verlassen, Zufahrten frei halten und den Anweisungen der Einsatzkräfte folgen.</p>
      </section>

      <section>
        <h2>Weitere ${esc(c.regionsWord)}</h2>
        <div class="links">${neighbours.map((x) => `<a href="${x.path}">${esc(x.name)}</a>`).join('\n        ')}</div>
        <p class="note"><a href="${C.path}">Waldbrandgefahr ${esc(c.name)}</a> · <a href="${FIRE_BASE}">Alle Länder und Regionen</a> · ${weatherLink} · <a href="/wissen/waldbrandwarnstufen-de-at-ch/">Waldbrandstufen in DE, AT und CH erklärt</a> · <a href="/wissen/fire-weather-index/">Fire Weather Index erklärt</a></p>
      </section>`;
  const url = SITE.url + r.path;
  return pageShell({
    title: `Waldbrandgefahr ${r.name}: Karte heute & Brandbilanz ${season.year} | ${SITE.name}`,
    description, path: r.path, crumbs, locale: c.locale,
    h1: `Waldbrandgefahr ${r.inName}`,
    sub: `${c.flag} ${esc(c.regionWord)} · ${esc(c.name)} · Saison ${season.year}: ${n0(st.events)} Brandereignisse · Feuerwetter täglich neu`,
    lead, body,
    jsonLd: [{
      '@context': 'https://schema.org', '@type': 'WebPage', name: `Waldbrandgefahr ${r.inName}`, url, description, inLanguage: 'de',
      dateModified: season.generatedAt,
      about: { '@type': 'AdministrativeArea', name: r.name, ...(r.wikidata ? { sameAs: `https://www.wikidata.org/wiki/${r.wikidata}` } : {}), containedInPlace: { '@type': 'Country', name: c.name } },
      isBasedOn: ['https://firms.modaps.eosdis.nasa.gov/', 'https://forest-fire.emergency.copernicus.eu/', 'https://gwis.jrc.ec.europa.eu/'],
      publisher: { '@type': 'Organization', name: SITE.name },
    }],
  });
}

function countryPage(code) {
  const D = fireData(), season = D.season, C = D.countries[code];
  const st = C.stats;
  const withPage = C.regions.filter((r) => r.hasPage);
  const prevComplete = C.series.filter((s) => s.complete && s.year < season.year);
  const cur = C.series.find((s) => s.year === season.year);
  const maxPrev = prevComplete.reduce((m, s) => (s.total > (m?.total ?? -1) ? s : m), null);
  let compare = '';
  if (cur && maxPrev) {
    compare = cur.total > maxPrev.total
      ? ` Das sind mehr als in jeder vollständigen Saison seit ${prevComplete[0].year}; der bisher höchste Wert lag ${maxPrev.year} bei ${n0(maxPrev.total)}.`
      : ` Der höchste Wert der vollständigen Saisons seit ${prevComplete[0].year} lag ${maxPrev.year} bei ${n0(maxPrev.total)}.`;
  }
  const top = C.regions.filter((r) => r.stats.events > 0).slice(0, 3);
  const lead = `${seasonSentence(C.inName, st, season)}${compare} Am häufigsten registriert: ${top.map((r) => `${r.name} (${n0(r.stats.events)})`).join(', ')}.`;
  const crumbs = [{ name: 'Start', path: '/' }, { name: 'Waldbrandgefahr', path: FIRE_BASE }, { name: C.name, path: C.path }];
  const description = `Waldbrandgefahr ${C.inName}: wer die amtliche Stufe festlegt, EU-Feuerwetterindex heute bis +8 Tage und die Saison ${season.year} nach ${C.regionWord}: ${n0(st.events)} Brandereignisse, ${n0(st.effis.n)} kartierte Brandflächen.`;
  const cards = withPage.map((r) => `<a class="card" href="${r.path}"><strong>${esc(r.name)}</strong><span>${n0(r.stats.events)} Brandereignisse${r.stats.effis.n ? ` · ${n0(r.stats.effis.n)} kartiert (${n0(r.stats.effis.ha)} ha)` : ''}</span></a>`).join('\n          ');
  const small = C.regions.filter((r) => !r.hasPage);
  const body = `
      <section>
        <h2>Feuerwetter heute ${esc(C.inName)}</h2>
        ${fwiFigure({ bbox: C.bbox, label: C.name, thin: C.polygons, bold: [] })}
        ${APP_LINKS}
      </section>

      <section>
        <h2>Wer ${esc(C.inName)} die Waldbrandgefahr festlegt</h2>
        ${officialHtml(code, null)}
        ${C.regions.filter((r) => r.official).map((r) => `<p><strong>${esc(r.name)}:</strong> ${esc(r.official.text)} <a href="${r.official.link.href}" rel="noopener">${esc(r.official.link.label)}</a></p>`).join('\n        ')}
      </section>

      <section>
        <h2>${esc(C.regionsWord)} mit eigener Seite</h2>
        <div class="cards">
          ${cards}
        </div>
        ${small.length ? `<p class="note">Ohne eigene Seite (weniger als ${MIN_REGION_EVENTS} Ereignisse und keine EFFIS-Kartierung): ${small.map((r) => `${esc(r.name)} ${n0(r.stats.events)}`).join(' · ')}.</p>` : ''}
      </section>

      <section>
        <h2>Brände ${esc(C.inName)}: Saison ${season.year}</h2>
        ${seasonSection(C.inName, st, season)}
        <h3>Alle ${esc(C.regionsWord)} im Vergleich</h3>
        ${regionTable(C.regions)}
        <h3>Saisons seit ${C.series[0]?.year ?? season.year}</h3>
        ${seriesTable(C.series, season)}
      </section>

      <section>
        <h2>Weiter</h2>
        <p class="note">${Object.keys(FIRE_COUNTRIES).filter((k) => k !== code).map((k) => `<a href="${fireCountryPath(k)}">Waldbrandgefahr ${esc(FIRE_COUNTRIES[k].name)}</a>`).join(' · ')} · <a href="${FIRE_BASE}">Übersicht DE · AT · CH</a> · <a href="/waldbrand">Brandradar</a> · <a href="/wissen/waldbrandwarnstufen-de-at-ch/">Waldbrandstufen erklärt</a></p>
      </section>`;
  const url = SITE.url + C.path;
  return pageShell({
    title: `Waldbrandgefahr ${C.name}: Karte, Stufen & Brandbilanz ${season.year} | ${SITE.name}`,
    description, path: C.path, crumbs, locale: C.locale,
    h1: `Waldbrandgefahr ${C.inName}`,
    sub: `${C.flag} ${C.regions.length} ${esc(C.regionsWord)} · Saison ${season.year}: ${n0(st.events)} Brandereignisse · Feuerwetter täglich neu`,
    lead, body,
    jsonLd: [{
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: `Waldbrandgefahr ${C.inName}`, url, description, inLanguage: 'de', dateModified: season.generatedAt,
      about: { '@type': 'Country', name: C.name },
      mainEntity: { '@type': 'ItemList', numberOfItems: withPage.length, itemListElement: withPage.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE.url + r.path, name: `Waldbrandgefahr ${r.name}` })) },
    }],
  });
}

function hubPage() {
  const D = fireData(), season = D.season;
  const all = Object.values(D.countries);
  const total = all.reduce((s, C) => s + C.stats.events, 0);
  const effisN = all.reduce((s, C) => s + C.stats.effis.n, 0);
  const effisHa = all.reduce((s, C) => s + C.stats.effis.ha, 0);
  const lead = `${season.closed ? `In der Saison ${season.year}` : `In der laufenden Saison ${season.year}`} haben Satelliten in Deutschland, Österreich und der Schweiz ${n0(total)} Brandereignisse außerhalb bekannter Anlagen registriert, ${n0(effisN)} davon mit einer von EFFIS kartierten Brandfläche (zusammen rund ${n0(effisHa)} Hektar). Diese Übersicht ordnet sie den 51 Bundesländern und Kantonen zu, nennt je Land, wer die amtliche Waldbrandgefahr festlegt, und zeigt die Feuerwettergefahr nach dem EU-Index für heute und die nächsten acht Tage.`;
  const crumbs = [{ name: 'Start', path: '/' }, { name: 'Waldbrandgefahr', path: FIRE_BASE }];
  const description = `Waldbrandgefahr nach Bundesland und Kanton: EU-Feuerwetterindex heute bis +8 Tage, amtliche Stellen je Land, Saison ${season.year} aus Satellitendaten für DE, AT und CH.`;
  const dachPolys = all.flatMap((C) => C.polygons);
  const countryBlocks = all.map((C) => `<section>
        <h2>${C.flag} <a href="${C.path}">Waldbrandgefahr ${esc(C.name)}</a></h2>
        <p>${esc(FIRE_OFFICIAL[C.code].who)}</p>
        ${regionTable(C.regions)}
      </section>`).join('\n\n      ');
  const body = `
      <section>
        <h2>Feuerwetter heute in Deutschland, Österreich und der Schweiz</h2>
        ${fwiFigure({ bbox: [5.8, 45.75, 17.2, 55.1], label: 'Deutschland, Österreich und der Schweiz', thin: dachPolys, bold: [] })}
        ${APP_LINKS}
      </section>

      ${countryBlocks}

      <section>
        <h2>Saisons seit ${D.dachSeries[0]?.year ?? season.year} im DACH-Raum</h2>
        ${seriesTable(D.dachSeries, season)}
      </section>

      <section>
        <h2>So entstehen die Zahlen</h2>
        <p>Grundlage ist das Brandarchiv von buscosun: Wärmepunkte des VIIRS-Sensors aus dem NASA-System FIRMS, gebündelt zu Ereignissen, wenn sie näher als zwei Kilometer beieinander liegen und höchstens 48 Stunden auseinander. Standorte, an denen der Satellit dauerhaft Wärme sieht — Stahl- und Zementwerke, Kraftwerke, Raffinerien —, zählen nicht mit. Ein Ereignis ist eine Satellitenmessung, keine Einsatzmeldung der Feuerwehr: Kleine Brände fehlen systematisch, Felder und Grasflächen zählen mit, und bestätigt ist ein Brand hier nur, wenn der EU-Dienst EFFIS eine Fläche kartiert hat. Die Zuordnung zu Bundesland oder Kanton nutzt vereinfachte Grenzen.</p>
        <p class="note">Mehr dazu: <a href="/methodik/brandradar-detektion-und-brandnarben/">Methodik des Brandradars</a> · <a href="/waldbrand/thermalanomalien">Thermalanomalien: Anlagen statt Brände</a> · <a href="/wissen/waldbrandwarnstufen-de-at-ch/">Waldbrandstufen in DE, AT und CH</a> · <a href="/wissen/fire-weather-index/">Fire Weather Index</a></p>
      </section>`;
  return pageShell({
    title: `Waldbrandgefahr nach Bundesland & Kanton: Karte & Bilanz ${season.year} | ${SITE.name}`,
    description, path: FIRE_BASE, crumbs, locale: 'de-DE',
    h1: 'Waldbrandgefahr nach Bundesland und Kanton',
    sub: `🇩🇪 🇦🇹 🇨🇭 51 Regionen · Saison ${season.year}: ${n0(total)} Brandereignisse · Feuerwetter täglich neu`,
    lead, body,
    jsonLd: [{
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Waldbrandgefahr nach Bundesland und Kanton', url: SITE.url + FIRE_BASE, description, inLanguage: 'de', dateModified: season.generatedAt,
      mainEntity: { '@type': 'ItemList', numberOfItems: all.length, itemListElement: all.map((C, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE.url + C.path, name: `Waldbrandgefahr ${C.name}` })) },
    }],
  });
}

// ------------------------------------------------------------------ Export für generate-seo.mjs

/** Alle Seiten als [Pfad, HTML]; leer ohne Saison-Index (dann fällt nur dieser Teil weg). */
export function fireRegionPages() {
  const D = fireData();
  if (!D) return [];
  const out = [[FIRE_BASE, hubPage()]];
  for (const code of Object.keys(FIRE_COUNTRIES)) {
    out.push([fireCountryPath(code), countryPage(code)]);
    for (const r of D.countries[code].regions) if (r.hasPage) out.push([r.path, regionPage(r)]);
  }
  return out;
}

/** Schreibt die Seiten nach `dist/`; gibt die Pfade zurück (für Sitemap, Verifier, Konsole). */
export function writeFireRegionPages(dist) {
  const pages = fireRegionPages();
  for (const [path, html] of pages) {
    const dir = join(dist, ...path.split('/').filter(Boolean));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html, 'utf8');
  }
  return pages.map(([p]) => p);
}

/** Abschnitt für `llms.txt` (absolute Links, wie der Verifier verlangt). */
export function fireRegionsLlms(siteUrl) {
  const D = fireData();
  if (!D) return '';
  const regs = D.regions.filter((r) => r.hasPage).map((r) => r.name).join(', ');
  return `- [Waldbrandgefahr nach Bundesland und Kanton](${siteUrl}${FIRE_BASE}): je Land, wer die amtliche Stufe festlegt, das Bild des EU-Feuerwetterindex für heute bis +8 Tage
  und die Saison ${D.season.year} aus Satellitendaten (Brandereignisse ohne Anlagen, EFFIS-kartierte Brandflächen). Länder: ${Object.keys(FIRE_COUNTRIES).map((k) => `${siteUrl}${fireCountryPath(k)}`).join(', ')};
  eigene Seiten für ${regs}. Keine amtliche Warnung.
`;
}
