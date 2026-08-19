/**
 * Rechtsseiten: /impressum/, /datenschutz/, /kontakt/ (V-103, build-only).
 *
 * ⚠️ KEINE RECHTSBERATUNG. Dieses Modul beschreibt ausschließlich technisch
 * verifizierte Sachverhalte (localStorage-Schlüssel, kontaktierte Server,
 * Berechtigungen) — die juristische Prüfung des Textes bleibt Jans Aufgabe.
 *
 * Warum die Seiten nötig sind: Die App fordert aktiv den Standort an
 * (`src/nowcast/NowcastPage.tsx`), kann Benachrichtigungen anfragen
 * (`src/notifications/notificationTransport.ts`), speichert 21 Einträge im
 * Browser und kontaktiert rund 30 fremde Server. Bis 2026-08-01 gab es dazu
 * keine einzige Informationsseite.
 *
 * 🔴 OFFEN: `OPERATOR` enthält Platzhalter, die NUR der Betreiber liefern kann.
 * Solange sie auf TODO stehen, rendert die Seite an der Stelle einen sichtbaren
 * Hinweis statt erfundener Daten, und `generate-seo.mjs` warnt beim Build.
 */

/** Kennzeichnet einen noch einzutragenden Wert. */
export const TODO = '@@TODO_JAN@@';

/**
 * Betreiberangaben für das Impressum (§ 5 DDG).
 * Ladungsfähige Anschrift heißt: echte Anschrift, kein Postfach.
 */
export const OPERATOR = {
  /** Vor- und Nachname bzw. Firma inkl. Rechtsform. */
  name: TODO,
  /** Straße + Hausnummer. */
  street: TODO,
  /** PLZ + Ort. */
  city: TODO,
  /** Land. */
  country: 'Deutschland',
  /** Kontakt-E-Mail — bereits produktiv in src/feedback/FeedbackPage.tsx. */
  email: 'contact@buscosun.com',
  /** Optional: Telefonnummer (nicht zwingend, wenn E-Mail schnell erreichbar). */
  phone: '',
  /**
   * Inhaltlich Verantwortlicher nach § 18 Abs. 2 MStV — nötig, weil unter
   * /wetterlage/ redaktionelle Beiträge erscheinen (NewsArticle-Markup).
   * Leer lassen, wenn identisch mit `name`.
   */
  editorial: '',
  /** Optional: USt-IdNr., Registereintrag, Aufsichtsbehörde. */
  vatId: '',
};

export function operatorIncomplete() {
  return Object.values(OPERATOR).some((v) => v === TODO);
}

/** Ein Feld fürs Rendering: echter Wert oder sichtbarer Fehlhinweis. */
function field(value, label) {
  if (value === TODO) {
    return `<mark class="todo">⚠ ${label} — noch einzutragen</mark>`;
  }
  return value;
}

// --- Faktenbasis (am Code verifiziert, 2026-08-01) ---------------------------

/**
 * Server, die der Browser beim Benutzen der App kontaktiert.
 * `proxied: true` = läuft über die eigene Domain; der Anbieter sieht die
 * Besucher-IP dann NICHT, sondern nur den Server von buscosun.
 */
