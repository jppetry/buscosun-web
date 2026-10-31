/**
 * Länder- und Regionsseiten der Ortsseiten (Phase 3): /wetter/<land>/ und /wetter/<land>/<region>/.
 * Kennzahlen kommen aus den Ortsdaten (`regions.mjs` → `placeContent.mjs`); keine Seite ist eine reine Linkliste.
 */
import { headBlock, PAGE_CSS, SITE, escapeHtml, faqJsonLd } from './content.mjs';
import { COUNTRIES, REGIONS, regionsOf, countryPath, statsOf, MIN_REGION_PLACES } from './regions.mjs';
import { climateSourceLabel } from './placeContent.mjs';

const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n0 = (v) => nf0.format(v), n1 = (v) => nf1.format(v);
const esc = escapeHtml;
const link = (p) => `<a href="/wetter/${p.slug}/">${esc(p.name)}</a>`;

const CSS = `${PAGE_CSS}
table{font-size:.84rem}td:first-child,th:first-child{text-align:left}td+td,th+th{text-align:right}
.cards{display:grid;gap:.6rem;grid-template-columns:1fr}@media(min-width:560px){.cards{grid-template-columns:1fr 1fr}}
.card{display:flex;flex-direction:column;gap:.2rem;background:#fff;border:1px solid var(--border);border-radius:12px;padding:.7rem .9rem;text-decoration:none;color:var(--ink)}
.card span{font-size:.85rem;color:var(--stone)}`;

function sourcesLine(places, extra = []) {
  const labels = new Set(places.map((p) => climateSourceLabel(p)));
  labels.add('Gelände: Terrarium-Höhenkacheln (Mapzen/AWS Terrain Tiles)');
  labels.add('Ortsliste: GeoNames (CC BY 4.0)');
  for (const e of extra) labels.add(e);
  return [...labels].join(' · ');
}

function crumbJson(items) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE.url + c.path })),
  };
}

