/**
 * CAP-1.2-Parser für amtliche Wetterwarnungen — **quellenübergreifend**.
 *  - DE: DWD `opendata.dwd.de/weather/alerts/cap/DISTRICT_DWD_STAT/` (Phase W1)
 *  - CH: MeteoSchweiz über den MeteoAlarm-Feed (Phase W2)
 *
 * Beide liefern CAP 1.2 mit deckungsgleichem Feldsatz — derselbe Parser reicht.
 * Was sich unterscheidet, steht NICHT im Format, sondern in zwei Konventionen,
 * und beide werden deshalb **pro Quelle übergeben statt geraten**:
 * die Einheit der Höhenfelder (`CapAltitudeUnit`) und die Sprache des
 * `<info>`-Blocks (`CapParseOptions.language`). Die Vorgaben (`'feet'`, erster
 * Block) sind exakt das W1-Verhalten — der DWD-Pfad ändert sich dadurch nicht.
 *
 * Zwei Schichten, beide DOM-frei und ohne Netz (D-12 — derselbe Code läuft im
 * Browser und im Verifier `scripts/verify-warnings.mjs`):
 *  1. **ZIP-Leser** — die Meldungen liegen einzeln als XML in einem ZIP
 *     (gemessen: 27 Einträge, durchweg Methode 8 = DEFLATE). Das Repo hat keine
 *     ZIP-Bibliothek und soll (D-06) keine bekommen; das Zentralverzeichnis ist
 *     ~50 Zeilen und DEFLATE erledigt der Web-Standard `DecompressionStream`,
 *     der im Browser UND in Node 22 (`.nvmrc`) vorhanden ist.
 *  2. **CAP-Pull-Parser** — index-basiert, Muster wie `radar/konrad3d.ts`.
 *
 * Formateigenheiten, an denen eine naive Implementierung scheitert (alle an der
 * echten Datei vom 2026-08-06 belegt, s. `audit/wetterwarnungen.md` §5):
 *  - **Koordinaten sind `lat,lon`** — GeoJSON verlangt `lon,lat`. Vertauscht
 *    sieht nichts „kaputt" aus, die Warnung liegt nur in Zentralasien.
 *  - **Höhenbänder stehen beim DWD in Fuß** — `ceiling` 1968.50394 ft = exakt
 *    600 m. Ungewandelt läse sich eine Warnung „unterhalb 600 m" als
 *    „unterhalb 1968 m", also als das Gegenteil einer Einschränkung.
 *    ⚠️ MeteoSchweiz schreibt **Meter** in dasselbe Feld — daher
 *    `CapAltitudeUnit`, und daher niemals eine globale Annahme.
 *  - **`expires` darf fehlen** (gemessen: 9 von 27) — das heißt „offen bis zur
 *    Aufhebung", NICHT „abgelaufen" und nicht „unbegrenzt gültig".
 *  - **Die amtliche Warnfarbe liegt bei** (`AREA_COLOR`) — sie wird übernommen,
 *    nicht nachempfunden.
 */

/** Fuß → Meter (exakt, per Definition). CAP schreibt Fuß über NN normativ vor. */
const FEET_TO_M = 0.3048;

/**
 * Einheit von `<altitude>`/`<ceiling>` — **pro Quelle**, nie global angenommen
 * (Phase W2, `audit/warnungen-at-ch.md` §4.1).
 *
 * CAP 1.2 schreibt **Fuß** vor, und der DWD hält sich daran — erkennbar an den
 * krummen Zahlen (`1968.50394 ft` = exakt 600 m). MeteoSchweiz schreibt in
 * dasselbe Feld **runde Meterwerte** (gemessen: `800.0`, `600.0`, `3000`).
 * `feetToM()` darauf anzuwenden machte aus „gilt unterhalb 800 m" ein
 * „unterhalb 244 m" — eine **verfälschte amtliche Warnung**, und damit ein
 * Verstoß gegen die Warn-Sonderregel und gegen die MeteoSchweiz-Lizenzklausel
 * („nur unverzüglich und inhaltlich unverändert").
 */
export type CapAltitudeUnit = 'feet' | 'metres';

