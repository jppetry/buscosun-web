/**
 * read-point.mjs — die Vorstufe der buscosun Fusion auf der Kommandozeile (PD-D4).
 *
 * Eingabe: ein Punkt im DACH-Raum und ein Zeitpunkt oder Zeitraum.
 * Ausgabe: die BESTE verfügbare Quelle aus `buscosun-data` und alle Werte, die sie
 * für diese Zeit führt — plus die Begründung, warum die anderen verloren haben.
 *
 * **Kein Algorithmus.** Nichts wird gemittelt, korrigiert, interpoliert oder geglättet.
 * Wo zwei Produkte dieselbe Zeit tragen, gewinnt eines und das andere steht daneben.
 *
 *   npm run point:read -- 48.137 11.575 --elev=519
 *   npm run point:read -- 47.269 11.404 --at=2026-09-14T15:00Z
 *   npm run point:read -- 48.208 16.373 --from=2026-09-13T00:00Z --to=2026-09-16T00:00Z --step=6
 *
 * ⚠ `npm run` schluckt in dieser Umgebung `--`-Argumente; für Schalter direkt
 * `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs
 * scripts/point/read-point.mjs …` aufrufen.
 *
 * Schalter: `--elev=<m>` echte Geländehöhe (ohne sie bleibt das Höhenkriterium
 * ungeprüft) · `--step=<h>` Auswertungsraster · `--raw` über raw.githubusercontent statt
 * jsDelivr (Gegenprobe unmittelbar nach einem Push) · `--json` maschinenlesbar ·
 * `--no-nowcast` überspringt die Radarabrufe · `--now=<iso>` für reproduzierbare Läufe.
 */

import { pathToFileURL } from 'node:url';
import { decodePng, toRgba } from '../lib/png.mjs';
import { httpStore, POINT_RAW_BASE } from '../../src/point/client/store.ts';
import { stepNearest } from '../../src/point/client/cubePoint.ts';
import { readPointBundle } from '../../src/point/client/readPoint.ts';

const H = 3_600_000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';
const num = (v, d = 1) => (v == null ? '—' : v.toFixed(d));

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v === undefined ? true : v;
    } else pos.push(a);
  }
  return { pos, flags };
}

function usage() {
  console.log('Aufruf: read-point.mjs <lat> <lon> [--at=<iso> | --from=<iso> --to=<iso>]');
  console.log('        [--elev=<m>] [--step=<h>] [--raw] [--json] [--no-nowcast] [--now=<iso>]');
}

