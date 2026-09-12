/**
 * lanes.mjs — Bahnen je Quelle mit geordneter Zusammenführung (PD-F2b).
 *
 * ── Das Problem ─────────────────────────────────────────────────────────────
 * Die Fusionsschleife des Producers fragte je (Stunde, Größe) jede Quelle NACHEINANDER ab
 * (`await field(...)` in der innersten Schleife). Gemessen (§49.2, t1 kalt): Netz 626 s +
 * Rechnen 633 s = 1 259 s — Netz und Rechnen überlappten sich zu keiner Sekunde.
 *
 * ── Die Regel, die byte-gleiche Chunks garantiert ───────────────────────────
 * Zwei Dinge dürfen sich NICHT ändern: (1) die Reihenfolge der Quellen im Mittel — die
 * FP-Summen `sum += v` laufen über `grids` in Beiträger-Ordnung, eine andere Ordnung kippt
 * beim Quantisieren das letzte Bit; (2) die Entakkumulation je Quelle — `accPrev` ist eine
 * strikte Rekurrenz von Stunde zu Stunde (`Summe[t] − Summe[t−Δ]`), also darf die Stunde
 * `it+1` einer Quelle erst nach ihrer Stunde `it` laufen.
 *
 * Deshalb: **eine sequenzielle Bahn je Quelle** (Rekurrenz bleibt, weil nur die eigene Bahn
 * den eigenen Zustand berührt), Bahnen untereinander gleichzeitig (Netz überlappt), und ein
 * **Verbraucher in Stundenordnung**, der die Ergebnisse einer Stunde in **Bahnen-Ordnung**
 * entgegennimmt — genau die Ordnung, die die sequenzielle Schleife hatte.
 *
 * `ahead` begrenzt, wie viele Stunden eine Bahn dem Verbraucher vorauslaufen darf (Speicher:
 * je Stunde und Quelle bis zu 9 Größen × 194 KB in Stufe 1).
 *
 * Reine Steuerlogik ohne Netz und Dateisystem — netzfrei testbar (`lanesSelfTest`).
 */

/**
 * `Promise.allSettled` mit Ergebnis in EINGABE-Ordnung — nie in Fertigstellungsordnung.
 * Für die Laufsuche je Quelle: der Index `ci` ist tragend (srcMask-Bit, Ensemble-Priorität).
 * @returns {Promise<Array<{ ok: boolean, value?: any, error?: Error }>>}
 */
export async function orderedSettle(items, fn) {
  const settled = await Promise.allSettled(items.map((x, i) => fn(x, i)));
  return settled.map((s) => (s.status === 'fulfilled' ? { ok: true, value: s.value } : { ok: false, error: s.reason }));
}

/**
 * Bahnen fahren, Verbraucher in Ordnung bedienen.
 *
 * @param {object} o
 * @param {number} o.nLanes   Zahl der Bahnen (Quellen).
 * @param {number} o.nSteps   Zahl der Stunden.
 * @param {(lane: number, it: number) => Promise<any>} o.task   Arbeit einer Bahn für eine Stunde.
 *   Darf werfen — der Fehler landet als `{ error }` beim Verbraucher, die Bahn läuft weiter.
 * @param {(it: number, values: any[]) => (void|Promise<void>)} o.consume   Verbraucher; `values[lane]`
 *   in Bahnen-Ordnung, genau einmal je Stunde, in aufsteigender Stundenordnung.
 * @param {number} [o.ahead=3]   Höchstens so viele Stunden darf eine Bahn dem Verbraucher voraus sein.
 * @returns {Promise<{ maxAhead: number, laneMs: number[], consumeMs: number, steps: number }>}
 */
