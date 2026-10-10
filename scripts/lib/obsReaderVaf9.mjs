/**
 * verify:obs-reader, blocks (12)–(19) — V-AF-9 (`audit/autobahn-fusion12-lueckenlos.md` §8.3): the reader of `obs/v1` takes the
 * newest value PER VARIABLE of a station, each with its own stamp. Net-free on a REAL excerpt of two versions of the product
 * (`scripts/lib/fixtures/obs-v1-vaf9.json`: stations within 60 km of eight cities, cut from the data repo's history of
 * 10.10.2026 — `bad` = 10:44 UTC, the temperature 30 min behind the rain stamp; `good` = 10:21 UTC, every variable at the stamp).
 *
 *   (12) bad window: the temperature arrives, with its own stamp        (16) age limit of a value from `older`
 *   (13) stamp integrity, with a negative control                       (17) reverse case: rr behind the stamp
 *   (14) no double counting; anchorDenseAllow; the dedupe of the list   (18) fallback per variable, stale product (fake fetch)
 *   (15) good window: same stations, same measurements                  (19) display consumers, the switch, the cache key
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function runVaf9({ add, O, cubeObsOf, fetchNearestStationObs, resp, realFetch, ROOT }) {
  const E = await import('../../src/pointForecast/cubeSource.ts');
  const S = await import('../../src/pointForecast/sampleSources.ts');
  const P = await import('../../src/pointForecast/pfFlags.ts');
  const FIX = JSON.parse(readFileSync(join(ROOT, 'scripts/lib/fixtures/obs-v1-vaf9.json'), 'utf8'));
  const catalog = O.parseObsCatalog(FIX.catalog);
  const bad = O.parseObsLatest(FIX.bad.latest), good = O.parseObsLatest(FIX.good.latest);
  const NB = Date.parse(bad.builtAt), NG = Date.parse(good.builtAt);
  const sBad = O.obsStoreOf(catalog, bad, NB), sGood = O.obsStoreOf(catalog, good, NG);
  const de = catalog.stations.filter((s) => s.country === 'DE');
  const json = (o) => JSON.stringify(o);
  const pct = (a, b) => `${a}/${b} = ${(100 * a / Math.max(1, b)).toFixed(1)} %`;
  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

  /** The raw truth of one entry, read independently of the reader: variable → (value, own stamp ms). */
  const rawOf = (e) => {
    const out = {};
    for (const k of ['t', 'rh', 'td', 'ff', 'dd', 'fx', 'rr']) {
      if (isNum(e?.v?.[k])) out[k] = { v: e.v[k], ms: Date.parse(e.t) };
      else if (e?.older?.[k] && isNum(e.older[k].v)) out[k] = { v: e.older[k].v, ms: Date.parse(e.older[k].t) };
    }
    return out;
  };
  /** Everything the reader hands the engine for ONE station (asked at the station's own place, dense set). */
  const obsOfStation = (store, st, nowMs, opt) => {
    const list = O.nearestObsStations(store, st.lat, st.lon, st.country === 'LI' ? 'CH' : st.country, { max: 4, nowMs, dense: true, ...opt }).filter((x) => x.stationId === O.obsStationIdOf(st.id) && x.distanceMeters < 1);
    return cubeObsOf(list, nowMs);
  };
  /** Stamp integrity of a list of measurements of one station against the raw entry: the number of violations. */
  const violations = (cs, e) => {
    const raw = rawOf(e);
    let bad = 0;
    const same = (a, b) => Math.abs(a - b) < 1e-9;
    for (const o of cs) {
      const chk = (val, k) => { if (val == null) return; if (!raw[k] || !same(raw[k].v, val) || raw[k].ms !== o.validAtMs) bad += 1; };
      chk(o.temperature, 't'); chk(o.relativeHumidity, 'rh'); chk(o.gust, 'fx'); chk(o.dewPoint, 'td'); chk(o.rr10, 'rr');
      // the hour sum ends at the STATION stamp (the mirror sums up to it) and is never complete without the 10-min value there
      if (o.rr1h != null && (o.validAtMs !== Date.parse(e.t) || (o.rr1h.complete && !isNum(e.v?.rr)))) bad += 1;
      if (o.u != null || o.v != null) {
        const w = raw.ff && raw.dd ? O.windComponentsOf(raw.ff.v, raw.dd.v) : null;
        if (!w || raw.ff.ms !== o.validAtMs || raw.dd.ms !== o.validAtMs || !same(w.u, o.u) || !same(w.v, o.v)) bad += 1;
      }
    }
    return bad;
  };

  // ── (12) bad window: the temperature arrives, with its own stamp ──────────────────────────────────────────────────
  {
    const withT = de.filter((s) => rawOf(bad.stations[s.id]).t);
    let got = 0, ownStamp = 0, old = 0, olderN = 0;
    for (const st of withT) {
      const raw = rawOf(bad.stations[st.id]);
      if (raw.t.ms !== Date.parse(bad.stations[st.id].t)) olderN += 1;
      const tObs = obsOfStation(sBad, st, NB, { perVar: 'split' }).filter((o) => o.temperature != null);
      if (tObs.length === 1 && tObs[0].temperature === raw.t.v) { got += 1; if (tObs[0].validAtMs === raw.t.ms) ownStamp += 1; }
      if (obsOfStation(sBad, st, NB, {}).some((o) => o.temperature != null)) old += 1;
    }
    add('(12) schlechtes Fenster (00519d6, 10:44 UTC): ≥ 99 % der deutschen Stationen mit T (am Stempel oder in older) liefern eine T-Messung, jede mit validAtMs = Stempel der Temperatur',
      withT.length >= 100 && olderN >= 100 && got / withT.length >= 0.99 && ownStamp === got, `${pct(got, withT.length)}, davon ${olderN} aus older, eigener Stempel bei ${ownStamp}`);
    add('(12) Negativkontrolle: der Leser vor V-AF-9 (ohne perVar = ?obsvar=0) liefert an denselben Stationen ≤ 2 % T-Messungen', old / withT.length <= 0.02, pct(old, withT.length));
    const muc = catalog.stations.find((s) => s.id === 'de:03379'), e = bad.stations['de:03379'];
    const cs = obsOfStation(sBad, muc, NB, { perVar: 'split' });
    add('(12) München-Stadt 10:44: ZWEI Messungen — Niederschlag am Stempel 10:20 (rr10, rr1h, kein T/Wind), T/Feuchte/Taupunkt/Wind/Böe am Stempel 09:50 (kein rr10)',
      cs.length === 2 && cs[0].validAtMs === Date.parse(e.t) && cs[0].rr10 === e.v.rr && cs[0].temperature === null && cs[0].u === null && cs[0].rr1h?.complete === true
      && cs[1].validAtMs === Date.parse(e.older.t.t) && cs[1].temperature === e.older.t.v && cs[1].relativeHumidity === e.older.rh.v && cs[1].dewPoint === e.older.td.v && cs[1].gust === e.older.fx.v && cs[1].u != null && cs[1].rr10 === null && cs[1].rr1h === null
      && cs.every((o) => o.stationId === '03379' && o.via === 'obs' && o.distanceM === cs[0].distanceM),
      cs.map((o) => `${new Date(o.validAtMs).toISOString().slice(11, 16)}Z T ${o.temperature} rr10 ${o.rr10}`).join(' | '));
  }

  // ── (13) stamp integrity ──────────────────────────────────────────────────────────────────────────────────────────
  {
    let n = 0, viol = 0, three = 0, wrong = 0, wrongStations = 0;
    for (const [store, doc, nowMs] of [[sBad, bad, NB], [sGood, good, NG]]) {
      for (const st of catalog.stations) {
        const e = doc.stations[st.id];
        if (!e?.t) continue;
        const cs = obsOfStation(store, st, nowMs, { perVar: 'split' });
        n += cs.length; viol += violations(cs, e);
        if (cs.length >= 3) three += 1;
        // negative control: the merged point („now" view of the live path) put through the engine's mapper = T on the rain stamp
        const merged = O.nearestObsStations(store, st.lat, st.lon, st.country === 'LI' ? 'CH' : st.country, { max: 4, nowMs, dense: true, perVar: 'merge' }).filter((x) => x.stationId === O.obsStationIdOf(st.id) && x.distanceMeters < 1);
        const w = violations(cubeObsOf(merged, nowMs), e);
        wrong += w; if (w) wrongStations += 1;
      }
    }
    add('(13) Stempeltreue (beide Fenster, alle Länder des Auszugs): keine Messung trägt einen Wert, dessen eigener Stempel von ihrem validAtMs abweicht', n > 800 && viol === 0, `${n} Messungen geprüft, ${viol} Verstöße`);
    add('(13) Negativkontrolle: eine absichtlich falsche Zusammenführung (T auf dem Niederschlagsstempel) lässt dieselbe Prüfung an > 100 Stationen anschlagen', wrongStations > 100 && wrong > wrongStations, `${wrong} Verstöße an ${wrongStations} Stationen`);
  }

  // ── (14) no double counting ───────────────────────────────────────────────────────────────────────────────────────
  {
    let worst = 0, pts = 0, dupAllow = 0, splitSeen = 0;
    const keyOf = (o) => `${o.source}|${o.stationId}`;
    for (const [store, nowMs] of [[sBad, NB], [sGood, NG]]) {
      for (const c of FIX.cities) {
        const country = c.name === 'Wien' ? 'AT' : c.name === 'Zürich' ? 'CH' : 'DE';
        const list = O.nearestObsStations(store, c.lat, c.lon, country, { max: O.OBS_DENSE_MAX, nowMs, dense: true, perVar: 'split' });
        const cs = cubeObsOf(list, nowMs);
        pts += 1;
        if (list.some((x) => x.parts?.length)) splitSeen += 1;
        const count = new Map();
        for (const o of cs) {
          const k = keyOf(o), c0 = count.get(k) ?? { t: 0, w: 0, g: 0, rr: 0, rr1h: 0 };
          if (o.temperature != null) c0.t += 1; if (o.u != null) c0.w += 1; if (o.gust != null) c0.g += 1; if (o.rr10 != null) c0.rr += 1; if (o.rr1h != null) c0.rr1h += 1;
          count.set(k, c0);
        }
        for (const c0 of count.values()) worst = Math.max(worst, c0.t, c0.w, c0.g, c0.rr, c0.rr1h);
        const allow = E.anchorDenseAllow(cs, 400, E.OBS_DENSE_ANCHOR_K);
        for (const set of [allow.t, allow.wind, allow.gust]) { const ks = [...set].map(keyOf); if (new Set(ks).size !== ks.length) dupAllow += 1; }
      }
    }
    add('(14) keine Doppelzählung: je Station höchstens EINE T-, Wind-, Böen-, rr10- und rr1h-Messung zum Motor (dichter Satz an 8 Stadtpunkten, beide Fenster)', worst === 1 && splitSeen >= 6, `${pts} Punkt-Sätze, ${splitSeen} mit geteilten Stationen, höchste Zahl je Station und Größe ${worst}`);
    add('(14) Falle b: anchorDenseAllow nimmt eine Station je Größe höchstens einmal (K beste, keine Station doppelt)', dupAllow === 0);
    // trap a: the dedupe of the direct path keeps a split station as ONE entry with its parts
    const list = O.nearestObsStations(sBad, 48.137, 11.575, 'DE', { max: O.OBS_DENSE_MAX, nowMs: NB, dense: true, perVar: 'split' });
    const dd = S.nearestStationList(list, O.OBS_DENSE_MAX, true);
    add('(14) Falle a: die Entdopplung der Stationsliste (keyOf) lässt eine geteilte Station als EINEN Eintrag mit ihren Teilen stehen — dieselben Messungen davor und danach',
      dd.length === list.length && json(cubeObsOf(dd, NB)) === json(cubeObsOf(list, NB)) && list.filter((x) => x.parts?.length).length >= 3 && new Set(list.map((x) => x.stationId)).size === list.length);
  }

  // ── (15) good window: same stations, same measurements ────────────────────────────────────────────────────────────
  {
    const strip = (list) => list.map(({ parts, ...rest }) => rest);
    let pts = 0, same = 0, sameStripped = 0, withParts = 0, sameSix = 0, rainOnlyParts = 0, partsN = 0;
    const places = [...FIX.cities.map((c) => ({ lat: c.lat, lon: c.lon, country: c.name === 'Wien' ? 'AT' : c.name === 'Zürich' ? 'CH' : 'DE' })), ...de.map((s) => ({ lat: s.lat, lon: s.lon, country: 'DE' }))];
    for (const p of places) {
      const oldL = O.nearestObsStations(sGood, p.lat, p.lon, p.country, { max: O.OBS_DENSE_MAX, nowMs: NG, dense: true });
      const newL = O.nearestObsStations(sGood, p.lat, p.lon, p.country, { max: O.OBS_DENSE_MAX, nowMs: NG, dense: true, perVar: 'split' });
      pts += 1;
      if (json(cubeObsOf(newL, NG)) === json(cubeObsOf(oldL, NG)) && json(newL) === json(oldL)) same += 1;
      if (json(strip(newL)) === json(oldL)) sameStripped += 1;
      if (newL.some((x) => x.parts?.length)) withParts += 1;
      for (const x of newL) for (const part of x.parts ?? []) { partsN += 1; if (!O.obsFullPoint(part.point) && part.point.precipitation != null && part.obs.rr10 != null) rainOnlyParts += 1; }
      // the six full stations (?dense=0)
      const o6 = O.nearestObsStations(sGood, p.lat, p.lon, p.country, { max: 6, nowMs: NG }), n6 = O.nearestObsStations(sGood, p.lat, p.lon, p.country, { max: 6, nowMs: NG, perVar: 'split' });
      if (json(strip(n6)) === json(o6)) sameSix += 1;
    }
    add('(15) gutes Fenster (574ef48, 10:21 UTC): an JEDEM Punkt dieselben Stationen in derselben Reihenfolge mit denselben Messungen am Stempel (Liste ohne `parts` byte-gleich zum Leser vor V-AF-9), dichter Satz und die sechs vollen Stationen',
      pts > 500 && sameStripped === pts && sameSix === pts, `${pts} Punkte (8 Städte + ${de.length} Stationsorte)`);
    add('(15) … und an jedem Punkt, dessen Satz keine Station mit `older` enthält, ist die ganze Ausgabe byte-gleich (Liste UND CubeObs); im Auszug ist JEDE Zusatzmessung der übrigen Punkte eine reine Niederschlagsmessung des umgekehrten Falls (17) — in den vollen Versionen kommen 1–2 Stationen mit Wind 50 min hinter dem Stempel dazu (Wiederholung B)',
      same + withParts === pts && same > pts / 3 && withParts > 0 && partsN > 0 && rainOnlyParts === partsN, `${same} byte-gleich, ${withParts} mit Zusatzmessung; ${rainOnlyParts}/${partsN} Zusatzmessungen nur rr`);
    add('(15) Negativkontrolle: im schlechten Fenster ist die Ausgabe an einem Stadtpunkt NICHT gleich (der Vergleich kann anschlagen)',
      json(cubeObsOf(O.nearestObsStations(sBad, 48.137, 11.575, 'DE', { max: O.OBS_DENSE_MAX, nowMs: NB, dense: true, perVar: 'split' }), NB)) !== json(cubeObsOf(O.nearestObsStations(sBad, 48.137, 11.575, 'DE', { max: O.OBS_DENSE_MAX, nowMs: NB, dense: true }), NB)));
  }

  // ── (16) age limit ────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const e = bad.stations['de:03379'], muc = catalog.stations.find((s) => s.id === 'de:03379');
    const tMs = Date.parse(e.older.t.t);
    const at = (nowMs) => O.obsVarsOf(e, nowMs)?.vars.t ?? null;
    const viaList = (nowMs) => cubeObsOf(O.nearestObsStations(sBad, muc.lat, muc.lon, 'DE', { max: 1, nowMs, dense: true, perVar: 'split' }), nowMs).some((o) => o.temperature != null);
    add(`(16) Altersgrenze ${O.OBS_VAR_MAX_AGE_MS / 60_000} min (set): ein Wert aus older genau an der Grenze wird benutzt, eine Minute älter nicht — in obsVarsOf und in der Stationsliste`,
      O.OBS_VAR_MAX_AGE_MS === 90 * 60_000 && at(tMs + O.OBS_VAR_MAX_AGE_MS)?.v === e.older.t.v && at(tMs + O.OBS_VAR_MAX_AGE_MS + 60_000) === null
      && viaList(tMs + O.OBS_VAR_MAX_AGE_MS) === true && viaList(tMs + O.OBS_VAR_MAX_AGE_MS + 60_000) === false);
    add('(16) ein older-Stempel, der nicht älter als der Stationsstempel ist, oder ein unlesbarer, wird nicht benutzt; ohne 10-min-Stempel null',
      O.obsVarsOf({ t: e.t, v: {}, older: { t: { v: 1, t: e.t } } }, NB).vars.t === undefined && O.obsVarsOf({ t: e.t, v: {}, older: { t: { v: 1, t: 'gestern' } } }, NB).vars.t === undefined && O.obsVarsOf({ v: { t: 1 } }, NB) === null);
  }

  // ── (17) reverse case ─────────────────────────────────────────────────────────────────────────────────────────────
  {
    const rev = de.filter((s) => good.stations[s.id]?.older?.rr && !isNum(good.stations[s.id]?.v?.rr));
    let ok = 0, oldNull = 0;
    for (const st of rev) {
      const e = good.stations[st.id];
      const cs = obsOfStation(sGood, st, NG, { perVar: 'split' });
      const r = cs.filter((o) => o.rr10 != null);
      if (r.length === 1 && r[0].rr10 === e.older.rr.v && r[0].validAtMs === Date.parse(e.older.rr.t) && r[0].temperature === null && r[0].u === null) ok += 1;
      if (obsOfStation(sGood, st, NG, {}).every((o) => o.rr10 == null)) oldNull += 1;
    }
    add('(17) umgekehrter Fall (gutes Fenster): Stationen mit rr nur in older liefern dichtes rr10 mit dem Stempel des Niederschlags, als eigene Messung ohne T/Wind; beim Leser vor V-AF-9 ist rr10 dort null',
      rev.length >= 15 && ok === rev.length && oldNull === rev.length, `${ok}/${rev.length} Stationen`);
  }

  // ── (18) fallback per variable, stale product ─────────────────────────────────────────────────────────────────────
  {
    const muc = catalog.stations.find((s) => s.id === 'de:03379');
    const raw = rawOf(good.stations['de:03379']);
    const bsResp = { weather: { timestamp: good.stations['de:03379'].t, source_id: 1, temperature: raw.t.v, wind_speed_10: raw.ff.v * 3.6, wind_direction_10: raw.dd.v, wind_gust_speed_10: raw.fx.v * 3.6, relative_humidity: raw.rh.v, precipitation_10: raw.rr.v }, sources: [{ id: 1, lat: muc.lat, lon: muc.lon, height: muc.elev, station_name: muc.name, dwd_station_id: '03379', wmo_station_id: '10865' }] };
    // a product whose German entries carry NO temperature (cut, not edited): only the gauges of the bad-window version
    const noT = { ...FIX.bad.latest, stations: Object.fromEntries(Object.entries(FIX.bad.latest.stations).filter(([, e]) => !rawOf(e).t)) };
    const count = { obs: 0, bs: 0 };
    let bsHang = false;
    const mk = (latestDoc, storeStatus = 200) => async (url, init) => {
      const u = String(url);
      // a BrightSky that never answers: the request ends only when its signal aborts
      if (bsHang && u.includes('api.brightsky.dev/current_weather')) { count.bs += 1; return new Promise((_, reject) => { init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }); }); }
      if (u.includes('/obs/v1/')) { count.obs += 1; if (storeStatus !== 200) return resp('', storeStatus); return resp(u.endsWith('stations.json') ? FIX.catalog : latestDoc); }
      if (u.includes('api.brightsky.dev/current_weather')) { count.bs += 1; return resp(bsResp); }
      return resp('', 404);
    };
    const q = { lat: 48.137, lng: 11.575 };
    const run = async (latestDoc, opt, storeStatus) => {
      const notes = [];
      O.resetObsMemo(); count.obs = 0; count.bs = 0;
      globalThis.fetch = mk(latestDoc, storeStatus);
      try { return { list: await fetchNearestStationObs(q.lat, q.lng, 'DE', O.OBS_DENSE_MAX, undefined, { near: true, station: { id: '10865', lat: muc.lat, lon: muc.lon }, nowMs: NB, dense: true, onNote: (n) => notes.push(n), ...opt }), notes, obs: count.obs, bs: count.bs }; }
      finally { globalThis.fetch = realFetch; O.resetObsMemo(); }
    };
    const a = await run(noT, { perVar: 'split' });
    const fb = a.list.filter((x) => x.via === 'bs-var');
    const csA = cubeObsOf(a.list, NB);
    add('(18) Satz ohne jede Temperatur ⇒ genau die 2 gezielten BrightSky-Anfragen (Station des Punkts + nächste Station), NUR die Temperatur übernommen (kein Wind, keine Böe, keine Feuchte, kein Niederschlag), `via bs-var`; die Stationen des Produkts bleiben',
      a.obs === 2 && a.bs === 2 && fb.length === 1 && fb[0].point.temperature === raw.t.v && fb[0].point.u === null && fb[0].point.v === null && fb[0].point.gust === null && fb[0].point.relativeHumidity === null && fb[0].point.precipitation === null
      && a.list.filter((x) => x.via === 'obs').length === O.OBS_DENSE_MAX && csA.filter((o) => o.temperature != null).length === 1 && csA.find((o) => o.temperature != null).via === 'bs-var' && a.notes.some((n) => /Temperatur gezielt von BrightSky/.test(n)),
      `obs ${a.obs}, BrightSky ${a.bs}; ${a.notes.find((n) => /BrightSky/.test(n)) ?? ''}`);
    const b = await run(FIX.bad.latest, { perVar: 'split' });
    add('(18) Satz mit Temperatur (schlechtes Fenster, T aus older) ⇒ 0 BrightSky-Anfragen, 2 Produktanfragen', b.obs === 2 && b.bs === 0 && cubeObsOf(b.list, NB).some((o) => o.temperature != null && o.via === 'obs') && b.list.every((x) => x.via === 'obs'), `obs ${b.obs}, BrightSky ${b.bs}`);
    const c = await run(noT, { perVar: false });
    add('(18) Negativkontrolle: derselbe Satz ohne Temperatur beim Leser vor V-AF-9 (perVar false = ?obsvar=0) ⇒ 0 BrightSky-Anfragen, keine Temperatur (das war V-AF-9)', c.bs === 0 && c.list.length === O.OBS_DENSE_MAX && !cubeObsOf(c.list, NB).some((o) => o.temperature != null));
    // stale product: builtAt older than the limit ⇒ treated as failed ⇒ direct fetch (20 raster + 2 targeted), named
    const lim = O.OBS_PRODUCT_MAX_AGE_MS;
    const d = await run(FIX.bad.latest, { perVar: 'split', nowMs: NB + lim + 60_000 });
    const e = await run(FIX.bad.latest, { perVar: 'split', nowMs: NB + lim });
    add(`(18) veraltetes Produkt: builtAt ${lim / 60_000} min + 1 min alt ⇒ wie ein Fehler: Direktabruf (22 BrightSky-Anfragen, Ergebnis ohne \`via\`), in der Notiz benannt; genau an der Grenze noch das Produkt`,
      lim === 30 * 60_000 && d.bs === 22 && d.list.length >= 1 && d.list.every((x) => x.via === undefined) && d.notes.some((n) => /min alt \(Grenze 30 min\) — Direktabruf/.test(n)) && e.bs === 0 && e.list.every((x) => x.via === 'obs'),
      d.notes.find((n) => /alt/.test(n)) ?? '');
    const f = await run(FIX.bad.latest, { perVar: false, nowMs: NB + lim + 60_000 });
    add('(18) … der Leser vor V-AF-9 prüft das Alter des Produkts nicht (byte-gleiches Verhalten hinter ?obsvar=0)', f.bs === 0 && f.list.every((x) => x.via === 'obs'));
    const g = await run(FIX.bad.latest, { perVar: 'split' }, 500);
    add('(18) Produkt antwortet 500 ⇒ wie bisher: benannter Rückfall auf den Direktabruf (22 Anfragen)', g.bs === 22 && g.list.every((x) => x.via === undefined) && g.notes.some((n) => /Direktabruf/.test(n)), `BrightSky ${g.bs}`);
    // a BrightSky that hangs must not cost the stations of the product: the fallback has its own deadline
    bsHang = true;
    const t0 = performance.now();
    const i = await run(noT, { perVar: 'split' });
    const waited = performance.now() - t0;
    bsHang = false;
    add(`(18) BrightSky antwortet nicht ⇒ der Rückfall bricht nach ${S.OBS_VAR_FALLBACK_TIMEOUT_MS} ms ab, die ${O.OBS_DENSE_MAX} Stationen des Produkts bleiben, keine Temperatur, im Vermerk benannt`,
      i.bs === 2 && i.list.length === O.OBS_DENSE_MAX && i.list.every((x) => x.via === 'obs') && waited >= S.OBS_VAR_FALLBACK_TIMEOUT_MS - 50 && waited < S.OBS_VAR_FALLBACK_TIMEOUT_MS + 1500 && i.notes.some((n) => /kein Temperatur-Anker/.test(n)), `${Math.round(waited)} ms`);
    // the default of the live path: the merged point, one entry per station, no parts
    const h = await run(FIX.bad.latest, { dense: false });
    add('(18) Voreinstellung des Live-Pfads (ohne perVar-Angabe, ohne dense): EIN Punkt je Station mit dem jüngsten Wert je Größe (merge), keine `parts`, volle Stationen mit Temperatur',
      h.list.length === O.OBS_DENSE_MAX && h.list.every((x) => x.parts === undefined && x.via === 'obs') && h.list.filter((x) => x.point.temperature != null).length >= 3 && h.bs === 0);
    // … but never toward the engine: the dense set without a perVar option reads split (no value on a foreign stamp)
    const hd = await run(FIX.bad.latest, {});
    const e03379 = bad.stations['de:03379'];
    add('(18) Voreinstellung mit dense (der Satz des Motors): split, nie merge — München-Stadt trägt `parts`, und keine Messung legt die Temperatur von 09:50 auf den Stempel 10:20',
      hd.list.some((x) => x.parts?.length) && !cubeObsOf(hd.list, NB).some((o) => o.stationId === '03379' && o.temperature != null && o.validAtMs === Date.parse(e03379.t)));
  }

  // ── (19) display consumers, the switch, the cache key ─────────────────────────────────────────────────────────────
  {
    const e = bad.stations['de:03379'];
    const live = O.obsStationLive(sBad, '03379', NB), liveOld = O.obsStationLive(sBad, '03379', NB, false);
    add('(19) Popup München-Stadt im schlechten Fenster: T, Wind aus older MIT eigener Zeit (temperatureAt/windAt 09:50Z), Niederschlag am Stempel ohne Zusatz, obsAt 10:20Z; hinter ?obsvar=0 ohne Temperatur und ohne Zeitfelder',
      live.temperature === e.older.t.v && live.temperatureAt === e.older.t.t && live.windSpeed === e.older.ff.v && live.windDirection === e.older.dd.v && live.windAt === e.older.ff.t && live.precipitationAt === null && Math.abs(live.precipitation - e.v.rr * 6) < 1e-9 && live.obsAt === e.t
      && liveOld.temperature === null && liveOld.temperatureAt === undefined && liveOld.obsAt === undefined);
    const gl = O.obsStationLive(sGood, '03379', NG);
    add('(19) Popup im guten Fenster: Werte am Stempel, kein Zeit-Zusatz', gl.temperature === good.stations['de:03379'].v.t && gl.temperatureAt === null && gl.windAt === null && gl.obsAt === good.stations['de:03379'].t);
    // the popup merges a later answer over the feature's values ({ ...feature, ...live }): the later answer must clear the older time
    const stale = O.obsStationFeatures(sBad, NB).find((f) => f.properties.dwdStationId === '03379').properties;
    const mergedPopup = { ...stale, ...gl };
    add('(19) Karte im schlechten Fenster geladen, Klick im guten: die Zeitangabe der Temperatur von vorher bleibt NICHT neben dem neuen Wert stehen (die spätere Antwort setzt sie auf null)',
      stale.temperatureAt === e.older.t.t && mergedPopup.temperature === gl.temperature && mergedPopup.temperatureAt === null && mergedPopup.windAt === null && mergedPopup.obsAt === good.stations['de:03379'].t);
    const gridNew = O.obsGridOf(sBad, 'DE', NB).points[0], gridOld = O.obsGridOf(sBad, 'DE', NB, O.OBS_MAX_AGE_MS, false).points[0];
    const tNew = gridNew.filter((p) => p.temperature != null).length, tOld = gridOld.filter((p) => p.temperature != null).length;
    add('(19) Raster der Rasterfusion im schlechten Fenster: mit dem jüngsten Wert je Größe tragen alle T-Stationen eine Temperatur, vorher fast keine; im guten Fenster gleich viele Stationen wie vorher',
      tNew >= 110 && tOld <= 2 && O.obsGridOf(sGood, 'DE', NG).points[0].length === O.obsGridOf(sGood, 'DE', NG, O.OBS_MAX_AGE_MS, false).points[0].length, `T-Stationen ${tOld} → ${tNew}`);
    const feats = O.obsStationFeatures(sBad, NB), featsOld = O.obsStationFeatures(sBad, NB, O.OBS_MAX_AGE_MS, false);
    add('(19) Karten-Stationen: dieselbe Stationszahl wie vorher; eine Temperatur mit eigener Zeit, wo sie nicht am Stempel steht',
      feats.length === featsOld.length && feats.filter((f) => f.properties.temperatureAt).length >= 110 && !featsOld.some((f) => f.properties.temperatureAt || f.properties.obsAt));
    add('(19) Schalter: ?obsvar=0 ⇒ aus, sonst an; der Cache-Schlüssel trägt den Rückfall (ohne Schalter kein Anhang)',
      P.pfObsVarFrom('?obsvar=0') === false && P.pfObsVarFrom('') === true && P.pfObsVarFrom('?obsvar=1') === true && E.cubeIoVariantKey({ obsPerVar: false }).includes('obsvar0') && E.cubeIoVariantKey({}) === '');
  }
}

