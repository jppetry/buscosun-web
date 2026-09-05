/**
 * Eigentumsnachweis für Webmaster-Werkzeuge (SEO/GEO 2026, E10c). Build-only.
 *
 * Search Console und Bing wollen wissen, dass die Domain dir gehört. Der bequemste Weg ohne
 * DNS-Zugang ist ein Meta-Tag auf der Startseite. Damit das nicht in einer generierten Datei
 * verloren geht, steht der Wert HIER — eintragen, `npm run build`, pushen, im Werkzeug auf
 * „Bestätigen" klicken. Leere Werte erzeugen kein Tag.
 *
 * Der bessere, aber aufwendigere Weg bleibt die **Domain-Property per DNS-TXT**: Sie deckt
 * alle Subdomains und beide Protokolle ab und überlebt jede Umstellung der Seite. Ein
 * Meta-Tag gilt nur für die URL-Präfix-Property `https://buscosun.com/` — das reicht für
 * Berichte und Sitemap-Einreichung vollkommen.
 *
 * Beide Tags dürfen dauerhaft stehen bleiben; sie verraten nichts und kosten nichts.
 */

/** Token aus der Search Console: Property hinzufügen → URL-Präfix → HTML-Tag. Nur der `content`-Wert. */
export const GOOGLE_SITE_VERIFICATION = '';

/** Token aus den Bing Webmaster Tools: Meta-Tag-Methode, nur der `content`-Wert von `msvalidate.01`. */
export const BING_SITE_VERIFICATION = '';

/** Meta-Tags für den Kopf der Startseite (leer, solange nichts eingetragen ist). */
export function verificationMetaTags() {
  const tags = [];
  if (GOOGLE_SITE_VERIFICATION) tags.push(`<meta name="google-site-verification" content="${GOOGLE_SITE_VERIFICATION}" />`);
  if (BING_SITE_VERIFICATION) tags.push(`<meta name="msvalidate.01" content="${BING_SITE_VERIFICATION}" />`);
  return tags;
}