function pageShell({ title, description, path, crumbs, h1, sub, lead, body, sources, jsonLd, faqs }) {
  const head = headBlock({
    title, description, canonicalPath: path, locale: 'de-DE', ogImage: '/og/wetter-default.png',
    jsonLd: [...jsonLd, crumbJson(crumbs), ...(faqs?.length ? [faqJsonLd(faqs)] : [])],
  });
  const nav = crumbs.map((c, i) => (i === crumbs.length - 1 ? esc(c.name) : `<a href="${c.path}">${esc(c.name)}</a>`)).join(' › ');
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
${body}
      <footer>
        ${esc(SITE.name)} — ${esc(SITE.tagline)}. Quellen dieser Seite: ${esc(sources)}. Keine Tracker, keine Werbung.
        Hinweis: Die Werte sind Klimanormale 1991–2020 für die genannten Orte, keine Vorhersage; Rechenwege: <a href="/methodik/ortsseiten/">Methodik der Ortsseiten</a>. buscosun gibt keine amtlichen Warnungen heraus.
      </footer>
    </main>
  </body>
</html>
`;
}

/** Zeilen der Vergleichstabelle (Orte einer Region). */
function placeTable(st, raster) {
  const head = raster
    ? '<tr><th>Ort</th><th>Höhe</th><th>Jahresmittel</th><th>Ø Max. Juli</th><th>Ø Min. Januar</th><th>Niederschlag</th><th>Sonnenschein</th><th>Frosttage</th></tr>'
    : '<tr><th>Ort</th><th>Höhe</th><th>Jahresmittel</th><th>Ø Max. Juli</th><th>Ø Min. Januar</th></tr>';
  const body = st.rows.map((r) => `<tr><td>${link(r.p)}</td><td>${n0(r.ele)} m</td><td>${n1(r.mean)} °C</td><td>${n1(r.tmaxJul)} °C</td><td>${n1(r.tminJan)} °C</td>` +
    (raster ? (r.rr != null ? `<td>${n0(r.rr)} mm</td><td>${n0(r.sun)} h</td><td>${n0(Math.round(r.frost))}</td>` : '<td>—</td><td>—</td><td>—</td>') : '') + '</tr>').join('');
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function lageSentence(st, name) {
  const w = [['tal', 'in Tal- oder Beckenlage'], ['hang', 'in Hanglage'], ['hoehe', 'in Höhen- oder Kuppenlage'], ['eben', 'im flachen Gelände']]
    .filter(([k]) => st.lage[k] > 0).map(([k, t]) => `${st.lage[k]} ${t}`);
  return `Von den ${st.n} Orten in ${name} liegen ${w.join(', ')}.`;
}

/** Regionsseite (Bundesland, Kanton). */
export function renderRegionPage(region) {
  const c = COUNTRIES[region.country];
  const st = statsOf(region.places);
  const raster = st.rasterN > 0;
  const R = region.name;
  let lead = `In ${R} liegen ${st.n} Orte von ${st.lowest.p.name} (${n0(st.lowest.ele)} m) bis ${st.highest.p.name} (${n0(st.highest.ele)} m). ` +
    `Im Mittel der Jahre 1991 bis 2020 ist es in ${st.warmest.p.name} mit ${n1(st.warmest.mean)} °C Jahresmitteltemperatur am wärmsten und in ${st.coldest.p.name} mit ${n1(st.coldest.mean)} °C am kältesten.`;
  if (raster && st.wettest && st.wettest.p !== st.driest.p) lead += ` Am meisten Niederschlag fällt in ${st.wettest.p.name} (${n0(st.wettest.rr)} mm im Jahr), am wenigsten in ${st.driest.p.name} (${n0(st.driest.rr)} mm); die meisten Sonnenstunden hat ${st.sunniest.p.name} (${n0(st.sunniest.sun)} h).`;
  const facts = [
    `<strong>Höhenlage:</strong> ${esc(st.lowest.p.name)} liegt mit ${n0(st.lowest.ele)} m am tiefsten, ${esc(st.highest.p.name)} mit ${n0(st.highest.ele)} m am höchsten — ein Unterschied von ${n0(st.highest.ele - st.lowest.ele)} m.`,
    `<strong>Temperatur:</strong> Das Jahresmittel reicht von ${n1(st.coldest.mean)} °C (${esc(st.coldest.p.name)}) bis ${n1(st.warmest.mean)} °C (${esc(st.warmest.p.name)}).`,
  ];
  if (raster && st.wettest && st.wettest.p !== st.driest.p) {
    facts.push(`<strong>Niederschlag:</strong> ${n0(st.driest.rr)} mm (${esc(st.driest.p.name)}) bis ${n0(st.wettest.rr)} mm (${esc(st.wettest.p.name)}) im Jahr.`);
    facts.push(`<strong>Sonnenschein:</strong> ${n0(st.dullest.sun)} h (${esc(st.dullest.p.name)}) bis ${n0(st.sunniest.sun)} h (${esc(st.sunniest.p.name)}) im Jahr.`);
    facts.push(`<strong>Frosttage:</strong> ${n0(Math.round(st.leastFrost.frost))} (${esc(st.leastFrost.p.name)}) bis ${n0(Math.round(st.mostFrost.frost))} (${esc(st.mostFrost.p.name)}) pro Jahr.`);
  }
  if (st.lakes.length) facts.push(`<strong>Am See:</strong> ${st.lakes.map((r) => `${link(r.p)} (${esc(r.lake.name)})`).join(', ')}.`);
  const others = regionsOf(region.country).filter((r) => r !== region && r.hasPage);
  const faqs = [
    { q: `Welcher Ort in ${R} ist am wärmsten?`, a: `Unter den ${st.n} Orten dieser Seite ${st.warmest.p.name}: Das Jahresmittel liegt bei ${n1(st.warmest.mean)} °C (Mittel 1991–2020). Am kältesten ist es in ${st.coldest.p.name} mit ${n1(st.coldest.mean)} °C.` },
    { q: `Welcher Ort in ${R} liegt am höchsten?`, a: `${st.highest.p.name} mit ${n0(st.highest.ele)} m; am tiefsten liegt ${st.lowest.p.name} mit ${n0(st.lowest.ele)} m.` },
  ];
  if (raster && st.wettest && st.wettest.p !== st.driest.p) faqs.push({ q: `Wo regnet es in ${R} am meisten?`, a: `Unter den Orten mit Rasterdaten in ${st.wettest.p.name}: ${n0(st.wettest.rr)} mm Niederschlag im Jahr (1991–2020). Am wenigsten fällt in ${st.driest.p.name} mit ${n0(st.driest.rr)} mm.` });
  const crumbs = [{ name: 'Start', path: '/' }, { name: 'Wetter', path: '/wetter/' }, { name: c.name, path: countryPath(region.country) }, { name: R, path: region.path }];
  const url = SITE.url + region.path;
  const faqHtml = faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n      ');
  const body = `      <section>
        <h2>Orte in ${esc(R)} im Vergleich</h2>
        ${placeTable(st, raster)}
        <p class="note">Klimanormale 1991–2020 je Ort; Jahresmittel aus den Monatsmaxima und -minima. Ein Klick führt zur Ortsseite mit Monatswerten, Sonnenzeiten und Lage im Gelände.</p>
      </section>

      <section>
        <h2>${esc(R)} in Zahlen</h2>
        <p>${esc(lageSentence(st, R))}</p>
        <ul class="facts">
          ${facts.map((f) => `<li>${f}</li>`).join('\n          ')}
        </ul>
      </section>

      <section>
        <h2>Häufige Fragen zu ${esc(R)}</h2>
        ${faqHtml}
      </section>

      <section>
        <h2>Weitere ${c.regions} in ${esc(c.name)}</h2>
        <div class="links">${others.map((r) => `<a href="${r.path}">${esc(r.name)} <span>(${r.places.length})</span></a>`).join('\n        ')}</div>
        <p class="note"><a href="${countryPath(region.country)}">Alle ${c.regions} in ${esc(c.name)}</a> · <a href="/wetter/">Wetter nach Ort</a></p>
      </section>`;
  const description = lead.length <= 158 ? lead : `${R}: ${st.n} Orte von ${n0(st.lowest.ele)} bis ${n0(st.highest.ele)} m, Jahresmittel ${n1(st.coldest.mean)} bis ${n1(st.warmest.mean)} °C — Klima 1991–2020 im Vergleich.`;
  return pageShell({
    title: `Wetter in ${R} — ${st.n} Orte im Vergleich | ${SITE.name}`, description, path: region.path, crumbs,
    h1: `Wetter in ${R}`, sub: `${c.flag} ${esc(c.name)} · ${st.n} Orte · ${n0(st.lowest.ele)}–${n0(st.highest.ele)} m`, lead, body,
    sources: sourcesLine(region.places, st.lakes.length ? ['Seen: Natural Earth (gemeinfrei)'] : []),
    faqs,
    jsonLd: [{
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: `Wetter in ${R}`, url, description, inLanguage: 'de',
      about: { '@type': 'AdministrativeArea', name: R, containedInPlace: { '@type': 'Country', name: c.name } },
      mainEntity: { '@type': 'ItemList', numberOfItems: st.n, itemListElement: st.rows.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE.url}/wetter/${r.p.slug}/`, name: r.p.name })) },
    }],
  });
}

