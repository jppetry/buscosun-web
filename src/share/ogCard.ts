/**
 * SH6 — welches Vorschaubild zu welcher App-Seite gehört (rein, importfrei).
 *
 * ── Warum eine Ableitung statt 49 Literale in `routes.ts` ───────────────────
 * §8 des Plans sah `ogImage` je Route UND je Sub-Route in der Routen-Tabelle
 * vor. Beim Bauen war das der schlechtere Weg: 49 handgepflegte Pfade, die
 * niemand gegen den Bestand prüft, und zwei Felder (`RouteMeta.ogImage`,
 * `SubRoute.ogImage`), von denen das zweite **nie jemand geschrieben hat** —
 * genau das Muster, das V-SH-11 gerade aus `fireState.ts` entfernt hat.
 *
 * Stattdessen: EINE Regel, die vier Stellen benutzen —
 *   1. `scripts/render-og-app-cards.mjs`  erzeugt die PNGs,
 *   2. `scripts/seo/content.mjs`          schreibt sie in die Route-Shells,
 *   3. `netlify/edge-functions/og-meta.ts` setzt sie je geteiltem Zustand,
 *   4. `scripts/verify-share.mjs`         prüft, dass jede Datei existiert.
 * Fehlt eine Karte, fällt der Verifier — nicht der Crawler auf ein 404-Bild.
 *
 * ── Optik (Jans Entscheidung E-5, 2026-09-09) ───────────────────────────────
 * Heller Rahmen in Sand/Ink wie die 74 Inhaltskarten, **dunkles Kartenfeld**
 * (`--nc-radarbg #0B1016`) rechts — dieselbe Ordnung wie die Decks der App.
 * Akzent und Motiv kommen aus der Tabelle unten; das Motiv sagt, was die Seite
 * zeigt (Isolinien, Radarringe, Warndreieck, …), damit die 49 Karten nicht
 * dieselbe Karte mit anderem Text sind.
 *
 * Importfrei wie `placeSlug.ts`: `routes.ts` darf diese Datei benutzen, ohne
 * dass ein Zyklus entsteht.
 */

/** Ordner der App-Karten — bewusst getrennt von den 74 Inhaltskarten in `/og/`. */
export const OG_APP_DIR = '/og/app';

/** Maße jeder Karte (Open-Graph-Standard). */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export interface OgCardStyle {
  /** Zeile über dem Titel. */
  eyebrow: string;
  /** Akzentfarbe (Balken, Eyebrow, Motiv). */
  accent: string;
  /** Motiv im dunklen Kartenfeld (`_og-app-card.html`). */
  motif: 'karte' | 'radar' | 'warn' | 'punkt' | 'feuer' | 'luft' | 'event' | 'archiv' | 'globus' | 'route' | 'text';
}

/**
 * Welche Routen eine eigene Karte haben — nur die Namen.
 *
 * Getrennt von `OG_CARD_STYLE`, und zwar aus einem gemessenen Grund: `routes.ts`
 * ist **eager** (Start-Chunk) und braucht von hier nur `ogCardPath`. Läse
 * `hasOgCard` die Schlüssel der Stil-Tabelle, zöge Rollup Akzente, Motive und
 * Eyebrows in den Start-Chunk — 0,3 KB gzip für Werte, die nur der Renderer
 * braucht. Damit die zwei Listen nicht auseinanderlaufen, prüft `verifyOgCard()`
 * sie gegeneinander.
 */
export const OG_CARD_ROUTES: readonly string[] = [
  'wetterkarte', 'warnungen', 'regenradar', 'vorhersage', 'tourenplanung',
  'eventplanung', 'wetterarchiv', 'atmosphaere', 'globus', 'waldbrand',
  'feedback', 'validierung',
];

/**
 * Je App-Route: Akzent und Motiv. Die Farben sind Design-Token
 * (`src/designTokens.css`), keine neuen Werte. Wird NUR vom Kartenrenderer
 * gelesen — nie im Browser.
 */
