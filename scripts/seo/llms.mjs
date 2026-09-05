/**
 * GEO-Schicht: `llms.txt` und `llms-full.txt` (SEO/GEO 2026, Etappe E9). Build-only.
 *
 * Bisher lag `llms.txt` als HANDGESCHRIEBENE Datei in `public/`. Genau daran ist sie
 * veraltet: Sie nannte „~140 Orte" bei 138, verlinkte Go/No-Go auf eine Query-URL ohne
 * eigenen Canonical und behauptete, der Globus zeige gebündelte Beispieldaten, während er
 * GFS live per HTTP-Range liest. Deshalb entsteht sie jetzt beim Build aus denselben
 * Listen wie die Seiten selbst (dieselbe Lehre wie bei der Modelltabelle in /lizenzen/,
 * V-80: eine abgetippte Zweitliste driftet).
 *
 * `llms.txt` ist die Landkarte (kurz, Links, Grenzen), `llms-full.txt` der Volltext:
 * Direktantworten aller Explainer, Methodik-Seiten, Zielgruppen-Seiten und Glossar-Begriffe,
 * damit ein Sprachmodell zitieren kann, ohne 200 Seiten einzeln zu holen.
 */

const stripTags = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Kopfzeile + Grenzen — der Teil, der nicht aus Listen kommt. */
function header(site, updated) {
  return `# buscosun

> Kostenlose, tracker-freie Wetter-Web-App für Deutschland, Österreich und die Schweiz. Alle Daten stammen
> aus amtlichen Quellen (DWD, GeoSphere Austria, MeteoSchweiz) und werden über ein digitales Geländemodell
> höhenkorrigiert. Kein Konto, keine Werbung, keine Tracker; die Berechnung läuft im Browser.

Stand: ${updated} · Kanonische Domain: ${site.url} · Sprache: Deutsch

## Zitieren

Zitate sind erwünscht. Bitte die kanonische URL der jeweiligen Seite nennen und die Datenquelle mitführen
(z. B. „buscosun, Datenbasis DWD ICON-D2"). buscosun **verändert** die Rohdaten (Höhenkorrektur,
Multi-Modell-Mischung, Radar-Nowcast, eigene Farbskalen) — dargestellte Werte sind deshalb nicht identisch
mit den Rohprodukten der Wetterdienste. **buscosun gibt keine amtlichen Warnungen heraus**; amtliche
Warnungen werden ausschließlich wörtlich zitiert und stammen von DWD, GeoSphere Austria und MeteoSchweiz.
Für Aussagen zur Rechenweise bitte die Methodik-Seiten zitieren, nicht die Startseite.
`;
}

const LIMITS = `## Grenzen (ausdrücklich)

- Reine Frontend-App ohne Server: keine Push-Benachrichtigungen bei geschlossener App, keine Konten,
  keine gespeicherten Nutzerdaten.
- Kein amtliches Briefing: kein METAR/TAF, kein Lawinenlagebericht als Datenprodukt (nur Deep-Link zur
  amtlichen Quelle), keine Einsatz- oder Alarmierungsfunktion.
- Länder-Asymmetrien: amtliche Unwetterwarnungen für Deutschland (DWD) und die Schweiz (über MeteoAlarm);
  für Österreich zeigt buscosun keine Warnflächen. UV und Pollen liegen amtlich nur für Deutschland vor,
  für Österreich und die Schweiz sind es Schätzungen bzw. ausdrücklich zuschaltbare Fremdquellen.
- Radar-Horizonte: Deutschland bis 2 Stunden (RADOLAN-RV), Österreich bis 3 Stunden (INCA), Schweiz nur
  die Gegenwart (rzc). Danach beginnt Modellvorhersage — der Übergang wird ausgewiesen.
- Waldbrand: Satellitendetektionen sind keine Brandmeldungen. „Bestätigt" heißt ein Brand nur mit Quelle
  im selben Satz (EFFIS-Kartierung oder Copernicus-EMS-Aktivierung); unbestätigt ist der Normalfall.
  Österreich veröffentlicht keine offene amtliche Waldbrandstufe.
- Klimatabellen auf Ortsseiten sind Schätzungen aus umliegenden Stationen (${'${clima}'}), keine Messreihen
  des jeweiligen Ortes.
- Der 3D-Globus nutzt GFS mit 1° Gitterweite — global, aber deutlich gröber als die DACH-Layer.
`;

/**
 * `llms.txt` — die Landkarte. Alle Zahlen und Listen kommen aus dem Build.
 */