/** Länderseite: Regionen mit Kennzahlen, kleine Regionen mit ihren Orten. */
export function renderCountryPage(code) {
  const c = COUNTRIES[code];
  const regs = regionsOf(code);
  const all = regs.flatMap((r) => r.places);
  const st = statsOf(all);
  const lead = `Für ${c.name} zeigt buscosun ${st.n} Orte in ${regs.length} ${c.regions}, von ${st.lowest.p.name} (${n0(st.lowest.ele)} m) bis ${st.highest.p.name} (${n0(st.highest.ele)} m). ` +
    `Das Jahresmittel der Temperatur (1991–2020) reicht von ${n1(st.coldest.mean)} °C in ${st.coldest.p.name} bis ${n1(st.warmest.mean)} °C in ${st.warmest.p.name}.` +
    (st.rasterN > 0 && st.wettest ? ` Am meisten Niederschlag fällt unter diesen Orten in ${st.wettest.p.name} (${n0(st.wettest.rr)} mm im Jahr), am wenigsten in ${st.driest.p.name} (${n0(st.driest.rr)} mm).` : '');
  const big = regs.filter((r) => r.hasPage);
  const small = regs.filter((r) => !r.hasPage);
  const cards = big.map((r) => {
    const s = statsOf(r.places);
    return `<a class="card" href="${r.path}"><strong>${esc(r.name)}</strong><span>${s.n} Orte · ${n0(s.lowest.ele)}–${n0(s.highest.ele)} m · Jahresmittel ${n1(s.coldest.mean)}–${n1(s.warmest.mean)} °C</span></a>`;
  }).join('\n        ');
  const smallHtml = small.length
    ? `      <section>
        <h2>Weitere Orte in ${esc(c.name)}</h2>
        <p>${small.map((r) => `<strong>${esc(r.name)}:</strong> ${r.places.map(link).join(', ')}`).join(' · ')}</p>
      </section>
`
    : '';
  const faqs = [
    { q: `Wie viele Orte zeigt buscosun in ${c.name}?`, a: `${st.n} Orte in ${regs.length} ${c.regions}, jeweils mit Klimatabelle 1991–2020, Sonnenzeiten und Lage im Gelände.` },
    { q: `Welcher Ort in ${c.name} ist am wärmsten?`, a: `Unter den ${st.n} Orten ${st.warmest.p.name} mit ${n1(st.warmest.mean)} °C Jahresmitteltemperatur (1991–2020); am kältesten ist ${st.coldest.p.name} mit ${n1(st.coldest.mean)} °C.` },
  ];
  const crumbs = [{ name: 'Start', path: '/' }, { name: 'Wetter', path: '/wetter/' }, { name: c.name, path: countryPath(code) }];
  const faqHtml = faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n      ');
  const body = `      <section>
        <h2>${c.regions} in ${esc(c.name)}</h2>
        <div class="cards">
        ${cards}
        </div>
      </section>
${smallHtml}
      <section>
        <h2>Häufige Fragen zu ${esc(c.name)}</h2>
        ${faqHtml}
      </section>

      <section>
        <p class="note"><a href="/wetter/">Wetter nach Ort — alle Länder</a></p>
      </section>`;
  const description = `Wetter in ${c.name}: ${st.n} Orte in ${regs.length} ${c.regions} mit Klima 1991–2020, Sonnenzeiten und Lage im Gelände — von ${n0(st.lowest.ele)} bis ${n0(st.highest.ele)} m.`;
  return pageShell({
    title: `Wetter in ${c.name} — ${st.n} Orte nach ${c.region} | ${SITE.name}`, description, path: countryPath(code), crumbs,
    h1: `Wetter in ${c.name}`, sub: `${c.flag} ${st.n} Orte · ${regs.length} ${c.regions}`, lead, body,
    sources: sourcesLine(all), faqs,
    jsonLd: [{
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: `Wetter in ${c.name}`, url: SITE.url + countryPath(code), description, inLanguage: 'de',
      about: { '@type': 'Country', name: c.name },
      mainEntity: { '@type': 'ItemList', numberOfItems: big.length, itemListElement: big.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE.url + r.path, name: r.name })) },
    }],
  });
}

export const REGION_PAGE_MIN = MIN_REGION_PLACES;
export { REGIONS };