export const OG_CARD_STYLE: Readonly<Record<string, OgCardStyle>> = {
  wetterkarte:   { eyebrow: 'Wetterkarte',   accent: '#C97B47', motif: 'karte' },   // terracotta-500
  warnungen:     { eyebrow: 'Amtliche Warnungen', accent: '#B4552F', motif: 'warn' },
  regenradar:    { eyebrow: 'Regenradar',    accent: '#3A6FA8', motif: 'radar' },   // steel-600
  vorhersage:    { eyebrow: 'Vorhersage',    accent: '#3A6FA8', motif: 'punkt' },
  tourenplanung: { eyebrow: 'Tourenplanung', accent: '#7A9466', motif: 'route' },   // sage-600
  eventplanung:  { eyebrow: 'Event-Planung', accent: '#7A9466', motif: 'event' },
  wetterarchiv:  { eyebrow: 'Wetterarchiv',  accent: '#8B7355', motif: 'archiv' },  // stone-500
  atmosphaere:   { eyebrow: 'Atmosphäre',    accent: '#3A6FA8', motif: 'luft' },
  globus:        { eyebrow: '3D-Globus',     accent: '#5C5447', motif: 'globus' },  // stone-600
  waldbrand:     { eyebrow: 'Brandradar',    accent: '#A85E2E', motif: 'feuer' },   // terracotta-700
  feedback:      { eyebrow: 'Feedback',      accent: '#5C5447', motif: 'text' },
  validierung:   { eyebrow: 'Validierung',   accent: '#5C5447', motif: 'punkt' },
};

/** Fällt eine Route durch die Tabelle, ist das kein Fehler — nur die Grundfarbe. */
export const OG_CARD_FALLBACK: OgCardStyle = { eyebrow: 'buscosun', accent: '#C97B47', motif: 'karte' };

export function ogCardStyle(routeId: string): OgCardStyle {
  return OG_CARD_STYLE[routeId] ?? OG_CARD_FALLBACK;
}

/** Hat diese Route überhaupt eine eigene Karte? (Alles außer Start und 404.) */
export function hasOgCard(routeId: string | null | undefined): boolean {
  return !!routeId && OG_CARD_ROUTES.includes(routeId);
}

/**
 * Dateiname der Karte: `wetterkarte`, `wetterkarte-wind`, `waldbrand-historie`.
 * Der Sub-Slug ist schon Slug-Form (`[a-z0-9-]`), es wird nichts umkodiert.
 */
export function ogCardSlug(routeId: string, viewSlug?: string | null): string {
  return viewSlug ? `${routeId}-${viewSlug}` : routeId;
}

/**
 * Öffentlicher Pfad der Karte — oder `null`, wenn die Route keine hat
 * (Start/404 behalten `/og/home.png` aus dem Bestand).
 */
export function ogCardPath(routeId: string | null | undefined, viewSlug?: string | null): string | null {
  if (!hasOgCard(routeId)) return null;
  return `${OG_APP_DIR}/${ogCardSlug(routeId as string, viewSlug)}.png`;
}

// --- Selbstverifikation (Muster D-12; netzfrei) -------------------------------

export interface OgCardCheck { name: string; ok: boolean; detail?: string }

export function verifyOgCard(): { checks: OgCardCheck[]; passed: number; failed: number } {
  const checks: OgCardCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => { checks.push({ name, ok, detail }); };

  add('Route ohne Sicht ⇒ ein Segment', ogCardPath('wetterkarte') === '/og/app/wetterkarte.png', String(ogCardPath('wetterkarte')));
  add('Route mit Sicht ⇒ Bindestrich', ogCardPath('wetterkarte', 'wind') === '/og/app/wetterkarte-wind.png');
  add('mehrteiliger Sub-Slug bleibt unverändert', ogCardPath('waldbrand', 'aktive-braende') === '/og/app/waldbrand-aktive-braende.png');
  add('Start hat keine App-Karte (sie behält /og/home.png)', ogCardPath('home') === null);
  add('unbekannte Route hat keine Karte', ogCardPath('gibtsnicht') === null && ogCardPath(null) === null);
  add('jede Karte ist ein PNG unter /og/app/', OG_CARD_ROUTES.every((id) => ogCardPath(id)?.startsWith('/og/app/') && ogCardPath(id)?.endsWith('.png')));
  add('Namensliste und Stil-Tabelle nennen dieselben Routen (sie liegen getrennt, s. Kommentar)',
    OG_CARD_ROUTES.length === Object.keys(OG_CARD_STYLE).length
    && OG_CARD_ROUTES.every((id) => Object.prototype.hasOwnProperty.call(OG_CARD_STYLE, id)),
    `${OG_CARD_ROUTES.length} / ${Object.keys(OG_CARD_STYLE).length}`);
  add('jeder Eintrag hat Akzent in Hex-Form und ein Motiv',
    Object.values(OG_CARD_STYLE).every((s) => /^#[0-9A-F]{6}$/i.test(s.accent) && s.motif.length > 0));
  add('kein Eyebrow ist leer', Object.values(OG_CARD_STYLE).every((s) => s.eyebrow.trim().length > 2));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}