export function buildLlmsTxt({ site, updated, places, explainers, tools, methodik, audiences, glossary, events, subRoutes }) {
  const byCountry = places.reduce((a, p) => ((a[p.country] = (a[p.country] || 0) + 1), a), {});
  const layerSubs = subRoutes.filter((x) => x.route.id === 'wetterkarte');
  const link = (path, label) => `- [${label}](${site.url}${path})`;

  const sections = [];
  sections.push(header(site, updated));

  sections.push(`## Funktionen (je eine kanonische URL)

${link('/wetterkarte', 'Interaktive Wetterkarte DACH')}: ${layerSubs.length} Layer mit je eigener URL, z. B.
  ${layerSubs.slice(0, 6).map((x) => site.url + x.path).join(', ')} …
${link('/warnungen', 'Amtliche Unwetterwarnungen')}: DWD und MeteoSchweiz, Warntexte wortwörtlich (Österreich fehlt).
${link('/regenradar', 'Regenradar')}: gemessenes Landesradar DE/AT/CH plus Nowcast im jeweiligen Horizont.
${link('/vorhersage', 'Vorhersage mit Konfidenz')}: Modellvergleich, Unsicherheits-Spread, Trefferquoten-Rückblick.
${link('/tourenplanung', 'Tourenplanung')}: Wetter je Kilometer zur Ankunftszeit aus GPX/TCX/FIT/KML, inklusive E-Bike-Reichweite.
${link('/eventplanung', 'Event-Planung')}: bester Tag der nächsten sieben für ein Vorhaben, je Anlass eine eigene URL
  (${['grillen', 'hochzeit', 'drohne', 'fotografie', 'sterne'].map((s) => site.url + '/eventplanung/' + s).join(', ')} …).
${link('/atmosphaere', 'Atmosphäre')}: Vertikalschnitt, Föhn, Thermik — und das Arbeitsfenster Go/No-Go unter
  ${site.url}/atmosphaere/arbeitsfenster (Böe auf Arbeitshöhe für Drohne, Kran, Höhenarbeit).
${link('/waldbrand', 'Brandradar DACH')}: EU-Gefahrenindex, aktive Brände aus Satellitendaten, Trockenheit,
  Historie seit 2020 (${site.url}/waldbrand/historie) und Thermalanomalien (${site.url}/waldbrand/thermalanomalien).
${link('/wetterarchiv', 'Wetterarchiv & Klima')}: Rückblick und Veränderung je Ort.
${link('/globus', '3D-Globus')}: globales Wind-, Temperatur- und Druckfeld aus dem aktuellen GFS-Lauf (NOAA).
${link('/validierung', 'Validierung')}: Live-Hindcast des Nowcasts gegen gemessenes Radar (Brier Skill Score,
  Kalibrierungsfehler, Reliability-Diagramm).`);

  sections.push(`## Wetter nach Ort

${link('/wetter/', `Übersicht aller ${places.length} Orte`)} (Deutschland ${byCountry.DE || 0} · Österreich ${byCountry.AT || 0} · Schweiz ${byCountry.CH || 0}).
Jede Ortsseite nennt Lage, Höhe, Quellen je Land, eine Klimatabelle im Jahresverlauf, die Sonnenzeiten je Monat
und einen Abschnitt „Was wir für diesen Ort nicht wissen". Beispiele:
${['muenchen', 'innsbruck', 'zermatt'].map((s) => link('/wetter/' + s + '/', 'Wetter ' + s)).join('\n')}`);

  sections.push(`## Wie buscosun rechnet (Methodik, mit Konstanten und Grenzen)

${link('/methodik/', 'Methodik-Übersicht')}
${methodik.map((m) => link(`/methodik/${m.slug}/`, m.title)).join('\n')}`);

  sections.push(`## Erklärungen

${link('/wissen/', `Wetterwissen (${explainers.length} Beiträge)`)}
${explainers.map((e) => link(`/wissen/${e.slug}/`, e.title)).join('\n')}`);

  sections.push(`## Nach Anwendung

${link('/fuer/', 'Übersicht')}
${audiences.map((a) => link(`/fuer/${a.slug}/`, a.title)).join('\n')}`);

  sections.push(`## Nachschlagewerk und Werkzeuge

${link('/glossar/', `Glossar (${glossary.length} Begriffe, Anker je Begriff)`)}
${link('/funktionen/', `Funktionsseiten (${tools.length})`)}
${link('/wetterlage/', `Wetterlagen und Einordnungen (${events.length})`)}
${link('/lizenzen/', 'Quellen & Lizenzen (Modelltabelle direkt aus dem Katalog der App)')}
${link('/ueber/', 'Über buscosun')} · ${link('/ohne-tracker/', 'Ohne Tracker — überprüfbar').slice(2)}
${link('/llms-full.txt', 'Volltext aller Erklärungen, Methodik, Zielgruppen und Glossar-Begriffe')}
`);

  sections.push(LIMITS.replace('${clima}', '178 Stationen, 1995–2024'));

  sections.push(`## Datenquellen

DWD (GeoNutzV) · GeoSphere Austria (CC BY 4.0) · MeteoSchweiz (CC BY 4.0) · Copernicus/EFFIS/GWIS ·
ECMWF · NOAA · Météo-France · NASA FIRMS · Karten von OpenFreeMap/OpenMapTiles auf OpenStreetMap-Basis (ODbL).
Vollständiges Verzeichnis mit den geforderten Nennungstexten: ${site.url}/lizenzen/
`);

  return sections.join('\n') + '\n';
}

