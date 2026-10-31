/**
 * Ortsseiten v3 — jeder Satz aus Daten (SEO/GEO 2026, Phase "Ortsseiten individuell").
 *
 * Quellen der Zahlen (alle einmalig geholt, der Build bleibt netzfrei):
 *   data/place-climate.json  Klimanormale 1991–2020 aus 1-km-Rastern (DE: DWD, AT: GeoSphere SPARTACUS);
 *                            CH ohne Eintrag ⇒ Stationsdaten aus `climate.mjs` (siehe fetch-place-climate.mjs)
 *   data/place-terrain.json  Höhenverteilung im 10-km-Umkreis, Rang des Ortes darin, Seenähe
 *   data/place-modules.json  Beziehung zu Seewetter, Pegel, Autobahn, Gletscher (Relevanzregeln im Skript)
 *
 * Regeln:
 *  - Ein Modul-Block erscheint nur, wenn der Ort fachlich passt UND die Zielseite live und indexierbar ist
 *    (`moduleOpen`): Seewetter ja; Autobahnwetter und Gletscher sind vorbereitet, bleiben aber aus, solange
 *    ihre Routen `noindex` sind (Gate C bzw. D in `src/router/routes.ts`).
 *  - Vergleiche zu Nachbarorten nur über der Schwelle und nur, wenn die Höhe sie erklärt (`neighbourFindings`).
 *  - Allgemeine Methodik und Grenzen stehen zentral unter /methodik/ortsseiten/ und /faq/, nicht je Ort.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nearestPlaces } from './places.mjs';
import { COMPARE, TERRAIN } from './placeRules.mjs';
import {
  monthlyClimate as stationClimate, MONTHS, CLIMA_YEARS, CLIMA_STATION_COUNT, SUN_REFERENCE_YEAR, sunDay, monthlySun,
} from './climate.mjs';
import { ROUTE_BY_ID } from '../../src/router/routes.ts';
import { SEA_LIVE } from '../../src/sea/seaFlag.ts';
import { ROAD_LIVE } from '../../src/road/roadFlag.ts';
import { GLACIER_LIVE } from '../../src/glacier/glacierFlag.ts';

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data');
const load = (f) => (existsSync(join(DATA, f)) ? JSON.parse(readFileSync(join(DATA, f), 'utf8')) : { places: {}, sources: {} });
const CLIM_FILE = load('place-climate.json');
const TERR_FILE = load('place-terrain.json');
const MODS_FILE = load('place-modules.json');
const CLIM = CLIM_FILE.places, TERR = TERR_FILE.places, MODS = MODS_FILE.places;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n0 = (v) => nf0.format(v);
const n1 = (v) => nf1.format(v);
const COUNTRY_NAME = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz' };
const SUM = (a) => a.reduce((s, v) => s + v, 0);

/**
 * Klimaquelle: 1-km-Raster 1991–2020 (DE, AT) statt Stationsmittel. `SEO_RASTER=0` schaltet auf die alten Stationswerte zurück
 * (Rückfall nach Rule 2); die Umstellung ist EIN Schalter, die Rasterdaten bleiben unberührt.
 */
export const RASTER_CLIMATE = process.env.SEO_RASTER !== '0';

/** Sonnenzeiten-Tabelle: 'full' = zwölf Monate (Voreinstellung), 'key' = vier Stichtage. Siehe Übergabe Phase 1. */
export const SUN_TABLE_MODE = process.env.SEO_SUN_MODE === 'key' ? 'key' : 'full';

// ------------------------------------------------------------------ Modul-Gates

/** Ein Block darf nur verlinken, wenn die Zielseite live UND indexierbar ist. Für Tests erzwingbar: SEO_FORCE_MODULES=road,glacier. */
const FORCED = new Set((process.env.SEO_FORCE_MODULES || '').split(',').filter(Boolean));
const moduleOpen = (id, routeId, live) => FORCED.has(id) || (live && !ROUTE_BY_ID[routeId]?.meta?.noindex);
export const MODULE_OPEN = {
  sea: moduleOpen('sea', 'seewetter', SEA_LIVE),
  road: moduleOpen('road', 'autobahnwetter', ROAD_LIVE),
  glacier: moduleOpen('glacier', 'gletscher', GLACIER_LIVE),
};
/** GLAMOS (CH-Gletscherinventar): Lizenzklärung steht aus (Daten-Repo-README) ⇒ keine CH-Gletscherzahlen, bis Jan sie freigibt. */
const GLAMOS_CH_CLEARED = false;

// ------------------------------------------------------------------ Klima

