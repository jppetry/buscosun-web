/**
 * DWD-Waldbrandgefahrenindex (WBI) und Graslandfeuerindex (GLFI) über den
 * bestehenden Rewrite `/_dwd_opendata`.
 *
 * ⚠️ Seit 2026-08-19 NICHT MEHR VERDRAHTET: der Layer „Amtliche Stufe"
 * (`fireIndexNational`) ist auf Jans Auftrag zurückgezogen. Modul und
 * Verifier bleiben erhalten und grün — die App ruft sie nicht mehr auf, das
 * Modul landet damit auch nicht mehr im Bundle.
 *
 * ── Warum das kein Einzeiler ist ─────────────────────────────────────────────
 * Der DWD veröffentlicht **kein** offenes Raster (`grids_germany/daily/
 * fire_danger_index/` → 404, in WB0 zweimal bestätigt). Offen ist nur die
 * Stations-CSV — und zwar als **484 Einzeldateien, eine je Station**, jede eine
 * Zeitreihe über 170 Termine, in der nur die **letzte** Zeile den aktuellen
 * Stand Tag 0…+6 trägt. Eine Sammeldatei gibt es nicht (Verzeichnisbaum
 * vollständig geprüft). Naiv geladen wären das 484 Requests je Sitzung.
 *
 * ── Die entschiedene Ladestrategie (V-200, Jan 2026-08-14) ───────────────────
 *  1. `stations_list.txt` **einmal je Sitzung** (98 KB) — die einzige Quelle der
 *     Koordinaten; die Wert-CSVs führen nur die `StationsID`.
 *  2. Wert-CSVs **nur für Stationen im Viewport**, **höchstens 60 gleichzeitig**,
 *     Tages-TTL.
 *  3. **Kein** verdichtender Warm-Cron — das wäre Transport-/Cron-Zone.
 *
 * ── Kein Durable-Cache ───────────────────────────────────────────────────────
 * Läuft bewusst über `/_dwd_opendata` (einfacher Rewrite) und **nicht** über
 * `/_dwd_grib` (Edge-Cache 6 h): `docs/API.md` §7 schließt Durable-Caching für
 * amtliche Gefahrenangaben aus.
 *
 * ── gzip ohne neue Abhängigkeit ──────────────────────────────────────────────
 * Der DWD liefert `.csv.gz` als **Nutzlast**, nicht als `Content-Encoding`
 * (in WB0 musste Node `gunzipSync` bemühen). Im Browser übernimmt das
 * `DecompressionStream('gzip')` — Plattform-Standard, keine Dependency (D-06).
 */

import type { DataRef } from '../../dataAge';

const BASE = '/_dwd_opendata/climate_environment/CDC/derived_germany/fire_danger_index';

export type FireIndexKind = 'woodland' | 'grassland';

/** Datei-Version je Produkt — in WB0 am Verzeichnislisting abgelesen. */
const VERSION: Record<FireIndexKind, string> = { woodland: 'v2-3--0', grassland: 'v2-0--0' };
/** Spaltenpräfix je Produkt. */
const PREFIX: Record<FireIndexKind, string> = { woodland: 'wbi', grassland: 'glfi' };

/** Höchstens so viele Stationen gleichzeitig nachladen (V-200). */
export const STATION_FETCH_CAP = 60;
/** Parallele Requests innerhalb eines Nachladens. */
const CONCURRENCY = 6;

export const DWD_FIRE_ATTRIBUTION =
  'Datenbasis: <a href="https://www.dwd.de/DE/leistungen/opendata/opendata.html" '
  + 'target="_blank" rel="noopener">Deutscher Wetterdienst</a>, Waldbrandgefahrenindex · CC BY 4.0';

export function stationsListUrl(kind: FireIndexKind): string {
  return `${BASE}/${kind}/forecast/recent/`
    + `derived_germany_fire_danger_index_${kind}_forecast_recent_${VERSION[kind]}_stations_list.txt`;
}

export function stationCsvUrl(kind: FireIndexKind, stationId: number | string): string {
  return `${BASE}/${kind}/forecast/recent/`
    + `derived_germany_fire_danger_index_${kind}_forecast_recent_${stationId}_${VERSION[kind]}.csv.gz`;
}

export interface FireStation {
  id: number;
  lat: number;
  lon: number;
  elevM: number;
  name: string;
  state: string;
}

/**
 * Parst `stations_list.txt`.
 *
 * Format (WB0 gemessen, Latin-1, semikolongetrennt, feste Spaltenbreiten):
 * `Stationsindex; Höhe in m;Breite   ;Länge    ;Name …;Bundesland …`
 * Beispielzeile: `           44;        44;    52.93;     8.24;Großenkneten…;Niedersachsen…`
 */