async function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  if (pos.length < 2) { usage(); process.exitCode = 2; return; }
  const lat = Number(pos[0]);
  const lon = Number(pos[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) { usage(); process.exitCode = 2; return; }

  const nowMs = flags.now ? Date.parse(flags.now) : Date.now();
  // Harte Frist 8 s wie im Browser-Leser (Plan §4, AP1); der Sammler behaelt seine 20 s.
  const store = httpStore(flags.raw ? { base: POINT_RAW_BASE, timeoutMs: 8_000 } : { timeoutMs: 8_000 });

  const input = {
    lat, lon,
    elevationM: flags.elev != null && flags.elev !== true ? Number(flags.elev) : null,
    nowMs,
    stepH: flags.step ? Number(flags.step) : 1,
  };
  if (flags.at) input.atMs = Date.parse(flags.at);
  else {
    input.fromMs = flags.from ? Date.parse(flags.from) : nowMs;
    input.toMs = flags.to ? Date.parse(flags.to) : (input.fromMs + 336 * H);
  }

  // ── AP1: alle Produkte PARALLEL über den Bündel-Leser (derselbe Weg wie im Browser) ──
  // Chunk-Adresse aus dem Index, Manifeste gepinnt nur fuer die Provenienz, Radar-Frames nur
  // auf den Ausgabezeiten, Gelaende aus zwei Kachelskalen (z11 + z8) parallel dazu.
  const bundle = await readPointBundle(input, {
    store,
    decodePng: flags['no-nowcast'] ? undefined : decodePng,
    nowcast: !flags['no-nowcast'],
    // Node hat kein createImageBitmap: PNG aus `png.mjs`, dann RGBA in der Form, die der Browser liefert.
    terrain: flags['no-terrain'] ? false : { decodeRgba: (b) => { const png = decodePng(b); return { data: toRgba(png), width: png.width, height: png.height }; } },
    plan: true,
  });
  const plan = bundle.plan;
  if (!bundle.index) { console.error('point/index.json nicht erreichbar.'); process.exitCode = 1; return; }
  if (!plan) { console.error('Auswahlregel nicht gelaufen: ' + bundle.errors.join(' · ')); process.exitCode = 1; return; }
  // Uebersprungenes wird GESAGT (V-FI-3): `null` allein sagt nicht, warum.
  for (const s of bundle.skips) if (!/außerhalb|ausserhalb/.test(s)) console.error(`⚠ uebersprungen — ${s}`);
  for (const n of bundle.notes) console.error(`⚠ Hinweis — ${n}`);
  for (const e of bundle.errors) console.error(`✗ Fehler — ${e}`);

  const needTiers = new Set(bundle.tiers);
  const cube = bundle.cube;
  const hmodel = bundle.hmodel[bundle.tiers[0]] ?? null;
  const station = bundle.station;
  const nowcast = bundle.nowcast[0] ?? null;
  const terrain = bundle.terrain;

  if (flags.json) {
    console.log(JSON.stringify({
      plan: { ...plan, index: undefined }, cube, station, nowcast, nowcastAll: bundle.nowcast,
      hmodel: bundle.hmodel, urban: bundle.urban, terrain, stationChoice: bundle.stationChoice,
      timing: bundle.timing, stats: store.stats, skips: bundle.skips, notes: bundle.notes, errors: bundle.errors,
    }, null, 1));
    return;
  }

  // ── Kopf ─────────────────────────────────────────────────────────────────
  console.log(`# Vorstufe buscosun Fusion — ${lat} / ${lon}`
    + (plan.elevationM != null ? ` · Geländehöhe ${plan.elevationM} m` : ' · Geländehöhe nicht übergeben'));
  console.log(`Stand ${iso(nowMs)} · Repo ${store.base}`);
  console.log(`Index veröffentlicht ${plan.index.publishedAt} · Commit ${String(plan.index.commit).slice(0, 7)}`);
  console.log();

  console.log('## Kandidaten am Punkt');
  console.log(`Stationsprodukt : ${plan.station.reason}`);
  if (plan.station.nearby.length > 1) {
    console.log(`                  weitere: ${plan.station.nearby.slice(1, 4)
      .map((s) => `${s.name.trim()} ${s.distanceKm.toFixed(1)} km (${s.elev} m)`).join(' · ')}`);
  }
  console.log(`Nowcast         : ${plan.nowcast.covering.length
    ? plan.nowcast.slots.map((s) => `${s.sourceId} Slot ${s.stamp} (${s.ageMin.toFixed(0)} min alt, ${s.probes} Sonde(n))`).join(' · ')
    : 'keine Radarquelle deckt diesen Punkt'}`);
  for (const t of ['t1', 't2', 't3']) {
    const p = plan.index.latestByTier[t];
    console.log(`Cube ${t}         : ${p?.run ? `Lauf ${p.run} (${p.runAt})` : 'kein Lauf im Repo'}`);
  }
  console.log();

  console.log('## Beste Quelle je Abschnitt');
  console.log('von               bis                 gewählt      Alternative  Niederschlag  σ/Quantile  Schritte');
  for (const s of plan.segments) {
    console.log(`${iso(s.fromMs)}  ${iso(s.toMs)}  ${String(s.primary ?? '—').padEnd(11)}  `
      + `${String(s.alternative ?? '—').padEnd(11)}  ${String(s.precip ?? '—').padEnd(12)}  `
      + `${String(s.uncertainty ?? '—').padEnd(10)}  ${String(s.steps).padStart(6)}`);
  }
  if (plan.gaps.length) {
    console.log('\n⚠ Von KEINEM Produkt getragen:');
    for (const g of plan.gaps) console.log(`   ${iso(g.fromMs)} … ${iso(g.toMs)}`);
    console.log(`   Grund: ${plan.gaps[0].why}`);
  }
  console.log();

  // ── Die Werte ───────────────────────────────────────────────────────────
  const valuesAt = (cand, atMs) => {
    if (!cand) return null;
    if (cand.product === 'stations' && station) {
      const n = stepNearest(station.steps, atMs);
      return n && { values: n.step.values, offsetMin: n.offsetMin, planes: station.planes, label: `stations ${station.station.id}`, series: station };
    }
    if (cand.product.startsWith('cube-')) {
      const ser = cube[cand.product.slice(5)];
      const n = ser ? stepNearest(ser.steps, atMs) : null;
      return n && { values: n.step.values, offsetMin: n.offsetMin, planes: ser.planes, label: cand.product, series: ser };
    }
    return null;
  };
  const nowcastAt = (atMs) => {
    if (!nowcast) return null;
    let best = null;
    for (const f of nowcast.frames) {
      if (f.validAtMs == null) continue;
      if (!best || Math.abs(f.validAtMs - atMs) < Math.abs(best.validAtMs - atMs)) best = f;
    }
    return best && Math.abs(best.validAtMs - atMs) <= 30 * 60_000 ? best : null;
  };

  if (plan.decisions.length === 1) {
    const d = plan.decisions[0];
    console.log(`## Beste Quelle für ${iso(d.atMs)}`);
    if (!d.primary) {
      console.log('Keine. Geprüft wurde:');
      for (const c of d.candidates) console.log(`   ${c.product.padEnd(11)} ${c.reason}`);
    } else {
      console.log(`⇒ ${d.primary.product}${d.primary.detail !== d.primary.product ? ` (${d.primary.detail})` : ''}`);
      console.log(`   ${d.primary.reason}`);
      const got = valuesAt(d.primary, d.atMs);
      if (got) {
        console.log(`   Rasterabstand ${Math.round(got.offsetMin)} min · `
          + (got.series.product === 'cube' ? `Quell-Lauf ${got.series.sourceRun}` : `Lauf ${got.series.run}`));
        console.log();
        const groups = [
          ['Werte', (pl) => pl.group === 'target' && !/_(sd|sd_ens|q10|q90)$/.test(pl.id)],
          ['σ_div — Streuung ZWISCHEN den Quellen', (pl) => /_sd$/.test(pl.id)],
          ['σ_ens — Streuung zwischen MEMBERN einer Quelle', (pl) => /_sd_ens$/.test(pl.id)],
          ['Quantile — EINER Quelle, nicht des Mittels', (pl) => /_(q10|q90)$/.test(pl.id)],
          ['Profil — aus EINER Quelle, nie gemittelt', (pl) => pl.group === 'profile'],
          ['Meta', (pl) => pl.group === 'meta'],
        ];
        for (const [title, pick] of groups) {
          const rows = got.planes.filter(pick).filter((pl) => got.values[pl.id] != null);
          if (!rows.length) continue;
          console.log(`   ${title}`);
          for (const pl of rows) console.log(`     ${pl.id.padEnd(14)} ${num(got.values[pl.id], 2).padStart(10)} ${pl.unit}`);
        }
        const empty = got.planes.filter((pl) => got.values[pl.id] == null).map((pl) => pl.id);
        if (empty.length) console.log(`   leer (MISSING, nicht „null gemessen"): ${empty.join(', ')}`);
      }
    }
    const nc = nowcastAt(d.atMs);
    if (nc) {
      console.log();
      console.log(`## Niederschlag — bessere Quelle: ${nc.sourceId} (Beobachtung, Slot ${nc.stamp})`);
      console.log(`   ${nc.saturated ? '≥ 19,96 mm/h (gesättigt — der wahre Wert wird NICHT erfunden)' : `${num(nc.mmh, 2)} mm/h`}`
        + `  gültig ${iso(nc.validAtMs)} (+${nc.lead} min)`);
    }
    if (d.alternative) {
      const got = valuesAt(d.primary, d.atMs);
      const alt = valuesAt(d.alternative, d.atMs);
      console.log();
      console.log(`## Zum Vergleich: ${d.alternative.product}${d.alternative.detail !== d.alternative.product ? ` (${d.alternative.detail})` : ''}`);
      console.log(`   ${d.alternative.reason}`);
      if (alt) {
        for (const k of ['t2m', 'td2m', 'u10', 'v10', 'gust', 'precip', 'clct', 'hModEff']) {
          const a = got?.values[k];
          const b = alt.values[k];
          if (a == null && b == null) continue;
          const delta = a != null && b != null ? `  Δ ${(b - a >= 0 ? '+' : '') + (b - a).toFixed(2)}` : '';
          console.log(`     ${k.padEnd(9)} gewählt ${num(a, 2).padStart(9)}   alternativ ${num(b, 2).padStart(9)}${delta}`);
        }
      }
    }
  } else {
    console.log('## Werte der jeweils besten Quelle');
    console.log('Gültigzeit         Quelle             Δ Raster    T °C   Td °C  Bö m/s  R mm/h    N %   σT K   src');
    for (const d of plan.decisions) {
      if (!d.primary) { console.log(`${iso(d.atMs)}  — keine Quelle trägt diese Gültigzeit —`); continue; }
      const got = valuesAt(d.primary, d.atMs);
      if (!got) { console.log(`${iso(d.atMs)}  ${d.primary.product.padEnd(18)} — nicht lesbar —`); continue; }
      const v = got.values;
      const nc = d.precip?.product === 'nowcast' ? nowcastAt(d.atMs) : null;
      const rain = nc ? (nc.saturated ? null : nc.mmh) : v.precip;
      const mark = nc ? (nc.saturated ? '≥' : '*') : ' ';
      console.log(
        `${iso(d.atMs)}  ${got.label.padEnd(18)} ${String(Math.round(got.offsetMin)).padStart(5)} min  `
        + `${num(v.t2m).padStart(6)}  ${num(v.td2m).padStart(6)}  ${num(v.gust).padStart(6)}  `
        + `${mark}${num(rain, 2).padStart(6)}  ${num(v.clct, 0).padStart(5)}  ${num(v.t2m_sd, 2).padStart(5)}  ${num(v.srcCount, 0).padStart(3)}`,
      );
    }
    console.log('\n(Für ALLE Größen einer Quelle: dieselbe Abfrage mit --at=<zeitpunkt>, oder --json.)');
  }

  // ── Ehrlichkeitszeile ───────────────────────────────────────────────────
  console.log();
  console.log('## Was an diesen Zahlen zu wissen ist');
  if (nowcast) {
    console.log(`* "*" = Niederschlag aus dem Radar-Nowcast (${nowcast.sourceId}, Slot ${nowcast.stamp}, `
      + `${nowcast.slotAgeMin.toFixed(0)} min alt), NICHT aus derselben Quelle wie die übrigen Spalten. `
      + '"≥" heißt gesättigt (> 19,96 mm/h) — der Wert wird nicht erfunden.');
  } else if (plan.nowcast.covering.length) {
    console.log(`* Radar deckt den Punkt (${plan.nowcast.covering.join(', ')}), trägt aber keine der `
      + 'angefragten Zeiten — Reichweite RV 2 h, INCA 3 h, CombiPrecip 0 h (nur Analyse).');
  } else {
    console.log('* Kein Radarprodukt deckt diesen Punkt — für 0–3 h trägt hier das Modell, nicht die Beobachtung.');
  }
  for (const t of needTiers) {
    const ser = cube[t];
    if (!ser) continue;
    console.log(`* Cube ${t}: Zelle ${ser.cell.lat.toFixed(3)}/${ser.cell.lon.toFixed(3)} `
      + `(${ser.cell.offsetKm.toFixed(1)} km vom Punkt, ${ser.cell.degrees}°), Modellhöhe ${ser.hModEffM ?? '—'} m`
      + (plan.elevationM != null && ser.hModEffM != null
        ? ` — ${Math.round(plan.elevationM - ser.hModEffM) >= 0 ? '+' : ''}${Math.round(plan.elevationM - ser.hModEffM)} m gegen die echte Höhe (PAP 4 korrigiert das, diese Stufe nicht)`
        : ''));
    console.log(`  Quell-Lauf ${ser.sourceRun} · Beiträger ${ser.sources.map((x) => `${x.id}@${x.runAt.slice(11, 13)}z(${x.steps})`).join(' ')}`);
    if (ser.emptyPlanes.length) console.log(`  an dieser Zelle durchgehend leer: ${ser.emptyPlanes.join(', ')}`);
    if (ser.provenance.quantiles) {
      console.log(`  q10/q90 stammen aus EINER Quelle (${ser.provenance.quantiles.source}, Lauf `
        + `${ser.provenance.quantiles.run}) — nicht aus dem Mittel, und nicht mit σ verrechenbar. `
        + 'Der Mittelwert kann außerhalb des Bandes liegen (audit/fusion-vorstufe.md §4).');
    }
  }
  if (station) {
    console.log(`* Station ${station.station.id} ${station.station.name.trim()}: Lauf ${station.run}, `
      + `${station.ageH.toFixed(1)} h alt, ${station.filledPlanes.length} belegte Größen, KEINE Unsicherheit `
      + `(srcCount = 1). Nicht geführt: ${Object.keys(station.notMapped).join(', ')}.`);
  }
  // ── PD-E: Druckflächen — welche Fläche hier unter Grund liegt ──────────────
  for (const t of needTiers) {
    const ser = cube[t];
    if (!ser) continue;
    const pl = ser.steps.find((x) => x.belowGroundHPa != null);
    if (!pl) continue;
    const bg = pl.belowGroundHPa;
    if (bg.length) {
      console.log(`* Cube ${t}: die Druckfläche(n) ${bg.join(', ')} hPa liegen hier UNTER GRUND `
        + `(Bodendruck ${pl.values.ps?.toFixed(0)} hPa). Die Modelle veröffentlichen dort trotzdem `
        + 'einen Wert — er ist extrapoliert, keine Vorhersage für diese Höhe.');
    } else if (ser.filledPlanes.some((id) => /^(t|rh)(925|850|700)$/.test(id))) {
      console.log(`* Cube ${t}: alle geführten Druckflächen liegen über Grund `
        + `(Bodendruck ${pl.values.ps?.toFixed(0)} hPa).`);
    }
  }

  // ── AP1: Gelände am Punkt (zwei Kachelskalen) ───────────────────────────────
  if (terrain) {
    console.log(`* Gelände (${terrain.source}${terrain.fromCache ? ', aus dem Cache' : ''}): Höhe ${terrain.elevationM ?? '—'} m · `
      + `TPI 500 m ${terrain.tpi500M ?? '—'} · TPI 2 km ${terrain.tpi2000M ?? '—'} · Neigung ${terrain.slopeDeg ?? '—'}° · `
      + `SVF ${terrain.svf ?? '—'} · Horizont N…NW ${terrain.horizonDeg ? terrain.horizonDeg.map((h) => h.toFixed(0)).join('/') : '—'}° `
      + `(${terrain.tiles.near + terrain.tiles.far} Kacheln, ${(terrain.tiles.bytes / 1024).toFixed(0)} KB, ${terrain.timing.totalMs} ms${terrain.tiles.failed ? `, ${terrain.tiles.failed} fehlgeschlagen` : ''})`);
  }
  if (bundle.urban) {
    const u = bundle.urban.byColumn;
    console.log(`* Stadt-Raster (urban/v1, t1-Zelle): versiegelt ${u.imperv ?? '—'} % · d0 ${u.d0 ?? '—'} m · Gebäudehöhe ${u.bldgH ?? '—'} m`);
  }

  // ── PD-E: Modellhöhe je Quelle statt nur des Mittels ───────────────────────
  if (hmodel) {
    const rows = Object.entries(hmodel.byColumn).filter(([, v]) => v != null);
    if (rows.length) {
      console.log(`* Modellhöhe je Quelle (${hmodel.tier}, ${hmodel.version}): `
        + rows.map(([id, v]) => `${id} ${v} m${hmodel.provenance[id] === 'native' ? '' : '*'}`).join(' · ')
        + (hmodel.spreadM != null ? `  — Spanne ${hmodel.spreadM} m` : '')
        + '  (* = aus gh + sp abgeleitet, die Quelle veröffentlicht keine Orographie)');
      if (plan.elevationM != null) {
        console.log(`  echte Höhe ${Math.round(plan.elevationM)} m ⇒ `
          + rows.map(([id, v]) => `${id} ${Math.round(plan.elevationM - v) >= 0 ? '+' : ''}${Math.round(plan.elevationM - v)}`).join(' · ')
          + ' m zu korrigieren (PAP 4, nicht diese Stufe).');
      }
    }
    const absent = Object.entries(hmodel.absent ?? {});
    if (absent.length) console.log(`  ohne Modellhöhe: ${absent.map(([id]) => id).join(', ')} — Grund steht in static.json.`);
  }

  console.log(`* Schwellen der Auswahl: Station ≤ ${plan.selection.stationMaxKm} km und `
    + `≤ ±${plan.selection.stationMaxDElevM} m — gesetzt, NICHT gemessen (E-D-2).`);
  console.log(`* Gelesen: ${store.stats.files} Dateien, ${(store.stats.bytes / 1048576).toFixed(2)} MiB, `
    + `${store.stats.misses} Sonde(n) ins Leere, ${store.stats.slow} Abruf(e) über der weichen Frist.`);
  const tm = bundle.timing;
  const crit = Object.entries(tm.doneAt).filter(([k]) => !['read', 'plan', 'first', 'core'].includes(k)).sort((a, b) => b[1] - a[1]);
  console.log(`* Zeit (AP1, parallel): Index ${tm.indexMs ?? '—'} ms · erste Darstellung ${tm.firstMs ?? '—'} ms · Lesephase ${tm.readMs} ms · gesamt ${tm.totalMs} ms`
    + ` — kritischer Pfad: ${crit.slice(0, 3).map(([k, v]) => `${k} ${v} ms`).join(' > ')}`
    + (Object.keys(tm.phases).length ? ` · Dekodierung ${Object.entries(tm.phases).filter(([k]) => k.startsWith('decode.')).map(([k, v]) => `${k.slice(7)} ${v} ms`).join(', ')}` : ''));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
