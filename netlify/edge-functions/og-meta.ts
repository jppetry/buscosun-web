/**
 * Netlify Edge Function — **Vorschau-Meta je geteiltem Zustand** (Phase SH6,
 * Teil 4 von Jans Auftrag „Auswahl teilen"). Freigegeben von Jan am 2026-09-09
 * (Entscheidung E-6; Edge Functions sind laut `CLAUDE.md` STOPP-&-FRAGEN-Zone).
 *
 * ── Das Problem, das sie löst ───────────────────────────────────────────────
 * WhatsApp, Gmail, Slack und Co. holen die Seite mit einem Crawler, der **kein
 * JavaScript ausführt**. Alles, was `RouteMeta.tsx` im Browser in den `<head>`
 * schreibt, sieht dieser Crawler nie. Er sieht die statische Shell — und die
 * kennt nur die Route, nicht den geteilten Zustand. Ein Link auf die Windkarte
 * von München um 17 Uhr zeigte deshalb dieselbe Vorschau wie jeder andere
 * Wetterkarten-Link.
 *
 * ── Was sie tut ─────────────────────────────────────────────────────────────
 * Für **Crawler** (und nur für die) holt sie die Shell wie bisher und tauscht
 * im `<head>` `og:title`, `og:description`, `og:url`, `og:image` und die
 * `twitter:*`-Entsprechungen gegen die Beschreibung des Zustands aus. Titel und
 * Beschreibung kommen aus **demselben** `describeShareUrl`, das auch das
 * Share-Sheet im Browser benutzt (Jans Vorgabe: eine Parser-Implementierung,
 * kein zweiter Parser). Technisch liegt sie als gebündeltes Artefakt in
 * `netlify/edge-shared/shareParser.js`, weil Deno an jedem Import eine
 * Datei-Endung verlangt; `verify:share` erzwingt, dass das Bündel zur Quelle
 * passt. Die **Typen** dazu kommen aus `shareParser.d.ts`, das nichts weiter
 * tut als `export * from '../../src/share/edgeShare.ts'` — auch der Typvertrag
 * hat damit nur eine Quelle.
 *
 * ── Was sie NICHT tut ───────────────────────────────────────────────────────
 *  · **Kein Nutzer bekommt eine andere Antwort.** Ist der User-Agent kein
 *    bekannter Crawler, kehrt die Funktion sofort zurück (`return`) — ohne die
 *    Shell zu lesen, ohne den Parser zu laden, ohne ein Byte zu ändern. Der
 *    dynamische Import steht deshalb IM Crawler-Zweig: der kritische Renderpfad
 *    lädt die 51 KB Parser nie (Jans Vorgabe „darf den Renderpfad nicht
 *    belasten" — dieselbe Regel wie beim Teilen-Knopf im Client).
 *  · **Kein Bild wird zur Laufzeit gerendert.** Das Vorschaubild ist eine der
 *    50 statischen Karten aus `public/og/app/` (Stufe 1). Ein dynamisch
 *    gerendertes Bild wäre Stufe 2 und eine eigene Phase.
 *  · **Kein Zustand auf dem Server, kein Tracking.** Sie liest die URL, sonst
 *    nichts: keine Cookies, kein Speicher, keine Weitergabe.
 *
 * ── Warum KEIN `durable`-Cache (Abweichung von §7.4 des Plans) ──────────────
 * Der Plan sah `Netlify-CDN-Cache-Control: durable` vor, damit der zweite
 * Crawler-Zugriff keine Funktion kostet. Beim Bauen fiel auf: die Antwort hängt
 * am **User-Agent** — Crawler bekommen andere Meta-Tags als Menschen. Eine
 * gecachte Antwort ohne exakt passendes `Vary` kann die Crawler-Fassung an
 * Menschen ausliefern (oder umgekehrt), und `Vary: User-Agent` zersplittert den
 * Cache ohnehin in fast so viele Einträge wie es Crawler-Versionen gibt. Der
 * Gewinn wäre klein, das Risiko eine falsche Auslieferung. Also: kein durable
 * Cache, dafür ein kurzer Browser-Cache und ein ehrliches `Vary`.
 */

/**
 * Bekannte Vorschau-Crawler. Bewusst eine feste Liste statt „alles, was kein
 * Browser ist": ein unbekannter Bot bekommt dann eben die Shell wie bisher —
 * das ist der sichere Ausgang, nicht der falsche.
 */
const CRAWLERS = /facebookexternalhit|facebookcatalog|WhatsApp|Twitterbot|Slackbot|LinkedInBot|TelegramBot|Discordbot|Googlebot|bingbot|Applebot|redditbot|Pinterest|SkypeUriPreview|vkShare|Iframely|embedly|Mastodon|Bluesky|SignalBot|Threads|XING|OpenGraph|Yeti|DuckDuckBot|Qwantify|PetalBot|Google-InspectionTool/i;