/** Einheitliche Klimasicht je Ort: Raster (DE, AT) oder Stationsschätzung (CH). */
export function climateOf(place) {
  const r = RASTER_CLIMATE ? CLIM[place.slug] : undefined;
  let c;
  if (r) {
    const rows = MONTHS.map((month, i) => ({ month, tmax: r.tmax[i], tmin: r.tmin[i], rr: r.rr[i], sun: r.sun[i], wet: r.wet ? r.wet[i] : null }));
    c = { kind: 'raster', src: r.src, rows, days: r.days, rrYear: SUM(r.rr), sunYear: SUM(r.sun), wetYear: r.wet ? SUM(r.wet) : null };
  } else {
    const { rows, nearestKm } = stationClimate(place);
    c = { kind: 'station', src: 'stations', rows: rows.map((x) => ({ month: x.month, tmax: x.tmax, tmin: x.tmin, rr: null, sun: null, wet: x.wetPct })), nearestKm };
  }
  c.warm = c.rows.reduce((a, b) => (b.tmax > a.tmax ? b : a));
  c.cold = c.rows.reduce((a, b) => (b.tmin < a.tmin ? b : a));
  const rainKey = c.kind === 'raster' ? 'rr' : 'wet';
  c.wettest = c.rows.reduce((a, b) => (b[rainKey] > a[rainKey] ? b : a));
  c.driest = c.rows.reduce((a, b) => (b[rainKey] < a[rainKey] ? b : a));
  if (c.kind === 'raster') {
    c.sunniest = c.rows.reduce((a, b) => (b.sun > a.sun ? b : a));
    c.dullest = c.rows.reduce((a, b) => (b.sun < a.sun ? b : a));
  }
  c.meanTemp = SUM(c.rows.map((x) => (x.tmax + x.tmin) / 2)) / 12;
  return c;
}

export const climateSourceLabel = (place) => {
  const r = RASTER_CLIMATE ? CLIM[place.slug] : undefined;
  if (r?.src === 'dwd') return 'Deutscher Wetterdienst (DWD), Klimaraster 1991–2020, 1 km (GeoNutzV)';
  if (r?.src === 'geosphere') return 'GeoSphere Austria, SPARTACUS-Tagesraster 1 km, Normalperiode 1991–2020 (CC BY 4.0)';
  return `DWD-Stationsmessungen via Meteostat, ${CLIMA_YEARS[0]}–${CLIMA_YEARS[1]}`;
};

// ------------------------------------------------------------------ Gelände

/** Lage im Gelände aus der Höhenverteilung im 10-km-Umkreis. */
export function terrainOf(place) {
  const t = TERR[place.slug];
  if (!t) return null;
  const relief = t.p90 - t.p10;
  const lage = relief < TERRAIN.flatReliefM ? 'eben' : t.rank <= TERRAIN.valleyRank ? 'tal' : t.rank >= TERRAIN.crestRank ? 'hoehe' : 'hang';
  return { ...t, relief, lage, above: Math.max(0, t.max - place.ele) };
}

function terrainSentences(place) {
  const t = terrainOf(place);
  if (!t) return [];
  const lower = Math.round(t.rank * 100), higher = 100 - lower;
  const out = [];
  if (t.lage === 'eben') {
    out.push(`${place.name} liegt im flachen Gelände: Im Umkreis von 10 km liegen 80 % der Fläche zwischen ${n0(t.p10)} und ${n0(t.p90)} m, der Höhenunterschied beträgt nur etwa ${n0(t.relief)} m.`);
  } else {
    const word = { tal: 'eine Tal- oder Beckenlage', hang: 'eine Hanglage', hoehe: 'eine Höhen- oder Kuppenlage' }[t.lage];
    out.push(`Mit ${n0(place.ele)} m liegt ${place.name} höher als ${lower} % und tiefer als ${higher} % des Geländes im 10-km-Umkreis (${n0(t.min)} bis ${n0(t.max)} m, Mittel ${n0(t.mean)} m): ${word}.`);
    if (t.above >= 300) out.push(`Die höchsten Punkte der Umgebung überragen den Ort um ${n0(t.above)} m.`);
  }
  if (t.lake) out.push(t.lake.km <= 1.5 ? `${place.name} liegt am ${t.lake.name}.` : `Das Ufer des ${t.lake.name} liegt rund ${n0(Math.max(1, Math.round(t.lake.km)))} km entfernt.`);
  return out;
}

