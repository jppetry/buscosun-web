/**
 * Event-/Wetterlage-Artikel (build-only, reines Node-ESM).
 *
 * Zeitbezogene Beiträge unter /wetterlage/<slug>/ für Google Discover / News.
 * Vorlage + Beispielartikel. Echte Ereignisartikel ergänzt die Redaktion bei
 * markanten Wetterlagen (siehe checklist.md „Event-Content-Checkliste").
 *
 * REGELN: akkurat, nie amtliche Warnungen implizieren, gesamter Text im rohen
 * HTML, Attribution DWD. Hero-Bild >= 1200px Breite.
 *
 * Felder: slug, title (Headline, nicht-clickbait), ogTitle (separat optimiert),
 * h1, dek (Lead 40–60 W), datePublished, dateModified, hero {url,w,h,alt},
 * sections [{id,h2,html}], relatedPlaces (slugs), relatedExplainers (slugs),
 * section (Ressort), status.
 */

export const EVENTS = [
  {
    slug: 'omega-lage-mitteleuropa',
    title: 'Omega-Lage: Warum das Wetter tagelang stehen bleibt',
    ogTitle: 'Omega-Lage erklärt: stabiles Wetter über Mitteleuropa',
    h1: 'Omega-Lage: Warum das Wetter tagelang stehen bleibt',
    section: 'Wetterlage',
    status: 'full',
    datePublished: '2026-06-26',
    dateModified: '2026-06-26',
    hero: { url: '/og/omega-lage-mitteleuropa.png', w: 1200, h: 630, alt: 'buscosun — Wetterlage über Mitteleuropa' },
    dek:
      'Eine Omega-Lage ist ein blockierendes Hochdruckgebiet, dessen Strömungsmuster im Höhenwind dem ' +
      'griechischen Buchstaben Ω gleicht. Sie sorgt über Mitteleuropa für tagelang beständiges, oft sonnig-warmes ' +
      'Wetter, während es an ihren Flanken wiederholt regnet. Solche Lagen sind besonders stabil und ändern sich nur langsam.',
    sections: [
      {
        id: 'was',
        h2: 'Was eine Omega-Lage ist',
        html:
          '<p>Bei einer <strong>Omega-Lage</strong> liegt ein kräftiges Hochdruckgebiet zwischen zwei ' +
          'Tiefdruckgebieten. Im Höhenströmungsbild bildet sich dadurch ein Muster, das dem griechischen ' +
          'Buchstaben <strong>Ω (Omega)</strong> ähnelt. Das Hoch in der Mitte „blockiert" die übliche ' +
          'Westströmung, sodass Tiefs nicht durchziehen, sondern an den Rändern festhängen.</p>',
      },
      {
        id: 'wetter',
        h2: 'Welches Wetter sie bringt',
        html:
          '<p>Unter dem zentralen Hoch bleibt es meist <strong>trocken, sonnig und je nach Jahreszeit warm oder ' +
          'kalt</strong>. An den beiden Tiefdruckflanken — oft über Westeuropa und Osteuropa — fällt dagegen ' +
          'wiederholt Regen. Weil das Muster blockiert ist, kann dieselbe Wetterlage <strong>mehrere Tage bis ' +
          'über eine Woche</strong> andauern. Im Sommer begünstigt das Hitzeperioden, im Winter kann es unter ' +
          'einer <a href="/wissen/temperaturinversion/">Inversion</a> für zähen Hochnebel sorgen.</p>',
      },
      {
        id: 'buscosun',
        h2: 'Eine Omega-Lage in buscosun erkennen',
        html:
          '<p>Im <a href="/funktionen/modellvergleich/">Modellvergleich</a> zeigt sich eine Blockadelage daran, ' +
          'dass die Modelle über mehrere Tage ungewöhnlich einig sind — der Unsicherheits-Spread bleibt klein. ' +
          'Auf der <a href="/funktionen/wetterkarte/">Wetterkarte</a> lässt sich das stabile Hoch über die ' +
          'Wolken- und Windlayer verfolgen. Hinweis: buscosun ordnet die Wetterlage ein und gibt keine amtlichen ' +
          'Warnungen heraus — diese veröffentlicht ausschließlich der Wetterdienst.</p>',
      },
    ],
    relatedPlaces: ['muenchen', 'berlin', 'wien', 'zuerich'],
    relatedExplainers: ['temperaturinversion', 'modellvergleich-unsicherheit', 'gewitter-unwetter'],
  },
];

export const EVENTS_BY_SLUG = Object.fromEntries(EVENTS.map((e) => [e.slug, e]));