/** --live: the share of German temperature stations of the catalogue whose temperature the per-variable reader hands on now. */
export async function liveVaf9({ add, O }) {
  O.resetObsMemo();
  const s = await O.loadObsStore();
  const now = Date.now();
  const cat = s.catalog.stations.filter((st) => st.country === 'DE' && st.vars.includes('t') && st.networks.includes('dwd10'));
  let at = 0, older = 0, active = 0;
  for (const st of cat) {
    const e = s.latest.stations[st.id];
    // a station whose stamp is older than the readers' age limit is not handed on — it counts on neither side
    if (!(e?.t && now - Date.parse(e.t) <= O.OBS_MAX_AGE_MS)) continue;
    active += 1;
    const t = O.obsVarsOf(e, now)?.vars.t;
    if (t) { if (t.older) older += 1; else at += 1; }
  }
  const ageMin = Math.round((now - Date.parse(s.latest.builtAt)) / 60_000);
  add('(19) --live: ≥ 95 % der deutschen Temperaturstationen des Katalogs (10-min-Netz, mit aktuellem Stempel) liefern jetzt eine Temperatur — am Stempel oder aus older innerhalb der Grenze',
    active > 300 && (at + older) / active >= 0.95, `${at + older}/${active} (am Stempel ${at}, aus older ${older}; Katalog ${cat.length}); latest.json ${ageMin} min alt (${s.latest.builtAt})`);
}