export function parseStationsList(text: string): FireStation[] {
  const out: FireStation[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const c = line.split(';');
    if (c.length < 6) continue;
    const id = Number(c[0].trim());
    const elevM = Number(c[1].trim());
    const lat = Number(c[2].trim());
    const lon = Number(c[3].trim());
    if (!Number.isFinite(id) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      id, lat, lon,
      elevM: Number.isFinite(elevM) ? elevM : 0,
      name: c[4].trim(),
      state: c[5].trim(),
    });
  }
  return out;
}

export interface StationIndex {
  stationId: number;
  /** Stufen für Tag 0…+6 — Länge 7, `null` wo die Quelle nichts liefert. */
  days: (number | null)[];
  /** `Termin` der letzten Zeile als Referenzzeit. */
  ref: DataRef | null;
}

/**
 * Parst eine Wert-CSV und nimmt **nur die letzte Datenzeile**.
 *
 * Kopf: `StationsID;Termin;wbi_0;…;wbi_6` (bzw. `glfi_*`).
 * Zeile: `991;20260226 04:13;1;1;2;2;2;3;2`
 * Die 169 älteren Zeilen sind Historie und werden verworfen — sie im Speicher
 * zu halten wäre bei 484 Stationen der teuerste Teil des Layers.
 */
export function parseStationCsv(text: string, kind: FireIndexKind): StationIndex | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;

  const header = lines[0].split(';').map((h) => h.trim().toLowerCase());
  const p = PREFIX[kind];
  const dayCols = Array.from({ length: 7 }, (_, d) => header.indexOf(`${p}_${d}`));
  const idCol = header.findIndex((h) => /^stations?id$/.test(h));
  const terminCol = header.indexOf('termin');
  if (idCol < 0 || dayCols.some((i) => i < 0)) return null;

  const last = lines[lines.length - 1].split(';');
  const stationId = Number(last[idCol]?.trim());
  if (!Number.isFinite(stationId)) return null;

  const days = dayCols.map((i) => {
    const v = Number(last[i]?.trim());
    // Stufen sind 1..5. Alles andere ist keine Stufe und wird nicht geraten.
    return Number.isFinite(v) && v >= 1 && v <= 5 ? v : null;
  });

  return { stationId, days, ref: parseTermin(last[terminCol]) };
}

/**
 * `Termin` kommt als `"20260226 04:13"` — kompaktes Datum, Uhrzeit, keine Zone.
 * Der DWD stempelt seine Läufe in UTC (der Lauf liegt bei ~04:20 UTC), deshalb
 * wird UTC angenommen. Unlesbar ⇒ `null`, dann behauptet die UI kein Alter.
 */