export async function runLanes({ nLanes, nSteps, task, consume, ahead = 3 }) {
  if (!(nLanes >= 0) || !(nSteps >= 0)) throw new Error('runLanes: nLanes/nSteps müssen ≥ 0 sein');
  if (!(ahead >= 1)) throw new Error('runLanes: ahead muss ≥ 1 sein');
  const ready = Array.from({ length: nSteps }, () => new Array(nLanes));
  const arrived = new Int32Array(nSteps);
  const stepDone = Array.from({ length: nSteps }, () => {
    let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve };
  });
  if (nLanes === 0) for (const s of stepDone) s.resolve();
  let consumed = -1;                 // letzte verbrauchte Stunde
  let advanced = null;               // Promise, das beim nächsten Verbrauch auflöst
  let advance = () => {};
  const nextAdvance = () => { advanced = new Promise((r) => { advance = r; }); };
  nextAdvance();
  const stats = { maxAhead: 0, laneMs: new Array(nLanes).fill(0), consumeMs: 0, steps: nSteps };

  const lane = async (l) => {
    for (let it = 0; it < nSteps; it++) {
      // Rückstau: nicht weiter als `ahead` Stunden vor dem Verbraucher.
      while (it - consumed > ahead) await advanced;
      stats.maxAhead = Math.max(stats.maxAhead, it - consumed);
      const t0 = Date.now();
      let v;
      try { v = await task(l, it); } catch (e) { v = { error: e instanceof Error ? e : new Error(String(e)) }; }
      stats.laneMs[l] += Date.now() - t0;
      ready[it][l] = v;
      if (++arrived[it] === nLanes) stepDone[it].resolve();
    }
  };
  const consumer = async () => {
    for (let it = 0; it < nSteps; it++) {
      await stepDone[it].promise;
      const t0 = Date.now();
      await consume(it, ready[it]);
      stats.consumeMs += Date.now() - t0;
      ready[it] = null;              // Speicher der Stunde freigeben
      consumed = it;
      const wake = advance; nextAdvance(); wake();
    }
  };
  await Promise.all([consumer(), ...Array.from({ length: nLanes }, (_, l) => lane(l))]);
  return stats;
}