const AVALANCHE = {
  DE: { name: 'Lawinenwarndienst Bayern', url: 'https://www.lawinenwarndienst-bayern.de/' },
  AT: { name: 'lawinen.report', url: 'https://www.lawinen.report/' },
  CH: { name: 'SLF', url: 'https://www.slf.ch/' },
};
const isAlpine = (p) => p.ele >= 800 && (p.country !== 'DE' || p.region === 'Bayern');

// ------------------------------------------------------------------ Module

/** Küste/Seewetter, Autobahn, Gletscher — je nur, wenn passend UND Zielseite offen. */
export function moduleBlocks(place) {
  const m = MODS[place.slug] || {};
  const blocks = [];
  const mentions = [];
  if (m.sea && MODULE_OPEN.sea) {
    const s = m.sea.spot, g = m.sea.gauge;
    const sea = s.region === 'ostsee' ? 'Ostsee' : 'Nordsee';
    let h = `<p>Der nächste Seewetter-Spot von buscosun an der ${sea} ist <a href="/seewetter/${esc(s.id)}">${esc(s.name)}</a> (${n1(s.km)} km von ${esc(place.name)})` +
      `${s.seaArea ? `, im Seegebiet „${esc(s.seaArea)}“` : ''}${s.coast ? ` am Küstenabschnitt „${esc(s.coast)}“` : ''} (Gebiete des Deutschen Wetterdienstes).</p>`;
    if (g) h += `<p>Der nächste Pegel des Bundesamts für Seeschifffahrt und Hydrographie (BSH) ist <strong>${esc(g.name)}</strong> (${n1(g.km)} km); sein Wasserstandsverlauf steht auf der <a href="/seewetter/${esc(s.id)}">Seewetter-Seite</a>.</p>`;
    blocks.push({ id: 'sea', h2: `Küste und Seewetter bei ${place.name}`, html: h, sources: g ? ['DWD (Seegebiete, © GeoBasis-DE / BKG)', 'BSH (Pegeldaten, CC BY 4.0)'] : ['DWD (Seegebiete, © GeoBasis-DE / BKG)'] });
    mentions.push({ '@type': 'Place', name: s.name, geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lon }, description: `Seewetter-Spot, ${n1(s.km)} km von ${place.name}` });
    if (g) mentions.push({ '@type': 'Place', name: g.name, geo: { '@type': 'GeoCoordinates', latitude: g.lat, longitude: g.lon }, description: `BSH-Pegel, ${n1(g.km)} km von ${place.name}` });
  }
  if (m.road && MODULE_OPEN.road) {
    const { corridor: c, station: st } = m.road;
    mentions.push({ '@type': 'Place', name: `Glättemeldeanlage ${st.name}`, geo: { '@type': 'GeoCoordinates', latitude: st.lat, longitude: st.lon } });
    blocks.push({
      id: 'road', h2: `Autobahn bei ${place.name}`,
      html: `<p>Die Autobahn ${esc(c.road)} liegt etwa ${n0(Math.max(1, Math.round(c.km)))} km von ${esc(place.name)} entfernt. Die nächste Glättemeldeanlage des Deutschen Wetterdienstes steht bei „${esc(st.name)}“ an der ${esc(st.road)}${st.roadKm != null ? ` (km ${n1(st.roadKm)})` : ''}, ${n1(st.km)} km entfernt. Fahrbahntemperatur und -zustand zeigt <a href="/autobahnwetter/${esc(c.id)}">Autobahnwetter für die ${esc(c.road)}</a>.</p>`,
      sources: ['DWD (Glättemeldeanlagen, GeoNutzV)', 'BKG DLM250 (Autobahnachsen, dl-de/by-2.0)'],
    });
  }
  if (m.glaciers && MODULE_OPEN.glacier) {
    const list = m.glaciers.filter((g) => g.country !== 'CH' || GLAMOS_CH_CLEARED).slice(0, 3);
    if (list.length) {
      const items = list.map((g) => `<li><a href="/gletscher/${esc(g.id)}">${esc(g.name)}</a>, ${n0(Math.round(g.km))} km entfernt, ${n1(g.areaKm2)} km² (Bezugsjahr ${esc(g.areaYear)}, ${esc(g.areaSource)})</li>`).join('');
      for (const g of list) mentions.push({ '@type': 'Place', name: g.name, geo: { '@type': 'GeoCoordinates', latitude: g.lat, longitude: g.lon } });
      blocks.push({
        id: 'glacier', h2: `Gletscher in der Nähe von ${place.name}`,
        html: `<p>Im Umkreis von 30 km um ${esc(place.name)} liegen Gletscher ab 0,5 km² Fläche. Die nächsten:</p><ul class="facts">${items}</ul>`,
        sources: ['Gletscherinventare AGI 5 / GI4 / RGI (CC BY)'],
      });
    }
  }
  return { blocks, mentions };
}

