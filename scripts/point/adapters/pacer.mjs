/**
 * pacer.mjs — Taktung und Gleichzeitigkeitsdeckel je Host, nebenläufigkeitsfest (PD-F2a).
 *
 * ── Warum das alte `pace()` unter Nebenläufigkeit versagt ───────────────────
 * Es las `lastAt` VOR dem `await` und schrieb es DANACH. Zwei gleichzeitige Aufrufer sahen
 * denselben alten Zeitstempel, warteten dieselbe Frist — und feuerten dann gleichzeitig.
 * Sequenziell (bis PD-F2a) war das unsichtbar; mit einer Bahn je Quelle (F2b) würde der
 * 600-ms-Abstand zu `data.ecmwf.int` zum Burst, und ein Burst ist genau das, was Lauf 7
 * des Crons mit HTTP 429 beendet hat.
 *
 * ── Was hier steht ──────────────────────────────────────────────────────────
 * Eine FIFO je Host: jeder Aufrufer hängt sich an das Ende der Kette, bekommt seinen Slot
 * frühestens `minMs` nach der VERGABE des vorigen (nicht nach dessen Antwort) und setzt den
 * Zeitstempel erst, wenn er den Slot hat. Dazu ein Semaphor je Host (`maxInflight`), damit
 * nicht zwanzig Bahnen zwanzig Verbindungen zu einem Server halten, auch wenn der Takt eingehalten ist.
 *
 * Reine Funktionen über Zeit und Promises — netzfrei testbar (`makePacer` mit kleinem `minMs`).
 */

/**
 * Takt- und Deckelgeber für EINEN Host.
 * @param {number} minMs Mindestabstand zwischen zwei Vergaben (0 = kein Takt).
 * @param {number} maxInflight Höchstzahl gleichzeitig laufender Anfragen (Infinity = kein Deckel).
 * @param {() => number} now Uhr (injizierbar für Tests).
 */
export function makePacer(minMs = 0, maxInflight = Infinity, now = Date.now) {
  let chain = Promise.resolve();   // FIFO der Vergaben
  let lastGrant = -Infinity;       // Zeitpunkt der letzten Vergabe
  let inflight = 0;
  const waiters = [];              // wer auf einen freien Platz unter dem Deckel wartet
  const stats = { granted: 0, waitedMs: 0, maxInflightSeen: 0 };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Einen Slot holen. Löst auf, sobald Takt UND Deckel es erlauben. Gibt `release()` zurück. */
  function acquire() {
    const t0 = now();
    const mine = chain.then(async () => {
      // Takt: frühestens minMs nach der letzten Vergabe.
      const wait = minMs > 0 ? minMs - (now() - lastGrant) : 0;
      if (wait > 0) await sleep(wait);
      // Deckel: warten, bis ein Platz frei ist (FIFO über `waiters`).
      if (inflight >= maxInflight) await new Promise((r) => waiters.push(r));
      inflight++;
      lastGrant = now();
      stats.granted++;
      stats.waitedMs += lastGrant - t0;
      stats.maxInflightSeen = Math.max(stats.maxInflightSeen, inflight);
    });
    // Die Kette darf durch einen abgebrochenen Aufrufer nicht reißen.
    chain = mine.catch(() => {});
    let released = false;
    return mine.then(() => () => {
      if (released) return;
      released = true;
      inflight--;
      const next = waiters.shift();
      if (next) next();
    });
  }

  /** `fn` innerhalb eines Slots ausführen — der Slot wird auch bei einem Fehler freigegeben. */
  async function run(fn) {
    const release = await acquire();
    try { return await fn(); } finally { release(); }
  }

  return { acquire, run, stats: () => ({ ...stats, inflight }) };
}

/**
 * Pacer je Host aus einer Tabelle `{ host: minMs }` und `{ host: maxInflight }`.
 * Unbekannte Hosts bekommen weder Takt noch Deckel (wie bisher: `HOST_MIN_MS[host] ?? 0`).
 */
