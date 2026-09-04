/**
 * Kuratierte DACH-Ortsliste für die programmatischen Geo-Landingpages.
 *
 * Build-only (reines Node-ESM, NICHT im App-/tsc-Graph). Koordinaten sind
 * Ortszentren (gerundet, ~Stadtmitte), Höhe in m ü. NN/M (Richtwert). Bewusst
 * kuratiert & differenziert — kein Thin-Page-Spam. Erweiterbar.
 *
 * Felder: name, region (Bundesland/Kanton), country (DE|AT|CH), lat, lon, ele.
 * slug wird abgeleitet (ae/oe/ue/ss, kebab).
 */

/** Letzte inhaltliche Änderung der Ortsliste/-texte (Sitemap-lastmod, SEO/GEO 2026 E1). */
export const PLACES_UPDATED = '2026-06-09';

export function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// [name, region, lat, lon, ele]
const DE = [
  ['Berlin', 'Berlin', 52.520, 13.405, 34],
  ['Hamburg', 'Hamburg', 53.551, 9.993, 6],
  ['München', 'Bayern', 48.137, 11.575, 519],
  ['Köln', 'Nordrhein-Westfalen', 50.938, 6.960, 37],
  ['Frankfurt am Main', 'Hessen', 50.110, 8.682, 112],
  ['Stuttgart', 'Baden-Württemberg', 48.776, 9.183, 247],
  ['Düsseldorf', 'Nordrhein-Westfalen', 51.228, 6.773, 38],
  ['Leipzig', 'Sachsen', 51.340, 12.375, 113],
  ['Dortmund', 'Nordrhein-Westfalen', 51.514, 7.466, 86],
  ['Essen', 'Nordrhein-Westfalen', 51.456, 7.012, 116],
  ['Bremen', 'Bremen', 53.079, 8.802, 11],
  ['Dresden', 'Sachsen', 51.051, 13.738, 113],
  ['Hannover', 'Niedersachsen', 52.376, 9.733, 55],
  ['Nürnberg', 'Bayern', 49.452, 11.077, 309],
  ['Duisburg', 'Nordrhein-Westfalen', 51.434, 6.762, 33],
  ['Bochum', 'Nordrhein-Westfalen', 51.482, 7.216, 100],
  ['Wuppertal', 'Nordrhein-Westfalen', 51.256, 7.150, 160],
  ['Bielefeld', 'Nordrhein-Westfalen', 52.030, 8.532, 118],
  ['Bonn', 'Nordrhein-Westfalen', 50.737, 7.098, 60],
  ['Münster', 'Nordrhein-Westfalen', 51.961, 7.626, 60],
  ['Karlsruhe', 'Baden-Württemberg', 49.007, 8.404, 115],
  ['Mannheim', 'Baden-Württemberg', 49.488, 8.466, 97],
  ['Augsburg', 'Bayern', 48.371, 10.898, 494],
  ['Wiesbaden', 'Hessen', 50.083, 8.240, 115],
  ['Mainz', 'Rheinland-Pfalz', 49.992, 8.247, 89],
  ['Kiel', 'Schleswig-Holstein', 54.323, 10.122, 5],
  ['Lübeck', 'Schleswig-Holstein', 53.866, 10.685, 13],
  ['Rostock', 'Mecklenburg-Vorpommern', 54.092, 12.099, 14],
  ['Freiburg im Breisgau', 'Baden-Württemberg', 47.999, 7.842, 278],
  ['Erfurt', 'Thüringen', 50.984, 11.029, 194],
  ['Magdeburg', 'Sachsen-Anhalt', 52.121, 11.627, 55],
  ['Saarbrücken', 'Saarland', 49.240, 6.997, 230],
  ['Potsdam', 'Brandenburg', 52.391, 13.064, 32],
  ['Regensburg', 'Bayern', 49.013, 12.102, 337],
  ['Ingolstadt', 'Bayern', 48.766, 11.425, 374],
  ['Würzburg', 'Bayern', 49.792, 9.953, 177],
  ['Heidelberg', 'Baden-Württemberg', 49.398, 8.672, 114],
  ['Ulm', 'Baden-Württemberg', 48.401, 9.987, 478],
  ['Kassel', 'Hessen', 51.312, 9.480, 167],
  ['Osnabrück', 'Niedersachsen', 52.279, 8.047, 64],
  ['Oldenburg', 'Niedersachsen', 53.144, 8.214, 4],
  ['Trier', 'Rheinland-Pfalz', 49.750, 6.638, 137],
  ['Konstanz', 'Baden-Württemberg', 47.660, 9.176, 405],
  ['Garmisch-Partenkirchen', 'Bayern', 47.492, 11.096, 708],
  ['Berchtesgaden', 'Bayern', 47.630, 13.004, 573],
  ['Oberstdorf', 'Bayern', 47.410, 10.279, 813],
  ['Mittenwald', 'Bayern', 47.444, 11.262, 912],
  ['Füssen', 'Bayern', 47.571, 10.702, 808],
  ['Sylt (Westerland)', 'Schleswig-Holstein', 54.907, 8.305, 5],
  ['Norderney', 'Niedersachsen', 53.707, 7.155, 4],
  ['Cuxhaven', 'Niedersachsen', 53.858, 8.693, 3],
  ['Garmisch Zugspitze', 'Bayern', 47.421, 10.985, 2962],
  ['Brocken', 'Sachsen-Anhalt', 51.799, 10.615, 1141],
  ['Feldberg (Schwarzwald)', 'Baden-Württemberg', 47.874, 8.004, 1493],
  ['Görlitz', 'Sachsen', 51.156, 14.989, 201],
  ['Flensburg', 'Schleswig-Holstein', 54.792, 9.437, 18],
  ['Passau', 'Bayern', 48.567, 13.431, 300],
  ['Bamberg', 'Bayern', 49.892, 10.886, 262],
];

