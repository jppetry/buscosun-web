/**
 * Ortsseiten v2 — Klimatologie und Sonnenzeiten (SEO/GEO 2026, Etappe E8). Build-only.
 *
 * Bisher trugen die 138 Ortsseiten nur ableitbare Standort-Fakten und ein 138× wortgleiches
 * Description-Muster. Dieses Modul ergänzt zwei Blöcke, die **zeitlos gültig** sind und damit
 * Jans Regel „keine Live-Zahlen auf statischen Seiten" nicht verletzen:
 *
 *  1. **Klimatologie** aus `public/climaGrid.json` (178 DWD-/Meteostat-Stationen, 1995–2024,
 *     Fourier-Koeffizienten). Gerechnet wird mit DERSELBEN Klasse wie in der App
 *     (`src/ml/climaField.ts`, k-NN über die 3 nächsten Stationen, IDW, Höhenkorrektur mit
 *     6,5 K/km) — kein zweiter Rechenweg, der driften kann. Ausgewiesen wird das Ergebnis als
 *     Schätzung aus Stationsdaten, nicht als Messreihe des Ortes; die Entfernung zur nächsten
 *     Station steht dabei, weil sie die Belastbarkeit bestimmt.
 *  2. **Sonnenzeiten** je Monat (15.) aus `src/photo/sun.ts` — reine Astronomie, gültig für
 *     jedes Jahr bis auf wenige Minuten.
 *
 * Zeitzonen-Falle: Die Ortsseiten entstehen im Netlify-Build, dessen Uhr auf UTC steht, während
 * die Zeiten für DACH-Leser in mitteleuropäischer Zeit gelten müssen. Beides wird hier explizit
 * an `Europe/Berlin` verankert (Tagesgrenze UND Formatierung) statt an der Systemzeit — sonst
 * wären alle Zeiten lokal richtig und in Produktion um ein bis zwei Stunden falsch.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClimaField } from '../../src/ml/climaField.ts';
import { sunAltitudeDeg } from '../../src/photo/sun.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Datum der letzten inhaltlichen Änderung dieses Bausteins (Sitemap-lastmod der Ortsseiten). */
export const CLIMATE_UPDATED = '2026-09-05';

/** Referenzjahr der Sonnenzeiten — die Werte ändern sich von Jahr zu Jahr nur um Minuten. */
export const SUN_REFERENCE_YEAR = 2026;

const grid = JSON.parse(readFileSync(join(ROOT, 'public', 'climaGrid.json'), 'utf8'));
const field = new ClimaField(grid);

export const CLIMA_YEARS = grid.meta.years; // [1995, 2024]
export const CLIMA_STATION_COUNT = grid.meta.stationCount;

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Tag des Jahres für den 15. eines Monats (Nicht-Schaltjahr — der Unterschied liegt unter einem Tag). */
function doyOf(monthIndex) {
  const cum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return cum[monthIndex] + 15;
}

const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmt1 = (v) => nf1.format(v);

/**
 * Monatliche Klimatologie für einen Ort: mittleres Tagesmaximum und -minimum sowie die
 * klimatologische Regenwahrscheinlichkeit, jeweils am 15. des Monats.
 */
export function monthlyClimate(place) {
  const rows = [];
  let nearestKm = Infinity;
  for (let m = 0; m < 12; m++) {
    const s = field.sample(place.lat, place.lon, doyOf(m), place.ele);
    nearestKm = Math.min(nearestKm, s.nearestKm);
    rows.push({
      month: MONTHS[m],
      short: MONTH_SHORT[m],
      tmax: s.tempMean + s.diurnalAmp,
      tmin: s.tempMean - s.diurnalAmp,
      tmean: s.tempMean,
      wetPct: Math.round(s.wetProb * 100),
    });
  }
  return { rows, nearestKm };
}

// --- Sonnenzeiten, verankert an Europe/Berlin -------------------------------

const TZ = 'Europe/Berlin';
const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const clockFmt = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