export function makeHostPacers(minMsByHost, maxInflightByHost = {}, now = Date.now) {
  const pacers = new Map();
  const hostOf = (url) => { try { return new URL(url).host; } catch { return null; } };
  function forUrl(url) {
    const host = hostOf(url);
    if (!host) return null;
    const min = minMsByHost[host] ?? 0;
    const max = maxInflightByHost[host] ?? Infinity;
    if (!min && max === Infinity) return null;
    if (!pacers.has(host)) pacers.set(host, makePacer(min, max, now));
    return pacers.get(host);
  }
  /** `fn` im Takt des Hosts ausführen; ohne Takt/Deckel direkt. */
  async function run(url, fn) {
    const p = forUrl(url);
    return p ? p.run(fn) : fn();
  }
  return { forUrl, run, stats: () => Object.fromEntries([...pacers].map(([h, p]) => [h, p.stats()])) };
}

/** Netzfreier Selbsttest — beweist Takt, Deckel, Reihenfolge und Freigabe im Fehlerfall. */
export async function pacerSelfTest() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

  // (1) Takt: zehn gleichzeitige Aufrufer, Vergaben paarweise ≥ minMs auseinander.
  {
    const p = makePacer(20);
    const grants = [];
    await Promise.all(Array.from({ length: 10 }, () => p.run(async () => { grants.push(Date.now()); })));
    const gaps = grants.slice(1).map((t, i) => t - grants[i]);
    add('Takt: 10 gleichzeitige Aufrufer, Abstände >= minMs (Toleranz 2 ms)', gaps.every((g) => g >= 18), `min ${Math.min(...gaps)} ms`);
    add('Takt: keine Vergabe verloren', p.stats().granted === 10);
  }
  // (2) Deckel: höchstens 2 gleichzeitig, auch bei 8 langsamen Aufrufern.
  {
    const p = makePacer(0, 2);
    let live = 0, peak = 0;
    await Promise.all(Array.from({ length: 8 }, () => p.run(async () => {
      live++; peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
    })));
    add('Deckel: höchstens maxInflight gleichzeitig', peak === 2 && p.stats().maxInflightSeen === 2, `peak ${peak}`);
    add('Deckel: alle Plätze wieder frei', p.stats().inflight === 0);
  }
  // (3) Fehler gibt den Platz frei — der nächste kommt trotzdem dran.
  {
    const p = makePacer(0, 1);
    let second = false;
    await p.run(async () => { throw new Error('absichtlich'); }).catch(() => {});
    await p.run(async () => { second = true; });
    add('Fehler gibt den Slot frei', second && p.stats().inflight === 0);
  }
  // (4) Reihenfolge: FIFO — wer zuerst fragt, bekommt zuerst.
  {
    const p = makePacer(5);
    const order = [];
    await Promise.all([1, 2, 3, 4].map((i) => p.run(async () => { order.push(i); })));
    add('FIFO: Vergabe in Anfragereihenfolge', order.join('') === '1234', order.join(''));
  }
  // (5) Negativ-Kontrolle: das alte Muster (lesen VOR dem await) bündelt Aufrufer.
  {
    let lastAt = 0;
    const oldPace = async (min) => {
      const wait = min - (Date.now() - lastAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastAt = Date.now();
    };
    const grants = [];
    await Promise.all(Array.from({ length: 5 }, () => oldPace(20).then(() => grants.push(Date.now()))));
    const gaps = grants.slice(1).map((t, i) => t - grants[i]);
    add('Negativ-Kontrolle: das alte pace() haelt den Abstand NICHT', gaps.some((g) => g < 15), `min ${Math.min(...gaps)} ms`);
  }
  // (6) Host-Tabelle: unbekannter Host läuft ungetaktet, bekannter im Takt.
  {
    const hp = makeHostPacers({ 'a.example': 10 }, { 'a.example': 1 });
    add('Host ohne Eintrag: kein Pacer', hp.forUrl('https://b.example/x') === null);
    add('Host mit Eintrag: Pacer', hp.forUrl('https://a.example/x') !== null);
    add('kaputte URL: kein Pacer, kein Wurf', hp.forUrl('nicht-eine-url') === null);
    let ran = false;
    await hp.run('https://b.example/x', async () => { ran = true; });
    add('run() ohne Pacer führt direkt aus', ran);
  }
  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}