export function parseTermin(raw: string | undefined): DataRef | null {
  const m = raw?.trim().match(/^(\d{4})(\d{2})(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Number.isFinite(ms) ? { atMs: ms, kind: 'measured' } : null;
}

/** Entpackt eine `.csv.gz`-Antwort — oder reicht sie durch, falls der Proxy
 *  doch `Content-Encoding: gzip` gesetzt und der Browser schon ausgepackt hat. */
async function readMaybeGzip(res: Response): Promise<string> {
  const buf = new Uint8Array(await res.arrayBuffer());
  const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  if (!isGzip) return new TextDecoder('latin1').decode(buf);
  const stream = new Blob([buf as unknown as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  return new TextDecoder('latin1').decode(out);
}

// --- Caches -----------------------------------------------------------------
const _stations = new Map<FireIndexKind, Promise<FireStation[]>>();
const _values = new Map<string, { idx: StationIndex; at: number }>();
/** Tages-TTL: der DWD rechnet einmal täglich (~04:20 UTC). */
const VALUE_TTL = 6 * 3_600_000;

/**
 * Stationsliste — **ein** Abruf je Sitzung und Produkt.
 *
 * ⚠️ Bewusst ohne `AbortSignal`, aus demselben Grund wie bei `fetchBafu`: ein
 * geteilter Promise-Cache am Signal eines einzelnen Aufrufers vererbt dessen
 * Abbruch an alle späteren. Der Aufrufer prüft nach dem `await` sein eigenes
 * Signal und verwirft das Ergebnis, wenn er nicht mehr zuständig ist.
 */
export function fetchStations(kind: FireIndexKind): Promise<FireStation[]> {
  const hit = _stations.get(kind);
  if (hit) return hit;
  const p = fetch(stationsListUrl(kind))
    .then(async (res) => {
      if (!res.ok) throw new Error(`DWD Stationsliste: HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      return parseStationsList(new TextDecoder('latin1').decode(buf));
    })
    .catch((err) => { _stations.delete(kind); throw err; });
  _stations.set(kind, p);
  return p;
}

export interface StationValueLoad {
  values: Map<number, StationIndex>;
  /** Wie viele Stationen wurden wegen des Deckels NICHT geladen? */
  skipped: number;
  /** Älteste Referenzzeit der geladenen Stationen — konservativ. */
  ref: DataRef | null;
}

/**
 * Lädt die Werte für **höchstens `STATION_FETCH_CAP`** Stationen.
 *
 * Der Aufrufer übergibt die im Viewport sichtbaren Stationen, nach Wichtigkeit
 * sortiert (z. B. Bildmitte zuerst). Was über dem Deckel liegt, wird gezählt und
 * gemeldet — nicht stillschweigend weggelassen (D-04).
 */
export async function fetchStationValues(
  kind: FireIndexKind,
  stationIds: number[],
  signal?: AbortSignal,
): Promise<StationValueLoad> {
  const now = Date.now();
  const values = new Map<number, StationIndex>();
  const todo: number[] = [];

  for (const id of stationIds) {
    const hit = _values.get(`${kind}:${id}`);
    if (hit && now - hit.at < VALUE_TTL) values.set(id, hit.idx);
    else todo.push(id);
  }

  const take = todo.slice(0, Math.max(0, STATION_FETCH_CAP - values.size));
  const skipped = todo.length - take.length;

  let ptr = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, take.length) }, async () => {
    while (ptr < take.length) {
      if (signal?.aborted) return;
      const id = take[ptr++];
      try {
        const res = await fetch(stationCsvUrl(kind, id), { signal });
        if (!res.ok) continue;
        const idx = parseStationCsv(await readMaybeGzip(res), kind);
        if (idx) { values.set(id, idx); _values.set(`${kind}:${id}`, { idx, at: Date.now() }); }
      } catch {
        // Eine fehlende Station ist kein Layer-Fehler — sie bleibt einfach leer.
      }
    }
  });
  await Promise.all(workers);

  let oldest: DataRef | null = null;
  for (const v of values.values()) {
    if (v.ref && (oldest == null || v.ref.atMs < oldest.atMs)) oldest = v.ref;
  }
  return { values, skipped, ref: oldest };
}

export function resetDwdFireCache(): void { _stations.clear(); _values.clear(); }

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface DwdFireCheck { name: string; ok: boolean; detail?: string }

export async function verifyDwdFireIndex(): Promise<{ checks: DwdFireCheck[]; passed: number; total: number }> {
  const checks: DwdFireCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // --- URLs: der Weg entscheidet über den Durable-Cache (L1) ----------------
  add('läuft über /_dwd_opendata (kein Durable-Cache), NICHT über /_dwd_grib',
    stationsListUrl('woodland').startsWith('/_dwd_opendata/')
      && !stationsListUrl('woodland').includes('_dwd_grib'));
  add('Stationsliste trägt die gemessene Dateiversion',
    stationsListUrl('woodland').includes('v2-3--0_stations_list.txt')
      && stationsListUrl('grassland').includes('v2-0--0_stations_list.txt'));
  add('Wert-CSV je Station, richtige Version je Produkt',
    stationCsvUrl('woodland', 991).endsWith('recent_991_v2-3--0.csv.gz')
      && stationCsvUrl('grassland', 991).endsWith('recent_991_v2-0--0.csv.gz'));

  // --- Stationsliste (echtes Format aus WB0) --------------------------------
  const listText = [
    'Stationsindex; Höhe in m;Breite   ;Länge    ;Name                    ;Bundesland',
    '           44;        44;    52.93;     8.24;Großenkneten            ;Niedersachsen',
    '           73;       374;    48.62;    13.06;Aldersbach-Kramersepp   ;Bayern',
    '        20098;      1019;    48.57;     8.23;Seebach (Nationalpark)  ;Baden-Württemberg',
    '',
  ].join('\n');
  const st = parseStationsList(listText);
  add('Stationsliste: Kopfzeile übersprungen, drei Stationen gelesen', st.length === 3, String(st.length));
  add('Koordinaten und Höhe korrekt zugeordnet',
    st[0].id === 44 && st[0].lat === 52.93 && st[0].lon === 8.24 && st[0].elevM === 44);
  add('Name und Bundesland getrimmt',
    st[1].name === 'Aldersbach-Kramersepp' && st[1].state === 'Bayern', st[1].name);
  add('fünfstellige Stations-IDs bleiben ganz', st[2].id === 20098);
  add('Leerzeilen kippen den Parser nicht', parseStationsList(listText + '\n\n').length === 3);

  // --- Wert-CSV: NUR die letzte Zeile zählt ---------------------------------
  const csv = [
    'StationsID;Termin;wbi_0;wbi_1;wbi_2;wbi_3;wbi_4;wbi_5;wbi_6',
    '991;20260226 04:13;1;1;2;2;2;3;2',
    '991;20260813 04:13;3;3;4;4;5;4;3',
    '991;20260814 04:13;4;4;5;5;4;3;3',
  ].join('\n');
  const idx = parseStationCsv(csv, 'woodland');
  add('Wert-CSV: die LETZTE Zeile gewinnt, nicht die erste',
    idx?.days.join(',') === '4,4,5,5,4,3,3', idx?.days.join(','));
  add('Stations-ID gelesen', idx?.stationId === 991);
  add('Termin als UTC-Referenzzeit',
    idx?.ref?.atMs === Date.UTC(2026, 7, 14, 4, 13) && idx.ref.kind === 'measured');
  add('sieben Tage, nicht sechs oder acht', idx?.days.length === 7);

  const glfi = parseStationCsv(
    'StationsID;Termin;glfi_0;glfi_1;glfi_2;glfi_3;glfi_4;glfi_5;glfi_6\n991;20260814 04:14;2;2;3;2;2;2;2',
    'grassland');
  add('Grasland nutzt die glfi_-Spalten', glfi?.days.join(',') === '2,2,3,2,2,2,2');
  add('falsches Produkt ⇒ null statt falscher Werte',
    parseStationCsv(csv, 'grassland') === null);

  // Werte außerhalb 1..5 sind keine Stufe und werden NICHT geraten.
  const odd = parseStationCsv(
    'StationsID;Termin;wbi_0;wbi_1;wbi_2;wbi_3;wbi_4;wbi_5;wbi_6\n7;20260814 04:13;0;9;-999;;3;x;5',
    'woodland');
  add('unplausible Stufen werden null, nicht gerundet',
    odd?.days.join(',') === ',,,,3,,5'.replace(/,/g, ',') && odd.days[0] === null && odd.days[4] === 3,
    JSON.stringify(odd?.days));
  add('fehlender Termin ⇒ keine Referenzzeit behauptet',
    parseStationCsv('StationsID;Termin;wbi_0;wbi_1;wbi_2;wbi_3;wbi_4;wbi_5;wbi_6\n7;;1;1;1;1;1;1;1', 'woodland')?.ref === null);
  add('Kopf ohne Tagesspalten ⇒ null', parseStationCsv('StationsID;Termin\n7;20260814 04:13', 'woodland') === null);
  add('parseTermin: Müll ⇒ null', parseTermin('unsinn') === null && parseTermin(undefined) === null);

  // --- Der Deckel: DIE Zusicherung dieser Quelle ----------------------------
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((url: string) => {
    calls++;
    const id = String(url).match(/recent_(\d+)_v/)?.[1] ?? '0';
    const body = `StationsID;Termin;wbi_0;wbi_1;wbi_2;wbi_3;wbi_4;wbi_5;wbi_6\n${id};20260814 04:13;2;2;2;2;2;2;2`;
    return Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer),
    } as unknown as Response);
  }) as typeof fetch;

  try {
    resetDwdFireCache();
    const ids = Array.from({ length: 484 }, (_, i) => i + 1);
    const load = await fetchStationValues('woodland', ids);
    add('Deckel greift: höchstens 60 Abrufe, nicht 484 (V-200)',
      calls === STATION_FETCH_CAP, `${calls} Abrufe`);
    add('geladene Stationen entsprechen dem Deckel', load.values.size === STATION_FETCH_CAP);
    add('übersprungene Stationen werden GEZÄHLT, nicht verschwiegen',
      load.skipped === 484 - STATION_FETCH_CAP, String(load.skipped));

    const before = calls;
    await fetchStationValues('woodland', ids.slice(0, 30));
    add('zweiter Aufruf bedient sich aus dem Tages-Cache (keine neuen Abrufe)',
      calls === before, `${calls - before} zusätzliche Abrufe`);
    add('Referenzzeit ist die ÄLTESTE der geladenen Stationen (konservativ)',
      load.ref?.atMs === Date.UTC(2026, 7, 14, 4, 13));
  } finally {
    globalThis.fetch = realFetch;
    resetDwdFireCache();
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