const AT = [
  ['Wien', 'Wien', 48.208, 16.373, 171],
  ['Graz', 'Steiermark', 47.071, 15.439, 353],
  ['Linz', 'Oberösterreich', 48.306, 14.286, 266],
  ['Salzburg', 'Salzburg', 47.811, 13.055, 424],
  ['Innsbruck', 'Tirol', 47.269, 11.404, 574],
  ['Klagenfurt', 'Kärnten', 46.624, 14.308, 446],
  ['Villach', 'Kärnten', 46.611, 13.856, 501],
  ['Wels', 'Oberösterreich', 48.157, 14.024, 317],
  ['Sankt Pölten', 'Niederösterreich', 48.204, 15.625, 267],
  ['Dornbirn', 'Vorarlberg', 47.413, 9.744, 437],
  ['Bregenz', 'Vorarlberg', 47.503, 9.747, 427],
  ['Wiener Neustadt', 'Niederösterreich', 47.814, 16.242, 265],
  ['Steyr', 'Oberösterreich', 48.038, 14.420, 310],
  ['Feldkirch', 'Vorarlberg', 47.239, 9.598, 458],
  ['Wolfsberg', 'Kärnten', 46.840, 14.844, 463],
  ['Leoben', 'Steiermark', 47.382, 15.094, 541],
  ['Krems an der Donau', 'Niederösterreich', 48.410, 15.614, 203],
  ['Kufstein', 'Tirol', 47.583, 12.169, 499],
  ['Zell am See', 'Salzburg', 47.323, 12.795, 757],
  ['Sankt Anton am Arlberg', 'Tirol', 47.130, 10.264, 1304],
  ['Ischgl', 'Tirol', 47.011, 10.292, 1377],
  ['Sölden', 'Tirol', 46.967, 11.008, 1368],
  ['Obergurgl', 'Tirol', 46.867, 11.026, 1930],
  ['Kitzbühel', 'Tirol', 47.446, 12.392, 762],
  ['Mayrhofen', 'Tirol', 47.166, 11.868, 633],
  ['Lech am Arlberg', 'Vorarlberg', 47.208, 10.143, 1450],
  ['Bad Gastein', 'Salzburg', 47.115, 13.134, 1002],
  ['Schladming', 'Steiermark', 47.394, 13.687, 745],
  ['Saalbach', 'Salzburg', 47.390, 12.636, 1003],
  ['Seefeld in Tirol', 'Tirol', 47.329, 11.188, 1180],
  ['Hallstatt', 'Oberösterreich', 47.562, 13.649, 511],
  ['Bad Ischl', 'Oberösterreich', 47.711, 13.623, 468],
  ['Eisenstadt', 'Burgenland', 47.846, 16.524, 159],
  ['Bruck an der Mur', 'Steiermark', 47.410, 15.272, 491],
  ['Spittal an der Drau', 'Kärnten', 46.795, 13.499, 554],
  ['Lienz', 'Tirol', 46.829, 12.769, 673],
  ['Imst', 'Tirol', 47.239, 10.738, 828],
  ['Landeck', 'Tirol', 47.139, 10.566, 816],
  ['Zell am Ziller', 'Tirol', 47.232, 11.884, 575],
  ['Gmunden', 'Oberösterreich', 47.918, 13.799, 425],
];