export const CONTACTED_HOSTS = [
  { group: 'Wetterdaten der amtlichen Dienste', proxied: true, hosts: [
    'opendata.dwd.de (Deutscher Wetterdienst)',
    'noaa-gfs-bdp-pds.s3.amazonaws.com (NOAA, USA)',
    'rgw.cscs.ch (MeteoSchweiz / CSCS)',
    'meteofrance-pnt.s3.rbx.io.cloud.ovh.net (Météo-France)',
    'data.ecmwf.int (ECMWF)',
  ] },
  { group: 'Wetterdaten und Messwerte (direkt)', proxied: false, hosts: [
    'maps.dwd.de (Deutscher Wetterdienst — Radar-/Satellitenbilder)',
    'dataset.api.hub.geosphere.at, www.geosphere.at (GeoSphere Austria)',
    'data.geo.admin.ch, www.meteoschweiz.admin.ch (MeteoSchweiz)',
    'api.brightsky.dev (DWD-Aufbereitung, Deutschland)',
    'api.open-meteo.com und Unterdienste (nur nach ausdrücklicher Zustimmung)',
    'data.meteostat.net (historische Klimadaten)',
    'dmigw.govcloud.dk, api.ipma.pt, opendata-download-metobs.smhi.se (Nachbarländer)',
  ] },
  { group: 'Karten, Gelände und Ortssuche (direkt)', proxied: false, hosts: [
    'tiles.openfreemap.org (Kartenkacheln, OpenStreetMap-Daten)',
    'nominatim.openstreetmap.org (Ortssuche)',
    'elevation-tiles-prod.s3.amazonaws.com (Geländehöhen)',
    'server.arcgisonline.com (Satelliten-/Geländehintergrund im Regenradar)',
  ] },
];

/** Was die App im Browser speichert — vollständig, gruppiert nach Zweck. */
export const STORAGE_GROUPS = [
  { purpose: 'Gemerkte Orte und zuletzt besuchte Orte',
    keys: ['buscosun.favorites.v1', 'buscosun.history.favorites.v1', 'buscosun.history.recents.v1', 'buscosun.radar.lastview.v1'] },
  { purpose: 'Anzeige-Einstellungen (Ansichten, Modellwahl, Dunkelmodus)',
    keys: ['buscosun.atm.lens.v1', 'buscosun.forecast.compareMetric.v1', 'buscosun.forecast.compareSel.v1', 'buscosun.forecast.distMode.v1', 'buscosun.history.dark.v1', 'buscosun.threed.gonogo.v1', 'fusion2d.default', 'bs-temp-labels-v1', 'buscosun.vsd.limit.*'] },
  { purpose: 'Selbst gesetzte Schwellenwerte und Hinweise',
    keys: ['buscosun.notify.settings.v1', 'buscosun.notify.subscriptions.v1', 'buscosun.notify.delivered.v1', 'buscosun.nowcast.alerts.config.v1', 'buscosun.nowcast.alerts.locs.v1', 'buscosun.nowcast.alerts.state.v1'] },
  { purpose: 'Einwilligung und Einführung',
    keys: ['buscosun.optin.openMeteo.v1', 'buscosun.intro.seen.v1'] },
  { purpose: 'Zwischenspeicher für Wetterdaten (Beschleunigung)',
    keys: ['bc_wind_now_v2', 'Cache-API- und IndexedDB-Einträge für Modelldateien'] },
];

// --- Seiteninhalte ----------------------------------------------------------

const p = (s) => `<p>${s}</p>`;
const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

function impressumSections() {
  const addr = [
    field(OPERATOR.name, 'Name / Firma'),
    field(OPERATOR.street, 'Straße und Hausnummer'),
    field(OPERATOR.city, 'PLZ und Ort'),
    OPERATOR.country,
  ].join('<br />');

  return [
    { h2: 'Angaben gemäß § 5 DDG', html: `<address>${addr}</address>` },
    { h2: 'Kontakt', html: ul([
      `E-Mail: <a href="mailto:${OPERATOR.email}">${OPERATOR.email}</a>`,
      ...(OPERATOR.phone ? [`Telefon: ${OPERATOR.phone}`] : []),
    ]) },
    ...(OPERATOR.editorial || OPERATOR.vatId ? [{ h2: 'Weitere Angaben', html: ul([
      ...(OPERATOR.editorial ? [`Inhaltlich verantwortlich nach § 18 Abs. 2 MStV: ${OPERATOR.editorial}`] : []),
      ...(OPERATOR.vatId ? [`Umsatzsteuer-Identifikationsnummer: ${OPERATOR.vatId}`] : []),
    ]) }] : []),
    { h2: 'Haftung für Inhalte und Links', html:
      p('buscosun stellt Wetterinformationen aus offenen, überwiegend amtlichen Quellen dar. Die Darstellung erfolgt nach bestem Wissen, ersetzt aber <strong>keine amtliche Warnung und kein offizielles Briefing</strong>. Für Entscheidungen mit Sicherheitsrelevanz sind ausschließlich die zuständigen amtlichen Stellen maßgeblich — die Datenquellen sind in der App an jeder Karte ausgewiesen.') +
      p('Für Inhalte externer Links sind deren Betreiber verantwortlich. Zum Zeitpunkt der Verlinkung waren keine Rechtsverstöße erkennbar.') },
  ];
}