/** Netzfreier Selbsttest — beweist Ordnung, Rekurrenz, Rückstau und Fehlerweg. */
export async function lanesSelfTest() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Deterministischer Pseudozufall, damit der Test reproduzierbar ist.
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  // Modell: 4 Quellen, 12 Stunden, je Quelle eine akkumulierte Summe S(it) = S(it−1) + Zuwachs;
  // die Bahn liefert die RATE S(it) − S(it−1) (Rekurrenz je Quelle wie bei precip).
  const nLanes = 4, nSteps = 12;
  const inc = Array.from({ length: nLanes }, () => Array.from({ length: nSteps }, () => Math.round(rnd() * 100)));
  const sequential = () => {
    const out = [];
    const prev = new Array(nLanes).fill(0);
    for (let it = 0; it < nSteps; it++) {
      const vals = [];
      for (let l = 0; l < nLanes; l++) { const s = prev[l] + inc[l][it]; vals.push(s - prev[l]); prev[l] = s; }
      out.push(vals.reduce((a, b) => a + b * (1 + 0.1 * vals.indexOf(b)), 0));   // ordnungsabhängig!
    }
    return out;
  };
  const expected = sequential();

  // (1) Bahnen mit zufälligen Latenzen: Verbraucher sieht dieselben Werte in derselben Ordnung.
  {
    const prev = new Array(nLanes).fill(0);
    const consumedAt = [];
    const got = [];
    const stats = await runLanes({
      nLanes, nSteps, ahead: 3,
      task: async (l, it) => { await sleep(1 + rnd() * 6); const s = prev[l] + inc[l][it]; const rate = s - prev[l]; prev[l] = s; return rate; },
      consume: (it, vals) => { consumedAt.push(it); got.push(vals.reduce((a, b) => a + b * (1 + 0.1 * vals.indexOf(b)), 0)); },
    });
    add('Bahnen: Verbraucher läuft in Stundenordnung 0…n−1', consumedAt.join(',') === Array.from({ length: nSteps }, (_, i) => i).join(','));
    add('Bahnen: Werte je Stunde in Bahnen-Ordnung ⇒ identisch zur sequenziellen Schleife', JSON.stringify(got) === JSON.stringify(expected));
    add('Bahnen: Rückstau eingehalten (maxAhead ≤ ahead)', stats.maxAhead <= 3, `maxAhead ${stats.maxAhead}`);
    add('Bahnen: Bahnen liefen gleichzeitig (Summe Bahnzeit > Wandzeit-Anteil)', stats.laneMs.reduce((a, b) => a + b, 0) > Math.max(...stats.laneMs), stats.laneMs.join('/'));
  }
  // (2) Rekurrenz je Bahn: Stunde it+1 einer Bahn beginnt nie vor Ende ihrer Stunde it.
  {
    const running = new Array(nLanes).fill(false); let overlap = false; const order = Array.from({ length: nLanes }, () => []);
    await runLanes({
      nLanes, nSteps: 6, ahead: 2,
      task: async (l, it) => { if (running[l]) overlap = true; running[l] = true; order[l].push(it); await sleep(2 + rnd() * 4); running[l] = false; return it; },
      consume: () => {},
    });
    add('Rekurrenz: je Bahn strikt sequenziell', !overlap && order.every((o) => o.join(',') === '0,1,2,3,4,5'));
  }
  // (3) Rückstau greift: eine schnelle Bahn wartet auf einen langsamen Verbraucher.
  {
    let peak = 0, consumedIt = -1;
    const stats = await runLanes({
      nLanes: 1, nSteps: 10, ahead: 2,
      task: async (l, it) => { peak = Math.max(peak, it - consumedIt); return it; },
      consume: async (it) => { await sleep(3); consumedIt = it; },
    });
    add('Rückstau: schnelle Bahn höchstens `ahead` Stunden voraus', peak <= 2 && stats.maxAhead <= 2, `peak ${peak}`);
  }
  // (4) Fehler einer Bahn erreicht den Verbraucher als { error } — die Bahn läuft weiter.
  {
    const seen = [];
    await runLanes({
      nLanes: 2, nSteps: 3, ahead: 3,
      task: async (l, it) => { if (l === 1 && it === 1) throw new Error('absichtlich'); return `${l}:${it}`; },
      consume: (it, vals) => seen.push(vals.map((v) => (v?.error ? 'ERR' : v)).join('|')),
    });
    add('Fehlerweg: { error } an der richtigen Stelle, restliche Stunden vollständig', seen.join(' ') === '0:0|1:0 0:1|ERR 0:2|1:2', seen.join(' '));
  }
  // (5) Randfälle.
  {
    let called = 0;
    await runLanes({ nLanes: 0, nSteps: 3, task: async () => {}, consume: () => { called++; } });
    add('Randfall: null Bahnen ⇒ Verbraucher läuft trotzdem je Stunde (leere Werte)', called === 3);
    let threw = false;
    try { await runLanes({ nLanes: 1, nSteps: 1, ahead: 0, task: async () => 1, consume: () => {} }); } catch { threw = true; }
    add('Randfall: ahead < 1 wird abgewiesen', threw);
  }
  // (6) orderedSettle: Ergebnis in Eingabeordnung trotz umgekehrter Latenzen; Fehler benannt.
  {
    const r = await orderedSettle([30, 20, 10, 0], async (ms, i) => { await sleep(ms); if (i === 1) throw new Error('nein'); return `v${i}`; });
    add('orderedSettle: Eingabeordnung, Fehler an seiner Stelle',
      r.length === 4 && r[0].value === 'v0' && r[1].ok === false && r[1].error.message === 'nein' && r[2].value === 'v2' && r[3].value === 'v3');
  }
  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}

/** Dasselbe Ergebnisformat wie `orderedSettle`, aber streng nacheinander — der Rückfall (`POINT_PARALLEL=0`). */
export async function sequentialSettle(items, fn) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    try { out.push({ ok: true, value: await fn(items[i], i) }); } catch (e) { out.push({ ok: false, error: e }); }
  }
  return out;
}