const CH = [
  ['Zürich', 'Zürich', 47.377, 8.541, 408],
  ['Genf', 'Genf', 46.204, 6.143, 375],
  ['Basel', 'Basel-Stadt', 47.560, 7.588, 260],
  ['Bern', 'Bern', 46.948, 7.447, 540],
  ['Lausanne', 'Waadt', 46.520, 6.633, 495],
  ['Winterthur', 'Zürich', 47.500, 8.724, 439],
  ['Luzern', 'Luzern', 47.050, 8.305, 436],
  ['Sankt Gallen', 'Sankt Gallen', 47.424, 9.377, 670],
  ['Lugano', 'Tessin', 46.004, 8.951, 273],
  ['Biel/Bienne', 'Bern', 47.137, 7.247, 434],
  ['Thun', 'Bern', 46.758, 7.628, 560],
  ['Köniz', 'Bern', 46.924, 7.415, 560],
  ['La Chaux-de-Fonds', 'Neuenburg', 47.100, 6.826, 992],
  ['Freiburg (Fribourg)', 'Freiburg', 46.806, 7.162, 610],
  ['Schaffhausen', 'Schaffhausen', 47.697, 8.635, 403],
  ['Chur', 'Graubünden', 46.851, 9.532, 593],
  ['Neuenburg (Neuchâtel)', 'Neuenburg', 46.992, 6.931, 430],
  ['Sitten (Sion)', 'Wallis', 46.233, 7.359, 491],
  ['Zug', 'Zug', 47.166, 8.516, 425],
  ['Davos', 'Graubünden', 46.803, 9.836, 1560],
  ['Sankt Moritz', 'Graubünden', 46.498, 9.838, 1822],
  ['Zermatt', 'Wallis', 46.021, 7.749, 1608],
  ['Interlaken', 'Bern', 46.686, 7.863, 567],
  ['Grindelwald', 'Bern', 46.624, 8.034, 1034],
  ['Verbier', 'Wallis', 46.096, 7.228, 1500],
  ['Arosa', 'Graubünden', 46.783, 9.679, 1775],
  ['Engelberg', 'Obwalden', 46.821, 8.405, 1015],
  ['Locarno', 'Tessin', 46.171, 8.799, 196],
  ['Bellinzona', 'Tessin', 46.195, 9.024, 230],
  ['Andermatt', 'Uri', 46.636, 8.594, 1437],
  ['Saas-Fee', 'Wallis', 46.108, 7.927, 1800],
  ['Crans-Montana', 'Wallis', 46.308, 7.481, 1500],
  ['Wengen', 'Bern', 46.605, 7.922, 1274],
  ['Gstaad', 'Bern', 46.473, 7.286, 1050],
  ['Montreux', 'Waadt', 46.431, 6.911, 395],
  ['Brig', 'Wallis', 46.319, 7.988, 678],
  ['Scuol', 'Graubünden', 46.797, 10.300, 1244],
  ['Flims', 'Graubünden', 46.837, 9.285, 1081],
  ['Adelboden', 'Bern', 46.493, 7.560, 1353],
  ['Pontresina', 'Graubünden', 46.491, 9.899, 1805],
];

function build(rows, country) {
  return rows.map(([name, region, lat, lon, ele]) => ({
    slug: toSlug(name), name, region, country, lat, lon, ele,
  }));
}

export const PLACES = [...build(DE, 'DE'), ...build(AT, 'AT'), ...build(CH, 'CH')];

/** Distanz (km, Haversine grob) — für Nachbar-Verlinkung. */
function distKm(a, b) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** N nächste Nachbarorte (für interne Verlinkung). */
export function nearestPlaces(place, n = 5) {
  return PLACES
    .filter((p) => p.slug !== place.slug)
    .map((p) => ({ p, d: distKm(place, p) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => ({ ...x.p, distKm: Math.round(x.d) }));
}