// ------------------------------------------------------------------ Vergleiche (Schwelle: 1 K / 10 % / 15 Tage UND Höhe erklärt es)

const MIN_DH = COMPARE.minHeightDiffM, MIN_DT = COMPARE.minTempDiffK, MIN_DRR = COMPARE.minPrecipRel, MIN_DFROST = COMPARE.minFrostDays, MAX_KM = COMPARE.maxKm;

export function neighbourFindings(place, max = 2) {
  const a = climateOf(place);
  const out = [];
  const used = new Set();
  for (const nb of nearestPlaces(place, 6)) {
    if (out.length >= max) break;
    if (nb.distKm > MAX_KM) continue;
    const b = climateOf(nb);
    if (a.kind !== b.kind) continue;
    const dh = place.ele - nb.ele;
    if (Math.abs(dh) < MIN_DH) continue;
    const higher = dh > 0;
    const hTxt = `${n0(Math.abs(dh))} m ${higher ? 'tiefer' : 'höher'}`;
    const ref = `dem ${nb.distKm} km entfernten ${nb.name}, das ${hTxt} liegt`;
    const dT = a.meanTemp - b.meanTemp;
    if (!used.has('t') && Math.abs(dT) >= MIN_DT && (higher ? dT < 0 : dT > 0)) {
      out.push(`Im Jahresmittel ist es in ${place.name} um ${n1(Math.abs(dT))} K ${dT < 0 ? 'kälter' : 'wärmer'} als in ${ref}.`);
      used.add('t');
    }
    if (out.length < max && a.kind === 'raster' && !used.has('rr')) {
      const rel = (a.rrYear - b.rrYear) / b.rrYear;
      if (Math.abs(rel) >= MIN_DRR && (higher ? rel > 0 : rel < 0)) {
        out.push(`Mit rund ${n0(a.rrYear)} mm im Jahr fällt in ${place.name} etwa ${n0(Math.round(Math.abs(rel) * 100))} % ${rel > 0 ? 'mehr' : 'weniger'} Niederschlag als in ${ref} (${n0(b.rrYear)} mm).`);
        used.add('rr');
      }
    }
    if (out.length < max && a.kind === 'raster' && !used.has('f')) {
      const df = a.days.frost - b.days.frost;
      if (Math.abs(df) >= MIN_DFROST && (higher ? df > 0 : df < 0)) {
        out.push(`${place.name} hat im Mittel ${n0(Math.round(Math.abs(df)))} Frosttage ${df > 0 ? 'mehr' : 'weniger'} als ${ref}.`);
        used.add('f');
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ Texte

export function placeLeadV3(place) {
  const c = climateOf(place);
  const t = terrainOf(place);
  const lageWord = t ? { eben: 'im flachen Gelände', tal: 'in einer Tal- oder Beckenlage', hang: 'in einer Hanglage', hoehe: 'in einer Höhen- oder Kuppenlage' }[t.lage] : null;
  let s = `${place.name} (${place.region === place.name ? '' : `${place.region}, `}${COUNTRY_NAME[place.country]}) liegt auf rund ${n0(place.ele)} m${lageWord ? ` ${lageWord}` : ''}. `;
  if (c.kind === 'raster') {
    s += `Im Mittel der Jahre 1991 bis 2020 fallen dort ${n0(c.rrYear)} mm Niederschlag im Jahr, die Sonne scheint rund ${n0(c.sunYear)} Stunden, und es gibt ${n0(Math.round(c.days.frost))} Frost- sowie ${n0(Math.round(c.days.summer))} Sommertage. ` +
      `Am wärmsten ist der ${c.warm.month} mit Tagesmaxima um ${n1(c.warm.tmax)} °C, am kältesten der ${c.cold.month} mit Tiefstwerten um ${n1(c.cold.tmin)} °C.`;
  } else {
    s += `Am wärmsten ist der ${c.warm.month} mit Tagesmaxima um ${n1(c.warm.tmax)} °C, am kältesten der ${c.cold.month} mit Tiefstwerten um ${n1(c.cold.tmin)} °C; am häufigsten regnet es im ${c.wettest.month} (an etwa ${n0(c.wettest.wet)} % der Tage).`;
  }
  return s;
}

export function placeDescriptionV3(place) {
  const c = climateOf(place);
  const base = `Wetter ${place.name} (${place.region}, ${n0(place.ele)} m)`;
  const tail = ' — Vorhersage aus amtlichen Quellen, Klima 1991–2020, Sonnenzeiten, ohne Tracker.';
  const variants = c.kind === 'raster'
    ? [`${base}: ${n0(c.rrYear)} mm Niederschlag und ${n0(c.sunYear)} Sonnenstunden im Jahr, ${c.warm.month} bis ${n1(c.warm.tmax)} °C${tail}`,
       `${base}: ${n0(c.rrYear)} mm Niederschlag, ${n0(c.sunYear)} Sonnenstunden, ${c.warm.month} bis ${n1(c.warm.tmax)} °C.`]
    : [`${base}: ${c.warm.month} bis ${n1(c.warm.tmax)} °C, ${c.cold.month} um ${n1(c.cold.tmin)} °C${tail}`,
       `${base}: ${c.warm.month} bis ${n1(c.warm.tmax)} °C, ${c.cold.month} um ${n1(c.cold.tmin)} °C.`];
  return variants.find((v) => v.length <= 160) ?? variants[variants.length - 1];
}

export function lageSection(place) {
  const sent = terrainSentences(place);
  if (isAlpine(place)) {
    const a = AVALANCHE[place.country];
    sent.push(`Für den Lawinenlagebericht gilt in dieser Region der <a href="${a.url}" rel="nofollow noopener">${a.name}</a>; buscosun modelliert keine Lawinengefahr.`);
  }
  if (!sent.length) return '';
  return `      <section>
        <h2>Lage von ${esc(place.name)} im Gelände</h2>
        <p>${sent.map((s) => (s.includes('<a ') ? s : esc(s))).join(' ')}</p>
      </section>
`;
}

function climateTable(place, c) {
  const raster = c.kind === 'raster';
  const head = raster
    ? '<tr><th>Monat</th><th>Ø Maximum</th><th>Ø Minimum</th><th>Niederschlag</th><th>Sonnenschein</th></tr>'
    : '<tr><th>Monat</th><th>Ø Maximum</th><th>Ø Minimum</th><th>Regenwahrscheinlichkeit</th></tr>';
  const body = c.rows.map((r) => raster
    ? `<tr><td>${r.month}</td><td>${n1(r.tmax)} °C</td><td>${n1(r.tmin)} °C</td><td>${n0(r.rr)} mm</td><td>${n0(r.sun)} h</td></tr>`
    : `<tr><td>${r.month}</td><td>${n1(r.tmax)} °C</td><td>${n1(r.tmin)} °C</td><td>${n0(r.wet)} %</td></tr>`).join('');
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

export function climateSectionV3(place) {
  const c = climateOf(place);
  const items = [];
  if (c.kind === 'raster') {
    items.push(`<strong>Niederschlag:</strong> ${n0(c.rrYear)} mm im Jahr, am meisten im ${c.wettest.month} (${n0(c.wettest.rr)} mm), am wenigsten im ${c.driest.month} (${n0(c.driest.rr)} mm).`);
    items.push(`<strong>Sonnenschein:</strong> ${n0(c.sunYear)} Stunden im Jahr, am meisten im ${c.sunniest.month} (${n0(c.sunniest.sun)} h), am wenigsten im ${c.dullest.month} (${n0(c.dullest.sun)} h).`);
    const d = c.days;
    items.push(`<strong>Kenntage im Jahr:</strong> ${n0(Math.round(d.frost))} Frosttage (Tiefstwert unter 0 °C), ${n0(Math.round(d.ice))} Eistage (Höchstwert unter 0 °C), ${n0(Math.round(d.summer))} Sommertage (ab 25 °C), ${n0(Math.round(d.hot))} heiße Tage (ab 30 °C)${d.snow != null ? `, ${n0(Math.round(d.snow))} Tage mit Schneedecke` : ''}.`);
    if (c.wetYear != null) items.push(`<strong>Regentage:</strong> an etwa ${n0(Math.round(c.wetYear))} Tagen im Jahr fällt mindestens 1 mm Niederschlag.`);
  } else {
    items.push(`<strong>Niederschlag:</strong> Am häufigsten regnet es im ${c.wettest.month} (an etwa ${n0(c.wettest.wet)} % der Tage), am seltensten im ${c.driest.month} (${n0(c.driest.wet)} %).`);
  }
  const seasons = [['Winter', 'Dezember bis Februar', [11, 0, 1]], ['Frühling', 'März bis Mai', [2, 3, 4]], ['Sommer', 'Juni bis August', [5, 6, 7]], ['Herbst', 'September bis November', [8, 9, 10]]].map(([name, span, idx]) => {
    const rs = idx.map((i) => c.rows[i]);
    const avg = (k) => SUM(rs.map((r) => r[k])) / rs.length;
    const tail = c.kind === 'raster' ? `${n0(SUM(rs.map((r) => r.rr)))} mm Niederschlag, ${n0(SUM(rs.map((r) => r.sun)))} Sonnenstunden` : `Regen an etwa ${n0(avg('wet'))} % der Tage`;
    return `<li><strong>${name}</strong> (${span}): Höchstwerte im Mittel ${n1(avg('tmax'))} °C, Tiefstwerte ${n1(avg('tmin'))} °C, ${tail}.</li>`;
  });
  const t = terrainOf(place);
  const cell = c.kind === 'raster' && t
    ? `Die Werte gelten für eine Rasterzelle von etwa 1 km; deren mittlere Höhe liegt bei ${n0(t.mean1)} m, ${Math.abs(t.mean1 - place.ele) < 25 ? 'praktisch auf Ortshöhe' : `der Ort selbst bei ${n0(place.ele)} m`}.`
    : c.kind === 'station' ? `Die Werte sind eine Schätzung aus den drei nächsten Stationen (von ${CLIMA_STATION_COUNT}); die nächste liegt rund ${n0(c.nearestKm)} km entfernt, umgerechnet mit 6,5 K je km auf ${n0(place.ele)} m.` : '';
  return `      <section>
        <h2>Klima in ${esc(place.name)} im Jahresverlauf</h2>
        <p>Der ${c.warm.month} ist mit Tagesmaxima um ${n1(c.warm.tmax)} °C der wärmste Monat, im ${c.cold.month} fallen die Tiefstwerte im Mittel auf ${n1(c.cold.tmin)} °C; das Jahresmittel der Temperatur liegt bei etwa ${n1(c.meanTemp)} °C.</p>
        ${climateTable(place, c)}
        <ul class="facts">
          ${items.map((i) => `<li>${i}</li>`).join('\n          ')}
        </ul>
        <p>Die vier Jahreszeiten im Mittel:</p>
        <ul class="facts">
          ${seasons.join('\n          ')}
        </ul>
        <p class="note">Quelle: ${esc(climateSourceLabel(place))}. ${esc(cell)} Mehr zu Herkunft und Grenzen: <a href="/methodik/ortsseiten/">Methodik der Ortsseiten</a>.</p>
      </section>
`;
}

const KEY_DATES = [['Frühlingsanfang', 2, 20], ['Sommeranfang', 5, 21], ['Herbstanfang', 8, 22], ['Winteranfang', 11, 21]];
export function sunSectionV3(place) {
  const t = terrainOf(place);
  const shade = t && t.above >= 500
    ? ` Das Gelände im Umkreis ragt bis zu ${n0(t.above)} m über ${esc(place.name)} hinaus; die Zeiten sind astronomisch und berücksichtigen diese Abschattung nicht; die Sonne kann hier früher hinter dem Grat verschwinden.` : '';
  if (SUN_TABLE_MODE === 'full') {
    const all = monthlySun(place);
    const jun = all[5], dec = all[11];
    const body = all.map((r) => `<tr><td>${r.month}</td><td>${r.sunrise ?? '—'}</td><td>${r.sunset ?? '—'}</td><td>${r.dayLength ?? '—'}</td><td>${r.goldenEvening ?? '—'}</td><td>${r.blueEvening ?? '—'}</td></tr>`).join('');
    return `      <section>
        <h2>Sonnenzeiten in ${esc(place.name)}</h2>
        <p>Am längsten ist der Tag in ${esc(place.name)} um den 15. Juni mit ${jun.dayLength ?? '—'} (Sonnenaufgang ${jun.sunrise ?? '—'}, Sonnenuntergang ${jun.sunset ?? '—'}), am kürzesten um den 15. Dezember mit ${dec.dayLength ?? '—'}.</p>
        <table>
          <thead><tr><th>Monat (15.)</th><th>Aufgang</th><th>Untergang</th><th>Tageslänge</th><th>Goldene Stunde abends</th><th>Blaue Stunde abends</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
        <p class="note">Astronomisch berechnet, Referenzjahr ${SUN_REFERENCE_YEAR}, Ortszeit mit Sommerzeit; Definitionen der Stunden und Grenzen: <a href="/methodik/ortsseiten/">Methodik der Ortsseiten</a>.${shade}</p>
      </section>
`;
  }
  const rows = KEY_DATES.map(([label, m, d]) => ({ label, d: `${d}. ${MONTHS[m]}`, s: sunDay(place, m, d) }));
  const body = rows.map((r) => `<tr><td>${r.label} (${r.d})</td><td>${r.s.sunrise ?? '—'}</td><td>${r.s.sunset ?? '—'}</td><td>${r.s.dayLength ?? '—'}</td><td>${n1(r.s.noonAltitude)}°</td><td>${r.s.goldenEvening ?? '—'}</td></tr>`).join('');
  const sum = rows[1].s, win = rows[3].s;
  const diff = sum.dayMinutes != null && win.dayMinutes != null ? sum.dayMinutes - win.dayMinutes : null;
  return `      <section>
        <h2>Sonne in ${esc(place.name)}</h2>
        <p>Am Sommeranfang steht die Mittagssonne in ${esc(place.name)} ${n1(sum.noonAltitude)}° hoch, am Winteranfang nur ${n1(win.noonAltitude)}°; der Tag dauert ${sum.dayLength} gegenüber ${win.dayLength}${diff != null ? ` – ein Unterschied von ${Math.floor(diff / 60)} Stunden und ${diff % 60} Minuten` : ''}.</p>
        <table>
          <thead><tr><th>Stichtag</th><th>Aufgang</th><th>Untergang</th><th>Tageslänge</th><th>Sonnenhöhe mittags</th><th>Goldene Stunde abends</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
        <p class="note">Reine Astronomie, Referenzjahr ${SUN_REFERENCE_YEAR}, mitteleuropäische Zeit mit Sommerzeit.${shade} Die Sonnenzeiten für die kommenden Tage zeigt die <a href="/eventplanung/fotografie">Event-Planung</a>.</p>
      </section>
`;
}

/** Datenbasierte Fragen — die allgemeinen stehen zentral unter /faq/. */
export function placeFaqsV3(place) {
  const c = climateOf(place);
  const t = terrainOf(place);
  const mods = moduleBlocks(place);
  const f = [];
  if (c.kind === 'raster') {
    f.push({ q: `Wie viel Niederschlag fällt in ${place.name} im Jahr?`, a: `Im Mittel der Jahre 1991 bis 2020 rund ${n0(c.rrYear)} mm. Am meisten fällt im ${c.wettest.month} (${n0(c.wettest.rr)} mm), am wenigsten im ${c.driest.month} (${n0(c.driest.rr)} mm).` });
    f.push({ q: `Wie viele Frost- und Sommertage hat ${place.name}?`, a: `Im Jahresmittel ${n0(Math.round(c.days.frost))} Frosttage (Tiefstwert unter 0 °C), ${n0(Math.round(c.days.ice))} Eistage (Höchstwert unter 0 °C), ${n0(Math.round(c.days.summer))} Sommertage (Höchstwert ab 25 °C) und ${n0(Math.round(c.days.hot))} heiße Tage (ab 30 °C).` });
    f.push({ q: `Wie sonnig ist ${place.name}?`, a: `Rund ${n0(c.sunYear)} Sonnenstunden im Jahr. Am sonnigsten ist der ${c.sunniest.month} mit ${n0(c.sunniest.sun)} Stunden, am trübsten der ${c.dullest.month} mit ${n0(c.dullest.sun)} Stunden.` });
  } else {
    f.push({ q: `In welchem Monat regnet es in ${place.name} am häufigsten?`, a: `Im ${c.wettest.month}: Dort fällt an etwa ${n0(c.wettest.wet)} % der Tage messbarer Niederschlag, im ${c.driest.month} nur an etwa ${n0(c.driest.wet)} %.` });
  }
  f.push({ q: `Wann ist es in ${place.name} am wärmsten und am kältesten?`, a: `Im ${c.warm.month} mit Tagesmaxima um ${n1(c.warm.tmax)} °C, im ${c.cold.month} mit Tiefstwerten um ${n1(c.cold.tmin)} °C. Das Jahresmittel liegt bei etwa ${n1(c.meanTemp)} °C.` });
  const sum = sunDay(place, 5, 21), win = sunDay(place, 11, 21);
  f.push({ q: `Wie lang ist der Tag in ${place.name} im Sommer und im Winter?`, a: `Um den 21. Juni ${sum.dayLength} (Sonnenaufgang ${sum.sunrise}, Sonnenuntergang ${sum.sunset}), um den 21. Dezember ${win.dayLength} (${win.sunrise} bis ${win.sunset} Uhr). Die Mittagssonne steht dann ${n1(sum.noonAltitude)}° bzw. ${n1(win.noonAltitude)}° hoch.` });
  if (t) f.push({ q: `Wie liegt ${place.name} im Gelände?`, a: terrainSentences(place).join(' ') });
  for (const b of mods.blocks) {
    const plain = b.html.replace(/<li>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
    if (b.id === 'sea') f.push({ q: `Wo ist der nächste Seewetter-Spot und Pegel von ${place.name}?`, a: plain });
    if (b.id === 'road') f.push({ q: `Welche Autobahn und Glättemeldeanlage liegt bei ${place.name}?`, a: plain });
    if (b.id === 'glacier') f.push({ q: `Welche Gletscher liegen in der Nähe von ${place.name}?`, a: plain });
  }
  return f;
}

/** „Was wir für <Ort> nicht wissen" — nur Ortsbezogenes; Allgemeines steht in /methodik/ortsseiten/. */
export function unknownsSectionV3(place) {
  const c = climateOf(place), t = terrainOf(place);
  const items = [];
  if (c.kind === 'raster') {
    items.push(`<strong>Auflösung:</strong> Die Klimawerte sind Mittel über eine Rasterzelle von etwa 1 km${t ? `; der Ort liegt auf ${n0(place.ele)} m, die Zelle im Mittel auf ${n0(t.mean1)} m` : ''}. Straßenzüge, Hinterhöfe und einzelne Hänge innerhalb der Zelle können abweichen.`);
  } else {
    items.push(`<strong>Stationsabstand:</strong> Die nächste der ${CLIMA_STATION_COUNT} Klimastationen liegt rund ${n0(c.nearestKm)} km von ${esc(place.name)} entfernt; die Tabelle ist daher eine Schätzung, keine Messreihe des Ortes.`);
  }
  if (t && t.above >= 500) items.push(`<strong>Gelände:</strong> Berge bis ${n0(t.max)} m im Umkreis von 10 km können die tatsächliche Sonnenzeit in ${esc(place.name)} gegenüber den astronomischen Zeiten verkürzen; das Klimaraster bildet Kaltluftseen und Inversionen nicht gesondert ab.`);
  else if (t && t.lage === 'tal') items.push(`<strong>Beckenlage:</strong> Kaltluft und Nebel in Becken und Tälern bildet das Klimaraster nicht gesondert ab.`);
  items.push(`Weitere Grenzen aller Ortsseiten (Radar, Warnungen, Pollen, UV): <a href="/methodik/ortsseiten/">Methodik der Ortsseiten</a>.`);
  return `      <section>
        <h2>Was wir für ${esc(place.name)} nicht wissen</h2>
        <ul class="facts">
          ${items.map((i) => `<li>${i}</li>`).join('\n          ')}
        </ul>
      </section>
`;
}

/** Gegenrichtung (E): Orte, deren Seite einen Seewetter-Abschnitt trägt — für die Shell von /seewetter. Leer, solange der Block aus ist. */
export function seaPlaceLinks(places) {
  if (!MODULE_OPEN.sea) return [];
  return places.filter((p) => MODS[p.slug]?.sea).map((p) => ({ slug: p.slug, name: p.name }));
}

/** Quellen nur für das, was die Seite zeigt. */
export function sourcesLine(place, blocks) {
  const s = [];
  s.push(climateSourceLabel(place));
  s.push('Sonnenzeiten: eigene astronomische Berechnung');
  if (TERR[place.slug]) s.push('Gelände: Terrarium-Höhenkacheln (Mapzen/AWS Terrain Tiles)');
  if (TERR[place.slug]?.lake) s.push('Seen: Natural Earth (gemeinfrei)');
  for (const b of blocks) for (const x of b.sources || []) s.push(x);
  return [...new Set(s)].join(' · ');
}

export function placeJsonLdExtras(place, blocks) {
  const c = climateOf(place);
  const props = [
    { '@type': 'PropertyValue', name: 'Höhe', value: place.ele, unitCode: 'MTR' },
    { '@type': 'PropertyValue', name: 'Mittlere Jahrestemperatur 1991–2020 (aus Monatsmaxima und -minima)', value: Math.round(c.meanTemp * 10) / 10, unitCode: 'CEL' },
  ];
  if (c.kind === 'raster') {
    props.push({ '@type': 'PropertyValue', name: 'Niederschlag im Jahr (Mittel 1991–2020)', value: Math.round(c.rrYear), unitCode: 'MMT' });
    props.push({ '@type': 'PropertyValue', name: 'Sonnenscheindauer im Jahr (Mittel 1991–2020)', value: Math.round(c.sunYear), unitCode: 'HUR' });
    props.push({ '@type': 'PropertyValue', name: 'Frosttage im Jahr (Mittel 1991–2020)', value: Math.round(c.days.frost) });
  }
  return { additionalProperty: props };
}

export { esc as _esc };