export interface CapParseOptions {
  /**
   * Einheit der Höhenfelder. **Vorgabe `'feet'`** — damit bleibt der
   * DWD-Pfad (Phase W1) unberührt, ohne dass ein einziger Aufrufer angefasst
   * werden muss. Nur die Schweizer Quelle setzt `'metres'`.
   */
  altitudeUnit?: CapAltitudeUnit;
  /**
   * Bevorzugte Sprache des `<info>`-Blocks als Präfix (`'de'` trifft auch
   * `de-CH`). Fehlt die Angabe, wird der **erste** Block genommen — das
   * bisherige Verhalten, korrekt für den DWD, der genau einen Block liefert.
   *
   * Der Rückfall ist **nicht still**: greift er, meldet die Meldung das über
   * `languageFallback` — der Aufrufer kann es ausweisen, statt einen
   * englischen Text als deutschen auszugeben.
   */
  language?: string;
}
/**
 * Größter in den Daten beobachteter `ceiling` (9842.5197 ft = 3000 m). Er steht
 * an allen Meldungen ohne Höhenbeschränkung; kleinere Werte grenzen die Warnung
 * wirklich ein. Kein dokumentierter Sentinel — deshalb wird er als Schwelle
 * behandelt und nie als „gilt überall" ausgeschrieben.
 */
export const CEILING_UNRESTRICTED_M = 3000;

export type CapSeverity = 'Minor' | 'Moderate' | 'Severe' | 'Extreme' | 'Unknown';

export interface CapArea {
  /** Amtliche Gebietsbezeichnung, z. B. „Kreis und Stadt Regensburg". */
  desc: string;
  /** Ringe als `[lon,lat]` — CAP liefert `lat,lon`, hier bereits gedreht.
   *  CAP kennt keine Löcher: mehrere `<polygon>` sind mehrere Flächen. */
  rings: Array<Array<[number, number]>>;
  /** DWD-Warnzellen-Kennungen des Gebiets (ohne Geometrie-Bedeutung). */
  warnCellIds: string[];
  /** Untergrenze der Warnung (m über NN) — gemessen durchweg 0. */
  floorM: number | null;
  /** Obergrenze (m über NN). `< CEILING_UNRESTRICTED_M` = echte Einschränkung. */
  ceilingM: number | null;
}

export interface CapAlert {
  id: string;
  /** Ausgabezeit der Meldung (ms) — die Referenzzeit für das Datenalter (V-19). */
  sentMs: number | null;
  /** `Actual` | `Test` | `Exercise` | `Draft` | `System`. */
  status: string;
  /** `Alert` | `Update` | `Cancel` | … */
  msgType: string;
  /** Ereignisname, z. B. „STURMBÖEN". */
  event: string;
  /** Amtliche Überschrift — wird ZITIERT, nie umformuliert (D-19/§0). */
  headline: string;
  description: string;
  instruction: string;
  category: string;
  severity: CapSeverity;
  urgency: string;
  certainty: string;
  /** Ausgebende Stelle, z. B. „DWD / Seewetterdienst Hamburg". */
  senderName: string;
  /** `GROUP`-eventCode: WIND, THUNDERSTORM, RAIN, HAIL, HEAT … */
  group: string | null;
  /** `II`-eventCode: numerischer DWD-Ereignisschlüssel. */
  eventCode: number | null;
  /** Amtliche Flächenfarbe als `#rrggbb`, aus `AREA_COLOR`. */
  areaColor: string | null;
  /** Lizenzhinweis der Meldung (Pflichtangabe, wird mitgeführt). */
  license: string | null;
  effectiveMs: number | null;
  onsetMs: number | null;
  /** `null` = kein Ende angegeben (offen bis zur Aufhebung). */
  expiresMs: number | null;
  /** Quantitative Zusätze (`gusts`, `precipitation`, `hail`, …). */
  parameters: Array<{ name: string; value: string }>;
  web: string | null;
  areas: CapArea[];
  /**
   * Sprache des tatsächlich verwendeten `<info>`-Blocks (`''`, wenn die
   * Meldung keine angibt — so der DWD).
   */
  infoLanguage: string;
  /**
   * `true`, wenn die gewünschte Sprache **nicht** vorlag und ersatzweise der
   * erste Block genommen wurde. Muss ausgewiesen werden (D-04): sonst stünde
   * ein englischer Text da, wo der Nutzer einen deutschen erwartet.
   */
  languageFallback: boolean;
}