function datenschutzSections() {
  const hostBlocks = CONTACTED_HOSTS.map((g) =>
    `<h3>${g.group}</h3>` +
    p(g.proxied
      ? 'Diese Daten holt buscosun über die eigene Domain. Der jeweilige Anbieter sieht dabei <strong>nicht</strong> Ihre IP-Adresse, sondern nur den Server von buscosun.'
      : 'Diese Server kontaktiert Ihr Browser <strong>direkt</strong>. Dabei wird technisch bedingt Ihre IP-Adresse übertragen.') +
    ul(g.hosts),
  ).join('');

  const storageBlocks = STORAGE_GROUPS.map((g) =>
    `<h3>${g.purpose}</h3>${ul(g.keys.map((k) => `<code>${k}</code>`))}`,
  ).join('');

  return [
    { h2: 'Kurzfassung', html:
      p('buscosun setzt <strong>keine Cookies</strong>, nutzt <strong>keine Analyse- oder Tracking-Dienste</strong>, hat <strong>keine Benutzerkonten</strong> und legt <strong>kein Nutzerprofil</strong> an. Alle Einstellungen bleiben in Ihrem Browser. Es gibt keine Registrierung und keine Anmeldung.') +
      p('Beim bloßen Aufruf der Startseite baut Ihr Browser <strong>keine Verbindung zu einem Drittanbieter</strong> auf: Schriften, Symbole und Programmcode liefert ausschließlich unsere eigene Domain. Erst wenn Sie eine Karte, eine Ortssuche oder eine Vorhersage benutzen, werden die unten aufgeführten Dienste kontaktiert.') },

    { h2: 'Verantwortlich', html:
      p(`Verantwortlich im Sinne der DSGVO ist ${field(OPERATOR.name, 'Name / Firma')}, ${field(OPERATOR.city, 'PLZ und Ort')} (siehe <a href="/impressum/">Impressum</a>).`) },

    { h2: 'Server-Protokolle beim Aufruf', html:
      p('Die Seite wird über Netlify (Netlify, Inc.) ausgeliefert. Beim Abruf fallen dort technisch notwendige Protokolldaten an (IP-Adresse, Zeitpunkt, angefragte Adresse, Browserkennung). Diese Verarbeitung ist zum Betrieb der Seite erforderlich; Rechtsgrundlage ist das berechtigte Interesse an einer funktionsfähigen Auslieferung (Art. 6 Abs. 1 lit. f DSGVO). Eine Zusammenführung mit anderen Daten oder eine Auswertung zu Analysezwecken findet nicht statt.') },

    { h2: 'Was im Browser gespeichert wird', html:
      p('Alle folgenden Einträge liegen ausschließlich lokal in Ihrem Gerät (localStorage bzw. Browser-Cache). Sie werden <strong>nicht an uns oder an Dritte übertragen</strong> und lassen sich jederzeit über die Browser-Einstellungen löschen.') +
      storageBlocks },

    { h2: 'Standort', html:
      p('Die Standortermittlung wird <strong>nur auf ausdrückliche Aktion</strong> gestartet („Mein Standort"). Der Browser fragt Sie dabei um Erlaubnis. Die Koordinaten werden lokal verarbeitet, um die Vorhersage für den Ort zu berechnen; sie werden zur Ortsauflösung an OpenStreetMap/Nominatim und zur Datenabfrage an die genannten Wetterdienste übermittelt. Eine Speicherung des Standorts bei uns findet nicht statt.') },

    { h2: 'Benachrichtigungen', html:
      p('Sie können sich Hinweise (z. B. zu Gewitter oder Frost) einrichten. Die Auswertung erfolgt derzeit <strong>ausschließlich lokal, solange die Seite geöffnet ist</strong> — es gibt keinen Versand-Server und damit keine Übertragung Ihrer Schwellenwerte oder Orte an uns. Wenn Sie Benachrichtigungen erlauben, betrifft das nur die Anzeige durch Ihren Browser.') },

    { h2: 'Kontaktierte Dienste', html:
      p('Die folgende Liste ist vollständig und wird bei Änderungen am Programmcode gepflegt. Welche Dienste tatsächlich kontaktiert werden, hängt davon ab, welche Funktionen Sie benutzen.') +
      hostBlocks +
      p('<strong>Open-Meteo</strong> wird nur nach ausdrücklicher Zustimmung im jeweiligen Bereich abgefragt; ohne Zustimmung unterbleibt der Abruf.') },

    { h2: 'Ihre Rechte', html:
      p('Sie haben das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung sowie auf Datenübertragbarkeit und Widerspruch. Da wir keine Benutzerkonten führen und keine personenbezogenen Profile speichern, beschränkt sich eine Auskunft in aller Regel auf die oben genannten Server-Protokolle. Wenden Sie sich dafür an ' +
        `<a href="mailto:${OPERATOR.email}">${OPERATOR.email}</a>. Ihnen steht außerdem ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde zu.`) },

    { h2: 'Änderungen', html:
      p('Diese Erklärung beschreibt den Stand der Anwendung. Wird eine Funktion ergänzt, die neue Daten verarbeitet, wird die Erklärung vorher angepasst.') },
  ];
}