/** Abstand der Ortszeit zur UTC an einem Zeitpunkt (ms) — kennt Sommerzeit. */
function berlinOffsetMs(utcMs) {
  const p = partsFmt.formatToParts(new Date(utcMs));
  const get = (t) => Number(p.find((x) => x.type === t).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - utcMs;
}

/** Mitternacht Ortszeit als absoluter Zeitpunkt (zwei Durchläufe wegen der Zeitumstellung). */
function berlinMidnight(year, monthIndex, day) {
  const wall = Date.UTC(year, monthIndex, day);
  let t = wall - berlinOffsetMs(wall);
  t = wall - berlinOffsetMs(t);
  return t;
}

const clock = (ms) => (ms == null ? null : clockFmt.format(new Date(ms)));

/** Minutengenaue Übergänge der Sonnenhöhe über einen ganzen Ortstag. */
function sunDay(place, monthIndex) {
  const start = berlinMidnight(SUN_REFERENCE_YEAR, monthIndex, 15);
  const N = 1440;
  const alt = new Array(N + 1);
  let maxIdx = 0;
  for (let i = 0; i <= N; i++) {
    alt[i] = sunAltitudeDeg(new Date(start + i * 60_000), place.lat, place.lon);
    if (alt[i] > alt[maxIdx]) maxIdx = i;
  }
  const at = (i) => start + i * 60_000;
  /** Erster Übergang durch `level` im Bereich [from,to) — steigend oder fallend. */
  const cross = (from, to, level, rising) => {
    for (let i = from; i < to; i++) {
      const a0 = alt[i], a1 = alt[i + 1];
      if (rising && a0 < level && a1 >= level) return at(i + (level - a0) / (a1 - a0));
      if (!rising && a0 >= level && a1 < level) return at(i + (level - a0) / (a1 - a0));
    }
    return null;
  };
  const HORIZON = -0.833, GOLD_HI = 6, GOLD_LO = -4, BLUE_LO = -6;
  const sunrise = cross(0, maxIdx, HORIZON, true);
  const sunset = cross(maxIdx, N, HORIZON, false);
  const goldenEveningStart = cross(maxIdx, N, GOLD_HI, false);
  const goldenEveningEnd = cross(maxIdx, N, GOLD_LO, false);
  const blueEveningEnd = cross(maxIdx, N, BLUE_LO, false);
  const dayMin = sunrise != null && sunset != null ? Math.round((sunset - sunrise) / 60_000) : null;
  return {
    month: MONTHS[monthIndex],
    short: MONTH_SHORT[monthIndex],
    sunrise: clock(sunrise), sunset: clock(sunset),
    goldenEvening: goldenEveningStart != null && goldenEveningEnd != null ? `${clock(goldenEveningStart)}–${clock(goldenEveningEnd)}` : null,
    blueEvening: goldenEveningEnd != null && blueEveningEnd != null ? `${clock(goldenEveningEnd)}–${clock(blueEveningEnd)}` : null,
    dayLength: dayMin == null ? null : `${Math.floor(dayMin / 60)}:${String(dayMin % 60).padStart(2, '0')} h`,
  };
}

export function monthlySun(place) {
  return MONTHS.map((_, m) => sunDay(place, m));
}

// --- Bausteine für die Ortsseite --------------------------------------------

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Wärmster und kältester Monat — Grundlage für Description und Direktantwort. */
export function climateHighlights(place) {
  const { rows, nearestKm } = monthlyClimate(place);
  const warm = rows.reduce((a, b) => (b.tmax > a.tmax ? b : a));
  const cold = rows.reduce((a, b) => (b.tmin < a.tmin ? b : a));
  const wettest = rows.reduce((a, b) => (b.wetPct > a.wetPct ? b : a));
  const driest = rows.reduce((a, b) => (b.wetPct < a.wetPct ? b : a));
  return { rows, nearestKm, warm, cold, wettest, driest };
}

/** Klimatologie-Tabelle inklusive Herkunfts- und Grenzenhinweis. */
export function climateSection(place) {
  const { rows, nearestKm, warm, cold } = climateHighlights(place);
  const head = `<tr><th>Monat</th><th>Ø Maximum</th><th>Ø Minimum</th><th>Regenwahrscheinlichkeit</th></tr>`;
  const body = rows.map((r) =>
    `<tr><td>${r.month}</td><td>${fmt1(r.tmax)} °C</td><td>${fmt1(r.tmin)} °C</td><td>${r.wetPct} %</td></tr>`).join('');
  return `      <section>
        <h2>Klima in ${esc(place.name)} im Jahresverlauf</h2>
        <p>Im Mittel der Jahre ${CLIMA_YEARS[0]} bis ${CLIMA_YEARS[1]} ist der <strong>${warm.month}</strong> der wärmste Monat in ${esc(place.name)} (Tagesmaximum um ${fmt1(warm.tmax)} °C), am kältesten wird es im <strong>${cold.month}</strong> mit Tiefstwerten um ${fmt1(cold.tmin)} °C. Die Werte gelten für die Höhenlage von rund ${place.ele} m.</p>
        <table>
          <thead>${head}</thead>
          <tbody>${body}</tbody>
        </table>
        <p class="note">Herkunft und Grenzen: Diese Tabelle ist eine <strong>Schätzung aus Stationsdaten</strong>, keine Messreihe von ${esc(place.name)}. Grundlage sind ${CLIMA_STATION_COUNT} Stationen im DACH-Raum (DWD-Messungen über Meteostat, ${CLIMA_YEARS[0]}–${CLIMA_YEARS[1]}); für jeden Ort werden die drei nächstgelegenen Stationen entfernungsgewichtet gemittelt und mit 6,5 K je Kilometer auf die Ortshöhe umgerechnet. Die nächste Station liegt rund ${Math.round(nearestKm)} km entfernt — je weiter, desto gröber die Schätzung. „Regenwahrscheinlichkeit" meint den Anteil der Tage mit messbarem Niederschlag, nicht die Regenmenge. Lokale Effekte wie Stadtwärme, Kaltluftseen oder Föhngassen bildet das Verfahren nicht ab.</p>
      </section>
`;
}

/** Sonnenzeiten-Tabelle (zeitlos, für Foto- und Tourenplanung). */
export function sunSection(place) {
  const rows = monthlySun(place);
  const jun = rows[5], dec = rows[11];
  const body = rows.map((r) =>
    `<tr><td>${r.month}</td><td>${r.sunrise ?? '—'}</td><td>${r.sunset ?? '—'}</td><td>${r.dayLength ?? '—'}</td><td>${r.goldenEvening ?? '—'}</td><td>${r.blueEvening ?? '—'}</td></tr>`).join('');
  return `      <section>
        <h2>Sonnenzeiten in ${esc(place.name)}</h2>
        <p>Am längsten ist der Tag in ${esc(place.name)} um den 15. Juni mit ${jun.dayLength ?? '—'} (Sonnenaufgang ${jun.sunrise ?? '—'}, Sonnenuntergang ${jun.sunset ?? '—'}), am kürzesten um den 15. Dezember mit ${dec.dayLength ?? '—'}. Die goldene Stunde am Abend beginnt, wenn die Sonne 6° über dem Horizont steht, und endet 4° darunter; daran schließt die blaue Stunde bis 6° unter dem Horizont an.</p>
        <table>
          <thead><tr><th>Monat (15.)</th><th>Aufgang</th><th>Untergang</th><th>Tageslänge</th><th>Goldene Stunde abends</th><th>Blaue Stunde abends</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
        <p class="note">Reine Astronomie für den 15. des Monats, Referenzjahr ${SUN_REFERENCE_YEAR}, mitteleuropäische Zeit mit Sommerzeit. Von Jahr zu Jahr verschieben sich die Zeiten um wenige Minuten. Berücksichtigt ist die Standard-Refraktion am Horizont (−0,833°), nicht die Abschattung durch Berge: In einem engen Tal verschwindet die Sonne früher hinter dem Grat — diese Verdeckung rechnet die <a href="/eventplanung/fotografie">Event-Planung</a> aus dem Geländemodell für eine aufgezogene Fläche.</p>
      </section>
`;
}

const AVALANCHE = {
  DE: { name: 'Lawinenwarndienst Bayern', url: 'https://www.lawinenwarndienst-bayern.de/' },
  AT: { name: 'lawinen.report', url: 'https://www.lawinen.report/' },
  CH: { name: 'SLF', url: 'https://www.slf.ch/' },
};

/**
 * „Was wir für <Ort> nicht wissen" — die Lücken je Land und Lage, offen benannt (D-04).
 * Genau die Auskunft, die anderswo fehlt und die ein Sprachmodell zitieren kann.
 */
export function unknownsSection(place, { alpine }) {
  const items = [];
  const c = place.country;
  if (c === 'DE') {
    items.push(`<strong>Radar:</strong> Das gemessene Niederschlagsbild reicht für ${esc(place.name)} bis zwei Stunden voraus (RADOLAN-RV). Danach beginnt Modellvorhersage, kein gemessener Regen mehr.`);
    items.push(`<strong>Warnungen:</strong> Amtliche Unwetterwarnungen des DWD werden wörtlich angezeigt, nie umformuliert. buscosun gibt selbst keine Warnungen heraus.`);
  } else if (c === 'AT') {
    items.push(`<strong>Radar:</strong> Für ${esc(place.name)} liefert INCA (GeoSphere Austria) bis drei Stunden voraus. Danach beginnt Modellvorhersage.`);
    items.push(`<strong>Warnungen:</strong> Für Österreich zeigt buscosun keine amtlichen Warnflächen — diese Lücke ist bekannt und wird nicht durch deutsche oder schweizerische Stufen ersetzt. Maßgeblich ist GeoSphere Austria.`);
    items.push(`<strong>Waldbrandgefahr:</strong> Österreich veröffentlicht keine offene amtliche Waldbrandstufe; buscosun zeigt deshalb den europäischen Index und sagt das dazu.`);
  } else {
    items.push(`<strong>Radar:</strong> Das Schweizer Radarbild (rzc) zeigt die Gegenwart, aber keine eigene Vorhersage. Für ${esc(place.name)} endet das gemessene Bild deshalb beim aktuellen Zeitpunkt.`);
    items.push(`<strong>Warnungen:</strong> Warnungen von MeteoSchweiz werden über MeteoAlarm wörtlich angezeigt. Die Stufen der drei Länder sind nicht ineinander umrechenbar und stehen deshalb nebeneinander.`);
  }
  if (c === 'DE') {
    items.push(`<strong>Pollen und UV:</strong> Beides liegt für ${esc(place.name)} amtlich vom DWD vor (Pollenflug-Gefahrenindex, UV-Tageshöchstwert).`);
  } else {
    items.push(`<strong>Pollen und UV:</strong> Für ${esc(place.name)} gibt es keinen amtlichen Feed. UV wird über ein Klarhimmel-Modell geschätzt, Pollen sind nur als ausdrücklich zugeschaltete CAMS-Schätzung verfügbar — deutsche Werte werden nicht übertragen.`);
  }
  if (alpine) {
    const a = AVALANCHE[c];
    items.push(`<strong>Lawinen:</strong> buscosun modelliert keine Lawinengefahr. Für ${esc(place.name)} wird direkt der amtliche Lagebericht verlinkt (<a href="${a.url}" rel="nofollow noopener">${a.name}</a>).`);
  }
  items.push(`<strong>Wassertemperatur, Badegewässer, Straßenzustand:</strong> nicht Teil von buscosun — dafür sind Landesportale und Gesundheitsämter zuständig.`);
  items.push(`<strong>Klimatabelle:</strong> geschätzt aus umliegenden Stationen (siehe oben), keine Messreihe von ${esc(place.name)} selbst.`);
  return `      <section>
        <h2>Was wir für ${esc(place.name)} nicht wissen</h2>
        <ul class="facts">
          ${items.map((i) => `<li>${i}</li>`).join('\n          ')}
        </ul>
      </section>
`;
}

/** Eigene Description je Ort (vorher 138× wortgleich) — mit Region, Höhe und Klimakennzahl. */
export function placeDescription(place, { warm, cold }) {
  const d = `Wetter ${place.name} (${place.region}, ${place.ele} m): höhenkorrigierte Vorhersage aus amtlichen Quellen, Klima im Jahresverlauf (${warm.short} bis ${fmt1(warm.tmax)} °C, ${cold.short} um ${fmt1(cold.tmin)} °C), Sonnenzeiten und Radar — ohne Tracker.`;
  return d.length <= 160 ? d : `Wetter ${place.name} (${place.region}, ${place.ele} m): höhenkorrigierte Vorhersage, Klima im Jahresverlauf (${warm.short} ${fmt1(warm.tmax)} °C, ${cold.short} ${fmt1(cold.tmin)} °C) und Sonnenzeiten.`;
}