// ---------------------------------------------------------------------------
// ZIP (Zentralverzeichnis + DEFLATE)
// ---------------------------------------------------------------------------

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

/** DEFLATE ohne zlib-Rahmen — Web-Standard, kein Paket. */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream nicht verfügbar — CAP-ZIP nicht lesbar');
  }
  const stream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(data); c.close(); },
  }).pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Einträge eines ZIP-Archivs. Bewusst über das Zentralverzeichnis (nicht über
 * die lokalen Header): nur dort stehen die Größen zuverlässig, wenn der Erzeuger
 * Data-Descriptors benutzt.
 */
export async function unzipEntries(buf: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // EOCD von hinten suchen (Kommentar darf bis 65535 Bytes lang sein).
  let eocd = -1;
  const minStart = Math.max(0, buf.byteLength - 22 - 0xffff);
  for (let i = buf.byteLength - 22; i >= minStart; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP: kein End-of-Central-Directory gefunden');

  const count = view.getUint16(eocd + 10, true);
  let off = view.getUint32(eocd + 16, true);
  // ZIP64 wird NICHT geraten — lieber ein klarer Fehler als stille Fehldeutung.
  if (count === 0xffff || off === 0xffffffff) throw new Error('ZIP: ZIP64 nicht unterstützt');

  const dec = new TextDecoder('utf-8');
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (off + 46 > buf.byteLength || view.getUint32(off, true) !== SIG_CENTRAL) {
      throw new Error(`ZIP: beschädigtes Zentralverzeichnis bei Eintrag ${n}`);
    }
    const method = view.getUint16(off + 10, true);
    const compressedSize = view.getUint32(off + 20, true);
    const nameLen = view.getUint16(off + 28, true);
    const extraLen = view.getUint16(off + 30, true);
    const commentLen = view.getUint16(off + 32, true);
    const localOff = view.getUint32(off + 42, true);
    const name = dec.decode(buf.subarray(off + 46, off + 46 + nameLen));

    // Der lokale Header trägt eigene Feldlängen — die des Zentralverzeichnisses
    // gelten hier NICHT (häufige Fehlerquelle: Extra-Felder weichen ab).
    const localNameLen = view.getUint16(localOff + 26, true);
    const localExtraLen = view.getUint16(localOff + 28, true);
    const dataOff = localOff + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(dataOff, dataOff + compressedSize);

    if (method === 0) out.push({ name, bytes: raw });
    else if (method === 8) out.push({ name, bytes: await inflateRaw(raw) });
    else throw new Error(`ZIP: Kompressionsmethode ${method} nicht unterstützt (${name})`);

    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pull-Parser-Primitive (Muster radar/konrad3d.ts)
// ---------------------------------------------------------------------------

/** Position von `<tag` — nur exakte Tag-Namen (`<code` darf NICHT auf
 *  `<codeXY` matchen, `<value` nicht auf `<valueName>`). */
function findOpen(src: string, tag: string, from: number): number {
  const needle = `<${tag}`;
  let i = src.indexOf(needle, from);
  while (i >= 0) {
    const next = src.charCodeAt(i + needle.length);
    // '>' | ' ' | '/' | '\t' | '\n' | '\r'
    if (next === 62 || next === 32 || next === 47 || next === 9 || next === 10 || next === 13) return i;
    i = src.indexOf(needle, i + needle.length);
  }
  return -1;
}

interface Block { inner: string; end: number }

function block(src: string, tag: string, from = 0): Block | null {
  const open = findOpen(src, tag, from);
  if (open < 0) return null;
  const openEnd = src.indexOf('>', open);
  if (openEnd < 0) return null;
  if (src.charCodeAt(openEnd - 1) === 47) return { inner: '', end: openEnd + 1 }; // <tag/>
  const close = src.indexOf(`</${tag}>`, openEnd);
  if (close < 0) return null;
  return { inner: src.slice(openEnd + 1, close), end: close + tag.length + 3 };
}

/** XML-Entitäten auflösen — die Warntexte enthalten `&amp;`, `&gt;` (z. B.
 *  „Böen &gt; 60 km/h"). Ohne das stünde der Rohtext im Steckbrief. */
function unescapeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m, g: string) => {
    switch (g) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      default:
        return g.charAt(0) === '#'
          ? String.fromCodePoint(g.charAt(1) === 'x' ? parseInt(g.slice(2), 16) : Number(g.slice(1)))
          : m;
    }
  });
}