/** Nur diese Meta-Tags werden angefasst. Alles andere in der Shell bleibt. */
interface MetaPatch { attr: 'property' | 'name'; key: string; value: string }

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Ersetzt den `content` eines vorhandenen Meta-Tags; fehlt es, wird es vor
 * `</head>` eingefügt. Regex statt HTML-Parser ist hier vertretbar, weil die
 * Shell aus dem eigenen Generator kommt (`scripts/seo/content.mjs`) und die
 * Form der Tags dort festgelegt ist — der Verifier prüft beides gegeneinander.
 */
function patchHead(html: string, patches: MetaPatch[]): string {
  let out = html;
  for (const p of patches) {
    const re = new RegExp(`(<meta\\s+${p.attr}="${p.key}"\\s+content=")[^"]*(")`, 'i');
    const tag = `<meta ${p.attr}="${p.key}" content="${escapeAttr(p.value)}" />`;
    out = re.test(out)
      ? out.replace(re, `$1${escapeAttr(p.value)}$2`)
      : out.replace(/<\/head>/i, `    ${tag}\n  </head>`);
  }
  return out;
}

export default async function ogMeta(
  request: Request,
  context: { next: () => Promise<Response> },
): Promise<Response | undefined> {
  // 1. Der Nutzerpfad endet hier — vor jedem Import, vor jedem Lesen.
  const ua = request.headers.get('user-agent') ?? '';
  if (!CRAWLERS.test(ua)) return;

  const url = new URL(request.url);

  // 2. Absurd lange Links bekommen die Shell unverändert. Der Deckel ist
  //    derselbe, den der Client beim Teilen meldet (`SHARE_URL_HARD_MAX`).
  const res = await context.next();
  const type = res.headers.get('content-type') ?? '';
  if (res.status !== 200 || !type.includes('text/html')) return res;

  try {
    const share = await import('../edge-shared/shareParser.js');
    if (url.href.length > share.SHARE_URL_HARD_MAX) return res;

    const now = Date.now();
    const state = share.parseShareUrl(url.pathname, url.search, now);
    // Keine teilbare Route (z. B. `/tourenplanung`) ⇒ nichts anfassen.
    if (!state) return res;

    // Zeitzone ausdrücklich: die Funktion läuft in UTC, das Produkt ist DACH.
    const copy = share.describeShareState(state, 'Europe/Berlin');
    const card = share.ogCardForShare(state);
    const image = share.SITE_URL + (card ?? '/og/home.png');
    const canonicalUrl = share.SITE_URL + url.pathname + url.search;

    const patched = patchHead(await res.text(), [
      { attr: 'property', key: 'og:title', value: `${copy.title} | buscosun` },
      { attr: 'property', key: 'og:description', value: copy.description },
      { attr: 'property', key: 'og:url', value: canonicalUrl },
      { attr: 'property', key: 'og:image', value: image },
      { attr: 'property', key: 'og:image:width', value: '1200' },
      { attr: 'property', key: 'og:image:height', value: '630' },
      { attr: 'name', key: 'twitter:title', value: `${copy.title} | buscosun` },
      { attr: 'name', key: 'twitter:description', value: copy.description },
      { attr: 'name', key: 'twitter:image', value: image },
      { attr: 'name', key: 'twitter:card', value: 'summary_large_image' },
    ]);

    const headers = new Headers(res.headers);
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('cache-control', 'public, max-age=300');
    headers.set('vary', 'User-Agent');
    // Beleg für die Gate-Prüfung per curl — nennt den kanonisierten Schlüssel,
    // unter dem Stufe 2 später ein Bild ablegen würde.
    headers.set('x-buscosun-og', share.canonicalShareKey(state));
    headers.delete('content-length');
    return new Response(patched, { status: 200, headers });
  } catch {
    // Ein Fehler hier darf NIE eine Seite kosten: dann eben die Shell wie
    // bisher, mit der Karte der Route. Eine generische Vorschau ist ein
    // kleiner Verlust, eine kaputte Seite ein großer.
    return res;
  }
}

/**
 * Datei-basierte Konfiguration (Muster `firms.ts`) — **kein**
 * `netlify.toml`-Eingriff. Nur die neun teilbaren Seiten; jede Route braucht
 * zwei Einträge, weil `/wetterkarte/*` den nackten Pfad `/wetterkarte` nicht
 * trifft. Alles andere (Start, Assets, `/wetter/…`, `/wissen/…`) läuft an
 * dieser Funktion vorbei und wird nicht einmal ausgewertet.
 */
export const config = {
  path: [
    '/wetterkarte', '/wetterkarte/*',
    '/warnungen', '/warnungen/*',
    '/regenradar', '/regenradar/*',
    '/vorhersage', '/vorhersage/*',
    '/waldbrand', '/waldbrand/*',
    '/atmosphaere', '/atmosphaere/*',
    '/eventplanung', '/eventplanung/*',
    '/wetterarchiv', '/wetterarchiv/*',
    '/globus',
  ],
};