function kontaktSections() {
  return [
    { h2: 'So erreichen Sie uns', html:
      p(`Für Fragen, Fehlermeldungen und Hinweise zu den Wetterdaten: <a href="mailto:${OPERATOR.email}">${OPERATOR.email}</a>.`) +
      p('Rückmeldungen zu einer konkreten Ansicht schickst du am besten mit dem Link aus der Adresszeile — darin stecken Ort, Ebenen und Zeitpunkt.') },
    { h2: 'Was wir nicht leisten können', html:
      p('buscosun ist kein amtlicher Dienst. Wir geben <strong>keine</strong> individuellen Wetterberatungen, keine Freigaben für sicherheitsrelevante Vorhaben und keine Auskünfte mit Gewährleistung. Für amtliche Warnungen sind der Deutsche Wetterdienst, GeoSphere Austria und MeteoSchweiz zuständig.') },
    { h2: 'Rechtliches', html:
      ul(['<a href="/impressum/">Impressum</a>', '<a href="/datenschutz/">Datenschutzerklärung</a>']) },
  ];
}

/** Die drei Rechtsseiten. `noindex: false` — ein Impressum muss auffindbar sein. */
export const LEGAL_PAGES = [
  {
    slug: 'impressum',
    title: 'Impressum',
    h1: 'Impressum',
    description: 'Anbieterkennzeichnung und Kontakt für buscosun — Wetter für Deutschland, Österreich und die Schweiz.',
    lead: 'Angaben nach § 5 Digitale-Dienste-Gesetz (DDG).',
    get sections() { return impressumSections(); },
  },
  {
    slug: 'datenschutz',
    title: 'Datenschutzerklärung',
    h1: 'Datenschutz',
    description: 'Was buscosun speichert (fast nichts), welche Server kontaktiert werden und warum es keine Cookies, kein Tracking und keine Konten gibt.',
    lead: 'Keine Cookies, kein Tracking, keine Konten — und hier steht nachprüfbar, was das konkret bedeutet.',
    get sections() { return datenschutzSections(); },
  },
  {
    slug: 'kontakt',
    title: 'Kontakt',
    h1: 'Kontakt',
    description: 'Kontaktmöglichkeit für Fragen, Fehlermeldungen und Hinweise zu buscosun.',
    lead: 'Fragen, Fehler, Datenlücken — Rückmeldungen sind willkommen.',
    get sections() { return kontaktSections(); },
  },
];