/** Textinhalt eines Blatt-Tags. */
function leaf(src: string, tag: string): string {
  const b = block(src, tag);
  return b ? unescapeXml(b.inner).trim() : '';
}

/** ISO-Zeitstempel eines Blatt-Tags (CAP führt immer einen Offset mit). */
function isoMs(src: string, tag: string): number | null {
  const raw = leaf(src, tag);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** Alle `<tag>`-Blöcke ab `from` (flach, nicht rekursiv). */
function blocks(src: string, tag: string): string[] {
  const out: string[] = [];
  let cursor = 0;
  for (;;) {
    const b = block(src, tag, cursor);
    if (!b) break;
    cursor = b.end;
    out.push(b.inner);
  }
  return out;
}

/** `<valueName>/<value>`-Paare (eventCode, parameter, geocode). */
function pairs(src: string, tag: string): Array<{ name: string; value: string }> {
  return blocks(src, tag).map((b) => ({ name: leaf(b, 'valueName'), value: leaf(b, 'value') }));
}

/**
 * `<altitude>`/`<ceiling>` → Meter über NN. Die Einheit kommt vom Aufrufer
 * (s. `CapAltitudeUnit`) — sie wird NICHT aus den Werten erraten.
 */
function altitudeM(src: string, tag: string, unit: CapAltitudeUnit): number | null {
  const raw = leaf(src, tag);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return unit === 'metres' ? n : n * FEET_TO_M;
}

/**
 * Den passenden `<info>`-Block wählen. CAP erlaubt beliebig viele — der DWD
 * liefert genau einen, MeteoSchweiz **fünf** (`en`/`de`/`fr`/`it`/`rm`) mit
 * `en` an erster Stelle. Wer blind den ersten nimmt, zeigt „Extreme heat wave"
 * statt „Extreme Hitzewelle" (`audit/warnungen-at-ch.md` §4.2).
 *
 * Gegengeprüft an 306 Meldungen: `severity`, `ceiling` und `areaDesc` sind über
 * alle fünf Blöcke identisch — die Auswahl ändert also nur den Text, nicht die
 * Einstufung und nicht die Geometrie.
 */
function selectInfo(alertInner: string, language: string | undefined): { inner: string; fallback: boolean } | null {
  const all = blocks(alertInner, 'info');
  if (!all.length) return null;
  if (!language) return { inner: all[0], fallback: false };
  const want = language.toLowerCase();
  const hit = all.find((b) => leaf(b, 'language').toLowerCase().startsWith(want));
  return hit ? { inner: hit, fallback: false } : { inner: all[0], fallback: true };
}

/** `204 153 255` → `#cc99ff`. Ungültiges bleibt `null` (dann greift der
 *  dokumentierte Fallback in `warnField.ts`, statt eine Farbe zu erfinden). */
export function parseAreaColor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = raw.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v) || v < 0 || v > 255)) return null;
  return `#${parts.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function severityOf(raw: string): CapSeverity {
  switch (raw) {
    case 'Minor': case 'Moderate': case 'Severe': case 'Extreme': return raw;
    default: return 'Unknown';
  }
}

// ---------------------------------------------------------------------------
// CAP-Meldung
// ---------------------------------------------------------------------------

/**
 * Eine CAP-Meldung. `null`, wenn das Dokument kein `<alert>` mit `<info>` ist —
 * eine kaputte Einzeldatei darf nie den ganzen Satz kippen.
 */
export function parseCapAlert(xml: string, opts: CapParseOptions = {}): CapAlert | null {
  const unit = opts.altitudeUnit ?? 'feet';
  const alert = block(xml, 'alert');
  if (!alert) return null;
  const info = selectInfo(alert.inner, opts.language);
  if (!info) return null;

  const codes = pairs(info.inner, 'eventCode');
  const codeOf = (name: string) => codes.find((c) => c.name === name)?.value ?? null;
  const ii = codeOf('II');

  const areas: CapArea[] = blocks(info.inner, 'area').map((a) => ({
    desc: leaf(a, 'areaDesc'),
    rings: blocks(a, 'polygon').map(parsePolygon).filter((r) => r.length >= 4),
    warnCellIds: pairs(a, 'geocode').filter((g) => g.name === 'WARNCELLID').map((g) => g.value),
    floorM: altitudeM(a, 'altitude', unit),
    ceilingM: altitudeM(a, 'ceiling', unit),
  }));

  return {
    id: leaf(alert.inner, 'identifier'),
    sentMs: isoMs(alert.inner, 'sent'),
    status: leaf(alert.inner, 'status'),
    msgType: leaf(alert.inner, 'msgType'),
    event: leaf(info.inner, 'event'),
    headline: leaf(info.inner, 'headline'),
    description: leaf(info.inner, 'description'),
    instruction: leaf(info.inner, 'instruction'),
    category: leaf(info.inner, 'category'),
    severity: severityOf(leaf(info.inner, 'severity')),
    urgency: leaf(info.inner, 'urgency'),
    certainty: leaf(info.inner, 'certainty'),
    senderName: leaf(info.inner, 'senderName'),
    group: codeOf('GROUP'),
    eventCode: ii != null && Number.isFinite(Number(ii)) ? Number(ii) : null,
    areaColor: parseAreaColor(codeOf('AREA_COLOR')),
    license: codeOf('LICENSE'),
    effectiveMs: isoMs(info.inner, 'effective'),
    onsetMs: isoMs(info.inner, 'onset'),
    expiresMs: isoMs(info.inner, 'expires'),
    parameters: pairs(info.inner, 'parameter'),
    web: leaf(info.inner, 'web') || null,
    areas,
    infoLanguage: leaf(info.inner, 'language'),
    languageFallback: info.fallback,
  };
}

/**
 * `<polygon>`-Ring: whitespace-getrennte `lat,lon`-Paare → `[lon,lat]`.
 * Die Drehung ist der Kern dieser Funktion (s. Kopfkommentar).
 */
function parsePolygon(raw: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const pair of raw.trim().split(/\s+/)) {
    const comma = pair.indexOf(',');
    if (comma < 0) continue;
    const lat = Number(pair.slice(0, comma));
    const lon = Number(pair.slice(comma + 1));
    // Plausibilitätsgrenzen statt blindem Vertrauen: ein vertauschtes Paar
    // (z. B. 12,49) fiele hier NICHT auf — dafür gibt es den Ortslage-Check im
    // Verifier. Diese Prüfung fängt nur echten Müll ab.
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    out.push([lon, lat]);
  }
  return out;
}

/**
 * Darf diese Meldung auf die Karte? Nur echte, nicht zurückgezogene Warnungen.
 * Übungs- und Testmeldungen (`Test`, `Exercise`, `Draft`, `System`) sind im
 * Vollstand nicht zu erwarten, dürfen aber unter keinen Umständen wie eine
 * echte Warnung aussehen.
 */
export function isRenderableAlert(a: CapAlert): boolean {
  if (a.status !== 'Actual') return false;
  if (a.msgType !== 'Alert' && a.msgType !== 'Update') return false;
  return a.areas.some((ar) => ar.rings.length > 0);
}

/**
 * Alle Meldungen eines CAP-ZIP. Eine unlesbare Einzeldatei wird übersprungen,
 * nicht hochgereicht — sonst nähme ein einzelner Defekt die ganze Warnlage vom
 * Schirm. Die Zahl der Übersprungenen wird zurückgegeben, damit der Aufrufer
 * das sichtbar machen kann statt es zu verschweigen (D-04).
 */
export async function parseCapArchive(
  buf: Uint8Array,
  opts: CapParseOptions = {},
): Promise<{ alerts: CapAlert[]; entries: number; skipped: number }> {
  const entries = await unzipEntries(buf);
  const dec = new TextDecoder('utf-8');
  const alerts: CapAlert[] = [];
  let skipped = 0;
  for (const e of entries) {
    if (!/\.xml$/i.test(e.name)) { skipped++; continue; }
    try {
      const a = parseCapAlert(dec.decode(e.bytes), opts);
      if (a) alerts.push(a); else skipped++;
    } catch {
      skipped++;
    }
  }
  return { alerts, entries: entries.length, skipped };
}

// ---------------------------------------------------------------------------
// Atom-Index (MeteoAlarm) — Phase W2
// ---------------------------------------------------------------------------

/**
 * Ein Eintrag des MeteoAlarm-Atom-Feeds. Der Feed ist **ein Verzeichnis, keine
 * Meldung**: gemessen am CH-Feed enthält er weder `headline` noch
 * `description`/`instruction`, weder `ceiling` noch Sprachblöcke, und sein
 * `event` ist englisch (`audit/warnungen-at-ch.md` §8.1). Er wird deshalb
 * ausschließlich als Index benutzt — Geometrie und Text kommen aus dem
 * vollständigen CAP-Dokument, auf das jeder Eintrag selbst verlinkt.
 *
 * Ein Nebeneffekt dieser Aufteilung ist ein Vorteil: es gibt genau **einen**
 * Geometriepfad (`parseCapAlert`), also keine zweite Stelle, an der die
 * `lat,lon`-Drehung doppelt oder gar nicht passieren könnte (§4.3).
 */
export interface CapAtomEntry {
  /** `cap:identifier` — unveränderlich, taugt als Cache-Schlüssel. */
  id: string;
  /** URL des vollständigen CAP-1.2-Dokuments (`application/cap+xml`). */
  capUrl: string;
  /** Nur für Diagnose/Verifier — die Anzeige nimmt den Text aus dem CAP. */
  areaDesc: string;
  expiresMs: number | null;
  onsetMs: number | null;
}

export interface CapAtomFeed {
  /**
   * `<updated>` des Feeds. Die **einzige** Frischebelegung dieser Quelle:
   * MeteoAlarm sendet weder `Last-Modified` noch `ETag` (§8.4). Ohne sie wäre
   * ein „keine Warnungen" ohne jeden Frischebeleg — und damit nach V-19 nicht
   * anzeigbar.
   */
  updatedMs: number | null;
  /** Lizenz-/Rechtehinweis im Feed-Kopf, wortwörtlich. */
  rights: string;
  entries: CapAtomEntry[];
  /** Einträge ohne Kennung oder ohne CAP-Link — gezählt, nicht verschwiegen. */
  skipped: number;
}

/** Wert eines Attributs im Start-Tag (`href="…"`). */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`));
  return m ? unescapeXml(m[1]) : null;
}