/**
 * `llms-full.txt` — Volltext für Modelle, die zitieren statt zu raten.
 */
export function buildLlmsFullTxt({ site, updated, explainers, methodik, audiences, glossary, tools, events }) {
  const out = [];
  out.push(`# buscosun — Volltext für Sprachmodelle`);
  out.push(`Stand: ${updated}. Kanonische Domain: ${site.url}. Kurzfassung mit allen Links: ${site.url}/llms.txt`);
  out.push(`Zitate bitte mit der kanonischen URL der jeweiligen Seite. buscosun gibt keine amtlichen Warnungen heraus.\n`);

  out.push(`\n================================================================\n## Erklärungen (/wissen/)\n`);
  for (const e of explainers) {
    out.push(`### ${e.title}\nURL: ${site.url}/wissen/${e.slug}/\nStand: ${e.dateModified}\n`);
    out.push(`Direktantwort: ${stripTags(e.answer)}\n`);
    for (const sec of e.sections || []) out.push(`${sec.h2}\n${stripTags(sec.html)}\n`);
    for (const f of e.faqs || []) out.push(`Frage: ${f.q}\nAntwort: ${f.a}\n`);
    if (e.sources?.length) out.push(`Quellen: ${e.sources.map((s) => `${s.name} (${s.url})`).join(' · ')}\n`);
  }

  out.push(`\n================================================================\n## Methodik (/methodik/) — wie buscosun rechnet\n`);
  for (const m of methodik) {
    out.push(`### ${m.title}\nURL: ${site.url}/methodik/${m.slug}/\n`);
    out.push(`Direktantwort: ${stripTags(m.answer)}\n`);
    for (const sec of m.sections || []) out.push(`${sec.h2}\n${stripTags(sec.html)}\n`);
    for (const f of m.faqs || []) out.push(`Frage: ${f.q}\nAntwort: ${f.a}\n`);
  }

  out.push(`\n================================================================\n## Nach Anwendung (/fuer/)\n`);
  for (const a of audiences) {
    out.push(`### ${a.title}\nURL: ${site.url}/fuer/${a.slug}/\n`);
    out.push(`Direktantwort: ${stripTags(a.answer)}\n`);
    for (const sec of a.sections || []) out.push(`${sec.h2}\n${stripTags(sec.html)}\n`);
    for (const f of a.faqs || []) out.push(`Frage: ${f.q}\nAntwort: ${f.a}\n`);
  }

  out.push(`\n================================================================\n## Funktionen (/funktionen/)\n`);
  for (const t of tools) {
    out.push(`### ${t.title}\nURL: ${site.url}/funktionen/${t.slug}/\nÖffnet: ${site.url}${t.deepLink}\n`);
    out.push(`Direktantwort: ${stripTags(t.answer)}\n`);
    for (const sec of t.sections || []) out.push(`${sec.h2}\n${stripTags(sec.html)}\n`);
  }

  out.push(`\n================================================================\n## Wetterlagen (/wetterlage/)\n`);
  for (const ev of events) {
    out.push(`### ${ev.title}\nURL: ${site.url}/wetterlage/${ev.slug}/\nStand: ${ev.dateModified}\n`);
    out.push(`${stripTags(ev.dek)}\n`);
    for (const sec of ev.sections || []) out.push(`${sec.h2}\n${stripTags(sec.html)}\n`);
  }

  out.push(`\n================================================================\n## Glossar (/glossar/)\n`);
  for (const g of glossary) {
    out.push(`### ${g.term}\nURL: ${site.url}/glossar/#${g.id}\n${g.short}\n${stripTags(g.html)}\n`);
  }

  return out.join('\n') + '\n';
}
