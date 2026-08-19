/**
 * Headless-Verifikation des Warn-Layers (Phase W1, Gate GW1) — prüft den
 * ECHTEN App-Code (`src/warnings/capAlerts.ts`, `src/warnings/warnField.ts`)
 * gegen eine ECHTE Fixture. Kein Netz / kein DOM / kein Vitest.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-warnings.mjs
 *
 * Fixture (`scripts/fixtures/`, unverändert von der Quelle):
 *   dwd-cap-district.zip   DWD CAP 1.2, DISTRICT_DWD_STAT/…_DE.zip,
 *                          publiziert 2026-08-06 14:34:45 UTC, 27 Meldungen.
 *
 * Die beiden wichtigsten Zusicherungen (`audit/wetterwarnungen.md` §5):
 *  - **Koordinatenreihenfolge**: CAP liefert `lat,lon`, GeoJSON braucht
 *    `lon,lat`. Vertauscht sieht nichts kaputt aus — die Warnung liegt nur
 *    nicht mehr in Deutschland. Geprüft an einer bekannten Ortslage.
 *  - **Höheneinheit**: `ceiling` steht in **Fuß**. Ungewandelt läse sich
 *    „gilt nur unterhalb 600 m" als „unterhalb 1968 m" — die Einschränkung
 *    verkehrte sich ins Gegenteil. (ROT-TEST: `FEET_TO_M` auf 1 setzen ⇒
 *    Check 5.x muss rot werden.)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  unzipEntries, parseCapAlert, parseCapArchive, parseAreaColor, isRenderableAlert,
  parseCapAtomIndex, CEILING_UNRESTRICTED_M,
} from '../src/warnings/capAlerts.ts';
import {
  SEVERITY_RANK, SEVERITY_LABEL, SEVERITY_FALLBACK_COLOR, warnColor, alertStartMs,
  isActiveAt, heightBandText, validityText, paramLabel, paramValue, activeAlertsAt,
  warnSummary, buildWarnFeatures,
  WARN_SOURCE_DE, WARN_SOURCE_CH, AWARENESS_COLOR, awarenessOf, warnSeverityLabel,
  buildWarnFeaturesMulti, warnSummaryMulti,
} from '../src/warnings/warnField.ts';

const here = dirname(fileURLToPath(import.meta.url));
const bytes = new Uint8Array(readFileSync(join(here, 'fixtures', 'dwd-cap-district.zip')));

// Phase W2 — Schweiz. Der Atom-Feed ist der Index, die je-Meldung-Dokumente
// sind echtes CAP 1.2 (Mitschnitt 2026-08-08 18:11–18:16 UTC, unverändert).
const chAtomXml = readFileSync(join(here, 'fixtures', 'meteoalarm-ch-atom.xml'), 'utf-8');
const chHeatSevere = readFileSync(join(here, 'fixtures', 'meteoalarm-ch-alert-heat-severe.xml'), 'utf-8');
const chHeatExtreme = readFileSync(join(here, 'fixtures', 'meteoalarm-ch-alert-heat-extreme.xml'), 'utf-8');
const chThunder = readFileSync(join(here, 'fixtures', 'meteoalarm-ch-alert-thunder-severe.xml'), 'utf-8');

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// ---------------------------------------------------------------------------
// (1) ZIP-Leser
// ---------------------------------------------------------------------------
const entries = await unzipEntries(bytes);
add('ZIP: 27 Einträge gelesen', entries.length === 27, `${entries.length}`);
add('ZIP: alle Einträge sind .xml', entries.every((e) => e.name.endsWith('.xml')));
add('ZIP: DEFLATE korrekt entpackt (jedes XML beginnt mit Prolog)',
  entries.every((e) => new TextDecoder().decode(e.bytes.subarray(0, 5)) === '<?xml'));
add('ZIP: Einträge sind nicht leer', entries.every((e) => e.bytes.length > 500));
{
  // Leeres Archiv = nur der EOCD-Satz. Muss sauber „nichts" liefern statt zu werfen.
  const eocd = new Uint8Array(22);
  new DataView(eocd.buffer).setUint32(0, 0x06054b50, true);
  const empty = await parseCapArchive(eocd);
  add('ZIP: leeres Archiv ⇒ 0 Meldungen, kein Absturz',
    empty.alerts.length === 0 && empty.entries === 0);
}
{
  let threw = false;
  try { await unzipEntries(new Uint8Array(64)); } catch { threw = true; }
  add('ZIP: Müll ohne EOCD wirft klaren Fehler (statt still zu raten)', threw);
}

// ---------------------------------------------------------------------------
// (2) CAP-Parser — Feldschema gegen die echte Datei
// ---------------------------------------------------------------------------
const { alerts, entries: nEntries, skipped } = await parseCapArchive(bytes);
add('CAP: 27 Meldungen geparst', alerts.length === 27, `${alerts.length}`);
add('CAP: kein Eintrag übersprungen', skipped === 0 && nEntries === 27, `skipped=${skipped}`);
add('CAP: alle Meldungen haben eine Kennung', alerts.every((a) => a.id.length > 20));
add('CAP: alle Meldungen haben eine Ausgabezeit (sent)', alerts.every((a) => a.sentMs != null));
add('CAP: Status durchweg „Actual"', alerts.every((a) => a.status === 'Actual'));
add('CAP: msgType 22× Alert + 5× Update',
  alerts.filter((a) => a.msgType === 'Alert').length === 22
  && alerts.filter((a) => a.msgType === 'Update').length === 5);
add('CAP: Warnstufen 18× Minor + 9× Moderate',
  alerts.filter((a) => a.severity === 'Minor').length === 18
  && alerts.filter((a) => a.severity === 'Moderate').length === 9);
add('CAP: alle Meldungen tragen eine amtliche Überschrift',
  alerts.every((a) => a.headline.startsWith('Amtliche')), alerts[0].headline);
add('CAP: alle Meldungen tragen einen Beschreibungstext', alerts.every((a) => a.description.length > 20));
add('CAP: Lizenzangabe vorhanden (Pflichtangabe)',
  alerts.every((a) => (a.license ?? '').includes('BKG')), alerts[0].license);
add('CAP: GROUP-Schlüssel vorhanden', alerts.every((a) => a.group != null));
add('CAP: numerischer Ereignisschlüssel (II) vorhanden',
  alerts.every((a) => a.eventCode != null && Number.isFinite(a.eventCode)));
add('CAP: drei ausgebende Stellen erkannt',
  new Set(alerts.map((a) => a.senderName)).size === 3,
  [...new Set(alerts.map((a) => a.senderName))].join(' | '));
{
  const events = new Set(alerts.map((a) => a.event));
  add('CAP: sechs verschiedene Ereignisse', events.size === 6, [...events].join(', '));
}
{
  // `expires` DARF fehlen — 9 der 27 (See-Warnungen). Das ist kein Defekt.
  const withExp = alerts.filter((a) => a.expiresMs != null).length;
  add('CAP: 18 mit Ende, 9 ohne Ende', withExp === 18, `${withExp}/27`);
}
add('CAP: alle Meldungen haben einen Beginn (onset/effective/sent)',
  alerts.every((a) => alertStartMs(a) != null));
{
  // Entity-Auflösung: der Rohtext enthält `&lt;60 [km/h]`.
  const all = alerts.flatMap((a) => a.parameters.map((p) => p.value));
  add('CAP: XML-Entitäten aufgelöst („&lt;" ⇒ „<")',
    all.some((v) => v.startsWith('<')) && !all.some((v) => v.includes('&lt;')),
    all.find((v) => v.startsWith('<')));
  add('CAP: Umlaute korrekt dekodiert (UTF-8)',
    alerts.some((a) => a.event.includes('Ö')) && alerts.some((a) => a.description.includes('ä')));
}
{
  const kaputt = parseCapAlert('<html><body>kein CAP</body></html>');
  add('CAP: Fremd-Dokument ⇒ null (kippt nicht den ganzen Satz)', kaputt === null);
}

// ---------------------------------------------------------------------------
// (3) Geometrie — der Kernfehler wäre die Koordinatenreihenfolge
// ---------------------------------------------------------------------------
const areas = alerts.flatMap((a) => a.areas);
add('Geometrie: 95 Gebiete', areas.length === 95, `${areas.length}`);
add('Geometrie: JEDES Gebiet hat ein Polygon (Produktwahl DISTRICT)',
  areas.every((ar) => ar.rings.length > 0));
{
  const rings = areas.flatMap((ar) => ar.rings);
  add('Geometrie: 136 Ringe', rings.length === 136, `${rings.length}`);
  add('Geometrie: alle Ringe geschlossen',
    rings.every((r) => r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]));
  add('Geometrie: alle Ringe haben ≥ 4 Stützpunkte', rings.every((r) => r.length >= 4));
  let minLon = 999, maxLon = -999, minLat = 999, maxLat = -999;
  for (const r of rings) for (const [lon, lat] of r) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  // Deutschland inkl. Seegebiete: ~5,8–15,1 °O / 47,2–55,1 °N.
  add('Geometrie: ALLE Punkte liegen im deutschen Fenster (Reihenfolge lon,lat)',
    minLon > 5.5 && maxLon < 15.5 && minLat > 47 && maxLat < 55.5,
    `lon ${minLon.toFixed(2)}…${maxLon.toFixed(2)} · lat ${minLat.toFixed(2)}…${maxLat.toFixed(2)}`);
  // Gegenprobe: vertauscht läge die Länge bei ~49 — außerhalb jedes DE-Fensters.
  add('Geometrie: Vertauschung wäre erkennbar (Längen < 16°, Breiten > 47°)',
    maxLon < 16 && minLat > 47);
}
{
  // Bekannte Ortslage: „Kreis und Stadt Regensburg" ~49,0 °N / 12,1 °O.
  const rgb = areas.find((ar) => ar.desc.includes('Regensburg'));
  add('Geometrie: Gebiet „Regensburg" vorhanden', rgb != null, rgb?.desc);
  if (rgb) {
    const pts = rgb.rings[0];
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    add('Geometrie: Regensburg liegt in Ostbayern, nicht in Zentralasien',
      cx > 11.7 && cx < 12.7 && cy > 48.6 && cy < 49.4,
      `Schwerpunkt ${cy.toFixed(2)} °N / ${cx.toFixed(2)} °O`);
  }
}
add('Geometrie: Warnzellen-Kennungen werden mitgelesen',
  areas.every((ar) => ar.warnCellIds.length > 0), `${areas[0].warnCellIds[0]}`);

// ---------------------------------------------------------------------------
// (4) Amtliche Farbe
// ---------------------------------------------------------------------------
add('Farbe: „204 153 255" ⇒ #cc99ff', parseAreaColor('204 153 255') === '#cc99ff');
add('Farbe: „255 235 59" ⇒ #ffeb3b (gelb, Warnstufe Minor)', parseAreaColor('255 235 59') === '#ffeb3b');
add('Farbe: „251 140 0" ⇒ #fb8c00 (orange, Warnstufe Moderate)', parseAreaColor('251 140 0') === '#fb8c00');
add('Farbe: Unfug ⇒ null (Fallback statt erfundener Farbe)',
  parseAreaColor('rot') === null && parseAreaColor('1 2') === null && parseAreaColor('300 0 0') === null);
add('Farbe: JEDE Meldung bringt ihre amtliche Farbe mit',
  alerts.every((a) => a.areaColor != null));
add('Farbe: Karte nutzt die amtliche Farbe, nicht den Fallback',
  alerts.every((a) => warnColor(a) === a.areaColor));
add('Farbe: Minor ist gelb, Moderate ist orange (amtlich, gemessen)',
  alerts.filter((a) => a.severity === 'Minor').every((a) => a.areaColor === '#ffeb3b' || a.areaColor === '#cc99ff')
  && alerts.filter((a) => a.severity === 'Moderate').every((a) => a.areaColor === '#fb8c00'));
add('Farbe: Fallback-Tabelle deckt alle Stufen ab',
  Object.keys(SEVERITY_RANK).every((s) => /^#[0-9a-f]{6}$/.test(SEVERITY_FALLBACK_COLOR[s])));

// ---------------------------------------------------------------------------
// (5) Höhenband — Fuß ⇒ Meter (ROT-TEST-Anker)
// ---------------------------------------------------------------------------
{
  const ceils = [...new Set(areas.map((ar) => (ar.ceilingM == null ? 'null' : ar.ceilingM.toFixed(1))))].sort();
  add('Höhe: drei Obergrenzen im Datensatz', ceils.length === 3, ceils.join(' | '));
  add('EINHEIT: 1968,50394 ft ⇒ exakt 600 m',
    areas.some((ar) => ar.ceilingM != null && Math.abs(ar.ceilingM - 600) < 0.01),
    ceils.join(' | '));
  add('EINHEIT: 1312,33596 ft ⇒ exakt 400 m',
    areas.some((ar) => ar.ceilingM != null && Math.abs(ar.ceilingM - 400) < 0.01));
  add('EINHEIT: 9842,5197 ft ⇒ exakt 3000 m (Standardwert)',
    areas.some((ar) => ar.ceilingM != null && Math.abs(ar.ceilingM - CEILING_UNRESTRICTED_M) < 0.01));
  add('Höhe: Untergrenze durchweg 0 m', areas.every((ar) => ar.floorM === 0));
}
{
  // Null-sicher: bei falscher Einheit (ROT-TEST) findet `find` nichts — dann
  // muss der Check sauber FAIL melden, nicht den ganzen Lauf abbrechen.
  const limited = areas.find((ar) => ar.ceilingM != null && Math.abs(ar.ceilingM - 600) < 0.01);
  const open = areas.find((ar) => ar.ceilingM != null && ar.ceilingM >= CEILING_UNRESTRICTED_M);
  add('Höhe: Einschränkung wird ausgewiesen',
    limited != null && heightBandText(limited) === 'gilt nur unterhalb 600 m Höhe',
    limited ? heightBandText(limited) : 'kein 600-m-Gebiet gefunden');
  add('Höhe: ohne Einschränkung kein Hinweistext', open != null && heightBandText(open) === null);
  add('Höhe: Hitzewarnungen sind die höhenbeschränkten',
    alerts.filter((a) => a.areas.some((ar) => ar.ceilingM < CEILING_UNRESTRICTED_M))
      .every((a) => a.event.includes('HITZE')));
}

// ---------------------------------------------------------------------------
// (6) Zeitfilter — der Slider entscheidet, was gilt
// ---------------------------------------------------------------------------
const T15 = Date.parse('2026-08-06T15:00:00+02:00');
const T22 = Date.parse('2026-08-06T22:00:00+02:00');
{
  const future = alerts.find((a) => a.onsetMs === Date.parse('2026-08-06T21:00:00+02:00'));
  add('Zeit: Meldung mit Beginn 21:00 gefunden', future != null, future?.event);
  add('Zeit: um 15:00 noch NICHT aktiv', !isActiveAt(future, T15));
  add('Zeit: um 22:00 aktiv', isActiveAt(future, T22));
  add('Zeit: Vorlauf wird als „ab …" ausgewiesen',
    validityText(future, T15).startsWith('06.08') || validityText(future, T15).includes('bis'),
    validityText(future, T15));
}
{
  const openEnd = alerts.find((a) => a.expiresMs == null);
  add('Zeit: Meldung ohne Ende gefunden', openEnd != null, openEnd?.event);
  add('Zeit: ohne Ende ⇒ läuft nicht durch Zeitablauf ab',
    isActiveAt(openEnd, T15) && isActiveAt(openEnd, T22));
  add('Zeit: „ohne festes Ende" wird ausgeschrieben',
    validityText(openEnd, T22).includes('ohne festes Ende'), validityText(openEnd, T22));
}
{
  const expired = alerts.find((a) => a.expiresMs != null && a.expiresMs <= T22);
  add('Zeit: abgelaufene Meldung wird nicht mehr gezeigt', expired != null && !isActiveAt(expired, T22));
}
{
  const a15 = activeAlertsAt(alerts, T15).length;
  const a22 = activeAlertsAt(alerts, T22).length;
  add('Zeit: die Warnlage ändert sich über den Slider', a15 !== a22, `15:00 → ${a15} · 22:00 → ${a22}`);
  add('Zeit: aktive Menge ist stets Teilmenge des Standes', a15 <= 27 && a22 <= 27);
  add('Zeit: höchste Stufe steht vorn',
    activeAlertsAt(alerts, T15).every((a, i, arr) =>
      i === 0 || SEVERITY_RANK[arr[i - 1].severity] >= SEVERITY_RANK[a.severity]));
}

// ---------------------------------------------------------------------------
// (7) Zulassung — was NIE auf die Karte darf
// ---------------------------------------------------------------------------
{
  const real = alerts[0];
  add('Zulassung: echte Warnung wird gezeigt', isRenderableAlert(real));
  add('Zulassung: Testmeldung wird NICHT gezeigt', !isRenderableAlert({ ...real, status: 'Test' }));
  add('Zulassung: Übungsmeldung wird NICHT gezeigt', !isRenderableAlert({ ...real, status: 'Exercise' }));
  add('Zulassung: zurückgezogene Meldung wird NICHT gezeigt', !isRenderableAlert({ ...real, msgType: 'Cancel' }));
  add('Zulassung: Meldung ohne Geometrie wird NICHT gezeigt', !isRenderableAlert({ ...real, areas: [] }));
  add('Zulassung: alle 27 Meldungen der Fixture sind darstellbar', alerts.every(isRenderableAlert));
}

// ---------------------------------------------------------------------------
// (8) Karten-Features
// ---------------------------------------------------------------------------
const fc = buildWarnFeatures(alerts, T15);
{
  const expected = activeAlertsAt(alerts, T15)
    .reduce((s, a) => s + a.areas.filter((ar) => ar.rings.length > 0).length, 0);
  add('Features: ein Feature je (Meldung × Gebiet)', fc.features.length === expected,
    `${fc.features.length}`);
  add('Features: alles MultiPolygon', fc.features.every((f) => f.geometry.type === 'MultiPolygon'));
  add('Features: mehrere Ringe = mehrere FLÄCHEN, keine Löcher',
    fc.features.every((f) => f.geometry.coordinates.every((poly) => poly.length === 1)));
  add('Features: schwächere Stufe zeichnet zuerst (Sortierung)',
    fc.features.every((f, i, arr) => i === 0 || arr[i - 1].properties.sev <= f.properties.sev));
  add('Features: jedes trägt eine Farbe', fc.features.every((f) => /^#[0-9a-f]{6}$/.test(f.properties.color)));
  add('Features: jedes trägt Stufenrang 1…4',
    fc.features.every((f) => f.properties.sev >= 1 && f.properties.sev <= 4));
}
{
  // ZITAT-TREUE: die Überschrift im Feature muss der amtlichen entsprechen.
  const byId = new Map(alerts.map((a) => [a.id, a]));
  add('Zitat: Überschrift wird UNVERÄNDERT durchgereicht',
    fc.features.every((f) => byId.get(f.properties.id).headline === f.properties.headline));
  add('Zitat: Beschreibung wird UNVERÄNDERT durchgereicht',
    fc.features.every((f) => byId.get(f.properties.id).description === f.properties.description));
  add('Zitat: Handlungshinweis wird UNVERÄNDERT durchgereicht',
    fc.features.every((f) => byId.get(f.properties.id).instruction === f.properties.instruction));
}
{
  add('Features: Gebietsname steht am Feature',
    fc.features.every((f) => typeof f.properties.areaDesc === 'string' && f.properties.areaDesc.length > 0));
  add('Features: Gültigkeit steht am Feature',
    fc.features.every((f) => f.properties.validity.length > 0));
  const withBand = fc.features.filter((f) => f.properties.heightNote !== '');
  add('Features: Höhenband-Hinweis nur wo eingeschränkt',
    withBand.length > 0 && withBand.every((f) => f.properties.heightNote.includes('unterhalb')),
    `${withBand.length} Features`);
  add('Features: Lizenz reist mit', fc.features.every((f) => f.properties.license.includes('BKG')));
}
{
  // Überlappung: derselbe Landkreis kann mehrfach gewarnt sein — keine Warnung
  // darf dabei verschwinden. In der Fixture sind 5 Warnzellen doppelt belegt;
  // GLEICHZEITIG aktiv sind zwei davon nur in einem schmalen Fenster —
  // Kreis Traunstein, zwei Gewitterwarnungen, 14:12–15:00 UTC. Genau dort wird
  // geprüft (die Zeitpunkte 15:00/22:00 MESZ liegen daneben, s. §5.5).
  const tOverlap = Date.parse('2026-08-06T14:30:00Z');
  const fcOv = buildWarnFeatures(alerts, tOverlap);
  const byArea = new Map();
  for (const f of fcOv.features) {
    const k = f.properties.areaDesc;
    byArea.set(k, (byArea.get(k) ?? new Set()).add(f.properties.id));
  }
  const multi = [...byArea.entries()].filter(([, ids]) => ids.size > 1);
  add('Überlappung: gleichzeitig mehrfach gewarntes Gebiet bleibt vollständig',
    multi.length > 0 && multi.every(([, ids]) => ids.size === 2),
    `${multi.length} Gebiet(e): ${multi.map(([n]) => n).join(', ')}`);
  add('Überlappung: beide Meldungen liefern ein eigenes Feature',
    fcOv.features.filter((f) => f.properties.areaDesc === multi[0]?.[0]).length === 2);
  // Gegenprobe an der Nahtstelle: Sturmböen enden 19:00 UTC, Windböen beginnen
  // 19:00 UTC — an derselben Küstenzelle darf daraus KEINE Doppelung werden.
  const seam = buildWarnFeatures(alerts, Date.parse('2026-08-06T19:00:00Z'));
  const coastal = seam.features.filter((f) => f.properties.areaDesc.includes('Ostholstein - Küste'));
  add('Überlappung: an der Zeitnaht keine doppelte Warnung', coastal.length === 1,
    `${coastal.length} Feature(s): ${coastal.map((f) => f.properties.event).join(', ')}`);
}
{
  const empty = buildWarnFeatures([], T15);
  add('Leerfall: keine Meldungen ⇒ leere FeatureCollection, kein Absturz',
    empty.type === 'FeatureCollection' && empty.features.length === 0);
}

// ---------------------------------------------------------------------------
// (9) Zusammenfassung für Legende und Statuszeile
// ---------------------------------------------------------------------------
{
  const s = warnSummary(alerts, T15);
  add('Legende: Gesamtzahl stimmt mit der aktiven Menge überein',
    s.total === activeAlertsAt(alerts, T15).length, `${s.total}`);
  add('Legende: Stufen absteigend sortiert',
    s.tiers.every((t, i, arr) => i === 0 || SEVERITY_RANK[arr[i - 1].severity] >= SEVERITY_RANK[t.severity]));
  add('Legende: Stufensumme = Gesamtzahl', s.tiers.reduce((n, t) => n + t.count, 0) === s.total);
  add('Legende: höchste Stufe benannt', s.topSeverity != null, `${s.topSeverity} — ${SEVERITY_LABEL[s.topSeverity]}`);
  add('Legende: zeigt nur Stufen, die wirklich auf der Karte sind',
    s.tiers.every((t) => t.count > 0));
  const e = warnSummary([], T15);
  add('Legende: Leerfall ⇒ 0 Stufen, keine erfundene Skala', e.total === 0 && e.tiers.length === 0);
}

// ---------------------------------------------------------------------------
// (10) Texte — Übersetzung nur, wo belegt
// ---------------------------------------------------------------------------
add('Text: „gusts" ⇒ „Böen"', paramLabel('gusts') === 'Böen');
add('Text: „exposed gusts" ⇒ „Böen in exponierten Lagen"',
  paramLabel('exposed gusts') === 'Böen in exponierten Lagen');
add('Text: unbekannter Feldname läuft wörtlich durch',
  paramLabel('fog density') === 'fog density');
add('Text: „south-west" ⇒ „Südwest"', paramValue('south-west') === 'Südwest');
add('Text: „localised" ⇒ „örtlich"', paramValue('localised') === 'örtlich');
add('Text: Zahlenwert bleibt unangetastet', paramValue('~70 [km/h]') === '~70 [km/h]');
add('Text: unbekanntes Wort bleibt englisch statt geraten',
  paramValue('drifting snow') === 'drifting snow');
add('Text: Stufenbezeichnungen vollständig',
  Object.keys(SEVERITY_RANK).every((s) => typeof SEVERITY_LABEL[s] === 'string' && SEVERITY_LABEL[s].length > 3));
add('Text: Rangfolge streng steigend',
  SEVERITY_RANK.Unknown < SEVERITY_RANK.Minor && SEVERITY_RANK.Minor < SEVERITY_RANK.Moderate
  && SEVERITY_RANK.Moderate < SEVERITY_RANK.Severe && SEVERITY_RANK.Severe < SEVERITY_RANK.Extreme);
{
  const detail = fc.features.find((f) => f.properties.details.length > 0);
  add('Text: quantitative Zusätze erscheinen eingedeutscht',
    detail != null && /Böen|Niederschlag|Hagel|Windrichtung|Auftreten|Zugrichtung/.test(detail.properties.details),
    detail?.properties.details);
}

// ===========================================================================
// PHASE W2 — SCHWEIZ (MeteoSchweiz über MeteoAlarm)
// Die Checks ab hier sind NEU. Alle 101 Checks oben sind unverändert geblieben
// — das ist der Regressionsbeweis für Gate GW1.
// ===========================================================================

// ---------------------------------------------------------------------------
// (11) Atom-Index — ein Verzeichnis, KEINE Meldung
// ---------------------------------------------------------------------------
const atom = parseCapAtomIndex(chAtomXml);
add('CH-Atom: 33 Einträge gelesen', atom.entries.length === 33, `${atom.entries.length}`);
add('CH-Atom: kein Eintrag übersprungen', atom.skipped === 0, `skipped=${atom.skipped}`);
add('CH-Atom: jeder Eintrag hat eine CAP-Kennung', atom.entries.every((e) => e.id.startsWith('2.49.0.0.756.0.CH.')));
add('CH-Atom: jeder Eintrag verlinkt sein vollständiges CAP-Dokument',
  atom.entries.every((e) => /^https:\/\/feeds\.meteoalarm\.org\/api\/v1\/warnings\/feeds-switzerland\/[0-9a-f-]+$/.test(e.capUrl)),
  atom.entries[0].capUrl);
add('CH-Atom: Kennungen sind paarweise verschieden (taugen als Cache-Schlüssel)',
  new Set(atom.entries.map((e) => e.id)).size === 33);
{
  // Die einzige Frischebelegung dieser Quelle: MeteoAlarm sendet weder
  // Last-Modified noch ETag. Ohne <updated> wäre „keine Warnungen" unbelegbar.
  const want = Date.parse('2026-08-08T18:05:41.121880Z');
  add('CH-Atom: Feed-<updated> gelesen (einzige Frischebelegung, V-19)',
    atom.updatedMs === want, atom.updatedMs ? new Date(atom.updatedMs).toISOString() : 'null');
  add('CH-Atom: <updated> stammt aus dem Feed-Kopf, nicht aus dem ersten Eintrag',
    atom.updatedMs !== Date.parse('2026-08-08T08:57:45Z'));
}
add('CH-Atom: Rechtehinweis wird wortwörtlich mitgeführt',
  atom.rights.includes('CC BY 4.0') && atom.rights.includes('additional requirements'),
  atom.rights.slice(0, 60));
{
  // Der Kern des Befunds §8.1: der Atom-Feed trägt KEINEN amtlichen Text.
  // Würde eine spätere Änderung ihn doch als Meldungsquelle verwenden, wäre
  // der Steckbrief leer oder englisch — dieser Check hält das fest.
  add('CH-Atom: enthält KEINEN amtlichen Warntext (deshalb nur Index)',
    !/[<:]headline>/.test(chAtomXml) && !/[<:]description>/.test(chAtomXml)
    && !/[<:]instruction>/.test(chAtomXml) && !/[<:]ceiling>/.test(chAtomXml));
  add('CH-Atom: Fremd-Dokument ⇒ leerer Index statt Absturz',
    parseCapAtomIndex('<html><body>kein Atom</body></html>').entries.length === 0);
}

// ---------------------------------------------------------------------------
// (12) Sprachauswahl — der erste Block ist der FALSCHE
// ---------------------------------------------------------------------------
const chDe = parseCapAlert(chHeatSevere, { altitudeUnit: 'metres', language: 'de' });
const chEnDefault = parseCapAlert(chHeatSevere, { altitudeUnit: 'metres' });
{
  add('CH-Sprache: die Meldung führt fünf <info>-Blöcke', (chHeatSevere.match(/<info>/g) ?? []).length === 5);
  add('CH-Sprache: ohne Angabe kommt der ERSTE Block — und der ist englisch',
    chEnDefault.infoLanguage === 'en' && chEnDefault.headline === 'Heat wave', chEnDefault.headline);
  add('CH-Sprache: mit language="de" kommt der deutsche Block',
    chDe.infoLanguage === 'de' && chDe.headline === 'Markante Hitzewelle', chDe.headline);
  add('CH-Sprache: die Auswahl greift auch am Ereignisnamen',
    chDe.event === 'Markante Hitzewelle' && chEnDefault.event === 'Heat wave');
  add('CH-Sprache: kein Rückfall, wenn die Sprache vorliegt', chDe.languageFallback === false);
}
{
  // Der Rückfall muss AUSGEWIESEN werden, nicht still passieren.
  const chXx = parseCapAlert(chHeatSevere, { altitudeUnit: 'metres', language: 'xx' });
  add('CH-Sprache: fehlende Sprache ⇒ Rückfall wird GEMELDET (nicht still)',
    chXx.languageFallback === true && chXx.infoLanguage === 'en');
  add('CH-Sprache: Rückfall liefert trotzdem eine vollständige Meldung',
    chXx.headline.length > 0 && chXx.areas.length > 0);
  // Gegenprobe DWD: genau EIN Block, ausgezeichnet als `de-DE` (gemessen an
  // allen 27 Meldungen der Fixture) ⇒ nie ein Rückfall.
  add('DE-Sprache: DWD führt genau einen Block, ausgezeichnet als „de-DE"',
    alerts.every((a) => a.languageFallback === false && a.infoLanguage === 'de-DE'),
    alerts[0].infoLanguage);
  // Und der Präfix-Treffer greift auch dort: „de" trifft „de-DE". Das Ergebnis
  // muss dasselbe sein wie ohne Angabe — sonst wäre der DE-Pfad doch berührt.
  const deWithLang = parseCapAlert(new TextDecoder().decode((await unzipEntries(bytes))[0].bytes), { language: 'de' });
  add('DE-Sprache: „de" trifft „de-DE" und ändert am DWD-Ergebnis NICHTS',
    JSON.stringify(deWithLang) === JSON.stringify(
      parseCapAlert(new TextDecoder().decode((await unzipEntries(bytes))[0].bytes))));
}
{
  // Gegengeprüft an 306 Meldungen: die Sprachwahl ändert NUR Text.
  add('CH-Sprache: Einstufung ist sprachunabhängig', chDe.severity === chEnDefault.severity);
  add('CH-Sprache: Geometrie ist sprachunabhängig',
    JSON.stringify(chDe.areas.map((a) => a.rings)) === JSON.stringify(chEnDefault.areas.map((a) => a.rings)));
  add('CH-Sprache: Höhenband ist sprachunabhängig',
    chDe.areas[0].ceilingM === chEnDefault.areas[0].ceilingM);
}

// ---------------------------------------------------------------------------
// (13) HÖHENEINHEIT PRO QUELLE — der teuerste mögliche Fehler dieser Phase
//      (ROT-TEST-ANKER: `altitudeUnit` auf 'feet' zwingen ⇒ muss rot werden)
// ---------------------------------------------------------------------------
{
  const chExtreme = parseCapAlert(chHeatExtreme, { altitudeUnit: 'metres', language: 'de' });
  const ceil = chExtreme.areas[0].ceilingM;
  add('EINHEIT CH: 600.0 ist bereits METER und bleibt 600 m',
    Math.abs(ceil - 600) < 0.001, `${ceil}`);
  // Der ausdrücklich geforderte Gegen-Check: NIEMALS mit 0,3048 multiplizieren.
  add('EINHEIT CH: NIEMALS mit 0,3048 gerechnet (600 ft wären 182,88 m)',
    Math.abs(ceil - 600 * 0.3048) > 1, `${ceil} m`);
  const asFeet = parseCapAlert(chHeatExtreme, { altitudeUnit: 'feet', language: 'de' });
  add('EINHEIT: der Parameter wirkt wirklich (feet ⇒ 182,88 m, metres ⇒ 600 m)',
    Math.abs(asFeet.areas[0].ceilingM - 182.88) < 0.01 && Math.abs(ceil - 600) < 0.001,
    `feet=${asFeet.areas[0].ceilingM.toFixed(2)} · metres=${ceil}`);
  add('EINHEIT CH: Untergrenze durchweg 0 m', chExtreme.areas.every((a) => a.floorM === 0));
  add('EINHEIT: Vorgabe ist FUSS — der DWD-Pfad bleibt ohne Zutun unverändert',
    Math.abs(parseCapAlert(chHeatExtreme).areas[0].ceilingM - 182.88) < 0.01);
  // Und die DE-Fixture muss unter der Vorgabe exakt das W1-Ergebnis liefern.
  const deDefault = await parseCapArchive(bytes);
  add('EINHEIT DE: Vollstand ohne Optionen = W1-Ergebnis (600/400/3000 m)',
    [600, 400, CEILING_UNRESTRICTED_M].every((m) =>
      deDefault.alerts.some((a) => a.areas.some((ar) => ar.ceilingM != null && Math.abs(ar.ceilingM - m) < 0.01))));
}
{
  // V-176: `ceiling` widerspricht bei CH dem amtlichen Text. Gemessen an der
  // eingefrorenen Meldung: der Text sagt „unterhalb von 800 m", das Feld 3000.
  // Der Höhenband-Hinweis darf für CH deshalb NICHT aus `ceiling` kommen.
  const said = chDe.description.match(/unterhalb von (\d+) m/);
  add('V-176: amtlicher CH-Text nennt eine Höhe („unterhalb von 800 m")',
    said != null && said[1] === '800', said?.[0]);
  add('V-176: das Feld `ceiling` sagt etwas ANDERES (3000 m = „unbeschränkt")',
    Math.abs(chDe.areas[0].ceilingM - CEILING_UNRESTRICTED_M) < 0.01,
    `${chDe.areas[0].ceilingM} m gegen ${said?.[1]} m im Text`);
}

// ---------------------------------------------------------------------------
// (14) Geometrie CH — dieselbe Falle wie bei DE, andere Landschaft
// ---------------------------------------------------------------------------
{
  const ring = chDe.areas[0].rings[0];
  add('CH-Geometrie: Ring vorhanden und geschlossen',
    ring.length >= 4 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1],
    `${ring.length} Punkte`);
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  // „Frick-Leibstadt" liegt im Aargau (~47,6 °N / 8,2 °O). Vertauscht läge es
  // bei 8,2 °N / 47,6 °O — in Somalia, ohne dass etwas „kaputt" aussähe.
  add('CH-Geometrie: „Frick-Leibstadt" liegt im Aargau, nicht in Somalia',
    cx > 7.8 && cx < 8.6 && cy > 47.3 && cy < 47.9,
    `Schwerpunkt ${cy.toFixed(2)} °N / ${cx.toFixed(2)} °O`);
  add('CH-Geometrie: Gebietsname aus der Meldung', chDe.areas[0].desc === 'Frick-Leibstadt', chDe.areas[0].desc);
  add('CH-Geometrie: alle Punkte im Schweizer Fenster',
    ring.every(([lon, lat]) => lon > 5.9 && lon < 10.6 && lat > 45.7 && lat < 47.9));
  add('CH-Geometrie: KEINE Warnzellen-Kennungen (die sind DWD-spezifisch)',
    chDe.areas.every((a) => a.warnCellIds.length === 0));
}

// ---------------------------------------------------------------------------
// (15) Zitat-Treue CH + Herkunft der Einstufung
// ---------------------------------------------------------------------------
{
  add('CH-Zitat: Überschrift wortwörtlich', chDe.headline === 'Markante Hitzewelle');
  add('CH-Zitat: Beschreibung beginnt mit der amtlichen Höhenzeile',
    chDe.description.startsWith('- Warnung gilt unterhalb von 800 m ü.M.'),
    chDe.description.slice(0, 42));
  add('CH-Zitat: Handlungshinweis vorhanden und unverändert',
    chDe.instruction.startsWith('Mind. 1.5 Liter pro Tag trinken'), chDe.instruction.slice(0, 34));
  add('CH-Zitat: Umlaute korrekt dekodiert (UTF-8)',
    chDe.description.includes('Mögliche Auswirkungen') && chDe.instruction.includes('ungesüsste'));
  add('CH-Quelle: Absender ist MeteoSchweiz', chDe.senderName === 'MeteoSwiss', chDe.senderName);
}
{
  // Kein AREA_COLOR, kein LICENSE — die amtliche Stufe steht im <parameter>.
  add('CH-Farbe: die Meldung führt KEIN AREA_COLOR', chDe.areaColor === null);
  add('CH-Lizenz: die Meldung führt KEIN LICENSE-eventCode (darf nicht stumm die Attribution kippen)',
    chDe.license === null);
  const aw = chDe.parameters.find((p) => p.name === 'awareness_level');
  add('CH-Stufe: awareness_level trägt Stufe UND amtliches Farbwort',
    aw != null && aw.value === '3; orange; Severe', aw?.value);
  const awX = parseCapAlert(chHeatExtreme, { altitudeUnit: 'metres', language: 'de' })
    .parameters.find((p) => p.name === 'awareness_level');
  add('CH-Stufe: die höchste gemessene Stufe ist „4; red; Extreme"',
    awX != null && awX.value === '4; red; Extreme', awX?.value);
  const thunder = parseCapAlert(chThunder, { altitudeUnit: 'metres', language: 'de' });
  add('CH-Stufe: zweites Ereignis (Gewitter) ebenfalls sauber gelesen',
    thunder.headline === 'Heftiges Gewitter' && thunder.severity === 'Severe', thunder.headline);
  add('CH: Extreme ist real belegt — beim DWD ist diese Stufe bis heute ungemessen',
    parseCapAlert(chHeatExtreme, { altitudeUnit: 'metres', language: 'de' }).severity === 'Extreme'
    && !alerts.some((a) => a.severity === 'Extreme'));
  add('CH: alle drei eingefrorenen Meldungen sind darstellbar',
    [chDe, thunder, parseCapAlert(chHeatExtreme, { altitudeUnit: 'metres', language: 'de' })].every(isRenderableAlert));
}

// ---------------------------------------------------------------------------
// (16) Quellenreinheit — Farbe, Stufe und Höhenband je Quelle
// ---------------------------------------------------------------------------
const chAlerts = [chDe,
  parseCapAlert(chHeatExtreme, { altitudeUnit: 'metres', language: 'de' }),
  parseCapAlert(chThunder, { altitudeUnit: 'metres', language: 'de' })];
{
  add('Quelle: DE bleibt bei der amtlichen AREA_COLOR (Vorgabe unverändert)',
    alerts.every((a) => warnColor(a) === a.areaColor && warnColor(a, WARN_SOURCE_DE) === a.areaColor));
  const aw = awarenessOf(chDe);
  add('Quelle CH: awareness_level wird zerlegt', aw.level === 3 && aw.colorWord === 'orange', JSON.stringify(aw));
  add('Quelle CH: Farbe kommt aus der amtlichen Stufe, nicht aus DWD-Werten',
    warnColor(chDe, WARN_SOURCE_CH) === AWARENESS_COLOR.orange
    && warnColor(chAlerts[1], WARN_SOURCE_CH) === AWARENESS_COLOR.red,
    `${warnColor(chDe, WARN_SOURCE_CH)} / ${warnColor(chAlerts[1], WARN_SOURCE_CH)}`);
  add('Quelle CH: der ungemessene DWD-Fallback greift NICHT',
    warnColor(chAlerts[1], WARN_SOURCE_CH) !== SEVERITY_FALLBACK_COLOR.Extreme
    && warnColor(chDe, WARN_SOURCE_CH) !== SEVERITY_FALLBACK_COLOR.Severe);
  add('Quelle CH: Farbe ist als ABGELEITET gekennzeichnet, DE als amtlich',
    WARN_SOURCE_CH.colorOrigin === 'derived' && WARN_SOURCE_DE.colorOrigin === 'official');
  // Ohne awareness_level darf nichts erfunden werden.
  add('Quelle CH: ohne awareness_level ⇒ dokumentierter Fallback statt Fantasiefarbe',
    warnColor({ ...chDe, parameters: [] }, WARN_SOURCE_CH) === SEVERITY_FALLBACK_COLOR[chDe.severity]);
}
{
  // Stufennummern sind NICHT kompatibel — Bezeichnungen müssen sich trennen.
  add('Stufe CH: amtliche Schweizer Gefahrenstufe statt DWD-Staffelung',
    warnSeverityLabel(chDe, WARN_SOURCE_CH) === 'Gefahrenstufe 3 · erhebliche Gefahr',
    warnSeverityLabel(chDe, WARN_SOURCE_CH));
  add('Stufe CH: Stufe 4 heißt „grosse Gefahr"',
    warnSeverityLabel(chAlerts[1], WARN_SOURCE_CH) === 'Gefahrenstufe 4 · grosse Gefahr');
  add('Stufe: keine DWD-Bezeichnung auf einer Schweizer Fläche',
    chAlerts.every((a) => !Object.values(SEVERITY_LABEL).includes(warnSeverityLabel(a, WARN_SOURCE_CH))));
  add('Stufe DE: Vorgabe liefert unverändert die DWD-Bezeichnung',
    alerts.every((a) => warnSeverityLabel(a) === SEVERITY_LABEL[a.severity]));
}
{
  // V-176 im Feature: CH darf KEINEN aus `ceiling` erzeugten Hinweis tragen.
  const chFc = buildWarnFeatures(chAlerts, Date.parse('2026-08-09T12:00:00Z'), WARN_SOURCE_CH);
  add('V-176: CH-Features tragen KEINEN aus `ceiling` erzeugten Höhenhinweis',
    chFc.features.length > 0 && chFc.features.every((f) => f.properties.heightNote === ''),
    `${chFc.features.length} Features`);
  add('V-176: der amtliche Text mit der Höhe bleibt trotzdem vollständig erhalten',
    chFc.features.some((f) => f.properties.description.includes('unterhalb von 800 m')));
  add('V-176: DE behält seinen Höhenhinweis (600 m) unverändert',
    fc.features.some((f) => f.properties.heightNote === 'gilt nur unterhalb 600 m Höhe'));
  add('CH-Features: Quelle und Herausgeber stehen am Feature',
    chFc.features.every((f) => f.properties.sourceKey === 'CH' && f.properties.issuer === 'MeteoSchweiz'));
  add('DE-Features: Quelle und Herausgeber stehen am Feature',
    fc.features.every((f) => f.properties.sourceKey === 'DE' && f.properties.issuer === 'Deutscher Wetterdienst'));
  add('CH-Features: Steuerfelder von MeteoAlarm stehen NICHT im Steckbrief',
    chFc.features.every((f) => !f.properties.details.includes('awareness')));
  add('CH-Features: kein Sprach-Hinweis, solange die deutsche Fassung vorliegt',
    chFc.features.every((f) => f.properties.languageNote === ''));
  const fallbackFc = buildWarnFeatures(
    [parseCapAlert(chHeatSevere, { altitudeUnit: 'metres', language: 'xx' })],
    Date.parse('2026-08-09T12:00:00Z'), WARN_SOURCE_CH);
  add('CH-Features: fehlende Sprachfassung wird AM FEATURE ausgewiesen',
    fallbackFc.features.every((f) => f.properties.languageNote.includes('englische')));
}

// ---------------------------------------------------------------------------
// (17) Ein Layer, zwei Quellen
// ---------------------------------------------------------------------------
{
  const t = Date.parse('2026-08-09T12:00:00Z');
  const multi = buildWarnFeaturesMulti(
    [{ alerts, source: WARN_SOURCE_DE }, { alerts: chAlerts, source: WARN_SOURCE_CH }], t);
  const de = buildWarnFeatures(alerts, t, WARN_SOURCE_DE);
  const ch = buildWarnFeatures(chAlerts, t, WARN_SOURCE_CH);
  add('Multi: keine Meldung geht beim Zusammenlegen verloren',
    multi.features.length === de.features.length + ch.features.length,
    `${de.features.length} DE + ${ch.features.length} CH = ${multi.features.length}`);
  add('Multi: beide Länder sind vertreten',
    multi.features.some((f) => f.properties.sourceKey === 'DE')
    && multi.features.some((f) => f.properties.sourceKey === 'CH'));
  add('Multi: schwächere Stufe zeichnet zuerst — über Ländergrenzen hinweg',
    multi.features.every((f, i, arr) => i === 0 || arr[i - 1].properties.sev <= f.properties.sev));
  add('Multi: jede Fläche behält die Farbe IHRER Quelle',
    multi.features.every((f) => (f.properties.sourceKey === 'CH'
      ? Object.values(AWARENESS_COLOR).includes(f.properties.color)
      : true)));
  const sum = warnSummaryMulti(
    [{ alerts, source: WARN_SOURCE_DE }, { alerts: chAlerts, source: WARN_SOURCE_CH }], t);
  add('Multi-Legende: Gesamtzahl ist die Summe beider Länder',
    sum.total === sum.perSource.reduce((n, s) => n + s.total, 0));
  add('Multi-Legende: je Land eine eigene Zeile (Skalen sind nicht vergleichbar)',
    sum.perSource.length === 2 && sum.perSource[0].source.country === 'Deutschland'
    && sum.perSource[1].source.country === 'Schweiz');
  add('Multi-Legende: CH-Stufen erscheinen mit Schweizer Bezeichnung',
    sum.perSource[1].tiers.every((tr) => tr.label.startsWith('Gefahrenstufe')),
    sum.perSource[1].tiers.map((tr) => tr.label).join(' | '));
  add('Multi: eine leere Quelle kippt die andere nicht',
    buildWarnFeaturesMulti([{ alerts: [], source: WARN_SOURCE_CH },
      { alerts, source: WARN_SOURCE_DE }], t).features.length === de.features.length);
  add('Multi: beide leer ⇒ leere FeatureCollection, kein Absturz',
    buildWarnFeaturesMulti([{ alerts: [], source: WARN_SOURCE_DE },
      { alerts: [], source: WARN_SOURCE_CH }], t).features.length === 0);
}

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail != null ? `  (${c.detail})` : ''}`);
console.log(`\n${failed === 0 ? `ALLE ${passed} CHECKS PASS` : `${failed} von ${checks.length} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failed === 0 ? 0 : 1);