/**
 * Atom-Feed → Index. Bewusst tolerant: ein Eintrag ohne CAP-Link wird
 * übersprungen und **gezählt**, statt den ganzen Feed zu kippen — „0 Warnungen"
 * darf nie „30 nicht gelesen" bedeuten (D-04).
 */
export function parseCapAtomIndex(xml: string): CapAtomFeed {
  // `<updated>` steht im Feed-Kopf UND in jedem Eintrag. Nur der Kopf zählt —
  // deshalb wird ausschließlich der Teil vor dem ersten `<entry>` durchsucht.
  const firstEntry = findOpen(xml, 'entry', 0);
  const head = firstEntry < 0 ? xml : xml.slice(0, firstEntry);
  const updatedRaw = leaf(head, 'updated');
  const updatedMs = updatedRaw && Number.isFinite(Date.parse(updatedRaw)) ? Date.parse(updatedRaw) : null;

  const entries: CapAtomEntry[] = [];
  let skipped = 0;

  for (const e of blocks(xml, 'entry')) {
    const id = leaf(e, 'cap:identifier');
    // Der CAP-Link ist der einzige mit `type="application/cap+xml"`.
    const link = (e.match(/<link\b[^>]*>/g) ?? [])
      .find((t) => /type\s*=\s*"application\/cap\+xml"/.test(t));
    const capUrl = link ? attr(link, 'href') : null;
    if (!id || !capUrl) { skipped++; continue; }
    entries.push({
      id,
      capUrl,
      areaDesc: leaf(e, 'cap:areaDesc'),
      expiresMs: isoMs(e, 'cap:expires'),
      onsetMs: isoMs(e, 'cap:onset'),
    });
  }

  return { updatedMs, rights: leaf(head, 'rights'), entries, skipped };
}
